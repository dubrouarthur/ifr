// The unified library (src/library): one way to browse it (programme shelves → subjects in syllabus order), ONE home
// per item, and the tables stay in step with what they describe (the curriculum, the drills, the scenarios, the
// school circuits, the procedures, the built-in courses, the course library's registries and its plan). The model
// draws the landing, a programme page and the search the way the page shows them.
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
import { LIBRARY_COURSES, LIBRARY_PLAN } from "../src/course/samples/library";
import { libraryEntries } from "../src/course/ui/library";
import { CLASSIFICATION } from "../src/library/classification";
import {
  DRILL_META,
  FLIGHT_META,
  LESSON_META,
  LESSON_ORDER,
  LESSON_SIM,
  STAGE_LABEL,
} from "../src/library/meta";
import {
  continueItems,
  filterItems,
  isNewcomer,
  kindCounts,
  lessonRank,
  matchTier,
  plannedItems,
  programCounts,
  programOf,
  programView,
  searchView,
  shelves,
  subjectCounts,
  type LibItem,
} from "../src/library/model";
import {
  PROGRAMS,
  PROGRAM_IDS,
  SHELF_IDS,
  SUBJECTS,
  guessSubject,
  isSubjectId,
  shelfOfCourseProgram,
  subjectDef,
} from "../src/library/programs";
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

describe("the bookcase: programmes and subjects", () => {
  it("lists the shelves in training order, LAPL and PPL as one", () => {
    expect(PROGRAM_IDS).toEqual([
      "discover",
      "ppl",
      "night",
      "ir",
      "atpl",
      "club",
      "instructors",
    ]);
    expect(SHELF_IDS).not.toContain("discover");
    for (const p of ["lapl", "ppl", "lapl-ppl"] as const)
      expect(shelfOfCourseProgram(p)).toBe("ppl");
  });
  it("gives every programme its subjects in syllabus order, with unique ids and numbers", () => {
    const ids = SUBJECTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PROGRAMS) {
      const subs = SUBJECTS.filter((s) => s.program === p.id);
      expect(subs.length, p.id).toBeGreaterThan(0);
      expect(new Set(subs.map((s) => s.n)).size, p.id).toBe(subs.length);
      expect(
        isSubjectId(p.fallback) && subjectDef(p.fallback).program,
        p.id,
      ).toBe(p.id);
      for (const s of subs)
        expect(s.title.fr?.length ?? 0, s.id).toBeGreaterThan(2);
    }
    // Part-FCL: the nine theory subjects, then the flight modules; ATPL: the 13 EASA subjects; IR: S1–S8 as 7 modules
    expect(
      SUBJECTS.filter((s) => s.program === "ppl" && s.group === "theory"),
    ).toHaveLength(9);
    expect(
      SUBJECTS.filter((s) => s.program === "atpl").map((s) => s.n),
    ).toEqual([
      "010",
      "021",
      "022",
      "031",
      "032",
      "033",
      "040",
      "050",
      "061",
      "062",
      "070",
      "081",
      "090",
    ]);
    expect(SUBJECTS.filter((s) => s.program === "ir")).toHaveLength(7);
  });
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
});

describe("the classification: exactly one home per item", () => {
  const sources = [
    ...EXERCISES.map((e) => e.id),
    ...DRILL_TEMPLATES.map((t) => t.id),
    ...Object.keys(FLIGHT_META),
    ...LIBRARY_BASES,
  ];
  const briefings = new Set(CRAFTED_BRIEFINGS.map((b) => b.id));
  const courses = SAMPLES.map((s) => s.id).filter((id) => !briefings.has(id));
  it("has one row for every lesson, drill, scenario, circuit, procedure and built-in course, and no other", () => {
    const known = new Set([
      ...sources,
      ...courses,
      ...LIBRARY_PLAN.map((p) => p.id),
    ]);
    for (const id of [...sources, ...courses])
      expect(CLASSIFICATION[id], id).toBeTruthy();
    for (const id of Object.keys(CLASSIFICATION))
      expect(known.has(id), id).toBe(true);
  });
  it("homes every subject that exists, and points 'also useful' only into other programmes", () => {
    for (const [id, r] of Object.entries(CLASSIFICATION)) {
      expect(isSubjectId(r.home), `${id} → ${r.home}`).toBe(true);
      expect([1, 2, 3], id).toContain(r.level);
      const home = subjectDef(r.home).program;
      for (const a of r.also ?? []) {
        expect(isSubjectId(a), `${id} also ${a}`).toBe(true);
        expect(subjectDef(a).program, `${id} also ${a}`).not.toBe(home);
      }
    }
  });
  it("gives every registered library course and every planned one a home (a new course must be classified)", () => {
    for (const d of LIBRARY_COURSES)
      expect(
        CLASSIFICATION[d.id],
        `${d.id}: add it to src/library/classification.ts`,
      ).toBeTruthy();
    for (const p of LIBRARY_PLAN)
      expect(
        CLASSIFICATION[p.id],
        `${p.id}: add it to src/library/classification.ts`,
      ).toBeTruthy();
  });
  it("keeps a library course on its registry programme's shelf, but for the deliberate moves", () => {
    // radio phraseology is Part-FCL subject Communications: its registry says Club, its home is LAPL · PPL
    const moved = new Set([
      "sample-lib-club-phraseology",
      "sample-lib-club-teaching",
    ]);
    for (const p of LIBRARY_PLAN) {
      if (moved.has(p.id)) continue;
      expect(subjectDef(CLASSIFICATION[p.id].home).program, p.id).toBe(
        shelfOfCourseProgram(p.program),
      );
    }
  });
  it("files a library course nobody classified yet from its program and its words", () => {
    expect(guessSubject("ppl", ["ppl-meteorology"])).toBe("ppl.met");
    expect(guessSubject("ir", ["ir-ils-loc"])).toBe("ir.app");
    expect(guessSubject("atpl", ["atpl-062-radio"])).toBe("atpl.062");
    expect(guessSubject("ir", ["zzz"])).toBe("ir.proc");
    const e = {
      id: "sample-lib-ir-holding-entries",
      tags: [] as string[],
      shelf: "sample" as const,
      sample: true,
    };
    expect(coursePlacement(e, () => "ir").home).toBe("ir.hold");
  });

  const items = all();
  it("files every item once, at a level, in both languages; the shelf counts add up to the total", () => {
    const keys = items.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const i of items) {
      expect(isSubjectId(i.home), i.key).toBe(true);
      expect([1, 2, 3], i.key).toContain(i.level);
      expect(i.title.en.length, i.key).toBeGreaterThan(0);
      expect(i.title.fr?.length ?? 0, i.key).toBeGreaterThan(0);
      for (const a of i.also)
        expect(subjectDef(a).program, i.key).not.toBe(programOf(i));
    }
    const n = programCounts(items);
    expect(Object.values(n).reduce((a, b) => a + b, 0)).toBe(items.length);
    const s = subjectCounts(items);
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBe(items.length);
    const sh = shelves(items);
    expect(sh.reduce((a, x) => a + x.total, 0) + n.discover).toBe(items.length);
  });
  it("holds every kind: courses, what opens the cockpit, every library checklist", () => {
    const k = kindCounts(items);
    expect(k.course).toBeGreaterThanOrEqual(4);
    expect(k.sim).toBe(
      EXERCISES.length +
        DRILL_TEMPLATES.length +
        Object.keys(FLIGHT_META).length,
    );
    expect(k.proc).toBe(LIBRARY_BASES.length);
    const n = programCounts(items);
    for (const p of ["ppl", "ir", "atpl", "club"] as const)
      expect(n[p], p).toBeGreaterThan(0);
    // the night rating borrows: its failures and attitudes live in LAPL · PPL and IR, pointed from there
    expect(
      shelves(items).find((x) => x.program === "night")!.alsoHere,
    ).toBeGreaterThan(4);
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
      else if (i.kind === "proc") expect(k).toBe("procedure");
      else expect(["lesson", "drill", "scenario"]).toContain(k);
    }
  });
  it("puts a club's copy of a checklist where the original was, and a new club procedure in Club", () => {
    const base = libraryFor("en").find((p) => p.id.startsWith("c172.efato"))!;
    const copy = {
      ...base,
      id: "club-efato",
      source: "club" as const,
      basedOn: base.id,
    };
    const fresh = {
      ...base,
      id: "club-new",
      source: "club" as const,
      basedOn: undefined,
    };
    const list = all("en", { procedures: [copy, fresh] });
    expect(list.find((i) => i.key === "proc:club-efato")).toMatchObject({
      home: "ppl.emer",
      sub: "clubChecklist",
    });
    expect(list.find((i) => i.key === "proc:club-new")?.home).toBe(
      "club.drills",
    );
  });
});

describe("course placement", () => {
  const base = {
    id: "x",
    tags: [] as string[],
    shelf: "draft" as const,
    sample: false,
  };
  it("follows the subject the author filed, the table, the author's program, the registry, the tags", () => {
    expect(
      coursePlacement({
        ...base,
        course: { program: "ir", subject: "ir.hold" },
      }).home,
    ).toBe("ir.hold");
    expect(
      coursePlacement({ ...base, course: { program: "lapl-ppl" } }).home,
    ).toBe("ppl.prep");
    expect(
      coursePlacement({ ...base, course: { program: ["atpl"], level: 3 } }),
    ).toMatchObject({ home: "atpl.010", level: 3 });
    expect(
      coursePlacement({ ...base, id: "sample-maths-ifr", sample: true }).home,
    ).toBe("ir.proc");
    // the registry says Club, the table says LAPL · PPL › Communications
    expect(
      coursePlacement(
        { ...base, id: "sample-lib-club-phraseology", sample: true },
        () => "club",
      ).home,
    ).toBe("ppl.com");
    expect(coursePlacement({ ...base, tags: ["vfr", "maths"] }).home).toBe(
      "ppl.fpp",
    );
    // a copy of a sample stays where the sample lives
    expect(
      coursePlacement({ ...base, course: { sample: "sample-holding" } }).home,
    ).toBe("ir.hold");
    // an imported pack with nothing else lands in Club › Club courses, the author's own course in My courses
    expect(coursePlacement({ ...base, shelf: "club" }).home).toBe(
      "club.courses",
    );
    expect(coursePlacement(base).home).toBe("instructors.mine");
  });
});

describe("the landing", () => {
  it("shows the full 'Where to start?' to a newcomer, Continue to a returning student", () => {
    expect(isNewcomer(all())).toBe(true);
    const now = Date.now();
    const at = (min: number) => new Date(now - min * 60_000).toISOString();
    const items = all("en", {
      lessons: {
        "hold-direct": { passed: false, best: 40, attempts: 2, last: at(5) },
        "bai-sl": { passed: true, best: 90, attempts: 1, last: at(1) },
        "nav-arc": { passed: false, best: 10, attempts: 1, last: at(60) },
      },
    });
    expect(isNewcomer(items)).toBe(false);
    expect(continueItems(items).map((i) => i.key)).toEqual([
      "lesson:hold-direct",
      "lesson:nav-arc",
    ]);
    // straight and level is a PPL exercise (Part-FCL): its pass counts on the LAPL · PPL shelf, in Aircraft handling
    const ppl = shelves(items).find((s) => s.program === "ppl")!;
    expect(ppl.done).toBe(1);
    expect(
      ppl.groups[1].subjects.find((x) => x.subject.id === "ppl.hand"),
    ).toMatchObject({ done: 1 });
  });
  it("lists the shelves as a table of contents, every subject with its count", () => {
    const items = all();
    const sh = shelves(items);
    expect(sh.map((s) => s.program)).toEqual(SHELF_IDS);
    const ppl = sh.find((s) => s.program === "ppl")!;
    expect(ppl.groups.map((g) => g.group)).toEqual(["theory", "flight"]);
    expect(ppl.groups[0].subjects).toHaveLength(9);
    expect(ppl.alsoHere).toBeGreaterThan(0);
    const emer = ppl.groups[1].subjects.find(
      (s) => s.subject.id === "ppl.emer",
    )!;
    expect(emer.n).toBe(items.filter((i) => i.home === "ppl.emer").length);
  });
  it("Continue lists what the instructor assigned first", () => {
    const mk = (id: string): Course => ({
      ...allSamples()[0],
      id,
      sample: undefined,
      title: { en: id, fr: id },
    });
    const stored = [
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
    expect(continueItems(list)[0].key).toBe("course:mine-2");
  });
});

describe("a programme page", () => {
  const items = all();
  it("IR: its seven modules in order, lessons in curriculum order, nothing borrowed", () => {
    const v = programView(items, "ir");
    const secs = v.groups.flatMap((g) => g.sections);
    expect(secs.map((s) => s.subject.id)).toEqual([
      "ir.att",
      "ir.nav",
      "ir.hold",
      "ir.app",
      "ir.emer",
      "ir.proc",
      "ir.test",
    ]);
    expect(
      secs.every((s) => s.items.every((i) => i.home === s.subject.id)),
    ).toBe(true);
    const att = secs[0];
    expect(att.groups.map((g) => g.id)).toEqual(["course", "lesson"]);
    // the basic attitude lessons are PPL exercises: module 1 keeps partial panel, and points back to them
    expect(
      att.groups[1].items.every((i) => i.key.startsWith("lesson:pp-")),
    ).toBe(true);
    expect(att.also.map((i) => i.key)).toContain("lesson:bai-sl");
    expect(lessonRank(items, att.groups[1].items[1])).toEqual({
      n: 2,
      of: att.groups[1].items.length,
    });
    // the missed approach at DA sits with the approaches; the checkride comes last
    expect(items.find((i) => i.key === "lesson:ma-da")?.home).toBe("ir.app");
    expect(v.total).toBe(items.filter((i) => programOf(i) === "ir").length);
  });
  it("orders a subject: courses, sim lessons, failure drills, graded routes, free practice, checklists", () => {
    const order = [
      "course",
      "lesson",
      "drill",
      "circuit",
      "scenario",
      "checklist",
    ];
    for (const p of SHELF_IDS)
      for (const s of programView(items, p).groups.flatMap((g) => g.sections)) {
        const ranks = s.groups.map((g) => order.indexOf(g.id));
        expect(
          [...ranks].sort((a, b) => a - b),
          s.subject.id,
        ).toEqual(ranks);
      }
  });
  it("LAPL · PPL: theory then flight, the empty subjects on one line, 'Also useful here' from other shelves", () => {
    const v = programView(items, "ppl");
    expect(v.groups.map((g) => g.group)).toEqual(["theory", "flight"]);
    const theory = v.groups[0];
    expect(theory.empty.map((s) => s.id)).toContain("ppl.ops");
    expect(
      theory.sections.every(
        (s) => s.total > 0 || s.also.length > 0 || s.soon.length > 0,
      ),
    ).toBe(true);
    const flight = v.groups[1].sections;
    const emer = flight.find((s) => s.subject.id === "ppl.emer")!;
    expect(emer.also.length).toBeGreaterThan(0);
    expect(emer.also.every((i) => programOf(i) !== "ppl")).toBe(true);
    // the alternator and the flap failure are core C172 emergencies
    expect(emer.items.map((i) => i.key)).toEqual(
      expect.arrayContaining(["drill:d-flaps"]),
    );
    expect(
      emer.items.some((i) => i.key.startsWith("proc:c172.alternator")),
    ).toBe(true);
    // the flight modules start with a lesson to fly: straight and level
    const hand = flight.find((s) => s.subject.id === "ppl.hand")!;
    expect(hand.groups.find((g) => g.id === "lesson")?.items[0].key).toBe(
      "lesson:bai-sl",
    );
    const bif = flight.find((s) => s.subject.id === "ppl.bif")!;
    expect(bif.items.map((i) => i.key)).toContain("lesson:bai-unusual");
    expect(bif.also.map((i) => i.key)).toContain("lesson:pp-unusual");
  });
  it("a subject with no item of its own still shows what other programmes hold for it, never a dash", () => {
    const v = programView(items, "atpl");
    const radio = v.groups
      .flatMap((g) => g.sections)
      .find((s) => s.subject.id === "atpl.062")!;
    expect(radio.total).toBe(0);
    expect(radio.also.map((i) => i.key)).toEqual(
      expect.arrayContaining([
        "course:sample-vor",
      ]),
    );
    expect(v.index.find((x) => x.subject.id === "atpl.062")).toMatchObject({
      n: 0,
      also: radio.also.length,
    });
    expect(v.groups.flatMap((g) => g.empty).map((s) => s.id)).not.toContain(
      "atpl.062",
    );
    const xc = programView(items, "ppl")
      .groups.flatMap((g) => g.sections)
      .find((s) => s.subject.id === "ppl.xc")!;
    expect(xc.also.map((i) => i.key)).toContain("course:sample-vor");
    // the landing counts the same pointers
    const sh = shelves(items).find((x) => x.program === "atpl")!;
    expect(
      sh.groups[0].subjects.find((x) => x.subject.id === "atpl.062")?.also,
    ).toBe(radio.also.length);
  });
  it("shows the planned courses that are not written yet as 'Soon', in their subject", () => {
    const planned = plannedItems(items);
    for (const p of planned) {
      expect(
        items.some((i) => i.key === `course:${p.id}`),
        p.id,
      ).toBe(false);
      expect(isSubjectId(p.home), p.id).toBe(true);
    }
    const ids = new Set(items.map((i) => i.key));
    for (const p of LIBRARY_PLAN)
      expect(
        ids.has(`course:${p.id}`) || planned.some((x) => x.id === p.id),
        p.id,
      ).toBe(true);
  });
  it("the one filter keeps a family and counts every family in the scope", () => {
    const v = programView(items, "ir", "proc");
    const secs = v.groups.flatMap((g) => g.sections);
    expect(secs.length).toBeGreaterThan(0);
    expect(secs.every((s) => s.items.every((i) => i.kind === "proc"))).toBe(
      true,
    );
    expect(v.kinds.all).toBe(v.kinds.course + v.kinds.sim + v.kinds.proc);
  });
});

describe("search", () => {
  const items = all("fr", { procedures: libraryFor("fr") });
  it("searches both languages, accents ignored, and groups the results by home in syllabus order", () => {
    expect(
      filterItems(items, { q: "entree decalee" }).map((i) => i.key),
    ).toContain("lesson:hold-teardrop");
    expect(filterItems(items, { q: "teardrop" }).map((i) => i.key)).toContain(
      "lesson:hold-teardrop",
    );
    const v = searchView(items, "attente");
    expect(v.groups[0].subject.id).toBe("ir.hold");
    expect(v.total).toBe(v.groups.reduce((a, g) => a + g.items.length, 0));
    const vor = searchView(items, "vor");
    const flat = vor.groups.flatMap((g) => g.items);
    expect(flat.length).toBeGreaterThan(2);
    // a title match first, then syllabus order: lesson ranks stay in order inside a subject
    for (const g of vor.groups)
      for (let k = 1; k < g.items.length; k++)
        expect(matchTier(g.items[k - 1], "vor")).toBeGreaterThanOrEqual(
          matchTier(g.items[k], "vor"),
        );
    const hold = searchView(items, "attente").groups.find(
      (g) => g.subject.id === "ir.hold",
    )!;
    const ranks = hold.items
      .filter((i) => i.sub === "lesson" && matchTier(i, "attente") === 2)
      .map((i) => lessonRank(items, i)!.n);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(searchView(items, "zzzz-nothing").total).toBe(0);
  });
  it("finds a subject by its name, synonyms and planned courses, even when nothing is shelved there yet", () => {
    const law = searchView(items, "droit aérien");
    expect(law.subjects.map((x) => x.subject.id)).toContain("ppl.law");
    const air = searchView(items, "espace aérien");
    expect(air.subjects.map((x) => x.subject.id)).toContain("ppl.law");
    expect(
      searchView(items, "airspace").subjects.map((x) => x.subject.id),
    ).toContain("ppl.law");
    const mb = searchView(items, "masse et centrage");
    expect(mb.subjects.map((x) => x.subject.id)).toEqual(
      expect.arrayContaining(["atpl.031", "ppl.fpp"]),
    );
    expect(
      searchView(items, "météo").subjects.map((x) => x.subject.id),
    ).toContain("ppl.met");
    expect(
      searchView(items, "phraséologie").subjects.map((x) => x.subject.id),
    ).toContain("ppl.com");
    // the pilot's words for the EFATO drill
    expect(
      filterItems(items, { q: "panne moteur après le décollage" }).map(
        (i) => i.key,
      ),
    ).toContain("drill:d-efato");
    expect(
      filterItems(items, { q: "atterrissage forcé" }).map((i) => i.key),
    ).toContain("drill:d-engine-cruise");
  });
  it("finds a subject by its name and keeps to a programme when asked", () => {
    const v = searchView(items, "attente", "all", "ppl");
    expect(v.groups.every((g) => g.subject.program === "ppl")).toBe(true);
    const sim = searchView(items, "attente", "sim");
    expect(
      sim.groups.flatMap((g) => g.items).every((i) => i.kind === "sim"),
    ).toBe(true);
  });
  it("stays fast with a big library", () => {
    const big: LibItem[] = [];
    for (let k = 0; k < 6; k++)
      for (const i of items) big.push({ ...i, key: `${i.key}#${k}` });
    const t0 = performance.now();
    for (const q of ["ils", "panne moteur", "vor dme"]) searchView(big, q);
    for (const p of SHELF_IDS) programView(big, p);
    shelves(big);
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
