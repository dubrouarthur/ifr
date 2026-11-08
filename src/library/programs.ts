// The unified library (academy #library and the Flight Center): ONE way to browse it. The library is a bookcase:
// programme shelves in the order a pilot meets them (Découvrir, LAPL · PPL, Vol de nuit, IR, ATPL, Club,
// Instructeurs), and on each shelf its subjects in syllabus order (Part-FCL's nine theory subjects then the flight
// modules, the IR's curriculum stages, the 13 ATPL subjects). Every item has exactly one home: a subject
// (classification.ts). The three kind families are the only filter. Constants and labels only (FR / EN), no DOM.
import type { CourseLevel, CourseProgram, L10n } from "../course/types";
import { BRAND } from "../brand";

/** A programme shelf. LAPL and PPL share one (Part-FCL gives them the same subjects and flight exercises). */
export type ProgramId =
  | "discover"
  | "ppl"
  | "night"
  | "ir"
  | "atpl"
  | "club"
  | "instructors";
/** The filter's three families: slide courses, what opens the cockpit, procedures and checklists. */
export type LibKind = "course" | "sim" | "proc";
/** The one plain word on a card. */
export type LibSub =
  | "course"
  | "lesson"
  | "drill"
  | "circuit"
  | "scenario"
  | "checklist"
  | "clubChecklist";
export type Level = CourseLevel;

export interface ProgramDef {
  id: ProgramId;
  /** the short name ("LAPL · PPL", "IR") */
  code: L10n;
  /** the full name ("Licence de pilote avion") */
  title: L10n;
  /** the frame it follows ("EASA Part-FCL · LAPL(A) et PPL(A)") */
  frame: L10n;
  /** one line: what a student finds there */
  blurb: L10n;
  /** the student's own words for « this one is for me » (the library's formation cards: « Je débute le pilotage ») */
  who?: L10n;
  /** the level a course filed here gets when it names none */
  level: Level;
  /** the subject a course of this programme lands in when nothing better is known */
  fallback: SubjectId;
}

// ------------------------------------------------------------------ subjects (syllabus order)
export type SubjectGroup = "theory" | "flight";
interface SubjectRow {
  id: string;
  program: ProgramId;
  /** syllabus number as printed ("01", "010") */
  n: string;
  title: L10n;
  group?: SubjectGroup;
  /** words that file an unknown course here (its id slug or its tags) */
  words?: readonly string[];
}
function S<P extends ProgramId, I extends string>(
  program: P,
  id: I,
  n: string,
  en: string,
  fr: string,
  words: readonly string[] = [],
  group?: SubjectGroup,
): SubjectRow & { id: `${P}.${I}` } {
  return {
    id: `${program}.${id}`,
    program,
    n,
    title: { en, fr },
    words,
    ...(group ? { group } : {}),
  };
}
const T = <I extends string>(
  id: I,
  n: string,
  en: string,
  fr: string,
  w: string[] = [],
) => S("ppl", id, n, en, fr, w, "theory");
const F = <I extends string>(
  id: I,
  n: string,
  en: string,
  fr: string,
  w: string[] = [],
) => S("ppl", id, n, en, fr, w, "flight");
const A = <N extends string>(n: N, en: string, fr: string, w: string[] = []) =>
  S("atpl", n, n, en, fr, [n, ...w]);

const SUBJECT_ROWS = [
  S("discover", "start", "01", "First steps", "Premiers pas"),
  // LAPL · PPL: the nine Part-FCL theory subjects, then the flight modules
  T("law", "01", "Air law", "Droit aérien", [
    "law",
    "airspace",
    "rules",
    "sera",
    "regulation",
  ]),
  T("hp", "02", "Human performance", "Performances humaines", [
    "human",
    "physiology",
    "disorientation",
  ]),
  T("met", "03", "Meteorology", "Météorologie", [
    "meteorology",
    "weather",
    "metar",
    "taf",
    "met",
  ]),
  T("com", "04", "Communications", "Communications", [
    "phraseology",
    "radio",
    "communications",
    "rt",
  ]),
  T("pof", "05", "Principles of flight", "Principes du vol", [
    "principles",
    "aerodynamics",
    "lift",
    "stall",
  ]),
  T("ops", "06", "Operational procedures", "Procédures opérationnelles", [
    "operational",
    "operations",
  ]),
  T(
    "fpp",
    "07",
    "Flight performance and planning",
    "Performances et préparation du vol",
    ["performance", "mass", "balance", "planning", "maths"],
  ),
  T(
    "agk",
    "08",
    "Aircraft general knowledge",
    "Connaissance générale de l’aéronef",
    ["systems", "engine", "aircraft"],
  ),
  T("nav", "09", "Navigation", "Navigation", ["navigation", "chart", "map"]),
  F(
    "prep",
    "10",
    "Preparation and normal procedures",
    "Préparation et procédures normales",
    ["normal", "preflight", "checklist"],
  ),
  F("hand", "11", "Aircraft handling", "Maniabilité", [
    "handling",
    "slow",
    "steep",
  ]),
  F("circ", "12", "Circuits and landings", "Tour de piste et atterrissages", [
    "circuit",
    "landing",
    "landings",
    "takeoff",
    "pattern",
  ]),
  F("emer", "13", "Failures and emergencies", "Pannes et urgences", [
    "emergency",
    "emergencies",
    "forced",
    "failure",
  ]),
  F("xc", "14", "Navigation flights", "Navigation en vol", [
    "cross",
    "country",
    "xc",
  ]),
  F("bif", "15", "Basic instrument flight", "Vol aux instruments de base", [
    "basic",
    "instrument",
  ]),
  // Night rating
  S(
    "night",
    "rules",
    "01",
    "Night rules and minima",
    "Règles et minima de nuit",
    ["rules", "minima"],
  ),
  S(
    "night",
    "hp",
    "02",
    "Night vision and disorientation",
    "Vision de nuit et désorientation",
    ["vision", "disorientation"],
  ),
  S("night", "nav", "03", "Night navigation", "Navigation de nuit", [
    "navigation",
  ]),
  S("night", "emer", "04", "Failures at night", "Pannes de nuit", [
    "failure",
    "emergency",
  ]),
  // IR: the curriculum stages S1–S8, in the order a student flies them
  S(
    "ir",
    "att",
    "01",
    "Attitude instrument flying",
    "Pilotage aux instruments",
    ["scan", "attitude", "instruments", "gyros", "pressure", "compass"],
  ),
  S("ir", "nav", "02", "Radio navigation", "Radionavigation", [
    "vor",
    "ndb",
    "adf",
    "dme",
    "radionav",
    "gps",
  ]),
  S("ir", "hold", "03", "Holding", "Attentes", ["holding", "hold", "holds"]),
  S("ir", "app", "04", "Approaches", "Approches", [
    "ils",
    "loc",
    "rnav",
    "gnss",
    "approach",
    "approaches",
  ]),
  S(
    "ir",
    "emer",
    "05",
    "IFR failures and emergencies",
    "Pannes et urgences IFR",
    ["lost", "comms", "failure", "emergency"],
  ),
  S(
    "ir",
    "proc",
    "06",
    "IFR procedures and cross-countries",
    "Procédures IFR et navigations",
    ["departures", "arrivals", "sid", "star", "planning", "maths"],
  ),
  S("ir", "test", "07", "Checkride", "Test pratique", ["checkride", "test"]),
  // ATPL: the 13 EASA subjects
  A("010", "Air law", "Droit aérien", ["law"]),
  A("021", "Airframe, systems and powerplant", "Cellule, systèmes et moteurs", [
    "systems",
  ]),
  A("022", "Instrumentation", "Instrumentation", ["instruments"]),
  A("031", "Mass and balance", "Masse et centrage", ["mass"]),
  A("032", "Performance", "Performances", ["performance"]),
  A("033", "Flight planning and monitoring", "Préparation et suivi du vol", [
    "planning",
  ]),
  A("040", "Human performance", "Performances humaines", ["human"]),
  A("050", "Meteorology", "Météorologie", ["meteorology"]),
  A("061", "General navigation", "Navigation générale", ["navigation"]),
  A("062", "Radio navigation", "Radionavigation", ["radionav"]),
  A("070", "Operational procedures", "Procédures opérationnelles", [
    "operational",
  ]),
  A("081", "Principles of flight", "Principes du vol", ["principles"]),
  A("090", "Communications", "Communications", ["communications"]),
  // Club
  S("club", "life", "01", "Club essentials", "L’essentiel du club", [
    "essentials",
    "briefing",
  ]),
  S(
    "club",
    "drills",
    "02",
    "Club checks and drills",
    "Contrôles et exercices du club",
    ["drill", "drills", "check", "test"],
  ),
  S("club", "courses", "03", "Club courses", "Cours du club"),
  // Instructors
  S(
    "instructors",
    "teach",
    "01",
    `Teaching with ${BRAND.name}`,
    `Enseigner avec ${BRAND.name}`,
    ["teaching", "teach"],
  ),
  S(
    "instructors",
    "mine",
    "02",
    "My courses and drafts",
    "Mes cours et brouillons",
  ),
] as const satisfies readonly SubjectRow[];

export type SubjectId = (typeof SUBJECT_ROWS)[number]["id"];
export interface SubjectDef extends SubjectRow {
  id: SubjectId;
}
export const SUBJECTS: readonly SubjectDef[] =
  SUBJECT_ROWS as readonly SubjectDef[];
const SUBJECT_BY_ID = new Map<string, SubjectDef>(
  SUBJECTS.map((s) => [s.id, s]),
);
export const isSubjectId = (x: unknown): x is SubjectId =>
  typeof x === "string" && SUBJECT_BY_ID.has(x);
export const subjectDef = (id: SubjectId): SubjectDef => SUBJECT_BY_ID.get(id)!;
export const subjectsOf = (p: ProgramId): SubjectDef[] =>
  SUBJECTS.filter((s) => s.program === p);
/** The rank of a subject in the whole bookcase (shelf order, then syllabus order). */
export const subjectRank = (id: SubjectId): number =>
  SUBJECTS.findIndex((s) => s.id === id);

// ------------------------------------------------------------------ the shelves
export const PROGRAMS: readonly ProgramDef[] = [
  {
    id: "discover",
    code: { en: "Discover", fr: "Découvrir" },
    title: { en: "Discover the platform", fr: "Découvrir la plateforme" },
    frame: { en: "For everyone", fr: "Pour tout le monde" },
    blurb: {
      en: "The platform in 5 slides and a first free flight",
      fr: "La plateforme en 5 diapositives et un premier vol libre",
    },
    level: 1,
    fallback: "discover.start",
  },
  {
    id: "ppl",
    code: { en: "LAPL · PPL", fr: "LAPL · PPL" },
    title: { en: "Pilot licence, aeroplane", fr: "Licence de pilote avion" },
    frame: {
      en: "EASA Part-FCL · on the Cessna 172",
      fr: "EASA Part-FCL · sur Cessna 172",
    },
    blurb: {
      en: "The 9 theory subjects, then flying: circuits, failures, navigation.",
      fr: "Les 9 matières de la théorie, puis le pilotage : tour de piste, pannes, navigation.",
    },
    who: { en: "I am learning to fly", fr: "Je débute le pilotage" },
    level: 1,
    fallback: "ppl.prep",
  },
  {
    id: "night",
    code: { en: "Night", fr: "Vol de nuit" },
    title: { en: "Night rating", fr: "Qualification vol de nuit" },
    frame: { en: "EASA rating · after the PPL", fr: "Qualification EASA · après le PPL" },
    blurb: {
      en: "Rules and minima, night vision, navigation and failures at night.",
      fr: "Règles et minima, vision de nuit, navigation et pannes de nuit.",
    },
    who: { en: "I have my PPL", fr: "J’ai mon PPL" },
    level: 2,
    fallback: "night.rules",
  },
  {
    id: "ir",
    code: { en: "IR", fr: "IR" },
    title: { en: "Instrument rating", fr: "Vol aux instruments" },
    frame: { en: "EASA and FAA · on the Cessna 172", fr: "EASA et FAA · sur Cessna 172" },
    blurb: {
      en: "Seven subjects, from attitude instrument flying to the checkride.",
      fr: "Sept matières, du pilotage aux instruments jusqu’au test pratique.",
    },
    who: { en: "I am preparing the IR", fr: "Je prépare l’IR" },
    level: 2,
    fallback: "ir.proc",
  },
  {
    id: "atpl",
    code: { en: "ATPL", fr: "ATPL" },
    title: { en: "ATPL theory", fr: "Théorie ATPL" },
    frame: {
      en: "EASA ATPL(A) · 13 subjects",
      fr: "EASA ATPL(A) · 13 matières",
    },
    blurb: {
      en: "The 13 exam subjects, 010 to 090. The first courses are ready.",
      fr: "Les 13 matières de l’examen, de 010 à 090. Premiers cours disponibles.",
    },
    who: { en: "I am preparing ATPL theory", fr: "Je prépare la théorie ATPL" },
    level: 3,
    fallback: "atpl.010",
  },
  {
    id: "club",
    code: { en: "Club", fr: "Club" },
    title: { en: "Club life", fr: "Vie du club" },
    frame: { en: "Your club’s own", fr: "Propre à votre club" },
    blurb: {
      en: "The checklists and drills your club has adapted",
      fr: "Les check-lists et les exercices adaptés par votre club",
    },
    level: 1,
    fallback: "club.courses",
  },
  {
    id: "instructors",
    code: { en: "Instructors", fr: "Instructeurs" },
    title: { en: "For instructors", fr: "Pour les instructeurs" },
    frame: {
      en: "Create · present · follow up",
      fr: "Créer · présenter · suivre",
    },
    blurb: {
      en: "Your courses and drafts, the templates, importing your slides",
      fr: "Vos cours et brouillons, les modèles, l’import de diapositives",
    },
    level: 1,
    fallback: "instructors.mine",
  },
];
export const PROGRAM_IDS: readonly ProgramId[] = PROGRAMS.map((p) => p.id);
/** The shelves the landing lists (Découvrir is the "Où commencer ?" block, never a shelf row). */
export const SHELF_IDS: readonly ProgramId[] = PROGRAM_IDS.filter(
  (p) => p !== "discover",
);
export const programDef = (id: ProgramId): ProgramDef =>
  PROGRAMS.find((p) => p.id === id)!;
export const isProgramId = (x: unknown): x is ProgramId =>
  typeof x === "string" && (PROGRAM_IDS as readonly string[]).includes(x);
export const GROUP_TITLE: Record<SubjectGroup, L10n> = {
  theory: { en: "Theory", fr: "Théorie" },
  flight: { en: "In flight", fr: "En vol" },
};

/** A course's own program field (authors' vocabulary) as a shelf: LAPL, PPL and 'lapl-ppl' are the one LAPL · PPL. */
export function shelfOfCourseProgram(
  p: CourseProgram | string | null | undefined,
): ProgramId | null {
  if (!p) return null;
  if (p === "lapl" || p === "ppl" || p === "lapl-ppl") return "ppl";
  return isProgramId(p) && p !== "discover" ? p : null;
}
/** The course `program` value a shelf is saved as (the inverse, for the "File" dialog). */
export function courseProgramOf(p: ProgramId): CourseProgram | null {
  return p === "discover" ? null : p === "ppl" ? "lapl-ppl" : p;
}

const fold = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/**
 * The subject of a programme that a course with these words belongs to (its id slug, its tags, its title): the one
 * whose words match most, the first in syllabus order on a tie, else the programme's fallback. This is how a course
 * an author adds later, or a club's own course, lands in the right subject without anyone editing a table.
 */
export function guessSubject(
  p: ProgramId,
  words: readonly string[],
): SubjectId {
  const toks = new Set(
    words.flatMap((w) =>
      fold(w)
        .split(/[^a-z0-9]+/)
        .filter(Boolean),
    ),
  );
  let best: SubjectDef | null = null;
  let bestN = 0;
  for (const s of subjectsOf(p)) {
    const n = (s.words ?? []).filter((w) => toks.has(w)).length;
    if (n > bestN) ((best = s), (bestN = n));
  }
  return best?.id ?? programDef(p).fallback;
}

// ------------------------------------------------------------------ kinds
export const KIND_ORDER: readonly LibKind[] = ["course", "sim", "proc"];
/** The filter's labels (§3: no "Vols": the plain words). */
export const KIND_FILTER: Record<LibKind, L10n> = {
  course: { en: "Courses", fr: "Cours" },
  sim: { en: "In the simulator", fr: "Au simulateur" },
  proc: { en: "Checklists", fr: "Check-lists" },
};
export const KIND_OF: Record<LibSub, LibKind> = {
  course: "course",
  lesson: "sim",
  drill: "sim",
  circuit: "sim",
  scenario: "sim",
  checklist: "proc",
  clubChecklist: "proc",
};
/** The word on a card. Never "Vol", "Scénario" or "Circuit école". */
export const SUB_LABEL: Record<LibSub, L10n> = {
  course: { en: "Course", fr: "Cours" },
  lesson: { en: "Simulator lesson", fr: "Leçon au simulateur" },
  drill: { en: "Failure drill", fr: "Exercice de panne" },
  circuit: { en: "Graded route", fr: "Parcours noté" },
  scenario: { en: "Free practice", fr: "Entraînement libre" },
  checklist: { en: "Checklist", fr: "Check-list" },
  clubChecklist: { en: "Club checklist", fr: "Check-list du club" },
};
export const SUB_PLURAL: Record<LibSub, L10n> = {
  course: { en: "Courses", fr: "Cours" },
  lesson: { en: "Simulator lessons", fr: "Leçons au simulateur" },
  drill: { en: "Failure drills", fr: "Exercices de panne" },
  circuit: { en: "Graded routes", fr: "Parcours notés" },
  scenario: { en: "Free practice", fr: "Entraînements libres" },
  checklist: { en: "Checklists", fr: "Check-lists" },
  clubChecklist: { en: "Club checklists", fr: "Check-lists du club" },
};
/** Order inside a subject: understand, fly it graded, handle failures, practise freely, keep the checklist. */
export const SUB_ORDER: readonly LibSub[] = [
  "course",
  "lesson",
  "drill",
  "circuit",
  "scenario",
  "checklist",
  "clubChecklist",
];
/** What a subject's section groups by: a club's checklist sits with the checklists it replaces. */
export type GroupId = Exclude<LibSub, "clubChecklist">;
export const groupOf = (s: LibSub): GroupId =>
  s === "clubChecklist" ? "checklist" : s;
/** Scanned as compact rows, not cards (reference items). */
export const ROW_SUBS: ReadonlySet<LibSub> = new Set<LibSub>([
  "checklist",
  "clubChecklist",
  "scenario",
]);

export const LEVELS: readonly { id: Level; title: L10n }[] = [
  { id: 1, title: { en: "Beginner", fr: "Débutant" } },
  { id: 2, title: { en: "Intermediate", fr: "Intermédiaire" } },
  { id: 3, title: { en: "Advanced", fr: "Avancé" } },
];
export const levelTitle = (l: Level): L10n =>
  LEVELS.find((x) => x.id === l)!.title;
