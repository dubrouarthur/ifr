// Exercise result: the data contract between the run (LessonRun + recorder + observer), the pure report builder
// (report.ts) and the sheet (sheet.ts). Shapes follow scratchpad debrief SPEC §4.2 (a subset: what an exercise
// result needs today). No DOM here.

export type Outcome = "met" | "not-met" | "ungraded";
export type EndedBy = "complete" | "user" | "crash" | "drill-end";
export type Lang = "en" | "fr";

/** what kind of deviation a step's check() reported (parsed from its text) */
export type DevKind =
  | "alt"
  | "hdg"
  | "ias"
  | "bank"
  | "vs"
  | "track"
  | "constraint"
  | "control"
  | "other";

/** one continuous time out of tolerance (lesson time, s) */
export interface Span {
  step: number;
  kind: DevKind;
  t0: number;
  t1: number;
  /** the check's text at the worst moment ("Altitude +180 ft") */
  text: string;
  /** signed measured deviation at the worst moment (ft, °, kt, dots, fpm…), when the text carries one */
  worst: number | null;
  tWorst: number;
  /** still out of tolerance when the final dive before a crash began (cut there: the crash owns the rest) */
  intoDive?: boolean;
}

/** a deviation measured inside the tolerance (so a met standard still shows its % of limit) */
export interface Measure {
  /** largest absolute deviation seen */
  maxAbs: number;
  /** signed extremes (gauge markers) */
  min: number;
  max: number;
  t: number;
  /** the target the deviation is measured from (4000 ft, heading 090, 100 KIAS) */
  target: number;
  step: number;
}

/** 1–2 Hz trace (lesson time) */
export interface TracePoint {
  t: number;
  alt: number;
  ias: number;
  hdg: number;
  vs: number;
  lat: number;
  lon: number;
  latDots?: number | null;
  vertDots?: number | null;
}

export interface RunEvent {
  t: number;
  kind: "info" | "good" | "warn" | "bad";
  text: string;
  fr?: string;
}

export interface HoldInput {
  fix: { ident: string; lat: number; lon: number };
  inbound: number;
  turn: "L" | "R";
  legMin: number;
  altFt: number;
  /** lesson time of the fix crossing (null: not reached) */
  crossedAt: number | null;
  arrivalCourse: number;
  correctEntry: string | null;
  flownEntry: string | null;
  okEntries: string[];
  inboundTimes: number[];
  outboundTimes: number[];
  laps: number;
  maxAltDev: number;
  altOutSec: number;
  maxNonHoldingSide: number;
  maxHoldingSide: number;
}

export interface AcsInputItem {
  task: string;
  standard: string;
  actual: string;
  result: "PASS" | "FAIL" | "N/A";
}

/** everything the report builder reads: a plain object (fixtures in tests, LessonRun + observer in the app) */
export interface ResultInput {
  lang: Lang;
  ex: {
    id: string;
    title: string;
    stage: string;
    allowAp: boolean;
    minutes: number;
    plate?: string;
  };
  /** stage title without the "Stage n —" prefix */
  stageTitle?: string;
  /** position in the learning path ("lesson 2 of 10") */
  pathPos?: { n: number; of: number; title: string };
  endedBy: EndedBy;
  /** the engine's verdict (authoritative for met / not met) */
  passed: boolean;
  reason: string;
  durationSec: number;
  allowanceSec: number;
  steps: {
    text: string;
    done: boolean;
    violationSec: number;
    worst: string | null;
    limitSec?: number;
    t0?: number;
    t1?: number;
  }[];
  /** index of the step flying when the run stopped */
  idx: number;
  spans: Span[];
  measured: Partial<Record<"alt" | "hdg" | "ias", Measure>>;
  trace: TracePoint[];
  events: RunEvent[];
  hold?: HoldInput;
  acs?: { result: string; items: AcsInputItem[] };
  crashed?: string | null;
  handFlown: boolean;
  checkride: boolean;
  /** attempt number of this exercise (1 = first) and when it ended (ms) */
  attempt: { n: number; at: number };
  /** the course the exercise was launched from */
  course?: string;
  /** fixes of the procedure (where lines: "2.2 NM W of MARLO") */
  fixes?: { ident: string; lat: number; lon: number }[];
  /** help logged outside the recorder events (hints opened, coach cues) */
  help?: HelpUse[];
  /** weather of the attempt (eyebrow) */
  wx?: { ceilingFt: number; windDir: number; windKt: number };
  /** the exercise's own standards, as written in the curriculum (ungraded: what would have been graded) */
  exStandards?: string[];
}

// ---------------------------------------------------------------- report

export interface Gauge {
  /** axis range */
  min: number;
  max: number;
  /** tolerance band */
  lo: number;
  hi: number;
  zero?: number;
  /** measured values (markers) */
  v: number[];
}

export type StdVerdict = "met" | "not-met" | "not-reached";

export interface StandardResult {
  id: string;
  /** skill key (records, practise next) */
  skill: string;
  label: string;
  /** the standard in words, with % of limit ("Min 2,400 −100 · 173 % of limit") */
  wording: string;
  /** short "in words" line of the met list ("±100 ft of 4,000") */
  short: string;
  verdict: StdVerdict;
  /** shown value and unit ("2,227" "ft") */
  value: string;
  unit: string;
  /** ratio of the limit used (1.73 = 173 %); null for pass / fail standards */
  pct: number | null;
  gauge?: Gauge;
  safety?: boolean;
  findingN?: number;
  /** met, but the deviation went past the limit for less than the exercise's time allowance (amber, never
   *  "within standards"): the ACS tolerance itself was exceeded */
  exceeded?: boolean;
}

export type FindingGroup = "safety" | "not-met" | "procedure" | "watch";

export interface Finding {
  n: number;
  group: FindingGroup;
  standardId?: string;
  skill: string;
  t0: number;
  t1: number;
  tWorst: number;
  title: string;
  /** "4:41 – 5:25 · step 2 · 1.6 NM NE of PA · 44 s out of tolerance" (without the time span: `span`) */
  where: string;
  /** the standard in words (the grey chip) and its sentence */
  stdChip: string;
  stdText: string;
  whatHappened: string;
  why: string;
  next: string;
  pct?: number;
  /** the measured value at the worst moment, in the unit of the trace (altitude: ft) */
  value?: number;
}

export interface HelpUse {
  t: number;
  kind: "setup" | "hint" | "cue" | "ap" | "instructor";
  text: string;
}

export interface Phase {
  t0: number;
  t1: number;
  label: string;
  ghost?: boolean;
}

export interface TimelineMark {
  t: number;
  t1?: number;
  n?: number;
  label: string;
  kind: "bad" | "warn" | "good" | "info";
}

export interface StepRow {
  text: string;
  state: "done" | "at" | "not-reached";
  t0?: number;
  t1?: number;
  note?: string;
}

export interface Tile {
  /** 'std': a standard; 'info': an ungraded fact (Result —, Flown, Steps) */
  kind: "std" | "info";
  label: string;
  verdict?: StdVerdict;
  /** met within the time allowance, but past the limit (StandardResult.exceeded) */
  exceeded?: boolean;
  value: string;
  unit?: string;
  sub: string;
  gauge?: Gauge;
}

export interface ResultReport {
  outcome: Outcome;
  endedBy: EndedBy;
  /** "ACS IR.IV.A instrument flight" */
  task: string;
  /** the standard the task is graded against ("FAA ACS IR.III.B"), shown as a reference, never as the title */
  taskRef: string;
  eyebrow: string;
  headline: string;
  /** the sub line after "N of M standards met" */
  summary: string;
  standards: StandardResult[];
  metCount: number;
  gradedCount: number;
  tiles: Tile[];
  findings: Finding[];
  help: HelpUse[];
  phases: Phase[];
  marks: {
    findings: TimelineMark[];
    events: TimelineMark[];
    help: TimelineMark[];
  };
  trace: {
    param: "alt";
    points: { t: number; v: number }[];
    ideal?: number;
    band?: [number, number];
    range: [number, number];
    unit: string;
  };
  steps: StepRow[];
  /** ungraded: the standards that would have applied */
  wouldGrade: string[];
  flown: { sec: number; expectedSec: number };
  /** total length of the timeline axis (flown, or the expected length when ended early) */
  timelineSec: number;
  /** "met with help" (counts as met, shown as such) */
  withHelp: boolean;
  /** a resume is possible (ended by the student, not crashed) */
  resumable: boolean;
}

// ---------------------------------------------------------------- practise next

export type NextKind =
  | "resume"
  | "restart"
  | "retry"
  | "next-lesson"
  | "brief"
  | "drill"
  | "lesson";

export interface NextItem {
  kind: NextKind;
  label: string;
  sub: string;
  /** the button text ("Fly", "Brief", "Start", "Open") */
  action: string;
  /** exercise id for next-lesson / lesson */
  ref?: string;
  primary: boolean;
}

export interface NextPlan {
  why: { lead: string; text: string };
  items: NextItem[];
}

export type StopReason = "time" | "lost" | "restart-entry" | "broken";
