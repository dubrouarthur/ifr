// Exercise window: the pure geometry and state rules (placement that never covers the instruments, clamping to
// the viewport, snapping back to the dock, per-layout persistence, auto-expand). The DOM behaviour is checked by
// the Playwright harness (scratchpad/uxwave/lessonwin).
import { describe, it, expect } from "vitest";
import {
  lessonWinKey,
  readWinState,
  defaultWinState,
  clampRect,
  placeFloating,
  overlapArea,
  shouldSnap,
  resizeRect,
  enlargedRect,
  expandReason,
  lessonStatus,
  stepLabel,
  LW_MARGIN,
  LW_MIN_W,
  LW_MIN_H,
  LW_PILL_H,
  pillWidth,
  type LessonView,
  type Rect,
} from "../src/ui/lessonWindow";

const view = (o: Partial<LessonView> = {}): LessonView => ({
  step: 0,
  steps: 3,
  instruction: "Fly heading 270",
  time: 12,
  ...o,
});
const inside = (r: Rect, vp: { w: number; h: number }, top = LW_MARGIN) =>
  r.x >= LW_MARGIN &&
  r.y >= top &&
  r.x + r.w <= vp.w - LW_MARGIN &&
  r.y + r.h <= vp.h - LW_MARGIN;

// 1440x900 Standard: situation bar 0–44, outside view to 380, autopilot bar 380–434, PFD and MFD screens below
const VP = { w: 1440, h: 900 };
const AFCS: Rect = { x: 0, y: 380, w: 1440, h: 54 };
const PFD: Rect = { x: 120, y: 470, w: 560, h: 380 };
const MFD: Rect = { x: 760, y: 470, w: 560, h: 380 };
const AVOID = [AFCS, PFD, MFD];

describe("lesson window: persistence", () => {
  it("keeps one state per layout, and a separate one for the portrait strip", () => {
    expect(lessonWinKey("normal", "column")).toBe("ifr.lessonWin.v1.normal");
    expect(lessonWinKey("none", "row")).toBe("ifr.lessonWin.v1.none");
    expect(lessonWinKey("big", "column")).not.toBe(
      lessonWinKey("visual", "card"),
    );
    expect(lessonWinKey("normal", "strip")).toBe(
      "ifr.lessonWin.v1.normal.strip",
    );
    expect(lessonWinKey("", "column")).toBe("ifr.lessonWin.v1.normal");
  });

  it("sanitises a stored state (garbage, wrong types, tiny sizes)", () => {
    expect(readWinState(null)).toEqual(defaultWinState());
    expect(readWinState("x")).toEqual(defaultWinState());
    expect(
      readWinState({
        float: "yes",
        x: "a",
        y: NaN,
        w: 10,
        h: 5,
        collapsed: 1,
        enlarged: true,
      }),
    ).toEqual({
      float: false,
      x: null,
      y: null,
      w: LW_MIN_W,
      h: LW_MIN_H,
      collapsed: null,
      enlarged: true,
    });
    expect(
      readWinState({
        float: true,
        x: 40,
        y: 60,
        w: 420,
        h: null,
        collapsed: true,
      }),
    ).toMatchObject({
      float: true,
      x: 40,
      y: 60,
      w: 420,
      h: null,
      collapsed: true,
    });
  });
});

describe("lesson window: geometry", () => {
  it("clamps a window inside the viewport, under the top inset, at least the minimum size", () => {
    const top = 52;
    const r = clampRect({ x: -200, y: -50, w: 100, h: 60 }, VP, top);
    expect(r).toEqual({ x: LW_MARGIN, y: top, w: LW_MIN_W, h: LW_MIN_H });
    const far = clampRect({ x: 5000, y: 5000, w: 400, h: 300 }, VP, top);
    expect(inside(far, VP, top)).toBe(true);
    expect(far.w).toBe(400);
    // larger than the screen: it shrinks to fit
    const big = clampRect(
      { x: 0, y: 0, w: 4000, h: 4000 },
      { w: 820, h: 1180 },
      top,
    );
    expect(big.w).toBe(820 - 2 * LW_MARGIN);
    expect(big.y + big.h).toBe(1180 - LW_MARGIN);
  });

  it("keeps the wanted place when it covers no instrument", () => {
    const want = { x: 20, y: 60, w: 380, h: 300 };
    expect(placeFloating(want, VP, AVOID, 52)).toEqual(want);
  });

  it("never covers the PFD, the MFD or the autopilot bar by default", () => {
    const want = { x: 200, y: 300, w: 380, h: 300 }; // would sit on the AFCS bar and the PFD
    const r = placeFloating(want, VP, AVOID, 52);
    for (const a of AVOID) expect(overlapArea(r, a)).toBe(0);
    expect(inside(r, VP, 52)).toBe(true);
    // the free band above the autopilot bar is 52–372: the window gets shorter rather than cover the instruments
    const tall = placeFloating({ x: 20, y: 60, w: 380, h: 600 }, VP, AVOID, 52);
    for (const a of AVOID) expect(overlapArea(tall, a)).toBe(0);
    expect(tall.h).toBeGreaterThanOrEqual(LW_MIN_H);
    expect(tall.h).toBeLessThan(600);
  });

  it("uses the free room beside the screens when there is some (iPad landscape, wide gutters)", () => {
    const vp = { w: 1180, h: 820 };
    const afcs = { x: 0, y: 300, w: 1180, h: 54 };
    const pfd = { x: 40, y: 370, w: 520, h: 400 };
    const r = placeFloating(
      { x: 40, y: 330, w: 340, h: 420 },
      vp,
      [afcs, pfd],
      52,
    );
    for (const a of [afcs, pfd]) expect(overlapArea(r, a)).toBe(0);
    expect(inside(r, vp, 52)).toBe(true);
  });

  it("falls back to the least-covering place when the screen is full of instruments", () => {
    const vp = { w: 600, h: 400 };
    const r = placeFloating(
      { x: 10, y: 10, w: 300, h: 200 },
      vp,
      [{ x: 0, y: 0, w: 600, h: 400 }],
      8,
    );
    expect(inside(r, vp)).toBe(true);
    expect(r.h).toBe(LW_MIN_H);
  });

  it("iPad portrait: no free room for a window, but the one-line pill fits the band above the autopilot bar", () => {
    // 820x1180: situation bar 0–94, outside view to 177, autopilot bar 177–231, PFD and MFD, pedestal from 1000
    const vp = { w: 820, h: 1180 };
    const avoid: Rect[] = [
      { x: 0, y: 177, w: 820, h: 54 },
      { x: 201, y: 258, w: 417, h: 313 },
      { x: 201, y: 641, w: 417, h: 313 },
      { x: 0, y: 1000, w: 820, h: 180 },
    ];
    const top = 102;
    const win = placeFloating({ x: 8, y: top, w: 380, h: 400 }, vp, avoid, top);
    expect(avoid.some((a) => overlapArea(win, a) > 0)).toBe(true);
    const pw = pillWidth(380, vp);
    expect(pw).toBe(440);
    const pill = placeFloating(
      { x: 8, y: top, w: pw, h: LW_PILL_H },
      vp,
      avoid,
      top,
      LW_PILL_H,
    );
    for (const a of avoid) expect(overlapArea(pill, a)).toBe(0);
    expect(pill.y).toBe(top);
    expect(pill.h).toBe(LW_PILL_H);
  });

  it("the pill is 440–520 px wide and fits a narrow viewport", () => {
    expect(pillWidth(300, { w: 1440, h: 900 })).toBe(440);
    expect(pillWidth(480, { w: 1440, h: 900 })).toBe(480);
    expect(pillWidth(700, { w: 1440, h: 900 })).toBe(520);
    expect(pillWidth(380, { w: 400, h: 800 })).toBe(400 - 2 * LW_MARGIN);
  });

  it("resizing keeps the top-left corner and stops at the viewport edge", () => {
    const r = { x: 400, y: 100, w: 380, h: 300 };
    expect(resizeRect(r, 460, 380, VP)).toEqual({ x: 400, y: 100, w: 460, h: 380 });
    expect(resizeRect(r, 5000, 5000, VP)).toEqual({ x: 400, y: 100, w: VP.w - 400 - LW_MARGIN, h: VP.h - 100 - LW_MARGIN });
    expect(resizeRect(r, 10, 10, VP)).toEqual({ x: 400, y: 100, w: LW_MIN_W, h: LW_MIN_H });
  });

  it("snaps back to the dock when dropped near it", () => {
    const dock = { x: 0, y: 44, w: 340, h: 336 };
    expect(shouldSnap({ x: 12, y: 60, w: 380, h: 300 }, dock)).toBe(true);
    expect(shouldSnap({ x: 200, y: 60, w: 380, h: 300 }, dock)).toBe(false);
    expect(shouldSnap({ x: 0, y: 44, w: 1, h: 1 }, null)).toBe(false);
    expect(
      shouldSnap({ x: 0, y: 44, w: 1, h: 1 }, { x: 0, y: 44, w: 0, h: 0 }),
    ).toBe(false);
  });

  it("the enlarged window is a large reading size inside the viewport at every size", () => {
    for (const vp of [
      VP,
      { w: 1366, h: 768 },
      { w: 1180, h: 820 },
      { w: 820, h: 1180 },
    ]) {
      const r = enlargedRect(vp, 52);
      expect(inside(r, vp, 52)).toBe(true);
      expect(r.w).toBeGreaterThanOrEqual(Math.min(820, vp.w - 32));
      expect(r.h).toBeGreaterThan(400);
    }
  });
});

describe("lesson window: attention and status", () => {
  it("expands on the first step and on every new step, not on every tick", () => {
    let r = expandReason(null, view());
    expect(r.reason).toBe("step");
    r = expandReason(r.next, view({ time: 13, readout: "PA 4.1 NM" }));
    expect(r.reason).toBe(null);
    r = expandReason(r.next, view({ step: 1 }));
    expect(r.reason).toBe("step");
    r = expandReason(r.next, view({ step: 1, finished: true }));
    expect(r.reason).toBe("step");
  });

  it("expands when a setup item that was done turns red, not for items still to do", () => {
    const s = (nav: boolean | null, cdi: boolean) =>
      view({
        setup: [
          { label: "NAV1 110.30", ok: nav },
          { label: "CDI on NAV1", ok: cdi },
          { label: "Entry: Direct", ok: null },
        ],
      });
    let r = expandReason(null, s(false, false));
    r = expandReason(r.next, s(false, false));
    expect(r.reason).toBe(null);
    r = expandReason(r.next, s(true, false)); // the student tuned NAV1
    expect(r.reason).toBe(null);
    r = expandReason(r.next, s(false, false)); // and changed it again: red
    expect(r.reason).toBe("setup");
  });

  it("status: a deviation first, then complete, then setup to do", () => {
    expect(lessonStatus(view({ violation: "Altitude 3180 ft (±100)" }))).toBe(
      "bad",
    );
    expect(lessonStatus(view({ violation: "x", quiet: true }))).toBe("ok");
    expect(lessonStatus(view({ finished: true }))).toBe("done");
    expect(lessonStatus(view({ setup: [{ label: "a", ok: false }] }))).toBe(
      "todo",
    );
    expect(
      lessonStatus(
        view({
          setup: [
            { label: "a", ok: true },
            { label: "b", ok: null },
          ],
        }),
      ),
    ).toBe("ok");
  });

  it("step labels", () => {
    expect(stepLabel(view({ step: 1, steps: 5 }))).toBe("Step 2 of 5");
    expect(stepLabel(view({ step: 1, steps: 5 }), true)).toBe("2/5");
    expect(stepLabel(view({ steps: 1 }))).toBe("Exercise");
    expect(stepLabel(view({ finished: true }))).toBe("Exercise complete");
  });
});
