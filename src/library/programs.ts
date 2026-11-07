// The unified library (academy #library and the Flight Center's Library): the programs a club or a school teaches,
// the three kinds of things it holds and the three levels. Constants and labels only (FR / EN), no DOM.
import type { CourseLevel, CourseProgram, L10n } from "../course/types";

/** A library program: the licence or the part of club life an item belongs to. */
export type ProgramId = Exclude<CourseProgram, "lapl-ppl">;
/** What an item is: a slide course, a procedure or checklist, or a flight in the simulator. */
export type LibKind = "course" | "procedure" | "flight";
/** The finer kind a card names. */
export type LibSub =
  | "course"
  | "checklist"
  | "clubProcedure"
  | "lesson"
  | "drill"
  | "scenario"
  | "circuit";
export type Level = CourseLevel;

export interface ProgramDef {
  id: ProgramId;
  /** the short code on the program strip ("PPL(A)") */
  code: L10n;
  /** the full name */
  title: L10n;
  /** the frame it follows ("EASA Part-FCL · FAA Private") */
  frame: L10n;
  /** one line: what a student finds there */
  blurb: L10n;
  /** the level a course of this program gets when it names none */
  level: Level;
}

export const PROGRAMS: readonly ProgramDef[] = [
  {
    id: "lapl",
    code: { en: "LAPL(A)", fr: "LAPL(A)" },
    title: {
      en: "Light aircraft pilot licence",
      fr: "Licence de pilote d’aéronef léger",
    },
    frame: { en: "EASA Part-FCL", fr: "EASA Part-FCL" },
    blurb: {
      en: "The aeroclub basics: the circuit, engine failures, the first navigation flights",
      fr: "Les bases de l’aéroclub : tour de piste, pannes moteur, premières navigations",
    },
    level: 1,
  },
  {
    id: "ppl",
    code: { en: "PPL(A)", fr: "PPL(A)" },
    title: { en: "Private pilot licence", fr: "Licence de pilote privé" },
    frame: {
      en: "EASA Part-FCL · FAA Private",
      fr: "EASA Part-FCL · FAA Private",
    },
    blurb: {
      en: "The nine theory subjects, the C172S, emergencies and basic instrument flying",
      fr: "Les neuf matières théoriques, le C172S, les urgences et le vol aux instruments de base",
    },
    level: 1,
  },
  {
    id: "night",
    code: { en: "Night · VFR", fr: "Nuit · VFR" },
    title: { en: "Night rating and VFR", fr: "Qualification de nuit et VFR" },
    frame: { en: "EASA FCL.810 · SERA", fr: "EASA FCL.810 · SERA" },
    blurb: {
      en: "Flying by the instruments when the horizon goes, disorientation, electrical failures",
      fr: "Piloter aux instruments quand l’horizon disparaît, désorientation, pannes électriques",
    },
    level: 2,
  },
  {
    id: "ir",
    code: { en: "IR", fr: "IR" },
    title: {
      en: "Instrument rating",
      fr: "Qualification de vol aux instruments",
    },
    frame: { en: "EASA IR · FAA Instrument", fr: "EASA IR · FAA Instrument" },
    blurb: {
      en: "From the first scan to the checkride: radio navigation, holds, approaches",
      fr: "Du premier circuit visuel au test : radionavigation, attentes, approches",
    },
    level: 2,
  },
  {
    id: "atpl",
    code: { en: "ATPL", fr: "ATPL" },
    title: { en: "ATPL theory", fr: "Théorique ATPL" },
    frame: {
      en: "EASA 14 subjects · FAA ATP",
      fr: "EASA 14 matières · FAA ATP",
    },
    blurb: {
      en: "The subjects where live instruments and calculations help most",
      fr: "Les matières où instruments en direct et calculs aident le plus",
    },
    level: 3,
  },
  {
    id: "club",
    code: { en: "Club", fr: "Club" },
    title: { en: "Club life", fr: "Vie du club" },
    frame: {
      en: "Checklists · local procedures · briefings",
      fr: "Check-lists · procédures locales · briefings",
    },
    blurb: {
      en: "Your club’s own checklists and drills, its briefings and the radio phraseology",
      fr: "Les check-lists et exercices du club, ses briefings et la phraséologie radio",
    },
    level: 1,
  },
  {
    id: "instructors",
    code: { en: "FI", fr: "FI" },
    title: { en: "For instructors", fr: "Pour les instructeurs" },
    frame: {
      en: "Create · present · follow up",
      fr: "Créer · présenter · suivre",
    },
    blurb: {
      en: "Build a course from a template or your slides, teach it in class, follow your students",
      fr: "Créer un cours depuis un modèle ou vos diapositives, l’enseigner en salle, suivre vos élèves",
    },
    level: 1,
  },
];
export const PROGRAM_IDS: readonly ProgramId[] = PROGRAMS.map((p) => p.id);
export const programDef = (id: ProgramId): ProgramDef =>
  PROGRAMS.find((p) => p.id === id)!;
export const isProgramId = (x: unknown): x is ProgramId =>
  typeof x === "string" && (PROGRAM_IDS as readonly string[]).includes(x);

/** A course's program field as library programs ('lapl-ppl' is both, PPL first). */
export function expandPrograms(
  p: CourseProgram | readonly CourseProgram[] | null | undefined,
): ProgramId[] {
  const list = p === undefined || p === null ? [] : Array.isArray(p) ? p : [p];
  const out: ProgramId[] = [];
  for (const x of list as readonly string[]) {
    const ids: string[] = x === "lapl-ppl" ? ["ppl", "lapl"] : [x];
    for (const id of ids)
      if (isProgramId(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export const KINDS: readonly { id: LibKind; title: L10n; plural: L10n }[] = [
  {
    id: "course",
    title: { en: "Course", fr: "Cours" },
    plural: { en: "Courses", fr: "Cours" },
  },
  {
    id: "flight",
    title: { en: "Flight", fr: "Vol" },
    plural: { en: "Simulator flights", fr: "Vols au simulateur" },
  },
  {
    id: "procedure",
    title: { en: "Procedure", fr: "Procédure" },
    plural: {
      en: "Procedures and checklists",
      fr: "Procédures et check-lists",
    },
  },
];
export const KIND_ORDER: readonly LibKind[] = KINDS.map((k) => k.id);
/** The filter labels (short). */
export const KIND_FILTER: Record<LibKind, L10n> = {
  course: { en: "Courses", fr: "Cours" },
  procedure: { en: "Procedures", fr: "Procédures" },
  flight: { en: "Flights", fr: "Vols" },
};

/** The word on a card. */
export const SUB_LABEL: Record<LibSub, L10n> = {
  course: { en: "Course", fr: "Cours" },
  checklist: { en: "Checklist", fr: "Check-list" },
  clubProcedure: { en: "Club procedure", fr: "Procédure du club" },
  lesson: { en: "Sim lesson", fr: "Leçon au simulateur" },
  drill: { en: "Failure drill", fr: "Exercice de panne" },
  scenario: { en: "Scenario", fr: "Scénario" },
  circuit: { en: "School circuit", fr: "Circuit école" },
};

export const LEVELS: readonly { id: Level; title: L10n }[] = [
  { id: 1, title: { en: "Getting started", fr: "Débuter" } },
  { id: 2, title: { en: "Core", fr: "Fondamentaux" } },
  { id: 3, title: { en: "Advanced", fr: "Avancé" } },
];
export const levelTitle = (l: Level): L10n =>
  LEVELS.find((x) => x.id === l)!.title;
