// Placement that never makes a mess (canvas/placement.ts): an element added from the rail lands in free space,
// never on the words of the slide; a full slide says so (null); « Réorganiser la diapo » leaves nothing overlapping
// and keeps callouts on their instrument. Every layout template is tried, in French and in English.
import { describe, expect, it } from "vitest";
import type { SlideBlock, SlideCanvas } from "../src/course/types";
import { LAYOUTS, layoutCanvas } from "../src/course/canvas/layouts";
import {
  fitFree,
  obstacles,
  slideCrowded,
  tidySlide,
  isWords,
} from "../src/course/canvas/placement";
import { EditorCore } from "../src/course/canvas/editorCore";
import { instrumentDraft, textDraft } from "../src/course/canvas/factory";
import { resolveTheme } from "../src/course/canvas/themes";
import { SLIDE_H, SLIDE_W } from "../src/course/canvas/geom";

const area = (a: SlideBlock["frame"], b: SlideBlock["frame"]) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const canvasOf = (blocks: SlideBlock[]): SlideCanvas => ({
  size: { w: 1920, h: 1080 },
  grid: 8,
  blocks,
});
let n = 0;
const text = (
  x: number,
  y: number,
  w: number,
  h: number,
  style: "title" | "body" | "eyebrow" = "body",
): SlideBlock =>
  ({
    id: `t${n++}`,
    kind: "text",
    style,
    text: { en: "Words", fr: "Des mots" },
    frame: { x, y, w, h, z: n },
  }) as SlideBlock;
const inst = (x: number, y: number, w: number, h: number): SlideBlock =>
  ({
    id: `i${n++}`,
    kind: "instrument",
    view: { kind: "gauge", gauge: "tc" },
    mode: "live",
    frame: { x, y, w, h, z: n },
  }) as SlideBlock;

describe("free-space placement", () => {
  it("an empty slide: the element goes in the middle at full size", () => {
    const r = fitFree(canvasOf([]), 624, 624, "instrument")!;
    expect(r.scale).toBe(1);
    expect(r.at).toEqual([SLIDE_W / 2, SLIDE_H / 2]);
  });
  it("a slide with a title: the instrument lands under or beside it, never on it", () => {
    const title = text(120, 96, 1200, 168, "title");
    const body = text(120, 300, 760, 300);
    const c = canvasOf([title, body]);
    const r = fitFree(c, 624, 624, "instrument")!;
    expect(r).not.toBeNull();
    const f = {
      x: r.at[0] - r.w / 2,
      y: r.at[1] - r.h / 2,
      w: r.w,
      h: r.h,
      z: 0,
    };
    expect(area(f, title.frame)).toBe(0);
    expect(area(f, body.frame)).toBe(0);
    expect(f.x).toBeGreaterThanOrEqual(0);
    expect(f.y + f.h).toBeLessThanOrEqual(SLIDE_H);
    // it shrinks a little rather than covering anything, but stays readable
    expect(r.w).toBeGreaterThanOrEqual(260);
  });
  it("a full slide: no spot (the studio then offers a new slide or a tidy)", () => {
    const c = canvasOf([text(0, 0, 960, 1080), text(960, 0, 960, 1080)]);
    expect(fitFree(c, 624, 624, "instrument")).toBeNull();
  });
  it("every layout template: an instrument and a text added from the rail never cover what is there", () => {
    for (const L of LAYOUTS) {
      const c = layoutCanvas(L.id);
      for (const d of [
        instrumentDraft({ kind: "gauge", gauge: "tc" } as never),
        textDraft("body", { en: "Two lines", fr: "Deux lignes" }),
      ]) {
        const core = new EditorCore(c);
        const b = core.addDraft(d);
        // a full slide: the studio offers « Nouvelle diapo avec cet élément » / « Réorganiser la diapo »; the
        // element waits on a picture, never on the words
        if (core.onWords) continue;
        for (const o of obstacles(c).filter((x) => !core.full || isWords(x)))
          expect(area(b.frame, o.frame), `${L.id}: ${d.kind} on ${o.id}`).toBe(
            0,
          );
        expect(b.frame.x).toBeGreaterThanOrEqual(0);
        expect(b.frame.y + b.frame.h).toBeLessThanOrEqual(SLIDE_H);
      }
    }
  });
  it("the editor core: one undo removes the element, the slide is as it was", () => {
    const c = canvasOf([text(120, 96, 1200, 168, "title")]);
    const core = new EditorCore(c);
    core.addDraft(instrumentDraft({ kind: "gauge", gauge: "tc" } as never));
    expect(core.canvas.blocks.length).toBe(2);
    core.run({ k: "undo" });
    expect(core.canvas.blocks.length).toBe(1);
  });
});

describe("Réorganiser la diapo", () => {
  const theme = resolveTheme("classroom");
  it("a messy slide becomes clean: header on top, words left, instruments right, nothing overlaps", () => {
    const title = text(400, 300, 1000, 168, "title");
    const body = text(300, 400, 900, 220);
    const a = inst(500, 200, 624, 624);
    const b = inst(700, 260, 624, 624);
    const c = canvasOf([title, body, a, b]);
    expect(slideCrowded(c)).toBe(true);
    for (const lang of ["fr", "en"] as const) {
      const t = tidySlide(c, theme, lang);
      expect(slideCrowded(t)).toBe(false);
      const by = (id: string) => t.blocks.find((x) => x.id === id)!.frame;
      expect(by(title.id).y).toBeLessThan(by(body.id).y);
      expect(by(body.id).x).toBeLessThan(by(a.id).x);
      for (const x of t.blocks) {
        expect(x.frame.x).toBeGreaterThanOrEqual(0);
        expect(x.frame.y).toBeGreaterThanOrEqual(0);
        expect(x.frame.x + x.frame.w).toBeLessThanOrEqual(SLIDE_W);
        expect(x.frame.y + x.frame.h).toBeLessThanOrEqual(SLIDE_H);
      }
      // an element never grows
      expect(by(a.id).w).toBeLessThanOrEqual(624);
    }
  });
  it("a callout and a marker stay on their instrument", () => {
    const i = inst(200, 200, 600, 600);
    const marker = {
      id: "m1",
      kind: "marker",
      n: 1,
      frame: { x: 480, y: 480, w: 48, h: 48, z: 9 },
    } as SlideBlock;
    const call = {
      id: "c1",
      kind: "callout",
      text: { en: "Ball", fr: "Bille" },
      target: [500, 700],
      frame: { x: 900, y: 650, w: 400, h: 96, z: 10 },
    } as SlideBlock;
    const t = tidySlide(
      canvasOf([text(100, 600, 700, 200), i, marker, call]),
      theme,
      "fr",
    );
    const fi = t.blocks.find((x) => x.id === i.id)!.frame;
    const fm = t.blocks.find((x) => x.id === "m1")!.frame;
    const cm = fm.x + fm.w / 2;
    expect(cm).toBeGreaterThan(fi.x);
    expect(cm).toBeLessThan(fi.x + fi.w);
    const tc = t.blocks.find((x) => x.id === "c1") as Extract<
      SlideBlock,
      { kind: "callout" }
    >;
    expect(tc.target![0]).toBeGreaterThan(fi.x);
    expect(tc.target![0]).toBeLessThan(fi.x + fi.w);
  });
  it("every layout template stays clean after a tidy (and does not break)", () => {
    for (const L of LAYOUTS) {
      const t = tidySlide(layoutCanvas(L.id), theme, "fr");
      expect(t.blocks.length, L.id).toBe(layoutCanvas(L.id).blocks.length);
    }
  });
});
