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
  type ProcSimView,
  type ProcedureRunner,
  procedureForCockpit,
} from "../train/procedures";
import { envelopeFor, splitChallenge } from "../train/procedureFlow";
import { effectiveProcedures } from "../train/procedureStore";
import { CATEGORY_LABELS, DISCLAIMER } from "../train/procedureLibrary";
import { checkDef } from "../train/procedureChecks";
import type {
  DrillMode,
  Lang,
  ProcCategory,
  ProcItem,
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
/** what the pilot SEES of a failure, for the card: a starved or pump-less engine is an engine that quits — its cause
 *  is what the restart flow finds (FAA-H-8083-3C ch.18: fuel mismanagement is the commonest cause of a power loss) */
const SYMPTOM: Partial<Record<FailureKey, FailureKey>> = {
  fuelStarvation: "engine",
  fuelPump: "engine",
};
const symptomText = (k: FailureKey, l: Lang) => failureText(SYMPTOM[k] ?? k, l);
/** a response too long for the right-hand column ("a field within gliding distance, into wind…") goes on its own
 *  line under the challenge, as a QRH prints a conditional */
const LONG_RESPONSE = 26;
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
    complete: "Checklist complete",
    noGlide: "Restarted — best glide not flown",
    incomplete: "Procedure stopped",
    results: "Graded in the debrief",
    fold: "Fold the emergency card",
    unfold: "Show the emergency card",
    hold: "Hold",
    bank: "bank",
    late: "late",
    optional: "optional",
    qrh: "Emergency checklists",
    qrhHint: "Pick the checklist for what you see. Memory items stay hidden.",
    back: "All checklists",
    close: "Close",
    time: "Exercise time",
    other: "other procedure",
    others: "other procedures",
    next: "Next",
    callout: "Say it, then tap Done (Enter)",
    aviate: "FLY",
    alt: "altitude",
    drag: "Drag to move · double-click to put it back",
    doneTag: "DONE",
    stopTag: "STOPPED",
    watching: "Keep flying: the flight is graded until it ends",
    within: "within",
    memDone: "done",
    items: "items",
    item: "item",
    set: "set",
    followUp: "not resolved",
    checklistBtn: "Checklist",
    memItem: "Memory item",
    reveal: "Show",
    revealTip:
      "Show this memory item (recorded: it no longer counts as done from memory)",
    memHidden: "from memory",
    na: "N/A",
    naTip: "No longer applicable: the engine runs again",
  },
  fr: {
    emergency: "URGENCE",
    memory: "ACTIONS RÉFLEXES",
    checklist: "CHECK-LIST",
    open: "Ouvrir la check-list",
    done: "Fait",
    check: "Vérifier",
    checked: "Vérifié",
    complete: "Check-list terminée",
    noGlide: "Moteur reparti — plané non tenu",
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
      "Choisissez la check-list de ce que vous voyez. Les réflexes restent masqués.",
    back: "Toutes les check-lists",
    close: "Fermer",
    time: "Temps de l’exercice",
    other: "autre procédure",
    others: "autres procédures",
    next: "Suivant",
    callout: "Annoncez-le, puis touchez Fait (Entrée)",
    aviate: "PILOTER",
    alt: "altitude",
    drag: "Glisser pour déplacer · double-clic pour la remettre en place",
    doneTag: "FAIT",
    stopTag: "ARRÊTÉE",
    watching: "Continuez à piloter : le vol est noté jusqu’à la fin",
    within: "reste",
    memDone: "faites",
    items: "points",
    item: "point",
    set: "en place",
    followUp: "non résolue",
    checklistBtn: "Check-list",
    memItem: "Action réflexe",
    reveal: "Voir",
    revealTip:
      "Afficher cette action réflexe (enregistré : elle ne compte plus comme faite de mémoire)",
    memHidden: "de mémoire",
    na: "Sans objet",
    naTip: "Sans objet : le moteur tourne à nouveau",
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
      // not applicable any more (restart worked): nothing left to confirm
      optional: !!i.optional || !!i.notApplicable,
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
  /** a runner started (graded from now; nothing is shown before its first cue) */
  onStart?: (r: ProcedureRunner) => void;
  /** the first symptom of a runner's failure became perceptible: the training card opens (the shell may open the
   *  switch panel then — never at the injection, which would announce the failure) */
  onCue?: (r: ProcedureRunner) => void;
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
      fin +=
        s.runners.filter((r) => r.finished).length +
        s.runners.filter((r) => r.stopped).length;
      for (const r of s.runners)
        if (r.cueS !== null && !this.cueSeen.has(r)) {
          this.cueSeen.add(r);
          this.version++;
          try {
            this.o.onCue?.(r);
          } catch (e) {
            console.error("onCue", e);
          }
        }
    }
    if (fin !== this.finSeen) {
      this.finSeen = fin;
      this.version++;
    }
  }
  private finSeen = 0;
  private cueSeen = new WeakSet<ProcedureRunner>();

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
  /** the training card's checklist was opened (recorded; it never costs anything in training) */
  openChecklist(r: ProcedureRunner | null = this.active()) {
    if (r && !r.finished) r.openChecklist();
    this.version++;
  }
  /** the test-mode checklist index was opened (recorded for the flight; the memory items stay hidden in it) */
  openQrh() {
    if (this.qrhOpenedAt === null)
      this.qrhOpenedAt = this.o.sim.time - this.flightT0;
    this.version++;
  }
  /** the procedures still graded that a checklist picked in the index answers: the same procedure (any language,
   *  a club copy) or a variant of the same family (G1000 / classic panel). Two failures at once: every one that
   *  matches, not only the latest. */
  matching(p: Procedure): ProcedureRunner[] {
    const key = (x: Procedure) => baseId(x.basedOn ?? x.id);
    const fam = (x: Procedure) => x.group ?? key(x);
    return this.runners().filter(
      (r) =>
        !r.stopped &&
        (key(r.procedure) === key(p) || fam(r.procedure) === fam(p)),
    );
  }
  /** test: the pilot picked a checklist in the index — the procedures it answers record when (the diagnosis) */
  pickChecklist(p: Procedure) {
    for (const r of this.matching(p)) r.openChecklist();
    this.version++;
  }
  /** test: Done on a picked checklist goes to every running procedure that has the item */
  confirmOn(p: Procedure, itemId: string): boolean {
    let any = false;
    for (const r of this.matching(p))
      if (r.confirm(itemId, "student")) any = true;
    this.version++;
    return any;
  }
  /** test: a hidden memory item revealed on a picked checklist (recorded on every procedure that has it) */
  revealOn(p: Procedure, itemId: string) {
    for (const r of this.matching(p)) r.reveal(itemId);
    this.version++;
  }
  /** the aircraft now, as the checks read it (closed-loop items of a picked checklist) */
  liveView(): ProcSimView | null {
    try {
      return simView(this.o.sim);
    } catch {
      return null;
    }
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
  /** the checklists of the cockpit flown, worded for it (the classic panel never reads 'AVIONICS BUS 1'; the
   *  G1000 variant of a checklist is not offered on the classic panel and the reverse) */
  cockpitList(): Procedure[] {
    const cp = this.o.sim.cockpit ?? "g1000";
    return this.list()
      .filter((p) => !p.when?.cockpit?.length || p.when.cockpit.includes(cp))
      .map((p) => procedureForCockpit(p, cp));
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

/** short targets line, e.g. "Hold 68 kt (63–73) · bank ≤ 30°" (editor preview, library cards) */
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

/** the Aviate line of the card: what to hold while running the procedure (the envelope it is graded on) */
function aviateText(p: Procedure, L: Lang): string {
  const env = envelopeFor(p);
  const w = W[L];
  const parts: string[] = [];
  if (env.iasKt) parts.push(`${env.iasKt[0]}–${env.iasKt[1]} KIAS`);
  parts.push(`${w.bank} ≤ ${env.maxBankDeg}°`);
  if (env.altTolFt !== undefined) parts.push(`${w.alt} ±${env.altTolFt} ft`);
  return parts.join(" · ");
}

/** QRH index order: fire and smoke first (a real QRH / POH section 3 index puts them where the hand falls) */
const QRH_ORDER: ProcCategory[] = [
  "fire",
  "engine",
  "electrical",
  "instruments",
  "avionics",
  "comms",
  "flight",
  "other",
];

type RowState = ProcedureRunState["items"][number];

export class ProcedurePanel {
  el: HTMLElement;
  private card = h("div", { class: "pv-card procp-card" });
  private sig = "";
  private live: ((st: ProcedureRunState | null) => void)[] = [];
  private folded = false;
  private foldedFor = "";
  /** training: the read-and-do list is shown (opened by the pilot, or once the memory items are done) */
  private showList = false;
  /** training: the procedure tab picked when several run at once (procedure id), null = the latest */
  private tab: string | null = null;
  /** test: the checklist index is open, the group and the procedure picked in it */
  private qrhOpen = false;
  private qrhGroup: ProcCategory | null = null;
  private qrhPick: string | null = null;
  /** test: taps on a checklist nobody grades (the pilot picked another one): ticks kept for place-keeping */
  private localDone = new Set<string>();
  private localShown = new Set<string>();
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
    let start: {
      px: number;
      py: number;
      x: number;
      y: number;
      id: number;
    } | null = null;
    el.addEventListener("pointerdown", (e) => {
      const head = (e.target as HTMLElement).closest(".pv-top");
      if (
        !head ||
        (e.target as HTMLElement).closest("button, a, input, select")
      )
        return;
      const r = el.getBoundingClientRect();
      start = {
        px: e.clientX,
        py: e.clientY,
        x: r.left,
        y: r.top,
        id: e.pointerId,
      };
      head.setPointerCapture?.(e.pointerId);
      el.classList.add("dragging");
      e.preventDefault();
    });
    el.addEventListener("pointermove", (e) => {
      if (!start || e.pointerId !== start.id) return;
      this.place({
        x: start.x + e.clientX - start.px,
        y: start.y + e.clientY - start.py,
      });
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
      if (
        !(e.target as HTMLElement).closest(".pv-top") ||
        (e.target as HTMLElement).closest("button")
      )
        return;
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
      y: Math.round(
        Math.max(8, Math.min(window.innerHeight - Math.min(h, 120) - 8, p.y)),
      ),
    };
    this.applyPos();
  }
  private applyPos() {
    const el = this.el;
    el.classList.toggle("moved", !!this.pos);
    if (this.pos) {
      el.style.left = `${this.pos.x}px`;
      el.style.top = `${this.pos.y}px`;
      el.style.setProperty(
        "--procp-mh-moved",
        `${Math.max(160, window.innerHeight - this.pos.y - 8)}px`,
      );
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
    const r = this.shown();
    if (this.mode() === "test") {
      this.qrhOpen = !this.qrhOpen;
      if (this.qrhOpen) this.ctrl.openQrh();
      this.qrhPick = null;
      this.qrhGroup = null;
    } else if (r) {
      if (this.folded) this.folded = false;
      else if (!this.showList) this.openList(r);
      else this.folded = true;
    }
    this.sig = "";
    this.update(true);
  }
  /** Enter: confirm the item to do now when it is a callout (training card) */
  confirmCurrent(): boolean {
    const r = this.shown();
    if (!r || this.mode() !== "training" || this.folded || r.finished)
      return false;
    const cur = r.state().items.find((i) => i.current);
    if (!cur || !cur.manual) return false;
    const ok = this.ctrl.confirm(cur.id, "student", r.procedure.id);
    this.update(true);
    return ok;
  }
  private openList(r: ProcedureRunner) {
    this.showList = true;
    if (!r.finished) this.ctrl.openChecklist(r);
  }
  private mode(): DrillMode | null {
    const r = this.shown();
    if (r && !r.finished) return r.mode;
    if (this.ctrl.testFlight()) return "test";
    return r ? r.mode : null;
  }
  /** training: the procedures whose first symptom is perceptible (the card never opens before the cue) */
  private cued(): ProcedureRunner[] {
    return this.ctrl.runners().filter((r) => r.cueS !== null || r.stopped);
  }
  /** the runner the card shows: the tab picked, else the latest one still running, else the latest one */
  private shown(): ProcedureRunner | null {
    const rs = this.cued();
    const test = rs.find((r) => r.mode === "test" && !r.finished);
    if (test) return test;
    const picked = this.tab
      ? rs.find((r) => r.procedure.id === this.tab && !r.stopped)
      : null;
    if (picked) return picked;
    for (let i = rs.length - 1; i >= 0; i--) if (!rs[i].finished) return rs[i];
    return rs[rs.length - 1] ?? null;
  }

  /** a few times a second: rebuild on a structural change only, timers update in place */
  update(force = false) {
    const r = this.shown();
    const mode = this.mode();
    if (r !== this.shownRunner) {
      this.shownRunner = r;
      this.bodyScroll = 0;
      this.showList = !!r?.checklistOpen;
      if (r && this.foldedFor !== r.procedure.id) this.folded = false;
    }
    if (r?.finished && !this.finishedAt.has(r))
      this.finishedAt.set(r, this.ctrl.simTime());
    // a finished procedure stays open 12 s of flight (its last state; a paused flight keeps it), then folds to its
    // one-line bar: the pilot can open it again to review it
    if (
      r?.finished &&
      mode === "training" &&
      !this.folded &&
      this.foldedFor !== `auto:${r.procedure.id}` &&
      this.ctrl.simTime() - (this.finishedAt.get(r) ?? 0) > 12
    ) {
      this.folded = true;
      this.foldedFor = `auto:${r.procedure.id}`;
    }
    const show =
      mode === "test" ? this.ctrl.testFlight() || (!!r && !r.finished) : !!r;
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
    const others = this.cued()
      .filter((x) => !x.finished && x !== r)
      .map((x) => x.procedure.id)
      .join(",");
    return `T|${st.procedureId}|${st.finished}|${st.stopped}|${st.outcome}|${this.folded}|${this.showList}|${others}|${uiLang()}|${st.items.map((i) => `${+i.done}${+i.late}${+!!i.ready}${+!!i.current}`).join("")}`;
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
    // a short dock (laptop outside view, iPad): tighter rows so the item to do now and the next one stay in view
    const mh = parseFloat(getComputedStyle(this.el).maxHeight);
    this.el.classList.toggle("compact", Number.isFinite(mh) && mh < 320);
    if (mode === "test") return this.renderTest(r);
    if (!r || !st) return;
    this.renderTraining(r, st);
  }

  /** seconds on the card's clock: since the first cue of the emergency (a follow-up keeps the clock of the
   *  procedure it follows: one emergency, one clock) */
  private clockS(r: ProcedureRunner): number {
    let root = r;
    for (let k = 0; k < 4 && root.followUpOf; k++) {
      const prev = this.ctrl
        .runners()
        .find(
          (x) =>
            x.procedure.id === root.followUpOf && x.failure === root.failure,
        );
      if (!prev) break;
      root = prev;
    }
    const cue = root.cueS ?? 0;
    // the checklist is complete (or stopped): the clock stops on the time it took
    const end =
      r.completedS !== null
        ? r.failedAtS + r.completedS
        : r.stopped
          ? r.failedAtS + r.elapsedS
          : this.ctrl.simTime();
    return Math.max(0, end - root.failedAtS - cue);
  }

  private renderTraining(r: ProcedureRunner, st: ProcedureRunState) {
    const p = r.procedure;
    const L: Lang = p.lang === "fr" ? "fr" : "en";
    const w = W[L];
    const fin = !!st.finished;
    const outcome = r.outcome;
    // a restart without the best glide is not a clean finish: the card says so (amber), not 'Checklist complete'
    const noGlide = !!st.restartNoGlide;
    const good = (outcome === "completed" || outcome === "landed") && !noGlide;
    const finText = noGlide ? w.noGlide : w.complete;
    const time = h("span", {
      class: "pv-time",
      role: "timer",
      "aria-label": w.time,
    });
    this.live.push(() => {
      const v = mmss(this.clockS(r));
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
      svgIcon(this.folded ? I.chevUp : I.chevDown, 18),
    );
    const cur = st.items.find((i) => i.current);
    const top = h(
      "div",
      {
        class: `pv-top${fin ? (good ? " ok" : noGlide ? " warn" : " stop") : ""}`,
        title: w.drag,
      },
      h(
        "span",
        { class: "pv-tag" },
        fin
          ? noGlide
            ? w.doneTag
            : st.stopped
              ? good
                ? w.doneTag
                : w.stopTag
              : w.doneTag
          : w.emergency,
      ),
      h(
        "div",
        { class: "qc-head" },
        h("b", { class: "pv-fail" }, symptomText(r.failure, L)),
        this.folded
          ? h(
              "small",
              { class: "qc-next" },
              fin
                ? noGlide
                  ? w.noGlide
                  : st.stopped
                    ? good
                      ? w.complete
                      : w.incomplete
                    : w.watching
                : cur
                  ? `${w.next}: ${cur.text}`
                  : "",
            )
          : // a short dock scrolls the title away: what to fly stays in the header (Aviate first)
            h(
              "small",
              { class: "qc-sub" },
              h("b", {}, w.aviate),
              ` ${aviateText(p, L)}`,
            ),
      ),
      time,
      foldBtn,
    );
    this.card.append(top);
    if (this.folded) return;
    const body = h("div", { class: "procp-body" });
    this.card.append(body);

    // several emergencies at once: one tab each, the latest first chosen; nothing is ever hidden
    const running = this.cued().filter((x) => !x.stopped || x === r);
    body.classList.toggle("tabbed", running.length > 1);
    if (running.length > 1)
      body.append(
        h(
          "div",
          { class: "qc-tabs", role: "tablist" },
          ...running.map((x) =>
            h(
              "button",
              {
                type: "button",
                role: "tab",
                class: `qc-tab${x === r ? " on" : ""}${x.finished ? " fin" : ""}`,
                "aria-selected": String(x === r),
                onclick: () => {
                  this.tab = x.procedure.id;
                  this.sig = "";
                  this.update(true);
                },
              },
              x.finished
                ? tick()
                : h("i", { class: "qc-dot", "aria-hidden": "true" }),
              symptomText(x.failure, L),
            ),
          ),
        ),
      );

    body.append(h("div", { class: "qc-title" }, p.title));
    if (r.followUpOf) {
      const prev = this.ctrl
        .runners()
        .find((x) => x.procedure.id === r.followUpOf);
      if (prev)
        body.append(
          h(
            "div",
            { class: "qc-follow" },
            `${prev.procedure.title} ▸ ${w.followUp}`,
          ),
        );
    }
    body.append(
      h(
        "div",
        { class: "qc-aviate" },
        h("span", { class: "qc-aviate-k" }, w.aviate),
        h("span", {}, aviateText(p, L)),
      ),
    );

    const itemsBy = new Map(p.items.map((it) => [it.id, it]));
    const mem = st.items.filter((i) => i.memory);
    const rest = st.items.filter((i) => !i.memory);
    const memDone = mem.every((i) => i.done || i.optional);
    const cueS = st.cueS ?? 0;
    const row = (x: RowState, n: number) => {
      const it = itemsBy.get(x.id);
      const isCur = !!x.current && !fin;
      const cls = [
        "qc-row",
        x.done ? "done" : "",
        x.late ? "late" : "",
        x.ready && !x.done ? "ready" : "",
        x.optional ? "opt" : "",
        isCur ? "cur" : "",
        x.notFlown ||
        (!x.done && fin && st.stopped && !x.optional && !x.notApplicable)
          ? "missed"
          : "",
        x.notApplicable ? "na" : "",
        x.manual ? "manual" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const [ch, rs] = splitChallenge(x.text);
      const glyph = h(
        "span",
        { class: "qc-glyph", "aria-hidden": "true" },
        x.done ? tick() : String(n),
      );
      const main = h(
        "div",
        { class: "qc-main" },
        h(
          "div",
          { class: `qc-line${rs && rs.length > LONG_RESPONSE ? " long" : ""}` },
          h("span", { class: "qc-ch" }, ch),
          rs ? h("span", { class: "qc-dots", "aria-hidden": "true" }) : null,
          rs ? h("span", { class: "qc-rs" }, rs) : null,
        ),
      );
      // the why / how, on the item to do now only: one line to read, not a wall of notes
      if (isCur && x.note)
        main.append(h("small", { class: "qc-note" }, x.note));
      if (isCur && x.manual)
        main.append(h("small", { class: "qc-note qc-callout" }, w.callout));
      let right: HTMLElement | null = null;
      if (x.done)
        right = h(
          "span",
          { class: `qc-at${x.late ? " late" : ""}` },
          x.atS !== null && x.atS !== undefined
            ? mmss(Math.max(0, x.atS - cueS))
            : "",
        );
      else if (x.notApplicable)
        right = h("span", { class: "qc-opt", title: w.naTip }, w.na);
      else if (!fin && x.manual)
        right = h(
          "button",
          {
            type: "button",
            class: "qc-done",
            "aria-label": `${w.done}: ${x.text}`,
            onclick: () => {
              this.ctrl.confirm(x.id, "student", p.id);
              this.update(true);
            },
          },
          w.done,
        );
      // already in position at the failure: ticked by itself when the flow moves past it (no button: tapping it
      // early would credit a 'reset' item before its OFF step)
      else if (!fin && x.ready) right = h("span", { class: "qc-set" }, w.set);
      else if (x.optional) right = h("span", { class: "qc-opt" }, w.optional);
      else if (x.late && !fin) right = h("span", { class: "qc-late" }, w.late);
      const li = h("li", { class: cls }, glyph, main, right);
      if (it?.memory) li.dataset.m = "1";
      return li;
    };

    let n = 0;
    if (mem.length) {
      const timer = h("span", { class: "qc-timer", role: "timer" });
      this.live.push((now) => {
        const c = now?.items.find((i) => i.current && i.memory);
        let txt = "";
        let cls = "qc-timer";
        if (c && c.due !== null && !fin) {
          txt = c.due > 0 ? `${w.within} ${mmss(Math.ceil(c.due))}` : w.late;
          cls += c.due <= 0 ? " over" : c.due <= 5 ? " soon" : "";
        } else if (!fin && memDone) txt = w.memDone;
        if (timer.textContent !== txt) timer.textContent = txt;
        if (timer.className !== cls) timer.className = cls;
      });
      body.append(
        h(
          "section",
          { class: `qc-mem${memDone ? " ok" : ""}` },
          h("div", { class: "qc-sec" }, h("span", {}, w.memory), timer),
          h("ol", { class: "qc-list" }, ...mem.map((x) => row(x, ++n))),
        ),
      );
    }
    if (rest.length) {
      const doneN = rest.filter((i) => i.done).length;
      const reqN = rest.filter((i) => !i.optional).length;
      const open = this.showList || memDone || !mem.length || fin;
      if (!open)
        body.append(
          h(
            "button",
            {
              type: "button",
              class: "qc-open",
              onclick: () => {
                this.openList(r);
                this.sig = "";
                this.update(true);
              },
            },
            h(
              "span",
              {},
              `${w.checklist} · ${rest.length} ${rest.length > 1 ? w.items : w.item}`,
            ),
            h("kbd", { class: "procp-kbd" }, "Shift+C"),
          ),
        );
      else {
        const base = n;
        body.append(
          h(
            "section",
            { class: "qc-chk" },
            h(
              "div",
              { class: "qc-sec" },
              h("span", {}, w.checklist),
              h(
                "span",
                { class: "qc-count" },
                `${Math.min(doneN, reqN)}/${reqN}`,
              ),
            ),
            h(
              "ol",
              { class: "qc-list" },
              ...rest.map((x, k) => row(x, base + k + 1)),
            ),
          ),
        );
      }
    }
    if (fin)
      body.insertBefore(
        h(
          "div",
          { class: `qc-fin ${good ? "ok" : noGlide ? "warn" : "stop"}` },
          noGlide ? svgIcon(I.warning, 18) : tick(),
          h(
            "div",
            {},
            h(
              "b",
              {},
              noGlide
                ? finText
                : st.stopped
                  ? good
                    ? w.complete
                    : w.incomplete
                  : w.complete,
            ),
            h("small", {}, st.stopped ? w.results : w.watching),
          ),
        ),
        // above the list: once it is done, what matters is the line that says so (and to keep flying)
        body.querySelector(".qc-mem, .qc-chk, .qc-open"),
      );
    body.append(
      h(
        "div",
        { class: "qc-foot" },
        p.ref ? h("span", {}, p.ref) : null,
        h("span", {}, p.disclaimer ?? DISCLAIMER[L]),
      ),
    );
    // the card is rebuilt on every tick of an item: keep the reading position, and bring the item to do now into
    // view — a long checklist never hides the next step
    body.scrollTop = this.bodyScroll;
    body.addEventListener("scroll", () => (this.bodyScroll = body.scrollTop), {
      passive: true,
    });
    const target = body.querySelector<HTMLElement>(".qc-row.cur");
    if (target && !fin) {
      const br = body.getBoundingClientRect();
      const tr = target.getBoundingClientRect();
      if (br.height > 0 && (tr.bottom > br.bottom - 4 || tr.top < br.top)) {
        body.scrollTop += tr.top - br.top - Math.min(64, br.height / 4);
        this.bodyScroll = body.scrollTop;
      }
    }
  }
  private bodyScroll = 0;

  // ---------------------------------------------------------------- test: the discreet button + checklist index
  private testSig(st: ProcedureRunState | null) {
    // closed-loop items of the picked checklist tick as the aircraft is: their live state is part of the picture
    const pick = this.qrhPick
      ? this.ctrl.list().find((p) => p.id === this.qrhPick)
      : null;
    let live = "";
    if (pick) {
      const view = this.ctrl.liveView();
      live = pick.items
        .map((it) => (this.sensedNow(it, view) ? "1" : "0"))
        .join("");
      const gs = this.ctrl.matching(pick).map((r) => r.state());
      live += `|${gs.map((s) => s.items.map((i) => `${+i.done}${+!!i.revealed}`).join("")).join("/")}`;
    }
    return `X|${uiLang()}|${this.qrhOpen}|${this.qrhGroup}|${this.qrhPick}|${st?.procedureId ?? ""}|${[...this.localDone].join(",")}|${[...this.localShown].join(",")}|${live}`;
  }
  private sensedNow(it: ProcItem, view: ProcSimView | null): boolean {
    if (
      !view ||
      !it.check ||
      it.check.id === "manual" ||
      it.check.id === "landed"
    )
      return false;
    const d = checkDef(it.check);
    if (!d) return false;
    try {
      return d.evaluate(view, it.check.p, { failedAtS: view.t, elapsedS: 0 });
    } catch {
      return false;
    }
  }
  private renderTest(r: ProcedureRunner | null) {
    void r;
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
        title: `${w.checklistBtn} (Shift+C)`,
        onclick: () => this.toggleChecklist(),
      },
      svgIcon(I.clipboard, 18),
      w.checklistBtn,
    );
    // a short dock (iPad landscape, laptop outside view): the open index has no room for a bar of its own — the
    // Checklist toggle and the clock ride in the index header, the rows get the height
    const compact = this.el.classList.contains("compact") && this.qrhOpen;
    if (compact) {
      btn.classList.add("icon");
      btn.setAttribute("aria-label", `${w.checklistBtn} · ${w.close}`);
      btn.lastChild?.remove();
    }
    const hx = compact ? h("div", { class: "qc-hx" }, time, btn) : null;
    this.card.classList.toggle("qrh-compact", compact);
    if (!compact) this.card.append(h("div", { class: "pv-test" }, btn, time));
    if (!this.qrhOpen) return;
    const list = this.ctrl
      .cockpitList()
      .filter((p) => p.lang === L && p.failures.length);
    const box = h("div", { class: "procp-qrh" });
    this.card.append(box);
    const pick = this.qrhPick
      ? (list.find((p) => p.id === this.qrhPick) ?? null)
      : null;
    const back = (label: string, to: () => void) =>
      h(
        "button",
        {
          type: "button",
          class: "procp-back",
          onclick: () => {
            to();
            this.sig = "";
            this.update(true);
          },
        },
        svgIcon(I.chevDown, 16),
        label,
      );
    if (!pick && !this.qrhGroup) {
      // level 1: the groups, as big tiles (G1000 CHKLIST: groups first, then the checklists)
      box.append(
        h(
          "div",
          { class: "procp-qrh-h" },
          h("b", {}, w.qrh),
          compact ? hx : h("small", {}, w.qrhHint),
        ),
      );
      const grid = h("div", { class: "qc-groups" });
      for (const cat of QRH_ORDER) {
        const ps = list.filter((p) => p.category === cat);
        if (!ps.length) continue;
        grid.append(
          h(
            "button",
            {
              type: "button",
              class: `qc-group${cat === "fire" ? " fire" : ""}`,
              onclick: () => {
                this.qrhGroup = cat;
                this.sig = "";
                this.update(true);
              },
            },
            h("b", {}, CATEGORY_LABELS[cat][L]),
            h("small", {}, String(ps.length)),
          ),
        );
      }
      box.append(h("div", { class: "procp-qrh-list" }, grid));
      return;
    }
    if (!pick) {
      // level 2: the checklists of the group
      const ps = list.filter((p) => p.category === this.qrhGroup);
      box.append(
        h(
          "div",
          { class: "procp-qrh-h" },
          back(w.back, () => (this.qrhGroup = null)),
          h("b", {}, CATEGORY_LABELS[this.qrhGroup!][L]),
          hx,
        ),
      );
      const scroll = h("div", { class: "procp-qrh-list" });
      for (const p of ps)
        scroll.append(
          h(
            "button",
            {
              type: "button",
              class: "procp-qrh-it",
              onclick: () => {
                this.qrhPick = p.id;
                this.ctrl.pickChecklist(p);
                this.sig = "";
                this.update(true);
              },
            },
            h("span", {}, p.title),
            svgIcon(I.arrow, 16),
          ),
        );
      box.append(scroll);
      return;
    }
    // level 3: the picked checklist. Memory items stay hidden until done or revealed (a recorded hint): reading
    // them here would not be recalling them. Closed-loop items tick as the aircraft is; callouts take Done.
    const graded = this.ctrl.matching(pick);
    const states = graded.map((g) => g.state());
    const doneIn = (id: string) =>
      states.some((s) => s.items.some((i) => i.id === id && i.done)) ||
      this.localDone.has(`${pick.id}|${id}`);
    const shownIn = (id: string) =>
      states.some((s) =>
        s.items.some((i) => i.id === id && (i.revealed || i.done)),
      ) || this.localShown.has(`${pick.id}|${id}`);
    const view = this.ctrl.liveView();
    box.append(
      h(
        "div",
        { class: "procp-qrh-h" },
        back(CATEGORY_LABELS[pick.category][L], () => {
          this.qrhGroup = pick.category;
          this.qrhPick = null;
        }),
        h("b", {}, pick.title),
        hx,
      ),
    );
    box.append(
      h(
        "div",
        { class: "qc-aviate" },
        h("span", { class: "qc-aviate-k" }, w.aviate),
        h("span", {}, aviateText(pick, L)),
      ),
    );
    const manual = (it: ProcItem) =>
      !it.check || it.check.id === "manual" || !checkDef(it.check);
    let curFound = false;
    const row = (it: ProcItem, n: number) => {
      const done = doneIn(it.id) || (!manual(it) && this.sensedNow(it, view));
      const hidden = it.memory && !shownIn(it.id) && !doneIn(it.id);
      const isCur = !curFound && !done && !it.optional;
      if (isCur) curFound = true;
      const [ch, rs] = splitChallenge(it.text);
      const cls = [
        "qc-row",
        done ? "done" : "",
        isCur ? "cur" : "",
        it.optional ? "opt" : "",
        hidden ? "hidden" : "",
      ]
        .filter(Boolean)
        .join(" ");
      const line = hidden
        ? h(
            "div",
            { class: "qc-line" },
            h("span", { class: "qc-ch qc-slot" }, `${w.memItem} ${n}`),
          )
        : h(
            "div",
            {
              class: `qc-line${rs && rs.length > LONG_RESPONSE ? " long" : ""}`,
            },
            h("span", { class: "qc-ch" }, ch),
            rs ? h("span", { class: "qc-dots", "aria-hidden": "true" }) : null,
            rs ? h("span", { class: "qc-rs" }, rs) : null,
          );
      let right: HTMLElement | null = null;
      if (hidden)
        right = h(
          "button",
          {
            type: "button",
            class: "qc-reveal",
            title: w.revealTip,
            onclick: () => {
              this.ctrl.revealOn(pick, it.id);
              this.localShown.add(`${pick.id}|${it.id}`);
              this.sig = "";
              this.update(true);
            },
          },
          svgIcon(I.eye, 16),
          w.reveal,
        );
      else if (manual(it) && !done)
        right = h(
          "button",
          {
            type: "button",
            class: "qc-done",
            "aria-label": `${w.done}: ${it.text}`,
            onclick: () => {
              // every procedure running that has this checklist gets the confirmation (two failures at once)
              this.ctrl.confirmOn(pick, it.id);
              this.localDone.add(`${pick.id}|${it.id}`);
              this.sig = "";
              this.update(true);
            },
          },
          w.done,
        );
      else if (it.optional && !done)
        right = h("span", { class: "qc-opt" }, w.optional);
      return h(
        "li",
        { class: cls },
        h(
          "span",
          { class: "qc-glyph", "aria-hidden": "true" },
          done ? tick() : String(n),
        ),
        h("div", { class: "qc-main" }, line),
        right,
      );
    };
    let n = 0;
    const scroll = h("div", { class: "procp-qrh-list" });
    const mem = pick.items.filter((i) => i.memory);
    const rest = pick.items.filter((i) => !i.memory);
    if (mem.length)
      scroll.append(
        h(
          "section",
          { class: "qc-mem" },
          h(
            "div",
            { class: "qc-sec" },
            h("span", {}, w.memory),
            h("span", { class: "qc-timer" }, w.memHidden),
          ),
          h("ol", { class: "qc-list" }, ...mem.map((it) => row(it, ++n))),
        ),
      );
    if (rest.length)
      scroll.append(
        h(
          "section",
          { class: "qc-chk" },
          h("div", { class: "qc-sec" }, h("span", {}, w.checklist)),
          h("ol", { class: "qc-list" }, ...rest.map((it) => row(it, ++n))),
        ),
      );
    scroll.append(
      h(
        "div",
        { class: "qc-foot" },
        pick.ref ? h("span", {}, pick.ref) : null,
        h("span", {}, pick.disclaimer ?? DISCLAIMER[L]),
      ),
    );
    box.append(scroll);
    // keep the reading position across rebuilds, and bring the item to do now into view (place-keeping)
    scroll.scrollTop = this.qrhScroll.get(pick.id) ?? 0;
    scroll.addEventListener(
      "scroll",
      () => this.qrhScroll.set(pick.id, scroll.scrollTop),
      { passive: true },
    );
    const cur = scroll.querySelector<HTMLElement>(".qc-row.cur");
    if (cur) {
      const br = scroll.getBoundingClientRect();
      const tr = cur.getBoundingClientRect();
      if (br.height > 0 && (tr.bottom > br.bottom - 4 || tr.top < br.top)) {
        scroll.scrollTop += tr.top - br.top - Math.min(48, br.height / 4);
        this.qrhScroll.set(pick.id, scroll.scrollTop);
      }
    }
  }
  private qrhScroll = new Map<string, number>();
}

/** plain words for a failure in the UI language (instructor drawer, toasts) */
export const failureName = (k: FailureKey) => failureText(k, uiLang());
export type { ProcedureRunner };

const POS_KEY = "ifr.procp.pos";
function readPos(): { x: number; y: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(POS_KEY) ?? "null");
    return v && Number.isFinite(v.x) && Number.isFinite(v.y)
      ? { x: v.x, y: v.y }
      : null;
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
