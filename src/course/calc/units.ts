// Calc engine — units: dimensions, exact conversion factors, and the units a student may answer in.
//
// Factors are the legal / standard ones: 1 NM = 1 852 m (exact), 1 ft = 0.3048 m (exact), 1 SM = 1 609.344 m,
// 1 inHg = 33.8639 hPa, 1 US gal = 3.785 411 784 L, 1 lb = 0.453 592 37 kg; avgas 6.0 lb / US gal (FAA-H-8083-25
// PHAK ch. 10 planning figure) and 0.72 kg / L (EASA / JAA planning figure).
import type { CalcUnit } from "../types";

export const M_PER_FT = 0.3048;
export const M_PER_NM = 1852;
export const FT_PER_NM = M_PER_NM / M_PER_FT; // 6 076.115…
export const M_PER_SM = 1609.344;
export const KMH_PER_KT = 1.852;
export const MPH_PER_KT = M_PER_NM / M_PER_SM; // 1.150 78…
export const HPA_PER_INHG = 33.8639;
export const L_PER_USGAL = 3.785411784;
export const KG_PER_LB = 0.45359237;
export const AVGAS_LB_PER_USGAL = 6.0;
export const AVGAS_KG_PER_L = 0.72;

export type Dimension =
  | "angle"
  | "length"
  | "speed"
  | "vspeed"
  | "gradient"
  | "time"
  | "volume"
  | "mass"
  | "flow"
  | "pressure"
  | "temperature"
  | "arm"
  | "moment"
  | "none";

interface UnitDef {
  dim: Dimension;
  /** value in this unit → the dimension's base unit */
  toBase(v: number): number;
  fromBase(v: number): number;
  /** decimals a pilot writes */
  digits: number;
}

const lin = (dim: Dimension, k: number, digits: number): UnitDef => ({
  dim,
  toBase: (v) => v * k,
  fromBase: (v) => v / k,
  digits,
});

// base units: deg, m, kt, fpm, ftPerNm, min, L, kg, L/h, hPa, °C, in, lb·in
const UNITS: Record<CalcUnit, UnitDef> = {
  deg: lin("angle", 1, 0),
  m: lin("length", 1, 0),
  ft: lin("length", M_PER_FT, 0),
  NM: lin("length", M_PER_NM, 1),
  SM: lin("length", M_PER_SM, 1),
  km: lin("length", 1000, 1),
  kt: lin("speed", 1, 0),
  kmh: lin("speed", 1 / KMH_PER_KT, 0),
  mph: lin("speed", 1 / MPH_PER_KT, 0),
  fpm: lin("vspeed", 1, 0),
  ftPerNm: lin("gradient", 1, 0),
  pct: lin("gradient", FT_PER_NM / 100, 1),
  min: lin("time", 1, 0),
  s: lin("time", 1 / 60, 0),
  h: lin("time", 60, 1),
  L: lin("volume", 1, 0),
  usgal: lin("volume", L_PER_USGAL, 1),
  kg: lin("mass", 1, 0),
  lb: lin("mass", KG_PER_LB, 0),
  lph: lin("flow", 1, 0),
  gph: lin("flow", L_PER_USGAL, 1),
  hPa: lin("pressure", 1, 0),
  inHg: lin("pressure", HPA_PER_INHG, 2),
  degC: lin("temperature", 1, 0),
  degF: {
    dim: "temperature",
    toBase: (f) => ((f - 32) * 5) / 9,
    fromBase: (c) => (c * 9) / 5 + 32,
    digits: 0,
  },
  in: lin("arm", 1, 1),
  lbIn: lin("moment", 1, 0),
  none: lin("none", 1, 0),
};

export function dimensionOf(unit: CalcUnit): Dimension {
  return UNITS[unit].dim;
}

export function sameDimension(a: CalcUnit, b: CalcUnit): boolean {
  return UNITS[a].dim === UNITS[b].dim;
}

/** Convert `v` from one unit to another of the same dimension (NaN across dimensions). */
export function convert(v: number, from: CalcUnit, to: CalcUnit): number {
  if (from === to) return v;
  const a = UNITS[from];
  const b = UNITS[to];
  if (a.dim !== b.dim) return NaN;
  return b.fromBase(a.toBase(v));
}

/**
 * Convert a tolerance (a difference, not a value): affine units (°F) scale but do not shift.
 */
export function convertDelta(d: number, from: CalcUnit, to: CalcUnit): number {
  if (from === to) return d;
  return Math.abs(convert(d, from, to) - convert(0, from, to));
}

/** decimals a pilot writes for this unit */
export function unitDigits(unit: CalcUnit): number {
  return UNITS[unit].digits;
}

/** the other units of the same dimension a student may answer in (the answer box's unit menu) */
export function unitsLike(unit: CalcUnit): CalcUnit[] {
  const dim = UNITS[unit].dim;
  if (dim === "none" || dim === "angle" || dim === "arm" || dim === "moment")
    return [unit];
  // a height (ft, m) and a distance (NM, SM, km) share a dimension but never an answer box: an altitude
  // correction in NM makes no sense
  if (dim === "length")
    return unit === "ft" || unit === "m" ? ["ft", "m"] : ["NM", "SM", "km"];
  return (Object.keys(UNITS) as CalcUnit[]).filter((u) => UNITS[u].dim === dim);
}

/** Round like a pilot: to the nearest `step` (e.g. 10 ft, 5 kt, 0.1 NM). */
export function roundStep(v: number, step: number): number {
  if (step <= 0) return v;
  const r = Math.round(v / step) * step;
  const s = String(step);
  const i = s.indexOf(".");
  const d = i < 0 ? 0 : s.length - i - 1;
  return Number(r.toFixed(d));
}

/** Round up to the next `step` (fuel, cold-temperature corrections: round toward safety). */
export function ceilStep(v: number, step: number): number {
  return roundStep(Math.ceil(v / step - 1e-9) * step, step);
}
