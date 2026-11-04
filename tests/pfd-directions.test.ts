// Direction (sign) of every G1000 PFD indication, driven through the headless sim.
// References: Garmin G1000 Pilot's Guide for the Cessna Nav III (190-00498), §2 Flight Instruments:
// - Attitude indicator: the roll scale is fixed at the top; the roll pointer is a sky pointer, it turns with the
//   horizon, so in a right bank it lies LEFT of the zero index (the horizon rotates the other way from the aircraft).
// - Slip/Skid indicator: the bar under the roll pointer moves laterally like the inclinometer ball; one bar
//   displacement equals one ball displacement.
// - Turn rate indicator: the trend vector along the compass arc points to the heading in 6 s (right in a right turn,
//   standard rate at the 18° tick).
// - Airspeed / altitude trend vectors: the value in 6 s (up when accelerating / climbing); VSI pointer up in a climb.
// - HSI: the CDI needle is displaced towards the course (course to the right = needle right); TO / FROM arrow; bearing
//   pointers point at the station; wind option 2 arrow points where the wind blows, relative to the heading.
import { describe, it, expect } from "vitest";
import { Sim, SCENARIOS } from "../src/sim/sim";
import {
  newPfdState,
  updatePfdFilters,
  pfdIndications,
  SLIP_BAR_W,
  slipBarPx,
} from "../src/avionics/pfd";
import { findFix, NAVAIDS } from "../src/nav/data";
import { destination, DEG } from "../src/nav/geo";

const DT = 1 / 30;
function cruise(hdg = 360) {
  const s = new Sim(SCENARIOS.find((x) => x.id === "free")!);
  Object.assign(s.weather, { turbulence: 0, gustKt: 0, windKt: 0 });
  s.weather.aloft = undefined;
  s.ac.s.altFt = 3000;
  s.ac.s.psi = hdg * DEG;
  s.controls.trim = -0.25;
  return s;
}
function fly(s: Sim, sec: number, st = newPfdState(), each?: () => void) {
  for (let t = 0; t < sec; t += DT) {
    each?.();
    s.step(DT);
    updatePfdFilters(st, s);
  }
  return st;
}

describe("attitude: roll pointer and slip/skid bar", () => {
  it("sky pointer: right bank → pointer LEFT of the zero index, left bank → right", () => {
    const s = cruise();
    s.ac.s.phi = 20 * DEG;
    fly(s, 0.2);
    expect(s.ac.data.rollDeg).toBeGreaterThan(10);
    expect(pfdIndications(s, newPfdState()).rollPointerDeg).toBeLessThan(-10);
    s.ac.s.phi = -20 * DEG;
    fly(s, 0.2);
    expect(pfdIndications(s, newPfdState()).rollPointerDeg).toBeGreaterThan(10);
  });
  it("skid with right rudder, wings level: the ball and the bar go LEFT; left rudder: right", () => {
    const s = cruise();
    fly(s, 4, newPfdState(), () => {
      s.controls.rudder = 1;
      s.controls.aileron = 0;
      s.ac.s.phi = 0;
    });
    expect(s.ac.data.slip).toBeLessThan(-0.2); // ball offset: + = right (steam inclinometer, airliner brick, G1000 bar)
    expect(pfdIndications(s, newPfdState()).slipBarPx).toBeLessThan(0);
    fly(s, 4, newPfdState(), () => {
      s.controls.rudder = -1;
      s.ac.s.phi = 0;
    });
    expect(pfdIndications(s, newPfdState()).slipBarPx).toBeGreaterThan(0);
  });
  it("one bar width per ball width", () => {
    // slip 0.5 = one ball width on the steam inclinometer (a full ±1 reading spans two ball widths)
    expect(slipBarPx(0.5)).toBeCloseTo(SLIP_BAR_W, 6);
    expect(slipBarPx(-0.5)).toBeCloseTo(-SLIP_BAR_W, 6);
  });
});

describe("HSI turn rate, trends and VSI", () => {
  it("right turn → trend vector right (standard rate reaches the 18° tick); left turn → left", () => {
    const s = cruise();
    fly(s, 6, newPfdState(), () => (s.ac.s.phi = 18 * DEG));
    const r = pfdIndications(s, newPfdState()).turnVectorDeg;
    expect(r).toBeGreaterThan(9);
    expect(r).toBeLessThanOrEqual(24);
    fly(s, 8, newPfdState(), () => (s.ac.s.phi = -18 * DEG));
    expect(pfdIndications(s, newPfdState()).turnVectorDeg).toBeLessThan(-9);
  });
  it("climb → VSI pointer and altitude trend UP; descent → down", () => {
    const s = cruise();
    let st = fly(s, 8, newPfdState(), () => (s.ac.s.gamma = 4 * DEG));
    expect(s.ac.data.vsFpm).toBeGreaterThan(300);
    let ind = pfdIndications(s, st);
    expect(ind.vsiPx).toBeLessThan(0);
    expect(ind.altTrendPx).toBeLessThan(0);
    st = fly(s, 8, st, () => (s.ac.s.gamma = -4 * DEG));
    ind = pfdIndications(s, st);
    expect(ind.vsiPx).toBeGreaterThan(0);
    expect(ind.altTrendPx).toBeGreaterThan(0);
  });
  it("accelerating → airspeed trend UP; decelerating → down", () => {
    const s = cruise();
    s.ac.s.tas = 75 * 0.514444;
    let st = fly(s, 6, newPfdState(), () => {
      s.controls.throttle = 1;
      s.ac.s.gamma = 0;
    });
    expect(pfdIndications(s, st).iasTrendPx).toBeLessThan(0);
    st = fly(s, 6, st, () => {
      s.controls.throttle = 0;
      s.ac.s.gamma = 0;
    });
    expect(pfdIndications(s, st).iasTrendPx).toBeGreaterThan(0);
  });
});

describe("HSI navigation: CDI, TO/FROM, bearing pointers", () => {
  const ard = findFix("ARD")!;
  const ardFreq = NAVAIDS.find((n) => n.ident === "ARD")!.freq;
  function onVor(pos: { lat: number; lon: number }, obs: number, hdg = obs) {
    const s = cruise(hdg);
    Object.assign(s.ac.s, { lat: pos.lat, lon: pos.lon });
    s.av.nav1.active = ardFreq;
    s.setCdi("NAV1"); // (slews the OBS when a localizer was tuned: set the OBS after it)
    s.av.obs1 = obs;
    s.ac.step(0.01, s.controls, s.weather);
    s.updateAvionics(0);
    return s;
  }
  it("course to the right of the aircraft → needle right; to the left → needle left", () => {
    // OBS 360 to ARD: the course line runs north through the station
    let s = onVor(destination(destination(ard, 180, 10), 270, 0.5), 360); // west of it: course on the right
    let ind = pfdIndications(s, newPfdState());
    expect(ind.cdiPx).toBeGreaterThan(5);
    expect(ind.toFrom).toBe("TO");
    s = onVor(destination(destination(ard, 180, 10), 90, 0.5), 360);
    ind = pfdIndications(s, newPfdState());
    expect(ind.cdiPx).toBeLessThan(-5);
  });
  it("past the station on the same course → FROM", () => {
    const s = onVor(destination(ard, 0, 10), 360);
    expect(pfdIndications(s, newPfdState()).toFrom).toBe("FROM");
  });
  it("GPS CDI: same convention (course right → needle right)", () => {
    const s = cruise(90);
    const a = destination(ard, 270, 10);
    s.fp.setEnroute([
      { ident: "AAA", ...a },
      { ...ard, ident: "ARD" },
    ]);
    Object.assign(s.ac.s, destination(destination(a, 90, 4), 0, 0.4)); // north of an eastbound leg = left of it
    s.setCdi("GPS");
    s.ac.step(0.01, s.controls, s.weather);
    s.updateAvionics(0);
    const ind = pfdIndications(s, newPfdState());
    expect(ind.cdiPx).toBeGreaterThan(5);
    expect(ind.toFrom).toBe("TO");
  });
  it("bearing pointer points at the station (station on the right → pointer right)", () => {
    const s = onVor(destination(ard, 270, 8), 360, 360); // ARD due east, heading north
    s.av.bearing1 = "NAV1";
    const ind = pfdIndications(s, newPfdState());
    expect(ind.brg1Deg).not.toBeNull();
    expect(ind.brg1Deg!).toBeGreaterThan(80);
    expect(ind.brg1Deg!).toBeLessThan(100);
  });
});

describe("wind window", () => {
  const relWind = (s: Sim) => {
    const d = s.ac.data;
    return ((d.windDir - d.hdgTrue + 540) % 360) - 180; // where the wind comes from, relative to the nose
  };
  it("wind from the left: arrow points right (where it blows), crosswind arrow right", () => {
    const s = cruise(360);
    Object.assign(s.weather, { windKt: 20, windDir: 270 });
    fly(s, 0.5);
    expect(relWind(s)).toBeLessThan(-45);
    const ind = pfdIndications(s, newPfdState());
    expect(ind.windArrowDeg!).toBeGreaterThan(45);
    expect(ind.windArrowDeg!).toBeLessThan(135);
    expect(Math.abs(ind.windArrowDeg! - (relWind(s) + 180))).toBeLessThan(1);
    expect(ind.crosswindArrow).toBe("right");
  });
  it("wind from the right: arrow points left, crosswind arrow left", () => {
    const s = cruise(360);
    Object.assign(s.weather, { windKt: 20, windDir: 60 });
    fly(s, 0.5);
    expect(relWind(s)).toBeGreaterThan(30);
    const ind = pfdIndications(s, newPfdState());
    expect(ind.windArrowDeg!).toBeLessThan(-30);
    expect(ind.crosswindArrow).toBe("left");
  });
  it("headwind: arrow points down (towards the tail), head component arrow down; tailwind up", () => {
    const s = cruise(360);
    Object.assign(s.weather, { windKt: 20, windDir: 340 });
    fly(s, 0.5);
    expect(Math.abs(relWind(s))).toBeLessThan(40);
    let ind = pfdIndications(s, newPfdState());
    expect(Math.abs(ind.windArrowDeg!)).toBeGreaterThan(140);
    expect(ind.headwindArrow).toBe("down");
    Object.assign(s.weather, { windDir: 160 });
    fly(s, 0.5);
    ind = pfdIndications(s, newPfdState());
    expect(Math.abs(ind.windArrowDeg!)).toBeLessThan(40);
    expect(ind.headwindArrow).toBe("up");
  });
});
