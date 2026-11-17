// Interactivity guard: every built-in course (the library's courses, the ready decks, the sample courses, the
// crafted briefings, and every starting template a new course is made from) keeps the student AND the presenter
// busy. Six rules, over every step:
//  (a) an interaction (« À vous », a question, a calculation, a control strip, a flight in the simulator, a tool)
//      at least every 3 steps;
//  (b) no frozen « live » instrument: a live instrument or a simulator view has student controls on the slide, an
//      « À vous », or an animation (canvas/motion.ts) to play;
//  (c) every « À vous » (on a slide, a Try it, a Fly it) has a goal with a tolerance and an end condition;
//  (d) every slide with a live block can be driven by the presenter: its situation resolves (the console's
//      « Piloter la démonstration » deck has an aircraft to fly);
//  (e) presenter notes on every step, or the console's fallback (« À dire », ui/presenterNotes.ts) builds at least
//      two points from the slide;
//  (f) every step has a title, in both languages.
// GUARD_REPORT=<file.md> writes the list of failures per course instead of failing (the report mode).
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  CalcProblem,
  Course,
  FlyIt,
  GoalCheck,
  SlideBlock,
  SlideCanvas,
  Step,
  StepGoal,
  YourTurn,
} from "../src/course/types";
import { SAMPLES } from "../src/course/samples";
import { isStudentAction } from "../src/course/samples/kit";
import { fallbackNotes } from "../src/course/ui/presenterNotes";
import { DECK_STARTERS, addStarterDeck } from "../src/course/ui/deckStarters";
import { stripControls } from "../src/course/canvas/controlStrip";
import { problemFor } from "../src/course/calc";
import { flyCriteria } from "../src/course/goals";

type Rule = "a" | "b" | "c" | "d" | "e" | "f";
interface Issue {
  rule: Rule;
  step: string;
  msg: string;
}

/** the block kinds the canvas has always had; any other kind is a tool block (a calculator, a model…): interactive */
const BASE_KINDS = new Set([
  "text",
  "image",
  "shape",
  "arrow",
  "callout",
  "marker",
  "diagram",
  "instrument",
  "simViewport",
  "quiz",
  "calc",
  "checklist",
]);

type Inst = Extract<SlideBlock, { kind: "instrument" }>;
type View = Extract<SlideBlock, { kind: "simViewport" }>;

const sceneOf = (b: Inst | View, slide: SlideCanvas): string | undefined =>
  b.scene ?? slide.scene;

/** the live strip a student turns on the slide (canvas/controlStrip.ts) */
const hasStrip = (b: SlideBlock): boolean =>
  b.kind === "instrument" &&
  b.mode === "live" &&
  stripControls(b.controls).length > 0 &&
  b.strip !== "hidden";

/** an animation plays on this situation (the block's own, or another instrument's of the slide on the same one) */
function animated(b: Inst | View, slide: SlideCanvas): boolean {
  if (b.kind === "instrument" && (b.motion?.preset || b.motion?.script))
    return true;
  const sc = sceneOf(b, slide);
  return slide.blocks.some(
    (x) =>
      x.kind === "instrument" &&
      !x.fromCalc &&
      !!(x.motion?.preset || x.motion?.script) &&
      sceneOf(x, slide) === sc,
  );
}

/** the situation flies by itself, visibly: a descent or a climb, a bank, or a failure running (the needles move
 *  with nobody at the controls) */
function sceneMoves(c: Course, b: Inst | View, slide: SlideCanvas): boolean {
  const failing = (f: object | undefined) => Object.values(f ?? {}).some(Boolean);
  if (b.kind === "instrument" && failing(b.failures)) return true;
  const sc = c.scenes[sceneOf(b, slide) ?? ""];
  if (!sc) return false;
  if (failing(sc.failures)) return true;
  const p = sc.pose;
  return p.kind === "fields" && (Math.abs(p.vsFpm ?? 0) >= 100 || Math.abs(p.bank ?? 0) >= 5);
}

/** a live block: an instrument that flies (live, or animated), or a simulator view */
const isLive = (b: SlideBlock, slide: SlideCanvas): b is Inst | View =>
  b.kind === "simViewport" ||
  (b.kind === "instrument" && (b.mode === "live" || animated(b, slide)));

function interactive(s: Step): boolean {
  if (isStudentAction(s) || s.flyIt) return true;
  return !!s.slide?.blocks.some((b) => hasStrip(b) || !BASE_KINDS.has(b.kind));
}

/** a check with a tolerance (a band, a ± value, a deviation limit) */
function toleranced(c: GoalCheck): boolean {
  const p = (c as { p?: Record<string, unknown> }).p ?? {};
  const n = (k: string) =>
    typeof p[k] === "number" ? (p[k] as number) : undefined;
  if ((n("tol") ?? 0) > 0) return true;
  if ((n("maxDots") ?? 0) > 0 || (n("frac") ?? 0) > 0) return true;
  const lo = n("min");
  const hi = n("max");
  if (lo !== undefined && hi !== undefined) return hi > lo;
  if (c.id === "bankMax" && (hi ?? 0) > 0) return true;
  if (c.id === "distTo" && (n("maxNm") ?? 0) > 0) return true;
  return false;
}
function goalIssue(g: StepGoal | undefined): string | null {
  if (!g || !g.all.length) return "no goal";
  if (!g.all.some(toleranced)) return "no goal check with a tolerance";
  return null;
}
function yourTurnIssues(yt: YourTurn): string[] {
  const out: string[] = [];
  const g = goalIssue(yt.goal);
  if (g) out.push(g);
  // the run ends: the goal held for a while (the whole goal, or a row's own hold), or a stop condition / time
  const rowHold = (yt.goal?.all ?? []).some(
    (c) => ((c as { p?: { holdS?: unknown } }).p?.holdS as number) > 0,
  );
  const end =
    (yt.endWhen?.length ?? 0) > 0 ||
    (yt.durationS ?? 0) > 0 ||
    (yt.goal?.holdS ?? 0) > 0 ||
    rowHold;
  if (!end) out.push("no end condition (a hold, endWhen or durationS)");
  return out;
}
/** the problem a calc step poses (its fixed seed, else a sample one): what a linked Try it / Fly it checks */
function calcProblemOf(c: Course, stepId: string): CalcProblem | undefined {
  const spec = c.steps.find((x) => x.id === stepId)?.calc;
  if (!spec) return undefined;
  try {
    return problemFor(spec, spec.seed ?? 1);
  } catch {
    return undefined;
  }
}
function flyItIssues(c: Course, f: FlyIt): string[] {
  const t = f.target;
  // a lesson, a circuit, a procedure or a scenario: the engine grades and ends it
  if (t.kind !== "scene" && t.kind !== "calc") return [];
  const out: string[] = [];
  // the criteria the flight checks: the author's, else (a calc target) the solved problem's stage goals
  const crit = flyCriteria(f, t.kind === "calc" ? calcProblemOf(c, t.step) : undefined);
  if (!crit.length || !crit.some((x) => toleranced(x.check)))
    out.push("Fly it: no criterion with a tolerance");
  const end =
    t.kind === "scene"
      ? (t.endWhen?.length ?? 0) > 0 || (t.durationS ?? 0) > 0
      : true;
  if (!end) out.push("Fly it: no end condition (endWhen or durationS)");
  return out;
}

function guard(c: Course): Issue[] {
  const out: Issue[] = [];
  const add = (rule: Rule, step: Step, msg: string) =>
    out.push({
      rule,
      step: `#${c.steps.indexOf(step) + 1} ${step.id} « ${step.title?.fr ?? step.title?.en ?? ""} »`,
      msg,
    });
  const calcSteps = new Set(
    c.steps.filter((s) => s.kind === "calc").map((s) => s.id),
  );
  let run = 0;
  for (const s of c.steps) {
    // (f) a title
    if (!s.title?.en?.trim() || !s.title?.fr?.trim())
      add("f", s, "no title (en and fr)");
    // (a) an interaction at least every 3 steps
    run = interactive(s) ? 0 : run + 1;
    if (run >= 3) add("a", s, "third step in a row without an interaction");
    // (e) presenter notes
    const notes = !!(s.notes?.en?.trim() && s.notes?.fr?.trim());
    if (!notes && fallbackNotes(s, "fr").length < 2)
      add(
        "e",
        s,
        `no presenter notes (fallback gives ${fallbackNotes(s, "fr").length})`,
      );
    // (c) every « À vous »
    if (s.kind === "try" && !s.slide) {
      // the goal: the step's, else the linked calculation's stage goals, else the question asked on the stage (a
      // number with its tolerance: « set 29.92 and read the altimeter »)
      const linked =
        s.calcLink && s.calcLink.use !== "stage"
          ? calcProblemOf(c, s.calcLink.step)?.stage?.goals
          : undefined;
      const goal = s.goal ?? (linked?.length ? { all: linked, graded: false } : undefined);
      const asked = s.quiz?.kind === "numeric" && s.quiz.tol > 0;
      const g = goalIssue(goal);
      if (g && !asked) add("c", s, `Try it: ${g}`);
    }
    if (s.flyIt) for (const m of flyItIssues(c, s.flyIt)) add("c", s, m);
    const slide = s.slide;
    if (s.stage?.mode === "live" && !slide) {
      // (b) a live stage: something to turn, or the presenter's actions
      if (!s.stage.controls?.length && !s.stage.presenter?.length && !s.goal)
        add("b", s, "live stage without controls, goal or presenter actions");
      if (s.stage.scene && !c.scenes[s.stage.scene])
        add("d", s, `stage scene ${s.stage.scene} is missing`);
    }
    if (!slide) continue;
    for (const b of slide.blocks) {
      if ((b.kind === "instrument" || b.kind === "simViewport") && b.yourTurn)
        for (const m of yourTurnIssues(b.yourTurn))
          add("c", s, `« À vous » ${b.id}: ${m}`);
      if (!isLive(b, slide)) continue;
      // (b) no frozen live block
      const sc = sceneOf(b, slide);
      const driven =
        !!b.yourTurn ||
        hasStrip(b) ||
        animated(b, slide) ||
        (b.kind === "instrument" && sceneMoves(c, b, slide)) ||
        (b.kind === "simViewport" &&
          (!!b.clip ||
            slide.blocks.some(
              (x) =>
                hasStrip(x) &&
                x.kind === "instrument" &&
                sceneOf(x, slide) === sc,
            )));
      if (!driven)
        add(
          "b",
          s,
          `${b.kind} ${b.id} is live with no controls, « À vous » or animation`,
        );
      // (d) the presenter can fly it: the situation resolves
      if (b.kind === "instrument" && b.fromCalc) {
        if (!calcSteps.has(b.fromCalc))
          add("d", s, `${b.id}: fromCalc ${b.fromCalc} is not a calc step`);
      } else if (sc && !c.scenes[sc])
        add("d", s, `${b.id}: scene ${sc} is not in the course`);
    }
  }
  return out;
}

// ------------------------------------------------------------------ every built-in course
const blank = (id: string): Course => ({
  format: "ifr-course",
  version: 1,
  id,
  rev: 0,
  updated: "2026-11-17T10:00:00Z",
  title: { en: "New course", fr: "Nouveau cours" },
  author: { name: "Guard" },
  langs: ["en", "fr"],
  cockpit: "g1000",
  world: { kind: "training" },
  steps: [],
  scenes: {},
  clips: {},
  assets: {},
});
interface Entry {
  id: string;
  group: string;
  build: () => Course;
}
const ENTRIES: Entry[] = [
  ...SAMPLES.map(
    (s): Entry => ({
      id: s.id,
      group: s.program ? `library (${s.program})` : "sample",
      build: s.build,
    }),
  ),
  ...DECK_STARTERS.map(
    (d): Entry => ({
      id: `starter:${d.id}`,
      group: "starting template",
      build: () => addStarterDeck(blank(`starter-${d.id}`), d).course,
    }),
  ),
];

const REPORT = process.env.GUARD_REPORT;
if (REPORT) {
  it("writes the guard report", () => {
    const lines: string[] = ["# Interactivity guard — report", ""];
    let total = 0;
    const bad: string[] = [];
    for (const e of ENTRIES) {
      const issues = guard(e.build());
      total += issues.length;
      if (!issues.length) continue;
      bad.push(e.id);
      const by = (r: Rule) => issues.filter((i) => i.rule === r).length;
      lines.push(
        `## ${e.id} — ${e.group} — ${issues.length} (a ${by("a")}, b ${by("b")}, c ${by("c")}, d ${by("d")}, e ${by("e")}, f ${by("f")})`,
        "",
      );
      for (const i of issues)
        lines.push(`- (${i.rule}) \`${i.step}\`: ${i.msg}`);
      lines.push("");
    }
    lines.splice(
      2,
      0,
      `${ENTRIES.length} courses checked, ${bad.length} failing, ${total} issues.`,
      "",
    );
    writeFileSync(REPORT, lines.join("\n"));
    expect(ENTRIES.length).toBeGreaterThan(0);
  });
} else {
  describe("interactivity guard", () => {
    it("enumerates every built-in course and starting template", () => {
      expect(ENTRIES.length).toBeGreaterThan(40);
      expect(ENTRIES.some((e) => e.group.startsWith("library"))).toBe(true);
      expect(ENTRIES.some((e) => e.group === "starting template")).toBe(true);
    });
    for (const e of ENTRIES)
      it(`${e.id} keeps the student and the presenter busy`, () => {
        const issues = guard(e.build()).map(
          (i) => `(${i.rule}) ${i.step}: ${i.msg}`,
        );
        expect(issues).toEqual([]);
      });
  });
}

// the rules themselves (so a course cannot pass by an empty check)
describe("interactivity guard rules", () => {
  const step = (over: Partial<Step>): Step => ({
    id: "s",
    kind: "slide",
    title: { en: "T", fr: "T" },
    reader: [],
    ...over,
  });
  it("flags three steps in a row without an interaction, and a step without a title", () => {
    const c = blank("x");
    c.steps = [
      step({ id: "1" }),
      step({ id: "2" }),
      step({ id: "3", title: { en: "", fr: "" } }),
    ];
    const r = guard(c);
    expect(r.some((i) => i.rule === "a" && i.step.startsWith("#3 3 "))).toBe(true);
    expect(r.some((i) => i.rule === "f" && i.step.startsWith("#3 3 "))).toBe(true);
  });
  it("flags a live instrument nobody can move, and an « À vous » without tolerance or end", () => {
    const c = blank("x");
    const frame = { x: 0, y: 0, w: 600, h: 400, z: 1 };
    c.steps = [
      step({
        slide: {
          size: { w: 1920, h: 1080 },
          scene: "nope",
          blocks: [
            {
              id: "i",
              kind: "instrument",
              frame,
              view: { kind: "gauge", gauge: "ai" },
              mode: "live",
            },
            {
              id: "y",
              kind: "instrument",
              frame,
              view: { kind: "gauge", gauge: "hsi" },
              yourTurn: {
                where: "slide",
                prompt: { en: "p", fr: "p" },
                goal: {
                  all: [{ id: "toFrom", p: { value: "TO" } }],
                  graded: false,
                },
              },
            },
          ],
        },
      }),
    ];
    const r = guard(c);
    expect(r.some((i) => i.rule === "b")).toBe(true);
    expect(r.some((i) => i.rule === "c" && /tolerance/.test(i.msg))).toBe(true);
    expect(r.some((i) => i.rule === "c" && /end condition/.test(i.msg))).toBe(
      true,
    );
    expect(r.some((i) => i.rule === "d")).toBe(true);
  });
});
