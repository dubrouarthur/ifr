// Ground school — the course library (wave "library"): the shared shapes every author registry uses. Types and
// constants only, no course content: authors write their courses in `<slug>.ts` and list them in their own
// registry (reg-a1.ts … reg-a5.ts), so no two authors ever edit the same file.
import type { Course, L10n } from "../../types";

/** The four programs the unified library is organised in. */
export type LibraryProgram = "lapl-ppl" | "ir" | "atpl" | "club";
/** The author lane a course belongs to (one registry file per author). */
export type LibraryAuthor = "A1" | "A2" | "A3" | "A4" | "A5";

/** One library course, as an author registers it (the samples index turns it into a SampleDef). */
export interface LibraryDef {
  /** `sample-lib-<slug>`, the same as the built course's id */
  id: string;
  program: LibraryProgram;
  build: () => Course;
  /** one line for the library card when the course itself is not loaded */
  blurb: L10n;
}

/** Every library course id: `sample-lib-` then a lower-case slug. */
export const LIBRARY_ID = /^sample-lib-[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The programs in library order, with their labels (FR / EN). */
export const LIBRARY_PROGRAMS: readonly {
  id: LibraryProgram;
  title: L10n;
  blurb: L10n;
}[] = [
  {
    id: "lapl-ppl",
    title: { en: "LAPL / PPL", fr: "LAPL / PPL" },
    blurb: {
      en: "Theory and the aeroclub practice: circuit, forced landing, navigation, C172S",
      fr: "Théorie et pratique d’aéroclub : tour de piste, PTU, navigation, C172S",
    },
  },
  {
    id: "ir",
    title: { en: "Instrument rating", fr: "Qualification de vol aux instruments" },
    blurb: {
      en: "Instruments, radio navigation, procedures and IFR planning",
      fr: "Instruments, radionavigation, procédures et préparation IFR",
    },
  },
  {
    id: "atpl",
    title: { en: "ATPL theory", fr: "Théorique ATPL" },
    blurb: {
      en: "The subjects where live instruments and calculations help most",
      fr: "Les matières où instruments en direct et calculs aident le plus",
    },
  },
  {
    id: "club",
    title: { en: "Club", fr: "Club" },
    blurb: {
      en: "Club life, briefings, phraseology and teaching with the platform",
      fr: "Vie du club, briefings, phraséologie et enseigner avec la plateforme",
    },
  },
];
