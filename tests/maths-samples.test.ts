// The two maths samples: the cover promises what the course holds (steps, minutes), the simulator is used where it
// teaches (live instruments the student works, a Fly it after the practice and at the end), and the timed drill only
// draws on what the course taught and practised before it.
import { describe, expect, it } from "vitest";
import { IFR_MIN, IFR_STEPS, mathsIfrCourse } from "../src/course/samples/mathsIfr";
import { VFR_MIN, VFR_STEPS, mathsVfrCourse } from "../src/course/samples/mathsVfr";
import type { Course, SlideBlock } from "../src/course/types";

const blocks = (c: Course): SlideBlock[] => c.steps.flatMap((s) => s.slide?.blocks ?? []);
const minutes = (c: Course) => c.steps.reduce((t, s) => t + (s.minutes ?? 1), 0);

describe.each([
  ["IFR", mathsIfrCourse, IFR_STEPS, IFR_MIN],
  ["VFR", mathsVfrCourse, VFR_STEPS, VFR_MIN],
] as const)("Maths for %s", (_n, build, nSteps, nMin) => {
  const c = build();
  it("the cover's step count and minutes are the course's", () => {
    expect(c.steps).toHaveLength(nSteps);
    expect(minutes(c)).toBe(nMin);
    expect(c.minutes).toBe(nMin);
  });
  it("hands the controls to the student before the flights (a live instrument on a slide, or a Try it)", () => {
    const live = blocks(c).filter((b) => b.kind === "instrument" && b.yourTurn?.where === "slide");
    expect(live.length + c.steps.filter((s) => s.kind === "try" && !s.slide).length).toBeGreaterThanOrEqual(1);
  });
  it("ends with a Fly it, and flies after the practice", () => {
    expect(c.steps.at(-1)!.kind).toBe("fly");
    expect(c.steps.filter((s) => s.kind === "fly").length).toBeGreaterThanOrEqual(2);
  });
  it("explains every wrong answer of every question on a slide", () => {
    const quizzes = blocks(c).flatMap((b) => (b.kind === "quiz" && b.quiz.kind === "mcq" ? [b.quiz] : []));
    expect(quizzes.length).toBeGreaterThanOrEqual(5);
    for (const q of quizzes)
      q.options.forEach((o, i) => {
        if (i !== q.answer) expect(o.why?.fr, `${q.prompt.en} · ${o.text.en}`).toBeTruthy();
      });
  });
  it("never leaves the student passive for more than two slides in a row", () => {
    // active: a question, a diagram to drag, a live instrument to work, or any step that is not a plain slide
    const active = (s: Course["steps"][number]) =>
      !s.slide ||
      s.slide.blocks.some(
        (b) =>
          b.kind === "quiz" ||
          (b.kind === "diagram" && b.interactive) ||
          (b.kind === "instrument" && !!b.yourTurn) ||
          b.kind === "checklist",
      );
    let run = 0;
    for (const s of c.steps) {
      run = active(s) ? 0 : run + 1;
      expect(run, s.id).toBeLessThanOrEqual(2);
    }
  });
  it("only checks what the simulator can see: a setting-knob exercise asks for the reading, not an altitude band", () => {
    // altBand reads the aircraft's altitude, which the altimeter setting does not move
    for (const b of blocks(c))
      if (b.kind === "instrument" && b.yourTurn?.controls?.includes("baro"))
        expect(b.yourTurn.goal.all.map((g) => g.id), b.id).not.toContain("altBand");
    const knob = c.steps.filter((s) => s.stage?.controls?.includes("baro"));
    expect(knob).toHaveLength(1);
    expect(knob[0].quiz?.kind).toBe("numeric");
    expect(knob[0].goal).toBeUndefined();
  });
  it("drills only generators the course practised before the drill", () => {
    const iDrill = c.steps.findIndex((s) => s.kind === "drill");
    const practised = new Set(
      c.steps.slice(0, iDrill).flatMap((s) => (s.calc ? [s.calc.generatorId] : [])),
    );
    for (const g of c.steps[iDrill].drill!.generatorIds) expect(practised, g).toContain(g);
  });
});

describe("Maths for IFR: the closing descent", () => {
  const fly = mathsIfrCourse().steps.at(-1)!.flyIt!;
  it("is not graded as a VS path from the first second, and ends over ARD", () => {
    expect(fly.criteria.map((c) => c.check.id)).toEqual(["passedFix"]);
    expect(fly.target.kind === "calc" && fly.target.durationS).toBeFalsy();
  });
});
