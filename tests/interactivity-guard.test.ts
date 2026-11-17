// Interactivity guard: every built-in course (the library's courses, the ready decks, the sample courses, the
// crafted briefings, and every starting template a new course is made from) keeps the student AND the presenter
// busy. Six rules, over every step:
//  (a) an interaction (« À vous », a question, a calculation, a control strip, a flight in the simulator, a tool)
//      at least every 3 steps;
//  (b) no frozen « live » instrument: a live instrument or a simulator view has student controls on the slide, an
//      « À vous », or an animation (canvas/motion.ts) to play;
//  (c) every « À vous » (on a slide, a Try it, a Fly it) has a goal with a tolerance and an end condition, and is
//      not already met before the student acts (its situation at rest does not satisfy every check);
//  (d) every slide with a live block can be driven by the presenter: its situation resolves (the console's
//      « Piloter la démonstration » deck has an aircraft to fly);
//  (e) presenter notes on every step, or the console's fallback (ui/presenterNotes.ts) builds at least two lines,
//      one of them more than the slide read aloud (« À dire »): an objective, an answer, a calculation's rule, how
//      to teach this kind of slide, or the author's note;
//  (f) every step has a title, in both languages.
// A teaching tool (course/tools) counts as an interaction when the student gets at least one of its controls, and
// its task (when it has one) must be reachable from its starting values and not already met; a 3D engine
// (course/engines) counts when the student gets at least one lever. A still tool or a watch-only engine is a
// picture, like a diagram.
// Besides the courses, what a creator adds from the studio is checked the same way (every rule but (a), which is
// about a whole course): each layout of « Mise en page » / « Tous les modèles » made into a step as the studio makes
// it, and each ready slide « Que voulez-vous montrer ? » offers a new slide (IFR and VFR courses).
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
import { LIBRARY_COURSES } from "../src/course/samples/library";
import { AIRFIELD_DECKS, DECKS } from "../src/course/samples/decks";
import { isStudentAction } from "../src/course/samples/kit";
import { fallbackNotes, slideNotes } from "../src/course/ui/presenterNotes";
import { DECK_STARTERS, addStarterDeck } from "../src/course/ui/deckStarters";
import { stripControls } from "../src/course/canvas/controlStrip";
import { problemFor } from "../src/course/calc";
import { evaluate, flyCriteria, GoalTracker, stageView } from "../src/course/goals";
import { LAYOUTS } from "../src/course/canvas/layouts";
import { linearText, makeStep, starterScene } from "../src/course/ui/templates";

const starter = starterScene("g1000", "s");
import { EMPTY_STARTS, EMPTY_STARTS_VFR } from "../src/course/ui/studio";
import { showcaseScenes, startSlides } from "../src/course/samples/showcaseDecks";
import { Sim, type Failures } from "../src/sim/sim";
import { applyScene } from "../src/course/scene";
import { liveControls, taskCheck, toolDef } from "../src/course/tools/index";
import { gallerySlides, galleryScenes } from "../src/course/samples/exampleSlides";

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
  // the teaching tools and the 3D engines: interactive only with something for the student's hands (handsOn)
  "tool",
  "engine3d",
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
  if (p.kind === "fields") return Math.abs(p.vsFpm ?? 0) >= 100 || Math.abs(p.bank ?? 0) >= 5;
  // an exact pose (a capture, a ready situation): ask the flight model
  try {
    const sim = new Sim();
    applyScene(sim, sc);
    sim.updateAvionics(0);
    return Math.abs(sim.ac.data.vsFpm) >= 100 || Math.abs(sim.ac.data.rollDeg) >= 5;
  } catch {
    return false;
  }
}

/** a live block: an instrument that flies (live, or animated), or a simulator view */
const isLive = (b: SlideBlock, slide: SlideCanvas): b is Inst | View =>
  b.kind === "simViewport" ||
  (b.kind === "instrument" && (b.mode === "live" || animated(b, slide)));

/** a teaching tool the student works (at least one control of theirs), or a 3D engine with levers of theirs */
function handsOn(b: SlideBlock): boolean {
  if (b.kind === "tool") {
    const d = toolDef(b.tool);
    return !!d && liveControls(d, b).length > 0;
  }
  if (b.kind === "engine3d") return b.controls === undefined || b.controls.length > 0;
  return false;
}
function interactive(s: Step): boolean {
  if (isStudentAction(s) || s.flyIt) return true;
  return !!s.slide?.blocks.some((b) => hasStrip(b) || handsOn(b) || !BASE_KINDS.has(b.kind));
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
/**
 * The « À vous » on a slide solves itself: every check of its goal is already true in its situation at rest (the
 * slide opens on the answer), or — `handsOff` — the goal is met within its hold + 40 s with nobody at the controls
 * (the aircraft drifts through the answer). A flight in the simulator (`where: "sim"`) is not concerned: its
 * criteria are graded over the whole run, which starts inside them on purpose (« keep the bar within a dot »).
 */
function solvesItself(c: Course, yt: YourTurn, b: Inst | View, slide: SlideCanvas, handsOff: boolean): string | null {
  if (yt.where === "sim") return null;
  const sc = c.scenes[yt.scene ?? sceneOf(b, slide) ?? ""];
  if (!sc || !yt.goal?.all.length) return null;
  try {
    const sim = new Sim();
    applyScene(sim, sc);
    const failures = b.kind === "instrument" ? b.failures : undefined;
    for (const [f, on] of Object.entries(failures ?? {}))
      if (on) sim.setFailure(f as keyof Failures, true);
    sim.updateAvionics(0);
    if (yt.goal.all.every((ch) => evaluate(ch, stageView(sim), {})))
      return "its goal is already met before the student acts";
    if (!handsOff) return null;
    const tr = new GoalTracker(yt.goal, "fr");
    const lim = (yt.goal.holdS ?? 0) + 40;
    for (let t = 0; t < lim; t += 0.2) {
      sim.step(0.2);
      if (tr.update(stageView(sim), 0.2).met)
        return `its goal is met hands off after ${Math.round(t)} s`;
    }
    return null;
  } catch {
    return null;
  }
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
  const problem = t.kind === "calc" ? calcProblemOf(c, t.step) : undefined;
  const crit = flyCriteria(f, problem);
  // a flight on the student's own numbers: the number is checked with its tolerance in the calculation first (the
  // flight will not start before), the flight then ends at its milestone (« Pass ARD »)
  const solved = t.kind === "calc" && (problem?.tolerance ?? 0) > 0 && crit.length > 0;
  if (!solved && (!crit.length || !crit.some((x) => toleranced(x.check))))
    out.push("Fly it: no criterion with a tolerance");
  const end =
    t.kind === "scene"
      ? (t.endWhen?.length ?? 0) > 0 || (t.durationS ?? 0) > 0
      : true;
  if (!end) out.push("Fly it: no end condition (endWhen or durationS)");
  return out;
}

function guard(c: Course, o: { skip?: readonly Rule[]; handsOff?: boolean } = {}): Issue[] {
  const out: Issue[] = [];
  const add = (rule: Rule, step: Step, msg: string) =>
    o.skip?.includes(rule) ||
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
    // the fallback counts when it gives two lines and one of them is more than the slide read aloud (« À dire ») —
    // an objective, an answer, a calculation's rule, how to teach this kind of slide or the author's note
    const notes = !!(s.notes?.en?.trim() && s.notes?.fr?.trim());
    const fb = fallbackNotes(s, "fr");
    if (!notes && (fb.length < 2 || fb.every((l) => l.startsWith("À dire"))))
      add(
        "e",
        s,
        `no presenter notes (fallback gives ${fb.length}${fb.length ? `, ${fb.filter((l) => !l.startsWith("À dire")).length} beyond « À dire »` : ""})`,
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
      // (c) a tool's task: the student can meet it from where it starts, and it is not met before they act
      if (b.kind === "tool") {
        const d = toolDef(b.tool);
        if (!d) add("d", s, `tool ${b.id}: unknown tool ${b.tool}`);
        else {
          const t = taskCheck(d, b);
          if (t === "met") add("c", s, `tool ${b.id}: its task is already met before the student acts`);
          else if (t === "impossible") add("c", s, `tool ${b.id}: its task cannot be met`);
          else if (t === "noControl") add("c", s, `tool ${b.id}: the student does not get the task's control`);
        }
      }
      if ((b.kind === "instrument" || b.kind === "simViewport") && b.yourTurn) {
        for (const m of yourTurnIssues(b.yourTurn))
          add("c", s, `« À vous » ${b.id}: ${m}`);
        const solved = solvesItself(c, b.yourTurn, b, slide, o.handsOff ?? false);
        if (solved) add("c", s, `« À vous » ${b.id}: ${solved}`);
      }
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
  /** rules that do not apply (a single slide has no « every 3 steps ») */
  skip?: Rule[];
  /** the « À vous » are also flown hands off (what creators start from: the templates, the layouts, the slides) */
  handsOff?: boolean;
}
/** a course of one slide, as the studio adds it: a layout through makeStep (its scene, its practice situation) */
const layoutCourse = (id: (typeof LAYOUTS)[number]["id"]): Course => {
  const r = makeStep(blank(`layout-${id}`), "slide", { layout: id });
  return { ...r.course, steps: [r.step] };
};
/** …and a ready slide of « Que voulez-vous montrer ? », with the situations the editor adds with it */
const startCourse = (id: string): Course => {
  const ex = startSlides().find((g) => g.id === id);
  if (!ex) throw new Error(`no start slide ${id}`);
  const all = showcaseScenes();
  const used = new Set<string>();
  const walk = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    for (const [k, v] of Object.entries(x as Record<string, unknown>))
      if (k === "scene" && typeof v === "string") used.add(v);
      else walk(v);
  };
  walk(ex.slide);
  const scenes = Object.fromEntries([...used].filter((u) => all[u]).map((u) => [u, all[u]]));
  const slide = JSON.parse(JSON.stringify(ex.slide)) as SlideCanvas;
  // the editor gives a ready slide the console's notes for its kind (editor.ts addComposedSlide)
  const step: Step = {
    id: `st-${id}`,
    kind: "slide",
    title: { ...ex.title },
    slide,
    reader: linearText(slide),
    notes: slideNotes(slide),
  };
  return { ...blank(`start-${id}`), scenes, steps: [step] };
};
/** …and a ready slide of the gallery (« Modèles »: the teaching tools, the 3D engines…), as the editor adds it */
const galleryCourse = (id: string): Course => {
  const ex = gallerySlides().find((g) => g.id === id);
  if (!ex) throw new Error(`no gallery slide ${id}`);
  const all = galleryScenes();
  const used = new Set<string>();
  const walk = (x: unknown) => {
    if (!x || typeof x !== "object") return;
    for (const [k, v] of Object.entries(x as Record<string, unknown>))
      if (k === "scene" && typeof v === "string") used.add(v);
      else walk(v);
  };
  walk(ex.slide);
  const scenes = Object.fromEntries([...used].filter((u) => all[u]).map((u) => [u, all[u]]));
  const slide = JSON.parse(JSON.stringify(ex.slide)) as SlideCanvas;
  const step: Step = {
    id: `st-${id}`,
    kind: "slide",
    title: { ...ex.title, fr: ex.title.fr ?? ex.title.en },
    slide,
    reader: linearText(slide),
    notes: slideNotes(slide),
  };
  return { ...blank(`gallery-${id}`), scenes, steps: [step] };
};
const GALLERY_IDS = gallerySlides().map((g) => g.id);
const START_IDS = [...new Set([...EMPTY_STARTS, ...EMPTY_STARTS_VFR])];
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
      handsOff: true,
    }),
  ),
  ...LAYOUTS.map(
    (l): Entry => ({
      id: `layout:${l.id}`,
      group: "studio layout",
      build: () => layoutCourse(l.id),
      // the blank layout has nothing to say yet: its notes are the creator's to write
      skip: l.id === "blank" ? ["a", "e"] : ["a"],
      handsOff: true,
    }),
  ),
  ...START_IDS.map(
    (id): Entry => ({
      id: `new-slide:${id}`,
      group: "new-slide suggestion",
      build: () => startCourse(id),
      skip: ["a"],
      handsOff: true,
    }),
  ),
  ...GALLERY_IDS.map(
    (id): Entry => ({
      id: `gallery:${id}`,
      group: "gallery slide",
      build: () => galleryCourse(id),
      skip: ["a"],
      handsOff: true,
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
      const issues = guard(e.build(), e);
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
      // the library's own list (every sample, library course, ready deck and briefing) plus every starting template
      expect(ENTRIES.length).toBe(
        SAMPLES.length + DECK_STARTERS.length + LAYOUTS.length + START_IDS.length + GALLERY_IDS.length,
      );
      // the ready tool and engine slides of « Modèles » are in
      expect(ENTRIES.filter((e) => e.id.startsWith("gallery:gx-tool-")).length).toBeGreaterThanOrEqual(11);
      expect(ENTRIES.filter((e) => e.id.startsWith("gallery:gx-engine-")).length).toBeGreaterThanOrEqual(4);
      expect(ENTRIES.some((e) => e.id === "layout:checklist")).toBe(true);
      expect(ENTRIES.some((e) => e.id === "layout:yourTurn")).toBe(true);
      for (const d of [...LIBRARY_COURSES, ...DECKS, ...AIRFIELD_DECKS])
        expect(ENTRIES.some((e) => e.id === d.id), d.id).toBe(true);
      expect(ENTRIES.some((e) => e.group.startsWith("library"))).toBe(true);
      expect(ENTRIES.some((e) => e.group === "starting template")).toBe(true);
    });
    for (const e of ENTRIES)
      it(`${e.id} keeps the student and the presenter busy`, () => {
        const issues = guard(e.build(), e).map(
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
  it("flags an « À vous » already met before the student acts, and one that is met hands off", () => {
    const c = blank("x");
    c.scenes = { s: starter };
    const frame = { x: 0, y: 0, w: 600, h: 600, z: 1 };
    const turn = (all: GoalCheck[]): Step =>
      step({
        notes: { en: "n", fr: "n" },
        slide: {
          size: { w: 1920, h: 1080 },
          scene: "s",
          blocks: [
            {
              id: "y",
              kind: "instrument",
              frame,
              view: { kind: "gauge", gauge: "hsi" },
              mode: "live",
              controls: ["obs1"],
              yourTurn: { where: "slide", prompt: { en: "p", fr: "p" }, goal: { all, holdS: 3, graded: false } },
            },
          ],
        },
      });
    // the starter pose: OBS 090 with a TO flag, heading 120 (FAA intercept picture)
    c.steps = [turn([{ id: "obs", p: { nav: 1, value: 90, tol: 3 } }, { id: "toFrom", p: { value: "TO" } }])];
    expect(guard(c).some((i) => i.rule === "c" && /already met/.test(i.msg))).toBe(true);
    // heading 120 is held by the trimmed aircraft: nothing to do but wait
    c.steps = [turn([{ id: "heading", p: { value: 120, tol: 5 } }, { id: "obs", p: { nav: 1, value: 200, tol: 3 } }])];
    expect(guard(c).some((i) => i.rule === "c")).toBe(false);
    c.steps = [turn([{ id: "heading", p: { value: 120, tol: 5 } }, { id: "altBand", p: { min: 3800, max: 4200 } }])];
    expect(guard(c, { handsOff: true }).some((i) => i.rule === "c" && /already met|hands off/.test(i.msg))).toBe(true);
  });
  it("counts a tool or an engine the student works, not a still one, and flags a tool task met at rest", () => {
    const frame = { x: 0, y: 0, w: 1200, h: 700, z: 1 };
    const one = (b: SlideBlock): Step =>
      step({ notes: { en: "n", fr: "n" }, slide: { size: { w: 1920, h: 1080 }, blocks: [b] } });
    const run = (b: SlideBlock) => {
      const c = blank("x");
      c.steps = [one(b), one(b), one(b)];
      return guard(c);
    };
    const wing = { id: "t", kind: "tool", tool: "wing", frame } as const;
    expect(run({ ...wing }).some((i) => i.rule === "a")).toBe(false);
    expect(run({ ...wing, controls: [] }).some((i) => i.rule === "a")).toBe(true);
    const eng = { id: "e", kind: "engine3d", engine: "piston", frame } as const;
    expect(run({ ...eng }).some((i) => i.rule === "a")).toBe(false);
    expect(run({ ...eng, controls: [] }).some((i) => i.rule === "a")).toBe(true);
    // the wing's own task (find the critical angle, about 18° flaps up) started on the answer
    const task = { prompt: { en: "p", fr: "p" }, key: "alpha" };
    expect(run({ ...wing, p: { alpha: 18 }, task }).some((i) => i.rule === "c" && /already met/.test(i.msg))).toBe(
      true,
    );
    expect(run({ ...wing, p: { alpha: 4 }, task }).some((i) => i.rule === "c")).toBe(false);
    expect(run({ ...wing, controls: ["ias"], task }).some((i) => i.rule === "c" && /control/.test(i.msg))).toBe(true);
  });
  it("does not count notes that only read the slide aloud", () => {
    const c = blank("x");
    c.steps = [
      step({
        slide: {
          size: { w: 1920, h: 1080 },
          blocks: [
            { id: "a", kind: "text", style: "body", frame: { x: 0, y: 0, w: 900, h: 100, z: 1 }, text: { en: "The needle points at the beacon all the time", fr: "L’aiguille pointe la balise en permanence" } },
            { id: "b", kind: "text", style: "body", frame: { x: 0, y: 200, w: 900, h: 100, z: 1 }, text: { en: "The heading changes, the bearing does not", fr: "Le cap change, le relèvement ne change pas" } },
          ],
        },
      }),
    ];
    expect(fallbackNotes(c.steps[0], "fr").length).toBeGreaterThanOrEqual(2);
    expect(guard(c).some((i) => i.rule === "e")).toBe(true);
  });
});
