import { describe, it, expect } from 'vitest';
import { planGeometry } from '../src/ui/routeMap';
import { PRESET_CIRCUITS } from '../src/train/circuits';

describe('flight-plan map geometry', () => {
  it('classic circuit: route, ARD hold racetrack, approach, missed approach and its hold', () => {
    const g = planGeometry(PRESET_CIRCUITS[0]);
    const kinds = g.lines.map((l) => l.kind);
    expect(kinds).toContain('route');
    expect(kinds).toContain('hold');
    expect(kinds).toContain('approach');
    expect(kinds).toContain('missed');
    const hold = g.lines.find((l) => l.kind === 'hold')!;
    expect(hold.pts.length).toBeGreaterThan(20); // a closed racetrack, not a point
    expect(g.points.some((p) => p.kind === 'start')).toBe(true);
    expect(g.points.some((p) => p.kind === 'faf')).toBe(true);
    expect(g.bounds.length).toBeGreaterThan(5);
  });
  it('every preset circuit produces drawable geometry', () => {
    for (const c of PRESET_CIRCUITS) {
      const g = planGeometry(c);
      expect(g.lines.length, c.name).toBeGreaterThan(0);
      for (const l of g.lines) for (const p of l.pts) expect(Number.isFinite(p.lat) && Number.isFinite(p.lon), c.name).toBe(true);
    }
  });
  it('a plan referring to an unknown approach does not throw', () => {
    const c = { ...PRESET_CIRCUITS[0], legs: [{ type: 'approach' as const, approachId: 'XXXX-NOPE', transition: null, outcome: 'land' as const }] };
    expect(() => planGeometry(c)).not.toThrow();
  });
});
