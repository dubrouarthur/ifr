// Flight recorder and debrief scoring.
import type { Sim } from './sim';
import { AIRFRAME } from './aircraft';
import { alongTrackNm, crossTrackNm, distanceNm, FT_PER_NM, type LatLon } from '../nav/geo';
import { runway as getRunway, AIRPORTS } from '../nav/data';
import type { Approach, Runway } from '../nav/types';

export type Phase = 'ground' | 'departure' | 'enroute' | 'initial' | 'final' | 'missed' | 'landed';

export interface Sample {
  t: number;
  lat: number;
  lon: number;
  alt: number;
  agl: number;
  ias: number;
  vs: number;
  hdg: number;
  bank: number;
  pitch: number;
  latDots: number | null;
  vertDots: number | null;
  ap: boolean;
  phase: Phase;
  visual: boolean;
  mins: number | null;
}

export interface FlightEvent {
  t: number;
  kind: 'info' | 'good' | 'warn' | 'bad';
  text: string;
}

export interface Touchdown {
  t: number;
  vsFpm: number;
  iasKt: number;
  centerlineFt: number;
  fromThresholdFt: number;
  runway: string;
  airport: string;
  pitchDeg: number;
  bankDeg: number;
}

const DT = 0.5;

export class Recorder {
  samples: Sample[] = [];
  events: FlightEvent[] = [];
  touchdown: Touchdown | null = null;
  approach: Approach | null = null;
  crashed: string | null = null;
  private acc = 0;
  private flags = new Set<string>();
  private wasOnGround = true;
  private lastAp = false;
  private lastLat = '';
  private lastVert = '';
  private lastActive = '';
  belowMinsAnnounced = false;
  floorViolationSec = 0;
  unstableSec = 0;
  stallSec = 0;
  overspeedSec = 0;
  flapOverspeedSec = 0;
  steepBankSec = 0;
  /** seconds below DA/MDA without the required visual references */
  belowMinsNoVisualSec = 0;
  visualAtMins: boolean | null = null;
  minsUsed: number | null = null;
  missedAt: number | null = null;
  failuresInjected: string[] = [];
  mode: 'training' | 'checkride' = 'training';
  student = '';
  handFlown = false;
  private stallActive = false;
  /** Live coaching callback (toast) */
  onEvent?: (e: FlightEvent) => void;

  reset() {
    this.samples = [];
    this.events = [];
    this.touchdown = null;
    this.approach = null;
    this.crashed = null;
    this.acc = 0;
    this.flags.clear();
    this.floorViolationSec = this.unstableSec = this.stallSec = this.overspeedSec = this.flapOverspeedSec = this.steepBankSec = 0;
    this.belowMinsAnnounced = false;
    this.lastActive = '';
    this.belowMinsNoVisualSec = 0;
    this.visualAtMins = null;
    this.minsUsed = null;
    this.missedAt = null;
    this.failuresInjected = [];
  }

  start(sim: Sim) {
    this.reset();
    this.wasOnGround = sim.ac.s.onGround;
    this.lastAp = sim.ap.ap;
    this.mode = sim.assess.mode;
    this.student = sim.assess.student;
    this.handFlown = sim.assess.handFlown;
    this.log(sim.time, 'info', `${this.mode === 'checkride' ? 'CHECKRIDE' : 'Training'}: ${sim.scenario?.name ?? 'free flight'}${this.student ? ' — ' + this.student : ''}`);
  }

  log(t: number, kind: FlightEvent['kind'], text: string) {
    const e = { t, kind, text };
    if (text.startsWith('FAILURE')) this.failuresInjected.push(text.replace('FAILURE: ', ''));
    this.events.push(e);
    this.onEvent?.(e);
  }

  private once(key: string, t: number, kind: FlightEvent['kind'], text: string) {
    if (this.flags.has(key)) return;
    this.flags.add(key);
    this.log(t, kind, text);
  }

  phase(sim: Sim): Phase {
    const s = sim.ac.s;
    if (s.onGround) return this.touchdown ? 'landed' : 'ground';
    const fp = sim.fp;
    if (fp.missedActive) return 'missed';
    if (fp.approachActive) {
      const fafIdx = fp.wpts.findIndex((w) => w.role === 'FAF' && w.appr === 'final');
      if (fafIdx >= 0 && fp.active > fafIdx) return 'final';
      return 'initial';
    }
    if (sim.ac.data.aglFt < 1500 && !this.touchdown && this.samples.length < 600 && this.samples[0]?.phase === 'ground')
      return 'departure';
    return 'enroute';
  }

  update(sim: Sim, dt: number) {
    if (dt <= 0) return;
    const s = sim.ac.s;
    const d = sim.ac.data;
    const t = sim.time;
    if (sim.fp.approach && this.approach?.id !== sim.fp.approach.id) this.approach = sim.fp.approach;

    if (s.crashed && !this.crashed) {
      this.crashed = s.crashed;
      this.log(t, 'bad', `CRASH — ${s.crashed}`);
    }

    // ---------- continuous exceedance accounting
    if (!s.onGround) {
      if (d.stallWarn) {
        this.stallSec += dt;
        if (!this.stallActive) this.log(t, 'bad', `Stall warning at ${Math.round(d.iasKt)} KIAS`);
        this.stallActive = true;
      } else this.stallActive = false;
      if (d.iasKt > AIRFRAME.vne) {
        this.overspeedSec += dt;
        this.once('vne', t, 'bad', 'Exceeded VNE');
      }
      if (d.flapsDeg > 1 && d.iasKt > (d.flapsDeg > 11 ? AIRFRAME.vfe : AIRFRAME.vfe10) + 3) {
        this.flapOverspeedSec += dt;
        this.once('vfe' + Math.floor(t / 60), t, 'warn', `Flaps extended above VFE (${Math.round(d.iasKt)} KIAS)`);
      }
      if (Math.abs(d.rollDeg) > 45) {
        this.steepBankSec += dt;
        this.once('bank' + Math.floor(t / 30), t, 'warn', `Bank angle ${Math.round(Math.abs(d.rollDeg))}°`);
      }
    }

    // ---------- autopilot / mode events
    if (sim.ap.ap !== this.lastAp) {
      this.log(t, 'info', sim.ap.ap ? 'Autopilot engaged' : 'Autopilot disconnected');
      this.lastAp = sim.ap.ap;
    }
    if (sim.ap.engaged && sim.ap.lat !== this.lastLat) {
      if (['LOC', 'BC', 'VOR', 'GPS'].includes(sim.ap.lat)) this.log(t, 'good', `${sim.ap.lat} captured`);
      this.lastLat = sim.ap.lat;
    }
    if (sim.ap.engaged && sim.ap.vert !== this.lastVert) {
      if (sim.ap.vert === 'GS' || sim.ap.vert === 'GP') this.log(t, 'good', `${sim.ap.vert === 'GS' ? 'Glideslope' : 'Glidepath'} captured`);
      this.lastVert = sim.ap.vert;
    }
    const active = sim.fp.out.valid ? sim.fp.out.toIdent : '';
    if (active && active !== this.lastActive) {
      if (this.lastActive) {
        const passed = sim.fp.wpts.find((w) => w.ident === this.lastActive);
        if (passed?.role === 'FAF') this.log(t, 'info', `Crossed FAF ${passed.ident} at ${Math.round(sim.indicatedAlt())} ft`);
        else this.log(t, 'info', `Passed ${this.lastActive}`);
      }
      this.lastActive = active;
    }
    if (sim.fp.missedActive && this.missedAt === null) {
      this.missedAt = t;
      this.once('missed', t, 'good', 'Missed approach initiated');
    }

    // ---------- approach floors and minimums
    const ph = this.phase(sim);
    if (ph === 'final' || ph === 'initial') {
      const floor = this.currentFloor(sim);
      if (floor !== null && sim.indicatedAlt() < floor - 100 && !s.onGround) {
        this.floorViolationSec += dt;
        this.once('floor' + floor, t, 'bad', `Descended below ${floor} ft before the fix`);
      }
      const mins = sim.av.minimums;
      if (mins !== null && sim.indicatedAlt() < mins + 100) this.once('mins100', t, 'info', '100 above minimums');
      if (ph === 'final' && mins !== null) this.minsUsed = mins;
      if (ph === 'final' && mins !== null && !s.onGround) {
        const precision = this.vertDots(sim) !== null;
        if (sim.indicatedAlt() < mins - (precision ? 50 : 0) && !sim.hasVisual()) {
          this.belowMinsNoVisualSec += dt;
          this.once('belowmins', t, 'bad', 'Descended below minimums without visual references');
        }
      }
      if (mins !== null && sim.indicatedAlt() < mins && !this.belowMinsAnnounced) {
        this.belowMinsAnnounced = true;
        this.visualAtMins = sim.hasVisual();
        this.log(t, this.visualAtMins ? 'good' : 'warn', this.visualAtMins ? 'Runway environment in sight at minimums' : 'No visual references at minimums — missed approach required');
        const lat = this.latDots(sim);
        const vert = this.vertDots(sim);
        this.log(
          t,
          Math.abs(lat ?? 0) < 1 && Math.abs(vert ?? 0) < 1 ? 'good' : 'warn',
          `Minimums — LAT ${lat === null ? '—' : lat.toFixed(1)} dots, VERT ${vert === null ? '—' : vert.toFixed(1)} dots, ${Math.round(d.iasKt)} KIAS`,
        );
      }
      // stabilized approach below 500 AGL
      if (d.aglFt < 500 && !s.onGround) {
        const lat = Math.abs(this.latDots(sim) ?? 0);
        const vert = Math.abs(this.vertDots(sim) ?? 0);
        const unstable = d.iasKt < 60 || d.iasKt > 105 || d.vsFpm < -1000 || lat > 1 || vert > 1 || Math.abs(d.rollDeg) > 15;
        if (unstable) {
          this.unstableSec += dt;
          this.once('unstable', t, 'warn', 'Unstabilized below 500 AGL — consider a go-around');
        }
      }
    }

    // ---------- takeoff & touchdown
    if (this.wasOnGround && !s.onGround) this.log(t, 'info', `Liftoff at ${Math.round(d.iasKt)} KIAS`);
    if (!this.wasOnGround && s.onGround && !s.crashed) this.recordTouchdown(sim);
    if (s.onGround && this.touchdown && d.gsKt < 2) this.once('stopped', t, 'good', 'Aircraft stopped on the runway');
    this.wasOnGround = s.onGround;

    // ---------- sampling
    this.acc += dt;
    if (this.acc >= DT) {
      this.acc = 0;
      this.samples.push({
        t,
        lat: s.lat,
        lon: s.lon,
        alt: sim.indicatedAlt(),
        agl: d.aglFt,
        ias: d.iasKt,
        vs: d.vsFpm,
        hdg: d.hdgTrue,
        bank: d.rollDeg,
        pitch: d.pitchDeg,
        latDots: this.latDots(sim),
        vertDots: this.vertDots(sim),
        ap: sim.ap.ap,
        phase: ph,
        visual: sim.hasVisual(),
        mins: sim.av.minimums,
      });
      if (this.samples.length > 20000) this.samples.splice(0, 1000);
    }
  }

  /** Lateral deviation in dots (2 dots = full scale) from the CDI source, null when invalid. */
  latDots(sim: Sim): number | null {
    const n = sim.navInputs();
    if (n.cdi === 'GPS') return n.gps.valid ? n.gps.dev * 2 : null;
    return n.nav.valid ? n.nav.dev * 2 : null;
  }

  vertDots(sim: Sim): number | null {
    const n = sim.navInputs();
    if (n.cdi !== 'GPS' && n.nav.gsValid) return n.nav.gsDev * 2;
    if (n.cdi === 'GPS' && n.gps.gpValid) return n.gps.gpDev * 2;
    return null;
  }

  /** Lowest altitude allowed on the current approach segment (null if none). */
  currentFloor(sim: Sim): number | null {
    const fp = sim.fp;
    const to = fp.wpts[fp.active];
    if (!to || !fp.approachActive || fp.missedActive) return null;
    if (to.role === 'MAP') {
      const ap = fp.approach;
      const precision = ap && (ap.type === 'ILS' || (ap.type === 'RNAV' && ap.gsAngle)) && this.vertDots(sim) !== null;
      if (precision) return null; // flying a glidepath: DA applies instead
      return sim.av.minimums;
    }
    return to.altMin ?? null;
  }

  private recordTouchdown(sim: Sim) {
    const s = sim.ac.s;
    const d = sim.ac.data;
    const vs = this.samples.length ? Math.min(...this.samples.slice(-3).map((x) => x.vs)) : d.vsFpm;
    let best: { r: Runway; icao: string; xt: number; at: number } | null = null;
    for (const a of AIRPORTS) {
      for (const r of a.runways) {
        const at = alongTrackNm(r.threshold, r.end, s);
        const xt = crossTrackNm(r.threshold, r.end, s) * FT_PER_NM;
        const hdgOk = Math.abs(((d.hdgTrue - r.heading + 540) % 360) - 180) < 45;
        if (hdgOk && at > -0.2 && at < distanceNm(r.threshold, r.end) + 0.2 && Math.abs(xt) < 400) {
          if (!best || Math.abs(xt) < Math.abs(best.xt)) best = { r, icao: a.icao, xt, at };
        }
      }
    }
    this.touchdown = {
      t: sim.time,
      vsFpm: vs,
      iasKt: d.iasKt,
      centerlineFt: best ? best.xt : NaN,
      fromThresholdFt: best ? best.at * FT_PER_NM : NaN,
      runway: best?.r.id ?? '—',
      airport: best?.icao ?? 'off-airport',
      pitchDeg: d.pitchDeg,
      bankDeg: d.rollDeg,
    };
    const firm = vs < -600 ? 'bad' : vs < -300 ? 'warn' : 'good';
    this.log(
      sim.time,
      firm,
      `Touchdown ${best ? `RWY ${best.r.id} ${best.icao}` : 'off-airport'} at ${Math.round(-vs)} fpm, ${Math.round(d.iasKt)} KIAS` +
        (best ? `, ${Math.round(Math.abs(best.xt))} ft ${best.xt > 0 ? 'right' : 'left'} of centerline` : ''),
    );
  }
}

// ------------------------------------------------------------------ Debrief

export interface ScoreItem {
  label: string;
  value: string;
  penalty: number;
  note?: string;
}

export interface Debrief {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  headline: string;
  items: ScoreItem[];
  tips: string[];
  approachName: string | null;
  durationSec: number;
  finalSamples: Sample[];
}

function rms(v: number[]): number {
  return v.length ? Math.sqrt(v.reduce((a, b) => a + b * b, 0) / v.length) : 0;
}

export function computeDebrief(r: Recorder, minimums: number | null): Debrief {
  const items: ScoreItem[] = [];
  const tips: string[] = [];
  const final = r.samples.filter((s) => s.phase === 'final' && s.agl > 50);
  const lat = final.map((s) => s.latDots).filter((x): x is number => x !== null);
  const vert = final.map((s) => s.vertDots).filter((x): x is number => x !== null);

  if (final.length > 4) {
    const latRms = rms(lat);
    const latMax = Math.max(0, ...lat.map(Math.abs));
    const pen = Math.min(25, latRms * 18 + (latMax > 2 ? 8 : latMax > 1 ? 3 : 0));
    items.push({ label: 'Lateral tracking (final)', value: `${latRms.toFixed(2)} dots RMS · max ${latMax.toFixed(1)}`, penalty: pen });
    if (latRms > 0.5) tips.push('Lateral: make small heading corrections early (5°–10°), and fly the wind correction angle you discovered on the intercept.');
    if (vert.length > 4) {
      const vRms = rms(vert);
      const vMax = Math.max(0, ...vert.map(Math.abs));
      const vp = Math.min(25, vRms * 18 + (vMax > 2 ? 8 : vMax > 1 ? 3 : 0));
      items.push({ label: 'Vertical tracking (final)', value: `${vRms.toFixed(2)} dots RMS · max ${vMax.toFixed(1)}`, penalty: vp });
      if (vRms > 0.5) tips.push('Vertical: set a target descent rate (≈ 5 × groundspeed fpm) and use pitch for the path, power for the speed.');
    }
    const ias = final.map((s) => s.ias);
    const mean = ias.reduce((a, b) => a + b, 0) / ias.length;
    const sd = Math.sqrt(ias.reduce((a, b) => a + (b - mean) ** 2, 0) / ias.length);
    items.push({ label: 'Speed control (final)', value: `${Math.round(mean)} KIAS avg · σ ${sd.toFixed(1)} kt`, penalty: Math.min(10, Math.max(0, sd - 3) * 1.5) });
    if (sd > 5) tips.push('Speed: pick a power setting for the approach (≈ 1700 RPM, flaps 10) and trim for 90 KIAS before the FAF.');
  } else {
    items.push({ label: 'Final approach', value: 'not flown', penalty: 0, note: 'Fly past the FAF with an approach active to get tracking scores.' });
  }

  if (r.floorViolationSec > 0) {
    items.push({ label: 'Altitude floors', value: `${Math.round(r.floorViolationSec)} s below a segment minimum`, penalty: Math.min(30, 15 + r.floorViolationSec) });
    tips.push('Never descend below a segment altitude before crossing its fix — it is the most common cause of CFIT on non-precision approaches.');
  } else if (final.length > 4) items.push({ label: 'Altitude floors', value: 'respected', penalty: 0 });

  if (r.unstableSec > 0) {
    items.push({ label: 'Stabilized below 500 AGL', value: `${Math.round(r.unstableSec)} s unstable`, penalty: Math.min(15, r.unstableSec * 0.8) });
    tips.push('If not stabilized by 500 ft AGL (on speed, on path, < 1000 fpm), go around.');
  }
  if (r.stallSec > 0) items.push({ label: 'Stall warnings', value: `${r.stallSec.toFixed(1)} s`, penalty: Math.min(20, 8 + r.stallSec * 2) });
  if (r.overspeedSec > 0) items.push({ label: 'VNE exceedance', value: `${r.overspeedSec.toFixed(1)} s`, penalty: 15 });
  if (r.flapOverspeedSec > 0) items.push({ label: 'Flap overspeed', value: `${r.flapOverspeedSec.toFixed(1)} s`, penalty: Math.min(8, r.flapOverspeedSec) });
  if (r.steepBankSec > 0) items.push({ label: 'Bank > 45°', value: `${r.steepBankSec.toFixed(1)} s`, penalty: Math.min(10, r.steepBankSec) });

  const td = r.touchdown;
  if (td) {
    const vs = -td.vsFpm;
    items.push({
      label: 'Touchdown rate',
      value: `${Math.round(vs)} fpm`,
      penalty: vs > 600 ? 15 : vs > 400 ? 6 : vs > 250 ? 2 : 0,
      note: vs < 150 ? 'Butter.' : undefined,
    });
    if (Number.isFinite(td.centerlineFt)) {
      const cl = Math.abs(td.centerlineFt);
      items.push({ label: 'Centerline', value: `${Math.round(cl)} ft ${td.centerlineFt > 0 ? 'right' : 'left'}`, penalty: cl > 40 ? 8 : cl > 15 ? 3 : 0 });
      const tdz = td.fromThresholdFt;
      items.push({
        label: 'Touchdown zone',
        value: `${Math.round(tdz)} ft past threshold`,
        penalty: tdz < 0 ? 15 : tdz > 3000 ? 8 : tdz > 2000 ? 2 : 0,
        note: tdz < 0 ? 'Landed short!' : undefined,
      });
    } else {
      items.push({ label: 'Runway', value: 'off-airport landing', penalty: 40 });
    }
    if (vs > 400) tips.push('Flare: at ~20 ft reduce power to idle and gradually raise the nose to hold the aircraft just off the runway.');
  }

  if (r.belowMinsNoVisualSec > 0) {
    items.push({ label: 'Below minimums without visual', value: `${Math.round(r.belowMinsNoVisualSec)} s`, penalty: 35 });
    tips.push('At DA/MDA without the runway environment in sight: go around immediately (G). Never "duck under".');
  }
  if (r.visualAtMins === false && r.missedAt === null) items.push({ label: 'Missed approach', value: 'required but not flown', penalty: 25 });
  if (r.crashed) items.push({ label: 'Outcome', value: r.crashed, penalty: 100 });

  const penalty = items.reduce((a, b) => a + b.penalty, 0);
  const score = Math.max(0, Math.round(100 - penalty));
  const grade = r.crashed ? 'F' : score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  const headline = r.crashed
    ? 'Flight ended in an accident.'
    : grade === 'A'
      ? 'Checkride standard. Nicely flown.'
      : grade === 'B'
        ? 'Solid approach with a few things to polish.'
        : grade === 'C'
          ? 'Acceptable, but outside ACS tolerances in places.'
          : 'Needs work — review the tips below and fly it again.';
  if (minimums !== null && !tips.length && final.length > 4) tips.push('Try it again with lower ceilings and a gusty crosswind, hand-flown with the autopilot off.');
  const t0 = r.samples[0]?.t ?? 0;
  const t1 = r.samples[r.samples.length - 1]?.t ?? 0;
  return {
    score,
    grade,
    headline,
    items,
    tips,
    approachName: r.approach ? `${r.approach.airport} ${r.approach.name}` : null,
    durationSec: t1 - t0,
    finalSamples: final,
  };
}

export function thresholdOf(ap: Approach): LatLon & { elev: number; heading: number } {
  const rw = getRunway(ap.airport, ap.runway);
  return { ...rw.threshold, elev: rw.elevFt, heading: rw.heading };
}

// ------------------------------------------------------------------ ACS evaluation

export interface AcsItem {
  task: string;
  standard: string;
  actual: string;
  result: 'PASS' | 'FAIL' | 'N/A';
}

export interface AcsReport {
  result: 'PASS' | 'FAIL' | 'INCOMPLETE';
  items: AcsItem[];
}

/**
 * Evaluates the flight against FAA Instrument Rating ACS-style tolerances
 * (IR.VI.A/B instrument approaches, IR.VI.C missed approach, IR.VII emergency/partial panel).
 */
export function evaluateAcs(r: Recorder): AcsReport {
  const items: AcsItem[] = [];
  const minsOf = (s: Sample) => s.mins ?? r.minsUsed;
  const final = r.samples.filter((s) => s.phase === 'final' && !(minsOf(s) !== null && s.alt < (minsOf(s) as number)) && s.agl > 100);
  const ap = r.approach;
  const precision = final.some((s) => s.vertDots !== null);
  if (r.crashed) items.push({ task: 'Aircraft control', standard: 'Complete the flight without an accident', actual: r.crashed, result: 'FAIL' });

  if (final.length >= 4) {
    const lat = final.map((s) => Math.abs(s.latDots ?? 0));
    const maxLat = Math.max(...lat);
    items.push({ task: 'Lateral guidance FAF → minimums', standard: '≤ ¾-scale CDI deflection (1.5 dots)', actual: `max ${maxLat.toFixed(2)} dots`, result: maxLat <= 1.5 ? 'PASS' : 'FAIL' });
    if (precision) {
      const vert = final.filter((s) => s.vertDots !== null).map((s) => Math.abs(s.vertDots as number));
      const maxV = Math.max(...vert);
      items.push({ task: 'Vertical guidance FAF → DA', standard: '≤ ¾-scale GS/GP deflection (1.5 dots)', actual: `max ${maxV.toFixed(2)} dots`, result: maxV <= 1.5 ? 'PASS' : 'FAIL' });
    }
    const ias = final.map((s) => s.ias).sort((a, b) => a - b);
    const med = ias[Math.floor(ias.length / 2)];
    const dev = Math.max(...ias.map((v) => Math.abs(v - med)));
    items.push({ task: 'Airspeed on final', standard: `±10 KIAS of approach speed (${Math.round(med)})`, actual: `max ±${dev.toFixed(0)} kt`, result: dev <= 10 ? 'PASS' : 'FAIL' });
  } else if (ap) {
    items.push({ task: 'Final approach segment', standard: 'Fly the final approach segment', actual: 'not flown', result: 'N/A' });
  }

  if (ap) {
    items.push({ task: 'Published altitudes', standard: 'No descent below a segment minimum before the fix (−100 ft)', actual: r.floorViolationSec > 0 ? `${Math.round(r.floorViolationSec)} s below` : 'respected', result: r.floorViolationSec > 0 ? 'FAIL' : 'PASS' });
    if (r.minsUsed !== null && (final.length >= 4 || r.belowMinsAnnounced)) {
      items.push({
        task: precision ? 'Decision altitude' : 'Minimum descent altitude',
        standard: precision ? 'No descent below DA without visual references' : 'No descent below MDA without visual references',
        actual: r.belowMinsNoVisualSec > 0 ? `${Math.round(r.belowMinsNoVisualSec)} s below without visual` : `respected (${r.minsUsed} ft)`,
        result: r.belowMinsNoVisualSec > 0 ? 'FAIL' : 'PASS',
      });
    }
    if (r.visualAtMins === false) {
      items.push({ task: 'Missed approach', standard: 'Execute the missed approach promptly at DA/MAP without visual references', actual: r.missedAt !== null ? 'executed' : 'not executed', result: r.missedAt !== null ? 'PASS' : 'FAIL' });
    } else if (r.missedAt !== null) {
      items.push({ task: 'Missed approach', standard: 'Execute the published missed approach', actual: 'executed', result: 'PASS' });
    }
    if (r.belowMinsAnnounced && r.unstableSec > 3)
      items.push({ task: 'Stabilized approach', standard: 'Stable below 500 AGL (speed, path, < 1000 fpm)', actual: `${Math.round(r.unstableSec)} s unstable`, result: 'FAIL' });
  }
  const loc = r.stallSec > 0 || r.steepBankSec > 2 || r.overspeedSec > 0;
  items.push({ task: 'Loss-of-control avoidance', standard: 'No stall warning, bank ≤ 45°, no VNE exceedance', actual: loc ? [r.stallSec > 0 && 'stall warning', r.steepBankSec > 2 && 'steep bank', r.overspeedSec > 0 && 'overspeed'].filter(Boolean).join(', ') : 'none', result: loc ? 'FAIL' : 'PASS' });
  if (r.failuresInjected.length)
    items.push({ task: 'Abnormal / partial panel', standard: 'Maintain control and complete the procedure', actual: r.failuresInjected.join(', '), result: r.crashed ? 'FAIL' : 'PASS' });
  if (r.touchdown) {
    const td = r.touchdown;
    const ok = Number.isFinite(td.centerlineFt) && td.vsFpm > -600 && td.fromThresholdFt > 0;
    items.push({ task: 'Landing from instrument approach', standard: 'On the runway, past the threshold, < 600 fpm', actual: Number.isFinite(td.centerlineFt) ? `${Math.round(-td.vsFpm)} fpm, ${Math.round(td.fromThresholdFt)} ft past threshold` : 'off runway', result: ok ? 'PASS' : 'FAIL' });
  }
  if (r.handFlown) items.push({ task: 'Hand-flown', standard: 'Autopilot not used', actual: r.samples.some((s) => s.ap) ? 'autopilot used' : 'hand-flown', result: r.samples.some((s) => s.ap) ? 'FAIL' : 'PASS' });

  const graded = items.filter((i) => i.result !== 'N/A');
  const anyFail = graded.some((i) => i.result === 'FAIL');
  const flownEnough = final.length >= 4 || !!r.touchdown || !!r.crashed || r.missedAt !== null;
  return { result: anyFail ? 'FAIL' : flownEnough ? 'PASS' : 'INCOMPLETE', items };
}
