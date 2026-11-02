// Point-mass + attitude flight model tuned to feel like a C172-class trainer.
import { destination, DEG, norm360, type LatLon } from '../nav/geo';
import { density, FT, G, KT, oatC, pressureAltitude, type Weather } from './environment';
import { WindModel, components, type WindSample } from './wind';

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

export const AIRFRAME = {
  massKg: 1043,
  wingArea: 16.2,
  cl0: 0.3,
  cla: 5.0, // per rad
  alphaStall: 15 * DEG,
  cd0: 0.032,
  k: 0.054,
  powerW: 119000,
  propEff: 0.78,
  staticThrustN: 2700,
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
const QBAR_REF = 0.5 * RHO0 * (100 * KT) ** 2;

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
  private windModel = new WindModel();
  private lastWind: WindSample | null = null;
  private lastPsi = 0;
  private lastAlt = 0;
  private vsFilt = 0;
  private gFilt = 1;

  constructor(
    init: Partial<AircraftState> & LatLon,
    private groundElev: (p: LatLon) => number,
  ) {
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

  private sampleWind(dt: number, w: Weather): WindSample {
    const agl = Math.max(0, this.s.altFt - this.groundElev(this.s));
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
    this.computeData(dtTotal, c, w);
  }

  private substep(dt: number, c: Controls, w: Weather): void {
    const s = this.s;
    const A = AIRFRAME;
    const ground = this.groundElev(s);
    const pAlt = pressureAltitude(s.altFt, w.qnh);
    const rho = density(pAlt, w.oatSeaLevelC);
    const sigma = rho / RHO0;
    const prevWind = this.lastWind;
    const wind = this.sampleWind(dt, w);
    const m = A.massKg;
    // a change of the air-mass velocity changes the airspeed (inertia): headwind gust => more IAS
    if (prevWind && !s.onGround) {
      const dE = wind.e - prevWind.e;
      const dN = wind.n - prevWind.n;
      s.tas = Math.max(1, s.tas - (dE * Math.sin(s.psi) + dN * Math.cos(s.psi)) * Math.cos(s.gamma));
    }

    // Flaps travel ~ 3 s per 10 deg
    const flapTarget = Math.max(0, Math.min(3, Math.round(c.flaps))) / 3;
    s.flapPos += Math.sign(flapTarget - s.flapPos) * Math.min(Math.abs(flapTarget - s.flapPos), dt / 9);
    const f = s.flapPos;

    // Airspeed: on the ground the state holds ground speed
    const headwind = wind.e * -Math.sin(s.psi) + wind.n * -Math.cos(s.psi);
    const V = s.onGround ? Math.max(0, s.tas + headwind) : Math.max(1, s.tas);
    const qbar = 0.5 * rho * V * V;
    const qf = qbar / QBAR_REF;

    // vertical gusts change the angle of attack
    const alpha = s.theta - s.gamma + (s.onGround ? 0 : wind.up / Math.max(15, V));
    const alphaStall = A.alphaStall - 2 * DEG * f;
    let cl = A.cl0 + 0.55 * f + A.cla * alpha;
    if (alpha > alphaStall) {
      const clMax = A.cl0 + 0.55 * f + A.cla * alphaStall;
      cl = clMax - (alpha - alphaStall) * 3.5;
    }
    cl = Math.max(-1.2, cl);
    const cd = A.cd0 + 0.045 * f + A.k * cl * cl + (alpha > alphaStall ? 0.3 : 0);
    const L = qbar * A.wingArea * cl;
    const D = qbar * A.wingArea * cd;

    // Engine
    const thr = Math.max(0, Math.min(1, c.throttle));
    const power = A.powerW * (0.05 + 0.95 * thr) * Math.pow(sigma, 1.1);
    const T = Math.min(A.staticThrustN * (0.05 + 0.95 * thr) * sigma, (A.propEff * power) / Math.max(V, 15)) - (thr < 0.05 ? 150 : 0);
    const targetRpm = Math.min(2700, 600 + thr * 1750 + V * 6);
    s.rpm += (targetRpm - s.rpm) * Math.min(1, dt * 2);
    s.fuelGal = Math.max(0, s.fuelGal - ((1.5 + thr * 9) / 3600) * dt);

    const tb = { roll: s.onGround ? 0 : wind.p, pitch: s.onGround ? 0 : wind.q };

    // ---- Pitch: elevator commands an equilibrium angle of attack
    const u = Math.max(-1.3, Math.min(1.3, c.elevator + c.trim));
    const alphaCmd = (4 - 2.2 * f) * DEG + 13 * DEG * u + (thr - 0.6) * 1.2 * DEG;
    const wn = 3.2 * Math.sqrt(Math.max(0.02, qf));
    s.q += (wn * wn * (alphaCmd - alpha) - 2 * 0.75 * wn * s.q) * dt + tb.pitch * dt * 3;
    s.theta += s.q * dt;

    // ---- Roll
    const pDot = 4.4 * c.aileron * qf - 4.0 * Math.sqrt(Math.max(0.05, qf)) * s.p - 1.2 * s.beta * qf + tb.roll;
    s.p += pDot * dt;
    s.phi += s.p * dt;
    if (s.phi > Math.PI) s.phi -= 2 * Math.PI;
    if (s.phi < -Math.PI) s.phi += 2 * Math.PI;

    // ---- Sideslip (ball): rudder vs. adverse yaw from roll rate
    const betaTarget = (-0.12 * c.rudder + 0.03 * s.p) * Math.min(1, qf * 1.5);
    s.beta += (betaTarget - s.beta) * Math.min(1, dt * 3);

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
        const vs = (s.tas * Math.sin(s.gamma)) / FT * 60;
        const bank = Math.abs(s.phi) / DEG;
        const pitch = s.theta / DEG;
        const onRunway = this.onRunwayCheck ? this.onRunwayCheck(s) : true;
        if (vs < -900 || bank > 12 || pitch < -6) {
          s.crashed = vs < -900 ? `Hard impact (${Math.round(vs)} fpm)` : 'Wing/nose strike on touchdown';
        } else if (!onRunway && s.tas > 30) {
          s.crashed = 'Touched down off-airport';
        }
        s.altFt = ground;
        s.onGround = true;
        s.gamma = 0;
        s.phi = 0;
        s.p = 0;
        // convert to ground speed along heading
        const gs = ve * Math.sin(s.psi) + vnn * Math.cos(s.psi);
        s.tas = Math.max(0, gs);
      }
    } else {
      // Ground roll. s.tas = ground speed along heading
      const weightOnWheels = Math.max(0, m * G - L);
      const brake = c.brake * 0.45;
      const fric = (0.025 + brake) * weightOnWheels * (s.tas > 0.1 ? 1 : 0);
      s.tas = Math.max(0, s.tas + ((T - D - fric) / m) * dt);
      s.gamma = 0;
      s.phi *= 0.9;
      s.p = 0;
      // nosewheel steering
      const steer = c.rudder * 0.35 * Math.min(1, s.tas / 4) * (1 - Math.min(0.7, qf * 0.5));
      // weathervaning: the tail is pushed downwind, the nose swings into a crosswind
      const xw = components(wind.dir, wind.kt, s.psi / DEG).cross;
      const vane = xw * 0.004 * Math.min(1, s.tas / 8) * (1 - Math.min(0.8, qf));
      s.psi += (steer + vane * (s.tas > 0.5 ? 1 : 0)) * dt;
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
      if (L > m * G * 1.02 && V > 20) {
        s.onGround = false;
        // switch state to true airspeed
        s.tas = V;
        s.gamma = 0.5 * DEG;
      }
    }
    s.psi = ((s.psi % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    s.hobbs += dt;
  }

  onRunwayCheck?: (p: LatLon) => boolean;

  private move(ve: number, vn: number, dt: number) {
    const s = this.s;
    const dNm = (Math.hypot(ve, vn) * dt) / 1852;
    if (dNm <= 0) return;
    const brg = Math.atan2(ve, vn) / DEG;
    const p = destination(s, brg, dNm);
    s.lat = p.lat;
    s.lon = p.lon;
  }

  private computeData(dt: number, c: Controls, w: Weather): void {
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
    const ias = tas * Math.sqrt(rho / RHO0);
    const vsRaw = dt > 0 ? ((s.altFt - this.lastAlt) / dt) * 60 : 0;
    this.vsFilt += (vsRaw - this.vsFilt) * Math.min(1, dt * 4);
    let dpsi = s.psi - this.lastPsi;
    if (dpsi > Math.PI) dpsi -= 2 * Math.PI;
    if (dpsi < -Math.PI) dpsi += 2 * Math.PI;
    const turnRate = dt > 0 ? dpsi / dt / DEG : 0;
    this.lastPsi = s.psi;
    this.lastAlt = s.altFt;
    const gl = s.onGround ? 1 : Math.cos(s.gamma) / Math.max(0.2, Math.cos(s.phi));
    this.gFilt += (gl - this.gFilt) * Math.min(1, dt * 3);
    const alpha = s.theta - s.gamma;
    const stallMargin = AIRFRAME.alphaStall - 2 * DEG * s.flapPos - alpha;
    this.data = {
      iasKt: ias / KT,
      tasKt: tas / KT,
      gsKt: Math.hypot(ve, vn) / KT,
      altFt: s.altFt,
      pressAltFt: pAlt,
      aglFt: s.altFt - this.groundElev(s),
      vsFpm: s.onGround ? 0 : this.vsFilt,
      pitchDeg: s.theta / DEG,
      rollDeg: s.phi / DEG,
      hdgTrue: norm360(s.psi / DEG),
      trackTrue: Math.hypot(ve, vn) > 1 ? norm360(Math.atan2(ve, vn) / DEG) : norm360(s.psi / DEG),
      turnRateDps: turnRate,
      slip: Math.max(-1, Math.min(1, s.beta / (6 * DEG))),
      aoaDeg: alpha / DEG,
      gLoad: this.gFilt,
      stallWarn: !s.onGround && stallMargin < 3 * DEG,
      oatC: oatC(s.altFt, w.oatSeaLevelC),
      windDir: wind.dirFrom,
      windKt: wind.speedKt,
      gustKt: this.lastWind?.gust ?? 0,
      headwindKt: components(wind.dirFrom, wind.speedKt, norm360(s.psi / DEG)).head,
      crosswindKt: components(wind.dirFrom, wind.speedKt, norm360(s.psi / DEG)).cross,
      driftDeg: Math.hypot(ve, vn) > 5 ? ((((Math.atan2(ve, vn) / DEG - s.psi / DEG) % 360) + 540) % 360) - 180 : 0,
      updraftFpm: ((this.lastWind?.up ?? 0) / FT) * 60,
      fuelFlowGph: 1.5 + Math.max(0, Math.min(1, c.throttle)) * 9,
      rpm: s.rpm,
      flapsDeg: s.flapPos * 30,
    };
  }
}
