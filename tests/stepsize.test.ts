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

// ---------------------------------------------------------------- the FMS step pad (X20)
import { fmsSteps, placePad } from '../src/ui/knob';

describe('FMS step pad', () => {
  it('names the knobs Outer and Inner, and + on Outer turns the outer knob', () => {
    const keys: string[] = [];
    const rows = fmsSteps((k) => keys.push(k), () => 'ACTV PA');
    expect(rows.map((r) => r.label)).toEqual(['Outer', 'Inner']);
    expect(rows[0].minus).toMatch(/Field/);
    expect(rows[0].plus).toMatch(/Row/);
    rows[0].onStep(1, false);
    rows[0].onStep(-1, false);
    rows[1].onStep(1, false);
    rows[0].push!.fn();
    for (const a of rows[1].actions!) a.fn();
    expect(keys).toEqual(['outer+', 'outer-', 'inner+', 'push', 'ent', 'clr']);
    expect(rows[1].actions!.map((a) => a.label)).toEqual(['ENT', 'CLR']);
  });

  it('never opens over a display screen when a free spot exists', () => {
    // the FMS knob at the bottom right of the MFD bezel on a 1180x820 iPad
    const mfd = { left: 672, top: 406, right: 1081, bottom: 713 };
    const pfd = { left: 99, top: 406, right: 508, bottom: 713 };
    const knobR = { left: 1090, top: 690, right: 1142, bottom: 742 };
    const bezel = { left: 598, top: 386, right: 1156, bottom: 760 };
    const p = placePad(knobR, 300, 150, { w: 1180, h: 820 }, [pfd, mfd], bezel);
    const r = { left: p.x, top: p.y, right: p.x + 300, bottom: p.y + 150 };
    for (const s of [pfd, mfd]) {
      const ix = Math.min(r.right, s.right) - Math.max(r.left, s.left);
      const iy = Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top);
      expect(ix > 0 && iy > 0).toBe(false);
    }
    expect(p.x).toBeGreaterThanOrEqual(8);
    expect(p.x + 300).toBeLessThanOrEqual(1172);
  });
});
