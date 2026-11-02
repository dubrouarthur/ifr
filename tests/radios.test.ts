import { describe, it, expect } from 'vitest';
import { computeNav } from '../src/nav/radios';
import { navaid, runway } from '../src/nav/data';
import { destination } from '../src/nav/geo';

const r27 = runway('PARD', '27');

describe('ILS receiver', () => {
  it('centered on the localizer and glideslope at the FAF', () => {
    const p = destination(r27.threshold, 90, 6);
    const out = computeNav(110.3, 0, { ...p, altFt: 420 + (6 * 6076.12 + 1000) * Math.tan((3 * Math.PI) / 180) });
    expect(out.valid).toBe(true);
    expect(out.isLoc).toBe(true);
    expect(Math.abs(out.dev)).toBeLessThan(0.02);
    expect(out.gsValid).toBe(true);
    expect(Math.abs(out.gsDev)).toBeLessThan(0.1);
  });
  it('north of the inbound-west localizer means fly left', () => {
    const p = destination(destination(r27.threshold, 90, 8), 0, 0.3);
    const out = computeNav(110.3, 0, { ...p, altFt: 3000 });
    expect(out.dev).toBeLessThan(-0.2);
  });
  it('below glideslope means fly up', () => {
    const p = destination(r27.threshold, 90, 6);
    const out = computeNav(110.3, 0, { ...p, altFt: 1500 });
    expect(out.gsDev).toBeGreaterThan(0.5);
  });
});

describe('VOR receiver', () => {
  const ard = navaid('ARD');
  it('TO/FROM and deviation sense', () => {
    // 10 nm south of ARD slightly east, OBS 360 => TO, fly left
    const p = destination(destination(ard, 180, 10), 90, 0.5);
    const out = computeNav(114.2, 360, { ...p, altFt: 3000 });
    expect(out.toFrom).toBe('TO');
    expect(out.dev).toBeLessThan(0);
    // 10 nm north slightly west, OBS 360 => FROM, fly right
    const q = destination(destination(ard, 0, 10), 270, 0.5);
    const o2 = computeNav(114.2, 360, { ...q, altFt: 3000 });
    expect(o2.toFrom).toBe('FROM');
    expect(o2.dev).toBeGreaterThan(0);
    expect(o2.dmeNm).toBeGreaterThan(9.9);
  });
  it('out of range is invalid', () => {
    const p = destination(ard, 0, 200);
    expect(computeNav(114.2, 0, { ...p, altFt: 1000 }).valid).toBe(false);
  });
});
