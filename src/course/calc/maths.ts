// Calc engine — the exact formulas behind every generator (pure, unit-tested on their own).
//
// Conventions: angles in degrees, speeds in kt, distances in NM, heights in ft, temperatures in °C, pressures in hPa
// unless the name says otherwise. Wind is the direction it blows FROM. A positive crosswind / WCA is from / to the
// right of the course.
//
// Sources: ICAO Doc 7488 (ISA: T0 288.15 K, p0 1013.25 hPa, lapse 6.5 K/km to 11 km), FAA-H-8083-15 IFH (turns,
// 60:1, arcs), FAA-H-8083-25 PHAK (wind triangle, density altitude), ICAO Doc 8168 PANS-OPS Vol I and FAA AIM 7-2-3
// (cold-temperature correction).
import { FT_PER_NM, KMH_PER_KT, M_PER_FT, M_PER_NM } from "./units";

export const DEG = Math.PI / 180;
export const G0 = 9.80665; // m/s²
export const MS_PER_KT = M_PER_NM / 3600;
export const ISA_T0_K = 288.15;
export const ISA_P0_HPA = 1013.25;
/** ISA lapse in the troposphere, K per ft (0.0065 K/m) */
export const ISA_LAPSE_K_PER_FT = 0.0065 * M_PER_FT; // 0.001 981 2
/** 1 − PA × this = (T/T0) in ISA */
export const ISA_K = ISA_LAPSE_K_PER_FT / ISA_T0_K; // 6.875 6 × 10⁻⁶ per ft
/** g / (R × L) */
export const ISA_EXP = 5.25588;
/** speed of sound at sea level, kt */
export const A0_KT = 661.4786;

export function norm360(a: number): number {
  const r = a % 360;
  return r < 0 ? r + 360 : r;
}
export function wrap180(a: number): number {
  let r = norm360(a);
  if (r > 180) r -= 360;
  return r;
}
/** heading as written: 1..360 */
export function hdg360(a: number): number {
  const r = Math.round(norm360(a));
  return r === 0 ? 360 : r;
}

// ------------------------------------------------------------------ wind
/** Head (+ = headwind) and cross (+ = from the right) components of a wind on a course or runway. */
export function windComponents(
  course: number,
  windDir: number,
  windKt: number,
): { head: number; cross: number } {
  const a = (windDir - course) * DEG;
  return { head: windKt * Math.cos(a), cross: windKt * Math.sin(a) };
}

/** Wind triangle (exact): wind correction angle (+ = right), true heading, ground speed. */
export function windTriangle(
  tc: number,
  tasKt: number,
  windDir: number,
  windKt: number,
): { wca: number; th: number; gs: number; cross: number; head: number } {
  const { head, cross } = windComponents(tc, windDir, windKt);
  const s = Math.max(-1, Math.min(1, cross / tasKt));
  const wca = Math.asin(s) / DEG;
  const gs = tasKt * Math.cos(wca * DEG) - head;
  return { wca, th: norm360(tc + wca), gs, cross, head };
}

/** The pilot's wind correction: WCA ≈ crosswind × 60 / TAS (the "base factor" 60/TAS, "facteur de base"). */
export function wcaRule(cross: number, tasKt: number): number {
  return (cross * 60) / tasKt;
}

/** The clock-face rule: fraction of the wind across = angle / 60 (15° → ¼, 30° → ½, 45° → ¾, 60°+ → all). */
export function clockFraction(angleDeg: number): number {
  return Math.min(1, Math.abs(angleDeg) / 60);
}

// ------------------------------------------------------------------ 60:1
/** Track error (exact) from distance off after distance flown. */
export function trackErrorExact(offNm: number, flownNm: number): number {
  return Math.atan2(offNm, flownNm) / DEG;
}
/** 60:1 rule: 1 NM off after 60 NM = 1°. */
export function trackErrorRule(offNm: number, flownNm: number): number {
  return (60 * offNm) / flownNm;
}

// ------------------------------------------------------------------ gradients
export function ftPerNmFromAngle(angleDeg: number): number {
  return FT_PER_NM * Math.tan(angleDeg * DEG);
}
export function angleFromFtPerNm(ftPerNm: number): number {
  return Math.atan(ftPerNm / FT_PER_NM) / DEG;
}
export function pctFromFtPerNm(ftPerNm: number): number {
  return (ftPerNm / FT_PER_NM) * 100;
}
export function ftPerNmFromPct(pct: number): number {
  return (pct / 100) * FT_PER_NM;
}
/** vertical speed (ft/min) to hold a gradient (ft/NM) at a ground speed */
export function vsForGradient(gsKt: number, ftPerNm: number): number {
  return (gsKt * ftPerNm) / 60;
}

// ------------------------------------------------------------------ turns
/** Bank for a rate of turn (exact, coordinated): tan φ = ω V / g. */
export function bankForRate(tasKt: number, rateDegS = 3): number {
  return Math.atan((rateDegS * DEG * tasKt * MS_PER_KT) / G0) / DEG;
}
/** Standard-rate bank, rule of thumb: TAS / 10 + 7 (FAA IFH ch. 3). */
export function bankRule(tasKt: number): number {
  return tasKt / 10 + 7;
}
/** Turn radius (NM) at a bank angle: r = V² / (g tan φ). */
export function turnRadiusNm(tasKt: number, bankDeg: number): number {
  const v = tasKt * MS_PER_KT;
  return (v * v) / (G0 * Math.tan(bankDeg * DEG)) / M_PER_NM;
}
/** Turn radius (NM) at a rate of turn: r = V / ω (standard rate: V / 60π). */
export function turnRadiusAtRateNm(tasKt: number, rateDegS = 3): number {
  return tasKt / 3600 / (rateDegS * DEG);
}
/** Rate of turn (°/s) at a bank angle. */
export function rateAtBank(tasKt: number, bankDeg: number): number {
  return (G0 * Math.tan(bankDeg * DEG)) / (tasKt * MS_PER_KT) / DEG;
}

/** Lead (degrees of arc) to turn from a DME arc onto a radial inbound (exact): sin α = r / (D − r). */
export function arcToRadialLeadExact(arcNm: number, radiusNm: number): number {
  return Math.asin(Math.min(1, radiusNm / (arcNm - radiusNm))) / DEG;
}
/** Rule of thumb: lead° = 60 × lead NM / DME (the 60:1 rule on the arc). */
export function arcToRadialLeadRule(arcNm: number, radiusNm: number): number {
  return (60 * radiusNm) / arcNm;
}
/**
 * DME to start a 90° turn of radius r from a radial onto the arc of radius D (exact). The turn centre sits r abeam
 * the start point and D ∓ r from the station (inside the arc outbound, outside it inbound), so
 * d² + r² = (D ∓ r)²:  d = √(D² − 2Dr) outbound, √(D² + 2Dr) inbound.
 */
export function radialToArcStartExact(arcNm: number, radiusNm: number, inbound = false): number {
  return Math.sqrt(arcNm * arcNm + (inbound ? 2 : -2) * arcNm * radiusNm);
}
/** Lead distance along the track to roll out on a course after a turn of θ (exact): r tan(θ / 2). */
export function interceptLeadNm(
  radiusNm: number,
  interceptDeg: number,
): number {
  return radiusNm * Math.tan((interceptDeg * DEG) / 2);
}

// ------------------------------------------------------------------ ISA, altimetry, airspeed
/** ISA temperature (°C) at a pressure altitude. */
export function isaTempC(paFt: number): number {
  return 15 - ISA_LAPSE_K_PER_FT * paFt;
}
/** ISA rule of thumb: 2 °C per 1,000 ft. */
export function isaTempRule(paFt: number): number {
  return 15 - (2 * paFt) / 1000;
}
/** p / p0 at a pressure altitude (troposphere). */
export function pressureRatio(paFt: number): number {
  return Math.pow(1 - ISA_K * paFt, ISA_EXP);
}
/** pressure altitude (ft) of a static pressure (hPa) */
export function paFromPressure(hPa: number): number {
  return (1 - Math.pow(hPa / ISA_P0_HPA, 1 / ISA_EXP)) / ISA_K;
}
/** σ = ρ / ρ0 */
export function densityRatio(paFt: number, oatC: number): number {
  return (pressureRatio(paFt) * ISA_T0_K) / (oatC + 273.15);
}
/** Density altitude (exact): the ISA altitude with the same density. */
export function densityAltitudeExact(paFt: number, oatC: number): number {
  const sigma = densityRatio(paFt, oatC);
  return (1 - Math.pow(sigma, 1 / (ISA_EXP - 1))) / ISA_K;
}
/** Density altitude, rule of thumb: PA + 120 ft per °C above ISA (FAA PHAK ch. 4 / 11). */
export function densityAltitudeRule(paFt: number, oatC: number): number {
  return paFt + 120 * (oatC - isaTempRule(paFt));
}
/**
 * Pressure altitude (exact) of an aerodrome from its elevation and QNH (hPa): the station pressure reduced to
 * sea level in ISA is the QNH, so p_stn = QNH × (1 − K·elev)^5.256 and PA = alt(p_stn).
 */
export function pressureAltitudeExact(elevFt: number, qnhHpa: number): number {
  const pStn = qnhHpa * Math.pow(1 - ISA_K * elevFt, ISA_EXP);
  return paFromPressure(pStn);
}
/** FAA rule: PA = elevation + (29.92 − altimeter) × 1,000. */
export function pressureAltitudeRuleInHg(
  elevFt: number,
  altInHg: number,
): number {
  return elevFt + (29.92 - altInHg) * 1000;
}
/** hPa rule: PA = elevation + (1013 − QNH) × ftPerHpa (27 exact near sea level, 30 the round figure). */
export function pressureAltitudeRuleHpa(
  elevFt: number,
  qnhHpa: number,
  ftPerHpa = 27,
): number {
  return elevFt + (1013.25 - qnhHpa) * ftPerHpa;
}

/** TAS from CAS (exact, compressible, ISA pressure at PA with the actual OAT). */
export function tasFromCas(casKt: number, paFt: number, oatC: number): number {
  const p0 = ISA_P0_HPA;
  const p = p0 * pressureRatio(paFt);
  const qc = p0 * (Math.pow(1 + 0.2 * (casKt / A0_KT) ** 2, 3.5) - 1);
  const mach = Math.sqrt(5 * (Math.pow(qc / p + 1, 2 / 7) - 1));
  const a = A0_KT * Math.sqrt((oatC + 273.15) / ISA_T0_K);
  return mach * a;
}
/** TAS ≈ IAS + 2 % per 1,000 ft (FAA PHAK ch. 8). */
export function tasRule(iasKt: number, altFt: number): number {
  return iasKt * (1 + (0.02 * altFt) / 1000);
}

/**
 * Cold-temperature correction (ft) to add to a published height above the aerodrome (ICAO Doc 8168 Vol I Part III
 * 1.4; the table in FAA AIM 7-2-3 is computed from it):
 *   ΔH = H × (15 − t0) / (273 + t0 − ½ L0 (H + Hss)),  t0 = t_aerodrome + L0 × Hss,  L0 = 0.00198 °C/ft.
 */
export function coldTempCorrectionFt(
  heightAboveAdFt: number,
  adElevFt: number,
  adTempC: number,
): number {
  const L0 = 0.00198;
  const t0 = adTempC + L0 * adElevFt;
  return (
    (heightAboveAdFt * (15 - t0)) /
    (273 + t0 - 0.5 * L0 * (heightAboveAdFt + adElevFt))
  );
}
/** Rule of thumb: 4 % of the height above the station per 10 °C below ISA. */
export function coldTempRule(
  heightAboveAdFt: number,
  adElevFt: number,
  adTempC: number,
): number {
  const isaDev = adTempC - isaTempRule(adElevFt);
  return Math.max(0, heightAboveAdFt * 0.004 * -isaDev);
}

// ------------------------------------------------------------------ conversions used in texts
export const kmh = (kt: number) => kt * KMH_PER_KT;
