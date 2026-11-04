// Flight test of the airframe the way a pilot flies it: complete manoeuvres, each flown headless by a simple
// closed-loop pilot model (PI loops on attitude, speed, path and ball), measured against what a Cessna 172S
// does, and asserted within a tolerance. The autopilot laws live in src/avionics (another package); the
// first block pins down the airframe behaviour they rely on.
// Set PILOT_REPORT=1 to print the measured matrix, PILOT_TRACE=<manoeuvre> to trace one manoeuvre.
import { describe, it, expect, afterAll } from "vitest";
import { Sim, SCENARIOS } from "../src/sim/sim";
import { neutralControls } from "../src/sim/aircraft";
import { KT } from "../src/sim/environment";
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
const sd = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((v) => (v - m) ** 2)));
};
const maxAbs = (a: number[]) => a.reduce((x, y) => Math.max(x, Math.abs(y)), 0);
/** per-frame white noise has rms(Δ²x)/rms(Δx) = √3; an indication that moves smoothly over many frames ≪ 1 */
function roughness(x: number[]) {
  const d1: number[] = [],
    d2: number[] = [];
  for (let i = 2; i < x.length; i++) {
    d1.push(wrap180(x[i] - x[i - 1]));
    d2.push(wrap180(x[i] - x[i - 1]) - wrap180(x[i - 1] - x[i - 2]));
  }
  const r = (a: number[]) => Math.sqrt(mean(a.map((v) => v * v)));
  return r(d2) / Math.max(1e-9, r(d1));
}
const trace = (name: string) =>
  process.env.PILOT_TRACE === name || process.env.PILOT_TRACE === "all";

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
  expect
    .soft(ok, `${item}: ${value.toFixed(2)} not in [${lo}, ${hi}] (${target})`)
    .toBe(true);
}
afterAll(() => {
  if (!process.env.PILOT_REPORT) return;
  const rows = MATRIX.map(
    (m) =>
      `${m.ok ? "OK " : "XX "} ${m.item.padEnd(58)} ${m.value.toFixed(2).padStart(9)}   ${m.target}`,
  );
  console.log("\n" + rows.join("\n"));
});

// ------------------------------------------------------------------ set-up
const PARD_ELEV = 420;
const RW = runway("PARD", "27");
function calm(s: Sim, wind?: { dir: number; kt: number }) {
  Object.assign(s.weather, {
    windKt: wind?.kt ?? 0,
    windDir: wind?.dir ?? 270,
    gustKt: 0,
    turbulence: 0,
    shearKt: 0,
    qnh: 29.92,
    oatSeaLevelC: 15,
  });
  s.weather.aloft = [{ altFt: 3000, dir: wind?.dir ?? 270, kt: wind?.kt ?? 0 }];
}
/** after placing the aircraft by hand: restart the air-data filters (wind history, VS, IAS) */
function settle(s: Sim) {
  (s.ac as unknown as { lastWind: unknown }).lastWind = null;
  s.step(0.01);
  const ac = s.ac as unknown as {
    lastAlt: number;
    vsFilt: number;
    iasFilt: number;
  };
  ac.lastAlt = s.ac.s.altFt;
  ac.vsFilt = (s.ac.s.tas * Math.sin(s.ac.s.gamma) * 60) / 0.3048;
  ac.iasFilt = -1;
  s.step(0.01);
}
function airborne(o: {
  ias: number;
  alt?: number;
  hdg?: number;
  flaps?: number;
  throttle?: number;
  trim?: number;
  turbulence?: number;
}) {
  const s = new Sim();
  s.load(SCENARIOS.find((x) => x.id === "ils27-vtf")!);
  calm(s);
  s.weather.turbulence = o.turbulence ?? 0;
  const a = s.ac.s;
  a.altFt = o.alt ?? 3000;
  a.psi = (o.hdg ?? 270) * DEG;
  a.tas = (o.ias * KT) / Math.sqrt(1 - (a.altFt / 1000) * 0.029);
  a.gamma = 0;
  a.theta = 2 * DEG;
  a.q = a.p = a.phi = a.beta = 0;
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
/** on a 3 deg final to PARD 27 at `distNm` from the threshold (path aims 50 ft over the threshold) */
function onFinal(o: {
  distNm: number;
  ias: number;
  flaps: number;
  wind?: { dir: number; kt: number };
  turbulence?: number;
}) {
  const s = new Sim();
  s.load(SCENARIOS.find((x) => x.id === "ils27-vtf")!);
  calm(s, o.wind);
  s.weather.turbulence = o.turbulence ?? 0;
  const p = destination(RW.threshold, 90, o.distNm);
  const a = s.ac.s;
  a.lat = p.lat;
  a.lon = p.lon;
  a.altFt = PARD_ELEV + 50 + o.distNm * 6076 * Math.tan(3 * DEG);
  a.psi = 270 * DEG;
  a.tas = o.ias * KT;
  a.gamma = -3 * DEG;
  a.theta = -1 * DEG;
  a.q = a.p = a.phi = a.beta = 0;
  a.flapPos = o.flaps / 3;
  s.controls = {
    ...neutralControls(),
    flaps: o.flaps,
    throttle: 0.4,
    trim: -0.1,
  };
  settle(s);
  return s;
}
function onRunway(flaps = 0) {
  const s = new Sim();
  s.load(SCENARIOS.find((x) => x.id === "rwy27")!);
  calm(s);
  s.controls = { ...neutralControls(), flaps, throttle: 0, trim: 0 };
  s.ac.s.flapPos = flaps / 3;
  settle(s);
  return s;
}
/** height above the 3 deg path to PARD 27 (ft, + above) and distance to the threshold (nm, + before it) */
function pathError(s: Sim) {
  const before = s.ac.s.lon > RW.threshold.lon ? 1 : -1;
  const dist = before * distanceNm(RW.threshold, s.ac.s);
  return {
    dist,
    above: s.ac.s.altFt - (PARD_ELEV + 50 + dist * 6076 * Math.tan(3 * DEG)),
  };
}
/** lateral offset from the runway 27 centreline (ft, + right of it, i.e. north) */
const xtrack = (s: Sim) =>
  crossTrackNm(destination(RW.threshold, 90, 5), RW.threshold, s.ac.s) * 6076;

const run = (s: Sim, sec: number, f: (t: number) => boolean | void) => {
  for (let t = 0; t < sec; t += DT) {
    if (f(t)) return t;
    s.step(DT);
    if (s.ac.s.crashed) return t;
  }
  return sec;
};

// ------------------------------------------------------------------ the pilot
/** A simple pilot: cascaded PI loops, with the anticipation (trend terms) a pilot gets from watching the
 *  needles move. Each call sets the controls for the coming frame. */
class Pilot {
  pI = 0;
  oI = 0;
  rI = 0;
  tI: number;
  trkI = 0;
  private lastIas: number;
  iasTrend = 0;
  constructor(public s: Sim) {
    this.tI = s.controls.throttle;
    this.lastIas = s.ac.data.iasKt;
  }
  get d() {
    return this.s.ac.data;
  }
  /** call once per frame before the loops that use the airspeed trend */
  watch() {
    const v = this.d.iasKt;
    this.iasTrend +=
      ((v - this.lastIas) / DT - this.iasTrend) * Math.min(1, DT / 1);
    this.lastIas = v;
  }
  pitch(tgt: number, kp = 0.06) {
    const e = tgt - this.d.pitchDeg;
    this.pI = clamp(this.pI + e * 0.03 * DT, -1.2, 1.2);
    this.s.controls.elevator = clamp(
      e * kp - (this.s.ac.s.q / DEG) * 0.025 + this.pI,
      -1,
      1,
    );
  }
  /** pitch for airspeed with a trend term (the pilot sees the needle moving) */
  ias(tgt: number, lo = -15, hi = 18) {
    const err = this.d.iasKt - tgt + 3 * this.iasTrend;
    this.oI = clamp(this.oI + err * 0.12 * DT, lo, hi);
    this.pitch(clamp(err * 0.5 + this.oI, lo, hi));
  }
  vs(tgt: number, kp = 0.002, ki = 0.0015) {
    const d = this.d;
    const err = tgt - d.vsFpm;
    this.oI = clamp(this.oI + err * ki * DT, -12, 12);
    const fpa =
      Math.asin(clamp(tgt / (Math.max(40, d.tasKt) * 101.27), -0.5, 0.5)) / DEG;
    this.pitch(clamp(fpa + d.aoaDeg + this.oI + err * kp, -15, 20));
  }
  alt(tgt: number) {
    this.vs(clamp((tgt - this.d.altFt) * 4, -700, 700));
  }
  bank(tgt: number) {
    this.s.controls.aileron = clamp(
      (tgt - this.d.rollDeg) * 0.04 - (this.s.ac.s.p / DEG) * 0.012,
      -1,
      1,
    );
  }
  heading(tgt: number, maxBank = 20) {
    this.bank(clamp(wrap180(tgt - this.d.hdgTrue) * 1.5, -maxBank, maxBank));
  }
  track(tgt: number) {
    const e = wrap180(tgt - this.d.trackTrue);
    this.trkI = clamp(this.trkI + e * 0.3 * DT, -12, 12);
    this.bank(clamp(e * 1.5 + this.trkI, -20, 20));
  }
  /** fly the extended centreline of runway 27 (track toward it, proportional to the offset) */
  centreline(k = 0.15) {
    this.track(270 - clamp(xtrack(this.s) * k, -15, 15));
  }
  ball() {
    const sl = this.d.slip;
    this.rI = clamp(this.rI + sl * 0.8 * DT, -1, 1);
    this.s.controls.rudder = clamp(sl * 0.6 + this.rI, -1, 1);
  }
  rudderHdg(tgt: number) {
    const e = wrap180(tgt - this.d.hdgTrue);
    this.rI = clamp(this.rI + e * 0.05 * DT, -1, 1);
    this.s.controls.rudder = clamp(
      e * 0.15 - this.d.turnRateDps * 0.08 + this.rI,
      -1,
      1,
    );
  }
  /** throttle for airspeed (pitch flies the path), with the speed trend */
  thrIas(tgt: number) {
    const e = tgt - this.d.iasKt - 4 * this.iasTrend;
    this.tI = clamp(this.tI + e * 0.006 * DT, 0, 1);
    this.s.controls.throttle = clamp(this.tI + e * 0.03, 0, 1);
  }
}

// ================================================================== A. what the autopilot relies on
/** attitude hold on the elevator (PI + rate damping) and wings level on the ailerons, like an AP pitch servo */
function apLike(
  o: { alt?: number; throttle?: number; turbulence?: number } = {},
) {
  const s = airborne({
    ias: 90,
    alt: o.alt ?? 3000,
    throttle: o.throttle ?? 0.6,
    turbulence: o.turbulence,
  });
  s.weather.aloft = [{ altFt: 3000, dir: 270, kt: 0 }];
  return s;
}

describe(
  "A — airframe behaviour the autopilot relies on",
  { timeout: T_LONG },
  () => {
    it("A1 short period: a 3 deg attitude step is captured in < 4 s with < 30 % overshoot", () => {
      const s = apLike();
      const P = new Pilot(s);
      let tgt = 0;
      run(s, 40, (t) => {
        if (t < 0.1) tgt = s.ac.data.pitchDeg;
        P.pitch(tgt);
        P.bank(0);
      });
      const p0 = s.ac.data.pitchDeg;
      let tCap = NaN,
        peak = 0;
      run(s, 10, (t) => {
        P.pitch(p0 + 3);
        P.bank(0);
        const d = s.ac.data.pitchDeg - p0;
        peak = Math.max(peak, d);
        if (!Number.isFinite(tCap) && d > 2.7) tCap = t;
      });
      rec(
        "A1 short period: 3 deg attitude capture time (s)",
        "< 4 s",
        tCap,
        0,
        4,
      );
      rec(
        "A1' short period: overshoot (%)",
        "< 30 %",
        ((peak - 3) / 3) * 100,
        -5,
        30,
      );
    });

    it("A2 speed mode, attitude held at Vy: a 5 kt disturbance decays without oscillating (tau 4-20 s)", () => {
      const s = apLike({ alt: 1500, throttle: 1 });
      const P = new Pilot(s);
      let pt = 9;
      run(s, 150, () => {
        pt = clamp(pt + (s.ac.data.iasKt - 74) * 0.05 * DT, 0, 15);
        P.pitch(pt);
        P.bank(0);
      });
      const v0 = s.ac.data.iasKt;
      s.ac.s.tas += 5 * KT;
      const dv: number[] = [];
      run(s, 40, () => {
        P.pitch(pt);
        P.bank(0);
        dv.push(s.ac.data.iasKt - v0);
      });
      const iPk = dv.indexOf(Math.max(...dv)); // the indication lags the step by the pitot-static time constant
      const i4 = dv.findIndex((v, i) => i > iPk && v < 4);
      const ie = dv.findIndex((v, i) => i > i4 && v < 4 / Math.E);
      rec(
        "A2 speed mode with attitude held: decay tau (s)",
        "4-20 s, first order",
        (ie - i4) * DT,
        4,
        20,
      );
      rec(
        "A2' speed mode: undershoot after 5 s (kt)",
        "> -1.5 (no oscillation)",
        Math.min(...dv.slice(Math.round(5 / DT))),
        -1.5,
        5,
      );
    });

    it("A3 a pitch-for-speed law with a speed-trend term converges at Vy and climbs at the POH rate", () => {
      const s = apLike({ alt: 1500, throttle: 1 });
      const P = new Pilot(s);
      let pt = s.ac.data.pitchDeg,
        last = s.ac.data.iasKt,
        trend = 0;
      const ias: number[] = [],
        vs: number[] = [];
      run(s, 120, (t) => {
        const d = s.ac.data;
        trend += ((d.iasKt - last) / DT - trend) * DT;
        last = d.iasKt;
        pt = clamp(pt + (d.iasKt - 74 + 4 * trend) * 0.3 * DT, -5, 15);
        P.pitch(pt);
        P.bank(0);
        if (t > 80) (ias.push(d.iasKt), vs.push(d.vsFpm));
      });
      rec(
        "A3 reference FLC at Vy: IAS error after 80 s (kt)",
        "< 2 kt",
        maxAbs(ias.map((v) => v - 74)),
        0,
        2,
      );
      rec(
        "A3' reference FLC at Vy: climb (fpm)",
        "POH ~700 fpm at 1500-2500 ft (560-800)",
        mean(vs),
        560,
        800,
      );
    });

    it("A4 autopilot VS mode climbs 1000 ft and captures the altitude without overshoot", () => {
      const s = apLike({ throttle: 0.85 });
      s.ap.toggleAp(s.ac.data);
      s.ap.pressHdg(s.ac.data);
      s.ap.pressAlt(s.ac.data);
      run(s, 30, () => {});
      s.ap.altSel = 4000;
      s.ap.pressVs(s.ac.data);
      s.ap.vsSel = 500;
      const vs: number[] = [];
      let maxAlt = 0;
      run(s, 240, (t) => {
        if (t > 20 && t < 100) vs.push(s.ac.data.vsFpm);
        maxAlt = Math.max(maxAlt, s.ac.data.altFt);
      });
      rec("A4 AP VS 500: mean VS (fpm)", "500 ±40", mean(vs), 460, 540);
      rec(
        "A4' AP ALT capture overshoot (ft)",
        "< 30 ft",
        maxAlt - 4000,
        -20,
        30,
      );
      expect(s.ac.data.altFt).toBeGreaterThan(3980);
      expect(s.ap.vert).toBe("ALT");
    });

    it("A5 autopilot altitude hold in moderate turbulence: within ±80 ft, instruments move smoothly", () => {
      const s = apLike({ turbulence: 0.5 });
      s.ap.toggleAp(s.ac.data);
      s.ap.pressHdg(s.ac.data);
      s.ap.pressAlt(s.ac.data);
      const alt0 = s.ap.altHold;
      let maxErr = 0,
        maxDPitch = 0,
        maxDVs = 0,
        maxDIas = 0;
      let prev = { ...s.ac.data };
      run(s, 180, (t) => {
        const d = s.ac.data;
        if (t > 10) {
          maxErr = Math.max(maxErr, Math.abs(d.altFt - alt0));
          maxDPitch = Math.max(maxDPitch, Math.abs(d.pitchDeg - prev.pitchDeg));
          maxDVs = Math.max(maxDVs, Math.abs(d.vsFpm - prev.vsFpm));
          maxDIas = Math.max(maxDIas, Math.abs(d.iasKt - prev.iasKt));
        }
        prev = { ...d };
      });
      rec(
        "A5 AP ALT hold, moderate turbulence: altitude error (ft)",
        "< 80 ft",
        maxErr,
        0,
        80,
      );
      rec(
        "A5' largest pitch change per frame (deg)",
        "< 0.25 (15 deg/s)",
        maxDPitch,
        0,
        0.25,
      );
      rec('A5" largest VS change per frame (fpm)', "< 40", maxDVs, 0, 40);
      rec("A5\"' largest IAS change per frame (kt)", "< 0.3", maxDIas, 0, 0.3);
      expect(s.ac.s.crashed).toBeNull();
    });
  },
);

// ================================================================== B. manoeuvres
describe("B1 — normal take-off and climb-out", { timeout: T_LONG }, () => {
  it("rotates at 55 KIAS, lifts off, accelerates to Vy and climbs to 1000 ft AGL on the centreline", () => {
    const s = onRunway(0);
    const P = new Pilot(s);
    const p0 = { lat: s.ac.s.lat, lon: s.ac.s.lon };
    let phase: "roll" | "rotate" | "air" = "roll";
    let lofIas = NaN,
      lofPitch = NaN,
      rollFt = NaN,
      tLof = NaN,
      t1000 = NaN,
      maxDev = 0,
      maxGndPitch = 0,
      sinkAfterLof = 0,
      rotEl = 0;
    const vs: number[] = [],
      ias: number[] = [],
      pitch: number[] = [],
      rud: number[] = [],
      ch: Record<"ias" | "vs" | "hdg", number[]> = { ias: [], vs: [], hdg: [] };
    s.controls.throttle = 1;
    run(s, 200, (t) => {
      const d = s.ac.data;
      P.watch();
      if (trace("takeoff") && Math.round(t * 60) % 60 === 0)
        console.log(
          "to",
          phase,
          t.toFixed(0),
          d.iasKt.toFixed(1),
          d.aglFt.toFixed(0),
          d.vsFpm.toFixed(0),
          d.pitchDeg.toFixed(1),
          s.controls.elevator.toFixed(2),
          s.controls.rudder.toFixed(2),
          xtrack(s).toFixed(1),
        );
      if (phase === "roll") {
        P.rudderHdg(270);
        s.controls.elevator = 0;
        s.controls.aileron = 0;
        if (d.iasKt >= 55) phase = "rotate";
      } else if (phase === "rotate") {
        P.rudderHdg(270);
        P.pitch(9);
        rotEl = Math.max(rotEl, s.controls.elevator);
        P.bank(0);
      } else {
        // initial climb attitude, then pitch for Vy; wings level on the centreline, ball centred
        if (d.iasKt < 70 && t - tLof < 8) {
          P.pitch(9);
          P.oI = d.pitchDeg;
        } else P.ias(74, -5, 15);
        P.centreline();
        P.ball();
        if (d.aglFt < 30) sinkAfterLof = Math.min(sinkAfterLof, d.vsFpm);
        if (d.aglFt > 500 && d.aglFt < 1000) {
          vs.push(d.vsFpm);
          ias.push(d.iasKt);
          pitch.push(d.pitchDeg);
          rud.push(s.controls.rudder);
          ch.ias.push(d.iasKt);
          ch.vs.push(d.vsFpm);
          ch.hdg.push(d.hdgTrue);
        }
        if (d.aglFt >= 1000) {
          t1000 = t;
          return true;
        }
      }
      if (s.ac.s.onGround) {
        maxGndPitch = Math.max(maxGndPitch, d.pitchDeg);
        maxDev = Math.max(maxDev, Math.abs(xtrack(s)));
      } else if (phase !== "air") {
        phase = "air";
        lofIas = d.iasKt;
        lofPitch = d.pitchDeg;
        tLof = t;
        rollFt = distanceNm(p0, s.ac.s) * 6076;
      }
    });
    expect(s.ac.s.crashed).toBeNull();
    rec(
      "B1a ground roll, flaps 0, SL ISA, 2550 lb (ft)",
      "POH ~960 ft (flaps 10) / ~1000 flaps 0: 850-1200",
      rollFt,
      850,
      1200,
    );
    rec("B1b lift-off IAS, flaps 0, 9 deg attitude (kt)", "55-65 KIAS (flaps 10: ~51-57)", lofIas, 55, 65);
    rec(
      "B1c lift-off pitch (deg)",
      "5-11 deg, no tail strike",
      lofPitch,
      5,
      11,
    );
    rec(
      "B1c' highest pitch on the wheels (deg)",
      "< 12.5 deg (tail strike)",
      maxGndPitch,
      0,
      12.5,
    );
    rec(
      "B1d back pressure to rotate (elevator)",
      "light-moderate: 0.1-0.6",
      rotEl,
      0.1,
      0.6,
    );
    rec(
      "B1e sink after lift-off below 30 ft (fpm)",
      "positive rate: > -50",
      sinkAfterLof,
      -50,
      0,
    );
    rec("B1f centreline deviation on the roll (ft)", "< 15 ft", maxDev, 0, 15);
    rec(
      "B1g climb 500-1000 ft AGL at Vy (fpm)",
      "POH ~730 fpm ±15%",
      mean(vs),
      620,
      840,
    );
    rec("B1h Vy held (IAS sd, kt)", "< 2 kt", sd(ias), 0, 2);
    rec(
      "B1i climb pitch attitude at Vy (deg)",
      "8-12 deg nose up",
      mean(pitch),
      8,
      12,
    );
    rec(
      "B1j right rudder in the full-power climb",
      "0.05-0.6",
      mean(rud),
      0.05,
      0.6,
    );
    rec("B1k brake release to 1000 ft AGL (s)", "~90-120 s", t1000, 85, 125);
    rec(
      "B1l roughness of IAS/VS/hdg in the climb (worst)",
      "smooth < 0.12",
      Math.max(...Object.values(ch).map(roughness)),
      0,
      0.12,
    );
  });
});

describe("B1' — crosswind take-off, 10 kt at 90 deg", { timeout: T_LONG }, () => {
  it("aileron into the wind, rudder on the centreline; at lift-off the aircraft crabs smoothly, no sideways jump", () => {
    const s = onRunway(1);
    calm(s, { dir: 360, kt: 10 });
    settle(s);
    const P = new Pilot(s);
    s.controls.throttle = 1;
    let lof = NaN,
      maxDev = 0,
      jumpHdg = 0,
      jumpTrk = 0,
      lastHdg = s.ac.data.hdgTrue,
      lastTrk = NaN,
      crab = NaN,
      devAfter = 0;
    run(s, 90, (t) => {
      const d = s.ac.data;
      P.watch();
      if (s.ac.s.onGround) {
        // full aileron into the wind at the start, eased out as the speed builds
        s.controls.aileron = clamp(1 - d.iasKt / 60, 0.1, 1);
        P.rudderHdg(270 + clamp(-xtrack(s) * 0.3, -8, 8));
        if (d.iasKt >= 51) P.pitch(8);
        else s.controls.elevator = 0;
        maxDev = Math.max(maxDev, Math.abs(xtrack(s)));
      } else {
        if (!Number.isFinite(lof)) lof = t;
        P.pitch(8);
        P.track(270);
        P.ball();
        if (t - lof < 3) devAfter = Math.max(devAfter, Math.abs(xtrack(s)));
        if (t - lof > 10 && !Number.isFinite(crab)) crab = wrap180(d.hdgTrue - d.trackTrue);
      }
      if (Number.isFinite(lof) ? t - lof < 2 : d.iasKt > 45) {
        jumpHdg = Math.max(jumpHdg, Math.abs(wrap180(d.hdgTrue - lastHdg)));
        if (Number.isFinite(lastTrk)) jumpTrk = Math.max(jumpTrk, Math.abs(wrap180(d.trackSmooth - lastTrk)));
      }
      lastHdg = d.hdgTrue;
      lastTrk = d.trackSmooth;
      if (Number.isFinite(crab)) return true;
    });
    expect(s.ac.s.crashed).toBeNull();
    rec("B1'a crosswind take-off: centreline deviation on the roll (ft)", "< 15 ft", maxDev, 0, 15);
    // released from the runway the nose weathervanes into the crab within ~1 s (yaw rate < ~35 deg/s), no step
    rec("B1'b heading change in one frame around lift-off (deg)", "weathervane, no step: < 0.6 deg/frame", jumpHdg, 0, 0.6);
    rec("B1'c track step in one frame around lift-off (deg)", "no sideways kick: < 0.3 deg/frame", jumpTrk, 0, 0.3);
    rec("B1'd drift off the centreline in the first 3 s airborne (ft)", "< 15 ft", devAfter, 0, 15);
    rec("B1'e crab angle 10 s after lift-off (deg, + nose right of track)", "into the wind: asin(10/62) ~ 9 deg ±3", crab, 6, 12);
  });
});

describe("B2 — steep turns 45 deg", { timeout: T_LONG }, () => {
  for (const [dir, addPower] of [[1, false], [-1, true]] as const)
    it(`${dir > 0 ? "right" : "left"} 360: altitude ±100 ft with back pressure, ${addPower ? "power added to hold 95 KIAS" : "speed loss at constant power"}`, () => {
      const s = airborne({ ias: 95, alt: 3000, throttle: 0.62 });
      const P = new Pilot(s);
      // trimmed level at 95 KIAS: throttle for speed, elevator for altitude, then the throttle stays put
      run(s, 60, () => {
        P.watch();
        P.alt(3000);
        P.thrIas(95);
        P.heading(270);
        P.ball();
      });
      const el0 = s.controls.elevator;
      const ias0 = s.ac.data.iasKt;
      const rpm0 = s.ac.data.rpm;
      const rpm: number[] = [];
      let turned = 0,
        last = s.ac.data.hdgTrue,
        tRoll = NaN,
        phase: "in" | "out" = "in";
      const alt: number[] = [],
        ias: number[] = [],
        bank: number[] = [],
        g: number[] = [],
        el: number[] = [],
        slip: number[] = [],
        rate: number[] = [];
      let hdgOut = NaN;
      run(s, 120, (t) => {
        const d = s.ac.data;
        P.watch();
        turned += wrap180(d.hdgTrue - last) * dir;
        last = d.hdgTrue;
        P.alt(3000);
        P.ball();
        if (addPower) P.thrIas(95);
        if (phase === "in") {
          P.bank(45 * dir);
          if (turned > 30 && turned < 330) {
            alt.push(d.altFt);
            ias.push(d.iasKt);
            bank.push(d.rollDeg * dir);
            g.push(d.gLoad);
            el.push(s.controls.elevator);
            slip.push(d.slip);
            rate.push(d.turnRateDps * dir);
            rpm.push(d.rpm);
          }
          if (Math.abs(d.rollDeg) > 44 && !Number.isFinite(tRoll)) tRoll = t;
          if (turned > 360 - 20) phase = "out"; // lead the roll-out by ~ half the bank angle
        } else {
          P.bank(0);
          if (Math.abs(d.rollDeg) < 2) {
            hdgOut = wrap180(d.hdgTrue - 270);
            return true;
          }
        }
        if (trace("steep") && Math.round(t * 60) % 60 === 0)
          console.log(
            "steep",
            dir,
            t.toFixed(0),
            turned.toFixed(0),
            d.rollDeg.toFixed(1),
            d.altFt.toFixed(0),
            d.iasKt.toFixed(1),
            d.gLoad.toFixed(2),
            s.controls.elevator.toFixed(2),
            d.slip.toFixed(2),
          );
      });
      expect(s.ac.s.crashed).toBeNull();
      const tag = dir > 0 ? "R" : "L";
      rec(
        `B2a ${tag} roll-in time to 45 deg (s)`,
        "2-6 s (pilot-rate roll-in)",
        tRoll,
        2,
        6,
      );
      rec(
        `B2b ${tag} altitude held (max dev, ft)`,
        "ACS ±100 ft",
        maxAbs(alt.map((a) => a - 3000)),
        0,
        100,
      );
      rec(`B2c ${tag} bank held (sd, deg)`, "ACS ±5 deg", sd(bank), 0, 2);
      rec(
        `B2d ${tag} load factor (g)`,
        "1/cos 45 = 1.41 (1.33-1.47)",
        mean(g),
        1.33,
        1.47,
      );
      if (addPower) {
        rec(`B2e ${tag} back pressure at constant speed (elevator increment)`, "clearly felt: 0.06-0.4", mean(el) - el0, 0.06, 0.4);
        rec(`B2f ${tag} power added to hold 95 KIAS (RPM)`, "+100..+350 RPM", mean(rpm) - rpm0, 100, 350);
        rec(`B2f' ${tag} speed held with power (min IAS, kt)`, "ACS ±10 kt", ias0 - Math.min(...ias), 0, 10);
      } else
        rec(`B2f ${tag} speed loss in a 360 at constant power (kt)`, "~10-20 kt: induced drag x2, no equilibrium", ias0 - Math.min(...ias), 8, 20);
      rec(
        `B2g ${tag} turn rate (deg/s)`,
        "g tan45 / V: 11-15 deg/s",
        mean(rate),
        11,
        15,
      );
      rec(
        `B2h ${tag} ball (|slip| mean)`,
        "coordinated < 0.15",
        mean(slip.map(Math.abs)),
        0,
        0.15,
      );
      rec(
        `B2i ${tag} roll-out heading error (deg)`,
        "ACS ±10 deg",
        Math.abs(hdgOut),
        0,
        10,
      );
    });
});

describe("B3 — slow flight at 55 KIAS", { timeout: T_LONG }, () => {
  it("clean, 55 KIAS level: power-behind-the-curve, high pitch, controllable, no stall", () => {
    const s = airborne({ ias: 75, alt: 4000, throttle: 0.5 });
    const P = new Pilot(s);
    // slow down: pitch for the airspeed, throttle for altitude (back side of the power curve)
    const altLoop = (tgt: number) => {
      const e = tgt - s.ac.data.altFt - s.ac.data.vsFpm * 0.1;
      P.tI = clamp(P.tI + e * 0.0003 * DT, 0, 1);
      s.controls.throttle = clamp(P.tI + e * 0.002, 0, 1);
    };
    let ias = 75;
    run(s, 80, (t) => {
      P.watch();
      ias = Math.max(55, 75 - t);
      P.ias(ias, -5, 20);
      altLoop(4000);
      P.heading(270);
      P.ball();
    });
    const alt: number[] = [],
      sp: number[] = [],
      pitch: number[] = [],
      rpm: number[] = [],
      ff: number[] = [];
    let warn = 0,
      n = 0,
      stalled = false;
    run(s, 60, () => {
      P.watch();
      P.ias(55, -5, 20);
      altLoop(4000);
      P.heading(270);
      P.ball();
      const d = s.ac.data;
      alt.push(d.altFt);
      sp.push(d.iasKt);
      pitch.push(d.pitchDeg);
      rpm.push(d.rpm);
      ff.push(d.fuelFlowGph);
      warn += d.stallWarn ? 1 : 0;
      n++;
      stalled ||= s.ac.stalled;
    });
    // 15 deg bank turns 90 deg each way at 55 KIAS
    let tRoll = NaN;
    const turnSp: number[] = [];
    run(s, 40, (t) => {
      P.watch();
      P.ias(55, -5, 20);
      altLoop(4000);
      P.heading(t < 20 ? 0 : 270, 15);
      P.ball();
      turnSp.push(s.ac.data.iasKt);
      if (Math.abs(s.ac.data.rollDeg) > 14 && !Number.isFinite(tRoll))
        tRoll = t;
      stalled ||= s.ac.stalled;
    });
    // reference: the power needed at 75 KIAS
    const r = airborne({ ias: 75, alt: 4000, throttle: 0.5 });
    const Q = new Pilot(r);
    const rpm75: number[] = [],
      ff75: number[] = [];
    run(r, 70, (t) => {
      Q.watch();
      Q.ias(75, -5, 20);
      const e = 4000 - r.ac.data.altFt - r.ac.data.vsFpm * 0.1;
      Q.tI = clamp(Q.tI + e * 0.0003 * DT, 0, 1);
      r.controls.throttle = clamp(Q.tI + e * 0.002, 0, 1);
      Q.heading(270);
      Q.ball();
      if (t > 50) (rpm75.push(r.ac.data.rpm), ff75.push(r.ac.data.fuelFlowGph));
    });
    expect(s.ac.s.crashed).toBeNull();
    rec(
      "B3a slow flight: IAS held (sd, kt)",
      "ACS +10/-0 kt: sd < 1.5",
      sd(sp),
      0,
      1.5,
    );
    rec(
      "B3b slow flight: altitude held (max dev, ft)",
      "ACS ±100 ft",
      maxAbs(alt.map((a) => a - 4000)),
      0,
      100,
    );
    rec(
      "B3c slow flight: pitch attitude (deg)",
      "high nose: 8-14 deg",
      mean(pitch),
      8,
      14,
    );
    rec("B3d slow flight: power at 55 / power at 75 KIAS (fuel flow)", "bottom of the power curve (Vmp ~55-60 KCAS): 0.85-1.25", mean(ff) / mean(ff75), 0.85, 1.25);
    rec(
      "B3e slow flight: stall-warning duty (%)",
      "at the edge: horn intermittent/on (0-100), no stall",
      (warn / n) * 100,
      0,
      100,
    );
    rec(
      "B3f slow flight: 15 deg bank roll-in (s)",
      "sluggish but OK: 1.5-5 s",
      tRoll,
      1.5,
      5,
    );
    rec(
      "B3g slow flight: lowest IAS in the turns (kt)",
      "> 51 KIAS (no stall)",
      Math.min(...turnSp),
      51,
      60,
    );
    rec("B3h slow flight: no stall", "stalled = 0", stalled ? 1 : 0, 0, 0);
  });
});

/** stall + recovery, the way the ACS asks for it */
function stallAndRecover(kind: "power-off" | "power-on") {
  const on = kind === "power-on";
  const s = airborne({
    ias: on ? 65 : 65,
    alt: 5000,
    flaps: on ? 0 : 3,
    throttle: on ? 0.55 : 0.3,
    trim: 0,
  });
  const P = new Pilot(s);
  let phase: "setup" | "entry" | "break" | "recover" | "done" = "setup";
  let tPhase = 0,
    stallIas = NaN,
    stallPitch = NaN,
    altStall = 0,
    minAlt = 1e9,
    maxBank = 0,
    maxG = 0,
    secondary = 0,
    wasStalled = false,
    tPositive = NaN,
    warnIas = NaN,
    pitchTgt = 0;
  const rud: number[] = [],
    slip: number[] = [];
  run(s, 140, (t) => {
    const d = s.ac.data;
    P.watch();
    const tp = t - tPhase;
    if (trace("stall") && Math.round(t * 60) % 20 === 0)
      console.log(
        kind,
        phase,
        t.toFixed(1),
        d.iasKt.toFixed(1),
        d.pitchDeg.toFixed(1),
        d.aoaDeg.toFixed(1),
        d.altFt.toFixed(0),
        d.vsFpm.toFixed(0),
        d.rollDeg.toFixed(1),
        s.controls.elevator.toFixed(2),
        s.ac.stalled,
      );
    if (phase === "setup") {
      P.ias(65, -5, 20);
      P.heading(270);
      P.ball();
      s.controls.throttle = on ? 0.55 : 0.3;
      if (tp > 25) {
        phase = "entry";
        tPhase = t;
        pitchTgt = d.pitchDeg;
      }
    } else if (phase === "entry") {
      // power-off: idle, keep raising the nose to hold the altitude until it breaks;
      // power-on: full power, raise the nose ~1 deg/s to a high climb attitude and hold it
      if (on) {
        s.controls.throttle = 1;
        pitchTgt = Math.min(22, pitchTgt + DT);
      } else {
        s.controls.throttle = 0;
        pitchTgt = Math.min(25, pitchTgt + 0.6 * DT);
      }
      P.pitch(pitchTgt);
      P.heading(270);
      P.ball();
      rud.push(s.controls.rudder);
      slip.push(d.slip);
      if (d.stallWarn && !Number.isFinite(warnIas)) warnIas = d.iasKt;
      if (s.ac.stalled) {
        phase = "break";
        tPhase = t;
        stallIas = d.iasKt;
        stallPitch = d.pitchDeg;
        altStall = d.altFt;
      }
    } else if (phase === "break" || phase === "recover") {
      // recovery: reduce the AoA (forward pressure), wings level, full power, then a climb attitude;
      // power-off: flaps 20 at once, the rest as the speed builds
      if (phase === "break") {
        s.controls.elevator = -0.3;
        if (tp > 0.6 || !s.ac.stalled) {
          phase = "recover";
          tPhase = t;
        }
      } else P.ias(on ? 74 : 60, -10, 12);
      s.controls.throttle = 1;
      if (!on) s.controls.flaps = d.iasKt > 60 && d.vsFpm > 0 ? 1 : 2;
      P.bank(0);
      P.ball();
      minAlt = Math.min(minAlt, d.altFt);
      maxBank = Math.max(maxBank, Math.abs(d.rollDeg));
      maxG = Math.max(maxG, d.gLoad);
      if (s.ac.stalled && !wasStalled && phase === "recover") secondary++;
      wasStalled = s.ac.stalled;
      if (phase === "recover" && d.vsFpm > 0 && !Number.isFinite(tPositive))
        tPositive = t - (tPhase - 0.6);
      if (phase === "recover" && tp > 20) return true;
    }
  });
  return {
    s,
    stallIas,
    stallPitch,
    warnIas,
    altLoss: altStall - minAlt,
    maxBank,
    maxG,
    secondary,
    tPositive,
    rud: mean(rud.slice(-120)),
    slip: mean(slip.slice(-120)),
  };
}

describe("B4 — stalls and recovery", { timeout: T_LONG }, () => {
  it("power-off stall, landing configuration (flaps 30, idle)", () => {
    const r = stallAndRecover("power-off");
    expect(r.s.ac.s.crashed).toBeNull();
    rec(
      "B4a power-off stall IAS, flaps 30 (kt)",
      "POH 40 KIAS ±3",
      r.stallIas,
      37,
      43,
    );
    rec(
      "B4b power-off: warning margin (kt)",
      "5-10 kt",
      r.warnIas - r.stallIas,
      5,
      10,
    );
    rec(
      "B4c power-off: altitude lost in the recovery (ft)",
      "50-250 ft",
      r.altLoss,
      50,
      250,
    );
    rec(
      "B4d power-off: wings stay level (max bank, deg)",
      "< 15 deg (ball centred)",
      r.maxBank,
      0,
      15,
    );
    rec("B4e power-off: no secondary stall", "0", r.secondary, 0, 0);
    rec(
      "B4f power-off: positive rate after the break (s)",
      "< 10 s",
      r.tPositive,
      0,
      10,
    );
    rec(
      "B4g power-off: peak load factor in the pull-out (g)",
      "1.0-2.5 g",
      r.maxG,
      1,
      2.5,
    );
  });
  it("power-on stall, take-off configuration (clean, full power)", () => {
    const r = stallAndRecover("power-on");
    expect(r.s.ac.s.crashed).toBeNull();
    rec(
      "B4h power-on stall IAS clean (kt)",
      "below the power-off 48: 40-49 KIAS",
      r.stallIas,
      40,
      49,
    );
    rec(
      "B4i power-on: nose attitude at the break (deg)",
      "very nose-high: 15-25 deg",
      r.stallPitch,
      15,
      25,
    );
    rec(
      "B4j power-on: right rudder to centre the ball",
      "0.15-0.8 (P-factor, slipstream)",
      r.rud,
      0.15,
      0.8,
    );
    rec(
      "B4k power-on: altitude lost in the recovery (ft)",
      "< 150 ft",
      r.altLoss,
      0,
      150,
    );
    rec(
      "B4l power-on: wings stay level (max bank, deg)",
      "< 15 deg",
      r.maxBank,
      0,
      15,
    );
    rec("B4m power-on: no secondary stall", "0", r.secondary, 0, 0);
  });
});

/** set an unusual attitude by hand, then recover the way the FAA teaches it */
function unusual(kind: "nose-high" | "nose-low") {
  const high = kind === "nose-high";
  const s = airborne({
    ias: high ? 85 : 100,
    alt: 5000,
    throttle: high ? 0.6 : 0.7,
  });
  const a = s.ac.s;
  a.theta = (high ? 25 : -20) * DEG;
  a.gamma = (high ? 18 : -22) * DEG;
  a.phi = (high ? 30 : 50) * DEG;
  a.tas = (high ? 85 : 110) * KT * 1.08;
  settle(s);
  const P = new Pilot(s);
  let minIas = 999,
    maxIas = 0,
    maxG = 0,
    minG = 9,
    tLevel = NaN,
    stalled = false;
  const alt0 = s.ac.data.altFt;
  let minAlt = alt0,
    maxAlt = alt0;
  run(s, 60, (t) => {
    const d = s.ac.data;
    P.watch();
    if (trace("unusual") && Math.round(t * 60) % 15 === 0)
      console.log(
        kind,
        t.toFixed(2),
        d.iasKt.toFixed(1),
        d.pitchDeg.toFixed(1),
        d.rollDeg.toFixed(1),
        d.altFt.toFixed(0),
        d.gLoad.toFixed(2),
        s.controls.elevator.toFixed(2),
      );
    if (t < 1) {
      // recognition: hands still
      s.controls.elevator = 0;
      s.controls.aileron = 0;
    } else if (high) {
      // full power, nose down to the horizon (forward pressure), then level the wings
      s.controls.throttle = 1;
      P.pitch(Math.max(0, 25 - (t - 1) * 8), 0.08);
      P.bank(d.pitchDeg > 8 ? d.rollDeg * 0.7 : 0);
      P.ball();
    } else {
      // power idle, level the wings first, then ease out of the dive (≤ ~2.5 g), then cruise power
      s.controls.throttle =
        Math.abs(d.rollDeg) < 10 && d.pitchDeg > -2 ? 0.6 : 0;
      P.bank(0);
      if (Math.abs(d.rollDeg) > 20) P.pitch(d.pitchDeg);
      else
        P.vs(
          d.pitchDeg > 0 ? 0 : clamp(d.vsFpm + 1500 * DT * 60, -6000, 0),
          0.002,
          0.0015,
        );
      P.ball();
    }
    minIas = Math.min(minIas, d.iasKt);
    maxIas = Math.max(maxIas, d.iasKt);
    maxG = Math.max(maxG, d.gLoad);
    minG = Math.min(minG, d.gLoad);
    minAlt = Math.min(minAlt, d.altFt);
    maxAlt = Math.max(maxAlt, d.altFt);
    stalled ||= s.ac.stalled;
    if (
      t > 1 &&
      Math.abs(d.pitchDeg - 2) < 6 &&
      Math.abs(d.rollDeg) < 5 &&
      Math.abs(d.vsFpm) < 500 &&
      !Number.isFinite(tLevel)
    )
      tLevel = t;
    if (Number.isFinite(tLevel) && t > tLevel + 2) return true;
  });
  return {
    s,
    minIas,
    maxIas,
    maxG,
    minG,
    tLevel,
    stalled,
    altGain: maxAlt - alt0,
    altLoss: alt0 - minAlt,
  };
}

describe("B5 — unusual-attitude recovery", { timeout: T_LONG }, () => {
  it("nose-high, 25 deg pitch, 30 deg bank, speed decaying", () => {
    const r = unusual("nose-high");
    expect(r.s.ac.s.crashed).toBeNull();
    rec(
      "B5a nose-high: lowest IAS (kt)",
      "> 45 KIAS (no stall when the nose is lowered promptly)",
      r.minIas,
      45,
      85,
    );
    rec("B5b nose-high: no stall", "0", r.stalled ? 1 : 0, 0, 0);
    rec("B5c nose-high: time to level flight (s)", "< 12 s", r.tLevel, 0, 12);
    rec(
      "B5d nose-high: lowest load factor (g)",
      "unloading: 0.3-0.95 g",
      r.minG,
      0.3,
      0.95,
    );
    rec(
      "B5e nose-high: altitude gained (ft)",
      "zoom: 100-600 ft",
      r.altGain,
      100,
      600,
    );
  });
  it("nose-low, 20 deg nose down, 50 deg bank (spiral), speed building", () => {
    const r = unusual("nose-low");
    expect(r.s.ac.s.crashed).toBeNull();
    rec(
      "B5f nose-low: highest IAS (kt)",
      "below Vne 163, ideally < Vno+15: 110-150",
      r.maxIas,
      110,
      150,
    );
    rec(
      "B5g nose-low: peak load factor (g)",
      "1.8-3.8 g (limit 3.8)",
      r.maxG,
      1.8,
      3.8,
    );
    rec(
      "B5h nose-low: altitude lost (ft)",
      "prompt recovery: 150-600 ft",
      r.altLoss,
      150,
      600,
    );
    rec("B5i nose-low: time to level flight (s)", "< 15 s", r.tLevel, 0, 15);
  });
});

describe(
  "B6 — ILS-like stabilised descent, hand-flown",
  { timeout: T_LONG },
  () => {
    it("90 KIAS flaps 10 on a 3 deg path: pitch flies the path, throttle holds the speed, light turbulence", () => {
      const s = onFinal({ distNm: 7, ias: 90, flaps: 1, turbulence: 0.2 });
      s.controls.throttle = 0.45;
      const P = new Pilot(s);
      const dev: number[] = [],
        xt: number[] = [],
        ias: number[] = [],
        vs: number[] = [],
        rpm: number[] = [],
        ch: Record<"ias" | "vs" | "hdg" | "pitch", number[]> = {
          ias: [],
          vs: [],
          hdg: [],
          pitch: [],
        };
      run(s, 400, (t) => {
        const d = s.ac.data;
        P.watch();
        const pe = pathError(s);
        const gsFpm = d.gsKt * 101.27 * Math.tan(3 * DEG);
        P.vs(-gsFpm - clamp(pe.above * 3, -300, 300));
        P.thrIas(90);
        P.centreline(0.06);
        P.ball();
        if (trace("ils") && Math.round(t * 60) % 120 === 0)
          console.log(
            "ils",
            t.toFixed(0),
            pe.dist.toFixed(2),
            pe.above.toFixed(0),
            d.iasKt.toFixed(1),
            d.vsFpm.toFixed(0),
            d.pitchDeg.toFixed(1),
            s.controls.throttle.toFixed(2),
            d.rpm.toFixed(0),
            xtrack(s).toFixed(0),
          );
        if (t > 40 && d.aglFt > 200) {
          dev.push(pe.above);
          xt.push(xtrack(s));
          ias.push(d.iasKt);
          vs.push(d.vsFpm);
          rpm.push(d.rpm);
          ch.ias.push(d.iasKt);
          ch.vs.push(d.vsFpm);
          ch.hdg.push(d.hdgTrue);
          ch.pitch.push(d.pitchDeg);
        }
        if (d.aglFt < 200) return true; // decision altitude
      });
      expect(s.ac.s.crashed).toBeNull();
      rec(
        "B6a ILS: height off the 3 deg path (max, ft)",
        "within ~1/2 dot: < 40 ft",
        maxAbs(dev),
        0,
        40,
      );
      rec(
        "B6b ILS: speed held (max error, kt)",
        "stabilised ±5 kt",
        maxAbs(ias.map((v) => v - 90)),
        0,
        5,
      );
      rec(
        "B6c ILS: mean VS (fpm)",
        "5 x GS: ~-480 fpm at 90 kt (±12%)",
        mean(vs),
        -540,
        -420,
      );
      rec(
        "B6d ILS: approach power (RPM)",
        "~1800-2250 RPM",
        mean(rpm),
        1800,
        2250,
      );
      rec("B6e ILS: lateral deviation (max, ft)", "< 60 ft", maxAbs(xt), 0, 60);
      rec(
        "B6f ILS: roughness IAS/VS/hdg/pitch (worst)",
        "smooth < 0.12",
        Math.max(...Object.values(ch).map(roughness)),
        0,
        0.12,
      );
    });
  },
);

/** final approach and landing, 65 KIAS flaps 30; crosswind with the wing-low technique below 300 ft */
function land(o: { wind?: { dir: number; kt: number }; goAround?: boolean }) {
  const s = onFinal({ distNm: 2.5, ias: 65, flaps: 3, wind: o.wind });
  const P = new Pilot(s);
  let phase: "app" | "flare" | "roll" | "ga" = "app";
  let tPhase = 0;
  const r = {
    s,
    crab: [] as number[],
    wlBank: [] as number[],
    wlRud: [] as number[],
    tdDrift: NaN,
    tdXt: NaN,
    rollXt: 0,
    rollHdg: 0,
    jumpHdg: 0,
    jumpRoll: 0,
    appIas: [] as number[],
    // go-around
    gaMinAgl: NaN,
    gaEl: 0,
    gaTpos: NaN,
    gaVs20: [] as number[],
    gaSinkRetract: 0,
    gaVsClean: [] as number[],
  };
  let lastHdg = s.ac.data.hdgTrue,
    lastRoll = 0;
  let prevDrift = 0,
    prevXt = 0,
    elFlare = 0,
    gaRetractAlt = NaN;
  const xw = !!o.wind;
  run(s, 300, (t) => {
    const d = s.ac.data;
    P.watch();
    const tp = t - tPhase;
    // the indications through the touchdown: no step in heading or bank in one frame
    if (phase === "flare" || (phase === "roll" && tp < 2)) {
      r.jumpHdg = Math.max(r.jumpHdg, Math.abs(wrap180(d.hdgTrue - lastHdg)));
      r.jumpRoll = Math.max(r.jumpRoll, Math.abs(d.rollDeg - lastRoll));
    }
    lastHdg = d.hdgTrue;
    lastRoll = d.rollDeg;
    if (trace(o.goAround ? "ga" : "land") && Math.round(t * 60) % 30 === 0)
      console.log(
        phase,
        t.toFixed(1),
        d.aglFt.toFixed(0),
        d.iasKt.toFixed(1),
        d.vsFpm.toFixed(0),
        d.pitchDeg.toFixed(1),
        d.rollDeg.toFixed(1),
        s.controls.throttle.toFixed(2),
        s.controls.elevator.toFixed(2),
        s.controls.rudder.toFixed(2),
        xtrack(s).toFixed(0),
        d.hdgTrue.toFixed(1),
        d.flapsDeg.toFixed(0),
      );
    if (phase === "app") {
      const pe = pathError(s);
      const gsFpm = d.gsKt * 101.27 * Math.tan(3 * DEG);
      P.vs(-gsFpm - clamp(pe.above * 3, -300, 300));
      P.thrIas(65);
      if (xw && d.aglFt < 300) {
        // wing low: rudder aligns the nose with the runway, aileron (bank into wind) holds the centreline
        P.rudderHdg(270);
        P.centreline();
        if (d.aglFt > 60)
          (r.wlBank.push(d.rollDeg), r.wlRud.push(s.controls.rudder));
      } else {
        P.centreline();
        P.ball();
        if (d.aglFt > 350) r.crab.push(wrap180(d.hdgTrue - d.trackTrue));
      }
      if (d.aglFt > 100) r.appIas.push(d.iasKt);
      if (o.goAround && d.aglFt < 50) {
        phase = "ga";
        tPhase = t;
        r.gaMinAgl = d.aglFt;
      } else if (!o.goAround && d.aglFt < 15) {
        phase = "flare";
        tPhase = t;
        elFlare = s.controls.elevator;
        P.oI = 0;
      }
    } else if (phase === "flare") {
      s.controls.throttle = 0;
      // round out: sink rate proportional to height, then hold it off just above the runway
      P.vs(-Math.max(100, d.aglFt * 14), 0.012, 0.006);
      if (xw) {
        P.rudderHdg(270);
        P.bank(clamp(mean(r.wlBank.slice(-120)), -10, 10));
      } else {
        P.bank(0);
        s.controls.rudder = 0;
      }
      prevDrift = d.gsKt * Math.sin(wrap180(d.trackTrue - d.hdgTrue) * DEG); // kt, + drifting right
      prevXt = xtrack(s);
      if (s.ac.s.onGround) {
        phase = "roll";
        tPhase = t;
        r.tdDrift = prevDrift;
        r.tdXt = prevXt;
      }
      void elFlare;
    } else if (phase === "roll") {
      // rollout: aileron into the wind, rudder on the centreline, brakes after 2 s
      s.controls.throttle = 0;
      s.controls.elevator = 0.3;
      s.controls.aileron = xw ? clamp((d.crosswindKt / 10) * 0.8, -1, 1) : 0;
      const e = -xtrack(s);
      P.rudderHdg(270 + clamp(e * 0.3, -8, 8));
      s.controls.brake = tp > 2 ? 0.7 : 0;
      r.rollXt = Math.max(r.rollXt, Math.abs(xtrack(s)));
      r.rollHdg = Math.max(r.rollHdg, Math.abs(wrap180(d.hdgTrue - 270)));
      if (s.ac.s.tas < 1) return true;
    } else {
      // go-around: full power, pitch up, flaps 20 at once; flaps 10 with a positive rate above 60 KIAS,
      // flaps up above 65 KIAS; 60 KIAS flaps 20, then Vy
      s.controls.throttle = 1;
      const fl = s.controls.flaps;
      if (tp > 0.5 && fl === 3) s.controls.flaps = 2;
      if (fl === 2 && d.vsFpm > 200 && d.iasKt > 58 && d.aglFt > 350)
        s.controls.flaps = 1;
      if (fl === 1 && d.iasKt > 65 && d.aglFt > 400 && s.ac.s.flapPos < 0.34) {
        s.controls.flaps = 0;
        gaRetractAlt = d.altFt;
      }
      const tgtIas = fl >= 2 ? 60 : fl === 1 ? 70 : 74;
      if (tp < 3) {
        P.pitch(Math.min(7, d.pitchDeg + 4));
        P.oI = d.pitchDeg;
      } else P.ias(tgtIas, -5, 15);
      r.gaEl = Math.min(r.gaEl, s.controls.elevator + s.controls.trim);
      P.centreline();
      P.ball();
      r.gaMinAgl = Math.min(r.gaMinAgl, d.aglFt);
      if (d.vsFpm > 0 && !Number.isFinite(r.gaTpos)) r.gaTpos = tp;
      if (fl === 2 && tp > 12 && s.ac.s.flapPos > 0.6) r.gaVs20.push(d.vsFpm);
      if (Number.isFinite(gaRetractAlt) && s.ac.s.flapPos > 0)
        r.gaSinkRetract = Math.min(r.gaSinkRetract, d.vsFpm);
      if (fl === 0 && s.ac.s.flapPos === 0 && Math.abs(d.iasKt - 74) < 3)
        r.gaVsClean.push(d.vsFpm);
      if (r.gaVsClean.length > 600) return true;
    }
  });
  return r;
}

describe("B7 — crosswind landing, 10 kt at 90 deg", { timeout: T_LONG }, () => {
  it("crab on final, wing-low below 300 ft, touchdown aligned, rollout on the centreline", () => {
    const r = land({ wind: { dir: 360, kt: 10 } });
    const s = r.s;
    expect(s.ac.s.crashed).toBeNull();
    const td = s.ac.touchdown!;
    rec(
      "B7a crab angle on final (deg)",
      "asin(10/65) ~ 9 deg ±2",
      mean(r.crab),
      7,
      11,
    );
    rec(
      "B7b wing-low bank into the wind (deg, + right)",
      "2-10 deg right wing low",
      mean(r.wlBank),
      2,
      10,
    );
    rec(
      "B7c wing-low: opposite (left) rudder",
      "-0.95..-0.2",
      mean(r.wlRud),
      -0.95,
      -0.2,
    );
    rec(
      "B7d side drift at touchdown (kt)",
      "aligned: |drift| < 2 kt",
      Math.abs(r.tdDrift),
      0,
      2,
    );
    rec(
      "B7e touchdown off the centreline (ft)",
      "< 20 ft",
      Math.abs(r.tdXt),
      0,
      20,
    );
    rec("B7f touchdown sink (fpm)", "normal > -360", td.vsFpm, -360, 0);
    rec("B7g touchdown IAS (kt)", "45-52 KIAS", td.ias, 45, 52);
    rec(
      "B7h touchdown bank (deg, + right)",
      "upwind wheel first: 0-8 deg right",
      td.bankDeg,
      0,
      8,
    );
    rec(
      "B7i rollout: max centreline deviation (ft)",
      "< 25 ft",
      r.rollXt,
      0,
      25,
    );
    rec("B7j rollout: max heading error (deg)", "< 8 deg", r.rollHdg, 0, 8);
    rec("B7j' heading step in one frame through the touchdown (deg)", "continuous: < 0.5 deg/frame", r.jumpHdg, 0, 0.5);
    rec("B7j\" bank step in one frame through the touchdown (deg)", "continuous: < 1 deg/frame", r.jumpRoll, 0, 1);
  });
  it("no wind reference: same approach flown in calm air", () => {
    const r = land({});
    expect(r.s.ac.s.crashed).toBeNull();
    const td = r.s.ac.touchdown!;
    rec("B7k calm: approach speed held (sd, kt)", "< 2 kt", sd(r.appIas), 0, 2);
    rec(
      "B7l calm: touchdown sink (fpm)",
      "smooth/normal > -300",
      td.vsFpm,
      -300,
      0,
    );
    rec(
      "B7m calm: touchdown pitch (deg)",
      "nose-high 4-12",
      td.pitchDeg,
      4,
      12,
    );
    rec("B7n calm: no bounce", "0", td.bounced ? 1 : 0, 0, 0);
  });
});

describe("B8 — go-around from 50 ft", { timeout: T_LONG }, () => {
  it("full power, pitch up, flaps 20 then 10 then up, positive climb", () => {
    const r = land({ goAround: true });
    expect(r.s.ac.s.crashed).toBeNull();
    expect(r.s.ac.touchdown).toBeNull();
    rec(
      "B8a go-around: lowest height (ft AGL)",
      "height loss < 30 ft: > 20 ft",
      r.gaMinAgl,
      20,
      50,
    );
    rec("B8b go-around: time to positive rate (s)", "< 4 s", r.gaTpos, 0, 4);
    rec(
      "B8c go-around: forward pressure against the pitch-up (elevator + trim)",
      "noticeable: < -0.05",
      r.gaEl,
      -1,
      -0.05,
    );
    rec(
      "B8d go-around: climb flaps 20 at 60 KIAS (fpm)",
      "balked landing ~450-650 fpm (350-750)",
      mean(r.gaVs20),
      350,
      750,
    );
    rec(
      "B8e go-around: sink while retracting flaps 10 → 0 (fpm)",
      "no sink: min VS > 0",
      r.gaSinkRetract,
      0,
      2000,
    );
    rec(
      "B8f go-around: clean climb at Vy (fpm)",
      "POH ~700 fpm (600-840)",
      mean(r.gaVsClean),
      600,
      840,
    );
  });
});

describe("B9 — engine failure after take-off", { timeout: T_LONG }, () => {
  it("engine quits at 400 ft AGL in the Vy climb: 2 s reaction, nose down to 68 KIAS, land straight ahead", () => {
    const s = onRunway(0);
    const P = new Pilot(s);
    s.controls.throttle = 1;
    let phase: "to" | "climb" | "react" | "glide" | "flare" | "done" = "to";
    let tFail = 0,
      iasFail = 0,
      altFail = 0,
      pitchFail = 0,
      decel = NaN,
      minIas = 999,
      stalled = false,
      altGlide = NaN;
    const sink: number[] = [],
      pitch: number[] = [],
      glideIas: number[] = [];
    run(s, 200, (t) => {
      const d = s.ac.data;
      P.watch();
      if (trace("efato") && Math.round(t * 60) % 30 === 0)
        console.log(
          phase,
          t.toFixed(1),
          d.aglFt.toFixed(0),
          d.iasKt.toFixed(1),
          d.vsFpm.toFixed(0),
          d.pitchDeg.toFixed(1),
          d.rpm.toFixed(0),
          s.controls.elevator.toFixed(2),
        );
      if (phase === "to") {
        P.rudderHdg(270);
        if (d.iasKt >= 55 || !s.ac.s.onGround) P.pitch(8);
        else s.controls.elevator = 0;
        if (!s.ac.s.onGround && d.aglFt > 20) phase = "climb";
      } else if (phase === "climb") {
        if (d.iasKt < 70) P.pitch(8);
        else P.ias(74, -5, 15);
        P.centreline();
        P.ball();
        if (d.aglFt >= 400) {
          phase = "react";
          tFail = t;
          iasFail = d.iasKt;
          altFail = d.altFt;
          pitchFail = d.pitchDeg;
          s.failures.engine = true; // the sim cuts the throttle; with no fuel the engine is dead (windmilling)
          s.ac.s.fuelGal = 0;
        }
      } else if (phase === "react") {
        // startle: the pilot still holds the climb attitude for 2 s
        P.pitch(pitchFail);
        P.bank(0);
        if (Math.abs(t - tFail - 1) < DT / 2) iasFail = d.iasKt;
        if (t - tFail >= 2) {
          decel = iasFail - d.iasKt; // kt lost in the second second (thrust and RPM have died away)
          phase = "glide";
          P.oI = d.pitchDeg;
        }
      } else if (phase === "glide") {
        P.ias(68, -12, 10);
        P.centreline();
        P.ball();
        if (t - tFail > 12 && d.aglFt > 60)
          (sink.push(d.vsFpm), pitch.push(d.pitchDeg), glideIas.push(d.iasKt));
        if (!Number.isFinite(altGlide) && t - tFail >= 10) altGlide = altFail - d.altFt;
        // power-off: a higher sink to arrest, so the round-out starts higher (~30 ft)
        if (d.aglFt < 35) {
          phase = "flare";
          P.oI = 0;
        }
      } else if (phase === "flare") {
        P.vs(-Math.max(120, d.aglFt * 15), 0.006, 0.003);
        P.bank(0);
        s.controls.rudder = 0;
        if (s.ac.s.onGround || s.ac.touchdown) return true;
      }
      if (phase !== "to") minIas = Math.min(minIas, d.iasKt);
      if (phase !== "to") stalled ||= s.ac.stalled;
    });
    const td = s.ac.touchdown;
    rec(
      "B9a speed decay, engine dead, climb attitude held (kt/s)",
      "~3-5 kt/s (g sin(climb angle) + drag + windmilling)",
      decel,
      3,
      5.5,
    );
    rec("B9b lowest IAS (kt)", "> 50 KIAS (2 s reaction)", minIas, 50, 80);
    rec("B9c no stall", "0", stalled ? 1 : 0, 0, 0);
    rec(
      "B9d height lost 10 s after the failure (ft)",
      "zoom during the reaction, then the glide: 0-200 ft",
      altGlide,
      0,
      200,
    );
    rec(
      "B9e glide pitch attitude (deg)",
      "nose near the horizon: -4..+3",
      mean(pitch),
      -4,
      3,
    );
    rec(
      "B9f glide sink at 68 KIAS, prop windmilling (fpm)",
      "750-950 fpm (dead engine > idle)",
      -mean(sink),
      750,
      950,
    );
    rec("B9g glide speed held (sd, kt)", "< 2 kt", sd(glideIas), 0, 2);
    rec(
      "B9h touchdown sink after the flare (fpm)",
      "flare still possible: > -400",
      td ? td.vsFpm : NaN,
      -400,
      0,
    );
    expect(
      s.ac.s.crashed === null || s.ac.s.crashed === "Touched down off-airport",
    ).toBe(true);
  });
});
