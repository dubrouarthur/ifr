// Flight-model measurement matrix against Cessna 172S POH / flight-test values.
// Sea-level ISA, max gross (2550 lb) unless stated. Every item is flown headless by a simple "pilot"
// (PI loops on the controls, like a pilot flying the needles), measured, and asserted within a tolerance.
// Set POH_REPORT=1 to print the measured matrix.
import { describe, it, expect, afterAll } from "vitest";
import { Sim, SCENARIOS } from "../src/sim/sim";
import { AIRFRAME, neutralControls } from "../src/sim/aircraft";
import { density, KT } from "../src/sim/environment";
import { runway } from "../src/nav/data";
import {
  DEG,
  destination,
  distanceNm,
  crossTrackNm,
  wrap180,
} from "../src/nav/geo";

const DT = 1 / 60;
const T_LONG = 120_000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const mean = (a: number[]) =>
  a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

// ------------------------------------------------------------------ matrix bookkeeping
const MATRIX: { item: string; target: string; value: number; ok: boolean }[] =
  [];
function rec(
  item: string,
  target: string,
  value: number,
  lo: number,
  hi: number,
) {
  const ok = Number.isFinite(value) && value >= lo && value <= hi;
  MATRIX.push({ item, target, value, ok });
  // soft: every item of a group is measured and reported even when one is out of tolerance
  expect
    .soft(ok, `${item}: ${value.toFixed(2)} not in [${lo}, ${hi}] (${target})`)
    .toBe(true);
}
afterAll(() => {
  if (!process.env.POH_REPORT) return;
  const rows = MATRIX.map(
    (m) =>
      `${m.ok ? "OK " : "XX "} ${m.item.padEnd(46)} ${m.value.toFixed(2).padStart(9)}   ${m.target}`,
  );
  console.log("\n" + rows.join("\n"));
});

// ------------------------------------------------------------------ set-up helpers
const PARD_ELEV = 420;
/** calm air: no wind at any height, no gusts, no turbulence, no shear */
function calm(s: Sim) {
  Object.assign(s.weather, {
    windKt: 0,
    windDir: 270,
    gustKt: 0,
    turbulence: 0,
    shearKt: 0,
  });
  s.weather.aloft = [{ altFt: 3000, dir: 270, kt: 0 }];
}
/** ISA atmosphere with the given pressure altitude at true altitude `altFt` (and an ISA deviation) */
function isa(s: Sim, altFt: number, pressAltFt: number, devC = 0) {
  s.weather.qnh = 29.92 + (altFt - pressAltFt) / 1000;
  s.weather.oatSeaLevelC = 15 + devC;
}
const sigmaAt = (pAlt: number, devC = 0) => density(pAlt, 15 + devC) / 1.225;

/** airborne, wings level, given IAS, at true altitude altFt with pressure altitude pAlt */
function airborne(o: {
  ias: number;
  alt?: number;
  pAlt?: number;
  hdg?: number;
  flaps?: number;
  throttle?: number;
  trim?: number;
  devC?: number;
}) {
  const s = new Sim();
  s.load(SCENARIOS.find((x) => x.id === "ils27-vtf")!);
  calm(s);
  const alt = o.alt ?? 3000;
  const pAlt = o.pAlt ?? 0;
  isa(s, alt, pAlt, o.devC ?? 0);
  const a = s.ac.s;
  a.altFt = alt;
  a.psi = (o.hdg ?? 270) * DEG;
  a.tas = (o.ias * KT) / Math.sqrt(sigmaAt(pAlt, o.devC ?? 0));
  a.gamma = 0;
  a.theta = 2 * DEG;
  a.q = 0;
  a.flapPos = (o.flaps ?? 0) / 3;
  s.controls = {
    ...neutralControls(),
    flaps: o.flaps ?? 0,
    throttle: o.throttle ?? 0.6,
    trim: o.trim ?? -0.17,
  };
  settle(s);
  return s;
}
/** on the runway 27 threshold of PARD, sea-level ISA by default */
function onRunway(o: { pAlt?: number; devC?: number; flaps?: number } = {}) {
  const s = new Sim();
  s.load(SCENARIOS.find((x) => x.id === "rwy27")!);
  calm(s);
  isa(s, PARD_ELEV, o.pAlt ?? 0, o.devC ?? 0);
  s.controls.flaps = o.flaps ?? 0;
  s.ac.s.flapPos = (o.flaps ?? 0) / 3;
  settle(s);
  return s;
}

/** after placing the aircraft by hand: restart the air-data filters (VS, IAS) from the new state */
function settle(s: Sim) {
  // forget the wind sampled before the weather was set: a changed air mass would read as a gust
  (s.ac as unknown as { lastWind: unknown }).lastWind = null;
  s.step(0.01);
  const ac = s.ac as unknown as { lastAlt: number; vsFilt: number; iasFilt: number };
  ac.lastAlt = s.ac.s.altFt;
  ac.vsFilt = (s.ac.s.tas * Math.sin(s.ac.s.gamma) * 60) / 0.3048;
  ac.iasFilt = -1;
  s.step(0.01);
}

// ------------------------------------------------------------------ the pilot
/** Simple pilot: cascaded PI loops. Each `fly` call sets the controls for one frame and steps the sim. */
class Pilot {
  pI = 0; // pitch-attitude integrator (elevator)
  oI = 0; // outer-loop integrator (pitch target)
  rI = 0; // ball integrator (rudder)
  tI = 0; // throttle integrator
  pitchTgt: number;
  constructor(public s: Sim) {
    this.pitchTgt = s.ac.data.pitchDeg;
    this.tI = s.controls.throttle;
  }
  get d() {
    return this.s.ac.data;
  }
  pitch(tgt: number) {
    const d = this.d;
    const e = tgt - d.pitchDeg;
    this.pI = clamp(this.pI + e * 0.03 * DT, -1.2, 1.2);
    this.s.controls.elevator = clamp(
      e * 0.06 - (this.s.ac.s.q / DEG) * 0.025 + this.pI,
      -1,
      1,
    );
  }
  /** elevator holds IAS (pitch for airspeed) */
  ias(tgt: number) {
    const err = this.d.iasKt - tgt;
    this.oI = clamp(this.oI + err * 0.06 * DT, -15, 15);
    this.pitchTgt = clamp(err * 0.6 + this.oI, -15, 18);
    this.pitch(this.pitchTgt);
  }
  /** elevator holds a vertical speed */
  vs(tgt: number, kp = 0.002, ki = 0.0015) {
    const d = this.d;
    const err = tgt - d.vsFpm;
    this.oI = clamp(this.oI + err * ki * DT, -12, 12);
    const fpa =
      Math.asin(clamp(tgt / (Math.max(40, d.tasKt) * 101.27), -0.5, 0.5)) / DEG;
    this.pitchTgt = clamp(fpa + d.aoaDeg + this.oI + err * kp, -15, 18);
    this.pitch(this.pitchTgt);
  }
  alt(tgt: number) {
    this.vs(clamp((tgt - this.d.altFt) * 4, -600, 600));
  }
  bank(tgt: number) {
    this.s.controls.aileron = clamp(
      (tgt - this.d.rollDeg) * 0.04 - (this.s.ac.s.p / DEG) * 0.012,
      -1,
      1,
    );
  }
  trkI = 0;
  track(tgt: number) {
    const e = wrap180(tgt - this.d.trackTrue);
    this.trkI = clamp(this.trkI + e * 0.3 * DT, -12, 12);
    this.bank(clamp(e * 1.5 + this.trkI, -20, 20));
  }
  heading(tgt: number) {
    this.bank(clamp(wrap180(tgt - this.d.hdgTrue) * 1.5, -20, 20));
  }
  /** step on the ball */
  ball() {
    const sl = this.d.slip;
    this.rI = clamp(this.rI + sl * 0.8 * DT, -1, 1);
    this.s.controls.rudder = clamp(sl * 0.6 + this.rI, -1, 1);
  }
  /** rudder holds a heading (ground roll, wing-low decrab) */
  rudderHdg(tgt: number) {
    const e = wrap180(tgt - this.d.hdgTrue);
    this.rI = clamp(this.rI + e * 0.05 * DT, -1, 1);
    this.s.controls.rudder = clamp(
      e * 0.15 - this.d.turnRateDps * 0.08 + this.rI,
      -1,
      1,
    );
  }
  rpm(tgt: number) {
    this.tI = clamp(this.tI + (tgt - this.d.rpm) * 0.0004 * DT, 0, 1);
    this.s.controls.throttle = this.tI;
  }
  /** throttle holds a vertical speed */
  thrVs(tgt: number) {
    const e = tgt - this.d.vsFpm;
    this.tI = clamp(this.tI + e * 0.00008 * DT, 0, 1);
    this.s.controls.throttle = clamp(this.tI + e * 0.0003, 0, 1);
  }
  step() {
    this.s.step(DT);
  }
}
const run = (s: Sim, sec: number, f: (t: number) => boolean | void) => {
  for (let t = 0; t < sec; t += DT) {
    if (f(t)) return t;
    s.step(DT);
    if (s.ac.s.crashed) return t;
  }
  return sec;
};

// ================================================================== 1. stall
function stall(flaps: number, rudder = 0) {
  const s = airborne({ ias: 70, alt: 6000, flaps, throttle: 0, trim: 0 });
  const P = new Pilot(s);
  // stabilise at 65 KIAS, then slow 1 kt/s, wings level, until the wing stalls
  let warn = NaN,
    stallIas = NaN,
    tStall = -1,
    pitchAtStall = 0,
    minPitchAfter = 99,
    maxBank = 0,
    recoverT = NaN,
    altAtStall = 0,
    minAlt = 1e9;
  let tgt = 65;
  run(s, 140, (t) => {
    const d = s.ac.data;
    if (tStall < 0) {
      if (t > 15) tgt = Math.max(20, tgt - DT);
      P.ias(t > 15 ? tgt : 65);
      P.bank(0);
      if (rudder) s.controls.rudder = t > 15 ? rudder : 0;
      else P.ball();
      if (d.stallWarn && !Number.isFinite(warn)) warn = d.iasKt;
      if (s.ac.stalled) {
        tStall = t;
        stallIas = d.iasKt;
        pitchAtStall = d.pitchDeg;
        altAtStall = d.altFt;
        s.controls.aileron = 0;
      }
    } else if (t - tStall < 3) {
      // hold full aft stick, ailerons neutral: watch the break
      s.controls.elevator = 1;
      s.controls.aileron = 0;
      minPitchAfter = Math.min(minPitchAfter, d.pitchDeg);
      maxBank = Math.max(maxBank, Math.abs(d.rollDeg));
      if (process.env.POH_TRACE && Math.round(t * 60) % 6 === 0) console.log("stall", flaps, rudder, (t - tStall).toFixed(2), d.pitchDeg.toFixed(1), d.vsFpm.toFixed(0), d.rollDeg.toFixed(1), (s.ac.s.p / DEG).toFixed(1), (s.ac.s.beta / DEG).toFixed(2), d.aoaDeg.toFixed(1), d.iasKt.toFixed(1), s.controls.rudder.toFixed(2), s.ac.buffet.toFixed(2));
    } else {
      // recovery: forward pressure, wings level, rudder neutral
      s.controls.elevator = -0.3;
      s.controls.rudder = 0;
      P.bank(0);
      minAlt = Math.min(minAlt, d.altFt);
      if (!s.ac.stalled && !Number.isFinite(recoverT))
        recoverT = t - tStall - 3;
      if (Number.isFinite(recoverT) && t - tStall > 8) return true;
    }
  });
  return {
    warn,
    stallIas,
    noseDrop: pitchAtStall - minPitchAfter,
    maxBank,
    recoverT,
    altLoss: altAtStall - minAlt,
    crashed: s.ac.s.crashed,
  };
}

describe("POH 1 — stalls", { timeout: T_LONG }, () => {
  it("1a-d stall speeds and warning margin, clean and flaps 30", () => {
    const c = stall(0);
    const f = stall(3);
    rec("1a stall IAS clean", "48 KIAS ±3", c.stallIas, 45, 51);
    rec("1b stall IAS flaps 30", "40 KIAS ±3", f.stallIas, 37, 43);
    rec(
      "1c stall warning margin clean (kt)",
      "5-10 kt before",
      c.warn - c.stallIas,
      5,
      10,
    );
    rec(
      "1d stall warning margin flaps 30 (kt)",
      "5-10 kt before",
      f.warn - f.stallIas,
      5,
      10,
    );
  });
  it("1e-h stall break, recovery, wing drop only with sideslip", () => {
    const c = stall(0);
    rec(
      "1e nose drop at the break (deg)",
      ">= 3 deg pitch drop",
      c.noseDrop,
      3,
      30,
    );
    rec(
      "1f recovery w/ forward pressure (s)",
      "unstalled < 2 s",
      c.recoverT,
      0,
      2,
    );
    rec("1g wing drop, ball centred (deg)", "< 10 deg bank", c.maxBank, 0, 10);
    const sl = stall(0, 0.6);
    rec(
      "1h wing drop with sideslip (deg)",
      "> 15 deg bank",
      sl.maxBank,
      15,
      120,
    );
    expect(c.crashed).toBeNull();
  });
});

// ================================================================== 2. take-off
function takeoff(
  o: {
    pAlt?: number;
    devC?: number;
    rotate?: number | null;
    fullAft?: boolean;
    rudder?: "hold" | "none";
  } = {},
) {
  const s = onRunway({ pAlt: o.pAlt, devC: o.devC, flaps: 1 });
  const P = new Pilot(s);
  const p0 = { lat: s.ac.s.lat, lon: s.ac.s.lon };
  s.controls.throttle = 1;
  s.controls.trim = 0;
  const rot = o.rotate === undefined ? 55 : o.rotate;
  let lofIas = NaN,
    roll = NaN,
    hdg8 = NaN,
    maxDev = 0;
  run(s, 70, (t) => {
    const d = s.ac.data;
    if ((o.rudder ?? "hold") === "hold") P.rudderHdg(270);
    else s.controls.rudder = 0;
    if (o.fullAft) s.controls.elevator = 1;
    else if (rot !== null && d.iasKt >= rot) P.pitch(8);
    else s.controls.elevator = 0;
    if (Math.abs(t - 8) < DT / 2) hdg8 = wrap180(d.hdgTrue - 270);
    if (s.ac.s.onGround)
      maxDev = Math.max(
        maxDev,
        Math.abs(
          crossTrackNm(
            destination(p0, 90, 1),
            destination(p0, 270, 1),
            s.ac.s,
          ) * 6076,
        ),
      );
    if (!s.ac.s.onGround && !Number.isFinite(lofIas)) {
      lofIas = d.iasKt;
      roll = distanceNm(p0, s.ac.s) * 6076;
      return true;
    }
  });
  return { lofIas, roll, hdg8, maxDev, s };
}

describe("POH 2 — take-off", { timeout: T_LONG }, () => {
  it("2a ground roll, flaps 10, full power, rotate 55 KIAS", () => {
    const r = takeoff();
    rec("2a take-off ground roll (ft)", "960 ft ±15%", r.roll, 816, 1104);
    rec("2a' lift-off IAS (kt)", "51-57 KIAS", r.lofIas, 50, 58);
  });
  it("2b-c no lift-off below ~50 kt", () => {
    const h = takeoff({ rotate: null });
    rec(
      "2b hands-off lift-off IAS (kt)",
      "none or > 55 KIAS",
      Number.isFinite(h.lofIas) ? h.lofIas : 99,
      55,
      99,
    );
    const f = takeoff({ fullAft: true });
    // full aft yoke from brake release: not below the flaps-10 stall speed (43 KIAS) less the ground-effect gain
    rec("2c full-aft-yoke lift-off IAS (kt)", ">= 40 KIAS (Vs flaps 10 = 43, in ground effect)", f.lofIas, 40, 60);
  });
  it("2d-e left-turning tendency on the roll, rudder holds the centreline", () => {
    const n = takeoff({ rudder: "none", rotate: null });
    rec(
      "2d heading change after 8 s, no rudder (deg)",
      "left: -1..-15 deg",
      n.hdg8,
      -15,
      -1,
    );
    const h = takeoff();
    rec("2e centreline deviation with rudder (ft)", "< 10 ft", h.maxDev, 0, 10);
  });
});

// ================================================================== 3. climb
function climb(ias: number, pAlt = 0, devC = 0) {
  const s = airborne({ ias, alt: 3000, pAlt, throttle: 1, devC });
  const P = new Pilot(s);
  const vs: number[] = [],
    gs: number[] = [],
    rpm: number[] = [],
    slip: number[] = [];
  run(s, 75, (t) => {
    P.ias(ias);
    P.bank(0);
    if (t > 5) P.ball();
    else s.controls.rudder = 0;
    if (t < 3) slip.push(s.ac.data.slip);
    if (t > 45) {
      vs.push(s.ac.data.vsFpm);
      gs.push(s.ac.data.gsKt);
      rpm.push(s.ac.data.rpm);
    }
  });
  const v = mean(vs);
  return {
    vs: v,
    angle: Math.atan2(v, mean(gs) * 101.27) / DEG,
    rpm: mean(rpm),
    slip0: mean(slip),
    rudder: s.controls.rudder,
  };
}

describe("POH 3 — climb", { timeout: T_LONG }, () => {
  it("3a-b Vy / Vx full power", () => {
    const y = climb(74);
    const x = climb(62);
    rec("3a climb rate at Vy 74 KIAS (fpm)", "730 fpm ±15%", y.vs, 620, 840);
    rec(
      "3b climb angle Vx - Vy (deg)",
      "Vx steeper: > 0",
      x.angle - y.angle,
      0.05,
      5,
    );
    rec(
      "3c P-factor: ball right at full power, no rudder",
      "ball right: slip > 0.1",
      y.slip0,
      0.1,
      1,
    );
    rec(
      "3d right rudder needed in the climb",
      "0.05..0.6",
      y.rudder,
      0.05,
      0.6,
    );
  });
});

// ================================================================== 4. engine / propeller
function cruise(o: { rpm?: number; throttle?: number; alt?: number }) {
  const alt = o.alt ?? 3000;
  const s = airborne({ ias: 100, alt, pAlt: alt, throttle: o.throttle ?? 0.6 });
  const P = new Pilot(s);
  const tas: number[] = [],
    rpm: number[] = [];
  run(s, 200, (t) => {
    P.alt(alt);
    P.bank(0);
    P.ball();
    if (o.rpm) P.rpm(o.rpm);
    else s.controls.throttle = o.throttle!;
    if (t > 150) {
      tas.push(s.ac.data.tasKt);
      rpm.push(s.ac.data.rpm);
    }
  });
  return { tas: mean(tas), rpm: mean(rpm), thr: s.controls.throttle };
}

describe("POH 4 — cruise and propeller", { timeout: T_LONG }, () => {
  it("4a cruise 2400 RPM at 3000 ft", () => {
    const c = cruise({ rpm: 2400 });
    rec("4a KTAS at 2400 RPM, 3000 ft", "110-115 KTAS", c.tas, 108, 117);
  });
  it("4b full throttle level at 3000 ft", () => {
    const c = cruise({ throttle: 1 });
    rec(
      "4b RPM full throttle level 3000 ft",
      "2600-2700 RPM",
      c.rpm,
      2580,
      2720,
    );
    rec("4b' KTAS full throttle 3000 ft", "118-126 KTAS", c.tas, 116, 128);
  });
  it("4c-d idle and static RPM on the ground", () => {
    const s = onRunway();
    s.controls.throttle = 0;
    s.controls.brake = 1;
    run(s, 10, () => {});
    rec("4c idle RPM on the ground", "600-800 RPM", s.ac.data.rpm, 600, 800);
    s.controls.throttle = 1;
    const p0 = { lat: s.ac.s.lat, lon: s.ac.s.lon };
    run(s, 8, () => {});
    rec(
      "4d static full-throttle RPM (brakes held)",
      "2300-2420 RPM",
      s.ac.data.rpm,
      2280,
      2440,
    );
    rec(
      "4d' brakes hold full power (ft moved)",
      "< 1 ft",
      distanceNm(p0, s.ac.s) * 6076,
      0,
      1,
    );
  });
  it("4e fixed-pitch prop: RPM rises with airspeed at a fixed throttle", () => {
    const at = (ias: number) => {
      const s = airborne({ ias, alt: 5000, pAlt: 3000, throttle: 0.55 });
      const P = new Pilot(s);
      run(s, 20, () => {
        P.ias(ias);
        P.bank(0);
        s.controls.throttle = 0.55;
      });
      return s.ac.data.rpm;
    };
    rec(
      "4e RPM(110 KIAS) - RPM(80 KIAS), fixed throttle",
      "+80..+400 RPM",
      at(110) - at(80),
      80,
      400,
    );
  });
});

// ================================================================== 5. glide
function glide(ias: number, flaps = 0, slipRudder = 0) {
  const s = airborne({ ias, alt: 5000, pAlt: 0, throttle: 0, flaps });
  const P = new Pilot(s);
  const vs: number[] = [],
    gs: number[] = [],
    bank: number[] = [];
  run(s, 70, (t) => {
    P.ias(ias);
    s.controls.throttle = 0;
    if (slipRudder) {
      s.controls.rudder = t > 5 ? slipRudder : 0;
      P.track(270);
    } else {
      P.bank(0);
      P.ball();
    }
    if (t > 40) {
      vs.push(s.ac.data.vsFpm);
      gs.push(s.ac.data.gsKt);
      bank.push(s.ac.data.rollDeg);
    }
  });
  const sink = -mean(vs);
  return {
    sink,
    ratio: (mean(gs) * 101.27) / sink,
    bank: mean(bank),
    trk: s.ac.data.trackTrue,
    s,
  };
}

describe("POH 5 — power-off glide", { timeout: T_LONG }, () => {
  it("5a-b best glide 68 KIAS", () => {
    const g = glide(68);
    rec("5a sink at 68 KIAS idle (fpm)", "700 fpm ±15%", g.sink, 595, 805);
    rec("5b glide ratio", "9:1 ±15%", g.ratio, 7.65, 10.35);
  });
});

// ================================================================== 6. static & dynamic stability
/** trim hands-off for `ias` at 3000 ft (throttle for level flight, trim for speed) */
function trimmed(ias: number) {
  const s = airborne({ ias, alt: 3000, pAlt: 3000, throttle: 0.5 });
  const P = new Pilot(s);
  // the pilot flies level at the speed while trimming the elevator force away
  run(s, 150, () => {
    P.alt(3000);
    P.bank(0);
    P.ball();
    // trim the steady elevator force away: the pitch integrator's output moves into the trim
    s.controls.trim = clamp(s.controls.trim + P.pI * 0.3 * DT, -1, 1);
    P.pI -= P.pI * 0.3 * DT;
    P.tI = clamp(P.tI + (ias - s.ac.data.iasKt) * 0.002 * DT, 0, 1);
    s.controls.throttle = P.tI;
    if (process.env.POH_TRACE && Math.round(s.time * 60) % 300 === 0) console.log("trim", ias, s.time.toFixed(0), s.ac.data.altFt.toFixed(0), s.ac.data.iasKt.toFixed(1), s.ac.data.pitchDeg.toFixed(1), s.ac.data.vsFpm.toFixed(0), s.controls.trim.toFixed(3), s.controls.elevator.toFixed(3), s.controls.throttle.toFixed(2), s.ac.data.rollDeg.toFixed(1), s.ac.s.crashed);
  });
  s.controls.trim = clamp(s.controls.trim + s.controls.elevator, -1, 1);
  s.controls.elevator = 0;
  s.controls.aileron = 0;
  s.controls.rudder = 0;
  const P2 = new Pilot(s);
  run(s, 60, () => P2.bank(0)); // ailerons only: the spiral mode is measured separately
  return s;
}

describe("POH 6 — stability", { timeout: T_LONG }, () => {
  it("6a-c phugoid after a 10 kt disturbance (hands-off)", () => {
    const s = trimmed(90);
    const ias0 = s.ac.data.iasKt;
    s.ac.s.tas += 10 * KT;
    const tr: { t: number; v: number }[] = [];
    const P = new Pilot(s);
    run(s, 180, (t) => {
      P.bank(0); // wings level on the ailerons, pitch and power untouched
      tr.push({ t, v: s.ac.data.iasKt - ias0 });
    });
    // peaks (local extrema) of the speed deviation
    const pk: { t: number; v: number }[] = [];
    for (let i = 30; i < tr.length - 30; i++) {
      const w = tr.slice(i - 30, i + 31).map((x) => x.v);
      if (
        (tr[i].v === Math.max(...w) || tr[i].v === Math.min(...w)) &&
        Math.abs(tr[i].v) > 0.3
      ) {
        if (!pk.length || tr[i].t - pk[pk.length - 1].t > 3) pk.push(tr[i]);
      }
    }
    const maxima = pk.filter((p) => p.v > 0);
    const period = maxima.length >= 2 ? maxima[1].t - maxima[0].t : NaN;
    const ratio = maxima.length >= 2 ? maxima[1].v / maxima[0].v : NaN;
    rec(
      "6a phugoid period (s)",
      "~30-40 s (Lanchester ~21-25 s at 90 kt)",
      period,
      20,
      45,
    );
    rec(
      "6b phugoid amplitude ratio / cycle",
      "lightly damped 0.2-0.95",
      ratio,
      0.2,
      0.95,
    );
    rec(
      "6c IAS error after 180 s (kt)",
      "< 3 kt: returns to trim",
      Math.abs(tr[tr.length - 1].v),
      0,
      3,
    );
  });
  it("6d short period: elevator pulse, pitch rate overshoots", () => {
    const s = trimmed(90);
    const el = s.controls.elevator;
    const q: number[] = [];
    run(s, 8, (t) => {
      s.controls.elevator = el + (t < 0.5 ? 0.25 : 0);
      if (t > 0.5) q.push(s.ac.s.q / DEG);
    });
    const qmax = Math.max(...q.map(Math.abs));
    let crossings = 0;
    for (let i = 1; i < q.length; i++)
      if (
        Math.sign(q[i]) !== Math.sign(q[i - 1]) &&
        Math.max(Math.abs(q[i]), Math.abs(q[i - 1])) > 0
      ) {
        // only count half-cycles with a meaningful lobe after the crossing
        const lobe = Math.max(...q.slice(i, i + 60).map(Math.abs));
        if (lobe > qmax * 0.1) crossings++;
      }
    rec(
      "6d short-period overshoots (half-cycles > 10%)",
      "< 2 cycles (≤ 3 half)",
      crossings,
      0,
      3,
    );
  });
  it("6e trim changes the trimmed speed monotonically", () => {
    const speeds: number[] = [];
    for (const trim of [-0.27, -0.18, -0.09, 0]) {
      const s = airborne({
        ias: 90,
        alt: 6000,
        pAlt: 3000,
        throttle: 0.55,
        trim,
      });
      const v: number[] = [];
      const P = new Pilot(s);
      run(s, 240, (t) => {
        if (t > 120) v.push(s.ac.data.iasKt);
        s.controls.elevator = 0;
        P.bank(0);
      });
      speeds.push(mean(v));
    }
    if (process.env.POH_TRACE) console.log("6e speeds", speeds);
    const dec = speeds.slice(1).every((v, i) => v < speeds[i] - 2);
    rec(
      "6e trimmed IAS falls with nose-up trim (monotonic)",
      "monotonic, >2 kt/step",
      dec ? speeds[0] - speeds[3] : 0,
      6,
      80,
    );
  });
});

// ================================================================== 7. roll, spiral, adverse yaw, turns
describe("POH 7 — lateral-directional", { timeout: T_LONG }, () => {
  it("7a-b full-aileron roll rate and adverse yaw at 100 KIAS", () => {
    const s = trimmed(100);
    let pmax = 0,
      slipMax = 0;
    run(s, 2.5, (t) => {
      s.controls.aileron = 1;
      pmax = Math.max(pmax, s.ac.s.p / DEG);
      if (t < 1.2) slipMax = Math.max(slipMax, s.ac.data.slip);
      return s.ac.data.rollDeg > 60;
    });
    rec("7a full-aileron roll rate (deg/s)", "30-50 deg/s", pmax, 30, 50);
    rec(
      "7b adverse yaw: ball right on right roll-in",
      "slip > 0.15",
      slipMax,
      0.15,
      1,
    );
  });
  it("7c spiral mode: a 15 deg bank hands-off", () => {
    const s = trimmed(90);
    const P = new Pilot(s);
    run(s, 15, () => P.bank(15));
    s.controls.aileron = 0;
    run(s, 30, () => {});
    rec(
      "7c bank 30 s after release (deg)",
      "holds/increases slowly: 12-35",
      s.ac.data.rollDeg,
      12,
      35,
    );
  });
  it("7d-f standard-rate coordinated turn at 90 KTAS", () => {
    const s = airborne({
      ias: 90 * Math.sqrt(sigmaAt(3000)),
      alt: 3000,
      pAlt: 3000,
      throttle: 0.6,
    });
    const P = new Pilot(s);
    const elL: number[] = [], iasL: number[] = [], aoaL: number[] = [], iasT: number[] = [], aoaT: number[] = [];
    run(s, 100, (t) => {
      P.alt(3000);
      P.bank(0);
      P.ball();
      if (t < 40) P.tI = clamp(P.tI + (90 - s.ac.data.tasKt) * 0.004 * DT, 0, 1);
      s.controls.throttle = P.tI;
      if (t > 85) elL.push(s.controls.elevator), iasL.push(s.ac.data.iasKt), aoaL.push(s.ac.data.aoaDeg);
    });
    const elLevel = mean(elL);
    const alt0 = s.ac.data.altFt;
    const bank: number[] = [],
      el: number[] = [],
      rate: number[] = [];
    let maxAltErr = 0;
    let bTgt = 0;
    run(s, 60, (t) => {
      bTgt = clamp(bTgt + (3 - s.ac.data.turnRateDps) * 2 * DT, -30, 30);
      P.bank(bTgt);
      P.ball();
      P.alt(alt0); // throttle left alone: a 15 deg turn needs no power in a C172
      if (t > 30) {
        bank.push(s.ac.data.rollDeg);
        el.push(s.controls.elevator);
        iasT.push(s.ac.data.iasKt);
        aoaT.push(s.ac.data.aoaDeg);
        rate.push(s.ac.data.turnRateDps);
        maxAltErr = Math.max(maxAltErr, Math.abs(s.ac.data.altFt - alt0));
      }
    });
    rec(
      "7d bank for 3 deg/s at 90 KTAS (deg)",
      "~14-15 deg (tan = V w / g)",
      mean(bank),
      12.5,
      16.5,
    );
    if (process.env.POH_TRACE) console.log("7e", mean(el), elLevel, mean(bank), mean(rate), mean(iasL), mean(iasT), mean(aoaL), mean(aoaT));
    rec(
      "7e back pressure in the turn (elevator)",
      "> 0 (load factor)",
      mean(el) - elLevel,
      0.005,
      0.3,
    );
    rec("7f altitude held in the turn (ft)", "< 50 ft", maxAltErr, 0, 50);
  });
});

// ================================================================== 8. rudder / sideslip
describe("POH 8 — rudder and sideslip", { timeout: T_LONG }, () => {
  it("8a-c full rudder in cruise", () => {
    const s = trimmed(90);
    const P = new Pilot(s);
    let roll3 = 0;
    run(s, 3, () => {
      s.controls.rudder = 1;
      s.controls.aileron = 0;
      roll3 = s.ac.data.rollDeg;
    });
    run(s, 8, () => {
      s.controls.rudder = 1;
      P.track(s.ac.data.trackTrue);
      P.bank(0);
    });
    const beta = Math.abs(wrap180(s.ac.data.hdgTrue - s.ac.data.trackTrue));
    rec("8a full-rudder sideslip (deg)", "10-15 deg", beta, 9.5, 16);
    rec(
      "8b ball deflection at full rudder",
      "full: |slip| > 0.9",
      Math.abs(s.ac.data.slip),
      0.9,
      1,
    );
    rec(
      "8c dihedral roll after 3 s rudder (deg)",
      "> 2 deg into the yaw",
      roll3,
      2,
      45,
    );
  });
  it("8d-e forward slip: more drag, more sink, usable on final", () => {
    const coord = glide(68);
    const slip = glide(68, 0, 1);
    rec(
      "8d sink in full forward slip / coordinated",
      "> 1.3x",
      slip.sink / coord.sink,
      1.3,
      3,
    );
    const f30 = glide(65, 3);
    const f30s = glide(65, 3, 1);
    rec(
      "8e flaps 30 forward slip sink (fpm)",
      "> 900 fpm, track held",
      f30s.sink,
      900,
      2000,
    );
    rec(
      "8e' flaps 30 slip: track error (deg)",
      "< 5 deg",
      Math.abs(wrap180(f30s.trk - 270)),
      0,
      5,
    );
    rec(
      '8e" flaps 30 slip: bank (deg)',
      "< 20 deg (wing low)",
      Math.abs(f30s.bank),
      1,
      20,
    );
    expect(f30s.sink).toBeGreaterThan(f30.sink);
  });
});

// ================================================================== 9. flaps
describe("POH 9 — flaps", { timeout: T_LONG }, () => {
  it("9a-b balloon and pitch-up when the flaps go to 30 hands-off", () => {
    const s = trimmed(80);
    const alt0 = s.ac.data.altFt,
      p0 = s.ac.data.pitchDeg;
    let maxAlt = 0,
      maxPitch = -99;
    s.controls.flaps = 3;
    run(s, 10, () => {
      maxAlt = Math.max(maxAlt, s.ac.data.altFt - alt0);
      maxPitch = Math.max(maxPitch, s.ac.data.pitchDeg - p0);
      if (process.env.POH_TRACE && Math.round(s.time * 60) % 30 === 0) console.log("9a", s.ac.data.altFt.toFixed(0), s.ac.data.iasKt.toFixed(1), s.ac.data.pitchDeg.toFixed(1), s.ac.data.aoaDeg.toFixed(1), s.ac.data.vsFpm.toFixed(0), s.ac.data.flapsDeg.toFixed(0), s.controls.trim.toFixed(3), s.controls.throttle.toFixed(2));
    });
    rec("9a balloon on flap extension (ft)", "> 40 ft", maxAlt, 40, 400);
    rec("9b pitch-up on flap extension (deg)", "> 1 deg", maxPitch, 1, 15);
  });
  it("9c-d flap drag and limits", () => {
    const f0 = glide(65, 0);
    const f3 = glide(65, 3);
    rec(
      "9c sink flaps 30 - flaps 0 at 65 KIAS idle (fpm)",
      "> +150 fpm",
      f3.sink - f0.sink,
      150,
      900,
    );
    rec(
      "9d Vfe 30/10 in data",
      "85 / 110 KIAS",
      AIRFRAME.vfe * 1000 + AIRFRAME.vfe10,
      85110,
      85110,
    );
  });
});

// ================================================================== 10. approach and landing
function approachAndLand(
  o: { xwind?: number; flare?: boolean; wingLow?: boolean } = {},
) {
  const rw = runway("PARD", "27");
  const s = new Sim();
  s.load(SCENARIOS.find((x) => x.id === "ils27-vtf")!);
  calm(s);
  if (o.xwind)
    (Object.assign(s.weather, { windDir: 360, windKt: o.xwind }),
      (s.weather.aloft = [{ altFt: 3000, dir: 360, kt: o.xwind }]));
  isa(s, PARD_ELEV, 0);
  const dist0 = 3; // nm from the threshold
  const p = destination(rw.threshold, 90, dist0);
  const a = s.ac.s;
  a.lat = p.lat;
  a.lon = p.lon;
  a.altFt = PARD_ELEV + 50 + dist0 * 6076 * Math.tan(3 * DEG);
  a.psi = 270 * DEG;
  a.tas = 65 * KT;
  a.gamma = -3 * DEG;
  a.theta = -2 * DEG;
  a.flapPos = 1;
  s.controls = { ...neutralControls(), flaps: 3, throttle: 0.35, trim: -0.1 };
  settle(s);
  const P = new Pilot(s);
  const appVs: number[] = [],
    appRpm: number[] = [],
    crab: number[] = [],
    wlBank: number[] = [],
    wlRud: number[] = [],
    wlTrk: number[] = [],
    wlHdg: number[] = [];
  let phase: "app" | "flare" | "roll" = "app";
  let tdPos: { lat: number; lon: number } | null = null;
  let tTd = 0,
    elFlare = 0,
    hdgAfter = NaN;
  run(s, 400, (t) => {
    const d = s.ac.data;
    const dist = distanceNm(rw.threshold, s.ac.s);
    const before = s.ac.s.lon > rw.threshold.lon ? 1 : -1; // east of the threshold = before it
    if (process.env.POH_TRACE && Math.round(t * 60) % 30 === 0)
      console.log(phase, t.toFixed(1), (before * dist * 6076).toFixed(0), d.aglFt.toFixed(0), d.iasKt.toFixed(1), d.vsFpm.toFixed(0), d.pitchDeg.toFixed(1), s.controls.throttle.toFixed(2), s.controls.elevator.toFixed(2), d.rpm.toFixed(0), (crossTrackNm(rw.end, rw.threshold, s.ac.s) * 6076).toFixed(0), d.hdgTrue.toFixed(1), s.ac.s.crashed);
    if (phase === "app") {
      const pathAlt = PARD_ELEV + 50 + before * dist * 6076 * Math.tan(3 * DEG);
      const gsFpm = d.gsKt * 101.27 * Math.tan(3 * DEG);
      P.ias(65);
      P.thrVs(-gsFpm + clamp((pathAlt - d.altFt) * 3, -300, 300));
      const xt =
        crossTrackNm(destination(rw.threshold, 90, 5), rw.threshold, s.ac.s) *
        6076; // + right of centreline
      const trkTgt = 270 - clamp(xt * 0.15, -15, 15);
      if (o.wingLow && d.aglFt < 400) {
        P.rudderHdg(270);
        P.track(trkTgt);
        if (d.aglFt < 300 && d.aglFt > 60) {
          wlBank.push(d.rollDeg);
          wlRud.push(s.controls.rudder);
          wlTrk.push(wrap180(d.trackTrue - 270));
          wlHdg.push(wrap180(d.hdgTrue - 270));
        }
      } else {
        P.track(trkTgt);
        P.ball();
        if (d.aglFt > 400 && d.aglFt < 700)
          crab.push(wrap180(d.hdgTrue - d.trackTrue));
      }
      if (dist < 2 && dist > 1 && before > 0) {
        appVs.push(d.vsFpm);
        appRpm.push(d.rpm);
      }
      if (d.aglFt < (o.flare === false ? 30 : 20)) {
        phase = "flare";
        elFlare = s.controls.elevator;
        P.oI = 0;
      }
    } else if (phase === "flare") {
      s.controls.throttle = 0;
      if (o.flare !== false) {
        // classic flare: sink rate proportional to height, then hold off just above the runway
        P.vs(-Math.max(110, d.aglFt * 14), 0.012, 0.006);
      } else s.controls.elevator = elFlare - 0.045; // botched: power off, no flare: flown onto the runway
      if (o.wingLow) {
        P.rudderHdg(270);
        P.bank(clamp(wlBank.length ? mean(wlBank) : 0, -10, 10));
      } else {
        P.bank(0);
        s.controls.rudder = 0;
      }
      if (s.ac.s.onGround) {
        phase = "roll";
        tdPos = { lat: s.ac.s.lat, lon: s.ac.s.lon };
        tTd = t;
      }
    } else {
      s.controls.throttle = 0;
      s.controls.elevator = 0;
      s.controls.aileron = 0;
      if (o.xwind) {
        s.controls.rudder = 0; // hands off the pedals: the aircraft weathervanes
        if (t - tTd > 6 && !Number.isFinite(hdgAfter))
          hdgAfter = wrap180(d.hdgTrue - 270);
      } else {
        P.rudderHdg(270);
        s.controls.brake = t - tTd > 1 ? 1 : 0;
      }
      if (s.ac.s.onGround && s.ac.s.tas < 0.3) return true;
      if (t - tTd > 12 && o.xwind) return true;
    }
  });
  const td = s.ac.touchdown;
  return {
    s,
    td,
    appVs: mean(appVs),
    appRpm: mean(appRpm),
    crab: mean(crab),
    wlBank: mean(wlBank),
    wlRud: mean(wlRud),
    wlTrk: Math.max(...wlTrk.map(Math.abs)),
    wlHdg: Math.max(...wlHdg.map(Math.abs)),
    rollFt: tdPos ? distanceNm(tdPos, s.ac.s) * 6076 : NaN,
    hdgAfter,
  };
}

describe("POH 10 — approach and landing", { timeout: T_LONG }, () => {
  it("10a-f 65 KIAS flaps 30 on a 3 deg path, flare, touchdown, braking roll", () => {
    const r = approachAndLand();
    expect(r.s.ac.s.crashed).toBeNull();
    // 3 deg at 65 kt GS is 5 x GS = ~345 fpm (500 fpm would be a 4.4 deg path, or 3 deg at 95 kt)
    rec(
      "10a VS on a 3 deg path at 65 KIAS (fpm)",
      "-345 fpm (5 x GS) ±15%",
      r.appVs,
      -400,
      -290,
    );
    rec("10b approach power (RPM)", "1400-1900 RPM", r.appRpm, 1400, 1900);
    rec("10c touchdown IAS (kt)", "45-50 KIAS", r.td!.ias, 43, 51);
    rec(
      "10d touchdown pitch (deg)",
      "nose-high 4-12 deg",
      r.td!.pitchDeg,
      4,
      12,
    );
    rec(
      "10e touchdown sink (fpm)",
      "smooth/normal > -360",
      r.td!.vsFpm,
      -360,
      0,
    );
    rec(
      "10f ground roll with max braking (ft)",
      "575 ft ±15%",
      r.rollFt,
      489,
      661,
    );
    expect(r.td!.bounced).toBe(false);
  });
  it("10g firm arrival without a flare bounces, does not crash", () => {
    const r = approachAndLand({ flare: false });
    expect(r.s.ac.s.crashed).toBeNull();
    rec(
      "10g no-flare touchdown sink (fpm)",
      "firm: < -300",
      r.td!.vsFpm,
      -1000,
      -300,
    );
    rec(
      "10g' bounce on a firm arrival",
      "bounced = 1",
      r.td!.bounced ? 1 : 0,
      1,
      1,
    );
  });
  it("10h-j crosswind 10 kt: crab, wing-low decrab, weathervane on the ground", () => {
    const c = approachAndLand({ xwind: 10 });
    rec(
      "10h crab angle on final (deg)",
      "asin(10/65) ~ 9 deg ±2",
      c.crab,
      7,
      11,
    );
    const w = approachAndLand({ xwind: 10, wingLow: true });
    expect(w.s.ac.s.crashed).toBeNull();
    rec(
      "10i wing-low: bank into wind (deg, + right)",
      "2-10 deg right wing low",
      w.wlBank,
      2,
      10,
    );
    rec(
      "10i' wing-low: opposite (left) rudder",
      "-0.95..-0.2",
      w.wlRud,
      -0.95,
      -0.2,
    );
    rec(
      '10i" wing-low: track & heading on the runway (deg)',
      "< 3 deg",
      Math.max(w.wlTrk, w.wlHdg),
      0,
      3,
    );
    rec(
      "10j weathervane: heading into wind 6 s after TD, no rudder (deg)",
      "> +1 deg (toward 360)",
      w.hdgAfter,
      1,
      40,
    );
  });
});

// ================================================================== 11. wind
describe("POH 11 — wind", { timeout: T_LONG }, () => {
  it("11a-b steady wind: drift and ground speed", () => {
    const s = airborne({
      ias: 90,
      alt: 3000,
      pAlt: 3000,
      hdg: 270,
      throttle: 0.6,
    });
    Object.assign(s.weather, { windDir: 180, windKt: 20 });
    s.weather.aloft = [{ altFt: 3000, dir: 180, kt: 20 }];
    const P = new Pilot(s);
    run(s, 40, () => {
      P.alt(3000);
      P.heading(270);
      P.ball();
    });
    const d = s.ac.data;
    const exp = Math.atan2(d.windKt, d.tasKt) / DEG; // wind from the south pushes a westbound aircraft right (north)
    rec(
      "11a drift (track - heading) vs wind triangle (deg)",
      "atan(W/TAS) ±1",
      wrap180(d.trackTrue - d.hdgTrue) - exp,
      -1,
      1,
    );
    rec(
      "11b ground speed vs wind triangle (kt)",
      "hypot(TAS, W) ±2",
      d.gsKt - Math.hypot(d.tasKt, d.windKt),
      -2,
      2,
    );
  });
  it("11c-f moderate turbulence: IAS perturbed a few kt, instruments move smoothly", () => {
    const s = airborne({ ias: 90, alt: 3000, pAlt: 3000, throttle: 0.6 });
    s.weather.turbulence = 0.5;
    const P = new Pilot(s);
    const ch: Record<"ias" | "vs" | "pitch" | "roll" | "hdg", number[]> = { ias: [], vs: [], pitch: [], roll: [], hdg: [] };
    run(s, 300, (t) => {
      P.alt(3000);
      P.bank(0);
      if (t <= 10) return;
      const d = s.ac.data;
      ch.ias.push(d.iasKt);
      ch.vs.push(d.vsFpm);
      ch.pitch.push(d.pitchDeg);
      ch.roll.push(d.rollDeg);
      ch.hdg.push(d.hdgTrue);
      if (process.env.POH_TRACE && Math.round(t * 60) % 120 === 0) {
        const w = (s.ac as unknown as { lastWind: { e: number; n: number; up: number } }).lastWind;
        console.log("11c", t.toFixed(0), d.iasKt.toFixed(1), d.vsFpm.toFixed(0), d.altFt.toFixed(0), d.pitchDeg.toFixed(1), d.rollDeg.toFixed(1), w.e.toFixed(2), w.n.toFixed(2), w.up.toFixed(2));
      }
    });
    const ias = ch.ias;
    // jitter = deviation of the indication from its own 1 s moving average
    let jitter = 0;
    for (let i = 30; i < ias.length - 30; i += 3)
      jitter = Math.max(jitter, Math.abs(ias[i] - mean(ias.slice(i - 30, i + 30))));
    const m = mean(ias);
    const sd = Math.sqrt(mean(ias.map((v) => (v - m) ** 2)));
    rec("11c IAS jitter vs 1 s average (kt)", "< 2 kt", jitter, 0, 2);
    rec("11d' IAS standard deviation, altitude held (kt)", "2-8 kt (vertical-gust energy goes into speed)", sd, 2, 8);
    // per-frame white noise has rms(Δ²x)/rms(Δx) = √3; a signal that is smooth over many frames → ≪ 1
    const rough = (x: number[]) => {
      const d1: number[] = [], d2: number[] = [];
      for (let i = 2; i < x.length; i++) {
        d1.push(wrap180(x[i] - x[i - 1]));
        d2.push(wrap180(x[i] - x[i - 1]) - wrap180(x[i - 1] - x[i - 2]));
      }
      const r = (a: number[]) => Math.sqrt(mean(a.map((v) => v * v)));
      return r(d2) / Math.max(1e-9, r(d1));
    };
    const worst = Math.max(...Object.values(ch).map(rough));
    if (process.env.POH_TRACE) console.log("11f", Object.fromEntries(Object.entries(ch).map(([k, v]) => [k, rough(v).toFixed(3)])));
    rec("11f roughness of IAS/VS/pitch/roll/hdg (worst)", "smooth: rms(Δ²)/rms(Δ) < 0.12 (white noise 1.73)", worst, 0, 0.12);
  });
  it("11d moderate turbulence, attitude held: IAS perturbed by a few kt", () => {
    const s = airborne({ ias: 90, alt: 3000, pAlt: 3000, throttle: 0.6 });
    s.weather.turbulence = 0.5;
    const P = new Pilot(s);
    const pitch0 = s.ac.data.pitchDeg;
    const ias: number[] = [];
    run(s, 300, (t) => {
      P.pitch(pitch0);
      P.bank(0);
      if (t > 10) ias.push(s.ac.data.iasKt);
    });
    const m = mean(ias);
    rec("11d IAS standard deviation, attitude held (kt)", "a few kt: 1-4", Math.sqrt(mean(ias.map((v) => (v - m) ** 2))), 1, 4);
  });
  it("11e low-level wind shear on final is felt", () => {
    // stabilised 400 fpm descent at 70 KIAS above the shear layer, then controls frozen: descending through
    // the lowest 500 ft the headwind falls from 20 to 5 kt and the airspeed with it
    const s = airborne({ ias: 70, alt: PARD_ELEV + 1100, pAlt: 1100, throttle: 0.3, flaps: 1 });
    Object.assign(s.weather, { windDir: 270, windKt: 20, shearKt: 15 });
    s.weather.aloft = [{ altFt: 3000, dir: 270, kt: 20 }];
    const P = new Pilot(s);
    const iasA: number[] = [], el: number[] = [], thr: number[] = [];
    run(s, 60, (t) => {
      P.ias(70);
      P.bank(0);
      P.thrVs(-400);
      if (t > 45) (iasA.push(s.ac.data.iasKt), el.push(s.controls.elevator), thr.push(s.controls.throttle));
    });
    const ias0 = mean(iasA);
    const elF = mean(el), thrF = mean(thr);
    let minIas = 999;
    run(s, 120, () => {
      s.controls.elevator = elF;
      s.controls.throttle = thrF;
      P.bank(0);
      if (s.ac.data.aglFt < 450) minIas = Math.min(minIas, s.ac.data.iasKt);
      if (process.env.POH_TRACE && Math.round(s.time * 60) % 60 === 0) console.log("11e", s.ac.data.aglFt.toFixed(0), s.ac.data.iasKt.toFixed(1), s.ac.data.vsFpm.toFixed(0), s.ac.data.windKt.toFixed(1), s.ac.data.pitchDeg.toFixed(1));
      return s.ac.data.aglFt < 100;
    });
    rec("11e IAS loss descending through 15 kt shear (kt)", "> 5 kt", ias0 - minIas, 5, 25);
  });
});

// ================================================================== 12. energy, density altitude
describe("POH 12 — energy and density altitude", { timeout: T_LONG }, () => {
  it("12a zoom climb trades speed for height", () => {
    const s = airborne({ ias: 110, alt: 3000, pAlt: 0, throttle: 0 });
    const P = new Pilot(s);
    const h0 = s.ac.data.altFt,
      v0 = s.ac.s.tas;
    let v1 = 0,
      h1 = 0;
    run(s, 40, () => {
      P.pitch(15);
      P.bank(0);
      s.controls.throttle = 0;
      v1 = s.ac.s.tas;
      h1 = s.ac.data.altFt;
      return s.ac.data.iasKt < 60;
    });
    const ideal = (v0 * v0 - v1 * v1) / (2 * 9.80665) / 0.3048;
    rec(
      "12a zoom height / ideal energy height (idle)",
      "0.5-1.0 (idle: drag + windmilling losses)",
      (h1 - h0) / ideal,
      0.5,
      1.0,
    );
  });
  it("12b-c hot and high: longer take-off, weaker climb", () => {
    const sl = takeoff().roll;
    const hh = takeoff({ pAlt: 5000, devC: 15 }).roll; // 5000 ft, 20 C OAT: density altitude ~7300 ft
    rec(
      "12b take-off roll 5000 ft 20 C / SL ISA",
      "POH ~1.6x (1.4-2.0)",
      hh / sl,
      1.4,
      2.0,
    );
    const c6 = climb(73, 6000);
    rec(
      "12c climb at Vy, 6000 ft ISA (fpm)",
      "POH ~515 fpm ±15%",
      c6.vs,
      440,
      600,
    );
  });
});

// ================================================================== 13. engine
describe("POH 13 — engine", { timeout: T_LONG }, () => {
  it("13a throttle response lag ~1 s", () => {
    const s = airborne({ ias: 80, alt: 3000, pAlt: 3000, throttle: 0.3 });
    const P = new Pilot(s);
    run(s, 15, () => {
      P.ias(80);
      s.controls.throttle = 0.3;
    });
    const r0 = s.ac.data.rpm;
    let r63 = NaN;
    const hist: { t: number; r: number }[] = [];
    run(s, 8, (t) => {
      P.ias(80);
      s.controls.throttle = 1;
      hist.push({ t, r: s.ac.data.rpm });
    });
    const r1 = hist[hist.length - 1].r;
    r63 = hist.find((h) => h.r - r0 > 0.63 * (r1 - r0))?.t ?? NaN;
    rec(
      "13a RPM 63% rise time after full throttle (s)",
      "~1 s (0.5-1.5)",
      r63,
      0.5,
      1.5,
    );
  });
  it("13b mixture / carb heat not required", () => {
    const c = neutralControls() as unknown as Record<string, unknown>;
    rec(
      "13b controls without mixture/carb heat",
      "not required: 1",
      "mixture" in c || "carbHeat" in c ? 0 : 1,
      1,
      1,
    );
  });
});
