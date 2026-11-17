// Ground school — designed slides: one renderer per block kind (package N). Each returns a BlockView whose `el`
// is positioned by the slide (render.ts) in logical units inside the scaled 1920 × 1080 root. No innerHTML for
// author text (richFragment builds DOM); SVG for shapes, arrows and leaders; the stage package draws the live
// instruments (instruments.ts → stage/views.ts) and the diagrams (stage/diagrams.ts); quiz and calc slots are the
// player's (SlideSlots), with a self-contained fallback so a slide always renders.
import type {
  BlockAction,
  CalcProblem,
  InstrumentMotion,
  Lang,
  Pt,
  SlideBinding,
  SlideBlock,
  SlideTheme,
  Step,
  YourTurn,
} from "../types";
import {
  richFragment,
  plainText,
  loc,
  isMissing,
  fitScale,
  formulaFragment,
  textWidth,
} from "./text";
import { color, diagramThemeOf, MIN_TEXT_PX, typeCss } from "./themes";
import { arrowControl } from "./geom";
import { libraryAsset, libraryUrl, paletteOf } from "./library";
import { airspaceSvg } from "./airspace";
import { SlideInstrument, SceneSims, readoutText } from "./instruments";
import { mountOutsideView } from "./outsideView";
import { instrumentFrame } from "../stage/geometry";
import {
  ControlStrip,
  setStripTrial,
  stripPlan,
  stripShown,
  stripTrialChanged,
  stripWidget,
  stripZoom,
  type StripPlan,
} from "./controlStrip";
import { DEMO_SCENE_ID } from "./factory";
import { evaluate as evalGoal, stageView } from "../goals";
import { registerReplay, type MotionRun } from "./motion";
import { tx, blockKindLabel } from "./strings";
import {
  createCalcDiagram,
  diagramPane,
  type DiagramPane,
} from "../stage/diagrams";
import type { DiagramWidget } from "../stage/svgkit";
import { fitFloor, HINT_H, slidePalette } from "./metrics";
export { fitFloor, HINT_H, slidePalette } from "./metrics";
import { holdFootText } from "../../train/diagram";
import type { DiagramHub } from "./diagramMirror";
import { problemFor, checkAnswer } from "../calc/index";
import { UNIT_LABEL } from "../calc/text";

export type SlideMode = "play" | "edit" | "thumb";
type Of<K extends SlideBlock["kind"]> = Extract<SlideBlock, { kind: K }>;

/** What a slot (the player's quiz / calc UI, package L's diagrams) gets. */
export interface SlotContext {
  mode: SlideMode;
  lang: Lang;
  theme: SlideTheme;
  step?: Step;
  /** tell the slide an event happened ('answered' reveals blocks waiting for it) */
  fire(when: string): void;
}
export interface SlotHandle {
  destroy?(): void;
  /** the block was resized */
  resize?(): void;
}
export interface SlideSlots {
  quiz?: (
    b: Of<"quiz">,
    host: HTMLElement,
    cx: SlotContext,
  ) => SlotHandle | void;
  calc?: (
    b: Of<"calc">,
    host: HTMLElement,
    cx: SlotContext,
  ) => SlotHandle | void;
  /** a calc diagram kind the stage package does not draw (course/calcDiagrams, package L) */
  calcDiagram?: (
    spec: Extract<SlideBlock, { kind: "diagram" }>["d"],
    host: HTMLElement,
    cx: SlotContext & { interactive: boolean },
  ) => SlotHandle | null | void;
  /** the sim viewport's clip / poster player (package B / G); the fallback draws a still from the scene */
  simViewport?: (
    b: Of<"simViewport">,
    host: HTMLElement,
    cx: SlotContext,
  ) => SlotHandle | void;
}

/** Everything a block renderer may use (built once per slide view). */
export interface BlockEnv {
  mode: SlideMode;
  lang: Lang;
  theme: SlideTheme;
  sims: SceneSims;
  /** the slide's default scene id (SlideCanvas.scene, else the demo scene) */
  slideScene?: string;
  step?: Step;
  presenter?: boolean;
  /** the projector (SlideRenderOptions.mirror) */
  mirror?: boolean;
  scale(): number;
  assetUrl?: (id: string) => string | null | Promise<string | null>;
  calcProblem?: (stepId: string) => CalcProblem | null;
  binding?: (b: SlideBinding) => string | null | undefined;
  slots?: SlideSlots;
  /** a linked term was hovered / focused (highlight annotation `id` on instruments and anchored blocks) */
  onLink?: (id: string, on: boolean) => void;
  fire(when: string): void;
  onAction?: (a: BlockAction, b: SlideBlock) => void;
  onYourTurn?: (b: SlideBlock, yt: YourTurn) => void;
  /** the slide's animation of a situation (the first instrument of the slide showing it with one, canvas/motion.ts) */
  motionOf?: (sceneId: string) => InstrumentMotion | undefined;
  /** the drawings the presenter works, mirrored on the projector (canvas/diagramMirror.ts) */
  diagrams?: DiagramHub;
}

export interface BlockView {
  readonly el: HTMLElement;
  block: SlideBlock;
  inst?: SlideInstrument;
  /** HUD items (real CSS pixels, never scaled): buttons ≥ 44 px anchored to the block */
  hud?: HudItem[];
  /** live goal checks (indices into the step's goal) */
  setChecks?(met: readonly boolean[]): void;
  /** text fit, instrument redraw at the new scale */
  layout?(): void;
  /** periodic refresh of live values (readouts) */
  tick?(): void;
  /** the block is shown or hidden by its reveal step (an animation starts when it is shown) */
  revealed?(on: boolean): void;
  destroy(): void;
}
export interface HudItem {
  el: HTMLElement;
  /** where on the block (fractions of the frame) the item is anchored, and the item's own anchor */
  at: Pt;
  origin?: Pt;
}

const mk = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const SVGNS = "http://www.w3.org/2000/svg";
const svg = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | null | undefined> = {},
) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs))
    if (v !== null && v !== undefined) e.setAttribute(k, String(v));
  return e;
};
function applyCss(el: HTMLElement, css: Record<string, string>) {
  for (const [k, v] of Object.entries(css)) el.style.setProperty(k, v);
}
const r1 = (n: number) => Math.round(n * 10) / 10;

// ------------------------------------------------------------------ text
const FORMULA_STYLES = new Set(["formula", "mono"]);
function textBlock(b: Of<"text">, env: BlockEnv): BlockView {
  const el = mk("div", `sl-b sl-text sl-st-${b.style}`);
  const inner = mk("div", "sl-text-in");
  el.append(inner);
  const css = typeCss(env.theme, b.style, b.color);
  applyCss(inner, css);
  inner.style.setProperty("--fs", css["font-size"]);
  inner.style.fontSize = "calc(var(--fs) * var(--fit, 1))";
  inner.style.textAlign = b.align ?? "left";
  el.style.justifyContent = {
    top: "flex-start",
    middle: "center",
    bottom: "flex-end",
  }[b.valign ?? "top"];
  const src = loc(b.text, env.lang);
  const valueOf = (): string | null => {
    if (!b.bind) return null;
    const v = env.binding?.(b.bind);
    if (v !== undefined && v !== null) return v;
    if (b.bind.k === "readout") {
      const e = env.sims.get(b.bind.scene ?? env.slideScene ?? DEMO_SCENE_ID);
      return e ? readoutText(e.sim, b.bind.readout, env.lang) : null;
    }
    return null;
  };
  let last: string | null = valueOf();
  const formula = FORMULA_STYLES.has(b.style);
  if (formula) el.classList.add("sl-st-formula");
  // the cover title rule (SPEC slides v2 §2): "Main: subtitle" → the main part in display, the rest as a subtitle
  const cover =
    b.style === "display" ? /^([^\n:]{2,48}?)\s?:\s+([^\n]+)$/.exec(src) : null;
  const paint = () => {
    if (cover && !formula) {
      const sub = mk("span", "sl-cover-sub");
      sub.append(
        richFragment(
          cover[2].charAt(0).toLocaleUpperCase(env.lang) + cover[2].slice(1),
          { lang: env.lang },
        ),
      );
      inner.replaceChildren(richFragment(cover[1], { lang: env.lang }), sub);
      return;
    }
    inner.replaceChildren(
      formula
        ? formulaFragment(src.replace(/\{\{[^}]*\}\}/g, last ?? "—"), env.lang)
        : richFragment(src, {
            value: last,
            lang: env.lang,
            onLink: env.mode === "play" ? env.onLink : undefined,
          }),
    );
  };
  paint();
  if (!src && env.mode === "edit") el.classList.add("sl-empty");
  if (isMissing(b.text, env.lang) && env.mode !== "thumb") {
    const m = mk("span", "sl-en", "EN");
    m.title =
      env.lang === "fr" ? "Texte français manquant" : "French text missing";
    el.append(m);
  }
  const fit = () => {
    inner.style.setProperty("--fit", "1");
    const H = el.clientHeight;
    const W = el.clientWidth;
    if (!H || !W) return;
    const over = (k: number) => {
      inner.style.setProperty("--fit", String(k));
      return inner.scrollHeight > H + 1 || inner.scrollWidth > W + 1;
    };
    const min = fitFloor(parseFloat(css["font-size"]));
    const k = fitScale(over, min);
    inner.style.setProperty("--fit", String(k));
    el.classList.toggle("sl-fitted", k < 1);
    // still too long at the floor: the editor shows it (the checks panel lists it too)
    const clip = k <= min && over(k);
    inner.style.setProperty("--fit", String(k));
    el.classList.toggle("sl-overflow", clip);
    if (clip && env.mode === "edit")
      el.dataset.overflow = tx("textTooLong", env.lang);
    else delete el.dataset.overflow;
  };
  return {
    el,
    block: b,
    layout: fit,
    tick: b.bind
      ? () => {
          const v = valueOf();
          if (v !== last) {
            last = v;
            paint();
          }
        }
      : undefined,
    destroy: () => el.remove(),
  };
}

// ------------------------------------------------------------------ image
/** Position an image inside a frame: the crop's part of it covers (or fits in) the frame. Pure. */
/** an explanation that opens with the verdict the card already prints (« Juste : … » after « Juste. »): said once */
export function withoutVerdict(text: string, right: boolean): string {
  const re = right
    ? /^(?:Juste|Exact|Correct|Right|Yes|Oui)\s*[:.,!]\s*/i
    : /^(?:Faux|Wrong|Incorrect)\s*[:.,!]\s*/i;
  const m = text.match(re);
  if (!m || m[0].length >= text.length) return text;
  const rest = text.slice(m[0].length);
  return rest.charAt(0).toLocaleUpperCase() + rest.slice(1);
}
export function cropPlacement(
  frameW: number,
  frameH: number,
  natW: number,
  natH: number,
  crop: [number, number, number, number] = [0, 0, 1, 1],
  fit: "cover" | "contain" = "cover",
): { x: number; y: number; w: number; h: number } {
  const [cx, cy, cw, ch] = crop;
  const vw = Math.max(1e-6, cw * natW);
  const vh = Math.max(1e-6, ch * natH);
  const s =
    fit === "cover"
      ? Math.max(frameW / vw, frameH / vh)
      : Math.min(frameW / vw, frameH / vh);
  const w = natW * s;
  const h = natH * s;
  return {
    x: (frameW - vw * s) / 2 - cx * natW * s,
    y: (frameH - vh * s) / 2 - cy * natH * s,
    w,
    h,
  };
}
export function imageSrc(
  src: Of<"image">["image"],
  env: Pick<BlockEnv, "theme" | "lang" | "assetUrl">,
): string | null | Promise<string | null> {
  if ("lib" in src)
    return libraryUrl(src.lib, { theme: env.theme, lang: env.lang });
  return env.assetUrl?.(src.asset) ?? null;
}
function imageBlock(b: Of<"image">, env: BlockEnv): BlockView {
  const el = mk("div", `sl-b sl-image${b.radius ? ` r${b.radius}` : ""}`);
  const box = mk("div", "sl-img-box");
  el.append(box);
  const img = mk("img");
  img.alt = loc(b.alt, env.lang);
  img.decoding = "async";
  img.draggable = false;
  box.append(img);
  const lib = "lib" in b.image ? libraryAsset(b.image.lib) : undefined;
  if (lib?.kind === "icon" || lib?.kind === "logo") el.classList.add("is-icon");
  let nat: [number, number] | null =
    lib && lib.kind !== "photo" ? [lib.w, lib.h] : null;
  const place = () => {
    const W = b.frame.w;
    const H = b.frame.h - (cap ? CAPTION_H : 0);
    const n =
      nat ?? (img.naturalWidth ? [img.naturalWidth, img.naturalHeight] : null);
    if (!n) return;
    const p = cropPlacement(W, H, n[0], n[1], b.crop, b.fit ?? "cover");
    Object.assign(img.style, {
      left: `${r1(p.x)}px`,
      top: `${r1(p.y)}px`,
      width: `${r1(p.w)}px`,
      height: `${r1(p.h)}px`,
    });
  };
  img.addEventListener("load", () => {
    if (!nat || lib?.kind === "photo")
      nat = [img.naturalWidth, img.naturalHeight];
    place();
  });
  img.addEventListener("error", () => missing());
  const missing = () => {
    img.remove();
    box.append(mk("div", "sl-missing", tx("imageMissing", env.lang)));
  };
  const cap = b.caption ? loc(b.caption, env.lang) : "";
  const CAPTION_H = 64;
  if (cap) {
    el.classList.add("has-caption");
    const c = mk("div", "sl-img-cap");
    c.textContent = cap;
    applyCss(c, typeCss(env.theme, "caption"));
    el.append(c);
  }
  if (b.attribution && env.mode !== "thumb")
    el.append(mk("div", "sl-attr", b.attribution));
  const src = imageSrc(b.image, env);
  Promise.resolve(src).then((u) => {
    if (u) img.src = u;
    else missing();
  });
  place();
  return { el, block: b, layout: place, destroy: () => el.remove() };
}

// ------------------------------------------------------------------ shapes
function shapeBlock(b: Of<"shape">, env: BlockEnv): BlockView {
  const el = mk("div", "sl-b sl-shape");
  // a shape is decoration, unless it carries a description (the background of a drawn figure: a runway plan)
  const alt = b.alt ? loc(b.alt, env.lang) : "";
  if (alt) {
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", alt);
  } else el.setAttribute("aria-hidden", "true");
  const { w, h } = b.frame;
  const sw = b.stroke === null ? 0 : (b.strokeW ?? 2);
  const root = svg("svg", {
    viewBox: `0 0 ${w} ${h}`,
    width: w,
    height: h,
    class: "sl-svg",
  });
  const fill =
    b.fill === null || b.fill === undefined
      ? "none"
      : color(b.fill, env.theme, "surface");
  const stroke =
    b.stroke === null ? "none" : color(b.stroke ?? "line", env.theme, "line");
  const common = {
    fill,
    stroke,
    "stroke-width": sw,
    "stroke-dasharray": b.dash ? `${sw * 4} ${sw * 3}` : null,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    opacity:
      b.opacity !== undefined ? Math.max(0.05, Math.min(1, b.opacity)) : null,
  };
  const i = sw / 2;
  let node: SVGElement;
  switch (b.shape) {
    case "ellipse":
      node = svg("ellipse", {
        cx: w / 2,
        cy: h / 2,
        rx: Math.max(1, w / 2 - i),
        ry: Math.max(1, h / 2 - i),
        ...common,
      });
      break;
    case "line":
      node = svg("line", {
        x1: i,
        y1: h / 2,
        x2: w - i,
        y2: h / 2,
        ...common,
        fill: null,
      });
      break;
    case "triangle":
      node = svg("path", {
        d: `M${w / 2},${i} L${w - i},${h - i} L${i},${h - i} Z`,
        ...common,
      });
      break;
    default:
      node = svg("rect", {
        x: i,
        y: i,
        width: Math.max(1, w - sw),
        height: Math.max(1, h - sw),
        rx: b.shape === "roundRect" ? Math.min(16, w / 4, h / 4) : 0,
        ...common,
      });
  }
  root.append(node);
  el.append(root);
  return { el, block: b, destroy: () => el.remove() };
}

/** Arrowhead triangle at `tip` pointing along (dx, dy). */
function headPath(tip: Pt, dx: number, dy: number, size: number): string {
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const bx = tip[0] - ux * size;
  const by = tip[1] - uy * size;
  const px = -uy * size * 0.5;
  const py = ux * size * 0.5;
  return `M${r1(tip[0])},${r1(tip[1])} L${r1(bx + px)},${r1(by + py)} L${r1(bx - px)},${r1(by - py)} Z`;
}
function arrowBlock(b: Of<"arrow">, env: BlockEnv): BlockView {
  const el = mk("div", "sl-b sl-arrow");
  el.setAttribute("aria-hidden", "true");
  const { x, y, w, h } = b.frame;
  const root = svg("svg", {
    viewBox: `0 0 ${w} ${h}`,
    width: w,
    height: h,
    class: "sl-svg",
  });
  const from: Pt = [b.from[0] - x, b.from[1] - y];
  const to: Pt = [b.to[0] - x, b.to[1] - y];
  const c = arrowControl(from, to, b.curve ?? 0);
  const sw = b.strokeW ?? 4;
  const col = color(b.color ?? "accent", env.theme, "accent");
  const size = Math.max(16, sw * 4.5);
  const heads = b.heads ?? "end";
  // the shaft stops short of a head so the line never pokes through the tip
  const pull = (p: Pt, q: Pt, d: number): Pt => {
    const L = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
    return [p[0] + ((q[0] - p[0]) / L) * d, p[1] + ((q[1] - p[1]) / L) * d];
  };
  const a = heads === "both" ? pull(from, c, size * 0.8) : from;
  const z = heads !== "none" ? pull(to, c, size * 0.8) : to;
  const d = b.curve
    ? `M${r1(a[0])},${r1(a[1])} Q${r1(c[0])},${r1(c[1])} ${r1(z[0])},${r1(z[1])}`
    : `M${r1(a[0])},${r1(a[1])} L${r1(z[0])},${r1(z[1])}`;
  root.append(
    svg("path", {
      d,
      fill: "none",
      stroke: col,
      "stroke-width": sw,
      "stroke-linecap": "round",
    }),
  );
  if (heads !== "none")
    root.append(
      svg("path", {
        d: headPath(to, to[0] - c[0], to[1] - c[1], size),
        fill: col,
      }),
    );
  if (heads === "both")
    root.append(
      svg("path", {
        d: headPath(from, from[0] - c[0], from[1] - c[1], size),
        fill: col,
      }),
    );
  el.append(root);
  return { el, block: b, destroy: () => el.remove() };
}

/** Where a leader leaves a box towards a target: the box edge on the centre → target line. Pure. */
export function leaderStart(w: number, h: number, t: Pt): Pt {
  const cx = w / 2;
  const cy = h / 2;
  const dx = t[0] - cx;
  const dy = t[1] - cy;
  if (!dx && !dy) return [cx, cy];
  const kx = dx ? w / 2 / Math.abs(dx) : Infinity;
  const ky = dy ? h / 2 / Math.abs(dy) : Infinity;
  const k = Math.min(kx, ky, 1);
  return [cx + dx * k, cy + dy * k];
}
function calloutBlock(b: Of<"callout">, env: BlockEnv): BlockView {
  const el = mk("div", `sl-b sl-callout tone-${b.tone ?? "plain"}`);
  const card = mk("div", "sl-callout-card");
  el.append(card);
  if (b.n !== undefined) {
    const n = mk("span", "sl-num", String(b.n));
    n.setAttribute("aria-hidden", "true");
    card.append(n);
  }
  const body = mk("div", "sl-callout-text");
  applyCss(body, typeCss(env.theme, "body"));
  const css = typeCss(env.theme, "body");
  body.style.setProperty(
    "--fs",
    `${Math.round(parseFloat(css["font-size"]) * 0.86)}px`,
  );
  body.style.fontSize = "calc(var(--fs) * var(--fit, 1))";
  body.append(
    richFragment(loc(b.text, env.lang), {
      lang: env.lang,
      onLink: env.mode === "play" ? env.onLink : undefined,
    }),
  );
  card.append(body);
  if (b.target) {
    const { x, y, w, h } = b.frame;
    const t: Pt = [b.target[0] - x, b.target[1] - y];
    const inside = t[0] > 0 && t[0] < w && t[1] > 0 && t[1] < h;
    if (!inside) {
      const s = leaderStart(w, h, t);
      const lx = Math.min(0, t[0]) - 12;
      const ly = Math.min(0, t[1]) - 12;
      const lw = Math.max(w, t[0]) - lx + 24;
      const lh = Math.max(h, t[1]) - ly + 24;
      const lead = svg("svg", {
        class: "sl-leader",
        viewBox: `${lx} ${ly} ${lw} ${lh}`,
        width: lw,
        height: lh,
      });
      lead.style.left = `${lx}px`;
      lead.style.top = `${ly}px`;
      lead.setAttribute("aria-hidden", "true");
      const col =
        b.tone === "warn"
          ? "var(--sl-warn)"
          : b.tone === "accent"
            ? "var(--sl-accent)"
            : "var(--sl-muted)";
      lead.append(
        svg("line", {
          x1: r1(s[0]),
          y1: r1(s[1]),
          x2: r1(t[0]),
          y2: r1(t[1]),
          stroke: col,
          "stroke-width": 3,
          "stroke-linecap": "round",
        }),
        svg("circle", { cx: r1(t[0]), cy: r1(t[1]), r: 7, fill: col }),
      );
      el.prepend(lead);
    }
  }
  const fit = () => {
    body.style.setProperty("--fit", "1");
    const H = card.clientHeight;
    if (!H) return;
    const k = fitScale(
      (k) => {
        body.style.setProperty("--fit", String(k));
        return card.scrollHeight > H + 1;
      },
      fitFloor(parseFloat(css["font-size"]) * 0.86),
    );
    body.style.setProperty("--fit", String(k));
  };
  return { el, block: b, layout: fit, destroy: () => el.remove() };
}
function markerBlock(b: Of<"marker">, env: BlockEnv): BlockView {
  const el = mk("div", `sl-b sl-marker ${b.shape === "square" ? "sq" : "ci"}`);
  const c = color(b.color ?? "accent", env.theme, "accent");
  el.style.setProperty("--mk", c);
  const n = mk("span", "sl-marker-n", String(b.n));
  n.style.fontSize = `${Math.round(Math.min(b.frame.w, b.frame.h) * 0.5)}px`;
  el.append(n);
  el.setAttribute("aria-hidden", "true");
  return { el, block: b, destroy: () => el.remove() };
}

// ------------------------------------------------------------------ diagram
const SVG_MOVE =
  "M12 2l3 3h-2v6h6V9l3 3-3 3v-2h-6v6h2l-3 3-3-3h2v-6H5v2l-3-3 3-3v2h6V5H9z";
/**
 * A diagram drawn in slide units: the widget gets the block's logical size (1 unit = 1 px), the slide theme's
 * tokens, no background, no frame (SPEC slides v2 §5). The caption, the drag instruction and what is not to scale
 * go to a hint row under the drawing.
 */
function diagramBlock(b: Of<"diagram">, env: BlockEnv): BlockView {
  const el = mk("div", "sl-b sl-diagram");
  const box = mk("div", "sl-diagram-box");
  el.append(box);
  const label = loc(b.alt, env.lang) || undefined;
  if (label) box.setAttribute("aria-label", label);
  const d =
    b.d ?? (b.fromCalc ? env.calcProblem?.(b.fromCalc)?.diagram : undefined);
  const interactive = env.mode === "play" && !!b.interactive;
  const canDrag =
    !!b.interactive && d?.kind === "calc" && !!d.calc.drag?.length;
  const cap = b.caption
    ? loc(b.caption, env.lang)
    : d?.kind === "hold" && !d.quiet
      ? holdFootText(d.inbound, d.turn, d.fix, env.lang)
      : "";
  const hintH = cap || canDrag || d?.kind === "calc" ? HINT_H : 0;
  const W = b.frame.w;
  const H = Math.max(80, b.frame.h - hintH);
  box.style.height = `${H}px`;
  const palette = slidePalette(env.theme);
  let pane: DiagramPane | null = null;
  let widget: DiagramWidget<unknown> | null = null;
  let slot: SlotHandle | null | void = null;
  let unhub: (() => void) | null = null;
  if (!d && !b.asset) {
    box.append(
      mk("div", "sl-missing", b.fromCalc ? tx("calcSlot", env.lang) : "—"),
    );
  } else if (d?.kind === "airspace") {
    box.classList.add("is-svg");
    // our own SVG string, author text escaped inside airspaceSvg
    box.innerHTML = airspaceSvg(d.sketch, paletteOf(env.theme), env.lang);
    box.firstElementChild?.setAttribute("role", "img");
    if (label) box.firstElementChild?.setAttribute("aria-label", label);
  } else if (d?.kind === "calc") {
    // what the drawing says to a screen reader (a goal met, an answer checked)
    const say = mk("div", "sl-sr");
    say.setAttribute("aria-live", "polite");
    el.append(say);
    const hub = env.diagrams;
    const live = () => hub?.changed(b.id);
    widget = createCalcDiagram(d.calc, {
      theme: diagramThemeOf(env.theme),
      palette,
      lang: env.lang,
      drag: interactive ? (d.calc.drag ?? []) : [],
      label,
      w: W,
      h: H,
      u: 1,
      transparent: true,
      card: false,
      animate: env.mode === "play",
      // a drawing that checks its own goals (the hold flown): each met goal and all of them reveal like a step goal
      onGoal: (met) => {
        met.forEach((m, i) => m && env.fire(`afterCheck:${i}`));
        if (met.length && met.every(Boolean)) env.fire("goalMet");
      },
      onChange: live,
      onLive: live,
      announce: (t) => {
        say.textContent = "";
        // a fresh node each time: the same sentence twice is read twice
        requestAnimationFrame(() => (say.textContent = t));
      },
    }) as DiagramWidget<unknown> | null;
    if (widget?.live && widget.follow && hub) {
      const w = widget;
      unhub = hub.add(b.id, {
        live: () => w.live!(),
        follow: (st) => w.follow!(st),
      });
    }
    if (widget) box.append(widget.el);
    else {
      slot = env.slots?.calcDiagram?.(d, box, {
        mode: env.mode,
        lang: env.lang,
        theme: env.theme,
        step: env.step,
        fire: env.fire,
        interactive,
      });
      if (!slot) box.append(mk("div", "sl-missing", d.calc.kind));
    }
  } else if (d) {
    pane = diagramPane(d, b.asset, {
      theme: diagramThemeOf(env.theme),
      palette,
      lang: env.lang,
      interactive,
      assetUrl: env.assetUrl,
      label,
      w: W,
      h: H,
      u: 1,
      transparent: true,
      card: false,
    });
    box.append(pane.el);
  } else if (b.asset) {
    const img = mk("img");
    img.alt = label ?? "";
    Promise.resolve(env.assetUrl?.(b.asset) ?? null).then((u) =>
      u
        ? (img.src = u)
        : img.replaceWith(
            mk("div", "sl-missing", tx("imageMissing", env.lang)),
          ),
    );
    box.append(img);
  }
  // the hint row: the drag instruction (or the caption) and what is not drawn to scale
  const note = widget?.note?.() ?? null;
  const hint = [cap, note].filter(Boolean).join(" · ");
  if (hintH && hint) {
    const row = mk("div", "sl-diagram-cap sl-hint");
    applyCss(row, typeCss(env.theme, "foot"));
    if (canDrag) {
      const ic = svg("svg", {
        viewBox: "0 0 24 24",
        width: 28,
        height: 28,
        class: "sl-hint-ic",
        "aria-hidden": "true",
      });
      ic.append(svg("path", { d: SVG_MOVE, fill: "currentColor" }));
      row.append(ic);
    }
    row.append(mk("span", "", hint));
    el.append(row);
    el.classList.add("has-caption");
  }
  return {
    el,
    block: b,
    destroy: () => {
      unhub?.();
      widget?.destroy();
      pane?.destroy();
      if (slot) slot.destroy?.();
      el.remove();
    },
  };
}

// ------------------------------------------------------------------ instrument
/** a finger may be the pointer (a tablet, a phone, a touch laptop): the strip keeps 44 CSS px targets */
const coarsePointer = (): boolean =>
  typeof navigator !== "undefined" &&
  ((navigator.maxTouchPoints ?? 0) > 0 ||
    (typeof matchMedia === "function" &&
      matchMedia("(any-pointer: coarse)").matches));
function yourTurnButton(
  env: BlockEnv,
  b: SlideBlock,
  yt: YourTurn,
  sim: boolean,
): HudItem {
  const btn = mk("button", `sl-hud-btn sl-yourturn${sim ? " is-sim" : ""}`);
  btn.type = "button";
  const ic = mk("span", "sl-hud-ic");
  ic.setAttribute("aria-hidden", "true");
  btn.append(
    ic,
    mk("span", "", sim ? tx("openSim", env.lang) : tx("yourTurn", env.lang)),
  );
  btn.title = loc(yt.prompt, env.lang);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    env.onYourTurn?.(b, yt);
  });
  return { el: btn, at: [1, 1], origin: [1, 1] };
}
function instrumentBlock(b: Of<"instrument">, env: BlockEnv): BlockView {
  const el = mk("div", "sl-b sl-instrument");
  let scene: string | import("../types").SimScene | undefined =
    b.scene ?? env.slideScene;
  if (b.fromCalc) {
    const pr = env.calcProblem?.(b.fromCalc);
    if (pr?.stage) {
      scene = {
        v: 1,
        id: `calc:${b.fromCalc}`,
        world: { kind: "training" },
        cockpit: env.sims.env.cockpit ?? "g1000",
        pose: pr.stage.pose,
        weather: pr.stage.weather ?? {},
        seed: pr.seed,
      };
    }
  }
  const isDemo = !scene || scene === DEMO_SCENE_ID;
  if (!scene) scene = DEMO_SCENE_ID;
  // the animation: the block's own, else the slide's on the same situation (one aircraft on the slide)
  const motion =
    b.motion ?? (typeof scene === "string" ? env.motionOf?.(scene) : undefined);
  const mode =
    env.mode === "play"
      ? b.mode === "clip"
        ? "frozen"
        : (b.mode ?? "frozen")
      : "frozen";
  // the control strip of a live instrument (canvas/controlStrip.ts): inside the block's frame, the instrument
  // makes room for it; a block without controls is drawn exactly as before
  const side = stripShown(b);
  const zoom = () =>
    env.mode === "thumb" ? 1 : stripZoom(env.scale(), coarsePointer());
  const shape = instrumentFrame(b.view, env.sims.env.cockpit ?? "g1000").rect;
  const aspect = shape[2] / shape[3];
  let plan: StripPlan | null = side
    ? stripPlan(b.controls, side, b.frame.w, b.frame.h, zoom(), aspect)
    : null;
  let strip: ControlStrip | null = null;
  const inst = new SlideInstrument(env.sims, {
    view: b.view,
    scene,
    failures: b.failures,
    covers: b.covers,
    annotations: b.annotations,
    mode,
    bezel: b.bezel,
    lang: env.lang,
    w: b.frame.w,
    h: b.frame.h,
    scale: env.scale,
    still: env.mode === "thumb",
    alt: b.alt ? loc(b.alt, env.lang) : undefined,
    ...(plan ? { box: plan.inst } : {}),
    onDraw: () => strip?.refresh(),
    ...(motion
      ? {
          motion,
          motionRest:
            env.mode === "play" ? ("start" as const) : ("telling" as const),
        }
      : {}),
  });
  el.append(inst.el);
  const run = inst.entry?.motion;
  if (run) el.dataset.motion = run.state;
  if (isDemo && env.mode === "edit")
    el.dataset.demo = tx("sampleScene", env.lang);
  let chip: HTMLElement | null = null;
  if (env.mode !== "thumb" && mode === "live") {
    chip = mk("span", "sl-live", tx("live", env.lang));
    el.append(chip);
  }
  const entry = inst.entry;
  if (plan && entry) {
    const pilot = env.sims.pilot(entry, b.controls ?? []);
    const editing = env.mode === "edit";
    strip = new ControlStrip({
      controls: b.controls ?? [],
      lang: env.lang,
      sim: () => inst.sim,
      pilot,
      interactive: env.mode !== "thumb" && !env.mirror,
      mirror: !!env.mirror,
      changed: (c) => {
        if (editing) {
          // the author's try: a knob only redraws the frozen instrument, a flying control starts the clock
          const w = stripWidget(c);
          if (w === "slider" || w === "lever") env.sims.run(entry, true);
          else env.sims.touch(entry);
          stripTrialChanged();
        } else if (inst.mode !== "live") env.sims.touch(entry);
        else inst.invalidate();
      },
      reset: () => {
        env.sims.restart(entry);
        if (editing) {
          env.sims.run(entry, false);
          stripTrialChanged();
        }
      },
    });
    el.classList.add("has-strip");
    el.append(strip.el, strip.resetEl);
    if (editing)
      setStripTrial(b.id, {
        sim: () => inst.sim,
        dirty: () => pilot.dirty,
        reset: () => strip?.resetEl.click(),
      });
  } else plan = null;
  const place = () => {
    if (!plan || !strip) return;
    inst.setBox(plan.inst);
    strip.setPlan(plan);
    // « Réinitialiser » and the live chip sit on the instrument's top corners
    const r = strip.resetEl.style;
    r.right = `${b.frame.w - (plan.inst.x + plan.inst.w) + 14}px`;
    r.top = `${plan.inst.y + 14}px`;
    if (chip) {
      chip.style.left = `${plan.inst.x + 14}px`;
      chip.style.top = `${plan.inst.y + 14}px`;
    }
  };
  place();
  // the projector shows the strip to the room: nobody handles it there
  const onProjector = () => {
    if (!strip || !strip.el.closest(".cp-projector")) return;
    strip.el.setAttribute("inert", "");
    strip.el.classList.add("is-static");
    strip.resetEl.hidden = true;
  };
  if (
    strip &&
    env.mode === "play" &&
    typeof requestAnimationFrame === "function"
  )
    requestAnimationFrame(onProjector);
  const hud: HudItem[] = [];
  // « Rejouer » / « Pause » on the instrument that carries the animation (the slide plays it by itself)
  let unMotion: (() => void) | null = null;
  if (run && env.mode === "play" && b.motion) {
    const item = motionButton(env, run, () => inst.invalidate());
    // outside the instrument, by its lower-left corner (re-walk P2: it sat on the altimeter's bezel); a block
    // against the slide's left edge keeps it inside, in the drawing's corner
    const room = b.frame.x >= 72;
    item.at = room
      ? [0, 1]
      : plan
        ? [
            (plan.inst.x + 8) / b.frame.w,
            (plan.inst.y + plan.inst.h - 8) / b.frame.h,
          ]
        : [0, 1];
    item.origin = room ? [1, 1] : [0, 1];
    hud.push(item);
    unMotion = item.off;
  }
  if (run && env.mode === "edit")
    unMotion = registerReplay(b.id, () => {
      run.replay();
      inst.invalidate();
    });
  if (run) {
    const off = run.on((r) => (el.dataset.motion = r.state));
    const prev = unMotion;
    unMotion = () => {
      off();
      prev?.();
    };
  }
  if (env.mode === "play" && b.yourTurn) {
    const btn = yourTurnButton(env, b, b.yourTurn, b.yourTurn.where === "sim");
    // the student takes the controls: the animation never moves under them
    if (run)
      btn.el.addEventListener("click", () => run.pause(), { capture: true });
    // « À vous » stays on the instrument: it never covers a control of the strip
    if (plan)
      btn.at = [
        (plan.inst.x + plan.inst.w - 24) / b.frame.w,
        (plan.inst.y + plan.inst.h - 24) / b.frame.h,
      ];
    hud.push(btn);
  }
  return {
    el,
    block: b,
    inst,
    hud,
    layout: () => {
      if (side && strip) {
        const next = stripPlan(
          b.controls,
          side,
          b.frame.w,
          b.frame.h,
          zoom(),
          aspect,
        );
        if (next && (!plan || next.z !== plan.z)) {
          plan = next;
          place();
        }
        onProjector();
      }
      inst.resized();
    },
    revealed: (on) => inst.setShown(on),
    destroy: () => {
      unMotion?.();
      if (strip && env.mode === "edit") setStripTrial(b.id, null);
      strip?.destroy();
      inst.destroy();
      el.remove();
    },
  };
}

// ------------------------------------------------------------------ animation button (canvas/motion.ts)
const MOTION_WORDS = {
  pause: ["Pause", "Pause"],
  resume: ["Resume", "Reprendre"],
  replay: ["Replay", "Rejouer"],
} as const;
/** « Pause » while it plays, « Reprendre » when paused, « Rejouer » at the end; gone once the student flies. */
function motionButton(
  env: BlockEnv,
  run: MotionRun,
  redraw: () => void,
): HudItem & { off: () => void } {
  const btn = mk("button", "sl-hud-btn sl-motion-btn");
  btn.type = "button";
  const ic = mk("span", "sl-hud-ic");
  ic.setAttribute("aria-hidden", "true");
  // a small round button in the corner of the instrument (its word is its name and tooltip): it never covers a face
  const word = mk("span", "sl-motion-w");
  btn.append(ic, word);
  const sync = () => {
    const s = run.state;
    const k = s === "playing" ? "pause" : s === "paused" ? "resume" : "replay";
    btn.dataset.state = k;
    word.textContent = MOTION_WORDS[k][env.lang === "fr" ? 1 : 0];
    btn.title = word.textContent;
    btn.classList.toggle("is-gone", s === "handed");
    btn.disabled = s === "handed";
  };
  sync();
  const off = run.on(sync);
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (run.state === "playing") run.pause();
    else if (run.state === "paused") run.resume();
    else run.replay();
    redraw();
  });
  return { el: btn, at: [0, 1], origin: [0, 1], off };
}

// ------------------------------------------------------------------ sim viewport
const VIEW_KEY = {
  cockpit: "cockpitView",
  outside: "outsideView",
  panel: "panelView",
} as const;
function simViewportBlock(b: Of<"simViewport">, env: BlockEnv): BlockView {
  const el = mk("div", `sl-b sl-viewport v-${b.view}`);
  const box = mk("div", "sl-vp-box");
  el.append(box);
  box.setAttribute("role", "img");
  box.setAttribute(
    "aria-label",
    b.alt ? loc(b.alt, env.lang) : tx(VIEW_KEY[b.view], env.lang),
  );
  const slot = env.slots?.simViewport?.(b, box, {
    mode: env.mode,
    lang: env.lang,
    theme: env.theme,
    step: env.step,
    fire: env.fire,
  });
  let inst: SlideInstrument | undefined;
  let stopOutside: (() => void) | undefined;
  if (!slot) {
    if (b.poster) {
      const img = mk("img", "sl-vp-poster");
      img.alt = "";
      Promise.resolve(env.assetUrl?.(b.poster) ?? null).then((u) =>
        u ? (img.src = u) : img.remove(),
      );
      box.append(img);
    } else if (b.view === "panel") {
      inst = new SlideInstrument(env.sims, {
        view: { kind: env.sims.env.cockpit === "steam" ? "six" : "pfd" },
        scene: b.scene ?? env.slideScene ?? DEMO_SCENE_ID,
        mode: "frozen",
        bezel: false,
        lang: env.lang,
        w: b.frame.w,
        h: b.frame.h,
        scale: env.scale,
        still: env.mode === "thumb",
        ...(env.motionOf?.(b.scene ?? env.slideScene ?? DEMO_SCENE_ID)
          ? {
              motion: env.motionOf(b.scene ?? env.slideScene ?? DEMO_SCENE_ID),
              motionRest:
                env.mode === "play" ? ("start" as const) : ("telling" as const),
            }
          : {}),
      });
      box.append(inst.el);
    } else {
      const cv = mk("canvas", "sl-vp-still");
      box.append(cv);
      // the slide's own aircraft (with the animation another block of the slide plays on it): the view follows it
      const sid = b.scene ?? env.slideScene ?? DEMO_SCENE_ID;
      const mo = env.motionOf?.(sid);
      const entry = mo
        ? env.sims.get(
            sid,
            undefined,
            mo,
            env.mode === "play" ? "start" : "telling",
          )
        : env.sims.get(sid);
      const W = env.mode === "thumb" ? 480 : 960;
      const H = Math.max(
        1,
        Math.round((W * b.frame.h) / Math.max(1, b.frame.w)),
      );
      cv.width = W;
      cv.height = H;
      stopOutside = mountOutsideView(cv, () => entry?.sim ?? null, {
        cockpit: b.view === "cockpit",
        night: entry?.scene.timeOfDay === "night",
        // a cloud layer only when the situation has one (a clear day says 25,000 ft)
        ...(entry?.scene.weather?.ceilingFt !== undefined &&
        entry.scene.weather.ceilingFt < 20000
          ? {
              cloud: {
                baseFt: entry.scene.weather.ceilingFt,
                topFt:
                  entry.scene.weather.cloudTopFt ??
                  entry.scene.weather.ceilingFt + 3000,
              },
            }
          : {}),
        live: env.mode !== "thumb",
      });
    }
  }
  const bar = mk("div", "sl-vp-bar");
  bar.append(mk("span", "sl-vp-tag", tx(VIEW_KEY[b.view], env.lang)));
  if (b.clip) bar.append(mk("span", "sl-vp-tag dim", tx("demoClip", env.lang)));
  el.append(bar);
  const hud: HudItem[] = [];
  if (env.mode === "play") {
    if (b.clip) {
      const play = mk("button", "sl-hud-btn sl-play");
      play.type = "button";
      play.setAttribute("aria-label", tx("play", env.lang));
      const ic = mk("span", "sl-play-ic");
      ic.setAttribute("aria-hidden", "true");
      play.append(ic, mk("span", "", tx("play", env.lang)));
      play.addEventListener("click", (e) => {
        e.stopPropagation();
        env.onAction?.({ k: "playClip", block: b.id }, b);
      });
      hud.push({ el: play, at: [0.5, 0.5], origin: [0.5, 0.5] });
    }
    if (b.yourTurn) hud.push(yourTurnButton(env, b, b.yourTurn, true));
  } else if (env.mode === "edit") {
    if (b.clip) box.append(mk("span", "sl-vp-playglyph"));
  }
  if (b.clip && env.mode === "thumb") box.append(mk("span", "sl-vp-playglyph"));
  return {
    el,
    block: b,
    inst,
    hud,
    layout: () => inst?.resized(),
    destroy: () => {
      if (slot) slot.destroy?.();
      inst?.destroy();
      stopOutside?.();
      el.remove();
    },
  };
}

// ------------------------------------------------------------------ quiz
/** Short answers are tiles (SPEC slides v2 §7): ≤ 4 options of ≤ 12 characters; longer ones are rows. Pure. */
/** Columns of a tiled quiz in a block `w` wide (a tile is at least 200 wide, 24 apart). */
export const quizTileCols = (n: number, w: number): number =>
  Math.max(1, Math.min(n, Math.floor((w + 24) / 224)));
/** Short answers ("1 NM", "060") show as big tiles, the rest as rows. Given the block width, a tile is used only
 *  when every answer fits its tile on one line at the tile size (72 px semibold, 24 px padding each side). */
export function quizUsesTiles(
  options: { text: { en: string; fr?: string } }[],
  lang: Lang,
  w?: number,
): boolean {
  if (
    options.length < 2 ||
    options.length > 4 ||
    !options.every((o) => plainText(loc(o.text, lang)).length <= 12)
  )
    return false;
  if (w === undefined) return true;
  const cols = quizTileCols(options.length, w);
  const inner = (w - (cols - 1) * 24) / cols - 48 - 4;
  return options.every(
    (o) => textWidth(plainText(loc(o.text, lang)), 72, 600, -0.02) <= inner,
  );
}
/** The quiz on a slide: an eyebrow, the question, tiles or rows, the feedback. No outer card; the options are the
 *  only surfaces. The content scales down (never under 24 px) when the block is too small for it. */
function quizBlock(b: Of<"quiz">, env: BlockEnv): BlockView {
  const el = mk("div", "sl-b sl-quiz");
  const slot = env.slots?.quiz?.(b, el, {
    mode: env.mode,
    lang: env.lang,
    theme: env.theme,
    step: env.step,
    fire: env.fire,
  });
  const inner = mk("div", "sl-q-in");
  let fit: (() => void) | undefined;
  if (!slot) {
    el.append(inner);
    const q = b.quiz;
    // the slide's own eyebrow already says « Question »: never say it twice
    const said = env.step?.slide?.blocks.some(
      (x) =>
        x.kind === "text" &&
        (x.style === "eyebrow" || x.style === "label") &&
        /question|quiz/i.test(x.text.en),
    );
    if (!said)
      inner.append(mk("div", "sl-q-eyebrow", tx("quizSlot", env.lang)));
    const prompt = mk("div", "sl-q-prompt");
    const pr =
      "prompt" in q && q.prompt
        ? loc(q.prompt, env.lang)
        : tx("calcSlot", env.lang);
    prompt.append(richFragment(pr, { lang: env.lang }));
    inner.append(prompt);
    if (q.kind === "mcq") {
      const tiles = quizUsesTiles(q.options, env.lang, b.frame.w);
      el.classList.add(tiles ? "is-tiles" : "is-rows");
      const list = mk("div", "sl-q-opts");
      if (tiles)
        list.style.setProperty(
          "--cols",
          String(quizTileCols(q.options.length, b.frame.w)),
        );
      list.setAttribute("role", env.mode === "play" ? "radiogroup" : "list");
      const why = mk("div", "sl-q-why");
      // the longest feedback reserves its room while fitting (no jump when it appears)
      const whyTexts = [
        loc(q.explain, env.lang),
        ...q.options.map((o) => (o.why ? loc(o.why, env.lang) : "")),
      ];
      const longest = whyTexts.reduce(
        (a, x) => (x.length > a.length ? x : a),
        "",
      );
      q.options.forEach((o, i) => {
        const opt = mk(env.mode === "play" ? "button" : "div", "sl-q-opt");
        if (opt instanceof HTMLButtonElement) opt.type = "button";
        const st = mk("span", "sl-q-state");
        opt.append(
          mk("span", "sl-q-k", String.fromCharCode(65 + i)),
          mk("span", "sl-q-v", loc(o.text, env.lang)),
          st,
        );
        if (env.mode === "play")
          opt.addEventListener("click", (e) => {
            e.stopPropagation();
            if (el.classList.contains("answered")) return;
            el.classList.add("answered");
            // a first wrong answer marks only the chosen one: the student tries again before seeing the right one
            // (re-walk P2); a second wrong answer, or a right one, shows it
            const tries =
              Number(el.dataset.wrong ?? "0") + (i === q.answer ? 0 : 1);
            el.dataset.wrong = String(tries);
            const reveal = i === q.answer || tries >= 2;
            if (!reveal) {
              list.querySelectorAll(".sl-q-opt").forEach((x, j) => {
                x.classList.toggle("is-wrong", j === i);
                const state = x.querySelector(".sl-q-state");
                if (state)
                  state.textContent =
                    j === i ? `✗ ${tx("quizWrong", env.lang)}` : "";
              });
              const verdict = mk(
                "b",
                "",
                `${tx("quizWrong", env.lang).split(" · ")[0]}. `,
              );
              why.replaceChildren(
                verdict,
                richFragment(
                  o.why ? loc(o.why, env.lang) : tx("quizNotThis", env.lang),
                  { lang: env.lang },
                ),
              );
              why.classList.remove("is-reserve");
              env.fire("answered");
              env.fire("quizWrong");
              return;
            }
            list.querySelectorAll(".sl-q-opt").forEach((x, j) => {
              x.classList.toggle("is-right", j === q.answer);
              x.classList.toggle("is-wrong", j === i && i !== q.answer);
              const state = x.querySelector(".sl-q-state");
              // never colour alone: a mark and a word on both cards
              if (state)
                state.textContent =
                  j === q.answer
                    ? `✓ ${i === q.answer ? tx("quizRight", env.lang) : tx("quizRightAnswer", env.lang)}`
                    : j === i
                      ? `✗ ${tx("quizWrong", env.lang)}`
                      : "";
            });
            // the live region says the result first, then why
            const verdict = mk(
              "b",
              "",
              `${i === q.answer ? tx("quizRight", env.lang) : tx("quizWrong", env.lang).split(" · ")[0]}. `,
            );
            why.replaceChildren(
              verdict,
              richFragment(
                withoutVerdict(
                  loc(o.why ?? q.explain, env.lang),
                  i === q.answer,
                ),
                { lang: env.lang },
              ),
            );
            why.classList.remove("is-reserve");
            env.fire("answered");
            env.fire("answerShown");
            env.fire(i === q.answer ? "quizRight" : "quizWrong");
          });
        list.append(opt);
      });
      why.setAttribute("aria-live", "polite");
      why.classList.add("is-reserve");
      why.append(richFragment(longest, { lang: env.lang }));
      inner.append(list, why);
    } else {
      inner.append(mk("div", "sl-q-hint", tx("answeredInPlayer", env.lang)));
    }
    fit = () => {
      inner.style.setProperty("--q", "1");
      const H = el.clientHeight;
      if (!H) return;
      const k = fitScale((k) => {
        inner.style.setProperty("--q", String(k));
        return inner.scrollHeight > H + 1;
      }, MIN_TEXT_PX / 34);
      inner.style.setProperty("--q", String(k));
    };
  }
  return {
    el,
    block: b,
    layout: fit,
    destroy: () => (slot?.destroy?.(), el.remove()),
  };
}

// ------------------------------------------------------------------ calc
function fmtNum(v: number | string, lang: Lang): string {
  if (typeof v === "string") return v;
  const s =
    Math.abs(v) >= 1000
      ? Math.round(v).toLocaleString(lang === "fr" ? "fr-FR" : "en-US")
      : String(Math.round(v * 100) / 100);
  return lang === "fr" ? s.replace(".", ",") : s;
}
function calcBlock(b: Of<"calc">, env: BlockEnv): BlockView {
  const el = mk("div", "sl-b sl-card sl-calc");
  const slot = env.slots?.calc?.(b, el, {
    mode: env.mode,
    lang: env.lang,
    theme: env.theme,
    step: env.step,
    fire: env.fire,
  });
  if (!slot) {
    let p: CalcProblem | null = null;
    try {
      // a stable preview (seed 1) in the editor and thumbnails; the attempt's numbers in the player
      p = problemFor(b.calc, env.mode === "play" ? undefined : 1);
    } catch {
      p = null;
    }
    const show = new Set(b.show ?? ["prompt", "givens"]);
    const head = mk("div", "sl-card-head");
    head.append(mk("span", "sl-card-label", tx("calcSlot", env.lang)));
    if (b.calc.seed === undefined)
      head.append(mk("span", "sl-chip", tx("calcNewNumbers", env.lang)));
    el.append(head);
    if (!p) el.append(mk("div", "sl-missing", b.calc.generatorId));
    else {
      if (show.has("prompt")) {
        const pr = mk("div", "sl-card-prompt");
        pr.append(richFragment(loc(p.prompt, env.lang)));
        el.append(pr);
      }
      if (show.has("givens") && p.givens.length) {
        const g = mk("dl", "sl-givens");
        for (const x of p.givens) {
          const dt = mk("dt", "", loc(x.label, env.lang));
          const unit = x.unit ? loc(UNIT_LABEL[x.unit], env.lang) : "";
          const dd = mk(
            "dd",
            "",
            x.display
              ? loc(x.display, env.lang)
              : `${fmtNum(x.value, env.lang)}${unit ? ` ${unit}` : ""}`,
          );
          g.append(dt, dd);
        }
        el.append(g);
      }
      if (show.has("formula")) {
        const f = mk("div", "sl-formula");
        f.append(
          mk(
            "span",
            "sl-card-label",
            env.lang === "fr" ? "Formule" : "Formula",
          ),
          mk("code", "", loc(p.formula, env.lang)),
        );
        f.append(
          mk(
            "span",
            "sl-card-label",
            env.lang === "fr" ? "Règle pratique" : "Rule of thumb",
          ),
          mk("span", "", loc(p.ruleOfThumb, env.lang)),
        );
        el.append(f);
      }
      const unit = loc(UNIT_LABEL[b.calc.unit ?? p.unit], env.lang);
      if (show.has("answer") && env.mode !== "play") {
        el.append(
          mk(
            "div",
            "sl-answer-shown",
            `${tx("answer", env.lang)} · ${p.answerText ? loc(p.answerText, env.lang) : `${fmtNum(p.answer, env.lang)} ${unit}`}`,
          ),
        );
      } else {
        const row = mk("div", "sl-answer");
        const input = mk("input", "sl-answer-in");
        input.inputMode = "decimal";
        input.setAttribute("aria-label", tx("answer", env.lang));
        input.placeholder = tx("answer", env.lang);
        input.disabled = env.mode !== "play";
        const u = mk("span", "sl-answer-unit", unit);
        const btn = mk(
          "button",
          "sl-btn",
          env.lang === "fr" ? "Vérifier" : "Check",
        );
        btn.type = "button";
        btn.disabled = env.mode !== "play";
        const verdict = mk("div", "sl-verdict");
        verdict.setAttribute("aria-live", "polite");
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const v = Number(input.value.replace(",", ".").replace(/\s/g, ""));
          if (!p || !Number.isFinite(v)) return;
          const r = checkAnswer(p, { answer: v, unit: b.calc.unit }, b.calc);
          verdict.className = `sl-verdict ${r.ok ? "ok" : "bad"}`;
          verdict.textContent = r.ok
            ? env.lang === "fr"
              ? "Juste."
              : "Correct."
            : r.mistake
              ? loc(r.mistake.text, env.lang)
              : env.lang === "fr"
                ? "Pas tout à fait : reprenez le calcul."
                : "Not quite: work it through again.";
          env.fire("answered");
          env.fire(r.ok ? "calcRight" : "calcWrong");
        });
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") btn.click();
          e.stopPropagation();
        });
        row.append(input, u, btn);
        el.append(row, verdict);
      }
      if (show.has("solution") && env.mode !== "play") {
        const ol = mk("ol", "sl-solution");
        for (const s of p.solutionSteps)
          ol.append(mk("li", "", plainText(loc(s, env.lang))));
        el.append(ol);
      }
    }
  }
  // the card scales down as one piece when the problem is long (never under 80 %: its text stays ≥ 24 px)
  let inner: HTMLDivElement | null = null;
  if (!slot) {
    inner = mk("div", "sl-calc-in");
    inner.append(...Array.from(el.childNodes));
    el.append(inner);
  }
  const fit = () => {
    if (!inner) return;
    inner.style.transform = "";
    inner.style.width = "";
    const H = el.clientHeight;
    const need = inner.scrollHeight;
    if (!H || need <= H + 1) return;
    const k = Math.max(0.8, H / need);
    inner.style.transformOrigin = "0 0";
    inner.style.transform = `scale(${k})`;
    inner.style.width = `${b.frame.w / k}px`;
  };
  return {
    el,
    block: b,
    layout: fit,
    destroy: () => (slot?.destroy?.(), el.remove()),
  };
}

// ------------------------------------------------------------------ checklist ("Do this", ticked by the sim)
/** Check rows (SPEC slides v2 §7): a 40 px tick and 34 px ink text, 2 px rules between; never clipped (the rows
 *  scale down together, never under 24 px, when the block is too small). */
function checklistBlock(b: Of<"checklist">, env: BlockEnv): BlockView {
  const el = mk("div", "sl-b sl-checklist");
  const inner = mk("div", "sl-ck-in");
  el.append(inner);
  const head = mk("div", "sl-ck-head");
  head.append(
    mk(
      "span",
      "sl-ck-title",
      b.title ? loc(b.title, env.lang) : tx("doThis", env.lang),
    ),
  );
  if (b.rows.some((r) => r.check !== undefined))
    head.append(mk("span", "sl-ck-live", tx("checkedBySim", env.lang)));
  inner.append(head);
  const list = mk("ul", "sl-rows");
  list.setAttribute("aria-live", env.mode === "play" ? "polite" : "off");
  const rows = b.rows.map((r) => {
    const li = mk("li", r.check === undefined ? "sl-row plain" : "sl-row");
    const tick = mk("span", "sl-tick");
    tick.setAttribute("aria-hidden", "true");
    const t = mk("span", "sl-row-t");
    t.append(richFragment(loc(r.text, env.lang), { lang: env.lang }));
    const v = mk("span", "sl-row-v");
    li.append(tick, t, v);
    list.append(li);
    return { r, li, v };
  });
  inner.append(list);
  const sim = () => env.sims.get(env.slideScene ?? DEMO_SCENE_ID)?.sim ?? null;
  // the goal each row stands for (the slide's « À vous », else the step's): a row met earlier keeps its tick, but its
  // value turns neutral once the aircraft has left the band again (re-walk P2: « 64 kt » in green under « 70 à 85 »)
  const goalChecks =
    env.step?.slide?.blocks
      .map((k) => ("yourTurn" in k ? k.yourTurn?.goal.all : undefined))
      .find((g) => g?.length) ??
    env.step?.goal?.all ??
    [];
  const tick = () => {
    const s = sim();
    let view: ReturnType<typeof stageView> | null = null;
    for (const x of rows) {
      const c = x.r.check !== undefined ? goalChecks[x.r.check] : undefined;
      if (s && c && x.li.classList.contains("done")) {
        try {
          view ??= stageView(s);
          x.li.classList.toggle("drift", !evalGoal(c, view));
        } catch {
          x.li.classList.remove("drift");
        }
      } else x.li.classList.remove("drift");
      // met earlier, out of tolerance now: never a green tick alone, the word says it
      const drift = x.li.classList.contains("drift");
      if (x.r.readout && s) {
        const t = readoutText(s, x.r.readout, env.lang) ?? "";
        x.v.textContent = drift
          ? `${t}${t ? " · " : ""}${tx("goalDrift", env.lang)}`
          : t;
      } else if (drift) {
        x.v.textContent = tx("goalDrift", env.lang);
        x.v.dataset.drift = "1";
      } else if (x.v.dataset.drift) {
        x.v.textContent = "";
        delete x.v.dataset.drift;
      }
    }
  };
  tick();
  let met: readonly boolean[] = [];
  const fit = () => {
    inner.style.setProperty("--q", "1");
    const H = el.clientHeight;
    if (!H) return;
    const k = fitScale((k) => {
      inner.style.setProperty("--q", String(k));
      return inner.scrollHeight > H + 1;
    }, MIN_TEXT_PX / 34);
    inner.style.setProperty("--q", String(k));
  };
  return {
    el,
    block: b,
    layout: fit,
    setChecks(m) {
      met = m;
      let current = false;
      for (const x of rows) {
        const ok = x.r.check !== undefined && !!met[x.r.check];
        x.li.classList.toggle("done", ok);
        const isCur = !ok && !current && x.r.check !== undefined;
        x.li.classList.toggle("current", isCur);
        if (isCur) current = true;
      }
    },
    tick,
    destroy: () => el.remove(),
  };
}

// ------------------------------------------------------------------ dispatch
export function renderBlock(b: SlideBlock, env: BlockEnv): BlockView {
  switch (b.kind) {
    case "text":
      return textBlock(b, env);
    case "image":
      return imageBlock(b, env);
    case "shape":
      return shapeBlock(b, env);
    case "arrow":
      return arrowBlock(b, env);
    case "callout":
      return calloutBlock(b, env);
    case "marker":
      return markerBlock(b, env);
    case "diagram":
      return diagramBlock(b, env);
    case "instrument":
      return instrumentBlock(b, env);
    case "simViewport":
      return simViewportBlock(b, env);
    case "quiz":
      return quizBlock(b, env);
    case "calc":
      return calcBlock(b, env);
    case "checklist":
      return checklistBlock(b, env);
    default: {
      const el = mk(
        "div",
        "sl-b sl-missing",
        (b as { kind?: string }).kind ?? "?",
      );
      return { el, block: b, destroy: () => el.remove() };
    }
  }
}

/** The accessible name of a block (screen readers, the layers list, the linear reader). */
export function blockLabel(b: SlideBlock, lang: Lang): string {
  if (b.alt) return loc(b.alt, lang);
  switch (b.kind) {
    case "text":
      return plainText(loc(b.text, lang));
    case "callout":
      return `${b.n !== undefined ? `${b.n}. ` : ""}${plainText(loc(b.text, lang))}`;
    case "marker":
      return String(b.n);
    case "checklist":
      return b.rows.map((r) => plainText(loc(r.text, lang))).join("; ");
    case "quiz":
      return "prompt" in b.quiz && b.quiz.prompt
        ? plainText(loc(b.quiz.prompt, lang))
        : tx("quizSlot", lang);
    case "calc":
      return tx("calcSlot", lang);
    default:
      return blockKindLabel(b.kind, lang);
  }
}
