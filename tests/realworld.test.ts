// End-to-end real-world planning: load a region from the shipped navdata files (fetch served from public/),
// adapt the wizard state and check the resulting flight is valid and flyable — including airports outside
// the US, which have no official procedures in the data set and get generated RNAV (GPS) approaches.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { validate } from '../src/train/circuits';
import { Sim } from '../src/sim/sim';

const realFetch = globalThis.fetch;
beforeAll(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 } as Storage;
  globalThis.fetch = (async (u: string) => {
    const url = String(u);
    if (url.startsWith('/navdata/')) {
      const p = `public${url}`;
      if (!fs.existsSync(p)) return new Response('', { status: 404 });
      return new Response(fs.readFileSync(p), { status: 200 });
    }
    return new Response('', { status: 404 }); // terrain tiles: offline in tests
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

describe('real-world flight planning', () => {
  it('LFPN → LFPO: region loads, generated approaches, valid flight that starts at LFPN', async () => {
    const { loadRegion, leaveRealWorld } = await import('../src/nav/world');
    const { APPROACHES, AIRPORTS, findFix } = await import('../src/nav/data');
    const { defaultSetup, adaptSetupToRegion, setupToCircuit, setupToScenario } = await import('../src/train/setup');
    const r = await loadRegion(['LFPN', 'LFPO']);
    expect(r.airports[0]).toBe('LFPN');
    const lfpo = APPROACHES.filter((a) => a.airport === 'LFPO');
    expect(lfpo.length).toBeGreaterThanOrEqual(2);
    expect(lfpo.every((a) => a.source === 'Generated' && a.type === 'RNAV')).toBe(true);
    const ap = lfpo[0];
    expect(ap.final.map((l) => l.role)).toEqual(['IF', 'FAF', 'MAP']);
    for (const l of [...ap.final, ...ap.missed, ...ap.transitions.flatMap((t) => t.legs)]) expect(findFix(l.fix.ident)).toBeTruthy();
    const st = { ...defaultSetup(), world: 'real' as const, dep: 'LFPN', arr: 'LFPO', type: 'route' as const, route: ['ARD'] };
    adaptSetupToRegion(st);
    expect(st.rwy.airport).toBe('LFPN');
    expect(st.arrival.approachId?.startsWith('LFPO-')).toBe(true);
    expect(st.route.length).toBe(1); // stale training fix dropped, direct to the IAF suggested
    const c = setupToCircuit(st);
    expect(validate(c)).toEqual([]);
    const sc = setupToScenario(st);
    const sim = new Sim();
    sim.load(sc);
    const lfpn = AIRPORTS.find((a) => a.icao === 'LFPN')!;
    const rw = lfpn.runways.find((x) => x.id === st.rwy.runway)!;
    expect(Math.abs(sim.ac.s.lat - rw.threshold.lat)).toBeLessThan(0.02);
    expect(sim.ac.s.onGround).toBe(true);
    for (let i = 0; i < 200; i++) sim.step(0.05); // no exception while running in the region
    expect(sim.ac.s.crashed).toBeNull();
    leaveRealWorld();
  }, 30000);

  it('refuses a region spanning an ocean', async () => {
    const { loadRegion } = await import('../src/nav/world');
    await expect(loadRegion(['LFPN', 'KSJC'])).rejects.toThrow(/NM/);
  });

  it('US airports keep their official FAA procedures', async () => {
    const { loadRegion, leaveRealWorld } = await import('../src/nav/world');
    const { APPROACHES } = await import('../src/nav/data');
    await loadRegion(['KSFO', 'KSJC']);
    const sjc = APPROACHES.filter((a) => a.airport === 'KSJC');
    expect(sjc.length).toBeGreaterThan(2);
    expect(sjc.some((a) => a.source === 'Generated')).toBe(false);
    leaveRealWorld();
  }, 30000);
});

describe('real-world flight plan in the GPS', () => {
  it('graded LFPN → LFPO: the route and the approach are loaded in the flight plan', async () => {
    const { loadRegion, leaveRealWorld } = await import('../src/nav/world');
    const { defaultSetup, adaptSetupToRegion, setupToCircuit } = await import('../src/train/setup');
    const { circuitToExercise } = await import('../src/train/circuits');
    const { LessonRun } = await import('../src/train/engine');
    await loadRegion(['LFPN', 'LFPO']);
    const st = { ...defaultSetup(), world: 'real' as const, dep: 'LFPN', arr: 'LFPO', type: 'route' as const, route: [] as string[] };
    adaptSetupToRegion(st);
    const c = setupToCircuit(st);
    const sim = new Sim();
    const run = new LessonRun(circuitToExercise(c), sim);
    void run;
    const ids = sim.fp.wpts.map((w) => w.ident);
    console.log('FPL', ids.join(' '), 'approach', sim.fp.approachId);
    expect(ids).toContain(st.route[0]);
    expect(sim.fp.approachId).toBe(st.arrival.approachId);
    leaveRealWorld();
  }, 30000);
});
