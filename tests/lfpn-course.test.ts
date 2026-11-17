// « IFR à Toussus-le-Noble (LFPN) »: the course follows the library's house rules, every number its slides show comes
// from the facts module (lfpnFacts.ts, SIA eAIP AIRAC 29 OCT 2026), it says it is training material, the navdata of
// LFPN matches the AIP (tools/navdata/aip-corrections.json), and its situations sit on the real ILS 25R once the
// region around LFPN is loaded.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Course, L10n, SlideBlock, Step } from "../src/course/types";
import { sampleCourse, SAMPLES } from "../src/course/samples";
import { AIRFIELD_DECKS, DECKS } from "../src/course/samples/decks";
import { isStudentAction } from "../src/course/samples/kit";
import {
  LFPN,
  LFPN_AIRAC,
  LFPN_CHECK,
  LFPN_DISCLAIMER,
  LFPN_FACTS,
  LFPN_FREQ,
  LFPN_ILS25R,
  LFPN_NAV,
  LFPN_RUNWAYS,
} from "../src/course/samples/decks/lfpnFacts";
import { LFPN_DECK_ID } from "../src/course/samples/decks/lfpnIfr";
import { isTask, slideTask } from "../src/course/ui/reader";
import { validateCourse } from "../src/course/validate";
import { CLASSIFICATION } from "../src/library/classification";
import { courseWorld, worldAirports } from "../src/course/realWorld";
import { runwayInUse } from "../src/course/stage/diagramRunways";
import { distanceNm } from "../src/nav/geo";

const course = (): Course => sampleCourse(LFPN_DECK_ID)!;
const slideBlocks = (s: Step): SlideBlock[] => s.slide?.blocks ?? [];

describe("LFPN course: registered and built like the library's courses", () => {
  const c = course();
  it("is a sample listed after the ready decks, filed under IR · Terrains", () => {
    expect(AIRFIELD_DECKS.map((d) => d.id)).toEqual([LFPN_DECK_ID]);
    expect(DECKS.map((d) => d.id)).not.toContain(LFPN_DECK_ID);
    expect(SAMPLES.at(-1)!.id).toBe(LFPN_DECK_ID);
    expect(CLASSIFICATION[LFPN_DECK_ID]?.home).toBe("ir.ad");
    expect(c.id).toBe(LFPN_DECK_ID);
    expect(c.sample).toBe(LFPN_DECK_ID);
  });
  it("validates, light, bilingual, tagged IR", () => {
    expect(validateCourse(c).filter((i) => i.level === "error")).toEqual([]);
    expect(c.theme).toBe("classroom");
    expect(c.langs).toEqual(["en", "fr"]);
    expect(c.tags).toContain("ir");
  });
  it("has 14 to 20 slides, opens on a cover, keeps the student acting at least every 3 steps", () => {
    expect(c.steps.length).toBeGreaterThanOrEqual(14);
    expect(c.steps.length).toBeLessThanOrEqual(20);
    expect(c.steps.every((s) => !!s.slide)).toBe(true);
    expect(c.steps[0].slide?.layout).toBe("cover");
    let run = 0;
    for (const s of c.steps) {
      run = isStudentAction(s) ? 0 : run + 1;
      expect(run, `before ${s.id}`).toBeLessThan(3);
    }
  });
  it("has the house mix: a live diagram to drag, « À vous » goals checked on the slide, questions, a flight", () => {
    const blocks = c.steps.flatMap(slideBlocks);
    expect(blocks.some((b) => b.kind === "diagram" && b.interactive)).toBe(
      true,
    );
    expect(
      blocks.filter((b) => b.kind === "diagram").length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      c.steps.filter((s) => slideTask(s) === "goal").length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      blocks.filter((b) => b.kind === "quiz").length,
    ).toBeGreaterThanOrEqual(4);
    expect(
      blocks.some(
        (b) => b.kind === "simViewport" && b.yourTurn?.where === "sim",
      ),
    ).toBe(true);
    for (const s of c.steps)
      if (slideTask(s)) expect(isTask(s), s.id).toBe(true);
    // the live « À vous »: the controls on the slide and an automatic goal
    const live = blocks.filter(
      (b) => b.kind === "instrument" && b.yourTurn?.where === "slide",
    );
    expect(live.length).toBe(2);
    for (const b of live)
      if (b.kind === "instrument") {
        expect(b.controls?.length).toBeGreaterThan(0);
        expect(b.yourTurn?.goal?.all.length).toBeGreaterThan(0);
      }
  });
  it("gives the presenter notes on every slide, in French and English", () => {
    for (const s of c.steps) {
      expect(s.notes?.en, s.id).toBeTruthy();
      expect(s.notes?.fr, s.id).toBeTruthy();
    }
  });
  it("flies in the real world around LFPN", () => {
    expect(worldAirports(courseWorld(c))).toEqual(["LFPN"]);
    for (const sc of Object.values(c.scenes))
      expect(sc.world).toMatchObject({ kind: "real", icaos: ["LFPN"] });
  });
});

describe("LFPN course: says what it is", () => {
  const c = course();
  const footOf = (s: Step) =>
    slideBlocks(s)
      .filter(
        (b): b is Extract<SlideBlock, { kind: "text" }> =>
          b.kind === "text" && b.style === "foot",
      )
      .map((b) => b.text);
  it("the cover carries « Entraînement, non pour la navigation réelle » and the AIRAC cycle", () => {
    const [f] = footOf(c.steps[0]);
    expect(f.fr).toContain(LFPN_DISCLAIMER.fr);
    expect(f.en).toContain(LFPN_DISCLAIMER.en);
    expect(f.fr).toContain(LFPN_AIRAC.cycle);
    expect(c.steps[0].notes?.fr).toContain(LFPN_DISCLAIMER.fr);
    expect(c.steps[0].notes?.fr).toContain(LFPN_AIRAC.cycle);
  });
  it("the takeaways and the simulator flight repeat it", () => {
    for (const id of ["pn-recap", "pn-fly"]) {
      const s = c.steps.find((x) => x.id === id)!;
      expect(
        footOf(s).some((t) => t.fr?.includes(LFPN_DISCLAIMER.fr)),
        id,
      ).toBe(true);
      expect(s.notes?.fr, id).toContain(LFPN_DISCLAIMER.fr);
    }
  });
  it("the briefing, the arrival and the minima say « à vérifier sur la carte SIA en vigueur »", () => {
    for (const id of ["pn-brief", "pn-arrival", "pn-minima"]) {
      const s = c.steps.find((x) => x.id === id)!;
      const t = slideBlocks(s)
        .flatMap((b) => (b.kind === "text" ? [b.text.fr ?? ""] : []))
        .join(" ");
      expect(t, id).toContain(LFPN_CHECK.fr);
    }
  });
});

// ------------------------------------------------------------------ provenance of the numbers
/** Every number in the facts module (numbers, and the numbers written inside its strings). */
function factNumbers(): Set<number> {
  const out = new Set<number>();
  const walk = (x: unknown) => {
    if (typeof x === "number") out.add(Math.round(x * 1000) / 1000);
    else if (typeof x === "string")
      for (const m of x.match(/\d+(?:\.\d+)?/g) ?? []) out.add(Number(m));
    else if (Array.isArray(x)) x.forEach(walk);
    else if (x && typeof x === "object") Object.values(x).forEach(walk);
  };
  walk(LFPN_FACTS);
  return out;
}
/** The numbers a text shows, read the way its language writes them (« 1 100 », « 127,480 »; "1,100", "127.480"). */
function numbersIn(t: string, lang: "en" | "fr"): number[] {
  const s = t
    // references, not data: regulation and handbook paragraphs
    .replace(/NCO\.OP\.\d+/g, "")
    .replace(/[−-](?=\d)/g, " ");
  const re =
    lang === "fr" ? /\d+(?:[  ]\d{3})*(?:,\d+)?/g : /\d+(?:,\d{3})*(?:\.\d+)?/g;
  return (s.match(re) ?? []).map((m) =>
    Number(
      lang === "fr"
        ? m.replace(/[  ]/g, "").replace(",", ".")
        : m.replace(/,/g, ""),
    ),
  );
}
/** What a slide shows in words: its text blocks (not the source line), questions, rows, alt texts, animation labels. */
function slideTexts(s: Step): L10n[] {
  const out: L10n[] = [s.title];
  for (const b of slideBlocks(s)) {
    if (b.kind === "text" && b.style !== "foot") out.push(b.text);
    if (b.kind === "quiz" && b.quiz.kind === "mcq") {
      out.push(b.quiz.prompt);
      for (const o of b.quiz.options)
        out.push(o.text, ...(o.why ? [o.why] : []));
    }
    if (b.kind === "checklist") for (const r of b.rows) out.push(r.text);
    if (
      b.kind === "instrument" ||
      b.kind === "diagram" ||
      b.kind === "simViewport"
    )
      if (b.alt) out.push(b.alt);
    if (b.kind === "instrument") {
      if (b.yourTurn)
        out.push(
          b.yourTurn.prompt,
          ...(b.yourTurn.hint ? [b.yourTurn.hint] : []),
        );
      for (const m of b.motion?.script?.marks ?? []) out.push(m.label);
      for (const a of b.annotations ?? [])
        if ("text" in a && a.text) out.push(a.text);
    }
    if (b.kind === "simViewport" && b.yourTurn) out.push(b.yourTurn.prompt);
    if (
      b.kind === "diagram" &&
      b.d?.kind === "calc" &&
      b.d.calc.kind === "runways"
    )
      for (const st of b.d.calc.strips)
        if (st.label) out.push({ en: st.label, fr: st.label });
  }
  return out;
}

describe("LFPN course: every number on its slides comes from the facts module", () => {
  const facts = factNumbers();
  // 0–9 number the slides and the dots of a needle; 60: minutes per hour (372 × 90 ÷ 60)
  const ok = (n: number) =>
    (Number.isInteger(n) && n < 10) ||
    n === 60 ||
    facts.has(Math.round(n * 1000) / 1000);
  for (const s of course().steps)
    it(`${s.id}`, () => {
      for (const t of slideTexts(s))
        for (const lang of ["fr", "en"] as const) {
          const str = lang === "fr" ? (t.fr ?? t.en) : t.en;
          for (const n of numbersIn(str, lang))
            expect(ok(n), `${lang} « ${str} »: ${n}`).toBe(true);
        }
    });
  it("reads the facts it should (a sanity check of the reader)", () => {
    expect(numbersIn("ATIS 127,480 · 1 100 × 30 m · −650", "fr")).toEqual([
      127.48, 1100, 30, 650,
    ]);
    expect(numbersIn("ATIS 127.480 · 1,100 × 30 m", "en")).toEqual([
      127.48, 1100, 30,
    ]);
    expect(ok(4242)).toBe(false);
  });
});

// ------------------------------------------------------------------ the navdata of LFPN against the AIP
const NAV = resolve(__dirname, "../public/navdata");
const tile = () =>
  JSON.parse(readFileSync(resolve(NAV, "tiles/45_0.json"), "utf8"));
describe("navdata: LFPN as the AIP publishes it", () => {
  const a = tile().airports.LFPN;
  it("reference point, elevation, variation, frequencies", () => {
    expect(distanceNm(a, LFPN.arp) * 1852).toBeLessThan(5);
    expect(a.elev).toBe(LFPN.elevFt);
    expect(a.magVar).toBeCloseTo(LFPN.magVar, 3);
    expect(a.freqs.atis).toBe(LFPN_FREQ.atis);
    expect(a.freqs.tower).toBe(LFPN_FREQ.tower);
    expect(a.freqs.ground).toBe(LFPN_FREQ.ground);
    const row = (
      JSON.parse(
        readFileSync(resolve(NAV, "index.json"), "utf8"),
      ) as unknown[][]
    ).find((r) => r[0] === "LFPN")!;
    expect(
      distanceNm({ lat: row[4] as number, lon: row[5] as number }, LFPN.arp) *
        1852,
    ).toBeLessThan(5);
    expect((row[7] as number) & 8).toBe(8);
  });
  it("runway thresholds within 5 m, the 07R displaced threshold", () => {
    for (const r of LFPN_RUNWAYS) {
      const t = a.runways.find((x: { ids: string[] }) => x.ids[0] === r.ids[0]);
      expect(t, r.ids[0]).toBeTruthy();
      for (const e of [0, 1] as const) {
        const end = e === 0 ? t.le : t.he;
        expect(
          distanceNm({ lat: end[0], lon: end[1] }, r.thr[e]) * 1852,
          `${r.ids[e]}`,
        ).toBeLessThan(5);
        expect(end[2]).toBe(r.thr[e].elevFt);
        expect(
          Math.abs(end[3] * 0.3048 - r.dthrM[e]),
          `${r.ids[e]} DTHR`,
        ).toBeLessThan(1);
      }
      expect(Math.abs(t.len * 0.3048 - r.lengthM)).toBeLessThan(1);
    }
  });
  it("the ILS 25R (TNO): LOC, glide path, final course, RDH", () => {
    const ils = a.ils.find((x: { rwy: string }) => x.rwy === "25R");
    expect(ils).toMatchObject({
      id: "TNO",
      f: LFPN_NAV.tno.loc,
      gs: LFPN_NAV.tno.gpDeg,
      tch: LFPN_NAV.tno.rdhFt,
    });
    // on the runway axis: the true QFU with the 2025 variation (the chart's 250 is rounded, with VAR 1°E 2020)
    expect(ils.crs).toBeCloseTo(LFPN_RUNWAYS[0].qfuTrue[1] - LFPN.magVar, 1);
    expect(Math.abs(ils.crs - LFPN_ILS25R.finalCourse)).toBeLessThan(1);
    expect(distanceNm(ils, LFPN_NAV.tno.locPos) * 1852).toBeLessThan(5);
    // DME Ch 38Y: at the glide path antenna, not at the localizer
    expect(distanceNm({ lat: ils.dmeLat, lon: ils.dmeLon }, LFPN_NAV.tno.gpPos) * 1852).toBeLessThan(5);
    expect(
      distanceNm({ lat: ils.gsLat, lon: ils.gsLon }, LFPN_NAV.tno.gpPos) * 1852,
    ).toBeLessThan(5);
  });
});

// ------------------------------------------------------------------ the situations in the real region
describe("LFPN course: its situations sit on the real ILS 25R", () => {
  beforeAll(() => {
    vi.stubGlobal("fetch", async (url: string) => {
      const p = resolve(NAV, String(url).replace(/^\/navdata\//, ""));
      try {
        const body = readFileSync(p, "utf8");
        return {
          ok: true,
          json: async () => JSON.parse(body),
        } as unknown as Response;
      } catch {
        return { ok: false, json: async () => null } as unknown as Response;
      }
    });
  });
  afterAll(async () => {
    (await import("../src/nav/world")).leaveRealWorld();
    vi.unstubAllGlobals();
  });
  it("loads the region the way the academy does, with the frame the course poses its situations in", async () => {
    const { enterCourseWorld } = await import("../src/course/realWorld");
    const { currentRegion, toSim, simFrameOf } =
      await import("../src/nav/world");
    expect(await enterCourseWorld(course())).toBe(true);
    const f = currentRegion()!;
    expect(distanceNm(f.center, LFPN.arp) * 1852).toBeLessThan(5);
    expect(f.magVar).toBeCloseTo(LFPN.magVar, 3);
    const thr = LFPN_RUNWAYS[0].thr[1];
    expect(
      distanceNm(toSim(thr), simFrameOf(thr, LFPN.arp, LFPN.magVar)) * 1852,
    ).toBeLessThan(5);
  });
  it("on the localizer and the glide path where the slides say, full scale on the intercept", async () => {
    const { Sim } = await import("../src/sim/sim");
    const { applyScene } = await import("../src/course/scene");
    const { stageView, lateralDots, verticalDots } =
      await import("../src/course/goals");
    const c = course();
    const dots = (id: string) => {
      const sim = new Sim();
      applyScene(sim, c.scenes[id]);
      sim.updateAvionics(0);
      const v = stageView(sim);
      return { lat: lateralDots(v), vert: verticalDots(v) };
    };
    for (const id of ["pn.cover", "pn.final"]) {
      const d = dots(id);
      expect(Math.abs(d.lat ?? 9), `${id} LOC`).toBeLessThan(0.3);
      expect(Math.abs(d.vert ?? 9), `${id} GS`).toBeLessThan(0.5);
    }
    expect(Math.abs(dots("pn.intercept").lat ?? 0)).toBeGreaterThan(1.5);
    expect(Math.abs(dots("pn.fly").lat ?? 9)).toBeLessThan(0.3);
    // the DME of TNO is at the glide path antenna, beside the 25R threshold (AD 2.19): 9 NM out reads about 9.2
    {
      const sim = new Sim();
      applyScene(sim, c.scenes["pn.fly"]);
      sim.updateAvionics(0);
      expect(sim.nav1.dmeNm).toBeGreaterThan(9);
      expect(sim.nav1.dmeNm).toBeLessThan(9.5);
    }
    // 150 ft above the path at 7 NM: the index low
    expect(Math.abs(dots("pn.high").vert ?? 0)).toBeGreaterThan(0.4);
  });
});

describe("the runways diagram", () => {
  const strips = LFPN_RUNWAYS.map((r) => ({
    ids: [r.ids[0], r.ids[1]] as [string, string],
    qfu: [r.qfu[0], r.qfu[1]] as [number, number],
    ends: [
      [0, 0],
      [1000, 300],
    ] as [[number, number], [number, number]],
    widthM: 30,
  }));
  it("puts the runway with the headwind in use, none when calm", () => {
    expect(runwayInUse({ strips, windDir: 250, windKt: 12 })).toMatchObject({
      end: 1,
    });
    expect(runwayInUse({ strips, windDir: 70, windKt: 12 })).toMatchObject({
      end: 0,
    });
    expect(runwayInUse({ strips, windDir: 160, windKt: 0 })).toBeNull();
    const w = runwayInUse({ strips, windDir: 280, windKt: 20 })!;
    expect(w.head).toBeCloseTo(20 * Math.cos((31 * Math.PI) / 180), 5);
  });
});
