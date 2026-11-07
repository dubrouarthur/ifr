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
  type EditorCommand,
  type Mods,
} from "./editorCore";
import { SlideView, type SlideRenderOptions } from "./render";
import { typeCss } from "./themes";
import { loc } from "./text";
import { tx, type CanvasString } from "./strings";
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
}

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
  duplicate: "M8 8h11v11H8z M5 16V5h11",
  delete: "M5 7h14 M10 7V4.5h4V7 M7 7l1 13h8l1-13",
  lock: "M7 11h10v9H7z M9 11V8a3 3 0 0 1 6 0v3",
  unlock: "M7 11h10v9H7z M9 11V8a3 3 0 0 1 5.8-1",
  group: "M4 4h7v7H4z M13 13h7v7h-7z M11 7.5h4.5V13",
  ungroup: "M4 4h7v7H4z M13 13h7v7h-7z",
  front: "M9 9h11v11H9z M4 15V4h11",
  back: "M4 4h11v11H4z M20 9v11H9",
  edit: "M4 20h4L19 9l-4-4L4 16z M13 7l4 4",
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
    this.overlay.append(this.gridSvg, this.hover, this.guidesSvg, this.marq);
    this.el.append(this.stage, this.overlay, this.bar, this.live);
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
  previewReveal(n: number | null) {
    this.view.setReveal(n === null ? Infinity : n);
  }
  setLang(l: Lang) {
    this.lang = l;
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
  destroy() {
    cancelAnimationFrame(this.raf);
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
  }
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
    if (t.closest(".sle-bar") || t.closest(".sle-text")) return;
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
    const cmd = keyCommand(e, this.core.grid);
    if (!cmd) return;
    // Tab leaves the canvas when nothing is selected (keyboard users are never trapped)
    if (cmd.k === "cycle" && !this.core.selection.length && e.shiftKey) return;
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
  }
  /** Reveal order badges (one per group and order), just outside each block's top-left corner. */
  private drawReveals() {
    const seen = new Set<string>();
    const EV: Record<string, string> = { answered: "?", goalMet: "✓", presenter: "P", yourTurnDone: "↩" };
    const blocks = [...this.core.canvas.blocks].sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x);
    for (const b of blocks) {
      const r = b.reveal;
      if (!r?.order || b.hiddenInEditor) continue;
      const key = `${b.frame.group ?? b.id}:${r.order}:${r.when ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const when = r.when ?? "click";
      const d = mk("div", `sle-rv${when !== "click" ? " ev" : ""}`);
      d.textContent = when === "click" ? String(r.order) : when.startsWith("afterCheck") ? "✓" : (EV[when] ?? "•");
      d.title = `${tx("reveal", this.lang)} ${r.order}`;
      const bb = aabb(b.frame);
      const [x, y] = this.view.toView([bb.x, bb.y]);
      // outside the block, level with its first line: never on top of the content
      d.style.left = `${x - 17}px`;
      d.style.top = `${y + 11}px`;
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
    for (const gd of this.core.guides) {
      const l = document.createElementNS(SVGNS, "line");
      const a: Pt = gd.axis === "x" ? [gd.at, gd.from] : [gd.from, gd.at];
      const z: Pt = gd.axis === "x" ? [gd.at, gd.to] : [gd.to, gd.at];
      const [x1, y1] = this.view.toView(a);
      const [x2, y2] = this.view.toView(z);
      l.setAttribute("x1", String(x1));
      l.setAttribute("y1", String(y1));
      l.setAttribute("x2", String(x2));
      l.setAttribute("y2", String(y2));
      l.setAttribute("class", `k-${gd.kind}`);
      g.append(l);
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

  // ---------------------------------------------------------------- context toolbar
  private drawBar() {
    const sel = this.core.selected;
    const bar = this.bar;
    if (!sel.length || this.core.gesture || this.textEd) {
      bar.hidden = true;
      return;
    }
    bar.replaceChildren();
    const btn = (
      key: CanvasString,
      ic: string,
      cmd: EditorCommand | (() => void),
      label = false,
    ) => {
      const b = mk("button", `sle-tb${label ? " has-label" : ""}`);
      b.type = "button";
      b.title = tx(key, this.lang);
      b.setAttribute("aria-label", tx(key, this.lang));
      b.append(icon(ic));
      if (label) {
        const sp = mk("span");
        sp.textContent = tx(key, this.lang);
        b.append(sp);
      }
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (typeof cmd === "function") cmd();
        else this.run(cmd);
        this.focus();
      });
      bar.append(b);
      return b;
    };
    const one = this.core.single();
    const allLocked = sel.every((b) => b.frame.locked);
    if (
      one &&
      (one.kind === "text" || one.kind === "callout") &&
      !one.frame.locked
    )
      btn("editText", "edit", () => this.openText(one.id), true);
    if (!allLocked) {
      btn("duplicate", "duplicate", { k: "duplicate" });
      if (
        sel.length > 1 &&
        !sel.every((b) => b.frame.group && b.frame.group === sel[0].frame.group)
      )
        btn("group", "group", { k: "group" });
      else if (sel.some((b) => b.frame.group))
        btn("ungroup", "ungroup", { k: "ungroup" });
      btn("front", "front", { k: "z", how: "front" });
      btn("back", "back", { k: "z", how: "back" });
    }
    btn(allLocked ? "unlock" : "lock", allLocked ? "unlock" : "lock", {
      k: "toggleLock",
    });
    if (!allLocked)
      btn("delete", "delete", { k: "delete" }).classList.add("is-danger");
    bar.hidden = false;
    // above the selection, else below it; kept inside the surface
    const box = this.core.selectionBox!;
    const k = this.view.k;
    const [x, y] = this.view.toView([box.x + box.w / 2, box.y]);
    const W = this.el.clientWidth;
    const bw = bar.offsetWidth || 300;
    const bh = bar.offsetHeight || 52;
    let top = y - bh - 30;
    if (top < 6) top = this.view.toView([0, box.y + box.h])[1] + 14;
    top = Math.min(top, this.el.clientHeight - bh - 6);
    const left = Math.max(6, Math.min(W - bw - 6, x - bw / 2));
    bar.style.left = `${left}px`;
    bar.style.top = `${Math.max(6, top)}px`;
    void k;
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
    });
    ta.classList.toggle("on-dark", this.view.theme.dark);
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
