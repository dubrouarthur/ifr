// The exercise (lesson) window: what to do now, the live readout, the deviation, the setup checklist with one-tap
// help, the hint and the other steps. It docks into a zone of the layout (a column beside the outside view, a row
// above the autopilot bar, a one-line strip in portrait, a card in Immersive) and the pilot can also float it: drag
// it by its header, resize it from its corner, collapse it to a one-line pill (instruction, timer, status), enlarge
// it to a large reading size, and dock it back (drop it on its dock, or Dock / Reset position in the ⋯ menu). The
// floating geometry is kept per layout. By default it never covers the PFD / MFD screens, the autopilot bar or
// the pedestal.
//
// The shell only maps its lesson state to a plain LessonView and handles the actions (LessonAction); the window
// owns its geometry, its menus and its persistence. The geometry helpers are pure and unit-tested.
import { h, fmtTime, store } from "./dom";
import { svgIcon, I } from "./icons";
import { registerStrings, t as tr, tn, onLangChange } from "./i18n";

registerStrings("en", {
  "lw.stepOf": "Step {n} of {t}",
  "lw.done": "Done",
  "lw.complete": "Exercise complete",
  "lw.exercise": "Exercise",
  "lw.hideMore": "Hide the hint and steps",
  "lw.more": "Hint and other steps",
  "lw.showHint": "Show the hint",
  "lw.setupDone": "{n} of {t} done",
});
registerStrings("fr", {
  "lw.stepOf": "Étape {n} sur {t}",
  "lw.done": "Terminé",
  "lw.complete": "Exercice terminé",
  "lw.exercise": "Exercice",
  "lw.hideMore": "Masquer l’indice et les étapes",
  "lw.more": "Indice et autres étapes",
  "lw.showHint": "Afficher l’indice",
  "lw.setupDone": "{n} sur {t} faits",
});
// the window's other words, keyed by their English text (English needs no table: t() falls back to the key)
registerStrings("en", {
  "lw.todo": "{n} settings to do",
  "lw.todo.1": "{n} setting to do",
});
registerStrings("fr", {
  "lw.todo": "{n} réglages à faire",
  "lw.todo.1": "{n} réglage à faire",
  "Move the window: drag it, or use the arrow keys": "Déplacer la fenêtre : faites-la glisser, ou utilisez les flèches",
  "Drag to move the window anywhere": "Faites glisser pour déplacer la fenêtre",
  "Exercise time": "Temps de l’exercice",
  "Open the approach plate in the EFB": "Ouvrir la carte d’approche dans l’EFB",
  Plate: "Carte",
  Enlarge: "Agrandir",
  "Normal size": "Taille normale",
  "Float the window": "Détacher la fenêtre",
  "Float the window (drag the header to move it)": "Détacher la fenêtre (faites glisser l’en-tête pour la déplacer)",
  "Dock the window": "Ancrer la fenêtre",
  "Exercise options": "Options de l’exercice",
  Collapse: "Replier",
  "Exercise progress": "Progression de l’exercice",
  "More below": "Suite plus bas",
  "Resize the window: drag, or use the arrow keys": "Redimensionner la fenêtre : faites glisser, ou utilisez les flèches",
  "Drag to resize": "Faites glisser pour redimensionner",
  "tap to expand": "touchez pour déplier",
  "Expand the exercise window. {s}: {t}": "Déplier la fenêtre de l’exercice. {s} : {t}",
  "Resume the flight": "Reprendre le vol",
  Complete: "Terminé",
  Hint: "Indice",
  Steps: "Étapes",
  "Set up complete": "Préparation terminée",
  "Set up": "Préparation",
  "Set every remaining item for me (the debrief notes it)": "Tout régler pour moi (le débriefing le note)",
  "Set all ({n})": "Tout régler ({n})",
  Hide: "Masquer",
  Show: "Afficher",
  "Setup checklist": "Liste de préparation",
  " (done)": " (fait)",
  " (to do)": " (à faire)",
  "{a} it for me: {l} (the debrief notes it)": "{a} pour moi : {l} (le débriefing le note)",
  Tune: "Accorder",
  Set: "Régler",
  Select: "Sélectionner",
  Load: "Charger",
  Cues: "Repères",
  "Show the cues": "Afficher les repères",
  "Hide the cues": "Masquer les repères",
  "End this exercise?": "Terminer cet exercice ?",
  "You go to the debrief. An exercise you end is not graded.": "Vous passez au débriefing. Un exercice arrêté avant la fin n’est pas noté.",
  "Keep flying": "Continuer à voler",
  "End exercise": "Terminer l’exercice",
  "Enlarge (reading size)": "Agrandir (taille de lecture)",
  "Reset position": "Réinitialiser la position",
  "Restart exercise…": "Recommencer l’exercice…",
  "End exercise…": "Terminer l’exercice…",
  "Drop here to dock": "Déposez ici pour ancrer",
  "Exercise paused: emergency": "Exercice en pause : urgence",
  "Exercise paused while you handle the emergency": "Exercice en pause pendant que vous traitez l’urgence",
});

// ------------------------------------------------------------------ data interface

/** where the docked window lives (ingame SPEC §4.4) */
export type LessonZone = "column" | "row" | "strip" | "card";

export interface LessonSetupRow {
  label: string;
  detail?: string;
  /** true done, false to do, null information (the entry to fly, the timing) */
  ok: boolean | null;
  /** one-tap help button text ("Tune", "Set", "Select", "Load"); absent when it cannot be set for the pilot */
  action?: string;
}

export interface LessonView {
  /** exercise name (tooltips, the pill) */
  title?: string;
  /** current step, 0-based, and the number of steps */
  step: number;
  steps: number;
  finished?: boolean;
  /** the instruction of the current step */
  instruction: string;
  /** live readout ("PA 4.2 NM · BRG 052° · planned entry TEARDROP") */
  readout?: string;
  /** the deviation being flown right now (most visible element) */
  violation?: string | null;
  hint?: string;
  /** every step of the exercise (the current one included), for Details */
  stepList?: { text: string; done: boolean }[];
  setup?: LessonSetupRow[];
  /** exercise time (s) */
  time: number;
  /** the exercise has an approach plate (header button) */
  plate?: boolean;
  /** paused and the pause card is hidden (iPad portrait): the window carries Resume */
  resume?: boolean;
  /** a checkride or a test: no coaching, no setup help */
  quiet?: boolean;
  /** an emergency is being flown (its card is open): the window folds to one pill, "Exercise paused:
   *  emergency", so one instruction is on screen; a tap on the pill still opens it */
  emergency?: boolean;
}

export type LessonAction =
  | { type: "plate" }
  | { type: "restart" }
  /** already confirmed in the window (no native confirm) */
  | { type: "end" }
  | { type: "resume" }
  /** index into view.setup */
  | { type: "setup"; index: number }
  | { type: "setupAll" }
  /** the docked footprint changed (floating, collapsed, enlarged): the shell refits the outside view */
  | { type: "layout" };

// ------------------------------------------------------------------ pure geometry and state

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Size {
  w: number;
  h: number;
}

/** what is kept per layout */
export interface WinState {
  float: boolean;
  /** floating geometry (null: not placed yet / automatic height) */
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  /** null: the zone's default (a strip starts collapsed) */
  collapsed: boolean | null;
  enlarged: boolean;
}

export const LW_MARGIN = 8;
export const LW_MIN_W = 280;
export const LW_MIN_H = 132;
export const LW_DEFAULT_W = 380;
/** the collapsed pill's height (52 px on touch, with its border) */
export const LW_PILL_H = 54;
/** the collapsed pill's width: the window's width, 440–520 px, within the viewport */
export const pillWidth = (w: number, vp: Size) =>
  Math.min(Math.max(w, 440), 520, vp.w - 2 * LW_MARGIN);
/** under this height the window shows only what is still to do */
export const LW_COMPACT_H = 380;
/** the auto-expand time on a new step or a setup item turning red (ms) */
export const LW_PEEK_MS = 8000;

export const defaultWinState = (): WinState => ({
  float: false,
  x: null,
  y: null,
  w: null,
  h: null,
  collapsed: null,
  enlarged: false,
});

/** localStorage key: one per layout (otwMode); the portrait strip keeps its own */
export function lessonWinKey(layout: string, zone: LessonZone): string {
  return `ifr.lessonWin.v1.${layout || "normal"}${zone === "strip" ? ".strip" : ""}`;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
/** a stored state, sanitised (anything unknown falls back to the default) */
export function readWinState(raw: unknown): WinState {
  const d = defaultWinState();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const w = num(r.w);
  const hh = num(r.h);
  return {
    float: r.float === true,
    x: num(r.x),
    y: num(r.y),
    w: w === null ? null : Math.max(LW_MIN_W, w),
    h: hh === null ? null : Math.max(LW_MIN_H, hh),
    collapsed: typeof r.collapsed === "boolean" ? r.collapsed : null,
    enlarged: r.enlarged === true,
  };
}

/** overlap area of two rectangles (0 when they only touch) */
export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const hh = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && hh > 0 ? w * hh : 0;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** keeps a window rectangle inside the viewport (margin all round, below `top`), at least the minimum size */
export function clampRect(
  r: Rect,
  vp: Size,
  top = LW_MARGIN,
  min: Size = { w: LW_MIN_W, h: LW_MIN_H },
): Rect {
  const m = LW_MARGIN;
  const maxW = Math.max(120, vp.w - 2 * m);
  const maxH = Math.max(48, vp.h - top - m);
  const w = clamp(r.w, Math.min(min.w, maxW), maxW);
  const hh = clamp(r.h, Math.min(min.h, maxH), maxH);
  return {
    x: clamp(r.x, m, Math.max(m, vp.w - w - m)),
    y: clamp(r.y, top, Math.max(top, vp.h - hh - m)),
    w,
    h: hh,
  };
}

/** resizing from the bottom-right corner: the top-left corner stays, the size stays between the minimum and
 *  the viewport edge */
export function resizeRect(r: Rect, w: number, h: number, vp: Size): Rect {
  const m = LW_MARGIN;
  return {
    x: r.x,
    y: r.y,
    w: clamp(w, Math.min(LW_MIN_W, vp.w - r.x - m), Math.max(LW_MIN_W, vp.w - r.x - m)),
    h: clamp(h, Math.min(LW_MIN_H, vp.h - r.y - m), Math.max(LW_MIN_H, vp.h - r.y - m)),
  };
}

const dist = (a: Rect, b: Rect) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Where a floating window goes: the wanted rectangle if it covers none of the `avoid` rectangles (the PFD / MFD
 * screens, the autopilot bar), else the nearest free position (beside or above / below each avoided box), else a
 * free position with a shorter window (down to the minimum height), else the least-covering one.
 */
export function placeFloating(
  want: Rect,
  vp: Size,
  avoid: Rect[],
  top = LW_MARGIN,
  minH = LW_MIN_H,
): Rect {
  const base = clampRect(want, vp, top, {
    w: LW_MIN_W,
    h: Math.min(minH, want.h),
  });
  const boxes = avoid.filter((a) => a.w > 0 && a.h > 0);
  const free = (r: Rect) => boxes.every((a) => overlapArea(r, a) === 0);
  if (free(base)) return base;
  const m = LW_MARGIN;
  const xs = [
    base.x,
    m,
    vp.w - base.w - m,
    ...boxes.flatMap((a) => [a.x + a.w + m, a.x - base.w - m]),
  ];
  const ys = [
    base.y,
    top,
    vp.h - base.h - m,
    ...boxes.flatMap((a) => [a.y + a.h + m, a.y - base.h - m]),
  ];
  let best: Rect | null = null;
  let bestD = Infinity;
  for (const x of xs)
    for (const y of ys) {
      const r = clampRect({ x, y, w: base.w, h: base.h }, vp, top);
      if (r.h < base.h || !free(r)) continue;
      const d = dist(r, want);
      if (d < bestD) [best, bestD] = [r, d];
    }
  if (best) return best;
  // no room at full height: the tallest free window at each candidate position (never under the minimum)
  let bestScore = -Infinity;
  for (const x of xs)
    for (const y of ys) {
      const r0 = clampRect({ x, y, w: base.w, h: minH }, vp, top, {
        w: LW_MIN_W,
        h: minH,
      });
      if (!free(r0)) continue;
      let hMax = vp.h - m - r0.y;
      for (const a of boxes)
        if (a.x < r0.x + r0.w && a.x + a.w > r0.x && a.y >= r0.y + r0.h)
          hMax = Math.min(hMax, a.y - m - r0.y);
      const r = { ...r0, h: Math.max(minH, Math.min(base.h, hMax)) };
      if (!free(r)) continue;
      const score = r.h * 4 - dist(r, want);
      if (score > bestScore) [best, bestScore] = [r, score];
    }
  if (best) return best;
  // everything is covered (a tiny viewport): the position that covers the least
  let bestO = Infinity;
  for (const x of xs)
    for (const y of ys) {
      const r = clampRect({ x, y, w: base.w, h: minH }, vp, top, {
        w: LW_MIN_W,
        h: minH,
      });
      const o = boxes.reduce((s, a) => s + overlapArea(r, a), 0);
      if (o < bestO) [best, bestO] = [r, o];
    }
  return best ?? base;
}

/** a floating window dropped with its top-left corner near its dock goes back to the dock */
export function shouldSnap(
  r: Rect,
  dock: Rect | null,
  threshold = 40,
): boolean {
  if (!dock || dock.w <= 0 || dock.h <= 0) return false;
  return (
    Math.abs(r.x - dock.x) <= threshold && Math.abs(r.y - dock.y) <= threshold
  );
}

/** the enlarged (reading size) window: wide, centred, under the top inset */
export function enlargedRect(vp: Size, top = LW_MARGIN): Rect {
  const w = Math.min(820, vp.w - 2 * 16);
  const hh = Math.min(660, vp.h - top - 24);
  return {
    x: Math.round((vp.w - w) / 2),
    y: top + 8,
    w,
    h: Math.max(LW_MIN_H, hh),
  };
}

/** what the window watches to expand itself: the step and the setup items done / to do */
export interface LessonWatch {
  step: number;
  finished: boolean;
  ok: string[];
  red: string[];
}
/**
 * Why the window should expand for a while: a new step (or the first one), or a setup item that was done and is
 * now to do again (a frequency changed, the CDI switched).
 */
export function expandReason(
  prev: LessonWatch | null,
  v: LessonView,
): { reason: "step" | "setup" | null; next: LessonWatch } {
  const rows = v.setup ?? [];
  const next: LessonWatch = {
    step: v.step,
    finished: !!v.finished,
    ok: rows.filter((r) => r.ok === true).map((r) => r.label),
    red: rows.filter((r) => r.ok === false).map((r) => r.label),
  };
  if (!prev || prev.step !== v.step || prev.finished !== next.finished)
    return { reason: "step", next };
  if (next.red.some((l) => prev.ok.includes(l)))
    return { reason: "setup", next };
  return { reason: null, next };
}

/** the status the pill and the edge show: a deviation, setup to do, finished, or on track */
export function lessonStatus(v: LessonView): "bad" | "todo" | "done" | "ok" {
  if (v.violation && !v.quiet) return "bad";
  if (v.finished) return "done";
  if ((v.setup ?? []).some((r) => r.ok === false)) return "todo";
  return "ok";
}

/** the step label: "Step 2 of 5", "Exercise", "Exercise complete" */
export function stepLabel(v: LessonView, short = false): string {
  if (v.finished) return tr(short ? "lw.done" : "lw.complete");
  if (v.steps > 1)
    return short
      ? `${v.step + 1}/${v.steps}`
      : tr("lw.stepOf", { n: v.step + 1, t: v.steps });
  return tr("lw.exercise");
}

// ------------------------------------------------------------------ icons (window-specific line icons)

const NS = "http://www.w3.org/2000/svg";
function lineIcon(d: string, size = 18, sw = 1.8): SVGSVGElement {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", String(size));
  s.setAttribute("height", String(size));
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", String(sw));
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", d);
  s.append(p);
  return s;
}
const IC = {
  /** pop out: a window with an arrow leaving it */
  float:
    "M14 4h6v6M20 4l-8 8M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5",
  /** dock: a frame with its left column filled */
  dock: "M4 5h16v14H4zM9 5v14M5.5 8h2M5.5 11h2",
  enlarge: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  shrink: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  resize: "M20 11l-9 9M20 17l-3 3",
  reset: "M4 10V4h6M4 4l7 7M14 20h6v-6",
  end: "M6 6h12v12H6z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

// ------------------------------------------------------------------ the component

export interface LessonWindowOptions {
  /** boxes a floating window must not cover by default (default: `.bezel .screen`, `.afcs` and `.pedestal` in the page) */
  avoid?: () => Rect[];
  /** top edge for floating windows (default: under `.sitbar`, else 8 px) */
  topInset?: () => number;
  /** where a floating window is attached (default: document.body) */
  floatRoot?: () => HTMLElement;
}

const rectOf = (el: Element): Rect => {
  const b = el.getBoundingClientRect();
  return { x: b.left, y: b.top, w: b.width, h: b.height };
};
const viewport = (): Size => ({ w: window.innerWidth, h: window.innerHeight });

export class LessonWindow {
  readonly el: HTMLElement;
  private readonly opts: LessonWindowOptions;
  private host: HTMLElement | null = null;
  private zone: LessonZone = "column";
  private layout = "normal";
  private st: WinState = defaultWinState();
  private view: LessonView | null = null;
  private cbs: ((a: LessonAction) => void)[] = [];
  private details = store.get("ifr.lessonWin.details", false);
  /** the setup list unfolded while everything is set */
  private setupAllOpen = false;
  /** the information lines (entry, timing) unfolded from their one "Cues" line */
  private cuesOpen = false;
  private bodyKey = "";
  private watch: LessonWatch | null = null;
  private peek = false;
  private peekTimer: ReturnType<typeof setTimeout> | null = null;
  private pulseTimer: ReturnType<typeof setTimeout> | null = null;
  private menuOpen = false;
  private confirmEnd = false;
  private lastDock: Rect | null = null;
  private lastFootprint = "";
  private ghost: HTMLElement | null = null;
  // parts
  private readonly head: HTMLElement;
  private readonly stepEl: HTMLElement;
  private readonly timeEl: HTMLElement;
  private readonly plateBtn: HTMLButtonElement;
  private readonly bigBtn: HTMLButtonElement;
  private readonly popBtn: HTMLButtonElement;
  private readonly menuBtn: HTMLButtonElement;
  private readonly foldBtn: HTMLButtonElement;
  private readonly moveBtn: HTMLButtonElement;
  private readonly prog: HTMLElement;
  private readonly progBar: HTMLElement;
  private readonly body: HTMLElement;
  /** "More below": the body scrolls and what is under the fold (the setup, the hint) would otherwise go unseen */
  private readonly moreCue: HTMLElement;
  private readonly pill: HTMLButtonElement;
  private readonly pillStep: HTMLElement;
  private readonly pillText: HTMLElement;
  private readonly pillTime: HTMLElement;
  /** the settings still to do, on the one-line pill (the portrait strip): the next action is never hidden */
  private readonly pillTodo: HTMLElement;
  private readonly sizeGrip: HTMLButtonElement;
  private readonly menu: HTMLElement;
  private readonly onResize = () => this.render();
  private ro: ResizeObserver | null = null;
  private readonly onDocDown = (e: PointerEvent) => {
    const t = e.target as Node;
    if (this.menuOpen && !this.menu.contains(t) && !this.menuBtn.contains(t))
      this.closeMenu(false);
    // the portrait strip opened as a sheet over the panel: a tap anywhere else folds it back
    if (this.isSheet() && !this.el.contains(t)) this.setCollapsed(true);
  };
  /** the docked portrait strip, open: a sheet that may drop over the panel until the pilot taps elsewhere */
  private isSheet() {
    return (
      !!this.view &&
      this.zone === "strip" &&
      !this.st.float &&
      !this.st.enlarged &&
      !this.isCollapsed()
    );
  }

  constructor(opts: LessonWindowOptions = {}) {
    this.opts = opts;
    const hb = (
      cls: string,
      label: string,
      icon: SVGSVGElement | string,
      fn: () => void,
    ) =>
      h(
        "button",
        {
          type: "button",
          class: `lw-hb ${cls}`,
          "aria-label": label,
          title: label,
          onclick: (e: Event) => {
            e.stopPropagation();
            fn();
          },
        },
        icon,
      );
    this.moveBtn = h(
      "button",
      {
        type: "button",
        class: "lw-move",
        "aria-label": "Move the window: drag it, or use the arrow keys",
        title: "Drag to move the window anywhere",
      },
      lineIcon(IC.grip, 16),
    );
    this.stepEl = h("span", { class: "lw-step" });
    this.timeEl = h("span", { class: "lw-time", title: "Exercise time" });
    this.plateBtn = h(
      "button",
      {
        type: "button",
        class: "lw-hb lw-plate",
        title: "Open the approach plate in the EFB",
        onclick: (e: Event) => {
          e.stopPropagation();
          this.emit({ type: "plate" });
        },
      },
      svgIcon(I.document, 15),
      h("span", {}, tr("Plate")),
    );
    this.bigBtn = hb("lw-opt lw-big", "Enlarge", lineIcon(IC.enlarge), () =>
      this.setEnlarged(!this.st.enlarged),
    );
    this.popBtn = hb(
      "lw-opt lw-pop",
      "Float the window",
      lineIcon(IC.float),
      () => (this.st.float ? this.dock() : this.float()),
    );
    this.menuBtn = hb(
      "lw-menu-btn",
      "Exercise options",
      lineIcon(IC.more, 20, 3.2),
      () => (this.menuOpen ? this.closeMenu(true) : this.openMenu()),
    );
    this.menuBtn.setAttribute("aria-haspopup", "menu");
    this.menuBtn.setAttribute("aria-expanded", "false");
    this.foldBtn = hb("lw-fold", "Collapse", svgIcon(I.chevUp, 16), () => {
      // opened from the emergency pill: folding goes back to that pill, the pilot's own fold is kept
      if (this.view?.emergency && this.emOpen) {
        this.emOpen = false;
        this.render();
        this.pill.focus({ preventScroll: true });
      } else this.setCollapsed(true);
    });
    this.head = h(
      "header",
      { class: "lw-h" },
      this.moveBtn,
      this.stepEl,
      this.timeEl,
      h("span", { class: "lw-sp" }),
      this.plateBtn,
      this.bigBtn,
      this.popBtn,
      this.menuBtn,
      this.foldBtn,
    );
    this.progBar = h("i");
    this.prog = h(
      "div",
      {
        class: "lw-prog",
        role: "progressbar",
        "aria-label": "Exercise progress",
        "aria-valuemin": 0,
      },
      this.progBar,
    );
    this.body = h("div", { class: "lw-body" });
    // a mouse convenience (a click scrolls the body); on touch it is only a sign (a finger scrolls the body), so
    // it is no tap target
    this.moreCue = h(
      "div",
      {
        class: "lw-cue",
        hidden: true,
        "aria-hidden": "true",
        onclick: (e: Event) => {
          e.stopPropagation();
          this.body.scrollBy({
            top: Math.max(48, this.body.clientHeight * 0.7),
            behavior: "smooth",
          });
        },
      },
      h("span", {}, h("span", { class: "lw-cue-t" }), svgIcon(I.chevDown, 14)),
    );
    this.pillStep = h("span", { class: "lw-pill-step" });
    this.pillText = h("span", { class: "lw-pill-t" });
    this.pillTime = h("span", { class: "lw-pill-time" });
    this.pillTodo = h("span", { class: "lw-pill-todo", hidden: true });
    this.pill = h(
      "button",
      {
        type: "button",
        class: "lw-pill",
        onclick: () => {
          if (this.dragMoved || this.tapDone) return;
          if (this.emHold()) {
            this.emOpen = true;
            this.render();
            this.foldBtn.focus({ preventScroll: true });
          } else this.setCollapsed(false);
        },
      },
      h("i", { class: "lw-dot", "aria-hidden": "true" }),
      this.pillStep,
      this.pillText,
      this.pillTodo,
      this.pillTime,
      h(
        "span",
        { class: "lw-pill-chev", "aria-hidden": "true" },
        svgIcon(I.chevDown, 16),
      ),
    );
    this.sizeGrip = h(
      "button",
      {
        type: "button",
        class: "lw-size",
        "aria-label": "Resize the window: drag, or use the arrow keys",
        title: "Drag to resize",
      },
      lineIcon(IC.resize, 14),
    );
    this.menu = h("div", {
      class: "lw-menu",
      role: "menu",
      "aria-label": "Exercise options",
      hidden: true,
    });
    this.el = h(
      "section",
      { class: "lw", role: "region", "aria-label": "Exercise" },
      this.head,
      this.prog,
      this.body,
      this.moreCue,
      this.pill,
      this.sizeGrip,
      this.menu,
    );

    this.wireDrag(this.head, true);
    this.wireDrag(this.pill, true);
    this.wireDrag(this.sizeGrip, false);
    this.moveBtn.addEventListener("keydown", (e) => this.keyMove(e, false));
    this.sizeGrip.addEventListener("keydown", (e) => this.keyMove(e, true));
    this.el.addEventListener("keydown", (e) => this.onKey(e));
    this.body.addEventListener("click", (e) => this.onBodyClick(e));
    this.body.addEventListener("scroll", () => this.updateCue(), {
      passive: true,
    });
    window.addEventListener("resize", this.onResize);
    document.addEventListener("pointerdown", this.onDocDown, true);
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => {
        this.fitCompact();
        this.updateCue();
      });
      this.ro.observe(this.el);
      this.ro.observe(this.body);
    }
    this.loadState();
    this.staticLabels();
    this.offLang = onLangChange(() => {
      this.staticLabels();
      this.bodyKey = "";
      if (this.menuOpen) this.renderMenu();
      this.render();
    });
  }

  private offLang: () => void = () => {};
  /** the words of the parts built once (labels, tooltips), in the UI language */
  private staticLabels() {
    const set = (el: Element, label: string, title = label) => {
      el.setAttribute("aria-label", tr(label));
      el.setAttribute("title", tr(title));
    };
    set(this.moveBtn, "Move the window: drag it, or use the arrow keys", "Drag to move the window anywhere");
    this.timeEl.title = tr("Exercise time");
    this.plateBtn.title = tr("Open the approach plate in the EFB");
    const pl = this.plateBtn.querySelector("span");
    if (pl) pl.textContent = tr("Plate");
    set(this.menuBtn, "Exercise options");
    set(this.foldBtn, "Collapse");
    this.prog.setAttribute("aria-label", tr("Exercise progress"));
    const cue = this.moreCue.querySelector(".lw-cue-t");
    if (cue) cue.textContent = tr("More below");
    set(this.sizeGrip, "Resize the window: drag, or use the arrow keys", "Drag to resize");
    this.menu.setAttribute("aria-label", tr("Exercise options"));
    this.el.setAttribute("aria-label", tr("Exercise"));
  }

  // ---------------------------------------------------------------- public API

  /** the element that holds the docked window (the outside-view area, or the docked row) */
  mount(host: HTMLElement) {
    this.host = host;
    this.render();
  }
  setZone(zone: LessonZone) {
    if (zone === this.zone) return;
    this.zone = zone;
    this.loadState();
    this.bodyKey = "";
    this.render();
  }
  /** the layout (otwMode): each one keeps its own window geometry */
  setLayout(layout: string) {
    if (layout === this.layout) return;
    this.layout = layout;
    this.loadState();
    this.bodyKey = "";
    this.render();
  }
  update(view: LessonView) {
    const { reason, next } = expandReason(this.watch, view);
    this.watch = next;
    if (!view.emergency) this.emOpen = false;
    this.view = view;
    if (reason && !view.emergency) this.attention();
    this.render();
  }
  /** the pilot opened the window from its emergency pill */
  private emOpen = false;
  private emHold() {
    return !!this.view?.emergency && !this.emOpen;
  }
  /** no lesson: the window empties and leaves its dock */
  clear() {
    this.view = null;
    this.watch = null;
    this.bodyKey = "";
    this.closeMenu(false);
    this.render();
  }
  onAction(cb: (a: LessonAction) => void): () => void {
    this.cbs.push(cb);
    return () => (this.cbs = this.cbs.filter((c) => c !== cb));
  }
  get floating() {
    return this.st.float && !this.st.enlarged;
  }
  get enlarged() {
    return this.st.enlarged;
  }
  get collapsed() {
    return this.isCollapsed();
  }
  /** the window takes its dock's room (the shell narrows the 3D view by `dockWidth`) */
  get occupiesDock() {
    return (
      !!this.view &&
      !this.st.float &&
      !this.st.enlarged &&
      !(this.isCollapsed() && (this.zone === "column" || this.zone === "card"))
    );
  }
  get dockWidth(): number {
    return this.occupiesDock && this.zone === "column"
      ? this.el.offsetWidth
      : 0;
  }
  float(at?: Rect) {
    const vp = viewport();
    const top = this.topInset();
    const cur =
      this.el.isConnected && this.el.offsetWidth ? rectOf(this.el) : null;
    if (cur && !this.st.float && !this.isCollapsed()) this.lastDock = cur;
    const w = this.st.w ?? Math.min(LW_DEFAULT_W, cur?.w || LW_DEFAULT_W);
    // the height its content needs (header, progress, body), at most 60 % of the screen; then a fixed height so
    // the placement that keeps the instruments clear holds (the pilot resizes it from its corner)
    const hh = this.st.h ?? this.naturalHeight();
    const want =
      at ??
      (this.st.x !== null && this.st.y !== null
        ? { x: this.st.x, y: this.st.y, w, h: hh }
        : {
            x: cur?.x ?? LW_MARGIN + 4,
            y: Math.max(top, cur?.y ?? top),
            w,
            h: hh,
          });
    const avoid = this.avoidRects();
    let r = at ? clampRect(want, vp, top) : placeFloating(want, vp, avoid, top);
    this.st.float = true;
    this.st.enlarged = false;
    if (!at && avoid.some((a) => overlapArea(r, a) > 0)) {
      // no free room for a window (iPad portrait: the instruments fill the screen): it floats as the one-line
      // pill in the free band instead, and the pilot expands or drags it where they choose
      const pw = pillWidth(w, vp);
      const p = placeFloating(
        { x: want.x, y: want.y, w: pw, h: LW_PILL_H },
        vp,
        avoid,
        top,
        LW_PILL_H,
      );
      if (!avoid.some((a) => overlapArea(p, a) > 0)) {
        r = { x: p.x, y: p.y, w, h: hh };
        this.st.collapsed = true;
      }
    }
    Object.assign(this.st, { x: r.x, y: r.y, w: r.w });
    this.st.h = r.h;
    this.save();
    this.render();
  }
  /** the height the content needs (header, progress, body), at most 60 % of the screen */
  private naturalHeight(): number {
    const n =
      this.head.offsetHeight + this.prog.offsetHeight + this.body.scrollHeight + 2;
    return Math.round(
      Math.max(LW_MIN_H, Math.min(n > 60 ? n : 360, window.innerHeight * 0.6)),
    );
  }
  dock() {
    this.st.float = false;
    this.st.enlarged = false;
    this.save();
    this.render();
  }
  /** back to the dock, the default size, the zone's default fold */
  resetPosition() {
    this.st = defaultWinState();
    this.save();
    this.render();
  }
  setCollapsed(on: boolean) {
    const inside = this.el.contains(document.activeElement);
    this.cancelPeek();
    this.st.collapsed = on;
    if (on) this.st.enlarged = false;
    this.closeMenu(false);
    this.save();
    this.render();
    // the focus follows the control that replaced the one pressed (only when the pilot was in the window)
    if (inside) (on ? this.pill : this.foldBtn).focus({ preventScroll: true });
  }
  setEnlarged(on: boolean) {
    const inside = this.el.contains(document.activeElement);
    this.st.enlarged = on;
    if (on) this.st.collapsed = false;
    this.closeMenu(false);
    this.save();
    this.bodyKey = "";
    this.render();
    if (inside) this.bigBtn.focus({ preventScroll: true });
  }
  destroy() {
    this.offLang();
    window.removeEventListener("resize", this.onResize);
    this.ro?.disconnect();
    document.removeEventListener("pointerdown", this.onDocDown, true);
    this.cancelPeek();
    this.ghost?.remove();
    this.el.remove();
  }

  // ---------------------------------------------------------------- state

  private zoneDefaultCollapsed() {
    return this.zone === "strip";
  }
  private isCollapsed() {
    if (this.emHold()) return true;
    return (
      !this.peek &&
      !this.st.enlarged &&
      (this.st.collapsed ?? (this.zoneDefaultCollapsed() && !this.st.float))
    );
  }
  private loadState() {
    this.st = readWinState(
      store.get<unknown>(lessonWinKey(this.layout, this.zone), null),
    );
  }
  private save() {
    store.set(lessonWinKey(this.layout, this.zone), this.st);
  }
  private emit(a: LessonAction) {
    for (const cb of this.cbs) cb(a);
  }
  private topInset(): number {
    if (this.opts.topInset) return this.opts.topInset();
    const sb = document.querySelector(".sitbar");
    const b = sb?.getBoundingClientRect();
    return b && b.height > 0 ? Math.round(b.bottom + LW_MARGIN) : LW_MARGIN;
  }
  private avoidRects(): Rect[] {
    if (this.opts.avoid) return this.opts.avoid();
    return [...document.querySelectorAll(".bezel .screen, .afcs, .pedestal")]
      .map(rectOf)
      .filter((r) => r.w > 0 && r.h > 0);
  }
  /** a new step or a setup item turning red: expand for 8 s (when folded) and pulse the edge */
  private attention() {
    // folded: open for 8 s — except the portrait strip, whose sheet would cover the PFD (the strip line itself
    // shows the new instruction and pulses)
    const sheetOnly = this.zone === "strip" && !this.st.float;
    if ((this.st.collapsed ?? (this.zoneDefaultCollapsed() && !this.st.float)) && !sheetOnly) {
      this.peek = true;
      if (this.peekTimer) clearTimeout(this.peekTimer);
      this.peekTimer = setTimeout(() => {
        this.peekTimer = null;
        this.peek = false;
        this.render();
      }, LW_PEEK_MS);
    }
    this.el.classList.remove("lw-pulse");
    void this.el.offsetWidth; // restart the animation
    this.el.classList.add("lw-pulse");
    if (this.pulseTimer) clearTimeout(this.pulseTimer);
    this.pulseTimer = setTimeout(
      () => this.el.classList.remove("lw-pulse"),
      900,
    );
  }
  private cancelPeek() {
    if (this.peekTimer) clearTimeout(this.peekTimer);
    this.peekTimer = null;
    this.peek = false;
  }

  // ---------------------------------------------------------------- render

  private render() {
    const v = this.view;
    const el = this.el;
    if (!v) {
      el.hidden = true;
      if (this.host && el.parentElement !== this.host) this.host.append(el);
      this.footprintChanged();
      return;
    }
    el.hidden = false;
    const collapsed = this.isCollapsed();
    const enlarged = this.st.enlarged;
    const floating =
      (this.st.float || enlarged) && !(collapsed && !this.st.float);
    const status = lessonStatus(v);
    el.dataset.zone = this.zone;
    el.dataset.mode = enlarged ? "enlarged" : floating ? "float" : "dock";
    el.dataset.status = status;
    el.classList.toggle("collapsed", collapsed);
    el.classList.toggle("enlarged", enlarged);
    el.classList.toggle("peek", this.peek);
    el.classList.toggle("details", this.details);
    // attach: docked windows live in their host, floating ones in the page (no transformed ancestor)
    const root = floating
      ? (this.opts.floatRoot?.() ?? document.body)
      : this.host;
    if (root && el.parentElement !== root) {
      const had = el.contains(document.activeElement)
        ? (document.activeElement as HTMLElement)
        : null;
      root.append(el);
      had?.focus({ preventScroll: true });
    }
    // header
    this.stepEl.textContent = stepLabel(v);
    this.timeEl.textContent = fmtTime(v.time);
    this.plateBtn.hidden = !v.plate;
    this.bigBtn.replaceChildren(lineIcon(enlarged ? IC.shrink : IC.enlarge));
    this.setLabel(this.bigBtn, tr(enlarged ? "Normal size" : "Enlarge"));
    this.popBtn.replaceChildren(lineIcon(this.st.float ? IC.dock : IC.float));
    this.setLabel(
      this.popBtn,
      tr(
        this.st.float
          ? "Dock the window"
          : "Float the window (drag the header to move it)",
      ),
    );
    this.popBtn.hidden = enlarged;
    this.moveBtn.hidden = enlarged;
    this.prog.hidden = v.steps <= 1;
    this.prog.setAttribute("aria-valuemax", String(v.steps));
    this.prog.setAttribute(
      "aria-valuenow",
      String(v.finished ? v.steps : v.step),
    );
    this.progBar.style.width = `${Math.round(((v.finished ? v.steps : v.step) / Math.max(1, v.steps)) * 100)}%`;
    // pill
    const em = this.emHold();
    el.classList.toggle("lw-em", em);
    if (em) el.dataset.status = "hold";
    this.pillStep.textContent = em ? "" : stepLabel(v, true);
    const pillT = em
      ? tr("Exercise paused: emergency")
      : v.violation && !v.quiet
        ? v.violation
        : v.instruction;
    this.pillText.textContent = pillT;
    this.pillTime.textContent = fmtTime(v.time);
    const todoN = (v.setup ?? []).filter((r) => r.ok === false).length;
    this.pillTodo.hidden = em || !!v.quiet || !!v.finished || todoN === 0;
    this.pillTodo.textContent = todoN ? tn("lw.todo", todoN) : "";
    this.pill.title = em
      ? tr("Exercise paused while you handle the emergency")
      : `${stepLabel(v)}: ${v.instruction}${v.violation && !v.quiet ? ` — ${v.violation}` : ""} (${tr("tap to expand")})`;
    this.pill.setAttribute(
      "aria-label",
      tr("Expand the exercise window. {s}: {t}", { s: stepLabel(v), t: pillT }),
    );
    this.pill.setAttribute("aria-expanded", "false");
    this.sizeGrip.hidden = !floating || collapsed || enlarged;
    this.renderBody(v);
    this.place(floating, collapsed, enlarged);
    this.fitCompact();
    this.updateCue();
    this.footprintChanged();
  }

  /** shows "More below" while the body hides content under its fold (a short dock or a small window) */
  private updateCue() {
    const b = this.body;
    const hidden =
      !this.view ||
      this.el.hidden ||
      this.isCollapsed() ||
      b.scrollHeight - b.clientHeight - b.scrollTop <= 6;
    this.moreCue.hidden = hidden;
    this.el.classList.toggle("lw-more-below", !hidden);
  }

  /** short of height (a docked column under a small outside view, the Instruments row, a small floating window):
   *  only what is still to do, one line each; Details or a taller window shows everything */
  private fitCompact() {
    const el = this.el;
    if (!this.view || el.hidden) return;
    let avail = Infinity;
    if (!this.st.enlarged && !this.isCollapsed()) {
      const mode = el.dataset.mode;
      if (mode === "float") avail = this.st.h ?? Infinity;
      else if (this.zone === "column") avail = el.clientHeight;
      else {
        const mh = parseFloat(getComputedStyle(el).maxHeight);
        if (Number.isFinite(mh)) avail = mh;
      }
    }
    el.classList.toggle("compact", avail > 0 && avail < LW_COMPACT_H);
  }

  private setLabel(b: HTMLElement, label: string) {
    b.setAttribute("aria-label", label);
    b.title = label;
  }

  private place(floating: boolean, collapsed: boolean, enlarged: boolean) {
    const s = this.el.style;
    if (!floating) {
      s.left = s.top = s.width = s.height = s.maxHeight = "";
      return;
    }
    const vp = viewport();
    const top = this.topInset();
    if (enlarged) {
      const r = enlargedRect(vp, top);
      Object.assign(s, {
        left: `${r.x}px`,
        top: `${r.y}px`,
        width: `${r.w}px`,
        height: "",
        maxHeight: `${r.h}px`,
      });
      return;
    }
    const w = this.st.w ?? LW_DEFAULT_W;
    if (collapsed) {
      const pw = pillWidth(w, vp);
      const r = clampRect(
        { x: this.st.x ?? LW_MARGIN, y: this.st.y ?? top, w: pw, h: LW_PILL_H },
        vp,
        top,
        { w: Math.min(260, pw), h: 44 },
      );
      Object.assign(s, {
        left: `${r.x}px`,
        top: `${r.y}px`,
        width: `${r.w}px`,
        height: "",
        maxHeight: "",
      });
      return;
    }
    const r = clampRect(
      {
        x: this.st.x ?? LW_MARGIN,
        y: this.st.y ?? top,
        w,
        h: this.st.h ?? LW_MIN_H,
      },
      vp,
      top,
    );
    Object.assign(s, {
      left: `${r.x}px`,
      top: `${r.y}px`,
      width: `${r.w}px`,
      height: this.st.h !== null ? `${r.h}px` : "",
      maxHeight: `${vp.h - r.y - LW_MARGIN}px`,
    });
  }

  private footprintChanged() {
    const fp = `${!!this.view}|${this.occupiesDock}|${this.zone}`;
    if (fp === this.lastFootprint) return;
    this.lastFootprint = fp;
    this.emit({ type: "layout" });
  }

  private renderBody(v: LessonView) {
    const key = JSON.stringify([
      v.step,
      v.steps,
      v.finished,
      v.instruction,
      v.readout,
      v.violation,
      v.hint,
      v.stepList,
      v.setup,
      v.resume,
      v.quiet,
      this.details,
      this.setupAllOpen,
      this.cuesOpen,
      this.zone,
      this.st.enlarged,
    ]);
    if (key === this.bodyKey) return;
    this.bodyKey = key;
    const quiet = !!v.quiet;
    const showMore = this.details || this.st.enlarged;
    const main = h(
      "div",
      { class: "lw-main" },
      v.resume
        ? h(
            "button",
            {
              type: "button",
              class: "lw-btn primary lw-resume",
              "data-act": "resume",
            },
            svgIcon(I.play, 16),
            tr("Resume the flight"),
          )
        : null,
      // the deviation comes first: the most visible element, never under the fold of a short window
      v.violation && !quiet
        ? h(
            "div",
            { class: "lw-viol", role: "status" },
            svgIcon(I.warning, 18),
            h("span", {}, v.violation),
          )
        : null,
      h(
        "div",
        { class: "lw-next", "aria-live": "polite" },
        v.instruction || (v.finished ? tr("Complete") : ""),
      ),
      v.readout
        ? h("div", { class: "lw-ro", title: v.readout }, v.readout)
        : null,
    );
    const setup =
      v.setup?.length && !v.finished ? this.setupEl(v.setup, quiet) : null;
    const others = (v.stepList ?? []).length > 1 ? v.stepList! : [];
    const more =
      showMore && !quiet && (v.hint || others.length)
        ? h(
            "div",
            { class: "lw-more" },
            v.hint
              ? h(
                  "div",
                  { class: "lw-hint" },
                  h("b", {}, tr("Hint")),
                  h("span", {}, v.hint),
                )
              : null,
            others.length
              ? h(
                  "ol",
                  { class: "lw-steps", "aria-label": tr("Steps") },
                  ...others.map((s, i) =>
                    h(
                      "li",
                      {
                        class:
                          i === v.step && !v.finished
                            ? "cur"
                            : s.done
                              ? "ok"
                              : "todo",
                      },
                      s.done
                        ? svgIcon(I.check, 14)
                        : h("i", { class: "lw-sdot", "aria-hidden": "true" }),
                      h("span", {}, s.text),
                    ),
                  ),
                )
              : null,
          )
        : null;
    const hasMore = !quiet && (!!v.hint || others.length > 0);
    const moreLink =
      hasMore && !this.st.enlarged
        ? h(
            "button",
            {
              type: "button",
              class: "lw-link",
              "data-act": "details",
              "aria-expanded": String(this.details),
            },
            this.details
              ? tr("lw.hideMore")
              : others.length
                ? tr("lw.more")
                : tr("lw.showHint"),
            svgIcon(this.details ? I.chevUp : I.chevDown, 14),
          )
        : null;
    if (this.zone === "row" && !this.st.float && !this.st.enlarged) {
      // two columns: the instruction, readout and hint on the left; the setup on the right
      this.body.replaceChildren(
        h(
          "div",
          { class: "lw-cols" },
          h("div", { class: "lw-col" }, main, more, moreLink),
          setup ? h("div", { class: "lw-col lw-col-setup" }, setup) : null,
        ),
      );
    } else
      this.body.replaceChildren(main, setup ?? "", more ?? "", moreLink ?? "");
  }

  private setupEl(rows: LessonSetupRow[], quiet: boolean): HTMLElement {
    const checks = rows.filter((r) => r.ok !== null);
    const todo = checks.filter((r) => r.ok === false).length;
    const all = checks.length > 0 && todo === 0;
    const todoActs = rows.filter(
      (r) => r.ok === false && r.action && !quiet,
    ).length;
    const head = h(
      "div",
      { class: "lw-setup-h" },
      all
        ? h(
            "span",
            { class: "lw-setup-done" },
            svgIcon(I.check, 15),
            tr("Set up complete"),
          )
        : h("b", {}, tr("Set up")),
      // what is left to do, counted the way the list shows it (the information lines are not settings)
      todo > 0 ? h("span", { class: "lw-setup-n" }, tn("lw.todo", todo)) : null,
      h("span", { class: "lw-sp" }),
      todoActs >= 2
        ? h(
            "button",
            {
              type: "button",
              class: "lw-btn lw-setall",
              "data-act": "setupAll",
              title: tr("Set every remaining item for me (the debrief notes it)"),
            },
            tr("Set all ({n})", { n: todoActs }),
          )
        : null,
      all && checks.length
        ? h(
            "button",
            {
              type: "button",
              class: "lw-link sm",
              "data-act": "setupOpen",
              "aria-expanded": String(this.setupAllOpen),
            },
            tr(this.setupAllOpen ? "Hide" : "Show"),
            svgIcon(this.setupAllOpen ? I.chevUp : I.chevDown, 13),
          )
        : null,
    );
    const rowEl = (r: LessonSetupRow, i: number) => {
      const cls = r.ok === null ? "info" : r.ok ? "ok" : "todo";
      const showDetail = !!r.detail && (r.ok !== true || this.details);
      const act = r.action ? tr(r.action) : "";
      return h(
        "li",
        { class: cls, title: r.detail ? `${r.label} — ${r.detail}` : undefined },
        r.ok === null
          ? h("i", { class: "lw-mk info", "aria-hidden": "true" })
          : r.ok
            ? h(
                "i",
                { class: "lw-mk ok", "aria-hidden": "true" },
                svgIcon(I.check, 12),
              )
            : h("i", { class: "lw-mk todo", "aria-hidden": "true" }),
        h(
          "span",
          { class: "lw-setup-t" },
          h("b", {}, r.label),
          showDetail ? h("small", {}, r.detail!) : null,
          h(
            "span",
            { class: "sr-only" },
            r.ok === null ? "" : tr(r.ok ? " (done)" : " (to do)"),
          ),
        ),
        r.ok === false && r.action && !quiet
          ? h(
              "button",
              {
                type: "button",
                class: "lw-btn lw-set",
                "data-act": "setup",
                "data-i": i,
                title: tr("{a} it for me: {l} (the debrief notes it)", { a: act, l: r.label }),
              },
              act,
            )
          : null,
      );
    };
    const indexed = rows.map((r, i) => ({ r, i }));
    // what to set first (the rows with a Set / Tune button on top), then what is done (unless everything is),
    // then the information lines (the entry to fly, the timing) folded into one "Cues" line
    const toSet = indexed.filter(({ r }) => r.ok === false);
    const done = indexed.filter(
      ({ r }) => r.ok === true && (!all || this.setupAllOpen),
    );
    const info = indexed.filter(({ r }) => r.ok === null);
    const infoOpen = this.cuesOpen;
    const cues = info.length
      ? infoOpen || info.length === 1
        ? info.map(({ r, i }) => rowEl(r, i))
        : [
            h(
              "li",
              { class: "info cues", title: info.map(({ r }) => (r.detail ? `${r.label} — ${r.detail}` : r.label)).join("\n") },
              h("i", { class: "lw-mk info", "aria-hidden": "true" }),
              h(
                "span",
                { class: "lw-setup-t" },
                h(
                  "b",
                  {},
                  tr("Cues"),
                  h("span", { class: "lw-cues-l" }, ` · ${info.map(({ r }) => r.label).join(" · ")}`),
                ),
              ),
              h(
                "button",
                {
                  type: "button",
                  class: "lw-link sm",
                  "data-act": "cuesOpen",
                  "aria-expanded": "false",
                  "aria-label": tr("Show the cues"),
                  title: tr("Show the cues"),
                },
                svgIcon(I.chevDown, 14),
              ),
            ),
          ]
      : [];
    const items = [
      ...toSet.map(({ r, i }) => rowEl(r, i)),
      ...done.map(({ r, i }) => rowEl(r, i)),
      ...cues,
    ];
    if (info.length > 1 && infoOpen)
      items.push(
        h(
          "li",
          { class: "info cues-close" },
          h(
            "button",
            {
              type: "button",
              class: "lw-link sm",
              "data-act": "cuesOpen",
              "aria-expanded": "true",
            },
            tr("Hide the cues"),
            svgIcon(I.chevUp, 13),
          ),
        ),
      );
    const list = h(
      "ul",
      { class: "lw-setup-list", "aria-label": tr("Setup checklist") },
      ...items,
    );
    return h(
      "div",
      { class: `lw-setup${all ? " all" : ""}` },
      head,
      items.length ? list : null,
    );
  }

  private onBodyClick(e: Event) {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!b || !this.body.contains(b)) return;
    const a = b.dataset.act;
    if (a === "details") this.toggleDetails();
    else if (a === "setupOpen") {
      this.setupAllOpen = !this.setupAllOpen;
      this.bodyKey = "";
      this.render();
    } else if (a === "cuesOpen") {
      this.cuesOpen = !this.cuesOpen;
      this.bodyKey = "";
      this.render();
      this.body.querySelector<HTMLElement>('[data-act="cuesOpen"]')?.focus({ preventScroll: true });
    } else if (a === "setup")
      this.emit({ type: "setup", index: Number(b.dataset.i) });
    else if (a === "setupAll") this.emit({ type: "setupAll" });
    else if (a === "resume") this.emit({ type: "resume" });
  }

  private toggleDetails() {
    this.details = !this.details;
    store.set("ifr.lessonWin.details", this.details);
    this.bodyKey = "";
    this.render();
  }

  // ---------------------------------------------------------------- ⋯ menu

  private openMenu() {
    this.menuOpen = true;
    this.confirmEnd = false;
    this.renderMenu();
    this.menu.hidden = false;
    this.menuBtn.setAttribute("aria-expanded", "true");
    this.menu
      .querySelector<HTMLElement>(
        "[role=menuitem], [role=menuitemcheckbox], button",
      )
      ?.focus({ preventScroll: true });
  }
  private closeMenu(focusBtn: boolean) {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.confirmEnd = false;
    this.menu.hidden = true;
    this.menuBtn.setAttribute("aria-expanded", "false");
    if (focusBtn) this.menuBtn.focus({ preventScroll: true });
  }
  private renderMenu() {
    const v = this.view;
    const item = (
      label: string,
      icon: SVGSVGElement,
      fn: () => void,
      cls = "",
      role = "menuitem",
      checked?: boolean,
    ) =>
      h(
        "button",
        {
          type: "button",
          role,
          class: `lw-mi ${cls}`,
          "aria-checked": checked === undefined ? undefined : String(checked),
          onclick: fn,
        },
        icon,
        h("span", {}, label),
      );
    if (this.confirmEnd) {
      this.menu.replaceChildren(
        h(
          "div",
          { class: "lw-confirm" },
          h("b", {}, tr("End this exercise?")),
          h(
            "p",
            {},
            tr("You go to the debrief. An exercise you end is not graded."),
          ),
          h(
            "div",
            { class: "lw-confirm-acts" },
            h(
              "button",
              {
                type: "button",
                class: "lw-btn",
                onclick: () => this.closeMenu(true),
              },
              tr("Keep flying"),
            ),
            h(
              "button",
              {
                type: "button",
                class: "lw-btn danger",
                onclick: () => {
                  this.closeMenu(false);
                  this.emit({ type: "end" });
                },
              },
              tr("End exercise"),
            ),
          ),
        ),
      );
      this.menu
        .querySelector<HTMLElement>(".lw-confirm-acts .lw-btn")
        ?.focus({ preventScroll: true });
      return;
    }
    const hasMore =
      !!v && !v.quiet && (!!v.hint || (v.stepList ?? []).length > 1);
    this.menu.replaceChildren(
      hasMore
        ? item(
            tr(this.details ? "lw.hideMore" : "lw.more"),
            svgIcon(I.learn, 18),
            () => {
              this.closeMenu(true);
              this.toggleDetails();
            },
            "",
            "menuitemcheckbox",
            this.details,
          )
        : "",
      item(
        tr(this.st.enlarged ? "Normal size" : "Enlarge (reading size)"),
        lineIcon(this.st.enlarged ? IC.shrink : IC.enlarge),
        () => this.setEnlarged(!this.st.enlarged),
        "lw-mi-opt",
      ),
      item(
        tr(this.st.float ? "Dock the window" : "Float the window"),
        lineIcon(this.st.float ? IC.dock : IC.float),
        () => {
          this.closeMenu(true);
          if (this.st.float) this.dock();
          else this.float();
        },
        "lw-mi-opt",
      ),
      item(tr("Reset position"), lineIcon(IC.reset), () => {
        this.closeMenu(true);
        this.resetPosition();
      }),
      h("hr", { role: "separator" }),
      item(tr("Restart exercise…"), svgIcon(I.restart, 18), () => {
        this.closeMenu(false);
        this.emit({ type: "restart" });
      }),
      v && !v.finished
        ? item(
            tr("End exercise…"),
            lineIcon(IC.end),
            () => {
              this.confirmEnd = true;
              this.renderMenu();
            },
            "danger",
          )
        : "",
    );
  }

  // ---------------------------------------------------------------- keyboard

  private onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (this.menuOpen) this.closeMenu(true);
      else if (this.st.enlarged) this.setEnlarged(false);
      else return;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (
      this.menuOpen &&
      (e.key === "ArrowDown" || e.key === "ArrowUp") &&
      this.menu.contains(e.target as Node)
    ) {
      const items = [...this.menu.querySelectorAll<HTMLElement>("button")];
      const i = items.indexOf(e.target as HTMLElement);
      items[
        (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length
      ]?.focus();
      e.preventDefault();
      e.stopPropagation();
    }
  }
  /** arrow keys on the move handle move the window, on the corner grip they resize it (Shift: 4x) */
  private keyMove(e: KeyboardEvent, resize: boolean) {
    const d = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[e.key];
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    const step = e.shiftKey ? 64 : 16;
    if (!this.st.float) this.float();
    const cur = rectOf(this.el);
    const vp = viewport();
    const top = this.topInset();
    if (resize) {
      const r = resizeRect(cur, cur.w + d[0] * step, cur.h + d[1] * step, vp);
      Object.assign(this.st, { w: r.w, h: r.h });
    } else {
      const r = clampRect(
        { x: cur.x + d[0] * step, y: cur.y + d[1] * step, w: cur.w, h: cur.h },
        vp,
        top,
        { w: LW_MIN_W, h: Math.min(cur.h, LW_MIN_H) },
      );
      Object.assign(this.st, { x: r.x, y: r.y });
    }
    this.save();
    this.render();
    (resize ? this.sizeGrip : this.moveBtn).focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- pointer: move, undock, snap, resize

  private dragMoved = false;
  private tapDone = false;
  private wireDrag(handle: HTMLElement, move: boolean) {
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      // the header buttons are buttons, not handles (the move grip is)
      if (
        move &&
        handle === this.head &&
        t.closest("button") &&
        !t.closest(".lw-move")
      )
        return;
      if (this.st.enlarged) return;
      const start = { x: e.clientX, y: e.clientY };
      const r0 = rectOf(this.el);
      let active = false;
      this.dragMoved = false;
      const pid = e.pointerId;
      try {
        handle.setPointerCapture(pid);
      } catch {
        /* synthetic events */
      }
      const vp = viewport();
      const top = this.topInset();
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (!active) {
          if (Math.hypot(dx, dy) < 6) return;
          active = true;
          this.dragMoved = true;
          this.el.classList.add(move ? "lw-dragging" : "lw-resizing");
          if (move && !this.st.float) {
            // dragged out of its dock: it floats from where it is, at a floating width
            this.lastDock = this.isCollapsed() ? this.lastDock : r0;
            this.st.float = true;
            this.st.w = this.st.w ?? Math.min(LW_DEFAULT_W, r0.w);
            this.st.h = this.st.h ?? this.naturalHeight();
          }
          if (move) this.showGhost();
        }
        if (move) {
          const w = this.st.w ?? r0.w;
          const r = clampRect(
            { x: r0.x + dx, y: r0.y + dy, w, h: Math.min(r0.h, LW_MIN_H) },
            vp,
            top,
            { w: Math.min(w, LW_MIN_W), h: 44 },
          );
          this.st.x = r.x;
          this.st.y = r.y;
          this.el.classList.toggle("lw-snap", shouldSnap(r, this.dockTarget()));
          this.ghost?.classList.toggle("on", shouldSnap(r, this.dockTarget()));
        } else {
          const r = resizeRect(r0, r0.w + dx, r0.h + dy, vp);
          this.st.w = r.w;
          this.st.h = r.h;
        }
        this.render();
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        this.el.classList.remove("lw-dragging", "lw-resizing", "lw-snap");
        this.hideGhost();
        if (!active) {
          // a tap on the pill (no movement) expands it: a captured touch pointer may fire no click
          if (handle === this.pill && ev.type === "pointerup") {
            this.tapDone = true;
            setTimeout(() => (this.tapDone = false), 400);
            this.setCollapsed(false);
          }
          return;
        }
        if (
          move &&
          this.st.x !== null &&
          this.st.y !== null &&
          shouldSnap(
            { x: this.st.x, y: this.st.y, w: 0, h: 0 },
            this.dockTarget(),
          )
        ) {
          this.st.float = false;
        }
        this.save();
        this.render();
        // the click that ends a drag on the pill must not expand it
        setTimeout(() => (this.dragMoved = false), 0);
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    });
  }
  /** the dock a floating window snaps back to: where it was docked, else the top-left of its host */
  private dockTarget(): Rect | null {
    if (this.lastDock) return this.lastDock;
    if (!this.host) return null;
    const r = rectOf(this.host);
    if (r.w <= 0 || r.h <= 0) return null;
    return {
      x: r.x,
      y:
        r.y +
        (this.zone === "column" || this.zone === "card"
          ? Math.max(0, this.topInset() - r.y - LW_MARGIN)
          : 0),
      w: Math.min(r.w, LW_DEFAULT_W),
      h: Math.min(r.h, 320),
    };
  }
  private showGhost() {
    const d = this.dockTarget();
    if (!d) return;
    this.ghost ??= h(
      "div",
      { class: "lw-ghost", "aria-hidden": "true" },
      h("span", {}, tr("Drop here to dock")),
    );
    Object.assign(this.ghost.style, {
      left: `${d.x}px`,
      top: `${d.y}px`,
      width: `${d.w}px`,
      height: `${Math.min(d.h, 160)}px`,
    });
    document.body.append(this.ghost);
  }
  private hideGhost() {
    this.ghost?.classList.remove("on");
    this.ghost?.remove();
  }
}
