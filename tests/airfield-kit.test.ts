// « Adapter à mon terrain »: an ICAO code → six slides from the shipped navdata (fetch served from public/), with the
// real runway geometry, the QFU on every end, nothing invented, and a friendly sentence for a code that is not there.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import type { Course, SlideBlock } from "../src/course/types";

const realFetch = globalThis.fetch;
beforeAll(() => {
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
    return new Response("", { status: 404 });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const texts = (blocks: SlideBlock[], lang: "en" | "fr") =>
  blocks
    .filter(
      (b): b is Extract<SlideBlock, { kind: "text" }> => b.kind === "text",
    )
    .map((b) => (lang === "fr" ? (b.text.fr ?? b.text.en) : b.text.en))
    .join("\n");

describe("airfieldKit", () => {
  it("LFPN: Toussus-le-Noble, 538 ft, the two 07/25 pairs with their QFU, six slides", async () => {
    const { airfieldKit } = await import("../src/course/airfieldKit");
    const k = await airfieldKit("lfpn", "fr");
    if (!k.ok) throw new Error(k.message);
    expect(k.icao).toBe("LFPN");
    expect(k.name).toBe("Toussus-le-Noble");
    expect(k.field.airport.elevFt).toBe(538);
    const pairs = k.field.strips.map((s) => s.ids.join("/"));
    expect(pairs).toEqual(expect.arrayContaining(["07L/25R", "07R/25L"]));
    const ids = k.field.airport.runways.map((r) => r.id).sort();
    expect(ids).toEqual(["07L", "07R", "25L", "25R"]);
    // real geometry: a 07 end heads about 070° magnetic, its opposite end 180° away
    for (const r of k.field.airport.runways) {
      const want = Number(r.id.slice(0, 2)) * 10;
      const d = Math.abs(((r.heading - want + 540) % 360) - 180);
      expect(d, r.id).toBeLessThan(8);
    }
    expect(k.slides).toHaveLength(6);
    const [title, plan, radio, view, fly, brief] = k.slides;
    expect(texts(title.slide.blocks, "fr")).toMatch(
      /Toussus-le-Noble \(LFPN\)/,
    );
    expect(texts(title.slide.blocks, "fr")).toMatch(/538 ft/);
    // the plan: one strip per runway, rotated to its heading, every end labelled with its number and QFU
    const strips = plan.slide.blocks.filter(
      (b) => b.kind === "shape" && b.shape === "rect",
    );
    expect(strips).toHaveLength(2);
    for (const s of strips)
      expect(Math.abs(Math.abs(s.frame.rot ?? 0) - 21)).toBeLessThan(6);
    const pt = texts(plan.slide.blocks, "fr");
    for (const id of ["07L", "07R", "25L", "25R"]) expect(pt).toContain(id);
    expect(pt.match(/QFU \d{3}°/g)?.length).toBeGreaterThanOrEqual(4);
    // radio: the tower and the field's VOR, French decimals
    const rt = texts(radio.slide.blocks, "fr");
    expect(rt).toMatch(/120,750 MHz/);
    expect(rt).toMatch(/TSU/);
    // the view and the takeoff stand on the real runway, in the real-world region of the field
    const vp = view.slide.blocks.find((b) => b.kind === "simViewport");
    expect(vp && vp.kind === "simViewport" && vp.view).toBe("outside");
    const sim = fly.slide.blocks.find((b) => b.kind === "simViewport");
    expect(sim && sim.kind === "simViewport" && sim.yourTurn?.where).toBe(
      "sim",
    );
    for (const sc of Object.values(k.scenes)) {
      expect(sc.world).toEqual({
        kind: "real",
        region: "LFPN",
        icaos: ["LFPN"],
      });
      expect(
        sc.pose.kind === "fields" &&
          "runway" in sc.pose.pos &&
          sc.pose.pos.runway.icao,
      ).toBe("LFPN");
    }
    // nothing invented: the briefing is « à compléter », procedures point to the SIA chart
    const bt = texts(brief.slide.blocks, "fr");
    expect(bt.match(/À compléter/g)?.length).toBe(4);
    expect(bt).toMatch(/à vérifier sur la carte SIA en vigueur/);
    for (const s of k.slides) expect(s.notes.fr).toBeTruthy();
  });

  it("a situation of the kit poses on the real runway once the field is registered", async () => {
    const { airfieldKit } = await import("../src/course/airfieldKit");
    const { applyScene } = await import("../src/course/scene");
    const { Sim } = await import("../src/sim/sim");
    const k = await airfieldKit("LFPN", "en");
    if (!k.ok) throw new Error(k.message);
    const dep = Object.values(k.scenes).find((s) => s.id.endsWith(".dep"))!;
    const sim = new Sim();
    applyScene(sim, dep);
    expect(sim.ac.s.onGround).toBe(true);
    const fin = Object.values(k.scenes).find((s) => s.id.endsWith(".final"))!;
    applyScene(sim, fin);
    expect(sim.ac.s.onGround).toBe(false);
    expect(Math.round(sim.ac.s.altFt)).toBeGreaterThan(1300);
  });

  it("the kit becomes a course like any template, and the course validates", async () => {
    const { airfieldKit } = await import("../src/course/airfieldKit");
    const { buildNewCourse } = await import("../src/course/ui/newCourse");
    const { validateCourse } = await import("../src/course/validate");
    const k = await airfieldKit("LFPN", "fr");
    if (!k.ok) throw new Error(k.message);
    const c: Course = buildNewCourse({
      id: "kit-test",
      lang: "fr",
      title: "",
      program: "ppl",
      subject: null,
      starter: k.starter,
    });
    expect(c.steps).toHaveLength(6);
    expect(c.title.fr).toBe("Toussus-le-Noble (LFPN)");
    expect(c.steps.every((s) => !!s.notes?.fr)).toBe(true);
    for (const id of Object.keys(k.scenes)) expect(c.scenes[id]).toBeTruthy();
    const errors = validateCourse(c).filter((i) => i.level === "error");
    expect(errors).toEqual([]);
  });

  it("a field outside France points to the official chart, and its runways are there", async () => {
    const { airfieldKit } = await import("../src/course/airfieldKit");
    const k = await airfieldKit("KSFO", "en");
    if (!k.ok) throw new Error(k.message);
    expect(k.field.strips.length).toBeGreaterThanOrEqual(4);
    expect(texts(k.slides[5].slide.blocks, "en")).toMatch(
      /official chart in force/,
    );
  });

  it("an unknown or malformed code is a clear sentence, never a crash", async () => {
    const { airfieldKit } = await import("../src/course/airfieldKit");
    const u = await airfieldKit("ZZZZ", "fr");
    expect(u.ok).toBe(false);
    if (!u.ok) {
      expect(u.code).toBe("unknown");
      expect(u.message).toMatch(
        /ZZZZ n’est pas dans les données de navigation/,
      );
    }
    const f = await airfieldKit("12", "en");
    expect(f.ok).toBe(false);
    if (!f.ok) {
      expect(f.code).toBe("format");
      expect(f.message).toMatch(/4-letter ICAO code/);
    }
  });
});
