// Ground school — the course data model (SPEC §8), the calculation exercises ("Maths for IFR / VFR"), the
// designed-slide canvas ("the Canva of aviation") and the nesting rules (slides, briefings, cues, courses).
//
// FROZEN: every Ground school package compiles against this file. Changes are additive only (new optional
// fields, new union members) and go through the integrator. `format` / `version` gate migrations (migrate.ts).
// Author content is L10n { en, fr? }, never machine-translated. Types only: no runtime code, no DOM, no three.js.
//
// NESTING (everything fits inside everything; ONE builder edits all of it):
//   - a Step is EITHER a designed slide (step.slide: SlideCanvas, free blocks on a 16:9 canvas) OR a Reader +
//     Stage step (step.reader + step.stage). `kind` still names what it teaches (explain, try, quiz, calc…);
//     kind 'slide' is a designed slide that only presents. A designed slide keeps `reader` as its linear text
//     (screen readers, handout, phone portrait).
//   - any slide can hand control to the student: a YourTurn on an instrument block (on the slide) or on a
//     simViewport block (in the full simulator from a scene), goals checked live, the result coming back to the
//     course (YourTurnResult, AttemptRecord.yourTurn) and shown by later blocks (TextBlock.bind, DiagramBlock.fromCalc).
//   - a briefing is a list of steps: a Course with shape 'briefing' (Briefing), or FlyIt.briefing inline.
//   - an in-flight cue may open a step (OpenStep; the cue model itself is course/lessonTypes.ts Cue, briefing team).
//   - a course is a list of steps; a step may link to another course's step (StepRef).
//
// Ownership (exclusive; no two packages edit the same file — SPEC §11.2):
//   Foundation  course/types.ts (this file), sim/rng.ts + wind.ts + aircraft.ts + sim.ts (per-Sim RNG, Sim.seed),
//               avionics/steam.ts + pfd.ts + airliner.ts (instance state), avionics/crop.ts, lib/idb.ts,
//               sim/avionicsControls.ts, tests/course-foundation.test.ts
//   A  Model & storage     course/validate.ts, migrate.ts, store.ts, pack.ts, handoff.ts, tests/coursePack.test.ts
//   B  Scene & clips       course/scene.ts, rewind.ts, clip.ts, tests/scene.test.ts, tests/clip.test.ts
//   C  Stage               course/stage/*.ts, styles/course-stage.css
//   D  Goals & exercise    course/goals.ts, toExercise.ts, tests/goals.test.ts
//   E  Player              course/ui/player.ts, reader.ts, quiz.ts, outline.ts, debrief.ts, styles/course.css
//   F  Editor              course/ui/editor.ts, inspector.ts, tray.ts, templates.ts, checksPanel.ts,
//                          styles/course-editor.css
//   G  Present             course/present.ts, ui/presenter.ts, ui/projector.ts
//   H  Imports & content   course/imageImport.ts, pdfImport.ts, prerender.ts, course/samples/index.ts,
//                          samples/vor.ts, samples/holding.ts, package.json (pdfjs-dist)
//   I  Academy & library   academy.html, learn/main.ts, course/ui/library.ts, course/i18n.ts
//   J  Shell (integrator)  course/cockpitBridge.ts, main.ts, ui/flightcenter.ts, the result modal
//   K  Calc engine         course/calc/*.ts (registry index.ts, rng.ts, units.ts, check.ts, ifr/*.ts, vfr/*.ts),
//                          tests/calc-*.test.ts
//   L  Calc UI             course/ui/calc.ts, ui/drill.ts, course/calcDiagrams/*.ts, styles/course-calc.css
//   M  Maths content       course/samples/mathsIfr.ts, samples/mathsVfr.ts, tests/samples-maths.test.ts
//   N  Slide canvas        course/canvas/render.ts, blocks/*.ts, themes.ts, layouts.ts, styles/course-canvas.css,
//                          tests/canvas-*.test.ts (renders SlideCanvas in player, projector, editor, thumbnails)
//   O  Slide builder       course/ui/canvasEditor.ts, guides.ts, history.ts (undo/redo), blockInspector.ts,
//                          assetLibrary.ts, styles/course-builder.css
//   P  Asset library       course/canvas/library.ts, public/library/** (icons, diagrams, photos we ship)
//   Q  Your turn & nesting course/yourTurn.ts, course/nesting.ts (briefing, OpenStep, StepRef, result binding)
//   (briefing team)        course/lessonTypes.ts (Cue, BriefingDoc): uses OpenStep, StepRef, GuidanceLevel from here
//
// Rules taught in content cite their source (FAA AIM / IFH / PHAK / AFH, EASA, ICAO) in CalcProblem.refs.
// Hold entries come from holdEntry() in nav/holding.ts (AIM FIG 5-3-8), never from a local table.
import type { AircraftState } from "../sim/aircraft"; // plain, JSON round-trips
import type { Avionics, Equipment, Failures } from "../sim/sim";
import type { Weather } from "../sim/environment";
import type { CheckRef } from "../train/procedureTypes";
import type { Circuit } from "../train/circuits";
import type { Sample } from "../sim/recorder";
import type { SteamGaugeKind } from "../avionics/steam";

export type Lang = "en" | "fr";
/** author content; never machine-translated (a missing fr falls back to en with an "EN" marker) */
export interface L10n {
  en: string;
  fr?: string;
}
/** sha-256 hex of the stored (re-encoded) bytes */
export type AssetId = string;
export type Cockpit = "g1000" | "steam" | "airliner";
export type World =
  | { kind: "training" }
  | { kind: "real"; region: string; icaos?: string[]; airac?: string };

// ---------------------------------------------------------------- course
/** The programs of the unified library (src/library/programs.ts). 'lapl-ppl' is the course authors' shared shelf
 *  (samples/library): it lists the course under both LAPL and PPL. */
export type CourseProgram =
  | "lapl"
  | "ppl"
  | "lapl-ppl"
  | "night"
  | "ir"
  | "atpl"
  | "club"
  | "instructors";
/** 1 getting started · 2 core · 3 advanced */
export type CourseLevel = 1 | 2 | 3;
export interface Course {
  format: "ifr-course";
  version: 1;
  id: string;
  /** rev++ on every save */
  rev: number;
  /** ISO */
  updated: string;
  /** content hash (no assets) for classroom join + share */
  hash?: string;
  title: L10n;
  summary?: L10n;
  author: { name: string; club?: string };
  langs: Lang[];
  cockpit: Cockpit;
  /** ONE nav region per course (the nav database is global) */
  world: World;
  minutes?: number;
  steps: Step[];
  /** shared by id */
  scenes: Record<string, SimScene>;
  clips: Record<string, Clip>;
  /** metadata only; bytes in IndexedDB / the file */
  assets: Record<AssetId, AssetRef>;
  attribution?: string;
  /** copyright gate before sharing imported images */
  shareConfirmed?: boolean;
  /** id of the built-in sample it was duplicated from */
  sample?: string;
  /** library facets (e.g. 'maths', 'ifr', 'vfr', 'holding'); free text, lower case */
  tags?: string[];
  /** additive (unified library): the program(s) the course belongs to, first = its home shelf; a course without
   *  one is placed from its sample entry, its tags or its id (src/library/meta.ts) */
  program?: CourseProgram | CourseProgram[];
  /** additive (unified library): 1 getting started · 2 core · 3 advanced (default: from the program) */
  level?: CourseLevel;
  /** 'course' (default), 'lesson' (briefing pages + a Fly-it, the briefing team's shape) or 'briefing' (Briefing) */
  shape?: CourseShape;
  /** what a 'briefing' prepares for */
  briefingFor?: BriefingFor;
  /** designed slides: the course theme (a slide may override it); default 'cockpit' */
  theme?: ThemeId;
  /** the school's colour and logo (theme 'brand', and the logo corner on every theme when set) */
  brand?: SchoolBrand;
}
export interface AssetRef {
  id: AssetId;
  mime: "image/webp" | "image/jpeg" | "image/png" | "image/svg+xml";
  w: number;
  h: number;
  bytes: number;
  role: "image" | "pdfPage" | "thumb" | "still" | "plate" | "diagram";
  source?: string;
  alt?: L10n;
}

// ---------------------------------------------------------------- steps
export type StepKind =
  | "page"
  | "explain"
  | "predict"
  | "watch"
  | "try"
  | "tap"
  | "quiz"
  | "fly"
  | "calc" // a parameterised calculation (CalcSpec): numbers, worked solution, rule of thumb + exact formula
  | "drill" // N random calculations in a row, timed, practice only (DrillSpec)
  | "slide" // a designed slide that only presents (step.slide); any other kind may also carry a slide
  | "debrief"
  | "plate"
  | "compare"
  | "decision"; // last four: phase 2-3
export interface Step {
  id: string;
  kind: StepKind;
  title: L10n;
  minutes?: number;
  audience?: "intro" | "all";
  /** default from kind; 'canvas' when step.slide is set */
  layout?: "split" | "stageWide" | "readerOnly" | "canvas";
  /** Reader + Stage steps: the reader. Designed slides: the linear text (screen readers, handout, phone portrait). */
  reader: ReaderBlock[];
  /** a designed slide: when set, the player draws this canvas instead of the reader + stage split */
  slide?: SlideCanvas;
  /** briefing page role (overview, clearance, entry, wind, numbers, errors, check…; lessonTypes.ts BriefSection) */
  section?: string;
  /** guidance levels at which the step shows (a briefing page can be skipped at Solo); default all */
  levels?: GuidanceLevel[];
  stage?: StageCue;
  goal?: StepGoal;
  /** predict / quiz / tap */
  quiz?: Quiz;
  flyIt?: FlyIt;
  /** kind 'calc' */
  calc?: CalcSpec;
  /** kind 'drill' */
  drill?: DrillSpec;
  /**
   * A Try it / Fly it step that uses an earlier calc step's problem (the same numbers the student just solved):
   * the stage poses from its CalcProblem.stage hint and/or the goal comes from CalcProblem.stage.goals.
   */
  calcLink?: { step: string; use: "stage" | "goal" | "both" };
  hint?: L10n;
  /** clip id */
  showMe?: string;
  /** presenter only */
  notes?: L10n;
}
/** A calc step (kind 'calc' always carries a CalcSpec). */
export type CalcStep = Step & { kind: "calc"; calc: CalcSpec };
/** A drill step (kind 'drill' always carries a DrillSpec). */
export type DrillStep = Step & { kind: "drill"; drill: DrillSpec };
/** A designed slide (any kind; the canvas replaces the reader + stage split). */
export type DesignedStep = Step & { slide: SlideCanvas };

export type ReaderBlock =
  | { t: "heading"; text: L10n }
  /** **b** *i* lists, [[label|annotationId]] */
  | { t: "text"; text: L10n }
  | {
      t: "image";
      asset: AssetId;
      caption?: L10n;
      alt: L10n;
      attribution?: string;
    }
  | { t: "diagram"; d: DiagramSpec; asset?: AssetId; caption?: L10n }
  | { t: "keys"; items: L10n[] }
  | { t: "doThis"; rows: { text: L10n; check: number; readout?: ReadoutId }[] }
  | {
      t: "reveal";
      blocks: ReaderBlock[];
      when: "answered" | "goalMet" | "presenter" | { step: number };
    }
  /** procedure.updated at authoring in `rev` */
  | { t: "procedure"; procId: string; rev?: string }
  | { t: "takeaway"; text: L10n }
  /** an inline quiz in the reader (SPEC §4.2), any Quiz kind including 'calc' */
  | { t: "quiz"; quiz: Quiz }
  /** a formula card: the exact formula and the pilot's rule of thumb side by side */
  | { t: "formula"; formula: L10n; ruleOfThumb?: L10n; refs?: CalcRef[] };
export type ReadoutId =
  | "obs1"
  | "toFrom"
  | "cdiDots"
  | "gsDots"
  | "hdg"
  | "trk"
  | "alt"
  | "ias"
  | "dme"
  | "radial"
  | "holdS"
  | "entry"
  | "vs"
  | "gs"
  | "wca";
export type DiagramSpec =
  | {
      kind: "hold";
      inbound: number;
      turn: "L" | "R";
      fix: string;
      crs?: number;
      /** cover mode on a slide: the racetrack in accent, no sector labels (SPEC slides v2 A1) */
      quiet?: boolean;
    }
  | { kind: "profile" | "routeMap"; circuit: Circuit }
  /** `crop`: the part of the plate shown (0..1 of the page: plan view, profile, minimums box) */
  | {
      kind: "plate";
      approachId: string;
      procHash?: string;
      airac?: string;
      crop?: Rect;
    }
  | { kind: "airportDiagram"; icao: string }
  /** a moving-map style chart around a point (navaids, airways, airports, the route): MFD map renderer */
  | {
      kind: "map";
      center: { fix: string } | { lat: number; lon: number };
      rangeNm: number;
      layers?: ("navaids" | "airways" | "airports" | "airspace" | "terrain")[];
      route?: string[];
      northUp?: boolean;
    }
  /** an airspace cross-section sketch (classes, floors, ceilings, VFR minima tags) */
  | { kind: "airspace"; sketch: AirspaceSketch }
  /** generated from numbers, optionally interactive (drag the wind, the aircraft…): rendered by course/calcDiagrams */
  | { kind: "calc"; calc: CalcDiagram };

// ---------------------------------------------------------------- stage
export type PaneView =
  | {
      kind: "pfd" | "mfd" | "six" | "stack" | "airlinerPfd" | "nd";
      crop?: CropRef;
    }
  /** plate, hold, profile, airport (pre-rendered), or a calc diagram (live) */
  | { kind: "diagram"; d: DiagramSpec; asset?: AssetId }
  | { kind: "still" | "image"; asset: AssetId };
/** e.g. 'STEAM_LEFT:4' = HSI (index into EXPLAIN_REGIONS[table]) */
export type CropRef = { region: `${ExplainTable}:${number}` } | { rect: Rect };
export type ExplainTable =
  | "G1000_PFD"
  | "G1000_MFD"
  | "STEAM_LEFT"
  | "STEAM_RIGHT"
  | "AL_PFD"
  | "AL_ND";
/** logical 1024x768 (still: 0..1) */
export type Rect = [x: number, y: number, w: number, h: number];
export type Pt = [number, number];
export interface StageCue {
  panes: [PaneView] | [PaneView, PaneView];
  inset?: "plan" | null;
  mode: "frozen" | "live" | "clip" | "fly";
  scene?: string;
  carry?: "reset" | "continue";
  clip?: string;
  annotations?: Annotation[];
  controls?: StageControl[];
  assist?: { holdAlt?: boolean; holdIas?: boolean; timeScale?: 1 | 2 | 4 };
  /** predict: run N s after commit */
  liveForS?: number;
  failuresOnEnter?: Partial<Failures>;
  covers?: ("ai" | "dg")[];
  presenter?: PresenterAction[];
}
export type StageControl =
  | "obs1"
  | "obs2"
  | "hdgBug"
  | "crs"
  | "altBug"
  | "baro"
  | "bank"
  | "pitch"
  | "power"
  | "cdiSource"
  | "brg1"
  | "brg2"
  | "dragAircraft"
  | "ap";
export type PresenterAction =
  | { k: "freeze" }
  | { k: "flyFor"; s: number }
  | { k: "failure"; key: keyof Failures }
  | { k: "wind"; dKt: number }
  | { k: "reset" }
  | { k: "showPlate" };
export type Annotation = {
  id: string;
  pane: 0 | 1;
  when?: "always" | { step: number } | `afterCheck:${number}` | "onReveal";
  /** explain region id, survives layout changes */
  anchor?: string;
} & (
  | { type: "callout"; n: number; at: Pt; text?: L10n; box?: Rect }
  | { type: "ring"; rect: Rect; rot?: number }
  | { type: "arrow"; from: Pt; to: Pt }
  | { type: "tag"; at: Pt; text: L10n }
  | {
      type: "spotlight";
      holes: ({ rect: Rect } | { circle: [number, number, number] })[];
    }
);

// ---------------------------------------------------------------- scene (exact where plain, declarative where private)
/** "Edit as numbers": a pose from fields (also what a calc generator's stage hint uses) */
export interface SceneFields {
  kind: "fields";
  pos:
    | { fix: string; radial: number; distNm: number }
    | {
        runway: { icao: string; id: string };
        distNm: number;
        offsetDeg?: number;
      }
    | { lat: number; lon: number };
  altFt: number;
  hdg: number;
  iasKt: number;
  pitch?: number;
  bank?: number;
  vsFpm?: number;
  radios?: {
    nav1?: number | string;
    nav2?: number | string;
    adf?: number;
    obs1?: number;
    obs2?: number;
    cdi?: "GPS" | "NAV1" | "NAV2";
    brg1?: "OFF" | "NAV1" | "GPS" | "ADF";
    brg2?: "OFF" | "NAV2" | "GPS" | "ADF";
    baro?: number;
    minimums?: number | null;
  };
}
export interface SimScene {
  v: 1;
  id: string;
  label?: string;
  world: World;
  cockpit: Cockpit;
  equipment?: Partial<Equipment>;
  /** 'exact' from a capture */
  pose: { kind: "exact"; ac: AircraftState; av: Avionics } | SceneFields;
  ap?: {
    engaged: boolean;
    fd?: boolean;
    lat?: string;
    vert?: string;
    armed?: string[];
    hdg?: number;
    alt?: number;
    vs?: number;
    ias?: number;
  };
  plan?: {
    idents: string[];
    approach?: {
      id: string;
      transition: string | null;
      mode: "load" | "activate" | "vtf";
    };
    activeLeg?: number;
  };
  controls?: {
    throttle: number;
    mixture?: number;
    trim: number;
    flaps: number;
  };
  weather: Partial<Weather>;
  /** pinned; applied LAST with Sim.seed() (startAt reseeds with 'lesson') */
  seed: number;
  failures?: Partial<Failures>;
  covers?: ("ai" | "dg")[];
  timeOfDay?: "day" | "dusk" | "night";
  refs?: { airac?: string; procIds?: string[]; procHash?: string };
  verify?: {
    cdiDots: number | null;
    gsDots: number | null;
    dmeNm: number | null;
    activeWpt: string | null;
    apAnnun: string;
    trk: number;
    hdg: number;
  };
  /** e.g. ['hold sequencing: restarts at the fix'] */
  notCaptured?: string[];
  captured?: {
    at: string;
    from: "cockpit" | "fields" | "rewind" | "calc";
    thumb?: AssetId;
    still?: AssetId;
  };
}

export interface Clip {
  id: string;
  startScene: string;
  durS: number;
  /** recorder.ts, ~2 Hz pose */
  samples: Sample[];
  /** 1 Hz, exact take-over with no velocity jump */
  keys: { t: number; ac: AircraftState; av: Avionics }[];
  /** diffed from the rewind ring */
  events: { t: number; k: "av" | "ap" | "plan" | "failure"; patch: unknown }[];
  cues: {
    t: number;
    text?: L10n;
    pause?: boolean;
    annotation?: string;
    handover?: boolean;
  }[];
  source: "recorded" | "autoflown";
  author?: string;
}

// ---------------------------------------------------------------- goals and checks (declarative, no scripting)
export interface StepGoal {
  all: GoalCheck[];
  holdS?: number;
  graded: boolean;
  success?: L10n;
  onMet?: "stay" | "autoNext";
}
export type GoalCheck =
  /** procedures-mode CHECKS: ias, pitchAtt, bankMax, altBand, heading, cdi, ap, directTo, radio, xpdr, flaps, switch, timer… */
  | CheckRef
  | { id: "obs"; p: { nav: 1 | 2; value: number; tol: number } }
  | { id: "toFrom"; p: { value: "TO" | "FROM" } }
  /** shown as dots + degrees/NM for the active source */
  | { id: "cdiDefl"; p: { maxDots: number } }
  | { id: "gsDefl"; p: { maxDots: number } }
  | { id: "acsScale"; p: { axis: "lat" | "vert"; frac: number /* 0.75 */ } }
  | { id: "onRadial"; p: { navaid: string; radial: number; tol: number } }
  | { id: "dme"; p: { min: number; max: number } }
  /** holdEval.ts; expected = holdEntry(...) from nav/holding.ts, lower-cased */
  | { id: "holdEntry"; p: { expected: "direct" | "parallel" | "teardrop" } }
  | { id: "holdLaps"; p: { laps: number; legS?: number } }
  | { id: "passedFix"; p: { ident: string } }
  | { id: "distTo"; p: { fix: string; maxNm?: number; minNm?: number } }
  | { id: "tap"; p: { annotation: string } }
  | { id: "choice"; p: { index: number } }
  /** ground track (true) within tol of value — e.g. hold the track after computing the WCA */
  | { id: "track"; p: { value: number; tol: number } }
  /** vertical speed band (ft/min, negative = descent) — e.g. fly the computed descent rate */
  | { id: "vsBand"; p: { min: number; max: number } };

export type Quiz =
  | {
      kind: "mcq";
      prompt: L10n;
      options: { text: L10n; why?: L10n }[];
      answer: number;
      explain: L10n;
      poll?: boolean;
    }
  | {
      kind: "numeric";
      prompt: L10n;
      answer: number;
      tol: number;
      unit?: string;
      explain: L10n;
    }
  | { kind: "order"; prompt: L10n; items: L10n[]; explain: L10n }
  | {
      kind: "tap";
      prompt: L10n;
      target: { pane: 0 | 1; rect: Rect } | { annotation: string };
      explain: L10n;
    }
  /** answer by flying (live stage) */
  | { kind: "fly"; prompt: L10n; answer: GoalCheck[]; explain: L10n }
  /** a generated calculation as a quiz (the prompt comes from the generator unless overridden) */
  | { kind: "calc"; calc: CalcSpec; prompt?: L10n; explain?: L10n };

// ---------------------------------------------------------------- fly it
export type FlyTarget =
  | { kind: "scene"; scene: string; durationS?: number; endWhen?: GoalCheck[] }
  | { kind: "lesson"; exerciseId: string; pathId?: string }
  | { kind: "circuit"; circuit: Circuit }
  | { kind: "procedure"; procId: string }
  | { kind: "scenario"; scenarioId: string; wx?: string }
  /** fly the stage hint of the problem the student solved in that calc step (same seed, same numbers) */
  | { kind: "calc"; step: string; durationS?: number };
export type FlyOption =
  | "wind"
  | "partialPanel"
  | "surpriseMe"
  | "goMissed"
  | "turbulence"
  | "allowAp";
export interface Criterion {
  id: string;
  label: L10n;
  check: GoalCheck;
  acs?: string /* 'IR.V.A' */;
  trace?: ReadoutId;
}
export interface FlyIt {
  target: FlyTarget;
  brief?: L10n;
  keys?: L10n[];
  options: FlyOption[];
  defaultsOn?: FlyOption[];
  surprisePool?: (keyof Failures)[];
  /** empty for lesson targets (the engine grades) */
  criteria: Criterion[];
  /** clip id */
  worked?: string;
  debrief?: L10n;
  returnTo: "thisStep" | "nextStep";
  /** an interactive briefing before the handoff: a mini-course of steps (predict, choose the entry, compute the
   *  TOD, watch a 30 s demo), played in place, then "Fly it" */
  briefing?: Step[];
}

// ---------------------------------------------------------------- calculation exercises (Maths for IFR / VFR)
// A generator (course/calc/*) turns a seed + params into a CalcProblem: realistic numbers, the prompt, the
// answer with its unit and accepted tolerance, a worked solution revealed step by step, the pilot's rule of thumb
// AND the exact formula, sources, and optionally a diagram or a live instrument for the stage. check() explains
// the likely mistake. Calc and drill results are practice: never ACS-graded, never logged as flights.

export type CalcCategory = "ifr" | "vfr";
/** Units a calc answer or given is expressed in (display and conversion live in course/calc/units.ts). */
export type CalcUnit =
  | "deg" // angle, heading, course, radial, bearing
  | "NM"
  | "SM"
  | "km"
  | "m"
  | "ft"
  | "kt"
  | "kmh"
  | "mph"
  | "fpm" // ft/min
  | "ftPerNm" // climb / descent gradient
  | "pct" // gradient in %
  | "min"
  | "s"
  | "h"
  | "usgal"
  | "L"
  | "lb"
  | "kg"
  | "gph" // US gal/h
  | "lph" // L/h
  | "inHg"
  | "hPa"
  | "degC"
  | "degF"
  | "in" // CG arm (inches aft of datum)
  | "lbIn" // moment (lb·in; C172 POH tables use lb·in / 1000)
  | "none";

/** Generator ids (the registry in course/calc/index.ts is a Record over this union, so none can be missing). */
export type CalcGeneratorId =
  // ---- IFR
  | "ifr.sixtyToOne" // track error from distance off / distance flown; correction to regain or to go direct
  | "ifr.descentGradient" // 3° ≈ 318 ft/NM; gradient ft/NM ↔ % ↔ angle
  | "ifr.descentRate" // VS ≈ GS × 5 (3°); VS = GS × ft/NM / 60
  | "ifr.topOfDescent" // distance to start down from altitude to lose and gradient / GS + VS
  | "ifr.standardRateBank" // bank ≈ TAS/10 + 7; exact tan φ = ω V / g
  | "ifr.turnRadius" // r = V² / (g tan φ); standard rate r ≈ TAS / 200 NM (exact: V / (60π) NM at 3°/s)
  | "ifr.dmeArcLead" // lead radial for turning onto / off a DME arc
  | "ifr.interceptLead" // lead distance / lead radial for an intercept turn
  | "ifr.holdWind" // inbound WCA from the wind; triple it outbound (AIM 5-3-8, IFH)
  | "ifr.holdTiming" // outbound time to get a 1:00 inbound leg
  | "ifr.holdSpeed" // maximum holding speeds FAA (AIM 5-3-8) / ICAO PANS-OPS by altitude band
  | "ifr.vdp" // VDP distance = (MDA − TDZE) / 300 NM (3°)
  | "ifr.timeSpeedDistance" // t = d / GS, d = GS × t, GS = d / t
  | "ifr.fuelReserve" // trip fuel + IFR reserve (FAA 14 CFR 91.167: 45 min; EASA final reserve 45 min piston)
  | "ifr.tasFromIas" // ≈ +2 % per 1000 ft; exact from ISA density (pressure altitude, OAT)
  | "ifr.coldTemperature" // ICAO cold temperature table / ≈ 4 % per 10 °C below ISA per 1000 ft above the station
  | "ifr.pressureAltitude" // PA = elevation + (29.92 − altimeter) × 1000 (≈ 27 ft/hPa near sea level; 30 is the round figure)
  | "ifr.densityAltitude" // DA ≈ PA + 120 × (OAT − ISA)
  | "ifr.adfBearing" // MB = MH + RB; QDM / QDR
  | "ifr.vorRadial" // radial, TO / FROM, the OBS to centre the needle
  | "ifr.windComponents" // headwind = W cos θ, crosswind = W sin θ (clock-face rule)
  | "ifr.climbGradient" // ft/NM ↔ ft/min at a ground speed (ft/min = ft/NM × GS / 60)
  | "ifr.visibility" // RVR ft ↔ m, SM ↔ m, the FAA RVR / visibility equivalents table
  // ---- VFR
  | "vfr.tvmdc" // true course → WCA → true heading → variation (East is least) → magnetic → deviation → compass
  | "vfr.groundSpeedEte" // GS from the wind triangle, then ETE
  | "vfr.fuelEndurance" // fuel burn, endurance, reserve
  | "vfr.pressureDensityAltitude" // pressure and density altitude for performance
  | "vfr.crosswind" // crosswind / headwind components against the demonstrated crosswind
  | "vfr.weightBalance" // moments, CG and the C172S-class envelope
  | "vfr.takeoffLandingFactors" // headwind / tailwind / slope / grass corrections (PHAK, AFM notes)
  | "vfr.unitConversion"; // kt / km/h / mph, ft / m, hPa / inHg, °C / °F, US gal / L / lb avgas

/** A generator parameter the CFI can set in the editor (ranges, variants). */
export interface CalcParamDef {
  key: string;
  label: L10n;
  kind: "range" | "number" | "choice" | "boolean";
  default: CalcParamValue;
  min?: number;
  max?: number;
  step?: number;
  unit?: CalcUnit;
  choices?: { value: string; label: L10n }[];
}
export type CalcParamValue = number | string | boolean | [number, number];
export type CalcParams = Record<string, CalcParamValue>;

/** Seeded random numbers for generators (course/calc/rng.ts builds one on SimRng). */
export interface CalcRng {
  /** uniform [0, 1) */
  next(): number;
  /** integer in [min, max] */
  int(min: number, max: number): number;
  /** a value in [min, max] on a grid of `step` (e.g. headings by 5°, altitudes by 500 ft) */
  range(min: number, max: number, step?: number): number;
  pick<T>(items: readonly T[]): T;
  /** true with probability p */
  chance(p: number): boolean;
}

export interface CalcGiven {
  key: string;
  label: L10n;
  value: number | string;
  unit?: CalcUnit;
  /** how a pilot writes it (e.g. '270/15', '−4 °C', '3 000 ft') when the plain value is not enough */
  display?: L10n;
}
/** An extra answer asked in the same problem (headwind AND crosswind; TO / FROM; within the envelope yes / no). */
export interface CalcPart {
  key: string;
  label: L10n;
  /** a number, or a choice value */
  answer: number | string;
  unit?: CalcUnit;
  tolerance?: number;
  /** categorical answers */
  choices?: { value: string; label: L10n }[];
}
export interface CalcRef {
  /** 'FAA-AIM' 5-3-8, 'FAA-IFH' ch. 10, 'FAA-PHAK' ch. 11, '14 CFR 91.167', 'EASA Part-NCO', 'ICAO Doc 8168' … */
  src: string;
  ref?: string;
  note?: L10n;
}
/** A live instrument for the stage: the same Sim and renderers as the cockpit, posed from numbers. */
export interface CalcStageHint {
  panes: [PaneView] | [PaneView, PaneView];
  pose: SceneFields;
  weather?: Partial<Weather>;
  mode?: "frozen" | "live";
  controls?: StageControl[];
  assist?: StageCue["assist"];
  annotations?: Annotation[];
  /** what a linked Try it / Fly it checks (e.g. track ±5° after the WCA, VS band for the descent) */
  goals?: GoalCheck[];
  doThis?: L10n[];
  brief?: L10n;
}
/** What generate() returns. Runtime only: a step stores generatorId + params + seed, never the problem. */
export interface CalcProblem {
  generatorId: CalcGeneratorId;
  seed: number;
  params: CalcParams;
  prompt: L10n;
  givens: CalcGiven[];
  /** the primary numeric answer, in `unit` */
  answer: number;
  unit: CalcUnit;
  /** accepted ± (in `unit`): rounding like a pilot would */
  tolerance: number;
  /** what the pilot writes down (e.g. 'about 1 400 ft/min'), when the bare number is not how it is said */
  answerText?: L10n;
  parts?: CalcPart[];
  /** the worked solution, revealed one step at a time */
  solutionSteps: L10n[];
  ruleOfThumb: L10n;
  /** the exact formula, plain text with unicode maths (e.g. 'tan φ = ω·V / g') */
  formula: L10n;
  /** the exact-formula answer when `answer` is the rule-of-thumb value (to show both) */
  exact?: number;
  refs: CalcRef[];
  diagram?: DiagramSpec;
  stage?: CalcStageHint;
}
/** What a generator returns; the registry (course/calc/index.ts) completes it into a CalcProblem. */
export type CalcProblemBody = Omit<CalcProblem, "generatorId" | "seed" | "params">;
/** The student's answer. */
export interface CalcResponse {
  answer: number;
  /** in this unit when the student switched units (converted before checking) */
  unit?: CalcUnit;
  parts?: Record<string, number | string>;
}
/** Known mistakes a check can name (ids are stable; texts are the generator's). */
export type CalcMistakeId =
  | "variationSign" // East is least, West is best
  | "deviationSign"
  | "wcaSign" // corrected away from the wind instead of into it
  | "reciprocal" // radial vs bearing to, QDM vs QDR, 180° off
  | "toFrom"
  | "unit" // e.g. answered in % instead of ft/NM, km/h instead of kt
  | "factor" // 60 vs 6000, hPa ×27 vs ×30, ×5 vs ×10
  | "rounding" // right method, outside the tolerance
  | "headTailSwap"
  | "crossHeadSwap" // sin / cos swapped
  | "notTripled" // hold outbound WCA not tripled
  | "wrongSide" // correction applied the wrong way
  | "isaReference" // ISA not corrected for altitude
  | "reserve" // forgot the reserve
  | "datum" // CG arm / moment confusion
  | "other";
export interface CalcMistake {
  id: CalcMistakeId;
  /** corrective, ACS-like wording: "You applied variation the wrong way: East is least (subtract)." */
  text: L10n;
}
export interface CalcVerdict {
  ok: boolean;
  /** per part key */
  parts?: Record<string, boolean>;
  /** signed difference answer − expected, in the problem's unit */
  error?: number;
  mistake?: CalcMistake;
}
/** A generator in course/calc/*. Pure and deterministic: the same (seed, params) gives the same problem. */
export interface GeneratorDef {
  id: CalcGeneratorId;
  title: L10n;
  category: CalcCategory;
  /** also listed in the other category's drills (pressure altitude, wind components…) */
  alsoIn?: CalcCategory[];
  /** one line for the editor and the drill picker */
  summary: L10n;
  params?: CalcParamDef[];
  /** params arrive merged with the defaults; the registry adds generatorId, seed and params to the result */
  generate(rng: CalcRng, params: CalcParams): CalcProblemBody;
  check(problem: CalcProblem, response: CalcResponse): CalcVerdict;
}

/** A calc step / calc quiz. */
export interface CalcSpec {
  generatorId: CalcGeneratorId;
  params?: CalcParams;
  /** fixed by the CFI (everyone gets the same numbers); absent = new numbers on every attempt (seed recorded) */
  seed?: number;
  /** overrides the generator's tolerance (in the asked unit) */
  tolerance?: number;
  /** ask the answer in this unit (converted); default the generator's */
  unit?: CalcUnit;
  /** when the worked solution shows: after Check (default), only on request, or never (exam-style) */
  showSolution?: "onCheck" | "onRequest" | "never";
  /** show the rule of thumb and the exact formula with the solution (default both true) */
  showRuleOfThumb?: boolean;
  showFormula?: boolean;
  /** the stage: the generator's diagram / instrument (default), or none */
  stage?: "generator" | "none";
  /** allow "New numbers" after an attempt (default true unless seed is fixed) */
  retry?: boolean;
}
/** A drill: N random problems in a row, timed and scored for the student only. Practice: never ACS-graded. */
export interface DrillSpec {
  generatorIds: CalcGeneratorId[];
  /** per-generator params */
  params?: Partial<Record<CalcGeneratorId, CalcParams>>;
  count: number;
  timer?:
    | { mode: "stopwatch" }
    | { mode: "perProblem"; seconds: number }
    | { mode: "total"; seconds: number };
  /** fixed sequence (a class drill everyone takes with the same numbers); absent = new each run */
  seed?: number;
  /** after each problem (default) or at the end */
  feedback?: "each" | "end";
  practiceOnly: true;
}

// ---------------------------------------------------------------- local records (IndexedDB, per profile)
export interface Handoff {
  token: string;
  courseId: string;
  rev: number;
  stepId: string;
  target: FlyTarget;
  options: FlyOption[];
  criteria: Criterion[];
  brief?: L10n;
  returnUrl: string;
  created: string;
  consumed?: string;
  /** a 'calc' target: the problem's seed and params, so the cockpit poses the same numbers */
  calc?: { generatorId: CalcGeneratorId; seed: number; params: CalcParams };
}
export interface AttemptRecord {
  courseId: string;
  rev: number;
  stepId: string;
  profileId: string;
  at: string;
  secs: number;
  kind: "answer" | "try" | "fly" | "calc" | "drill" | "yourTurn";
  answer?: number | number[] | string;
  correct?: boolean;
  checks?: boolean[];
  goalMet?: boolean;
  skipped?: boolean;
  practiceGraded?: boolean;
  fly?: {
    token: string;
    passed: boolean;
    selfGrade: "nailed" | "close" | "notyet";
    criteria: { id: string; met: boolean; worst?: string; atS?: number }[];
    /** training record */
    historyId?: string;
    procResults?: unknown[];
  };
  calc?: {
    generatorId: CalcGeneratorId;
    seed: number;
    params: CalcParams;
    response: CalcResponse;
    verdict: CalcVerdict;
    solutionSteps: number;
  };
  drill?: {
    count: number;
    correct: number;
    totalS: number;
    items: {
      generatorId: CalcGeneratorId;
      seed: number;
      correct: boolean;
      secs: number;
      mistake?: CalcMistakeId;
    }[];
  };
  /** a YourTurn on a designed slide (block id) */
  yourTurn?: { block: string; result: YourTurnResult };
  cfiNote?: string;
}
export interface CourseProgress {
  courseId: string;
  rev: number;
  profileId: string;
  stepId: string;
  reveal: number;
  updated: string;
}

// ---------------------------------------------------------------- files, packs, links
/** .ifrcourse = gzip(JSON) (import also accepts plain JSON) */
export interface CourseFile {
  format: "ifr-course-file";
  version: 1;
  course: Course;
  assets: Record<AssetId, { mime: string; b64: string }>;
}
// club pack (procedureStore.ts ClubPack, version 1) gains, additively: courses?: CourseFile[]
// share link: academy.html#c=C1.<base64url(deflate-raw(JSON(Course without assets)))>   (≤ 8 KB, else "export a file")
// scene link: index.html?scene=S1.<base64url(deflate-raw(JSON(SimScene)))>              (≈1.2–1.6 KB, QR-able)

// ---------------------------------------------------------------- presenter ↔ projector (BroadcastChannel) and class (phase 2)
export type PresentMsg =
  | { t: "course"; id: string; rev: number; hash: string }
  | { t: "goto"; stepId: string; reveal: number }
  /** ≤10 Hz while live/clip */
  | { t: "stage"; pose: StagePose; av?: Partial<Avionics>; paused: boolean }
  | { t: "action"; action: PresenterAction }
  | { t: "clip"; op: "play" | "pause" | "seek"; at: number }
  | { t: "black"; on: boolean }
  /** the calc problem on screen (the projector regenerates it from the seed) and how far the solution is shown */
  | { t: "calc"; stepId: string; seed: number; solutionSteps: number }
  | { t: "bye" };
export interface StagePose {
  lat: number;
  lon: number;
  altFt: number;
  hdg: number;
  pitch: number;
  bank: number;
  ias: number;
  vs: number;
  trk: number;
  gs: number;
  turnRate: number;
}
export type ClassMsg =
  | PresentMsg
  | {
      t: "hello";
      role: "follower";
      nick?: string;
      has?: { id: string; rev: number; hash: string };
    }
  | { t: "mode"; m: "follow" | "yourTurn" | "free" }
  /** ≤1 Hz, on change */
  | {
      t: "progress";
      stepId: string;
      checks: boolean[];
      state: "working" | "done" | "help";
    }
  | { t: "poll"; stepId: string; open: boolean }
  | { t: "answer"; stepId: string; value: number | number[] }
  | { t: "peekAsk"; who: string }
  | { t: "peek"; pose: StagePose; optIn: true };
// companion (remoteTypes.ts Command union, additive): courseNext | coursePrev | courseReveal | courseGoto{stepId} | capture

// ---------------------------------------------------------------- calc diagrams (live, generated from numbers)
/** Rendered by course/calcDiagrams (package L). `drag` lists what the student may drag; the diagram re-solves. */
export type CalcDiagram = { drag?: string[] } &
  /** 60:1 — the track error triangle: departure point, intended course, actual track, distance off */
  (| {
        kind: "sixtyToOne";
        course: number;
        flownNm: number;
        offNm: number;
        toGoNm?: number;
      }
    /** wind triangle: TC / TAS / wind → WCA, TH, GS (drag: 'wind' | 'tas' | 'course') */
    | {
        kind: "windTriangle";
        course: number;
        tasKt: number;
        windDir: number;
        windKt: number;
      }
    /** descent / climb profile: altitudes, gradient or angle, ground speed, TOD and fixes */
    | {
        kind: "profile";
        fromFt: number;
        toFt: number;
        ftPerNm?: number;
        angleDeg?: number;
        gsKt?: number;
        distNm?: number;
        marks?: { distNm: number; altFt?: number; label: string }[];
      }
    /** turn: bank, TAS → rate and radius (standard-rate circle) */
    | { kind: "turn"; tasKt: number; bankDeg: number }
    /** DME arc or intercept lead: station, arc radius / course, lead radial or lead point */
    | {
        kind: "lead";
        mode: "arc" | "intercept";
        course: number;
        arcNm?: number;
        leadDeg?: number;
        leadNm?: number;
        tasKt?: number;
      }
    /** hold in wind: the racetrack, the drift, the outbound correction and timing */
    | {
        kind: "holdWind";
        inbound: number;
        turn: "L" | "R";
        windDir: number;
        windKt: number;
        tasKt: number;
        outboundS?: number;
      }
    /** TVMDC compass card: TC, WCA, variation, deviation as arrows on one rose */
    | {
        kind: "compass";
        tc: number;
        wca: number;
        variation: number;
        deviation: number;
      }
    /** runway and wind: head / cross components (clock-face rule overlay) */
    | {
        kind: "runwayWind";
        runwayHdg: number;
        windDir: number;
        windKt: number;
        gustKt?: number;
      }
    /** altimetry column: field elevation, QNH, OAT vs ISA → indicated, pressure, density, cold-corrected altitude */
    | {
        kind: "altimetry";
        elevFt: number;
        qnhInHg: number;
        oatC: number;
        altFt?: number;
      }
    /** ADF dial: magnetic heading + relative bearing → magnetic bearing, QDM / QDR */
    | { kind: "adf"; mh: number; rb: number }
    /** VOR: station, radial, OBS, TO / FROM flag */
    | { kind: "vor"; radial: number; obs: number }
    /** weight and balance: loading points on the CG envelope (C172S-class table) */
    | {
        kind: "cgEnvelope";
        table: "c172s";
        points: { weightLb: number; momentLbIn: number; label: L10n }[];
      }
    /** VDP on the final segment: MDA, TDZE, 3° path, distance from the threshold */
    | {
        kind: "vdp";
        mdaFt: number;
        tdzeFt: number;
        vdpNm: number;
        mapNm?: number;
      }
  );

// ---------------------------------------------------------------- nesting (briefings, cues, links between steps)
export type CourseShape = "course" | "lesson" | "briefing";
/** Guidance levels of a sim-first lesson (briefing DESIGN §3.4): which pages and cues show. */
export type GuidanceLevel = "guided" | "coached" | "solo" | "checkride";
/** What a briefing prepares for (shown on its cover; the "Fly it" at its end opens this). */
export interface BriefingFor {
  exerciseId?: string;
  circuitId?: string;
  procId?: string;
  /** a Fly-it step of a course */
  step?: StepRef;
}
/** A briefing is itself a mini-course: a Course with shape 'briefing' (same builder, same player). */
export type Briefing = Course & { shape: "briefing"; briefingFor?: BriefingFor };
/** A step by id: in the same course (`ref`), or in another course of the library (`course` + `step`). */
export type StepRef = { ref: string } | { course: string; step: string };
/**
 * A step opened over the flight (an in-flight cue's `{ k: 'slide' }`, a link block, a "Re-read" in the debrief).
 * Its stage is frozen on the current flight unless the step has its own scene; the flight resumes on close.
 */
export interface OpenStep {
  step: Step | StepRef;
  /** freeze the sim while it is open (never below 500 ft AGL on final: the cue rules decide) */
  pause?: "freeze" | false;
  /** how it closes: a tap (default), when its goal is met, or after maxS */
  close?: "tap" | "goalMet" | { maxS: number };
}

// ---------------------------------------------------------------- designed slides (the canvas)
// A designed slide is a 16:9 canvas of free blocks on a snap grid, in logical units (1920 × 1080), scaled to fit
// the player, the projector, the editor and the thumbnails. Restrained by construction: a few type styles, theme
// colour tokens (no free gradients, glows or shadows), 3–4 themes. Blocks can be live instruments and a sim
// viewport, driven by the step's scenes: every instrument / simViewport block that names the same scene shares
// ONE stage Sim (the HSI and the CDI on a slide move together). At most one live 3D view per page.

/** Canvas logical size: 16:9 at 1920 × 1080 (v1 has one size). */
export interface SlideSize {
  w: 1920;
  h: 1080;
}
export interface SlideCanvas {
  size: SlideSize;
  /** snap grid in logical units (default 24: 80 × 45 cells); blocks snap to it and to the alignment guides */
  grid?: number;
  /** legacy: a per-slide theme. Ignored when drawn (one theme per course, SPEC slides v2 §4); kept so stored
   *  slides still load */
  theme?: ThemeId;
  /** the layout template the slide was made from (the editor's "Reset layout" goes back to it) */
  layout?: SlideLayoutId;
  background?: { color?: ColorToken; image?: ImageSource; crop?: Rect; dim?: number /* 0..0.8 */ };
  /** paint order = z, then array order; reading order for screen readers = `readOrder`, then top-left first */
  blocks: SlideBlock[];
  /** the scene that instrument / simViewport blocks use when they name none (Course.scenes id) */
  scene?: string;
  /** the course's logo corner: hide it on this slide (full-bleed photo) */
  hideBrand?: boolean;
}
/** Layout templates: beautiful defaults so a CFI's first slide already looks professional. */
export type SlideLayoutId =
  // the design-system archetypes (SPEC slides v2 §8): exact frames on the 12-column grid
  | "cover" // A1 cover: display title, subtitle, lead, meta; a hero diagram or instrument on the right
  | "bigNumber" // A3 big number / rule of thumb, with an optional visual
  | "heroDiagram" // A4 a diagram on the left, three bullets in its colours on the right
  | "formula" // A8 diagram + formula + derivation, one line per reveal
  | "quiz" // A9 a question on the slide: context, tiles or rows, feedback
  | "recap" // A10 three numbers and three checks
  | "ready" // A11 "Ready to fly": objectives, standards, a tip (closes every lesson briefing)
  // earlier templates (kept: stored slides name them)
  | "title" // title + subtitle + school line
  | "section" // section divider
  | "twoColumn"
  | "instrumentNotes" // a live instrument left, numbered notes right
  | "compare" // before / after (two instruments or two images)
  | "stepByStep" // numbered steps with markers, revealed one by one
  | "fullBleed" // full-bleed photo with a caption band
  | "checklist" // checklist rows ticked by the sim (your turn)
  | "yourTurn" // the instrument or the sim viewport large, the task and the live rows beside it
  | "calc" // a calculation with its diagram
  | "blank";

/** A block's box in canvas logical units; `rot` in degrees clockwise about the centre. */
export interface BlockFrame {
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
  /** paint order (higher on top) */
  z: number;
  /** locked blocks cannot be selected by a tap on the canvas (only from the layers list) */
  locked?: boolean;
  /** blocks sharing a group id move, scale and duplicate together */
  group?: string;
}
/** When a block appears: with the slide (absent), or at a reveal position (Next / presenter click), or on an event. */
export interface BlockReveal {
  /** 1, 2, 3… — the n-th reveal of the slide (blocks with the same order appear together) */
  order: number;
  /** what triggers it: a click / Next (default), the quiz answered, the step goal met, goal check i met, the
   *  presenter, or the end of a YourTurn on this slide */
  when?:
    | "click"
    | "answered"
    | "goalMet"
    | `afterCheck:${number}`
    | "presenter"
    | "yourTurnDone";
  /** fade (default) or none (projector, reduced motion) */
  effect?: "fade" | "none";
}
/** A tap on a block in the player. */
export type BlockAction =
  | { k: "next" }
  | { k: "goto"; step: StepRef }
  | { k: "open"; open: OpenStep }
  | { k: "reveal"; order: number }
  | { k: "yourTurn"; block: string }
  | { k: "playClip"; block: string }
  | { k: "url"; href: string };
export interface BlockBase {
  id: string;
  frame: BlockFrame;
  reveal?: BlockReveal;
  /** indices into the step's goal.all: the block ticks / lights when those checks are met (live) */
  goal?: number[];
  /** explain-region / annotation id it points at (callouts, markers, arrows follow it on resize) */
  anchor?: string;
  onTap?: BlockAction;
  /** accessible name; required for images, instruments and diagrams (validate.ts checks it) */
  alt?: L10n;
  readOrder?: number;
  /** editor only: hidden while editing (never in the player) */
  hiddenInEditor?: boolean;
  /** shown only to the presenter (console), never on the projector or to the student */
  presenterOnly?: boolean;
}

/** Type styles (the only text sizes a theme defines). */
export type TextStyle =
  | "display" // cover title
  | "title"
  | "subtitle"
  | "heading"
  | "body"
  | "caption"
  | "label" // small caps label, e.g. "KEY TO SUCCESS"
  | "number" // a big figure (318 ft/NM)
  | "quote"
  | "mono" // legacy: drawn as a formula (no monospace on slides)
  // design system v2 roles (SPEC §2); the older names above stay valid aliases
  | "lead" // = subtitle: 40 px, ink-2
  | "small" // = caption: 28 px, mute
  | "eyebrow" // = label: 24 px caps, accent
  | "foot" // footer line: source, 24 px, mute
  | "formula"; // a formula: italic variables, real operators, stacked fractions (markup in text.ts)
/** Theme colour tokens, or an explicit #rrggbb (the editor offers tokens first). Aviation colours follow the
 *  cockpit convention: magenta = GPS / active leg, cyan = selected / bugs, green = NAV / VOR, amber = caution. */
export type ColorToken =
  | "bg"
  | "surface"
  | "line"
  | "text"
  | "muted"
  | "accent"
  | "brand"
  | "ok"
  | "warn"
  | "danger"
  | "magenta"
  | "cyan"
  | "green"
  | "amber"
  | "white"
  // design system v2 tokens (SPEC §4); the older names above map onto them
  | "ink2" // body text
  | "rule" // hairlines
  | "ruleStrong" // sector circles, dimension ticks
  | "raise" // quiz options and player chrome only
  | "path" // magenta: what the aircraft follows
  | "sel" // cyan: selected value, correction
  | "nav" // green: nav source, OK, correct
  | "key" // amber: the number to remember
  | "stop" // red: limit, wrong
  | "accentInk" // text on an accent fill
  | `#${string}`;
/** A shipped library asset (aviation icons, diagrams, sample photos): `icon:aircraft-top`, `photo:c172-panel`… */
export type LibraryAssetId = `${"icon" | "diagram" | "photo" | "shape" | "logo"}:${string}`;
/** An image comes from the course's own assets (IndexedDB / file) or from the shipped library. */
export type ImageSource = { asset: AssetId } | { lib: LibraryAssetId };
/** A shipped asset as the library lists it (course/canvas/library.ts; files in public/library). */
export interface LibraryAsset {
  id: LibraryAssetId;
  title: L10n;
  kind: "icon" | "diagram" | "photo" | "shape" | "logo";
  /** public path (e.g. 'library/icons/aircraft-top.svg') */
  src: string;
  w: number;
  h: number;
  tags: string[];
  /** photo credit / licence (shown in the attribution line) */
  attribution?: string;
  /** icons and shapes take a colour token */
  recolor?: boolean;
}

/** Instruments a block can show (any size): full displays, crops of them, or single gauges. */
export type InstrumentGauge =
  | SteamGaugeKind // asi, ai, alt, tc, hsi, vsi, cdi, rmi (steam.ts drawSteamGauge)
  | "pfd.attitude"
  | "pfd.hsi"
  | "pfd.tapes"
  | "radios" // the radio stack (COM / NAV / ADF / XPDR)
  | "mfd.map";
export type InstrumentView =
  | { kind: "pfd" | "mfd" | "six" | "stack" | "airlinerPfd" | "nd"; crop?: CropRef }
  | { kind: "gauge"; gauge: InstrumentGauge };

export type SlideBlock = BlockBase &
  (
    | {
        kind: "text";
        style: TextStyle;
        /** same inline syntax as the reader: **b** *i* lists, [[label|annotationId]] */
        text: L10n;
        align?: "left" | "center" | "right";
        valign?: "top" | "middle" | "bottom";
        color?: ColorToken;
        /** a live value in the text: `{{value}}` is replaced (a calc answer, a YourTurn result, a readout) */
        bind?: SlideBinding;
      }
    | {
        kind: "image";
        image: ImageSource;
        /** the visible part (0..1 of the image); the frame's aspect ratio is kept */
        crop?: Rect;
        fit?: "cover" | "contain";
        alt: L10n;
        caption?: L10n;
        attribution?: string;
        radius?: 0 | 4 | 8;
      }
    | {
        kind: "shape";
        shape: "rect" | "roundRect" | "ellipse" | "line" | "triangle";
        fill?: ColorToken | null;
        stroke?: ColorToken | null;
        strokeW?: 1 | 2 | 3 | 4 | 6;
        dash?: boolean;
        opacity?: number;
      }
    | {
        kind: "arrow";
        /** endpoints in canvas logical units (the frame is their bounding box) */
        from: Pt;
        to: Pt;
        /** bend: 0 straight, ± a fraction of the length */
        curve?: number;
        heads?: "end" | "both" | "none";
        color?: ColorToken;
        strokeW?: 2 | 3 | 4 | 6;
      }
    | {
        kind: "callout";
        /** a number in a circle at the start of the text (matches a marker) */
        n?: number;
        text: L10n;
        /** the leader's end, canvas logical units (on an instrument block: follows `anchor` when set) */
        target?: Pt;
        tone?: "plain" | "accent" | "warn";
      }
    | { kind: "marker"; n: number; shape?: "circle" | "square"; color?: ColorToken }
    | {
        kind: "diagram";
        /** the diagram (hold, profile, wind triangle, plate crop, map, airspace sketch, calc diagrams) */
        d?: DiagramSpec;
        /** or: the diagram of the problem the student solved in that calc step (same seed, same numbers) */
        fromCalc?: string;
        asset?: AssetId;
        /** what the student may drag (CalcDiagram.drag); none = static */
        interactive?: boolean;
        caption?: L10n;
      }
    | {
        kind: "instrument";
        view: InstrumentView;
        /** Course.scenes id; default SlideCanvas.scene; or the stage hint of a calc step's problem */
        scene?: string;
        fromCalc?: string;
        /** frozen (default), live (the scene flies), or a clip played in the instrument */
        mode?: "frozen" | "live" | "clip";
        clip?: string;
        /** the knobs the student may turn on the slide (everything else shows "Locked by this step") */
        controls?: StageControl[];
        /** annotations in the instrument's logical 1024 × 768 coordinates (pane 0) */
        annotations?: Annotation[];
        covers?: ("ai" | "dg")[];
        failures?: Partial<Failures>;
        /** draw the bezel / screen frame (default true) */
        bezel?: boolean;
        /** hand control to the student on the slide's instruments */
        yourTurn?: YourTurn;
      }
    | {
        kind: "simViewport";
        /** Course.scenes id; default SlideCanvas.scene */
        scene?: string;
        view: "cockpit" | "outside" | "panel";
        /** a demo clip played in the box (≤ 30 s is the rule of thumb) */
        clip?: string;
        /** the still shown before play (Outside3D.renderStill) */
        poster?: AssetId;
        autoplay?: boolean;
        /** "Your turn": opens the full simulator from the scene (handoff) and comes back with the result */
        yourTurn?: YourTurn;
      }
    | { kind: "quiz"; quiz: Quiz }
    | {
        kind: "calc";
        calc: CalcSpec;
        /** what this block shows (a slide can split prompt and diagram into two blocks) */
        show?: ("prompt" | "givens" | "answer" | "solution" | "formula")[];
      }
    | {
        kind: "checklist";
        /** "Do this" rows; `check` = index into the step's (or the YourTurn's) goal checks, ticked live */
        rows: { text: L10n; check?: number; readout?: ReadoutId }[];
        title?: L10n;
      }
  );
export type SlideBlockKind = SlideBlock["kind"];

/** A live value in a text block. */
export type SlideBinding =
  | { k: "calc"; step: string; field: "answer" | "exact" | "given"; key?: string; digits?: number }
  | { k: "yourTurn"; step?: string; block: string; field: "met" | "secs" | "worst"; key?: string }
  | { k: "readout"; readout: ReadoutId; scene?: string };

/**
 * Hand control to the student: on the slide's instruments (`where: 'slide'`, the stage Sim with the listed
 * controls) or in the full simulator (`where: 'sim'`, a handoff from the scene like Fly it, back to this slide).
 * Goals are checked live; the result comes back (YourTurnResult) and later blocks can show it.
 * Practice unless goal.graded (never ACS-graded when an assist is on, SPEC §4.3).
 */
export interface YourTurn {
  where: "slide" | "sim";
  prompt: L10n;
  /** default: the block's scene */
  scene?: string;
  controls?: StageControl[];
  assist?: StageCue["assist"];
  goal: StepGoal;
  /** sim: the run ends when these hold, or after durationS (default: goal met, or the student taps Done) */
  endWhen?: GoalCheck[];
  durationS?: number;
  options?: FlyOption[];
  hint?: L10n;
  /** clip id: Show me */
  showMe?: string;
  /** after the run: stay on this slide with the result (default) or go to the next step */
  returnTo?: "thisStep" | "nextStep";
}
export interface YourTurnResult {
  met: boolean;
  checks: boolean[];
  secs: number;
  /** worst value per criterion / check index (display text, e.g. '1.4 dots') */
  worst?: Record<string, string>;
  /** where the aircraft ended (a next slide can pose from it) */
  pose?: StagePose;
  /** sim runs: the handoff token and the training-record id */
  token?: string;
  historyId?: string;
}

// ---------------------------------------------------------------- themes
/** Two themes, one per course (SPEC slides v2 §4): 'cockpit' (dark) and 'classroom' (light). The older ids stay
 *  valid in stored courses and load as their nearest: 'projector' = classroom + the bright-projector boost,
 *  'brand' = classroom with the school's colour as the accent. */
export type ThemeId = "cockpit" | "classroom" | "projector" | "brand";
export interface SchoolBrand {
  name: string;
  /** #rrggbb; the renderer checks contrast and darkens it for text when needed */
  color: string;
  logo?: ImageSource;
  logoCorner?: "tl" | "tr" | "bl" | "br";
}
export interface TypeStyleDef {
  font: "display" | "body" | "mono";
  /** italic (the formula style sets its variables in italic; the role itself is roman) */
  italic?: boolean;
  /** logical px on the 1920 × 1080 canvas */
  size: number;
  weight: 400 | 500 | 600 | 700;
  lineHeight: number;
  tracking?: number;
  upper?: boolean;
  color: ColorToken;
}
/** A theme definition (course/canvas/themes.ts holds the four). */
export interface SlideTheme {
  id: ThemeId;
  name: L10n;
  dark: boolean;
  colors: Record<Exclude<ColorToken, `#${string}`>, string>;
  fonts: { display: string; body: string; mono: string };
  styles: Record<TextStyle, TypeStyleDef>;
  /** instrument blocks: bezel colour and the screen corner radius */
  bezel: { color: string; radius: number };
}

/** Airspace cross-section for the `airspace` diagram (heights in ft; 'SFC' = 0; FL as ft). */
export interface AirspaceSketch {
  /** horizontal extent in NM, centred on the airport */
  widthNm: number;
  topFt: number;
  layers: {
    cls: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "TMA" | "CTR" | "RMZ" | "TMZ";
    floorFt: number;
    ceilFt: number;
    /** horizontal span in NM from the centre [from, to] (negative = left) */
    span: [number, number];
    label?: L10n;
  }[];
  /** an aircraft drawn at this altitude and distance */
  aircraft?: { altFt: number; distNm: number };
  /** VMC minima tags per class (author text) */
  minima?: { cls: string; text: L10n }[];
}
