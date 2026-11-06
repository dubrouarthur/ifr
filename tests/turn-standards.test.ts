// Standard-rate turns are graded against FAA-S-ACS-8C IR.IV.A (heading ±10°, bank ±5° during turns): the lessons
// are flown headless by a simple closed-loop pilot with deliberately wrong technique (G-CUR-01 regression).
import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { exercise } from '../src/train/curriculum';
import { LessonRun, S, startAt, stdRateBank, type Exercise, type LessonResult } from '../src/train/engine';
import { DEG, destination, wrap180 } from '../src/nav/geo';
import { findFix } from '../src/nav/data';

const DT = 1 / 30;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** minimal pilot: holds a bank, an altitude and an airspeed (adapted from tests/physics-pilot.test.ts) */
class Pilot {
  pI = 0;
  oI = 0;
  tI: number;
  constructor(public s: Sim) {
    this.tI = s.controls.throttle;
  }
  get d() {
    return this.s.ac.data;
  }
  pitch(tgt: number) {
    const e = tgt - this.d.pitchDeg;
    this.pI = clamp(this.pI + e * 0.03 * DT, -1.2, 1.2);
    this.s.controls.elevator = clamp(e * 0.06 - (this.s.ac.s.q / DEG) * 0.025 + this.pI, -1, 1);
  }
  vs(tgt: number) {
    const d = this.d;
    const err = tgt - d.vsFpm;
    this.oI = clamp(this.oI + err * 0.0015 * DT, -12, 12);
    const fpa = Math.asin(clamp(tgt / (Math.max(40, d.tasKt) * 101.27), -0.5, 0.5)) / DEG;
    this.pitch(clamp(fpa + d.aoaDeg + this.oI + err * 0.002, -15, 20));
  }
  alt(tgt: number) {
    this.vs(clamp((tgt - this.s.indicatedAlt()) * 4, -700, 700));
  }
  bank(tgt: number) {
    this.s.controls.aileron = clamp((tgt - this.d.rollDeg) * 0.04 - (this.s.ac.s.p / DEG) * 0.012, -1, 1);
  }
  /** turn to a heading at a fixed bank, rolling out with a lead of about half the bank */
  heading(tgt: number, maxBank = 15, dir: 'L' | 'R' | null = null) {
    let e = wrap180(tgt - this.d.hdgTrue);
    if (dir === 'L' && e > 5) e -= 360;
    if (dir === 'R' && e < -5) e += 360;
    this.bank(clamp(e * 2, -maxBank, maxBank));
  }
  thrIas(tgt: number) {
    const e = tgt - this.d.iasKt;
    this.tI = clamp(this.tI + e * 0.006 * DT, 0, 1);
    this.s.controls.throttle = clamp(this.tI + e * 0.03, 0, 1);
  }
}

type Policy = (p: Pilot, run: LessonRun, sim: Sim) => void;
function fly(ex: Exercise, policy: Policy, maxSec = 900): LessonResult {
  const sim = new Sim();
  const run = new LessonRun(ex, sim);
  sim.weather.turbulence = 0;
  const p = new Pilot(sim);
  for (let t = 0; t < maxSec && !run.finished; t += DT) {
    policy(p, run, sim);
    sim.step(DT);
    run.update(DT);
  }
  expect(run.finished, 'the lesson ends on its own').not.toBeNull();
  return run.finished!;
}
const hdgOf = (txt: string) => Number(/heading (\d{3})/.exec(txt)?.[1] ?? NaN);
const dirOf = (txt: string): 'L' | 'R' | null => (/left/i.test(txt) ? 'L' : /right/i.test(txt) ? 'R' : null);
/** flies every turn step at `bank`, every other step wings level on its heading */
const atBank = (bank: number): Policy => (p, run) => {
  const st = run.step;
  if (!st) return;
  const turn = /^Turn/.test(st.text);
  p.heading(hdgOf(st.text), turn ? bank : 15, turn ? dirOf(st.text) : null);
  p.alt(4000);
  p.thrIas(95);
};
const worsts = (r: LessonResult) => r.steps.map((s) => s.worst ?? '').join(' | ');

/** one 90° turn left from 360 to 270, then nothing else */
const oneTurn: Exercise = {
  id: 'test-turn',
  stage: 'S1',
  title: 'One standard-rate turn',
  summary: '',
  objectives: [],
  standards: [],
  briefing: [],
  allowAp: false,
  minutes: 2,
  setup: (sim) => {
    startAt(sim, { pos: destination(findFix('PARD')!, 160, 18), altFt: 4000, hdg: 360, iasKt: 95 });
    return { steps: [S.turnTo(270, 'L', 4000)] };
  },
};

describe('standard-rate turns (FAA-S-ACS-8C IR.IV.A)', () => {
  it('the rule-of-thumb bank matches a coordinated standard-rate turn within the ±5° band', () => {
    for (const tas of [70, 100, 130]) {
      const v = tas * 0.5144;
      const exact = Math.atan(((3 * Math.PI) / 180) * v / 9.81) / DEG;
      expect(Math.abs(stdRateBank(tas) - exact)).toBeLessThan(5);
    }
  });

  it('PASS: bai-turns flown at standard rate (15° of bank at 95 KIAS)', () => {
    const r = fly(exercise('bai-turns'), atBank(15));
    expect(r.passed, `${r.reason} · ${worsts(r)}`).toBe(true);
    expect(r.graded).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(90);
  });

  it('FAIL: bai-turns flown at about twice standard rate (28° of bank)', () => {
    const r = fly(exercise('bai-turns'), atBank(28));
    expect(r.passed).toBe(false);
    expect(worsts(r)).toMatch(/Turn rate [5-7]\.\d°\/s|Bank 2\d° \(standard rate/);
  });

  it('FAIL: bai-turns flown at about half standard rate (7° of bank)', () => {
    const r = fly(exercise('bai-turns'), atBank(7), 1500);
    expect(r.passed).toBe(false);
    expect(worsts(r)).toMatch(/Turn rate 1\.\d°\/s/);
  });

  it('FAIL: a single 2x standard-rate turn fails on its own (sustained, not momentary)', () => {
    const r = fly(oneTurn, atBank(28));
    expect(r.passed).toBe(false);
    expect(r.steps[0].violationSec).toBeGreaterThan(6);
    expect(r.reason).toMatch(/step 1/);
  });

  it('FAIL: a 38° overshoot on every roll-out ("Overshot 270 by N°")', () => {
    let maxOver = 0;
    const r = fly(
      exercise('bai-turns'),
      (p, run, sim) => {
        const st = run.step;
        if (!st) return;
        const h = hdgOf(st.text);
        if (/^Turn/.test(st.text)) {
          const dir = dirOf(st.text)!;
          const sgn = dir === 'R' ? 1 : -1;
          const over = (h + sgn * 40 + 360) % 360;
          if (!run.mem.past) {
            p.heading(over, 15, dir);
            if (Math.abs(wrap180(sim.ac.data.hdgTrue - over)) < 3) run.mem.past = true;
          } else p.heading(h, 15);
          if (run.mem.past) maxOver = Math.max(maxOver, wrap180(sim.ac.data.hdgTrue - h) * sgn);
        } else {
          run.mem.past = false;
          p.heading(h, 15);
        }
        p.alt(4000);
        p.thrIas(95);
      },
      1500,
    );
    expect(maxOver).toBeGreaterThan(30);
    expect(r.passed).toBe(false);
    expect(worsts(r)).toMatch(/Overshot 270 by \d+°/);
  });

  it('a small overshoot inside ±10° is not a deviation', () => {
    const r = fly(oneTurn, (p, run, sim) => {
      // roll out late: about 6° past the heading, then back
      if (!run.mem.past) {
        p.heading(264, 15, 'L');
        if (Math.abs(wrap180(sim.ac.data.hdgTrue - 264)) < 2) run.mem.past = true;
      } else p.heading(270, 10);
      p.alt(4000);
      p.thrIas(95);
    });
    expect(r.passed, `${r.reason} · ${worsts(r)}`).toBe(true);
    expect(r.steps[0].worst ?? '').not.toMatch(/Overshot/);
  });

  it('PASS: partial-panel turns at standard rate (AHRS failed, compass tolerance ±15°)', () => {
    const r = fly(
      exercise('pp-compass'),
      (p, run) => {
        const st = run.step;
        if (!st) return;
        const turn = /^Turn/.test(st.text);
        p.heading(turn ? hdgOf(st.text) : 90, 15, turn ? dirOf(st.text) : null);
        p.alt(4000);
        p.thrIas(95);
      },
      1500,
    );
    expect(r.passed, `${r.reason} · ${worsts(r)}`).toBe(true);
  });
});
