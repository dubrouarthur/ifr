// Ground school — the course library's plan: the 47 courses of this wave (five registered, 42 to write or
// finish: LAPL/PPL, IR and ATPL in three pillars, plus Club), who writes each one (A1–A6) and in which program it
// sits. It is the contract between the authors (tests/course-library-catalogue.test.ts checks that every
// registered course is planned here, in its author's registry, in its program, with its file name) and the
// library UI (it shows the planned courses as "Soon"). Course content never lives here.
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
  // A1 — flight instruments, aircraft handling and principles of flight (the first five are written)
  P("ir-scan-attitude", "A1", "ir", "Instrument scan and attitude flying", "Circuit visuel et pilotage aux instruments"),
  P("ir-pressure-instruments", "A1", "ir", "The pressure instruments: altimeter, airspeed, VSI", "Les instruments anémobarométriques : altimètre, anémomètre, variomètre"),
  P("ir-gyros-compass", "A1", "ir", "Gyro instruments, the compass and partial panel", "Instruments gyroscopiques, compas et panne partielle"),
  P("ppl-human-performance", "A1", "lapl-ppl", "Human performance: spatial disorientation and fitness to fly", "Performances humaines : désorientation spatiale et aptitude au vol"),
  P("atpl-022-instruments", "A1", "atpl", "ATPL 022: air data, EFIS and automatic flight", "ATPL 022 : centrale aérodynamique, EFIS et vol automatique"),
  P("ppl-effects-of-controls", "A1", "lapl-ppl", "Effects of controls: primary and secondary effects, trim, power and flaps", "Effets des commandes : effets primaires et secondaires, compensateur, puissance et volets"),
  P("ppl-flight-manoeuvres", "A1", "lapl-ppl", "Straight and level, climbing, descending and turning", "Palier, montée, descente et virages"),
  P("ppl-slow-flight-stalls", "A1", "lapl-ppl", "Slow flight, stalls and spin avoidance", "Vol lent, décrochage et prévention de la vrille"),
  P("ppl-crosswind", "A1", "lapl-ppl", "Crosswind take-off and landing", "Décollage et atterrissage par vent de travers"),
  P("ppl-principles-of-flight", "A1", "lapl-ppl", "Principles of flight: lift, drag, stall and load factor", "Mécanique du vol : portance, traînée, décrochage et facteur de charge"),
  P("ppl-night-vfr", "A1", "lapl-ppl", "Night VFR: rules, night vision and night failures", "VFR de nuit : règles, vision de nuit et pannes de nuit"),
  P("atpl-081-principles-of-flight", "A1", "atpl", "ATPL 081: stall speed, load factor and the flight envelope", "ATPL 081 : vitesse de décrochage, facteur de charge et domaine de vol"),
  // A2 — radio navigation and approaches (ir-ndb-adf is written: fix it for the readability guard, then register it)
  P("ir-ndb-adf", "A2", "ir", "NDB and ADF: bearings, homing and tracking", "NDB et ADF : relèvements, ralliement et suivi"),
  P("ir-ils-loc", "A2", "ir", "ILS and localizer", "ILS et localizer"),
  P("ir-rnav-gnss", "A2", "ir", "RNAV and GNSS approaches: LNAV, LNAV/VNAV, LPV and CDFA", "Approches RNAV et GNSS : LNAV, LNAV/VNAV, LPV et CDFA"),
  P("ir-dme-arcs", "A2", "ir", "DME arcs: lead radials, flying the arc, joining the final", "Arcs DME : radial d’anticipation, tenue de l’arc, ralliement de la finale"),
  P("ir-holding", "A2", "ir", "Holding in depth: PANS-OPS speeds, wind, DME and RNAV holds", "L’attente en profondeur : vitesses PANS-OPS, vent, attentes DME et RNAV"),
  P("ir-missed-circling", "A2", "ir", "Missed approach and circling", "Approche interrompue et manœuvre à vue (MVL)"),
  P("atpl-062-radio-navigation", "A2", "atpl", "ATPL 062: VHF range, VOR and DME accuracy, slant range", "ATPL 062 : portée VHF, précision VOR et DME, distance oblique"),
  // A3 — weather, planning and performance
  P("ppl-meteorology", "A3", "lapl-ppl", "Meteorology for pilots: METAR, TAF and weather hazards", "Météorologie du pilote : METAR, TAF et phénomènes dangereux"),
  P("ir-weather-icing", "A3", "ir", "IFR weather and icing: freezing level, cloud types, go / no-go", "Météo IFR et givrage : isotherme 0 °C, types de nuages, décision de partir"),
  P("ir-flight-planning", "A3", "ir", "IFR flight planning: minima, alternates and fuel", "Préparation IFR : minima, dégagements et carburant"),
  P("atpl-031-mass-balance", "A3", "atpl", "ATPL 031: mass and balance, %MAC and load sheets", "ATPL 031 : masse et centrage, % CMA et devis de masse"),
  P("atpl-032-performance", "A3", "atpl", "ATPL 032: take-off speeds, field length and climb gradients", "ATPL 032 : vitesses de décollage, longueurs de piste et pentes de montée"),
  P("atpl-033-flight-planning", "A3", "atpl", "ATPL 033: fuel policy, PNR and critical point", "ATPL 033 : politique carburant, PNR et point équitemps"),
  P("atpl-050-meteorology", "A3", "atpl", "ATPL 050: the ISA, fronts, jet streams and the significant weather chart", "ATPL 050 : l’atmosphère type, fronts, courants-jets et carte TEMSI"),
  // A4 — the C172S, the circuit, emergencies and aircraft systems
  P("c172-normal", "A4", "lapl-ppl", "C172S normal procedures", "Procédures normales du C172S"),
  P("c172-emergency", "A4", "lapl-ppl", "C172S emergency procedures", "Procédures d’urgence du C172S"),
  P("ppl-circuit", "A4", "lapl-ppl", "The circuit: take-off, pattern, landing, go-around", "Le tour de piste : décollage, circuit, atterrissage, remise de gaz"),
  P("ppl-forced-landing", "A4", "lapl-ppl", "Forced landing without power", "Atterrissage forcé sans moteur"),
  P("ppl-precautionary-landing", "A4", "lapl-ppl", "Precautionary landing", "Atterrissage de précaution"),
  P("ppl-aircraft-systems", "A4", "lapl-ppl", "Aircraft general knowledge: engine, fuel and electrical systems", "Connaissance de l’avion : moteur, carburant et circuit électrique"),
  P("atpl-021-systems", "A4", "atpl", "ATPL 021: the gas turbine engine and pressurisation", "ATPL 021 : le turboréacteur et la pressurisation"),
  // A5 — VFR flight, its rules and club life
  P("ppl-vfr-navigation", "A5", "lapl-ppl", "VFR navigation and diversion", "Navigation VFR et déroutement"),
  P("ppl-airspace", "A5", "lapl-ppl", "Airspace and VFR rules (SERA, FAA)", "Espaces aériens et règles VFR (SERA, FAA)"),
  P("ppl-performance-mass-balance", "A5", "lapl-ppl", "C172S performance and mass and balance", "Performances et masse et centrage du C172S"),
  P("ppl-operational-procedures", "A5", "lapl-ppl", "Operational procedures: wake turbulence, windshear and runway surfaces", "Procédures opérationnelles : turbulence de sillage, cisaillement de vent et état des pistes"),
  P("club-phraseology", "A5", "club", "Radio phraseology for VFR, in French and English", "Phraséologie radio VFR, en français et en anglais"),
  P("club-essentials", "A5", "club", "Club essentials: documents, recency, the pre-flight briefing", "L’essentiel du club : documents, expérience récente, briefing avant vol"),
  P("club-teaching", "A5", "club", `Teaching with ${BRAND.name}`, `Enseigner avec ${BRAND.name}`),
  // A6 — IFR procedures and the airline rules
  P("ir-approach-charts", "A6", "ir", "Reading an approach chart", "Lire une carte d’approche"),
  P("ir-departures-arrivals", "A6", "ir", "Departures and arrivals: SIDs, climb gradients, STARs", "Départs et arrivées : SID, pentes de montée, STAR"),
  P("ir-lost-comms", "A6", "ir", "Radio failure in IFR", "Panne radio en IFR"),
  P("ir-skill-test", "A6", "ir", "The IR skill test: profile, tolerances and the examiner’s eye", "Le test pratique IR : profil, tolérances et regard de l’examinateur"),
  P("atpl-010-air-law", "A6", "atpl", "ATPL 010: the Chicago Convention, altimeter setting and interception", "ATPL 010 : la Convention de Chicago, le calage altimétrique et l’interception"),
  P("atpl-061-navigation", "A6", "atpl", "ATPL 061: great circles, convergency and dead reckoning", "ATPL 061 : orthodromie, convergence et navigation à l’estime"),
  P("atpl-070-operations", "A6", "atpl", "ATPL 070: low-visibility operations, contaminated runways and windshear", "ATPL 070 : opérations par faible visibilité, pistes contaminées et cisaillement"),
];

/** The planned course for an id, or undefined. */
export const plannedCourse = (id: string): PlannedCourse | undefined =>
  LIBRARY_PLAN.find((p) => p.id === id);
