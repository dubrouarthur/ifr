// A compact deck player: one designed slide at a time at 16:9, played by the slide renderer (reveals, quizzes,
// live instruments), with progress segments. Hosts give it a stage element and draw their own chrome around it:
// the cockpit briefing sheet (ui/learn.ts, SPEC slides v2 §11) and the first-run intro (ui/intro.ts).
import "../../styles/course-canvas.css";
import { h } from "../../ui/dom";
import { renderSlide, type SlideView } from "../canvas/render";
import { SceneSims } from "../canvas/instruments";
import type {
  Cockpit,
  L10n,
  Lang,
  SchoolBrand,
  SimScene,
  SlideCanvas,
  Step,
  ThemeId,
} from "../types";

export interface DeckSlide {
  id: string;
  title: L10n;
  slide: SlideCanvas;
  /** a knowledge check on this slide: the host waits for it to be answered */
  gate?: boolean;
  step?: Step;
}

export interface DeckStageOptions {
  lang: Lang;
  slides: readonly DeckSlide[];
  theme?: ThemeId;
  brand?: SchoolBrand;
  scenes?: Record<string, SimScene>;
  cockpit?: Cockpit;
  /** the slide changed (index, count) */
  onChange?: (i: number, n: number) => void;
  /** a gated slide was answered */
  onAnswered?: (id: string) => void;
  /** Next was pressed on the last slide, everything revealed */
  onEnd?: () => void;
  /** asset id → URL (pre-rendered plates, stored images) */
  assetUrl?: (id: string) => Promise<string | null> | string | null;
  /** every reveal shown at once (a slideshow that plays by itself) */
  revealAll?: boolean;
}

/** Whether a slide carries a knowledge check (a quiz block). */
export const hasQuiz = (s: SlideCanvas): boolean =>
  s.blocks.some((b) => b.kind === "quiz");

export class DeckStage {
  readonly el: HTMLDivElement;
  private view: SlideView | null = null;
  private i = 0;
  private answered = new Set<string>();
  private sims: SceneSims;
  private destroyed = false;
  constructor(private o: DeckStageOptions) {
    this.el = h("div", {
      class: "ds-stage",
      role: "region",
      "aria-roledescription": o.lang === "fr" ? "diaporama" : "slide deck",
    });
    this.sims = new SceneSims({ scenes: o.scenes ?? {}, cockpit: o.cockpit });
  }
  get index(): number {
    return this.i;
  }
  get count(): number {
    return this.o.slides.length;
  }
  /** reveals shown on the current slide, and how many it has */
  get reveal(): number {
    return this.view?.reveal ?? 0;
  }
  get revealCount(): number {
    return this.view?.revealCount ?? 0;
  }
  get atEnd(): boolean {
    return this.i >= this.o.slides.length - 1;
  }
  /** every gated slide answered */
  get gatesDone(): boolean {
    return this.o.slides.every((s) => !s.gate || this.answered.has(s.id));
  }
  /** the first gated slide still waiting for its answer */
  get pendingGate(): number {
    return this.o.slides.findIndex((s) => s.gate && !this.answered.has(s.id));
  }
  isAnswered(id: string): boolean {
    return this.answered.has(id);
  }
  mount(host: HTMLElement) {
    host.append(this.el);
    this.go(this.i);
  }
  go(i: number, reveal = 0) {
    if (this.destroyed) return;
    const n = this.o.slides.length;
    this.i = Math.max(0, Math.min(n - 1, i));
    const s = this.o.slides[this.i];
    this.view?.destroy();
    this.el.replaceChildren();
    const box = h("div", { class: "ds-slide" });
    this.el.append(box);
    this.view = renderSlide(s.slide, box, {
      mode: "play",
      lang: this.o.lang,
      theme: this.o.theme,
      brand: this.o.brand,
      scenes: this.o.scenes,
      cockpit: this.o.cockpit,
      sims: this.sims,
      step: s.step,
      reveal: this.o.revealAll ? Infinity : reveal,
      ...(this.o.assetUrl ? { assetUrl: this.o.assetUrl } : {}),
      label: tl(s.title, this.o.lang),
      onEvent: (w) => {
        if (w === "answered" && !this.answered.has(s.id)) {
          this.answered.add(s.id);
          this.o.onAnswered?.(s.id);
        }
      },
    });
    this.o.onChange?.(this.i, n);
  }
  /** the next reveal, else the next slide; false on the last slide with everything shown */
  next(): boolean {
    if (this.view && this.view.reveal < this.view.revealCount) {
      this.view.setReveal(this.view.reveal + 1);
      return true;
    }
    if (this.atEnd) {
      this.o.onEnd?.();
      return false;
    }
    this.go(this.i + 1);
    return true;
  }
  prev(): boolean {
    if (this.view && this.view.reveal > 0) {
      this.view.setReveal(this.view.reveal - 1);
      return true;
    }
    if (this.i <= 0) return false;
    const to = this.i - 1;
    this.go(to, Infinity);
    return true;
  }
  /** the progress segments (one per slide; done, current, to come): one Tab stop (the current slide), the arrow
   *  keys, Home and End move along it (roving tabindex) */
  segments(onPick?: (i: number) => void): HTMLElement {
    const n = this.o.slides.length;
    const bar = h(
      "div",
      {
        class: "ds-segs",
        role: "toolbar",
        "aria-label": this.o.lang === "fr" ? "Diapositives" : "Slides",
      },
      ...this.o.slides.map((s, k) =>
        h("button", {
          class: `ds-seg${k < this.i ? " done" : k === this.i ? " on" : ""}`,
          type: "button",
          tabindex: k === this.i ? 0 : -1,
          title: `${k + 1} / ${n} · ${tl(s.title, this.o.lang)}`,
          "aria-label": `${k + 1} / ${n} · ${tl(s.title, this.o.lang)}`,
          "aria-current": k === this.i ? "step" : null,
          onclick: () => onPick?.(k),
        }),
      ),
    );
    bar.addEventListener("keydown", (e) => {
      const to =
        e.key === "ArrowRight" || e.key === "ArrowDown"
          ? this.i + 1
          : e.key === "ArrowLeft" || e.key === "ArrowUp"
            ? this.i - 1
            : e.key === "Home"
              ? 0
              : e.key === "End"
                ? n - 1
                : null;
      if (to === null) return;
      e.preventDefault();
      e.stopPropagation();
      const k = Math.max(0, Math.min(n - 1, to));
      if (k !== this.i) onPick?.(k);
      // the host redraws the bar: the focus follows the current segment
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>('.ds-seg[aria-current="step"]')
          ?.focus({ preventScroll: true }),
      );
    });
    return bar;
  }
  destroy() {
    this.destroyed = true;
    this.view?.destroy();
    this.view = null;
    this.sims.destroy();
    this.el.remove();
  }
}

const tl = (t: L10n, l: Lang) => (l === "fr" ? t.fr?.trim() || t.en : t.en);

/** Mount a deck into `host`. */
export function mountDeck(host: HTMLElement, o: DeckStageOptions): DeckStage {
  const d = new DeckStage(o);
  d.mount(host);
  return d;
}
