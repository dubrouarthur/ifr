// English copy uses “…”, never the French « … » (audit item 63, Lane B files).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES = [
  "src/course/ui/tray.ts",
  "src/course/ui/newCourse.ts",
  "src/course/ui/demoPilot.ts",
  "src/course/ui/presenter.ts",
  "src/course/ui/editor.ts",
  "src/course/ui/studio.ts",
  "src/course/ai/mapper.ts",
  "src/course/ai/dialog.ts",
];
const lit = /"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
// a string with French words or accents outside its quotes is French copy (it keeps « … »)
const EN = /\b(the|your|you|is|to|of|and|with|this|a|an|it|on|in|for|from|no|not|be|can|are|open|add|slide|student|back|create|start|nothing|saved|before)\b/i;
const FR = /[éèêàùçôîûÉÀ’]|\b(le|la|les|des|une|un|vous|votre|est|pour|dans|sur|du|de|et|à|au|aux|ce|cette|pas|ou|en|diapo|élève|modèle)\b/i;

describe("English strings never use « »", () => {
  it("in the new course page, the presenter, the demonstration, the tray and the AI dialog", () => {
    const bad: string[] = [];
    for (const f of FILES) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((l, i) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
          for (const m of l.matchAll(lit)) {
            const s = m[1] ?? m[2] ?? "";
            const out = s.replace(/«[^»]*»/g, "");
            if (s.includes("«") && EN.test(out) && !FR.test(out)) bad.push(`${f}:${i + 1}: ${s}`);
          }
        });
    }
    expect(bad).toEqual([]);
  });
});
