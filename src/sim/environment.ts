// ISA atmosphere and weather.
export const KT = 0.514444; // m/s per knot
export const FT = 0.3048; // m per foot
export const G = 9.80665;

export interface Weather {
  windDir: number; // deg true, direction FROM
  windKt: number;
  gustKt: number;
  turbulence: number; // 0..1
  qnh: number; // inHg, actual
  oatSeaLevelC: number; // ISA deviation via sea-level temperature
  ceilingFt: number; // cloud base AGL-ish (MSL simplification)
  cloudTopFt: number;
  visibilitySm: number;
}

export const defaultWeather = (): Weather => ({
  windDir: 250,
  windKt: 12,
  gustKt: 0,
  turbulence: 0.15,
  qnh: 29.92,
  oatSeaLevelC: 15,
  ceilingFt: 900,
  cloudTopFt: 7000,
  visibilitySm: 1,
});

/** Air density (kg/m^3) at pressure altitude (ft) with ISA deviation. */
export function density(altFt: number, oatSeaLevelC = 15): number {
  const h = Math.max(-1000, altFt) * FT;
  const T0 = 273.15 + oatSeaLevelC;
  const T = T0 - 0.0065 * h;
  const p = 101325 * Math.pow(1 - (0.0065 * h) / 288.15, 5.25588);
  return p / (287.05 * T);
}

export function oatC(altFt: number, oatSeaLevelC = 15): number {
  return oatSeaLevelC - 1.98 * (altFt / 1000);
}

/** Pressure altitude given true altitude and the actual QNH. */
export function pressureAltitude(trueAltFt: number, qnh: number): number {
  return trueAltFt - (qnh - 29.92) * 1000;
}

/** Simple deterministic-ish turbulence generator (sum of sines + noise filter). */
export class Turbulence {
  private t = 0;
  private gustState = 0;
  sample(dt: number, intensity: number): { vert: number; roll: number; pitch: number; gust: number } {
    this.t += dt;
    const t = this.t;
    this.gustState += (Math.random() - 0.5 - this.gustState * 0.5) * dt * 4;
    const k = intensity;
    return {
      vert: k * (Math.sin(t * 0.7) * 0.6 + Math.sin(t * 2.3 + 1) * 0.4 + this.gustState) * 2.5, // m/s
      roll: k * (Math.sin(t * 1.3 + 2) * 0.5 + Math.sin(t * 3.1) * 0.3 + this.gustState * 0.6) * 0.25, // rad/s
      pitch: k * (Math.sin(t * 1.1 + 4) * 0.5 + Math.sin(t * 2.7) * 0.2) * 0.08,
      gust: Math.max(0, Math.sin(t * 0.4) + this.gustState),
    };
  }
}
