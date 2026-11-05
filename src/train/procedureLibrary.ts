// Default emergency & abnormal procedures for a C172S-class trainer (Lycoming IO-360 fuel-injected, 28 V,
// vacuum-driven steam gyros or G1000), in French and English.
//
// IDS: one base id per procedure ('c172.engineFire') and one Procedure per language with the language as a
// suffix: 'c172.engineFire.en' / 'c172.engineFire.fr' (lang field set too). Club copies keep `basedOn` = the
// library id they were customised from. baseId() in procedures.ts strips the suffix.
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
  /** item only in one language version (procedures whose rules differ, e.g. lost comms 91.185 vs SERA) */
  only?: Lang;
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
    failures: ["engine", "enginePartial"],
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
        check: manual,
      },
      {
        id: "flaps",
        t: { en: "Flaps — UP", fr: "Volets — RENTRÉS" },
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
      {
        id: "master",
        t: { en: "Master switch — OFF", fr: "Interrupteur général — OFF" },
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
    failures: ["engine"],
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
        check: { id: "pitchAtt", p: { min: -60, max: 3, holdS: 1 } },
        withinS: 4,
        note: {
          en: "At Vy the speed decays within seconds: the nose must come down before anything else.",
          fr: "À Vy la vitesse chute en quelques secondes : l’assiette d’abord, avant toute autre action.",
        },
      },
      {
        id: "ias",
        t: {
          en: "Airspeed — 70 KIAS flaps up / 65 KIAS flaps down",
          fr: "Vitesse — 70 kt volets rentrés / 65 kt volets sortis",
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
          en: "Say it out loud: “landing ahead”.",
          fr: "Annoncez-le : « atterrissage droit devant ».",
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
          fr: "Robinet coupe-feu carburant — FERMÉ (tiré)",
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
      {
        id: "master",
        t: { en: "Master switch — OFF", fr: "Interrupteur général — OFF" },
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
      en: "Best glide 68 KIAS, pick a field, then the restart flow: fuel, pump, mixture, magnetos.",
      fr: "Finesse max 68 kt, choisir un champ, puis la séquence de redémarrage : carburant, pompe, mélange, magnétos.",
    },
    category: "engine",
    failures: ["engine"],
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
          en: "Field — choose one within gliding distance, into wind if possible",
          fr: "Champ — en choisir un à portée de plané, face au vent si possible",
        },
        memory: true,
        check: manual,
      },
      {
        id: "shutoff",
        t: {
          en: "Fuel shutoff valve — ON (push in)",
          fr: "Robinet coupe-feu carburant — OUVERT (poussé)",
        },
        memory: true,
        check: sw("fuelShutoff", true),
      },
      {
        id: "selector",
        t: { en: "Fuel selector — BOTH", fr: "Sélecteur carburant — BOTH" },
        memory: true,
        check: sw("fuelSelector", "BOTH"),
      },
      {
        id: "auxPump",
        t: {
          en: "Auxiliary fuel pump — ON",
          fr: "Pompe carburant électrique — ON",
        },
        memory: true,
        check: sw("auxPump", true),
      },
      {
        id: "mixture",
        t: { en: "Mixture — RICH", fr: "Mélange — PLEIN RICHE" },
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
          en: "A windmilling propeller restarts by itself within a few seconds once fuel and spark are back.",
          fr: "Une hélice en moulinet redémarre seule en quelques secondes dès que carburant et allumage sont rétablis.",
        },
      },
      {
        id: "pumpOff",
        t: {
          en: "After a restart: aux fuel pump — OFF (back ON if fuel flow drops)",
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
      en: "Glide, MAYDAY and 7700, secure the engine and the electrics, land into the field.",
      fr: "Plané, MAYDAY et 7700, sécuriser moteur et électricité, se poser dans le champ.",
    },
    category: "engine",
    failures: ["engine"],
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
          en: "Airspeed — 70 KIAS flaps up / 65 KIAS flaps down",
          fr: "Vitesse — 70 kt volets rentrés / 65 kt volets sortis",
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
          en: "Callsign, position, height, intentions, persons on board.",
          fr: "Indicatif, position, hauteur, intentions, personnes à bord.",
        },
      },
      {
        id: "xpdr",
        t: { en: "Transponder — 7700", fr: "Transpondeur — 7700" },
        check: { id: "xpdr", p: { code: "7700" } },
      },
      {
        id: "belts",
        t: {
          en: "Seats and seat belts — secure",
          fr: "Sièges verrouillés, ceintures serrées",
        },
        check: manual,
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
          fr: "Robinet coupe-feu carburant — FERMÉ (tiré)",
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
      {
        id: "master",
        t: {
          en: "Master switch — OFF once the landing is assured",
          fr: "Interrupteur général — OFF quand l’atterrissage est assuré",
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
          en: "Touchdown — slightly tail low, brake firmly",
          fr: "Toucher — légèrement cabré, freiner fermement",
        },
        check: { id: "landed" },
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
      en: "Fly, head for a field, then fuel pump, mixture, magnetos one at a time; land at the nearest airport.",
      fr: "Piloter, se diriger vers un champ, puis pompe, mélange, magnétos une par une ; atterrir au terrain le plus proche.",
    },
    category: "engine",
    failures: ["engineRough", "enginePartial"],
    ordered: false,
    ref: pohRef(
      "Rough engine operation or loss of power",
      "Fonctionnement irrégulier ou perte de puissance",
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
        id: "auxPump",
        t: {
          en: "Auxiliary fuel pump — ON",
          fr: "Pompe carburant électrique — ON",
        },
        check: sw("auxPump", true),
        note: {
          en: "The C172S is fuel-injected: no carburettor heat. On a carburettor engine, CARB HEAT — HOT comes first.",
          fr: "Le C172S est à injection : pas de réchauffage carburateur. Sur un moteur à carburateur, RÉCHAUFFAGE CARBU — CHAUD en premier.",
        },
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
        check: MIX_RICH,
      },
      {
        id: "mags",
        t: {
          en: "Magnetos — L, then R: keep the smoother one (BOTH if no change)",
          fr: "Magnétos — L puis R : garder la plus régulière (BOTH si aucun changement)",
        },
        // credited on the GOOD magneto only (selecting the faulty one alone makes it worse)
        check: sw("magnetos", "GOOD"),
        note: {
          en: "A bad magneto runs very rough on its own: switch back at once and keep the good one.",
          fr: "Une magnéto défaillante seule fait tourner très mal : revenez immédiatement et gardez la bonne.",
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
      en: "Low pressure with rising temperature: the engine will stop — divert now, stay within gliding distance.",
      fr: "Pression basse et température qui monte : le moteur va s’arrêter — dérouter maintenant, rester à portée de plané.",
    },
    category: "engine",
    failures: ["oilPressure"],
    ordered: false,
    ref: pohRef("Low oil pressure", "Basse pression d’huile"),
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
          en: "Low pressure with a normal temperature may be the gauge; with a rising temperature, engine failure is coming.",
          fr: "Pression basse et température normale : peut-être l’indicateur ; avec une température qui monte, la panne moteur approche.",
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
          en: "Power — minimum needed to stay level",
          fr: "Puissance — le minimum pour tenir le palier",
        },
        check: manual,
      },
      {
        id: "atc",
        t: {
          en: "ATC — PAN PAN (MAYDAY if it gets worse)",
          fr: "ATC — PAN PAN (MAYDAY si la situation empire)",
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
      en: "Sudden fuel-flow drop: aux fuel pump ON at once, then adjust throttle and mixture.",
      fr: "Chute brutale du débit : pompe électrique ON immédiatement, puis ajuster gaz et mélange.",
    },
    category: "engine",
    failures: ["fuelPump"],
    ordered: true,
    ref: pohRef(
      "Engine-driven fuel pump failure",
      "Panne de pompe à carburant entraînée par le moteur",
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
          en: "Auxiliary fuel pump — ON",
          fr: "Pompe carburant électrique — ON",
        },
        memory: true,
        check: sw("auxPump", true),
        withinS: 15,
        safety: false,
        note: {
          en: "FUEL PRESS / fuel flow near zero is the cue.",
          fr: "Alarme FUEL PRESS / débit proche de zéro : c’est le signal.",
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
          en: "Land as soon as practical, aux pump left ON",
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
      en: "Confirm on the gauges, feed from the fuller tank, divert and recompute the endurance.",
      fr: "Confirmer aux jauges, alimenter sur le réservoir le plus plein, dérouter et recalculer l’autonomie.",
    },
    category: "engine",
    failures: ["fuelLeak"],
    ordered: false,
    ref: pohRef(
      "Fuel system (amplified procedures)",
      "Circuit carburant (procédures détaillées)",
    ),
    items: [
      {
        id: "gauges",
        t: {
          en: "Fuel quantity L / R and fuel flow — check",
          fr: "Quantité carburant G / D et débit — vérifier",
        },
        check: manual,
      },
      {
        id: "selector",
        t: {
          en: "Fuel selector — the fuller tank",
          fr: "Sélecteur carburant — réservoir le plus plein",
        },
        check: sw("fuelSelector", "RIGHT"),
        note: {
          en: "In this drill the leak is in the left tank: feed from RIGHT.",
          fr: "Dans cet exercice la fuite est à gauche : alimenter sur DROIT.",
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
        id: "endurance",
        t: {
          en: "Endurance — recompute, land with the reserve intact",
          fr: "Autonomie — recalculer, se poser avec la réserve intacte",
        },
        check: manual,
      },
      {
        id: "smell",
        t: {
          en: "Fuel smell in the cabin: electrics to the minimum, vents open",
          fr: "Odeur d’essence en cabine : électricité au minimum, aérations ouvertes",
        },
        check: manual,
        optional: true,
      },
    ],
  },
  {
    base: "c172.engineFire",
    title: { en: "Engine fire in flight", fr: "Feu moteur en vol" },
    summary: {
      en: "Cut the fuel: mixture, shutoff valve, pump; master OFF, cabin heat OFF, 100 KIAS, forced landing.",
      fr: "Couper le carburant : mélange, robinet, pompe ; général OFF, chauffage fermé, 100 kt, atterrissage forcé.",
    },
    category: "fire",
    failures: ["engineFire"],
    ordered: true,
    targets: { iasKt: [90, 110] },
    ref: pohRef("Engine fire in flight", "Feu moteur en vol"),
    items: [
      {
        id: "mixture",
        t: { en: "Mixture — IDLE CUT-OFF", fr: "Mélange — ÉTOUFFOIR" },
        memory: true,
        check: MIX_CUTOFF,
        withinS: 10,
      },
      {
        id: "shutoff",
        t: {
          en: "Fuel shutoff valve — OFF (pull out)",
          fr: "Robinet coupe-feu carburant — FERMÉ (tiré)",
        },
        memory: true,
        check: sw("fuelShutoff", false),
        withinS: 15,
      },
      {
        id: "auxPump",
        t: {
          en: "Auxiliary fuel pump — OFF",
          fr: "Pompe carburant électrique — OFF",
        },
        memory: true,
        check: sw("auxPump", false),
      },
      {
        id: "master",
        t: { en: "Master switch — OFF", fr: "Interrupteur général — OFF" },
        memory: true,
        check: sw("batMaster", false),
      },
      {
        id: "cabin",
        t: {
          en: "Cabin heat and air — OFF (overhead vents only)",
          fr: "Chauffage et aération cabine — FERMÉS (aérateurs plafond seulement)",
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
        check: { id: "ias", p: { min: 90, max: 110, holdS: 5 } },
        note: {
          en: "A higher speed may blow the flames out by making the mixture too lean to burn.",
          fr: "Une vitesse plus élevée peut souffler les flammes en rendant le mélange trop pauvre pour brûler.",
        },
      },
      {
        id: "forced",
        t: {
          en: "Forced landing — execute",
          fr: "Atterrissage forcé — exécuter",
        },
        check: manual,
      },
      {
        id: "landed",
        t: { en: "Landed and evacuated", fr: "Posé et évacué" },
        check: { id: "landed" },
        optional: true,
      },
    ],
  },
  {
    base: "c172.electricalFire",
    title: { en: "Electrical fire in flight", fr: "Feu électrique en vol" },
    summary: {
      en: "Smoke: master and avionics OFF, all switches OFF except magnetos, vents closed, land as soon as possible.",
      fr: "Fumée : général et avionique OFF, tout coupé sauf les magnétos, aérations fermées, atterrir au plus vite.",
    },
    category: "fire",
    failures: ["electricalFire"],
    ordered: true,
    ref: pohRef("Electrical fire in flight", "Feu électrique en vol"),
    items: [
      {
        id: "master",
        t: { en: "Master switch — OFF", fr: "Interrupteur général — OFF" },
        memory: true,
        check: sw("batMaster", false),
        withinS: 10,
      },
      // POH order: master, vents / heat / air closed, extinguisher, avionics, every other switch
      {
        id: "cabin",
        t: {
          en: "Vents, cabin heat and air — CLOSED",
          fr: "Aérations, chauffage et air cabine — FERMÉS",
        },
        memory: true,
        check: sw("cabinHeat", false),
      },
      {
        id: "extinguisher",
        t: {
          en: "Fire extinguisher — use if needed",
          fr: "Extincteur — utiliser si nécessaire",
        },
        check: manual,
        optional: true,
      },
      {
        id: "avionics",
        t: { en: "Avionics switch — OFF", fr: "Interrupteur avionique — OFF" },
        memory: true,
        check: sw("avionics", false),
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
          en: "Fire out: vents, cabin heat and air — OPEN to clear the smoke",
          fr: "Feu éteint : aérations, chauffage et air cabine — OUVERTS pour évacuer la fumée",
        },
        check: manual,
        optional: true,
      },
      {
        id: "breakers",
        t: {
          en: "Fire out: circuit breakers — check, never reset a tripped one",
          fr: "Feu éteint : disjoncteurs — vérifier, ne jamais réenclencher un disjoncteur sauté",
        },
        check: manual,
      },
      {
        id: "land",
        t: { en: "Land as soon as possible", fr: "Atterrir dès que possible" },
        check: manual,
      },
    ],
  },
  {
    base: "c172.alternator",
    title: {
      en: "Alternator failure / LOW VOLTS",
      fr: "Panne d’alternateur / LOW VOLTS",
    },
    summary: {
      en: "One reset of the master, then shed the loads: about 30 minutes of battery left — land as soon as practical.",
      fr: "Un seul réarmement du général, puis délester : environ 30 minutes de batterie — atterrir dès que raisonnablement possible.",
    },
    category: "electrical",
    failures: ["alternator"],
    ordered: true,
    ref: pohRef(
      "Low voltage annunciator illuminates in flight",
      "Alarme de basse tension (LOW VOLTS) en vol",
    ),
    items: [
      {
        id: "ammeter",
        t: {
          en: "Ammeter and bus voltage — check (discharge)",
          fr: "Ampèremètre et tension — vérifier (décharge)",
        },
        check: manual,
      },
      {
        id: "avOff",
        t: { en: "Avionics switch — OFF", fr: "Interrupteur avionique — OFF" },
        check: sw("avionics", false),
      },
      {
        id: "altCb",
        t: {
          en: "Alternator circuit breaker (ALT FIELD) — check IN",
          fr: "Disjoncteur d’alternateur (ALT FIELD) — vérifier ENFONCÉ",
        },
        check: manual,
      },
      {
        id: "masterOff",
        t: {
          en: "Master switch (ALT and BAT) — OFF",
          fr: "Interrupteur général (ALT et BAT) — OFF",
        },
        check: sw("batMaster", false),
      },
      {
        id: "masterOn",
        t: {
          en: "Master switch — ON (one reset only)",
          fr: "Interrupteur général — ON (un seul réarmement)",
        },
        check: sw("batMaster", true),
      },
      {
        id: "avOn",
        t: { en: "Avionics switch — ON", fr: "Interrupteur avionique — ON" },
        check: sw("avionics", true),
      },
      {
        id: "shed",
        t: {
          en: "LOW VOLTS still on: ALT OFF, shed non-essential loads",
          fr: "LOW VOLTS toujours allumée : ALT OFF, délester les équipements non essentiels",
        },
        check: manual,
        note: {
          en: "Landing light, pitot heat (unless in icing), second radio and screens you do not need.",
          fr: "Phare, réchauffage pitot (sauf givrage), deuxième radio et écrans inutiles.",
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
    base: "c172.vacuum",
    title: {
      en: "Vacuum / attitude reference failure (partial panel)",
      fr: "Panne de dépression / d’horizon (panneau partiel)",
    },
    summary: {
      en: "Cover the failed gyros, fly the turn coordinator, altimeter and compass, tell ATC.",
      fr: "Masquer les gyros en panne, piloter à l’indicateur de virage, à l’altimètre et au compas, prévenir l’ATC.",
    },
    category: "instruments",
    failures: ["vacuum", "ahrs"],
    ordered: false,
    targets: { maxBankDeg: 20 },
    ref: {
      en: "C172S POH section 3 — Low vacuum · FAA Instrument Flying Handbook (partial panel)",
      fr: "C172S POH section 3 — Basse dépression · FAA Instrument Flying Handbook (panneau partiel)",
    },
    items: [
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
    base: "c172.pitot",
    title: {
      en: "Pitot blockage / pitot icing",
      fr: "Pitot obstrué / givrage du pitot",
    },
    summary: {
      en: "Pitot heat ON, fly pitch and power, cross-check GPS ground speed, leave the icing.",
      fr: "Réchauffage pitot ON, piloter assiette-puissance, recouper avec la vitesse sol GPS, sortir du givrage.",
    },
    category: "instruments",
    failures: ["pitotIcing", "pitotBlocked"],
    ordered: false,
    ref: {
      en: "C172S POH section 3 · FAA Instrument Flying Handbook (pitot-static failures)",
      fr: "C172S POH section 3 · FAA Instrument Flying Handbook (pannes pitot-statique)",
    },
    items: [
      {
        id: "heat",
        t: { en: "Pitot heat — ON", fr: "Réchauffage pitot — ON" },
        memory: true,
        check: sw("pitotHeat", true),
        withinS: 30,
        safety: false,
        note: {
          en: "A blocked pitot (ram and drain) makes the ASI behave like an altimeter: it lies in climbs and descents.",
          fr: "Un pitot bouché (prise et purge) fait réagir l’anémomètre comme un altimètre : il ment en montée et en descente.",
        },
      },
      {
        id: "pitchPower",
        t: {
          en: "Fly pitch and power — known attitude and RPM",
          fr: "Piloter assiette-puissance — assiette et régime connus",
        },
        check: manual,
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
        id: "exit",
        t: {
          en: "Icing: leave it (altitude or heading change)",
          fr: "Givrage : en sortir (changement d’altitude ou de cap)",
        },
        check: manual,
        optional: true,
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
    ref: pohRef(
      "Flap system malfunction · normal landing (flaps up)",
      "Panne de volets · atterrissage normal (volets rentrés)",
    ),
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
          en: "AP DISC / TRIM switch — press and hold",
          fr: "Bouton AP DISC / TRIM — appuyer et maintenir",
        },
        memory: true,
        check: { id: "ap", p: { engaged: false } },
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
    title: {
      en: "Radio failure in IFR (lost communications)",
      fr: "Panne radio en IFR",
    },
    summary: {
      en: "Troubleshoot, squawk 7600, then the 91.185 rules: route AVE-F, altitude M-E-A, leave the limit at EFC/ETA.",
      fr: "Dépanner, afficher 7600, puis la règle SERA.14083 : niveau et vitesse 7 min, route du plan de vol, descente à l’EAT/ETA.",
    },
    category: "comms",
    failures: ["comms"],
    ordered: false,
    ref: {
      en: "14 CFR 91.185 · AIM 6-4-1",
      fr: "SERA.14083 · AIP France (interruption des communications)",
    },
    items: [
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
        withinS: 60,
        safety: false,
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
        id: "vmc",
        t: {
          en: "In VMC: remain VMC and land as soon as practicable",
          fr: "En VMC : rester VMC et atterrir sur l’aérodrome approprié le plus proche",
        },
        check: manual,
        optional: true,
      },
      // 14 CFR 91.185
      {
        id: "route",
        only: "en",
        t: {
          en: "Route — AVE-F: Assigned, Vectored (direct to the fix), Expected, Filed",
          fr: "",
        },
        check: manual,
      },
      {
        id: "altitude",
        only: "en",
        t: {
          en: "Altitude — the highest of MEA, Expected and Assigned, segment by segment",
          fr: "",
        },
        check: manual,
      },
      {
        id: "limit",
        only: "en",
        t: {
          en: "Clearance limit — leave it at the EFC time (or the ETA); approach as close as possible to the ETA",
          fr: "",
        },
        check: manual,
      },
      // SERA.14083
      {
        id: "timer",
        only: "fr",
        t: {
          en: "",
          fr: "Chronomètre — démarrer : niveau et vitesse assignés (ou altitude minimale si plus haute) pendant 7 min",
        },
        check: { id: "timer" },
        note: {
          en: "",
          fr: "7 min sous surveillance radar, 20 min sans radar (après le dernier point de compte rendu obligatoire).",
        },
      },
      {
        id: "route",
        only: "fr",
        t: {
          en: "",
          fr: "Route — celle du plan de vol en vigueur ; guidé radar : la rejoindre au plus tard au prochain point significatif",
        },
        check: manual,
      },
      {
        id: "fix",
        only: "fr",
        t: {
          en: "",
          fr: "Rejoindre la balise ou le point de l’aérodrome de destination ; attendre si nécessaire",
        },
        check: manual,
      },
      {
        id: "descent",
        only: "fr",
        t: {
          en: "",
          fr: "Descente — à l’heure d’approche prévue (EAT) reçue, sinon à l’heure estimée d’arrivée (ETA)",
        },
        check: manual,
      },
      {
        id: "approach",
        only: "fr",
        t: {
          en: "",
          fr: "Approche aux instruments normale ; atterrir si possible dans les 30 min suivant l’ETA ou l’EAT",
        },
        check: manual,
      },
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
      en: "Airspeed, altitude and VSI lost: fly pitch and power, pitot heat and alternate static, GPS altitude, tell ATC.",
      fr: "Vitesse, altitude et vario perdus : piloter assiette-puissance, réchauffage pitot et statique de secours, altitude GPS, prévenir l’ATC.",
    },
    category: "instruments",
    failures: ["airData"],
    ordered: false,
    targets: { maxBankDeg: 30 },
    ref: {
      en: "FAA Instrument Flying Handbook (pitot-static failures) · G1000 Pilot’s Guide (ADC failure)",
      fr: "FAA Instrument Flying Handbook (pannes pitot-statique) · G1000 Pilot’s Guide (panne ADC)",
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
          en: "The autopilot drops out with the air data: hand-fly, wings level, the attitude indicator is still good.",
          fr: "Le pilote automatique se débraye avec l’anémo-baro : piloter à la main, ailes à plat, l’horizon reste fiable.",
        },
      },
      {
        id: "heat",
        t: { en: "Pitot heat — ON", fr: "Réchauffage pitot — ON" },
        check: sw("pitotHeat", true),
      },
      {
        id: "alt",
        t: {
          en: "Alternate static air — ON (pull)",
          fr: "Prise statique de secours — OUVERTE (tirée)",
        },
        check: sw("altStatic", true),
      },
      {
        id: "cross",
        t: {
          en: "Altitude and speed — GPS altitude and ground speed (standby instruments if fitted)",
          fr: "Altitude et vitesse — altitude GPS et vitesse sol (instruments de secours s’il y en a)",
        },
        check: manual,
      },
      {
        id: "atc",
        t: {
          en: "ATC — advise, altitude reports may be wrong",
          fr: "ATC — prévenir, l’altitude transmise peut être fausse",
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
      en: "GS flag: continue as a localizer approach to the LOC MDA, or go around.",
      fr: "Drapeau GS : poursuivre en approche LOC jusqu’à la MDA LOC, ou remettre les gaz.",
    },
    category: "avionics",
    failures: ["gs"],
    ordered: true,
    ref: { en: "FAA Instrument Procedures Handbook — ILS / LOC approaches", fr: "FAA Instrument Procedures Handbook — approches ILS / LOC" },
    items: [
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
    ref: pohRef(
      "Unlatched cabin door in flight (amplified procedures)",
      "Porte cabine ouverte en vol (procédures détaillées)",
    ),
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
  if (d.when) p.when = { ...d.when };
  if (d.then) p.then = { ...d.then };
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
