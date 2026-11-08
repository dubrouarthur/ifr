// The words of the built-in flights (src/sim/sim.ts SCENARIOS) in the UI language: their titles, their one-line
// descriptions, their kind, and the aircraft subtitle of the cockpit top bar (« C172 · instruments classiques »).
// The scenario data stays in English (ids, plates and procedures are keyed on it); only what the pilot reads changes.
import { lang } from "./i18n";
import type { Scenario } from "../sim/sim";

type Pair = { name: string; desc: string };
/** French titles and descriptions, by scenario id */
const FR: Record<string, Pair> = {
  rwy27: {
    name: "Départ IFR — PARD piste 27",
    desc: "Aligné piste 27. Décollez sous un plafond couvert à 800 ft, montez dans l’axe jusqu’à 3000 ft, puis directe ARD.",
  },
  "ils27-vtf": {
    name: "ILS piste 27 — guidage radar en finale",
    desc: "À 14 NM à l’est, 3000 ft, cap 240 pour intercepter le localizer I-PRD. Plafond 500 ft.",
  },
  "ils27-full": {
    name: "ILS piste 27 — procédure complète par TOBEY",
    desc: "En route à 4000 ft, autorisé ILS 27 par TOBEY. GPS jusqu’au passage sur le LOC, puis descente sur le glide.",
  },
  loc27: {
    name: "LOC piste 27 (glide hors service)",
    desc: "Le même ILS, glide hors service par NOTAM. Volez les minima du localizer seul : MDA 900.",
  },
  rnav09: {
    name: "RNAV (GPS) piste 09 — LPV par LUNKS",
    desc: "À l’ouest de PARD à 3500 ft, RNAV 09 par LUNKS. Couplez APR pour le plan LPV jusqu’à la DA 670.",
  },
  locbc09: {
    name: "LOC BC piste 09 — axe arrière",
    desc: "Une approche rare sur l’axe arrière. Route affichée 270 (l’axe avant) ; le HSI reste dans le bon sens.",
  },
  ndb27: {
    name: "NDB piste 27 — approche ADF",
    desc: "À l’ancienne : suivez l’aiguille ADF (cyan) jusqu’au NDB PA, puis en éloignement jusqu’au MAP. Chronométrez.",
  },
  vor21: {
    name: "VOR/DME piste 21 — Mistral Valley",
    desc: "Approche VOR/DME par paliers vers un aérodrome de vallée. Palier à DOPPS, MDA 1640.",
  },
  rnav03: {
    name: "RNAV (GPS) piste 03 — LNAV/VNAV",
    desc: "Mistral Valley par le sud-ouest, via TALUS. LNAV/VNAV DA 1500 avec un vent de travers en rafales.",
  },
  ils03: {
    name: "ILS piste 03 — Mistral Valley",
    desc: "ILS de vallée, relief montant et vent en rafales. Par SCREE, interception du glide à 3600, DA 1400.",
  },
  lda36: {
    name: "LDA/DME piste 36 — localizer décalé",
    desc: "Un localizer décalé de 16° par rapport à la piste. Suivez-le jusqu’à ADNAP, puis manœuvrez à vue vers la piste 36.",
  },
  "hold-ard": {
    name: "Attente à ARD",
    desc: "Attente d’approche interrompue à ARD : rapprochement 270, virages à droite, branches d’une minute, 3000 ft.",
  },
  free: {
    name: "Vol libre — VFR au-dessus des nuages",
    desc: "Ciel clair à 5500 ft au-dessus des îles Ardent. Explorez, chargez une approche, entraînez-vous à tout.",
  },
  lesson: { name: "Leçon", desc: "" },
};
const KIND_FR: Record<Scenario["kind"], string> = {
  Departure: "Départ",
  Precision: "Approche de précision",
  APV: "Approche APV",
  "Non-precision": "Approche classique",
  Holding: "Attente",
  "Free flight": "Vol libre",
};
const KIND_EN: Record<Scenario["kind"], string> = {
  Departure: "Departure",
  Precision: "Precision approach",
  APV: "APV approach",
  "Non-precision": "Non-precision approach",
  Holding: "Holding",
  "Free flight": "Free flight",
};

/** the scenario's title in the UI language */
export function scenarioName(sc: Pick<Scenario, "id" | "name">): string {
  return lang() === "fr" ? (FR[sc.id]?.name ?? sc.name) : sc.name;
}
/** the scenario's one-line description in the UI language */
export function scenarioDesc(sc: Pick<Scenario, "id" | "description">): string {
  return lang() === "fr" ? (FR[sc.id]?.desc ?? sc.description) : sc.description;
}
/** the scenario's kind in words (« Approche de précision ») */
export function scenarioKind(k: Scenario["kind"]): string {
  return (lang() === "fr" ? KIND_FR : KIND_EN)[k] ?? k;
}

/** the aircraft and its panel, as the top bar's subtitle says it */
export function aircraftLabel(panel: "g1000" | "steam" | "airliner"): string {
  const fr = lang() === "fr";
  if (panel === "steam")
    return fr ? "C172 · instruments classiques" : "C172 · classic gauges";
  if (panel === "airliner")
    return fr ? "C172 · écrans de ligne" : "C172 · airliner displays";
  return fr ? "C172 · G1000" : "C172 · G1000";
}
