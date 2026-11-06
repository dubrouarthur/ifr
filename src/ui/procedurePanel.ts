// Procedures mode in flight: the controller that starts and grades the emergency procedures of a flight, and the
// panel the student sees.
//
//   ProcedureController   one per app. A failure drill (LessonRun.onDrillFailure) starts its expected procedure in
//                         the drill's mode; any other failure (instructor drawer, phone companion, random checkride
//                         failure, a plain circuit failure) starts the procedure that answers it when "Grade
//                         procedures" is on, in the instructor's mode (training / test). Grading runs at 10 Hz on
//                         simView(sim). results() feed the debrief, the lesson result and the training records.
//   ProcedurePanel        what the student sees.
//                         Training: an emergency card (failure, elapsed time, memory items with live ticks and
//                         per-item countdown bars, then "Open the checklist" for the remaining items with Done buttons
//                         for callouts and their short notes). Anchored inside the right-hand display: it never covers
//                         the attitude indicator. Folds to one line.
//                         Test: a discreet "Checklist" button and the exercise time only — no failure name, no ticks,
//                         no hints. It is there from the start of a test drill, so it gives nothing away. Opening it
//                         (recorded) shows the club's emergency checklist index, like a paper QRH: the student picks
//                         the procedure they diagnosed.
//                         Shift+C opens / folds the checklist in both modes.
import type { Sim } from "../sim/sim";
import type { LessonRun, DrillFailureEvent } from "../train/engine";
import {
  DrillSession,
  simView,
  pickProcedure,
  baseId,
  type ProcedureRunner,
} from "../train/procedures";
import { effectiveProcedures } from "../train/procedureStore";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  DISCLAIMER,
} from "../train/procedureLibrary";
import { checkDef } from "../train/procedureChecks";
import type {
  DrillMode,
  Lang,
  Procedure,
  ProcedureResult,
  ProcedureRunState,
} from "../train/procedureTypes";
import {
  FAILURE_LABELS_EN,
  FAILURE_LABELS_FR,
  type FailureKey,
} from "../sim/systemsTypes";
import { lang as uiLang, registerStrings, t } from "./i18n";
import { h, clear, store } from "./dom";
import { svgIcon, I } from "./icons";

registerStrings("en", {
  "procp.region": "Emergency procedure",
  "procp.grade": "Grade procedures",
  "procp.mode.training": "Training",
  "procp.mode.test": "Test",
});
registerStrings("fr", {
  "procp.region": "Procédure d’urgence",
  "procp.grade": "Évaluer les procédures",
  "procp.mode.training": "Entraînement",
  "procp.mode.test": "Test",
});

const FKEYS = Object.keys(FAILURE_LABELS_EN) as FailureKey[];
export const failureText = (k: FailureKey, l: Lang) =>
  l === "fr" ? FAILURE_LABELS_FR[k] : FAILURE_LABELS_EN[k];
/** words of the card in the procedure's own language */
const W = {
  en: {
    emergency: "EMERGENCY",
    memory: "MEMORY ITEMS",
    checklist: "CHECKLIST",
    open: "Open the checklist",
    done: "Done",
    check: "Check",
    checked: "Checked",
    complete: "Procedure complete",
    incomplete: "Procedure stopped",
    results: "Graded in the debrief",
    fold: "Fold the emergency card",
    unfold: "Show the emergency card",
    hold: "Hold",
    bank: "bank",
    late: "late",
    optional: "optional",
    qrh: "Emergency checklists",
    qrhHint: "Pick the checklist for what you see. Opening it is recorded.",
    back: "All checklists",
    close: "Close",
    time: "Exercise time",
    other: "other procedure",
    others: "other procedures",
    next: "Next",
    callout: "Say it, then tap Done",
  },
  fr: {
    emergency: "URGENCE",
    memory: "ACTIONS RÉFLEXES",
    checklist: "CHECK-LIST",
    open: "Ouvrir la check-list",
    done: "Fait",
    check: "Vérifier",
    checked: "Vérifié",
    complete: "Procédure terminée",
    incomplete: "Procédure arrêtée",
    results: "Évaluée dans le débriefing",
    fold: "Replier la carte d’urgence",
    unfold: "Afficher la carte d’urgence",
    hold: "Tenir",
    bank: "inclinaison",
    late: "en retard",
    optional: "facultatif",
    qrh: "Check-lists d’urgence",
    qrhHint:
      "Choisissez la check-list de ce que vous constatez. L’ouverture est enregistrée.",
    back: "Toutes les check-lists",
    close: "Fermer",
    time: "Temps de l’exercice",
    other: "autre procédure",
    others: "autres procédures",
    next: "Suivante",
    callout: "Annoncez-le, puis touchez Fait",
  },
} as const;

const mmss = (s: number) => {
  const v = Math.max(0, Math.floor(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
};

// ------------------------------------------------------------------ remote / instructor view of the live state
/** what the instructor companion receives (4 Hz): the live state without the long texts */
export interface RemoteProcState {
  procedureId: string;
  title: string;
  failure: FailureKey;
  mode: DrillMode;
  elapsedS: number;
  checklistOpen: boolean;
  finished: boolean;
  lang: Lang;
  items: {
    id: string;
    text: string;
    memory: boolean;
    done: boolean;
    late: boolean;
    due: number | null;
    manual: boolean;
    optional: boolean;
    ready: boolean;
    atS: number | null;
  }[];
}
export function remoteProcStates(
  states: ProcedureRunState[],
): RemoteProcState[] {
  return states.map((s) => ({
    procedureId: s.procedureId,
    title: s.title,
    failure: s.failure,
    mode: s.mode,
    elapsedS: Math.round(s.elapsedS * 10) / 10,
    checklistOpen: s.checklistOpen,
    finished: !!s.finished,
    lang: s.lang ?? "en",
    items: s.items.map((i) => ({
      id: i.id,
      text: i.text.slice(0, 120),
      memory: i.memory,
      done: i.done,
      late: i.late,
      due: i.due === null ? null : Math.round(i.due * 10) / 10,
      manual: !!i.manual,
      optional: !!i.optional,
      ready: !!i.ready,
      atS:
        i.atS === undefined || i.atS === null
          ? null
          : Math.round(i.atS * 10) / 10,
    })),
  }));
}

/** a procedure the instructor can ask for ('Expect procedure' picker) */
export interface ProcChoice {
  id: string;
  title: string;
  failures: FailureKey[];
  lang: Lang;
  club: boolean;
}

// ------------------------------------------------------------------ controller
export interface ProcControllerOpts {
  sim: Sim;
  /** the lesson being flown (drill mode, instructor-triggered drill failures) */
  lesson: () => LessonRun | null;
  /** the effective procedure list (default: club + library) */
  procedures?: () => Procedure[];
  /** a runner started (the shell shows the card / the systems panel) */
  onStart?: (r: ProcedureRunner) => void;
}

export class ProcedureController {
  sessions: DrillSession[] = [];
  /** bumps on every change the panel / instructor drawer should redraw for (start, confirm, checklist) */
  version = 0;
  private prev = new Set<FailureKey>();
  /** failures whose procedure was already decided (started, or deliberately not graded) */
  private handled = new Set<FailureKey>();
  private acc = 0;
  private flightT0 = 0;
  /** test mode: the student opened the emergency checklist index (first time, s after the start) */
  qrhOpenedAt: number | null = null;
  private _grade: boolean;
  private _freeMode: DrillMode;
  constructor(private o: ProcControllerOpts) {
    this._grade = store.get("ifr.procs.grade", true);
    this._freeMode =
      store.get<DrillMode>("ifr.procs.freeMode", "training") === "test"
        ? "test"
        : "training";
  }

  // ---------------------------------------------------------------- instructor settings
  /** 'Grade procedures' (instructor toggle): failures that are not part of a drill start their procedure */
  get grade(): boolean {
    return this._grade;
  }
  setGrade(on: boolean) {
    this._grade = on;
    store.set("ifr.procs.grade", on);
    this.version++;
  }
  /** mode for failures outside a drill (instructor, phone, random): training shows the card, test hides it */
  get freeMode(): DrillMode {
    return this._freeMode;
  }
  setFreeMode(m: DrillMode) {
    this._freeMode = m;
    store.set("ifr.procs.freeMode", m);
    this.version++;
  }
  /** the mode a new procedure would start in now */
  modeNow(): DrillMode {
    const dr = this.o.lesson()?.drill;
    if (dr?.isDrill) return dr.mode;
    if (this.o.sim.assess.mode === "checkride") return "test";
    return this._freeMode;
  }
  /** the mode of the failure drill being flown (null: not a drill) */
  drillMode(): DrillMode | null {
    const dr = this.o.lesson()?.drill;
    return dr?.isDrill ? dr.mode : null;
  }
  /** a test drill is being flown (the discreet Checklist button is shown from the start) */
  testFlight(): boolean {
    const dr = this.o.lesson()?.drill;
    if (dr?.isDrill) return dr.mode === "test";
    return (
      this._grade &&
      this.modeNow() === "test" &&
      this.runners().some((r) => r.mode === "test")
    );
  }

  // ---------------------------------------------------------------- lifecycle
  /** a new flight: forget the previous one (its results were saved by its debrief / lesson result) */
  reset() {
    this.sessions = [];
    this.handled.clear();
    this.prev = new Set(FKEYS.filter((k) => this.o.sim.failures[k]));
    // failures already set when the flight starts (a circuit's initial state) are not emergencies of this flight
    for (const k of this.prev) this.handled.add(k);
    this.acc = 0;
    this.flightT0 = this.o.sim.time;
    this.qrhOpenedAt = null;
    this.version++;
  }
  /** the lesson ended: stop grading */
  finish() {
    // one last look at the aircraft first: a lesson that ends on a crash or a full stop between two 10 Hz updates
    // must grade it as crashed / landed, not as 'not completed'
    if (this.sessions.length && !this.o.sim.replaying) {
      const view = simView(this.o.sim);
      for (const s of this.sessions) s.update(view);
    }
    this.sessions.forEach((s) => s.finish());
    this.version++;
  }
  private session(mode: DrillMode): DrillSession {
    const s = [...this.sessions].reverse().find((x) => x.mode === mode);
    if (s) return s;
    const n = new DrillSession({
      mode,
      lang: () => uiLang(),
      procedures: this.o.procedures,
      onStart: (r) => {
        this.version++;
        this.o.onStart?.(r);
      },
    });
    this.sessions.push(n);
    return n;
  }

  /** LessonRun.onDrillFailure: a scheduled failure of the flight fired */
  onDrillFailure(
    key: FailureKey,
    expect: string | undefined,
    mode: DrillMode,
    ev: DrillFailureEvent,
  ): ProcedureRunner | null {
    this.handled.add(key);
    this.prev.add(key);
    // a plain circuit failure (not a drill) is graded only when the instructor asked for it
    if (!ev.isDrill && !this._grade) return null;
    return this.start(key, ev.isDrill ? mode : this.modeNow(), ev.atS, expect);
  }
  /** the instructor (drawer or phone) fails a system now, optionally naming the procedure expected ('-': do not
   *  grade this one, whatever the Grade procedures toggle) */
  fire(key: FailureKey, expect?: string): ProcedureRunner | null {
    const sim = this.o.sim;
    this.handled.add(key);
    this.prev.add(key);
    sim.setFailure(key, true);
    if (expect === "-" || (!this._grade && !expect)) return null;
    return this.start(key, this.modeNow(), sim.time, expect);
  }
  /** the instructor fires a drill failure that waits for them (trigger 'instructor') */
  fireDrill(index: number): boolean {
    return !!this.o.lesson()?.fireInstructorFailure(index);
  }
  /** the failure drill being flown has nothing left to grade: every planned failure fired and every procedure it
   *  started is finished, none of them by a crash (End then closes the drill as complete, not aborted) */
  drillDone(): boolean {
    const l = this.o.lesson();
    const dr = l?.drill;
    if (!l || !dr?.isDrill || l.finished || !l.drillLog.length) return false;
    if (dr.plan.some((p) => !p.fired)) return false;
    const rs = this.runners();
    return (
      rs.length > 0 &&
      rs.every((r) => r.finished && r.outcome !== "crashed") &&
      !this.o.sim.ac.s.crashed
    );
  }
  /** simulator time (s): the panel times its 'finished' card on it, so a paused flight keeps the card */
  simTime(): number {
    return this.o.sim.time;
  }
  /** instructor-triggered drill failures still waiting */
  pendingDrill(): { index: number; key: FailureKey }[] {
    return (
      this.o
        .lesson()
        ?.instructorFailures()
        .map((p) => ({ index: p.index, key: p.key })) ?? []
    );
  }
  start(
    key: FailureKey,
    mode: DrillMode,
    atS: number,
    expect?: string,
  ): ProcedureRunner | null {
    this.handled.add(key);
    const r = this.session(mode).start(key, atS, expect, simView(this.o.sim));
    this.version++;
    return r;
  }

  /** every frame: new failures, then grading at 10 Hz */
  tick(dt: number) {
    const sim = this.o.sim;
    if (sim.replaying) return;
    for (const k of FKEYS) {
      const on = !!sim.failures[k];
      if (on && !this.prev.has(k)) {
        this.prev.add(k);
        if (!this.handled.has(k)) {
          this.handled.add(k);
          if (this._grade) this.start(k, this.modeNow(), sim.time);
        }
      } else if (!on && this.prev.has(k)) {
        // restored: the next failure of this system is a new emergency
        this.prev.delete(k);
        this.handled.delete(k);
      }
    }
    if (sim.paused || !this.sessions.length) return;
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    const view = simView(sim);
    let fin = 0;
    for (const s of this.sessions) {
      s.update(view);
      fin += s.runners.filter((r) => r.finished).length;
    }
    if (fin !== this.finSeen) {
      this.finSeen = fin;
      this.version++;
    }
  }
  private finSeen = 0;

  // ---------------------------------------------------------------- student / instructor actions
  runners(): ProcedureRunner[] {
    return this.sessions.flatMap((s) => s.runners);
  }
  /** the runner the card shows: the latest one still running, else the latest one */
  active(): ProcedureRunner | null {
    const rs = this.runners();
    for (let i = rs.length - 1; i >= 0; i--) if (!rs[i].finished) return rs[i];
    return rs[rs.length - 1] ?? null;
  }
  openChecklist() {
    const r = this.active();
    if (r && !r.finished) r.openChecklist();
    this.version++;
  }
  /** the test-mode checklist index was opened: every running procedure records it */
  openQrh() {
    if (this.qrhOpenedAt === null)
      this.qrhOpenedAt = this.o.sim.time - this.flightT0;
    for (const r of this.runners()) if (!r.finished) r.openChecklist();
    this.version++;
  }
  confirm(
    itemId: string,
    by: "student" | "instructor",
    procedureId?: string,
  ): boolean {
    for (const r of [...this.runners()].reverse()) {
      if (procedureId && r.procedure.id !== procedureId) continue;
      if (r.confirm(itemId, by)) {
        this.version++;
        return true;
      }
    }
    return false;
  }
  states(): ProcedureRunState[] {
    return this.runners().map((r) => r.state());
  }
  results(): ProcedureResult[] {
    return this.runners().map((r) => r.result());
  }
  /** time since the flight / exercise started (the test-mode clock) */
  flightTime(): number {
    const l = this.o.lesson();
    return l ? l.totalT : Math.max(0, this.o.sim.time - this.flightT0);
  }

  // ---------------------------------------------------------------- 'Expect procedure' picker
  list(): Procedure[] {
    return this.o.procedures ? this.o.procedures() : effectiveProcedures();
  }
  /** procedures that answer a failure (club first, then the library in the UI language, then the other one) */
  choices(key: FailureKey): ProcChoice[] {
    const l = uiLang();
    const all = this.list().filter((p) => p.failures.includes(key));
    const rank = (p: Procedure) =>
      (p.source === "club" ? 0 : 2) + (p.lang === l ? 0 : 1);
    return all
      .sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title))
      .map((p) => ({
        id: p.id,
        title: p.title,
        failures: p.failures,
        lang: p.lang,
        club: p.source === "club",
      }));
  }
  /** what would start for this failure now (null: nothing answers it) */
  autoPick(key: FailureKey): Procedure | null {
    try {
      return pickProcedure(
        this.list(),
        key,
        uiLang(),
        undefined,
        simView(this.o.sim),
      );
    } catch {
      return null;
    }
  }
  /** every procedure the instructor can ask for (phone companion), in the UI language first */
  allChoices(): ProcChoice[] {
    const l = uiLang();
    return this.list()
      .filter((p) => p.failures.length)
      .sort(
        (a, b) =>
          Number(b.source === "club") - Number(a.source === "club") ||
          Number(b.lang === l) - Number(a.lang === l),
      )
      .map((p) => ({
        id: p.id,
        title: p.title,
        failures: p.failures,
        lang: p.lang,
        club: p.source === "club",
      }));
  }
}

// ------------------------------------------------------------------ the student's panel
const NS = "http://www.w3.org/2000/svg";
function tick(): SVGSVGElement {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 16 16");
  s.setAttribute("width", "14");
  s.setAttribute("height", "14");
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", "M3.5 8.5l3 3 6-7");
  p.setAttribute("fill", "none");
  p.setAttribute("stroke", "currentColor");
  p.setAttribute("stroke-width", "2.2");
  p.setAttribute("stroke-linecap", "round");
  p.setAttribute("stroke-linejoin", "round");
  s.append(p);
  return s;
}

/** short targets line, e.g. "Hold 68 kt (63–73) · bank ≤ 30°" */
export function targetsText(p: Procedure): string | null {
  const w = W[p.lang === "fr" ? "fr" : "en"];
  const tg: string[] = [];
  if (p.targets?.iasKt) {
    const [a, b] = p.targets.iasKt;
    tg.push(`${w.hold} ${Math.round((a + b) / 2)} kt (${a}–${b})`);
  }
  if (p.targets?.maxBankDeg !== undefined)
    tg.push(`${w.bank} ≤ ${p.targets.maxBankDeg}°`);
  return tg.length ? tg.join(" · ") : null;
}

export class ProcedurePanel {
  el: HTMLElement;
  private card = h("div", { class: "pv-card procp-card" });
  private sig = "";
  private live: ((st: ProcedureRunState | null) => void)[] = [];
  private folded = false;
  private foldedFor = "";
  /** training: the remaining items are shown (the student opened the checklist) */
  private showList = false;
  /** test: the checklist index is open, and the procedure picked in it */
  private qrhOpen = false;
  private qrhPick: string | null = null;
  /** confirmations on a procedure that is not the one being graded (test index): local ticks only */
  private localDone = new Set<string>();
  private finishedAt = new Map<ProcedureRunner, number>();
  private shownRunner: ProcedureRunner | null = null;
  constructor(private ctrl: ProcedureController) {
    this.el = h(
      "section",
      {
        class: "procp",
        role: "region",
        "aria-label": t("procp.region"),
        hidden: true,
      },
      this.card,
    );
    this.wireDrag();
  }

  // ---------------------------------------------------------------- moving the card
  /** where the pilot put the card (left/top in px), or null for the default anchor */
  private pos: { x: number; y: number } | null = readPos();
  /** drag the card by its header (not by its buttons); a double-click on the header puts it back */
  private wireDrag() {
    const el = this.el;
    let start: { px: number; py: number; x: number; y: number; id: number } | null = null;
    el.addEventListener("pointerdown", (e) => {
      const head = (e.target as HTMLElement).closest(".pv-top");
      if (!head || (e.target as HTMLElement).closest("button, a, input, select")) return;
      const r = el.getBoundingClientRect();
      start = { px: e.clientX, py: e.clientY, x: r.left, y: r.top, id: e.pointerId };
      head.setPointerCapture?.(e.pointerId);
      el.classList.add("dragging");
      e.preventDefault();
    });
    el.addEventListener("pointermove", (e) => {
      if (!start || e.pointerId !== start.id) return;
      this.place({ x: start.x + e.clientX - start.px, y: start.y + e.clientY - start.py });
    });
    const end = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      start = null;
      el.classList.remove("dragging");
      if (this.pos) writePos(this.pos);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    el.addEventListener("dblclick", (e) => {
      if (!(e.target as HTMLElement).closest(".pv-top") || (e.target as HTMLElement).closest("button")) return;
      this.pos = null;
      writePos(null);
      this.applyPos();
    });
    window.addEventListener("resize", () => this.applyPos());
    this.applyPos();
  }
  private place(p: { x: number; y: number }) {
    const r = this.el.getBoundingClientRect();
    const w = r.width || 360;
    const h = Math.min(r.height || 200, window.innerHeight - 16);
    this.pos = {
      x: Math.round(Math.max(8, Math.min(window.innerWidth - w - 8, p.x))),
      y: Math.round(Math.max(8, Math.min(window.innerHeight - Math.min(h, 120) - 8, p.y))),
    };
    this.applyPos();
  }
  private applyPos() {
    const el = this.el;
    el.classList.toggle("moved", !!this.pos);
    if (this.pos) {
      el.style.left = `${this.pos.x}px`;
      el.style.top = `${this.pos.y}px`;
      el.style.setProperty("--procp-mh-moved", `${Math.max(160, window.innerHeight - this.pos.y - 8)}px`);
    } else {
      el.style.removeProperty("left");
      el.style.removeProperty("top");
    }
  }

  get visible() {
    return !this.el.hidden;
  }
  /** Shift+C: open the checklist (training) / the checklist index (test); again: fold it */
  toggleChecklist() {
    const r = this.ctrl.active();
    if (this.mode() === "test") {
      this.qrhOpen = !this.qrhOpen;
      if (this.qrhOpen) this.ctrl.openQrh();
      this.qrhPick = null;
    } else if (r) {
      if (this.folded) this.folded = false;
      else if (!r.checklistOpen) this.openList(r);
      else this.showList = !this.showList;
    }
    this.sig = "";
    this.update(true);
  }
  private openList(r: ProcedureRunner) {
    this.showList = true;
    if (!r.finished) this.ctrl.openChecklist();
  }
  private mode(): DrillMode | null {
    const r = this.ctrl.active();
    if (r && !r.finished) return r.mode;
    if (this.ctrl.testFlight()) return "test";
    return r ? r.mode : null;
  }

  /** a few times a second: rebuild on a structural change only, timers and bars update in place */
  update(force = false) {
    const r = this.ctrl.active();
    const mode = this.mode();
    if (r !== this.shownRunner) {
      this.shownRunner = r;
      this.bodyScroll = 0;
      this.showList = !!r?.checklistOpen;
      this.localDone.clear();
      if (r && this.foldedFor !== r.procedure.id) this.folded = false;
    }
    if (r?.finished && !this.finishedAt.has(r))
      this.finishedAt.set(r, this.ctrl.simTime());
    // a finished procedure stays on screen for 12 s of flight (its last state; a paused flight keeps it), then the
    // card folds away
    const stale =
      !!r?.finished &&
      this.ctrl.simTime() - (this.finishedAt.get(r) ?? 0) > 12;
    const show =
      mode === "test"
        ? this.ctrl.testFlight() || (!!r && !r.finished)
        : !!r && !stale;
    if (this.el.hidden === show) this.el.hidden = !show;
    document.body.classList.toggle(
      "procp-on",
      show && (mode === "test" ? this.qrhOpen : !this.folded),
    );
    if (!show) return;
    const st = r?.state() ?? null;
    const key = mode === "test" ? this.testSig(st) : this.trainSig(r!, st!);
    if (force || key !== this.sig) {
      this.sig = key;
      this.render(mode!, r, st);
    }
    for (const f of this.live) f(st);
  }

  // ---------------------------------------------------------------- training: the emergency card
  private trainSig(r: ProcedureRunner, st: ProcedureRunState) {
    const others = this.ctrl
      .runners()
      .filter((x) => !x.finished && x !== r).length;
    return `T|${st.procedureId}|${st.finished}|${this.folded}|${this.showList}|${st.checklistOpen}|${others}|${st.items.map((i) => `${+i.done}${+i.late}${+!!i.ready}${i.due === null ? "-" : "d"}`).join("")}`;
  }
  private render(
    mode: DrillMode,
    r: ProcedureRunner | null,
    st: ProcedureRunState | null,
  ) {
    clear(this.card);
    this.live = [];
    this.card.className = `pv-card procp-card ${mode}`;
    this.el.classList.toggle("test", mode === "test");
    this.el.classList.toggle("folded", this.folded && mode === "training");
    if (mode === "test") return this.renderTest(r);
    if (!r || !st) return;
    const p = r.procedure;
    const L: Lang = p.lang === "fr" ? "fr" : "en";
    const w = W[L];
    const done = st.items.filter((i) => i.done).length;
    const fin = !!st.finished;
    const outcome = r.outcome;
    const time = h("span", {
      class: "pv-time",
      role: "timer",
      "aria-label": w.time,
    });
    this.live.push(() => {
      const v = mmss(r.elapsedS);
      if (time.textContent !== v) time.textContent = v;
    });
    const foldBtn = h(
      "button",
      {
        type: "button",
        class: "procp-fold",
        "aria-expanded": String(!this.folded),
        "aria-label": this.folded ? w.unfold : w.fold,
        title: `${this.folded ? w.unfold : w.fold} (Shift+C)`,
        onclick: () => {
          this.folded = !this.folded;
          this.foldedFor = this.folded ? p.id : "";
          this.sig = "";
          this.update(true);
        },
      },
      svgIcon(this.folded ? I.chevUp : I.chevDown, 16),
    );
    const top = h(
      "div",
      {
        class: `pv-top${fin ? (outcome === "completed" || outcome === "landed" ? " ok" : " stop") : ""}`,
        title: "Drag to move · double-click to put it back",
      },
      h(
        "span",
        { class: "pv-tag" },
        fin
          ? outcome === "completed" || outcome === "landed"
            ? "OK"
            : "—"
          : w.emergency,
      ),
      h("b", { class: "pv-fail" }, failureText(r.failure, L)),
      this.folded
        ? h("span", { class: "procp-count" }, `${done}/${st.items.length}`)
        : null,
      time,
      foldBtn,
    );
    this.card.append(top);
    if (this.folded) return;
    const body = h("div", { class: "procp-body" });
    this.card.append(body);
    body.append(h("div", { class: "pv-title" }, p.title));
    const tg = targetsText(p);
    if (tg && !fin) body.append(h("div", { class: "pv-targets" }, tg));
    if (fin)
      body.append(
        h(
          "div",
          {
            class: `procp-fin ${outcome === "completed" || outcome === "landed" ? "ok" : "stop"}`,
          },
          tick(),
          h(
            "div",
            {},
            h(
              "b",
              {},
              outcome === "completed" || outcome === "landed"
                ? w.complete
                : w.incomplete,
            ),
            h("small", {}, w.results),
          ),
        ),
      );
    const others = this.ctrl
      .runners()
      .filter((x) => !x.finished && x !== r).length;
    if (others)
      body.append(
        h(
          "div",
          { class: "procp-others" },
          `+${others} ${others > 1 ? w.others : w.other}`,
        ),
      );
    const itemsBy = new Map(p.items.map((it) => [it.id, it]));
    const mem = st.items.filter((i) => i.memory);
    const rest = st.items.filter((i) => !i.memory);
    // the first item still to do in list order: highlighted (the flow goes top to bottom)
    const next = st.items.find((i) => !i.done && !i.optional && !i.ready);
    const row = (x: ProcedureRunState["items"][number], n: number | null) => {
      const it = itemsBy.get(x.id);
      const limit = it?.withinS;
      const cls = [
        "pv-it",
        x.done ? "done" : "",
        x.late ? "late" : "",
        x.ready && !x.done ? "ready" : "",
        x.optional ? "opt" : "",
        x === next && !fin ? "next" : "",
        !x.done && fin && !x.optional ? "missed" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const box = h(
        "span",
        { class: "pv-box", "aria-hidden": "true" },
        x.done ? tick() : n !== null ? String(n) : null,
      );
      const tx = h(
        "div",
        { class: "pv-tx" },
        h("span", { class: "pv-t" }, x.text),
      );
      if (x.note && !x.done && (x.memory ? this.showList : true))
        tx.append(h("small", { class: "pv-note" }, x.note));
      // the callout hint on the item to do now only (one line, not on every Done item)
      if (x.manual && !x.done && !fin && x === next)
        tx.append(h("small", { class: "pv-note procp-callout" }, w.callout));
      let right: HTMLElement | null = null;
      if (x.done)
        right = h(
          "span",
          { class: "procp-at" },
          x.atS !== null && x.atS !== undefined ? `${Math.round(x.atS)} s` : "",
        );
      // already in place at the failure: ticked by itself when the flow moves past it (no button: tapping it
      // early would credit a 'reset' item before its OFF step)
      else if (!fin && x.ready && !x.manual)
        right = h("span", { class: "procp-ready" }, w.check);
      else if (!fin && x.manual)
        right = h(
          "button",
          {
            type: "button",
            class: `pv-done${x.ready ? " ready" : ""}`,
            onclick: () => {
              this.ctrl.confirm(x.id, "student", p.id);
              this.update(true);
            },
          },
          w.done,
        );
      else if (!fin && x.due !== null && limit) {
        const bar = h("i", {});
        const due = h("span", { class: "pv-due" });
        tx.append(h("span", { class: "pv-bar" }, bar));
        right = due;
        const id = x.id;
        this.live.push((now) => {
          const cur = now?.items.find((i) => i.id === id);
          const d = cur?.due ?? null;
          const frac = d === null ? 0 : Math.max(0, Math.min(1, d / limit));
          const wv = `${(frac * 100).toFixed(1)}%`;
          if (bar.style.width !== wv) bar.style.width = wv;
          const txt = d === null ? "" : d > 0 ? `${Math.ceil(d)} s` : w.late;
          if (due.textContent !== txt) due.textContent = txt;
          due.classList.toggle("over", d !== null && d <= 0);
        });
      } else if (x.optional) right = h("span", { class: "pv-opt" }, w.optional);
      return h("li", { class: cls }, box, tx, right);
    };
    if (mem.length)
      body.append(
        h("div", { class: "pv-sec" }, w.memory),
        h("ul", { class: "pv-list mem" }, ...mem.map((x) => row(x, null))),
      );
    if (rest.length) {
      if (mem.length && !this.showList && !fin)
        body.append(
          h(
            "button",
            {
              type: "button",
              class: "pv-open",
              onclick: () => {
                this.openList(r);
                this.sig = "";
                this.update(true);
              },
            },
            w.open,
            h("kbd", { class: "procp-kbd" }, "Shift+C"),
          ),
        );
      else {
        let n = 0;
        body.append(
          h(
            "div",
            { class: "pv-sec" },
            w.checklist,
            mem.length && !fin
              ? h(
                  "button",
                  {
                    type: "button",
                    class: "pv-fold",
                    "aria-label": w.fold,
                    onclick: () => {
                      this.showList = false;
                      this.sig = "";
                      this.update(true);
                    },
                  },
                  svgIcon(I.chevUp, 14),
                )
              : null,
          ),
          h(
            "ol",
            { class: "pv-list" },
            ...rest.map((x) => row(x, ++n + mem.length)),
          ),
        );
      }
    }
    body.append(
      h(
        "div",
        { class: "pv-foot" },
        p.ref ? h("span", {}, p.ref) : null,
        h("span", {}, p.disclaimer ?? DISCLAIMER[L]),
      ),
    );
    // the card is rebuilt on every tick of an item: keep the reading position, and bring the item to do now into
    // view when it is below (or above) the visible part — a long checklist never hides the next step
    body.scrollTop = this.bodyScroll;
    body.addEventListener("scroll", () => (this.bodyScroll = body.scrollTop), {
      passive: true,
    });
    const target =
      (this.showList
        ? body.querySelector<HTMLElement>(
            ".pv-list:not(.mem) .pv-it:not(.done):not(.opt):not(.ready)",
          )
        : null) ?? body.querySelector<HTMLElement>(".pv-it.next");
    if (target && !fin) {
      const br = body.getBoundingClientRect();
      const tr = target.getBoundingClientRect();
      if (br.height > 0 && (tr.bottom > br.bottom - 4 || tr.top < br.top)) {
        body.scrollTop += tr.top - br.top - Math.min(48, br.height / 4);
        this.bodyScroll = body.scrollTop;
      }
    }
  }
  private bodyScroll = 0;

  // ---------------------------------------------------------------- test: the discreet button + checklist index
  private testSig(st: ProcedureRunState | null) {
    return `X|${this.qrhOpen}|${this.qrhPick}|${st?.procedureId ?? ""}|${[...this.localDone].join(",")}|${
      st?.items
        .filter((i) => i.manual && i.done)
        .map((i) => i.id)
        .join(",") ?? ""
    }`;
  }
  private renderTest(r: ProcedureRunner | null) {
    const L: Lang = uiLang();
    const w = W[L];
    const time = h("span", {
      class: "pv-time",
      role: "timer",
      "aria-label": w.time,
    });
    this.live.push(() => {
      const v = mmss(this.ctrl.flightTime());
      if (time.textContent !== v) time.textContent = v;
    });
    const btn = h(
      "button",
      {
        type: "button",
        class: `pv-cl${this.qrhOpen ? " on" : ""}`,
        "aria-expanded": String(this.qrhOpen),
        title: `${L === "fr" ? "Check-list" : "Checklist"} (Shift+C)`,
        onclick: () => this.toggleChecklist(),
      },
      svgIcon(I.clipboard, 16),
      L === "fr" ? "Check-list" : "Checklist",
    );
    this.card.append(h("div", { class: "pv-test" }, btn, time));
    if (!this.qrhOpen) return;
    const list = this.ctrl
      .list()
      .filter((p) => p.lang === L && p.failures.length);
    const box = h("div", { class: "procp-qrh" });
    this.card.append(box);
    const pick = this.qrhPick
      ? (list.find((p) => p.id === this.qrhPick) ?? null)
      : null;
    if (!pick) {
      box.append(
        h(
          "div",
          { class: "procp-qrh-h" },
          h("b", {}, w.qrh),
          h("small", {}, w.qrhHint),
        ),
      );
      const scroll = h("div", { class: "procp-qrh-list" });
      for (const cat of CATEGORY_ORDER) {
        const ps = list.filter((p) => p.category === cat);
        if (!ps.length) continue;
        scroll.append(
          h("div", { class: "pv-sec" }, CATEGORY_LABELS[cat][L].toUpperCase()),
        );
        for (const p of ps)
          scroll.append(
            h(
              "button",
              {
                type: "button",
                class: "procp-qrh-it",
                onclick: () => {
                  this.qrhPick = p.id;
                  this.sig = "";
                  this.update(true);
                },
              },
              h("span", {}, p.title),
              svgIcon(I.arrow, 14),
            ),
          );
      }
      box.append(scroll);
      return;
    }
    // the picked checklist: plain, like paper — no ticks, no timers; Done buttons only for the callouts the
    // student says (they appear on every checklist, so they give nothing away)
    const graded =
      r &&
      !r.finished &&
      (r.procedure.id === pick.id || baseId(r.procedure.id) === baseId(pick.id))
        ? r
        : null;
    const st = graded?.state() ?? null;
    box.append(
      h(
        "div",
        { class: "procp-qrh-h" },
        h(
          "button",
          {
            type: "button",
            class: "procp-back",
            onclick: () => {
              this.qrhPick = null;
              this.sig = "";
              this.update(true);
            },
          },
          svgIcon(I.chevDown, 14),
          w.back,
        ),
        h("b", {}, pick.title),
      ),
    );
    const tg = targetsText(pick);
    if (tg) box.append(h("div", { class: "pv-targets" }, tg));
    const manual = (it: Procedure["items"][number]) =>
      !it.check || it.check.id === "manual" || !checkDef(it.check);
    const mem = pick.items.filter((i) => i.memory);
    const rest = pick.items.filter((i) => !i.memory);
    const row = (it: Procedure["items"][number], n: number) => {
      const conf =
        st?.items.find((x) => x.id === it.id && x.manual)?.done ||
        this.localDone.has(`${pick.id}|${it.id}`);
      return h(
        "li",
        { class: `pv-it${it.optional ? " opt" : ""}` },
        h("span", { class: "pv-box", "aria-hidden": "true" }, String(n)),
        h("div", { class: "pv-tx" }, h("span", { class: "pv-t" }, it.text)),
        manual(it)
          ? h(
              "button",
              {
                type: "button",
                class: `pv-done${conf ? " on" : ""}`,
                "aria-pressed": String(!!conf),
                disabled: !!conf,
                onclick: () => {
                  if (graded)
                    this.ctrl.confirm(it.id, "student", graded.procedure.id);
                  this.localDone.add(`${pick.id}|${it.id}`);
                  this.sig = "";
                  this.update(true);
                },
              },
              w.done,
            )
          : it.optional
            ? h("span", { class: "pv-opt" }, w.optional)
            : null,
      );
    };
    let n = 0;
    const scroll = h("div", { class: "procp-qrh-list" });
    if (mem.length)
      scroll.append(
        h("div", { class: "pv-sec" }, w.memory),
        h("ol", { class: "pv-list mem" }, ...mem.map((it) => row(it, ++n))),
      );
    if (rest.length)
      scroll.append(
        h("div", { class: "pv-sec" }, w.checklist),
        h("ol", { class: "pv-list" }, ...rest.map((it) => row(it, ++n))),
      );
    scroll.append(
      h(
        "div",
        { class: "pv-foot" },
        pick.ref ? h("span", {}, pick.ref) : null,
        h("span", {}, pick.disclaimer ?? DISCLAIMER[L]),
      ),
    );
    box.append(scroll);
  }
}

/** plain words for a failure in the UI language (instructor drawer, toasts) */
export const failureName = (k: FailureKey) => failureText(k, uiLang());
export type { ProcedureRunner };

const POS_KEY = "ifr.procp.pos";
function readPos(): { x: number; y: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(POS_KEY) ?? "null");
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x, y: v.y } : null;
  } catch {
    return null;
  }
}
function writePos(p: { x: number; y: number } | null) {
  try {
    if (p) localStorage.setItem(POS_KEY, JSON.stringify(p));
    else localStorage.removeItem(POS_KEY);
  } catch {
    /* storage blocked: the position lasts for this flight only */
  }
}
