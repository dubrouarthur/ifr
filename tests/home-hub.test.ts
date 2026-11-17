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
  it("the first quick flight is the free VFR flight, wherever the airport filter is (audit §24)", async () => {
    const { quickPool, catalog } = await load();
    const items = catalog();
    const free = quickPool(items, "free", "");
    expect(free.map((i) => i.sc?.id)).toEqual(["free"]);
    expect(quickPool(items, "free", "MSVL")).toEqual(free);
    const { readFileSync } = await import("fs");
    const fc = readFileSync("src/ui/flightcenter.ts", "utf8");
    expect(fc).toMatch(/p\.kind === "approach" \|\| p\.kind === "hold" \|\| p\.kind === "any" \? p\.kind : "free"/);
    const home = readFileSync("src/ui/home.ts", "utf8");
    expect(home).toMatch(/onclick: \(\) => o\.quickFly\("free", ""\)/);
    expect(home).toMatch(/kFree: \{ fr: "Voler librement \(VFR\)"/);
    expect(home).toMatch(/kAny: \{ fr: "Une procédure IFR au hasard"/);
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

describe("« Vos derniers vols » (audit §29)", () => {
  it("lists a flight stopped before it was graded, and one row per flight, newest first", async () => {
    const { recentEntries, catalog } = await load();
    const items = catalog();
    const free = items.find((i) => i.sc?.id === "free")!;
    const ils = items.find((i) => i.cat === "approaches" && i.ex)!;
    // no training record at all: the started flights still show
    const r = recentEntries([], [
      { id: free.id, at: "2026-11-16T10:05:00Z" },
      { id: ils.id, at: "2026-11-16T10:00:00Z" },
    ], items);
    expect(r.map((x) => x.item.id)).toEqual([free.id, ils.id]);
    expect(r.every((x) => x.verdict === "ungraded")).toBe(true);
    // a graded record of the same flight wins over its own start (clicked just before take-off)
    const att = { id: "1", date: "2026-11-16T10:00:20Z", student: "", scenario: ils.title, approach: "", mode: "training" as const, score: 82, grade: "B", acs: "PASS", failedTasks: [], failures: [], durationSec: 300, exercise: ils.id, passed: true };
    const r2 = recentEntries([att], [{ id: ils.id, at: "2026-11-16T10:00:00Z" }], items);
    expect(r2).toHaveLength(1);
    expect(r2[0].verdict).toBe("passed");
    // flown again later and stopped at once: the newer, ungraded row
    const r3 = recentEntries([att], [{ id: ils.id, at: "2026-11-16T11:00:00Z" }], items);
    expect(r3[0].verdict).toBe("ungraded");
    // a scenario record matches by its name
    const sc = { ...att, exercise: undefined, passed: undefined, scenario: free.sc!.name, graded: false };
    expect(recentEntries([sc], [], items)[0].item.id).toBe(free.id);
  });
});
