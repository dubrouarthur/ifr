// Ground school player (package E): the pure logic of the player, the reader, quizzes, calc steps, drills, the
// outline and the Fly-it debrief (the DOM is exercised by the Playwright harness).
import { describe, expect, it } from "vitest";
import type {
  AttemptRecord,
  Criterion,
  DrillSpec,
  Quiz,
  Step,
} from "../src/course/types";
import { generate } from "../src/course/calc";
import {
  answerText,
  askedUnit,
  calcRevealed,
  calcStageView,
  canRetry,
  digitsFor,
  givenText,
  mistakeText,
  newCalcState,
  parseNumber,
  readResponse,
  solutionMode,
} from "../src/course/ui/calcStep";
import {
  inRect,
  moveItem,
  numericCorrect,
  orderCorrect,
  shuffledOrder,
  tapCorrect,
} from "../src/course/ui/quiz";
import { clock, DrillRun } from "../src/course/ui/drill";
import {
  courseMinutes,
  markText,
  stepStatus,
  tickClass,
} from "../src/course/ui/outline";
import {
  attemptHeadline,
  criterionRows,
  flownText,
  traceGeometry,
} from "../src/course/ui/debrief";
import {
  assisted,
  goalProgress,
  layoutFor,
  stepQuiz,
  visibleSteps,
} from "../src/course/ui/player";
import {
  hasDoThis,
  hasPresenterReveal,
  kindLabel,
  locText,
  ps,
  revealCount,
  revealShown,
  stepMeta,
  takeawaysOf,
} from "../src/course/ui/reader";

const L = (en: string, fr?: string) => ({ en, fr });
const step = (over: Partial<Step>): Step => ({
  id: "s",
  kind: "explain",
  title: L("T"),
  reader: [],
  ...over,
});

describe("number entry (both languages)", () => {
  it("reads what a pilot types", () => {
    expect(parseNumber("1,500", "en")).toBe(1500);
    expect(parseNumber("1 500", "fr")).toBe(1500);
    expect(parseNumber("1 500", "fr")).toBe(1500);
    expect(parseNumber("1,5", "fr")).toBe(1.5);
    expect(parseNumber("1,5", "en")).toBe(1.5);
    expect(parseNumber("1.5")).toBe(1.5);
    expect(parseNumber("1.234,5", "fr")).toBe(1234.5);
    expect(parseNumber("1,234.5", "en")).toBe(1234.5);
    expect(parseNumber("−3")).toBe(-3);
    expect(parseNumber("+5")).toBe(5);
    expect(parseNumber("090")).toBe(90);
    expect(parseNumber("270°")).toBe(270);
    expect(parseNumber(".5")).toBe(0.5);
  });
  it("refuses what is not a number", () => {
    for (const s of [
      "",
      " ",
      "abc",
      "1.2.3",
      "12a",
      "--3",
      "1,2,3,4",
      "1 000,5,2",
    ])
      expect(Number.isNaN(parseNumber(s, "en")), s).toBe(true);
  });
  it("shows enough decimals for the tolerance", () => {
    expect(digitsFor("ft", 50)).toBe(0);
    expect(digitsFor("NM", 0.5)).toBe(1);
    expect(digitsFor("inHg", 0.01)).toBe(2);
    expect(digitsFor("deg", 0.25)).toBe(1);
  });
});

describe("calc step", () => {
  const spec = { generatorId: "ifr.sixtyToOne" as const, seed: 4242 };
  it("a fixed seed gives everyone the same numbers and no New numbers by default", () => {
    expect(newCalcState(spec).seed).toBe(4242);
    expect(newCalcState(spec, 7).seed).toBe(4242);
    expect(canRetry(spec)).toBe(false);
    expect(canRetry({ generatorId: "ifr.sixtyToOne" })).toBe(true);
    expect(canRetry({ ...spec, retry: true })).toBe(true);
    expect(solutionMode(spec)).toBe("onCheck");
  });
  it("reads the answer and its parts into a response, naming the first empty box", () => {
    const p = generate("ifr.windComponents", 11);
    const st = newCalcState({ generatorId: "ifr.windComponents" }, 11);
    expect(readResponse(p, { generatorId: p.generatorId }, st, "en")).toEqual({
      ok: false,
      field: "answer",
    });
    st.input = String(p.answer);
    const r1 = readResponse(p, { generatorId: p.generatorId }, st, "en");
    if (p.parts?.length) {
      expect(r1.ok).toBe(false);
      for (const part of p.parts) st.parts[part.key] = String(part.answer);
      const r2 = readResponse(p, { generatorId: p.generatorId }, st, "en");
      expect(r2.ok).toBe(true);
      if (r2.ok)
        expect(Object.keys(r2.response.parts ?? {})).toEqual(
          p.parts.map((x) => x.key),
        );
    } else expect(r1.ok).toBe(true);
  });
  it("records the unit when the student switched it", () => {
    const p = generate("ifr.descentRate", 3);
    const st = {
      ...newCalcState({ generatorId: p.generatorId }, 3),
      input: "5",
      unit: "kt" as const,
    };
    const r = readResponse(p, { generatorId: p.generatorId }, st, "en");
    if (r.ok) expect(r.response.unit).toBe("kt");
    expect(askedUnit(p, { generatorId: p.generatorId })).toBe(p.unit);
  });
  it("writes the answer like a pilot, in the asked unit, with the tolerance", () => {
    const p = generate("ifr.sixtyToOne", 4242);
    const a = answerText(p, spec, "en");
    expect(a.answer).toMatch(/\d/);
    expect(a.tolerance).toMatch(/\d/);
    const fr = answerText(p, spec, "fr");
    expect(fr.answer).toMatch(/\d/);
  });
  it("hides internal switches from the givens", () => {
    expect(
      givenText(
        { key: "variant", label: L("Question"), value: "regain" },
        "en",
      ),
    ).toBeNull();
    expect(
      givenText(
        {
          key: "side",
          label: L("Side"),
          value: "R",
          display: L("right", "à droite"),
        },
        "fr",
      ),
    ).toBe("à droite");
    expect(
      givenText({ key: "d", label: L("Dist"), value: 45, unit: "NM" }, "en"),
    ).toMatch(/^45\s?NM$/u);
    expect(
      givenText({ key: "d", label: L("Dist"), value: 2.5, unit: "NM" }, "fr"),
    ).toMatch(/^2,5/);
  });
  it("never gives the answer away on the stage before the first Check", () => {
    const p = { ...generate("ifr.sixtyToOne", 4242) };
    const hint = {
      panes: [{ kind: "pfd" as const }] as [{ kind: "pfd" }],
      pose: {
        kind: "fields" as const,
        pos: { lat: 45, lon: 3 },
        altFt: 4000,
        hdg: 90,
        iasKt: 100,
      },
    };
    const d = {
      kind: "calc" as const,
      calc: { kind: "sixtyToOne" as const, course: 90, flownNm: 30, offNm: 3 },
    };
    // both: instrument only before, diagram + instrument after (diagram only on a narrow stage)
    expect(
      calcStageView({ ...p, stage: hint, diagram: d }, spec, false)?.kind,
    ).toBe("hint");
    const after = calcStageView(
      { ...p, stage: hint, diagram: d },
      spec,
      true,
      true,
    );
    expect(after?.kind === "hint" && after.hint.panes.length).toBe(2);
    expect(
      calcStageView({ ...p, stage: hint, diagram: d }, spec, true, false)?.kind,
    ).toBe("diagram");
    // a diagram alone is covered until then
    expect(
      calcStageView({ ...p, stage: undefined, diagram: d }, spec, false)?.kind,
    ).toBe("covered");
    expect(
      calcStageView({ ...p, stage: undefined, diagram: d }, spec, true)?.kind,
    ).toBe("diagram");
    expect(
      calcStageView({ ...p, stage: undefined, diagram: undefined }, spec),
    ).toBeNull();
    expect(
      calcStageView(
        { ...p, stage: hint, diagram: d },
        { ...spec, stage: "none" },
      ),
    ).toBeNull();
    expect(calcRevealed(undefined)).toBe(false);
    expect(calcRevealed({ ...newCalcState(spec), checks: 1 })).toBe(true);
    expect(calcRevealed({ ...newCalcState(spec), shown: 1 })).toBe(true);
  });
});

describe("verdict wording", () => {
  it("does not repeat the headline", () => {
    expect(mistakeText({ en: "Not quite. Compare your working.", fr: "Pas tout à fait. Comparez." }, "fr")).toEqual({ en: "Compare your working.", fr: "Comparez." });
    expect(mistakeText({ en: "You applied variation the wrong way." }, "en")).toEqual({ en: "You applied variation the wrong way.", fr: undefined });
  });
});

describe("quizzes", () => {
  it("numeric tolerance is inclusive", () => {
    expect(numericCorrect(318, 318, 0)).toBe(true);
    expect(numericCorrect(330, 318, 12)).toBe(true);
    expect(numericCorrect(331, 318, 12)).toBe(false);
    expect(numericCorrect(NaN, 318, 12)).toBe(false);
  });
  it("order: a deterministic shuffle that is never already in order", () => {
    for (let n = 2; n < 8; n++)
      for (let seed = 0; seed < 40; seed++) {
        const o = shuffledOrder(n, seed);
        expect([...o].sort((a, b) => a - b)).toEqual([...Array(n).keys()]);
        expect(orderCorrect(o)).toBe(false);
        expect(shuffledOrder(n, seed)).toEqual(o);
      }
    expect(orderCorrect([0, 1, 2])).toBe(true);
    expect(orderCorrect([])).toBe(false);
    expect(moveItem([0, 1, 2], 1, -1)).toEqual([1, 0, 2]);
    expect(moveItem([0, 1, 2], 2, 1)).toEqual([0, 1, 2]);
  });
  it("tap: an annotation id or a rectangle on the right pane", () => {
    const qa = {
      kind: "tap",
      prompt: L("p"),
      target: { annotation: "mda" },
      explain: L("e"),
    } as Extract<Quiz, { kind: "tap" }>;
    expect(tapCorrect(qa, "mda", 0, [0, 0])).toBe(true);
    expect(tapCorrect(qa, "da", 0, [0, 0])).toBe(false);
    const qr = {
      kind: "tap",
      prompt: L("p"),
      target: { pane: 1, rect: [100, 100, 50, 50] },
      explain: L("e"),
    } as Extract<Quiz, { kind: "tap" }>;
    expect(tapCorrect(qr, null, 1, [120, 140])).toBe(true);
    expect(tapCorrect(qr, null, 0, [120, 140])).toBe(false);
    expect(inRect([151, 120], [100, 100, 50, 50])).toBe(false);
  });
});

describe("drill run", () => {
  const spec: DrillSpec = {
    generatorIds: ["ifr.descentRate", "ifr.sixtyToOne", "ifr.standardRateBank"],
    count: 5,
    practiceOnly: true,
    seed: 77,
    timer: { mode: "perProblem", seconds: 30 },
  };
  it("a class drill (fixed seed) asks everyone the same problems", () => {
    const a = new DrillRun(spec);
    const b = new DrillRun(spec, 123456);
    expect(a.items).toEqual(b.items);
    expect(a.count).toBe(5);
    const c = new DrillRun({ ...spec, seed: undefined }, 1);
    const d = new DrillRun({ ...spec, seed: undefined }, 2);
    expect(c.items).not.toEqual(d.items);
  });
  it("scores right answers, skips and per-problem timeouts; never graded", () => {
    const r = new DrillRun(spec);
    r.start(0);
    expect(r.phase).toBe("question");
    const p0 = r.current!.problem;
    const parts = Object.fromEntries(
      (p0.parts ?? []).map((x) => [x.key, x.answer]),
    );
    expect(r.submit({ answer: p0.answer, parts }, 4000)?.ok).toBe(true);
    expect(r.phase).toBe("feedback");
    r.next(4500);
    r.skip(9000);
    r.next(9500);
    expect(r.timeLeft(9500)).toBe(30);
    expect(r.tick(39_600)).toBe(true); // timed out
    expect(r.current!.timedOut).toBe(true);
    r.next(40_000);
    const p3 = r.current!.problem;
    r.submit({ answer: p3.answer + 9999 }, 45_000);
    r.next(45_000);
    const p4 = r.current!.problem;
    const parts4 = Object.fromEntries(
      (p4.parts ?? []).map((x) => [x.key, x.answer]),
    );
    r.submit({ answer: p4.answer, parts: parts4 }, 50_000);
    r.next(50_000);
    expect(r.phase).toBe("done");
    const s = r.score();
    expect(s.total).toBe(5);
    expect(s.correct).toBe(2);
    expect(r.misses().length).toBe(3);
    const rec = r.record();
    expect(rec.count).toBe(5);
    expect(rec.correct).toBe(2);
    expect(rec.items[0].secs).toBe(4);
    expect(rec.items.every((i) => typeof i.seed === "number")).toBe(true);
    expect(r.elapsed(99_000)).toBe(50);
  });
  it("the total timer ends the drill and counts the rest as skipped", () => {
    const r = new DrillRun({ ...spec, timer: { mode: "total", seconds: 60 } });
    r.start(0);
    r.skip(1000);
    r.next(1000);
    expect(r.tick(30_000)).toBe(false);
    expect(r.tick(61_000)).toBe(true);
    expect(r.phase).toBe("done");
    expect(r.score().total).toBe(5);
    expect(r.score().correct).toBe(0);
  });
  it("feedback at the end goes straight to the next problem", () => {
    const r = new DrillRun({
      ...spec,
      feedback: "end",
      timer: { mode: "stopwatch" },
    });
    r.start(0);
    r.skip(10);
    expect(r.phase).toBe("question");
    expect(r.index).toBe(1);
    expect(r.timeLeft(20)).toBeNull();
    expect(r.tick(1e9)).toBe(false);
  });
  it("prints the clock like a pilot", () => {
    expect(clock(45, "en")).toBe("0:45");
    expect(clock(44.2, "en")).toBe("0:45");
    expect(clock(75, "fr")).toBe("1 min 15 s");
  });
});

describe("outline and progress", () => {
  const tr = step({ id: "t", kind: "try" });
  const ex = step({ id: "e", kind: "explain", minutes: 2 });
  const fl = step({ id: "f", kind: "fly", minutes: 7 });
  it("status from what the student did", () => {
    expect(stepStatus(ex, undefined, false)).toBe("todo");
    expect(stepStatus(ex, { visited: true }, false)).toBe("seen");
    expect(stepStatus(tr, { visited: true }, true)).toBe("current");
    expect(stepStatus(tr, { visited: true, goalMet: true }, false)).toBe(
      "done",
    );
    expect(
      stepStatus(tr, { visited: true, answered: true, correct: false }, false),
    ).toBe("missed");
    expect(
      stepStatus(fl, { visited: true, flown: { passed: false } }, false),
    ).toBe("missed");
    expect(
      stepStatus(fl, { visited: true, flown: { passed: true } }, false),
    ).toBe("done");
  });
  it("ticks: acting steps outlined, Fly it magenta", () => {
    expect(tickClass(tr, "todo")).toBe("do");
    expect(tickClass(fl, "todo")).toBe("fly");
    expect(tickClass(ex, "current")).toBe("now");
    expect(tickClass(tr, "missed")).toBe("do done miss");
    expect(courseMinutes([ex, fl, tr])).toBe(9);
    expect(markText(tr, { visited: true, goalMet: true }, "fr")).toBe(
      "Objectif atteint",
    );
    expect(markText(tr, undefined, "en")).toBe("");
  });
});

describe("Fly-it debrief", () => {
  const criteria: Criterion[] = [
    {
      id: "alt",
      label: L("Altitude within ±100 ft"),
      check: { id: "altBand", p: { min: 3900, max: 4100 } },
      acs: "IR.V.A",
    },
    {
      id: "est",
      label: L("Established within 3 NM"),
      check: { id: "dme", p: { min: 0, max: 3 } },
    },
    {
      id: "bar",
      label: L("Bar inside ¾ scale"),
      check: { id: "acsScale", p: { axis: "lat", frac: 0.75 } },
      acs: "IR.V.A",
    },
  ];
  const attempt: AttemptRecord = {
    courseId: "c",
    rev: 1,
    stepId: "f",
    profileId: "p",
    at: "2026-11-06T10:00:00Z",
    secs: 400,
    kind: "fly",
    fly: {
      token: "t",
      passed: false,
      selfGrade: "close",
      criteria: [
        { id: "alt", met: true, worst: "60 ft" },
        { id: "est", met: true, worst: "2.1 NM" },
        { id: "bar", met: false, worst: "full", atS: 130 },
      ],
    },
  };
  it("the headline counts the criteria met", () => {
    expect(attemptHeadline(attempt, criteria, "en")).toBe(
      "Not yet · 2 of 3 met",
    );
    expect(
      attemptHeadline(
        { ...attempt, fly: { ...attempt.fly!, passed: true } },
        criteria,
        "fr",
      ),
    ).toBe("Réussi · 2 sur 3 atteints");
  });
  it("criteria rows stay neutral until the student has graded themselves", () => {
    const before = criterionRows(criteria, attempt, "en", false);
    expect(before.map((r) => r.met)).toEqual([null, null, null]);
    expect(before[0].acs).toBe("ACS IR.V.A");
    expect(before[1].acs).toBe("course standard");
    const after = criterionRows(criteria, attempt, "en", true);
    expect(after.map((r) => r.met)).toEqual([true, true, false]);
    expect(after[0].value).toBe("worst 60 ft");
    expect(after[2].value).toBe("full at 2:10");
  });
  it("trace geometry maps time and value into the box", () => {
    const g = traceGeometry(
      {
        label: "CDI",
        samples: [
          { t: 0, v: -2 },
          { t: 90, v: 0 },
          { t: 180, v: 2.5 },
        ],
        band: [-1.875, 1.875],
        limit: { v: 2.5, label: "full" },
      },
      600,
      180,
    );
    expect(g.x(0)).toBeCloseTo(48);
    expect(g.x(180)).toBeCloseTo(584);
    expect(g.y(2.5)).toBeLessThan(g.y(0));
    expect(g.path.startsWith("M48.0")).toBe(true);
    expect(g.ticks).toEqual([0, 60, 120, 180]);
    expect(flownText(400, "en")).toBe("6 min 40 s");
  });
});

describe("player rules", () => {
  it("layout from the kind and the stage", () => {
    expect(layoutFor(step({ kind: "fly" }), false, false)).toBe("fly");
    expect(layoutFor(step({ kind: "try" }), true, false)).toBe("split");
    expect(layoutFor(step({ kind: "page" }), true, false)).toBe("stageWide");
    expect(layoutFor(step({ kind: "quiz" }), false, false)).toBe("readerOnly");
    expect(layoutFor(step({ kind: "drill" }), true, false)).toBe("readerOnly");
    const slide = step({
      kind: "slide",
      slide: { size: { w: 1920, h: 1080 }, blocks: [] },
    });
    expect(layoutFor(slide, false, true)).toBe("canvas");
    expect(layoutFor(slide, false, false)).toBe("readerOnly");
    expect(
      layoutFor(step({ kind: "explain", layout: "readerOnly" }), true, false),
    ).toBe("readerOnly");
  });
  it("refresher runs skip intro steps; a guidance level hides pages not meant for it", () => {
    const steps = [
      step({ id: "a", audience: "intro" }),
      step({ id: "b" }),
      step({ id: "c", levels: ["guided"] }),
    ];
    expect(visibleSteps(steps).map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(visibleSteps(steps, { refresher: true }).map((s) => s.id)).toEqual([
      "b",
      "c",
    ]);
    expect(visibleSteps(steps, { level: "solo" }).map((s) => s.id)).toEqual([
      "a",
      "b",
    ]);
  });
  it("assisted steps are never ACS-graded; the goal meter counts rows then the hold", () => {
    expect(
      assisted({
        panes: [{ kind: "pfd" }],
        mode: "live",
        assist: { holdAlt: true },
      }),
    ).toBe(true);
    expect(assisted({ panes: [{ kind: "pfd" }], mode: "live" })).toBe(false);
    const rows = [
      {
        check: 0,
        text: "",
        ticked: true,
        now: true,
        readout: "",
        current: false,
      },
      {
        check: 1,
        text: "",
        ticked: false,
        now: false,
        readout: "",
        current: true,
      },
      {
        check: -1,
        text: "",
        ticked: false,
        now: false,
        readout: "",
        current: false,
      },
    ];
    expect(
      goalProgress({
        rows,
        met: false,
        heldS: 0,
        holdS: 10,
        t: 0,
        metAtS: null,
      }),
    ).toBeCloseTo(1 / 3);
    expect(
      goalProgress({
        rows,
        met: false,
        heldS: 5,
        holdS: 10,
        t: 0,
        metAtS: null,
      }),
    ).toBeCloseTo(1.5 / 3);
    expect(
      goalProgress({ rows, met: true, heldS: 10, holdS: 10, t: 0, metAtS: 3 }),
    ).toBe(1);
    const q: Quiz = {
      kind: "mcq",
      prompt: L("p"),
      options: [],
      answer: 0,
      explain: L("e"),
    };
    expect(stepQuiz(step({ kind: "predict", quiz: q }))).toBe(q);
    expect(stepQuiz(step({ kind: "fly", quiz: q }))).toBeNull();
  });
});

describe("reader rules", () => {
  it("reveal positions and conditions", () => {
    const s = step({
      reader: [
        {
          t: "reveal",
          when: { step: 2 },
          blocks: [{ t: "reveal", when: { step: 3 }, blocks: [] }],
        },
        {
          t: "reveal",
          when: "answered",
          blocks: [{ t: "takeaway", text: L("tk") }],
        },
        { t: "keys", items: [L("k1")] },
      ],
      stage: {
        panes: [{ kind: "six" }],
        mode: "frozen",
        annotations: [
          {
            id: "a",
            pane: 0,
            type: "ring",
            rect: [0, 0, 1, 1],
            when: { step: 4 },
          },
        ],
      },
    });
    expect(revealCount(s)).toBe(4);
    expect(revealCount(step({}))).toBe(0);
    expect(
      hasPresenterReveal(
        step({ reader: [{ t: "reveal", when: "presenter", blocks: [] }] }),
      ),
    ).toBe(true);
    const base = {
      reveal: 1,
      answered: false,
      goalMet: false,
      presenter: false,
    };
    expect(revealShown({ step: 2 }, base)).toBe(false);
    expect(revealShown({ step: 1 }, base)).toBe(true);
    expect(revealShown("answered", { ...base, answered: true })).toBe(true);
    expect(revealShown("goalMet", base)).toBe(false);
    expect(takeawaysOf(s).map((t) => t.en)).toEqual(["tk", "k1"]);
    expect(hasDoThis(s.reader)).toBe(false);
    expect(
      hasDoThis([
        { t: "reveal", when: "answered", blocks: [{ t: "doThis", rows: [] }] },
      ]),
    ).toBe(true);
  });
  it("FR / EN: a missing French text falls back to English and says so", () => {
    expect(locText(L("Hello", "Bonjour"), "fr")).toEqual({
      text: "Bonjour",
      fallback: false,
    });
    expect(locText(L("Hello"), "fr")).toEqual({
      text: "Hello",
      fallback: true,
    });
    expect(locText(L("Hello"), "en")).toEqual({
      text: "Hello",
      fallback: false,
    });
    expect(ps("stepOf", "fr", { n: 3, total: 12 })).toBe("Étape 3 sur 12");
    expect(kindLabel("try", "fr")).toBe("À vous");
    expect(stepMeta(step({ kind: "calc", minutes: 3 }), "en")).toBe(
      "about 3 min · practice only, never graded",
    );
    expect(
      stepMeta(
        step({
          kind: "try",
          goal: { all: [], graded: true },
          stage: {
            panes: [{ kind: "six" }],
            mode: "live",
            assist: { holdAlt: true },
          },
        }),
        "en",
      ),
    ).toBe("not graded");
    expect(
      stepMeta(
        step({
          kind: "try",
          goal: { all: [], graded: true },
          stage: { panes: [{ kind: "six" }], mode: "live" },
        }),
        "en",
      ),
    ).toBe("practice, checked by the sim");
  });
});
