// Garmin-faithful flight-plan editing, in-flight changes, CDI scaling and automatic CDI switching.
import { describe, it, expect } from "vitest";
import {
  FlightPlan,
  cdiScale,
  serviceLevel,
  type CdiScaleInput,
  type Waypoint,
} from "../src/nav/flightplan";
import { approach, findFix } from "../src/nav/data";
import { destination, distanceNm, bearingDeg } from "../src/nav/geo";
import { Sim, SCENARIOS } from "../src/sim/sim";
import { newMfdState, fmsKey, fmsView } from "../src/avionics/mfd";

const DT = 1 / 30;
const sc = (id: string) => SCENARIOS.find((s) => s.id === id)!;
const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const ids = (fp: FlightPlan) => fp.wpts.map((w) => w.ident);
function run(s: Sim, seconds: number, each?: () => boolean | void): number {
  let t = 0;
  for (; t < seconds; t += DT) {
    s.step(DT);
    if (each && each()) break;
  }
  return t;
}
const ard = findFix("ARD")!;
/** en-route A-B-C west to east, 10 NM apart, north of ARD, then the PARD ILS 27 via TOBEY */
function planABC(): FlightPlan {
  const fp = new FlightPlan();
  const A: Waypoint = { ident: "AAA", ...destination(ard, 330, 30) };
  const B: Waypoint = { ident: "BBB", ...destination(A, 90, 10) };
  const C: Waypoint = { ident: "CCC", ...destination(B, 90, 10) };
  fp.setEnroute([A, B, C]);
  fp.loadApproach("PARD-I27", "TOBEY");
  return fp;
}

describe("FPL editing keeps the plan consistent", () => {
  it("insert then remove restores the plan, the active leg stays on the same waypoint", () => {
    const fp = planABC();
    const before = ids(fp);
    expect(fp.wpts[fp.active].ident).toBe("BBB");
    const Y: Waypoint = { ident: "YYY", ...destination(fp.wpts[1], 90, 4) };
    expect(fp.insertWaypoint(2, Y)).toBe(true);
    expect(ids(fp)).toEqual(["AAA", "BBB", "YYY", "CCC", ...before.slice(3)]);
    expect(fp.wpts[fp.active].ident).toBe("BBB");
    expect(fp.removeWaypoint(2)).toBe(true);
    expect(ids(fp)).toEqual(before);
    expect(fp.wpts[fp.active].ident).toBe("BBB");
  });
  it("a waypoint inserted into the active leg becomes the active waypoint", () => {
    const fp = planABC();
    const X: Waypoint = { ident: "XXX", ...destination(fp.wpts[0], 90, 5) };
    fp.insertWaypoint(fp.active, X);
    expect(fp.wpts[fp.active].ident).toBe("XXX");
    expect(fp.wpts[fp.active - 1].ident).toBe("AAA");
  });
  it("a published procedure cannot be edited inside; Remove Approach removes it whole", () => {
    const fp = planABC();
    const iKeddy = fp.wpts.findIndex((w) => w.ident === "KEDDY");
    expect(
      fp.insertWaypoint(iKeddy, { ident: "ZZZ", ...destination(ard, 0, 3) }),
    ).toBe(false);
    expect(fp.removeWaypoint(iKeddy)).toBe(false);
    expect(fp.removeApproach()).toBe(true);
    expect(ids(fp)).toEqual(["AAA", "BBB", "CCC"]);
    expect(fp.approachId).toBeNull();
  });
  it("removing the active waypoint makes the next one active, on the leg from the previous waypoint", () => {
    const fp = planABC();
    fp.update({ ...fp.wpts[0], altFt: 4000 }, 100, 90);
    fp.removeWaypoint(fp.active);
    expect(fp.wpts[fp.active].ident).toBe("CCC");
    expect(fp.update({ ...fp.wpts[0], altFt: 4000 }, 100, 90).fromIdent).toBe(
      "AAA",
    );
  });
});

describe("Direct-To keeps the stored plan", () => {
  it("to a fix of the plan: sequences on from it, nothing removed", () => {
    const fp = planABC();
    const n = fp.wpts.length;
    const here = destination(fp.wpts[1], 180, 3);
    fp.directTo({ ident: "CCC", lat: 0, lon: 0 }, here);
    expect(fp.wpts.length).toBe(n);
    expect(fp.wpts[fp.active].ident).toBe("CCC");
    expect(fp.update({ ...here, altFt: 4000 }, 100, 90).fromIdent).toBe("DCT");
  });
  it("to a fix off the plan: inserted in front of the active waypoint, the plan continues after it", () => {
    const fp = planABC();
    const n = fp.wpts.length;
    const X: Waypoint = { ident: "XXX", ...destination(fp.wpts[1], 0, 8) };
    const here = destination(fp.wpts[0], 90, 2);
    fp.directTo(X, here);
    expect(fp.wpts.length).toBe(n + 1);
    expect(fp.wpts[fp.active].ident).toBe("XXX");
    expect(fp.wpts[fp.active + 1].ident).toBe("BBB");
    expect(fp.approachId).toBe("PARD-I27");
    // overfly X: the plan resumes with BBB
    const o = fp.update({ ...destination(X, 180, 0.05), altFt: 4000 }, 100, 0);
    expect(o.toIdent).toBe("BBB");
  });
  it("Cancel Direct-To removes the off-plan fix and resumes the leg that was active", () => {
    const fp = planABC();
    const before = ids(fp);
    fp.directTo(
      { ident: "XXX", ...destination(fp.wpts[1], 0, 8) },
      destination(fp.wpts[0], 90, 2),
    );
    expect(fp.cancelDirect()).toBe(true);
    expect(ids(fp)).toEqual(before);
    expect(fp.wpts[fp.active].ident).toBe("BBB");
  });
  it("Direct-To an approach fix activates the approach", () => {
    const fp = planABC();
    fp.directTo(
      { ident: "TOBEY", lat: 0, lon: 0 },
      destination(fp.wpts[2], 180, 5),
    );
    expect(fp.approachActive).toBe(true);
    expect(fp.wpts[fp.active].ident).toBe("TOBEY");
  });
  it("Direct-To with a selected course flies that course into the fix", () => {
    const fp = planABC();
    const here = destination(fp.wpts[2], 200, 6);
    fp.directTo({ ident: "CCC", lat: 0, lon: 0 }, here, { course: 45 });
    const o = fp.update({ ...here, altFt: 4000 }, 100, 45);
    expect(Math.abs(wrap(o.dtk - 45))).toBeLessThan(1);
  });
});

describe("Activate Leg needs a confirmation", () => {
  it("request → nothing changes until ENT; CLR cancels", () => {
    const fp = planABC();
    const was = fp.active;
    expect(fp.requestActivateLeg(3)).toBe(true);
    expect(fp.active).toBe(was);
    expect(fp.pendingLeg).toBe(3);
    fp.activeLegConfirm(false);
    expect(fp.active).toBe(was);
    expect(fp.pendingLeg).toBeNull();
    fp.requestActivateLeg(3);
    fp.activeLegConfirm(true);
    expect(fp.active).toBe(3);
    expect(fp.approachActive).toBe(true); // leg TOBEY is part of the approach
  });
});

describe("holds inside the plan", () => {
  it("Hold At Waypoint keeps the route and the approach after the fix", () => {
    const fp = planABC();
    const after = ids(fp).slice(2);
    const i = fp.holdAt(1, { inbound: 270, turn: "R", legMin: 1 });
    expect(i).toBe(1);
    expect(fp.wpts[1].hold).toMatchObject({
      inbound: 270,
      turn: "R",
      kind: "user",
    });
    expect(ids(fp).slice(2)).toEqual(after);
  });
  it("legacy setHold() no longer wipes the plan", () => {
    const fp = planABC();
    const n = fp.wpts.length;
    fp.setHold(
      { ...ard, ident: "ARD" },
      270,
      "R",
      1,
      destination(ard, 90, 5),
      3000,
    );
    expect(fp.wpts.length).toBe(n + 1);
    expect(fp.wpts[fp.active].ident).toBe("ARD");
    expect(fp.wpts[fp.active].hold?.inbound).toBe(270);
    expect(fp.approachId).toBe("PARD-I27");
  });
  it("hold at present position: SUSP in the hold, Exit Hold (SUSP key) continues the plan", () => {
    const s = new Sim(sc("free"));
    Object.assign(s.weather, { turbulence: 0, gustKt: 0, windKt: 0 });
    s.weather.aloft = undefined;
    const p0 = destination(ard, 90, 12);
    Object.assign(s.ac.s, {
      lat: p0.lat,
      lon: p0.lon,
      altFt: 3000,
      psi: (270 * Math.PI) / 180,
    });
    s.controls.trim = -0.25;
    const W: Waypoint = { ident: "WWW", ...destination(ard, 270, 6) };
    s.fp.setEnroute([
      { ident: "EEE", ...destination(ard, 90, 20) },
      { ...ard, ident: "ARD" },
      W,
    ]);
    s.setCdi("GPS");
    s.ap.altSel = 3000;
    s.ap.toggleAp(s.ac.data);
    s.ap.pressNav(s.ac.data, s.navInputs());
    s.ap.pressAlt(s.ac.data);
    run(s, 20);
    const n = s.fp.wpts.length;
    const at = s.fp.holdAt("ppos", { turn: "R", legMin: 1 });
    expect(s.fp.wpts[at].ident).toBe("PPOS");
    expect(s.fp.wpts.length).toBe(n + 1);
    expect(s.fp.wpts[at + 1].ident).toBe("ARD");
    expect(Math.abs(wrap(s.fp.wpts[at].hold!.inbound - 270))).toBeLessThan(3);
    run(
      s,
      300,
      () =>
        s.fp.out.holding && s.fp.out.holdPhase === "racetrack" && s.time > 200,
    );
    expect(s.fp.out.holding).toBe(true);
    expect(s.fp.out.suspended).toBe(true);
    expect(s.fp.out.suspReason).toBe("HOLD");
    expect(s.obsKeyLabel()).toBe("SUSP");
    expect(s.obsKey()).toBe("resume");
    // the aircraft finishes the circuit, crosses the fix inbound, and goes on to ARD
    run(
      s,
      400,
      () => s.fp.wpts[s.fp.active].ident === "ARD" && !s.fp.out.holding,
    );
    expect(s.fp.out.holding).toBe(false);
    expect(s.fp.wpts[s.fp.active].ident).toBe("ARD");
    expect(s.fp.out.suspended).toBe(false);
    run(s, 700, () => distanceNm(s.ac.s, ard) < 0.6);
    expect(distanceNm(s.ac.s, ard)).toBeLessThan(0.6);
  });
});

describe("OBS and SUSP", () => {
  it("OBS 090 through the active waypoint: crossing it does not sequence, TO flips to FROM", () => {
    const fp = planABC();
    const B = fp.wpts[1];
    fp.update({ ...destination(B, 270, 3), altFt: 4000 }, 100, 90);
    fp.setObs(true, 90);
    let o = fp.update({ ...destination(B, 270, 2), altFt: 4000 }, 100, 90);
    expect(o.obs).toBe(true);
    expect(o.toFrom).toBe("TO");
    expect(Math.abs(wrap(o.dtk - 90))).toBeLessThan(0.5);
    o = fp.update({ ...destination(B, 90, 0.05), altFt: 4000 }, 100, 90);
    o = fp.update({ ...destination(B, 90, 2), altFt: 4000 }, 100, 90);
    expect(o.toIdent).toBe("BBB");
    expect(o.toFrom).toBe("FROM");
    // north of an eastbound course = left of it: fly right (+dev); south: fly left
    o = fp.update(
      { ...destination(destination(B, 90, 2), 0, 0.5), altFt: 4000 },
      100,
      90,
    );
    expect(o.dev).toBeGreaterThan(0.3);
    o = fp.update(
      { ...destination(destination(B, 90, 2), 180, 0.5), altFt: 4000 },
      100,
      90,
    );
    expect(o.dev).toBeLessThan(-0.3);
    fp.setObs(false);
    o = fp.update({ ...destination(B, 90, 2), altFt: 4000 }, 100, 90);
    expect(o.toIdent).toBe("CCC"); // back to automatic sequencing
  });
  it("the CRS knob sets the OBS course on the GPS CDI", () => {
    const s = new Sim(sc("ils27-full"));
    s.setCdi("GPS");
    expect(s.obsKey()).toBe("obs-on");
    s.setCourse(123);
    expect(s.course()).toBe(123);
    s.updateAvionics(0);
    expect(Math.round(s.fp.out.dtk)).toBe(123);
  });
  it("past the MAP: SUSP; the SUSP key activates the missed approach", () => {
    const fp = new FlightPlan();
    fp.loadApproach("PARD-I27", null);
    fp.vectorsToFinal();
    const rw = findFix("RW27")!;
    fp.activateLeg(fp.wpts.findIndex((w) => w.ident === "RW27"));
    const o = fp.update({ ...destination(rw, 270, 0.3), altFt: 600 }, 90, 270);
    expect(o.suspended).toBe(true);
    expect(o.suspReason).toBe("MAP");
    fp.resume();
    expect(fp.missedActive).toBe(true);
    expect(
      fp.update({ ...destination(rw, 270, 0.3), altFt: 600 }, 90, 270).toIdent,
    ).toBe("ARD");
  });
  it("a pilot SUSP keeps the active waypoint past it", () => {
    const fp = planABC();
    fp.suspend();
    const B = fp.wpts[1];
    fp.update({ ...destination(B, 270, 1), altFt: 4000 }, 100, 90);
    const o = fp.update({ ...destination(B, 90, 1), altFt: 4000 }, 100, 90);
    expect(o.toIdent).toBe("BBB");
    expect(o.suspReason).toBe("PILOT");
    fp.resume();
    expect(
      fp.update({ ...destination(B, 90, 1), altFt: 4000 }, 100, 90).suspended,
    ).toBe(false);
  });
});

describe("approach load / activate / vectors to final / missed", () => {
  it("Load does not activate; Activate goes direct to the IAF", () => {
    const fp = planABC();
    expect(fp.approachActive).toBe(false);
    fp.activateApproach(destination(fp.wpts[2], 180, 5));
    expect(fp.approachActive).toBe(true);
    expect(fp.wpts[fp.active].ident).toBe("TOBEY");
  });
  it("VTF (GNS / G1000): the approach fixes before the FAF leave the plan, FAF active on the final course", () => {
    const fp = planABC();
    fp.vectorsToFinal();
    expect(ids(fp)).toEqual(["AAA", "BBB", "CCC", "MARLO", "RW27", "ARD"]);
    expect(fp.wpts[fp.active].ident).toBe("MARLO");
    expect(fp.wpts.some((w) => w.appr === "trans")).toBe(false);
    const ap = approach("PARD-I27");
    const o = fp.update(
      {
        ...destination(fp.wpts[fp.active], ap.finalCourse + 180, 6),
        altFt: 2500,
      },
      100,
      270,
    );
    expect(o.fromIdent).toBe("VTF");
    expect(Math.abs(wrap(o.dtk - 270))).toBeLessThan(1);
  });
  it("VTF with a GTN-style profile keeps the on-course fixes", () => {
    const fp = planABC();
    fp.profile.vtfDropsPreFaf = false;
    fp.vectorsToFinal();
    expect(ids(fp)).toContain("KEDDY");
    expect(fp.wpts[fp.active].ident).toBe("MARLO");
  });
});

describe("CDI scaling (Garmin flight phases)", () => {
  const base: CdiScaleInput = {
    dDestNm: 60,
    dOriginNm: Infinity,
    departing: false,
    approachActive: false,
    missedActive: false,
    gpsApproved: true,
    toFaf: false,
    distToFafNm: Infinity,
    trackErrDeg: 0,
    bearingErrDeg: 0,
    pastFaf: false,
    dThrNm: 20,
    angular: false,
    missedFirstLeg: false,
    missedAligned: false,
  };
  it("ENR 2.0, TERM inside 31 NM ramping to 1.0 over 1 NM", () => {
    expect(cdiScale(base)).toEqual({ mode: "ENR", fs: 2 });
    const mid = cdiScale({ ...base, dDestNm: 30.5 });
    expect(mid.mode).toBe("TERM");
    expect(mid.fs).toBeCloseTo(1.5, 2);
    expect(cdiScale({ ...base, dDestNm: 12 })).toEqual({ mode: "TERM", fs: 1 });
    expect(cdiScale({ ...base, dOriginNm: 10 })).toEqual({
      mode: "TERM",
      fs: 1,
    });
  });
  it("DPRT 0.3 on a departure procedure near the origin", () => {
    expect(cdiScale({ ...base, departing: true, dOriginNm: 8 })).toEqual({
      mode: "DPRT",
      fs: 0.3,
    });
  });
  it("APR only within 45° of the final course inside 2 NM of the FAF, ramping to 0.3", () => {
    const near = {
      ...base,
      dDestNm: 7,
      approachActive: true,
      toFaf: true,
      distToFafNm: 1.5,
    };
    expect(cdiScale({ ...near, trackErrDeg: 50 }).mode).toBe("TERM");
    expect(cdiScale({ ...near, bearingErrDeg: -50 }).mode).toBe("TERM");
    const a = cdiScale(near);
    expect(a.mode).toBe("APR");
    expect(a.fs).toBeLessThan(1);
    expect(cdiScale({ ...near, distToFafNm: 0.5 }).fs).toBeLessThan(a.fs);
    expect(cdiScale({ ...near, distToFafNm: 0 }).fs).toBeCloseTo(0.3, 5);
  });
  it("past the FAF: 0.3 NM linear, angular (LPV) narrower towards the threshold", () => {
    const fin = { ...base, dDestNm: 3, approachActive: true, pastFaf: true };
    expect(cdiScale({ ...fin, dThrNm: 4 })).toEqual({ mode: "APR", fs: 0.3 });
    const far = cdiScale({ ...fin, angular: true, dThrNm: 4 }).fs;
    const near = cdiScale({ ...fin, angular: true, dThrNm: 0.5 }).fs;
    expect(near).toBeLessThan(far);
    expect(far).toBeLessThanOrEqual(0.3);
  });
  it("GPS not approved for a localizer final: TERM, never APR", () => {
    expect(
      cdiScale({
        ...base,
        dDestNm: 3,
        approachActive: true,
        pastFaf: true,
        gpsApproved: false,
      }).mode,
    ).toBe("TERM");
  });
  it("MAPR 0.3 on an aligned first missed leg, 1.0 when not aligned, then TERM", () => {
    const m = { ...base, dDestNm: 2, approachActive: true, missedActive: true };
    expect(
      cdiScale({ ...m, missedFirstLeg: true, missedAligned: true }),
    ).toEqual({ mode: "MAPR", fs: 0.3 });
    expect(
      cdiScale({ ...m, missedFirstLeg: true, missedAligned: false }),
    ).toEqual({ mode: "MAPR", fs: 1 });
    expect(cdiScale({ ...m, missedFirstLeg: false })).toEqual({
      mode: "TERM",
      fs: 1,
    });
  });
  it("service level from the procedure, LPV downgraded to LNAV", () => {
    expect(serviceLevel(approach("PARD-R09"))).toBe("LPV");
    expect(serviceLevel(approach("PARD-R09"), true)).toBe("LNAV");
    expect(serviceLevel(approach("MSVL-R03"))).toBe("L/VNAV");
    expect(serviceLevel(approach("PARD-I27"))).toBeNull();
  });
  it("flown: the RNAV 09 annunciates LPV in place of APR past the FAF", () => {
    const fp = new FlightPlan();
    fp.loadApproach("PARD-R09", null);
    fp.vectorsToFinal();
    const iMap = fp.wpts.findIndex((w) => w.ident === "RW09");
    fp.activateLeg(iMap);
    const perch = findFix("PERCH")!;
    const o = fp.update({ ...destination(perch, 90, 1), altFt: 1800 }, 90, 90);
    expect(o.mode).toBe("APR");
    expect(o.phaseLabel).toBe("LPV");
    fp.downgrade = true;
    const o2 = fp.update({ ...destination(perch, 90, 1), altFt: 1800 }, 90, 90);
    expect(o2.phaseLabel).toBe("LNAV");
    expect(o2.downgrade).toBe(true);
    expect(o2.gpValid).toBe(false);
  });
});

describe("automatic GPS → LOC1 CDI switch (G1000 conditions)", () => {
  /** ILS 27 via TOBEY, aircraft established on the KEDDY–MARLO leg `dist` NM before MARLO */
  function onFinal(dist: number, opts: { offNm?: number } = {}) {
    const s = new Sim(sc("ils27-full"));
    Object.assign(s.weather, { turbulence: 0, gustKt: 0, windKt: 0 });
    const marlo = findFix("MARLO")!;
    s.fp.activateLeg(s.fp.wpts.findIndex((w) => w.ident === "MARLO"));
    s.fp.approachActive = true;
    const p = destination(destination(marlo, 90, dist), 0, opts.offNm ?? 0);
    Object.assign(s.ac.s, {
      lat: p.lat,
      lon: p.lon,
      altFt: 3000,
      psi: (270 * Math.PI) / 180,
    });
    s.setCdi("GPS");
    s.ac.step(0.01, s.controls, s.weather);
    return s;
  }
  it("switches to NAV1 with the FAF active within 15 NM, LOC tuned, on course", () => {
    const s = onFinal(10);
    s.av.nav1.active = 110.3;
    s.updateAvionics(0);
    expect(s.av.cdi).toBe("NAV1");
    expect(
      s.rec.events.some((e) => e.text.startsWith("CDI auto-switch: LOC1")),
    ).toBe(true);
  });
  it("stays on GPS with NAV1 tuned elsewhere, too far, off course, or with ILS CDI set to Manual", () => {
    let s = onFinal(10);
    s.av.nav1.active = 114.2;
    s.updateAvionics(0);
    expect(s.av.cdi).toBe("GPS");
    s = onFinal(16);
    s.av.nav1.active = 110.3;
    s.updateAvionics(0);
    expect(s.av.cdi).toBe("GPS");
    s = onFinal(10, { offNm: 1.5 });
    s.av.nav1.active = 110.3;
    s.updateAvionics(0);
    expect(s.av.cdi).toBe("GPS");
    s = onFinal(10);
    s.av.nav1.active = 110.3;
    s.autoCdi = false;
    s.updateAvionics(0);
    expect(s.av.cdi).toBe("GPS");
  });
  it("switches once: the pilot can go back to GPS by hand", () => {
    const s = onFinal(10);
    s.av.nav1.active = 110.3;
    s.updateAvionics(0);
    s.setCdi("GPS");
    s.updateAvionics(0);
    expect(s.av.cdi).toBe("GPS");
  });
  it("VTF switches at once; activating the missed approach switches back to GPS", () => {
    const s = new Sim(sc("ils27-vtf"));
    s.setCdi("GPS");
    s.loadApproach("PARD-I27", null, "vtf");
    s.av.nav1.active = 110.3;
    s.updateAvionics(0);
    expect(s.av.cdi).toBe("NAV1");
    s.fp.activateMissed();
    s.updateAvionics(0);
    expect(s.av.cdi).toBe("GPS");
  });
  it("coupled with APR armed: the autopilot goes on to capture the localizer", () => {
    const s = onFinal(9);
    s.av.nav1.active = 110.3;
    s.av.cdi = "GPS";
    s.ap.altSel = 3000;
    s.ap.toggleAp(s.ac.data);
    s.ap.pressNav(s.ac.data, s.navInputs());
    s.ap.pressAlt(s.ac.data);
    s.ap.pressApr(s.ac.data, s.navInputs());
    run(s, 20, () => s.ap.lat === "LOC");
    expect(s.av.cdi).toBe("NAV1");
    expect(s.ap.lat).toBe("LOC");
  });
});

describe("MFD FMS controls (FMS knob, MENU, CLR, ENT)", () => {
  const sim = () => {
    const s = new Sim(sc("ils27-full"));
    s.updateAvionics(0);
    return s;
  };
  it("turning the FMS knob only moves the cursor; MENU → Activate Leg → ENT activates the leg", () => {
    const s = sim();
    const st = newMfdState();
    const was = s.fp.active;
    fmsKey(s, st, "push");
    fmsKey(s, st, "outer+");
    fmsKey(s, st, "outer+");
    fmsKey(s, st, "outer+");
    expect(s.fp.active).toBe(was);
    const v = fmsView(s, st);
    expect(v.cursor).toBeGreaterThan(was);
    const target = v.cursor!;
    fmsKey(s, st, "menu");
    expect(fmsView(s, st).menu?.items[0]).toMatch(/Activate Leg/);
    fmsKey(s, st, "ent");
    expect(fmsView(s, st).confirm?.text).toMatch(/Activate/);
    expect(s.fp.active).toBe(was);
    fmsKey(s, st, "ent");
    expect(s.fp.active).toBe(target);
  });
  it("CLR on an en-route waypoint asks 'Remove XXXX?': CLR keeps it, ENT removes it", () => {
    const s = sim();
    const st = newMfdState();
    s.fp.setEnroute([
      { ident: "AAA", ...destination(ard, 0, 20) },
      { ident: "BBB", ...destination(ard, 0, 10) },
      { ...ard, ident: "CCC" },
    ]);
    fmsKey(s, st, "push");
    fmsKey(s, st, "outer+"); // cursor on CCC (starts on the active waypoint BBB)
    fmsKey(s, st, "clr");
    expect(fmsView(s, st).confirm?.text).toBe("Remove CCC?");
    fmsKey(s, st, "clr");
    expect(ids(s.fp)).toContain("CCC");
    fmsKey(s, st, "clr");
    fmsKey(s, st, "ent");
    expect(ids(s.fp)).not.toContain("CCC");
  });
  it("Direct-To window lists the plan and nearest fixes and activates on ENT", () => {
    const s = sim();
    const st = newMfdState();
    fmsKey(s, st, "direct");
    const v = fmsView(s, st);
    expect(v.page).toBe("direct");
    expect(v.direct!.fpl).toContain("KEDDY");
    expect(v.direct!.nearest.length).toBeGreaterThan(2);
    fmsKey(s, st, "ent"); // ident field → Activate?
    fmsKey(s, st, "ent");
    expect(s.fp.out.fromIdent).toBe("DCT");
    expect(fmsView(s, st).page).toBe("fpl");
  });
  it("PROC page offers Activate Vector-to-Final and Activate Missed for the loaded approach, without reloading", () => {
    const s = sim();
    const st = newMfdState();
    fmsKey(s, st, "proc");
    const v = fmsView(s, st);
    expect(v.page).toBe("proc");
    const items = v.proc!.items.map((i) => i.label);
    expect(items).toContain("Activate Vector-to-Final");
    expect(items).toContain("Activate Missed Approach");
    const missed = v.proc!.items.find(
      (i) => i.label === "Activate Missed Approach",
    )!;
    const vtfIdx = v.proc!.items.findIndex(
      (i) => i.label === "Activate Vector-to-Final",
    );
    expect(missed.enabled).toBe(true);
    // the cursor opens on the harmless Select Approach while the approach is active
    expect(v.proc!.items[v.proc!.sel].label).toBe("Select Approach");
    for (let k = v.proc!.sel; k > vtfIdx; k--) fmsKey(s, st, "outer-");
    fmsKey(s, st, "ent");
    expect(s.fp.vtf).toBe(true);
    expect(s.fp.approachId).toBe("PARD-I27");
    expect(s.fp.wpts[s.fp.active].ident).toBe("MARLO");
  });
  it("the PFD OBS key toggles OBS and reads SUSP past the MAP", () => {
    const s = new Sim(sc("ils27-vtf"));
    s.setCdi("GPS");
    expect(s.obsKeyLabel()).toBe("OBS");
    const rw = findFix("RW27")!;
    s.fp.activateLeg(s.fp.wpts.findIndex((w) => w.ident === "RW27"));
    const p = destination(rw, 270, 0.3);
    Object.assign(s.ac.s, {
      lat: p.lat,
      lon: p.lon,
      altFt: 600,
      psi: (270 * Math.PI) / 180,
    });
    s.updateAvionics(0);
    expect(s.obsKeyLabel()).toBe("SUSP");
    expect(s.obsKey()).toBe("resume");
    expect(s.fp.missedActive).toBe(true);
    expect(bearingDeg(s.ac.s, s.fp.wpts[s.fp.active])).toBeGreaterThan(0);
  });
});

describe("review fixes: FPL cursor after a removal, LOC/VOR source label", () => {
  it("after 'Remove XXXX?' ENT the cursor moves to the waypoint that took its place (else the blank row)", () => {
    const s = new Sim(sc("ils27-full"));
    s.updateAvionics(0);
    const st = newMfdState();
    s.fp.setEnroute([
      { ident: "AAA", ...destination(ard, 0, 30) },
      { ident: "BBB", ...destination(ard, 0, 20) },
      { ident: "CCC", ...destination(ard, 0, 10) },
    ]);
    s.updateAvionics(0);
    fmsKey(s, st, "push");
    for (let k = 0; k < 4; k++) fmsKey(s, st, "outer-"); // up to the first waypoint
    expect(s.fp.wpts[fmsView(s, st).cursor!].ident).toBe("AAA");
    fmsKey(s, st, "clr");
    fmsKey(s, st, "ent");
    expect(ids(s.fp)).toEqual(["BBB", "CCC"]);
    expect(s.fp.wpts[fmsView(s, st).cursor!].ident).toBe("BBB");
    fmsKey(s, st, "outer+");
    fmsKey(s, st, "clr");
    fmsKey(s, st, "ent");
    expect(ids(s.fp)).toEqual(["BBB"]);
    expect(fmsView(s, st).cursorOn).toBe("blank");
  });
  it("a localizer frequency reads LOC even without a signal (HSI source label)", async () => {
    const { isLocFreq } = await import("../src/avionics/pfd");
    expect(isLocFreq(110.3)).toBe(true);
    expect(isLocFreq(108.15)).toBe(true);
    expect(isLocFreq(111.95)).toBe(true);
    expect(isLocFreq(110.2)).toBe(false);
    expect(isLocFreq(114.2)).toBe(false);
    expect(isLocFreq(112.1)).toBe(false);
  });
});
