// Point-mass + attitude flight model tuned to feel like a C172-class trainer.
import { destination, DEG, norm360, type LatLon } from '../nav/geo';
import { density, FT, G, KT, oatC, pressureAltitude, type Weather } from './environment';
import { WindModel, components, markov, type WindSample } from './wind';
import { sharedRng, type Rng } from './rng';

export interface Controls {
  elevator: number; // -1 (nose down) .. 1 (nose up)
  aileron: number; // -1 (left) .. 1 (right)
  rudder: number; // -1 .. 1
  throttle: number; // 0 .. 1
  flaps: number; // detent 0..3 (0,10,20,30 deg)
  trim: number; // -1 .. 1, added to elevator
  brake: number; // 0 .. 1
}

export const neutralControls = (): Controls => ({
  elevator: 0,
  aileron: 0,
  rudder: 0,
  throttle: 0.6,
  flaps: 0,
  trim: -0.25,
  brake: 0,
});

/**
 * Cessna 172S-like airframe at max gross weight (2550 lb).
 * True aerodynamics (CLmax 1.48 clean / 1.73 flaps 30, i.e. 54 / 50 KCAS at 2550 lb); the airspeed indicator
 * has the POH pitot-static position error (reads low at high AoA), so the stall reads 48 / 40 KIAS.
 */
export const AIRFRAME = {
  massKg: 1157, // 2550 lb
  wingArea: 16.2, // m^2
  span: 11.0, // m
  cl0: 0.31, // CL at zero fuselage AoA (wing incidence + camber)
  cla: 4.47, // lift slope per rad (AR 7.5)
  alphaStall: 15 * DEG, // critical AoA, flaps up
  /** flaps 30: lift increment at constant AoA and reduction of the critical AoA */
  flapCl: 0.562,
  flapAlphaStall: 4 * DEG,
  cd0: 0.0355, // parasite drag incl. gear, struts, cooling
  k: 0.0697, // induced drag factor 1/(pi e AR), AR 7.5, e 0.61 (incl. fuselage/strut interference)
  flapCd: 0.0311, // parasite drag of the flaps at 30 deg (minimum-drag speed with flaps 30 ~66 KCAS)
  betaCd: 0.9, // fuselage side drag per rad^2 of sideslip (forward slip)
  // ---- Lycoming IO-360-L2A, 180 hp at 2700 RPM, fixed-pitch climb/cruise propeller
  powerW: 134200,
  propDiam: 1.905, // m (75 in)
  /** engine + propeller polar moment of inertia (kg m^2) */
  inertia: 2.4,
  vso: 40,
  vs1: 48,
  vfe: 85,
  vfe10: 110,
  vno: 129,
  vne: 163,
  vr: 55,
  vy: 74,
  vapp: 90,
};

const RHO0 = 1.225;
/** indicated torque at full manifold pressure (N m): 180 hp at 2700 RPM plus friction */
const Q_IND_MAX = AIRFRAME.powerW / ((2700 / 60) * 2 * Math.PI) + 60;
/** throttle-plate open area (as a fraction of the airflow of a 2700 RPM engine at ambient MAP) at the idle stop */
const THROTTLE_IDLE_AREA = 0.0886;

/** Engine friction + pumping torque (N m): FMEP grows with the square of the RPM. */
export function engineFriction(rpm: number): number {
  const n = rpm / 2700;
  return 20 + 40 * n * n;
}

/**
 * Engine brake torque (N m). Manifold pressure follows from the airflow the throttle plate passes versus the
 * airflow the cylinders pump (∝ RPM): at the idle stop a windmilling engine sees almost no MAP and absorbs
 * power. Indicated torque ∝ MAP above the pumping-loss offset; altitude by Gagg–Ferrar.
 */
export function engineTorque(rpm: number, throttle: number, sigma: number, running = true, powerFactor = 1): number {
  if (!running) return -engineFriction(rpm) - 25 * Math.min(1, rpm / 300); // dead engine: friction + compression
  const n = Math.max(0.05, rpm / 2700);
  const area = THROTTLE_IDLE_AREA + (1.15 - THROTTLE_IDLE_AREA) * throttle; // throttle-plate open area
  const map = Math.min(1, area / n); // fraction of ambient pressure
  // Gagg–Ferrar is a *brake* power law: scale the indicated torque so that the full-throttle brake torque follows it
  const gagg = Math.max(0, sigma - (1 - sigma) / 7.55);
  const indFactor = gagg + ((1 - gagg) * 60) / Q_IND_MAX;
  const qInd = Q_IND_MAX * indFactor * Math.max(0, (map - 0.25) / 0.75) * powerFactor;
  return qInd - engineFriction(rpm);
}

// ---------------------------------------------------------------- mixture, ignition (IO-360-L2A, RSA fuel injection)
/**
 * Fuel/air richness relative to the sea-level FULL RICH calibration (1 = the POH-calibrated engine). The RSA servo
 * meters fuel from the venturi pressure (∝ ρV²), so the fuel/air ratio at a fixed knob grows as 1/√σ: full rich is
 * ≈ 9 % richer at 6000 ft, ≈ 13 % at 8000 ft. The aux pump ON with the engine-driven pump working floods ≈ 12 %.
 * `knob` 1 = full rich, 0 = idle cut-off (no fuel below 0.06).
 */
export function mixtureRichness(knob: number, sigma: number, auxFlood = false): number {
  if (knob < 0.06) return 0;
  return (knob * (auxFlood ? 1.12 : 1)) / Math.sqrt(Math.max(0.3, sigma));
}

/** richness of best power (≈ 100 °F rich of peak EGT); sea-level full rich (1.0) is ≈ 10 % richer, for cooling */
export const BEST_POWER_RICHNESS = 0.9;

/**
 * Power vs. mixture as a fraction of the calibrated engine (sea-level full rich = 1). Best power ≈ 1.2 % above full
 * rich at sea level; the rich side is flat-topped (−0.4 % per 10 % richer, faster beyond ≈ 12 % rich: full rich
 * at 8000 ft runs slightly rough and ≈ 1.7 % below best power); lean of peak EGT the power falls fast; below ≈ 0.55 the engine misfires and
 * it quits near 0.45 (lean cut).
 */
export function mixturePower(e: number): number {
  if (e <= 0) return 0;
  const PEAK = 1.012;
  if (e >= 1) return Math.max(0.5, 1 - 0.04 * (e - 1) - 0.8 * Math.max(0, e - 1.12) ** 2);
  if (e >= BEST_POWER_RICHNESS) return PEAK - 1.2 * (e - BEST_POWER_RICHNESS) ** 2;
  const lean = PEAK - 3 * (BEST_POWER_RICHNESS - e) ** 2;
  if (e >= 0.55) return lean;
  // lean misfire: power collapses to zero at 0.45
  const at55 = PEAK - 3 * (BEST_POWER_RICHNESS - 0.55) ** 2;
  return Math.max(0, (at55 * (e - 0.45)) / 0.1);
}

/** roughness 0..1 from the mixture: misfire lean of ≈ 0.6, slight roughness when ≥ 25 % too rich */
export function mixtureRoughness(e: number): number {
  if (e <= 0) return 0;
  if (e < 0.62) return Math.min(1, (0.62 - e) / 0.15);
  if (e > 1.12) return Math.min(0.5, (e - 1.12) * 1.6);
  return 0;
}

/** exhaust gas temperature (°F): peak ≈ 50 °F lean of best power (richness ≈ 0.8), ≈ 200 °F lower at full rich SL */
export function egtF(e: number, powerFrac: number): number {
  if (e <= 0) return 0;
  const peak = 1180 + 300 * Math.max(0, Math.min(1, powerFrac));
  const d = e - 0.8;
  // rich of peak: ≈ 100 °F cooler at best power, ≈ 180 °F at sea-level full rich; lean of peak it falls faster
  return peak - (d > 0 ? 700 * d + 800 * d * d : 4000 * d * d);
}

/** single-magneto running: one plug per cylinder, slower flame front, ≈ 13 % less torque (≈ −75 RPM at the
 *  1800 RPM run-up, ≈ −50 RPM in cruise) */
export const SINGLE_MAG_POWER = 0.87;

/** dead engine (systems-driven aircraft only): below this IAS the windmilling propeller stops on compression… */
export const PROP_STOP_KIAS = 57;
/** …and a stopped propeller only starts turning again in a dive faster than this (or with the starter) */
export const PROP_UNSTICK_KIAS = 100;

/**
 * What the systems model feeds the engine and airframe each step (src/sim/systems.ts). `null` (a bare Aircraft,
 * e.g. in physics tests) keeps the POH-calibrated engine: running while there is fuel, full power, flaps free.
 */
export interface EngineDrive {
  /** fuel + spark + air reach the cylinders */
  combustion: boolean;
  /** fraction of the calibrated indicated torque (mixture × magnetos × failures) */
  powerFactor: number;
  /** torque fluctuation 0..1 (rough magneto, lean misfire) */
  roughness: number;
  /** starter torque while cranking (N m) */
  starterNm: number;
  /** seized engine: the propeller stops and stays stopped */
  seized: boolean;
  /** fuel per unit of air relative to the calibration (mixture richness) */
  richness: number;
  /** flap motor unpowered or flaps jammed: the flaps stay where they are */
  flapsHold: boolean;
  /** extra parasite drag coefficient (door ajar) */
  extraCd: number;
}

/** Fixed-pitch propeller: thrust and power coefficients vs advance ratio J = V / (n D).
 *  Near static the blades are stalled: CT and CP plateau. Beyond, CT falls linearly with J (zero thrust near
 *  J 1.15: beyond it the windmilling propeller is a drag brake) and CP falls from J 0.45 (zero near J 1.1).
 *  Calibrated to the POH: static 2360 RPM, Vy 74 / 730 fpm, 2400 RPM cruise 112 KTAS, 9:1 idle glide. */
export function propCoefficients(J: number): { ct: number; cp: number } {
  const lin = 0.1725 - 0.1537 * J;
  const ct = -0.008 * Math.log(Math.exp(-lin / 0.008) + Math.exp(-0.1099 / 0.008)); // smooth min(lin, 0.1099)
  const x = Math.max(0, J - 0.5);
  return { ct, cp: 0.0639 - 0.2045 * x * x };
}

const QBAR_REF = 0.5 * RHO0 * (100 * KT) ** 2;

/** C172S airspeed calibration (POH 5-1, normal static source) as IAS − CAS (kt) vs the wing CL: the indication
 *  reads ~3 kt high in cruise and increasingly low at high AoA (−6 at 56 KCAS, −10 at the flaps-30 stall). */
const ASI_ERR: [number, number][] = [[0.57, 3], [0.71, 2], [0.88, 0], [1.12, -2], [1.38, -6], [1.73, -10], [2.2, -12]];
export function asiPositionError(cl: number): number {
  if (cl <= ASI_ERR[0][0]) return ASI_ERR[0][1];
  for (let i = 1; i < ASI_ERR.length; i++) {
    const [c1, e1] = ASI_ERR[i];
    if (cl <= c1) {
      const [c0, e0] = ASI_ERR[i - 1];
      return e0 + ((e1 - e0) * (cl - c0)) / (c1 - c0);
    }
  }
  return ASI_ERR[ASI_ERR.length - 1][1];
}

export interface AircraftState extends LatLon {
  altFt: number; // true altitude MSL
  tas: number; // m/s (airspeed in the air, ground speed on the ground)
  gamma: number; // flight path angle rad
  theta: number; // pitch rad
  q: number; // pitch rate rad/s
  phi: number; // bank rad
  p: number; // roll rate rad/s
  psi: number; // true heading rad
  beta: number; // sideslip rad
  flapPos: number; // 0..1 actual
  onGround: boolean;
  crashed: string | null;
  fuelGal: number;
  rpm: number;
  hobbs: number;
}

export interface FlightData {
  iasKt: number;
  tasKt: number;
  gsKt: number;
  /** ground speed and true track smoothed like a GPS/IRS output (tau 0.8 s) — for DISPLAYS (track line, GS readout) */
  gsSmooth: number;
  trackSmooth: number;
  altFt: number;
  pressAltFt: number;
  aglFt: number;
  vsFpm: number;
  pitchDeg: number;
  rollDeg: number;
  hdgTrue: number;
  trackTrue: number;
  turnRateDps: number;
  slip: number; // -1..1 ball offset
  aoaDeg: number;
  gLoad: number;
  stallWarn: boolean;
  oatC: number;
  windDir: number;
  windKt: number;
  /** current gust increment above the mean wind (kt) */
  gustKt: number;
  /** headwind (+) / tailwind (−) component (kt) */
  headwindKt: number;
  /** crosswind component (kt), + = from the right */
  crosswindKt: number;
  /** drift / wind correction angle: track − heading (deg) */
  driftDeg: number;
  /** vertical air-mass motion (fpm) */
  updraftFpm: number;
  fuelFlowGph: number;
  rpm: number;
  flapsDeg: number;
}

export class Aircraft {
  s: AircraftState;
  data!: FlightData;
  private windModel: WindModel;
  /** the owning Sim's seeded stream (turbulence, gusts, buffet) */
  readonly rng: Rng;
  private lastWind: WindSample | null = null;
  private lastPsi = 0;
  private lastAlt = 0;
  private vsFilt = 0;
  private iasFilt = -1;
  /** GPS/IRS-smoothed ground velocity (m/s east/north): turbulence must not make track / GS jitter */
  private gvE = NaN;
  private gvN = NaN;
  private gFilt = 1;
  /** normal load factor of the last substep (lift + thrust component over weight): what the g-meter feels */
  private nz = 1;
  /** throttle as seen by the engine (linkage + manifold filling lag) */
  private thrEff = -1;
  /** CL / CLmax of the last substep (stall-warning vane) */
  private clRatio = 0;
  private clLast = 0.5;
  private clFilt = 0.5;
  private brakeHp = 0;
  /** propeller thrust (N), last substep */
  thrust = 0;
  /** systems inputs (mixture, magnetos, fuel, failures) — set by the SystemsModel every step; null = calibrated */
  drive: EngineDrive | null = null;
  /** density ratio of the last substep */
  sigma = 1;
  /** brake horsepower of the last substep */
  get bhp(): number {
    return this.brakeHp;
  }
  private roughT = 0;
  private ffNow = 0;
  /** dead engine: the propeller has stopped (compression) and stays stopped until the starter or a dive turns it */
  propStopped = false;
  /** last wheel contact (for landing feedback and grading) */
  touchdown: { vsFpm: number; pitchDeg: number; bankDeg: number; ias: number; g: number; lat: number; lon: number; kind: 'smooth' | 'normal' | 'firm' | 'hard'; bounced: boolean; t: number } | null = null;
  /** true while the wing is past the critical angle of attack */
  stalled = false;
  /** stall buffet intensity 0..1 (for audio / shake) */
  buffet = 0;
  private bufQ = 0;
  private bufP = 0;
  /** flow separated (stalled wing), with reattachment hysteresis */
  private sep = false;

  constructor(
    init: Partial<AircraftState> & LatLon,
    private groundElev: (p: LatLon) => number,
    rng: Rng = sharedRng,
  ) {
    this.rng = rng;
    this.windModel = new WindModel(rng);
    this.s = {
      altFt: 3000,
      tas: 100 * KT,
      gamma: 0,
      theta: 0.5 * DEG,
      q: 0,
      phi: 0,
      p: 0,
      psi: 0,
      beta: 0,
      flapPos: 0,
      onGround: false,
      crashed: null,
      fuelGal: 53,
      rpm: 2300,
      hobbs: 0,
      ...init,
    };
    this.lastPsi = this.s.psi;
    this.lastAlt = this.s.altFt;
  }

  /** Wind vector (m/s, east & north components the air moves TOWARD) — the last sampled value. */
  wind(w: Weather): { e: number; n: number; speedKt: number; dirFrom: number } {
    if (!this.lastWind) this.sampleWind(0.01, w);
    const l = this.lastWind!;
    return { e: l.e, n: l.n, speedKt: l.kt, dirFrom: l.dir };
  }

  private sampleWind(dt: number, w: Weather, groundFt = this.groundElev(this.s)): WindSample {
    // the wing (where the aircraft "feels" the air) sits ~6 ft above the wheels: on the runway it is not in
    // the dead air at grass height of the logarithmic boundary-layer profile
    const agl = Math.max(0, this.s.altFt - groundFt) + 6;
    const pAlt = this.s.altFt;
    const ws = this.windModel.sample(dt, w, pAlt, agl, this.s.tas, this.s.onGround);
    this.lastWind = ws;
    return ws;
  }

  step(dtTotal: number, c: Controls, w: Weather): void {
    if (this.s.crashed) return;
    const n = Math.max(1, Math.ceil(dtTotal / (1 / 120)));
    const dt = dtTotal / n;
    for (let i = 0; i < n; i++) this.substep(dt, c, w);
    this.computeData(dtTotal, w);
  }

  private substep(dt: number, c: Controls, w: Weather): void {
    const s = this.s;
    const A = AIRFRAME;
    const ground = this.groundElev(s);
    const pAlt = pressureAltitude(s.altFt, w.qnh);
    const rho = density(pAlt, w.oatSeaLevelC);
    const sigma = rho / RHO0;
    const prevWind = this.lastWind;
    const wind = this.sampleWind(dt, w, ground);
    const m = A.massKg;
    const W = m * G;
    // Inertia: the state (tas, gamma) is the velocity relative to the air mass. A change of the air-mass
    // velocity leaves the inertial velocity unchanged, so it changes the air-relative one: a headwind gust
    // raises the airspeed, an updraft steepens the air-relative path (raises the AoA) — the aircraft is then
    // accelerated by the aerodynamic forces, never moved instantly with the air.
    if (prevWind && !s.onGround) {
      const dE = wind.e - prevWind.e;
      const dN = wind.n - prevWind.n;
      const dU = wind.up - prevWind.up;
      const dAlong = (dE * Math.sin(s.psi) + dN * Math.cos(s.psi)) * Math.cos(s.gamma) + dU * Math.sin(s.gamma);
      s.tas = Math.max(1, s.tas - dAlong);
      s.gamma -= ((dU * Math.cos(s.gamma) - (dE * Math.sin(s.psi) + dN * Math.cos(s.psi)) * Math.sin(s.gamma)) / Math.max(15, s.tas));
    }

    // Flaps travel ~ 3 s per 10 deg
    const flapTarget = Math.max(0, Math.min(3, Math.round(c.flaps))) / 3;
    const drv = this.drive;
    if (!drv?.flapsHold) s.flapPos += Math.sign(flapTarget - s.flapPos) * Math.min(Math.abs(flapTarget - s.flapPos), dt / 9);
    const f = s.flapPos;
    // the first notch gives mostly lift (Fowler motion), drag grows with the deflection
    const fLift = f * (2 - f);
    const fDrag = f;

    // Airspeed: on the ground the state holds ground speed
    const headwind = wind.e * -Math.sin(s.psi) + wind.n * -Math.cos(s.psi);
    const V = s.onGround ? Math.max(0, s.tas + headwind) : Math.max(1, s.tas);
    const qbar = 0.5 * rho * V * V;
    const qf = qbar / QBAR_REF;

    // ---- Wing. Angle of attack from the air-relative flight path (vertical gusts enter through gamma above)
    const alpha = s.theta - s.gamma;
    const alphaStall = A.alphaStall - A.flapAlphaStall * f;
    // ground effect (wingspan 11 m): more lift slope, much less induced drag close to the runway
    const aglM = Math.max(0, (s.altFt - ground) * FT) + 1.2;
    const ge = (16 * aglM / A.span) ** 2 / (1 + (16 * aglM / A.span) ** 2); // 0 on the ground .. 1 high up
    const claEff = A.cla * (1 + 0.09 * (1 - ge));
    const clF = A.cl0 + A.flapCl * fLift;
    const clMax = clF + claEff * alphaStall;
    const clAtt = clF + claEff * alpha; // attached flow
    let cl = clAtt;
    const over = alpha - alphaStall;
    // Flow separation with hysteresis: the wing separates past the critical AoA (lift drops ~20 %, drag jumps)
    // and the flow only reattaches ~3 deg below it — the stall "breaks" instead of hovering at CLmax.
    if (s.onGround) this.sep = false;
    else if (over > 0) this.sep = true;
    else if (over < -3 * DEG) this.sep = false;
    const sep = this.sep;
    const overP = Math.max(0, over);
    if (sep) cl = Math.min(cl, Math.max(clMax * 0.72, clMax * 0.82 - overP * 1.5));
    cl = Math.max(-1.2, cl);
    // stall-warning vane: driven by the AoA (stagnation point), i.e. by the attached-flow lift coefficient
    this.clRatio = clAtt / clMax;
    this.clLast = cl;
    // sideslip: the fuselage side area meets the air (forward slip = drag brake)
    const cd = A.cd0 + (drv?.extraCd ?? 0) + A.flapCd * fDrag + A.k * cl * cl * (0.45 + 0.55 * ge) + A.betaCd * s.beta * s.beta + (sep ? 0.08 + overP * 0.9 : 0);
    const L = qbar * A.wingArea * cl;
    const D = qbar * A.wingArea * cd;
    this.stalled = sep && !s.onGround;

    // ---- Engine + fixed-pitch propeller. The RPM is a state: engine torque against propeller torque.
    const thr = Math.max(0, Math.min(1, c.throttle));
    if (this.thrEff < 0) this.thrEff = thr;
    this.thrEff += (thr - this.thrEff) * Math.min(1, dt / 0.25); // throttle linkage / manifold filling
    const nRps = Math.max(1, s.rpm / 60);
    const J = V / (nRps * A.propDiam);
    const pc = propCoefficients(J);
    const T = pc.ct * rho * nRps * nRps * A.propDiam ** 4;
    const qProp = (pc.cp * rho * nRps * nRps * A.propDiam ** 5) / (2 * Math.PI);
    // fuel exhausted (or no combustion from the systems): the windmilling propeller drives a dead engine
    const running = s.fuelGal > 0 && (drv ? drv.combustion : true);
    let qEng: number;
    if (!drv) qEng = engineTorque(s.rpm, this.thrEff, sigma, running);
    else {
      qEng = engineTorque(s.rpm, this.thrEff, sigma, running, running ? drv.powerFactor : 1);
      if (running && drv.roughness > 0) {
        // misfiring cylinders: an irregular torque ripple (deterministic, never consumes the seeded weather RNG)
        this.roughT += dt;
        const t = this.roughT;
        const ripple = 0.55 * Math.sin(2 * Math.PI * 6.7 * t) + 0.3 * Math.sin(2 * Math.PI * 2.3 * t + 1.3) + 0.35 * Math.sin(2 * Math.PI * 0.9 * t + 0.4);
        qEng += drv.roughness * 0.35 * Q_IND_MAX * ripple * Math.min(1, s.rpm / 1500);
      }
      qEng += drv.starterNm;
    }
    const rpm0 = s.rpm;
    s.rpm = Math.max(0, s.rpm + ((qEng - qProp) / A.inertia) * (60 / (2 * Math.PI)) * dt);
    if (drv?.seized) s.rpm = Math.max(0, s.rpm - 3000 * dt); // the crankshaft locks: the propeller stops
    else if (drv) {
      // a dead engine's compression strokes stop a slow windmilling propeller (POH: "if the propeller has stopped
      // (possible at low speeds)"); a stopped propeller needs the starter, or a dive, to turn again
      const iasKt = (V * Math.sqrt(sigma)) / KT;
      if (running || drv.starterNm > 0) this.propStopped = false;
      else if (this.propStopped) {
        if (iasKt > PROP_UNSTICK_KIAS) this.propStopped = false;
      } else if (iasKt < PROP_STOP_KIAS && s.rpm < 1000) this.propStopped = true;
      // held by the compression: it slows to a stop within a second or two and the airflow cannot turn it
      if (this.propStopped) s.rpm = Math.max(0, Math.min(s.rpm, rpm0) - 700 * dt);
    }
    this.brakeHp = Math.max(0, (qEng * s.rpm * 2 * Math.PI) / 60 / 745.7);
    this.sigma = sigma;
    this.thrust = T;
    // fuel is metered by the air the engine breathes (not by the power a rough engine makes)
    if (!drv) this.ffNow = this.fuelFlow();
    else if (!running) this.ffNow = 0;
    else {
      const plain = drv.powerFactor === 1 && drv.roughness === 0 && drv.starterNm === 0;
      const qAir = plain ? qEng : engineTorque(s.rpm, this.thrEff, sigma, true);
      this.ffNow = Math.max(1.2, (Math.max(0, qAir * s.rpm * 2 * Math.PI) / 60 / 745.7) * 0.45 / 6) * drv.richness;
    }
    s.fuelGal = Math.max(0, s.fuelGal - (this.ffNow / 3600) * dt);
    // thrust coefficient: slipstream/P-factor effects are strongest at high power and low speed
    const Tc = Math.max(0, Math.min(0.6, T / (Math.max(qbar, 150) * A.wingArea)));

    const tb = { roll: s.onGround ? 0 : wind.p, pitch: s.onGround ? 0 : wind.q };

    // ---- Pitch: elevator commands an equilibrium angle of attack (static stability), limited past the stall
    const u = Math.max(-1.3, Math.min(1.3, c.elevator + c.trim));
    // flaps: nose-down trim change in AoA terms, but the lift increment wins: the trimmed speed falls (pitch-up)
    // (elevator: 11.5 deg AoA per unit; power: thrust line + slipstream on the tail pitch the nose up)
    let alphaCmd = 5.3 * DEG - 3 * DEG * fLift + 11.5 * DEG * u + (T / W - 0.1) * 8 * DEG;
    // the elevator runs out of authority a few degrees past the critical angle of attack
    alphaCmd = Math.min(alphaCmd, alphaStall + 4 * DEG);
    // stall break: once the wing has stalled the downwash at the tail collapses and the centre of pressure
    // moves aft: a nose-down pitching moment the elevator cannot hold (full aft yoke: the nose bobs)
    if (sep) alphaCmd -= overP * 3 + 5 * DEG;
    const wn = 3.2 * Math.sqrt(Math.max(0.02, qf));
    if (s.onGround) {
      // nose-wheel on the runway: the elevator must overcome the nose-wheel load, which only happens
      // with enough dynamic pressure (rotation near Vr; nose lowers by itself as the speed decays)
      const auth = Math.max(0, Math.min(1, (qf - 0.12) / 0.15));
      // ~11 deg rotation attitude for 0.3 back pressure near Vr; hands-off the nose stays on the runway
      const thetaTgt = Math.max(0, Math.min(12.5 * DEG, u * 36 * DEG * auth));
      const rate = thetaTgt > s.theta ? 4 * DEG : 3.5 * DEG;
      const dth = Math.max(-rate * dt, Math.min(rate * dt, (thetaTgt - s.theta) * Math.min(1, dt * 3)));
      s.q = dth / Math.max(dt, 1e-4);
    } else s.q += (wn * wn * (alphaCmd - alpha) - 2 * 0.75 * wn * (s.q - tb.pitch)) * dt; // pitch damping acts on the rate relative to the air (q - q_g)
    // stall buffet in the last ~2.5 degrees before the critical angle: the separated wake shakes the tail
    // (band-limited ~3 Hz process, step-size independent: a nod of the nose and a gentle wing rock,
    // no wing drop without sideslip)
    if (!s.onGround && (sep || alpha > alphaStall - 2.5 * DEG)) {
      const k = sep ? 1 : Math.min(1, (alpha - alphaStall + 2.5 * DEG) / (2.5 * DEG));
      this.buffet = k;
      this.bufQ = markov(this.bufQ, dt, 0.05, this.rng);
      this.bufP = markov(this.bufP, dt, 0.05, this.rng);
      s.q += 0.35 * k * this.bufQ * dt;
      s.p += 0.15 * k * this.bufP * dt;
    } else this.buffet = 0;
    s.theta += s.q * dt;

    // ---- Roll. Aileron moment ∝ q, roll damping ∝ q·(p b / 2V) ∝ rho V: the steady roll rate grows with TAS
    // (~40 deg/s full aileron at 100 kt). A stalled wing drops toward the sideslip, ailerons lose authority.
    const drop = sep ? -Math.max(-1, Math.min(1, s.beta / (4 * DEG))) * Math.min(1.0, 0.35 + (overP / DEG) * 0.25) : 0;
    const ailEff = sep ? 0.45 : 1;
    const vRatio = Math.max(0.15, V / (100 * KT));
    // yaw rate in a turn: the outer wing is faster (rolling moment due to yaw rate) -> slight spiral divergence
    const r = s.onGround ? 0 : (G * Math.tan(Math.max(-1.2, Math.min(1.2, s.phi)))) / Math.max(20, V);
    // roll damping acts on the roll rate relative to the air mass: a Dryden roll gust p_g drags the wing along.
    // Past the critical AoA the down-going wing stalls deeper and loses lift: the damping collapses (autorotation)
    const lp = (3.0 / vRatio) * (sep ? 0.3 : 1);
    const pDot = qf * (2.1 * c.aileron * ailEff - lp * (s.p - tb.roll) - 1.2 * s.beta + 0.8 * ((r * A.span) / (2 * Math.max(20, V)))) + drop;
    s.p += pDot * dt;
    s.phi += s.p * dt;
    if (s.phi > Math.PI) s.phi -= 2 * Math.PI;
    if (s.phi < -Math.PI) s.phi += 2 * Math.PI;

    // ---- Sideslip (ball): rudder vs. adverse yaw from roll rate, P-factor / slipstream at high power.
    // Steady sideslip per rudder deflection does not depend on the speed (both moments ∝ q); the rudder only
    // fades at taxi speeds. The vertical fin is rigged for cruise: idle needs a touch of left rudder.
    const rudAuth = Math.max(0, Math.min(1, qf * 4));
    // P-factor (asymmetric blade loading) grows with AoA x thrust, slipstream swirl with thrust: ~1 deg of
    // sideslip at Vy full power, ~0.25 deg on a power-on approach, none in cruise (fin offset), a little
    // the other way at idle.
    const pFactor = s.onGround ? 0 : 1.0 * (Tc * (alpha + 2 * DEG) - 0.12 * DEG);
    // on the wheels the tyres hold the nose on the direction of travel: no sideslip state (the rudder
    // steers through the nose wheel instead)
    const betaTarget = s.onGround ? 0 : (-0.2 * c.rudder + 0.03 * s.p) * rudAuth + pFactor;
    s.beta += (betaTarget - s.beta) * Math.min(1, dt * (s.onGround ? 10 : 3));

    this.nz = s.onGround ? 1 : (L + T * Math.sin(alpha)) / W;
    if (!s.onGround) {
      const Ltot = L + T * Math.sin(alpha);
      s.tas += ((T * Math.cos(alpha) - D) / m - G * Math.sin(s.gamma)) * dt;
      s.tas = Math.max(1, s.tas);
      const Vn = Math.max(5, s.tas);
      s.gamma += ((Ltot * Math.cos(s.phi)) / (m * Vn) - (G * Math.cos(s.gamma)) / Vn) * dt;
      s.gamma = Math.max(-80 * DEG, Math.min(80 * DEG, s.gamma));
      s.psi += ((Ltot * Math.sin(s.phi)) / (m * Vn * Math.max(0.2, Math.cos(s.gamma))) - 0.5 * s.beta * qf) * dt;

      // Integrate position with wind
      const vh = s.tas * Math.cos(s.gamma);
      const ve = vh * Math.sin(s.psi) + wind.e;
      const vnn = vh * Math.cos(s.psi) + wind.n;
      this.move(ve, vnn, dt);
      s.altFt += ((s.tas * Math.sin(s.gamma) + wind.up) * dt) / FT;

      if (s.altFt <= ground) {
        const vs = ((s.tas * Math.sin(s.gamma) + wind.up) / FT) * 60; // inertial sink rate
        const bank = Math.abs(s.phi) / DEG;
        const pitch = s.theta / DEG;
        const onRunway = this.onRunwayCheck ? this.onRunwayCheck(s) : true;
        const g = 1 + Math.min(4, Math.abs(vs) / 300);
        if (vs < -1100 || bank > 12 || pitch < -6) {
          s.crashed = vs < -1100 ? `Hard impact (${Math.round(vs)} fpm)` : bank > 12 ? 'Wing strike on touchdown' : 'Nose-wheel strike (nose-low touchdown)';
        } else if (!onRunway && s.tas > 30) {
          s.crashed = 'Touched down off-airport';
        }
        const prev = this.touchdown;
        // the contact after a bounce belongs to the same landing: the first (firm) contact is the one graded
        if (prev && prev.bounced && s.hobbs - prev.t < 8) prev.t = s.hobbs;
        else this.touchdown = { vsFpm: vs, pitchDeg: pitch, bankDeg: s.phi / DEG, ias: V * Math.sqrt(sigma) / KT + asiPositionError(cl), g, lat: s.lat, lon: s.lon, kind: vs < -600 ? 'hard' : vs < -360 ? 'firm' : vs < -120 ? 'normal' : 'smooth', bounced: false, t: s.hobbs };
        // bounce: a firm/hard arrival with lift still available rebounds off the oleo/spring gear
        if (!s.crashed && vs < -420 && L > W * 0.55) {
          this.touchdown!.bounced = true;
          s.altFt = ground + 0.3;
          s.gamma = Math.min(4 * DEG, (-s.gamma) * 0.35);
          s.theta += 2 * DEG;
          return;
        }
        s.altFt = ground;
        s.onGround = true;
        s.gamma = 0;
        s.p = 0;
        // the wheels roll where the nose points (heading = path − sideslip): a wing-low touchdown keeps its
        // heading, the tyres absorb any sideways drift; the ground speed is the inertial velocity along the nose
        // (the bank settles on the gear over the next fraction of a second)
        s.psi -= s.beta;
        s.beta = 0;
        const gs = ve * Math.sin(s.psi) + vnn * Math.cos(s.psi);
        s.tas = Math.max(0, gs);
      }
    } else {
      // Ground roll. s.tas = ground speed along heading
      const N = Math.max(0, W - L); // weight on the wheels
      // rolling resistance (paved) + main-wheel brakes; static friction holds the aircraft at rest
      const muRoll = 0.022;
      const muBrake = 0.25 * Math.max(0, Math.min(1, c.brake));
      const drive = T - D;
      if (s.tas <= 0.02 && Math.abs(drive) <= (muRoll + muBrake) * N + 50) s.tas = 0;
      else s.tas = Math.max(0, s.tas + ((drive - (muRoll + muBrake) * N) / m) * dt);
      s.gamma = 0;
      s.phi *= Math.exp(-dt / 0.15);
      s.p = 0;
      // nosewheel steering
      const steer = c.rudder * 0.35 * Math.min(1, s.tas / 4) * (1 - Math.min(0.7, qf * 0.5));
      // weathervaning: the tail is pushed downwind, the nose swings into a crosswind
      const xw = components(wind.dir, wind.kt, s.psi / DEG).cross;
      const vane = xw * 0.004 * Math.min(1, s.tas / 8) * (1 - Math.min(0.8, qf));
      // left-turning tendency at high power and low speed (slipstream on the fin, P-factor, torque)
      const leftTurn = -0.005 * Math.min(1, T / 2300) * Math.max(0, 1 - V / (60 * KT)) * Math.min(1, s.tas / 2);
      s.psi += (steer + vane * (s.tas > 0.5 ? 1 : 0) + leftTurn) * dt;
      if (s.theta < 0) {
        s.theta = 0;
        s.q = Math.max(0, s.q);
      }
      if (s.theta > 13 * DEG) {
        s.theta = 13 * DEG;
        s.q = Math.min(0, s.q);
      }
      this.move(s.tas * Math.sin(s.psi), s.tas * Math.cos(s.psi), dt);
      s.altFt = ground;
      if (L > W * 1.02 && V > 20) {
        s.onGround = false;
        // switch the state to the air-relative velocity (inertial velocity − wind): in a crosswind the path
        // through the air is angled into the wind while the nose still points down the runway — a sideslip the
        // fin then weathervanes into a crab, instead of the aircraft being kicked sideways by the wind
        const ae = s.tas * Math.sin(s.psi) - wind.e;
        const an = s.tas * Math.cos(s.psi) - wind.n;
        const nose = s.psi;
        s.tas = Math.max(1, Math.hypot(ae, an));
        s.psi = Math.atan2(ae, an);
        s.beta = Math.atan2(Math.sin(s.psi - nose), Math.cos(s.psi - nose));
        s.gamma = 0.5 * DEG;
      }
    }
    s.psi = ((s.psi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    s.hobbs += dt;
  }

  /** fuel flow (gph) from brake power: BSFC ~0.45 lb/hp/h, avgas 6 lb/gal */
  private fuelFlow(): number {
    return Math.max(1.2, (this.brakeHp * 0.45) / 6);
  }

  onRunwayCheck?: (p: LatLon) => boolean;

  /** Replay: place the aircraft at a recorded instant (instruments read the recorded values). */
  applySnapshot(x: { lat: number; lon: number; altFt: number; hdg: number; pitch: number; bank: number; ias: number; vs: number; agl: number }) {
    const s = this.s;
    s.lat = x.lat;
    s.lon = x.lon;
    s.altFt = x.altFt;
    s.psi = x.hdg * DEG;
    s.theta = x.pitch * DEG;
    s.phi = x.bank * DEG;
    s.onGround = x.agl < 3;
    s.crashed = null;
    this.lastAlt = x.altFt;
    this.lastPsi = s.psi;
    if (this.data) Object.assign(this.data, { iasKt: x.ias, tasKt: x.ias * 1.05, vsFpm: x.vs, pitchDeg: x.pitch, rollDeg: x.bank, hdgTrue: x.hdg, altFt: x.altFt, aglFt: x.agl, turnRateDps: 0, stallWarn: false });
  }

  private move(ve: number, vn: number, dt: number) {
    const s = this.s;
    const dNm = (Math.hypot(ve, vn) * dt) / 1852;
    if (dNm <= 0) return;
    const brg = Math.atan2(ve, vn) / DEG;
    const p = destination(s, brg, dNm);
    s.lat = p.lat;
    s.lon = p.lon;
  }

  private computeData(dt: number, w: Weather): void {
    const s = this.s;
    const wind = this.wind(w);
    const pAlt = pressureAltitude(s.altFt, w.qnh);
    const rho = density(pAlt, w.oatSeaLevelC);
    let tas: number;
    let ve: number;
    let vn: number;
    if (s.onGround) {
      ve = s.tas * Math.sin(s.psi);
      vn = s.tas * Math.cos(s.psi);
      tas = Math.hypot(ve - wind.e, vn - wind.n);
    } else {
      tas = s.tas;
      const vh = s.tas * Math.cos(s.gamma);
      ve = vh * Math.sin(s.psi) + wind.e;
      vn = vh * Math.cos(s.psi) + wind.n;
    }
    // calibrated airspeed + the pitot-static position error of the C172 ASI (driven by the wing's CL, i.e. AoA)
    this.clFilt += (this.clLast - this.clFilt) * Math.min(1, dt / 0.5);
    const iasRaw = Math.max(0, tas * Math.sqrt(rho / RHO0) + (tas > 10 * KT ? asiPositionError(this.clFilt) * KT : 0));
    // pitot-static / air-data computer lag: the indication smooths turbulence like a real ASI (tau ~0.4 s)
    if (this.iasFilt < 0) this.iasFilt = iasRaw;
    this.iasFilt += (iasRaw - this.iasFilt) * Math.min(1, dt / 0.4);
    const ias = this.iasFilt;
    if (!Number.isFinite(this.gvE)) { this.gvE = ve; this.gvN = vn; }
    const kg = Math.min(1, dt / 0.8);
    this.gvE += (ve - this.gvE) * kg;
    this.gvN += (vn - this.gvN) * kg;
    const gsMs = Math.hypot(this.gvE, this.gvN);
    const vsRaw = dt > 0 ? ((s.altFt - this.lastAlt) / dt) * 60 : 0;
    this.vsFilt += (vsRaw - this.vsFilt) * Math.min(1, dt * 4);
    let dpsi = s.psi - this.lastPsi;
    if (dpsi > Math.PI) dpsi -= 2 * Math.PI;
    if (dpsi < -Math.PI) dpsi += 2 * Math.PI;
    const turnRate = dt > 0 ? dpsi / dt / DEG : 0;
    this.lastPsi = s.psi;
    this.lastAlt = s.altFt;
    // accelerometer: the true normal load factor (a pull-up or a push-over shows, not only the bank)
    this.gFilt += (this.nz - this.gFilt) * Math.min(1, dt * 3);
    const alpha = s.theta - s.gamma;
    this.data = {
      iasKt: ias / KT,
      tasKt: tas / KT,
      gsKt: Math.hypot(ve, vn) / KT,
      gsSmooth: gsMs / KT,
      altFt: s.altFt,
      pressAltFt: pAlt,
      aglFt: s.altFt - this.groundElev(s),
      vsFpm: s.onGround ? 0 : this.vsFilt,
      pitchDeg: s.theta / DEG,
      rollDeg: s.phi / DEG,
      // the nose points off the flight path by the sideslip: rudder yaws the nose (heading) at once,
      // the track follows through the side force / dihedral roll
      hdgTrue: norm360((s.psi - (s.onGround ? 0 : s.beta)) / DEG),
      trackTrue: Math.hypot(ve, vn) > 1 ? norm360(Math.atan2(ve, vn) / DEG) : norm360(s.psi / DEG),
      trackSmooth: gsMs > 1 ? norm360(Math.atan2(this.gvE, this.gvN) / DEG) : norm360(s.psi / DEG),
      turnRateDps: turnRate,
      slip: Math.max(-1, Math.min(1, s.beta / (6 * DEG))),
      aoaDeg: alpha / DEG,
      gLoad: this.gFilt,
      // stall-warning reed: the stagnation point reaches the leading-edge vane at ~85% of CLmax,
      // i.e. 5-8 KIAS above the 1 g stall speed (and earlier when pulling g)
      stallWarn: !s.onGround && this.clRatio > 0.85,
      oatC: oatC(s.altFt, w.oatSeaLevelC),
      windDir: wind.dirFrom,
      windKt: wind.speedKt,
      gustKt: this.lastWind?.gust ?? 0,
      headwindKt: components(wind.dirFrom, wind.speedKt, norm360(s.psi / DEG)).head,
      crosswindKt: components(wind.dirFrom, wind.speedKt, norm360(s.psi / DEG)).cross,
      driftDeg: Math.hypot(ve, vn) > 5 ? ((((Math.atan2(ve, vn) / DEG - s.psi / DEG) % 360) + 540) % 360) - 180 : 0,
      updraftFpm: ((this.lastWind?.up ?? 0) / FT) * 60,
      fuelFlowGph: this.drive ? this.ffNow : this.fuelFlow(),
      rpm: s.rpm,
      flapsDeg: s.flapPos * 30,
    };
  }
}
