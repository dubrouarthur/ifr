// Ground school player (package E) — the Reader column and the player's shared UI kit.
//   - UI strings (FR / EN) of the player, quiz, calc, drill, outline and debrief (author content stays L10n);
//   - small DOM helpers (h() from ui/dom, line icons, kind chips, the "EN" marker on a missing French text);
//   - ReaderView: the reader blocks of a step (heading, text with [[label|id]] linked terms, image, diagram, keys,
//     "Do this" rows ticked live by the sim, reveal, procedure, takeaway, inline quiz, formula card).
// No DOM work at import time (the pure helpers are unit-tested in node).
import { h } from "../../ui/dom";
import type {
  CalcRef,
  Course,
  L10n,
  Lang,
  Quiz,
  ReaderBlock,
  ReadoutId,
  Step,
  StepKind,
} from "../types";
import type { RowState } from "../goals";
import { richFragment } from "../canvas/text";
import { diagramPane, type DiagramPane } from "../stage/diagrams";
import { getProcedure } from "../../train/procedureStore";

// ------------------------------------------------------------------ strings
const S = {
  // top bar, footer, navigation
  backToLibrary: ["Back to Ground school", "Retour à l’école au sol"],
  reader: ["Lesson text", "Texte de la leçon"],
  outline: ["Outline", "Plan"],
  outlineTitle: ["Course outline", "Plan du cours"],
  language: ["Language", "Langue"],
  stepOf: ["Step {n} of {total}", "Étape {n} sur {total}"],
  next: ["Next", "Suivant"],
  back: ["Back", "Précédent"],
  revealNext: ["Next point", "Point suivant"],
  hint: ["Hint", "Indice"],
  hideHint: ["Hide hint", "Masquer l’indice"],
  showMe: ["Show me", "Montre-moi"],
  myTurn: ["Back to my turn", "À moi"],
  close: ["Close", "Fermer"],
  selfStudy: ["self-study", "en autonomie"],
  briefing: ["Briefing", "Briefing"],
  backToFlyIt: ["Back to Fly it", "Retour au vol"],
  notSaved: ["Not saved on this device", "Non enregistré sur cet appareil"],
  resumed: ["Resumed at step {n}", "Reprise à l’étape {n}"],
  startOver: ["Start over", "Recommencer"],
  enMarker: ["EN", "EN"],
  enMarkerTitle: [
    "Not translated yet: shown in English",
    "Pas encore traduit : affiché en anglais",
  ],
  stepAnnounce: [
    "Step {n} of {total}: {title}",
    "Étape {n} sur {total} : {title}",
  ],
  // reader
  aboutMin: ["about {n} min", "environ {n} min"],
  notGraded: ["not graded", "non noté"],
  practiceChecked: [
    "practice, checked by the sim",
    "entraînement, vérifié par le simulateur",
  ],
  gradedAcs: [
    "graded by the sim, worded like the ACS",
    "noté par le simulateur, formulé comme l’ACS",
  ],
  practiceOnly: [
    "practice only, never graded",
    "entraînement seulement, jamais noté",
  ],
  doThis: ["Do this", "À faire"],
  checkedBySim: ["Checked by the sim", "Vérifié par le simulateur"],
  keyToSuccess: ["Key to success", "La clé du succès"],
  takeaway: ["Takeaway", "À retenir"],
  procedure: ["Procedure", "Procédure"],
  memoryItems: ["Memory items", "Actions réflexes"],
  checklist: ["Checklist", "Liste de vérification"],
  drillIt: ["Drill it", "S’entraîner"],
  procMissing: [
    "This procedure is not in your club library",
    "Cette procédure n’est pas dans la bibliothèque du club",
  ],
  formula: ["Exact formula", "Formule exacte"],
  ruleOfThumb: ["Rule of thumb", "Règle pratique"],
  sources: ["Sources", "Sources"],
  done: ["done", "fait"],
  rowDone: ["{row}: done", "{row} : fait"],
  goalMet: ["Goal met", "Objectif atteint"],
  imageMissing: [
    "Image not available on this device",
    "Image non disponible sur cet appareil",
  ],
  slideFallback: [
    "This slide is shown as text here: its designed layout needs the slide renderer.",
    "Cette diapositive est affichée en texte : sa mise en page nécessite le moteur de diapositives.",
  ],
  // quiz
  check: ["Check", "Vérifier"],
  checkAgain: ["Check again", "Vérifier à nouveau"],
  tryAgain: ["Try again", "Réessayer"],
  correct: ["Correct", "Juste"],
  notQuite: ["Not quite", "Pas tout à fait"],
  theAnswer: ["The answer: {a}", "La réponse : {a}"],
  answerLabel: ["Answer", "Réponse"],
  accepted: ["accepted ± {t}", "accepté à ± {t}"],
  lockIn: ["Lock in my prediction", "Valider ma prédiction"],
  watchWhat: [
    "Watch what happens on the stage",
    "Regardez ce qui se passe sur la scène",
  ],
  tapPrompt: ["Tap it on the instrument", "Touchez-le sur l’instrument"],
  tapWrong: ["Not that one. Look again.", "Pas celui-là. Regardez encore."],
  flyPrompt: [
    "Set it on the instrument, then tap Check",
    "Réglez-le sur l’instrument, puis touchez Vérifier",
  ],
  moveUp: ["Move up", "Monter"],
  moveDown: ["Move down", "Descendre"],
  correctOrder: ["The right order", "Le bon ordre"],
  orderHint: [
    "Put them in order, then tap Check",
    "Mettez-les dans l’ordre, puis touchez Vérifier",
  ],
  numberInvalid: ["Type a number", "Saisissez un nombre"],
  quizNeverBlocks: ["Next stays open", "Suivant reste possible"],
  // calc
  givens: ["Given", "Données"],
  yourAnswer: ["Your answer", "Votre réponse"],
  unit: ["Unit", "Unité"],
  newNumbers: ["New numbers", "Nouvelles valeurs"],
  showSolution: ["Show the worked solution", "Voir la solution détaillée"],
  solution: ["Worked solution", "Solution détaillée"],
  nextSolutionStep: ["Next step", "Étape suivante"],
  showAll: ["Show all", "Tout afficher"],
  exactValue: ["Exact: {v}", "Exact : {v}"],
  seedLine: ["Problem #{seed}", "Problème n° {seed}"],
  fixedSeed: [
    "Same numbers for the whole class",
    "Mêmes valeurs pour toute la classe",
  ],
  calcStage: ["Diagram", "Schéma"],
  coverTitle: ["The diagram shows the solution", "Le schéma montre la solution"],
  coverBody: ["Work it out first: it appears when you check your answer.", "Cherchez d’abord : il s’affiche quand vous vérifiez votre réponse."],
  coverShow: ["Show it now", "L’afficher maintenant"],
  // drill
  drill: ["Drill", "Série"],
  drillIntro: ["{n} problems in a row", "{n} problèmes à la suite"],
  stopwatch: ["stopwatch", "chronomètre"],
  perProblem: ["{s} s per problem", "{s} s par problème"],
  totalTime: ["{t} in all", "{t} au total"],
  startDrill: ["Start the drill", "Commencer la série"],
  problemOf: ["Problem {i} of {n}", "Problème {i} sur {n}"],
  skip: ["Skip", "Passer"],
  nextProblem: ["Next problem", "Problème suivant"],
  seeScore: ["See my score", "Voir mon score"],
  timeUp: ["Time’s up", "Temps écoulé"],
  skipped: ["skipped", "passé"],
  scoreLine: ["{c} of {n} right", "{c} sur {n} justes"],
  medianLine: ["median {t} per problem", "médiane {t} par problème"],
  totalLine: ["{t} in all", "{t} au total"],
  byTopic: ["By topic", "Par thème"],
  reviewMisses: ["Review your misses", "Revoir vos erreurs"],
  noMisses: ["No misses. Well flown.", "Aucune erreur. Bien joué."],
  runAgain: [
    "Run again with new numbers",
    "Recommencer avec de nouvelles valeurs",
  ],
  runAgainSame: ["Run it again", "Recommencer"],
  youAnswered: ["You answered {a}", "Vous avez répondu {a}"],
  bestRun: ["Best run: {c} of {n}", "Meilleure série : {c} sur {n}"],
  // fly it + debrief
  flyIt: ["Fly it", "Voler"],
  flyBrief: ["Brief", "Briefing"],
  flyBriefSub: ["read here", "à lire ici"],
  flyFly: ["Fly", "Vol"],
  flyFlySub: ["in the cockpit", "dans le cockpit"],
  flyDebrief: ["Debrief", "Débriefing"],
  flyDebriefSub: ["back on this step", "retour sur cette étape"],
  options: ["Options", "Options"],
  passesWhen: ["Passes when", "Réussi si"],
  attemptN: ["Attempt {n}", "Essai {n}"],
  thisCourse: ["course standard", "critère du cours"],
  engineGrades: [
    "The lesson engine grades this flight in ACS wording.",
    "Le moteur de leçons note ce vol avec les termes de l’ACS.",
  ],
  startBriefing: ["Start the briefing", "Commencer le briefing"],
  briefingPages: ["{n} pages, interactive", "{n} pages, interactif"],
  watchCfi: ["Watch the CFI", "Voir l’instructeur"],
  flyAgain: ["Fly it again", "Revoler"],
  replayTrace: ["Replay with trace", "Rejouer avec la trace"],
  yourAttempt: ["Your attempt", "Votre essai"],
  gradeFirst: [
    "How did it go? Grade yourself first, then see what the sim measured.",
    "Comment était-ce ? Évaluez-vous d’abord, puis voyez ce que le simulateur a mesuré.",
  ],
  nailed: ["Nailed it", "Réussi"],
  closeGrade: ["Close", "Presque"],
  notYet: ["Not yet", "Pas encore"],
  passed: ["Passed", "Réussi"],
  metOf: ["{m} of {n} met", "{m} sur {n} atteints"],
  youSaid: [
    "You said “{g}” before seeing this. The sim checked the points on the left.",
    "Vous avez dit « {g} » avant de voir ceci. Le simulateur a vérifié les points de gauche.",
  ],
  noteFrom: ["Note from {name}", "Note de {name}"],
  records: [
    "Kept in your training records on this device. Practice in a browser sim is not loggable time.",
    "Conservé dans vos relevés d’entraînement sur cet appareil. L’entraînement sur un simulateur de navigateur n’est pas du temps de vol enregistrable.",
  ],
  notFinished: ["Flight not finished", "Vol non terminé"],
  notFinishedBody: [
    "The cockpit opened but the flight did not end with a result.",
    "Le cockpit s’est ouvert mais le vol ne s’est pas terminé par un résultat.",
  ],
  pendingBody: [
    "Not flown yet. The cockpit opens with this brief.",
    "Pas encore volé. Le cockpit s’ouvre avec ce briefing.",
  ],
  backFrom: ["Back from the cockpit · {t}", "Retour du cockpit · {t}"],
  flyNoStore: [
    "Flying needs this device’s course storage, which is not available here.",
    "Le vol nécessite le stockage des cours de cet appareil, indisponible ici.",
  ],
  flyNoBridge: [
    "Flying a course step in the simulator comes with the next cockpit update: this build’s cockpit cannot pose this scene or send the result back yet. Everything above is ready; meanwhile practise with the Try it steps.",
    "Le vol d’une étape de cours dans le simulateur arrive avec la prochaine mise à jour du cockpit : celui de cette version ne sait pas encore poser cette scène ni renvoyer le résultat. Tout ce qui précède est prêt ; en attendant, entraînez-vous avec les étapes « À vous ».",
  ],
  flyPreview: [
    "Preview: in the published course, Fly it opens the cockpit here.",
    "Aperçu : dans le cours publié, En vol ouvre le cockpit ici.",
  ],
  flyLegacy: [
    "This build’s cockpit opens the lesson but cannot send the result back to the course yet. Fly it, then come back here and grade yourself.",
    "Le cockpit de cette version ouvre la leçon mais ne renvoie pas encore le résultat au cours. Volez-la, puis revenez ici et notez-vous.",
  ],
  drillNoBridge: [
    "Drilling a procedure from a course comes with the next cockpit update: open it in the simulator from Procedures for now.",
    "L’entraînement à une procédure depuis un cours arrive avec la prochaine mise à jour du cockpit : ouvrez-la pour l’instant depuis Procédures dans le simulateur.",
  ],
  flyLegacyGo: ["Open the lesson in the simulator", "Ouvrir la leçon dans le simulateur"],
  addHandout: ["Add to my handout", "Ajouter à mon mémo"],
  inHandout: ["In my handout", "Dans mon mémo"],
  stepN: ["Step {n}", "Étape {n}"],
  start: ["Start", "Départ"],
  radios: ["Radios", "Radios"],
  panel: ["Panel", "Tableau"],
  weather: ["Weather", "Météo"],
  worst: ["worst {v}", "pire {v}"],
  at: ["at {t}", "à {t}"],
  // outline + summary
  minutesTotal: ["{n} min", "{n} min"],
  stepsCount: ["{n} steps", "{n} étapes"],
  current: ["current", "en cours"],
  courseDone: ["Course complete", "Cours terminé"],
  courseDoneSub: [
    "Here is what you did. Your handout collects the takeaways, your answers and your results.",
    "Voici ce que vous avez fait. Votre mémo rassemble les points à retenir, vos réponses et vos résultats.",
  ],
  goalsMet: ["Goals met", "Objectifs atteints"],
  answeredRight: ["Answered right", "Bonnes réponses"],
  skippedSteps: ["Skipped", "Passées"],
  flights: ["Flights", "Vols"],
  printHandout: ["Print handout", "Imprimer le mémo"],
  handoutTitle: ["Handout", "Mémo"],
  myAnswer: ["My answer: {a}", "Ma réponse : {a}"],
} as const satisfies Record<string, readonly [string, string]>;
export type PlayerString = keyof typeof S;

/** A player UI string, `{name}` placeholders filled from `vars`. */
export function ps(
  key: PlayerString,
  lang: Lang,
  vars?: Record<string, string | number>,
): string {
  const s: string = S[key][lang === "fr" ? 1 : 0];
  return vars
    ? s.replace(/\{(\w+)\}/g, (m, k: string) =>
        k in vars ? String(vars[k]) : m,
      )
    : s;
}

/** Author text in the language asked, else English (with `fallback` true so the UI can mark it). */
export function locText(
  text: L10n | undefined,
  lang: Lang,
): { text: string; fallback: boolean } {
  if (!text) return { text: "", fallback: false };
  if (lang === "fr" && text.fr) return { text: text.fr, fallback: false };
  return { text: text.en ?? "", fallback: lang === "fr" && !!text.en };
}
export const L = (text: L10n | undefined, lang: Lang): string =>
  locText(text, lang).text;

// ------------------------------------------------------------------ step kinds
export interface KindInfo {
  /** CSS modifier (colour family) */
  cls:
    | "explain"
    | "try"
    | "watch"
    | "predict"
    | "quiz"
    | "fly"
    | "page"
    | "calc";
  label: [string, string];
  /** the student acts on this step (progress ticks are outlined) */
  acts: boolean;
}
export const KINDS: Record<StepKind, KindInfo> = {
  page: { cls: "page", label: ["Page", "Page"], acts: false },
  slide: { cls: "page", label: ["Slide", "Diapo"], acts: false },
  explain: { cls: "explain", label: ["Explain", "Explication"], acts: false },
  predict: { cls: "predict", label: ["Predict", "Prédire"], acts: true },
  watch: { cls: "watch", label: ["Watch", "Regarder"], acts: false },
  try: { cls: "try", label: ["Try it", "À vous"], acts: true },
  tap: { cls: "try", label: ["Tap", "Toucher"], acts: true },
  quiz: { cls: "quiz", label: ["Quiz", "Quiz"], acts: true },
  fly: { cls: "fly", label: ["Fly it", "En vol"], acts: true },
  calc: { cls: "calc", label: ["Calc", "Calcul"], acts: true },
  drill: { cls: "calc", label: ["Drill", "Série"], acts: true },
  debrief: { cls: "page", label: ["Debrief", "Débriefing"], acts: false },
  plate: {
    cls: "explain",
    label: ["Plate read", "Lecture de carte"],
    acts: true,
  },
  compare: { cls: "explain", label: ["Compare", "Comparer"], acts: false },
  decision: { cls: "predict", label: ["Decision", "Décision"], acts: true },
};
export const kindLabel = (k: StepKind, lang: Lang): string =>
  (KINDS[k] ?? KINDS.page).label[lang === "fr" ? 1 : 0];

/** "about 2 min · not graded" for a step header. */
export function stepMeta(step: Step, lang: Lang): string {
  const parts: string[] = [];
  if (step.minutes) parts.push(ps("aboutMin", lang, { n: step.minutes }));
  if (step.kind === "fly") parts.push(ps("gradedAcs", lang));
  else if (step.kind === "calc" || step.kind === "drill")
    parts.push(ps("practiceOnly", lang));
  else if (step.goal) {
    const assisted = !!(
      step.stage?.assist?.holdAlt ||
      step.stage?.assist?.holdIas ||
      (step.stage?.assist?.timeScale ?? 1) > 1
    );
    parts.push(
      step.goal.graded && !assisted
        ? ps("practiceChecked", lang)
        : ps("notGraded", lang),
    );
  } else if (KINDS[step.kind]?.acts) parts.push(ps("notGraded", lang));
  return parts.join(" · ");
}

// ------------------------------------------------------------------ DOM kit
export { h };
const ICONS = {
  back: "M15 18l-6-6 6-6",
  next: "M9 6l6 6-6 6",
  menu: "M4 6h16M4 12h16M4 18h10",
  play: "M8 5v14l11-7z",
  info: "M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18zM12 11v6M12 7.5v.5",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6L6 18",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  refresh: "M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z",
  bookmark: "M7 4h10v17l-5-3.5L7 21z",
  print:
    "M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z",
  timer: "M12 8v5l3 2M9 2h6M12 22a8 8 0 1 0 0-16a8 8 0 0 0 0 16z",
  plane: "M2 16l20-6-20-6 4 6zM6 10h8",
  flag: "M5 21V4h11l-2 4 2 4H5",
  sigma: "M18 5H6l6 7-6 7h12",
} as const;
export type IconName = keyof typeof ICONS;
export function icon(name: IconName, cls = "i"): SVGSVGElement {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", cls);
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", ICONS[name]);
  s.append(p);
  return s;
}
/** A button (44 px tall by default; `cls` adds 'primary', 'quiet', 'sm', 'ghost', 'iconbtn'). */
export function btn(
  label: string,
  cls = "",
  onClick?: (e: MouseEvent) => void,
  ico?: IconName,
  icoAfter = false,
): HTMLButtonElement {
  const b = h("button", { type: "button", class: `cp-btn ${cls}`.trim() });
  if (ico && !icoAfter) b.append(icon(ico));
  if (label) b.append(h("span", { class: "cp-bl" }, label));
  if (ico && icoAfter) b.append(icon(ico));
  if (onClick) b.addEventListener("click", onClick);
  return b;
}
/** The small "EN" marker after a French text that falls back to English. */
export function enMarker(lang: Lang): HTMLElement {
  return h(
    "abbr",
    { class: "cp-en", title: ps("enMarkerTitle", lang) },
    ps("enMarker", lang),
  );
}
/** Plain author text in an element, with the "EN" marker when it fell back. */
export function textEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: L10n | undefined,
  lang: Lang,
  cls = "",
): HTMLElementTagNameMap[K] {
  const { text: s, fallback } = locText(text, lang);
  const e = h(tag, cls ? { class: cls } : {}, s);
  if (fallback) e.append(" ", enMarker(lang));
  return e;
}
/** Rich author text (**b** *i* lists [[label|id]]) as DOM; no innerHTML. */
export function richEl(
  text: L10n | undefined,
  lang: Lang,
  onLink?: (id: string, on: boolean) => void,
  cls = "cp-rich",
): HTMLDivElement {
  const { text: s, fallback } = locText(text, lang);
  const d = h("div", { class: cls });
  d.append(richFragment(s, { onLink }));
  if (fallback) (d.lastElementChild ?? d).append(" ", enMarker(lang));
  return d;
}
export function kindChip(kind: StepKind, lang: Lang): HTMLSpanElement {
  const k = KINDS[kind] ?? KINDS.page;
  return h(
    "span",
    { class: `cp-kind k-${k.cls}` },
    h("span", { class: "dot", "aria-hidden": "true" }),
    kindLabel(kind, lang),
  );
}
export function refsLine(
  refs: CalcRef[] | undefined,
  lang: Lang,
): HTMLElement | null {
  if (!refs?.length) return null;
  const txt = refs
    .map(
      (r) =>
        [r.src, r.ref].filter(Boolean).join(" ") +
        (r.note ? ` (${L(r.note, lang)})` : ""),
    )
    .join(" · ");
  return h(
    "p",
    { class: "cp-refs" },
    h("span", { class: "cp-label" }, ps("sources", lang)),
    " ",
    txt,
  );
}

// ------------------------------------------------------------------ reveal rules (pure)
export interface ReaderRevealState {
  /** the step's reveal position (Next presses consumed by reveals) */
  reveal: number;
  /** the step's quiz was answered / the prediction committed and played out */
  answered: boolean;
  goalMet: boolean;
  /** a presenter revealed (projector); the self-study player treats the last Next as the presenter reveal */
  presenter: boolean;
}
export function revealShown(
  when: Extract<ReaderBlock, { t: "reveal" }>["when"],
  s: ReaderRevealState,
): boolean {
  if (when === "answered") return s.answered;
  if (when === "goalMet") return s.goalMet;
  if (when === "presenter") return s.presenter;
  return s.reveal >= when.step;
}
/** The reveal positions a step has (annotations `{ step: n }`, reveal blocks `{ step: n }`, presenter reveals). */
export function revealCount(step: Step): number {
  let n = 0;
  const walk = (bs: ReaderBlock[]) => {
    for (const b of bs)
      if (b.t === "reveal") {
        if (typeof b.when === "object") n = Math.max(n, b.when.step);
        else if (b.when === "presenter") n = Math.max(n, 1);
        walk(b.blocks);
      }
  };
  walk(step.reader);
  for (const a of step.stage?.annotations ?? [])
    if (a.when && typeof a.when === "object") n = Math.max(n, a.when.step);
  return n;
}
/** The reader has a presenter-only reveal: the self-study player shows it at the last reveal position. */
export function hasPresenterReveal(step: Step): boolean {
  const walk = (bs: ReaderBlock[]): boolean =>
    bs.some(
      (b) => b.t === "reveal" && (b.when === "presenter" || walk(b.blocks)),
    );
  return walk(step.reader);
}
/** Takeaways of a step (handout): takeaway blocks, then keys to success. */
export function takeawaysOf(step: Step): L10n[] {
  const out: L10n[] = [];
  const walk = (bs: ReaderBlock[]) => {
    for (const b of bs) {
      if (b.t === "takeaway") out.push(b.text);
      else if (b.t === "keys") out.push(...b.items);
      else if (b.t === "reveal") walk(b.blocks);
    }
  };
  walk(step.reader);
  return out;
}
/** The reader contains a "Do this" block (else the player adds one from the goal). */
export const hasDoThis = (blocks: ReaderBlock[]): boolean =>
  blocks.some(
    (b) => b.t === "doThis" || (b.t === "reveal" && hasDoThis(b.blocks)),
  );

// ------------------------------------------------------------------ the reader view
export interface QuizMount {
  el: HTMLElement;
  destroy?(): void;
}
export interface ReaderEnv {
  lang: Lang;
  course: Course;
  step: Step;
  /** asset id → object URL (store.ts) */
  assetUrl?: (id: string) => Promise<string | null> | string | null;
  /** a linked term: hover / focus (on) or leave (off); a tap toggles a sticky highlight */
  onLink?: (id: string | null) => void;
  /** build an inline quiz widget (quiz.ts) */
  quiz?: (q: Quiz) => QuizMount | null;
  /** "Drill it" on a procedure block */
  drillProcedure?: (procId: string) => void;
}
interface DoThisRowEl {
  row: HTMLElement;
  check: HTMLElement;
  readout: HTMLElement;
  index: number;
  text: string;
  readoutId?: ReadoutId;
}

export class ReaderView {
  readonly el: HTMLDivElement;
  private reveals: {
    el: HTMLElement;
    when: Extract<ReaderBlock, { t: "reveal" }>["when"];
  }[] = [];
  private rows: DoThisRowEl[] = [];
  private diagrams: DiagramPane[] = [];
  private quizzes: QuizMount[] = [];
  private sticky: string | null = null;
  private lang: Lang;

  constructor(
    blocks: ReaderBlock[],
    private env: ReaderEnv,
  ) {
    this.lang = env.lang;
    this.el = h("div", { class: "cp-blocks" });
    for (const b of blocks) {
      const e = this.block(b);
      if (e) this.el.append(e);
    }
    // a tap on a linked term toggles its highlight (touch has no hover)
    this.el.addEventListener("click", (ev) => {
      const t = (ev.target as HTMLElement).closest?.(
        ".sl-term",
      ) as HTMLElement | null;
      if (!t?.dataset.anno) return;
      const id = t.dataset.anno;
      this.sticky = this.sticky === id ? null : id;
      for (const x of this.el.querySelectorAll<HTMLElement>(".sl-term"))
        x.classList.toggle("on", x.dataset.anno === this.sticky);
      env.onLink?.(this.sticky);
    });
  }

  /** Show / hide reveal blocks. */
  setReveal(s: ReaderRevealState) {
    for (const r of this.reveals) {
      const show = revealShown(r.when, s);
      if (show && r.el.hidden) {
        r.el.hidden = false;
        r.el.classList.add("cp-in");
      } else if (!show) r.el.hidden = true;
    }
  }
  /** Live "Do this" ticks (GoalTracker rows by check index; -1 = the hold row). */
  setRows(rows: readonly RowState[] | null) {
    for (const r of this.rows) {
      const st = rows?.find((x) => x.check === r.index);
      const ticked = !!st?.ticked;
      r.row.classList.toggle("done", ticked);
      r.row.classList.toggle("cur", !!st?.current && !ticked);
      r.check.className = `cp-check${ticked ? " ok" : st?.current ? " now" : ""}`;
      r.check.setAttribute("aria-label", ticked ? ps("done", this.lang) : "");
      const ro = st?.readout ?? "";
      r.readout.textContent = ro;
      r.readout.className = `cp-readout${ticked ? " ok" : st?.current ? " live" : ""}`;
    }
  }
  /** "Do this" rows the reader shows (for the player's own row list when the reader has none). */
  get hasRows(): boolean {
    return this.rows.length > 0;
  }
  /** Append a generated "Do this" card (rows from the goal) at `before` (default: the end). */
  addDoThis(rows: { text: string; check: number }[], before?: Element | null) {
    const card = this.doThisCard(
      rows.map((r) => ({ text: r.text, index: r.check })),
    );
    if (before && before.parentElement === this.el)
      this.el.insertBefore(card, before);
    else this.el.append(card);
  }
  /** Append the "Hold it for N s" row (check -1) to the author's first "Do this" card when it has none. */
  ensureHoldRow(text: string) {
    if (!this.rows.length || this.rows.some((r) => r.index === -1)) return;
    const list = this.rows[0].row.parentElement;
    if (!list) return;
    const check = h("span", { class: "cp-check", role: "img", "aria-label": "" });
    const readout = h("span", { class: "cp-readout" });
    const row = h("div", { class: "cp-row", role: "listitem" }, check, h("span", { class: "t" }, text), readout);
    list.append(row);
    this.rows.push({ row, check, readout, index: -1, text });
  }
  destroy() {
    for (const d of this.diagrams) d.destroy();
    for (const q of this.quizzes) q.destroy?.();
    this.el.remove();
  }

  // ---------------- blocks
  private link = (id: string, on: boolean) => {
    if (this.sticky) return;
    this.env.onLink?.(on ? id : null);
  };
  private block(b: ReaderBlock): HTMLElement | null {
    const lang = this.lang;
    switch (b.t) {
      case "heading":
        return textEl("h2", b.text, lang, "cp-h2");
      case "text":
        return richEl(b.text, lang, this.link);
      case "image": {
        const fig = h("figure", { class: "cp-fig" });
        const img = h("img", {
          alt: L(b.alt, lang),
          decoding: "async",
          draggable: "false",
        });
        fig.append(img);
        Promise.resolve(this.env.assetUrl?.(b.asset) ?? null).then((url) => {
          if (url) img.src = url;
          else
            img.replaceWith(
              h("div", { class: "cp-ph" }, ps("imageMissing", lang)),
            );
        });
        if (b.caption || b.attribution)
          fig.append(
            h(
              "figcaption",
              {},
              b.caption ? textEl("span", b.caption, lang) : null,
              b.attribution
                ? h("span", { class: "cp-attr" }, b.attribution)
                : null,
            ),
          );
        return fig;
      }
      case "diagram": {
        const fig = h("figure", { class: "cp-fig cp-diag" });
        const label = b.caption ? L(b.caption, lang) : b.d.kind;
        const d = diagramPane(b.d, b.asset, {
          theme: "light",
          lang,
          assetUrl: this.env.assetUrl,
          label,
          interactive: b.d.kind === "calc" && !!b.d.calc.drag?.length,
        });
        this.diagrams.push(d);
        fig.append(h("div", { class: "cp-diag-box" }, d.el));
        if (b.caption) fig.append(textEl("figcaption", b.caption, lang));
        return fig;
      }
      case "keys":
        return h(
          "div",
          { class: "cp-key" },
          h("div", { class: "cp-label" }, ps("keyToSuccess", lang)),
          ...b.items.map((it) => richEl(it, lang, this.link)),
        );
      case "doThis":
        return this.doThisCard(
          b.rows.map((r) => ({
            text: L(r.text, lang),
            index: r.check,
            readoutId: r.readout,
            fallback: locText(r.text, lang).fallback,
          })),
        );
      case "reveal": {
        const box = h("div", { class: "cp-reveal" });
        for (const x of b.blocks) {
          const e = this.block(x);
          if (e) box.append(e);
        }
        box.hidden = true;
        this.reveals.push({ el: box, when: b.when });
        return box;
      }
      case "procedure":
        return this.procedure(b.procId);
      case "takeaway":
        return h(
          "div",
          { class: "cp-take" },
          icon("bookmark"),
          h(
            "div",
            {},
            h("div", { class: "cp-label" }, ps("takeaway", lang)),
            richEl(b.text, lang, this.link),
          ),
        );
      case "quiz": {
        const q = this.env.quiz?.(b.quiz) ?? null;
        if (!q) return null;
        this.quizzes.push(q);
        return h("div", { class: "cp-inline-quiz" }, q.el);
      }
      case "formula":
        return formulaCard(b.formula, b.ruleOfThumb, b.refs, lang);
      default:
        return null;
    }
  }
  private doThisCard(
    rows: {
      text: string;
      index: number;
      readoutId?: ReadoutId;
      fallback?: boolean;
    }[],
  ): HTMLElement {
    const lang = this.lang;
    const list = h("div", { class: "cp-rows", role: "list" });
    for (const r of rows) {
      const check = h("span", {
        class: "cp-check",
        role: "img",
        "aria-label": "",
      });
      const readout = h("span", { class: "cp-readout" });
      const t = h("span", { class: "t" });
      t.append(inlineRich(r.text));
      if (r.fallback) t.append(" ", enMarker(lang));
      const row = h(
        "div",
        { class: "cp-row", role: "listitem" },
        check,
        t,
        readout,
      );
      list.append(row);
      this.rows.push({
        row,
        check,
        readout,
        index: r.index,
        text: r.text,
        readoutId: r.readoutId,
      });
    }
    return h(
      "div",
      { class: "cp-card cp-dothis" },
      h(
        "div",
        { class: "hd" },
        h("span", { class: "cp-label" }, ps("doThis", lang)),
        h("span", { class: "cp-label soft" }, ps("checkedBySim", lang)),
      ),
      list,
    );
  }
  private procedure(procId: string): HTMLElement {
    const lang = this.lang;
    let p: ReturnType<typeof getProcedure> = null;
    try {
      p = getProcedure(procId);
    } catch {
      p = null;
    }
    const card = h("div", { class: "cp-card cp-proc" });
    if (!p) {
      card.append(
        h(
          "div",
          { class: "hd" },
          h("span", { class: "cp-label" }, ps("procedure", lang)),
        ),
        h("p", { class: "cp-muted pad" }, ps("procMissing", lang)),
      );
      return card;
    }
    const mem = p.items.filter((i) => i.memory);
    const rest = p.items.filter((i) => !i.memory);
    const list = (title: string, items: typeof p.items) =>
      items.length
        ? [
            h("div", { class: "cp-proc-sub cp-label" }, title),
            h(
              "ol",
              { class: "cp-proc-list" },
              ...items.map((i) =>
                h("li", { class: i.memory ? "mem" : "" }, i.text),
              ),
            ),
          ]
        : [];
    card.append(
      h(
        "div",
        { class: "hd" },
        h("span", { class: "cp-label" }, ps("procedure", lang)),
        h("span", { class: "cp-label soft" }, p.aircraft),
      ),
      h("div", { class: "cp-proc-t" }, p.title),
      ...list(ps("memoryItems", lang), mem),
      ...list(ps("checklist", lang), rest),
      h(
        "p",
        { class: "cp-refs" },
        [p.source === "library" ? "Library" : "Club", p.ref, p.disclaimer]
          .filter(Boolean)
          .join(" · "),
      ),
    );
    if (this.env.drillProcedure)
      card.append(
        h(
          "div",
          { class: "cp-proc-foot" },
          btn(
            ps("drillIt", lang),
            "sm",
            () => this.env.drillProcedure!(procId),
            "plane",
          ),
        ),
      );
    return card;
  }
}

/** Rich inline text (**b** *i* `code`) without paragraphs, for rows and labels. */
export function inlineRich(src: string): DocumentFragment {
  const frag = richFragment(src);
  const out = document.createDocumentFragment();
  const ps_ = [...frag.childNodes];
  ps_.forEach((n, i) => {
    if (i) out.append(" ");
    if (n.nodeName === "P") out.append(...[...n.childNodes]);
    else out.append(n);
  });
  return out;
}

/** The formula card: the exact formula and the pilot's rule of thumb side by side (reader block, calc solution). */
export function formulaCard(
  formula: L10n | undefined,
  ruleOfThumb: L10n | undefined,
  refs: CalcRef[] | undefined,
  lang: Lang,
  exact?: string,
): HTMLElement {
  const card = h("div", { class: "cp-formula" });
  if (ruleOfThumb)
    card.append(
      h(
        "div",
        { class: "rot" },
        h("div", { class: "cp-label" }, ps("ruleOfThumb", lang)),
        richEl(ruleOfThumb, lang),
      ),
    );
  if (formula)
    card.append(
      h(
        "div",
        { class: "exact" },
        h("div", { class: "cp-label" }, ps("formula", lang)),
        textEl("div", formula, lang, "cp-math"),
        exact ? h("div", { class: "cp-exactv" }, exact) : null,
      ),
    );
  const r = refsLine(refs, lang);
  if (r) card.append(r);
  return card;
}
