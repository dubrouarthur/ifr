// « Nouveau cours »: one even grid of 16:9 cards, « Partir d'une description (IA) » first (audit item 62).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const nc = readFileSync("src/course/ui/newCourse.ts", "utf8");
const css = readFileSync("src/styles/newcourse.css", "utf8");

describe("new course starting points (item 62)", () => {
  it("the AI card comes first in the grid, before the templates' radio group", () => {
    expect(nc).toMatch(/h\("div", \{ class: "nc-grid" \}, ai, radios\)/);
    expect(nc).toMatch(/"Partir d’une description \(IA\)"/);
    expect(nc).toMatch(/"Start from a description \(AI\)"/);
    expect(nc).not.toMatch(/class: "nc-ai-row"/);
  });
  it("cards share one width (no double-width feature card) at 320 px and more", () => {
    expect(css).toMatch(/grid-template-columns: repeat\(auto-fill, minmax\(320px, 1fr\)\);/);
    expect(css).toMatch(/\.nc-card\.is-feature \{\s*grid-column: auto;/);
    expect(css).toMatch(/\.nc-cover \{[^}]*aspect-ratio: 16 \/ 9;/);
  });
});
