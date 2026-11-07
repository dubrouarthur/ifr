// The unified library's sources, as items (pure: the callers read the stores and pass plain data). Courses come
// from the course library's entries (course/ui/library.ts libraryEntries: stored courses, then the built-in samples);
// a sample briefing written for a sim lesson is not listed on its own: it becomes that lesson's cover and opens with
// it. Sim lessons, failure drills, scenarios and school circuits come from the tables of meta.ts, procedures and
// checklists from the procedure store (the library in the screen language and every club procedure).
import type { CourseProgram, Lang, L10n } from "../course/types";
import type { LibraryEntry } from "../course/ui/library";
import type { Procedure, ProcCategory } from "../train/procedureTypes";
import {
  COURSE_META,
  DRILL_META,
  FLIGHT_META,
  LESSON_META,
  LESSON_ORDER,
  PROCEDURE_META,
  STAGE_LABEL,
  TAG_PROGRAMS,
  type DrillPhaseId,
} from "./meta";
import type { LibItem } from "./model";
import {
  expandPrograms,
  programDef,
  type Level,
  type ProgramId,
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

const uniq = <T>(xs: readonly T[]): T[] =>
  xs.filter((x, i) => xs.indexOf(x) === i);

// ------------------------------------------------------------------ courses
/** Where a course sits: its own program field, else the built-in placement (meta.ts), else the library registry,
 *  else its tags, else the Club shelf for an imported course; level likewise. */
export function coursePlacement(
  e: Pick<LibraryEntry, "id" | "tags" | "shelf" | "sample"> & {
    course?: {
      program?: CourseProgram | CourseProgram[];
      level?: Level;
      sample?: string;
    } | null;
  },
  sampleProgram?: (id: string) => CourseProgram | undefined,
): { programs: ProgramId[]; level: Level } {
  const sid = e.sample ? e.id : (e.course?.sample ?? e.id);
  const meta = COURSE_META[sid];
  let programs = expandPrograms(e.course?.program);
  if (!programs.length && meta?.programs) programs = [...meta.programs];
  if (!programs.length) programs = expandPrograms(sampleProgram?.(sid));
  if (!programs.length)
    programs = uniq(
      (e.tags ?? [])
        .map((t) => TAG_PROGRAMS[t.toLowerCase()])
        .filter((x): x is ProgramId => !!x),
    );
  if (e.shelf === "club" && !programs.includes("club")) programs.push("club");
  const level: Level =
    e.course?.level ??
    meta?.level ??
    (programs[0] ? programDef(programs[0]).level : 2);
  return { programs, level };
}

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
    const { programs, level } = coursePlacement(e, o.sampleProgram);
    const blurb = e.summary ?? o.sampleBlurb?.(e.id);
    out.push({
      key: `course:${e.id}`,
      kind: "course",
      sub: "course",
      programs,
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
    return {
      key: `lesson:${id}`,
      kind: "flight",
      sub: "lesson",
      programs: [...m.programs],
      level: m.level,
      title: { en: m.en, fr: m.fr },
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
      words: `${id} simulator simulateur cockpit`,
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
    const meta = PROCEDURE_META[base];
    const club = p.source === "club";
    const programs: ProgramId[] = club
      ? uniq<ProgramId>(["club", ...(meta?.programs ?? ["ppl"])])
      : [...(meta?.programs ?? ["ppl"])];
    const cat = cats?.[p.category];
    const mem = p.items.filter((x) => x.memory).length;
    return {
      key: `proc:${p.id}`,
      kind: "procedure",
      sub: club ? "clubProcedure" : "checklist",
      programs,
      level: meta?.level ?? 2,
      title: { en: p.title, fr: p.title },
      ...(p.summary ? { blurb: { en: p.summary, fr: p.summary } } : {}),
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
      words: `${p.ref ?? ""} ${mem ? "memory mémoire" : ""} checklist ${p.lang !== lang ? p.lang : ""}`,
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
      kind: "flight",
      sub: "drill",
      programs: ["club"],
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
  const tpl = Object.entries(DRILL_META).map(
    ([id, m], i): LibItem => ({
      key: `drill:${id}`,
      kind: "flight",
      sub: "drill",
      programs: [...m.programs],
      level: m.level,
      title: m.name,
      eyebrow: PHASE_LABEL[m.phase],
      minutes: m.phase === "approach" ? 15 : 10,
      source: "builtin",
      order: 100 + i,
      open: { k: "drill", id },
      facet: m.phase,
      aircraft: "C172S",
      words: `${m.trains.join(" ")} drill exercice panne failure`,
    }),
  );
  return [...mine, ...tpl];
}
export function flightItems(): LibItem[] {
  return Object.entries(FLIGHT_META).map(
    ([id, m], i): LibItem => ({
      key: `flight:${id}`,
      kind: "flight",
      sub: m.type,
      programs: [...m.programs],
      level: m.level,
      title: { en: m.en, fr: m.fr },
      eyebrow: { en: `${m.airport} · ${m.tag}`, fr: `${m.airport} · ${m.tag}` },
      minutes: m.minutes,
      source: "builtin",
      order: i,
      open: { k: "scenario", id },
      facet: m.tag,
      words: `${m.airport} ${m.tag} ${id}`,
    }),
  );
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
