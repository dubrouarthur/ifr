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
  it("LFPN: Toussus-le-Noble, 538 ft, the two 07/25 pairs with their QFU, seven slides", async () => {
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
    // the QFU is today's: 07L is 069° on the AIP (MAG 069/249), not the 072° an old station declination gave
    const r07L = k.field.airport.runways.find((r) => r.id === "07L")!;
    expect(Math.abs(r07L.heading - 69)).toBeLessThanOrEqual(1);
    expect(k.field.magVar).toBeGreaterThan(1);
    expect(k.slides).toHaveLength(7);
    const [title, plan, radio, hsi, view, fly, brief] = k.slides;
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
    expect(texts(plan.slide.blocks, "fr")).toMatch(/QFU 069°/);
    // radio: the tower and the field's VOR, French decimals, with the data set's own precision and the warning where
    // the figures stand (never padded to look like a chart's channel)
    const rt = texts(radio.slide.blocks, "fr");
    expect(rt).toMatch(/Fréquences · à vérifier sur la carte VAC/);
    expect(rt).toMatch(/120,75 MHz/);
    expect(rt).not.toMatch(/120,750/);
    expect(rt).toMatch(/Espace 8,33 kHz/);
    expect(rt).toMatch(/TSU/);
    // the house « À vous » on the slide: a live HSI on TSU, the OBS on the slide, the goal checked there
    const inst = hsi.slide.blocks.find((b) => b.kind === "instrument");
    expect(inst && inst.kind === "instrument" && inst.mode).toBe("live");
    expect(inst && inst.kind === "instrument" && inst.yourTurn?.where).toBe("slide");
    expect(inst && inst.kind === "instrument" && inst.controls).toEqual(["obs1"]);
    expect(texts(hsi.slide.blocks, "fr")).toMatch(/Où est TSU/);
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
    // the briefing is « à compléter », procedures point to the SIA chart, and no slide claims more than the data holds
    const bt = texts(brief.slide.blocks, "fr");
    expect(bt.match(/À compléter/g)?.length).toBe(4);
    expect(bt).toMatch(/à vérifier sur la carte SIA en vigueur/);
    for (const s of k.slides)
      expect(texts(s.slide.blocks, "fr")).not.toMatch(/Rien n’est inventé/);
    // the takeoff: a height above the field (the simulator's ground is not the published elevation), not the
    // published departure
    const ft = texts(fly.slide.blocks, "fr");
    expect(ft).toMatch(/1 000 ft au-dessus du terrain/);
    expect(ft).toMatch(/pas le départ publié/);
    expect(ft).toMatch(/Mettez plein gaz/);
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
    // the view on final: 0.3 NM, about 150 ft above the field, on the 3° path (the runway fills the view)
    const fin = Object.values(k.scenes).find((s) => s.id.endsWith(".final"))!;
    applyScene(sim, fin);
    expect(sim.ac.s.onGround).toBe(false);
    expect(Math.round(sim.ac.s.altFt)).toBeGreaterThan(538 + 100);
    expect(Math.round(sim.ac.s.altFt)).toBeLessThan(538 + 220);
    expect(Object.values(k.scenes).some((s) => s.id.endsWith(".final15"))).toBe(true);
  });

  it("the live HSI tunes the field's VOR on the slide: with the OBS on the QDM the bar centres with TO", async () => {
    const { airfieldKit } = await import("../src/course/airfieldKit");
    const { applyScene } = await import("../src/course/scene");
    const { Sim } = await import("../src/sim/sim");
    const { bearingDeg } = await import("../src/nav/geo");
    const { tunedNavaid } = await import("../src/nav/radios");
    const k = await airfieldKit("LFPN", "fr");
    if (!k.ok) throw new Error(k.message);
    const sc = Object.values(k.scenes).find((s) => s.id.endsWith(".vor"))!;
    const sim = new Sim();
    applyScene(sim, sc);
    sim.step(0.05);
    expect(sim.nav1.valid).toBe(true);
    expect(sim.nav1.ident).toBe("TSU");
    // the OBS starts off course; set on the bearing to the station, the bar centres with a TO flag
    expect(Math.abs(sim.nav1.dev)).toBeGreaterThan(0.5);
    const tsu = tunedNavaid(sim.av.nav1.active, sim.ac.s)!;
    sim.av.obs1 = Math.round(bearingDeg(sim.ac.s, tsu));
    sim.step(0.05);
    expect(sim.nav1.toFrom).toBe("TO");
    expect(Math.abs(sim.nav1.dev)).toBeLessThan(0.2);
  });

  it("the runway plan reads cleanly: its labels are part of the figure, the reader gets its description", async () => {
    const { airfieldKit } = await import("../src/course/airfieldKit");
    const { linearText } = await import("../src/course/ui/templates");
    const k = await airfieldKit("LFPN", "fr");
    if (!k.ok) throw new Error(k.message);
    const r = linearText(k.slides[1].slide);
    const words = r.map((b) => ("text" in b ? (b.text.fr ?? b.text.en) : "")).filter(Boolean);
    // the title, then the plan in words, then the runway list (never an end label between two rows)
    expect(words[0]).toMatch(/Les pistes de/);
    expect(words[1]).toMatch(/^Plan des pistes à l’échelle, nord magnétique en haut : 07L\/25R .*07R\/25L/);
    expect(words.slice(2, 4)).toEqual(["07L/25R", "QFU 069° et 249°"]);
    expect(words.join("|")).not.toMatch(/N \(magnétique\)|^25R$/m);
    for (const b of k.slides[1].slide.blocks)
      if (b.id.startsWith("k2p.n") || b.id.startsWith("k2p.q") || b.id === "k2p.nt") expect(b.figure).toBe(true);
  });

  it("no two runway-end labels overlap, even with close parallel runways (KSFO, LFPG)", async () => {
    const { airfieldKit } = await import("../src/course/airfieldKit");
    for (const icao of ["KSFO", "LFPG", "LFPN"]) {
      const k = await airfieldKit(icao, "en");
      if (!k.ok) throw new Error(k.message);
      const plan = k.slides[1].slide.blocks;
      const labels = plan.filter((b) => b.kind === "text" && /^k2p\.[nq]/.test(b.id) && b.id !== "k2p.nt");
      // every end is named once
      const named = labels.filter((b) => b.id.startsWith("k2p.n")).flatMap((b) => (b.kind === "text" ? b.text.en.split(" · ") : []));
      expect(named.sort(), icao).toEqual(k.field.airport.runways.map((r) => r.id).sort());
      // and no label sits on a runway strip (the strip's centre line, sampled, stays out of every label's box)
      const strips = plan.filter((b) => b.kind === "shape" && b.shape === "rect" && b.id.startsWith("k2p.rw"));
      for (const st of strips) {
        const f = st.frame;
        const cx = f.x + f.w / 2,
          cy = f.y + f.h / 2,
          a = ((f.rot ?? 0) * Math.PI) / 180;
        for (let t = -0.5; t <= 0.5; t += 0.02) {
          const x = cx + Math.cos(a) * f.w * t,
            y = cy + Math.sin(a) * f.w * t;
          for (const l of labels) {
            const r = l.frame;
            const inside = x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h;
            expect(inside, `${icao}: ${l.id} on ${st.id}`).toBe(false);
          }
        }
      }
      for (let i = 0; i < labels.length; i++)
        for (let j = i + 1; j < labels.length; j++) {
          const a = labels[i].frame,
            b = labels[j].frame;
          const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(hit, `${icao}: ${labels[i].id} × ${labels[j].id}`).toBe(false);
        }
    }
  });

  it("in the cockpit, once the field's region is loaded, the takeoff starts on the same runway and stays on the ground", async () => {
    const { airfieldKit } = await import("../src/course/airfieldKit");
    const { loadRegion, leaveRealWorld } = await import("../src/nav/world");
    const { applyScene } = await import("../src/course/scene");
    const { Sim } = await import("../src/sim/sim");
    const k = await airfieldKit("LFPN", "fr");
    if (!k.ok) throw new Error(k.message);
    const dep = Object.values(k.scenes).find((s) => s.id.endsWith(".dep"))!;
    const onSlide = new Sim();
    applyScene(onSlide, dep);
    await loadRegion(["LFPN"]);
    try {
      const sim = new Sim();
      applyScene(sim, dep);
      // the same frame: the slide's runway is the cockpit's (within a few metres)
      expect(Math.abs(sim.ac.s.lat - onSlide.ac.s.lat)).toBeLessThan(0.0001);
      expect(Math.abs(sim.ac.s.lon - onSlide.ac.s.lon)).toBeLessThan(0.0001);
      for (let i = 0; i < 100; i++) sim.step(0.05);
      expect(sim.ac.s.crashed).toBeNull();
      expect(sim.ac.s.onGround).toBe(true);
    } finally {
      leaveRealWorld();
    }
  }, 30000);

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
    expect(c.steps).toHaveLength(7);
    expect(c.title.fr).toBe("Toussus-le-Noble (LFPN)");
    expect(c.steps.every((s) => !!s.notes?.fr)).toBe(true);
    // each step is named by its slide, the cover by the field (never by a key figure)
    expect(c.steps.map((s) => s.title.fr)).toEqual(k.slides.map((s) => s.title.fr));
    for (const id of Object.keys(k.scenes)) expect(c.scenes[id]).toBeTruthy();
    const errors = validateCourse(c).filter((i) => i.level === "error");
    expect(errors).toEqual([]);
  });

  it("added to an existing course (the studio's « Modèles »), the steps keep their titles and notes", async () => {
    const { airfieldKit } = await import("../src/course/airfieldKit");
    const { addStarterDeck, BLANK_STARTER } = await import("../src/course/ui/deckStarters");
    const { buildNewCourse } = await import("../src/course/ui/newCourse");
    const k = await airfieldKit("LFPN", "en");
    if (!k.ok) throw new Error(k.message);
    const base = buildNewCourse({ id: "c", lang: "en", title: "Mine", program: null, subject: null, starter: BLANK_STARTER });
    const r = addStarterDeck(base, k.starter, { at: 1 });
    const added = r.course.steps.slice(1);
    expect(added.map((s) => s.title.en)).toEqual(k.slides.map((s) => s.title.en));
    expect(added[0].title.en).toBe("Toussus-le-Noble (LFPN)");
    expect(added.every((s) => !!s.notes?.en)).toBe(true);
  });

  it("a field outside France points to the official chart, and its runways are there", async () => {
    const { airfieldKit } = await import("../src/course/airfieldKit");
    const k = await airfieldKit("KSFO", "en");
    if (!k.ok) throw new Error(k.message);
    expect(k.field.strips.length).toBeGreaterThanOrEqual(4);
    expect(texts(k.slides[k.slides.length - 1].slide.blocks, "en")).toMatch(
      /official chart in force/,
    );
    // a localizer row: its ident once, its runway and its course (not where its antenna stands)
    const rt = texts(k.slides[2].slide.blocks, "en");
    expect(rt).toMatch(/ILS \d{2}[LRC]? · \d{3}\.\d{2} MHz · course \d{3}°/);
    expect(rt).not.toMatch(/\bI[A-Z]{3}\b\n/);
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
