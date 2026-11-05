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
import { effectiveProcedures } from "./procedureStore";
import { lang as uiLang } from "../ui/i18n";
import type {
  DrillMode,
  ItemResult,
  Lang,
  ProcItem,
  Procedure,
  ProcedureResult,
  ProcedureRunState,
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
  };
}

// ------------------------------------------------------------------ runner
export const PASS_MARK = 70;
/** a follow-up's `unless` condition that held after the failure must be lost this long (s) to start it */
export const FOLLOW_LOST_S = 15;
const GRACE_S = 0.5;
/** IAS band time counts from the first entry into the band, or this long after the failure */
const BAND_SETTLE_S = 20;

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

function controlsChanged(v: ProcSimView, b: ProcSimView): boolean {
  if (Math.abs(v.controls.throttle - b.controls.throttle) >= 0.05) return true;
  if (Math.round(v.controls.flaps) !== Math.round(b.controls.flaps))
    return true;
  if (!v.apEngaged && !b.apEngaged) {
    if (Math.abs(v.controls.elevator - b.controls.elevator) >= 0.2) return true;
    if (Math.abs(v.controls.aileron - b.controls.aileron) >= 0.2) return true;
    if (Math.abs(v.controls.rudder - b.controls.rudder) >= 0.2) return true;
  }
  for (const k of Object.keys(v.sw) as (keyof Switches)[]) {
    const a = v.sw[k],
      c = b.sw[k];
    if (typeof a === "number" ? Math.abs(a - (c as number)) >= 0.05 : a !== c)
      return true;
  }
  if (v.xpdr !== b.xpdr || v.cdi !== b.cdi) return true;
  // the system drops a failed autopilot by itself and a failed GPS loses its direct-to by itself: only what the
  // pilot does counts (engaging the AP, disconnecting a healthy one, a new direct-to)
  if (v.apEngaged !== b.apEngaged && (v.apEngaged || !v.apFailed)) return true;
  if (v.directTo !== null && v.directTo !== b.directTo) return true;
  if (v.timerRunning !== b.timerRunning) return true;
  return v.com.some(
    (r, i) => r.active !== b.com[i]?.active || r.standby !== b.com[i]?.standby,
  );
}

export class ProcedureRunner {
  readonly procedure: Procedure;
  readonly mode: DrillMode;
  readonly failure: FailureKey;
  readonly failedAtS: number;
  /** id of the procedure this one follows (restart → forced landing): its reaction time is not graded again */
  readonly followUpOf: string | undefined;
  private tracks: Track[];
  private lastT: number;
  private started = false;
  private base: ProcSimView | null = null;
  private reactionS: number | null = null;
  private checklistAt: number | null = null;
  private finishedAs: ProcedureResult["outcome"] | null = null;
  private altAtFailure: number | null = null;
  private minAlt = Infinity;
  private maxBank = 0;
  private bandStarted = false;
  private bandTime = 0;
  private bandIn = 0;
  private wasAirborne = false;

  constructor(
    procedure: Procedure,
    mode: DrillMode,
    failure: FailureKey,
    failedAtS: number,
    opts: { followUpOf?: string } = {},
  ) {
    this.procedure = procedure;
    this.mode = mode;
    this.failure = failure;
    this.failedAtS = failedAtS;
    this.followUpOf = opts.followUpOf;
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
    }));
  }

  get finished(): boolean {
    return this.finishedAs !== null;
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

  /** stop grading (lesson ended, follow-up procedure started...) */
  finish(outcome?: ProcedureResult["outcome"]) {
    if (this.finishedAs) return;
    this.finishedAs =
      outcome ?? (this.requiredDone() ? "completed" : "incomplete");
  }

  openChecklist() {
    if (this.checklistAt === null) this.checklistAt = this.elapsedS;
    if (this.reactionS === null && this.started) this.reactionS = this.elapsedS;
  }

  /** Done button (student) or instructor confirmation. The student may confirm manual items and items that were
   *  already right at the failure (verified); the instructor may confirm any item. */
  confirm(itemId: string, by: "student" | "instructor"): boolean {
    if (this.finishedAs) return false;
    const i = this.procedure.items.findIndex((x) => x.id === itemId);
    if (i < 0 || this.tracks[i].done) return false;
    const it = this.procedure.items[i];
    if (by === "student" && !isManual(it) && !this.tracks[i].preSat)
      return false;
    if (this.reactionS === null) this.reactionS = this.elapsedS;
    this.complete(i, this.elapsedS, by);
    this.chainVerified();
    this.checkCompletion();
    return true;
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
      items.forEach((it, i) => {
        const d = checkDef(it.check);
        if (d && d.kind === "action" && d.evaluate(view, it.check!.p, ctx))
          this.tracks[i].preSat = true;
        if (d && d.kind === "path" && d.evaluate(view, it.check!.p, ctx))
          this.tracks[i].pathInit = true;
      });
    } else if (this.reactionS === null && this.base) {
      if (controlsChanged(view, this.base)) this.reactionS = el;
      // while the autopilot flies (and the frame it drops out) the yoke follows it: rebase, so that only the pilot's
      // own yoke inputs count afterwards
      else if (view.apEngaged || this.base.apEngaged)
        this.base = { ...this.base, controls: view.controls, apEngaged: view.apEngaged };
    }
    // flight path
    if (!view.onGround) {
      this.wasAirborne = true;
      this.minAlt = Math.min(this.minAlt, view.altFt);
      this.maxBank = Math.max(this.maxBank, Math.abs(view.bankDeg));
      const band = this.procedure.targets?.iasKt;
      if (band) {
        const inBand = view.iasKt >= band[0] && view.iasKt <= band[1];
        if (!this.bandStarted && (inBand || el >= BAND_SETTLE_S))
          this.bandStarted = true;
        if (this.bandStarted) {
          this.bandTime += dt;
          if (inBand) this.bandIn += dt;
        }
      }
    } else this.minAlt = Math.min(this.minAlt, view.altFt);
    // items
    items.forEach((it, i) => {
      const tr = this.tracks[i];
      if (tr.done) return;
      const d = checkDef(it.check);
      if (!d || d.kind === "manual") return;
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
      tr.trueSince ??= t;
      if (t - tr.trueSince >= d.holdS(it.check!.p) - 1e-6)
        this.complete(i, Math.max(0, tr.trueSince - this.failedAtS), "auto");
    });
    this.chainVerified();
    // outcome
    if (view.crashed) this.finishedAs = "crashed";
    else if (view.onGround && view.stopped && this.wasAirborne)
      this.finishedAs = this.requiredDone() ? "completed" : "landed";
    else this.checkCompletion();
  }

  private requiredDone() {
    return this.procedure.items.every(
      (it, i) => it.optional || this.tracks[i].done,
    );
  }
  private checkCompletion() {
    if (this.requiredDone() && this.procedure.items.some((it) => !it.optional))
      this.finishedAs = "completed";
  }

  /** items that were already right at the failure: credited when the pilot moves past them */
  private chainVerified() {
    // only the pilot's own steps through the list count (switches, controls, Done buttons), not an airspeed or
    // attitude that happened to be right at the failure
    const items = this.procedure.items;
    const step = (j: number) => this.tracks[j].done && this.tracks[j].by !== "verified" && natureOf(items[j]) !== "path";
    for (let pass = 0; pass < 2; pass++)
      items.forEach((_it, i) => {
        const tr = this.tracks[i];
        if (tr.done || !tr.preSat) return;
        let at = Infinity;
        for (let j = i + 1; j < items.length; j++) if (step(j)) at = Math.min(at, this.tracks[j].atS!);
        let prev = -1;
        for (let j = i - 1; j >= 0; j--)
          if (natureOf(items[j]) !== "path") {
            prev = j;
            break;
          }
        if (prev >= 0 && this.tracks[prev].done) at = Math.min(at, this.tracks[prev].atS!);
        if (prev < 0 && this.reactionS !== null) at = Math.min(at, this.reactionS);
        if (at < Infinity) this.complete(i, at, "verified");
      });
  }

  /** reference time of the time limit of item i (s after the failure) */
  private limitRef(i: number): number {
    const it = this.procedure.items[i];
    if (it.memory) return 0;
    for (let j = i - 1; j >= 0; j--)
      if (this.tracks[j].done) return this.tracks[j].atS!;
    return 0;
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
          if (o.optional || oj.done || oj.preSat || isManual(o) || natureOf(o) !== nat) continue;
          if (this.procedure.ordered || (it.memory && o.memory)) {
            tr.inOrder = false;
            tr.before = o.id;
            break;
          }
        }
      if (it.withinS !== undefined) {
        tr.limitRefS = this.limitRef(i);
        const late = atS - tr.limitRefS - it.withinS;
        if (late > GRACE_S) {
          tr.late = true;
          tr.lateByS = late;
        }
      }
    }
    if (it.memory && this.checklistAt !== null && atS > this.checklistAt + 1e-6)
      tr.fromMemory = false;
  }

  state(): ProcedureRunState {
    const p = this.procedure;
    const el = this.elapsedS;
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
      items: p.items.map((it, i) => {
        const tr = this.tracks[i];
        let due: number | null = null;
        let late = tr.late;
        if (!tr.done && !tr.preSat && it.withinS !== undefined) {
          due = this.limitRef(i) + it.withinS - el;
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
        };
      }),
    };
  }

  /** test mode and no instructor has confirmed anything: nobody can hear the callouts */
  get soloTest(): boolean {
    return this.mode === "test" && !this.tracks.some((t) => t.by === "instructor");
  }

  result(): ProcedureResult {
    const p = this.procedure;
    const lang = p.lang;
    const solo = this.soloTest;
    // in a solo test a Done (callout) item can only be confirmed from the checklist: graded as a checklist item,
    // never 'from memory' nor safety-critical
    const relaxed = (it: ProcItem) => solo && isManual(it);
    const items: ItemResult[] = p.items.map((it, i) => {
      const tr = this.tracks[i];
      return {
        id: it.id,
        done: tr.done,
        atS: tr.atS,
        inOrder: tr.inOrder,
        late: tr.late,
        fromMemory: it.memory ? tr.done && (tr.fromMemory || relaxed(it)) : true,
        text: it.text,
        memory: it.memory,
        optional: !!it.optional,
        safety: isSafety(it) && !relaxed(it),
        by: tr.by ?? undefined,
        limitS: it.withinS,
        lateByS: tr.late ? Math.round(tr.lateByS * 10) / 10 : undefined,
      };
    });
    const outcome = this.outcome;
    const band = p.targets?.iasKt;
    const iasBandPct =
      band && this.bandTime > 0.5
        ? Math.round((100 * this.bandIn) / this.bandTime)
        : null;
    const maxBankDeg = Math.round(this.maxBank);
    const altLostFt =
      this.altAtFailure !== null && this.minAlt < Infinity
        ? Math.max(0, Math.round(this.altAtFailure - this.minAlt))
        : 0;

    // ---- score
    let wSum = 0,
      cSum = 0,
      bonus = 0;
    p.items.forEach((it, i) => {
      const r = items[i];
      if (it.optional) {
        if (r.done) bonus += 1;
        return;
      }
      const w = it.memory && !relaxed(it) ? 3 : 1;
      wSum += w;
      if (!r.done) return;
      let c = 1;
      if (r.late) c -= 0.5;
      if (!r.inOrder) c -= 0.25;
      if (it.memory && !r.fromMemory) c -= 0.5;
      cSum += w * Math.max(0, c);
    });
    const itemFrac = wSum ? cSum / wSum : 1;
    const hasIas = !!band;
    const hasBank = p.targets?.maxBankDeg !== undefined;
    const pathW = hasIas || hasBank ? 20 : 0;
    // a follow-up's reaction was graded on the procedure it follows: its 10 points go to the items
    const gradeReaction = !this.followUpOf;
    const itemsW = (gradeReaction ? 90 : 100) - pathW;
    let path = 0;
    if (hasIas) path += (hasBank ? 15 : 20) * ((iasBandPct ?? 0) / 100);
    if (hasBank) {
      const excess = Math.max(0, maxBankDeg - p.targets!.maxBankDeg!);
      path += (hasIas ? 5 : 20) * Math.max(0, Math.min(1, 1 - excess / 15));
    }
    const r = gradeReaction ? this.reactionS : null;
    const reaction =
      r === null ? 0 : 10 * Math.max(0, Math.min(1, (15 - r) / 12));
    const itemsPts = itemsW * itemFrac + Math.min(5, bonus);
    let score = Math.round(Math.min(100, itemsPts + path + reaction));
    if (outcome === "crashed") score = Math.min(score, 20);

    // ---- verdict
    const memMissed = p.items.filter(
      (it, i) => it.memory && !it.optional && !relaxed(it) && !items[i].done,
    );
    const safetyBad = p.items.filter(
      (it, i) =>
        items[i].safety && !it.optional && (!items[i].done || items[i].late),
    );
    const verdict: ProcedureResult["verdict"] =
      outcome === "crashed" ||
      memMissed.length ||
      safetyBad.length ||
      score < PASS_MARK
        ? "FAIL"
        : "PASS";

    const res: ProcedureResult = {
      procedureId: p.id,
      title: p.title,
      failure: this.failure,
      failedAtS: this.failedAtS,
      reactionS: r === null ? null : Math.round(r * 10) / 10,
      items,
      path: { iasBandPct, maxBankDeg, altLostFt },
      outcome,
      score,
      verdict,
      notes: [],
      lang,
      mode: this.mode,
      checklistOpenedS:
        this.checklistAt === null
          ? null
          : Math.round(this.checklistAt * 10) / 10,
      breakdown: {
        items: Math.round(itemsPts * 10) / 10,
        path: Math.round(path * 10) / 10,
        reaction: Math.round(reaction * 10) / 10,
      },
      targets: p.targets ? { ...p.targets } : undefined,
      followUpOf: this.followUpOf,
      soloTest: solo,
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

/** The debrief lines, most important first. Exported for the hub's help / preview. */
export function debriefNotes(p: Procedure, r: ProcedureResult): string[] {
  const lang = p.lang;
  const fr = lang === "fr";
  const S = (n: number) => fmtSeconds(n, lang);
  const notes: { pri: number; text: string }[] = [];
  const add = (pri: number, text: string) => notes.push({ pri, text });
  const byId = new Map(p.items.map((it) => [it.id, it]));
  const items = r.items;
  // solo test: Done (callout) items are checklist confirmations (see ProcedureRunner.result)
  const relaxed = (x: ItemResult) => {
    const it = byId.get(x.id);
    return !!r.soloTest && !!it && isManual(it);
  };

  if (r.outcome === "crashed")
    add(
      0,
      fr
        ? "L’avion s’est écrasé : priorité absolue au pilotage (vitesse, assiette, choix du terrain)."
        : "The aircraft crashed: fly the aircraft first (airspeed, attitude, choice of field).",
    );
  if (r.reactionS === null && !r.followUpOf && r.outcome !== "crashed")
    add(
      1,
      fr
        ? "Aucune réaction à la panne n’a été détectée."
        : "No reaction to the failure was detected.",
    );

  const memMissed = items.filter(
    (x) => x.memory && !x.optional && !x.done && !relaxed(x),
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
          ? `${q(x.text!, lang)} : fait avec ${S(x.lateByS ?? 0)} de retard (à ${S(x.atS ?? 0)}, limite ${S(x.limitS ?? 0)}) — point critique, exercice échoué.`
          : `${q(x.text!, lang)} was ${S(x.lateByS ?? 0)} late (done at ${S(x.atS ?? 0)}, limit ${S(x.limitS ?? 0)}): critical item, drill failed.`,
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
          ? `${q(x.text!, lang)} : fait seulement après l’ouverture de la check-list — à connaître par cœur.`
          : `${q(x.text!, lang)} was done only after opening the checklist: learn it as a memory item.`,
      );
  // out of order: name the item that should have come first
  for (const x of items) {
    if (!x.done || x.inOrder) continue;
    // the earlier item that should have come first: one that takes part in the order like this one does (same
    // nature, not a Done item, not one that was already right), else any earlier one still pending at the time
    const k = p.items.findIndex((y) => y.id === x.id);
    const pendingThen = (j: number) =>
      !p.items[j].optional && (!items[j].done || (items[j].atS ?? 0) > (x.atS ?? 0));
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
  const missed = items.filter(
    (x) => !x.memory && !x.optional && !x.done && !x.safety && !relaxed(x),
  );
  const callouts = items.filter((x) => !x.optional && !x.done && relaxed(x));
  if (callouts.length)
    add(
      5,
      fr
        ? `Annonces non confirmées : ${list(
            callouts.map((x) => x.text!),
            lang,
          )}. En test sans instructeur, touchez « Fait » dans la check-list.`
        : `Callouts not confirmed: ${list(
            callouts.map((x) => x.text!),
            lang,
          )}. In a test without an instructor, tap Done in the checklist.`,
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
  const band = p.targets?.iasKt;
  if (band && r.path.iasBandPct !== null && r.path.iasBandPct < 80)
    add(
      7,
      fr
        ? `Vitesse dans la plage ${band[0]}–${band[1]} kt seulement ${r.path.iasBandPct} % du temps (visez au moins 80 %).`
        : `Airspeed in the ${band[0]}–${band[1]} kt band only ${r.path.iasBandPct} % of the time (aim for at least 80 %).`,
    );
  const bankLim = p.targets?.maxBankDeg;
  if (bankLim !== undefined && r.path.maxBankDeg > bankLim)
    add(
      7,
      fr
        ? `Inclinaison jusqu’à ${r.path.maxBankDeg}° (limite ${bankLim}°).`
        : `Bank reached ${r.path.maxBankDeg}° (limit ${bankLim}°).`,
    );
  if (r.reactionS !== null && r.reactionS > 5 && !r.followUpOf)
    add(
      8,
      fr
        ? `Première action ${S(r.reactionS)} après la panne : visez moins de 3 s — pilotez d’abord, puis agissez.`
        : `First action ${S(r.reactionS)} after the failure: aim for under 3 s — fly the aircraft, then act.`,
    );
  if (r.verdict === "FAIL" && r.score < PASS_MARK && r.outcome !== "crashed")
    add(
      9,
      fr
        ? `Note ${r.score}/100, sous le seuil de réussite de ${PASS_MARK}.`
        : `Score ${r.score}/100, below the pass mark of ${PASS_MARK}.`,
    );
  if (
    r.outcome === "landed" &&
    missed.length + memMissed.length + callouts.length > 0
  )
    add(
      9,
      fr
        ? "Posé avant la fin de la procédure."
        : "Landed before the procedure was finished.",
    );

  // what went well (after the things to fix)
  const good: string[] = [];
  const mem = items.filter((x) => x.memory && !x.optional && !relaxed(x));
  // (only when the pilot actually did something: wings that happened to be level are no achievement)
  if (
    mem.length &&
    (r.reactionS !== null || !!r.followUpOf) &&
    mem.every((x) => x.done && x.fromMemory && x.inOrder && !x.late)
  )
    good.push(
      fr
        ? "Actions réflexes faites de mémoire, dans l’ordre et dans les temps."
        : "Memory items done from memory, in order and in time.",
    );
  if (r.reactionS !== null && r.reactionS <= 5)
    good.push(
      fr
        ? `Temps de réaction ${S(r.reactionS)}.`
        : `Reaction time ${S(r.reactionS)}.`,
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
  if (!out.length)
    out.push(
      fr
        ? `Procédure ${q(p.title, lang)} bien exécutée : ${r.score}/100.`
        : `${q(p.title, lang)} flown correctly: ${r.score}/100.`,
    );
  return [...out, ...good];
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
  return true;
}

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
  ): ProcedureRunner | null {
    if (!proc) return null;
    if (
      this.runners.some(
        (r) =>
          !r.finished && r.failure === failure && r.procedure.id === proc.id,
      )
    )
      return null;
    const r = new ProcedureRunner(proc, this.mode, failure, atS, { followUpOf });
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
        due = view.t - w.lostAt! >= FOLLOW_LOST_S - 1e-6;
        at = w.lostAt!;
      }
      if (!due) continue;
      this.followed.add(r);
      r.finish();
      // in the language of the procedure it follows
      const next = pickProcedure(this.list(), r.failure, r.procedure.lang, then.procedure, view);
      this.begin(next, r.failure, at, view, r.procedure.id);
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
