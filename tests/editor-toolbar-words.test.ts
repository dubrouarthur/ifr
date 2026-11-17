// The editor says where its back button goes, « Annuler » is « Annuler la modification » (audit item 51), every
// toolbar target is 44 px and the slides' language is a labelled dropdown, FR first (item 58).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ed = readFileSync("src/course/ui/editor.ts", "utf8");
const css = readFileSync("src/styles/course-studio.css", "utf8");

describe("editor words (item 51)", () => {
  it("the back button names the place it lands on", () => {
    expect(ed).toMatch(/btn\(fr \? "Mes cours et brouillons" : "My courses and drafts", \(\) => this\.exit\(\)/);
    expect(ed).not.toMatch(/btn\(fr \? "Mes cours" : "My courses"/);
  });
  it("the undo tooltip says it undoes a change", () => {
    expect(ed).toMatch(/Annuler la modification \(/);
    expect(ed).toMatch(/Undo the last change \(/);
  });
});

describe("toolbar (item 58)", () => {
  it("the slides' language is a select labelled « Langue de la diapo », FR before EN", () => {
    expect(ed).toMatch(/"Langue de la diapo" : "Slide language"/);
    expect(ed).toMatch(/\(\["fr", "en"\] as Lang\[\]\)\.map\(\(l\) => \{\s+const o = h\("option"/);
    expect(ed).not.toMatch(/"aria-label": fr \? "Langue du contenu"/);
  });
  it("toolbar buttons are at least 44 px", () => {
    expect(css).toMatch(/\.ce-app \.ce-ctool \.ce-btn,\s*\.ce-app \.ce-ctool \.ce-zoom-v \{\s*min-height: 44px;/);
    expect(css).toMatch(/\.ce-app \.ce-ctool \.ce-btn\.ic \{\s*min-width: 44px;/);
  });
});
