// Ground school stage — the maths behind the interactive calc diagrams. Pure functions, unit-tested
// (tests/course-stage-diagrams.test.ts). The calc generators (course/calc, package K) own the graded answers and
// the pilot's rounding; these functions only draw what the numbers mean, exactly, and re-solve while the student
// drags. Sources are cited where a rule is taught.
import { DEG, norm360, wrap180 } from "./svgkit";

export const FT_PER_NM = 6076.12;
export const G_MS2 = 9.80665;
export const KT_MS = 1852 / 3600;

// ------------------------------------------------------------------ wind triangle (PHAK ch. 16, E6B)
export interface WindSolution {
  /** wind correction angle, + = heading right of the course (wind from the right) */
  wca: number;
  /** true heading to fly */
  th: number;
  /** ground speed (kt) */
  gs: number;
  /** headwind component along the course (+ = headwind) */
  head: number;
  /** crosswind component (+ = from the right) */
  cross: number;
  /** false when the crosswind is stronger than the TAS (no heading holds the course) */
  ok: boolean;
}
/** Heading and ground speed to make good `course` at `tas` in a wind FROM `windDir` at `windKt`. */
export function solveWind(
  course: number,
  tas: number,
  windDir: number,
  windKt: number,
): WindSolution {
  const rel = (windDir - course) * DEG;
  const cross = windKt * Math.sin(rel);
  const head = windKt * Math.cos(rel);
  if (!(tas > 0) || Math.abs(cross) > tas)
    return {
      wca: 0,
      th: norm360(course),
      gs: Math.max(0, tas - head),
      head,
      cross,
      ok: false,
    };
  const wca = Math.asin(cross / tas) / DEG;
  const gs = tas * Math.cos(wca * DEG) - head;
  return { wca, th: norm360(course + wca), gs, head, cross, ok: gs > 0 };
}
/** Track and ground speed when flying `heading` at `tas` in the wind (the triangle the other way round). */
export function trackFromHeading(
  heading: number,
  tas: number,
  windDir: number,
  windKt: number,
): { trk: number; gs: number; drift: number } {
  // air vector + wind vector (the wind blows TOWARD windDir + 180)
  const ax = tas * Math.sin(heading * DEG);
  const ay = tas * Math.cos(heading * DEG);
  const wx = windKt * Math.sin((windDir + 180) * DEG);
  const wy = windKt * Math.cos((windDir + 180) * DEG);
  const gx = ax + wx;
  const gy = ay + wy;
  const gs = Math.hypot(gx, gy);
  const trk = gs > 1e-9 ? norm360(Math.atan2(gx, gy) / DEG) : norm360(heading);
  return { trk, gs, drift: wrap180(trk - heading) };
}

// ------------------------------------------------------------------ 60:1 (IFH ch. 9 "the 1 in 60 rule")
export interface SixtyToOne {
  /** track error: rule of thumb 60 × off / flown (°) */
  te: number;
  teExact: number;
  /** closing angle to reach the destination: 60 × off / to go (°) */
  ca: number | null;
  caExact: number | null;
  /** heading change to go direct to the destination = TE + CA (°); to parallel the course = TE */
  correction: number | null;
}
export function sixtyToOne(
  flownNm: number,
  offNm: number,
  toGoNm?: number,
): SixtyToOne {
  const f = Math.max(1e-6, flownNm);
  const te = (60 * offNm) / f;
  const teExact = Math.atan2(offNm, f) / DEG;
  if (toGoNm === undefined || !(toGoNm > 0))
    return { te, teExact, ca: null, caExact: null, correction: null };
  const ca = (60 * offNm) / toGoNm;
  const caExact = Math.atan2(offNm, toGoNm) / DEG;
  return { te, teExact, ca, caExact, correction: te + ca };
}

// ------------------------------------------------------------------ descent / climb profile (AIM 5-4-5, IFH)
/** ft per NM for a path angle (°): exact tan(θ) × 6076.12 (3° ≈ 318 ft/NM; the rule of thumb 300). */
export const ftPerNmOfAngle = (deg: number): number =>
  Math.tan(deg * DEG) * FT_PER_NM;
export const angleOfFtPerNm = (ftNm: number): number =>
  Math.atan(ftNm / FT_PER_NM) / DEG;
/** gradient in % (ft per 100 ft) ↔ ft/NM */
export const pctOfFtPerNm = (ftNm: number): number => (ftNm / FT_PER_NM) * 100;
export const ftPerNmOfPct = (pct: number): number => (pct / 100) * FT_PER_NM;
/** vertical speed (ft/min) for a gradient at a ground speed: ft/NM × GS / 60 (3°: ≈ GS × 5) */
export const vsOf = (ftNm: number, gsKt: number): number => (ftNm * gsKt) / 60;
export interface ProfileSolution {
  ftPerNm: number;
  angleDeg: number;
  pct: number;
  /** distance from the start of the descent to the level-off point (NM) */
  distNm: number;
  /** ft/min at gsKt (null without a ground speed) */
  vsFpm: number | null;
  /** minutes from TOD to level-off */
  minutes: number | null;
}
/**
 * Solve a profile: give two of (altitude to lose, gradient or angle, distance). Priority: an explicit gradient
 * (ftPerNm), else an angle, else the distance; with none, 3°.
 */
export function solveProfile(p: {
  fromFt: number;
  toFt: number;
  ftPerNm?: number;
  angleDeg?: number;
  gsKt?: number;
  distNm?: number;
}): ProfileSolution {
  const lose = Math.abs(p.fromFt - p.toFt);
  let ftNm: number;
  if (p.ftPerNm && p.ftPerNm > 0) ftNm = p.ftPerNm;
  else if (p.angleDeg && p.angleDeg > 0) ftNm = ftPerNmOfAngle(p.angleDeg);
  else if (p.distNm && p.distNm > 0) ftNm = lose / p.distNm;
  else ftNm = ftPerNmOfAngle(3);
  const distNm = ftNm > 0 ? lose / ftNm : 0;
  const vsFpm = p.gsKt && p.gsKt > 0 ? vsOf(ftNm, p.gsKt) : null;
  const minutes = p.gsKt && p.gsKt > 0 ? (distNm / p.gsKt) * 60 : null;
  return {
    ftPerNm: ftNm,
    angleDeg: angleOfFtPerNm(ftNm),
    pct: pctOfFtPerNm(ftNm),
    distNm,
    vsFpm,
    minutes,
  };
}
/** VDP: (MDA − TDZE) / 300 NM from the threshold (the 3° rule of thumb, FAA IFH / AIM 5-4-5); exact on a 3° path. */
export function vdpNm(
  mdaFt: number,
  tdzeFt: number,
  angleDeg = 3,
): { rule: number; exact: number } {
  const hat = Math.max(0, mdaFt - tdzeFt);
  return { rule: hat / 300, exact: hat / ftPerNmOfAngle(angleDeg) };
}

// ------------------------------------------------------------------ holding in wind (AIM 5-3-8, IFH ch. 10)
export interface HoldWindSolution {
  inboundCourse: number;
  outboundCourse: number;
  /** inbound WCA (+ right) */
  wcaIn: number;
  inboundHdg: number;
  /** outbound heading with the inbound correction TRIPLED, applied the other way (AIM 5-3-8 "triple the
   *  inbound drift correction on the outbound leg") */
  outboundHdg: number;
  /** exact WCA for the outbound course (for comparison: the tripled value also covers the wind in the turns) */
  wcaOutExact: number;
  gsIn: number;
  gsOut: number;
  /** outbound time to fly so that the inbound leg lasts `inboundS` (equal leg lengths; turns not counted) */
  outboundS: number;
  /** headwind component on the inbound leg (+ = headwind) */
  headIn: number;
}
export function solveHoldWind(
  inbound: number,
  windDir: number,
  windKt: number,
  tasKt: number,
  inboundS = 60,
): HoldWindSolution {
  const inn = solveWind(inbound, tasKt, windDir, windKt);
  const outCourse = norm360(inbound + 180);
  const out = solveWind(outCourse, tasKt, windDir, windKt);
  const outboundHdg = norm360(outCourse - 3 * inn.wca);
  const legNm = (Math.max(1, inn.gs) * inboundS) / 3600;
  const outboundS = out.gs > 1 ? (legNm / out.gs) * 3600 : inboundS;
  return {
    inboundCourse: norm360(inbound),
    outboundCourse: outCourse,
    wcaIn: inn.wca,
    inboundHdg: inn.th,
    outboundHdg,
    wcaOutExact: out.wca,
    gsIn: inn.gs,
    gsOut: out.gs,
    outboundS,
    headIn: inn.head,
  };
}

// ------------------------------------------------------------------ TVMDC (PHAK ch. 16): TC → TH → MH → CH
export interface Tvmdc {
  tc: number;
  th: number;
  mh: number;
  ch: number;
}
/**
 * `wca` + = right; `variation` + = EAST ("East is least": subtract it; "West is best": add it);
 * `deviation` = the compass card's correction to ADD to the magnetic heading (+ = steer more).
 */
export function tvmdc(
  tc: number,
  wca: number,
  variation: number,
  deviation: number,
): Tvmdc {
  const th = norm360(tc + wca);
  const mh = norm360(th - variation);
  const ch = norm360(mh + deviation);
  return { tc: norm360(tc), th, mh, ch };
}
export const variationText = (v: number, fr = false): string =>
  Math.abs(v) < 0.05
    ? "0°"
    : `${Math.abs(Math.round(v * 10) / 10)}°${v > 0 ? "E" : fr ? "O" : "W"}`;

// ------------------------------------------------------------------ weight and balance: C172S (POH section 6)
export type CgCategory = "normal" | "utility";
/** C172S CG limits (POH 172S, section 6, "Center of Gravity Limits"): forward 35.0 in at 1950 lb or less,
 *  straight line to 41.0 in at 2550 lb; aft 47.3 in (normal). Utility: max 2200 lb, aft 40.5 in. */
export const C172S = {
  maxNormalLb: 2550,
  maxUtilityLb: 2200,
  minChartLb: 1500,
  fwdAt1950: 35.0,
  fwdAt2550: 41.0,
  aftNormal: 47.3,
  aftUtility: 40.5,
};
/** forward CG limit (in aft of datum) at a weight */
export function c172sFwdLimit(weightLb: number): number {
  if (weightLb <= 1950) return C172S.fwdAt1950;
  return (
    C172S.fwdAt1950 +
    ((Math.min(weightLb, C172S.maxNormalLb) - 1950) /
      (C172S.maxNormalLb - 1950)) *
      (C172S.fwdAt2550 - C172S.fwdAt1950)
  );
}
/** The envelope polygon in (CG in, weight lb), clockwise from the bottom-left. */
export function c172sEnvelope(cat: CgCategory): [number, number][] {
  const top = cat === "normal" ? C172S.maxNormalLb : C172S.maxUtilityLb;
  const aft = cat === "normal" ? C172S.aftNormal : C172S.aftUtility;
  return [
    [C172S.fwdAt1950, C172S.minChartLb],
    [C172S.fwdAt1950, 1950],
    [c172sFwdLimit(top), top],
    [aft, top],
    [aft, C172S.minChartLb],
  ];
}
export interface CgCheck {
  cgIn: number;
  inside: boolean;
  /** what is wrong, if anything */
  reason: "ok" | "overweight" | "forward" | "aft";
  /** margin to the nearest limit (in, or lb for overweight) */
  marginIn: number;
}
export function checkCg(
  weightLb: number,
  momentLbIn: number,
  cat: CgCategory = "normal",
): CgCheck {
  const cgIn = weightLb > 0 ? momentLbIn / weightLb : 0;
  const top = cat === "normal" ? C172S.maxNormalLb : C172S.maxUtilityLb;
  const aft = cat === "normal" ? C172S.aftNormal : C172S.aftUtility;
  const fwd = c172sFwdLimit(weightLb);
  if (weightLb > top + 1e-9)
    return {
      cgIn,
      inside: false,
      reason: "overweight",
      marginIn: top - weightLb,
    };
  if (cgIn < fwd - 1e-9)
    return { cgIn, inside: false, reason: "forward", marginIn: cgIn - fwd };
  if (cgIn > aft + 1e-9)
    return { cgIn, inside: false, reason: "aft", marginIn: aft - cgIn };
  return {
    cgIn,
    inside: true,
    reason: "ok",
    marginIn: Math.min(cgIn - fwd, aft - cgIn),
  };
}

// ------------------------------------------------------------------ turns (IFH ch. 4; FAA-H-8083-15B)
/** standard-rate (3°/s) bank: exact tan φ = ω V / g; rule of thumb TAS / 10 + 7 */
export function standardRateBank(tasKt: number): {
  exact: number;
  rule: number;
} {
  const omega = 3 * DEG;
  return {
    exact: Math.atan((omega * tasKt * KT_MS) / G_MS2) / DEG,
    rule: tasKt / 10 + 7,
  };
}
/** turn radius (NM) at a bank: r = V² / (g tan φ) */
export function turnRadiusNm(tasKt: number, bankDeg: number): number {
  const v = tasKt * KT_MS;
  const t = Math.tan(Math.max(0.1, Math.abs(bankDeg)) * DEG);
  return (v * v) / (G_MS2 * t) / 1852;
}
