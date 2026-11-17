// The engines of the course's 3D models (course/engines): the numbers behind the picture. Pure and unit-tested
// (tests/engines.test.ts): the four-stroke cycle of a flat-four (piston travel per crank angle, firing order,
// valve timing, spark), and small parameter models that drive the gauges — a carburetted flat-four on a
// fixed-pitch propeller, a constant-speed propeller and its governor, a free-turbine turboprop, a two-spool
// turbofan. These are teaching models: their shape follows the handbooks (what rises, what stays, what limits)
// and their end points are the published figures cited beside each constant; between them they are smooth
// curves, not a manufacturer's performance data. Entraînement procédural, non certifié FSTD.
//
// Sources:
//  - FAA PHAK (FAA-H-8083-25C) ch. 7 « Aircraft Systems »: the four-stroke cycle, carburettor and carburettor
//    heat (« a decrease in engine output, sometimes up to 15 percent »), mixture (best power rich of peak EGT),
//    fixed-pitch and constant-speed propellers (governor, flyweights, speeder spring, pilot valve), turbine
//    engines (turbojet, turboprop, turbofan; N1 / N2, EGT, ITT, torque).
//  - FAA AFH (FAA-H-8083-3C) ch. 14 « Transition to turbopropeller-powered airplanes » (free turbine, Ng / Np,
//    beta range) and ch. 15 « Transition to jet-powered airplanes » (N1 / N2, spool-up, reversers).
//  - Cessna C172S POH: Lycoming IO-360-L2A, 180 BHP at 2,700 rpm (sect. 1), max 2,700 rpm (sect. 2).
//  - Lycoming O-360 type certificate data sheet E-286: bore 5.125 in, stroke 4.375 in, 361 cu in; firing order
//    1-3-2-4 (Lycoming four-cylinder engines).
//  - EASA Part-FCL ATPL learning objectives 021 « Airframe, systems and powerplant » (021.11 piston engines,
//    021.12 turbine engines, 021.11.03 propellers): the stations, the spools, by-pass ratio, thrust reversers.
//  - Turboprop end points: PT6A-114A class as fitted to a single-engine utility turboprop (POH sect. 2):
//    675 SHP, Ng 101.6 % max, ground idle 52 % Ng, Np 1,900 rpm, ITT 805 °C max, torque 1,865 ft·lb max.
//  - Turbofan end points: CFM56-7B class (EASA TCDS E.004): by-pass ratio 5.1 to 5.5, take-off thrust
//    19,500 to 27,300 lbf by rating, EGT red line 950 °C, N1 red line 104 %.
import type { EngineKind, EngineSettings } from "../types";

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const clamp01 = (x: number) => clamp(x, 0, 1);
const mod = (a: number, n: number) => ((a % n) + n) % n;

// ------------------------------------------------------------------ the four-stroke cycle (flat four)
/** Lycoming O-360 class geometry (TCDS E-286) and the timing shown. */
export const FLAT_FOUR = {
  ratedHp: 180, // C172S POH sect. 1: 180 BHP at 2,700 rpm
  ratedRpm: 2700, // C172S POH sect. 2: max 2,700 rpm (red line)
  boreIn: 5.125, // TCDS E-286
  strokeIn: 4.375, // TCDS E-286
  /** connecting rod / crank radius: about 3.5 in light aircraft engines (shown, not a TCDS figure) */
  rodRatio: 3.5,
  /** the order the cylinders fire (Lycoming four-cylinder engines) */
  firingOrder: [1, 3, 2, 4] as const,
  /** spark before top dead centre, ° of crank (the engine's TCDS gives its own: 20 to 25° is usual) */
  sparkBTDC: 25,
  /**
   * Valve timing, ° of crank: intake opens before TDC, closes after BDC; exhaust opens before BDC, closes after
   * TDC (the overlap at TDC). Typical values for a slow-turning aircraft engine, shown to teach the idea (PHAK
   * ch. 7 describes the strokes; the exact timing is in the engine's overhaul manual).
   */
  valves: { ioBTDC: 20, icABDC: 60, eoBBDC: 60, ecATDC: 20 },
} as const;

/** Displacement, cu in (4 cylinders): 361 for the O-360 class. */
export const displacementCuIn = (): number =>
  (Math.PI / 4) * FLAT_FOUR.boreIn ** 2 * FLAT_FOUR.strokeIn * 4;

export type Stroke = "intake" | "compression" | "power" | "exhaust";
export const STROKES: readonly Stroke[] = [
  "intake",
  "compression",
  "power",
  "exhaust",
];

/** The stroke at cycle angle φ (0 = TDC at the start of intake, 720 = the next one). */
export function strokeAt(phi: number): Stroke {
  return STROKES[Math.floor(mod(phi, 720) / 180)];
}

/**
 * Piston travel from top dead centre at crank angle φ, as a fraction of the stroke: 0 at TDC, 1 at BDC (the
 * slider-crank: x = r(1 − cos φ) + l − √(l² − r² sin² φ), over 2r).
 */
export function pistonTravel(
  phi: number,
  rodRatio: number = FLAT_FOUR.rodRatio,
): number {
  const a = (mod(phi, 360) * Math.PI) / 180;
  const r = 1;
  const l = rodRatio;
  const x =
    r * (1 - Math.cos(a)) + l - Math.sqrt(l * l - r * r * Math.sin(a) ** 2);
  return x / (2 * r);
}

/**
 * Cycle offset of each cylinder, ° of crank: cylinder c is at cycle angle (θ − offset) when cylinder 1 is at
 * θ. The firing order 1-3-2-4 puts the four power strokes 180° apart: 1 fires at 360°, 3 at 540°, 2 at 720°,
 * 4 at 900°.
 */
export function cylinderOffsets(
  order: readonly number[] = FLAT_FOUR.firingOrder,
): Record<number, number> {
  const out: Record<number, number> = {};
  order.forEach((c, i) => (out[c] = i * 180));
  return out;
}
/** Cycle angle of cylinder `cyl` (1..4) when the crank (cylinder 1's cycle) is at θ. */
export function cylinderPhase(theta: number, cyl: number): number {
  return mod(theta - (cylinderOffsets()[cyl] ?? 0), 720);
}
/** The cylinders in the order they fire, from crank angle 0 over one cycle (720°): 1-3-2-4. */
export function firingSequence(): number[] {
  const fires: { c: number; at: number }[] = [];
  for (const c of [1, 2, 3, 4]) {
    // the power stroke starts at cycle angle 360: crank θ = 360 + offset (360 … 900 over one cycle)
    fires.push({ c, at: 360 + (cylinderOffsets()[c] ?? 0) });
  }
  return fires.sort((a, b) => a.at - b.at).map((f) => f.c);
}

/** Valve state at cycle angle φ: open or not, and lift 0..1 (a smooth bump between opening and closing). */
export function valves(phi: number): {
  intake: number;
  exhaust: number;
  overlap: boolean;
} {
  const v = FLAT_FOUR.valves;
  const p = mod(phi, 720);
  // intake: opens at 720 − io (before the cycle's TDC), closes at 180 + ic
  const iOpen = 720 - v.ioBTDC;
  const iClose = 180 + v.icABDC;
  const iSpan = 720 - iOpen + iClose;
  const iPos = mod(p - iOpen, 720);
  const intake = iPos < iSpan ? Math.sin((Math.PI * iPos) / iSpan) : 0;
  // exhaust: opens at 540 − eo, closes at 720 + ec (into the next cycle)
  const eOpen = 540 - v.eoBBDC;
  const eClose = 720 + v.ecATDC;
  const eSpan = eClose - eOpen;
  const ePos = mod(p - eOpen, 720);
  const exhaust = ePos < eSpan ? Math.sin((Math.PI * ePos) / eSpan) : 0;
  return { intake, exhaust, overlap: intake > 0 && exhaust > 0 };
}

/** The spark: fires `sparkBTDC` before the TDC that ends compression (cycle angle 360 − 25 = 335). */
export const SPARK_PHI = 360 - FLAT_FOUR.sparkBTDC;
/** How bright the flame is at cycle angle φ (0..1): lit from the spark, fading through the power stroke. */
export function flame(phi: number): number {
  const p = mod(phi, 720);
  if (p < SPARK_PHI || p > 520) return 0;
  if (p < 370) return (p - SPARK_PHI) / (370 - SPARK_PHI);
  return 1 - (p - 370) / 150;
}

// ------------------------------------------------------------------ atmosphere
/** Static pressure, inHg, at pressure altitude (ISA). */
export const ambientInHg = (altFt = 0): number =>
  29.92 * Math.pow(1 - 6.8756e-6 * Math.max(0, altFt), 5.2559);

// ------------------------------------------------------------------ carburetted flat-four, fixed-pitch propeller
export interface PistonIn {
  throttle: number;
  /** 1 full rich … 0 idle cut-off */
  mixture: number;
  carbHeat: boolean;
  altFt?: number;
  /** airspeed (0 on the ground, at run-up) */
  iasKt?: number;
}
export interface PistonOut {
  rpm: number;
  mapInHg: number;
  /** % of the rated 180 hp */
  powerPct: number;
  fuelGph: number;
  /** exhaust gas temperature, °F (relative scale: peak about 1,450) */
  egtF: number;
  running: boolean;
}
/** MAP at idle, inHg (closed throttle: the engine draws a strong vacuum) */
const IDLE_MAP = 10.5;
/** the power the engine spends on itself (friction, pumping), as an equivalent MAP: what idle overcomes */
const FRICTION_MAP = 9.2;
/** MAP at idle, then at full throttle at sea level (the reference: best power there gives the rated rpm at 100 kt) */
const FULL_MAP = IDLE_MAP + (29.92 - 0.8 - IDLE_MAP);

/** MAP for a throttle position: from idle vacuum to ambient minus the intake loss. */
export function manifoldPressure(throttle: number, altFt = 0): number {
  const amb = ambientInHg(altFt);
  return IDLE_MAP + clamp01(throttle) * (amb - 0.8 - IDLE_MAP);
}
/**
 * Power factor of the mixture (1 at best power). Best power is rich of peak EGT (PHAK ch. 7); full rich gives a
 * little less; leaner than peak the power falls; at idle cut-off the engine stops.
 */
export function mixturePower(m: number): number {
  const x = clamp01(m);
  if (x <= 0.12) return 0;
  return x >= 0.75
    ? 1 - 0.8 * (x - 0.75) ** 2
    : Math.max(0, 1 - 2.4 * (0.75 - x) ** 2);
}
/** EGT, °F: peaks a little lean of best power (mixture 0.6). */
export function egtOf(m: number, powerPct: number): number {
  const x = clamp01(m);
  if (x <= 0.12 || powerPct <= 0) return 300;
  const peak = 1 - ((x - 0.6) / 0.5) ** 2;
  return Math.round(
    1050 + 400 * clamp01(peak) * (0.55 + 0.45 * clamp01(powerPct / 100)),
  );
}
/** Carburettor heat: warmer, less dense air (PHAK ch. 7: up to 15 % less power; at run-up a drop of about 100 rpm). */
export const CARB_HEAT_FACTOR = 0.95;

/**
 * The fixed-pitch case: the propeller absorbs power as rpm³ (more as the airspeed falls: at run-up it holds the
 * engine near 2,300 rpm at full throttle, in cruise it lets it reach 2,700).
 */
export function pistonOutputs(i: PistonIn): PistonOut {
  const map = manifoldPressure(i.throttle, i.altFt ?? 0);
  const mf = mixturePower(i.mixture);
  const cf = i.carbHeat ? CARB_HEAT_FACTOR : 1;
  // absorption of the fixed-pitch propeller: 1.25 static, 1.0 at 100 kt
  const k = 1.25 - 0.25 * clamp((i.iasKt ?? 0) / 100, 0, 1.4);
  const avail = (map * mf * cf - FRICTION_MAP) / (FULL_MAP - FRICTION_MAP);
  if (avail <= 0)
    return {
      rpm: 0,
      mapInHg: round1(ambientInHg(i.altFt ?? 0)),
      powerPct: 0,
      fuelGph: 0,
      egtF: 300,
      running: false,
    };
  const n = Math.sqrt(avail / k);
  const rpm = FLAT_FOUR.ratedRpm * n;
  const powerPct = 100 * k * n ** 3;
  // brake specific fuel consumption, lb/hp/h: about 0.42 lean, 0.55 full rich (avgas 6 lb/US gal)
  const bsfc = 0.42 + 0.13 * clamp01((clamp01(i.mixture) - 0.6) / 0.4);
  const fuelGph = ((powerPct / 100) * FLAT_FOUR.ratedHp * bsfc) / 6 + 0.6;
  return {
    rpm: Math.round(rpm),
    mapInHg: round1(map),
    powerPct: Math.round(powerPct),
    fuelGph: round1(fuelGph),
    egtF: egtOf(i.mixture, powerPct),
    running: true,
  };
}
const round1 = (x: number) => Math.round(x * 10) / 10;

// ------------------------------------------------------------------ constant-speed propeller and its governor
/** The propeller's range: blade angle at 3/4 radius between the fine (low pitch) and the coarse (high pitch) stop. */
export const CS_PROP = {
  fineDeg: 14,
  coarseDeg: 32,
  /** the governor's range set by the propeller lever, rpm (a 180 to 200 hp flat-four: 2,100 to 2,700) */
  minRpm: 2100,
  maxRpm: 2700,
  ratedHp: 200,
} as const;
/** rpm the lever asks for */
export const rpmSetOf = (lever: number): number =>
  Math.round(
    CS_PROP.minRpm + clamp01(lever) * (CS_PROP.maxRpm - CS_PROP.minRpm),
  );
/** blade angle where the blade gives no thrust: grows with the airspeed (the relative wind comes more from ahead) */
const zeroLiftDeg = (tasKt: number) => 2 + 0.06 * clamp(tasKt, 0, 200);
/** how hard the blades are to turn at angle β (1 = absorbs the rated power at 2,700 rpm) */
export function absorption(bladeDeg: number, tasKt: number): number {
  return Math.pow(Math.max(0, bladeDeg - zeroLiftDeg(tasKt)) / 17, 1.5);
}
const bladeFor = (abs: number, tasKt: number) =>
  zeroLiftDeg(tasKt) + 17 * Math.pow(Math.max(0, abs), 2 / 3);
/** power available, fraction of rated, at a MAP and rpm fraction n */
const availCoef = (mapInHg: number) => Math.max(0, (mapInHg - 9) / 20);

export type GovRegime = "governing" | "fineStop" | "coarseStop";
export interface CsPropOut {
  rpm: number;
  bladeDeg: number;
  regime: GovRegime;
}
/**
 * The steady state: the governor turns the blades until the propeller absorbs exactly the power the engine gives
 * at the rpm the lever set. More MAP: a coarser blade, the same rpm (PHAK ch. 7). Only at a stop does the rpm move:
 * below the governing range (little power, low airspeed) the blades sit on the fine stop and the rpm falls.
 */
export function csPropSteady(i: {
  mapInHg: number;
  rpmSet: number;
  tasKt?: number;
}): CsPropOut {
  const v = i.tasKt ?? 100;
  const a = availCoef(i.mapInHg);
  const nSet = i.rpmSet / CS_PROP.maxRpm;
  const need = a / (nSet * nSet);
  const beta = bladeFor(need, v);
  if (beta < CS_PROP.fineDeg) {
    const c = absorption(CS_PROP.fineDeg, v);
    return {
      rpm: Math.round(CS_PROP.maxRpm * Math.sqrt(a / c)),
      bladeDeg: CS_PROP.fineDeg,
      regime: "fineStop",
    };
  }
  if (beta > CS_PROP.coarseDeg) {
    const c = absorption(CS_PROP.coarseDeg, v);
    return {
      rpm: Math.round(CS_PROP.maxRpm * Math.sqrt(a / c)),
      bladeDeg: CS_PROP.coarseDeg,
      regime: "coarseStop",
    };
  }
  return {
    rpm: Math.round(i.rpmSet),
    bladeDeg: Math.round(beta * 10) / 10,
    regime: "governing",
  };
}
export interface CsPropState {
  rpm: number;
  bladeDeg: number;
}
/**
 * One step of the governor in time (the animation): the rpm follows the power balance, the blades follow the
 * flyweights. A throttle pushed forward first speeds the engine up, the flyweights fly out, the pilot valve sends
 * oil to coarsen the blades, and the rpm comes back: what the student sees.
 */
export function csPropStep(
  s: CsPropState,
  i: { mapInHg: number; rpmSet: number; tasKt?: number },
  dt: number,
): CsPropState {
  const v = i.tasKt ?? 100;
  const a = availCoef(i.mapInHg);
  let n = s.rpm / CS_PROP.maxRpm;
  let beta = s.bladeDeg;
  const steps = Math.max(1, Math.ceil(dt / 0.02));
  const h = dt / steps;
  for (let k = 0; k < steps; k++) {
    const c = absorption(beta, v);
    n = Math.max(0, n + ((a - c * n * n) / 0.6) * h);
    const err = (n * CS_PROP.maxRpm - i.rpmSet) / i.rpmSet;
    beta = clamp(beta + 60 * err * h, CS_PROP.fineDeg, CS_PROP.coarseDeg);
  }
  return { rpm: n * CS_PROP.maxRpm, bladeDeg: beta };
}
/** Flyweight tilt, −1 (in: underspeed) … +1 (out: overspeed); 0 on speed. The centrifugal force grows as rpm². */
export function flyweightTilt(rpm: number, rpmSet: number): number {
  const r = (rpm / Math.max(1, rpmSet)) ** 2 - 1;
  return clamp(r * 6, -1, 1);
}

// ------------------------------------------------------------------ free-turbine turboprop
export const TURBOPROP = {
  shp: 675,
  ngIdle: 52,
  ngMax: 101.6,
  npMax: 1900,
  npMin: 1600,
  ittIdle: 520,
  ittMax: 805,
  torqueMax: 1865,
} as const;
export interface TurbopropOut {
  ng: number;
  np: number;
  ittC: number;
  torqueFtLb: number;
  shp: number;
  /** the propeller governs (true) or sits on its low pitch stop (power too low for the rpm set) */
  governing: boolean;
  fuelPph: number;
}
/**
 * The gas generator (compressor and its turbine) turns at Ng, set by the power lever; the free turbine and the
 * propeller turn at Np, set by the propeller lever through the governor: two shafts with no mechanical link
 * (AFH ch. 14). Torque = power ÷ Np, so the torque gauge reads the power at a given Np.
 */
export function turbopropOutputs(i: {
  throttle: number;
  prop: number;
}): TurbopropOut {
  const T = TURBOPROP;
  const ng = T.ngIdle + clamp01(i.throttle) * (99.5 - T.ngIdle);
  const g = Math.pow((ng - T.ngIdle) / (T.ngMax - T.ngIdle), 1.6);
  const shp = Math.max(8, T.shp * g);
  const npSet = T.npMin + clamp01(i.prop) * (T.npMax - T.npMin);
  // below the governing range the propeller sits on its low pitch stop: Np follows the power
  const npFree = 950 + 2500 * Math.sqrt(g);
  const np = Math.min(npSet, npFree);
  const ittC = T.ittIdle + (T.ittMax - 15 - T.ittIdle) * Math.pow(g, 0.85);
  return {
    ng: round1(ng),
    np: Math.round(np),
    ittC: Math.round(ittC),
    torqueFtLb: Math.round((shp * 5252) / np),
    shp: Math.round(shp),
    governing: npFree >= npSet,
    fuelPph: Math.round(75 + 300 * g),
  };
}

// ------------------------------------------------------------------ two-spool turbofan
export const TURBOFAN = {
  bypassRatio: 5.1,
  thrustLbf: 24000,
  n1Idle: 21,
  n1Max: 100,
  n1Red: 104,
  n2Idle: 59,
  egtIdle: 420,
  egtRed: 950,
  /** reverse: N1 is limited (reverse idle … max reverse) */
  n1MaxReverse: 78,
} as const;
/** the share of the air that goes round the core (the by-pass stream): BPR / (1 + BPR) */
export const bypassShare = (bpr: number): number => bpr / (1 + bpr);
/** Thrust fraction of N1 (%): steep (thrust grows about as N1^2.6); monotonic. */
export const thrustOfN1 = (n1: number): number =>
  Math.pow(clamp(n1, 0, 110) / 100, 2.6);
/** the share of the thrust the fan gives at a by-pass ratio near 5: about 80 % */
export const fanThrustShare = (bpr: number): number =>
  clamp(0.5 + 0.06 * bpr, 0, 0.9);
export interface TurbofanOut {
  n1: number;
  n2: number;
  egtC: number;
  /** % of rated thrust; negative with the reversers deployed */
  thrustPct: number;
  thrustLbf: number;
  bypassRatio: number;
  reverse: boolean;
}
/**
 * N1 (fan, booster and low-pressure turbine) and N2 (high-pressure compressor and turbine) are two concentric
 * shafts. The thrust lever sets N1; N2 follows on its own shaft; EGT rises with the fuel burnt. The reversers turn
 * the by-pass stream forward: only the fan's air is reversed, at a limited N1 (AFH ch. 15).
 */
export function turbofanOutputs(i: {
  throttle: number;
  reverse: boolean;
}): TurbofanOut {
  const T = TURBOFAN;
  const top = i.reverse ? T.n1MaxReverse : T.n1Max;
  const n1 = T.n1Idle + clamp01(i.throttle) * (top - T.n1Idle);
  const n2 =
    T.n2Idle + (n1 - T.n1Idle) * ((99 - T.n2Idle) / (T.n1Max - T.n1Idle));
  const f = thrustOfN1(n1);
  const egtC = T.egtIdle + 500 * Math.pow(f, 0.6);
  const fan = fanThrustShare(T.bypassRatio);
  // reversed: the fan stream (most of the thrust) goes forward at about 40 % efficiency, the core still pushes
  const frac = i.reverse ? -0.4 * fan * f + (1 - fan) * f : f;
  return {
    n1: round1(n1),
    n2: round1(n2),
    egtC: Math.round(egtC),
    thrustPct: Math.round(frac * 100),
    thrustLbf: Math.round(frac * T.thrustLbf),
    bypassRatio: T.bypassRatio,
    reverse: i.reverse,
  };
}

// ------------------------------------------------------------------ settings per engine
/** Where the levers are when a slide does not say. */
export function defaultSettings(kind: EngineKind): Required<EngineSettings> {
  const base = {
    throttle: 0.55,
    mixture: 1,
    carbHeat: false,
    prop: 0.5,
    reverse: false,
  };
  if (kind === "turbofan") return { ...base, throttle: 0.35 };
  if (kind === "turboprop") return { ...base, throttle: 0.45, prop: 1 };
  return base;
}
/** Settings from a slide (missing or out-of-range values take the default). */
export function settingsOf(
  kind: EngineKind,
  s?: EngineSettings,
): Required<EngineSettings> {
  const d = defaultSettings(kind);
  const num = (x: unknown, dv: number) =>
    typeof x === "number" && Number.isFinite(x) ? clamp01(x) : dv;
  return {
    throttle: num(s?.throttle, d.throttle),
    mixture: num(s?.mixture, d.mixture),
    carbHeat: typeof s?.carbHeat === "boolean" ? s.carbHeat : d.carbHeat,
    prop: num(s?.prop, d.prop),
    reverse: typeof s?.reverse === "boolean" ? s.reverse : d.reverse,
  };
}
