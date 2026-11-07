// The readability guard (SPEC slides v2 §13): every slide of every sample course, in French and in English, at the
// 1920 × 1080 logical size. It fails when a text — a text block at its fitted size, a callout, a quiz or check
// row, or any SVG label inside a diagram — would be under 24 logical px (17 CSS px at 1440), when words cannot fit
// their frame even at that floor, when a block leaves the canvas, when two content blocks overlap without meaning
// to, or when two labels of a diagram sit on top of each other. Diagrams are really built (a tiny SVG DOM below),
// at the block's size, exactly as the renderer builds them.
import { beforeAll, describe, expect, it } from "vitest";
import { SAMPLES } from "../src/course/samples/index";
import {
  HERO_MIN_CSS_PX,
  HERO_MIN_SCALE,
  HERO_MIN_TEXT,
  productDeck,
} from "../src/course/samples/productDeck";
import { resolveTheme } from "../src/course/canvas/themes";
import { LAYOUTS, layoutCanvas } from "../src/course/canvas/layouts";
import {
  READ_FAILS,
  diagramTexts,
  readIssueText,
  slideReadability,
  textBlockFit,
} from "../src/course/canvas/readability";
import {
  estimateText,
  formulaLines,
  parseFormula,
  typo,
} from "../src/course/canvas/text";
import { holdSlideSvg } from "../src/train/diagram";
import { hasCalcDiagram } from "../src/course/stage/calcKinds";
import { quizUsesTiles } from "../src/course/canvas/blocks";
import type { Lang, SlideBlock } from "../src/course/types";

// ------------------------------------------------------------------ a tiny SVG DOM (enough for the diagram widgets)
class FakeNode {
  parentNode: FakeEl | null = null;
  constructor(public nodeType: number) {}
  remove() {
    if (!this.parentNode) return;
    const k = this.parentNode.childNodes.indexOf(this as never);
    if (k >= 0) this.parentNode.childNodes.splice(k, 1);
    this.parentNode = null;
  }
  get nextSibling(): FakeNode | null {
    const p = this.parentNode;
    if (!p) return null;
    return p.childNodes[p.childNodes.indexOf(this as never) + 1] ?? null;
  }
}
class FakeText extends FakeNode {
  constructor(public data: string) {
    super(3);
  }
  get textContent() {
    return this.data;
  }
}
class FakeEl extends FakeNode {
  childNodes: FakeNode[] = [];
  attrs = new Map<string, string>();
  style = { setProperty() {} } as unknown as CSSStyleDeclaration;
  classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
  constructor(public tagName: string) {
    super(1);
  }
  get children(): FakeEl[] {
    return this.childNodes.filter((c): c is FakeEl => c instanceof FakeEl);
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, String(v));
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  removeAttribute(k: string) {
    this.attrs.delete(k);
  }
  append(...ns: (FakeNode | string)[]) {
    for (const n of ns)
      this.appendChild(typeof n === "string" ? new FakeText(n) : n);
  }
  appendChild(n: FakeNode) {
    n.remove();
    n.parentNode = this;
    this.childNodes.push(n);
    return n;
  }
  insertBefore(n: FakeNode, ref: FakeNode | null) {
    n.remove();
    n.parentNode = this;
    const k = ref ? this.childNodes.indexOf(ref) : -1;
    if (k < 0) this.childNodes.push(n);
    else this.childNodes.splice(k, 0, n);
    return n;
  }
  replaceChildren(...ns: (FakeNode | string)[]) {
    for (const c of [...this.childNodes]) c.remove();
    this.append(...ns);
  }
  addEventListener() {}
  get textContent(): string {
    return this.childNodes
      .map((c) => (c as FakeEl | FakeText).textContent)
      .join("");
  }
  set textContent(v: string) {
    this.replaceChildren(new FakeText(v));
  }
}
beforeAll(() => {
  (globalThis as { document?: unknown }).document = {
    createElementNS: (_ns: string, tag: string) => new FakeEl(tag),
    createElement: (tag: string) => new FakeEl(tag),
    createTextNode: (t: string) => new FakeText(t),
  };
});

// ------------------------------------------------------------------ the guard over the samples
const LANGS: Lang[] = ["fr", "en"];
describe("readability guard: every sample slide at 1920 × 1080", () => {
  for (const def of SAMPLES)
    for (const lang of LANGS)
      it(`${def.id} (${lang})`, () => {
        const course = def.build();
        const theme = resolveTheme(course.theme, course.brand);
        const fails: string[] = [];
        let diagrams = 0;
        for (const step of course.steps) {
          if (!step.slide) continue;
          diagrams += step.slide.blocks.filter(
            (b) => b.kind === "diagram",
          ).length;
          // a calc diagram the stage does not draw would show a placeholder box: it does not count as a diagram
          for (const b of step.slide.blocks)
            if (b.kind === "diagram" && b.d?.kind === "calc" && !hasCalcDiagram(b.d.calc.kind))
              fails.push(`${step.id}/${b.id}: calc diagram “${b.d.calc.kind}” is not drawn (a placeholder)`);
          for (const i of slideReadability(step.slide, { theme, lang }))
            if (READ_FAILS.has(i.kind))
              fails.push(
                `${step.id}/${i.blockId}${i.otherId ? `×${i.otherId}` : ""}: ${readIssueText(i, "en").en}`,
              );
        }
        expect(fails).toEqual([]);
        if (def.id !== "sample-vor") expect(diagrams).toBeGreaterThan(0);
      });
});

describe("readability guard: the start page's slide, at its smallest hero size (classroom theme)", () => {
  it("the floor is 12 CSS px at the smallest real hero scale", () => {
    expect(HERO_MIN_CSS_PX).toBe(12);
    // 1280 × 720 draws the 1920 canvas 672 px wide (0.35); 1024 × 768 and an iPad mini in portrait, about 640 (0.33)
    expect(HERO_MIN_SCALE).toBeLessThanOrEqual(672 / 1920);
    expect(HERO_MIN_SCALE).toBeLessThanOrEqual(640 / 1920);
    expect(HERO_MIN_TEXT).toBeGreaterThan(34);
  });
  for (const lang of LANGS)
    it(`every text and marker ≥ 12 px at hero scale (${lang})`, () => {
      const fails = productDeck().flatMap((s) =>
        slideReadability(s.slide, {
          theme: resolveTheme("classroom"),
          lang,
          minPx: HERO_MIN_TEXT,
        })
          .filter((i) => READ_FAILS.has(i.kind))
          .map((i) => `${s.id}/${i.blockId}: ${readIssueText(i, "en").en}`),
      );
      expect(fails).toEqual([]);
    });
});

describe("readability guard: every layout template", () => {
  for (const l of LAYOUTS)
    for (const lang of LANGS)
      for (const themeId of ["cockpit", "classroom"] as const)
        it(`${l.id} (${lang}, ${themeId})`, () => {
          const c = layoutCanvas(l.id);
          const fails = slideReadability(c, {
            theme: resolveTheme(themeId),
            lang,
          })
            .filter((i) => READ_FAILS.has(i.kind))
            .map((i) => `${i.blockId}: ${readIssueText(i, "en").en}`);
          expect(fails).toEqual([]);
        });
});

describe("the guard catches what it should", () => {
  const theme = resolveTheme("cockpit");
  const text = (
    style: "body" | "eyebrow",
    t: string,
    w: number,
    h: number,
  ): SlideBlock => ({
    id: "t",
    kind: "text",
    style,
    text: { en: t, fr: t },
    frame: { x: 120, y: 120, w, h, z: 1 },
  });
  it("a quiz shows big tiles only when every answer fits its tile", () => {
    const opts = (...t: string[]) => t.map((en) => ({ text: { en } }));
    // three entry names in a 816-wide block: "Teardrop" at 72 px does not fit a third of it → rows
    expect(quizUsesTiles(opts("Direct", "Teardrop", "Parallel"), "en", 816)).toBe(false);
    expect(quizUsesTiles(opts("Direct", "Teardrop", "Parallel"), "en", 1680)).toBe(true);
    expect(quizUsesTiles(opts("1 NM", "5 NM", "0.2 NM"), "en", 1680)).toBe(true);
    // long answers are always rows
    expect(quizUsesTiles(opts("Continue to 100 ft above the touchdown zone", "Land"), "en", 1680)).toBe(false);
  });
  it("a text that cannot fit its frame at 24 px", () => {
    const long = "word ".repeat(80);
    const r = slideReadability(
      { size: { w: 1920, h: 1080 }, blocks: [text("body", long, 400, 60)] },
      { theme, lang: "en" },
    );
    expect(r.some((i) => i.kind === "overflow")).toBe(true);
    expect(
      textBlockFit(text("body", "short", 800, 60) as never, theme, "en").k,
    ).toBe(1);
  });
  it("a block off the slide and two blocks on top of each other", () => {
    const words = "several words that fill a few lines of body text in this frame ".repeat(3);
    const a = text("body", words, 800, 200);
    const b = {
      ...text("body", words, 800, 200),
      id: "b",
      frame: { x: 200, y: 160, w: 800, h: 200, z: 1 },
    };
    const off = {
      ...text("body", "c", 800, 200),
      id: "c",
      frame: { x: 1600, y: 900, w: 800, h: 200, z: 1 },
    };
    const r = slideReadability(
      { size: { w: 1920, h: 1080 }, blocks: [a, b, off] },
      { theme, lang: "en" },
    );
    expect(r.some((i) => i.kind === "overlap")).toBe(true);
    expect(r.some((i) => i.kind === "offCanvas" && i.blockId === "c")).toBe(
      true,
    );
  });
  it("a diagram shrunk into a small block has labels under 24 px", () => {
    const tiny: SlideBlock = {
      id: "d",
      kind: "diagram",
      frame: { x: 120, y: 120, w: 300, h: 220, z: 1 },
      d: {
        kind: "airspace",
        sketch: {
          widthNm: 20,
          topFt: 6000,
          layers: [{ cls: "D", floorFt: 0, ceilFt: 2500, span: [-5, 5] }],
        },
      } as never,
      alt: { en: "x" },
    };
    const r = slideReadability(
      { size: { w: 1920, h: 1080 }, blocks: [tiny] },
      { theme, lang: "en" },
    );
    expect(r.some((i) => i.kind === "small")).toBe(true);
  });
  it("diagram labels are drawn in slide units: 24 px or more at the block's size", () => {
    const hold: SlideBlock = {
      id: "h",
      kind: "diagram",
      frame: { x: 120, y: 288, w: 960, h: 696, z: 1 },
      d: { kind: "hold", inbound: 270, turn: "R", fix: "ARD" },
      alt: { en: "hold" },
    };
    const r = diagramTexts(hold as never, { theme, lang: "fr" })!;
    expect(r.k).toBeCloseTo(1, 5);
    expect(Math.min(...r.texts.map((t) => t.size))).toBeGreaterThanOrEqual(24);
    const svg = holdSlideSvg(270, "R", "ARD", {
      w: 960,
      h: 648,
      colors: {
        bg: "#000",
        ink: "#fff",
        ink2: "#ccc",
        mute: "#999",
        ruleStrong: "#444",
        accent: "#6cb4ff",
        sel: "#5ad4ec",
        key: "#f4bb4a",
        nav: "#5bd98e",
      },
    });
    expect(svg).toContain('viewBox="0 0 960 648"');
    expect(svg).not.toMatch(/#ffffff|hd-bg/i);
  });
});

describe("typography and formulas", () => {
  it("French numbers and punctuation never break badly", () => {
    expect(typo("jusqu’à 14 000 ft", "fr")).toBe("jusqu’à 14 000 ft");
    expect(typo("Pourquoi ? Voici : la règle", "fr")).toBe(
      "Pourquoi ? Voici : la règle",
    );
    expect(typo("6 NM", "en")).toBe("6 NM");
  });
  it("parses the formula markup: variables, fractions, units, the result, derivation rows", () => {
    const f = parseFormula("{angle} = 60 × [{écart}/{distance}]");
    expect(f.map((n) => n.t)).toEqual(["var", "op", "num", "op", "frac"]);
    const rows = formulaLines(
      "erreur | = 60 × [4/30] = !8°!\nrejoindre | = 60 × [4/40] = !6°!",
    );
    expect(rows.every((r) => r.t === "row")).toBe(true);
    const r0 = rows[0] as Extract<(typeof rows)[number], { t: "row" }>;
    expect(r0.expr.some((n) => n.t === "result" && n.s === "8°")).toBe(true);
    // an older "mono" table becomes columns, not monospace
    expect(
      formulaLines("Poste   lb\nÀ vide   1 663").every((l) => l.t === "cells"),
    ).toBe(true);
  });
  it("estimates text like Inter: a short line fits, a long one wraps", () => {
    const one = estimateText({
      text: "Lire le HSI",
      size: 72,
      weight: 600,
      lineHeight: 1.08,
      w: 1392,
      h: 200,
    });
    expect(one.lines).toBe(1);
    const many = estimateText({
      text: "word ".repeat(60),
      size: 34,
      weight: 400,
      lineHeight: 1.42,
      w: 600,
      h: 200,
    });
    expect(many.lines).toBeGreaterThan(5);
  });
});
