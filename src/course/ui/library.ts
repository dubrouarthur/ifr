// The library: one place for everything a club or a school teaches and flies (slide courses, sim lessons, failure
// drills, graded routes, free practice, checklists), and ONE way to browse it: programme shelves in training order
// (LAPL · PPL, Vol de nuit, IR, ATPL, Club, Instructeurs), each with its subjects in syllabus order. Every item has
// exactly one home, a subject, where it is drawn and counted. DOM only (h()), no framework; the same component runs
// in academy.html#library and in the Flight Center (index.html), so there is one mental model. The model is
// src/library (pure, tested).
//   landing     « Choisissez votre formation »: one « Nouveau cours », Reprendre (only with something started or
//               given), the four formations as cards (who it is for, ONE count, where it starts), then Club and
//               Instructeurs as two rows (UX logic §5)
//   programme   breadcrumb, h1, the one filled « Commencer : leçon 1 » / « Continuer », the one kind filter; the
//               Sommaire (every subject at its official number, a select on a narrow screen); every subject in
//               order: its cards (an item lent by another formation is an ordinary card, « Vient de la formation
//               IR »), or one dashed « Bientôt dans Wingdeck » row. Every count equals the cards drawn
//   search      compact rows grouped by home (« IR › Attentes · 3 »), so a search also says where a topic lives
//   entry       the Flight Center's single library entry: Continue and the six shelf tiles
//   cards       one grammar for every kind: a 16:9 cover (a course's first slide; a dark panel for what opens the
//               cockpit), the kind word, the title, one purpose line, duration and size, the level; checklists
//               and free practice are compact rows
//   nudges      "not saved on this device", persist() ("keep my courses"), "not exported for 7 days"
// Pure helpers (entries, filters, the continue target, the kind mix, the academy route) are exported and tested.
// The app's own dialogs only (never confirm() / alert()).
import type { Course, CourseProgress, L10n, Lang, Step } from "../types";
import type { CourseIndexEntry, CourseStore } from "../store";
import { h } from "../../ui/dom";
import { agoText, ct, ctSteps, loc, type CourseStringKey } from "../i18n";
import { SAMPLES, allSamples, isSampleId, sampleCourse } from "../samples";
import type { Procedure, ProcCategory } from "../../train/procedureTypes";
import {
  GROUP_TITLE,
  KIND_FILTER,
  KIND_ORDER,
  LEVELS,
  SHELF_IDS,
  SUB_LABEL,
  courseProgramOf,
  isProgramId,
  isSubjectId,
  levelTitle,
  programDef,
  subjectDef,
  subjectsOf,
  type Level,
  type LibKind,
  type ProgramId,
  type SubjectDef,
  type SubjectId,
} from "../../library/programs";
import {
  continueItems,
  isDone,
  isNewcomer,
  lessonRank,
  programOf,
  programView,
  searchView,
  shelves,
  type LibItem,
  type OpenTarget,
  type PlannedItem,
  type ProgramView,
  type Shelf as LibShelf,
  type ShelfSubject,
  type SubjectSection,
} from "../../library/model";
import {
  coursePlacement,
  libraryItems,
  procBase,
  splitItem,
  type ClubDrill,
  type LessonRecord,
} from "../../library/sources";
import { DRILL_META } from "../../library/meta";
import {
  courseCover,
  plateUrl,
  simCover,
  type CoverSlide,
} from "../../library/covers";
import { procedureSheet } from "../../library/procedureSheet";
import { programArt } from "../../library/programArt";
import { BRAND } from "../../brand";
import { lt, ltN, type LibStringKey } from "../../library/strings";
import "../../styles/library.css";
// ------------------------------------------------------------------ routes (academy.html hash)
export type AcademyRoute =
  /** the library, on a programme page (p) at a subject (s) when given; q: a search typed in another page's app
   *  bar (read once, never written back) */
  | { k: "library"; p?: string; s?: string; v?: "sim"; q?: string }
  /** from: where the course was opened (home, lib, a programme id): the player's labelled way back */
  | { k: "play"; id: string; s?: string; a?: string; b?: string; from?: string }
  | { k: "edit"; id: string; s?: string }
  | { k: "present"; id: string; s?: string }
  | { k: "project"; id: string; s?: string }
  | { k: "share"; code: string }
  /** the Nouveau cours page: the formation (p) and subject (s) prefilled from where it was opened; from: the way
   *  back (home, lib, a formation id) */
  | { k: "new"; p?: string; s?: string; from?: string };
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
/** Parse academy.html's hash: #library (&p=<programme>&s=<subject>), #play=<id>&s=<step>&a=<token>, #edit=, #present=, #project=, #c=<code>. */
export function academyRoute(hash: string): AcademyRoute {
  const raw = hash.replace(/^#/, "");
  const kv = new Map<string, string>();
  for (const part of raw.split("&")) {
    const i = part.indexOf("=");
    const k = i < 0 ? part : part.slice(0, i);
    let v = i < 0 ? "" : part.slice(i + 1);
    try {
      v = decodeURIComponent(v);
    } catch {
      v = "";
    }
    if (k && !kv.has(k)) kv.set(k, v);
  }
  const id = (k: string) => {
    const v = kv.get(k);
    return v && ID_RE.test(v) ? v : null;
  };
  const c = kv.get("c");
  if (c && /^C[01]\.[A-Za-z0-9_-]+$/.test(c)) return { k: "share", code: c };
  const play = id("play");
  if (play) {
    const opt = (k: "s" | "a" | "b") => {
      const v = kv.get(k);
      return v && /^[A-Za-z0-9._~:-]{1,120}$/.test(v) ? { [k]: v } : {};
    };
    const from = kv.get("from");
    return {
      k: "play",
      id: play,
      ...opt("s"),
      ...opt("a"),
      ...opt("b"),
      ...(from && /^[a-z]{2,12}$/.test(from) ? { from } : {}),
    };
  }
  if (kv.has("new")) {
    const p = kv.get("p");
    const sub = kv.get("s");
    const from = kv.get("from");
    const okP = p && /^[a-z]{2,12}$/.test(p) ? p : null;
    return {
      k: "new",
      ...(okP ? { p: okP } : {}),
      ...(okP && sub && /^[a-z]{2,12}\.[a-z0-9]{2,8}$/.test(sub) ? { s: sub } : {}),
      ...(from && /^[a-z]{2,12}$/.test(from) ? { from } : {}),
    };
  }
  for (const k of ["edit", "present", "project"] as const) {
    const v = id(k);
    if (v) {
      const st = kv.get("s");
      return {
        k,
        id: v,
        ...(st && /^[A-Za-z0-9._~:-]{1,120}$/.test(st) ? { s: st } : {}),
      };
    }
  }
  const q = (kv.get("q") ?? "").trim().slice(0, 80);
  const withQ = q ? { q } : {};
  // every flight of the simulator, shelved by programme and subject (the Simulateur's lessons link)
  if (kv.get("v") === "sim") return { k: "library", v: "sim", ...withQ };
  const shelf = kv.get("p");
  if (shelf && /^[a-z]{2,12}$/.test(shelf)) {
    const sub = kv.get("s");
    return {
      k: "library",
      p: shelf,
      ...(sub && /^[a-z]{2,12}\.[a-z0-9]{2,8}$/.test(sub) ? { s: sub } : {}),
      ...withQ,
    };
  }
  return { k: "library", ...withQ };
}
/** The hash for a route (inverse of academyRoute). */
/** Where a course is filed, as the course player's context line says it: « IR › Radionavigation ». */
export function courseHomeLine(course: Course, lang: Lang): string {
  const sample = isSampleId(course.id);
  const place = coursePlacement(
    {
      id: course.id,
      tags: course.tags ?? [],
      shelf: sample ? "sample" : "draft",
      sample,
      title: course.title,
      course,
    },
    (id) => SAMPLES.find((x) => x.id === id)?.program,
  );
  const d = subjectDef(place.home);
  return `${loc(programDef(d.program).code, lang)} › ${loc(d.title, lang)}`;
}
export function academyHash(r: AcademyRoute): string {
  const e = encodeURIComponent;
  switch (r.k) {
    case "library":
      return r.v === "sim"
        ? "#library&v=sim"
        : `#library${r.p ? `&p=${e(r.p)}` : ""}${r.p && r.s ? `&s=${e(r.s)}` : ""}`;
    case "share":
      return `#c=${r.code}`;
    case "new":
      return `#new${r.p ? `&p=${e(r.p)}` : ""}${r.p && r.s ? `&s=${e(r.s)}` : ""}${r.from ? `&from=${e(r.from)}` : ""}`;
    case "play":
      return `#play=${e(r.id)}${r.s ? `&s=${e(r.s)}` : ""}${r.a ? `&a=${e(r.a)}` : ""}${r.b ? `&b=${e(r.b)}` : ""}${r.from ? `&from=${e(r.from)}` : ""}`;
    default:
      return `#${r.k}=${e(r.id)}${r.s ? `&s=${e(r.s)}` : ""}`;
  }
}
/** The library card to bring back into view after a course (sessionStorage, read once): « course:<id> ». */
export const BACK_ITEM_KEY = "ifr.lib.backItem";
/** academy.html plus the route (what the Flight Center opens, in the same tab). */
export const academyHref = (r: AcademyRoute, page = "academy.html"): string =>
  `${page}${academyHash(r)}`;

// ------------------------------------------------------------------ entries (pure)
export type Shelf = "assigned" | "club" | "sample" | "draft";
export type LibraryFilter = "all" | Shelf;
export interface KindMix {
  /** read / watch (explain, slide, page, watch) */
  learn: number;
  /** the student acts (try, tap, quiz, predict, calc, drill, an interactive slide) */
  act: number;
  /** fly it */
  fly: number;
}
export interface LibraryEntry {
  id: string;
  title: L10n;
  summary?: L10n;
  shelf: Shelf;
  assigned: boolean;
  sample: boolean;
  briefing: boolean;
  steps: number;
  minutes?: number;
  langs: Lang[];
  tags: string[];
  updated: string;
  author?: { name: string; club?: string };
  mix: KindMix;
  /** where the student is (from the progress store) */
  progress?: {
    index: number;
    total: number;
    stepId: string;
    next?: Step;
    /** when (ISO) */
    at?: string;
  };
  needsExport?: boolean;
  exportAgeDays?: number | null;
  /** loaded course (thumbnails, Continue card) */
  course?: Course;
}

const ACT_KINDS = new Set(["try", "tap", "quiz", "predict", "calc", "drill"]);
/** What a course is made of: reading, acting, flying (the card's bar). */
export function kindMix(steps: readonly Step[]): KindMix {
  const m: KindMix = { learn: 0, act: 0, fly: 0 };
  for (const s of steps) {
    if (s.kind === "fly") m.fly++;
    else if (
      ACT_KINDS.has(s.kind) ||
      !!s.quiz ||
      !!s.slide?.blocks.some(
        (b) =>
          b.kind === "quiz" ||
          b.kind === "calc" ||
          (b.kind === "diagram" && !!b.interactive) ||
          ((b.kind === "instrument" || b.kind === "simViewport") &&
            !!b.yourTurn),
      )
    )
      m.act++;
    else m.learn++;
  }
  return m;
}

export interface EntryInput {
  samples: readonly Course[];
  stored: readonly { entry: CourseIndexEntry; course?: Course | null }[];
  /** ids imported from a file or a club pack (the Club shelf) */
  imported?: ReadonlySet<string>;
  progress?: ReadonlyMap<string, CourseProgress>;
  needsExport?: (id: string) => boolean;
  exportAgeDays?: (id: string) => number | null;
}
function progressOf(
  c: Course | undefined,
  p: CourseProgress | undefined,
): LibraryEntry["progress"] {
  if (!c || !p) return undefined;
  const i = c.steps.findIndex((s) => s.id === p.stepId);
  if (i < 0) return undefined;
  return {
    index: i,
    total: c.steps.length,
    stepId: p.stepId,
    next: c.steps[i],
    ...(p.updated ? { at: p.updated } : {}),
  };
}
/** Build the library's entries: stored courses first (newest first), then the built-in samples. */
export function libraryEntries(x: EntryInput): LibraryEntry[] {
  const out: LibraryEntry[] = [];
  const seen = new Set<string>();
  for (const { entry: e, course: c } of x.stored) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const assigned = !!e.assigned;
    const shelf: Shelf = assigned
      ? "assigned"
      : x.imported?.has(e.id)
        ? "club"
        : "draft";
    out.push({
      id: e.id,
      title: c?.title ?? e.title,
      ...(c?.summary ? { summary: c.summary } : {}),
      shelf,
      assigned,
      sample: false,
      briefing: (c?.shape ?? e.shape) === "briefing",
      steps: c?.steps.length ?? e.steps,
      ...((c?.minutes ?? e.minutes) !== undefined
        ? { minutes: c?.minutes ?? e.minutes }
        : {}),
      langs: c?.langs ?? e.langs,
      tags: c?.tags ?? e.tags ?? [],
      updated: e.updated,
      ...(c ? { author: c.author } : {}),
      mix: c ? kindMix(c.steps) : { learn: e.steps, act: 0, fly: 0 },
      progress: progressOf(c ?? undefined, x.progress?.get(e.id)),
      needsExport: x.needsExport?.(e.id) ?? false,
      exportAgeDays: x.exportAgeDays?.(e.id) ?? null,
      ...(c ? { course: c } : {}),
    });
  }
  for (const c of x.samples) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    out.push({
      id: c.id,
      title: c.title,
      ...(c.summary ? { summary: c.summary } : {}),
      shelf: "sample",
      assigned: false,
      sample: true,
      briefing: c.shape === "briefing",
      steps: c.steps.length,
      ...(c.minutes !== undefined ? { minutes: c.minutes } : {}),
      langs: c.langs,
      tags: c.tags ?? [],
      updated: c.updated,
      author: c.author,
      mix: kindMix(c.steps),
      progress: progressOf(c, x.progress?.get(c.id)),
      course: c,
    });
  }
  return out;
}

const fold = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** The entries a filter and a search show (search: title, summary and tags, both languages, accents ignored). */
export function filterEntries(
  list: readonly LibraryEntry[],
  f: LibraryFilter,
  q = "",
): LibraryEntry[] {
  const words = fold(q).split(/\s+/).filter(Boolean);
  return list.filter((e) => {
    if (f !== "all" && e.shelf !== f) return false;
    if (!words.length) return true;
    const hay = fold(
      [
        e.title.en,
        e.title.fr ?? "",
        e.summary?.en ?? "",
        e.summary?.fr ?? "",
        ...e.tags,
        e.author?.club ?? "",
        e.author?.name ?? "",
      ].join(" "),
    );
    return words.every((w) => hay.includes(w));
  });
}
export function shelfCounts(
  list: readonly LibraryEntry[],
): Record<LibraryFilter, number> {
  const n: Record<LibraryFilter, number> = {
    all: list.length,
    assigned: 0,
    club: 0,
    sample: 0,
    draft: 0,
  };
  for (const e of list) n[e.shelf]++;
  return n;
}
/**
 * The Continue card: an assigned course the student has not finished, else the last opened course, else the
 * first sample ("Start here"). `started` = the student has progress in it.
 */
export function continueTarget(
  list: readonly LibraryEntry[],
  last: { id: string; stepId?: string } | null,
): { entry: LibraryEntry; started: boolean } | null {
  const unfinished = (e: LibraryEntry) =>
    !e.progress || e.progress.index < e.progress.total - 1;
  const assigned = list.find((e) => e.assigned && unfinished(e));
  if (assigned) return { entry: assigned, started: !!assigned.progress };
  if (last) {
    const e = list.find((x) => x.id === last.id);
    if (e) return { entry: e, started: !!e.progress || !!last.stepId };
  }
  const started = list
    .filter((e) => e.progress)
    .sort((a, b) => (a.updated < b.updated ? 1 : -1))[0];
  if (started) return { entry: started, started: true };
  const first = list.find((e) => e.sample && !e.briefing);
  return first ? { entry: first, started: false } : null;
}

// ------------------------------------------------------------------ thumbnails (pure)
export interface ThumbPick {
  step: Step;
  /** the block the thumbnail zooms on (an instrument, else a diagram or a photo), slide units */
  focus?: { x: number; y: number; w: number; h: number };
}
/** The slide a course's card shows, and what it zooms on: the asked step if it is a slide, else the first slide
 *  with a live instrument, else one with a diagram or a picture, else the first slide. */
export function thumbOf(c: Course, stepId?: string): ThumbPick | null {
  const slides = c.steps.filter((s) => s.slide);
  if (!slides.length) return null;
  const focusOf = (s: Step, kinds: string[]) => {
    const bs = (s.slide?.blocks ?? []).filter(
      (b) => kinds.includes(b.kind) && !b.reveal && b.frame.w >= 320,
    );
    bs.sort((a, b) => b.frame.w * b.frame.h - a.frame.w * a.frame.h);
    const f = bs[0]?.frame;
    return f ? { x: f.x, y: f.y, w: f.w, h: f.h } : undefined;
  };
  const asked = stepId ? slides.find((s) => s.id === stepId) : undefined;
  if (asked)
    return {
      step: asked,
      focus: focusOf(asked, ["instrument", "diagram", "image"]),
    };
  for (const s of slides) {
    const f = focusOf(s, ["instrument", "diagram", "image"]);
    if (f) return { step: s, focus: f };
  }
  return { step: slides[0] };
}
/** Where to put the 1920 × 1080 slide so that `focus` covers a W × H thumbnail (or the whole slide covers it). */
export function thumbPlacement(
  W: number,
  H: number,
  focus?: { x: number; y: number; w: number; h: number },
): { x: number; y: number; w: number; h: number } {
  const base = Math.max(W / 1920, H / 1080);
  // the block covers the thumbnail (its neighbours stay out of the picture)
  const k = focus ? Math.max(base, W / focus.w, H / focus.h) : base;
  const cx = focus ? focus.x + focus.w / 2 : 960;
  // a little above the middle: the top of a dial (its numbers, the lubber line) reads best
  const cy = focus ? focus.y + focus.h * 0.44 : 540;
  const w = 1920 * k;
  const h = 1080 * k;
  const x = Math.min(0, Math.max(W - w, W / 2 - cx * k));
  const y = Math.min(0, Math.max(H - h, H / 2 - cy * k));
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
  };
}

// ------------------------------------------------------------------ imported ids (the Club shelf)
const IMPORTED_KEY = "ifr.course.imported";
export function importedIds(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(IMPORTED_KEY) ?? "[]") as unknown;
    return new Set(
      Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}
export function markImported(ids: readonly string[], on = true): void {
  const s = importedIds();
  for (const id of ids) {
    if (on) s.add(id);
    else s.delete(id);
  }
  try {
    localStorage.setItem(IMPORTED_KEY, JSON.stringify([...s].slice(-200)));
  } catch {
    /* storage blocked: the shelf falls back to My drafts */
  }
}

// ------------------------------------------------------------------ icons (24 × 24 strokes, the app's weight)
const ICON: Record<string, string> = {
  plus: "M12 5v14M5 12h14",
  pdf: "M7 3h7l4 4v14H7zM14 3v4h4M9.5 13h5M9.5 16.5h5",
  upload: "M12 16V4M7 9l5-5 5 5M5 15v4h14v-4",
  screen: "M3 5h18v11H3zM8 20h8M12 16v4",
  search: "M10.5 17a6.5 6.5 0 1 1 0-13 6.5 6.5 0 0 1 0 13zM15.5 15.5 20 20",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  chev: "M9 6l6 6-6 6",
  close: "M6 6l12 12M18 6 6 18",
  shield: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z",
  download: "M12 4v12M7 11l5 5 5-5M5 20h14",
  warn: "M12 4 3 20h18zM12 10v4M12 17h.01",
  back: "M15 6l-6 6 6 6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  arrow: "M5 12h14M13 6l6 6-6 6",
  list: "M8 4h8v3H8zM6 5.5H5v15h14v-15h-1M9 12h6M9 16h6",
  plane: "M3 11.5 21 4l-7.5 18-2.5-7.5z",
  slides: "M4 5h16v11H4zM9 20h6M12 16v4",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  bolt: "M13 3 5 13.5h6L10 21l8-10.5h-6z",
  chart: "M4 20h16M7 16v-5M12 16V7M17 16v-8",
  pack: "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8",
  play: "M8 5.5v13l10.5-6.5z",
  users:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.2c1.8.8 3 2.7 3 4.8",
};
function ic(name: keyof typeof ICON, size = 18): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", String(size));
  s.setAttribute("height", String(size));
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("class", "gl-ic");
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", ICON[name]);
  s.append(p);
  return s;
}

// ------------------------------------------------------------------ the component
export type LibraryAction =
  | { k: "new"; p?: string; s?: string }
  | { k: "play"; id: string; stepId?: string }
  | { k: "edit"; id: string }
  | { k: "present"; id: string };
export interface LibraryOptions {
  lang: Lang;
  /** the page's store (a promise while it opens; null = no storage at all) */
  store: CourseStore | Promise<CourseStore> | null;
  /** where an action goes (default: academy.html with the route, same tab) */
  navigate?: (url: string, action: LibraryAction) => void;
  /** in the Flight Center modal */
  embedded?: boolean;
  /** profile whose progress the Continue card shows (default 'local', the player's default) */
  profileId?: string;
  /** academy.html path (the Flight Center is at the site root, so is academy.html) */
  page?: string;
  /** the simulator page a sim lesson, a drill or a scenario opens in (default index.html) */
  simPage?: string;
  /** run once the store is open: create a course (the editor opens on it), or pick a course to present */
  intent?: "new" | "present";
  /** a PDF import module (pdfImport.ts) when the build has one */
  importPdf?: (
    store: CourseStore,
    file: File,
    lang: Lang,
  ) => Promise<{ id: string } | null>;
  /** the host flies a sim item itself (the Flight Center): true when it did */
  openSim?: (t: OpenTarget) => boolean;
  /** the host can adapt a procedure for the club (the Flight Center's procedure editor) */
  editProcedure?: (id: string) => void;
  /** the club's own failure drills (the Flight Center lists them) */
  clubDrills?: () => ClubDrill[];
  /** open on every flight of the simulator ("All flights": sim lessons, drills, routes, free practice) */
  flights?: boolean;
  /** open on a programme, at a subject */
  program?: ProgramId;
  subject?: SubjectId;
  /** the Flight Center's single entry: Continue and the shelf tiles only; a tile opens the library there */
  entry?: {
    openLibrary: (p?: ProgramId, s?: SubjectId) => void;
    /** every flight of the simulator, in the library ("All flights") */
    openFlights?: () => void;
  };
  /** the club's tools (checklists, drills, results, the club pack) live in the simulator page: the host opens them
   *  (default: the simulator page with ?club=<tab>) */
  openClub?: (tab: ClubTool) => void;
  /** the page's app bar search field (ui/appBar.ts): the library searches with it instead of drawing its own */
  searchInput?: HTMLInputElement;
}
/** The Flight Center's club pages the Club shelf links to. */
export type ClubTool = "drills" | "library" | "results" | "pack";

const isIpad = () =>
  typeof navigator !== "undefined" &&
  (/iPad/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1));

/** The lessons flown in the cockpit (ui/learn.ts progress, localStorage). */
function lessonRecords(): Record<string, LessonRecord> {
  try {
    const v = JSON.parse(
      localStorage.getItem("ifr.progress.v1") ?? "{}",
    ) as unknown;
    return v && typeof v === "object"
      ? (v as Record<string, LessonRecord>)
      : {};
  } catch {
    return {};
  }
}
const CARD_MIN = 250;
const GAP = 20;
/** Below this width the programme's left index becomes a "Contents" select. */
const RAIL_MIN = 1000;

interface ViewState {
  /** a programme page, or the landing */
  p: ProgramId | null;
  /** the subject in view on a programme page */
  s: SubjectId | null;
  q: string;
  kind: LibKind | "all";
  /** a search from a programme page widened to the whole library */
  wide: boolean;
  /** every flight of the simulator, shelved where it lives (kind "sim", the whole library) */
  flights: boolean;
}

export class CourseLibrary {
  readonly el: HTMLDivElement;
  private lang: Lang;
  private store: CourseStore | null = null;
  private entries: LibraryEntry[] = [];
  private items: LibItem[] = [];
  private procedures: Procedure[] = [];
  private procMod: {
    cats: Record<ProcCategory, Record<Lang, string>>;
    disclaimer: Record<Lang, string>;
    effective: (l: Lang) => Procedure[];
    get: (id: string) => Procedure | null;
  } | null = null;
  private st: ViewState;
  private cols = 4;
  private rail = true;
  private headL: HTMLElement;
  private headX: HTMLElement;
  private searchBox: HTMLElement;
  private body: HTMLDivElement;
  private banner: HTMLDivElement;
  private searchIn: HTMLInputElement;
  private toastEl: HTMLDivElement;
  private live: HTMLDivElement;
  private fileIn: HTMLInputElement;
  private pdfIn: HTMLInputElement;
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;
  private spy: IntersectionObserver | null = null;
  private thumbs = new Map<Element, { destroy(): void }>();
  private menuEl: HTMLElement | null = null;
  private dialogEl: HTMLElement | null = null;
  private unsub: (() => void) | null = null;
  private toastTimer = 0;
  private searchTimer = 0;
  private destroyed = false;
  private loadSeq = 0;
  /** the drafts this library has just made ("New course"): never cleared as untouched while the editor opens them
   *  (the save itself fires a reload, which would delete the draft before the editor can read it) */
  private readonly ownDrafts = new Set<string>();
  private readonly syncHash: boolean;
  /** a subject to bring into view once the page is drawn (a deep link, a click in the table of contents) */
  private pendingSubject: SubjectId | null = null;
  /** the index follows the reading position, except while a jump scrolls past other subjects */
  private spyMuteUntil = 0;
  /** the subject a jump brought into view: kept there while the data loads, until the reader scrolls */
  private anchor: SubjectId | null = null;
  /** the reader has scrolled since the page was drawn: until then the Sommaire keeps the subject the page opened on
   *  (the first one with something to open), never an empty one the top of the page happens to show */
  private moved = false;
  private readonly onHash = () => this.fromHash();
  private readonly onSearchInput = () => {
    window.clearTimeout(this.searchTimer);
    // a short pause so typing stays smooth with a big library
    this.searchTimer = window.setTimeout(() => {
      this.st = { ...this.st, q: this.searchIn.value };
      if (!this.st.q.trim()) this.st.wide = false;
      this.renderView(false);
    }, 90);
  };
  private readonly onSearchKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.searchIn.value) {
      e.preventDefault();
      this.clearSearch();
    } else if (e.key === "Enter") {
      // results are live: Enter only takes the keyboard to them
      e.preventDefault();
      this.body.querySelector<HTMLElement>("a[href], button")?.focus();
    }
  };

  constructor(private o: LibraryOptions) {
    this.lang = o.lang;
    this.syncHash = !o.embedded && !o.entry && typeof location !== "undefined";
    const flights = !!o.flights && !o.program;
    this.st = {
      p: o.program && isProgramId(o.program) ? o.program : null,
      s: o.program && o.subject && isSubjectId(o.subject) ? o.subject : null,
      q: "",
      kind: flights ? "sim" : "all",
      wide: false,
      flights,
    };
    this.el = h("div", {
      class: `gl lb${o.embedded ? " gl-embedded" : ""}${o.entry ? " lb-entry-mode" : ""}`,
    });
    this.searchIn =
      o.searchInput ??
      (h("input", {
        class: "gl-search-in",
        type: "search",
        enterkeyhint: "search",
        autocomplete: "off",
        spellcheck: "false",
      }) as HTMLInputElement);
    this.searchIn.addEventListener("input", this.onSearchInput);
    // the app bar's field sits outside the library: its Esc clears the search here, and the library names its
    // scope in it (« Rechercher dans LAPL · PPL »)
    if (o.searchInput) {
      o.searchInput.addEventListener("keydown", this.onSearchKey);
      o.searchInput.dataset.ownPlaceholder = "1";
    }
    // the library's own field (embedded hosts); a page with an app bar lends its field instead
    this.searchBox = o.searchInput
      ? h("span", { hidden: true })
      : h(
          "label",
          { class: "gl-search lb-search" },
          ic("search", 18),
          this.searchIn,
          h("kbd", { "aria-hidden": "true" }, "/"),
        );
    this.headL = h("div", { class: "lb-head-t" });
    this.headX = h("div", { class: "lb-head-x" });
    this.banner = h("div", { class: "gl-banners" });
    this.body = h("div", { class: "lb-body" });
    this.toastEl = h("div", {
      class: "gl-toast",
      role: "status",
      hidden: true,
    });
    this.live = h("div", { class: "gl-sr", "aria-live": "polite" });
    this.fileIn = h("input", {
      type: "file",
      accept:
        ".ifrcourse,.json,application/json,application/gzip,application/x-ifrcourse",
      multiple: true,
      hidden: true,
      onchange: () => this.importFiles(),
    }) as HTMLInputElement;
    this.pdfIn = h("input", {
      type: "file",
      accept: "application/pdf,.pdf",
      hidden: true,
      onchange: () => this.importPdfFile(),
    }) as HTMLInputElement;
    this.el.append(
      o.entry
        ? ""
        : h(
            "div",
            { class: "lb-head" },
            this.headL,
            h(
              "div",
              { class: "lb-head-acts" },
              o.searchInput ? null : this.searchBox,
              this.headX,
            ),
          ),
      this.banner,
      this.body,
      this.toastEl,
      this.live,
      this.fileIn,
      this.pdfIn,
    );
    this.el.addEventListener("keydown", (e) => this.onKey(e));
    const release = () => {
      this.anchor = null;
      this.moved = true;
    };
    for (const ev of ["wheel", "touchmove", "keydown", "pointerdown"])
      this.el.addEventListener(ev, release, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.measure());
      this.ro.observe(this.el);
    }
    if (typeof IntersectionObserver !== "undefined")
      this.io = new IntersectionObserver(
        (list) => {
          for (const x of list)
            if (x.isIntersecting) void this.drawCover(x.target as HTMLElement);
        },
        { rootMargin: "300px" },
      );
    if (this.syncHash) {
      this.fromHash(false);
      window.addEventListener("hashchange", this.onHash);
    }
    this.pendingSubject = this.st.s;
    // the built-in courses and flights render at once; stored courses and the procedures join when they load
    this.entries = libraryEntries({ samples: allSamples(), stored: [] });
    this.rebuild();
    this.renderAll();
    void this.loadProcedures();
    void this.attach(o.store);
  }

  // ---------------------------------------------------------------- data
  private async attach(s: LibraryOptions["store"]) {
    if (!s) {
      if (this.o.intent === "present") this.pickPresent();
      return;
    }
    try {
      this.store = await s;
    } catch {
      this.store = null;
    }
    if (this.destroyed || !this.store) return;
    this.unsub = this.store.onChange(() => void this.load());
    await this.load();
    if (this.destroyed) return;
    if (this.o.intent === "new") this.newCourse();
    else if (this.o.intent === "present") this.pickPresent();
  }
  private async loadProcedures() {
    try {
      const [st, lib] = await Promise.all([
        import("../../train/procedureStore"),
        import("../../train/procedureLibrary"),
      ]);
      if (this.destroyed) return;
      this.procMod = {
        cats: lib.CATEGORY_LABELS,
        disclaimer: lib.DISCLAIMER,
        effective: (l) => st.effectiveProcedures(l),
        get: (id) => st.getProcedure(id),
      };
      this.rebuild();
      this.renderAll();
    } catch {
      /* the procedures stay out of the library */
    }
  }
  private readProcedures(): Procedure[] {
    const m = this.procMod;
    if (!m) return [];
    const l = this.lang;
    const other: Lang = l === "fr" ? "en" : "fr";
    // the library in the screen language, and every club procedure (a club writes in its own language)
    return [
      ...m.effective(l),
      ...m.effective(other).filter((p) => p.source === "club"),
    ];
  }
  private rebuild() {
    this.procedures = this.readProcedures();
    this.items = libraryItems({
      lang: this.lang,
      courses: this.entries,
      sampleProgram: (id) => SAMPLES.find((s) => s.id === id)?.program,
      sampleBlurb: (id) => SAMPLES.find((s) => s.id === id)?.blurb,
      lessons: lessonRecords(),
      procedures: this.procedures,
      ...(this.procMod ? { categories: this.procMod.cats } : {}),
      clubDrills: this.o.clubDrills?.() ?? [],
    });
  }
  /** Reload everything from the store (after an import, a delete, another tab's change). */
  async load() {
    const seq = ++this.loadSeq;
    const store = this.store;
    const samples = allSamples();
    const stored: { entry: CourseIndexEntry; course?: Course | null }[] = [];
    const progress = new Map<string, CourseProgress>();
    const pid = this.o.profileId ?? "local";
    if (store) {
      // "New course" stores a draft at once (the builder needs an id); one left untouched (no step, the default
      // title) is cleared here, so exploring the button never piles up "Untitled course" drafts
      for (const entry of store.list())
        if (isUntouchedDraft(entry) && !this.ownDrafts.has(entry.id))
          try {
            await store.delete(entry.id);
          } catch {
            /* kept: it shows as a draft */
          }
      for (const entry of store.list()) {
        let course: Course | null = null;
        try {
          course = await store.get(entry.id);
        } catch {
          course = null;
        }
        stored.push({ entry, course });
      }
      for (const id of [
        ...stored.map((x) => x.entry.id),
        ...samples.map((c) => c.id),
      ]) {
        try {
          const p = await store.getProgress(id, pid);
          if (p) progress.set(id, p);
        } catch {
          /* no progress */
        }
      }
    }
    if (seq !== this.loadSeq || this.destroyed) return;
    this.entries = libraryEntries({
      samples,
      stored,
      imported: importedIds(),
      progress,
      needsExport: (id) => store?.needsExport(id) ?? false,
      exportAgeDays: (id) => store?.exportAgeDays(id) ?? null,
    });
    this.rebuild();
    this.renderAll();
  }

  setLang(l: Lang) {
    if (l === this.lang) return;
    this.lang = l;
    this.rebuild();
    this.renderAll();
  }
  destroy() {
    this.destroyed = true;
    this.unsub?.();
    this.ro?.disconnect();
    this.io?.disconnect();
    this.spy?.disconnect();
    if (this.syncHash) window.removeEventListener("hashchange", this.onHash);
    this.searchIn.removeEventListener("input", this.onSearchInput);
    this.searchIn.removeEventListener("keydown", this.onSearchKey);
    for (const t of this.thumbs.values()) t.destroy();
    this.thumbs.clear();
    this.closeMenu();
    this.closeDialog();
    window.clearTimeout(this.toastTimer);
    window.clearTimeout(this.searchTimer);
    this.el.remove();
  }

  // ---------------------------------------------------------------- navigation
  private t(k: CourseStringKey, v?: Record<string, string | number>) {
    return ct(k, this.lang, v);
  }
  private s(k: LibStringKey, v?: Record<string, string | number>) {
    return lt(k, this.lang, v);
  }
  private L(x: L10n | undefined): string {
    return x ? loc(x, this.lang) : "";
  }
  /** "IR › Holding", "LAPL · PPL › Failures and emergencies" */
  private homeLabel(s: SubjectId): string {
    const d = subjectDef(s);
    return `${this.L(programDef(d.program).code)} › ${this.L(d.title)}`;
  }
  /** The academy page keeps the programme and the subject in its hash (#library&p=ir&s=ir.hold): back works. */
  private fromHash(render = true) {
    const r = academyRoute(location.hash);
    if (r.k !== "library") return;
    const p = r.p && isProgramId(r.p) ? r.p : null;
    const s =
      r.s && isSubjectId(r.s) && subjectDef(r.s).program === p ? r.s : null;
    const flights = r.v === "sim";
    // a search typed in another page's app bar (#library&q=…): shown once, then the hash forgets it
    if (r.q) {
      this.st = {
        ...this.st,
        p,
        s: null,
        flights,
        q: r.q,
        kind: flights ? "sim" : "all",
        wide: false,
      };
      this.searchIn.value = r.q;
      this.writeHash(false);
      if (render) this.renderView(true);
      return;
    }
    if (
      p === this.st.p &&
      (s ?? null) === this.st.s &&
      flights === this.st.flights
    )
      return;
    const pageChange = p !== this.st.p || flights !== this.st.flights;
    this.st = {
      ...this.st,
      p,
      s,
      flights,
      ...(pageChange
        ? {
            q: "",
            kind: flights ? ("sim" as const) : ("all" as const),
            wide: false,
          }
        : {}),
    };
    if (pageChange) this.searchIn.value = "";
    if (!render) return;
    if (pageChange) this.renderView(true);
    else if (s) this.scrollToSubject(s);
  }
  private writeHash(push: boolean) {
    if (!this.syncHash) return;
    const hash = academyHash({
      k: "library",
      ...(this.st.flights ? { v: "sim" as const } : {}),
      ...(this.st.p ? { p: this.st.p } : {}),
      ...(this.st.p && this.st.s ? { s: this.st.s } : {}),
    });
    if (location.hash === hash) return;
    if (push) location.hash = hash;
    else history.replaceState(null, "", hash);
  }
  /** Open a programme page (at a subject), or the landing. */
  showProgram(p: ProgramId | "all" | null, s?: SubjectId) {
    if (this.o.entry)
      return this.o.entry.openLibrary(p && p !== "all" ? p : undefined, s);
    const prog = p && p !== "all" ? p : null;
    this.st = {
      p: prog,
      s: prog && s ? s : null,
      q: "",
      kind: "all",
      wide: false,
      flights: false,
    };
    this.searchIn.value = "";
    this.writeHash(true);
    this.renderView(true);
  }
  /** Every flight of the simulator, shelved where it lives: the one "All flights" list. */
  showFlights() {
    if (this.o.entry) return this.o.entry.openFlights?.();
    this.st = {
      p: null,
      s: null,
      q: "",
      kind: "sim",
      wide: false,
      flights: true,
    };
    this.searchIn.value = "";
    this.writeHash(true);
    this.renderView(true);
  }
  private setKind(k: LibKind | "all", focus?: HTMLElement | null) {
    this.st = { ...this.st, kind: k };
    this.renderView(false);
    if (focus)
      this.el
        .querySelector<HTMLElement>(`[data-kind="${k}"]`)
        ?.focus({ preventScroll: true });
  }
  private scrollHost(): HTMLElement | null {
    return this.el.closest(".ga-scroll, .fc-main") as HTMLElement | null;
  }
  private scrollTop() {
    const sc = this.scrollHost();
    if (sc) sc.scrollTop = 0;
  }
  /** Bring the pending subject into view once the layout has settled (the column count can redraw once). */
  private flushScroll() {
    const s = this.pendingSubject;
    if (!s || !this.st.p || this.st.q.trim()) return;
    this.spyMuteUntil = Date.now() + 900;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (this.pendingSubject !== s || this.destroyed) return;
        this.pendingSubject = null;
        this.scrollToSubject(s, false);
      }),
    );
  }
  private scrollToSubject(s: SubjectId, smooth = true) {
    this.anchor = s;
    this.spyMuteUntil = Date.now() + (smooth ? 900 : 300);
    const sec = this.body.querySelector<HTMLElement>(
      `.lb-subj[data-subject="${s}"]`,
    );
    this.st = { ...this.st, s };
    this.markSubject(s);
    this.writeHash(false);
    if (!sec) return;
    const reduce =
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    sec.scrollIntoView({
      behavior: smooth && !reduce ? "smooth" : "auto",
      block: "start",
    });
  }
  private markSubject(s: SubjectId) {
    for (const b of this.body.querySelectorAll<HTMLElement>(".lb-rail-s")) {
      const on = b.dataset.subject === s;
      b.classList.toggle("on", on);
      if (on) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
    }
    const sel =
      this.body.querySelector<HTMLSelectElement>(".lb-toc-sel select");
    if (sel && sel.value !== s && [...sel.options].some((x) => x.value === s))
      sel.value = s;
  }

  // ---------------------------------------------------------------- layout
  private measure() {
    const w = this.el.clientWidth;
    if (!w) return;
    this.el.classList.toggle("is-mid", w < 1300);
    this.el.classList.toggle("is-narrow", w < 1200);
    this.el.classList.toggle("is-tablet-p", w < 900);
    this.el.classList.toggle("is-phone", w < 640);
    const rail = w >= RAIL_MIN;
    const pad = w < 640 ? 40 : w < 1200 ? 56 : 80;
    const inner = Math.max(
      240,
      w - pad - (this.st.p && rail ? (w < 1300 ? 244 : 304) : 0),
    );
    const min = w < 640 ? 240 : CARD_MIN;
    const cols = Math.max(
      1,
      Math.min(4, Math.floor((inner + GAP) / (min + GAP))),
    );
    if (cols !== this.cols || rail !== this.rail) {
      this.cols = cols;
      this.rail = rail;
      const y = this.scrollHost()?.scrollTop ?? 0;
      this.renderBody();
      // a redraw keeps the reader where they were (at their subject on a first draw)
      if (this.pendingSubject) this.flushScroll();
      else if (y > 0) {
        const sc = this.scrollHost();
        if (sc) sc.scrollTop = y;
      }
    }
  }
  private renderAll() {
    this.closeMenu();
    this.renderBanners();
    if (this.anchor && this.st.p && !this.st.q.trim() && !this.pendingSubject)
      this.pendingSubject = this.anchor;
    this.renderView(false);
  }
  /** Header and body for the current state (`top`: a new page, scroll to its top or to its subject). */
  private renderView(top: boolean) {
    // only a subject that was asked for (a deep link, a click in a table of contents) scrolls the page: the subject
    // the body picks for the index while drawing must not, or a programme opens past its own header
    const asked = this.st.p && !this.st.q ? this.st.s : null;
    if (!this.o.entry) this.renderHead();
    this.renderBody();
    if (top) {
      this.moved = false;
      this.scrollTop();
      if (asked) this.pendingSubject = asked;
    }
    this.flushScroll();
    requestAnimationFrame(() => requestAnimationFrame(() => this.focusBackItem()));
  }
  /** Back from a course to this formation page (the player's « ← LAPL · PPL »): the course's card is in view and
   *  has the focus, so the reader is where they left (BACK_ITEM_KEY, written by the player's way back). */
  private backItem: { key: string; until: number } | null = null;
  private focusBackItem() {
    if (this.destroyed || !this.st.p || this.st.q.trim()) return;
    if (!this.backItem) {
      let key: string | null = null;
      try {
        key = sessionStorage.getItem(BACK_ITEM_KEY);
        sessionStorage.removeItem(BACK_ITEM_KEY);
      } catch {
        return;
      }
      if (!key) return;
      // the page may draw again while its items load: keep the card in view for that moment
      this.backItem = { key, until: Date.now() + 3000 };
    }
    if (Date.now() > this.backItem.until) {
      this.backItem = null;
      return;
    }
    const card = this.body.querySelector<HTMLElement>(`li[data-key="${CSS.escape(this.backItem.key)}"]`);
    if (!card) return;
    this.spyMuteUntil = Date.now() + 600;
    this.pendingSubject = null;
    card.scrollIntoView({ block: "center" });
    card.querySelector<HTMLElement>(".lb-hit")?.focus({ preventScroll: true });
  }


  // ---------------------------------------------------------------- the header
  private crumb(parts: (string | [string, () => void])[]): HTMLElement {
    const out: (HTMLElement | string)[] = [];
    parts.forEach((x, k) => {
      if (k)
        out.push(
          h("span", { class: "lb-crumb-sep", "aria-hidden": "true" }, "›"),
        );
      out.push(
        typeof x === "string"
          ? h("span", { "aria-current": "page" }, x)
          : h(
              "button",
              { class: "lb-crumb-b", type: "button", onclick: x[1] },
              x[0],
            ),
      );
    });
    return h(
      "nav",
      { class: "lb-crumb", "aria-label": this.s("crumbNav") },
      ...out,
    );
  }
  private renderHead() {
    const st = this.st;
    const q = st.q.trim();
    const scope = st.p && !st.wide ? st.p : null;
    this.searchIn.placeholder = scope
      ? this.s("searchIn", { p: this.L(programDef(scope).code) })
      : this.s("search");
    this.searchIn.setAttribute("aria-label", this.searchIn.placeholder);
    this.el.dataset.view = q
      ? "search"
      : st.flights
        ? "flights"
        : st.p
          ? "program"
          : "landing";
    const toLanding: [string, () => void] = [
      this.s("library"),
      () => this.showProgram(null),
    ];
    if (q) {
      const v = searchView(this.items, q, st.kind, scope ?? "all");
      // nothing shelved under these words, but a subject (or a planned course) answers: say where it lives
      const subjOnly = !v.total && (v.subjects.length > 0 || v.soon.length > 0);
      this.headL.replaceChildren(
        this.crumb(
          scope
            ? [
                toLanding,
                [this.L(programDef(scope).code), () => this.clearSearch()],
                this.s("searchCrumb"),
              ]
            : [toLanding, this.s("searchCrumb")],
        ),
        h(
          "h1",
          { class: "lb-h1 sm" },
          v.total === 1
            ? this.s("result1", { q })
            : v.total
              ? this.s("results", { n: v.total, q })
              : subjOnly
                ? this.s("subjectOnly", { q })
                : this.s("noHits", { q }),
        ),
        subjOnly
          ? h("p", { class: "lb-lead" }, this.s("subjectOnlyBody"))
          : "",
        scope
          ? h(
              "p",
              { class: "lb-lead" },
              h(
                "button",
                {
                  class: "lb-link b lb-widen",
                  type: "button",
                  onclick: () => {
                    this.st = { ...this.st, wide: true };
                    this.renderView(false);
                  },
                },
                this.s("searchAllBtn"),
              ),
            )
          : "",
      );
      // nothing at all: no row of "0" filters over the empty answer
      this.headX.replaceChildren(v.kinds.all ? this.kindSeg(v.kinds) : "");
      return;
    }
    if (st.flights) {
      const v = searchView(this.items, "", "sim", "all");
      this.headL.replaceChildren(
        this.crumb([toLanding, this.s("flightsTitle")]),
        h("h1", { class: "lb-h1" }, this.s("flightsTitle")),
        h("p", { class: "lb-lead" }, this.s("flightsLead")),
        h(
          "p",
          { class: "lb-ctx num" },
          ltN("item1", "items", v.total, this.lang),
        ),
      );
      this.headX.replaceChildren();
      return;
    }
    if (st.p) {
      const p = st.p;
      const d = programDef(p);
      const v = programView(this.items, p);
      const own = p === "club" || p === "instructors";
      this.headL.replaceChildren(
        this.crumb([toLanding, this.L(d.code)]),
        h(
          "h1",
          { class: "lb-h1" },
          this.L(d.code),
          h("span", { class: "lb-h1-m" }, ` — ${this.L(d.title)}`),
        ),
        h(
          "p",
          { class: "lb-ctx" },
          h("span", {}, own ? this.L(d.blurb) : this.L(d.frame)),
          !own && v.total
            ? [
                h("span", { class: "lb-dot", "aria-hidden": "true" }, "·"),
                h(
                  "span",
                  { class: "num" },
                  this.s("doneOf", { d: v.done, n: v.total }),
                ),
                this.bar(v.done, v.total),
              ]
            : null,
        ),
      );
      const mineSubj = p === "instructors" ? "instructors.mine" : "club.courses";
      const hasOwn =
        own &&
        (v.index.find((x) => x.subject.id === mineSubj)?.n ?? 0) > 0;
      this.headX.replaceChildren(
        own
          ? hasOwn
            ? this.newCourseBtn(p === "club" ? "club.courses" : undefined)
            : ""
          : this.startBlock(p),
      );
      return;
    }
    const n = this.items.length;
    this.headL.replaceChildren(
      h(
        "p",
        { class: "lb-eyebrow" },
        this.s("eyebrow"),
        h(
          "span",
          { class: "lb-eyebrow-n num" },
          ` · ${this.s("eyebrowN", { n })}`,
        ),
      ),
      h("h1", { class: "lb-h1" }, this.s("title")),
      h("p", { class: "lb-lead" }, this.s("lead")),
    );
    this.headX.replaceChildren(this.newCourseBtn());
  }
  /** The one « Nouveau cours » of the page (secondary: the page's filled button, if any, is « Reprendre »). */
  private newCourseBtn(at?: SubjectId): HTMLElement {
    return h(
      "button",
      {
        class: "gl-btn lb-head-new",
        type: "button",
        onclick: () => this.newCourse(at),
      },
      ic("plus", 18),
      this.s("newCourse"),
    );
  }
  /** « Commencer : leçon 1 » (or « Continuer : … »), the formation page's one filled button, with what and how long
   *  under it. */
  private startBlock(p: ProgramId): HTMLElement {
    const nx = this.nextOf(p);
    if (!nx)
      return h(
        "p",
        { class: "lb-start-done" },
        ic("check", 18),
        this.s("allDone"),
      );
    const i = nx.item;
    const rank = lessonRank(this.items, i);
    const label = rank
      ? this.s(nx.going ? "goOnLesson" : "startLesson", { n: rank.n })
      : this.s(nx.going ? "goOn" : "start");
    const what = [
      this.L(i.title),
      i.minutes
        ? `${this.s("min", { n: i.minutes })}${i.kind === "sim" ? ` ${this.s("inSim")}` : ""}`
        : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return h(
      "div",
      { class: "lb-start" },
      h(
        "button",
        {
          class: "gl-primary lb-start-go",
          type: "button",
          "aria-describedby": "lb-start-what",
          onclick: () => this.openItem(i),
        },
        ic("play", 16),
        label,
      ),
      h("small", { id: "lb-start-what", class: "lb-start-what" }, what),
    );
  }
  /** Every card and row of a formation page, in the order the page draws them. */
  private drawnIn(p: ProgramId): LibItem[] {
    return programView(this.items, p).groups.flatMap((g) =>
      g.sections.flatMap((s) => s.items),
    );
  }
  /** Where a formation starts: LAPL · PPL with its first flight lesson (straight and level), the others with their
   *  first item in syllabus order. */
  private startOf(p: ProgramId): LibItem | undefined {
    const all = this.drawnIn(p);
    if (p === "ppl") {
      const l = all.find((i) => i.sub === "lesson" && programOf(i) === "ppl");
      if (l) return l;
    }
    // its own first course or flight, else what another formation lends it
    return (
      all.find((i) => i.kind !== "proc" && programOf(i) === p) ??
      all.find((i) => i.kind !== "proc") ??
      all[0]
    );
  }
  /** The formation's next step: what the student started (or was given) here, else its start, else the first item
   *  not done yet. */
  private nextOf(p: ProgramId): { item: LibItem; going: boolean } | null {
    const all = this.drawnIn(p);
    // what the student started or was given in THIS formation (an item it lends another one stays there)
    const going = continueItems(this.items, 99).find(
      (i) => programOf(i) === p && all.includes(i),
    );
    if (going) return { item: going, going: true };
    const st = this.startOf(p);
    if (st && !isDone(st)) return { item: st, going: false };
    const nx = all.find((i) => !isDone(i) && i.kind !== "proc");
    return nx ? { item: nx, going: true } : null;
  }
  /** "Lesson 1: Straight and level", or the title */
  private itemName(i: LibItem): string {
    const r = lessonRank(this.items, i);
    const t = this.L(i.title);
    if (!r) return t;
    // « Leçon 1 : Vol rectiligne en palier », but « Leçon 1 — Attente : entrée directe » (never two colons)
    return t.includes(":")
      ? `${this.s("lessonN", { n: r.n }).replace(/\s*:$/, "")} — ${t}`
      : `${this.s("lessonN", { n: r.n })} ${t}`;
  }
  /** 45 min · 1 h 10 */
  private dur(min: number): string {
    const m5 = Math.max(5, Math.round(min / 5) * 5);
    if (m5 < 60) return this.s("min", { n: m5 });
    const hh = Math.floor(m5 / 60);
    const mm = m5 % 60;
    if (!mm) return `${hh} h`;
    return this.lang === "fr"
      ? `${hh} h ${String(mm).padStart(2, "0")}`
      : `${hh} h ${mm} min`;
  }
  private bar(done: number, total: number): HTMLElement {
    return h(
      "span",
      { class: "lb-bar", "aria-hidden": "true" },
      h("i", {
        style: `width:${done ? Math.max(3, Math.round((done / Math.max(1, total)) * 100)) : 0}%`,
      }),
    );
  }
  /** The one filter: Tout · Cours · Au simulateur · Procédures et check-lists, with counts in the scope. */
  private kindSeg(n: Record<LibKind | "all", number>): HTMLElement {
    const seg = (k: LibKind | "all", label: string) =>
      h(
        "button",
        {
          class: `gl-seg-b${this.st.kind === k ? " on" : ""}`,
          type: "button",
          "data-kind": k,
          "aria-pressed": this.st.kind === k ? "true" : "false",
          onclick: () => this.setKind(k, null),
        },
        label,
        h("span", { class: "gl-seg-n num" }, String(n[k])),
      );
    return h(
      "div",
      {
        class: "gl-seg lb-kinds",
        role: "group",
        "aria-label": this.s("kindsNav"),
      },
      seg("all", this.s("all")),
      // a family with nothing in this scope is not offered (no « 0 » to click), unless it is the one shown
      ...KIND_ORDER.filter((k) => n[k] > 0 || this.st.kind === k).map((k) =>
        seg(k, this.L(KIND_FILTER[k])),
      ),
    );
  }
  private searchFor(q: string) {
    this.searchIn.value = q;
    this.st = { ...this.st, q };
    this.renderView(false);
  }
  private clearSearch() {
    this.searchIn.value = "";
    this.st = { ...this.st, q: "", wide: false };
    this.renderView(true);
  }

  // ---------------------------------------------------------------- banners and nudges
  private renderBanners() {
    const s = this.store;
    const out: HTMLElement[] = [];
    if (this.o.entry) {
      this.banner.hidden = true;
      return;
    }
    if (s && s.backend === "memory")
      out.push(
        h(
          "div",
          { class: "gl-banner warn", role: "note" },
          ic("warn", 18),
          h("span", {}, this.t("notSaved")),
        ),
      );
    const mine = this.entries.filter((e) => !e.sample);
    const persisted = s?.persistState();
    if (
      s &&
      s.backend === "idb" &&
      mine.length &&
      persisted !== "persisted" &&
      persisted !== "granted"
    ) {
      out.push(
        h(
          "div",
          { class: "gl-banner", role: "note" },
          ic("shield", 18),
          h(
            "span",
            {},
            h("b", {}, this.t("keepTitle")),
            " ",
            isIpad() ? this.t("keepBodyIpad") : this.t("keepBody"),
          ),
          h(
            "button",
            {
              class: "gl-btn sm",
              type: "button",
              onclick: () => void this.askPersist(),
            },
            this.t("keepAsk"),
          ),
        ),
      );
    }
    const stale = mine.filter((e) => e.needsExport);
    if (stale.length) {
      const e = stale[0];
      out.push(
        h(
          "div",
          { class: "gl-banner", role: "note" },
          ic("download", 18),
          h(
            "span",
            {},
            h("b", {}, loc(e.title, this.lang)),
            " · ",
            this.t("exportNudge", { n: e.exportAgeDays ?? 7 }),
          ),
          h(
            "button",
            {
              class: "gl-btn sm",
              type: "button",
              onclick: () => void this.exportEntry(e),
            },
            this.t("exportNow"),
          ),
        ),
      );
    }
    this.banner.replaceChildren(...out);
    this.banner.hidden = !out.length;
  }
  private async askPersist() {
    const { persist } = await import("../../lib/idb");
    const r = await persist();
    this.toast(
      r === "persisted" || r === "granted"
        ? this.t("keepOk")
        : this.t("keepNo"),
    );
    this.renderBanners();
  }

  // ---------------------------------------------------------------- the body
  private renderBody() {
    this.closeMenu();
    this.spy?.disconnect();
    this.spy = null;
    for (const [el, t] of this.thumbs)
      if (this.body.contains(el)) (t.destroy(), this.thumbs.delete(el));
    this.body.style.setProperty("--lb-cols", String(this.cols));
    const st = this.st;
    const out: HTMLElement[] = this.o.entry
      ? this.entryView()
      : st.q.trim()
        ? this.searchBody()
        : st.flights
          ? this.flightsBody()
          : st.p
            ? [this.programBody(st.p)]
            : this.landing();
    this.body.replaceChildren(...out);
    if (st.p && !st.q.trim() && !this.o.entry) this.watchSubjects();
  }
  private grid(
    items: readonly LibItem[],
    ctx: CardCtx,
    cols = this.cols,
  ): HTMLElement {
    return h(
      "ul",
      { class: "lb-grid", style: `--lb-cols:${cols}` },
      ...items.map((i) => this.card(i, ctx)),
    );
  }
  private rows(items: readonly LibItem[], ctx: CardCtx): HTMLElement {
    return h(
      "ul",
      { class: `lb-rows${this.cols >= 3 && ctx !== "search" ? " two" : ""}` },
      ...items.map((i) => this.row(i, ctx)),
    );
  }
  private secHead(
    title: string,
    sub?: string,
    extra?: HTMLElement | null,
  ): HTMLElement {
    return h(
      "div",
      { class: "lb-sec-h" },
      h("h2", {}, title),
      sub ? h("span", { class: "lb-sec-sub" }, sub) : null,
      extra ?? null,
    );
  }

  // ---------------------------------------------------------------- the landing
  /** « Choisissez votre formation »: Reprendre (only with something started or given), the four formations as
   *  cards (their « who » lines are the routes), Club and Instructeurs as two rows, one « Découvrir » line. */
  private landing(): HTMLElement[] {
    const out: HTMLElement[] = [];
    const cont = continueItems(this.items, 4);
    if (cont.length) out.push(this.resumeBox(cont));
    const sh = shelves(this.items);
    const newcomer = isNewcomer(this.items);
    out.push(
      h(
        "section",
        { class: "lb-progs-s", "aria-label": this.s("title") },
        h(
          "ul",
          { class: "lb-progs" },
          ...sh
            .filter((x) => x.program !== "club" && x.program !== "instructors")
            .map((x) => this.programCard(x, newcomer && x.program === "ppl")),
        ),
      ),
    );
    const club = sh.find((x) => x.program === "club");
    const mine = this.entries.filter((e) => !e.sample).length;
    out.push(
      h(
        "section",
        { class: "lb-others", "aria-labelledby": "lb-others-h" },
        h("h2", { class: "lb-others-h", id: "lb-others-h" }, this.s("forClub")),
        h(
          "ul",
          { class: "lb-others-l" },
          this.otherCard(
            "club",
            "list",
            club?.total ? ltN("item1", "items", club.total, this.lang) : "",
          ),
          this.otherCard(
            "instructors",
            "users",
            mine ? ltN("course1", "coursesN", mine, this.lang) : "",
          ),
        ),
      ),
    );
    out.push(
      h(
        "p",
        { class: "lb-discover" },
        ic("play", 16),
        h("span", {}, `${this.s("newHere")} `),
        h(
          "a",
          {
            class: "lb-link b",
            href: `${this.o.simPage ?? "index.html"}?intro=1`,
          },
          this.s("discover"),
        ),
      ),
    );
    return out;
  }
  /** Reprendre: what the student started or was given, one row each; the first row's button is the page's one
   *  filled button. */
  private resumeBox(list: readonly LibItem[]): HTMLElement {
    return h(
      "section",
      { class: "lb-resume", "aria-labelledby": "lb-resume-h" },
      h("h2", { class: "lb-resume-h", id: "lb-resume-h" }, this.s("continue")),
      h(
        "ul",
        { class: "lb-resume-l" },
        ...list.map((i, k) => this.resumeRow(i, k === 0)),
      ),
    );
  }
  private resumeRow(i: LibItem, primary: boolean): HTMLElement {
    const th = h("span", {
      class: `lb-cover lb-resume-th cov-${i.kind}`,
      "aria-hidden": "true",
    });
    th.dataset.key = i.key;
    if (i.kind === "course") this.observeCover(th);
    else th.append(simCover(i, this.lang, null));
    const p = i.progress;
    const where =
      i.kind === "course" && p && p.total
        ? this.s("stepOf", {
            n: Math.min(p.total, p.done + 1),
            m: p.total,
          })
        : p?.attempts
          ? this.s("triesBest", {
              a: ltN("attempt1", "attemptsN", p.attempts, this.lang),
              n: Math.round(p.best ?? 0),
            })
          : i.assigned
            ? this.s("assignedTag")
            : "";
    return h(
      "li",
      { class: "lb-resume-r", "data-key": i.key },
      th,
      h(
        "span",
        { class: "lb-resume-t" },
        h("b", {}, this.L(i.title)),
        h(
          "small",
          {},
          [this.homeLabel(i.home), where].filter(Boolean).join(" · "),
        ),
      ),
      i.kind === "course" && p && p.total
        ? h(
            "span",
            { class: "lb-bar acc lb-resume-bar", "aria-hidden": "true" },
            h("i", {
              style: `width:${Math.max(3, Math.round((p.done / p.total) * 100))}%`,
            }),
          )
        : null,
      h(
        "button",
        {
          class: primary ? "gl-primary sm" : "gl-btn sm",
          type: "button",
          "aria-label": `${this.s("resumeBtn")} — ${this.L(i.title)}`,
          onclick: () => this.openItem(i),
        },
        ic("play", 15),
        this.s("resumeBtn"),
      ),
    );
  }
  /** A formation: its drawing, its name and who it is for, one line, ONE count (what its page draws), and where it
   *  starts. The whole card is the link. */
  private programCard(sh: LibShelf, rec: boolean): HTMLElement {
    const p = sh.program;
    const d = programDef(p);
    const nx = this.nextOf(p);
    const href = academyHref({ k: "library", p }, this.o.page ?? "academy.html");
    return h(
      "li",
      { class: `lb-pc prog-${p}${rec ? " is-rec" : ""}` },
      h(
        "a",
        {
          class: "lb-pc-a",
          href,
          onclick: (e: Event) => {
            const m = e as MouseEvent;
            if (m.metaKey || m.ctrlKey || m.shiftKey || m.button > 0) return;
            e.preventDefault();
            this.showProgram(p);
          },
        },
        h(
          "span",
          { class: "lb-pc-top" },
          h("span", {
            class: "lb-pc-art",
            "aria-hidden": "true",
            html: programArt(p),
          }),
          h("h2", { class: "lb-pc-code" }, this.L(d.code)),
          d.who ? h("span", { class: "lb-pc-who" }, this.L(d.who)) : null,
        ),
        h(
          "span",
          { class: "lb-pc-bd" },
          h("span", { class: "lb-pc-name" }, this.L(d.title)),
          h("span", { class: "lb-pc-desc" }, this.L(d.blurb)),
          h(
            "span",
            { class: "lb-pc-meta num" },
            [
              ltN("item1", "items", sh.total, this.lang),
              ltN("subject1", "subjectsN", subjectsOf(p).length, this.lang),
              sh.done ? ltN("done1", "doneN", sh.done, this.lang) : "",
            ]
              .filter(Boolean)
              .join(" · "),
          ),
          nx
            ? h(
                "span",
                { class: "lb-pc-first" },
                h(
                  "span",
                  {},
                  this.s(nx.going ? "continueWith" : "startWith"),
                  h("b", {}, this.itemName(nx.item)),
                ),
                ic("arrow", 20),
              )
            : null,
        ),
      ),
    );
  }
  /** Club or Instructeurs: one row card to its page. */
  private otherCard(
    p: "club" | "instructors",
    icon: keyof typeof ICON,
    n: string,
  ): HTMLElement {
    const d = programDef(p);
    return h(
      "li",
      { class: `lb-oc prog-${p}` },
      h(
        "a",
        {
          class: "lb-oc-a",
          href: academyHref({ k: "library", p }, this.o.page ?? "academy.html"),
          onclick: (e: Event) => {
            const m = e as MouseEvent;
            if (m.metaKey || m.ctrlKey || m.shiftKey || m.button > 0) return;
            e.preventDefault();
            this.showProgram(p);
          },
        },
        h("span", { class: "lb-oc-ic", "aria-hidden": "true" }, ic(icon, 22)),
        h(
          "span",
          { class: "lb-oc-t" },
          h("b", {}, this.L(d.code)),
          h("small", {}, this.L(d.blurb)),
        ),
        n ? h("span", { class: "lb-oc-n num" }, n) : null,
        ic("chev", 20),
      ),
    );
  }
  /** The club's tools, in the Flight Center (checklists, drills, results, the club pack). */
  private openClubTool(tab: ClubTool) {
    if (this.o.openClub) return this.o.openClub(tab);
    location.assign(
      `${this.o.simPage ?? "index.html"}?club=${encodeURIComponent(tab)}`,
    );
  }
  /** The subject number as printed: a programme's own numbering (01…15, 010…090). */
  private subjNum(d: SubjectDef): string {
    return d.n;
  }

  // ---------------------------------------------------------------- a programme page
  /** One filter (Tout · Cours · Au simulateur · Check-lists) and, at the right, what the numbers mean. */
  private toolsRow(p: ProgramId, v: ProgramView): HTMLElement {
    const subs = subjectsOf(p);
    const own = p === "club" || p === "instructors";
    return h(
      "div",
      { class: "lb-tools-row" },
      v.total ? this.kindSeg(v.kinds) : null,
      !own && subs.length > 1
        ? h(
            "p",
            { class: "lb-tools-hint" },
            this.s("syllabusHint", {
              a: subs[0].n,
              b: subs[subs.length - 1].n,
            }),
          )
        : null,
    );
  }
  private programBody(p: ProgramId): HTMLElement {
    const v = programView(this.items, p, this.st.kind);
    const main = h("div", { class: "lb-main" });
    if (p === "instructors") main.append(this.toolsBlock());
    if (p === "club") main.append(this.clubToolsBlock());
    const kinded = this.st.kind !== "all";
    for (const g of v.groups) {
      const secs: HTMLElement[] = [];
      for (const s of g.sections) {
        const id = s.subject.id;
        // the author's and the club's own subjects start empty: they say how to start, not « bientôt »
        if (!s.total && id === "instructors.mine") {
          if (!kinded || this.st.kind === "course") secs.push(this.draftsEmpty());
          continue;
        }
        if (!s.total && id === "club.courses") {
          if (!kinded || this.st.kind === "course")
            secs.push(this.clubCoursesEmpty());
          continue;
        }
        secs.push(
          !s.total
            ? this.soonRowEl(s)
            : !s.items.length
              ? this.otherKindRow(s)
              : this.subjectSection(s),
        );
      }
      if (!secs.length) continue;
      main.append(
        h(
          "div",
          { class: "lb-group" },
          g.title && v.groups.length > 1
            ? h("p", { class: "lb-cap lb-group-h" }, this.L(g.title))
            : null,
          ...secs,
        ),
      );
    }
    // the subject in view: the asked one, else the first one with something to open under the filter
    const first =
      v.index.find((x) => (x.shown ?? x.n) > 0)?.subject.id ??
      v.index[0]?.subject.id ??
      null;
    if (!this.st.s || subjectDef(this.st.s).program !== p)
      this.st = { ...this.st, s: first };
    return h(
      "div",
      { class: `lb-prog prog-${p}` },
      this.toolsRow(p, programView(this.items, p)),
      h(
        "div",
        { class: `lb-prog-b${this.rail ? " has-rail" : ""}` },
        this.rail ? this.railEl(v.index) : this.tocSelect(v.index),
        main,
      ),
    );
  }
  /** A subject's count in the Sommaire: what it draws under the filter, or « bientôt ». */
  private countEl(x: ShelfSubject, cls: string): HTMLElement {
    const n = x.shown ?? x.n;
    if (x.n) return h("span", { class: `${cls} num${n ? "" : " is-zero"}` }, String(n));
    if (x.subject.id === "club.courses" || x.subject.id === "instructors.mine")
      return h("span", { class: `${cls} num is-zero` }, "0");
    return h("span", { class: `${cls} is-soon` }, this.s("soonWord"));
  }
  /** The Sommaire: every subject at its official number, its count or « bientôt »; a click scrolls to it. */
  private railEl(index: ProgramView["index"]): HTMLElement {
    const groups = new Map<string, ProgramView["index"]>();
    for (const x of index) {
      const g = x.subject.group ?? "";
      groups.set(g, [...(groups.get(g) ?? []), x]);
    }
    const multi = groups.size > 1;
    return h(
      "nav",
      { class: "lb-rail", "aria-labelledby": "lb-rail-h" },
      h("h2", { class: "lb-cap lb-rail-h", id: "lb-rail-h" }, this.s("index")),
      ...[...groups.entries()].map(([g, xs]) =>
        h(
          "div",
          { class: "lb-rail-g" },
          multi && g
            ? h(
                "p",
                { class: "lb-rail-gt" },
                this.L(GROUPS[g as "theory" | "flight"]),
              )
            : null,
          h(
            "ul",
            { class: "lb-rail-l" },
            ...xs.map((x) =>
              h(
                "li",
                {},
                h(
                  "button",
                  {
                    class: `lb-rail-s${x.n ? "" : " light"}${x.subject.id === this.st.s ? " on" : ""}`,
                    type: "button",
                    "data-subject": x.subject.id,
                    ...(x.subject.id === this.st.s
                      ? { "aria-current": "true" }
                      : {}),
                    onclick: () => this.scrollToSubject(x.subject.id),
                  },
                  h("span", { class: "lb-rail-n num" }, this.subjNum(x.subject)),
                  h("span", { class: "lb-rail-t" }, this.L(x.subject.title)),
                  x.done
                    ? h(
                        "span",
                        {
                          class: "lb-rail-d num",
                          title: ltN("done1", "doneN", x.done, this.lang),
                        },
                        ic("check", 13),
                        String(x.done),
                      )
                    : null,
                  this.countEl(x, "lb-rail-c"),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
  /** Narrow screens: the Sommaire is one sticky select (« Sommaire : 02 Performances humaines »). */
  private tocSelect(index: ProgramView["index"]): HTMLElement {
    const sel = h(
      "select",
      {
        "aria-label": this.s("index"),
        onchange: () => {
          const v = sel.value;
          if (isSubjectId(v)) this.scrollToSubject(v);
        },
      },
      ...index.map((x) =>
        h(
          "option",
          { value: x.subject.id, selected: x.subject.id === this.st.s },
          `${this.s("contentsAt", { s: `${this.subjNum(x.subject)} ${this.L(x.subject.title)}` })}${
            x.n ? ` · ${x.shown ?? x.n}` : ` · ${this.s("soonWord")}`
          }`,
        ),
      ),
    ) as HTMLSelectElement;
    return h("div", { class: "lb-toc-sel" }, h("label", { class: "lb-select" }, sel));
  }
  /** Highlight the subject being read in the Sommaire. */
  private watchSubjects() {
    if (typeof IntersectionObserver === "undefined") return;
    const root = this.scrollHost();
    this.spy = new IntersectionObserver(
      (list) => {
        const hit = list
          .filter((x) => x.isIntersecting)
          .sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top,
          )[0];
        const s = (hit?.target as HTMLElement | undefined)?.dataset.subject;
        if (!this.moved || Date.now() < this.spyMuteUntil) return;
        if (s && isSubjectId(s) && s !== this.st.s) {
          this.st = { ...this.st, s };
          this.markSubject(s);
          this.writeHash(false);
        }
      },
      { root, rootMargin: "-15% 0px -70% 0px" },
    );
    for (const sec of this.body.querySelectorAll(".lb-subj"))
      this.spy.observe(sec);
  }
  /** A subject's heading: its number, its name, then one muted line. */
  private subjHead(d: SubjectDef, meta: string): HTMLElement {
    return h(
      "div",
      { class: "lb-subj-h" },
      h(
        "h2",
        { id: `lb-s-${d.id}` },
        h("span", { class: "lb-subj-n num" }, this.subjNum(d)),
        h("span", { class: "lb-subj-t" }, this.L(d.title)),
      ),
      meta ? h("span", { class: "lb-subj-m num" }, meta) : null,
    );
  }
  /** A subject with something to open: one count (the cards and rows drawn below) and the time, then the cards in
   *  the fixed kind order; checklists as rows when there are more than three, free practice always as rows. */
  private subjectSection(s: SubjectSection): HTMLElement {
    const d = s.subject;
    const meta = [
      ltN("item1", "items", s.items.length, this.lang),
      s.minutes ? this.s("about", { t: this.dur(s.minutes) }) : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const checks = s.items.filter((i) => i.kind === "proc");
    const asRow = (i: LibItem) =>
      i.sub === "scenario" || (i.kind === "proc" && checks.length > 3);
    const cards = s.items.filter((i) => !asRow(i));
    const rows = s.items.filter(asRow);
    return h(
      "section",
      {
        class: "lb-subj",
        "data-subject": d.id,
        "aria-labelledby": `lb-s-${d.id}`,
      },
      this.subjHead(d, meta),
      cards.length ? this.grid(cards, "subject") : null,
      rows.length ? this.rows(rows, "subject") : null,
      s.soon.length ? this.soonLineEl(s.soon) : null,
    );
  }
  /** « Bientôt dans Wingdeck : « Espaces aériens et règles VFR » est en préparation. » */
  private soonText(list: readonly PlannedItem[]): string {
    const b = BRAND.name;
    if (!list.length) return this.s("soonBare", { b });
    if (list.length === 1)
      return this.s("soonOne", { b, t: this.L(list[0].title) });
    const q = (t: string) => (this.lang === "fr" ? `« ${t} »` : `“${t}”`);
    const names = list.slice(0, 3).map((x) => q(this.L(x.title)));
    const last = names.pop()!;
    return this.s("soonMany", {
      b,
      t: `${names.join(", ")} ${this.s("and")} ${last}`,
    });
  }
  private soonLineEl(list: readonly PlannedItem[]): HTMLElement {
    return h("p", { class: "lb-soon-l" }, this.soonText(list));
  }
  /** A subject with nothing yet: one dashed row, so the numbering never has a gap and a click lands somewhere. */
  private soonRowEl(s: SubjectSection): HTMLElement {
    const d = s.subject;
    const own = d.program === "club";
    const create = !own && d.program !== "instructors";
    return h(
      "section",
      {
        class: "lb-subj is-soon",
        "data-subject": d.id,
        "aria-labelledby": `lb-s-${d.id}`,
      },
      h(
        "h2",
        { id: `lb-s-${d.id}` },
        h("span", { class: "lb-subj-n num" }, this.subjNum(d)),
        h("span", { class: "lb-subj-t" }, this.L(d.title)),
      ),
      h(
        "p",
        { class: "lb-soon-t" },
        own
          ? this.s(d.id === "club.drills" ? "clubNoLists" : "clubNothing")
          : this.soonText(s.soon),
      ),
      !create
        ? null
        : h(
            "a",
            {
              class: "lb-link b lb-create-here",
              href: `${this.o.page ?? "academy.html"}#new&p=${d.program}&s=${d.id}`,
              onclick: (e: Event) => {
                e.preventDefault();
                this.newCourse(d.id);
              },
            },
            ic("plus", 16),
            this.s("createHere"),
          ),
    );
  }
  /** A subject with content, but none of the kind the filter keeps: say so, and offer everything. */
  private otherKindRow(s: SubjectSection): HTMLElement {
    const d = s.subject;
    const k = this.st.kind === "all" ? "" : this.L(KIND_FILTER[this.st.kind]);
    return h(
      "section",
      {
        class: "lb-subj is-soon",
        "data-subject": d.id,
        "aria-labelledby": `lb-s-${d.id}`,
      },
      h(
        "h2",
        { id: `lb-s-${d.id}` },
        h("span", { class: "lb-subj-n num" }, this.subjNum(d)),
        h("span", { class: "lb-subj-t" }, this.L(d.title)),
      ),
      h("p", { class: "lb-soon-t" }, this.s("noneOfKind", { k })),
      h(
        "button",
        {
          class: "lb-link b",
          type: "button",
          onclick: () => this.setKind("all"),
        },
        this.s("showAllN", { n: s.total }),
      ),
    );
  }
  private toolsBlock(): HTMLElement {
    const tool = (
      icon: keyof typeof ICON,
      title: LibStringKey,
      sub: LibStringKey,
      run: () => void,
    ) =>
      h(
        "button",
        { class: "lb-tool", type: "button", onclick: run },
        h("span", { class: "lb-tool-ic", "aria-hidden": "true" }, ic(icon, 22)),
        h(
          "span",
          { class: "lb-tool-t" },
          h("b", {}, this.s(title)),
          h("small", {}, this.s(sub)),
        ),
      );
    return h(
      "section",
      { class: "lb-tools", "aria-label": this.s("tools") },
      h("p", { class: "lb-cap" }, this.s("tools")),
      h(
        "div",
        { class: "lb-tools-l" },
        tool("pdf", "toolPdf", "toolPdfSub", () => this.pickPdf()),
        tool("upload", "toolPack", "toolPackSub", () => this.fileIn.click()),
        tool("screen", "toolPresent", "toolPresentSub", () =>
          this.pickPresent(),
        ),
      ),
    );
  }
  /** The club's own tools: write a club course, adapt the checklists, create a drill, read the results, the pack. */
  private clubToolsBlock(): HTMLElement {
    const tool = (
      icon: keyof typeof ICON,
      title: LibStringKey,
      sub: LibStringKey,
      run: () => void,
    ) =>
      h(
        "button",
        { class: "lb-tool", type: "button", onclick: run },
        h("span", { class: "lb-tool-ic", "aria-hidden": "true" }, ic(icon, 22)),
        h(
          "span",
          { class: "lb-tool-t" },
          h("b", {}, this.s(title)),
          h("small", {}, this.s(sub)),
        ),
      );
    return h(
      "section",
      { class: "lb-tools lb-tools-club", "aria-label": this.s("clubTools") },
      h("p", { class: "lb-cap" }, this.s("clubTools")),
      h(
        "div",
        { class: "lb-tools-l" },
        tool("edit", "clubLists", "clubListsSub", () =>
          this.openClubTool("library"),
        ),
        tool("bolt", "clubDrill", "clubDrillSub", () =>
          this.openClubTool("drills"),
        ),
        tool("chart", "clubResults", "clubResultsSub", () =>
          this.openClubTool("results"),
        ),
        tool("pack", "clubPack", "clubPackSub", () =>
          this.openClubTool("pack"),
        ),
      ),
    );
  }
  /** Club courses before the first one: how to make one, not a dash. */
  private clubCoursesEmpty(): HTMLElement {
    const d = subjectDef("club.courses");
    return h(
      "section",
      { class: "lb-subj is-empty", "data-subject": d.id },
      h(
        "div",
        { class: "lb-subj-h" },
        h(
          "h2",
          {},
          h("span", { class: "lb-subj-n num" }, d.n),
          this.L(d.title),
        ),
      ),
      h(
        "div",
        { class: "lb-drafts-empty" },
        h(
          "p",
          {},
          h("b", {}, this.s("clubCoursesEmpty")),
          " ",
          this.s("clubCoursesEmptyBody"),
        ),
        h(
          "div",
          { class: "lb-drafts-acts" },
          h(
            "button",
            {
              class: "gl-btn",
              type: "button",
              onclick: () => this.fileIn.click(),
            },
            ic("upload", 18),
            this.s("clubImport"),
          ),
          h(
            "button",
            {
              class: "gl-primary sm",
              type: "button",
              onclick: () => this.newCourse("club.courses"),
            },
            ic("plus", 18),
            this.s("clubNew"),
          ),
        ),
      ),
    );
  }
  /** My courses and drafts before the first one: one quiet block with the two ways to start. */
  private draftsEmpty(): HTMLElement {
    const d = subjectDef("instructors.mine");
    return h(
      "section",
      { class: "lb-subj is-empty", "data-subject": d.id },
      h(
        "div",
        { class: "lb-subj-h" },
        h(
          "h2",
          {},
          h("span", { class: "lb-subj-n num" }, d.n),
          this.L(d.title),
        ),
      ),
      h(
        "div",
        { class: "lb-drafts-empty" },
        h(
          "p",
          {},
          h("b", {}, this.s("draftsEmpty")),
          " ",
          this.s("draftsEmptyBody"),
        ),
        h(
          "div",
          { class: "lb-drafts-acts" },
          h(
            "button",
            {
              class: "gl-primary sm",
              type: "button",
              onclick: () => this.newCourse(),
            },
            ic("plus", 18),
            this.s("newCourse"),
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- search
  /** Compact rows grouped by home (« IR › Attentes »), in syllabus order; the subjects whose name answers first. */
  private searchBody(): HTMLElement[] {
    const st = this.st;
    const q = st.q.trim();
    const scope = st.p && !st.wide ? st.p : "all";
    const v = searchView(this.items, q, st.kind, scope);
    const top: HTMLElement[] = [];
    if (v.subjects.length)
      top.push(
        h(
          "section",
          { class: "lb-res lb-res-subj", "aria-labelledby": "lb-res-subj" },
          h(
            "h2",
            { class: "lb-res-h", id: "lb-res-subj" },
            h(
              "span",
              {},
              this.s(v.subjects.length === 1 ? "hitSubject" : "hitSubjects"),
            ),
          ),
          h(
            "ul",
            { class: "lb-subj-hits" },
            ...v.subjects.slice(0, 8).map((x) => this.subjectHit(x)),
          ),
        ),
      );
    if (v.soon.length)
      top.push(
        h(
          "section",
          { class: "lb-res lb-res-soon", "aria-labelledby": "lb-res-soon" },
          h(
            "h2",
            { class: "lb-res-h", id: "lb-res-soon" },
            h("span", {}, this.s("hitSoon")),
          ),
          h(
            "ul",
            { class: "lb-rows" },
            ...v.soon.map((x) => this.soonItem(x)),
          ),
        ),
      );
    if (!v.total && !top.length) {
      // « Aucun résultat pour « x ». Essayez « attente » ou « VOR », ou parcourez LAPL · PPL. »
      const words =
        this.lang === "fr" ? ["attente", "VOR"] : ["holding", "VOR"];
      const w = (x: string) =>
        h(
          "button",
          { class: "lb-try-b", type: "button", onclick: () => this.searchFor(x) },
          x,
        );
      const near = this.nearSubjects(q, scope);
      return [
        h(
          "div",
          { class: "lb-empty lb-empty-q" },
          h(
            "p",
            { class: "lb-try" },
            `${this.s("noHitsTry")} `,
            w(words[0]),
            ` ${this.s("or")} `,
            w(words[1]),
            `, ${this.s("orBrowse")} `,
            h(
              "button",
              {
                class: "lb-link b",
                type: "button",
                onclick: () => this.showProgram("ppl"),
              },
              this.L(programDef("ppl").code),
            ),
            ".",
          ),
          near.length
            ? h(
                "div",
                { class: "lb-near" },
                h("p", { class: "lb-mute" }, this.s("suggest")),
                h(
                  "ul",
                  { class: "lb-subj-hits" },
                  ...near.map((x) => this.subjectHit(x)),
                ),
              )
            : null,
        ),
      ];
    }
    return [...top, ...this.resGroups(v.groups)];
  }
  /** Every flight of the simulator, grouped by home in shelf and syllabus order ("IR › Holding · 10"). */
  private flightsBody(): HTMLElement[] {
    return this.resGroups(searchView(this.items, "", "sim", "all").groups);
  }
  private resGroups(
    groups: ReturnType<typeof searchView>["groups"],
  ): HTMLElement[] {
    return groups.map((g) => {
      const id = `lb-r-${g.subject.id}`;
      return h(
        "section",
        { class: "lb-res", "aria-labelledby": id },
        h(
          "h2",
          { class: "lb-res-h", id },
          h(
            "button",
            {
              class: "lb-res-p",
              type: "button",
              onclick: () => this.showProgram(g.subject.program, g.subject.id),
            },
            `${this.L(programDef(g.subject.program).code)} › ${this.L(g.subject.title)}`,
          ),
          h("span", { class: "lb-res-n num" }, String(g.items.length)),
        ),
        this.rows(g.items, "search"),
      );
    });
  }
  /** A planned course in search results: visible, not openable (« Bientôt »). */
  private soonItem(x: PlannedItem): HTMLElement {
    return h(
      "li",
      { class: "lb-row is-soon", "data-plan": x.id },
      h(
        "span",
        { class: "lb-row-ic k-course", "aria-hidden": "true" },
        ic("slides", 18),
      ),
      h(
        "span",
        { class: "lb-row-t" },
        h("b", {}, this.L(x.title)),
        h(
          "small",
          {},
          `${this.homeLabel(x.home)} · ${this.s("soonWord")}`,
        ),
      ),
    );
  }
  /** One subject as a search hit: "LAPL · PPL › 01 Air law" and its count (or « bientôt »). */
  private subjectHit(x: ShelfSubject): HTMLElement {
    const d = x.subject;
    return h(
      "li",
      {},
      h(
        "button",
        {
          class: "lb-subj-hit",
          type: "button",
          onclick: () => this.showProgram(d.program, d.id),
        },
        h("span", { class: "lb-subj-hit-k" }, this.s("hitSubject")),
        h(
          "span",
          { class: "lb-subj-hit-t" },
          `${this.L(programDef(d.program).code)} › `,
          h("span", { class: "num" }, `${d.n} `),
          h("b", {}, this.L(d.title)),
        ),
        this.countEl(x, "lb-subj-hit-c"),
        ic("arrow", 16),
      ),
    );
  }
  /** The subjects nearest to a search that found nothing: a word's first letters in a subject's names. */
  private nearSubjects(q: string, scope: ProgramId | "all"): ShelfSubject[] {
    const stems = q
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4)
      .map((w) => w.slice(0, 4));
    if (!stems.length) return [];
    const all = shelves(this.items).flatMap((sh) =>
      sh.groups.flatMap((g) => g.subjects),
    );
    return all
      .filter((x) => scope === "all" || x.subject.program === scope)
      .map((x) => {
        const t =
          `${x.subject.title.en} ${x.subject.title.fr ?? ""} ${(x.subject.words ?? []).join(" ")}`
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
        return { x, n: stems.filter((w) => t.includes(w)).length };
      })
      .filter((r) => r.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 3)
      .map((r) => r.x);
  }

  // ---------------------------------------------------------------- the Flight Center's entry
  private entryView(): HTMLElement[] {
    const out: HTMLElement[] = [];
    const cont = continueItems(this.items, 4);
    if (cont.length)
      out.push(
        h(
          "section",
          { class: "lb-sec sec-continue" },
          this.secHead(this.s("continue"), this.s("continueSub")),
          this.grid(cont, "continue", Math.min(4, Math.max(2, this.cols))),
        ),
      );
    const open = () => this.o.entry?.openLibrary();
    out.push(
      h(
        "section",
        { class: "lb-sec sec-entry" },
        this.secHead(
          this.s("fcLibrary"),
          this.s("fcLibrarySub"),
          h(
            "button",
            { class: "lb-link lb-sec-go", type: "button", onclick: open },
            this.s("fcOpen"),
            ic("arrow", 16),
          ),
        ),
        h(
          "ul",
          { class: "lb-tiles" },
          ...shelves(this.items).map((sh) => {
            const d = programDef(sh.program);
            const fi = sh.program === "instructors" && !sh.total;
            return h(
              "li",
              { class: "lb-tile-li" },
              h(
              "button",
              {
                class: `lb-tile prog-${sh.program}`,
                type: "button",
                onclick: () => this.o.entry?.openLibrary(sh.program),
              },
              h("b", {}, this.L(d.code)),
              h("span", { class: "lb-tile-t" }, this.L(d.title)),
              h(
                "span",
                { class: "lb-tile-n" },
                fi
                  ? this.s("toolsN", { n: 4 })
                  : ltN("item1", "items", sh.total, this.lang),
                sh.done ? this.bar(sh.done, sh.total) : null,
              ),
              ),
            );
          }),
        ),
      ),
    );
    return out;
  }

  // ---------------------------------------------------------------- cards and rows
  /** One line: what you will be able to do (the item's own, else the kind's). */
  private purpose(i: LibItem): string {
    if (i.blurb) return this.L(i.blurb);
    switch (i.sub) {
      case "lesson":
        return this.s(i.deck ? "pLessonBrief" : "pLesson");
      case "drill":
        return this.s("pDrill");
      case "circuit":
        return this.s("pCircuit");
      case "scenario":
        return this.s("pScenario");
      case "course":
        return this.s("pCourse");
      default:
        return i.eyebrow ? this.L(i.eyebrow) : "";
    }
  }
  private sizeLine(i: LibItem): string {
    const l = this.lang;
    const parts: string[] = [];
    if (i.minutes) parts.push(this.s("min", { n: i.minutes }));
    if (i.count)
      parts.push(
        i.count.unit === "steps"
          ? ltN("step1", "steps", i.count.n, l)
          : this.s("itemsN", { n: i.count.n }),
      );
    if (i.kind === "course" && i.source === "mine") {
      const e = this.entries.find((x) => x.id === i.open.id);
      parts.push(
        e ? this.t("editedAgo", { ago: agoText(e.updated, l) }) : this.s("you"),
      );
    } else if (i.source === "club") parts.push(this.s("club"));
    return parts.join(" · ");
  }
  private progressEl(i: LibItem): HTMLElement | null {
    const p = i.progress;
    if (i.assigned && !isDone(i))
      return h(
        "p",
        { class: "lb-prog-l asg" },
        h("i", { class: "lb-dotc", "aria-hidden": "true" }),
        this.s("assignedTag"),
      );
    if (!p) return null;
    if (i.kind === "course") {
      if (p.done >= p.total)
        return h(
          "p",
          { class: "lb-prog-l ok" },
          ic("check", 14),
          ltN("step1", "steps", p.total, this.lang).replace(
            String(p.total),
            `${p.total}/${p.total}`,
          ),
        );
      if (p.done > 0)
        return h(
          "p",
          { class: "lb-prog-l" },
          this.bar(p.done, p.total),
          h("span", { class: "num" }, `${p.done}/${p.total}`),
        );
      return null;
    }
    if (p.passed)
      return h(
        "p",
        { class: "lb-prog-l ok" },
        ic("check", 14),
        this.s("passedPct", { n: Math.round(p.best ?? 0) }),
      );
    if (p.attempts)
      return h(
        "p",
        { class: "lb-prog-l" },
        this.s("triesBest", {
          a: ltN("attempt1", "attemptsN", p.attempts, this.lang),
          n: Math.round(p.best ?? 0),
        }),
      );
    return null;
  }
  private levelEl(i: LibItem): HTMLElement {
    const label = this.L(levelTitle(i.level));
    return h(
      "span",
      { class: "lb-lvw", title: label },
      levelGlyph(i.level),
      h("span", {}, label),
    );
  }
  private moreBtn(i: LibItem): HTMLElement | null {
    if (i.kind !== "course") return null;
    const b = h(
      "button",
      {
        class: "gl-more lb-more",
        type: "button",
        "aria-label": this.s("more", { t: this.L(i.title) }),
        "aria-haspopup": "menu",
        onclick: (ev: Event) => {
          ev.stopPropagation();
          const e = this.entries.find((x) => x.id === i.open.id);
          if (e) this.openMenu(e, b);
        },
      },
      ic("more", 20),
    );
    return b;
  }
  /** An item lent by another formation: the footer says where it comes from, in words. */
  private lentFrom(i: LibItem): string {
    const p = this.st.p;
    if (!p || programOf(i) === p) return "";
    const d = subjectDef(i.home);
    return `${this.s("fromProgram", { p: this.L(programDef(d.program).code) })} › ${this.L(d.title)}`;
  }
  /** A checklist's cover: amber paper with its first lines. */
  private checkCover(i: LibItem): HTMLElement {
    const lines = (i.lines ?? []).slice(0, 4);
    return h(
      "div",
      { class: "lb-chk" },
      i.eyebrow ? h("span", { class: "lb-chk-k" }, this.L(i.eyebrow)) : null,
      h("b", { class: "lb-chk-t" }, this.L(i.title)),
      h(
        "ol",
        { class: "lb-chk-l" },
        ...lines.map((x) =>
          h("li", { class: x.memory ? "mem" : "" }, splitItem(x.text).c),
        ),
      ),
    );
  }
  private card(i: LibItem, ctx: CardCtx): HTMLElement {
    const cover = h("div", {
      class: `lb-cover cov-${i.kind}`,
      "aria-hidden": "true",
    });
    cover.dataset.key = i.key;
    const lent = ctx === "subject" ? this.lentFrom(i) : "";
    if (i.kind === "course") this.observeCover(cover);
    else if (i.kind === "proc") cover.append(this.checkCover(i));
    // a lent lesson's rank belongs to its own formation: its cover shows the instrument only
    else
      cover.append(
        simCover(i, this.lang, lent ? null : lessonRank(this.items, i)),
      );
    if (i.sub === "lesson" && i.deck)
      cover.append(h("span", { class: "lb-flag" }, this.s("briefingFlight")));
    else if (i.draft && !i.assigned)
      cover.append(h("span", { class: "lb-flag" }, this.s("draftTag")));
    const purpose = this.purpose(i);
    return h(
      "li",
      {
        class: `lb-card k-${i.kind} s-${i.sub}${lent ? " is-lent" : ""}`,
        "data-key": i.key,
      },
      h("button", {
        class: "lb-hit",
        type: "button",
        "aria-label": `${this.L(SUB_LABEL[i.sub])} · ${this.L(i.title)}${lent ? ` · ${lent}` : ""}`,
        onclick: () => this.openItem(i),
      }),
      cover,
      h(
        "div",
        { class: "lb-card-b" },
        h(
          "div",
          { class: "lb-card-k" },
          h("span", { class: `lb-kind k-${i.kind}` }, this.L(SUB_LABEL[i.sub])),
          this.moreBtn(i),
        ),
        h("h3", { class: "lb-card-t" }, this.L(i.title)),
        purpose ? h("p", { class: "lb-card-p" }, purpose) : null,
        ctx === "continue" || ctx === "search"
          ? h("p", { class: "lb-card-home" }, this.homeLabel(i.home))
          : null,
        h(
          "div",
          { class: "lb-card-m" },
          h("span", { class: "num" }, this.sizeLine(i)),
          this.levelEl(i),
        ),
        this.progressEl(i),
      ),
      lent ? h("p", { class: "lb-card-f" }, lent) : null,
    );
  }
  private row(i: LibItem, ctx: CardCtx): HTMLElement {
    const lent = ctx === "subject" ? this.lentFrom(i) : "";
    const meta = [
      this.L(SUB_LABEL[i.sub]),
      ctx === "ref" ? this.homeLabel(i.home) : this.sizeLine(i),
      i.sub === "scenario" && i.eyebrow ? this.L(i.eyebrow) : "",
    ].filter(Boolean);
    const p = this.progressEl(i);
    return h(
      "li",
      {
        class: `lb-row k-${i.kind} s-${i.sub}`,
        "data-key": i.key,
      },
      h("button", {
        class: "lb-hit",
        type: "button",
        "aria-label": `${this.L(SUB_LABEL[i.sub])} · ${this.L(i.title)}`,
        onclick: () => this.openItem(i),
      }),
      h(
        "span",
        { class: `lb-row-ic k-${i.kind}`, "aria-hidden": "true" },
        ic(
          i.kind === "proc" ? "list" : i.kind === "course" ? "slides" : "plane",
          18,
        ),
      ),
      h(
        "span",
        { class: "lb-row-t" },
        h("b", {}, this.L(i.title)),
        h("small", {}, meta.join(" · ")),
        lent ? h("small", { class: "lb-row-from" }, lent) : null,
        p,
      ),
      h(
        "span",
        { class: "lb-row-go", "aria-hidden": "true" },
        i.kind === "proc"
          ? this.s("open")
          : i.kind === "course"
            ? this.s("open")
            : this.s("fly"),
      ),
    );
  }
  // ---------------------------------------------------------------- covers (lazy for slides)
  private observeCover(el: HTMLElement) {
    if (this.io) this.io.observe(el);
    else void this.drawCover(el);
  }
  private async drawCover(el: HTMLElement) {
    this.io?.unobserve(el);
    if (this.thumbs.has(el) || el.dataset.drawn) return;
    el.dataset.drawn = "1";
    const i = this.items.find((x) => x.key === el.dataset.key);
    if (!i) return;
    let pick: CoverSlide | null = null;
    try {
      const c = this.entries.find((x) => x.id === i.deck)?.course;
      pick = c ? courseCover(c) : null;
    } catch {
      pick = null;
    }
    if (!pick) {
      el.classList.add("no-slide");
      el.prepend(
        h("div", { class: "lb-noslide" }, h("b", {}, this.L(i.title))),
      );
      return;
    }
    try {
      const { renderThumb } = await import("../canvas/render");
      if (this.destroyed || !el.isConnected) return;
      const host = h("div", { class: "gl-thumb-slide" });
      const place = () => {
        const r = thumbPlacement(el.clientWidth || 320, el.clientHeight || 180);
        host.style.cssText = `width:${r.w}px;height:${r.h}px;left:${r.x}px;top:${r.y}px`;
      };
      place();
      el.prepend(host);
      const store = this.store;
      const v = renderThumb(pick.slide, host, {
        lang: this.lang,
        theme: pick.theme,
        brand: pick.brand,
        scenes: pick.scenes,
        cockpit: pick.cockpit,
        step: pick.step,
        assetUrl: (id) =>
          plateUrl(id) ??
          (store
            ? store
                .getAsset(id)
                .then((b) => (b ? URL.createObjectURL(b) : null))
            : Promise.resolve(null)),
      });
      let ro: ResizeObserver | null = null;
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(place);
        ro.observe(el);
      }
      this.thumbs.set(el, { destroy: () => (ro?.disconnect(), v.destroy()) });
    } catch {
      el.classList.add("no-slide");
    }
  }

  // ---------------------------------------------------------------- opening
  private openItem(i: LibItem) {
    const t = i.open;
    if (t.k === "course") {
      const e = this.entries.find((x) => x.id === t.id);
      if (e) return this.play(e, t.stepId);
      return this.go({ k: "play", id: t.id });
    }
    if (t.k === "procedure") return this.openProcedure(t.id);
    if (this.o.openSim?.(t)) return;
    const sim = this.o.simPage ?? "index.html";
    const e = encodeURIComponent;
    const url =
      t.k === "lesson"
        ? `${sim}?lesson=${e(t.id)}`
        : t.k === "drill"
          ? `${sim}?drill=${e(t.id)}`
          : `${sim}?flight=${e(t.id)}`;
    location.assign(url);
  }
  private openProcedure(id: string) {
    const m = this.procMod;
    const p = m?.get(id) ?? this.procedures.find((x) => x.id === id) ?? null;
    if (!p || !m) return;
    const l = this.lang;
    const base = procBase(p);
    const drill = Object.entries(DRILL_META).find(([, d]) =>
      d.trains.includes(base),
    )?.[0];
    const actions: {
      label: string;
      danger?: boolean;
      run: () => void | Promise<void>;
    }[] = [];
    if (this.o.editProcedure)
      actions.push({
        label: p.source === "club" ? this.s("editClub") : this.s("customise"),
        run: () => this.o.editProcedure!(p.id),
      });
    if (drill)
      actions.push({
        label: this.s("drillIt"),
        run: () => {
          const it = this.items.find((x) => x.key === `drill:${drill}`);
          if (it) this.openItem(it);
        },
      });
    this.showDialog(
      p.title,
      procedureSheet(p, l, {
        category: m.cats[p.category]?.[l],
        ...(p.source === "library" ? { disclaimer: m.disclaimer[l] } : {}),
      }),
      actions,
      "lb-proc-dialog",
    );
  }

  // ---------------------------------------------------------------- course actions
  private go(a: LibraryAction) {
    // a course says where it was opened from: its way back returns to this formation page, or the library
    const r: AcademyRoute =
      a.k === "play"
        ? {
            k: "play",
            id: a.id,
            ...(a.stepId ? { s: a.stepId } : {}),
            from: this.st.p && !this.st.flights ? this.st.p : "lib",
          }
        : a.k === "new"
          ? {
              k: "new",
              ...(a.p ? { p: a.p } : {}),
              ...(a.p && a.s ? { s: a.s } : {}),
              from: this.st.p && !this.st.flights ? this.st.p : "lib",
            }
          : { k: a.k, id: a.id };
    const url = academyHref(r, this.o.page ?? "academy.html");
    if (this.o.navigate) this.o.navigate(url, a);
    else location.assign(url);
  }
  private play(e: LibraryEntry, stepId?: string) {
    this.go({ k: "play", id: e.id, ...(stepId ? { stepId } : {}) });
  }
  private async edit(e: LibraryEntry) {
    if (!e.sample) return this.go({ k: "edit", id: e.id });
    const copy = await this.duplicate(e, false);
    if (copy) this.go({ k: "edit", id: copy });
  }
  /** Duplicate a course into the store; returns the new id. */
  private async duplicate(
    e: LibraryEntry,
    announce = true,
  ): Promise<string | null> {
    const s = this.store;
    const src = e.course ?? (e.sample ? sampleCourse(e.id) : null);
    if (!s || !src) return null;
    const title: L10n = { ...src.title };
    // the copy keeps the home it had (its programme and its subject)
    const place = coursePlacement(
      e,
      (id) => SAMPLES.find((x) => x.id === id)?.program,
    );
    const prog = courseProgramOf(subjectDef(place.home).program);
    const r = await s.duplicate(
      {
        ...src,
        ...(src.subject || place.home === "instructors.mine"
          ? {}
          : { subject: place.home }),
        ...(src.program || !prog || place.home === "instructors.mine"
          ? {}
          : { program: prog }),
        ...(src.level ? {} : { level: place.level }),
      },
      { title, ...(e.sample ? { sample: e.id } : {}) },
    );
    if (!r.ok) {
      this.toast(loc(r.message, this.lang));
      return null;
    }
    markImported([r.course.id], false);
    if (announce)
      this.toast(this.t("duplicated", { t: loc(r.course.title, this.lang) }));
    await this.load();
    return r.course.id;
  }
  private async exportEntry(e: LibraryEntry) {
    try {
      const pack = await import("../pack");
      let blob: Blob;
      let filename: string;
      if (!e.sample && this.store) {
        const r = await pack.exportCourse(this.store, e.id);
        if (!r) throw new Error(this.t("notFound"));
        ({ blob, filename } = r);
      } else {
        const c = e.course ?? sampleCourse(e.id);
        if (!c) throw new Error(this.t("notFound"));
        const { file } = await pack.buildCourseFile(c, async () => null);
        blob = await pack.encodeCourseFile(file);
        filename = pack.courseFileName(c);
      }
      download(blob, filename);
      this.toast(this.t("exported", { file: filename }));
      if (!e.sample) await this.load();
    } catch (err) {
      this.toast(
        this.t("exportFailed", { msg: (err as Error)?.message ?? String(err) }),
      );
    }
  }
  private async shareLink(e: LibraryEntry) {
    const c = e.course ?? sampleCourse(e.id);
    if (!c) return;
    const pack = await import("../pack");
    const r = await pack.encodeCourseShare(c);
    if (!r.fits)
      return this.toast(
        r.reason === "images" ? this.t("linkImages") : this.t("linkTooBig"),
      );
    const url = new URL(
      pack.courseShareLink(r.code, this.o.page ?? "academy.html"),
      location.href,
    ).href;
    try {
      await navigator.clipboard.writeText(url);
      this.toast(this.t("linkCopied"));
    } catch {
      this.showDialog(
        this.t("shareLink"),
        h("input", {
          class: "gl-copy",
          value: url,
          readonly: true,
          onfocus: (ev: Event) => (ev.target as HTMLInputElement).select(),
        }),
        [],
      );
    }
  }
  private confirmDelete(e: LibraryEntry) {
    const s = this.store;
    if (!s) return;
    this.showDialog(
      this.t("deleteTitle", { t: loc(e.title, this.lang) }),
      h("p", {}, this.t("deleteBody")),
      [
        {
          label: this.t("deleteYes"),
          danger: true,
          run: async () => {
            await s.delete(e.id);
            markImported([e.id], false);
            this.toast(this.t("deleted"));
            await this.load();
          },
        },
      ],
    );
  }
  /** File one of my courses: ONE programme, then ONE of its subjects (its home), and a level. */
  private fileCourse(e: LibraryEntry) {
    const s = this.store;
    const c = e.course;
    if (!s || !c || e.sample) return;
    const l = this.lang;
    const cur = coursePlacement(e);
    const curP = subjectDef(cur.home).program;
    let prog: ProgramId | null = cur.home === "instructors.mine" ? null : curP;
    let subj: SubjectId | null = prog ? cur.home : null;
    let level: Level = cur.level;
    const subjSel = h("select", {
      "aria-label": this.s("fileSubject"),
      onchange: () => {
        const v = subjSel.value;
        subj = isSubjectId(v) ? v : null;
      },
    }) as HTMLSelectElement;
    const fillSubjects = () => {
      subjSel.replaceChildren(
        ...(prog ? subjectsOf(prog) : []).map((x) =>
          h(
            "option",
            { value: x.id, selected: x.id === subj },
            `${x.n} · ${loc(x.title, l)}`,
          ),
        ),
      );
      subjSel.disabled = !prog;
      if (prog && (!subj || subjectDef(subj).program !== prog)) {
        subj = subjectsOf(prog)[0].id;
        subjSel.value = subj;
      }
    };
    const radios = h(
      "div",
      {
        class: "lb-file-progs",
        role: "radiogroup",
        "aria-label": this.s("fileProgram"),
      },
      ...[null, ...SHELF_IDS.filter((p) => p !== "instructors")].map((p) => {
        const b = h("input", {
          type: "radio",
          name: "lb-file-p",
          checked: p === prog,
          onchange: () => {
            if (!b.checked) return;
            prog = p;
            subj = null;
            fillSubjects();
          },
        }) as HTMLInputElement;
        return h(
          "label",
          { class: "lb-file-p" },
          b,
          p
            ? [
                h("span", { class: "lb-code" }, loc(programDef(p).code, l)),
                h("span", {}, loc(programDef(p).title, l)),
              ]
            : h("span", {}, this.s("fileNone")),
        );
      }),
    );
    fillSubjects();
    const lv = h(
      "div",
      {
        class: "gl-seg lb-file-lv",
        role: "group",
        "aria-label": this.s("level"),
      },
      ...LEVELS.map((x) =>
        h(
          "button",
          {
            class: `gl-seg-b${x.id === level ? " on" : ""}`,
            type: "button",
            "aria-pressed": x.id === level ? "true" : "false",
            onclick: () => {
              level = x.id;
              lv.querySelectorAll("button").forEach((y, k) => {
                y.classList.toggle("on", k + 1 === level);
                y.setAttribute(
                  "aria-pressed",
                  k + 1 === level ? "true" : "false",
                );
              });
            },
          },
          loc(x.title, l),
        ),
      ),
    );
    this.showDialog(
      this.s("fileTitle", { t: loc(e.title, l) }),
      h(
        "div",
        { class: "lb-file" },
        h("p", {}, this.s("fileBody")),
        h("p", { class: "lb-file-h" }, this.s("fileProgram")),
        radios,
        h("p", { class: "lb-file-h" }, this.s("fileSubject")),
        h("label", { class: "lb-select" }, subjSel),
        h("p", { class: "lb-file-h" }, this.s("level")),
        lv,
      ),
      [
        {
          label: this.s("fileSave"),
          run: async () => {
            const next: Course = { ...c, level };
            const cp = prog ? courseProgramOf(prog) : null;
            if (cp && subj) {
              next.program = cp;
              next.subject = subj;
            } else {
              delete next.program;
              delete next.subject;
            }
            const r = await s.save(next);
            if (!r.ok) return this.toast(loc(r.message, l));
            this.toast(
              cp && subj
                ? this.s("filed", { p: this.homeLabel(subj) })
                : this.s("unfiled"),
            );
            await this.load();
          },
        },
      ],
    );
  }
  /** « Nouveau cours » / « Créer un cours ici »: the Nouveau cours page (#new), with the formation and the subject
   *  in view prefilled. Nothing is saved before its « Créer le cours ». */
  private newCourse(at?: SubjectId) {
    const p = at ? subjectDef(at).program : this.st.p;
    const subj =
      at ?? (p && p !== "instructors" && p !== "discover" ? (this.st.s ?? null) : null);
    this.go({
      k: "new",
      ...(p && p !== "instructors" && p !== "discover" ? { p } : {}),
      ...(subj ? { s: subj } : {}),
    });
  }
  private async importFiles() {
    const s = this.store;
    const files = [...(this.fileIn.files ?? [])];
    this.fileIn.value = "";
    if (!s || !files.length) return;
    this.toast(this.t("importing"));
    try {
      const { importCourseBlob } = await import("../pack");
      const added: string[] = [];
      const replaced: string[] = [];
      let skipped = 0;
      const issues: string[] = [];
      for (const f of files) {
        const rep = await importCourseBlob(s, f, "newer", { lang: this.lang });
        added.push(...rep.added, ...rep.renamed.map((r) => r.to));
        replaced.push(...rep.replaced);
        skipped += rep.skipped.length;
        issues.push(
          ...rep.issues,
          ...rep.skipped.map((x) => `${x.id}: ${x.reason}`),
        );
      }
      markImported([...added, ...replaced]);
      await this.load();
      const parts = [
        added.length ? this.t("importAdded", { n: added.length }) : "",
        replaced.length ? this.t("importReplaced", { n: replaced.length }) : "",
        skipped ? this.t("importSkipped", { n: skipped }) : "",
      ].filter(Boolean);
      if (!added.length && !replaced.length) {
        this.showDialog(
          this.t("importNothing"),
          issues.length
            ? h(
                "ul",
                { class: "gl-issues" },
                ...issues.slice(0, 8).map((i) => h("li", {}, i)),
              )
            : null,
          [],
        );
        return;
      }
      this.toast(`${this.t("importDone")}: ${parts.join(" · ")}`);
    } catch (err) {
      this.toast(
        this.t("importFailed", { msg: (err as Error)?.message ?? String(err) }),
      );
    }
  }
  private pickPdf() {
    if (!this.o.importPdf) {
      this.showDialog(
        this.t("importSlides"),
        h("p", {}, this.t("pdfSoon")),
        [],
      );
      return;
    }
    this.pdfIn.click();
  }
  private async importPdfFile() {
    const f = this.pdfIn.files?.[0];
    this.pdfIn.value = "";
    const s = this.store;
    if (!f || !s || !this.o.importPdf) return;
    this.toast(this.t("importing"));
    try {
      const r = await this.o.importPdf(s, f, this.lang);
      await this.load();
      if (r) this.go({ k: "edit", id: r.id });
    } catch (err) {
      this.toast(
        this.t("importFailed", { msg: (err as Error)?.message ?? String(err) }),
      );
    }
  }
  private pickPresent() {
    const l = this.lang;
    const list = h(
      "div",
      { class: "gl-pick" },
      ...this.items
        .filter((i) => i.kind === "course")
        .map((i) => {
          const id = i.open.id;
          return h(
            "button",
            {
              class: "gl-pick-row",
              type: "button",
              onclick: () => {
                this.closeDialog();
                this.go({ k: "present", id });
              },
            },
            h("b", {}, loc(i.title, l)),
            h(
              "small",
              {},
              [
                this.homeLabel(i.home),
                i.count ? ctSteps(i.count.n, l) : "",
                i.minutes ? this.t("minutes", { n: i.minutes }) : "",
              ]
                .filter(Boolean)
                .join(" · "),
            ),
          );
        }),
    );
    this.showDialog(this.t("pickCourse"), list, []);
  }

  // ---------------------------------------------------------------- menus
  private openMenu(e: LibraryEntry, anchor: HTMLElement) {
    const items: [string, () => void, boolean?][] = [
      [this.t("open"), () => this.play(e, e.progress?.stepId)],
    ];
    if (this.store)
      items.push([
        e.sample ? this.t("duplicateEdit") : this.t("edit"),
        () => void this.edit(e),
      ]);
    if (this.store && !e.sample)
      items.push([this.t("duplicate"), () => void this.duplicate(e)]);
    if (this.store && !e.sample && e.course)
      items.push([this.s("file"), () => this.fileCourse(e)]);
    if (!e.briefing)
      items.push([
        this.t("presentThis"),
        () => this.go({ k: "present", id: e.id }),
      ]);
    items.push([this.t("export"), () => void this.exportEntry(e)]);
    items.push([this.t("shareLink"), () => void this.shareLink(e)]);
    if (this.store && !e.sample) {
      items.push([
        e.assigned ? this.t("unmarkAssigned") : this.t("markAssigned"),
        () => this.store!.setAssigned(e.id, !e.assigned),
      ]);
      items.push([this.t("delete"), () => this.confirmDelete(e), true]);
    }
    this.popMenu(anchor, items);
  }
  private popMenu(
    anchor: HTMLElement,
    items: [string, () => void, boolean?][],
  ) {
    this.closeMenu();
    const menu = h(
      "div",
      { class: "gl-menu", role: "menu" },
      ...items.map(([label, run, danger]) =>
        h(
          "button",
          {
            class: `gl-menu-i${danger ? " danger" : ""}`,
            type: "button",
            role: "menuitem",
            onclick: (ev: Event) => {
              ev.stopPropagation();
              this.closeMenu();
              run();
            },
          },
          label,
        ),
      ),
    );
    this.el.append(menu);
    const r = anchor.getBoundingClientRect();
    const host = this.el.getBoundingClientRect();
    const w = 248;
    const left = Math.max(
      8,
      Math.min(r.right - host.left - w, host.width - w - 8),
    );
    let top = r.bottom - host.top + 6;
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    requestAnimationFrame(() => {
      const mh = menu.offsetHeight;
      if (r.bottom + mh + 12 > window.innerHeight) {
        top = r.top - host.top - mh - 6;
        menu.style.top = `${Math.max(8, top)}px`;
      }
      (menu.querySelector("button") as HTMLButtonElement | null)?.focus();
    });
    this.menuEl = menu;
    const off = (ev: Event) => {
      if (!menu.contains(ev.target as Node)) this.closeMenu();
    };
    window.setTimeout(
      () =>
        document.addEventListener("pointerdown", off, {
          once: true,
          capture: true,
        }),
      0,
    );
    menu.addEventListener("keydown", (ev) => {
      const btns = [...menu.querySelectorAll<HTMLButtonElement>("button")];
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      if (ev.key === "ArrowDown")
        (btns[(i + 1) % btns.length].focus(), ev.preventDefault());
      else if (ev.key === "ArrowUp")
        (btns[(i - 1 + btns.length) % btns.length].focus(),
          ev.preventDefault());
      else if (ev.key === "Escape") {
        ev.stopPropagation();
        this.closeMenu();
        anchor.focus();
      }
    });
  }
  private closeMenu() {
    this.menuEl?.remove();
    this.menuEl = null;
  }

  // ---------------------------------------------------------------- the app's own dialog and toast
  private showDialog(
    title: string,
    body: Node | null,
    actions: {
      label: string;
      danger?: boolean;
      run: () => void | Promise<void>;
    }[],
    cls = "",
  ) {
    this.closeDialog();
    const prev = document.activeElement as HTMLElement | null;
    const close = () => {
      this.closeDialog();
      prev?.focus?.();
    };
    const box = h(
      "div",
      {
        class: `gl-dialog ${cls}`.trim(),
        role: "dialog",
        "aria-modal": "true",
        "aria-label": title,
      },
      h(
        "div",
        { class: "gl-dialog-h" },
        h("h2", {}, title),
        h(
          "button",
          {
            class: "gl-x",
            type: "button",
            "aria-label": this.t("close"),
            onclick: close,
          },
          ic("close", 18),
        ),
      ),
      body ? h("div", { class: "gl-dialog-b" }, body) : null,
      h(
        "div",
        { class: "gl-dialog-f" },
        h(
          "button",
          { class: "gl-btn", type: "button", onclick: close },
          actions.length && !cls ? this.t("cancel") : this.t("close"),
        ),
        ...actions.map((a, k) =>
          h(
            "button",
            {
              class: `${k === actions.length - 1 ? "gl-primary" : "gl-btn"} sm${a.danger ? " danger" : ""}`,
              type: "button",
              onclick: async () => {
                this.closeDialog();
                await a.run();
              },
            },
            a.label,
          ),
        ),
      ),
    );
    const scrim: HTMLDivElement = h("div", { class: "gl-scrim" }, box);
    scrim.addEventListener("click", (ev) => {
      if (ev.target === scrim) close();
    });
    scrim.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        ev.stopPropagation();
        close();
      }
    });
    this.el.append(scrim);
    this.dialogEl = scrim;
    requestAnimationFrame(() =>
      // the main action, never a destructive one (Cancel keeps the focus then)
      (
        (box.querySelector(".gl-dialog-f .gl-primary:not(.danger)") ??
          box.querySelector(".gl-dialog-f .gl-btn")) as HTMLElement | null
      )?.focus(),
    );
  }
  private closeDialog() {
    this.dialogEl?.remove();
    this.dialogEl = null;
  }
  private toast(text: string) {
    this.toastEl.textContent = text;
    this.toastEl.hidden = false;
    this.live.textContent = text;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(
      () => (this.toastEl.hidden = true),
      4200,
    );
  }
  private onKey(e: KeyboardEvent) {
    const typing = (e.target as HTMLElement)?.closest?.(
      "input, textarea, [contenteditable]",
    );
    if (e.key === "/" && !typing) {
      e.preventDefault();
      this.searchIn.focus();
    } else if (
      e.key === "Escape" &&
      document.activeElement === this.searchIn &&
      this.searchIn.value
    ) {
      e.stopPropagation();
      this.clearSearch();
    }
  }
  /** Focus the search field (the Flight Center's "/" shortcut). */
  focusSearch() {
    this.searchIn.focus();
  }
}

/** Where a card is drawn: in its subject (it shows "Also useful in"), in Continue (it shows its home), in search
 *  results (grouped by home already), or as a reference row pointing to its home. */
type CardCtx = "subject" | "continue" | "search" | "ref";
/** A draft the instructor opened and left: no step, the default title, not a sample. */
function isUntouchedDraft(e: CourseIndexEntry): boolean {
  return !e.sample && !e.assigned && e.steps === 0 && e.title.en === "Untitled course" && (e.title.fr ?? "Cours sans titre") === "Cours sans titre";
}
const GROUPS = GROUP_TITLE;

/** A level as three bars (1 getting started · 2 core · 3 advanced); the word beside it is its label. */
function levelGlyph(lv: Level): HTMLElement {
  return h(
    "span",
    { class: `lb-lv lv-${lv}`, "aria-hidden": "true" },
    h("i"),
    h("i"),
    h("i"),
  );
}

/** The library in `host`. */
export function mountLibrary(
  host: HTMLElement,
  o: LibraryOptions,
): CourseLibrary {
  const lib = new CourseLibrary(o);
  host.append(lib.el);
  return lib;
}

// ------------------------------------------------------------------ small helpers
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: filename, style: "display:none" });
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
/** The chip class of a step (kind colour group). */
export function kindClass(s: Step): string {
  if (s.kind === "fly") return "k-fly";
  if (s.kind === "calc" || s.kind === "drill") return "k-calc";
  if (ACT_KINDS.has(s.kind)) return "k-try";
  return "k-explain";
}
const KIND_WORD: Record<string, [string, string]> = {
  page: ["PAGE", "PAGE"],
  explain: ["EXPLAIN", "EXPLICATION"],
  predict: ["PREDICT", "PRÉDIRE"],
  watch: ["WATCH", "REGARDER"],
  try: ["TRY IT", "À VOUS"],
  tap: ["TAP", "TOUCHER"],
  quiz: ["QUIZ", "QUIZ"],
  fly: ["FLY IT", "EN VOL"],
  calc: ["CALC", "CALCUL"],
  drill: ["DRILL", "SÉRIE"],
  slide: ["SLIDE", "DIAPO"],
};
export function kindWord(s: Step, l: Lang): string {
  const w = KIND_WORD[s.kind] ?? [s.kind.toUpperCase(), s.kind.toUpperCase()];
  return l === "fr" ? w[1] : w[0];
}
/** Is this id one of the built-in samples (used by hosts to decide duplicate-before-edit). */
export const isBuiltIn = isSampleId;
