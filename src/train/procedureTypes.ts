// CONTRACT (shared by the procedures engine, the club hub / procedure editor, the flight builder drills and the
// in-flight runner): emergency & abnormal procedures that a flying club can customise, and how a drill tests them.
// Implementation: src/train/procedures.ts (runner + grading), procedureChecks.ts (check catalogue),
// procedureLibrary.ts (default FR/EN library), procedureStore.ts (club library, import/export/share).
import type { FailureKey, Switches } from "../sim/systemsTypes";

export type Lang = "fr" | "en";

export type ProcCategory =
  | "engine"
  | "fire"
  | "electrical"
  | "instruments"
  | "avionics"
  | "comms"
  | "flight"
  | "other";

/** A machine-checkable condition for a checklist item, chosen from the catalogue in procedureChecks.ts.
 *  `id` names the catalogue entry, `p` its parameters (e.g. { id: 'switch', p: { key: 'fuelSelector', value: 'BOTH' } }).
 *  Items without a check are confirmed by the student ("Done" / callout) or by the instructor. */
export interface CheckRef {
  id: CheckId;
  p?: Record<string, string | number | boolean>;
}

export type CheckId =
  | "switch" // p.key: keyof Switches, p.value (boolean | string | number); mixture: p.op '<=' | '>='
  | "throttle" // p.op '<=' | '>=', p.value 0..1
  | "flaps" // p.value detent 0..3
  | "ias" // p.min, p.max (KIAS), p.holdS seconds to hold inside the band (graded as flight-path control)
  | "pitchAtt" // p.min, p.max (deg)
  | "bankMax" // p.max (deg)
  | "altBand" // p.min, p.max (ft)
  | "xpdr" // p.code '7700' | '7600' | '7500' ...
  | "cdi" // p.value 'GPS' | 'NAV1' | 'NAV2'
  | "ap" // p.engaged boolean
  | "heading" // p.value deg, p.tol deg
  | "directTo" // p.ident: the GPS is navigating direct to that fix / nearest airport (p.ident '*nearest')
  | "timer" // the chronometer is running
  | "radio" // p.freq: COM1 active or standby tuned (121.5 etc.)
  | "landed" // aircraft on the ground, stopped, no crash (outcome)
  | "manual" // student taps Done / says it; the instructor may confirm
  // additive (procedures-engine):
  | "engineRunning"; // p.value boolean (default true): the engine is (not) running — restart succeeded / follow-ups

export interface ProcItem {
  id: string;
  /** challenge — response, e.g. "Mixture — IDLE CUT-OFF" / "Mélange — ÉTOUFFOIR" */
  text: string;
  /** memory item: must be done from memory, before opening the checklist, within `withinS` */
  memory: boolean;
  check?: CheckRef;
  /** time limit after the failure (memory items) or after the previous item (s); undefined = no limit */
  withinS?: number;
  /** optional item (graded as a bonus, never a fail) */
  optional?: boolean;
  /** one-line why / tip shown in training mode and in the debrief */
  note?: string;
  /** additive (procedures-engine): safety-critical item — missed or late => FAIL. Default: a memory item with a
   *  time limit is safety-critical; set false to opt out, true to make any item critical. */
  safety?: boolean;
}

export interface Procedure {
  id: string;
  title: string;
  category: ProcCategory;
  lang: Lang;
  /** failures this procedure answers (used to suggest it in the builder and to start it automatically) */
  failures: FailureKey[];
  /** aircraft or club the text belongs to, e.g. 'C172S', 'DR400 club F-GXXX' */
  aircraft: string;
  /** items must be done in order (memory items always are) */
  ordered: boolean;
  items: ProcItem[];
  /** flight-path targets held during the procedure, e.g. best glide 68 KIAS ±5 */
  targets?: { iasKt?: [number, number]; maxBankDeg?: number };
  /** provenance: 'library' (paraphrased from the POH / regulations, not a substitute for it) or 'club' */
  source: "library" | "club";
  /** reference shown to the student, e.g. 'POH section 3', 'SERA.14083', 'Club SOP 2026' */
  ref?: string;
  /** library procedure this one was customised from */
  basedOn?: string;
  updated?: string;
  // ---- additive (procedures-engine), all optional
  /** 'Training aid — the aircraft POH/AFM and your club procedures prevail' (library procedures always carry it) */
  disclaimer?: string;
  /** one-line summary for library cards and the builder's procedure picker */
  summary?: string;
  /** when this procedure applies to its failures (several procedures may list the same failure: the drill session
   *  picks the first one that applies), e.g. EFATO { aglFt: [0, 1000] }, take-off roll { onGround: true } */
  when?: { aglFt?: [number, number]; onGround?: boolean };
  /** follow-up procedure started by the drill session when this one is completed (or `afterS` seconds after the
   *  failure) and `unless` is still false, e.g. restart → forced landing unless the engine runs again.
   *  `procedure` is a library base id ('c172.forcedLanding') or a full id. */
  then?: { procedure: string; unless?: CheckRef; afterS?: number };
}

/** How a drill is flown: training shows the checklist and live ticks; test hides everything until the end. */
export type DrillMode = "training" | "test";

/** A failure injected by a scenario, and the procedure the student is expected to run. Extends the builder's
 *  CircuitFailure: `trigger` adds 'altAgl' (at a height above ground, climbing or descending), 'random' (once in
 *  the window [at, at + window] minutes) and 'instructor' (only when the instructor fires it). */
export interface DrillFailureSpec {
  key: FailureKey;
  trigger: "time" | "leg" | "fix" | "altAgl" | "random" | "instructor";
  at: number;
  window?: number;
  fix?: string;
  /** altAgl: fires when climbing (default) or descending through `at` ft AGL */
  dir?: "climb" | "descent";
  /** procedure id expected (default: the first library/club procedure that lists this failure) */
  expect?: string;
}

export interface ItemResult {
  id: string;
  done: boolean;
  /** seconds after the failure */
  atS: number | null;
  inOrder: boolean;
  late: boolean;
  /** done before the checklist was opened (memory items) */
  fromMemory: boolean;
  // ---- additive (procedures-engine), always filled by the runner
  text?: string;
  memory?: boolean;
  optional?: boolean;
  safety?: boolean;
  /** how the item was credited: the check became true ('auto'), it was already right and the pilot moved on
   *  ('verified'), or it was confirmed by the student / the instructor */
  by?: "auto" | "verified" | "student" | "instructor";
  /** time limit (s) and how late the item was (s), when it had a limit */
  limitS?: number;
  lateByS?: number;
}

export interface ProcedureResult {
  procedureId: string;
  title: string;
  failure: FailureKey;
  failedAtS: number;
  /** first pilot action after the failure (any control or switch input), s */
  reactionS: number | null;
  items: ItemResult[];
  /** flight-path control during the procedure */
  path: { iasBandPct: number | null; maxBankDeg: number; altLostFt: number };
  outcome: "completed" | "incomplete" | "crashed" | "landed";
  score: number; // 0..100
  verdict: "PASS" | "FAIL";
  /** plain-language debrief lines, the first one is the most important to fix */
  notes: string[];
  // ---- additive (procedures-engine), always filled by the runner
  lang?: Lang;
  mode?: DrillMode;
  /** when the checklist was opened (s after the failure), null if never */
  checklistOpenedS?: number | null;
  /** points per component (items / flight path / reaction), summing to `score` before caps */
  breakdown?: { items: number; path: number; reaction: number };
  /** IAS band and bank limit the flight path was graded against */
  targets?: { iasKt?: [number, number]; maxBankDeg?: number };
  /** follow-up procedure (e.g. forced landing after a failed restart): id of the procedure it followed. The reaction
   *  time was graded on that one, not here. */
  followUpOf?: string;
  /** test mode with no instructor confirming callouts: Done (callout) items were graded as checklist items only
   *  (never 'from memory', never safety-critical), since nobody could hear them */
  soloTest?: boolean;
}

/** Live state the in-flight panel and the instructor companion show. */
export interface ProcedureRunState {
  procedureId: string;
  title: string;
  failure: FailureKey;
  elapsedS: number;
  checklistOpen: boolean;
  items: {
    id: string;
    text: string;
    memory: boolean;
    done: boolean;
    late: boolean;
    due: number | null;
    // ---- additive (procedures-engine), always filled
    /** confirmed with a Done button (no machine check) */
    manual?: boolean;
    optional?: boolean;
    note?: string;
    /** completion time (s after the failure) */
    atS?: number | null;
    /** the control was already in the required position at the failure: ticked ('verified') when the pilot moves
     *  on to the next item — the panel may show it as 'check' rather than 'to do' */
    ready?: boolean;
  }[];
  mode: DrillMode;
  // ---- additive (procedures-engine), always filled
  lang?: Lang;
  ref?: string;
  disclaimer?: string;
  /** the runner stopped (completed, landed, crashed, superseded by a follow-up or finished by the lesson) */
  finished?: boolean;
}

export type { Switches };
