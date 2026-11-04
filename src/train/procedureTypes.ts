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
  | "manual"; // student taps Done / says it; the instructor may confirm

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
  }[];
  mode: DrillMode;
}

export type { Switches };
