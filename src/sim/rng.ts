// Seeded PRNG for everything that affects the flight (turbulence, gusts, buffet): a scenario flown twice
// with the same seed is identical — repeatable training and checkrides, deterministic tests.
//
// Every Sim owns its own SimRng (sim.rng), passed to its Aircraft and WindModel: two Sims on one page (the
// cockpit and a course stage, a presenter and a projector) never reseed or consume each other's stream.
// The module-level seedSim()/simRandom() pair is kept for callers outside a Sim; the flight model never uses it.

/** A source of uniform numbers in [0, 1). */
export interface Rng {
  next(): number;
}

/** FNV-1a hash of a string seed (numbers are used as they are). Never 0. */
export function hashSeed(seed: number | string): number {
  let h = typeof seed === 'number' ? seed >>> 0 : 2166136261;
  if (typeof seed === 'string')
    for (let i = 0; i < seed.length; i++)
      h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  return h || 1;
}

/** mulberry32 over a 32-bit state. `seed()` restarts the stream; the same seed gives the same sequence. */
export class SimRng implements Rng {
  private state = 0x9e3779b9;
  constructor(seed?: number | string) {
    if (seed !== undefined) this.seed(seed);
  }
  seed(seed: number | string): void {
    this.state = hashSeed(seed);
  }
  /** uniform in [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** the raw state (save / restore a stream exactly, e.g. a captured scene) */
  get raw(): number {
    return this.state;
  }
  set raw(v: number) {
    this.state = v >>> 0;
  }
}

/** Shared stream for callers outside a Sim (legacy API). */
export const sharedRng = new SimRng();
export function seedSim(seed: number | string): void {
  sharedRng.seed(seed);
}
/** mulberry32: uniform in [0, 1) */
export function simRandom(): number {
  return sharedRng.next();
}
