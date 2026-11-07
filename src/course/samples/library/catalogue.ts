// Ground school — the course library's plan: the 25 courses of this wave, who writes each one and in which program
// it sits. It is the contract between the authors (tests/course-library-catalogue.test.ts checks that every
// registered course is planned here, in its author's registry, in its program, with its file name) and the
// library UI (it can show the programs and their planned size). Course content never lives here.
import { BRAND } from "../../../brand";
import type { L10n } from "../../types";
import type { LibraryAuthor, LibraryProgram } from "./types";

export interface PlannedCourse {
  /** `sample-lib-<slug>`; the course is written in `library/<slug>.ts` */
  id: string;
  slug: string;
  author: LibraryAuthor;
  program: LibraryProgram;
  title: L10n;
}

const P = (
  slug: string,
  author: LibraryAuthor,
  program: LibraryProgram,
  en: string,
  fr: string,
): PlannedCourse => ({
  id: `sample-lib-${slug}`,
  slug,
  author,
  program,
  title: { en, fr },
});

export const LIBRARY_PLAN: readonly PlannedCourse[] = [
  // A1 — flight instruments and the pilot's senses
  P("ir-scan-attitude", "A1", "ir", "Instrument scan and attitude flying", "Circuit visuel et pilotage aux instruments"),
  P("ir-pressure-instruments", "A1", "ir", "The pressure instruments: altimeter, airspeed, VSI", "Les instruments anémobarométriques : altimètre, anémomètre, variomètre"),
  P("ir-gyros-compass", "A1", "ir", "Gyro instruments, the compass and partial panel", "Instruments gyroscopiques, compas et panne partielle"),
  P("ppl-human-performance", "A1", "lapl-ppl", "Human performance: spatial disorientation and fitness to fly", "Performances humaines : désorientation spatiale et aptitude au vol"),
  P("atpl-022-instruments", "A1", "atpl", "ATPL 022: air data, EFIS and automatic flight", "ATPL 022 : centrale aérodynamique, EFIS et vol automatique"),
  // A2 — radio navigation and IFR procedures
  P("ir-ndb-adf", "A2", "ir", "NDB and ADF: bearings, homing and tracking", "NDB et ADF : relèvements, ralliement et suivi"),
  P("ir-ils-loc", "A2", "ir", "ILS and localizer", "ILS et localizer"),
  P("ir-rnav-gnss", "A2", "ir", "RNAV and GNSS: LNAV, LNAV/VNAV and LPV", "RNAV et GNSS : LNAV, LNAV/VNAV et LPV"),
  P("ir-departures-arrivals", "A2", "ir", "Departures and arrivals: SIDs, climb gradients, STARs", "Départs et arrivées : SID, pentes de montée, STAR"),
  P("ir-lost-comms", "A2", "ir", "Radio failure in IFR", "Panne radio en IFR"),
  // A3 — planning, performance and weather
  P("ppl-meteorology", "A3", "lapl-ppl", "Meteorology for pilots: METAR, TAF and weather hazards", "Météorologie du pilote : METAR, TAF et phénomènes dangereux"),
  P("ppl-performance-mass-balance", "A3", "lapl-ppl", "C172S performance and mass and balance", "Performances et masse et centrage du C172S"),
  P("ir-flight-planning", "A3", "ir", "IFR flight planning: minima, alternates and fuel", "Préparation IFR : minima, dégagements et carburant"),
  P("atpl-031-mass-balance", "A3", "atpl", "ATPL 031: mass and balance, %MAC and load sheets", "ATPL 031 : masse et centrage, % CMA et devis de masse"),
  P("atpl-033-flight-planning", "A3", "atpl", "ATPL 033: fuel policy, PNR and critical point", "ATPL 033 : politique carburant, PNR et point équitemps"),
  // A4 — the C172S pack and aircraft handling
  P("c172-normal", "A4", "lapl-ppl", "C172S normal procedures", "Procédures normales du C172S"),
  P("c172-emergency", "A4", "lapl-ppl", "C172S emergency procedures", "Procédures d’urgence du C172S"),
  P("ppl-circuit", "A4", "lapl-ppl", "The circuit: take-off, pattern, landing, go-around", "Le tour de piste : décollage, circuit, atterrissage, remise de gaz"),
  P("ppl-forced-landing", "A4", "lapl-ppl", "Forced landing without power", "Atterrissage forcé sans moteur"),
  P("ppl-principles-of-flight", "A4", "lapl-ppl", "Principles of flight: lift, stall and spin awareness", "Mécanique du vol : portance, décrochage et vrille"),
  // A5 — VFR and club life
  P("ppl-vfr-navigation", "A5", "lapl-ppl", "VFR navigation and diversion", "Navigation VFR et déroutement"),
  P("ppl-airspace", "A5", "lapl-ppl", "Airspace and VFR rules (SERA, FAA)", "Espaces aériens et règles VFR (SERA, FAA)"),
  P("club-phraseology", "A5", "club", "Radio phraseology for VFR, in French and English", "Phraséologie radio VFR, en français et en anglais"),
  P("club-essentials", "A5", "club", "Club essentials: documents, recency, the pre-flight briefing", "L’essentiel du club : documents, expérience récente, briefing avant vol"),
  P("club-teaching", "A5", "club", `Teaching with ${BRAND.name}`, `Enseigner avec ${BRAND.name}`),
];

/** The planned course for an id, or undefined. */
export const plannedCourse = (id: string): PlannedCourse | undefined =>
  LIBRARY_PLAN.find((p) => p.id === id);
