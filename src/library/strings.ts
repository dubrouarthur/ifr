// The unified library's words (FR / EN). The course actions it shares with the course player (open, edit, export,
// share…) keep their strings in course/i18n.ts; these are the library's own.
import type { Lang } from "../course/types";
import { BRAND } from "../brand";

const S = {
  eyebrow: { en: "Library", fr: "Bibliothèque" },
  title: {
    en: "Everything we teach, shelved by licence",
    fr: "Tout ce que l’on enseigne, rangé par licence",
  },
  lead: {
    en: "Every course, sim lesson and checklist has one place: its programme, then its subject, in training order.",
    fr: "Chaque cours, leçon au simulateur et check-list a une seule place : son programme, puis sa matière, dans l’ordre de la formation.",
  },
  search: {
    en: "Search a course, a lesson, a checklist",
    fr: "Rechercher un cours, une leçon, une check-list",
  },
  searchIn: { en: "Search in {p}", fr: "Rechercher dans {p}" },
  searchAll: { en: "in the whole library", fr: "dans toute la bibliothèque" },
  items: { en: "{n} items", fr: "{n} éléments" },
  item1: { en: "1 item", fr: "1 élément" },
  itemsWord: { en: "items", fr: "éléments" },
  itemWord: { en: "item", fr: "élément" },
  doneN: { en: "{n} done", fr: "{n} terminés" },
  done1: { en: "1 done", fr: "1 terminé" },
  doneWord: { en: "done", fr: "terminés" },
  all: { en: "All", fr: "Tout" },
  newCourse: { en: "New course", fr: "Nouveau cours" },
  library: { en: "Library", fr: "Bibliothèque" },
  searchCrumb: { en: "Search", fr: "Recherche" },
  // landing
  continue: { en: "Continue", fr: "Reprendre" },
  continueSub: { en: "Where you left off", fr: "Là où vous vous êtes arrêté" },
  where: { en: "Where to start?", fr: "Où commencer ?" },
  whereSub: {
    en: "Pick the one that fits you",
    fr: "Choisissez ce qui vous ressemble",
  },
  routePpl: { en: "I am learning to fly", fr: "Je débute le pilotage" },
  routePplShort: { en: "I am learning to fly", fr: "Je débute le pilotage" },
  routePplBody: {
    en: "The 9 theory subjects, then the flight modules: circuits, failures and emergencies, navigation.",
    fr: "Les 9 matières de la théorie, puis les modules en vol : tour de piste, pannes et urgences, navigation.",
  },
  routePplFirst: { en: "First step:", fr: "Premier pas :" },
  routePplGo: { en: "Open LAPL · PPL", fr: "Ouvrir LAPL · PPL" },
  routeIr: {
    en: "I am preparing the instrument rating",
    fr: "Je prépare la qualification IR",
  },
  routeIrShort: { en: "I am preparing the IR", fr: "Je prépare l’IR" },
  routeIrBody: {
    en: "Seven modules in syllabus order, from the instrument scan to the checkride.",
    fr: "Sept modules dans l’ordre du programme, du circuit visuel au test pratique.",
  },
  routeIrFirst: { en: "Module 1:", fr: "Module 1 :" },
  routeIrGo: { en: "Start module 1", fr: "Commencer le module 1" },
  routeFi: { en: "I teach", fr: "J’enseigne" },
  routeFiBody: {
    en: "Build a course from a template or your own slides, present it in class, follow your students.",
    fr: "Créer un cours depuis un modèle ou vos diapositives, le présenter en salle, suivre vos élèves.",
  },
  routeFiFirst: { en: "The quickest:", fr: "Le plus rapide :" },
  routeFiPdf: {
    en: "import your PDF slides",
    fr: "importer vos diapositives PDF",
  },
  newHere: { en: `New to ${BRAND.name}?`, fr: `Nouveau sur ${BRAND.name} ?` },
  productDeck: {
    en: `${BRAND.name} in 5 slides`,
    fr: `${BRAND.name} en 5 diapositives`,
  },
  programs: { en: "The programmes", fr: "Les programmes" },
  programsSub: { en: "In training order", fr: "Dans l’ordre de la formation" },
  openShelf: { en: "Open", fr: "Ouvrir" },
  alsoHereN: {
    en: "+ {n} useful, shelved in other programmes",
    fr: "+ {n} utiles, rangés dans d’autres programmes",
  },
  alsoHere1: {
    en: "+ 1 useful, shelved in another programme",
    fr: "+ 1 utile, rangé dans un autre programme",
  },
  toolsN: { en: "{n} tools", fr: "{n} outils" },
  // programme page
  index: { en: "Programme", fr: "Programme" },
  otherPrograms: { en: "Other programmes", fr: "Autres programmes" },
  contents: { en: "Contents", fr: "Sommaire" },
  playLessons: { en: "Fly the lessons in order", fr: "Enchaîner les leçons" },
  aboutSim: {
    en: "about {n} min in the simulator",
    fr: "environ {n} min de vol",
  },
  soonLine: {
    en: "Also in the syllabus, no content yet:",
    fr: "Aussi au programme, sans contenu pour l’instant :",
  },
  alsoIn: { en: "Also useful in {p}", fr: "Aussi utile en {p}" },
  alsoHere: { en: "Also useful here", fr: "Aussi utile ici" },
  alsoHereSub: {
    en: "In another programme, not counted here:",
    fr: "Dans un autre programme, pas compté ici :",
  },
  shelvedIn: { en: "shelved in {p}", fr: "rangé dans {p}" },
  see: { en: "See {p}", fr: "Voir {p}" },
  nothingKind: {
    en: "Nothing of this kind in {p} yet.",
    fr: "Rien de ce type dans {p} pour l’instant.",
  },
  // search
  results: { en: "{n} results for “{q}”", fr: "{n} résultats pour « {q} »" },
  result1: { en: "1 result for “{q}”", fr: "1 résultat pour « {q} »" },
  resultsWhere: {
    en: "Shelved where they live: {s}, {p}.",
    fr: "Rangés là où ils vivent : {s}, {p}.",
  },
  subjectsN: { en: "{n} subjects", fr: "{n} matières" },
  subject1: { en: "1 subject", fr: "1 matière" },
  programsN: { en: "in {n} programmes", fr: "dans {n} programmes" },
  program1: { en: "in one programme", fr: "dans un seul programme" },
  noResults: {
    en: "Nothing matches “{q}”",
    fr: "Rien ne correspond à « {q} »",
  },
  noResultsBody: {
    en: "Try another word, a licence (PPL, IR), an aircraft or a navaid.",
    fr: "Essayez un autre mot, une licence (PPL, IR), un avion ou une balise.",
  },
  clearSearch: { en: "Clear the search", fr: "Effacer la recherche" },
  // cards
  steps: { en: "{n} steps", fr: "{n} étapes" },
  step1: { en: "1 step", fr: "1 étape" },
  itemsN: { en: "{n} items", fr: "{n} points" },
  min: { en: "{n} min", fr: "{n} min" },
  passed: { en: "Passed", fr: "Réussi" },
  passedPct: { en: "Passed · {n}%", fr: "Réussi · {n} %" },
  triesBest: { en: "{a} · best {n}%", fr: "{a} · meilleur {n} %" },
  attemptsN: { en: "{n} attempts", fr: "{n} essais" },
  attempt1: { en: "1 attempt", fr: "1 essai" },
  lessonWord: { en: "Lesson", fr: "Leçon" },
  ofN: { en: "of {n}", fr: "sur {n}" },
  briefingFlight: { en: "Briefing + flight", fr: "Briefing + vol" },
  assignedTag: { en: "Assigned", fr: "Assigné" },
  draftTag: { en: "Draft", fr: "Brouillon" },
  club: { en: "Club", fr: "Club" },
  you: { en: "You", fr: "Vous" },
  open: { en: "Open", fr: "Ouvrir" },
  fly: { en: "Fly", fr: "Voler" },
  more: { en: "More actions: {t}", fr: "Autres actions : {t}" },
  // the purpose line when the source has none
  pLessonBrief: {
    en: "A slide briefing, then the graded flight",
    fr: "Briefing en diapositives, puis le vol noté",
  },
  pLesson: {
    en: "A graded flight in the simulator, then the debrief",
    fr: "Un vol noté au simulateur, puis le débriefing",
  },
  pDrill: {
    en: "A scheduled failure, handled with the checklist",
    fr: "Une panne programmée, à traiter avec la check-list",
  },
  pCircuit: {
    en: "A full route, graded leg by leg",
    fr: "Un parcours complet, noté étape par étape",
  },
  pScenario: {
    en: "Not graded: practise at your own pace",
    fr: "Sans note : pour répéter à votre rythme",
  },
  pCourse: {
    en: "Slides with live instruments",
    fr: "Des diapositives avec instruments en direct",
  },
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
  draftsEmpty: {
    en: "Your own courses appear here.",
    fr: "Vos propres cours apparaîtront ici.",
  },
  draftsEmptyBody: {
    en: "Start from a deck in the classroom theme, or bring the slides you already teach with.",
    fr: "Partez d’un modèle en thème « salle de cours », ou reprenez les diapositives avec lesquelles vous enseignez déjà.",
  },
  // file a course
  file: { en: "File in a subject…", fr: "Classer dans une matière…" },
  fileTitle: { en: "File “{t}”", fr: "Classer « {t} »" },
  fileBody: {
    en: "A course lives in one place: a programme, then one of its subjects.",
    fr: "Un cours a une seule place : un programme, puis l’une de ses matières.",
  },
  fileProgram: { en: "Programme", fr: "Programme" },
  fileSubject: { en: "Subject", fr: "Matière" },
  fileNone: { en: "Not filed (my courses)", fr: "Non classé (mes cours)" },
  level: { en: "Level", fr: "Niveau" },
  fileSave: { en: "Save", fr: "Enregistrer" },
  filed: { en: "Filed in {p}", fr: "Classé dans {p}" },
  unfiled: {
    en: "Back in My courses and drafts",
    fr: "Remis dans Mes cours et brouillons",
  },
  // procedures
  memoryN: { en: "{n} from memory", fr: "{n} de mémoire" },
  memoryShort: { en: "Memory", fr: "Mémoire" },
  holdTargets: { en: "Hold {v}", fr: "Tenir {v}" },
  ref: { en: "Reference", fr: "Référence" },
  drillIt: { en: "Drill it in the simulator", fr: "S’entraîner au simulateur" },
  customise: { en: "Customise for the club", fr: "Adapter pour le club" },
  editClub: {
    en: "Edit the club procedure",
    fr: "Modifier la procédure du club",
  },
  close: { en: "Close", fr: "Fermer" },
  // pointers, planned courses, empty subjects
  lessonN: { en: "Lesson {n}:", fr: "Leçon {n} :" },
  orFree: { en: "Or a first free flight:", fr: "Ou un premier vol libre :" },
  soon: { en: "Soon", fr: "Bientôt" },
  create: { en: "Create", fr: "Créer" },
  soonCourse: { en: "Course · coming soon", fr: "Cours · bientôt disponible" },
  soonHead: {
    en: "Planned for this subject",
    fr: "Prévu dans cette matière",
  },
  pointerHead: { en: "Work on it in {p}", fr: "À travailler dans {p}" },
  pointerSub: {
    en: "No item of its own here yet: these live in another programme.",
    fr: "Pas encore d’élément propre ici : ceux-ci sont rangés dans un autre programme.",
  },
  pointersN: { en: "{n} elsewhere", fr: "{n} ailleurs" },
  usefulElsewhere: {
    en: "→ {n} useful, shelved elsewhere",
    fr: "→ {n} utiles, rangés ailleurs",
  },
  pointerTip: {
    en: "{n} useful items, shelved in another programme",
    fr: "{n} éléments utiles, rangés dans un autre programme",
  },
  notYet: { en: "Not written yet:", fr: "Pas encore rédigé :" },
  emptyRailN: {
    en: "+ {n} subjects with no content yet",
    fr: "+ {n} matières sans contenu pour l’instant",
  },
  emptyRail1: {
    en: "+ 1 subject with no content yet",
    fr: "+ 1 matière sans contenu pour l’instant",
  },
  // search: subjects and planned courses
  hitSubjects: { en: "Subjects", fr: "Matières" },
  hitSubject: { en: "Subject", fr: "Matière" },
  hitSoon: { en: "Coming to the library", fr: "Bientôt dans la bibliothèque" },
  subjectOnly: {
    en: "“{q}” in the syllabus",
    fr: "« {q} » dans le programme",
  },
  subjectOnlyBody: {
    en: "No course, lesson or checklist has these words yet; the subject below is where they will live.",
    fr: "Aucun cours, leçon ou check-list ne porte encore ces mots ; la matière ci-dessous est l’endroit où ils seront rangés.",
  },
  suggest: { en: "Closest subjects:", fr: "Matières les plus proches :" },
  // club tools
  clubTools: { en: "Club tools", fr: "Outils du club" },
  clubNew: { en: "New club course", fr: "Nouveau cours du club" },
  clubNewSub: {
    en: "Filed straight in Club › Club courses",
    fr: "Rangé directement dans Club › Cours du club",
  },
  clubPack: { en: "Import the club pack", fr: "Importer le pack du club" },
  clubPackSub: {
    en: "The club’s checklists and drills, from a link or a file",
    fr: "Check-lists et exercices du club, depuis un lien ou un fichier",
  },
  clubLists: { en: "Adapt the checklists", fr: "Adapter les check-lists" },
  clubListsSub: {
    en: "Edit a C172S checklist for your fleet",
    fr: "Modifier une check-list C172S pour votre flotte",
  },
  clubDrill: { en: "Create a club drill", fr: "Créer un exercice du club" },
  clubDrillSub: {
    en: "Failures at a chosen moment, assigned to a student",
    fr: "Des pannes au moment choisi, assignées à un élève",
  },
  clubResults: { en: "Results", fr: "Résultats" },
  clubResultsSub: {
    en: "Who flew which drill, and how",
    fr: "Qui a volé quel exercice, et comment",
  },
  clubCoursesEmpty: {
    en: "Your club’s own courses appear here.",
    fr: "Les cours propres à votre club apparaîtront ici.",
  },
  clubCoursesEmptyBody: {
    en: "Write one, or import a course a member shared (.ifrcourse).",
    fr: "Rédigez-en un, ou importez un cours partagé par un membre (.ifrcourse).",
  },
  clubImport: { en: "Import a course", fr: "Importer un cours" },
  // every flight of the simulator
  flightsTitle: { en: "In the simulator", fr: "Au simulateur" },
  flightsEyebrow: { en: "All flights", fr: "Tous les vols" },
  flightsLead: {
    en: "Every sim lesson, failure drill, graded route and free practice, shelved in its programme and subject.",
    fr: "Chaque leçon au simulateur, exercice de panne, parcours noté et entraînement libre, rangé dans son programme et sa matière.",
  },
  flightsWord: { en: "flights", fr: "vols" },
  flightsLink: {
    en: "All flights in the simulator · {n}",
    fr: "Tous les vols au simulateur · {n}",
  },
  // the Flight Center's entry
  fcLibrary: { en: "Library", fr: "Bibliothèque" },
  fcLibrarySub: {
    en: "Courses, sim lessons and checklists, by programme",
    fr: "Cours, leçons au simulateur et check-lists, par programme",
  },
  fcOpen: { en: "Open the library", fr: "Ouvrir la bibliothèque" },
  // a11y
  kindsNav: { en: "What to show", fr: "Ce qu’il faut afficher" },
  crumbNav: { en: "Where you are", fr: "Où vous êtes" },
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
