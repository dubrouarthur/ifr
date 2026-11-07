// Ground school stage — small SVG toolkit for the calc diagram widgets (wind triangle, 60:1, profile, hold in
// wind, TVMDC strip, CG envelope): elements, the two themes, arrowheads, number formatting, and a pointer drag
// helper that works with a mouse, a pen and a finger (pointer capture, no scroll while dragging, ≥ 44 px targets)
// plus the keyboard (every draggable handle is focusable and moves with the arrow keys).
import type { Lang } from "../types";
import { textWidth } from "../canvas/text";

export const SVG_NS = "http://www.w3.org/2000/svg";

export type DiagramTheme = "dark" | "light";
/** Colour roles (aviation convention: magenta = track / GPS, cyan = selected / heading, green = NAV, amber = caution). */
export interface DiagramPalette {
  bg: string;
  grid: string;
  line: string;
  text: string;
  muted: string;
  heading: string;
  track: string;
  wind: string;
  nav: string;
  ok: string;
  bad: string;
  fill: string;
  handle: string;
  /** body ink (secondary values) */
  ink2: string;
  /** markers, handles, the result */
  accent: string;
}
/** A diagram palette from theme colours (SPEC slides v2 §4: diagrams use the slide theme's tokens only). */
export function paletteFromColors(c: {
  bg: string;
  rule: string;
  ruleStrong: string;
  text: string;
  ink2: string;
  muted: string;
  accent: string;
  path: string;
  sel: string;
  nav: string;
  key: string;
  stop: string;
}): DiagramPalette {
  return {
    bg: c.bg,
    grid: c.rule,
    line: c.ruleStrong,
    text: c.text,
    ink2: c.ink2,
    muted: c.muted,
    heading: c.sel,
    track: c.path,
    wind: c.key,
    nav: c.nav,
    ok: c.nav,
    bad: c.stop,
    fill: tint(c.sel, 0.12),
    handle: c.accent,
    accent: c.accent,
  };
}
/** rgba() of a #rrggbb colour (tints of semantic colours, 10–14 %). */
export function tint(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
// the two slide themes' tokens (canvas/themes.ts), so stage panes and slides draw the same diagrams
export const PALETTES: Record<DiagramTheme, DiagramPalette> = {
  dark: paletteFromColors({
    bg: "#0d1117",
    rule: "#2a333e",
    ruleStrong: "#3d4855",
    text: "#eef2f6",
    ink2: "#c3ccd5",
    muted: "#8b98a6",
    accent: "#6cb4ff",
    path: "#ee72dc",
    sel: "#5ad4ec",
    nav: "#5bd98e",
    key: "#f4bb4a",
    stop: "#ff7a7a",
  }),
  light: paletteFromColors({
    bg: "#fbfaf7",
    rule: "#e2e0d9",
    ruleStrong: "#c9c6bd",
    text: "#14181f",
    ink2: "#353c47",
    muted: "#5d6671",
    accent: "#1d5fd1",
    path: "#a8238f",
    sel: "#0b6f88",
    nav: "#17763c",
    key: "#a04d06",
    stop: "#b42323",
  }),
};

type SvgAttrs = Record<string, string | number | undefined | null | false>;
/** Create an SVG element with attributes and children. */
export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: SvgAttrs = {},
  ...children: (SVGElement | string | null | undefined | false)[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
}

// ------------------------------------------------------------------ maths helpers (pure)
export const DEG = Math.PI / 180;
export const norm360 = (a: number): number => ((a % 360) + 360) % 360;
export const wrap180 = (a: number): number => {
  const r = norm360(a);
  return r > 180 ? r - 360 : r;
};
/** A heading as a pilot writes it: 001..360. */
export const hdg3 = (a: number): string =>
  String(Math.round(norm360(a)) || 360).padStart(3, "0");
export const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));
/** Screen vector of compass bearing b (north up, y down). */
export const bearingVec = (b: number): [number, number] => [
  Math.sin(b * DEG),
  -Math.cos(b * DEG),
];
/** Compass bearing of a screen vector (north up, y down). */
export const vecBearing = (dx: number, dy: number): number =>
  norm360(Math.atan2(dx, -dy) / DEG);
/** A signed number with a real minus sign. */
export function signed(n: number, digits = 0): string {
  const v = Number(n.toFixed(digits));
  if (v === 0) return (0).toFixed(digits);
  return (v > 0 ? "+" : "−") + Math.abs(v).toFixed(digits);
}
/** Thousands with the language's separator (1,250 / 1 250). */
export function thousands(n: number, lang: Lang): string {
  const r = Math.round(n);
  const t = Math.abs(r)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, lang === "fr" ? " " : ",");
  return r < 0 ? "−" + t : t;
}
export const dec = (n: number, digits: number, lang: Lang): string => {
  const t = Math.abs(n).toFixed(digits);
  return (
    (n < 0 && Number(t) !== 0 ? "−" : "") +
    (lang === "fr" ? t.replace(".", ",") : t)
  );
};
export const L = (lang: Lang, en: string, fr: string): string =>
  lang === "fr" ? fr : en;

// ------------------------------------------------------------------ drawing helpers
/** An arrow line from (x1, y1) to (x2, y2) with a solid head at the end. */
export function arrow(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 3,
  head = 12,
  attrs: SvgAttrs = {},
): SVGGElement {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const hl = Math.min(head, len * 0.45);
  const bx = x2 - ux * hl;
  const by = y2 - uy * hl;
  const w = hl * 0.42;
  const g = s("g", attrs);
  g.append(
    s("line", {
      x1,
      y1,
      x2: bx + ux * 0.5,
      y2: by + uy * 0.5,
      stroke: color,
      "stroke-width": width,
      "stroke-linecap": "round",
    }),
    s("path", {
      d: `M${x2} ${y2}L${bx - uy * w} ${by + ux * w}L${bx + uy * w} ${by - ux * w}Z`,
      fill: color,
    }),
  );
  return g;
}
/** Text with a halo in the background colour so it reads over lines. */
export function label(
  x: number,
  y: number,
  text: string,
  p: DiagramPalette,
  o: {
    size?: number;
    color?: string;
    anchor?: "start" | "middle" | "end";
    weight?: number;
    halo?: boolean;
    mono?: boolean;
  } = {},
): SVGTextElement {
  const t = s(
    "text",
    {
      x,
      y,
      fill: o.color ?? p.text,
      "font-size": o.size ?? 15,
      "font-weight": o.weight ?? 600,
      "text-anchor": o.anchor ?? "start",
      "font-family": o.mono
        ? "var(--cs-mono, ui-monospace, Menlo, monospace)"
        : "var(--cs-font, Inter, system-ui, sans-serif)",
      "paint-order": o.halo === false ? undefined : "stroke",
      stroke: o.halo === false ? undefined : p.bg,
      "stroke-width": o.halo === false ? undefined : 4,
      "stroke-linejoin": "round",
    },
    text,
  );
  return t;
}
/** An arc of radius r centred on (cx, cy) from bearing a0 to bearing a1 (the short way). */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
): string {
  const d = wrap180(a1 - a0);
  const [x0, y0] = bearingVec(a0);
  const [x1, y1] = bearingVec(a0 + d);
  return `M${cx + x0 * r} ${cy + y0 * r}A${r} ${r} 0 0 ${d >= 0 ? 1 : 0} ${cx + x1 * r} ${cy + y1 * r}`;
}
/** A small aircraft (top view), nose up before rotation, ~24 units long. */
export function aircraftIcon(
  x: number,
  y: number,
  hdg: number,
  color: string,
  scale = 1,
): SVGGElement {
  return s(
    "g",
    { transform: `translate(${x} ${y}) rotate(${hdg}) scale(${scale})` },
    s("path", {
      d: "M0 -12 C1.6 -12 1.9 -9.6 1.9 -7.2 L1.9 -2.4 L12 2.4 L12 4.8 L1.9 2.9 L1.4 8.4 L5.4 10.8 L5.4 12.6 L0 11.5 L-5.4 12.6 L-5.4 10.8 L-1.4 8.4 L-1.9 2.9 L-12 4.8 L-12 2.4 L-1.9 -2.4 L-1.9 -7.2 C-1.9 -9.6 -1.6 -12 0 -12Z",
      fill: color,
    }),
  );
}
export function gridPattern(
  id: string,
  step: number,
  p: DiagramPalette,
): SVGPatternElement {
  return s(
    "pattern",
    { id, width: step, height: step, patternUnits: "userSpaceOnUse" },
    s("path", {
      d: `M${step} 0H0V${step}`,
      fill: "none",
      stroke: p.grid,
      "stroke-width": 1,
    }),
  );
}

let uid = 0;
export const nextId = (prefix: string): string => `${prefix}${++uid}`;

// ------------------------------------------------------------------ the widget contract
export interface DiagramOptions {
  theme?: DiagramTheme;
  /** the slide theme's palette (wins over `theme`) */
  palette?: DiagramPalette;
  lang?: Lang;
  /** the drawing size: viewBox 0 0 w h. On a slide it is the block's logical size (1 unit = 1 logical px) */
  w?: number;
  h?: number;
  /** the type unit: labels are 24 / 28 / 32 × u (1 on a slide; about 0.56 in a pane measured in CSS px) */
  u?: number;
  /** no background (the slide shows through) */
  transparent?: boolean;
  /** draw the worked numbers inside the drawing (stage panes, reader). Never on a slide: results go to a
   *  formula block beside the diagram (SPEC slides v2 §5.8) */
  card?: boolean;
  /** what the student may drag (CalcDiagram.drag); none = static */
  drag?: string[];
  /** called while dragging (live) and on keyboard moves with the new spec */
  onChange?: (spec: unknown) => void;
  /** accessible name (the block's alt); default: generated from the numbers */
  label?: string;
}
export interface DiagramWidget<S> {
  readonly el: SVGSVGElement;
  /** current spec (after drags) */
  spec(): S;
  /** redraw with new numbers (a re-generated problem, a linked value) */
  update(spec: S): void;
  setTheme(theme: DiagramTheme): void;
  /** redraw at a new size (the pane was resized): viewBox 0 0 w h, labels × u */
  resize?(w: number, h: number, u?: number): void;
  /** what the drawing does not show to scale ("vertical scale × 4"), for the hint row under it */
  note?(): string | null;
  destroy(): void;
}

// ------------------------------------------------------------------ slide units (SPEC slides v2 §5)
/** Label sizes in units of u: secondary 24, primary 28, key 32. */
export const FS = { sec: 24, pri: 28, key: 32 } as const;
/** Stroke widths in units of u. */
export const SW = { hero: 6, second: 5, constr: 3, planned: 3, dim: 2.5, grid: 2 } as const;
export type LabelRole = keyof typeof FS;
export interface Ctx {
  W: number;
  H: number;
  u: number;
  p: DiagramPalette;
}
/** The drawing context from the options (a widget's natural size when none is given). */
export function ctxOf(o: DiagramOptions, natW: number, natH: number): Ctx {
  const W = Math.max(120, o.w ?? natW);
  const H = Math.max(90, o.h ?? natH);
  return { W, H, u: o.u ?? 1, p: o.palette ?? PALETTES[o.theme ?? "dark"] };
}
interface LabOpts {
  role?: LabelRole;
  color?: string;
  anchor?: "start" | "middle" | "end";
  weight?: number;
  /** an 8u halo in the colour beneath (only over a stroke) */
  halo?: string | false;
  italic?: boolean;
  spacing?: number;
}
/** A label in slide units: 24 / 28 / 32 × u, Inter, never rotated. */
export function lab(c: Ctx, x: number, y: number, text: string, o: LabOpts = {}): SVGTextElement {
  const role = o.role ?? "pri";
  const size = FS[role] * c.u;
  return s(
    "text",
    {
      x: r2(x),
      y: r2(y),
      fill: o.color ?? (role === "sec" ? c.p.muted : c.p.text),
      "font-size": r2(size),
      "font-weight": o.weight ?? (role === "sec" ? 500 : 600),
      "text-anchor": o.anchor ?? "start",
      "font-family": "var(--cs-font, Inter, system-ui, sans-serif)",
      "font-style": o.italic ? "italic" : undefined,
      "letter-spacing": o.spacing ? `${o.spacing}em` : undefined,
      "font-variant-numeric": "tabular-nums",
      "paint-order": o.halo ? "stroke" : undefined,
      stroke: o.halo || undefined,
      "stroke-width": o.halo ? r2(8 * c.u) : undefined,
      "stroke-linejoin": o.halo ? "round" : undefined,
    },
    text,
  );
}
const r2 = (v: number) => Math.round(v * 100) / 100;
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** The estimated box of a label drawn at (x, y) (baseline) with an anchor. Pure. */
export function labelBox(
  text: string,
  x: number,
  y: number,
  size: number,
  anchor: "start" | "middle" | "end" = "start",
  weight = 600,
): Box {
  const w = textWidth(text, size, weight);
  const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
  return { x: x0, y: y - 0.76 * size, w, h: 0.98 * size };
}
const hit = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const segHitsBox = (x1: number, y1: number, x2: number, y2: number, b: Box): boolean => {
  // Liang–Barsky clip of the segment against the box
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - b.x, b.x + b.w - x1, y1 - b.y, b.y + b.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
};
export type Cand = [x: number, y: number, anchor?: "start" | "middle" | "end"];
/**
 * Label placement without overlaps (SPEC §5.6): each label tries its candidate positions in order; the first whose
 * box, inflated by 8u, hits no placed label, no registered stroke and stays inside the drawing wins. If none fits,
 * the candidate with the least overlap is used.
 */
export class Labels {
  private boxes: Box[] = [];
  private segs: [number, number, number, number][] = [];
  constructor(private c: Ctx, private layer: SVGGElement) {}
  /** a hero / secondary stroke labels must stay off (a polyline: x, y pairs) */
  stroke(...pts: number[]) {
    for (let i = 0; i + 3 < pts.length; i += 2) this.segs.push([pts[i], pts[i + 1], pts[i + 2], pts[i + 3]]);
  }
  /** an area labels must stay off (a marker, an aircraft) */
  block(b: Box) {
    this.boxes.push(b);
  }
  /** a circle labels must stay off */
  circle(x: number, y: number, r: number) {
    this.boxes.push({ x: x - r, y: y - r, w: 2 * r, h: 2 * r });
  }
  private cost(b: Box): number {
    const m = 8 * this.c.u;
    const g: Box = { x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m };
    let n = 0;
    // another label (or a marker) is much worse than crossing a stroke
    for (const o of this.boxes) if (hit(g, o)) n += 10;
    for (const sg of this.segs) if (segHitsBox(sg[0], sg[1], sg[2], sg[3], g)) n += 1;
    if (b.x < 0 || b.y < 0 || b.x + b.w > this.c.W || b.y + b.h > this.c.H) n += 8;
    return n;
  }
  /** place a label (one or two lines: a value and a secondary line under it) */
  put(
    text: string,
    cands: Cand[],
    o: LabOpts & {
      sub?: string;
      subColor?: string;
      /** coloured runs on one line ("3°" in the path colour, then "318 ft/NM" in ink) */
      parts?: { t: string; color?: string }[];
    } = {},
  ): { x: number; y: number; anchor: "start" | "middle" | "end" } {
    const role = o.role ?? "pri";
    const size = FS[role] * this.c.u;
    const subSize = FS.sec * this.c.u;
    const boxOf = (cd: Cand): Box => {
      const a = cd[2] ?? o.anchor ?? "start";
      const b = labelBox(text, cd[0], cd[1], size, a, o.weight ?? 600);
      if (!o.sub) return b;
      const sb = labelBox(o.sub, cd[0], cd[1] + subSize * 1.25, subSize, a, 500);
      const x = Math.min(b.x, sb.x);
      return { x, y: b.y, w: Math.max(b.x + b.w, sb.x + sb.w) - x, h: sb.y + sb.h - b.y };
    };
    let best = cands[0];
    let bestCost = Infinity;
    for (const cd of cands) {
      const k = this.cost(boxOf(cd));
      if (k < bestCost) {
        best = cd;
        bestCost = k;
      }
      if (k === 0) break;
    }
    const anchor = best[2] ?? o.anchor ?? "start";
    const bb = boxOf(best);
    this.boxes.push(bb);
    // a label left over a stroke gets a halo in the colour beneath (SPEC §5.7), never otherwise
    const onStroke = bestCost > 0 && this.segs.some((sg) => segHitsBox(sg[0], sg[1], sg[2], sg[3], bb));
    const halo = o.halo ?? (onStroke ? this.c.p.bg : undefined);
    const t = lab(this.c, best[0], best[1], o.parts ? "" : text, { ...o, anchor, halo });
    if (o.parts) for (const pt of o.parts) t.append(s("tspan", { fill: pt.color }, pt.t));
    this.layer.append(t);
    if (o.sub)
      this.layer.append(
        lab(this.c, best[0], best[1] + subSize * 1.25, o.sub, { role: "sec", anchor, color: o.subColor ?? o.color, halo }),
      );
    return { x: best[0], y: best[1], anchor };
  }
}
/** A solid arrowhead (34u long on a hero path) at (x, y) pointing along `ang` (radians, screen). */
export function head(c: Ctx, x: number, y: number, ang: number, color: string, len = 34): SVGPathElement {
  const L = len * c.u;
  const w = L * 0.5;
  const bx = x - Math.cos(ang) * L;
  const by = y - Math.sin(ang) * L;
  const nx = -Math.sin(ang) * w;
  const ny = Math.cos(ang) * w;
  return s("path", {
    d: `M${r2(x)} ${r2(y)}L${r2(bx + nx)} ${r2(by + ny)}L${r2(bx + Math.cos(ang) * L * 0.18)} ${r2(by + Math.sin(ang) * L * 0.18)}L${r2(bx - nx)} ${r2(by - ny)}Z`,
    fill: color,
  });
}
/** A fix: a triangle of 30u with a 4u stroke. */
export function fixMark(c: Ctx, x: number, y: number, stroke: string): SVGPathElement {
  const k = 15 * c.u;
  return s("path", {
    d: `M${r2(x)} ${r2(y - k * 1.1)}L${r2(x + k)} ${r2(y + k * 0.7)}L${r2(x - k)} ${r2(y + k * 0.7)}Z`,
    fill: c.p.bg,
    stroke,
    "stroke-width": r2(4 * c.u),
    "stroke-linejoin": "round",
  });
}
/** A waypoint: a circle r 11u with a 4u stroke. */
export function wpt(c: Ctx, x: number, y: number, stroke: string): SVGCircleElement {
  return s("circle", { cx: r2(x), cy: r2(y), r: r2(11 * c.u), fill: c.p.bg, stroke, "stroke-width": r2(4 * c.u) });
}
/** A dimension line with 24u ticks (2.5u). */
export function dimLine(c: Ctx, x1: number, y1: number, x2: number, y2: number, color: string): SVGPathElement {
  const t = 12 * c.u;
  const vert = Math.abs(x2 - x1) < Math.abs(y2 - y1);
  const d = vert
    ? `M${r2(x1 - t)} ${r2(y1)}H${r2(x1 + t)}M${r2(x2 - t)} ${r2(y2)}H${r2(x2 + t)}M${r2(x1)} ${r2(y1)}L${r2(x2)} ${r2(y2)}`
    : `M${r2(x1)} ${r2(y1 - t)}V${r2(y1 + t)}M${r2(x2)} ${r2(y2 - t)}V${r2(y2 + t)}M${r2(x1)} ${r2(y1)}L${r2(x2)} ${r2(y2)}`;
  return s("path", { d, stroke: color, "stroke-width": r2(SW.dim * c.u), fill: "none" });
}
/** The root <svg> of a widget in units: viewBox 0 0 W H, filling its box (no letterbox when the box has W:H). */
export function unitSvg(c: Ctx, cls: string): SVGSVGElement {
  return s("svg", {
    viewBox: `0 0 ${r2(c.W)} ${r2(c.H)}`,
    class: `cs-diagram cs-units ${cls}`,
    role: "group",
    preserveAspectRatio: "xMidYMid meet",
    width: "100%",
    height: "100%",
  });
}
/** Set the root's size after a resize. */
export function sizeSvg(svg: SVGSVGElement, c: Ctx) {
  svg.setAttribute("viewBox", `0 0 ${r2(c.W)} ${r2(c.H)}`);
}
/** The background rect (none on a slide: the slide shows through). */
export const bgRect = (c: Ctx, o: DiagramOptions): SVGRectElement | null =>
  o.transparent ? null : s("rect", { width: r2(c.W), height: r2(c.H), fill: c.p.bg });

/** Root <svg> of a widget: responsive, focusable children, role img + live description. */
export function rootSvg(w: number, hgt: number, cls: string): SVGSVGElement {
  return s("svg", {
    viewBox: `0 0 ${w} ${hgt}`,
    class: `cs-diagram ${cls}`,
    role: "group",
    preserveAspectRatio: "xMidYMid meet",
    width: "100%",
    height: "100%",
  });
}

/** Client point → the svg's user coordinates. */
export function clientToSvg(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): [number, number] {
  const m = svg.getScreenCTM?.();
  if (m) {
    const inv = m.inverse();
    return [
      inv.a * clientX + inv.c * clientY + inv.e,
      inv.b * clientX + inv.d * clientY + inv.f,
    ];
  }
  const r = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  return [
    vb.x + ((clientX - r.left) / Math.max(1, r.width)) * vb.width,
    vb.y + ((clientY - r.top) / Math.max(1, r.height)) * vb.height,
  ];
}

export interface DragHandle {
  /** the hit target (an invisible circle ≥ 44 CSS px) */
  hit: SVGCircleElement;
  /** visible knob */
  dot: SVGCircleElement;
  g: SVGGElement;
  move(x: number, y: number): void;
}
/**
 * A draggable handle: `onDrag(x, y)` gets svg user coordinates (pointer), `onKey(dx, dy, big)` the arrow keys
 * (Shift = big step). The hit circle is sized so it stays at least 44 CSS px on screen.
 */
export function dragHandle(
  svg: SVGSVGElement,
  p: DiagramPalette,
  o: {
    color: string;
    name: string;
    onDrag: (x: number, y: number) => void;
    onKey: (dx: number, dy: number, big: boolean) => void;
    onEnd?: () => void;
    /** the type unit of the drawing (ring and hit area scale with it) */
    u?: number;
    /** the dot colour (default accent); a visual drawn under the ring (an aircraft) can replace it */
    dot?: string;
  },
): DragHandle {
  const u = o.u ?? 0.5;
  const hit = s("circle", { r: Math.max(44 * u, 26), fill: "transparent", class: "cs-hit" });
  const ring = s("circle", {
    r: 34 * u,
    fill: tint(p.accent, 0.14),
    stroke: p.accent,
    "stroke-width": 3 * u,
    class: "cs-ring",
  });
  const dot = s("circle", {
    r: 9 * u,
    fill: o.dot ?? p.accent,
    stroke: "none",
  });
  const g = s(
    "g",
    { class: "cs-handle", tabindex: 0, role: "slider", "aria-label": o.name },
    ring,
    dot,
    hit,
  );
  let dragging = false;
  const resize = () => {
    // keep the target ≥ 44 CSS px whatever the scale of the drawing
    const m = svg.getScreenCTM?.();
    const k = m ? Math.hypot(m.a, m.b) : 1;
    hit.setAttribute("r", String(Math.max(44 * u, 22 / Math.max(0.05, k))));
  };
  g.addEventListener("pointerdown", (e) => {
    resize();
    dragging = true;
    g.classList.add("on");
    (e.target as Element).setPointerCapture?.(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  });
  g.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const [x, y] = clientToSvg(svg, e.clientX, e.clientY);
    o.onDrag(x, y);
    e.preventDefault();
  });
  const end = () => {
    if (!dragging) return;
    dragging = false;
    g.classList.remove("on");
    o.onEnd?.();
  };
  g.addEventListener("pointerup", end);
  g.addEventListener("pointercancel", end);
  g.addEventListener("lostpointercapture", end);
  g.addEventListener("pointerenter", resize);
  g.addEventListener("keydown", (e) => {
    const big = e.shiftKey;
    const k = e.key;
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (d[k]) {
      o.onKey(d[k][0], d[k][1], big);
      e.preventDefault();
    }
  });
  return {
    hit,
    dot,
    g,
    move(x: number, y: number) {
      g.setAttribute("transform", `translate(${x} ${y})`);
    },
  };
}

// ------------------------------------------------------------------ widget shell (slide units)
export interface Shell {
  c: Ctx;
  o: DiagramOptions;
  svg: SVGSVGElement;
  desc: SVGDescElement;
  /** redrawn on every change */
  layer: SVGGElement;
  /** handles live here: never removed while dragging (pointer capture survives a redraw) */
  top: SVGGElement;
}
export interface WidgetHooks<S> {
  /** create the handles (in sh.top) and anything that lives across redraws */
  build?(sh: Shell, get: () => S, set: (next: S) => void): void;
  /** draw the spec into sh.layer and move the handles */
  draw(sh: Shell, spec: S): void;
  label(sh: Shell, spec: S): string;
  note?(sh: Shell, spec: S): string | null;
  clone?(spec: S): S;
  /** normalise a spec handed to update() */
  norm?(spec: S): S;
}
/** The common widget plumbing: size, theme, update, resize, accessible name. */
export function makeWidget<S>(
  spec0: S,
  o0: DiagramOptions,
  nat: [number, number],
  cls: string,
  hk: WidgetHooks<S>,
): DiagramWidget<S> {
  let o: DiagramOptions = { ...o0 };
  const clone = hk.clone ?? ((x: S) => ({ ...x }) as S);
  const norm = hk.norm ?? ((x: S) => x);
  let spec = norm(clone(spec0));
  const c0 = ctxOf(o, nat[0], nat[1]);
  const sh: Shell = {
    c: c0,
    o,
    svg: unitSvg(c0, cls),
    desc: s("desc"),
    layer: s("g"),
    top: s("g"),
  };
  const a11y = () => {
    const t = o.label ?? hk.label(sh, spec);
    sh.svg.setAttribute("aria-label", t);
    sh.desc.textContent = t;
  };
  const set = (next: S) => {
    spec = next;
    sh.layer.replaceChildren();
    hk.draw(sh, spec);
    a11y();
    o.onChange?.(clone(spec));
  };
  const build = () => {
    sh.c = ctxOf(o, nat[0], nat[1]);
    sh.o = o;
    sizeSvg(sh.svg, sh.c);
    const bg = bgRect(sh.c, o);
    sh.layer = s("g");
    sh.top = s("g");
    sh.svg.replaceChildren(sh.desc, ...(bg ? [bg] : []), sh.layer, sh.top);
    hk.build?.(sh, () => spec, set);
    hk.draw(sh, spec);
    a11y();
  };
  build();
  return {
    el: sh.svg,
    spec: () => clone(spec),
    update(next) {
      spec = norm(clone(next));
      build();
    },
    setTheme(t) {
      o = { ...o, theme: t, palette: undefined };
      build();
    },
    resize(w, h, u) {
      if (Math.abs((o.w ?? 0) - w) < 0.5 && Math.abs((o.h ?? 0) - h) < 0.5 && (u === undefined || u === o.u)) return;
      o = { ...o, w, h, u: u ?? o.u };
      build();
    },
    note: () => hk.note?.(sh, spec) ?? null,
    destroy() {
      sh.svg.remove();
    },
  };
}
/** A number with a decimal only when it has one (8 / 7,5), in the language. */
export const num = (n: number, lang: Lang, digits = 1): string => {
  const r = Number(n.toFixed(digits));
  return dec(r, Number.isInteger(r) ? 0 : digits, lang);
};
