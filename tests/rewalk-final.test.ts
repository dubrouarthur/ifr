// Re-walk fixes (final pass): what a newcomer meets after both lanes merged.
import { describe, expect, it } from "vitest";
import { basicInstrumentsCourse } from "../src/course/samples/decks/basicInstruments";
import { courseTally, marksFromAttempts } from "../src/course/ui/player";
import type { AttemptRecord } from "../src/course/types";

const att = (a: Partial<AttemptRecord> & Pick<AttemptRecord, "stepId" | "kind">): AttemptRecord => ({
  courseId: "sample-deck-basic-instruments",
  rev: 1,
  profileId: "local",
  at: "2026-11-17T10:00:00.000Z",
  secs: 5,
  ...a,
});

describe("P0 the player keeps « À vous » and quiz results across a simulator trip or a reload", () => {
  const course = basicInstrumentsCourse();
  const steps = course.steps;
  const tryStep = steps.find((s) => s.id === "bi-asi-try")!;
  const quizStep = steps.find((s) => s.id === "bi-quiz")!;
  it("the sample deck has the steps the re-walk used", () => {
    expect(tryStep).toBeTruthy();
    expect(quizStep).toBeTruthy();
  });
  it("rebuilds « fait » and « juste » from the stored attempts", () => {
    const marks = marksFromAttempts([
      att({ stepId: "bi-asi-try", kind: "try", goalMet: true }),
      att({ stepId: "bi-quiz", kind: "answer", correct: true }),
    ]);
    expect(marks["bi-asi-try"].goalMet).toBe(true);
    expect(marks["bi-quiz"]).toMatchObject({ answered: true, correct: true });
    const fresh = courseTally(steps, {});
    const t = courseTally(steps, marks);
    expect(t.left.length).toBe(fresh.left.length - 2);
    expect(t.met).toBe(1);
    expect(t.right).toBe(1);
  });
  it("a slide's « À vous » stored under its own id counts for its slide; a skipped try or a stopped flight does not", () => {
    const marks = marksFromAttempts([
      att({ stepId: "bi-asi-try~yt~b1", kind: "yourTurn", yourTurn: { block: "b1", result: { met: true, checks: [true], secs: 9 } } }),
      att({ stepId: "x-try", kind: "try", goalMet: false, skipped: true }),
      att({ stepId: "x-fly", kind: "fly", fly: { token: "t", passed: false, selfGrade: "notyet", criteria: [], ungraded: true } }),
      att({ stepId: "y-fly", kind: "fly", fly: { token: "u", passed: true, selfGrade: "nailed", criteria: [] } }),
    ]);
    expect(marks["bi-asi-try"].goalMet).toBe(true);
    expect(marks["x-try"].goalMet).toBeFalsy();
    expect(marks["x-fly"].flown).toBeUndefined();
    expect(marks["y-fly"].flown).toEqual({ passed: true });
  });
  it("a wrong answer then a right one is « juste »; only a wrong one stays answered, not right", () => {
    const m = marksFromAttempts([
      att({ stepId: "q", kind: "answer", correct: false }),
      att({ stepId: "q", kind: "answer", correct: true, at: "2026-11-17T10:01:00.000Z" }),
      att({ stepId: "r", kind: "answer", correct: false }),
    ]);
    expect(m.q.correct).toBe(true);
    expect(m.r).toMatchObject({ answered: true });
    expect(m.r.correct).toBeFalsy();
  });
});

describe("P0 the question inspector never puts back an older text", () => {
  // no DOM in this suite: the guard reads the editor source. Every commit must build from the quiz as it is now
  // (`now(q)` / `latest`), never from the copy captured when the inspector was drawn.
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "../src/course/ui/inspector.ts"), "utf8") as string;
  const body = (start: string) => {
    const a = src.indexOf(start);
    const b = src.indexOf("\n  private ", a + start.length);
    return src.slice(a, b);
  };
  it("quizEditor commits from the latest quiz", () => {
    const f = body("  private quizEditor(");
    expect(f).toMatch(/let latest: Quiz = q;/);
    expect(f).not.toMatch(/\.\.\.q[,\s}]/);
    expect(f).not.toMatch(/options: q\.options\.map/);
  });
  it("calcEditor and checksEditor commit from the latest value too", () => {
    expect(body("  private calcEditor(")).not.toMatch(/\.\.\.spec[,\s}]/);
    expect(body("  private checksEditor(")).not.toMatch(/clone\(list\)|set\(\[\.\.\.list|set\(list\./);
  });
});

describe("P1 a course opened from a link never says « Partagé par Vous »", () => {
  it("the default author reads « Reçu par lien »; an unchosen subject is not guessed from the template", async () => {
    const { courseHomeLine } = await import("../src/course/ui/library");
    const { sampleCourse } = await import("../src/course/samples");
    const c = sampleCourse("sample-deck-standard-turn-scan")!;
    c.id = "mon-cours-recu";
    delete (c as { sample?: string }).sample;
    delete (c as { subject?: string }).subject;
    c.author = { name: "Vous" };
    const fr = courseHomeLine(c, "fr", undefined, true);
    expect(fr).toMatch(/^Reçu par lien/);
    expect(fr).not.toMatch(/Vous/);
    expect(courseHomeLine(c, "en", undefined, true)).toMatch(/^Received by link/);
    if (c.program) expect(fr).not.toMatch(/›/);
    c.author = { name: "Claire Martin" };
    expect(courseHomeLine(c, "fr", undefined, true)).toMatch(/^Partagé par Claire Martin/);
  });
});

describe("P1 « À vous » chosen on an instrument shows its goal on the slide", () => {
  it("adds an « Objectif » list bound to the goal, follows it, and removes it with « À vous »", async () => {
    const { syncGoalChecklist } = await import("../src/course/ui/inspector");
    const slide = {
      blocks: [
        {
          id: "ai",
          kind: "instrument",
          frame: { x: 120, y: 300, w: 700, h: 600, z: 1 },
          view: { kind: "gauge", gauge: "ai" },
          yourTurn: { where: "slide", prompt: { en: "x" }, goal: { all: [{ id: "bankBand", p: { min: 40, max: 50 } }], holdS: 10 } },
        },
      ],
    } as never as import("../src/course/types").SlideCanvas;
    syncGoalChecklist(slide, "ai");
    const list = slide.blocks.find((b) => b.id === "ai-goal");
    expect(list?.kind).toBe("checklist");
    if (list?.kind !== "checklist") return;
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0].check).toBe(0);
    expect(list.frame.x).toBeGreaterThan(820);
    expect(list.frame.x + list.frame.w).toBeLessThanOrEqual(1800);
    // « Regarder »: the goal goes, its list too
    delete (slide.blocks[0] as { yourTurn?: unknown }).yourTurn;
    syncGoalChecklist(slide, "ai");
    expect(slide.blocks.some((b) => b.id === "ai-goal")).toBe(false);
  });
  it("never adds a second list when the author already has goal rows", async () => {
    const { syncGoalChecklist } = await import("../src/course/ui/inspector");
    const slide = {
      blocks: [
        { id: "ai", kind: "instrument", frame: { x: 120, y: 300, w: 700, h: 600 }, view: { kind: "gauge", gauge: "ai" }, yourTurn: { where: "slide", prompt: { en: "x" }, goal: { all: [{ id: "bankBand", p: { min: 25, max: 35 } }] } } },
        { id: "mine", kind: "checklist", frame: { x: 900, y: 300, w: 700, h: 300 }, rows: [{ text: { en: "Bank 30" }, check: 0 }] },
      ],
    } as never as import("../src/course/types").SlideCanvas;
    syncGoalChecklist(slide, "ai");
    expect(slide.blocks).toHaveLength(2);
  });
  it("the turn goal follows the situation: 45° asks for 45°", async () => {
    const { turnBank } = await import("../src/course/situations");
    expect(turnBank({ bank: 45 })).toBe(45);
    expect(turnBank({ bank: -31 })).toBe(30);
    expect(turnBank({ bank: 5 })).toBe(30);
  });
});

describe("P2 a new slide is named after its title", () => {
  const slide = (title?: string) =>
    ({
      blocks: title
        ? [{ id: "t", kind: "text", style: "title", text: { en: title, fr: title }, frame: { x: 0, y: 100, w: 900, h: 120 } }]
        : [],
    }) as never as import("../src/course/types").SlideCanvas;
  it("« Nouvelle diapo » takes the typed title, and follows it while it was not renamed", async () => {
    const { slideNameFromTitle } = await import("../src/course/ui/templates");
    const st = { title: { en: "New slide", fr: "Nouvelle diapo" }, slide: slide() };
    const n1 = slideNameFromTitle(st, slide("Le facteur de charge en virage"));
    expect(n1).toEqual({ en: "Le facteur de charge en virage", fr: "Le facteur de charge en virage" });
    const st2 = { title: n1!, slide: slide("Le facteur de charge en virage") };
    expect(slideNameFromTitle(st2, slide("Le facteur de charge"))?.fr).toBe("Le facteur de charge");
    // renamed by the author: kept
    expect(slideNameFromTitle({ title: { en: "Mine", fr: "La mienne" }, slide: slide("A") }, slide("B"))).toBeNull();
  });
});

describe("P2 a demo slide without notes still gives the presenter something to say", () => {
  it("uses the author's note, then the slide's points", async () => {
    const { fallbackNotes } = await import("../src/course/ui/presenterNotes");
    const step = {
      id: "demo",
      kind: "slide",
      title: { en: "Watch", fr: "Regardez" },
      reader: [],
      slide: {
        blocks: [
          { id: "n", kind: "text", style: "body", editorOnly: true, text: { en: "In class: Present, then fly the demo", fr: "En classe : « Présenter », puis « Piloter la démonstration »" }, frame: { x: 0, y: 900, w: 800, h: 80 } },
          { id: "b", kind: "text", style: "body", text: { en: "Watch the needle", fr: "Regardez l’aiguille" }, frame: { x: 0, y: 300, w: 800, h: 80 } },
        ],
      },
    } as never as import("../src/course/types").Step;
    const fr = fallbackNotes(step, "fr");
    expect(fr[0]).toMatch(/^En classe/);
    expect(fr).toContain("À dire : Regardez l’aiguille");
  });
});
