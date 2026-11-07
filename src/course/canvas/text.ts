// Ground school — designed slides: rich text (package N). The reader's inline syntax on the canvas:
//   **bold**  *italic*  [[label|annotationId]] (a linked term)  {{value}} (a live binding)  `code`
//   lines starting "- " or "• " are a bulleted list, "1. " a numbered list; a blank line separates paragraphs.
// parseRich() is pure (tests); richFragment() builds DOM; fitScale() is the auto-fit search.
import type { L10n, Lang } from "../types";

export type Inline =
  | { t: "text"; s: string }
  | { t: "b"; c: Inline[] }
  | { t: "i"; c: Inline[] }
  | { t: "code"; s: string }
  | { t: "link"; label: string; id: string }
  | { t: "value" };
export type Para =
  | { t: "p"; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][]; start: number };

/** Localised author text: the language asked, else English (a missing FR shows the EN text). */
export function loc(text: L10n | undefined, lang: Lang): string {
  if (!text) return "";
  return (lang === "fr" ? text.fr : undefined) || text.en || "";
}
export const isMissing = (text: L10n | undefined, lang: Lang): boolean =>
  lang === "fr" && !!text?.en && !text.fr;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ t: "text", s: buf });
    buf = "";
  };
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    if (rest.startsWith("\\") && i + 1 < s.length) {
      buf += s[i + 1];
      i += 2;
      continue;
    }
    if (rest.startsWith("**")) {
      const j = s.indexOf("**", i + 2);
      if (j > i + 2) {
        flush();
        out.push({ t: "b", c: parseInline(s.slice(i + 2, j)) });
        i = j + 2;
        continue;
      }
    }
    if (rest.startsWith("*") && !rest.startsWith("**")) {
      const j = s.indexOf("*", i + 1);
      if (j > i + 1 && s[j + 1] !== "*") {
        flush();
        out.push({ t: "i", c: parseInline(s.slice(i + 1, j)) });
        i = j + 1;
        continue;
      }
    }
    if (rest.startsWith("`")) {
      const j = s.indexOf("`", i + 1);
      if (j > i + 1) {
        flush();
        out.push({ t: "code", s: s.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
    }
    if (rest.startsWith("[[")) {
      const j = s.indexOf("]]", i + 2);
      if (j > i + 2) {
        const inner = s.slice(i + 2, j);
        const bar = inner.indexOf("|");
        flush();
        out.push(
          bar >= 0
            ? {
                t: "link",
                label: inner.slice(0, bar),
                id: inner.slice(bar + 1),
              }
            : { t: "link", label: inner, id: inner },
        );
        i = j + 2;
        continue;
      }
    }
    if (rest.startsWith("{{")) {
      const j = s.indexOf("}}", i + 2);
      if (j >= i + 2) {
        flush();
        out.push({ t: "value" });
        i = j + 2;
        continue;
      }
    }
    buf += s[i];
    i++;
  }
  flush();
  return out;
}

const UL = /^\s*(?:[-•]|–)\s+/;
const OL = /^\s*(\d{1,2})[.)]\s+/;
export function parseRich(src: string): Para[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Para[] = [];
  let p: string[] = [];
  const flushP = () => {
    if (p.length) out.push({ t: "p", c: parseInline(p.join("\n")) });
    p = [];
  };
  for (const line of lines) {
    if (!line.trim()) {
      flushP();
      continue;
    }
    const ul = UL.exec(line);
    const ol = OL.exec(line);
    if (ul || ol) {
      flushP();
      const last = out[out.length - 1];
      if (ul) {
        const item = parseInline(line.slice(ul[0].length));
        if (last?.t === "ul") last.items.push(item);
        else out.push({ t: "ul", items: [item] });
      } else if (ol) {
        const item = parseInline(line.slice(ol[0].length));
        if (last?.t === "ol") last.items.push(item);
        else out.push({ t: "ol", items: [item], start: Number(ol[1]) });
      }
      continue;
    }
    p.push(line);
  }
  flushP();
  return out;
}

/** Plain text of rich text (aria labels, the linear reader, search). */
export function plainText(src: string, value = ""): string {
  const inl = (c: Inline[]): string =>
    c
      .map((x) =>
        x.t === "text" || x.t === "code"
          ? x.s
          : x.t === "link"
            ? x.label
            : x.t === "value"
              ? value
              : inl(x.c),
      )
      .join("");
  return parseRich(src)
    .map((p) =>
      p.t === "p" ? inl(p.c) : p.items.map((it) => inl(it)).join("; "),
    )
    .join("\n");
}

/** A number never wraps away from its unit: "8 °C", "1,500 ft", "12 kt", "R-270" (no-break spaces). Pure. */
export function keepUnits(s: string): string {
  return s.replace(/(\d) (?=(?:°|%|ft\b|m\b|km\b|NM\b|SM\b|kt\b|hPa\b|inHg\b|UTC\b|min\b|s\b|h\b|dots?\b|pts?\b|lb\b|kg\b|L\b|gal\b|ft\/min\b|ft\/NM\b))/g, "$1\u00a0");
}

export interface RichOptions {
  /** the language's typography (non-breaking spaces, FR punctuation spacing; render time only) */
  lang?: Lang;
  /** the bound value shown for {{…}} (or a dash while unknown) */
  value?: string | null;
  /** a linked term was tapped / hovered */
  onLink?: (id: string, on: boolean) => void;
}
/** DOM for rich text (no innerHTML: author text is never parsed as HTML). */
export function richFragment(
  src: string,
  o: RichOptions = {},
): DocumentFragment {
  const frag = document.createDocumentFragment();
  const inl = (parent: Node, c: Inline[]) => {
    for (const x of c) {
      if (x.t === "text") {
        const parts = x.s.split("\n");
        parts.forEach((s, k) => {
          if (k) parent.appendChild(document.createElement("br"));
          if (s) parent.appendChild(document.createTextNode(o.lang ? typo(s, o.lang) : keepUnits(s)));
        });
      } else if (x.t === "b" || x.t === "i") {
        const el = document.createElement(x.t === "b" ? "strong" : "em");
        inl(el, x.c);
        parent.appendChild(el);
      } else if (x.t === "code") {
        const el = document.createElement("code");
        el.textContent = x.s;
        parent.appendChild(el);
      } else if (x.t === "link") {
        const el = document.createElement("span");
        el.className = "sl-term";
        el.dataset.anno = x.id;
        el.textContent = x.label;
        if (o.onLink) {
          el.tabIndex = 0;
          el.addEventListener("pointerenter", () => o.onLink!(x.id, true));
          el.addEventListener("pointerleave", () => o.onLink!(x.id, false));
          el.addEventListener("focus", () => o.onLink!(x.id, true));
          el.addEventListener("blur", () => o.onLink!(x.id, false));
        }
        parent.appendChild(el);
      } else {
        const el = document.createElement("span");
        el.className = "sl-value";
        el.textContent = o.value ?? "—";
        parent.appendChild(el);
      }
    }
  };
  for (const p of parseRich(src)) {
    if (p.t === "p") {
      const el = document.createElement("p");
      inl(el, p.c);
      frag.appendChild(el);
    } else {
      const el = document.createElement(p.t);
      if (p.t === "ol" && p.start !== 1)
        el.setAttribute("start", String(p.start));
      for (const it of p.items) {
        const li = document.createElement("li");
        inl(li, it);
        el.appendChild(li);
      }
      frag.appendChild(el);
    }
  }
  return frag;
}

/**
 * Auto-fit: the largest scale in [min, 1] at which `overflows(k)` is false (binary search, 7 probes ≈ 1 %).
 * The text keeps its style's size when it fits; it only shrinks, never grows.
 */
export function fitScale(
  overflows: (k: number) => boolean,
  min = 0.55,
): number {
  if (!overflows(1)) return 1;
  if (overflows(min)) return min;
  let lo = min;
  let hi = 1;
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    if (overflows(mid)) hi = mid;
    else lo = mid;
  }
  return Math.floor(lo * 100) / 100;
}

// ------------------------------------------------------------------ typography (SPEC slides v2 §2)
const NNBSP = " ";
const NBSP = " ";
/**
 * Language typography at render time (never stored): numbers keep their units, French thousands take a narrow
 * no-break space ("14 000" never breaks), U+202F before ; ! ? and inside « », U+00A0 before : and around " — ".
 * Pure.
 */
export function typo(s: string, lang: Lang): string {
  let t = keepUnits(s);
  if (lang === "fr") {
    // 14 000 / 1 663 (a space between digit groups) → narrow no-break space, only before exactly 3 digits
    t = t.replace(/(\d)[  ](?=\d{3}(?!\d))/g, `$1${NNBSP}`);
    t = t.replace(/[  ]+([;!?»])/g, `${NNBSP}$1`).replace(/«[  ]+/g, `«${NNBSP}`);
    t = t.replace(/(\S)[  ]+:/g, `$1${NBSP}:`);
    t = t.replace(/ — /g, `${NBSP}— `);
  }
  return t;
}

// ------------------------------------------------------------------ formula markup (SPEC slides v2 §3)
//   {angle} = 60 × [écart/distance]      {x} a variable (italic), [a/b] a stacked fraction, _ft_ a unit,
//   !8°! the result (accent), and "label | expression" lines make a derivation grid aligned on "=".
// Plain formulas (older "mono" text) render too: operators get real glyphs and air, numbers tabular figures, and
// lines with runs of 2+ spaces become table columns.
export type FormulaNode =
  | { t: "num" | "text"; s: string }
  | { t: "var" | "unit" | "result" | "op"; s: string }
  | { t: "frac"; a: FormulaNode[]; b: FormulaNode[] };

const OPS: Record<string, string> = {
  "=": "=",
  "×": "×",
  "*": "×",
  "÷": "÷",
  "−": "−",
  "+": "+",
  "≈": "≈",
  "→": "→",
  "<": "<",
  ">": ">",
  "≤": "≤",
  "≥": "≥",
  "±": "±",
};
/** Parse one formula line. Pure. */
export function parseFormula(src: string): FormulaNode[] {
  const out: FormulaNode[] = [];
  let buf = "";
  const flush = () => {
    if (!buf) return;
    // split the plain run into numbers and words
    for (const m of buf.matchAll(/(\d[\d   .,]*\d|\d)|([^\d]+)/g)) {
      if (m[1]) out.push({ t: "num", s: m[1].replace(/ (?=\d{3}(?!\d))/g, NNBSP) });
      else if (m[2]) out.push({ t: "text", s: m[2] });
    }
    buf = "";
  };
  let i = 0;
  const close = (open: string, end: string): number => {
    // the matching end for an opening bracket (nested brackets allowed)
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === open) depth++;
      else if (src[j] === end && --depth === 0) return j;
    }
    return -1;
  };
  while (i < src.length) {
    const c = src[i];
    if (c === "{") {
      const j = src.indexOf("}", i + 1);
      if (j > i) {
        flush();
        out.push({ t: "var", s: src.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
    }
    if (c === "[") {
      const j = close("[", "]");
      const inner = j > i ? src.slice(i + 1, j) : "";
      // the fraction bar: the first "/" outside nested brackets
      let depth = 0;
      let bar = -1;
      for (let k = 0; k < inner.length; k++) {
        if (inner[k] === "[") depth++;
        else if (inner[k] === "]") depth--;
        else if (inner[k] === "/" && depth === 0) {
          bar = k;
          break;
        }
      }
      if (j > i && bar > 0) {
        flush();
        out.push({ t: "frac", a: parseFormula(inner.slice(0, bar).trim()), b: parseFormula(inner.slice(bar + 1).trim()) });
        i = j + 1;
        continue;
      }
    }
    if (c === "_" || c === "!") {
      const j = src.indexOf(c, i + 1);
      if (j > i + 1) {
        flush();
        out.push({ t: c === "_" ? "unit" : "result", s: src.slice(i + 1, j) });
        i = j + 1;
        continue;
      }
    }
    // an operator surrounded by spaces (or a real glyph anywhere); an ASCII "-" between spaces is a minus
    const prev = src[i - 1];
    const next = src[i + 1];
    const spaced = (prev === undefined || prev === " ") && (next === undefined || next === " ");
    if ((OPS[c] && (c !== "*" || spaced) && (!"<>".includes(c) || spaced)) || (c === "-" && spaced) || (c === "/" && spaced)) {
      flush();
      const last = out[out.length - 1];
      if (last?.t === "text") {
        last.s = last.s.replace(/ $/, "");
        if (!last.s) out.pop();
      }
      out.push({ t: "op", s: c === "-" ? "−" : c === "/" ? "÷" : OPS[c] });
      i++;
      if (src[i] === " ") i++;
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}
/** Plain text of a formula (screen readers, the estimate). Pure. */
export function formulaText(nodes: FormulaNode[]): string {
  return nodes
    .map((n) => (n.t === "frac" ? `${formulaText(n.a)} / ${formulaText(n.b)}` : n.t === "op" ? ` ${n.s} ` : n.s))
    .join("");
}
/** The lines of a formula block: a derivation row "label | expression", a table row (2+ spaces), or a line. */
export type FormulaLine =
  | { t: "row"; label: string; expr: FormulaNode[] }
  | { t: "cells"; cells: string[] }
  | { t: "line"; expr: FormulaNode[] };
export function formulaLines(src: string): FormulaLine[] {
  const raw = src.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  // a table when every line splits on runs of 2+ spaces into ≥ 2 cells; a short row's cells go under the header
  // column they line up with (an older monospace table: "Total   2 263      91 522")
  const spans = (l: string) => [...l.matchAll(/\S+(?: \S+)*/g)].map((m) => ({ s: m[0], a: m.index ?? 0, b: (m.index ?? 0) + m[0].length }));
  const rows = raw.map(spans);
  const table = raw.length >= 2 && rows.every((r) => r.length >= 2);
  const head = rows[0] ?? [];
  const cellsOf = (r: ReturnType<typeof spans>): string[] => {
    if (r.length === head.length) return r.map((x) => x.s);
    const out = head.map(() => "");
    for (const x of r) {
      let best = 0;
      let d = Infinity;
      head.forEach((hh, k) => {
        const dd = Math.min(Math.abs(hh.a - x.a), Math.abs(hh.b - x.b));
        if (dd < d) {
          d = dd;
          best = k;
        }
      });
      out[best] = out[best] ? `${out[best]} ${x.s}` : x.s;
    }
    return out;
  };
  return raw.map((l, i) => {
    if (table) return { t: "cells", cells: cellsOf(rows[i]) };
    const bar = l.indexOf(" | ");
    if (bar > 0) return { t: "row", label: l.slice(0, bar).trim(), expr: parseFormula(l.slice(bar + 3).trim()) };
    return { t: "line", expr: parseFormula(l.trim()) };
  });
}
/** DOM for a formula block (no innerHTML). */
export function formulaFragment(src: string, lang: Lang): DocumentFragment {
  const frag = document.createDocumentFragment();
  const span = (cls: string, text?: string) => {
    const e = document.createElement("span");
    e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const nodes = (parent: HTMLElement, ns: FormulaNode[]) => {
    for (const n of ns) {
      if (n.t === "frac") {
        const f = span("fx-frac");
        const a = span("fx-top");
        const b = span("fx-bot");
        nodes(a, n.a);
        nodes(b, n.b);
        f.append(a, b);
        parent.append(f);
      } else if (n.t === "text") parent.append(document.createTextNode(typo(n.s, lang)));
      else parent.append(span(`fx-${n.t}`, n.t === "num" ? typo(n.s, lang) : n.s));
    }
  };
  const lines = formulaLines(src);
  const grid = lines.some((l) => l.t === "row");
  const table = lines.some((l) => l.t === "cells");
  const box = document.createElement("div");
  box.className = `fx${grid ? " fx-grid" : ""}${table ? " fx-table" : ""}`;
  if (table) box.style.setProperty("--fx-cols", String((lines[0] as { cells: string[] }).cells.length));
  const isNum = (c: string) => /^[\d\s\u202f.,−+-]+$/.test(c.trim());
  // a column of numbers is right-aligned, its header too
  const numCol = (k: number) => lines.slice(1).every((l) => l.t !== "cells" || !l.cells[k]?.trim() || isNum(l.cells[k]));
  for (const l of lines) {
    if (l.t === "cells") {
      l.cells.forEach((c, k) => {
        const cell = span(`fx-cell${isNum(c) || (k > 0 && numCol(k)) ? " is-num" : ""}${k === 0 ? " is-head" : ""}${l === lines[0] ? " is-hrow" : ""}`, typo(c.trim(), lang));
        box.append(cell);
      });
    } else if (l.t === "row") {
      box.append(span("fx-label", l.label));
      const e = span("fx-expr");
      nodes(e, l.expr);
      box.append(e);
    } else {
      const e = span("fx-line");
      nodes(e, l.expr);
      box.append(e);
    }
  }
  frag.append(box);
  return frag;
}

// ------------------------------------------------------------------ the text estimate (pure: checks, the readability guard)
/** Approximate advance widths of Inter, in em, by character class. */
function charEm(c: string): number {
  if (c === " " || c === NBSP || c === NNBSP) return c === NNBSP ? 0.17 : 0.27;
  if ("iljI.,:;'’!|ıf()[]".includes(c)) return 0.3;
  if ("trJ1/\\-".includes(c)) return 0.4;
  if ("mwMW".includes(c)) return 0.86;
  if (/[0-9]/.test(c)) return 0.62;
  if (/[A-ZÀ-ÖØ-Þ]/.test(c)) return 0.68;
  if ("°«»×÷−+=≈→".includes(c)) return 0.62;
  return 0.56;
}
/** The estimated width of a run of text in px. */
export function textWidth(s: string, size: number, weight = 400, tracking = 0, upper = false): number {
  let em = 0;
  for (const c of upper ? s.toUpperCase() : s) em += charEm(c) + tracking;
  return em * size * (weight >= 600 ? 1.04 : weight >= 500 ? 1.02 : 1);
}
export interface TextFitInput {
  text: string;
  size: number;
  weight: number;
  lineHeight: number;
  tracking?: number;
  upper?: boolean;
  w: number;
  h: number;
}
/** Estimated lines and height of rich text at `size` in a frame `w` wide. Pure. */
export function estimateText(t: TextFitInput, k = 1): { lines: number; height: number; widest: number } {
  const size = t.size * k;
  const paras = parseRich(t.text);
  let lines = 0;
  let height = 0;
  let widest = 0;
  const inl = (c: Inline[]): string => c.map((x) => (x.t === "text" || x.t === "code" ? x.s : x.t === "link" ? x.label : x.t === "value" ? "00,0" : inl(x.c))).join("");
  const wrap = (s: string, w: number) => {
    let n = 0;
    for (const hard of s.split("\n")) {
      const words = hard.split(/[ ]+/).filter(Boolean);
      let line = 0;
      n++;
      for (const wd of words) {
        const ww = textWidth(wd, size, t.weight, t.tracking ?? 0, t.upper);
        widest = Math.max(widest, ww);
        const sp = textWidth(" ", size, t.weight, t.tracking ?? 0);
        if (line > 0 && line + sp + ww > w) {
          n++;
          line = ww;
        } else line += (line > 0 ? sp : 0) + ww;
      }
    }
    return n;
  };
  paras.forEach((p, i) => {
    if (i) height += 0.55 * size;
    if (p.t === "p") {
      const n = wrap(inl(p.c), t.w);
      lines += n;
      height += n * size * t.lineHeight;
    } else {
      p.items.forEach((it, j) => {
        if (j) height += 0.32 * size;
        const n = wrap(inl(it), t.w - 1.15 * size);
        lines += n;
        height += n * size * t.lineHeight;
      });
    }
  });
  return { lines, height, widest };
}
/** The scale the renderer's auto-fit would settle on (1 = fits at the style's size), estimated. Pure. */
export function estimateFit(t: TextFitInput, min = 0.3): number {
  const over = (k: number) => {
    const e = estimateText(t, k);
    return e.height > t.h + 1 || e.widest > t.w + 1;
  };
  return fitScale(over, min);
}
