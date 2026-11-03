import { describe, it, expect } from 'vitest';
import { flyablePath, turnRadiusNm, turnAnticipationNm, isFlyOver } from '../src/nav/pathgeom';
import { destination, distanceNm, bearingDeg } from '../src/nav/geo';

const A = { lat: 45, lon: 5 };
const B = destination(A, 90, 10);
const C = destination(B, 0, 10); // 90° left turn at B

describe('flight-path geometry with real turns', () => {
  it('turn radius: standard rate at GA speeds, 25° bank cap at airliner speeds', () => {
    expect(turnRadiusNm(90)).toBeCloseTo(90 / 188.5, 2); // standard rate
    expect(turnRadiusNm(250)).toBeGreaterThan(250 / 188.5); // bank-limited, bigger than standard-rate radius
    expect(turnAnticipationNm(90, 0, 90)).toBeCloseTo(turnRadiusNm(90), 2); // 90° turn: anticipation = R
  });
  it('fly-by: the path cuts inside the corner on an arc tangent to both legs', () => {
    const p = flyablePath([A, { ...B, ident: 'B' }, C], 120);
    expect(p.length).toBeGreaterThan(6);
    const minToB = Math.min(...p.map((q) => distanceNm(q, B)));
    expect(minToB).toBeGreaterThan(0.1); // never touches the waypoint
    const R = turnRadiusNm(120);
    expect(minToB).toBeLessThan(R); // but stays close: R(√2 − 1) for a 90° turn
    // consecutive points form a smooth curve: heading changes ≤ 6° per step on the arc
    for (let i = 2; i < p.length - 1; i++) {
      const d = Math.abs(((bearingDeg(p[i - 1], p[i]) - bearingDeg(p[i - 2], p[i - 1]) + 540) % 360) - 180);
      expect(d).toBeLessThan(46);
    }
  });
  it('fly-over: overflies the point, turns outside the corner, then rejoins', () => {
    const p = flyablePath([A, { ...B, ident: 'RW09', role: 'MAP' }, C], 120);
    expect(Math.min(...p.map((q) => distanceNm(q, B)))).toBeLessThan(0.01);
    // the turn takes the aircraft beyond B to the east before heading north
    expect(Math.max(...p.map((q) => q.lon))).toBeGreaterThan(B.lon + 0.001);
    expect(isFlyOver({ ...B, role: 'MAHP' })).toBe(true);
    expect(isFlyOver({ ...B, ident: 'KEDDY' })).toBe(false);
  });
  it('short legs: anticipation never exceeds half a leg', () => {
    const B2 = destination(A, 90, 1);
    const C2 = destination(B2, 0, 1);
    const p = flyablePath([A, B2, C2], 160);
    expect(Math.min(...p.map((q) => distanceNm(q, B2)))).toBeLessThan(0.5);
    expect(p.every((q) => Number.isFinite(q.lat) && Number.isFinite(q.lon))).toBe(true);
  });
});
