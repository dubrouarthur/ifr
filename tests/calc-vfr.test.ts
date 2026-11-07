// VFR calculation generators, the registry and the drill: hand-checked numbers, independent re-computation from the
// givens of many seeds, wrong-answer diagnosis, and property tests (TVMDC round trip, vector maths).
import { describe, expect, it } from "vitest";
import {
  GENERATORS,
  GENERATORS_BY_CATEGORY,
  GENERATOR_IDS,
  answerIn,
  checkAnswer,
  generate,
  getGenerator,
  planDrill,
  problemFor,
  resolveParams,
  scoreDrill,
} from "../src/course/calc";
import { CONVERSION_PAIRS } from "../src/course/calc/vfr/conversion";
import { solveFactors, solveWb, wbFwdLimit, WB } from "../src/course/calc/vfr/performance";
import { solveTvmdc } from "../src/course/calc/vfr/navlog";
import { solveRunwayWind } from "../src/course/calc/ifr/perf";
import * as M from "../src/course/calc/maths";
import type { CalcGeneratorId, CalcProblem, CalcResponse, DrillSpec } from "../src/course/types";

const D = Math.PI / 180;
const SEEDS = Array.from({ length: 150 }, (_, i) => i + 1);

const g = (p: CalcProblem): Record<string, number | string> => Object.fromEntries(p.givens.map((x) => [x.key, x.value]));
const partsOf = (p: CalcProblem): Record<string, number | string> => Object.fromEntries((p.parts ?? []).map((x) => [x.key, x.answer]));
const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
const agrees = (p: CalcProblem, expected: number, extra = 0.001) => Math.abs(p.unit === "deg" ? wrap(p.answer - expected) : p.answer - expected) <= p.tolerance + extra;
function each(id: CalcGeneratorId, variant: string | undefined, fn: (p: CalcProblem, v: Record<string, number | string>) => void, params: Record<string, string> = {}) {
  for (const s of SEEDS) {
    const p = generate(id, s, { ...(variant ? { variant } : {}), ...params });
    fn(p, g(p));
  }
}
const ok = (p: CalcProblem, r: CalcResponse) => checkAnswer(p, r);
/** a hand-made problem: a generated one with the givens and answers replaced by hand-computed ones */
function handMade(id: CalcGeneratorId, base: Record<string, string>, givens: Record<string, number | string>, answer: number, parts?: Record<string, number | string>): CalcProblem {
  const p = generate(id, 1, base);
  return {
    ...p,
    givens: Object.entries(givens).map(([key, value]) => ({ key, label: { en: key, fr: key }, value })),
    answer,
    parts: p.parts?.map((x) => ({ ...x, answer: parts?.[x.key] ?? x.answer })),
  };
}

describe("hand-checked maths (VFR)", () => {
  it("TVMDC: East is least, West is best; deviation from the card", () => {
    const calm = (tc: number, variation: number, deviation: number) => solveTvmdc(tc, 100, 0, 0, variation, deviation);
    expect(calm(90, 10, 0).mh).toBe(80); // 10° E: subtract
    expect(calm(90, -10, 0).mh).toBe(100); // 10° W: add
    expect(calm(90, -5, -2)).toMatchObject({ th: 90, mh: 95, ch: 93 });
    expect(calm(5, 10, 0).mh).toBe(355); // wraps through north
    // 100 kt, wind from 090 at 20 kt, TC 360: WCA = 20 × 60 / 100 = 12° right (exact 11.5°)
    const s = solveTvmdc(360, 100, 90, 20, 10, 1);
    expect(s.wca).toBe(12);
    expect(s).toMatchObject({ th: 12, mh: 2, ch: 3 });
    expect(s.wcaExact).toBeCloseTo(11.54, 2);
    expect(solveTvmdc(270, 120, 300, 17, -10, -1)).toMatchObject({ wca: 4, th: 274, mh: 284, ch: 283 });
  });
  it("ground speed and ETE", () => {
    expect(M.windTriangle(360, 120, 360, 20).gs).toBeCloseTo(100, 6); // headwind
    expect((60 / 100) * 60).toBe(36); // 60 NM at 100 kt: 36 min
    expect(M.windTriangle(360, 100, 90, 20).gs).toBeCloseTo(97.98, 2);
    expect((49 / M.windTriangle(360, 100, 90, 20).gs) * 60).toBeCloseTo(30.0, 1);
    expect(M.windTriangle(90, 100, 270, 20).gs).toBeCloseTo(120, 6); // tailwind
  });
  it("weight and balance: moments, CG and the envelope", () => {
    const a = solveWb({ front: 340, rear: 0, bag1: 0, bag2: 0, fuelGal: 40 });
    expect(a.weight).toBe(2243); // 1663 + 340 + 240
    expect(a.moment).toBe(65522 + 12580 + 11520); // 89,622 lb·in
    expect(a.cg).toBeCloseTo(39.956, 3); // 89,622 ÷ 2,243
    expect(a.fwdLimit).toBeCloseTo(37.93, 2);
    expect(a.within).toBe(true);
    const b = solveWb({ front: 380, rear: 340, bag1: 120, bag2: 0, fuelGal: 53 });
    expect(b.weight).toBe(2821);
    expect(b.overweight).toBe(true);
    expect(b.within).toBe(false);
    const c = solveWb({ front: 170, rear: 340, bag1: 120, bag2: 50, fuelGal: 20 });
    expect(c.weight).toBe(2463);
    expect(c.moment).toBe(119942);
    expect(c.cg).toBeCloseTo(48.70, 2); // beyond 47.3 in aft
    expect(c.within).toBe(false);
    expect(wbFwdLimit(1800)).toBe(35);
    expect(wbFwdLimit(2550)).toBeCloseTo(41, 6);
    expect(wbFwdLimit(2250)).toBeCloseTo(38, 6);
  });
  it("takeoff and landing factors multiply", () => {
    const base = { mode: "takeoff" as const, baseFt: 1000, headKt: 0, surface: "paved" as const, slopePct: 0 };
    expect(solveFactors({ ...base, headKt: 9 }).distance).toBeCloseTo(900, 6); // −10 % per 9 kt
    expect(solveFactors({ ...base, headKt: -4 }).distance).toBeCloseTo(1200, 6); // +10 % per 2 kt
    expect(solveFactors({ ...base, surface: "dryGrass" }).distance).toBeCloseTo(1200, 6);
    expect(solveFactors({ ...base, mode: "landing", baseFt: 600, surface: "wetGrass" }).distance).toBeCloseTo(810, 6);
    expect(solveFactors({ ...base, slopePct: 2 }).distance).toBeCloseTo(1100, 6);
    const all = solveFactors({ ...base, headKt: 9, surface: "dryGrass", slopePct: 2 });
    expect(all.distance).toBeCloseTo(1188, 6); // 1000 × 0.9 × 1.2 × 1.1
    expect(all.additive).toBeCloseTo(1200, 6); // adding the percentages instead would give 1,200
  });
  it("unit conversions", () => {
    const conv = (id: string, v: number) => CONVERSION_PAIRS.find((p) => p.id === id)!.exact(v);
    expect(conv("kt-kmh", 100)).toBeCloseTo(185.2, 6);
    expect(conv("kt-mph", 100)).toBeCloseTo(115.08, 2);
    expect(conv("ft-m", 3000)).toBeCloseTo(914.4, 6);
    expect(conv("m-ft", 1000)).toBeCloseTo(3280.84, 1);
    expect(conv("inhg-hpa", 29.92)).toBeCloseTo(1013.2, 0);
    expect(conv("hpa-inhg", 1013.25)).toBeCloseTo(29.92, 2);
    expect(conv("c-f", 20)).toBe(68);
    expect(conv("c-f", -40)).toBe(-40);
    expect(conv("f-c", 212)).toBeCloseTo(100, 6);
    expect(conv("gal-l", 10)).toBeCloseTo(37.854, 3);
    expect(conv("gal-lb", 10)).toBe(60);
    expect(conv("l-kg", 100)).toBeCloseTo(72, 6);
    expect(conv("lb-kg", 100)).toBeCloseTo(45.359, 3);
    expect(conv("kg-lb", 80)).toBeCloseTo(176.37, 2);
  });
  it("crosswind, pressure and density altitude", () => {
    const w = solveRunwayWind(360, 30, 20);
    expect(w.cross).toBeCloseTo(10, 6);
    expect(w.head).toBeCloseTo(17.32, 2);
    expect(solveRunwayWind(90, 140, 30).cross).toBeCloseTo(23.0, 1); // 50° off: 30 × sin 50°
    expect(solveRunwayWind(90, 140, 30).head).toBeCloseTo(19.28, 2);
    expect(M.densityAltitudeRule(M.pressureAltitudeRuleInHg(0, 29.92), 30)).toBeCloseTo(1800, 6); // ISA +15
    expect(M.pressureAltitudeRuleInHg(2000, 29.42)).toBeCloseTo(2500, 6);
    expect(M.densityAltitudeRule(5000, 5)).toBeCloseTo(5000 + 120 * (5 - 5), 6);
  });
});

describe("VFR generators recomputed independently from their givens", () => {
  it("vfr.tvmdc", () => {
    each("vfr.tvmdc", undefined, (p, v) => {
      const wca = Math.asin((+v.windKt * Math.sin((+v.windDir - +v.tc) * D)) / +v.tasKt) / D;
      const ch = +v.tc + wca - +v.variation + +v.deviation;
      expect(agrees(p, ch)).toBe(true);
      const parts = partsOf(p);
      expect(Math.abs(wrap(+parts.th - (+v.tc + wca)))).toBeLessThanOrEqual(1.01);
      expect(Math.abs(wrap(+parts.mh - (+v.tc + wca - +v.variation)))).toBeLessThanOrEqual(1.01);
    });
  });
  it("vfr.groundSpeedEte", () => {
    each("vfr.groundSpeedEte", undefined, (p, v) => {
      const wca = Math.asin((+v.windKt * Math.sin((+v.windDir - +v.tc) * D)) / +v.tasKt);
      const gs = +v.tasKt * Math.cos(wca) - +v.windKt * Math.cos((+v.windDir - +v.tc) * D);
      expect(Math.abs(+partsOf(p).gs - gs)).toBeLessThanOrEqual(2.01);
      expect(agrees(p, (+v.distNm / gs) * 60)).toBe(true);
    });
  });
  it("vfr.fuelEndurance", () => {
    each("vfr.fuelEndurance", "endurance", (p, v) => expect(agrees(p, (+v.usable / +v.flow) * 60)).toBe(true));
    each("vfr.fuelEndurance", "required", (p, v) => {
      const need = +v.taxi + (+v.flow * (+v.tripMin + (v.night === "yes" ? 45 : 30))) / 60;
      expect(agrees(p, need)).toBe(true);
      expect(p.answer).toBeGreaterThanOrEqual(need - 1e-9);
    });
    each("vfr.fuelEndurance", "required", (p, v) => {
      const need = +v.taxi + (+v.flow * (+v.tripMin + (v.night === "yes" ? 45 : 30))) / 60;
      expect(agrees(p, need)).toBe(true);
      expect(p.unit).toBe("L");
    }, { rules: "icao" });
  });
  it("vfr.pressureDensityAltitude", () => {
    each("vfr.pressureDensityAltitude", undefined, (p, v) => {
      const pa = +v.elevFt + (29.92 - +v.altInHg) * 1000;
      expect(agrees(p, pa + 120 * (+v.oatC - (15 - (2 * pa) / 1000)))).toBe(true);
      expect(Math.abs(+partsOf(p).pa - pa)).toBeLessThanOrEqual(1);
    });
  });
  it("vfr.crosswind", () => {
    each("vfr.crosswind", undefined, (p, v) => {
      const a = (+v.windDir - +v.rwyHdg) * D;
      const peak = Number(v.gustKt ?? v.windKt);
      const cross = Math.abs(peak * Math.sin(a));
      expect(agrees(p, cross)).toBe(true);
      expect(partsOf(p).within).toBe(cross <= 15 ? "yes" : "no");
      expect(Math.abs(+partsOf(p).head - +v.windKt * Math.cos(a))).toBeLessThanOrEqual(1);
    });
  });
  it("vfr.weightBalance", () => {
    each("vfr.weightBalance", "cg", (p, v) => {
      const r = solveWb({ front: +v.front, rear: +v.rear, bag1: +v.bag1, bag2: +v.bag2, fuelGal: +v.fuelGal });
      const weight = 1663 + +v.front + +v.rear + +v.bag1 + +v.bag2 + 6 * +v.fuelGal;
      const moment = 1663 * 39.4 + 37 * +v.front + 73 * +v.rear + 95 * +v.bag1 + 123 * +v.bag2 + 48 * 6 * +v.fuelGal;
      expect(partsOf(p).weight).toBe(Math.round(weight));
      expect(Math.abs(+partsOf(p).moment - moment)).toBeLessThanOrEqual(1);
      expect(agrees(p, moment / weight, 0.05)).toBe(true);
      expect(partsOf(p).within).toBe(r.within ? "yes" : "no");
      // never a borderline problem: a student rounding the moments cannot flip the verdict
      expect(Math.min(Math.abs(r.cg - r.fwdLimit), Math.abs(r.cg - WB.aft))).toBeGreaterThan(0.3);
      expect(Math.abs(r.weight - WB.maxTakeoffLb)).toBeGreaterThan(10);
    });
    each("vfr.weightBalance", "fuel", (p, v) => {
      const w0 = 1663 + +v.front + +v.rear + +v.bag1 + +v.bag2;
      expect(p.answer).toBe(Math.min(53, Math.floor((2550 - w0) / 6)));
      expect(partsOf(p).weight).toBe(w0);
      expect(p.answer * 6 + w0).toBeLessThanOrEqual(2550); // never above the maximum weight
    });
  });
  it("vfr.takeoffLandingFactors", () => {
    each("vfr.takeoffLandingFactors", undefined, (p, v) => {
      const head = +v.headKt;
      const wind = head >= 0 ? 1 - (0.1 * head) / 9 : 1 + (0.1 * -head) / 2;
      const surface = ({ paved: 1, dryGrass: v.mode === "takeoff" ? 1.2 : 1.15, wetGrass: v.mode === "takeoff" ? 1.3 : 1.35 } as Record<string, number>)[String(v.surface)];
      const d = +v.baseFt * wind * surface * (1 + 0.05 * +v.slopePct);
      expect(agrees(p, d)).toBe(true);
      // CAA SafetySense 7: the factored distance × 1.33 (takeoff) / × 1.43 (landing) must fit
      const req = d * (v.mode === "takeoff" ? 1.33 : 1.43);
      expect(partsOf(p).fits).toBe(req <= +v.availableFt ? "yes" : "no");
      expect(Math.abs(req / +v.availableFt - 1)).toBeGreaterThan(0.03); // never a coin toss
    });
  });
  it("vfr.unitConversion", () => {
    const factors: Record<string, (x: number) => number> = {
      "kt-kmh": (x) => x * 1.852,
      "kmh-kt": (x) => x / 1.852,
      "kt-mph": (x) => (x * 1852) / 1609.344,
      "mph-kt": (x) => (x * 1609.344) / 1852,
      "ft-m": (x) => x * 0.3048,
      "m-ft": (x) => x / 0.3048,
      "inhg-hpa": (x) => x * 33.8639,
      "hpa-inhg": (x) => x / 33.8639,
      "c-f": (x) => (x * 9) / 5 + 32,
      "f-c": (x) => ((x - 32) * 5) / 9,
      "gal-l": (x) => x * 3.785411784,
      "l-gal": (x) => x / 3.785411784,
      "gal-lb": (x) => x * 6,
      "l-kg": (x) => x * 0.72,
      "lb-kg": (x) => x * 0.45359237,
      "kg-lb": (x) => x / 0.45359237,
    };
    expect(Object.keys(factors).sort()).toEqual(CONVERSION_PAIRS.map((p) => p.id).sort());
    const seen = new Set<string>();
    each("vfr.unitConversion", undefined, (p, v) => {
      seen.add(String(v.pair));
      expect(agrees(p, factors[String(v.pair)](+v.value))).toBe(true);
      // the pilot's rule of thumb is accepted too
      const pair = CONVERSION_PAIRS.find((x) => x.id === v.pair)!;
      if (pair.group !== "temperature") expect(agrees(p, pair.rule(+v.value), 0.001), `${v.pair} ${v.value}`).toBe(true);
    });
    expect(seen.size).toBe(CONVERSION_PAIRS.length);
  });
});

describe("VFR wrong answers are diagnosed", () => {
  it("TVMDC: variation applied the wrong way is named", () => {
    let n = 0;
    for (const s of SEEDS) {
      const p = generate("vfr.tvmdc", s);
      const v = g(p);
      const wca = Math.round((+v.windKt * Math.sin((+v.windDir - +v.tc) * D) * 60) / +v.tasKt);
      const wrong = (((+v.tc + wca + +v.variation + +v.deviation) % 360) + 360) % 360;
      if (Math.abs(wrap(wrong - p.answer)) <= p.tolerance + 0.01) continue;
      const r = ok(p, { answer: wrong, parts: partsOf(p) });
      expect(r.ok).toBe(false);
      expect(r.mistake?.id).toBe("variationSign");
      expect(r.mistake?.text.en).toMatch(/East|east/);
      expect(r.mistake?.text.fr).toMatch(/Est/);
      n++;
    }
    expect(n).toBeGreaterThan(80);
  });
  it("TVMDC: correcting away from the wind is named", () => {
    let n = 0;
    for (const s of SEEDS) {
      const p = generate("vfr.tvmdc", s);
      const v = g(p);
      const wca = Math.round((+v.windKt * Math.sin((+v.windDir - +v.tc) * D) * 60) / +v.tasKt);
      const wrong = (((+v.tc - wca - +v.variation + +v.deviation) % 360) + 360) % 360;
      const variationSlip = (((+v.tc + wca + +v.variation + +v.deviation) % 360) + 360) % 360;
      if (Math.abs(wrap(wrong - p.answer)) <= p.tolerance + 0.01 || Math.abs(wca) < 3 || Math.abs(wrap(wrong - variationSlip)) <= p.tolerance + 0.01 || Math.abs(wrap(wrong - (((+v.tc + wca - +v.variation - +v.deviation) % 360 + 360) % 360))) <= p.tolerance + 0.01) continue;
      const r = ok(p, { answer: wrong, parts: partsOf(p) });
      expect(r.mistake?.id).toBe("wcaSign");
      n++;
    }
    expect(n).toBeGreaterThan(80);
  });
  it("fuel: a forgotten VFR reserve is named", () => {
    const p = generate("vfr.fuelEndurance", 3, { variant: "required" });
    const v = g(p);
    const wrong = +v.taxi + (+v.flow * +v.tripMin) / 60;
    const r = ok(p, { answer: Math.round(wrong * 2) / 2, parts: partsOf(p) });
    expect(r.ok).toBe(false);
    expect(r.mistake?.id).toBe("reserve");
  });
  it("weight and balance: averaging the arms and forgetting the empty aeroplane are named", () => {
    const p = generate("vfr.weightBalance", 5, { variant: "cg" });
    const v = g(p);
    const arms = [39.4, 37, +v.rear && 73, +v.bag1 && 95, +v.bag2 && 123, +v.fuelGal && 48].filter((x) => !!x) as number[];
    const avg = arms.reduce((a, b) => a + b, 0) / arms.length;
    const r = ok(p, { answer: avg, parts: partsOf(p) });
    expect(r.ok).toBe(false);
    expect(r.mistake?.id).toBe("datum");
    const noEmpty = (solveWb({ front: +v.front, rear: +v.rear, bag1: +v.bag1, bag2: +v.bag2, fuelGal: +v.fuelGal }).moment - 65522) / (p.parts!.find((x) => x.key === "weight")!.answer as number - 1663);
    expect(ok(p, { answer: noEmpty, parts: partsOf(p) }).mistake?.id).toBe("datum");
    // the right CG with the wrong verdict
    const wrongVerdict = ok(p, { answer: p.answer, parts: { ...partsOf(p), within: partsOf(p).within === "yes" ? "no" : "yes" } });
    expect(wrongVerdict.ok).toBe(false);
    expect(wrongVerdict.parts?.within).toBe(false);
  });
  it("weight and balance: rounding the fuel up is named", () => {
    for (const s of SEEDS) {
      const p = generate("vfr.weightBalance", s, { variant: "fuel" });
      const v = g(p);
      const w0 = 1663 + +v.front + +v.rear + +v.bag1 + +v.bag2;
      if (Number.isInteger((2550 - w0) / 6) || p.answer === 53) continue;
      const r = ok(p, { answer: p.answer + 2, parts: partsOf(p) });
      expect(r.ok).toBe(false);
      return;
    }
  });
  it("factors: head and tail wind swapped, additive percentages and a forgotten surface are named", () => {
    let swapped = 0;
    let additive = 0;
    for (const s of SEEDS) {
      const p = generate("vfr.takeoffLandingFactors", s);
      const v = g(p);
      const i = { mode: v.mode as "takeoff" | "landing", baseFt: +v.baseFt, headKt: +v.headKt, surface: v.surface as "paved" | "dryGrass" | "wetGrass", slopePct: +v.slopePct };
      const sw = solveFactors({ ...i, headKt: -i.headKt }).distance;
      if (Math.abs(sw - p.answer) > p.tolerance * 2 && +v.headKt !== 0) {
        expect(ok(p, { answer: Math.round(sw / 10) * 10, parts: partsOf(p) }).mistake?.id).toBe("headTailSwap");
        swapped++;
      }
      const add = solveFactors(i).additive;
      if (Math.abs(add - p.answer) > p.tolerance + 10) {
        expect(ok(p, { answer: Math.round(add / 10) * 10, parts: partsOf(p) }).mistake?.id).toBe("rounding");
        additive++;
      }
    }
    expect(swapped).toBeGreaterThan(30);
    expect(additive).toBeGreaterThan(5);
  });
  it("unit conversions: going the wrong way is named, in every pair with a plain factor", () => {
    let named = 0;
    for (const s of SEEDS) {
      const p = generate("vfr.unitConversion", s);
      const v = g(p);
      const pair = CONVERSION_PAIRS.find((x) => x.id === v.pair)!;
      if (pair.k === undefined) continue;
      const wrong = pair.k > 1 ? +v.value / pair.k : +v.value * (1 / pair.k);
      if (Math.abs(wrong - p.answer) <= p.tolerance) continue;
      const r = ok(p, { answer: wrong });
      expect(r.ok).toBe(false);
      expect(r.mistake?.text.en).toMatch(/wrong way/);
      named++;
    }
    expect(named).toBeGreaterThan(50);
  });
  it("unit conversions: temperature slips (no + 32; 32 added after dividing) are named", () => {
    const p = generate("vfr.unitConversion", 1, { variant: "temperature" });
    const v = g(p);
    if (v.pair === "c-f") expect(ok(p, { answer: +v.value * 1.8 }).mistake?.text.en).toMatch(/32/);
    else expect(ok(p, { answer: +v.value / 1.8 - 32 }).mistake?.text.en).toMatch(/32/);
  });
  it("crosswind: reciprocal side and the demonstrated-value verdict", () => {
    const p = generate("vfr.crosswind", 4);
    const side = partsOf(p).side === "R" ? "L" : "R";
    const r = ok(p, { answer: p.answer, parts: { ...partsOf(p), side } });
    expect(r.ok).toBe(false);
    expect(r.mistake?.id).toBe("wrongSide");
  });
  it("a hand-made literal case: 10 US gal of avgas weigh 60 lb", () => {
    const p = handMade("vfr.unitConversion", { variant: "fuel" }, { value: 10, pair: "gal-lb", group: "fuel" }, 60);
    expect(ok(p, { answer: 60 }).ok).toBe(true);
    expect(ok(p, { answer: 61 }).ok).toBe(true);
    expect(ok(p, { answer: 70 }).ok).toBe(false);
    expect(ok(p, { answer: 600 }).mistake?.id).toBe("factor");
  });
});

describe("VFR properties", () => {
  it("TVMDC round-trips: undoing deviation, variation and WCA returns the true course", () => {
    for (let tc = 0; tc < 360; tc += 15)
      for (const [wd, wk] of [[0, 0], [90, 15], [200, 25], [315, 10]] as const)
        for (const variation of [-12, -3, 0, 6, 14])
          for (const deviation of [-4, 0, 3]) {
            const s = solveTvmdc(tc, 110, wd, wk, variation, deviation);
            const th = (s.ch - deviation + variation + 720) % 360;
            expect(Math.abs(wrap(th - s.th))).toBeLessThan(1e-9);
            expect(Math.abs(wrap(th - s.wca - tc))).toBeLessThan(1e-9);
          }
  });
  it("East is least: more easterly variation always lowers the magnetic heading", () => {
    for (const tc of [10, 100, 250]) {
      const east = solveTvmdc(tc, 100, 0, 0, 8, 0).mh;
      const west = solveTvmdc(tc, 100, 0, 0, -8, 0).mh;
      expect(wrap(west - east)).toBeCloseTo(16, 6);
    }
  });
  it("WCA: the crosswind component is cancelled by the heading (exact), and the rule is within 1 degree below 15 degrees", () => {
    for (let tc = 0; tc < 360; tc += 20)
      for (const wk of [8, 15, 22]) {
        const t = M.windTriangle(tc, 120, 80, wk);
        const across = wk * Math.sin((80 - tc) * D) - 120 * Math.sin(t.wca * D);
        expect(Math.abs(across)).toBeLessThan(1e-9);
        if (Math.abs(t.wca) < 15) expect(Math.abs(M.wcaRule(t.cross, 120) - t.wca)).toBeLessThan(1);
      }
  });
  it("crosswind components agree with vector maths for every angle", () => {
    for (let rwy = 10; rwy <= 360; rwy += 10)
      for (let dir = 0; dir < 360; dir += 11) {
        const w = solveRunwayWind(rwy, dir, 20);
        // unit vectors: runway direction r, wind blowing TOWARD (dir + 180)
        const toward = (dir + 180) * D;
        const r = rwy * D;
        const wx = 20 * Math.sin(toward);
        const wy = 20 * Math.cos(toward);
        const along = wx * Math.sin(r) + wy * Math.cos(r); // + = tailwind
        const across = wx * Math.cos(r) - wy * Math.sin(r);
        expect(w.head).toBeCloseTo(-along, 9);
        expect(w.cross).toBeCloseTo(Math.abs(across), 9);
      }
  });
  it("CG moves aft with every pound added aft of the CG, and burning fuel (arm 48) moves it only slightly", () => {
    const base = solveWb({ front: 340, rear: 0, bag1: 0, bag2: 0, fuelGal: 40 });
    expect(solveWb({ front: 340, rear: 0, bag1: 60, bag2: 0, fuelGal: 40 }).cg).toBeGreaterThan(base.cg);
    expect(solveWb({ front: 340, rear: 0, bag1: 0, bag2: 0, fuelGal: 10 }).cg).toBeLessThan(base.cg + 0.8);
    // the CG is always the moment over the weight
    for (const l of [{ front: 200, rear: 100, bag1: 20, bag2: 0, fuelGal: 30 }, { front: 400, rear: 340, bag1: 0, bag2: 50, fuelGal: 53 }]) {
      const r = solveWb(l);
      expect(r.cg).toBeCloseTo(r.moment / r.weight, 9);
      expect(r.rows.reduce((a, x) => a + x.moment, 0)).toBeCloseTo(r.moment, 9);
    }
  });
  it("both verdicts occur: the weight and balance and the runway questions are neither always yes nor always no", () => {
    const within = new Set(SEEDS.map((s) => partsOf(generate("vfr.weightBalance", s, { variant: "cg" })).within));
    const fits = new Set(SEEDS.map((s) => partsOf(generate("vfr.takeoffLandingFactors", s)).fits));
    const demo = new Set(SEEDS.map((s) => partsOf(generate("vfr.crosswind", s)).within));
    expect(within.size).toBe(2);
    expect(fits.size).toBe(2);
    expect(demo.size).toBe(2);
  });
  it("conversions round-trip through their inverse pairs within the rule's margin", () => {
    const pairs: [string, string][] = [["kt-kmh", "kmh-kt"], ["kt-mph", "mph-kt"], ["ft-m", "m-ft"], ["inhg-hpa", "hpa-inhg"], ["c-f", "f-c"], ["gal-l", "l-gal"], ["lb-kg", "kg-lb"]];
    for (const [a, b] of pairs) {
      const A = CONVERSION_PAIRS.find((p) => p.id === a)!;
      const B = CONVERSION_PAIRS.find((p) => p.id === b)!;
      for (const x of [A.lo, (A.lo + A.hi) / 2, A.hi]) expect(Math.abs(B.exact(A.exact(x)) - x)).toBeLessThan(1e-6 * Math.max(1, Math.abs(x)));
    }
  });
});

describe("registry", () => {
  it("has every generator of the CalcGeneratorId union, once", () => {
    expect(GENERATOR_IDS.length).toBe(31);
    expect(new Set(GENERATOR_IDS).size).toBe(31);
    expect(GENERATOR_IDS.filter((i) => i.startsWith("ifr.")).length).toBe(23);
    expect(GENERATOR_IDS.filter((i) => i.startsWith("vfr.")).length).toBe(8);
    for (const id of GENERATOR_IDS) expect(GENERATORS[id].id).toBe(id);
    expect(getGenerator("nope.nope")).toBeUndefined();
  });
  it("lists by category, including the generators that live in both", () => {
    const ifr = GENERATORS_BY_CATEGORY.ifr.map((x) => x.id);
    const vfr = GENERATORS_BY_CATEGORY.vfr.map((x) => x.id);
    expect(ifr.length).toBeGreaterThanOrEqual(23);
    expect(vfr.length).toBeGreaterThanOrEqual(8);
    expect(vfr).toContain("vfr.tvmdc");
    expect(ifr).not.toContain("vfr.tvmdc");
    expect(vfr).toContain("ifr.windComponents");
    expect(ifr).toContain("vfr.unitConversion");
    expect(vfr).toContain("ifr.densityAltitude");
  });
  it("every generator has bilingual titles, summaries, parameters with valid defaults", () => {
    for (const id of GENERATOR_IDS) {
      const d = GENERATORS[id];
      for (const t of [d.title, d.summary]) {
        expect(t.en.length).toBeGreaterThan(5);
        expect(t.fr?.length).toBeGreaterThan(5);
      }
      for (const p of d.params ?? []) {
        expect(p.label.en && p.label.fr).toBeTruthy();
        if (p.kind === "choice") expect(p.choices!.some((c) => c.value === p.default)).toBe(true);
      }
    }
  });
  it("every generator, every variant, 150 seeds: finite, bilingual, no NaN, accepts its own answer, rejects a clearly wrong one, cites a source", () => {
    for (const id of GENERATOR_IDS) {
      const variants = GENERATORS[id].params?.find((p) => p.key === "variant")?.choices?.map((c) => c.value) ?? ["any"];
      for (const variant of variants)
        for (let s = 1; s <= 150; s += 1) {
          const p = generate(id, s, { variant });
          const text = [p.prompt, p.ruleOfThumb, p.formula, ...p.solutionSteps];
          for (const t of text) {
            expect(t.en.length).toBeGreaterThan(3);
            expect((t.fr ?? "").length).toBeGreaterThan(3);
            expect(`${t.en}${t.fr}`).not.toMatch(/NaN|undefined|Infinity|\[object/);
          }
          expect(p.solutionSteps.length).toBeGreaterThanOrEqual(2);
          expect(p.refs.length).toBeGreaterThan(0);
          expect(Number.isFinite(p.answer)).toBe(true);
          expect(p.tolerance).toBeGreaterThanOrEqual(0);
          for (const x of p.givens) if (typeof x.value === "number") expect(Number.isFinite(x.value)).toBe(true);
          const good = ok(p, { answer: p.answer, parts: partsOf(p) });
          expect(good.ok, `${id} ${variant} ${s}`).toBe(true);
          if (s <= 30 && id !== "ifr.holdSpeed") {
            const bad = ok(p, { answer: p.answer + (p.unit === "deg" ? 60 : 3 * p.tolerance + Math.max(8, Math.abs(p.answer) * 0.25)), parts: partsOf(p) });
            expect(bad.ok, `${id} ${variant} ${s}`).toBe(false);
            expect(bad.mistake?.text.en.length).toBeGreaterThan(5);
            expect(bad.mistake?.text.fr?.length).toBeGreaterThan(5);
          }
        }
    }
  });
  it("is deterministic per (generator, seed, params): a CFI can fix a seed; a retry draws new numbers", () => {
    for (const id of GENERATOR_IDS) {
      const a = generate(id, 424242);
      expect(generate(id, 424242)).toEqual(a);
      expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    }
    const spec = { generatorId: "ifr.descentRate" as const, seed: 99 };
    expect(problemFor(spec, 1)).toEqual(problemFor(spec, 2)); // fixed seed: the same numbers for everyone
    const free = { generatorId: "ifr.descentRate" as const };
    expect(problemFor(free, 1).prompt.en).not.toBe(problemFor(free, 2).prompt.en);
    // one seed gives different numbers on different generators
    expect(generate("ifr.descentRate", 5).givens).not.toEqual(generate("ifr.timeSpeedDistance", 5).givens);
  });
  it("resolves params: defaults, unknown keys dropped, bad choices fall back", () => {
    const d = GENERATORS["ifr.holdSpeed"];
    expect(resolveParams(d)).toEqual({ rules: "faa" });
    expect(resolveParams(d, { rules: "icao", bogus: 3 })).toEqual({ rules: "icao" });
    expect(resolveParams(d, { rules: "nope" })).toEqual({ rules: "faa" });
    expect(() => generate("ifr.nothing" as CalcGeneratorId, 1)).toThrow();
  });
  it("applies the step's tolerance and unit overrides", () => {
    const p = generate("ifr.timeSpeedDistance", 8, { variant: "speed" });
    expect(checkAnswer(p, { answer: p.answer + p.tolerance * 3 }).ok).toBe(false);
    expect(checkAnswer(p, { answer: p.answer + p.tolerance * 3 }, { tolerance: p.tolerance * 4 }).ok).toBe(true);
    // asked in km/h: a bare number is read in km/h
    expect(checkAnswer(p, { answer: p.answer * 1.852 }, { unit: "kmh" }).ok).toBe(true);
    expect(checkAnswer(p, { answer: p.answer * 1.852 }).ok).toBe(false);
    const a = answerIn(p, "kmh");
    expect(a.unit).toBe("kmh");
    expect(a.answer).toBeCloseTo(p.answer * 1.852, 6);
    expect(answerIn(p, undefined).answer).toBe(p.answer);
    expect(answerIn(p, "NM").unit).toBe(p.unit); // another dimension: ignored
  });
});

describe("drills", () => {
  const spec: DrillSpec = { generatorIds: ["ifr.descentRate", "vfr.tvmdc", "ifr.holdTiming"], count: 12, practiceOnly: true };
  it("plans N problems from the chosen generators; a fixed seed gives the class the same sequence", () => {
    const a = planDrill({ ...spec, seed: 31 });
    expect(a.length).toBe(12);
    expect(planDrill({ ...spec, seed: 31 })).toEqual(a);
    expect(planDrill({ ...spec, seed: 32 })).not.toEqual(a);
    expect(a.every((x) => spec.generatorIds.includes(x.generatorId))).toBe(true);
    expect(new Set(a.map((x) => x.generatorId)).size).toBeGreaterThan(1);
    for (const x of a) expect(generate(x.generatorId, x.seed, x.params).seed).toBe(x.seed);
  });
  it("without a seed each run is new; per-generator params are honoured; empty and unknown lists are safe", () => {
    expect(planDrill(spec, 1)).not.toEqual(planDrill(spec, 2));
    const one = planDrill({ generatorIds: ["ifr.timeSpeedDistance"], params: { "ifr.timeSpeedDistance": { variant: "time" } }, count: 6, seed: 4, practiceOnly: true });
    expect(one.every((x) => x.params.variant === "time")).toBe(true);
    expect(planDrill({ ...spec, generatorIds: [] })).toEqual([]);
    expect(planDrill({ ...spec, count: 0 })).toEqual([]);
    const ids = planDrill({ ...spec, generatorIds: ["nope" as CalcGeneratorId, "vfr.tvmdc"] });
    expect(ids.every((x) => x.generatorId === "vfr.tvmdc")).toBe(true);
  });
  it("never repeats the same problem twice in a row", () => {
    const items = planDrill({ generatorIds: ["ifr.holdSpeed"], count: 40, seed: 3, practiceOnly: true });
    for (let i = 1; i < items.length; i++) {
      const a = generate(items[i - 1].generatorId, items[i - 1].seed, items[i - 1].params).prompt.en;
      const b = generate(items[i].generatorId, items[i].seed, items[i].params).prompt.en;
      if (items.length > 1) expect(a === b && items[i].seed === items[i - 1].seed).toBe(false);
    }
  });
  it("scores for the student: correct, percent, times, per generator; skipped counts as wrong", () => {
    const s = scoreDrill([
      { generatorId: "vfr.tvmdc", ok: true, secs: 20 },
      { generatorId: "vfr.tvmdc", ok: false, secs: 40 },
      { generatorId: "ifr.holdTiming", ok: true, secs: 30 },
      { generatorId: "ifr.holdTiming", ok: true, secs: 10, skipped: true },
    ]);
    expect(s.correct).toBe(2);
    expect(s.total).toBe(4);
    expect(s.pct).toBe(50);
    expect(s.totalSecs).toBe(100);
    expect(s.medianSecs).toBe(25);
    expect(s.byGenerator["vfr.tvmdc"]).toEqual({ correct: 1, total: 2 });
    expect(s.byGenerator["ifr.holdTiming"]).toEqual({ correct: 1, total: 2 });
    expect(scoreDrill([])).toMatchObject({ total: 0, pct: 0, medianSecs: 0 });
  });
});
