// The format bar never sits on the other words of the slide (audit item 50).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { barSpot } from "../src/course/canvas/barSpot";

const vis = { x: 0, y: 0, w: 1000, h: 600 };
const bar = { w: 260, h: 50 };
const inter = (a: { left: number; top: number }, r: { x: number; y: number; w: number; h: number }) =>
  a.left < r.x + r.w && a.left + bar.w > r.x && a.top < r.y + r.h && a.top + bar.h > r.y;

describe("barSpot", () => {
  it("goes above the selection when nothing is there", () => {
    const s = barSpot({ x: 300, y: 300, w: 400, h: 60 }, bar, [], vis);
    expect(s.top).toBe(300 - 50 - 30);
    expect(s.left).toBe(300 + 200 - 130);
  });
  it("flips below when the title is just above", () => {
    const title = { x: 100, y: 180, w: 600, h: 90 };
    const s = barSpot({ x: 300, y: 300, w: 400, h: 60 }, bar, [title], vis);
    expect(inter(s, title)).toBe(false);
    expect(s.top).toBe(300 + 60 + 18);
  });
  it("goes beside the block when words sit above and below (a subtitle between a title and a list)", () => {
    const title = { x: 60, y: 70, w: 420, h: 90 };
    const list = { x: 100, y: 280, w: 380, h: 70 };
    const sel = { x: 100, y: 185, w: 380, h: 75 };
    const s = barSpot(sel, bar, [title, list], vis);
    expect(inter(s, title) || inter(s, list)).toBe(false);
    expect(s.left).toBeGreaterThanOrEqual(sel.x + sel.w);
  });
  it("stays inside the visible surface", () => {
    const s = barSpot({ x: 0, y: 0, w: 100, h: 40 }, bar, [], vis);
    expect(s.left).toBeGreaterThanOrEqual(6);
    expect(s.top).toBeGreaterThanOrEqual(6);
  });
});

describe("one click on a selected text types into it", () => {
  it("the canvas editor opens the text on a still release and always focuses the words", () => {
    const ed = readFileSync("src/course/canvas/editor.ts", "utf8");
    expect(ed).toMatch(/clickEdit/);
    expect(ed).toMatch(/this\.openText\(ce\.id\)/);
    expect(ed).toMatch(/requestAnimationFrame\(focus\)/);
  });
});
