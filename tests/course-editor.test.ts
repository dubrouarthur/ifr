// Ground school editor (package F): the pure parts. Templates by teaching intent (each makes a step the validator
// accepts), kind changes that keep author content, designed slide ↔ Reader + Stage conversion, step edits
// (insert / move / duplicate / remove), tray captures to steps, the course undo history, step facts for the step
// bar, and the checks panel (pacing runs, missing French, stale AIRAC, validator errors).
import { describe, expect, it } from "vitest";
import type { Course, SimScene, StageCue, Step } from "../src/course/types";
import {
  CourseHistory,
  TEMPLATES,
  changeKind,
  courseMissingFr,
  duplicateStep,
  inspectorTabs,
  insertStep,
  linearText,
  makeStep,
  minutesOf,
  moveStep,
  newCallout,
  paneOfView,
  quizOfKind,
  removeStep,
  renumberCallouts,
  revealsOf,
  stepBarText,
  stepFromTray,
  templateOf,
  toDesignedSlide,
  toReaderStage,
  viewOfPane,
  type TemplateId,
} from "../src/course/ui/templates";
import {
  airacAge,
  airacCycle,
  airacIndex,
  checksForStep,
  editorChecks,
  pacingRuns,
  pacingText,
} from "../src/course/ui/checksPanel";
import { validateCourse } from "../src/course/validate";
import { sceneFromFields } from "../src/course/scene";

const L = (en: string, fr?: string) => (fr === undefined ? { en } : { en, fr });
let seq = 0;
const gen = (p: string) => `${p}-${++seq}`;

function course(over: Partial<Course> = {}): Course {
  return {
    format: "ifr-course",
    version: 1,
    id: "t-course",
    rev: 1,
    updated: "2026-11-06T10:00:00Z",
    title: L("Test course", "Cours de test"),
    author: { name: "J. Martin" },
    langs: ["en", "fr"],
    cockpit: "g1000",
    world: { kind: "training" },
    steps: [],
    scenes: {},
    clips: {},
    assets: {},
    ...over,
  };
}
function scene(id: string, airac?: string): SimScene {
  const s = sceneFromFields(
    {
      kind: "fields",
      pos: { fix: "ARD", radial: 90, distNm: 8 },
      altFt: 3000,
      hdg: 270,
      iasKt: 100,
      radios: { nav1: "ARD", obs1: 270, cdi: "NAV1" },
    },
    { id, label: `scene ${id}` },
  );
  if (airac) s.refs = { airac };
  return s;
}
const page = (id: string): Step => ({
  id,
  kind: "explain",
  title: L(`Explain ${id}`, `Expliquer ${id}`),
  reader: [{ t: "text", text: L("Some words", "Quelques mots") }],
});

describe("templates by teaching intent", () => {
  const ids = TEMPLATES.map((t) => t.id);
  it("offers the ten intents plus designed slides", () => {
    expect(ids).toEqual([
      "explain",
      "predict",
      "watch",
      "try",
      "tap",
      "quiz",
      "calc",
      "drill",
      "fly",
      "page",
      "slide",
    ]);
    for (const t of TEMPLATES) {
      expect(t.title.fr).toBeTruthy();
      expect(t.intent.fr).toBeTruthy();
    }
  });
  it.each(ids as TemplateId[])(
    "%s makes a step the validator accepts",
    (id) => {
      const r = makeStep(course(), id, { gen });
      const c = insertStep(r.course, r.step, 0);
      const errors = validateCourse(c).filter((i) => i.level === "error");
      expect(errors.map((e) => `${e.code} ${e.path} ${e.message.en}`)).toEqual(
        [],
      );
      expect(templateOf(r.step)).toBe(id);
      expect(r.step.title.fr).toBeTruthy();
    },
  );
  it("adds a starter scene only when the course has none, and reuses the asked scene", () => {
    const r = makeStep(course(), "explain", { gen });
    expect(Object.keys(r.course.scenes)).toEqual(["sc-start"]);
    expect(r.step.stage?.scene).toBe("sc-start");
    const c = course({ scenes: { a: scene("a"), b: scene("b") } });
    const r2 = makeStep(c, "try", { scene: "b", gen });
    expect(r2.course).toBe(c);
    expect(r2.step.stage?.scene).toBe("b");
    expect(r2.step.stage?.mode).toBe("live");
    expect(r2.step.stage?.controls).toEqual(["obs1", "hdgBug"]);
  });
  it("Try it binds its Do-this rows to the goal checks, ungraded by default", () => {
    const { step } = makeStep(course(), "try", { gen });
    expect(step.goal?.graded).toBe(false);
    const rows = step.reader.find((b) => b.t === "doThis");
    expect(
      rows && rows.t === "doThis" && rows.rows.map((r) => r.check),
    ).toEqual([0, 1]);
    expect(rows && rows.t === "doThis" && rows.rows[0].text.fr).toBeTruthy();
  });
  it("uses suggested checks for the goal and the Fly-it criteria", () => {
    const sugg = [{ id: "altBand" as const, p: { target: 4000, tol: 100 } }];
    const t = makeStep(course(), "try", { suggested: sugg as never, gen }).step;
    expect(t.goal?.all).toEqual(sugg);
    const f = makeStep(course(), "fly", { suggested: sugg as never, gen }).step;
    expect(f.flyIt?.criteria.map((c) => c.check)).toEqual(sugg);
    expect(f.flyIt?.target).toEqual({
      kind: "scene",
      scene: "sc-start",
      durationS: 180,
    });
  });
  it("defaults the instrument to the course's cockpit", () => {
    expect(
      makeStep(course({ cockpit: "steam" }), "explain", { gen }).step.stage
        ?.panes[0],
    ).toEqual({
      kind: "six",
      crop: { region: "STEAM_LEFT:4" },
    });
    expect(
      makeStep(course({ cockpit: "airliner" }), "explain", { gen }).step.stage
        ?.panes[0],
    ).toEqual({
      kind: "airlinerPfd",
    });
  });
  it("a drill is practice only; a calc step carries a CalcSpec", () => {
    expect(makeStep(course(), "drill", { gen }).step.drill?.practiceOnly).toBe(
      true,
    );
    expect(
      makeStep(course(), "calc", { calc: "vfr.tvmdc", gen }).step.calc
        ?.generatorId,
    ).toBe("vfr.tvmdc");
  });
  it("a designed slide comes from a layout, with its linear text", () => {
    const { step } = makeStep(course(), "slide", { layout: "twoColumn", gen });
    expect(step.slide?.layout).toBe("twoColumn");
    expect(step.layout).toBe("canvas");
    expect(step.reader.length).toBeGreaterThan(0);
    expect(step.reader[0].t).toBe("heading");
  });
});

describe("changing what a step teaches keeps the author's work", () => {
  it("Explain → Try it keeps reader, scene and callouts, adds controls and a goal", () => {
    const c0 = course();
    const r = makeStep(c0, "explain", { gen });
    const ex = r.step;
    ex.stage!.annotations = [newCallout(ex.stage!)];
    const { step } = changeKind(r.course, ex, "try");
    expect(step.id).toBe(ex.id);
    expect(step.kind).toBe("try");
    expect(step.reader.slice(0, 2)).toEqual(ex.reader);
    expect(step.stage?.annotations).toEqual(ex.stage!.annotations);
    expect(step.stage?.scene).toBe(ex.stage!.scene);
    expect(step.stage?.mode).toBe("live");
    expect(step.stage?.controls?.length).toBeGreaterThan(0);
    expect(step.goal?.all.length).toBeGreaterThan(0);
    expect(step.reader.some((b) => b.t === "doThis")).toBe(true);
  });
  it("Try it → Fly it turns the goal into criteria", () => {
    const r = makeStep(course(), "try", { gen });
    const { step } = changeKind(r.course, r.step, "fly");
    expect(step.flyIt?.criteria.map((c) => c.check)).toEqual(r.step.goal!.all);
    expect(step.goal).toEqual(r.step.goal);
  });
  it("tabs follow the kind", () => {
    const c = course();
    expect(inspectorTabs(makeStep(c, "explain", { gen }).step)).toEqual([
      "reader",
      "stage",
      "goal",
      "notes",
    ]);
    expect(inspectorTabs(makeStep(c, "calc", { gen }).step)[0]).toBe("calc");
    expect(inspectorTabs(makeStep(c, "drill", { gen }).step)[0]).toBe("drill");
    expect(inspectorTabs(makeStep(c, "fly", { gen }).step)[0]).toBe("fly");
    expect(inspectorTabs(makeStep(c, "slide", { gen }).step)).toEqual([
      "block",
      "slide",
      "goal",
      "notes",
    ]);
  });
});

describe("designed slide ↔ Reader + Stage", () => {
  it("round-trips the stage (pane, scene, mode, callouts, controls) and the reader", () => {
    const r = makeStep(course({ cockpit: "steam" }), "try", { gen });
    const s0 = r.step;
    s0.stage!.annotations = [
      newCallout(s0.stage!),
      newCallout({ ...s0.stage!, annotations: [newCallout(s0.stage!)] }),
    ];
    const slide = toDesignedSlide(s0, r.course);
    expect(slide.stage).toBeUndefined();
    expect(slide.layout).toBe("canvas");
    const inst = slide.slide!.blocks.find((b) => b.kind === "instrument");
    expect(inst && inst.kind === "instrument" && inst.view).toEqual({
      kind: "gauge",
      gauge: "hsi",
    });
    expect(inst && inst.kind === "instrument" && inst.mode).toBe("live");
    expect(inst && inst.kind === "instrument" && inst.controls).toEqual(
      s0.stage!.controls,
    );
    expect(slide.slide!.blocks.some((b) => b.kind === "checklist")).toBe(true);
    expect(slide.reader).toEqual(s0.reader);
    expect(
      validateCourse(insertStep(r.course, slide, 0)).filter(
        (i) => i.level === "error",
      ),
    ).toEqual([]);
    const back = toReaderStage(slide, r.course);
    expect(back.slide).toBeUndefined();
    expect(back.stage?.panes).toEqual(s0.stage!.panes);
    expect(back.stage?.scene).toBe(s0.stage!.scene);
    expect(back.stage?.mode).toBe("live");
    expect(back.stage?.annotations).toEqual(s0.stage!.annotations);
    expect(back.stage?.controls).toEqual(s0.stage!.controls);
    expect(back.reader).toEqual(s0.reader);
    expect(back.goal).toEqual(s0.goal);
  });
  it("a presenting slide becomes an Explain (instrument) or a reader-only page", () => {
    const r = makeStep(course(), "slide", { layout: "instrumentNotes", gen });
    const back = toReaderStage(r.step, r.course);
    expect(back.kind).toBe("explain");
    expect(back.stage?.panes.length).toBe(1);
    const t = makeStep(course(), "slide", { layout: "section", gen });
    const b2 = toReaderStage(t.step, t.course);
    expect(b2.kind).toBe("page");
    expect(b2.layout).toBe("readerOnly");
  });
  it("a slide converted to Reader + Stage keeps its words in the reader", () => {
    const r = makeStep(course(), "slide", { layout: "twoColumn", gen });
    const st = { ...r.step, reader: [r.step.reader[0]] };
    const back = toReaderStage(st, r.course);
    expect(back.reader.length).toBeGreaterThan(1);
    expect(back.reader).toEqual(linearText(r.step.slide!));
  });
  it("gauges map to crops of their panel and back", () => {
    expect(paneOfView({ kind: "gauge", gauge: "rmi" }, "steam")).toEqual({
      kind: "stack",
      crop: { region: "STEAM_RIGHT:1" },
    });
    expect(
      viewOfPane({ kind: "stack", crop: { region: "STEAM_RIGHT:1" } }),
    ).toEqual({ kind: "gauge", gauge: "rmi" });
    const p = paneOfView({ kind: "gauge", gauge: "pfd.hsi" }, "g1000");
    expect(p.kind).toBe("pfd");
    expect(viewOfPane({ kind: "pfd" })).toEqual({ kind: "pfd" });
    expect(viewOfPane({ kind: "image", asset: "x" })).toBeNull();
  });
  it("linear text follows reading order and skips presenter-only and labels", () => {
    const blocks = [
      {
        id: "1",
        kind: "text",
        style: "body",
        text: L("second"),
        frame: { x: 0, y: 500, w: 10, h: 10, z: 1 },
      },
      {
        id: "2",
        kind: "text",
        style: "title",
        text: L("first"),
        frame: { x: 0, y: 10, w: 10, h: 10, z: 2 },
      },
      {
        id: "3",
        kind: "text",
        style: "label",
        text: L("LABEL"),
        frame: { x: 0, y: 0, w: 10, h: 10, z: 3 },
      },
      {
        id: "4",
        kind: "text",
        style: "body",
        text: L("secret"),
        presenterOnly: true,
        frame: { x: 0, y: 600, w: 10, h: 10, z: 4 },
      },
      {
        id: "5",
        kind: "callout",
        n: 2,
        text: L("bar", "barre"),
        frame: { x: 0, y: 700, w: 10, h: 10, z: 5 },
      },
    ] as never;
    expect(linearText({ size: { w: 1920, h: 1080 }, blocks })).toEqual([
      { t: "heading", text: L("first") },
      { t: "text", text: L("second") },
      { t: "text", text: { en: "2. bar", fr: "2. barre" } },
    ]);
  });
});

describe("step edits", () => {
  const c = course({ steps: [page("a"), page("b"), page("c")] });
  it("moves, inserts and removes without touching the original", () => {
    expect(moveStep(c, 0, 2).steps.map((s) => s.id)).toEqual(["b", "c", "a"]);
    expect(moveStep(c, 2, -5).steps.map((s) => s.id)).toEqual(["c", "a", "b"]);
    expect(moveStep(c, 1, 1)).toBe(c);
    expect(insertStep(c, page("x"), 1).steps.map((s) => s.id)).toEqual([
      "a",
      "x",
      "b",
      "c",
    ]);
    expect(removeStep(c, 1).steps.map((s) => s.id)).toEqual(["a", "c"]);
    expect(c.steps.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });
  it("duplicates after the original with a fresh id and a copy title in both languages", () => {
    const r = duplicateStep(c, 0, gen)!;
    expect(r.course.steps.map((s) => s.id)).toEqual(["a", r.step.id, "b", "c"]);
    expect(r.step.id).not.toBe("a");
    expect(r.step.title).toEqual({
      en: "Explain a (copy)",
      fr: "Expliquer a (copie)",
    });
    expect(r.step.reader).toEqual(c.steps[0].reader);
    expect(r.step.reader).not.toBe(c.steps[0].reader);
  });
  it("callouts get the next number and reveal step; renumbering follows the list", () => {
    const cue: StageCue = {
      panes: [{ kind: "pfd" as const }],
      mode: "frozen" as const,
      annotations: [],
    };
    const a1 = newCallout(cue);
    const a2 = newCallout({ ...cue, annotations: [a1] });
    expect(a1.type === "callout" && a1.n).toBe(1);
    expect(a2.type === "callout" && a2.n).toBe(2);
    expect(a2.when).toEqual({ step: 2 });
    expect(a2.id).not.toBe(a1.id);
    const re = renumberCallouts([a2, a1]);
    expect(re.map((a) => a.type === "callout" && a.n)).toEqual([1, 2]);
  });
  it("switching quiz kind carries the prompt and the options over", () => {
    const mcq = {
      kind: "mcq" as const,
      prompt: L("Q", "Q"),
      options: [{ text: L("A") }, { text: L("B") }],
      answer: 1,
      explain: L("E"),
    };
    const ord = quizOfKind("order", mcq);
    expect(ord.kind === "order" && ord.items).toEqual([L("A"), L("B")]);
    expect(ord.kind === "order" && ord.prompt).toEqual(L("Q", "Q"));
    expect(quizOfKind("calc").kind).toBe("calc");
  });
});

describe("tray captures become steps", () => {
  it("adds the scene (renamed on a clash) and the clip, and picks Watch only with a clip", () => {
    const c = course({ scenes: { cap: scene("cap") } });
    const sc = scene("cap");
    sc.weather = { windDir: 300, windKt: 12 };
    const item = {
      id: "t1",
      at: "2026-11-06T14:32:00Z",
      scene: sc,
      label: "ILS 27 · 5 NM",
    };
    const r = stepFromTray(c, item, "watch");
    expect(r.step.kind).toBe("explain");
    expect(Object.keys(r.course.scenes)).toEqual(["cap", "cap-2"]);
    expect(r.step.stage?.scene).toBe("cap-2");
    expect(r.step.title).toEqual({ en: "ILS 27 · 5 NM", fr: "ILS 27 · 5 NM" });
    const clip = {
      id: "c1",
      startScene: "x",
      durS: 60,
      samples: [],
      keys: [],
      events: [],
      cues: [],
      source: "recorded" as const,
    };
    const w = stepFromTray(c, { ...item, clip }, "watch");
    expect(w.step.kind).toBe("watch");
    expect(w.step.stage?.clip).toBe("c1");
    expect(w.course.clips.c1.startScene).toBe(w.step.stage?.scene);
  });
  it("registers the capture's thumbnail and still as course assets (real sizes when the store knows them)", () => {
    const sc = scene("cap");
    sc.captured = { at: "2026-11-06T14:32:00Z", from: "cockpit" };
    const item = { id: "t", at: "", scene: sc, thumb: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", still: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
    const ref = { id: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", mime: "image/webp" as const, w: 320, h: 240, bytes: 9000, role: "thumb" as const };
    const r = stepFromTray(course(), item, "explain", {}, { ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]: ref });
    const added = Object.values(r.course.scenes)[0];
    expect(added.captured?.thumb).toBe("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(r.course.assets["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]).toEqual(ref);
    expect(r.course.assets["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"]).toMatchObject({ role: "still", w: 480, h: 270 });
    expect(validateCourse(insertStep(r.course, r.step, 0)).filter((i) => i.code === "ref.asset")).toEqual([]);
  });
  it("reuses an identical scene", () => {
    const sc = scene("cap");
    const c = course({ scenes: { cap: sc } });
    const r = stepFromTray(
      c,
      { id: "t", at: "", scene: JSON.parse(JSON.stringify(sc)) },
      "try",
    );
    expect(Object.keys(r.course.scenes)).toEqual(["cap"]);
  });
});

describe("the course undo history", () => {
  it("undoes and redoes whole-course snapshots and coalesces typing in one field", () => {
    let t = 0;
    const c0 = course();
    const hst = CourseHistory.of(c0, { now: () => t });
    const c1 = { ...c0, title: L("T1") };
    const c2 = { ...c0, title: L("T12") };
    expect(hst.push(c1, "title")).toBe(true);
    t += 300;
    hst.push(c2, "title");
    expect(hst.push(c2, "title")).toBe(false);
    expect(hst.undo()?.title).toEqual(c0.title);
    expect(hst.canUndo).toBe(false);
    expect(hst.redo()?.title).toEqual(L("T12"));
    t += 5000;
    hst.push({ ...c0, title: L("T123") }, "title");
    expect(hst.undo()?.title).toEqual(L("T12"));
  });
  it("a new change after an undo drops the redo branch; amend makes no undo step", () => {
    const c0 = course();
    const hst = CourseHistory.of(c0);
    hst.push({ ...c0, rev: 2 });
    hst.undo();
    hst.push({ ...c0, rev: 3 });
    expect(hst.canRedo).toBe(false);
    hst.amend({ ...c0, rev: 4 });
    expect(hst.current.rev).toBe(4);
    expect(hst.undo()?.rev).toBe(1);
  });
});

describe("step facts", () => {
  it("counts reveals of callouts and slide click reveals", () => {
    const r = makeStep(course(), "explain", { gen });
    const st = r.step;
    const a = newCallout(st.stage!);
    const b = newCallout({ ...st.stage!, annotations: [a] });
    st.stage!.annotations = [a, b];
    expect(revealsOf(st)).toBe(2);
    const s = makeStep(course(), "slide", { layout: "stepByStep", gen }).step;
    expect(revealsOf(s)).toBeGreaterThan(0);
  });
  it("writes the step bar in both languages", () => {
    const c = course({ steps: [page("a"), { ...page("b"), minutes: 1.5 }] });
    expect(stepBarText(c, 1, "en")).toEqual({
      head: "Step 2 of 2",
      tail: "about 1.5 min",
    });
    expect(stepBarText(c, 1, "fr")).toEqual({
      head: "Étape 2 sur 2",
      tail: "environ 1,5 min",
    });
    expect(minutesOf(page("a"))).toBe(1);
  });
  it("counts missing French only for FR/EN courses", () => {
    const c = course({
      steps: [
        { ...page("a"), reader: [{ t: "text", text: L("only english") }] },
      ],
    });
    expect(courseMissingFr(c)).toBe(1);
    expect(courseMissingFr({ ...c, langs: ["en"] })).toBe(0);
  });
});

describe("the checks panel", () => {
  it("computes the AIRAC cycle in force (28-day grid from 2001 = 2 Jan 2020)", () => {
    expect(airacCycle(new Date(Date.UTC(2020, 0, 2)))).toBe("2001");
    expect(airacCycle(new Date(Date.UTC(2020, 0, 1)))).toBe("1913");
    expect(airacCycle(new Date(Date.UTC(2020, 11, 31)))).toBe("2014");
    expect(airacCycle(new Date(Date.UTC(2021, 0, 28)))).toBe("2101");
    expect(airacCycle(new Date(Date.UTC(2026, 10, 6)))).toBe("2611");
    expect(airacAge("2609", "2611")).toBe(2);
    expect(airacAge("2014", "2101")).toBe(1);
    expect(airacIndex("nope")).toBeNull();
  });
  it("finds runs of four steps without a student action, with their range", () => {
    const steps = [
      page("a"),
      page("b"),
      page("c"),
      page("d"),
      { ...page("e"), kind: "try" as const },
      page("f"),
    ];
    expect(pacingRuns(steps)).toEqual([[0, 3]]);
    expect(pacingRuns(steps.slice(0, 3))).toEqual([]);
    expect(pacingText([7, 10], "en")).toBe(
      "Steps 8 to 11 explain without a task. A Try it in between keeps students doing.",
    );
  });
  it("lists errors first, then pacing, French and stale AIRAC advisories tied to steps", () => {
    const steps: Step[] = [
      {
        ...page("a"),
        stage: { panes: [{ kind: "pfd" }], mode: "frozen", scene: "old" },
      },
      page("b"),
      page("c"),
      { ...page("d"), reader: [{ t: "text", text: L("no french") }] },
      {
        ...page("e"),
        stage: { panes: [{ kind: "pfd" }], mode: "frozen", scene: "missing" },
      },
    ];
    const c = course({ steps, scenes: { old: scene("old", "2604") } });
    const checks = editorChecks(c, { now: new Date(Date.UTC(2026, 10, 6)) });
    expect(checks[0].level).toBe("error");
    expect(checks[0].stepId).toBe("e");
    const codes = checks.map((x) => x.code);
    expect(codes).toContain("pacing");
    expect(codes).toContain("fr");
    const airac = checks.find((x) => x.code === "airac");
    expect(airac?.stepId).toBe("a");
    expect(airac?.message.en).toContain("7 cycles old");
    expect(checks.find((x) => x.code === "pacing")?.run).toEqual([0, 4]);
    expect(checksForStep(checks, "a").map((x) => x.code)).toEqual(["airac"]);
  });
  it("a current scene raises no AIRAC advisory", () => {
    const c = course({
      steps: [
        {
          ...page("a"),
          kind: "try",
          stage: { panes: [{ kind: "pfd" }], mode: "live", scene: "s" },
        },
      ],
      scenes: { s: scene("s", "2611") },
    });
    expect(
      editorChecks(c, { airac: "2611" }).filter((x) => x.code === "airac"),
    ).toEqual([]);
  });
});
