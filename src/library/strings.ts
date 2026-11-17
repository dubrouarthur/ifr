// The unified library's words (FR / EN). The course actions it shares with the course player (open, edit, export,
// share…) keep their strings in course/i18n.ts; these are the library's own.
import type { Lang } from "../course/types";
import { BRAND } from "../brand";

const S = {
  eyebrow: { en: "Library", fr: "Bibliothèque" },
  title: { en: "Choose your programme", fr: "Choisissez votre formation" },
  lead: {
    en: "Each programme is shelved by subject, in the order of the official syllabus.",
    fr: "Chaque formation est rangée par matière, dans l’ordre du programme officiel.",
  },
  // one glossary (audit §41): never « éléments », say what they are
  coursesReady: { en: "{n} courses ready", fr: "{n} cours prêts" },
  courseReady1: { en: "1 course ready", fr: "1 cours prêt" },
  subjectsReady: { en: "{r} of {n} subjects", fr: "{r} matières sur {n}" },
  flightsN: { en: "{n} flights", fr: "{n} vols" },
  flight1: { en: "1 flight", fr: "1 vol" },
  checklistsN: { en: "{n} checklists", fr: "{n} check-lists" },
  checklist1: { en: "1 checklist", fr: "1 check-list" },
  readyLine: {
    en: "Ready: {r} subjects · Being written: {s}",
    fr: "Prêt : {r} matières · En préparation : {s}",
  },
  soonBlock: { en: "Being written", fr: "En préparation" },
  soonBlockSub: {
    en: "These subjects of the syllabus have no course yet.",
    fr: "Ces matières du programme n’ont pas encore de cours.",
  },
  search: {
    en: "Search a course, a lesson, a checklist",
    fr: "Rechercher un cours, une leçon, une check-list",
  },
  searchIn: { en: "Search in {p}", fr: "Rechercher dans {p}" },
  items: { en: "{n} items", fr: "{n} éléments" },
  item1: { en: "1 item", fr: "1 élément" },
  doneN: { en: "{n} done", fr: "{n} terminés" },
  done1: { en: "1 done", fr: "1 terminé" },
  all: { en: "All", fr: "Tout" },
  newCourse: { en: "New course", fr: "Nouveau cours" },
  library: { en: "Library", fr: "Bibliothèque" },
  searchCrumb: { en: "Search", fr: "Recherche" },
  // landing
  continue: { en: "Continue", fr: "Reprendre" },
  resumeEdit: { en: "Continue editing", fr: "Reprendre la modification" },
  continueSub: { en: "Where you left off", fr: "Là où vous vous êtes arrêté" },
  where: { en: "Where to start?", fr: "Où commencer ?" },
  newHere: { en: `New to ${BRAND.name}?`, fr: `Nouveau sur ${BRAND.name} ?` },
  toolsN: { en: "{n} tools", fr: "{n} outils" },
  openReceived: { en: "Open a course you received", fr: "Ouvrir un cours reçu" },
  openReceivedSub: {
    en: "The course file your instructor sent you. You can also drop it on this page.",
    fr: "Le fichier de cours envoyé par votre instructeur. Vous pouvez aussi le déposer sur cette page.",
  },
  receivedOpened: { en: "Course added to your library", fr: "Cours ajouté à votre bibliothèque" },
  // programme page
  index: { en: "Contents", fr: "Sommaire" },
  // search
  results: { en: "{n} results for “{q}”", fr: "{n} résultats pour « {q} »" },
  result1: { en: "1 result for “{q}”", fr: "1 résultat pour « {q} »" },
  subjectsN: { en: "{n} subjects", fr: "{n} matières" },
  subject1: { en: "1 subject", fr: "1 matière" },
  noResults: {
    en: "Nothing matches “{q}”",
    fr: "Rien ne correspond à « {q} »",
  },
  // cards
  // a course is a deck: its count is in slides (audit §41 glossary)
  steps: { en: "{n} slides", fr: "{n} diapos" },
  step1: { en: "1 slide", fr: "1 diapo" },
  itemsN: { en: "{n} items", fr: "{n} points" },
  min: { en: "{n} min", fr: "{n} min" },
  passed: { en: "Passed", fr: "Réussi" },
  passedPct: { en: "Passed · {n}%", fr: "Réussi · {n} %" },
  triesBest: { en: "{a} · best {n}%", fr: "{a} · meilleur {n} %" },
  attemptsN: { en: "{n} attempts", fr: "{n} essais" },
  attempt1: { en: "1 attempt", fr: "1 essai" },
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
    en: "Wingdeck course files and club packs",
    fr: "Fichiers de cours Wingdeck et packs club",
  },
  toolPresent: { en: "Present to a class", fr: "Présenter à une classe" },
  teachSwitch: { en: "I teach", fr: "Je suis instructeur" },
  // a course opened from a link or a file someone sent (audit §21)
  sharedBy: { en: "Shared by {name}", fr: "Partagé par {name}" },
  // the same, when the sender never typed a name (never « Partagé par Vous » on the student's device)
  receivedByLink: { en: "Received by link", fr: "Reçu par lien" },
  // a subject with no course yet but a template for it in « Nouveau cours » (audit §23)
  soonCircuit: {
    en: "A template exists: create your circuit course",
    fr: "Un modèle existe : créez votre cours de tour de piste",
  },
  // « Enseigner avec Wingdeck » (Instructeurs › 02): how a course reaches the members and where the results live
  // (audit §19), in the words of the buttons it names
  teachLead: {
    en: "How a course reaches your members, and where their results live.",
    fr: "Comment un cours arrive à vos élèves, et où vivent leurs résultats.",
  },
  teach1: { en: "Choose", fr: "Choisir" },
  teach1Sub: {
    en: "A ready course in the Library, or your own: “Duplicate to edit” or “New course”.",
    fr: "Un cours prêt de la Bibliothèque, ou le vôtre : « Dupliquer pour modifier » ou « Nouveau cours ».",
  },
  teach2: { en: "Present", fr: "Présenter" },
  teach2Sub: {
    en: "“Present”: one window for the projector, the presenter view with your notes; → or Space to go on.",
    fr: "« Présenter » : une fenêtre pour le projecteur, la vue présentateur avec vos notes ; → ou Espace pour avancer.",
  },
  teach3: { en: "Share", fr: "Partager" },
  teach3Sub: {
    en: "“Copy the link” in the course’s “…” menu, or send the course file: the student opens it with “Open a course you received”.",
    fr: "« Copier le lien » dans le menu « … » du cours, ou envoyez le fichier du cours : l’élève l’ouvre avec « Ouvrir un cours reçu ».",
  },
  teach4: { en: "The students fly", fr: "Les élèves volent" },
  teach4Sub: {
    en: "“Your turn” on the slide, or “Fly it in the simulator”: “Back to the course” brings the result to the slide.",
    fr: "« À vous » sur la diapo, ou « Voler dans le simulateur » : « Reprendre le cours » ramène le résultat sur la diapo.",
  },
  teach5: { en: "The results stay on the device", fr: "Les résultats restent sur l’appareil" },
  teach5Sub: {
    en: "No account: each student finds their progress in their own browser; nothing is sent anywhere.",
    fr: "Pas de compte : chaque élève retrouve sa progression dans son navigateur ; rien n’est envoyé ailleurs.",
  },
  teachSwitchSub: {
    en: "Shows “Create the first course” in empty subjects and the export of courses",
    fr: "Affiche « Créez le premier cours » dans les matières vides et l’export des cours",
  },
  toolPresentSub: {
    en: "Projector window and presenter notes",
    fr: "Fenêtre projecteur et notes du présentateur",
  },
  draftsEmpty: {
    en: "You have not created a course yet.",
    fr: "Vous n’avez pas encore créé de cours.",
  },
  draftsEmptyBody: {
    en: "Start from a template: it is ready in ten minutes.",
    fr: "Partez d’un modèle : c’est prêt en dix minutes.",
  },
  // file a course
  file: { en: "File in a subject…", fr: "Classer dans une matière…" },
  fileTitle: { en: "File “{t}”", fr: "Classer « {t} »" },
  fileBody: {
    en: "A course lives in one place: a programme, then one of its subjects.",
    fr: "Un cours a une seule place : une formation, puis l’une de ses matières.",
  },
  fileProgram: { en: "Programme", fr: "Formation" },
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
  notYet: { en: "Coming soon:", fr: "Bientôt :" },
  // search: subjects and planned courses
  hitSubjects: { en: "Subjects", fr: "Matières" },
  hitSubject: { en: "Subject", fr: "Matière" },
  hitSoon: { en: "Coming to the library", fr: "Bientôt dans la bibliothèque" },
  subjectOnly: {
    en: "“{q}”: coming to the library",
    fr: "« {q} » : bientôt dans la bibliothèque",
  },
  subjectOnlyBody: {
    en: "No course, lesson or checklist has these words yet. Here is the subject where they will be filed.",
    fr: "Aucun cours, leçon ou check-list ne porte encore ces mots. Voici la matière où ils seront rangés.",
  },
  suggest: { en: "Closest subjects:", fr: "Matières les plus proches :" },
  // club tools
  clubTools: { en: "Club tools", fr: "Outils du club" },
  clubHow: {
    en: "How it works for a club: results stay on the device the flight was flown on (the club’s simulator, for example), sorted by student. The club pack carries your checklists, drills and courses to every member; it carries no results.",
    fr: "Comment ça marche pour un club : les résultats restent sur l’appareil où le vol a eu lieu (le simulateur du club, par exemple), classés par élève. Le pack du club transmet vos check-lists, exercices et cours à chaque membre ; il ne transmet pas les résultats.",
  },
  clubNew: { en: "Create a club course", fr: "Créer un cours du club" },
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
    en: "Write one, or import a course file a member shared.",
    fr: "Rédigez-en un, ou importez le fichier d’un cours partagé par un membre.",
  },
  clubImport: { en: "Import a course", fr: "Importer un cours" },
  // every flight of the simulator
  flightsTitle: {
    en: "Simulator lessons and practice",
    fr: "Leçons et entraînements au simulateur",
  },
  flightsLead: {
    en: "Every sim lesson, failure drill, graded route and free practice, shelved in its programme and subject.",
    fr: "Chaque leçon au simulateur, exercice de panne, parcours noté et entraînement libre, rangé dans sa formation et sa matière.",
  },
  // the Flight Center's entry
  fcLibrary: { en: "Library", fr: "Bibliothèque" },
  fcLibrarySub: {
    en: "Courses, sim lessons and checklists, by programme",
    fr: "Cours, leçons au simulateur et check-lists, par formation",
  },
  fcOpen: { en: "Open the library", fr: "Ouvrir la bibliothèque" },
  // UX logic step B: the library home, the formation pages, search
  resumeBtn: { en: "Resume", fr: "Reprendre" },
  stepOf: { en: "slide {n} of {m}", fr: "diapo {n} sur {m}" },
  startWith: { en: "Start with", fr: "Commencer par" },
  continueWith: { en: "Continue with", fr: "Continuer par" },
  forClub: {
    en: "For the club and instructors",
    fr: "Pour le club et les instructeurs",
  },
  coursesN: { en: "{n} courses", fr: "{n} cours" },
  course1: { en: "1 course", fr: "1 cours" },
  // the tour is a page to scroll, not a timed minute (audit §20)
  discover: {
    en: `Discover ${BRAND.name}`,
    fr: `Découvrir ${BRAND.name}`,
  },
  doneOf: { en: "{d} of {n} done", fr: "{d} sur {n} terminés" },
  coursesDoneOf: { en: "{d} of {n} courses done", fr: "{d} sur {n} cours terminés" },
  start: { en: "Start", fr: "Commencer" },
  startLesson: { en: "Start: lesson {n}", fr: "Commencer : leçon {n}" },
  startCourse: { en: "Start the first course", fr: "Commencer le premier cours" },
  goOn: { en: "Continue", fr: "Continuer" },
  goOnLesson: { en: "Continue: lesson {n}", fr: "Continuer : leçon {n}" },
  inSim: { en: "in the simulator", fr: "au simulateur" },
  allDone: { en: "Everything is done", fr: "Tout est terminé" },
  syllabusHint: {
    en: "The subjects follow the official syllabus, {a} to {b}.",
    fr: "Les matières suivent le programme officiel, de {a} à {b}.",
  },
  syllabusHintBeyond: {
    en: "The subjects follow the official syllabus, {a} to {b}; then {c}.",
    fr: "Les matières suivent le programme officiel, de {a} à {b} ; puis {c}.",
  },
  soonOne: {
    en: "Coming to {b}: “{t}” is being written.",
    fr: "Bientôt dans {b} : « {t} » est en préparation.",
  },
  soonMany: {
    en: "Coming to {b}: {t} are being written.",
    fr: "Bientôt dans {b} : {t} sont en préparation.",
  },
  soonBare: { en: "Coming to {b}.", fr: "Bientôt dans {b}." },
  soonWord: { en: "soon", fr: "bientôt" },
  createHere: {
    en: "Create the first course of this subject",
    fr: "Créez le premier cours de cette matière",
  },
  fromProgram: { en: "From the {p} programme", fr: "Vient de la formation {p}" },
  noneOfKind: {
    en: "Nothing under “{k}” here.",
    fr: "Rien dans « {k} » ici.",
  },
  showAllN: { en: "Show all · {n}", fr: "Tout afficher · {n}" },
  about: { en: "about {t}", fr: "environ {t}" },
  contentsAt: { en: "Contents: {s}", fr: "Sommaire : {s}" },
  noHits: { en: "No results for “{q}”", fr: "Aucun résultat pour « {q} »" },
  noHitsTry: { en: "Try", fr: "Essayez" },
  or: { en: "or", fr: "ou" },
  orBrowse: { en: "or browse", fr: "ou parcourez" },
  searchAllBtn: {
    en: "Search the whole library",
    fr: "Chercher dans toute la bibliothèque",
  },
  and: { en: "and", fr: "et" },
  clubNothing: {
    en: "Your club has not added anything here yet.",
    fr: "Votre club n’a encore rien ajouté ici.",
  },
  clubNoLists: {
    en: "Your club has not adapted a checklist yet. The library’s checklists apply.",
    fr: "Votre club n’a encore adapté aucune check-list. Les check-lists de la bibliothèque s’appliquent.",
  },
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
