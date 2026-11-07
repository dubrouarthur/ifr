// The unified library's metadata: where every built-in course, sim lesson, procedure, failure drill and scenario sits
// (its programs, home program first, and its level), with the French names of what the simulator authors in English
// only. Plain tables, so the academy page can list the simulator's flights without loading the simulator; a test
// (tests/library-model.test.ts) checks every table against its source (train/curriculum.ts, train/drills.ts,
// sim/sim.ts, train/circuits.ts, train/procedureLibrary.ts) so nothing drifts.
import type { L10n } from "../course/types";
import type { Level, ProgramId } from "./programs";

export interface Placement {
  programs: ProgramId[];
  level: Level;
}

// ------------------------------------------------------------------ the sim lessons (train/curriculum.ts EXERCISES)
export interface LessonMeta extends Placement {
  stage: string;
  minutes: number;
  /** the English title, as the curriculum writes it (checked by the test) */
  en: string;
  fr: string;
}
const BASIC: ProgramId[] = ["ir", "ppl", "night"];
const lesson = (
  stage: string,
  minutes: number,
  en: string,
  fr: string,
  level: Level,
  programs: ProgramId[] = ["ir"],
): LessonMeta => ({ stage, minutes, en, fr, level, programs });

export const LESSON_META: Readonly<Record<string, LessonMeta>> = {
  "bai-sl": lesson(
    "S1",
    4,
    "Straight and level",
    "Vol rectiligne en palier",
    1,
    BASIC,
  ),
  "bai-turns": lesson(
    "S1",
    5,
    "Standard-rate turns",
    "Virages au taux standard",
    1,
    BASIC,
  ),
  "bai-climb": lesson(
    "S1",
    8,
    "Constant-airspeed climbs and descents",
    "Montées et descentes à vitesse constante",
    1,
    BASIC,
  ),
  "bai-climbturn": lesson(
    "S1",
    8,
    "Climbing and descending turns",
    "Virages en montée et en descente",
    1,
    ["ir", "ppl"],
  ),
  "bai-steep": lesson(
    "S1",
    6,
    "Steep turns (45°)",
    "Virages à grande inclinaison (45°)",
    2,
    ["ir", "ppl"],
  ),
  "bai-unusual": lesson(
    "S1",
    4,
    "Unusual attitude recovery",
    "Rattrapage des positions inhabituelles",
    2,
    BASIC,
  ),
  "bai-slow": lesson(
    "S1",
    5,
    "Approach configuration & slow flight",
    "Configuration d’approche et vol lent",
    1,
    ["ir", "ppl"],
  ),
  "pp-compass": lesson(
    "S2",
    8,
    "Partial panel: compass & timed turns",
    "Panne partielle : compas et virages chronométrés",
    2,
    ["ir", "night"],
  ),
  "pp-unusual": lesson(
    "S2",
    4,
    "Partial panel unusual attitudes",
    "Positions inhabituelles en panne partielle",
    2,
    ["ir", "night"],
  ),
  "nav-vor-out": lesson(
    "S3",
    10,
    "VOR orientation & outbound radial",
    "Orientation VOR et radial en éloignement",
    2,
    ["ir", "ppl"],
  ),
  "nav-vor-in": lesson(
    "S3",
    10,
    "VOR inbound tracking with crosswind",
    "Rapprochement VOR par vent de travers",
    2,
    ["ir", "ppl"],
  ),
  "nav-arc": lesson("S3", 10, "DME arc", "Arc DME", 2),
  "nav-ndb": lesson("S3", 10, "NDB tracking (QDM)", "Suivi NDB (QDM)", 2),
  "nav-gps": lesson(
    "S3",
    10,
    "GPS direct-to and flight-plan sequencing",
    "GPS : direct-to et séquencement du plan de vol",
    2,
    ["ir", "ppl"],
  ),
  "int-loc30": lesson(
    "S3",
    6,
    "Localizer intercept at 30°",
    "Interception du localizer à 30°",
    2,
  ),
  "int-loc45-tail": lesson(
    "S3",
    6,
    "Localizer intercept at 45° with a tailwind",
    "Interception du localizer à 45° vent arrière",
    2,
  ),
  "int-loc90": lesson(
    "S3",
    6,
    "Late 90° localizer intercept",
    "Interception tardive du localizer à 90°",
    3,
  ),
  "int-lda": lesson(
    "S3",
    6,
    "LDA intercept (offset course)",
    "Interception d’un LDA (axe décalé)",
    3,
  ),
  "hold-direct": lesson(
    "S4",
    12,
    "Holding: direct entry",
    "Attente : entrée directe",
    2,
  ),
  "hold-teardrop": lesson(
    "S4",
    12,
    "Holding: teardrop entry",
    "Attente : entrée décalée",
    2,
  ),
  "hold-parallel": lesson(
    "S4",
    12,
    "Holding: parallel entry",
    "Attente : entrée parallèle",
    2,
  ),
  "hold-left": lesson(
    "S4",
    12,
    "Non-standard (left) hold",
    "Attente non standard (virages à gauche)",
    2,
  ),
  "hold-wind": lesson(
    "S4",
    12,
    "Holding with a strong wind",
    "Attente par vent fort",
    3,
  ),
  "hold-ndb": lesson("S4", 12, "Holding on an NDB", "Attente sur un NDB", 3),
  "hold-fix": lesson(
    "S4",
    12,
    "Holding at an RNAV fix",
    "Attente sur un point RNAV",
    2,
  ),
  "hold-random": lesson(
    "S4",
    12,
    "ATC holding clearance generator",
    "Clairances d’attente ATC au hasard",
    3,
  ),
  "app-ils-ap": lesson(
    "S5",
    15,
    "ILS RWY 27 — coupled",
    "ILS piste 27 — couplé au pilote automatique",
    2,
  ),
  "app-ils-hand": lesson(
    "S5",
    15,
    "ILS RWY 27 — hand-flown, full procedure",
    "ILS piste 27 — en manuel, procédure complète",
    2,
  ),
  "app-loc": lesson(
    "S5",
    15,
    "LOC RWY 27 — non-precision",
    "LOC piste 27 — approche classique",
    2,
  ),
  "app-vor-arc": lesson(
    "S5",
    15,
    "VOR/DME RWY 21 via 10 DME arc",
    "VOR/DME piste 21 par l’arc 10 DME",
    3,
  ),
  "app-ndb-pt": lesson(
    "S5",
    15,
    "NDB RWY 27 with procedure turn",
    "NDB piste 27 avec virage conventionnel",
    3,
  ),
  "app-rnav-hilpt": lesson(
    "S5",
    15,
    "RNAV (GPS) RWY 09 LPV via HILPT",
    "RNAV (GPS) piste 09 LPV par l’hippodrome",
    2,
  ),
  "app-lnav-vnav": lesson(
    "S5",
    15,
    "RNAV (GPS) RWY 03 LNAV/VNAV, gusty crosswind",
    "RNAV (GPS) piste 03 LNAV/VNAV, travers en rafales",
    3,
  ),
  "app-bc": lesson(
    "S5",
    15,
    "LOC back course RWY 09",
    "LOC en back course piste 09",
    3,
  ),
  "app-circle": lesson(
    "S5",
    15,
    "ILS 27, circle to land RWY 09",
    "ILS 27, manœuvre à vue vers la piste 09",
    3,
  ),
  "ma-da": lesson(
    "S6",
    15,
    "Missed approach at DA and hold",
    "Remise de gaz à la DA et attente",
    2,
  ),
  "ma-gsfail": lesson(
    "S6",
    15,
    "Glideslope failure on final",
    "Panne du glide en finale",
    3,
  ),
  "ma-pp": lesson("S6", 15, "Partial-panel ILS", "ILS en panne partielle", 3),
  "ck-profile": lesson(
    "S7",
    30,
    "Full IFR profile (checkride)",
    "Profil IFR complet (test pratique)",
    3,
  ),
  "ifr-pard-msvl-rnav": lesson(
    "S8",
    30,
    "IFR flight PARD → MSVL (RNAV 03)",
    "Vol IFR PARD → MSVL (RNAV 03)",
    3,
  ),
  "ifr-msvl-pard-ils": lesson(
    "S8",
    30,
    "IFR flight MSVL → PARD (ILS 27)",
    "Vol IFR MSVL → PARD (ILS 27)",
    3,
  ),
  "ifr-pard-msvl-vor": lesson(
    "S8",
    35,
    "IFR flight PARD → MSVL (VOR/DME 21, DME arc)",
    "Vol IFR PARD → MSVL (VOR/DME 21, arc DME)",
    3,
  ),
  "ifr-msvl-pard-ndb": lesson(
    "S8",
    35,
    "IFR flight MSVL → PARD (NDB 27, procedure turn)",
    "Vol IFR MSVL → PARD (NDB 27, virage conventionnel)",
    3,
  ),
  "ifr-local-lda": lesson(
    "S8",
    25,
    "IFR local flight (LDA/DME 36)",
    "Vol IFR local (LDA/DME 36)",
    3,
  ),
};
/** The curriculum order (the IR syllabus). */
export const LESSON_ORDER: readonly string[] = Object.keys(LESSON_META);


/** What the briefing cover of a lesson needs from the exercise: autopilot allowed, the approach plate. */
export const LESSON_SIM: Readonly<Record<string, { ap: boolean; plate?: string }>> = {
  "bai-sl": { ap: false },
  "bai-turns": { ap: false },
  "bai-climb": { ap: false },
  "bai-climbturn": { ap: false },
  "bai-steep": { ap: false },
  "bai-unusual": { ap: false },
  "bai-slow": { ap: false },
  "pp-compass": { ap: false },
  "pp-unusual": { ap: false },
  "nav-vor-out": { ap: true },
  "nav-vor-in": { ap: true },
  "nav-arc": { ap: false, plate: "MSVL-V21" },
  "nav-ndb": { ap: false },
  "nav-gps": { ap: true },
  "int-loc30": { ap: false, plate: "PARD-I27" },
  "int-loc45-tail": { ap: false, plate: "PARD-I27" },
  "int-loc90": { ap: false, plate: "PARD-I27" },
  "int-lda": { ap: false, plate: "PARD-L36" },
  "hold-direct": { ap: true },
  "hold-teardrop": { ap: true },
  "hold-parallel": { ap: true },
  "hold-left": { ap: true },
  "hold-wind": { ap: true },
  "hold-ndb": { ap: true },
  "hold-fix": { ap: true },
  "hold-random": { ap: true },
  "app-ils-ap": { ap: true, plate: "PARD-I27" },
  "app-ils-hand": { ap: false, plate: "PARD-I27" },
  "app-loc": { ap: false, plate: "PARD-I27" },
  "app-vor-arc": { ap: true, plate: "MSVL-V21" },
  "app-ndb-pt": { ap: false, plate: "PARD-N27" },
  "app-rnav-hilpt": { ap: true, plate: "PARD-R09" },
  "app-lnav-vnav": { ap: false, plate: "MSVL-R03" },
  "app-bc": { ap: true, plate: "PARD-B09" },
  "app-circle": { ap: true, plate: "PARD-I27" },
  "ma-da": { ap: true, plate: "PARD-I27" },
  "ma-gsfail": { ap: true, plate: "PARD-I27" },
  "ma-pp": { ap: false, plate: "PARD-I27" },
  "ck-profile": { ap: true, plate: "PARD-I27" },
  "ifr-pard-msvl-rnav": { ap: true, plate: "MSVL-R03" },
  "ifr-msvl-pard-ils": { ap: true, plate: "PARD-I27" },
  "ifr-pard-msvl-vor": { ap: true, plate: "MSVL-V21" },
  "ifr-msvl-pard-ndb": { ap: true, plate: "PARD-N27" },
  "ifr-local-lda": { ap: true, plate: "PARD-L36" },
};

/** The stages of the IR syllabus (train/curriculum.ts STAGES), short, FR / EN. */
export const STAGE_LABEL: Readonly<Record<string, L10n>> = {
  S1: {
    en: "Stage 1 · Attitude instrument flying",
    fr: "Étape 1 · Pilotage aux instruments",
  },
  S2: { en: "Stage 2 · Partial panel", fr: "Étape 2 · Panne partielle" },
  S3: { en: "Stage 3 · Radio navigation", fr: "Étape 3 · Radionavigation" },
  S4: { en: "Stage 4 · Holding", fr: "Étape 4 · Attentes" },
  S5: {
    en: "Stage 5 · Instrument approaches",
    fr: "Étape 5 · Approches aux instruments",
  },
  S6: {
    en: "Stage 6 · Missed approaches and abnormals",
    fr: "Étape 6 · Remises de gaz et anomalies",
  },
  S7: {
    en: "Stage 7 · Checkride preparation",
    fr: "Étape 7 · Préparation au test",
  },
  S8: { en: "Stage 8 · IFR cross-country", fr: "Étape 8 · Navigations IFR" },
};

// ------------------------------------------------------------------ the procedures (train/procedureLibrary.ts)
/** By base id ('c172.efato'); a club procedure takes the placement of the library procedure it is based on. */
export const PROCEDURE_META: Readonly<Record<string, Placement>> = {
  "c172.takeoffRoll": { programs: ["lapl", "ppl", "club"], level: 1 },
  "c172.efato": { programs: ["lapl", "ppl", "club"], level: 2 },
  "c172.engineFailure": { programs: ["lapl", "ppl", "club"], level: 2 },
  "c172.forcedLanding": { programs: ["lapl", "ppl", "club"], level: 2 },
  "c172.roughEngine": { programs: ["lapl", "ppl"], level: 2 },
  "c172.oilPressure": { programs: ["ppl", "lapl"], level: 2 },
  "c172.fuelPump": { programs: ["ppl"], level: 2 },
  "c172.fuelLeak": { programs: ["ppl", "lapl"], level: 2 },
  "c172.engineFire": { programs: ["lapl", "ppl", "club"], level: 2 },
  "c172.electricalFire": { programs: ["ppl", "lapl", "night", "club"], level: 2 },
  "c172.alternator": { programs: ["ppl", "night", "ir"], level: 2 },
  "c172.vacuum": { programs: ["ir", "ppl", "night"], level: 2 },
  "c172.pitot": { programs: ["ir", "ppl"], level: 2 },
  "c172.static": { programs: ["ir", "ppl"], level: 3 },
  "c172.flaps": { programs: ["lapl", "ppl"], level: 1 },
  "c172.trimRunaway": { programs: ["ppl"], level: 2 },
  "c172.lostComms": { programs: ["ir"], level: 3 },
  "c172.xpdr": { programs: ["ppl", "ir"], level: 1 },
  "c172.gpsLoss": { programs: ["ir"], level: 3 },
  "c172.nav1": { programs: ["ir"], level: 3 },
  "c172.airData": { programs: ["ir"], level: 3 },
  "c172.gsFail": { programs: ["ir"], level: 3 },
  "c172.apFail": { programs: ["ir"], level: 2 },
  "c172.door": { programs: ["lapl", "ppl", "club"], level: 1 },
  "c172.noseHigh": { programs: ["ppl", "lapl", "night", "ir"], level: 2 },
  "c172.noseLow": { programs: ["ppl", "lapl", "night", "ir"], level: 2 },
  "c172.spiral": { programs: ["night", "ppl", "lapl", "ir"], level: 2 },
};

// ------------------------------------------------------------------ the failure drills (train/drills.ts DRILL_TEMPLATES)
export type DrillPhaseId = "lineup" | "climbout" | "cruise" | "approach";
export interface DrillMeta extends Placement {
  name: L10n;
  phase: DrillPhaseId;
  /** the failures it gives (the library procedure base ids it trains) */
  trains: string[];
}
const drill = (
  en: string,
  fr: string,
  phase: DrillPhaseId,
  trains: string[],
  programs: ProgramId[],
  level: Level = 2,
): DrillMeta => ({ name: { en, fr }, phase, trains, programs, level });
export const DRILL_META: Readonly<Record<string, DrillMeta>> = {
  "d-efato": drill(
    "Engine failure after take-off (EFATO)",
    "Panne moteur au décollage (EFATO)",
    "lineup",
    ["c172.efato"],
    ["lapl", "ppl", "club"],
  ),
  "d-engine-cruise": drill(
    "Engine failure in cruise + forced landing",
    "Panne moteur en croisière + atterrissage en campagne",
    "cruise",
    ["c172.engineFailure", "c172.forcedLanding"],
    ["lapl", "ppl", "club"],
  ),
  "d-engine-fire": drill(
    "Engine fire in flight",
    "Feu moteur en vol",
    "cruise",
    ["c172.engineFire"],
    ["ppl", "lapl"],
  ),
  "d-elec-fire": drill(
    "Electrical fire",
    "Feu électrique",
    "cruise",
    ["c172.electricalFire"],
    ["ppl", "night"],
  ),
  "d-alternator-imc": drill(
    "Alternator failure in IMC",
    "Panne d’alternateur en IMC",
    "cruise",
    ["c172.alternator"],
    ["ir", "night"],
  ),
  "d-vacuum-app": drill(
    "Vacuum failure on an IMC approach",
    "Panne de dépression en approche IMC",
    "approach",
    ["c172.vacuum"],
    ["ir"],
    3,
  ),
  "d-pitot-icing": drill(
    "Pitot icing",
    "Givrage pitot",
    "cruise",
    ["c172.pitot"],
    ["ir", "ppl"],
  ),
  "d-static": drill(
    "Static port blocked",
    "Prise statique obstruée",
    "cruise",
    ["c172.static"],
    ["ir"],
    3,
  ),
  "d-lostcomms": drill(
    "Lost communications in IFR",
    "Panne radio en IFR",
    "cruise",
    ["c172.lostComms"],
    ["ir"],
    3,
  ),
  "d-rough": drill(
    "Rough-running engine",
    "Moteur qui tourne mal",
    "cruise",
    ["c172.roughEngine"],
    ["ppl", "lapl"],
  ),
  "d-trim": drill(
    "Electric trim runaway",
    "Emballement du trim",
    "cruise",
    ["c172.trimRunaway"],
    ["ppl"],
  ),
  "d-flaps": drill(
    "Flaps jammed",
    "Volets bloqués",
    "approach",
    ["c172.flaps"],
    ["lapl", "ppl"],
    1,
  ),
  "d-club-test": drill(
    "Club test: 2 random failures",
    "Test aéroclub : 2 pannes aléatoires",
    "cruise",
    [],
    ["club", "ppl"],
    3,
  ),
};

// ------------------------------------------------------------------ scenarios and school circuits (sim/sim.ts, train/circuits.ts)
export interface FlightMeta extends Placement {
  /** 'scenario' (sim/sim.ts SCENARIOS) or 'circuit' (train/circuits.ts PRESET_CIRCUITS) */
  type: "scenario" | "circuit";
  en: string;
  fr: string;
  /** the airport and the procedure on the strip */
  airport: string;
  tag: string;
  minutes: number;
}
const sc = (
  en: string,
  fr: string,
  airport: string,
  tag: string,
  level: Level,
  programs: ProgramId[] = ["ir"],
  minutes = 15,
): FlightMeta => ({
  type: "scenario",
  en,
  fr,
  airport,
  tag,
  level,
  programs,
  minutes,
});
const ci = (
  en: string,
  fr: string,
  airport: string,
  tag: string,
  level: Level,
  minutes: number,
): FlightMeta => ({
  type: "circuit",
  en,
  fr,
  airport,
  tag,
  level,
  programs: ["ir"],
  minutes,
});
export const FLIGHT_META: Readonly<Record<string, FlightMeta>> = {
  rwy27: sc(
    "IFR departure — PARD RWY 27",
    "Départ IFR — PARD piste 27",
    "PARD",
    "DEP",
    1,
  ),
  "ils27-vtf": sc(
    "ILS RWY 27 — vectors to final",
    "ILS piste 27 — guidage radar en finale",
    "PARD",
    "ILS",
    1,
  ),
  "ils27-full": sc(
    "ILS RWY 27 — full procedure via TOBEY",
    "ILS piste 27 — procédure complète par TOBEY",
    "PARD",
    "ILS",
    2,
  ),
  loc27: sc(
    "LOC RWY 27 (glideslope out)",
    "LOC piste 27 (glide hors service)",
    "PARD",
    "LOC",
    2,
  ),
  rnav09: sc(
    "RNAV (GPS) RWY 09 — LPV via LUNKS",
    "RNAV (GPS) piste 09 — LPV par LUNKS",
    "PARD",
    "RNAV",
    1,
  ),
  locbc09: sc(
    "LOC BC RWY 09 — back course",
    "LOC BC piste 09 — back course",
    "PARD",
    "LOC BC",
    3,
  ),
  ndb27: sc(
    "NDB RWY 27 — ADF approach",
    "NDB piste 27 — approche à l’ADF",
    "PARD",
    "NDB",
    3,
  ),
  vor21: sc(
    "VOR/DME RWY 21 — Mistral Valley",
    "VOR/DME piste 21 — Mistral Valley",
    "MSVL",
    "VOR",
    2,
  ),
  rnav03: sc(
    "RNAV (GPS) RWY 03 — LNAV/VNAV",
    "RNAV (GPS) piste 03 — LNAV/VNAV",
    "MSVL",
    "RNAV",
    2,
  ),
  ils03: sc(
    "ILS RWY 03 — Mistral Valley",
    "ILS piste 03 — Mistral Valley",
    "MSVL",
    "ILS",
    2,
  ),
  lda36: sc(
    "LDA/DME RWY 36 — offset localizer",
    "LDA/DME piste 36 — localizer décalé",
    "PARD",
    "LDA",
    3,
  ),
  "hold-ard": sc("Holding at ARD", "Attente sur ARD", "PARD", "HOLD", 2),
  free: sc(
    "Free flight — VFR on top",
    "Vol libre — VFR au-dessus de la couche",
    "PARD",
    "VFR",
    1,
    ["ppl", "lapl", "night", "ir"],
    20,
  ),
  "p-classic": ci(
    "Classic IR circuit — Port Ardent",
    "Circuit IR classique — Port Ardent",
    "PARD",
    "CIRCUIT",
    2,
    45,
  ),
  "p-valley": ci(
    "Mistral Valley loop",
    "Boucle de Mistral Valley",
    "MSVL",
    "CIRCUIT",
    3,
    45,
  ),
  "p-pp": ci(
    "Partial-panel circuit (checkride)",
    "Circuit en panne partielle (test)",
    "PARD",
    "CIRCUIT",
    3,
    40,
  ),
  "p-cross": ci(
    "PARD → MSVL → PARD round trip",
    "Aller-retour PARD → MSVL → PARD",
    "PARD",
    "CIRCUIT",
    3,
    70,
  ),
};

// ------------------------------------------------------------------ the built-in courses
/** Built-in courses by id: their programs and level when the course names none (the courses' own `program` and
 *  `level` win, then the library registry's program, then this). */
export const COURSE_META: Readonly<Record<string, Partial<Placement>>> = {
  "sample-maths-ifr": { programs: ["ir", "atpl"], level: 2 },
  "sample-maths-vfr": { programs: ["ppl", "lapl"], level: 1 },
  "sample-vor": { programs: ["ir", "atpl"], level: 2 },
  "sample-holding": { programs: ["ir"], level: 2 },
  // the course library (samples/library): the secondary programs and the level the registry does not say
  "sample-lib-ir-scan-attitude": { programs: ["ir", "ppl", "night"], level: 1 },
  "sample-lib-ir-pressure-instruments": {
    programs: ["ir", "ppl", "atpl"],
    level: 1,
  },
  "sample-lib-ir-gyros-compass": { programs: ["ir", "ppl", "atpl"], level: 2 },
  "sample-lib-ppl-human-performance": {
    programs: ["ppl", "lapl", "night", "atpl"],
    level: 1,
  },
  "sample-lib-atpl-022-instruments": { programs: ["atpl"], level: 3 },
  "sample-lib-ir-ndb-adf": { programs: ["ir", "atpl"], level: 2 },
  "sample-lib-ir-ils-loc": { programs: ["ir", "atpl"], level: 2 },
  "sample-lib-ir-rnav-gnss": { programs: ["ir", "atpl"], level: 2 },
  "sample-lib-ir-departures-arrivals": { programs: ["ir"], level: 3 },
  "sample-lib-ir-lost-comms": { programs: ["ir"], level: 3 },
  "sample-lib-ppl-meteorology": {
    programs: ["ppl", "lapl", "night", "atpl"],
    level: 1,
  },
  "sample-lib-ppl-performance-mass-balance": {
    programs: ["ppl", "lapl"],
    level: 2,
  },
  "sample-lib-ir-flight-planning": { programs: ["ir"], level: 3 },
  "sample-lib-atpl-031-mass-balance": { programs: ["atpl"], level: 3 },
  "sample-lib-atpl-033-flight-planning": { programs: ["atpl"], level: 3 },
  "sample-lib-c172-normal": { programs: ["ppl", "lapl", "club"], level: 1 },
  "sample-lib-c172-emergency": { programs: ["ppl", "lapl", "club"], level: 2 },
  "sample-lib-ppl-circuit": { programs: ["lapl", "ppl"], level: 1 },
  "sample-lib-ppl-forced-landing": { programs: ["lapl", "ppl"], level: 2 },
  "sample-lib-ppl-principles-of-flight": {
    programs: ["ppl", "lapl", "atpl"],
    level: 1,
  },
  "sample-lib-ppl-vfr-navigation": {
    programs: ["ppl", "lapl", "night"],
    level: 1,
  },
  "sample-lib-ppl-airspace": { programs: ["ppl", "lapl", "night"], level: 1 },
  "sample-lib-club-phraseology": {
    programs: ["club", "ppl", "lapl"],
    level: 1,
  },
  "sample-lib-club-essentials": { programs: ["club"], level: 1 },
  "sample-lib-club-teaching": { programs: ["instructors", "club"], level: 1 },
};

/** A course's tags that place it when nothing else does (an author's own course, an imported one). */
export const TAG_PROGRAMS: Readonly<Record<string, ProgramId>> = {
  lapl: "lapl",
  ppl: "ppl",
  vfr: "ppl",
  "lapl-ppl": "ppl",
  night: "night",
  nuit: "night",
  ir: "ir",
  ifr: "ir",
  holding: "ir",
  atpl: "atpl",
  club: "club",
  instructor: "instructors",
  instructors: "instructors",
  fi: "instructors",
};
