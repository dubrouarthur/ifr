// Ground school — the built-in sample courses (package I): what the library lists under "Samples", what a CFI
// duplicates to adapt, and what #play=<id> opens with nothing stored. Built on demand (each build is a fresh,
// deterministic object: a caller may mutate it).
import type { Course, L10n } from "../types";
import { VOR_ID, vorCourse } from "./vor";
import {
  HOLDING_ID,
  HOLD_NDB_BRIEFING_ID,
  holdNdbBriefing,
  holdingCourse,
} from "./holding";
import { MATHS_IFR_ID, mathsIfrCourse } from "./mathsIfr";
import { MATHS_VFR_ID, mathsVfrCourse } from "./mathsVfr";

export { VOR_ID, HOLDING_ID, HOLD_NDB_BRIEFING_ID, MATHS_IFR_ID, MATHS_VFR_ID };

export interface SampleDef {
  id: string;
  /** library order */
  order: number;
  build: () => Course;
  /** one line for the library card when the course itself is not loaded */
  blurb: L10n;
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
  {
    id: HOLD_NDB_BRIEFING_ID,
    order: 5,
    build: holdNdbBriefing,
    blurb: {
      en: "The interactive briefing of the hold-ndb lesson",
      fr: "Le briefing interactif de la leçon d’attente sur NDB",
    },
  },
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
