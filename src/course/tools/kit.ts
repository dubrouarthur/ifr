// Teaching tools — what every tool shares (pure, no DOM): the tool definition, the drawing context, a small SVG
// string builder (our own markup: every text is escaped) and the number formats of each language.
import type { L10n, Lang, SlideTheme, ToolId } from "../types";
import { FMT } from "../calc/text";

export const L = (en: string, fr: string): L10n => ({ en, fr });
export const tr = (t: L10n, lang: Lang): string =>
  lang === "fr" ? (t.fr ?? t.en) : t.en;

/** One control of a tool: a number on a range (stepper + slider), or a choice (segmented buttons, value = index). */
export interface ToolParam {
  key: string;
  label: L10n;
  min: number;
  max: number;
  step: number;
  /** the unit after the value (° kt lb ft hPa °C % L L/h min m) */
  unit?: string;
  /** decimals shown (default: from the step) */
  digits?: number;
  /** a choice instead of a number: the value is the index */
  choices?: L10n[];
  /** wraps round (a heading, a radial: 360 → 0) */
  wrap?: boolean;
  /** shown with a sign (+3 / −3) */
  signed?: boolean;
  /** headings: three digits (005) */
  heading?: boolean;
}
export type Tone = "ok" | "warn" | "stop" | "key" | "sel" | "plain";
export interface ToolReadout {
  label: L10n;
  value: string;
  tone?: Tone;
  /** names the readout, so a task can keep it hidden (« ? ») until the student finds the value */
  key?: string;
}
/** the theme colours a drawing uses (slide theme tokens: never a free colour) */
export interface ToolColors {
  bg: string;
  surface: string;
  text: string;
  ink2: string;
  muted: string;
  rule: string;
  ruleStrong: string;
  accent: string;
  path: string;
  sel: string;
  nav: string;
  key: string;
  stop: string;
}
export const toolColors = (t: SlideTheme): ToolColors => {
  const c = t.colors;
  return {
    bg: c.bg,
    surface: c.surface,
    text: c.text,
    ink2: c.ink2,
    muted: c.muted,
    rule: c.rule,
    ruleStrong: c.ruleStrong,
    accent: c.accent,
    path: c.path,
    sel: c.sel,
    nav: c.nav,
    key: c.key,
    stop: c.stop,
  };
};
export interface DrawCx {
  lang: Lang;
  c: ToolColors;
  /** seconds since the tool started (moving air, a turning propeller); 0 when still */
  t: number;
  /** the drawing may move (play mode, no reduced-motion preference) */
  moving: boolean;
  /** the values a task keeps hidden until it is met (readout keys): the drawing leaves them out too */
  hide?: ReadonlySet<string>;
}
/** is this value hidden by the task in progress? */
export const hidden = (cx: DrawCx, key: string): boolean => !!cx.hide?.has(key);
/**
 * A tool's ready task. It is checked over ALL the values (never one control against a fixed number), so it stays
 * right whatever else the student or the creator changes. The values the prompt states (« 2 h de vol à 35 L/h »)
 * are its givens: while the task is on they are set and their controls are not offered. Presets and « Animer » are
 * not offered either (they would give the answer), and the readouts in `hides` show « ? » until it is met.
 */
export interface ToolTaskDef {
  prompt: L10n;
  /** the control the student works */
  key: string;
  givens?: ToolValues;
  met(p: ToolValues): boolean;
  hides?: string[];
}
export interface ToolView {
  /** the inner SVG markup in the tool's viewBox */
  svg: string;
  readouts: ToolReadout[];
  /** one sentence for screen readers: what the drawing shows now */
  say: string;
}
export type ToolValues = Record<string, number>;
export interface ToolDef {
  id: ToolId;
  title: L10n;
  /** one line under the title in the rail: what the student learns */
  blurb: L10n;
  /** the syllabus subjects (EASA Part-FCL areas) */
  subject: string;
  tags: string[];
  params: ToolParam[];
  defaults: ToolValues;
  /** the controls the student gets by default (keys of params) */
  controls: string[];
  presets: { label: L10n; p: ToolValues }[];
  /** « Animer »: one value swept from → to in s seconds */
  sweep?: { key: string; from: number; to: number; s: number };
  /** the presenter's note: what to show, what to ask */
  note: L10n;
  /** a ready task (the example slide uses it; a block stores { prompt, key }, the check lives here) */
  task?: ToolTaskDef;
  /** the drawing's viewBox */
  view: { w: number; h: number };
  /** the size a new tool block takes (slide units) */
  frame: { w: number; h: number };
  /** the drawing moves by itself (redraw each frame while shown) */
  animated?: boolean;
  draw(p: ToolValues, cx: DrawCx): ToolView;
}

// ------------------------------------------------------------------ numbers
/** a number the way a pilot writes it in that language (1 013,2 / 1,013.2; − sign) */
export const num = (x: number, digits: number, lang: Lang): string =>
  FMT[lang].n(x, digits);
export const signed = (x: number, digits: number, lang: Lang): string =>
  FMT[lang].s(x, digits);
export const hdg = (x: number): string =>
  String(Math.round(((x % 360) + 360) % 360) || 360).padStart(3, "0");
export const stepDigits = (step: number): number =>
  step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
/** a control's value with its unit */
export function paramText(p: ToolParam, v: number, lang: Lang): string {
  if (p.choices) return tr(p.choices[Math.round(v)] ?? p.choices[0], lang);
  if (p.heading) return `${hdg(v)}°`;
  const d = p.digits ?? stepDigits(p.step);
  const n = p.signed ? signed(v, d, lang) : num(v, d, lang);
  if (!p.unit) return n;
  return p.unit === "°" || p.unit === "%"
    ? `${n}${p.unit === "%" ? " %" : "°"}`
    : `${n} ${p.unit}`;
}
export const clampParam = (p: ToolParam, v: number): number => {
  if (p.wrap) {
    const span = p.max - p.min + p.step;
    return ((((v - p.min) % span) + span) % span) + p.min;
  }
  return Math.max(p.min, Math.min(p.max, v));
};
export const snapParam = (p: ToolParam, v: number): number => {
  const k = Math.round((v - p.min) / p.step);
  return clampParam(p, Number((p.min + k * p.step).toFixed(6)));
};

// ------------------------------------------------------------------ SVG strings
export const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const r = (n: number) => Math.round(n * 10) / 10;
type Attrs = Record<string, string | number | undefined | null | false>;
const attrs = (a: Attrs): string =>
  Object.entries(a)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${k}="${typeof v === "number" ? r(v) : esc(String(v))}"`)
    .join("");
export interface TextOpt {
  size?: number;
  fill?: string;
  anchor?: "start" | "middle" | "end";
  weight?: 400 | 500 | 600 | 700;
  /** vertical: the text's middle on y (default: baseline) */
  mid?: boolean;
  italic?: boolean;
  /** a halo in this colour behind the text (labels over lines) */
  halo?: string;
  rotate?: number;
}
/** A small SVG builder: our own markup, numbers rounded to 0.1, every text escaped. */
export class Svg {
  private out: string[] = [];
  raw(s: string): this {
    this.out.push(s);
    return this;
  }
  el(tag: string, a: Attrs, inner = ""): this {
    this.out.push(
      inner ? `<${tag}${attrs(a)}>${inner}</${tag}>` : `<${tag}${attrs(a)}/>`,
    );
    return this;
  }
  line(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    stroke: string,
    w = 3,
    dash?: string,
  ): this {
    return this.el("line", {
      x1,
      y1,
      x2,
      y2,
      stroke,
      "stroke-width": w,
      "stroke-dasharray": dash,
      "stroke-linecap": "round",
    });
  }
  path(d: string, a: Attrs): this {
    return this.el("path", {
      d,
      fill: "none",
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
      ...a,
    });
  }
  poly(pts: [number, number][], a: Attrs): this {
    return this.el("polygon", {
      points: pts.map(([x, y]) => `${r(x)},${r(y)}`).join(" "),
      ...a,
    });
  }
  polyline(pts: [number, number][], a: Attrs): this {
    return this.el("polyline", {
      points: pts.map(([x, y]) => `${r(x)},${r(y)}`).join(" "),
      fill: "none",
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
      ...a,
    });
  }
  rect(x: number, y: number, w: number, h: number, a: Attrs): this {
    return this.el("rect", {
      x,
      y,
      width: Math.max(0, w),
      height: Math.max(0, h),
      ...a,
    });
  }
  circle(cx: number, cy: number, rr: number, a: Attrs): this {
    return this.el("circle", { cx, cy, r: rr, ...a });
  }
  text(x: number, y: number, s: string, o: TextOpt = {}): this {
    const a: Attrs = {
      x,
      y,
      "font-size": o.size ?? 26,
      "font-weight": o.weight ?? 500,
      fill: o.fill,
      "text-anchor": o.anchor ?? "start",
      "dominant-baseline": o.mid ? "central" : undefined,
      "font-style": o.italic ? "italic" : undefined,
      transform: o.rotate
        ? `rotate(${r(o.rotate)} ${r(x)} ${r(y)})`
        : undefined,
    };
    if (o.halo)
      this.out.push(
        `<text${attrs({ ...a, fill: o.halo, stroke: o.halo, "stroke-width": 8, "stroke-linejoin": "round" })}>${esc(s)}</text>`,
      );
    this.out.push(`<text${attrs(a)}>${esc(s)}</text>`);
    return this;
  }
  /** a straight arrow: the shaft and a filled head at (x2, y2) */
  arrow(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
    w = 5,
    head = 18,
  ): this {
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 1) return this;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    const hl = Math.min(head, len * 0.6);
    const bx = x2 - ux * hl;
    const by = y2 - uy * hl;
    this.line(x1, y1, bx, by, color, w);
    return this.poly(
      [
        [x2, y2],
        [bx - uy * hl * 0.5, by + ux * hl * 0.5],
        [bx + uy * hl * 0.5, by - ux * hl * 0.5],
      ],
      { fill: color },
    );
  }
  toString(): string {
    return this.out.join("");
  }
}
/** a value mapped from [a0, a1] to [b0, b1] */
export const lerpMap = (
  v: number,
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): number => b0 + ((v - a0) / (a1 - a0)) * (b1 - b0);
export const deg = (rad: number): number => (rad * 180) / Math.PI;
export const rad = (d: number): number => (d * Math.PI) / 180;
/** a value read out with its label (the panel's list) */
export const ro = (
  label: L10n,
  value: string,
  tone?: Tone,
  key?: string,
): ToolReadout => ({
  label,
  value,
  tone,
  ...(key ? { key } : {}),
});
