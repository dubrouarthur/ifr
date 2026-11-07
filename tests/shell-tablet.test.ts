// Shell on tablets / mouse-free: progressive keyboard yoke with adjustable sensitivity, the web-app manifest
// and the iOS meta tags of the simulator page.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BRAND } from "../src/brand";
import { kbAxisStep, KB_SENSITIVITY } from "../src/sim/input";

const mem = new Map<string, string>();
beforeAll(() => {
  const g = globalThis as unknown as { localStorage: Storage; window: unknown };
  g.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    get length() {
      return mem.size;
    },
  } as Storage;
  // InputManager listens for gamepads on window
  g.window ??= { addEventListener: () => {}, removeEventListener: () => {} };
});
beforeEach(() => mem.clear());

/** hold one key for `sec` seconds at 60 Hz; returns the deflection history */
function hold(
  sec: number,
  input: number,
  opts: { big?: boolean; sens?: number; v0?: number } = {},
) {
  const held: Record<string, number> = {};
  let v = opts.v0 ?? 0;
  const out: number[] = [];
  for (let t = 0; t < sec; t += 1 / 60) {
    v = kbAxisStep(v, input, !!opts.big, 1 / 60, opts.sens ?? 1, held, "roll");
    out.push(v);
  }
  return { v, out, held };
}

describe("keyboard yoke (progressive)", () => {
  it("a tap is a small nudge, a held key eases out to the limit", () => {
    const tap = hold(0.1, 1).v;
    const held = hold(2, 1).v;
    expect(tap).toBeGreaterThan(0);
    expect(tap).toBeLessThan(0.15);
    expect(held).toBeGreaterThan(0.45);
    expect(held).toBeLessThanOrEqual(0.5 * 1.25 + 1e-9);
  });

  it("is monotonic while held (no overshoot, no jerk)", () => {
    const { out } = hold(2, 1);
    for (let i = 1; i < out.length; i++)
      expect(out[i]).toBeGreaterThanOrEqual(out[i - 1] - 1e-12);
  });

  it("Shift gives full deflection", () => {
    expect(hold(2, 1, { big: true }).v).toBeGreaterThan(0.95);
  });

  it("eases back to neutral when released instead of snapping", () => {
    const held: Record<string, number> = { roll: 1 };
    let v = 0.5;
    v = kbAxisStep(v, 0, false, 1 / 60, 1, held, "roll");
    expect(v).toBeGreaterThan(0.4); // not snapped
    for (let i = 0; i < 60; i++)
      v = kbAxisStep(v, 0, false, 1 / 60, 1, held, "roll");
    expect(v).toBe(0); // neutral within a second
    expect(held.roll).toBe(0);
  });

  it("reversing passes neutral quickly", () => {
    const r = hold(0.25, -1, { v0: 0.5 });
    expect(r.v).toBeLessThan(0);
  });

  it("sensitivity scales how fast and how far the yoke moves", () => {
    const gentle = hold(0.5, 1, { sens: 0.6 }).v;
    const brisk = hold(0.5, 1, { sens: 1.4 }).v;
    expect(brisk).toBeGreaterThan(gentle * 1.3);
  });

  it("ignores a zero or negative time step", () => {
    const held: Record<string, number> = {};
    expect(kbAxisStep(0.3, 1, false, 0, 1, held, "pitch")).toBe(0.3);
    expect(kbAxisStep(0.3, 1, false, -0.01, 1, held, "pitch")).toBe(0.3);
    expect(Number.isNaN(kbAxisStep(0.3, 1, false, NaN, 1, held, "pitch"))).toBe(
      false,
    );
  });

  it("the sensitivity setting is clamped and persisted", async () => {
    const { InputManager } = await import("../src/sim/input");
    const a = new InputManager({ onAction: () => {} });
    expect(a.sensitivity).toBe(1);
    a.sensitivity = 9;
    expect(a.sensitivity).toBe(1.6);
    a.sensitivity = 1.4;
    expect(mem.get("ifr.kbSens")).toBe("1.4");
    const b = new InputManager({ onAction: () => {} });
    expect(b.sensitivity).toBe(1.4);
    expect(KB_SENSITIVITY.map((x) => x.label)).toEqual([
      "Gentle",
      "Normal",
      "Brisk",
    ]);
  });

  it("a held arrow key never deflects past the limit with the old linear ramp's 2.4/s spike", async () => {
    const { InputManager } = await import("../src/sim/input");
    const m = new InputManager({ onAction: () => {} });
    const c = {
      elevator: 0,
      aileron: 0,
      rudder: 0,
      throttle: 0.5,
      flaps: 0,
      trim: 0,
      brake: 0,
    };
    m.keys.add("ArrowRight");
    for (let i = 0; i < 120; i++) m.update(1 / 60, c as never, false);
    expect(c.aileron).toBeGreaterThan(0.4);
    expect(c.aileron).toBeLessThanOrEqual(0.625);
    m.keys.clear();
    for (let i = 0; i < 90; i++) m.update(1 / 60, c as never, false);
    expect(c.aileron).toBe(0);
  });
});

describe("installable web app", () => {
  const root = resolve(__dirname, "..");
  it("manifest is valid and full screen", () => {
    const m = JSON.parse(
      readFileSync(resolve(root, "public/manifest.webmanifest"), "utf8"),
    );
    expect(m.name).toBe(BRAND.name);
    expect(m.display).toBe("fullscreen");
    expect(m.start_url.startsWith("/")).toBe(true);
    expect(m.icons.length).toBeGreaterThan(0);
    for (const i of m.icons)
      expect(() =>
        readFileSync(resolve(root, "public", i.src.slice(1))),
      ).not.toThrow();
  });
  it("the simulator page links it and opts into the iOS web-app mode", () => {
    const html = readFileSync(resolve(root, "index.html"), "utf8");
    expect(html).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('name="apple-mobile-web-app-capable" content="yes"');
    expect(html).toContain("viewport-fit=cover");
  });
});

describe("step buttons: hold to repeat", () => {
  it("one step on press, a pause, then faster and faster", async () => {
    const { repeatSteps } = await import("../src/ui/knob");
    expect(repeatSteps(0)).toBe(0);
    expect(repeatSteps(379)).toBe(0);
    expect(repeatSteps(380)).toBe(1);
    expect(repeatSteps(1500)).toBeGreaterThanOrEqual(12);
    expect(repeatSteps(1500)).toBeLessThanOrEqual(22);
    const s3 = repeatSteps(3000);
    expect(s3).toBeGreaterThan(35);
    // monotonic
    let last = 0;
    for (let ms = 0; ms < 5000; ms += 7) {
      const n = repeatSteps(ms);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
  });
});

// ---------------------------------------------------------------- shell CSS contracts (X03, X18, pedestal)
describe("shell layout rules", () => {
  const css = (f: string) => readFileSync(resolve(__dirname, "../src/styles", f), "utf8");
  const all = ["ui-shell.css", "touch.css", "ui-pedestal.css", "ui-viewdock.css", "hotfix.css"].map(css).join("\n") + readFileSync(resolve(__dirname, "../src/styles.css"), "utf8");

  it("Instruments has four named rows, so a hidden MCP never squashes the autopilot bar", () => {
    expect(css("ui-shell.css")).toMatch(/\.cockpit\.no-otw \{\s*grid-template-rows: auto auto auto minmax\(0, 1fr\)/);
    expect(css("hotfix.css")).toMatch(/\.cockpit > \.afcs \{ grid-area: afcs; \}/);
    expect(readFileSync(resolve(__dirname, "../src/styles.css"), "utf8")).toContain("grid-template-areas: 'otw' 'mcp' 'afcs' 'panel'");
  });

  it("touch: 44 px softkeys, autopilot keys, view dock and pedestal controls", () => {
    expect(css("touch.css")).toMatch(/body\.touch \.softrow button \{\s*height: 44px/);
    expect(css("touch.css")).toMatch(/body\.touch \.afcs \.bkey,\s*html body\.touch \.afcs \.afcs-inc,\s*html body\.touch \.afcs \.afcs-val \{\s*height: 44px/);
    expect(css("ui-viewdock.css")).toMatch(/body\.touch \.view-dock \{\s*--vd-h: 44px/);
    expect(css("ui-pedestal.css")).toMatch(/html body\.touch \.footer\.pedestal \{\s*--pd-row: 52px;\s*--pd-ctl: 44px/);
  });

  it("the old pedestal rules are gone (one pedestal stylesheet)", () => {
    expect(all).not.toMatch(/\.ped-g\b|\.ped-t\b|\.flap-sel|\.chrono-b\b|\.ped-joy|\.brake-light|\.trim-wheel|\.lever-box|\.tb-handle/);
  });

  it("the auto-hidden top bar overlays the situation bar instead of pushing it down", () => {
    expect(all).not.toMatch(/chrome-auto:not\(\.chrome-hidden\) \{\s*--sb-top/);
  });
});
