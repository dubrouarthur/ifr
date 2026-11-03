// Seeded PRNG for everything that affects the flight (turbulence, gusts, buffet): a scenario flown twice
// with the same seed is identical — repeatable training and checkrides, deterministic tests.
let state = 0x9e3779b9;
export function seedSim(seed: number | string): void {
  let h = typeof seed === 'number' ? seed >>> 0 : 2166136261;
  if (typeof seed === 'string') for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  state = h || 1;
}
/** mulberry32: uniform in [0, 1) */
export function simRandom(): number {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
