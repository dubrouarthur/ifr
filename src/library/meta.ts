// The unified library's metadata: what the library shows of the simulator's own items (sim lessons, failure drills,
// scenarios, school circuits) without loading the simulator, with the French names of what it authors in English
// only. Where each item lives (its one home, its level) is classification.ts. Plain tables, so the academy page can list the simulator's flights without loading the simulator; a test
// (tests/library-model.test.ts) checks every table against its source (train/curriculum.ts, train/drills.ts,
// sim/sim.ts, train/circuits.ts, train/procedureLibrary.ts) so nothing drifts.
import type { L10n } from "../course/types";

// ------------------------------------------------------------------ the sim lessons (train/curriculum.ts EXERCISES)
export interface LessonMeta {
  stage: string;
  minutes: number;
  /** the English title, as the curriculum writes it (checked by the test) */
  en: string;
  fr: string;
}
const lesson = (
  stage: string,
  minutes: number,
  en: string,
  fr: string,
): LessonMeta => ({ stage, minutes, en, fr });

export const LESSON_META: Readonly<Record<string, LessonMeta>> = {
  "bai-sl": lesson("S1", 4, "Straight and level", "Vol rectiligne en palier"),
  "bai-turns": lesson(
    "S1",
    5,
    "Standard-rate turns",
    "Virages au taux standard",
  ),
  "bai-climb": lesson(
    "S1",
    8,
    "Constant-airspeed climbs and descents",
    "Montées et descentes à vitesse constante",
  ),
  "bai-climbturn": lesson(
    "S1",
    8,
    "Climbing and descending turns",
    "Virages en montée et en descente",
  ),
  "bai-steep": lesson(
    "S1",
    6,
    "Steep turns (45°)",
    "Virages à grande inclinaison (45°)",
  ),
  "bai-unusual": lesson(
    "S1",
    4,
    "Unusual attitude recovery",
    "Rattrapage des positions inhabituelles",
  ),
  "bai-slow": lesson(
    "S1",
    5,
    "Approach configuration & slow flight",
    "Configuration d’approche et vol lent",
  ),
  "pp-compass": lesson(
    "S2",
    8,
    "Partial panel: compass & timed turns",
    "Panne partielle : compas et virages chronométrés",
  ),
  "pp-unusual": lesson(
    "S2",
    4,
    "Partial panel unusual attitudes",
    "Positions inhabituelles en panne partielle",
  ),
  "nav-vor-out": lesson(
    "S3",
    10,
    "VOR orientation & outbound radial",
    "Orientation VOR et radial en éloignement",
  ),
  "nav-vor-in": lesson(
    "S3",
    10,
    "VOR inbound tracking with crosswind",
    "Rapprochement VOR par vent de travers",
  ),
  "nav-arc": lesson("S3", 10, "DME arc", "Arc DME"),
  "nav-ndb": lesson("S3", 10, "NDB tracking (QDM)", "Suivi NDB (QDM)"),
  "nav-gps": lesson(
    "S3",
    10,
    "GPS direct-to and flight-plan sequencing",
    "GPS : direct-to et séquencement du plan de vol",
  ),
  "int-loc30": lesson(
    "S3",
    6,
    "Localizer intercept at 30°",
    "Interception du localizer à 30°",
  ),
  "int-loc45-tail": lesson(
    "S3",
    6,
    "Localizer intercept at 45° with a tailwind",
    "Interception du localizer à 45° vent arrière",
  ),
  "int-loc90": lesson(
    "S3",
    6,
    "Late 90° localizer intercept",
    "Interception tardive du localizer à 90°",
  ),
  "int-lda": lesson(
    "S3",
    6,
    "LDA intercept (offset course)",
    "Interception d’un LDA (axe décalé)",
  ),
  "hold-direct": lesson(
    "S4",
    12,
    "Holding: direct entry",
    "Attente : entrée directe",
  ),
  "hold-teardrop": lesson(
    "S4",
    12,
    "Holding: teardrop entry",
    "Attente : entrée décalée",
  ),
  "hold-parallel": lesson(
    "S4",
    12,
    "Holding: parallel entry",
    "Attente : entrée parallèle",
  ),
  "hold-left": lesson(
    "S4",
    12,
    "Non-standard (left) hold",
    "Attente non standard (virages à gauche)",
  ),
  "hold-wind": lesson(
    "S4",
    12,
    "Holding with a strong wind",
    "Attente par vent fort",
  ),
  "hold-ndb": lesson("S4", 12, "Holding on an NDB", "Attente sur un NDB"),
  "hold-fix": lesson(
    "S4",
    12,
    "Holding at an RNAV fix",
    "Attente sur un point RNAV",
  ),
  "hold-random": lesson(
    "S4",
    12,
    "ATC holding clearance generator",
    "Clairances d’attente ATC au hasard",
  ),
  "app-ils-ap": lesson(
    "S5",
    15,
    "ILS RWY 27 — coupled",
    "ILS piste 27 — couplé au pilote automatique",
  ),
  "app-ils-hand": lesson(
    "S5",
    15,
    "ILS RWY 27 — hand-flown, full procedure",
    "ILS piste 27 — en manuel, procédure complète",
  ),
  "app-loc": lesson(
    "S5",
    15,
    "LOC RWY 27 — non-precision",
    "LOC piste 27 — approche classique",
  ),
  "app-vor-arc": lesson(
    "S5",
    15,
    "VOR/DME RWY 21 via 10 DME arc",
    "VOR/DME piste 21 par l’arc 10 DME",
  ),
  "app-ndb-pt": lesson(
    "S5",
    15,
    "NDB RWY 27 with procedure turn",
    "NDB piste 27 avec virage conventionnel",
  ),
  "app-rnav-hilpt": lesson(
    "S5",
    15,
    "RNAV (GPS) RWY 09 LPV via HILPT",
    "RNAV (GPS) piste 09 LPV par l’hippodrome",
  ),
  "app-lnav-vnav": lesson(
    "S5",
    15,
    "RNAV (GPS) RWY 03 LNAV/VNAV, gusty crosswind",
    "RNAV (GPS) piste 03 LNAV/VNAV, travers en rafales",
  ),
  "app-bc": lesson(
    "S5",
    15,
    "LOC back course RWY 09",
    "LOC en back course piste 09",
  ),
  "app-circle": lesson(
    "S5",
    15,
    "ILS 27, circle to land RWY 09",
    "ILS 27, manœuvre à vue vers la piste 09",
  ),
  "ma-da": lesson(
    "S6",
    15,
    "Missed approach at DA and hold",
    "Remise de gaz à la DA et attente",
  ),
  "ma-gsfail": lesson(
    "S6",
    15,
    "Glideslope failure on final",
    "Panne du glide en finale",
  ),
  "ma-pp": lesson("S6", 15, "Partial-panel ILS", "ILS en panne partielle"),
  "ck-profile": lesson(
    "S7",
    30,
    "Full IFR profile (checkride)",
    "Profil IFR complet (test pratique)",
  ),
  "ifr-pard-msvl-rnav": lesson(
    "S8",
    30,
    "IFR flight PARD → MSVL (RNAV 03)",
    "Vol IFR PARD → MSVL (RNAV 03)",
  ),
  "ifr-msvl-pard-ils": lesson(
    "S8",
    30,
    "IFR flight MSVL → PARD (ILS 27)",
    "Vol IFR MSVL → PARD (ILS 27)",
  ),
  "ifr-pard-msvl-vor": lesson(
    "S8",
    35,
    "IFR flight PARD → MSVL (VOR/DME 21, DME arc)",
    "Vol IFR PARD → MSVL (VOR/DME 21, arc DME)",
  ),
  "ifr-msvl-pard-ndb": lesson(
    "S8",
    35,
    "IFR flight MSVL → PARD (NDB 27, procedure turn)",
    "Vol IFR MSVL → PARD (NDB 27, virage conventionnel)",
  ),
  "ifr-local-lda": lesson(
    "S8",
    25,
    "IFR local flight (LDA/DME 36)",
    "Vol IFR local (LDA/DME 36)",
  ),
};
/** The curriculum order (the IR syllabus). */
export const LESSON_ORDER: readonly string[] = Object.keys(LESSON_META);

/** What the briefing cover of a lesson needs from the exercise: autopilot allowed, the approach plate. */
export const LESSON_SIM: Readonly<
  Record<string, { ap: boolean; plate?: string }>
> = {
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

// ------------------------------------------------------------------ the failure drills (train/drills.ts DRILL_TEMPLATES)
export type DrillPhaseId = "lineup" | "climbout" | "cruise" | "approach";
export interface DrillMeta {
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
): DrillMeta => ({ name: { en, fr }, phase, trains });
export const DRILL_META: Readonly<Record<string, DrillMeta>> = {
  "d-efato": drill(
    "Engine failure after take-off (EFATO)",
    "Panne moteur au décollage (EFATO)",
    "lineup",
    ["c172.efato"],
  ),
  "d-engine-cruise": drill(
    "Engine failure in cruise + forced landing",
    "Panne moteur en croisière + atterrissage en campagne",
    "cruise",
    ["c172.engineFailure", "c172.forcedLanding"],
  ),
  "d-engine-fire": drill(
    "Engine fire in flight",
    "Feu moteur en vol",
    "cruise",
    ["c172.engineFire"],
  ),
  "d-elec-fire": drill("Electrical fire", "Feu électrique", "cruise", [
    "c172.electricalFire",
  ]),
  "d-alternator-imc": drill(
    "Alternator failure in IMC",
    "Panne d’alternateur en IMC",
    "cruise",
    ["c172.alternator"],
  ),
  "d-vacuum-app": drill(
    "Vacuum failure on an IMC approach",
    "Panne de dépression en approche IMC",
    "approach",
    ["c172.vacuum"],
  ),
  "d-pitot-icing": drill("Pitot icing", "Givrage pitot", "cruise", [
    "c172.pitot",
  ]),
  "d-static": drill(
    "Static port blocked",
    "Prise statique obstruée",
    "cruise",
    ["c172.static"],
  ),
  "d-lostcomms": drill(
    "Lost communications in IFR",
    "Panne radio en IFR",
    "cruise",
    ["c172.lostComms"],
  ),
  "d-rough": drill("Rough-running engine", "Moteur qui tourne mal", "cruise", [
    "c172.roughEngine",
  ]),
  "d-trim": drill("Electric trim runaway", "Emballement du trim", "cruise", [
    "c172.trimRunaway",
  ]),
  "d-flaps": drill("Flaps jammed", "Volets bloqués", "approach", [
    "c172.flaps",
  ]),
  "d-club-test": drill(
    "Club test: 2 random failures",
    "Test aéroclub : 2 pannes aléatoires",
    "cruise",
    [],
  ),
};

// ------------------------------------------------------------------ scenarios and school circuits (sim/sim.ts, train/circuits.ts)
export interface FlightMeta {
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
  minutes = 15,
): FlightMeta => ({ type: "scenario", en, fr, airport, tag, minutes });
const ci = (
  en: string,
  fr: string,
  airport: string,
  tag: string,
  minutes: number,
): FlightMeta => ({ type: "circuit", en, fr, airport, tag, minutes });
export const FLIGHT_META: Readonly<Record<string, FlightMeta>> = {
  rwy27: sc(
    "IFR departure — PARD RWY 27",
    "Départ IFR — PARD piste 27",
    "PARD",
    "DEP",
  ),
  "ils27-vtf": sc(
    "ILS RWY 27 — vectors to final",
    "ILS piste 27 — guidage radar en finale",
    "PARD",
    "ILS",
  ),
  "ils27-full": sc(
    "ILS RWY 27 — full procedure via TOBEY",
    "ILS piste 27 — procédure complète par TOBEY",
    "PARD",
    "ILS",
  ),
  loc27: sc(
    "LOC RWY 27 (glideslope out)",
    "LOC piste 27 (glide hors service)",
    "PARD",
    "LOC",
  ),
  rnav09: sc(
    "RNAV (GPS) RWY 09 — LPV via LUNKS",
    "RNAV (GPS) piste 09 — LPV par LUNKS",
    "PARD",
    "RNAV",
  ),
  locbc09: sc(
    "LOC BC RWY 09 — back course",
    "LOC BC piste 09 — back course",
    "PARD",
    "LOC BC",
  ),
  ndb27: sc(
    "NDB RWY 27 — ADF approach",
    "NDB piste 27 — approche à l’ADF",
    "PARD",
    "NDB",
  ),
  vor21: sc(
    "VOR/DME RWY 21 — Mistral Valley",
    "VOR/DME piste 21 — Mistral Valley",
    "MSVL",
    "VOR",
  ),
  rnav03: sc(
    "RNAV (GPS) RWY 03 — LNAV/VNAV",
    "RNAV (GPS) piste 03 — LNAV/VNAV",
    "MSVL",
    "RNAV",
  ),
  ils03: sc(
    "ILS RWY 03 — Mistral Valley",
    "ILS piste 03 — Mistral Valley",
    "MSVL",
    "ILS",
  ),
  lda36: sc(
    "LDA/DME RWY 36 — offset localizer",
    "LDA/DME piste 36 — localizer décalé",
    "PARD",
    "LDA",
  ),
  "hold-ard": sc("Holding at ARD", "Attente sur ARD", "PARD", "HOLD"),
  free: sc(
    "Free flight — VFR on top",
    "Vol libre — VFR au-dessus de la couche",
    "PARD",
    "VFR",
    20,
  ),
  "p-classic": ci(
    "Classic IR circuit — Port Ardent",
    "Circuit IR classique — Port Ardent",
    "PARD",
    "CIRCUIT",
    45,
  ),
  "p-valley": ci(
    "Mistral Valley loop",
    "Boucle de Mistral Valley",
    "MSVL",
    "CIRCUIT",
    45,
  ),
  "p-pp": ci(
    "Partial-panel circuit (checkride)",
    "Circuit en panne partielle (test)",
    "PARD",
    "CIRCUIT",
    40,
  ),
  "p-cross": ci(
    "PARD → MSVL → PARD round trip",
    "Aller-retour PARD → MSVL → PARD",
    "PARD",
    "CIRCUIT",
    70,
  ),
};
