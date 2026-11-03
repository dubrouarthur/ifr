import { it, beforeAll, expect } from 'vitest';
import fs from 'node:fs';
import { Sim } from '../src/sim/sim';
beforeAll(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 } as Storage;
  globalThis.fetch = (async (u: string) => { const p = `public${u}`; return String(u).startsWith('/navdata/') && fs.existsSync(p) ? new Response(fs.readFileSync(p)) : new Response('', { status: 404 }); }) as typeof fetch;
});
it('synthetic-vision runways are never drawn above the horizon from on or above their own airport', async () => {
  const above: string[] = [];
  const { loadRegion, leaveRealWorld } = await import('../src/nav/world');
  const { AIRPORTS, groundElevation } = await import('../src/nav/data');
  const { runwaysInView } = await import('../src/avionics/world3d');
  const { defaultSetup, adaptSetupToRegion, setupToScenario } = await import('../src/train/setup');
  for (const pair of [['LFPN', 'LFPO'], ['KSFO', 'KSJC'], ['LSGG', 'LSZB']]) {
    await loadRegion(pair);
    const st = { ...defaultSetup(), world: 'real' as const, dep: pair[0], arr: pair[1], type: 'free' as const };
    adaptSetupToRegion(st);
    const sim = new Sim();
    sim.load(setupToScenario(st));
    const s = sim.ac.s;
    const rw = AIRPORTS[0].runways.find((r) => r.id === st.rwy.runway)!;
    expect(Math.abs(s.altFt - groundElevation(s))).toBeLessThan(2);
    void rw;
    for (const altAgl of [0, 1000, 3000]) {
      const cam = { lat: s.lat, lon: s.lon, altFt: s.altFt + altAgl + 6, hdgTrue: rw.heading };
      for (let h = 0; h < 360; h += 45) {
        for (const q of runwaysInView({ ...cam, hdgTrue: h }, 20)) {
          const mx = Math.max(...q.corners.map((c) => c.el));
          if (mx > 0.3 && q.dist < 3) above.push(`${pair[0]} agl ${altAgl} hdg ${h} ${q.id} el ${mx.toFixed(2)}`);
        }
      }
    }
  }
  expect(above).toEqual([]);
  leaveRealWorld();
}, 60000);

it('take-off roll: the runway near edge stays put and ground-fixed stripes flow towards the aircraft', async () => {
  const { runwaysInView } = await import('../src/avionics/world3d');
  const { runway } = await import('../src/nav/data');
  const { destination } = await import('../src/nav/geo');
  const r = runway('PARD', '27');
  const view = (d: number) => {
    const p = destination(r.threshold, r.heading, d);
    return runwaysInView({ lat: p.lat, lon: p.lon, altFt: r.elevFt + 7, hdgTrue: r.heading }, 5).sort((a, b) => a.dist - b.dist)[0];
  };
  const frames = [0.1, 0.13, 0.16, 0.19].map(view);
  const nearEl = frames.map((q) => Math.min(...q.corners.map((c) => c.el)));
  for (const e of nearEl) expect(Math.abs(e - nearEl[0])).toBeLessThan(0.1);
  for (const q of frames) expect(q.stripes.length).toBeGreaterThan(3);
  // the same ground stripe seen 10 ft later is lower on the screen (closer): compare the 3rd stripe's far end
  const a = view(0.1), b = view(0.1 + 10 / 6076);
  const farEnd = (q: typeof a, k: number) => Math.max(q.stripes[k][0].el, q.stripes[k][1].el);
  expect(farEnd(b, 2)).toBeLessThan(farEnd(a, 2));
});
