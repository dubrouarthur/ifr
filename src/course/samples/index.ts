// Ground school — the built-in sample courses (package I): what the library lists under "Samples", what a CFI
// duplicates to adapt, and what #play=<id> opens with nothing stored. Built on demand (each build is a fresh,
// deterministic object: a caller may mutate it).
import type { Course, L10n } from "../types";
import { VOR_ID, vorCourse } from "./vor";
import { HOLDING_ID, holdingCourse } from "./holding";
import { MATHS_IFR_ID, mathsIfrCourse } from "./mathsIfr";
import { MATHS_VFR_ID, mathsVfrCourse } from "./mathsVfr";
import { CRAFTED_BRIEFINGS, HOLD_NDB_BRIEFING_ID } from "./briefings";
import { LIBRARY_COURSES, type LibraryProgram } from "./library";

export { VOR_ID, HOLDING_ID, HOLD_NDB_BRIEFING_ID, MATHS_IFR_ID, MATHS_VFR_ID };

export interface SampleDef {
  id: string;
  /** library order */
  order: number;
  build: () => Course;
  /** one line for the library card when the course itself is not loaded */
  blurb: L10n;
  /** the library program it belongs to (library courses only: samples/library) */
  program?: LibraryProgram;
}

export const SAMPLES: readonly SampleDef[] = [
  {
    id: MATHS_IFR_ID,
    order: 1,
    build: mathsIfrCourse,
    blurb: {
      en: "1 in 60, 3° path, standard rate, VDP, cold temperature",
      fr: "1 sur 60, plan à 3°, taux standard, VDP, froid",
    },
  },
  {
    id: MATHS_VFR_ID,
    order: 2,
    build: mathsVfrCourse,
    blurb: {
      en: "TVMDC, wind, fuel, crosswind, performance, balance",
      fr: "Rv → Cc, vent, carburant, travers, performances, centrage",
    },
  },
  {
    id: VOR_ID,
    order: 3,
    build: vorCourse,
    blurb: {
      en: "Read the HSI, intercept, bracket the wind",
      fr: "Lire le HSI, intercepter, encadrer le vent",
    },
  },
  {
    id: HOLDING_ID,
    order: 4,
    build: holdingCourse,
    blurb: {
      en: "Clearance, entries, timing and the triple-drift rule",
      fr: "Clairance, entrées, chronométrage, dérive triplée",
    },
  },
  // the crafted lesson briefings (samples/briefings): one deck per key sim lesson
  ...CRAFTED_BRIEFINGS.map(
    (b, i): SampleDef => ({
      id: b.id,
      order: 5 + i,
      build: b.build,
      blurb: b.blurb,
    }),
  ),
  // the course library (samples/library): LAPL/PPL, IR, ATPL and Club courses, one registry per author
  ...LIBRARY_COURSES.map(
    (d, i): SampleDef => ({
      id: d.id,
      order: 5 + CRAFTED_BRIEFINGS.length + i,
      build: d.build,
      blurb: d.blurb,
      program: d.program,
    }),
  ),
];

export const SAMPLE_IDS: readonly string[] = SAMPLES.map((s) => s.id);
export const isSampleId = (id: string): boolean => SAMPLE_IDS.includes(id);

const cache = new Map<string, Course>();
/** A built-in sample by id (a fresh copy each call), or null. */
export function sampleCourse(id: string): Course | null {
  const def = SAMPLES.find((s) => s.id === id);
  if (!def) return null;
  let c = cache.get(id);
  if (!c) {
    c = def.build();
    cache.set(id, c);
  }
  return structuredClone(c);
}
/** Every built-in sample, in library order. */
export function allSamples(): Course[] {
  return SAMPLES.map((s) => sampleCourse(s.id)!).filter(Boolean);
}
/** The briefing written for a lesson (e.g. 'hold-ndb'), if a sample provides one. */
export function briefingForLesson(exerciseId: string): Course | null {
  for (const s of SAMPLES) {
    const c = sampleCourse(s.id);
    if (c?.shape === "briefing" && c.briefingFor?.exerciseId === exerciseId)
      return c;
  }
  return null;
}
