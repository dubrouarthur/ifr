// Ground school — the crafted lesson briefings (samples/briefings): each one is a 'briefing' course for a real
// curriculum lesson, found by briefingForLesson(), that opens on a cover, ends its slides on "Ready to fly",
// keeps 6–10 slides, validates, is bilingual and ends with a Fly it on its lesson.
import { describe, expect, it } from "vitest";
import { CRAFTED_BRIEFINGS } from "../src/course/samples/briefings";
import { briefingForLesson, isSampleId, sampleCourse } from "../src/course/samples";
import { validateCourse, missingTranslations } from "../src/course/validate";
import { EXERCISES } from "../src/train/curriculum";
import { HOLD_NDB_NUMBERS } from "../src/course/samples/briefings/holdNdb";
import { defaultAloft } from "../src/sim/wind";
import { holdEntry } from "../src/nav/holding";
import { solveHoldWind } from "../src/course/stage/diagramMath";

describe.each(CRAFTED_BRIEFINGS.map((b) => [b.exerciseId, b]))("briefing for %s", (exerciseId, def) => {
  const c = sampleCourse(def.id)!;
  it("is a registered sample briefing for a real lesson", () => {
    expect(isSampleId(def.id)).toBe(true);
    expect(EXERCISES.some((e) => e.id === exerciseId)).toBe(true);
    expect(c.shape).toBe("briefing");
    expect(c.briefingFor).toEqual({ exerciseId });
    expect(c.theme).toBe("classroom");
    expect(briefingForLesson(exerciseId)?.id).toBe(def.id);
  });
  it("has 6 to 10 slides, from the cover to Ready to fly, then Fly it", () => {
    const slides = c.steps.filter((s) => !!s.slide);
    expect(slides.length).toBeGreaterThanOrEqual(6);
    expect(slides.length).toBeLessThanOrEqual(10);
    expect(slides[0].slide!.layout).toBe("cover");
    expect(slides.at(-1)!.slide!.layout).toBe("ready");
    expect(c.steps.at(-1)!.flyIt!.target).toEqual({ kind: "lesson", exerciseId });
  });
  it("validates, in both languages", () => {
    expect(validateCourse(c).filter((i) => i.level === "error").map((i) => `${i.code} ${i.path}`)).toEqual([]);
    expect(missingTranslations(c).count ?? missingTranslations(c)).toBeFalsy();
  });
});

// hold-ndb: the numbers on its slides are the ones that work in the lesson's wind (the sim's wind at 3,000 ft)
describe("the hold-ndb briefing's numbers", () => {
  const N = HOLD_NDB_NUMBERS;
  it("uses the sim's wind at 3,000 ft and the right headings", () => {
    expect(N.wind).toEqual(defaultAloft({ windDir: 220, windKt: 15, gustKt: 0, turbulence: 0 })[0]);
    expect(holdEntry(270, "R", 45)).toBe("TEARDROP");
    expect(N.teardrop).toBe(60);
    const s = solveHoldWind(270, N.wind.dir, N.wind.kt, 94);
    expect(Math.abs(N.inHdg - s.inboundHdg)).toBeLessThanOrEqual(1);
    expect(Math.abs(N.outHdg - s.outboundHdg)).toBeLessThanOrEqual(2);
  });
  it("its outbound time gives a 1:00 inbound leg once the turns drift too (a point-mass lap)", () => {
    const D = Math.PI / 180;
    const to = (N.wind.dir + 180) * D;
    const we = Math.sin(to) * N.wind.kt;
    const lap = (outS: number) => {
      let x = 0; // NM east of PA (the inbound course is the x axis)
      let h = N.inHdg;
      const dt = 0.1;
      const fly = () => (x += ((94 * Math.sin(h * D) + we) * dt) / 3600);
      const turn = (target: number) => {
        while (((target - h + 360) % 360) > 0.15) {
          h = (h + Math.min(3 * dt, (target - h + 360) % 360)) % 360;
          fly();
        }
      };
      turn(N.outHdg); // over PA, right turn outbound
      while (x < 0) fly(); // the clock starts abeam or wings level, whichever is later
      for (let t = 0; t < outS; t += dt) fly();
      turn(N.inHdg); // right turn inbound
      let inS = 0;
      while (x > 0) {
        fly();
        inS += dt;
      }
      return inS;
    };
    expect(Math.abs(lap(N.outS) - 60)).toBeLessThan(15);
    // and the 1:00 outbound the slides warn about would give a long inbound leg (about 2:00)
    expect(lap(60)).toBeGreaterThan(100);
  });
});
