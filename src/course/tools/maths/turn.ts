// Teaching tools — load factor in a turn and the V-n diagram (Part-FCL 081 04 "Stability / limitations", PPL 081;
// FAA PHAK ch. 5 "Load factors", AFH ch. 3 "Turns").
//   n = 1 / cos φ ; Vs(turn) = Vs · √n ; Vs ∝ √(weight) ; r = V² / (g tan φ) ; ω = g tan φ / V.
// Figures, training aeroplane (POH C172S):
//   • stall speeds at 2,550 lb, most rearward CG, flaps UP (§5 Fig. 5-3): 0° bank 48 KIAS / 53 KCAS,
//     30° 51 / 57, 45° 57 / 63, 60° 68 / 75;
//   • flight load factor limits, normal category, flaps up: +3.8 g / −1.52 g (§2 "Flight load factor limits");
//   • VA 105 KIAS at 2,550 lb, 98 at 2,200 lb, 90 at 1,900 lb; VNO 129 KIAS; VNE 163 KIAS (§2 "Airspeed limitations").
// The V-n diagram is drawn in calibrated airspeed (the POH stall figures in KCAS; above 100 kt IAS ≈ CAS within
// 2 kt, POH §5 "Airspeed calibration"). The negative stall line is illustrative (inverted CL max taken as 0.6 of
// the upright one): the POH gives no inverted figure.
import { G, M_PER_S_PER_KT } from "./aero";

export const VN = {
  refLb: 2550,
  vsKcas: 53,
  vsKias: 48,
  nPos: 3.8,
  nNeg: -1.52,
  vaKias: 105,
  vno: 129,
  vne: 163,
  invertedClRatio: 0.6,
};
const FT_PER_M = 1 / 0.3048;

export const loadFactor = (bankDeg: number): number =>
  1 / Math.cos((Math.min(89, Math.abs(bankDeg)) * Math.PI) / 180);
/** the 1 g stall speed at a weight (kt, same kind as the reference: CAS or IAS) */
export const vsAt = (weightLb: number, ref = VN.vsKcas): number =>
  ref * Math.sqrt(weightLb / VN.refLb);
/** the stall speed in a level turn at a bank angle and weight */
export const stallInTurn = (
  bankDeg: number,
  weightLb: number,
  ref = VN.vsKcas,
): number => vsAt(weightLb, ref) * Math.sqrt(loadFactor(bankDeg));
/** design manoeuvring speed at a weight (POH: VA falls with the square root of the weight), KIAS */
export const vaAt = (weightLb: number): number =>
  VN.vaKias * Math.sqrt(weightLb / VN.refLb);
/** the most load factor the wing can make at a speed before it stalls (positive side) */
export const nStall = (vKcas: number, weightLb: number): number =>
  (vKcas / vsAt(weightLb)) ** 2;
export const nStallNeg = (vKcas: number, weightLb: number): number =>
  -VN.invertedClRatio * nStall(vKcas, weightLb);
/** where the stall line meets the limit load factor (the corner of the V-n diagram) */
export const cornerKcas = (weightLb: number): number =>
  vsAt(weightLb) * Math.sqrt(VN.nPos);
/** level turn radius, ft, at a true airspeed (kt) */
export function turnRadiusFt(tasKt: number, bankDeg: number): number {
  const t = Math.tan((Math.abs(bankDeg) * Math.PI) / 180);
  if (t < 1e-6) return Infinity;
  return ((tasKt * M_PER_S_PER_KT) ** 2 / (G * t)) * FT_PER_M;
}
/** level turn rate, °/s */
export function turnRateDeg(tasKt: number, bankDeg: number): number {
  const v = tasKt * M_PER_S_PER_KT;
  if (v <= 0) return 0;
  return (
    ((G * Math.tan((Math.abs(bankDeg) * Math.PI) / 180)) / v) * (180 / Math.PI)
  );
}

export type TurnVerdict = "ok" | "stall" | "overload" | "overspeed";
export interface TurnState {
  n: number;
  vsTurnKcas: number;
  vsTurnKias: number;
  vaKias: number;
  radiusFt: number;
  rateDeg: number;
  verdict: TurnVerdict;
  /** the most load factor available at this speed (stall line or limit) */
  nAvail: number;
  /** above VA: a full, abrupt control input may overstress the airframe before the wing stalls */
  aboveVa: boolean;
}
export function turnState(
  bankDeg: number,
  vKcas: number,
  weightLb: number,
): TurnState {
  const n = loadFactor(bankDeg);
  const ns = nStall(vKcas, weightLb);
  const va = vaAt(weightLb);
  const verdict: TurnVerdict =
    vKcas > VN.vne
      ? "overspeed"
      : n > ns + 1e-9
        ? "stall"
        : n > VN.nPos + 1e-9
          ? "overload"
          : "ok";
  return {
    n,
    vsTurnKcas: stallInTurn(bankDeg, weightLb, VN.vsKcas),
    vsTurnKias: stallInTurn(bankDeg, weightLb, VN.vsKias),
    vaKias: va,
    radiusFt: turnRadiusFt(vKcas, bankDeg),
    rateDeg: turnRateDeg(vKcas, bankDeg),
    verdict,
    nAvail: Math.min(VN.nPos, ns),
    aboveVa: vKcas > va,
  };
}
