// Lesson engine: an exercise is a sequence of steps with completion conditions and tolerances.
import type { Sim, Scenario, Failures } from '../sim/sim';
import { holdSetup, approachSetup, type SetupItem } from './setupAssist';
import type { FlightData } from '../sim/aircraft';
import type { Weather } from '../sim/environment';
import { wrap180, distanceNm, bearingDeg, destination, DEG, type LatLon } from '../nav/geo';
import { computeNav } from '../nav/radios';
import { HoldEvaluator } from './holdEval';
import { holdEntry, type HoldDef } from '../nav/holding';
import { evaluateAcs, type AcsReport } from '../sim/recorder';

export interface Ctx {
  sim: Sim;
  d: FlightData;
  /** seconds since the step started */
  t: number;
  dt: number;
  mem: Record<string, number | boolean | string>;
  run: LessonRun;
}

export interface Step {
  text: string;
  hint?: string;
  onStart?: (c: Ctx) => void;
  done: (c: Ctx) => boolean;
  /** returns a short violation description when out of tolerance */
  check?: (c: Ctx) => string | null;
  /** grace period before tolerances apply */
  graceSec?: number;
  /** live readouts for the HUD */
  readout?: (c: Ctx) => string;
  /** setup assistant: what to configure for this step (source, frequency, course, altitude, entry), checked live */
  setup?: (c: Ctx) => SetupItem[];
}

export interface Quiz {
  question: string;
  options: string[];
  answer: number;
  explain: string;
  /** optional SVG shown with the explanation */
  svg?: string;
}

export interface Exercise {
  id: string;
  stage: string;
  title: string;
  summary: string;
  objectives: string[];
  standards: string[];
  briefing: string[];
  plate?: string;
  allowAp: boolean;
  /** builds the starting state; may randomise and returns runtime data (e.g. hold clearance) */
  setup: (sim: Sim) => ExerciseRuntime;
  minutes: number;
}

export interface ExerciseRuntime {
  steps: Step[];
  quiz?: Quiz;
  hold?: HoldDef;
  clearance?: string;
  acs?: boolean;
  /** allowed violation seconds before failing */
  allowanceSec?: number;
  /** called every frame (e.g. scheduled failures) */
  tick?: (c: Ctx) => void;
}

export interface StepResult {
  text: string;
  done: boolean;
  violationSec: number;
  worst: string | null;
}

export interface LessonResult {
  passed: boolean;
  score: number;
  steps: StepResult[];
  holdReport?: { label: string; value: string; ok: boolean | null }[];
  acs?: AcsReport;
  reason: string;
  durationSec: number;
}

export class LessonRun {
  rt: ExerciseRuntime;
  idx = 0;
  stepT = 0;
  totalT = 0;
  results: StepResult[];
  mem: Record<string, number | boolean | string> = {};
  holdEval: HoldEvaluator | null = null;
  finished: LessonResult | null = null;
  currentViolation: string | null = null;

  constructor(public ex: Exercise, public sim: Sim) {
    this.rt = ex.setup(sim);
    this.results = this.rt.steps.map((s) => ({ text: s.text, done: false, violationSec: 0, worst: null }));
    if (this.rt.hold) this.holdEval = new HoldEvaluator(this.rt.hold);
    sim.ap.inhibited = ex.allowAp ? sim.ap.inhibited : 'AP NOT ALLOWED';
    this.started = false;
  }
  private started: boolean;

  get step(): Step | null {
    return this.rt.steps[this.idx] ?? null;
  }

  ctx(dt: number): Ctx {
    return { sim: this.sim, d: this.sim.ac.data, t: this.stepT, dt, mem: this.mem, run: this };
  }

  update(dt: number) {
    if (this.finished || dt <= 0) return;
    const sim = this.sim;
    if (!this.ex.allowAp) {
      sim.ap.inhibited = 'AP NOT ALLOWED';
      if (sim.ap.ap) sim.ap.disconnect();
    }
    this.totalT += dt;
    const d = sim.ac.data;
    this.rt.tick?.(this.ctx(dt));
    this.holdEval?.update({ lat: sim.ac.s.lat, lon: sim.ac.s.lon, alt: sim.indicatedAlt(), track: d.trackTrue, turnRate: d.turnRateDps, gsKt: d.gsKt, t: sim.time }, dt);
    const st = this.step;
    if (!st) return this.finish();
    const c = this.ctx(dt);
    if (!this.started) {
      st.onStart?.(c);
      this.started = true;
    }
    this.stepT += dt;
    this.currentViolation = null;
    if (st.check && this.stepT > (st.graceSec ?? 8)) {
      const v = st.check(c);
      if (v) {
        this.currentViolation = v;
        const r = this.results[this.idx];
        r.violationSec += dt;
        r.worst ??= v;
      }
    }
    if (sim.ac.s.crashed) return this.finish(`Crash: ${sim.ac.s.crashed}`);
    if (st.done(c)) {
      this.results[this.idx].done = true;
      this.idx++;
      this.stepT = 0;
      this.started = false;
      if (this.idx >= this.rt.steps.length) this.finish();
    }
  }

  abort() {
    this.finish('Aborted');
  }

  finish(reason?: string) {
    if (this.finished) return;
    const viol = this.results.reduce((a, b) => a + b.violationSec, 0);
    const allowance = this.rt.allowanceSec ?? 15;
    const allDone = this.results.every((r) => r.done);
    const holdReport = this.holdEval?.report();
    const holdOk = !holdReport || holdReport.every((r) => r.ok !== false);
    const acs = this.rt.acs ? evaluateAcs(this.sim.rec) : undefined;
    const acsOk = !acs || acs.result === 'PASS';
    const crashed = !!this.sim.ac.s.crashed;
    let score = 100 - Math.min(60, viol * 1.5) - (holdReport ? holdReport.filter((r) => r.ok === false).length * 12 : 0) - (acs ? acs.items.filter((i) => i.result === 'FAIL').length * 15 : 0);
    if (!allDone) score -= 30;
    if (crashed) score = 0;
    score = Math.max(0, Math.round(score));
    const passed = allDone && !crashed && viol <= allowance && holdOk && acsOk;
    this.finished = {
      passed,
      score,
      steps: this.results,
      holdReport,
      acs,
      reason: reason ?? (passed ? 'All standards met' : !allDone ? 'Not all steps completed' : viol > allowance ? `Out of tolerance for ${Math.round(viol)} s (allowed ${allowance} s)` : !holdOk ? 'Holding standards not met' : 'ACS standards not met'),
      durationSec: this.totalT,
    };
  }
}

// ------------------------------------------------------------------ step builders
const fmtHdg = (h: number) => String(Math.round(((h % 360) + 360) % 360) || 360).padStart(3, '0');
const hdgErr = (d: FlightData, h: number) => Math.abs(wrap180(d.hdgTrue - h));

export interface Tol {
  alt?: number;
  hdg?: number;
  ias?: number;
}

export function devCheck(c: Ctx, target: { alt?: number; hdg?: number; ias?: number }, tol: Tol = {}): string | null {
  const ta = tol.alt ?? 100;
  const th = tol.hdg ?? 10;
  const ti = tol.ias ?? 10;
  if (target.alt !== undefined) {
    const e = c.sim.indicatedAlt() - target.alt;
    if (Math.abs(e) > ta) return `Altitude ${e > 0 ? '+' : ''}${Math.round(e)} ft`;
  }
  if (target.hdg !== undefined) {
    const e = wrap180(c.d.hdgTrue - target.hdg);
    if (Math.abs(e) > th) return `Heading ${e > 0 ? '+' : ''}${Math.round(e)}°`;
  }
  if (target.ias !== undefined) {
    const e = c.d.iasKt - target.ias;
    if (Math.abs(e) > ti) return `Airspeed ${e > 0 ? '+' : ''}${Math.round(e)} kt`;
  }
  if (c.d.stallWarn) return 'Stall warning';
  return null;
}

export const S = {
  maintain(alt: number, hdg: number, ias: number, sec: number, tol: Tol = {}): Step {
    return {
      text: `Maintain ${alt} ft, heading ${fmtHdg(hdg)}, ${ias} KIAS for ${Math.round(sec / 60) || sec + ' s'}${sec >= 60 ? ' min' : ''}`,
      hint: 'Attitude + power = performance. Small corrections, then trim.',
      done: (c) => c.t >= sec,
      check: (c) => devCheck(c, { alt, hdg, ias }, tol),
      readout: (c) => `${Math.round(sec - c.t)} s left`,
    };
  },
  turnTo(hdg: number, dir: 'L' | 'R' | null, alt: number, opts: { maxBank?: number; ias?: number } = {}): Step {
    return {
      text: `${dir === 'L' ? 'Turn left' : dir === 'R' ? 'Turn right' : 'Turn'} to heading ${fmtHdg(hdg)} at standard rate, maintain ${alt} ft`,
      hint: 'Standard rate ≈ 15° of bank at 90 KIAS (TAS/10 + 7). Lead the roll-out by ½ the bank angle.',
      done: (c) => hdgErr(c.d, hdg) < 5 && Math.abs(c.d.rollDeg) < 5,
      check: (c) => {
        if (Math.abs(c.d.rollDeg) > (opts.maxBank ?? 30)) return `Bank ${Math.round(Math.abs(c.d.rollDeg))}° (max ${opts.maxBank ?? 30})`;
        if (dir && c.t < 6 && Math.abs(c.d.rollDeg) > 5 && Math.sign(c.d.rollDeg) !== (dir === 'R' ? 1 : -1)) return 'Turning the wrong way';
        return devCheck(c, { alt, ias: opts.ias }, {});
      },
      graceSec: 3,
    };
  },
  changeAlt(target: number, ias: number, hdg: number | null, vs?: number): Step {
    return {
      text: `${vs && vs < 0 ? 'Descend' : 'Climb'} to ${target} ft at ${ias} KIAS${vs ? `, ${Math.abs(vs)} fpm` : ''}${hdg !== null ? `, heading ${fmtHdg(hdg)}` : ''}`,
      hint: 'Climb: power first, then pitch for airspeed. Descent: reduce power, pitch for the rate. Level off at 10% of VS before the target.',
      done: (c) => Math.abs(c.sim.indicatedAlt() - target) < 40 && Math.abs(c.d.vsFpm) < 250,
      check: (c) => {
        const r = devCheck(c, { ias, hdg: hdg ?? undefined }, { ias: 10 });
        if (r) return r;
        if (vs && Math.abs(c.sim.indicatedAlt() - target) > 200 && Math.abs(c.d.vsFpm - vs) > 250) return `Vertical speed ${Math.round(c.d.vsFpm)} fpm`;
        return null;
      },
    };
  },
  steepTurn(dir: 'L' | 'R', alt: number, degrees = 360): Step {
    return {
      text: `Steep turn ${dir === 'L' ? 'left' : 'right'} ${degrees}° at 45° bank, maintain ${alt} ft (±100), roll out on the entry heading (±10°)`,
      hint: 'Add back pressure and ~100 RPM as you pass 30° of bank. Lead the roll-out by 20°.',
      onStart: (c) => {
        c.mem.entry = c.d.hdgTrue;
        c.mem.turned = 0;
      },
      done: (c) => {
        c.mem.turned = (c.mem.turned as number) + Math.abs(c.d.turnRateDps) * c.dt;
        return (c.mem.turned as number) > degrees - 15 && hdgErr(c.d, c.mem.entry as number) < 10 && Math.abs(c.d.rollDeg) < 10;
      },
      check: (c) => {
        const a = devCheck(c, { alt }, { alt: 100 });
        if (a) return a;
        const turned = c.mem.turned as number;
        if (turned > 30 && turned < degrees - 40 && Math.abs(Math.abs(c.d.rollDeg) - 45) > 7) return `Bank ${Math.round(Math.abs(c.d.rollDeg))}° (45 ±7)`;
        return null;
      },
      readout: (c) => `${Math.round(c.mem.turned as number)}° turned`,
      graceSec: 4,
    };
  },
  recover(): Step {
    return {
      text: 'RECOVER from the unusual attitude: wings level, pitch on the horizon, airspeed in the green',
      hint: 'Nose high: power up, nose down, level the wings. Nose low: power idle, level the wings, then raise the nose.',
      done: (c) => Math.abs(c.d.rollDeg) < 8 && Math.abs(c.d.pitchDeg) < 6 && c.d.iasKt > 60 && c.d.iasKt < 130 && Math.abs(c.d.vsFpm) < 600,
      check: (c) => (c.d.stallWarn ? 'Stall' : c.d.iasKt > 155 ? 'Overspeed' : c.d.aglFt < 500 ? 'Too low' : null),
      graceSec: 0,
    };
  },
  trackRadial(nav: string, freq: number, radial: number, mode: 'TO' | 'FROM', untilDme: number | null, alt: number, label?: string): Step {
    return {
      text: label ?? `Intercept and track the ${fmtHdg(radial)} radial ${mode === 'TO' ? 'inbound to' : 'outbound from'} ${nav}${untilDme ? ` ${mode === 'TO' ? 'to' : 'until'} ${untilDme} DME` : ''}, maintain ${alt} ft`,
      hint: 'Set CRS, CDI on NAV1. Intercept at 30–45°, then bracket: find the wind correction angle and hold it.',
      onStart: (c) => {
        c.sim.av.nav1.active = freq;
        c.sim.av.obs1 = mode === 'TO' ? (radial + 180) % 360 || 360 : radial;
        c.sim.setCdi('NAV1');
      },
      done: (c) => {
        const n = c.sim.nav1;
        if (!n.valid) return false;
        if (Math.abs(n.dev) < 0.25) c.mem.captured = true;
        if (!c.mem.captured) return false;
        if (untilDme === null) return c.t > 150;
        return mode === 'FROM' ? (n.dmeNm ?? 0) >= untilDme : (n.dmeNm ?? 99) <= untilDme;
      },
      check: (c) => {
        const a = devCheck(c, { alt });
        if (a) return a;
        if (c.mem.captured && Math.abs(c.sim.nav1.dev) > 0.75) return `CDI ${(c.sim.nav1.dev * 2).toFixed(1)} dots (max 1.5)`;
        return null;
      },
      readout: (c) => `${c.mem.captured ? 'tracking' : 'intercepting'} · R-${fmtHdg(c.sim.nav1.radial)} · ${c.sim.nav1.dmeNm?.toFixed(1) ?? '—'} DME`,
      graceSec: 5,
    };
  },
  dmeArc(nav: LatLon & { ident: string }, freq: number, radius: number, endRadial: number, dir: 'L' | 'R', alt: number): Step {
    return {
      text: `Fly the ${radius} DME arc ${dir === 'L' ? 'counter-clockwise' : 'clockwise'} around ${nav.ident} to R-${fmtHdg(endRadial)}, maintain ${alt} ft (±1 NM)`,
      hint: 'Keep the RMI/bearing needle on the wingtip reference: turn 10° toward the station each time it falls 10° behind.',
      onStart: (c) => {
        c.sim.av.nav1.active = freq;
        c.sim.av.bearing1 = 'NAV1';
      },
      done: (c) => {
        const rad = bearingDeg(nav, c.sim.ac.s);
        return Math.abs(wrap180(rad - endRadial)) < 3;
      },
      check: (c) => {
        const r = distanceNm(nav, c.sim.ac.s);
        if (Math.abs(r - radius) > 1) return `Arc ${r > radius ? '+' : ''}${(r - radius).toFixed(1)} NM`;
        return devCheck(c, { alt });
      },
      readout: (c) => `${distanceNm(nav, c.sim.ac.s).toFixed(1)} DME · R-${fmtHdg(bearingDeg(nav, c.sim.ac.s))}`,
      graceSec: 20,
    };
  },
  ndbTrack(ndbFreq: number, bearingTo: number, alt: number, untilNm: number, ndb: LatLon & { ident: string }): Step {
    return {
      text: `Track ${fmtHdg(bearingTo)}° inbound to the ${ndb.ident} NDB (QDM) using the ADF needle, maintain ${alt} ft`,
      hint: 'Set BRG1 = ADF. Intercept, then hold a heading that keeps the needle steady; correct for drift.',
      onStart: (c) => {
        c.sim.av.adf.active = ndbFreq;
        c.sim.av.bearing1 = 'ADF';
      },
      done: (c) => distanceNm(c.sim.ac.s, ndb) < untilNm,
      check: (c) => {
        const a = devCheck(c, { alt });
        if (a) return a;
        const off = wrap180(bearingDeg(ndb, c.sim.ac.s) - (bearingTo + 180));
        if (c.t > 60 && Math.abs(off) > 5) return `Off course ${Math.round(off)}°`;
        return null;
      },
      readout: (c) => `QDM ${fmtHdg(c.sim.adf.bearingTo)} · ${distanceNm(c.sim.ac.s, ndb).toFixed(1)} NM`,
      graceSec: 10,
    };
  },
  hold(def: HoldDef, laps: number): Step {
    return {
      text: `Enter and fly the hold at ${def.fix.ident}: ${laps} complete circuits, ${def.altFt} ft, ${def.legMin}-minute inbound legs`,
      hint: 'Six Ts at the fix: Turn, Time, Twist (CRS), Throttle, Talk, Track. Adjust the outbound time to get 1:00 inbound.',
      done: (c) => (c.run.holdEval?.laps ?? 0) >= laps,
      setup: (c) => holdSetup(c.sim, def),
      check: (c) => devCheck(c, { alt: def.altFt }),
      readout: (c) => {
        const h = c.run.holdEval;
        if (!h) return '';
        if (h.crossedAt === null) return `to ${def.fix.ident} ${distanceNm(c.sim.ac.s, def.fix).toFixed(1)} NM · planned entry ${holdEntry(def.inbound, def.turn, bearingDeg(c.sim.ac.s, def.fix))}`;
        const last = h.inboundTimes[h.inboundTimes.length - 1];
        return `lap ${h.laps}/${laps}${last ? ` · last inbound ${Math.round(last)} s` : ''}`;
      },
      graceSec: 10,
    };
  },
  approach(goAround: boolean): Step {
    return {
      text: goAround ? 'Fly the approach to minimums and execute the missed approach if not visual' : 'Fly the approach and land (or go around if not visual at minimums)',
      hint: 'Brief the plate: frequencies, course, FAF altitude, minimums, missed approach. Stabilized by 1000 ft AGL.',
      setup: (c) => (c.sim.fp.approachId ? approachSetup(c.sim, c.sim.fp.approachId) : []),
      done: (c) => {
        const r = c.sim.rec;
        if (r.touchdown && c.sim.ac.s.onGround && c.d.gsKt < 5) return true;
        if (r.missedAt !== null && c.sim.ac.data.aglFt > 1000 && c.sim.time - r.missedAt > 40) return true;
        return false;
      },
      readout: (c) => {
        const g = c.sim.fp.out;
        return g.valid ? `${g.toIdent} ${g.distNm.toFixed(1)} NM · mins ${c.sim.av.minimums ?? '—'}` : '';
      },
    };
  },
  missedHold(laps: number, def: HoldDef): Step {
    return { ...S.hold(def, laps), text: `Missed approach: climb to ${def.altFt}, proceed to ${def.fix.ident} and hold (${laps} circuit${laps > 1 ? 's' : ''})` };
  },
  locIntercept(freq: number, course: number, fix: LatLon & { ident: string }, alt: number, maxOvershootDots = 1): Step {
    return {
      text: `Intercept the localizer (CRS ${fmtHdg(course)}) and track it to ${fix.ident} at ${alt} ft — no overshoot`,
      hint: 'Start the turn when the CDI comes alive (≈ 1 dot): lead the turn by the needle rate, not its position.',
      setup: (c) => [
        { label: `NAV1 ${freq.toFixed(2)}`, detail: 'Localizer tuned and identified.', ok: Math.abs(c.sim.av.nav1.active - freq) < 0.006 && c.sim.nav1.valid },
        { label: `CRS ${fmtHdg(course)}`, detail: 'Front course of the localizer.', ok: Math.abs(((c.sim.av.obs1 - course + 540) % 360) - 180) <= 2 },
        { label: 'CDI on NAV1', ok: c.sim.av.cdi === 'NAV1' },
      ],
      onStart: (c) => {
        c.sim.av.nav1.active = freq;
        c.sim.av.obs1 = course;
        c.sim.setCdi('NAV1');
      },
      done: (c) => distanceNm(c.sim.ac.s, fix) < 0.6,
      check: (c) => {
        const a = devCheck(c, { alt });
        if (a) return a;
        const dev = c.sim.nav1.dev;
        if (c.sim.nav1.valid && Math.abs(dev) < 0.15) c.mem.captured = true;
        if (c.mem.captured && Math.abs(dev) * 2 > maxOvershootDots) return `Overshoot ${(Math.abs(dev) * 2).toFixed(1)} dots (max ${maxOvershootDots})`;
        return null;
      },
      readout: (c) => `${c.mem.captured ? 'established' : 'intercepting'} · ${(c.sim.nav1.dev * 2).toFixed(1)} dots · ${distanceNm(c.sim.ac.s, fix).toFixed(1)} NM to ${fix.ident}`,
      graceSec: 3,
    };
  },
  takeoff(alt: number, hdg: number): Step {
    return {
      text: `Take off, climb runway heading ${fmtHdg(hdg)} at 74 KIAS (Vy) to ${alt} ft`,
      hint: 'Full power, rotate at 55, ~8° nose up. Positive rate → flaps up. Instruments only after 400 ft.',
      done: (c) => Math.abs(c.sim.indicatedAlt() - alt) < 60 && Math.abs(c.d.vsFpm) < 300,
      check: (c) => (c.sim.ac.s.onGround ? null : c.d.aglFt > 400 ? devCheck(c, { hdg, ias: 74 }, { ias: 10, hdg: 10 }) : null),
      graceSec: 5,
    };
  },
  direct(ident: string, alt: number, setup: (c: Ctx) => void, untilNm = 1): Step {
    return {
      text: `Proceed direct ${ident} at ${alt} ft`,
      onStart: setup,
      done: (c) => c.sim.fp.out.valid && c.sim.fp.out.toIdent === ident && c.sim.fp.out.distNm < untilNm,
      check: (c) => devCheck(c, { alt }),
      readout: (c) => (c.sim.fp.out.valid ? `${c.sim.fp.out.toIdent} ${c.sim.fp.out.distNm.toFixed(1)} NM` : 'press D→'),
      graceSec: 30,
    };
  },
};

// ------------------------------------------------------------------ scenario helpers
export function startAt(
  sim: Sim,
  o: { pos: LatLon; altFt: number; hdg: number; iasKt: number; onGround?: boolean; weather?: Partial<Weather>; failures?: Partial<Failures>; setup?: (s: Sim) => void },
) {
  const sc: Scenario = {
    id: 'lesson',
    name: 'Lesson',
    description: '',
    kind: 'Free flight',
    difficulty: 1,
    pos: o.pos,
    altFt: o.altFt,
    hdg: o.hdg,
    iasKt: o.iasKt,
    onGround: o.onGround,
    weather: { ceilingFt: 20000, visibilitySm: 10, windKt: 0, gustKt: 0, turbulence: 0.08, ...o.weather },
    briefing: [],
    setup: (s) => {
      s.av.minimums = null;
      s.av.baro = s.weather.qnh;
      o.setup?.(s);
    },
  };
  sim.load(sc);
  if (o.failures) for (const [k, v] of Object.entries(o.failures)) sim.setFailure(k as keyof Failures, !!v);
}

export function setAttitude(sim: Sim, pitchDeg: number, bankDeg: number, iasKt: number) {
  const s = sim.ac.s;
  s.theta = pitchDeg * DEG;
  s.gamma = pitchDeg * 0.7 * DEG;
  s.phi = bankDeg * DEG;
  s.tas = iasKt * 0.5144 * 1.06;
  s.q = 0;
  s.p = 0;
}

export function radialQuiz(sim: Sim, navIdent: string, navPos: LatLon, freq: number): Quiz {
  const n = computeNav(freq, 0, { ...sim.ac.s, altFt: sim.ac.s.altFt });
  const r = Math.round(n.radial / 10) * 10;
  const opts = [r, (r + 180) % 360, (r + 90) % 360, (r + 270) % 360].map((x) => x || 360);
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  void navPos;
  return {
    question: `Orientation: you are tuned to ${navIdent}. Which radial are you closest to?  (Hint: centre the CDI with a FROM flag, or read the bearing pointer tail.)`,
    options: order.map((i) => `R-${fmtHdg(opts[i])}`),
    answer: order.indexOf(0),
    explain: `You are on (about) R-${fmtHdg(r)}: the radial is the magnetic bearing FROM the station. A TO indication with CRS ${fmtHdg(r + 180)} gives the same picture.`,
  };
}

export { fmtHdg, destination };
