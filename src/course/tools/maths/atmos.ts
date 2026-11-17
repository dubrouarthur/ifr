// Teaching tools — the standard atmosphere, Mach number and the swept wing, pressurisation (ATPL 081 high-speed
// flight, 021 pressurisation, 040 hypoxia).
//   • ICAO standard atmosphere (Doc 7488): T = 15 °C − 1.98 °C per 1,000 ft up to 36,089 ft, then −56.5 °C;
//     p = 1013.25 (1 − 6.8756·10⁻⁶ h)^5.2559 hPa in the troposphere, p = 226.32 e^(−(h − 36,089) / 20,806) above;
//   • speed of sound a = 38.967 √T(K) kt (661.5 kt at 15 °C); M = TAS / a (FAA Airplane Flying Handbook ch. 15
//     "Transition to jet-powered airplanes", ATPL 081 06);
//   • simple sweep theory: only the component of the flow normal to the leading edge counts, M⊥ = M cos Λ, so the
//     critical Mach number rises about as 1 / cos Λ (Anderson, Introduction to Flight §5.16). Simple sweep theory
//     overstates the gain (a real swept wing gains noticeably less, Anderson §5.16); the drawing says so. The straight
//     wing's critical Mach 0.70 is a teaching assumption;
//   • above the critical Mach the shocks are weak and the drag only starts to rise: airliners cruise there, below
//     the drag-divergence Mach number, which lies a little above the critical Mach (Anderson §5.10). MDD = MCRIT +
//     0.06 (in the Mach normal to the leading edge) is a teaching assumption;
//   • cabin altitude ≤ 8,000 ft at the maximum operating altitude in normal operation (EASA CS 25.841(a));
//   • time of useful consciousness after a rapid decompression, seated at rest (FAA AC 61-107B, table 1):
//     FL 250 3–5 min, FL 300 1–2 min, FL 350 30–60 s, FL 400 15–20 s.
export const HPA_PER_PSI = 68.9476;
export const TROPOPAUSE_FT = 36089;

export const isaTempC = (ft: number): number =>
  ft < TROPOPAUSE_FT ? 15 - (1.98 * ft) / 1000 : -56.5;
export function isaPressureHpa(ft: number): number {
  if (ft <= TROPOPAUSE_FT) return 1013.25 * (1 - 6.8756e-6 * ft) ** 5.2559;
  return 226.32 * Math.exp(-(ft - TROPOPAUSE_FT) / 20806);
}
/** the pressure altitude of a pressure (inverse of isaPressureHpa), ft */
export function altitudeOfPressure(hpa: number): number {
  if (hpa >= 226.32) return (1 - (hpa / 1013.25) ** (1 / 5.2559)) / 6.8756e-6;
  return TROPOPAUSE_FT - 20806 * Math.log(hpa / 226.32);
}
export const speedOfSoundKt = (tempC: number): number =>
  38.967 * Math.sqrt(tempC + 273.15);

// ------------------------------------------------------------------ Mach and sweep
export const MCRIT_STRAIGHT = 0.7;
/** the drag-divergence margin above the critical Mach (teaching assumption, see the header) */
export const MDD_MARGIN = 0.06;
export interface MachState {
  tempC: number;
  aKt: number;
  mach: number;
  /** the Mach number of the flow normal to the leading edge */
  machNormal: number;
  /** the critical Mach number of the swept wing */
  mcrit: number;
  /** subsonic: under MCRIT; transonic: weak shocks, drag starts to rise (normal in cruise); divergence: past MDD,
   *  drag rises steeply, buffet; supersonic: the flow square to the wing is supersonic */
  verdict: "subsonic" | "transonic" | "divergence" | "supersonic";
}
export function machState(
  ft: number,
  tasKt: number,
  sweepDeg: number,
): MachState {
  const tempC = isaTempC(ft);
  const aKt = speedOfSoundKt(tempC);
  const mach = tasKt / aKt;
  const c = Math.cos((sweepDeg * Math.PI) / 180);
  const machNormal = mach * c;
  const mcrit = MCRIT_STRAIGHT / c;
  return {
    tempC,
    aKt,
    mach,
    machNormal,
    mcrit,
    verdict:
      machNormal >= 1
        ? "supersonic"
        : machNormal > MCRIT_STRAIGHT + MDD_MARGIN
          ? "divergence"
          : machNormal > MCRIT_STRAIGHT
            ? "transonic"
            : "subsonic",
  };
}

// ------------------------------------------------------------------ pressurisation
export const CABIN_MAX_FT = 8000;
export interface CabinState {
  outsideHpa: number;
  /** the cabin altitude the controller holds, ft (the target, or higher when the differential is at its limit) */
  cabinFt: number;
  cabinHpa: number;
  /** cabin − outside, psi */
  diffPsi: number;
  /** the differential needed to keep the target cabin altitude */
  neededPsi: number;
  limited: boolean;
  /** time of useful consciousness at the aeroplane's altitude after a decompression (AC 61-107B), s [min, max] */
  tuc: [number, number] | null;
}
const TUC: [number, [number, number]][] = [
  [25000, [180, 300]],
  [30000, [60, 120]],
  [35000, [30, 60]],
  [40000, [15, 20]],
];
export function tucAt(ft: number): [number, number] | null {
  let out: [number, number] | null = null;
  for (const [alt, v] of TUC) if (ft >= alt) out = v;
  return out;
}
export function cabin(
  ft: number,
  targetCabinFt: number,
  maxDiffPsi: number,
): CabinState {
  const outsideHpa = isaPressureHpa(ft);
  const target = Math.min(targetCabinFt, ft);
  const wantHpa = isaPressureHpa(target);
  const neededPsi = (wantHpa - outsideHpa) / HPA_PER_PSI;
  const limited = neededPsi > maxDiffPsi;
  const cabinHpa = limited ? outsideHpa + maxDiffPsi * HPA_PER_PSI : wantHpa;
  return {
    outsideHpa,
    cabinFt: limited ? altitudeOfPressure(cabinHpa) : target,
    cabinHpa,
    diffPsi: (cabinHpa - outsideHpa) / HPA_PER_PSI,
    neededPsi,
    limited,
    tuc: tucAt(ft),
  };
}
