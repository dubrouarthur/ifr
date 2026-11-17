// Teaching tools — the pure maths of every tool, against the sourced reference figures quoted in each module.
import { describe, expect, it } from "vitest";
import {
  ASPECT_RATIO,
  LIFT_SLOPE,
  alphaForLevel,
  bestGlide,
  cl,
  clMax,
  stallAlpha,
  wingState,
} from "../src/course/tools/maths/aero";
import {
  cornerKcas,
  loadFactor,
  stallInTurn,
  turnRadiusFt,
  turnRateDeg,
  turnState,
  vaAt,
  VN,
} from "../src/course/tools/maths/turn";
import { massBalance } from "../src/course/tools/maths/massBalance";
import {
  densityAltitude,
  fuelPlan,
  pressureAltitude,
  runwayPerf,
  USABLE_L,
} from "../src/course/tools/maths/perf";
import {
  cabin,
  isaPressureHpa,
  isaTempC,
  machState,
  speedOfSoundKt,
  tucAt,
} from "../src/course/tools/maths/atmos";
import {
  carbIceRisk,
  dewPointAt,
  frontHeightFt,
  frontSky,
  relativeHumidity,
} from "../src/course/tools/maths/met";
import { radioState } from "../src/course/tools/maths/radio";
import { propState } from "../src/course/tools/maths/prop";

describe("wing and angle of attack", () => {
  it("is calibrated on the POH stall speeds and best glide", () => {
    expect(ASPECT_RATIO).toBeCloseTo(7.48, 1);
    expect(LIFT_SLOPE).toBeGreaterThan(0.075);
    expect(LIFT_SLOPE).toBeLessThan(0.09);
    // POH Fig. 5-3: 53 KCAS clean at 2,550 lb → CL max ≈ 1.54; flaps 30: 48 KCAS → ≈ 1.88
    expect(clMax(0)).toBeCloseTo(1.54, 2);
    expect(clMax(30)).toBeCloseTo(1.88, 2);
    expect(wingState(5, 100, 0).vs).toBeCloseTo(53, 5);
    expect(wingState(5, 100, 30).vs).toBeCloseTo(48, 5);
    // best glide about 9:1 near 68 KIAS (POH §3)
    const g = bestGlide();
    expect(g.ld).toBeCloseTo(9, 1);
    expect(Math.abs(g.kt - 68)).toBeLessThan(3);
  });
  it("lift grows with the angle of attack up to CL max, then breaks", () => {
    const as = stallAlpha(0);
    expect(as).toBeGreaterThan(15);
    expect(as).toBeLessThan(20);
    expect(cl(-2, 0)).toBeCloseTo(0, 6);
    expect(cl(as, 0)).toBeCloseTo(clMax(0), 6);
    expect(cl(as + 4, 0)).toBeLessThan(clMax(0) * 0.85);
    expect(cl(as - 0.5, 0)).toBeLessThan(clMax(0));
    // flaps: more CL max, the stall comes at a smaller angle of attack
    expect(stallAlpha(30)).toBeLessThan(stallAlpha(0));
    expect(wingState(as + 1, 80, 0).stalled).toBe(true);
    expect(wingState(as - 1, 80, 0).stalled).toBe(false);
  });
  it("holds 1 g at a small angle in cruise, a large one slow", () => {
    const cruise = alphaForLevel(110, 0)!;
    expect(cruise).toBeGreaterThan(1);
    expect(cruise).toBeLessThan(4);
    expect(wingState(cruise, 110, 0).liftRatio).toBeCloseTo(1, 2);
    expect(alphaForLevel(50, 0)).toBeNull();
  });
});

describe("load factor and V-n", () => {
  it("n = 1 / cos φ", () => {
    expect(loadFactor(0)).toBe(1);
    expect(loadFactor(60)).toBeCloseTo(2, 6);
    expect(loadFactor(45)).toBeCloseTo(1.414, 3);
  });
  it("matches the POH stall speed table in a turn (2,550 lb)", () => {
    // POH C172S Fig. 5-3, flaps up, most rearward CG: KCAS 53 / 57 / 63 / 75, KIAS 48 / 51 / 57 / 68
    const kcas = [0, 30, 45, 60].map((b) => Math.round(stallInTurn(b, 2550)));
    expect(kcas).toEqual([53, 57, 63, 75]);
    const kias = [0, 30, 45, 60].map((b) => stallInTurn(b, 2550, VN.vsKias));
    // the POH rounds each figure; √n on 48 KIAS stays within 1 kt of 48 / 51 / 57 / 68
    [48, 51, 57, 68].forEach((poh, k) => expect(Math.abs(kias[k] - poh)).toBeLessThan(1));
  });
  it("VA falls with the square root of the weight (POH: 105 / 98 / 90 KIAS)", () => {
    expect(Math.round(vaAt(2550))).toBe(105);
    expect(Math.abs(vaAt(2200) - 98)).toBeLessThan(1);
    expect(Math.abs(vaAt(1900) - 90)).toBeLessThan(1);
    // the V-n corner (stall line meets +3.8 g) sits at VA within the airspeed calibration
    expect(Math.abs(cornerKcas(2550) - 105)).toBeLessThan(3);
  });
  it("turn radius and rate", () => {
    // standard rate at 100 kt TAS needs about 15° of bank (rule of thumb: TAS / 10 + 7)
    expect(turnRateDeg(100, 15.5)).toBeCloseTo(3, 0);
    expect(turnRadiusFt(100, 30)).toBeGreaterThan(1500);
    expect(turnRadiusFt(100, 30)).toBeLessThan(1600);
    expect(turnState(60, 70, 2550).verdict).toBe("stall");
    expect(turnState(60, 120, 2550).verdict).toBe("ok");
    expect(turnState(76, 160, 2550).verdict).toBe("overload");
  });
});

describe("mass and balance", () => {
  it("two front seats and full fuel: inside the normal envelope, not utility", () => {
    const s = massBalance({
      front: 340,
      rear: 0,
      bag: 0,
      fuelGal: 53,
      burnGal: 20,
    });
    expect(s.takeoff.weight).toBeCloseTo(1663 + 340 + 318, 6);
    expect(s.takeoff.normal).toBe(true);
    expect(s.takeoff.utility).toBe(false);
    expect(s.landing.weight).toBeCloseTo(s.takeoff.weight - 120, 6);
    // burning fuel (arm 48 in, aft of the CG) moves the CG forward
    expect(s.landing.cg).toBeLessThan(s.takeoff.cg);
  });
  it("four adults and full fuel is over the maximum mass", () => {
    const s = massBalance({
      front: 360,
      rear: 340,
      bag: 40,
      fuelGal: 53,
      burnGal: 0,
    });
    expect(s.takeoff.weight).toBeGreaterThan(2550);
    expect(s.takeoff.reason).toBe("overweight");
  });
  it("heavy baggage moves the CG aft", () => {
    const a = massBalance({
      front: 300,
      rear: 0,
      bag: 0,
      fuelGal: 30,
      burnGal: 0,
    });
    const b = massBalance({
      front: 300,
      rear: 0,
      bag: 120,
      fuelGal: 30,
      burnGal: 0,
    });
    expect(b.takeoff.cg).toBeGreaterThan(a.takeoff.cg);
  });
});

describe("performance: runway and density altitude", () => {
  it("pressure and density altitude", () => {
    expect(pressureAltitude(1000, 1013.25)).toBe(1000);
    expect(pressureAltitude(0, 1003.25)).toBeCloseTo(270, 6);
    // ISA at 5,000 ft is 5 °C: 25 °C is ISA + 20 → DA ≈ PA + 2,400
    expect(densityAltitude(5000, 25)).toBeCloseTo(7400, 6);
  });
  it("Safety Sense 7 factors: +10 % per 1,000 ft, +10 % per 10 °C, grass, uphill, safety ×1.33", () => {
    const base = {
      mode: "takeoff" as const,
      qnh: 1013.25,
      windKt: 0,
      slopePct: 0,
      surface: "paved" as const,
      baseM: 500,
      runwayM: 1000,
    };
    const a = runwayPerf({ ...base, elevFt: 1000, oatC: 13 });
    expect(a.altFactor).toBeCloseTo(1.1, 6);
    expect(a.tempFactor).toBeCloseTo(1, 6);
    const b = runwayPerf({ ...base, elevFt: 0, oatC: 25 });
    expect(b.tempFactor).toBeCloseTo(1.1, 6);
    const c = runwayPerf({
      ...base,
      elevFt: 0,
      oatC: 15,
      surface: "dryGrass",
      slopePct: 2,
    });
    expect(c.total).toBeCloseTo(1.2 * 1.1, 6);
    expect(c.withSafetyM).toBeCloseTo(500 * 1.32 * 1.33, 6);
    // landing: downhill is the adverse slope, wet grass ×1.35, safety ×1.43
    const d = runwayPerf({
      ...base,
      mode: "landing",
      elevFt: 0,
      oatC: 15,
      surface: "wetGrass",
      slopePct: -1,
    });
    expect(d.total).toBeCloseTo(1.35 * 1.05, 6);
    expect(d.withSafetyM).toBeCloseTo(500 * 1.35 * 1.05 * 1.43, 6);
    // headwind: −10 % per 9 kt
    const e = runwayPerf({ ...base, elevFt: 0, oatC: 15, windKt: 9 });
    expect(e.total).toBeCloseTo(0.9, 6);
    expect(
      runwayPerf({ ...base, elevFt: 6000, oatC: 35, runwayM: 700 }).verdict,
    ).toBe("short");
  });
});

describe("fuel", () => {
  it("endurance, reserve and the verdict", () => {
    expect(USABLE_L).toBeCloseTo(200.6, 1);
    const s = fuelPlan({
      fuelL: 150,
      flowLph: 35,
      tripMin: 120,
      taxiL: 5,
      night: false,
    });
    expect(s.enduranceMin).toBeCloseTo((145 / 35) * 60, 6);
    expect(s.reserveL).toBeCloseTo(17.5, 6);
    expect(s.requiredL).toBeCloseTo(5 + 70 + 17.5, 6);
    expect(s.verdict).toBe("ok");
    expect(
      fuelPlan({ fuelL: 80, flowLph: 35, tripMin: 120, taxiL: 5, night: false })
        .verdict,
    ).toBe("reserve");
    expect(
      fuelPlan({ fuelL: 60, flowLph: 35, tripMin: 120, taxiL: 5, night: false })
        .verdict,
    ).toBe("short");
    expect(
      fuelPlan({ fuelL: 150, flowLph: 35, tripMin: 60, taxiL: 5, night: true })
        .reserveMin,
    ).toBe(45);
  });
});

describe("atmosphere, Mach, pressurisation", () => {
  it("ICAO standard atmosphere", () => {
    expect(isaTempC(0)).toBe(15);
    expect(isaTempC(40000)).toBe(-56.5);
    expect(isaPressureHpa(0)).toBeCloseTo(1013.25, 2);
    expect(isaPressureHpa(18000)).toBeCloseTo(506, 0);
    expect(isaPressureHpa(36089)).toBeCloseTo(226.3, 0);
    expect(speedOfSoundKt(15)).toBeCloseTo(661.5, 0);
    expect(speedOfSoundKt(-56.5)).toBeCloseTo(573.6, 0);
  });
  it("Mach and the swept wing", () => {
    const m = machState(37000, 470, 25);
    expect(m.mach).toBeCloseTo(470 / 573.6, 2);
    expect(m.machNormal).toBeCloseTo(
      m.mach * Math.cos((25 * Math.PI) / 180),
      6,
    );
    expect(m.mcrit).toBeGreaterThan(0.7);
    expect(machState(37000, 470, 0).verdict).toBe("transonic");
    expect(machState(37000, 470, 35).verdict).toBe("subsonic");
  });
  it("cabin altitude and differential", () => {
    const c = cabin(41000, 8000, 8.6);
    expect(c.limited).toBe(false);
    expect(c.cabinFt).toBe(8000);
    expect(c.diffPsi).toBeCloseTo(8.3, 1);
    const d = cabin(41000, 8000, 7.5);
    expect(d.limited).toBe(true);
    expect(d.cabinFt).toBeGreaterThan(8000);
    expect(d.diffPsi).toBeCloseTo(7.5, 6);
    expect(tucAt(35000)).toEqual([30, 60]);
    expect(tucAt(10000)).toBeNull();
  });
});

describe("meteorology", () => {
  it("relative humidity (Magnus)", () => {
    expect(relativeHumidity(20, 20)).toBeCloseTo(100, 6);
    expect(relativeHumidity(20, 10)).toBeCloseTo(52.6, 0);
    expect(dewPointAt(20, relativeHumidity(20, 5))).toBeCloseTo(5, 4);
  });
  it("carburettor icing (PHAK)", () => {
    expect(carbIceRisk(10, 8).risk).toBe("serious");
    expect(carbIceRisk(30, 20).risk).toBe("reducedPower");
    expect(carbIceRisk(30, 5).risk).toBe("low");
    expect(carbIceRisk(-15, -16).risk).toBe("low");
  });
  it("the warm front's sequence, the cold front's passage", () => {
    const seq = [800, 450, 200, 50, -50].map(
      (x) => frontSky("warm", x).clouds[0],
    );
    expect(seq).toEqual(["Ci", "Cs", "As", "Ns", "St"]);
    expect(frontSky("cold", 20).clouds).toEqual(["Cb"]);
    expect(frontSky("cold", -200).pressure).toBe("rising");
    expect(frontSky("cold", -200).veer).toBe(true);
    // 1:150: 300 km ahead the frontal surface is 2 km up
    expect(frontHeightFt("warm", 300)).toBeCloseTo(2000 / 0.3048, 0);
  });
});

describe("VOR and ADF", () => {
  it("TO / FROM and the needle", () => {
    expect(radioState(80, 90, 90)).toMatchObject({
      flag: "FROM",
      deviation: 10,
    });
    expect(radioState(80, 270, 270)).toMatchObject({
      flag: "TO",
      deviation: -10,
    });
    expect(radioState(190, 360, 0)).toMatchObject({
      flag: "TO",
      deviation: 10,
    });
    expect(radioState(180, 360, 0).centred).toBe(true);
    expect(radioState(180, 360, 0).qdm).toBe(0);
    // the VOR does not depend on the heading
    expect(radioState(45, 50, 0).deviation).toBe(
      radioState(45, 50, 200).deviation,
    );
    expect(radioState(45, 100, 0).dots).toBe(5);
  });
  it("ADF relative bearing", () => {
    expect(radioState(180, 0, 0).rb).toBe(0);
    expect(radioState(270, 0, 0).rb).toBe(90);
    expect(radioState(270, 0, 90).rb).toBe(0);
  });
});

describe("propeller", () => {
  it("fixed pitch: near the stall at take-off, about 4° in cruise", () => {
    expect(propState(0, 2300, false).state).toBe("stalled");
    expect(propState(110, 2400, false).alpha).toBeCloseTo(4, 0);
    expect(propState(160, 2400, false).alpha).toBeLessThan(
      propState(110, 2400, false).alpha,
    );
  });
  it("constant speed: the blade angle follows the helix angle", () => {
    const a = propState(60, 2700, true);
    const b = propState(150, 2400, true);
    expect(a.alpha).toBeCloseTo(4, 6);
    expect(b.beta).toBeGreaterThan(a.beta);
    expect(propState(0, 2700, true).tipMach).toBeLessThan(0.9);
  });
});
