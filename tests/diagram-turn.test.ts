// The turn calc diagram (stage/diagramTurn.ts): the maths of a coordinated level turn, and the drawing's labels.
import { beforeAll, describe, expect, it } from "vitest";
import { solveTurn } from "../src/course/stage/diagramTurn";
import { createCalcDiagram, hasCalcDiagram } from "../src/course/stage/diagrams";
import { installFakeSvgDom } from "./fakeSvgDom";

describe("solveTurn", () => {
  it("standard rate at 101 KTAS needs about 15.5° of bank (TAS/10 + 7 rule ≈ 17°)", () => {
    const t = solveTurn(101, 15.5);
    expect(t.rateDps).toBeCloseTo(3, 1);
    expect(t.fullS).toBeGreaterThan(115);
    expect(t.fullS).toBeLessThan(125);
  });
  it("radius = TAS² / (11.26 tan φ): 101 kt, 15° → about 3,380 ft (0.56 NM)", () => {
    const t = solveTurn(101, 15);
    expect(t.radiusFt).toBeGreaterThan(3300);
    expect(t.radiusFt).toBeLessThan(3450);
    expect(t.radiusNm).toBeCloseTo(t.radiusFt / 6076.12, 6);
  });
  it("a steep, fast spiral: 125 kt at 55° turns about 12°/s on under 1,000 ft", () => {
    const t = solveTurn(125, 55);
    expect(t.rateDps).toBeGreaterThan(12);
    expect(t.rateDps).toBeLessThan(13);
    expect(t.radiusFt).toBeLessThan(1000);
  });
});

describe("the turn widget", () => {
  beforeAll(() => installFakeSvgDom());
  it("is drawn by the stage, with the rate, radius, bank and speed in the language asked", () => {
    expect(hasCalcDiagram("turn")).toBe(true);
    for (const lang of ["en", "fr"] as const) {
      const w = createCalcDiagram({ kind: "turn", tasKt: 101, bankDeg: 15.5 }, { lang, w: 960, h: 648, u: 1 });
      expect(w).not.toBeNull();
      const text = (w!.el as unknown as { textContent: string }).textContent;
      expect(text).toContain(lang === "fr" ? "3,0°/s" : "3.0°/s");
      expect(text).toContain(lang === "fr" ? "taux standard" : "standard rate");
      expect(text).toContain(lang === "fr" ? "Vp 101 kt" : "TAS 101 kt");
      expect(text).toMatch(/NM/);
    }
  });
});
