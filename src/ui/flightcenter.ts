// The index.html page box: Accueil and Simulateur (UX logic §4, drawn by ui/home.ts) under the shared app bar
// (ui/appBar.ts), and the pages below them (the club's tools, the instructor's page, the simulator's flight lists and
// a flight's detail). It is an opaque light page, not a dialog over the cockpit: Esc does not close it, and it holds
// the page's one <main>. The library lives in academy.html only: the old embedded library view leaves for it.
// (The class keeps its historical name, FlightCenter; the UI never shows it.)
import { h, clear, store } from "./dom";
import { LESSON_META, LESSON_ORDER } from "../library/meta";
import { CLASSIFICATION } from "../library/classification";
import { programDef, subjectDef } from "../library/programs";
import { Modal, WX_PRESETS, type WxPreset } from "./modals";
import {
  CATEGORIES,
  MINE_SUB as MINE,
  catalog,
  type CatId,
  type Item,
} from "./catalog";
import { PATHS, type Path } from "../train/curriculum";
import { progress } from "./learn";
import { history } from "./history";
import { approachPlate } from "../plates/plates";
import { findApproach, TRAINING_REGION } from "../nav/data";
import { I, svgIcon } from "./icons";
import { appBar, type AppBar, type Place } from "./appBar";
import { BRAND, brandTagline, brandTitle } from "../brand";
import { homeView, simView, type HomeHooks, type QuickKind as PlaceQuick } from "./home";
import type { AssessSettings, Scenario } from "../sim/sim";
import type { Exercise } from "../train/engine";
import type { Attempt } from "./history";
import type { Circuit } from "../train/circuits";
import { circuitStore } from "../train/circuits";
import {
  registerStrings,
  t,
  tn,
  lang as uiLang,
  setLang,
  onLangChange,
} from "./i18n";
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
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  DISCLAIMER,
} from "../train/procedureLibrary";
import type { Lang, Procedure, ProcedureResult } from "../train/procedureTypes";
import type { FailureKey } from "../sim/systemsTypes";
import {
  CAT_ICONS,
  categoryFor,
  failureName,
  openProcedureEditor,
  openShareDialog,
  pIcon,
  type PIcon,
} from "./procedureEditor";

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
  /** the Simulateur place: Vol rapide, Préparer un vol, the last flights */
  | { type: "sim" }
  | { type: "instructor" }
  | { type: "all" }
  | { type: "cat"; cat: CatId; sub: string | null }
  | { type: "path"; path: Path }
  | { type: "search" }
  | { type: "club"; tab: ClubTab }
  | {
      type: "courses";
      intent?: CourseIntent;
      /** every flight of the simulator, in the library (what "All flights" opens) */
      flights?: boolean;
      program?: import("../library/programs").ProgramId;
      subject?: import("../library/programs").SubjectId;
    };

/** what the Ground school page does once the library is up: create a course, or pick one to present */
export type CourseIntent = "new" | "present";

/** set (sessionStorage) when a course opens from the Flight Center: the course page's way back returns here, to the
 *  Flight Center's library (index.html#courses), instead of its own library page (learn/main.ts) */
export const COURSE_FROM_KEY = "ifr.courseFrom";
function goToCourse(url: string) {
  try {
    sessionStorage.setItem(COURSE_FROM_KEY, "fc");
  } catch {
    /* storage blocked */
  }
  location.assign(url);
}

/** the flight types' names in French (the flight data itself stays as written) */
const CAT_FR: Record<string, string> = {
  approaches: "Approches",
  procedures: "Procédures",
  xc: "Vols IFR",
  circuits: "Circuits IFR",
  basics: "Bases du vol aux instruments",
  abnormal: "Urgences",
  checkride: "Test en vol",
  free: "Vol libre",
};
/** a flight type's name in the UI language */
const catTitle = (c: { id: string; title: string }) =>
  uiLang() === "fr" ? (CAT_FR[c.id] ?? c.title) : c.title;

type QuickKind = "approach" | "hold";

const DIFF = ["", "Easy", "Medium", "Hard"];
const DIFF_FR = ["", "Facile", "Moyen", "Difficile"];
/** a level's word in the UI language */
const diffLabel = (d: number) => (uiLang() === "fr" ? DIFF_FR : DIFF)[d] ?? "";
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
const PATH_SHORT_FR: Record<string, string> = {
  ir: "Qualification IR",
  classic: "VOR/NDB classiques",
  holds: "Attentes",
  emerg: "Panneau partiel",
  xc: "Navigation IFR",
  ckp: "Préparation au test",
};
const QUICK_KEY = "ifr.fc.quick";
/** « aujourd’hui », « hier », « il y a 3 jours », else the date (the last flights) */
function whenLabel(iso: string, fr: boolean, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = Math.floor((now - t) / 86400000);
  if (d <= 0) return fr ? "aujourd’hui" : "today";
  if (d === 1) return fr ? "hier" : "yesterday";
  if (d < 7) return fr ? `il y a ${d} jours` : `${d} days ago`;
  return new Date(t).toLocaleDateString(fr ? "fr-FR" : "en-GB", { day: "numeric", month: "short" });
}

const pathLabel = (p: Path) =>
  (uiLang() === "fr" ? PATH_SHORT_FR[p.id] : undefined) ??
  PATH_SHORT[p.id] ??
  p.title.replace(" — complete syllabus", "");
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
        notes: Array.isArray(r.notes)
          ? r.notes.filter((x) => typeof x === "string" && x)
          : [],
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
      words.every((w) =>
        `${r.procedure} ${r.drill} ${r.student}`.toLowerCase().includes(w),
      ),
  );
}

/** the students who appear in the rows, sorted (no name: '') */
export function studentsOf(rows: ProcRow[]): string[] {
  return [...new Set(rows.map((r) => r.student))].sort((a, b) =>
    a.localeCompare(b),
  );
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
  byProcedure: {
    procedureId: string;
    procedure: string;
    n: number;
    pass: number;
    avgScore: number;
  }[];
}
export function procSummary(rows: ProcRow[]): ProcSummary {
  const n = rows.length;
  const pass = rows.filter((r) => r.verdict === "PASS").length;
  const reacts = rows
    .map((r) => r.reactionS)
    .filter((x): x is number => x !== null)
    .sort((a, b) => a - b);
  const med = reacts.length
    ? reacts.length % 2
      ? reacts[(reacts.length - 1) / 2]
      : (reacts[reacts.length / 2 - 1] + reacts[reacts.length / 2]) / 2
    : null;
  const by = new Map<
    string,
    {
      procedureId: string;
      procedure: string;
      n: number;
      pass: number;
      sum: number;
    }
  >();
  for (const r of rows) {
    const k = r.procedureId;
    const e = by.get(k) ?? {
      procedureId: k,
      procedure: r.procedure,
      n: 0,
      pass: 0,
      sum: 0,
    };
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
      .map((e) => ({
        procedureId: e.procedureId,
        procedure: e.procedure,
        n: e.n,
        pass: e.pass,
        avgScore: Math.round(e.sum / e.n),
      }))
      .sort(
        (a, b) =>
          a.pass / a.n - b.pass / b.n ||
          a.avgScore - b.avgScore ||
          a.procedure.localeCompare(b.procedure),
      ),
  };
}

/** the Results table as CSV (one row per procedure attempt; Excel-friendly quoting) */
export function procCsv(rows: ProcRow[]): string {
  const head = [
    "date",
    "student",
    "drill",
    "procedure",
    "procedure_id",
    "failure",
    "mode",
    "score",
    "verdict",
    "reaction_s",
    "outcome",
    "main_point",
  ];
  const q = (v: string | number | null) =>
    `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    head.join(","),
    ...rows.map((r) =>
      [
        r.date,
        r.student,
        r.drill,
        r.procedure,
        r.procedureId,
        r.failure,
        r.mode,
        r.score,
        r.verdict,
        r.reactionS === null ? "" : Math.round(r.reactionS * 10) / 10,
        r.outcome,
        r.note,
      ]
        .map(q)
        .join(","),
    ),
  ].join("\n");
}

/** plain-language import report, in the UI language */
export function importSummary(r: ImportReport): {
  ok: boolean;
  lines: string[];
} {
  const lines: string[] = [...r.issues];
  if (r.added.length) lines.push(tn("ch.imp.added", r.added.length));
  if (r.replaced.length) lines.push(tn("ch.imp.replaced", r.replaced.length));
  if (r.renamed.length) lines.push(tn("ch.imp.renamed", r.renamed.length));
  for (const s of r.skipped)
    lines.push(t("ch.imp.skipped", { id: s.id, why: s.reason }));
  if (!lines.length) lines.push(t("ch.imp.nothing"));
  return {
    ok:
      !r.issues.length &&
      r.added.length + r.replaced.length + r.renamed.length > 0,
    lines,
  };
}

/** what a share link holds, in the UI language: a title line and the procedures (title, item count) */
export function shareSummary(code: string): {
  ok: boolean;
  title: string;
  procs: { title: string; items: number }[];
} {
  const s = decodeShare(code);
  if (!s) return { ok: false, title: t("ch.p.linkBad"), procs: [] };
  const list = s.kind === "pack" ? s.pack.procedures : [s.procedure];
  const procs = list.map((p) => ({
    title: p.title,
    items: Array.isArray(p.items) ? p.items.length : 0,
  }));
  return {
    ok: true,
    title:
      s.kind === "pack"
        ? tn("ch.p.linkPack", procs.length, {
            c: s.pack.club || t("ch.p.linkClub"),
          })
        : t("ch.p.linkProc", { t: s.procedure.title }),
    procs,
  };
}

// ------------------------------------------------------------------ procedures mode: strings (FR / EN)
registerStrings("en", {
  "ch.tile": "Procedures · Flying club",
  "ch.tileDesc":
    "Failure drills, the club’s checklists and the students’ results.",
  "ch.tileMeta": "{d} drills · {p} procedures",
  "ch.title": "Procedures · Flying club",
  "ch.sub":
    "Test your students on failures and emergencies: fly a drill, adapt the checklists to your club, follow the results.",
  "ch.back": "Home",
  "ch.searchAll": "Search courses, lessons…",
  "ch.lang": "Language",
  "ch.tab.drills": "Drills",
  "ch.tab.library": "Procedures",
  "ch.tab.results": "Results",
  "ch.tab.pack": "Club pack",
  "ch.d.student": "Student flying",
  "ch.d.studentPh": "Name (for the records)",
  "ch.d.new": "Create a drill",
  "ch.d.newTip":
    "In “Plan a flight”: where and when, the failure and its trigger, training or test",
  "ch.d.club": "Club drills",
  "ch.d.clubNone": "No club drill yet",
  "ch.d.clubNoneSub":
    "Open a template, adjust it in “Plan a flight” and Save: it appears here for every instructor and student.",
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
  "ch.d.noBuild":
    "No airport of the loaded data fits this drill: it opens in “Plan a flight”.",
  "ch.d.training": "Training",
  "ch.d.test": "Test",
  "ch.d.trainingTip":
    "Emergency card shown: memory items with live ticks, then the checklist",
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
  "ch.l.noClubSub":
    "Open a library procedure and press Customise, or write a new one.",
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
  "ch.r.noneSub":
    "Fly a drill: every procedure the student runs is graded and listed here, with what was late, missed or out of order.",
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
  "ch.p.exportSub":
    "The {n} procedures of your club, for the other instructors and your students’ devices.",
  "ch.p.exportSub.1":
    "Your club’s procedure, for the other instructors and your students’ devices.",
  "ch.p.exportNone":
    "Your club has no procedure of its own yet: customise or write one first.",
  "ch.p.download": "Download the pack (.json)",
  "ch.p.link": "Share link and QR code",
  "ch.p.import": "Import a pack",
  "ch.p.importSub":
    "A .json file from another instructor, or a share link or code.",
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
  "ch.p.linkBad":
    "This share link is damaged or incomplete: ask for a new one.",
  "ch.p.linkLater": "Not now",
  "ch.p.disclaimer":
    "Club packs carry the club’s own texts: check them against the aircraft POH/AFM.",
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
  "ch.tileDesc":
    "Exercices de panne, check-lists du club et résultats des élèves.",
  "ch.tileMeta": "{d} exercices · {p} procédures",
  "ch.title": "Procédures · Aéroclub",
  "ch.sub":
    "Entraînez et contrôlez vos élèves sur les pannes et les urgences : lancez un exercice, adaptez les check-lists à votre club, suivez les résultats.",
  "ch.back": "Accueil",
  "ch.searchAll": "Rechercher un cours, une leçon…",
  "ch.lang": "Langue",
  "ch.tab.drills": "Exercices",
  "ch.tab.library": "Procédures",
  "ch.tab.results": "Résultats",
  "ch.tab.pack": "Pack du club",
  "ch.d.student": "Élève aux commandes",
  "ch.d.studentPh": "Nom (pour le suivi)",
  "ch.d.new": "Créer un exercice",
  "ch.d.newTip":
    "Dans le constructeur de vol : où et quand, la panne et son déclenchement, entraînement ou contrôle",
  "ch.d.club": "Exercices du club",
  "ch.d.clubNone": "Pas encore d’exercice du club",
  "ch.d.clubNoneSub":
    "Ouvrez un modèle, ajustez-le dans le constructeur de vol et enregistrez : il apparaît ici pour tous les instructeurs et élèves.",
  "ch.d.mine": "Attribués à {s}",
  "ch.d.tpl": "Modèles",
  "ch.d.tplSub":
    "Prêts à voler sur votre terrain. Modifiez-en un pour créer un exercice du club.",
  "ch.d.fly": "Voler",
  "ch.d.edit": "Modifier",
  "ch.d.assign": "Attribuer",
  "ch.d.assigned": "Attribué à {s}",
  "ch.d.assignTo": "Attribuer à un élève",
  "ch.d.assignPh": "Nom de l’élève",
  "ch.d.assignOk": "Attribuer",
  "ch.d.unassign": "Retirer",
  "ch.d.assignDone": "« {d} » attribué à {s}",
  "ch.d.noBuild":
    "Aucun terrain des données chargées ne convient : l’exercice s’ouvre dans le constructeur de vol.",
  "ch.d.training": "Entraînement",
  "ch.d.test": "Contrôle",
  "ch.d.trainingTip":
    "Carte d’urgence affichée : actions réflexes cochées en direct, puis la check-list",
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
  "ch.l.noneSub":
    "Essayez une panne (alternateur, dépression) ou un mot du titre.",
  "ch.l.noClub": "Votre club n’a pas encore de procédure à lui",
  "ch.l.noClubSub":
    "Ouvrez une procédure de la bibliothèque et appuyez sur Personnaliser, ou rédigez-en une.",
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
  "ch.r.noneSub":
    "Lancez un exercice : chaque procédure de l’élève est notée et listée ici, avec ce qui était en retard, oublié ou dans le désordre.",
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
  "ch.p.exportSub":
    "Les {n} procédures de votre club, pour les autres instructeurs et les appareils des élèves.",
  "ch.p.exportSub.1":
    "La procédure de votre club, pour les autres instructeurs et les appareils des élèves.",
  "ch.p.exportNone":
    "Votre club n’a pas encore de procédure à lui : personnalisez-en ou rédigez-en une d’abord.",
  "ch.p.download": "Télécharger le pack (.json)",
  "ch.p.link": "Lien de partage et QR code",
  "ch.p.import": "Importer un pack",
  "ch.p.importSub":
    "Un fichier .json d’un autre instructeur, ou un lien ou code de partage.",
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
  "ch.p.linkBad":
    "Ce lien de partage est abîmé ou incomplet : demandez-en un nouveau.",
  "ch.p.linkLater": "Plus tard",
  "ch.p.disclaimer":
    "Les packs contiennent les textes propres au club : vérifiez-les avec le manuel de vol (POH/AFM).",
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
  return uiLang() === "fr" ? "Bibliothèque" : "Library";
}
const frUi = () => uiLang() === "fr";
const LL = (en: string, fr: string) => (frUi() ? fr : en);
/** A sim lesson as the library numbers it: its home and its rank there ("LAPL · PPL › Aircraft handling · Lesson 1
 *  of 6"), so the Flight Center and the library never disagree on "Lesson x of y". */
export function libraryLessonPos(
  id: string,
  fr = frUi(),
): { label: string; ids: string[]; n: number } | null {
  const home = CLASSIFICATION[id]?.home;
  if (!home) return null;
  const ids = LESSON_ORDER.filter((x) => CLASSIFICATION[x]?.home === home);
  const n = ids.indexOf(id) + 1;
  const d = subjectDef(home);
  const l = fr ? "fr" : "en";
  const code = programDef(d.program).code[l] ?? programDef(d.program).code.en;
  const title = d.title[l] ?? d.title.en;
  return {
    label: `${code} › ${title} · ${fr ? `Leçon ${n} sur ${ids.length}` : `Lesson ${n} of ${ids.length}`}`,
    ids,
    n,
  };
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
    super(LL("Home", "Accueil"));
    // Accueil is a page, not a dialog over the cockpit (UX logic §1 rule 5): opaque, light, the app bar on top,
    // one <main>; Esc does not close it (there is nothing "behind" it to go back to)
    this.escCloses = false;
    this.box.classList.add("fc", "fc-page");
    this.bg.classList.add("fc-page-bg");
    this.box.removeAttribute("role");
    this.box.removeAttribute("aria-modal");
    this.box.removeAttribute("aria-label");
    clear(this.body);
    this.side = h("nav", {
      class: "fc-side",
      "aria-label": LL("Flights", "Vols"),
    });
    this.main = h("main", { class: "fc-main" });
    this.detail = h("aside", {
      class: "fc-detail",
      "aria-label": LL("Flight details", "Détails du vol"),
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
    // the page follows the FR / EN switch and the club library
    onLangChange((l) => {
      this.bar.setLang(l === "fr" ? "fr" : "en");
      if (this.isOpen) this.render();
    });
    onProceduresChange(
      () => this.isOpen && this.view.type === "club" && this.renderMain(),
    );
    // Esc closes the plate viewer first
    window.addEventListener(
      "keydown",
      (e) => {
        // another window stacked over the page (procedure editor) owns the keyboard
        if (!this.isOpen || Modal.stack[Modal.stack.length - 1] !== this)
          return;
        if (e.key === "Escape" && this.plateView) {
          e.stopImmediatePropagation();
          e.preventDefault();
          this.closePlate();
        }
      },
      true,
    );
  }

  /** the app bar (ui/appBar.ts): the mark, Accueil · Bibliothèque · Simulateur, the library search, FR | EN */
  private bar!: AppBar;
  private buildHeader() {
    const head = this.box.querySelector("header")!;
    this.crumb = h("div", { class: "fc-backrow", hidden: true });
    this.bar = appBar({
      place: "home",
      lang: uiLang() === "fr" ? "fr" : "en",
      onLang: (l) => setLang(l),
      go: (p) => {
        if (p === "lib") return false;
        this.showPlace(p);
        return true;
      },
      search: {
        // the search always searches the library (UX logic §3): Enter opens it with the words typed
        submit: (q) =>
          this.leave(() =>
            location.assign(`academy.html#library&q=${encodeURIComponent(q)}`),
          ),
      },
    });
    head.replaceWith(this.bar.el);
    this.body.prepend(this.crumb);
    this.searchInput = this.bar.input;
    this.searchClear = h("span", { hidden: true });
  }

  open() {
    // opened from a share link: straight to the Club pack page, where the link waits to be imported
    if (this.pendingShare && this.view.type !== "club")
      return this.openClub("pack");
    this.items = catalog();
    // Accueil opens on Accueil (a deep page such as a flight's detail opens through its own entry)
    if (this.view.type === "search" || this.view.type === "courses")
      this.view = { type: "home" };
    this.render();
    super.open();
  }

  /** the library lives in one place, academy.html (UX logic §1 rule 4): « Créer un cours » opens the new course
   *  page, « Présenter » the instructors' page, anything else the library itself */
  openCourses(intent?: CourseIntent) {
    this.go({ type: "courses", ...(intent ? { intent } : {}) });
  }

  /** open on the Procedures · Flying club page (main.ts: ?proc= share links, the builder's procedure links) */
  openClub(tab?: ClubTab) {
    this.items = catalog();
    if (!this.isOpen) super.open();
    this.goClub(tab);
  }

  close() {
    const was = this.isOpen;
    this.closePlate();
    this.closeQuick();
    this.placeView?.destroy();
    this.placeView = null;
    super.close();
    // the cockpit's title again (main.ts syncDocLang writes the same)
    if (was) document.title = `${BRAND.name} · ${brandTagline(uiLang() === "fr" ? "fr" : "en")}`;
  }

  /** kept for callers: Accueil is always an opaque light page now */
  solidBackdrop() {}

  /** on open the focus goes to the page's heading, so Tab starts at the top of the page */
  protected initialFocus(): HTMLElement | null {
    const hd = this.main.querySelector<HTMLElement>("h1, h2");
    if (!hd) return super.initialFocus();
    hd.tabIndex = -1;
    return hd;
  }

  private go(v: View) {
    if (v.type === "courses") {
      const r: string = v.intent === "new"
        ? "#new"
        : v.intent === "present"
          ? "#library&p=instructors"
          : v.flights
            ? "#library&v=sim"
            : `#library${v.program ? `&p=${v.program}` : ""}${v.program && v.subject ? `&s=${v.subject}` : ""}`;
      this.leave(() => goToCourse(`academy.html${r}`));
      return;
    }
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
    this.body.scrollTop = 0;
  }

  /** leave the page and run a tool */
  private leave(fn: () => void) {
    // the focus leaves with the page (the keyboard flies the aircraft), it does not go back to the opener
    this.leavingForTool = true;
    this.close();
    fn();
  }

  render() {
    const v = this.view;
    const home =
      v.type === "home" ||
      v.type === "sim" ||
      v.type === "instructor" ||
      v.type === "club" ||
      v.type === "courses";
    this.gridEl.classList.toggle("home", home);
    this.box.classList.toggle("fc-is-home", home);
    this.box.classList.toggle("fc-is-place", v.type === "home" || v.type === "sim");
    this.box.classList.toggle("fc-lib-view", false);
    // the tab that is current: Accueil, Simulateur (its flights and lessons too); the club's tools sit under none
    const place: Place | null =
      v.type === "home"
        ? "home"
        : v.type === "sim" || v.type === "all" || v.type === "cat" || v.type === "path" || v.type === "search"
          ? "sim"
          : null;
    this.bar.setPlace(place);
    // the tab's title says where you are (« Accueil — Wingdeck »)
    document.title = brandTitle(
      v.type === "home" ? LL("Home", "Accueil") : v.type === "sim" ? LL("Simulator", "Simulateur") : v.type === "club" ? t("ch.title") : LL("Home", "Accueil"),
    );
    this.renderCrumb();
    if (home) clear(this.side);
    else this.renderSide();
    this.renderMain();
    this.renderDetail();
  }

  /** the pages under a place (club tools, instructor, flight lists) get one labelled way back, top left */
  private renderCrumb() {
    clear(this.crumb);
    const v = this.view;
    const place = v.type === "home" || v.type === "sim";
    this.crumb.hidden = place;
    if (place) return;
    // the flight lists belong to the Simulateur; the club's tools and the instructor's page to Accueil
    const toSim = v.type === "all" || v.type === "cat" || v.type === "path" || v.type === "search";
    const here =
      v.type === "instructor" || v.type === "club"
        ? ""
        : v.type === "all"
            ? LL("All flights", "Tous les vols")
            : v.type === "search"
              ? LL("Search", "Recherche")
              : v.type === "path"
                ? pathLabel(v.path)
                : v.type === "cat"
                  ? catTitle(CATEGORIES.find((c) => c.id === v.cat)!)
                  : "";
    this.crumb.append(
      h(
        "button",
        {
          class: "fc-backto",
          type: "button",
          onclick: () => this.showPlace(toSim ? "sim" : "home"),
        },
        h("span", { class: "fc-backto-ic", html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m11 6-6 6 6 6"/></svg>' }),
        toSim ? LL("Simulator", "Simulateur") : LL("Home", "Accueil"),
      ),
      here ? h("span", { class: "fc-backto-here" }, here) : "",
    );
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
      navBtn(LL("Home", "Accueil"), false, () => this.go({ type: "home" }), {
        icon: svgIcon(I.home),
        key: "home",
        tip: LL("Home", "Accueil"),
      }),
      // one catalogue: "All flights" is the library's simulator view, shelved by programme and subject
      navBtn(
        LL("All flights", "Tous les vols"),
        v.type === "all",
        () => this.go({ type: "courses", flights: true }),
        {
          icon: svgIcon(I.records),
          key: "all",
          tip: LL(
            "Every flight of the simulator, in the library",
            "Tous les vols du simulateur, dans la bibliothèque",
          ),
        },
      ),
      navBtn(groundSchoolLabel(), false, () => this.go({ type: "courses" }), {
        icon: svgIcon(I.slides),
        key: "library",
        tip:
          uiLang() === "fr"
            ? "Cours, procédures et leçons au simulateur, par programme"
            : "Courses, procedures and sim lessons, by program",
      }),
      navBtn(t("ch.nav"), false, () => this.goClub(), {
        icon: pIcon("drill"),
        key: "club",
        tip: t("ch.tileDesc"),
      }),
    );
    // no second taxonomy here: the library's shelves and subjects (IR modules, "Fly the lessons in order") replace
    // the flight types and the learning paths; All flights stays the simulator's own picker
    this.side.append(h("div", { class: "fc-sec" }, LL("Tools", "Outils")));
    for (const t of this.tools(true))
      this.side.append(
        navBtn(t.label, false, () => this.leave(t.run), {
          icon: svgIcon(t.icon),
          tip: t.tip,
        }),
      );
    // the school tools (the home keeps only a shortcut to them)
    this.side.append(
      navBtn(
        uiLang() === "fr" ? "Instructeur" : "Instructor",
        v.type === "instructor",
        () => this.go({ type: "instructor" }),
        {
          icon: svgIcon(I.tablet),
          key: "instructor",
          tip:
            uiLang() === "fr"
              ? "Appairer un téléphone, préparer une leçon, conduire la séance, relire les dossiers"
              : "Pair a phone, build a lesson, run the session and review the records",
        },
      ),
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
        label: LL("Plan a flight", "Préparer un vol"),
        sub: LL("Route, procedures, weather", "Route, procédures, météo"),
        icon: I.plan,
        tip: LL(
          "Where every flight and IFR circuit is set up (reopens your last flight)",
          "Là où se prépare chaque vol et circuit IFR (rouvre votre dernier vol)",
        ),
        run: () => hk.openBuilder(),
      },
      {
        label: LL("Hold-entry drill", "Entrées d’attente au chrono"),
        sub: LL("Timed entry decisions", "Choisir l’entrée, chronométré"),
        icon: I.stopwatch,
        tip: LL(
          "Timed drill: pick the right entry for random holds",
          "Exercice chronométré : choisir la bonne entrée d’attentes au hasard",
        ),
        run: () => hk.openDrill(),
      },
      {
        label: LL("Training records", "Carnet d’entraînement"),
        sub: LL("Debriefs and CSV export", "Débriefings et export CSV"),
        icon: I.clipboard,
        tip: LL(
          "Every flight flown, debriefs and CSV export",
          "Chaque vol effectué, débriefings et export CSV",
        ),
        run: () => hk.openRecords(),
      },
    ];
    if (withPair && hk.pairInstructor)
      list.push({
        label: LL("Pair instructor", "Appairer l’instructeur"),
        sub: LL(
          "Phone or tablet, by QR code",
          "Téléphone ou tablette, par QR code",
        ),
        icon: I.tablet,
        tip: LL(
          "Pair the instructor's phone or tablet (QR code)",
          "Appairer le téléphone ou la tablette de l’instructeur (QR code)",
        ),
        run: hk.pairInstructor,
      });
    if (hk.openConnections)
      list.push({
        label: LL("Connections", "Connexions"),
        sub: LL(
          "Data link, webhooks, charts",
          "Liaison de données, webhooks, cartes",
        ),
        icon: I.link,
        tip: LL(
          "Data link, webhooks and chart accounts",
          "Liaison de données, webhooks et comptes de cartes",
        ),
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
        LL("Level", "Niveau"),
        String(this.fDiff || ""),
        [
          ["", LL("Any level", "Tous niveaux")],
          ["1", diffLabel(1)],
          ["2", diffLabel(2)],
          ["3", diffLabel(3)],
        ],
        (v) => (this.fDiff = Number(v) || 0),
      ),
      apts.length > 1 || this.fApt
        ? select(
            LL("Airport", "Aérodrome"),
            this.fApt,
            [
              ["", LL("Any airport", "Tous les aérodromes")],
              ...apts.map((a) => [a, a] as [string, string]),
            ],
            (v) => (this.fApt = v),
          )
        : null,
      select(
        LL("Autopilot", "Pilote automatique"),
        this.fAp,
        [
          ["", LL("Autopilot or hand", "Pilote auto ou manuel")],
          ["ap", LL("Autopilot allowed", "Pilote auto autorisé")],
          ["hand", LL("Hand-flown only", "En manuel uniquement")],
        ],
        (v) => (this.fAp = v as "" | "ap" | "hand"),
      ),
      active
        ? h(
            "button",
            { class: "fc-reset", onclick: () => this.resetFilters() },
            LL("Reset", "Réinitialiser"),
          )
        : null,
      h(
        "span",
        { class: "fc-count" },
        frUi() ? `${n} vol${n === 1 ? "" : "s"}` : plural(n, "flight"),
      ),
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
            i.graded ? LL("Scored", "Évalué") : LL("Practice", "Entraînement"),
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
        h("span", { class: `fc-lvl d${i.difficulty}` }, diffLabel(i.difficulty)),
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
        LL("No flights match these filters.", "Aucun vol ne correspond à ces filtres."),
        LL("Reset filters", "Réinitialiser les filtres"),
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
    this.placeView?.destroy();
    this.placeView = null;
    clear(this.main);
    const v = this.view;
    if (v.type === "home" || v.type === "sim") return this.renderPlace(v.type);
    if (v.type === "instructor") return this.renderInstructor();
    if (v.type === "courses")
      return this.renderCourses(v.intent, v.program, v.subject, v.flights);
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
            h(
              "h2",
              {},
              LL(`Results for “${this.q}”`, `Résultats pour « ${this.q} »`),
            ),
          ),
        ),
      );
      if (!res.length) {
        this.main.append(
          this.empty(
            LL(
              `No flights match “${this.q}”`,
              `Aucun vol ne correspond à « ${this.q} »`,
            ),
            LL("Clear search", "Effacer la recherche"),
            () => {
              this.searchInput.value = "";
              this.onSearch("");
            },
            LL(
              "Try an airport (PARD), a procedure (ILS, hold, arc) or a skill (partial panel).",
              "Essayez un aérodrome (PARD), une procédure (ILS, attente, arc) ou une compétence (panne partielle).",
            ),
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
            h("h2", {}, LL("All flights", "Tous les vols")),
            h(
              "p",
              { class: "muted" },
              LL(
                "Every lesson, approach, procedure and circuit, by flight type.",
                "Chaque leçon, approche, procédure et circuit, par type de vol.",
              ),
            ),
          ),
        ),
        this.filtersBar(this.items),
      );
      const shown = this.filtered(this.items);
      if (!shown.length) {
        this.main.append(
          this.empty(
            LL(
              "No flights match these filters.",
              "Aucun vol ne correspond à ces filtres.",
            ),
            LL("Reset filters", "Réinitialiser les filtres"),
            () => this.resetFilters(),
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
            catTitle(c),
            h("span", { class: "ct" }, String(list.length)),
            h(
              "button",
              {
                class: "fc-more",
                onclick: () => this.go({ type: "cat", cat: c.id, sub: null }),
              },
              LL("Open", "Ouvrir"),
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
          h("h2", { class: "has-ico" }, svgIcon(cat.icon, 22), catTitle(cat)),
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
          chip(LL("All", "Tous"), null, inCatAll.length),
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
              "In “Plan a flight”: chain departures, holds and approaches into one graded session, then share it with a link.",
            ),
          ),
          h(
            "button",
            {
              class: "btn",
              onclick: () => this.leave(() => this.hooks.openBuilder()),
            },
            svgIcon(I.plan),
            "Plan a flight",
          ),
        ),
      );
    const shown = this.filtered(inCat);
    const mine = v.cat === "circuits" && (!v.sub || v.sub === MINE);
    if (!shown.length && !mine) {
      this.main.append(
        this.empty(LL("No flights match these filters.", "Aucun vol ne correspond à ces filtres."), LL("Reset filters", "Réinitialiser les filtres"), () =>
          this.resetFilters(),
        ),
      );
      return;
    }
    for (const s of v.sub ? [v.sub] : cat.subs) {
      const list = shown.filter((i) => i.sub === s);
      const emptyMine = s === MINE && !inCatAll.some((i) => i.sub === s);
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
              "Flights you save in “Plan a flight”, or open from a shared link, appear here.",
            )
          : this.grid(list, "tag", false),
      );
    }
  }

  // ------------------------------------------------------------------ Accueil and Simulateur (ui/home.ts)
  /** the page drawn in the main column (Accueil or Simulateur): its covers are released on the next render */
  private placeView: { destroy(): void } | null = null;
  /** set when « Préparer un vol » leaves this page: the Simulateur comes back if it closes without a flight */
  returnTo: { view: View; focus: string } | null = null;

  /** what the two places need from the simulator (ui/home.ts HomeHooks) */
  private homeHooks(): HomeHooks {
    const fr = uiLang() === "fr";
    const pool = (kind: PlaceQuick, apt: string) =>
      kind === "any"
        ? [
            ...quickPool(this.items, "approach", apt),
            ...quickPool(this.items, "hold", apt),
          ]
        : quickPool(this.items, kind, apt);
    return {
      lang: fr ? "fr" : "en",
      nav: (url) => this.leave(() => goToCourse(url)),
      showSim: () => this.showPlace("sim"),
      intro: () => this.leave(() => location.assign("index.html?intro=1")),
      quickFly: (kind, apt) => {
        const p = pool(kind, apt);
        const it = p[Math.floor(Math.random() * p.length)];
        if (!it) return false;
        // the briefing cancelled: back here, on the button that flew
        this.returnTo = {
          view: this.view,
          focus: this.view.type === "sim" ? ".wd-quick-go" : ".wd-door.sim .wd-door-alt",
        };
        this.fly(it);
        return true;
      },
      quickCount: (kind, apt) => pool(kind, apt).length,
      quickAirports: () =>
        [
          ...new Set(
            pool("any", "").map((i) => i.airport).filter(Boolean) as string[],
          ),
        ]
          .sort()
          .map((icao) => ({ icao, name: aptName(icao) })),
      quickPref: () => {
        const p = store.get<{ kind?: PlaceQuick; apt?: string }>(QUICK_KEY, {});
        return {
          kind: p.kind === "approach" || p.kind === "hold" ? p.kind : "any",
          apt: typeof p.apt === "string" ? p.apt : "",
        };
      },
      setQuickPref: (p) => store.set(QUICK_KEY, p),
      planFlight: () => {
        this.returnTo = { view: this.view, focus: ".wd-plan-b" };
        this.leave(() => this.hooks.planFlight());
      },
      recent: () =>
        history
          .all()
          .slice(0, 8)
          .map((a) => {
            const item = this.items.find((i) =>
              a.exercise
                ? i.id === a.exercise
                : i.kind === "scenario" && i.title === a.scenario,
            );
            if (!item) return null;
            const title =
              (fr && item.ex ? LESSON_META[item.ex.id]?.fr : undefined) ??
              item.title;
            return {
              title,
              when: whenLabel(a.date, fr),
              verdict:
                a.graded === false
                  ? ("ungraded" as const)
                  : (a.passed ?? a.score >= 70)
                    ? ("passed" as const)
                    : ("failed" as const),
              again: () => {
                this.returnTo = { view: this.view, focus: "h1" };
                this.fly(item);
              },
            };
          })
          .filter((x): x is NonNullable<typeof x> => !!x),
      lessonToRedo: () => {
        const all = progress.all();
        const row = Object.entries(all)
          .filter(([, p]) => !p.passed && p.attempts > 0)
          .sort((a, b) => (a[1].last < b[1].last ? 1 : -1))[0];
        if (!row) return null;
        const item = this.items.find((i) => i.ex?.id === row[0]);
        if (!item) return null;
        const p = row[1];
        return {
          title:
            (fr && item.ex ? LESSON_META[item.ex.id]?.fr : undefined) ??
            item.title,
          meta: fr
            ? `${p.attempts} essai${p.attempts > 1 ? "s" : ""} · meilleur ${Math.round(p.best)} %`
            : `${p.attempts} attempt${p.attempts > 1 ? "s" : ""} · best ${Math.round(p.best)}%`,
          again: () => {
            this.returnTo = { view: this.view, focus: "h1" };
            this.fly(item);
          },
        };
      },
    };
  }

  /** Accueil or Simulateur, in this page (the app bar's tabs and the doors) */
  showPlace(p: "home" | "sim", focus = "h1") {
    const v: View = p === "sim" ? { type: "sim" } : { type: "home" };
    if (!this.isOpen) {
      this.items = catalog();
      this.view = v;
      this.render();
      super.open();
    } else this.go(v);
    const hash = p === "sim" ? "#simulateur" : "#accueil";
    if (location.hash !== hash)
      window.history.replaceState(null, "", location.pathname + location.search + hash);
    // the page's title: where you are
    // after the page's own first focus (Modal.trapFocus, a timer too): the title, or the button that opened a
    // dialog which has just closed
    setTimeout(() => {
      if (this.isOpen)
        this.main.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
    }, 0);
  }

  private renderPlace(p: "home" | "sim") {
    const view = p === "sim" ? simView(this.homeHooks()) : homeView(this.homeHooks());
    this.placeView = view;
    this.main.append(view.el);
  }

  /** Quick start lived in a pop-over: it is the Simulateur page's Vol rapide now (nothing to close) */
  private closeQuick() {}
  // ------------------------------------------------------------------ instructor
  // ------------------------------------------------------------------ Ground school (the course library)
  private courseLib: { destroy(): void; focusSearch(): void } | null = null;
  /** the course library (course/ui/library.ts, loaded on demand); a course opens academy.html in this tab */
  /** A sim item opened from the library: a lesson (its briefing deck, then the cockpit), a failure drill, a scenario
   *  or a school circuit. */
  openLibraryItem(t: { k: string; id: string }): boolean {
    if (t.k === "drill") {
      const e = listDrills(uiL()).find((x) => x.id === t.id);
      if (!e) return false;
      this.flyEntry(e);
      return true;
    }
    const items = catalog();
    const i =
      t.k === "lesson"
        ? items.find(
            (x) => x.kind === "exercise" && x.ex?.id === t.id && !x.circuit,
          )
        : t.k === "scenario"
          ? items.find((x) => x.id === `sc-${t.id}` || x.circuit?.id === t.id)
          : undefined;
    if (!i) return false;
    const ir = PATHS.find((p) => p.id === "ir") ?? null;
    this.fly(i, t.k === "lesson" && ir?.exercises.includes(t.id) ? ir : null);
    return true;
  }

  private renderCourses(
    intent?: CourseIntent,
    program?: import("../library/programs").ProgramId,
    subject?: import("../library/programs").SubjectId,
    flights?: boolean,
  ) {
    const host = h("div", { class: "fc-courses" });
    this.main.append(host);
    // "Create a course": the library stays out of sight while the new draft is made and the editor opens
    if (intent === "new") {
      host.classList.add("fc-courses-opening");
      const wait = h(
        "div",
        { class: "fc-opening", role: "status" },
        h("span", { class: "fc-opening-dot", "aria-hidden": "true" }),
        LL("Opening the editor…", "Ouverture de l’éditeur…"),
      );
      this.main.append(wait);
      // never a dead end: if the editor could not open (no course storage here), the library comes back
      window.setTimeout(() => {
        if (!host.isConnected) return;
        host.classList.remove("fc-courses-opening");
        wait.remove();
      }, 6000);
    }
    void Promise.all([
      import("../course/ui/library"),
      import("../course/store"),
    ]).then(([m, st]) => {
      if (!host.isConnected || this.view.type !== "courses") return;
      this.courseLib?.destroy();
      this.courseLib = m.mountLibrary(host, {
        lang: uiLang(),
        store: st.courseStore(),
        embedded: true,
        page: "academy.html",
        ...(intent ? { intent } : {}),
        ...(program ? { program } : {}),
        ...(subject ? { subject } : {}),
        ...(flights ? { flights: true } : {}),
        navigate: (url) => this.leave(() => goToCourse(url)),
        // the simulator's own items fly from here, without leaving the page
        openSim: (t) => this.openLibraryItem(t),
        editProcedure: (id) => this.openProc(id),
        openClub: (tab) => this.goClub(tab),
        clubDrills: () =>
          listDrills(uiL())
            .filter((e) => e.kind === "club")
            .map((e) => ({
              id: e.id,
              name: e.name,
              desc: e.desc,
              ...(e.phase ? { phase: e.phase } : {}),
              ...(e.assignee ? { assignee: e.assignee } : {}),
            })),
      });
    });
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
        title:
          uiLang() === "fr"
            ? "Des cours pour vos élèves"
            : "Courses for your students",
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
        desc: "In “Plan a flight”: chain a departure, holds and approaches with weather and scheduled failures, or start from a school preset. Share it with a link.",
        label: "Plan a flight",
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
            // the way back is the frame's (« ← Accueil », top left): the page says where you are
            h("h1", {}, LL("Instructor", "Instructeur")),
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
    this.go({
      type: "club",
      tab:
        tab ??
        (["drills", "library", "results", "pack"].includes(last)
          ? last
          : "drills"),
    });
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
          h("h1", {}, t("ch.title")),
          h("p", { class: "muted" }, t("ch.sub")),
        ),
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
    const x: Circuit | string =
      e.kind === "template" ? e.id : (e.build() ?? e.id);
    this.leave(() => {
      if (this.hooks.editDrill) return this.hooks.editDrill(x);
      void import("./circuitBuilder").then((m) => {
        if (!m.openDrill(x))
          this.hooks.openBuilder(typeof x === "string" ? undefined : x);
      });
    });
  }

  private assign(e: DrillEntry, name: string) {
    const who = name.trim();
    const c =
      e.kind === "club"
        ? circuitStore.list().find((x) => x.id === e.id)
        : e.build();
    if (!c) {
      this.say(t("ch.d.noBuild"), "warn");
      return;
    }
    if (who) c.assignee = who;
    else delete c.assignee;
    circuitStore.save(c);
    this.assignFor = null;
    this.flash = who
      ? { text: t("ch.d.assignDone", { d: c.name, s: who }), kind: "ok" }
      : null;
    this.renderMain();
  }

  /** the students the club knows: assignees and the names in the records */
  private knownStudents(): string[] {
    const names = new Set<string>();
    for (const c of circuitStore.list()) if (c.assignee) names.add(c.assignee);
    for (const a of history.all())
      if (a.student?.trim()) names.add(a.student.trim());
    return [...names].sort((a, b) => a.localeCompare(b));
  }

  private drillCard(e: DrillEntry): HTMLElement {
    const l = uiL();
    const keys = e.failures.filter((f): f is FailureKey => f !== "random");
    const icon: PIcon = keys.length ? CAT_ICONS[categoryFor(keys[0])] : "drill";
    const phase = PHASES.find((p) => p.id === e.phase);
    const fails = e.failures.map((f) =>
      f === "random" ? t("ch.d.random") : failureName(f, l),
    );
    const card = h(
      "article",
      {
        class: `ch-drill${e.kind === "club" ? " club" : ""}${e.mode === "test" ? " test" : ""}`,
        "data-id": e.id,
      },
      h(
        "div",
        { class: "ch-drill-top" },
        h(
          "span",
          {
            class: `ch-ic cat-${keys.length ? categoryFor(keys[0]) : "other"}`,
          },
          pIcon(icon, 20),
        ),
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
              {
                class: `ch-mode ${e.mode}`,
                title: t(
                  e.mode === "test" ? "ch.d.testTip" : "ch.d.trainingTip",
                ),
              },
              t(e.mode === "test" ? "ch.d.test" : "ch.d.training"),
            ),
            e.assignee
              ? h("span", { class: "ch-who" }, pIcon("users", 13), e.assignee)
              : null,
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
          h(
            "datalist",
            { id: "ch-students" },
            ...this.knownStudents().map((s) => h("option", { value: s })),
          ),
          h(
            "div",
            { class: "ch-assign-b" },
            e.assignee
              ? h(
                  "button",
                  { class: "btn ghost", onclick: () => this.assign(e, "") },
                  t("ch.d.unassign"),
                )
              : null,
            h(
              "button",
              {
                class: "btn",
                onclick: () => ((this.assignFor = null), this.renderMain()),
              },
              t("pe.cancel"),
            ),
            h(
              "button",
              {
                class: "btn primary",
                onclick: () => this.assign(e, input.value),
              },
              t("ch.d.assignOk"),
            ),
          ),
        ),
      );
      requestAnimationFrame(() => input.focus());
    }
    card.append(
      h(
        "div",
        { class: "ch-acts" },
        h(
          "button",
          { class: "btn primary", onclick: () => this.flyEntry(e) },
          pIcon("play", 15),
          t("ch.d.fly"),
        ),
        h(
          "button",
          { class: "btn", onclick: () => this.editEntry(e) },
          pIcon("edit", 15),
          t("ch.d.edit"),
        ),
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
          h(
            "datalist",
            { id: "ch-students-all" },
            ...this.knownStudents().map((s) => h("option", { value: s })),
          ),
        ),
        h("span", { class: "grow" }),
        h(
          "button",
          {
            class: "btn primary ch-new",
            title: t("ch.d.newTip"),
            onclick: () =>
              this.editEntry(
                listDrills(uiL()).find((d) => d.kind === "template")!,
              ),
          },
          pIcon("plus", 16),
          t("ch.d.new"),
        ),
      ),
    );
    const club = all.filter((d) => d.kind === "club");
    const me = this.assess.student.trim().toLowerCase();
    const mine = me
      ? club.filter((d) => d.assignee?.trim().toLowerCase() === me)
      : [];
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
        h(
          "div",
          { class: "fc-sec2" },
          pIcon("users", 16),
          t("ch.d.mine", { s: this.assess.student }),
          h("span", { class: "ct" }, String(mine.length)),
        ),
        h("div", { class: "ch-grid" }, ...mine.map((d) => this.drillCard(d))),
      );
    if (rest.length)
      body.append(
        h(
          "div",
          { class: "fc-sec2" },
          t("ch.d.club"),
          h("span", { class: "ct" }, String(rest.length)),
        ),
        h("div", { class: "ch-grid" }, ...rest.map((d) => this.drillCard(d))),
      );
    templates();
    // no club drill yet: the templates come first, then how to make the club's own
    if (!club.length)
      body.append(
        h(
          "div",
          { class: "fc-sec2" },
          t("ch.d.club"),
          h("span", { class: "ct" }, "0"),
        ),
        h(
          "div",
          { class: "ch-empty" },
          h("span", { class: "fc-none-ic" }, pIcon("drill", 24)),
          h(
            "div",
            {},
            h("b", {}, t("ch.d.clubNone")),
            h("span", {}, t("ch.d.clubNoneSub")),
          ),
        ),
      );
  }

  // ---- procedure library
  private openProc(id: string | null) {
    openProcedureEditor({
      id,
      lang: uiL(),
      onSaved: (p, how) =>
        this.say(
          how === "reset" && p
            ? t("ch.l.reset", { t: p.title })
            : p
              ? t("ch.l.saved", { t: p.title })
              : t("ch.l.deleted"),
        ),
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
        {
          class: "ch-proc-main",
          onclick: () => this.openProc(p.id),
          title: club ? t("ch.l.edit") : t("ch.l.open"),
        },
        h(
          "span",
          { class: `ch-ic cat-${p.category}` },
          pIcon(CAT_ICONS[p.category] ?? "other", 18),
        ),
        h(
          "span",
          { class: "ch-proc-tx" },
          h(
            "b",
            {},
            p.title,
            p.lang !== l
              ? h("span", { class: "ch-lang-tag" }, p.lang.toUpperCase())
              : null,
          ),
          p.summary ? h("span", { class: "ch-proc-sum" }, p.summary) : null,
          h(
            "span",
            { class: "ch-proc-meta" },
            h(
              "span",
              { class: `ch-src ${club ? "club" : "lib"}` },
              club
                ? p.basedOn
                  ? t("ch.l.custom")
                  : t("ch.l.club")
                : t("ch.l.library"),
            ),
            h("span", {}, tn("ch.l.items", p.items.length)),
            mem ? h("span", { class: "ch-mem" }, tn("ch.l.mem", mem)) : null,
            p.failures.length
              ? h(
                  "span",
                  {
                    class: "ch-ans",
                    title: p.failures.map((f) => failureName(f, l)).join(", "),
                  },
                  l === "fr"
                    ? `${t("ch.l.answers")}\u00a0: `
                    : `${t("ch.l.answers")}: `,
                  p.failures.map((f) => failureName(f, l)).join(", "),
                )
              : null,
          ),
        ),
      ),
      h(
        "div",
        { class: "ch-proc-acts" },
        h(
          "button",
          {
            class: "pe-ib",
            title: t("ch.l.share"),
            "aria-label": `${t("ch.l.share")} · ${p.title}`,
            onclick: () => openShareDialog(p),
          },
          pIcon("share", 16),
        ),
        h(
          "button",
          { class: "btn", onclick: () => this.openProc(p.id) },
          club ? pIcon("edit", 15) : pIcon("eye", 15),
          club ? t("ch.l.edit") : t("ch.l.open"),
        ),
      ),
    );
  }

  private clubLibrary(body: HTMLElement) {
    const l = uiL();
    const other: Lang = l === "fr" ? "en" : "fr";
    // the library in the screen language, and every club procedure (a club writes in its own language)
    const all = [
      ...effectiveProcedures(l),
      ...effectiveProcedures(other).filter((p) => p.source === "club"),
    ];
    const words = this.libQ.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = all.filter(
      (p) =>
        (this.libSrc === "all" ||
          (this.libSrc === "club") === (p.source === "club")) &&
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
      const again =
        this.main.querySelector<HTMLInputElement>(".ch-search input");
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
        h(
          "button",
          { class: "btn primary", onclick: () => this.openProc(null) },
          pIcon("plus", 16),
          t("ch.l.new"),
        ),
      ),
    );
    if (!shown.length) {
      body.append(
        h(
          "div",
          { class: "ch-empty" },
          h(
            "span",
            { class: "fc-none-ic" },
            pIcon(this.libQ ? "search" : "book", 24),
          ),
          this.libQ
            ? h(
                "div",
                {},
                h("b", {}, t("ch.l.none", { q: this.libQ })),
                h("span", {}, t("ch.l.noneSub")),
              )
            : h(
                "div",
                {},
                h("b", {}, t("ch.l.noClub")),
                h("span", {}, t("ch.l.noClubSub")),
              ),
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
            h(
              "span",
              { class: `ch-ic sm cat-${cat}` },
              pIcon(CAT_ICONS[cat], 15),
            ),
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
          h(
            "div",
            {},
            h("b", {}, t("ch.r.none")),
            h("span", {}, t("ch.r.noneSub")),
          ),
          h(
            "button",
            {
              class: "btn primary",
              onclick: () => this.go({ type: "club", tab: "drills" }),
            },
            pIcon("drill", 15),
            t("ch.tab.drills"),
          ),
        ),
      );
      return;
    }
    const studs = studentsOf(rows);
    if (this.resStudent && !studs.includes(this.resStudent))
      this.resStudent = "";
    const f = filterProcRows(rows, {
      student: this.resStudent || undefined,
      verdict: this.resVerdict,
    });
    const sum = procSummary(f);
    const sel = (
      label: string,
      value: string,
      opts: [string, string][],
      set: (v: string) => void,
    ) =>
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
          ...opts.map(([v, tx]) =>
            h("option", { value: v, selected: v === value }, tx),
          ),
        ),
      );
    const dl = () => {
      const blob = new Blob([`﻿${procCsv(f)}`], {
        type: "text/csv;charset=utf-8",
      });
      const a = h("a", {
        href: URL.createObjectURL(blob),
        download: `procedures-${new Date().toISOString().slice(0, 10)}.csv`,
      });
      document.body.append(a);
      a.click();
      setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
    };
    const stat = (label: string, v: string, cls = "") =>
      h(
        "div",
        { class: `ch-stat ${cls}` },
        h("span", {}, label),
        h("b", {}, v),
      );
    body.append(
      h(
        "div",
        { class: "ch-bar" },
        sel(
          t("ch.r.student"),
          this.resStudent,
          [
            ["", t("ch.r.allStudents")],
            ...studs.map((s) => [s, s || t("ch.r.noName")] as [string, string]),
          ],
          (v) => (this.resStudent = v),
        ),
        sel(
          t("ch.r.verdict"),
          this.resVerdict,
          [
            ["", t("ch.r.allVerdicts")],
            ["PASS", t("ch.v.PASS")],
            ["FAIL", t("ch.v.FAIL")],
          ],
          (v) => (this.resVerdict = v as "" | "PASS" | "FAIL"),
        ),
        // the two actions wrap together, to the right
        h(
          "div",
          { class: "ch-bar-end" },
          h(
            "button",
            {
              class: "btn ghost",
              onclick: () => this.leave(() => this.hooks.openRecords()),
            },
            svgIcon(I.clipboard, 15),
            t("ch.r.records"),
          ),
          h(
            "button",
            { class: "btn", onclick: dl, disabled: !f.length },
            pIcon("download", 15),
            t("ch.r.csv"),
          ),
        ),
      ),
      h(
        "div",
        { class: "ch-stats" },
        stat(t("ch.r.n"), String(sum.n)),
        stat(
          t("ch.r.pass"),
          sum.passRate === null ? "—" : `${sum.passRate} %`,
          sum.passRate !== null && sum.passRate >= 70
            ? "ok"
            : sum.passRate !== null
              ? "bad"
              : "",
        ),
        stat(
          t("ch.r.avg"),
          sum.avgScore === null ? "—" : `${sum.avgScore}/100`,
        ),
        stat(
          t("ch.r.react"),
          sum.reactionS === null
            ? "—"
            : `${String(sum.reactionS).replace(".", uiL() === "fr" ? "," : ".")} s`,
        ),
      ),
    );
    if (!f.length) {
      body.append(
        h(
          "div",
          { class: "ch-empty" },
          h("span", { class: "fc-none-ic" }, pIcon("search", 24)),
          h("div", {}, h("b", {}, t("ch.r.noneFilter"))),
        ),
      );
      return;
    }
    const weak = sum.byProcedure.filter((p) => p.pass < p.n).slice(0, 3);
    if (weak.length)
      body.append(
        h(
          "div",
          { class: "ch-weak" },
          h("b", {}, pIcon("warn", 15), t("ch.r.weak")),
          ...weak.map((w) =>
            h(
              "span",
              {},
              h("strong", {}, w.procedure),
              ` · ${t("ch.r.weakLine", { p: w.pass, n: w.n, a: w.avgScore })}`,
            ),
          ),
        ),
      );
    const date = (iso: string) => {
      const d = new Date(iso);
      return Number.isFinite(d.getTime())
        ? d.toLocaleDateString(uiL() === "fr" ? "fr-FR" : "en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
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
                      r.drill
                        ? h("span", { class: "c-drill-sm" }, r.drill, " · ")
                        : null,
                      failureName(r.failure, uiL()),
                      " · ",
                      t(r.mode === "test" ? "ch.d.test" : "ch.d.training"),
                    ),
                    r.notes.length > 1
                      ? h(
                          "details",
                          { class: "c-notes" },
                          h(
                            "summary",
                            {},
                            h("span", { class: "c-note" }, r.note),
                            h(
                              "span",
                              { class: "c-more" },
                              tn("ch.r.more", r.notes.length - 1),
                            ),
                          ),
                          h(
                            "ul",
                            {},
                            ...r.notes.slice(1).map((x) => h("li", {}, x)),
                          ),
                        )
                      : r.note
                        ? h("span", { class: "c-note" }, r.note)
                        : null,
                  ),
                ),
                h("td", { class: "num" }, h("b", {}, String(r.score))),
                h(
                  "td",
                  {},
                  h(
                    "span",
                    {
                      class: `ch-verdict ${r.verdict === "PASS" ? "ok" : "bad"}`,
                    },
                    t(`ch.v.${r.verdict}`),
                  ),
                ),
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
      {
        class: `ch-pending${ok ? "" : " bad"}`,
        role: "region",
        "aria-label": t("ch.p.linkTitle"),
      },
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
              ...procs
                .slice(0, 6)
                .map((p) =>
                  h(
                    "li",
                    {},
                    p.title,
                    h(
                      "span",
                      { class: "muted" },
                      ` · ${tn("ch.l.items", p.items)}`,
                    ),
                  ),
                ),
              procs.length > 6
                ? h("li", { class: "muted" }, `+ ${procs.length - 6}`)
                : null,
            )
          : null,
      ),
      h(
        "div",
        { class: "ch-pending-b" },
        h(
          "button",
          { class: "btn ghost", onclick: () => (done(), this.renderMain()) },
          t("ch.p.linkLater"),
        ),
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
      const slug =
        (clubName() || "club")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "club";
      const a = h("a", {
        href: URL.createObjectURL(blob),
        download: `${slug}-procedures.json`,
      });
      document.body.append(a);
      a.click();
      setTimeout(() => (URL.revokeObjectURL(a.href), a.remove()), 1000);
    };
    const report = (r: ImportReport) => {
      this.packReport = importSummary(r);
      this.renderMain();
    };
    const file = h("input", {
      type: "file",
      accept: ".json,application/json",
      class: "ch-file",
      "aria-label": t("ch.p.file"),
    }) as HTMLInputElement;
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (!f) return;
      report(importPack(await f.text(), this.packPolicy, uiL()));
    });
    const code = h("input", {
      type: "text",
      placeholder: t("ch.p.paste"),
      "aria-label": t("ch.p.paste"),
      autocomplete: "off",
    }) as HTMLInputElement;
    code.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && code.value.trim())
        report(importShare(code.value, this.packPolicy, uiL()));
    });
    const pol: [ConflictPolicy, string][] = [
      ["newer", t("ch.p.newer")],
      ["replace", t("ch.p.replace")],
      ["keep", t("ch.p.keep")],
      ["copy", t("ch.p.copy")],
    ];
    const card = (
      icon: PIcon,
      title: string,
      sub: string,
      ...content: (Node | null)[]
    ) =>
      h(
        "section",
        { class: "ch-card" },
        h(
          "div",
          { class: "ch-card-h" },
          h("span", { class: "ch-ic" }, pIcon(icon, 18)),
          h("div", {}, h("b", {}, title), h("small", {}, sub)),
        ),
        ...content,
      );
    body.append(
      h(
        "div",
        { class: "ch-pack" },
        card(
          "users",
          t("ch.p.name"),
          t("ch.p.nameHint"),
          h("div", { class: "ch-row" }, name),
        ),
        card(
          "upload",
          t("ch.p.export"),
          n ? tn("ch.p.exportSub", n) : t("ch.p.exportNone"),
          h(
            "div",
            { class: "ch-row" },
            h(
              "button",
              { class: "btn primary", disabled: !n, onclick: download },
              pIcon("download", 15),
              t("ch.p.download"),
            ),
            h(
              "button",
              {
                class: "btn",
                disabled: !n,
                onclick: () => openShareDialog(exportPack()),
              },
              pIcon("qr", 15),
              t("ch.p.link"),
            ),
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
                onchange: (e: Event) =>
                  (this.packPolicy = (e.target as HTMLSelectElement)
                    .value as ConflictPolicy),
              },
              ...pol.map(([v, tx]) =>
                h("option", { value: v, selected: v === this.packPolicy }, tx),
              ),
            ),
          ),
          h(
            "div",
            { class: "ch-row" },
            h(
              "button",
              { class: "btn", onclick: () => file.click() },
              pIcon("other", 15),
              t("ch.p.file"),
            ),
            file,
          ),
          h(
            "div",
            { class: "ch-row" },
            code,
            h(
              "button",
              {
                class: "btn",
                onclick: () =>
                  code.value.trim() &&
                  report(importShare(code.value, this.packPolicy, uiL())),
              },
              t("ch.p.go"),
            ),
          ),
          this.packReport
            ? h(
                "div",
                {
                  class: `ch-report ${this.packReport.ok ? "ok" : "warn"}`,
                  role: "status",
                },
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
              `${i.sub} · ${diffLabel(i.difficulty)} · ${i.minutes} min`,
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
          h("b", {}, LL("Select a flight", "Choisissez un vol")),
          h(
            "span",
            {},
            LL(
              "Its briefing, objectives, approach plate and cockpit options appear here.",
              "Son briefing, ses objectifs, la carte d’approche et les options du cockpit s’affichent ici.",
            ),
          ),
          h(
            "ul",
            { class: "fc-keys", "aria-label": LL("Shortcuts", "Raccourcis") },
            key(LL("Click", "Clic"), "Briefing"),
            key(LL("Double-click", "Double-clic"), LL("Fly", "Voler")),
            key(
              LL("Enter", "Entrée"),
              LL("Briefing, then fly", "Briefing, puis vol"),
            ),
            key("/", LL("Search", "Rechercher")),
            key(LL("Esc", "Échap"), LL("Close", "Fermer")),
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
        h("span", { class: `fc-lvl d${i.difficulty}` }, diffLabel(i.difficulty)),
        h("span", {}, i.airport),
        h("span", {}, `${i.minutes} min`),
        h("span", {}, i.graded ? LL("Scored", "Évalué") : LL("Practice", "Entraînement")),
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
          "Edit in “Plan a flight”",
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
  const b = h(
    "button",
    { class: "btn tb-courses", type: "button", onclick: open },
    svgIcon(I.slides),
    lbl,
  );
  const sync = () => {
    const fr = uiLang() === "fr";
    // the place's one name (UX logic §2): the library, where every course, lesson and check-list lives
    lbl.textContent = fr ? "Bibliothèque" : "Library";
    b.title = fr
      ? "La bibliothèque : cours, leçons au simulateur et check-lists"
      : "The library: courses, simulator lessons and checklists";
  };
  sync();
  onLangChange(sync);
  return b;
}
