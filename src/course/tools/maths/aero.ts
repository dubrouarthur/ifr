// Teaching tools — the wing and its angle of attack (EASA Part-FCL 081 principles of flight; PPL 081 01/02).
// A pedagogical model of the training aeroplane's wing, calibrated on published figures, never a CFD result:
//   • wing: 174 sq ft, span 36 ft 1 in (POH C172S §1 "Dimensions"), maximum weight 2,550 lb (POH §2);
//   • CL max per flap setting from the POH stall speeds at 2,550 lb, most rearward CG (POH C172S §5, Fig. 5-3
//     "Stall speeds"): flaps UP 53 KCAS, flaps 10° 51 KCAS, flaps 30° 48 KCAS → CLmax = 2W / (ρ0 S V²);
//   • lift slope: thin-aerofoil 2π per radian corrected for the aspect ratio (Prandtl lifting line,
//     a = a0 / (1 + a0 / (π e AR)), Anderson, Fundamentals of Aerodynamics §5.3; FAA PHAK ch. 5 "Lift");
//   • NACA 2412 section (the type's aerofoil): zero-lift angle about −2° (Abbott & von Doenhoff, Theory of Wing
//     Sections, appendix IV). The flap zero-lift shifts (−4.5°, −8°) are a teaching assumption;
//   • drag polar CD = CD0 + CL² / (π e AR) (PHAK ch. 5 "Induced drag"); CD0 chosen so the best glide ratio is about
//     9:1 near 68 KIAS, the POH best glide speed (POH C172S §3 "Maximum glide", windmilling propeller included).
// Speeds are taken as equivalent airspeed (≈ IAS low and slow): lift = CL · ½ ρ0 V² S.

/** sea-level ISA air density, kg/m³ (ICAO Doc 7488) */
export const RHO0 = 1.225;
export const G = 9.80665;
export const M_PER_S_PER_KT = 0.514444;
export const N_PER_LB = 4.4482216;
const FT2_M2 = 0.09290304;

export type Flaps = 0 | 10 | 30;
export const WING = {
  areaFt2: 174,
  spanFt: 36 + 1 / 12,
  /** Oswald efficiency factor (typical straight wing, Anderson §6.1) */
  e: 0.75,
  /** zero-lift drag, windmilling propeller and idle power included (see the header) */
  cd0: 0.0544,
  maxLb: 2550,
  /** POH C172S Fig. 5-3, 2,550 lb, most rearward CG, wings level: KCAS */
  stallKcas: { 0: 53, 10: 51, 30: 48 } as Record<Flaps, number>,
  /** zero-lift angle of attack, deg: NACA 2412 clean; flap shifts are the teaching assumption */
  alpha0: { 0: -2, 10: -4.5, 30: -8 } as Record<Flaps, number>,
  /** extra zero-lift drag of the flaps (teaching assumption: steep approach with 30°) */
  cdFlaps: { 0: 0, 10: 0.008, 30: 0.045 } as Record<Flaps, number>,
  /** the lift curve rounds off over this many degrees before CL max */
  roundDeg: 2,
};
export const WING_AREA_M2 = WING.areaFt2 * FT2_M2;
export const ASPECT_RATIO = (WING.spanFt * WING.spanFt) / WING.areaFt2;
const A0 = 2 * Math.PI;
/** finite-wing lift slope, per degree (≈ 0.081) */
export const LIFT_SLOPE =
  (A0 / (1 + A0 / (Math.PI * WING.e * ASPECT_RATIO))) * (Math.PI / 180);
/** induced-drag factor k = 1 / (π e AR) */
export const K_INDUCED = 1 / (Math.PI * WING.e * ASPECT_RATIO);

const weightN = (lb: number) => lb * N_PER_LB;
/** dynamic pressure at an equivalent airspeed (kt), Pa */
export const qOf = (kt: number) => 0.5 * RHO0 * (kt * M_PER_S_PER_KT) ** 2;

/** CL max of the wing at a flap setting (from the POH stall speed at 2,550 lb) */
export function clMax(flaps: Flaps): number {
  return weightN(WING.maxLb) / WING_AREA_M2 / qOf(WING.stallKcas[flaps]);
}
/** the stall angle of attack, deg (the top of the lift curve) */
export function stallAlpha(flaps: Flaps): number {
  return clMax(flaps) / LIFT_SLOPE + WING.alpha0[flaps] + WING.roundDeg / 2;
}
/** lift coefficient at an angle of attack (deg): linear, rounded off over the last 2°, then the stall break */
export function cl(alphaDeg: number, flaps: Flaps): number {
  const a = LIFT_SLOPE;
  const max = clMax(flaps);
  const as = stallAlpha(flaps);
  const r = WING.roundDeg;
  if (alphaDeg <= as - r) return a * (alphaDeg - WING.alpha0[flaps]);
  if (alphaDeg <= as) return max - (a / (2 * r)) * (as - alphaDeg) ** 2;
  // past the critical angle: the flow separates from the upper surface and lift falls towards 70 % of CL max
  return max * (1 - 0.3 * (1 - Math.exp(-(alphaDeg - as) / 1.5)));
}
/** drag coefficient: parasite + induced, plus the separated wake past the stall (illustrative) */
export function cd(alphaDeg: number, flaps: Flaps): number {
  const c = cl(alphaDeg, flaps);
  const as = stallAlpha(flaps);
  const sep = alphaDeg > as ? 0.35 * (1 - Math.exp(-(alphaDeg - as) / 3)) : 0;
  return WING.cd0 + WING.cdFlaps[flaps] + K_INDUCED * c * c + sep;
}

export interface WingState {
  alpha: number;
  cl: number;
  cd: number;
  ld: number;
  /** lift ÷ weight at this speed and weight (> 1: the aeroplane climbs or turns; < 1: it sinks) */
  liftRatio: number;
  stalled: boolean;
  /** how close to the critical angle, 0..1 (1 = at it) */
  nearStall: number;
  clMax: number;
  stallAlpha: number;
  /** the 1 g stall speed at this weight and flap setting, kt (equivalent airspeed) */
  vs: number;
}
export function wingState(
  alphaDeg: number,
  iasKt: number,
  flaps: Flaps,
  weightLb = WING.maxLb,
): WingState {
  const c = cl(alphaDeg, flaps);
  const d = cd(alphaDeg, flaps);
  const as = stallAlpha(flaps);
  const max = clMax(flaps);
  const lift = c * qOf(iasKt) * WING_AREA_M2;
  const W = weightN(weightLb);
  const vs = Math.sqrt((2 * W) / (RHO0 * WING_AREA_M2 * max)) / M_PER_S_PER_KT;
  const a0 = WING.alpha0[flaps];
  return {
    alpha: alphaDeg,
    cl: c,
    cd: d,
    ld: d > 0 ? c / d : 0,
    liftRatio: lift / W,
    stalled: alphaDeg > as,
    nearStall: Math.max(0, Math.min(1, (alphaDeg - a0) / (as - a0))),
    clMax: max,
    stallAlpha: as,
    vs,
  };
}
/** the best glide (clean): the CL of the best lift / drag ratio, the ratio and the speed at a weight */
export function bestGlide(weightLb = WING.maxLb): {
  cl: number;
  ld: number;
  kt: number;
} {
  const c = Math.sqrt(WING.cd0 / K_INDUCED);
  const ld = 1 / (2 * Math.sqrt(WING.cd0 * K_INDUCED));
  const v =
    Math.sqrt((2 * weightN(weightLb)) / (RHO0 * WING_AREA_M2 * c)) /
    M_PER_S_PER_KT;
  return { cl: c, ld, kt: v };
}
/** the angle of attack that holds 1 g at a speed (level flight), deg; null when the wing cannot (below Vs) */
export function alphaForLevel(
  iasKt: number,
  flaps: Flaps,
  weightLb = WING.maxLb,
): number | null {
  const need = weightN(weightLb) / (qOf(iasKt) * WING_AREA_M2);
  if (need > clMax(flaps)) return null;
  return need / LIFT_SLOPE + WING.alpha0[flaps];
}
