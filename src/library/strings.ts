// The unified library's words (FR / EN). The course actions it shares with the course player (open, edit, export,
// share…) keep their strings in course/i18n.ts; these are the library's own.
import type { Lang } from "../course/types";

const S = {
  eyebrow: { en: "Library", fr: "Bibliothèque" },
  title: {
    en: "Everything your club teaches, on the ground and in the air",
    fr: "Tout ce que votre club enseigne, au sol et en vol",
  },
  lead: {
    en: "The platform for aviation education: slide courses, procedures and checklists, lessons in the built-in simulator, from the LAPL and PPL to the IR and ATPL theory.",
    fr: "La plateforme de l’éducation aéronautique : cours en diapositives, procédures et check-lists, leçons au simulateur intégré, du LAPL et du PPL jusqu’à l’IR et la théorie ATPL.",
  },
  search: {
    en: "Search courses, procedures, flights",
    fr: "Rechercher un cours, une procédure, un vol",
  },
  items: { en: "{n} items", fr: "{n} éléments" },
  item1: { en: "1 item", fr: "1 élément" },
  all: { en: "All", fr: "Tout" },
  allPrograms: { en: "All programs", fr: "Tous les programmes" },
  programs: { en: "Programs", fr: "Programmes" },
  kind: { en: "Kind", fr: "Type" },
  level: { en: "Level", fr: "Niveau" },
  allLevels: { en: "All levels", fr: "Tous niveaux" },
  newCourse: { en: "New course", fr: "Nouveau cours" },
  import: { en: "Import", fr: "Importer" },
  present: { en: "Present", fr: "Présenter" },
  // rows
  continue: { en: "Continue", fr: "Reprendre" },
  continueSub: { en: "Where you left off", fr: "Là où vous vous êtes arrêté" },
  start: { en: "Start here", fr: "Pour commencer" },
  startSub: {
    en: "A course, a sim lesson and a checklist to begin with",
    fr: "Un cours, une leçon au simulateur et une check-list pour débuter",
  },
  assigned: { en: "Assigned to you", fr: "Assignés par votre instructeur" },
  assignedSub: {
    en: "What your instructor asked you to prepare",
    fr: "Ce que votre instructeur vous demande de préparer",
  },
  drafts: { en: "My drafts", fr: "Mes brouillons" },
  draftsEmpty: {
    en: "Your own courses appear here.",
    fr: "Vos propres cours apparaîtront ici.",
  },
  draftsEmptyBody: {
    en: "Start from a beautiful deck in the classroom theme, or bring the slides you already teach with.",
    fr: "Partez d’un beau modèle en thème « salle de cours », ou reprenez les diapositives avec lesquelles vous enseignez déjà.",
  },
  draftsSub: {
    en: "Your courses on this device",
    fr: "Vos cours sur cet appareil",
  },
  seeAll: { en: "See all {n}", fr: "Voir les {n}" },
  results: { en: "{n} results for “{q}”", fr: "{n} résultats pour « {q} »" },
  result1: { en: "1 result for “{q}”", fr: "1 résultat pour « {q} »" },
  noResults: {
    en: "Nothing matches “{q}”",
    fr: "Rien ne correspond à « {q} »",
  },
  noResultsBody: {
    en: "Try another word, a licence (PPL, IR), an aircraft or a navaid.",
    fr: "Essayez un autre mot, une licence (PPL, IR), un avion ou une balise.",
  },
  clearSearch: { en: "Clear the search", fr: "Effacer la recherche" },
  clearFilters: { en: "Show everything", fr: "Tout afficher" },
  emptyFilter: {
    en: "Nothing here with these filters",
    fr: "Rien ici avec ces filtres",
  },
  backAll: { en: "All programs", fr: "Tous les programmes" },
  // meta
  steps: { en: "{n} steps", fr: "{n} étapes" },
  step1: { en: "1 step", fr: "1 étape" },
  itemsN: { en: "{n} items", fr: "{n} points" },
  memoryN: { en: "{n} from memory", fr: "{n} de mémoire" },
  min: { en: "{n} min", fr: "{n} min" },
  passed: { en: "Passed", fr: "Réussi" },
  bestPct: { en: "Best {n}%", fr: "Meilleur {n} %" },
  attemptsN: { en: "{n} attempts", fr: "{n} essais" },
  attempt1: { en: "1 attempt", fr: "1 essai" },
  ofN: { en: "{a} of {b}", fr: "{a} sur {b}" },
  briefingDeck: {
    en: "Briefing deck, then the cockpit",
    fr: "Briefing en diapositives, puis le cockpit",
  },
  builtIn: { en: "Built in", fr: "Intégré" },
  club: { en: "Club", fr: "Club" },
  you: { en: "You", fr: "Vous" },
  assignedTag: { en: "Assigned", fr: "Assigné" },
  draftTag: { en: "Draft", fr: "Brouillon" },
  newCourseCard: { en: "New course", fr: "Nouveau cours" },
  newCourseCardSub: {
    en: "From a template, in the light classroom theme",
    fr: "À partir d’un modèle, en thème clair « salle de cours »",
  },
  open: { en: "Open", fr: "Ouvrir" },
  more: { en: "More actions: {t}", fr: "Autres actions : {t}" },
  // instructors' tools
  tools: { en: "Instructor tools", fr: "Outils de l’instructeur" },
  toolNew: { en: "New course", fr: "Nouveau cours" },
  toolNewSub: {
    en: "Start from a beautiful deck, then add live instruments",
    fr: "Partir d’un beau modèle, puis ajouter des instruments en direct",
  },
  toolPdf: { en: "Import your slides", fr: "Importer vos diapositives" },
  toolPdfSub: {
    en: "Your presentation as a PDF: each page becomes a step",
    fr: "Votre présentation en PDF : chaque page devient une étape",
  },
  toolPack: {
    en: "Import a course or a club pack",
    fr: "Importer un cours ou un pack club",
  },
  toolPackSub: {
    en: ".ifrcourse files and club packs",
    fr: "Fichiers .ifrcourse et packs club",
  },
  toolPresent: { en: "Present to a class", fr: "Présenter à une classe" },
  toolPresentSub: {
    en: "Projector window and presenter notes",
    fr: "Fenêtre projecteur et notes du présentateur",
  },
  // file a course
  file: { en: "File in a program…", fr: "Classer dans un programme…" },
  fileTitle: { en: "File “{t}”", fr: "Classer « {t} »" },
  fileBody: {
    en: "The programs this course is listed in. The first one ticked is its home shelf.",
    fr: "Les programmes où ce cours apparaît. Le premier coché est son rayon principal.",
  },
  fileSave: { en: "Save", fr: "Enregistrer" },
  filed: { en: "Filed in {p}", fr: "Classé dans {p}" },
  unfiled: {
    en: "Not filed in a program yet",
    fr: "Pas encore classé dans un programme",
  },
  // procedures
  memory: { en: "Memory item", fr: "Action de mémoire" },
  memoryShort: { en: "Memory", fr: "Mémoire" },
  checklist: { en: "Checklist", fr: "Check-list" },
  drillIt: { en: "Drill it in the simulator", fr: "S’entraîner au simulateur" },
  customise: { en: "Customise for the club", fr: "Adapter pour le club" },
  editClub: {
    en: "Edit the club procedure",
    fr: "Modifier la procédure du club",
  },
  close: { en: "Close", fr: "Fermer" },
  holdTargets: { en: "Hold {v}", fr: "Tenir {v}" },
  ref: { en: "Reference", fr: "Référence" },
  // flights
  fly: { en: "Fly", fr: "Voler" },
  brief: { en: "Brief and fly", fr: "Briefing puis vol" },
  // a11y
  programsNav: { en: "Library programs", fr: "Programmes de la bibliothèque" },
  kindsNav: { en: "What to show", fr: "Ce qu’il faut afficher" },
  levelsNav: { en: "Level", fr: "Niveau" },
} as const satisfies Record<string, Record<Lang, string>>;

export type LibStringKey = keyof typeof S;
export function lt(
  k: LibStringKey,
  l: Lang,
  v: Record<string, string | number> = {},
): string {
  let s: string = S[k][l] ?? S[k].en;
  for (const [a, b] of Object.entries(v)) s = s.split(`{${a}}`).join(String(b));
  return s;
}
/** "{n} steps" / "1 step" in a language. */
export const ltN = (
  one: LibStringKey,
  many: LibStringKey,
  n: number,
  l: Lang,
): string => (n === 1 ? lt(one, l) : lt(many, l, { n }));
