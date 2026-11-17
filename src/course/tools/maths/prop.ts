// Teaching tools — the propeller: fixed pitch and constant speed (Part-FCL 021 powerplant "Propellers", PPL 021;
// FAA PHAK ch. 7 "Propeller", ch. 7 "Constant-speed propeller").
// Blade element at 75 % of the radius (the reference station of a blade angle):
//   • the blade section sees the relative wind of the rotation (0.75 π n D) and of the airspeed V;
//   • helix angle φ = atan(V / (0.75 π n D)); the section's angle of attack α = β − φ, β the blade angle;
//   • a fixed-pitch propeller keeps β: at low airspeed α is large (the blade near its stall, poor take-off thrust),
//     at high airspeed α falls (the engine over-speeds in a dive). A constant-speed propeller turns the blades so the
//     section keeps a small angle of attack at the RPM the pilot selects (PHAK: "the governor").
// Model figures (teaching assumptions, stated on the tool): diameter 1.9 m, fixed blade angle 21.5° (α ≈ 4° at
// 110 kt and 2,400 RPM: a cruise propeller), the constant-speed section held at α = 4°, blade stall above 15°,
// sea-level speed of sound 340.3 m/s (ICAO Doc 7488).
import { M_PER_S_PER_KT } from "./aero";

export const PROP = {
  diameterM: 1.9,
  fixedBeta: 21.5,
  targetAlpha: 4,
  stallAlpha: 15,
  a0: 340.3,
  betaMin: 10,
  betaMax: 40,
};
export interface PropState {
  /** helix angle, deg */
  phi: number;
  beta: number;
  alpha: number;
  /** blade section speed at 75 % radius, m/s (rotation only) */
  rotMs: number;
  /** the tip's Mach number (rotation + airspeed) */
  tipMach: number;
  state: "stalled" | "working" | "windmill";
}
export function propState(
  tasKt: number,
  rpm: number,
  variable: boolean,
): PropState {
  const v = Math.max(0, tasKt) * M_PER_S_PER_KT;
  const n = Math.max(1, rpm) / 60;
  const rot = 0.75 * Math.PI * n * PROP.diameterM;
  const phi = (Math.atan2(v, rot) * 180) / Math.PI;
  const beta = variable
    ? Math.max(PROP.betaMin, Math.min(PROP.betaMax, phi + PROP.targetAlpha))
    : PROP.fixedBeta;
  const alpha = beta - phi;
  const tip = Math.hypot(Math.PI * n * PROP.diameterM, v);
  return {
    phi,
    beta,
    alpha,
    rotMs: rot,
    tipMach: tip / PROP.a0,
    state:
      alpha > PROP.stallAlpha ? "stalled" : alpha < 0 ? "windmill" : "working",
  };
}
