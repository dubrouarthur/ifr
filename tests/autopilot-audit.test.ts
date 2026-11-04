// Autopilot / flight-director and GPS guidance audit: every GFC 700 / KAP 140 mode flown headless in the Sim,
// with assertions on what a pilot (and an examiner) would check. Also covers the Boeing MCP names the airliner
// cockpit shows for the same modes (HDG SEL, LNAV, V/S, FLCH SPD, ALT HOLD, LOC, G/S).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import { Sim, SCENARIOS } from "../src/sim/sim";
import { findFix, runway, NAVAIDS } from "../src/nav/data";
import {
  alongTrackNm,
  bearingDeg,
  crossTrackNm,
  destination,
  distanceNm,
  FT_PER_NM,
  type LatLon,
} from "../src/nav/geo";
import { flyablePath, turnAnticipationNm } from "../src/nav/pathgeom";
import { FlightPlan, type Waypoint } from "../src/nav/flightplan";
import { holdFrame } from "../src/nav/holding";

const DT = 1 / 30;
const sc = (id: string) => SCENARIOS.find((s) => s.id === id)!;
const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
/** run the sim; `each` returns true to stop early. Returns the time flown (s). */
function run(
  s: Sim,
  seconds: number,
  each?: (t: number) => boolean | void,
): number {
  let t = 0;
  for (; t < seconds; t += DT) {
    s.step(DT);
    if (each && each(t)) break;
  }
  return t;
}
/** cruise at 3000 ft on the PARD vectors-to-final scenario, calm unless asked */
function cruise(
  opts: { turb?: number; windKt?: number; windDir?: number } = {},
) {
  const s = new Sim(sc("ils27-vtf"));
  Object.assign(s.weather, {
    turbulence: opts.turb ?? 0,
    gustKt: 0,
    windKt: opts.windKt ?? 0,
    windDir: opts.windDir ?? 250,
  });
  s.weather.aloft = undefined;
  return s;
}
const d = (s: Sim) => s.ac.data;
/** AP on in HDG + ALT and settled for 30 s */
function engaged(s: Sim) {
  s.ap.toggleAp(d(s));
  s.ap.pressHdg(d(s));
  s.ap.pressAlt(d(s));
  run(s, 30);
}
/** minimum distance (NM) from p to a polyline */
function distToPath(p: LatLon, path: LatLon[]): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = distanceNm(a, b);
    if (len < 1e-4) {
      best = Math.min(best, distanceNm(p, a));
      continue;
    }
    const at = alongTrackNm(a, b, p);
    if (at <= 0) best = Math.min(best, distanceNm(p, a));
    else if (at >= len) best = Math.min(best, distanceNm(p, b));
    else best = Math.min(best, Math.abs(crossTrackNm(a, b, p)));
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ basic modes
describe("engagement, FD and basic modes (ROL / PIT)", () => {
  it("FD alone computes command bars but never moves the controls", () => {
    const s = cruise();
    s.controls.elevator = 0.01;
    s.controls.aileron = 0;
    s.ap.toggleFd(d(s));
    expect(s.ap.fd).toBe(true);
    expect(s.ap.ap).toBe(false);
    expect(s.ap.lat).toBe("ROL");
    expect(s.ap.vert).toBe("PIT");
    s.ap.pressHdg(d(s));
    s.ap.hdgBug = 360;
    run(s, 3);
    expect(s.controls.aileron).toBe(0);
    expect(s.controls.elevator).toBe(0.01);
    expect(s.ap.bankCmd).toBeGreaterThan(5); // right turn commanded on the bars
  });

  it("AP engages in ROL / PIT: wings level below 6° bank, holds the bank above it, holds the pitch", () => {
    const s = cruise();
    s.ac.s.phi = (12 * Math.PI) / 180;
    s.ac.step(0.01, s.controls, s.weather);
    s.ap.altSel = 6000; // ALTS armed, far away
    s.ap.toggleAp(d(s));
    expect(s.ap.lat).toBe("ROL");
    expect(s.ap.vert).toBe("PIT");
    expect(s.ap.rollRef).toBeCloseTo(12, 0);
    const p0 = s.ap.pitchRef;
    run(s, 20);
    expect(Math.abs(d(s).rollDeg - 12)).toBeLessThan(2);
    expect(Math.abs(d(s).pitchDeg - p0)).toBeLessThan(1);
    const s2 = cruise();
    s2.ac.s.phi = (4 * Math.PI) / 180;
    s2.ac.step(0.01, s2.controls, s2.weather);
    s2.ap.toggleAp(d(s2));
    run(s2, 15);
    expect(Math.abs(d(s2).rollDeg)).toBeLessThan(1.5);
  });

  it("NOSE UP / DN wheel: 0.5° in PIT, 100 fpm in VS, 1 kt in FLC (nose up = slower)", () => {
    const s = cruise();
    s.ap.toggleAp(d(s));
    const p = s.ap.pitchRef;
    s.ap.nose(1);
    expect(s.ap.pitchRef).toBeCloseTo(p + 0.5, 5);
    s.ap.pressVs(d(s));
    const v = s.ap.vsSel;
    s.ap.nose(-1);
    expect(s.ap.vsSel).toBe(v - 100);
    s.ap.pressFlc(d(s));
    const k = s.ap.iasSel;
    s.ap.nose(1);
    expect(s.ap.iasSel).toBe(k - 1);
  });

  it("on the ground the servos stay still (no control movement on the take-off roll)", () => {
    const s = new Sim(sc("rwy27"));
    s.ap.toggleAp(d(s));
    s.ap.pressHdg(d(s));
    s.ap.hdgBug = 180;
    s.controls.elevator = 0;
    s.controls.aileron = 0;
    run(s, 3);
    expect(s.controls.aileron).toBe(0);
    expect(s.controls.elevator).toBe(0);
  });
});

// ------------------------------------------------------------------------------------------------ HDG
describe("HDG", () => {
  it("turns to the bug at standard rate (bank ≤ 25°), without overshoot", () => {
    const s = cruise();
    engaged(s);
    const h0 = d(s).hdgTrue;
    s.ap.hdgBug = Math.round(h0 + 90) % 360;
    let maxBank = 0;
    let maxRate = 0;
    run(s, 70, () => {
      maxBank = Math.max(maxBank, Math.abs(d(s).rollDeg));
      maxRate = Math.max(maxRate, Math.abs(d(s).turnRateDps));
    });
    expect(maxBank).toBeLessThan(25);
    expect(maxBank).toBeGreaterThan(10); // a real standard-rate turn, not a lazy one
    expect(maxRate).toBeLessThan(3.6);
    expect(maxRate).toBeGreaterThan(2.4);
    expect(Math.abs(wrap(d(s).hdgTrue - s.ap.hdgBug))).toBeLessThan(2);
    expect(Math.abs(s.ac.s.altFt - s.ap.altHold)).toBeLessThan(60); // ALT held through the turn
  });

  it("takes the short way through north (350 → 020 is a right turn)", () => {
    const s = cruise();
    s.ac.s.psi = (350 * Math.PI) / 180;
    s.ac.step(0.01, s.controls, s.weather);
    s.ap.hdgBug = 350;
    engaged(s);
    s.ap.hdgBug = 20;
    let minRoll = 0;
    run(s, 30, () => {
      minRoll = Math.min(minRoll, d(s).rollDeg);
    });
    expect(minRoll).toBeGreaterThan(-2); // never banked left
    expect(Math.abs(wrap(d(s).hdgTrue - 20))).toBeLessThan(3);
  });

  it("pressing HDG again reverts to ROL (wings level)", () => {
    const s = cruise();
    engaged(s);
    s.ap.pressHdg(d(s));
    expect(s.ap.lat).toBe("ROL");
    run(s, 10);
    expect(Math.abs(d(s).rollDeg)).toBeLessThan(2);
  });
});

// ------------------------------------------------------------------------------------------------ vertical
describe("ALT", () => {
  it("holds altitude within ±50 ft in moderate turbulence, through a 180° turn", () => {
    const s = cruise({ turb: 0.3, windKt: 15 });
    engaged(s);
    s.ap.hdgBug = (Math.round(d(s).hdgTrue) + 180) % 360;
    let maxErr = 0;
    run(s, 120, () => {
      maxErr = Math.max(maxErr, Math.abs(s.ac.s.altFt - s.ap.altHold));
    });
    expect(maxErr).toBeLessThan(50);
  });

  it("a new selected altitude while in ALT: stays in ALT until VS or FLC is pressed, then ALTS arms", () => {
    const s = cruise();
    engaged(s);
    const hold = s.ap.altHold;
    s.ap.altSel = 4000;
    run(s, 30);
    expect(s.ap.vert).toBe("ALT");
    expect(s.ap.altHold).toBe(hold);
    expect(s.ap.vertArmed.alts).toBe(false);
    expect(Math.abs(s.ac.s.altFt - hold)).toBeLessThan(30);
    s.controls.throttle = 0.9;
    s.ap.pressVs(d(s));
    s.ap.vsSel = 500;
    run(s, 2);
    expect(s.ap.vert).toBe("VS");
    expect(s.ap.vertArmed.alts).toBe(true);
    run(s, 200, () => s.ap.vert === "ALT");
    expect(s.ap.vert).toBe("ALT");
    expect(s.ap.altHold).toBe(4000);
  });

  it("power reduced in ALT (no autothrottle): speed decays, then MINSPD protection trades altitude — no stall", () => {
    const s = cruise();
    engaged(s);
    s.controls.throttle = 0.12;
    let minIas = 999;
    let usp = false;
    let stallWarnS = 0;
    run(s, 150, () => {
      minIas = Math.min(minIas, d(s).iasKt);
      if (s.ap.underspeed) usp = true;
      if (d(s).stallWarn) stallWarnS += DT;
    });
    expect(s.ap.ap).toBe(true);
    expect(s.ap.vert).toBe("ALT"); // the mode is kept, the protection is annunciated on top of it
    expect(usp).toBe(true);
    expect(minIas).toBeGreaterThan(s.ap.minSpd - 6);
    expect(stallWarnS).toBeLessThan(1);
    expect(s.ac.s.altFt).toBeLessThan(s.ap.altHold - 100); // it descends to keep flying speed
    // power back on: protection ends, ALT recaptures the held altitude
    s.controls.throttle = 0.8;
    run(s, 120);
    expect(s.ap.underspeed).toBe(false);
    expect(Math.abs(s.ac.s.altFt - s.ap.altHold)).toBeLessThan(60);
  });
});

/** climb/descent to altSel in a vertical mode; returns traces after the mode is set */
function altChange(
  s: Sim,
  set: (s: Sim) => void,
  secs: number,
): {
  vs: number[];
  pitch: number[];
  ias: number[];
  t: number[];
  capT: number;
  peak: number;
} {
  set(s);
  const out = {
    vs: [] as number[],
    pitch: [] as number[],
    ias: [] as number[],
    t: [] as number[],
    capT: -1,
    peak: 0,
  };
  const up = s.ap.altSel > s.ac.s.altFt;
  run(s, secs, (t) => {
    out.t.push(t);
    out.vs.push(d(s).vsFpm);
    out.pitch.push(d(s).pitchDeg);
    out.ias.push(d(s).iasKt);
    if (s.ap.vert === "ALT" && out.capT < 0) out.capT = t;
    const beyond = up ? s.ac.s.altFt - s.ap.altSel : s.ap.altSel - s.ac.s.altFt;
    if (out.capT < 0 || t < out.capT + 40) out.peak = Math.max(out.peak, beyond); // overshoot at the capture
  });
  return out;
}
const between = (tr: { t: number[] }, arr: number[], t0: number, t1: number) =>
  arr.filter((_, i) => tr.t[i] >= t0 && tr.t[i] <= t1);

describe("VS with ALTS", () => {
  it("+500 fpm: rate held (±50 fpm calm, ±150 in light turbulence), ALT captured without overshoot", () => {
    for (const turb of [0, 0.15]) {
      const s = cruise({ turb });
      engaged(s);
      const tr = altChange(
        s,
        (x) => {
          x.controls.throttle = 0.9;
          x.ap.altSel = 5000;
          x.ap.pressVs(d(x));
          x.ap.vsSel = 500;
        },
        320,
      );
      expect(s.ap.vertArmed.alts || s.ap.vert === "ALT").toBe(true);
      const vs = between(tr, tr.vs, 20, tr.capT - 2);
      const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
      expect(Math.abs(mean - 500)).toBeLessThan(25);
      const tol = turb ? 150 : 50;
      expect(Math.max(...vs.map((v) => Math.abs(v - 500)))).toBeLessThan(tol);
      expect(tr.capT).toBeGreaterThan(0);
      expect(tr.peak).toBeLessThan(100);
      expect(Math.abs(s.ac.s.altFt - 5000)).toBeLessThan(40);
    }
  });

  it("VS held through a power reduction (the speed shows it, the AP does not chase it)", () => {
    const s = cruise();
    engaged(s);
    s.controls.throttle = 0.9;
    s.ap.altSel = 6000;
    s.ap.pressVs(d(s));
    s.ap.vsSel = 500;
    run(s, 40);
    const ias0 = d(s).iasKt;
    s.controls.throttle = 0.7;
    const vs: number[] = [];
    run(s, 60, (t) => {
      if (t > 10) vs.push(d(s).vsFpm);
    });
    expect(Math.max(...vs.map((v) => Math.abs(v - 500)))).toBeLessThan(60);
    expect(d(s).iasKt).toBeLessThan(ias0 - 5);
    expect(s.ap.vert).toBe("VS");
  });

  it("−700 fpm descent: captures 1500 ft without undershoot", () => {
    const s = cruise();
    engaged(s);
    const tr = altChange(
      s,
      (x) => {
        x.controls.throttle = 0.4;
        x.ap.altSel = 1500;
        x.ap.pressVs(d(x));
        x.ap.vsSel = -700;
      },
      200,
    );
    const vs = between(tr, tr.vs, 15, tr.capT - 2);
    expect(Math.max(...vs.map((v) => Math.abs(v + 700)))).toBeLessThan(60);
    expect(tr.peak).toBeLessThan(100);
    expect(s.ap.vert).toBe("ALT");
  });
});

describe("FLC", () => {
  it("climb at full power: speed held, no phugoid in the vertical speed, pitch sane, ALT captured", () => {
    const s = cruise();
    engaged(s);
    const tr = altChange(
      s,
      (x) => {
        x.controls.throttle = 1;
        x.ap.altSel = 5000;
        x.ap.pressFlc(d(x));
        x.ap.iasSel = 80;
      },
      300,
    );
    expect(tr.capT).toBeGreaterThan(0);
    const ias = between(tr, tr.ias, 40, tr.capT - 2);
    const vs = between(tr, tr.vs, 40, tr.capT - 2);
    expect(Math.max(...ias.map((v) => Math.abs(v - 80)))).toBeLessThan(3);
    expect(Math.max(...vs) - Math.min(...vs)).toBeLessThan(250); // was 409 → 1260 → −45 fpm (under-damped)
    expect(Math.min(...vs)).toBeGreaterThan(300);
    expect(Math.max(...tr.pitch)).toBeLessThan(12);
    expect(tr.peak).toBeLessThan(100);
  });

  it("descent at low power: goes down at once (never climbs first), within ±10° pitch and −1500 fpm", () => {
    const s = cruise();
    engaged(s);
    const sel = Math.round(d(s).iasKt);
    const tr = altChange(
      s,
      (x) => {
        x.controls.throttle = 0.25;
        x.ap.altSel = 2000;
        x.ap.pressFlc(d(x));
      },
      200,
    );
    expect(Math.max(...between(tr, tr.vs, 0, 30))).toBeLessThan(50);
    expect(Math.min(...tr.vs)).toBeGreaterThan(-1500);
    const pitch = between(tr, tr.pitch, 0, tr.capT);
    expect(Math.min(...pitch)).toBeGreaterThan(-10);
    expect(Math.max(...pitch)).toBeLessThan(10);
    const ias = between(tr, tr.ias, 30, tr.capT - 2);
    expect(Math.max(...ias.map((v) => Math.abs(v - sel)))).toBeLessThan(5);
    expect(tr.capT).toBeGreaterThan(0);
    expect(tr.peak).toBeLessThan(100);
  });

  it("never climbs away from a lower selected altitude, even at full power (the speed rises instead)", () => {
    const s = cruise();
    engaged(s);
    s.controls.throttle = 1;
    s.ap.altSel = 2000;
    s.ap.pressFlc(d(s));
    const ias0 = d(s).iasKt;
    let maxVs = -9999;
    run(s, 40, () => {
      maxVs = Math.max(maxVs, d(s).vsFpm);
    });
    expect(maxVs).toBeLessThan(100);
    expect(d(s).iasKt).toBeGreaterThan(ias0 + 3);
  });

  it("MAXSPD: a dive at full power is pitched up before VNE", () => {
    const s = cruise();
    engaged(s);
    s.controls.throttle = 1;
    s.ap.altSel = 500;
    s.ap.pressVs(d(s));
    s.ap.vsSel = -2000;
    let maxIas = 0;
    run(s, 60, () => {
      maxIas = Math.max(maxIas, d(s).iasKt);
      return s.ac.s.altFt < 1500;
    });
    expect(maxIas).toBeLessThan(s.ap.maxSpd + 6);
  });

  it("ALTS also captures from PIT when climbing through the selected altitude", () => {
    const s = cruise();
    engaged(s);
    s.controls.throttle = 1;
    s.ap.altSel = 3500;
    s.ap.pressAlt(d(s));
    s.ap.pressVs(d(s));
    s.ap.pressVs(d(s)); // second press → PIT at the current attitude
    expect(s.ap.vert).toBe("PIT");
    s.ap.pitchRef = 6;
    let peak = 0;
    run(s, 200, () => {
      peak = Math.max(peak, s.ac.s.altFt - 3500);
      return s.ap.vert === "ALT" && Math.abs(d(s).vsFpm) < 50;
    });
    expect(s.ap.vert).toBe("ALT");
    expect(peak).toBeLessThan(100);
  });
});

// ------------------------------------------------------------------------------------------------ GPS NAV
/** a three-leg GPS route with a `turn`° turn at the middle fix, aircraft established on the first leg */
function gpsRoute(
  turn: number,
  opts: { windKt?: number; flyOver?: boolean } = {},
) {
  const s = cruise({ windKt: opts.windKt ?? 0, windDir: 0 });
  const a = destination(s.ac.s, 270, 1);
  const b = destination(a, 90, 8);
  const c = destination(b, 90 + turn, 8);
  const wpts: Waypoint[] = [
    { ident: "AAA", ...a },
    { ident: "BBB", ...b, ...(opts.flyOver ? { flyOver: true } : {}) },
    { ident: "CCC", ...c },
  ];
  s.fp.setEnroute(wpts);
  s.fp.approachId = null;
  s.ac.s.psi = Math.PI / 2;
  s.ac.step(0.01, s.controls, s.weather);
  s.updateAvionics(0);
  s.setCdi("GPS");
  s.ap.toggleAp(d(s));
  s.ap.pressAlt(d(s));
  s.ap.pressNav(d(s), s.navInputs());
  return { s, a, b, c, wpts };
}

describe("NAV (GPS): leg tracking, turn anticipation, fly-by and fly-over turns", () => {
  it("captures and tracks the leg; DTK is the leg course", () => {
    const { s } = gpsRoute(60);
    run(s, 40);
    expect(s.ap.lat).toBe("GPS");
    expect(s.fp.out.toIdent).toBe("BBB");
    expect(Math.abs(wrap(s.fp.out.dtk - 90))).toBeLessThan(1);
    expect(Math.abs(s.fp.out.xtkNm)).toBeLessThan(0.05);
  });

  for (const [turn, wind] of [
    [60, 0],
    [90, 0],
    [90, 20],
    [-120, 15],
  ] as const) {
    it(`fly-by ${turn}° turn${wind ? ` with ${wind} kt of wind` : ""}: starts one anticipation distance early and flies the map's arc`, () => {
      const { s, b, wpts } = gpsRoute(turn, { windKt: wind });
      let seqAt: number | null = null;
      let maxDev = 0;
      let minToB = 99;
      const gs: number[] = [];
      let path: LatLon[] | null = null;
      run(s, 400, () => {
        gs.push(d(s).gsKt);
        if (seqAt === null && s.fp.out.toIdent === "CCC") {
          seqAt = distanceNm(s.ac.s, b);
          path = flyablePath(wpts, d(s).gsKt);
        }
        minToB = Math.min(minToB, distanceNm(s.ac.s, b));
        if (path && distanceNm(s.ac.s, b) < 2.5)
          maxDev = Math.max(maxDev, distToPath(s.ac.s, path));
        return distanceNm(s.ac.s, wpts[2]) < 1;
      });
      expect(seqAt).not.toBeNull();
      const gsNow = gs[gs.length - 1];
      const ant = turnAnticipationNm(90, 90 + turn, gsNow);
      expect(Math.abs(seqAt! - ant)).toBeLessThan(0.15 + ant * 0.2);
      // a fly-by never overflies the fix: the arc passes R·(sec(θ/2) − 1) inside it
      const R = ant / Math.tan((Math.abs(turn) / 2) * (Math.PI / 180));
      expect(minToB).toBeGreaterThan(0.5 * R * (1 / Math.cos((Math.abs(turn) / 2) * (Math.PI / 180)) - 1));
      expect(maxDev).toBeLessThan(wind ? 0.25 : 0.12);
      expect(Math.abs(s.fp.out.xtkNm)).toBeLessThan(0.1);
    });
  }

  it("fly-over fix: overflies it, turns, then goes direct to the next fix (as the map draws it)", () => {
    const { s, b, c, wpts } = gpsRoute(90, { flyOver: true });
    let minToB = 99;
    let maxDev = 0;
    const path = flyablePath(wpts, 95);
    run(s, 400, () => {
      minToB = Math.min(minToB, distanceNm(s.ac.s, b));
      if (distanceNm(s.ac.s, b) < 3)
        maxDev = Math.max(maxDev, distToPath(s.ac.s, path));
      return distanceNm(s.ac.s, c) < 1;
    });
    expect(minToB).toBeLessThan(0.15);
    expect(maxDev).toBeLessThan(0.3);
  });

  it("DTK wraps through north (leg 340° → 020°)", () => {
    const s = cruise();
    const a = destination(s.ac.s, 160, 1);
    const b = destination(a, 340, 6);
    const c = destination(b, 20, 6);
    s.fp.setEnroute([
      { ident: "AAA", ...a },
      { ident: "BBB", ...b },
      { ident: "CCC", ...c },
    ]);
    s.ac.s.psi = (340 * Math.PI) / 180;
    s.setCdi("GPS");
    s.ap.toggleAp(d(s));
    s.ap.pressAlt(d(s));
    s.ap.pressNav(d(s), s.navInputs());
    let minRoll = 99;
    run(s, 300, () => {
      if (s.fp.out.toIdent === "CCC") minRoll = Math.min(minRoll, d(s).rollDeg);
      return distanceNm(s.ac.s, c) < 2;
    });
    expect(s.fp.out.toIdent).toBe("CCC");
    expect(minRoll).toBeGreaterThan(-3); // right turn only
    expect(Math.abs(wrap(s.fp.out.dtk - 20))).toBeLessThan(2);
    expect(Math.abs(s.fp.out.xtkNm)).toBeLessThan(0.1);
  });

  it("Direct-To: DCT from present position, flown to the fix", () => {
    const s = cruise({ windKt: 15, windDir: 180 });
    s.setCdi("GPS");
    expect(s.directTo("TOBEY")).toBe(true);
    const f = findFix("TOBEY")!;
    s.updateAvionics(0);
    expect(s.fp.out.fromIdent).toBe("DCT");
    expect(Math.abs(wrap(s.fp.out.dtk - bearingDeg(s.ac.s, f)))).toBeLessThan(
      1,
    );
    s.ap.toggleAp(d(s));
    s.ap.pressAlt(d(s));
    s.ap.pressNav(d(s), s.navInputs());
    let minDist = 99;
    run(s, 900, () => {
      minDist = Math.min(minDist, distanceNm(s.ac.s, f));
      return minDist < 0.3;
    });
    expect(minDist).toBeLessThan(0.3);
  });

  it("NAV armed while far off course: HDG flies the intercept, GPS captures and tracks", () => {
    const { s } = gpsRoute(60);
    s.ap.pressHdg(d(s));
    // move 3 NM south of the leg, heading 060 to intercept
    const p = destination(s.ac.s, 180, 3);
    Object.assign(s.ac.s, {
      lat: p.lat,
      lon: p.lon,
      psi: (60 * Math.PI) / 180,
    });
    s.ap.hdgBug = 60;
    s.ap.lat = "HDG";
    s.ap.latArmed = null;
    s.ap.pressNav(d(s), s.navInputs());
    expect(s.ap.latArmed).toBe("GPS");
    run(s, 30);
    expect(s.ap.lat).toBe("HDG"); // still outside the capture window
    run(s, 300, () => s.ap.lat === "GPS" && Math.abs(s.fp.out.xtkNm) < 0.05);
    expect(s.ap.lat).toBe("GPS");
    expect(s.ap.latArmed).toBeNull();
  });

  it("switching the CDI source while coupled reverts to ROL", () => {
    const { s } = gpsRoute(60);
    run(s, 10);
    expect(s.ap.lat).toBe("GPS");
    s.setCdi("NAV1");
    run(s, 1);
    expect(s.ap.lat).toBe("ROL");
  });
});

// ------------------------------------------------------------------------------------------------ VOR / LOC
describe("NAV (VOR / LOC) with a crosswind", () => {
  it("VOR: intercepts the 090 radial outbound from ARD and tracks it with a 20 kt crosswind", () => {
    const s = cruise({ windKt: 20, windDir: 0 });
    const ard = NAVAIDS.find((n) => n.ident === "ARD")!;
    const p = destination(destination(ard, 90, 6), 180, 2.5);
    Object.assign(s.ac.s, {
      lat: p.lat,
      lon: p.lon,
      psi: (45 * Math.PI) / 180,
    });
    s.av.nav1.active = ard.freq;
    s.updateAvionics(0);
    s.setCdi("NAV1");
    s.av.obs1 = 90; // after the CDI switch (which slews the course to a tuned LOC)
    s.ap.hdgBug = 45;
    s.ap.toggleAp(d(s));
    s.ap.pressHdg(d(s));
    s.ap.pressAlt(d(s));
    s.updateAvionics(0);
    s.ap.pressNav(d(s), s.navInputs());
    expect(s.ap.latArmed).toBe("VOR");
    run(s, 300, () => s.ap.lat === "VOR");
    expect(s.ap.lat).toBe("VOR");
    run(s, 90); // intercept transient
    const devs: number[] = [];
    run(s, 120, () => {
      devs.push(Math.abs(s.nav1.dev));
    });
    expect(Math.max(...devs)).toBeLessThan(0.15); // < 1.5° (CDI full scale 10°)
    expect(Math.abs(d(s).driftDeg)).toBeGreaterThan(5); // crabbing into the wind
  });

  it("ILS: LOC and GS arm, capture and track to DA with a 15 kt crosswind", () => {
    const s = new Sim(sc("ils27-vtf"));
    Object.assign(s.weather, {
      turbulence: 0.15,
      gustKt: 0,
      windKt: 15,
      windDir: 220,
    });
    s.ap.toggleAp(d(s));
    s.ap.pressHdg(d(s));
    s.ap.pressAlt(d(s));
    s.ap.pressApr(d(s), s.navInputs());
    expect(s.ap.apprMode).toBe(true);
    expect(s.ap.latArmed).toBe("LOC");
    expect(s.ap.vertArmed.gs).toBe(true);
    let gsBeforeLoc = false;
    run(s, 900, () => {
      if (s.ap.vert === "GS" && s.ap.lat !== "LOC") gsBeforeLoc = true;
      if (s.ap.vert === "GS") {
        s.controls.flaps = 1;
        s.controls.throttle = 0.42;
      }
      return s.ap.vert === "GS" && d(s).aglFt < 220;
    });
    expect(gsBeforeLoc).toBe(false); // GS only captures once the LOC is active
    expect(s.ap.lat).toBe("LOC");
    expect(s.ap.vert).toBe("GS");
    const r = runway("PARD", "27");
    expect(
      Math.abs(crossTrackNm(r.end, r.threshold, s.ac.s) * FT_PER_NM),
    ).toBeLessThan(120);
    expect(Math.abs(s.nav1.gsDev)).toBeLessThan(0.3);
    expect(Math.abs(s.nav1.dev)).toBeLessThan(0.2);
  });

  it("BC: the back course is flown with reversed sensing (B/CRS on the airliner)", () => {
    const s = new Sim(sc("locbc09"));
    s.weather.turbulence = 0;
    s.setCdi("NAV1");
    s.updateAvionics(0);
    s.ap.toggleAp(d(s));
    s.ap.pressHdg(d(s));
    s.ap.pressAlt(d(s));
    s.ap.pressNav(d(s), s.navInputs());
    expect(s.ap.latArmed).toBe("BC");
    let maxDevLate = 0;
    run(s, 900, () => {
      if (s.ap.lat === "BC" && s.nav1.distNm < 9)
        maxDevLate = Math.max(maxDevLate, Math.abs(s.nav1.dev));
      return s.ap.lat === "BC" && s.nav1.distNm < 3;
    });
    expect(s.ap.lat).toBe("BC");
    expect(maxDevLate).toBeLessThan(0.3);
  });
});

// ------------------------------------------------------------------------------------------------ RNAV approaches
describe("RNAV approaches (LPV, LNAV/VNAV glidepath)", () => {
  for (const [id, rw] of [
    ["rnav09", "09"],
    ["rnav03", "03"],
  ] as const) {
    it(`${id}: vectors to final, GP captured and tracked to 250 ft AGL`, () => {
      const s = new Sim(sc(id));
      Object.assign(s.weather, { turbulence: 0.1, gustKt: 0 });
      s.reposition("final10");
      s.setCdi("GPS");
      s.ap.toggleAp(d(s));
      s.ap.pressAlt(d(s));
      s.ap.pressNav(d(s), s.navInputs());
      s.ap.pressApr(d(s), s.navInputs());
      expect(s.ap.vertArmed.gp).toBe(true);
      let gp = false;
      run(s, 900, () => {
        if (s.ap.vert === "GP") {
          gp = true;
          s.controls.flaps = 1;
          s.controls.throttle = 0.42;
        }
        return gp && d(s).aglFt < 250;
      });
      expect(gp).toBe(true);
      expect(s.fp.out.mode).toBe("APR");
      const apr = s.fp.approach!;
      const r = runway(apr.airport, rw);
      expect(
        Math.abs(crossTrackNm(r.end, r.threshold, s.ac.s) * FT_PER_NM),
      ).toBeLessThan(200);
      expect(Math.abs(s.fp.out.gpDev)).toBeLessThan(0.35);
    });
  }
});

// ------------------------------------------------------------------------------------------------ flight plan logic
describe("approach activation, missed approach and holds", () => {
  it("activate approach: direct to the first approach fix; vectors-to-final: FAF leg on the final course", () => {
    const fp = new FlightPlan();
    fp.loadApproach("PARD-I27", "TOBEY");
    const here = destination(findFix("TOBEY")!, 30, 12);
    fp.activateApproach(here);
    expect(fp.approachActive).toBe(true);
    expect(fp.wpts[fp.active].ident).toBe("TOBEY");
    expect(fp.update({ ...here, altFt: 4000 }, 100, 210).fromIdent).toBe("DCT");
    fp.vectorsToFinal();
    const faf = fp.wpts[fp.active];
    expect(faf.role).toBe("FAF");
    const ap = fp.approach!;
    const o = fp.update(
      { ...destination(faf, ap.finalCourse + 180, 6), altFt: 2500 },
      100,
      ap.finalCourse,
    );
    expect(Math.abs(wrap(o.dtk - ap.finalCourse))).toBeLessThan(1);
    expect(Math.abs(o.xtkNm)).toBeLessThan(0.05);
  });

  it("missed approach: SUSP at the MAP, then MAPR guidance to the MAHP and the hold entry", () => {
    const s = new Sim(sc("ils27-vtf"));
    Object.assign(s.weather, { turbulence: 0, windKt: 10, windDir: 250 });
    const rw = findFix("RW27")!;
    const p = destination(rw, 90, 0.6);
    Object.assign(s.ac.s, {
      lat: p.lat,
      lon: p.lon,
      altFt: 700,
      psi: (270 * Math.PI) / 180,
    });
    s.fp.activateLeg(s.fp.wpts.findIndex((w) => w.ident === "RW27"));
    s.updateAvionics(0);
    run(s, 40, () => s.fp.out.suspended);
    expect(s.fp.out.suspended).toBe(true);
    // go-around: TOGA power, missed approach activated, AP in NAV + VS climb
    s.fp.activateMissed();
    s.controls.throttle = 1;
    s.setCdi("GPS");
    s.ap.altSel = 3000;
    s.ap.toggleAp(d(s));
    s.ap.pressVs(d(s));
    s.ap.vsSel = 600;
    s.ap.pressNav(d(s), s.navInputs());
    run(s, 2);
    expect(s.fp.out.mode).toBe("MAPR");
    expect(s.fp.out.suspended).toBe(false);
    const mahp = s.fp.wpts[s.fp.active];
    expect(mahp.hold).toBeTruthy();
    let held = false;
    run(s, 900, () => {
      if (s.fp.out.holding) held = true;
      return held && s.fp.out.holdPhase === "racetrack";
    });
    expect(held).toBe(true);
    expect(s.fp.out.holdEntry).not.toBeNull();
    run(s, 400, () => s.ap.vert === "ALT" && Math.abs(s.ac.s.altFt - 3000) < 20);
    expect(s.ap.vert).toBe("ALT");
    expect(s.fp.out.holding).toBe(true);
  });

  it("hold with a 20 kt wind: racetrack stays on the holding side, inbound leg ~1 min", () => {
    const s = new Sim(sc("free"));
    Object.assign(s.weather, {
      turbulence: 0,
      gustKt: 0,
      windKt: 20,
      windDir: 200,
    });
    s.weather.aloft = undefined;
    const ard = findFix("ARD")!;
    const p = destination(ard, 90, 4);
    Object.assign(s.ac.s, {
      lat: p.lat,
      lon: p.lon,
      altFt: 3000,
      psi: (270 * Math.PI) / 180,
    });
    s.controls.trim = -0.25;
    s.fp.setHold(
      { ident: "ARD", lat: ard.lat, lon: ard.lon },
      270,
      "R",
      1,
      s.ac.s,
      3000,
    );
    s.setCdi("GPS");
    s.ap.altSel = 3000;
    s.ap.toggleAp(d(s));
    s.ap.pressNav(d(s), s.navInputs());
    s.ap.pressAlt(d(s));
    const def = {
      fix: ard,
      inbound: 270,
      turn: "R" as const,
      legMin: 1,
      altFt: 3000,
    };
    let maxNonHolding = 0;
    let inboundStart: number | null = null;
    const inboundTimes: number[] = [];
    let wasInbound = false;
    let tt = 0;
    run(s, 900, (t) => {
      tt = t;
      const fr = holdFrame(def, s.ac.s);
      if (t > 120) maxNonHolding = Math.max(maxNonHolding, -fr.y); // y > 0 = holding side for a right hold
      const inbound =
        Math.abs(wrap(d(s).trackTrue - 270)) < 20 &&
        fr.x < 0 &&
        fr.x > -6 &&
        Math.abs(fr.y) < 0.5;
      if (inbound && !wasInbound) inboundStart = t;
      if (!inbound && wasInbound && inboundStart !== null && fr.x > -0.3)
        inboundTimes.push(t - inboundStart);
      wasInbound = inbound;
    });
    expect(tt).toBeGreaterThan(800);
    expect(s.fp.out.holding).toBe(true);
    expect(maxNonHolding).toBeLessThan(0.6);
    expect(inboundTimes.length).toBeGreaterThanOrEqual(2);
    for (const ti of inboundTimes.slice(1)) {
      expect(ti).toBeGreaterThan(35);
      expect(ti).toBeLessThan(85);
    }
  });

  it("DME arc guidance publishes the arc radius for roll steering", () => {
    const fp = new FlightPlan();
    fp.loadApproach("MSVL-V21", "TOMAS (10 DME ARC)");
    const iArc = fp.wpts.findIndex((w) => !!w.arc);
    expect(iArc).toBeGreaterThan(0);
    fp.activateLeg(iArc);
    const w = fp.wpts[iArc];
    const msv = findFix("MSV")!;
    const onArc = destination(
      msv,
      bearingDeg(msv, fp.wpts[iArc - 1]) + (w.arc!.dir === "R" ? 20 : -20),
      10,
    );
    const o = fp.update({ ...onArc, altFt: 4500 }, 100, 0);
    expect(o.arcRadiusNm).toBe(10);
    expect(o.arcDir).toBe(w.arc!.dir);
    expect(Math.abs(o.xtkNm)).toBeLessThan(0.05);
  });

  it("a nav database swap under a loaded plan never throws (approach no longer resolvable)", () => {
    const fp = new FlightPlan();
    fp.loadApproach("PARD-I27", null);
    fp.approachId = "NOWHERE-I99";
    fp.approachActive = true;
    expect(fp.approach).toBeNull();
    const o = fp.update({ ...fp.wpts[1], altFt: 3000 }, 100, 270);
    expect(o.valid).toBe(true);
    expect(o.approachName).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------ disconnect
describe("AP disconnect", () => {
  it("manual: AP off, flashing AP annunciation, the flight director stays on", () => {
    const s = cruise();
    engaged(s);
    s.ap.toggleAp(d(s));
    expect(s.ap.ap).toBe(false);
    expect(s.ap.fd).toBe(true);
    expect(s.ap.annunciation?.text).toBe("AP");
  });

  it("upset: the AP disconnects beyond its attitude limits instead of fighting", () => {
    const s = cruise();
    engaged(s);
    s.ac.s.phi = (65 * Math.PI) / 180;
    run(s, 0.5);
    expect(s.ap.ap).toBe(false);
    expect(s.ap.annunciation?.text).toBe("AP");
  });

  it("failure / inhibit: an AP failure disconnects and blocks re-engagement", () => {
    const s = cruise();
    engaged(s);
    s.setFailure("ap", true);
    expect(s.ap.ap).toBe(false);
    s.ap.toggleAp(d(s));
    expect(s.ap.ap).toBe(false);
    expect(s.ap.annunciation?.text).toBe("AP FAIL");
  });
});

// ------------------------------------------------------------------------------------------------ real world
const realFetch = globalThis.fetch;
describe("real-world data", () => {
  beforeAll(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage ??= {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage;
    globalThis.fetch = (async (u: string) => {
      const url = String(u);
      if (url.startsWith("/navdata/")) {
        const p = `public${url}`;
        if (!fs.existsSync(p)) return new Response("", { status: 404 });
        return new Response(fs.readFileSync(p), { status: 200 });
      }
      return new Response("", { status: 404 });
    }) as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  it("KSFO ILS 28R: coupled from a 10 NM final to DA", async () => {
    const { loadRegion, leaveRealWorld } = await import("../src/nav/world");
    const { APPROACHES } = await import("../src/nav/data");
    await loadRegion(["KSFO", "KSJC"]);
    try {
      const ils = APPROACHES.find(
        (a) => a.airport === "KSFO" && a.type === "ILS" && a.runway === "28R",
      );
      expect(ils, "KSFO ILS 28R in the nav database").toBeTruthy();
      const s = new Sim(sc("free"));
      Object.assign(s.weather, {
        turbulence: 0.1,
        gustKt: 0,
        windKt: 10,
        windDir: 300,
        ceilingFt: 15000,
        visibilitySm: 10,
      });
      s.weather.aloft = undefined;
      s.loadApproach(ils!.id, null, "vtf");
      s.reposition("final10");
      s.setCdi("NAV1");
      s.ap.toggleAp(d(s));
      s.ap.pressHdg(d(s));
      s.ap.pressAlt(d(s));
      s.ap.pressApr(d(s), s.navInputs());
      const da = (ils!.minimums[0].da ?? 213) as number;
      const r = runway("KSFO", "28R");
      let gs = false;
      run(s, 900, () => {
        if (s.ap.vert === "GS") {
          gs = true;
          s.controls.flaps = 1;
          s.controls.throttle = 0.42;
        }
        return gs && s.ac.s.altFt < da;
      });
      expect(s.ap.lat).toBe("LOC");
      expect(gs).toBe(true);
      expect(
        Math.abs(crossTrackNm(r.end, r.threshold, s.ac.s) * FT_PER_NM),
      ).toBeLessThan(150);
      expect(Math.abs(s.nav1.gsDev)).toBeLessThan(0.35);
      expect(s.ac.s.crashed).toBeNull();
    } finally {
      leaveRealWorld();
    }
  }, 60000);
});
