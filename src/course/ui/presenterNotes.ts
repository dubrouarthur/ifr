// Presenter notes when the author wrote none (audit item 22, Lane B fallback): the console builds a few lines
// from what the step already says — the objective the student must hold (« Faites manipuler : … ») and the answer
// to any question on the slide — so the instructor is never left with « Pas de notes ». Pure: no DOM.
import type { GoalCheck, L10n, Lang, Quiz, Step, StepGoal } from "../types";
import { goalLabel } from "../goals";

const tx = (t: L10n | undefined, lang: Lang): string =>
  (t ? (lang === "fr" ? t.fr || t.en : t.en) : "").trim();

/** strip the reader markup (**b**, *i*, [[label|id]]) for a plain line */
const plain = (s: string): string =>
  s
    .replace(/\[\[([^|\]]+)\|[^\]]*\]\]/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

function goalLine(g: StepGoal, lang: Lang): string | null {
  const parts = g.all.map((c: GoalCheck) => goalLabel(c, lang)).filter(Boolean);
  if (!parts.length) return null;
  const hold = g.holdS && g.holdS > 0 ? Math.round(g.holdS) : 0;
  const held = hold
    ? lang === "fr"
      ? `, tenue ${hold} s`
      : `, held ${hold} s`
    : "";
  return (
    (lang === "fr" ? "Faites manipuler : " : "Have them fly it: ") +
    parts.join(", ") +
    held
  );
}

function answerText(q: Quiz, lang: Lang): string {
  switch (q.kind) {
    case "mcq": {
      const o = q.options[q.answer];
      const letter = String.fromCharCode(65 + q.answer);
      return o ? `${letter} — ${plain(tx(o.text, lang))}` : "";
    }
    case "numeric": {
      const unit = q.unit ? ` ${q.unit}` : "";
      const tol = q.tol > 0 ? ` (± ${q.tol}${unit})` : "";
      return `${q.answer}${unit}${tol}`;
    }
    case "order":
      return q.items.map((it) => plain(tx(it, lang))).join(" → ");
    case "fly":
      return q.answer.map((c) => goalLabel(c, lang)).join(", ");
    default:
      return "";
  }
}

function quizLine(q: Quiz, lang: Lang): string | null {
  const ans = answerText(q, lang);
  const why = plain(tx(q.explain, lang));
  if (!ans && !why) return null;
  const head = lang === "fr" ? "Réponse : " : "Answer: ";
  if (!ans) return head + why;
  return `${head}${ans}${why ? `. ${why}` : ""}`;
}

/**
 * Suggested notes for a step without presenter notes: one line per objective (step goal, « À vous » goals on the
 * slide) and per question (step quiz, quiz blocks). Empty when the step has nothing to build from.
 */
export function fallbackNotes(step: Step, lang: Lang): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string | null) => {
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  };
  if (step.goal) push(goalLine(step.goal, lang));
  if (step.quiz) push(quizLine(step.quiz, lang));
  for (const b of step.slide?.blocks ?? []) {
    const yt = (b as { yourTurn?: { goal?: StepGoal } }).yourTurn;
    if (yt?.goal) push(goalLine(yt.goal, lang));
    if (b.kind === "quiz") push(quizLine(b.quiz, lang));
  }
  return out;
}
