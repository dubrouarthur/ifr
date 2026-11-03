// The physics must give the same flight whatever the frame rate: a laggy browser (10 fps) or 4× time
// acceleration must not destabilise the aircraft (sub-stepping in Sim.step).
import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { SCENARIOS } from '../src/sim/sim';
const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;

function takeoff(frameDt: number, rate: number) {
  const sim = new Sim();
  sim.load(scenario('rwy27'));
  sim.rate = rate;
  sim.controls.flaps = 1;
  sim.controls.throttle = 1;
  let maxPitch = -99, minPitch = 99, minVs = 0;
  for (let t = 0; t < 70; t += frameDt * rate) {
    const d = sim.ac.data;
    sim.controls.elevator = d.iasKt > 55 ? Math.max(-0.6, Math.min(0.6, (8 - d.pitchDeg) * 0.08 + 0.1)) : 0;
    sim.step(frameDt);
    if (!sim.ac.s.onGround) {
      maxPitch = Math.max(maxPitch, d.pitchDeg);
      minPitch = Math.min(minPitch, d.pitchDeg);
      minVs = Math.min(minVs, d.vsFpm);
    }
    if (sim.ac.s.crashed) break;
  }
  return { crashed: sim.ac.s.crashed, alt: sim.ac.s.altFt, maxPitch, minPitch, minVs };
}

describe('frame-rate independent physics', () => {
  it('a take-off at 10 fps and at 4× speed matches 60 fps', () => {
    const ref = takeoff(1 / 60, 1);
    expect(ref.crashed).toBeNull();
    for (const [dt, rate] of [[0.1, 1], [0.1, 4], [1 / 30, 4]] as const) {
      const r = takeoff(dt, rate);
      expect(r.crashed, `dt ${dt} ×${rate}`).toBeNull();
      expect(Math.abs(r.alt - ref.alt), `dt ${dt} ×${rate} alt ${r.alt.toFixed(0)} vs ${ref.alt.toFixed(0)}`).toBeLessThan(150);
      expect(r.minVs, `dt ${dt} ×${rate}`).toBeGreaterThan(-800);
    }
  });
});

describe('terrain data updates', () => {
  it('terrain rising under a rolling or flying aircraft re-seats it instead of crashing', async () => {
    const { setTerrainProvider } = await import('../src/nav/data');
    const sim = new Sim();
    sim.load(scenario('rwy27'));
    sim.step(0.05);
    const g0 = sim.ac.s.altFt;
    setTerrainProvider({ elev: () => g0 + 40, land: () => 1 }); // late DEM: the ground is 40 ft higher
    sim.step(0.05);
    expect(sim.ac.s.crashed).toBeNull();
    expect(Math.abs(sim.ac.s.altFt - (g0 + 40))).toBeLessThan(1);
    setTerrainProvider(null);
  });
});
