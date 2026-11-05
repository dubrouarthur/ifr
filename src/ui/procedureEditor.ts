// Procedure editor (flying-club procedures mode): the club customises its checklists here. Procedures are not
// flights, so they have their own editor; drills (scenarios) stay in the flight builder.
//
//   openProcedureEditor({ id?, failure?, lang?, onSaved? })
//       id: a club procedure (edited), a library procedure (read-only, with 'Customise for the club'), or none:
//       a new club procedure (answering `failure` when given). Stacks over the Flight Center / flight builder.
//   openShareDialog(procedure | pack)   share link + QR code + copy
//   pIcon(name), CAT_ICONS              line icons of the procedures mode (categories, item actions)
//
// Pure editor model (tested in tests/club-hub.test.ts): addItem / duplicateItem / moveItem / removeItem,
// setItemCheck / setCheckParam / visibleParams, cleanDraft (draft -> Procedure), editorIssues (live validation),
// previewModel (exactly what the student sees in training mode), gradingSummary (plain-language rules).
import { h, clear } from "./dom";
import { Modal } from "./modals";
import {
  registerStrings,
  t,
  tn,
  lang as uiLang,
  setLang,
  type UiLang,
} from "./i18n";
import {
  CHECKS,
  CHECK_IDS,
  checkDef,
  checkLabel,
  defaultParams,
  type CheckParam,
  type CheckParamOption,
  type ParamValue,
} from "../train/procedureChecks";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  DISCLAIMER,
  libraryProcedure,
} from "../train/procedureLibrary";
import {
  clubOverride,
  customise,
  deleteProcedure,
  getProcedure,
  newProcedure,
  resetToLibrary,
  saveProcedure,
  shareLink,
  validateProcedure,
  type ClubPack,
  type ValidationIssue,
} from "../train/procedureStore";
import { PASS_MARK } from "../train/procedures";
import {
  FAILURE_GROUPS,
  FAILURE_LABELS_EN,
  FAILURE_LABELS_FR,
  type FailureKey,
} from "../sim/systemsTypes";
import type {
  CheckId,
  CheckRef,
  Lang,
  ProcCategory,
  ProcItem,
  Procedure,
} from "../train/procedureTypes";

// ------------------------------------------------------------------ icons (line icons, 24-unit grid)
const PATHS = {
  engine:
    "M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4M12 10c-1.6-2.4-1.6-5 0-7c1.6 2 1.6 4.6 0 7M13.8 13c2.8-.2 5 1.1 6 3.3c-2.4.4-4.6-.6-6-3.3M10.2 13c-1.4 2.7-3.6 3.7-6 3.3c1-2.2 3.2-3.5 6-3.3",
  fire: "M12 3c.6 3.2 5 5.2 5 10a5 5 0 0 1-10 0c0-2.2 1-3.8 2.2-4.8c0 2 .9 3.2 2.1 3.2c0-3.2-1.1-5.2.7-8.4z",
  electrical: "M13 2L5 13.5h6.5L10.5 22 19 10h-6.5z",
  instruments:
    "M12 21a9 9 0 1 1 0-18a9 9 0 0 1 0 18zM12 12l4.2-3.6M6.5 12h1.2M12 6.5v1.2M16.3 12h1.2M8.1 8.1l.8.8",
  avionics: "M3 5h18v12H3zM8 21h8M12 17v4M7 9h4M7 13h7",
  comms: "M4 15v-3a8 8 0 0 1 16 0v3M4 14h3v6H4zM17 14h3v6h-3z",
  flight: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3.2 13h17.6M8.5 9.5h7",
  other: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  copy: "M8 8h11v13H8zM5 16V3h11",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6",
  share: "M12 15V3M7 8l5-5 5 5M5 13v8h14v-8",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  upload: "M12 16V5M7 10l5-5 5 5M5 20h14",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 19h2M19 14h1",
  plus: "M12 5v14M5 12h14",
  search: "M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14M16.2 16.2L20 20",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4",
  users:
    "M9 11a3 3 0 1 0 0-6a3 3 0 1 0 0 6M3 20a6 6 0 0 1 12 0M16 5.2a3 3 0 0 1 0 5.6M21 20a6 6 0 0 0-3.6-5.5",
  play: "M8 5l11 7-11 7z",
  check: "M4 12l5 5L20 6",
  x: "M6 6l12 12M18 6L6 18",
  warn: "M12 4l9 16H3zM12 10v4M12 17v.01",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h7",
  clock: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3 2",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  drill: "M12 4l9 16H3zM12 10v4M12 17v.01",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6",
} as const;
export type PIcon = keyof typeof PATHS;
export const CAT_ICONS: Record<ProcCategory, PIcon> = {
  engine: "engine",
  fire: "fire",
  electrical: "electrical",
  instruments: "instruments",
  avionics: "avionics",
  comms: "comms",
  flight: "flight",
  other: "other",
};

/** a line icon of the procedures mode */
export function pIcon(name: PIcon, size = 16): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", String(size));
  s.setAttribute("height", String(size));
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "1.6");
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("class", "ico");
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", PATHS[name]);
  s.append(p);
  return s;
}

// ------------------------------------------------------------------ strings
registerStrings("en", {
  "pe.title.new": "New procedure",
  "pe.title.edit": "Edit procedure",
  "pe.title.custom": "Customise for the club",
  "pe.title.lib": "Library procedure",
  "pe.badge.lib": "Library",
  "pe.badge.club": "Club",
  "pe.badge.custom": "Club · customised",
  "pe.libBanner":
    "Paraphrased from the POH and the rules, read-only. Customise it to make your club’s version: students then fly yours, and the library one stays available.",
  "pe.libOverridden":
    "Your club already has its own version of this procedure.",
  "pe.openClub": "Open the club version",
  "pe.customise": "Customise for the club",
  "pe.basedOn": "Customised from the library procedure “{t}”.",
  "pe.s.about": "About",
  "pe.s.aboutHint":
    "What it is called, for which aircraft and in which language",
  "pe.s.failures": "Failures it answers",
  "pe.s.failuresHint":
    "A drill with one of these failures starts this procedure",
  "pe.s.path": "Flight path and order",
  "pe.s.pathHint": "What the student must hold while running it",
  "pe.s.items": "Checklist items",
  "pe.s.itemsHint":
    "In order, as the student reads them. Memory items come first.",
  "pe.f.title": "Title",
  "pe.f.titlePh": "e.g. Engine failure in flight",
  "pe.f.category": "Category",
  "pe.f.aircraft": "Aircraft",
  "pe.f.lang": "Language of the text",
  "pe.f.ref": "Reference",
  "pe.f.refPh": "e.g. POH section 3, club SOP 2026",
  "pe.f.summary": "One-line summary",
  "pe.f.summaryPh": "Shown on the library card",
  "pe.f.ias": "Hold an airspeed band",
  "pe.f.iasMin": "Min",
  "pe.f.iasMax": "Max",
  "pe.f.bank": "Limit the bank",
  "pe.f.bankMax": "Max bank",
  "pe.f.ordered": "Items must be done in order",
  "pe.f.orderedHint": "Memory items are always graded in order.",
  "pe.f.none": "No failure: the procedure is only started by hand.",
  "pe.i.text": "Item {n}",
  "pe.i.textPh": "Challenge — response, e.g. Mixture — IDLE CUT-OFF",
  "pe.i.check": "Checked by",
  "pe.i.memory": "Memory item",
  "pe.i.memoryTip": "Done from memory, before the checklist is opened",
  "pe.i.optional": "Optional",
  "pe.i.optionalTip": "A bonus when done, never a fail",
  "pe.i.safety": "Safety-critical",
  "pe.i.safetyTip": "Missed or late = FAIL",
  "pe.i.limit": "Time limit",
  "pe.i.limitNone": "none",
  "pe.i.note": "Note",
  "pe.i.notePh":
    "Why, or a tip shown in training and in the debrief (optional)",
  "pe.i.up": "Move up",
  "pe.i.down": "Move down",
  "pe.i.dup": "Duplicate",
  "pe.i.del": "Delete item",
  "pe.i.add": "Add an item",
  "pe.k.action": "A control the pilot moves",
  "pe.k.path": "What the aircraft holds",
  "pe.k.outcome": "The outcome",
  "pe.k.manual": "Done button / callout",
  "pe.pv.head": "As the student sees it",
  "pe.pv.training": "Training",
  "pe.pv.test": "Test",
  "pe.pv.memory": "Memory items",
  "pe.pv.checklist": "Checklist",
  "pe.pv.open": "Open the checklist",
  "pe.pv.done": "Done",
  "pe.pv.within": "within {s} s",
  "pe.pv.empty": "Add an item to see the checklist.",
  "pe.pv.testNote":
    "In a test the student sees only this button and the time. Opening the checklist is recorded; the procedure is graded at the end.",
  "pe.pv.untitled": "Untitled procedure",
  "pe.pv.hold": "Hold {a}",
  "pe.pv.bank": "bank ≤ {b}°",
  "pe.g.head": "How it is graded",
  "pe.g.score":
    "Score out of 100: items 70, flight path 20, reaction time 10 (no flight-path target: items 90).",
  "pe.g.memory": "{n} memory items: from memory, in order, before the checklist is opened.",
  "pe.g.memory.1": "1 memory item: from memory, before the checklist is opened.",
  "pe.g.noMemory": "No memory item: everything is read from the checklist.",
  "pe.g.safety": "{n} safety-critical items (*): missed or late means FAIL.",
  "pe.g.safety.1": "1 safety-critical item (*): missed or late means FAIL.",
  "pe.g.ordered": "All items in order.",
  "pe.g.anyOrder": "Any order (memory items in order).",
  "pe.g.fail":
    "PASS from {p}/100, unless a memory or safety-critical item is missed or late.",
  "pe.v.ok": "Ready to save",
  "pe.v.n": "{n} things to fix",
  "pe.v.n.1": "1 thing to fix",
  "pe.save": "Save to the club",
  "pe.saved": "Saved",
  "pe.cancel": "Cancel",
  "pe.close": "Close",
  "pe.ro": "Library procedure · read-only",
  "pe.delete": "Delete",
  "pe.reset": "Reset to library",
  "pe.share": "Share",
  "pe.sure.delete": "Delete this procedure for the whole club?",
  "pe.sure.reset": "Drop the club version and use the library one again?",
  "pe.sure.discard": "Discard your changes?",
  "pe.keep": "Keep editing",
  "pe.no": "No, keep it",
  "pe.discard": "Discard",
  "pe.yesDelete": "Delete",
  "pe.yesReset": "Reset",
  "pe.tab.edit": "Edit",
  "pe.tab.preview": "Preview",
  "pe.ui": "Screen language",
  "pe.sh.title": "Share",
  "pe.sh.proc":
    "Anyone who opens this link (or scans the code) can import “{t}” into their club library.",
  "pe.sh.pack": "Anyone who opens this link (or scans the code) can import the {n} procedures of {c}.",
  "pe.sh.pack.1": "Anyone who opens this link (or scans the code) can import the procedure of {c}.",
  "pe.sh.copy": "Copy link",
  "pe.sh.copied": "Copied",
  "pe.sh.long":
    "This link is long: for a big pack, the JSON file is easier to pass around.",
  "pe.sh.club": "your club",
  "pe.grp.engine": "Engine & fuel",
  "pe.grp.electrical": "Electrical",
  "pe.grp.instruments": "Flight instruments",
  "pe.grp.avionics": "Avionics & radios",
  "pe.grp.other": "Other",
});
registerStrings("fr", {
  "pe.title.new": "Nouvelle procédure",
  "pe.title.edit": "Modifier la procédure",
  "pe.title.custom": "Personnaliser pour le club",
  "pe.title.lib": "Procédure de la bibliothèque",
  "pe.badge.lib": "Bibliothèque",
  "pe.badge.club": "Club",
  "pe.badge.custom": "Club · personnalisée",
  "pe.libBanner":
    "Reformulée d’après le manuel de vol et la réglementation, en lecture seule. Personnalisez-la pour créer la version de votre club : les élèves voleront la vôtre, celle de la bibliothèque reste disponible.",
  "pe.libOverridden": "Votre club a déjà sa propre version de cette procédure.",
  "pe.openClub": "Ouvrir la version du club",
  "pe.customise": "Personnaliser pour le club",
  "pe.basedOn":
    "Personnalisée à partir de la procédure « {t} » de la bibliothèque.",
  "pe.s.about": "Présentation",
  "pe.s.aboutHint": "Son nom, l’avion concerné et la langue",
  "pe.s.failures": "Pannes traitées",
  "pe.s.failuresHint":
    "Un exercice avec l’une de ces pannes lance cette procédure",
  "pe.s.path": "Trajectoire et ordre",
  "pe.s.pathHint": "Ce que l’élève doit tenir pendant la procédure",
  "pe.s.items": "Points de la check-list",
  "pe.s.itemsHint": "Dans l’ordre de lecture. Les actions réflexes d’abord.",
  "pe.f.title": "Titre",
  "pe.f.titlePh": "ex. Panne moteur en vol",
  "pe.f.category": "Catégorie",
  "pe.f.aircraft": "Avion",
  "pe.f.lang": "Langue du texte",
  "pe.f.ref": "Référence",
  "pe.f.refPh": "ex. Manuel de vol section 3, consignes club 2026",
  "pe.f.summary": "Résumé en une ligne",
  "pe.f.summaryPh": "Affiché sur la fiche de la bibliothèque",
  "pe.f.ias": "Tenir une plage de vitesse",
  "pe.f.iasMin": "Min",
  "pe.f.iasMax": "Max",
  "pe.f.bank": "Limiter l’inclinaison",
  "pe.f.bankMax": "Inclinaison max",
  "pe.f.ordered": "Les points doivent être faits dans l’ordre",
  "pe.f.orderedHint": "Les actions réflexes sont toujours notées dans l’ordre.",
  "pe.f.none": "Aucune panne : la procédure ne se lance qu’à la main.",
  "pe.i.text": "Point {n}",
  "pe.i.textPh": "Commande — action, ex. Mélange — ÉTOUFFOIR",
  "pe.i.check": "Vérifié par",
  "pe.i.memory": "Action réflexe",
  "pe.i.memoryTip": "Faite de mémoire, avant d’ouvrir la check-list",
  "pe.i.optional": "Facultatif",
  "pe.i.optionalTip": "Un bonus s’il est fait, jamais un échec",
  "pe.i.safety": "Critique",
  "pe.i.safetyTip": "Oublié ou en retard = ÉCHEC",
  "pe.i.limit": "Délai",
  "pe.i.limitNone": "aucun",
  "pe.i.note": "Note",
  "pe.i.notePh":
    "Pourquoi, ou un conseil affiché en entraînement et au débriefing (facultatif)",
  "pe.i.up": "Monter",
  "pe.i.down": "Descendre",
  "pe.i.dup": "Dupliquer",
  "pe.i.del": "Supprimer le point",
  "pe.i.add": "Ajouter un point",
  "pe.k.action": "Une commande que le pilote actionne",
  "pe.k.path": "Ce que l’avion doit tenir",
  "pe.k.outcome": "Le résultat",
  "pe.k.manual": "Bouton Fait / annonce",
  "pe.pv.head": "Ce que voit l’élève",
  "pe.pv.training": "Entraînement",
  "pe.pv.test": "Contrôle",
  "pe.pv.memory": "Actions réflexes",
  "pe.pv.checklist": "Check-list",
  "pe.pv.open": "Ouvrir la check-list",
  "pe.pv.done": "Fait",
  "pe.pv.within": "en {s} s",
  "pe.pv.empty": "Ajoutez un point pour voir la check-list.",
  "pe.pv.testNote":
    "En contrôle, l’élève ne voit que ce bouton et le temps. L’ouverture de la check-list est enregistrée ; la procédure est notée à la fin.",
  "pe.pv.untitled": "Procédure sans titre",
  "pe.pv.hold": "Tenir {a}",
  "pe.pv.bank": "inclinaison ≤ {b}°",
  "pe.g.head": "Comment c’est noté",
  "pe.g.score":
    "Note sur 100 : points de la check-list 70, trajectoire 20, temps de réaction 10 (sans cible de trajectoire : check-list 90).",
  "pe.g.memory": "{n} actions réflexes : de mémoire, dans l’ordre, avant d’ouvrir la check-list.",
  "pe.g.memory.1": "1 action réflexe : de mémoire, avant d’ouvrir la check-list.",
  "pe.g.noMemory": "Aucune action réflexe : tout se lit sur la check-list.",
  "pe.g.safety": "{n} points critiques (*) : oublié ou en retard = ÉCHEC.",
  "pe.g.safety.1": "1 point critique (*) : oublié ou en retard = ÉCHEC.",
  "pe.g.ordered": "Tous les points dans l’ordre.",
  "pe.g.anyOrder": "Ordre libre (actions réflexes dans l’ordre).",
  "pe.g.fail":
    "RÉUSSI à partir de {p}/100, sauf si une action réflexe ou un point critique est oublié ou en retard.",
  "pe.v.ok": "Prête à enregistrer",
  "pe.v.n": "{n} points à corriger",
  "pe.v.n.1": "1 point à corriger",
  "pe.save": "Enregistrer pour le club",
  "pe.saved": "Enregistrée",
  "pe.cancel": "Annuler",
  "pe.close": "Fermer",
  "pe.ro": "Procédure de la bibliothèque · lecture seule",
  "pe.delete": "Supprimer",
  "pe.reset": "Revenir à la bibliothèque",
  "pe.share": "Partager",
  "pe.sure.delete": "Supprimer cette procédure pour tout le club ?",
  "pe.sure.reset":
    "Abandonner la version du club et reprendre celle de la bibliothèque ?",
  "pe.sure.discard": "Abandonner vos modifications ?",
  "pe.keep": "Continuer à modifier",
  "pe.no": "Non, garder",
  "pe.discard": "Abandonner",
  "pe.yesDelete": "Supprimer",
  "pe.yesReset": "Reprendre la bibliothèque",
  "pe.tab.edit": "Modifier",
  "pe.tab.preview": "Aperçu",
  "pe.ui": "Langue de l’écran",
  "pe.sh.title": "Partager",
  "pe.sh.proc":
    "Toute personne qui ouvre ce lien (ou scanne le code) peut importer « {t} » dans la bibliothèque de son club.",
  "pe.sh.pack": "Toute personne qui ouvre ce lien (ou scanne le code) peut importer les {n} procédures de {c}.",
  "pe.sh.pack.1": "Toute personne qui ouvre ce lien (ou scanne le code) peut importer la procédure de {c}.",
  "pe.sh.copy": "Copier le lien",
  "pe.sh.copied": "Copié",
  "pe.sh.long":
    "Ce lien est long : pour un gros pack, le fichier JSON est plus simple à transmettre.",
  "pe.sh.club": "votre club",
  "pe.grp.engine": "Moteur et carburant",
  "pe.grp.electrical": "Électricité",
  "pe.grp.instruments": "Instruments de vol",
  "pe.grp.avionics": "Avionique et radios",
  "pe.grp.other": "Autres",
});

const L = (): Lang => (uiLang() === "fr" ? "fr" : "en");
// 'gs' reads 'Glide' in FAILURE_LABELS_FR (not French for the glideslope): plain French here until systems-core fixes it
const FR_FIX: Partial<Record<FailureKey, string>> = { gs: "Plan de descente (glide)" };
export const failureName = (k: FailureKey, lang: Lang = L()) =>
  (lang === "fr" ? (FR_FIX[k] ?? FAILURE_LABELS_FR[k]) : FAILURE_LABELS_EN[k]) ?? k;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// ------------------------------------------------------------------ pure editor model
/** a fresh item id that is not used in the procedure ('i1', 'i2', ...) */
export function nextItemId(p: Procedure): string {
  const used = new Set(p.items.map((i) => i.id));
  let n = p.items.length + 1;
  while (used.has(`i${n}`)) n++;
  return `i${n}`;
}

/** insert a blank item after `after` (default: at the end); returns its index */
export function addItem(p: Procedure, after = p.items.length - 1): number {
  const at = Math.max(0, Math.min(p.items.length, after + 1));
  p.items.splice(at, 0, {
    id: nextItemId(p),
    text: "",
    memory: false,
    check: { id: "manual" },
  });
  return at;
}

/** copy item `i` right below it (new id); returns the copy's index */
export function duplicateItem(p: Procedure, i: number): number {
  const src = p.items[i];
  if (!src) return -1;
  const copy = { ...clone(src), id: nextItemId(p) };
  p.items.splice(i + 1, 0, copy);
  return i + 1;
}

/** move item `i` up (-1) or down (+1); returns its new index (unchanged at the ends) */
export function moveItem(p: Procedure, i: number, d: -1 | 1): number {
  const j = i + d;
  if (i < 0 || i >= p.items.length || j < 0 || j >= p.items.length) return i;
  [p.items[i], p.items[j]] = [p.items[j], p.items[i]];
  return j;
}

export function removeItem(p: Procedure, i: number): void {
  if (i >= 0 && i < p.items.length) p.items.splice(i, 1);
}

/** change how an item is checked: the catalogue's default parameters */
export function setItemCheck(it: ProcItem, id: CheckId): void {
  if (it.check?.id === id) return;
  const prm = defaultParams(id);
  it.check = Object.keys(prm).length ? { id, p: prm } : { id };
}

export function setCheckParam(
  it: ProcItem,
  name: string,
  v: ParamValue | undefined,
): void {
  if (!it.check) return;
  const p = { ...(it.check.p ?? {}) };
  if (v === undefined || v === "") delete p[name];
  else p[name] = v;
  // the 'value' of a switch depends on which control it is: a new control gets its own default position
  if (it.check.id === "switch" && name === "key") {
    const opts = paramOptions(CHECKS.switch.params[1], p) ?? [];
    if (!opts.some((o) => String(o.value) === String(p.value)))
      p.value = opts[opts.length > 1 ? 1 : 0]?.value ?? false;
    if (v !== "mixture") delete p.op;
  }
  it.check = { id: it.check.id, p };
}

/** while the author has not written their own text, an item's text follows its machine check (in the procedure's
 *  language): picking 'Mixture — IDLE CUT-OFF' writes it. Returns true when the text changed. */
export function syncText(it: ProcItem, before: CheckRef | undefined, lang: Lang): boolean {
  const auto = (c: CheckRef | undefined) => (c && c.id !== "manual" && checkDef(c) ? checkLabel(c, lang) : "");
  const cur = it.text.trim();
  if (cur && cur !== auto(before)) return false;
  const now = auto(it.check);
  if (now === it.text || (!now && !cur)) return false;
  it.text = now;
  return true;
}

/** the parameter fields that apply to a check right now (showIf) */
export function visibleParams(it: ProcItem): CheckParam[] {
  const d = checkDef(it.check);
  if (!d) return [];
  const p = it.check?.p ?? {};
  return d.params.filter((x) => !x.showIf || x.showIf(p));
}

export function paramOptions(
  prm: CheckParam,
  p: Record<string, ParamValue>,
): CheckParamOption[] | null {
  return (prm.optionsFor ? prm.optionsFor(p) : null) ?? prm.options ?? null;
}

/** a number parameter that is a 0..1 lever position (the throttle): the editor shows it in % */
export const isFraction = (prm: CheckParam) =>
  prm.type === "number" && prm.min === 0 && prm.max === 1 && !prm.unit;
/** 'Throttle (0 idle – 1 full)' -> 'Throttle (%)': the label of a 0..1 parameter typed in % */
export const pctLabel = (prm: CheckParam, lang: Lang) =>
  `${prm.label[lang].replace(/\s*\(.*\)\s*$/, "")} (%)`;

const trimOrUndef = (s: string | undefined) => {
  const v = (s ?? "").trim();
  return v ? v : undefined;
};

/** the procedure the editor saves: trimmed texts, no empty optional fields, no hidden check parameters */
export function cleanDraft(d: Procedure): Procedure {
  const p = clone(d);
  p.title = (p.title ?? "").trim();
  p.aircraft = (p.aircraft ?? "").trim();
  p.ref = trimOrUndef(p.ref);
  p.summary = trimOrUndef(p.summary);
  if (!p.ref) delete p.ref;
  if (!p.summary) delete p.summary;
  p.failures = [...new Set(p.failures)];
  p.disclaimer =
    p.lang === "fr" || p.lang === "en" ? DISCLAIMER[p.lang] : p.disclaimer;
  p.items = p.items.map((it) => {
    const o: ProcItem = {
      id: it.id,
      text: (it.text ?? "").trim(),
      memory: !!it.memory,
    };
    if (it.check) {
      const def = checkDef(it.check);
      const vis = new Set(
        def
          ? visibleParams(it).map((x) => x.name)
          : Object.keys(it.check.p ?? {}),
      );
      const prm = Object.fromEntries(
        Object.entries(it.check.p ?? {}).filter(
          ([k, v]) => vis.has(k) && v !== "" && v !== undefined,
        ),
      );
      o.check = Object.keys(prm).length
        ? { id: it.check.id, p: prm }
        : { id: it.check.id };
    }
    if (
      it.withinS !== undefined &&
      it.withinS !== null &&
      !(typeof it.withinS === "number" && Number.isNaN(it.withinS))
    )
      o.withinS = Number(it.withinS);
    if (it.optional) o.optional = true;
    if (it.safety !== undefined) o.safety = it.safety;
    const note = trimOrUndef(it.note);
    if (note) o.note = note;
    return o;
  });
  if (p.targets) {
    const tg: NonNullable<Procedure["targets"]> = {};
    if (p.targets.iasKt)
      tg.iasKt = [Number(p.targets.iasKt[0]), Number(p.targets.iasKt[1])];
    if (p.targets.maxBankDeg !== undefined && p.targets.maxBankDeg !== null)
      tg.maxBankDeg = Number(p.targets.maxBankDeg);
    if (tg.iasKt || tg.maxBankDeg !== undefined) p.targets = tg;
    else delete p.targets;
  }
  p.source = "club";
  return p;
}

/** live validation of the draft (the store's rules), in the UI language */
export function editorIssues(
  d: Procedure,
  lang: Lang = L(),
): ValidationIssue[] {
  return validateProcedure(cleanDraft(d), lang);
}

/** the issues of one field ('title', 'targets.iasKt') or of one item and its fields ('items[2]') */
export function issuesAt(
  issues: ValidationIssue[],
  path: string,
): ValidationIssue[] {
  return issues.filter(
    (i) =>
      i.path === path ||
      i.path.startsWith(`${path}.`) ||
      i.path.startsWith(`${path}[`),
  );
}

/** an item's effective safety-critical flag (default: a memory item with a time limit) */
export const isSafetyItem = (it: ProcItem) =>
  it.safety ?? (it.memory && it.withinS !== undefined);
const isManualItem = (it: ProcItem) =>
  !it.check || it.check.id === "manual" || !checkDef(it.check);

export interface PreviewItem {
  n: number;
  id: string;
  text: string;
  /** the machine-checked condition in plain words ('' for Done-button items) */
  check: string;
  manual: boolean;
  withinS?: number;
  optional: boolean;
  safety: boolean;
  note?: string;
}
export interface PreviewModel {
  title: string;
  /** the failure announced on the emergency card */
  failure: string;
  targets: string | null;
  memory: PreviewItem[];
  checklist: PreviewItem[];
  ref?: string;
  disclaimer: string;
}

/** exactly what the in-flight panel shows in training mode, in the procedure's own language */
export function previewModel(d: Procedure): PreviewModel {
  const lang: Lang = d.lang === "fr" ? "fr" : "en";
  const fr = lang === "fr";
  const items: PreviewItem[] = d.items.map((it, i) => ({
    n: i + 1,
    id: it.id,
    text:
      it.text.trim() ||
      (it.check && !isManualItem(it) ? checkLabel(it.check, lang) : ""),
    check: isManualItem(it) ? "" : checkLabel(it.check, lang),
    manual: isManualItem(it),
    withinS: it.withinS,
    optional: !!it.optional,
    safety: isSafetyItem(it),
    note: it.note?.trim() || undefined,
  }));
  const tg: string[] = [];
  if (d.targets?.iasKt) {
    const [a, b] = d.targets.iasKt;
    tg.push(
      `${fr ? "Tenir" : "Hold"} ${Math.round((a + b) / 2)} kt (${a}–${b})`,
    );
  }
  if (d.targets?.maxBankDeg !== undefined)
    tg.push(`${fr ? "inclinaison" : "bank"} ≤ ${d.targets.maxBankDeg}°`);
  return {
    title:
      d.title.trim() || (fr ? "Procédure sans titre" : "Untitled procedure"),
    failure: d.failures.length
      ? failureName(d.failures[0], lang)
      : d.title.trim() || (fr ? "Procédure" : "Procedure"),
    targets: tg.length ? tg.join(" · ") : null,
    memory: items.filter((_, i) => d.items[i].memory),
    checklist: items.filter((_, i) => !d.items[i].memory),
    ref: d.ref?.trim() || undefined,
    disclaimer: DISCLAIMER[lang],
  };
}

/** the grading rules of this procedure, in plain language (UI language) */
export function gradingSummary(d: Procedure): string[] {
  const mem = d.items.filter((i) => i.memory).length;
  const safety = d.items.filter(isSafetyItem).length;
  return [
    mem ? tn("pe.g.memory", mem) : t("pe.g.noMemory"),
    ...(safety ? [tn("pe.g.safety", safety)] : []),
    d.ordered ? t("pe.g.ordered") : t("pe.g.anyOrder"),
    t("pe.g.score"),
    t("pe.g.fail", { p: PASS_MARK }),
  ];
}

// ------------------------------------------------------------------ stacked modal (opens over the hub / builder)
class StackedModal extends Modal {
  constructor(title: string, size: "" | "sm" | "md" = "") {
    super(title, size);
    // Esc closes only the window on top (main.ts would close every window)
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== "Escape" || !this.isOpen || Modal.stack[Modal.stack.length - 1] !== this) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        this.requestClose();
      },
      true,
    );
  }
  /** the close button, the backdrop and Esc (the editor asks before discarding changes) */
  requestClose() {
    this.close();
  }
  close() {
    super.close();
    // a one-off window (share dialog) leaves the page
    if (this.disposable) this.bg.remove();
  }
  disposable = false;
  open() {
    if (this.isOpen) return;
    // over the Flight Center or the flight builder: they stay open underneath
    document.body.append(this.bg);
    this.bg.classList.add("open");
    Modal.stack.push(this);
  }
}

// ------------------------------------------------------------------ share dialog
async function qrSvg(text: string, px: number): Promise<SVGSVGElement | null> {
  try {
    const { default: qrcode } = await import("qrcode-generator");
    const qr = qrcode(0, "L");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const q = 4;
    let d = "";
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; ) {
        if (!qr.isDark(r, c)) {
          c++;
          continue;
        }
        const s = c;
        while (c < n && qr.isDark(r, c)) c++;
        d += `M${s + q} ${r + q}h${c - s}v1h${s - c}z`;
      }
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    const size = n + q * 2;
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.setAttribute("width", String(px));
    svg.setAttribute("height", String(px));
    svg.setAttribute("shape-rendering", "crispEdges");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "QR code");
    const bg = document.createElementNS(ns, "rect");
    bg.setAttribute("width", String(size));
    bg.setAttribute("height", String(size));
    bg.setAttribute("fill", "#fff");
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", "#0f1722");
    svg.append(bg, p);
    return svg;
  } catch {
    return null; // too long for a QR code: the link alone
  }
}

let shareModal: StackedModal | null = null;
/** share link + QR code + copy for one procedure or a whole club pack */
export function openShareDialog(x: Procedure | ClubPack): void {
  const isPack = (x as ClubPack).format === "ifr-club-pack";
  const url = shareLink(x);
  shareModal?.close();
  const m = new StackedModal(t("pe.sh.title"), "sm");
  m.disposable = true;
  shareModal = m;
  m.box.classList.add("pe-share");
  m.foot.remove();
  const title = m.box.querySelector("header h2")!;
  title.textContent = isPack
    ? t("pe.sh.title")
    : `${t("pe.sh.title")} · ${(x as Procedure).title}`;
  const input = h("input", {
    type: "text",
    readonly: true,
    value: url,
    "aria-label": "Link",
    class: "pe-sh-url",
  }) as HTMLInputElement;
  input.addEventListener("focus", () => input.select());
  const copyBtn = h(
    "button",
    {
      class: "btn primary",
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          input.select();
          document.execCommand?.("copy");
        }
        copyBtn.replaceChildren(pIcon("check", 16), t("pe.sh.copied"));
      },
    },
    pIcon("link", 16),
    t("pe.sh.copy"),
  );
  const qrBox = h("div", { class: "pe-sh-qr" });
  const pack = x as ClubPack;
  m.body.append(
    ...[
    h(
      "p",
      { class: "pe-sh-txt" },
      isPack
        ? tn("pe.sh.pack", pack.procedures.length, {
            c: pack.club || t("pe.sh.club"),
          })
        : t("pe.sh.proc", { t: (x as Procedure).title }),
    ),
    qrBox,
    h("div", { class: "pe-sh-row" }, input, copyBtn),
    url.length > 2000
      ? h("p", { class: "pe-sh-long" }, pIcon("warn", 14), t("pe.sh.long"))
      : null,
    ].filter((n) => !!n) as HTMLElement[],
  );
  void qrSvg(url, 260).then((svg) => svg && qrBox.append(svg));
  if (!url || url.length > 2900) qrBox.remove();
  m.open();
}

// ------------------------------------------------------------------ the editor
export interface EditorOpts {
  /** a club or library procedure id; none = a new club procedure */
  id?: string | null;
  /** new procedure: the failure it answers (from a builder failure card) */
  failure?: FailureKey;
  /** new procedure: its language (default: the screen language) */
  lang?: Lang;
  /** after a save / delete / reset (the hub re-renders): the saved procedure, null after a delete, the library
   *  procedure after a reset ('reset') */
  onSaved?: (p: Procedure | null, how?: "saved" | "deleted" | "reset") => void;
}

type Mode = "library" | "club" | "new";
type Confirm = "delete" | "reset" | "discard" | null;

export class ProcedureEditor extends StackedModal {
  private mode: Mode = "new";
  private d!: Procedure;
  private orig = "";
  private touched = new Set<string>();
  private all = false;
  private confirming: Confirm = null;
  private pvMode: "training" | "test" = "training";
  private pvOpen = true;
  private tab: "edit" | "preview" = "edit";
  private opts: EditorOpts = {};
  private formEl!: HTMLElement;
  private pvEl!: HTMLElement;
  private crumb!: HTMLElement;
  private langSeg!: HTMLElement;
  private savedFlash = false;

  constructor() {
    super("Procedure", "");
    this.box.classList.add("pe");
    // the close button and the backdrop ask before discarding changes
    const x = this.box.querySelector("header .x")!;
    const nx = h(
      "button",
      { class: "x", "aria-label": "Close", onclick: () => this.requestClose() },
      "×",
    );
    x.replaceWith(nx);
    this.bg.onclick = (e) => {
      if (e.target === this.bg) this.requestClose();
    };
    const head = this.box.querySelector("header")!;
    const h2 = head.querySelector("h2")!;
    h2.classList.add("pe-h");
    this.crumb = h("span", { class: "pe-crumb" });
    this.langSeg = h("div", {
      class: "seg pe-ui-lang",
      role: "group",
      "aria-label": "Language / Langue",
    });
    head.insertBefore(this.crumb, nx);
    head.insertBefore(this.langSeg, nx);
    this.formEl = h("div", { class: "pe-form" });
    this.pvEl = h("aside", { class: "pe-side", "aria-label": "Preview" });
    this.body.classList.add("pe-body");
    this.body.append(this.formEl, this.pvEl);
  }

  /** open on a procedure (see EditorOpts) */
  edit(o: EditorOpts = {}) {
    this.opts = o;
    this.touched.clear();
    this.all = false;
    this.confirming = null;
    this.savedFlash = false;
    this.tab = "edit";
    const p = o.id ? getProcedure(o.id) : null;
    if (p && p.source === "library") {
      this.mode = "library";
      this.d = p;
    } else if (p) {
      this.mode = "club";
      this.d = p;
    } else {
      this.mode = "new";
      this.d = newProcedure(o.lang ?? L());
      // the instructor names it (the placeholder shows an example): no 'New procedure' saved by mistake
      this.d.title = "";
      if (o.failure) {
        this.d.failures = [o.failure];
        this.d.title = failureName(o.failure, this.d.lang);
        this.d.category = categoryFor(o.failure);
      }
    }
    this.orig = JSON.stringify(this.d);
    this.render();
    this.open();
    this.box.querySelector<HTMLElement>(".pe-form")?.scrollTo(0, 0);
  }

  private get dirty() {
    return this.mode !== "library" && JSON.stringify(this.d) !== this.orig;
  }

  requestClose() {
    if (this.dirty && this.confirming !== "discard") {
      this.confirming = "discard";
      this.renderFoot();
      this.foot.querySelector<HTMLElement>(".pe-keep")?.focus();
      return;
    }
    this.close();
  }

  // ---------------------------------------------------------------- render
  render() {
    const ro = this.mode === "library";
    const title = this.box.querySelector("header h2")!;
    title.textContent = t(
      ro
        ? "pe.title.lib"
        : this.mode === "new"
          ? this.d.basedOn
            ? "pe.title.custom"
            : "pe.title.new"
          : "pe.title.edit",
    );
    this.box.setAttribute("aria-label", title.textContent);
    clear(this.crumb);
    this.crumb.append(
      h(
        "span",
        { class: `pe-badge ${ro ? "lib" : "club"}` },
        ro
          ? t("pe.badge.lib")
          : this.d.basedOn
            ? t("pe.badge.custom")
            : t("pe.badge.club"),
      ),
    );
    clear(this.langSeg);
    for (const l of ["fr", "en"] as UiLang[])
      this.langSeg.append(
        h(
          "button",
          {
            class: uiLang() === l ? "on" : "",
            "aria-pressed": String(uiLang() === l),
            title: t("pe.ui"),
            onclick: () => {
              setLang(l);
              this.render();
            },
          },
          l.toUpperCase(),
        ),
      );
    this.box.classList.toggle("pe-ro", ro);
    this.box.dataset.tab = this.tab;
    this.renderForm();
    this.renderPreview();
    this.renderFoot();
  }

  private issues(): ValidationIssue[] {
    return this.mode === "library" ? [] : editorIssues(this.d);
  }

  /** the draft changed: preview + messages (the form itself is not rebuilt, so typing keeps its focus) */
  private changed(path?: string) {
    if (path) this.touched.add(path);
    this.savedFlash = false;
    if (this.confirming === "discard") this.confirming = null;
    this.renderPreview();
    this.renderIssues();
    this.renderFoot();
  }

  /** a structural change (items added / moved, toggles): rebuild the form, keep the scroll */
  private rebuild(path?: string, focus?: string) {
    if (path) this.touched.add(path);
    const top = this.formEl.scrollTop;
    this.savedFlash = false;
    this.renderForm();
    this.formEl.scrollTop = top;
    this.renderPreview();
    this.renderFoot();
    if (focus)
      this.formEl
        .querySelector<HTMLElement>(focus)
        ?.focus({ preventScroll: false });
  }

  private renderIssues() {
    const list = this.issues();
    this.formEl.querySelectorAll<HTMLElement>("[data-err]").forEach((el) => {
      const path = el.dataset.err!;
      const show =
        this.all ||
        [...this.touched].some(
          (tp) =>
            tp === path ||
            tp.startsWith(`${path}.`) ||
            tp.startsWith(`${path}[`),
        );
      const mine = issuesAt(list, path).filter((i) =>
        // an item card lists its own messages; the procedure-level 'items' message stays at the list
        path === "items" ? i.path === "items" : true,
      );
      clear(el);
      el.hidden = !show || !mine.length;
      if (show)
        for (const i of mine)
          el.append(h("div", {}, pIcon("warn", 13), i.message));
      el.closest(".pe-field, .pe-item")?.classList.toggle(
        "bad",
        show && !!mine.length,
      );
    });
  }

  private section(
    n: number,
    title: string,
    hint: string,
    ...content: (Node | null)[]
  ) {
    return h(
      "section",
      { class: "pe-sec" },
      h(
        "div",
        { class: "pe-sec-h" },
        h("span", { class: "pe-num" }, String(n)),
        h("div", {}, h("b", {}, title), h("small", {}, hint)),
      ),
      ...content,
    );
  }

  private field(
    label: string,
    path: string | null,
    control: Node,
    extra?: Node | null,
    cls = "",
  ) {
    return h(
      "label",
      { class: `pe-field ${cls}` },
      h("span", { class: "pe-lb" }, label),
      control,
      extra ?? null,
      path
        ? h("div", { class: "pe-err", "data-err": path, hidden: true })
        : null,
    );
  }

  private input(
    value: string,
    set: (v: string) => void,
    path: string,
    attrs: Record<string, string | number | boolean> = {},
  ) {
    const el = h("input", {
      type: "text",
      value,
      ...attrs,
    }) as HTMLInputElement;
    el.addEventListener("input", () => {
      set(el.value);
      this.changed(path);
    });
    el.addEventListener("keydown", (e) => e.stopPropagation());
    return el;
  }

  private numInput(
    value: number | undefined,
    set: (v: number | undefined) => void,
    path: string,
    attrs: Record<string, string | number | boolean> = {},
  ) {
    const el = h("input", {
      type: "number",
      inputmode: "decimal",
      value: value === undefined || Number.isNaN(value) ? "" : String(value),
      ...attrs,
    }) as HTMLInputElement;
    el.addEventListener("input", () => {
      const v =
        el.value.trim() === "" ? undefined : Number(el.value.replace(",", "."));
      set(v);
      this.changed(path);
    });
    el.addEventListener("keydown", (e) => e.stopPropagation());
    return el;
  }

  private toggle(
    label: string,
    on: boolean,
    set: (v: boolean) => void,
    path: string,
    tip?: string,
    disabled = false,
  ) {
    return h(
      "button",
      {
        type: "button",
        class: `pe-tg${on ? " on" : ""}`,
        role: "switch",
        "aria-checked": String(on),
        title: tip,
        disabled,
        onclick: () => {
          set(!on);
          this.rebuild(path);
        },
      },
      h(
        "span",
        { class: "pe-tg-box", "aria-hidden": "true" },
        on ? pIcon("check", 12) : null,
      ),
      label,
    );
  }

  private renderForm() {
    const d = this.d;
    const ro = this.mode === "library";
    const lang: Lang = L();
    clear(this.formEl);
    // narrow screens: Edit | Preview tabs
    this.formEl.append(
      h(
        "div",
        { class: "seg pe-tabs", role: "tablist" },
        ...(["edit", "preview"] as const).map((tb) =>
          h(
            "button",
            {
              role: "tab",
              class: this.tab === tb ? "on" : "",
              "aria-selected": String(this.tab === tb),
              onclick: () => {
                this.tab = tb;
                this.box.dataset.tab = tb;
                this.render();
              },
            },
            pIcon(tb === "edit" ? "edit" : "eye", 15),
            t(tb === "edit" ? "pe.tab.edit" : "pe.tab.preview"),
          ),
        ),
      ),
    );
    if (ro) {
      const own = clubOverride(d.id);
      this.formEl.append(
        h(
          "div",
          { class: "pe-banner" },
          h("span", { class: "pe-banner-ic" }, pIcon("book", 18)),
          h(
            "div",
            {},
            h("p", {}, t("pe.libBanner")),
            own
              ? h("p", { class: "pe-banner-own" }, t("pe.libOverridden"))
              : null,
          ),
          own
            ? h(
                "button",
                {
                  class: "btn",
                  onclick: () => this.edit({ ...this.opts, id: own.id }),
                },
                pIcon("edit", 15),
                t("pe.openClub"),
              )
            : null, // 'Customise for the club' is the footer's main button
        ),
      );
    } else if (d.basedOn) {
      const lib = libraryProcedure(d.basedOn);
      if (lib)
        this.formEl.append(
          h(
            "div",
            { class: "pe-based" },
            pIcon("book", 15),
            t("pe.basedOn", { t: lib.title }),
          ),
        );
    }
    const fs = h("fieldset", { class: "pe-fs", disabled: ro });

    // 1. about
    const cat = h(
      "select",
      {
        onchange: (e: Event) => {
          d.category = (e.target as HTMLSelectElement).value as ProcCategory;
          this.changed("category");
        },
      },
      ...CATEGORY_ORDER.map((c) =>
        h(
          "option",
          { value: c, selected: c === d.category },
          CATEGORY_LABELS[c][lang],
        ),
      ),
    );
    const langSeg = h(
      "div",
      { class: "seg pe-seg", role: "group" },
      ...(["fr", "en"] as Lang[]).map((l) =>
        h(
          "button",
          {
            type: "button",
            class: d.lang === l ? "on" : "",
            "aria-pressed": String(d.lang === l),
            onclick: () => {
              d.lang = l;
              d.disclaimer = DISCLAIMER[l];
              this.rebuild("lang");
            },
          },
          l === "fr" ? "Français" : "English",
        ),
      ),
    );
    const aircraft = this.input(
      d.aircraft,
      (v) => (d.aircraft = v),
      "aircraft",
      { list: "pe-ac", placeholder: "C172S", autocomplete: "off" },
    );
    fs.append(
      this.section(
        1,
        t("pe.s.about"),
        t("pe.s.aboutHint"),
        h(
          "div",
          { class: "pe-row" },
          this.field(
            t("pe.f.title"),
            "title",
            this.input(d.title, (v) => (d.title = v), "title", {
              placeholder: t("pe.f.titlePh"),
              maxlength: 120,
              class: "pe-title-in",
            }),
            null,
            "grow",
          ),
        ),
        h(
          "div",
          { class: "pe-row" },
          this.field(t("pe.f.category"), "category", cat),
          this.field(
            t("pe.f.aircraft"),
            "aircraft",
            aircraft,
            h(
              "datalist",
              { id: "pe-ac" },
              ...[
                "C172S",
                "C172 G1000",
                "DR400-120",
                "DR400-140B",
                "PA28-161",
                "TB10",
                "C152",
              ].map((a) => h("option", { value: a })),
            ),
          ),
          this.field(t("pe.f.lang"), "lang", langSeg),
        ),
        h(
          "div",
          { class: "pe-row" },
          this.field(
            t("pe.f.ref"),
            "ref",
            this.input(d.ref ?? "", (v) => (d.ref = v), "ref", {
              placeholder: t("pe.f.refPh"),
              maxlength: 80,
            }),
            null,
            "grow",
          ),
          this.field(
            t("pe.f.summary"),
            "summary",
            this.input(d.summary ?? "", (v) => (d.summary = v), "summary", {
              placeholder: t("pe.f.summaryPh"),
              maxlength: 160,
            }),
            null,
            "grow2",
          ),
        ),
      ),
    );

    // 2. failures
    const fails = h("div", { class: "pe-fails" });
    for (const g of FAILURE_GROUPS) {
      fails.append(
        h(
          "div",
          { class: "pe-fgrp" },
          h("span", { class: "pe-fgrp-t" }, t(`pe.grp.${g.id}`)),
          h(
            "div",
            { class: "pe-chips" },
            ...g.keys.map((k) => {
              const on = d.failures.includes(k);
              return h(
                "button",
                {
                  type: "button",
                  class: `pe-chip${on ? " on" : ""}`,
                  "aria-pressed": String(on),
                  onclick: () => {
                    d.failures = on
                      ? d.failures.filter((x) => x !== k)
                      : [...d.failures, k];
                    this.rebuild("failures");
                  },
                },
                on ? pIcon("check", 13) : null,
                failureName(k, lang),
              );
            }),
          ),
        ),
      );
    }
    fs.append(
      this.section(
        2,
        t("pe.s.failures"),
        t("pe.s.failuresHint"),
        fails,
        d.failures.length ? null : h("p", { class: "pe-hint" }, t("pe.f.none")),
        h("div", { class: "pe-err", "data-err": "failures", hidden: true }),
      ),
    );

    // 3. flight path and order
    const ias = d.targets?.iasKt;
    const bank = d.targets?.maxBankDeg;
    const setTargets = (f: (tg: NonNullable<Procedure["targets"]>) => void) => {
      d.targets = { ...(d.targets ?? {}) };
      f(d.targets);
      if (!d.targets.iasKt && d.targets.maxBankDeg === undefined)
        delete d.targets;
    };
    const iasRow = h(
      "div",
      { class: "pe-target" },
      this.toggle(
        t("pe.f.ias"),
        !!ias,
        (v) =>
          setTargets((tg) => (v ? (tg.iasKt = [63, 73]) : delete tg.iasKt)),
        "targets.iasKt",
      ),
      ias
        ? h(
            "div",
            { class: "pe-inline" },
            this.unitNum(
              t("pe.f.iasMin"),
              ias[0],
              (v) => (d.targets!.iasKt![0] = v ?? NaN),
              "targets.iasKt",
              "kt",
            ),
            h("span", { class: "pe-dash" }, "–"),
            this.unitNum(
              t("pe.f.iasMax"),
              ias[1],
              (v) => (d.targets!.iasKt![1] = v ?? NaN),
              "targets.iasKt",
              "kt",
            ),
          )
        : null,
      h("div", { class: "pe-err", "data-err": "targets.iasKt", hidden: true }),
    );
    const bankRow = h(
      "div",
      { class: "pe-target" },
      this.toggle(
        t("pe.f.bank"),
        bank !== undefined,
        (v) =>
          setTargets((tg) => (v ? (tg.maxBankDeg = 30) : delete tg.maxBankDeg)),
        "targets.maxBankDeg",
      ),
      bank !== undefined
        ? h(
            "div",
            { class: "pe-inline" },
            this.unitNum(
              t("pe.f.bankMax"),
              bank,
              (v) => (d.targets!.maxBankDeg = v ?? NaN),
              "targets.maxBankDeg",
              "°",
            ),
          )
        : null,
      h("div", {
        class: "pe-err",
        "data-err": "targets.maxBankDeg",
        hidden: true,
      }),
    );
    fs.append(
      this.section(
        3,
        t("pe.s.path"),
        t("pe.s.pathHint"),
        h("div", { class: "pe-targets" }, iasRow, bankRow),
        h(
          "div",
          { class: "pe-target" },
          this.toggle(
            t("pe.f.ordered"),
            d.ordered,
            (v) => (d.ordered = v),
            "ordered",
          ),
          h("small", { class: "pe-hint" }, t("pe.f.orderedHint")),
        ),
      ),
    );

    // 4. items
    const list = h("ol", { class: "pe-items" });
    d.items.forEach((it, i) => list.append(this.itemCard(it, i, ro)));
    fs.append(
      this.section(
        4,
        t("pe.s.items"),
        t("pe.s.itemsHint"),
        list,
        h("div", { class: "pe-err", "data-err": "items", hidden: true }),
        ro
          ? null
          : h(
              "button",
              {
                type: "button",
                class: "pe-add",
                onclick: () => {
                  const at = addItem(d);
                  this.rebuild("items", `.pe-item[data-i="${at}"] .pe-it-text`);
                },
              },
              pIcon("plus", 16),
              t("pe.i.add"),
            ),
      ),
    );
    this.formEl.append(fs);
    this.renderIssues();
  }

  private unitNum(
    label: string,
    v: number,
    set: (v: number | undefined) => void,
    path: string,
    unit: string,
  ) {
    return h(
      "label",
      { class: "pe-unit" },
      h("span", { class: "pe-unit-lb" }, label),
      this.numInput(v, set, path, { "aria-label": label, step: 1 }),
      h("span", { class: "pe-unit-u" }, unit),
    );
  }

  private itemCard(it: ProcItem, i: number, ro: boolean): HTMLElement {
    const d = this.d;
    const lang = L();
    const path = `items[${i}]`;
    const iconBtn = (
      icon: PIcon,
      tip: string,
      fn: () => void,
      disabled = false,
      cls = "",
    ) =>
      h(
        "button",
        {
          type: "button",
          class: `pe-ib ${cls}`,
          title: tip,
          "aria-label": tip,
          disabled: disabled || ro,
          onclick: fn,
        },
        pIcon(icon, 16),
      );
    const text = this.input(it.text, (v) => (it.text = v), `${path}.text`, {
      class: "pe-it-text",
      placeholder: t("pe.i.textPh"),
      maxlength: 200,
      "aria-label": t("pe.i.text", { n: i + 1 }),
    });
    // check picker, grouped by what is checked
    const kinds: [string, string][] = [
      ["manual", t("pe.k.manual")],
      ["action", t("pe.k.action")],
      ["path", t("pe.k.path")],
      ["outcome", t("pe.k.outcome")],
    ];
    const cur = it.check?.id ?? "manual";
    const sel = h(
      "select",
      {
        class: "pe-it-check",
        "aria-label": t("pe.i.check"),
        onchange: (e: Event) => {
          const before = it.check && { ...it.check };
          setItemCheck(it, (e.target as HTMLSelectElement).value as CheckId);
          syncText(it, before, this.d.lang);
          this.rebuild(`${path}.check`);
        },
      },
      ...kinds.map(([k, lb]) =>
        h(
          "optgroup",
          { label: lb },
          ...CHECK_IDS.filter((id) => CHECKS[id].kind === k).map((id) =>
            h(
              "option",
              { value: id, selected: id === cur },
              CHECKS[id].name[lang],
            ),
          ),
        ),
      ),
    );
    if (!checkDef(it.check) && it.check)
      sel.prepend(
        h("option", { value: it.check.id, selected: true }, it.check.id),
      );
    const params = h(
      "div",
      { class: "pe-params" },
      ...visibleParams(it).map((prm) =>
        this.paramField(it, prm, `${path}.check`),
      ),
    );
    const limit = h(
      "label",
      { class: "pe-unit pe-limit", title: t("pe.i.limit") },
      pIcon("clock", 15),
      h("span", { class: "pe-unit-lb" }, t("pe.i.limit")),
      this.numInput(
        it.withinS,
        (v) => (v === undefined ? delete it.withinS : (it.withinS = v)),
        `${path}.withinS`,
        {
          "aria-label": t("pe.i.limit"),
          placeholder: t("pe.i.limitNone"),
          min: 1,
          max: 3600,
          step: 1,
        },
      ),
      h("span", { class: "pe-unit-u" }, "s"),
    );
    const safety = isSafetyItem(it);
    return h(
      "li",
      { class: `pe-item${it.memory ? " mem" : ""}`, "data-i": String(i) },
      h(
        "div",
        { class: "pe-it-top" },
        h("span", { class: "pe-it-n", "aria-hidden": "true" }, String(i + 1)),
        text,
        h(
          "div",
          { class: "pe-it-acts" },
          iconBtn(
            "up",
            t("pe.i.up"),
            () =>
              this.rebuild(
                path,
                `.pe-item[data-i="${moveItem(d, i, -1)}"] .pe-ib.up`,
              ),
            i === 0,
            "up",
          ),
          iconBtn(
            "down",
            t("pe.i.down"),
            () =>
              this.rebuild(
                path,
                `.pe-item[data-i="${moveItem(d, i, 1)}"] .pe-ib.down`,
              ),
            i === d.items.length - 1,
            "down",
          ),
          iconBtn("copy", t("pe.i.dup"), () =>
            this.rebuild(
              path,
              `.pe-item[data-i="${duplicateItem(d, i)}"] .pe-it-text`,
            ),
          ),
          iconBtn(
            "trash",
            t("pe.i.del"),
            () => {
              removeItem(d, i);
              this.rebuild("items");
            },
            false,
            "del",
          ),
        ),
      ),
      h(
        "div",
        { class: "pe-it-row" },
        h(
          "label",
          { class: "pe-it-chk" },
          h("span", { class: "pe-lb" }, t("pe.i.check")),
          sel,
        ),
        params,
      ),
      h(
        "div",
        { class: "pe-it-row pe-it-flags" },
        this.toggle(
          t("pe.i.memory"),
          it.memory,
          (v) => {
            it.memory = v;
            if (v) delete it.optional;
          },
          `${path}.memory`,
          t("pe.i.memoryTip"),
          ro,
        ),
        this.toggle(
          t("pe.i.optional"),
          !!it.optional,
          (v) => {
            if (v) {
              it.optional = true;
              it.memory = false;
            } else delete it.optional;
          },
          `${path}.optional`,
          t("pe.i.optionalTip"),
          ro,
        ),
        this.toggle(
          t("pe.i.safety"),
          safety,
          (v) => {
            // keep the default when it already says the same
            const def = it.memory && it.withinS !== undefined;
            if (v === def) delete it.safety;
            else it.safety = v;
          },
          `${path}.safety`,
          t("pe.i.safetyTip"),
          ro,
        ),
        limit,
      ),
      h(
        "div",
        { class: "pe-it-row" },
        this.input(it.note ?? "", (v) => (it.note = v), `${path}.note`, {
          class: "pe-it-note",
          placeholder: t("pe.i.notePh"),
          maxlength: 200,
          "aria-label": t("pe.i.note"),
        }),
      ),
      h("div", { class: "pe-err", "data-err": path, hidden: true }),
    );
  }

  /** set a check parameter; an untouched item text follows the check (the field is updated in place) */
  private setParam(it: ProcItem, name: string, v: ParamValue | undefined) {
    const before = it.check && { ...it.check, p: { ...(it.check.p ?? {}) } };
    setCheckParam(it, name, v);
    if (syncText(it, before, this.d.lang)) {
      const i = this.d.items.indexOf(it);
      const el = this.formEl.querySelector<HTMLInputElement>(`.pe-item[data-i="${i}"] .pe-it-text`);
      if (el) el.value = it.text;
    }
  }

  private paramField(it: ProcItem, prm: CheckParam, path: string): HTMLElement {
    const lang = L();
    const p = it.check?.p ?? {};
    const v = p[prm.name];
    let control: HTMLElement;
    if (prm.type === "enum") {
      const opts = paramOptions(prm, p) ?? [];
      const known = opts.some((o) => String(o.value) === String(v));
      const s = h(
        "select",
        {
          "aria-label": prm.label[lang],
          onchange: (e: Event) => {
            const val = (e.target as HTMLSelectElement).value;
            if (val === "__cur") return;
            const k = val === "" ? -1 : Number(val.slice(1));
            this.setParam(it, prm.name, k < 0 ? undefined : opts[k]?.value);
            this.rebuild(path);
          },
        },
        prm.optional
          ? h("option", { value: "", selected: v === undefined }, "—")
          : null,
        !known && v !== undefined
          ? h("option", { value: "__cur", selected: true }, String(v))
          : null,
        ...opts.map((o, k) =>
          h(
            "option",
            { value: `o${k}`, selected: String(o.value) === String(v) },
            o.label[lang],
          ),
        ),
      );
      control = s;
    } else if (prm.type === "boolean") {
      const on = v === true || v === "true";
      control = h(
        "div",
        { class: "seg pe-seg", role: "group", "aria-label": prm.label[lang] },
        ...[true, false].map((b) =>
          h(
            "button",
            {
              type: "button",
              class: on === b ? "on" : "",
              "aria-pressed": String(on === b),
              onclick: () => {
                this.setParam(it, prm.name, b);
                this.rebuild(path);
              },
            },
            b ? (lang === "fr" ? "Oui" : "Yes") : lang === "fr" ? "Non" : "No",
          ),
        ),
      );
    } else if (prm.type === "number" && isFraction(prm)) {
      // a 0..1 lever position (throttle): typed and shown in %, stored 0..1
      const label = pctLabel(prm, lang);
      control = h(
        "span",
        { class: "pe-num-in" },
        this.numInput(
          v === undefined ? undefined : Math.round(Number(v) * 1000) / 10,
          (x) => this.setParam(it, prm.name, x === undefined ? undefined : Math.max(0, Math.min(1, x / 100))),
          path,
          {
            "aria-label": label,
            min: 0,
            max: 100,
            step: Math.max(1, Math.round((prm.step ?? 0.05) * 100)),
            placeholder: prm.optional ? "—" : "",
          },
        ),
        h("span", { class: "pe-unit-u" }, "%"),
      );
      return h("label", { class: `pe-prm t-${prm.type}` }, h("span", { class: "pe-lb" }, label), control);
    } else if (prm.type === "number") {
      control = h(
        "span",
        { class: "pe-num-in" },
        this.numInput(
          v === undefined ? undefined : Number(v),
          (x) => this.setParam(it, prm.name, x),
          path,
          {
            "aria-label": prm.label[lang],
            min: prm.min ?? "",
            max: prm.max ?? "",
            step: prm.step ?? 1,
            placeholder: prm.optional ? "—" : "",
          },
        ),
        prm.unit ? h("span", { class: "pe-unit-u" }, prm.unit) : null,
      );
    } else {
      control = this.input(
        v === undefined ? "" : String(v),
        (x) => this.setParam(it, prm.name, x),
        path,
        { "aria-label": prm.label[lang] },
      );
    }
    return h(
      "label",
      { class: `pe-prm t-${prm.type}` },
      h("span", { class: "pe-lb" }, prm.label[lang]),
      control,
    );
  }

  // ---------------------------------------------------------------- preview (training mode, as in flight)
  private renderPreview() {
    const m = previewModel(this.d);
    clear(this.pvEl);
    const fr = this.d.lang === "fr";
    const tw = (en: string, frS: string) => (fr ? frS : en);
    const seg = h(
      "div",
      { class: "seg pe-seg", role: "group" },
      ...(["training", "test"] as const).map((k) =>
        h(
          "button",
          {
            type: "button",
            class: this.pvMode === k ? "on" : "",
            "aria-pressed": String(this.pvMode === k),
            onclick: () => {
              this.pvMode = k;
              this.renderPreview();
            },
          },
          t(k === "training" ? "pe.pv.training" : "pe.pv.test"),
        ),
      ),
    );
    this.pvEl.append(
      h(
        "div",
        { class: "pe-pv-h" },
        h("b", {}, pIcon("eye", 16), t("pe.pv.head")),
        seg,
      ),
    );
    const row = (x: PreviewItem, memory: boolean) =>
      h(
        "li",
        { class: `pv-it${x.optional ? " opt" : ""}${x.safety ? " crit" : ""}` },
        h(
          "span",
          { class: "pv-box", "aria-hidden": "true" },
          memory ? null : String(x.n),
        ),
        h(
          "div",
          { class: "pv-tx" },
          h("span", { class: "pv-t" }, x.text || "…"),
          x.note ? h("small", { class: "pv-note" }, x.note) : null,
          memory && x.withinS
            ? h("span", { class: "pv-bar" }, h("i", {}))
            : null,
        ),
        memory && x.withinS
          ? h(
              "span",
              { class: "pv-due" },
              fr ? `${x.withinS} s` : `${x.withinS} s`,
            )
          : x.manual
            ? h("span", { class: "pv-done" }, fr ? "Fait" : "Done")
            : x.optional
              ? h("span", { class: "pv-opt" }, fr ? "facultatif" : "optional")
              : null,
      );
    const card = h("div", { class: `pv-card ${this.pvMode}` });
    if (this.pvMode === "test") {
      card.append(
        h(
          "div",
          { class: "pv-test" },
          h(
            "button",
            { type: "button", class: "pv-cl" },
            pIcon("other", 15),
            fr ? "Check-list" : "Checklist",
          ),
          h("span", { class: "pv-time" }, "0:12"),
        ),
      );
      this.pvEl.append(
        card,
        h("p", { class: "pe-pv-note" }, t("pe.pv.testNote")),
      );
    } else {
      card.append(
        h(
          "div",
          { class: "pv-top" },
          h("span", { class: "pv-tag" }, tw("EMERGENCY", "URGENCE")),
          h("b", { class: "pv-fail" }, m.failure),
          h("span", { class: "pv-time" }, "0:12"),
        ),
        h("div", { class: "pv-title" }, m.title),
      );
      if (m.targets) card.append(h("div", { class: "pv-targets" }, m.targets));
      if (m.memory.length)
        card.append(
          h("div", { class: "pv-sec" }, tw("MEMORY ITEMS", "ACTIONS RÉFLEXES")),
          h(
            "ul",
            { class: "pv-list mem" },
            ...m.memory.map((x) => row(x, true)),
          ),
        );
      if (m.checklist.length) {
        if (m.memory.length && !this.pvOpen)
          card.append(
            h(
              "button",
              {
                type: "button",
                class: "pv-open",
                onclick: () => ((this.pvOpen = true), this.renderPreview()),
              },
              tw("Open the checklist", "Ouvrir la check-list"),
            ),
          );
        else
          card.append(
            h(
              "div",
              { class: "pv-sec" },
              tw("CHECKLIST", "CHECK-LIST"),
              m.memory.length
                ? h(
                    "button",
                    {
                      type: "button",
                      class: "pv-fold",
                      onclick: () => (
                        (this.pvOpen = false),
                        this.renderPreview()
                      ),
                    },
                    pIcon("up", 14),
                  )
                : null,
            ),
            h(
              "ol",
              { class: "pv-list" },
              ...m.checklist.map((x) => row(x, false)),
            ),
          );
      }
      if (!m.memory.length && !m.checklist.length)
        card.append(h("p", { class: "pv-empty" }, t("pe.pv.empty")));
      card.append(
        h(
          "div",
          { class: "pv-foot" },
          m.ref ? h("span", {}, m.ref) : null,
          h("span", {}, m.disclaimer),
        ),
      );
      this.pvEl.append(card);
    }
    this.pvEl.append(
      h(
        "div",
        { class: "pe-grading" },
        h("b", {}, t("pe.g.head")),
        h("ul", {}, ...gradingSummary(this.d).map((s) => h("li", {}, s))),
      ),
    );
  }

  // ---------------------------------------------------------------- footer: status + actions
  private renderFoot() {
    clear(this.foot);
    const ro = this.mode === "library";
    const issues = this.issues();
    const c = this.confirming;
    if (c) {
      const msg = t(
        c === "delete"
          ? "pe.sure.delete"
          : c === "reset"
            ? "pe.sure.reset"
            : "pe.sure.discard",
      );
      this.foot.append(
        h("div", { class: "pe-status warn" }, pIcon("warn", 16), msg),
        h("span", { class: "grow" }),
        h(
          "button",
          {
            class: "btn pe-keep",
            onclick: () => ((this.confirming = null), this.renderFoot()),
          },
          t(c === "discard" ? "pe.keep" : "pe.no"),
        ),
        h(
          "button",
          {
            class: "btn danger-solid",
            onclick: () =>
              c === "delete"
                ? this.doDelete()
                : c === "reset"
                  ? this.doReset()
                  : this.close(),
          },
          t(
            c === "delete"
              ? "pe.yesDelete"
              : c === "reset"
                ? "pe.yesReset"
                : "pe.discard",
          ),
        ),
      );
      return;
    }
    if (ro) {
      this.foot.append(
        h(
          "div",
          { class: "pe-status lib" },
          pIcon("book", 16),
          t("pe.ro"),
        ),
        h("span", { class: "grow" }),
        h(
          "button",
          { class: "btn ghost", onclick: () => openShareDialog(this.d) },
          pIcon("share", 15),
          t("pe.share"),
        ),
        h(
          "button",
          { class: "btn", onclick: () => this.close() },
          t("pe.close"),
        ),
      );
      if (!clubOverride(this.d.id))
        this.foot.append(
          h(
            "button",
            { class: "btn primary", onclick: () => this.customise() },
            pIcon("edit", 15),
            t("pe.customise"),
          ),
        );
      return;
    }
    const status = this.savedFlash
      ? h("div", { class: "pe-status ok" }, pIcon("check", 16), t("pe.saved"))
      : issues.length
        ? h(
            "button",
            {
              class: "pe-status bad",
              title: issues.map((i) => i.message).join("\n"),
              onclick: () => this.showIssues(),
            },
            pIcon("warn", 16),
            h("b", {}, tn("pe.v.n", issues.length)),
            h("span", {}, issues[0].message),
          )
        : h("div", { class: "pe-status ok" }, pIcon("check", 16), t("pe.v.ok"));
    this.foot.append(status, h("span", { class: "grow" }));
    if (this.mode === "club") {
      this.foot.append(
        h(
          "button",
          {
            class: "btn ghost",
            onclick: () => openShareDialog(cleanDraft(this.d)),
          },
          pIcon("share", 15),
          t("pe.share"),
        ),
      );
      if (this.d.basedOn && libraryProcedure(this.d.basedOn))
        this.foot.append(
          h(
            "button",
            {
              class: "btn ghost danger-t",
              onclick: () => ((this.confirming = "reset"), this.renderFoot()),
            },
            t("pe.reset"),
          ),
        );
      else
        this.foot.append(
          h(
            "button",
            {
              class: "btn ghost danger-t",
              onclick: () => ((this.confirming = "delete"), this.renderFoot()),
            },
            pIcon("trash", 15),
            t("pe.delete"),
          ),
        );
    }
    this.foot.append(
      h(
        "button",
        { class: "btn", onclick: () => this.requestClose() },
        t("pe.cancel"),
      ),
      h(
        "button",
        { class: "btn primary", onclick: () => this.save() },
        pIcon("check", 15),
        t("pe.save"),
      ),
    );
  }

  /** show every message and scroll to the first problem */
  private showIssues() {
    this.all = true;
    if (this.tab !== "edit") {
      this.tab = "edit";
      this.render();
    }
    this.renderIssues();
    const first = this.formEl.querySelector<HTMLElement>(
      ".pe-err:not([hidden])",
    );
    first
      ?.closest(".pe-field, .pe-item, .pe-sec")
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
    const input = first
      ?.closest(".pe-field, .pe-item")
      ?.querySelector<HTMLElement>("input, select");
    input?.focus({ preventScroll: true });
  }

  private customise() {
    const draft = customise(this.d.id);
    if (!draft) return;
    this.mode = "new";
    this.d = draft;
    this.orig = "";
    this.touched.clear();
    this.render();
  }

  private save() {
    const issues = this.issues();
    if (issues.length) {
      this.showIssues();
      this.renderFoot();
      return;
    }
    const r = saveProcedure(cleanDraft(this.d), L());
    if (!r.ok) {
      this.all = true;
      this.renderIssues();
      return;
    }
    this.d = r.procedure;
    this.mode = "club";
    this.orig = JSON.stringify(this.d);
    this.savedFlash = true;
    this.opts.onSaved?.(r.procedure, "saved");
    this.close();
  }

  private doDelete() {
    deleteProcedure(this.d.id);
    this.opts.onSaved?.(null, "deleted");
    this.close();
  }

  private doReset() {
    const lib = resetToLibrary(this.d.id);
    this.opts.onSaved?.(lib, "reset");
    if (lib) this.edit({ ...this.opts, id: lib.id });
    else this.close();
  }
}

/** the category a new procedure answering `f` most likely belongs to */
export function categoryFor(f: FailureKey): ProcCategory {
  if (f === "engineFire" || f === "electricalFire") return "fire";
  const g = FAILURE_GROUPS.find((x) => x.keys.includes(f))?.id;
  if (g === "engine") return "engine";
  if (g === "electrical") return "electrical";
  if (g === "instruments") return "instruments";
  if (f === "comms" || f === "xpdr") return "comms";
  if (g === "avionics") return "avionics";
  if (f === "flaps" || f === "trimRunaway") return "flight";
  return "other";
}

let editor: ProcedureEditor | null = null;
/** open the procedure editor (one instance, stacked over the current window) */
export function openProcedureEditor(o: EditorOpts = {}): ProcedureEditor {
  editor ??= new ProcedureEditor();
  editor.edit(o);
  return editor;
}
