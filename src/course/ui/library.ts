// The library: one place for everything a club or a school teaches and flies (slide courses, procedures and
// checklists, sim lessons, failure drills, scenarios), organised by program (LAPL, PPL, Night · VFR, IR, ATPL, Club,
// Instructors). DOM only (h()), no framework; the same component runs in academy.html#library and in the Flight
// Center's Library (index.html), so there is one mental model. The model is src/library (pure, tested).
//   header          what it is, search ("/"), Import (PDF, course or club pack), Present, New course
//   program strip   All · LAPL(A) · PPL(A) · Night · VFR · IR · ATPL · Club · Instructors, with counts
//   filters         kind (courses · flights · procedures) and level (three bars)
//   rows            Continue (or Start here), Assigned, My drafts; then one preview row per program ("See all"),
//                   or, inside a program, one section per kind; a search lists every match by kind
//   cards           a 16:9 cover (a course's first slide, a lesson's briefing deck cover, a procedure's checklist
//                   card, a flight's profile and strip), the kind, the program, the level, the title, a meta line;
//                   a course opens in the player, a procedure as its checklist, a flight in the cockpit
//   nudges          "not saved on this device", persist() ("keep my courses"), "not exported for 7 days"
// Pure helpers (entries, filters, the continue target, the kind mix, the academy route) are exported and tested.
// The app's own dialogs only (never confirm() / alert()).
import type { Course, CourseProgress, L10n, Lang, Step } from "../types";
import type { CourseIndexEntry, CourseStore } from "../store";
import { h } from "../../ui/dom";
import { agoText, ct, ctSteps, loc, type CourseStringKey } from "../i18n";
import { SAMPLES, allSamples, isSampleId, sampleCourse } from "../samples";
import type { Procedure, ProcCategory } from "../../train/procedureTypes";
import {
  KINDS,
  KIND_FILTER,
  KIND_ORDER,
  LEVELS,
  PROGRAMS,
  SUB_LABEL,
  isProgramId,
  levelTitle,
  programDef,
  type Level,
  type ProgramId,
} from "../../library/programs";
import {
  NO_FILTER,
  kindCounts,
  libraryView,
  programCounts,
  type LibFilter,
  type LibItem,
  type LibSection,
  type OpenTarget,
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
  checklistCover,
  courseCover,
    lessonCover,
  plateUrl,
  stripCover,
  type CoverSlide,
} from "../../library/covers";
import { procedureSheet } from "../../library/procedureSheet";
import { lt, ltN, type LibStringKey } from "../../library/strings";
import "../../styles/library.css";

// ------------------------------------------------------------------ routes (academy.html hash)
export type AcademyRoute =
  | { k: "library" }
  | { k: "play"; id: string; s?: string; a?: string; b?: string }
  | { k: "edit"; id: string; s?: string }
  | { k: "present"; id: string; s?: string }
  | { k: "project"; id: string; s?: string }
  | { k: "share"; code: string };
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
/** Parse academy.html's hash: #library, #play=<id>&s=<step>&a=<token>, #edit=, #present=, #project=, #c=<code>. */
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
  return { k: "library" };
}
/** The hash for a route (inverse of academyRoute). */
export function academyHash(r: AcademyRoute): string {
  const e = encodeURIComponent;
  switch (r.k) {
    case "library":
      return "#library";
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
  /** in the Flight Center modal: no own page title row padding */
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
  /** open on a program */
  program?: ProgramId;
}

const isIpad = () =>
  typeof navigator !== "undefined" &&
  (/iPad/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1));

const FILTER_KEY = "ifr.lib.filter";
function readFilter(): Partial<LibFilter> {
  try {
    const v = JSON.parse(
      localStorage.getItem(FILTER_KEY) ?? "{}",
    ) as Partial<LibFilter>;
    return {
      ...(v.program === "all" || isProgramId(v.program)
        ? { program: v.program }
        : {}),
      ...(v.kind === "all" ||
      v.kind === "course" ||
      v.kind === "procedure" ||
      v.kind === "flight"
        ? { kind: v.kind }
        : {}),
      ...(v.level === 0 || v.level === 1 || v.level === 2 || v.level === 3
        ? { level: v.level }
        : {}),
    };
  } catch {
    return {};
  }
}
function saveFilter(f: LibFilter) {
  try {
    localStorage.setItem(
      FILTER_KEY,
      JSON.stringify({ program: f.program, kind: f.kind, level: f.level }),
    );
  } catch {
    /* per-viewer convenience only */
  }
}
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
const CARD_MIN = 272;
const GAP = 20;

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
  private filter: LibFilter;
  private cols = 4;
  private head: HTMLElement;
  private strip: HTMLElement;
  private bar: HTMLElement;
  private body: HTMLDivElement;
  private banner: HTMLDivElement;
  private searchIn: HTMLInputElement;
  private toastEl: HTMLDivElement;
  private live: HTMLDivElement;
  private fileIn: HTMLInputElement;
  private pdfIn: HTMLInputElement;
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;
  private thumbs = new Map<Element, { destroy(): void }>();
  private menuEl: HTMLElement | null = null;
  private dialogEl: HTMLElement | null = null;
  private unsub: (() => void) | null = null;
  private toastTimer = 0;
  private searchTimer = 0;
  private destroyed = false;
  private loadSeq = 0;

  constructor(private o: LibraryOptions) {
    this.lang = o.lang;
    this.filter = {
      ...NO_FILTER,
      ...readFilter(),
      ...(o.program ? { program: o.program } : {}),
    };
    this.el = h("div", { class: `gl lb${o.embedded ? " gl-embedded" : ""}` });
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
          this.filter = { ...this.filter, q: this.searchIn.value };
          this.renderStrip();
          this.renderBar();
          this.renderBody();
        }, 90);
      },
    }) as HTMLInputElement;
    this.head = h("div", { class: "lb-head" });
    this.strip = h("nav", { class: "lb-strip" });
    this.bar = h("div", { class: "lb-bar" });
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
      h("div", { class: "lb-top" }, this.head, this.strip, this.bar),
      this.banner,
      this.body,
      this.toastEl,
      this.live,
      this.fileIn,
      this.pdfIn,
    );
    this.el.addEventListener("keydown", (e) => this.onKey(e));
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
    // the built-in courses and flights render at once; stored courses and the procedures join when they load
    this.entries = libraryEntries({ samples: allSamples(), stored: [] });
    this.rebuild();
    this.renderHead();
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
    this.renderHead();
    this.renderAll();
  }
  destroy() {
    this.destroyed = true;
    this.unsub?.();
    this.ro?.disconnect();
    this.io?.disconnect();
    for (const t of this.thumbs.values()) t.destroy();
    this.thumbs.clear();
    this.closeMenu();
    this.closeDialog();
    window.clearTimeout(this.toastTimer);
    window.clearTimeout(this.searchTimer);
    this.el.remove();
  }

  // ---------------------------------------------------------------- layout
  private measure() {
    const w = this.el.clientWidth;
    if (!w) return;
    this.el.classList.toggle("is-narrow", w < 1100);
    this.el.classList.toggle("is-phone", w < 640);
    const inner = this.body.clientWidth || w - 64;
    const min = w < 640 ? 240 : CARD_MIN;
    const cols = Math.max(
      1,
      Math.min(6, Math.floor((inner + GAP) / (min + GAP))),
    );
    if (cols !== this.cols) {
      this.cols = cols;
      this.renderBody();
    }
  }
  private t(k: CourseStringKey, v?: Record<string, string | number>) {
    return ct(k, this.lang, v);
  }
  private s(k: LibStringKey, v?: Record<string, string | number>) {
    return lt(k, this.lang, v);
  }
  private setFilter(f: Partial<LibFilter>, focus?: HTMLElement | null) {
    this.filter = { ...this.filter, ...f };
    saveFilter(this.filter);
    this.renderStrip();
    this.renderBar();
    this.renderBody();
    if (focus) focus.focus({ preventScroll: true });
  }
  private renderHead() {
    const l = this.lang;
    this.searchIn.placeholder = this.s("search");
    this.searchIn.setAttribute("aria-label", this.s("search"));
    const importBtn = h(
      "button",
      {
        class: "gl-btn lb-head-b",
        type: "button",
        "aria-haspopup": "menu",
        "aria-label": this.s("import"),
        onclick: (ev: Event) => {
          ev.stopPropagation();
          this.openImportMenu(importBtn);
        },
      },
      ic("upload", 18),
      h("span", {}, this.s("import")),
    );
    this.head.replaceChildren(
      h(
        "div",
        { class: "lb-head-t" },
        h(
          "p",
          { class: "lb-eyebrow" },
          this.s("eyebrow"),
          h("span", { class: "lb-eyebrow-n num" }, ""),
        ),
        h("h1", {}, this.s("title")),
        h("p", { class: "lb-lead" }, this.s("lead")),
      ),
      h(
        "div",
        { class: "lb-head-acts" },
        h(
          "label",
          { class: "gl-search lb-search" },
          ic("search", 18),
          this.searchIn,
          h("kbd", { "aria-hidden": "true" }, "/"),
        ),
        h(
          "div",
          { class: "lb-head-row" },
          importBtn,
          h(
            "button",
            {
              class: "gl-btn lb-head-b",
              type: "button",
              "aria-label": this.s("present"),
              onclick: () => this.pickPresent(),
            },
            ic("screen", 18),
            h("span", {}, this.s("present")),
          ),
          h(
            "button",
            {
              class: "gl-primary lb-head-new",
              type: "button",
              onclick: () => void this.newCourse(),
            },
            ic("plus", 18),
            this.s("newCourse"),
          ),
        ),
      ),
    );
    void l;
  }
  private renderAll() {
    this.closeMenu();
    const n = this.items.length;
    const eb = this.head.querySelector(".lb-eyebrow-n");
    if (eb)
      eb.textContent = ` · ${n === 1 ? this.s("item1") : this.s("items", { n })}`;
    this.renderBanners();
    this.renderStrip();
    this.renderBar();
    this.renderBody();
  }

  // ---------------------------------------------------------------- the program strip and the filters
  private renderStrip() {
    const l = this.lang;
    const n = programCounts(this.items, {
      kind: this.filter.kind,
      level: this.filter.level,
      q: this.filter.q,
    });
    this.strip.setAttribute("aria-label", this.s("programsNav"));
    const cell = (id: ProgramId | "all", code: string, title: string) => {
      const on = this.filter.program === id;
      return h(
        "button",
        {
          class: `lb-prog${on ? " on" : ""}${n[id] || id === "instructors" ? "" : " empty"}`,
          type: "button",
          "aria-pressed": on ? "true" : "false",
          "data-program": id,
          onclick: (ev: Event) => {
            this.setFilter({ program: id }, ev.currentTarget as HTMLElement);
            this.scrollTop();
          },
        },
        h(
          "span",
          { class: "lb-prog-c" },
          code,
          h("span", { class: "lb-prog-n num" }, n[id] || id !== "instructors" ? String(n[id]) : ""),
        ),
        h("span", { class: "lb-prog-t" }, title),
      );
    };
    this.strip.replaceChildren(
      cell("all", this.s("all"), this.s("allPrograms")),
      ...PROGRAMS.map((p) => cell(p.id, loc(p.code, l), loc(p.title, l))),
    );
    // keep the chosen program in view on a narrow strip
    const on = this.strip.querySelector<HTMLElement>(".lb-prog.on");
    if (on && this.strip.scrollWidth > this.strip.clientWidth)
      this.strip.scrollLeft = Math.max(0, on.offsetLeft - 24);
  }
  private renderBar() {
    const l = this.lang;
    const kc = kindCounts(this.items, {
      program: this.filter.program,
      level: this.filter.level,
      q: this.filter.q,
    });
    const seg = (
      label: string,
      on: boolean,
      run: (b: HTMLElement) => void,
      count?: number,
      level?: Level,
    ) =>
      h(
        "button",
        {
          class: `gl-seg-b${on ? " on" : ""}`,
          type: "button",
          "aria-pressed": on ? "true" : "false",
          onclick: (ev: Event) => run(ev.currentTarget as HTMLElement),
        },
        level ? levelGlyph(level) : null,
        label,
        count !== undefined
          ? h("span", { class: "gl-seg-n num" }, String(count))
          : null,
      );
    const kinds = h(
      "div",
      {
        class: "gl-seg lb-kinds",
        role: "group",
        "aria-label": this.s("kindsNav"),
      },
      seg(
        this.s("all"),
        this.filter.kind === "all",
        (b) => this.setFilter({ kind: "all" }, b),
        kc.all,
      ),
      ...KIND_ORDER.map((k) =>
        seg(
          loc(KIND_FILTER[k], l),
          this.filter.kind === k,
          (b) => this.setFilter({ kind: k }, b),
          kc[k],
        ),
      ),
    );
    const levels = h(
      "div",
      {
        class: "gl-seg lb-levels",
        role: "group",
        "aria-label": this.s("levelsNav"),
      },
      seg(this.s("allLevels"), !this.filter.level, (b) =>
        this.setFilter({ level: 0 }, b),
      ),
      ...LEVELS.map((x) =>
        seg(loc(x.title, l), this.filter.level === x.id, (b) => this.setFilter({ level: x.id }, b), undefined, x.id),
      ),
    );
    this.bar.replaceChildren(kinds, levels);
  }
  private scrollTop() {
    const sc = this.el.closest(".ga-scroll, .fc-main") as HTMLElement | null;
    const top = this.strip.parentElement as HTMLElement;
    if (sc && top && sc.scrollTop > top.offsetTop)
      sc.scrollTop = Math.max(0, top.offsetTop - 8);
  }

  // ---------------------------------------------------------------- banners and nudges
  private renderBanners() {
    const s = this.store;
    const out: HTMLElement[] = [];
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

  // ---------------------------------------------------------------- sections
  private renderBody() {
    this.closeMenu();
    for (const [el, t] of this.thumbs)
      if (this.body.contains(el)) (t.destroy(), this.thumbs.delete(el));
    const f = this.filter;
    const l = this.lang;
    const sections = libraryView(this.items, f, {
      cols: this.cols,
      drafts: !!this.store,
    });
    this.body.style.setProperty("--lb-cols", String(this.cols));
    const out: HTMLElement[] = [];
    const q = f.q.trim();
    if (q) {
      const n = sections.reduce((a, s) => a + s.total, 0);
      out.push(
        h(
          "div",
          { class: "lb-results-h" },
          h(
            "h2",
            {},
            n === 1
              ? this.s("result1", { q })
              : n
                ? this.s("results", { n, q })
                : this.s("noResults", { q }),
          ),
          f.program !== "all" || f.kind !== "all" || f.level
            ? h(
                "button",
                {
                  class: "gl-btn sm",
                  type: "button",
                  onclick: () =>
                    this.setFilter({ program: "all", kind: "all", level: 0 }),
                },
                this.s("clearFilters"),
              )
            : null,
        ),
      );
    } else if (f.program !== "all") out.push(this.programHero(f.program));
    for (const s of sections) out.push(this.section(s));
    if (f.program === "instructors" && !q)
      out.splice(1, 0, this.toolsSection());
    if (!sections.length && !(f.program === "instructors" && !q))
      out.push(
        h(
          "div",
          { class: "gl-empty lb-empty" },
          h("b", {}, q ? this.s("noResults", { q }) : this.s("emptyFilter")),
          q ? h("p", {}, this.s("noResultsBody")) : null,
          h(
            "button",
            {
              class: "gl-btn",
              type: "button",
              onclick: () => {
                if (q) {
                  this.searchIn.value = "";
                  this.filter = { ...this.filter, q: "" };
                }
                this.setFilter(
                  q ? {} : { program: "all", kind: "all", level: 0 },
                );
              },
            },
            q ? this.s("clearSearch") : this.s("clearFilters"),
          ),
        ),
      );
    this.body.replaceChildren(...out);
    void l;
  }
  private programHero(p: ProgramId): HTMLElement {
    const l = this.lang;
    const d = programDef(p);
    const kc = kindCounts(this.items, { program: p, level: this.filter.level });
    const parts = KIND_ORDER.filter((k) => kc[k]).map((k) => {
      const d = KINDS.find((x) => x.id === k)!;
      return `${kc[k]} ${loc(kc[k] === 1 ? d.title : KIND_FILTER[k], l).toLowerCase()}`;
    });
    return h(
      "section",
      { class: `lb-hero prog-${p}` },
      h(
        "button",
        {
          class: "lb-back",
          type: "button",
          onclick: (ev: Event) =>
            this.setFilter({ program: "all" }, ev.currentTarget as HTMLElement),
        },
        ic("back", 16),
        this.s("backAll"),
      ),
      h(
        "div",
        { class: "lb-hero-row" },
        h("span", { class: "lb-hero-code" }, loc(d.code, l)),
        h(
          "div",
          { class: "lb-hero-t" },
          h("h2", {}, loc(d.title, l)),
          h("p", {}, loc(d.blurb, l)),
        ),
        h(
          "div",
          { class: "lb-hero-m" },
          h("span", { class: "lb-frame" }, loc(d.frame, l)),
          h("span", { class: "lb-hero-n num" }, parts.join(" · ")),
        ),
      ),
    );
  }
  private section(s: LibSection): HTMLElement {
    const l = this.lang;
    const head: (HTMLElement | null)[] = [];
    let items = s.items;
    let extra: HTMLElement[] = [];
    const row = (title: string, sub: string) =>
      h(
        "div",
        { class: "lb-sec-t" },
        h("h2", {}, title),
        h("span", { class: "lb-sec-sub" }, sub),
      );
    switch (s.type) {
      case "continue":
        head.push(row(this.s("continue"), this.s("continueSub")));
        items = items.slice(0, this.cols);
        break;
      case "start":
        head.push(row(this.s("start"), this.s("startSub")));
        items = items.slice(0, Math.max(this.cols, 4));
        break;
      case "assigned":
        head.push(row(this.s("assigned"), this.s("assignedSub")));
        break;
      case "drafts":
        head.push(row(this.s("drafts"), this.s("draftsSub")));
        if (!items.length) return this.draftsEmpty(head);
        extra = [this.newCard()];
        break;
      case "program": {
        const d = programDef(s.program!);
        head.push(
          h(
            "button",
            {
              class: "lb-sec-id",
              type: "button",
              onclick: (ev: Event) => {
                this.setFilter(
                  { program: d.id },
                  ev.currentTarget as HTMLElement,
                );
                this.scrollTop();
              },
            },
            h("span", { class: "lb-code" }, loc(d.code, l)),
            h("span", { class: "lb-sec-name" }, loc(d.title, l)),
          ),
          h("span", { class: "lb-frame" }, loc(d.frame, l)),
        );
        if (s.total > items.length)
          head.push(
            h(
              "button",
              {
                class: "lb-see",
                type: "button",
                onclick: (ev: Event) => {
                  this.setFilter(
                    { program: d.id },
                    ev.currentTarget as HTMLElement,
                  );
                  this.scrollTop();
                },
              },
              this.s("seeAll", { n: s.total }),
              ic("chev", 16),
            ),
          );
        // the instructors' row ends on their tools
        if (
          d.id === "instructors" &&
          !this.filter.q &&
          items.length < this.cols
        )
          extra = this.toolCards().slice(0, this.cols - items.length);
        break;
      }
      case "kind":
      case "results":
        head.push(
          row(
            loc(KINDS.find((k) => k.id === s.kind)!.plural, l),
            s.total === 1 ? this.s("item1") : this.s("items", { n: s.total }),
          ),
        );
        break;
    }
        // a long kind section inside a program reads as its syllabus: lessons by stage, then the drills, the scenarios;
    // procedures by category
    if (s.type === "kind" && s.kind !== "course" && items.length > this.cols * 2) {
      const groups = groupFlights(items, l);
      return h(
        "section",
        { class: `lb-sec sec-kind sec-grouped${s.program ? ` prog-${s.program}` : ""}`, "data-key": s.key },
        h("div", { class: "lb-sec-h" }, ...head),
        ...groups.map((g) =>
          h(
            "div",
            { class: "lb-group" },
            h("h3", { class: "lb-group-h" }, g.title, h("span", { class: "lb-group-n num" }, String(g.items.length))),
            h("div", { class: "lb-grid", role: "list" }, ...g.items.map((i) => this.card(i, null))),
          ),
        ),
      );
    }
    const grid = h(
      "div",
      { class: "lb-grid", role: "list" },
      ...(s.type === "drafts" ? extra : []),
      // inside a program's section the card does not repeat the program
      ...items.map((i) => this.card(i, s.type === "program" || s.type === "kind" ? null : undefined)),
      ...(s.type === "drafts" ? [] : extra),
    );
    return h(
      "section",
      {
        class: `lb-sec sec-${s.type}${s.program ? ` prog-${s.program}` : ""}`,
        "data-key": s.key,
      },
      h("div", { class: "lb-sec-h" }, ...head),
      grid,
    );
  }

  // ---------------------------------------------------------------- cards
  private card(i: LibItem, inProgram?: ProgramId | null): HTMLElement {
    const l = this.lang;
    const cover = h("div", {
      class: `lb-cover cov-${i.kind}`,
      "aria-hidden": "true",
    });
    cover.dataset.key = i.key;
    // the cheap covers draw at once, the slides when they come into view
    if (i.kind === "procedure" || (i.kind === "flight" && i.sub !== "lesson"))
      this.fillCover(cover, i);
    else this.observeCover(cover);
    const p = i.progress;
    if (p && (i.kind === "course" ? p.done > 0 : true)) {
      const pct =
        i.kind === "course"
          ? Math.round((p.done / Math.max(1, p.total)) * 100)
          : p.passed
            ? 100
            : Math.round(p.best ?? 0);
      cover.append(
        h(
          "span",
          { class: `lb-cover-bar${p.passed ? " ok" : ""}` },
          h("i", { style: `width:${Math.max(4, pct)}%` }),
        ),
      );
    }
    if (i.assigned)
      cover.append(h("span", { class: "lb-flag ok" }, this.s("assignedTag")));
    else if (i.draft)
      cover.append(h("span", { class: "lb-flag" }, this.s("draftTag")));
    else if (p?.passed)
      cover.append(
        h("span", { class: "lb-flag ok" }, ic("check", 14), this.s("passed")),
      );
    const prog = inProgram === null ? undefined : (inProgram ?? i.programs[0]);
    const meta = this.metaLine(i);
    const more =
      i.kind === "course"
        ? h(
            "button",
            {
              class: "gl-more lb-more",
              type: "button",
              "aria-label": this.s("more", { t: loc(i.title, l) }),
              "aria-haspopup": "menu",
              onclick: (ev: Event) => {
                ev.stopPropagation();
                const e = this.entries.find(
                  (x) => x.id === (i.open as { id: string }).id,
                );
                if (e) this.openMenu(e, more!);
              },
            },
            ic("more", 20),
          )
        : null;
    const card = h(
      "article",
      {
        class: `lb-card k-${i.kind} s-${i.sub}`,
        role: "listitem",
        "data-key": i.key,
      },
      h("button", {
        class: "lb-hit",
        type: "button",
        "aria-label": `${loc(SUB_LABEL[i.sub], l)} · ${loc(i.title, l)}`,
        onclick: () => this.openItem(i),
      }),
      cover,
      h(
        "div",
        { class: "lb-card-b" },
        h(
          "p",
          { class: "lb-card-k" },
          h("span", { class: `lb-kind k-${i.kind}` }, loc(SUB_LABEL[i.sub], l)),
          prog
            ? h("span", { class: "lb-card-p" }, loc(programDef(prog).code, l))
            : null,
          levelGlyph(i.level, loc(levelTitle(i.level), l)),
        ),
        h("div", { class: "lb-card-h" }, h("h3", {}, loc(i.title, l)), more),
        meta ? h("p", { class: "lb-card-m" }, meta) : null,
      ),
    );
    return card;
  }
  private metaLine(i: LibItem): string {
    const l = this.lang;
    const parts: string[] = [];
    const p = i.progress;
    if (i.kind === "course") {
      if (p && p.done > 0)
        parts.push(
          this.s("ofN", {
            a: p.done + 1 > p.total ? p.total : p.done + 1,
            b: p.total,
          }),
        );
      else if (i.count) parts.push(ltN("step1", "steps", i.count.n, l));
      if (i.minutes) parts.push(this.s("min", { n: i.minutes }));
      if (i.source === "mine") {
        const e = this.entries.find(
          (x) => x.id === (i.open as { id: string }).id,
        );
        parts.push(
          e
            ? this.t("editedAgo", { ago: agoText(e.updated, l) })
            : this.s("you"),
        );
      } else if (i.source === "club") parts.push(this.s("club"));
    } else if (i.kind === "procedure") {
      if (i.count) parts.push(ltN("itemsN", "itemsN", i.count.n, l));
      const mem = (i.lines ?? []).filter((x) => x.memory).length;
      const all =
        this.procedures
          .find((x) => `proc:${x.id}` === i.key)
          ?.items.filter((x) => x.memory).length ?? mem;
      if (all) parts.push(this.s("memoryN", { n: all }));
      if (i.source === "club") parts.push(this.s("club"));
    } else {
      if (i.eyebrow && i.sub !== "scenario" && i.sub !== "circuit")
        parts.push(loc(i.eyebrow, l));
      else if (i.eyebrow) parts.push(loc(i.eyebrow, l));
      if (i.minutes) parts.push(this.s("min", { n: i.minutes }));
      if (p?.attempts)
        parts.push(
          p.passed
            ? this.s("bestPct", { n: Math.round(p.best ?? 0) })
            : ltN("attempt1", "attemptsN", p.attempts, l),
        );
    }
    return parts.filter(Boolean).join(" · ");
  }
  /** My drafts before the first one: one quiet line with the two ways to start. */
  private draftsEmpty(head: (HTMLElement | null)[]): HTMLElement {
    return h(
      "section",
      { class: "lb-sec sec-drafts is-empty", "data-key": "drafts" },
      h("div", { class: "lb-sec-h" }, ...head),
      h(
        "div",
        { class: "lb-drafts-empty" },
        h("span", { class: "lb-new-ic sm", "aria-hidden": "true" }, ic("plus", 20)),
        h("p", {}, h("b", {}, this.s("draftsEmpty")), " ", this.s("draftsEmptyBody")),
        h(
          "div",
          { class: "lb-drafts-acts" },
          h("button", { class: "gl-btn", type: "button", onclick: () => this.pickPdf() }, ic("pdf", 18), this.s("toolPdf")),
          h("button", { class: "gl-primary sm", type: "button", onclick: () => void this.newCourse() }, ic("plus", 18), this.s("newCourse")),
        ),
      ),
    );
  }
  private newCard(): HTMLElement {
    return h(
      "article",
      { class: "lb-card lb-new", role: "listitem" },
      h("button", {
        class: "lb-hit",
        type: "button",
        "aria-label": this.s("newCourseCard"),
        onclick: () => void this.newCourse(),
      }),
      h(
        "div",
        { class: "lb-cover lb-new-c", "aria-hidden": "true" },
        h("span", { class: "lb-new-ic" }, ic("plus", 28)),
      ),
      h(
        "div",
        { class: "lb-card-b" },
        h("div", { class: "lb-card-h" }, h("h3", {}, this.s("newCourseCard"))),
        h("p", { class: "lb-card-m" }, this.s("newCourseCardSub")),
      ),
    );
  }
  private toolCards(): HTMLElement[] {
    const tool = (
      icon: keyof typeof ICON,
      title: LibStringKey,
      sub: LibStringKey,
      run: () => void,
    ) =>
      h(
        "article",
        { class: "lb-card lb-tool", role: "listitem" },
        h("button", {
          class: "lb-hit",
          type: "button",
          "aria-label": this.s(title),
          onclick: run,
        }),
        h(
          "div",
          { class: "lb-cover lb-tool-c", "aria-hidden": "true" },
          h("span", { class: "lb-tool-ic" }, ic(icon, 28)),
        ),
        h(
          "div",
          { class: "lb-card-b" },
          
          h("div", { class: "lb-card-h" }, h("h3", {}, this.s(title))),
          h("p", { class: "lb-card-m" }, this.s(sub)),
        ),
      );
    return [
      tool("plus", "toolNew", "toolNewSub", () => void this.newCourse()),
      tool("pdf", "toolPdf", "toolPdfSub", () => this.pickPdf()),
      tool("upload", "toolPack", "toolPackSub", () => this.fileIn.click()),
      tool("screen", "toolPresent", "toolPresentSub", () => this.pickPresent()),
    ];
  }
  private toolsSection(): HTMLElement {
    return h(
      "section",
      { class: "lb-sec sec-tools" },
      h(
        "div",
        { class: "lb-sec-h" },
        h("div", { class: "lb-sec-t" }, h("h2", {}, this.s("tools"))),
      ),
      h("div", { class: "lb-grid", role: "list" }, ...this.toolCards()),
    );
  }

  // ---------------------------------------------------------------- covers (lazy for slides)
  private observeCover(el: HTMLElement) {
    if (this.io) this.io.observe(el);
    else void this.drawCover(el);
  }
  private fillCover(el: HTMLElement, i: LibItem) {
    el.prepend(
      i.kind === "procedure"
        ? checklistCover(i, this.lang)
        : stripCover(i, this.lang),
    );
    el.dataset.drawn = "1";
  }
  private async drawCover(el: HTMLElement) {
    this.io?.unobserve(el);
    if (this.thumbs.has(el) || el.dataset.drawn) return;
    el.dataset.drawn = "1";
    const i = this.items.find((x) => x.key === el.dataset.key);
    if (!i) return;
    let pick: CoverSlide | null = null;
    try {
      if (i.kind === "course") {
        const c = this.entries.find((x) => x.id === i.deck)?.course;
        pick = c ? courseCover(c) : null;
      } else if (i.sub === "lesson") {
        const written = i.deck
          ? (this.entries.find((x) => x.id === i.deck)?.course ??
            sampleCourse(i.deck))
          : null;
        pick = await lessonCover(i, this.lang, written);
      }
    } catch {
      pick = null;
    }
    if (!pick) {
      el.classList.add("no-slide");
      el.prepend(
        h("div", { class: "lb-noslide" }, h("b", {}, loc(i.title, this.lang))),
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
            ? store.getAsset(id).then((b) => (b ? URL.createObjectURL(b) : null))
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
    // the copy keeps the shelf it was on
    const place = coursePlacement(
      e,
      (id) => SAMPLES.find((x) => x.id === id)?.program,
    );
    const r = await s.duplicate(
      {
        ...src,
        ...(src.program || !place.programs.length
          ? {}
          : { program: place.programs }),
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
  /** File one of my courses in programs (and a level): the course's own `program` and `level`. */
  private fileCourse(e: LibraryEntry) {
    const s = this.store;
    const c = e.course;
    if (!s || !c || e.sample) return;
    const l = this.lang;
    const cur = coursePlacement(e);
    const picked = new Set<ProgramId>(cur.programs);
    const order: ProgramId[] = [...cur.programs];
    let level: Level = cur.level;
    const boxes = h(
      "div",
      {
        class: "lb-file-progs",
        role: "group",
        "aria-label": this.s("programs"),
      },
      ...PROGRAMS.map((p) => {
        const b = h("input", {
          type: "checkbox",
          checked: picked.has(p.id),
          onchange: () => {
            if (b.checked)
              (picked.add(p.id), order.includes(p.id) || order.push(p.id));
            else (picked.delete(p.id), order.splice(order.indexOf(p.id), 1));
          },
        }) as HTMLInputElement;
        return h(
          "label",
          { class: "lb-file-p" },
          b,
          h("span", { class: "lb-code" }, loc(p.code, l)),
          h("span", {}, loc(p.title, l)),
        );
      }),
    );
    const lv = h(
      "div",
      {
        class: "gl-seg lb-file-lv",
        role: "group",
        "aria-label": this.s("level"),
      },
      ...LEVELS.map((x) => {
        const b = h(
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
        );
        return b;
      }),
    );
    this.showDialog(
      this.s("fileTitle", { t: loc(e.title, l) }),
      h(
        "div",
        { class: "lb-file" },
        h("p", {}, this.s("fileBody")),
        boxes,
        h("p", { class: "lb-file-h" }, this.s("level")),
        lv,
      ),
      [
        {
          label: this.s("fileSave"),
          run: async () => {
            const progs = order.filter((x) => picked.has(x));
            const next: Course = { ...c, level };
            if (progs.length)
              next.program = progs.length === 1 ? progs[0] : progs;
            else delete next.program;
            const r = await s.save(next);
            if (!r.ok) return this.toast(loc(r.message, l));
            this.toast(
              progs.length
                ? this.s("filed", {
                    p: progs.map((x) => loc(programDef(x).code, l)).join(", "),
                  })
                : this.s("unfiled"),
            );
            await this.load();
          },
        },
      ],
    );
  }
  private async newCourse() {
    const s = this.store;
    if (!s) return;
    const id = await s.newId(this.lang === "fr" ? "mon-cours" : "my-course");
    const title: L10n = { en: "Untitled course", fr: "Cours sans titre" };
    const p = this.filter.program;
    // no step yet: the builder opens on "Start from a beautiful deck"; a course made from a program's page is filed in it
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
      ...(p !== "all" && p !== "instructors" ? { program: p } : {}),
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
          const id = (i.open as { id: string }).id;
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
                i.programs[0] ? loc(programDef(i.programs[0]).code, l) : "",
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
  private openImportMenu(anchor: HTMLElement) {
    this.popMenu(anchor, [
      [this.s("toolPdf"), () => this.pickPdf()],
      [this.s("toolPack"), () => this.fileIn.click()],
    ]);
  }
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
      (
        // the main action, never a destructive one (Cancel keeps the focus then)
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
      this.searchIn.value = "";
      this.filter = { ...this.filter, q: "" };
      this.renderBody();
    }
  }
  /** Focus the search field (the Flight Center's "/" shortcut). */
  focusSearch() {
    this.searchIn.focus();
  }
  /** Show a program (the Flight Center's links). */
  showProgram(p: ProgramId | "all") {
    this.setFilter({ program: p });
  }
}
/** A program's flights or procedures in groups: lessons by IR stage, failure drills, scenarios and school
 *  circuits; procedures by category (their eyebrow). Order kept. */
function groupFlights(items: readonly LibItem[], l: Lang): { title: string; items: LibItem[] }[] {
  const out: { key: string; title: string; items: LibItem[] }[] = [];
  for (const i of items) {
    const key =
      i.sub === "lesson"
        ? `stage-${i.facet}`
        : i.sub === "drill"
          ? "drill"
          : i.sub === "scenario" || i.sub === "circuit"
            ? "scenario"
            : `cat-${i.facet ?? ""}`;
    const title =
      i.sub === "drill"
        ? loc(DRILLS_TITLE, l)
        : key === "scenario"
          ? loc(SCENARIOS_TITLE, l)
          : i.eyebrow
            ? loc(i.eyebrow, l)
            : loc(SUB_LABEL[i.sub], l);
    let g = out.find((x) => x.key === key);
    if (!g) out.push((g = { key, title, items: [] }));
    g.items.push(i);
  }
  return out;
}
const DRILLS_TITLE: L10n = { en: "Failure drills", fr: "Exercices de panne" };
const SCENARIOS_TITLE: L10n = { en: "Scenarios and school circuits", fr: "Scénarios et circuits école" };

/** A level as three bars (1 getting started · 2 core · 3 advanced); the words are its label. */
function levelGlyph(lv: Level, label?: string): HTMLElement {
  return h(
    "span",
    {
      class: `lb-lv lv-${lv}`,
      ...(label ? { role: "img", "aria-label": label, title: label } : { "aria-hidden": "true" }),
    },
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
