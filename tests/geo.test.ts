import { describe, it, expect } from 'vitest';
import { bearingDeg, crossTrackNm, destination, distanceNm, wrap180, alongTrackNm } from '../src/nav/geo';

const A = { lat: 47.5, lon: -35 };

describe('geo', () => {
  it('destination/distance/bearing round-trip', () => {
    const B = destination(A, 63, 12.5);
    expect(distanceNm(A, B)).toBeCloseTo(12.5, 3);
    expect(bearingDeg(A, B)).toBeCloseTo(63, 1);
  });
  it('wrap180', () => {
    expect(wrap180(190)).toBe(-170);
    expect(wrap180(-190)).toBe(170);
    expect(wrap180(180)).toBe(180);
  });
  it('cross track is positive to the right of the path', () => {
    const B = destination(A, 0, 10); // path north
    const east = destination(destination(A, 0, 5), 90, 1);
    expect(crossTrackNm(A, B, east)).toBeCloseTo(1, 2);
    expect(alongTrackNm(A, B, east)).toBeCloseTo(5, 1);
  });
});
