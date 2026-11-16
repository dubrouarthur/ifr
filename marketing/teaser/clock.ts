// Teaser — a virtual clock. Imported FIRST by the teaser page: every renderer that reads performance.now() (blinking
// marker lights, panel haze, annunciator flashes) or Math.random() then sees the film's time and a seeded stream,
// so window.seek(t) draws the same frame whatever the machine and however long a screenshot takes.
let virtualMs = 0;
export const setClock = (ms: number) => {
  virtualMs = ms;
};
export const clockMs = () => virtualMs;
const perf = window.performance;
Object.defineProperty(perf, "now", {
  configurable: true,
  value: () => virtualMs,
});
// mulberry32
let seed = 0x5eed1234;
Math.random = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const reseed = (s: number) => {
  seed = s | 0;
};
