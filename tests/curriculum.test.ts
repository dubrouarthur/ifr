import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { EXERCISES, PATHS, exercise } from '../src/train/curriculum';
import { LessonRun } from '../src/train/engine';
import { holdEntry } from '../src/nav/holding';
import { bearingDeg } from '../src/nav/geo';

describe('curriculum', () => {
  it('paths reference existing exercises', () => {
    for (const p of PATHS) for (const id of p.exercises) expect(() => exercise(id)).not.toThrow();
    expect(EXERCISES.length).toBeGreaterThanOrEqual(30);
  });
  for (const ex of EXERCISES) {
    it(`${ex.id} sets up and runs 20 s`, () => {
      const sim = new Sim();
      const run = new LessonRun(ex, sim);
      expect(run.rt.steps.length).toBeGreaterThan(0);
      if (run.rt.quiz && run.rt.hold) {
        const entry = holdEntry(run.rt.hold.inbound, run.rt.hold.turn, bearingDeg(sim.ac.s, run.rt.hold.fix));
        expect(run.rt.quiz.options[run.rt.quiz.answer]).toBe(entry);
      }
      for (let i = 0; i < 600; i++) {
        sim.step(1 / 30);
        run.update(1 / 30);
      }
      if (!ex.id.includes('unusual')) expect(sim.ac.s.crashed).toBeNull();
      if (!ex.allowAp) {
        sim.ap.toggleAp(sim.ac.data);
        expect(sim.ap.ap).toBe(false);
      }
    });
  }
  it('a coupled ILS lesson can be passed', () => {
    const sim = new Sim();
    const run = new LessonRun(exercise('app-ils-ap'), sim);
    sim.weather.turbulence = 0;
    const d = () => sim.ac.data;
    sim.ap.toggleAp(d());
    sim.ap.pressHdg(d());
    sim.ap.pressAlt(d());
    sim.ap.pressApr(d(), sim.navInputs());
    for (let t = 0; t < 1200 && !run.finished; t += 1 / 30) {
      sim.step(1 / 30);
      run.update(1 / 30);
      if (sim.ap.vert === 'GS') {
        sim.controls.flaps = 1;
        sim.controls.throttle = 0.42;
      }
      if (sim.ap.vert === 'GS' && d().aglFt < 250 && !run.finished) {
        // at minimums: go around (not visual in 500 ft ceiling? 500 > HAT 250 so visual) → hand the landing to a scripted flare
        // flare with the autopilot VS mode (the test checks the lesson logic, not piloting)
        sim.ap.vert = 'VS';
        sim.ap.vertArmed = { alts: false, gs: false, gp: false };
        sim.ap.altSel = 0;
        for (let k = 0; k < 30 * 90 && !run.finished; k++) {
          const agl = d().aglFt;
          sim.ap.vsSel = agl > 40 ? -450 : agl > 12 ? -250 : -100;
          if (sim.ap.vert !== 'VS') sim.ap.vert = 'VS';
          if (agl < 30) sim.controls.throttle = 0.05;
          if (sim.ac.s.onGround) {
            sim.ap.disconnect();
            sim.controls.brake = 1;
          }
          sim.step(1 / 30);
          run.update(1 / 30);
        }
      }
    }
    expect(sim.rec.touchdown).not.toBeNull();
    expect(run.finished).not.toBeNull();
    expect(run.finished!.acs?.result).toBe("PASS");
    expect(run.finished!.passed).toBe(true);
  });
});

describe('IFR flights', () => {
  it('builds route + approach in one flight plan and arms the approach on clearance', () => {
    const sim = new Sim();
    const run = new LessonRun(exercise('ifr-pard-msvl-rnav'), sim);
    expect(sim.fp.wpts.map((w) => w.ident).slice(0, 6)).toEqual(['PARD', 'ARD', 'SCREE', 'FENNY', 'CRAGG', 'RW03']);
    expect(sim.ac.s.onGround).toBe(true);
    expect(run.rt.clearance).toMatch(/Cleared to MSVL via ARD SCREE/);
    expect(sim.fp.approachActive).toBe(false);
    run.rt.steps[3].onStart!(run.ctx(0));
    expect(sim.fp.approachActive).toBe(true);
  });
  it('the intercept step flags an overshoot', () => {
    const sim = new Sim();
    const run = new LessonRun(exercise('int-loc90'), sim);
    const st = run.rt.steps[0];
    st.onStart!(run.ctx(0));
    const c = run.ctx(0.1);
    c.mem.captured = true;
    sim.nav1 = { ...sim.nav1, valid: true, dev: 0.9 };
    expect(st.check!(c)).toMatch(/Overshoot/);
  });
});
