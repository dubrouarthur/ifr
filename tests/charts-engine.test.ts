// Chart engine: every chart of the training region and of a real-world region (KSFO / KSJC, FAA CIFP approaches,
// SIDs and STARs) renders as well-formed SVG, every leg / hold / arc carries its course label, and no two labels
// placed by the layout engine overlap.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import {
  chartIndex,
  lastLayout,
  _internal,
  type LayoutReport,
} from "../src/plates/plates";
import { procTitle, rwyName, isRnav } from "../src/plates/terminal";
import { approach } from "../src/nav/data";

/** minimal XML well-formedness check: balanced tags, quoted attributes, escaped ampersands */
function wellFormed(svg: string): string | null {
  const stack: string[] = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const between = svg.slice(last, m.index);
    if (between.includes("<"))
      return `unparsed tag near: ${between.slice(between.indexOf("<"), between.indexOf("<") + 60)}`;
    if (/&(?!amp;|lt;|gt;|quot;|#\d+;)/.test(between))
      return `raw & in text: ${between.slice(0, 60)}`;
    last = re.lastIndex;
    const [, close, name, , self] = m;
    if (self) continue;
    if (close) {
      if (stack.pop() !== name) return `mismatched </${name}>`;
    } else stack.push(name);
  }
  if (svg.slice(last).includes("<")) return "trailing tag";
  return stack.length ? `unclosed <${stack[stack.length - 1]}>` : null;
}

function overlapping(rep: LayoutReport): string[] {
  const out: string[] = [];
  const L = rep.labels;
  for (let i = 0; i < L.length; i++)
    for (let j = i + 1; j < L.length; j++)
      if (_internal.polysOverlap(L[i].poly, L[j].poly))
        out.push(`"${L[i].text}" × "${L[j].text}"`);
  return out;
}

function checkChart(id: string, render: () => string) {
  const svg = render();
  const rep = lastLayout();
  expect(svg.startsWith("<svg"), id).toBe(true);
  expect(wellFormed(svg), id).toBeNull();
  expect(svg, id).not.toContain("NaN");
  expect(svg, id).not.toContain("undefined");
  expect(svg, id).not.toMatch(/\d:60\b/);
  const unlabelled = rep.legs.filter((l) => !l.label).map((l) => l.id);
  expect(unlabelled, `${id}: legs without a course label`).toEqual([]);
  expect(overlapping(rep), `${id}: overlapping labels`).toEqual([]);
  return { svg, rep };
}

describe("charts engine — training region", () => {
  const charts = chartIndex();
  it("indexes every approach and diagram with stable ids", () => {
    const ids = charts.map((c) => c.id);
    for (const id of [
      "PARD-APD",
      "MSVL-APD",
      "PARD-I27",
      "PARD-R09",
      "PARD-B09",
      "PARD-N27",
      "PARD-L36",
      "MSVL-V21",
      "MSVL-R03",
      "MSVL-I03",
    ])
      expect(ids).toContain(id);
    expect(charts.find((c) => c.id === "PARD-I27")!.index).toBe("11-1");
    expect(charts.find((c) => c.id === "PARD-R09")!.group).toBe("RNAV");
    expect(charts.find((c) => c.id === "PARD-B09")!.group).toBe("LOC");
  });
  for (const c of charts)
    it(`renders ${c.id} cleanly`, () => {
      const { svg, rep } = checkChart(c.id, c.render);
      if (c.kind === "IAP") {
        const ap = approach(c.approachId!);
        // a course label on every drawn leg of every transition, the final and the missed approach
        expect(rep.legs.length).toBeGreaterThan(2);
        for (const h of [...ap.missed, ...ap.final].filter((l) => l.hold))
          expect(rep.legs.map((l) => l.id)).toContain(`hold ${h.fix.ident}`);
        expect(svg).toContain(`${String(ap.finalCourse).padStart(3, "0")}°`);
        expect(svg).toContain("CATEGORY");
        if (ap.minimums.some((m) => /CIRCL/.test(m.label)))
          expect(svg).toContain("CIRCLE-TO-LAND");
      }
    });
  it("LOC BC shows the inbound course and the front course to set", () => {
    const svg = charts.find((c) => c.id === "PARD-B09")!.render();
    expect(svg).toMatch(/Final Apch Crs<\/text><text[^>]*>090°/);
    expect(svg).toContain("set 270°");
  });
  it("missed approach icons follow the missed legs (climb, turn only when it turns, direct, hold)", () => {
    const t = (id: string) =>
      _internal
        .missedIcons(approach(id), _internal.missedPlan(approach(id), 420))
        .map((i) => i.t);
    expect(t("PARD-I27")).toEqual(["1000'", "3000'", "ARD", "ARD"]);
    expect(t("MSVL-V21")).toEqual(["4000'", "MSV", "MSV"]); // turn of ~180° without a published direction
  });
  it("visibility: one style, statute-mile fractions, RVR equivalents, metric outside the US", () => {
    expect(_internal.fracSM(1.25)).toBe("1¼");
    expect(_internal.fracSM(0.5)).toBe("½");
    expect(_internal.fracSM(2)).toBe("2");
    expect(_internal.visStraight("1/2", "us")).toBe("RVR 24 or ½");
    expect(_internal.visStraight("1 1/4", "us")).toBe("RVR 60 or 1¼");
    expect(_internal.visStraight("1 1/2", "us")).toBe("1½");
    expect(_internal.visStraight("RVR 1200", "us")).toBe("RVR 1200");
    expect(_internal.visStraight("1/2", "metric")).toBe("RVR 750m");
    expect(_internal.visCircle(1.5, "us")).toBe("1½");
  });
});

describe("charts engine — real world (KSFO / KSJC: FAA CIFP approaches, SIDs, STARs)", () => {
  const realFetch = globalThis.fetch;
  beforeAll(async () => {
    (globalThis as unknown as { localStorage: Storage }).localStorage ??= {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage;
    globalThis.fetch = (async (u: string) => {
      const url = String(u);
      if (url.startsWith("/navdata/")) {
        const p = `public${url}`;
        if (!fs.existsSync(p)) return new Response("", { status: 404 });
        return new Response(fs.readFileSync(p), { status: 200 });
      }
      return new Response("", { status: 404 }); // terrain tiles: offline in tests
    }) as typeof fetch;
    const { loadRegion } = await import("../src/nav/world");
    await loadRegion(["KSFO", "KSJC"]);
  }, 60000);
  afterAll(async () => {
    const { leaveRealWorld } = await import("../src/nav/world");
    leaveRealWorld();
    globalThis.fetch = realFetch;
  });

  it("indexes SIDs and STARs per airport with stable ids and Navigraph-like groups", () => {
    const charts = chartIndex();
    const sfo = charts.filter((c) => c.airport === "KSFO");
    expect(
      sfo.some(
        (c) =>
          c.id === "KSFO-SID-SSTIK5" && c.kind === "SID" && c.group === "SID",
      ),
    ).toBe(true);
    expect(
      charts.some((c) => c.id === "KSJC-STAR-ALWYS3" || c.kind === "STAR"),
    ).toBe(true);
    expect(
      sfo.some(
        (c) => c.id === "KSFO-I28R" && c.kind === "IAP" && c.group === "ILS",
      ),
    ).toBe(true);
    const sstik = sfo.find((c) => c.id === "KSFO-SID-SSTIK5")!;
    expect(sstik.title).toBe("SSTIK FIVE DEPARTURE (RNAV)");
    expect(rwyName("RW28B")).toBe("28L/R");
  });

  it("renders every KSFO / KSJC chart cleanly (complete course labels, no overlapping labels)", () => {
    const charts = chartIndex().filter(
      (c) => c.airport === "KSFO" || c.airport === "KSJC",
    );
    expect(charts.length).toBeGreaterThan(30);
    const problems: string[] = [];
    for (const c of charts) {
      const svg = c.render();
      const rep = lastLayout();
      const wf = wellFormed(svg);
      if (wf) problems.push(`${c.id}: ${wf}`);
      if (/NaN|undefined/.test(svg)) problems.push(`${c.id}: NaN/undefined`);
      const un = rep.legs.filter((l) => !l.label).map((l) => l.id);
      if (un.length)
        problems.push(`${c.id}: no course label on ${un.join(", ")}`);
      const ov = overlapping(rep);
      if (ov.length)
        problems.push(`${c.id}: overlaps ${ov.slice(0, 3).join(", ")}`);
      if ((c.kind === "SID" || c.kind === "STAR") && !rep.legs.length)
        problems.push(`${c.id}: no legs drawn`);
    }
    expect(problems).toEqual([]);
  }, 120000);

  it("SID chart: title block, runways, route description, lost-communications note", () => {
    const c = chartIndex().find((x) => x.id === "KSFO-SID-SSTIK5")!;
    const svg = c.render();
    expect(svg).toContain("SSTIK FIVE DEPARTURE (RNAV)");
    expect(svg).toContain("TAKEOFF RWY 01L/R:");
    expect(svg).toContain("LOST COMMUNICATIONS:");
    expect(svg).toContain("NOT TO SCALE");
    expect(svg).toContain("KAYEX TRANSITION");
  });
  it("vector SID: radar vectors to the transition fixes, no invented tracks between them", () => {
    const c = chartIndex().find((x) => x.id === "KSFO-SID-GAPP7")!;
    const svg = c.render();
    const rep = lastLayout();
    expect(svg).toContain("RADAR VECTORS");
    expect(svg.replace(/<[^>]+>/g, "")).toContain("Expect radar vectors to ALCOA.");
    // the runway transitions end at SFO / OSI / NORMM: nothing is drawn from there to ALCOA, BEBOP, ENI…
    expect(
      rep.legs.filter((l) =>
        /(SFO|OSI|NORMM)>(ALCOA|BEBOP|ENI|SGD|SAU|OAK)$/.test(l.id),
      ),
    ).toEqual([]);
  });
  it("airport diagrams: every runway number (displaced thresholds included), 3-digit bearings", () => {
    const sjc = chartIndex()
      .find((x) => x.id === "KSJC-APD")!
      .render();
    for (const n of ["12L", "12R", "30L", "30R"])
      expect(sjc).toContain(`>${n}<`);
    const sfo = chartIndex()
      .find((x) => x.id === "KSFO-APD")!
      .render();
    for (const n of ["10L", "10R", "28L", "28R", "01L", "01R", "19L", "19R"])
      expect(sfo).toContain(`>${n}<`);
    expect(sfo).toContain("013.7°");
    expect(sfo).not.toMatch(/>13\.7°</);
    // the plate sketch shows every runway number too
    const plate = chartIndex()
      .find((x) => x.id === "KSJC-I12R")!
      .render();
    for (const n of ["12L", "12R", "30L", "30R"])
      expect(plate).toContain(`>${n}<`);
  });
  it("procedure titles and RNAV classification", async () => {
    const { TERMINAL } = await import("../src/nav/data");
    const p = TERMINAL.find((x) => x.id === "SERFR4")!;
    expect(procTitle(p)).toMatch(/^SERFR FOUR ARRIVAL/);
    expect(isRnav(TERMINAL.find((x) => x.id === "SSTIK5")!)).toBe(true);
  });
});
