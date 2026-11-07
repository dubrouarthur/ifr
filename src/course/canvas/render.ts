// Ground school — designed slides: the slide renderer (package N). renderSlide(slide, host, { mode }) draws a
// SlideCanvas into any host (player, projector, editor, thumbnails): a 1920 × 1080 logical root scaled to fit
// (contain, centred), the theme's colour tokens as CSS variables, blocks in reading order (painted by z), reveal
// steps and event reveals, live goal ticks, the school's logo corner, and a HUD layer in real CSS pixels for the
// controls that must stay ≥ 44 px whatever the scale (Your turn, Play). update(slide) re-renders only the blocks
// that changed (a drag in the editor only moves boxes).
import type {
  BlockAction,
  CalcProblem,
  Cockpit,
  Lang,
  Pt,
  SchoolBrand,
  SimScene,
  SlideBinding,
  SlideBlock,
  SlideCanvas,
  SlideTheme,
  Step,
  ThemeId,
  YourTurn,
} from "../types";
import { fitSlide, readingOrder, SLIDE_H, SLIDE_W } from "./geom";
import { color, resolveTheme, themeVars } from "./themes";
import {
  renderBlock,
  blockLabel,
  imageSrc,
  type BlockEnv,
  type BlockView,
  type SlideMode,
  type SlideSlots,
} from "./blocks";
import { SceneSims } from "./instruments";
import { DEMO_SCENE_ID, demoScene } from "./factory";
import { revealSteps } from "./ops";
import { sampleLogoSvg } from "../assets/photos";
import { tx } from "./strings";

export type { SlideMode, SlideSlots } from "./blocks";

export interface SlideRenderOptions {
  mode: SlideMode;
  lang?: Lang;
  /** the course theme: one per course (a slide's own `theme` is ignored, SPEC slides v2 §4) */
  theme?: ThemeId;
  /** the presenter's "Bright projector" toggle: heavier type, mute → ink-2, white paper */
  boost?: boolean;
  brand?: SchoolBrand;
  /** Course.scenes (the demo scene is added for blocks that name none) */
  scenes?: Record<string, SimScene>;
  cockpit?: Cockpit;
  /** share the stage Sims between views (a thumbnail strip): one Sim per scene for all of them */
  sims?: SceneSims;
  assetUrl?: (id: string) => string | null | Promise<string | null>;
  /** the step this slide belongs to (goal checks, calc links) */
  step?: Step;
  calcProblem?: (stepId: string) => CalcProblem | null;
  binding?: (b: SlideBinding) => string | null | undefined;
  slots?: SlideSlots;
  /** a tap on a block with an action (reveal / next are handled here first) */
  onAction?: (a: BlockAction, b: SlideBlock) => void;
  /** a "Your turn" was started (package Q runs it) */
  onYourTurn?: (b: SlideBlock, yt: YourTurn) => void;
  /** Next was pressed past the last reveal */
  onEnd?: () => void;
  /** an event happened on the slide (a quiz "answered", a goal met): the cockpit briefing gates Start on it */
  onEvent?: (when: string) => void;
  /** presenter console: presenterOnly blocks show */
  presenter?: boolean;
  /** play: reveals already shown (default 0) */
  reveal?: number;
  /** padding around the slide in CSS px (default 0) */
  pad?: number;
  /** accessible name of the slide (the step title) */
  label?: string;
}

const mk = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};

/** Which click reveal a block waits for (0 = with the slide), and which event. Pure. */
export function revealOf(b: SlideBlock): {
  click: number;
  event: string | null;
} {
  const r = b.reveal;
  if (!r || !(r.order > 0)) return { click: 0, event: null };
  const when = r.when ?? "click";
  if (when === "click" || when === "presenter")
    return { click: r.order, event: null };
  return { click: 0, event: when };
}
/** The click reveal steps of a slide (sorted orders of click / presenter reveals). */
export function clickSteps(c: SlideCanvas): number[] {
  return revealSteps({
    ...c,
    blocks: c.blocks.filter((b) => revealOf(b).click > 0),
  });
}
/** Is a block visible after `reveal` clicks with these events fired? Pure. */
export function isRevealed(
  b: SlideBlock,
  steps: readonly number[],
  reveal: number,
  events: ReadonlySet<string>,
): boolean {
  const r = revealOf(b);
  if (r.event) return events.has(r.event);
  if (!r.click) return true;
  const upTo = reveal <= 0 ? 0 : steps[Math.min(reveal, steps.length) - 1];
  return r.click <= upTo;
}

/** Signature of what a block draws (a change re-renders it; a move only repositions it). */
function drawSig(b: SlideBlock): string {
  const { frame, ...rest } = b;
  // arrows and callouts store absolute points: their drawing depends on the frame position too
  const pos =
    b.kind === "arrow" || b.kind === "callout" ? `${frame.x},${frame.y}` : "";
  return `${JSON.stringify(rest)}|${frame.w}x${frame.h}|${pos}`;
}

export class SlideView {
  readonly el: HTMLDivElement;
  readonly root: HTMLDivElement;
  readonly hud: HTMLDivElement;
  readonly sims: SceneSims;
  readonly mode: SlideMode;
  theme: SlideTheme;
  slide: SlideCanvas;
  /** current scale (CSS px per logical unit) and the slide's offset in the view */
  k = 1;
  ox = 0;
  oy = 0;
  private views = new Map<string, BlockView>();
  private sigs = new Map<string, string>();
  private hudEls = new Map<string, HTMLElement[]>();
  private bg: HTMLDivElement;
  private brandEl: HTMLDivElement | null = null;
  private ro: ResizeObserver | null = null;
  private timer: number | null = null;
  private steps: number[] = [];
  private revealN: number;
  private events = new Set<string>();
  private checks: boolean[] = [];
  private lang: Lang;
  private ownSims: boolean;
  private destroyed = false;
  constructor(
    private host: HTMLElement,
    slide: SlideCanvas,
    private o: SlideRenderOptions,
  ) {
    this.mode = o.mode;
    this.lang = o.lang ?? "en";
    this.slide = slide;
    this.theme = resolveTheme(o.theme, o.brand, { boost: o.boost });
    const scenes = {
      [DEMO_SCENE_ID]: demoScene(o.cockpit ?? "g1000"),
      ...(o.scenes ?? {}),
    };
    if (o.sims) {
      this.sims = o.sims;
      if (!this.sims.env.scenes[DEMO_SCENE_ID])
        this.sims.env.scenes = {
          ...this.sims.env.scenes,
          [DEMO_SCENE_ID]: scenes[DEMO_SCENE_ID],
        };
      this.ownSims = false;
    } else {
      this.sims = new SceneSims({ scenes, cockpit: o.cockpit });
      this.ownSims = true;
    }
    this.revealN = o.mode === "play" ? (o.reveal ?? 0) : Infinity;
    this.el = mk("div", `sl-view sl-mode-${o.mode}`);
    this.root = mk("div", "sl-slide");
    this.root.style.width = `${SLIDE_W}px`;
    this.root.style.height = `${SLIDE_H}px`;
    this.root.setAttribute(
      "role",
      o.mode === "thumb" ? "presentation" : "group",
    );
    this.root.setAttribute("aria-roledescription", tx("slide", this.lang));
    if (o.label) this.root.setAttribute("aria-label", o.label);
    if (o.mode === "thumb") this.el.setAttribute("aria-hidden", "true");
    this.bg = mk("div", "sl-bg");
    this.root.append(this.bg);
    this.hud = mk("div", "sl-hud");
    this.el.append(this.root, this.hud);
    host.append(this.el);
    this.applyTheme();
    this.build();
    this.measure();
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.measure());
      this.ro.observe(host);
    }
    // text fit needs the web font: refit when it arrives
    const fonts = (
      document as Document & { fonts?: { ready: Promise<unknown> } }
    ).fonts;
    fonts?.ready.then(() => !this.destroyed && this.layoutBlocks());
    if (o.mode === "play")
      this.timer = window.setInterval(() => this.tick(), 500);
  }

  // ---------------------------------------------------------------- building
  private env(): BlockEnv {
    return {
      mode: this.mode,
      lang: this.lang,
      theme: this.theme,
      sims: this.sims,
      slideScene: this.slide.scene,
      step: this.o.step,
      presenter: this.o.presenter,
      scale: () => this.k,
      assetUrl: this.o.assetUrl,
      calcProblem: this.o.calcProblem,
      binding: this.o.binding,
      slots: this.o.slots,
      onLink: (id, on) => this.highlight(on ? id : null),
      fire: (w) => this.fire(w),
      onAction: this.o.onAction,
      onYourTurn: this.o.onYourTurn,
    };
  }
  private applyTheme() {
    for (const [k, v] of Object.entries(themeVars(this.theme)))
      this.el.style.setProperty(k, v);
    this.el.classList.toggle("sl-dark", this.theme.dark);
    this.el.dataset.theme = this.theme.id;
    // background: a token colour, optionally an image with a dim
    const bg = this.slide.background;
    this.bg.replaceChildren();
    this.bg.style.background = color(bg?.color ?? "bg", this.theme, "bg");
    if (bg?.image) {
      const img = mk("img", "sl-bg-img");
      img.alt = "";
      img.draggable = false;
      if (bg.crop) {
        const [x, y, w, h] = bg.crop;
        img.style.objectPosition = `${((x + w / 2) * 100).toFixed(1)}% ${((y + h / 2) * 100).toFixed(1)}%`;
      }
      Promise.resolve(
        imageSrc(bg.image, {
          theme: this.theme,
          lang: this.lang,
          assetUrl: this.o.assetUrl,
        }),
      ).then((u) => {
        if (u) img.src = u;
      });
      this.bg.append(img);
      if (bg.dim) {
        const dim = mk("div", "sl-bg-dim");
        dim.style.opacity = String(Math.max(0, Math.min(0.8, bg.dim)));
        this.bg.append(dim);
      }
    }
    this.buildBrand();
  }
  private buildBrand() {
    this.brandEl?.remove();
    this.brandEl = null;
    const b = this.o.brand;
    if (!b || this.slide.hideBrand) return;
    const el = mk("div", `sl-brand c-${b.logoCorner ?? "br"}`);
    const img = mk("img");
    img.alt = b.name;
    img.draggable = false;
    if (b.logo) {
      Promise.resolve(
        imageSrc(b.logo, {
          theme: this.theme,
          lang: this.lang,
          assetUrl: this.o.assetUrl,
        }),
      ).then((u) => u && (img.src = u));
    } else {
      // on a photo background the wordmark goes white (the brand colour would vanish into the picture)
      const onPhoto = !!this.slide.background?.image;
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sampleLogoSvg(onPhoto ? "#ffffff" : this.theme.colors.brand, b.name.toUpperCase()))}`;
    }
    el.append(img);
    this.root.append(el);
    this.brandEl = el;
  }
  private build() {
    this.steps = clickSteps(this.slide);
    const env = this.env();
    const seen = new Set<string>();
    const order = readingOrder(this.slide.blocks);
    for (const b of order) {
      seen.add(b.id);
      const sig = drawSig(b);
      let v = this.views.get(b.id);
      if (v && this.sigs.get(b.id) !== sig) {
        this.dropHud(b.id);
        v.destroy();
        v = undefined;
      }
      if (!v) {
        v = renderBlock(b, env);
        v.el.dataset.id = b.id;
        v.el.dataset.kind = b.kind;
        this.views.set(b.id, v);
        this.sigs.set(b.id, sig);
        this.wire(v);
        if (v.hud?.length && this.mode === "play") {
          const els = v.hud.map((h) => {
            h.el.dataset.at = h.at.join(",");
            h.el.dataset.origin = (h.origin ?? [0.5, 0.5]).join(",");
            h.el.dataset.block = b.id;
            this.hud.append(h.el);
            return h.el;
          });
          this.hudEls.set(b.id, els);
        }
      }
      v.block = b;
      this.position(v);
      // keep DOM order = reading order (screen readers); paint order comes from z-index
      this.root.append(v.el);
    }
    for (const [id, v] of [...this.views]) {
      if (seen.has(id)) continue;
      this.dropHud(id);
      v.destroy();
      this.views.delete(id);
      this.sigs.delete(id);
    }
    if (this.brandEl) this.root.append(this.brandEl);
    this.applyReveal();
    this.applyChecks();
  }
  private dropHud(id: string) {
    for (const e of this.hudEls.get(id) ?? []) e.remove();
    this.hudEls.delete(id);
  }
  private wire(v: BlockView) {
    const b = v.block;
    if (this.mode !== "play" || !b.onTap) return;
    v.el.classList.add("sl-tappable");
    v.el.tabIndex = 0;
    v.el.setAttribute("role", "button");
    v.el.setAttribute("aria-label", blockLabel(b, this.lang));
    const go = () => {
      const a = v.block.onTap;
      if (!a) return;
      if (a.k === "reveal") {
        const i = this.steps.indexOf(a.order);
        if (i >= 0) this.setReveal(Math.max(this.revealN, i + 1));
        return;
      }
      if (a.k === "next") {
        if (!this.next()) this.o.onAction?.(a, v.block);
        return;
      }
      this.o.onAction?.(a, v.block);
    };
    v.el.addEventListener("click", go);
    v.el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        go();
      }
    });
  }
  private position(v: BlockView) {
    const f = v.block.frame;
    const s = v.el.style;
    s.left = `${f.x}px`;
    s.top = `${f.y}px`;
    s.width = `${f.w}px`;
    s.height = `${f.h}px`;
    s.zIndex = String(10 + Math.max(0, Math.round(f.z ?? 0)));
    s.transform = f.rot ? `rotate(${f.rot}deg)` : "";
    const b = v.block;
    v.el.classList.toggle("sl-presenter-only", !!b.presenterOnly);
    v.el.hidden =
      (this.mode === "edit" && !!b.hiddenInEditor) ||
      (this.mode !== "edit" && !!b.presenterOnly && !this.o.presenter);
    if (this.mode === "edit") {
      if (b.reveal?.order) v.el.dataset.reveal = String(b.reveal.order);
      else delete v.el.dataset.reveal;
    }
  }

  // ---------------------------------------------------------------- scale
  /** Re-measure the host and rescale (also called by the ResizeObserver). */
  measure() {
    const r = this.host.getBoundingClientRect();
    const W = r.width || this.host.clientWidth;
    const H = r.height || this.host.clientHeight;
    if (!(W > 0 && H > 0)) return;
    const fit = fitSlide(W, H, this.o.pad ?? 0);
    const changed = Math.abs(fit.k - this.k) > 1e-4;
    this.k = fit.k;
    this.ox = fit.x;
    this.oy = fit.y;
    this.root.style.transform = `translate(${fit.x}px, ${fit.y}px) scale(${fit.k})`;
    this.el.style.setProperty("--sl-k", String(fit.k));
    this.placeHud();
    if (changed) this.layoutBlocks();
  }
  private layoutBlocks() {
    for (const v of this.views.values()) v.layout?.();
  }
  private placeHud() {
    for (const [id, els] of this.hudEls) {
      const v = this.views.get(id);
      if (!v) continue;
      const f = v.block.frame;
      for (const e of els) {
        const [ax, ay] = (e.dataset.at ?? "0.5,0.5").split(",").map(Number);
        const [gx, gy] = (e.dataset.origin ?? "0.5,0.5").split(",").map(Number);
        // inset by 16 px from the block's edge when anchored on it
        const inx = ax === 1 ? -16 : ax === 0 ? 16 : 0;
        const iny = ay === 1 ? -16 : ay === 0 ? 16 : 0;
        e.style.left = `${this.ox + (f.x + ax * f.w) * this.k + inx}px`;
        e.style.top = `${this.oy + (f.y + ay * f.h) * this.k + iny}px`;
        e.style.transform = `translate(${-gx * 100}%, ${-gy * 100}%)`;
        e.hidden = !!v.el.hidden || v.el.classList.contains("sl-pending");
      }
    }
  }
  /** A client point → slide logical units. */
  toSlide(clientX: number, clientY: number): Pt {
    const r = this.el.getBoundingClientRect();
    return [
      (clientX - r.left - this.ox) / this.k,
      (clientY - r.top - this.oy) / this.k,
    ];
  }
  /** Slide logical units → CSS px in the view element. */
  toView(p: Pt): Pt {
    return [this.ox + p[0] * this.k, this.oy + p[1] * this.k];
  }

  // ---------------------------------------------------------------- reveal, events, goals
  /** number of click reveals on this slide */
  get revealCount(): number {
    return this.steps.length;
  }
  get reveal(): number {
    return Math.min(this.revealN, this.steps.length);
  }
  setReveal(n: number) {
    this.revealN = Math.max(0, n);
    this.applyReveal();
  }
  /** Next reveal; false when everything is already shown (the player goes to the next step). */
  next(): boolean {
    if (this.reveal >= this.steps.length) {
      this.o.onEnd?.();
      return false;
    }
    this.setReveal(this.reveal + 1);
    return true;
  }
  prev(): boolean {
    if (this.reveal <= 0) return false;
    this.setReveal(this.reveal - 1);
    return true;
  }
  /** An event happened (a quiz answered, the goal met, check i met, a YourTurn done). */
  fire(when: string) {
    if (this.events.has(when)) return;
    this.events.add(when);
    this.applyReveal();
    this.o.onEvent?.(when);
  }
  resetEvents() {
    this.events.clear();
    this.applyReveal();
  }
  private applyReveal() {
    const all = this.mode !== "play";
    for (const v of this.views.values()) {
      const shown = isRevealed(v.block, this.steps, this.revealN, this.events);
      if (all) {
        // the editor dims what a reveal preview has not shown yet (it never hides it)
        v.el.classList.toggle(
          "sl-later",
          this.mode === "edit" && Number.isFinite(this.revealN) && !shown,
        );
        v.el.classList.remove("sl-pending");
      } else {
        v.el.classList.toggle("sl-pending", !shown);
        v.el.classList.toggle("no-fade", v.block.reveal?.effect === "none");
        v.el.setAttribute("aria-hidden", shown ? "false" : "true");
        if (!shown) v.el.setAttribute("inert", "");
        else v.el.removeAttribute("inert");
      }
    }
    this.placeHud();
  }
  /** Live goal checks (StepGoal.all / the YourTurn goal): ticks checklist rows, lights `goal`-linked blocks. */
  setChecks(met: readonly boolean[]) {
    const before = this.checks;
    this.checks = [...met];
    met.forEach((m, i) => m && !before[i] && this.fire(`afterCheck:${i}`));
    if (met.length && met.every(Boolean)) this.fire("goalMet");
    this.applyChecks();
  }
  private applyChecks() {
    for (const v of this.views.values()) {
      v.setChecks?.(this.checks);
      const g = v.block.goal;
      if (g?.length)
        v.el.classList.toggle(
          "sl-met",
          g.every((i) => !!this.checks[i]),
        );
    }
  }
  /** Highlight an annotation id: instrument overlays and blocks anchored to it. */
  highlight(id: string | null) {
    for (const v of this.views.values()) {
      v.inst?.highlight(id);
      v.el.classList.toggle("sl-hl", !!id && v.block.anchor === id);
    }
  }
  private tick() {
    for (const v of this.views.values()) v.tick?.();
  }

  // ---------------------------------------------------------------- public helpers
  blockView(id: string): BlockView | undefined {
    return this.views.get(id);
  }
  blockEl(id: string): HTMLElement | null {
    return this.views.get(id)?.el ?? null;
  }
  /** The stage Sim behind an instrument block (package Q evaluates YourTurn goals on it). */
  instrument(id: string) {
    return this.views.get(id)?.inst ?? null;
  }
  /** Re-render with a changed slide (only changed blocks are rebuilt). */
  update(slide: SlideCanvas) {
    const themeChanged =
      JSON.stringify(slide.background) !==
        JSON.stringify(this.slide.background) ||
      slide.hideBrand !== this.slide.hideBrand;
    const sceneChanged = slide.scene !== this.slide.scene;
    this.slide = slide;
    if (themeChanged || sceneChanged) {
      this.theme = resolveTheme(this.o.theme, this.o.brand, { boost: this.o.boost });
      this.applyTheme();
      this.rebuildAll();
      return;
    }
    this.build();
    requestAnimationFrame(() => !this.destroyed && this.layoutChanged());
  }
  private layoutChanged() {
    for (const v of this.views.values()) v.layout?.();
    this.placeHud();
  }
  private rebuildAll() {
    for (const [id, v] of this.views) {
      this.dropHud(id);
      v.destroy();
    }
    this.views.clear();
    this.sigs.clear();
    this.build();
    requestAnimationFrame(() => !this.destroyed && this.layoutChanged());
  }
  setLang(l: Lang) {
    if (l === this.lang) return;
    this.lang = l;
    this.rebuildAll();
  }
  setTheme(theme: ThemeId | undefined, brand?: SchoolBrand, boost = this.o.boost) {
    this.o = { ...this.o, theme, brand, boost };
    this.theme = resolveTheme(theme, brand, { boost });
    this.applyTheme();
    this.rebuildAll();
  }
  /** Run the text fit and redraw instruments now (after the host was shown). */
  relayout() {
    this.measure();
    this.layoutChanged();
  }
  destroy() {
    this.destroyed = true;
    this.ro?.disconnect();
    if (this.timer !== null) clearInterval(this.timer);
    for (const [id, v] of this.views) {
      this.dropHud(id);
      v.destroy();
    }
    this.views.clear();
    if (this.ownSims) this.sims.destroy();
    this.el.remove();
  }
}

/** Draw a slide into `host` (it fills the host; the slide is scaled to fit, centred). */
export function renderSlide(
  slide: SlideCanvas,
  host: HTMLElement,
  o: SlideRenderOptions,
): SlideView {
  const v = new SlideView(host, slide, o);
  requestAnimationFrame(() => v.relayout());
  return v;
}

/**
 * A thumbnail for the editor's step list, the library and the outline: static (instruments drawn once into an
 * image, no live canvas, no controls), every block shown. Pass one `sims` for a whole strip.
 */
export function renderThumb(
  slide: SlideCanvas,
  host: HTMLElement,
  o: Omit<
    SlideRenderOptions,
    "mode" | "onAction" | "onYourTurn" | "reveal"
  > = {},
): SlideView {
  host.classList.add("sl-thumb-host");
  return renderSlide(slide, host, { ...o, mode: "thumb" });
}
