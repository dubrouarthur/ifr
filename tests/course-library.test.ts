// Ground school — the academy host and the library (package I): the hash router, the library's entries, shelves,
// search, the Continue card's choice, the kind-mix bar, thumbnails, the UI strings and the slide Your-turn step.
import { describe, expect, it } from "vitest";
import type {
  Course,
  CourseProgress,
  SlideBlock,
  Step,
  YourTurn,
} from "../src/course/types";
import type { CourseIndexEntry } from "../src/course/store";
import {
  academyHash,
  academyHref,
  academyRoute,
  continueTarget,
  filterEntries,
  kindMix,
  libraryEntries,
  shelfCounts,
  thumbOf,
  thumbPlacement,
  type AcademyRoute,
} from "../src/course/ui/library";
import {
  allSamples,
  sampleCourse,
  HOLDING_ID,
  MATHS_IFR_ID,
  VOR_ID,
} from "../src/course/samples";
import { agoText, ct, ctSteps, isFallback, loc } from "../src/course/i18n";
import {
  yourTurnGraded,
  yourTurnStep,
  yourTurnStepId,
} from "../src/learn/slideTurn";

describe("academy routes", () => {
  it("parses every route", () => {
    expect(academyRoute("")).toEqual({ k: "library" });
    expect(academyRoute("#library")).toEqual({ k: "library" });
    expect(academyRoute("#play=sample-vor")).toEqual({
      k: "play",
      id: "sample-vor",
    });
    expect(academyRoute("#play=sample-vor&s=v-hsi&a=abcdefghijklmnop")).toEqual(
      {
        k: "play",
        id: "sample-vor",
        s: "v-hsi",
        a: "abcdefghijklmnop",
      },
    );
    expect(academyRoute("#edit=my-course")).toEqual({
      k: "edit",
      id: "my-course",
    });
    expect(academyRoute("#present=x1")).toEqual({ k: "present", id: "x1" });
    expect(academyRoute("#project=x1")).toEqual({ k: "project", id: "x1" });
    expect(academyRoute("#c=C1.abc_DEF-123")).toEqual({
      k: "share",
      code: "C1.abc_DEF-123",
    });
  });
  it("refuses malformed ids and parameters", () => {
    expect(academyRoute("#play=../../etc")).toEqual({ k: "library" });
    expect(academyRoute("#play=<script>")).toEqual({ k: "library" });
    expect(academyRoute("#c=javascript:alert(1)")).toEqual({ k: "library" });
    expect(academyRoute("#play=ok&s=%E0%A4%A")).toEqual({
      k: "play",
      id: "ok",
    });
    expect(academyRoute("#play=ok&s=a b")).toEqual({ k: "play", id: "ok" });
  });
  it("round-trips", () => {
    const rs: AcademyRoute[] = [
      { k: "library" },
      { k: "play", id: "sample-holding", s: "h-drag" },
      { k: "play", id: "c-1", s: "s~yt~b", a: "TOKEN_abcdefghijk", b: "blk" },
      { k: "edit", id: "my.course_2" },
      { k: "present", id: "p" },
      { k: "share", code: "C1.xyz" },
    ];
    for (const r of rs) expect(academyRoute(academyHash(r))).toEqual(r);
    expect(academyHref({ k: "play", id: "a" })).toBe("academy.html#play=a");
  });
});

const idx = (
  id: string,
  o: Partial<CourseIndexEntry> = {},
): CourseIndexEntry => ({
  id,
  title: { en: id },
  rev: 1,
  updated: "2026-11-01T00:00:00.000Z",
  steps: 3,
  langs: ["en"],
  ...o,
});
const progress = (courseId: string, stepId: string): CourseProgress => ({
  courseId,
  rev: 1,
  profileId: "local",
  stepId,
  reveal: 0,
  updated: "2026-11-05T00:00:00.000Z",
});

describe("library entries", () => {
  const samples = allSamples();
  it("lists stored courses first, then the samples", () => {
    const list = libraryEntries({ samples, stored: [{ entry: idx("mine") }] });
    expect(list[0].id).toBe("mine");
    expect(list.slice(1).map((e) => e.id)).toEqual(samples.map((c) => c.id));
    expect(list.slice(1).every((e) => e.sample && e.shelf === "sample")).toBe(
      true,
    );
  });
  it("puts courses on their shelves", () => {
    const list = libraryEntries({
      samples: [],
      stored: [
        { entry: idx("a", { assigned: true }) },
        { entry: idx("b") },
        { entry: idx("c") },
      ],
      imported: new Set(["b", "a"]),
    });
    expect(list.map((e) => [e.id, e.shelf])).toEqual([
      ["a", "assigned"],
      ["b", "club"],
      ["c", "draft"],
    ]);
    expect(shelfCounts(list)).toEqual({
      all: 3,
      assigned: 1,
      club: 1,
      sample: 0,
      draft: 1,
    });
  });
  it("a stored copy of a sample hides nothing and duplicates nothing", () => {
    const vor = sampleCourse(VOR_ID)!;
    const list = libraryEntries({
      samples,
      stored: [{ entry: idx(VOR_ID), course: vor }],
    });
    expect(list.filter((e) => e.id === VOR_ID)).toHaveLength(1);
    expect(list.find((e) => e.id === VOR_ID)!.sample).toBe(false);
  });
  it("reads progress against the course's steps", () => {
    const p = new Map([[VOR_ID, progress(VOR_ID, "v-intercept")]]);
    const e = libraryEntries({ samples, stored: [], progress: p }).find(
      (x) => x.id === VOR_ID,
    )!;
    expect(e.progress).toMatchObject({
      index: 9,
      total: 14,
      stepId: "v-intercept",
    });
    expect(e.progress!.next!.kind).toBe("try");
    const stale = new Map([[VOR_ID, progress(VOR_ID, "removed-step")]]);
    expect(
      libraryEntries({ samples, stored: [], progress: stale }).find(
        (x) => x.id === VOR_ID,
      )!.progress,
    ).toBeUndefined();
  });
  it("searches both languages, tags and ignores accents", () => {
    const list = libraryEntries({ samples, stored: [] });
    expect(filterEntries(list, "all", "attente").map((e) => e.id)).toContain(
      HOLDING_ID,
    );
    const m = filterEntries(list, "all", "MATHS ifr").map((e) => e.id);
    expect(m).toContain(MATHS_IFR_ID);
    expect(m).not.toContain(VOR_ID);
    expect(filterEntries(list, "all", "theorie").length).toBe(0);
    expect(
      filterEntries(list, "all", "Centrage").map((e) => e.id),
    ).toContain("sample-maths-vfr");
    expect(filterEntries(list, "draft")).toEqual([]);
    expect(filterEntries(list, "sample").length).toBe(samples.length);
  });
});

describe("the Continue card", () => {
  const samples = allSamples();
  it("prefers an unfinished assigned course", () => {
    const list = libraryEntries({
      samples,
      stored: [{ entry: idx("hw", { assigned: true }) }],
      progress: new Map([[VOR_ID, progress(VOR_ID, "v-hsi")]]),
    });
    expect(continueTarget(list, { id: VOR_ID })!.entry.id).toBe("hw");
  });
  it("then the last opened course, then any started one, then the first sample", () => {
    const p = new Map([[HOLDING_ID, progress(HOLDING_ID, "h-drag")]]);
    const list = libraryEntries({ samples, stored: [], progress: p });
    expect(continueTarget(list, { id: VOR_ID, stepId: "v-hsi" })).toMatchObject(
      { entry: { id: VOR_ID }, started: true },
    );
    expect(continueTarget(list, null)).toMatchObject({
      entry: { id: HOLDING_ID },
      started: true,
    });
    const fresh = libraryEntries({ samples, stored: [] });
    expect(continueTarget(fresh, null)).toMatchObject({
      entry: { id: MATHS_IFR_ID },
      started: false,
    });
    expect(continueTarget([], null)).toBeNull();
  });
});

describe("kind mix and thumbnails", () => {
  it("counts reading, acting and flying steps", () => {
    const vor = sampleCourse(VOR_ID)!;
    const m = kindMix(vor.steps);
    expect(m.learn + m.act + m.fly).toBe(14);
    expect(m.fly).toBe(1);
    expect(m.act).toBeGreaterThanOrEqual(6);
  });
  it("zooms the card on the first visual block of a slide", () => {
    const vor = sampleCourse(VOR_ID)!;
    const t = thumbOf(vor)!;
    expect(t.step.id).toBe("v-cover");
    expect(t.focus).toMatchObject({ x: 1032, w: 720 });
    expect(thumbOf(vor, "v-hsi")!.step.id).toBe("v-hsi");
    const none: Course = { ...vor, steps: vor.steps.filter((s) => !s.slide) };
    expect(thumbOf(none)).toBeNull();
  });
  it("covers the thumbnail and stays inside the slide", () => {
    const r = thumbPlacement(320, 120);
    expect(r.w / r.h).toBeCloseTo(16 / 9, 2);
    expect(r.w).toBeGreaterThanOrEqual(320);
    expect(r.h).toBeGreaterThanOrEqual(120);
    const f = { x: 1080, y: 132, w: 816, h: 816 };
    const z = thumbPlacement(320, 120, f);
    expect(z.x).toBeLessThanOrEqual(0);
    expect(z.y).toBeLessThanOrEqual(0);
    expect(z.x + z.w).toBeGreaterThanOrEqual(320);
    expect(z.y + z.h).toBeGreaterThanOrEqual(120);
    const k = z.w / 1920;
    expect(f.w * k).toBeGreaterThanOrEqual(319);
  });
});

describe("UI strings", () => {
  it("fills placeholders and plurals", () => {
    expect(ct("continueAt", "en", { n: 6 })).toBe("Continue at step 6");
    expect(ct("continueAt", "fr", { n: 6 })).toBe("Reprendre à l’étape 6");
    expect(ctSteps(1, "en")).toBe("1 step");
    expect(ctSteps(12, "en")).toBe("12 steps");
    expect(ctSteps(1, "fr")).toBe("1 étape");
    expect(ctSteps(0, "fr")).toBe("0 étape");
  });
  it("falls back to English for author text", () => {
    expect(loc({ en: "Hold", fr: "Attente" }, "fr")).toBe("Attente");
    expect(loc({ en: "Hold" }, "fr")).toBe("Hold");
    expect(loc({ en: "Hold", fr: " " }, "fr")).toBe("Hold");
    expect(isFallback({ en: "Hold" }, "fr")).toBe(true);
    expect(isFallback({ en: "Hold" }, "en")).toBe(false);
  });
  it("says how long ago", () => {
    const now = Date.parse("2026-11-07T12:00:00Z");
    expect(agoText("2026-11-07T08:00:00Z", "en", now)).toBe("today");
    expect(agoText("2026-11-06T08:00:00Z", "fr", now)).toBe("hier");
    expect(agoText("2026-11-04T08:00:00Z", "en", now)).toBe("3 days ago");
  });
});

describe("a slide's Your turn as a Try-it step", () => {
  const vor = sampleCourse(VOR_ID)!;
  const step = vor.steps.find((s) => s.id === "v-hsi") as Step;
  const block = step.slide!.blocks.find((b) => b.id === "v-hsi.hsi") as Extract<
    SlideBlock,
    { kind: "instrument" }
  >;
  const yt = block.yourTurn as YourTurn;
  it("poses the block's instrument live with its controls, assist and goal", () => {
    const s = yourTurnStep({ course: vor, step, block, yt });
    expect(s.id).toBe(yourTurnStepId("v-hsi", "v-hsi.hsi"));
    expect(s.kind).toBe("try");
    expect(s.stage).toMatchObject({
      panes: [{ kind: "six", crop: { region: "STEAM_LEFT:4" } }],
      mode: "live",
      scene: "vor.intercept",
      controls: ["obs1"],
      assist: { holdAlt: true, holdIas: true },
    });
    expect(s.goal).toEqual(yt.goal);
    expect(s.goal).not.toBe(yt.goal);
    expect(s.reader[0]).toMatchObject({ t: "doThis" });
    expect((s.reader[0] as { rows: unknown[] }).rows).toHaveLength(
      yt.goal.all.length,
    );
  });
  it("is never graded with an assist", () => {
    expect(yourTurnGraded(yt)).toBe(false);
    expect(yourTurnGraded({ ...yt, goal: { ...yt.goal, graded: true } })).toBe(
      false,
    );
    expect(
      yourTurnGraded({
        ...yt,
        assist: undefined,
        goal: { ...yt.goal, graded: true },
      }),
    ).toBe(true);
  });
  it("finds a Your turn in the holding sample's five Ts slide too", () => {
    const h = sampleCourse(HOLDING_ID)!;
    const st = h.steps.find((s) => s.id === "h-five-ts")!;
    const b = st.slide!.blocks.find(
      (x) => x.kind === "instrument" && x.yourTurn,
    ) as Extract<SlideBlock, { kind: "instrument" }>;
    const s = yourTurnStep({ course: h, step: st, block: b, yt: b.yourTurn! });
    expect(s.stage!.controls).toEqual(["bank"]);
    expect(s.stage!.scene).toBe("hold.fix");
  });
});
