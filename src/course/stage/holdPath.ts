// Ground school stage — a hold flown by a point mass, for the animated hold diagram (stage/diagramHold.ts): the
// arrival on a course to the fix, the entry of its sector (holdEntry(), AIM FIG 5-3-8), then laps of the racetrack in
// the wind. Standard-rate turns (3°/s), outbound timed from abeam the fix or from wings level if later (from the
// fix on a teardrop or a parallel entry), inbound course intercepted and tracked with the wind correction, the
// outbound heading corrected by a factor of the inbound drift (3: the triple-drift rule, FAA IFH ch. 10).
// Pure: no DOM, deterministic, cheap enough to recompute on every drag.
import { holdEntry, type HoldEntry, type Turn } from "../../nav/holding";

const D = Math.PI / 180;
const norm360 = (a: number) => ((a % 360) + 360) % 360;
const wrap180 = (a: number) => {
  const r = norm360(a);
  return r > 180 ? r - 360 : r;
};

/** Wind correction angle (° right positive) to hold `track` at `tas` with the wind from `dir` at `kt`. */
export function windCorrection(
  track: number,
  tas: number,
  dir: number,
  kt: number,
): number {
  if (kt <= 0 || tas <= 0) return 0;
  const x = (kt * Math.sin((dir - track) * D)) / tas;
  return Math.asin(Math.max(-1, Math.min(1, x))) / D;
}

export type HoldPhase =
  | "arrive"
  | "entry"
  | "turnOut"
  | "outbound"
  | "turnIn"
  | "inbound";
export interface HoldSample {
  /** seconds of real flight */
  t: number;
  /** NM east and north of the fix */
  x: number;
  y: number;
  /** true heading, ° */
  hdg: number;
  phase: HoldPhase;
  /** the stopwatch: outbound from abeam (or the fix), inbound from wings level */
  clock: { leg: "out" | "in"; s: number } | null;
  /** 0 during the entry, then the lap number from 1 */
  lap: number;
}
export interface HoldFlightSpec {
  inbound: number;
  turn: Turn;
  /** the arrival's course to the fix: its entry is flown first. Absent: established on the inbound leg */
  crs?: number;
  tasKt: number;
  windDir?: number;
  windKt?: number;
  /** the outbound heading's correction as a multiple of the inbound drift (default 3: the triple-drift rule) */
  outFactor?: number;
  /** outbound time from abeam, s. "auto": the time that gives a 1:00 inbound leg (default 60) */
  outS?: number | "auto";
  /** laps after the entry (default 2) */
  laps?: number;
  /** where the arrival starts, NM from the fix (default 2.2) */
  startNm?: number;
}
export interface HoldFlight {
  samples: HoldSample[];
  entry: HoldEntry | null;
  /** headings flown on the two legs, ° (rounded) */
  inHdg: number;
  outHdg: number;
  /** the outbound time flown, s */
  outS: number;
  /** the inbound legs timed (wings level to the fix), one per lap, s */
  inboundS: number[];
  /** where the stopwatch started outbound on each lap (NM east, north), the abeam point */
  abeam: { x: number; y: number }[];
  /** the moment the entry ends and the aircraft is in the hold (first crossing of the fix after the entry), s */
  establishedT: number;
}

/** Fly the hold. Pure. */
export function flyHold(spec: HoldFlightSpec): HoldFlight {
  const outS =
    spec.outS === "auto" ? autoOutbound(spec) : Math.max(10, spec.outS ?? 60);
  return simulate({ ...spec, outS });
}

/** The outbound time (5 s steps) whose inbound leg is closest to 1:00, in the spec's wind. Pure. */
export function autoOutbound(spec: HoldFlightSpec): number {
  let best = 60;
  let err = Infinity;
  for (let s = 15; s <= 240; s += 5) {
    const r = simulate({ ...spec, crs: undefined, laps: 1, outS: s });
    const ib = r.inboundS[0];
    if (ib === undefined) continue;
    const e = Math.abs(ib - 60);
    if (e < err) [best, err] = [s, e];
  }
  return best;
}

function simulate(spec: HoldFlightSpec & { outS: number }): HoldFlight {
  const I = norm360(spec.inbound);
  const O = norm360(I + 180);
  const s = spec.turn === "L" ? -1 : 1;
  const tas = Math.max(40, spec.tasKt);
  const wDir = spec.windDir ?? 0;
  const wKt = Math.max(0, spec.windKt ?? 0);
  const we = Math.sin((wDir + 180) * D) * wKt;
  const wn = Math.cos((wDir + 180) * D) * wKt;
  const wcaIn = windCorrection(I, tas, wDir, wKt);
  const inHdg = norm360(I + wcaIn);
  const k = spec.outFactor ?? 3;
  const outHdg = norm360(O + k * windCorrection(O, tas, wDir, wKt));
  const dt = 0.5;
  const ux = Math.sin(I * D);
  const uy = Math.cos(I * D);
  // along the inbound course (+ past the fix), across it (+ on the holding side)
  const along = () => x * ux + y * uy;
  const cross = () => s * (x * uy - y * ux);
  const samples: HoldSample[] = [];
  const inboundS: number[] = [];
  const abeam: { x: number; y: number }[] = [];
  let x = 0;
  let y = 0;
  let h = inHdg;
  let t = 0;
  let phase: HoldPhase = "arrive";
  let clock: HoldSample["clock"] = null;
  let lap = 0;
  let guard = 0;
  const LIMIT = 6000;
  const push = () =>
    samples.push({
      t,
      x,
      y,
      hdg: norm360(h),
      phase,
      clock: clock ? { ...clock } : null,
      lap,
    });
  const step = () => {
    x += ((tas * Math.sin(h * D) + we) * dt) / 3600;
    y += ((tas * Math.cos(h * D) + wn) * dt) / 3600;
    t += dt;
    if (clock) clock.s += dt;
    guard++;
    push();
  };
  const turnTo = (target: number, dir: number) => {
    while (guard < LIMIT) {
      const left = norm360((target - h) * dir);
      if (left < 3 * dt || left > 359.9) break;
      h = norm360(h + dir * Math.min(3 * dt, left));
      step();
    }
    h = norm360(target);
  };
  const steer = (target: number) => {
    const d = wrap180(target - h);
    h = norm360(h + Math.max(-3 * dt, Math.min(3 * dt, d)));
  };
  const straight = (secs: number) => {
    for (let k2 = 0; k2 < secs / dt && guard < LIMIT; k2++) step();
  };
  /** track the inbound course to the fix (intercept at up to 45°), then stop over it */
  const inboundToFix = () => {
    phase = "inbound";
    clock = { leg: "in", s: 0 };
    while (along() < 0 && guard < LIMIT) {
      const off = Math.max(-45, Math.min(45, cross() * 110));
      const trk = I - s * off;
      steer(norm360(trk + windCorrection(trk, tas, wDir, wKt)));
      step();
    }
    inboundS.push(clock.s);
  };
  /** one lap from over the fix: turn outbound, time it, turn inbound, back to the fix */
  const oneLap = () => {
    lap++;
    phase = "turnOut";
    clock = null;
    turnTo(outHdg, s);
    phase = "outbound";
    while (along() > 0 && guard < LIMIT) step();
    abeam.push({ x, y });
    clock = { leg: "out", s: 0 };
    straight(spec.outS);
    phase = "turnIn";
    clock = null;
    turnTo(inHdg, s);
    inboundToFix();
  };

  let entry: HoldEntry | null = null;
  if (spec.crs === undefined) {
    // established: on the inbound leg, a little before the fix
    const d0 = 0.6;
    x = -ux * d0;
    y = -uy * d0;
    h = inHdg;
    push();
    inboundToFix();
    inboundS.pop();
  } else {
    const crs = norm360(spec.crs);
    entry = holdEntry(I, spec.turn, crs);
    const d0 = spec.startNm ?? 2.2;
    x = -Math.sin(crs * D) * d0;
    y = -Math.cos(crs * D) * d0;
    h = norm360(crs + windCorrection(crs, tas, wDir, wKt));
    push();
    // track the course to the fix until abeam it on that course
    const cx = Math.sin(crs * D);
    const cy = Math.cos(crs * D);
    while (x * cx + y * cy < 0 && guard < LIMIT) {
      const xt = x * cy - y * cx; // + right of the arrival track
      const trk = crs - Math.max(-30, Math.min(30, xt * 110));
      steer(norm360(trk + windCorrection(trk, tas, wDir, wKt)));
      step();
    }
    phase = "entry";
    if (entry === "DIRECT") {
      // the direct entry: over the fix, the first turn in the direction of the hold is the first lap
    } else if (entry === "TEARDROP") {
      const td = norm360(O - 30 * s);
      const tdHdg = norm360(td + windCorrection(td, tas, wDir, wKt));
      clock = { leg: "out", s: 0 };
      turnTo(tdHdg, wrap180(tdHdg - h) >= 0 ? 1 : -1);
      straight(Math.max(0, 60 - clock.s));
      clock = null;
      turnTo(inHdg, s);
      inboundToFix();
      inboundS.pop();
    } else {
      // parallel: outbound on the non-holding side, then back through more than 180°
      const pHdg = norm360(O + windCorrection(O, tas, wDir, wKt));
      clock = { leg: "out", s: 0 };
      turnTo(pHdg, wrap180(pHdg - h) >= 0 ? 1 : -1);
      straight(Math.max(0, 60 - clock.s));
      clock = null;
      turnTo(norm360(I - 45 * s), -s);
      inboundToFix();
      inboundS.pop();
    }
  }
  const establishedT = t;
  const laps = Math.max(1, spec.laps ?? 2);
  for (let i = 0; i < laps && guard < LIMIT; i++) oneLap();
  return {
    samples,
    entry,
    inHdg: Math.round(inHdg) % 360 || 360,
    outHdg: Math.round(outHdg) % 360 || 360,
    outS: spec.outS,
    inboundS,
    abeam,
    establishedT,
  };
}

/** The sample at time t (linear between two samples; headings the short way). Pure. */
export function sampleAt(f: HoldFlight, t: number): HoldSample {
  const ss = f.samples;
  if (!ss.length)
    return { t: 0, x: 0, y: 0, hdg: 0, phase: "inbound", clock: null, lap: 0 };
  if (t <= ss[0].t) return ss[0];
  if (t >= ss[ss.length - 1].t) return ss[ss.length - 1];
  const dt = ss.length > 1 ? ss[1].t - ss[0].t : 1;
  const i = Math.min(ss.length - 2, Math.floor((t - ss[0].t) / dt));
  const a = ss[i];
  const b = ss[i + 1];
  const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
  return {
    ...a,
    t,
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    hdg: norm360(a.hdg + wrap180(b.hdg - a.hdg) * k),
  };
}
