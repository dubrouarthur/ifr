import { describe, it, expect } from 'vitest';
import { toLocal, destination, DEG } from '../src/nav/geo';

// Mirrors the heading-up transform used by the ND and the track-up MFD/inset map.
function screen(ac: { lat: number; lon: number }, p: { lat: number; lon: number }, up: number) {
  const l = toLocal(ac, p);
  const a = up * DEG;
  return { x: l.x * Math.cos(a) - l.y * Math.sin(a), y: l.x * Math.sin(a) + l.y * Math.cos(a) };
}

describe('heading-up map transform', () => {
  const ac = { lat: 47.5, lon: -35 };
  it.each([0, 90, 180, 270, 45])('a point ahead on heading %i° is drawn straight up', (h) => {
    const s = screen(ac, destination(ac, h, 5), h);
    expect(s.y).toBeGreaterThan(4.9);
    expect(Math.abs(s.x)).toBeLessThan(0.1);
  });
  it('a point to the right of the nose is drawn to the right', () => {
    const s = screen(ac, destination(ac, 270 + 90, 5), 270);
    expect(s.x).toBeGreaterThan(4.9);
  });
});
