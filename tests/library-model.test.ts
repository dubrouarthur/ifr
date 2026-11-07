// The unified library (src/library): its tables stay in step with what they describe (the curriculum, the drills,
// the scenarios, the school circuits, the procedures, the built-in courses), every item is placed in a program, and
// the model groups, filters and searches the way the page shows it.
import { describe, expect, it } from "vitest";
import { EXERCISES } from "../src/train/curriculum";
import { DRILL_TEMPLATES } from "../src/train/drills";
import { SCENARIOS } from "../src/sim/sim";
import { PRESET_CIRCUITS } from "../src/train/circuits";
import {
  CATEGORY_LABELS,
  LIBRARY,
  LIBRARY_BASES,
  libraryFor,
} from "../src/train/procedureLibrary";
import { SAMPLES, allSamples } from "../src/course/samples";
import { CRAFTED_BRIEFINGS } from "../src/course/samples/briefings";
import { LIBRARY_PLAN } from "../src/course/samples/library";
import { libraryEntries } from "../src/course/ui/library";
import {
  COURSE_META,
  DRILL_META,
  FLIGHT_META,
  LESSON_META,
  LESSON_ORDER,
  LESSON_SIM,
  PROCEDURE_META,
  STAGE_LABEL,
} from "../src/library/meta";
import {
  NO_FILTER,
  continueItems,
  filterItems,
  kindCounts,
  libraryView,
  matchScore,
  previewOf,
  programCounts,
  type LibItem,
} from "../src/library/model";
import { PROGRAMS, PROGRAM_IDS, expandPrograms } from "../src/library/programs";
import {
  coursePlacement,
  libraryItems,
  splitItem,
} from "../src/library/sources";
import type { Course } from "../src/course/types";

const entries = () => libraryEntries({ samples: allSamples(), stored: [] });
const sampleProgram = (id: string) => SAMPLES.find((s) => s.id === id)?.program;
const all = (
  lang: "en" | "fr" = "en",
  extra: Partial<Parameters<typeof libraryItems>[0]> = {},
) =>
  libraryItems({
    lang,
    courses: entries(),
    sampleProgram,
    procedures: libraryFor(lang),
    categories: CATEGORY_LABELS,
    ...extra,
  });

describe("the library's tables follow their sources", () => {
  it("lists every sim lesson of the curriculum, in order, with its English title, stage and length", () => {
    expect(LESSON_ORDER).toEqual(EXERCISES.map((e) => e.id));
    for (const e of EXERCISES) {
      const m = LESSON_META[e.id];
      expect(m.en, e.id).toBe(e.title);
      expect(m.stage, e.id).toBe(e.stage);
      expect(m.minutes, e.id).toBe(e.minutes);
      expect(m.fr.length, e.id).toBeGreaterThan(3);
      expect(STAGE_LABEL[m.stage], e.id).toBeTruthy();
      expect(LESSON_SIM[e.id]?.ap, e.id).toBe(e.allowAp);
      expect(LESSON_SIM[e.id]?.plate, e.id).toBe(e.plate);
    }
  });
  it("lists every failure drill template with its names and phase, and the procedures it trains", () => {
    expect(Object.keys(DRILL_META)).toEqual(DRILL_TEMPLATES.map((t) => t.id));
    for (const t of DRILL_TEMPLATES) {
      const m = DRILL_META[t.id];
      expect(m.name, t.id).toEqual({ en: t.name.en, fr: t.name.fr });
      expect(m.phase, t.id).toBe(t.phase);
      for (const base of m.trains) {
        expect(LIBRARY_BASES, `${t.id} trains ${base}`).toContain(base);
        const proc = LIBRARY.find((p) => p.id === `${base}.en`)!;
        // the procedure answers one of the failures the drill gives
        expect(
          t.failures.some((f) => !f.pool && proc.failures.includes(f.key)),
          `${t.id} → ${base}`,
        ).toBe(true);
      }
    }
  });
  it("names the scenarios and the school circuits as the simulator does", () => {
    for (const [id, m] of Object.entries(FLIGHT_META)) {
      if (m.type === "scenario")
        expect(SCENARIOS.find((s) => s.id === id)?.name, id).toBe(m.en);
      else
        expect(PRESET_CIRCUITS.find((c) => c.id === id)?.name, id).toBe(m.en);
    }
    for (const c of PRESET_CIRCUITS)
      expect(FLIGHT_META[c.id], c.id).toBeTruthy();
  });
  it("places every library procedure, and only those", () => {
    expect(Object.keys(PROCEDURE_META).sort()).toEqual(
      [...LIBRARY_BASES].sort(),
    );
  });
  it("places only built-in courses (samples or planned library courses)", () => {
    const known = new Set([
      ...SAMPLES.map((s) => s.id),
      ...LIBRARY_PLAN.map((p) => p.id),
    ]);
    for (const id of Object.keys(COURSE_META))
      expect(known.has(id), id).toBe(true);
  });
  it("keeps the planned library course in its registry program", () => {
    for (const p of LIBRARY_PLAN) {
      const meta = COURSE_META[p.id];
      if (!meta?.programs) continue;
      // the registry's program (lapl-ppl → PPL and LAPL) is among the placed programs
      for (const x of expandPrograms(p.program))
        expect(meta.programs, p.id).toContain(x);
    }
  });
});

describe("every item has a home", () => {
  const items = all();
  it("files every built-in item in a program, at a level, in both languages", () => {
    for (const i of items) {
      if (i.source === "builtin")
        expect(i.programs.length, i.key).toBeGreaterThan(0);
      expect([1, 2, 3], i.key).toContain(i.level);
      expect(i.title.en.length, i.key).toBeGreaterThan(0);
      expect(i.title.fr?.length ?? 0, i.key).toBeGreaterThan(0);
    }
    const keys = items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("holds courses, flights and procedures for the licences, and something for the club", () => {
    const n = programCounts(items);
    for (const p of ["lapl", "ppl", "night", "ir", "atpl"] as const)
      expect(n[p], p).toBeGreaterThan(2);
    expect(n.club).toBeGreaterThan(0);
    const k = kindCounts(items);
    expect(k.course).toBeGreaterThanOrEqual(4);
    expect(k.flight).toBeGreaterThanOrEqual(EXERCISES.length);
    expect(k.procedure).toBe(LIBRARY_BASES.length);
    expect(items.length).toBeGreaterThan(60);
  });
  it("lists a sample briefing as its lesson's cover, not as a course of its own", () => {
    for (const b of CRAFTED_BRIEFINGS) {
      expect(
        items.some((i) => i.key === `course:${b.id}`),
        b.id,
      ).toBe(false);
      const lesson = items.find((i) => i.key === `lesson:${b.exerciseId}`);
      expect(lesson?.deck, b.exerciseId).toBe(b.id);
    }
  });
  it("opens each kind the right way", () => {
    for (const i of items) {
      const k = i.open.k;
      if (i.kind === "course") expect(k).toBe("course");
      else if (i.kind === "procedure") expect(k).toBe("procedure");
      else expect(["lesson", "drill", "scenario"]).toContain(k);
    }
  });
});

describe("course placement", () => {
  const base = {
    id: "x",
    tags: [] as string[],
    shelf: "draft" as const,
    sample: false,
  };
  it("follows the course's own program first, then the built-in table, the registry, the tags", () => {
    expect(
      coursePlacement({ ...base, course: { program: "lapl-ppl" } }).programs,
    ).toEqual(["ppl", "lapl"]);
    expect(
      coursePlacement({
        ...base,
        course: { program: ["atpl", "ir"], level: 3 },
      }),
    ).toEqual({
      programs: ["atpl", "ir"],
      level: 3,
    });
    expect(
      coursePlacement({ ...base, id: "sample-maths-ifr", sample: true })
        .programs[0],
    ).toBe("ir");
    expect(
      coursePlacement(
        { ...base, id: "sample-lib-zzz", sample: true },
        () => "club",
      ).programs,
    ).toEqual(["club"]);
    expect(
      coursePlacement({ ...base, tags: ["vfr", "maths"] }).programs,
    ).toEqual(["ppl"]);
    // a copy of a sample stays on the sample's shelf
    expect(
      coursePlacement({ ...base, course: { sample: "sample-holding" } })
        .programs,
    ).toEqual(["ir"]);
    // an imported course with nothing else lands in Club
    expect(coursePlacement({ ...base, shelf: "club" }).programs).toEqual([
      "club",
    ]);
    expect(coursePlacement(base).programs).toEqual([]);
  });
});

describe("filters and search", () => {
  const items = all("fr", { procedures: libraryFor("fr") });
  it("filters by program, kind and level", () => {
    const ir = filterItems(items, { program: "ir" });
    expect(ir.length).toBeGreaterThan(20);
    expect(ir.every((i) => i.programs.includes("ir"))).toBe(true);
    const procs = filterItems(items, { program: "lapl", kind: "procedure" });
    expect(procs.length).toBeGreaterThan(3);
    expect(procs.every((i) => i.kind === "procedure")).toBe(true);
    const adv = filterItems(items, { level: 3 });
    expect(adv.every((i) => i.level === 3)).toBe(true);
  });
  it("searches both languages, accents ignored, the title first", () => {
    const fr = filterItems(items, { q: "entree decalee" });
    expect(fr.map((i) => i.key)).toContain("lesson:hold-teardrop");
    const en = filterItems(items, { q: "teardrop" });
    expect(en.map((i) => i.key)).toContain("lesson:hold-teardrop");
    const v = libraryView(items, { ...NO_FILTER, q: "vor" }, { cols: 4 });
    expect(v.every((s) => s.type === "results")).toBe(true);
    const flights = v.find((s) => s.kind === "flight")!.items;
    // a lesson with VOR in its title comes before one that only mentions it elsewhere
    expect(matchScore(flights[0], "vor")).toBeGreaterThanOrEqual(
      matchScore(flights[flights.length - 1], "vor"),
    );
    expect(fold(flights[0].title.fr ?? flights[0].title.en)).toContain("vor");
    expect(filterItems(items, { q: "zzzz-nothing" })).toEqual([]);
  });
  it("counts each program under the other filters", () => {
    const n = programCounts(items, { kind: "procedure" });
    expect(n.all).toBe(items.filter((i) => i.kind === "procedure").length);
    expect(n.ir).toBe(
      items.filter((i) => i.kind === "procedure" && i.programs.includes("ir"))
        .length,
    );
  });
});
const fold = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

describe("the page's sections", () => {
  const items = all();
  it("every program: Start here, My drafts, then one preview row per program in program order", () => {
    const v = libraryView(items, NO_FILTER, { cols: 4, drafts: true });
    expect(v[0].type).toBe("start");
    expect(v.some((s) => s.type === "drafts")).toBe(true);
    const progs = v.filter((s) => s.type === "program").map((s) => s.program);
    expect(progs).toEqual(
      PROGRAM_IDS.filter((p) => items.some((i) => i.programs.includes(p))),
    );
    for (const s of v.filter((x) => x.type === "program")) {
      expect(s.items.length).toBeLessThanOrEqual(4);
      expect(s.total).toBe(
        items.filter((i) => i.programs.includes(s.program!)).length,
      );
    }
  });
  it("a preview row mixes what the program holds, courses first", () => {
    const ppl = items.filter((i) => i.programs.includes("ppl"));
    const row = previewOf(ppl, "ppl", 4);
    expect(row).toHaveLength(4);
    expect(row[0].kind).toBe("course");
    expect(new Set(row.map((i) => i.kind)).size).toBeGreaterThan(1);
  });
  it("one program: one section per kind, courses, then flights, then procedures", () => {
    const v = libraryView(items, { ...NO_FILTER, program: "ir" }, { cols: 4 });
    expect(v.map((s) => s.kind)).toEqual(["course", "flight", "procedure"]);
    const flights = v[1].items;
    // the IR's own lessons in syllabus order
    const lessons = flights.filter((i) => i.sub === "lesson");
    expect(lessons[0].key).toBe("lesson:bai-sl");
  });
  it("Continue shows what was started and not finished, most recent first", () => {
    const now = Date.now();
    const at = (min: number) => new Date(now - min * 60_000).toISOString();
    const withProgress = all("en", {
      lessons: {
        "hold-direct": { passed: false, best: 40, attempts: 2, last: at(5) },
        "bai-sl": { passed: true, best: 90, attempts: 1, last: at(1) },
        "nav-arc": { passed: false, best: 10, attempts: 1, last: at(60) },
      },
    });
    const c = continueItems(withProgress);
    expect(c.map((i) => i.key)).toEqual([
      "lesson:hold-direct",
      "lesson:nav-arc",
    ]);
    const v = libraryView(withProgress, NO_FILTER, { cols: 4 });
    expect(v[0].type).toBe("continue");
  });
  it("Assigned and My drafts list the author's courses", () => {
    const mk = (id: string): Course => ({
      ...allSamples()[0],
      id,
      sample: undefined,
      title: { en: id, fr: id },
    });
    const stored = [
      {
        entry: {
          id: "mine-1",
          title: { en: "Mine" },
          rev: 1,
          updated: "2026-11-01",
          steps: 3,
          langs: ["en" as const],
        },
        course: mk("mine-1"),
      },
      {
        entry: {
          id: "mine-2",
          title: { en: "Given" },
          rev: 1,
          updated: "2026-11-02",
          steps: 3,
          langs: ["en" as const],
          assigned: true,
        },
        course: mk("mine-2"),
      },
    ];
    const list = libraryItems({
      lang: "en",
      courses: libraryEntries({ samples: allSamples(), stored }),
      sampleProgram,
    });
    const v = libraryView(list, NO_FILTER, { cols: 4, drafts: true });
    expect(
      v.find((s) => s.type === "assigned")?.items.map((i) => i.key),
    ).toEqual(["course:mine-2"]);
    expect(v.find((s) => s.type === "drafts")?.items.map((i) => i.key)).toEqual(
      ["course:mine-1"],
    );
  });
  it("stays fast with a big library", () => {
    const big: LibItem[] = [];
    for (let k = 0; k < 6; k++)
      for (const i of items) big.push({ ...i, key: `${i.key}#${k}` });
    const t0 = performance.now();
    for (const q of ["", "ils", "panne moteur", "vor dme"]) {
      libraryView(big, { ...NO_FILTER, q }, { cols: 4 });
      for (const p of PROGRAMS)
        libraryView(big, { ...NO_FILTER, program: p.id, q }, { cols: 4 });
      programCounts(big, { q });
    }
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe("checklist lines", () => {
  it("splits a challenge from its response", () => {
    expect(splitItem("Mixture — IDLE CUT-OFF")).toEqual({
      c: "Mixture",
      r: "IDLE CUT-OFF",
    });
    expect(splitItem("Land as soon as possible")).toEqual({
      c: "Land as soon as possible",
      r: "",
    });
  });
});
