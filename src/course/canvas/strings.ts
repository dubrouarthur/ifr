// Ground school — designed slides: UI strings (package N). EN / FR, never machine-translated at run time.
import type { Lang } from "../types";

const S = {
  // blocks
  yourTurn: ["Your turn", "À vous"],
  play: ["Play", "Lire"],
  replay: ["Replay", "Revoir"],
  openSim: ["Fly it in the simulator", "Le faire dans le simulateur"],
  outsideView: ["Outside view", "Vue extérieure"],
  cockpitView: ["Cockpit view", "Vue cockpit"],
  panelView: ["Instrument panel", "Tableau de bord"],
  demoClip: ["Demo clip", "Démonstration"],
  live: ["Live", "En direct"],
  frozen: ["Frozen", "Figé"],
  clip: ["Clip", "Séquence"],
  sceneMissing: [
    "Scene not found: capture it from the cockpit",
    "Scène introuvable : capturez-la depuis le cockpit",
  ],
  imageMissing: [
    "Image not available on this device",
    "Image non disponible sur cet appareil",
  ],
  quizSlot: ["Question", "Question"],
  calcSlot: ["Calculation", "Calcul"],
  calcNewNumbers: ["New numbers each try", "Nouveaux chiffres à chaque essai"],
  checkedBySim: ["Checked by the sim", "Vérifié par le simulateur"],
  doThis: ["Do this", "À faire"],
  quizRight: ["Correct", "Juste"],
  quizYours: ["Your answer", "Votre réponse"],
  answeredInPlayer: ["Answered in the player", "Répondu dans le lecteur"],
  textTooLong: ["Text too long", "Texte trop long"],
  answer: ["Answer", "Réponse"],
  // editor
  duplicate: ["Duplicate", "Dupliquer"],
  delete: ["Delete", "Supprimer"],
  group: ["Group", "Grouper"],
  ungroup: ["Ungroup", "Dissocier"],
  lock: ["Lock", "Verrouiller"],
  unlock: ["Unlock", "Déverrouiller"],
  front: ["Bring to front", "Premier plan"],
  back: ["Send to back", "Arrière-plan"],
  forward: ["Forward", "Avancer"],
  backward: ["Backward", "Reculer"],
  undo: ["Undo", "Annuler"],
  redo: ["Redo", "Rétablir"],
  locked: ["Locked", "Verrouillé"],
  rotate: ["Rotate", "Rotation"],
  editText: ["Edit text", "Modifier le texte"],
  more: ["More", "Plus"],
  alignLeft: ["Align left", "Aligner à gauche"],
  alignCenter: ["Align centres", "Centrer"],
  alignRight: ["Align right", "Aligner à droite"],
  alignTop: ["Align top", "Aligner en haut"],
  alignMiddle: ["Align middles", "Centrer verticalement"],
  alignBottom: ["Align bottom", "Aligner en bas"],
  distributeH: ["Distribute horizontally", "Répartir horizontalement"],
  distributeV: ["Distribute vertically", "Répartir verticalement"],
  selected: ["selected", "sélectionnés"],
  canvasLabel: ["Slide canvas, editing", "Diapositive, en édition"],
  // library
  library: ["Library", "Bibliothèque"],
  search: ["Search", "Rechercher"],
  icons: ["Icons", "Icônes"],
  diagrams: ["Diagrams", "Schémas"],
  instruments: ["Instruments", "Instruments"],
  photos: ["Photos", "Photos"],
  shapes: ["Shapes", "Formes"],
  text: ["Text", "Texte"],
  noResults: ["Nothing matches", "Aucun résultat"],
  tapToAdd: [
    "Tap to add, or drag onto the slide",
    "Touchez pour ajouter, ou glissez sur la diapositive",
  ],
  live3: ["Live from the scene", "En direct depuis la scène"],
  sampleScene: ["Sample scene", "Scène d’exemple"],
  slide: ["Slide", "Diapositive"],
  presenterOnly: ["Presenter only", "Présentateur seulement"],
  reveal: ["Reveal", "Apparition"],
  grid: ["Grid", "Grille"],
  snap: ["Snap", "Magnétisme"],
  layers: ["Layers", "Calques"],
  layouts: ["Layouts", "Mises en page"],
  themes: ["Themes", "Thèmes"],
  interactive: ["Interactive", "Interactif"],
  addHere: ["Add to the slide", "Ajouter à la diapositive"],
  dropHere: ["Drop on the slide", "Déposez sur la diapositive"],
  editHint: [
    "Double-tap text to edit · drag to move · arrows nudge",
    "Double-touchez un texte pour le modifier · glissez pour déplacer · flèches pour ajuster",
  ],
  noSelection: ["Nothing selected", "Aucune sélection"],
  deleted: ["Deleted", "Supprimé"],
} satisfies Record<string, [string, string]>;

export type CanvasString = keyof typeof S;
export function tx(key: CanvasString, lang: Lang = "en"): string {
  const v = S[key];
  return lang === "fr" ? v[1] : v[0];
}

/** a block kind in words (the layers list, screen-reader names): never the raw kind */
const KIND: Record<string, [string, string]> = {
  text: ["Text", "Texte"],
  image: ["Image", "Image"],
  shape: ["Shape", "Forme"],
  arrow: ["Arrow", "Flèche"],
  callout: ["Callout", "Bulle"],
  marker: ["Marker", "Repère"],
  diagram: ["Diagram", "Schéma"],
  instrument: ["Instrument", "Instrument"],
  simViewport: ["Simulator view", "Vue simulateur"],
  calc: ["Calculation", "Calcul"],
  checklist: ["Checklist", "Liste de vérification"],
  quiz: ["Question", "Question"],
};
export function blockKindLabel(kind: string, lang: Lang = "en"): string {
  const v = KIND[kind];
  return v ? (lang === "fr" ? v[1] : v[0]) : kind;
}
