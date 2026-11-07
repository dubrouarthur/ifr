// The unified library's model (pure, no DOM): one list of items, whatever they are, a course of slides, a procedure
// or checklist, a sim lesson, a failure drill or a scenario, each placed in its programs (LAPL, PPL, Night · VFR, IR,
// ATPL, Club, Instructors) at a level, and the views the page shows: the program strip's counts, the Continue,
// Assigned and My drafts rows, one section per program (a preview row, "See all") or per kind inside a program, and
// the search results. The sources (course store, curriculum, procedures, drills, scenarios) become items in
// sources.ts; the page (course/ui/library.ts) draws what libraryView() returns.
import type { L10n, Lang } from "../course/types";
import {
  KIND_ORDER,
  PROGRAMS,
  PROGRAM_IDS,
  SUB_LABEL,
  type Level,
  type LibKind,
  type LibSub,
  type ProgramId,
} from "./programs";

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
  /** home program first; empty = not filed (an author's draft) */
  programs: ProgramId[];
  level: Level;
  title: L10n;
  blurb?: L10n;
  /** the small line over the title (a lesson's stage, a procedure's category) */
  eyebrow?: L10n;
  minutes?: number;
  /** what it is made of, for the meta line */
  count?: { n: number; unit: "steps" | "items" | "slides" };
  source: "builtin" | "club" | "mine";
  assigned?: boolean;
  /** an author's own course on this device (My drafts) */
  draft?: boolean;
  progress?: LibProgress;
  /** library order inside its kind (curriculum order, procedure order, …) */
  order: number;
  open: OpenTarget;
  /** a course: its id (its 16:9 cover is its first slide). A lesson: the briefing deck written for it, if any */
  deck?: string;
  /** a lesson: the IR stage ("S4"); a drill: its phase; a procedure: its category */
  facet?: string;
  /** a procedure or a drill: the aircraft ("C172S") */
  aircraft?: string;
  /** a procedure: memory items, then the first lines (the checklist cover) */
  lines?: { text: string; memory: boolean }[];
  /** extra search words (tags, airport, approach) */
  words?: string;
  langs?: Lang[];
}

// ------------------------------------------------------------------ text
export const fold = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const both = (x?: L10n) => (x ? `${x.en} ${x.fr ?? ""}` : "");
/** Everything a search looks at, folded (both languages, accents ignored). */
export function haystack(i: LibItem): string {
  return fold(
    [
      both(i.title),
      both(i.blurb),
      both(i.eyebrow),
      both(SUB_LABEL[i.sub]),
      ...i.programs.map((p) => {
        const d = PROGRAMS.find((x) => x.id === p)!;
        return `${p} ${both(d.code)}`;
      }),
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

/** How well an item answers a search: 0 = not at all; a title match ranks over a match anywhere else. */
export function matchScore(i: LibItem, q: string): number {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const h = hay(i);
  if (!words.every((w) => h.includes(w))) return 0;
  const t = fold(both(i.title));
  let s = 1;
  for (const w of words) {
    if (t.includes(w)) s += 2;
    if (new RegExp(`(^|[^a-z0-9])${w.replace(/[^a-z0-9]/g, "\\$&")}`).test(t))
      s += 1;
  }
  return s;
}

// ------------------------------------------------------------------ filters
export interface LibFilter {
  program: ProgramId | "all";
  kind: LibKind | "all";
  /** 0 = every level */
  level: Level | 0;
  q: string;
}
export const NO_FILTER: LibFilter = {
  program: "all",
  kind: "all",
  level: 0,
  q: "",
};

export function inProgram(i: LibItem, p: ProgramId | "all"): boolean {
  return p === "all" || i.programs.includes(p);
}
/** The items a filter keeps (search included). */
export function filterItems(
  list: readonly LibItem[],
  f: Partial<LibFilter>,
): LibItem[] {
  const q = f.q?.trim() ?? "";
  return list.filter(
    (i) =>
      inProgram(i, f.program ?? "all") &&
      (!f.kind || f.kind === "all" || i.kind === f.kind) &&
      (!f.level || i.level === f.level) &&
      (!q || matchScore(i, q) > 0),
  );
}

/** The program strip: how many items each program holds under the other filters (kind, level, search). */
export function programCounts(
  list: readonly LibItem[],
  f: Partial<LibFilter> = {},
): Record<ProgramId | "all", number> {
  const base = filterItems(list, { ...f, program: "all" });
  const n = { all: base.length } as Record<ProgramId | "all", number>;
  for (const p of PROGRAM_IDS)
    n[p] = base.filter((i) => i.programs.includes(p)).length;
  return n;
}
export function kindCounts(
  list: readonly LibItem[],
  f: Partial<LibFilter> = {},
): Record<LibKind | "all", number> {
  const base = filterItems(list, { ...f, kind: "all" });
  const n = { all: base.length } as Record<LibKind | "all", number>;
  for (const k of KIND_ORDER) n[k] = base.filter((i) => i.kind === k).length;
  return n;
}

// ------------------------------------------------------------------ order
const SUB_ORDER: Record<LibSub, number> = {
  course: 0,
  lesson: 1,
  drill: 2,
  circuit: 3,
  scenario: 4,
  clubProcedure: 5,
  checklist: 6,
};
/** The order inside a program: its own items before the ones it borrows, then kind, level and library order. */
export function compareIn(p: ProgramId | "all") {
  return (a: LibItem, b: LibItem): number => {
    const home = (i: LibItem) => (p === "all" || i.programs[0] === p ? 0 : 1);
    return (
      KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
      home(a) - home(b) ||
      // a course the student was given or wrote comes first
      Number(!!b.assigned) - Number(!!a.assigned) ||
      SUB_ORDER[a.sub] - SUB_ORDER[b.sub] ||
      (a.kind === "course" ? a.level - b.level : 0) ||
      a.order - b.order
    );
  };
}
/** A program's preview row: a mix (courses, then a lesson or a drill, then a procedure) so the row says what the
 *  program holds; the whole program is one tap away. */
export function previewOf(
  items: readonly LibItem[],
  p: ProgramId,
  n: number,
): LibItem[] {
  const sorted = [...items].sort(compareIn(p));
  const by = (k: LibKind) => sorted.filter((i) => i.kind === k);
  const c = by("course");
  const f = by("flight");
  const r = by("procedure");
  // about half courses, then flights and procedures share the rest
  const want = {
    course: Math.max(1, Math.ceil(n / 2)),
    flight: Math.ceil(n / 4),
    procedure: Math.ceil(n / 4),
  };
  const out: LibItem[] = [];
  const take = (src: LibItem[], k: number) => {
    for (const i of src) {
      if (k <= 0 || out.length >= n) break;
      if (!out.includes(i)) (out.push(i), k--);
    }
  };
  take(c, want.course);
  take(f, want.flight);
  take(r, want.procedure);
  // fill what is left in kind order
  take(sorted, n - out.length);
  return out.sort(compareIn(p));
}

// ------------------------------------------------------------------ rows
const unfinished = (i: LibItem) =>
  !!i.progress &&
  (i.kind === "flight"
    ? !i.progress.passed
    : i.progress.done < i.progress.total);
/** Continue: what the student started and has not finished, most recent first. */
export function continueItems(list: readonly LibItem[], n = 8): LibItem[] {
  return list
    .filter(unfinished)
    .sort((a, b) => ((a.progress?.at ?? "") < (b.progress?.at ?? "") ? 1 : -1))
    .slice(0, n);
}
export const assignedItems = (list: readonly LibItem[]): LibItem[] =>
  list.filter((i) => i.assigned);
export const draftItems = (list: readonly LibItem[]): LibItem[] =>
  list.filter((i) => i.draft && !i.assigned).sort((a, b) => a.order - b.order);
/** Where a newcomer starts: the first course, the first sim lesson and the first checklist of the first programs. */
export function startItems(list: readonly LibItem[]): LibItem[] {
  const pick = (k: LibKind, p: ProgramId) =>
    [...list]
      .filter(
        (i) => i.kind === k && i.programs.includes(p) && i.source === "builtin",
      )
      .sort(compareIn(p))[0];
  return [
    pick("course", "ppl"),
    pick("course", "ir"),
    pick("flight", "ir"),
    pick("procedure", "lapl"),
  ].filter((x): x is LibItem => !!x);
}

// ------------------------------------------------------------------ the page
export type SectionKind =
  | "continue"
  | "start"
  | "assigned"
  | "drafts"
  | "program"
  | "kind"
  | "results";
export interface LibSection {
  key: string;
  type: SectionKind;
  program?: ProgramId;
  kind?: LibKind;
  items: LibItem[];
  /** how many the section stands for (a preview shows fewer) */
  total: number;
}
export interface ViewOptions {
  /** cards in one row of the grid (a program's preview is one row) */
  cols: number;
  /** rows in a program's preview (default 1) */
  rows?: number;
  /** show My drafts even when empty (a store is open: the row starts with "New course") */
  drafts?: boolean;
}
/**
 * The sections the page shows for a filter:
 * - a search: one section per kind with every match, best first;
 * - every program: Continue (or Start here), Assigned and My drafts, then one preview row per program;
 * - one program: one section per kind with all its items.
 */
export function libraryView(
  list: readonly LibItem[],
  f: LibFilter,
  o: ViewOptions,
): LibSection[] {
  const shown = filterItems(list, f);
  const q = f.q.trim();
  const out: LibSection[] = [];
  if (q) {
    const scored = shown
      .map((i) => ({ i, s: matchScore(i, q) }))
      .sort((a, b) => b.s - a.s || compareIn(f.program)(a.i, b.i));
    for (const k of KIND_ORDER) {
      const items = scored.filter((x) => x.i.kind === k).map((x) => x.i);
      if (items.length)
        out.push({
          key: `results-${k}`,
          type: "results",
          kind: k,
          items,
          total: items.length,
        });
    }
    return out;
  }
  if (f.program === "all") {
    const plain = f.kind === "all" && !f.level;
    if (plain) {
      const cont = continueItems(list);
      if (cont.length)
        out.push({
          key: "continue",
          type: "continue",
          items: cont,
          total: cont.length,
        });
      else {
        const st = startItems(list);
        if (st.length)
          out.push({
            key: "start",
            type: "start",
            items: st,
            total: st.length,
          });
      }
      const asg = assignedItems(list);
      if (asg.length)
        out.push({
          key: "assigned",
          type: "assigned",
          items: asg,
          total: asg.length,
        });
      const dr = draftItems(list);
      if (dr.length || o.drafts)
        out.push({
          key: "drafts",
          type: "drafts",
          items: dr,
          total: dr.length,
        });
    }
    const n = Math.max(1, o.cols) * Math.max(1, o.rows ?? 1);
    for (const p of PROGRAM_IDS) {
      const items = shown.filter((i) => i.programs.includes(p));
      if (!items.length) continue;
      out.push({
        key: `program-${p}`,
        type: "program",
        program: p,
        items: previewOf(items, p, n),
        total: items.length,
      });
    }
    return out;
  }
  const p = f.program;
  const mine = shown.filter((i) => i.programs.includes(p)).sort(compareIn(p));
  for (const k of KIND_ORDER) {
    const items = mine.filter((i) => i.kind === k);
    if (items.length)
      out.push({
        key: `kind-${p}-${k}`,
        type: "kind",
        program: p,
        kind: k,
        items,
        total: items.length,
      });
  }
  return out;
}

/** Items in no program (an author's course without a program): the page lists them under My drafts or the search. */
export const unfiled = (list: readonly LibItem[]): LibItem[] =>
  list.filter((i) => !i.programs.length);
