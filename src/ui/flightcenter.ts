// Flight Center: the single hub after the start page. The home screen has ONE primary action (Build a flight), a
// one-click Quick start, Continue (syllabus / last flight), the tools in a visible toolbar and six photo tiles.
// The full catalogue (every flight by type, search, filters, learning paths, detail pane) sits one click deeper,
// behind "Browse all flights".
import { h, clear, store } from "./dom";
import { Modal, WX_PRESETS, type WxPreset } from "./modals";
import { CATEGORIES, MINE_SUB as MINE, catalog, type CatId, type Item } from "./catalog";
import { PATHS, type Path } from "../train/curriculum";
import { progress } from "./learn";
import { history } from "./history";
import { approachPlate } from "../plates/plates";
import { findApproach, TRAINING_REGION } from "../nav/data";
import { I, svgIcon } from "./icons";
import type { AssessSettings, Scenario } from "../sim/sim";
import type { Exercise } from "../train/engine";
import type { Attempt } from "./history";
import type { Circuit } from "../train/circuits";
import { circuitStore } from "../train/circuits";
import { registerStrings, t, tn, lang as uiLang, setLang, onLangChange, type UiLang } from "./i18n";
import { PHASES, listDrills, type DrillEntry } from "../train/drills";
import {
  clubName,
  effectiveProcedures,
  exportPack,
  exportPackJson,
  importPack,
  importShare,
  decodeShare,
  shareCodeFromUrl,
  listClub,
  onProceduresChange,
  setClubName,
  type ConflictPolicy,
  type ImportReport,
} from "../train/procedureStore";
import { CATEGORY_LABELS, CATEGORY_ORDER, DISCLAIMER } from "../train/procedureLibrary";
import type { Lang, Procedure, ProcedureResult } from "../train/procedureTypes";
import type { FailureKey } from "../sim/systemsTypes";
import { CAT_ICONS, categoryFor, failureName, openProcedureEditor, openShareDialog, pIcon, type PIcon } from "./procedureEditor";

export type CockpitType = "g1000" | "steam" | "airliner";

export interface FcHooks {
  flyScenario: (sc: Scenario, wx: WxPreset, a: AssessSettings) => void;
  briefExercise: (ex: Exercise, path: Path | null) => void;
  openPaths: () => void;
  openDrill: () => void;
  openRecords: () => void;
  openChart: (id: string) => void;
  setCockpit: (t: CockpitType) => void;
  getCockpit: () => CockpitType;
  openBuilder: (c?: import("../train/circuits").Circuit) => void;
  flyCircuit: (c: import("../train/circuits").Circuit) => void;
  planFlight: (
    t?: import("./flightsetup").FlightType,
    world?: "real" | "training",
  ) => void;
  /** pair the instructor's phone or tablet (QR of the remote companion); the tool is shown only when wired */
  pairInstructor?: () => void;
  /** the instructor station (failures, weather, reposition); shown only when wired */
  openInstructor?: () => void;
  /** connections (data link, webhooks, Navigraph); shown only when wired */
  openConnections?: () => void;
  /** procedures mode: fly a failure drill (a saved club drill or a template built at an airport). Default:
   *  flyCircuit */
  flyDrill?: (c: Circuit) => void;
  /** procedures mode: open a drill in the flight builder's Drill tab — a DRILL_TEMPLATES id or a saved drill.
   *  Default: the builder's openDrill() (circuitBuilder.ts), else openBuilder(circuit) */
  editDrill?: (x: Circuit | string) => void;
}

/** the sections of the Procedures · Flying club page */
export type ClubTab = "drills" | "library" | "results" | "pack";

type View =
  | { type: "home" }
  | { type: "instructor" }
  | { type: "all" }
  | { type: "cat"; cat: CatId; sub: string | null }
  | { type: "path"; path: Path }
  | { type: "search" }
  | { type: "club"; tab: ClubTab }
  | { type: "courses"; intent?: CourseIntent };

/** what the Ground school page does once the library is up: create a course, or pick one to present */
export type CourseIntent = "new" | "present";

type QuickKind = "approach" | "hold";

const DIFF = ["", "Easy", "Medium", "Hard"];
const COCKPITS: { id: CockpitType; title: string; desc: string }[] = [
  {
    id: "g1000",
    title: "G1000",
    desc: "G1000 glass: PFD + MFD, GFC 700 autopilot",
  },
  {
    id: "steam",
    title: "Steam",
    desc: "Steam gauges: six-pack, CDI/RMI, KAP 140, radio stack",
  },
  {
    id: "airliner",
    title: "Airliner",
    desc: "Airliner: Boeing-style PFD/ND with MCP",
  },
];
/** sidebar labels for the learning paths (the full title stays in the tooltip and the page heading) */
const PATH_SHORT: Record<string, string> = {
  ir: "Instrument Rating",
  classic: "VOR/NDB classics",
  holds: "Holding",
  emerg: "Partial panel",
  xc: "IFR cross-country",
  ckp: "Checkride prep",
};
const QUICK_KEY = "ifr.fc.quick";

const pathLabel = (p: Path) =>
  PATH_SHORT[p.id] ?? p.title.replace(" — complete syllabus", "");
const pct = (n: number) => `${Math.round(n)}%`;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
/** search cards: "Category · TAG", without repeating the category in the tag (CIRCUIT · ILS → IFR circuits · ILS) */
const searchLabel = (cat: (typeof CATEGORIES)[number], tag: string) => {
  const short = cat.short.toUpperCase();
  const rest =
    tag === short || tag === cat.title.toUpperCase()
      ? ""
      : tag.startsWith(`${short} · `)
        ? tag.slice(short.length + 3)
        : tag;
  return rest ? `${cat.short} · ${rest}` : cat.title;
};
/** "today", "yesterday", "3 days ago", "12 Mar" */
export function ago(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const day = 86400000;
  const d = Math.floor((now - t) / day);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
const aptName = (icao: string) => {
  const a = TRAINING_REGION.airports.find((x) => x.icao === icao);
  return a
    ? a.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : icao;
};

/** the flights Quick start draws from: approaches, or holds, at one airport (all airports when empty) */
export function quickPool(items: Item[], kind: QuickKind, apt: string): Item[] {
  return items.filter(
    (i) =>
      (kind === "approach"
        ? i.cat === "approaches"
        : i.cat === "procedures" && i.sub === "Holdings") &&
      (!apt || i.airport === apt),
  );
}

/** the Continue card: the next lesson of the syllabus and the last flight flown, when it is in the catalogue */
export function continueInfo(items: Item[]) {
  const all = progress.all();
  const ir = PATHS[0];
  const passed = ir.exercises.filter((id) => all[id]?.passed).length;
  const nextId = ir.exercises.find((id) => !all[id]?.passed);
  const next = nextId ? items.find((i) => i.id === nextId) : undefined;
  const lesson = nextId
    ? ir.exercises.indexOf(nextId) + 1
    : ir.exercises.length;
  const last = history.all()[0];
  const lastItem = last
    ? items.find((i) =>
        last.exercise
          ? i.id === last.exercise
          : i.kind === "scenario" && i.title === last.scenario,
      )
    : undefined;
  const started = passed > 0 || ir.exercises.some((id) => all[id]);
  return {
    path: ir,
    passed,
    total: ir.exercises.length,
    lesson,
    next,
    started,
    last:
      lastItem && last
        ? { item: lastItem, when: ago(last.date), passed: last.passed }
        : null,
  };
}

// ------------------------------------------------------------------ procedures mode: results (pure, tested)
/** a training record, with the procedure results the runner stores on it (runner-integration: history.ts) */
type ProcAttempt = Attempt & { procedures?: ProcedureResult[] };

/** one procedure attempt: a row of the Results table and of the CSV */
export interface ProcRow {
  attemptId: string;
  date: string;
  student: string;
  /** the drill (flight) it was flown in */
  drill: string;
  procedureId: string;
  procedure: string;
  failure: FailureKey;
  mode: "training" | "test";
  score: number;
  verdict: "PASS" | "FAIL";
  reactionS: number | null;
  /** the most important debrief note */
  note: string;
  /** every debrief note, the most important first (what was late, missed or out of order) */
  notes: string[];
  outcome: ProcedureResult["outcome"];
}

/** every procedure attempt of the training records, newest first */
export function procedureRows(list: Attempt[]): ProcRow[] {
  const rows: ProcRow[] = [];
  for (const a of list as ProcAttempt[]) {
    if (!Array.isArray(a?.procedures)) continue;
    for (const r of a.procedures) {
      if (!r || typeof r !== "object") continue;
      rows.push({
        attemptId: a.id,
        date: a.date,
        student: (a.student ?? "").trim(),
        drill: a.exerciseTitle || a.scenario || "",
        procedureId: r.procedureId,
        procedure: r.title,
        failure: r.failure,
        mode: r.mode ?? (a.mode === "checkride" ? "test" : "training"),
        score: Math.round(Number(r.score) || 0),
        verdict: r.verdict === "PASS" ? "PASS" : "FAIL",
        reactionS: typeof r.reactionS === "number" ? r.reactionS : null,
        note: r.notes?.[0] ?? "",
        notes: Array.isArray(r.notes) ? r.notes.filter((x) => typeof x === "string" && x) : [],
        outcome: r.outcome,
      });
    }
  }
  return rows.sort((x, y) => (y.date > x.date ? 1 : y.date < x.date ? -1 : 0));
}

export interface ProcFilter {
  student?: string;
  verdict?: "" | "PASS" | "FAIL";
  /** words matched against the procedure, the drill and the student */
  q?: string;
}
export function filterProcRows(rows: ProcRow[], f: ProcFilter): ProcRow[] {
  const words = (f.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(
    (r) =>
      (!f.student || r.student === f.student) &&
      (!f.verdict || r.verdict === f.verdict) &&
      words.every((w) => `${r.procedure} ${r.drill} ${r.student}`.toLowerCase().includes(w)),
  );
}

/** the students who appear in the rows, sorted (no name: '') */
export function studentsOf(rows: ProcRow[]): string[] {
  return [...new Set(rows.map((r) => r.student))].sort((a, b) => a.localeCompare(b));
}

export interface ProcSummary {
  n: number;
  pass: number;
  /** 0..100, null without attempts */
  passRate: number | null;
  avgScore: number | null;
  /** median reaction time (s) of the attempts with a reaction */
  reactionS: number | null;
  /** per procedure, the weakest (lowest pass rate, then lowest average) first */
  byProcedure: { procedureId: string; procedure: string; n: number; pass: number; avgScore: number }[];
}
export function procSummary(rows: ProcRow[]): ProcSummary {
  const n = rows.length;
  const pass = rows.filter((r) => r.verdict === "PASS").length;
  const reacts = rows.map((r) => r.reactionS).filter((x): x is number => x !== null).sort((a, b) => a - b);
  const med = reacts.length
    ? reacts.length % 2
      ? reacts[(reacts.length - 1) / 2]
      : (reacts[reacts.length / 2 - 1] + reacts[reacts.length / 2]) / 2
    : null;
  const by = new Map<string, { procedureId: string; procedure: string; n: number; pass: number; sum: number }>();
  for (const r of rows) {
    const k = r.procedureId;
    const e = by.get(k) ?? { procedureId: k, procedure: r.procedure, n: 0, pass: 0, sum: 0 };
    e.n++;
    e.sum += r.score;
    if (r.verdict === "PASS") e.pass++;
    by.set(k, e);
  }
  return {
    n,
    pass,
    passRate: n ? Math.round((pass / n) * 100) : null,
    avgScore: n ? Math.round(rows.reduce((s, r) => s + r.score, 0) / n) : null,
    reactionS: med === null ? null : Math.round(med * 10) / 10,
    byProcedure: [...by.values()]
      .map((e) => ({ procedureId: e.procedureId, procedure: e.procedure, n: e.n, pass: e.pass, avgScore: Math.round(e.sum / e.n) }))
      .sort((a, b) => a.pass / a.n - b.pass / b.n || a.avgScore - b.avgScore || a.procedure.localeCompare(b.procedure)),
  };
}

/** the Results table as CSV (one row per procedure attempt; Excel-friendly quoting) */
export function procCsv(rows: ProcRow[]): string {
  const head = ["date", "student", "drill", "procedure", "procedure_id", "failure", "mode", "score", "verdict", "reaction_s", "outcome", "main_point"];
  const q = (v: string | number | null) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    head.join(","),
    ...rows.map((r) =>
      [r.date, r.student, r.drill, r.procedure, r.procedureId, r.failure, r.mode, r.score, r.verdict, r.reactionS === null ? "" : Math.round(r.reactionS * 10) / 10, r.outcome, r.note]
        .map(q)
        .join(","),
    ),
  ].join("\n");
}

/** plain-language import report, in the UI language */
export function importSummary(r: ImportReport): { ok: boolean; lines: string[] } {
  const lines: string[] = [...r.issues];
  if (r.added.length) lines.push(tn("ch.imp.added", r.added.length));
  if (r.replaced.length) lines.push(tn("ch.imp.replaced", r.replaced.length));
  if (r.renamed.length) lines.push(tn("ch.imp.renamed", r.renamed.length));
  for (const s of r.skipped) lines.push(t("ch.imp.skipped", { id: s.id, why: s.reason }));
  if (!lines.length) lines.push(t("ch.imp.nothing"));
  return { ok: !r.issues.length && r.added.length + r.replaced.length + r.renamed.length > 0, lines };
}

/** what a share link holds, in the UI language: a title line and the procedures (title, item count) */
export function shareSummary(code: string): { ok: boolean; title: string; procs: { title: string; items: number }[] } {
  const s = decodeShare(code);
  if (!s) return { ok: false, title: t("ch.p.linkBad"), procs: [] };
  const list = s.kind === "pack" ? s.pack.procedures : [s.procedure];
  const procs = list.map((p) => ({ title: p.title, items: Array.isArray(p.items) ? p.items.length : 0 }));
  return {
    ok: true,
    title:
      s.kind === "pack"
        ? tn("ch.p.linkPack", procs.length, { c: s.pack.club || t("ch.p.linkClub") })
        : t("ch.p.linkProc", { t: s.procedure.title }),
    procs,
  };
}

// ------------------------------------------------------------------ procedures mode: strings (FR / EN)
registerStrings("en", {
  "ch.tile": "Procedures · Flying club",
  "ch.tileDesc": "Failure drills, the club’s checklists and the students’ results.",
  "ch.tileMeta": "{d} drills · {p} procedures",
  "ch.title": "Procedures · Flying club",
  "ch.sub": "Test your students on failures and emergencies: fly a drill, adapt the checklists to your club, follow the results.",
  "ch.back": "Flight Center",
  "ch.searchAll": "Search all flights",
  "ch.lang": "Language",
  "ch.tab.drills": "Drills",
  "ch.tab.library": "Procedures",
  "ch.tab.results": "Results",
  "ch.tab.pack": "Club pack",
  "ch.d.student": "Student flying",
  "ch.d.studentPh": "Name (for the records)",
  "ch.d.new": "Create a drill",
  "ch.d.newTip": "In the flight builder: where and when, the failure and its trigger, training or test",
  "ch.d.club": "Club drills",
  "ch.d.clubNone": "No club drill yet",
  "ch.d.clubNoneSub": "Open a template, adjust it in the flight builder and Save: it appears here for every instructor and student.",
  "ch.d.mine": "Assigned to {s}",
  "ch.d.tpl": "Templates",
  "ch.d.tplSub": "Ready to fly at your airport. Edit one to make a club drill.",
  "ch.d.fly": "Fly",
  "ch.d.edit": "Edit",
  "ch.d.assign": "Assign",
  "ch.d.assigned": "Assigned to {s}",
  "ch.d.assignTo": "Assign to a student",
  "ch.d.assignPh": "Student name",
  "ch.d.assignOk": "Assign",
  "ch.d.unassign": "Remove",
  "ch.d.assignDone": "“{d}” assigned to {s}",
  "ch.d.noBuild": "No airport of the loaded data fits this drill: it opens in the flight builder.",
  "ch.d.training": "Training",
  "ch.d.test": "Test",
  "ch.d.trainingTip": "Emergency card shown: memory items with live ticks, then the checklist",
  "ch.d.testTip": "Nothing announced, checklist hidden: graded at the end",
  "ch.d.random": "Random failure",
  "ch.l.search": "Search procedures",
  "ch.l.all": "All",
  "ch.l.club": "Club",
  "ch.l.library": "Library",
  "ch.l.new": "New procedure",
  "ch.l.custom": "Customised",
  "ch.l.items": "{n} items",
  "ch.l.items.1": "1 item",
  "ch.l.mem": "{n} memory",
  "ch.l.mem.1": "1 memory",
  "ch.l.answers": "Answers",
  "ch.l.open": "Open",
  "ch.l.edit": "Edit",
  "ch.l.share": "Share",
  "ch.l.none": "No procedure matches “{q}”",
  "ch.l.noneSub": "Try a failure (alternator, vacuum) or a word of the title.",
  "ch.l.noClub": "Your club has no procedure of its own yet",
  "ch.l.noClubSub": "Open a library procedure and press Customise, or write a new one.",
  "ch.l.otherLang": "in English",
  "ch.l.saved": "“{t}” saved in the club library",
  "ch.l.deleted": "Procedure deleted",
  "ch.r.n": "Attempts",
  "ch.r.pass": "Pass rate",
  "ch.r.avg": "Average score",
  "ch.r.react": "Median reaction",
  "ch.r.student": "Student",
  "ch.r.allStudents": "All students",
  "ch.r.noName": "(no name)",
  "ch.r.verdict": "Result",
  "ch.r.allVerdicts": "Pass and fail",
  "ch.v.PASS": "PASS",
  "ch.v.FAIL": "FAIL",
  "ch.r.csv": "Export CSV",
  "ch.r.date": "Date",
  "ch.r.drill": "Drill",
  "ch.r.proc": "Procedure",
  "ch.r.score": "Score",
  "ch.r.weak": "To work on",
  "ch.r.weakLine": "{p}/{n} passed · average {a}",
  "ch.r.none": "No procedure result yet",
  "ch.r.noneSub": "Fly a drill: every procedure the student runs is graded and listed here, with what was late, missed or out of order.",
  "ch.r.noneFilter": "No result for these filters",
  "ch.r.records": "All training records",
  "ch.r.shown": "{n} shown",
  "ch.r.more": "+{n} more",
  "ch.r.more.1": "+1 more",
  "ch.l.reset": "“{t}”: back to the library version",
  "ch.p.name": "Club name",
  "ch.p.namePh": "e.g. Aéroclub de Toussus",
  "ch.p.nameHint": "Shown on the packs you share.",
  "ch.p.export": "Share the club library",
  "ch.p.exportSub": "The {n} procedures of your club, for the other instructors and your students’ devices.",
  "ch.p.exportSub.1": "Your club’s procedure, for the other instructors and your students’ devices.",
  "ch.p.exportNone": "Your club has no procedure of its own yet: customise or write one first.",
  "ch.p.download": "Download the pack (.json)",
  "ch.p.link": "Share link and QR code",
  "ch.p.import": "Import a pack",
  "ch.p.importSub": "A .json file from another instructor, or a share link or code.",
  "ch.p.file": "Choose a file",
  "ch.p.paste": "Paste a share link or code",
  "ch.p.go": "Import",
  "ch.p.policy": "When a procedure already exists",
  "ch.p.newer": "Keep the most recent",
  "ch.p.replace": "Replace ours",
  "ch.p.keep": "Keep ours",
  "ch.p.copy": "Import as a copy",
  "ch.p.linkTitle": "Shared with you",
  "ch.p.linkProc": "Procedure “{t}”",
  "ch.p.linkPack": "{n} procedures shared by {c}",
  "ch.p.linkPack.1": "1 procedure shared by {c}",
  "ch.p.linkClub": "another club",
  "ch.p.linkBad": "This share link is damaged or incomplete: ask for a new one.",
  "ch.p.linkLater": "Not now",
  "ch.p.disclaimer": "Club packs carry the club’s own texts: check them against the aircraft POH/AFM.",
  "ch.imp.added": "{n} procedures added",
  "ch.imp.added.1": "1 procedure added",
  "ch.imp.replaced": "{n} procedures updated",
  "ch.imp.replaced.1": "1 procedure updated",
  "ch.imp.renamed": "{n} procedures imported as a copy",
  "ch.imp.renamed.1": "1 procedure imported as a copy",
  "ch.imp.skipped": "{id}: not imported ({why})",
  "ch.imp.nothing": "Nothing to import",
  "ch.nav": "Procedures · Club",
});
registerStrings("fr", {
  "ch.tile": "Procédures · Aéroclub",
  "ch.tileDesc": "Exercices de panne, check-lists du club et résultats des élèves.",
  "ch.tileMeta": "{d} exercices · {p} procédures",
  "ch.title": "Procédures · Aéroclub",
  "ch.sub": "Entraînez et contrôlez vos élèves sur les pannes et les urgences : lancez un exercice, adaptez les check-lists à votre club, suivez les résultats.",
  "ch.back": "Flight Center",
  "ch.searchAll": "Rechercher un vol",
  "ch.lang": "Langue",
  "ch.tab.drills": "Exercices",
  "ch.tab.library": "Procédures",
  "ch.tab.results": "Résultats",
  "ch.tab.pack": "Pack du club",
  "ch.d.student": "Élève aux commandes",
  "ch.d.studentPh": "Nom (pour le suivi)",
  "ch.d.new": "Créer un exercice",
  "ch.d.newTip": "Dans le constructeur de vol : où et quand, la panne et son déclenchement, entraînement ou contrôle",
  "ch.d.club": "Exercices du club",
  "ch.d.clubNone": "Pas encore d’exercice du club",
  "ch.d.clubNoneSub": "Ouvrez un modèle, ajustez-le dans le constructeur de vol et enregistrez : il apparaît ici pour tous les instructeurs et élèves.",
  "ch.d.mine": "Attribués à {s}",
  "ch.d.tpl": "Modèles",
  "ch.d.tplSub": "Prêts à voler sur votre terrain. Modifiez-en un pour créer un exercice du club.",
  "ch.d.fly": "Voler",
  "ch.d.edit": "Modifier",
  "ch.d.assign": "Attribuer",
  "ch.d.assigned": "Attribué à {s}",
  "ch.d.assignTo": "Attribuer à un élève",
  "ch.d.assignPh": "Nom de l’élève",
  "ch.d.assignOk": "Attribuer",
  "ch.d.unassign": "Retirer",
  "ch.d.assignDone": "« {d} » attribué à {s}",
  "ch.d.noBuild": "Aucun terrain des données chargées ne convient : l’exercice s’ouvre dans le constructeur de vol.",
  "ch.d.training": "Entraînement",
  "ch.d.test": "Contrôle",
  "ch.d.trainingTip": "Carte d’urgence affichée : actions réflexes cochées en direct, puis la check-list",
  "ch.d.testTip": "Rien n’est annoncé, check-list masquée : notation à la fin",
  "ch.d.random": "Panne aléatoire",
  "ch.l.search": "Rechercher une procédure",
  "ch.l.all": "Toutes",
  "ch.l.club": "Club",
  "ch.l.library": "Bibliothèque",
  "ch.l.new": "Nouvelle procédure",
  "ch.l.custom": "Personnalisée",
  "ch.l.items": "{n} points",
  "ch.l.items.1": "1 point",
  "ch.l.mem": "{n} réflexes",
  "ch.l.mem.1": "1 réflexe",
  "ch.l.answers": "Pannes",
  "ch.l.open": "Ouvrir",
  "ch.l.edit": "Modifier",
  "ch.l.share": "Partager",
  "ch.l.none": "Aucune procédure ne correspond à « {q} »",
  "ch.l.noneSub": "Essayez une panne (alternateur, dépression) ou un mot du titre.",
  "ch.l.noClub": "Votre club n’a pas encore de procédure à lui",
  "ch.l.noClubSub": "Ouvrez une procédure de la bibliothèque et appuyez sur Personnaliser, ou rédigez-en une.",
  "ch.l.otherLang": "en français",
  "ch.l.saved": "« {t} » enregistrée dans la bibliothèque du club",
  "ch.l.deleted": "Procédure supprimée",
  "ch.r.n": "Tentatives",
  "ch.r.pass": "Taux de réussite",
  "ch.r.avg": "Note moyenne",
  "ch.r.react": "Réaction médiane",
  "ch.r.student": "Élève",
  "ch.r.allStudents": "Tous les élèves",
  "ch.r.noName": "(sans nom)",
  "ch.r.verdict": "Résultat",
  "ch.r.allVerdicts": "Réussis et échoués",
  "ch.v.PASS": "RÉUSSI",
  "ch.v.FAIL": "ÉCHEC",
  "ch.r.csv": "Exporter en CSV",
  "ch.r.date": "Date",
  "ch.r.drill": "Exercice",
  "ch.r.proc": "Procédure",
  "ch.r.score": "Note",
  "ch.r.weak": "À retravailler",
  "ch.r.weakLine": "{p}/{n} réussies · moyenne {a}",
  "ch.r.none": "Pas encore de résultat de procédure",
  "ch.r.noneSub": "Lancez un exercice : chaque procédure de l’élève est notée et listée ici, avec ce qui était en retard, oublié ou dans le désordre.",
  "ch.r.noneFilter": "Aucun résultat pour ces filtres",
  "ch.r.records": "Tout le carnet de vol",
  "ch.r.shown": "{n} affichés",
  "ch.r.more": "+{n} remarques",
  "ch.r.more.1": "+1 remarque",
  "ch.l.reset": "« {t} » : retour à la version de la bibliothèque",
  "ch.p.name": "Nom du club",
  "ch.p.namePh": "ex. Aéroclub de Toussus",
  "ch.p.nameHint": "Affiché sur les packs que vous partagez.",
  "ch.p.export": "Partager la bibliothèque du club",
  "ch.p.exportSub": "Les {n} procédures de votre club, pour les autres instructeurs et les appareils des élèves.",
  "ch.p.exportSub.1": "La procédure de votre club, pour les autres instructeurs et les appareils des élèves.",
  "ch.p.exportNone": "Votre club n’a pas encore de procédure à lui : personnalisez-en ou rédigez-en une d’abord.",
  "ch.p.download": "Télécharger le pack (.json)",
  "ch.p.link": "Lien de partage et QR code",
  "ch.p.import": "Importer un pack",
  "ch.p.importSub": "Un fichier .json d’un autre instructeur, ou un lien ou code de partage.",
  "ch.p.file": "Choisir un fichier",
  "ch.p.paste": "Collez un lien ou un code de partage",
  "ch.p.go": "Importer",
  "ch.p.policy": "Si une procédure existe déjà",
  "ch.p.newer": "Garder la plus récente",
  "ch.p.replace": "Remplacer la nôtre",
  "ch.p.keep": "Garder la nôtre",
  "ch.p.copy": "Importer en copie",
  "ch.p.linkTitle": "Partagé avec vous",
  "ch.p.linkProc": "Procédure « {t} »",
  "ch.p.linkPack": "{n} procédures partagées par {c}",
  "ch.p.linkPack.1": "1 procédure partagée par {c}",
  "ch.p.linkClub": "un autre club",
  "ch.p.linkBad": "Ce lien de partage est abîmé ou incomplet : demandez-en un nouveau.",
  "ch.p.linkLater": "Plus tard",
  "ch.p.disclaimer": "Les packs contiennent les textes propres au club : vérifiez-les avec le manuel de vol (POH/AFM).",
  "ch.imp.added": "{n} procédures ajoutées",
  "ch.imp.added.1": "1 procédure ajoutée",
  "ch.imp.replaced": "{n} procédures mises à jour",
  "ch.imp.replaced.1": "1 procédure mise à jour",
  "ch.imp.renamed": "{n} procédures importées en copie",
  "ch.imp.renamed.1": "1 procédure importée en copie",
  "ch.imp.skipped": "{id} : non importée ({why})",
  "ch.imp.nothing": "Rien à importer",
  "ch.nav": "Procédures · Club",
});

const uiL = (): Lang => (uiLang() === "fr" ? "fr" : "en");
const CLUB_TAB_KEY = "ifr.fc.clubTab";

/** the Ground school tile and crumb (FR / EN like the procedures page) */
function groundSchoolLabel(): string {
  return uiLang() === "fr" ? "Théorie" : "Ground school";
}
/** the tile's meta line, from the small course index (course/store.ts) without loading the store */
function groundSchoolMeta(): string {
  const fr = uiLang() === "fr";
  try {
    const raw = localStorage.getItem("ifr.course.index");
    const d = raw ? (JSON.parse(raw) as { courses?: unknown }) : null;
    const list = (Array.isArray(d?.courses) ? d.courses : []) as {
      assigned?: boolean;
      title?: { en?: string; fr?: string };
    }[];
    const a = list.find((c) => c && c.assigned);
    if (a) {
      const title = (fr ? a.title?.fr : undefined) ?? a.title?.en ?? "";
      return fr ? `Assigné : ${title}` : `Assigned: ${title}`;
    }
    if (list.length)
      return fr
        ? `${list.length} cours sur cet appareil · exemples`
        : `${list.length} ${list.length === 1 ? "course" : "courses"} on this device · samples`;
  } catch {
    /* storage blocked */
  }
  return fr ? "Maths IFR et VFR, VOR, attentes" : "Maths for IFR and VFR, VOR, holding";
}

export class FlightCenter extends Modal {
  private view: View = { type: "home" };
  /** where to go back to when the search is emptied */
  private beforeSearch: View = { type: "home" };
  private q = "";
  private fDiff = 0;
  private fApt = "";
  private fAp: "" | "ap" | "hand" = "";
  private sel: Item | null = null;
  private items = catalog();
  private wx: WxPreset = WX_PRESETS[0];
  private assess: AssessSettings = store.get<AssessSettings>("ifr.assess", {
    mode: "training",
    student: "",
    handFlown: false,
    randomFailure: false,
  });
  private gridEl!: HTMLElement;
  private side!: HTMLElement;
  private main!: HTMLElement;
  private detail!: HTMLElement;
  private crumb!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private searchClear!: HTMLElement;
  private plateView: HTMLElement | null = null;
  private quickPop: HTMLElement | null = null;
  // procedures mode page
  private flash: { text: string; kind: "ok" | "warn" } | null = null;
  private assignFor: string | null = null;
  private libQ = "";
  private libSrc: "all" | "club" | "library" = "all";
  private resStudent = "";
  private resVerdict: "" | "PASS" | "FAIL" = "";
  private packPolicy: ConflictPolicy = "newer";
  private packReport: { ok: boolean; lines: string[] } | null = null;
  /** a share link the page was opened with (?proc=<code>): offered for import on the Club pack page */
  private pendingShare: string | null =
    typeof location !== "undefined" ? shareCodeFromUrl(location.href) : null;

  constructor(private hooks: FcHooks) {
    super("Flight Center");
    this.box.classList.add("fc");
    clear(this.body);
    this.side = h("nav", {
      class: "fc-side",
      "aria-label": "Flight Center sections",
    });
    this.main = h("section", { class: "fc-main" });
    this.detail = h("aside", {
      class: "fc-detail",
      "aria-label": "Flight details",
    });
    this.gridEl = h(
      "div",
      { class: "fc-grid home" },
      this.side,
      this.main,
      this.detail,
    );
    this.body.append(this.gridEl);
    this.foot.remove();
    this.buildHeader();
    // the procedures page follows the FR / EN switch and the club library
    onLangChange(() => this.isOpen && this.render());
    onProceduresChange(() => this.isOpen && this.view.type === "club" && this.renderMain());
    // "/" focuses the search field; Esc closes the plate viewer / Quick start before it closes the Flight Center
    window.addEventListener(
      "keydown",
      (e) => {
        // another window stacked over the Flight Center (procedure editor) owns the keyboard
        if (!this.isOpen || Modal.stack[Modal.stack.length - 1] !== this) return;
        if (e.key === "Escape" && (this.plateView || this.quickPop)) {
          e.stopImmediatePropagation();
          e.preventDefault();
          if (this.quickPop) this.closeQuick(true);
          else this.closePlate();
          return;
        }
        const t = e.target as HTMLElement | null;
        const typing =
          !!t &&
          (t.tagName === "INPUT" ||
            t.tagName === "SELECT" ||
            t.tagName === "TEXTAREA");
        if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          this.searchInput.focus();
        }
      },
      true,
    );
  }

  /** header: "Flight Center" (back to the home screen) › section, the search field, close */
  private buildHeader() {
    const head = this.box.querySelector("header")!;
    const title = head.querySelector("h2")!;
    clear(title);
    title.classList.add("fc-title");
    this.crumb = h("span", { class: "fc-crumb" });
    title.append(
      h(
        "button",
        {
          class: "fc-title-home",
          title: "Flight Center home",
          onclick: () => this.go({ type: "home" }),
        },
        "Flight Center",
      ),
      this.crumb,
    );
    const search = h("input", {
      type: "search",
      placeholder: "Search all flights",
      "aria-label": "Search all flights",
      enterkeyhint: "search",
    }) as HTMLInputElement;
    const clearBtn = h(
      "button",
      {
        class: "fc-search-x",
        title: "Clear search",
        "aria-label": "Clear search",
        hidden: true,
        onclick: () => {
          search.value = "";
          this.onSearch("");
          search.focus();
        },
      },
      "×",
    );
    search.addEventListener("input", () => this.onSearch(search.value));
    search.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape" && search.value) {
        e.preventDefault();
        search.value = "";
        this.onSearch("");
      }
    });
    this.searchInput = search;
    this.searchClear = clearBtn;
    head.insertBefore(
      h(
        "div",
        { class: "fc-search" },
        h("span", { class: "fc-search-ic" }, svgIcon(I.target, 15)),
        search,
        clearBtn,
        h("kbd", { class: "fc-kbd", title: "Press / to search" }, "/"),
      ),
      head.querySelector(".x"),
    );
  }

  open() {
    // opened from a share link: straight to the Club pack page, where the link waits to be imported
    if (this.pendingShare && this.view.type !== "club") return this.openClub("pack");
    this.items = catalog();
    this.render();
    super.open();
  }

  /** open on the Ground school page: every slide deck (the top bar's Courses button); `intent` creates a course or
   *  picks one to present once the library is up */
  openCourses(intent?: CourseIntent) {
    this.items = catalog();
    if (!this.isOpen) super.open();
    this.go({ type: "courses", ...(intent ? { intent } : {}) });
  }

  /** open on the Procedures · Flying club page (main.ts: ?proc= share links, the builder's procedure links) */
  openClub(tab?: ClubTab) {
    this.items = catalog();
    if (!this.isOpen) super.open();
    this.goClub(tab);
  }

  close() {
    this.closePlate();
    this.closeQuick();
    super.close();
  }

  private go(v: View) {
    this.flash = null;
    if (v.type === "club") store.set(CLUB_TAB_KEY, v.tab);
    this.view = v;
    this.sel = null;
    this.assignFor = null;
    this.packReport = null;
    if (v.type !== "search") {
      this.q = "";
      this.searchInput.value = "";
    }
    this.closeQuick();
    this.render();
    this.main.scrollTop = 0;
  }

  /** leave the Flight Center and run a tool */
  private leave(fn: () => void) {
    this.close();
    fn();
  }

  render() {
    const home =
      this.view.type === "home" ||
      this.view.type === "instructor" ||
      this.view.type === "club" ||
      this.view.type === "courses";
    this.gridEl.classList.toggle("home", home);
    this.box.classList.toggle("fc-is-home", home);
    this.searchClear.hidden = !this.q;
    // the search field follows the FR / EN switch of the procedures page
    this.searchInput.placeholder = t("ch.searchAll");
    this.searchInput.setAttribute("aria-label", t("ch.searchAll"));
    this.renderCrumb();
    if (home) clear(this.side);
    else this.renderSide();
    this.renderMain();
    this.renderDetail();
  }

  private renderCrumb() {
    const v = this.view;
    const label =
      v.type === "home"
        ? ""
        : v.type === "instructor"
          ? "Instructor"
          : v.type === "courses"
            ? groundSchoolLabel()
          : v.type === "club"
            ? t("ch.title")
          : v.type === "all"
            ? "All flights"
            : v.type === "search"
              ? "Search"
              : v.type === "path"
                ? pathLabel(v.path)
                : CATEGORIES.find((c) => c.id === v.cat)!.title;
    clear(this.crumb);
    if (label)
      this.crumb.append(
        h("span", { class: "fc-crumb-sep", "aria-hidden": "true" }, "/"),
        h("span", {}, label),
      );
    this.box
      .querySelector(".fc-title-home")
      ?.classList.toggle("link", v.type !== "home");
  }

  /** select a flight (or clear the selection): fills the detail column without rebuilding the list */
  private select(i: Item | null) {
    this.sel = i;
    this.main
      .querySelectorAll<HTMLElement>("[data-id]")
      .forEach((c) => c.classList.toggle("sel", !!i && c.dataset.id === i.id));
    this.renderDetail();
  }

  // ------------------------------------------------------------------ sidebar (catalogue only)
  private renderSide() {
    clear(this.side);
    const all = progress.all();
    const v = this.view;
    const navBtn = (
      label: string,
      on: boolean,
      fn: () => void,
      opts: { count?: string; icon?: Node; tip?: string; key?: string } = {},
    ) =>
      h(
        "button",
        {
          class: `fc-nav${on ? " on" : ""}`,
          onclick: fn,
          title: opts.tip ?? label,
          "data-nav": opts.key,
          "aria-current": on ? "page" : null,
        },
        h("span", { class: "ic" }, opts.icon ?? null),
        h("span", { class: "lb" }, label),
        opts.count ? h("span", { class: "ct" }, opts.count) : null,
      );

    this.side.append(
      navBtn("Home", false, () => this.go({ type: "home" }), {
        icon: svgIcon(I.home),
        key: "home",
        tip: "Flight Center home",
      }),
      navBtn("All flights", v.type === "all", () => this.go({ type: "all" }), {
        icon: svgIcon(I.records),
        key: "all",
        count: String(this.items.length),
      }),
      navBtn(t("ch.nav"), false, () => this.goClub(), {
        icon: pIcon("drill"),
        key: "club",
        tip: t("ch.tileDesc"),
      }),
    );
    this.side.append(h("div", { class: "fc-sec" }, "Flight types"));
    for (const c of CATEGORIES) {
      const n = this.items.filter((i) => i.cat === c.id).length;
      this.side.append(
        navBtn(
          c.title,
          v.type === "cat" && v.cat === c.id,
          () => this.go({ type: "cat", cat: c.id, sub: null }),
          {
            count: String(n),
            icon: svgIcon(c.icon),
            tip: `${c.title} — ${c.desc}`,
            key: c.id,
          },
        ),
      );
    }
    this.side.append(h("div", { class: "fc-sec" }, "Learning paths"));
    for (const p of PATHS) {
      const done = p.exercises.filter((id) => all[id]?.passed).length;
      const complete = done === p.exercises.length;
      this.side.append(
        navBtn(
          pathLabel(p),
          v.type === "path" && v.path.id === p.id,
          () => this.go({ type: "path", path: p }),
          {
            icon: svgIcon(complete ? I.check : I.learn),
            // the count appears once the path is started, so the names fit the sidebar
            count: done ? `${done}/${p.exercises.length}` : undefined,
            tip: `${p.title} — ${done}/${p.exercises.length} passed`,
          },
        ),
      );
    }
    this.side.append(h("div", { class: "fc-sec" }, "Tools"));
    for (const t of this.tools(false))
      this.side.append(
        navBtn(t.label, false, () => this.leave(t.run), {
          icon: svgIcon(t.icon),
          tip: t.tip,
        }),
      );
  }

  /** the tools, in the home toolbar and the catalogue sidebar (only the wired ones) */
  private tools(withPair: boolean) {
    const hk = this.hooks;
    const list: {
      label: string;
      sub: string;
      icon: keyof typeof I;
      tip: string;
      run: () => void;
    }[] = [
      {
        label: "Flight builder",
        sub: "Route, procedures, weather",
        icon: I.plan,
        tip: "The flight builder, where every flight and IFR circuit is set up (reopens your last flight)",
        run: () => hk.openBuilder(),
      },
      {
        label: "Hold-entry drill",
        sub: "Timed entry decisions",
        icon: I.stopwatch,
        tip: "Timed drill: pick the right entry for random holds",
        run: () => hk.openDrill(),
      },
      {
        label: "Training records",
        sub: "Debriefs and CSV export",
        icon: I.clipboard,
        tip: "Every flight flown, debriefs and CSV export",
        run: () => hk.openRecords(),
      },
    ];
    if (withPair && hk.pairInstructor)
      list.push({
        label: "Pair instructor",
        sub: "Phone or tablet, by QR code",
        icon: I.tablet,
        tip: "Pair the instructor's phone or tablet (QR code)",
        run: hk.pairInstructor,
      });
    if (hk.openConnections)
      list.push({
        label: "Connections",
        sub: "Data link, webhooks, charts",
        icon: I.link,
        tip: "Data link, webhooks and chart accounts",
        run: hk.openConnections,
      });
    return list;
  }

  private onSearch(q: string) {
    const was = this.view.type === "search";
    if (q && !was) this.beforeSearch = this.view;
    this.q = q;
    this.searchClear.hidden = !q;
    this.sel = null;
    this.view = q ? { type: "search" } : this.beforeSearch;
    if (!q && this.beforeSearch.type === "search") this.view = { type: "home" };
    this.closeQuick();
    this.render();
  }

  // ------------------------------------------------------------------ lists
  private filtered(list: Item[]): Item[] {
    return list.filter(
      (i) =>
        (!this.fDiff || i.difficulty === this.fDiff) &&
        (!this.fApt || i.airport === this.fApt) &&
        (!this.fAp || (this.fAp === "ap" ? i.ap !== false : i.ap === false)),
    );
  }

  private filtersBar(list: Item[]): HTMLElement {
    const select = (
      label: string,
      value: string,
      opts: [string, string][],
      set: (v: string) => void,
    ) =>
      h(
        "select",
        {
          "aria-label": label,
          title: label,
          class: value ? "set" : "",
          onchange: (e: Event) => {
            set((e.target as HTMLSelectElement).value);
            this.renderMain();
          },
        },
        ...opts.map(([v, t]) =>
          h("option", { value: v, selected: v === value }, t),
        ),
      );
    const apts = [...new Set(list.map((i) => i.airport))].sort();
    const n = this.filtered(list).length;
    const active = !!(this.fDiff || this.fApt || this.fAp);
    return h(
      "div",
      { class: "fc-filters" },
      select(
        "Level",
        String(this.fDiff || ""),
        [
          ["", "Any level"],
          ["1", DIFF[1]],
          ["2", DIFF[2]],
          ["3", DIFF[3]],
        ],
        (v) => (this.fDiff = Number(v) || 0),
      ),
      apts.length > 1 || this.fApt
        ? select(
            "Airport",
            this.fApt,
            [
              ["", "Any airport"],
              ...apts.map((a) => [a, a] as [string, string]),
            ],
            (v) => (this.fApt = v),
          )
        : null,
      select(
        "Autopilot",
        this.fAp,
        [
          ["", "Autopilot or hand"],
          ["ap", "Autopilot allowed"],
          ["hand", "Hand-flown only"],
        ],
        (v) => (this.fAp = v as "" | "ap" | "hand"),
      ),
      active
        ? h(
            "button",
            { class: "fc-reset", onclick: () => this.resetFilters() },
            "Reset",
          )
        : null,
      h("span", { class: "fc-count" }, plural(n, "flight")),
    );
  }

  private resetFilters() {
    this.fDiff = 0;
    this.fApt = "";
    this.fAp = "";
    this.renderMain();
  }

  /** label: 'tag' (inside a category), 'sub' (by sub-type), 'cat' (search / all: category · sub) */
  private card(i: Item, label: "tag" | "sub" | "cat"): HTMLElement {
    const p = i.kind === "exercise" ? progress.get(i.id) : undefined;
    const cat = CATEGORIES.find((c) => c.id === i.cat)!;
    const top =
      label === "tag"
        ? i.tag
        : label === "cat"
          ? searchLabel(cat, i.tag)
          : i.sub;
    const badge = p?.passed
      ? h(
          "span",
          { class: "lp-badge ok", title: `Passed, best score ${pct(p.best)}` },
          `Best ${pct(p.best)}`,
        )
      : p
        ? h(
            "span",
            {
              class: "lp-badge try",
              title: `Not passed yet, best score ${pct(p.best)}`,
            },
            `Best ${pct(p.best)}`,
          )
        : h(
            "span",
            {
              class: "lp-badge",
              title: i.graded
                ? "Scored against standards at the end"
                : "Free practice, no score",
            },
            i.graded ? "Scored" : "Practice",
          );
    const ic = (name: keyof typeof I, tip: string) =>
      h("span", { class: "fc-mi", title: tip }, svgIcon(name, 14));
    return h(
      "button",
      {
        class: `fc-card ${i.cat}${this.sel?.id === i.id ? " sel" : ""}`,
        "data-id": i.id,
        title: "Click for the briefing · double-click (or Enter again) to fly",
        // keyboard: the first Enter opens the briefing, the second one flies
        onclick: (e: Event) =>
          (e as MouseEvent).detail === 0 && this.sel?.id === i.id
            ? this.fly(i)
            : this.select(i),
        ondblclick: () => this.fly(i),
      },
      h(
        "div",
        { class: "fc-card-top" },
        h("span", { class: "fc-type", title: `${cat.title} · ${i.sub}` }, top),
        badge,
      ),
      h("h3", {}, i.title),
      h("p", {}, i.summary),
      h(
        "div",
        { class: "fc-meta" },
        h("span", { class: `fc-lvl d${i.difficulty}` }, DIFF[i.difficulty]),
        h("span", {}, i.airport),
        h("span", {}, `${i.minutes} min`),
        i.ap === false ? ic(I.hand, "Hand-flown: autopilot inhibited") : null,
        i.plate ? ic(I.document, "Approach plate included") : null,
      ),
    );
  }

  private grid(
    list: Item[],
    label: "tag" | "sub" | "cat",
    filter = true,
  ): HTMLElement {
    const f = filter ? this.filtered(list) : list;
    if (!f.length)
      return this.empty(
        "No flights match these filters.",
        "Reset filters",
        () => this.resetFilters(),
      );
    return h(
      "div",
      { class: "fc-cards" },
      ...f.map((i) => this.card(i, label)),
    );
  }

  private empty(
    msg: string,
    action?: string,
    fn?: () => void,
    sub?: string,
  ): HTMLElement {
    return h(
      "div",
      { class: "fc-none" },
      h("span", { class: "fc-none-ic" }, svgIcon(I.target, 28)),
      h("b", {}, msg),
      sub ? h("span", {}, sub) : null,
      action && fn ? h("button", { class: "btn", onclick: fn }, action) : null,
    );
  }

  private searchResults(): Item[] {
    const words = this.q.toLowerCase().split(/\s+/).filter(Boolean);
    const score = (i: Item): number => {
      const cat = CATEGORIES.find((c) => c.id === i.cat)!;
      const title = i.title.toLowerCase();
      const group = `${i.sub} ${cat.title}`.toLowerCase();
      const rest =
        `${i.tag} ${i.tags.join(" ")} ${i.summary} ${i.airport}`.toLowerCase();
      let s = 0;
      for (const w of words) {
        const ws = title.includes(w)
          ? 3
          : group.includes(w)
            ? 2
            : rest.includes(w)
              ? 1
              : 0;
        if (!ws) return 0;
        s += ws;
      }
      return s;
    };
    return this.items
      .map((i) => ({ i, s: score(i) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || a.i.title.localeCompare(b.i.title))
      .map((r) => r.i);
  }

  // ------------------------------------------------------------------ main column
  private renderMain() {
    this.courseLib?.destroy();
    this.courseLib = null;
    this.deckHome?.destroy();
    this.deckHome = null;
    clear(this.main);
    const v = this.view;
    if (v.type === "home") return this.renderHome();
    if (v.type === "instructor") return this.renderInstructor();
    if (v.type === "courses") return this.renderCourses(v.intent);
    if (v.type === "club") return this.renderClub(v.tab);
    if (v.type === "path") return this.renderPath(v.path);
    if (v.type === "search") {
      const res = this.searchResults();
      this.main.append(
        h(
          "div",
          { class: "fc-head" },
          h(
            "div",
            {},
            h("h2", {}, `Results for “${this.q}”`),
          ),
        ),
      );
      if (!res.length) {
        this.main.append(
          this.empty(
            `No flights match “${this.q}”`,
            "Clear search",
            () => {
              this.searchInput.value = "";
              this.onSearch("");
            },
            "Try an airport (PARD), a procedure (ILS, hold, arc) or a skill (partial panel).",
          ),
        );
        return;
      }
      this.main.append(this.filtersBar(res), this.grid(res, "cat"));
      return;
    }
    if (v.type === "all") {
      this.main.append(
        h(
          "div",
          { class: "fc-head" },
          h(
            "div",
            {},
            h("h2", {}, "All flights"),
            h(
              "p",
              { class: "muted" },
              "Every lesson, approach, procedure and circuit, by flight type.",
            ),
          ),
        ),
        this.filtersBar(this.items),
      );
      const shown = this.filtered(this.items);
      if (!shown.length) {
        this.main.append(
          this.empty("No flights match these filters.", "Reset filters", () =>
            this.resetFilters(),
          ),
        );
        return;
      }
      for (const c of CATEGORIES) {
        const list = shown.filter((i) => i.cat === c.id);
        if (!list.length) continue;
        this.main.append(
          h(
            "div",
            { class: "fc-sec2" },
            h("span", { class: "fc-sec2-ic" }, svgIcon(c.icon, 16)),
            c.title,
            h("span", { class: "ct" }, String(list.length)),
            h(
              "button",
              {
                class: "fc-more",
                onclick: () => this.go({ type: "cat", cat: c.id, sub: null }),
              },
              "Open",
              svgIcon(I.arrow, 14),
            ),
          ),
          this.grid(list, "tag", false),
        );
      }
      return;
    }

    const cat = CATEGORIES.find((c) => c.id === v.cat)!;
    const inCatAll = this.items.filter((i) => i.cat === v.cat);
    const inCat = inCatAll.filter((i) => !v.sub || i.sub === v.sub);
    this.main.append(
      h(
        "div",
        { class: "fc-head" },
        h(
          "div",
          {},
          h("h2", { class: "has-ico" }, svgIcon(cat.icon, 22), cat.title),
          h("p", { class: "muted" }, cat.desc),
        ),
      ),
    );
    // the sub-types are chips above the list (the sidebar never grows or collapses)
    const subs = cat.subs.filter(
      (s) => v.cat === "circuits" || inCatAll.some((i) => i.sub === s),
    );
    if (subs.length > 1) {
      const chip = (label: string, sub: string | null, n: number) =>
        h(
          "button",
          {
            class: `fc-chip${v.sub === sub ? " on" : ""}`,
            "aria-pressed": String(v.sub === sub),
            onclick: () => this.go({ type: "cat", cat: cat.id, sub }),
          },
          label,
          h("span", { class: "ct" }, String(n)),
        );
      this.main.append(
        h(
          "div",
          { class: "fc-chips", role: "group", "aria-label": "Type" },
          chip("All", null, inCatAll.length),
          ...subs.map((s) =>
            chip(s, s, inCatAll.filter((i) => i.sub === s).length),
          ),
        ),
      );
    }
    this.main.append(this.filtersBar(inCat));
    if (v.cat === "circuits")
      this.main.append(
        h(
          "div",
          { class: "fc-builder-cta" },
          h(
            "div",
            {},
            h("b", {}, "Build your own IFR circuit"),
            h(
              "span",
              {},
              "In the flight builder: chain departures, holds and approaches into one graded session, then share it with a link.",
            ),
          ),
          h(
            "button",
            {
              class: "btn",
              onclick: () => this.leave(() => this.hooks.openBuilder()),
            },
            svgIcon(I.plan),
            "Open the flight builder",
          ),
        ),
      );
    const shown = this.filtered(inCat);
    const mine = v.cat === "circuits" && (!v.sub || v.sub === MINE);
    if (!shown.length && !mine) {
      this.main.append(
        this.empty("No flights match these filters.", "Reset filters", () =>
          this.resetFilters(),
        ),
      );
      return;
    }
    for (const s of v.sub ? [v.sub] : cat.subs) {
      const list = shown.filter((i) => i.sub === s);
      const emptyMine =
        s === MINE && !inCatAll.some((i) => i.sub === s);
      if (!list.length && !emptyMine) continue;
      if (!v.sub && subs.length > 1)
        this.main.append(
          h(
            "div",
            { class: "fc-sec2" },
            s,
            h("span", { class: "ct" }, String(list.length)),
          ),
        );
      this.main.append(
        emptyMine
          ? this.empty(
              "No flights of your own yet",
              undefined,
              undefined,
              "Flights you save in the flight builder, or open from a shared link, appear here.",
            )
          : this.grid(list, "tag", false),
      );
    }
  }

  // ------------------------------------------------------------------ home
  /** the slide decks drawn on the home screen (course/ui/deckHome.ts, loaded on demand) */
  private deckHome: { destroy(): void } | null = null;

  /** Home: the slides lead (SPEC slides v2 §12). A dark hero band with a real deck drawn live, the three teaching
   *  actions, then every deck as a slide card; the flying entries (build a flight, Quick start, the syllabus,
   *  tools, flight types) follow under "Fly". */
  private renderHome() {
    const ci = continueInfo(this.items);
    const fr = uiLang() === "fr";
    const L = (en: string, frText: string) => (fr ? frText : en);
    const visual = h("div", { class: "fc-sh-vis dh-visual", "aria-label": L("A course, drawn live", "Un cours, dessiné en direct") });
    const shelf = h("div", { class: "fc-deck-row dh-shelf", role: "list", "aria-label": L("Courses", "Cours") });
    // placeholders the size of the slides, so nothing moves when the engine arrives
    visual.append(h("div", { class: "dh-stage dh-wait" }), h("div", { class: "dh-film dh-wait" }));
    for (let i = 0; i < 4; i++) shelf.append(h("div", { class: "dh-card dh-wait", "aria-hidden": "true" }, h("div", { class: "dh-card-media" })));
    const slidesHero = h(
      "section",
      { class: "fc-sh", "aria-labelledby": "fc-sh-t" },
      h(
        "div",
        { class: "fc-sh-txt" },
        h("div", { class: "fc-sh-k" }, L("Ground school · Slides", "Théorie · Diapositives")),
        h("h1", { id: "fc-sh-t" }, L("Teach IFR with slides that come alive", "Enseignez l’IFR avec des diapositives vivantes")),
        h(
          "p",
          {},
          L(
            "Designed slides with the real instruments, generated calculation exercises and a Your turn on the instrument. When the lesson is ready, the simulator flies it: capable, simple, the engine behind every course.",
            "Des diapositives conçues avec les vrais instruments, des exercices de calcul générés et un « À vous » sur l’instrument. Quand la leçon est prête, le simulateur la fait voler : performant, simple, le moteur derrière chaque cours.",
          ),
        ),
        h(
          "div",
          { class: "fc-sh-acts" },
          h(
            "button",
            { class: "btn primary fc-sh-open", type: "button", onclick: () => this.go({ type: "courses" }), title: L("Every course: samples, your club’s and your drafts", "Tous les cours : exemples, ceux du club et vos brouillons") },
            svgIcon(I.learn, 20),
            L("Open a course", "Ouvrir un cours"),
          ),
          h(
            "button",
            { class: "btn fc-sh-b fc-sh-new", type: "button", onclick: () => this.go({ type: "courses", intent: "new" }), title: L("A new deck from a template, in the course builder", "Un nouveau cours à partir d’un modèle, dans l’éditeur") },
            svgIcon(I.plus, 18),
            L("Create a course", "Créer un cours"),
          ),
          h(
            "button",
            { class: "btn fc-sh-b fc-sh-present", type: "button", onclick: () => this.go({ type: "courses", intent: "present" }), title: L("Projector window and presenter notes on one computer", "Fenêtre projecteur et notes du présentateur sur un seul ordinateur") },
            svgIcon(I.screen, 18),
            L("Present to a class", "Présenter à une classe"),
          ),
        ),
      ),
      visual,
    );
    const decks = h(
      "section",
      { class: "fc-decks", "aria-labelledby": "fc-decks-t" },
      h(
        "div",
        { class: "fc-sec-h" },
        h("h2", { id: "fc-decks-t" }, L("Courses", "Cours")),
        h("span", { class: "fc-sec-sub" }, groundSchoolMeta()),
        h(
          "button",
          { class: "fc-sec-link", type: "button", onclick: () => this.go({ type: "courses" }) },
          L("The whole library", "Toute la bibliothèque"),
          svgIcon(I.arrow, 16),
        ),
      ),
      shelf,
    );
    void Promise.all([import("../course/ui/deckHome"), import("../course/store")]).then(([m, st]) => {
      if (!shelf.isConnected || this.view.type !== "home") return;
      this.deckHome?.destroy();
      this.deckHome = m.mountDeckHome({
        lang: fr ? "fr" : "en",
        visual,
        shelf,
        page: "academy.html",
        store: st.courseStore(),
        navigate: (url) => this.leave(() => location.assign(url)),
        onCreate: () => this.go({ type: "courses", intent: "new" }),
      });
    });
    const hero = h(
      "section",
      { class: "fc-hero2" },
      h("img", {
        class: "fc-hero-img",
        src: "/img/clouds.jpg",
        alt: "",
        decoding: "async",
        loading: "lazy",
      }),
      h(
        "div",
        { class: "fc-hero-txt" },
        h("h1", {}, L("What are we flying today?", "Qu’est-ce qu’on vole aujourd’hui ?")),
        h(
          "p",
          {},
          L(
            "Every flight is set up in the flight builder: airports, route, holds and approaches, weather and failures. Or let Quick start pick one for you.",
            "Chaque vol se prépare dans l’éditeur de vol : aérodromes, route, attentes et approches, météo et pannes. Ou laissez Départ rapide en choisir un.",
          ),
        ),
        h(
          "div",
          { class: "fc-hero-acts" },
          h(
            "button",
            {
              class: "btn primary fc-go",
              title:
                "Open the flight builder: departure, route, approach, weather, failures",
              onclick: () => this.leave(() => this.hooks.planFlight()),
            },
            svgIcon(I.plan, 20),
            L("Build a flight", "Préparer un vol"),
          ),
          h(
            "button",
            {
              class: "btn fc-quick-b",
              "aria-haspopup": "dialog",
              "aria-expanded": "false",
              title:
                "One click: a random approach or hold, flown straight away",
              onclick: (e: Event) =>
                this.quickPop
                  ? this.closeQuick()
                  : this.openQuick(e.currentTarget as HTMLElement),
            },
            svgIcon(I.dice, 18),
            L("Quick start", "Départ rapide"),
            svgIcon(I.chevDown, 14),
          ),
        ),
      ),
      this.continueCard(ci),
    );
    const flyHead = h(
      "div",
      { class: "fc-sec-h fc-fly-h" },
      h("h2", {}, L("Fly", "Voler")),
      h("span", { class: "fc-sec-sub" }, L("The simulator: approaches, holds, the syllabus, real-world flights", "Le simulateur : approches, attentes, syllabus, vols réels")),
    );
    const tools = h(
      "div",
      { class: "fc-tools", role: "toolbar", "aria-label": "Tools" },
      ...this.tools(true).map((t) =>
        h(
          "button",
          { class: "fc-tool", title: t.tip, onclick: () => this.leave(t.run) },
          h("span", { class: "fc-tool-ic" }, svgIcon(t.icon, 18)),
          h(
            "span",
            { class: "fc-tool-tx" },
            h("b", {}, t.label),
            h("small", {}, t.sub),
          ),
        ),
      ),
      h(
        "button",
        {
          class: "fc-tool fc-browse",
          title:
            "Every flight by type, with search, filters and learning paths",
          onclick: () => this.go({ type: "all" }),
        },
        h("span", { class: "fc-tool-ic" }, svgIcon(I.records, 18)),
        h(
          "span",
          { class: "fc-tool-tx" },
          h("b", {}, "Browse all flights"),
          h("small", {}, `${this.items.length} flights · search, paths`),
        ),
        svgIcon(I.arrow, 16),
      ),
    );
    const n = (f: (i: Item) => boolean) => this.items.filter(f).length;
    const nApp = n((i) => i.cat === "approaches");
    const nHold = n((i) => i.cat === "procedures" && i.sub === "Holdings");
    const nMine = n((i) => i.cat === "circuits" && i.sub === MINE);
    const nCirc = n((i) => i.cat === "circuits");
    const tiles = h(
      "div",
      { class: "fc-tiles" },
      this.tile({
        img: "hero-cockpit",
        title: "Learn the syllabus",
        desc: "The Instrument Rating, lesson by lesson, from the first scan to the checkride.",
        meta: `${ci.passed} of ${ci.total} passed`,
        bar: ci.passed / ci.total,
        run: () => this.go({ type: "path", path: ci.path }),
      }),
      this.tile({
        img: "landing",
        title: "Practise approaches",
        desc: "ILS, LOC, VOR, NDB, RNAV and circling, coupled or hand-flown.",
        meta: plural(nApp, "approach", "approaches"),
        run: () => this.go({ type: "cat", cat: "approaches", sub: null }),
      }),
      this.tile({
        img: "above",
        title: "Practise holds",
        desc: "Direct, teardrop and parallel entries, wind correction, ATC clearances.",
        meta: plural(nHold, "hold"),
        run: () => this.go({ type: "cat", cat: "procedures", sub: "Holdings" }),
      }),
      this.tile({
        img: "departure",
        title: t("ch.tile"),
        desc: t("ch.tileDesc"),
        meta: t("ch.tileMeta", {
          d: listDrills(uiL()).length,
          p: effectiveProcedures(uiL()).length,
        }),
        run: () => this.goClub(),
        cls: "fc-tile-club",
      }),
      this.tile({
        img: "sky",
        title: "My flights & circuits",
        desc: "Your saved and shared flights, school presets and templates.",
        meta: nMine
          ? `${plural(nMine, "flight")} of yours · in the flight builder`
          : `${plural(nCirc, "school preset")} · in the flight builder`,
        run: () => this.leave(() => this.hooks.openBuilder()),
      }),
      this.tile({
        img: "crew",
        title: "Instructor",
        desc: "Pair a phone, build a lesson, run the session and review the records.",
        meta: "School tools",
        run: () => this.go({ type: "instructor" }),
        cls: "fc-tile-ins",
      }),
    );
    this.main.append(
      h(
        "div",
        { class: "fc-home" },
        slidesHero,
        decks,
        h("section", { class: "fc-fly", "aria-label": L("Fly", "Voler") }, flyHead, hero, tools, tiles),
      ),
    );
  }

  private continueCard(ci: ReturnType<typeof continueInfo>): HTMLElement {
    const card = h("aside", { class: "fc-cont", "aria-label": "Continue" });
    card.append(
      h("div", { class: "fc-cont-k" }, ci.started ? "Continue" : "Start here"),
    );
    if (ci.next) {
      card.append(
        h(
          "div",
          { class: "fc-cont-sub" },
          `${pathLabel(ci.path)} · Lesson ${ci.lesson} of ${ci.total}`,
        ),
        h("b", { class: "fc-cont-t" }, ci.next.title),
        h(
          "div",
          { class: "fc-cont-prog" },
          h(
            "div",
            { class: "lp-bar" },
            h("i", { style: `width:${(ci.passed / ci.total) * 100}%` }),
          ),
          h("span", {}, `${ci.passed}/${ci.total}`),
        ),
        h(
          "button",
          {
            class: "btn fc-cont-go",
            title: "Brief and fly the next lesson",
            onclick: () => this.fly(ci.next!, ci.path),
          },
          ci.started ? "Continue lesson" : "Start lesson 1",
          svgIcon(I.arrow, 16),
        ),
      );
    } else {
      card.append(
        h("b", { class: "fc-cont-t" }, "Syllabus complete"),
        h(
          "div",
          { class: "fc-cont-sub" },
          `All ${ci.total} lessons passed. Keep current with the checkride profiles.`,
        ),
        h(
          "button",
          {
            class: "btn fc-cont-go",
            onclick: () =>
              this.go({ type: "cat", cat: "checkride", sub: null }),
          },
          "Checkride profiles",
          svgIcon(I.arrow, 16),
        ),
      );
    }
    if (ci.last) {
      const last = ci.last;
      card.append(
        h(
          "div",
          { class: "fc-cont-last" },
          h(
            "div",
            {},
            h("small", {}, `Last flight · ${last.when}`),
            h("span", { title: last.item.title }, last.item.title),
          ),
          h(
            "button",
            {
              class: "btn ghost",
              title: `Fly “${last.item.title}” again`,
              onclick: () => this.fly(last.item),
            },
            svgIcon(I.restart, 15),
            "Fly again",
          ),
        ),
      );
    }
    return card;
  }

  private tile(t: {
    img: string;
    title: string;
    desc: string;
    meta: string;
    bar?: number;
    run?: () => void;
    href?: string;
    cls?: string;
  }): HTMLElement {
    const inner = [
      h(
        "span",
        { class: "fc-tile-img" },
        h("img", {
          src: `/img/${t.img}.jpg`,
          alt: "",
          decoding: "async",
        }),
      ),
      h(
        "span",
        { class: "fc-tile-txt" },
        h("b", {}, t.title, t.href ? svgIcon(I.direct, 14) : null),
        h("span", { class: "fc-tile-d" }, t.desc),
        h(
          "span",
          { class: "fc-tile-m" },
          t.bar !== undefined
            ? h(
                "span",
                { class: "lp-bar" },
                h("i", { style: `width:${t.bar * 100}%` }),
              )
            : null,
          h("span", {}, t.meta),
        ),
      ),
    ];
    return t.href
      ? h(
          "a",
          {
            class: "fc-tile",
            href: t.href,
            target: "_blank",
            rel: "noopener",
          },
          ...inner,
        )
      : h(
          "button",
          { class: `fc-tile${t.cls ? ` ${t.cls}` : ""}`, onclick: t.run },
          ...inner,
        );
  }

  // ------------------------------------------------------------------ Quick start
  private quickPrefs(): { apt: string } {
    return store.get<{ apt: string }>(QUICK_KEY, { apt: "" });
  }

  private openQuick(anchor: HTMLElement) {
    this.closeQuick();
    const pref = this.quickPrefs();
    const apts = [
      ...new Set(
        [
          ...quickPool(this.items, "approach", ""),
          ...quickPool(this.items, "hold", ""),
        ].map((i) => i.airport),
      ),
    ].sort();
    if (pref.apt && !apts.includes(pref.apt)) pref.apt = "";
    const pop = h("div", {
      class: "fc-pop",
      role: "dialog",
      "aria-label": "Quick start",
    });
    const opts = h("div", { class: "fc-pop-opts" });
    const fill = () => {
      clear(opts);
      const kinds: [QuickKind, string, keyof typeof I, string][] = [
        [
          "approach",
          "Random approach",
          I.approach,
          "ILS, LOC, VOR, NDB or RNAV",
        ],
        ["hold", "Random hold", I.hold, "Entries, timing, wind"],
      ];
      for (const [k, label, icon, sub] of kinds) {
        const pool = quickPool(this.items, k, pref.apt);
        opts.append(
          h(
            "button",
            {
              class: "fc-pop-b",
              disabled: !pool.length,
              title: pool.length
                ? `Fly one of ${plural(pool.length, "flight")} at random`
                : `No ${k} at ${pref.apt} yet`,
              onclick: () => {
                const it = pool[Math.floor(Math.random() * pool.length)];
                if (it) this.fly(it);
              },
            },
            h("span", { class: "fc-pop-ic" }, svgIcon(icon, 20)),
            h(
              "span",
              { class: "fc-pop-tx" },
              h("b", {}, label),
              h(
                "small",
                {},
                pool.length
                  ? `${sub} · ${plural(pool.length, "flight")}`
                  : "None at this airport",
              ),
            ),
            svgIcon(I.arrow, 16),
          ),
        );
      }
    };
    const sel = h(
      "select",
      {
        "aria-label": "Airport",
        onchange: (e: Event) => {
          pref.apt = (e.target as HTMLSelectElement).value;
          store.set(QUICK_KEY, pref);
          fill();
        },
      },
      h("option", { value: "", selected: !pref.apt }, "Any airport"),
      ...apts.map((a) =>
        h(
          "option",
          { value: a, selected: a === pref.apt },
          `${a} · ${aptName(a)}`,
        ),
      ),
    );
    fill();
    pop.append(
      h(
        "div",
        { class: "fc-pop-head" },
        h("b", {}, "Quick start"),
        h("span", {}, "Flies straight away, current weather"),
      ),
      h(
        "label",
        { class: "fc-pop-apt" },
        h("span", {}, "Airport · training region"),
        sel,
      ),
      opts,
    );
    // under the button, inside the Flight Center box
    const box = this.box.getBoundingClientRect();
    const r = anchor.getBoundingClientRect();
    pop.style.left = `${Math.max(12, r.left - box.left)}px`;
    pop.style.top = `${r.bottom - box.top + 8}px`;
    this.box.append(pop);
    this.quickPop = pop;
    anchor.setAttribute("aria-expanded", "true");
    const off = (e: Event) => {
      if (!pop.contains(e.target as Node) && !anchor.contains(e.target as Node))
        this.closeQuick();
    };
    setTimeout(() => document.addEventListener("pointerdown", off, true));
    pop.dataset.off = "1";
    (pop as HTMLElement & { _off?: (e: Event) => void })._off = off;
    requestAnimationFrame(() =>
      pop
        .querySelector<HTMLElement>(".fc-pop-b:not([disabled])")
        ?.focus({ preventScroll: true }),
    );
  }

  private closeQuick(refocus = false) {
    const pop = this.quickPop as
      | (HTMLElement & { _off?: (e: Event) => void })
      | null;
    if (!pop) return;
    if (pop._off) document.removeEventListener("pointerdown", pop._off, true);
    pop.remove();
    this.quickPop = null;
    const b = this.box.querySelector<HTMLElement>(".fc-quick-b");
    b?.setAttribute("aria-expanded", "false");
    if (refocus) b?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ instructor
  // ------------------------------------------------------------------ Ground school (the course library)
  private courseLib: { destroy(): void } | null = null;
  /** the course library (course/ui/library.ts, loaded on demand); a course opens academy.html in this tab */
  private renderCourses(intent?: CourseIntent) {
    const host = h("div", { class: "fc-courses" });
    this.main.append(host);
    void Promise.all([import("../course/ui/library"), import("../course/store")]).then(
      ([m, st]) => {
        if (!host.isConnected || this.view.type !== "courses") return;
        this.courseLib?.destroy();
        this.courseLib = m.mountLibrary(host, {
          lang: uiLang(),
          store: st.courseStore(),
          embedded: true,
          page: "academy.html",
          ...(intent ? { intent } : {}),
          navigate: (url) => this.leave(() => location.assign(url)),
        });
      },
    );
  }

  private renderInstructor() {
    const hk = this.hooks;
    type Act = {
      icon: keyof typeof I;
      title: string;
      desc: string;
      label: string;
      run: () => void;
      leave?: boolean;
    };
    const acts: Act[] = [];
    if (hk.pairInstructor)
      acts.push({
        icon: I.tablet,
        title: "Pair a phone or tablet",
        desc: "Scan a QR code and run the lesson from the right seat: failures, weather, freeze, reposition.",
        label: "Pair instructor",
        run: hk.pairInstructor,
        leave: true,
      });
    if (hk.openInstructor)
      acts.push({
        icon: I.instructor,
        title: "Instructor station",
        desc: "Fail instruments, change the weather and move the aircraft on this screen.",
        label: "Open the station",
        run: hk.openInstructor,
        leave: true,
      });
    acts.push(
      {
        icon: I.warning,
        title: t("ch.title"),
        desc: t("ch.sub"),
        label: t("ch.tab.drills"),
        run: () => this.goClub("drills"),
      },
      {
        icon: I.learn,
        title: uiLang() === "fr" ? "Des cours pour vos élèves" : "Courses for your students",
        desc:
          uiLang() === "fr"
            ? "Des diapositives avec les vrais instruments, des exercices de calcul et un « À vous » dans le simulateur. Dupliquez un exemple ou partez de zéro."
            : "Designed slides with the real instruments, calculation exercises and a Your turn in the simulator. Duplicate a sample or start from scratch.",
        label: groundSchoolLabel(),
        run: () => this.go({ type: "courses" }),
      },
      {
        icon: I.plan,
        title: "Build a lesson",
        desc: "In the flight builder: chain a departure, holds and approaches with weather and scheduled failures, or start from a school preset. Share it with a link.",
        label: "Open the flight builder",
        run: () => hk.openBuilder(),
        leave: true,
      },
      {
        icon: I.badge,
        title: "Checkride profiles",
        desc: "Full practical-test profiles graded against the ACS, with no coaching.",
        label: "Open profiles",
        run: () => this.go({ type: "cat", cat: "checkride", sub: null }),
      },
      {
        icon: I.clipboard,
        title: "Training records",
        desc: "Every flight with its debrief, filterable by student, exportable as CSV.",
        label: "Open records",
        run: () => hk.openRecords(),
        leave: true,
      },
    );
    if (hk.openConnections)
      acts.push({
        icon: I.link,
        title: "Connections",
        desc: "Send results to your school's system, link chart accounts and external tools.",
        label: "Open connections",
        run: hk.openConnections,
        leave: true,
      });
    this.main.append(
      h(
        "div",
        { class: "fc-home fc-ins" },
        h(
          "div",
          { class: "fc-head" },
          h(
            "div",
            {},
            h(
              "button",
              { class: "fc-back", onclick: () => this.go({ type: "home" }) },
              svgIcon(I.arrow, 14),
              "Flight Center",
            ),
            h("h2", {}, "Instructor"),
            h(
              "p",
              { class: "muted" },
              "Prepare the lesson, run it from the right seat, then debrief from the records.",
            ),
          ),
        ),
        h(
          "div",
          { class: "fc-acts" },
          ...acts.map((a) =>
            h(
              "button",
              {
                class: "fc-act",
                onclick: () => (a.leave ? this.leave(a.run) : a.run()),
              },
              h("span", { class: "fc-act-ic" }, svgIcon(a.icon, 22)),
              h(
                "span",
                { class: "fc-act-tx" },
                h("b", {}, a.title),
                h("span", {}, a.desc),
              ),
              h("span", { class: "fc-act-go" }, a.label, svgIcon(I.arrow, 14)),
            ),
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------------------ procedures · flying club
  private goClub(tab?: ClubTab) {
    const last = store.get<ClubTab>(CLUB_TAB_KEY, "drills");
    this.go({ type: "club", tab: tab ?? (["drills", "library", "results", "pack"].includes(last) ? last : "drills") });
  }

  private say(text: string, kind: "ok" | "warn" = "ok") {
    this.flash = { text, kind };
    this.renderMain();
  }

  private renderClub(tab: ClubTab) {
    const l = uiL();
    const drills = listDrills(l);
    const procs = effectiveProcedures(l);
    const nRes = procedureRows(history.all()).length;
    const langSeg = h(
      "div",
      { class: "seg ch-lang", role: "group", "aria-label": t("ch.lang") },
      ...(["fr", "en"] as UiLang[]).map((x) =>
        h(
          "button",
          {
            class: uiLang() === x ? "on" : "",
            "aria-pressed": String(uiLang() === x),
            title: x === "fr" ? "Français" : "English",
            onclick: () => setLang(x),
          },
          x === "fr" ? "FR" : "EN",
        ),
      ),
    );
    const tabs: [ClubTab, PIcon, string, number | null][] = [
      ["drills", "drill", t("ch.tab.drills"), drills.length],
      ["library", "book", t("ch.tab.library"), procs.length],
      ["results", "chart", t("ch.tab.results"), nRes],
      ["pack", "share", t("ch.tab.pack"), null],
    ];
    const page = h(
      "div",
      { class: "fc-home ch" },
      h(
        "div",
        { class: "fc-head ch-head" },
        h(
          "div",
          {},
          h(
            "button",
            { class: "fc-back", onclick: () => this.go({ type: "home" }) },
            svgIcon(I.arrow, 14),
            t("ch.back"),
          ),
          h("h2", {}, t("ch.title")),
          h("p", { class: "muted" }, t("ch.sub")),
        ),
        langSeg,
      ),
      h(
        "div",
        { class: "ch-tabs", role: "tablist", "aria-label": t("ch.title") },
        ...tabs.map(([id, icon, label, n]) =>
          h(
            "button",
            {
              role: "tab",
              class: `ch-tab${tab === id ? " on" : ""}`,
              "aria-selected": String(tab === id),
              "data-tab": id,
              onclick: () => this.go({ type: "club", tab: id }),
            },
            pIcon(icon, 18),
            h("span", {}, label),
            n !== null ? h("span", { class: "ct" }, String(n)) : null,
          ),
        ),
      ),
    );
    if (this.flash)
      page.append(
        h(
          "div",
          { class: `ch-flash ${this.flash.kind}`, role: "status" },
          pIcon(this.flash.kind === "ok" ? "check" : "warn", 16),
          h("span", {}, this.flash.text),
          h(
            "button",
            {
              class: "fc-x",
              "aria-label": "OK",
              onclick: () => {
                this.flash = null;
                this.renderMain();
              },
            },
            "×",
          ),
        ),
      );
    const body = h("div", { class: "ch-body", role: "tabpanel" });
    if (tab === "drills") this.clubDrills(body, drills);
    else if (tab === "library") this.clubLibrary(body);
    else if (tab === "results") this.clubResults(body);
    else this.clubPack(body);
    page.append(body);
    this.main.append(page);
  }

  // ---- drills
  private flyEntry(e: DrillEntry) {
    const c = e.build();
    if (!c) {
      this.editEntry(e);
      return;
    }
    if (!c.assignee && this.assess.student) c.assignee = this.assess.student;
    this.leave(() => (this.hooks.flyDrill ?? this.hooks.flyCircuit)(c));
  }

  private editEntry(e: DrillEntry) {
    const x: Circuit | string = e.kind === "template" ? e.id : (e.build() ?? e.id);
    this.leave(() => {
      if (this.hooks.editDrill) return this.hooks.editDrill(x);
      void import("./circuitBuilder").then((m) => {
        if (!m.openDrill(x)) this.hooks.openBuilder(typeof x === "string" ? undefined : x);
      });
    });
  }

  private assign(e: DrillEntry, name: string) {
    const who = name.trim();
    const c = e.kind === "club" ? circuitStore.list().find((x) => x.id === e.id) : e.build();
    if (!c) {
      this.say(t("ch.d.noBuild"), "warn");
      return;
    }
    if (who) c.assignee = who;
    else delete c.assignee;
    circuitStore.save(c);
    this.assignFor = null;
    this.flash = who ? { text: t("ch.d.assignDone", { d: c.name, s: who }), kind: "ok" } : null;
    this.renderMain();
  }

  /** the students the club knows: assignees and the names in the records */
  private knownStudents(): string[] {
    const names = new Set<string>();
    for (const c of circuitStore.list()) if (c.assignee) names.add(c.assignee);
    for (const a of history.all()) if (a.student?.trim()) names.add(a.student.trim());
    return [...names].sort((a, b) => a.localeCompare(b));
  }

  private drillCard(e: DrillEntry): HTMLElement {
    const l = uiL();
    const keys = e.failures.filter((f): f is FailureKey => f !== "random");
    const icon: PIcon = keys.length ? CAT_ICONS[categoryFor(keys[0])] : "drill";
    const phase = PHASES.find((p) => p.id === e.phase);
    const fails = e.failures.map((f) => (f === "random" ? t("ch.d.random") : failureName(f, l)));
    const card = h(
      "article",
      { class: `ch-drill${e.kind === "club" ? " club" : ""}${e.mode === "test" ? " test" : ""}`, "data-id": e.id },
      h(
        "div",
        { class: "ch-drill-top" },
        h("span", { class: `ch-ic cat-${keys.length ? categoryFor(keys[0]) : "other"}` }, pIcon(icon, 20)),
        h(
          "div",
          { class: "ch-drill-tx" },
          h("h3", {}, e.name),
          h(
            "div",
            { class: "ch-meta" },
            phase ? h("span", {}, phase.name[l]) : null,
            h(
              "span",
              { class: `ch-mode ${e.mode}`, title: t(e.mode === "test" ? "ch.d.testTip" : "ch.d.trainingTip") },
              t(e.mode === "test" ? "ch.d.test" : "ch.d.training"),
            ),
            e.assignee ? h("span", { class: "ch-who" }, pIcon("users", 13), e.assignee) : null,
          ),
        ),
      ),
    );
    // while assigning, the form takes the place of the description (the card keeps its height)
    if (this.assignFor !== e.id)
      card.append(
        h("p", { class: "ch-desc" }, e.desc || ""),
        h("div", { class: "ch-fails" }, ...fails.map((f) => h("span", {}, f))),
      );
    if (this.assignFor === e.id) {
      const input = h("input", {
        type: "text",
        value: e.assignee ?? this.assess.student ?? "",
        placeholder: t("ch.d.assignPh"),
        "aria-label": t("ch.d.assignTo"),
        list: "ch-students",
        enterkeyhint: "done",
      }) as HTMLInputElement;
      input.addEventListener("keydown", (ev) => {
        ev.stopPropagation();
        if (ev.key === "Enter") this.assign(e, input.value);
        if (ev.key === "Escape") {
          this.assignFor = null;
          this.renderMain();
        }
      });
      card.append(
        h(
          "div",
          { class: "ch-assign" },
          h("label", {}, h("span", {}, t("ch.d.assignTo")), input),
          h("datalist", { id: "ch-students" }, ...this.knownStudents().map((s) => h("option", { value: s }))),
          h(
            "div",
            { class: "ch-assign-b" },
            e.assignee ? h("button", { class: "btn ghost", onclick: () => this.assign(e, "") }, t("ch.d.unassign")) : null,
            h("button", { class: "btn", onclick: () => ((this.assignFor = null), this.renderMain()) }, t("pe.cancel")),
            h("button", { class: "btn primary", onclick: () => this.assign(e, input.value) }, t("ch.d.assignOk")),
          ),
        ),
      );
      requestAnimationFrame(() => input.focus());
    }
    card.append(
      h(
        "div",
        { class: "ch-acts" },
        h("button", { class: "btn primary", onclick: () => this.flyEntry(e) }, pIcon("play", 15), t("ch.d.fly")),
        h("button", { class: "btn", onclick: () => this.editEntry(e) }, pIcon("edit", 15), t("ch.d.edit")),
        h(
          "button",
          {
            class: `btn ghost${this.assignFor === e.id ? " on" : ""}`,
            "aria-expanded": String(this.assignFor === e.id),
            onclick: () => {
              this.assignFor = this.assignFor === e.id ? null : e.id;
              this.renderMain();
            },
          },
          pIcon("users", 15),
          t("ch.d.assign"),
        ),
      ),
    );
    return card;
  }

  private clubDrills(body: HTMLElement, all: DrillEntry[]) {
    const name = h("input", {
      type: "text",
      value: this.assess.student,
      placeholder: t("ch.d.studentPh"),
      "aria-label": t("ch.d.student"),
      list: "ch-students-all",
      autocomplete: "off",
    }) as HTMLInputElement;
    name.addEventListener("keydown", (e) => e.stopPropagation());
    name.addEventListener("change", () => {
      this.assess.student = name.value.trim();
      store.set("ifr.assess", this.assess);
      this.renderMain();
    });
    body.append(
      h(
        "div",
        { class: "ch-bar" },
        h(
          "label",
          { class: "ch-student" },
          pIcon("users", 16),
          h("span", {}, t("ch.d.student")),
          name,
          h("datalist", { id: "ch-students-all" }, ...this.knownStudents().map((s) => h("option", { value: s }))),
        ),
        h("span", { class: "grow" }),
        h(
          "button",
          {
            class: "btn primary ch-new",
            title: t("ch.d.newTip"),
            onclick: () => this.editEntry(listDrills(uiL()).find((d) => d.kind === "template")!),
          },
          pIcon("plus", 16),
          t("ch.d.new"),
        ),
      ),
    );
    const club = all.filter((d) => d.kind === "club");
    const me = this.assess.student.trim().toLowerCase();
    const mine = me ? club.filter((d) => d.assignee?.trim().toLowerCase() === me) : [];
    const rest = club.filter((d) => !mine.includes(d));
    const tpls = all.filter((d) => d.kind === "template");
    const templates = () =>
      body.append(
        h(
          "div",
          { class: "fc-sec2" },
          t("ch.d.tpl"),
          h("span", { class: "ct" }, String(tpls.length)),
          h("small", { class: "ch-sec-sub" }, t("ch.d.tplSub")),
        ),
        h("div", { class: "ch-grid" }, ...tpls.map((d) => this.drillCard(d))),
      );
    if (mine.length)
      body.append(
        h("div", { class: "fc-sec2" }, pIcon("users", 16), t("ch.d.mine", { s: this.assess.student }), h("span", { class: "ct" }, String(mine.length))),
        h("div", { class: "ch-grid" }, ...mine.map((d) => this.drillCard(d))),
      );
    if (rest.length)
      body.append(
        h("div", { class: "fc-sec2" }, t("ch.d.club"), h("span", { class: "ct" }, String(rest.length))),
        h("div", { class: "ch-grid" }, ...rest.map((d) => this.drillCard(d))),
      );
    templates();
    // no club drill yet: the templates come first, then how to make the club's own
    if (!club.length)
      body.append(
        h("div", { class: "fc-sec2" }, t("ch.d.club"), h("span", { class: "ct" }, "0")),
        h(
          "div",
          { class: "ch-empty" },
          h("span", { class: "fc-none-ic" }, pIcon("drill", 24)),
          h("div", {}, h("b", {}, t("ch.d.clubNone")), h("span", {}, t("ch.d.clubNoneSub"))),
        ),
      );
  }

  // ---- procedure library
  private openProc(id: string | null) {
    openProcedureEditor({
      id,
      lang: uiL(),
      onSaved: (p, how) =>
        this.say(how === "reset" && p ? t("ch.l.reset", { t: p.title }) : p ? t("ch.l.saved", { t: p.title }) : t("ch.l.deleted")),
    });
  }

  private procRow(p: Procedure): HTMLElement {
    const l = uiL();
    const mem = p.items.filter((i) => i.memory).length;
    const club = p.source === "club";
    return h(
      "li",
      { class: `ch-proc${club ? " club" : ""}`, "data-id": p.id },
      h(
        "button",
        { class: "ch-proc-main", onclick: () => this.openProc(p.id), title: club ? t("ch.l.edit") : t("ch.l.open") },
        h("span", { class: `ch-ic cat-${p.category}` }, pIcon(CAT_ICONS[p.category] ?? "other", 18)),
        h(
          "span",
          { class: "ch-proc-tx" },
          h(
            "b",
            {},
            p.title,
            p.lang !== l ? h("span", { class: "ch-lang-tag" }, p.lang.toUpperCase()) : null,
          ),
          p.summary ? h("span", { class: "ch-proc-sum" }, p.summary) : null,
          h(
            "span",
            { class: "ch-proc-meta" },
            h("span", { class: `ch-src ${club ? "club" : "lib"}` }, club ? (p.basedOn ? t("ch.l.custom") : t("ch.l.club")) : t("ch.l.library")),
            h("span", {}, tn("ch.l.items", p.items.length)),
            mem ? h("span", { class: "ch-mem" }, tn("ch.l.mem", mem)) : null,
            p.failures.length
              ? h("span", { class: "ch-ans", title: p.failures.map((f) => failureName(f, l)).join(", ") }, l === "fr" ? `${t("ch.l.answers")}\u00a0: ` : `${t("ch.l.answers")}: `, p.failures.map((f) => failureName(f, l)).join(", "))
              : null,
          ),
        ),
      ),
      h(
        "div",
        { class: "ch-proc-acts" },
        h(
          "button",
          { class: "pe-ib", title: t("ch.l.share"), "aria-label": `${t("ch.l.share")} · ${p.title}`, onclick: () => openShareDialog(p) },
          pIcon("share", 16),
        ),
        h("button", { class: "btn", onclick: () => this.openProc(p.id) }, club ? pIcon("edit", 15) : pIcon("eye", 15), club ? t("ch.l.edit") : t("ch.l.open")),
      ),
    );
  }

  private clubLibrary(body: HTMLElement) {
    const l = uiL();
    const other: Lang = l === "fr" ? "en" : "fr";
    // the library in the screen language, and every club procedure (a club writes in its own language)
    const all = [...effectiveProcedures(l), ...effectiveProcedures(other).filter((p) => p.source === "club")];
    const words = this.libQ.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = all.filter(
      (p) =>
        (this.libSrc === "all" || (this.libSrc === "club") === (p.source === "club")) &&
        words.every((w) =>
          `${p.title} ${p.summary ?? ""} ${p.failures.map((f) => failureName(f, l)).join(" ")} ${CATEGORY_LABELS[p.category]?.[l] ?? ""}`
            .toLowerCase()
            .includes(w),
        ),
    );
    const search = h("input", {
      type: "search",
      value: this.libQ,
      placeholder: t("ch.l.search"),
      "aria-label": t("ch.l.search"),
      enterkeyhint: "search",
    }) as HTMLInputElement;
    search.addEventListener("keydown", (e) => e.stopPropagation());
    search.addEventListener("input", () => {
      this.libQ = search.value;
      const pos = search.selectionStart;
      this.renderMain();
      const again = this.main.querySelector<HTMLInputElement>(".ch-search input");
      again?.focus();
      if (pos !== null) again?.setSelectionRange(pos, pos);
    });
    const nClub = all.filter((p) => p.source === "club").length;
    const src = (id: typeof this.libSrc, label: string, n: number) =>
      h(
        "button",
        {
          class: this.libSrc === id ? "on" : "",
          "aria-pressed": String(this.libSrc === id),
          onclick: () => {
            this.libSrc = id;
            this.renderMain();
          },
        },
        label,
        h("span", { class: "ct" }, String(n)),
      );
    body.append(
      h(
        "div",
        { class: "ch-bar" },
        h("label", { class: "ch-search" }, pIcon("search", 16), search),
        h(
          "div",
          { class: "seg ch-seg", role: "group" },
          src("all", t("ch.l.all"), all.length),
          src("club", t("ch.l.club"), nClub),
          src("library", t("ch.l.library"), all.length - nClub),
        ),
        h("span", { class: "grow" }),
        h("button", { class: "btn primary", onclick: () => this.openProc(null) }, pIcon("plus", 16), t("ch.l.new")),
      ),
    );
    if (!shown.length) {
      body.append(
        h(
          "div",
          { class: "ch-empty" },
          h("span", { class: "fc-none-ic" }, pIcon(this.libQ ? "search" : "book", 24)),
          this.libQ
            ? h("div", {}, h("b", {}, t("ch.l.none", { q: this.libQ })), h("span", {}, t("ch.l.noneSub")))
            : h("div", {}, h("b", {}, t("ch.l.noClub")), h("span", {}, t("ch.l.noClubSub"))),
        ),
      );
    } else
      for (const cat of CATEGORY_ORDER) {
        const list = shown.filter((p) => p.category === cat);
        if (!list.length) continue;
        body.append(
          h(
            "div",
            { class: "fc-sec2 ch-cat" },
            h("span", { class: `ch-ic sm cat-${cat}` }, pIcon(CAT_ICONS[cat], 15)),
            CATEGORY_LABELS[cat][l],
            h("span", { class: "ct" }, String(list.length)),
          ),
          h("ul", { class: "ch-procs" }, ...list.map((p) => this.procRow(p))),
        );
      }
    body.append(h("p", { class: "ch-disc" }, pIcon("book", 14), DISCLAIMER[l]));
  }

  // ---- results
  private clubResults(body: HTMLElement) {
    const rows = procedureRows(history.all());
    if (!rows.length) {
      body.append(
        h(
          "div",
          { class: "ch-empty big" },
          h("span", { class: "fc-none-ic" }, pIcon("chart", 28)),
          h("div", {}, h("b", {}, t("ch.r.none")), h("span", {}, t("ch.r.noneSub"))),
          h("button", { class: "btn primary", onclick: () => this.go({ type: "club", tab: "drills" }) }, pIcon("drill", 15), t("ch.tab.drills")),
        ),
      );
      return;
    }
    const studs = studentsOf(rows);
    if (this.resStudent && !studs.includes(this.resStudent)) this.resStudent = "";
    const f = filterProcRows(rows, { student: this.resStudent || undefined, verdict: this.resVerdict });
    const sum = procSummary(f);
    const sel = (label: string, value: string, opts: [string, string][], set: (v: string) => void) =>
      h(
        "label",
        { class: "ch-sel" },
        h("span", {}, label),
        h(
          "select",
          {
            "aria-label": label,
            onchange: (e: Event) => {
              set((e.target as HTMLSelectElement).value);
              this.renderMain();
            },
          },
          ...opts.map(([v, tx]) => h("option", { value: v, selected: v === value }, tx)),
        ),
      );
    const dl = () => {
      const blob = new Blob([`﻿${procCsv(f)}`], { type: "text/csv;charset=utf-8" });
      const a = h("a", { href: URL.createObjectURL(blob), download: `procedures-${new Date().toISOString().slice(0, 10)}.csv` });
      document.body.append(a);
      a.click();
      setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
    };
    const stat = (label: string, v: string, cls = "") => h("div", { class: `ch-stat ${cls}` }, h("span", {}, label), h("b", {}, v));
    body.append(
      h(
        "div",
        { class: "ch-bar" },
        sel(t("ch.r.student"), this.resStudent, [["", t("ch.r.allStudents")], ...studs.map((s) => [s, s || t("ch.r.noName")] as [string, string])], (v) => (this.resStudent = v)),
        sel(t("ch.r.verdict"), this.resVerdict, [["", t("ch.r.allVerdicts")], ["PASS", t("ch.v.PASS")], ["FAIL", t("ch.v.FAIL")]], (v) => (this.resVerdict = v as "" | "PASS" | "FAIL")),
        // the two actions wrap together, to the right
        h(
          "div",
          { class: "ch-bar-end" },
          h("button", { class: "btn ghost", onclick: () => this.leave(() => this.hooks.openRecords()) }, svgIcon(I.clipboard, 15), t("ch.r.records")),
          h("button", { class: "btn", onclick: dl, disabled: !f.length }, pIcon("download", 15), t("ch.r.csv")),
        ),
      ),
      h(
        "div",
        { class: "ch-stats" },
        stat(t("ch.r.n"), String(sum.n)),
        stat(t("ch.r.pass"), sum.passRate === null ? "—" : `${sum.passRate} %`, sum.passRate !== null && sum.passRate >= 70 ? "ok" : sum.passRate !== null ? "bad" : ""),
        stat(t("ch.r.avg"), sum.avgScore === null ? "—" : `${sum.avgScore}/100`),
        stat(t("ch.r.react"), sum.reactionS === null ? "—" : `${String(sum.reactionS).replace(".", uiL() === "fr" ? "," : ".")} s`),
      ),
    );
    if (!f.length) {
      body.append(h("div", { class: "ch-empty" }, h("span", { class: "fc-none-ic" }, pIcon("search", 24)), h("div", {}, h("b", {}, t("ch.r.noneFilter")))));
      return;
    }
    const weak = sum.byProcedure.filter((p) => p.pass < p.n).slice(0, 3);
    if (weak.length)
      body.append(
        h(
          "div",
          { class: "ch-weak" },
          h("b", {}, pIcon("warn", 15), t("ch.r.weak")),
          ...weak.map((w) => h("span", {}, h("strong", {}, w.procedure), ` · ${t("ch.r.weakLine", { p: w.pass, n: w.n, a: w.avgScore })}`)),
        ),
      );
    const date = (iso: string) => {
      const d = new Date(iso);
      return Number.isFinite(d.getTime())
        ? d.toLocaleDateString(uiL() === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" })
        : "";
    };
    body.append(
      h(
        "div",
        { class: "ch-table-wrap" },
        h(
          "table",
          { class: "ch-table" },
          h(
            "thead",
            {},
            h(
              "tr",
              {},
              h("th", {}, t("ch.r.date")),
              h("th", {}, t("ch.r.student")),
              h("th", { class: "c-drill" }, t("ch.r.drill")),
              h("th", {}, t("ch.r.proc")),
              h("th", { class: "num" }, t("ch.r.score")),
              h("th", {}, t("ch.r.verdict")),
            ),
          ),
          h(
            "tbody",
            {},
            ...f.slice(0, 300).map((r) =>
              h(
                "tr",
                {},
                h("td", { class: "c-date" }, date(r.date)),
                h("td", {}, r.student || h("span", { class: "muted" }, "—")),
                h("td", { class: "c-drill" }, r.drill),
                h(
                  "td",
                  { class: "c-proc" },
                  h(
                    "div",
                    {},
                  h("b", {}, r.procedure),
                  h(
                    "small",
                    {},
                    // the drill column is hidden on narrow screens: its name rides along here
                    r.drill ? h("span", { class: "c-drill-sm" }, r.drill, " · ") : null,
                    failureName(r.failure, uiL()),
                    " · ",
                    t(r.mode === "test" ? "ch.d.test" : "ch.d.training"),
                  ),
                  r.notes.length > 1
                    ? h(
                        "details",
                        { class: "c-notes" },
                        h("summary", {}, h("span", { class: "c-note" }, r.note), h("span", { class: "c-more" }, tn("ch.r.more", r.notes.length - 1))),
                        h("ul", {}, ...r.notes.slice(1).map((x) => h("li", {}, x))),
                      )
                    : r.note
                      ? h("span", { class: "c-note" }, r.note)
                      : null,
                  ),
                ),
                h("td", { class: "num" }, h("b", {}, String(r.score))),
                h("td", {}, h("span", { class: `ch-verdict ${r.verdict === "PASS" ? "ok" : "bad"}` }, t(`ch.v.${r.verdict}`))),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /** the share link the page was opened with: what it holds, Import / Not now */
  private pendingCard(): HTMLElement | null {
    const code = this.pendingShare;
    if (!code) return null;
    const done = () => {
      this.pendingShare = null;
      // the link is used once: a reload does not offer it again
      try {
        const u = new URL(location.href);
        u.searchParams.delete("proc");
        if (u.hash.includes("proc=")) u.hash = "";
        window.history.replaceState(window.history.state, "", u.toString());
      } catch {
        /* not a browser */
      }
    };
    const { ok, title, procs } = shareSummary(code);
    return h(
      "section",
      { class: `ch-pending${ok ? "" : " bad"}`, role: "region", "aria-label": t("ch.p.linkTitle") },
      h("span", { class: "ch-ic" }, pIcon(ok ? "link" : "warn", 18)),
      h(
        "div",
        { class: "ch-pending-tx" },
        h("small", {}, t("ch.p.linkTitle")),
        h("b", {}, title),
        procs.length
          ? h(
              "ul",
              {},
              ...procs.slice(0, 6).map((p) =>
                h("li", {}, p.title, h("span", { class: "muted" }, ` · ${tn("ch.l.items", p.items)}`)),
              ),
              procs.length > 6 ? h("li", { class: "muted" }, `+ ${procs.length - 6}`) : null,
            )
          : null,
      ),
      h(
        "div",
        { class: "ch-pending-b" },
        h("button", { class: "btn ghost", onclick: () => (done(), this.renderMain()) }, t("ch.p.linkLater")),
        ok
          ? h(
              "button",
              {
                class: "btn primary",
                onclick: () => {
                  const r = importShare(code, this.packPolicy, uiL());
                  done();
                  this.packReport = importSummary(r);
                  this.renderMain();
                },
              },
              pIcon("download", 15),
              t("ch.p.go"),
            )
          : null,
      ),
    );
  }

  // ---- club pack
  private clubPack(body: HTMLElement) {
    const pending = this.pendingCard();
    if (pending) body.append(pending);
    const n = listClub().length;
    const name = h("input", {
      type: "text",
      value: clubName(),
      placeholder: t("ch.p.namePh"),
      "aria-label": t("ch.p.name"),
      maxlength: 80,
    }) as HTMLInputElement;
    name.addEventListener("keydown", (e) => e.stopPropagation());
    name.addEventListener("change", () => setClubName(name.value));
    const download = () => {
      const blob = new Blob([exportPackJson()], { type: "application/json" });
      const slug = (clubName() || "club").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "club";
      const a = h("a", { href: URL.createObjectURL(blob), download: `${slug}-procedures.json` });
      document.body.append(a);
      a.click();
      setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
    };
    const report = (r: ImportReport) => {
      this.packReport = importSummary(r);
      this.renderMain();
    };
    const file = h("input", { type: "file", accept: ".json,application/json", class: "ch-file", "aria-label": t("ch.p.file") }) as HTMLInputElement;
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (!f) return;
      report(importPack(await f.text(), this.packPolicy, uiL()));
    });
    const code = h("input", { type: "text", placeholder: t("ch.p.paste"), "aria-label": t("ch.p.paste"), autocomplete: "off" }) as HTMLInputElement;
    code.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && code.value.trim()) report(importShare(code.value, this.packPolicy, uiL()));
    });
    const pol: [ConflictPolicy, string][] = [
      ["newer", t("ch.p.newer")],
      ["replace", t("ch.p.replace")],
      ["keep", t("ch.p.keep")],
      ["copy", t("ch.p.copy")],
    ];
    const card = (icon: PIcon, title: string, sub: string, ...content: (Node | null)[]) =>
      h(
        "section",
        { class: "ch-card" },
        h("div", { class: "ch-card-h" }, h("span", { class: "ch-ic" }, pIcon(icon, 18)), h("div", {}, h("b", {}, title), h("small", {}, sub))),
        ...content,
      );
    body.append(
      h(
        "div",
        { class: "ch-pack" },
        card("users", t("ch.p.name"), t("ch.p.nameHint"), h("div", { class: "ch-row" }, name)),
        card(
          "upload",
          t("ch.p.export"),
          n ? tn("ch.p.exportSub", n) : t("ch.p.exportNone"),
          h(
            "div",
            { class: "ch-row" },
            h("button", { class: "btn primary", disabled: !n, onclick: download }, pIcon("download", 15), t("ch.p.download")),
            h("button", { class: "btn", disabled: !n, onclick: () => openShareDialog(exportPack()) }, pIcon("qr", 15), t("ch.p.link")),
          ),
        ),
        card(
          "download",
          t("ch.p.import"),
          t("ch.p.importSub"),
          h(
            "label",
            { class: "ch-sel" },
            h("span", {}, t("ch.p.policy")),
            h(
              "select",
              {
                onchange: (e: Event) => (this.packPolicy = (e.target as HTMLSelectElement).value as ConflictPolicy),
              },
              ...pol.map(([v, tx]) => h("option", { value: v, selected: v === this.packPolicy }, tx)),
            ),
          ),
          h(
            "div",
            { class: "ch-row" },
            h("button", { class: "btn", onclick: () => file.click() }, pIcon("other", 15), t("ch.p.file")),
            file,
          ),
          h(
            "div",
            { class: "ch-row" },
            code,
            h("button", { class: "btn", onclick: () => code.value.trim() && report(importShare(code.value, this.packPolicy, uiL())) }, t("ch.p.go")),
          ),
          this.packReport
            ? h(
                "div",
                { class: `ch-report ${this.packReport.ok ? "ok" : "warn"}`, role: "status" },
                ...this.packReport.lines.map((x) => h("div", {}, x)),
              )
            : null,
        ),
      ),
      h("p", { class: "ch-disc" }, pIcon("book", 14), t("ch.p.disclaimer")),
    );
  }

  // ------------------------------------------------------------------ learning path
  private renderPath(path: Path) {
    const all = progress.all();
    const list = path.exercises
      .map((id) => this.items.find((i) => i.id === id))
      .filter((i): i is Item => !!i);
    const done = list.filter((i) => all[i.id]?.passed).length;
    this.main.append(
      h(
        "div",
        { class: "fc-head" },
        h(
          "div",
          {},
          h("h2", {}, path.title),
          h("p", { class: "muted" }, path.desc),
        ),
        h(
          "div",
          { class: "fc-path-prog" },
          h("span", {}, `${done}/${list.length} passed`),
          h(
            "div",
            { class: "lp-bar" },
            h("i", {
              style: `width:${list.length ? (done / list.length) * 100 : 0}%`,
            }),
          ),
        ),
      ),
    );
    const next = list.find((i) => !all[i.id]?.passed);
    const ol = h("ol", { class: "lp-list" });
    list.forEach((i, k) => {
      const p = all[i.id];
      const isNext = i === next;
      ol.append(
        h(
          "li",
          {
            class: `${p?.passed ? "done" : ""}${isNext ? " next" : ""}${this.sel?.id === i.id ? " sel" : ""}`,
            "data-id": i.id,
            tabindex: 0,
            onclick: () => this.select(i),
            onkeydown: (e: Event) => {
              if ((e as KeyboardEvent).key === "Enter")
                this.sel?.id === i.id ? this.fly(i, path) : this.select(i);
            },
          },
          h(
            "span",
            { class: "lp-num" },
            p?.passed ? svgIcon(I.check, 15) : String(k + 1),
          ),
          h(
            "div",
            { class: "lp-txt" },
            h(
              "b",
              {},
              i.title,
              isNext ? h("span", { class: "lp-next" }, "Next") : null,
            ),
            h(
              "small",
              {},
              `${i.sub} · ${DIFF[i.difficulty]} · ${i.minutes} min`,
            ),
            h("span", {}, i.summary),
          ),
          p
            ? h(
                "span",
                { class: `lp-badge ${p.passed ? "ok" : "try"}` },
                p.passed
                  ? `Best ${pct(p.best)}`
                  : `Best ${pct(p.best)} · retry`,
              )
            : h("span", {}),
          h(
            "button",
            {
              class: `btn${isNext ? " primary" : ""}`,
              onclick: (e: Event) => {
                e.stopPropagation();
                this.fly(i, path);
              },
            },
            isNext ? "Start" : "Fly",
          ),
        ),
      );
    });
    this.main.append(ol);
  }

  // ------------------------------------------------------------------ detail column
  private renderDetail() {
    const i = this.sel;
    const prev = this.detail.querySelector(".fc-detail-body");
    const keep = prev && this.detail.dataset.id === i?.id ? prev.scrollTop : 0;
    clear(this.detail);
    this.gridEl.classList.toggle("no-sel", !i);
    this.detail.dataset.id = i?.id ?? "";
    if (!i) {
      // empty state: what the pane is for, and the shortcuts
      const key = (k: string, what: string) =>
        h("li", {}, h("kbd", {}, k), h("span", {}, what));
      this.detail.append(
        h(
          "div",
          { class: "fc-detail-empty" },
          h("span", { class: "fc-none-ic" }, svgIcon(I.document, 28)),
          h("b", {}, "Select a flight"),
          h(
            "span",
            {},
            "Its briefing, objectives, approach plate and cockpit options appear here.",
          ),
          h(
            "ul",
            { class: "fc-keys", "aria-label": "Shortcuts" },
            key("Click", "Briefing"),
            key("Double-click", "Fly"),
            key("Enter", "Briefing, then fly"),
            key("/", "Search"),
            key("Esc", "Close"),
          ),
        ),
      );
      return;
    }
    const cat = CATEGORIES.find((c) => c.id === i.cat)!;
    const body = h("div", { class: "fc-detail-body" });
    body.append(
      h(
        "div",
        { class: "fc-detail-head" },
        h("div", { class: "fc-kicker" }, `${cat.title} · ${i.sub}`),
        h(
          "button",
          {
            class: "fc-x",
            title: "Close details",
            "aria-label": "Close details",
            onclick: () => this.select(null),
          },
          "×",
        ),
      ),
      h("h2", {}, i.title),
      h(
        "div",
        { class: "fc-meta" },
        h("span", { class: `fc-lvl d${i.difficulty}` }, DIFF[i.difficulty]),
        h("span", {}, i.airport),
        h("span", {}, `${i.minutes} min`),
        h("span", {}, i.graded ? "Scored" : "Practice"),
        i.ap === false ? h("span", {}, "Hand-flown") : null,
      ),
      h("p", {}, i.summary),
    );
    if (i.ex) {
      body.append(
        h("div", { class: "section-t" }, "Objectives"),
        h(
          "ul",
          { class: "tips" },
          ...i.ex.objectives.map((o) => h("li", {}, o)),
        ),
      );
      body.append(
        h("div", { class: "section-t" }, "Standards"),
        h(
          "ul",
          { class: "tips" },
          ...i.ex.standards.map((o) => h("li", {}, o)),
        ),
      );
    } else if (i.sc) {
      body.append(
        h("div", { class: "section-t" }, "Briefing"),
        h("ul", { class: "tips" }, ...i.sc.briefing.map((o) => h("li", {}, o))),
      );
    }
    const plateAp = i.plate ? findApproach(i.plate) : undefined;
    if (i.plate && plateAp) {
      const ap = plateAp;
      const svg = approachPlate(ap);
      body.append(
        h("div", { class: "section-t" }, `Plate · ${ap.airport} ${ap.name}`),
        h(
          "div",
          { class: "fc-plate" },
          h("button", {
            class: "fc-plate-img",
            title: "Open the plate",
            "aria-label": `Open the ${ap.name} plate`,
            onclick: () => this.openPlate(i.plate!, svg),
            html: svg,
          }),
          h(
            "button",
            {
              class: "btn fc-plate-open",
              onclick: () => this.openPlate(i.plate!, svg),
            },
            svgIcon(I.document, 14),
            "Open plate",
          ),
        ),
      );
    }
    body.append(this.cockpitPicker());
    if (i.kind === "scenario") {
      body.append(h("div", { class: "section-t" }, "Weather"));
      body.append(
        h(
          "select",
          {
            "aria-label": "Weather",
            onchange: (e: Event) =>
              (this.wx =
                WX_PRESETS[Number((e.target as HTMLSelectElement).value)]),
          },
          ...WX_PRESETS.map((w, k) =>
            h(
              "option",
              { value: k, selected: w === this.wx },
              `${w.name} — ${w.desc}`,
            ),
          ),
        ),
      );
      body.append(h("div", { class: "section-t" }, "Session"));
      const name = h("input", {
        type: "text",
        placeholder: "Student name (optional)",
        "aria-label": "Student name",
        value: this.assess.student,
        oninput: (e: Event) => {
          this.assess.student = (e.target as HTMLInputElement).value;
          store.set("ifr.assess", this.assess);
        },
      });
      name.addEventListener("keydown", (e) => e.stopPropagation());
      const mode = (m: AssessSettings["mode"], label: string, tip: string) =>
        h(
          "button",
          {
            class: this.assess.mode === m ? "on" : "",
            title: tip,
            onclick: () => {
              this.assess.mode = m;
              store.set("ifr.assess", this.assess);
              this.renderDetail();
            },
          },
          label,
        );
      body.append(
        name,
        h(
          "div",
          { class: "seg fc-seg" },
          mode(
            "training",
            "Training",
            "Coached: hints and call-outs during the flight",
          ),
          mode("checkride", "Checkride", "Graded against the ACS, no coaching"),
        ),
      );
      if (this.assess.mode === "checkride")
        body.append(
          h(
            "label",
            { class: "fc-check" },
            h("input", {
              type: "checkbox",
              checked: this.assess.handFlown,
              onchange: (e: Event) => {
                this.assess.handFlown = (e.target as HTMLInputElement).checked;
                store.set("ifr.assess", this.assess);
              },
            }),
            "Hand-flown (autopilot inhibited)",
          ),
          h(
            "label",
            { class: "fc-check" },
            h("input", {
              type: "checkbox",
              checked: this.assess.randomFailure,
              onchange: (e: Event) => {
                this.assess.randomFailure = (
                  e.target as HTMLInputElement
                ).checked;
                store.set("ifr.assess", this.assess);
              },
            }),
            "Random failure on the approach",
          ),
        );
    }
    if (i.circuit)
      body.append(
        h(
          "button",
          {
            class: "btn fc-edit",
            onclick: () => {
              this.close();
              this.hooks.openBuilder(i.circuit);
            },
          },
          svgIcon(I.plan),
          "Edit in the flight builder",
        ),
      );
    const label =
      i.kind === "exercise"
        ? "Brief and fly"
        : this.assess.mode === "checkride"
          ? "Start checkride"
          : "Fly";
    this.detail.append(
      body,
      h(
        "div",
        { class: "fc-detail-foot" },
        h(
          "button",
          { class: "btn primary big", onclick: () => this.fly(i) },
          label,
        ),
      ),
    );
    body.scrollTop = keep;
  }

  private cockpitPicker(): HTMLElement {
    const cur = this.hooks.getCockpit();
    const seg = h("div", {
      class: "seg fc-seg",
      role: "group",
      "aria-label": "Cockpit",
    });
    for (const c of COCKPITS)
      seg.append(
        h(
          "button",
          {
            class: cur === c.id ? "on" : "",
            title: c.desc,
            "data-ck": c.id,
            onclick: () => {
              this.hooks.setCockpit(c.id);
              seg
                .querySelectorAll<HTMLElement>("button")
                .forEach((b) =>
                  b.classList.toggle("on", b.dataset.ck === c.id),
                );
            },
          },
          c.title,
        ),
      );
    return h("div", {}, h("div", { class: "section-t" }, "Cockpit"), seg);
  }

  // ------------------------------------------------------------------ plate viewer (inside the Flight Center)
  private openPlate(id: string, svg: string) {
    this.closePlate();
    const ap = findApproach(id);
    if (!ap) return;
    this.plateView = h(
      "div",
      {
        class: "fc-plate-view",
        role: "dialog",
        "aria-label": `${ap.airport} ${ap.name}`,
        onclick: (e: Event) => {
          if (e.target === this.plateView) this.closePlate();
        },
      },
      h(
        "div",
        { class: "fc-plate-box" },
        h(
          "div",
          { class: "fc-plate-bar" },
          h("b", {}, `${ap.airport} · ${ap.name}`),
          h("span", { class: "grow" }),
          h(
            "button",
            {
              class: "btn",
              title: "Open in the chart viewer (zoom, other plates)",
              onclick: () => {
                this.close();
                this.hooks.openChart(id);
              },
            },
            svgIcon(I.chart, 14),
            "Chart viewer",
          ),
          h(
            "button",
            {
              class: "fc-x",
              title: "Close (Esc)",
              "aria-label": "Close the plate",
              onclick: () => this.closePlate(),
            },
            "×",
          ),
        ),
        h("div", { class: "fc-plate-full", html: svg }),
      ),
    );
    this.box.append(this.plateView);
  }

  private closePlate() {
    this.plateView?.remove();
    this.plateView = null;
  }

  private fly(i: Item, path: Path | null = null) {
    this.close();
    if (i.circuit) this.hooks.flyCircuit(i.circuit);
    else if (i.ex)
      this.hooks.briefExercise(
        i.ex,
        path ?? (this.view.type === "path" ? this.view.path : null),
      );
    else if (i.sc) this.hooks.flyScenario(i.sc, this.wx, { ...this.assess });
  }
}

/**
 * The top bar's Courses button (main.ts): the slide decks are one click away from the cockpit. Its label follows
 * the FR / EN switch.
 */
export function coursesTopbarButton(open: () => void): HTMLElement {
  const lbl = h("span", { class: "lbl" });
  const b = h("button", { class: "btn tb-courses", type: "button", onclick: open }, svgIcon(I.slides), lbl);
  const sync = () => {
    const fr = uiLang() === "fr";
    lbl.textContent = fr ? "Cours" : "Courses";
    b.title = fr
      ? "Cours en diapositives : ouvrir, créer, présenter à une classe"
      : "Slide courses: open, create, present to a class";
  };
  sync();
  onLangChange(sync);
  return b;
}
