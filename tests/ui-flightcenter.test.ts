import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  // the catalog reads saved circuits from localStorage; the test environment has no DOM
  (globalThis as unknown as { localStorage: Storage }).localStorage ??= {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
    key: () => null,
    length: 0,
  } as Storage;
});

const load = async () =>
  (await import("../src/ui/catalog")) as typeof import("../src/ui/catalog");

describe("Flight Center catalog", () => {
  it("every item belongs to a category and one of its sub-sections", async () => {
    const { catalog, CATEGORIES } = await load();
    for (const i of catalog()) {
      const c = CATEGORIES.find((x) => x.id === i.cat);
      expect(c, i.id).toBeTruthy();
      expect(c!.subs, `${i.id} sub "${i.sub}"`).toContain(i.sub);
    }
  });

  it("every item has a short procedure tag", async () => {
    const { catalog } = await load();
    for (const i of catalog()) {
      expect(i.tag, i.id).toMatch(/^[A-Z0-9 /·-]+$/);
      expect(i.tag.length, `${i.id} tag "${i.tag}"`).toBeLessThanOrEqual(20);
    }
  });

  it("approach tags name the procedure type (ILS, LOC, LDA, LOC BC, VOR/DME, NDB, RNAV)", async () => {
    const { catalog } = await load();
    const tag = (id: string) => catalog().find((i) => i.id === id)?.tag;
    expect(tag("app-ils-ap")).toBe("ILS");
    expect(tag("app-loc")).toBe("LOC");
    expect(tag("sc-loc27")).toBe("LOC");
    expect(tag("app-bc")).toBe("LOC BC");
    expect(tag("app-vor-arc")).toBe("VOR/DME");
    expect(tag("app-ndb-pt")).toBe("NDB");
    expect(tag("app-rnav-hilpt")).toBe("RNAV");
    expect(tag("hold-teardrop")).toBe("HOLD");
    expect(tag("nav-arc")).toBe("ARC");
  });

  it("sidebar titles are short enough not to truncate", async () => {
    const { CATEGORIES } = await load();
    for (const c of CATEGORIES) {
      expect(c.title.length, c.title).toBeLessThanOrEqual(18);
      for (const s of c.subs) expect(s.length, s).toBeLessThanOrEqual(28);
    }
  });
});
