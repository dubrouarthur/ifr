// Lesson engine: an exercise is a sequence of steps with completion conditions and tolerances.
import { defaultAvionics, type Sim, type Scenario, type Failures, type Avionics } from '../sim/sim';
import { holdSetup, approachSetup, type SetupItem } from './setupAssist';
import type { FlightData } from '../sim/aircraft';
import type { Weather } from '../sim/environment';
import { wrap180, distanceNm, bearingDeg, destination, DEG, type LatLon } from '../nav/geo';
import { computeNav } from '../nav/radios';
import { HoldEvaluator } from './holdEval';
import { holdEntry, type HoldDef } from '../nav/holding';
import { evaluateAcs, type AcsReport } from '../sim/recorder';
import { FAILURE_LABELS_EN, FAILURE_LABELS_FR, type FailureKey } from '../sim/systemsTypes';
import type { DrillFailureSpec, DrillMode } from './procedureTypes';
import { pickProcedure, simView } from './procedures';
import { effectiveProcedures } from './procedureStore';
import { lang as uiLang } from '../ui/i18n';

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
  /** a sustained deviation: out of tolerance longer than this (s) on this one step fails the exercise, whatever
   *  the allowance of the whole exercise (ACS: a momentary deviation corrected at once is not a failure) */
  limitSec?: number;
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
  /** scheduled failures of the flight (failure drills and any circuit with failures) as planned for this attempt */
  drill?: DrillRuntime;
}

// ------------------------------------------------------------------ failure drills (runtime contract)
// A circuit's failures become a DrillRuntime when the exercise is set up: random times and random keys are drawn
// once per attempt from a recorded seed. LessonRun fires them (fireDrill) and calls `onDrillFailure`, the hook the
// in-flight procedure runner (DrillSession) listens to. Instructor-triggered failures never fire on their own: the
// instructor drawer / phone lists `instructorFailures()` and calls `fireInstructorFailure(index)`.

/** one scheduled failure as planned for this attempt */
export interface DrillPlanItem {
  /** index in circuit.failures */
  index: number;
  /** the failure (a random pick from `pool` already resolved) */
  key: FailureKey;
  trigger: DrillFailureSpec['trigger'];
  /** procedure id expected (undefined: the one that applies, chosen when it fires) */
  expect?: string;
  /** not announced to the student */
  hidden?: boolean;
  /** time trigger / random draw: when it fires, minutes after the start */
  atMin?: number;
  /** random window of the spec (minutes) */
  window?: [number, number];
  /** the key was drawn from a group */
  drawn?: boolean;
  fired: boolean;
  /** sim time (s) it fired, null while pending */
  firedAtS: number | null;
}

export interface DrillRuntime {
  /** training shows the checklist, test hides it (the circuit's `drill.mode`; plain circuits: training) */
  mode: DrillMode;
  /** true for a flight made as a failure drill (Circuit.drill), false for a plain circuit with failures */
  isDrill: boolean;
  /** seed of the random draws of this attempt (recorded: the same seed replays the same failures) */
  seed: number;
  plan: DrillPlanItem[];
}

/** what `onDrillFailure` receives (also kept in LessonRun.drillLog) */
export interface DrillFailureEvent {
  index: number;
  key: FailureKey;
  /** procedure id asked for by the drill (undefined = automatic) */
  expect?: string;
  mode: DrillMode;
  isDrill: boolean;
  trigger: DrillFailureSpec['trigger'];
  /** sim time (s) */
  atS: number;
  /** the procedure that applies now (club first, phase-aware), as announced to the student in training */
  procedureId: string | null;
  procedureTitle: string | null;
  /** fired by the instructor */
  byInstructor: boolean;
  /** seed of this attempt's random draws (circuitToExercise(c, { seed }) replays the same failures) */
  seed: number;
  /** the failure was drawn at random from a group / at a random time */
  drawn: boolean;
}

/** failures after which the flight follows the emergency procedure, not the clearance: the lesson's altitude /
 *  heading tolerances stop counting (the procedure runner grades the flight path instead) */
export const LEAVES_CLEARANCE: ReadonlySet<FailureKey> = new Set<FailureKey>(['engine', 'enginePartial', 'engineFire', 'electricalFire', 'oilPressure', 'fuelPump', 'fuelStarvation']);

export interface StepResult {
  text: string;
  done: boolean;
  violationSec: number;
  worst: string | null;
}

export interface LessonResult {
  passed: boolean;
  /** false: the exercise was ended before it was complete (End) — no score, no attempt, no best score.
   *  Absent on results made before the field existed (= graded). */
  graded?: boolean;
  /** 0–100; null when the run is not graded */
  score: number | null;
  steps: StepResult[];
  holdReport?: { label: string; value: string; ok: boolean | null }[];
  acs?: AcsReport;
  reason: string;
  durationSec: number;
}

/** the reason of a run ended with End before it was complete (not graded) */
export const ENDED_EARLY = 'Ended early — not graded';

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
  /** hook (runner integration): a scheduled failure fired — start the expected procedure. `expectId` is the
   *  procedure the drill asks for (undefined: pick the one that applies), `mode` training / test. */
  onDrillFailure?: (key: FailureKey, expectId: string | undefined, mode: DrillMode, ev: DrillFailureEvent) => void;
  /** every drill failure fired so far (a hook wired late can catch up) */
  drillLog: DrillFailureEvent[] = [];
  /** step tolerances suspended: an emergency failure took the flight off its clearance */
  checksSuspended = false;
  private drillEnd: { moved: boolean; stoppedS: number } | null = null;

  constructor(public ex: Exercise, public sim: Sim) {
    // a clean avionics baseline, whatever the previous flight left (startAt applies it again after Sim.load)
    avionicsBaseline(sim);
    this.rt = ex.setup(sim);
    markPresets(this.rt.steps, { ...this.ctx(0), mem: {} });
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
    if (st.check && !this.checksSuspended && this.stepT > (st.graceSec ?? 8)) {
      const v = st.check(c);
      if (v) {
        this.currentViolation = v;
        const r = this.results[this.idx];
        r.violationSec += dt;
        r.worst ??= v;
      }
    }
    if (sim.ac.s.crashed) return this.finish(`Crash: ${sim.ac.s.crashed}`);
    if (this.drillStopped(dt)) return this.finish(uiLang() === 'fr' ? 'Exercice terminé : avion arrêté au sol après la panne' : 'Drill complete: aircraft stopped on the ground after the failure', true);
    if (st.done(c)) {
      this.results[this.idx].done = true;
      this.idx++;
      this.stepT = 0;
      this.started = false;
      if (this.idx >= this.rt.steps.length) this.finish();
    }
  }

  /** the student ended the exercise before it was complete: the run is not graded (no score, not an attempt) */
  abort() {
    if (this.finished) return;
    this.finished = {
      passed: false,
      graded: false,
      score: null,
      steps: this.results,
      reason: ENDED_EARLY,
      durationSec: this.totalT,
    };
  }

  // ---------------------------------------------------------------- failure drills
  /** the planned failures of this flight (null: none) */
  get drill(): DrillRuntime | null {
    return this.rt.drill ?? null;
  }
  /** instructor-triggered failures still waiting (instructor drawer / phone companion) */
  instructorFailures(): DrillPlanItem[] {
    return this.rt.drill?.plan.filter((p) => p.trigger === 'instructor' && !p.fired) ?? [];
  }
  /** the instructor fires a pending failure (index in circuit.failures); false when there is none */
  fireInstructorFailure(index: number): boolean {
    const it = this.rt.drill?.plan.find((p) => p.index === index && p.trigger === 'instructor' && !p.fired);
    if (!it || this.finished) return false;
    this.fireDrill(it, true);
    return true;
  }
  /** fire one planned failure: the sim fails it, the procedure is announced (training) and the hook is called */
  fireDrill(it: DrillPlanItem, byInstructor = false): DrillFailureEvent | null {
    const dr = this.rt.drill;
    if (!dr || it.fired) return null;
    const sim = this.sim;
    it.fired = true;
    it.firedAtS = sim.time;
    sim.setFailure(it.key, true);
    const l = uiLang();
    let proc: { id: string; title: string } | null = null;
    try {
      proc = pickProcedure(effectiveProcedures(), it.key, l, it.expect, simView(sim));
    } catch {
      proc = null;
    }
    const ev: DrillFailureEvent = {
      index: it.index,
      key: it.key,
      expect: it.expect,
      mode: dr.mode,
      isDrill: dr.isDrill,
      trigger: it.trigger,
      atS: sim.time,
      procedureId: proc?.id ?? null,
      procedureTitle: proc?.title ?? null,
      byInstructor,
      seed: dr.seed,
      drawn: !!it.drawn || it.trigger === 'random',
    };
    this.drillLog.push(ev);
    if (dr.isDrill && LEAVES_CLEARANCE.has(it.key)) this.checksSuspended = true;
    // training: the student is told which procedure is expected; test: nothing beyond the failure itself
    if (dr.mode === 'training' && proc)
      sim.rec.log(sim.time, 'warn', `Expected procedure: ${proc.title} (${FAILURE_LABELS_EN[it.key]})`, `Procédure attendue : ${proc.title} (${FAILURE_LABELS_FR[it.key]})`);
    try {
      this.onDrillFailure?.(it.key, it.expect, dr.mode, ev);
    } catch (e) {
      console.error('onDrillFailure', e);
    }
    return ev;
  }
  /** a drill ends once the aircraft, having moved after a failure, is stopped on the ground (forced landing,
   *  rejected take-off, landing after the procedure) */
  private drillStopped(dt: number): boolean {
    if (!this.rt.drill?.isDrill || !this.drillLog.length) return false;
    const s = this.sim.ac.s;
    const gs = this.sim.ac.data.gsKt;
    this.drillEnd ??= { moved: false, stoppedS: 0 };
    if (!s.onGround || gs > 20) this.drillEnd.moved = true;
    if (s.onGround && gs < 1 && this.drillEnd.moved) this.drillEnd.stoppedS += dt;
    else this.drillEnd.stoppedS = 0;
    return this.drillEnd.stoppedS > 4;
  }

  finish(reason?: string, drillEnd = false) {
    if (this.finished) return;
    const viol = this.results.reduce((a, b) => a + b.violationSec, 0);
    const allowance = this.rt.allowanceSec ?? 15;
    // a drill that ends on the ground after its failure (forced landing): the steps it could not reach do not count
    const allDone = drillEnd || this.results.every((r) => r.done);
    const holdReport = this.holdEval?.report();
    const holdOk = !holdReport || holdReport.every((r) => r.ok !== false);
    const acs = this.rt.acs ? evaluateAcs(this.sim.rec) : undefined;
    const acsOk = !acs || acs.result === 'PASS';
    const crashed = !!this.sim.ac.s.crashed;
    let score = 100 - Math.min(60, viol * 1.5) - (holdReport ? holdReport.filter((r) => r.ok === false).length * 12 : 0) - (acs ? acs.items.filter((i) => i.result === 'FAIL').length * 15 : 0);
    if (!allDone) score -= 30;
    if (crashed) score = 0;
    score = Math.max(0, Math.round(score));
    // one step out of tolerance for longer than its own limit (a sustained deviation) fails the exercise
    const overIdx = this.rt.steps.findIndex((s, i) => s.limitSec !== undefined && this.results[i].violationSec > s.limitSec);
    const over = overIdx >= 0 ? this.results[overIdx] : null;
    const passed = allDone && !crashed && viol <= allowance && !over && holdOk && acsOk;
    this.finished = {
      passed,
      graded: true,
      score,
      steps: this.results,
      holdReport,
      acs,
      reason:
        reason ??
        (passed
          ? 'All standards met'
          : !allDone
            ? 'Not all steps completed'
            : viol > allowance
              ? `Out of tolerance for ${Math.round(viol)} s (allowed ${allowance} s)`
              : over
                ? `${over.worst ?? 'Out of tolerance'} — held for ${Math.round(over.violationSec)} s on step ${overIdx + 1} (max ${this.rt.steps[overIdx].limitSec} s)`
                : !holdOk
                  ? 'Holding standards not met'
                  : 'ACS standards not met'),
      durationSec: this.totalT,
    };
  }
}

// ------------------------------------------------------------------ step builders
const fmtHdg = (h: number) => String(Math.round(((h % 360) + 360) % 360) || 360).padStart(3, '0');
const hdgErr = (d: FlightData, h: number) => Math.abs(wrap180(d.hdgTrue - h));

// ------------------------------------------------------------------ standard-rate turns (FAA-S-ACS-8C IR.IV.A)
export const STD_RATE = 3;
/** turn rate tolerance on a standard-rate turn (°/s) */
export const STD_RATE_TOL = 0.6;
/** bank tolerance around the standard-rate bank (°) */
export const STD_BANK_TOL = 5;
/** seconds after the step starts before the rate / bank standards apply (roll-in) */
export const TURN_GRACE_SEC = 4;
/** degrees to go below which the pilot is leading the roll-out: rate and bank are not graded there */
const TURN_ROLLOUT_ZONE = 15;
/** rule of thumb for the standard-rate bank angle (°) */
export const stdRateBank = (tasKt: number) => tasKt / 10 + 7;

interface TurnState {
  /** degrees still to turn in the commanded direction (negative: past the target heading) */
  remaining: number;
  /** turn rate, smoothed over ~1 s (°/s, unsigned) — a gust is not a deviation */
  rate: number;
  /** bank, smoothed the same way (°, unsigned) */
  bank: number;
}
/** progress of a turn step, updated once per frame: the heading is unwrapped so a 180° turn and an overshoot read
 *  right, and the direction is the commanded one (or the shorter way, fixed when the step starts) */
function turnState(c: Ctx, hdg: number, dir: 'L' | 'R' | null): TurnState {
  const m = c.mem;
  const key = `${c.run.idx}`;
  const cur = c.d.hdgTrue;
  if (m.tsKey !== key) {
    const sgn = dir === 'R' ? 1 : dir === 'L' ? -1 : wrap180(hdg - cur) >= 0 ? 1 : -1;
    let total = (((hdg - cur) * sgn) % 360 + 360) % 360;
    if (total > 355) total -= 360; // already on the heading (a few degrees past it)
    m.tsKey = key;
    m.tsSgn = sgn;
    m.tsTotal = total;
    m.tsTurned = 0;
    m.tsPrev = cur;
    m.tsT = c.t;
    m.tsRate = Math.abs(c.d.turnRateDps);
    m.tsBank = Math.abs(c.d.rollDeg);
  } else if (m.tsT !== c.t) {
    const k = Math.min(1, c.dt / 1);
    m.tsTurned = (m.tsTurned as number) + wrap180(cur - (m.tsPrev as number)) * (m.tsSgn as number);
    m.tsPrev = cur;
    m.tsT = c.t;
    m.tsRate = (m.tsRate as number) + (Math.abs(c.d.turnRateDps) - (m.tsRate as number)) * k;
    m.tsBank = (m.tsBank as number) + (Math.abs(c.d.rollDeg) - (m.tsBank as number)) * k;
  }
  return { remaining: (m.tsTotal as number) - (m.tsTurned as number), rate: m.tsRate as number, bank: m.tsBank as number };
}

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
  turnTo(hdg: number, dir: 'L' | 'R' | null, alt: number, opts: { maxBank?: number; ias?: number; rollOutTol?: number } = {}): Step {
    const maxBank = opts.maxBank ?? 30;
    return {
      text: `${dir === 'L' ? 'Turn left' : dir === 'R' ? 'Turn right' : 'Turn'} to heading ${fmtHdg(hdg)} at standard rate, maintain ${alt} ft`,
      hint: 'Standard rate ≈ 15° of bank at 90 KIAS (TAS/10 + 7). Lead the roll-out by ½ the bank angle.',
      done: (c) => {
        turnState(c, hdg, dir);
        return hdgErr(c.d, hdg) < 5 && Math.abs(c.d.rollDeg) < 5;
      },
      check: (c) => {
        const ts = turnState(c, hdg, dir);
        const bank = Math.abs(c.d.rollDeg);
        if (bank > maxBank) return `Bank ${Math.round(bank)}° (max ${maxBank})`;
        if (dir && c.t < 6 && bank > 5 && Math.sign(c.d.rollDeg) !== (dir === 'R' ? 1 : -1)) return 'Turning the wrong way';
        // roll-out: heading ±10° (±15° on the compass with the AHRS failed) — FAA-S-ACS-8C IR.IV.A
        const tol = opts.rollOutTol ?? (c.sim.failures.ahrs ? 15 : 10);
        if (ts.remaining < -tol) return `Overshot ${fmtHdg(hdg)} by ${Math.ceil(-ts.remaining)}°`;
        // established in the turn (not rolling in, not leading the roll-out): standard rate 3°/s ±0.6, or the
        // bank for it (TAS/10 + 7) ±5°
        if (ts.remaining > TURN_ROLLOUT_ZONE) {
          if (Math.abs(ts.rate - STD_RATE) > STD_RATE_TOL) return `Turn rate ${ts.rate.toFixed(1)}°/s (standard 3°/s)`;
          const std = stdRateBank(c.d.tasKt);
          if (Math.abs(ts.bank - std) > STD_BANK_TOL) return `Bank ${Math.round(ts.bank)}° (standard rate ≈ ${Math.round(std)}°)`;
        }
        return devCheck(c, { alt, ias: opts.ias }, {});
      },
      readout: (c) => {
        const ts = turnState(c, hdg, dir);
        return `${ts.rate.toFixed(1)}°/s · bank ${Math.round(Math.abs(c.d.rollDeg))}° (std ${Math.round(stdRateBank(c.d.tasKt))}°) · ${Math.max(0, Math.round(ts.remaining))}° to go`;
      },
      // roll-in grace: the rate and bank standards apply once the turn is established
      graceSec: TURN_GRACE_SEC,
      limitSec: 6,
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

// ------------------------------------------------------------------ setup checklists: what the exercise presets
/** the detail of a checklist item the exercise set itself */
export const PRESET_DETAIL = 'Preset for this exercise';
const rawSetup = new WeakMap<Step, NonNullable<Step['setup']>>();
/** An item already satisfied when the exercise starts was set by the exercise, not by the student: it reads as
 *  information (ok: null), so the checklist never says "Set up complete" at 0:00 (X09). Once it is changed it is a
 *  to-do again. Measured once, on the state the exercise starts in (after the avionics baseline). */
function markPresets(steps: Step[], c: Ctx) {
  for (const st of steps) {
    const build = rawSetup.get(st) ?? st.setup;
    if (!build) continue;
    let preset: Set<string>;
    try {
      preset = new Set(build(c).filter((i) => i.ok === true).map((i) => i.label));
    } catch {
      continue;
    }
    rawSetup.set(st, build);
    // the preset items go last: what the student has to do first, then how to fly it (the first information item
    // is the instruction the panel keeps in view), then what is already set
    st.setup = preset.size
      ? (cx) => {
          const todo: SetupItem[] = [];
          const done: SetupItem[] = [];
          for (const i of build(cx)) {
            if (i.ok === true && preset.has(i.label)) done.push({ ...i, ok: null, action: undefined, detail: i.detail ? `${i.detail} · ${PRESET_DETAIL.toLowerCase()}` : PRESET_DETAIL });
            else todo.push(i);
          }
          return todo.concat(done);
        }
      : build;
  }
}

// ------------------------------------------------------------------ seeded set-up (briefing preview)
/** a seed for the random draws of one attempt (see withSeed) */
export const newRunSeed = () => (Math.floor(Math.random() * 0x7fffffff) || 1) >>> 0;
/** runs `fn` with Math.random drawn from a seeded generator (mulberry32): an exercise set up twice with the same seed
 *  draws the same hold, quiz order and failure plan. The briefing of a Restart previews the run on a scratch Sim and
 *  Start builds the same run on the live one. Only the synchronous call is seeded; Math.random is restored after. */
export function withSeed<T>(seed: number, fn: () => T): T {
  const orig = Math.random;
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

// ------------------------------------------------------------------ scenario helpers
/** Every exercise starts from the same avionics, never from what the previous flight left (X09): CDI on GPS,
 *  BRG1/BRG2 off, NAV1/NAV2, COM, ADF and courses as on a fresh page, no minimums, XPDR 1200 ALT, chronometer reset.
 *  The altimeter is set by startAt (local QNH); the inset map is a display preference and is kept. The exercise's
 *  own setup runs after this and presets what it means to. Values are changed in place (radios included), so a
 *  panel holding `sim.av` or `sim.av.nav1` keeps reading the live state. */
export function avionicsBaseline(sim: Sim) {
  const av = sim.av;
  const base = defaultAvionics();
  const radios = ['nav1', 'nav2', 'com1', 'com2', 'adf'] as const;
  for (const k of radios) Object.assign(av[k], base[k]);
  const rest: Omit<Avionics, (typeof radios)[number] | 'inset'> = {
    obs1: base.obs1,
    obs2: base.obs2,
    cdi: 'GPS',
    baro: base.baro,
    minimums: null,
    xpdr: '1200',
    xpdrMode: 'ALT',
    timerStart: null,
    timerHold: null,
    bearing1: 'OFF',
    bearing2: 'OFF',
  };
  Object.assign(av, rest);
}

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
      avionicsBaseline(s);
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
