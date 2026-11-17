// Never a third-party brand in the product's words: the creator's screens, the starting slides and the panel
// choice say « écrans de vol » / « glass panel », « avion-école ». Comments may cite sources (POH, handbooks).
// Files still to sweep (intro, procedure library, older briefings) are listed in anim/RESULT.md.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const FILES = [
  "src/course/samples/showcaseDecks.ts",
  "src/course/canvas/factory.ts",
  "src/ui/home.ts",
  "src/ui/viewDock.ts",
  "src/ui/settings.ts",
  "src/ui/scenarioText.ts",
  "src/ui/courseFlight.ts",
  "src/course/ui/simTip.ts",
  "src/course/airfieldKit.ts",
  "src/course/ui/airfieldKitPanel.ts",
  "src/library/programs.ts",
  "src/course/canvas/toolBlock.ts",
  "src/course/samples/toolSlides.ts",
  "src/course/tools/kit.ts",
  "src/course/tools/defs/wing.ts",
  "src/course/tools/defs/turn.ts",
  "src/course/tools/defs/massBalance.ts",
  "src/course/tools/defs/runway.ts",
  "src/course/tools/defs/fuel.ts",
  "src/course/tools/defs/carbIce.ts",
  "src/course/tools/defs/fronts.ts",
  "src/course/tools/defs/radioNav.ts",
  "src/course/tools/defs/prop.ts",
  "src/course/tools/defs/mach.ts",
  "src/course/tools/defs/cabin.ts",
  "src/course/ui/studio.ts",
  "src/course/engines/sim.ts",
  "src/course/engines/view.ts",
  "src/course/engines/piston3d.ts",
  "src/course/engines/prop3d.ts",
  "src/course/engines/turbine3d.ts",
  "src/course/samples/exampleSlides.ts",
];
const BRAND = /G1000|Garmin|Cessna|Jeppesen/;
/** the string literals of a source file, comments dropped */
function literals(src: string): string[] {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  return [...noComments.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? "",
  );
}
describe("no third-party brand in the product's words", () => {
  for (const f of FILES)
    it(f, () => {
      const bad = literals(readFileSync(f, "utf8")).filter((s) => BRAND.test(s));
      expect(bad).toEqual([]);
    });
});
