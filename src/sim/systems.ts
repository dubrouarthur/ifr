// Aircraft systems of the C172S-class trainer for emergency-procedure training: 28 V electrical system, vacuum
// gyros, pitot-static, engine / fuel / oil, fire, flaps, electric trim, radios and transponder. The pilot's
// Switches go in, a SystemsReadout comes out (gauges, annunciators, which consumers have power, what the steam
// instruments and the pitot-static instruments indicate), and the engine/airframe inputs (EngineDrive) are fed to
// the flight model. Every FailureKey has its symptoms here and the POH cure works (or does not, for the incurable
// ones). Physics, autopilot and the grading of the TRUE flight path never read the indicated values.
//
// Determinism: nothing here consumes the seeded weather RNG (src/sim/rng.ts); the few random choices of a failure
// (which magneto is bad, when an oil-starved engine seizes, which way a gyro topples) come from a local PRNG
// seeded with the scenario id and the failure, so a drill flown twice behaves the same.
import type { Sim } from "./sim";
import {
  defaultSwitches,
  type Annunciator,
  type ElecFlags,
  type FailureKey,
  type Switches,
  type SystemsState,
} from "./systemsTypes";
import {
  egtF,
  mixturePower,
  mixtureRichness,
  mixtureRoughness,
  SINGLE_MAG_POWER,
  type EngineDrive,
} from "./aircraft";
import { density, KT, oatC, pressureAltitude } from "./environment";

const RHO0 = 1.225;
/** bit order of failureMask() */
export const FAILURE_KEYS: readonly FailureKey[] = [
  "gs",
  "nav1",
  "gps",
  "ap",
  "ahrs",
  "airData",
  "engine",
  "alternator",
  "battery",
  "electricalFire",
  "vacuum",
  "pitotBlocked",
  "pitotIcing",
  "staticBlocked",
  "engineRough",
  "enginePartial",
  "fuelPump",
  "fuelLeak",
  "oilPressure",
  "engineFire",
  "flaps",
  "trimRunaway",
  "comms",
  "xpdr",
  "door",
  "fuelStarvation",
];
/** the active failures as a bit mask (bit i = FAILURE_KEYS[i]); every key of FAILURE_LABELS_EN must be listed
 *  (tests/systems-core.test.ts checks it) */
export function failureMask(
  f: Readonly<Partial<Record<FailureKey, boolean>>>,
): number {
  return (
    (f.gs ? 1 : 0) |
    (f.nav1 ? 2 : 0) |
    (f.gps ? 4 : 0) |
    (f.ap ? 8 : 0) |
    (f.ahrs ? 16 : 0) |
    (f.airData ? 32 : 0) |
    (f.engine ? 64 : 0) |
    (f.alternator ? 128 : 0) |
    (f.battery ? 256 : 0) |
    (f.electricalFire ? 512 : 0) |
    (f.vacuum ? 1024 : 0) |
    (f.pitotBlocked ? 2048 : 0) |
    (f.pitotIcing ? 4096 : 0) |
    (f.staticBlocked ? 8192 : 0) |
    (f.engineRough ? 16384 : 0) |
    (f.enginePartial ? 32768 : 0) |
    (f.fuelPump ? 65536 : 0) |
    (f.fuelLeak ? 131072 : 0) |
    (f.oilPressure ? 262144 : 0) |
    (f.engineFire ? 524288 : 0) |
    (f.flaps ? 1048576 : 0) |
    (f.trimRunaway ? 2097152 : 0) |
    (f.comms ? 4194304 : 0) |
    (f.xpdr ? 8388608 : 0) |
    (f.door ? 16777216 : 0) |
    (f.fuelStarvation ? 33554432 : 0)
  );
}
const PA0 = 101325;

/** Electrical system data (C172S, 28 V). Loads are the nominal currents at 28 V. */
export const ELEC = {
  /** main battery: 24 V lead-acid, 35 Ah nameplate; the charge between full and a dead bus is ≈ 20 % of it in
   *  practice (cold, ageing battery, the voltage knee): ≈ 16 min with every load ON, ≈ 40 min with the loads shed
   *  (measured by tests/systems-core.test.ts). The "30 min" of the C172S NAV III POH is the STANDBY battery below. */
  battAh: 35,
  usableFraction: 0.215,
  /** internal resistance (Ω) */
  battR: 0.02,
  altMaxA: 60,
  regulatedV: 28,
  /** G1000 LOW VOLTS annunciation threshold */
  lowVolts: 24.5,
  /** below this the bus no longer powers the avionics (screens go dark) */
  deadVolts: 20,
  /** G1000 standby battery: feeds the essential bus for at least 30 minutes (C172S NAV III POH section 7,
   *  "standby battery"); modelled as 35 min from full */
  stbyEnduranceS: 35 * 60,
  load: {
    // Bus mapping, simplified and NOT verified against a specific aircraft's POH section 7 / 9 breaker list: on the
    // G1000 the essential bus carries the PFD with its GIA 1 (COM1 / NAV1 / GPS1), the AHRS / ADC and the engine
    // instruments — what the standby battery keeps alive; avionics bus 1 the MFD and the autopilot; bus 2 the second
    // radios. The NAV III POH sheds bus 1 first, then bus 2 (LOW VOLTS / HIGH VOLTS checklists).
    essential: 8, // PFD + GIA 1 (COM1/NAV1/GPS1), transponder, turn coordinator, engine instruments (constant power)
    avionics: 8, // avionics bus 1: MFD, autopilot (classic panel: the GPS too) (constant power)
    avionics2: 4, // avionics bus 2: COM2/NAV2, ADF (constant power)
    pitotHeat: 10,
    landingLight: 8,
    beacon: 2,
    auxPump: 4,
    flaps: 10, // flap motor while it runs
    starter: 120,
  },
};

/** fuel in the lines and the injector servo downstream of the selector, in seconds of cruise flow */
const LINE_FUEL_S = 12;
/** fuel left in the cylinders after IDLE CUT-OFF (s) */
const CYL_FUEL_S = 2;
/** indicated-torque fraction of the enginePartial failure: with friction and the lower RPM the brake power is
 *  ≈ 60 % of normal at full throttle */
const PARTIAL_POWER = 0.72;
/** VSI capillary-leak time constant (s) */
const VSI_LAG_S = 6;
/** usable fuel per tank (gal) */
export const TANK_GAL = 26.5;
/** fuel leak rate of the fuelLeak failure (gal/min) */
export const LEAK_GPM = 0.25;
/** LOW FUEL L / R annunciation threshold (gal usable in the tank) */
export const LOW_FUEL_GAL = 5;

/** static pressure (Pa) at a pressure altitude (ft) — ISA */
export function staticPressure(pAltFt: number): number {
  return PA0 * Math.pow(Math.max(0.05, 1 - 6.87535e-6 * pAltFt), 5.25588);
}
/** pressure altitude (ft) of a static pressure (Pa) */
export function pressureAltOf(p: number): number {
  return (1 - Math.pow(Math.max(1, p) / PA0, 1 / 5.25588)) / 6.87535e-6;
}
const qOfIas = (iasKt: number) => 0.5 * RHO0 * (Math.max(0, iasKt) * KT) ** 2;
const iasOfQ = (q: number) => Math.sqrt((2 * Math.max(0, q)) / RHO0) / KT;

/** tiny local PRNG (mulberry32) — never touches the seeded weather sequence */
function prng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++)
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  let a = h || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const allFlags = (v: boolean): ElecFlags => ({
  pfd: v,
  mfd: v,
  com1: v,
  com2: v,
  nav1: v,
  nav2: v,
  gps: v,
  adf: v,
  xpdr: v,
  ap: v,
  trim: v,
  flaps: v,
  turnCoord: v,
  stallHorn: true,
  pitotHeat: false,
  landingLight: false,
  beacon: false,
  auxPump: false,
});

export function freshReadout(): SystemsState {
  return {
    busVolts: 28,
    battAmps: 0,
    battCharge: 1,
    powered: true,
    avionicsPowered: true,
    vacuumInHg: 5,
    oilPressPsi: 65,
    oilTempF: 185,
    fuelGalL: TANK_GAL,
    fuelGalR: TANK_GAL,
    fuelFlowGph: 0,
    engineRunning: true,
    powerFactor: 1,
    fire: false,
    smoke: false,
    gyroHealth: 1,
    indicated: { iasKt: 0, altFt: 0, vsFpm: 0 },
    comOk: true,
    xpdrOk: true,
    flapsStuck: false,
    annunciators: [],
    gyro: { pitchDeg: 0, rollDeg: 0, hdgDeg: 0 },
    vibration: 0,
    altAmps: 0,
    loadAmps: 0,
    elec: allFlags(true),
    fuelPressOk: true,
    egtF: 1350,
    chtF: 350,
    fireKind: null,
    smokeLevel: 0,
    pitotIce: 0,
    icingConditions: false,
    engineSeized: false,
    starterEngaged: false,
    trimRunning: false,
    doorOpen: false,
    badMag: null,
    essPowered: true,
    stbyBattFeeding: false,
    stbyBattCharge: 1,
  };
}

export class SystemsModel {
  /** the readout (the same object for the whole session: `sim.sys`) */
  readonly r: SystemsState = freshReadout();
  /** engine / airframe inputs fed to the flight model */
  readonly drive: EngineDrive = {
    combustion: true,
    powerFactor: 1,
    roughness: 0,
    starterNm: 0,
    seized: false,
    richness: 1,
    flapsHold: false,
    extraCd: 0,
  };

  // ---- state
  /** failures seen last step (bit i = FAILURE_KEYS[i]) */
  private prevMask = 0;
  private fuelL = TANK_GAL;
  private fuelR = TANK_GAL;
  private lastTotal = 2 * TANK_GAL;
  private lineFuel = LINE_FUEL_S;
  private linesDry = false;
  private cylFuel = CYL_FUEL_S;
  private lastRichness = 1;
  private running = true;
  private battCharge = 1;
  private stbyCharge = 1;
  private vac = 5;
  private gyroHealth = 1;
  private gErr = { pitch: 0, roll: 0, hdg: 0 };
  private topple = 0;
  private gDir = { pitch: 1, roll: 1, hdg: 1 };
  private oilPress = 65;
  private oilTemp = 185;
  private cht = 350;
  private oilFailAt: number | null = null;
  private seizeAt = Infinity;
  private seized = false;
  private engFireHeat = 0;
  private elecFireHeat = 0;
  private elecFireA = 0;
  private smoke = 0;
  private pitotPt0: number | null = null;
  private staticP0: number | null = null;
  private ice = 0;
  private offset = 0;
  private vsJump = 0;
  /** the static-system offset as the VSI's capillary leak has followed it */
  private offLag = 0;
  private lastFlapPos = 0;
  private badMag: "L" | "R" | null = null;
  private seed = "free";
  private failCount = 0;
  private busDeadLogged = false;
  private t = 0;
  private annScratch: Annunciator[] = [];
  /** the annunciators already logged (a light that comes back after going out is logged again) */
  private annLogged: readonly Annunciator[] = [];
  /** false while the flight is being set up: what is lit then is not logged */
  private annPrimed = false;

  /** start of a flight (Sim.load): systems normal, tanks from the aircraft's fuel */
  reset(sim: Sim): void {
    const fresh = freshReadout();
    Object.assign(this.r, fresh);
    this.r.indicated = fresh.indicated;
    this.r.gyro = fresh.gyro;
    this.prevMask = 0;
    const total = Math.max(0, sim.ac.s.fuelGal);
    this.fuelL = this.fuelR = total / 2;
    this.lastTotal = total;
    this.lineFuel = LINE_FUEL_S;
    this.linesDry = false;
    this.cylFuel = CYL_FUEL_S;
    this.running = true;
    this.battCharge = 1;
    this.stbyCharge = 1;
    this.vac = 5;
    this.gyroHealth = 1;
    this.gErr = { pitch: 0, roll: 0, hdg: 0 };
    this.topple = 0;
    this.oilPress = 65;
    this.oilTemp = sim.ac.s.onGround ? 165 : 185;
    this.cht = sim.ac.s.onGround ? 300 : 350;
    this.oilFailAt = null;
    this.seizeAt = Infinity;
    this.seized = false;
    this.engFireHeat = this.elecFireHeat = this.elecFireA = this.smoke = 0;
    this.pitotPt0 = this.staticP0 = null;
    this.ice = 0;
    this.offset = this.offLag = this.vsJump = 0;
    this.lastFlapPos = sim.ac.s.flapPos;
    this.badMag = null;
    this.seed = sim.scenario?.id ?? "free";
    this.failCount = 0;
    this.busDeadLogged = false;
    this.t = 0;
    this.annLogged = [];
    this.annPrimed = false;
    Object.assign(this.drive, {
      combustion: true,
      powerFactor: 1,
      roughness: 0,
      starterNm: 0,
      seized: false,
      richness: 1,
      flapsHold: false,
      extraCd: 0,
    });
  }

  /** Fuel-starvation set-up, at the start of a drill (before the pilot flies): the selector was left on one tank
   *  that holds about `runDryS` seconds of fuel at the cruise burn, so it runs dry by itself — LOW FUEL is lit
   *  from the start, as in the real mismanagement (FAA-H-8083-3C ch.18). The injection later only takes the
   *  residual. Returns the tank. */
  prepareStarvation(sim: Sim, runDryS: number): "LEFT" | "RIGHT" {
    const tank: "LEFT" | "RIGHT" = this.rnd("starvationSetup")() < 0.5 ? "LEFT" : "RIGHT";
    // C172S at 65–75 % power: ≈ 9 gph (POH section 5 cruise table, rounded)
    const gal = Math.max(0.1, (9 * Math.max(0, runDryS)) / 3600);
    if (tank === "LEFT") this.fuelL = Math.min(this.fuelL, gal);
    else this.fuelR = Math.min(this.fuelR, gal);
    sim.ac.s.fuelGal = this.fuelL + this.fuelR;
    this.lastTotal = sim.ac.s.fuelGal;
    if (sim.sw) sim.sw.fuelSelector = tank;
    return tank;
  }

  private rnd(key: string): () => number {
    return prng(`${this.seed}|${key}|${this.failCount++}`);
  }

  /** a failure just appeared (instructor, scenario, random) */
  private onFail(k: FailureKey, sim: Sim) {
    const ac = sim.ac;
    const pAlt = pressureAltitude(ac.s.altFt, sim.weather.qnh);
    switch (k) {
      case "engineRough":
        this.badMag = this.rnd(k)() < 0.5 ? "L" : "R";
        break;
      case "oilPressure":
        this.oilFailAt = sim.time;
        this.seizeAt = sim.time + 480 + 240 * this.rnd(k)(); // 8–12 min
        break;
      case "pitotBlocked":
        this.pitotPt0 = staticPressure(pAlt) + qOfIas(ac.data.iasKt);
        break;
      case "staticBlocked":
        this.staticP0 = staticPressure(pAlt);
        break;
      case "vacuum": {
        const r = this.rnd(k);
        this.gDir = {
          roll: r() < 0.5 ? -1 : 1,
          pitch: r() < 0.5 ? -1 : 1,
          hdg: r() < 0.5 ? -1 : 1,
        };
        break;
      }
      case "trimRunaway":
        if (sim.ap.ap) sim.ap.disconnect();
        break;
      case "fuelStarvation": {
        // The injection never moves a control (the selector) and never empties a tank the pilot can see full: the
        // cause was set up before the flight (prepareStarvation: the selector left on one tank holding a few
        // minutes of fuel, LOW FUEL already lit), and the tank simply runs out about now. What is left of that
        // tank (a residual by design) goes; with the selector on BOTH nothing can starve the engine.
        const sel = sim.sw?.fuelSelector;
        if (sel === "LEFT" || sel === "RIGHT") {
          if (sel === "LEFT") this.fuelL = 0;
          else this.fuelR = 0;
          sim.ac.s.fuelGal = this.fuelL + this.fuelR;
          this.lastTotal = sim.ac.s.fuelGal;
          // the lines still hold a few seconds of fuel: the engine quits once they run dry
          this.lineFuel = Math.min(this.lineFuel, 4);
        }
        break;
      }
      default:
        break;
    }
  }

  /** the instructor cleared a failure: the system is repaired */
  private onRestore(k: FailureKey) {
    switch (k) {
      case "engineRough":
        this.badMag = null;
        break;
      case "oilPressure":
        this.oilFailAt = null;
        this.seizeAt = Infinity;
        this.seized = false;
        break;
      case "pitotBlocked":
        this.pitotPt0 = null;
        break;
      case "pitotIcing":
        this.ice = 0;
        break;
      case "staticBlocked":
        this.staticP0 = null;
        break;
      case "engineFire":
        this.engFireHeat = 0;
        break;
      case "electricalFire":
        this.elecFireHeat = 0;
        this.elecFireA = 0;
        break;
      default:
        break;
    }
  }

  /** fuel quantities: distribute what the engine burned over the selected tanks; follow outside changes */
  private tanks(sim: Sim, dt: number) {
    const s = sim.ac.s;
    const burned = this.lastTotal - s.fuelGal;
    if (burned < -1e-6 || burned > 0.5) {
      // refuelled, emptied or a new aircraft: keep the L/R ratio
      const tot = this.fuelL + this.fuelR;
      if (tot > 0.01) {
        const k = s.fuelGal / tot;
        this.fuelL *= k;
        this.fuelR *= k;
      } else this.fuelL = this.fuelR = s.fuelGal / 2;
    } else if (burned > 0) {
      const sel = sim.sw.fuelSelector;
      let fromL = sel === "LEFT" ? burned : sel === "RIGHT" ? 0 : burned / 2;
      let fromR = burned - fromL;
      if (fromL > this.fuelL)
        ((fromR += fromL - this.fuelL), (fromL = this.fuelL));
      if (fromR > this.fuelR)
        ((fromL += fromR - this.fuelR), (fromR = this.fuelR));
      this.fuelL = Math.max(0, this.fuelL - fromL);
      this.fuelR = Math.max(0, this.fuelR - fromR);
    }
    if (sim.failures.fuelLeak && dt > 0)
      this.fuelL = Math.max(0, this.fuelL - (LEAK_GPM / 60) * dt);
    s.fuelGal = this.fuelL + this.fuelR;
    this.lastTotal = s.fuelGal;
  }

  step(dt: number, sim: Sim): void {
    const ac = sim.ac;
    const s = ac.s;
    const d = ac.data;
    if (!d) return;
    const sw: Switches = sim.sw ?? defaultSwitches();
    const f = sim.failures;
    const r = this.r;
    const w = sim.weather;
    this.t += dt;

    // ---- failure edges (setFailure, scenario scripts, or a direct write to sim.failures): a bit mask read with
    // literal property names (monomorphic, no per-key lookups) tells at once whether anything changed
    const mask = failureMask(f);
    if (mask !== this.prevMask) {
      for (let i = 0; i < FAILURE_KEYS.length; i++) {
        const bit = 1 << i;
        if ((mask & bit) !== (this.prevMask & bit)) {
          const k = FAILURE_KEYS[i];
          if (mask & bit) this.onFail(k, sim);
          else this.onRestore(k);
        }
      }
      this.prevMask = mask;
    }

    const pAlt = pressureAltitude(s.altFt, w.qnh);
    const sigma = density(pAlt, w.oatSeaLevelC) / RHO0;
    const oat = oatC(s.altFt, w.oatSeaLevelC);
    const rpm = s.rpm;

    // ================================================================ fuel
    this.tanks(sim, dt);
    const valveOpen = sw.fuelSelector !== "OFF" && sw.fuelShutoff;
    const tankFuel =
      sw.fuelSelector === "LEFT"
        ? this.fuelL > 0.02
        : sw.fuelSelector === "RIGHT"
          ? this.fuelR > 0.02
          : this.fuelL + this.fuelR > 0.02;

    // ================================================================ electrical (needs the previous engine state)
    // the G1000 cockpits (and the airliner, which shares the C172 systems) have the split avionics rocker, the
    // essential bus and the standby battery; the classic panel has one avionics master and no standby battery
    const glass = (sim.cockpit ?? "g1000") !== "steam";
    const ld = ELEC.load;
    const batAvail = sw.batMaster && !f.battery && this.battCharge > 0;
    const altOnline =
      sw.batMaster && sw.altMaster && !f.alternator && rpm > 350;
    const altCap = altOnline
      ? ELEC.altMaxA * Math.min(1, Math.max(0, (rpm - 350) / 600))
      : 0;
    const busOn = sw.batMaster && (batAvail || altCap > 1);
    const starterReq =
      sw.magnetos === "START" &&
      rpm < 300 &&
      sw.batMaster &&
      !f.battery &&
      this.battCharge > 0.03;
    const flapsMoving = Math.abs(s.flapPos - this.lastFlapPos) > 1e-5;
    this.lastFlapPos = s.flapPos;
    // avionics bus 2 switch: its own rocker on the G1000, the single avionics master on the classic panel
    const bus2Sw = glass ? sw.avionics2 : sw.avionics;
    // electrical fire: the fault sits on one consumer of avionics bus 2 (a shorted radio): it is fed while that bus
    // is powered. Restoring the power one bus at a time (POH: master, STBY BATT, avionics bus 1, bus 2) finds it.
    const elecFireFed =
      !!f.electricalFire &&
      busOn &&
      bus2Sw &&
      r.busVolts > ELEC.deadVolts - 2;
    // solve the bus voltage: constant-power avionics, resistive lights / heat
    let V = r.busVolts > 5 ? r.busVolts : 26;
    let load = 0;
    let battI = 0; // + = discharging
    let altI = 0;
    for (let it = 0; it < 3; it++) {
      if (!busOn) {
        V = 0;
        load = battI = altI = 0;
        break;
      }
      const vk = Math.max(18, V);
      // constant-power loads draw more current as the voltage falls, resistive ones less
      const cp = ELEC.regulatedV / vk;
      const rs = vk / ELEC.regulatedV;
      load =
        ld.essential * cp +
        (sw.avionics ? ld.avionics * cp : 0) +
        (bus2Sw ? ld.avionics2 * cp : 0) +
        (sw.pitotHeat ? ld.pitotHeat * rs : 0) +
        (sw.landingLight ? ld.landingLight * rs : 0) +
        (sw.beacon ? ld.beacon * rs * 0.6 : 0) +
        (sw.auxPump ? ld.auxPump * rs : 0) +
        (flapsMoving ? ld.flaps : 0) +
        (elecFireFed ? this.elecFireA : 0);
      if (starterReq) load += ld.starter * (1 - Math.min(1, rpm / 320) * 0.5);
      const charge = batAvail
        ? Math.min(25, 0.8 + (1 - this.battCharge) * 60)
        : 0;
      if (altCap > 1 && altCap >= load + (batAvail ? 0.5 : 0)) {
        V = ELEC.regulatedV;
        altI = Math.min(altCap, load + charge);
        battI = -(altI - load);
      } else if (batAvail) {
        altI = altCap;
        battI = load - altCap;
        V = this.battVolts(battI);
      } else {
        // alternator alone, overloaded (or nothing): the voltage collapses with the overload
        altI = altCap;
        V =
          altCap > 1
            ? ELEC.regulatedV * Math.min(1, altCap / Math.max(1, load))
            : 0;
        battI = 0;
      }
    }
    if (dt > 0 && batAvail) {
      this.battCharge = Math.min(
        1,
        Math.max(
          0,
          this.battCharge -
            (battI * dt) / 3600 / (ELEC.battAh * ELEC.usableFraction),
        ),
      );
    }
    const powered = busOn && V > ELEC.deadVolts;
    const avionicsPowered = powered && sw.avionics;
    const bus2Powered = powered && bus2Sw;
    // G1000 essential bus (PFD, AHRS / ADC, COM1 / NAV1): fed by the main bus, else by the standby battery while
    // STBY BATT is ARM — also with the master OFF, which is why the POH fire and forced-landing checklists say
    // "STBY BATT — OFF" before "MASTER — OFF" (C172S NAV III POH section 3)
    const stbyAvail = glass && sw.stbyBatt && this.stbyCharge > 0;
    const stbyFeeding = !powered && stbyAvail;
    const essPowered = powered || stbyFeeding;
    if (dt > 0) {
      if (stbyFeeding)
        this.stbyCharge = Math.max(
          0,
          this.stbyCharge - dt / ELEC.stbyEnduranceS,
        );
      else if (powered && altCap > 1 && sw.stbyBatt)
        this.stbyCharge = Math.min(1, this.stbyCharge + dt / 7200);
    }
    const elec = r.elec; // updated in place: no allocation per frame
    elec.pfd = elec.com1 = elec.nav1 = essPowered;
    elec.xpdr = elec.flaps = elec.turnCoord = powered;
    elec.mfd = avionicsPowered;
    // G1000: GPS1 is in the GIA 1 on the essential bus; the classic panel's GPS navigator is on the avionics master
    elec.gps = glass ? essPowered : avionicsPowered;
    elec.com2 = elec.nav2 = elec.adf = bus2Powered;
    elec.ap = avionicsPowered && sw.trimCb;
    elec.trim = powered && sw.trimCb;
    elec.stallHorn = true;
    elec.pitotHeat = powered && sw.pitotHeat;
    elec.landingLight = powered && sw.landingLight;
    elec.beacon = powered && sw.beacon;
    elec.auxPump = powered && sw.auxPump;
    if (dt > 0) {
      if (!powered && r.powered && sw.batMaster) {
        if (!this.busDeadLogged)
          sim.rec.log(
            sim.time,
            "info",
            "Electrical bus dead: avionics off",
            "Barre électrique hors tension : avionique éteinte",
          );
        this.busDeadLogged = true;
      } else if (powered) this.busDeadLogged = false;
    }

    // ================================================================ fuel pressure, engine
    const mechPump = !f.fuelPump && rpm > 350;
    const fuelPressOk = mechPump || elec.auxPump;
    const supply = valveOpen && tankFuel && fuelPressOk && s.fuelGal > 0;
    if (dt > 0) {
      // refill: the aux pump primes faster than a windmilling engine-driven pump
      if (supply)
        this.lineFuel = Math.min(
          LINE_FUEL_S,
          this.lineFuel + dt * (elec.auxPump ? 2 : 1),
        );
      else if (this.running)
        this.lineFuel = Math.max(
          0,
          this.lineFuel - dt * Math.max(0.3, d.fuelFlowGph / 8.5),
        );
      // once the lines ran dry they must be primed again (vapour, air) before the engine fires: a few seconds
      if (this.lineFuel <= 0) this.linesDry = true;
      else if (this.lineFuel >= 4) this.linesDry = false;
    }
    const auxFlood = elec.auxPump && mechPump; // aux pump ON with a working engine pump: excessively rich
    const richCmd =
      this.lineFuel > 0 && !this.linesDry
        ? mixtureRichness(sw.mixture, sigma, auxFlood)
        : 0;
    if (richCmd > 0) {
      this.cylFuel = CYL_FUEL_S;
      this.lastRichness = richCmd;
    } else if (dt > 0) this.cylFuel = Math.max(0, this.cylFuel - dt);
    const richness =
      richCmd > 0 ? richCmd : this.cylFuel > 0 ? this.lastRichness : 0;

    // ignition: magnetos are self-powered — the engine runs with the masters OFF
    const mags = sw.magnetos;
    const ignition = mags !== "OFF";
    let magPf = mags === "L" || mags === "R" ? SINGLE_MAG_POWER : 1;
    let rough = 0;
    if (f.engineRough && this.badMag) {
      const good = this.badMag === "L" ? "R" : "L";
      if (mags === "BOTH" || mags === "START") ((magPf = 0.8), (rough = 0.45));
      else if (mags === good) ((magPf = 0.95), (rough = 0));
      else if (mags === this.badMag) ((magPf = 0.2), (rough = 0.9));
    }
    const mixPf = mixturePower(richness);
    rough = Math.max(rough, mixtureRoughness(richness));
    let pf = magPf * mixPf * (f.enginePartial ? PARTIAL_POWER : 1);

    // oil: pressure from the engine pump, temperature from the power
    const loadFrac = Math.max(0, Math.min(1.1, ac.bhp / 180));
    const sinceOil = this.oilFailAt !== null ? sim.time - this.oilFailAt : null;
    if (sinceOil !== null && this.seizeAt < Infinity) {
      const toSeize = this.seizeAt - sim.time;
      if (toSeize < 90 && !this.seized) {
        const k = 1 - Math.max(0, toSeize) / 90;
        pf *= 1 - 0.35 * k;
        rough = Math.max(rough, 0.6 * k);
      }
      if (toSeize <= 0 && !this.seized && dt > 0) {
        this.seized = true;
        sim.rec.log(
          sim.time,
          "info",
          "Engine seized (oil starvation)",
          "Serrage moteur (manque d’huile)",
        );
      }
    }

    const combustionOk =
      !f.engine &&
      !this.seized &&
      ignition &&
      richness > 0 &&
      mixPf > 0.02 &&
      s.fuelGal > 0;
    const wasRunning = this.running;
    if (!combustionOk) this.running = false;
    else if (rpm > 150) this.running = true;
    if (this.running && rpm < 60) this.running = false;
    if (dt > 0 && wasRunning !== this.running) {
      const [en, fr]: [string, string] = this.running
        ? rpm < 300
          ? ["Engine started", "Moteur démarré"]
          : [
              "Engine restarted (windmilling)",
              "Moteur redémarré (hélice en moulinet)",
            ]
        : f.engine
          ? ["Engine stopped (engine failure)", "Moteur arrêté (panne moteur)"]
          : this.seized
            ? ["Engine stopped (seized)", "Moteur arrêté (serrage)"]
            : !ignition
              ? [
                  "Engine stopped (magnetos OFF)",
                  "Moteur arrêté (magnétos sur ARRÊT)",
                ]
              : sw.mixture < 0.06
                ? [
                    "Engine stopped (mixture idle cut-off)",
                    "Moteur arrêté (mélange sur étouffoir)",
                  ]
                : s.fuelGal <= 0 ||
                    ((this.lineFuel <= 0 || this.linesDry) &&
                      valveOpen &&
                      !tankFuel)
                  ? [
                      "Engine stopped (fuel starvation: selected tank empty)",
                      "Moteur arrêté (panne sèche : réservoir sélectionné vide)",
                    ]
                  : (this.lineFuel <= 0 || this.linesDry) && !valveOpen
                    ? [
                        "Engine stopped (fuel shut off)",
                        "Moteur arrêté (carburant coupé)",
                      ]
                    : this.lineFuel <= 0 || this.linesDry
                      ? [
                          "Engine stopped (fuel starvation: no fuel pressure)",
                          "Moteur arrêté (désamorçage : pas de pression carburant)",
                        ]
                      : combustionOk
                        ? [
                            "Engine stopped (RPM too low)",
                            "Moteur arrêté (régime trop bas)",
                          ]
                        : [
                            "Engine stopped (mixture too lean)",
                            "Moteur arrêté (mélange trop pauvre)",
                          ];
      sim.rec.log(sim.time, "info", en, fr);
    }
    const starterEngaged = starterReq && (batAvail || powered);
    const drive = this.drive;
    drive.combustion = this.running;
    drive.powerFactor = Math.max(0, pf);
    drive.roughness = this.running ? Math.min(1, rough) : 0;
    drive.starterNm =
      starterEngaged && V > 16 ? 95 * Math.max(0, 1 - rpm / 340) : 0;
    drive.seized = this.seized;
    drive.richness = Math.max(0.3, richness);
    drive.flapsHold = !!f.flaps || !elec.flaps;
    drive.extraCd = f.door ? 0.002 : 0;
    ac.drive = drive;

    if (dt > 0) {
      const pNorm = rpm > 100 ? Math.min(85, 20 + rpm * 0.02) : 0;
      let pTgt = pNorm;
      if (sinceOil !== null)
        pTgt = Math.min(
          pNorm,
          Math.max(
            10,
            pNorm * (1 - sinceOil / 60) + 10 * Math.min(1, sinceOil / 60),
          ),
        );
      if (this.seized) pTgt = 0;
      this.oilPress += (pTgt - this.oilPress) * Math.min(1, dt / 3);
      const ambF = oat * 1.8 + 32;
      let tTgt = this.running
        ? 135 + 85 * loadFrac + (oat - 15) * 0.6
        : ambF + Math.max(0, this.oilTemp - ambF) * 0.9;
      if (sinceOil !== null) tTgt += 95 * Math.min(1, sinceOil / 360);
      this.oilTemp += (tTgt - this.oilTemp) * Math.min(1, dt / 90);
      let cTgt = this.running
        ? 200 +
          230 * loadFrac +
          (oat - 15) * 0.8 -
          40 * Math.max(0, richness - 1)
        : ambF;
      if (sinceOil !== null) cTgt += 60 * Math.min(1, sinceOil / 300);
      this.cht += (cTgt - this.cht) * Math.min(1, dt / 60);
    }

    // ================================================================ fire & smoke
    if (dt > 0) {
      // engine fire: fed by fuel until mixture IDLE CUT-OFF, fuel valve closed and aux pump OFF
      const engFed =
        !!f.engineFire && !(sw.mixture < 0.06 && !valveOpen && !sw.auxPump);
      if (f.engineFire) {
        const was = this.engFireHeat > 0;
        // starved of fuel it dies in ≈ 15 s at the POH 100 KIAS; slower it lingers, faster the airflow blows it out
        const blow = Math.max(0.4, Math.min(1.4, d.iasKt / 100));
        if (engFed) this.engFireHeat = Math.min(1, this.engFireHeat + dt / 3);
        else
          this.engFireHeat = Math.max(0, this.engFireHeat - (dt / 15) * blow);
        if (was && this.engFireHeat <= 0)
          sim.rec.log(sim.time, "good", "Engine fire out", "Feu moteur éteint");
      }
      if (f.electricalFire) {
        const was = this.elecFireHeat > 0;
        if (elecFireFed) {
          this.elecFireHeat = Math.min(1, this.elecFireHeat + dt / 5);
          this.elecFireA = Math.min(30, this.elecFireA + 1.5 * dt);
        } else this.elecFireHeat = Math.max(0, this.elecFireHeat - dt / 10);
        if (!elecFireFed) this.elecFireA = Math.max(0, this.elecFireA - 5 * dt);
        if (was && this.elecFireHeat <= 0)
          sim.rec.log(
            sim.time,
            "good",
            "Electrical fire out",
            "Feu électrique éteint",
          );
      }
      const smokeTgt = Math.max(
        this.elecFireHeat * 0.9,
        this.engFireHeat * (sw.cabinHeat ? 0.85 : 0.25),
      );
      this.smoke +=
        (smokeTgt - this.smoke) *
        Math.min(1, dt / (smokeTgt > this.smoke ? 12 : 40));
    }
    const fireKind =
      this.engFireHeat > 0
        ? "engine"
        : this.elecFireHeat > 0
          ? "electrical"
          : null;

    // ================================================================ vacuum & steam gyros
    if (dt > 0) {
      const vTgt = f.vacuum || rpm <= 0 ? 0 : 5.3 * (1 - Math.exp(-rpm / 550));
      this.vac += (vTgt - this.vac) * Math.min(1, dt / 2);
      if (this.vac >= 3.5)
        this.gyroHealth = Math.min(1, this.gyroHealth + dt / 90);
      else if (this.vac < 3.0)
        this.gyroHealth = Math.max(0, this.gyroHealth - dt / 240);
      const k = Math.max(0, (0.6 - this.gyroHealth) / 0.6);
      if (k > 0) {
        // the rotor slows: precession errors grow (attitude a few degrees a minute, the DG wanders)
        this.gErr.roll += this.gDir.roll * 0.14 * k * dt;
        this.gErr.pitch += this.gDir.pitch * 0.05 * k * dt;
        this.gErr.hdg += this.gDir.hdg * 0.6 * k * dt;
      } else if (this.gyroHealth > 0.8) {
        // erecting again (vacuum restored)
        const e = Math.min(1, dt * 0.05);
        this.gErr.roll -= this.gErr.roll * e;
        this.gErr.pitch -= this.gErr.pitch * e;
        this.gErr.hdg -= this.gErr.hdg * e * 0.5;
      }
      if (this.gyroHealth <= 0)
        this.topple = Math.min(1, this.topple + dt / 15);
      else if (this.gyroHealth > 0.6)
        this.topple = Math.max(0, this.topple - dt / 30);
      if (this.topple > 0)
        this.gErr.hdg += this.gDir.hdg * 1.5 * this.topple * dt; // a toppled DG spins
    }
    const tp = this.topple;
    const toppledRoll = this.gDir.roll * (55 + 12 * Math.sin(0.07 * this.t));
    const toppledPitch =
      this.gDir.pitch * (9 + 4 * Math.sin(0.11 * this.t + 1));
    const gyro = r.gyro; // in place: no allocation per frame
    gyro.pitchDeg =
      (d.pitchDeg + this.gErr.pitch) * (1 - tp) + toppledPitch * tp;
    gyro.rollDeg = (d.rollDeg + this.gErr.roll) * (1 - tp) + toppledRoll * tp;
    gyro.hdgDeg = (((d.hdgTrue + this.gErr.hdg) % 360) + 360) % 360;

    // ================================================================ pitot-static
    const inCloud =
      w.ceilingFt < 15000 && s.altFt > w.ceilingFt && s.altFt < w.cloudTopFt;
    const icingConditions =
      !!f.pitotIcing || (inCloud && oat <= 3 && oat >= -20);
    if (dt > 0) {
      if (elec.pitotHeat) this.ice = Math.max(0, this.ice - dt / 30);
      else if (f.pitotIcing) this.ice = Math.min(1, this.ice + dt / 60);
    }
    const baroAlt = s.altFt + (sim.av.baro - w.qnh) * 1000;
    const pitotFault = this.pitotPt0 !== null || this.ice > 0;
    const staticFault = this.staticP0 !== null;
    const ind = r.indicated;
    if (
      !pitotFault &&
      !staticFault &&
      !sw.altStatic &&
      Math.abs(this.offset) < 0.5
    ) {
      this.offset = this.offLag = this.vsJump = 0;
      ind.iasKt = d.iasKt;
      ind.altFt = baroAlt;
      ind.vsFpm = d.vsFpm;
    } else {
      const Ps = staticPressure(pAlt);
      // the source the instruments see: alternate static (cabin) cures a blocked port, with its small error
      const altSrc = sw.altStatic;
      const Psrc = altSrc ? Ps : (this.staticP0 ?? Ps);
      const Pt = this.pitotPt0 ?? Ps + qOfIas(d.iasKt);
      let ias = iasOfQ(Pt - Psrc);
      const iceK = this.ice * this.ice * (3 - 2 * this.ice);
      ias *= 1 - iceK;
      if (altSrc) ias += 2;
      const offTgt = pressureAltOf(Psrc) - pAlt + (altSrc ? 50 : 0);
      // a blocked port: the instruments see exactly the trapped pressure (frozen altimeter); the alternate source
      // reaches the instruments through the cabin in about a second
      if (staticFault && !altSrc) this.offset = offTgt;
      else if (dt > 0) this.offset += (offTgt - this.offset) * Math.min(1, dt / 1.0);
      // the VSI senses the change of its static pressure through a calibrated leak (≈ 6 s): a sudden step of the
      // static source (ALT STATIC opened) shows as a brief climb of a few hundred fpm that dies out in seconds
      if (dt > 0)
        this.offLag +=
          (this.offset - this.offLag) * Math.min(1, dt / VSI_LAG_S);
      this.vsJump = ((this.offset - this.offLag) / VSI_LAG_S) * 60;
      const frozen = staticFault && !altSrc;
      const vs = frozen
        ? 0
        : Math.max(-2000, Math.min(2000, d.vsFpm + this.vsJump));
      ind.iasKt = Math.max(0, ias);
      ind.altFt = baroAlt + this.offset;
      ind.vsFpm = vs;
    }

    // ================================================================ trim, radios
    const trimRunning = !!f.trimRunaway && elec.trim;
    if (trimRunning && dt > 0) {
      // a GA trim servo runs slowly: full travel in ≈ 16 s, nose down (audit: 10–20 s is realistic; at 8 s the
      // runaway could not be held on a keyboard or touch yoke while pulling the breaker)
      sim.controls.trim = Math.max(-1, sim.controls.trim - (2 / 16) * dt);
      if (sim.ap.ap) sim.ap.disconnect();
    }

    // ================================================================ readout
    const prevAnn = r.annunciators;
    const annunciators = this.annScratch; // reused: a new array is published only when the list changes
    annunciators.length = 0;
    // only the real C172S annunciations (systemsTypes.ts Annunciator): no FIRE, SMOKE, DOOR or FUEL PRESS light.
    // On the G1000 they are shown by the PFD, which the standby battery keeps alive with the main bus dead.
    if (essPowered) {
      if (V < ELEC.lowVolts || !powered) annunciators.push("LOW VOLTS");
      if (this.oilPress < 20) annunciators.push("OIL PRESSURE");
      if (this.vac < 3.5) annunciators.push("LOW VACUUM"); // C172S: below 3.5 inHg
      // LOW FUEL L / R: ≈ 5 gal usable in the tank (C172S NAV III POH section 7 — verify on your serial)
      if (this.fuelL < LOW_FUEL_GAL) annunciators.push("LOW FUEL L");
      if (this.fuelR < LOW_FUEL_GAL) annunciators.push("LOW FUEL R");
      if (icingConditions && !elec.pitotHeat && powered)
        annunciators.push("PITOT HEAT OFF");
      if (stbyFeeding) annunciators.push("STBY BATT");
    }
    // the readout object is updated in place (no per-frame allocation)
    r.busVolts = busOn ? V : 0;
    r.battAmps = batAvail ? -battI : 0;
    r.battCharge = this.battCharge;
    r.powered = powered;
    r.avionicsPowered = avionicsPowered;
    r.vacuumInHg = this.vac;
    r.oilPressPsi = this.oilPress;
    r.oilTempF = this.oilTemp;
    r.fuelGalL = this.fuelL;
    r.fuelGalR = this.fuelR;
    r.fuelFlowGph = d.fuelFlowGph;
    r.engineRunning = this.running;
    r.powerFactor = this.running ? drive.powerFactor : 0;
    r.fire = fireKind !== null;
    r.smoke = this.smoke > 0.2;
    r.gyroHealth = this.gyroHealth;
    r.comOk = !f.comms && elec.com1;
    r.xpdrOk = !f.xpdr && elec.xpdr;
    r.flapsStuck = !!f.flaps;
    r.vibration = this.running ? Math.min(1, rough) : 0;
    r.altAmps = altI;
    r.loadAmps = load;
    r.fuelPressOk = fuelPressOk;
    r.egtF = this.running
      ? egtF(richness, loadFrac)
      : Math.max(oat * 1.8 + 32, r.egtF - (dt > 0 ? dt * 8 : 0));
    r.chtF = this.cht;
    r.fireKind = fireKind;
    r.smokeLevel = this.smoke;
    r.pitotIce = this.ice;
    r.icingConditions = icingConditions;
    r.engineSeized = this.seized;
    r.starterEngaged = starterEngaged;
    r.trimRunning = trimRunning;
    r.doorOpen = !!f.door;
    r.badMag = this.badMag;
    r.essPowered = essPowered;
    r.stbyBattFeeding = stbyFeeding;
    r.stbyBattCharge = this.stbyCharge;
    let same = annunciators.length === prevAnn.length;
    for (let i = 0; same && i < annunciators.length; i++)
      same = annunciators[i] === prevAnn[i];
    // a new list only when it changed: an unchanged list stays the same array object for its readers
    if (!same) r.annunciators = annunciators.slice();
    // what is lit while the flight is set up (until Sim.load calls flightReady) is not logged; later changes
    // are, at the next running step
    if (!this.annPrimed) this.annLogged = r.annunciators;
    else if (dt > 0 && r.annunciators !== this.annLogged) {
      const cur = r.annunciators;
      const added = cur.filter((a) => !this.annLogged.includes(a));
      if (added.length)
        sim.rec.log(
          sim.time,
          "info",
          `Annunciator: ${added.join(", ")}`,
          `Voyant : ${added.join(", ")}`,
        );
      this.annLogged = cur;
    }
  }

  /** the flight is set up (end of Sim.load): from now on new annunciations are logged */
  flightReady(): void {
    this.annLogged = this.r.annunciators;
    this.annPrimed = true;
  }

  /** battery terminal voltage for a discharge current (A, + = discharging) */
  private battVolts(iDis: number): number {
    const c = this.battCharge;
    const knee = 4 * Math.max(0, (0.15 - c) / 0.15) ** 2;
    return Math.max(0, 21.0 + 3.6 * c - knee - iDis * ELEC.battR);
  }

  /** indicated − true altitude (ft) the static system adds (Sim.indicatedAlt) */
  get altOffsetFt(): number {
    return this.offset;
  }
  /** tank quantities */
  get tanksGal(): { L: number; R: number } {
    return { L: this.fuelL, R: this.fuelR };
  }
  /** set the fuel load (gal per tank), e.g. a drill starting with one tank nearly empty */
  setTanks(sim: Sim, L: number, R: number): void {
    this.fuelL = Math.max(0, Math.min(TANK_GAL, L));
    this.fuelR = Math.max(0, Math.min(TANK_GAL, R));
    sim.ac.s.fuelGal = this.fuelL + this.fuelR;
    this.lastTotal = sim.ac.s.fuelGal;
  }
  /** engine state for a scenario that starts on the ground with the engine off (cold and dark) */
  setEngineOff(sim: Sim): void {
    this.running = false;
    sim.ac.s.rpm = 0;
    this.oilPress = 0;
    this.vac = 0; // no vacuum before the start: the steam gyros spin up after it
    const ambF = oatC(sim.ac.s.altFt, sim.weather.oatSeaLevelC) * 1.8 + 32;
    this.oilTemp = this.cht = ambF; // a cold engine
    this.r.egtF = ambF;
    this.drive.combustion = false;
    sim.ac.drive = this.drive;
  }
}
