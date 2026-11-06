// Ground school stage — the annotation layer over a pane: callout numbers, rings, arrows, tags and the
// spotlight, plus the linked-term highlight (a [[label|id]] word in the reader lights its annotation) and tap
// hit tests (Tap steps, tap quizzes). HTML + SVG over the canvas (SPEC §9.2): the SVG uses the pane's SOURCE
// rectangle as its viewBox (preserveAspectRatio none; the pane box keeps the drawing's aspect, so rings stay
// rings), strokes do not scale, numbers and text are CSS-px elements placed by %. Anchors resolve from
// EXPLAIN_REGIONS (geometry.resolveAnchor), so a callout follows its instrument when the crop changes.
import type { Annotation, Lang, Pt, Rect } from "../types";
import {
  annotationVisible,
  cssToSource,
  rectContains,
  resolveAnchor,
  spotlightPath,
  toFrac,
  type RevealState,
} from "./geometry";
import { tl } from "./strings";

const SVG = "http://www.w3.org/2000/svg";
const svgEl = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

/** A callout's text for the side column / projector notes (numbered, in reveal order). */
export interface CalloutNote {
  id: string;
  n: number;
  text: string;
  /** the linked-term highlight is on this callout */
  on: boolean;
}

/** Pure: the annotations that show, anchors resolved, in paint order (spotlight first). */
export function visibleAnnotations(
  list: readonly Annotation[],
  pane: 0 | 1,
  s: RevealState,
): Annotation[] {
  return list
    .filter((a) => (a.pane ?? 0) === pane && annotationVisible(a, s))
    .map(resolveAnchor)
    .sort(
      (a, b) =>
        (a.type === "spotlight" ? -1 : 0) - (b.type === "spotlight" ? -1 : 0),
    );
}

/** Pure: which annotation a source point hits (rings by their box, callouts and tags near their point), or null. */
export function hitAnnotation(
  list: readonly Annotation[],
  p: Pt,
  tolerance: number,
): Annotation | null {
  // topmost first: later annotations paint over earlier ones
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (a.type === "ring" && rectContains(a.rect, p, tolerance)) return a;
    if (
      (a.type === "callout" || a.type === "tag") &&
      Math.hypot(p[0] - a.at[0], p[1] - a.at[1]) <= tolerance * 1.6
    )
      return a;
    if (
      a.type === "callout" &&
      a.box &&
      rectContains(a.box, p, tolerance * 0.5)
    )
      return a;
  }
  return null;
}

export interface OverlayOptions {
  lang?: Lang;
  /** a tap on the pane (Tap steps): the annotation hit (or null) and the source point */
  onTap?: (hit: Annotation | null, p: Pt) => void;
}

export class Overlay {
  readonly el: HTMLDivElement;
  private svg: SVGSVGElement;
  private html: HTMLDivElement;
  private rect: Rect = [0, 0, 1024, 768];
  private list: Annotation[] = [];
  private shown: Annotation[] = [];
  private pane: 0 | 1;
  private reveal: RevealState = { reveal: 0 };
  private hl: string | null = null;
  private lang: Lang;
  private tapOn = false;
  private onTap?: OverlayOptions["onTap"];
  constructor(pane: 0 | 1, o: OverlayOptions = {}) {
    this.pane = pane;
    this.lang = o.lang ?? "en";
    this.onTap = o.onTap;
    this.el = document.createElement("div");
    this.el.className = "cs-ov";
    this.svg = svgEl("svg", {
      class: "cs-ov-svg",
      preserveAspectRatio: "none",
      "aria-hidden": "true",
    });
    this.html = document.createElement("div");
    this.html.className = "cs-ov-html";
    this.el.append(this.svg, this.html);
    this.el.addEventListener("click", (e) => {
      if (!this.tapOn) return;
      const r = this.el.getBoundingClientRect();
      const p = cssToSource(
        this.rect,
        r.width,
        r.height,
        e.clientX - r.left,
        e.clientY - r.top,
      );
      // ≥ 22 CSS px of tolerance whatever the zoom
      const tol = (22 / Math.max(1, r.width)) * this.rect[2];
      this.onTap?.(hitAnnotation(this.shown, p, tol), p);
    });
  }
  setLang(l: Lang) {
    this.lang = l;
    this.render();
  }
  /** the pane's source rectangle (crop) */
  setRect(rect: Rect) {
    this.rect = rect;
    this.render();
  }
  set(list: readonly Annotation[] | undefined, reveal?: RevealState) {
    this.list = [...(list ?? [])];
    if (reveal) this.reveal = reveal;
    this.render();
  }
  setReveal(reveal: RevealState) {
    this.reveal = reveal;
    this.render();
  }
  /** linked-term highlight: light one annotation (by id), dim the others; null clears */
  highlight(id: string | null) {
    this.hl = id;
    for (const n of this.el.querySelectorAll<HTMLElement | SVGElement>(
      "[data-ann]",
    )) {
      const on = id !== null && n.getAttribute("data-ann") === id;
      n.classList.toggle("on", on);
      n.classList.toggle(
        "dim",
        id !== null && !on && n.getAttribute("data-kind") !== "spotlight",
      );
    }
  }
  /** Tap mode (pointer events on): Tap steps and tap quizzes */
  setTappable(on: boolean) {
    this.tapOn = on;
    this.el.classList.toggle("tap", on);
  }
  /** callouts with text, for the side column (numbered notes beside the instrument) */
  notes(): CalloutNote[] {
    return this.shown
      .filter(
        (a): a is Extract<Annotation, { type: "callout" }> =>
          a.type === "callout" && !!a.text && !a.box,
      )
      .map((a) => ({
        id: a.id,
        n: a.n,
        text: tl(a.text, this.lang),
        on: this.hl === a.id,
      }))
      .sort((a, b) => a.n - b.n);
  }
  shownAnnotations(): readonly Annotation[] {
    return this.shown;
  }
  private render() {
    const [x, y, w, h] = this.rect;
    this.svg.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
    this.svg.replaceChildren();
    this.html.replaceChildren();
    this.shown = visibleAnnotations(this.list, this.pane, this.reveal);
    const pct = (p: Pt) => {
      const f = toFrac(this.rect, p);
      return `left:${(f[0] * 100).toFixed(3)}%;top:${(f[1] * 100).toFixed(3)}%`;
    };
    const defs = svgEl("defs", {});
    this.svg.append(defs);
    let arrowId = "";
    for (const a of this.shown) {
      const tag = { "data-ann": a.id, "data-kind": a.type };
      switch (a.type) {
        case "spotlight": {
          this.svg.append(
            svgEl("path", {
              ...tag,
              class: "cs-spot",
              d: spotlightPath(this.rect, a.holes),
              "fill-rule": "evenodd",
            }),
          );
          break;
        }
        case "ring": {
          const [rx, ry, rw, rh] = a.rect;
          const r = Math.min(rw, rh) * 0.12;
          const g = svgEl("g", { ...tag, class: "cs-ring" });
          if (a.rot)
            g.setAttribute(
              "transform",
              `rotate(${a.rot} ${rx + rw / 2} ${ry + rh / 2})`,
            );
          g.append(
            svgEl("rect", {
              class: "halo",
              x: rx,
              y: ry,
              width: rw,
              height: rh,
              rx: r,
              ry: r,
              "vector-effect": "non-scaling-stroke",
            }),
            svgEl("rect", {
              class: "hl",
              x: rx,
              y: ry,
              width: rw,
              height: rh,
              rx: r,
              ry: r,
              "vector-effect": "non-scaling-stroke",
            }),
          );
          this.svg.append(g);
          break;
        }
        case "arrow": {
          if (!arrowId) {
            arrowId = `csah${Math.random().toString(36).slice(2, 8)}`;
            const m = svgEl("marker", {
              id: arrowId,
              viewBox: "0 0 10 10",
              refX: 8,
              refY: 5,
              markerWidth: 5,
              markerHeight: 5,
              orient: "auto-start-reverse",
              markerUnits: "strokeWidth",
            });
            m.append(svgEl("path", { d: "M0 0L10 5L0 10Z", class: "cs-ah" }));
            defs.append(m);
          }
          const g = svgEl("g", { ...tag, class: "cs-arrow" });
          const [x1, y1] = a.from;
          const [x2, y2] = a.to;
          g.append(
            svgEl("line", {
              class: "halo",
              x1,
              y1,
              x2,
              y2,
              "vector-effect": "non-scaling-stroke",
            }),
            svgEl("line", {
              class: "hl",
              x1,
              y1,
              x2,
              y2,
              "marker-end": `url(#${arrowId})`,
              "vector-effect": "non-scaling-stroke",
            }),
          );
          this.svg.append(g);
          break;
        }
        case "callout": {
          const n = document.createElement("span");
          n.className = "cs-cnum";
          n.setAttribute("data-ann", a.id);
          n.setAttribute("data-kind", "callout");
          n.setAttribute("style", pct(a.at));
          n.textContent = String(a.n);
          this.html.append(n);
          if (a.text && a.box) {
            const b = document.createElement("div");
            b.className = "cs-bubble in";
            b.setAttribute("data-ann", a.id);
            b.setAttribute("data-kind", "callout");
            const f0 = toFrac(this.rect, [a.box[0], a.box[1]]);
            const f1 = toFrac(this.rect, [
              a.box[0] + a.box[2],
              a.box[1] + a.box[3],
            ]);
            b.setAttribute(
              "style",
              `left:${(f0[0] * 100).toFixed(2)}%;top:${(f0[1] * 100).toFixed(2)}%;width:${((f1[0] - f0[0]) * 100).toFixed(2)}%`,
            );
            b.append(bubbleText(tl(a.text, this.lang)));
            this.html.append(b);
          }
          break;
        }
        case "tag": {
          const n = document.createElement("span");
          n.className = "cs-tag";
          n.setAttribute("data-ann", a.id);
          n.setAttribute("data-kind", "tag");
          n.setAttribute("style", pct(a.at));
          n.textContent = tl(a.text, this.lang);
          this.html.append(n);
          break;
        }
      }
    }
    if (this.hl) this.highlight(this.hl);
  }
}

/** Bubble text: **bold** spans only (the reader's full inline syntax lives in the player). */
export function bubbleText(s: string): DocumentFragment {
  const f = document.createDocumentFragment();
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  for (const p of parts) {
    if (!p) continue;
    if (p.startsWith("**") && p.endsWith("**")) {
      const b = document.createElement("b");
      b.textContent = p.slice(2, -2);
      f.append(b);
    } else f.append(document.createTextNode(p));
  }
  return f;
}
