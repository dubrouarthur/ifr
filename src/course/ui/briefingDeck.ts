// The cockpit briefing as a slide deck (SPEC slides v2 §11): the deck a school wrote for the lesson (a sample or
// stored course with briefingFor) when there is one, else the deck generated from the exercise
// (lesson/briefingDeck.ts buildBriefingDeck). Loaded on demand by ui/learn.ts (BriefingModal), so the slide engine
// joins the cockpit only when a lesson is briefed.
import { briefingForLesson } from "../samples";
import { type BriefingSource } from "../samples/exerciseBriefing";
import { buildBriefingDeck } from "../../lesson/briefingDeck";
import {
  DeckStage,
  hasQuiz,
  type DeckSlide,
  type DeckStageOptions,
} from "./deckStage";
import type { Cockpit, Course, Lang, SimScene, ThemeId } from "../types";

export { DeckStage, type BriefingSource };

export interface BriefingDeck {
  slides: DeckSlide[];
  theme: ThemeId;
  scenes: Record<string, SimScene>;
  cockpit?: Cockpit;
  /** written by a school (true) or generated from the exercise (false) */
  authored: boolean;
}

/** The generated briefing (a Course with shape 'briefing') of the exercise a BriefingSource describes. */
export function generatedBriefing(
  src: BriefingSource,
  lang: Lang = "en",
): Course {
  return buildBriefingDeck(
    {
      id: src.id,
      stage: src.stage ?? "",
      title: src.title,
      summary: src.summary,
      objectives: src.objectives,
      standards: src.standards,
      briefing: src.briefing,
      ...(src.plate ? { plate: src.plate } : {}),
      allowAp: src.allowAp,
      minutes: src.minutes,
    },
    lang,
    {
      steps: src.steps,
      ...(src.clearance ? { clearance: src.clearance } : {}),
      ...(src.quiz ? { quiz: src.quiz } : {}),
      ...(src.hold ? { hold: src.hold } : {}),
      ...(src.setup ? { setup: src.setup } : {}),
    },
  );
}

const slidesOf = (c: Course): DeckSlide[] =>
  c.steps
    .filter((s) => !!s.slide)
    .map((s) => ({
      id: s.id,
      title: s.title,
      slide: s.slide!,
      step: s,
      gate: hasQuiz(s.slide!),
    }));

/** The deck that briefs an exercise. */
export function briefingDeck(
  src: BriefingSource,
  lang: Lang = "en",
): BriefingDeck {
  const c = briefingForLesson(src.id);
  const own = c ? slidesOf(c) : [];
  if (c && own.length) {
    // the deck ends on "Ready to fly" (objectives and standards) when the school's deck has none
    if (!own.some((s) => s.slide.layout === "ready")) {
      const gen = slidesOf(generatedBriefing(src, lang));
      const ready = gen[gen.length - 1];
      if (ready) own.push(ready);
    }
    return {
      slides: own,
      // the course's own theme (light by default, also in the cockpit)
      theme: c.theme ?? "classroom",
      scenes: c.scenes,
      cockpit: c.cockpit,
      authored: true,
    };
  }
  const g = generatedBriefing(src, lang);
  return {
    slides: slidesOf(g),
    theme: g.theme ?? "classroom",
    scenes: g.scenes,
    cockpit: g.cockpit,
    authored: false,
  };
}

/** A DeckStage for a briefing deck. */
export function briefingStage(
  d: BriefingDeck,
  o: Omit<DeckStageOptions, "slides" | "theme" | "scenes" | "cockpit"> & {
    lang: Lang;
  },
): DeckStage {
  return new DeckStage({
    ...o,
    slides: d.slides,
    theme: d.theme,
    scenes: d.scenes,
    cockpit: d.cockpit,
  });
}
