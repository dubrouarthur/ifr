// A rule block left open swallows every later rule into its @media (the « Vos captures » and « Voler et capturer »
// styles only applied on phones): the studio's stylesheets must close every block they open.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const FILES = [
  "src/styles/course-studio.css",
  "src/styles/course-editor.css",
  "src/styles/course-canvas.css",
  "src/styles/newcourse.css",
  "src/styles/course-ai.css",
];
describe("studio stylesheets", () => {
  for (const f of FILES)
    it(`${f} closes every block it opens`, () => {
      const css = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
      let depth = 0;
      for (const ch of css) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
        expect(depth).toBeGreaterThanOrEqual(0);
      }
      expect(depth).toBe(0);
    });
});
