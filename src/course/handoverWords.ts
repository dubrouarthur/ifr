// Taking the controls — the ONE vocabulary (FR / EN). Every place a course hands the aircraft to the student uses
// these eight phrases and no other: the slide's instrument button, the stage, the Fly it card, the cockpit's brief
// card and course strip. The other string tables (canvas/strings.ts, stage/strings.ts, ui/reader.ts, course/i18n.ts,
// ui/courseFlight.ts) take their words from here; tests/course-handover.test.ts checks that none of them says it
// differently. No imports besides the Lang type: any module may depend on this one.
import type { Lang } from "./types";

export const HANDOVER_WORDS = {
  /** the card before */
  yourTurn: ["Your turn", "À vous"],
  /** the one filled button that starts it */
  take: ["Take the controls", "Prendre les commandes"],
  /** the state while the student acts */
  youHave: ["You have the controls", "Vous avez les commandes"],
  /** the demo */
  showMe: ["Show me", "Montrez-moi"],
  /** stop */
  handBack: ["Hand back the controls", "Rendre les commandes"],
  tryAgain: ["Try again", "Réessayer"],
  /** go to the full cockpit */
  flyInSim: ["Fly it in the simulator", "Voler dans le simulateur"],
  /** return to the slides (from the cockpit, or from a Your turn opened over a slide) */
  backToCourse: ["Back to the course", "Reprendre le cours"],
} as const satisfies Record<string, readonly [string, string]>;
export type HandoverWord = keyof typeof HANDOVER_WORDS;

/** A phrase of the vocabulary in the language. */
export const hw = (k: HandoverWord, lang: Lang = "en"): string =>
  HANDOVER_WORDS[k][lang === "fr" ? 1 : 0];
/** The pair [EN, FR] as a plain tuple, for the string tables that hold such pairs. */
export const hwPair = (k: HandoverWord): [string, string] => [
  HANDOVER_WORDS[k][0],
  HANDOVER_WORDS[k][1],
];
/** The phrase in French quotes / English quotes, for a sentence that names a button. */
export const hwq = (k: HandoverWord, lang: Lang = "en"): string =>
  lang === "fr" ? `« ${hw(k, lang)} »` : `“${hw(k, lang)}”`;

/**
 * Phrasings the product used before for the same gestures. None may come back as a button or a chip (the test
 * scans the string tables for them).
 */
export const RETIRED_HANDOVER_WORDS: readonly string[] = [
  "Manipuler l’instrument",
  "Manipuler l'instrument",
  "Use the instrument",
  "Le faire dans le simulateur",
  "Montre-moi",
  "Back to my turn",
  "Take over",
  "Retour à la diapositive",
  "Back to the slide",
  "Retour au cours",
  "Commencer le vol",
  "Start the flight",
];
