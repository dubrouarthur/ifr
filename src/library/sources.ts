// The unified library's sources, as items (pure: the callers read the stores and pass plain data). Courses come
// from the course library's entries (course/ui/library.ts libraryEntries: stored courses, then the built-in samples);
// a sample briefing written for a sim lesson is not listed on its own: it becomes that lesson's cover and opens with
// it. Sim lessons, failure drills, scenarios and school circuits come from the tables of meta.ts, procedures and
// checklists from the procedure store (the library in the screen language and every club procedure). Every item
// gets its ONE home from classification.ts; a course nobody classified (an author's, a club's, one a library author
// adds later) is filed from its own subject, its program and its words (programs.ts guessSubject).
import type { CourseProgram, Lang, L10n } from "../course/types";
import type { LibraryEntry } from "../course/ui/library";
import type { Procedure, ProcCategory } from "../train/procedureTypes";
import {
  DRILL_META,
  FLIGHT_META,
  LESSON_META,
  LESSON_ORDER,
  STAGE_LABEL,
  type DrillPhaseId,
} from "./meta";
import { CLASSIFICATION, type Placement } from "./classification";
import type { LibItem } from "./model";
import {
  guessSubject,
  isProgramId,
  isSubjectId,
  programDef,
  shelfOfCourseProgram,
  subjectDef,
  type Level,
  type ProgramId,
  type SubjectId,
} from "./programs";

/** A lesson's record in the cockpit's progress store (ui/learn.ts, localStorage 'ifr.progress.v1'). */
export interface LessonRecord {
  passed: boolean;
  best: number;
  attempts: number;
  last: string;
}
/** A club's saved failure drill (train/drills.ts listDrills, kind 'club'), as the Flight Center lists it. */
export interface ClubDrill {
  id: string;
  name: string;
  desc?: string;
  phase?: string;
  assignee?: string;
}

export interface SourceInput {
  lang: Lang;
  /** the course library's entries */
  courses?: readonly LibraryEntry[];
  /** a built-in sample's program in the course library registry (samples SampleDef.program) */
  sampleProgram?: (id: string) => CourseProgram | undefined;
  /** a built-in sample's one-line blurb */
  sampleBlurb?: (id: string) => L10n | undefined;
  lessons?: Readonly<Record<string, LessonRecord>>;
  procedures?: readonly Procedure[];
  /** the category names (train/procedureLibrary.ts CATEGORY_LABELS) */
  categories?: Readonly<Record<ProcCategory, Record<Lang, string>>>;
  clubDrills?: readonly ClubDrill[];
  /** list the simulator's flights (lessons, drills, scenarios); default true */
  flights?: boolean;
}

/** The classified home of a built-in item; an unknown id (a new club procedure, a club drill) gets `fallback`. */
export function placementOf(
  id: string,
  fallback: SubjectId,
  level: Level = 2,
): Placement {
  return CLASSIFICATION[id] ?? { home: fallback, level };
}

// ------------------------------------------------------------------ courses
/** The words a course is filed by when it has no row: its id's slug, its tags, its title. */
const courseWords = (
  id: string,
  tags: readonly string[],
  title?: { en: string; fr?: string },
) => [id.replace(/^sample-(lib-)?/, ""), ...tags, title?.en ?? ""];
/**
 * Where a course lives (its ONE home) and its level:
 * - the subject the author filed it in (`course.subject`);
 * - a built-in course (or a copy of one): its row in the classification table;
 * - an author's own `program`, or a library course's registry program: the subject its words match in that
 *   programme (a library course an author adds later lands there by itself);
 * - its tags (a programme's name), then an imported club pack in Club › Club courses, then the author's own
 *   course in Instructors › My courses and drafts.
 */
export function coursePlacement(
  e: Pick<LibraryEntry, "id" | "tags" | "shelf" | "sample"> & {
    title?: { en: string; fr?: string };
    course?: {
      program?: CourseProgram | CourseProgram[];
      subject?: string;
      level?: Level;
      sample?: string;
    } | null;
  },
  sampleProgram?: (id: string) => CourseProgram | undefined,
): { home: SubjectId; also: readonly SubjectId[]; level: Level } {
  const c = e.course;
  const sid = e.sample ? e.id : (c?.sample ?? e.id);
  const row = CLASSIFICATION[sid];
  const words = courseWords(e.id, e.tags ?? [], e.title);
  const own =
    [c?.program]
      .flat()
      .map((p) => shelfOfCourseProgram(p))
      .find(Boolean) ?? null;
  let home: SubjectId | null = null;
  let also: readonly SubjectId[] = [];
  const filed = c?.subject;
  if (isSubjectId(filed)) home = filed;
  else if (row && (e.sample || !own || subjectDef(row.home).program === own)) {
    home = row.home;
    also = e.sample ? (row.also ?? []) : [];
  } else if (own) home = guessSubject(own, words);
  else {
    const reg = shelfOfCourseProgram(sampleProgram?.(sid));
    if (reg) home = guessSubject(reg, words);
  }
  if (!home) {
    const tag = (e.tags ?? [])
      .map(
        (t) =>
          shelfOfCourseProgram(t.toLowerCase()) ?? TAG_SHELF[t.toLowerCase()],
      )
      .find((x): x is ProgramId => !!x && isProgramId(x));
    if (tag) home = guessSubject(tag, words);
  }
  home ??= e.shelf === "club" ? "club.courses" : "instructors.mine";
  const level: Level =
    c?.level ??
    (row && row.home === home ? row.level : undefined) ??
    programDef(subjectDef(home).program).level;
  return { home, also, level };
}
/** Tags that name a shelf (a course imported without a program). */
const TAG_SHELF: Readonly<Record<string, ProgramId>> = {
  vfr: "ppl",
  nuit: "night",
  ifr: "ir",
  holding: "ir",
  instructor: "instructors",
  fi: "instructors",
};

/** The lesson a built-in briefing deck was written for (it is listed as that lesson's cover, not as a course). */
export function briefingLessonOf(e: LibraryEntry): string | null {
  if (!e.sample || !e.briefing) return null;
  const ex = e.course?.briefingFor?.exerciseId;
  return ex && LESSON_META[ex] ? ex : null;
}

export function courseItems(
  list: readonly LibraryEntry[],
  o: Pick<SourceInput, "sampleProgram" | "sampleBlurb"> = {},
): LibItem[] {
  const out: LibItem[] = [];
  list.forEach((e, i) => {
    if (briefingLessonOf(e)) return;
    const { home, also, level } = coursePlacement(e, o.sampleProgram);
    const purpose = e.sample ? CLASSIFICATION[e.id]?.purpose : undefined;
    const blurb = purpose ?? e.summary ?? o.sampleBlurb?.(e.id);
    out.push({
      key: `course:${e.id}`,
      kind: "course",
      sub: "course",
      home,
      also,
      level,
      title: e.title,
      ...(blurb ? { blurb } : {}),
      ...(e.minutes !== undefined ? { minutes: e.minutes } : {}),
      count: { n: e.steps, unit: "steps" },
      source: e.sample ? "builtin" : e.shelf === "club" ? "club" : "mine",
      ...(e.assigned ? { assigned: true } : {}),
      ...(e.shelf === "draft" ? { draft: true } : {}),
      ...(e.progress
        ? {
            progress: {
              done: e.progress.index,
              total: e.progress.total,
              ...(e.progress.at ? { at: e.progress.at } : {}),
            },
          }
        : {}),
      order: i,
      open: {
        k: "course",
        id: e.id,
        ...(e.progress ? { stepId: e.progress.stepId } : {}),
      },
      deck: e.id,
      words: [...e.tags, e.author?.club ?? "", e.author?.name ?? ""].join(" "),
      langs: e.langs,
    });
  });
  return out;
}

// ------------------------------------------------------------------ sim lessons
export function lessonItems(
  rec: Readonly<Record<string, LessonRecord>> = {},
  briefings: ReadonlyMap<string, string> = new Map(),
): LibItem[] {
  return LESSON_ORDER.map((id, i): LibItem => {
    const m = LESSON_META[id];
    const r = rec[id];
    const deck = briefings.get(id);
    const pl = placementOf(id, "ir.att");
    return {
      key: `lesson:${id}`,
      kind: "sim",
      sub: "lesson",
      home: pl.home,
      also: pl.also ?? [],
      level: pl.level,
      title: { en: m.en, fr: m.fr },
      ...(pl.purpose ? { blurb: pl.purpose } : {}),
      eyebrow: STAGE_LABEL[m.stage],
      minutes: m.minutes,
      source: "builtin",
      ...(r && r.attempts > 0
        ? {
            progress: {
              done: r.passed ? 1 : 0,
              total: 1,
              passed: r.passed,
              attempts: r.attempts,
              best: r.best,
              ...(r.last ? { at: r.last } : {}),
            },
          }
        : {}),
      order: i,
      open: { k: "lesson", id },
      ...(deck ? { deck } : {}),
      facet: m.stage,
      words: `${id} simulator simulateur cockpit ${pl.words ?? ""}`,
    };
  });
}

// ------------------------------------------------------------------ procedures
export const procBase = (p: Pick<Procedure, "id" | "basedOn">): string =>
  (p.basedOn ?? p.id).replace(/\.(en|fr)$/, "");
/** "Mixture — IDLE CUT-OFF" → challenge and response. */
export function splitItem(text: string): { c: string; r: string } {
  const m = /^(.*?)\s+[—–-]\s+(.+)$/.exec(text);
  return m ? { c: m[1], r: m[2] } : { c: text, r: "" };
}
export function procedureItems(
  list: readonly Procedure[],
  cats?: SourceInput["categories"],
  lang: Lang = "en",
): LibItem[] {
  return list.map((p, i): LibItem => {
    const base = procBase(p);
    const club = p.source === "club";
    // a club's copy takes its original's place; a club's brand-new procedure lives in Club › checks and drills
    const pl = placementOf(base, club ? "club.drills" : "ppl.emer");
    const cat = cats?.[p.category];
    const mem = p.items.filter((x) => x.memory).length;
    return {
      key: `proc:${p.id}`,
      kind: "proc",
      sub: club ? "clubChecklist" : "checklist",
      home: pl.home,
      also: pl.also ?? [],
      level: pl.level,
      title: { en: p.title, fr: p.title },
      ...(p.summary
        ? { blurb: { en: p.summary, fr: p.summary } }
        : pl.purpose
          ? { blurb: pl.purpose }
          : {}),
      ...(cat ? { eyebrow: { en: cat.en, fr: cat.fr } } : {}),
      count: { n: p.items.length, unit: "items" },
      source: club ? "club" : "builtin",
      order: i,
      open: { k: "procedure", id: p.id },
      facet: p.category,
      aircraft: p.aircraft,
      lines: p.items
        .slice(0, 6)
        .map((x) => ({ text: x.text, memory: x.memory })),
      words: `${p.ref ?? ""} ${mem ? "memory mémoire" : ""} checklist check-list ${p.lang !== lang ? p.lang : ""} ${pl.words ?? ""}`,
      langs: [p.lang],
    };
  });
}

// ------------------------------------------------------------------ failure drills, scenarios, school circuits
export const PHASE_LABEL: Record<DrillPhaseId, L10n> = {
  lineup: { en: "Lined up", fr: "Aligné piste" },
  climbout: { en: "After take-off", fr: "Montée initiale" },
  cruise: { en: "Cruise", fr: "Croisière" },
  approach: { en: "Approach", fr: "Approche" },
};
export function drillItems(club: readonly ClubDrill[] = []): LibItem[] {
  const mine = club.map(
    (d, i): LibItem => ({
      key: `drill:${d.id}`,
      kind: "sim",
      sub: "drill",
      home: "club.drills",
      also: [],
      level: 2,
      title: { en: d.name, fr: d.name },
      ...(d.desc ? { blurb: { en: d.desc, fr: d.desc } } : {}),
      ...(d.phase && d.phase in PHASE_LABEL
        ? { eyebrow: PHASE_LABEL[d.phase as DrillPhaseId] }
        : {}),
      source: "club",
      order: i,
      open: { k: "drill", id: d.id },
      facet: d.phase ?? "cruise",
      aircraft: "C172S",
      words: d.assignee ?? "",
    }),
  );
  const tpl = Object.entries(DRILL_META).map(([id, m], i): LibItem => {
    const pl = placementOf(id, "club.drills");
    return {
      key: `drill:${id}`,
      kind: "sim",
      sub: "drill",
      home: pl.home,
      also: pl.also ?? [],
      level: pl.level,
      title: m.name,
      ...(pl.purpose ? { blurb: pl.purpose } : {}),
      eyebrow: PHASE_LABEL[m.phase],
      minutes: m.phase === "approach" ? 15 : 10,
      source: "builtin",
      order: 100 + i,
      open: { k: "drill", id },
      facet: m.phase,
      aircraft: "C172S",
      words: `${m.trains.join(" ")} drill exercice panne failure ${pl.words ?? ""}`,
    };
  });
  return [...mine, ...tpl];
}
export function flightItems(): LibItem[] {
  return Object.entries(FLIGHT_META).map(([id, m], i): LibItem => {
    const pl = placementOf(id, "ir.proc");
    return {
      key: `flight:${id}`,
      kind: "sim",
      sub: m.type,
      home: pl.home,
      also: pl.also ?? [],
      level: pl.level,
      title: { en: m.en, fr: m.fr },
      ...(pl.purpose ? { blurb: pl.purpose } : {}),
      eyebrow: { en: `${m.airport} · ${m.tag}`, fr: `${m.airport} · ${m.tag}` },
      minutes: m.minutes,
      source: "builtin",
      order: i,
      open: { k: "scenario", id },
      facet: m.tag,
      aircraft: m.airport,
      words: `${m.airport} ${m.tag} ${id} ${pl.words ?? ""}`,
    };
  });
}

/** Every item of the library. */
export function libraryItems(x: SourceInput): LibItem[] {
  const courses = x.courses ?? [];
  // the built-in briefing decks written for a sim lesson: that lesson's cover
  const briefings = new Map<string, string>();
  for (const e of courses) {
    const ex = briefingLessonOf(e);
    if (ex && !briefings.has(ex)) briefings.set(ex, e.id);
  }
  const flights = x.flights !== false;
  return [
    ...courseItems(courses, x),
    ...(flights ? lessonItems(x.lessons, briefings) : []),
    ...(flights ? drillItems(x.clubDrills) : []),
    ...(flights ? flightItems() : []),
    ...procedureItems(x.procedures ?? [], x.categories, x.lang),
  ];
}
