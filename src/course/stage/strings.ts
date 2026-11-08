// Ground school stage — UI strings (FR / EN). Author content is L10n in the course; these are the stage's own
// labels. Kept here so the stage has no dependency on the academy host (course/i18n.ts may re-export them).
import type { L10n, Lang } from "../types";

const S = {
  live: ["Live instrument", "Instrument en direct"],
  frozen: ["Paused", "En pause"],
  clip: ["CLIP", "CLIP"],
  cockpit: ["COCKPIT", "COCKPIT"],
  reset: ["Start again", "Recommencer"],
  freeze: ["Pause", "Mettre en pause"],
  resume: ["Resume", "Reprendre"],
  plan: ["Top view", "Vue de dessus"],
  planTitle: ["Top view", "Vue de dessus"],
  play: ["Play", "Lecture"],
  pause: ["Pause", "Pause"],
  takeOver: ["Take over", "Prendre les commandes"],
  back10: ["Back 10 s", "−10 s"],
  goal: ["Goal", "Objectif"],
  nextOpen: ["Next is always open", "Suivant reste toujours possible"],
  assist: [
    "Altitude and speed held for you",
    "Altitude et vitesse tenues pour vous",
  ],
  assistAlt: ["Altitude held for you", "Altitude tenue pour vous"],
  assistIas: ["Speed held for you", "Vitesse tenue pour vous"],
  notGraded: ["not graded", "non noté"],
  locked: ["LOCKED BY THIS STEP", "VERROUILLÉ PAR CETTE ÉTAPE"],
  lockedOne: ["Locked by this step", "Verrouillé par cette étape"],
  bankHold: ["Turn (hold)", "Virer (maintenir)"],
  pitchHold: ["Pitch (hold)", "Assiette (maintenir)"],
  power: ["Power", "Puissance"],
  left: ["Left", "À gauche"],
  right: ["Right", "À droite"],
  obs: ["Course (OBS)", "Route (OBS)"],
  obs1: ["Course 1 (OBS)", "Route 1 (OBS)"],
  obs2: ["Course 2 (OBS)", "Route 2 (OBS)"],
  hdgBug: ["Heading bug", "Index de cap"],
  crs: ["Course (CRS)", "Route (CRS)"],
  altBug: ["Altitude select", "Altitude affichée"],
  baro: ["Altimeter setting", "Calage"],
  cdi: ["CDI", "CDI"],
  brg1: ["BRG 1", "BRG 1"],
  brg2: ["BRG 2", "BRG 2"],
  ap: ["AP", "PA"],
  drag: ["Drag the aircraft on the plan", "Déplacez l'avion sur le plan"],
  dragShort: ["Drag the aircraft", "Déplacer l'avion"],
  covered: ["COVERED", "MASQUÉ"],
  sceneMissing: [
    "This step's scene is missing",
    "La scène de cette étape est introuvable",
  ],
  sceneError: [
    "The scene could not be applied",
    "La scène n'a pas pu être appliquée",
  ],
  flyCard: ["Flies in the cockpit", "Se vole dans le cockpit"],
  entry: ["Entry", "Entrée"],
  direct: ["DIRECT", "DIRECTE"],
  parallel: ["PARALLEL", "PARALLÈLE"],
  teardrop: ["TEARDROP", "DÉCALÉE"],
  wind: ["wind", "vent"],
  calm: ["calm", "calme"],
  timeScale: ["time ×", "temps ×"],
  stage: ["Live instrument", "Instrument en direct"],
  plusOne: ["+1", "+1"],
  minusOne: ["−1", "−1"],
} as const satisfies Record<string, readonly [string, string]>;
export type StageString = keyof typeof S;

export function t(key: StageString, lang: Lang = "en"): string {
  return S[key][lang === "fr" ? 1 : 0];
}
/** Author text in the language (missing FR falls back to EN; the reader shows the EN marker, not the stage). */
export function tl(text: L10n | undefined, lang: Lang = "en"): string {
  if (!text) return "";
  return lang === "fr" ? (text.fr ?? text.en) : text.en;
}
