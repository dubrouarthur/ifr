import { describe, it, expect, beforeAll } from 'vitest';
import { PRESET_CIRCUITS, type Circuit } from '../src/train/circuits';
import { APPROACHES, approach as getApproach } from '../src/nav/data';
import type { Weather } from '../src/sim/environment';

beforeAll(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 } as Storage;
});
const wx = (o: Partial<Weather> = {}): Weather => ({ windDir: 250, windKt: 10, gustKt: 0, turbulence: 0.15, qnh: 29.92, oatSeaLevelC: 15, ceilingFt: 900, cloudTopFt: 7000, visibilitySm: 2, ...o });

describe('ATIS', () => {
  it('capitalises every sentence', async () => {
    const { atisText } = await import('../src/ui/atis');
    const t = atisText('PARD', wx());
    for (const s of t.split('. ')) expect(s[0]).toBe(s[0].toUpperCase());
    expect(t).toContain('Wind 250 at 10.');
    expect(t).toContain('Visibility 2.');
    expect(t).toContain('Ceiling 900 overcast.');
  });
  it('runway in use faces the wind; the approach advertised is to that runway, precision first', async () => {
    const { runwayInUse, approachInUse, runwayWind } = await import('../src/ui/atis');
    expect(runwayInUse('PARD', wx({ windDir: 270 })).id).toBe('27');
    expect(runwayInUse('PARD', wx({ windDir: 90 })).id).toBe('09');
    const ap = approachInUse('PARD', wx({ windDir: 270 }))!;
    expect(ap.runway).toBe('27');
    expect(ap.type).toBe('ILS');
    expect(runwayWind('PARD', '09', wx({ windDir: 270, windKt: 10 }))!.head).toBeLessThan(-9);
  });
});

describe('planner map geometry and profile', () => {
  it('lines and points carry the index of their circuit leg', async () => {
    const { planGeometry } = await import('../src/ui/routeMap');
    const c = PRESET_CIRCUITS[0];
    const g = planGeometry(c);
    const apLeg = c.legs.findIndex((l) => l.type === 'approach');
    expect(g.lines.some((l) => l.kind === 'approach' && l.leg === apLeg)).toBe(true);
    expect(g.points.find((p) => p.kind === 'start')!.leg).toBe(-1);
    const hold = c.legs.findIndex((l) => l.type === 'hold');
    expect(g.lines.some((l) => l.kind === 'hold' && l.leg === hold)).toBe(true);
    // procedure fixes carry their constraint (underlined minimum on the chart)
    expect(g.points.some((p) => p.role === 'FAF' && typeof p.amin === 'number')).toBe(true);
  });
  it('profile: climbs from the runway, glidepath to the threshold, DA over the final segment', async () => {
    const { planProfile } = await import('../src/ui/routeMap');
    const ils = APPROACHES.find((a) => a.id === 'PARD-I27')!;
    const c: Circuit = { ...PRESET_CIRCUITS[0], legs: [{ type: 'fix', ident: 'ARD', alt: 3000 }, { type: 'approach', approachId: ils.id, transition: 'ARD', outcome: 'land' }] };
    const p = planProfile(c, false);
    expect(p.pts[0].d).toBe(0);
    expect(p.total).toBeGreaterThan(5);
    expect(p.gp?.angle).toBe(3);
    expect(p.mins?.label).toMatch(/^DA /);
    const faf = p.pts.find((x) => x.role === 'FAF')!;
    expect(faf.alt).toBeGreaterThanOrEqual(getApproach(ils.id).final.find((l) => l.role === 'FAF')!.altMin!);
    const last = p.pts[p.pts.length - 1];
    expect(last.seg).toBe('gp');
    expect(last.alt).toBeLessThan(faf.alt);
    // monotonic distance
    for (let i = 1; i < p.pts.length; i++) expect(p.pts[i].d).toBeGreaterThanOrEqual(p.pts[i - 1].d - 1e-9);
  });
  it('a hold reaches its altitude in the hold, a missed approach climbs', async () => {
    const { planProfile } = await import('../src/ui/routeMap');
    const p = planProfile(PRESET_CIRCUITS[0], false);
    const h = p.pts.find((x) => x.hold)!;
    expect(h.alt).toBe((PRESET_CIRCUITS[0].legs.find((l) => l.type === 'hold') as { alt: number }).alt);
    expect(p.pts.some((x) => x.seg === 'missed')).toBe(true);
  });
  it('every preset profile is finite', async () => {
    const { planProfile, profileSvg } = await import('../src/ui/routeMap');
    for (const c of PRESET_CIRCUITS) {
      const p = planProfile(c, false);
      for (const x of p.pts) expect(Number.isFinite(x.alt) && Number.isFinite(x.d), c.name).toBe(true);
      expect(profileSvg(p, 600, 150)).toContain('<svg');
    }
  });
});

describe('planner weather line', () => {
  it('formats a METAR-like line', async () => {
    const { metarLine } = await import('../src/ui/flightsetup');
    expect(metarLine({ windDir: 250, windKt: 10, visibilitySm: 2, ceilingFt: 900, qnh: 29.92 })).toBe('25010KT 2SM OVC009 A2992');
    expect(metarLine({ windKt: 2, visibilitySm: 0.5, ceilingFt: 20000, qnh: 30.12, gustKt: 0 })).toBe('00000KT 1/2SM SKC A3012');
    expect(metarLine({ windDir: 180, windKt: 18, gustKt: 28, visibilitySm: 1.5, ceilingFt: 1100 })).toBe('18018G28KT 1 1/2SM OVC011 A2992');
  });
});

describe('planner map and profile layout', () => {
  it('a long circuit is not zoomed out for the far transitions of its approach', async () => {
    const { planGeometry } = await import('../src/ui/routeMap');
    const { findFix } = await import('../src/nav/data');
    const g = planGeometry(PRESET_CIRCUITS[0]);
    for (const id of ['TOBEY', 'SANDR']) {
      const f = findFix(id);
      if (f) expect(g.bounds.some((b) => b.lat === f.lat && b.lon === f.lon), id).toBe(false);
    }
  });
  it('profile labels stay inside the plot and a short final puts the minimums left of the FAF', async () => {
    const { planProfile, profileSvg } = await import('../src/ui/routeMap');
    const p = planProfile(PRESET_CIRCUITS[0], false);
    const svg = profileSvg(p, 300, 150);
    for (const m of svg.matchAll(/class="rp-alt[^"]*" x="([\d.-]+)"/g)) {
      expect(Number(m[1])).toBeGreaterThanOrEqual(44);
      expect(Number(m[1])).toBeLessThanOrEqual(300 - 14);
    }
    expect(svg).toMatch(/rp-mins-t" style="text-anchor:end"/);
    expect(profileSvg(p, 1400, 150)).not.toMatch(/rp-mins-t" style="text-anchor:end"/);
  });
});
