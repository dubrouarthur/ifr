// Ground school stage — small SVG toolkit for the calc diagram widgets (wind triangle, 60:1, profile, hold in
// wind, TVMDC strip, CG envelope): elements, the two themes, arrowheads, number formatting, and a pointer drag
// helper that works with a mouse, a pen and a finger (pointer capture, no scroll while dragging, ≥ 44 px targets)
// plus the keyboard (every draggable handle is focusable and moves with the arrow keys).
import type { Lang } from "../types";

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
}
export const PALETTES: Record<DiagramTheme, DiagramPalette> = {
  dark: {
    bg: "#0e1318",
    grid: "#18212a",
    line: "#5f6b78",
    text: "#e7edf3",
    muted: "#8b97a4",
    heading: "#00e4ff",
    track: "#e04ad0",
    wind: "#ffb020",
    nav: "#2bd576",
    ok: "#2bd576",
    bad: "#ff5a5f",
    fill: "rgba(0, 228, 255, 0.08)",
    handle: "#ffffff",
  },
  light: {
    bg: "#ffffff",
    grid: "#eef1f5",
    line: "#9aa5b1",
    text: "#0f1722",
    muted: "#66737f",
    heading: "#0b63ce",
    track: "#a3168f",
    wind: "#a35f00",
    nav: "#127a52",
    ok: "#127a52",
    bad: "#c22a3a",
    fill: "rgba(11, 99, 206, 0.07)",
    handle: "#0f1722",
  },
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
  lang?: Lang;
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
  destroy(): void;
}

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
  },
): DragHandle {
  const hit = s("circle", { r: 26, fill: "transparent", class: "cs-hit" });
  const ring = s("circle", {
    r: 13,
    fill: "none",
    stroke: o.color,
    "stroke-width": 2,
    "stroke-opacity": 0.55,
    class: "cs-ring",
  });
  const dot = s("circle", {
    r: 7,
    fill: p.handle,
    stroke: o.color,
    "stroke-width": 3,
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
    hit.setAttribute("r", String(Math.max(22, 22 / Math.max(0.05, k))));
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
