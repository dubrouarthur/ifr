// Ground school — the crafted lesson briefings (samples/briefings): each one is a 'briefing' course for a real
// curriculum lesson, found by briefingForLesson(), that opens on a cover, ends its slides on "Ready to fly",
// keeps 6–10 slides, validates, is bilingual and ends with a Fly it on its lesson.
import { describe, expect, it } from "vitest";
import { CRAFTED_BRIEFINGS } from "../src/course/samples/briefings";
import { briefingForLesson, isSampleId, sampleCourse } from "../src/course/samples";
import { validateCourse, missingTranslations } from "../src/course/validate";
import { EXERCISES } from "../src/train/curriculum";

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
