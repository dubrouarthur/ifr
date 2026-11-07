// Procedures mode engine: grades an emergency / abnormal procedure live while the student flies it, and explains
// the result in plain language (in the procedure's own language).
//
//   simView(sim)                      what the checks read, adapted from the real Sim (tests use fakeView())
//   new ProcedureRunner(proc, mode, failure, failedAtS)
//     .update(view)                   every frame (or a few times a second) once the failure is active
//     .openChecklist()                the student opens the checklist (memory items done later are not 'from memory')
//     .confirm(itemId, by)            Done button (student) / instructor confirmation of a manual (callout) item
//     .state()                        live state for the in-flight panel and the instructor companion
//     .result()                       graded result for the debrief
//   new DrillSession({ mode })        several runners: picks the procedure for each failure (expected id, else a
//                                     club procedure, else the library one in the current language), follow-ups
//
// GRADING RULES (also shown to instructors; keep in sync with the hub's help text)
//  - An item is done when its check becomes true after the failure (sticky: undoing it later does not undo it).
//    An item whose check was ALREADY true at the failure (e.g. 'Fuel selector — BOTH') is credited as 'verified'
//    when the pilot moves on to the next item (or does any later item); it is never late nor out of order.
//  - Order: in an 'ordered' procedure every item, and memory items always, must be done in list order. Actions
//    (switches, controls, avionics) are compared with actions; attitude / airspeed items are compared with attitude /
//    airspeed items (you fly while you run the flow). Done-button (manual / callout) items, 'landed' items and
//    items that were already right at the failure (a switch already in place, wings already level and held since)
//    never take part in the order.
//  - Memory items must be done before the checklist is opened, else they are not 'from memory'.
//  - Time limits (withinS): memory items count from the failure, the other items from the previous item done.
//    Half a second of grace.
//  - Reaction time: first pilot input after the failure — a switch, the throttle (±5 %), the flaps, the
//    transponder, the CDI, the autopilot, a direct-to, a COM frequency, the timer, a Done button or opening the
//    checklist, or a yoke / rudder input of more than 20 % of travel (ignored while the autopilot flies). What the
//    systems do by themselves is not an input: a failed autopilot dropping out, a failed GPS losing its direct-to.
//    'Autopilot — DISCONNECT' while the AP is failed is credited at the pilot's first input (taking the controls).
//  - Callouts (Done items) in a TEST with no instructor confirming anything ('solo test'): nobody can hear them, so
//    they are plain checklist confirmations — weight 1, never 'from memory', never safety-critical, never a FAIL
//    on their own. As soon as an instructor confirms one item, callouts are graded normally.
//  - Follow-up procedures (restart → forced landing): the reaction was graded on the first procedure; its 10
//    points go to the items. Follow-ups start only in flight: when the first procedure is completed (or after its
//    `afterS`) and its `unless` condition is false, or as soon as an `unless` condition that held after the
//    failure has been lost for 15 s (the engine seized during the oil-pressure drill, quit for good during the fuel
//    pump drill) — then the follow-up's clock starts when the condition was lost.
//  - Flight path (only while airborne): time in the IAS target band (counted from the first entry into the band,
//    or 20 s after the failure, whichever comes first), maximum bank, altitude lost (failure → lowest altitude).
//  - Score /100 = items 70 + flight path 20 + reaction 10 (without targets, items get 90).
//      items: weights memory 3 (solo-test callouts 1), normal 1, optional 0 (each optional item done: +1 bonus point, max +5);
//             credit 1, late −0.5, out of order −0.25, memory item not from memory −0.5 (floor 0), missed 0.
//      path:  IAS band 15 × fraction of time in band, bank 5 × (1 − excess over the limit / 15°); a single target
//             gets the whole 20.
//      reaction: 10 at ≤ 3 s, 0 at ≥ 15 s, linear in between; no reaction 0.
//      crashed: score capped at 20.
//  - Verdict FAIL when: the aircraft crashed, a memory item was missed, a safety-critical item (default: memory
//    items with a time limit, or items flagged `safety`) was missed or late, or the score is below 70 (PASS_MARK).
import type { Sim } from "../sim/sim";
import {
  defaultSwitches,
  type FailureKey,
  type Switches,
  type SystemsReadout,
} from "../sim/systemsTypes";
import { AIRPORTS } from "../nav/data";
import { distanceNm } from "../nav/geo";
import { checkDef } from "./procedureChecks";
import {
  BANK_LOST_DEG,
  ENVELOPE_GRACE_S,
  POST_BANK_DEG,
  STALL_AGL_FT,
  STALL_WARN_S,
  VNE_KT,
  cuePerceived,
  envelopeFor,
  phaseOfItem,
  recognitionTargetS,
  type Envelope,
} from "./procedureFlow";
import { effectiveProcedures } from "./procedureStore";
import { lang as uiLang } from "../ui/i18n";
import type {
  CheckRef,
  DrillMode,
  ItemResult,
  Lang,
  ProcCockpit,
  ProcItem,
  ProcRegion,
  Procedure,
  ProcedureResult,
  ProcedureRunState,
  ProcAviate,
  ProcPhases,
  ProcTimelineEvent,
} from "./procedureTypes";

// ------------------------------------------------------------------ what the checks read
export interface ProcSimView {
  /** sim time (s) */
  t: number;
  sw: Switches;
  /** systems readout (null when the systems model is not available) */
  sys: SystemsReadout | null;
  controls: {
    throttle: number;
    flaps: number;
    elevator: number;
    aileron: number;
    rudder: number;
    trim: number;
    brake: number;
  };
  /** TRUE indicated airspeed from the flight model (pitot-static faults never fool the grading) */
  iasKt: number;
  bankDeg: number;
  pitchDeg: number;
  altFt: number;
  aglFt: number;
  /** heading as the pilot reads it (the sim frame is magnetic) */
  hdgDeg: number;
  vsFpm: number;
  xpdr: string;
  cdi: string;
  apEngaged: boolean;
  /** the autopilot is failed / inhibited (AP FAIL): it drops by itself, so its disconnection is not a pilot input */
  apFailed: boolean;
  /** ident the GPS is navigating direct to (after a Direct-To), else null */
  directTo: string | null;
  /** the three nearest airports (idents), for 'direct-to nearest' */
  nearest: string[];
  timerRunning: boolean;
  com: { active: number; standby: number }[];
  onGround: boolean;
  stopped: boolean;
  crashed: boolean;
  engineRunning: boolean;
  // ---- additive (emergency content), optional for older callers
  /** the instrument panel flown: the G1000 and the classic panel have different checklists (C172S NAV III POH vs
   *  C172S POH) */
  cockpit?: ProcCockpit;
  /** whose rules apply where the aircraft is (nearest airport): 14 CFR / AIM or ICAO / SERA */
  region?: ProcRegion;
  // ---- additive (emergency flow), optional for older callers
  /** engine RPM (the first cue of a power loss is the RPM decay) */
  rpm?: number;
  /** the stall-warning horn is sounding (C172S: pneumatic reed, 5–10 kt above the stall) */
  stallWarn?: boolean;
}

/** The rules of the airspace an airport is in, from its ident: US airports (ICAO 'K…', Alaska / Hawaii / Pacific
 *  'PA…' 'PH…' 'PG…' …, FAA identifiers with a digit such as '1B1') fly 14 CFR (91.185 lost comms); everything
 *  else ICAO Annex 2 rules, which EASA writes as SERA (SERA.14083 lost comms). Unknown: 'faa' (the default
 *  scenarios are in the US). */
export function airspaceRegion(ident: string | null | undefined): ProcRegion {
  const id = (ident ?? "").trim().toUpperCase();
  if (!id) return "faa";
  if (/^K[A-Z0-9]{3}$/.test(id)) return "faa";
  if (/^P[AFGHJKMOPW][A-Z0-9]{2}$/.test(id)) return "faa";
  // US territories in the Caribbean and the Pacific fly 14 CFR too: Puerto Rico 'TJ…', US Virgin Islands 'TI…'
  // (TIST, TISX), American Samoa 'NSTU', the Northern Marianas / Guam 'PG…' (above)
  if (/^T[JI][A-Z0-9]{2}$/.test(id) || id === "NSTU" || id === "NSFQ" || id === "NSAS") return "faa";
  // FAA location identifiers carry a digit ('1B1', 'N51'); ICAO location indicators are four letters
  if (/^[A-Z0-9]{3,4}$/.test(id) && /\d/.test(id)) return "faa";
  return "icao";
}

/** a procedure as flown in a cockpit: items written for other cockpits (e.g. 'STBY BATT — OFF' on the G1000 only)
 *  are dropped. Unknown cockpit: unchanged. */
export function procedureForCockpit(p: Procedure, cockpit?: ProcCockpit): Procedure {
  if (!cockpit || !p.items.some((it) => it.cockpit?.length || it.textFor)) return p;
  return {
    ...p,
    items: p.items
      .filter((it) => !it.cockpit?.length || it.cockpit.includes(cockpit))
      .map((it) => {
        const t = it.textFor?.[cockpit];
        return t ? { ...it, text: t } : it;
      }),
  };
}

/** a neutral in-flight view (cruise 4500 ft, 105 KIAS, everything normal): tests and the editor preview */
export function fakeView(over: Partial<ProcSimView> = {}): ProcSimView {
  return {
    t: 0,
    sw: defaultSwitches(),
    sys: null,
    controls: {
      throttle: 0.75,
      flaps: 0,
      elevator: 0,
      aileron: 0,
      rudder: 0,
      trim: -0.25,
      brake: 0,
    },
    iasKt: 105,
    bankDeg: 0,
    pitchDeg: 1,
    altFt: 4500,
    aglFt: 4000,
    hdgDeg: 270,
    vsFpm: 0,
    xpdr: "7000",
    cdi: "GPS",
    apEngaged: false,
    apFailed: false,
    directTo: null,
    nearest: [],
    timerRunning: false,
    com: [
      { active: 119.85, standby: 118.3 },
      { active: 127.65, standby: 121.9 },
    ],
    onGround: false,
    stopped: false,
    crashed: false,
    engineRunning: true,
    cockpit: "g1000",
    region: "faa",
    ...over,
  };
}

type SimWithSystems = Sim & { sw?: Switches; sys?: SystemsReadout };
let nearCache: { lat: number; lon: number; n: number; ids: string[] } | null =
  null;

function nearestIdents(lat: number, lon: number): string[] {
  // recomputed when the aircraft moved ~1 nm or the airport list changed (region load)
  if (
    nearCache &&
    nearCache.n === AIRPORTS.length &&
    Math.abs(nearCache.lat - lat) < 0.015 &&
    Math.abs(nearCache.lon - lon) < 0.02
  )
    return nearCache.ids;
  const ids = AIRPORTS.map(
    (a) => [distanceNm({ lat, lon }, a), a.icao] as const,
  )
    .sort((a, b) => a[0] - b[0])
    .slice(0, 3)
    .map(([, id]) => id);
  nearCache = { lat, lon, n: AIRPORTS.length, ids };
  return ids;
}

/** adapt the real Sim to what the checks read (cheap: call it a few times a second) */
export function simView(sim: Sim): ProcSimView {
  const s = sim as SimWithSystems;
  const d = sim.ac.data;
  const st = sim.ac.s;
  const c = sim.controls;
  const sys = s.sys ?? null;
  const fp = sim.fp;
  return {
    t: sim.time,
    // copies: the runner keeps the view at the failure to detect the first pilot input
    sw: s.sw ? { ...s.sw } : defaultSwitches(),
    sys,
    controls: {
      throttle: c.throttle,
      flaps: c.flaps,
      elevator: c.elevator,
      aileron: c.aileron,
      rudder: c.rudder,
      trim: c.trim,
      brake: c.brake,
    },
    iasKt: d.iasKt,
    bankDeg: d.rollDeg,
    pitchDeg: d.pitchDeg,
    altFt: d.altFt,
    aglFt: d.aglFt,
    hdgDeg: d.hdgTrue,
    vsFpm: d.vsFpm,
    xpdr: sim.av.xpdr,
    cdi: sim.av.cdi,
    apEngaged: sim.ap.ap,
    apFailed: !!sim.ap.inhibited,
    directTo: fp.directFrom && fp.out.valid ? fp.out.toIdent || null : null,
    nearest: nearestIdents(st.lat, st.lon),
    timerRunning: sim.av.timerStart !== null,
    com: [sim.av.com1, sim.av.com2].map((r) => ({
      active: r.active,
      standby: r.standby,
    })),
    onGround: st.onGround,
    stopped: st.onGround && d.gsKt < 1,
    crashed: !!st.crashed,
    engineRunning: sys
      ? sys.engineRunning
      : !sim.failures.engine && st.rpm > 500,
    cockpit: sim.cockpit ?? "g1000",
    region: airspaceRegion(nearestIdents(st.lat, st.lon)[0]),
    rpm: st.rpm,
    stallWarn: !!d.stallWarn,
  };
}

// ------------------------------------------------------------------ runner
export const PASS_MARK = 70;
/** a follow-up's `unless` condition that held after the failure must be lost this long (s) to start it */
export const FOLLOW_LOST_S = 15;
/** …unless the pilot is still working the restart flow of the procedure it follows (items left to do): the
 *  restart gets this long (s) before the forced landing takes over. AFH FAA-H-8083-3C ch.18: establish the glide,
 *  then attempt the restart while altitude permits — 40 s is about 500 ft of glide at 68 KIAS. */
export const FOLLOW_RESTART_S = 40;
const GRACE_S = 0.5;
/** IAS band time counts from the first entry into the band, or this long after the cue */
const BAND_SETTLE_S = 20;
/** a pitch input of this much of the elevator travel after the cue is the pilot's first answer to a power loss or
 *  an attitude problem (AFH ch.18: lower the nose / pitch for the glide at once) */
const PITCH_INPUT = 0.15;
/** score weights (of 100): checklist items, flight path (Aviate), recognition. A part that cannot be assessed
 *  (no timed recognition, nothing sensed in a solo test) gives its weight to the others. */
/** an airspeed band item needs a steady speed: |trend| over IAS_TREND_S at most this (kt/s) */
const IAS_STEADY_KT_S = 1.5;
const IAS_TREND_S = 2;
/** the follow-up condition (engine running) must hold this long again before the restart counts (s) */
const RESOLVED_S = 5;
/** the Aviate item (best glide) is owed from the cue: once this long has passed (s) a restart no longer waives it.
 *  AFH FAA-H-8083-3C ch.18 and the ACS (emergency approach and landing): pitch for best glide at once, then the
 *  restart flow — a quick restart flown at cruise speed is not a pass. */
const GLIDE_OWED_S = 5;
const W_ITEMS = 70;
const W_PATH = 20;
const W_RECOG = 10;

type Nature = "action" | "path" | "outcome";
type By = NonNullable<ItemResult["by"]>;

interface Track {
  done: boolean;
  /** s after the failure */
  atS: number | null;
  by: By | null;
  inOrder: boolean;
  /** first earlier item that was still pending when this one was done (order notes) */
  before: string | null;
  fromMemory: boolean;
  late: boolean;
  lateByS: number;
  limitRefS: number;
  trueSince: number | null;
  preSat: boolean;
  /** attitude / airspeed item whose condition has held without a break since the failure (e.g. wings already
   *  level in a nose-high unusual attitude, Vy inside the EFATO band): not a pilot step, never out of order */
  pathInit: boolean;
  /** test: the pilot revealed this memory item on the checklist (s after the failure) */
  revealedAtS: number | null;
  /** no longer applicable: the engine runs again after the restart flow, the checklist items left are moot */
  skipped: boolean;
  /** the restart worked but this Aviate memory item (best glide) was never flown: not waived, graded as missed */
  notFlown: boolean;
}

function natureOf(it: ProcItem): Nature {
  const d = checkDef(it.check);
  if (!d) return "action";
  if (d.kind === "path") return "path";
  if (d.kind === "outcome") return "outcome";
  return "action";
}
const isManual = (it: ProcItem) =>
  !it.check || it.check.id === "manual" || !checkDef(it.check);
const isSafety = (it: ProcItem) =>
  it.safety ?? (it.memory && it.withinS !== undefined);
const isApOff = (it: ProcItem) =>
  it.check?.id === "ap" &&
  !(it.check.p?.engaged === true || it.check.p?.engaged === "true");
const r1 = (x: number) => Math.round(x * 10) / 10;

/** the flight path while the procedure runs (`during`) and after its checklist is complete (`after`) */
interface AviateTrack {
  maxBank: number;
  minIas: number;
  maxIas: number;
  altRef: number | null;
  altTime: number;
  altIn: number;
  altDevMax: number;
  stallRun: number;
  stallS: number;
  stallLost: boolean;
  vne: boolean;
  bankLost: boolean;
  postBank: number;
  postStallRun: number;
  postStallS: number;
  postStallLost: boolean;
  postVne: boolean;
  watchedAfter: number;
  exceeded: Set<string>;
}

export class ProcedureRunner {
  readonly procedure: Procedure;
  readonly mode: DrillMode;
  readonly failure: FailureKey;
  readonly failedAtS: number;
  /** id of the procedure this one follows (restart → forced landing): its reaction time is not graded again */
  readonly followUpOf: string | undefined;
  readonly envelope: Envelope;
  readonly recognitionTarget: number | null;
  /** a follow-up: the condition of the procedure it follows ('engine running') — the pilot's late restart worked,
   *  the forced landing is moot */
  private readonly resolveWhen: CheckRef | undefined;
  private tracks: Track[];
  private lastT: number;
  private started = false;
  private base: ProcSimView | null = null;
  /** sim time of the first perceptible cue, of the first relevant pilot action, of the end of the checklist */
  private cueAt: number | null = null;
  private actionAt: number | null = null;
  private completedAt: number | null = null;
  private yokeAtCue: { e: number; a: number } | null = null;
  private checklistAt: number | null = null;
  private finishedAs: ProcedureResult["outcome"] | null = null;
  private altAtFailure: number | null = null;
  private minAlt = Infinity;
  private bandStarted = false;
  private bandTime = 0;
  private bandIn = 0;
  private wasAirborne = false;
  private av: AviateTrack = {
    maxBank: 0,
    minIas: Infinity,
    maxIas: 0,
    altRef: null,
    altTime: 0,
    altIn: 0,
    altDevMax: 0,
    stallRun: 0,
    stallS: 0,
    stallLost: false,
    vne: false,
    bankLost: false,
    postBank: 0,
    postStallRun: 0,
    postStallS: 0,
    postStallLost: false,
    postVne: false,
    watchedAfter: 0,
    exceeded: new Set(),
  };
  private events: ProcTimelineEvent[] = [];
  /** recent (t, IAS) samples and the airspeed trend over them (kt/s) */
  private iasHist: [number, number][] = [];
  /** IAS at the first perceptible cue (kt) */
  private iasAtCue: number | null = null;
  private iasTrend = 0;

  constructor(
    procedure: Procedure,
    mode: DrillMode,
    failure: FailureKey,
    failedAtS: number,
    opts: { followUpOf?: string; resolveWhen?: CheckRef } = {},
  ) {
    this.procedure = procedure;
    this.mode = mode;
    this.failure = failure;
    this.failedAtS = failedAtS;
    this.followUpOf = opts.followUpOf;
    this.resolveWhen = opts.resolveWhen;
    this.envelope = envelopeFor(procedure);
    // a follow-up's recognition was graded on the procedure it follows
    this.recognitionTarget = opts.followUpOf
      ? null
      : recognitionTargetS(procedure);
    this.lastT = failedAtS;
    this.tracks = procedure.items.map(() => ({
      done: false,
      atS: null,
      by: null,
      inOrder: true,
      before: null,
      fromMemory: true,
      late: false,
      lateByS: 0,
      limitRefS: 0,
      trueSince: null,
      preSat: false,
      pathInit: false,
      revealedAtS: null,
      skipped: false,
      notFlown: false,
    }));
  }

  /** the checklist part is over: every required item done (the flight path is still watched until the end of
   *  the flight), or the runner stopped (landed, crashed, follow-up, end of the lesson) */
  get finished(): boolean {
    return this.finishedAs !== null || this.completedAt !== null;
  }
  /** nothing is graded any more (end of the flight, landed, crashed, follow-up started) */
  get stopped(): boolean {
    return this.finishedAs !== null;
  }
  /** every required item is done */
  get isComplete(): boolean {
    return this.completedAt !== null;
  }
  get outcome(): ProcedureResult["outcome"] {
    return (
      this.finishedAs ?? (this.requiredDone() ? "completed" : "incomplete")
    );
  }
  get checklistOpen(): boolean {
    return this.checklistAt !== null;
  }
  /** seconds since the failure (at the last update) */
  get elapsedS(): number {
    return Math.max(0, this.lastT - this.failedAtS);
  }
  /** the first symptom is perceptible: the card opens, the clocks run (s after the failure, null before) */
  get cueS(): number | null {
    return this.cueAt === null ? null : this.cueAt - this.failedAtS;
  }
  /** seconds since the cue (0 before it) */
  get sinceCueS(): number {
    return this.cueAt === null ? 0 : Math.max(0, this.lastT - this.cueAt);
  }
  /** s after the failure when every required item was done (null: not yet) */
  get completedS(): number | null {
    return this.completedAt === null ? null : this.completedAt - this.failedAtS;
  }

  /** stop grading (lesson ended, follow-up procedure started...) */
  finish(outcome?: ProcedureResult["outcome"]) {
    if (this.finishedAs) return;
    this.finishedAs =
      outcome ?? (this.requiredDone() ? "completed" : "incomplete");
    this.event("end", this.elapsedS);
  }

  /** the student opened the checklist (training card, or the test index). Recorded only: in training the memory
   *  items are on the card anyway, in a test they stay hidden until revealed one by one (reveal()). */
  openChecklist() {
    if (this.checklistAt === null) {
      this.checklistAt = this.elapsedS;
      this.event("checklist", this.elapsedS);
    }
  }

  /** test: the pilot reveals a hidden memory item on the checklist (a hint): done after that, it is not 'from
   *  memory' */
  reveal(itemId: string): boolean {
    const i = this.procedure.items.findIndex((x) => x.id === itemId);
    if (i < 0 || this.stopped) return false;
    const tr = this.tracks[i];
    if (tr.revealedAtS !== null) return false;
    tr.revealedAtS = this.elapsedS;
    this.event("reveal", this.elapsedS, itemId);
    return true;
  }

  /** Done button (student) or instructor confirmation. The student may confirm manual items and items that were
   *  already right at the failure (verified); the instructor may confirm any item. A Done tap is never the
   *  pilot's 'reaction': it does not start or stop any clock. */
  confirm(itemId: string, by: "student" | "instructor"): boolean {
    if (this.stopped) return false;
    const i = this.procedure.items.findIndex((x) => x.id === itemId);
    if (i < 0 || this.tracks[i].done) return false;
    const it = this.procedure.items[i];
    if (by === "student" && !isManual(it) && !this.tracks[i].preSat)
      return false;
    this.complete(i, this.elapsedS, by);
    this.chainVerified();
    this.checkCompletion();
    return true;
  }

  private event(
    kind: ProcTimelineEvent["kind"],
    atS: number,
    ref?: string,
    text?: string,
  ) {
    if (this.events.length >= 200) return;
    this.events.push({
      atS: r1(Math.max(0, atS)),
      kind,
      ...(ref ? { ref } : {}),
      ...(text ? { text } : {}),
    });
  }
  private setCue(t: number, view: ProcSimView) {
    if (this.cueAt !== null) return;
    this.cueAt = t;
    this.iasAtCue = view.iasKt;
    this.yokeAtCue = { e: view.controls.elevator, a: view.controls.aileron };
    this.av.altRef = view.altFt;
    this.event("cue", t - this.failedAtS);
  }
  /** the pilot's first relevant action (an item of this procedure done by hand, or the pitch input of a glide /
   *  attitude procedure). Done before any symptom was perceptible: the pilot noticed it — the cue is then. */
  private noteAction(t: number, view: ProcSimView) {
    if (this.actionAt !== null) return;
    if (this.cueAt === null || t < this.cueAt) {
      this.cueAt = null;
      this.setCue(t, view);
    }
    this.actionAt = t;
    this.event("action", t - this.failedAtS);
  }

  update(view: ProcSimView) {
    if (this.finishedAs) return;
    const t = view.t;
    if (t < this.failedAtS) return;
    const dt = this.started ? Math.max(0, Math.min(1, t - this.lastT)) : 0;
    this.lastT = t;
    const el = t - this.failedAtS;
    const ctx = { failedAtS: this.failedAtS, elapsedS: el };
    const items = this.procedure.items;
    if (!this.started) {
      this.started = true;
      this.base = view;
      this.altAtFailure = view.altFt;
      this.event("failure", 0);
      items.forEach((it, i) => {
        const d = checkDef(it.check);
        if (d && d.kind === "action" && d.evaluate(view, it.check!.p, ctx))
          this.tracks[i].preSat = true;
        if (d && d.kind === "path" && d.evaluate(view, it.check!.p, ctx))
          this.tracks[i].pathInit = true;
      });
      // a follow-up starts on a failure the pilot already knows (the engine did not restart)
      if (this.followUpOf) this.setCue(t, view);
    }
    // ---- recognise: the first symptom, then the first relevant pilot input
    if (
      this.cueAt === null &&
      this.base &&
      cuePerceived(this.failure, view, this.base)
    )
      this.setCue(t, view);
    const y = this.yokeAtCue;
    if (
      this.actionAt === null &&
      this.cueAt !== null &&
      y !== null &&
      !view.apEngaged &&
      this.yokeMatters() &&
      (Math.abs(view.controls.elevator - y.e) >= PITCH_INPUT ||
        (this.takeOver() && Math.abs(view.controls.aileron - y.a) >= PITCH_INPUT))
    )
      this.noteAction(t, view);
    else if (view.apEngaged && y !== null)
      this.yokeAtCue = { e: view.controls.elevator, a: view.controls.aileron };
    // ---- airspeed trend over the last IAS_TREND_S (kt/s)
    this.iasHist.push([t, view.iasKt]);
    while (this.iasHist.length > 2 && t - this.iasHist[1][0] >= IAS_TREND_S)
      this.iasHist.shift();
    const [t0, i0] = this.iasHist[0];
    this.iasTrend = t - t0 >= 0.5 ? (view.iasKt - i0) / (t - t0) : 0;
    // ---- aviate
    this.trackPath(view, dt);
    // ---- items
    items.forEach((it, i) => {
      const tr = this.tracks[i];
      if (tr.done) return;
      const d = checkDef(it.check);
      if (!d || d.kind === "manual") return;
      // a later step on the same switch (ALT OFF, ALT ON, then ALT OFF again) waits for the earlier ones: one
      // flick of the switch answers one item, never two at once
      if (this.waitsForSameSwitch(i)) {
        tr.trueSince = null;
        return;
      }
      const ok = d.evaluate(view, it.check!.p, ctx);
      // 'Autopilot — DISCONNECT' while the AP is failed: the system dropped it, not the pilot — credited when the
      // pilot takes over (first input), like an item that was already right at the failure
      if (ok && view.apFailed && isApOff(it)) {
        tr.preSat = true;
        return;
      }
      if (tr.preSat) {
        if (!ok) tr.preSat = false;
        return;
      }
      if (!ok) {
        tr.trueSince = null;
        tr.pathInit = false;
        return;
      }
      // an airspeed is "established" only when it is steady: a speed decaying through the band towards the stall
      // (nose high after an engine failure) is not the glide speed (AFH ch.18; FAA-S-ACS-6C, maintains best glide)
      if (it.check!.id === "ias" && Math.abs(this.iasTrend) > IAS_STEADY_KT_S) {
        tr.trueSince = null;
        return;
      }
      tr.trueSince ??= t;
      const nat = natureOf(it);
      // an attitude / airspeed item counts from the first symptom on: wings that happened to be level before the
      // pilot could know anything is no answer to the failure — it must still hold after the cue
      const from =
        nat === "path"
          ? this.cueAt === null
            ? null
            : Math.max(tr.trueSince, this.cueAt)
          : tr.trueSince;
      if (from !== null && t - from >= d.holdS(it.check!.p) - 1e-6) {
        // an item the pilot made true (not one that held since the failure) is a relevant action
        if (!tr.pathInit && nat !== "outcome") this.noteAction(from, view);
        this.complete(i, Math.max(0, from - this.failedAtS), "auto");
      }
    });
    this.chainVerified();
    this.watchResolved(view, ctx);
    // ---- outcome: a crash at any time, even after the checklist, is a crash
    if (view.crashed) {
      this.finishedAs = "crashed";
      this.event("crash", el);
    } else if (view.onGround && view.stopped && this.wasAirborne) {
      this.finishedAs = this.requiredDone() ? "completed" : "landed";
      this.event("landed", el);
    } else this.checkCompletion();
  }

  /** a glide / attitude procedure (an airspeed or pitch item): the pitch input is the first answer; an autopilot
   *  failure ('Autopilot — DISCONNECT'): taking the controls (any yoke input) is */
  private yokeMatters(): boolean {
    return (
      this.takeOver() ||
      this.procedure.items.some((it) => it.check?.id === "ias" || it.check?.id === "pitchAtt")
    );
  }
  private takeOver(): boolean {
    return this.procedure.items.some(isApOff);
  }

  /** Aviate: the envelope from the cue (after a short grace to take over) to the end of the flight */
  private trackPath(view: ProcSimView, dt: number) {
    const av = this.av;
    const env = this.envelope;
    if (view.onGround) {
      this.minAlt = Math.min(this.minAlt, view.altFt);
      av.stallRun = av.postStallRun = 0;
      return;
    }
    this.wasAirborne = true;
    this.minAlt = Math.min(this.minAlt, view.altFt);
    if (this.cueAt === null) return;
    const el = view.t - this.failedAtS;
    const since = view.t - this.cueAt;
    const grace = env.recovery ? ENVELOPE_GRACE_S * 2 : ENVELOPE_GRACE_S;
    const stallNow = !!view.stallWarn && view.aglFt > STALL_AGL_FT;
    const bank = Math.abs(view.bankDeg);
    if (this.completedAt === null) {
      av.minIas = Math.min(av.minIas, view.iasKt);
      av.maxIas = Math.max(av.maxIas, view.iasKt);
      if (view.iasKt > VNE_KT && !av.vne) {
        av.vne = true;
        this.exceed("vne", el);
      }
      if (since >= grace) {
        av.maxBank = Math.max(av.maxBank, bank);
        if (bank > env.maxBankDeg + BANK_LOST_DEG && !av.bankLost) {
          av.bankLost = true;
          this.exceed("bank", el);
        }
        if (stallNow) {
          av.stallRun += dt;
          av.stallS += dt;
          if (av.stallRun >= STALL_WARN_S - 1e-6 && !av.stallLost) {
            av.stallLost = true;
            this.exceed("stall", el);
          }
        } else av.stallRun = 0;
        if (env.altTolFt !== undefined && av.altRef !== null) {
          const dev = Math.abs(view.altFt - av.altRef);
          av.altTime += dt;
          if (dev <= env.altTolFt) av.altIn += dt;
          av.altDevMax = Math.max(av.altDevMax, dev);
          if (dev > env.altTolFt * 3 && !av.exceeded.has("alt"))
            this.exceed("alt", el);
        }
      }
      const band = env.iasKt;
      if (band) {
        const inBand = view.iasKt >= band[0] && view.iasKt <= band[1];
        if (!this.bandStarted && (inBand || since >= BAND_SETTLE_S))
          this.bandStarted = true;
        if (this.bandStarted) {
          this.bandTime += dt;
          if (inBand) this.bandIn += dt;
        }
      }
    } else {
      // after the checklist: the flight goes on and is still watched — an upset is not a pass
      av.watchedAfter += dt;
      av.postBank = Math.max(av.postBank, bank);
      if (view.iasKt > VNE_KT && !av.postVne) {
        av.postVne = true;
        this.exceed("vne-after", el);
      }
      if (bank > POST_BANK_DEG && !av.exceeded.has("bank-after"))
        this.exceed("bank-after", el);
      if (stallNow) {
        av.postStallRun += dt;
        av.postStallS += dt;
        if (av.postStallRun >= STALL_WARN_S - 1e-6 && !av.postStallLost) {
          av.postStallLost = true;
          this.exceed("stall-after", el);
        }
      } else av.postStallRun = 0;
    }
  }
  private exceed(what: string, el: number) {
    this.av.exceeded.add(what);
    this.event("exceed", el, what);
  }

  private requiredDone() {
    return this.procedure.items.every(
      (it, i) =>
        it.optional ||
        this.tracks[i].done ||
        this.tracks[i].skipped ||
        this.tracks[i].notFlown,
    );
  }
  /** item i moves a switch that an earlier required item, still pending, moves first */
  private waitsForSameSwitch(i: number): boolean {
    const items = this.procedure.items;
    const c = items[i].check;
    if (c?.id !== "switch" || c.p?.key === undefined) return false;
    for (let j = 0; j < i; j++) {
      const o = items[j];
      const oj = this.tracks[j];
      if (
        o.check?.id === "switch" &&
        o.check.p?.key === c.p.key &&
        !o.optional &&
        !oj.done &&
        !oj.skipped &&
        !oj.notFlown &&
        !oj.preSat
      )
        return true;
    }
    return false;
  }
  /** the pilot flew towards an airspeed / attitude item before the restart: the speed came down towards the band
   *  (or up to it, from slow), or a pitch input answered the cue */
  private flewTowards(it: ProcItem): boolean {
    const c = it.check;
    if (c?.id === "ias") {
      const lo = Number(c.p?.min ?? -Infinity);
      const hi = Number(c.p?.max ?? Infinity);
      const at = this.iasAtCue;
      if (at === null) return false;
      const av = this.av;
      if (at > hi) return av.minIas <= hi + 5 || at - av.minIas >= 15;
      if (at < lo) return av.maxIas >= lo - 5;
      return av.minIas >= lo - 10 && av.maxIas <= hi + 10;
    }
    return this.actionAt !== null;
  }
  /** Restart: the procedure's follow-up condition ('engine running' for the engine failure) held at the failure,
   *  was lost after the cue and holds again for RESOLVED_S — the flow worked (C172S POH section 3, engine failure
   *  in flight: "if the restart has occurred…"). The items still pending (best glide, the field) are moot: they
   *  are not applicable, never 'missed', and the checklist is complete. The flight is still watched. */
  private watchResolved(view: ProcSimView, ctx: { failedAtS: number; elapsedS: number }) {
    const un = this.procedure.then?.unless ?? this.resolveWhen;
    if (!un || this.completedAt !== null || this.cueAt === null) return;
    const d = checkDef(un);
    if (!d) return;
    const holds = d.evaluate(view, un.p, ctx);
    if (!holds) {
      this.unlessLost = true;
      this.unlessSince = null;
      return;
    }
    if (!this.unlessLost) return;
    this.unlessSince ??= view.t;
    if (view.t - this.unlessSince < RESOLVED_S - 1e-6) return;
    const el = view.t - this.failedAtS;
    this.procedure.items.forEach((it, i) => {
      const tr = this.tracks[i];
      if (tr.done || it.optional) return;
      // the Aviate item is owed from the cue: a restart does not waive the best glide the pilot never flew
      if (
        it.memory &&
        natureOf(it) === "path" &&
        this.cueAt !== null &&
        view.t - this.cueAt > GLIDE_OWED_S
      ) {
        if (this.flewTowards(it))
          this.complete(
            i,
            this.actionAt !== null ? this.actionAt - this.failedAtS : el,
            "auto",
          );
        else tr.notFlown = true;
        return;
      }
      tr.skipped = true;
    });
    this.event("resolved", el);
  }
  private unlessLost = false;
  private unlessSince: number | null = null;
  private checkCompletion() {
    if (
      this.completedAt === null &&
      this.requiredDone() &&
      this.procedure.items.some((it) => !it.optional)
    ) {
      this.completedAt = this.lastT;
      this.event("complete", this.lastT - this.failedAtS);
    }
  }

  /** items that were already right at the failure: credited when the pilot moves past them */
  private chainVerified() {
    // only the pilot's own steps through the list count (switches, controls, Done buttons), not an airspeed or
    // attitude that happened to be right at the failure
    const items = this.procedure.items;
    const step = (j: number) =>
      this.tracks[j].done &&
      this.tracks[j].by !== "verified" &&
      natureOf(items[j]) !== "path";
    for (let pass = 0; pass < 2; pass++)
      items.forEach((_it, i) => {
        const tr = this.tracks[i];
        if (tr.done || !tr.preSat) return;
        let at = Infinity;
        for (let j = i + 1; j < items.length; j++)
          if (step(j)) at = Math.min(at, this.tracks[j].atS!);
        let prev = -1;
        // the previous switch / control step (a Done callout is confirmed whenever the hand is free: it never holds
        // back the check of the item after it)
        for (let j = i - 1; j >= 0; j--)
          if (natureOf(items[j]) !== "path" && !isManual(items[j])) {
            prev = j;
            break;
          }
        if (prev >= 0 && this.tracks[prev].done)
          at = Math.min(at, this.tracks[prev].atS!);
        if (prev < 0 && this.actionAt !== null)
          at = Math.min(at, this.actionAt - this.failedAtS);
        if (at < Infinity) this.complete(i, at, "verified");
      });
  }

  /** reference time of the time limit of item i (s after the failure): memory items count from the cue, the
   *  others from the previous item done (or the cue). Null: no cue yet, the clock has not started. */
  private limitRef(i: number): number | null {
    const it = this.procedure.items[i];
    const cue = this.cueS;
    if (it.memory) return cue;
    for (let j = i - 1; j >= 0; j--)
      if (this.tracks[j].done) return Math.max(this.tracks[j].atS!, cue ?? 0);
    return cue;
  }

  private complete(i: number, atS: number, by: By) {
    const items = this.procedure.items;
    const it = items[i];
    const tr = this.tracks[i];
    tr.done = true;
    tr.atS = atS;
    tr.by = by;
    if (by !== "verified") {
      const nat = natureOf(it);
      // manual (Done / callout) items are confirmed whenever the hand is free: they never take part in the order;
      // items already right at the failure will be verified, they never block the next ones
      if (nat !== "outcome" && !isManual(it) && !tr.pathInit)
        for (let j = 0; j < i; j++) {
          const o = items[j];
          const oj = this.tracks[j];
          if (
            o.optional ||
            oj.done ||
            oj.preSat ||
            isManual(o) ||
            natureOf(o) !== nat
          )
            continue;
          if (this.procedure.ordered || (it.memory && o.memory)) {
            tr.inOrder = false;
            tr.before = o.id;
            break;
          }
        }
      if (it.withinS !== undefined) {
        const ref = this.limitRef(i);
        tr.limitRefS = ref ?? atS;
        const late = atS - tr.limitRefS - it.withinS;
        if (late > GRACE_S) {
          tr.late = true;
          tr.lateByS = late;
        }
      }
    }
    // a memory item revealed on the test checklist before it was done was read, not recalled
    if (it.memory && tr.revealedAtS !== null && atS > tr.revealedAtS + 1e-6)
      tr.fromMemory = false;
    if (by !== "verified" || !tr.preSat) this.event("item", atS, it.id);
  }

  state(): ProcedureRunState {
    const p = this.procedure;
    const el = this.elapsedS;
    const cur = p.items.findIndex(
      (it, i) =>
        !this.tracks[i].done &&
        !it.optional &&
        !this.tracks[i].preSat &&
        !this.tracks[i].skipped &&
        !this.tracks[i].notFlown,
    );
    return {
      procedureId: p.id,
      title: p.title,
      failure: this.failure,
      elapsedS: el,
      checklistOpen: this.checklistAt !== null,
      mode: this.mode,
      lang: p.lang,
      ref: p.ref,
      disclaimer: p.disclaimer,
      finished: this.finished,
      cueS: this.cueS,
      sinceCueS: this.sinceCueS,
      complete: this.isComplete,
      stopped: this.stopped,
      outcome: this.outcome,
      followUpOf: this.followUpOf,
      targets: p.targets ? { ...p.targets } : undefined,
      ...(this.tracks.some((t) => t.notFlown) ? { restartNoGlide: true } : {}),
      items: p.items.map((it, i) => {
        const tr = this.tracks[i];
        let due: number | null = null;
        let late = tr.late;
        const ref = this.limitRef(i);
        if (
          !tr.done &&
          !tr.preSat &&
          !tr.skipped &&
          it.withinS !== undefined &&
          ref !== null
        ) {
          due = ref + it.withinS - el;
          if (due < -GRACE_S) late = true;
        }
        return {
          id: it.id,
          text: it.text,
          memory: it.memory,
          done: tr.done,
          late,
          due,
          manual: isManual(it),
          optional: !!it.optional,
          note: it.note,
          atS: tr.atS,
          ready: !tr.done && tr.preSat,
          ...(tr.skipped ? { notApplicable: true } : {}),
          ...(tr.notFlown ? { notFlown: true } : {}),
          current: i === cur,
          revealed: tr.revealedAtS !== null,
          limitS: it.withinS,
        };
      }),
    };
  }

  /** test mode and no instructor has confirmed anything: nobody can hear the callouts */
  get soloTest(): boolean {
    return (
      this.mode === "test" && !this.tracks.some((t) => t.by === "instructor")
    );
  }

  result(): ProcedureResult {
    const p = this.procedure;
    const lang = p.lang;
    const solo = this.soloTest;
    const guided = this.mode === "training";
    // in a solo test a Done (callout) item can only be confirmed by a tap nobody hears: it is not graded
    const unassessed = (it: ProcItem) => solo && isManual(it);
    const items: ItemResult[] = p.items.map((it, i) => {
      const tr = this.tracks[i];
      return {
        id: it.id,
        done: tr.done,
        atS: tr.atS === null ? null : r1(tr.atS),
        inOrder: tr.inOrder,
        late: tr.late,
        // training shows the memory items on the card: 'from memory' is graded in a test only
        fromMemory: it.memory
          ? tr.done && (guided || tr.fromMemory || unassessed(it))
          : true,
        text: it.text,
        memory: it.memory,
        // not applicable any more (the restart worked): graded like an optional item, never missed
        optional: !!it.optional || tr.skipped,
        ...(tr.skipped ? { notApplicable: true } : {}),
        safety: isSafety(it) && !unassessed(it) && !tr.skipped,
        by: tr.by ?? undefined,
        limitS: it.withinS,
        lateByS: tr.late ? r1(tr.lateByS) : undefined,
        phase: phaseOfItem(it),
        assessed: !unassessed(it),
        revealed: tr.revealedAtS !== null,
      };
    });
    const outcome = this.outcome;
    const av = this.av;
    const env = this.envelope;
    const band = env.iasKt;
    const iasBandPct =
      band && this.bandTime > 0.5
        ? Math.round((100 * this.bandIn) / this.bandTime)
        : null;
    const maxBankDeg = Math.round(av.maxBank);
    const altLostFt =
      this.altAtFailure !== null && this.minAlt < Infinity
        ? Math.max(0, Math.round(this.altAtFailure - this.minAlt))
        : 0;
    const altInPct =
      env.altTolFt !== undefined && av.altTime > 0.5
        ? Math.round((100 * av.altIn) / av.altTime)
        : null;
    const controlLost = av.bankLost || av.stallLost || av.vne;
    const crashed = outcome === "crashed";
    const upsetAfter =
      av.postStallLost || av.postVne || av.exceeded.has("bank-after");
    const aviateOk = !crashed && !controlLost && !upsetAfter;

    // ---- items
    let wSum = 0,
      cSum = 0,
      bonus = 0;
    p.items.forEach((it, i) => {
      const r = items[i];
      if (r.optional) {
        if (r.done && it.optional) bonus += 1;
        return;
      }
      if (!r.assessed) return;
      const w = it.memory ? 3 : 1;
      wSum += w;
      if (!r.done) return;
      let c = 1;
      if (r.late) c -= 0.5;
      if (!r.inOrder) c -= 0.25;
      if (it.memory && !r.fromMemory) c -= 0.5;
      cSum += w * Math.max(0, c);
    });
    const itemFrac = wSum ? cSum / wSum : null;
    // ---- flight path: airspeed band, bank, altitude band, control (no stall, no VNE)
    const comps: [number, number][] = [];
    if (band) comps.push([10, (iasBandPct ?? 0) / 100]);
    const excess = Math.max(0, maxBankDeg - env.maxBankDeg);
    comps.push([5, Math.max(0, Math.min(1, 1 - excess / BANK_LOST_DEG))]);
    if (altInPct !== null) comps.push([5, altInPct / 100]);
    comps.push([5, av.stallLost || av.vne ? 0 : 1]);
    const pathFrac =
      comps.reduce((a, [w, f]) => a + w * f, 0) /
      comps.reduce((a, [w]) => a + w, 0);
    // ---- recognition: cue → first relevant action, against the procedure's target
    const target = this.recognitionTarget;
    const recog =
      this.actionAt !== null && this.cueAt !== null
        ? Math.max(0, this.actionAt - this.cueAt)
        : null;
    const recogFrac =
      target === null
        ? null
        : recog === null
          ? 0
          : Math.max(0, Math.min(1, (3 * target - recog) / (2 * target)));
    // ---- score: the parts that can be assessed share the 100 points
    const parts: [number, number][] = [];
    if (itemFrac !== null) parts.push([W_ITEMS, itemFrac]);
    parts.push([W_PATH, pathFrac]);
    if (recogFrac !== null) parts.push([W_RECOG, recogFrac]);
    const wTot = parts.reduce((a, [w]) => a + w, 0);
    const k = 100 / wTot;
    const itemsPts =
      itemFrac === null ? 0 : W_ITEMS * k * itemFrac + Math.min(5, bonus);
    const path = W_PATH * k * pathFrac;
    const reaction = recogFrac === null ? 0 : W_RECOG * k * recogFrac;
    let score = Math.round(Math.min(100, itemsPts + path + reaction));
    if (crashed) score = Math.min(score, 20);
    else if (controlLost || upsetAfter) score = Math.min(score, 50);

    // ---- verdict
    const memMissed = p.items.filter(
      (it, i) =>
        it.memory && !items[i].optional && items[i].assessed && !items[i].done,
    );
    const safetyBad = p.items.filter(
      (_it, i) =>
        items[i].safety &&
        !items[i].optional &&
        (!items[i].done || items[i].late),
    );
    const verdict: ProcedureResult["verdict"] =
      !aviateOk || memMissed.length || safetyBad.length || score < PASS_MARK
        ? "FAIL"
        : "PASS";

    // ---- the five parts of the emergency
    const req = (ph: ItemResult["phase"]) =>
      items.filter((x) => x.phase === ph && !x.optional && x.assessed);
    const mem = req("memory");
    const chk = req("checklist");
    const com = req("communicate");
    const cueS = this.cueS;
    const completedS =
      this.completedAt === null ? null : r1(this.completedAt - this.failedAtS);
    const phases: ProcPhases = {
      aviate: { ok: aviateOk },
      recognise: {
        cueS: cueS === null ? null : r1(cueS),
        actionS: recog === null ? null : r1(recog),
        targetS: target,
        ok: target === null ? null : recog !== null && recog <= target,
      },
      memory: {
        total: mem.length,
        done: mem.filter((x) => x.done).length,
        inTime: mem.filter((x) => x.done && !x.late).length,
        inOrder: mem.filter((x) => x.done && x.inOrder).length,
        fromMemory: mem.filter((x) => x.done && x.fromMemory).length,
        ok: mem.length
          ? mem.every((x) => x.done && !x.late && x.inOrder && x.fromMemory)
          : null,
      },
      checklist: {
        total: chk.length,
        done: chk.filter((x) => x.done).length,
        completedS,
        ok: chk.length ? chk.every((x) => x.done) : null,
      },
      communicate: {
        total: com.length,
        done: com.filter((x) => x.done).length,
        ok: com.length ? com.every((x) => x.done) : null,
      },
    };
    const aviate: ProcAviate = {
      maxBankLimitDeg: env.maxBankDeg,
      iasKt: band,
      altTolFt: env.altTolFt,
      maxBankDeg,
      minIasKt: av.minIas < Infinity ? Math.round(av.minIas) : null,
      maxIasKt: av.maxIas > 0 ? Math.round(av.maxIas) : null,
      altInPct,
      altDevMaxFt: Math.round(av.altDevMax),
      stallWarnS: r1(av.stallS),
      vneExceeded: av.vne,
      controlLost,
      after: {
        maxBankDeg: Math.round(av.postBank),
        stallWarnS: r1(av.postStallS),
        vneExceeded: av.postVne,
        crashed: crashed && this.completedAt !== null,
        upset: upsetAfter,
      },
      watchedAfterS: r1(av.watchedAfter),
      ok: aviateOk,
    };
    const timeline = this.events.map((e) =>
      e.kind === "item" || e.kind === "reveal"
        ? { ...e, text: p.items.find((x) => x.id === e.ref)?.text }
        : { ...e },
    );

    const res: ProcedureResult = {
      procedureId: p.id,
      title: p.title,
      failure: this.failure,
      failedAtS: this.failedAtS,
      reactionS: recog === null || this.followUpOf ? null : r1(recog),
      items,
      path: { iasBandPct, maxBankDeg, altLostFt },
      outcome,
      score,
      verdict,
      notes: [],
      lang,
      mode: this.mode,
      checklistOpenedS: this.checklistAt === null ? null : r1(this.checklistAt),
      breakdown: {
        items: r1(itemsPts),
        path: r1(path),
        reaction: r1(reaction),
      },
      targets: p.targets ? { ...p.targets } : undefined,
      followUpOf: this.followUpOf,
      soloTest: solo,
      cueS: cueS === null ? null : r1(cueS),
      recognitionS: recog === null ? null : r1(recog),
      recognitionTargetS: target,
      completedS,
      aviate,
      phases,
      timeline,
      guided,
      notAssessed: items.filter((x) => !x.assessed && !x.optional).length,
    };
    res.notes = debriefNotes(p, res);
    return res;
  }
}

// ------------------------------------------------------------------ plain-language debrief
const q = (s: string, lang: Lang) => (lang === "fr" ? `« ${s} »` : `“${s}”`);
export function fmtSeconds(s: number, lang: Lang): string {
  const v = s < 10 ? Math.round(s * 10) / 10 : Math.round(s);
  const txt = String(v);
  return `${lang === "fr" ? txt.replace(".", ",") : txt} s`;
}
function list(names: string[], lang: Lang): string {
  const shown = names.slice(0, 3).map((n) => q(n, lang));
  const more = names.length - shown.length;
  const and = lang === "fr" ? " et " : " and ";
  if (more > 0)
    return `${shown.join(", ")}${lang === "fr" ? ` et ${more} autre${more > 1 ? "s" : ""}` : ` and ${more} more`}`;
  return shown.length > 1
    ? `${shown.slice(0, -1).join(", ")}${and}${shown[shown.length - 1]}`
    : (shown[0] ?? "");
}

/** The debrief lines, most important first: Aviate, then recognition, memory flow, checklist, communicate. On a
 *  FAIL at most one positive line follows, and never one about something that was graded as a fault. Exported for
 *  the hub's help / preview. */
export function debriefNotes(p: Procedure, r: ProcedureResult): string[] {
  const lang = p.lang;
  const fr = lang === "fr";
  const S = (n: number) => fmtSeconds(n, lang);
  const notes: { pri: number; text: string }[] = [];
  const add = (pri: number, text: string) => notes.push({ pri, text });
  const byId = new Map(p.items.map((it) => [it.id, it]));
  const items = r.items;
  const assessed = (x: ItemResult) => x.assessed !== false;
  const av = r.aviate;

  // ---- aviate
  if (r.outcome === "crashed") {
    if (
      av?.after.crashed &&
      r.completedS !== null &&
      r.completedS !== undefined
    )
      add(
        0,
        fr
          ? "L’avion s’est écrasé après la fin de la check-list : la procédure ne s’arrête pas à la dernière ligne — pilotez jusqu’à l’arrêt complet."
          : "The aircraft crashed after the checklist was complete: the procedure does not end on its last line — fly the aircraft until it is stopped.",
      );
    else
      add(
        0,
        fr
          ? "L’avion s’est écrasé : priorité absolue au pilotage (vitesse, assiette, choix du terrain)."
          : "The aircraft crashed: fly the aircraft first (airspeed, attitude, choice of field).",
      );
  } else if (av) {
    const lim = av.maxBankLimitDeg;
    if (av.vneExceeded)
      add(
        0,
        fr
          ? `VNE dépassée (${VNE_KT} kt) pendant la procédure : contrôle de l’avion perdu.`
          : `VNE (${VNE_KT} KIAS) exceeded during the procedure: aircraft control was lost.`,
      );
    if (av.maxBankDeg > lim + BANK_LOST_DEG)
      add(
        0,
        fr
          ? `Inclinaison jusqu’à ${av.maxBankDeg}° (limite ${lim}°) : contrôle de l’avion perdu — pilotez d’abord.`
          : `Bank reached ${av.maxBankDeg}° (limit ${lim}°): aircraft control was lost — fly the aircraft first.`,
      );
    if (av.controlLost && av.stallWarnS >= STALL_WARN_S)
      add(
        0,
        fr
          ? `Avertisseur de décrochage pendant ${S(av.stallWarnS)} : rendez la main, tenez la vitesse.`
          : `Stall warning for ${S(av.stallWarnS)}: lower the nose and hold the airspeed.`,
      );
    if (av.after.upset)
      add(
        0,
        fr
          ? `Après la check-list : ${[
              av.after.vneExceeded ? "VNE dépassée" : "",
              av.after.maxBankDeg > POST_BANK_DEG
                ? `inclinaison ${av.after.maxBankDeg}°`
                : "",
              av.after.stallWarnS >= STALL_WARN_S
                ? "avertisseur de décrochage"
                : "",
            ]
              .filter(Boolean)
              .join(
                ", ",
              )} — le vol est noté jusqu’à la fin, pas seulement la check-list.`
          : `After the checklist: ${[
              av.after.vneExceeded ? "VNE exceeded" : "",
              av.after.maxBankDeg > POST_BANK_DEG
                ? `bank ${av.after.maxBankDeg}°`
                : "",
              av.after.stallWarnS >= STALL_WARN_S ? "stall warning" : "",
            ]
              .filter(Boolean)
              .join(
                ", ",
              )} — the flight is graded to its end, not only the checklist.`,
      );
  }

  // ---- recognise
  const target = r.recognitionTargetS ?? null;
  if (
    r.reactionS === null &&
    !r.followUpOf &&
    r.outcome !== "crashed" &&
    target !== null &&
    r.cueS !== null &&
    r.cueS !== undefined
  )
    add(
      1,
      fr
        ? "Aucune action de cette procédure après les premiers signes de la panne."
        : "No action of this procedure after the first signs of the failure.",
    );

  // ---- memory flow
  const memMissed = items.filter(
    (x) => x.memory && !x.optional && !x.done && assessed(x),
  );
  if (memMissed.length)
    add(
      1,
      fr
        ? `Action réflexe oubliée : ${list(
            memMissed.map((x) => x.text!),
            lang,
          )}. À faire de mémoire, sans la check-list.`
        : `Memory item missed: ${list(
            memMissed.map((x) => x.text!),
            lang,
          )}. It must be done from memory, without the checklist.`,
    );
  for (const x of items) {
    if (!x.safety || x.optional) continue;
    if (x.done && x.late)
      add(
        2,
        fr
          ? `${q(x.text!, lang)} : fait avec ${S(x.lateByS ?? 0)} de retard (limite ${S(x.limitS ?? 0)} après les premiers signes) — point critique, exercice échoué.`
          : `${q(x.text!, lang)} was ${S(x.lateByS ?? 0)} late (limit ${S(x.limitS ?? 0)} from the first signs): critical item, drill failed.`,
      );
    else if (!x.done && !x.memory)
      add(
        2,
        fr
          ? `Point critique non fait : ${q(x.text!, lang)}.`
          : `Critical item not done: ${q(x.text!, lang)}.`,
      );
  }
  for (const x of items)
    if (x.memory && x.done && !x.fromMemory)
      add(
        3,
        fr
          ? `${q(x.text!, lang)} : lu sur la check-list avant d’être fait — à connaître par cœur.`
          : `${q(x.text!, lang)} was read on the checklist before it was done: learn it as a memory item.`,
      );
  // out of order: name the item that should have come first
  for (const x of items) {
    if (!x.done || x.inOrder) continue;
    const k = p.items.findIndex((y) => y.id === x.id);
    const pendingThen = (j: number) =>
      !p.items[j].optional &&
      (!items[j].done || (items[j].atS ?? 0) > (x.atS ?? 0));
    const self = p.items[k];
    const prev =
      p.items.find(
        (it, j) =>
          j < k &&
          pendingThen(j) &&
          !isManual(it) &&
          items[j].by !== "verified" &&
          natureOf(it) === natureOf(self) &&
          (p.ordered || (it.memory && self.memory)),
      ) ?? p.items.find((_it, j) => j < k && pendingThen(j));
    add(
      x.memory ? 4 : 6,
      prev
        ? fr
          ? `${q(x.text!, lang)} : fait avant ${q(prev.text, lang)} — respectez l’ordre de la procédure.`
          : `${q(x.text!, lang)} was done before ${q(prev.text, lang)}: follow the order of the procedure.`
        : fr
          ? `${q(x.text!, lang)} : fait dans le désordre.`
          : `${q(x.text!, lang)} was done out of order.`,
    );
  }
  // ---- checklist / communicate
  const missed = items.filter(
    (x) => !x.memory && !x.optional && !x.done && !x.safety && assessed(x),
  );
  if (missed.length)
    add(
      5,
      fr
        ? `Non fait : ${list(
            missed.map((x) => x.text!),
            lang,
          )}.`
        : `Not done: ${list(
            missed.map((x) => x.text!),
            lang,
          )}.`,
    );
  for (const x of items)
    if (x.done && x.late && !x.safety)
      add(
        6,
        fr
          ? `${q(x.text!, lang)} : fait avec ${S(x.lateByS ?? 0)} de retard (limite ${S(x.limitS ?? 0)}).`
          : `${q(x.text!, lang)} was ${S(x.lateByS ?? 0)} late (limit ${S(x.limitS ?? 0)}).`,
      );
  // ---- flight path (within the limits)
  const band = p.targets?.iasKt;
  if (band && r.path.iasBandPct !== null && r.path.iasBandPct < 80)
    add(
      7,
      fr
        ? `Vitesse dans la plage ${band[0]}–${band[1]} kt seulement ${r.path.iasBandPct} % du temps (visez au moins 80 %).`
        : `Airspeed in the ${band[0]}–${band[1]} kt band only ${r.path.iasBandPct} % of the time (aim for at least 80 %).`,
    );
  const bankLim = av?.maxBankLimitDeg ?? p.targets?.maxBankDeg;
  if (
    bankLim !== undefined &&
    r.path.maxBankDeg > bankLim &&
    r.path.maxBankDeg <= bankLim + BANK_LOST_DEG
  )
    add(
      7,
      fr
        ? `Inclinaison jusqu’à ${r.path.maxBankDeg}° (limite ${bankLim}°).`
        : `Bank reached ${r.path.maxBankDeg}° (limit ${bankLim}°).`,
    );
  if (
    av &&
    av.altInPct !== null &&
    av.altTolFt !== undefined &&
    av.altInPct < 80
  )
    add(
      7,
      fr
        ? `Altitude tenue à ±${av.altTolFt} ft seulement ${av.altInPct} % du temps (écart max ${av.altDevMaxFt} ft) : pilotez l’avion pendant la procédure.`
        : `Altitude held within ±${av.altTolFt} ft only ${av.altInPct} % of the time (largest deviation ${av.altDevMaxFt} ft): keep flying the aircraft during the procedure.`,
    );
  if (
    r.reactionS !== null &&
    target !== null &&
    r.reactionS > target &&
    !r.followUpOf
  )
    add(
      8,
      fr
        ? `Première action de la procédure ${S(r.reactionS)} après les premiers signes (visez ${S(target)} au plus) : pilotez, identifiez, agissez.`
        : `First action of the procedure ${S(r.reactionS)} after the first signs (aim for ${S(target)} or less): fly, identify, act.`,
    );
  if (r.verdict === "FAIL" && r.score < PASS_MARK && r.outcome !== "crashed")
    add(
      9,
      fr
        ? `Note ${r.score}/100, sous le seuil de réussite de ${PASS_MARK}.`
        : `Score ${r.score}/100, below the pass mark of ${PASS_MARK}.`,
    );
  if (r.outcome === "landed" && missed.length + memMissed.length > 0)
    add(
      9,
      fr
        ? "Posé avant la fin de la procédure."
        : "Landed before the procedure was finished.",
    );
  if (r.notAssessed)
    add(
      10,
      fr
        ? `${r.notAssessed} annonce${r.notAssessed > 1 ? "s" : ""} non évaluée${r.notAssessed > 1 ? "s" : ""} : en test sans instructeur, personne ne peut les entendre.`
        : `${r.notAssessed} callout${r.notAssessed > 1 ? "s" : ""} not assessed: in a test without an instructor nobody can hear them.`,
    );

  // what went well (after the things to fix)
  const good: string[] = [];
  const mem = items.filter((x) => x.memory && !x.optional && assessed(x));
  // (only when the pilot actually did something: wings that happened to be level are no achievement)
  if (
    mem.length &&
    (r.reactionS !== null || !!r.followUpOf) &&
    mem.every((x) => x.done && x.fromMemory && x.inOrder && !x.late)
  )
    good.push(
      r.guided
        ? fr
          ? "Actions réflexes faites dans l’ordre et dans les temps."
          : "Memory items done in order and in time."
        : fr
          ? "Actions réflexes faites de mémoire, dans l’ordre et dans les temps."
          : "Memory items done from memory, in order and in time.",
    );
  if (r.reactionS !== null && target !== null && r.reactionS <= target)
    good.push(
      fr
        ? `Première action ${S(r.reactionS)} après les premiers signes de la panne.`
        : `First action ${S(r.reactionS)} after the first signs of the failure.`,
    );
  if (band && r.path.iasBandPct !== null && r.path.iasBandPct >= 80)
    good.push(
      fr
        ? `Vitesse tenue dans la plage ${band[0]}–${band[1]} kt ${r.path.iasBandPct} % du temps.`
        : `Airspeed held in the ${band[0]}–${band[1]} kt band ${r.path.iasBandPct} % of the time.`,
    );
  if (
    r.outcome === "landed" ||
    (r.outcome === "completed" &&
      items.some((x) => byId.get(x.id)?.check?.id === "landed" && x.done))
  )
    good.push(fr ? "Atterrissage réussi." : "Landed safely.");

  notes.sort((a, b) => a.pri - b.pri);
  const out = notes.map((n) => n.text);
  if (!out.length || (r.verdict === "PASS" && notes.every((n) => n.pri >= 10)))
    out.unshift(
      fr
        ? `Procédure ${q(p.title, lang)} bien exécutée : ${r.score}/100.`
        : `${q(p.title, lang)} flown correctly: ${r.score}/100.`,
    );
  // a FAIL: one positive line at most, never next to a crash or a loss of control
  const keep =
    r.verdict === "FAIL"
      ? av?.ok === false || r.outcome === "crashed"
        ? 0
        : 1
      : good.length;
  return [...out, ...good.slice(0, keep)];
}
// ------------------------------------------------------------------ drill session
/** strip the language suffix of an id ('c172.engineFire.fr' → 'c172.engineFire') */
export function baseId(id: string): string {
  return id.replace(/\.(fr|en)$/, "");
}

function applies(p: Procedure, view?: ProcSimView): boolean {
  if (!p.when) return true;
  if (!view) return false;
  if (p.when.onGround !== undefined && p.when.onGround !== view.onGround)
    return false;
  if (
    p.when.aglFt &&
    (view.onGround ||
      view.aglFt < p.when.aglFt[0] ||
      view.aglFt > p.when.aglFt[1])
  )
    return false;
  if (p.when.cockpit?.length && !p.when.cockpit.includes(view.cockpit ?? "g1000"))
    return false;
  if (p.when.region && p.when.region !== (view.region ?? "faa")) return false;
  return true;
}

/** the family a procedure belongs to (its variants share it): `group`, else its own base id */
const groupOf = (p: Procedure) => p.group ?? baseId(p.basedOn ?? p.id);

/**
 * Which procedure answers a failure: the expected id (a club version of it first; another language variant if
 * that is all there is), else a CLUB procedure that lists the failure, else the library one in `lang`. Several
 * candidates: the first that applies to the current phase (`when`), preferring `lang`. Null when nothing fits.
 */
export function pickProcedure(
  list: Procedure[],
  failure: FailureKey | null,
  lang: Lang,
  expectId?: string,
  view?: ProcSimView,
): Procedure | null {
  if (expectId) {
    // a variant family (G1000 / classic panel, FAA / ICAO airspace): the expected procedure does not apply where
    // the failure happens but a sibling does — run the sibling (the alternator drill on the classic panel runs the
    // classic-panel LOW VOLTS checklist, the lost-comms drill in France runs SERA.14083)
    const eb = baseId(expectId);
    const sameBase = (p: Procedure) =>
      baseId(p.id) === eb || (!!p.basedOn && baseId(p.basedOn) === eb);
    const own = list.filter(sameBase);
    const fam = own.find((p) => p.group)?.group;
    if (view && fam && own.length && !own.some((p) => applies(p, view))) {
      const sib = list.filter(
        (p) => !sameBase(p) && groupOf(p) === fam && applies(p, view),
      );
      const club = sib.filter((p) => p.source === "club");
      const lib = sib.filter((p) => p.source !== "club");
      const hit =
        club.find((p) => p.lang === lang) ??
        club[0] ??
        lib.find((p) => p.lang === lang) ??
        lib[0];
      if (hit) return hit;
    }
    const exact = list.find((p) => p.id === expectId);
    const club = list.filter(
      (p) => p.source === "club" && p.basedOn === expectId,
    );
    if (club.length) return club.find((p) => p.lang === lang) ?? club[0];
    if (exact) return exact;
    const b = baseId(expectId);
    const same = list.filter(
      (p) => baseId(p.id) === b || (p.basedOn && baseId(p.basedOn) === b),
    );
    const pref = same
      .filter((p) => p.source === "club")
      .concat(same.filter((p) => p.source !== "club"));
    const hit = pref.find((p) => p.lang === lang) ?? pref[0];
    if (hit) return hit;
  }
  if (!failure) return null;
  const cands = list.filter((p) => p.failures.includes(failure));
  if (!cands.length) return null;
  // the phase decides first (a procedure written for this phase — take-off roll, EFATO — beats a general one, even
  // a club one: customising the in-flight restart must not take over the EFATO), then club before library, then
  // the language
  const specific = cands.filter((p) => p.when && applies(p, view));
  const generic = cands.filter((p) => !p.when);
  const pickIn = (pool: Procedure[]): Procedure | null => {
    const club = pool.filter((p) => p.source === "club");
    const lib = pool.filter((p) => p.source !== "club");
    return (
      club.find((p) => p.lang === lang) ??
      club[0] ??
      lib.find((p) => p.lang === lang) ??
      lib[0] ??
      null
    );
  };
  return pickIn(specific) ?? pickIn(generic) ?? pickIn(cands);
}

export interface DrillSessionOpts {
  mode: DrillMode;
  /** language of the procedures to pick (default: the UI language at start) */
  lang?: Lang | (() => Lang);
  /** the effective procedure list (club overrides + library); default: procedureStore.effectiveProcedures() */
  procedures?: () => Procedure[];
  /** called when a runner starts (the panel opens the emergency card) */
  onStart?: (r: ProcedureRunner) => void;
}

/** All the procedures of one flight: one runner per failure (plus follow-ups such as restart → forced landing). */
export class DrillSession {
  readonly mode: DrillMode;
  runners: ProcedureRunner[] = [];
  private opts: DrillSessionOpts;
  private followed = new Set<ProcedureRunner>();
  /** per runner with a `then.unless`: did the condition hold since the failure, and since when is it lost */
  private watch = new Map<ProcedureRunner, { held: boolean; lostAt: number | null }>();

  constructor(opts: DrillSessionOpts) {
    this.opts = opts;
    this.mode = opts.mode;
  }

  private lang(): Lang {
    const l = this.opts.lang;
    return typeof l === "function" ? l() : (l ?? uiLang());
  }

  private list(): Procedure[] {
    return this.opts.procedures ? this.opts.procedures() : defaultProcedures();
  }

  /** the procedure that would be started for this failure (builder suggestion, instructor 'expect' default) */
  pick(
    failure: FailureKey | null,
    expectId?: string,
    view?: ProcSimView,
  ): Procedure | null {
    return pickProcedure(this.list(), failure, this.lang(), expectId, view);
  }

  /** start grading the procedure for a failure fired at `atS` (sim time). Null when no procedure answers it, or
   *  when the same procedure is already running for this failure. */
  start(
    failure: FailureKey,
    atS: number,
    expectId?: string,
    view?: ProcSimView,
  ): ProcedureRunner | null {
    return this.begin(this.pick(failure, expectId, view), failure, atS, view);
  }

  private begin(
    proc: Procedure | null,
    failure: FailureKey,
    atS: number,
    view?: ProcSimView,
    followUpOf?: string,
    resolveWhen?: CheckRef,
  ): ProcedureRunner | null {
    if (!proc) return null;
    // the items of this cockpit only (STBY BATT exists on the G1000, not on the classic panel)
    proc = procedureForCockpit(proc, view?.cockpit);
    if (
      this.runners.some(
        (r) =>
          !r.finished && r.failure === failure && r.procedure.id === proc.id,
      )
    )
      return null;
    const r = new ProcedureRunner(proc, this.mode, failure, atS, {
      followUpOf,
      resolveWhen,
    });
    this.runners.push(r);
    if (view && view.t >= atS) r.update(view);
    this.opts.onStart?.(r);
    return r;
  }

  update(view: ProcSimView) {
    for (const r of [...this.runners]) {
      r.update(view);
      const then = r.procedure.then;
      if (!then || this.followed.has(r)) continue;
      if (r.finished && (r.outcome === "crashed" || r.outcome === "landed")) {
        this.followed.add(r);
        continue;
      }
      const el = view.t - r.failedAtS;
      // `unless` (e.g. 'engine running'): nothing follows while it holds
      const d = checkDef(then.unless);
      const holds =
        !!d &&
        d.evaluate(view, then.unless!.p, {
          failedAtS: r.failedAtS,
          elapsedS: el,
        });
      let w = this.watch.get(r);
      if (!w) this.watch.set(r, (w = { held: false, lostAt: null }));
      if (holds) {
        w.held = true;
        w.lostAt = null;
      } else w.lostAt ??= view.t;
      // a follow-up (forced landing) only makes sense in flight: once on the ground (landed after the oil pressure
      // drill, engine shut down on the apron) nothing follows any more
      if (view.onGround) {
        if (view.stopped && r.finished) this.followed.add(r);
        continue;
      }
      if (holds) continue;
      let at = view.t;
      let due =
        r.finished || (then.afterS !== undefined && el >= then.afterS);
      // the condition held after the failure and is lost (the engine seized / quit): the follow-up starts once it
      // has been lost for FOLLOW_LOST_S (a restart in progress is not a forced landing yet), whatever the first
      // procedure's progress, and its clock starts when the condition was lost
      if (d && w.held) {
        // a restart procedure (it has a restart window, `afterS`) still being worked through (selector, pump,
        // mixture, magnetos…): the restart is given its time first. Its flow done and still no power, or an engine
        // that seized (low oil pressure: nothing to restart): the forced landing.
        const restarting = then.afterS !== undefined && !r.isComplete;
        const wait = restarting ? FOLLOW_RESTART_S : FOLLOW_LOST_S;
        due = view.t - w.lostAt! >= wait - 1e-6;
        at = w.lostAt!;
      }
      if (!due) continue;
      this.followed.add(r);
      r.finish();
      // in the language of the procedure it follows
      const next = pickProcedure(this.list(), r.failure, r.procedure.lang, then.procedure, view);
      this.begin(next, r.failure, at, view, r.procedure.id, then.unless);
    }
  }

  /** the runner the panel shows: the latest one still running, else the latest one */
  active(): ProcedureRunner | null {
    for (let i = this.runners.length - 1; i >= 0; i--)
      if (!this.runners[i].finished) return this.runners[i];
    return this.runners[this.runners.length - 1] ?? null;
  }

  openChecklist() {
    this.active()?.openChecklist();
  }

  /** confirm an item on the runner that has it (the active one first) */
  confirm(
    itemId: string,
    by: "student" | "instructor",
    procedureId?: string,
  ): boolean {
    const order = [this.active(), ...[...this.runners].reverse()].filter(
      (r): r is ProcedureRunner =>
        !!r && (!procedureId || r.procedure.id === procedureId),
    );
    return order.some((r) => r.confirm(itemId, by));
  }

  states(): ProcedureRunState[] {
    return this.runners.map((r) => r.state());
  }

  /** stop every runner (end of the lesson) */
  finish() {
    this.runners.forEach((r) => r.finish());
  }

  results(): ProcedureResult[] {
    return this.runners.map((r) => r.result());
  }
}

function defaultProcedures(): Procedure[] {
  return effectiveProcedures();
}
