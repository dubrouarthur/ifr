// « Assistant IA » — from a plan to a course: « Créer le cours » makes a new course through the same path as the
// « Nouveau cours » templates (buildNewCourse); « Ajouter au cours » inserts the deck like a template
// (addStarterDeck), so the editor records it as one change (one undo step).
import type { Course, L10n, Lang } from "../types";
import { addStarterDeck } from "../ui/deckStarters";
import { buildNewCourse } from "../ui/newCourse";
import type { ProgramId } from "../../library/programs";
import { finishCourse, mapPlan } from "./mapper";
import type { DeckPlan } from "./schema";
import type { AiFormation } from "./prompt";

/** The library's programme of a formation of the dialog. */
export const programOf = (f: AiFormation): ProgramId =>
  f === "lapl-ppl" ? "ppl" : f;

export function courseFromPlan(
  plan: DeckPlan,
  o: {
    id: string;
    lang: Lang;
    formation: AiFormation;
    run?: string;
    now?: Date;
  },
): { course: Course; warnings: L10n[] } {
  const m = mapPlan(plan, {
    formation: o.formation,
    ...(o.run ? { run: o.run } : {}),
  });
  const c = buildNewCourse({
    id: o.id,
    lang: o.lang,
    title: "",
    program: programOf(o.formation),
    subject: null,
    starter: m.starter,
    ...(o.now ? { now: o.now } : {}),
  });
  return { course: finishCourse(c, plan), warnings: m.warnings };
}

export function addPlanToCourse(
  course: Course,
  plan: DeckPlan,
  o: { at?: number; run?: string } = {},
): { course: Course; firstStepId: string | null; warnings: L10n[] } {
  const m = mapPlan(plan, o.run ? { run: o.run } : {});
  const r = addStarterDeck(course, m.starter, {
    ...(o.at !== undefined ? { at: o.at } : {}),
  });
  return { ...r, warnings: m.warnings };
}
