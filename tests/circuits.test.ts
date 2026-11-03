import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { LessonRun } from '../src/train/engine';
import { PRESET_CIRCUITS, circuitToExercise, validate, encodeCircuit, decodeCircuit, newCircuit, legText, type Circuit } from '../src/train/circuits';

const run = (sim: Sim, r: LessonRun, sec: number, each?: () => boolean | void) => {
  for (let t = 0; t < sec; t += 1 / 30) {
    sim.step(1 / 30);
    r.update(1 / 30);
    if (each?.()) return;
  }
};

describe('IFR circuits', () => {
  for (const c of PRESET_CIRCUITS) {
    it(`preset “${c.name}” is valid and flies 20 s`, () => {
      expect(validate(c)).toEqual([]);
      const sim = new Sim();
      const r = new LessonRun(circuitToExercise(c), sim);
      expect(r.rt.steps.length).toBeGreaterThanOrEqual(c.legs.length);
      run(sim, r, 20);
      expect(sim.ac.s.crashed).toBeNull();
      c.legs.forEach((l) => expect(legText(l).length).toBeGreaterThan(5));
    });
  }

  it('validation catches bad circuits', () => {
    const c: Circuit = { ...newCircuit(), legs: [{ type: 'approach', approachId: 'PARD-I27', transition: null, outcome: 'land' }, { type: 'fix', ident: 'NOPE', alt: 3000 }], failures: [{ key: 'gs', trigger: 'leg', at: 9 }] };
    const e = validate(c);
    expect(e.some((x) => /must be the last leg/.test(x))).toBe(true);
    expect(e.some((x) => /unknown fix/.test(x))).toBe(true);
    expect(e.some((x) => /leg 9 does not exist/.test(x))).toBe(true);
  });

  it('share link round-trips', () => {
    const c = PRESET_CIRCUITS[1];
    const back = decodeCircuit(encodeCircuit(c));
    expect(back.legs).toEqual(c.legs);
    expect(back.name).toBe(c.name);
  });

  it('time-triggered failure fires on schedule', () => {
    const c: Circuit = { ...newCircuit(), start: { type: 'air', fix: 'ARD', bearing: 90, distNm: 12, altFt: 3000, hdg: null, iasKt: 95 }, legs: [{ type: 'fix', ident: 'ARD', alt: 3000 }], failures: [{ key: 'ap', trigger: 'time', at: 0.5 }] };
    const sim = new Sim();
    const r = new LessonRun(circuitToExercise(c), sim);
    run(sim, r, 25);
    expect(sim.failures.ap).toBe(false);
    run(sim, r, 10);
    expect(sim.failures.ap).toBe(true);
  });

  it('leg-triggered failure fires when that leg starts, and fix legs sequence with the autopilot', () => {
    const c: Circuit = {
      ...newCircuit(),
      start: { type: 'air', fix: 'KEDDY', bearing: 90, distNm: 4, altFt: 3000, hdg: null, iasKt: 95 },
      legs: [{ type: 'fix', ident: 'KEDDY', alt: 3000 }, { type: 'fix', ident: 'MARLO', alt: 3000 }],
      failures: [{ key: 'gs', trigger: 'leg', at: 2 }],
      weather: { windKt: 0, turbulence: 0 },
    };
    const sim = new Sim();
    const r = new LessonRun(circuitToExercise(c), sim);
    sim.ap.toggleAp(sim.ac.data);
    sim.ap.pressNav(sim.ac.data, sim.navInputs());
    sim.ap.pressAlt(sim.ac.data);
    let sawLeg2 = false;
    run(sim, r, 600, () => {
      if (r.idx === 1) sawLeg2 = true;
      return !!r.finished;
    });
    expect(sawLeg2).toBe(true);
    expect(sim.failures.gs).toBe(true);
    expect(r.finished?.steps.every((s) => s.done)).toBe(true);
  });
});

describe('equipment', () => {
  it('an aircraft without GPS, autopilot, ADF or DME behaves accordingly', () => {
    const c = { ...PRESET_CIRCUITS[0], equipment: { gps: false, ap: false, adf: false, dme: false, nav2: false } };
    const sim = new Sim();
    new LessonRun(circuitToExercise(c), sim);
    sim.step(0.1);
    expect(sim.fp.out.valid).toBe(false);
    expect(sim.av.cdi).not.toBe('GPS');
    sim.ap.toggleAp(sim.ac.data);
    expect(sim.ap.ap).toBe(false);
    expect(sim.adf.valid).toBe(false);
    expect(sim.nav1.dmeNm).toBeNull();
    sim.cycleCdi();
    expect(sim.av.cdi).toBe('NAV1');
  });
});
