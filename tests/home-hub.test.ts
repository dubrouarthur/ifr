// Flight Center home hub: Quick start pools, the Continue card and relative dates.
import { describe, it, expect, beforeAll, beforeEach } from "vitest";

const mem = new Map<string, string>();
beforeAll(() => {
  // the catalog and the progress store read localStorage; the test environment has no DOM
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, String(v)),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    get length() {
      return mem.size;
    },
  } as Storage;
});
beforeEach(() => mem.clear());

const load = async () => {
  const fc = await import("../src/ui/flightcenter");
  const cat = await import("../src/ui/catalog");
  return { ...fc, ...cat };
};

describe("home hub", () => {
  it("Quick start draws approaches and holds, filtered by airport", async () => {
    const { quickPool, catalog } = await load();
    const items = catalog();
    const app = quickPool(items, "approach", "");
    const hold = quickPool(items, "hold", "");
    expect(app.length).toBeGreaterThan(5);
    expect(hold.length).toBeGreaterThan(3);
    expect(app.every((i) => i.cat === "approaches")).toBe(true);
    expect(hold.every((i) => i.sub === "Holdings")).toBe(true);
    const msvl = quickPool(items, "approach", "MSVL");
    expect(msvl.length).toBeGreaterThan(0);
    expect(msvl.every((i) => i.airport === "MSVL")).toBe(true);
    expect(quickPool(items, "hold", "XXXX")).toEqual([]);
  });

  it("Continue starts at lesson 1, then moves to the first lesson not passed", async () => {
    const { continueInfo, catalog } = await load();
    const { PATHS } = await import("../src/train/curriculum");
    const items = catalog();
    const fresh = continueInfo(items);
    expect(fresh.started).toBe(false);
    expect(fresh.lesson).toBe(1);
    expect(fresh.next?.id).toBe(PATHS[0].exercises[0]);
    expect(fresh.last).toBeNull();

    const [a, b] = PATHS[0].exercises;
    mem.set(
      "ifr.progress.v1",
      JSON.stringify({
        [a]: { passed: true, best: 90, attempts: 1, last: "" },
      }),
    );
    const later = continueInfo(items);
    expect(later.started).toBe(true);
    expect(later.passed).toBe(1);
    expect(later.next?.id).toBe(b);
    expect(later.lesson).toBe(2);
  });

  it("Continue names the last flight when it is in the catalogue", async () => {
    const { continueInfo, catalog } = await load();
    const { history } = await import("../src/ui/history");
    const items = catalog();
    const ex = items.find((i) => i.kind === "exercise")!;
    history.add({
      id: "t1",
      date: new Date().toISOString(),
      student: "",
      scenario: ex.title,
      approach: "",
      mode: "training",
      score: 80,
      grade: "",
      acs: "",
      failedTasks: [],
      failures: [],
      durationSec: 300,
      exercise: ex.id,
      exerciseTitle: ex.title,
      passed: true,
    });
    const ci = continueInfo(items);
    expect(ci.last?.item.id).toBe(ex.id);
    expect(ci.last?.when).toBe("today");
  });

  it("relative dates", async () => {
    const { ago } = await load();
    const now = Date.parse("2026-11-04T12:00:00Z");
    expect(ago("2026-11-04T08:00:00Z", now)).toBe("today");
    expect(ago("2026-11-03T08:00:00Z", now)).toBe("yesterday");
    expect(ago("2026-11-01T08:00:00Z", now)).toBe("3 days ago");
    expect(ago("2026-10-01T08:00:00Z", now)).toBe("1 Oct");
    expect(ago("not a date", now)).toBe("");
  });
});
