// Default emergency & abnormal procedures for a C172S-class trainer (Lycoming IO-360 fuel-injected, 28 V,
// vacuum-driven steam gyros or G1000), in French and English.
//
// IDS: one base id per procedure ('c172.engineFire') and one Procedure per language with the language as a
// suffix: 'c172.engineFire.en' / 'c172.engineFire.fr' (lang field set too). Club copies keep `basedOn` = the
// library id they were customised from. baseId() in procedures.ts strips the suffix.
//
// VARIANTS: the G1000 (C172S NAV III POH) and the classic panel (steam-gauge C172S POH) differ — LOW VOLTS,
// vacuum, AHRS, STBY BATT. Whole procedures that differ are separate variants with `when.cockpit` and a shared
// `group`; single items that exist on one panel only carry `cockpit` (the runner drops them elsewhere). Lost comms
// follows the airspace (`when.region`: 14 CFR 91.185 in the US, SERA.14083 / ICAO elsewhere), never the UI
// language: both rules exist in both languages.
//
// CONTENT: paraphrased from the logic of the C172S POH section 3 (emergency procedures), the FAA Instrument
// Flying Handbook (unusual attitudes, partial panel), 14 CFR 91.185 and SERA.14083 — never copied verbatim, and
// never a substitute for them: every procedure carries the disclaimer below. Speeds are the POH ones (best glide
// 68 KIAS at 2550 lb; 70 KIAS flaps up / 65 KIAS flaps down for a power-off landing; 100 KIAS in an engine fire;
// VNE 163 KIAS). Memory items, time limits and IAS bands are TRAINING choices (club-editable), not POH values.
// The C172S has no carburettor (no carb heat) and no primer use in flight: clubs flying a carburettor aircraft
// customise the procedure.
import type { FailureKey } from "../sim/systemsTypes";
import type {
  CheckRef,
  Lang,
  ProcCategory,
  ProcCockpit,
  ProcItem,
  Procedure,
} from "./procedureTypes";

type L10n = Record<Lang, string>;

export const DISCLAIMER: L10n = {
  en: "Training aid — the aircraft POH/AFM and your club procedures prevail",
  fr: "Aide à l’entraînement — le manuel de vol (POH/AFM) et les procédures de votre club prévalent",
};

export const CATEGORY_LABELS: Record<ProcCategory, L10n> = {
  engine: { en: "Engine & fuel", fr: "Moteur et carburant" },
  fire: { en: "Fire", fr: "Feu" },
  electrical: { en: "Electrical", fr: "Électricité" },
  instruments: { en: "Flight instruments", fr: "Instruments de vol" },
  avionics: { en: "Avionics", fr: "Avionique" },
  comms: { en: "Communications", fr: "Communications" },
  flight: { en: "Flight control & attitude", fr: "Commandes et assiette" },
  other: { en: "Other", fr: "Autres" },
};
export const CATEGORY_ORDER: ProcCategory[] = [
  "engine",
  "fire",
  "electrical",
  "instruments",
  "avionics",
  "comms",
  "flight",
  "other",
];

interface BiItem {
  id: string;
  t: L10n;
  memory?: boolean;
  check?: CheckRef;
  withinS?: number;
  optional?: boolean;
  safety?: boolean;
  note?: L10n;
  /** item only in one language version */
  only?: Lang;
  /** item only in these cockpits (STBY BATT on the G1000): the drill runner drops it elsewhere */
  cockpit?: ProcCockpit[];
  /** the wording in one cockpit when it differs (the classic panel's single avionics master vs the G1000's BUS 1) */
  tc?: Partial<Record<ProcCockpit, L10n>>;
}
interface BiProc {
  base: string;
  title: L10n;
  summary: L10n;
  category: ProcCategory;
  failures: FailureKey[];
  ordered: boolean;
  items: BiItem[];
  targets?: Procedure["targets"];
  ref: L10n;
  when?: Procedure["when"];
  then?: Procedure["then"];
  /** variant family (base id of the procedure the drills expect), e.g. the classic-panel alternator checklist is
   *  in the 'c172.alternator' group */
  group?: string;
}

const sw = (
  key: string,
  value: string | number | boolean,
  op?: "<=" | ">=",
): CheckRef => ({
  id: "switch",
  p: op ? { key, value, op } : { key, value },
});
const MIX_CUTOFF = sw("mixture", 0, "<=");
/** G1000 only (C172S NAV III): the standby battery switch and the avionics bus 2 rocker */
const G1000: ProcCockpit[] = ["g1000", "airliner"];
const STEAM: ProcCockpit[] = ["steam"];
/** 'STBY BATT — OFF' (C172S NAV III POH section 3): with MASTER OFF the standby battery still feeds the essential
 *  bus — every "master OFF" of a fire or a forced landing is preceded by it on the G1000 */
const stbyOff = (memory = false): BiItem => ({
  id: "stbyBatt",
  t: { en: "STBY BATT switch — OFF (G1000)", fr: "Interrupteur STBY BATT — OFF (G1000)" },
  memory,
  check: sw("stbyBatt", false),
  cockpit: G1000,
});
const MIX_RICH = sw("mixture", 1, ">=");
const manual: CheckRef = { id: "manual" };
const POH = { en: "C172S POH section 3", fr: "C172S POH section 3" };
const pohRef = (en: string, fr: string): L10n => ({
  en: `${POH.en} — ${en}`,
  fr: `${POH.fr} — ${fr}`,
});

// ------------------------------------------------------------------ the library
const DEFS: BiProc[] = [
  {
    base: "c172.takeoffRoll",
    title: {
      en: "Engine failure during take-off roll",
      fr: "Panne moteur pendant la course au décollage",
    },
    summary: {
      en: "Abort: idle, brakes, then shut the engine and the electrics down.",
      fr: "Interrompre : réduire, freiner, puis couper moteur et électricité.",
    },
    category: "engine",
    failures: ["engine", "enginePartial", "fuelStarvation"],
    ordered: true,
    when: { onGround: true },
    ref: pohRef(
      "Engine failure during takeoff roll",
      "Panne moteur pendant la course au décollage",
    ),
    items: [
      {
        id: "throttle",
        t: { en: "Throttle — IDLE", fr: "Manette des gaz — RÉDUIT" },
        memory: true,
        check: { id: "throttle", p: { op: "<=", value: 0.05 } },
        withinS: 3,
      },
      {
        id: "brakes",
        t: { en: "Brakes — APPLY", fr: "Freins — FREINER" },
        memory: true,
        check: { id: "brake", p: { min: 0.8 } },
        note: {
          en: "Examiners expect the brakes within a few seconds of closing the throttle.",
          fr: "Les examinateurs attendent le freinage quelques secondes après la réduction.",
        },
      },
      {
        id: "flaps",
        t: { en: "Wing flaps — RETRACT", fr: "Volets — RENTRÉS" },
        check: { id: "flaps", p: { value: 0 } },
      },
      {
        id: "mixture",
        t: { en: "Mixture — IDLE CUT-OFF", fr: "Mélange — ÉTOUFFOIR" },
        check: MIX_CUTOFF,
      },
      {
        id: "mags",
        t: { en: "Magnetos — OFF", fr: "Magnétos — OFF" },
        check: sw("magnetos", "OFF"),
      },
      stbyOff(),
      {
        id: "master",
        t: {
          en: "Master switch (ALT and BAT) — OFF",
          fr: "Interrupteur général (ALT et BAT) — OFF",
        },
        check: sw("batMaster", false),
      },
    ],
  },
  {
    base: "c172.efato",
    title: {
      en: "Engine failure after take-off",
      fr: "Panne moteur après le décollage",
    },
    summary: {
      en: "Nose down at once, 65–70 KIAS, land ahead — never turn back at low height.",
      fr: "Assiette à piquer immédiatement, 65–70 kt, atterrir droit devant — jamais de demi-tour à basse hauteur.",
    },
    category: "engine",
    failures: ["engine", "fuelStarvation"],
    ordered: true,
    when: { aglFt: [0, 1000] },
    targets: { iasKt: [60, 75], maxBankDeg: 30 },
    ref: pohRef(
      "Engine failure immediately after takeoff",
      "Panne moteur immédiatement après le décollage",
    ),
    items: [
      {
        id: "pitch",
        t: {
          en: "Pitch — lower the nose at once (glide attitude)",
          fr: "Assiette — rendre la main immédiatement (assiette de plané)",
        },
        memory: true,
        // the C172S glides at +2 to +4° nose up (68 KIAS in this flight model): the item is "the nose came down
        // from the Vy attitude", not a pitch below the glide attitude itself
        check: { id: "pitchAtt", p: { min: -60, max: 5, holdS: 1 } },
        withinS: 4,
        note: {
          en: "At Vy the speed decays within seconds: the nose must come down before anything else.",
          fr: "À Vy la vitesse chute en quelques secondes : l’assiette d’abord, avant toute autre action.",
        },
      },
      {
        id: "ias",
        t: {
          en: "Airspeed — 70 KIAS flaps up / 65 KIAS flaps 10° to FULL",
          fr: "Vitesse — 70 kt volets rentrés / 65 kt volets 10° à plein",
        },
        memory: true,
        check: { id: "ias", p: { min: 62, max: 75, holdS: 5 } },
        withinS: 15,
      },
      {
        id: "ahead",
        t: {
          en: "Land straight ahead — small turns only to avoid obstacles",
          fr: "Atterrir droit devant — petits virages seulement pour éviter les obstacles",
        },
        memory: true,
        check: manual,
        note: {
          en: "Say it out loud: “landing ahead”. Partial power that does not climb: land ahead too — never turn back on partial power (FAA-H-8083-3C ch.18).",
          fr: "Annoncez-le : « atterrissage droit devant ». Puissance partielle qui ne permet pas de monter : se poser devant aussi — jamais de demi-tour avec une puissance partielle (FAA-H-8083-3C ch. 18).",
        },
      },
      {
        id: "mixture",
        t: { en: "Mixture — IDLE CUT-OFF", fr: "Mélange — ÉTOUFFOIR" },
        check: MIX_CUTOFF,
      },
      {
        id: "shutoff",
        t: {
          en: "Fuel shutoff valve — OFF (pull out)",
          fr: "Robinet d’arrêt carburant — FERMÉ (tiré)",
        },
        check: sw("fuelShutoff", false),
      },
      {
        id: "mags",
        t: { en: "Magnetos — OFF", fr: "Magnétos — OFF" },
        check: sw("magnetos", "OFF"),
      },
      {
        id: "flaps",
        t: {
          en: "Flaps — as required (FULL recommended)",
          fr: "Volets — selon besoin (plein volets recommandé)",
        },
        check: manual,
      },
      stbyOff(),
      {
        id: "master",
        t: {
          en: "Master switch (ALT and BAT) — OFF",
          fr: "Interrupteur général (ALT et BAT) — OFF",
        },
        check: sw("batMaster", false),
        note: {
          en: "Electric flaps: set them before the master goes OFF.",
          fr: "Volets électriques : les sortir avant de couper le général.",
        },
      },
      {
        id: "doors",
        t: { en: "Cabin doors — unlatch", fr: "Portes — déverrouillées" },
        check: manual,
      },
      {
        id: "landed",
        t: {
          en: "Touchdown — slightly tail low, then brake",
          fr: "Toucher — légèrement cabré, puis freiner",
        },
        check: { id: "landed" },
      },
    ],
  },
  {
    base: "c172.engineFailure",
    title: {
      en: "Engine failure in flight (restart)",
      fr: "Panne moteur en vol (redémarrage)",
    },
    summary: {
      en: "Best glide 68 KIAS, a landing site (IMC: the nearest airport), then the restart flow: fuel, pump, mixture, magnetos.",
      fr: "Finesse max 68 kt, un site d’atterrissage (IMC : le terrain le plus proche), puis la séquence de redémarrage : carburant, pompe, mélange, magnétos.",
    },
    category: "engine",
    failures: ["engine", "fuelStarvation"],
    ordered: true,
    targets: { iasKt: [63, 73], maxBankDeg: 30 },
    ref: pohRef(
      "Engine failure during flight (restart procedures)",
      "Panne moteur en vol (procédure de redémarrage)",
    ),
    then: {
      procedure: "c172.forcedLanding",
      unless: { id: "engineRunning", p: { value: true } },
      afterS: 90,
    },
    items: [
      {
        id: "ias",
        t: {
          en: "Airspeed — 68 KIAS (best glide)",
          fr: "Vitesse — 68 kt (finesse max)",
        },
        memory: true,
        check: { id: "ias", p: { min: 63, max: 73, holdS: 5 } },
        withinS: 20,
        note: {
          en: "Trade the excess speed for height, then trim for 68 KIAS: every knot off costs gliding distance.",
          fr: "Transformez l’excès de vitesse en hauteur puis compensez à 68 kt : chaque nœud d’écart coûte de la distance de plané.",
        },
      },
      {
        id: "field",
        t: {
          en: "Landing site — a field within gliding distance, into wind (in IMC: the nearest airport)",
          fr: "Site d’atterrissage — un champ à portée de plané, face au vent (en IMC : le terrain le plus proche)",
        },
        memory: true,
        check: manual,
        note: {
          en: "In cloud no field can be chosen: NRST, direct-to the nearest airport, MAYDAY early for vectors and the ceiling (FAA-H-8083-15B, emergency operations).",
          fr: "En nuage aucun champ ne se choisit : NRST, Direct-To vers le terrain le plus proche, MAYDAY tôt pour un guidage et le plafond (FAA-H-8083-15B, opérations d’urgence).",
        },
      },
      {
        id: "nearest",
        t: {
          en: "IMC: nearest airport — DIRECT-TO (NRST)",
          fr: "IMC : terrain le plus proche — DIRECT-TO (NRST)",
        },
        check: { id: "directTo", p: { ident: "*nearest" } },
        optional: true,
      },
      {
        id: "shutoff",
        t: {
          en: "Fuel shutoff valve — ON (push in)",
          fr: "Robinet d’arrêt carburant — OUVERT (poussé)",
        },
        memory: true,
        check: sw("fuelShutoff", true),
      },
      {
        id: "selector",
        t: { en: "Fuel selector — BOTH", fr: "Sélecteur carburant — BOTH" },
        memory: true,
        check: sw("fuelSelector", "BOTH"),
        note: {
          en: "Fuel mismanagement — a selector left on an empty tank — is the commonest cause of an engine stoppage.",
          fr: "La mauvaise gestion du carburant — sélecteur laissé sur un réservoir vide — est la cause la plus fréquente d’arrêt moteur.",
        },
      },
      {
        id: "auxPump",
        t: {
          en: "Fuel pump — ON",
          fr: "Pompe électrique (FUEL PUMP) — ON",
        },
        memory: true,
        check: sw("auxPump", true),
      },
      {
        id: "mixture",
        t: {
          en: "Mixture — RICH (if the restart has not occurred)",
          fr: "Mélange — PLEIN RICHE (si le moteur n’a pas redémarré)",
        },
        memory: true,
        check: MIX_RICH,
      },
      {
        id: "mags",
        t: {
          en: "Magnetos — BOTH (START if the propeller has stopped)",
          fr: "Magnétos — BOTH (START si l’hélice est arrêtée)",
        },
        memory: true,
        check: sw("magnetos", "BOTH|START"),
        note: {
          en: "A windmilling propeller restarts by itself within a few seconds once fuel and spark are back. Propeller stopped: START, then advance the throttle slowly.",
          fr: "Une hélice en moulinet redémarre seule en quelques secondes dès que carburant et allumage sont rétablis. Hélice arrêtée : START, puis avancer les gaz lentement.",
        },
      },
      {
        id: "pumpOff",
        t: {
          en: "After a restart: fuel pump — OFF (back ON if the fuel flow drops)",
          fr: "Après redémarrage : pompe électrique — OFF (à remettre si le débit chute)",
        },
        check: manual,
        optional: true,
      },
    ],
  },
  {
    base: "c172.forcedLanding",
    title: {
      en: "Forced landing without engine power",
      fr: "Atterrissage forcé sans moteur",
    },
    summary: {
      en: "Glide, MAYDAY and 7700, seats and belts, secure the engine and the electrics, land into the field.",
      fr: "Plané, MAYDAY et 7700, sièges et ceintures, sécuriser moteur et électricité, se poser dans le champ.",
    },
    category: "engine",
    failures: ["engine", "fuelStarvation"],
    ordered: true,
    targets: { iasKt: [62, 75], maxBankDeg: 30 },
    ref: pohRef(
      "Emergency landing without engine power",
      "Atterrissage d’urgence sans puissance moteur",
    ),
    items: [
      {
        id: "ias",
        t: {
          en: "Airspeed — 70 KIAS flaps up / 65 KIAS flaps 10° to FULL",
          fr: "Vitesse — 70 kt volets rentrés / 65 kt volets 10° à plein",
        },
        memory: true,
        check: { id: "ias", p: { min: 62, max: 75, holdS: 5 } },
        withinS: 20,
      },
      {
        id: "mayday",
        t: {
          en: "MAYDAY — on the frequency in use, else 121.5",
          fr: "MAYDAY — sur la fréquence en cours, sinon 121,5",
        },
        check: manual,
        note: {
          en: "Callsign, position, height, intentions, persons on board. In IMC: ask for vectors to the nearest airport and the ceiling.",
          fr: "Indicatif, position, hauteur, intentions, personnes à bord. En IMC : demander un guidage vers le terrain le plus proche et le plafond.",
        },
      },
      {
        id: "xpdr",
        t: { en: "Transponder — 7700", fr: "Transpondeur — 7700" },
        check: { id: "xpdr", p: { code: "7700" } },
      },
      {
        id: "seats",
        t: {
          en: "Seat backs — MOST UPRIGHT; seats and seat belts — SECURE",
          fr: "Dossiers — REDRESSÉS ; sièges verrouillés, ceintures serrées",
        },
        check: manual,
      },
      {
        id: "mixture",
        t: { en: "Mixture — IDLE CUT-OFF", fr: "Mélange — ÉTOUFFOIR" },
        check: MIX_CUTOFF,
        note: {
          en: "Secure the engine once the field is made: while high, keep trying the restart.",
          fr: "Sécuriser le moteur une fois le champ assuré : tant que vous êtes haut, continuez à tenter le redémarrage.",
        },
      },
      {
        id: "shutoff",
        t: {
          en: "Fuel shutoff valve — OFF (pull out)",
          fr: "Robinet d’arrêt carburant — FERMÉ (tiré)",
        },
        check: sw("fuelShutoff", false),
      },
      {
        id: "mags",
        t: { en: "Magnetos — OFF", fr: "Magnétos — OFF" },
        check: sw("magnetos", "OFF"),
      },
      {
        id: "flaps",
        t: {
          en: "Flaps — as required (FULL recommended on final)",
          fr: "Volets — selon besoin (plein volets recommandé en finale)",
        },
        check: manual,
      },
      stbyOff(),
      {
        id: "master",
        t: {
          en: "Master switch (ALT and BAT) — OFF once the landing is assured",
          fr: "Interrupteur général (ALT et BAT) — OFF quand l’atterrissage est assuré",
        },
        check: sw("batMaster", false),
      },
      {
        id: "doors",
        t: {
          en: "Doors — unlatch before touchdown",
          fr: "Portes — déverrouillées avant le toucher",
        },
        check: manual,
      },
      {
        id: "landed",
        t: {
          en: "Touchdown — slightly tail low; brakes — APPLY HEAVILY",
          fr: "Toucher — légèrement cabré ; freins — FREINAGE ÉNERGIQUE",
        },
        check: { id: "landed" },
      },
    ],
  },
  {
    base: "c172.precautionary",
    title: {
      en: "Precautionary landing with engine power",
      fr: "Atterrissage de précaution avec moteur",
    },
    summary: {
      en: "Seats and belts, 65 KIAS flaps 20°, fly over the field, then a normal short-field landing with the electrics off.",
      fr: "Sièges et ceintures, 65 kt volets 20°, survoler le champ, puis un atterrissage court normal, électricité coupée.",
    },
    category: "engine",
    failures: [],
    ordered: true,
    targets: { maxBankDeg: 30 },
    ref: pohRef(
      "Precautionary landing with engine power",
      "Atterrissage de précaution avec moteur",
    ),
    items: [
      {
        id: "seats",
        t: {
          en: "Seat backs — MOST UPRIGHT; seats and seat belts — SECURE",
          fr: "Dossiers — REDRESSÉS ; sièges verrouillés, ceintures serrées",
        },
        check: manual,
      },
      {
        id: "ias",
        t: { en: "Airspeed — 65 KIAS", fr: "Vitesse — 65 kt" },
        check: { id: "ias", p: { min: 60, max: 70, holdS: 5 } },
      },
      {
        id: "flaps20",
        t: { en: "Wing flaps — 20°", fr: "Volets — 20°" },
        check: { id: "flaps", p: { value: 2 } },
      },
      {
        id: "overfly",
        t: {
          en: "Selected field — FLY OVER, noting terrain and obstructions",
          fr: "Champ choisi — SURVOLER, relief et obstacles",
        },
        check: manual,
      },
      {
        id: "flapsFull",
        t: { en: "Wing flaps — FULL on final", fr: "Volets — PLEIN en finale" },
        check: { id: "flaps", p: { value: 3 } },
      },
      stbyOff(),
      {
        id: "master",
        t: {
          en: "Master switch (ALT and BAT) — OFF when the landing is assured",
          fr: "Interrupteur général (ALT et BAT) — OFF quand l’atterrissage est assuré",
        },
        check: sw("batMaster", false),
      },
      {
        id: "doors",
        t: { en: "Doors — unlatch before touchdown", fr: "Portes — déverrouillées avant le toucher" },
        check: manual,
      },
      {
        id: "landed",
        t: {
          en: "Touchdown — slightly tail low; mixture IDLE CUT-OFF, magnetos OFF, brakes — APPLY HEAVILY",
          fr: "Toucher — légèrement cabré ; mélange ÉTOUFFOIR, magnétos OFF, FREINAGE ÉNERGIQUE",
        },
        check: { id: "landed" },
      },
    ],
  },
  {
    base: "c172.ditching",
    title: { en: "Ditching", fr: "Amerrissage forcé" },
    summary: {
      en: "MAYDAY and 7700, secure the cabin, flaps 20°–FULL, 300 fpm at 55 KIAS, into the wind or along the swell, evacuate through the doors.",
      fr: "MAYDAY et 7700, arrimer la cabine, volets 20° à plein, 300 ft/min à 55 kt, face au vent ou le long de la houle, évacuer par les portes.",
    },
    category: "engine",
    failures: [],
    ordered: true,
    ref: pohRef("Ditching", "Amerrissage"),
    items: [
      { id: "mayday", t: { en: "MAYDAY on 121.5 — position and intentions; transponder 7700", fr: "MAYDAY sur 121,5 — position et intentions ; transpondeur 7700" }, check: manual },
      { id: "objects", t: { en: "Heavy objects in the baggage area — SECURE or JETTISON", fr: "Objets lourds en soute — ARRIMÉS ou LARGUÉS" }, check: manual },
      { id: "seats", t: { en: "Seat backs — MOST UPRIGHT; seats and seat belts — SECURE", fr: "Dossiers — REDRESSÉS ; sièges verrouillés, ceintures serrées" }, check: manual },
      { id: "flaps", t: { en: "Wing flaps — 20° to FULL", fr: "Volets — 20° à plein" }, check: manual },
      {
        id: "power",
        t: {
          en: "Power — a 300 fpm descent at 55 KIAS (no power: 70 KIAS flaps up / 65 KIAS flaps 10°)",
          fr: "Puissance — descente à 300 ft/min à 55 kt (sans moteur : 70 kt volets rentrés / 65 kt volets 10°)",
        },
        check: manual,
      },
      {
        id: "approach",
        t: {
          en: "Approach — high wind, heavy seas: into the wind; light wind, heavy swell: parallel to the swells",
          fr: "Approche — vent fort, mer forte : face au vent ; vent faible, forte houle : parallèle à la houle",
        },
        check: manual,
      },
      { id: "doors", t: { en: "Cabin doors — UNLATCH", fr: "Portes — DÉVERROUILLÉES" }, check: manual },
      { id: "touchdown", t: { en: "Touchdown — level attitude at the established descent; face cushioned", fr: "Toucher — assiette horizontale au vario établi ; visage protégé" }, check: manual },
      { id: "elt", t: { en: "ELT — ACTIVATE", fr: "Balise de détresse (ELT) — ACTIVER" }, check: manual },
      {
        id: "evacuate",
        t: {
          en: "Evacuate through the doors (open a window and let the cabin flood to equalise the pressure); life vests and raft — inflate once outside",
          fr: "Évacuer par les portes (ouvrir une fenêtre, laisser entrer l’eau pour égaliser) ; gilets et radeau — gonfler une fois dehors",
        },
        check: manual,
      },
    ],
  },
  {
    base: "c172.roughEngine",
    title: {
      en: "Rough engine / partial power loss",
      fr: "Moteur qui tourne mal / perte partielle de puissance",
    },
    summary: {
      en: "Fly, head for a field, then mixture, magnetos one at a time (keep BOTH if no change), fuel pump if the fuel flow is low; land at the nearest airport.",
      fr: "Piloter, se diriger vers un champ, puis mélange, magnétos une par une (BOTH si aucun changement), pompe si le débit est bas ; atterrir au terrain le plus proche.",
    },
    category: "engine",
    failures: ["engineRough", "enginePartial"],
    ordered: false,
    ref: pohRef(
      "Rough engine operation or loss of power (amplified)",
      "Fonctionnement irrégulier ou perte de puissance (procédures détaillées)",
    ),
    items: [
      {
        id: "fly",
        t: {
          en: "Fly the aircraft — turn towards a field or the nearest airport",
          fr: "Piloter — se diriger vers un champ ou le terrain le plus proche",
        },
        memory: true,
        check: manual,
      },
      {
        id: "selector",
        t: { en: "Fuel selector — BOTH", fr: "Sélecteur carburant — BOTH" },
        check: sw("fuelSelector", "BOTH"),
      },
      {
        id: "mixture",
        t: {
          en: "Mixture — RICH, then lean for the smoothest running",
          fr: "Mélange — PLEIN RICHE, puis appauvrir pour le régime le plus régulier",
        },
        check: manual,
        note: {
          en: "Spark-plug fouling: lean to the recommended setting. The C172S is fuel-injected: no carburettor heat (a carburettor engine puts CARB HEAT — HOT first).",
          fr: "Bougies encrassées : appauvrir au réglage recommandé. Le C172S est à injection : pas de réchauffage carburateur (sur un moteur à carburateur, RÉCHAUFFAGE CARBU — CHAUD en premier).",
        },
      },
      {
        id: "mags",
        t: {
          en: "Magnetos — L, then R: keep the smoother one (BOTH if no change)",
          fr: "Magnétos — L puis R : garder la plus régulière (BOTH si aucun changement)",
        },
        // credited on the GOOD magneto when one is faulty, on BOTH when none is (procedureChecks.ts)
        check: sw("magnetos", "GOOD"),
        note: {
          en: "A bad magneto runs very rough on its own: switch back at once and keep the good one.",
          fr: "Une magnéto défaillante seule fait tourner très mal : revenez immédiatement et gardez la bonne.",
        },
      },
      {
        id: "auxPump",
        t: {
          en: "Fuel flow low or fluctuating: fuel pump — ON",
          fr: "Débit bas ou instable : pompe électrique — ON",
        },
        check: sw("auxPump", true),
        optional: true,
        note: {
          en: "With a working engine-driven pump the fuel pump makes the mixture excessively rich: use it for a fuel-flow problem only.",
          fr: "Avec une pompe mécanique qui fonctionne, la pompe électrique enrichit trop le mélange : seulement en cas de problème de débit.",
        },
      },
      {
        id: "direct",
        t: {
          en: "Nearest airport — direct-to",
          fr: "Terrain le plus proche — Direct-To",
        },
        check: { id: "directTo", p: { ident: "*nearest" } },
      },
      {
        id: "prepare",
        t: {
          en: "If power stays low: prepare a precautionary landing",
          fr: "Si la puissance reste faible : préparer un atterrissage de précaution",
        },
        check: manual,
      },
    ],
  },
  {
    base: "c172.oilPressure",
    title: { en: "Loss of oil pressure", fr: "Perte de pression d’huile" },
    summary: {
      en: "Low pressure with rising temperature: the engine will stop — reduce power, pick a field, minimum power to reach it.",
      fr: "Pression basse et température qui monte : le moteur va s’arrêter — réduire, choisir un champ, le minimum de puissance pour l’atteindre.",
    },
    category: "engine",
    failures: ["oilPressure"],
    ordered: false,
    ref: pohRef("Low oil pressure (amplified)", "Basse pression d’huile (procédures détaillées)"),
    then: {
      procedure: "c172.forcedLanding",
      unless: { id: "engineRunning", p: { value: true } },
    },
    items: [
      {
        id: "gauges",
        t: {
          en: "Oil pressure and temperature — check",
          fr: "Pression et température d’huile — vérifier",
        },
        check: manual,
        note: {
          en: "Low pressure with a normal temperature: probably the gauge or the relief valve — land at the nearest airport. With a rising temperature, engine failure is imminent.",
          fr: "Pression basse et température normale : probablement l’indicateur ou le clapet — atterrir au terrain le plus proche. Avec une température qui monte, la panne moteur est imminente.",
        },
      },
      {
        id: "direct",
        t: {
          en: "Nearest airport — direct-to",
          fr: "Terrain le plus proche — Direct-To",
        },
        check: { id: "directTo", p: { ident: "*nearest" } },
      },
      {
        id: "power",
        t: {
          en: "Rising temperature: power — REDUCE at once; only the minimum needed to reach the landing site (accept a descent)",
          fr: "Température qui monte : puissance — RÉDUIRE immédiatement ; seulement le minimum pour atteindre le site d’atterrissage (accepter la descente)",
        },
        check: manual,
      },
      {
        id: "atc",
        t: {
          en: "ATC — PAN PAN (MAYDAY once the temperature rises)",
          fr: "ATC — PAN PAN (MAYDAY dès que la température monte)",
        },
        check: manual,
      },
      {
        id: "glide",
        t: {
          en: "Stay within gliding distance of a field; brief the forced landing",
          fr: "Rester à portée de plané d’un champ ; préparer l’atterrissage forcé",
        },
        check: manual,
      },
    ],
  },
  {
    base: "c172.fuelPump",
    title: {
      en: "Engine-driven fuel pump failure",
      fr: "Panne de pompe à carburant mécanique",
    },
    summary: {
      en: "Sudden fuel-flow drop, then the RPM: fuel pump ON at once, then adjust throttle and mixture.",
      fr: "Chute brutale du débit, puis du régime : pompe électrique ON immédiatement, puis ajuster gaz et mélange.",
    },
    category: "engine",
    failures: ["fuelPump"],
    ordered: true,
    ref: pohRef(
      "Engine-driven fuel pump failure (amplified)",
      "Panne de pompe à carburant entraînée par le moteur (procédures détaillées)",
    ),
    then: {
      procedure: "c172.forcedLanding",
      unless: { id: "engineRunning", p: { value: true } },
      afterS: 120,
    },
    items: [
      {
        id: "auxPump",
        t: {
          en: "Fuel pump — ON",
          fr: "Pompe électrique (FUEL PUMP) — ON",
        },
        memory: true,
        check: sw("auxPump", true),
        withinS: 15,
        safety: false,
        note: {
          en: "The cue is the fuel flow falling to zero just before the RPM drops: there is no fuel-pressure light on a C172S.",
          fr: "Le signal : le débit qui tombe à zéro juste avant la chute du régime. Il n’y a pas de voyant de pression carburant sur un C172S.",
        },
      },
      {
        id: "running",
        t: {
          en: "Engine — running, fuel flow back",
          fr: "Moteur — tourne, débit rétabli",
        },
        check: { id: "engineRunning", p: { value: true } },
      },
      {
        id: "adjust",
        t: {
          en: "Throttle and mixture — adjust",
          fr: "Gaz et mélange — ajuster",
        },
        check: manual,
        optional: true,
      },
      {
        id: "land",
        t: {
          en: "Land as soon as practical, fuel pump left ON",
          fr: "Atterrir dès que raisonnablement possible, pompe électrique laissée ON",
        },
        check: manual,
      },
    ],
  },
  {
    base: "c172.fuelLeak",
    title: {
      en: "Fuel imbalance / fuel leak",
      fr: "Déséquilibre carburant / fuite",
    },
    summary: {
      en: "Confirm on the gauges; a leak forward of the firewall is a fire risk — land as soon as possible; a wing-tank leak: use that tank while it lasts, divert, recompute the endurance.",
      fr: "Confirmer aux jauges ; fuite à l’avant de la cloison pare-feu : risque de feu, atterrir dès que possible ; fuite d’un réservoir d’aile : consommer ce réservoir, dérouter, recalculer l’autonomie.",
    },
    category: "engine",
    failures: ["fuelLeak"],
    ordered: false,
    ref: {
      en: "Club / FAA-H-8083-3C practice (no C172S POH checklist) — fuel system",
      fr: "Pratique club / FAA-H-8083-3C (pas de check-list au POH C172S) — circuit carburant",
    },
    items: [
      {
        id: "gauges",
        t: {
          en: "Fuel quantity L / R, fuel flow and totaliser — check (one tank falling faster than the burn)",
          fr: "Quantités G / D, débit et totalisateur — vérifier (un réservoir qui baisse plus vite que la consommation)",
        },
        check: manual,
      },
      {
        id: "smell",
        t: {
          en: "Fuel smell or a leak forward of the firewall — fire risk: land as soon as possible, electrics to the minimum",
          fr: "Odeur d’essence ou fuite à l’avant de la cloison pare-feu — risque de feu : atterrir dès que possible, électricité au minimum",
        },
        check: manual,
        optional: true,
      },
      {
        id: "selector",
        t: {
          en: "Wing-tank leak: fuel selector — the LEAKING tank while it lasts (timer, watch LOW FUEL), then the good one",
          fr: "Fuite d’un réservoir d’aile : sélecteur — le réservoir QUI FUIT tant qu’il dure (chrono, surveiller LOW FUEL), puis le bon",
        },
        // the simulator's fuelLeak failure is always the left tank (FAILURE_LABELS): only that tank answers the
        // item — selecting the good tank is the opposite of the library's choice (burn the leaking tank's fuel first)
        check: sw("fuelSelector", "LEFT"),
        note: {
          en: "The fuel in the leaking tank is lost anyway: burn it first. Some clubs prefer to keep the good tank — edit the item.",
          fr: "Le carburant du réservoir qui fuit est perdu de toute façon : le consommer d’abord. Certains clubs préfèrent garder le bon réservoir — modifiez l’item.",
        },
      },
      {
        id: "direct",
        t: {
          en: "Nearest suitable airport — direct-to",
          fr: "Terrain approprié le plus proche — Direct-To",
        },
        check: { id: "directTo", p: { ident: "*nearest" } },
      },
      {
        id: "endurance",
        t: {
          en: "Endurance — recompute on the good tank only",
          fr: "Autonomie — recalculer sur le seul bon réservoir",
        },
        check: manual,
      },
      {
        id: "atc",
        t: { en: "ATC — PAN PAN", fr: "ATC — PAN PAN" },
        check: manual,
        optional: true,
      },
    ],
  },
  {
    base: "c172.engineFire",
    title: { en: "Engine fire in flight", fr: "Feu moteur en vol" },
    summary: {
      en: "Smoke, smell, rising EGT: cut the fuel — mixture, shutoff valve, pump; master OFF, vents open, cabin heat OFF, 100 KIAS, then the forced landing.",
      fr: "Fumée, odeur, EGT qui monte : couper le carburant — mélange, robinet, pompe ; général OFF, aérateurs ouverts, chauffage fermé, 100 kt, puis l’atterrissage forcé.",
    },
    category: "fire",
    failures: ["engineFire"],
    ordered: true,
    targets: { iasKt: [90, 110] },
    ref: pohRef("Engine fire in flight", "Feu moteur en vol"),
    // the engine is shut down by the procedure itself: the forced landing follows (MAYDAY, 7700, landing)
    then: { procedure: "c172.forcedLanding" },
    items: [
      {
        id: "mixture",
        t: { en: "Mixture — IDLE CUT-OFF", fr: "Mélange — ÉTOUFFOIR" },
        memory: true,
        check: MIX_CUTOFF,
        withinS: 15,
        note: {
          en: "No fire light on a C172S: the cues are smoke from the cowling, the smell, a rising EGT / CHT.",
          fr: "Pas de voyant feu sur un C172S : les indices sont la fumée du capot, l’odeur, l’EGT / CHT qui montent.",
        },
      },
      {
        id: "shutoff",
        t: {
          en: "Fuel shutoff valve — OFF (pull out)",
          fr: "Robinet d’arrêt carburant — FERMÉ (tiré)",
        },
        memory: true,
        check: sw("fuelShutoff", false),
        withinS: 20,
      },
      {
        id: "auxPump",
        t: {
          en: "Fuel pump — OFF",
          fr: "Pompe électrique (FUEL PUMP) — OFF",
        },
        memory: true,
        check: sw("auxPump", false),
      },
      // No STBY BATT step here: the C172S NAV III POH engine-fire-in-flight checklist goes MIXTURE, FUEL SHUTOFF,
      // FUEL PUMP, MASTER, CABIN VENTS, CABIN HEAT & AIR, 100 KIAS, FORCED LANDING. The fire is not electrical; the
      // standby battery keeps the PFD and COM1 alive for the MAYDAY and the descent, and the forced landing turns
      // it OFF once the landing is assured.
      {
        id: "master",
        t: {
          en: "Master switch (ALT and BAT) — OFF",
          fr: "Interrupteur général (ALT et BAT) — OFF",
        },
        memory: true,
        check: sw("batMaster", false),
      },
      {
        id: "vents",
        t: {
          en: "Cabin vents — OPEN (as needed)",
          fr: "Aérateurs cabine — OUVERTS (selon besoin)",
        },
        check: manual,
      },
      {
        id: "cabin",
        t: {
          en: "Cabin heat and air — OFF",
          fr: "Chauffage et air cabine — FERMÉS",
        },
        memory: true,
        check: sw("cabinHeat", false),
      },
      {
        id: "ias",
        t: {
          en: "Airspeed — 100 KIAS (faster if the fire persists, within limits)",
          fr: "Vitesse — 100 kt (plus vite si le feu persiste, dans les limites)",
        },
        memory: true,
        check: { id: "ias", p: { min: 90, max: 110, holdS: 5 } },
        note: {
          en: "A higher speed may blow the flames out by making the mixture too lean to burn.",
          fr: "Une vitesse plus élevée peut souffler les flammes en rendant le mélange trop pauvre pour brûler.",
        },
      },
    ],
  },
  {
    base: "c172.fireStart",
    title: {
      en: "Fire during start on the ground",
      fr: "Feu au démarrage (au sol)",
    },
    summary: {
      en: "Keep cranking to suck the flames in; it starts: 1800 RPM, then shut down and inspect; it does not: fuel and electrics off, evacuate, extinguish.",
      fr: "Continuer le démarreur pour aspirer les flammes ; il part : 1800 tr/min, puis arrêt et inspection ; il ne part pas : carburant et électricité coupés, évacuer, éteindre.",
    },
    category: "fire",
    failures: ["engineFire"],
    ordered: false,
    when: { onGround: true },
    ref: pohRef("Fire during start on ground", "Feu au démarrage au sol"),
    items: [
      {
        id: "crank",
        t: {
          en: "Magnetos — START, continue cranking",
          fr: "Magnétos — START, continuer le démarreur",
        },
        memory: true,
        check: sw("magnetos", "START"),
      },
      {
        id: "starts",
        t: {
          en: "If the engine starts: power 1800 RPM for a few minutes, then shut down and inspect",
          fr: "Si le moteur démarre : 1800 tr/min quelques minutes, puis arrêt et inspection",
        },
        check: manual,
        optional: true,
      },
      {
        id: "throttle",
        t: { en: "If it does not start: throttle — FULL", fr: "S’il ne démarre pas : gaz — PLEIN" },
        check: { id: "throttle", p: { op: ">=", value: 0.9 } },
      },
      {
        id: "mixture",
        t: { en: "Mixture — IDLE CUT-OFF", fr: "Mélange — ÉTOUFFOIR" },
        check: MIX_CUTOFF,
      },
      {
        id: "shutoff",
        t: { en: "Fuel shutoff valve — OFF (pull out)", fr: "Robinet d’arrêt carburant — FERMÉ (tiré)" },
        check: sw("fuelShutoff", false),
      },
      {
        id: "auxPump",
        t: { en: "Fuel pump — OFF", fr: "Pompe électrique — OFF" },
        check: sw("auxPump", false),
      },
      {
        id: "mags",
        t: { en: "Magnetos — OFF", fr: "Magnétos — OFF" },
        check: sw("magnetos", "OFF"),
      },
      stbyOff(),
      {
        id: "master",
        t: { en: "Master switch (ALT and BAT) — OFF", fr: "Interrupteur général (ALT et BAT) — OFF" },
        check: sw("batMaster", false),
      },
      {
        id: "evacuate",
        t: {
          en: "Parking brake — RELEASE; fire extinguisher — OBTAIN; evacuate",
          fr: "Frein de parc — DESSERRÉ ; extincteur — PRENDRE ; évacuer",
        },
        check: manual,
      },
      {
        id: "extinguish",
        t: {
          en: "Fire — extinguish; damage — inspect before any flight",
          fr: "Feu — éteindre ; dégâts — inspecter avant tout vol",
        },
        check: manual,
      },
    ],
  },
  {
    base: "c172.electricalFire",
    title: { en: "Electrical fire in flight", fr: "Feu électrique en vol" },
    summary: {
      en: "Smoke: STBY BATT and master OFF, vents closed, heat OFF, avionics OFF; fire out and power needed: master ON, then one bus at a time — leave the faulty one OFF.",
      fr: "Fumée : STBY BATT et général OFF, aérateurs fermés, chauffage fermé, avionique OFF ; feu éteint et électricité nécessaire : général ON, puis une barre à la fois — laisser la fautive coupée.",
    },
    category: "fire",
    failures: ["electricalFire"],
    ordered: true,
    ref: pohRef("Electrical fire in flight", "Feu électrique en vol"),
    items: [
      // POH order: STBY BATT, master, vents, heat / air, extinguisher, avionics, every other switch
      stbyOff(true),
      {
        id: "master",
        t: {
          en: "Master switch (ALT and BAT) — OFF",
          fr: "Interrupteur général (ALT et BAT) — OFF",
        },
        memory: true,
        check: sw("batMaster", false),
        // the clock starts at the fault, not at the first wisp of smoke (≈ 5 s later): 20 s leaves a fair reaction
        withinS: 20,
        note: {
          en: "No smoke light on a C172S: the cue is the smell and the haze, sometimes a rising ammeter.",
          fr: "Pas de voyant fumée sur un C172S : l’indice est l’odeur et le voile de fumée, parfois l’ampèremètre qui monte.",
        },
      },
      {
        id: "vents",
        t: { en: "Cabin vents — CLOSED", fr: "Aérateurs cabine — FERMÉS" },
        memory: true,
        check: manual,
      },
      {
        id: "cabin",
        t: {
          en: "Cabin heat and air — OFF",
          fr: "Chauffage et air cabine — FERMÉS",
        },
        memory: true,
        check: sw("cabinHeat", false),
      },
      {
        id: "extinguisher",
        t: {
          en: "Fire extinguisher — ACTIVATE if needed (then ventilate the cabin)",
          fr: "Extincteur — UTILISER si nécessaire (puis aérer la cabine)",
        },
        check: manual,
        optional: true,
      },
      {
        id: "avionics",
        t: {
          en: "Avionics switch — OFF (G1000: BUS 1)",
          fr: "Interrupteur avionique — OFF (G1000 : BARRE 1)",
        },
        tc: {
          steam: { en: "Avionics master switch — OFF", fr: "Interrupteur avionique — OFF" },
          g1000: { en: "AVIONICS BUS 1 — OFF", fr: "AVIONIQUE BARRE 1 — OFF" },
          airliner: { en: "AVIONICS BUS 1 — OFF", fr: "AVIONIQUE BARRE 1 — OFF" },
        },
        memory: true,
        check: sw("avionics", false),
      },
      {
        id: "avionics2",
        t: { en: "Avionics BUS 2 — OFF (G1000)", fr: "Avionique BARRE 2 — OFF (G1000)" },
        memory: true,
        check: sw("avionics2", false),
        cockpit: G1000,
      },
      {
        id: "switches",
        t: {
          en: "All other switches — OFF (magnetos stay ON)",
          fr: "Tous les autres interrupteurs — OFF (magnétos restent sur BOTH)",
        },
        memory: true,
        check: manual,
      },
      {
        id: "ventilate",
        t: {
          en: "Fire completely out: vents OPEN, cabin heat and air ON to clear the smoke",
          fr: "Feu complètement éteint : aérateurs OUVERTS, chauffage et air OUVERTS pour évacuer la fumée",
        },
        check: manual,
        optional: true,
      },
      {
        id: "breakers",
        t: {
          en: "Circuit breakers — check for an open one, do not reset it",
          fr: "Disjoncteurs — chercher celui qui a sauté, ne pas le réenclencher",
        },
        check: manual,
      },
      // ---- POH: "if electrical power is needed for continued flight" (IMC, night): restore it one step at a time
      {
        id: "restoreMaster",
        t: {
          en: "Power needed to continue: master switch (ALT and BAT) — ON",
          fr: "Électricité nécessaire pour poursuivre : interrupteur général (ALT et BAT) — ON",
        },
        check: sw("altMaster", true),
        optional: true,
        note: {
          en: "In VMC with an airport close by you may stay without power. In IMC you need it: restore it, one step at a time.",
          fr: "En VMC avec un terrain proche, vous pouvez rester sans électricité. En IMC il vous la faut : la rétablir, étape par étape.",
        },
      },
      {
        id: "restoreStby",
        t: { en: "STBY BATT switch — ARM (G1000)", fr: "Interrupteur STBY BATT — ARM (G1000)" },
        check: sw("stbyBatt", true),
        optional: true,
        cockpit: G1000,
      },
      {
        id: "restoreBus1",
        t: {
          en: "Avionics — ON (G1000: BUS 1), watch for smoke",
          fr: "Avionique — ON (G1000 : BARRE 1), surveiller la fumée",
        },
        tc: {
          steam: { en: "Avionics master switch — ON, watch for smoke", fr: "Interrupteur avionique — ON, surveiller la fumée" },
          g1000: { en: "AVIONICS BUS 1 — ON, watch for smoke", fr: "AVIONIQUE BARRE 1 — ON, surveiller la fumée" },
          airliner: { en: "AVIONICS BUS 1 — ON, watch for smoke", fr: "AVIONIQUE BARRE 1 — ON, surveiller la fumée" },
        },
        check: sw("avionics", true),
        optional: true,
      },
      {
        id: "restoreBus2",
        t: {
          en: "Avionics BUS 2 — ON, watch for smoke: smoke again — OFF and leave it OFF (G1000)",
          fr: "Avionique BARRE 2 — ON, surveiller la fumée : fumée à nouveau — OFF et la laisser coupée (G1000)",
        },
        check: manual,
        optional: true,
        cockpit: G1000,
      },
      {
        id: "restoreOne",
        t: {
          en: "Radios and equipment — ON one at a time, with a pause after each; switch the faulty one OFF",
          fr: "Radios et équipements — ON un par un, avec une pause après chacun ; couper celui qui est en cause",
        },
        check: manual,
        optional: true,
      },
      {
        id: "land",
        t: { en: "Land as soon as possible", fr: "Atterrir dès que possible" },
        check: manual,
      },
    ],
  },
  {
    base: "c172.cabinFire",
    title: { en: "Cabin fire", fr: "Feu en cabine" },
    summary: {
      en: "STBY BATT and master OFF, vents closed, extinguisher, then ventilate; land as soon as possible.",
      fr: "STBY BATT et général OFF, aérateurs fermés, extincteur, puis aérer ; atterrir dès que possible.",
    },
    category: "fire",
    failures: [],
    ordered: true,
    ref: pohRef("Cabin fire", "Feu en cabine"),
    items: [
      stbyOff(true),
      {
        id: "master",
        t: { en: "Master switch (ALT and BAT) — OFF", fr: "Interrupteur général (ALT et BAT) — OFF" },
        memory: true,
        check: sw("batMaster", false),
      },
      {
        id: "vents",
        t: { en: "Cabin vents — CLOSED; cabin heat and air — OFF", fr: "Aérateurs — FERMÉS ; chauffage et air — FERMÉS" },
        memory: true,
        check: sw("cabinHeat", false),
      },
      {
        id: "extinguisher",
        t: { en: "Fire extinguisher — ACTIVATE", fr: "Extincteur — UTILISER" },
        memory: true,
        check: manual,
      },
      {
        id: "ventilate",
        t: {
          en: "After the discharge: ventilate the cabin — vents OPEN, cabin heat and air ON",
          fr: "Après la décharge : aérer la cabine — aérateurs OUVERTS, chauffage et air OUVERTS",
        },
        check: manual,
      },
      {
        id: "land",
        t: { en: "Land as soon as possible; inspect for damage", fr: "Atterrir dès que possible ; inspecter les dégâts" },
        check: manual,
      },
    ],
  },
  {
    base: "c172.wingFire",
    title: { en: "Wing fire", fr: "Feu d’aile" },
    summary: {
      en: "Lights and pitot heat OFF, sideslip to keep the flames away from the tank and the cabin, land as soon as possible.",
      fr: "Feux et réchauffage pitot OFF, glissade pour écarter les flammes du réservoir et de la cabine, atterrir dès que possible.",
    },
    category: "fire",
    failures: [],
    ordered: true,
    ref: pohRef("Wing fire", "Feu d’aile"),
    items: [
      {
        id: "lights",
        t: {
          en: "Landing and taxi lights, nav lights, strobes — OFF",
          fr: "Phares d’atterrissage et de roulage, feux de navigation, strobes — OFF",
        },
        check: sw("landingLight", false),
      },
      {
        id: "pitot",
        t: { en: "Pitot heat — OFF", fr: "Réchauffage pitot — OFF" },
        check: sw("pitotHeat", false),
      },
      {
        id: "slip",
        t: {
          en: "Sideslip — keep the flames away from the fuel tank and the cabin",
          fr: "Glissade — écarter les flammes du réservoir et de la cabine",
        },
        check: manual,
      },
      {
        id: "land",
        t: {
          en: "Land as soon as possible, flaps only as needed for the final approach",
          fr: "Atterrir dès que possible, volets seulement selon le besoin en finale",
        },
        check: manual,
      },
    ],
  },
  {
    base: "c172.alternator",
    group: "c172.alternator",
    title: {
      en: "LOW VOLTS — alternator failure (G1000)",
      fr: "LOW VOLTS — panne d’alternateur (G1000)",
    },
    summary: {
      en: "MASTER ALT only OFF, then ALT and BAT ON once — never the BAT in flight. Still LOW VOLTS: ALT OFF, avionics bus 1, lights, pitot heat, bus 2 OFF (≈ 40 min of battery); the standby battery then keeps the PFD ≥ 30 min.",
      fr: "Général ALT seul OFF, puis ALT et BAT ON une fois — jamais la BAT en vol. LOW VOLTS persiste : ALT OFF, avionique barre 1, feux, réchauffage pitot, barre 2 OFF (≈ 40 min de batterie) ; la batterie de secours tient ensuite le PFD ≥ 30 min.",
    },
    category: "electrical",
    failures: ["alternator"],
    ordered: true,
    when: { cockpit: G1000 },
    ref: pohRef(
      "Low voltage annunciation (LOW VOLTS) during flight — NAV III",
      "Alarme LOW VOLTS en vol — NAV III",
    ),
    items: [
      {
        id: "altOff",
        t: {
          en: "MASTER switch (ALT only) — OFF",
          fr: "Interrupteur général (ALT seul) — OFF",
        },
        check: sw("altMaster", false),
        note: {
          en: "Only the ALT half: the BAT half feeds the G1000 — switching it off in flight darkens the PFD and the MFD.",
          fr: "Seulement la moitié ALT : la BAT alimente le G1000 — la couper en vol éteint le PFD et le MFD.",
        },
      },
      {
        id: "altCb",
        t: {
          en: "ALT FIELD circuit breaker — check IN",
          fr: "Disjoncteur ALT FIELD — vérifier ENFONCÉ",
        },
        check: manual,
      },
      {
        id: "masterOn",
        t: {
          en: "MASTER switch (ALT and BAT) — ON",
          fr: "Interrupteur général (ALT et BAT) — ON",
        },
        check: sw("altMaster", true),
      },
      {
        id: "lowVolts",
        t: {
          en: "LOW VOLTS — check OFF (still ON: continue below)",
          fr: "LOW VOLTS — vérifier ÉTEINTE (toujours allumée : poursuivre ci-dessous)",
        },
        check: manual,
      },
      {
        id: "meters",
        t: {
          en: "M BUS VOLTS — 27.5 V minimum; M BATT AMPS — charging (+)",
          fr: "M BUS VOLTS — 27,5 V mini ; M BATT AMPS — en charge (+)",
        },
        check: manual,
      },
      // ---- C172S NAV III POH, "if LOW VOLTS annunciator remains": ALTERNATOR OFF, AVIONICS BUS 1 OFF, external
      // lights OFF, pitot heat OFF, CABIN PWR 12V OFF, AVIONICS BUS 2 OFF (or as needed), land as soon as practical
      {
        id: "altOff2",
        t: {
          en: "LOW VOLTS still ON: MASTER switch (ALT only) — OFF",
          fr: "LOW VOLTS toujours allumée : interrupteur général (ALT seul) — OFF",
        },
        check: sw("altMaster", false),
      },
      {
        id: "shedBus1",
        t: { en: "AVIONICS BUS 1 — OFF (MFD, autopilot)", fr: "AVIONIQUE BARRE 1 — OFF (MFD, pilote automatique)" },
        check: sw("avionics", false),
        note: {
          en: "Shed before the battery runs down: the PFD with COM1 / NAV1 / GPS1 stays on the essential bus.",
          fr: "Délester avant que la batterie ne baisse : le PFD avec COM1 / NAV1 / GPS1 reste sur la barre essentielle.",
        },
      },
      {
        id: "shedLight",
        t: { en: "External lights — OFF: landing light", fr: "Feux extérieurs — OFF : phare" },
        check: sw("landingLight", false),
      },
      {
        id: "shedBeacon",
        t: { en: "External lights — OFF: beacon", fr: "Feux extérieurs — OFF : anticollision" },
        check: sw("beacon", false),
      },
      {
        id: "shedPitot",
        t: { en: "Pitot heat — OFF (unless in icing)", fr: "Réchauffage pitot — OFF (sauf givrage)" },
        check: sw("pitotHeat", false),
      },
      {
        id: "shed12v",
        t: { en: "CABIN PWR 12V — OFF", fr: "Prise CABIN PWR 12V — OFF" },
        check: manual,
      },
      {
        id: "shedBus2",
        t: {
          en: "AVIONICS BUS 2 — OFF (keep it ON only if the approach needs it)",
          fr: "AVIONIQUE BARRE 2 — OFF (la garder seulement si l’approche l’exige)",
        },
        check: sw("avionics2", false),
        optional: true,
        note: {
          en: "Shed like this the main battery lasts ≈ 40 min; with BUS 2 kept ON ≈ 28 min. Then the standby battery keeps the PFD and COM1 ≥ 30 min.",
          fr: "Ainsi délestée la batterie principale tient ≈ 40 min ; barre 2 gardée ≈ 28 min. Ensuite la batterie de secours tient le PFD et COM1 ≥ 30 min.",
        },
      },
      {
        id: "atc",
        t: {
          en: "ATC — advise, request the nearest suitable airport",
          fr: "ATC — prévenir, demander le terrain approprié le plus proche",
        },
        check: manual,
        optional: true,
      },
      {
        id: "land",
        t: { en: "Land as soon as practical", fr: "Atterrir dès que raisonnablement possible" },
        check: manual,
      },
    ],
  },
  {
    base: "c172.alternatorSteam",
    group: "c172.alternator",
    title: {
      en: "Low voltage — alternator failure (classic panel)",
      fr: "Basse tension — panne d’alternateur (tableau classique)",
    },
    summary: {
      en: "Avionics OFF, ALT breaker in, one master reset (both halves), avionics ON; the VOLTS light comes back: ALT OFF, shed the loads, land as soon as practical.",
      fr: "Avionique OFF, disjoncteur ALT enfoncé, un seul réarmement du général (les deux moitiés), avionique ON ; le voyant revient : ALT OFF, délester, atterrir dès que raisonnablement possible.",
    },
    category: "electrical",
    failures: ["alternator"],
    ordered: true,
    when: { cockpit: STEAM },
    ref: pohRef(
      "Low voltage annunciator illuminates during flight (steam-gauge C172S)",
      "Voyant de basse tension allumé en vol (C172S à instruments classiques)",
    ),
    items: [
      {
        id: "avOff",
        t: { en: "Avionics master switch — OFF", fr: "Interrupteur avionique — OFF" },
        check: sw("avionics", false),
      },
      {
        id: "altCb",
        t: {
          en: "Alternator circuit breaker — check IN",
          fr: "Disjoncteur d’alternateur — vérifier ENFONCÉ",
        },
        check: manual,
      },
      {
        id: "masterOff",
        t: {
          en: "Master switch (both sides) — OFF",
          fr: "Interrupteur général (les deux moitiés) — OFF",
        },
        check: sw("batMaster", false),
      },
      {
        id: "masterOn",
        t: {
          en: "Master switch (both sides) — ON (one reset only)",
          fr: "Interrupteur général (les deux moitiés) — ON (un seul réarmement)",
        },
        check: sw("altMaster", true),
      },
      {
        id: "volts",
        t: {
          en: "Low voltage annunciator — check OFF",
          fr: "Voyant de basse tension — vérifier ÉTEINT",
        },
        check: manual,
      },
      {
        id: "avOn",
        t: { en: "Avionics master switch — ON", fr: "Interrupteur avionique — ON" },
        check: sw("avionics", true),
      },
      {
        id: "altOff",
        t: {
          en: "Light back ON: alternator (ALT) — OFF",
          fr: "Le voyant se rallume : alternateur (ALT) — OFF",
        },
        check: manual,
      },
      {
        id: "shedLight",
        t: {
          en: "Non-essential equipment — OFF: landing light",
          fr: "Équipements non essentiels — OFF : phare",
        },
        check: sw("landingLight", false),
      },
      {
        id: "shed",
        t: {
          en: "Other non-essential loads — OFF (second radio, pitot heat unless in icing)",
          fr: "Autres charges non essentielles — OFF (deuxième radio, réchauffage pitot sauf givrage)",
        },
        check: manual,
        // measured by tests/systems-core.test.ts with exactly these switch positions
        note: {
          en: "On the battery alone: ≈ 16 min with the avionics ON; ≈ 40 min only with the avionics master OFF — that means no radios.",
          fr: "Sur la batterie seule : ≈ 16 min avionique ON ; ≈ 40 min seulement avionique OFF — c’est-à-dire sans radio.",
        },
      },
      {
        id: "land",
        t: { en: "Terminate the flight as soon as practical", fr: "Terminer le vol dès que raisonnablement possible" },
        check: manual,
      },
    ],
  },
  {
    base: "c172.highVolts",
    title: {
      en: "HIGH VOLTS — excessive rate of charge",
      fr: "HIGH VOLTS — charge excessive",
    },
    summary: {
      en: "MASTER ALT only OFF, reduce the electrical load at once, land as soon as practical.",
      fr: "Général ALT seul OFF, réduire immédiatement la charge électrique, atterrir dès que raisonnablement possible.",
    },
    category: "electrical",
    failures: [],
    ordered: true,
    ref: pohRef("High volts annunciator / excessive rate of charge", "Alarme HIGH VOLTS / charge excessive"),
    items: [
      // C172S NAV III POH: ALTERNATOR OFF, AVIONICS BUS 1 OFF, external lights, pitot heat, CABIN PWR 12V OFF,
      // AVIONICS BUS 2 OFF, land as soon as practical
      { id: "altOff", t: { en: "MASTER switch (ALT only) — OFF", fr: "Interrupteur général (ALT seul) — OFF" }, check: sw("altMaster", false) },
      { id: "bus1", t: { en: "AVIONICS BUS 1 — OFF", fr: "AVIONIQUE BARRE 1 — OFF" }, check: sw("avionics", false) },
      {
        id: "shed",
        t: {
          en: "External lights, pitot heat, CABIN PWR 12V — OFF",
          fr: "Feux extérieurs, réchauffage pitot, prise CABIN PWR 12V — OFF",
        },
        check: manual,
      },
      {
        id: "bus2",
        t: {
          en: "AVIONICS BUS 2 — OFF (keep it ON only if the approach needs it)",
          fr: "AVIONIQUE BARRE 2 — OFF (la garder seulement si l’approche l’exige)",
        },
        check: sw("avionics2", false),
        optional: true,
      },
      { id: "land", t: { en: "Land as soon as practical", fr: "Atterrir dès que raisonnablement possible" }, check: manual },
    ],
  },
  {
    base: "c172.lowVoltsIdle",
    title: {
      en: "LOW VOLTS below 1000 RPM (ground)",
      fr: "LOW VOLTS sous 1000 tr/min (au sol)",
    },
    summary: {
      en: "At idle the alternator may not keep up: 1000 RPM, LOW VOLTS goes out — no reset needed. Stays on: maintenance before flight.",
      fr: "Au ralenti l’alternateur peut ne pas suffire : 1000 tr/min, LOW VOLTS s’éteint — pas de réarmement. Reste allumée : maintenance avant le vol.",
    },
    category: "electrical",
    failures: [],
    ordered: true,
    ref: pohRef("LOW VOLTS below 1000 RPM (abnormal)", "LOW VOLTS sous 1000 tr/min (procédure anormale)"),
    items: [
      { id: "rpm", t: { en: "Throttle — 1000 RPM", fr: "Gaz — 1000 tr/min" }, check: manual },
      {
        id: "off",
        t: { en: "LOW VOLTS — check OFF", fr: "LOW VOLTS — vérifier ÉTEINTE" },
        check: { id: "annunciator", p: { name: "LOW VOLTS", lit: false } },
      },
      {
        id: "mx",
        t: { en: "Still ON at 1000 RPM or more: no flight — maintenance", fr: "Toujours allumée à 1000 tr/min ou plus : pas de vol — maintenance" },
        check: manual,
        optional: true,
      },
    ],
  },
  {
    base: "c172.battery",
    title: { en: "Battery failure", fr: "Panne de batterie" },
    summary: {
      en: "The bus lives on the alternator alone: do not cycle the master, reduce the loads, land as soon as practical.",
      fr: "La barre ne vit plus que par l’alternateur : ne pas couper le général, délester, atterrir dès que raisonnablement possible.",
    },
    category: "electrical",
    failures: ["battery"],
    ordered: false,
    ref: {
      en: "C172S POH section 7 — electrical system (no battery: the alternator field still needs the master ON)",
      fr: "C172S POH section 7 — circuit électrique (sans batterie, l’excitation de l’alternateur exige le général ON)",
    },
    items: [
      {
        id: "meters",
        t: {
          en: "Ammeter and bus voltage — check (no battery charge, bus on the alternator only)",
          fr: "Ampèremètre et tension — vérifier (pas de charge batterie, barre sur l’alternateur seul)",
        },
        check: manual,
      },
      {
        id: "noCycle",
        t: {
          en: "Master switch — leave ON: do not cycle it (the alternator may not come back)",
          fr: "Interrupteur général — laisser ON : ne pas le couper (l’alternateur pourrait ne pas revenir)",
        },
        // a 'do not' item: nothing to move, a callout (Done) — a switch check would credit it with no action
        check: manual,
      },
      {
        id: "shed",
        t: { en: "Non-essential loads — reduce (landing light OFF)", fr: "Charges non essentielles — délester (phare OFF)" },
        check: sw("landingLight", false),
      },
      { id: "land", t: { en: "Land as soon as practical", fr: "Atterrir dès que raisonnablement possible" }, check: manual },
    ],
  },
  {
    base: "c172.stbyBatt",
    title: {
      en: "STBY BATT annunciation (G1000)",
      fr: "Alarme STBY BATT (G1000)",
    },
    summary: {
      en: "The standby battery is feeding the essential bus: the main bus is lost. Check the master and the bus volts, shed, land as soon as practical (≥ 30 min of standby power).",
      fr: "La batterie de secours alimente la barre essentielle : la barre principale est perdue. Vérifier le général et la tension, délester, atterrir dès que raisonnablement possible (≥ 30 min de secours).",
    },
    category: "electrical",
    failures: [],
    ordered: true,
    ref: pohRef("STBY BATT annunciation (NAV III abnormal)", "Alarme STBY BATT (procédure anormale NAV III)"),
    items: [
      { id: "master", t: { en: "MASTER switch (ALT and BAT) — check ON", fr: "Interrupteur général (ALT et BAT) — vérifier ON" }, check: sw("altMaster", true) },
      { id: "volts", t: { en: "M BUS VOLTS — check", fr: "M BUS VOLTS — vérifier" }, check: manual },
      { id: "land", t: { en: "Land as soon as practical; the PFD and COM1 run ≥ 30 min on the standby battery", fr: "Atterrir dès que raisonnablement possible ; PFD et COM1 tiennent ≥ 30 min sur la batterie de secours" }, check: manual },
    ],
  },
  {
    base: "c172.carbonMonoxide",
    title: { en: "High CO level (CO LVL HIGH)", fr: "Taux de CO élevé (CO LVL HIGH)" },
    summary: {
      en: "Cabin heat OFF, cabin air and vents OPEN, land as soon as practical.",
      fr: "Chauffage FERMÉ, air et aérateurs OUVERTS, atterrir dès que raisonnablement possible.",
    },
    category: "other",
    failures: [],
    ordered: true,
    ref: pohRef("High carbon monoxide (CO) level (abnormal)", "Taux de monoxyde de carbone élevé (procédure anormale)"),
    items: [
      { id: "heat", t: { en: "Cabin heat — OFF", fr: "Chauffage cabine — FERMÉ" }, check: sw("cabinHeat", false) },
      { id: "air", t: { en: "Cabin air, vents and windows — OPEN", fr: "Air cabine, aérateurs et fenêtres — OUVERTS" }, check: manual },
      { id: "land", t: { en: "Land as soon as practical", fr: "Atterrir dès que raisonnablement possible" }, check: manual },
    ],
  },
  {
    base: "c172.vacuum",
    group: "c172.vacuum",
    title: {
      en: "Vacuum failure — partial panel (classic panel)",
      fr: "Panne de dépression — panneau partiel (tableau classique)",
    },
    summary: {
      en: "Suction low: cover the attitude and heading indicators, fly the turn coordinator, altimeter and compass, tell ATC.",
      fr: "Dépression basse : masquer horizon et conservateur de cap, piloter à l’indicateur de virage, à l’altimètre et au compas, prévenir l’ATC.",
    },
    category: "instruments",
    failures: ["vacuum", "ahrs"],
    ordered: false,
    when: { cockpit: STEAM },
    targets: { maxBankDeg: 20 },
    ref: {
      en: "C172S POH section 3 — Vacuum system failure · FAA-H-8083-15B (partial panel)",
      fr: "C172S POH section 3 — Panne du circuit de dépression · FAA-H-8083-15B (panneau partiel)",
    },
    items: [
      {
        id: "suction",
        t: { en: "Suction gauge — check", fr: "Dépressiomètre — vérifier" },
        check: manual,
      },
      {
        id: "cover",
        t: {
          en: "Attitude and heading indicators — unreliable: cover them",
          fr: "Horizon et conservateur de cap — non fiables : les masquer",
        },
        memory: true,
        check: manual,
        note: {
          en: "The cue: LOW VACUUM, suction gauge low, or the attitude indicator slowly drifting.",
          fr: "Indices : LOW VACUUM, dépressiomètre bas, ou horizon qui dérive lentement.",
        },
      },
      {
        id: "level",
        t: {
          en: "Wings level on the turn coordinator, pitch on altimeter and VSI",
          fr: "Ailes horizontales à l’indicateur de virage, assiette à l’altimètre et au vario",
        },
        memory: true,
        check: { id: "bankMax", p: { max: 10, holdS: 5 } },
        withinS: 30,
        // a standard-rate turn in progress may be finished on the turn coordinator: late costs points, never the drill
        safety: false,
      },
      {
        id: "compass",
        t: {
          en: "Heading — magnetic compass and timed turns at standard rate",
          fr: "Cap — compas magnétique et virages chronométrés au taux standard",
        },
        check: manual,
      },
      {
        id: "atc",
        t: {
          en: "ATC — advise, request no-gyro vectors or VMC",
          fr: "ATC — prévenir, demander un guidage sans gyro ou des conditions VMC",
        },
        check: manual,
      },
      {
        id: "land",
        t: {
          en: "Land as soon as practical, in VMC if possible",
          fr: "Atterrir dès que raisonnablement possible, en VMC si possible",
        },
        check: manual,
      },
    ],
  },
  {
    base: "c172.vacuumG1000",
    group: "c172.vacuum",
    title: {
      en: "LOW VACUUM (G1000) — standby attitude unreliable",
      fr: "LOW VACUUM (G1000) — horizon de secours non fiable",
    },
    summary: {
      en: "Only the standby attitude indicator is vacuum-driven: do not use it; the PFD (electric AHRS) is unaffected — fly on, land as soon as practical in IMC.",
      fr: "Seul l’horizon de secours est entraîné par la dépression : ne plus l’utiliser ; le PFD (AHRS électrique) n’est pas touché — poursuivre, atterrir dès que raisonnablement possible en IMC.",
    },
    category: "instruments",
    failures: ["vacuum"],
    ordered: false,
    when: { cockpit: G1000 },
    ref: pohRef("Low vacuum annunciation (NAV III abnormal)", "Alarme LOW VACUUM (procédure anormale NAV III)"),
    items: [
      {
        id: "suction",
        t: { en: "Vacuum indication (EIS VAC) — check", fr: "Dépression (VAC à l’EIS) — vérifier" },
        check: manual,
      },
      {
        id: "standby",
        t: {
          en: "Standby attitude indicator — do NOT use (it will drift and topple)",
          fr: "Horizon de secours — ne PAS l’utiliser (il va dériver puis basculer)",
        },
        check: manual,
        note: {
          en: "Do not cover the PFD attitude: the AHRS is electric. Covering it would leave you on partial panel for nothing.",
          fr: "Ne masquez pas l’horizon du PFD : l’AHRS est électrique. Le masquer vous mettrait en panneau partiel pour rien.",
        },
      },
      {
        id: "fly",
        t: {
          en: "Attitude — continue on the PFD",
          fr: "Assiette — poursuivre au PFD",
        },
        check: { id: "bankMax", p: { max: 30, holdS: 5 } },
      },
      {
        id: "land",
        t: {
          en: "In IMC: no standby attitude left — land as soon as practical",
          fr: "En IMC : plus d’horizon de secours — atterrir dès que raisonnablement possible",
        },
        check: manual,
      },
    ],
  },
  {
    base: "c172.ahrs",
    title: {
      en: "AHRS failure (G1000) — attitude and heading red X",
      fr: "Panne AHRS (G1000) — croix rouge assiette et cap",
    },
    summary: {
      en: "Fly the standby attitude indicator, heading on the magnetic compass, the autopilot is lost; tell ATC, land as soon as practical.",
      fr: "Piloter à l’horizon de secours, cap au compas magnétique, le pilote automatique est perdu ; prévenir l’ATC, atterrir dès que raisonnablement possible.",
    },
    category: "instruments",
    failures: ["ahrs"],
    ordered: false,
    when: { cockpit: G1000 },
    targets: { maxBankDeg: 20 },
    ref: pohRef("Attitude and heading reference system (AHRS) failure (NAV III abnormal)", "Panne de la centrale AHRS (procédure anormale NAV III)"),
    items: [
      {
        id: "standby",
        t: {
          en: "Standby attitude indicator — USE: wings level, pitch",
          fr: "Horizon de secours — UTILISER : ailes à plat, assiette",
        },
        memory: true,
        check: { id: "bankMax", p: { max: 15, holdS: 5 } },
        withinS: 30,
        safety: false,
        note: {
          en: "The standby attitude indicator, airspeed and altimeter sit on the panel apart from the screens.",
          fr: "L’horizon, l’anémomètre et l’altimètre de secours sont sur le tableau, hors des écrans.",
        },
      },
      // C172S NAV III POH (ADC failure / AHRS failure): ADC / AHRS circuit breaker — CHECK IN, reset one time only
      {
        id: "cb",
        t: {
          en: "ADC / AHRS circuit breakers — check IN (reset one time only)",
          fr: "Disjoncteurs ADC / AHRS — vérifier ENFONCÉS (un seul réarmement)",
        },
        check: manual,
        cockpit: G1000,
      },
      {
        id: "compass",
        t: {
          en: "Heading — magnetic compass (the HSI is lost)",
          fr: "Cap — compas magnétique (le HSI est perdu)",
        },
        check: manual,
      },
      {
        id: "ap",
        t: {
          en: "Autopilot — lost: hand-fly",
          fr: "Pilote automatique — perdu : piloter à la main",
        },
        check: { id: "ap", p: { engaged: false } },
      },
      {
        id: "atc",
        t: {
          en: "ATC — advise, request vectors or VMC",
          fr: "ATC — prévenir, demander un guidage ou des conditions VMC",
        },
        check: manual,
      },
      {
        id: "land",
        t: {
          en: "Land as soon as practical, in VMC if possible",
          fr: "Atterrir dès que raisonnablement possible, en VMC si possible",
        },
        check: manual,
      },
    ],
  },
  {
    base: "c172.pitot",
    title: {
      en: "Pitot blockage — unreliable airspeed",
      fr: "Pitot obstrué — vitesse non fiable",
    },
    summary: {
      en: "Airspeed unreliable: fly pitch and power, pitot heat ON, cross-check the GPS ground speed, tell ATC.",
      fr: "Vitesse non fiable : piloter assiette-puissance, réchauffage pitot ON, recouper avec la vitesse sol GPS, prévenir l’ATC.",
    },
    category: "instruments",
    failures: ["pitotBlocked"],
    ordered: false,
    ref: {
      en: "C172S POH section 3 · FAA-H-8083-15B (pitot-static failures)",
      fr: "C172S POH section 3 · FAA-H-8083-15B (pannes pitot-statique)",
    },
    items: [
      {
        id: "pitchPower",
        t: {
          en: "Airspeed unreliable — fly pitch and power (known attitude and RPM)",
          fr: "Vitesse non fiable — piloter assiette-puissance (assiette et régime connus)",
        },
        memory: true,
        check: manual,
        note: {
          en: "A blocked pitot (ram and drain) makes the ASI behave like an altimeter: it lies in climbs and descents.",
          fr: "Un pitot bouché (prise et purge) fait réagir l’anémomètre comme un altimètre : il ment en montée et en descente.",
        },
      },
      {
        id: "heat",
        t: { en: "Pitot heat — ON", fr: "Réchauffage pitot — ON" },
        check: sw("pitotHeat", true),
        note: {
          en: "It clears ice, not an insect nest or a blocked drain: expect it may not help.",
          fr: "Il fait fondre la glace, pas un nid d’insectes ni une purge bouchée : il peut ne rien changer.",
        },
      },
      {
        id: "cross",
        t: {
          en: "Airspeed — cross-check with the GPS ground speed and the wind",
          fr: "Vitesse — recouper avec la vitesse sol GPS et le vent",
        },
        check: manual,
      },
      {
        id: "atc",
        t: {
          en: "ATC — advise if the airspeed stays unreliable",
          fr: "ATC — prévenir si la vitesse reste douteuse",
        },
        check: manual,
        optional: true,
      },
    ],
  },
  {
    base: "c172.icing",
    title: {
      en: "Inadvertent icing encounter",
      fr: "Givrage rencontré par inadvertance",
    },
    summary: {
      en: "Pitot heat ON and get out of the icing at once (turn back or change altitude); cabin heat and defrost; nearest airport; flaps up, 65–75 KIAS, no go-around.",
      fr: "Réchauffage pitot ON et sortir du givrage immédiatement (demi-tour ou changement d’altitude) ; chauffage et désembuage ; terrain le plus proche ; volets rentrés, 65–75 kt, pas de remise de gaz.",
    },
    category: "instruments",
    failures: ["pitotIcing"],
    ordered: false,
    ref: pohRef("Inadvertent icing encounter during flight", "Givrage rencontré par inadvertance en vol"),
    items: [
      {
        id: "heat",
        t: { en: "Pitot heat — ON", fr: "Réchauffage pitot — ON" },
        memory: true,
        check: sw("pitotHeat", true),
        withinS: 30,
        safety: false,
      },
      {
        id: "exit",
        t: {
          en: "Turn back or change altitude — to air less conducive to icing (warmer, out of cloud)",
          fr: "Faire demi-tour ou changer d’altitude — vers un air moins givrant (plus chaud, hors nuage)",
        },
        memory: true,
        check: manual,
        note: {
          en: "This is the cure: the C172S is not approved for flight in known icing, and pitot heat protects one probe only.",
          fr: "C’est le remède : le C172S n’est pas certifié pour le givrage connu, et le réchauffage ne protège que le pitot.",
        },
      },
      {
        id: "airspeed",
        t: {
          en: "Airspeed unreliable meanwhile — fly pitch and power",
          fr: "Vitesse douteuse en attendant — piloter assiette-puissance",
        },
        check: manual,
      },
      {
        id: "cabin",
        t: {
          en: "Cabin heat — FULL; defroster — OUT; cabin air for the maximum defrost",
          fr: "Chauffage cabine — PLEIN ; désembuage — TIRÉ ; air réglé pour un désembuage maxi",
        },
        check: sw("cabinHeat", true),
      },
      {
        id: "induction",
        t: {
          en: "Watch for induction (air filter) icing: hold the RPM with the throttle, adjust the mixture",
          fr: "Surveiller le givrage du filtre à air : tenir le régime aux gaz, ajuster le mélange",
        },
        check: manual,
        optional: true,
      },
      {
        id: "direct",
        t: {
          en: "Nearest airport — direct-to (off-airport site if the build-up is very fast)",
          fr: "Terrain le plus proche — Direct-To (site hors aérodrome si l’accrétion est très rapide)",
        },
        check: { id: "directTo", p: { ident: "*nearest" } },
      },
      {
        id: "approach",
        t: {
          en: "Ice on the leading edges: flaps UP (tailplane stall), approach 65–75 KIAS, land level, avoid a go-around",
          fr: "Glace sur les bords d’attaque : volets RENTRÉS (décrochage de l’empennage), approche 65–75 kt, toucher à plat, éviter la remise de gaz",
        },
        check: manual,
      },
      {
        id: "atc",
        t: { en: "ATC — advise, request a lower or warmer level", fr: "ATC — prévenir, demander un niveau plus bas ou plus chaud" },
        check: manual,
        optional: true,
      },
    ],
  },
  {
    base: "c172.static",
    title: { en: "Static port blocked", fr: "Prise statique obstruée" },
    summary: {
      en: "Frozen altimeter, VSI at zero: alternate static ON, vents closed, expect small errors.",
      fr: "Altimètre figé, vario à zéro : statique de secours ON, aérations fermées, petites erreurs attendues.",
    },
    category: "instruments",
    failures: ["staticBlocked"],
    ordered: true,
    ref: pohRef("Static source blockage", "Obstruction de la prise statique"),
    items: [
      {
        id: "alt",
        t: {
          en: "Alternate static air — ON (pull)",
          fr: "Prise statique de secours — OUVERTE (tirée)",
        },
        check: sw("altStatic", true),
        withinS: 60,
        note: {
          en: "A short jump of the VSI when you open it is normal.",
          fr: "Un bref saut du vario à l’ouverture est normal.",
        },
      },
      {
        id: "vents",
        t: {
          en: "Cabin vents and windows — closed",
          fr: "Aérations et fenêtres — fermées",
        },
        check: manual,
      },
      {
        id: "errors",
        t: {
          en: "Altimeter and airspeed — apply the alternate static correction (POH section 5)",
          fr: "Altimètre et vitesse — appliquer la correction statique de secours (POH section 5)",
        },
        check: manual,
      },
      {
        id: "cross",
        t: {
          en: "Altitude — cross-check with GPS altitude or ATC",
          fr: "Altitude — recouper avec l’altitude GPS ou l’ATC",
        },
        check: manual,
        optional: true,
      },
    ],
  },
  {
    base: "c172.flaps",
    title: {
      en: "Flaps failure (no-flap landing)",
      fr: "Panne de volets (atterrissage sans volets)",
    },
    summary: {
      en: "Check the breaker once, plan a longer final at 65–75 KIAS and a longer landing roll.",
      fr: "Vérifier le disjoncteur une fois, finale plus longue à 65–75 kt, roulage plus long.",
    },
    category: "flight",
    failures: ["flaps"],
    ordered: false,
    // no POH section 3 checklist for a flap failure: the speeds are the section 4 normal landing, flaps up
    ref: {
      en: "C172S POH section 4 — normal landing, flaps up",
      fr: "C172S POH section 4 — atterrissage normal, volets rentrés",
    },
    items: [
      {
        id: "cb",
        t: {
          en: "Flaps circuit breaker — check (one reset at most)",
          fr: "Disjoncteur volets — vérifier (un réarmement au plus)",
        },
        check: manual,
      },
      {
        id: "position",
        t: {
          en: "Flap position — check visually",
          fr: "Position des volets — vérifier visuellement",
        },
        check: manual,
      },
      {
        id: "speed",
        t: {
          en: "Final — 65–75 KIAS flaps up, flatter and longer",
          fr: "Finale — 65–75 kt volets rentrés, plus plate et plus longue",
        },
        check: { id: "ias", p: { min: 65, max: 75, holdS: 10 } },
      },
      {
        id: "runway",
        t: {
          en: "Runway — check the longer landing distance",
          fr: "Piste — vérifier la distance d’atterrissage plus longue",
        },
        check: manual,
        note: {
          en: "Flaps up, the landing distance grows by roughly a third: check section 5.",
          fr: "Sans volets, la distance d’atterrissage augmente d’environ un tiers : voir la section 5.",
        },
      },
      {
        id: "landed",
        t: { en: "Landed and stopped", fr: "Posé et arrêté" },
        check: { id: "landed" },
        optional: true,
      },
    ],
  },
  {
    base: "c172.trimRunaway",
    title: {
      en: "Electric trim runaway",
      fr: "Emballement du trim électrique",
    },
    summary: {
      en: "Hold the wheel, AP/trim disconnect, pull the trim/AP breaker, retrim by hand.",
      fr: "Tenir le manche, débrayer PA/trim, tirer le disjoncteur trim/PA, compenser à la main.",
    },
    category: "flight",
    failures: ["trimRunaway"],
    ordered: true,
    ref: {
      en: "C172S POH supplement (autopilot) — electric trim malfunction",
      fr: "C172S POH supplément (pilote automatique) — panne du trim électrique",
    },
    items: [
      {
        id: "hold",
        t: {
          en: "Control wheel — hold firmly, keep the attitude",
          fr: "Manche — tenir fermement, garder l’assiette",
        },
        memory: true,
        check: { id: "pitchAtt", p: { min: -8, max: 10, holdS: 3 } },
      },
      {
        id: "disc",
        t: {
          en: "AP DISC / TRIM INTR switch — press and hold",
          fr: "Bouton AP DISC / TRIM INTR — appuyer et maintenir",
        },
        memory: true,
        // a callout: the runaway itself drops the autopilot, an 'autopilot disengaged' check would credit nothing
        check: manual,
      },
      {
        id: "cb",
        t: {
          en: "Trim / autopilot circuit breaker — PULL",
          fr: "Disjoncteur trim / PA — TIRER",
        },
        memory: true,
        check: sw("trimCb", false),
        withinS: 15,
      },
      {
        id: "retrim",
        t: {
          en: "Manual trim wheel — retrim",
          fr: "Roulette de trim manuel — recompenser",
        },
        check: manual,
      },
      {
        id: "land",
        t: {
          en: "Do not reset the breaker; land as soon as practical",
          fr: "Ne pas réenclencher le disjoncteur ; atterrir dès que raisonnablement possible",
        },
        check: manual,
      },
    ],
  },
  {
    base: "c172.lostComms",
    group: "c172.lostComms",
    title: {
      en: "Radio failure in IFR — FAA rules (14 CFR 91.185)",
      fr: "Panne radio en IFR — règles FAA (14 CFR 91.185)",
    },
    summary: {
      en: "VMC: stay VMC and land as soon as practicable. IMC: squawk 7600, route AVE-F, altitude the highest of MEA / expected / assigned, the clearance-limit rule.",
      fr: "VMC : rester VMC et atterrir dès que raisonnablement possible. IMC : 7600, route AVE-F, altitude la plus haute de MEA / prévue / assignée, la règle de la limite de clairance.",
    },
    category: "comms",
    failures: ["comms"],
    ordered: false,
    when: { region: "faa" },
    ref: {
      en: "14 CFR 91.185 · AIM 6-4-1 (US airspace)",
      fr: "14 CFR 91.185 · AIM 6-4-1 (espace aérien des États-Unis)",
    },
    items: [
      {
        id: "vmc",
        t: {
          en: "VMC? — YES: remain VMC and land as soon as practicable; NO: the IFR rules below",
          fr: "VMC ? — OUI : rester VMC et atterrir dès que raisonnablement possible ; NON : la règle IFR ci-dessous",
        },
        memory: true,
        check: manual,
        note: {
          en: "91.185(b) is the first decision, not a bonus.",
          fr: "Le 91.185(b) est la première décision, pas un bonus.",
        },
      },
      {
        id: "check",
        t: {
          en: "Radios — volume, squelch, frequency, headset and PTT; try COM2",
          fr: "Radios — volume, squelch, fréquence, casque et alternat ; essayer COM2",
        },
        check: manual,
      },
      {
        id: "squawk",
        t: { en: "Transponder — 7600", fr: "Transpondeur — 7600" },
        memory: true,
        check: { id: "xpdr", p: { code: "7600" } },
      },
      {
        id: "blind",
        t: {
          en: "Transmit blind — callsign, position, intentions (also on 121.5); listen on the NAV (VOR voice)",
          fr: "Émettre en l’air — indicatif, position, intentions (aussi sur 121,5) ; écouter sur le NAV (voix VOR)",
        },
        check: manual,
      },
      {
        id: "route",
        t: {
          en: "Route — AVE-F: Assigned, Vectored (direct to the fix), Expected, Filed",
          fr: "Route — AVE-F : assignée (Assigned), guidée (direct vers le point), prévue (Expected), déposée (Filed)",
        },
        check: manual,
      },
      {
        id: "altitude",
        t: {
          en: "Altitude — the highest of MEA, Expected and Assigned, segment by segment",
          fr: "Altitude — la plus haute de la MEA, de l’altitude prévue et de l’assignée, tronçon par tronçon",
        },
        check: manual,
      },
      {
        id: "limit",
        t: {
          en: "Clearance limit — an approach fix: descend and approach at the EFC, else the ETA; not one: leave it at the EFC (else on arrival), then approach at the ETA",
          fr: "Limite de clairance — point d’approche : descente et approche à l’EFC, sinon à l’ETA ; sinon : la quitter à l’EFC (ou à l’arrivée), puis approche à l’ETA",
        },
        check: manual,
        note: {
          en: "91.185(c)(3)(i) and (ii). The ETA is the one from the filed or amended time en route.",
          fr: "91.185(c)(3)(i) et (ii). L’ETA est celle de la durée de vol déposée ou modifiée.",
        },
      },
    ],
  },
  {
    base: "c172.lostCommsSera",
    group: "c172.lostComms",
    title: {
      // ICAO Annex 2 is the common rule; EASA states write it as SERA.14083, others (Canada, Australia…) in their
      // own AIP with local differences: the title names the ICAO rule, the ref says where to check
      en: "Radio failure in IFR — ICAO Annex 2 rules (EASA: SERA.14083)",
      fr: "Panne radio en IFR — règles OACI annexe 2 (EASA : SERA.14083)",
    },
    summary: {
      en: "VMC: stay VMC, land at the nearest suitable aerodrome. IMC: 7600, last level and speed for 7 min (20 min without radar), then the flight plan; descend at the EAT / ETA, land within 30 min.",
      fr: "VMC : rester VMC, atterrir sur l’aérodrome approprié le plus proche. IMC : 7600, dernier niveau et vitesse 7 min (20 sans radar), puis le plan de vol ; descente à l’EAT / ETA.",
    },
    category: "comms",
    failures: ["comms"],
    ordered: false,
    when: { region: "icao" },
    ref: {
      en: "ICAO Annex 2 3.6.5.2.2 · SERA.14083 (EASA states) · outside Europe the national AIP prevails (Canada, Australia… differ) · France: ENR 1.6",
      fr: "OACI annexe 2 3.6.5.2.2 · SERA.14083 (États EASA) · hors d’Europe l’AIP nationale prévaut (Canada, Australie… diffèrent) · France : ENR 1.6",
    },
    items: [
      {
        id: "vmc",
        t: {
          en: "VMC? — YES: continue in VMC, land at the nearest suitable aerodrome and report the arrival to ATC; NO: the IFR rules below",
          fr: "VMC ? — OUI : poursuivre en VMC, atterrir sur l’aérodrome approprié le plus proche et signaler l’arrivée à l’ATC ; NON : la règle IFR ci-dessous",
        },
        memory: true,
        check: manual,
      },
      {
        id: "check",
        t: {
          en: "Radios — volume, squelch, frequency, headset and PTT; try COM2",
          fr: "Radios — volume, squelch, fréquence, casque et alternat ; essayer COM2",
        },
        check: manual,
      },
      {
        id: "squawk",
        t: { en: "Transponder — 7600", fr: "Transpondeur — 7600" },
        memory: true,
        check: { id: "xpdr", p: { code: "7600" } },
      },
      {
        id: "blind",
        t: {
          en: "Transmit blind — callsign, position, intentions (also on 121.5)",
          fr: "Émettre en l’air — indicatif, position, intentions (aussi sur 121,5)",
        },
        check: manual,
      },
      {
        id: "timer",
        t: {
          en: "Timer — start: the last assigned speed and level (or the minimum flight altitude if higher) for 7 min",
          fr: "Chronomètre — démarrer : niveau et vitesse assignés (ou altitude minimale si plus haute) pendant 7 min",
        },
        check: { id: "timer" },
        note: {
          en: "7 min under radar, 20 min without (after the last compulsory report). The 7 min start at the latest of: the level reached, 7600 set, a compulsory report missed.",
          fr: "7 min sous surveillance radar, 20 min sans (après le dernier compte rendu obligatoire). Les 7 min partent du plus tardif : niveau atteint, 7600 affiché, compte rendu obligatoire manqué.",
        },
      },
      {
        id: "filed",
        t: {
          en: "Then — level and speed of the filed flight plan",
          fr: "Ensuite — niveau et vitesse du plan de vol déposé",
        },
        check: manual,
      },
      {
        id: "route",
        t: {
          en: "Route — the current flight plan; vectored: rejoin it no later than the next significant point",
          fr: "Route — celle du plan de vol en vigueur ; guidé radar : la rejoindre au plus tard au prochain point significatif",
        },
        check: manual,
      },
      {
        id: "fix",
        t: {
          en: "Proceed to the destination aid or fix; hold there if needed",
          fr: "Rejoindre la balise ou le point de l’aérodrome de destination ; attendre si nécessaire",
        },
        check: manual,
      },
      {
        id: "descent",
        t: {
          en: "Descent — at the expected approach time (EAT) received, else at the ETA",
          fr: "Descente — à l’heure d’approche prévue (EAT) reçue, sinon à l’heure estimée d’arrivée (ETA)",
        },
        check: manual,
      },
      {
        id: "approach",
        t: {
          en: "Normal instrument approach; land within 30 min of the ETA or the EAT if possible",
          fr: "Approche aux instruments normale ; atterrir si possible dans les 30 min suivant l’ETA ou l’EAT",
        },
        check: manual,
      },
    ],
  },
  {
    base: "c172.lostCommsVfr",
    title: {
      en: "Radio failure in VFR",
      fr: "Panne radio en VFR",
    },
    summary: {
      en: "Squawk 7600, stay VMC, land at the nearest suitable aerodrome by the published radio-failure procedure or light signals, report.",
      fr: "7600, rester VMC, atterrir sur l’aérodrome approprié le plus proche selon la procédure panne radio publiée ou les signaux lumineux, rendre compte.",
    },
    category: "comms",
    failures: [],
    ordered: false,
    ref: {
      en: "SERA.14083 (VFR) · AIP France ENR 1.1 · AIM 6-4-1 / 4-3-13 (light signals)",
      fr: "SERA.14083 (VFR) · AIP France ENR 1.1 · AIM 6-4-1 / 4-3-13 (signaux lumineux)",
    },
    items: [
      { id: "check", t: { en: "Radios — volume, squelch, frequency, headset and PTT; try COM2", fr: "Radios — volume, squelch, fréquence, casque et alternat ; essayer COM2" }, check: manual },
      { id: "squawk", t: { en: "Transponder — 7600", fr: "Transpondeur — 7600" }, memory: true, check: { id: "xpdr", p: { code: "7600" } } },
      { id: "blind", t: { en: "Transmit blind — position and intentions", fr: "Émettre en l’air — position et intentions" }, check: manual },
      { id: "vmc", t: { en: "Remain VMC; land at the nearest suitable aerodrome", fr: "Rester VMC ; atterrir sur l’aérodrome approprié le plus proche" }, check: manual },
      {
        id: "join",
        t: {
          en: "Join by the published radio-failure procedure (overhead join), watch for light signals from the tower",
          fr: "Intégrer selon la procédure panne radio publiée (verticale), surveiller les signaux lumineux de la tour",
        },
        check: manual,
      },
      { id: "report", t: { en: "After landing — report to ATC by telephone", fr: "Après l’atterrissage — prévenir l’ATC par téléphone" }, check: manual },
    ],
  },
  {
    base: "c172.xpdr",
    title: { en: "Transponder failure", fr: "Panne de transpondeur" },
    summary: {
      en: "Check the mode and the breaker, tell ATC, keep out of airspace that requires a transponder.",
      fr: "Vérifier le mode et le disjoncteur, prévenir l’ATC, éviter les espaces à transpondeur obligatoire.",
    },
    category: "avionics",
    failures: ["xpdr"],
    ordered: false,
    ref: {
      en: "14 CFR 91.215 · AIM 4-1-20",
      fr: "SERA.13001 · SERA.6005 (TMZ)",
    },
    items: [
      {
        id: "mode",
        t: {
          en: "Transponder — mode ALT, code; cycle it OFF / ON",
          fr: "Transpondeur — mode ALT, code ; le couper / rallumer",
        },
        check: manual,
      },
      {
        id: "cb",
        t: {
          en: "Transponder circuit breaker — check",
          fr: "Disjoncteur transpondeur — vérifier",
        },
        check: manual,
      },
      {
        id: "atc",
        t: {
          en: "ATC — advise “transponder unserviceable”",
          fr: "ATC — prévenir « transpondeur en panne »",
        },
        check: manual,
      },
      {
        id: "airspace",
        t: {
          en: "Airspace requiring a transponder — get a clearance or avoid it",
          fr: "Espaces à transpondeur obligatoire (TMZ…) — obtenir l’autorisation ou les éviter",
        },
        check: manual,
      },
    ],
  },
  {
    base: "c172.gpsLoss",
    title: { en: "GPS integrity lost (IFR)", fr: "Perte d’intégrité GPS (IFR)" },
    summary: {
      en: "LOI / INTEG: GPS no longer usable — navigate on VOR / LOC, tell ATC “unable RNAV”.",
      fr: "LOI / INTEG : GPS inutilisable — naviguer au VOR / LOC, annoncer « unable RNAV » à l’ATC.",
    },
    category: "avionics",
    failures: ["gps"],
    ordered: false,
    ref: { en: "Garmin G1000 Pilot’s Guide · AIM 1-1-17", fr: "Garmin G1000 Pilot’s Guide · AIM 1-1-17" },
    items: [
      { id: "recognise", t: { en: "Annunciation — LOI / INTEG: GPS not usable", fr: "Annonce — LOI / INTEG : GPS inutilisable" }, check: manual },
      { id: "cdi", t: { en: "CDI — NAV1 (VOR / LOC)", fr: "Source CDI — NAV1 (VOR / LOC)" }, check: { id: "cdi", p: { value: "NAV1" } } },
      { id: "atc", t: { en: "ATC — advise “unable RNAV”, request vectors", fr: "ATC — annoncer « unable RNAV », demander un guidage" }, check: manual },
      { id: "approach", t: { en: "Approach — brief a conventional one (ILS, LOC, VOR)", fr: "Approche — briefer une approche conventionnelle (ILS, LOC, VOR)" }, check: manual },
      { id: "faf", t: { en: "On an RNAV approach after the FAF with LOI: MISSED APPROACH", fr: "En approche RNAV après le FAF avec LOI : REMISE DE GAZ" }, check: manual, optional: true },
    ],
  },
  {
    base: "c172.nav1",
    title: { en: "NAV1 receiver failure (IFR)", fr: "Panne du récepteur NAV1 (IFR)" },
    summary: {
      en: "NAV flag or no ident: fly the CDI on NAV2 or the GPS, tell ATC if the clearance can no longer be flown.",
      fr: "Drapeau NAV ou pas d’indicatif : passer le CDI sur NAV2 ou le GPS, prévenir l’ATC si la clairance n’est plus réalisable.",
    },
    category: "avionics",
    failures: ["nav1"],
    ordered: false,
    ref: {
      en: "FAA Instrument Flying Handbook — navigation systems · 14 CFR 91.187",
      fr: "FAA Instrument Flying Handbook — systèmes de navigation · compte rendu de panne à l’ATC",
    },
    items: [
      {
        id: "recognise",
        t: {
          en: "NAV1 — check frequency, Morse ident and the CDI flag",
          fr: "NAV1 — vérifier la fréquence, l’indicatif morse et le drapeau du CDI",
        },
        check: manual,
      },
      {
        id: "cdi",
        t: { en: "CDI — NAV2 or GPS", fr: "Source CDI — NAV2 ou GPS" },
        check: { id: "cdi", p: { value: "NAV2|GPS" } },
        note: {
          en: "Tune NAV2 to the same aid and set the course before you switch the CDI.",
          fr: "Afficher le même moyen sur NAV2 et le cap avant de basculer le CDI.",
        },
      },
      {
        id: "atc",
        t: {
          en: "ATC — report the failure (“NAV1 unserviceable”), request vectors if needed",
          fr: "ATC — signaler la panne (« NAV1 en panne »), demander un guidage si besoin",
        },
        check: manual,
      },
      {
        id: "approach",
        t: {
          en: "Approach — only one the remaining equipment allows",
          fr: "Approche — seulement celle que l’équipement restant permet",
        },
        check: manual,
      },
    ],
  },
  {
    base: "c172.airData",
    title: {
      en: "Air data failure (airspeed, altimeter, VSI)",
      fr: "Panne anémo-baro (anémomètre, altimètre, vario)",
    },
    summary: {
      en: "Red X on the tapes: fly pitch and power, the standby airspeed and altimeter, hand-fly; pitot heat and alternate static only if the standby instruments read wrong too.",
      fr: "Croix rouge sur les bandeaux : assiette-puissance, anémomètre et altimètre de secours, pilotage à la main ; réchauffage pitot et statique de secours seulement si le secours est faux aussi.",
    },
    category: "instruments",
    failures: ["airData"],
    ordered: false,
    targets: { maxBankDeg: 30 },
    ref: {
      en: "C172S NAV III POH section 3 — air data computer (ADC) failure · FAA-H-8083-15B (pitot-static failures)",
      fr: "C172S NAV III POH section 3 — panne du calculateur anémo-baro (ADC) · FAA-H-8083-15B (pannes pitot-statique)",
    },
    items: [
      {
        id: "pitchPower",
        t: {
          en: "Fly pitch and power — known attitude and RPM for the phase",
          fr: "Piloter assiette-puissance — assiette et régime connus pour la phase",
        },
        memory: true,
        check: manual,
        note: {
          en: "The attitude indicator is still good: wings level, the known pitch and power.",
          fr: "L’horizon reste fiable : ailes à plat, assiette et puissance connues.",
        },
      },
      // C172S NAV III POH (ADC failure / AHRS failure): ADC / AHRS circuit breaker — CHECK IN, reset one time only
      {
        id: "cb",
        t: {
          en: "ADC / AHRS circuit breakers — check IN (reset one time only)",
          fr: "Disjoncteurs ADC / AHRS — vérifier ENFONCÉS (un seul réarmement)",
        },
        check: manual,
        cockpit: G1000,
      },
      {
        id: "standby",
        t: {
          en: "Standby airspeed indicator and altimeter — USE (check the standby altimeter setting)",
          fr: "Anémomètre et altimètre de secours — UTILISER (vérifier le calage de l’altimètre de secours)",
        },
        // the simulator's standby altimeter shares the PFD's baro setting (no Kollsman knob of its own yet): a check,
        // not a setting the pilot could perform
        check: manual,
        cockpit: G1000,
      },
      {
        id: "ap",
        t: {
          en: "Autopilot — lost with the air data: hand-fly",
          fr: "Pilote automatique — perdu avec l’anémo-baro : piloter à la main",
        },
        check: { id: "ap", p: { engaged: false } },
      },
      {
        id: "heat",
        t: {
          en: "Standby instruments wrong too (blockage): pitot heat — ON",
          fr: "Secours faux aussi (obstruction) : réchauffage pitot — ON",
        },
        check: sw("pitotHeat", true),
        optional: true,
      },
      {
        id: "alt",
        t: {
          en: "… and alternate static air — ON (pull)",
          fr: "… et prise statique de secours — OUVERTE (tirée)",
        },
        check: sw("altStatic", true),
        optional: true,
      },
      {
        id: "cross",
        t: {
          en: "GPS altitude and ground speed — cross-check",
          fr: "Altitude et vitesse sol GPS — recouper",
        },
        check: manual,
      },
      {
        id: "atc",
        t: {
          en: "ATC — advise, Mode C altitude may be wrong",
          fr: "ATC — prévenir, l’altitude Mode C peut être fausse",
        },
        check: manual,
      },
      {
        id: "land",
        t: {
          en: "Land as soon as practical, in VMC if possible",
          fr: "Atterrir dès que raisonnablement possible, en VMC si possible",
        },
        check: manual,
      },
    ],
  },
  {
    base: "c172.gsFail",
    title: { en: "Glideslope failure on an ILS", fr: "Panne du glide sur un ILS" },
    summary: {
      en: "GS flag: already below the LOC MDA, go around; otherwise continue as a localizer approach to the LOC MDA.",
      fr: "Drapeau GS : déjà sous la MDA LOC, remise de gaz ; sinon poursuivre en approche LOC jusqu’à la MDA LOC.",
    },
    category: "avionics",
    failures: ["gs"],
    ordered: true,
    ref: { en: "FAA Instrument Procedures Handbook — ILS / LOC approaches", fr: "FAA Instrument Procedures Handbook — approches ILS / LOC" },
    items: [
      {
        id: "below",
        t: {
          // a decision that always applies (a Done answers it whichever way it goes), not a conditional action a
          // pilot above the MDA would have to 'do'
          en: "Position vs the LOC MDA — DECIDE: above it, continue as a LOC; below it (or LOC minima not briefed), GO AROUND",
          fr: "Position par rapport à la MDA LOC — DÉCIDER : au-dessus, poursuivre en LOC ; en dessous (ou minima LOC non briefés), REMISE DE GAZ",
        },
        memory: true,
        check: manual,
        note: {
          en: "Close to the DA you are usually below the LOC MDA: the only safe answer is the missed approach.",
          fr: "Près de la DA on est en général sous la MDA LOC : la seule réponse sûre est la remise de gaz.",
        },
      },
      { id: "recognise", t: { en: "GS flag — recognise: no vertical guidance", fr: "Drapeau GS — identifier : plus de guidage vertical" }, check: manual },
      { id: "mins", t: { en: "Minimums — set the LOC MDA", fr: "Minima — afficher la MDA LOC" }, check: manual },
      { id: "steps", t: { en: "Descend by the LOC step-down fixes, never below the MDA", fr: "Descendre selon les paliers LOC, jamais sous la MDA" }, check: manual },
      { id: "map", t: { en: "No runway in sight at the MAP: go around", fr: "Piste non en vue au MAPt : remise de gaz" }, check: manual },
    ],
  },
  {
    base: "c172.apFail",
    title: { en: "Autopilot failure", fr: "Panne du pilote automatique" },
    summary: {
      en: "Disconnect, hand-fly and retrim, then reduce your workload and tell ATC if needed.",
      fr: "Débrayer, piloter à la main et recompenser, puis réduire la charge de travail et prévenir l’ATC si besoin.",
    },
    category: "avionics",
    failures: ["ap"],
    ordered: true,
    ref: { en: "Autopilot supplement (POH section 9)", fr: "Supplément pilote automatique (POH section 9)" },
    items: [
      {
        id: "disc",
        t: { en: "Autopilot — DISCONNECT (AP DISC), take the controls", fr: "Pilote automatique — DÉBRAYER (AP DISC), reprendre les commandes" },
        memory: true,
        check: { id: "ap", p: { engaged: false } },
        withinS: 10,
        safety: false,
        note: {
          en: "A failed autopilot drops by itself with an alert: press AP DISC to silence it and fly. Credited at your first control input.",
          fr: "Un pilote automatique en panne se débraye seul avec une alarme : appuyez sur AP DISC pour l’acquitter et pilotez. Validé à votre première action aux commandes.",
        },
      },
      { id: "fly", t: { en: "Hand-fly: attitude, then trim", fr: "Piloter à la main : assiette, puis compenser" }, check: { id: "bankMax", p: { max: 30, holdS: 5 } } },
      { id: "atc", t: { en: "ATC — advise if it affects the clearance", fr: "ATC — prévenir si cela affecte la clairance" }, check: manual, optional: true },
    ],
  },
  {
    base: "c172.door",
    title: { en: "Door open in flight", fr: "Porte ouverte en vol" },
    summary: {
      en: "Noisy but not dangerous: fly first, slow down, close it only if it is safe, else land and close it.",
      fr: "Bruyant mais pas dangereux : piloter d’abord, ralentir, la fermer seulement si c’est sûr, sinon se poser.",
    },
    category: "other",
    failures: ["door"],
    ordered: true,
    // no numbered POH checklist: POH section 3 amplified text and FAA-H-8083-3C ch.18 airmanship. There is no door
    // light on a C172S: the cue is the noise and the draught.
    ref: {
      en: "C172S POH section 3 amplified (unlatched door) · FAA-H-8083-3C ch.18",
      fr: "C172S POH section 3 détaillée (porte déverrouillée) · FAA-H-8083-3C ch. 18",
    },
    items: [
      {
        id: "fly",
        t: {
          en: "Fly the aircraft — attitude first, the door is not dangerous",
          fr: "Piloter — l’assiette d’abord, la porte n’est pas dangereuse",
        },
        memory: true,
        check: manual,
      },
      {
        id: "slow",
        t: { en: "Airspeed — reduce", fr: "Vitesse — réduire" },
        check: manual,
      },
      {
        id: "close",
        t: {
          en: "Door — close it only if it is safe (open the window, pull, latch)",
          fr: "Porte — la fermer seulement si c’est sûr (ouvrir la fenêtre, tirer, verrouiller)",
        },
        check: manual,
      },
      {
        id: "loose",
        t: {
          en: "Passengers and loose objects — secure",
          fr: "Passagers et objets — attachés",
        },
        check: manual,
        optional: true,
      },
      {
        id: "land",
        t: {
          en: "Cannot close it: land at the nearest suitable airport",
          fr: "Impossible de la fermer : atterrir au terrain approprié le plus proche",
        },
        check: manual,
        optional: true,
      },
    ],
  },
  {
    base: "c172.noseHigh",
    title: {
      en: "Unusual attitude — nose high",
      fr: "Position inhabituelle — assiette à cabrer",
    },
    summary: {
      en: "Power up, nose down to the horizon, then level the wings.",
      fr: "Puissance, rendre la main jusqu’à l’horizon, puis remettre les ailes à plat.",
    },
    category: "flight",
    failures: [],
    ordered: true,
    ref: {
      en: "FAA Instrument Flying Handbook — unusual attitude recovery",
      fr: "FAA Instrument Flying Handbook — rattrapage des positions inhabituelles",
    },
    items: [
      {
        id: "power",
        t: { en: "Power — FULL", fr: "Puissance — PLEIN GAZ" },
        memory: true,
        check: { id: "throttle", p: { op: ">=", value: 0.9 } },
        withinS: 5,
      },
      {
        id: "pitch",
        t: {
          en: "Pitch — lower the nose to the horizon",
          fr: "Assiette — rendre la main jusqu’à l’horizon",
        },
        memory: true,
        check: { id: "pitchAtt", p: { min: -5, max: 5, holdS: 2 } },
        withinS: 15,
      },
      {
        id: "wings",
        t: {
          en: "Wings — level (coordinated aileron and rudder)",
          fr: "Ailes — à plat (ailerons et palonnier coordonnés)",
        },
        memory: true,
        check: { id: "bankMax", p: { max: 10, holdS: 2 } },
        withinS: 20,
      },
      {
        id: "resume",
        t: {
          en: "Return to the planned altitude, heading and power",
          fr: "Revenir à l’altitude, au cap et à la puissance prévus",
        },
        check: manual,
      },
    ],
  },
  {
    base: "c172.noseLow",
    title: {
      en: "Unusual attitude — nose low",
      fr: "Position inhabituelle — assiette à piquer",
    },
    summary: {
      en: "Power to idle, level the wings, then raise the nose smoothly.",
      fr: "Réduire, ailes à plat, puis remonter le nez en douceur.",
    },
    category: "flight",
    failures: [],
    ordered: true,
    ref: {
      en: "FAA Instrument Flying Handbook — unusual attitude recovery",
      fr: "FAA Instrument Flying Handbook — rattrapage des positions inhabituelles",
    },
    items: [
      {
        id: "power",
        t: { en: "Power — IDLE", fr: "Puissance — RÉDUIT" },
        memory: true,
        check: { id: "throttle", p: { op: "<=", value: 0.05 } },
        withinS: 5,
      },
      {
        id: "wings",
        t: { en: "Wings — level", fr: "Ailes — à plat" },
        memory: true,
        check: { id: "bankMax", p: { max: 10, holdS: 1 } },
        withinS: 10,
      },
      {
        id: "pitch",
        t: {
          en: "Pitch — raise the nose smoothly to the horizon",
          fr: "Assiette — remonter le nez en douceur jusqu’à l’horizon",
        },
        memory: true,
        check: { id: "pitchAtt", p: { min: -5, max: 5, holdS: 2 } },
        withinS: 20,
      },
      {
        id: "resume",
        t: {
          en: "Power — as required, back to the planned flight",
          fr: "Puissance — selon besoin, reprendre le vol prévu",
        },
        check: manual,
      },
    ],
  },
  {
    base: "c172.spiral",
    title: { en: "Spiral dive", fr: "Spirale engagée" },
    summary: {
      en: "Idle, wings level BEFORE pulling, then ease out of the dive — watch VNE 163 KIAS.",
      fr: "Réduire, ailes à plat AVANT de tirer, puis ressource douce — attention à la VNE 163 kt.",
    },
    category: "flight",
    failures: [],
    ordered: true,
    ref: {
      en: "FAA Airplane Flying Handbook / Instrument Flying Handbook — spiral dive",
      fr: "FAA Airplane Flying Handbook / Instrument Flying Handbook — spirale",
    },
    items: [
      {
        id: "power",
        t: { en: "Power — IDLE", fr: "Puissance — RÉDUIT" },
        memory: true,
        check: { id: "throttle", p: { op: "<=", value: 0.05 } },
        withinS: 4,
      },
      {
        id: "wings",
        t: { en: "Wings — level first", fr: "Ailes — à plat d’abord" },
        memory: true,
        check: { id: "bankMax", p: { max: 10, holdS: 1 } },
        withinS: 10,
        note: {
          en: "Pulling while banked tightens the spiral and overloads the airframe.",
          fr: "Tirer en virage resserre la spirale et surcharge la structure.",
        },
      },
      {
        id: "pitch",
        t: {
          en: "Pitch — ease out of the dive to the horizon",
          fr: "Assiette — ressource douce jusqu’à l’horizon",
        },
        memory: true,
        check: { id: "pitchAtt", p: { min: -5, max: 10, holdS: 2 } },
        withinS: 20,
      },
      {
        id: "resume",
        t: {
          en: "Power — as required, climb back to a safe altitude",
          fr: "Puissance — selon besoin, remonter à une altitude de sécurité",
        },
        check: manual,
      },
    ],
  },
  {
    base: "c172.spin",
    title: { en: "Spin recovery", fr: "Sortie de vrille" },
    summary: {
      en: "Throttle idle, ailerons neutral, full opposite rudder, brisk forward elevator; rotation stopped: rudder neutral, smooth recovery.",
      fr: "Gaz réduits, ailerons au neutre, palonnier à fond contre la rotation, profondeur franchement en avant ; rotation arrêtée : palonnier au neutre, ressource douce.",
    },
    category: "flight",
    failures: [],
    ordered: true,
    ref: {
      en: "C172S POH section 4 — spins (intentional spins: utility category only)",
      fr: "C172S POH section 4 — vrilles (vrilles volontaires : catégorie utilitaire seulement)",
    },
    items: [
      {
        id: "power",
        t: { en: "Throttle — IDLE", fr: "Gaz — RÉDUIT" },
        memory: true,
        check: { id: "throttle", p: { op: "<=", value: 0.05 } },
        withinS: 5,
      },
      { id: "ailerons", t: { en: "Ailerons — NEUTRAL", fr: "Ailerons — AU NEUTRE" }, memory: true, check: manual },
      { id: "rudder", t: { en: "Rudder — FULL opposite the rotation", fr: "Palonnier — À FOND contre la rotation" }, memory: true, check: manual },
      { id: "elevator", t: { en: "Elevator — brisk forward, past neutral", fr: "Profondeur — franchement en avant, au-delà du neutre" }, memory: true, check: manual },
      {
        id: "recover",
        t: {
          en: "Rotation stopped: rudder NEUTRAL, smooth recovery from the dive (VNE 163 KIAS)",
          fr: "Rotation arrêtée : palonnier AU NEUTRE, ressource douce (VNE 163 kt)",
        },
        memory: true,
        check: { id: "pitchAtt", p: { min: -5, max: 10, holdS: 2 } },
      },
    ],
  },
  {
    base: "c172.display",
    title: { en: "PFD or MFD failure (G1000)", fr: "Panne du PFD ou du MFD (G1000)" },
    summary: {
      en: "DISPLAY BACKUP: the remaining screen shows the reversionary page (flight instruments and engine strip); breakers checked once.",
      fr: "DISPLAY BACKUP : l’écran restant affiche la page de réversion (instruments de vol et bandeau moteur) ; disjoncteurs vérifiés une fois.",
    },
    category: "avionics",
    failures: [],
    ordered: true,
    ref: pohRef("Display failure — DISPLAY BACKUP (NAV III abnormal)", "Panne d’écran — DISPLAY BACKUP (procédure anormale NAV III)"),
    items: [
      { id: "backup", t: { en: "DISPLAY BACKUP button — PRESS (reversionary mode)", fr: "Bouton DISPLAY BACKUP — APPUYER (mode réversion)" }, check: manual },
      { id: "cb", t: { en: "Display circuit breakers — check (one reset at most)", fr: "Disjoncteurs des écrans — vérifier (un réarmement au plus)" }, check: manual },
      { id: "fly", t: { en: "Fly on the remaining display", fr: "Piloter sur l’écran restant" }, check: manual },
      // optional: the simulator shows the standby cluster only once a display or the AHRS / ADC has failed
      { id: "xcheck", t: { en: "Standby instruments — cross-check", fr: "Instruments de secours — recouper" }, check: manual, optional: true },
      { id: "land", t: { en: "Land as soon as practical in IMC", fr: "En IMC, atterrir dès que raisonnablement possible" }, check: manual },
    ],
  },
];

function build(d: BiProc, lang: Lang): Procedure {
  const items: ProcItem[] = d.items
    .filter((it) => !it.only || it.only === lang)
    .map((it) => {
      const out: ProcItem = {
        id: it.id,
        text: it.t[lang],
        memory: !!it.memory,
      };
      if (it.check)
        out.check = {
          id: it.check.id,
          ...(it.check.p ? { p: { ...it.check.p } } : {}),
        };
      if (it.withinS !== undefined) out.withinS = it.withinS;
      if (it.optional) out.optional = true;
      if (it.safety !== undefined) out.safety = it.safety;
      if (it.note?.[lang]) out.note = it.note[lang];
      if (it.cockpit) out.cockpit = [...it.cockpit];
      // in the cockpit the item is flown in, the '(G1000)' marker of the library text is noise: drop it there
      const textFor: Partial<Record<ProcCockpit, string>> = {};
      for (const cp of ["g1000", "steam", "airliner"] as ProcCockpit[]) {
        const own = it.tc?.[cp]?.[lang];
        if (own) textFor[cp] = own;
        else if (cp !== "steam" && it.cockpit?.length && /\s*\(G1000\)/.test(it.t[lang]))
          textFor[cp] = it.t[lang].replace(/\s*\(G1000\)/, "");
      }
      if (Object.keys(textFor).length) out.textFor = textFor;
      return out;
    });
  const p: Procedure = {
    id: `${d.base}.${lang}`,
    title: d.title[lang],
    category: d.category,
    lang,
    failures: [...d.failures],
    aircraft: "C172S",
    ordered: d.ordered,
    items,
    source: "library",
    ref: d.ref[lang],
    disclaimer: DISCLAIMER[lang],
    summary: d.summary[lang],
  };
  if (d.targets) p.targets = { ...d.targets };
  if (d.when) {
    p.when = { ...d.when };
    if (d.when.cockpit) p.when.cockpit = [...d.when.cockpit];
  }
  if (d.then) p.then = { ...d.then };
  if (d.group) p.group = d.group;
  return p;
}

/** every library procedure, EN then FR, in library order (the drill session prefers earlier ones) */
export const LIBRARY: Procedure[] = (["en", "fr"] as Lang[]).flatMap((l) =>
  DEFS.map((d) => build(d, l)),
);
/** base ids in library order */
export const LIBRARY_BASES: string[] = DEFS.map((d) => d.base);

/** a fresh copy of a library procedure (by full id, or base id + language) */
export function libraryProcedure(id: string, lang?: Lang): Procedure | null {
  const full = lang && !/\.(fr|en)$/.test(id) ? `${id}.${lang}` : id;
  const p = LIBRARY.find((x) => x.id === full);
  return p ? (JSON.parse(JSON.stringify(p)) as Procedure) : null;
}

/** library procedures in one language */
export function libraryFor(lang: Lang): Procedure[] {
  return LIBRARY.filter((p) => p.lang === lang);
}
