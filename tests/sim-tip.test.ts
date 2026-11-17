// The editor's first-run tips (audit item 39 + the « Vos diapos volent » overlap): the Simulateur card sits beside the
// rail where it covers none of the slide's words, and an Escape typed while writing a text never closes it.
import { describe, expect, it } from "vitest";
import { aboveSpot, clearSpot, clearTop, writing } from "../src/course/ui/simTip";

const bounds = { top: 64, bottom: 892 };
const tab = { top: 262, bottom: 324 };

describe("aboveSpot", () => {
  it("stands above a phone's bottom tab, inside the screen (390 × 844)", () => {
    const a = aboveSpot({ left: 200, right: 270, top: 780 }, 270, 150, 390);
    expect(a.left).toBeGreaterThanOrEqual(8);
    expect(a.left + 270).toBeLessThanOrEqual(382);
    expect(a.top + 150).toBeLessThanOrEqual(780 - 12);
  });
});

describe("clearSpot", () => {
  it("keeps clear of the lead line by a margin, never touching it (1440 × 900, PPL cover)", () => {
    const pad = (b: { left: number; top: number; right: number; bottom: number }) => ({
      left: b.left - 16,
      top: b.top - 16,
      right: b.right + 16,
      bottom: b.bottom + 16,
    });
    const lead = { left: 176, top: 477, right: 562, bottom: 535 };
    const words = [
      { left: 176, top: 203, right: 550, bottom: 219 },
      { left: 176, top: 282, right: 562, bottom: 460 },
      lead,
      { left: 749, top: 651, right: 1048, bottom: 697 },
    ].map(pad);
    const spot = clearSpot(tab, 316, 150, 89, words, bounds, 1432)!;
    expect(spot).not.toBeNull();
    expect(spot.top >= lead.bottom + 16 || spot.top + 150 <= lead.top - 16 || spot.left >= lead.right + 16).toBe(true);
  });
  it("moves right when the column beside the rail has no clear place", () => {
    const column = [{ left: 0, top: 0, right: 500, bottom: 2000 }];
    const spot = clearSpot(tab, 316, 150, 89, column, bounds, 1432)!;
    expect(spot.left).toBeGreaterThanOrEqual(500);
    expect(clearSpot(tab, 316, 150, 89, [{ left: 0, top: 0, right: 2000, bottom: 2000 }], bounds, 1432)).toBeNull();
  });
});

describe("clearTop", () => {
  it("centres the card on the rail tab when nothing is in the way", () => {
    expect(clearTop(tab, 316, 150, 89, [], bounds)).toBe(218);
  });

  it("moves the card off the slide's words, to the nearest clear place", () => {
    // the cover of the PPL template at 1440 × 900: title, lead line, small note far right
    const words = [
      { left: 175, top: 199, right: 550, bottom: 216 },
      { left: 175, top: 278, right: 563, bottom: 457 },
      { left: 175, top: 474, right: 563, bottom: 532 },
      { left: 750, top: 649, right: 1050, bottom: 695 },
    ];
    const top = clearTop(tab, 316, 150, 89, words, bounds)!;
    expect(top).not.toBeNull();
    const card = { left: 89, top, right: 405, bottom: top + 150 };
    for (const b of words)
      expect(
        card.left < b.right &&
          b.left < card.right &&
          card.top < b.bottom &&
          b.top < card.bottom,
      ).toBe(false);
    expect(card.bottom).toBeLessThanOrEqual(bounds.bottom);
  });

  it("gives up (null) when no place in the window is clear", () => {
    const wall = [{ left: 0, top: 0, right: 2000, bottom: 2000 }];
    expect(clearTop(tab, 316, 150, 89, wall, bounds)).toBeNull();
  });
});

describe("writing", () => {
  const el = (tagName: string, extra: Record<string, unknown> = {}) =>
    ({ tagName, ...extra }) as unknown as Element;
  it("is true in a text being written", () => {
    expect(writing(el("TEXTAREA"))).toBe(true);
    expect(writing(el("INPUT", { type: "text" }))).toBe(true);
    expect(writing(el("DIV", { isContentEditable: true }))).toBe(true);
  });
  it("is false elsewhere", () => {
    expect(writing(null)).toBe(false);
    expect(writing(el("DIV"))).toBe(false);
    expect(writing(el("INPUT", { type: "checkbox" }))).toBe(false);
    expect(writing(el("BUTTON"))).toBe(false);
  });
});
