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
import { isFlyOver, turnRadiusNm } from './pathgeom';

const pad = (n: number) => String(Math.round(norm360(n)) || 360).padStart(3, '0');

/** A holding pattern attached to a flight-plan waypoint (published, or entered by the pilot / ATC). */
export interface HoldSpec {
  /** inbound course (magnetic) */
  inbound: number;
  turn: 'R' | 'L';
  /** inbound leg time (min) */
  legMin: number;
  /** inbound leg length (NM) instead of a time, when ATC gives one */
  legNm?: number;
  /** 'published' (procedure or chart), 'user' (Hold At Waypoint / Present Position) */
  kind?: 'published' | 'user';
  /** expect-further-clearance time (sim seconds) */
  efc?: number;
}

export interface Waypoint extends LatLon {
  ident: string;
  role?: LegRole;
  altMin?: number;
  hold?: HoldSpec;
  /** waypoint belongs to the approach part of the plan */
  appr?: 'trans' | 'final' | 'missed';
  hilpt?: boolean;
  /** leg TO this waypoint is a DME arc */
  arc?: { center: LatLon & { ident: string }; radius: number; dir: 'L' | 'R' };
  /** generated procedure-turn point */
  ptPoint?: boolean;
  /** overfly this fix before turning (default: fly-by, except MAP / MAHP / runway / holding fix) */
  flyOver?: boolean;
  /** part of a departure procedure (DPRT CDI scaling) */
  sid?: boolean;
  /** entered by the pilot (Direct-To off the plan, hold at present position) */
  user?: boolean;
}

/** Flight phase that sets the GPS CDI full scale (Garmin): departure, en route, terminal, approach, missed approach. */
export type CdiMode = 'DPRT' | 'ENR' | 'TERM' | 'APR' | 'MAPR';
/** Approach service level annunciated in place of APR (WAAS G1000): vertical guidance and angular scaling. */
export type ServiceLevel = 'LPV' | 'LP' | 'L/VNAV' | 'LNAV+V' | 'LNAV';

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
  /** automatic waypoint sequencing is suspended (SUSP on the HSI, the OBS softkey reads SUSP) */
  suspended: boolean;
  /** why: past the MAP (missed approach not activated), in a hold, or the pilot pressed SUSP */
  suspReason: 'MAP' | 'HOLD' | 'PILOT' | null;
  /** OBS mode: the pilot sets the course through the active waypoint, no sequencing */
  obs: boolean;
  /** approach service level (RNAV: LPV / L/VNAV / LNAV+V / LNAV; VOR/NDB overlay: LNAV); null if GPS is not approved for the final */
  serviceLevel: ServiceLevel | null;
  /** integrity downgrade on the approach (LPV → LNAV): amber annunciation */
  downgrade: boolean;
  /** HSI flight-phase text: the service level replaces APR (DPRT / ENR / TERM / LPV / LNAV / MAPR) */
  phaseLabel: string;
  approachName: string | null;
  msg: string | null;
  /** the guidance path is curved here (fly-by / fly-over turn, DME arc, holding turn): its radius (NM) and
   *  direction, so the roll steering can fly the arc with a feed-forward bank instead of chasing it */
  arcRadiusNm: number | null;
  arcDir: 'L' | 'R' | null;
}

/** a turn between two legs that the guidance is flying (same geometry as pathgeom.flyablePath) */
interface LegTurn {
  centre: LatLon;
  radiusNm: number;
  /** +1 right, -1 left */
  dir: 1 | -1;
  /** course of the next leg: the turn ends when the path tangent reaches it (fly-by) */
  outCourse: number;
  /** fly-over: the turn ends when the track points at this fix, then the aircraft goes direct to it */
  directTo: LatLon | null;
}

/** Inputs of the Garmin CDI scaling rules (all distances NM, angles degrees). */
export interface CdiScaleInput {
  dDestNm: number;
  dOriginNm: number;
  /** flying the legs of a departure procedure */
  departing: boolean;
  approachActive: boolean;
  missedActive: boolean;
  /** GPS approved for the final approach segment (false for ILS / LOC / LDA / BC) */
  gpsApproved: boolean;
  /** the FAF is the active waypoint */
  toFaf: boolean;
  distToFafNm: number;
  /** aircraft track and bearing to the FAF minus the final approach course */
  trackErrDeg: number;
  bearingErrDeg: number;
  /** past the FAF, inside the final approach segment */
  pastFaf: boolean;
  dThrNm: number;
  /** angular (LPV / LP) rather than linear final scaling */
  angular: boolean;
  /** missed approach: flying its first leg, and whether that leg is aligned with the final course */
  missedFirstLeg: boolean;
  missedAligned: boolean;
}

/**
 * Garmin GPS CDI full-scale deflection (G1000 / GNS WAAS rules):
 * - ENR 2.0 NM; TERM within 31 NM of the departure or destination airport, ramping 2.0 → 1.0 over 1 NM;
 * - DPRT 0.3 NM on the legs of a departure procedure within 30 NM of the origin;
 * - APR: inside 2 NM of the FAF, only when track and bearing are within 45° of the final course, ramping
 *   1.0 → 0.3 NM at the FAF; past the FAF 0.3 NM (LNAV, L/VNAV, LNAV+V) or angular (LPV / LP: ±350 ft at the
 *   threshold, never wider than 0.3 NM); no APR when GPS is not approved for the final (ILS / LOC);
 * - MAPR: 0.3 NM on a first missed approach leg aligned with the final course, 1.0 NM when it is not; TERM after it.
 */
export function cdiScale(p: CdiScaleInput): { mode: CdiMode; fs: number } {
  if (p.missedActive) {
    if (p.missedFirstLeg) return { mode: 'MAPR', fs: p.missedAligned ? 0.3 : 1 };
    return { mode: 'TERM', fs: 1 };
  }
  if (p.approachActive && p.gpsApproved) {
    if (p.pastFaf) {
      const fs = p.angular ? Math.min(0.3, 350 / FT_PER_NM + Math.max(0, p.dThrNm) * Math.tan(2 * DEG)) : 0.3;
      return { mode: 'APR', fs };
    }
    if (p.toFaf && p.distToFafNm <= 2 && Math.abs(p.trackErrDeg) < 45 && Math.abs(p.bearingErrDeg) < 45)
      return { mode: 'APR', fs: 0.3 + 0.7 * Math.max(0, p.distToFafNm) / 2 };
  }
  if (p.departing && p.dOriginNm < 30) return { mode: 'DPRT', fs: 0.3 };
  const d = Math.min(p.dDestNm, p.dOriginNm);
  const fs = d <= 30 ? 1 : d >= 31 ? 2 : 1 + (d - 30);
  return { mode: d < 31 ? 'TERM' : 'ENR', fs };
}

/** approaches whose final segment is flown on a localizer (GPS not approved for the final) */
const LOC_BASED = new Set(['ILS', 'LOC', 'LOCBC', 'LDA']);
export const isLocApproach = (ap: Approach | null | undefined) => !!ap && LOC_BASED.has(ap.type);

/** Approach service level from the procedure (RNAV minima lines) and the integrity state. */
export function serviceLevel(ap: Approach | null, downgrade = false): ServiceLevel | null {
  if (!ap || LOC_BASED.has(ap.type)) return null;
  if (ap.type !== 'RNAV' || downgrade) return 'LNAV';
  const lines = ap.minimums.map((m) => m.label.toUpperCase());
  if (lines.includes('LPV')) return 'LPV';
  if (lines.includes('LP')) return 'LP';
  if (lines.includes('LNAV/VNAV')) return 'L/VNAV';
  return ap.gsAngle ? 'LNAV+V' : 'LNAV';
}

const fromFix = (f: Fix, extra: Partial<Waypoint> = {}): Waypoint => ({ ident: f.ident, lat: f.lat, lon: f.lon, ...extra });

/** Box behaviour that differs between Garmin navigators (GNS 430W / G1000: VTF drops the fixes before the FAF). */
export interface BoxProfile {
  vtfDropsPreFaf: boolean;
}

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
  /** OBS mode (pilot course through the active waypoint, automatic sequencing off) */
  obsMode = false;
  /** OBS course (magnetic) */
  obsCourse = 0;
  /** pilot-commanded suspension of automatic sequencing */
  private pilotSusp = false;
  /** 'Exit hold' requested: leave the hold at the next crossing of the fix inbound */
  holdExit = false;
  private exitArmed = false;
  /** waypoint index waiting for the 'Activate leg?' confirmation */
  pendingLeg: number | null = null;
  /** approach activated as vectors to final */
  vtf = false;
  /** instructor: approach integrity downgrade (LPV → LNAV, no vertical guidance) */
  downgrade = false;
  profile: BoxProfile = { vtfDropsPreFaf: true };
  /** departure airport (first waypoint of the plan when it is an airport) for TERM / DPRT scaling */
  origin: (LatLon & { ident: string }) | null = null;
  /** called on every pilot edit of the plan (op, detail): the sim records it for the debrief */
  onEdit: ((op: string, detail: string) => void) | null = null;
  /** waypoint inserted by a Direct-To to a fix that was not in the plan */
  private directInserted: Waypoint | null = null;
  /** ident of the active waypoint before the last Direct-To (Cancel Direct-To returns to it) */
  private preDirectIdent: string | null = null;
  private lastAc: LatLon | null = null;
  private lastTrack = 0;
  private lastMagVar = 0;
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
    suspReason: null,
    obs: false,
    serviceLevel: null,
    downgrade: false,
    phaseLabel: 'ENR',
    approachName: null,
    msg: null,
    arcRadiusNm: null,
    arcDir: null,
  };
  /** turn in progress between the previous leg and the active one */
  private turn: LegTurn | null = null;

  get approach(): Approach | null {
    if (!this.approachId) return null;
    // the nav database can be swapped under a loaded plan (real-world region change): never throw per frame
    try {
      return getApproach(this.approachId);
    } catch {
      return null;
    }
  }

  private edit(op: string, detail = '') {
    this.onEdit?.(op, detail);
  }

  /** leave any transient guidance state (turn, OBS, SUSP, pending confirmation) before a plan change */
  private resetGuidance() {
    this.turn = null;
    this.obsMode = false;
    this.pilotSusp = false;
    this.pendingLeg = null;
    this.holdExit = false;
    this.exitArmed = false;
  }

  /** first waypoint with this ident, looking from the active leg onwards first */
  indexOf(ident: string): number {
    for (let i = Math.max(0, this.active); i < this.wpts.length; i++) if (this.wpts[i].ident === ident) return i;
    return this.wpts.findIndex((w) => w.ident === ident);
  }

  setEnroute(points: Waypoint[]) {
    this.resetGuidance();
    this.wpts = points;
    this.active = Math.min(1, points.length - 1);
    this.directFrom = null;
    this.holdActive = false;
    this.directInserted = null;
    this.origin = null;
    const first = points[0];
    if (first) {
      try {
        const a = airport(first.ident);
        this.origin = { ident: a.icao, lat: a.lat, lon: a.lon };
      } catch {
        this.origin = null;
      }
    }
  }

  // ------------------------------------------------------------------ editing (Garmin FPL page)
  /**
   * Insert a waypoint before `index` (Garmin: the cursor row). Inserted into the active leg (index = active), the
   * new waypoint becomes the active TO waypoint. A published procedure cannot be edited inside: returns false.
   */
  insertWaypoint(index: number, wp: Waypoint): boolean {
    const i = Math.max(0, Math.min(this.wpts.length, Math.round(index)));
    const before = this.wpts[i - 1];
    const after = this.wpts[i];
    if (before?.appr && after?.appr) return false;
    if (before?.ident === wp.ident || after?.ident === wp.ident) return false;
    const w: Waypoint = { ...wp };
    delete w.appr;
    this.pendingLeg = null;
    this.wpts.splice(i, 0, w);
    if (this.wpts.length === 1) {
      this.active = 0;
      this.directFrom = this.lastAc ? { ...this.lastAc } : null;
    } else if (i < this.active) this.active++;
    else if (i === this.active) {
      this.turn = null;
      this.holdActive = false;
      if (this.active > 0) this.directFrom = null;
    }
    this.edit('insert', `${w.ident} at ${i + 1}`);
    return true;
  }

  /** Remove a waypoint (Garmin CLR 'Remove XXXXX?'). Approach waypoints are removed with the approach only. */
  removeWaypoint(index: number): boolean {
    const i = Math.round(index);
    const w = this.wpts[i];
    if (!w || w.appr) return false;
    this.pendingLeg = null;
    this.wpts.splice(i, 1);
    if (w === this.directInserted) this.directInserted = null;
    if (this.wpts.length === 0) {
      this.resetGuidance();
      this.active = 0;
      this.directFrom = null;
      this.holdActive = false;
    } else if (i < this.active) {
      this.active--;
      // the FROM waypoint of the active leg was removed: the leg becomes direct from present position
      if (i === this.active && this.lastAc) {
        this.directFrom = { ...this.lastAc };
        this.turn = null;
      }
    } else if (i === this.active) {
      this.turn = null;
      this.holdActive = false;
      this.obsMode = false;
      if (this.active >= this.wpts.length) this.active = this.wpts.length - 1;
      if (this.active > 0) this.directFrom = null;
      else this.directFrom = this.lastAc ? { ...this.lastAc } : null;
    }
    this.edit('remove', w.ident);
    return true;
  }

  /** Remove the loaded approach (and its missed approach) from the plan. */
  removeApproach(): boolean {
    if (!this.approachId && !this.wpts.some((w) => w.appr)) return false;
    const activeW = this.wpts[this.active];
    const inAppr = !!activeW?.appr;
    this.resetGuidance();
    this.wpts = this.wpts.filter((w) => !w.appr);
    this.approachId = null;
    this.approachActive = false;
    this.missedActive = false;
    this.vtf = false;
    this.holdActive = false;
    if (inAppr || this.active >= this.wpts.length) {
      this.active = Math.max(0, this.wpts.length - 1);
      this.directFrom = this.lastAc ? { ...this.lastAc } : null;
    }
    this.edit('remove-approach');
    return true;
  }

  /** Non-published hold (ATC clearance): proceed direct to the fix and hold. The rest of the plan is kept. */
  setHold(fix: Waypoint, inbound: number, turn: 'R' | 'L', legMin: number, from: LatLon, altFt?: number) {
    // the fix ahead in the en-route part of the plan, else a new waypoint in front of the active one
    let i = -1;
    for (let k = Math.max(0, this.active); k < this.wpts.length; k++) {
      if (this.wpts[k].ident === fix.ident && !this.wpts[k].appr) {
        i = k;
        break;
      }
    }
    if (i < 0) {
      const at = Math.min(this.active, this.wpts.length);
      this.wpts.splice(at, 0, { ...fix, appr: undefined, user: true });
      if (this.wpts.length === 1) this.active = 0;
      i = at;
    }
    const w = this.wpts[i];
    if (altFt !== undefined) w.altMin = altFt;
    this.directTo(w, from);
    this.holdAt(i, { inbound, turn, legMin, kind: 'user' });
  }

  /**
   * Hold at a waypoint of the plan (Garmin 'Hold At Waypoint'), or at present position ('ppos': a fix just ahead
   * of the aircraft on its track). Returns the index of the holding fix. The plan after the fix is kept; the hold
   * is flown until Exit Hold (SUSP).
   */
  holdAt(where: number | 'ppos', spec: Partial<HoldSpec> = {}, ac?: LatLon & { trackDeg?: number }): number {
    const pos = ac ?? this.lastAc;
    if (where === 'ppos') {
      if (!pos) return -1;
      const trk = ac?.trackDeg ?? this.lastTrack;
      const fixPos = destination(pos, trk, 0.3);
      const w: Waypoint = { ident: 'PPOS', lat: fixPos.lat, lon: fixPos.lon, user: true };
      const at = Math.min(this.active, this.wpts.length);
      this.wpts.splice(at, 0, w);
      this.resetGuidance();
      this.active = at;
      this.directFrom = { lat: pos.lat, lon: pos.lon };
      this.holdActive = false;
      w.hold = {
        inbound: spec.inbound ?? norm360(trk - this.lastMagVar),
        turn: spec.turn ?? 'R',
        legMin: spec.legMin ?? 1,
        legNm: spec.legNm,
        kind: 'user',
        efc: spec.efc,
      };
      this.edit('hold', `present position ${pad(w.hold.inbound)}° ${w.hold.turn}`);
      return at;
    }
    const i = Math.round(where);
    const w = this.wpts[i];
    if (!w) return -1;
    const prev = this.wpts[i - 1];
    const defaultInbound = w.hold?.inbound ?? (prev ? norm360(bearingDeg(prev, w) - this.lastMagVar) : this.lastTrack);
    w.hold = {
      inbound: spec.inbound ?? defaultInbound,
      turn: spec.turn ?? w.hold?.turn ?? 'R',
      legMin: spec.legMin ?? w.hold?.legMin ?? 1,
      legNm: spec.legNm,
      kind: spec.kind ?? 'user',
      efc: spec.efc,
    };
    if (i < this.active && pos) this.directTo(w, pos);
    this.edit('hold', `${w.ident} ${pad(w.hold.inbound)}° ${w.hold.turn}`);
    return i;
  }

  /** Leave the hold at the next crossing of the fix inbound, then continue the plan (Garmin: SUSP / EXIT HOLD). */
  exitHold(): boolean {
    const w = this.wpts[this.active];
    if (!w?.hold) return false;
    if (!this.holdActive) {
      // not in the hold yet: a pilot hold is cancelled, a published one is still flown
      if (w.hold.kind === 'user') {
        delete w.hold;
        this.edit('cancel-hold', w.ident);
        return true;
      }
      return false;
    }
    this.holdExit = true;
    this.edit('exit-hold', w.ident);
    return true;
  }

  /** Direct-To. A fix of the plan: sequence on from it. Off the plan: it is inserted in front of the active waypoint
   *  and the plan continues after it. `course` (magnetic) flies a selected course into the fix. */
  directTo(target: Waypoint, from: LatLon, opts: { course?: number } = {}) {
    this.resetGuidance();
    this.holdActive = false;
    this.holdEntryType = null;
    this.preDirectIdent = this.wpts[this.active]?.ident ?? null;
    // the waypoint object itself (a plan row), else the first fix with that ident from the active leg on
    let idx = this.wpts.indexOf(target);
    if (idx < 0) idx = this.indexOf(target.ident);
    if (idx < 0) {
      const at = this.wpts.length ? Math.min(this.active, this.wpts.length) : 0;
      // overflown, then the plan resumes from it (the stored route is never lost)
      const w: Waypoint = { ...target, user: true, flyOver: true };
      delete w.appr;
      this.wpts.splice(at, 0, w);
      if (this.directInserted && this.directInserted !== w) {
        // a second off-plan Direct-To replaces the first one
        const k = this.wpts.indexOf(this.directInserted);
        if (k >= 0 && k !== at) {
          this.wpts.splice(k, 1);
          if (k < at) idx = at - 1;
        }
      }
      if (idx < 0) idx = this.wpts.indexOf(w);
      this.directInserted = w;
    }
    this.active = idx;
    const w = this.wpts[idx];
    if (w.appr === 'trans' || w.appr === 'final') this.approachActive = true;
    if (w.appr === 'missed' && this.approachId) {
      this.approachActive = true;
      this.missedActive = true;
    }
    if (opts.course !== undefined) {
      const back = destination(w, opts.course + this.lastMagVar + 180, Math.max(5, distanceNm(from, w) + 2));
      this.directFrom = back;
    } else this.directFrom = { lat: from.lat, lon: from.lon };
    this.edit('direct', w.ident + (opts.course !== undefined ? ` crs ${pad(opts.course)}°` : ''));
  }

  /** Cancel Direct-To: an off-plan Direct-To waypoint is removed and the leg that was active before it resumes. */
  cancelDirect(): boolean {
    if (!this.directFrom && !this.directInserted) return false;
    this.resetGuidance();
    if (this.directInserted) {
      const k = this.wpts.indexOf(this.directInserted);
      if (k >= 0) {
        this.wpts.splice(k, 1);
        if (k < this.active) this.active--;
      }
      this.directInserted = null;
    }
    const back = this.preDirectIdent ? this.indexOf(this.preDirectIdent) : -1;
    if (back >= 0) this.active = back;
    this.active = Math.max(0, Math.min(this.wpts.length - 1, this.active));
    this.directFrom = this.active > 0 ? null : this.lastAc ? { ...this.lastAc } : null;
    this.holdActive = false;
    this.edit('cancel-direct', this.wpts[this.active]?.ident ?? '');
    return true;
  }

  // ------------------------------------------------------------------ OBS / SUSP
  /** OBS mode on (course magnetic, default: the current desired track) or off (back to automatic sequencing). */
  setObs(on: boolean, course?: number) {
    const to = this.wpts[this.active];
    if (on) {
      if (!to) return;
      this.obsMode = true;
      this.obsCourse = norm360(course ?? (this.out.valid ? this.out.dtk : this.obsCourse));
      this.pilotSusp = false;
      this.turn = null;
      this.edit('obs', `${pad(this.obsCourse)}°`);
      return;
    }
    if (!this.obsMode) return;
    this.obsMode = false;
    if (to) {
      // automatic sequencing resumes on the OBS course into (or away from) the active waypoint
      const d = this.lastAc ? distanceNm(this.lastAc, to) : 5;
      this.directFrom = destination(to, this.obsCourse + this.lastMagVar + 180, Math.max(2, d + 1));
    }
    this.edit('obs-off');
  }

  /** OBS course = the bearing from present position to the active waypoint (CRS knob push). */
  syncObs() {
    const to = this.wpts[this.active];
    if (!to || !this.lastAc) return;
    this.obsCourse = norm360(bearingDeg(this.lastAc, to) - this.lastMagVar);
  }

  /** Suspend automatic waypoint sequencing (SUSP). */
  suspend() {
    if (this.holdActive) return;
    this.pilotSusp = true;
  }

  /** Clear SUSP: past the MAP it activates the missed approach, in a hold it exits the hold, in OBS it ends OBS. */
  resume() {
    if (this.out.suspReason === 'MAP') this.activateMissed();
    else if (this.holdActive) this.exitHold();
    else if (this.obsMode) this.setObs(false);
    this.pilotSusp = false;
  }

  unsuspend() {
    this.resume();
  }

  // ------------------------------------------------------------------ Activate Leg (with confirmation)
  /** Garmin ACT LEG: ask for the leg ending at waypoint i; nothing changes until activeLegConfirm(). */
  requestActivateLeg(i: number): boolean {
    if (i <= 0 || i >= this.wpts.length) return false;
    this.pendingLeg = i;
    return true;
  }

  /** 'Activate leg?' answered: ENT (true) activates the pending leg, CLR (false) cancels. */
  activeLegConfirm(accept = true): boolean {
    const i = this.pendingLeg;
    this.pendingLeg = null;
    if (!accept || i === null || i <= 0 || i >= this.wpts.length) return false;
    const w = this.wpts[i];
    this.activateLeg(i);
    if (w.appr === 'trans' || w.appr === 'final') this.approachActive = true;
    if (w.appr === 'missed' && this.approachId) {
      this.approachActive = true;
      this.missedActive = true;
    }
    this.edit('activate-leg', `${this.wpts[i - 1]?.ident ?? ''}-${w.ident}`);
    return true;
  }

  /** Load an approach (and optional transition) at the end of the enroute plan. */
  loadApproach(id: string, transition: string | null) {
    this.resetGuidance();
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
        if (l.hilpt && l.hold) Object.assign(extra, { hold: { ...l.hold, kind: 'published' }, hilpt: true });
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
    for (const l of ap.missed.slice(1))
      push(fromFix(l.fix, { role: l.role, altMin: l.altMin, hold: l.hold ? { ...l.hold, kind: 'published' } : undefined, appr: 'missed' }));
    const firstApp = keep.length;
    const wasActive = this.wpts[this.active];
    this.wpts = pts;
    this.approachId = id;
    this.missedActive = false;
    this.holdActive = false;
    this.vtf = false;
    if (keep.length === 0) {
      this.active = Math.min(1, pts.length - 1);
      this.directFrom = null;
    } else if (wasActive?.appr || this.active >= firstApp) {
      this.active = Math.min(firstApp, pts.length - 1);
    }
    this.edit('load-approach', `${ap.airport} ${ap.name}${transition ? ' via ' + transition : ''}`);
  }

  /** ATC "cleared for the approach" while already flying the route into it */
  armApproach() {
    if (this.approachId) this.approachActive = true;
  }

  /** Garmin 'Activate Approach': Direct-To the first fix of the approach (the selected transition's IAF). */
  activateApproach(from: LatLon) {
    if (!this.approachId) return;
    this.approachActive = true;
    this.vtf = false;
    const first = this.wpts.findIndex((w) => w.appr);
    if (first >= 0) this.directTo(this.wpts[first], from);
  }

  /**
   * Vectors-to-final: the FAF becomes the active waypoint on the extended final approach course. With
   * profile.vtfDropsPreFaf (GNS 430W, G1000) the approach fixes before the FAF leave the plan (the 'VTF trap').
   */
  vectorsToFinal() {
    this.resetGuidance();
    const ap = this.approach;
    if (!ap) return;
    this.approachActive = true;
    this.missedActive = false;
    this.holdActive = false;
    let fafIdx = this.wpts.findIndex((w) => w.role === 'FAF' && w.appr === 'final');
    if (fafIdx < 0) return;
    if (this.profile.vtfDropsPreFaf) {
      const faf = this.wpts[fafIdx];
      this.wpts = this.wpts.filter((w, i) => i >= fafIdx || !w.appr);
      fafIdx = this.wpts.indexOf(faf);
    }
    const faf = this.wpts[fafIdx];
    const ext = destination(faf, ap.finalCourse + this.lastMagVar + 180, 15);
    this.active = fafIdx;
    this.directFrom = ext;
    this.vtf = true;
    this.edit('vtf', faf.ident);
  }

  activateMissed() {
    this.resetGuidance();
    if (!this.approachId) return;
    this.missedActive = true;
    this.vtf = false;
    const idx = this.wpts.findIndex((w) => w.appr === 'missed');
    if (idx >= 0) {
      const map = this.wpts[idx - 1];
      this.active = idx;
      this.directFrom = map ? { lat: map.lat, lon: map.lon } : null;
      this.holdActive = false;
    }
    this.edit('activate-missed');
  }

  /** Make the leg ending at waypoint i active at once (lessons, instructor). The pilot path asks first:
   *  requestActivateLeg + activeLegConfirm. */
  activateLeg(i: number) {
    if (i <= 0 || i >= this.wpts.length) return;
    this.resetGuidance();
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
    if (ap) {
      try {
        return airport(ap.airport);
      } catch {
        return null;
      }
    }
    return null;
  }

  update(ac: LatLon & { altFt: number }, gsKt: number, trackTrue: number, magVar = 0): GpsOutput {
    const o = this.out;
    o.msg = null;
    this.lastAc = { lat: ac.lat, lon: ac.lon };
    this.lastTrack = trackTrue;
    this.lastMagVar = magVar;
    o.approachName = this.approach ? `${this.approach.airport} ${this.approach.name}` : null;
    o.obs = false;
    if (this.wpts.length === 0 || this.active >= this.wpts.length) {
      o.valid = false;
      o.suspended = false;
      o.suspReason = null;
      return o;
    }
    if (this.active < 0) this.active = 0;
    let to = this.wpts[this.active];
    let from = this.legFrom() ?? ac;

    // ---------- Sequencing
    // Leg transitions follow pathgeom.flyablePath (what every map draws): at a fly-by fix the turn starts one
    // turn-anticipation distance before it, on an arc tangent to both legs; a fly-over fix (MAP, MAHP, runway,
    // holding fix) is overflown, then the aircraft turns at the standard radius and goes direct to the next fix.
    const isMap = to.role === 'MAP' || (to.role === 'RWY' && to.appr === 'final');
    const nextHold = to.hold;
    const distTo = distanceNm(ac, to);
    const legLen = distanceNm(from, to);
    const along = legLen > 0.01 ? alongTrackNm(from, to, ac) : legLen;
    const next = this.wpts[this.active + 1];
    const inCourse = to.arc ? norm360(bearingDeg(to.arc.center, to) + (to.arc.dir === 'R' ? 90 : -90)) : bearingDeg(from, to);
    const outCourse = next ? (next.arc ? norm360(bearingDeg(next.arc.center, to) + (next.arc.dir === 'R' ? 90 : -90)) : bearingDeg(to, next)) : inCourse;
    const dTurn = wrap180(outCourse - inCourse);
    const flyOver = isFlyOver(to) || !!to.hold || Math.abs(dTurn) > 150;
    const R = turnRadiusNm(gsKt);
    let turnAnt = 0;
    let turnR = R;
    if (next && !flyOver && Math.abs(dTurn) >= 2) {
      // anticipation limited to half of each adjoining leg (the radius shrinks to fit), as on the map
      const lim = Math.min(legLen, next.arc ? Infinity : distanceNm(to, next)) / 2;
      const t = Math.tan((Math.abs(dTurn) / 2) * DEG);
      turnAnt = R * t;
      if (turnAnt > lim) {
        turnAnt = lim;
        turnR = turnAnt / t;
      }
    }
    let passed: boolean;
    if (to.arc && !this.directFrom) {
      const th = bearingDeg(to.arc.center, ac);
      const thT = bearingDeg(to.arc.center, to);
      const remaining = wrap180(thT - th) * (to.arc.dir === 'R' ? 1 : -1);
      const leadDeg = (turnAnt / to.arc.radius) * (180 / Math.PI);
      passed = remaining < leadDeg && distTo < 3;
    } else if (next && turnAnt > 0) passed = along >= legLen - turnAnt || distTo < turnAnt * 0.8;
    else passed = along >= legLen - 0.05 || distTo < 0.1; // overhead (fly-over, or no turn)
    let mapSusp = false;
    // OBS and a pilot SUSP stop the automatic sequencing: the active waypoint stays active (TO, then FROM)
    const sequencing = !this.obsMode && !this.pilotSusp;
    if (sequencing && !this.holdActive && passed && !this.turn) {
      if (nextHold && (to.appr === 'missed' || !to.appr || to.hilpt || nextHold.kind === 'user')) {
        this.hilptArmed = false;
        this.exitArmed = false;
        this.holdActive = true;
        this.holdEntryType = holdEntry(nextHold.inbound + magVar, nextHold.turn, trackTrue);
        this.holdPhase = this.holdEntryType === 'DIRECT' ? 'racetrack' : 'entry-out';
        o.msg = `Hold entry: ${this.holdEntryType}`;
      } else if (isMap && !this.missedActive) {
        mapSusp = true; // SUSP at the MAP until missed approach is activated
      } else if (next) {
        const dir: 1 | -1 = dTurn >= 0 ? 1 : -1;
        if (turnAnt > 0) {
          // fly-by: the arc of radius turnR tangent to both legs
          const t1 = destination(to, inCourse + 180, turnAnt);
          this.turn = { centre: destination(t1, inCourse + 90 * dir, turnR), radiusNm: turnR, dir, outCourse, directTo: null };
        } else if (flyOver && Math.abs(wrap180(bearingDeg(ac, next) - trackTrue)) > 4 && !next.arc) {
          // fly-over: turn at the standard radius from overhead the fix until the track points at the next fix
          const d2 = wrap180(bearingDeg(to, next) - trackTrue);
          const dir2: 1 | -1 = d2 >= 0 ? 1 : -1;
          this.turn = { centre: destination(ac, trackTrue + 90 * dir2, R), radiusNm: R, dir: dir2, outCourse, directTo: next };
        }
        this.directFrom = null;
        if (to === this.directInserted) this.directInserted = null;
        this.active++;
        to = this.wpts[this.active];
        from = this.wpts[this.active - 1];
        o.msg = `Sequenced to ${to.ident}`;
      }
    }
    if (isMap && passed && !this.missedActive) mapSusp = true;

    // ---------- Steering
    let dtkTrue = 0;
    let xtk = 0;
    let obsFrom: boolean | null = null;
    o.turnDir = null;
    o.arcRadiusNm = null;
    o.arcDir = null;
    if (this.holdActive && to.hold) {
      const inb = to.hold.inbound + magVar;
      const hd = { fix: { ...to }, inbound: inb, turn: to.hold.turn, legMin: to.hold.legMin, altFt: 0 };
      const fr = holdFrame(hd, ac);
      const legMin = to.hold.legNm && gsKt > 20 ? (to.hold.legNm / gsKt) * 60 : to.hold.legMin;
      const L = Math.max(1.5, (gsKt * legMin) / 60);
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
        const h = holdSteer(to, inb, to.hold.turn, gsKt, legMin, ac);
        dtkTrue = h.dtk;
        xtk = h.xtk;
        o.turnDir = to.hold.turn;
        if (h.phase === 'turn') {
          o.arcRadiusNm = h.radiusNm;
          o.arcDir = to.hold.turn;
        }
        const inboundAligned = Math.abs(wrap180(trackTrue - inb)) < 45;
        // hold-in-lieu of PT: after one circuit, continue inbound when crossing the fix
        if (to.hilpt) {
          if (fr.x < -0.8) this.hilptArmed = true;
          if (this.hilptArmed && fr.x > -0.15 && inboundAligned && next) {
            this.holdActive = false;
            this.hilptArmed = false;
            this.directFrom = null;
            this.active++;
            o.msg = `Course reversal complete — ${next.ident}`;
          }
        } else if (this.holdExit && next) {
          // Exit Hold: continue to the fix on the inbound course, then sequence to the next waypoint
          if (fr.x < -0.15 && inboundAligned) this.exitArmed = true;
          if (this.exitArmed && fr.x > -0.15 && inboundAligned) {
            this.holdActive = false;
            this.holdExit = false;
            this.exitArmed = false;
            if (to.hold.kind === 'user') delete to.hold;
            this.directFrom = null;
            this.active++;
            o.msg = `Hold exited — ${next.ident}`;
          }
        }
      }
      o.holding = this.holdActive;
    } else if (this.obsMode) {
      // OBS: TO / FROM the active waypoint on the pilot's course, no sequencing
      o.holding = false;
      o.obs = true;
      const crsT = norm360(this.obsCourse + magVar);
      const back = destination(to, crsT + 180, 60);
      dtkTrue = crsT;
      xtk = crossTrackNm(back, to, ac);
      obsFrom = alongTrackNm(back, to, ac) > 60;
    } else if (this.turn) {
      // flying the turn between two legs: path = the arc, deviation = radial distance from it
      const tr = this.turn;
      o.holding = false;
      const th = bearingDeg(tr.centre, ac);
      const r = distanceNm(tr.centre, ac);
      dtkTrue = norm360(th + 90 * tr.dir);
      xtk = tr.dir > 0 ? tr.radiusNm - r : r - tr.radiusNm;
      o.arcRadiusNm = tr.radiusNm;
      o.arcDir = tr.dir > 0 ? 'R' : 'L';
      const done = tr.directTo
        ? wrap180(bearingDeg(ac, tr.directTo) - dtkTrue) * tr.dir < 3
        : wrap180(dtkTrue - tr.outCourse) * tr.dir >= -8; // roll-out lead: the bank comes off over the last 8°
      if (done || r > tr.radiusNm * 3) {
        // turn complete (or abandoned far off the arc): back to straight-leg guidance
        if (tr.directTo) this.directFrom = { lat: ac.lat, lon: ac.lon };
        this.turn = null;
        o.arcRadiusNm = null;
        o.arcDir = null;
      }
    } else {
      o.holding = false;
      if (to.arc && !this.directFrom) {
        const th = bearingDeg(to.arc.center, ac);
        const r = distanceNm(to.arc.center, ac);
        dtkTrue = norm360(th + (to.arc.dir === 'R' ? 90 : -90));
        xtk = to.arc.dir === 'R' ? -(r - to.arc.radius) : r - to.arc.radius;
        o.arcRadiusNm = to.arc.radius;
        o.arcDir = to.arc.dir;
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

    // ---------- CDI scale (Garmin flight phases)
    const ap = this.approach;
    const dest = this.destinationAirport();
    const fafIdx = this.wpts.findIndex((w) => w.role === 'FAF' && w.appr === 'final');
    const faf = fafIdx >= 0 ? this.wpts[fafIdx] : null;
    const firstMissed = this.wpts.findIndex((w) => w.appr === 'missed');
    const fac = ap ? ap.finalCourse + magVar : 0;
    const level = serviceLevel(ap, this.downgrade);
    let dThr = Infinity;
    if (ap) {
      try {
        dThr = distanceNm(ac, runway(ap.airport, ap.runway).threshold);
      } catch {
        dThr = Infinity;
      }
    }
    const missedLegFrom = firstMissed > 0 ? this.wpts[firstMissed - 1] : null;
    const sc = cdiScale({
      dDestNm: dest ? distanceNm(ac, dest) : Infinity,
      dOriginNm: this.origin ? distanceNm(ac, this.origin) : Infinity,
      departing: !!to.sid && !this.approachActive,
      approachActive: this.approachActive,
      missedActive: this.missedActive,
      gpsApproved: !!ap && !LOC_BASED.has(ap.type),
      toFaf: fafIdx >= 0 && this.active === fafIdx,
      distToFafNm: faf ? distanceNm(ac, faf) : Infinity,
      trackErrDeg: wrap180(trackTrue - fac),
      bearingErrDeg: faf ? wrap180(bearingDeg(ac, faf) - fac) : 180,
      pastFaf: fafIdx >= 0 && this.active > fafIdx && to.appr === 'final',
      dThrNm: dThr,
      angular: level === 'LPV' || level === 'LP',
      missedFirstLeg: firstMissed >= 0 && this.active === firstMissed,
      missedAligned: !!missedLegFrom && firstMissed >= 0 && Math.abs(wrap180(bearingDeg(missedLegFrom, this.wpts[firstMissed]) - fac)) <= 45,
    });

    // ---------- Glidepath (RNAV with vertical guidance)
    o.gpValid = false;
    o.gpDev = 0;
    const vertical = level === 'LPV' || level === 'L/VNAV' || level === 'LNAV+V';
    if (ap && ap.type === 'RNAV' && vertical && ap.gsAngle && this.approachActive && !this.missedActive && fafIdx >= 0 && this.active >= fafIdx - 1) {
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
    o.fromIdent = this.obsMode ? 'OBS' : this.directFrom && !this.holdActive ? (this.vtf && this.active === fafIdx ? 'VTF' : 'DCT') : this.wpts[this.active - 1]?.ident ?? '';
    o.toIdent = to.ident;
    o.dtk = norm360(dtkTrue - magVar);
    o.holdEntry = this.holdActive ? this.holdEntryType : null;
    o.holdPhase = this.holdActive ? this.holdPhase : null;
    o.xtkNm = xtk;
    o.fullScaleNm = sc.fs;
    o.mode = sc.mode;
    o.serviceLevel = level;
    o.downgrade = this.downgrade && !!ap && ap.type === 'RNAV';
    o.phaseLabel = sc.mode === 'APR' ? level ?? 'APR' : sc.mode;
    o.dev = Math.max(-1.2, Math.min(1.2, -xtk / sc.fs));
    o.distNm = distanceNm(ac, to);
    o.bearingTo = norm360(bearingTo - magVar);
    o.eteMin = gsKt > 20 ? (o.distNm / gsKt) * 60 : null;
    // TO / FROM relative to the desired track (the course through the waypoint), like the HSI flag
    o.toFrom = obsFrom !== null ? (obsFrom ? 'FROM' : 'TO') : o.holding || Math.abs(wrap180(bearingTo - dtkTrue)) < 90 ? 'TO' : 'FROM';
    const holdSusp = this.holdActive && !to.hilpt;
    o.suspReason = mapSusp ? 'MAP' : holdSusp ? 'HOLD' : this.pilotSusp ? 'PILOT' : null;
    o.suspended = o.suspReason !== null;
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
): { dtk: number; xtk: number; phase: 'inbound' | 'outbound' | 'turn'; radiusNm: number } {
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
  return { dtk: dirDeg, xtk: signedDist, phase, radiusNm: R };
}
