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
    expect(nc).toMatch(/kitBox\.hidden = !field/);
    expect(nc).toMatch(/"ICAO code of your airfield", "Code OACI de votre terrain"/);
  });
  it("cards share one width at 300 px and more, 16:9 covers, the blank slide drawn as a sheet", () => {
    expect(css).toMatch(/grid-template-columns: repeat\(auto-fill, minmax\(300px, 1fr\)\);/);
    expect(css).toMatch(/\.nc-cover \{[^}]*aspect-ratio: 16 \/ 9;/);
    expect(css).toMatch(/\.nc-card\.is-blank \.nc-cover > \* \{/);
    expect(css).not.toMatch(/is-feature|nc-radios|nc-sum|nc-afk|nc-ai-row/);
  });
  it("one rule per thing: no !important, no grid declared twice", () => {
    expect(css).not.toMatch(/!important/);
    expect(css.match(/^\.nc-grid \{/gm)).toHaveLength(1);
    expect(css.match(/^\.nc-card \{/gm)).toHaveLength(1);
  });
});
