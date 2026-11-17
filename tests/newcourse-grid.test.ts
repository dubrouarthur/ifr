// « Nouveau cours »: one gallery of starting points, the blank slide first, « Votre terrain » one card among the
// templates; the other ways to start (the assistant, a PDF) come after it, quieter (audit item 62, owner 2026-11-17).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const nc = readFileSync("src/course/ui/newCourse.ts", "utf8");
const css = readFileSync("src/styles/newcourse.css", "utf8");

describe("new course starting points", () => {
  it("the gallery is one radio group named by its heading, and holds radios only", () => {
    expect(nc).toMatch(/class: "nc-grid",\s+role: "radiogroup",\s+"aria-labelledby": "nc-start-h"/);
    expect(nc).toMatch(/role: "radio",\s+tabindex: "-1",\s+"aria-checked": "false"/);
    // the assistant is a button under the gallery, not a card inside it
    expect(nc).not.toMatch(/nc-card-ai|ai\.className|ai\.replaceChildren/);
    expect(nc).toMatch(/"Other ways to start", "Autres façons de commencer"/);
  });
  it("« Votre terrain » is a card: its code is asked in the bar, never in a panel over the gallery", () => {
    expect(nc).not.toMatch(/airfieldKitPanel/);
    expect(nc).toMatch(/kitBox\.hidden = !asksCode/);
    expect(nc).toMatch(/"ICAO code of your airfield", "Code OACI de votre terrain"/);
  });
  it("cards share one width at 300 px and more, 16:9 covers, the blank slide drawn as a sheet", () => {
    expect(css).toMatch(/grid-template-columns: repeat\(auto-fill, minmax\(300px, 1fr\)\);/);
    expect(css).toMatch(/\.nc-cover \{[^}]*aspect-ratio: 16 \/ 9;/);
    expect(css).toMatch(/\.nc-card\.is-blank \.nc-cover > \* \{/);
    expect(css).not.toMatch(/is-feature|nc-radios|nc-sum|nc-afk|nc-ai-row/);
  });
  it("each radio is named by its title, described by the rest; Home and End reach the ends", () => {
    expect(nc).toMatch(/"aria-labelledby": `\$\{key\}-t`,/);
    expect(nc).toMatch(/"aria-describedby": `\$\{info\.badge \? `\$\{key\}-b ` : ""\}\$\{key\}-p \$\{key\}-m`,/);
    expect(nc).toMatch(/k === "Home" \|\| k === "End"/);
  });
  it("the bar keeps Annuler and Créer le cours together on the right; a save error does not blame the code", () => {
    expect(nc).toMatch(/h\("div", \{ class: "nc-acts" \}, cancel, go\)/);
    expect(css).toMatch(/\.nc-acts \{[^}]*flex: none;[^}]*margin-left: auto;/);
    expect(css).toMatch(/\.nc-kit \{[^}]*flex: 1 1 0;[^}]*min-width: 0;/);
    expect(nc).toMatch(/kitIn\?\.toggleAttribute\("aria-invalid", bad === "code"\)/);
    expect(nc).toMatch(/say\(msg, "save"\)/);
  });
  it("the example field's navigation data is read only once its card comes near the screen", () => {
    expect(nc).toMatch(/new IntersectionObserver\(/);
    expect(nc).toMatch(/T\(lang, "Example", "Exemple"\), ` · \$\{EXAMPLE_ICAO\}`/);
  });
  it("one rule per thing: no !important, no grid declared twice", () => {
    expect(css).not.toMatch(/!important/);
    expect(css.match(/^\.nc-grid \{/gm)).toHaveLength(1);
    expect(css.match(/^\.nc-card \{/gm)).toHaveLength(1);
  });
});
