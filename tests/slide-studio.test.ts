// Ground school builder — the studio's editing operations (pure): smart guides (equal spacing, the 12-column
// grid), resize snapping, group-aware align / distribute, same size, centre on the slide, the touch
// multi-select mode, duplicate (⌘D) and nudge through the controller, and the starter decks.
import { describe, expect, it } from "vitest";
import type { Course, SlideBlock, SlideCanvas } from "../src/course/types";
import {
  colEnd,
  colX,
  gapSnap,
  snapMove,
  snapResize,
  SLIDE_H,
  SLIDE_W,
} from "../src/course/canvas/geom";
import {
  alignBlocks,
  centerOnSlide,
  distributeBlocks,
  groupBlocks,
  matchSize,
} from "../src/course/canvas/ops";
import { EditorCore, keyCommand } from "../src/course/canvas/editorCore";
import { emptyCanvas } from "../src/course/canvas/factory";
import {
  BLANK_STARTER,
  DECK_STARTERS,
  addStarterDeck,
  starterById,
} from "../src/course/ui/deckStarters";
import { validateCourse } from "../src/course/validate";

const box = (
  id: string,
  x: number,
  y: number,
  w = 100,
  h = 100,
  extra: Partial<SlideBlock["frame"]> = {},
): SlideBlock => ({
  id,
  frame: { x, y, w, h, z: 1, ...extra },
  kind: "shape",
  shape: "rect",
  fill: "surface",
});
const canvasOf = (...blocks: SlideBlock[]): SlideCanvas => ({
  ...emptyCanvas(),
  blocks,
});
const frame = (c: SlideCanvas, id: string) =>
  c.blocks.find((b) => b.id === id)!.frame;

describe("smart guides", () => {
  it("centres a box between its two neighbours and reports the equal gaps", () => {
    // A at 200..400, B at 1000..1200, moving box 200 wide: centred at 600..800 (gaps of 200)
    const others = [
      { x: 200, y: 400, w: 200, h: 100 },
      { x: 1000, y: 400, w: 200, h: 100 },
    ];
    const g = gapSnap({ x: 604, y: 420, w: 200, h: 80 }, others, "x", 10);
    expect(g?.d).toBe(-4);
    expect(g?.guide.kind).toBe("gap");
    expect(g?.guide.gap).toBe(200);
    expect(g?.guide.segs).toEqual([
      [400, 600],
      [800, 1000],
    ]);
    const s = snapMove({ x: 604, y: 1000 - 580, w: 200, h: 80 }, others, {
      threshold: 10,
    });
    expect(s.dx).toBe(-4);
    expect(s.guides.find((x) => x.axis === "x")?.kind).toBe("gap");
  });
  it("repeats a gap that already separates two blocks of the row", () => {
    // A 100..300, B 400..600 (gap 100); the moving box after B snaps 100 further on
    const others = [
      { x: 100, y: 0, w: 200, h: 100 },
      { x: 400, y: 0, w: 200, h: 100 },
    ];
    const g = gapSnap({ x: 706, y: 10, w: 150, h: 80 }, others, "x", 10);
    expect(g?.d).toBe(-6);
    expect(g?.guide.gap).toBe(100);
    // the same works down a column
    const v = gapSnap(
      { x: 10, y: 707, w: 80, h: 150 },
      [
        { x: 0, y: 100, w: 100, h: 200 },
        { x: 0, y: 400, w: 100, h: 200 },
      ],
      "y",
      10,
    );
    expect(v?.d).toBe(-7);
  });
  it("prefers an exact edge alignment over a farther gap, and ignores boxes off the row", () => {
    const others = [
      { x: 200, y: 400, w: 200, h: 100 },
      { x: 1000, y: 400, w: 200, h: 100 },
      { x: 609, y: 800, w: 50, h: 50 }, // an edge at 609 (1 away) beats the gap (4 away)
    ];
    const s = snapMove({ x: 604 + 4, y: 420, w: 200, h: 80 }, others, {
      threshold: 10,
    });
    expect(s.dx).toBe(1);
    expect(s.guides.find((x) => x.axis === "x")?.kind).toBe("edge");
    // a box that shares no row with the moving one gives no gap
    expect(
      gapSnap({ x: 600, y: 900, w: 100, h: 50 }, others.slice(0, 2), "x", 10),
    ).toBeNull();
  });
  it("falls back to the 12-column grid of the design system", () => {
    expect(colX(0)).toBe(120);
    expect(colX(6)).toBe(984);
    expect(colEnd(11)).toBe(1800);
    // nothing else near: the left edge snaps to column 4 (x 696)
    const s = snapMove({ x: 700, y: 610, w: 333, h: 77 }, [], {
      threshold: 10,
    });
    expect(s.dx).toBe(-4);
    expect(s.guides[0]).toMatchObject({ axis: "x", at: 696, kind: "column" });
    // columns off: the grid only
    const g = snapMove({ x: 700, y: 610, w: 333, h: 77 }, [], {
      threshold: 10,
      columns: false,
      grid: 8,
    });
    expect(g.dx).toBe(4); // 700 → 704 on the 8 grid
    expect(g.guides.filter((x) => x.kind === "column")).toEqual([]);
  });
  it("keeps the slide's safe margins (120 across, 96 down) as guides", () => {
    const s = snapMove({ x: 126, y: 100, w: 50, h: 50 }, [], { threshold: 10 });
    expect(s.dx).toBe(-6);
    expect(s.dy).toBe(-4);
    expect(s.guides.map((g) => g.kind)).toEqual(["slide", "slide"]);
    expect(s.guides[0].to).toBe(SLIDE_H);
  });
});

describe("resize snapping", () => {
  it("moves the dragged edges onto other blocks' edges, the opposite edges stay", () => {
    const other = { x: 800, y: 200, w: 300, h: 300 };
    const r = snapResize({ x: 200, y: 200, w: 594, h: 296 }, "se", [other], {
      threshold: 10,
    });
    expect(r.box).toEqual({ x: 200, y: 200, w: 600, h: 300 });
    expect(r.guides.map((g) => g.axis).sort()).toEqual(["x", "y"]);
    // the west handle: the left edge moves, the right one stays
    const w = snapResize({ x: 795, y: 600, w: 400, h: 100 }, "w", [other], {
      threshold: 10,
    });
    expect(w.box.x).toBe(800);
    expect(w.box.x + w.box.w).toBe(1195);
    // an edge handle snaps one axis only
    const n = snapResize({ x: 500, y: 503, w: 100, h: 100 }, "n", [other], {
      threshold: 10,
    });
    expect(n.box.y).toBe(500);
    expect(n.guides).toHaveLength(1);
  });
  it("the controller snaps a resize to another block and draws the guide", () => {
    const ed = new EditorCore(
      canvasOf(box("a", 200, 200, 400, 200), box("b", 800, 200, 300, 300)),
    );
    ed.select(["a"]);
    ed.beginResize("e", [600, 300]);
    ed.pointerMove([795, 300]);
    expect(frame(ed.canvas, "a").w).toBe(600); // right edge on b's left edge (800)
    expect(ed.guides.some((g) => g.axis === "x" && g.at === 800)).toBe(true);
    ed.pointerUp();
    expect(ed.guides).toEqual([]);
    // Alt: no snapping
    ed.beginResize("e", [800, 300]);
    ed.pointerMove([797, 300], { alt: true });
    expect(frame(ed.canvas, "a").w).toBe(597);
    ed.pointerUp();
  });
});

describe("align, distribute, same size", () => {
  it("aligns a group as one piece and a single group to the slide", () => {
    let c = canvasOf(
      box("a", 300, 100),
      box("b", 500, 300),
      box("c", 900, 700, 50, 50),
    );
    c = groupBlocks(c, ["a", "b"]).canvas;
    const left = alignBlocks(c, ["a", "b", "c"], "left");
    // the group's left edge (300) and c (900) align on 300; b keeps its 200 offset inside the group
    expect(frame(left, "a").x).toBe(300);
    expect(frame(left, "b").x).toBe(500);
    expect(frame(left, "c").x).toBe(300);
    // the group alone: centred on the slide, members keep their layout
    const mid = alignBlocks(c, ["a", "b"], "hcenter");
    const gx = (frame(mid, "a").x + frame(mid, "b").x + 100) / 2;
    expect(gx).toBe(SLIDE_W / 2);
    expect(frame(mid, "b").x - frame(mid, "a").x).toBe(200);
    // explicit: align a multi-selection to the slide's right edge
    const right = alignBlocks(c, ["c"], "right", "slide");
    expect(frame(right, "c").x + 50).toBe(SLIDE_W);
  });
  it("distributes groups and blocks with equal gaps", () => {
    let c = canvasOf(
      box("a", 0, 0),
      box("a2", 50, 150),
      box("b", 300, 0),
      box("c", 1000, 0),
    );
    c = groupBlocks(c, ["a", "a2"]).canvas; // the group spans 0..150
    const d = distributeBlocks(c, ["a", "a2", "b", "c"], "h");
    // span 0..1100, sizes 150 + 100 + 100 → gap (1100 − 350) / 2 = 375 → b at 525
    expect(frame(d, "b").x).toBe(525);
    expect(frame(d, "a2").x).toBe(50);
    expect(frame(d, "c").x).toBe(1000);
    // fewer than three pieces: nothing moves
    expect(distributeBlocks(c, ["a", "a2", "b"], "h")).toBe(c);
  });
  it("makes blocks the same width / height as the reference; aspect-locked ones scale", () => {
    const inst: SlideBlock = {
      id: "i",
      frame: { x: 0, y: 500, w: 400, h: 300, z: 1 },
      kind: "instrument",
      view: { kind: "six" },
      alt: { en: "x" },
    };
    const c = canvasOf(
      box("a", 0, 0, 600, 100),
      box("b", 0, 200, 200, 50),
      inst,
    );
    const w = matchSize(
      c,
      ["a", "b", "i"],
      "w",
      (b) => b.kind === "instrument",
    );
    expect(frame(w, "b")).toMatchObject({ w: 600, h: 50 });
    expect(frame(w, "i")).toMatchObject({ w: 600, h: 450 });
    const both = matchSize(c, ["b", "a"], "both");
    expect(frame(both, "a")).toMatchObject({ w: 200, h: 50, x: 0, y: 0 });
  });
  it("centres the selection on the slide", () => {
    const c = centerOnSlide(
      canvasOf(box("a", 0, 0, 200, 100), box("b", 300, 100, 100, 100)),
      ["a", "b"],
    );
    expect(frame(c, "a").x + 200).toBe(SLIDE_W / 2); // the 400 × 200 selection's centre on (960, 540)
    expect(frame(c, "a").y).toBe(SLIDE_H / 2 - 100);
  });
  it("the controller runs align / match / centre; match uses the largest block", () => {
    const ed = new EditorCore(
      canvasOf(box("a", 100, 100, 200, 100), box("b", 500, 400, 700, 60)),
    );
    ed.select(["a", "b"]);
    expect(ed.run({ k: "match", dim: "w" })).toBe(true);
    expect(frame(ed.canvas, "a").w).toBe(700);
    expect(ed.run({ k: "align", how: "top" })).toBe(true);
    expect(frame(ed.canvas, "b").y).toBe(100);
    expect(ed.run({ k: "center" })).toBe(true);
    expect(ed.run({ k: "undo" })).toBe(true);
    expect(frame(ed.canvas, "b").y).toBe(100);
  });
});

describe("selection and commands", () => {
  it("multi-select mode: every tap adds or removes (touch has no Shift)", () => {
    const ed = new EditorCore(
      canvasOf(box("a", 100, 100), box("b", 400, 100), box("c", 700, 100)),
    );
    ed.multiSelect = true;
    ed.pointerDown([150, 150]);
    ed.pointerUp();
    ed.pointerDown([450, 150]);
    ed.pointerUp();
    expect(ed.selection).toEqual(["a", "b"]);
    ed.pointerDown([150, 150]); // a again: out
    ed.pointerUp();
    expect(ed.selection).toEqual(["b"]);
    // a tap on the empty slide keeps the selection while the mode is on
    ed.pointerDown([1500, 900]);
    ed.pointerUp();
    expect(ed.selection).toEqual(["b"]);
    ed.multiSelect = false;
    ed.pointerDown([1500, 900]);
    ed.pointerUp();
    expect(ed.selection).toEqual([]);
  });
  it("⌘D duplicates the selection one grid cell away, arrows nudge (Shift = a grid cell)", () => {
    const ed = new EditorCore(canvasOf(box("a", 96, 96, 240, 240)));
    ed.select(["a"]);
    const dup = keyCommand({ key: "d", metaKey: true });
    expect(dup).toEqual({ k: "duplicate" });
    expect(ed.run(dup!)).toBe(true);
    expect(ed.canvas.blocks).toHaveLength(2);
    const copy = ed.canvas.blocks[1];
    expect(ed.selection).toEqual([copy.id]);
    expect(copy.frame.x - 96).toBe(ed.grid);
    expect(ed.run(keyCommand({ key: "ArrowRight" })!)).toBe(true);
    expect(frame(ed.canvas, copy.id).x).toBe(96 + ed.grid + 1);
    expect(
      ed.run(keyCommand({ key: "ArrowDown", shiftKey: true }, ed.grid)!),
    ).toBe(true);
    expect(frame(ed.canvas, copy.id).y).toBe(96 + ed.grid * 2);
    // ⌘G groups, ⇧⌘G ungroups
    ed.run({ k: "selectAll" });
    expect(ed.run(keyCommand({ key: "g", ctrlKey: true })!)).toBe(true);
    expect(new Set(ed.canvas.blocks.map((b) => b.frame.group)).size).toBe(1);
    expect(
      ed.run(keyCommand({ key: "g", ctrlKey: true, shiftKey: true })!),
    ).toBe(true);
    expect(ed.canvas.blocks.every((b) => !b.frame.group)).toBe(true);
  });
});

describe("starter decks", () => {
  const course = (): Course => ({
    format: "ifr-course",
    version: 1,
    id: "t",
    rev: 0,
    updated: "2026-11-07T10:00:00Z",
    title: { en: "My course", fr: "Mon cours" },
    author: { name: "J. Martin" },
    langs: ["en", "fr"],
    cockpit: "g1000",
    world: { kind: "training" },
    steps: [],
    scenes: {},
    clips: {},
    assets: {},
  });
  it("builds every deck as designed slides of the archetypes, valid as a course", () => {
    for (const d of [...DECK_STARTERS, BLANK_STARTER]) {
      const r = addStarterDeck(course(), d);
      expect(r.course.steps.map((s) => s.slide?.layout)).toEqual(d.slides);
      expect(r.course.theme).toBe(d.theme);
      expect(r.firstStepId).toBe(r.course.steps[0].id);
      for (const s of r.course.steps) {
        expect(s.kind).toBe("slide");
        expect(s.slide!.theme).toBeUndefined(); // one theme per course
        expect(s.title.en && s.title.fr).toBeTruthy();
      }
      expect(
        validateCourse(r.course).filter((i) => i.level === "error"),
      ).toEqual([]);
    }
  });
  it("appends after a given step and keeps the course theme of a course that has slides", () => {
    const first = addStarterDeck(course(), starterById("maths-lesson"));
    const ids = first.course.steps.map((s) => s.id);
    const r = addStarterDeck(first.course, starterById("hold-briefing"), {
      at: 1,
    });
    expect(r.course.theme).toBe("classroom");
    expect(r.course.steps).toHaveLength(ids.length + 5);
    expect(r.course.steps[0].id).toBe(ids[0]);
    expect(r.course.steps[1].id).toBe(r.firstStepId);
    expect(r.course.steps[6].id).toBe(ids[1]);
    expect(new Set(r.course.steps.map((s) => s.id)).size).toBe(
      r.course.steps.length,
    );
    // the cover takes the course title when asked
    const t = addStarterDeck(course(), starterById("hold-briefing"), {
      title: { en: "Holds at LFPN", fr: "Attentes à LFPN" },
    });
    expect(t.course.steps[0].title.fr).toBe("Attentes à LFPN");
    // each deck's cover carries its own words and hero (the HSI deck: an HSI, the maths deck: the 60:1 diagram)
    const hsi = addStarterDeck(course(), starterById("instrument-reading")).course.steps[0];
    expect(hsi.title.fr).toBe("Lire le HSI : cap, route et écart");
    expect(hsi.slide!.blocks.find((b) => b.id === "hero")?.kind).toBe("instrument");
    const maths = addStarterDeck(course(), starterById("maths-lesson")).course.steps[0];
    const hero = maths.slide!.blocks.find((b) => b.id === "hero");
    expect(hero?.kind).toBe("diagram");
    expect(JSON.stringify(maths.slide)).toContain("sixtyToOne");
    expect(JSON.stringify(maths.slide)).not.toContain("Lire la clairance");
  });
});
