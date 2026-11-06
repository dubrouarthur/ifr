// Calc engine — seeded random numbers for generators, built on the sim's SimRng (mulberry32).
//
// The stream of a problem is seeded from "<generatorId>:<seed>", so one seed gives different numbers on different
// generators, and the same (generator, seed, params) always gives the same problem: a CFI can fix a seed for the
// whole class, a retry draws a new seed (newSeed()) and gets new numbers.
import { SimRng, hashSeed } from "../../sim/rng";
import type { CalcGeneratorId, CalcRng } from "../types";

/** decimals of a grid step (0.5 → 1, 0.25 → 2), to keep 0.1 + 0.2 from leaking into a problem */
function decimalsOf(step: number): number {
  const s = String(step);
  const i = s.indexOf(".");
  return i < 0 ? 0 : Math.min(6, s.length - i - 1);
}

/** A CalcRng over any uniform source. */
export function rngFrom(next: () => number): CalcRng {
  const rng: CalcRng = {
    next,
    int(min, max) {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    range(min, max, step) {
      if (!step || step <= 0) return min + next() * (max - min);
      const n = Math.floor((max - min) / step + 1e-9);
      const v = min + step * rng.int(0, n);
      const k = 10 ** decimalsOf(step);
      return Math.round(v * k) / k;
    },
    pick(items) {
      if (!items.length) throw new Error("calc rng: pick() from an empty list");
      return items[
        Math.min(items.length - 1, Math.floor(next() * items.length))
      ];
    },
    chance(p) {
      return next() < p;
    },
  };
  return rng;
}

/** The generator stream for (id, seed). */
export function calcRng(id: CalcGeneratorId | string, seed: number): CalcRng {
  const r = new SimRng(hashSeed(`${id}:${seed >>> 0}`));
  return rngFrom(() => r.next());
}

/** A plain seeded stream (drill plans, shuffles). */
export function seededRng(seed: number | string): CalcRng {
  const r = new SimRng(seed);
  return rngFrom(() => r.next());
}

/** A fresh seed for "New numbers": 1..999 999 (short enough to read aloud or type in the editor). */
export function newSeed(): number {
  let u = Math.random();
  const c = (
    globalThis as { crypto?: { getRandomValues?(a: Uint32Array): Uint32Array } }
  ).crypto;
  if (c?.getRandomValues) {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    u = a[0] / 4294967296;
  }
  return 1 + Math.floor(u * 999999);
}
