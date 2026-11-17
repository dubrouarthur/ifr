// « Ajouter » makes a slide that only stays once a choice is made (audit item 48); an empty slide shows hints on the
// slide itself rather than opening a rail (item 49).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { addedWhere, slideIsBare } from "../src/course/ui/newSlide";
import { CourseHistory } from "../src/course/ui/templates";
import type { Course } from "../src/course/types";

const course = (n: number) => ({ id: "c", steps: Array.from({ length: n }, (_, i) => ({ id: `s${i}` })) }) as unknown as Course;

describe("where the new slide went (item 48)", () => {
  it("says it in both languages", () => {
    expect(addedWhere("fr", 3, 8)).toBe("Ajoutée après la diapo 3");
    expect(addedWhere("en", 3, 8)).toBe("Added after slide 3");
    expect(addedWhere("fr", 7, 8)).toBe("Ajoutée à la fin, diapo 8");
    expect(addedWhere("en", 7, 8)).toBe("Added at the end, slide 8");
    expect(addedWhere("fr", 0, 1)).toBe("Ajoutée en première diapo");
  });
  it("a slide is bare with no block and no background picture", () => {
    expect(slideIsBare({ blocks: [] } as never)).toBe(true);
    expect(slideIsBare({ blocks: [], background: { image: "a" } } as never)).toBe(false);
    expect(slideIsBare({ blocks: [{ id: "b" }] } as never)).toBe(false);
    expect(slideIsBare(undefined)).toBe(false);
  });
});

describe("CourseHistory.discard: a slide left without a choice leaves nothing to undo", () => {
  it("takes the newest push back, with no redo", () => {
    const h = CourseHistory.of(course(2));
    h.push(course(3));
    const mark = h.depth;
    expect(h.discard(mark)?.steps.length).toBe(2);
    expect(h.canRedo).toBe(false);
    expect(h.canUndo).toBe(false);
    expect(h.current.steps.length).toBe(2);
  });
  it("refuses once something else was pushed since the mark", () => {
    const h = CourseHistory.of(course(2));
    h.push(course(3));
    const mark = h.depth;
    h.push(course(4));
    expect(h.discard(mark)).toBeNull();
    expect(h.current.steps.length).toBe(4);
  });
});

describe("the editor wires it (items 48, 49)", () => {
  const ed = readFileSync("src/course/ui/editor.ts", "utf8");
  it("the strip's + tile and the panel make a pending slide; Échap and « Annuler » take it away", () => {
    expect(ed).toMatch(/this\.newSlide\(\{ end: true \}\)/);
    expect(ed).toMatch(/newSlide: \(\) => ed\.newSlide\(\)/);
    expect(ed).toMatch(/e\.key === "Escape" &&\s+this\.pendingNew/);
    expect(ed).toMatch(/cancel: this\.pendingNew/);
  });
  it("« Partir d'une diapo vide » opens no rail by itself", () => {
    const blank = ed.match(/blank: \(\) => \{[\s\S]*?\n {8}\},/)?.[0] ?? "";
    expect(blank).toBeTruthy();
    expect(blank).not.toMatch(/openPanel/);
    expect(ed).toMatch(/Cliquez pour ajouter un titre/);
    expect(ed).toMatch(/Click to add a title/);
  });
});
