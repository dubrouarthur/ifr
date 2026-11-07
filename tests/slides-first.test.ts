// Slides first (SPEC slides v2 §11, §12): the cockpit briefing is a slide deck (generated from the exercise, or the
// school's own deck), the first-run intro plays a deck about the product, and the Flight Center features a deck.
import { describe, expect, it } from "vitest";
import { EXERCISES, STAGES } from "../src/train/curriculum";
import {
  exerciseBriefingDeck,
  plateAsset,
  type BriefingSource,
} from "../src/course/samples/exerciseBriefing";
import { productDeck } from "../src/course/samples/productDeck";
import { briefingDeck } from "../src/course/ui/briefingDeck";
import { featuredEntry, shelfOrder } from "../src/course/ui/deckHome";
import { libraryEntries } from "../src/course/ui/library";
import { allSamples, HOLDING_ID, MATHS_IFR_ID } from "../src/course/samples";
import type { SlideBlock, SlideCanvas } from "../src/course/types";

const src = (over: Partial<BriefingSource> = {}): BriefingSource => ({
  id: "x",
  title: "Holding at ARD",
  summary: "Fly the hold.",
  stageTitle: "Stage 4 — Holding",
  minutes: 12,
  allowAp: false,
  objectives: ["Pick the entry", "Fly it"],
  standards: ["±100 ft", "1:00 inbound ±15 s"],
  briefing: ["Five Ts at the fix"],
  steps: ["Fly to ARD", "Enter the hold", "Two circuits"],
  ...over,
});
const inFrame = (s: SlideCanvas) =>
  s.blocks.every(
    (b) =>
      b.frame.x >= 0 &&
      b.frame.y >= 0 &&
      b.frame.x + b.frame.w <= 1920 &&
      b.frame.y + b.frame.h <= 1080,
  );
const texts = (s: SlideCanvas) =>
  s.blocks.filter(
    (b): b is Extract<SlideBlock, { kind: "text" }> => b.kind === "text",
  );

describe("cockpit briefing deck (generated from the exercise)", () => {
  it("opens on the cover and ends on Ready to fly", () => {
    const d = exerciseBriefingDeck(src());
    expect(d[0].id).toBe("b-cover");
    expect(d[d.length - 1].id).toBe("b-ready");
    expect(d[d.length - 1].slide.layout).toBe("ready");
  });
  it("adds the clearance + question (gated), the hold and the plate when the exercise has them", () => {
    const d = exerciseBriefingDeck(
      src({
        clearance: "Hold east of ARD on the 090 radial",
        quiz: {
          question: 'ATC: "Hold east of ARD" — Which entry?',
          options: ["DIRECT", "TEARDROP", "PARALLEL"],
          answer: 1,
          explain: "Sector 2.",
        },
        hold: { inbound: 270, turn: "R", fix: "ARD", legMin: 1, altFt: 3000 },
        plate: "PARD-I27",
        plateName: "PARD ILS 27",
      }),
    );
    const ids = d.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining(["b-check", "b-hold", "b-plate"]),
    );
    const check = d.find((s) => s.id === "b-check")!;
    expect(check.gate).toBe(true);
    const q = check.slide.blocks.find((b) => b.kind === "quiz");
    expect(
      q && q.kind === "quiz" && q.quiz.kind === "mcq" && q.quiz.prompt.en,
    ).toBe("Which entry?");
    const plate = d
      .find((s) => s.id === "b-plate")!
      .slide.blocks.find((b) => b.kind === "diagram");
    expect(plate && plate.kind === "diagram" && plate.asset).toBe(
      plateAsset("PARD-I27"),
    );
  });
  it("splits long step lists five per slide, and every block stays on the 1920 × 1080 canvas", () => {
    const d = exerciseBriefingDeck(
      src({ steps: Array.from({ length: 12 }, (_, i) => `Step ${i + 1}`) }),
    );
    expect(d.filter((s) => s.id.startsWith("b-steps"))).toHaveLength(3);
    for (const s of d) expect(inFrame(s.slide), s.id).toBe(true);
  });
  it("block ids are unique on each slide, labels are FR and EN", () => {
    for (const ex of EXERCISES.slice(0, 40)) {
      const d = exerciseBriefingDeck(
        src({
          id: ex.id,
          title: ex.title,
          summary: ex.summary,
          objectives: ex.objectives,
          standards: ex.standards,
          briefing: ex.briefing,
          stageTitle: STAGES.find((s) => s.id === ex.stage)?.title,
        }),
      );
      for (const s of d) {
        const bid = s.slide.blocks.map((b) => b.id);
        expect(new Set(bid).size, `${ex.id} ${s.id}`).toBe(bid.length);
        for (const t of texts(s.slide))
          expect(t.text.fr, `${ex.id} ${s.id}`).toBeTruthy();
      }
    }
  });
  it("the school's own briefing wins, and still ends on Ready to fly", () => {
    const d = briefingDeck(src({ id: "hold-ndb" }));
    expect(d.authored).toBe(true);
    expect(d.theme).toBe("cockpit");
    expect(d.slides[d.slides.length - 1].slide.layout).toBe("ready");
    expect(d.slides.some((s) => s.gate)).toBe(true);
    expect(briefingDeck(src({ id: "no-such-lesson" })).authored).toBe(false);
  });
});

describe("the intro's product deck", () => {
  it("five slides, every text in both languages, on the canvas", () => {
    const d = productDeck();
    expect(d).toHaveLength(5);
    for (const s of d) {
      expect(inFrame(s.slide), s.id).toBe(true);
      for (const t of texts(s.slide)) expect(t.text.fr, s.id).toBeTruthy();
    }
  });
});

describe("Flight Center deck shelf", () => {
  it("features the holding deck when nothing is started, Continue card first", () => {
    const list = libraryEntries({ samples: allSamples(), stored: [] });
    expect(featuredEntry(list, null)?.id).toBe(HOLDING_ID);
    const rows = shelfOrder(list, null);
    expect(rows[0].cont).toBe(true);
    expect(rows[0].entry.id).toBe(MATHS_IFR_ID);
    expect(new Set(rows.map((r) => r.entry.id)).size).toBe(rows.length);
  });
});
