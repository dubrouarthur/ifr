// GPS flight plan, leg sequencing, CDI scaling, holds and glidepath.
import {
  alongTrackNm,
  bearingDeg,
  crossTrackNm,
  destination,
  distanceNm,
  DEG,
  FT_PER_NM,
  norm360,
  toLocal,
  wrap180,
  type LatLon,
} from './geo';
import type { Approach, Fix, LegRole } from './types';
import { airport, approach as getApproach, runway, findFix } from './data';
import { holdEntry, holdFrame, teardropCourse, type HoldEntry } from './holding';

export interface Waypoint extends LatLon {
  ident: string;
  role?: LegRole;
  altMin?: number;
  hold?: { inbound: number; turn: 'R' | 'L'; legMin: number };
  /** waypoint belongs to the approach part of the plan */
  appr?: 'trans' | 'final' | 'missed';
  hilpt?: boolean;
  /** leg TO this waypoint is a DME arc */
  arc?: { center: LatLon & { ident: string }; radius: number; dir: 'L' | 'R' };
  /** generated procedure-turn point */
  ptPoint?: boolean;
}

export type CdiMode = 'ENR' | 'TERM' | 'APR' | 'MAPR';

export interface GpsOutput {
  valid: boolean;
  fromIdent: string;
  toIdent: string;
  dtk: number; // magnetic desired track
  xtkNm: number; // + = right of course
  dev: number; // normalised, + = fly right
  distNm: number; // to active waypoint
  bearingTo: number;
  eteMin: number | null;
  mode: CdiMode;
  fullScaleNm: number;
  toFrom: 'TO' | 'FROM';
  gpValid: boolean;
  gpDev: number; // + = fly up
  gpDistNm: number;
  holding: boolean;
  holdEntry: HoldEntry | null;
  holdPhase: 'entry-out' | 'entry-back' | 'racetrack' | null;
  /** forced turn direction for big heading changes (hold entries) */
  turnDir: 'L' | 'R' | null;
  suspended: boolean;
  approachName: string | null;
  msg: string | null;
}

const fromFix = (f: Fix, extra: Partial<Waypoint> = {}): Waypoint => ({ ident: f.ident, lat: f.lat, lon: f.lon, ...extra });

export class FlightPlan {
  wpts: Waypoint[] = [];
  /** Index of the waypoint we are flying TO */
  active = 1;
  approachId: string | null = null;
  approachActive = false;
  missedActive = false;
  /** Hold state for the waypoint at index `active` once reached */
  holdActive = false;
  holdEntryType: HoldEntry | null = null;
  private hilptArmed = false;
  holdPhase: 'entry-out' | 'entry-back' | 'racetrack' = 'racetrack';
  directFrom: LatLon | null = null;
  out: GpsOutput = {
    valid: false,
    fromIdent: '',
    toIdent: '',
    dtk: 0,
    xtkNm: 0,
    dev: 0,
    distNm: 0,
    bearingTo: 0,
    eteMin: null,
    mode: 'ENR',
    fullScaleNm: 2,
    toFrom: 'TO',
    gpValid: false,
    gpDev: 0,
    gpDistNm: 0,
    holding: false,
    holdEntry: null,
    holdPhase: null,
    turnDir: null,
    suspended: false,
    approachName: null,
    msg: null,
  };

  get approach(): Approach | null {
    return this.approachId ? getApproach(this.approachId) : null;
  }

  /** Non-published hold (ATC clearance): proceed direct to the fix and hold. */
  setHold(fix: Waypoint, inbound: number, turn: 'R' | 'L', legMin: number, from: LatLon, altFt?: number) {
    this.wpts = [{ ...fix, hold: { inbound, turn, legMin }, altMin: altFt }];
    this.active = 0;
    this.approachId = null;
    this.approachActive = false;
    this.missedActive = false;
    this.holdActive = false;
    this.holdEntryType = null;
    this.directFrom = { lat: from.lat, lon: from.lon };
  }

  setEnroute(points: Waypoint[]) {
    this.wpts = points;
    this.active = Math.min(1, points.length - 1);
    this.directFrom = null;
    this.holdActive = false;
  }

  /** Direct-To an arbitrary waypoint. Keeps the plan if the waypoint is in it. */
  directTo(target: Waypoint, from: LatLon) {
    const idx = this.wpts.findIndex((w) => w.ident === target.ident);
    this.holdActive = false;
    this.holdEntryType = null;
    if (idx >= 0) {
      this.active = idx;
    } else {
      this.wpts = [target];
      this.active = 0;
      this.approachActive = false;
      this.approachId = null;
    }
    this.directFrom = { lat: from.lat, lon: from.lon };
  }

  /** Load an approach (and optional transition) at the end of the enroute plan. */
  loadApproach(id: string, transition: string | null) {
    const ap = getApproach(id);
    // strip a previously loaded approach
    const keep = this.wpts.filter((w) => !w.appr);
    const pts: Waypoint[] = [...keep];
    const push = (w: Waypoint) => {
      if (pts.length && pts[pts.length - 1].ident === w.ident) {
        pts[pts.length - 1] = { ...pts[pts.length - 1], ...w };
      } else pts.push(w);
    };
    const tr = ap.transitions.find((t) => t.name === transition);
    if (tr)
      for (const l of tr.legs) {
        const extra: Partial<Waypoint> = { role: l.role, altMin: l.altMin, appr: 'trans' };
        if (l.hilpt && l.hold) Object.assign(extra, { hold: l.hold, hilpt: true });
        if (l.arc) {
          const c = findFix(l.arc.center);
          if (c) extra.arc = { center: { ident: c.ident, lat: c.lat, lon: c.lon }, radius: l.arc.radius, dir: l.arc.dir };
        }
        push(fromFix(l.fix, extra));
        if (l.pt) {
          // barbed procedure turn: outbound 3 nm, 45° for 1.5 nm, back to intercept inbound 1.8 nm out
          const o = l.pt.outbound;
          const s45 = o + (l.pt.side === 'L' ? -45 : 45);
          const p1 = destination(l.fix, o, 3.2);
          const p2 = destination(p1, s45, 1.6);
          const p3 = destination(l.fix, o, 2.0);
          push({ ident: 'PT-OUT', ...p1, appr: 'trans', ptPoint: true, altMin: l.altMin });
          push({ ident: 'PT-45', ...p2, appr: 'trans', ptPoint: true, altMin: l.altMin });
          push({ ident: 'PT-IN', ...p3, appr: 'trans', ptPoint: true, altMin: l.altMin });
        }
      }
    const finalLegs = tr?.joinFaf ? ap.final.slice(ap.final.findIndex((l) => l.role === 'FAF')) : ap.final;
    for (const l of finalLegs) push(fromFix(l.fix, { role: l.role, altMin: l.altMin, appr: 'final' }));
    for (const l of ap.missed.slice(1)) push(fromFix(l.fix, { role: l.role, altMin: l.altMin, hold: l.hold, appr: 'missed' }));
    const firstApp = keep.length;
    this.wpts = pts;
    this.approachId = id;
    this.missedActive = false;
    this.holdActive = false;
    if (keep.length === 0) {
      this.active = Math.min(1, pts.length - 1);
      this.directFrom = null;
    } else if (this.active >= firstApp) {
      this.active = firstApp;
    }
  }

  activateApproach(from: LatLon) {
    if (!this.approachId) return;
    this.approachActive = true;
    const first = this.wpts.findIndex((w) => w.appr);
    if (first >= 0) this.directTo(this.wpts[first], from);
  }

  /** Vectors-to-final: activate the leg into the FAF along the final approach course. */
  vectorsToFinal() {
    const ap = this.approach;
    if (!ap) return;
    this.approachActive = true;
    this.holdActive = false;
    const fafIdx = this.wpts.findIndex((w) => w.role === 'FAF' && w.appr === 'final');
    if (fafIdx < 0) return;
    const faf = this.wpts[fafIdx];
    const ext = destination(faf, ap.finalCourse + 180, 15);
    this.active = fafIdx;
    this.directFrom = ext;
  }

  activateMissed() {
    if (!this.approachId) return;
    this.missedActive = true;
    const idx = this.wpts.findIndex((w) => w.appr === 'missed');
    if (idx >= 0) {
      const map = this.wpts[idx - 1];
      this.active = idx;
      this.directFrom = map ? { lat: map.lat, lon: map.lon } : null;
      this.holdActive = false;
    }
  }

  activateLeg(i: number) {
    if (i <= 0 || i >= this.wpts.length) return;
    this.active = i;
    this.directFrom = null;
    this.holdActive = false;
  }

  private legFrom(): LatLon | null {
    if (this.directFrom) return this.directFrom;
    if (this.active > 0) return this.wpts[this.active - 1];
    return null;
  }

  private destinationAirport(): LatLon | null {
    const ap = this.approach;
    if (ap) return airport(ap.airport);
    return null;
  }

  update(ac: LatLon & { altFt: number }, gsKt: number, trackTrue: number, magVar = 0): GpsOutput {
    const o = this.out;
    o.msg = null;
    o.approachName = this.approach ? `${this.approach.airport} ${this.approach.name}` : null;
    if (this.wpts.length === 0 || this.active >= this.wpts.length) {
      o.valid = false;
      return o;
    }
    let to = this.wpts[this.active];
    let from = this.legFrom() ?? ac;

    // ---------- Sequencing
    const isMap = to.role === 'MAP' || (to.role === 'RWY' && to.appr === 'final');
    const nextHold = to.hold;
    const distTo = distanceNm(ac, to);
    const legLen = distanceNm(from, to);
    const along = legLen > 0.01 ? alongTrackNm(from, to, ac) : legLen;
    const next = this.wpts[this.active + 1];
    let turnAnt = 0.2;
    if (next) {
      const c1 = bearingDeg(from, to);
      const c2 = bearingDeg(to, next);
      const dTurn = Math.abs(wrap180(c2 - c1));
      const r = Math.max(0.3, gsKt / (60 * Math.PI)); // standard-rate radius (nm)
      turnAnt = Math.min(2, Math.max(0.2, r * Math.tan((dTurn * DEG) / 2)));
    }
    let passed = along >= legLen - (next ? turnAnt : 0) || distTo < (next ? turnAnt : 0.05);
    if (to.arc) {
      const th = bearingDeg(to.arc.center, ac);
      const thT = bearingDeg(to.arc.center, to);
      const remaining = wrap180(thT - th) * (to.arc.dir === 'R' ? 1 : -1);
      const leadDeg = ((turnAnt * 0.6) / to.arc.radius) * (180 / Math.PI);
      passed = remaining < leadDeg && distanceNm(ac, to) < 3;
    }
    o.suspended = false;
    if (!this.holdActive && passed) {
      if (nextHold && (to.appr === 'missed' || !to.appr || to.hilpt)) {
        this.hilptArmed = false;
        this.holdActive = true;
        this.holdEntryType = holdEntry(nextHold.inbound + magVar, nextHold.turn, trackTrue);
        this.holdPhase = this.holdEntryType === 'DIRECT' ? 'racetrack' : 'entry-out';
        o.msg = `Hold entry: ${this.holdEntryType}`;
      } else if (isMap && !this.missedActive) {
        o.suspended = true; // SUSP at the MAP until missed approach is activated
      } else if (next) {
        this.directFrom = null;
        this.active++;
        to = this.wpts[this.active];
        from = this.wpts[this.active - 1];
        o.msg = `Sequenced to ${to.ident}`;
      }
    }
    if (isMap && passed && !this.missedActive) o.suspended = true;

    // ---------- Steering
    let dtkTrue: number;
    let xtk: number;
    o.turnDir = null;
    if (this.holdActive && to.hold) {
      const inb = to.hold.inbound + magVar;
      const hd = { fix: { ...to }, inbound: inb, turn: to.hold.turn, legMin: to.hold.legMin, altFt: 0 };
      const fr = holdFrame(hd, ac);
      const L = Math.max(1.5, (gsKt * to.hold.legMin) / 60);
      const opp = to.hold.turn === 'R' ? 'L' : 'R';
      if (this.holdPhase === 'entry-out') {
        dtkTrue = this.holdEntryType === 'TEARDROP' ? teardropCourse(inb, to.hold.turn) : norm360(inb + 180);
        xtk = crossTrackNm(to, destination(to, dtkTrue, 10), ac);
        if (fr.x <= -L) this.holdPhase = 'entry-back';
      } else if (this.holdPhase === 'entry-back') {
        if (this.holdEntryType === 'TEARDROP') {
          const start = destination(to, inb + 180, 10);
          dtkTrue = inb;
          xtk = crossTrackNm(start, to, ac);
          o.turnDir = to.hold.turn;
          if (Math.abs(xtk) < 0.3 && Math.abs(wrap180(trackTrue - inb)) < 40) this.holdPhase = 'racetrack';
        } else {
          dtkTrue = bearingDeg(ac, to);
          xtk = 0;
          o.turnDir = opp;
          if (distanceNm(ac, to) < 0.4 || fr.x > -0.2) this.holdPhase = 'racetrack';
        }
      } else {
        const h = holdSteer(to, inb, to.hold.turn, gsKt, to.hold.legMin, ac);
        dtkTrue = h.dtk;
        xtk = h.xtk;
        o.turnDir = to.hold.turn;
        // hold-in-lieu of PT: after one circuit, continue inbound when crossing the fix
        if (to.hilpt) {
          if (fr.x < -0.8) this.hilptArmed = true;
          if (this.hilptArmed && fr.x > -0.15 && Math.abs(wrap180(trackTrue - inb)) < 45 && next) {
            this.holdActive = false;
            this.hilptArmed = false;
            this.directFrom = null;
            this.active++;
            o.msg = `Course reversal complete — ${next.ident}`;
          }
        }
      }
      o.holding = true;
    } else {
      o.holding = false;
      if (to.arc && !this.directFrom) {
        const th = bearingDeg(to.arc.center, ac);
        const r = distanceNm(to.arc.center, ac);
        dtkTrue = norm360(th + (to.arc.dir === 'R' ? 90 : -90));
        xtk = to.arc.dir === 'R' ? -(r - to.arc.radius) : r - to.arc.radius;
      } else if (distanceNm(from, to) < 0.01) {
        dtkTrue = bearingDeg(ac, to);
        xtk = 0;
      } else {
        // desired track at the aircraft's along-track position
        dtkTrue = bearingDeg(from, to);
        const at = alongTrackNm(from, to, ac);
        if (at > 0.1) {
          const pAlong = destination(from, dtkTrue, Math.min(at, distanceNm(from, to)));
          dtkTrue = bearingDeg(pAlong, to);
          if (distanceNm(pAlong, to) < 0.05) dtkTrue = bearingDeg(from, to);
        }
        xtk = crossTrackNm(from, to, ac);
      }
    }

    // ---------- CDI scale
    const dest = this.destinationAirport();
    const dDest = dest ? distanceNm(ac, dest) : Infinity;
    let mode: CdiMode = dDest < 31 ? 'TERM' : 'ENR';
    let fs = mode === 'TERM' ? 1 : 2;
    const ap = this.approach;
    const fafIdx = this.wpts.findIndex((w) => w.role === 'FAF' && w.appr === 'final');
    const inFinal = this.approachActive && !this.missedActive && fafIdx >= 0 && this.active >= fafIdx && to.appr === 'final';
    const toFaf = this.approachActive && fafIdx === this.active;
    if (this.missedActive) {
      mode = 'MAPR';
      fs = 0.3;
    } else if (inFinal && this.active > fafIdx) {
      mode = 'APR';
      fs = 0.3;
      if (ap) {
        const thr = runway(ap.airport, ap.runway).threshold;
        const dThr = distanceNm(ac, thr);
        fs = Math.max(0.1, Math.min(0.3, 0.1 + dThr * 0.04));
      }
    } else if (toFaf && distTo < 2) {
      mode = 'APR';
      fs = 0.3 + (1 - 0.3) * (distTo / 2);
    }

    // ---------- Glidepath (RNAV with vertical guidance)
    o.gpValid = false;
    o.gpDev = 0;
    if (ap && ap.type === 'RNAV' && ap.gsAngle && this.approachActive && !this.missedActive && fafIdx >= 0 && this.active >= fafIdx - 1) {
      const rwy = runway(ap.airport, ap.runway);
      const gpi = destination(rwy.threshold, rwy.heading + magVar, (ap.tch ?? 50) / Math.tan(ap.gsAngle * DEG) / FT_PER_NM);
      const d = distanceNm(ac, gpi) * FT_PER_NM;
      const onFinalSide = Math.abs(wrap180(bearingDeg(gpi, ac) - (rwy.heading + 180))) < 30;
      if (onFinalSide && d > 200 && d < 12 * FT_PER_NM) {
        const angle = Math.atan2(ac.altFt - rwy.elevFt, d) / DEG;
        o.gpValid = true;
        o.gpDistNm = d / FT_PER_NM;
        o.gpDev = Math.max(-1.2, Math.min(1.2, (ap.gsAngle - angle) / 0.7));
      }
    }

    const bearingTo = bearingDeg(ac, to);
    o.valid = true;
    o.fromIdent = this.directFrom && !this.holdActive ? 'DCT' : this.wpts[this.active - 1]?.ident ?? '';
    o.toIdent = to.ident;
    o.dtk = norm360(dtkTrue - magVar);
    o.holdEntry = this.holdActive ? this.holdEntryType : null;
    o.holdPhase = this.holdActive ? this.holdPhase : null;
    o.xtkNm = xtk;
    o.fullScaleNm = fs;
    o.mode = mode;
    o.dev = Math.max(-1.2, Math.min(1.2, -xtk / fs));
    o.distNm = distanceNm(ac, to);
    o.bearingTo = norm360(bearingTo - magVar);
    o.eteMin = gsKt > 20 ? (o.distNm / gsKt) * 60 : null;
    o.toFrom = Math.abs(wrap180(bearingTo - trackTrue)) < 90 || o.holding ? 'TO' : 'FROM';
    return o;
  }
}

/**
 * Racetrack hold path following: nearest point on the hold pattern gives the
 * desired track; signed distance gives cross-track (+ right of path).
 */
export function holdSteer(
  fix: LatLon,
  inboundTrue: number,
  turn: 'R' | 'L',
  gsKt: number,
  legMin: number,
  ac: LatLon,
): { dtk: number; xtk: number; phase: 'inbound' | 'outbound' | 'turn' } {
  const R = Math.max(0.4, gsKt / (60 * Math.PI));
  const L = Math.max(1, (gsKt * legMin) / 60);
  const p = toLocal(fix, ac);
  const c = inboundTrue * DEG;
  // x along inbound course, y to the right of the inbound course
  const x = p.x * Math.sin(c) + p.y * Math.cos(c);
  let y = p.x * Math.cos(c) - p.y * Math.sin(c);
  const s = turn === 'R' ? 1 : -1;
  y *= s; // mirror left holds into right holds
  let dirLocal: number; // direction (rad) in (x,y) frame: 0 = along +x
  let signedDist: number; // + = right of direction of travel (in mirrored frame)
  let phase: 'inbound' | 'outbound' | 'turn';
  if (x <= 0 && x >= -L) {
    // straight segments: choose nearer of inbound (y=0) and outbound (y=2R)
    if (y < R) {
      phase = 'inbound';
      dirLocal = 0;
      signedDist = y; // right of +x is +y
    } else {
      phase = 'outbound';
      dirLocal = Math.PI;
      signedDist = 2 * R - y; // travelling -x, right side is -y
    }
  } else {
    phase = 'turn';
    const cx = x > 0 ? 0 : -L;
    const dx = x - cx;
    const dy = y - R;
    const ang = Math.atan2(dy, dx); // angle from centre
    // clockwise travel in (x,y) frame with y to the right => tangent = ang + 90° in this frame
    dirLocal = ang + Math.PI / 2;
    const rr = Math.hypot(dx, dy);
    signedDist = R - rr; // outside the circle is left of travel (clockwise travel)
  }
  // unmirror
  if (s < 0) {
    dirLocal = -dirLocal;
    signedDist = -signedDist;
  }
  // Convert local direction to true bearing. In (x along course, y right), bearing = course + angle(y,x)
  const dirDeg = norm360(inboundTrue + (Math.atan2(Math.sin(dirLocal), Math.cos(dirLocal)) / DEG));
  return { dtk: dirDeg, xtk: signedDist, phase };
}
