// Ground school stage — StageHost: one stage Sim per page (or per scene on a designed slide), at most two pane
// canvases plus their overlays, the plan inset, the controls and the assist. It applies a step's StageCue
// (scene, panes, annotations, controls, assist, mode) and runs the stage:
//   frozen — draws once, then only on input or resize (0 ms per frame);
//   live   — a rAF loop that steps the Sim (with the assist), only while the page is visible and on screen;
//   clip   — a ClipPlayer drives the Sim (Watch steps), Take over hands it to the student;
//   fly    — the scene still (the player shows the Fly-it card).
// All hosts on a page share ONE requestAnimationFrame loop (StageLoop) that sleeps when nobody needs frames.
import { Sim } from "../../sim/sim";
import type { Failures } from "../../sim/sim";
import { applyScene, applyStagePose, rederive, sceneFromFields, stagePoseOf, type SceneDiff } from "../scene";
import { ClipPlayer } from "../clip";
import { bearingDeg, norm360, DEG, type LatLon } from "../../nav/geo";
import type { Annotation, CalcStageHint, Clip, Cockpit, Lang, PaneView, PresenterAction, SimScene, StageControl, StageCue, StagePose } from "../types";
import type { Avionics } from "../../sim/sim";
import {
  containBox,
  frameAspect,
  paneFrame,
  type PaneFrame,
  type RevealState,
} from "./geometry";
import {
  newInstrumentStates,
  paneAriaLabel,
  renderPane,
  type InstrumentStates,
} from "./views";
import { Overlay } from "./overlay";
import { diagramPane, type DiagramPane } from "./diagrams";
import { PlanInset, planHold, planModel, type PlanHold } from "./planInset";
import { StageAssist } from "./assist";
import { t } from "./strings";


// ------------------------------------------------------------------ the shared loop
export interface Scheduler {
  raf(cb: (t: number) => void): number;
  caf(id: number): void;
  now(): number;
  /** document.visibilityState === 'visible' */
  visible(): boolean;
}
export const browserScheduler: Scheduler = {
  raf: (cb) =>
    typeof requestAnimationFrame !== "undefined"
      ? requestAnimationFrame(cb)
      : (setTimeout(() => cb(Date.now()), 16) as unknown as number),
  caf: (id) =>
    typeof cancelAnimationFrame !== "undefined"
      ? cancelAnimationFrame(id)
      : clearTimeout(id),
  now: () =>
    typeof performance !== "undefined" ? performance.now() : Date.now(),
  visible: () =>
    typeof document === "undefined" || document.visibilityState !== "hidden",
};
export interface LoopClient {
  /** wants a frame now (live / clip and on screen, or a frozen pane that changed) */
  wantsFrame(): boolean;
  frame(dt: number): void;
}
/** One rAF for every stage on the page; it stops when no client wants a frame or the page is hidden. */
export class StageLoop {
  private clients = new Set<LoopClient>();
  private id: number | null = null;
  private last: number | null = null;
  /** frames run (tests) */
  frames = 0;
  constructor(private sch: Scheduler = browserScheduler) {
    if (typeof document !== "undefined" && sch === browserScheduler)
      document.addEventListener("visibilitychange", () => this.request());
  }
  add(c: LoopClient) {
    this.clients.add(c);
    this.request();
  }
  remove(c: LoopClient) {
    this.clients.delete(c);
  }
  get running(): boolean {
    return this.id !== null;
  }
  /** Ask for a frame (a host changed state). */
  request() {
    if (this.id !== null || !this.sch.visible()) return;
    if (![...this.clients].some((c) => c.wantsFrame())) {
      this.last = null;
      return;
    }
    this.id = this.sch.raf((t) => this.tick(t));
  }
  private tick(t: number) {
    this.id = null;
    if (!this.sch.visible()) {
      this.last = null;
      return;
    }
    // a long gap (tab switch, breakpoint) never becomes one huge step
    const dt =
      this.last === null
        ? 1 / 60
        : Math.min(0.1, Math.max(0, (t - this.last) / 1000));
    this.last = t;
    this.frames++;
    for (const c of [...this.clients]) if (c.wantsFrame()) c.frame(dt);
    this.request();
  }
}
let pageLoop: StageLoop | null = null;
export const stageLoop = (): StageLoop => (pageLoop ??= new StageLoop());

// ------------------------------------------------------------------ pane layout (pure)
export interface PaneBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** Place one or two panes of the given aspects (w / h) in W × H: side by side or stacked, whichever is larger. */
export function layoutPanes(
  W: number,
  H: number,
  aspects: readonly number[],
  gap = 14,
): PaneBox[] {
  if (!(W > 0 && H > 0) || aspects.length === 0)
    return aspects.map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  if (aspects.length === 1) return [containBox(W, H, aspects[0])];
  const [a1, a2] = aspects;
  // side by side: both the same height
  const hRow = Math.min(H, (W - gap) / (a1 + a2));
  const areaRow = hRow * hRow * (a1 + a2);
  // stacked: both the same width
  const wCol = Math.min(W, (H - gap) / (1 / a1 + 1 / a2));
  const areaCol = wCol * wCol * (1 / a1 + 1 / a2);
  if (areaRow >= areaCol) {
    const tw = hRow * (a1 + a2) + gap;
    const x0 = (W - tw) / 2;
    const y0 = (H - hRow) / 2;
    return [
      { x: x0, y: y0, w: hRow * a1, h: hRow },
      { x: x0 + hRow * a1 + gap, y: y0, w: hRow * a2, h: hRow },
    ];
  }
  const th = wCol / a1 + wCol / a2 + gap;
  const x0 = (W - wCol) / 2;
  const y0 = (H - th) / 2;
  return [
    { x: x0, y: y0, w: wCol, h: wCol / a1 },
    { x: x0, y: y0 + wCol / a1 + gap, w: wCol, h: wCol / a2 },
  ];
}

// ------------------------------------------------------------------ one pane
export interface StagePaneOptions {
  lang: Lang;
  theme: "dark" | "light";
  assetUrl?: (id: string) => Promise<string | null> | string | null;
  /** a calc diagram pane is draggable */
  interactive?: boolean;
  onDiagramChange?: (spec: unknown) => void;
  onTap?: (hit: Annotation | null, p: [number, number]) => void;
  label?: string;
}
/** A pane: an instrument canvas (or a diagram / image) with its overlay, kept at its drawing's aspect ratio. */
export class StagePane {
  readonly el: HTMLDivElement;
  readonly frame: PaneFrame;
  readonly overlay: Overlay;
  readonly states: InstrumentStates;
  readonly key: string;
  private canvas: HTMLCanvasElement | null = null;
  private diagram: DiagramPane | null = null;
  private lastAria = "";
  constructor(view: PaneView, index: 0 | 1, o: StagePaneOptions) {
    this.frame = paneFrame(view);
    this.key = JSON.stringify(view);
    this.states = newInstrumentStates();
    this.el = document.createElement("div");
    this.el.className = `cs-pane k-${this.frame.kind}`;
    this.el.setAttribute("role", "img");
    this.overlay = new Overlay(index, { lang: o.lang, onTap: o.onTap });
    this.overlay.setRect(this.frame.rect);
    const f = this.frame;
    if (f.kind === "display" || f.kind === "gauge") {
      this.canvas = document.createElement("canvas");
      this.canvas.className = "cs-canvas";
      this.el.append(this.canvas);
    } else if (f.kind === "diagram") {
      this.diagram = diagramPane(f.d, f.asset, {
        theme: o.theme,
        lang: o.lang,
        interactive: o.interactive,
        onChange: o.onDiagramChange,
        assetUrl: o.assetUrl,
        label: o.label,
      });
      this.el.append(this.diagram.el);
      if (o.label) this.el.setAttribute("aria-label", o.label);
    } else {
      const img = document.createElement("img");
      img.className = "cs-img";
      img.alt = o.label ?? "";
      img.draggable = false;
      Promise.resolve(o.assetUrl?.(f.asset) ?? null).then((u) => {
        if (u) img.src = u;
      });
      this.el.append(img);
    }
    this.el.append(this.overlay.el);
  }
  get aspect(): number {
    return frameAspect(this.frame);
  }
  get isInstrument(): boolean {
    return !!this.canvas;
  }
  get diagramPane(): DiagramPane | null {
    return this.diagram;
  }
  place(b: PaneBox) {
    const s = this.el.style;
    s.left = `${b.x.toFixed(1)}px`;
    s.top = `${b.y.toFixed(1)}px`;
    s.width = `${b.w.toFixed(1)}px`;
    s.height = `${b.h.toFixed(1)}px`;
  }
  draw(
    sim: Sim,
    dt: number,
    covers: readonly ("ai" | "dg")[] | undefined,
    lang: Lang,
    aria: boolean,
  ) {
    if (!this.canvas) return;
    renderPane(this.canvas, sim, this.frame, this.states, dt, { covers, lang });
    if (aria) {
      const a = paneAriaLabel(this.frame, sim, lang);
      if (a !== this.lastAria) {
        this.lastAria = a;
        this.el.setAttribute("aria-label", a);
      }
    }
  }
  setTheme(theme: "dark" | "light") {
    this.diagram?.setTheme(theme);
  }
  destroy() {
    this.diagram?.destroy();
    this.el.remove();
  }
}

// ------------------------------------------------------------------ the host
export type StageMode = "frozen" | "live" | "clip" | "fly";
export interface StageEnv {
  scenes: Record<string, SimScene>;
  clips?: Record<string, Clip>;
  cockpit?: Cockpit;
  /** asset id → object URL (store.ts) */
  assetUrl?: (id: string) => Promise<string | null> | string | null;
}
export interface StageCueOptions {
  /** reveal state for the annotations' `when` */
  reveal?: RevealState;
  /** a scene object instead of cue.scene (calc stage hints, a YourTurn result pose) */
  scene?: SimScene;
  /** force a re-apply even with carry 'continue' */
  reset?: boolean;
  /** accessible names for diagram / image panes (block alt) */
  labels?: [string?, string?];
}
export type StageEvent =
  | { k: "frame"; dt: number }
  | { k: "mode"; mode: StageMode }
  | { k: "scene"; diffs: SceneDiff[]; scene: SimScene | null }
  | { k: "liveEnded" }
  | {
      k: "clipCue";
      index: number;
      text?: string;
      handover?: boolean;
      annotation?: string;
    }
  | { k: "clipEnded" }
  | { k: "drag"; pos: LatLon; phase: "move" | "end" }
  | { k: "control"; id: StageControl }
  | { k: "tap"; annotation: string | null; p: [number, number]; pane: 0 | 1 }
  | { k: "diagram"; pane: 0 | 1; spec: unknown }
  | { k: "action"; action: PresenterAction }
  | { k: "error"; message: string };

export interface StageHostOptions {
  lang?: Lang;
  /** diagram theme ('dark' on the cockpit and projector themes, 'light' on classroom) */
  theme?: "dark" | "light";
  /** share a Sim (slide blocks naming the same scene); default: a new Sim */
  sim?: Sim;
  loop?: StageLoop;
  /** observe on-screen visibility (IntersectionObserver); default true */
  observe?: boolean;
}

export class StageHost implements LoopClient {
  readonly el: HTMLDivElement;
  readonly assist = new StageAssist();
  private _sim: Sim | null;
  private loop: StageLoop;
  private panes: StagePane[] = [];
  private panesEl: HTMLDivElement;
  private msg: HTMLDivElement;
  private cue: StageCue | null = null;
  private env: StageEnv = { scenes: {} };
  private scene: SimScene | null = null;
  private sceneKey = "";
  private _mode: StageMode = "frozen";
  private dirty = true;
  private onScreen = true;
  private ro: ResizeObserver | null = null;
  private io: IntersectionObserver | null = null;
  private listeners = new Set<(e: StageEvent) => void>();
  private liveLeft: number | null = null;
  private clip: ClipPlayer | null = null;
  private lang: Lang;
  private theme: "dark" | "light";
  private reveal: RevealState = { reveal: 0 };
  private ariaT = 0;
  private trail: LatLon[] = [];
  private trailT = 0;
  private planT = 0;
  private plan: PlanInset | null = null;
  private hold: PlanHold | null = null;
  private destroyed = false;
  private taps: string[] = [];

  constructor(o: StageHostOptions = {}) {
    this.lang = o.lang ?? "en";
    this.theme = o.theme ?? "dark";
    this._sim = o.sim ?? null;
    this.loop = o.loop ?? stageLoop();
    this.el = document.createElement("div");
    this.el.className = "cs-host";
    this.panesEl = document.createElement("div");
    this.panesEl.className = "cs-panes";
    this.msg = document.createElement("div");
    this.msg.className = "cs-msg";
    this.msg.hidden = true;
    this.el.append(this.panesEl, this.msg);
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => {
        this.layout();
        this.invalidate();
      });
      this.ro.observe(this.panesEl);
    }
    if (o.observe !== false && typeof IntersectionObserver !== "undefined") {
      this.io = new IntersectionObserver((es) => {
        for (const e of es) this.onScreen = e.isIntersecting;
        if (this.onScreen) this.loop.request();
      });
      this.io.observe(this.el);
    }
    this.loop.add(this);
  }

  /** The stage Sim (created on first use: building one costs a few ms). */
  get sim(): Sim {
    return (this._sim ??= new Sim());
  }
  get mode(): StageMode {
    return this._mode;
  }
  get currentCue(): StageCue | null {
    return this.cue;
  }
  get currentScene(): SimScene | null {
    return this.scene;
  }
  get paneList(): readonly StagePane[] {
    return this.panes;
  }
  get clipPlayer(): ClipPlayer | null {
    return this.clip;
  }
  /** annotation ids the student tapped (tap goals / quizzes read them through stageView extras) */
  get tapped(): readonly string[] {
    return this.taps;
  }
  /** the hold the plan inset and the goals evaluate (from a holdDiagram pane) */
  get holdDef(): PlanHold | null {
    return this.hold;
  }
  on(fn: (e: StageEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit(e: StageEvent) {
    for (const f of [...this.listeners]) f(e);
  }
  /** Attach the plan inset this host feeds (StageFrame owns its place in the layout). */
  attachPlan(p: PlanInset | null) {
    this.plan = p;
    this.updatePlan(true);
  }
  setLang(l: Lang) {
    this.lang = l;
    for (const p of this.panes) p.overlay.setLang(l);
    this.plan?.setLang(l);
    this.invalidate();
  }
  setTheme(th: "dark" | "light") {
    this.theme = th;
    for (const p of this.panes) p.setTheme(th);
  }

  /** Show a step's stage. Returns the scene's verify differences (empty: the instruments show what was captured). */
  setCue(
    cue: StageCue | null,
    env: StageEnv,
    o: StageCueOptions = {},
  ): SceneDiff[] {
    this.stopClip();
    this.env = env;
    this.cue = cue;
    this.taps = [];
    this.msg.hidden = true;
    if (o.reveal) this.reveal = o.reveal;
    let diffs: SceneDiff[] = [];
    if (!cue) {
      this.clearPanes();
      this.setMode("frozen");
      return diffs;
    }
    // scene
    const scene =
      o.scene ?? (cue.scene ? env.scenes[cue.scene] : undefined) ?? null;
    const key = scene
      ? o.scene
        ? JSON.stringify(scene)
        : `id:${scene.id}`
      : "";
    const carry = cue.carry === "continue" && key === this.sceneKey && !o.reset;
    if (cue.scene && !scene && !o.scene)
      this.showMessage(t("sceneMissing", this.lang));
    if (scene && !carry) diffs = this.applySceneSafe(scene);
    this.scene = scene;
    this.sceneKey = key;
    if (!carry) this.applyFailures(cue.failuresOnEnter);
    // panes (kept when unchanged: no canvas churn between steps on the same instrument)
    this.buildPanes(cue.panes, o.labels);
    // hold for the plan inset and the goals: from a hold diagram pane
    const hp = cue.panes.find(
      (p): p is Extract<PaneView, { kind: "diagram" }> =>
        p.kind === "diagram" && p.d.kind === "hold",
    );
    this.hold =
      hp && hp.d.kind === "hold"
        ? planHold(hp.d.fix, hp.d.inbound, hp.d.turn)
        : null;
    this.setAnnotations(cue.annotations);
    // assist + lateral helper (live steps)
    const ctl = cue.controls ?? [];
    this.assist.configure(
      this.sim,
      cue.assist,
      ctl.includes("bank") || ctl.includes("hdgBug") || !!cue.assist?.holdAlt,
    );
    this.trail = [];
    this.liveLeft = null;
    this.emit({ k: "scene", diffs, scene });
    // mode
    if (cue.mode === "clip") this.startClip(cue.clip);
    else
      this.setMode(
        cue.mode === "live" ? "live" : cue.mode === "fly" ? "fly" : "frozen",
      );
    this.updatePlan(true);
    this.invalidate();
    return diffs;
  }

  /** A calc step's stage hint: the instrument posed from the problem's numbers. */
  setHint(
    hint: CalcStageHint,
    env: StageEnv,
    o: StageCueOptions = {},
  ): SceneDiff[] {
    const scene = sceneFromFields(hint.pose, {
      id: "calc-hint",
      cockpit: env.cockpit,
      from: "calc",
      weather: hint.weather,
    } as Parameters<typeof sceneFromFields>[1]);
    const cue: StageCue = {
      panes: hint.panes,
      mode: hint.mode ?? "frozen",
      controls: hint.controls,
      assist: hint.assist,
      annotations: hint.annotations,
    };
    return this.setCue(cue, env, { ...o, scene });
  }

  setReveal(r: RevealState) {
    this.reveal = r;
    for (const p of this.panes) p.overlay.setReveal(r);
    this.emit({ k: "frame", dt: 0 });
  }
  setAnnotations(list: readonly Annotation[] | undefined) {
    for (const p of this.panes) p.overlay.set(list, this.reveal);
  }
  /** Linked-term highlight (a [[label|id]] in the reader). */
  highlight(id: string | null) {
    for (const p of this.panes) p.overlay.highlight(id);
  }
  /** Tap mode on the panes (Tap steps, tap quizzes). */
  setTappable(on: boolean) {
    for (const p of this.panes) p.overlay.setTappable(on);
  }

  // ---------------- modes
  freeze() {
    if (this._mode === "clip") this.clip?.pause();
    this.liveLeft = null;
    this.setMode("frozen");
  }
  live() {
    if (this._mode === "clip" && this.clip && !this.clip.live) {
      this.takeOver();
      return;
    }
    this.sim.paused = false;
    this.assist.capture(this.sim);
    this.setMode("live");
  }
  toggleFreeze() {
    if (this._mode === "live") this.freeze();
    else this.live();
  }
  /** Predict: run N seconds, then freeze (emits liveEnded). */
  flyFor(s: number) {
    this.live();
    this.liveLeft = Math.max(0, s);
  }
  /** Re-apply the step's scene (Reset). */
  reset() {
    if (!this.cue) return;
    const mode = this.cue.mode;
    this.setCue(this.cue, this.env, {
      reset: true,
      scene: this.sceneKey.startsWith("id:")
        ? undefined
        : (this.scene ?? undefined),
    });
    if (mode === "live") this.setMode("live");
  }
  /** Presenter live-scene actions (SPEC §4.3). */
  action(a: PresenterAction) {
    const sim = this.sim;
    switch (a.k) {
      case "freeze":
        this.freeze();
        break;
      case "flyFor":
        this.flyFor(a.s);
        break;
      case "failure":
        sim.setFailure(a.key, !sim.failures[a.key]);
        this.invalidate();
        break;
      case "wind":
        sim.weather.windKt = Math.max(
          0,
          Math.min(60, sim.weather.windKt + a.dKt),
        );
        this.invalidate();
        break;
      case "reset":
        this.reset();
        break;
      case "showPlate":
        break;
    }
    this.emit({ k: "action", action: a });
  }
  /** Watch: play / pause the clip. */
  toggleClip() {
    if (!this.clip) return;
    this.clip.toggle();
    this.loop.request();
  }
  seekClip(t: number) {
    this.clip?.seek(t);
    this.invalidate();
  }
  /** Take over from the clip at its current time (the student gets the step's controls). */
  takeOver() {
    if (!this.clip) return;
    this.clip.takeOver();
    this.assist.capture(this.sim);
    this.setMode("live");
  }
  /** Mirror a presenter's pose (projector): never simulates alone. */
  applyPose(p: StagePose, av?: Partial<Avionics>) {
    applyStagePose(this.sim, p, av);
    this.invalidate();
  }
  pose(): StagePose {
    return stagePoseOf(this.sim);
  }

  /** dragAircraft: put the aircraft at `p`; with a hold or a station it points at the fix (course to fix). */
  dragAircraftTo(p: LatLon, phase: "move" | "end" = "end") {
    const sim = this.sim;
    const s = sim.ac.s;
    s.lat = p.lat;
    s.lon = p.lon;
    const target = this.hold?.fix ?? null;
    if (target) s.psi = norm360(bearingDeg(p, target)) * DEG;
    rederive(sim);
    sim.updateAvionics(0);
    this.assist.capture(sim);
    this.trail = [];
    this.emit({ k: "drag", pos: p, phase });
    this.invalidate();
  }

  /** Something on the stage changed (a control, a drag): redraw (frozen panes draw on change only). */
  invalidate() {
    this.dirty = true;
    this.loop.request();
  }
  /** a control moved (StageControls → host) */
  controlChanged(id: StageControl) {
    this.emit({ k: "control", id });
    this.invalidate();
  }

  // ---------------- LoopClient
  wantsFrame(): boolean {
    if (this.destroyed || !this.onScreen) return false;
    return (
      this.dirty ||
      this._mode === "live" ||
      (this._mode === "clip" && !!this.clip?.playing)
    );
  }
  frame(dt: number) {
    const sim = this.sim;
    const running =
      this._mode === "live" || (this._mode === "clip" && !!this.clip?.playing);
    let stepDt = 0;
    if (this._mode === "live") {
      const n = this.assist.timeScale;
      for (let i = 0; i < n; i++) {
        this.assist.apply(sim, dt);
        sim.step(dt);
      }
      stepDt = dt;
      if (this.liveLeft !== null) {
        this.liveLeft -= dt * n;
        if (this.liveLeft <= 0) {
          this.liveLeft = null;
          this.setMode("frozen");
          this.emit({ k: "liveEnded" });
        }
      }
    } else if (this._mode === "clip" && this.clip) {
      if (this.clip.playing) {
        this.clip.tick(dt);
        stepDt = dt;
      }
      sim.step(dt); // a paused (replaying) Sim only refreshes its avionics
    }
    this.dirty = false;
    // aria labels at 1 Hz while running, at once when frozen
    this.ariaT += dt;
    const aria = !running || this.ariaT >= 1;
    if (aria) this.ariaT = 0;
    const covers = this.cue?.covers;
    for (const p of this.panes) p.draw(sim, stepDt, covers, this.lang, aria);
    // plan inset: 10 Hz while running; the trail at 1 Hz (120 points)
    if (running) {
      this.trailT += dt;
      if (this.trailT >= 1) {
        this.trailT = 0;
        this.trail.push({ lat: sim.ac.s.lat, lon: sim.ac.s.lon });
        if (this.trail.length > 120) this.trail.shift();
      }
      this.planT += dt;
      if (this.planT >= 0.1) {
        this.planT = 0;
        this.updatePlan(false);
      }
    } else this.updatePlan(false);
    this.emit({ k: "frame", dt: stepDt });
  }

  // ---------------- internals
  private setMode(m: StageMode) {
    const changed = m !== this._mode;
    this._mode = m;
    if (m === "live") this.sim.paused = false;
    this.el.dataset.mode = m;
    if (changed) this.emit({ k: "mode", mode: m });
    this.invalidate();
  }
  private applySceneSafe(scene: SimScene): SceneDiff[] {
    try {
      return applyScene(this.sim, scene);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      this.showMessage(`${t("sceneError", this.lang)}: ${m}`);
      this.emit({ k: "error", message: m });
      return [];
    }
  }
  private applyFailures(f: Partial<Failures> | undefined) {
    for (const [k, on] of Object.entries(f ?? {}))
      if (on && k in this.sim.failures)
        this.sim.setFailure(k as keyof Failures, true);
  }
  private showMessage(text: string) {
    this.msg.textContent = text;
    this.msg.hidden = false;
  }
  private buildPanes(views: readonly PaneView[], labels?: [string?, string?]) {
    const keys = views.map((v) => JSON.stringify(v));
    if (
      keys.length === this.panes.length &&
      keys.every((k, i) => k === this.panes[i].key)
    )
      return;
    this.clearPanes();
    const interactive =
      !!this.cue?.controls?.length || this.cue?.mode === "live";
    views.slice(0, 2).forEach((v, i) => {
      const idx = i as 0 | 1;
      const p = new StagePane(v, idx, {
        lang: this.lang,
        theme: this.theme,
        assetUrl: this.env.assetUrl,
        interactive,
        label: labels?.[i],
        onDiagramChange: (spec) => this.emit({ k: "diagram", pane: idx, spec }),
        onTap: (hit, pt) => {
          if (hit) this.taps = [...this.taps, hit.id];
          this.emit({
            k: "tap",
            annotation: hit?.id ?? null,
            p: pt,
            pane: idx,
          });
        },
      });
      this.panes.push(p);
      this.panesEl.append(p.el);
    });
    this.panesEl.dataset.n = String(this.panes.length);
    this.layout();
  }
  private clearPanes() {
    for (const p of this.panes) p.destroy();
    this.panes = [];
  }
  /** Place the panes in the available box. */
  layout() {
    const W = this.panesEl.clientWidth;
    const H = this.panesEl.clientHeight;
    const boxes = layoutPanes(
      W,
      H,
      this.panes.map((p) => p.aspect),
    );
    this.panes.forEach((p, i) => p.place(boxes[i]));
  }
  private startClip(id: string | undefined) {
    const clip = id ? this.env.clips?.[id] : undefined;
    if (!clip) {
      this.setMode("frozen");
      return;
    }
    const scene = this.env.scenes[clip.startScene];
    this.clip = new ClipPlayer(this.sim, clip, {
      scene,
      onCue: (c, i) =>
        this.emit({
          k: "clipCue",
          index: i,
          text: c.text
            ? this.lang === "fr"
              ? (c.text.fr ?? c.text.en)
              : c.text.en
            : undefined,
          handover: c.handover,
          annotation: c.annotation,
        }),
      onEnd: () => this.emit({ k: "clipEnded" }),
    });
    this.clip.begin();
    const reduced =
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced) this.clip.play();
    this.setMode("clip");
  }
  private stopClip() {
    if (!this.clip) return;
    this.clip.end();
    this.clip = null;
    this.sim.paused = false;
    this.sim.replaying = false;
  }
  private updatePlan(reframe: boolean) {
    if (!this.plan || !this._sim) return;
    this.plan.setDraggable(
      !!this.cue?.controls?.includes("dragAircraft") && this._mode !== "clip",
    );
    this.plan.update(planModel(this.sim, this.hold, this.trail), reframe);
  }
  destroy() {
    this.destroyed = true;
    this.stopClip();
    this.loop.remove(this);
    this.ro?.disconnect();
    this.io?.disconnect();
    this.clearPanes();
    this.el.remove();
    this.listeners.clear();
  }
}
