import { describe, expect, it } from 'vitest';
import { drum, drumReading, secondaryTextScale, VSPEEDS } from '../src/avionics/pfd';
import { LabelPlacer } from '../src/avionics/mfd';

describe('G1000 rolling drums', () => {
  const ias = (v: number) => drumReading(drum(v, 1, 10), 1, 10);
  const alt = (v: number) => drumReading(drum(v, 20, 100), 20, 100);

  it('carries the tens digit of the airspeed (89.6 kt reads 90, not 80)', () => {
    expect(ias(89.6)).toBe(90);
    const d = drum(89.6, 1, 10);
    expect(d.hi).toBe(8);
    expect(d.hiFrac).toBeCloseTo(0.6, 5); // the tens drum is 60 % of the way from 8 to 9
    expect(ias(89.4)).toBe(89);
    expect(ias(99.7)).toBe(100);
    expect(ias(120)).toBe(120);
  });

  it('only rolls the upper digits during the last step of the low drum', () => {
    expect(drum(85.5, 1, 10).hiFrac).toBe(0);
    expect(drum(2950, 20, 100).hiFrac).toBe(0);
  });

  it('carries the hundreds of the altimeter (2999 ft reads 3000, not 2900)', () => {
    expect(alt(2999)).toBe(3000);
    const d = drum(2999, 20, 100);
    expect(d.hi).toBe(29);
    expect(d.low).toBe(80);
    expect(d.hiFrac).toBeCloseTo(0.95, 5);
    expect(alt(3000)).toBe(3000);
    expect(alt(2940)).toBe(2940);
    expect(alt(1011)).toBe(1020);
  });
});

describe('G1000 legibility and references', () => {
  it('scales secondary text when the screen is drawn small', () => {
    expect(secondaryTextScale(1024)).toBe(1);
    expect(secondaryTextScale(600)).toBe(1);
    expect(secondaryTextScale(420)).toBe(1.25);
  });
  it('orders the V-speed bugs like a C172 (Vr < Vx < Vg < Vy)', () => {
    expect(VSPEEDS.vr).toBeLessThan(VSPEEDS.vx);
    expect(VSPEEDS.vx).toBeLessThan(VSPEEDS.vg);
    expect(VSPEEDS.vg).toBeLessThan(VSPEEDS.vy);
  });
});

describe('MFD label placer', () => {
  it('tries the four quadrants and drops a label when all collide', () => {
    const p = new LabelPlacer({ x: 0, y: 0, w: 400, h: 400 });
    const a = p.place(200, 200, 40, 14, 6);
    expect(a).toEqual({ x: 206, y: 180, w: 40, h: 14 }); // NE first
    const b = p.place(200, 200, 40, 14, 6);
    expect(b).toEqual({ x: 206, y: 206, w: 40, h: 14 }); // then SE
    p.place(200, 200, 40, 14, 6); // NW
    p.place(200, 200, 40, 14, 6); // SW
    expect(p.place(200, 200, 40, 14, 6)).toBeNull();
  });
  it('keeps labels inside the map and clear of blocked boxes', () => {
    const p = new LabelPlacer({ x: 0, y: 0, w: 100, h: 100 });
    p.block({ x: 50, y: 0, w: 50, h: 50 });
    expect(p.place(95, 30, 30, 12, 5)).toBeNull(); // east is off the map, west is blocked
    const r = p.place(45, 30, 30, 12, 5)!;
    expect(r).toEqual({ x: 10, y: 13, w: 30, h: 12 }); // NW: the only free quadrant
  });
});
