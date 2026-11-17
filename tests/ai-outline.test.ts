// Audit item 42: the AI dialog says what it needs before the click, guides the key in three steps, and its outline
// names the animation the deck shares once (not on every row), with a legend for the blue edge.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { commonAnimation } from "../src/course/ai/dialog";

describe("commonAnimation", () => {
  it("names the animation at least two slides share, the most common", () => {
    expect(
      commonAnimation([
        { animation: "stall" },
        { animation: "stall" },
        { animation: "turn" },
        {},
      ]),
    ).toBe("stall");
  });
  it("says nothing when no animation is shared", () => {
    expect(commonAnimation([{ animation: "a" }, { animation: "b" }, {}])).toBeUndefined();
    expect(commonAnimation([])).toBeUndefined();
  });
});

describe("the AI dialog's words", () => {
  const dlg = readFileSync("src/course/ai/dialog.ts", "utf8");
  const nc = readFileSync("src/course/ui/newCourse.ts", "utf8");
  it("says the key is paid and how long it takes, under the button, in both languages", () => {
    expect(nc).toContain("Avec votre clé d’assistant IA (payante) · environ 1 minute");
    expect(nc).toContain("With your AI assistant key (paid) · about 1 minute");
    // no third-party brand name in the UI (owner rule); the key step names the provider once, to get a key
    expect(nc).not.toMatch(/Claude|Anthropic/);
  });
  it("guides the key in three numbered steps with « Ouvrir la Console »", () => {
    expect(dlg).toMatch(/class: "ai-steps"/);
    expect(dlg).toContain('T(lang, "Open the Console", "Ouvrir la Console")');
  });
  it("explains the blue edge", () => {
    expect(dlg).toContain("Bord bleu : l’élève agit sur cette diapo");
  });
});
