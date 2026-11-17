// Audit item 22 (Lane B fallback): a step without presenter notes still gives the instructor something to say,
// built from the objective and the answer to the slide's question.
import { describe, expect, it } from "vitest";
import { fallbackNotes } from "../src/course/ui/presenterNotes";
import { allSamples } from "../src/course/samples";
import type { Step } from "../src/course/types";

const base = (over: Partial<Step>): Step =>
  ({
    id: "s",
    kind: "learn",
    title: { en: "T", fr: "T" },
    reader: [],
    ...over,
  }) as Step;

describe("fallbackNotes", () => {
  it("says the objective with its hold time, in both languages", () => {
    const s = base({
      goal: {
        all: [{ id: "heading", p: { value: 135, tol: 5 } } as never],
        holdS: 5,
        graded: false,
      },
    });
    const fr = fallbackNotes(s, "fr");
    const en = fallbackNotes(s, "en");
    expect(fr).toHaveLength(1);
    expect(fr[0]).toMatch(/^Faites manipuler : .*135.*, tenue 5 s$/);
    expect(en[0]).toMatch(/^Have them fly it: .*135.*, held 5 s$/);
  });

  it("gives the answer to a multiple-choice question and why", () => {
    const s = base({
      quiz: {
        kind: "mcq",
        prompt: { en: "Q?", fr: "Q ?" },
        options: [
          { text: { en: "Left", fr: "Gauche" } },
          { text: { en: "**Right**", fr: "**Droite**" } },
        ],
        answer: 1,
        explain: { en: "Wind from the right.", fr: "Vent de la droite." },
      },
    });
    expect(fallbackNotes(s, "fr")).toEqual([
      "Réponse : B — Droite. Vent de la droite.",
    ]);
    expect(fallbackNotes(s, "en")).toEqual([
      "Answer: B — Right. Wind from the right.",
    ]);
  });

  it("gives a numeric answer with unit and tolerance", () => {
    const s = base({
      quiz: {
        kind: "numeric",
        prompt: { en: "?" },
        answer: 500,
        tol: 50,
        unit: "ft/min",
        explain: { en: "" },
      },
    });
    expect(fallbackNotes(s, "en")).toEqual([
      "Answer: 500 ft/min (± 50 ft/min)",
    ]);
  });

  it("returns nothing when the step has no objective and no question", () => {
    expect(fallbackNotes(base({}), "fr")).toEqual([]);
  });

  it("reads « À vous » goals and quiz blocks on a designed slide, once each", () => {
    const goal = {
      all: [{ id: "toFrom", p: { value: "TO" } }],
      holdS: 2,
      graded: false,
    };
    const s = base({
      goal: goal as never,
      slide: {
        blocks: [
          {
            id: "a",
            kind: "instrument",
            yourTurn: { where: "slide", prompt: { en: "Go" }, goal },
          },
          {
            id: "q",
            kind: "quiz",
            quiz: {
              kind: "order",
              prompt: { en: "?" },
              items: [{ en: "One" }, { en: "Two" }],
              explain: { en: "" },
            },
          },
        ],
      } as never,
    });
    const en = fallbackNotes(s, "en");
    expect(en).toHaveLength(2);
    expect(en[1]).toBe("Answer: One → Two");
  });

  it("built-in steps that have a goal or a question but no notes get a suggestion", () => {
    let bare = 0;
    for (const c of allSamples())
      for (const st of c.steps) {
        if (st.notes) continue;
        const hasSomething =
          !!st.goal ||
          !!st.quiz ||
          (st.slide?.blocks ?? []).some(
            (b) => b.kind === "quiz" || "yourTurn" in b,
          );
        if (!hasSomething) continue;
        bare++;
        for (const lang of ["en", "fr"] as const) {
          const lines = fallbackNotes(st, lang);
          for (const l of lines) expect(l.trim().length).toBeGreaterThan(8);
        }
      }
    expect(bare).toBeGreaterThan(0);
  });
});
