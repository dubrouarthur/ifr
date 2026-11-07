// Ground school — the built-in sample courses (package I): they validate, are fully bilingual, keep the student
// acting at least every 3 steps, use real generator ids, teach hold entries from holdEntry() and are deterministic.
import { describe, expect, it } from "vitest";
import type { Course, SlideBlock, Step } from "../src/course/types";
import {
  SAMPLES,
  allSamples,
  briefingForLesson,
  isSampleId,
  sampleCourse,
  HOLDING_ID,
  HOLD_NDB_BRIEFING_ID,
  MATHS_IFR_ID,
  MATHS_VFR_ID,
  VOR_ID,
} from "../src/course/samples";
import { isStudentAction } from "../src/course/samples/kit";
import {
  TEARDROP_DRAG,
  outboundHeading,
  wca,
} from "../src/course/samples/holding";
import { validateCourse, missingTranslations } from "../src/course/validate";
import { GENERATORS, problemFor } from "../src/course/calc";
import { holdEntry } from "../src/nav/holding";

const STAGE_DIAGRAMS = new Set([
  "windTriangle",
  "sixtyToOne",
  "profile",
  "vdp",
  "holdWind",
  "compass",
  "cgEnvelope",
]);
const errors = (c: Course) =>
  validateCourse(c).filter((i) => i.level === "error");
const blocks = (s: Step): SlideBlock[] => s.slide?.blocks ?? [];
const allSteps = (c: Course): Step[] =>
  c.steps.flatMap((s) => [s, ...(s.flyIt?.briefing ?? [])]);

describe("sample registry", () => {
  it("lists the four courses and the briefing, then the crafted lesson briefings", () => {
    expect(SAMPLES.slice(0, 5).map((s) => s.id)).toEqual([
      MATHS_IFR_ID,
      MATHS_VFR_ID,
      VOR_ID,
      HOLDING_ID,
      HOLD_NDB_BRIEFING_ID,
    ]);
    expect(isSampleId(VOR_ID)).toBe(true);
    expect(isSampleId("nope")).toBe(false);
    expect(sampleCourse("nope")).toBeNull();
  });
  it("returns fresh copies", () => {
    const a = sampleCourse(VOR_ID)!;
    a.title.en = "changed";
    expect(sampleCourse(VOR_ID)!.title.en).not.toBe("changed");
  });
  it("finds the briefing written for the hold-ndb lesson", () => {
    const b = briefingForLesson("hold-ndb")!;
    expect(b.id).toBe(HOLD_NDB_BRIEFING_ID);
    expect(b.shape).toBe("briefing");
    expect(b.steps.at(-1)!.flyIt!.target).toEqual({
      kind: "lesson",
      exerciseId: "hold-ndb",
    });
    expect(briefingForLesson("hold-random")).toBeNull();
  });
});

describe.each(SAMPLES.map((s) => [s.id]))("%s", (id) => {
  const c = sampleCourse(id)!;
  it("validates with no errors", () => {
    expect(
      errors(c).map((i) => `${i.code} ${i.path}: ${i.message.en}`),
    ).toEqual([]);
  });
  it("has every text in French", () => {
    expect(missingTranslations(c).count ?? missingTranslations(c)).toBeFalsy();
  });
  it("is built-in, bilingual and deterministic", () => {
    expect(c.sample).toBe(id);
    expect(c.langs).toEqual(["en", "fr"]);
    expect(JSON.stringify(SAMPLES.find((s) => s.id === id)!.build())).toBe(
      JSON.stringify(SAMPLES.find((s) => s.id === id)!.build()),
    );
  });
  it("gives every block a unique, stable id", () => {
    for (const s of allSteps(c)) {
      const ids = blocks(s).map((b) => b.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const b of ids) expect(b).not.toMatch(/^[a-z]\d+$/);
    }
  });
  it("keeps the student acting at least every 3 steps", () => {
    let run = 0;
    for (const s of c.steps) {
      run = isStudentAction(s) ? 0 : run + 1;
      expect(run, `before ${s.id}`).toBeLessThan(3);
    }
  });
  it("only uses calc diagrams the stage draws, and alt text on visuals", () => {
    for (const s of allSteps(c))
      for (const b of blocks(s)) {
        if (b.kind === "diagram" && b.d?.kind === "calc")
          expect(
            STAGE_DIAGRAMS.has(b.d.calc.kind),
            `${s.id} ${b.d.calc.kind}`,
          ).toBe(true);
        if (
          b.kind === "image" ||
          b.kind === "instrument" ||
          b.kind === "diagram"
        )
          expect(b.alt?.en, `${s.id}/${b.id}`).toBeTruthy();
      }
  });
  it("uses real generator ids that generate for any seed", () => {
    for (const s of allSteps(c)) {
      const ids = [
        ...(s.calc ? [s.calc.generatorId] : []),
        ...(s.drill?.generatorIds ?? []),
        ...blocks(s).flatMap((b) =>
          b.kind === "calc" ? [b.calc.generatorId] : [],
        ),
      ];
      for (const g of ids) expect(GENERATORS[g], `${s.id} ${g}`).toBeTruthy();
      if (s.calc)
        for (const seed of [1, 2, 3, 4183, 99991])
          expect(() => problemFor(s.calc!, seed)).not.toThrow();
    }
  });
  it("links Try it / Fly it steps to calc steps whose problems pose a stage and goals", () => {
    for (const s of c.steps) {
      const ref =
        s.calcLink?.step ??
        (s.flyIt?.target.kind === "calc" ? s.flyIt.target.step : undefined);
      if (!ref) continue;
      const src = c.steps.find((x) => x.id === ref)!;
      expect(src.kind).toBe("calc");
      for (const seed of [1, 7, 4183]) {
        const p = problemFor(src.calc!, seed);
        expect(p.stage, `${src.calc!.generatorId}`).toBeTruthy();
        expect(p.stage!.goals?.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("step counts and mix", () => {
  const count = (c: Course, k: string) =>
    c.steps.filter((s) => s.kind === k).length;
  it("VOR tracking has 14 steps (slides first) and ends with a Fly it", () => {
    const c = sampleCourse(VOR_ID)!;
    expect(c.steps).toHaveLength(14);
    expect(c.steps.at(-1)!.kind).toBe("fly");
    expect(count(c, "try")).toBeGreaterThanOrEqual(3);
  });
  it("Holding has 20 steps (slides first), an inline briefing and a Your turn on a slide", () => {
    const c = sampleCourse(HOLDING_ID)!;
    expect(c.steps).toHaveLength(20);
    const fly = c.steps.at(-1)!;
    expect(fly.flyIt!.briefing!.length).toBeGreaterThanOrEqual(2);
    expect(
      c.steps.some((s) =>
        blocks(s).some(
          (b) => b.kind === "instrument" && b.yourTurn?.where === "slide",
        ),
      ),
    ).toBe(true);
  });
  it.each([
    [MATHS_IFR_ID, 14],
    [MATHS_VFR_ID, 12],
  ])(
    "%s mixes slides, calcs, a drill, a Try it and a Fly it (≥ %i steps)",
    (id, n) => {
      const c = sampleCourse(id as string)!;
      expect(c.steps.length).toBeGreaterThanOrEqual(n as number);
      expect(c.steps.filter((s) => s.slide).length).toBeGreaterThanOrEqual(4);
      expect(count(c, "calc")).toBeGreaterThanOrEqual(5);
      expect(count(c, "drill")).toBe(1);
      expect(c.steps.find((s) => s.kind === "drill")!.drill!.practiceOnly).toBe(
        true,
      );
      expect(c.steps.some((s) => s.kind === "try" && s.calcLink)).toBe(true);
      expect(
        c.steps.some(
          (s) => s.kind === "fly" && s.flyIt?.target.kind === "calc",
        ),
      ).toBe(true);
    },
  );
  it("most explain steps are designed slides", () => {
    for (const c of allSamples()) {
      const explain = c.steps.filter(
        (s) => s.kind === "explain" || s.kind === "slide",
      );
      expect(
        explain.filter((s) => s.slide).length / explain.length,
      ).toBeGreaterThanOrEqual(0.8);
    }
  });
});

describe("holding content follows holdEntry() (AIM FIG 5-3-8)", () => {
  const c = sampleCourse(HOLDING_ID)!;
  const ENTRIES = ["DIRECT", "TEARDROP", "PARALLEL"];
  it("answers every entry quiz with holdEntry()", () => {
    for (const s of c.steps.filter((x) => x.id.startsWith("h-case-"))) {
      const d = s.stage?.panes[0];
      const quiz = s.quiz ?? blocks(s).find((b) => b.kind === "quiz")?.quiz;
      const hold =
        d?.kind === "diagram" && d.d.kind === "hold"
          ? d.d
          : (
              blocks(s).find((b) => b.kind === "diagram") as Extract<
                SlideBlock,
                { kind: "diagram" }
              >
            ).d;
      expect(hold?.kind).toBe("hold");
      if (hold?.kind !== "hold" || quiz?.kind !== "mcq") throw new Error(s.id);
      expect(ENTRIES[quiz.answer]).toBe(
        holdEntry(hold.inbound, hold.turn, hold.crs!),
      );
    }
  });
  it("the drag goal sits wholly in the teardrop sector", () => {
    for (
      let r = TEARDROP_DRAG.radial - TEARDROP_DRAG.tol;
      r <= TEARDROP_DRAG.radial + TEARDROP_DRAG.tol;
      r++
    )
      expect(holdEntry(270, "R", (r + 180) % 360)).toBe("TEARDROP");
  });
  it("the briefing's entry is the hold-ndb lesson's (inbound 270 R, arriving 045: teardrop)", () => {
    const b = sampleCourse(HOLD_NDB_BRIEFING_ID)!;
    const q = blocks(b.steps.find((s) => s.id === "n-entry")!).find(
      (x) => x.kind === "quiz",
    ) as Extract<SlideBlock, { kind: "quiz" }>;
    if (q.quiz.kind !== "mcq") throw new Error("mcq");
    expect(ENTRIES[q.quiz.answer]).toBe(holdEntry(270, "R", 45));
    expect(holdEntry(270, "R", 45)).toBe("TEARDROP");
  });
});

describe("hold wind maths", () => {
  it("wind correction angle: sign into the wind, magnitude asin(xw/TAS)", () => {
    expect(wca(270, 90, 360, 25)).toBeCloseTo(16.13, 1); // wind from the right: correct right
    expect(wca(90, 90, 360, 25)).toBeCloseTo(-16.13, 1); // wind from the left: correct left
    expect(wca(270, 90, 270, 25)).toBeCloseTo(0, 6); // headwind: no drift
    expect(wca(270, 90, 220, 15)).toBeCloseTo(-7.33, 1);
  });
  it("outbound heading triples the drift into the wind", () => {
    expect(outboundHeading(270, 90, 360, 25)).toBe(42); // 090 − 3 × 16°
    expect(outboundHeading(270, 90, 220, 15)).toBe(112); // 090 + 3 × 7.3°
    expect(outboundHeading(270, 90, 270, 20)).toBe(90);
  });
});
