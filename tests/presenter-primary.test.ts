// Audit item 40 (presenter): « Suivant » is the presenter's one filled button. « Ouvrir l'écran de projection » is
// outlined, and once the screen is open it becomes the chip « Projection ouverte ● » (a click brings it to the
// front, never reloads it). The presenter is DOM + canvas heavy, so this reads its source and its stylesheet.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync("src/course/ui/presenter.ts", "utf8");
const css = readFileSync("src/styles/presenter.css", "utf8");

describe("presenter: one filled button", () => {
  it("never makes the projector button primary", () => {
    expect(src).not.toMatch(/projBtn[^;]*classList\.toggle\("primary"/);
    expect(src).toMatch(/btn\(st\("projector", this\.lang\), "pr-projb"/);
    expect(src).toMatch(/projBtn\.classList\.remove\("primary"\)/);
  });
  it("keeps the demonstration's launchers outlined", () => {
    expect(src).toMatch(/primary: \(\) => false/);
  });
  it("shows the open projector as a chip, in both languages", () => {
    expect(src).toContain('projectorOn: ["Projector open", "Projection ouverte"]');
    expect(src).toMatch(/classList\.toggle\("pr-projchip", open\)/);
    expect(css).toMatch(/\.pr-projchip/);
  });
  it("brings an open projector to the front instead of reloading it", () => {
    const body = src.slice(src.indexOf("private openProjector()"));
    expect(body.indexOf("this.projector.focus()")).toBeGreaterThan(-1);
    expect(body.indexOf("this.projector.focus()")).toBeLessThan(body.indexOf("window.open("));
  });
  it("keeps « Suivant » filled while the projector is closed", () => {
    expect(css).toMatch(/:not\(\.proj-on\) \.cp-foot \.cp-btn\.primary\s*\{[^}]*background: var\(--gl-accent/);
  });
});

// Audit item 41 (Lane B part): one glossary. The deck is counted in « diapos », the review is « Vérifications »,
// the questions tab is « Questions », programme labels read « LAPL · PPL », « Vol de nuit », « IR », « ATPL ».
describe("glossary in the studio, the presenter and the AI dialog", () => {
  const read = (f: string) => readFileSync(f, "utf8");
  const files = [
    "src/course/ui/editor.ts",
    "src/course/ui/presenter.ts",
    "src/course/ui/templates.ts",
    "src/course/ui/newCourse.ts",
    "src/course/ui/studio.ts",
    "src/course/canvas/strings.ts",
    "src/course/canvas/factory.ts",
  ];
  it("says « diapo », never « diapositive », « Relecture » or « Interactif »", () => {
    for (const f of files) {
      const s = read(f);
      expect(s, f).not.toMatch(/"[^"\n]*iapositive[^"\n]*"/);
      expect(s, f).not.toMatch(/"Relecture"/);
      expect(s, f).not.toMatch(/"Interactif"/);
    }
  });
  it("counts the deck in diapos in the editor and the presenter", () => {
    expect(read("src/course/ui/editor.ts")).toContain('(n > 1 ? "diapos" : "diapo")');
    expect(src).toContain('step: ["Slide {n} of {t}", "Diapo {n} sur {t}"]');
  });
  it("names the programmes as the library does", () => {
    const d = read("src/course/ai/dialog.ts");
    expect(d).toContain('fr: "LAPL · PPL"');
    expect(d).toContain('fr: "Vol de nuit"');
  });
});
