// The library: one place for everything a club or a school teaches and flies (slide courses, sim lessons, failure
// drills, graded routes, free practice, checklists), and ONE way to browse it: programme shelves in training order
// (LAPL · PPL, Vol de nuit, IR, ATPL, Club, Instructeurs), each with its subjects in syllabus order. Every item has
// exactly one home, a subject, where it is drawn and counted. DOM only (h()), no framework; the same component runs
// in academy.html#library and in the Flight Center (index.html), so there is one mental model. The model is
// src/library (pure, tested).
//   landing     header (search, New course), Continue, "Where to start?", then the shelves as a table of contents
//   programme   breadcrumb, title, the one kind filter; a left index of the subjects (a "Contents" select on a
//               narrow screen); one section per subject: courses, sim lessons, failure drills, graded routes, free
//               practice, checklists, then "Also useful here" pointers; empty subjects on one muted line
//   search      results grouped by home ("IR › Holding · 10"), so a search also says where a topic lives
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
  ROW_SUBS,
  SHELF_IDS,
  SUB_LABEL,
  SUB_PLURAL,
  courseProgramOf,
  isProgramId,
  isSubjectId,
  levelTitle,
  programDef,
  subjectDef,
  subjectsOf,
  type GroupId,
  type Level,
  type LibKind,
  type ProgramId,
  type SubjectDef,
  type SubjectId,
} from "../../library/programs";
import {
  continueItems,
  firstIn,
  hasAnything,
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
  type ShelfSubject,
  type SubjectSection,
} from "../../library/model";
import {
  coursePlacement,
  libraryItems,
  procBase,
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
import { lt, ltN, type LibStringKey } from "../../library/strings";
import "../../styles/library.css";
// ------------------------------------------------------------------ routes (academy.html hash)
export type AcademyRoute =
  /** the library, on a programme page (p) at a subject (s) when given */
  | { k: "library"; p?: string; s?: string; v?: "sim" }
  | { k: "play"; id: string; s?: string; a?: string; b?: string }
  | { k: "edit"; id: string; s?: string }
  | { k: "present"; id: string; s?: string }
  | { k: "project"; id: string; s?: string }
  | { k: "share"; code: string };
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
    return { k: "play", id: play, ...opt("s"), ...opt("a"), ...opt("b") };
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
  // every flight of the simulator, shelved by programme and subject (what the Flight Center's "All flights" was)
  if (kv.get("v") === "sim") return { k: "library", v: "sim" };
  const shelf = kv.get("p");
  if (shelf && /^[a-z]{2,12}$/.test(shelf)) {
    const sub = kv.get("s");
    return {
      k: "library",
      p: shelf,
      ...(sub && /^[a-z]{2,12}\.[a-z0-9]{2,8}$/.test(sub) ? { s: sub } : {}),
    };
  }
  return { k: "library" };
}
/** The hash for a route (inverse of academyRoute). */
export function academyHash(r: AcademyRoute): string {
  const e = encodeURIComponent;
  switch (r.k) {
    case "library":
      return r.v === "sim"
        ? "#library&v=sim"
        : `#library${r.p ? `&p=${e(r.p)}` : ""}${r.p && r.s ? `&s=${e(r.s)}` : ""}`;
    case "share":
      return `#c=${r.code}`;
    case "play":
      return `#play=${e(r.id)}${r.s ? `&s=${e(r.s)}` : ""}${r.a ? `&a=${e(r.a)}` : ""}${r.b ? `&b=${e(r.b)}` : ""}`;
    default:
      return `#${r.k}=${e(r.id)}${r.s ? `&s=${e(r.s)}` : ""}`;
  }
}
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
  /** the club's tools (checklists, drills, results, the club pack) live in the Flight Center: the host opens them
   *  (default: the simulator page with ?club=<tab>) */
  openClub?: (tab: ClubTool) => void;
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
  private readonly syncHash: boolean;
  /** a subject to bring into view once the page is drawn (a deep link, a click in the table of contents) */
  private pendingSubject: SubjectId | null = null;
  /** the index follows the reading position, except while a jump scrolls past other subjects */
  private spyMuteUntil = 0;
  /** the subject a jump brought into view: kept there while the data loads, until the reader scrolls */
  private anchor: SubjectId | null = null;
  private readonly onHash = () => this.fromHash();

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
    this.searchIn = h("input", {
      class: "gl-search-in",
      type: "search",
      enterkeyhint: "search",
      autocomplete: "off",
      spellcheck: "false",
      oninput: () => {
        window.clearTimeout(this.searchTimer);
        // a short pause so typing stays smooth with a big library
        this.searchTimer = window.setTimeout(() => {
          this.st = { ...this.st, q: this.searchIn.value };
          if (!this.st.q.trim()) this.st.wide = false;
          this.renderView(false);
        }, 90);
      },
    }) as HTMLInputElement;
    this.searchBox = h(
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
            h("div", { class: "lb-head-acts" }, this.searchBox, this.headX),
          ),
      this.banner,
      this.body,
      this.toastEl,
      this.live,
      this.fileIn,
      this.pdfIn,
    );
    this.el.addEventListener("keydown", (e) => this.onKey(e));
    const release = () => (this.anchor = null);
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
    if (this.o.intent === "new") void this.newCourse();
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
      this.headX
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
    this.el.classList.toggle("is-narrow", w < 1100);
    this.el.classList.toggle("is-phone", w < 640);
    const rail = w >= RAIL_MIN;
    const pad = w < 640 ? 32 : w < 1100 ? 48 : 80;
    const inner = Math.max(
      240,
      w - pad - (this.st.p && rail ? (w < 1300 ? 244 : 300) : 0),
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
      this.scrollTop();
      if (asked) this.pendingSubject = asked;
    }
    this.flushScroll();
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
    const toLanding: [string, () => void] = [
      this.s("library"),
      () => this.showProgram(null),
    ];
    if (q) {
      const v = searchView(this.items, q, st.kind, scope ?? "all");
      // nothing shelved under these words, but a subject (or a planned course) answers: say where it lives
      const subjOnly = !v.total && (v.subjects.length > 0 || v.soon.length > 0);
      const where =
        v.total > 0
          ? this.s("resultsWhere", {
              s: ltN("subject1", "subjectsN", v.groups.length, this.lang),
              p:
                v.programs === 1
                  ? this.s("program1")
                  : this.s("programsN", { n: v.programs }),
            })
          : subjOnly
            ? this.s("subjectOnlyBody")
            : this.s("noResultsBody");
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
                : this.s("noResults", { q }),
        ),
        h(
          "p",
          { class: "lb-lead" },
          where,
          scope
            ? h(
                "button",
                {
                  class: "lb-link lb-widen",
                  type: "button",
                  onclick: () => {
                    this.st = { ...this.st, wide: true };
                    this.renderView(false);
                  },
                },
                ` ${this.s("searchAll")}`,
              )
            : null,
        ),
      );
      this.headX.replaceChildren(this.kindSeg(v.kinds));
      return;
    }
    if (st.flights) {
      const v = searchView(this.items, "", "sim", "all");
      this.headL.replaceChildren(
        this.crumb([toLanding, this.s("flightsTitle")]),
        h("p", { class: "lb-eyebrow" }, this.s("flightsEyebrow")),
        h("h1", { class: "lb-h1" }, this.s("flightsTitle")),
        h("p", { class: "lb-lead" }, this.s("flightsLead")),
        h(
          "p",
          { class: "lb-stats" },
          h("b", { class: "num" }, String(v.total)),
          ` ${this.s("flightsWord")}`,
          h("span", { class: "lb-dot", "aria-hidden": "true" }, "·"),
          h(
            "span",
            { class: "lb-mute" },
            this.s("resultsWhere", {
              s: ltN("subject1", "subjectsN", v.groups.length, this.lang),
              p: this.s("programsN", { n: v.programs }),
            }),
          ),
        ),
      );
      this.headX.replaceChildren();
      return;
    }
    if (st.p) {
      const d = programDef(st.p);
      const v = programView(this.items, st.p);
      // a shelf with nothing of its own yet (Night) says what it borrows, not "0 items"
      const ptr = v.total
        ? 0
        : (shelves(this.items).find((x) => x.program === st.p)?.alsoHere ?? 0);
      this.headL.replaceChildren(
        this.crumb([toLanding, this.L(d.code)]),
        h("p", { class: "lb-eyebrow" }, this.L(d.frame)),
        h(
          "h1",
          { class: "lb-h1" },
          this.L(d.code),
          h("span", { class: "lb-h1-m" }, ` · ${this.L(d.title)}`),
        ),
        h("p", { class: "lb-lead" }, this.L(d.blurb)),
        st.p === "instructors"
          ? ""
          : !v.total && ptr
            ? h(
                "p",
                { class: "lb-stats" },
                this.s("usefulElsewhere", { n: ptr }),
              )
            : h(
                "p",
                { class: "lb-stats" },
                h("b", { class: "num" }, String(v.total)),
                ` ${v.total === 1 ? this.s("itemWord") : this.s("itemsWord")}`,
                v.done ? this.bar(v.done, v.total) : null,
                v.done
                  ? h(
                      "span",
                      {},
                      h("b", { class: "num" }, String(v.done)),
                      ` ${this.s("doneWord")}`,
                    )
                  : null,
              ),
      );
      this.headX.replaceChildren(v.total ? this.kindSeg(v.kinds) : "");
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
          ` · ${n === 1 ? this.s("item1") : this.s("items", { n })}`,
        ),
      ),
      h("h1", { class: "lb-h1" }, this.s("title")),
      h("p", { class: "lb-lead" }, this.s("lead")),
    );
    this.headX.replaceChildren(
      h(
        "button",
        {
          class: "gl-btn lb-head-new",
          type: "button",
          onclick: () => void this.newCourse(),
        },
        ic("plus", 18),
        this.s("newCourse"),
      ),
    );
  }
  private bar(done: number, total: number): HTMLElement {
    return h(
      "span",
      { class: "lb-bar", "aria-hidden": "true" },
      h("i", {
        style: `width:${Math.max(3, Math.round((done / Math.max(1, total)) * 100))}%`,
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
      ...KIND_ORDER.map((k) => seg(k, this.L(KIND_FILTER[k]))),
    );
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
    // when one card of the grid has an "Also useful in" footer, every card keeps the row, so the rows line up
    const foot = ctx === "subject" && items.some((i) => i.also.length);
    return h(
      "div",
      { class: "lb-grid", role: "list", style: `--lb-cols:${cols}` },
      ...items.map((i) => this.card(i, ctx, foot)),
    );
  }
  private rows(items: readonly LibItem[], ctx: CardCtx): HTMLElement {
    return h(
      "div",
      { class: `lb-rows${this.cols >= 3 ? " two" : ""}`, role: "list" },
      ...items.map((i) => this.row(i, ctx)),
    );
  }
  /** Cards for what you study or fly, rows for what you scan. */
  private mixed(items: readonly LibItem[], ctx: CardCtx): HTMLElement[] {
    const cards = items.filter((i) => !ROW_SUBS.has(i.sub));
    const rows = items.filter((i) => ROW_SUBS.has(i.sub));
    return [
      cards.length ? this.grid(cards, ctx) : null,
      rows.length ? this.rows(rows, ctx) : null,
    ].filter((x): x is HTMLElement => !!x);
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
  private landing(): HTMLElement[] {
    const out: HTMLElement[] = [];
    const cont = continueItems(this.items, 4);
    if (cont.length)
      out.push(
        h(
          "section",
          { class: "lb-sec sec-continue" },
          this.secHead(this.s("continue"), this.s("continueSub")),
          this.grid(
            cont,
            "continue",
            Math.min(4, Math.max(this.cols, cont.length > 2 ? 2 : 1)),
          ),
        ),
      );
    out.push(this.where(isNewcomer(this.items)));
    out.push(
      h(
        "section",
        { class: "lb-sec sec-shelves" },
        this.secHead(
          this.s("programs"),
          this.s("programsSub"),
          h(
            "button",
            {
              class: "lb-link lb-sec-go",
              type: "button",
              onclick: () => this.showFlights(),
            },
            this.s("flightsLink", {
              n: this.items.filter((i) => i.kind === "sim").length,
            }),
            ic("arrow", 16),
          ),
        ),
        ...shelves(this.items).map((sh) => this.shelfRow(sh)),
      ),
    );
    return out;
  }
  /** "Where to start?": three routes for a newcomer, one line for a returning user. */
  private where(full: boolean): HTMLElement {
    const l = this.lang;
    if (!full) {
      const link = (k: LibStringKey, run: () => void) =>
        h(
          "button",
          { class: "lb-link", type: "button", onclick: run },
          this.s(k),
        );
      return h(
        "section",
        { class: "lb-where is-short", "aria-label": this.s("where") },
        h("b", {}, this.s("where")),
        link("routePplShort", () => this.showProgram("ppl")),
        h("span", { class: "lb-dot", "aria-hidden": "true" }, "·"),
        link("routeIrShort", () => this.showProgram("ir")),
        h("span", { class: "lb-dot", "aria-hidden": "true" }, "·"),
        link("routeFi", () => this.showProgram("instructors")),
      );
    }
    const free = this.items.find((i) => i.key === "flight:free");
    // the first PPL lesson: the first sim lesson of the flight modules (straight and level), else the first item
    const ppl1 =
      this.items
        .filter((i) => programOf(i) === "ppl" && i.sub === "lesson")
        .sort(
          (a, b) =>
            subjectDef(a.home).n.localeCompare(subjectDef(b.home).n) ||
            a.order - b.order,
        )[0] ?? firstIn(this.items, "ppl");
    const ir1 = firstIn(this.items, "ir.att");
    const pick = (i: LibItem | undefined) =>
      i
        ? [
            h(
              "button",
              {
                class: "lb-link b",
                type: "button",
                onclick: () => this.openItem(i),
              },
              i.sub === "lesson"
                ? `${this.s("lessonN", { n: lessonRank(this.items, i)?.n ?? 1 })} ${this.L(i.title)}`
                : this.L(i.title),
            ),
            i.minutes
              ? h(
                  "span",
                  { class: "lb-mute" },
                  ` · ${this.s("min", { n: i.minutes })}`,
                )
              : null,
          ]
        : [];
    const route = (
      k: LibStringKey,
      p: ProgramId,
      body: LibStringKey,
      first: (HTMLElement | string | null)[],
      act: HTMLElement,
    ) =>
      h(
        "div",
        { class: "lb-route" },
        h("p", { class: "lb-route-k" }, this.s(k)),
        h("h3", {}, this.L(programDef(p).code)),
        h("p", { class: "lb-route-b" }, this.s(body)),
        h("p", { class: "lb-route-f" }, ...first),
        act,
      );
    const go = (
      label: LibStringKey,
      run: () => void,
      primary = false,
      plus = false,
    ) =>
      h(
        "button",
        {
          class: primary ? "gl-primary lb-route-go" : "gl-btn lb-route-go",
          type: "button",
          onclick: run,
        },
        plus ? ic("plus", 18) : null,
        this.s(label),
        plus ? null : ic("arrow", 18),
      );
    return h(
      "section",
      { class: "lb-where", "aria-labelledby": "lb-where-t" },
      this.secHead(this.s("where"), this.s("whereSub")),
      h(
        "div",
        { class: "lb-routes" },
        route(
          "routePpl",
          "ppl",
          "routePplBody",
          [
            h("span", { class: "lb-mute" }, `${this.s("routePplFirst")} `),
            ...pick(ppl1),
          ],
          go("routePplGo", () => this.showProgram("ppl"), true),
        ),
        route(
          "routeIr",
          "ir",
          "routeIrBody",
          [
            h("span", { class: "lb-mute" }, `${this.s("routeIrFirst")} `),
            ...pick(ir1),
          ],
          go("routeIrGo", () => this.showProgram("ir", "ir.att")),
        ),
        route(
          "routeFi",
          "instructors",
          "routeFiBody",
          [
            h("span", { class: "lb-mute" }, `${this.s("routeFiFirst")} `),
            h(
              "button",
              {
                class: "lb-link b",
                type: "button",
                onclick: () => void this.newCourse(),
              },
              this.s("routeFiPdf"),
            ),
          ],
          go("newCourse", () => void this.newCourse(), false, true),
        ),
      ),
      h(
        "p",
        { class: "lb-where-f" },
        `${this.s("newHere")} `,
        h(
          "a",
          {
            class: "lb-link b",
            href: `${this.o.simPage ?? "index.html"}?intro=1`,
          },
          this.s("productDeck"),
        ),
        h("span", { class: "lb-mute" }, ` · ${this.s("min", { n: 1 })}`),
        free
          ? h(
              "span",
              { class: "lb-where-free" },
              h("span", { class: "lb-dot", "aria-hidden": "true" }, "·"),
              h("span", { class: "lb-mute" }, `${this.s("orFree")} `),
              ...pick(free),
            )
          : null,
      ),
    );
    void l;
  }
  /** One shelf: its name and counts on the left, its subjects (the table of contents) on the right. */
  private shelfRow(sh: ReturnType<typeof shelves>[number]): HTMLElement {
    const d = programDef(sh.program);
    const fi = sh.program === "instructors";
    const club = sh.program === "club";
    // only the subjects with something to show; the rest of the syllabus on one muted line per shelf
    const shown = (x: ShelfSubject) =>
      hasAnything(x) ||
      x.subject.id === "instructors.mine" ||
      x.subject.id === "club.courses";
    const rest = sh.groups.flatMap((g) => g.subjects.filter((x) => !shown(x)));
    const groups = sh.groups
      .map((g) => ({ ...g, subjects: g.subjects.filter(shown) }))
      .filter((g) => g.subjects.length);
    const toc = h(
      "div",
      { class: "lb-toc" },
      ...groups.map((g) =>
        h(
          "div",
          { class: "lb-toc-g" },
          g.group && groups.length > 1
            ? h(
                "p",
                { class: "lb-cap" },
                this.L(g.group === "theory" ? GROUPS.theory : GROUPS.flight),
              )
            : null,
          h(
            "div",
            { class: "lb-toc-l" },
            ...g.subjects.map((x) =>
              h(
                "button",
                {
                  class: `lb-toc-s${x.n ? "" : " light"}`,
                  type: "button",
                  onclick: () => this.showProgram(sh.program, x.subject.id),
                },
                h("span", { class: "lb-toc-n num" }, x.subject.n),
                h("span", { class: "lb-toc-t" }, this.L(x.subject.title)),
                x.done
                  ? h(
                      "span",
                      { class: "lb-toc-d num" },
                      ic("check", 14),
                      String(x.done),
                    )
                  : null,
                this.countEl(x, "lb-toc-c"),
              ),
            ),
          ),
        ),
      ),
      rest.length
        ? h(
            "p",
            { class: "lb-toc-rest" },
            h("span", { class: "lb-mute" }, `${this.s("notYet")} `),
            rest.map((x) => this.L(x.subject.title)).join(" · "),
          )
        : null,
      club
        ? h(
            "div",
            { class: "lb-toc-tools" },
            h(
              "button",
              {
                class: "gl-btn sm",
                type: "button",
                onclick: () => void this.newCourse("club.courses"),
              },
              ic("plus", 16),
              this.s("clubNew"),
            ),
            h(
              "button",
              {
                class: "gl-btn sm",
                type: "button",
                onclick: () => this.openClubTool("library"),
              },
              ic("edit", 16),
              this.s("clubLists"),
            ),
            h(
              "button",
              {
                class: "gl-btn sm",
                type: "button",
                onclick: () => this.openClubTool("drills"),
              },
              ic("bolt", 16),
              this.s("clubDrill"),
            ),
            h(
              "button",
              {
                class: "gl-btn sm",
                type: "button",
                onclick: () => this.openClubTool("pack"),
              },
              ic("pack", 16),
              this.s("clubPack"),
            ),
          )
        : null,
      fi
        ? h(
            "div",
            { class: "lb-toc-tools" },
            h(
              "button",
              {
                class: "gl-btn sm",
                type: "button",
                onclick: () => void this.newCourse(),
              },
              ic("plus", 16),
              this.s("toolNew"),
            ),
            h(
              "button",
              {
                class: "gl-btn sm",
                type: "button",
                onclick: () => this.pickPdf(),
              },
              ic("pdf", 16),
              this.s("toolPdf"),
            ),
            h(
              "button",
              {
                class: "gl-btn sm",
                type: "button",
                onclick: () => this.fileIn.click(),
              },
              ic("upload", 16),
              this.s("toolPack"),
            ),
            h(
              "button",
              {
                class: "gl-btn sm",
                type: "button",
                onclick: () => this.pickPresent(),
              },
              ic("screen", 16),
              this.s("toolPresent"),
            ),
          )
        : null,
    );
    return h(
      "article",
      { class: `lb-shelf prog-${sh.program}` },
      h(
        "div",
        { class: "lb-shelf-id" },
        h("h3", {}, this.L(d.code)),
        h("p", { class: "lb-shelf-t" }, this.L(d.title)),
        h("p", { class: "lb-shelf-f" }, this.L(d.frame)),
        h(
          "p",
          { class: "lb-shelf-n" },
          fi && !sh.total
            ? this.s("toolsN", { n: 4 })
            : !sh.total && sh.alsoHere
              ? null
              : [
                  h("b", { class: "num" }, String(sh.total)),
                  ` ${sh.total === 1 ? this.s("itemWord") : this.s("itemsWord")}`,
                ],
          sh.done ? this.bar(sh.done, sh.total) : null,
          sh.done
            ? h(
                "span",
                { class: "lb-mute" },
                ltN("done1", "doneN", sh.done, this.lang),
              )
            : null,
        ),
        sh.alsoHere
          ? h(
              "p",
              { class: "lb-shelf-a" },
              ltN("alsoHere1", "alsoHereN", sh.alsoHere, this.lang),
            )
          : null,
        h(
          "button",
          {
            class: "gl-btn lb-shelf-go",
            type: "button",
            onclick: () => this.showProgram(sh.program),
          },
          this.s("openShelf"),
          ic("arrow", 16),
        ),
      ),
      toc,
    );
  }

  /** A subject's count: its own items; else "→ 6" (useful items shelved elsewhere); else "Soon" (a planned course). */
  private countEl(x: ShelfSubject, cls: string): HTMLElement {
    if (x.n) return h("span", { class: `${cls} num` }, String(x.n));
    if (x.also)
      return h(
        "span",
        {
          class: `${cls} num is-ptr`,
          title: this.s("pointerTip", { n: x.also }),
        },
        `→ ${x.also}`,
      );
    if (x.soon) return h("span", { class: `${cls} is-soon` }, this.s("soon"));
    // the author's and the club's own subjects start empty: they offer to create, not a dash
    if (x.subject.id === "club.courses" || x.subject.id === "instructors.mine")
      return h("span", { class: `${cls} is-ptr` }, `+ ${this.s("create")}`);
    return h("span", { class: `${cls} num` }, "–");
  }
  /** The club's tools, in the Flight Center (checklists, drills, results, the club pack). */
  private openClubTool(tab: ClubTool) {
    if (this.o.openClub) return this.o.openClub(tab);
    location.assign(
      `${this.o.simPage ?? "index.html"}?club=${encodeURIComponent(tab)}`,
    );
  }
  /** The subject number as printed: "01" reads 1 in a rail, but an ATPL subject keeps its three digits (022). */
  private subjNum(d: SubjectDef): string {
    return d.program === "atpl" ? d.n : String(Number(d.n) || d.n);
  }

  // ---------------------------------------------------------------- a programme page
  private programBody(p: ProgramId): HTMLElement {
    const v = programView(this.items, p, this.st.kind);
    const main = h("div", { class: "lb-main" });
    if (p === "instructors") main.append(this.toolsBlock());
    if (p === "club") main.append(this.clubToolsBlock());
    let shown = 0;
    for (const g of v.groups) {
      const secs = g.sections.map((s) => this.subjectSection(s));
      shown += secs.length;
      // Club courses starts empty: it shows how to make one instead of a dash
      if (
        p === "club" &&
        g.empty.some((x) => x.id === "club.courses") &&
        this.st.kind !== "proc" &&
        this.st.kind !== "sim"
      )
        secs.push(this.clubCoursesEmpty());
      // My courses and drafts is always there on the instructors' shelf (it starts empty)
      const empty = g.empty.filter(
        (x) =>
          !(
            (x.id === "instructors.mine" || x.id === "club.courses") &&
            this.st.kind !== "proc" &&
            this.st.kind !== "sim"
          ),
      );
      if (
        p === "instructors" &&
        g.empty.some((x) => x.id === "instructors.mine") &&
        empty.length < g.empty.length
      )
        secs.push(this.draftsEmpty());
      if (!secs.length && !empty.length) continue;
      main.append(
        h(
          "div",
          { class: "lb-group" },
          g.title && v.groups.length > 1
            ? h("p", { class: "lb-cap lb-group-h" }, this.L(g.title))
            : null,
          ...secs,
          empty.length ? this.soonLine(empty) : null,
        ),
      );
    }
    if (!shown && this.st.kind !== "all" && p !== "instructors")
      main.prepend(
        h(
          "div",
          { class: "gl-empty lb-empty" },
          h("b", {}, this.s("nothingKind", { p: this.L(programDef(p).code) })),
          h(
            "button",
            {
              class: "gl-btn",
              type: "button",
              onclick: () => this.setKind("all"),
            },
            this.s("all"),
          ),
        ),
      );
    // the subject in view: the asked one, else the first one with content
    const first =
      v.index.find(hasAnything)?.subject.id ??
      v.index.find((x) => x.n)?.subject.id ??
      null;
    if (!this.st.s || subjectDef(this.st.s).program !== p)
      this.st = { ...this.st, s: first };
    return h(
      "div",
      { class: `lb-prog prog-${p}${this.rail ? " has-rail" : ""}` },
      this.rail ? this.railEl(p, v.index) : this.tocSelect(v.index),
      main,
    );
  }
  private railEl(
    p: ProgramId,
    index: ReturnType<typeof programView>["index"],
  ): HTMLElement {
    // the subjects with something to show; the empty rest is one muted count under them
    const listed = (x: ShelfSubject) =>
      hasAnything(x) ||
      x.subject.id === "instructors.mine" ||
      x.subject.id === "club.courses";
    const rest = index.filter((x) => !listed(x));
    const groups = new Map<string, typeof index>();
    for (const x of index.filter(listed)) {
      const g = x.subject.group ?? "";
      groups.set(g, [...(groups.get(g) ?? []), x]);
    }
    const multi = groups.size > 1;
    return h(
      "aside",
      { class: "lb-rail", "aria-label": this.s("index") },
      h("p", { class: "lb-cap" }, this.s("index")),
      ...[...groups.entries()].map(([g, xs]) =>
        h(
          "div",
          { class: "lb-rail-g" },
          multi && g
            ? h(
                "p",
                { class: "lb-rail-gt" },
                this.L(GROUPS[g as "theory" | "flight"]).split(" · ")[0],
              )
            : null,
          ...xs.map((x) =>
            h(
              "button",
              {
                class: `lb-rail-s${x.n ? "" : " light"}${x.subject.id === this.st.s ? " on" : ""}`,
                type: "button",
                "data-subject": x.subject.id,
                onclick: () => this.scrollToSubject(x.subject.id),
              },
              h("span", { class: "lb-rail-n num" }, this.subjNum(x.subject)),
              h("span", { class: "lb-rail-t" }, this.L(x.subject.title)),
              x.done
                ? h(
                    "span",
                    { class: "lb-rail-d num" },
                    ic("check", 13),
                    String(x.done),
                  )
                : null,
              this.countEl(x, "lb-rail-c"),
            ),
          ),
        ),
      ),
      rest.length
        ? h(
            "p",
            {
              class: "lb-rail-rest",
              title: rest.map((x) => this.L(x.subject.title)).join(" · "),
            },
            ltN("emptyRail1", "emptyRailN", rest.length, this.lang),
          )
        : null,
      h("p", { class: "lb-cap lb-rail-o" }, this.s("otherPrograms")),
      ...SHELF_IDS.filter((x) => x !== p).map((x) => {
        const n = this.items.filter((i) => programOf(i) === x).length;
        const ptr = n
          ? 0
          : this.items.filter(
              (i) =>
                programOf(i) !== x &&
                i.also.some((a) => subjectDef(a).program === x),
            ).length;
        return h(
          "button",
          {
            class: "lb-rail-p",
            type: "button",
            onclick: () => this.showProgram(x),
          },
          this.L(programDef(x).code),
          h("span", { class: "lb-mute num" }, ptr ? `· → ${ptr}` : `· ${n}`),
        );
      }),
    );
  }
  /** Narrow screens: the index is one sticky "Contents" select. */
  private tocSelect(
    index: ReturnType<typeof programView>["index"],
  ): HTMLElement {
    const sel = h(
      "select",
      {
        "aria-label": this.s("contents"),
        onchange: () => {
          const v = sel.value;
          if (isSubjectId(v)) this.scrollToSubject(v);
        },
      },
      ...index
        .filter(
          (x) =>
            hasAnything(x) ||
            x.subject.id === "instructors.mine" ||
            x.subject.id === "club.courses",
        )
        .map((x) =>
          h(
            "option",
            { value: x.subject.id, selected: x.subject.id === this.st.s },
            `${this.subjNum(x.subject)} · ${this.L(x.subject.title)} · ${
              x.n ? x.n : x.also ? `→ ${x.also}` : x.soon ? this.s("soon") : 0
            }`,
          ),
        ),
    ) as HTMLSelectElement;
    return h(
      "div",
      { class: "lb-toc-sel" },
      h("span", { class: "lb-toc-sel-l" }, this.s("contents")),
      h("label", { class: "lb-select" }, sel),
    );
  }
  /** Highlight the subject being read in the index. */
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
        if (Date.now() < this.spyMuteUntil) return;
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
  private subjectSection(s: SubjectSection): HTMLElement {
    if (!s.total) return this.pointerSection(s);
    const l = this.lang;
    const d = s.subject;
    const by = new Map<GroupId, number>();
    for (const g of s.groups) by.set(g.id, g.items.length);
    const parts = [
      ltN("item1", "items", s.total, l),
      ...s.groups.map(
        (g) =>
          `${g.items.length} ${this.L(g.items.length === 1 ? SUB_LABEL[g.id] : SUB_PLURAL[g.id]).toLowerCase()}`,
      ),
      s.simMinutes
        ? this.s("aboutSim", { n: Math.round(s.simMinutes / 5) * 5 })
        : "",
    ].filter(Boolean);
    const lessons = s.items.filter((i) => i.sub === "lesson");
    const play =
      lessons.length > 1
        ? h(
            "button",
            {
              class: "gl-btn lb-play",
              type: "button",
              onclick: () =>
                this.openItem(lessons.find((i) => !isDone(i)) ?? lessons[0]),
            },
            this.s("playLessons"),
            ic("arrow", 16),
          )
        : null;
    return h(
      "section",
      {
        class: "lb-subj",
        "data-subject": d.id,
        "aria-labelledby": `lb-s-${d.id}`,
      },
      h(
        "div",
        { class: "lb-subj-h" },
        h(
          "h2",
          { id: `lb-s-${d.id}` },
          h("span", { class: "lb-subj-n num" }, d.n),
          this.L(d.title),
        ),
        play,
      ),
      h("p", { class: "lb-subj-m" }, parts.join(" · ")),
      ...s.groups.map((g) =>
        h(
          "div",
          { class: `lb-kg kg-${g.id}` },
          h(
            "p",
            { class: `lb-kg-h k-${g.items[0].kind}` },
            this.L(SUB_PLURAL[g.id]),
            h("span", { class: "num" }, ` · ${g.items.length}`),
          ),
          ROW_SUBS.has(g.id)
            ? this.rows(g.items, "subject")
            : this.grid(g.items, "subject"),
        ),
      ),
      s.soon.length ? this.soonBox(s.soon) : null,
      s.also.length ? this.alsoBox(s) : null,
    );
  }
  /** A subject with no item of its own yet: what other programmes hold for it ("Work on it in IR › …"), and its
   *  planned courses. Never a dash when there is material. */
  private pointerSection(s: SubjectSection): HTMLElement {
    const d = s.subject;
    const by = new Map<SubjectId, LibItem[]>();
    for (const i of s.also) by.set(i.home, [...(by.get(i.home) ?? []), i]);
    return h(
      "section",
      {
        class: "lb-subj is-ptr",
        "data-subject": d.id,
        "aria-labelledby": `lb-s-${d.id}`,
      },
      h(
        "div",
        { class: "lb-subj-h" },
        h(
          "h2",
          { id: `lb-s-${d.id}` },
          h("span", { class: "lb-subj-n num" }, d.n),
          this.L(d.title),
        ),
      ),
      s.also.length
        ? h("p", { class: "lb-subj-m" }, this.s("pointerSub"))
        : null,
      ...[...by.entries()].map(([home, items]) =>
        h(
          "div",
          { class: "lb-kg lb-ptr" },
          h(
            "p",
            { class: "lb-kg-h" },
            h(
              "button",
              {
                class: "lb-link",
                type: "button",
                onclick: () => this.showProgram(subjectDef(home).program, home),
              },
              this.s("pointerHead", { p: this.homeLabel(home) }),
            ),
            h("span", { class: "num" }, ` · ${items.length}`),
          ),
          this.mixedRows(items),
        ),
      ),
      s.soon.length ? this.soonBox(s.soon) : null,
    );
  }
  /** Pointer items: cards for what you study or fly, rows for checklists, each saying where it is shelved. */
  private mixedRows(items: readonly LibItem[]): HTMLElement {
    return h(
      "div",
      { class: `lb-rows${this.cols >= 3 ? " two" : ""}`, role: "list" },
      ...items.map((i) => this.row(i, "ref")),
    );
  }
  /** Planned courses of a subject: visible, not openable ("Soon"). */
  private soonBox(list: readonly PlannedItem[]): HTMLElement {
    return h(
      "div",
      { class: "lb-kg lb-soonbox" },
      h("p", { class: "lb-kg-h k-course" }, this.s("soonHead")),
      h(
        "div",
        { class: `lb-rows${this.cols >= 3 ? " two" : ""}`, role: "list" },
        ...list.map((x) => this.soonRow(x)),
      ),
    );
  }
  private soonRow(x: PlannedItem, where = false): HTMLElement {
    return h(
      "div",
      { class: "lb-row is-soon", role: "listitem", "data-plan": x.id },
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
          where
            ? `${this.s("soonCourse")} · ${this.s("shelvedIn", { p: this.homeLabel(x.home) })}`
            : this.s("soonCourse"),
        ),
      ),
      h("span", { class: "lb-soon-tag" }, this.s("soon")),
    );
  }
  /** "Also useful here": items that live in another programme, as pointers (never counted here). */
  private alsoBox(s: SubjectSection): HTMLElement {
    const by = new Map<SubjectId, number>();
    for (const i of s.also) by.set(i.home, (by.get(i.home) ?? 0) + 1);
    return h(
      "div",
      { class: "lb-also" },
      h(
        "p",
        { class: "lb-also-h" },
        h("b", {}, this.s("alsoHere")),
        ` ${this.s("alsoHereSub")}`,
      ),
      h(
        "div",
        { class: `lb-rows${this.cols >= 3 ? " two" : ""}`, role: "list" },
        ...s.also.slice(0, 4).map((i) => this.row(i, "ref")),
      ),
      h(
        "p",
        { class: "lb-also-l" },
        ...[...by.entries()].flatMap(([home, n], k) => [
          k ? h("span", { class: "lb-dot", "aria-hidden": "true" }, "·") : null,
          h(
            "button",
            {
              class: "lb-link",
              type: "button",
              onclick: () => this.showProgram(subjectDef(home).program, home),
            },
            `${this.s("see", { p: this.homeLabel(home) })} · ${n}`,
          ),
        ]),
      ),
    );
  }
  private soonLine(empty: readonly SubjectDef[]): HTMLElement {
    return h(
      "p",
      { class: "lb-soon" },
      `${this.s("soonLine")} `,
      h("span", {}, empty.map((x) => this.L(x.title)).join(" · ")),
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
        tool("plus", "toolNew", "toolNewSub", () => void this.newCourse()),
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
        tool(
          "plus",
          "clubNew",
          "clubNewSub",
          () => void this.newCourse("club.courses"),
        ),
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
              onclick: () => void this.newCourse("club.courses"),
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
            { class: "gl-btn", type: "button", onclick: () => this.pickPdf() },
            ic("pdf", 18),
            this.s("toolPdf"),
          ),
          h(
            "button",
            {
              class: "gl-primary sm",
              type: "button",
              onclick: () => void this.newCourse(),
            },
            ic("plus", 18),
            this.s("newCourse"),
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- search
  private searchBody(): HTMLElement[] {
    const st = this.st;
    const q = st.q.trim();
    const scope = st.p && !st.wide ? st.p : "all";
    const v = searchView(this.items, q, st.kind, scope);
    const top: HTMLElement[] = [];
    // the subjects whose name answers ("Matière · LAPL · PPL › 01 Air law →"), then the planned courses ("Soon")
    if (v.subjects.length)
      top.push(
        h(
          "section",
          { class: "lb-res lb-res-subj" },
          h(
            "h2",
            { class: "lb-res-h" },
            h(
              "span",
              {},
              this.s(v.subjects.length === 1 ? "hitSubject" : "hitSubjects"),
            ),
          ),
          h(
            "div",
            { class: "lb-subj-hits", role: "list" },
            ...v.subjects.slice(0, 8).map((x) => this.subjectHit(x)),
          ),
        ),
      );
    if (v.soon.length)
      top.push(
        h(
          "section",
          { class: "lb-res lb-res-soon" },
          h("h2", { class: "lb-res-h" }, h("span", {}, this.s("hitSoon"))),
          h(
            "div",
            { class: `lb-rows${this.cols >= 3 ? " two" : ""}`, role: "list" },
            ...v.soon.map((x) => this.soonRow(x, true)),
          ),
        ),
      );
    if (!v.total && !top.length) {
      // the header already says "Nothing matches": here, only the way out (the closest subjects, clear)
      const near = this.nearSubjects(q, scope);
      return [
        h(
          "div",
          { class: "gl-empty lb-empty" },
          near.length
            ? h(
                "div",
                { class: "lb-near" },
                h("p", { class: "lb-mute" }, this.s("suggest")),
                h(
                  "div",
                  { class: "lb-subj-hits", role: "list" },
                  ...near.map((x) => this.subjectHit(x)),
                ),
              )
            : null,
          h(
            "button",
            {
              class: "gl-btn",
              type: "button",
              onclick: () => this.clearSearch(),
            },
            this.s("clearSearch"),
          ),
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
    return groups.map((g) =>
      h(
        "section",
        { class: "lb-res" },
        h(
          "h2",
          { class: "lb-res-h" },
          h(
            "button",
            {
              class: "lb-res-p",
              type: "button",
              onclick: () => this.showProgram(g.subject.program, g.subject.id),
            },
            `${this.L(programDef(g.subject.program).code)} ›`,
          ),
          " ",
          h("span", {}, this.L(g.subject.title)),
          h("span", { class: "lb-res-n num" }, String(g.items.length)),
        ),
        ...this.mixed(g.items, "search"),
      ),
    );
  }
  /** One subject as a search hit: "LAPL · PPL › 01 Air law" and its count (or "→ 6", or "Soon"). */
  private subjectHit(x: ShelfSubject): HTMLElement {
    const d = x.subject;
    return h(
      "button",
      {
        class: "lb-subj-hit",
        type: "button",
        role: "listitem",
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
          "div",
          { class: "lb-tiles", role: "list" },
          ...shelves(this.items).map((sh) => {
            const d = programDef(sh.program);
            const fi = sh.program === "instructors" && !sh.total;
            return h(
              "button",
              {
                class: `lb-tile prog-${sh.program}`,
                type: "button",
                role: "listitem",
                onclick: () => this.o.entry?.openLibrary(sh.program),
              },
              h("b", {}, this.L(d.code)),
              h("span", { class: "lb-tile-t" }, this.L(d.title)),
              h(
                "span",
                { class: "lb-tile-n" },
                fi
                  ? this.s("toolsN", { n: 4 })
                  : !sh.total && sh.alsoHere
                    ? this.s("usefulElsewhere", { n: sh.alsoHere })
                    : ltN("item1", "items", sh.total, this.lang),
                sh.done ? this.bar(sh.done, sh.total) : null,
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
  private alsoLine(i: LibItem): string {
    const progs = [...new Set(i.also.map((s) => subjectDef(s).program))];
    return progs.length
      ? this.s("alsoIn", {
          p: progs.map((p) => this.L(programDef(p).code)).join(" · "),
        })
      : "";
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
  private card(i: LibItem, ctx: CardCtx, foot = false): HTMLElement {
    const cover = h("div", {
      class: `lb-cover cov-${i.kind}`,
      "aria-hidden": "true",
    });
    cover.dataset.key = i.key;
    if (i.kind === "course") this.observeCover(cover);
    else cover.append(simCover(i, this.lang, lessonRank(this.items, i)));
    if (i.sub === "lesson" && i.deck)
      cover.append(h("span", { class: "lb-flag" }, this.s("briefingFlight")));
    else if (i.draft && !i.assigned)
      cover.append(h("span", { class: "lb-flag" }, this.s("draftTag")));
    const also = ctx === "subject" ? this.alsoLine(i) : "";
    const purpose = this.purpose(i);
    return h(
      "article",
      {
        class: `lb-card k-${i.kind} s-${i.sub}`,
        role: "listitem",
        "data-key": i.key,
      },
      h("button", {
        class: "lb-hit",
        type: "button",
        "aria-label": `${this.L(SUB_LABEL[i.sub])} · ${this.L(i.title)}`,
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
        ctx === "continue"
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
      also || foot
        ? h(
            "p",
            { class: `lb-card-f${also ? "" : " is-blank"}` },
            also || "\u00a0",
          )
        : null,
    );
  }
  private row(i: LibItem, ctx: CardCtx): HTMLElement {
    const l = this.lang;
    const meta = [
      this.L(SUB_LABEL[i.sub]),
      ctx === "ref"
        ? this.s("shelvedIn", { p: this.homeLabel(i.home) })
        : this.sizeLine(i),
      i.sub === "scenario" && i.eyebrow ? this.L(i.eyebrow) : "",
      ctx === "subject" ? this.alsoLine(i) : "",
    ].filter(Boolean);
    const p = this.progressEl(i);
    return h(
      "div",
      {
        class: `lb-row k-${i.kind} s-${i.sub}`,
        role: "listitem",
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
        p,
      ),
      ctx === "ref"
        ? h(
            "span",
            { class: "lb-row-go", "aria-hidden": "true" },
            ic("arrow", 18),
          )
        : h(
            "span",
            { class: "lb-row-go", "aria-hidden": "true" },
            i.kind === "proc" ? this.s("open") : this.s("fly"),
          ),
    );
    void l;
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
    const r: AcademyRoute =
      a.k === "play"
        ? { k: "play", id: a.id, ...(a.stepId ? { s: a.stepId } : {}) }
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
  private async newCourse(at?: SubjectId) {
    const s = this.store;
    if (!s) return;
    const id = await s.newId(this.lang === "fr" ? "mon-cours" : "my-course");
    const title: L10n = { en: "Untitled course", fr: "Cours sans titre" };
    // no step yet: the builder opens on "Start from a beautiful deck"; a course made from a programme's page is filed
    // there, in the subject in view
    const p = at ? subjectDef(at).program : this.st.p;
    const cp = p ? courseProgramOf(p) : null;
    const subj =
      at ??
      (p && cp && p !== "instructors"
        ? (this.st.s ?? programDef(p).fallback)
        : null);
    const c: Course = {
      format: "ifr-course",
      version: 1,
      id,
      rev: 0,
      updated: new Date().toISOString(),
      title,
      author: { name: this.lang === "fr" ? "Vous" : "You" },
      langs: ["en", "fr"],
      cockpit: "g1000",
      world: { kind: "training" },
      steps: [],
      scenes: {},
      clips: {},
      assets: {},
      theme: "classroom",
      ...(cp && subj ? { program: cp, subject: subj } : {}),
    };
    const r = await s.save(c);
    if (!r.ok) return this.toast(loc(r.message, this.lang));
    this.toast(this.t("created"));
    this.go({ k: "edit", id: r.course.id });
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
