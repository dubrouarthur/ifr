import { describe, it, expect } from "vitest";
import {
  builtinItem,
  groupItems,
  matchItem,
  type ChartItem,
} from "../src/ui/charts";
import { mss, taf } from "../src/ui/efb";
import { chartIndex } from "../src/plates/plates";
import { Cdu, COLS } from "../src/avionics/cdu";
import { Sim } from "../src/sim/sim";

const item = (p: Partial<ChartItem>): ChartItem => ({
  key: "X",
  cat: "APP",
  airport: "KXXX",
  index: "",
  title: "",
  ident: "",
  tag: "",
  group: "",
  detail: "",
  rank: 0,
  ...p,
});

describe("EFB chart list (Navigraph-style classification)", () => {
  it("classifies every built-in chart as REF, DEP, ARR or APP", () => {
    const items = chartIndex().map(builtinItem);
    expect(items.length).toBeGreaterThan(0);
    for (const it of items)
      expect(["REF", "DEP", "ARR", "APP"]).toContain(it.cat);
    const apd = items.find((x) => x.key === "PARD-APD")!;
    expect(apd.cat).toBe("REF");
    expect(apd.index).toBe("10-9");
    const ils = items.find((x) => x.key === "PARD-I27")!;
    expect(ils.cat).toBe("APP");
    expect(ils.group).toBe("RWY 27");
    expect(ils.ident).toBe("I27");
    expect(ils.tag).toBe("ILS");
  });

  it("groups approaches by runway, ILS before LOC before RNAV before VOR/NDB, circling last", () => {
    const g = groupItems([
      item({ key: "a", title: "VOR RWY 28R", group: "RWY 28R", rank: 5 }),
      item({
        key: "b",
        title: "RNAV (GPS) RWY 28R",
        group: "RWY 28R",
        rank: 4,
      }),
      item({ key: "c", title: "ILS RWY 28R", group: "RWY 28R", rank: 0 }),
      item({ key: "d", title: "VOR-A", group: "Circling", rank: 5 }),
      item({ key: "e", title: "ILS RWY 28L", group: "RWY 28L", rank: 0 }),
      item({
        key: "f",
        title: "RNAV (GPS) RWY 01R",
        group: "RWY 01R",
        rank: 4,
      }),
      item({ key: "g", title: "LOC RWY 28R", group: "RWY 28R", rank: 1 }),
    ]);
    expect(g.map((x) => x.head)).toEqual([
      "RWY 01R",
      "RWY 28L",
      "RWY 28R",
      "Circling",
    ]);
    expect(g[2].items.map((x) => x.key)).toEqual(["c", "g", "b", "a"]);
  });

  it("filters on every word of the query", () => {
    const ils = item({
      title: "ILS or LOC RWY 27",
      ident: "I27",
      tag: "ILS",
      group: "RWY 27",
    });
    expect(matchItem(ils, "ils 27")).toBe(true);
    expect(matchItem(ils, "ILS 09")).toBe(false);
    expect(
      matchItem(
        item({
          cat: "DEP",
          title: "SSTIK FIVE DEPARTURE (RNAV)",
          ident: "SSTIK5",
        }),
        "sstik",
      ),
    ).toBe(true);
  });
});

describe("EFB pages", () => {
  it("never prints 2:60", () => {
    expect(mss(179.6)).toBe("3:00");
    expect(mss(59.5)).toBe("1:00");
    expect(mss(61)).toBe("1:01");
  });

  it("writes a TAF with a validity period and a BECMG time group", () => {
    const sim = new Sim();
    const t = taf("PARD", sim, new Date(Date.UTC(2026, 10, 3, 14, 20)));
    expect(t).toMatch(/^TAF PARD 031430Z 0315\/0415 /);
    expect(t).toMatch(/ BECMG 0320\/0322 /);
  });
});

describe("CDU display", () => {
  it("keeps every line inside the 24-column grid", () => {
    const cdu = new Cdu(new Sim());
    for (const p of [
      "MENU",
      "INIT REF",
      "RTE",
      "LEGS",
      "DEP ARR",
      "HOLD",
      "PROG",
    ] as const) {
      cdu.press(p);
      const lines = cdu.screen();
      expect(lines.length).toBe(14);
      for (const ln of lines)
        for (const seg of ln) {
          const start = seg.right
            ? COLS - seg.t.length
            : seg.center
              ? 0
              : (seg.at ?? 0);
          expect(start).toBeGreaterThanOrEqual(0);
          expect(start + seg.t.length).toBeLessThanOrEqual(COLS);
        }
    }
  });

  it("shows a page count on the RTE and LEGS titles", () => {
    const cdu = new Cdu(new Sim());
    for (const p of ["RTE", "LEGS"] as const) {
      cdu.press(p);
      const title = cdu.screen()[0];
      expect(title.some((s) => /^\d+\/\d+$/.test(s.t))).toBe(true);
    }
  });
});
