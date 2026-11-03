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
