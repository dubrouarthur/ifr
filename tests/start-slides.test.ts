// The ready slides an empty slide offers (« Que voulez-vous montrer ? ») and the gallery's, added as the editor adds
// them (the slide, its linear text as the reader, the situations it shows): each one validates with no error, the
// card's lists only name slides that exist, and a VFR course is not offered an ILS first.
import { describe, expect, it } from "vitest";
import {
  showcaseScenes,
  startSlides,
} from "../src/course/samples/showcaseDecks";
import { galleryCourse } from "../src/course/samples/exampleSlides";
import { linearText } from "../src/course/ui/templates";
import { EMPTY_STARTS, EMPTY_STARTS_VFR } from "../src/course/ui/studio";
import { validateCourse } from "../src/course/validate";
import type { Course, Step } from "../src/course/types";

describe("ready slides added to a course", () => {
  const all = startSlides();
  it("validate with no error, « À vous » rows included", () => {
    const base = galleryCourse();
    const steps: Step[] = all.map((g) => ({
      id: g.id,
      kind: "slide",
      title: g.title,
      layout: "canvas",
      slide: g.slide,
      reader: linearText(g.slide),
    }));
    // the « À vous » slides carry « À faire » rows (the case that used to fail)
    expect(steps.some((s) => s.reader?.some((b) => b.t === "doThis"))).toBe(true);
    const c: Course = {
      ...base,
      steps,
      scenes: { ...base.scenes, ...showcaseScenes() },
    };
    const errs = validateCourse(c).filter((i) => i.level === "error");
    expect(errs.map((e) => `${e.path}: ${e.message.en}`)).toEqual([]);
  });
  it("the first-run card names slides that exist", () => {
    for (const id of [...EMPTY_STARTS, ...EMPTY_STARTS_VFR])
      expect(
        all.some((g) => g.id === id),
        id,
      ).toBe(true);
  });
  it("a VFR course is offered no ILS, no OBS and no wind triangle first", () => {
    for (const id of EMPTY_STARTS_VFR)
      expect(["sx-demo", "gx-set-obs", "sx-wind"]).not.toContain(id);
  });
});
