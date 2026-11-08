// In flight and in the cockpit briefing, a French pilot reads French: the step instructions, the deviations, the
// set-up checklist, the exercise's briefing words and its knowledge check. The English text stays the canonical
// one (the ATC voice and the result report read it). Fails when a French deck shows English curriculum words.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installFakeSvgDom } from "./fakeSvgDom";
import { Sim } from "../src/sim/sim";
import { EXERCISES } from "../src/train/curriculum";
import { LessonRun, stepText, violationText } from "../src/train/engine";
import { holdSetup } from "../src/train/setupAssist";
import { exerciseWords } from "../src/train/briefingText";
import { generatedBriefing } from "../src/course/ui/briefingDeck";
import { setLang } from "../src/ui/i18n";

const mem = new Map<string, string>();
beforeAll(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  installFakeSvgDom();
  setLang("fr");
});
afterAll(() => setLang("en"));

const ex = (id: string) => EXERCISES.find((e) => e.id === id)!;

describe("in flight, in French", () => {
  it("the hold step reads French; its English text stays for the ATC voice and the report", () => {
    const run = new LessonRun(ex("hold-ndb"), new Sim());
    const st = run.rt.steps[0];
    expect(st.text).toMatch(/^Enter and fly the hold at PA/);
    expect(stepText(st)).toMatch(/^Entrez et effectuez l’attente à PA : 2 tours complets/);
  });
  it("deviations read French", () => {
    expect(violationText("Altitude +120 ft")).toBe("Altitude +120 ft");
    expect(violationText("Heading -12°")).toBe("Cap -12°");
    expect(violationText("Bank 38° (max 30)")).toBe("Inclinaison 38° (max 30)");
    expect(violationText("Stall warning")).toBe("Alarme de décrochage");
    expect(violationText("Overshot 090 by 14°")).toBe("Cap 090 dépassé de 14°");
  });
  it("the set-up checklist of a hold on an NDB reads French", () => {
    const run = new LessonRun(ex("hold-ndb"), new Sim());
    const def = run.rt.hold!;
    const labels = holdSetup(run.sim, def).map((i) => i.label);
    expect(labels).toContain("BRG1 sur ADF");
    expect(labels.some((l) => /^Entrée : (directe|décalée|parallèle)$/.test(l))).toBe(true);
    expect(labels).toContain("Chronométrer l’éloignement depuis le travers");
    expect(labels.join(" ")).not.toMatch(/Entry:|Time outbound|Slow to holding/);
  });
});

describe("the cockpit briefing deck, in French", () => {
  // English words of train/curriculum.ts that a French deck must not show
  const EN = [
    "Determine the AIM entry",
    "Inbound legs 1:00",
    "Non-holding side excursion",
    "Six Ts at the fix",
    "A 25 kt crosswind",
    "Which entry?",
    "TEARDROP",
    "Holding with a strong wind",
    "Enter and fly the hold",
  ];
  it("hold-wind: title, summary, objectives, standards, question and steps in French", () => {
    const e = ex("hold-wind");
    const run = new LessonRun(e, new Sim());
    const w = exerciseWords(e, run.rt, "fr");
    expect(w.title).toBe("Attente par vent fort");
    expect(w.quiz?.options).toEqual(["DIRECTE", "DÉCALÉE", "PARALLÈLE"]);
    const deck = generatedBriefing(
      {
        id: e.id,
        title: w.title,
        summary: w.summary,
        stage: e.stage,
        minutes: e.minutes,
        allowAp: e.allowAp,
        objectives: w.objectives,
        standards: w.standards,
        briefing: w.briefing,
        clearance: run.rt.clearance,
        ...(w.quiz ? { quiz: w.quiz } : {}),
        steps: w.steps,
      },
      "fr",
    );
    // the French side of every text block of the deck
    const fr: string[] = [];
    const walk = (x: unknown) => {
      if (!x || typeof x !== "object") return;
      const o = x as Record<string, unknown>;
      if (typeof o.fr === "string") fr.push(o.fr);
      for (const v of Object.values(o)) walk(v);
    };
    walk(deck);
    const all = fr.join("\n");
    for (const s of EN) expect(all, s).not.toContain(s);
    // the clearance stays in English phraseology
    expect(all).toContain("Hold EAST of ARD");
  });
});
