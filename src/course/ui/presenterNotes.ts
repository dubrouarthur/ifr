// Presenter notes when the author wrote none (audit item 22, Lane B fallback): the console builds a few lines
// from what the step already says — the objective the student must hold (« Faites manipuler : … ») and the answer
// to any question on the slide — so the instructor is never left with « Pas de notes ». Pure: no DOM.
import type {
  CalcSpec,
  DrillSpec,
  FlyIt,
  GoalCheck,
  L10n,
  Lang,
  Quiz,
  ReaderBlock,
  Step,
  StepGoal,
} from "../types";
import { answerIn, getGenerator, problemFor } from "../calc";
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

/** a calculation: what the students work out and the pilot's rule (the answer too when the numbers are fixed) */
function calcLines(spec: CalcSpec, lang: Lang): string[] {
  const g = getGenerator(spec.generatorId);
  if (!g) return [];
  const out = [(lang === "fr" ? "Faites calculer : " : "Have them work out: ") + plain(tx(g.title, lang))];
  try {
    const pr = problemFor(spec, spec.seed ?? 1);
    const rule = plain(tx(pr.ruleOfThumb, lang));
    if (rule) out.push((lang === "fr" ? "La règle : " : "The rule: ") + rule);
    if (spec.seed !== undefined) {
      const a = answerIn(pr, spec.unit);
      out.push(`${lang === "fr" ? "Réponse : " : "Answer: "}${Math.round(a.answer * 100) / 100} ${a.unit} (± ${a.tolerance})`);
    }
  } catch {
    /* a generator that cannot pose with these params: the title is enough */
  }
  return out;
}
function drillLine(d: DrillSpec, lang: Lang): string {
  const names = d.generatorIds
    .map((id) => getGenerator(id))
    .filter((g): g is NonNullable<typeof g> => !!g)
    .map((g) => plain(tx(g.title, lang)));
  return lang === "fr"
    ? `Entraînement chronométré : ${d.count} calculs (${names.join(", ")}). Pour l’élève seul, jamais noté.`
    : `Timed practice: ${d.count} problems (${names.join(", ")}). For the student only, never graded.`;
}
/** after a drill: what the instructor does with the scores */
const drillAfter = (lang: Lang): string =>
  lang === "fr"
    ? "Après la série : demandez les scores à main levée, puis refaites au tableau le calcul le plus raté."
    : "After the drill: ask for the scores by a show of hands, then redo the most missed calculation on the board.";
/** a Fly it: the brief, then what is checked */
function flyLines(f: FlyIt, lang: Lang): string[] {
  const out: string[] = [];
  const brief = plain(tx(f.brief, lang));
  if (brief) out.push((lang === "fr" ? "Briefez : " : "Brief: ") + brief);
  const crit = f.criteria.map((c) => plain(tx(c.label, lang))).filter(Boolean);
  if (crit.length) out.push((lang === "fr" ? "Critères : " : "Criteria: ") + crit.join(", "));
  else
    out.push(
      lang === "fr"
        ? "Vol dans le simulateur : l’exercice évalue le vol, débriefez au retour."
        : "A flight in the simulator: the exercise grades it, debrief when they come back.",
    );
  return out;
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
  if (step.calc) for (const l of calcLines(step.calc, lang)) push(l);
  if (step.drill) {
    push(drillLine(step.drill, lang));
    push(drillAfter(lang));
  }
  if (step.flyIt) for (const l of flyLines(step.flyIt, lang)) push(l);
  for (const b of step.slide?.blocks ?? []) {
    const yt = (b as { yourTurn?: { goal?: StepGoal } }).yourTurn;
    if (yt?.goal) push(goalLine(yt.goal, lang));
    if (b.kind === "quiz") push(quizLine(b.quiz, lang));
  }
  // nothing to fly and nothing to answer (a demo, an explanation): the author's own note on the slide (« En
  // classe : … », only the author sees it), then the slide's points to say, in reading order (re-walk P2: a template
  // demo slide showed « Pas de notes pour cette diapo »). A step with one objective or one answer gets the points to
  // say too (interactivity guard: at least two lines to work from), and a reader step (no designed slide) takes its
  // points from the reader.
  if (out.length < 2) {
    const title = plain(tx(step.title, lang));
    /** a point worth saying: a phrase, not a label or the title again */
    const worth = (p: string) => p.length >= 12 && p !== title;
    let said = 0;
    const say = (p: string) => {
      if (!worth(p) || said >= 3) return;
      said++;
      push((lang === "fr" ? "À dire : " : "Say: ") + p);
    };
    const blocks = [...(step.slide?.blocks ?? [])].sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x);
    if (!out.length)
      for (const b of blocks)
        if (b.kind === "text" && b.editorOnly) push(plain(tx(b.text, lang)));
    const points: string[] = [];
    for (const b of blocks) {
      if (b.editorOnly || b.presenterOnly || b.figure) continue;
      if (
        b.kind === "text" &&
        (b.style === "body" || b.style === "heading" || b.style === "lead" || b.style === "subtitle" || b.style === "quote")
      )
        points.push(plain(tx(b.text, lang)));
      else if (b.kind === "callout") points.push(plain(tx(b.text, lang)));
      else if (b.kind === "checklist") for (const r of b.rows) points.push(plain(tx(r.text, lang)));
    }
    // the reader: the step's own text (reader + stage steps), or a designed slide's linear text when the slide
    // itself says too little
    const readerPoints = (rs: readonly ReaderBlock[]): void => {
      for (const r of rs) {
        if (r.t === "text" || r.t === "takeaway") points.push(plain(tx(r.text, lang)));
        else if (r.t === "keys") for (const k of r.items) points.push(plain(tx(k, lang)));
        else if (r.t === "reveal") readerPoints(r.blocks);
        else if (r.t === "formula") {
          // a numbers slide: the formula to write on the board, then the worked example
          points.push((lang === "fr" ? "La formule : " : "The formula: ") + plain(tx(r.formula, lang)));
          if (r.ruleOfThumb) points.push(plain(tx(r.ruleOfThumb, lang)));
        }
      }
    };
    if (points.filter(worth).length + out.length < 2) readerPoints(step.reader ?? []);
    for (const p of points.filter(Boolean)) say(firstSentence(p));
  }
  return out;
}

/** a long paragraph is said by its first sentence (the console's line stays short) */
function firstSentence(s: string): string {
  if (s.length <= 160) return s;
  const m = /^(.{40,200}?[.!?…])(\s|$)/.exec(s);
  return m ? m[1] : `${s.slice(0, 157).trimEnd()}…`;
}
