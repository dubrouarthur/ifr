// The presenter: notes stay in sight while the demonstration is driven, one « Pause » (audit item 52); the
// resume note is in the top bar, every strip step is a picture with its kind (item 53).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pr = readFileSync("src/course/ui/presenter.ts", "utf8");
const dm = readFileSync("src/course/ui/demoPilot.ts", "utf8");
const css = readFileSync("src/styles/presenter.css", "utf8");

describe("driving the demonstration (item 52)", () => {
  it("puts the notes right under its controls, foldable", () => {
    expect(pr).toMatch(/driving\s*\?\s*\[this\.demo\.el, notesCard, nextCard\]/);
    expect(pr).toMatch(/"details",\s*\{ class: "pr-card pr-notes pr-notes-fold" \}/);
    expect(css).toMatch(/\.pr-side\.pr-driving > \.pr-notes \{[^}]*max-height/);
  });
  it("has one pause toggle that shows it is paused, no separate « Figer »", () => {
    expect(dm).not.toMatch(/"Figer"/);
    expect(dm).not.toMatch(/Reprendre l’animation/);
    expect(dm).toMatch(/paused: \["Paused · resume", "En pause · reprendre"\]/);
    expect(dm).toMatch(/private togglePause\(\)/);
    expect(css).toMatch(/\.pr-app\.pr-demo-on \.sl-motion-btn \{\s*display: none;/);
  });
});

describe("resume and strip (item 53)", () => {
  it("says « Reprise à la diapo n · Recommencer » in the top bar and hides the toast over the slide", () => {
    expect(pr).toMatch(/resumed: \["Resumed at slide \{n\}", "Reprise à la diapo \{n\}"\]/);
    expect(pr).toMatch(/toast\.hidden = true;\s+this\.resumedAt = n - 1;/);
    expect(pr).toMatch(/h\("span", \{ class: "pr-sub" \}, this\.stepEl, " · ", this\.clock, resumed\)/);
  });
  it("draws every step as a picture (a non-slide step as the slide it would make) with a kind badge", () => {
    expect(pr).toMatch(/shown = toDesignedSlide\(s, c\)\.slide/);
    expect(pr).toMatch(/k\.classList\.add\("pr-st-k"\)/);
    expect(css).toMatch(/\.pr-stripwrap\.fade-r \{/);
  });
});
