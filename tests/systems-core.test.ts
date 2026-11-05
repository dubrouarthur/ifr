// systems-core: every FailureKey shows its symptom and the documented POH cure works (or does not, for the
// incurable ones); electrical endurance with / without load shedding; fuel burn per tank; restart after fuel
// starvation; pitot icing cured by heat; alternate static error.
// SYS_REPORT=1 npx vitest run tests/systems-core.test.ts --silent=false prints the numbers.
import { afterAll, describe, expect, it, vi } from "vitest";
import { FAILURE_LABELS, noFailures, SCENARIOS, Sim } from "../src/sim/sim";
import {
  ELEC,
  FAILURE_KEYS,
  failureMask,
  staticPressure,
  pressureAltOf,
} from "../src/sim/systems";
import {
  ANNUNCIATOR_LEVEL,
  FAILURE_GROUPS,
  FAILURE_LABELS_EN,
  FAILURE_LABELS_FR,
  SWITCH_LABELS_FR,
  switchValueText,
  type FailureKey,
} from "../src/sim/systemsTypes";
import { mixturePower, mixtureRichness } from "../src/sim/aircraft";
import { seedSim, simRandom } from "../src/sim/rng";
import { DEG } from "../src/nav/geo";

// several tests fly 10–20 simulated minutes (≈ 1 s alone): leave room on a loaded machine
vi.setConfig({ testTimeout: 30_000 });

const REPORT: string[] = [];
const note = (s: string) => REPORT.push(s);
afterAll(() => {
  if (process.env.SYS_REPORT) console.log("\n" + REPORT.join("\n"));
});

const ALL_KEYS = Object.keys(FAILURE_LABELS_EN) as FailureKey[];

function calm(s: Sim) {
  Object.assign(s.weather, {
    windKt: 0,
    gustKt: 0,
    turbulence: 0,
    shearKt: 0,
    ceilingFt: 20000,
    visibilitySm: 10,
  });
  s.weather.aloft = [{ altFt: 3000, dir: 270, kt: 0 }];
}
/** 5500 ft, 105 KIAS, clear and calm */
function cruise(): Sim {
  const s = new Sim();
  s.load(SCENARIOS.find((x) => x.id === "free")!);
  calm(s);
  return s;
}
/** lined up on PARD 27, engine idling */
function onRunway(): Sim {
  const s = new Sim();
  s.load(SCENARIOS.find((x) => x.id === "rwy27")!);
  calm(s);
  s.controls.brake = 1;
  return s;
}
const run = (s: Sim, sec: number, f?: (t: number) => void, dt = 0.05) => {
  for (let t = 0; t < sec - 1e-9; t += dt) {
    s.step(dt);
    f?.(t + dt);
  }
};
/** time (s) until `cond` first holds while running, NaN if never */
function until(
  s: Sim,
  sec: number,
  cond: () => boolean,
  f?: () => void,
  dt = 0.05,
): number {
  for (let t = 0; t < sec; t += dt) {
    f?.();
    s.step(dt);
    if (cond()) return t + dt;
  }
  return NaN;
}
/** minimal pilot: wings level, pitch for an airspeed (glide) or for a vertical speed toward an altitude */
class Pilot {
  pitch: number;
  constructor(public s: Sim) {
    this.pitch = s.ac.data.pitchDeg;
  }
  fly(o: { ias?: number; alt?: number }) {
    const s = this.s;
    const a = s.ac.s;
    const d = s.ac.data;
    if (o.ias !== undefined) this.pitch += -0.008 * (o.ias - d.iasKt);
    else if (o.alt !== undefined) {
      const vsT = Math.max(-700, Math.min(700, (o.alt - d.altFt) * 3));
      this.pitch += 0.0004 * (vsT - d.vsFpm);
    }
    this.pitch = Math.max(-12, Math.min(12, this.pitch));
    s.controls.elevator = Math.max(
      -1,
      Math.min(
        1,
        (this.pitch * DEG - a.theta) * 4 - a.q * 1.2 - s.controls.trim,
      ),
    );
    s.controls.aileron = Math.max(-1, Math.min(1, -a.phi * 2 - a.p * 0.5));
  }
}
/** slow flight toward `ias` (an elevator integrator: the simple Pilot runs out of pitch authority this slow) */
const slowFlight = (s: Sim, ias: number) => {
  let pitch = s.ac.data.pitchDeg;
  let integ = 0;
  return () => {
    const a = s.ac.s;
    pitch = Math.max(-10, Math.min(12, pitch - 0.008 * (ias - s.ac.data.iasKt)));
    const e = pitch * DEG - a.theta;
    integ = Math.max(-1, Math.min(1, integ + e * 0.05 * 2));
    s.controls.elevator = Math.max(-1, Math.min(1, e * 4 - a.q * 1.2 - s.controls.trim + integ));
    s.controls.aileron = Math.max(-1, Math.min(1, -a.phi * 2 - a.p * 0.5));
  };
};
/** hold 5500 ft for `sec` */
const level = (s: Sim, sec: number, dt = 0.05) => {
  const P = new Pilot(s);
  run(s, sec, () => P.fly({ alt: 5500 }), dt);
};
/** an engine-out glide at best glide (68 KIAS) while `f` runs */
const glide = (s: Sim, P: Pilot) => () =>
  P.fly(s.sys.engineRunning ? { alt: s.ac.data.altFt } : { ias: 68 });

// =========================================================================== contract
describe("failures and switches contract", () => {
  it("Failures covers every FailureKey; FAILURE_LABELS is the EN table; FR labels and groups cover every key", () => {
    const f = noFailures();
    expect(Object.keys(f).sort()).toEqual([...ALL_KEYS].sort());
    expect(Object.values(f).every((v) => v === false)).toBe(true);
    expect(FAILURE_LABELS).toBe(FAILURE_LABELS_EN);
    expect(Object.keys(FAILURE_LABELS_FR).sort()).toEqual([...ALL_KEYS].sort());
    expect(FAILURE_GROUPS.flatMap((g) => g.keys).sort()).toEqual(
      [...ALL_KEYS].sort(),
    );
    expect(Object.keys(ANNUNCIATOR_LEVEL)).toHaveLength(10);
  });

  it("the failure bit mask lists every FailureKey once (a direct write to sim.failures is always seen)", () => {
    expect([...FAILURE_KEYS].sort()).toEqual([...ALL_KEYS].sort());
    FAILURE_KEYS.forEach((k, i) => {
      const f = noFailures();
      f[k] = true;
      expect(failureMask(f)).toBe(1 << i);
    });
    expect(failureMask(noFailures())).toBe(0);
  });

  it("failure, switch, engine and annunciator events carry a French text", () => {
    const s = cruise();
    s.setFailure("fuelPump", true);
    run(s, 20);
    s.setSwitch("auxPump", true);
    s.setSwitch("mixture", 0);
    run(s, 4);
    const fr = s.rec.events.map((e) => e.fr).filter(Boolean);
    expect(fr).toContain("PANNE : Panne de pompe à carburant mécanique");
    expect(fr).toContain("Voyant : FUEL PRESS");
    expect(fr).toContain(
      "Moteur arrêté (désamorçage : pas de pression carburant)",
    );
    expect(fr).toContain("Pompe électrique → MARCHE");
    expect(fr).toContain("Mélange → ÉTOUFFOIR");
  });

  it("setFailure works for every key and logs FAILURE: <label> / Restored: <label>", () => {
    const s = cruise();
    for (const k of ALL_KEYS) {
      s.setFailure(k, true);
      expect(s.failures[k]).toBe(true);
      expect(s.rec.events.at(-1)?.text).toBe(
        `FAILURE: ${FAILURE_LABELS_EN[k]}`,
      );
      s.setFailure(k, false);
      expect(s.rec.events.at(-1)?.text).toBe(
        `Restored: ${FAILURE_LABELS_EN[k]}`,
      );
    }
    expect(s.rec.failuresInjected).toHaveLength(ALL_KEYS.length);
  });

  it("setSwitch logs readable events and pilot actions; a mixture knob logs once it settles", () => {
    const s = cruise();
    s.setSwitch("fuelSelector", "OFF");
    s.setSwitch("altMaster", false);
    s.setSwitch("mixture", 0);
    const texts = s.rec.events.map((e) => e.text);
    expect(texts).toContain("Fuel selector → OFF");
    expect(texts).toContain("Master ALT → OFF");
    expect(texts).toContain("Mixture → IDLE CUT-OFF");
    expect(s.rec.actions.map((a) => a.key)).toEqual([
      "fuelSelector",
      "altMaster",
      "mixture",
    ]);
    // leaning in small steps: one event after the knob stops
    const s2 = cruise();
    for (let m = 0.97; m > 0.8; m -= 0.01) {
      s2.setSwitch("mixture", m);
      s2.step(0.05);
    }
    run(s2, 2);
    const lean = s2.rec.events.filter((e) => e.text.startsWith("Mixture"));
    expect(lean).toHaveLength(1);
    expect(lean[0].text).toMatch(/^Mixture → LEAN \(8\d %\)$/);
    expect(SWITCH_LABELS_FR.mixture).toBe("Mélange");
    expect(switchValueText("trimCb", false)).toBe("PULLED");
  });

  it("a normal flight: indications are the true values, no annunciator, everything powered", () => {
    const s = cruise();
    run(s, 20);
    const d = s.ac.data;
    expect(s.sys.indicated.iasKt).toBe(d.iasKt);
    expect(s.sys.indicated.vsFpm).toBe(d.vsFpm);
    expect(s.indicatedAlt()).toBe(s.baroAlt());
    expect(s.sys.gyro.pitchDeg).toBeCloseTo(d.pitchDeg, 6);
    expect(s.sys.gyro.rollDeg).toBeCloseTo(d.rollDeg, 6);
    expect(s.sys.annunciators).toEqual([]);
    expect(s.sys.powered && s.sys.avionicsPowered && s.sys.engineRunning).toBe(
      true,
    );
    expect(s.sys.busVolts).toBeCloseTo(28, 1);
    expect(s.sys.battAmps).toBeGreaterThanOrEqual(0); // + = charging
    expect(s.sys.vacuumInHg).toBeGreaterThan(4.5);
    expect(s.sys.vacuumInHg).toBeLessThan(5.5);
    expect(s.sys.oilPressPsi).toBeGreaterThan(55);
    expect(s.sys.fuelGalL).toBeCloseTo(s.sys.fuelGalR, 3);
    note(
      `normal cruise: ${d.iasKt.toFixed(0)} KIAS ${s.ac.s.rpm.toFixed(0)} RPM, ${s.sys.busVolts.toFixed(1)} V ${s.sys.battAmps.toFixed(1)} A, vac ${s.sys.vacuumInHg.toFixed(1)} inHg, oil ${s.sys.oilPressPsi.toFixed(0)} psi ${s.sys.oilTempF.toFixed(0)} F, FF ${s.sys.fuelFlowGph.toFixed(1)} gph`,
    );
  });

  it("ground idle: no nuisance annunciation (vacuum, volts and oil pressure stay in the green)", () => {
    const s = onRunway();
    s.controls.throttle = 0;
    run(s, 20);
    expect(s.ac.s.rpm).toBeLessThan(800);
    expect(s.sys.annunciators).toEqual([]);
    expect(s.sys.vacuumInHg).toBeGreaterThan(3.3);
    expect(s.sys.busVolts).toBeCloseTo(28, 1); // the alternator still carries the load at idle
    note(
      `ground idle ${s.ac.s.rpm.toFixed(0)} RPM: vac ${s.sys.vacuumInHg.toFixed(1)} inHg, ${s.sys.busVolts.toFixed(1)} V ${s.sys.battAmps.toFixed(1)} A, oil ${s.sys.oilPressPsi.toFixed(0)} psi`,
    );
  });

  it("the systems never consume the seeded weather RNG (deterministic flights)", () => {
    const s = cruise();
    seedSim("x");
    const ref = simRandom();
    seedSim("x");
    for (const k of ALL_KEYS) s.setFailure(k, true);
    s.systems.step(0.1, s);
    expect(simRandom()).toBe(ref);
  });
});

// =========================================================================== electrical
describe("electrical system", () => {
  /** minutes until the bus dies after an alternator failure (systems only: the airframe holds cruise RPM) */
  function endurance(shed: boolean) {
    const s = cruise();
    run(s, 0.5);
    s.setFailure("alternator", true);
    if (shed) {
      s.setSwitch("avionics", false);
      s.setSwitch("beacon", false);
      s.setSwitch("pitotHeat", false);
      s.setSwitch("landingLight", false);
    }
    let low = NaN;
    const trace: string[] = [];
    for (let t = 1; t < 5400; t++) {
      s.systems.step(1, s);
      if (!Number.isFinite(low) && s.sys.annunciators.includes("LOW VOLTS"))
        low = t;
      if (t % 300 === 0)
        trace.push(
          `${t / 60}min ${s.sys.busVolts.toFixed(1)}V ${s.sys.battAmps.toFixed(1)}A`,
        );
      if (!s.sys.powered) return { min: t / 60, low, trace, s };
    }
    return { min: Infinity, low, trace, s };
  }

  it("alternator failure: LOW VOLTS at once, battery discharges; 15–20 min without shedding, 30–45 min with", () => {
    const a = endurance(false);
    const b = endurance(true);
    note(
      `alternator failure, no load shedding: bus dead after ${a.min.toFixed(1)} min (${a.trace.join(", ")})`,
    );
    note(
      `alternator failure, load shed (avionics, beacon OFF): bus dead after ${b.min.toFixed(1)} min`,
    );
    expect(a.low).toBeLessThanOrEqual(2);
    expect(
      a.s.rec.events.some((e) => e.text === "Annunciator: LOW VOLTS"),
    ).toBe(true);
    expect(
      a.s.rec.events.some(
        (e) => e.text === "Electrical bus dead: avionics off",
      ),
    ).toBe(true);
    expect(a.min).toBeGreaterThanOrEqual(15);
    expect(a.min).toBeLessThanOrEqual(20);
    expect(b.min).toBeGreaterThanOrEqual(30);
    expect(b.min).toBeLessThanOrEqual(45);
    // dead bus: every electric consumer stops, the engine (magnetos) keeps running
    const s = a.s;
    run(s, 1);
    const e = s.sys.elec;
    expect(
      [
        e.pfd,
        e.mfd,
        e.com1,
        e.nav1,
        e.gps,
        e.xpdr,
        e.ap,
        e.trim,
        e.flaps,
        e.turnCoord,
      ].some(Boolean),
    ).toBe(false);
    expect(s.sys.comOk || s.sys.xpdrOk).toBe(false);
    expect(s.nav1.valid).toBe(false);
    expect(s.fp.out.valid).toBe(false);
    expect(s.ap.inhibited).toBe("AP FAIL");
    expect(s.sys.annunciators).toEqual([]); // the annunciator panel is dark too
    expect(s.sys.engineRunning).toBe(true);
    const flaps0 = s.ac.s.flapPos;
    s.controls.flaps = 2;
    run(s, 5);
    expect(s.ac.s.flapPos).toBe(flaps0); // electric flaps dead
  });

  it("ALT master OFF behaves as an alternator failure; ammeter sign: + charging, − discharging", () => {
    const s = cruise();
    run(s, 2);
    expect(s.sys.battAmps).toBeGreaterThanOrEqual(0);
    s.setSwitch("altMaster", false);
    run(s, 1);
    expect(s.sys.battAmps).toBeLessThan(-15);
    expect(s.sys.annunciators).toContain("LOW VOLTS");
    s.setSwitch("altMaster", true);
    run(s, 2);
    expect(s.sys.battAmps).toBeGreaterThan(0); // recharging
    expect(s.sys.annunciators).not.toContain("LOW VOLTS");
  });

  it("battery failure: the alternator alone keeps the bus while the engine turns; no starter", () => {
    const s = cruise();
    s.setFailure("battery", true);
    run(s, 3);
    expect(s.sys.powered).toBe(true);
    expect(s.sys.busVolts).toBeCloseTo(28, 0);
    expect(s.sys.battAmps).toBe(0);
    s.setSwitch("altMaster", false);
    run(s, 1);
    expect(s.sys.powered).toBe(false);
    // the engine stopped and no battery: the starter cannot crank
    const g = onRunway();
    g.setFailure("battery", true);
    g.setSwitch("mixture", 0);
    run(g, 8);
    g.setSwitch("mixture", 1);
    g.setSwitch("magnetos", "START");
    run(g, 4);
    expect(g.sys.starterEngaged).toBe(false);
    expect(g.sys.engineRunning).toBe(false);
  });

  it("electrical fire: smoke and rising amps until the masters are OFF (out ≈ 10 s later); avionics OFF isolates it", () => {
    const s = cruise();
    const P = new Pilot(s);
    s.setFailure("electricalFire", true);
    const a0 = s.sys.loadAmps;
    run(s, 15, () => P.fly({ alt: 5500 }));
    expect(s.sys.fire).toBe(true);
    expect(s.sys.fireKind).toBe("electrical");
    expect(s.sys.annunciators).toContain("SMOKE");
    expect(s.sys.loadAmps).toBeGreaterThan(a0 + 15);
    note(
      `electrical fire: load ${a0.toFixed(0)} A -> ${s.sys.loadAmps.toFixed(0)} A after 15 s, smoke ${s.sys.smokeLevel.toFixed(2)}`,
    );
    s.setSwitch("batMaster", false);
    s.setSwitch("altMaster", false);
    const tOut = until(
      s,
      30,
      () => !s.sys.fire,
      () => P.fly({ alt: 5500 }),
    );
    expect(tOut).toBeGreaterThan(8);
    expect(tOut).toBeLessThan(12);
    expect(s.sys.engineRunning).toBe(true); // magnetos need no electrical power
    // POH: all switches OFF, then master ON with the avionics OFF: the essential bus is back, no fire
    s.setSwitch("avionics", false);
    s.setSwitch("batMaster", true);
    s.setSwitch("altMaster", true);
    run(s, 20, () => P.fly({ alt: 5500 }));
    expect(s.sys.fire).toBe(false);
    expect(s.sys.elec.pfd).toBe(true);
    expect(s.sys.elec.mfd).toBe(false);
    // the faulty circuit is on the avionics bus: switching it back on re-ignites
    s.setSwitch("avionics", true);
    run(s, 10, () => P.fly({ alt: 5500 }));
    expect(s.sys.fire).toBe(true);
    note(
      `electrical fire: masters OFF -> out after ${tOut.toFixed(1)} s; master ON + avionics OFF safe; avionics ON re-ignites`,
    );
  });
});

// =========================================================================== vacuum, pitot-static
describe("vacuum and pitot-static", () => {
  it("vacuum failure: LOW VACUUM, the steam AI/DG drift after ≈ 1.5 min and topple by ≈ 4–5 min; AHRS unaffected", () => {
    const s = cruise();
    const P = new Pilot(s);
    s.setFailure("vacuum", true);
    run(s, 10, () => P.fly({ alt: 5500 }));
    expect(s.sys.annunciators).toContain("LOW VACUUM");
    expect(s.sys.vacuumInHg).toBeLessThan(1);
    run(s, 50, () => P.fly({ alt: 5500 }));
    const errAt1 = Math.abs(s.sys.gyro.rollDeg - s.ac.data.rollDeg);
    expect(errAt1).toBeLessThan(0.5); // still good after a minute: the pilot may not notice
    run(s, 120, () => P.fly({ alt: 5500 }));
    const errAt3 =
      Math.abs(s.sys.gyro.rollDeg - s.ac.data.rollDeg) +
      Math.abs(s.sys.gyro.hdgDeg - s.ac.data.hdgTrue);
    expect(errAt3).toBeGreaterThan(3); // drifting
    run(s, 120, () => P.fly({ alt: 5500 }), 0.1);
    const toppled = Math.abs(s.sys.gyro.rollDeg - s.ac.data.rollDeg);
    expect(toppled).toBeGreaterThan(30);
    expect(s.sys.gyroHealth).toBe(0);
    expect(Math.abs(s.ac.data.rollDeg)).toBeLessThan(5); // the aircraft (and the G1000 AHRS) is wings level
    note(
      `vacuum: AI roll error 1 min ${errAt1.toFixed(1)} deg, 3 min AI+DG error ${errAt3.toFixed(1)} deg, 5 min AI toppled ${toppled.toFixed(0)} deg`,
    );
  });

  it("pitot blocked (ram + drain): the ASI behaves like an altimeter", () => {
    const s = cruise();
    const P = new Pilot(s);
    run(s, 5, () => P.fly({ alt: 5500 }));
    s.setFailure("pitotBlocked", true);
    run(s, 40, () => P.fly({ alt: 5900 }));
    const climbErr = s.sys.indicated.iasKt - s.ac.data.iasKt;
    expect(climbErr).toBeGreaterThan(10); // climbing: reads high
    note(
      `pitot blocked, climb ${(s.baroAlt() - 5500).toFixed(0)} ft: IAS true ${s.ac.data.iasKt.toFixed(0)} / indicated ${s.sys.indicated.iasKt.toFixed(0)} kt`,
    );
    run(s, 80, () => P.fly({ alt: 5100 }));
    expect(s.sys.indicated.iasKt - s.ac.data.iasKt).toBeLessThan(-10); // below the blockage altitude: reads low
    note(
      `pitot blocked, descent to ${s.baroAlt().toFixed(0)} ft: IAS true ${s.ac.data.iasKt.toFixed(0)} / indicated ${s.sys.indicated.iasKt.toFixed(0)} kt`,
    );
  });

  it("pitot icing: IAS decays to ~0 in ≈ 60 s with PITOT HEAT OFF; heat clears it in ≈ 30 s; it comes back with heat off", () => {
    const s = cruise();
    const P = new Pilot(s);
    s.setFailure("pitotIcing", true);
    run(s, 2, () => P.fly({ alt: 5500 }));
    expect(s.sys.annunciators).toContain("PITOT HEAT OFF");
    const tr: string[] = [];
    run(
      s,
      64,
      (t) => (
        P.fly({ alt: 5500 }),
        Math.abs(t % 15) < 0.025 &&
          tr.push(`${t.toFixed(0)}s ${s.sys.indicated.iasKt.toFixed(0)}`)
      ),
    );
    expect(s.sys.indicated.iasKt).toBeLessThan(5);
    expect(s.ac.data.iasKt).toBeGreaterThan(90);
    s.setSwitch("pitotHeat", true);
    expect(s.sys.annunciators).not.toContain("PITOT HEAT OFF");
    const tClear = until(
      s,
      60,
      () => Math.abs(s.sys.indicated.iasKt - s.ac.data.iasKt) < 1,
      () => P.fly({ alt: 5500 }),
    );
    expect(tClear).toBeGreaterThan(20);
    expect(tClear).toBeLessThan(35);
    note(
      `pitot icing: indicated ${tr.join(", ")} (true ${s.ac.data.iasKt.toFixed(0)}); PITOT HEAT ON clears in ${tClear.toFixed(0)} s`,
    );
    s.setSwitch("pitotHeat", false);
    run(s, 40, () => P.fly({ alt: 5500 }));
    expect(s.sys.indicated.iasKt).toBeLessThan(s.ac.data.iasKt - 30);
  });

  it("pitot heat draws 10 A and only works with power; PITOT HEAT OFF only in icing conditions", () => {
    const s = cruise();
    run(s, 1);
    const a0 = s.sys.loadAmps;
    s.setSwitch("pitotHeat", true);
    run(s, 1);
    expect(s.sys.loadAmps - a0).toBeGreaterThan(9);
    expect(s.sys.loadAmps - a0).toBeLessThan(11);
    s.setSwitch("pitotHeat", false);
    // in cloud at a freezing OAT: advisory annunciation
    Object.assign(s.weather, {
      ceilingFt: 3000,
      cloudTopFt: 9000,
      oatSeaLevelC: 5,
    });
    run(s, 1);
    expect(s.sys.icingConditions).toBe(true);
    expect(s.sys.annunciators).toContain("PITOT HEAT OFF");
  });

  it("static port blocked: altimeter frozen, VSI zero, ASI wrong; ALT STATIC cures it with the small C172S error", () => {
    const s = cruise();
    const P = new Pilot(s);
    run(s, 5, () => P.fly({ alt: 5500 }));
    s.setFailure("staticBlocked", true);
    const frozen = s.indicatedAlt();
    let drift = 0; // frozen all the way down, not only once level again
    run(s, 70, () => {
      P.fly({ alt: 5150 });
      drift = Math.max(drift, Math.abs(s.indicatedAlt() - frozen));
    });
    expect(drift).toBeLessThan(1);
    expect(s.sys.indicated.vsFpm).toBe(0);
    expect(s.baroAlt()).toBeLessThan(frozen - 150);
    // below the blockage: the trapped (lower) static pressure makes the ASI read HIGH (FAA PHAK ch. 8)
    const below = s.sys.indicated.iasKt - s.ac.data.iasKt;
    expect(below).toBeGreaterThan(5);
    note(
      `static blocked: altimeter frozen at ${frozen.toFixed(0)} while true ${s.baroAlt().toFixed(0)} ft, VSI 0, IAS +${below.toFixed(0)} kt below the blockage`,
    );
    s.setSwitch("altStatic", true);
    let peak = 0;
    run(
      s,
      3,
      () => (
        P.fly({ alt: 5150 }),
        (peak = Math.max(peak, Math.abs(s.sys.indicated.vsFpm)))
      ),
    );
    run(s, 40, () => P.fly({ alt: 5150 })); // the VSI's capillary leak (≈ 6 s) settles
    const altErr = s.indicatedAlt() - s.baroAlt();
    const iasErr = s.sys.indicated.iasKt - s.ac.data.iasKt;
    expect(altErr).toBeGreaterThan(35);
    expect(altErr).toBeLessThan(60);
    expect(iasErr).toBeGreaterThan(1);
    expect(iasErr).toBeLessThan(3.5);
    expect(peak).toBeGreaterThan(500); // momentary VSI jump as the instruments vent to the cabin
    expect(Math.abs(s.sys.indicated.vsFpm - s.ac.data.vsFpm)).toBeLessThan(30);
    note(
      `ALT STATIC ON: altitude +${altErr.toFixed(0)} ft, IAS +${iasErr.toFixed(1)} kt, VSI jump ${peak.toFixed(0)} fpm then normal`,
    );
  });

  it("ALT STATIC opened with no fault: +50 ft, +2 kt and a brief VSI climb of a few hundred fpm (instrument lag)", () => {
    const s = cruise();
    const P = new Pilot(s);
    run(s, 5, () => P.fly({ alt: 5500 }));
    s.setSwitch("altStatic", true);
    let peak = 0;
    let at15 = 0;
    run(s, 30, (t) => {
      P.fly({ alt: 5500 });
      const dv = s.sys.indicated.vsFpm - s.ac.data.vsFpm;
      peak = Math.max(peak, dv);
      if (Math.abs(t - 15) < 0.026) at15 = dv;
    });
    expect(peak).toBeGreaterThan(250);
    expect(peak).toBeLessThan(900);
    expect(Math.abs(at15)).toBeLessThan(0.25 * peak); // dies out within seconds
    expect(s.indicatedAlt() - s.baroAlt()).toBeCloseTo(50, 0);
    s.setSwitch("altStatic", false);
    run(s, 60, () => P.fly({ alt: 5500 }));
    expect(s.indicatedAlt()).toBe(s.baroAlt());
    expect(s.sys.indicated.vsFpm).toBe(s.ac.data.vsFpm);
    note(
      `ALT STATIC (no fault): VSI peak +${peak.toFixed(0)} fpm, ${at15.toFixed(0)} fpm 15 s later`,
    );
  });

  it("static pressure helpers are inverse ISA", () => {
    expect(pressureAltOf(staticPressure(6000))).toBeCloseTo(6000, 3);
    expect(staticPressure(0)).toBeCloseTo(101325, 0);
  });
});

// =========================================================================== engine, fuel, oil, fire
describe("engine, fuel and oil", () => {
  it("mixture: idle cut-off stops the engine in ≈ 2 s; leaning above 3000 ft gains power; full rich at 8000 ft is slightly low", () => {
    const s = cruise();
    const P = new Pilot(s);
    run(s, 3, () => P.fly({ alt: 5500 }));
    s.setSwitch("mixture", 0);
    const t = until(
      s,
      10,
      () => !s.sys.engineRunning,
      () => P.fly({ ias: 68 }),
    );
    expect(t).toBeGreaterThan(1.5);
    expect(t).toBeLessThan(2.6);
    expect(
      s.rec.events.some(
        (e) => e.text === "Engine stopped (mixture idle cut-off)",
      ),
    ).toBe(true);
    // the curve: best power ≈ slightly rich of peak, full rich at 8000 ft ≈ 1–2 % below best power
    const sig8 = 0.786;
    const best = Math.max(
      ...[0.6, 0.65, 0.7, 0.75, 0.8, 0.85].map((m) =>
        mixturePower(mixtureRichness(m, sig8)),
      ),
    );
    const rich8 = mixturePower(mixtureRichness(1, sig8));
    expect(best - rich8).toBeGreaterThan(0.01);
    expect(best - rich8).toBeLessThan(0.03);
    expect(mixturePower(mixtureRichness(1, 1))).toBe(1); // sea-level full rich = the POH calibration
    expect(mixturePower(mixtureRichness(0.4, 1))).toBe(0); // leaned to the stop: the engine quits
    // in the air at 8000 ft, full throttle: leaning to best power raises the RPM
    const h = cruise();
    h.ac.s.altFt = 8000;
    const Q = new Pilot(h);
    h.controls.throttle = 1;
    run(h, 30, () => Q.fly({ alt: 8000 }));
    const rpmRich = h.ac.s.rpm;
    const vibRich = h.sys.vibration;
    h.setSwitch("mixture", 0.78);
    run(h, 20, () => Q.fly({ alt: 8000 }));
    expect(h.ac.s.rpm - rpmRich).toBeGreaterThan(15);
    expect(vibRich).toBeGreaterThan(0);
    note(
      `8000 ft full throttle: full rich ${rpmRich.toFixed(0)} RPM (vibration ${vibRich.toFixed(2)}), leaned ${h.ac.s.rpm.toFixed(0)} RPM, FF ${h.sys.fuelFlowGph.toFixed(1)} gph`,
    );
  });

  it("magnetos: L or R alone ≈ −75 RPM at the run-up, OFF stops the engine, START cranks only with battery power", () => {
    const s = onRunway();
    let thr = 0.3;
    run(s, 25, () => {
      thr = Math.max(0, Math.min(1, thr + (1800 - s.ac.s.rpm) * 0.00002));
      s.controls.throttle = thr;
    });
    const both = s.ac.s.rpm;
    s.setSwitch("magnetos", "L");
    run(s, 6);
    const dropL = both - s.ac.s.rpm;
    s.setSwitch("magnetos", "BOTH");
    run(s, 6);
    s.setSwitch("magnetos", "R");
    run(s, 6);
    const dropR = both - s.ac.s.rpm;
    note(
      `run-up ${both.toFixed(0)} RPM: magneto drop L ${dropL.toFixed(0)}, R ${dropR.toFixed(0)} RPM`,
    );
    expect(dropL).toBeGreaterThan(50);
    expect(dropL).toBeLessThan(125);
    expect(Math.abs(dropL - dropR)).toBeLessThan(5);
    s.setSwitch("magnetos", "OFF");
    run(s, 6);
    expect(s.sys.engineRunning).toBe(false);
    expect(s.ac.s.rpm).toBeLessThan(100);
    s.controls.throttle = 0.1;
    s.setSwitch("magnetos", "START");
    const tStart = until(s, 6, () => s.sys.engineRunning);
    s.setSwitch("magnetos", "BOTH");
    run(s, 5);
    expect(tStart).toBeLessThan(3);
    expect(s.ac.s.rpm).toBeGreaterThan(600);
    // battery master OFF: no starter
    s.setSwitch("magnetos", "OFF");
    run(s, 6);
    s.setSwitch("batMaster", false);
    s.setSwitch("magnetos", "START");
    run(s, 4);
    expect(s.sys.engineRunning).toBe(false);
    note(
      `engine start: running ${tStart.toFixed(1)} s after START; no crank with BAT OFF`,
    );
  });

  it("fuel selector OFF: the engine quits after 10–15 s of fuel in the lines; back to BOTH it restarts windmilling", () => {
    const s = cruise();
    const P = new Pilot(s);
    run(s, 5, () => P.fly({ alt: 5500 }));
    s.setSwitch("fuelSelector", "OFF");
    const tq = until(s, 30, () => !s.sys.engineRunning, glide(s, P));
    expect(tq).toBeGreaterThan(9);
    expect(tq).toBeLessThan(16);
    run(s, 15, glide(s, P));
    const wind = s.ac.s.rpm;
    expect(wind).toBeGreaterThan(500); // windmilling at best glide
    s.setSwitch("fuelSelector", "BOTH");
    const tr = until(s, 20, () => s.sys.engineRunning, glide(s, P));
    expect(tr).toBeGreaterThan(2);
    expect(tr).toBeLessThan(8);
    run(s, 5, glide(s, P));
    expect(s.ac.s.rpm).toBeGreaterThan(1800);
    note(
      `fuel selector OFF: engine quits after ${tq.toFixed(1)} s, windmills ${wind.toFixed(0)} RPM at ${s.ac.data.iasKt.toFixed(0)} KIAS; BOTH: restarts after ${tr.toFixed(1)} s`,
    );
  });

  it("a dead engine's propeller stops when slowed below ≈ 57 KIAS: then it needs the starter (or a dive) to restart", () => {
    const s = cruise();
    const P = new Pilot(s);
    s.setSwitch("magnetos", "OFF");
    run(s, 20, glide(s, P));
    expect(s.sys.engineRunning).toBe(false);
    expect(s.ac.s.rpm).toBeGreaterThan(500); // windmilling at best glide
    // slow down: the compression stops the propeller
    const tStop = until(
      s,
      60,
      () => s.ac.s.rpm < 1,
      slowFlight(s, 52),
    );
    expect(tStop).toBeLessThan(60);
    const stopIas = s.ac.data.iasKt;
    // back to best glide with the magnetos on BOTH: the propeller stays stopped, no restart
    s.setSwitch("magnetos", "BOTH");
    const P68 = new Pilot(s);
    let maxIas = 0;
    run(s, 25, () => {
      P68.fly({ ias: 68 });
      maxIas = Math.max(maxIas, s.ac.data.iasKt);
    });
    expect(maxIas).toBeLessThan(90);
    expect(s.ac.data.iasKt).toBeGreaterThan(60);
    expect(s.ac.s.rpm).toBeLessThan(1);
    expect(s.sys.engineRunning).toBe(false);
    // POH: magnetos START if the propeller is stopped — the starter turns it and the engine fires
    s.setSwitch("magnetos", "START");
    const tStart = until(
      s,
      10,
      () => s.sys.engineRunning,
      () => P68.fly({ ias: 68 }),
    );
    expect(tStart).toBeLessThan(5);
    s.setSwitch("magnetos", "BOTH");
    // a stopped propeller also turns again in a dive above ≈ 100 KIAS (no starter: dead battery)
    const d = cruise();
    const PD = new Pilot(d);
    d.setSwitch("magnetos", "OFF");
    run(d, 15, glide(d, PD));
    expect(until(d, 60, () => d.ac.s.rpm < 1, slowFlight(d, 52))).toBeLessThan(60);
    d.setSwitch("magnetos", "BOTH");
    const tDive = until(
      d,
      60,
      () => d.sys.engineRunning,
      () => PD.fly({ ias: 110 }),
    );
    expect(tDive).toBeLessThan(60);
    note(
      `propeller stopped at ${stopIas.toFixed(0)} KIAS (${tStop.toFixed(0)} s); stays stopped at 68 KIAS; START: running after ${tStart.toFixed(1)} s; dive to 110 KIAS: windmill restart after ${tDive.toFixed(0)} s`,
    );
  });

  it("fuel shutoff valve pulled: same as selector OFF", () => {
    const s = cruise();
    s.setSwitch("fuelShutoff", false);
    const tq = until(s, 30, () => !s.sys.engineRunning);
    expect(tq).toBeGreaterThan(9);
    expect(tq).toBeLessThan(16);
  });

  it("fuel burn per tank: BOTH ≈ equal, LEFT burns only the left tank; an empty selected tank starves the engine", () => {
    const s = cruise();
    level(s, 600, 0.1);
    const dl = 26.5 - s.sys.fuelGalL;
    const dr = 26.5 - s.sys.fuelGalR;
    expect(dl).toBeGreaterThan(0.5);
    expect(Math.abs(dl - dr)).toBeLessThan(0.01);
    expect(s.ac.s.fuelGal).toBeCloseTo(s.sys.fuelGalL + s.sys.fuelGalR, 6);
    note(`10 min on BOTH: L −${dl.toFixed(2)} gal, R −${dr.toFixed(2)} gal`);
    s.setSwitch("fuelSelector", "LEFT");
    const r0 = s.sys.fuelGalR;
    const l0 = s.sys.fuelGalL;
    level(s, 300, 0.1);
    expect(s.sys.fuelGalR).toBeCloseTo(r0, 6);
    expect(l0 - s.sys.fuelGalL).toBeGreaterThan(0.3);
    // left tank nearly empty, LEFT selected: starvation, LOW FUEL L; select the right tank: restart
    const g = cruise();
    const P = new Pilot(g);
    g.systems.setTanks(g, 0.15, 20);
    g.setSwitch("fuelSelector", "LEFT");
    run(g, 1);
    expect(g.sys.annunciators).toContain("LOW FUEL L");
    expect(g.sys.annunciators).not.toContain("LOW FUEL R");
    const tq = until(g, 120, () => !g.sys.engineRunning, glide(g, P));
    expect(Number.isFinite(tq)).toBe(true);
    expect(
      g.rec.events.some(
        (e) =>
          e.text === "Engine stopped (fuel starvation: selected tank empty)",
      ),
    ).toBe(true);
    g.setSwitch("fuelSelector", "RIGHT");
    const tr = until(g, 20, () => g.sys.engineRunning, glide(g, P));
    expect(tr).toBeLessThan(8);
    note(
      `left tank run dry on LEFT: engine quits after ${tq.toFixed(0)} s; RIGHT selected: restart after ${tr.toFixed(1)} s`,
    );
  });

  it("engine-driven fuel pump failure: FUEL PRESS, the engine quits unless the AUX PUMP is ON (then normal)", () => {
    const s = cruise();
    const P = new Pilot(s);
    s.setFailure("fuelPump", true);
    run(s, 1);
    expect(s.sys.annunciators).toContain("FUEL PRESS");
    const tq = until(s, 30, () => !s.sys.engineRunning, glide(s, P));
    expect(tq).toBeLessThan(16);
    s.setSwitch("auxPump", true);
    const tr = until(s, 20, () => s.sys.engineRunning, glide(s, P));
    run(s, 10, glide(s, P));
    expect(tr).toBeLessThan(5);
    expect(s.sys.annunciators).not.toContain("FUEL PRESS");
    expect(s.ac.s.rpm).toBeGreaterThan(1800);
    expect(s.sys.powerFactor).toBeGreaterThan(0.95);
    note(
      `fuel pump failure: engine quits after ${tq.toFixed(1)} s; AUX PUMP ON restarts after ${tr.toFixed(1)} s, ${s.ac.s.rpm.toFixed(0)} RPM`,
    );
  });

  it("rough engine (bad magneto): BOTH rough ≈ 80 %, the good magneto alone smooth, the bad one very rough", () => {
    const s = cruise();
    run(s, 5);
    const rpm0 = s.ac.s.rpm;
    s.setFailure("engineRough", true);
    run(s, 5);
    const bad = s.sys.badMag!;
    const good = bad === "L" ? "R" : "L";
    expect(s.sys.vibration).toBeGreaterThan(0.3);
    expect(s.sys.powerFactor).toBeCloseTo(0.8, 1);
    const rpmBoth = s.ac.s.rpm;
    s.setSwitch("magnetos", good);
    run(s, 5);
    expect(s.sys.vibration).toBe(0);
    expect(s.sys.powerFactor).toBeGreaterThan(0.85);
    const rpmGood = s.ac.s.rpm;
    s.setSwitch("magnetos", bad);
    run(s, 5);
    expect(s.sys.vibration).toBeGreaterThan(0.8);
    expect(s.sys.powerFactor).toBeLessThan(0.3);
    note(
      `rough engine (bad ${bad}): ${rpm0.toFixed(0)} RPM normal, BOTH ${rpmBoth.toFixed(0)} (rough), ${good} ${rpmGood.toFixed(0)} (smooth), ${bad} ${s.ac.s.rpm.toFixed(0)} (very rough)`,
    );
    expect(rpmGood).toBeGreaterThan(rpmBoth);
    expect(s.ac.s.rpm).toBeLessThan(rpmBoth - 300);
  });

  it("partial power loss ≈ 60 % whatever the pilot does", () => {
    const s = cruise();
    s.controls.throttle = 1;
    run(s, 15);
    const r0 = s.ac.s.rpm;
    const hp0 = s.ac.bhp;
    s.setFailure("enginePartial", true);
    run(s, 15);
    const hp1 = s.ac.bhp;
    expect(hp1 / hp0).toBeGreaterThan(0.5);
    expect(hp1 / hp0).toBeLessThan(0.7);
    // nothing the pilot does gives the power back
    s.setSwitch("mixture", 0.85);
    s.setSwitch("auxPump", true);
    s.setSwitch("magnetos", "L");
    run(s, 10);
    expect(s.ac.bhp / hp0).toBeLessThan(0.7);
    expect(s.sys.powerFactor).toBeLessThan(0.75);
    expect(s.sys.engineRunning).toBe(true);
    note(
      `partial power: full throttle ${r0.toFixed(0)} RPM ${hp0.toFixed(0)} hp -> ${s.ac.s.rpm.toFixed(0)} RPM, brake power ${((hp1 / hp0) * 100).toFixed(0)} % of normal`,
    );
  });

  it("loss of oil pressure: ≈ 10 psi within a minute, temperature rises, the engine seizes 8–12 min later — no restart", () => {
    const s = cruise();
    const P = new Pilot(s);
    s.setFailure("oilPressure", true);
    run(s, 65, glide(s, P), 0.1);
    expect(s.sys.oilPressPsi).toBeLessThan(13);
    expect(s.sys.annunciators).toContain("OIL PRESSURE");
    const t0 = s.sys.oilTempF;
    const tSeize =
      65 + until(s, 800, () => s.sys.engineSeized, glide(s, P), 0.1);
    expect(s.sys.oilTempF).toBeGreaterThan(t0 + 30);
    expect(tSeize / 60).toBeGreaterThan(8);
    expect(tSeize / 60).toBeLessThan(12.5);
    run(s, 5, glide(s, P), 0.1);
    expect(s.ac.s.rpm).toBe(0);
    s.setSwitch("magnetos", "START");
    run(s, 3, glide(s, P));
    expect(s.sys.engineRunning).toBe(false);
    expect(s.ac.s.rpm).toBe(0);
    note(
      `oil pressure loss: 10 psi after 1 min, oil ${t0.toFixed(0)} -> ${s.sys.oilTempF.toFixed(0)} F, seized after ${(tSeize / 60).toFixed(1)} min, starter: propeller stays stopped`,
    );
  });

  it("engine fire: burns until mixture IDLE CUT-OFF, fuel OFF and aux pump OFF for ≈ 15 s; mixture alone is not enough", () => {
    const s = cruise();
    const P = new Pilot(s);
    s.setFailure("engineFire", true);
    run(s, 5, () => P.fly({ alt: 5500 }));
    expect(s.sys.fire).toBe(true);
    expect(s.sys.fireKind).toBe("engine");
    expect(s.sys.annunciators).toContain("FIRE");
    s.setSwitch("mixture", 0);
    run(s, 30, () => P.fly({ ias: 100 }));
    expect(s.sys.engineRunning).toBe(false);
    expect(s.sys.fire).toBe(true); // the fuel valve is still open
    s.setSwitch("fuelSelector", "OFF");
    // POH: 100 KIAS (faster if the fire persists) — the airflow blows it out in ≈ 15 s
    run(s, 0.05);
    const tOut = until(
      s,
      40,
      () => !s.sys.fire,
      () => P.fly({ ias: 100 }),
    );
    expect(tOut).toBeGreaterThan(12);
    expect(tOut).toBeLessThan(19);
    // at the best-glide speed it lingers longer
    const g = cruise();
    const PG = new Pilot(g);
    g.setFailure("engineFire", true);
    run(g, 5, () => PG.fly({ alt: 5500 }));
    g.setSwitch("mixture", 0);
    g.setSwitch("fuelShutoff", false);
    const tSlow = until(g, 60, () => !g.sys.fire, glide(g, PG));
    expect(tSlow).toBeGreaterThan(tOut + 2);
    // cabin heat open in an engine fire brings smoke into the cabin
    const c = cruise();
    c.setSwitch("cabinHeat", true);
    c.setFailure("engineFire", true);
    run(c, 30);
    expect(c.sys.annunciators).toContain("SMOKE");
    note(
      `engine fire: mixture cut alone keeps it burning; + fuel selector OFF -> out after ${tOut.toFixed(1)} s at 100 KIAS (${tSlow.toFixed(1)} s at 68 KIAS); cabin heat ON -> SMOKE`,
    );
  });

  it("legacy total engine failure stays unrecoverable", () => {
    const s = cruise();
    const P = new Pilot(s);
    s.setFailure("engine", true);
    run(s, 10, glide(s, P));
    expect(s.sys.engineRunning).toBe(false);
    s.setSwitch("auxPump", true);
    s.setSwitch("fuelSelector", "RIGHT");
    s.setSwitch("magnetos", "START");
    run(s, 10, glide(s, P));
    expect(s.sys.engineRunning).toBe(false);
  });

  it("fuel leak (left tank): ≈ 0.25 gal/min more from the left tank, LOW FUEL L when below 8 gal", () => {
    const s = cruise();
    s.setFailure("fuelLeak", true);
    level(s, 600, 0.1);
    const diff = s.sys.fuelGalR - s.sys.fuelGalL;
    expect(diff).toBeGreaterThan(2.3);
    expect(diff).toBeLessThan(2.7);
    s.systems.setTanks(s, 8.1, 20);
    level(s, 60, 0.1);
    expect(s.sys.annunciators).toContain("LOW FUEL L");
    note(
      `fuel leak: after 10 min the left tank holds ${diff.toFixed(2)} gal less than the right`,
    );
  });
});

// =========================================================================== other
describe("flaps, trim, radios, door", () => {
  it("flaps jammed: they stay at their current position", () => {
    const s = cruise();
    s.controls.flaps = 1;
    run(s, 4);
    const p = s.ac.s.flapPos;
    expect(p).toBeGreaterThan(0.2);
    s.setFailure("flaps", true);
    s.controls.flaps = 3;
    run(s, 10);
    expect(s.ac.s.flapPos).toBe(p);
    expect(s.sys.flapsStuck).toBe(true);
    s.setFailure("flaps", false);
    run(s, 10);
    expect(s.ac.s.flapPos).toBeCloseTo(1, 2);
  });

  it("trim runaway: nose-down at full travel in ≈ 8 s, the AP disconnects; pulling the trim/AP breaker stops it", () => {
    const s = cruise();
    s.controls.trim = 1;
    s.ap.toggleAp(s.ac.data);
    expect(s.ap.ap).toBe(true);
    s.setFailure("trimRunaway", true);
    expect(s.ap.ap).toBe(false);
    const t = until(s, 20, () => s.controls.trim <= -1);
    expect(t).toBeGreaterThan(7);
    expect(t).toBeLessThan(9);
    s.controls.trim = 0;
    s.setSwitch("trimCb", false);
    run(s, 5);
    expect(s.controls.trim).toBe(0);
    expect(s.sys.trimRunning).toBe(false);
    s.ap.toggleAp(s.ac.data);
    expect(s.ap.ap).toBe(false); // AP needs the breaker
    note(
      `trim runaway: full nose-down travel in ${t.toFixed(1)} s; breaker pulled -> stops, AP unavailable`,
    );
  });

  it("comms and transponder failures are exposed for the radio / ATC packages", () => {
    const s = cruise();
    s.setFailure("comms", true);
    s.setFailure("xpdr", true);
    expect(s.sys.comOk).toBe(false);
    expect(s.sys.xpdrOk).toBe(false);
    s.setFailure("comms", false);
    expect(s.sys.comOk).toBe(true);
  });

  it("door open: DOOR, a little drag (−1 to −4 KTAS), nothing else", () => {
    const s = cruise();
    const P = new Pilot(s);
    s.controls.throttle = 0.6;
    run(s, 90, () => P.fly({ alt: 5500 }));
    const v0 = s.ac.data.tasKt;
    s.setFailure("door", true);
    run(s, 120, () => P.fly({ alt: 5500 }));
    const dv = v0 - s.ac.data.tasKt;
    expect(s.sys.annunciators).toEqual(["DOOR"]);
    expect(s.sys.doorOpen).toBe(true);
    expect(dv).toBeGreaterThan(0.8);
    expect(dv).toBeLessThan(4);
    note(`door open: ${v0.toFixed(1)} -> ${s.ac.data.tasKt.toFixed(1)} KTAS`);
  });

  it("historical avionics failures keep their behaviour", () => {
    const s = cruise();
    s.setFailure("gs", true);
    expect(s.nav1.gsValid).toBe(false);
    s.setFailure("ahrs", true);
    expect(s.ap.inhibited).toBe("AP FAIL");
    s.setFailure("ahrs", false);
    s.setFailure("airData", true);
    expect(s.ap.inhibited).toBe("AP FAIL");
    expect(s.sys.indicated.iasKt).toBe(s.ac.data.iasKt); // the displays draw their red X / dead needles themselves
    expect(ELEC.lowVolts).toBe(24.5);
  });
});
