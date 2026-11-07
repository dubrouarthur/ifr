// Ground school — regressions from the course review: escaping in the hold diagram, the default quiz from holdEntry(),
// calc stages that only show drawable diagrams, answer parsing (m:ss, units), and the maths of the corrected
// generators (C172S baggage limits, TVMDC sign errors always caught, pressure conversions to the unit, standard-rate
// tolerance, published climb gradients, SafetySense factors, exact DME-arc formula).
import { describe, expect, it } from "vitest";
import { holdDiagramSvg } from "../src/train/diagram";
import { holdEntry } from "../src/nav/holding";
import { validateCourse } from "../src/course/validate";
import { allSamples } from "../src/course/samples";
import { generate, checkAnswer, problemFor } from "../src/course/calc";
import {
  calcStageView,
  parseAnswer,
  parseDuration,
} from "../src/course/ui/calcStep";
import { hasCalcDiagram } from "../src/course/stage/calcKinds";
import { solveWb, WB } from "../src/course/calc/vfr/performance";
import { solveTvmdc } from "../src/course/calc/vfr/navlog";
import {
  CONVERSION_PAIRS,
  solveConversion,
} from "../src/course/calc/vfr/conversion";
import { unitsLike } from "../src/course/calc/units";
import { makeStep, TPL_HOLD } from "../src/course/ui/templates";
import type { Course, Step } from "../src/course/types";

const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);
const giv = (p: { givens: { key: string; value: number | string }[] }) =>
  Object.fromEntries(p.givens.map((x) => [x.key, x.value])) as Record<
    string,
    number & string
  >;

describe("hold diagram: author text is never markup", () => {
  const payload = `<img src=x onerror="window.__xss=1">`;
  it("escapes the fix ident in the SVG text and aria-label", () => {
    const svg = holdDiagramSvg(90, "R", payload, 180, "en");
    expect(svg).not.toContain("<img");
    expect(svg).not.toMatch(/onerror="/);
    expect(svg).toContain("&lt;img");
  });
  it("the validator refuses a hold diagram whose fix is not an ident", () => {
    const c = structuredClone(
      allSamples().find((x) => x.id === "sample-holding")!,
    ) as Course;
    let n = 0;
    const visit = (o: unknown) => {
      if (!o || typeof o !== "object") return;
      const r = o as Record<string, unknown>;
      if (r.kind === "hold" && typeof r.fix === "string") {
        r.fix = payload;
        n++;
      }
      for (const v of Object.values(r)) visit(v);
    };
    visit(c);
    expect(n).toBeGreaterThan(0);
    expect(
      validateCourse(c).some(
        (i) => i.level === "error" && /fix ident/.test(i.message.en),
      ),
    ).toBe(true);
  });
});

describe("default quiz template", () => {
  it("asks a hold-entry question whose answer comes from holdEntry()", () => {
    const course = {
      cockpit: "g1000",
      steps: [],
      scenes: {},
      clips: {},
      assets: {},
    } as unknown as Course;
    const r = makeStep(course, "quiz");
    const q = r.step.quiz!;
    expect(q.kind).toBe("mcq");
    const e = holdEntry(TPL_HOLD.inbound, TPL_HOLD.turn, TPL_HOLD.arrive);
    const idx = { DIRECT: 0, PARALLEL: 1, TEARDROP: 2 }[e];
    expect((q as { answer: number }).answer).toBe(idx);
    expect(e).toBe("DIRECT");
    // and the old wrong one stays wrong: arriving heading 360 on this hold is a parallel entry
    expect(holdEntry(90, "R", 360)).toBe("PARALLEL");
  });
});

describe("calc stages in the shipped samples", () => {
  it("every calc step shows a drawable diagram, a live stage, or none (never a placeholder)", () => {
    for (const c of allSamples()) {
      const steps: Step[] = c.steps.flatMap((s) => [
        s,
        ...(s.flyIt?.briefing ?? []),
      ]);
      for (const s of steps) {
        if (!s.calc || s.stage) continue;
        for (const seed of [1, 2, 3, 7, 11]) {
          const p = problemFor(s.calc, seed);
          for (const revealed of [false, true])
            for (const wide of [false, true]) {
              const v = calcStageView(p, s.calc, revealed, wide);
              if (!v) continue;
              if (v.kind === "diagram" || v.kind === "covered")
                expect(
                  v.d.kind !== "calc" || hasCalcDiagram(v.d.calc.kind),
                  `${c.id}/${s.id}`,
                ).toBe(true);
              else
                for (const pane of v.hint.panes)
                  if (pane.kind === "diagram" && pane.d.kind === "calc")
                    expect(
                      hasCalcDiagram(pane.d.calc.kind),
                      `${c.id}/${s.id}`,
                    ).toBe(true);
            }
        }
      }
    }
  });
});

describe("answer parsing", () => {
  it("reads durations as the prompts write them", () => {
    expect(parseDuration("0:45", "s")).toBe(45);
    expect(parseDuration("1:15", "s")).toBe(75);
    expect(parseDuration("23:30", "min")).toBe(23.5);
    expect(parseDuration("1:25", "h")).toBeCloseTo(1 + 25 / 60, 9);
    expect(parseDuration("1 h 25", "min")).toBe(85);
    expect(parseDuration("1h25", "min")).toBe(85);
    expect(parseDuration("23 min 30 s", "min")).toBe(23.5);
    expect(parseDuration("45 s", "s")).toBe(45);
    expect(parseDuration("45", "s")).toBeNull();
    expect(parseDuration("1:75", "s")).toBeNull();
    expect(parseDuration("0:45", "ft")).toBeNull();
    expect(parseAnswer("0:45", "en", "s")).toBe(45);
    expect(parseAnswer("1 min 05 s", "fr", "s")).toBe(65);
  });
  it("accepts the asked unit after the number, nothing else", () => {
    expect(parseAnswer("1 200 ft", "fr", "ft")).toBe(1200);
    expect(parseAnswer("1,200ft", "en", "ft")).toBe(1200);
    expect(parseAnswer("95 kt", "en", "kt")).toBe(95);
    expect(parseAnswer("29.92 inHg", "en", "inHg")).toBe(29.92);
    expect(parseAnswer("500 fpm", "en", "fpm")).toBe(500);
    expect(parseAnswer("-12°", "en", "deg")).toBe(-12);
    expect(Number.isNaN(parseAnswer("1200 m", "en", "ft"))).toBe(true);
  });
  it("offers only units of the same kind (an altitude is never in NM)", () => {
    expect(unitsLike("ft")).toEqual(["ft", "m"]);
    expect(unitsLike("NM")).toEqual(["NM", "SM", "km"]);
  });
});

describe("corrected generators", () => {
  it("W&B: baggage within the C172S station limits, and 'within' honours them", () => {
    for (const seed of SEEDS)
      for (const variant of ["cg", "fuel"]) {
        const p = generate("vfr.weightBalance", seed, { variant });
        const g = giv(p);
        expect(g.bag2).toBeLessThanOrEqual(WB.bag2MaxLb);
        expect(g.bag1 + g.bag2).toBeLessThanOrEqual(WB.bagTotalMaxLb);
      }
    const over = solveWb({
      front: 340,
      rear: 0,
      bag1: 95,
      bag2: 30,
      fuelGal: 30,
    });
    expect(over.stationOver).toContain("bagTotal");
    expect(over.within).toBe(false);
  });
  it("TVMDC: a sign error on the deviation or the variation is never accepted", () => {
    for (const seed of SEEDS) {
      const p = generate("vfr.tvmdc", seed);
      const g = giv(p);
      const s = solveTvmdc(
        g.tc,
        g.tasKt,
        g.windDir,
        g.windKt,
        g.variation,
        g.deviation,
      );
      const parts = Object.fromEntries(
        (p.parts ?? []).map((x) => [x.key, x.answer]),
      );
      const r = (answer: number) => checkAnswer(p, { answer, parts }).ok;
      if (g.deviation !== 0)
        expect(r(s.mh - g.deviation), `seed ${seed}`).toBe(false);
      expect(r(s.th + g.variation + g.deviation), `seed ${seed}`).toBe(false);
      expect(r(p.answer), `seed ${seed}`).toBe(true);
    }
  });
  it("pressure conversions: tolerance is the unit set on an altimeter, and the anchored rule is inside it", () => {
    for (const id of ["inhg-hpa", "hpa-inhg"]) {
      const pair = CONVERSION_PAIRS.find((x) => x.id === id)!;
      for (let v = pair.lo; v <= pair.hi; v += pair.step * 7) {
        const s = solveConversion(pair, v);
        expect(s.tolerance).toBeLessThanOrEqual(id === "inhg-hpa" ? 1 : 0.01);
        expect(Math.abs(s.rule - s.exact)).toBeLessThan(s.tolerance);
      }
    }
    expect(
      CONVERSION_PAIRS.find((x) => x.id === "inhg-hpa")!.rule(29.92),
    ).toBeCloseTo(1013.25, 2);
  });
  it("standard-rate bank: the exact angle is always accepted", () => {
    for (const seed of SEEDS) {
      const p = generate("ifr.standardRateBank", seed);
      expect(checkAnswer(p, { answer: p.exact! }).ok, `seed ${seed}`).toBe(
        true,
      );
    }
  });
  it("published climb gradients are at or above 3.3 % / 200 ft/NM", () => {
    for (const seed of SEEDS) {
      for (const variant of ["pctToFtNm", "ftNmToPct"]) {
        const p = generate("ifr.descentGradient", seed, { variant });
        const g = giv(p);
        if (typeof g.pct === "number" && /SID/.test(p.prompt.en))
          expect(g.pct).toBeGreaterThanOrEqual(3.3);
        if (typeof g.ftPerNm === "number" && /departure/i.test(p.prompt.en))
          expect(g.ftPerNm).toBeGreaterThanOrEqual(200);
      }
    }
  });
  it("takeoff / landing: 'fits' applies the SafetySense factor to the corrected distance", () => {
    for (const seed of SEEDS) {
      const p = generate("vfr.takeoffLandingFactors", seed);
      const g = giv(p);
      const fits = p.parts!.find((x) => x.key === "fits")!.answer;
      const factor = g.mode === "takeoff" ? 1.33 : 1.43;
      // the corrected distance (rounded to 10 ft) × the factor decides
      const req = p.answer * factor;
      if (Math.abs(req - g.availableFt) > 20)
        expect(fits, `seed ${seed}`).toBe(req <= g.availableFt ? "yes" : "no");
    }
  });
});
