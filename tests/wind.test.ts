import { describe, it, expect } from 'vitest';
import { steadyWind, WindModel, components, windTriangle, defaultAloft } from '../src/sim/wind';
import { Sim, SCENARIOS } from '../src/sim/sim';

const W = { windDir: 250, windKt: 12, gustKt: 0, turbulence: 0 };

describe('wind model', () => {
  it('veers and strengthens with height (default Ekman-like profile)', () => {
    const s = steadyWind(W, 420 + 33, 33);
    const a = steadyWind(W, 3000, 2500);
    const b = steadyWind(W, 6000, 5500);
    expect(s.kt).toBeCloseTo(12, 0);
    expect(s.dir).toBeCloseTo(250, 0);
    expect(a.kt).toBeGreaterThan(s.kt * 1.3);
    expect(((a.dir - s.dir + 360) % 360)).toBeGreaterThan(15);
    expect(b.kt).toBeGreaterThan(a.kt);
  });
  it('uses explicit winds aloft when given', () => {
    const w = { ...W, aloft: [{ altFt: 5000, dir: 90, kt: 40 }] };
    const r = steadyWind(w, 5000, 4500);
    expect(r.dir).toBeCloseTo(90, 0);
    expect(r.kt).toBeCloseTo(40, 0);
  });
  it('slows down in the surface boundary layer', () => {
    expect(steadyWind(W, 425, 5).kt).toBeLessThan(steadyWind(W, 453, 33).kt * 0.8);
  });
  it('low-level shear removes wind near the ground', () => {
    const r = steadyWind({ ...W, windKt: 20, shearKt: 15 }, 520, 100);
    expect(r.kt).toBeLessThan(12);
  });
  it('gusts surge up to the reported gust value', () => {
    const m = new WindModel();
    let max = 0;
    let sum = 0;
    const n = 30 * 300;
    for (let i = 0; i < n; i++) {
      const s = m.sample(1 / 30, { windDir: 250, windKt: 15, gustKt: 25, turbulence: 0 }, 900, 500, 46, false);
      max = Math.max(max, s.gust);
      sum += s.gust;
    }
    expect(max).toBeGreaterThan(4);
    expect(max).toBeLessThanOrEqual(10.01);
    expect(sum / n).toBeGreaterThan(0.3);
  });
  it('head/crosswind components and the wind triangle', () => {
    const c = components(360, 20, 90);
    expect(c.head).toBeCloseTo(0, 5);
    expect(c.cross).toBeCloseTo(-20, 5); // from the left
    const t = windTriangle(90, 100, 360, 20);
    expect(t.wca).toBeCloseTo(-11.5, 0);
    expect(t.gs).toBeCloseTo(98, 0);
    expect(defaultAloft(W)).toHaveLength(3);
  });
});

describe('wind in the flight model', () => {
  it('gusts make the airspeed fluctuate', () => {
    const s = new Sim(SCENARIOS.find((x) => x.id === 'ils27-vtf'));
    Object.assign(s.weather, { windKt: 15, gustKt: 28, turbulence: 0 });
    s.ac.s.altFt = 1400; // ~1000 ft AGL
    const ias: number[] = [];
    for (let i = 0; i < 30 * 120; i++) {
      s.step(1 / 30);
      if (i % 15 === 0) ias.push(s.ac.data.iasKt);
    }
    const mean = ias.reduce((a, b) => a + b, 0) / ias.length;
    const sd = Math.sqrt(ias.reduce((a, b) => a + (b - mean) ** 2, 0) / ias.length);
    expect(sd).toBeGreaterThan(1.2);
    expect(s.ac.s.crashed).toBeNull();
  });
  it('the PFD wind data reports drift and components', () => {
    const s = new Sim(SCENARIOS.find((x) => x.id === 'ils27-vtf'));
    Object.assign(s.weather, { windDir: 180, windKt: 20, gustKt: 0, turbulence: 0 });
    s.ac.s.psi = (270 * Math.PI) / 180;
    for (let i = 0; i < 30 * 20; i++) s.step(1 / 30);
    const d = s.ac.data;
    expect(d.crosswindKt).toBeLessThan(-10); // wind from the left of a westbound aircraft
    expect(d.driftDeg).toBeGreaterThan(4); // pushed to the right
  });
  it('a crosswind makes a rolling aircraft weathervane into the wind', () => {
    const s = new Sim(SCENARIOS.find((x) => x.id === 'rwy27'));
    Object.assign(s.weather, { windDir: 360, windKt: 25, gustKt: 0, turbulence: 0 });
    s.controls.throttle = 0.5;
    for (let i = 0; i < 30 * 12; i++) s.step(1 / 30);
    const hdg = (s.ac.s.psi * 180) / Math.PI;
    expect(hdg).toBeGreaterThan(272); // turned right (towards 360) from 270
  });
});
