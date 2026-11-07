// The unified library's model (pure, no DOM). One list of items, whatever they are (a course of slides, a sim
// lesson, a failure drill, a graded route, a free practice, a checklist), each with exactly ONE home: a subject of a
// programme (programs.ts). The views the page shows come from here:
//   landing     Continue (started, assigned), "Where to start?" (newcomer or not) and the shelves as a table of
//               contents, with counts per subject that add up to the library's total
//   programme   its subjects in syllabus order, each with its items in the fixed kind order, the subjects with no
//               content yet gathered on one line, and "Also useful here" pointers from other programmes
//   search      every match, grouped by home in shelf and syllabus order ("where does this topic live?")
// The one filter is the kind family (courses · in the simulator · procedures and checklists); levels inform only.
import type { L10n, Lang } from "../course/types";
import {
  GROUP_TITLE,
  KIND_ORDER,
  PROGRAMS,
  SHELF_IDS,
  SUBJECTS,
  SUB_LABEL,
  SUB_ORDER,
  groupOf,
  subjectDef,
  subjectRank,
  subjectsOf,
  type GroupId,
  type Level,
  type LibKind,
  type LibSub,
  type ProgramId,
  type SubjectDef,
  type SubjectGroup,
  type SubjectId,
} from "./programs";
import { CLASSIFICATION } from "./classification";
import { LIBRARY_PLAN } from "../course/samples/library/catalogue";

/** What opening an item does. */
export type OpenTarget =
  | { k: "course"; id: string; stepId?: string }
  /** a sim lesson: its briefing deck, then the cockpit */
  | { k: "lesson"; id: string }
  /** a procedure's checklist (and its drill) */
  | { k: "procedure"; id: string }
  /** a failure drill (train/drills.ts template id, or a club drill id) */
  | { k: "drill"; id: string }
  /** a scenario (sim/sim.ts) or a school circuit (train/circuits.ts) */
  | { k: "scenario"; id: string };

export interface LibProgress {
  /** steps done (a course) or 1 when passed (a lesson) */
  done: number;
  total: number;
  /** a lesson: flown at least once and passed */
  passed?: boolean;
  /** a lesson: how many graded attempts */
  attempts?: number;
  /** a lesson: best score */
  best?: number;
  /** last time (ISO) */
  at?: string;
}

export interface LibItem {
  /** unique across kinds: "course:<id>", "lesson:<id>", "proc:<id>", "drill:<id>", "flight:<id>" */
  key: string;
  kind: LibKind;
  sub: LibSub;
  /** its one home: drawn and counted there, nowhere else */
  home: SubjectId;
  /** subjects of OTHER programmes where it is also useful: a pointer, never counted there */
  also: readonly SubjectId[];
  level: Level;
  title: L10n;
  /** one line: what you will be able to do */
  blurb?: L10n;
  /** the small line over the title (a lesson's stage, a procedure's category) */
  eyebrow?: L10n;
  minutes?: number;
  /** what it is made of, for the meta line */
  count?: { n: number; unit: "steps" | "items" | "slides" };
  source: "builtin" | "club" | "mine";
  assigned?: boolean;
  /** an author's own course on this device */
  draft?: boolean;
  progress?: LibProgress;
  /** library order inside its kind (curriculum order, procedure order, …) */
  order: number;
  open: OpenTarget;
  /** a course: its id (its 16:9 cover is its first slide). A lesson: the briefing deck written for it, if any */
  deck?: string;
  /** a lesson: the IR stage ("S4"); a drill: its phase; a procedure: its category; a scenario: its procedure tag */
  facet?: string;
  /** a procedure or a drill: the aircraft ("C172S"); a scenario: its airport */
  aircraft?: string;
  /** a procedure: memory items, then the first lines (the checklist cover) */
  lines?: { text: string; memory: boolean }[];
  /** extra search words (tags, airport, approach) */
  words?: string;
  langs?: Lang[];
}

export const programOf = (i: Pick<LibItem, "home">): ProgramId =>
  subjectDef(i.home).program;

// ------------------------------------------------------------------ text and search
export const fold = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const both = (x?: L10n) => (x ? `${x.en} ${x.fr ?? ""}` : "");
/** Everything a search looks at, folded (both languages, accents ignored): the item and the names of its home. */
export function haystack(i: LibItem): string {
  const s = subjectDef(i.home);
  const p = PROGRAMS.find((x) => x.id === s.program)!;
  return fold(
    [
      both(i.title),
      both(i.blurb),
      both(i.eyebrow),
      both(SUB_LABEL[i.sub]),
      both(s.title),
      both(p.code),
      i.aircraft ?? "",
      i.words ?? "",
    ].join(" "),
  );
}
const cache = new WeakMap<LibItem, string>();
const hay = (i: LibItem) => {
  let s = cache.get(i);
  if (s === undefined) cache.set(i, (s = haystack(i)));
  return s;
};
/** Short words a search ignores (when something else is left to look for). */
const STOP = new Set(
  "le la les l de du des d et a au aux en un une pour sur avec the an of and to in on for with".split(
    " ",
  ),
);
/** Phrases a pilot types for a name the library uses (folded), each read as one term with its alternatives. */
const PHRASES: readonly [RegExp, readonly string[]][] = [
  [/\bespaces? aeriens?\b/g, ["airspace", "espace aerien", "espaces aeriens"]],
  [/\bm ?& ?c\b/g, ["masse et centrage", "mass and balance"]],
  [
    /\bmasse et centrage\b/g,
    ["masse et centrage", "mass and balance", "centrage"],
  ],
  [
    /\bmass and balance\b/g,
    ["mass and balance", "masse et centrage", "centrage"],
  ],
  [/\bcheck[- ]?lists?\b/g, ["checklist", "check-list"]],
  [/\bpartial panel\b/g, ["partial panel", "panne partielle", "partial-panel"]],
  [
    /\bpanne partielle\b/g,
    ["panne partielle", "partial panel", "partial-panel"],
  ],
  [
    /\bradio ?nav(igation)?\b/g,
    ["radionav", "radio navigation", "radionavigation"],
  ],
  [/\bphraseolog(ie|y)\b/g, ["phraseologie", "phraseology"]],
  [/\bmeteo(rologie|rology)?\b/g, ["meteo", "weather"]],
  [/\bdecollage\b/g, ["decollage", "take-off", "takeoff"]],
  [/\btake-?off\b/g, ["take-off", "takeoff", "decollage"]],
];
/** A query as terms, each one a list of alternatives (any of them matches): accents ignored, synonyms read. */
export function queryTerms(q: string): string[][] {
  let s = fold(q);
  const out: string[][] = [];
  PHRASES.forEach(([re, alts]) => {
    s = s.replace(re, () => {
      out.push([...alts]);
      return " ";
    });
  });
  const words = s.split(/\s+/).filter(Boolean);
  const kept = words.filter((w) => !STOP.has(w));
  for (const w of kept.length || out.length ? kept : words) out.push([w]);
  return out;
}
const hasTerm = (h: string, t: readonly string[]) =>
  t.some((w) => h.includes(w));
/** Whether a text (folded) holds every term of a query. */
export function matchesText(text: string, q: string): boolean {
  const terms = queryTerms(q);
  const h = fold(text);
  return terms.length > 0 && terms.every((t) => hasTerm(h, t));
}
/** How well an item answers a search: 0 = not at all; a title match ranks over a match anywhere else. */
export function matchScore(i: LibItem, q: string): number {
  const terms = queryTerms(q);
  if (!terms.length) return 1;
  const h = hay(i);
  if (!terms.every((t) => hasTerm(h, t))) return 0;
  const t = fold(both(i.title));
  let s = 1;
  for (const alts of terms) {
    if (hasTerm(t, alts)) s += 2;
    if (
      alts.some((w) =>
        new RegExp(`(^|[^a-z0-9])${w.replace(/[^a-z0-9]/g, "\\$&")}`).test(t),
      )
    )
      s += 1;
  }
  return s;
}
/** A title match or not: search results keep syllabus order inside each tier (lesson 1, 2, 3… stay in order). */
export const matchTier = (i: LibItem, q: string): number => {
  const s = matchScore(i, q);
  return s <= 0 ? 0 : s > 1 ? 2 : 1;
};

// ------------------------------------------------------------------ planned courses ("Soon")
/** A course of the library's plan that is not on this device yet: shown as "Soon" in its subject. */
export interface PlannedItem {
  id: string;
  home: SubjectId;
  title: L10n;
}
/** The planned courses that are not in the list yet, each in its classified home. */
export function plannedItems(list: readonly LibItem[]): PlannedItem[] {
  const have = new Set(list.map((i) => i.key));
  return LIBRARY_PLAN.filter(
    (p) => !have.has(`course:${p.id}`) && CLASSIFICATION[p.id],
  ).map((p) => ({ id: p.id, home: CLASSIFICATION[p.id].home, title: p.title }));
}
/** Extra words a subject is found by (both languages, folded), beyond its titles and its filing words. */
const SUBJECT_SEARCH: Partial<Record<SubjectId, string>> = {
  "ppl.law":
    "espace aerien espaces aeriens airspace regles de l air sera classes d espace",
  "ppl.met": "meteo weather metar taf nuages clouds",
  "ppl.com": "phraseologie phraseology radio",
  "ppl.fpp": "masse et centrage mass and balance carburant fuel devis de masse",
  "ppl.prep":
    "avant vol avant decollage before take-off takeoff mise en route visite pre-vol check-list checklist",
  "ppl.hand":
    "palier virages montee descente vol lent straight and level turns climb descent slow flight",
  "ppl.circ": "tour de piste circuit atterrissage decollage landing take-off",
  "ppl.emer":
    "panne urgence emergency failure atterrissage force forced landing",
  "ppl.bif":
    "attitudes inusuelles unusual attitudes spirale spiral vol sans visibilite",
  "ppl.xc": "navigation vor gps cross-country voyage",
  "ir.att": "panne partielle partial panel circuit visuel scan",
  "atpl.031": "masse et centrage mass and balance",
  "atpl.062": "radionavigation vor ndb ils rnav",
};
const subjectHay = new Map<SubjectId, string>();
export function subjectHaystack(s: SubjectDef): string {
  let h = subjectHay.get(s.id);
  if (h === undefined) {
    const p = PROGRAMS.find((x) => x.id === s.program)!;
    h = fold(
      [
        both(s.title),
        both(p.code),
        (s.words ?? []).join(" "),
        SUBJECT_SEARCH[s.id] ?? "",
      ].join(" "),
    );
    subjectHay.set(s.id, h);
  }
  return h;
}

// ------------------------------------------------------------------ the one filter
export interface LibFilter {
  /** a programme page, or the whole library */
  program: ProgramId | "all";
  kind: LibKind | "all";
  q: string;
}
export const NO_FILTER: LibFilter = { program: "all", kind: "all", q: "" };

/** The items a filter keeps (search included). */
export function filterItems(
  list: readonly LibItem[],
  f: Partial<LibFilter>,
): LibItem[] {
  const q = f.q?.trim() ?? "";
  const p = f.program ?? "all";
  return list.filter(
    (i) =>
      (p === "all" || programOf(i) === p) &&
      (!f.kind || f.kind === "all" || i.kind === f.kind) &&
      (!q || matchScore(i, q) > 0),
  );
}
/** How many items each family holds in a scope (the filter's counts). */
export function kindCounts(
  list: readonly LibItem[],
  f: Partial<LibFilter> = {},
): Record<LibKind | "all", number> {
  const base = filterItems(list, { ...f, kind: "all" });
  const n = { all: base.length, course: 0, sim: 0, proc: 0 };
  for (const i of base) n[i.kind]++;
  return n;
}
/** Items per shelf, from the home only: the counts add up to the total. */
export function programCounts(
  list: readonly LibItem[],
): Record<ProgramId, number> {
  const n = Object.fromEntries(PROGRAMS.map((p) => [p.id, 0])) as Record<
    ProgramId,
    number
  >;
  for (const i of list) n[programOf(i)]++;
  return n;
}
export function subjectCounts(
  list: readonly LibItem[],
): Record<SubjectId, number> {
  const n = Object.fromEntries(SUBJECTS.map((s) => [s.id, 0])) as Record<
    SubjectId,
    number
  >;
  for (const i of list) n[i.home]++;
  return n;
}

// ------------------------------------------------------------------ order and progress
const subRank = (s: LibSub) => SUB_ORDER.indexOf(s);
/** The order inside a subject: courses, sim lessons (curriculum order), failure drills, graded routes, free
 *  practice, checklists (a club's copy where the original was). */
export function compareInSubject(a: LibItem, b: LibItem): number {
  return (
    subRank(groupOf(a.sub)) - subRank(groupOf(b.sub)) ||
    // what the instructor gave comes first in its kind
    Number(!!b.assigned) - Number(!!a.assigned) ||
    (a.kind === "course"
      ? Number(a.source !== "builtin") - Number(b.source !== "builtin")
      : 0) ||
    a.order - b.order
  );
}
/** The order of the whole bookcase: shelf, subject, then inside the subject. */
export function compareInLibrary(a: LibItem, b: LibItem): number {
  return subjectRank(a.home) - subjectRank(b.home) || compareInSubject(a, b);
}
export const isDone = (i: LibItem): boolean =>
  !!i.progress &&
  (i.kind === "course"
    ? i.progress.done >= i.progress.total
    : !!i.progress.passed);
const started = (i: LibItem): boolean =>
  !!i.progress &&
  (i.kind === "course" ? i.progress.done > 0 : (i.progress.attempts ?? 0) > 0);
/** Continue: what the instructor assigned and is not done, then what the student started and has not finished,
 *  most recent first. */
export function continueItems(list: readonly LibItem[], n = 4): LibItem[] {
  const assigned = list.filter((i) => i.assigned && !isDone(i));
  const going = list
    .filter((i) => !i.assigned && started(i) && !isDone(i))
    .sort((a, b) => ((a.progress?.at ?? "") < (b.progress?.at ?? "") ? 1 : -1));
  return [...assigned, ...going].slice(0, n);
}
/** Nothing started, nothing assigned: the landing shows the full "Where to start?" block. */
export const isNewcomer = (list: readonly LibItem[]): boolean =>
  !list.some((i) => i.assigned || started(i) || isDone(i));
/** The first item of a subject (or of a programme's first subject with content), in syllabus order. */
export function firstIn(
  list: readonly LibItem[],
  where: SubjectId | ProgramId,
  sub?: LibSub,
): LibItem | undefined {
  const inIt = list.filter(
    (i) =>
      (where.includes(".") ? i.home === where : programOf(i) === where) &&
      (!sub || i.sub === sub),
  );
  return inIt.sort(compareInLibrary)[0];
}
/** A lesson's rank among the sim lessons of its subject ("Lesson 3 of 9"). */
export function lessonRank(
  list: readonly LibItem[],
  i: LibItem,
): { n: number; of: number } | null {
  if (i.sub !== "lesson") return null;
  const ls = list
    .filter((x) => x.sub === "lesson" && x.home === i.home)
    .sort(compareInSubject);
  return { n: ls.indexOf(i) + 1, of: ls.length };
}

// ------------------------------------------------------------------ the landing
export interface ShelfSubject {
  subject: SubjectDef;
  /** items homed here */
  n: number;
  done: number;
  /** items of other programmes pointed here ("Also useful here"), never counted in n */
  also: number;
  /** planned courses not here yet ("Soon") */
  soon: number;
}
/** Something to show for a subject: its own items, pointers from other programmes, or a planned course. */
export const hasAnything = (x: Pick<ShelfSubject, "n" | "also" | "soon">) =>
  x.n > 0 || x.also > 0 || x.soon > 0;
/** Pointers into each subject from other programmes, and planned courses per subject. */
function subjectExtras(list: readonly LibItem[]): {
  also: Record<string, number>;
  soon: Record<string, number>;
} {
  const also: Record<string, number> = {};
  const soon: Record<string, number> = {};
  for (const i of list) {
    const p = programOf(i);
    for (const a of i.also)
      if (subjectDef(a).program !== p) also[a] = (also[a] ?? 0) + 1;
  }
  for (const x of plannedItems(list)) soon[x.home] = (soon[x.home] ?? 0) + 1;
  return { also, soon };
}
export interface Shelf {
  program: ProgramId;
  total: number;
  done: number;
  /** items homed in other programmes that point here ("+ 6 useful, shelved in other programmes") */
  alsoHere: number;
  groups: { group: SubjectGroup | null; subjects: ShelfSubject[] }[];
}
/** The shelves of the landing (and the Flight Center's tiles), each a table of contents. */
export function shelves(list: readonly LibItem[]): Shelf[] {
  const n = subjectCounts(list);
  const done = Object.fromEntries(SUBJECTS.map((s) => [s.id, 0])) as Record<
    SubjectId,
    number
  >;
  for (const i of list) if (isDone(i)) done[i.home]++;
  const ex = subjectExtras(list);
  return SHELF_IDS.map((p) => {
    const subs = subjectsOf(p).map((s) => ({
      subject: s,
      n: n[s.id],
      done: done[s.id],
      also: ex.also[s.id] ?? 0,
      soon: ex.soon[s.id] ?? 0,
    }));
    const groups: Shelf["groups"] = [];
    for (const s of subs) {
      const g = s.subject.group ?? null;
      let row = groups.find((x) => x.group === g);
      if (!row) groups.push((row = { group: g, subjects: [] }));
      row.subjects.push(s);
    }
    return {
      program: p,
      total: subs.reduce((a, s) => a + s.n, 0),
      done: subs.reduce((a, s) => a + s.done, 0),
      alsoHere: list.filter(
        (i) =>
          programOf(i) !== p && i.also.some((a) => subjectDef(a).program === p),
      ).length,
      groups,
    };
  });
}

// ------------------------------------------------------------------ a programme page
export interface KindGroup {
  id: GroupId;
  items: LibItem[];
}
export interface SubjectSection {
  subject: SubjectDef;
  /** every item homed here (whatever the filter) */
  total: number;
  done: number;
  /** what the filter keeps, in the fixed kind order */
  items: LibItem[];
  groups: KindGroup[];
  /** items of other programmes that are also useful here (filter applied), not counted */
  also: LibItem[];
  /** planned courses of this subject, not here yet (shown when courses are shown) */
  soon: PlannedItem[];
  /** minutes in the simulator (lessons, drills, routes) */
  simMinutes: number;
}
export interface ProgramView {
  program: ProgramId;
  total: number;
  done: number;
  kinds: Record<LibKind | "all", number>;
  groups: {
    group: SubjectGroup | null;
    title: L10n | null;
    /** subjects with something to show under the filter */
    sections: SubjectSection[];
    /** subjects of the syllabus with nothing at all yet: no item, no pointer, no planned course (muted, one line) */
    empty: SubjectDef[];
  }[];
  /** every subject in order, with its count, for the left index */
  index: ShelfSubject[];
}
function kindGroups(items: readonly LibItem[]): KindGroup[] {
  const out: KindGroup[] = [];
  for (const i of items) {
    const id = groupOf(i.sub);
    let g = out.find((x) => x.id === id);
    if (!g) out.push((g = { id, items: [] }));
    g.items.push(i);
  }
  return out;
}
export function programView(
  list: readonly LibItem[],
  p: ProgramId,
  kind: LibKind | "all" = "all",
): ProgramView {
  const mine = list.filter((i) => programOf(i) === p);
  const keep = (i: LibItem) => kind === "all" || i.kind === kind;
  const groups: ProgramView["groups"] = [];
  const index: ShelfSubject[] = [];
  const planned = plannedItems(list);
  for (const s of subjectsOf(p)) {
    const homed = mine.filter((i) => i.home === s.id).sort(compareInSubject);
    const items = homed.filter(keep);
    // pointers are built for EVERY subject: a subject with no home items can still hold material from elsewhere
    const allAlso = list
      .filter(
        (i) => i.home !== s.id && programOf(i) !== p && i.also.includes(s.id),
      )
      .sort(compareInLibrary);
    const also = allAlso.filter(keep);
    const soonAll = planned.filter((x) => x.home === s.id);
    const soon = kind === "all" || kind === "course" ? soonAll : [];
    const g = s.group ?? null;
    let row = groups.find((x) => x.group === g);
    if (!row)
      groups.push(
        (row = {
          group: g,
          title: g ? GROUP_TITLE[g] : null,
          sections: [],
          empty: [],
        }),
      );
    const done = homed.filter(isDone).length;
    index.push({
      subject: s,
      n: homed.length,
      done,
      also: allAlso.length,
      soon: soonAll.length,
    });
    if (!homed.length && !allAlso.length && !soonAll.length) {
      row.empty.push(s);
      continue;
    }
    if (!items.length && !also.length && !soon.length) continue;
    row.sections.push({
      subject: s,
      total: homed.length,
      done,
      items,
      groups: kindGroups(items),
      also,
      soon,
      simMinutes: homed
        .filter((i) => i.kind === "sim" && i.sub !== "scenario")
        .reduce((a, i) => a + (i.minutes ?? 0), 0),
    });
  }
  return {
    program: p,
    total: mine.length,
    done: mine.filter(isDone).length,
    kinds: kindCounts(mine),
    groups,
    index,
  };
}

// ------------------------------------------------------------------ search
export interface SearchGroup {
  subject: SubjectDef;
  items: LibItem[];
}
export interface SearchView {
  total: number;
  kinds: Record<LibKind | "all", number>;
  groups: SearchGroup[];
  programs: number;
  /** subjects whose name answers the search ("where is air law?"), in shelf order */
  subjects: ShelfSubject[];
  /** planned courses that answer it ("Soon") */
  soon: PlannedItem[];
}
/** Every match, grouped by home in shelf and syllabus order; inside a home the best match first. */
export function searchView(
  list: readonly LibItem[],
  q: string,
  kind: LibKind | "all" = "all",
  program: ProgramId | "all" = "all",
): SearchView {
  const scope = filterItems(list, { program, q });
  const kinds = kindCounts(scope);
  const shown = scope.filter((i) => kind === "all" || i.kind === kind);
  const score = new Map(shown.map((i) => [i, matchScore(i, q)]));
  const by = new Map<SubjectId, LibItem[]>();
  for (const i of shown) {
    const a = by.get(i.home);
    if (a) a.push(i);
    else by.set(i.home, [i]);
  }
  const tier = (x: number) => (x > 1 ? 1 : 0);
  const groups = [...by.entries()]
    .sort((a, b) => subjectRank(a[0]) - subjectRank(b[0]))
    .map(([s, items]) => ({
      subject: subjectDef(s),
      // a title match first, then the syllabus order (lessons keep their numbers in order)
      items: items.sort(
        (a, b) =>
          tier(score.get(b)!) - tier(score.get(a)!) || compareInSubject(a, b),
      ),
    }));
  const inScope = (s: SubjectDef) =>
    program === "all" ? s.program !== "discover" : s.program === program;
  const n = subjectCounts(list);
  const ex = subjectExtras(list);
  const terms = queryTerms(q);
  const subjects = terms.length
    ? SUBJECTS.filter(
        (s) => inScope(s) && terms.every((t) => hasTerm(subjectHaystack(s), t)),
      ).map((s) => ({
        subject: s,
        n: n[s.id],
        done: 0,
        also: ex.also[s.id] ?? 0,
        soon: ex.soon[s.id] ?? 0,
      }))
    : [];
  const soon =
    kind === "all" || kind === "course"
      ? plannedItems(list).filter(
          (x) => inScope(subjectDef(x.home)) && matchesText(both(x.title), q),
        )
      : [];
  return {
    total: shown.length,
    kinds,
    groups,
    programs: new Set(groups.map((g) => g.subject.program)).size,
    subjects,
    soon,
  };
}

/** The kind families, in filter order (re-exported for the page). */
export { KIND_ORDER };
