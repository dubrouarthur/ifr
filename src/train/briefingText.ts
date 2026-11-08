// The words a briefing shows for an exercise, in the UI language: the French the curriculum authors (summary,
// objectives, standards, briefing, the knowledge check, the steps) and the French title of library/meta.ts. The
// ATC clearance stays in English phraseology. Nothing is machine-translated: a field without French keeps its
// English. Pure (no DOM): ui/learn.ts builds the cockpit deck from it, a test checks a French deck.
import { LESSON_META } from "../library/meta";
import type { Exercise, Quiz, Step } from "./engine";

export interface ExerciseWords {
  title: string;
  summary: string;
  objectives: readonly string[];
  standards: readonly string[];
  briefing: readonly string[];
  quiz?: { question: string; options: readonly string[]; answer: number; explain: string };
  steps: string[];
}

export function exerciseWords(
  ex: Exercise,
  rt: { quiz?: Quiz; steps: readonly Pick<Step, "text" | "fr">[] },
  lang: "fr" | "en",
): ExerciseWords {
  const fr = lang === "fr";
  const xf = fr ? ex.fr : undefined;
  const q = rt.quiz;
  const qf = fr ? q?.fr : undefined;
  return {
    title: fr ? (LESSON_META[ex.id]?.fr ?? ex.title) : ex.title,
    summary: xf?.summary ?? ex.summary,
    objectives: xf?.objectives ?? ex.objectives,
    standards: xf?.standards ?? ex.standards,
    briefing: xf?.briefing ?? ex.briefing,
    ...(q
      ? {
          quiz: {
            question: qf?.question ?? q.question,
            options: qf?.options ?? q.options,
            answer: q.answer,
            explain: qf?.explain ?? q.explain,
          },
        }
      : {}),
    steps: rt.steps.map((s) => (fr && s.fr ? s.fr : s.text)),
  };
}
