// Ground school player (package E, SPEC §6, mockups final/player.png and final/flyit.png).
//   top bar   back, course title + club · CFI · mode, progress ticks (outlined where the student acts), n / N,
//             status pill (back from the cockpit, not saved on this device), EN | FR, Outline
//   body      split (Reader | Stage; stage over reader in portrait; a sticky stage strip on a phone),
//             stageWide (Page steps), readerOnly (theory, quiz, calc without a stage, drill), fly (the Fly-it card),
//             canvas (a designed slide, drawn by the injected slide renderer)
//   footer    Back · Hint · Show me · Next (Next is always open; it steps through reveals first)
// Steps: Page, Explain (reveal steps), Predict (commit, the stage plays, then the explanation), Watch (clip with
// Take over), Try it ("Do this" ticked live by the goal tracker), Tap, Quiz (incl. answer by flying), Calc, Drill,
// Fly it (brief → cockpit → debrief, self-grade first), designed slides; a Fly-it briefing plays in place as a
// mini-course. Resume, keyboard (→ / PageDown / Space, ← / PageUp, O, H; the stage's own keys first), an
// aria-live region, FR / EN.
import type {
  AttemptRecord,
  BlockAction,
  CalcProblem,
  Course,
  DesignedStep,
  FlyOption,
  GuidanceLevel,
  Lang,
  Quiz,
  SimScene,
  Step,
  StepGoal,
  StageCue,
} from "../types";
import type { CourseStore } from "../store";
import { cockpitBridgeReady, legacyFlyLink } from "../cockpitLink";
import {
  createHandoff,
  flyUrl,
  handoffStatus,
  recordAttempt,
  recordFlyResult,
  HandoffCreateError,
} from "../handoff";
import {
  GoalTracker,
  goalSummary,
  goalUnitsNote,
  rowsFor,
  stageView,
  type GoalState,
} from "../goals";
import { applyScene, sceneFromFields, sceneSummary } from "../scene";
import { problemFor } from "../calc";
import { windText } from "../calc/text";
import { Sim } from "../../sim/sim";
import { renderSlide } from "../canvas/render";
import { baseThemeId } from "../canvas/themes";
import { StageFrame } from "../stage/frame";
import type { StageEnv, StageEvent } from "../stage/host";
import { newInstrumentStates, renderPane } from "../stage/views";
import { paneFrame } from "../stage/geometry";
import {
  btn,
  h,
  hasDoThis,
  hasPresenterReveal,
  icon,
  kindChip,
  L,
  ps,
  ReaderView,
  revealCount,
  richEl,
  stepMeta,
  takeawaysOf,
  textEl,
  type ReaderRevealState,
} from "./reader";
import { QuizView, type QuizResult } from "./quiz";
import {
  CalcView,
  calcStageView,
  calcRevealed,
  newCalcState,
  responseText,
  type CalcUiState,
} from "./calcStep";
import { DrillView, type DrillRun } from "./drill";
import { markText, OutlineSheet, ticksEl, type StepMark } from "./outline";
import {
  FlyItView,
  flownText,
  type DebriefTrace,
  type FlyModel,
  type SelfGrade,
} from "./debrief";
import "../../styles/course-stage.css";
import "../../styles/course-canvas.css";
import "../../styles/course.css";

// ------------------------------------------------------------------ designed slides (package N renders them)
export interface SlideContext {
  course: Course;
  step: DesignedStep;
  lang: Lang;
  env: StageEnv;
  /** the slide's reveal position (Next presses consumed so far) */
  reveal: number;
  announce(text: string): void;
  /** a tap on a block with an action the player handles (next, goto, open, url) */
  onAction(a: BlockAction): void;
  /** the problem the student is solving / solved in a calc step (blocks with fromCalc, bindings) */
  calcProblem?(stepId: string): CalcProblem | null;
}
/** The default slide renderer: the canvas package's SlideView in play mode. */
export const canvasSlideRenderer: SlideRenderer = (ctx) => {
  const el = h("div", { class: "cp-slide" });
  const v = renderSlide(ctx.step.slide, el, {
    mode: "play",
    lang: ctx.lang,
    theme: ctx.course.theme,
    brand: ctx.course.brand,
    scenes: ctx.course.scenes,
    cockpit: ctx.course.cockpit,
    assetUrl: ctx.env.assetUrl,
    step: ctx.step,
    reveal: ctx.reveal,
    label: L(ctx.step.title, ctx.lang),
    calcProblem: (id) => ctx.calcProblem?.(id) ?? null,
    onAction: (a) => ctx.onAction(a),
  });
  return { el, next: () => v.next(), prev: () => v.prev(), setLang: (l) => v.setLang(l), destroy: () => v.destroy() };
};
export interface SlideHost {
  el: HTMLElement;
  /** Next: consume one reveal (true) or let the player go to the next step (false) */
  next?(): boolean;
  prev?(): boolean;
  setLang?(l: Lang): void;
  destroy(): void;
}
export type SlideRenderer = (ctx: SlideContext) => SlideHost;

// ------------------------------------------------------------------ pure helpers (unit-tested)
export type PlayerLayout =
  | "split"
  | "stageWide"
  | "readerOnly"
  | "fly"
  | "canvas";
/** The layout of a step: its own, else from its kind and whether it has a stage. */
export function layoutFor(
  step: Step,
  hasStage: boolean,
  canRenderSlide: boolean,
): PlayerLayout {
  if (step.kind === "fly") return "fly";
  if (step.slide && canRenderSlide) return "canvas";
  if (step.slide) return "readerOnly";
  if (step.kind === "drill") return "readerOnly";
  if (!hasStage) return "readerOnly";
  if (
    step.layout === "readerOnly" ||
    step.layout === "stageWide" ||
    step.layout === "split"
  )
    return step.layout;
  return step.kind === "page" ? "stageWide" : "split";
}
/** The steps a run shows: refresher runs skip 'intro' steps; a guidance level hides pages not meant for it. */
export function visibleSteps(
  steps: readonly Step[],
  o: { refresher?: boolean; level?: GuidanceLevel } = {},
): Step[] {
  return steps.filter(
    (s) =>
      !(o.refresher && s.audience === "intro") &&
      !(o.level && s.levels?.length && !s.levels.includes(o.level)),
  );
}
/** The quiz a step asks (predict / quiz / tap steps carry it in step.quiz). */
export function stepQuiz(step: Step): Quiz | null {
  return step.quiz &&
    ["predict", "quiz", "tap", "explain", "try", "watch", "page"].includes(
      step.kind,
    )
    ? step.quiz
    : null;
}
/** Seconds for "Fly it · 6:40" etc. */
export const elapsedS = (from: number, to: number): number =>
  Math.max(0, Math.round((to - from) / 1000));
/** Whether a cue uses the assist (assisted steps are never ACS-graded). */
export const assisted = (cue: StageCue | undefined): boolean =>
  !!(
    cue?.assist?.holdAlt ||
    cue?.assist?.holdIas ||
    (cue?.assist?.timeScale ?? 1) > 1
  );
/** Progress of the goal strip: rows ticked, then the hold time. */
export function goalProgress(g: GoalState): number {
  if (g.met) return 1;
  const rows = g.rows.filter((r) => r.check >= 0);
  const ticked = rows.filter((r) => r.ticked).length;
  const parts = rows.length + (g.holdS > 0 ? 1 : 0);
  const hold = g.holdS > 0 ? Math.min(1, g.heldS / g.holdS) : 0;
  return parts ? (ticked + hold) / parts : 0;
}

// ------------------------------------------------------------------ state
interface StepState {
  reveal: number;
  quiz?: QuizResult | null;
  /** predict: the outcome has played */
  played?: boolean;
  calc?: CalcUiState;
  goalMet?: boolean;
  checks?: boolean[];
  hint?: boolean;
  showMe?: boolean;
  /** a covered calc diagram was opened before answering */
  peek?: boolean;
  options?: FlyOption[];
  mark: StepMark;
  /** an attempt recorded on this visit */
  recorded?: Set<string>;
}
interface Ctx {
  steps: Step[];
  /** a Fly-it briefing played in place */
  briefingOf?: { step: Step; index: number };
}
export interface PlayerOptions {
  course: Course;
  store?: CourseStore | null;
  lang?: Lang;
  profileId?: string;
  /** #s=<stepId> */
  stepId?: string;
  /** #a=<token>: back from the cockpit */
  token?: string;
  /** the subtitle's mode word (default "self-study") */
  mode?: string;
  refresher?: boolean;
  level?: GuidanceLevel;
  /** designed slides (default: the canvas renderer, course/canvas/render.ts); null shows their linear text */
  renderSlide?: SlideRenderer | null;
  /** the trace of a flown attempt (the recorder lives in the cockpit; the integrator provides it) */
  loadTrace?: (
    attempt: AttemptRecord,
    step: Step,
  ) => Promise<DebriefTrace | null> | DebriefTrace | null;
  /** "Replay with trace" (opens the debrief replay in the cockpit) */
  onReplay?: (attempt: AttemptRecord, step: Step) => void;
  /** the back button */
  onExit?: () => void;
  onLang?: (l: Lang) => void;
  /** the current step changed (the host keeps #play=…&s= in sync) */
  onStep?: (stepId: string) => void;
  /** default location.assign */
  navigate?: (url: string) => void;
  /** asset id → URL (default: the store's blobs as object URLs) */
  assetUrl?: (id: string) => Promise<string | null> | string | null;
  /** clock (tests) */
  now?: () => Date;
  /** the step or its reveal position changed (the presenter mirrors it on the projector) */
  onState?: (s: { stepId: string; index: number; reveal: number }) => void;
  /** the cockpit flies course steps (default: the flag the installed cockpit bridge writes, cockpitLink.ts) */
  cockpitReady?: boolean;
  /** the editor's preview / Test as student: no store on purpose, so no "storage unavailable" error */
  preview?: boolean;
}

export class CoursePlayer {
  readonly el: HTMLDivElement;
  readonly frame: StageFrame;
  private course: Course;
  private store: CourseStore | null;
  private lang: Lang;
  private profileId: string;
  private ctx: Ctx;
  private i = 0;
  private states = new Map<string, StepState>();
  private enteredAt = Date.now();
  private posedStepId = "";
  // dom
  private top: HTMLElement;
  private body: HTMLElement;
  private readerCol: HTMLElement;
  private scroll: HTMLElement;
  private foot: HTMLElement;
  private stageCol: HTMLElement;
  private wideCol: HTMLElement;
  private bottom: HTMLElement;
  private live: HTMLElement;
  private toastEl: HTMLElement;
  private pill: HTMLElement | null = null;
  // current step widgets
  private reader: ReaderView | null = null;
  private quiz: QuizView | null = null;
  private calc: CalcView | null = null;
  private drill: DrillView | null = null;
  private fly: FlyItView | null = null;
  private slide: SlideHost | null = null;
  private tracker: GoalTracker | null = null;
  private trackerGoal: StepGoal | null = null;
  private lastRows = "";
  private rowT = 0;
  private hintEl: HTMLElement | null = null;
  private calcPosed = "";
  private keptTracker: GoalTracker | null = null;
  private freshShow = true;
  private outline: OutlineSheet | null = null;
  private summaryOn = false;
  private urls = new Map<string, string>();
  private saveT = 0;
  private unsub: () => void;
  private destroyed = false;

  constructor(private o: PlayerOptions) {
    this.course = o.course;
    this.store = o.store ?? null;
    this.lang = o.lang ?? "en";
    this.profileId = o.profileId ?? "local";
    this.ctx = { steps: visibleSteps(o.course.steps, o) };
    this.el = h("div", { class: "cp-app", lang: this.lang });
    this.top = h("header", { class: "cp-top" });
    this.readerCol = h("section", {
      class: "cp-reader",
      "aria-label": ps("reader", this.lang),
    });
    this.scroll = h("div", { class: "cp-scroll" });
    this.foot = h("div", { class: "cp-foot" });
    this.readerCol.append(this.scroll, this.foot);
    this.frame = new StageFrame({ lang: this.lang, theme: "dark" });
    this.stageCol = h("section", { class: "cp-stagewrap" }, this.frame.el);
    this.wideCol = h("section", { class: "cp-wide" });
    this.bottom = h("div", { class: "cp-bottom" });
    this.body = h(
      "main",
      { class: "cp-body" },
      this.readerCol,
      this.stageCol,
      this.wideCol,
    );
    this.live = h("div", {
      class: "cp-sr",
      "aria-live": "polite",
      role: "status",
    });
    this.toastEl = h("div", { class: "cp-toast", role: "status" });
    this.toastEl.hidden = true;
    this.el.append(this.top, this.body, this.bottom, this.live, this.toastEl);
    this.unsub = this.frame.on((e) => this.onStage(e));
    document.addEventListener("keydown", this.onKey);
    document.addEventListener("keyup", this.onKeyUp);
    const startId = o.stepId;
    const idx = startId
      ? this.ctx.steps.findIndex((s) => s.id === startId)
      : -1;
    this.i = Math.max(0, idx);
    this.show(true);
    if (idx < 0) void this.resume();
    if (o.token) void this.backFromCockpit(o.token);
  }

  // ---------------------------------------------------------------- public
  get stepIndex(): number {
    return this.i;
  }
  get step(): Step {
    return this.ctx.steps[this.i];
  }
  get steps(): readonly Step[] {
    return this.ctx.steps;
  }
  mount(root: HTMLElement) {
    root.append(this.el);
  }
  setLang(l: Lang) {
    if (l === this.lang) return;
    this.lang = l;
    this.el.lang = l;
    this.frame.setLang(l);
    this.readerCol.setAttribute("aria-label", ps("reader", l));
    this.o.onLang?.(l);
    if (this.summaryOn) this.showSummary();
    else this.show(false);
  }
  goTo(i: number) {
    if (i < 0 || i >= this.ctx.steps.length) return;
    this.leaveStep();
    this.i = i;
    this.summaryOn = false;
    this.show(true);
  }
  goToId(id: string) {
    const i = this.ctx.steps.findIndex((s) => s.id === id);
    if (i >= 0) this.goTo(i);
    else if (this.ctx.briefingOf) {
      this.endBriefing();
      this.goToId(id);
    }
  }
  next() {
    if (this.summaryOn) return;
    const st = this.state(this.step);
    if (this.slide?.next?.()) {
      st.reveal++;
      this.persistSoon();
      this.emitState();
      return;
    }
    const n = this.revealsOf(this.step);
    if (st.reveal < n) {
      st.reveal++;
      this.applyReveal();
      this.syncFoot();
      this.persistSoon();
      this.emitState();
      this.announce(`${ps("revealNext", this.lang)} ${st.reveal} / ${n}`);
      return;
    }
    if (this.i + 1 < this.ctx.steps.length) return this.goTo(this.i + 1);
    if (this.ctx.briefingOf) return this.endBriefing();
    this.leaveStep();
    this.showSummary();
  }
  back() {
    if (this.summaryOn) {
      this.summaryOn = false;
      this.show(true);
      return;
    }
    if (this.slide?.prev?.()) {
      const st = this.state(this.step);
      st.reveal = Math.max(0, st.reveal - 1);
      this.emitState();
      return;
    }
    if (this.i > 0) return this.goTo(this.i - 1);
    if (this.ctx.briefingOf) this.endBriefing(true);
  }
  /** how far the current step is revealed */
  get reveal(): number {
    return this.state(this.step).reveal;
  }
  /** jump to a reveal position of the current step (the projector follows the presenter) */
  setReveal(n: number) {
    if (this.summaryOn) return;
    const st = this.state(this.step);
    const want = Math.max(0, Math.floor(n));
    if (this.slide) {
      let guard = 64;
      while (st.reveal < want && guard-- > 0 && this.slide.next?.()) st.reveal++;
      while (st.reveal > want && guard-- > 0 && this.slide.prev?.()) st.reveal--;
    } else {
      st.reveal = Math.min(want, this.revealsOf(this.step));
      this.applyReveal();
      this.syncFoot();
    }
    this.emitState();
  }
  private emitState() {
    if (!this.summaryOn && this.ctx.steps[this.i])
      this.o.onState?.({ stepId: this.step.id, index: this.i, reveal: this.state(this.step).reveal });
  }
  openOutline() {
    if (this.outline?.isOpen) return;
    this.outline = new OutlineSheet({
      lang: this.lang,
      title: this.course.title,
      steps: this.ctx.steps,
      marks: this.marks(),
      current: this.summaryOn ? -1 : this.i,
      onJump: (i) => this.goTo(i),
    });
    this.outline.open(this.el);
  }
  destroy() {
    this.destroyed = true;
    this.leaveStep();
    this.clearWidgets();
    this.unsub();
    document.removeEventListener("keydown", this.onKey);
    document.removeEventListener("keyup", this.onKeyUp);
    window.clearTimeout(this.saveT);
    this.frame.destroy();
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.el.remove();
  }

  // ---------------------------------------------------------------- state
  private state(step: Step): StepState {
    let s = this.states.get(step.id);
    if (!s) {
      s = { reveal: 0, mark: {} };
      this.states.set(step.id, s);
    }
    return s;
  }
  private marks(): Record<string, StepMark> {
    const m: Record<string, StepMark> = {};
    for (const [k, v] of this.states) m[k] = v.mark;
    return m;
  }
  private revealsOf(step: Step): number {
    return revealCount(step);
  }
  private env(): StageEnv {
    return {
      scenes: this.course.scenes,
      clips: this.course.clips,
      cockpit: this.course.cockpit,
      assetUrl: this.assetUrl,
    };
  }
  private assetUrl = (id: string): Promise<string | null> | string | null => {
    if (this.o.assetUrl) return this.o.assetUrl(id);
    const have = this.urls.get(id);
    if (have) return have;
    if (!this.store) return null;
    return this.store
      .getAsset(id)
      .then((b) => {
        if (!b || this.destroyed) return null;
        const u = URL.createObjectURL(b);
        this.urls.set(id, u);
        return u;
      })
      .catch(() => null);
  };
  private announce(text: string) {
    this.live.textContent = "";
    window.setTimeout(() => (this.live.textContent = text), 30);
  }
  private toast(text: string, action?: { label: string; run: () => void }) {
    const t = this.toastEl;
    t.replaceChildren(h("span", {}, text));
    if (action)
      t.append(
        btn(action.label, "sm ghost", () => {
          t.hidden = true;
          action.run();
        }),
      );
    t.hidden = false;
    window.setTimeout(() => (t.hidden = true), 6000);
  }

  // ---------------------------------------------------------------- top bar
  private renderTop() {
    const lang = this.lang;
    const c = this.course;
    const steps = this.ctx.steps;
    const back = h(
      "button",
      {
        type: "button",
        class: "cp-btn iconbtn",
        "aria-label": this.ctx.briefingOf
          ? ps("backToFlyIt", lang)
          : ps("backToLibrary", lang),
      },
      icon("back"),
    );
    back.addEventListener("click", () =>
      this.ctx.briefingOf
        ? this.endBriefing(true)
        : this.o.onExit
          ? this.o.onExit()
          : history.back(),
    );
    const sub = this.ctx.briefingOf
      ? `${ps("briefing", lang)} · ${L(this.ctx.briefingOf.step.title, lang)}`
      : [c.author.club, c.author.name, this.o.mode ?? ps("selfStudy", lang)]
          .filter(Boolean)
          .join(" · ");
    const title = textEl("b", c.title, lang);
    const ttl = h("div", { class: "cp-ttl" }, title, h("span", {}, sub));
    const count = h(
      "span",
      { class: "cp-count num" },
      this.summaryOn
        ? `${steps.length} / ${steps.length}`
        : `${this.i + 1} / ${steps.length}`,
    );
    const seg = h("div", {
      class: "cp-langseg",
      role: "group",
      "aria-label": ps("language", lang),
    });
    for (const l of ["en", "fr"] as Lang[]) {
      const b = h(
        "button",
        {
          type: "button",
          class: l === lang ? "on" : "",
          "aria-pressed": String(l === lang),
          lang: l,
        },
        l.toUpperCase(),
      );
      b.addEventListener("click", () => this.setLang(l));
      seg.append(b);
    }
    const ol = btn(ps("outline", lang), "sm", () => this.openOutline(), "menu");
    ol.setAttribute("aria-keyshortcuts", "O");
    const parts: (HTMLElement | null)[] = [
      back,
      ttl,
      h("div", { class: "cp-div" }),
      ticksEl(
        steps,
        this.marks(),
        this.summaryOn ? steps.length : this.i,
        lang,
      ),
      count,
      h("div", { class: "sp" }),
    ];
    if (this.pill) parts.push(this.pill);
    if (this.store && this.store.backend === "memory")
      parts.push(
        h(
          "span",
          { class: "cp-pill warn", title: this.store.reason ?? "" },
          ps("notSaved", lang),
        ),
      );
    if (this.ctx.briefingOf)
      parts.push(
        btn(ps("backToFlyIt", lang), "sm quiet", () => this.endBriefing(true)),
      );
    parts.push(seg, ol);
    this.top.replaceChildren(...parts.filter((x): x is HTMLElement => !!x));
  }

  // ---------------------------------------------------------------- steps
  private clearWidgets() {
    this.reader?.destroy();
    this.quiz?.destroy();
    this.drill?.destroy();
    this.slide?.destroy();
    this.reader =
      this.quiz =
      this.calc =
      this.drill =
      this.fly =
      this.slide =
        null;
    this.keptTracker = this.tracker;
    this.tracker = null;
    this.trackerGoal = null;
    this.lastRows = "";
    this.hintEl = null;
  }
  /** Leaving a step: an acting step not done is marked skipped; a Try it in progress is recorded once. */
  private leaveStep() {
    const step = this.ctx.steps[this.i];
    if (!step) return;
    const st = this.state(step);
    const m = st.mark;
    const done =
      m.answered || m.goalMet || m.calcOk !== undefined || m.drill || m.flown;
    if (!done && step.goal && this.tracker && !st.recorded?.has("try")) {
      const g = this.tracker.state();
      this.record(step, {
        kind: "try",
        goalMet: false,
        checks: g.rows.filter((r) => r.check >= 0).map((r) => r.ticked),
        skipped: true,
      });
    }
    if (!done) m.skipped = true;
  }
  /** Render the current step; `fresh` re-applies the stage (a language switch keeps the stage as it is). */
  private show(fresh: boolean) {
    const step = this.step;
    if (!step) return this.renderEmpty();
    const st = this.state(step);
    const lang = this.lang;
    if (fresh) this.enteredAt = Date.now();
    this.freshShow = fresh;
    st.mark.visited = true;
    this.clearWidgets();
    this.summaryOn = false;
    this.scroll.replaceChildren();
    this.wideCol.replaceChildren();
    this.stageCol.querySelectorAll(".cp-stage-close").forEach((e) => e.remove());
    // a calc step's solution cover belongs to that step only: never left over the next step's stage
    if (this.posedStepId !== step.id) {
      this.setCover(null);
      this.calcPosed = "";
      this.posedStepId = step.id;
    }
    this.readerCol.hidden = false;
    this.bottom.replaceChildren();
    // which stage, which layout
    const calcView =
      step.kind === "calc" && step.calc && !step.stage
        ? calcStageView(
            problemFor(step.calc, (st.calc ??= newCalcState(step.calc)).seed),
            step.calc,
          )
        : null;
    const linked = this.linkedProblem(step);
    const hasStage =
      !!step.stage ||
      !!calcView ||
      !!(
        linked &&
        step.calcLink &&
        step.calcLink.use !== "goal" &&
        linked.stage
      );
    const layout = layoutFor(step, hasStage, this.o.renderSlide !== null);
    this.body.dataset.layout = layout;
    this.body.dataset.kind = step.kind;
    this.el.dataset.layout = layout;
    // the chrome around a designed slide follows the course theme (SPEC slides v2 §10): never a dark slide in a
    // white frame
    this.el.dataset.chrome = layout === "canvas" ? baseThemeId(this.course.theme) : "";
    // stage
    if (fresh) {
      if (layout === "split" || layout === "stageWide") {
        if (step.stage)
          this.frame.show(step.stage, this.env(), {
            reveal: this.revealState(step),
            labels: this.paneLabels(step),
          });
        else if (linked?.stage) this.frame.showHint(linked.stage, this.env());
        // calc steps: the CalcView's onProblem poses the stage
      } else this.frame.show(null, this.env());
    }
    // header
    const head = h(
      "div",
      { class: "cp-head" },
      h(
        "div",
        { class: "cp-meta" },
        kindChip(step.kind, lang),
        h("span", { class: "cp-muted" }, stepMeta(step, lang)),
      ),
      textEl("h1", step.title, lang, "cp-h1"),
    );
    // content
    if (layout === "fly") this.renderFly(step, st);
    else if (layout === "canvas") this.renderSlide(step as DesignedStep, st);
    else {
      this.scroll.append(head);
      if (step.slide)
        this.scroll.append(
          h(
            "p",
            { class: "cp-note-line" },
            icon("info"),
            ps("slideFallback", lang),
          ),
        );
      if (step.kind === "drill" && step.drill) this.renderDrill(step, st);
      else if (step.kind === "calc" && step.calc) {
        // the problem first; the author's reader (theory, formula card) below it
        this.renderCalc(step, st, fresh);
        this.renderReader(step, st);
      } else {
        this.renderReader(step, st);
        this.renderQuiz(step, st);
      }
      this.renderGoal(step, st, linked);
    }
    this.renderTop();
    this.syncFoot();
    this.applyReveal();
    this.scroll.scrollTop = 0;
    this.emitState();
    if (fresh) {
      this.persistSoon();
      this.o.onStep?.(step.id);
      this.announce(
        ps("stepAnnounce", lang, {
          n: this.i + 1,
          total: this.ctx.steps.length,
          title: L(step.title, lang),
        }),
      );
    }
  }
  private renderEmpty() {
    this.body.dataset.layout = "readerOnly";
    this.scroll.replaceChildren(h("p", { class: "cp-muted" }, "—"));
    this.renderTop();
  }
  private paneLabels(step: Step): [string?, string?] | undefined {
    const imgs = step.reader.filter(
      (b): b is Extract<Step["reader"][number], { t: "image" }> =>
        b.t === "image",
    );
    return imgs.length
      ? [
          L(imgs[0].alt, this.lang),
          imgs[1] ? L(imgs[1].alt, this.lang) : undefined,
        ]
      : undefined;
  }
  private revealState(step: Step): {
    reveal: number;
    checks?: boolean[];
    revealed?: boolean;
  } {
    const st = this.state(step);
    return {
      reveal: st.reveal,
      checks: st.checks,
      revealed: !!st.quiz && (step.kind !== "predict" || !!st.played),
    };
  }
  private readerReveal(step: Step): ReaderRevealState {
    const st = this.state(step);
    const n = this.revealsOf(step);
    return {
      reveal: st.reveal,
      answered: !!st.quiz && (step.kind !== "predict" || !!st.played),
      goalMet: !!st.goalMet,
      presenter: hasPresenterReveal(step) && st.reveal >= n,
    };
  }
  private applyReveal() {
    const step = this.step;
    if (!step) return;
    this.reader?.setReveal(this.readerReveal(step));
    if (
      this.body.dataset.layout === "split" ||
      this.body.dataset.layout === "stageWide"
    )
      this.frame.host.setReveal(this.revealState(step));
  }

  // ---------------- reader + quiz
  private renderReader(step: Step, st: StepState) {
    const lang = this.lang;
    this.reader = new ReaderView(step.reader, {
      lang,
      course: this.course,
      step,
      assetUrl: this.assetUrl,
      onLink: (id) => this.frame.host.highlight(id),
      quiz: (q) => {
        const v = this.makeQuiz(step, q, st, true);
        return v ? { el: v.el, destroy: () => v.destroy() } : null;
      },
      drillProcedure: (procId) =>
        this.bridge()
          ? this.navigate(`index.html?proc=${encodeURIComponent(procId)}`)
          : this.toast(ps("drillNoBridge", this.lang)),
    });
    this.scroll.append(this.reader.el);
    // the hint card (Hint in the footer)
    if (step.hint && step.kind !== "calc") {
      this.hintEl = h(
        "div",
        { class: "cp-hintcard" },
        icon("bulb"),
        h(
          "div",
          {},
          h("div", { class: "cp-label" }, ps("hint", lang)),
          richEl(step.hint, lang),
        ),
      );
      this.hintEl.hidden = !st.hint;
      this.scroll.append(this.hintEl);
    }
  }
  private makeQuiz(
    step: Step,
    q: Quiz,
    st: StepState,
    inline: boolean,
  ): QuizView | null {
    const lang = this.lang;
    const predict = step.kind === "predict" && !inline && !st.played;
    const v = new QuizView(q, {
      lang,
      inline,
      predict,
      seed: hashStr(`${this.profileId}|${step.id}`),
      restore: inline ? null : (st.quiz ?? null),
      view: () => this.view(),
      setTappable: (on) => this.frame.host.setTappable(on),
      announce: (t) => this.announce(t),
      onCalcProblem: (p) => this.poseCalc(step, p),
      onAnswer: (r, first) => {
        if (!inline) st.quiz = r;
        st.mark.answered = true;
        st.mark.correct = r.correct || st.mark.correct;
        if (first)
          this.record(step, {
            kind: q.kind === "calc" ? "calc" : "answer",
            answer: r.answer,
            correct: r.correct,
            ...(r.checks ? { checks: r.checks } : {}),
          });
        if (!inline && step.kind === "predict" && first)
          this.playOutcome(step, st);
        this.applyReveal();
        this.renderTopTicks();
      },
    });
    return v;
  }
  private renderQuiz(step: Step, st: StepState) {
    const q = stepQuiz(step);
    if (!q) {
      if (step.kind === "tap" && step.stage) this.frame.host.setTappable(true);
      return;
    }
    this.quiz = this.makeQuiz(step, q, st, false);
    if (this.quiz)
      this.scroll.append(h("div", { class: "cp-quizwrap" }, this.quiz.el));
  }
  /** Predict: after the commit the stage plays (live N s or the clip), then the explanation shows. */
  private playOutcome(step: Step, st: StepState) {
    const cue = step.stage;
    if (cue?.liveForS) {
      this.frame.host.flyFor(cue.liveForS);
      this.announce(ps("watchWhat", this.lang));
    } else if (cue?.clip && this.course.clips[cue.clip]) {
      this.frame.show({ ...cue, mode: "clip" }, this.env(), {
        reveal: this.revealState(step),
      });
      this.frame.host.toggleClip();
      this.announce(ps("watchWhat", this.lang));
    } else this.outcomePlayed(step, st);
  }
  private outcomePlayed(_step: Step, st: StepState) {
    if (st.played) return;
    st.played = true;
    this.quiz?.revealOutcome();
    this.applyReveal();
  }

  // ---------------- calc
  private renderCalc(step: Step, st: StepState, fresh: boolean) {
    const spec = step.calc!;
    if (fresh) this.calcPosed = "";
    this.calc = new CalcView(spec, {
      lang: this.lang,
      state: st.calc ?? null,
      onProblem: (p) => this.poseCalc(step, p),
      onState: (s) => {
        const seedChanged = st.calc?.seed !== s.seed;
        st.calc = s;
        if (seedChanged) {
          st.peek = false;
          this.persistSoon();
        }
        if (this.calc) this.poseCalc(step, this.calc.problem);
      },
      onCheck: (e) => {
        st.mark.calcOk = e.verdict.ok || !!st.mark.calcOk;
        if (e.first)
          this.record(step, {
            kind: "calc",
            correct: e.verdict.ok,
            answer: e.response.answer,
            calc: { generatorId: e.problem.generatorId, seed: e.problem.seed, params: e.problem.params, response: e.response, verdict: e.verdict, solutionSteps: e.solutionSteps },
          });
        this.renderTopTicks();
      },
      announce: (t) => this.announce(t),
    });
    this.scroll.append(h("div", { class: "cp-calcwrap" }, this.calc.el));
  }
  private poseCalc(step: Step, p: CalcProblem) {
    if (this.step !== step || step.stage) return;
    const layout = this.body.dataset.layout;
    if (layout !== "split" && layout !== "stageWide") return;
    const st = this.state(step);
    const revealed = calcRevealed(st.calc) || !!st.peek;
    // the diagram beside the instrument only on a very wide stage (two panes side by side stay legible)
    const wide = this.stageCol.clientWidth > 0 && this.stageCol.clientWidth / Math.max(1, this.stageCol.clientHeight) >= 2.1;
    const v = calcStageView(p, step.calc ?? { generatorId: p.generatorId }, revealed, wide);
    // diagrams are drawn in one language: a language switch draws them again (a live instrument keeps flying)
    const live = v?.kind === "hint" && v.hint.mode === "live";
    const key = `${p.seed}|${revealed}|${wide}|${live ? "" : this.lang}`;
    if (key === this.calcPosed) return;
    this.calcPosed = key;
    this.setCover(null);
    if (!v) this.frame.show(null, this.env());
    else if (v.kind === "hint") this.frame.showHint(v.hint, this.env(), { labels: [L(step.title, this.lang)] });
    else {
      this.frame.show({ panes: [{ kind: "diagram", d: v.d }], mode: "frozen" }, this.env(), { labels: [L(step.title, this.lang)] });
      if (v.kind === "covered")
        this.setCover(() => {
          st.peek = true;
          this.poseCalc(step, p);
        });
    }
  }
  /** A cover over the stage (a diagram that shows the solution, before the student answers). */
  private setCover(reveal: (() => void) | null) {
    this.stageCol.querySelector(".cp-cover")?.remove();
    if (!reveal) return;
    const lang = this.lang;
    this.stageCol.append(
      h(
        "div",
        { class: "cp-cover" },
        h("div", { class: "box" }, icon("sigma", "i big"), h("b", {}, ps("coverTitle", lang)), h("span", {}, ps("coverBody", lang)), btn(ps("coverShow", lang), "sm", reveal)),
      ),
    );
  }
  /** The problem of a calc step by id (the numbers this student has on it). */
  private calcProblemOf(id: string): CalcProblem | null {
    const src = this.course.steps.find((s) => s.id === id) ?? this.ctx.steps.find((s) => s.id === id);
    if (!src?.calc) return null;
    const st = this.state(src);
    st.calc ??= newCalcState(src.calc);
    try {
      return problemFor(src.calc, st.calc.seed);
    } catch {
      return null;
    }
  }
  /** The problem of the calc step a Try it / Fly it links to (the numbers the student solved). */
  private linkedProblem(step: Step): CalcProblem | null {
    const ref = step.calcLink?.step ?? (step.flyIt?.target.kind === "calc" ? step.flyIt.target.step : undefined);
    return ref ? this.calcProblemOf(ref) : null;
  }


  // ---------------- goal ("Do this", live)
  private renderGoal(step: Step, st: StepState, linked: CalcProblem | null) {
    let goal: StepGoal | null = step.goal ?? null;
    if (
      linked?.stage?.goals?.length &&
      step.calcLink &&
      step.calcLink.use !== "stage"
    )
      goal = {
        all: linked.stage.goals,
        holdS: step.goal?.holdS ?? 5,
        graded: false,
        success: step.goal?.success,
      };
    if (
      !goal ||
      !goal.all.length ||
      (step.kind !== "try" &&
        step.kind !== "watch" &&
        step.kind !== "tap" &&
        step.kind !== "explain")
    ) {
      this.frame.setGoal(null);
      return;
    }
    const lang = this.lang;
    // custom row texts from the reader's Do this block
    const texts: (string | undefined)[] = [];
    const walk = (bs: Step["reader"]) => {
      for (const b of bs) {
        if (b.t === "doThis")
          for (const r of b.rows) texts[r.check] = L(r.text, lang);
        else if (b.t === "reveal") walk(b.blocks);
      }
    };
    walk(step.reader);
    // a language switch keeps the live progress (sticky ticks, the hold timer): the same tracker, new words
    const kept = !this.freshShow && this.keptTracker && sameGoal(this.keptTracker.checks, goal.all) ? this.keptTracker : null;
    if (kept) (kept as unknown as { lang: Lang }).lang = lang;
    this.tracker = kept ?? new GoalTracker(goal, lang, texts);
    this.keptTracker = null;
    this.trackerGoal = goal;
    if (this.reader && hasDoThis(step.reader) && (goal.holdS ?? 0) > 0) this.reader.ensureHoldRow(rowsFor(goal, lang).find((r) => r.check === -1)?.text ?? "");
    if (this.reader && !hasDoThis(step.reader)) {
      const rows = rowsFor(goal, lang).map((r) => ({
        text: r.check >= 0 ? (texts[r.check] ?? r.text) : r.text,
        check: r.check,
      }));
      this.reader.addDoThis(rows, this.reader.el.querySelector(".cp-key"));
    }
    // the units note for deviation checks
    const note = goal.all
      .map((c) => goalUnitsNote(c, this.course.cockpit, lang))
      .find((x) => !!x);
    if (note && this.reader) {
      const el = h(
        "div",
        { class: "cp-units" },
        icon("info"),
        h("span", {}, note),
      );
      const key = this.reader.el.querySelector(".cp-key");
      if (key) this.reader.el.insertBefore(el, key);
      else this.reader.el.append(el);
    }
    if (st.goalMet) {
      // already met on an earlier visit: show it ticked
      this.reader?.setRows(
        this.tracker
          .state()
          .rows.map((r) => ({ ...r, ticked: true, current: false })),
      );
      this.frame.setGoal({
        text: goalSummary(goal, lang),
        progress: 1,
        met: true,
      });
    } else {
      this.reader?.setRows(this.tracker.state().rows);
      this.frame.setGoal({ text: goalSummary(goal, lang), progress: 0 });
    }
  }
  private view() {
    const host = this.frame.host;
    const hd = host.holdDef;
    return stageView(host.sim, {
      cockpit: this.course.cockpit,
      taps: [...host.tapped],
      hold: hd
        ? { ...hd, legMin: hd.legMin ?? 1, altFt: host.sim.ac.s.altFt }
        : null,
    });
  }
  private onStage(e: StageEvent) {
    const step = this.step;
    if (!step || this.summaryOn) return;
    const st = this.state(step);
    if (e.k === "frame" && this.tracker && this.trackerGoal && !st.goalMet) {
      const g = this.tracker.update(this.view(), e.dt);
      this.rowT += e.dt;
      const sig = g.rows
        .map((r) => `${r.ticked ? 1 : 0}${r.current ? 1 : 0}${r.readout}`)
        .join("|");
      if (sig !== this.lastRows && (this.rowT >= 0.1 || e.dt === 0 || g.met)) {
        const prev = this.lastRows.split("|");
        g.rows.forEach((r, k) => {
          if (r.ticked && prev[k] && prev[k][0] === "0")
            this.announce(ps("rowDone", this.lang, { row: r.text }));
        });
        this.lastRows = sig;
        this.rowT = 0;
        this.reader?.setRows(g.rows);
        st.checks = g.rows.filter((r) => r.check >= 0).map((r) => r.ticked);
        this.frame.host.setReveal(this.revealState(step));
        this.frame.setGoal({
          text: goalSummary(this.trackerGoal, this.lang),
          progress: goalProgress(g),
          met: g.met,
        });
      }
      if (g.met) this.goalMet(step, st, g);
    } else if (e.k === "liveEnded" || e.k === "clipEnded") {
      if (step.kind === "predict" && st.quiz) this.outcomePlayed(step, st);
      if (e.k === "clipEnded" && st.showMe) this.toggleShowMe(false);
    } else if (e.k === "tap") {
      if (this.quiz) this.quiz.tap(e.annotation, e.pane, e.p);
      else if (step.kind === "tap" && e.annotation)
        this.frame.host.highlight(e.annotation);
    }
  }
  private goalMet(step: Step, st: StepState, g: GoalState) {
    st.goalMet = true;
    st.mark.goalMet = true;
    const goal = this.trackerGoal!;
    const graded = goal.graded && !assisted(step.stage);
    this.record(step, {
      kind: "try",
      goalMet: true,
      checks: g.rows.filter((r) => r.check >= 0).map((r) => r.ticked),
      ...(graded ? { practiceGraded: true } : {}),
    });
    const msg = goal.success
      ? L(goal.success, this.lang)
      : ps("goalMet", this.lang);
    this.announce(msg);
    this.toast(msg);
    this.applyReveal();
    this.renderTopTicks();
    this.syncFoot();
    if (goal.onMet === "autoNext")
      window.setTimeout(() => this.step === step && this.next(), 1500);
  }

  // ---------------- drill
  private renderDrill(step: Step, st: StepState) {
    const last = st.mark.drill ?? null;
    this.drill = new DrillView(step.drill!, {
      lang: this.lang,
      best: last,
      announce: (t) => this.announce(t),
      onDone: (run: DrillRun) => {
        const rec = run.record();
        const best = st.mark.drill;
        if (!best || rec.correct > best.correct)
          st.mark.drill = { correct: rec.correct, count: rec.count };
        this.record(
          step,
          { kind: "drill", drill: rec, correct: rec.correct === rec.count },
          true,
        );
        this.renderTopTicks();
      },
    });
    this.scroll.append(h("div", { class: "cp-drillwrap" }, this.drill.el));
    if (step.reader.length) this.renderReader(step, st);
  }

  // ---------------- designed slide
  private renderSlide(step: DesignedStep, st: StepState) {
    const host = (this.o.renderSlide ?? canvasSlideRenderer)({
      course: this.course,
      step,
      lang: this.lang,
      env: this.env(),
      reveal: st.reveal,
      announce: (t) => this.announce(t),
      onAction: (a) => this.blockAction(a),
      calcProblem: (id) => this.calcProblemOf(id),
    });
    this.slide = host;
    this.wideCol.append(h("div", { class: "cp-canvaswrap" }, host.el));
    this.bottom.append(this.foot);
  }
  private blockAction(a: BlockAction) {
    if (a.k === "next") this.next();
    else if (a.k === "goto" && "ref" in a.step) this.goToId(a.step.ref);
    else if (a.k === "open" && "ref" in (a.open.step as object))
      this.goToId((a.open.step as { ref: string }).ref);
    else if (a.k === "url" && /^https?:\/\//.test(a.href))
      window.open(a.href, "_blank", "noopener");
  }

  // ---------------- fly it
  private renderFly(step: Step, st: StepState) {
    const fly = step.flyIt;
    if (!fly) {
      this.wideCol.append(h("p", { class: "cp-muted" }, "—"));
      return;
    }
    st.options ??= [...(fly.defaultsOn ?? [])];
    const linked = this.linkedProblem(step);
    const criteria = fly.criteria.length
      ? fly.criteria
      : (linked?.stage?.goals ?? []).map((check, i) => ({
          id: `calc${i}`,
          label: {
            en: goalSummary({ all: [check], graded: false }, "en"),
            fr: goalSummary({ all: [check], graded: false }, "fr"),
          },
          check,
        }));
    const model: FlyModel = {
      lang: this.lang,
      step,
      fly,
      criteria,
      sceneRows: this.flySceneRows(step, linked),
      still: this.flyStill(step),
      drawThumb: (c) => this.drawFlyThumb(c),
      status: "brief",
      options: st.options,
      author: this.course.author.name,
      workedS: fly.worked ? this.course.clips[fly.worked]?.durS : undefined,
      canFly: !!this.store && (this.bridge() || !!legacyFlyLink(fly.target)),
      message: this.store || this.o.preview ? undefined : ps("flyNoStore", this.lang),
      note: !this.store && this.o.preview
        ? ps("flyPreview", this.lang)
        : !this.store || this.bridge()
        ? undefined
        : ps(legacyFlyLink(fly.target) ? "flyLegacy" : "flyNoBridge", this.lang),
      flyLabel: this.store && !this.bridge() && legacyFlyLink(fly.target) ? ps("flyLegacyGo", this.lang) : undefined,
    };
    this.fly = new FlyItView(model, {
      onFly: (opts) => void this.flyIt(step, opts),
      onOptions: (opts) => (st.options = opts),
      onBriefing: fly.briefing?.length
        ? () => this.startBriefing(step)
        : undefined,
      onSelfGrade: (g) => void this.selfGrade(step, g),
      onWatch: fly.worked ? () => this.watchWorked(step) : undefined,
      onReplay: this.o.onReplay ? () => this.flyAttempt && this.o.onReplay!(this.flyAttempt, step) : undefined,
    });
    this.wideCol.append(this.fly.el);
    this.bottom.append(this.foot);
    void this.loadFlyStatus(step, st);
  }
  private flyStill(step: Step): Promise<string | null> | string | null {
    const sc = this.flyScene(step);
    const id = sc?.captured?.still ?? sc?.captured?.thumb;
    return id ? this.assetUrl(id) : null;
  }
  private flyScene(step: Step): SimScene | null {
    const t = step.flyIt?.target;
    if (t?.kind === "scene") return this.course.scenes[t.scene] ?? null;
    if (t?.kind === "calc") {
      const p = this.linkedProblem(step);
      if (p?.stage)
        return sceneFromFields(p.stage.pose, {
          id: "calc",
          cockpit: this.course.cockpit,
          from: "calc",
          weather: p.stage.weather,
        } as Parameters<typeof sceneFromFields>[1]);
    }
    return null;
  }
  private flySim: Sim | null = null;
  private flyAttempt: AttemptRecord | null = null;
  /** the panel at the start of the flight, drawn by the stage renderers (when the scene has no captured still) */
  private drawFlyThumb(c: HTMLCanvasElement) {
    const sim = this.flySim;
    const sc = this.flyScene(this.step);
    if (!sim || !sc) return;
    const kind = sc.cockpit === "steam" ? "six" : sc.cockpit === "airliner" ? "airlinerPfd" : "pfd";
    renderPane(c, sim, paneFrame({ kind }, sc.cockpit), newInstrumentStates(), 0);
  }
  private flySceneRows(
    step: Step,
    _linked: CalcProblem | null,
  ): { label: string; value: string }[] {
    const lang = this.lang;
    const sc = this.flyScene(step);
    const rows: { label: string; value: string }[] = [];
    if (sc) {
      try {
        const sim = new Sim();
        applyScene(sim, sc);
        this.flySim = sim;
        const sum = sceneSummary(sim, sc, lang);
        const get = (k: string) => sum.find((r) => r.key === k)?.value;
        const pos = [get("position"), get("flight")]
          .filter(Boolean)
          .join(" · ");
        if (pos) rows.push({ label: ps("start", lang), value: pos });
        const rad = get("radios");
        if (rad) rows.push({ label: ps("radios", lang), value: rad });
      } catch {
        /* a scene that does not apply here: no rows */
      }
      const cockpit = {
        g1000: "G1000",
        steam: lang === "fr" ? "Instruments classiques" : "Six-pack",
        airliner: lang === "fr" ? "Avion de ligne" : "Airliner",
      }[sc.cockpit];
      const ap = sc.ap?.engaged
        ? lang === "fr"
          ? "pilote auto engagé"
          : "autopilot on"
        : lang === "fr"
          ? "pilote auto désengagé"
          : "autopilot off";
      rows.push({ label: ps("panel", lang), value: `${cockpit} · ${ap}` });
      const w = sc.weather;
      const wx: string[] = [];
      if (w.ceilingFt !== undefined)
        wx.push(
          w.ceilingFt >= 20000
            ? "CAVOK"
            : `OVC ${Math.round(w.ceilingFt / 100) * 100}`,
        );
      if (w.windKt !== undefined)
        wx.push(
          w.windKt < 1
            ? lang === "fr"
              ? "vent calme"
              : "calm"
            : `${lang === "fr" ? "vent" : "wind"} ${windText(w.windDir ?? 0, w.windKt, w.gustKt)}`,
        );
      if (wx.length)
        rows.push({ label: ps("weather", lang), value: wx.join(" · ") });
    }
    return rows;
  }
  private async loadFlyStatus(step: Step, st: StepState) {
    const store = this.store;
    if (!store || !this.fly) return;
    const view = this.fly;
    try {
      const all = (
        await store.listAttempts({
          courseId: this.course.id,
          profileId: this.profileId,
          stepId: step.id,
          kind: "fly",
        })
      ).sort((a, b) => a.at.localeCompare(b.at));
      const tok = this.o.token;
      let status: FlyModel["status"] = "brief";
      let attempt: AttemptRecord | null = all[all.length - 1] ?? null;
      if (tok) {
        const s = await handoffStatus(store, tok, this.profileId);
        if (
          s.status !== "missing" &&
          ("attempt" in s ? s.attempt.stepId : s.handoff.stepId) === step.id
        ) {
          if (s.status === "flown") attempt = s.attempt;
          else status = s.status === "notFinished" ? "notFinished" : "pending";
        }
      }
      if (attempt && status === "brief") status = "flown";
      if (this.fly !== view) return;
      const token = attempt?.fly?.token;
      const selfGraded = !!token && readFlag(`ifr.course.sg.${token}`);
      if (attempt?.fly) st.mark.flown = { passed: attempt.fly.passed };
      const no = attempt ? all.findIndex((a) => a.fly?.token === token) + 1 || all.length : 0;
      view.update({ status, attempt, attemptNo: no || undefined, selfGraded });
      if (attempt && selfGraded && this.o.loadTrace) {
        const tr = await this.o.loadTrace(attempt, step);
        if (this.fly === view) view.update({ trace: tr });
      }
      this.flyAttempt = attempt;
      this.renderTopTicks();
    } catch {
      /* storage error: the brief stays */
    }
  }
  /** the cockpit of this build flies course steps (?fly=) */
  private bridge(): boolean {
    return this.o.cockpitReady ?? cockpitBridgeReady();
  }
  private async flyIt(step: Step, options: FlyOption[]) {
    const store = this.store;
    if (!store) return;
    if (!this.bridge()) {
      // the cockpit only knows its own deep links: open the lesson / scenario (no result comes back)
      const link = legacyFlyLink(step.flyIt?.target);
      if (link) {
        this.persistNow();
        this.navigate(link);
      }
      return;
    }
    const lang = this.lang;
    let calc:
      | {
          generatorId: CalcProblem["generatorId"];
          seed: number;
          params: CalcProblem["params"];
        }
      | undefined;
    const t = step.flyIt?.target;
    if (t?.kind === "calc") {
      const p = this.linkedProblem(step);
      if (p)
        calc = { generatorId: p.generatorId, seed: p.seed, params: p.params };
    }
    try {
      const hd = await createHandoff(store, {
        course: this.course,
        step,
        options,
        calc,
      });
      this.persistNow();
      this.navigate(flyUrl(hd.token));
    } catch (e) {
      const msg = e instanceof HandoffCreateError ? L(e.text, lang) : String(e);
      this.fly?.update({ message: msg });
    }
  }
  private async selfGrade(step: Step, g: SelfGrade) {
    const store = this.store;
    const view = this.fly;
    if (!store || !view) return;
    const st = this.state(step);
    const list = await store.listAttempts({
      courseId: this.course.id,
      profileId: this.profileId,
      stepId: step.id,
      kind: "fly",
    });
    const a = list.sort((x, y) => x.at.localeCompare(y.at)).pop();
    if (!a?.fly) return;
    const tok = a.fly.token;
    const upd = await recordFlyResult(store, tok, {
      profileId: this.profileId,
      passed: a.fly.passed,
      selfGrade: g,
      criteria: a.fly.criteria,
      secs: a.secs,
      historyId: a.fly.historyId,
      procResults: a.fly.procResults,
      cfiNote: a.cfiNote,
    }).catch(() => null);
    writeFlag(`ifr.course.sg.${tok}`);
    const attempt = upd ?? { ...a, fly: { ...a.fly, selfGrade: g } };
    st.mark.flown = { passed: a.fly.passed };
    if (this.fly !== view) return;
    this.flyAttempt = attempt;
    view.update({ attempt, selfGraded: true });
    this.announce(
      `${ps("yourAttempt", this.lang)}: ${a.fly.passed ? ps("passed", this.lang) : ps("notYet", this.lang)}`,
    );
    if (this.o.loadTrace) {
      const tr = await this.o.loadTrace(attempt, step);
      if (this.fly === view) view.update({ trace: tr });
    }
    this.renderTopTicks();
  }
  private watchWorked(step: Step) {
    const clip = step.flyIt?.worked;
    if (!clip) return;
    // the worked example plays on a stage over the card (split layout for the moment)
    const c = this.course.clips[clip];
    if (!c) return;
    this.body.dataset.layout = "stageWide";
    this.frame.show(
      {
        panes: [
          {
            kind:
              this.course.cockpit === "steam"
                ? "six"
                : this.course.cockpit === "airliner"
                  ? "airlinerPfd"
                  : "pfd",
          },
        ],
        mode: "clip",
        clip,
        scene: c.startScene,
      },
      this.env(),
    );
    this.frame.host.toggleClip();
    this.readerCol.hidden = true;
    const close = btn(ps("close", this.lang), "sm", () => {
      this.readerCol.hidden = false;
      this.show(true);
    });
    this.stageCol.prepend(h("div", { class: "cp-stage-close" }, close));
  }
  private async backFromCockpit(token: string) {
    const store = this.store;
    if (!store) return;
    try {
      const s = await handoffStatus(store, token, this.profileId);
      if (s.status === "missing") return;
      const stepId = s.status === "flown" ? s.attempt.stepId : s.handoff.stepId;
      if (this.step?.id !== stepId) this.goToId(stepId);
      if (s.status === "flown") {
        this.pill = h(
          "span",
          { class: "cp-pill ok" },
          icon("check"),
          ps("backFrom", this.lang, {
            t: flownText(s.attempt.secs, this.lang),
          }),
        );
        this.renderTop();
      }
    } catch {
      /* no pill */
    }
  }

  // ---------------- briefing (a Fly-it's interactive briefing, played in place)
  private startBriefing(step: Step) {
    const steps = step.flyIt?.briefing;
    if (!steps?.length) return;
    this.leaveStep();
    this.ctx = {
      steps: visibleSteps(steps, this.o),
      briefingOf: { step, index: this.i },
    };
    this.i = 0;
    this.show(true);
  }
  private endBriefing(_aborted = false) {
    const b = this.ctx.briefingOf;
    if (!b) return;
    this.leaveStep();
    this.ctx = { steps: visibleSteps(this.course.steps, this.o) };
    this.i = Math.max(
      0,
      this.ctx.steps.findIndex((s) => s.id === b.step.id),
    );
    this.show(true);
  }

  // ---------------- footer
  private syncFoot() {
    const lang = this.lang;
    const step = this.step;
    const f = this.foot;
    f.replaceChildren();
    if (this.summaryOn || !step) return;
    const layout = this.body.dataset.layout;
    const backB = h(
      "button",
      {
        type: "button",
        class: "cp-btn iconbtn quiet cp-navb",
        "aria-label": ps("back", lang),
        "aria-keyshortcuts": "ArrowLeft PageUp",
      },
      icon("back"),
    );
    backB.disabled = this.i === 0 && !this.ctx.briefingOf;
    backB.addEventListener("click", () => this.back());
    if (layout === "fly") {
      const prevB = btn(
        this.i > 0 ? ps("stepN", lang, { n: this.i }) : ps("back", lang),
        "",
        () => this.back(),
        "back",
      );
      prevB.disabled = backB.disabled;
      const handout = this.inHandout(step.id);
      const hb = btn(
        handout ? ps("inHandout", lang) : ps("addHandout", lang),
        "ghost",
        () => {
          this.toggleHandout(step.id);
          this.syncFoot();
        },
        handout ? "check" : undefined,
      );
      hb.setAttribute("aria-pressed", String(handout));
      const nextB = btn(
        this.i + 1 < this.ctx.steps.length
          ? ps("stepN", lang, { n: this.i + 2 })
          : ps("next", lang),
        "",
        () => this.next(),
        "next",
        true,
      );
      f.append(prevB, h("div", { class: "sp" }), hb, nextB);
      return;
    }
    f.append(backB);
    const hint = step.kind === "calc" ? !!this.calc : !!step.hint;
    if (hint) {
      const st = this.state(step);
      const on = step.kind === "calc" ? !!this.calc?.state.hint : !!st.hint;
      const hb = btn(
        on ? ps("hideHint", lang) : ps("hint", lang),
        "quiet",
        () => this.toggleHint(),
      );
      hb.setAttribute("aria-expanded", String(on));
      hb.setAttribute("aria-keyshortcuts", "H");
      f.append(hb);
    }
    const clip = step.showMe ? this.course.clips[step.showMe] : undefined;
    if (clip && step.stage) {
      const on = !!this.state(step).showMe;
      const sb = btn(
        on ? ps("myTurn", lang) : ps("showMe", lang),
        "quiet",
        () => this.toggleShowMe(!on),
        on ? "back" : "play",
      );
      if (!on)
        sb.append(
          h("span", { class: "cp-dur num" }, `· ${fmtClock(clip.durS)}`),
        );
      f.append(sb);
    }
    f.append(h("div", { class: "sp" }));
    const n = this.revealsOf(step);
    const st = this.state(step);
    const more = n - st.reveal;
    const nextB = btn(
      ps("next", lang),
      "primary",
      () => this.next(),
      "next",
      true,
    );
    nextB.setAttribute("aria-keyshortcuts", "ArrowRight PageDown Space");
    nextB.classList.add("cp-navb");
    if (more > 0)
      nextB.append(
        h(
          "span",
          { class: "cp-more num", "aria-label": `${more}` },
          `${st.reveal + 1}/${n + 1}`,
        ),
      );
    f.append(nextB);
    if (layout === "canvas") this.bottom.append(f);
    else if (f.parentElement !== this.readerCol) this.readerCol.append(f);
  }
  private toggleHint() {
    const step = this.step;
    const st = this.state(step);
    if (step.kind === "calc" && this.calc) {
      this.calc.toggleHint();
    } else if (this.hintEl) {
      st.hint = !st.hint;
      this.hintEl.hidden = !st.hint;
      if (st.hint) this.hintEl.scrollIntoView({ block: "nearest" });
    }
    this.syncFoot();
  }
  private toggleShowMe(on: boolean) {
    const step = this.step;
    const st = this.state(step);
    const cue = step.stage;
    if (!cue || !step.showMe) return;
    st.showMe = on;
    if (on) {
      this.frame.show({ ...cue, mode: "clip", clip: step.showMe }, this.env(), {
        reveal: this.revealState(step),
      });
      this.frame.host.toggleClip();
    } else
      this.frame.show(cue, this.env(), {
        reveal: this.revealState(step),
        reset: true,
      });
    this.syncFoot();
  }
  private renderTopTicks() {
    const old = this.top.querySelector(".cp-ticks");
    if (old)
      old.replaceWith(
        ticksEl(
          this.ctx.steps,
          this.marks(),
          this.summaryOn ? this.ctx.steps.length : this.i,
          this.lang,
        ),
      );
  }

  // ---------------- summary + handout
  private showSummary() {
    const lang = this.lang;
    this.clearWidgets();
    this.summaryOn = true;
    this.frame.show(null, this.env());
    this.body.dataset.layout = "readerOnly";
    this.body.dataset.kind = "summary";
    this.el.dataset.layout = "readerOnly";
    this.scroll.replaceChildren();
    this.wideCol.replaceChildren();
    this.bottom.replaceChildren();
    this.foot.replaceChildren();
    if (this.foot.parentElement !== this.readerCol)
      this.readerCol.append(this.foot);
    const steps = this.ctx.steps;
    const marks = this.marks();
    const acting = steps.filter((s) => s.goal && s.kind === "try");
    const met = acting.filter((s) => marks[s.id]?.goalMet).length;
    const asked = steps.filter((s) => stepQuiz(s) || s.kind === "calc");
    const right = asked.filter(
      (s) => marks[s.id]?.correct || marks[s.id]?.calcOk,
    ).length;
    const flights = steps.filter((s) => s.kind === "fly");
    const flown = flights.filter((s) => marks[s.id]?.flown).length;
    const skipped = steps.filter(
      (s) =>
        marks[s.id]?.skipped && !marks[s.id]?.answered && !marks[s.id]?.goalMet,
    ).length;
    const tile = (label: string, v: string) =>
      h(
        "div",
        { class: "cp-tile" },
        h("b", { class: "num" }, v),
        h("span", {}, label),
      );
    const list = h("ol", { class: "cp-sum-list" });
    steps.forEach((s, i) => {
      const m = marks[s.id];
      const b = h(
        "button",
        { type: "button", class: "cp-ol-row" },
        h("span", { class: "n num" }, String(i + 1)),
        h(
          "span",
          { class: "mid" },
          textEl("span", s.title, lang, "t"),
          h("span", { class: "meta" }, kindChip(s.kind, lang)),
        ),
        h(
          "span",
          { class: "st" },
          m?.goalMet || m?.correct || m?.calcOk || m?.flown?.passed
            ? icon("check", "i ok")
            : null,
          h("span", {}, markText(s, m, lang)),
        ),
      );
      b.addEventListener("click", () => this.goTo(i));
      list.append(h("li", {}, b));
    });
    this.scroll.append(
      h(
        "div",
        { class: "cp-summary" },
        h(
          "div",
          { class: "cp-meta" },
          h(
            "span",
            { class: "cp-kind k-try" },
            h("span", { class: "dot" }),
            ps("courseDone", lang),
          ),
        ),
        textEl("h1", this.course.title, lang, "cp-h1"),
        h("p", { class: "cp-lead" }, ps("courseDoneSub", lang)),
        h(
          "div",
          { class: "cp-tiles" },
          // a tile only for what the course has (no "0 / 0" for a course without goals or flights)
          acting.length ? tile(ps("goalsMet", lang), `${met} / ${acting.length}`) : null,
          asked.length ? tile(ps("answeredRight", lang), `${right} / ${asked.length}`) : null,
          flights.length ? tile(ps("flights", lang), `${flown} / ${flights.length}`) : null,
          tile(ps("skippedSteps", lang), String(skipped)),
        ),
        h(
          "div",
          { class: "cp-qact" },
          btn(
            ps("printHandout", lang),
            "primary",
            () => this.printHandout(),
            "print",
          ),
          btn(ps("startOver", lang), "", () => this.startOver(), "refresh"),
          this.o.onExit
            ? btn(ps("backToLibrary", lang), "ghost", () => this.o.onExit!())
            : null,
        ),
        list,
      ),
    );
    this.renderTop();
    this.announce(ps("courseDone", lang));
  }
  private startOver() {
    this.states.clear();
    this.goTo(0);
  }
  private handoutKey = () => `ifr.course.handout.${this.course.id}`;
  private inHandout(id: string): boolean {
    try {
      return (
        JSON.parse(localStorage.getItem(this.handoutKey()) ?? "[]") as string[]
      ).includes(id);
    } catch {
      return false;
    }
  }
  private toggleHandout(id: string) {
    try {
      const list = JSON.parse(
        localStorage.getItem(this.handoutKey()) ?? "[]",
      ) as string[];
      const next = list.includes(id)
        ? list.filter((x) => x !== id)
        : [...list, id];
      localStorage.setItem(this.handoutKey(), JSON.stringify(next));
    } catch {
      /* storage blocked */
    }
  }
  /** The printable handout: takeaways and keys of the visited steps, my answers, my results. */
  private printHandout() {
    const lang = this.lang;
    const sheet = h(
      "div",
      { class: "cp-print" },
      h("h1", {}, L(this.course.title, lang)),
      h(
        "p",
        {},
        [
          ps("handoutTitle", lang),
          this.course.author.club,
          this.course.author.name,
        ]
          .filter(Boolean)
          .join(" · "),
      ),
    );
    for (const s of this.ctx.steps) {
      const st = this.states.get(s.id);
      if (!st?.mark.visited && !this.inHandout(s.id)) continue;
      const take = takeawaysOf(s);
      const lines: HTMLElement[] = take.map((t) => h("li", {}, L(t, lang)));
      if (st?.quiz && typeof st.quiz.answer !== "string")
        lines.push(
          h(
            "li",
            { class: "ans" },
            ps("myAnswer", lang, {
              a: Array.isArray(st.quiz.answer)
                ? st.quiz.answer.map((x) => x + 1).join(", ")
                : String(st.quiz.answer),
            }),
            " · ",
            st.quiz.correct ? ps("correct", lang) : ps("notQuite", lang),
          ),
        );
      if (s.calc && st?.calc?.response) {
        try {
          const p = problemFor(s.calc, st.calc.seed);
          lines.push(
            h(
              "li",
              { class: "ans" },
              ps("myAnswer", lang, {
                a: responseText(p, st.calc.response, lang),
              }),
              " · ",
              st.calc.verdict?.ok ? ps("correct", lang) : ps("notQuite", lang),
            ),
          );
        } catch {
          /* skip */
        }
      }
      if (st?.mark.goalMet)
        lines.push(h("li", { class: "ans" }, ps("goalMet", lang)));
      if (st?.mark.flown)
        lines.push(
          h(
            "li",
            { class: "ans" },
            st.mark.flown.passed ? ps("passed", lang) : ps("notYet", lang),
          ),
        );
      if (st?.mark.drill)
        lines.push(
          h(
            "li",
            { class: "ans" },
            ps("scoreLine", lang, {
              c: st.mark.drill.correct,
              n: st.mark.drill.count,
            }),
          ),
        );
      if (!lines.length) continue;
      sheet.append(h("h2", {}, L(s.title, lang)), h("ul", {}, ...lines));
    }
    document.body.append(sheet);
    document.body.classList.add("cp-printing");
    const done = () => {
      sheet.remove();
      document.body.classList.remove("cp-printing");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    window.setTimeout(done, 60_000);
  }

  // ---------------- records + progress
  private record(
    step: Step,
    a: Partial<AttemptRecord> & { kind: AttemptRecord["kind"] },
    always = false,
  ) {
    const st = this.state(step);
    st.recorded ??= new Set();
    if (!always && st.recorded.has(a.kind)) return;
    st.recorded.add(a.kind);
    const store = this.store;
    if (!store || step.id === undefined) return;
    const now = this.o.now?.() ?? new Date();
    const rec: AttemptRecord = {
      courseId: this.course.id,
      rev: this.course.rev,
      stepId: step.id,
      profileId: this.profileId,
      at: now.toISOString(),
      secs: elapsedS(this.enteredAt, Date.now()),
      ...a,
    };
    void recordAttempt(store, rec).catch(() => {
      /* quota / blocked: the session still works */
    });
  }
  private persistSoon() {
    window.clearTimeout(this.saveT);
    this.saveT = window.setTimeout(() => this.persistNow(), 400);
  }
  private persistNow() {
    const store = this.store;
    const step = this.ctx.briefingOf?.step ?? this.step;
    if (!store || !step) return;
    void store
      .setProgress({
        courseId: this.course.id,
        rev: this.course.rev,
        profileId: this.profileId,
        stepId: step.id,
        reveal: this.ctx.briefingOf ? 0 : this.state(step).reveal,
      })
      .catch(() => {});
  }
  private async resume() {
    const store = this.store;
    if (!store) return;
    try {
      const p = await store.getProgress(this.course.id, this.profileId);
      if (!p || this.destroyed) return;
      const i = this.ctx.steps.findIndex((s) => s.id === p.stepId);
      if (i <= 0 || this.i !== 0) return;
      this.state(this.ctx.steps[i]).reveal = Math.min(
        p.reveal,
        this.revealsOf(this.ctx.steps[i]),
      );
      this.goTo(i);
      this.toast(ps("resumed", this.lang, { n: i + 1 }), {
        label: ps("startOver", this.lang),
        run: () => this.startOver(),
      });
    } catch {
      /* first visit */
    }
  }
  private navigate(url: string) {
    if (this.o.navigate) this.o.navigate(url);
    else location.assign(url);
  }

  // ---------------- keyboard
  private onKey = (e: KeyboardEvent) => {
    if (this.destroyed || !this.el.isConnected || this.outline?.isOpen) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    const tag = t?.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      t?.isContentEditable
    )
      return;
    const layout = this.body.dataset.layout;
    if (
      (layout === "split" || layout === "stageWide") &&
      this.step?.stage?.controls?.length &&
      this.frame.handleKey(e, true)
    ) {
      e.preventDefault();
      return;
    }
    const onButton = tag === "BUTTON" || tag === "SUMMARY" || tag === "A";
    switch (e.key) {
      case "ArrowRight":
      case "PageDown":
        e.preventDefault();
        this.next();
        break;
      case " ":
        if (onButton) return;
        e.preventDefault();
        this.next();
        break;
      case "ArrowLeft":
      case "PageUp":
        e.preventDefault();
        this.back();
        break;
      case "o":
      case "O":
        e.preventDefault();
        this.openOutline();
        break;
      case "h":
      case "H":
        if (this.step?.hint || this.step?.kind === "calc") {
          e.preventDefault();
          this.toggleHint();
        }
        break;
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    if (this.destroyed) return;
    this.frame.handleKey(e, false);
  };
}

// ------------------------------------------------------------------ small utils
const sameGoal = (a: readonly unknown[], b: readonly unknown[]): boolean => JSON.stringify(a) === JSON.stringify(b);
function hashStr(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++)
    x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return x >>> 0;
}
function fmtClock(s: number): string {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
function readFlag(k: string): boolean {
  try {
    return localStorage.getItem(k) !== null;
  } catch {
    return false;
  }
}
function writeFlag(k: string) {
  try {
    localStorage.setItem(k, "1");
  } catch {
    /* storage blocked */
  }
}
/** Mount a player into `root` (the academy host's #play= route). */
export function playCourse(root: HTMLElement, o: PlayerOptions): CoursePlayer {
  const p = new CoursePlayer(o);
  p.mount(root);
  return p;
}
