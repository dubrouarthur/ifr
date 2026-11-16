// The starting points of a new course (samples/showcaseDecks.ts, ui/newCourse.ts): each formation's template shows
// what the simulator brings, with different instruments and at least four different capabilities; the typed title
// is on the cover and nothing on the cover names another subject; the notes to the author never reach a student;
// the first slides an empty slide offers are all different; everything passes the readability guard.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CAPABILITY,
  SHOWCASE_DECKS,
  showcaseScenes,
  startSlides,
} from "../src/course/samples/showcaseDecks";
import {
  buildNewCourse,
  starterSummary,
  startersFor,
} from "../src/course/ui/newCourse";
import { BLANK_STARTER } from "../src/course/ui/deckStarters";
import { EMPTY_STARTS } from "../src/course/ui/studio";
import { linearText } from "../src/course/ui/templates";
import { resolveTheme } from "../src/course/canvas/themes";
import { READ_FAILS, slideReadability } from "../src/course/canvas/readability";
import { validateCourse } from "../src/course/validate";
import type { Course, SlideBlock, SlideCanvas } from "../src/course/types";

const make = (i: number, title = "Le tour de piste à Lognes") =>
  buildNewCourse({
    id: "c",
    lang: "fr",
    title,
    program: null,
    subject: null,
    starter: SHOWCASE_DECKS[i],
  });
/** what a block shows: « six », « gauge:hsi », « pfd », « view:cockpit », « calc:windTriangle »… */
const visualOf = (b: SlideBlock): string | null =>
  b.kind === "instrument"
    ? b.view.kind === "gauge"
      ? `gauge:${b.view.gauge}`
      : b.view.kind
    : b.kind === "simViewport"
      ? `view:${b.view}`
      : b.kind === "diagram" && b.d?.kind === "calc"
        ? `calc:${b.d.calc.kind}`
        : null;
const visuals = (c: Course) =>
  c.steps.flatMap((s) =>
    (s.slide?.blocks ?? []).map(visualOf).filter((x): x is string => !!x),
  );

describe("the starting template of each formation", () => {
  it("is the formation's own, first, and the blank slide is offered last", () => {
    expect(startersFor("ppl")[0].id).toBe("ppl-circuit");
    expect(startersFor("club")[0].id).toBe("ppl-circuit");
    expect(startersFor("night")[0].id).toBe("night-flight");
    expect(startersFor("ir")[0].id).toBe("ir-ils");
    expect(startersFor("atpl")[0].id).toBe("atpl-displays");
    for (const p of ["ppl", "night", "ir", "atpl"] as const)
      expect(startersFor(p).at(-1)!.id).toBe(BLANK_STARTER.id);
  });
  it("shows at least four different capabilities, 5 to 7 slides, and names one of them on its card", () => {
    for (const d of SHOWCASE_DECKS) {
      const caps = new Set(d.shows.filter((x) => x in CAPABILITY));
      expect(caps.size, d.id).toBeGreaterThanOrEqual(4);
      expect(d.slides.length, d.id).toBeGreaterThanOrEqual(5);
      expect(d.slides.length, d.id).toBeLessThanOrEqual(7);
      expect(CAPABILITY[d.badge].fr, d.id).toBeTruthy();
      expect(d.hero).toBeLessThan(d.slides.length);
    }
  });
  it("uses different instruments: never the same picture four times, and each formation its own set", () => {
    const sets = SHOWCASE_DECKS.map((_, i) => visuals(make(i)));
    sets.forEach((v, i) => {
      const id = SHOWCASE_DECKS[i].id;
      expect(new Set(v).size, id).toBeGreaterThanOrEqual(4);
      for (const k of new Set(v))
        expect(
          v.filter((x) => x === k).length,
          `${id} ${k}`,
        ).toBeLessThanOrEqual(3);
    });
    // the signature of each formation
    expect(sets[0]).toContain("view:cockpit"); // PPL: the view from the cockpit
    expect(sets[0]).toContain("six");
    expect(sets[1]).toContain("view:cockpit"); // night: the night view
    expect(sets[2]).toContain("pfd"); // IR: the G1000 on the ILS
    expect(sets[2]).toContain("gauge:hsi");
    expect(sets[3]).toContain("airlinerPfd"); // ATPL: airliner PFD, ND, a calculation
    expect(sets[3]).toContain("nd");
    expect(sets[3]).toContain("calc:windTriangle");
    // two formations never get the same template
    for (let i = 0; i < sets.length; i++)
      for (let j = i + 1; j < sets.length; j++)
        expect(sets[i].join(), `${i}/${j}`).not.toBe(sets[j].join());
  });
  it("the night template flies at night and the PPL one in the circuit (the situations say so)", () => {
    const sc = showcaseScenes();
    expect(sc["sp.night"].timeOfDay).toBe("night");
    expect(sc["sp.final.night"].timeOfDay).toBe("night");
    expect(sc["sp.short"].timeOfDay).not.toBe("night");
    const night = make(1)
      .steps.flatMap((s) => s.slide!.blocks)
      .filter((b) => b.kind === "simViewport");
    expect(
      night.every(
        (b) => b.kind === "simViewport" && /night/.test(b.scene ?? ""),
      ),
    ).toBe(true);
  });
});

describe("the cover", () => {
  it("shows the typed title, and its line under it is the same neutral sentence for every template", () => {
    const lines = new Set<string>();
    SHOWCASE_DECKS.forEach((d, i) => {
      const c = make(i);
      expect(c.title.fr).toBe("Le tour de piste à Lognes");
      const cover = c.steps[0].slide!;
      const texts = cover.blocks.filter(
        (b) => b.kind === "text" && !b.editorOnly,
      ) as Extract<SlideBlock, { kind: "text" }>[];
      expect(texts.find((b) => b.style === "display")?.text.fr, d.id).toBe(
        "Le tour de piste à Lognes",
      );
      const heading = texts.find((b) => b.style === "heading");
      lines.add(heading!.text.fr!);
      // nothing else: the eyebrow (the formation), the title, the line
      expect(texts.map((b) => b.style).sort(), d.id).toEqual([
        "display",
        "eyebrow",
        "heading",
      ]);
    });
    expect(lines.size).toBe(1);
  });
  it("with no title typed, the course and its cover take the template's name (never a subject it invents)", () => {
    const c = buildNewCourse({
      id: "c",
      lang: "fr",
      title: "",
      program: null,
      subject: null,
      starter: SHOWCASE_DECKS[0],
    });
    expect(c.title.fr).toBe("Leçon PPL : le tour de piste");
    const disp = c.steps[0].slide!.blocks.find(
      (b) => b.kind === "text" && b.style === "display",
    );
    expect(disp && disp.kind === "text" ? disp.text.fr : "").toBe(
      "Leçon PPL : le tour de piste",
    );
  });
});

describe("the notes to the author", () => {
  it("one per slide, never in the reader text, and hidden outside the editor by the renderer", () => {
    for (let i = 0; i < SHOWCASE_DECKS.length; i++)
      for (const s of make(i).steps) {
        const notes = s.slide!.blocks.filter((b) => b.editorOnly);
        expect(notes.length).toBe(1);
        const t = notes[0].kind === "text" ? notes[0].text.fr! : "";
        expect(JSON.stringify(linearText(s.slide!))).not.toContain(
          t.slice(0, 24),
        );
      }
    // the one rule that hides them: every mode but « edit » (play, presenter, projector, thumbnails)
    const render = readFileSync(
      new URL("../src/course/canvas/render.ts", import.meta.url),
      "utf8",
    );
    expect(render).toMatch(/this\.mode !== "edit" && !!b\.editorOnly/);
  });
});

describe("what the course will contain", () => {
  it("one line read from the course the template makes", () => {
    const ppl = starterSummary(SHOWCASE_DECKS[0], "fr");
    expect(ppl).toMatch(/^7 diapos · simulateur intégré/);
    expect(ppl).toContain("1 démonstration pilotée");
    expect(ppl).toContain("1 vol");
    expect(ppl).toContain("1 quiz");
    expect(starterSummary(SHOWCASE_DECKS[3], "en")).toContain(
      "1 calculation tool",
    );
    expect(starterSummary(BLANK_STARTER, "fr")).toMatch(/^1 diapo vierge/);
  });
});

describe("the first slides an empty slide offers", () => {
  it("exist, are all different and each shows something else", () => {
    const all = startSlides();
    const picks = EMPTY_STARTS.map((id) => all.find((g) => g.id === id)!);
    expect(picks.every(Boolean)).toBe(true);
    const main = picks.map((g) => g.slide.blocks.map(visualOf).filter(Boolean).join("+"));
    expect(new Set(main).size).toBe(EMPTY_STARTS.length);
  });
});

describe("readability and validity", () => {
  const fails = (slide: SlideCanvas, lang: "fr" | "en") =>
    slideReadability(slide, { theme: resolveTheme("classroom"), lang })
      .filter((i) => READ_FAILS.has(i.kind))
      .map((i) => `${i.blockId}: ${i.kind}`);
  for (const lang of ["fr", "en"] as const)
    it(`every template and every first slide passes the guard (${lang})`, () => {
      for (let i = 0; i < SHOWCASE_DECKS.length; i++)
        for (const s of make(i, "Le tour de piste à Lognes, vent de travers")
          .steps)
          expect(
            fails(s.slide!, lang),
            `${SHOWCASE_DECKS[i].id}/${s.title.en}`,
          ).toEqual([]);
      for (const g of startSlides().slice(0, 4))
        expect(fails(g.slide, lang), g.id).toEqual([]);
    });
  it("every template validates", () => {
    for (let i = 0; i < SHOWCASE_DECKS.length; i++) {
      const errs = validateCourse(make(i)).filter((e) => e.level === "error");
      expect(
        errs.map((e) => `${e.path}: ${e.message.en}`),
        SHOWCASE_DECKS[i].id,
      ).toEqual([]);
    }
  });
});
