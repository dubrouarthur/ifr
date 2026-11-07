// Ground school — the course library (package I, SPEC §3.1, mockup final/flightcenter.png). DOM only (h()), no
// framework; the same component runs in the Flight Center view (index.html) and in academy.html#library.
//   Continue card   the assigned or last opened course, one primary action ("Continue at step 6")
//   filters         All · Assigned · Club · Samples · My drafts, plus search
//   cards           thumbnail (the course's first designed slide, drawn statically), tag, title, meta line, the
//                   kind-mix bar (what you read · where you act · where you fly), a ⋯ menu
//   instructor rail New course · Import your slides (PDF) · Import a course or club pack · Present to a class;
//                   below 1000 px it collapses into two buttons in the filter row
//   nudges          "not saved on this device", persist() ("keep my courses"), "not exported for 7 days"
// Pure helpers (entries, filters, the continue target, the kind mix, the academy route) are exported and tested.
// The app's own dialogs only (never confirm() / alert()).
import type { Course, CourseProgress, L10n, Lang, Step } from "../types";
import type { CourseIndexEntry, CourseStore } from "../store";
import { h } from "../../ui/dom";
import { agoText, ct, ctSteps, loc, type CourseStringKey } from "../i18n";
import { allSamples, isSampleId, sampleCourse } from "../samples";

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
  progress?: { index: number; total: number; stepId: string; next?: Step };
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
  /** run once the store is open: create a course (the editor opens on it), or pick a course to present */
  intent?: "new" | "present";
  /** a PDF import module (pdfImport.ts) when the build has one */
  importPdf?: (
    store: CourseStore,
    file: File,
    lang: Lang,
  ) => Promise<{ id: string } | null>;
}

const isIpad = () =>
  typeof navigator !== "undefined" &&
  (/iPad/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1));

export class CourseLibrary {
  readonly el: HTMLDivElement;
  private lang: Lang;
  private store: CourseStore | null = null;
  private entries: LibraryEntry[] = [];
  private filter: LibraryFilter = "all";
  private q = "";
  private main: HTMLDivElement;
  private rail: HTMLElement;
  private grid: HTMLDivElement;
  private segs: HTMLDivElement;
  private compact: HTMLDivElement;
  private contHost: HTMLDivElement;
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
  private destroyed = false;
  private loadSeq = 0;

  constructor(private o: LibraryOptions) {
    this.lang = o.lang;
    this.el = h("div", { class: `gl${o.embedded ? " gl-embedded" : ""}` });
    this.searchIn = h("input", {
      class: "gl-search-in",
      type: "search",
      enterkeyhint: "search",
      autocomplete: "off",
      oninput: () => {
        this.q = this.searchIn.value;
        this.renderGrid();
      },
    }) as HTMLInputElement;
    this.main = h("div", { class: "gl-main" });
    this.rail = h("aside", { class: "gl-rail" });
    this.grid = h("div", { class: "gl-grid", role: "list" });
    this.segs = h("div", { class: "gl-seg", role: "tablist" });
    this.compact = h("div", { class: "gl-compact" });
    this.contHost = h("div", { class: "gl-cont-host" });
    this.banner = h("div", { class: "gl-banners" });
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
      this.main,
      this.rail,
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
            if (x.isIntersecting) this.drawThumb(x.target as HTMLElement);
        },
        { rootMargin: "200px" },
      );
    this.renderShell();
    // samples render at once; stored courses join when the store opens
    this.entries = libraryEntries({ samples: allSamples(), stored: [] });
    this.renderAll();
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
    this.renderAll();
  }

  setLang(l: Lang) {
    if (l === this.lang) return;
    this.lang = l;
    this.renderShell();
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
    this.el.remove();
  }

  // ---------------------------------------------------------------- layout
  private measure() {
    const w = this.el.clientWidth;
    this.el.classList.toggle("is-narrow", w > 0 && w < 1240);
    this.el.classList.toggle("is-phone", w > 0 && w < 640);
  }
  private t(k: CourseStringKey, v?: Record<string, string | number>) {
    return ct(k, this.lang, v);
  }
  private renderShell() {
    const l = this.lang;
    this.searchIn.placeholder = this.t("search");
    this.searchIn.setAttribute("aria-label", this.t("search"));
    this.main.replaceChildren(
      h(
        "div",
        { class: "gl-head" },
        h(
          "div",
          { class: "gl-head-t" },
          h("h1", {}, this.t("groundSchool")),
          h("p", {}, this.t("groundSchoolLead")),
        ),
        h(
          "label",
          { class: "gl-search" },
          ic("search", 18),
          this.searchIn,
          h("kbd", { "aria-hidden": "true" }, "/"),
        ),
        h(
          "button",
          { class: "gl-primary gl-head-new", type: "button", onclick: () => void this.newCourse() },
          ic("plus", 18),
          this.t("newCourse"),
        ),
      ),
      this.banner,
      this.contHost,
      h("h2", { class: "gl-sec-h" }, this.t("slideDecks")),
      h(
        "div",
        { class: "gl-filters" },
        this.segs,
        h("span", { class: "gl-sp" }),
        this.compact,
      ),
      this.grid,
    );
    // the compact instructor actions (narrow widths)
    this.compact.replaceChildren(
      h(
        "button",
        { class: "gl-btn", type: "button", onclick: () => this.fileIn.click() },
        ic("upload", 18),
        this.t("import"),
      ),
    );
    const row = (
      icon: keyof typeof ICON,
      title: CourseStringKey,
      desc: CourseStringKey,
      run: () => void,
    ) =>
      h(
        "button",
        { class: "gl-rail-row", type: "button", onclick: run },
        h("span", { class: "gl-rail-ic" }, ic(icon, 20)),
        h(
          "span",
          { class: "gl-rail-tx" },
          h("b", {}, this.t(title)),
          h("small", {}, this.t(desc)),
        ),
      );
    const chip = (cls: string, word: string, text: CourseStringKey) =>
      h(
        "li",
        {},
        h("span", { class: `gl-k ${cls}` }, word),
        h("span", {}, this.t(text)),
      );
    this.rail.replaceChildren(
      h(
        "section",
        { class: "gl-panel" },
        h("h2", { class: "gl-panel-h" }, this.t("forInstructors")),
        row("plus", "newCourse", "newCourseDesc", () => void this.newCourse()),
        row("pdf", "importSlides", "importSlidesDesc", () => this.pickPdf()),
        row("upload", "importCourse", "importCourseDesc", () =>
          this.fileIn.click(),
        ),
        row("screen", "present", "presentDesc", () => this.pickPresent()),
      ),
      h(
        "section",
        { class: "gl-panel gl-opens" },
        h("h2", { class: "gl-panel-h" }, this.t("aStepCanOpen")),
        h(
          "ul",
          {},
          chip("k-fly", l === "fr" ? "VOL" : "FLY IT", "openFly"),
          chip("k-drill", l === "fr" ? "EXERCICE" : "DRILL", "openDrill"),
          chip("k-plate", l === "fr" ? "CARTE" : "PLATE", "openPlate"),
        ),
        h("p", {}, this.t("andComesBack")),
      ),
    );
  }
  private renderAll() {
    this.closeMenu();
    this.renderBanners();
    this.renderContinue();
    this.renderSegs();
    this.renderGrid();
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

  // ---------------------------------------------------------------- Continue card
  private renderContinue() {
    const l = this.lang;
    const last = this.store?.last() ?? null;
    const ct0 = continueTarget(this.entries, last);
    this.contHost.replaceChildren();
    if (!ct0) return;
    const e = ct0.entry;
    const total = e.steps;
    const index = e.progress?.index ?? 0;
    const n = ct0.started ? index + 1 : 1;
    const nextStep = e.course?.steps[ct0.started ? index : 0];
    const thumb = h("div", { class: "gl-cont-thumb", "aria-hidden": "true" });
    thumb.dataset.id = e.id;
    if (ct0.started && nextStep?.id) thumb.dataset.step = nextStep.id;
    const tags: HTMLElement[] = [];
    if (e.assigned)
      tags.push(h("span", { class: "gl-pill ok" }, this.t("tagAssigned")));
    else if (!ct0.started)
      tags.push(h("span", { class: "gl-pill" }, this.t("startHere")));
    else if (e.sample)
      tags.push(h("span", { class: "gl-pill" }, this.t("tagSample")));
    const by = e.author
      ? e.sample
        ? this.t("builtIn")
        : this.t("byCfi", { name: e.author.name })
      : "";
    const pct = total
      ? Math.round(((ct0.started ? index : 0) / total) * 100)
      : 0;
    const go = () => this.play(e, ct0.started ? e.progress?.stepId : undefined);
    const card = h(
      "section",
      { class: "gl-cont", "aria-label": loc(e.title, l) },
      thumb,
      h(
        "div",
        { class: "gl-cont-body" },
        h(
          "div",
          { class: "gl-cont-meta" },
          ...tags,
          by ? h("span", { class: "gl-muted" }, by) : null,
        ),
        h("h2", { class: "gl-cont-title" }, loc(e.title, l)),
        h(
          "div",
          { class: "gl-prog" },
          h(
            "span",
            {
              class: "gl-bar",
              role: "progressbar",
              "aria-valuemin": "0",
              "aria-valuemax": String(total),
              "aria-valuenow": String(ct0.started ? index : 0),
            },
            h("i", { style: `width:${pct}%` }),
          ),
          h(
            "span",
            { class: "gl-muted num" },
            this.t("ofN", { a: ct0.started ? index : 0, b: total }),
          ),
        ),
        !ct0.started && e.summary
          ? h("p", { class: "gl-cont-sum" }, loc(e.summary, l))
          : nextStep
            ? h(
                "div",
                { class: "gl-cont-next" },
                h(
                  "span",
                  { class: `gl-k ${kindClass(nextStep)}` },
                  kindWord(nextStep, l),
                ),
                h("span", {}, this.t("next", { t: loc(nextStep.title, l) })),
              )
            : null,
      ),
      h(
        "button",
        { class: "gl-primary", type: "button", onclick: go },
        ct0.started ? this.t("continueAt", { n }) : this.t("startCourse"),
        ic("chev", 18),
      ),
    );
    this.contHost.append(card);
    this.observeThumb(thumb);
  }

  // ---------------------------------------------------------------- filters and grid
  private renderSegs() {
    const n = shelfCounts(this.entries);
    const items: [LibraryFilter, CourseStringKey][] = [
      ["all", "fAll"],
      ["assigned", "fAssigned"],
      ["club", "fClub"],
      ["sample", "fSamples"],
      ["draft", "fDrafts"],
    ];
    this.segs.setAttribute("aria-label", this.t("groundSchool"));
    this.segs.replaceChildren(
      ...items.map(([f, k]) =>
        h(
          "button",
          {
            class: `gl-seg-b${this.filter === f ? " on" : ""}`,
            type: "button",
            role: "tab",
            "aria-selected": this.filter === f ? "true" : "false",
            onclick: () => {
              this.filter = f;
              this.renderSegs();
              this.renderGrid();
            },
          },
          this.t(k),
          f === "all" || this.filter === f
            ? h("span", { class: "gl-seg-n num" }, ` · ${n[f]}`)
            : null,
        ),
      ),
    );
  }
  private renderGrid() {
    for (const [el, t] of this.thumbs)
      if (this.grid.contains(el)) (t.destroy(), this.thumbs.delete(el));
    const list = filterEntries(this.entries, this.filter, this.q);
    this.grid.replaceChildren();
    if (!list.length) {
      const q = this.q.trim();
      this.grid.append(
        h(
          "div",
          { class: "gl-empty" },
          h("b", {}, q ? this.t("emptySearch", { q }) : this.t("emptyFilter")),
          q
            ? h(
                "button",
                {
                  class: "gl-btn",
                  type: "button",
                  onclick: () => {
                    this.searchIn.value = "";
                    this.q = "";
                    this.renderGrid();
                  },
                },
                this.t("clearSearch"),
              )
            : h("p", {}, this.t("emptyFilterBody")),
        ),
      );
      // no deck of your own yet: the empty shelf is where the first one starts
      if (!q && this.store && (this.filter === "draft" || !this.entries.some((e) => !e.sample))) {
        const box = this.grid.querySelector(".gl-empty")!;
        box.classList.add("gl-empty-create");
        box.replaceChildren(
          h("span", { class: "gl-empty-ic", "aria-hidden": "true" }, ic("plus", 28)),
          h("b", {}, this.t("createFirst")),
          h("p", {}, this.t("createFirstBody")),
          h("button", { class: "gl-primary", type: "button", onclick: () => void this.newCourse() }, ic("plus", 18), this.t("newCourse")),
        );
      }
      return;
    }
    for (const e of list) this.grid.append(this.card(e));
  }
  private card(e: LibraryEntry): HTMLElement {
    const l = this.lang;
    const tag = e.briefing
      ? this.t("tagBriefing")
      : e.shelf === "sample"
        ? this.t("tagSample")
        : e.shelf === "club"
          ? this.t("tagClub")
          : e.shelf === "assigned"
            ? this.t("tagAssigned")
            : this.t("tagDraft");
    const who = e.sample
      ? this.t("builtIn")
      : e.shelf === "draft"
        ? this.t("you")
        : (e.author?.club ?? e.author?.name ?? "");
    const meta = [
      who,
      ctSteps(e.steps, l),
      e.minutes ? this.t("minutes", { n: e.minutes }) : "",
      e.langs.map((x) => x.toUpperCase()).join(" "),
      e.progress
        ? this.t("ofN", { a: e.progress.index + 1, b: e.progress.total })
        : "",
      e.sample && !e.progress ? this.t("duplicateToAdapt") : "",
      e.shelf === "draft"
        ? this.t("editedAgo", { ago: agoText(e.updated, l) })
        : "",
    ].filter(Boolean);
    const thumb = h("div", { class: "gl-thumb", "aria-hidden": "true" });
    thumb.dataset.id = e.id;
    const sum = e.mix.learn + e.mix.act + e.mix.fly || 1;
    const seg = (n: number, cls: string) =>
      n ? h("i", { class: cls, style: `flex:${n / sum}` }) : null;
    const more = h(
      "button",
      {
        class: "gl-more",
        type: "button",
        "aria-label": this.t("menu", { t: loc(e.title, l) }),
        "aria-haspopup": "menu",
        onclick: (ev: Event) => {
          ev.stopPropagation();
          this.openMenu(e, more);
        },
      },
      ic("more", 20),
    );
    const open = h("button", {
      class: "gl-card-hit",
      type: "button",
      "aria-label": `${this.t("open")}: ${loc(e.title, l)}`,
      onclick: () => this.play(e, e.progress?.stepId),
    });
    const card = h(
      "article",
      {
        class: `gl-card shelf-${e.shelf}${e.needsExport ? " stale" : ""}`,
        role: "listitem",
      },
      open,
      thumb,
      h(
        "div",
        { class: "gl-card-b" },
        h("div", { class: "gl-card-h" }, h("h3", {}, loc(e.title, l)), more),
        h(
          "p",
          { class: "gl-meta" },
          h("span", { class: `gl-tag${e.shelf === "draft" ? " draft" : ""}` }, tag),
          " ",
          meta.join(" · "),
        ),
        h(
          "div",
          {
            class: "gl-mix",
            title: `${e.mix.learn} · ${e.mix.act} · ${e.mix.fly}`,
          },
          seg(e.mix.learn, "m-learn"),
          seg(e.mix.act, "m-act"),
          seg(e.mix.fly, "m-fly"),
        ),
      ),
    );
    this.observeThumb(thumb);
    return card;
  }

  // ---------------------------------------------------------------- thumbnails (static slide renders, lazy)
  private observeThumb(el: HTMLElement) {
    if (this.io) this.io.observe(el);
    else this.drawThumb(el);
  }
  private async drawThumb(el: HTMLElement) {
    this.io?.unobserve(el);
    if (this.thumbs.has(el) || el.dataset.drawn) return;
    el.dataset.drawn = "1";
    const e = this.entries.find((x) => x.id === el.dataset.id);
    const c = e?.course;
    if (!c) return;
    // a grid card shows the deck's cover, whole (a 16:9 slide card); the Continue card shows the step it resumes at
    const cover = !el.dataset.step && el.classList.contains("gl-thumb");
    const first = c.steps.find((x) => x.slide);
    const pick = cover ? (first ? { step: first } : null) : thumbOf(c, el.dataset.step);
    if (!pick) {
      el.classList.add("no-slide");
      return;
    }
    const s = pick.step;
    const slide = s.slide!;
    try {
      const { renderThumb } = await import("../canvas/render");
      if (this.destroyed || !el.isConnected) return;
      const host = h("div", { class: "gl-thumb-slide" });
      const place = () => {
        const W = el.clientWidth || 320;
        const H = el.clientHeight || 120;
        const r = thumbPlacement(W, H, pick.focus);
        host.style.cssText = `width:${r.w}px;height:${r.h}px;left:${r.x}px;top:${r.y}px`;
      };
      place();
      el.append(host);
      const store = this.store;
      const v = renderThumb(slide, host, {
        lang: this.lang,
        theme: c.theme,
        brand: c.brand,
        scenes: c.scenes,
        cockpit: c.cockpit,
        step: s,
        assetUrl: store
          ? (id) =>
              store
                .getAsset(id)
                .then((b) => (b ? URL.createObjectURL(b) : null))
          : undefined,
      });
      this.thumbs.set(el, v);
      if (typeof ResizeObserver !== "undefined") {
        const ro = new ResizeObserver(place);
        ro.observe(el);
        this.thumbs.set(el, { destroy: () => (ro.disconnect(), v.destroy()) });
      }
    } catch {
      el.classList.add("no-slide");
    }
  }

  // ---------------------------------------------------------------- actions
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
    const r = await s.duplicate(src, {
      title,
      ...(e.sample ? { sample: e.id } : {}),
    });
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
  private async newCourse() {
    const s = this.store;
    if (!s) return;
    const id = await s.newId(this.lang === "fr" ? "mon-cours" : "my-course");
    const title: L10n = { en: "Untitled course", fr: "Cours sans titre" };
    // no step yet: the builder opens on "Start from a beautiful deck" (live-rendered starter decks, the theme
    // question "projected in class or played before the flight", or one blank slide)
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
      theme: "cockpit",
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
        // a course whose id was already taken by someone else's comes in as a new copy (renamed)
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
      if (added.length === 1 && !replaced.length) this.filter = "all";
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
    const list = h(
      "div",
      { class: "gl-pick" },
      ...this.entries
        .filter((e) => !e.briefing)
        .map((e) =>
          h(
            "button",
            {
              class: "gl-pick-row",
              type: "button",
              onclick: () => {
                this.closeDialog();
                this.go({ k: "present", id: e.id });
              },
            },
            h("b", {}, loc(e.title, this.lang)),
            h(
              "small",
              {},
              `${ctSteps(e.steps, this.lang)}${e.minutes ? ` · ${this.t("minutes", { n: e.minutes })}` : ""}`,
            ),
          ),
        ),
    );
    this.showDialog(this.t("pickCourse"), list, []);
  }

  // ---------------------------------------------------------------- the ⋯ menu
  private openMenu(e: LibraryEntry, anchor: HTMLElement) {
    this.closeMenu();
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
    const w = 232;
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
        class: "gl-dialog",
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
          actions.length ? this.t("cancel") : this.t("close"),
        ),
        ...actions.map((a) =>
          h(
            "button",
            {
              class: `gl-primary sm${a.danger ? " danger" : ""}`,
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
        box.querySelector(
          ".gl-dialog-f .gl-primary, .gl-dialog-f .gl-btn",
        ) as HTMLElement | null
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
      this.searchIn.value = "";
      this.q = "";
      this.renderGrid();
    }
  }
  /** Focus the search field (the Flight Center's "/" shortcut). */
  focusSearch() {
    this.searchIn.focus();
  }
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
