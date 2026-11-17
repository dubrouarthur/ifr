// Teaching tools — meteorology and the engine (Part-FCL 050 meteorology, 021 powerplant; PPL 050 / 021).
// Carburettor icing:
//   • relative humidity from the temperature and the dew point (Magnus formula, Alduchov & Eskridge 1996:
//     e = 6.1094 exp(17.625 T / (T + 243.04)) hPa);
//   • FAA PHAK ch. 7 "Carburetor icing": "if the temperature is between −7 °C (20 °F) and 21 °C (70 °F) with visible
//     moisture or high humidity, the pilot should be constantly on the alert for carburetor ice"; "carburetor ice
//     could occur on a warm day at temperatures as high as 38 °C (100 °F) and humidity as low as 50 percent".
//     High humidity is taken as RH ≥ 80 %;
//   • the power: UK CAA Safety Sense Leaflet 14 "Piston engine icing" (its icing chart): in the humid band the risk
//     is serious at any power, in the warmer, drier band it is serious with descent power (throttle closed) and
//     lighter at cruise power. The tool keeps the PHAK thresholds above for the two bands and takes only that
//     power split from SS14, so it never claims a finer threshold than its sources.
// Fronts (cross-section): orders of magnitude from the Met Office "Fronts" fact sheet and FAA Aviation Weather
// Handbook (FAA-H-8083-28) ch. 11: a warm front slopes about 1:150 and its cloud shield reaches 1,000 km ahead
// (Ci, then Cs, As, then Ns and the rain belt within about 300 km); a cold front is steeper (about 1:80), with
// Cb and showers in a narrow band at the front, clearing and showers behind. The bands below are those orders of
// magnitude, for teaching the sequence, not a forecast.

export const satVapourHpa = (tC: number): number =>
  6.1094 * Math.exp((17.625 * tC) / (tC + 243.04));
export const relativeHumidity = (tC: number, dewC: number): number =>
  Math.min(100, (100 * satVapourHpa(Math.min(dewC, tC))) / satVapourHpa(tC));

export type CarbRisk = "serious" | "reducedPower" | "low";
export const CARB = {
  seriousLoC: -7,
  seriousHiC: 21,
  seriousRh: 80,
  warmHiC: 38,
  warmRh: 50,
};
export function carbIceRisk(
  tC: number,
  dewC: number,
): { rh: number; risk: CarbRisk } {
  const rh = relativeHumidity(tC, dewC);
  const risk: CarbRisk =
    tC >= CARB.seriousLoC && tC <= CARB.seriousHiC && rh >= CARB.seriousRh
      ? "serious"
      : tC <= CARB.warmHiC && tC >= CARB.seriousLoC && rh >= CARB.warmRh
        ? "reducedPower"
        : "low";
  return { rh, risk };
}
/** the dew point at a temperature and relative humidity (inverse Magnus), °C */
export function dewPointAt(tC: number, rh: number): number {
  const g = Math.log(Math.max(1e-6, rh) / 100) + (17.625 * tC) / (243.04 + tC);
  return (243.04 * g) / (17.625 - g);
}

// ------------------------------------------------------------------ fronts
export type FrontKind = "warm" | "cold";
export type CloudKey = "Ci" | "Cs" | "As" | "Ns" | "St" | "Sc" | "Cb" | "Cu";
export const FRONT_SLOPE: Record<FrontKind, number> = {
  warm: 1 / 150,
  cold: 1 / 80,
};
/** what an observer sees overhead at x km from the surface front (x > 0: the front has not reached them yet) */
export interface Sky {
  clouds: CloudKey[];
  precip: "none" | "rain" | "heavyShowers" | "showers" | "drizzle";
  /** relative to the start of the sequence */
  temp: "steady" | "rising" | "falling";
  pressure: "falling" | "steady" | "rising";
  /** the wind veers (turns clockwise, northern hemisphere) at the front's passage */
  veer: boolean;
}
export function frontSky(kind: FrontKind, xKm: number): Sky {
  if (kind === "warm") {
    if (xKm > 1000)
      return {
        clouds: [],
        precip: "none",
        temp: "steady",
        pressure: "steady",
        veer: false,
      };
    if (xKm > 600)
      return {
        clouds: ["Ci"],
        precip: "none",
        temp: "steady",
        pressure: "falling",
        veer: false,
      };
    if (xKm > 300)
      return {
        clouds: ["Cs"],
        precip: "none",
        temp: "steady",
        pressure: "falling",
        veer: false,
      };
    if (xKm > 150)
      return {
        clouds: ["As"],
        precip: "rain",
        temp: "steady",
        pressure: "falling",
        veer: false,
      };
    if (xKm > 0)
      return {
        clouds: ["Ns"],
        precip: "rain",
        temp: "steady",
        pressure: "falling",
        veer: false,
      };
    return {
      clouds: ["St", "Sc"],
      precip: "drizzle",
      temp: "rising",
      pressure: "steady",
      veer: true,
    };
  }
  if (xKm > 150)
    return {
      clouds: ["St", "Sc"],
      precip: "drizzle",
      temp: "steady",
      pressure: "falling",
      veer: false,
    };
  if (xKm > 0)
    return {
      clouds: ["Cb"],
      precip: "heavyShowers",
      temp: "steady",
      pressure: "falling",
      veer: false,
    };
  if (xKm > -60)
    return {
      clouds: ["Cb"],
      precip: "heavyShowers",
      temp: "falling",
      pressure: "rising",
      veer: true,
    };
  return {
    clouds: ["Cu"],
    precip: "showers",
    temp: "falling",
    pressure: "rising",
    veer: true,
  };
}
/** the height of the frontal surface above a point x km ahead of the surface front (warm) or behind it (cold), ft */
export function frontHeightFt(kind: FrontKind, xKm: number): number {
  const d = kind === "warm" ? xKm : -xKm;
  return d <= 0 ? 0 : (d * 1000 * FRONT_SLOPE[kind]) / 0.3048;
}
