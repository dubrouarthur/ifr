import { describe, it, expect, afterEach } from "vitest";
import { introWanted, INTRO_SKIP_KEY } from "../src/ui/intro";

// a minimal localStorage for the intro's "skip" preference (the test environment has no DOM)
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: () => null,
  length: 0,
} as Storage;

const loc = (search = "", hash = "") => ({ search, hash });

describe("intro (start page)", () => {
  afterEach(() => mem.clear());

  it("shows at a normal launch", () => {
    expect(introWanted(loc(), {})).toBe(true);
  });

  it("is skipped when the user asked for it", () => {
    localStorage.setItem(INTRO_SKIP_KEY, "true");
    expect(introWanted(loc(), {})).toBe(false);
  });

  it("never covers a deep link into a flight", () => {
    expect(introWanted(loc("?scenario=ils27-vtf"), {})).toBe(false);
    expect(introWanted(loc("", "#circuit=abc"), {})).toBe(false);
    expect(introWanted(loc("?intro=0"), {})).toBe(false);
  });

  it("stays out of automated browsers unless forced", () => {
    expect(introWanted(loc(), { webdriver: true })).toBe(false);
    expect(introWanted(loc("?intro=1"), { webdriver: true })).toBe(true);
    localStorage.setItem(INTRO_SKIP_KEY, "true");
    expect(introWanted(loc("?intro=1"), {})).toBe(true);
  });

  it("is a welcome, not a gate: once per session, never on the way back from a course", () => {
    expect(introWanted(loc(), {}, "", true)).toBe(false);
    expect(
      introWanted(loc(), {}, "https://x.app/academy.html#play", false),
    ).toBe(false);
    expect(introWanted(loc(), {}, "https://x.app/academy.html", false)).toBe(
      false,
    );
    expect(introWanted(loc(), {}, "https://x.app/", false)).toBe(true);
  });
});

// ---------------------------------------------------------------- in-game controls (src/ui/viewDock.ts)
import {
  shellKeyIntent,
  nextLayout,
  lessonZone,
  lessonColumnW,
  layoutName,
  placePop,
  LAYOUTS,
  PANELS,
} from "../src/ui/viewDock";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("keyboard guard (Tab / Space / Enter in the chrome)", () => {
  const key = (
    k: string,
    o: Partial<{
      shift: boolean;
      inUi: boolean;
      kbdFocus: boolean;
      onPage: boolean;
    }> = {},
  ) =>
    shellKeyIntent({
      key: k,
      shift: false,
      inUi: false,
      kbdFocus: false,
      onPage: true,
      ...o,
    });

  it("Tab on the page changes the layout, Shift+Tab goes back", () => {
    expect(key("Tab")).toBe("layout-next");
    expect(key("Tab", { shift: true })).toBe("layout-prev");
  });

  it("Tab with the focus in the top bar (or any chrome) moves focus and never changes the layout", () => {
    expect(key("Tab", { inUi: true, onPage: false })).toBe("default");
    expect(
      key("Tab", { inUi: true, kbdFocus: true, onPage: false, shift: true }),
    ).toBe("default");
    // a keyboard-focused bezel key outside the chrome list: still a focus move
    expect(key("Tab", { kbdFocus: true, onPage: false })).toBe("default");
  });

  it("Space and Enter press a keyboard-focused button in the chrome; a mouse-clicked one keeps the brakes", () => {
    expect(key(" ", { inUi: true, kbdFocus: true, onPage: false })).toBe(
      "default",
    );
    expect(key("Enter", { inUi: true, kbdFocus: true, onPage: false })).toBe(
      "default",
    );
    expect(key(" ", { inUi: true, kbdFocus: false, onPage: false })).toBe(
      "pass",
    );
    expect(key(" ")).toBe("pass");
    expect(key("a", { inUi: true, kbdFocus: true })).toBe("pass");
  });
});

describe("screen layouts", () => {
  it("Tab cycles the four layouts forward and Shift+Tab backward", () => {
    expect(nextLayout("normal", 1)).toBe("big");
    expect(nextLayout("big", 1)).toBe("visual");
    expect(nextLayout("visual", 1)).toBe("none");
    expect(nextLayout("none", 1)).toBe("normal");
    expect(nextLayout("normal", -1)).toBe("none");
    expect(nextLayout("big", -1)).toBe("normal");
  });

  it("uses one set of names everywhere, and the instrument panels are honestly named", () => {
    expect(LAYOUTS.map((l) => l[1])).toEqual([
      "Standard",
      "Large view",
      "Immersive",
      "Instruments",
    ]);
    expect(layoutName("none")).toBe("Instruments");
    expect(PANELS.map((p) => p[0])).toEqual(["g1000", "steam", "airliner"]);
    // the airliner panel is a display style over the C172 model: it must not claim a 737
    expect(PANELS.map((p) => p[1] + p[2]).join(" ")).not.toMatch(/737|Boeing/);
  });
});

describe("lesson window zones", () => {
  const z = (o: Partial<Parameters<typeof lessonZone>[0]>) =>
    lessonZone({
      layout: "normal",
      lesson: true,
      empty: false,
      portrait: false,
      width: 1366,
      ...o,
    });

  it("docks a lesson as a column in Standard and Large view, a row in Instruments, a card in Immersive", () => {
    expect(z({})).toBe("column");
    expect(z({ layout: "big" })).toBe("column");
    expect(z({ layout: "none" })).toBe("row");
    expect(z({ layout: "visual" })).toBe("card");
  });

  it("is a strip in portrait and under 1000 px, floats when undocked, and frees its place when empty", () => {
    expect(z({ portrait: true })).toBe("strip");
    expect(z({ width: 900 })).toBe("strip");
    expect(z({ floating: true })).toBe("float");
    expect(z({ empty: true })).toBe("none");
    expect(z({ lesson: false })).toBe("card");
  });

  it("sizes the column clamp(320, 25vw, 380) — 340 at most on an iPad", () => {
    expect(lessonColumnW(1180, true)).toBe(320);
    expect(lessonColumnW(1440, false)).toBe(360);
    expect(lessonColumnW(1912, false)).toBe(380);
    expect(lessonColumnW(1500, true)).toBe(340);
  });
});

describe("shell source rules", () => {
  const main = readFileSync(resolve(__dirname, "../src/main.ts"), "utf8");
  it('Settings has no "," shortcut (comma is a rudder key)', () => {
    expect(main).not.toMatch(/case ',': settings\.open/);
  });
  it("the top bar no longer carries the cockpit switcher, the sound button or the logo pin", () => {
    expect(main).not.toMatch(/cockpitSeg|muteBtn|toggleChromePin|tb-handle/);
  });
  it("the shell never uses the browser's native confirm() or alert()", () => {
    expect(main).not.toMatch(/(^|[^.\w])(confirm|alert)\(/m);
    // the lesson End is confirmed inside the exercise window (in-app, never a browser dialog)
    const lw = readFileSync(
      resolve(__dirname, "../src/ui/lessonWindow.ts"),
      "utf8",
    );
    expect(lw).not.toMatch(/(^|[^.\w])(confirm|alert)\(/m);
    expect(lw).toMatch(/End this exercise/);
  });
  it("every camera is in the always-visible dock", () => {
    const dock = readFileSync(
      resolve(__dirname, "../src/ui/viewDock.ts"),
      "utf8",
    );
    for (const v of ["cockpit", "chase", "orbit", "tower", "flyby"])
      expect(dock).toContain(`${v}:`);
  });
});

describe("View panel placement", () => {
  it("opens above the dock when the whole panel fits there", () => {
    const p = placePop({ top: 600, bottom: 646 }, 480, 900, "up");
    expect(p.dir).toBe("up");
    expect(p.top).toBe(600 - 8 - 480);
  });
  it("a short outside view (laptop): never a panel that must scroll to show its sections", () => {
    // 1366x768: the dock tops out at 241 px, the panel is 480 px tall
    const p = placePop({ top: 241, bottom: 287 }, 480, 768, "up");
    expect(p.maxH).toBeGreaterThanOrEqual(480);
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + 480).toBeLessThanOrEqual(768 - 8);
  });
  it("the top bar View button opens downward", () => {
    const p = placePop({ top: 4, bottom: 40 }, 480, 900, "down");
    expect(p).toEqual({ top: 48, maxH: 900 - 40 - 16, dir: "down" });
  });
  it("a window shorter than the panel: as tall as the window, scrolling inside", () => {
    const p = placePop({ top: 300, bottom: 340 }, 900, 700, "up");
    expect(p.top).toBe(8);
    expect(p.maxH).toBe(684);
  });
});
