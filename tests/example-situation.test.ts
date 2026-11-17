// The Simulateur panel says « Situation d'exemple » while a slide still flies the template's pose (audit item 47),
// and the goal rows of a check-list read as checkboxes « Vérifié automatiquement » (audit item 46).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DECK_STARTERS } from "../src/course/ui/deckStarters";
import { buildNewCourse } from "../src/course/ui/newCourse";
import { isExampleSituation } from "../src/course/ui/exampleSituation";
import { usedSceneIds } from "../src/course/pack";
import { tx } from "../src/course/canvas/strings";

const make = (i: number) =>
  buildNewCourse({
    id: "c",
    lang: "fr",
    title: "Le tour de piste à Lognes",
    program: null,
    subject: null,
    starter: DECK_STARTERS[i],
  });

describe("example situations (item 47)", () => {
  it("every scene a template course starts with is an example", () => {
    for (const [i, d] of DECK_STARTERS.entries()) {
      const c = make(i);
      for (const id of usedSceneIds(c)) expect(isExampleSituation(c, id), `${d.id} ${id}`).toBe(true);
    }
  });
  it("a slide with no scene of its own shows the demo pose: an example", () => {
    expect(isExampleSituation({ scenes: {} }, undefined)).toBe(true);
    expect(isExampleSituation({ scenes: {} }, "gone")).toBe(true);
  });
  it("a scene the author changed, or captured, is theirs", () => {
    const c = make(0);
    const id = [...usedSceneIds(c)][0];
    expect(id).toBeTruthy();
    const sc = structuredClone(c.scenes[id]);
    sc.label = "Lognes 26 · vent arrière";
    expect(isExampleSituation({ scenes: { ...c.scenes, [id]: sc } }, id)).toBe(false);
    expect(isExampleSituation({ scenes: { cap: sc } }, "cap")).toBe(false);
  });
});

describe("check rows read as checkboxes (item 46)", () => {
  it("the head says « Vérifié automatiquement » in both languages", () => {
    expect(tx("checkedBySim", "fr")).toBe("Vérifié automatiquement");
    expect(tx("checkedBySim", "en")).toBe("Checked automatically");
  });
  it("the tick is a square box, and the current row has no radio dot", () => {
    const css = readFileSync("src/styles/course-canvas.css", "utf8");
    const tick = css.match(/\.sl-tick \{[^}]*\}/)?.[0] ?? "";
    expect(tick).not.toMatch(/border-radius:\s*50%/);
    expect(css).not.toMatch(/\.sl-row\.current \.sl-tick::after/);
  });
});
