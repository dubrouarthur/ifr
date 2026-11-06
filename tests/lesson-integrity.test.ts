// Lessons integrity (UX wave U3, Day 1): an exercise ended early is not graded (X08), every exercise starts from the
// same avionics whatever the previous flight left (X09), and a restart can be briefed without touching the flight
// that is running (X15: the briefing previews the run on a scratch Sim and Start replays the same draws).
import { describe, it, expect, beforeAll } from 'vitest';
import { Sim, defaultAvionics } from '../src/sim/sim';
import { EXERCISES, exercise } from '../src/train/curriculum';
import { LessonRun, ENDED_EARLY, PRESET_DETAIL, avionicsBaseline, newRunSeed, withSeed, type LessonResult } from '../src/train/engine';
import type { SetupItem } from '../src/train/setupAssist';

const mem = new Map<string, string>();
beforeAll(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

/** what a pilot leaves behind after a flight: every avionics setting changed */
function dirty(sim: Sim) {
  const av = sim.av;
  av.cdi = 'NAV1';
  av.bearing1 = 'ADF';
  av.bearing2 = 'NAV2';
  av.nav1.active = 111.9;
  av.nav1.standby = 108.5;
  av.nav2.active = 113.5;
  av.com1.active = 121.5;
  av.adf.active = 400;
  av.obs1 = 123;
  av.obs2 = 321;
  av.minimums = 1200;
  av.xpdr = '7700';
  av.xpdrMode = 'STBY';
  av.timerStart = 12;
  av.timerHold = null;
  av.baro = 30.4;
}
const avState = (sim: Sim) => JSON.parse(JSON.stringify(sim.av));
const marks = (items: SetupItem[]) => items.map((i) => `${i.label}=${i.ok}`);

describe('X08 — an exercise ended early is not graded', () => {
  it('abort() gives no score, not passed, graded false, and only once', () => {
    const sim = new Sim();
    const run = new LessonRun(exercise('bai-turns'), sim);
    for (let i = 0; i < 300; i++) {
      sim.step(1 / 30);
      run.update(1 / 30);
    }
    run.abort();
    const r = run.finished!;
    expect(r.graded).toBe(false);
    expect(r.score).toBeNull();
    expect(r.passed).toBe(false);
    expect(r.reason).toBe(ENDED_EARLY);
    expect(r.durationSec).toBeGreaterThan(9);
    run.abort();
    run.finish('later');
    expect(run.finished).toBe(r);
  });

  it('a completed run is graded with a number', () => {
    const sim = new Sim();
    const run = new LessonRun(exercise('bai-turns'), sim);
    run.finish();
    expect(run.finished!.graded).toBe(true);
    expect(typeof run.finished!.score).toBe('number');
  });

  it('the progress ignores an ungraded run: no attempt, no best score', async () => {
    const { progress, isGraded } = await import('../src/ui/learn');
    progress.reset();
    const base: LessonResult = { passed: false, graded: false, score: null, steps: [], reason: ENDED_EARLY, durationSec: 40 };
    progress.record('bai-turns', base);
    expect(progress.get('bai-turns')).toBeUndefined();
    progress.record('bai-turns', { ...base, graded: true, score: 62 });
    progress.record('bai-turns', base);
    expect(progress.get('bai-turns')).toMatchObject({ attempts: 1, best: 62, passed: false });
    // results saved before the field existed are graded
    const legacy = { passed: true, score: 91, steps: [], reason: '', durationSec: 1 } as LessonResult;
    expect(isGraded(legacy)).toBe(true);
    expect(isGraded(base)).toBe(false);
    progress.reset();
  });
});

describe('X09 — every lesson starts from a clean avionics baseline', () => {
  it('avionicsBaseline resets radios, courses, sources, minimums, transponder and chronometer in place', () => {
    const sim = new Sim();
    const av = sim.av;
    const nav1 = sim.av.nav1;
    dirty(sim);
    sim.av.inset = false;
    avionicsBaseline(sim);
    expect(sim.av).toBe(av); // panels holding sim.av keep reading the live state
    expect(sim.av.nav1).toBe(nav1);
    const d = defaultAvionics();
    expect(sim.av).toMatchObject({ ...d, minimums: null, inset: false });
    expect(sim.chrono()).toBeNull();
  });

  it('the start of every exercise does not depend on the previous flight', () => {
    for (const ex of EXERCISES) {
      const seed = 4242;
      const a = new Sim();
      const ra = withSeed(seed, () => new LessonRun(ex, a));
      const b = new Sim();
      // a previous flight: the same exercise, flown with everything set, then the knobs left anywhere
      const prev = withSeed(seed, () => new LessonRun(ex, b));
      void prev;
      dirty(b);
      const rb = withSeed(seed, () => new LessonRun(ex, b));
      expect(avState(b), ex.id).toEqual(avState(a));
      ra.rt.steps.forEach((st, i) => {
        if (!st.setup) return;
        expect(marks(rb.rt.steps[i].setup!(rb.ctx(0))), `${ex.id} step ${i + 1}`).toEqual(marks(st.setup(ra.ctx(0))));
      });
    }
  });

  it('no setup checklist reads "Set up complete" at 0:00: what the exercise presets is information', () => {
    let checked = 0;
    for (const ex of EXERCISES) {
      const sim = new Sim();
      dirty(sim);
      const run = new LessonRun(ex, sim);
      run.rt.steps.forEach((st, i) => {
        if (!st.setup) return;
        const items = st.setup(run.ctx(0));
        const checks = items.filter((x) => x.ok !== null);
        const all = checks.length > 0 && checks.every((x) => x.ok);
        expect(all, `${ex.id} step ${i + 1}: ${marks(items).join(', ')}`).toBe(false);
        // the preset items come last, after the to-dos and the instruction to fly
        const firstPreset = items.findIndex((x) => x.detail?.includes(PRESET_DETAIL) || x.detail?.includes(PRESET_DETAIL.toLowerCase()));
        if (firstPreset >= 0) expect(items.slice(firstPreset).every((x) => x.ok === null)).toBe(true);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(20);
  });

  it('a preset item that is changed becomes a to-do again', () => {
    const sim = new Sim();
    const run = new LessonRun(exercise('app-ils-ap'), sim);
    const st = run.rt.steps.find((s) => s.setup)!;
    const before = st.setup!(run.ctx(0));
    expect(before.filter((x) => x.ok !== null)).toHaveLength(0); // the exercise sets everything itself
    sim.setCdi('GPS');
    sim.av.nav1.active = 108.1;
    sim.updateAvionics(0);
    const after = st.setup!(run.ctx(0));
    expect(after.some((x) => x.ok === false)).toBe(true);
  });

  it('the ILS lesson starts with the localizer it briefs actually tuned and received', () => {
    const sim = new Sim();
    dirty(sim);
    new LessonRun(exercise('app-ils-hand'), sim);
    expect(sim.av.minimums).not.toBe(1200);
    expect(sim.av.xpdr).toBe('1200');
    expect(sim.av.bearing1).toBe('OFF');
  });
});

describe('X15 — a restart is briefed without touching the running flight', () => {
  it('withSeed replays the same random draws (hold clearance, quiz order) and restores Math.random', () => {
    const orig = Math.random;
    for (let k = 0; k < 5; k++) {
      const seed = newRunSeed();
      const a = withSeed(seed, () => new LessonRun(exercise('hold-random'), new Sim()));
      const b = withSeed(seed, () => new LessonRun(exercise('hold-random'), new Sim()));
      expect(b.rt.clearance).toBe(a.rt.clearance);
      expect(b.rt.steps.map((s) => s.text)).toEqual(a.rt.steps.map((s) => s.text));
      expect(b.rt.quiz).toEqual(a.rt.quiz);
    }
    expect(Math.random).toBe(orig);
    expect(() => withSeed(1, () => { throw new Error('x'); })).toThrow('x');
    expect(Math.random).toBe(orig);
  });

  it('a preview run on a scratch sim leaves the live sim and its run as they were', () => {
    const live = new Sim();
    const run = new LessonRun(exercise('bai-turns'), live);
    for (let i = 0; i < 120; i++) {
      live.step(1 / 30);
      run.update(1 / 30);
    }
    const pos = { ...live.ac.s };
    const t = live.time;
    const av = avState(live);
    const seed = newRunSeed();
    const preview = withSeed(seed, () => new LessonRun(exercise('bai-turns'), new Sim()));
    expect(preview.sim).not.toBe(live);
    expect(live.ac.s.lat).toBe(pos.lat);
    expect(live.ac.s.altFt).toBe(pos.altFt);
    expect(live.time).toBe(t);
    expect(avState(live)).toEqual(av);
    expect(run.finished).toBeNull();
    // Start: the same run is built on the live sim
    const started = withSeed(seed, () => new LessonRun(exercise('bai-turns'), live));
    expect(started.rt.steps.map((s) => s.text)).toEqual(preview.rt.steps.map((s) => s.text));
    expect(live.time).toBe(0);
  });
});
