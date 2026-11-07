// Ground school — designed slides (package N): the pure parts of the canvas engine. Geometry (snapping, guides,
// resize, rotate, hit tests), edit operations, the undo history, rich text, themes (contrast), reveal logic, the
// library catalogue and placement, layout templates, the eight examples (validated as a course) and the editing
// controller (gestures, commands, keyboard map). The DOM renderer is checked on the dev server (screenshots).
import { describe, expect, it } from "vitest";
import type { SlideBlock, SlideCanvas } from "../src/course/types";
import {
  aabb,
  fitSlide,
  frameContains,
  hitTest,
  keepOnSlide,
  marquee,
  paintOrder,
  readingOrder,
  resizeFrame,
  rotationAt,
  snap,
  snapMove,
  SLIDE_H,
  SLIDE_W,
} from "../src/course/canvas/geom";
import {
  addBlock,
  alignBlocks,
  distributeBlocks,
  duplicateBlocks,
  expandGroups,
  groupBlocks,
  moveBlocks,
  nudge,
  reorder,
  revealSteps,
  scaleBlocks,
  ungroupBlocks,
} from "../src/course/canvas/ops";
import { History } from "../src/course/canvas/history";
import {
  fitScale,
  parseInline,
  parseRich,
  plainText,
  loc,
  isMissing,
} from "../src/course/canvas/text";
import {
  THEMES,
  THEME_IDS,
  color,
  contrastRatio,
  ensureContrast,
  resolveTheme,
  themeVars,
} from "../src/course/canvas/themes";
import { clickSteps, isRevealed, revealOf } from "../src/course/canvas/render";
import { cropPlacement, leaderStart } from "../src/course/canvas/blocks";
import {
  LIBRARY_ITEMS,
  LIBRARY_TABS,
  emptyCanvas,
  instrumentScreen,
  placeDraft,
  searchItems,
  libraryItem,
} from "../src/course/canvas/factory";
import { LAYOUTS, layoutCanvas } from "../src/course/canvas/layouts";
import { exampleCourse, exampleSlides } from "../src/course/canvas/examples";
import {
  EditorCore,
  keyCommand,
  keepsAspect,
} from "../src/course/canvas/editorCore";
import {
  LIBRARY,
  libraryUrl,
  searchLibrary,
} from "../src/course/canvas/library";
import { heightLabel } from "../src/course/canvas/airspace";
import { validateCourse } from "../src/course/validate";
import { holdEntry } from "../src/nav/holding";

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

// ------------------------------------------------------------------ geometry
describe("canvas geometry", () => {
  it("snaps to the grid and fits a 16:9 slide in any host", () => {
    expect(snap(37, 24)).toBe(48);
    expect(snap(35, 24)).toBe(24);
    expect(snap(35, 0)).toBe(35);
    const f = fitSlide(1000, 1000);
    expect(f.k).toBeCloseTo(1000 / 1920);
    expect(f.x).toBeCloseTo(0);
    expect(f.y).toBeCloseTo((1000 - 1080 * f.k) / 2);
    const g = fitSlide(1920, 600, 20);
    expect(g.k).toBeCloseTo(560 / 1080);
  });
  it("bounds and hit-tests rotated frames", () => {
    const f = { x: 0, y: 0, w: 200, h: 100, z: 1, rot: 90 };
    const b = aabb(f);
    expect(b.w).toBeCloseTo(100);
    expect(b.h).toBeCloseTo(200);
    expect(b.x).toBeCloseTo(50);
    expect(frameContains(f, [100, -40])).toBe(true); // inside once rotated
    expect(frameContains(f, [10, 50])).toBe(false); // was inside before rotating
  });
  it("hit-tests the topmost unlocked block; arrows along their shaft only", () => {
    const a = box("a", 0, 0, 300, 300);
    const b = box("b", 100, 100, 100, 100, { z: 2 });
    const l = box("l", 0, 0, 1000, 1000, { z: 9, locked: true });
    const arrow: SlideBlock = {
      id: "ar",
      frame: { x: 0, y: 500, w: 400, h: 400, z: 5 },
      kind: "arrow",
      from: [0, 500],
      to: [400, 900],
    };
    const blocks = [a, b, l, arrow];
    expect(hitTest(blocks, [150, 150])?.id).toBe("b");
    expect(hitTest(blocks, [50, 50])?.id).toBe("a");
    expect(hitTest(blocks, [50, 50], { withLocked: true })?.id).toBe("l");
    expect(hitTest(blocks, [200, 700])?.id).toBe("ar"); // on the diagonal
    expect(hitTest(blocks, [380, 520])).toBeNull(); // inside the box, far from the shaft
    expect(
      marquee(blocks, { x: 90, y: 90, w: 20, h: 20 }).map((x) => x.id),
    ).toEqual(["a", "b"]);
  });
  it("orders paint by z then array order, and reading by readOrder then rows", () => {
    const p = paintOrder([
      box("x", 0, 0, 1, 1, { z: 3 }),
      box("y", 0, 0, 1, 1, { z: 1 }),
      box("z", 0, 0, 1, 1, { z: 1 }),
    ]);
    expect(p.map((b) => b.id)).toEqual(["y", "z", "x"]);
    const r = readingOrder([
      box("right", 900, 100),
      box("left", 100, 105),
      { ...box("first", 900, 900), readOrder: 1 },
    ]);
    expect(r.map((b) => b.id)).toEqual(["first", "left", "right"]);
  });
  it("snaps a moving box to another box's edge and draws the guide", () => {
    const s = snapMove(
      { x: 307, y: 500, w: 100, h: 100 },
      [{ x: 100, y: 100, w: 200, h: 100 }],
      { grid: 24 },
    );
    expect(s.dx).toBe(-7); // left edge onto the other's right edge (300)
    const gx = s.guides.find((g) => g.axis === "x");
    expect(gx?.at).toBe(300);
    expect(gx?.kind).toBe("edge");
    // nothing near: grid snapping of the top-left corner
    const t = snapMove({ x: 1000 + 5, y: 700 + 7, w: 50, h: 50 }, [], {
      grid: 24,
      threshold: 2,
    });
    expect((1005 + t.dx) % 24).toBe(0);
    expect((707 + t.dy) % 24).toBe(0);
    // the slide centre is a guide
    const c = snapMove({ x: 905, y: 200, w: 100, h: 50 }, [], {
      threshold: 10,
    });
    expect(c.dx).toBe(5);
    expect(c.guides[0].kind).toBe("slide");
  });
  it("resizes from a corner with the opposite corner fixed, keeps aspect, respects a minimum", () => {
    const f = { x: 100, y: 100, w: 200, h: 100, z: 1 };
    const r = resizeFrame(f, "se", 100, 50);
    expect(r).toMatchObject({ x: 100, y: 100, w: 300, h: 150 });
    const nw = resizeFrame(f, "nw", -50, -20);
    expect(nw.x + nw.w).toBeCloseTo(300);
    expect(nw.y + nw.h).toBeCloseTo(200);
    const k = resizeFrame(f, "e", 200, 0, { keepAspect: true });
    expect(k.w / k.h).toBeCloseTo(2);
    const tiny = resizeFrame(f, "se", -500, -500);
    expect(tiny.w).toBeGreaterThanOrEqual(16);
    // rotated 90°: dragging the east handle down the page lengthens the box, and the west edge stays put
    const rf = { x: 0, y: 0, w: 200, h: 100, z: 1, rot: 90 };
    const rr = resizeFrame(rf, "e", 0, 60);
    expect(rr.w).toBeCloseTo(260);
    const westBefore = [100, -50]; // the west edge's midpoint on the slide after a 90° turn about (100, 50)
    const c = [rr.x + rr.w / 2, rr.y + rr.h / 2];
    const westAfter = [c[0], c[1] - rr.w / 2];
    expect(westAfter[0]).toBeCloseTo(westBefore[0]);
    expect(westAfter[1]).toBeCloseTo(westBefore[1]);
  });
  it("rotates about the centre with a 15° step and a soft magnet at right angles", () => {
    const f = { x: 0, y: 0, w: 100, h: 100, z: 1 };
    expect(rotationAt(f, [100, 50])).toBe(90);
    expect(rotationAt(f, [50, -100])).toBe(0);
    expect(rotationAt(f, [100, 10], 15)).toBe(45);
    expect(rotationAt(f, [0, 50])).toBe(-90);
  });
  it("keeps a block on the slide", () => {
    const k = keepOnSlide({ x: 1900, y: -500, w: 200, h: 200, z: 1 });
    expect(k.x).toBeLessThanOrEqual(SLIDE_W - 48);
    expect(k.y + k.h).toBeGreaterThanOrEqual(48);
  });
});

// ------------------------------------------------------------------ operations
describe("canvas operations", () => {
  const arrow: SlideBlock = {
    id: "ar",
    frame: { x: 88, y: 88, w: 224, h: 24, z: 3 },
    kind: "arrow",
    from: [100, 100],
    to: [300, 100],
  };
  it("moves blocks with their arrow ends and callout targets; locked blocks stay", () => {
    const c = canvasOf(
      box("a", 0, 0),
      arrow,
      box("l", 500, 500, 100, 100, { locked: true }),
      {
        id: "co",
        frame: { x: 600, y: 0, w: 200, h: 100, z: 2 },
        kind: "callout",
        text: { en: "x" },
        target: [500, 300],
      },
    );
    const m = moveBlocks(c, ["a", "ar", "l", "co"], 10, 20);
    expect(m.blocks[0].frame).toMatchObject({ x: 10, y: 20 });
    expect(m.blocks[1].kind === "arrow" && m.blocks[1].from).toEqual([
      110, 120,
    ]);
    expect(m.blocks[2].frame).toMatchObject({ x: 500, y: 500 });
    expect(m.blocks[3].kind === "callout" && m.blocks[3].target).toEqual([
      510, 320,
    ]);
    expect(c.blocks[0].frame.x).toBe(0); // input untouched
  });
  it("duplicates on top with fresh ids and a fresh group", () => {
    const c = canvasOf(
      box("a", 0, 0, 100, 100, { group: "g1", z: 4 }),
      box("b", 200, 0, 100, 100, { group: "g1", z: 2 }),
    );
    const r = duplicateBlocks(c, ["a", "b"]);
    expect(r.ids).toHaveLength(2);
    expect(new Set(r.canvas.blocks.map((b) => b.id)).size).toBe(4);
    const copies = r.canvas.blocks.filter((b) => r.ids.includes(b.id));
    expect(copies.every((b) => b.frame.z > 4)).toBe(true);
    expect(copies[0].frame.group).toBe(copies[1].frame.group);
    expect(copies[0].frame.group).not.toBe("g1");
    expect(copies.find((b) => b.frame.x === 24)).toBeTruthy();
  });
  it("groups, expands a tap to the group, ungroups", () => {
    const c = canvasOf(box("a", 0, 0), box("b", 200, 0), box("c", 400, 0));
    const g = groupBlocks(c, ["a", "b"]);
    expect(expandGroups(g.canvas, ["a"])).toEqual(["a", "b"]);
    expect(expandGroups(ungroupBlocks(g.canvas, ["a", "b"]), ["a"])).toEqual([
      "a",
    ]);
  });
  it("reorders: front, back, one step", () => {
    const c = canvasOf(
      box("a", 0, 0, 1, 1, { z: 1 }),
      box("b", 0, 0, 1, 1, { z: 2 }),
      box("c", 0, 0, 1, 1, { z: 3 }),
    );
    const zs = (x: SlideCanvas) =>
      paintOrder(x.blocks)
        .map((b) => b.id)
        .join("");
    expect(zs(reorder(c, ["a"], "front"))).toBe("bca");
    expect(zs(reorder(c, ["c"], "back"))).toBe("cab");
    expect(zs(reorder(c, ["a"], "forward"))).toBe("bac");
    expect(zs(reorder(c, ["c"], "forward"))).toBe("abc");
  });
  it("aligns and distributes", () => {
    const c = canvasOf(
      box("a", 10, 0, 100),
      box("b", 300, 50, 50),
      box("c", 900, 80, 100),
    );
    const left = alignBlocks(c, ["a", "b", "c"], "left");
    expect(left.blocks.map((b) => b.frame.x)).toEqual([10, 10, 10]);
    const one = alignBlocks(c, ["b"], "hcenter");
    expect(one.blocks[1].frame.x + 25).toBe(SLIDE_W / 2);
    const d = distributeBlocks(c, ["a", "b", "c"], "h");
    const gaps = [
      d.blocks[1].frame.x - (d.blocks[0].frame.x + 100),
      d.blocks[2].frame.x - (d.blocks[1].frame.x + 50),
    ];
    expect(Math.abs(gaps[0] - gaps[1])).toBeLessThanOrEqual(1);
  });
  it("scales a multi-selection about its box and nudges within the slide", () => {
    const c = canvasOf(box("a", 0, 0, 100, 100), box("b", 100, 100, 100, 100));
    const s = scaleBlocks(
      c,
      ["a", "b"],
      { x: 0, y: 0, w: 200, h: 200 },
      { x: 0, y: 0, w: 400, h: 400 },
    );
    expect(s.blocks[1].frame).toMatchObject({ x: 200, y: 200, w: 200, h: 200 });
    const n = nudge(canvasOf(box("a", SLIDE_W - 60, 0)), ["a"], 500, 0);
    expect(n.blocks[0].frame.x).toBeLessThanOrEqual(SLIDE_W - 48);
  });
  it("adds on top with a unique id", () => {
    const c = addBlock(
      canvasOf(box("a", 0, 0, 1, 1, { z: 7 })),
      box("a", 5, 5),
    );
    expect(c.blocks[1].id).not.toBe("a");
    expect(c.blocks[1].frame.z).toBe(8);
  });
});

// ------------------------------------------------------------------ history
describe("undo history", () => {
  it("coalesces a gesture into one step, undoes and redoes", () => {
    let t = 0;
    const h = new History({ v: 0 }, { now: () => t, coalesceMs: 500 });
    h.push({ v: 1 }, "drag");
    t = 100;
    h.push({ v: 2 }, "drag");
    t = 200;
    h.push({ v: 3 }, "drag");
    expect(h.depth.undo).toBe(1);
    h.seal();
    h.push({ v: 4 }, "drag");
    expect(h.depth.undo).toBe(2);
    expect(h.undo()).toEqual({ v: 3 });
    expect(h.undo()).toEqual({ v: 0 });
    expect(h.undo()).toBeNull();
    expect(h.redo()).toEqual({ v: 3 });
    h.push({ v: 9 });
    expect(h.canRedo).toBe(false);
    expect(h.push({ v: 9 })).toBe(false);
  });
  it("drops the oldest steps beyond the limit", () => {
    const h = new History(0, { limit: 3 });
    for (let i = 1; i <= 6; i++) h.push(i);
    expect(h.depth.undo).toBe(3);
  });
});

// ------------------------------------------------------------------ rich text
describe("rich text", () => {
  it("parses bold, italic, code, links, bindings and lists", () => {
    const inl = parseInline("A **bold *it* x** `318` [[CDI bar|a1]] {{value}}");
    expect(inl.map((x) => x.t)).toEqual([
      "text",
      "b",
      "text",
      "code",
      "text",
      "link",
      "text",
      "value",
    ]);
    const paras = parseRich("Intro\n\n- one\n- two\n1. first\n2. second");
    expect(paras.map((p) => p.t)).toEqual(["p", "ul", "ol"]);
    expect(plainText("**Wind** {{v}} [[bar|x]]", "270/15")).toBe(
      "Wind 270/15 bar",
    );
    expect(parseInline("2 * 3 = 6")).toEqual([{ t: "text", s: "2 * 3 = 6" }]);
  });
  it("auto-fit shrinks only as far as needed, never grows", () => {
    expect(fitScale(() => false)).toBe(1);
    const k = fitScale((s) => s > 0.73);
    expect(k).toBeGreaterThan(0.7);
    expect(k).toBeLessThanOrEqual(0.73);
    expect(fitScale(() => true, 0.5)).toBe(0.5);
  });
  it("falls back to English and flags a missing French text", () => {
    expect(loc({ en: "Hold" }, "fr")).toBe("Hold");
    expect(isMissing({ en: "Hold" }, "fr")).toBe(true);
    expect(isMissing({ en: "Hold", fr: "Attente" }, "fr")).toBe(false);
  });
});

// ------------------------------------------------------------------ themes
describe("themes", () => {
  it("has two themes whose every text token passes WCAG AA on the background and on raise (SPEC v2 §4)", () => {
    expect(THEME_IDS).toEqual(["classroom", "cockpit"]);
    for (const id of THEME_IDS) {
      const t = THEMES[id];
      for (const tok of ["text", "ink2", "muted", "accent", "path", "sel", "nav", "key", "stop"] as const) {
        expect(contrastRatio(t.colors[tok], t.colors.bg), `${id} ${tok}`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.colors[tok], t.colors.raise), `${id} ${tok} on raise`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrastRatio(t.colors.accentInk, t.colors.accent)).toBeGreaterThanOrEqual(4.5);
      // the type scale's hard floor: nothing under 24 logical px, no monospace
      expect(Object.values(t.styles).every((s) => s.size >= 24)).toBe(true);
      expect(Object.values(t.fonts).some((f) => /mono/i.test(f))).toBe(false);
    }
  });
  it("loads the older theme ids as their nearest (projector = classroom + boost, brand = classroom)", () => {
    const proj = resolveTheme("projector");
    expect(proj.dark).toBe(false);
    expect(proj.colors.bg).toBe("#ffffff");
    expect(proj.colors.muted).toBe(THEMES.classroom.colors.ink2);
    expect(proj.styles.body.weight).toBeGreaterThan(THEMES.classroom.styles.body.weight);
    expect(resolveTheme("brand").colors.text).toBe(THEMES.classroom.colors.text);
    const boosted = resolveTheme("cockpit", undefined, { boost: true });
    expect(boosted.dark).toBe(true);
    expect(boosted.styles.title.weight).toBe(700);
  });
  it("makes a school colour readable as the brand accent", () => {
    const pale = resolveTheme("brand", { name: "Club", color: "#7fd3ff" });
    expect(pale.colors.brand).toBe("#7fd3ff");
    expect(
      contrastRatio(pale.colors.accent, pale.colors.bg),
    ).toBeGreaterThanOrEqual(4.5);
    const other = resolveTheme("cockpit", { name: "Club", color: "#0a2a6a" });
    expect(
      contrastRatio(other.colors.brand, other.colors.bg),
    ).toBeGreaterThanOrEqual(3);
    expect(ensureContrast("#ffffff", "#ffffff")).not.toBe("#ffffff");
    expect(resolveTheme(undefined).id).toBe("classroom");
  });
  it("resolves tokens and hex colours, with a fallback", () => {
    const t = THEMES.classroom;
    expect(color("accent", t)).toBe(t.colors.accent);
    expect(color("#123456", t)).toBe("#123456");
    expect(color("#zz" as `#${string}`, t)).toBe(t.colors.text);
    expect(themeVars(t)["--sl-bg"]).toBe(t.colors.bg);
  });
});

// ------------------------------------------------------------------ reveal logic and pure block helpers
describe("reveals", () => {
  const blocks: SlideBlock[] = [
    box("always", 0, 0),
    { ...box("r1", 0, 0), reveal: { order: 1 } },
    { ...box("r1b", 0, 0), reveal: { order: 1 } },
    { ...box("r3", 0, 0), reveal: { order: 3 } },
    { ...box("ans", 0, 0), reveal: { order: 2, when: "answered" } },
    { ...box("pres", 0, 0), reveal: { order: 2, when: "presenter" } },
  ];
  const c = canvasOf(...blocks);
  it("counts click and presenter reveals; events are separate", () => {
    expect(clickSteps(c)).toEqual([1, 2, 3]);
    expect(revealOf(blocks[4])).toEqual({ click: 0, event: "answered" });
    expect(revealSteps(c)).toEqual([1, 2, 3]);
  });
  it("shows blocks as reveals and events happen", () => {
    const steps = clickSteps(c);
    const shown = (n: number, ev: string[] = []) =>
      blocks
        .filter((b) => isRevealed(b, steps, n, new Set(ev)))
        .map((b) => b.id);
    expect(shown(0)).toEqual(["always"]);
    expect(shown(1)).toEqual(["always", "r1", "r1b"]);
    expect(shown(2)).toEqual(["always", "r1", "r1b", "pres"]);
    expect(shown(3, ["answered"])).toEqual([
      "always",
      "r1",
      "r1b",
      "r3",
      "ans",
      "pres",
    ]);
    expect(shown(99)).toContain("r3");
  });
  it("places an image crop to cover or fit the frame", () => {
    const p = cropPlacement(
      400,
      200,
      1000,
      1000,
      [0.25, 0.25, 0.5, 0.5],
      "cover",
    );
    // the visible 500 × 500 part is scaled to cover 400 × 200: s = 0.8, centred
    expect(p.w).toBeCloseTo(800);
    expect(p.x).toBeCloseTo(-200);
    expect(p.y).toBeCloseTo((200 - 400) / 2 - 200);
    const q = cropPlacement(400, 200, 1000, 500, undefined, "contain");
    expect(q.w).toBeCloseTo(400);
    expect(q.y).toBeCloseTo(0);
  });
  it("starts a callout leader on the box edge towards the target", () => {
    expect(leaderStart(200, 100, [500, 50])).toEqual([200, 50]);
    const s = leaderStart(200, 100, [100, -300]);
    expect(s[1]).toBeCloseTo(0);
  });
});

// ------------------------------------------------------------------ library and placement
describe("library", () => {
  it("offers every tab, with unique ids, and every item places a valid block on the slide", () => {
    expect(new Set(LIBRARY_ITEMS.map((i) => i.id)).size).toBe(
      LIBRARY_ITEMS.length,
    );
    for (const t of LIBRARY_TABS)
      expect(LIBRARY_ITEMS.some((i) => i.tab === t)).toBe(true);
    let c = emptyCanvas();
    for (const it of LIBRARY_ITEMS) {
      const b = placeDraft(c, it.make(), [200, 900]);
      expect(b.frame.x).toBeGreaterThanOrEqual(0);
      expect(b.frame.y).toBeGreaterThanOrEqual(0);
      expect(b.frame.x + b.frame.w).toBeLessThanOrEqual(SLIDE_W);
      expect(b.frame.y + b.frame.h).toBeLessThanOrEqual(SLIDE_H);
      if (b.kind === "image" || b.kind === "instrument" || b.kind === "diagram")
        expect(b.alt?.en, it.id).toBeTruthy();
      if (b.kind === "arrow") {
        expect(b.from[0]).toBeGreaterThanOrEqual(b.frame.x);
        expect(b.to[0]).toBeLessThanOrEqual(b.frame.x + b.frame.w);
      }
      c = addBlock(c, b);
    }
    expect(c.blocks.length).toBe(LIBRARY_ITEMS.length);
    expect(new Set(c.blocks.map((b) => b.id)).size).toBe(c.blocks.length);
  });
  it("searches in English and French, accents folded", () => {
    expect(
      searchItems("attente").some((i) => i.id === "diagram:live:hold"),
    ).toBe(true);
    expect(searchItems("hsi", "instruments").map((i) => i.id)).toContain(
      "instrument:hsi",
    );
    expect(
      searchItems("altimetre").some(
        (i) => i.id === "instrument:alt" || i.id === "icon:altimeter",
      ),
    ).toBe(true);
    expect(searchItems("zzzz")).toHaveLength(0);
    expect(searchLibrary("vor", "icon").length).toBeGreaterThan(0);
  });
  it("draws recolourable icons and theme-coloured diagrams", () => {
    const u = libraryUrl("icon:vor", { color: "#ff0000" });
    expect(u).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(u!)).toContain("#ff0000");
    expect(
      decodeURIComponent(libraryUrl("diagram:ils", { theme: THEMES.cockpit })!),
    ).toContain(THEMES.cockpit.colors.green);
    expect(libraryUrl("icon:nope")).toBeNull();
    expect(
      LIBRARY.filter((a) => a.kind === "photo").every((a) => a.attribution),
    ).toBe(true);
  });
  it("maps the instrument drawing onto the block (markers land on the gauge)", () => {
    const s = instrumentScreen({ kind: "gauge", gauge: "hsi" }, 600, 600);
    expect(s.w).toBeCloseTo(s.h);
    expect(s.x).toBeCloseTo((600 - s.w) / 2);
    const six = instrumentScreen({ kind: "six" }, 800, 600, false);
    expect(six.toBlock([0, 0])).toEqual([0, 0]);
    expect(six.toBlock([1024, 768])[0]).toBeCloseTo(800);
  });
  it("names an altitude like a chart", () => {
    expect(heightLabel(0, "en")).toBe("SFC");
    expect(heightLabel(2500, "fr").replace(/\s|\u202f/g, " ")).toBe("2 500 ft");
    expect(heightLabel(6500, "en", true)).toBe("FL 65");
  });
});

// ------------------------------------------------------------------ layouts and examples
const onSlide = (b: SlideBlock) =>
  b.frame.x >= 0 &&
  b.frame.y >= 0 &&
  b.frame.x + b.frame.w <= SLIDE_W &&
  b.frame.y + b.frame.h <= SLIDE_H;
describe("layout templates", () => {
  it("builds every template on the slide, on the grid, with alt text", () => {
    expect(LAYOUTS.length).toBeGreaterThanOrEqual(11);
    for (const l of LAYOUTS) {
      const c = layoutCanvas(l.id, { theme: "classroom" });
      expect(c.layout).toBe(l.id);
      expect(new Set(c.blocks.map((b) => b.id)).size).toBe(c.blocks.length);
      for (const b of c.blocks) {
        expect(onSlide(b), `${l.id}/${b.id}`).toBe(true);
        // the design system's frames sit on an 8 px baseline (SPEC slides v2 §1)
        if (b.kind !== "marker") {
          expect(b.frame.x % 8, `${l.id}/${b.id} x`).toBe(0);
          expect(b.frame.y % 8, `${l.id}/${b.id} y`).toBe(0);
        }
        if (
          b.kind === "image" ||
          b.kind === "instrument" ||
          b.kind === "diagram"
        )
          expect(b.alt?.en).toBeTruthy();
        if (b.kind === "text")
          expect(b.text.fr, `${l.id}/${b.id} fr`).toBeTruthy();
      }
      if (l.id !== "blank" && l.id !== "fullBleed")
        expect(c.blocks.some((b) => b.kind === "text")).toBe(true);
    }
    expect(layoutCanvas("blank").blocks).toHaveLength(0);
    expect(layoutCanvas("fullBleed").background?.image).toBeTruthy();
  });
  it("a Your turn template is practice, never ACS-graded", () => {
    const yt = layoutCanvas("yourTurn").blocks.find(
      (b) => b.kind === "instrument",
    );
    expect(yt?.kind === "instrument" && yt.yourTurn?.goal.graded).toBe(false);
  });
});

describe("example slides", () => {
  it("are eight, bilingual, on the slide", () => {
    const ex = exampleSlides();
    expect(ex).toHaveLength(8);
    for (const e of ex) {
      expect(e.title.fr).toBeTruthy();
      for (const b of e.slide.blocks) {
        expect(onSlide(b), `${e.id}/${b.id}`).toBe(true);
        if (b.kind === "text" || b.kind === "callout")
          expect(b.text.fr, `${e.id}/${b.id}`).toBeTruthy();
      }
    }
  });
  it("validate as a course with no errors", () => {
    const course = exampleCourse("cockpit");
    const errors = validateCourse(course).filter((i) => i.level === "error");
    expect(errors.map((e) => `${e.code} ${e.path} ${e.message.en}`)).toEqual(
      [],
    );
  });
  it("teach the hold entry from holdEntry() (AIM FIG 5-3-8)", () => {
    const hold = exampleSlides().find((e) => e.id === "ex-hold-entries")!;
    const d = hold.slide.blocks.find((b) => b.kind === "diagram");
    expect(holdEntry(90, "R", 240)).toBe("TEARDROP");
    expect(d?.kind === "diagram" && d.caption?.en).toContain("teardrop");
  });
  it("use scenes that exist in the course", () => {
    const course = exampleCourse();
    for (const s of course.steps)
      for (const b of s.slide!.blocks)
        if (b.kind === "instrument" && b.scene)
          expect(course.scenes[b.scene], b.id).toBeTruthy();
  });
});

// ------------------------------------------------------------------ the editing controller
describe("editor core", () => {
  const two = () =>
    canvasOf(box("a", 96, 96, 240, 240), box("b", 960, 480, 240, 240));
  it("selects on tap, moves with grid snapping, and undoes the whole drag in one step", () => {
    const ed = new EditorCore(two());
    expect(ed.pointerDown([150, 150])).toBe("move");
    expect(ed.selection).toEqual(["a"]);
    ed.pointerMove([160, 160]);
    ed.pointerMove([181, 173]);
    expect(ed.pointerUp()).toBe(true);
    const a = ed.canvas.blocks[0].frame;
    expect(a.x % 24).toBe(0);
    expect(a.y % 24).toBe(0);
    expect(a.x).toBeGreaterThan(96);
    expect(ed.run({ k: "undo" })).toBe(true);
    expect(ed.canvas.blocks[0].frame).toMatchObject({ x: 96, y: 96 });
    expect(ed.run({ k: "redo" })).toBe(true);
    expect(ed.canvas.blocks[0].frame.x).toBe(a.x);
  });
  it("Alt moves freely; Shift constrains the axis; Escape cancels", () => {
    const ed = new EditorCore(two());
    ed.pointerDown([150, 150]);
    ed.pointerMove([157, 163], { alt: true });
    expect(ed.canvas.blocks[0].frame).toMatchObject({ x: 103, y: 109 });
    ed.pointerMove([250, 163], { alt: true, shift: true });
    expect(ed.canvas.blocks[0].frame).toMatchObject({ x: 196, y: 96 });
    ed.cancel();
    expect(ed.canvas.blocks[0].frame).toMatchObject({ x: 96, y: 96 });
  });
  it("marquee-selects, Shift adds, a tap narrows a multi-selection", () => {
    const ed = new EditorCore(two());
    expect(ed.pointerDown([10, 10])).toBe("marquee");
    ed.pointerMove([1500, 1000]);
    ed.pointerUp();
    expect(ed.selection).toEqual(["a", "b"]);
    ed.pointerDown([150, 150]);
    ed.pointerUp();
    expect(ed.selection).toEqual(["a"]);
    ed.pointerDown([1000, 500], { shift: true });
    ed.pointerUp();
    expect(ed.selection).toEqual(["a", "b"]);
  });
  it("resizes from a handle (instruments keep their aspect) and rotates by 15° with Shift", () => {
    const inst: SlideBlock = {
      id: "i",
      frame: { x: 96, y: 96, w: 480, h: 360, z: 1 },
      kind: "instrument",
      view: { kind: "six" },
      alt: { en: "x" },
    };
    expect(keepsAspect(inst)).toBe(true);
    const ed = new EditorCore(canvasOf(inst));
    ed.select(["i"]);
    ed.beginResize("se", [576, 456]);
    ed.pointerMove([700, 456]);
    ed.pointerUp();
    const f = ed.canvas.blocks[0].frame;
    expect(f.w / f.h).toBeCloseTo(4 / 3, 1);
    expect(f.x).toBe(96);
    ed.beginRotate();
    ed.pointerMove([f.x + f.w + 300, f.y + f.h / 2 - 20], { shift: true });
    ed.pointerUp();
    expect(ed.canvas.blocks[0].frame.rot).toBe(90);
  });
  it("drags an arrow end and a callout's leader", () => {
    const ar: SlideBlock = {
      id: "ar",
      frame: { x: 88, y: 88, w: 224, h: 24, z: 1 },
      kind: "arrow",
      from: [100, 100],
      to: [300, 100],
    };
    const ed = new EditorCore(canvasOf(ar));
    ed.select(["ar"]);
    ed.beginArrowEnd("to");
    ed.pointerMove([400, 300]);
    ed.pointerUp();
    const a = ed.canvas.blocks[0];
    expect(a.kind === "arrow" && a.to).toEqual([396, 300]);
    expect(a.frame.y + a.frame.h).toBeGreaterThanOrEqual(300);
    const co: SlideBlock = {
      id: "co",
      frame: { x: 600, y: 96, w: 400, h: 120, z: 1 },
      kind: "callout",
      text: { en: "x" },
      target: [500, 400],
    };
    const e2 = new EditorCore(canvasOf(co));
    e2.select(["co"]);
    e2.beginTarget();
    e2.pointerMove([520, 410]);
    e2.pointerUp();
    expect(
      e2.canvas.blocks[0].kind === "callout" && e2.canvas.blocks[0].target,
    ).toEqual([520, 410]);
  });
  it("runs the commands: duplicate, group, lock, z-order, delete, copy / paste, nudge", () => {
    const ed = new EditorCore(two());
    ed.select(["a"]);
    expect(ed.run({ k: "duplicate" })).toBe(true);
    expect(ed.canvas.blocks).toHaveLength(3);
    expect(ed.selection).toHaveLength(1);
    expect(ed.selection[0]).not.toBe("a");
    ed.select(["a", "b"]);
    expect(ed.run({ k: "group" })).toBe(true);
    ed.select(["a"]);
    expect(ed.selection).toEqual(["a", "b"]);
    ed.run({ k: "toggleLock" });
    expect(ed.selected.every((b) => b.frame.locked)).toBe(true);
    ed.run({ k: "nudge", dx: 10, dy: 0 });
    expect(ed.canvas.blocks[0].frame.x).toBe(96); // locked: not moved
    expect(ed.pointerDown([100, 100])).toBe("marquee"); // locked blocks are not hit on the canvas
    ed.pointerUp();
    ed.select(["a"]);
    ed.run({ k: "unlock" });
    ed.run({ k: "nudge", dx: 10, dy: 0 });
    expect(ed.canvas.blocks[0].frame.x).toBe(106);
    ed.run({ k: "copy" });
    ed.run({ k: "paste" });
    expect(ed.canvas.blocks).toHaveLength(5);
    ed.run({ k: "z", how: "back" });
    expect(paintOrder(ed.canvas.blocks)[0].id).toBe(ed.selection[0]);
    ed.run({ k: "delete" });
    expect(ed.canvas.blocks).toHaveLength(3);
    expect(ed.run({ k: "selectAll" })).toBe(true);
    expect(ed.selection).toHaveLength(3);
  });
  it("adds a library item centred and selected; undo removes it", () => {
    const ed = new EditorCore(emptyCanvas());
    const b = ed.addDraft(libraryItem("instrument:hsi")!.make());
    expect(ed.selection).toEqual([b.id]);
    expect(
      Math.abs(b.frame.x + b.frame.w / 2 - SLIDE_W / 2),
    ).toBeLessThanOrEqual(24);
    ed.run({ k: "undo" });
    expect(ed.canvas.blocks).toHaveLength(0);
    expect(ed.selection).toEqual([]);
  });
  it("maps the keyboard", () => {
    expect(keyCommand({ key: "ArrowLeft" })).toEqual({
      k: "nudge",
      dx: -1,
      dy: 0,
    });
    expect(keyCommand({ key: "ArrowDown", shiftKey: true })).toEqual({
      k: "nudge",
      dx: 0,
      dy: 24,
    });
    expect(keyCommand({ key: "z", metaKey: true })).toEqual({ k: "undo" });
    expect(keyCommand({ key: "Z", metaKey: true, shiftKey: true })).toEqual({
      k: "redo",
    });
    expect(keyCommand({ key: "y", ctrlKey: true })).toEqual({ k: "redo" });
    expect(keyCommand({ key: "d", ctrlKey: true })).toEqual({ k: "duplicate" });
    expect(keyCommand({ key: "g", metaKey: true, shiftKey: true })).toEqual({
      k: "ungroup",
    });
    expect(keyCommand({ key: "]", metaKey: true })).toEqual({
      k: "z",
      how: "front",
    });
    expect(keyCommand({ key: "[" })).toEqual({ k: "z", how: "backward" });
    expect(keyCommand({ key: "Backspace" })).toEqual({ k: "delete" });
    expect(keyCommand({ key: "q" })).toBeNull();
  });
});
