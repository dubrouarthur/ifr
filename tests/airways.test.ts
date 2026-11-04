// Airways from FAA CIFP and ICAO route strings, against a real loaded region.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';

const realFetch = globalThis.fetch;
beforeAll(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 } as Storage;
  globalThis.fetch = (async (u: string) => {
    const p = `public${u}`;
    return String(u).startsWith('/navdata/') && fs.existsSync(p) ? new Response(fs.readFileSync(p)) : new Response('', { status: 404 });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

describe('airways and route strings', () => {
  it('loads the airways of a region and expands an airway between two of its fixes', async () => {
    const { loadRegion, leaveRealWorld } = await import('../src/nav/world');
    const { AIRWAYS } = await import('../src/nav/data');
    const { airwayFixes, parseRoute, airwaysAt } = await import('../src/nav/airways');
    await loadRegion(['KSFO', 'KSJC']);
    expect(AIRWAYS.length).toBeGreaterThan(50);
    // find an airway chain with at least 3 consecutive fixes in the region
    let pick: { route: string; a: string; b: string; c: string } | null = null;
    for (const s of AIRWAYS) {
      const n = AIRWAYS.find((x) => x.route === s.route && x.from.ident === s.to.ident && x.to.ident !== s.from.ident);
      if (n) { pick = { route: s.route, a: s.from.ident, b: s.to.ident, c: n.to.ident }; break; }
    }
    expect(pick).toBeTruthy();
    const p = pick!;
    expect(airwaysAt(p.b)).toContain(p.route);
    expect(airwayFixes(p.route, p.a, p.c)!.map((f) => f.ident)).toEqual([p.a, p.b, p.c]);
    expect(airwayFixes(p.route, p.c, p.a)!.map((f) => f.ident)).toEqual([p.c, p.b, p.a]); // either direction
    const r = parseRoute(`KSFO DCT ${p.a} ${p.route} ${p.c} KSJC`);
    expect(r.errors).toEqual([]);
    expect(r.dep).toBe('KSFO');
    expect(r.arr).toBe('KSJC');
    expect(r.fixes).toEqual([p.a, p.b, p.c]);
    expect(r.items.find((i) => i.kind === 'airway')!.detail).toMatch(/MEA \d+/);
    leaveRealWorld();
  }, 30000);

  it('recognises SID and STAR with transitions and reports unknown tokens', async () => {
    const { loadRegion, leaveRealWorld } = await import('../src/nav/world');
    const { sidsFor, starsFor } = await import('../src/nav/terminal');
    const { parseRoute } = await import('../src/nav/airways');
    await loadRegion(['KSFO', 'KSJC']);
    const sid = sidsFor('KSFO').find((s) => s.enr.length)!;
    const star = starsFor('KSJC').find((s) => s.enr.length)!;
    const r = parseRoute(`KSFO ${sid.id}.${sid.enr[0].name} ${star.enr[0].name}.${star.id} KSJC`);
    expect(r.sid).toEqual({ id: sid.id, transition: sid.enr[0].name });
    expect(r.star).toEqual({ id: star.id, transition: star.enr[0].name });
    expect(parseRoute('KSFO ZZZZZ KSJC').errors[0]).toMatch(/ZZZZZ/);
    leaveRealWorld();
  }, 30000);
});
