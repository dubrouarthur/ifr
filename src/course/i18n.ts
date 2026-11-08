// Ground school — UI strings FR / EN for the academy host and the library (package I). Author content is L10n
// and never goes through this table. The language follows the app's switch (ui/i18n.ts: ifr.lang, else the
// browser), so the cockpit, Flight Center and the academy always agree.
import type { L10n, Lang } from "./types";
import {
  lang as appLang,
  onLangChange,
  setLang as setAppLang,
} from "../ui/i18n";

const EN = {
  groundSchool: "Library",
  groundSchoolLead:
    "The platform for aviation education: slides and a flight simulator in one tool, for aeroclubs and flight schools, from LAPL and PPL to IR and ATPL theory.",
  tileDesc: "Build courses with live instruments, teach them, fly them.",
  flightCenter: "Flight Center",
  openSim: "Open the Flight Center",
  search: "Search courses",
  searchShort: "Search",
  // filters
  fAll: "All",
  fAssigned: "Assigned",
  fClub: "Club",
  fSamples: "Samples",
  fDrafts: "My drafts",
  // tags
  tagAssigned: "Assigned",
  tagSample: "Sample",
  tagClub: "Club",
  tagDraft: "Draft",
  tagBriefing: "Briefing",
  builtIn: "Built in",
  you: "You",
  // meta
  steps: "{n} steps",
  steps1: "{n} step",
  minutes: "{n} min",
  editedAgo: "edited {ago}",
  notShared: "not shared",
  duplicateToAdapt: "duplicate to adapt",
  ofN: "{a} of {b}",
  // continue card
  continueAt: "Continue at step {n}",
  startCourse: "Start the course",
  startHere: "Start here",
  next: "Next: {t}",
  done: "Finished",
  replay: "Play again",
  byCfi: "by {name}",
  // instructor rail
  forInstructors: "For instructors",
  newCourse: "New course",
  newCourseDesc:
    "Start empty, from a sample, or from what you capture in the cockpit.",
  importSlides: "Import your slides",
  importSlidesDesc:
    "A PDF of your deck: each page becomes a step. Add live steps in between.",
  importCourse: "Import a course or club pack",
  importCourseDesc:
    ".ifrcourse files and club packs, with their procedures and flights.",
  present: "Present to a class",
  presentDesc:
    "Projector window and presenter notes on one laptop. A USB or Bluetooth clicker works.",
  aStepCanOpen: "A step can open",
  openFly: "any lesson, saved flight or scenario",
  openDrill: "a club procedure or checklist",
  openPlate: "any CIFP plate, hold or profile",
  andComesBack: "and comes back to the course with the result.",
  import: "Import",
  // card menu
  menu: "More actions for {t}",
  open: "Open",
  edit: "Edit",
  duplicate: "Duplicate",
  duplicateEdit: "Duplicate to edit",
  export: "Export file",
  shareLink: "Copy share link",
  markAssigned: "Mark as assigned",
  unmarkAssigned: "Remove from assigned",
  delete: "Delete",
  presentThis: "Present",
  // dialogs and toasts
  cancel: "Cancel",
  close: "Close",
  ok: "OK",
  deleteTitle: "Delete “{t}”?",
  deleteBody:
    "The course leaves this device. Your results stay in your records. Export it first if you may need it again.",
  deleteYes: "Delete course",
  deleted: "Course deleted",
  duplicated: "Copy saved: “{t}”",
  exported: "Exported {file}",
  exportFailed: "Export failed: {msg}",
  linkCopied: "Link copied",
  linkTooBig: "Too large for a link: export a file instead",
  linkImages: "This course has images: export a file to share it",
  importing: "Importing…",
  importDone: "Imported",
  importAdded: "{n} added",
  importReplaced: "{n} updated",
  importSkipped: "{n} skipped",
  importNothing: "Nothing to import in this file",
  importFailed: "Could not import: {msg}",
  pdfSoon:
    "PDF import needs the slide import module, which is not installed in this build. Export your deck as images and add them to a slide instead.",
  pickCourse: "Choose a course to present",
  created: "New course created",
  // storage nudges
  notSaved:
    "Not saved on this device (private browsing or blocked storage): export your work to a file.",
  keepTitle: "Keep your courses on this device",
  keepBodyIpad:
    "Safari may clear site data after 7 days without a visit. Add the app to your Home Screen, or export your courses.",
  keepBody: "Ask the browser to keep your courses even when storage runs low.",
  keepAsk: "Keep my courses",
  keepOk: "The browser will keep your courses",
  keepNo:
    "The browser did not promise to keep them: export your courses to be safe",
  exportNudge: "Not exported for {n} days",
  exportNow: "Export now",
  // empty states and errors
  emptyFilter: "No courses here yet",
  createFirst: "Create your first deck",
  createFirstBody:
    "Build a course with live instruments, teach it in class, then fly it in the built-in simulator. Start from a template: a cover, a diagram, a live instrument, a question.",
  slideDecks: "Slide decks",
  emptyFilterBody:
    "Samples are always available, and your own courses appear under My drafts.",
  emptySearch: "No course matches “{q}”",
  clearSearch: "Clear search",
  notFound: "Course not found",
  notFoundBody:
    "It is not on this device. Import the course file your instructor sent, or open a sample.",
  backToLibrary: "Back to the library",
  loading: "Loading…",
  shareOpened: "Course opened from a link",
  shareBad: "This link is damaged or incomplete",
  emptyCourse: "This course has no slide yet",
  emptyCourseBody: "Add a slide in the editor first, then present it or test it as a student.",
  backToEditor: "Back to the editor",
  // builder (fallback)
  builder: "Builder",
  builderPreview: "Preview",
  addSlide: "Add a slide",
  assetLibrary: "Library",
  chooseLayout: "Choose a layout",
  stepUp: "Move up",
  stepDown: "Move down",
  removeStep: "Delete step",
  notASlide:
    "This step is a Reader + Stage step. Preview it here; its full editor opens with the course editor.",
  savedHere: "Saved on this device",
  saving: "Saving…",
  saveFailed: "Not saved: {msg}",
  sampleCopy: "Samples are read-only: this is your copy.",
  undo: "Undo",
  redo: "Redo",
  // your turn (on a slide)
  yourTurn: "Your turn",
  backToSlide: "Back to the slide",
  yourTurnMet: "Done: {t}",
  yourTurnSim:
    "This Your turn opens the full simulator: fly it from the cockpit with the course open in another tab.",
  // presenter
  presentMissing:
    "The presenter console is not installed in this build: the course opens in the player instead.",
} as const;
export type CourseStringKey = keyof typeof EN;

const FR: Record<CourseStringKey, string> = {
  groundSchool: "Bibliothèque",
  groundSchoolLead:
    "La plateforme de l’éducation aéronautique : diapositives et simulateur de vol dans un seul outil, pour les aéroclubs et les écoles de pilotage, du LAPL et du PPL jusqu’à l’IR et la théorie ATPL.",
  tileDesc: "Créez des cours avec instruments en direct, enseignez-les, volez-les.",
  flightCenter: "Flight Center",
  openSim: "Ouvrir le Flight Center",
  search: "Rechercher un cours",
  searchShort: "Rechercher",
  fAll: "Tous",
  fAssigned: "Assignés",
  fClub: "Club",
  fSamples: "Exemples",
  fDrafts: "Mes brouillons",
  tagAssigned: "Assigné",
  tagSample: "Exemple",
  tagClub: "Club",
  tagDraft: "Brouillon",
  tagBriefing: "Briefing",
  builtIn: "Intégré",
  you: "Vous",
  steps: "{n} étapes",
  steps1: "{n} étape",
  minutes: "{n} min",
  editedAgo: "modifié {ago}",
  notShared: "non partagé",
  duplicateToAdapt: "à dupliquer pour l’adapter",
  ofN: "{a} sur {b}",
  continueAt: "Reprendre à l’étape {n}",
  startCourse: "Commencer le cours",
  startHere: "Pour commencer",
  next: "Ensuite : {t}",
  done: "Terminé",
  replay: "Recommencer",
  byCfi: "par {name}",
  forInstructors: "Pour les instructeurs",
  newCourse: "Nouveau cours",
  newCourseDesc:
    "Partez de zéro, d’un exemple ou de ce que vous capturez au cockpit.",
  importSlides: "Importer vos diapositives",
  importSlidesDesc:
    "Le PDF de votre présentation : chaque page devient une étape. Ajoutez des étapes interactives entre elles.",
  importCourse: "Importer un cours ou un pack club",
  importCourseDesc:
    "Fichiers .ifrcourse et packs club, avec leurs procédures et leurs vols.",
  present: "Présenter à une classe",
  presentDesc:
    "Fenêtre projecteur et notes du présentateur sur un seul ordinateur. Une télécommande USB ou Bluetooth fonctionne.",
  aStepCanOpen: "Une étape peut ouvrir",
  openFly: "une leçon, un vol enregistré ou un scénario",
  openDrill: "une procédure ou une check-list du club",
  openPlate: "une carte CIFP, une attente ou un profil",
  andComesBack: "et revient au cours avec le résultat.",
  import: "Importer",
  menu: "Autres actions pour {t}",
  open: "Ouvrir",
  edit: "Modifier",
  duplicate: "Dupliquer",
  duplicateEdit: "Dupliquer pour modifier",
  export: "Exporter le fichier",
  shareLink: "Copier le lien de partage",
  markAssigned: "Marquer comme assigné",
  unmarkAssigned: "Retirer des assignés",
  delete: "Supprimer",
  presentThis: "Présenter",
  cancel: "Annuler",
  close: "Fermer",
  ok: "OK",
  deleteTitle: "Supprimer « {t} » ?",
  deleteBody:
    "Le cours quitte cet appareil. Vos résultats restent dans vos relevés. Exportez-le d’abord si vous risquez d’en avoir besoin.",
  deleteYes: "Supprimer le cours",
  deleted: "Cours supprimé",
  duplicated: "Copie enregistrée : « {t} »",
  exported: "Exporté : {file}",
  exportFailed: "Échec de l’export : {msg}",
  linkCopied: "Lien copié",
  linkTooBig: "Trop volumineux pour un lien : exportez plutôt un fichier",
  linkImages:
    "Ce cours contient des images : exportez un fichier pour le partager",
  importing: "Import en cours…",
  importDone: "Importé",
  importAdded: "{n} ajouté(s)",
  importReplaced: "{n} mis à jour",
  importSkipped: "{n} ignoré(s)",
  importNothing: "Rien à importer dans ce fichier",
  importFailed: "Import impossible : {msg}",
  pdfSoon:
    "L’import PDF nécessite le module d’import de diapositives, absent de cette version. Exportez votre présentation en images et ajoutez-les à une diapositive.",
  pickCourse: "Choisissez un cours à présenter",
  created: "Nouveau cours créé",
  notSaved:
    "Non enregistré sur cet appareil (navigation privée ou stockage bloqué) : exportez votre travail dans un fichier.",
  keepTitle: "Gardez vos cours sur cet appareil",
  keepBodyIpad:
    "Safari peut effacer les données d’un site après 7 jours sans visite. Ajoutez l’application à l’écran d’accueil, ou exportez vos cours.",
  keepBody:
    "Demandez au navigateur de conserver vos cours même quand l’espace manque.",
  keepAsk: "Conserver mes cours",
  keepOk: "Le navigateur conservera vos cours",
  keepNo: "Le navigateur n’a rien promis : exportez vos cours par sécurité",
  exportNudge: "Non exporté depuis {n} jours",
  exportNow: "Exporter",
  emptyFilter: "Aucun cours ici pour l’instant",
  createFirst: "Créez votre premier cours",
  createFirstBody:
    "Créez un cours avec des instruments en direct, enseignez-le en salle, puis volez-le dans le simulateur intégré. Partez d’un modèle : une couverture, un schéma, un instrument en direct, une question.",
  slideDecks: "Cours en diapositives",
  emptyFilterBody:
    "Les exemples sont toujours disponibles, et vos cours apparaissent dans Mes brouillons.",
  emptySearch: "Aucun cours ne correspond à « {q} »",
  clearSearch: "Effacer la recherche",
  notFound: "Cours introuvable",
  notFoundBody:
    "Il n’est pas sur cet appareil. Importez le fichier envoyé par votre instructeur, ou ouvrez un exemple.",
  backToLibrary: "Retour à la bibliothèque",
  loading: "Chargement…",
  shareOpened: "Cours ouvert depuis un lien",
  shareBad: "Ce lien est abîmé ou incomplet",
  emptyCourse: "Ce cours n’a pas encore de diapo",
  emptyCourseBody: "Ajoutez d’abord une diapo dans l’éditeur, puis présentez-le ou testez-le comme élève.",
  backToEditor: "Retour à l’éditeur",
  builder: "Éditeur",
  builderPreview: "Aperçu",
  addSlide: "Ajouter une diapositive",
  assetLibrary: "Bibliothèque",
  chooseLayout: "Choisir une mise en page",
  stepUp: "Monter",
  stepDown: "Descendre",
  removeStep: "Supprimer l’étape",
  notASlide:
    "Cette étape est une étape Lecteur + Scène. Prévisualisez-la ici ; son éditeur complet s’ouvre avec l’éditeur de cours.",
  savedHere: "Enregistré sur cet appareil",
  saving: "Enregistrement…",
  saveFailed: "Non enregistré : {msg}",
  sampleCopy: "Les exemples sont en lecture seule : voici votre copie.",
  undo: "Annuler",
  redo: "Rétablir",
  yourTurn: "À vous",
  backToSlide: "Retour à la diapositive",
  yourTurnMet: "Réussi : {t}",
  yourTurnSim:
    "Ce « À vous » ouvre le simulateur complet : volez-le au cockpit, le cours ouvert dans un autre onglet.",
  presentMissing:
    "La console du présentateur n’est pas installée dans cette version : le cours s’ouvre dans le lecteur.",
};

const TABLE: Record<Lang, Record<CourseStringKey, string>> = { en: EN, fr: FR };

/** A UI string in `l`, with {name} placeholders filled. */
export function ct(
  key: CourseStringKey,
  l: Lang,
  vars?: Record<string, string | number>,
): string {
  const s = TABLE[l]?.[key] ?? EN[key] ?? key;
  return vars
    ? s.replace(/\{(\w+)\}/g, (m, k: string) =>
        k in vars ? String(vars[k]) : m,
      )
    : s;
}
/** "{n} steps" with the singular where the language wants it (FR: 0 and 1). */
export function ctSteps(n: number, l: Lang): string {
  const one = l === "fr" ? Math.abs(n) < 2 : n === 1;
  return ct(one ? "steps1" : "steps", l, { n });
}
/** Author text in `l` (a missing French text falls back to English). */
export function loc(t: L10n | undefined, l: Lang): string {
  if (!t) return "";
  return (l === "fr" ? t.fr?.trim() || t.en : t.en) ?? "";
}
/** Whether `t` lacks the language (the "EN" marker). */
export const isFallback = (t: L10n | undefined, l: Lang): boolean =>
  l === "fr" && !!t && !t.fr?.trim() && !!t.en.trim();

/** The app language (shared with the cockpit and Flight Center). */
export const courseLang = (): Lang => appLang();
export const setCourseLang = (l: Lang): void => setAppLang(l);
export const onCourseLang = (f: (l: Lang) => void): (() => void) =>
  onLangChange(f);

/** "today", "yesterday", "3 days ago", "12 Mar" — in `l`. */
export function agoText(iso: string, l: Lang, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = Math.floor((now - t) / 86_400_000);
  if (l === "fr") {
    if (d <= 0) return "aujourd’hui";
    if (d === 1) return "hier";
    if (d < 7) return `il y a ${d} jours`;
    return new Date(t).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
    });
  }
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
