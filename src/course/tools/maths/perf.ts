// Teaching tools — take-off / landing distance, density altitude, fuel and endurance (Part-FCL 032 performance,
// 033 flight planning; PPL 032 / 033).
//   • pressure altitude PA = elevation + (1013.25 − QNH) × 27 ft (1 hPa ≈ 27 ft near the ground: ICAO standard
//     atmosphere, the calc engine's own rule, calc/ifr/altimetry.ts); ISA = 15 °C − 2 °C per 1,000 ft;
//     density altitude DA ≈ PA + 120 ft per °C above ISA (FAA PHAK ch. 4 "Density altitude", the calc engine rule);
//   • the factors on the distance from the flight manual (UK CAA Safety Sense Leaflet 7 "Aeroplane performance",
//     table of factors): take-off +10 % per 1,000 ft of aerodrome altitude and +10 % per 10 °C of temperature rise,
//     landing +5 % and +5 %; dry grass ×1.20 / ×1.15, wet grass ×1.30 / ×1.35; adverse slope +5 % per 1 % (uphill on
//     take-off, downhill on landing); recommended safety factor ×1.33 take-off, ×1.43 landing. The wind factor is
//     the POH note (C172S §5: −10 % per 9 kt of headwind, +10 % per 2 kt of tailwind), as calc/vfr/performance.ts.
//     Temperature: measured from ISA at the aerodrome's pressure altitude, no credit when colder (conservative).
//   • VFR fuel reserve (EU Air Ops Part-NCO.OP.125, aeroplanes): 30 min at normal cruise by day, 45 min by night;
//     the C172S holds 53 US gal usable = 201 L (POH §1 "Fuel").
import {
  solveFactors,
  type FactorMode,
  type Surface,
} from "../../calc/vfr/performance";

export const FT_PER_HPA = 27;
export const pressureAltitude = (elevFt: number, qnh: number): number =>
  elevFt + (1013.25 - qnh) * FT_PER_HPA;
export const isaAt = (paFt: number): number => 15 - (2 * paFt) / 1000;
export const densityAltitude = (paFt: number, oatC: number): number =>
  paFt + 120 * (oatC - isaAt(paFt));

export const SS7 = {
  altPer1000: { takeoff: 0.1, landing: 0.05 } as Record<FactorMode, number>,
  tempPer10C: { takeoff: 0.1, landing: 0.05 } as Record<FactorMode, number>,
  safety: { takeoff: 1.33, landing: 1.43 } as Record<FactorMode, number>,
};
export const SURFACES: readonly Surface[] = ["paved", "dryGrass", "wetGrass"];

export interface RunwayInput {
  mode: FactorMode;
  elevFt: number;
  qnh: number;
  oatC: number;
  /** + headwind, − tailwind, kt */
  windKt: number;
  /** + uphill in the direction of take-off / landing, % */
  slopePct: number;
  surface: Surface;
  /** the flight manual's distance at sea level, ISA, no wind, paved, at the aeroplane's mass (m) */
  baseM: number;
  /** the runway length available (m) */
  runwayM: number;
}
export interface RunwayState {
  pa: number;
  da: number;
  isaDev: number;
  altFactor: number;
  tempFactor: number;
  windFactor: number;
  surfaceFactor: number;
  slopeFactor: number;
  /** every factor multiplied */
  total: number;
  /** the factored distance (m) */
  distanceM: number;
  /** × the safety factor */
  withSafetyM: number;
  /** what is left of the runway (m, negative: too short) */
  marginM: number;
  verdict: "ok" | "tight" | "short";
}
export function runwayPerf(i: RunwayInput): RunwayState {
  const pa = pressureAltitude(i.elevFt, i.qnh);
  const isaDev = i.oatC - isaAt(pa);
  const altFactor = 1 + (SS7.altPer1000[i.mode] * Math.max(0, pa)) / 1000;
  const tempFactor = 1 + (SS7.tempPer10C[i.mode] * Math.max(0, isaDev)) / 10;
  // the adverse slope only: uphill on take-off, downhill on landing
  const adverse =
    i.mode === "takeoff" ? Math.max(0, i.slopePct) : Math.max(0, -i.slopePct);
  const f = solveFactors({
    mode: i.mode,
    baseFt: 1,
    headKt: i.windKt,
    surface: i.surface,
    slopePct: adverse,
  });
  const total = altFactor * tempFactor * f.total;
  const distanceM = i.baseM * total;
  const withSafetyM = distanceM * SS7.safety[i.mode];
  const marginM = i.runwayM - withSafetyM;
  return {
    pa,
    da: densityAltitude(pa, i.oatC),
    isaDev,
    altFactor,
    tempFactor,
    windFactor: f.windFactor,
    surfaceFactor: f.surfaceFactor,
    slopeFactor: f.slopeFactor,
    total,
    distanceM,
    withSafetyM,
    marginM,
    verdict: distanceM > i.runwayM ? "short" : marginM < 0 ? "tight" : "ok",
  };
}

// ------------------------------------------------------------------ fuel
export const L_PER_USGAL = 3.785411784;
export const USABLE_L = 53 * L_PER_USGAL;
export const RESERVE_MIN = { day: 30, night: 45 };
export interface FuelInput {
  /** usable fuel on board at engine start, L */
  fuelL: number;
  /** fuel flow, L/h */
  flowLph: number;
  /** flight time to destination, min */
  tripMin: number;
  /** start-up and taxi, L */
  taxiL: number;
  night: boolean;
}
export interface FuelState {
  enduranceMin: number;
  tripL: number;
  reserveL: number;
  requiredL: number;
  /** extra fuel beyond the required (negative: missing) */
  extraL: number;
  /** fuel left on landing at destination, L */
  onLandingL: number;
  /** minutes of flight left on landing */
  onLandingMin: number;
  reserveMin: number;
  verdict: "ok" | "reserve" | "short";
}
export function fuelPlan(i: FuelInput): FuelState {
  const flow = Math.max(1, i.flowLph);
  const reserveMin = i.night ? RESERVE_MIN.night : RESERVE_MIN.day;
  const tripL = (flow * i.tripMin) / 60;
  const reserveL = (flow * reserveMin) / 60;
  const requiredL = i.taxiL + tripL + reserveL;
  const onLandingL = i.fuelL - i.taxiL - tripL;
  return {
    enduranceMin: (Math.max(0, i.fuelL - i.taxiL) / flow) * 60,
    tripL,
    reserveL,
    requiredL,
    extraL: i.fuelL - requiredL,
    onLandingL,
    onLandingMin: (onLandingL / flow) * 60,
    reserveMin,
    verdict:
      onLandingL < 0
        ? "short"
        : onLandingL < reserveL - 1e-9
          ? "reserve"
          : "ok",
  };
}
