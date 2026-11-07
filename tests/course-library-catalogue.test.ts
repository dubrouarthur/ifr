// Ground school — the course library's plan and registries (samples/library). The plan names 25 courses, five per
// author; every registered course must be planned, sit in its planned author's registry and program, live in its
// planned file, and follow the library house rules that a test can check: light theme, 12–20 steps, a cover first,
// bilingual, tagged with its program, a student action at least every 3 steps. Validation, French coverage, stable
// ids, generator ids and the readability guard run for every sample (course-samples, slide-readability tests),
// library courses included, because the library is part of SAMPLES.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SAMPLES } from "../src/course/samples";
import { isStudentAction } from "../src/course/samples/kit";
import {
  LIBRARY_COURSES,
  LIBRARY_ID,
  LIBRARY_PLAN,
  LIBRARY_PROGRAMS,
  LIBRARY_REGISTRIES,
  plannedCourse,
  type LibraryAuthor,
} from "../src/course/samples/library";

const AUTHORS: LibraryAuthor[] = ["A1", "A2", "A3", "A4", "A5"];

describe("library plan", () => {
  it("plans 25 courses, five per author, with unique well-formed ids", () => {
    expect(LIBRARY_PLAN.length).toBe(25);
    const ids = LIBRARY_PLAN.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of LIBRARY_PLAN) {
      expect(p.id, p.id).toMatch(LIBRARY_ID);
      expect(p.id).toBe(`sample-lib-${p.slug}`);
      expect(p.title.en.length && p.title.fr?.length, p.id).toBeTruthy();
    }
    for (const a of AUTHORS)
      expect(LIBRARY_PLAN.filter((p) => p.author === a).length, a).toBe(5);
  });

  it("uses every program, and only known programs", () => {
    const known = new Set(LIBRARY_PROGRAMS.map((p) => p.id));
    for (const p of LIBRARY_PLAN) expect(known.has(p.program), p.id).toBe(true);
    for (const p of LIBRARY_PROGRAMS)
      expect(
        LIBRARY_PLAN.some((x) => x.program === p.id),
        p.id,
      ).toBe(true);
  });
});

describe("library registries", () => {
  it("every registered course is planned, in its author's registry, program and file", () => {
    for (const a of AUTHORS)
      for (const d of LIBRARY_REGISTRIES[a]) {
        const plan = plannedCourse(d.id);
        expect(plan, `${d.id} is not in library/catalogue.ts`).toBeTruthy();
        expect(plan!.author, d.id).toBe(a);
        expect(d.program, d.id).toBe(plan!.program);
        expect(
          existsSync(
            resolve(
              __dirname,
              `../src/course/samples/library/${plan!.slug}.ts`,
            ),
          ),
          `${d.id}: library/${plan!.slug}.ts`,
        ).toBe(true);
      }
  });

  it("lists each library course once in SAMPLES, with its program, and no id clash", () => {
    const ids = SAMPLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of LIBRARY_COURSES) {
      const s = SAMPLES.find((x) => x.id === d.id);
      expect(s?.program, d.id).toBe(d.program);
    }
  });
});

// one block per registered course (a plain loop: the registries start empty while the authors write)
for (const d of LIBRARY_COURSES) {
  const id = d.id;
  describe(`${id} (house rules)`, () => {
    const c = d.build();
    it("builds the course it registers", () => {
      expect(c.id).toBe(id);
      expect(c.sample).toBe(id);
      expect(d.blurb.en.length && d.blurb.fr?.length).toBeTruthy();
    });
    it("is light, bilingual, tagged with its program", () => {
      expect(c.theme).toBe("classroom");
      expect(c.langs).toEqual(expect.arrayContaining(["en", "fr"]));
      expect(c.tags ?? []).toContain(d.program);
    });
    it("has 12 to 20 steps and opens on a cover slide", () => {
      expect(c.steps.length).toBeGreaterThanOrEqual(12);
      expect(c.steps.length).toBeLessThanOrEqual(20);
      expect(c.steps[0].slide?.layout).toBe("cover");
    });
    it("keeps the student acting at least every 3 steps", () => {
      let run = 0;
      for (const s of c.steps) {
        run = isStudentAction(s) ? 0 : run + 1;
        expect(run, `before ${s.id}`).toBeLessThan(3);
      }
    });
  });
}
