// Ground school — designed slides: the readability guard (SPEC slides v2 §13). Measures a slide from its model
// and its diagrams' SVG output, at the 1920 × 1080 logical size, without a layout engine:
//   - every text (text blocks at their fitted size, callouts, quiz and check rows, every SVG <text> inside a
//     diagram, scaled by the diagram's own viewBox) must be ≥ 24 logical px — 17 CSS px at 1440, 12 at 1024;
//   - a text frame whose words cannot fit even at that floor is "too long";
//   - no block leaves the canvas; no two content blocks overlap unless the overlap is meant (a card behind its
//     text, markers and arrows, a group, a block that replaces another when an event fires);
//   - no two labels inside a diagram overlap.
// The text measure is an estimate of Inter's advance widths (text.ts estimateText), deliberately a little wide.
// The editor's Checks panel lists the same findings ("Text too small to read on a projector"); a vitest runs
// it over every sample slide in both languages.
import type {
  CalcProblem,
  L10n,
  Lang,
  SlideBlock,
  SlideCanvas,
  SlideTheme,
} from "../types";
import {
  estimateFit,
  estimateText,
  formulaLines,
  formulaText,
  loc,
  plainText,
  textWidth,
} from "./text";
import { MIN_TEXT_PX } from "./themes";
import { fitFloor, HINT_H, slidePalette } from "./metrics";
import { createCalcDiagram, holdColorsOf } from "../stage/diagrams";
import { holdSlideSvg } from "../../train/diagram";
import { airspaceSvg, AIRSPACE_H, AIRSPACE_W } from "./airspace";
import { paletteOf } from "./library";
import { SLIDE_H, SLIDE_W } from "./geom";

export type ReadIssueKind =
  /** a text under 24 logical px */
  | "small"
  /** words that do not fit their frame even at 24 px */
  | "overflow"
  /** a frame that shrinks its text well below its style's size (fits, but reads small) */
  | "shrunk"
  | "offCanvas"
  | "overlap"
  /** two labels inside a diagram on top of each other */
  | "labelOverlap";
export interface ReadIssue {
  kind: ReadIssueKind;
  blockId: string;
  /** the other block of an overlap */
  otherId?: string;
  /** the smallest size found, logical px */
  px?: number;
  /** what was measured (a label's text, a style) */
  what?: string;
}
export interface ReadOptions {
  theme: SlideTheme;
  lang: Lang;
  /** build the diagrams and measure their SVG (needs a DOM; off for a cheap check) */
  diagrams?: boolean;
  calcProblem?: (stepId: string) => CalcProblem | null;
}
/** Kinds that fail the guard (the others are advisories). */
export const READ_FAILS: ReadonlySet<ReadIssueKind> = new Set<ReadIssueKind>([
  "small",
  "overflow",
  "offCanvas",
  "overlap",
  "labelOverlap",
]);

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const inter = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** The estimated size a text block settles at (its style's size × the fit), and whether it overflows. Pure. */
export function textBlockFit(
  b: Extract<SlideBlock, { kind: "text" }>,
  theme: SlideTheme,
  lang: Lang,
): { size: number; px: number; overflow: boolean; k: number; height: number } {
  const st = theme.styles[b.style] ?? theme.styles.body;
  const src = loc(b.text, lang).replace(/\{\{[^}]*\}\}/g, "00,0 pt");
  const formula = b.style === "formula" || b.style === "mono";
  let text = src;
  let lineHeight = st.lineHeight;
  if (formula) {
    // a fraction stacks two lines; derivation rows are 20 px apart
    const lines = formulaLines(src);
    text = lines
      .map((l) =>
        l.t === "cells"
          ? l.cells.join("   ")
          : l.t === "row"
            ? `${l.label}   ${formulaText(l.expr)}`
            : formulaText(l.expr),
      )
      .join("\n");
    const frac = /\[[^\]]*\/[^\]]*\]/.test(src);
    if (frac) lineHeight = st.lineHeight * 2.1;
    // a fraction "a / b" is as wide as its longer part
    text = text.replace(/(\S+) \/ (\S+)/g, (_m, a: string, c: string) =>
      a.length > c.length ? a : c,
    );
  }
  const input = {
    text,
    size: st.size,
    weight: st.weight,
    lineHeight,
    tracking: st.tracking ?? 0,
    upper: st.upper,
    w: b.frame.w,
    h: b.frame.h,
  };
  const min = fitFloor(st.size);
  const k = estimateFit(input, min);
  const e = estimateText(input, k);
  const overflow =
    k <= min + 1e-6 && (e.height > b.frame.h + 1 || e.widest > b.frame.w + 1);
  return { size: st.size, px: st.size * k, overflow, k, height: Math.min(b.frame.h, e.height) };
}

/** Text elements of an SVG (a DOM tree or a string): font-size, position, anchor, text. */
interface SvgText {
  size: number;
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  weight: number;
  text: string;
}
function textsOfString(svg: string): {
  vb: [number, number] | null;
  texts: SvgText[];
} {
  const vbm = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  const texts: SvgText[] = [];
  for (const m of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const a = m[1];
    const num = (k: string) => {
      const r = new RegExp(`\\b${k}="([\\d.\\-]+)"`).exec(a);
      return r ? Number(r[1]) : NaN;
    };
    const inner = m[2];
    const tsp = [...inner.matchAll(/<tspan\b([^>]*)>([^<]*)<\/tspan>/g)];
    const anchor = (/text-anchor="(start|middle|end)"/.exec(a)?.[1] ??
      "start") as SvgText["anchor"];
    const weight = num("font-weight") || 400;
    if (tsp.length) {
      for (const t of tsp) {
        const fsm = /font-size="([\d.]+)"/.exec(t[1]);
        texts.push({
          size: fsm ? Number(fsm[1]) : num("font-size"),
          x: num("x"),
          y: num("y"),
          anchor,
          weight,
          text: t[2],
        });
      }
    } else
      texts.push({
        size: num("font-size"),
        x: num("x"),
        y: num("y"),
        anchor,
        weight,
        text: inner.replace(/<[^>]+>/g, ""),
      });
  }
  return { vb: vbm ? [Number(vbm[1]), Number(vbm[2])] : null, texts };
}
function textsOfDom(svg: SVGSVGElement): {
  vb: [number, number] | null;
  texts: SvgText[];
} {
  const vbs = (svg.getAttribute("viewBox") ?? "").split(/\s+/).map(Number);
  const texts: SvgText[] = [];
  const walk = (el: Element) => {
    for (const c of Array.from(el.children)) {
      if (c.tagName.toLowerCase() === "text") {
        const g = (k: string) => c.getAttribute(k);
        const t = (c.textContent ?? "").trim();
        if (t)
          texts.push({
            size: Number(g("font-size")),
            x: Number(g("x")),
            y: Number(g("y")),
            anchor: (g("text-anchor") as SvgText["anchor"]) ?? "start",
            weight: Number(g("font-weight")) || 400,
            text: t,
          });
      } else walk(c);
    }
  };
  walk(svg);
  return { vb: vbs.length === 4 ? [vbs[2], vbs[3]] : null, texts };
}
const boxOf = (t: SvgText, k: number): Rect => {
  const w = textWidth(t.text, t.size, t.weight) * k;
  const x =
    t.x * k - (t.anchor === "middle" ? w / 2 : t.anchor === "end" ? w : 0);
  return { x, y: (t.y - 0.74 * t.size) * k, w, h: 0.94 * t.size * k };
};
/** The texts a diagram block draws, in logical px (null when it cannot be measured here). */
export function diagramTexts(
  b: Extract<SlideBlock, { kind: "diagram" }>,
  o: ReadOptions,
): { texts: SvgText[]; k: number } | null {
  const d =
    b.d ?? (b.fromCalc ? o.calcProblem?.(b.fromCalc)?.diagram : undefined);
  if (!d) return null;
  const hasHint = !!b.caption || (d.kind === "hold" && !d.quiet) || d.kind === "calc";
  const W = b.frame.w;
  const H = Math.max(80, b.frame.h - (hasHint ? HINT_H : 0));
  const palette = slidePalette(o.theme);
  const scaleOf = (vb: [number, number] | null) =>
    vb ? Math.min(W / vb[0], H / vb[1]) : 1;
  if (d.kind === "hold") {
    const r = textsOfString(
      holdSlideSvg(d.inbound, d.turn, d.fix, {
        w: W,
        h: H,
        u: 1,
        lang: o.lang,
        colors: holdColorsOf(palette),
        quiet: d.quiet,
        courseToFix: d.crs,
      }),
    );
    return { texts: r.texts, k: scaleOf(r.vb) };
  }
  if (d.kind === "airspace") {
    const r = textsOfString(airspaceSvg(d.sketch, paletteOf(o.theme), o.lang));
    return { texts: r.texts, k: scaleOf(r.vb ?? [AIRSPACE_W, AIRSPACE_H]) };
  }
  if (d.kind === "calc") {
    if (typeof document === "undefined") return null;
    const w = createCalcDiagram(d.calc, {
      palette,
      lang: o.lang,
      w: W,
      h: H,
      u: 1,
      transparent: true,
      card: false,
      drag: b.interactive ? d.calc.drag : [],
    });
    if (!w) return null;
    const r = textsOfDom(w.el);
    w.destroy();
    return { texts: r.texts, k: scaleOf(r.vb) };
  }
  return null;
}

/** Everything the guard finds on one slide. Pure apart from building the diagrams' SVG. */
export function slideReadability(
  slide: SlideCanvas,
  o: ReadOptions,
): ReadIssue[] {
  const out: ReadIssue[] = [];
  const th = o.theme;
  const small = (blockId: string, px: number, what: string) => {
    if (px < MIN_TEXT_PX - 0.05)
      out.push({ kind: "small", blockId, px: Math.round(px * 10) / 10, what });
  };
  for (const b of slide.blocks) {
    const f = b.frame;
    if (b.presenterOnly) continue;
    // on the canvas (rotation ignored)
    if (
      f.x < -0.5 ||
      f.y < -0.5 ||
      f.x + f.w > SLIDE_W + 0.5 ||
      f.y + f.h > SLIDE_H + 0.5
    )
      out.push({ kind: "offCanvas", blockId: b.id });
    switch (b.kind) {
      case "text": {
        if (!loc(b.text, o.lang).trim()) break;
        const r = textBlockFit(b, th, o.lang);
        small(b.id, r.size, b.style);
        if (r.overflow)
          out.push({
            kind: "overflow",
            blockId: b.id,
            px: Math.round(r.px),
            what: b.style,
          });
        else if (r.k < 0.8 && r.size < 72)
          out.push({
            kind: "shrunk",
            blockId: b.id,
            px: Math.round(r.px),
            what: b.style,
          });
        break;
      }
      case "callout": {
        const st = th.styles.body;
        const size = st.size * 0.86;
        small(b.id, size, "callout");
        const pad = 28 + (b.n !== undefined ? 76 : 0);
        const k = estimateFit(
          {
            text: plainText(loc(b.text, o.lang)),
            size,
            weight: st.weight,
            lineHeight: st.lineHeight,
            w: f.w - pad,
            h: f.h - 8,
          },
          fitFloor(size),
        );
        const e = estimateText(
          {
            text: plainText(loc(b.text, o.lang)),
            size,
            weight: st.weight,
            lineHeight: st.lineHeight,
            w: f.w - pad,
            h: f.h - 8,
          },
          k,
        );
        if (k <= fitFloor(size) + 1e-6 && e.height > f.h)
          out.push({
            kind: "overflow",
            blockId: b.id,
            px: Math.round(size * k),
            what: "callout",
          });
        break;
      }
      case "quiz": {
        const q = b.quiz;
        if (q.kind !== "mcq") break;
        // the quiz scales its content together, never under 24 px: does it fit at that floor?
        const k = MIN_TEXT_PX / 34;
        const prompt = estimateText({
          text: plainText(loc(q.prompt, o.lang)),
          size: 44 * k,
          weight: 600,
          lineHeight: 1.18,
          w: f.w,
          h: f.h,
        });
        const tiles =
          q.options.length <= 4 &&
          q.options.every((x) => plainText(loc(x.text, o.lang)).length <= 12);
        const cols = Math.max(
          1,
          Math.min(q.options.length, Math.floor((f.w + 24) / 224)),
        );
        const optH = tiles
          ? Math.ceil(q.options.length / cols) * (200 * k + 24 * k)
          : q.options.reduce(
              (s, x) =>
                s +
                Math.max(
                  88,
                  estimateText({
                    text: plainText(loc(x.text, o.lang)),
                    size: 36 * k,
                    weight: 500,
                    lineHeight: 1.25,
                    w: f.w - 140 * k,
                    h: 999,
                  }).height +
                    24 * k,
                ) +
                16 * k,
              0,
            );
        const whys = [
          loc(q.explain, o.lang),
          ...q.options.map((x) => (x.why ? loc(x.why, o.lang) : "")),
        ];
        const why = Math.max(
          ...whys.map(
            (t) =>
              estimateText({
                text: plainText(t),
                size: Math.max(24, 34 * k),
                weight: 400,
                lineHeight: 1.42,
                w: f.w,
                h: 999,
              }).height,
          ),
        );
        const need = 32 + 24 * k + prompt.height + 10 * k + optH + 24 * k + why;
        if (need > f.h + 2)
          out.push({ kind: "overflow", blockId: b.id, px: 24, what: "quiz" });
        break;
      }
      case "checklist": {
        const k = MIN_TEXT_PX / 34;
        const rows = b.rows.reduce(
          (s, r) =>
            s +
            Math.max(
              80 * k,
              estimateText({
                text: plainText(loc(r.text, o.lang)),
                size: 24,
                weight: 400,
                lineHeight: 1.35,
                w: f.w - 64 * k - 80,
                h: 999,
              }).height +
                28 * k,
            ),
          0,
        );
        const head = b.title && !loc(b.title, o.lang) ? 0 : 44;
        if (head + rows > f.h + 2)
          out.push({
            kind: "overflow",
            blockId: b.id,
            px: 24,
            what: "checklist",
          });
        break;
      }
      case "diagram": {
        if (o.diagrams === false) break;
        const r = diagramTexts(b, o);
        if (!r) break;
        let minPx = Infinity;
        let minWhat = "";
        for (const t of r.texts) {
          const px = t.size * r.k;
          if (px < minPx) {
            minPx = px;
            minWhat = t.text;
          }
        }
        if (minPx < Infinity) small(b.id, minPx, `“${minWhat}”`);
        const boxes = r.texts.map((t) => ({ t, r: boxOf(t, r.k) }));
        for (let i = 0; i < boxes.length; i++)
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i].r;
            const c = boxes[j].r;
            const ov = inter(a, c);
            if (ov > 0.12 * Math.min(a.w * a.h, c.w * c.h))
              out.push({
                kind: "labelOverlap",
                blockId: b.id,
                what: `“${boxes[i].t.text}” / “${boxes[j].t.text}”`,
              });
          }
        break;
      }
      default:
        break;
    }
  }
  // blocks on top of each other
  const CONTENT = new Set([
    "text",
    "diagram",
    "instrument",
    "quiz",
    "calc",
    "checklist",
    "image",
    "simViewport",
    "callout",
  ]);
  const meant = (a: SlideBlock, c: SlideBlock) => {
    if (a.frame.group && a.frame.group === c.frame.group) return true;
    // a block revealed by an event replaces what is under it (the hold appears over the HSI once answered)
    const ev = (x: SlideBlock) =>
      !!x.reveal &&
      !!x.reveal.when &&
      x.reveal.when !== "click" &&
      x.reveal.when !== "presenter";
    if (ev(a) || ev(c)) return true;
    return false;
  };
  // a text block occupies the lines it draws, not its whole frame (valign places them)
  const area = (b: SlideBlock): Rect => {
    if (b.kind !== "text") return b.frame;
    const h = textBlockFit(b, th, o.lang).height;
    const f = b.frame;
    const y = b.valign === "bottom" ? f.y + f.h - h : b.valign === "middle" ? f.y + (f.h - h) / 2 : f.y;
    return { x: f.x, y, w: f.w, h };
  };
  const list = slide.blocks.filter(
    (b) => CONTENT.has(b.kind) && !b.presenterOnly && (b.kind !== "text" || !!loc(b.text, o.lang).trim()),
  );
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const c = list[j];
      if (meant(a, c)) continue;
      const ra = area(a);
      const rc = area(c);
      const ov = inter(ra, rc);
      if (ov <= 0) continue;
      // a sliver (frames that touch, a generous frame edge) is not an overlap
      const minA = Math.min(ra.w * ra.h, rc.w * rc.h);
      const ih = Math.min(ra.y + ra.h, rc.y + rc.h) - Math.max(ra.y, rc.y);
      const iw = Math.min(ra.x + ra.w, rc.x + rc.w) - Math.max(ra.x, rc.x);
      if (ov > 0.04 * minA && ih >= 12 && iw >= 12) out.push({ kind: "overlap", blockId: a.id, otherId: c.id });
    }
  return out;
}

/** One line for an issue (checks panel, test failures). */
export function readIssueText(i: ReadIssue, lang: Lang): L10n {
  const fr = lang === "fr";
  void fr;
  switch (i.kind) {
    case "small":
      return {
        en: `Text too small to read on a projector: ${i.px} px at 1920 (minimum ${MIN_TEXT_PX})${i.what ? ` · ${i.what}` : ""}`,
        fr: `Texte trop petit pour un projecteur : ${i.px} px à 1920 (minimum ${MIN_TEXT_PX})${i.what ? ` · ${i.what}` : ""}`,
      };
    case "overflow":
      return {
        en: "Text too long for its frame, even at the 24 px floor: shorten it or enlarge the frame",
        fr: "Texte trop long pour son cadre, même à 24 px : raccourcissez-le ou agrandissez le cadre",
      };
    case "shrunk":
      return {
        en: `Text shrunk to ${i.px} px to fit its frame: shorten it or enlarge the frame`,
        fr: `Texte réduit à ${i.px} px pour tenir dans son cadre : raccourcissez-le ou agrandissez le cadre`,
      };
    case "offCanvas":
      return {
        en: "A block goes off the slide",
        fr: "Un bloc sort de la diapositive",
      };
    case "overlap":
      return { en: "Two blocks overlap", fr: "Deux blocs se chevauchent" };
    case "labelOverlap":
      return {
        en: `Diagram labels overlap: ${i.what ?? ""}`,
        fr: `Des étiquettes du schéma se chevauchent : ${i.what ?? ""}`,
      };
  }
}
