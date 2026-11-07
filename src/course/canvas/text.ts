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
          if (s) parent.appendChild(document.createTextNode(keepUnits(s)));
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
