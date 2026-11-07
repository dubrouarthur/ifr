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
  | "engineRunning" // p.value boolean (default true): the engine is (not) running — restart succeeded / follow-ups
  | "annunciator" // p.name (e.g. 'LOW VOLTS'), p.lit boolean (default false): the annunciation is (not) lit
  | "brake"; // p.min 0..1 (default 0.8): the wheel brakes are applied

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
  /** additive (emergency content): the item exists only in these cockpits, e.g. 'STBY BATT — OFF' on the G1000
   *  (C172S NAV III POH). The drill runner drops it in any other cockpit (procedureForCockpit). */
  cockpit?: ProcCockpit[];
  /** additive: the wording in one cockpit when it differs (classic panel 'Avionics master' vs G1000 'AVIONICS BUS
   *  1'); procedureForCockpit swaps it in */
  textFor?: Partial<Record<ProcCockpit, string>>;
}

/** instrument panel a procedure item or variant is written for */
export type ProcCockpit = "g1000" | "steam" | "airliner";
/** whose rules apply where the aircraft flies: 'faa' (14 CFR, AIM — US airspace) or 'icao' (ICAO Annex 2 /
 *  EASA SERA — Europe and most of the world) */
export type ProcRegion = "faa" | "icao";

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
  when?: {
    aglFt?: [number, number];
    onGround?: boolean;
    /** the cockpits this variant is written for (G1000 LOW VOLTS vs the classic-panel one) */
    cockpit?: ProcCockpit[];
    /** the rules of the airspace flown (lost comms: 14 CFR 91.185 vs SERA.14083), never the UI language */
    region?: ProcRegion;
  };
  /** variants of one situation share a group (the base id of the family, e.g. 'c172.alternator' for the G1000 and
   *  the classic-panel alternator checklists): a drill that expects the group runs the variant whose `when`
   *  applies (cockpit, airspace) */
  group?: string;
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
  // ---- additive (emergency flow), always filled by the runner
  /** memory flow, read-and-do checklist, or communicate / decide (MAYDAY, 7700, nearest) */
  phase?: "memory" | "checklist" | "communicate";
  /** false: not graded — a callout in a solo test (nobody can hear it), shown as "not assessed — instructor" */
  assessed?: boolean;
  /** test: the pilot revealed this memory item on the checklist before doing it (a hint, recorded) */
  revealed?: boolean;
  /** no longer applicable (the engine restarted: the glide items left are moot); counted as optional */
  notApplicable?: boolean;
}

/** one event of the procedure's timeline (s after the failure injection) */
export interface ProcTimelineEvent {
  atS: number;
  kind:
    | "failure"
    | "cue"
    | "action"
    | "item"
    | "checklist"
    | "reveal"
    | "complete"
    | "resolved"
    | "exceed"
    | "crash"
    | "landed"
    | "end";
  /** item id (item / reveal), or the limit exceeded ('bank', 'stall', 'vne', 'alt') */
  ref?: string;
  /** plain-language label in the procedure's language */
  text?: string;
}

/** the flight path graded from the cue to the end of the flight (Aviate) */
export interface ProcAviate {
  /** bank limit, IAS band and altitude tolerance graded */
  maxBankLimitDeg: number;
  iasKt?: [number, number];
  altTolFt?: number;
  /** while the procedure ran */
  maxBankDeg: number;
  minIasKt: number | null;
  maxIasKt: number | null;
  /** % of the time inside ±altTolFt of the altitude at the cue (null: altitude not graded) */
  altInPct: number | null;
  /** largest altitude deviation from the altitude at the cue (ft) */
  altDevMaxFt: number;
  /** total stall-warning time above the flare height (s) */
  stallWarnS: number;
  vneExceeded: boolean;
  /** bank beyond the limit + 15°, a sustained stall warning or VNE: control was lost */
  controlLost: boolean;
  /** after the checklist was complete (the flight is watched to its end) */
  after: { maxBankDeg: number; stallWarnS: number; vneExceeded: boolean; crashed: boolean; upset: boolean };
  /** sim seconds watched after the checklist was complete */
  watchedAfterS: number;
  ok: boolean;
}

/** the five parts of the emergency, as an examiner grades them (FAA-H-8083-3C ch.18; ACS emergency operations) */
export interface ProcPhases {
  aviate: { ok: boolean };
  recognise: {
    /** s from the failure to the first perceptible symptom */
    cueS: number | null;
    /** s from the cue to the first relevant action (null: none) */
    actionS: number | null;
    /** expected (null: not timed) */
    targetS: number | null;
    ok: boolean | null;
  };
  memory: { total: number; done: number; inTime: number; inOrder: number; fromMemory: number; ok: boolean | null };
  checklist: { total: number; done: number; completedS: number | null; ok: boolean | null };
  communicate: { total: number; done: number; ok: boolean | null };
}

export interface ProcedureResult {
  procedureId: string;
  title: string;
  failure: FailureKey;
  failedAtS: number;
  /** first RELEVANT pilot action after the first cue (an item of this procedure done by the pilot, or the pitch
   *  input of a glide / attitude procedure), s — never a control the systems moved, never a Done tap */
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
  /** test mode with no instructor confirming callouts: Done (callout) items were not graded (nobody could hear
   *  them); the score comes from the sensed items and the flight path */
  soloTest?: boolean;
  // ---- additive (emergency flow), always filled by the runner
  /** s from the failure injection to the first perceptible cue (null: no cue was ever perceptible) */
  cueS?: number | null;
  /** s from the cue to the first relevant action (same as reactionS) and the target it was graded against */
  recognitionS?: number | null;
  recognitionTargetS?: number | null;
  /** s after the failure when every required item was done (null: never) */
  completedS?: number | null;
  aviate?: ProcAviate;
  phases?: ProcPhases;
  timeline?: ProcTimelineEvent[];
  /** training: memory items were shown on the card — "from memory" was not graded */
  guided?: boolean;
  /** items not graded (solo-test callouts) */
  notAssessed?: number;
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
    // ---- additive (emergency flow)
    /** the item to do now (first pending required item in list order) */
    current?: boolean;
    /** test: memory item revealed on the checklist */
    revealed?: boolean;
    /** time limit (s) */
    limitS?: number;
    /** no longer applicable (restart worked) */
    notApplicable?: boolean;
    /** the restart worked but this Aviate item (best glide) was never flown: missed, not waived */
    notFlown?: boolean;
  }[];
  mode: DrillMode;
  // ---- additive (procedures-engine), always filled
  lang?: Lang;
  ref?: string;
  disclaimer?: string;
  /** the checklist part is over: completed (the flight is still watched), landed, crashed, superseded by a
   *  follow-up or finished by the lesson */
  finished?: boolean;
  // ---- additive (emergency flow)
  /** s after the failure when the first symptom became perceptible (the card opens then), null before */
  cueS?: number | null;
  /** s since the cue (the card's clock), 0 before the cue */
  sinceCueS?: number;
  /** every required item done; the flight path is still graded until the end of the flight */
  complete?: boolean;
  /** the runner has stopped for good (end of flight, landed, crashed, follow-up) */
  stopped?: boolean;
  outcome?: "completed" | "incomplete" | "crashed" | "landed";
  /** the procedure this one follows (restart → forced landing) */
  followUpOf?: string;
  /** the targets line of the card (airspeed band, bank limit) */
  targets?: { iasKt?: [number, number]; maxBankDeg?: number };
  /** the engine restarted but the best glide was never flown: the card says so instead of 'Checklist complete' */
  restartNoGlide?: boolean;
}

export type { Switches };
