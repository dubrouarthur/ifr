// Ground school — designed slides: the editing surface (package N). A SlideView in edit mode with an overlay in
// real CSS pixels on top: selection frames that rotate with their block, 44 px hit areas round small visible
// handles (resize, rotate, arrow ends, a callout's leader), alignment guides, the marquee, a floating context
// toolbar, and in-place text editing. Mouse, pen and touch go through the same pointer events; the keyboard map
// is keyCommand() (arrows nudge, Shift = one grid cell). The builder (package O) wraps it with the inspector,
// the step list and the library panel; everything it changes goes through EditorCore (one undo history).
import type {
  Lang,
  Pt,
  SchoolBrand,
  SlideBlock,
  SlideCanvas,
  ThemeId,
} from "../types";
import {
  HANDLES,
  HANDLE_POS,
  SLIDE_H,
  SLIDE_W,
  aabb,
  type Handle,
} from "./geom";
import {
  EditorCore,
  keyCommand,
  surfaceNav,
  type EditorCommand,
  type Mods,
} from "./editorCore";
import { SlideView, type SlideRenderOptions } from "./render";
import { typeCss, color as themeColor } from "./themes";
import { loc } from "./text";
import { tx } from "./strings";
import { blockLabel } from "./blocks";
import type { BlockDraft } from "./factory";

export interface CanvasEditorOptions extends Omit<
  SlideRenderOptions,
  "mode" | "reveal" | "onAction" | "onYourTurn" | "onEnd"
> {
  lang?: Lang;
  /** every change; `final` at the end of a gesture or a command (autosave on final) */
  onChange?: (c: SlideCanvas, final: boolean) => void;
  onSelect?: (ids: string[], blocks: SlideBlock[]) => void;
  /** padding round the slide inside the surface (CSS px, default 28) */
  pad?: number;
  /** the zoom changed (1 = the slide fits the surface) */
  onZoom?: (z: number) => void;
  /** a right-click or a long press on the empty slide: the host's slide menu items (background, layout…) */
  slideMenu?: () => CanvasMenuItem[];
}
/** An item of the canvas context menu (right click, long press). */
export interface CanvasMenuItem {
  label: string;
  icon?: string;
  kbd?: string;
  danger?: boolean;
  disabled?: boolean;
  run: () => void;
}
/** Words of the studio's canvas chrome that the engine's string table does not hold. */
const W = {
  style: ["Text style", "Style du texte"],
  bold: ["Bold", "Gras"],
  italic: ["Italic", "Italique"],
  align: ["Text alignment", "Alignement du texte"],
  color: ["Colour", "Couleur"],
  arrange: ["Position", "Position"],
  alignTo: ["Align", "Aligner"],
  toSlide: ["On the slide", "Sur la diapo"],
  spread: ["Spread evenly", "Répartir"],
  sameSize: ["Same size", "Même taille"],
  sameW: ["Same width", "Même largeur"],
  sameH: ["Same height", "Même hauteur"],
  center: ["Centre on the slide", "Centrer sur la diapo"],
  left: ["Left", "Gauche"],
  hcenter: ["Centre", "Centre"],
  right: ["Right", "Droite"],
  top: ["Top", "Haut"],
  vcenter: ["Middle", "Milieu"],
  bottom: ["Bottom", "Bas"],
  distH: ["Spread across", "Répartir en largeur"],
  distV: ["Spread down", "Répartir en hauteur"],
  more: ["More", "Plus"],
  copy: ["Copy", "Copier"],
  paste: ["Paste", "Coller"],
  cut: ["Cut", "Couper"],
  selectAll: ["Select all", "Tout sélectionner"],
  multi: ["Select several", "Sélection multiple"],
  multiOff: ["End the selection", "Terminer la sélection"],
  forward: ["Forward", "Avancer"],
  backward: ["Backward", "Reculer"],
  done: ["Done", "Terminé"],
  list: ["Bulleted list", "Liste à puces"],
  zoomIn: ["Zoom in", "Zoom avant"],
  zoomOut: ["Zoom out", "Zoom arrière"],
  fit: ["Fit", "Ajuster"],
} as const;
type WKey = keyof typeof W;
/** Text roles offered in the format bar (SPEC slides v2 §2), most used first. */
const STYLES: [string, string, string][] = [
  ["display", "Cover title", "Titre de couverture"],
  ["title", "Title", "Titre"],
  ["heading", "Heading", "Intertitre"],
  ["lead", "Subtitle", "Sous-titre"],
  ["body", "Body", "Texte"],
  ["small", "Caption", "Légende"],
  ["eyebrow", "Eyebrow", "Surtitre"],
  ["number", "Big number", "Grand chiffre"],
  ["quote", "Quote", "Citation"],
  ["formula", "Formula", "Formule"],
  ["foot", "Source line", "Ligne de source"],
];
/** Colours offered in the format bar: the theme's tokens (they follow the course theme). */
const COLOR_TOKENS = ["text", "ink2", "muted", "accent", "path", "sel", "nav", "key", "stop"] as const;

const mk = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};
const SVGNS = "http://www.w3.org/2000/svg";
const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

// toolbar icons: 24 × 24 strokes, same weight as the app's icons
const ICON: Record<string, string> = {
  duplicate: "M8 8h11v11H8z M5 16V5h11 M13.5 11v5 M11 13.5h5",
  delete: "M5 7h14 M10 7V4.5h4V7 M7 7l1 13h8l1-13",
  lock: "M7 11h10v9H7z M9 11V8a3 3 0 0 1 6 0v3",
  unlock: "M7 11h10v9H7z M9 11V8a3 3 0 0 1 5.8-1",
  group: "M4 4h7v7H4z M13 13h7v7h-7z M11 7.5h4.5V13",
  ungroup: "M4 4h7v7H4z M13 13h7v7h-7z",
  front: "M9 9h11v11H9z M4 15V4h11",
  back: "M4 4h11v11H4z M20 9v11H9",
  edit: "M4 20h4L19 9l-4-4L4 16z M13 7l4 4",
  bold: "M7 5h6a3.5 3.5 0 0 1 0 7H7z M7 12h7a3.5 3.5 0 0 1 0 7H7z",
  italic: "M10 5h8 M6 19h8 M14 5l-4 14",
  alignL: "M4 6h16 M4 10h10 M4 14h16 M4 18h10",
  alignC: "M4 6h16 M7 10h10 M4 14h16 M7 18h10",
  alignR: "M4 6h16 M10 10h10 M4 14h16 M10 18h10",
  list: "M9 6h11 M9 12h11 M9 18h11 M4.5 6h.5 M4.5 12h.5 M4.5 18h.5",
  arrange: "M4 4v16 M8 7h10v4H8z M8 14h6v4H8z",
  more: "M5 12h.5 M12 12h.5 M19 12h.5",
  aL: "M4 3v18 M8 6h10v4H8z M8 14h6v4H8z",
  aC: "M12 3v18 M6 6h12v4H6z M8 14h8v4H8z",
  aR: "M20 3v18 M6 6h10v4H6z M10 14h6v4h-6z",
  aT: "M3 4h18 M6 8h4v10H6z M14 8h4v6h-4z",
  aM: "M3 12h18 M6 6h4v12H6z M14 8h4v8h-4z",
  aB: "M3 20h18 M6 6h4v10H6z M14 10h4v6h-4z",
  dH: "M4 4v16 M20 4v16 M9 8h6v8H9z",
  dV: "M4 4h16 M4 20h16 M8 9h8v6H8z",
  sameW: "M4 8h16v3H4z M4 15h16v3H4z M4 4v18 M20 4v18",
  sameH: "M8 4v16h3V4z M15 4v16h3V4z",
  center: "M12 3v4 M12 17v4 M3 12h4 M17 12h4 M8 8h8v8H8z",
  copy: "M9 9h10v11H9z M15 9V4H5v11h4",
  cut: "M6 7a2.5 2.5 0 1 0 0 .01 M6 17a2.5 2.5 0 1 0 0 .01 M8 8l11 9 M8 16l11-9",
  paste: "M8 5h8v3H8z M6 6.5H5v14h14v-14h-1",
  multi: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M15 15l2 2 4-4",
  forward: "M9 9h11v11H9z M4 15V4h11 M14 13v4 M12 15h4",
  backward: "M4 4h11v11H4z M20 9v11H9",
  check: "M5 12l5 5 9-10",
};
function icon(name: string): SVGSVGElement {
  const s = document.createElementNS(SVGNS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("class", "sle-ic");
  const p = document.createElementNS(SVGNS, "path");
  p.setAttribute("d", ICON[name] ?? "");
  s.append(p);
  return s;
}

export class CanvasEditor {
  readonly el: HTMLDivElement;
  readonly core: EditorCore;
  view: SlideView;
  private stage: HTMLDivElement;
  private overlay: HTMLDivElement;
  private guidesSvg: SVGSVGElement;
  private gridSvg: SVGSVGElement;
  private bar: HTMLDivElement;
  private hover: HTMLDivElement;
  private marq: HTMLDivElement;
  private live: HTMLDivElement;
  private textEd: { id: string; ta: HTMLTextAreaElement } | null = null;
  private shown: SlideCanvas;
  private lang: Lang;
  private lastTap: { id: string; t: number } | null = null;
  private pointer: number | null = null;
  private ro: ResizeObserver | null = null;
  private raf = 0;
  private menu: HTMLDivElement | null = null;
  private pop: HTMLDivElement | null = null;
  private pressTimer = 0;
  private touches = new Map<number, Pt>();
  /** the selection before the first finger landed (a pinch restores it: two fingers never select) */
  private preSel: string[] = [];
  private pinch: { d0: number; z0: number; c0: Pt; sx: number; sy: number } | null = null;
  /** 1 = the slide fits the surface; up to 4 */
  zoom = 1;
  constructor(
    host: HTMLElement,
    canvas: SlideCanvas,
    private o: CanvasEditorOptions = {},
  ) {
    this.lang = o.lang ?? "en";
    this.el = mk("div", "sle-surface");
    this.el.tabIndex = 0;
    this.el.setAttribute("role", "application");
    this.el.setAttribute("aria-roledescription", tx("canvasLabel", this.lang));
    this.el.setAttribute("aria-label", tx("canvasLabel", this.lang));
    this.stage = mk("div", "sle-stage");
    this.overlay = mk("div", "sle-overlay");
    this.gridSvg = document.createElementNS(SVGNS, "svg");
    this.gridSvg.setAttribute("class", "sle-grid");
    this.guidesSvg = document.createElementNS(SVGNS, "svg");
    this.guidesSvg.setAttribute("class", "sle-guides");
    this.hover = mk("div", "sle-hover");
    this.marq = mk("div", "sle-marquee");
    this.bar = mk("div", "sle-bar");
    this.bar.setAttribute("role", "toolbar");
    this.live = mk("div", "sle-live");
    this.live.setAttribute("aria-live", "polite");
    // keyboard hint, shown while the surface itself has keyboard focus
    const hint = mk("div", "sle-kbdhint");
    hint.id = `sle-kbdhint-${Math.random().toString(36).slice(2, 8)}`;
    hint.textContent = tx("kbdHint", this.lang);
    this.el.setAttribute("aria-describedby", hint.id);
    this.overlay.append(this.gridSvg, this.hover, this.guidesSvg, this.marq);
    this.el.append(this.stage, this.overlay, this.bar, this.live, hint);
    host.append(this.el);
    this.core = new EditorCore(canvas, {
      onChange: (c, final) => {
        this.schedule();
        o.onChange?.(c, final);
      },
      onSelect: (ids) => {
        this.schedule();
        this.announce();
        o.onSelect?.(ids, this.core.selected);
      },
    });
    this.shown = canvas;
    this.view = new SlideView(this.stage, canvas, {
      ...o,
      mode: "edit",
      pad: o.pad ?? 28,
    });
    this.wire();
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => {
        this.view.measure();
        this.schedule();
      });
      this.ro.observe(this.el);
    }
    requestAnimationFrame(() => {
      this.view.relayout();
      this.draw();
    });
  }

  // ---------------------------------------------------------------- public API
  get canvas(): SlideCanvas {
    return this.core.canvas;
  }
  /** Edit another slide (fresh undo history). */
  load(c: SlideCanvas) {
    this.closeText();
    this.core.load(c);
    this.view.update(c);
    this.shown = c;
    this.draw();
  }
  /** A change made outside (the inspector): one undo step. */
  set(c: SlideCanvas, key?: string) {
    this.core.apply(c, key);
  }
  /** Add a library item's block (centred, or at a slide point) and select it. */
  add(d: BlockDraft, at?: Pt): SlideBlock {
    const b = this.core.addDraft(d, at);
    this.el.focus({ preventScroll: true });
    return b;
  }
  /** Is a client point over the slide (a library drag hovering)? */
  isOverSlide(clientX: number, clientY: number): boolean {
    const p = this.view.toSlide(clientX, clientY);
    return p[0] >= 0 && p[1] >= 0 && p[0] <= SLIDE_W && p[1] <= SLIDE_H;
  }
  /** Drop a library item at a client point; false when the point is off the slide. */
  dropAt(d: BlockDraft, clientX: number, clientY: number): boolean {
    if (!this.isOverSlide(clientX, clientY)) return false;
    this.add(d, this.view.toSlide(clientX, clientY));
    return true;
  }
  select(ids: string[]) {
    this.core.select(ids);
  }
  run(c: EditorCommand): boolean {
    if (c.k === "edit") {
      const b = this.core.single();
      if (b && (b.kind === "text" || b.kind === "callout")) {
        this.openText(b.id);
        return true;
      }
      return false;
    }
    return this.core.run(c);
  }
  undo() {
    return this.core.run({ k: "undo" });
  }
  redo() {
    return this.core.run({ k: "redo" });
  }
  /** Preview the slide as the n-th reveal shows it (later blocks dimmed); null shows everything. */
  /** the Reveal preview step shown (null: every block, the editing view) */
  private revealShown: number | null = null;
  previewReveal(n: number | null) {
    this.revealShown = n;
    this.view.setReveal(n === null ? Infinity : n);
    this.schedule();
  }
  setLang(l: Lang) {
    this.lang = l;
    const hint = this.el.querySelector(".sle-kbdhint");
    if (hint) hint.textContent = tx("kbdHint", l);
    this.closeText();
    this.view.setLang(l);
    this.schedule();
  }
  setTheme(theme: ThemeId | undefined, brand?: SchoolBrand) {
    this.view.setTheme(theme, brand);
    this.schedule();
  }
  focus() {
    this.el.focus({ preventScroll: true });
  }
  /** Touch: taps add to the selection (Shift's job with a keyboard). */
  setMultiSelect(on: boolean) {
    this.core.multiSelect = on;
    this.el.classList.toggle("is-multiselect", on);
    this.schedule();
  }
  get multiSelect(): boolean {
    return this.core.multiSelect;
  }
  /**
   * Zoom the slide (1 = fit the surface, up to 4). The surface grows inside its host, which scrolls; `about` is a
   * client point that stays put (the pointer, the pinch centre), else the visible centre.
   */
  setZoom(z: number, about?: Pt) {
    const host = this.el.parentElement;
    const nz = Math.round(Math.max(1, Math.min(4, z)) * 100) / 100;
    if (!host || Math.abs(nz - this.zoom) < 0.005) return;
    const hr = host.getBoundingClientRect();
    const ax = about ? about[0] - hr.left : hr.width / 2;
    const ay = about ? about[1] - hr.top : hr.height / 2;
    const fx = (host.scrollLeft + ax) / Math.max(1, this.el.offsetWidth);
    const fy = (host.scrollTop + ay) / Math.max(1, this.el.offsetHeight);
    this.zoom = nz;
    host.classList.toggle("sle-zoomed", nz > 1);
    if (nz > 1) {
      this.el.style.width = `${Math.round(hr.width * nz)}px`;
      this.el.style.height = `${Math.round(hr.height * nz)}px`;
    } else {
      this.el.style.width = "";
      this.el.style.height = "";
    }
    this.view.measure();
    host.scrollLeft = fx * this.el.offsetWidth - ax;
    host.scrollTop = fy * this.el.offsetHeight - ay;
    this.closeText();
    this.draw();
    this.o.onZoom?.(nz);
  }
  destroy() {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.pressTimer);
    document.removeEventListener("pointerdown", this.onDocDown, true);
    this.closeMenu();
    this.closePop();
    this.ro?.disconnect();
    this.view.destroy();
    this.el.remove();
  }

  // ---------------------------------------------------------------- events
  private wire() {
    const el = this.el;
    el.addEventListener("pointerdown", (e) => this.onDown(e));
    el.addEventListener("pointermove", (e) => this.onMove(e));
    el.addEventListener("pointerup", (e) => this.onUp(e));
    el.addEventListener("pointercancel", (e) => this.onUp(e, true));
    el.addEventListener("pointerleave", () => (this.hover.hidden = true));
    el.addEventListener("keydown", (e) => this.onKey(e));
    el.addEventListener("dblclick", (e) => {
      const b = this.hitAt(e.clientX, e.clientY);
      if (b && (b.kind === "text" || b.kind === "callout")) this.openText(b.id);
    });
    // no native drag of images / text selection inside the surface
    el.addEventListener("dragstart", (e) => e.preventDefault());
    // right click: the context menu (long press on touch, see onDown)
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (this.core.gesture) return;
      const b = this.hitAt(e.clientX, e.clientY);
      if (b && !this.core.selection.includes(b.id)) this.core.select([b.id]);
      if (!b && this.core.selection.length) this.core.setSelection([]);
      this.draw();
      this.openMenu(e.clientX, e.clientY);
    });
    // Ctrl / ⌘ + wheel (and a trackpad pinch) zooms about the pointer
    el.addEventListener(
      "wheel",
      (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        this.setZoom(this.zoom * Math.exp(-e.deltaY / 240), [e.clientX, e.clientY]);
      },
      { passive: false },
    );
    document.addEventListener("pointerdown", this.onDocDown, true);
  }
  private onDocDown = (e: PointerEvent) => {
    const t = e.target as Node;
    if (this.menu && !this.menu.contains(t)) this.closeMenu();
    if (this.pop && !this.pop.contains(t) && !this.bar.contains(t)) this.closePop();
  };
  private mods(e: PointerEvent | KeyboardEvent): Mods {
    return {
      shift: e.shiftKey,
      alt: e.altKey,
      meta: isMac ? e.metaKey : e.ctrlKey,
    };
  }
  private hitAt(clientX: number, clientY: number): SlideBlock | null {
    const p = this.view.toSlide(clientX, clientY);
    const tol = 8 / this.view.k;
    const order = [...this.core.canvas.blocks].sort(
      (a, b) => b.frame.z - a.frame.z,
    );
    for (const b of order) {
      if (b.frame.locked || b.hiddenInEditor) continue;
      const f = b.frame;
      if (b.kind === "arrow") continue;
      const bb = aabb(f);
      if (
        p[0] >= bb.x - tol &&
        p[0] <= bb.x + bb.w + tol &&
        p[1] >= bb.y - tol &&
        p[1] <= bb.y + bb.h + tol
      )
        return b;
    }
    return null;
  }
  private onDown(e: PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const t = e.target as HTMLElement;
    if (t.closest(".sle-bar") || t.closest(".sle-text") || t.closest(".sle-menu") || t.closest(".sle-pop")) return;
    this.closeMenu();
    this.closePop();
    if (e.pointerType === "touch") {
      this.touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (this.touches.size === 1) this.preSel = [...this.core.selection];
      if (this.touches.size === 2) {
        // a second finger: the gesture becomes a pinch (zoom + pan), the first finger's drag is undone
        clearTimeout(this.pressTimer);
        if (this.core.gesture) this.core.cancel();
        this.core.setSelection(this.preSel);
        this.lastTap = null;
        this.pointer = null;
        this.el.classList.remove("is-dragging");
        const [a, b] = [...this.touches.values()];
        const host = this.el.parentElement;
        this.pinch = {
          d0: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1,
          z0: this.zoom,
          c0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
          sx: host?.scrollLeft ?? 0,
          sy: host?.scrollTop ?? 0,
        };
        try {
          this.el.setPointerCapture(e.pointerId);
        } catch {
          /* synthetic */
        }
        e.preventDefault();
        this.draw();
        return;
      }
      // a long press without moving opens the context menu (an iPad has no right click)
      const x0 = e.clientX;
      const y0 = e.clientY;
      clearTimeout(this.pressTimer);
      this.pressTimer = window.setTimeout(() => {
        const p = this.touches.get(e.pointerId);
        if (!p || Math.hypot(p[0] - x0, p[1] - y0) > 10 || this.touches.size !== 1) return;
        if (this.core.gesture) this.core.cancel();
        this.pointer = null;
        this.el.classList.remove("is-dragging");
        this.lastTap = null;
        const b = this.hitAt(x0, y0);
        if (b && !this.core.selection.includes(b.id)) this.core.select([b.id]);
        this.draw();
        this.openMenu(x0, y0);
      }, 520);
    }
    if (this.textEd) this.closeText();
    this.el.focus({ preventScroll: true });
    const p = this.view.toSlide(e.clientX, e.clientY);
    const h = t.closest<HTMLElement>("[data-handle]");
    if (h) {
      const kind = h.dataset.handle!;
      if (kind === "rotate") this.core.beginRotate();
      else if (kind === "from" || kind === "to") this.core.beginArrowEnd(kind);
      else if (kind === "target") this.core.beginTarget();
      else this.core.beginResize(kind as Handle, p);
    } else {
      const kind = this.core.pointerDown(p, this.mods(e), 10 / this.view.k);
      // a second tap or click on the same text block opens the text editor (touch has no dblclick)
      if (kind === "move") {
        const b = this.core.single();
        const now = performance.now();
        if (
          b &&
          this.lastTap &&
          this.lastTap.id === b.id &&
          now - this.lastTap.t < 380 &&
          (b.kind === "text" || b.kind === "callout")
        ) {
          this.core.pointerUp();
          this.lastTap = null;
          this.openText(b.id);
          e.preventDefault();
          return;
        }
        this.lastTap = b ? { id: b.id, t: now } : null;
      }
    }
    if (this.core.gesture) {
      this.pointer = e.pointerId;
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events */
      }
      this.el.classList.add("is-dragging");
      e.preventDefault();
    }
    this.draw();
  }
  private onMove(e: PointerEvent) {
    if (e.pointerType === "touch" && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, [e.clientX, e.clientY]);
      if (this.pinch && this.touches.size >= 2) {
        const [a, b] = [...this.touches.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        const c: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const pz = this.pinch;
        this.setZoom(pz.z0 * (d / pz.d0), pz.c0);
        const host = this.el.parentElement;
        if (host) {
          host.scrollLeft += pz.c0[0] - c[0];
          host.scrollTop += pz.c0[1] - c[1];
          pz.c0 = c;
        }
        return;
      }
    }
    if (this.core.gesture && e.pointerId === this.pointer) {
      this.core.pointerMove(
        this.view.toSlide(e.clientX, e.clientY),
        this.mods(e),
      );
      return;
    }
    if (e.pointerType === "mouse" && !e.buttons)
      this.drawHover(this.hitAt(e.clientX, e.clientY));
  }
  private onUp(e: PointerEvent, cancelled = false) {
    if (e.pointerType === "touch") {
      this.touches.delete(e.pointerId);
      clearTimeout(this.pressTimer);
      if (this.pinch) {
        if (this.touches.size < 2) this.pinch = null;
        return;
      }
    }
    if (e.pointerId !== this.pointer) return;
    this.pointer = null;
    if (cancelled) this.core.cancel();
    else this.core.pointerUp();
    this.el.classList.remove("is-dragging");
    try {
      this.el.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    this.draw();
  }
  private onKey(e: KeyboardEvent) {
    if (this.textEd) return;
    if (e.key === "Escape" && this.core.gesture) {
      this.core.cancel();
      this.draw();
      e.preventDefault();
      return;
    }
    // The surface is one tab stop: arrows / Enter pick a block, Tab walks the blocks and then leaves
    const nav = surfaceNav(
      e,
      this.core.selection,
      this.core.canvas.blocks.filter((b) => !b.hiddenInEditor).map((b) => b.id),
    );
    if (nav) {
      if (nav.select) this.core.setSelection(nav.select);
      if (!nav.leave) e.preventDefault();
      return;
    }
    // Escape with nothing selected: nothing to do here (focus stays on the surface; Tab then leaves)
    const cmd = keyCommand(e, this.core.grid);
    if (!cmd) return;
    if (this.run(cmd)) e.preventDefault();
  }

  // ---------------------------------------------------------------- drawing the overlay
  private schedule() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  }
  private draw() {
    if (this.core.canvas !== this.shown) {
      this.shown = this.core.canvas;
      this.view.update(this.core.canvas);
    }
    const k = this.view.k;
    const dragging = !!this.core.gesture && this.core.gesture !== "marquee";
    this.drawGrid(dragging);
    for (const n of [
      ...this.overlay.querySelectorAll(".sle-sel, .sle-box, .sle-pt, .sle-rv"),
    ])
      n.remove();
    this.drawReveals();
    const sel = this.core.selected;
    const multi = sel.length > 1;
    for (const b of sel) {
      if (b.kind === "arrow") {
        if (!multi && !b.frame.locked) {
          this.overlay.append(
            this.point(b.from, "from"),
            this.point(b.to, "to"),
          );
        }
        const f = this.frameDiv(b, "sle-sel is-arrow");
        this.overlay.append(f);
        continue;
      }
      const f = this.frameDiv(
        b,
        `sle-sel${b.frame.locked ? " is-locked" : ""}${multi ? " is-multi" : ""}`,
      );
      if (!multi && !b.frame.locked) {
        for (const hd of HANDLES) {
          const [hx, hy] = HANDLE_POS[hd];
          // edge handles only when the side is long enough on screen
          const side = hx === 0.5 ? b.frame.w * k : b.frame.h * k;
          if ((hx === 0.5 || hy === 0.5) && side < 96) continue;
          const h = mk("div", `sle-h h-${hd}`);
          h.dataset.handle = hd;
          h.style.left = `${hx * 100}%`;
          h.style.top = `${hy * 100}%`;
          f.append(h);
        }
        const r = mk("div", "sle-h sle-rot");
        r.dataset.handle = "rotate";
        r.title = tx("rotate", this.lang);
        f.append(r);
        if (b.frame.rot) {
          const deg = mk("div", "sle-deg");
          deg.textContent = `${Math.round(b.frame.rot)}°`;
          f.append(deg);
        }
      }
      if (b.frame.locked) f.append(icon("lock"));
      this.overlay.append(f);
      if (!multi && b.kind === "callout" && b.target && !b.frame.locked)
        this.overlay.append(this.point(b.target, "target"));
    }
    if (multi) {
      const box = this.core.selectionBox;
      if (box) {
        const d = mk("div", "sle-box");
        const [x, y] = this.view.toView([box.x, box.y]);
        Object.assign(d.style, {
          left: `${x}px`,
          top: `${y}px`,
          width: `${box.w * k}px`,
          height: `${box.h * k}px`,
        });
        if (sel.some((b) => !b.frame.locked))
          for (const hd of ["nw", "ne", "se", "sw"] as Handle[]) {
            const [hx, hy] = HANDLE_POS[hd];
            const h = mk("div", `sle-h h-${hd}`);
            h.dataset.handle = hd;
            h.style.left = `${hx * 100}%`;
            h.style.top = `${hy * 100}%`;
            d.append(h);
          }
        this.overlay.append(d);
      }
    }
    this.drawGuides();
    const m = this.core.marqueeBox;
    this.marq.hidden = !m;
    if (m) {
      const [x, y] = this.view.toView([m.x, m.y]);
      Object.assign(this.marq.style, {
        left: `${x}px`,
        top: `${y}px`,
        width: `${m.w * k}px`,
        height: `${m.h * k}px`,
      });
    }
    if (dragging) this.hover.hidden = true;
    this.drawBar();
    if (this.textEd) this.placeText();
    if (this.zoom > 1) this.el.classList.add("is-zoomed");
    else this.el.classList.remove("is-zoomed");
  }
  /** Reveal order badges (one per group and order), just outside each block's top-left corner. */
  private drawReveals() {
    const seen = new Set<string>();
    const EV: Record<string, string> = { answered: "?", goalMet: "✓", presenter: "P", yourTurnDone: "↩" };
    const all = this.core.canvas.blocks;
    // badges only while the build order is being looked at (Reveal preview) or for the selected blocks' groups:
    // never a row of numbers over the slide's own numbers
    const selKeys = new Set(this.core.selected.map((b) => b.frame.group ?? b.id));
    const showAll = this.revealShown !== null;
    const blocks = [...all].sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x);
    for (const b of blocks) {
      const r = b.reveal;
      if (!r?.order || b.hiddenInEditor) continue;
      const gk = b.frame.group ?? b.id;
      if (!showAll && !selKeys.has(gk)) continue;
      const key = `${gk}:${r.order}:${r.when ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const when = r.when ?? "click";
      const d = mk("div", `sle-rv${when !== "click" ? " ev" : ""}`);
      d.textContent = when === "click" ? String(r.order) : when.startsWith("afterCheck") ? "✓" : (EV[when] ?? "•");
      d.title = `${tx("reveal", this.lang)} ${r.order}`;
      // the whole group's box (a marker + its heading + its line), badge just outside its top-left corner
      const mates = b.frame.group
        ? all.filter((x) => x.frame.group === b.frame.group && x.reveal?.order === r.order)
        : [b];
      const boxes = mates.map((x) => aabb(x.frame));
      const bx = Math.min(...boxes.map((q) => q.x));
      const by = Math.min(...boxes.map((q) => q.y));
      const [x, y] = this.view.toView([bx, by]);
      d.style.left = `${x - 14}px`;
      d.style.top = `${y - 14}px`;
      this.overlay.append(d);
    }
  }
  private frameDiv(b: SlideBlock, cls: string): HTMLDivElement {
    const d = mk("div", cls);
    const k = this.view.k;
    const [x, y] = this.view.toView([b.frame.x, b.frame.y]);
    Object.assign(d.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${b.frame.w * k}px`,
      height: `${b.frame.h * k}px`,
      transform: b.frame.rot ? `rotate(${b.frame.rot}deg)` : "",
    });
    return d;
  }
  private point(p: Pt, kind: "from" | "to" | "target"): HTMLDivElement {
    const d = mk("div", `sle-h sle-pt is-${kind}`);
    d.dataset.handle = kind;
    const [x, y] = this.view.toView(p);
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    return d;
  }
  private drawHover(b: SlideBlock | null) {
    if (!b || this.core.selection.includes(b.id)) {
      this.hover.hidden = true;
      return;
    }
    const k = this.view.k;
    const [x, y] = this.view.toView([b.frame.x, b.frame.y]);
    Object.assign(this.hover.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${b.frame.w * k}px`,
      height: `${b.frame.h * k}px`,
      transform: b.frame.rot ? `rotate(${b.frame.rot}deg)` : "",
    });
    this.hover.hidden = false;
  }
  private drawGuides() {
    const g = this.guidesSvg;
    g.replaceChildren();
    const k = this.view.k;
    const line = (x1: number, y1: number, x2: number, y2: number, cls: string) => {
      const l = document.createElementNS(SVGNS, "line");
      l.setAttribute("x1", String(x1));
      l.setAttribute("y1", String(y1));
      l.setAttribute("x2", String(x2));
      l.setAttribute("y2", String(y2));
      l.setAttribute("class", cls);
      g.append(l);
    };
    for (const gd of this.core.guides) {
      if (gd.kind === "gap" && gd.segs) {
        // equal spacing: a dimension line with end ticks in each gap, and its size in slide units
        for (const [s0, s1] of gd.segs) {
          const a: Pt = gd.axis === "x" ? [s0, gd.at] : [gd.at, s0];
          const z: Pt = gd.axis === "x" ? [s1, gd.at] : [gd.at, s1];
          const [x1, y1] = this.view.toView(a);
          const [x2, y2] = this.view.toView(z);
          line(x1, y1, x2, y2, "k-gap");
          const t = 6;
          if (gd.axis === "x") {
            line(x1, y1 - t, x1, y1 + t, "k-gap");
            line(x2, y2 - t, x2, y2 + t, "k-gap");
          } else {
            line(x1 - t, y1, x1 + t, y1, "k-gap");
            line(x2 - t, y2, x2 + t, y2, "k-gap");
          }
          if (Math.abs(s1 - s0) * k > 28) {
            const tx0 = document.createElementNS(SVGNS, "g");
            tx0.setAttribute("class", "k-gap-label");
            const cx = (x1 + x2) / 2;
            const cy = (y1 + y2) / 2;
            const label = String(gd.gap ?? Math.round(s1 - s0));
            const r = document.createElementNS(SVGNS, "rect");
            const wpx = 10 + label.length * 7;
            r.setAttribute("x", String(cx - wpx / 2));
            r.setAttribute("y", String(cy - 9));
            r.setAttribute("width", String(wpx));
            r.setAttribute("height", "18");
            r.setAttribute("rx", "9");
            const tt = document.createElementNS(SVGNS, "text");
            tt.setAttribute("x", String(cx));
            tt.setAttribute("y", String(cy + 4));
            tt.setAttribute("text-anchor", "middle");
            tt.textContent = label;
            tx0.append(r, tt);
            g.append(tx0);
          }
        }
        continue;
      }
      const a: Pt = gd.axis === "x" ? [gd.at, gd.from] : [gd.from, gd.at];
      const z: Pt = gd.axis === "x" ? [gd.at, gd.to] : [gd.to, gd.at];
      const [x1, y1] = this.view.toView(a);
      const [x2, y2] = this.view.toView(z);
      line(x1, y1, x2, y2, `k-${gd.kind}`);
    }
    // a size readout next to the box while it is resized (W × H in slide units)
    if (this.core.gesture === "resize") {
      const box = this.core.selectionBox;
      if (box) {
        const [x, y] = this.view.toView([box.x + box.w / 2, box.y + box.h]);
        const label = `${Math.round(box.w)} × ${Math.round(box.h)}`;
        const gr = document.createElementNS(SVGNS, "g");
        gr.setAttribute("class", "k-size-label");
        const r = document.createElementNS(SVGNS, "rect");
        const wpx = 16 + label.length * 7;
        r.setAttribute("x", String(x - wpx / 2));
        r.setAttribute("y", String(y + 12));
        r.setAttribute("width", String(wpx));
        r.setAttribute("height", "22");
        r.setAttribute("rx", "6");
        const tt = document.createElementNS(SVGNS, "text");
        tt.setAttribute("x", String(x));
        tt.setAttribute("y", String(y + 27));
        tt.setAttribute("text-anchor", "middle");
        tt.textContent = label;
        gr.append(r, tt);
        g.append(gr);
      }
    }
  }
  private drawGrid(on: boolean) {
    const g = this.gridSvg;
    g.replaceChildren();
    g.classList.toggle("on", on && this.core.snapOn);
    if (!on || !this.core.snapOn) return;
    const k = this.view.k;
    const step = this.core.grid * k * 2; // every second grid line: 48 units (40 × 22.5 cells)
    if (step < 8) return;
    const [x0, y0] = this.view.toView([0, 0]);
    const pat = document.createElementNS(SVGNS, "pattern");
    pat.setAttribute("id", "sle-grid-pat");
    pat.setAttribute("patternUnits", "userSpaceOnUse");
    pat.setAttribute("width", String(step));
    pat.setAttribute("height", String(step));
    pat.setAttribute("x", String(x0));
    pat.setAttribute("y", String(y0));
    const c = document.createElementNS(SVGNS, "circle");
    c.setAttribute("cx", "0");
    c.setAttribute("cy", "0");
    c.setAttribute("r", "1.2");
    pat.append(c);
    const defs = document.createElementNS(SVGNS, "defs");
    defs.append(pat);
    const r = document.createElementNS(SVGNS, "rect");
    r.setAttribute("x", String(x0));
    r.setAttribute("y", String(y0));
    r.setAttribute("width", String(SLIDE_W * k));
    r.setAttribute("height", String(SLIDE_H * k));
    r.setAttribute("fill", "url(#sle-grid-pat)");
    g.append(defs, r);
  }

  // ---------------------------------------------------------------- context toolbar (the floating format bar)
  private w(key: WKey): string {
    return W[key][this.lang === "fr" ? 1 : 0];
  }
  private tbtn(
    label: string,
    ic: string,
    run: (b: HTMLButtonElement) => void,
    o: { text?: string; on?: boolean; danger?: boolean; cls?: string } = {},
  ): HTMLButtonElement {
    const b = mk(
      "button",
      `sle-tb${o.text ? " has-text" : ""}${o.on ? " on" : ""}${o.danger ? " is-danger" : ""}${o.cls ? ` ${o.cls}` : ""}`,
    );
    b.type = "button";
    b.title = label;
    b.setAttribute("aria-label", label);
    if (o.on !== undefined) b.setAttribute("aria-pressed", String(!!o.on));
    if (ic) b.append(icon(ic));
    if (o.text) {
      const sp = mk("span");
      sp.textContent = o.text;
      b.append(sp);
    }
    b.addEventListener("pointerdown", (e) => e.preventDefault()); // keep the text editor's focus and selection
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      run(b);
    });
    return b;
  }
  private sep(): HTMLElement {
    return mk("span", "sle-tb-sep");
  }
  private drawBar() {
    const sel = this.core.selected;
    const bar = this.bar;
    if (!sel.length || this.core.gesture || this.menu) {
      bar.hidden = true;
      if (!sel.length) this.closePop();
      return;
    }
    bar.replaceChildren();
    const one = this.core.single();
    const allLocked = sel.every((b) => b.frame.locked);
    const run = (c: EditorCommand) => () => {
      this.run(c);
      this.focus();
    };
    const isText = !!one && (one.kind === "text" || one.kind === "callout") && !one.frame.locked;
    if (this.textEd && one && isText) {
      // editing the words: inline marks on the selection, then Done
      bar.append(
        this.tbtn(this.w("bold"), "bold", () => this.markSelection("**")),
        this.tbtn(this.w("italic"), "italic", () => this.markSelection("*")),
        this.tbtn(this.w("list"), "list", () => this.toggleList()),
        this.sep(),
        this.tbtn(this.w("done"), "check", () => {
          this.closeText();
          this.focus();
        }, { text: this.w("done"), cls: "is-primary" }),
      );
    } else {
      if (isText && one) {
        bar.append(
          this.tbtn(tx("editText", this.lang), "edit", () => this.openText(one.id), { text: tx("editText", this.lang), cls: "has-label" }),
        );
        if (one.kind === "text") {
          const cur = STYLES.find((x) => x[0] === one.style) ?? STYLES.find((x) => x[0] === "body")!;
          bar.append(
            this.tbtn(this.w("style"), "", (b) => this.stylePop(b, one.id), {
              text: cur[this.lang === "fr" ? 2 : 1],
              cls: "is-drop",
            }),
          );
          const plain = (one.text[this.lang === "fr" ? "fr" : "en"] ?? one.text.en ?? "").trim();
          const boldAll = /^\*\*[\s\S]*\*\*$/.test(plain);
          bar.append(
            this.tbtn(this.w("bold"), "bold", () => this.wrapAll(one.id, "**"), { on: boldAll }),
            this.tbtn(this.w("italic"), "italic", () => this.wrapAll(one.id, "*"), { on: !boldAll && /^\*[^*][\s\S]*\*$/.test(plain) }),
          );
          const al = one.align ?? "left";
          const nextAl = al === "left" ? "center" : al === "center" ? "right" : "left";
          bar.append(
            this.tbtn(this.w("align"), al === "left" ? "alignL" : al === "center" ? "alignC" : "alignR", () => {
              this.core.updateBlock(one.id, { align: nextAl } as Partial<SlideBlock>);
              this.focus();
            }),
          );
          const sw = this.tbtn(this.w("color"), "", (b) => this.colorPop(b, one.id), { cls: "is-swatch" });
          const dot = mk("i", "sle-sw");
          dot.style.background = themeColor(one.color ?? null, this.view.theme, "text");
          sw.append(dot);
          bar.append(sw);
        }
        bar.append(this.sep());
      }
      if (!allLocked) {
        bar.append(
          this.tbtn(this.w("arrange"), "arrange", (b) => this.arrangePop(b)),
          this.tbtn(tx("duplicate", this.lang), "duplicate", run({ k: "duplicate" })),
        );
        if (sel.length > 1 && !sel.every((b) => b.frame.group && b.frame.group === sel[0].frame.group))
          bar.append(this.tbtn(tx("group", this.lang), "group", run({ k: "group" })));
        else if (sel.some((b) => b.frame.group))
          bar.append(this.tbtn(tx("ungroup", this.lang), "ungroup", run({ k: "ungroup" })));
      }
      bar.append(
        this.tbtn(tx(allLocked ? "unlock" : "lock", this.lang), allLocked ? "unlock" : "lock", run({ k: "toggleLock" }), { on: allLocked }),
      );
      if (!allLocked) bar.append(this.tbtn(tx("delete", this.lang), "delete", run({ k: "delete" }), { danger: true }));
      bar.append(
        this.tbtn(this.w("more"), "more", (b) => {
          const r = b.getBoundingClientRect();
          this.openMenu(r.left, r.bottom + 6);
        }),
      );
    }
    bar.hidden = false;
    this.placeBar();
  }
  /** Above the selection, else below it; kept inside the visible part of the surface. */
  private placeBar() {
    const bar = this.bar;
    const box = this.core.selectionBox;
    if (!box || bar.hidden) return;
    const host = this.el.parentElement;
    const vx0 = host && this.zoom > 1 ? host.scrollLeft : 0;
    const vy0 = host && this.zoom > 1 ? host.scrollTop : 0;
    const vw = host && this.zoom > 1 ? host.clientWidth : this.el.clientWidth;
    const vh = host && this.zoom > 1 ? host.clientHeight : this.el.clientHeight;
    const [x, y] = this.view.toView([box.x + box.w / 2, box.y]);
    const bw = bar.offsetWidth || 300;
    const bh = bar.offsetHeight || 52;
    let top = y - bh - 30;
    if (top < vy0 + 6) top = this.view.toView([0, box.y + box.h])[1] + 18;
    top = Math.min(top, vy0 + vh - bh - 6);
    const left = Math.max(vx0 + 6, Math.min(vx0 + vw - bw - 6, x - bw / 2));
    bar.style.left = `${left}px`;
    bar.style.top = `${Math.max(vy0 + 6, top)}px`;
  }

  // ---------------------------------------------------------------- popovers of the format bar
  private openPopAt(anchor: HTMLElement, body: HTMLElement, cls = "") {
    this.closePop();
    this.closeMenu();
    const p = mk("div", `sle-pop${cls ? ` ${cls}` : ""}`);
    p.append(body);
    this.el.append(p);
    this.pop = p;
    const er = this.el.getBoundingClientRect();
    const ar = anchor.getBoundingClientRect();
    const pw = p.offsetWidth;
    const ph = p.offsetHeight;
    let left = ar.left - er.left;
    let top = ar.bottom - er.top + 8;
    left = Math.max(6, Math.min(this.el.clientWidth - pw - 6, left));
    if (top + ph > this.el.clientHeight - 6) top = ar.top - er.top - ph - 8;
    p.style.left = `${left}px`;
    p.style.top = `${Math.max(6, top)}px`;
    anchor.setAttribute("aria-expanded", "true");
  }
  closePop() {
    this.pop?.remove();
    this.pop = null;
    this.bar.querySelectorAll('[aria-expanded="true"]').forEach((x) => x.setAttribute("aria-expanded", "false"));
  }
  private stylePop(anchor: HTMLElement, id: string) {
    const b = this.core.canvas.blocks.find((x) => x.id === id);
    if (!b || b.kind !== "text") return;
    const list = mk("div", "sle-pop-list");
    list.setAttribute("role", "listbox");
    for (const [style, en, fr] of STYLES) {
      const it = mk("button", `sle-pop-it${b.style === style ? " on" : ""}`);
      it.type = "button";
      it.setAttribute("role", "option");
      it.setAttribute("aria-selected", String(b.style === style));
      const css = typeCss(this.view.theme, style as never);
      const sample = mk("span", "sle-pop-sample");
      sample.textContent = this.lang === "fr" ? fr : en;
      sample.style.fontWeight = css["font-weight"];
      sample.style.fontSize = `${Math.max(13, Math.min(26, parseFloat(css["font-size"]) * 0.3))}px`;
      if (css["text-transform"] === "uppercase") {
        sample.style.textTransform = "uppercase";
        sample.style.letterSpacing = "0.1em";
      }
      if (style === "formula" || style === "quote") sample.style.fontStyle = "italic";
      const size = mk("small");
      size.textContent = `${Math.round(parseFloat(css["font-size"]))}`;
      it.append(sample, size);
      it.addEventListener("click", () => {
        this.core.updateBlock(id, { style } as Partial<SlideBlock>);
        this.closePop();
        this.focus();
      });
      list.append(it);
    }
    this.openPopAt(anchor, list, "is-styles");
  }
  private colorPop(anchor: HTMLElement, id: string) {
    const b = this.core.canvas.blocks.find((x) => x.id === id);
    if (!b || b.kind !== "text") return;
    const grid = mk("div", "sle-pop-sw");
    const names: Record<string, [string, string]> = {
      text: ["Ink", "Encre"],
      ink2: ["Body", "Texte"],
      muted: ["Muted", "Discret"],
      accent: ["Accent", "Accent"],
      path: ["Path (magenta)", "Trajectoire (magenta)"],
      sel: ["Selected (cyan)", "Sélection (cyan)"],
      nav: ["Nav (green)", "Nav (vert)"],
      key: ["Key (amber)", "Clé (ambre)"],
      stop: ["Limit (red)", "Limite (rouge)"],
    };
    for (const tok of COLOR_TOKENS) {
      const it = mk("button", `sle-sw-b${(b.color ?? "text") === tok ? " on" : ""}`);
      it.type = "button";
      const nm = names[tok][this.lang === "fr" ? 1 : 0];
      it.title = nm;
      it.setAttribute("aria-label", nm);
      it.style.setProperty("--sw", themeColor(tok, this.view.theme, "text"));
      it.addEventListener("click", () => {
        this.core.updateBlock(id, (x) => {
          if (x.kind !== "text") return x;
          if (tok === "text") delete x.color;
          else x.color = tok;
          return x;
        });
        this.closePop();
        this.focus();
      });
      grid.append(it);
    }
    const note = mk("p", "sle-pop-note");
    note.textContent =
      this.lang === "fr"
        ? "Les couleurs suivent le thème du cours. Magenta = trajectoire, cyan = sélection, vert = nav, ambre = à retenir."
        : "Colours follow the course theme. Magenta = path, cyan = selected, green = nav, amber = remember.";
    const box = mk("div");
    box.append(grid, note);
    this.openPopAt(anchor, box, "is-colors");
  }
  /** Position: align (to each other, or the slide), spread evenly, same size, layer order. */
  private arrangePop(anchor: HTMLElement) {
    const sel = this.core.selected;
    const n = new Set(sel.map((b) => b.frame.group ?? b.id)).size;
    const box = mk("div", "sle-arrange");
    const row = (title: string, items: [WKey, string, EditorCommand, boolean?][]) => {
      const h3 = mk("div", "sle-pop-h");
      h3.textContent = title;
      const r = mk("div", "sle-pop-row");
      for (const [key, ic, cmd, off] of items) {
        const b = this.tbtn(this.w(key), ic, () => {
          this.run(cmd);
          this.closePop();
          this.focus();
        });
        if (off) b.disabled = true;
        r.append(b);
      }
      box.append(h3, r);
    };
    const to = n > 1 ? undefined : ("slide" as const);
    row(n > 1 ? this.w("alignTo") : `${this.w("alignTo")} · ${this.w("toSlide").toLowerCase()}`, [
      ["left", "aL", { k: "align", how: "left", to }],
      ["hcenter", "aC", { k: "align", how: "hcenter", to }],
      ["right", "aR", { k: "align", how: "right", to }],
      ["top", "aT", { k: "align", how: "top", to }],
      ["vcenter", "aM", { k: "align", how: "vcenter", to }],
      ["bottom", "aB", { k: "align", how: "bottom", to }],
    ]);
    if (n > 1) {
      row(this.w("spread"), [
        ["distH", "dH", { k: "distribute", axis: "h" }, n < 3],
        ["distV", "dV", { k: "distribute", axis: "v" }, n < 3],
        ["sameW", "sameW", { k: "match", dim: "w" }],
        ["sameH", "sameH", { k: "match", dim: "h" }],
        ["center", "center", { k: "center" }],
      ]);
    } else row(this.w("center"), [["center", "center", { k: "center" }]]);
    row(tx("front", this.lang), [
      ["forward", "forward", { k: "z", how: "forward" }],
      ["backward", "backward", { k: "z", how: "backward" }],
    ]);
    const fb = box.querySelector(".sle-pop-row:last-child");
    if (fb) {
      const f = this.tbtn(tx("front", this.lang), "front", () => {
        this.run({ k: "z", how: "front" });
        this.closePop();
      });
      const bk = this.tbtn(tx("back", this.lang), "back", () => {
        this.run({ k: "z", how: "back" });
        this.closePop();
      });
      fb.prepend(f);
      fb.append(bk);
    }
    this.openPopAt(anchor, box, "is-arrange");
  }

  // ---------------------------------------------------------------- context menu (right click, long press)
  /** The items for the current selection (or the empty slide). Exposed for tests and the host. */
  menuItems(): CanvasMenuItem[] {
    const sel = this.core.selected;
    const fr = this.lang === "fr";
    const k = (mac: string) => (isMac ? mac : mac.replace("⌘", "Ctrl+"));
    const cmd = (c: EditorCommand) => () => {
      this.run(c);
      this.focus();
    };
    if (!sel.length) {
      return [
        { label: this.w("paste"), icon: "paste", kbd: k("⌘V"), run: cmd({ k: "paste" }) },
        { label: this.w("selectAll"), icon: "multi", kbd: k("⌘A"), run: cmd({ k: "selectAll" }) },
        {
          label: this.core.multiSelect ? this.w("multiOff") : this.w("multi"),
          icon: "multi",
          run: () => this.setMultiSelect(!this.core.multiSelect),
        },
        ...(this.o.slideMenu?.() ?? []),
      ];
    }
    const locked = sel.every((b) => b.frame.locked);
    const one = this.core.single();
    const grouped = sel.some((b) => b.frame.group);
    const out: CanvasMenuItem[] = [];
    if (one && (one.kind === "text" || one.kind === "callout") && !locked)
      out.push({ label: tx("editText", this.lang), icon: "edit", kbd: "↵", run: () => this.openText(one.id) });
    out.push(
      { label: this.w("copy"), icon: "copy", kbd: k("⌘C"), run: cmd({ k: "copy" }) },
      { label: this.w("cut"), icon: "cut", kbd: k("⌘X"), disabled: locked, run: cmd({ k: "cut" }) },
      { label: this.w("paste"), icon: "paste", kbd: k("⌘V"), run: cmd({ k: "paste" }) },
      { label: tx("duplicate", this.lang), icon: "duplicate", kbd: k("⌘D"), disabled: locked, run: cmd({ k: "duplicate" }) },
    );
    if (sel.length > 1 && !grouped) out.push({ label: tx("group", this.lang), icon: "group", kbd: k("⌘G"), run: cmd({ k: "group" }) });
    if (grouped) out.push({ label: tx("ungroup", this.lang), icon: "ungroup", kbd: k("⇧⌘G"), run: cmd({ k: "ungroup" }) });
    out.push(
      { label: tx("front", this.lang), icon: "front", kbd: k("⌘]"), disabled: locked, run: cmd({ k: "z", how: "front" }) },
      { label: tx("back", this.lang), icon: "back", kbd: k("⌘["), disabled: locked, run: cmd({ k: "z", how: "back" }) },
      { label: this.w("center"), icon: "center", disabled: locked, run: cmd({ k: "center" }) },
      {
        label: tx(locked ? "unlock" : "lock", this.lang),
        icon: locked ? "unlock" : "lock",
        kbd: k("⌘L"),
        run: cmd({ k: "toggleLock" }),
      },
      {
        label: this.core.multiSelect ? this.w("multiOff") : this.w("multi"),
        icon: "multi",
        run: () => this.setMultiSelect(!this.core.multiSelect),
      },
      { label: tx("delete", this.lang), icon: "delete", kbd: fr ? "Suppr" : "Del", danger: true, disabled: locked, run: cmd({ k: "delete" }) },
    );
    return out;
  }
  openMenu(clientX: number, clientY: number) {
    this.closeMenu();
    this.closePop();
    const items = this.menuItems();
    if (!items.length) return;
    const m = mk("div", "sle-menu");
    m.setAttribute("role", "menu");
    for (const it of items) {
      const b = mk("button", `sle-menu-it${it.danger ? " is-danger" : ""}`);
      b.type = "button";
      b.setAttribute("role", "menuitem");
      b.disabled = !!it.disabled;
      if (it.icon && ICON[it.icon]) b.append(icon(it.icon));
      else b.append(mk("span", "sle-ic"));
      const l = mk("span", "sle-menu-l");
      l.textContent = it.label;
      b.append(l);
      if (it.kbd) {
        const kb = mk("kbd");
        kb.textContent = it.kbd;
        b.append(kb);
      }
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        this.closeMenu();
        it.run();
        this.draw();
      });
      m.append(b);
    }
    m.addEventListener("keydown", (e) => {
      e.stopPropagation();
      const list = [...m.querySelectorAll<HTMLButtonElement>(".sle-menu-it:not(:disabled)")];
      const i = list.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === "Escape") {
        e.preventDefault();
        this.closeMenu();
        this.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const j = (i + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
        list[j]?.focus();
      }
    });
    this.el.append(m);
    this.menu = m;
    // one menu at a time: the floating format bar steps aside while the context menu is open
    this.bar.hidden = true;
    const er = this.el.getBoundingClientRect();
    const host = this.el.parentElement;
    const vx0 = host && this.zoom > 1 ? host.scrollLeft : 0;
    const vy0 = host && this.zoom > 1 ? host.scrollTop : 0;
    const vw = host && this.zoom > 1 ? host.clientWidth : this.el.clientWidth;
    const vh = host && this.zoom > 1 ? host.clientHeight : this.el.clientHeight;
    let x = clientX - er.left;
    let y = clientY - er.top;
    x = Math.max(vx0 + 6, Math.min(vx0 + vw - m.offsetWidth - 6, x));
    if (y + m.offsetHeight > vy0 + vh - 6) y = Math.max(vy0 + 6, y - m.offsetHeight);
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    requestAnimationFrame(() => m.querySelector<HTMLButtonElement>(".sle-menu-it:not(:disabled)")?.focus({ preventScroll: true }));
  }
  closeMenu() {
    const had = !!this.menu;
    this.menu?.remove();
    this.menu = null;
    if (had) this.schedule();
  }

  // ---------------------------------------------------------------- text marks
  /** Bold / italic for the whole block (no text editor open): wrap or unwrap the words in **…** or *…*. */
  private wrapAll(id: string, mark: "**" | "*") {
    const b = this.core.canvas.blocks.find((x) => x.id === id);
    if (!b || (b.kind !== "text" && b.kind !== "callout")) return;
    const lang = this.lang === "fr" ? "fr" : "en";
    const cur = (b.text[lang] ?? (lang === "fr" ? b.text.en : "") ?? "").trim();
    const isBold = /^\*\*[\s\S]*\*\*$/.test(cur);
    const isItal = !isBold && /^\*[^*][\s\S]*\*$/.test(cur);
    let next: string;
    if (mark === "**") next = isBold ? cur.slice(2, -2) : `**${cur}**`;
    else next = isItal ? cur.slice(1, -1) : `*${cur}*`;
    this.core.updateBlock(id, { text: { ...b.text, [lang]: next } } as Partial<SlideBlock>);
    this.focus();
  }
  /** Bold / italic on the text editor's selection (or the word at the caret). */
  private markSelection(mark: string) {
    const ta = this.textEd?.ta;
    if (!ta) return;
    let { selectionStart: s0, selectionEnd: s1 } = ta;
    const v = ta.value;
    if (s0 === s1) {
      while (s0 > 0 && /\S/.test(v[s0 - 1])) s0--;
      while (s1 < v.length && /\S/.test(v[s1])) s1++;
    }
    const inner = v.slice(s0, s1);
    const wrapped = v.slice(s0 - mark.length, s0) === mark && v.slice(s1, s1 + mark.length) === mark;
    if (wrapped) {
      ta.value = v.slice(0, s0 - mark.length) + inner + v.slice(s1 + mark.length);
      ta.setSelectionRange(s0 - mark.length, s1 - mark.length);
    } else {
      ta.value = v.slice(0, s0) + mark + inner + mark + v.slice(s1);
      ta.setSelectionRange(s0 + mark.length, s1 + mark.length);
    }
    ta.dispatchEvent(new Event("input"));
    ta.focus({ preventScroll: true });
  }
  /** Bulleted list on the lines of the selection ("- " in front of each line, or off again). */
  private toggleList() {
    const ta = this.textEd?.ta;
    if (!ta) return;
    const v = ta.value;
    const a = v.lastIndexOf("\n", ta.selectionStart - 1) + 1;
    let z = v.indexOf("\n", ta.selectionEnd);
    if (z < 0) z = v.length;
    const lines = v.slice(a, z).split("\n");
    const on = lines.every((l) => /^\s*[-•]\s/.test(l));
    const next = lines.map((l) => (on ? l.replace(/^\s*[-•]\s/, "") : `- ${l}`)).join("\n");
    ta.value = v.slice(0, a) + next + v.slice(z);
    ta.setSelectionRange(a, a + next.length);
    ta.dispatchEvent(new Event("input"));
    ta.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- in-place text editing
  /** Edit a text or callout block's words in place (the raw inline syntax: **bold**, *italic*, lists). */
  openText(id: string) {
    const b = this.core.canvas.blocks.find((x) => x.id === id);
    if (!b || (b.kind !== "text" && b.kind !== "callout") || b.frame.locked)
      return;
    this.closeText();
    this.core.select([id]);
    const ta = mk("textarea", "sle-text");
    ta.value = (this.lang === "fr" ? b.text.fr : b.text.en) ?? "";
    if (this.lang === "fr" && !b.text.fr) ta.placeholder = b.text.en;
    ta.setAttribute(
      "aria-label",
      `${tx("editText", this.lang)}: ${blockLabel(b, this.lang)}`,
    );
    ta.spellcheck = true;
    ta.lang = this.lang;
    this.textEd = { id, ta };
    this.el.append(ta);
    this.placeText();
    ta.addEventListener("input", () => {
      const cur = this.core.canvas.blocks.find((x) => x.id === id);
      if (!cur || (cur.kind !== "text" && cur.kind !== "callout")) return;
      const text = { ...cur.text, [this.lang]: ta.value };
      if (this.lang === "en" && !text.en) text.en = "";
      this.core.updateBlock(id, { text } as Partial<SlideBlock>, `text:${id}`);
    });
    ta.addEventListener("keydown", (e) => {
      e.stopPropagation();
      const meta = isMac ? e.metaKey : e.ctrlKey;
      if (e.key === "Escape" || (e.key === "Enter" && meta)) {
        e.preventDefault();
        this.closeText();
        this.focus();
        return;
      }
      if (meta && (e.key === "b" || e.key === "i")) {
        e.preventDefault();
        const mark = e.key === "b" ? "**" : "*";
        const { selectionStart: s, selectionEnd: t, value } = ta;
        ta.value =
          value.slice(0, s) + mark + value.slice(s, t) + mark + value.slice(t);
        ta.setSelectionRange(s + mark.length, t + mark.length);
        ta.dispatchEvent(new Event("input"));
      }
    });
    ta.addEventListener("blur", () =>
      setTimeout(() => this.textEd?.ta === ta && this.closeText(), 0),
    );
    this.drawBar();
    requestAnimationFrame(() => {
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  }
  private placeText() {
    const ed = this.textEd;
    if (!ed) return;
    const b = this.core.canvas.blocks.find((x) => x.id === ed.id);
    if (!b || (b.kind !== "text" && b.kind !== "callout"))
      return this.closeText();
    const k = this.view.k;
    const [x, y] = this.view.toView([b.frame.x, b.frame.y]);
    const css = typeCss(
      this.view.theme,
      b.kind === "text" ? b.style : "body",
      b.kind === "text" ? b.color : undefined,
    );
    const fs =
      parseFloat(css["font-size"]) * (b.kind === "callout" ? 0.86 : 1) * k;
    const ta = ed.ta;
    Object.assign(ta.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${Math.max(120, b.frame.w * k)}px`,
      minHeight: `${Math.max(44, b.frame.h * k)}px`,
      height: `${Math.max(44, b.frame.h * k)}px`,
      transform: b.frame.rot ? `rotate(${b.frame.rot}deg)` : "",
      fontFamily: css["font-family"],
      fontWeight: css["font-weight"],
      fontSize: `${Math.max(12, fs)}px`,
      lineHeight: css["line-height"],
      letterSpacing: css["letter-spacing"],
      textAlign: b.kind === "text" ? (b.align ?? "left") : "left",
      textTransform: css["text-transform"],
      background: this.view.theme.colors.bg,
      color: this.view.theme.colors.text,
    });
    ta.classList.toggle("on-dark", this.view.theme.dark);
    // the raw words can be longer than the rendered ones (a cover title split at its colon, list marks): the
    // editor shrinks its type until they fit the frame, never under 12 px
    let size = Math.max(12, fs);
    for (let i = 0; i < 14 && ta.scrollHeight > ta.clientHeight + 2 && size > 12; i++) {
      size = Math.max(12, size * 0.88);
      ta.style.fontSize = `${size}px`;
    }
  }
  closeText() {
    const ed = this.textEd;
    if (!ed) return;
    this.textEd = null;
    ed.ta.remove();
    this.core.history.seal();
    this.o.onChange?.(this.core.canvas, true);
    this.schedule();
  }
  private announce() {
    const sel = this.core.selected;
    this.live.textContent = !sel.length
      ? tx("noSelection", this.lang)
      : sel.length === 1
        ? blockLabel(sel[0], this.lang).slice(0, 120) ||
          loc(undefined, this.lang)
        : `${sel.length} ${tx("selected", this.lang)}`;
  }
}
