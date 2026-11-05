// A saved real-world flight whose plate is not loaded (region not loaded at start-up) must never stop
// the catalog, and so the whole app, from building.
import { describe, it, expect, beforeEach } from 'vitest';

const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
} as Storage;
const { catalog } = await import('../src/ui/catalog');

describe('catalog with a saved real-world flight', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      'ifr.circuits.v1',
      JSON.stringify([
        {
          id: 'c-real', name: 'KPAO-KSJC', description: '', world: 'real', dep: 'KPAO', dest: 'KSJC',
          start: { type: 'runway', airport: 'KPAO', runway: '31', initialAlt: 3000 },
          legs: [{ type: 'approach', approachId: 'KSJC-I30L', transition: null, outcome: 'land' }],
          weather: {}, failures: [], allowAp: true, mode: 'training', cockpit: null,
        },
      ]),
    );
  });
  it('builds, and lists the flight at its destination', () => {
    const items = catalog();
    expect(items.length).toBeGreaterThan(10);
    const mine = items.find((i) => i.title === 'KPAO-KSJC');
    expect(mine?.airport).toBe('KSJC');
  });
});
