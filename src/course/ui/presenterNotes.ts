// Presenter notes when the author wrote none (audit item 22, Lane B fallback): the console builds a few lines
// from what the step already says — the objective the student must hold (« Faites manipuler : … ») and the answer
// to any question on the slide — so the instructor is never left with « Pas de notes ». Pure: no DOM.
import { toolDef } from "../tools/index";
import type {
  CalcSpec,
  DrillSpec,
  FlyIt,
  GoalCheck,
  L10n,
  Lang,
  Quiz,
  ReaderBlock,
  SlideCanvas,
  SlideLayoutId,
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
    if (b.kind === "tool") {
      const d = toolDef(b.tool);
      if (b.task) push((lang === "fr" ? "Tâche : " : "Task: ") + tx(b.task.prompt, lang));
      if (d) push(tx(d.note, lang));
    }
    if (b.kind === "engine3d") push(tx(ENGINE_NOTE, lang));
  }
  // nothing to fly and nothing to answer (a demo, an explanation): the author's own note on the slide (« En
  // classe : … », only the author sees it), then the slide's points to say, in reading order (re-walk P2: a template
  // demo slide showed « Pas de notes pour cette diapo »). A step with one objective or one answer gets the points to
  // say too (interactivity guard: at least two lines to work from), and a reader step (no designed slide) takes its
  // points from the reader.
  // how to teach with this kind of slide (a layout of the studio), when the step gives less than two lines
  const teach = step.slide?.layout ? LAYOUT_TEACH[step.slide.layout] : undefined;
  for (const t of teach ? [teach].flat() : []) if (out.length < 2) push(tx(t, lang));
  if (out.length < 2) {
    const title = plain(tx(step.title, lang));
    /** a point worth saying: a phrase, not a label or the title again (the interactivity guard does not count these
     *  « À dire » lines alone: a step also needs an objective, an answer, a rule or how to teach the slide) */
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

/**
 * How to teach with each kind of slide, for the presenter (the instructor techniques of the FAA Aviation
 * Instructor's Handbook, ch. 4 « Effective communication » and ch. 5 « The teaching process »: ask before telling,
 * have the students restate, one idea at a time).
 */
const LAYOUT_TEACH: Partial<Record<SlideLayoutId, L10n | L10n[]>> = {
  cover: {
    en: "Say in one sentence what the class will be able to do at the end, and how long it takes.",
    fr: "Dites en une phrase ce que la classe saura faire à la fin, et combien de temps cela prend.",
  },
  title: {
    en: "Say in one sentence what the class will be able to do at the end, and how long it takes.",
    fr: "Dites en une phrase ce que la classe saura faire à la fin, et combien de temps cela prend.",
  },
  section: {
    en: "Say where we are in the lesson, what was seen, and what this part adds.",
    fr: "Dites où l’on en est de la leçon, ce qui a été vu, et ce que cette partie ajoute.",
  },
  bigNumber: {
    en: "Ask where the number comes from before you say it, then have a student use it on an example.",
    fr: "Demandez d’où vient ce chiffre avant de le dire, puis faites-le appliquer par un élève sur un exemple.",
  },
  heroDiagram: {
    en: "Leave the diagram up a few seconds in silence, then ask what the class sees before naming each part.",
    fr: "Laissez le schéma quelques secondes en silence, puis demandez ce que la classe y voit avant de nommer chaque partie.",
  },
  compare: {
    en: "Ask what changed between the two pictures before you say it: one thing only changes.",
    fr: "Demandez ce qui a changé entre les deux images avant de le dire : une seule chose change.",
  },
  stepByStep: [
    {
      en: "Reveal one step at a time, and ask what comes next before each reveal.",
      fr: "Révélez une étape à la fois, et demandez ce qui vient ensuite avant chaque révélation.",
    },
    {
      en: "At the end, have a student recite the steps in order without the slide, the others check.",
      fr: "À la fin, faites réciter les étapes dans l’ordre par un élève, sans la diapo ; les autres vérifient.",
    },
  ],
  instrumentNotes: {
    en: "Point at each callout in turn and ask what the needle says before you read the value.",
    fr: "Montrez chaque repère à tour de rôle et demandez ce que dit l’aiguille avant de lire la valeur.",
  },
  formula: {
    en: "Write the formula on the board, work the first line with the class, let them do the next one.",
    fr: "Écrivez la formule au tableau, faites la première ligne avec la classe, laissez-les faire la suivante.",
  },
  recap: {
    en: "Have a student restate each point in their own words before moving on.",
    fr: "Faites reformuler chaque point par un élève, avec ses mots, avant de passer à la suite.",
  },
  ready: {
    en: "Read the standards aloud: they are the ones of the flight that follows.",
    fr: "Lisez les critères à voix haute : ce sont ceux du vol qui suit.",
  },
  twoColumn: {
    en: "Take one column at a time, then ask the class for the one difference that matters.",
    fr: "Prenez une colonne à la fois, puis demandez à la classe la différence qui compte.",
  },
  fullBleed: {
    en: "Leave the picture up a few seconds in silence, then ask what the pilot would do here.",
    fr: "Laissez l’image quelques secondes en silence, puis demandez ce que ferait le pilote ici.",
  },
  calc: {
    en: "Let them work it out alone for a minute, then compare two answers before showing the solution.",
    fr: "Laissez-les calculer seuls une minute, puis comparez deux réponses avant de montrer la solution.",
  },
};

/** What the presenter does on a new slide (a layout, a ready slide), in the console's own words. Pure. */
/** how to teach with a 3D engine (course/engines): the console drives it, the projection follows (diagramMirror) */
const ENGINE_NOTE: L10n = {
  en: "Choose a step to pause the cutaway and name its parts; the gauges keep running. Move a lever on your console and have the class read the gauges before you say what happened.",
  fr: "Choisissez une étape pour figer la coupe et nommer ses pièces ; les jauges continuent. Bougez une manette sur votre console et faites lire les jauges à la classe avant de dire ce qui s’est passé.",
};
/** how to teach with a teaching tool (course/tools): the same controls on the console, the projection follows */
const TOOL_NOTE: L10n = {
  en: "The tool's controls are on your console too, and the projection follows. Ask the class to predict each change before you make it.",
  fr: "Les commandes de l’outil sont aussi sur votre console, et la projection suit. Faites prédire chaque changement à la classe avant de le faire.",
};
export function slideNotes(s: SlideCanvas): { en: string; fr: string } {
  const bs = s.blocks;
  const yt = bs.some((b) => !!(b as { yourTurn?: unknown }).yourTurn);
  const moving = bs.some((b) => b.kind === "instrument" && !!b.motion);
  const live = bs.some((b) => b.kind === "instrument" || b.kind === "simViewport");
  const quiz = bs.some((b) => b.kind === "quiz");
  const en: string[] = [];
  const fr: string[] = [];
  const teach = s.layout ? LAYOUT_TEACH[s.layout] : undefined;
  if (teach && !quiz && !yt)
    for (const t of [teach].flat()) {
      en.push(t.en);
      fr.push(t.fr ?? t.en);
    }
  if (quiz) {
    en.push("Let the class answer first, then show the answer and say why.");
    fr.push("Laissez la classe répondre d’abord, puis montrez la réponse et dites pourquoi.");
  }
  if (moving) {
    en.push("The animation plays by itself; “Replay the animation” in the demonstration deck shows it again.");
    fr.push("L’animation se joue seule ; « Rejouer l’animation » dans la démonstration la remontre.");
  }
  if (live) {
    en.push("“Fly the demonstration”: heading, altitude and power by hand, the projection follows (try a standard-rate turn).");
    fr.push("« Piloter la démonstration » : cap, altitude et puissance à la main, la projection suit (essayez un virage standard).");
  }
  if (bs.some((b) => b.kind === "tool")) {
    en.push(TOOL_NOTE.en);
    fr.push(TOOL_NOTE.fr ?? TOOL_NOTE.en);
  }
  if (bs.some((b) => b.kind === "engine3d")) {
    en.push(ENGINE_NOTE.en);
    fr.push(ENGINE_NOTE.fr ?? ENGINE_NOTE.en);
  }
  if (yt) {
    en.push("“Let a student fly here”: the goal on the slide says when it is done.");
    fr.push("« Faire piloter un élève ici » : l’objectif de la diapo dit quand c’est réussi.");
  }
  if (!en.length) {
    en.push("Say it in your words; the slide keeps the numbers.");
    fr.push("Dites-le avec vos mots ; la diapo garde les chiffres.");
  }
  return { en: en.join(" "), fr: fr.join(" ") };
}
