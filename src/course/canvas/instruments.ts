// Ground school — designed slides: live instrument widgets and the sim viewport (package N).
// Every instrument / simViewport block naming the same scene shares ONE stage Sim (the HSI and the CDI on a slide
// move together); a block with its own failures gets its own Sim (a before / after slide). The drawing is the
// stage package's (course/stage/views.ts drawFrame over the cockpit renderers, overlay.ts annotations), sized
// from the block's on-screen size, and all live widgets of a page run on the stage's ONE rAF loop (StageLoop).
import { Sim } from "../../sim/sim";
import type { Failures } from "../../sim/sim";
import { applyScene, type SceneDiff } from "../scene";
import { AIRFRAME } from "../../sim/aircraft";
import { stageView, lateralDots, verticalDots } from "../goals";
import { instrumentFrame, type PaneFrame } from "../stage/geometry";
import { DEMO_SCENE_ID, instrumentScreen } from "./factory";
import {
  drawFrame,
  newInstrumentStates,
  paneAriaLabel,
  type InstrumentStates,
} from "../stage/views";
import { Overlay } from "../stage/overlay";
import { stageLoop, type LoopClient, type StageLoop } from "../stage/host";
import { StripPilot, type Box } from "./controlStrip";
import {
  applyFrame,
  bakeMotion,
  motionFits,
  motionKey,
  motionPreset,
  motionScript,
  MotionRun,
  prefersReducedMotion,
} from "./motion";
import { readySituation, sceneOfSituation } from "../situations";
import type {
  Annotation,
  Cockpit,
  InstrumentView,
  Lang,
  InstrumentMotion,
  ReadoutId,
  SimScene,
  StageControl,
} from "../types";

export interface SceneEnv {
  scenes: Record<string, SimScene>;
  cockpit?: Cockpit;
}

export interface SimEntry {
  sim: Sim;
  scene: SimScene;
  diffs: SceneDiff[];
  /** live widgets drawing from it */
  live: Set<SlideInstrument>;
  stepped: number;
  /** the failures it was built with (« Réinitialiser » builds it again) */
  failures?: Partial<Failures>;
  /** the hands on the flying controls, when a control strip shows this situation (canvas/controlStrip.ts) */
  pilot?: StripPilot;
  /** the animation the slide plays on this situation (canvas/motion.ts): it writes the frames, never steps */
  motion?: MotionRun;
  /** what the animation was built from (« Réinitialiser » and a situation edit build it again) */
  motionSpec?: InstrumentMotion;
}

// A situation added to the course while a slide is open (« Garder comme départ » in the editor): the open view
// was built with the course's scenes of that moment, so it finds the new one here. Ids are unique per capture.
const lateScenes = new Map<string, SimScene>();
export function rememberScene(scene: SimScene) {
  lateScenes.set(scene.id, scene);
  if (lateScenes.size > 64) lateScenes.delete(lateScenes.keys().next().value as string);
}

/**
 * The stage Sims of a slide (or of a whole thumbnail strip): one per (scene, failures). Built lazily; a scene that
 * cannot be applied (nav data missing) gives null and the widget shows a message.
 */
export class SceneSims implements LoopClient {
  private map = new Map<string, SimEntry | null>();
  private widgets = new Set<SlideInstrument>();
  private loop: StageLoop | null = null;
  private frameNo = 0;
  constructor(public env: SceneEnv) {}
  private key(
    scene: SimScene | string,
    failures?: Partial<Failures>,
    motion?: InstrumentMotion,
  ): string {
    const m = motionScript(motion) ? `|m:${motionKey(motion)}` : "";
    const base =
      typeof scene === "string"
        ? `id:${scene}`
        : `obj:${JSON.stringify(scene)}`;
    const f =
      failures &&
      Object.keys(failures).some((k) => failures[k as keyof Failures])
        ? `|f:${JSON.stringify(failures)}`
        : "";
    return base + f + m;
  }
  /** The Sim for a scene id (or a scene object: a calc stage hint, a YourTurn result pose). */
  get(
    scene: SimScene | string | undefined,
    failures?: Partial<Failures>,
    motion?: InstrumentMotion,
    /** where an animation rests before it plays: its start (a slide that plays it) or its telling frame */
    rest: "start" | "telling" = "start",
  ): SimEntry | null {
    if (!scene) return null;
    const k = this.key(scene, failures, motion);
    if (this.map.has(k)) return this.map.get(k)!;
    const sc =
      typeof scene === "string"
        ? (this.env.scenes[scene] ?? lateScenes.get(scene))
        : scene;
    let entry: SimEntry | null = null;
    if (sc) {
      try {
        const sim = new Sim();
        const diffs = applyScene(sim, sc);
        for (const [f, on] of Object.entries(failures ?? {}))
          if (on) sim.setFailure(f as keyof Failures, true);
        sim.updateAvionics(0);
        entry = {
          sim,
          scene: sc,
          diffs,
          live: new Set(),
          stepped: -1,
          ...(failures ? { failures: { ...failures } } : {}),
        };
        if (motionScript(motion)) this.prepareMotion(entry, motion!, rest);
      } catch {
        entry = null;
      }
    }
    // a scene that is not there yet (the demo scene is added by the first view that needs it, a capture may
    // arrive later) is looked up again next time: never cache a miss
    if (entry) this.map.set(k, entry);
    return entry;
  }
  /**
   * Build the animation of a situation: from the situation itself, or from the animation's own ready situation when
   * the slide's has not the signal it needs (an ILS for the glide path…), then put the Sim on its resting frame.
   */
  private prepareMotion(
    e: SimEntry,
    motion: InstrumentMotion,
    rest: "start" | "telling" = e.motion?.rest ?? "start",
  ) {
    const script = motionScript(motion);
    if (!script) return;
    const p = motionPreset(motion.preset);
    if (p && !motionFits(p, e.sim, this.env.cockpit)) {
      const ready = p.situation ? readySituation(p.situation) : undefined;
      if (ready) {
        const sc = sceneOfSituation(ready.sit, { id: `ready:${ready.id}` });
        const sim = new Sim();
        e.diffs = applyScene(sim, sc);
        for (const [f, on] of Object.entries(e.failures ?? {}))
          if (on) sim.setFailure(f as keyof Failures, true);
        sim.updateAvionics(0);
        e.sim = sim;
        e.scene = sc;
      }
    }
    const tl = bakeMotion(script, e.sim);
    e.motionSpec = motion;
    if (e.motion) e.motion.reset(tl);
    else
      e.motion = new MotionRun(tl, {
        speed: motion.speed,
        loop: motion.loop,
        rest,
        reduced: rest === "start" && prefersReducedMotion(),
      });
    applyFrame(e.sim, tl, e.motion.frame);
  }
  /** The situation's animation was handed to the student (« Prendre les commandes »): it flies from this frame. */
  handOver(e: SimEntry) {
    if (!e.motion || e.motion.state === "handed") return;
    e.motion.handOver();
    for (const w of this.widgets) if (w.entry === e) w.setMode("live");
    this.ensureLoop();
  }
  /** Re-apply a scene (Reset). */
  reset(scene: string) {
    for (const k of [...this.map.keys()])
      if (k.startsWith(`id:${scene}`)) this.map.delete(k);
  }
  /** The hands on the flying controls of a situation, with the controls of one more strip. */
  pilot(e: SimEntry, controls: readonly StageControl[]): StripPilot {
    const p = e.pilot ?? (e.pilot = new StripPilot());
    p.configure(e.sim, controls);
    return p;
  }
  /** Put a situation back at its start (« Réinitialiser »): every instrument showing it follows. */
  restart(e: SimEntry) {
    try {
      const sim = new Sim();
      const diffs = applyScene(sim, e.scene);
      for (const [f, on] of Object.entries(e.failures ?? {}))
        if (on) sim.setFailure(f as keyof Failures, true);
      sim.updateAvionics(0);
      e.sim = sim;
      e.diffs = diffs;
      if (e.motionSpec) this.prepareMotion(e, e.motionSpec);
    } catch {
      return;
    }
    e.pilot?.capture(e.sim);
    for (const w of this.widgets)
      if (w.entry === e) {
        if (e.motion) w.setMode(w.baseMode);
        w.invalidate();
      }
  }
  /**
   * A situation was edited in the studio (« Situation de vol »): every instrument showing the scene of that id
   * follows at once, on the same Sim (no rebuild: this runs while the author drags a slider).
   */
  replace(scene: SimScene) {
    this.env.scenes = { ...this.env.scenes, [scene.id]: scene };
    for (const [k, e] of this.map) {
      if (!(k === `id:${scene.id}` || k.startsWith(`id:${scene.id}|`))) continue;
      // a lookup made before the situation existed: forget it so the next draw builds the aircraft
      if (!e) {
        this.map.delete(k);
        continue;
      }
      try {
        e.scene = scene;
        e.diffs = applyScene(e.sim, scene);
        for (const [f, on] of Object.entries(e.failures ?? {}))
          if (on) e.sim.setFailure(f as keyof Failures, true);
        e.sim.updateAvionics(0);
        if (e.motionSpec) this.prepareMotion(e, e.motionSpec);
      } catch {
        continue;
      }
      e.pilot?.capture(e.sim);
      for (const w of this.widgets) if (w.entry === e) w.invalidate();
    }
    this.ensureLoop();
  }
  /** Run or stop the clock of a situation (the editor's try: time runs once the author flies it). */
  run(e: SimEntry, on: boolean) {
    for (const w of this.widgets)
      if (w.entry === e) w.setMode(on ? "live" : "frozen");
    if (on) this.ensureLoop();
  }
  /** Redraw every instrument of a situation (a knob was turned while it is frozen). */
  touch(e: SimEntry) {
    e.sim.updateAvionics(0);
    for (const w of this.widgets) if (w.entry === e) w.invalidate();
  }
  register(w: SlideInstrument) {
    this.widgets.add(w);
    if (w.mode === "live") this.ensureLoop();
  }
  unregister(w: SlideInstrument) {
    this.widgets.delete(w);
  }
  ensureLoop() {
    if (!this.loop) {
      this.loop = stageLoop();
      this.loop.add(this);
    }
    this.loop.request();
  }
  wantsFrame(): boolean {
    for (const w of this.widgets) if (w.wantsFrame() || w.motionWaits()) return true;
    return false;
  }
  /** Advance every animation once per frame, on screen only; hand it over when the student takes the controls. */
  private stepMotions(dt: number) {
    const seen = new Set<SimEntry>();
    for (const w of this.widgets) {
      const e = w.entry;
      const r = e?.motion;
      if (!e || !r || seen.has(e) || r.state === "handed") continue;
      if (!w.visible || !w.shown) continue;
      seen.add(e);
      if (e.pilot?.engaged) {
        this.handOver(e);
        continue;
      }
      if (r.state === "armed") r.start();
      if (r.tick(dt)) {
        applyFrame(e.sim, r.tl, r.frame);
        for (const x of this.widgets) if (x.entry === e) x.invalidate();
        // an animation of a live instrument ends in flight: the situation flies on from its last frame
        if (r.state === "ended" && [...this.widgets].some((x) => x.entry === e && x.baseMode === "live"))
          this.handOver(e);
      }
    }
  }
  frame(dt: number) {
    this.frameNo++;
    this.stepMotions(dt);
    // step each live Sim once per frame, whatever the number of widgets showing it
    for (const w of this.widgets) {
      if (w.mode !== "live" || !w.visible) continue;
      const e = w.entry;
      // an animation writes the frames until it is handed over: the flight model waits (a pause stays a pause)
      if (e?.motion && e.motion.state !== "handed") continue;
      if (e && e.stepped !== this.frameNo) {
        e.stepped = this.frameNo;
        e.sim.paused = false;
        e.pilot?.apply(e.sim, dt);
        e.sim.step(dt);
      }
    }
    for (const w of this.widgets)
      if (w.wantsFrame())
        w.draw(w.mode === "live" || w.entry?.motion?.state === "playing" ? dt : 0);
  }
  destroy() {
    this.loop?.remove(this);
    this.loop = null;
    this.widgets.clear();
    this.map.clear();
  }
}

export interface InstrumentOptions {
  view: InstrumentView;
  scene?: SimScene | string;
  failures?: Partial<Failures>;
  covers?: ("ai" | "dg")[];
  annotations?: Annotation[];
  mode?: "frozen" | "live" | "clip";
  bezel?: boolean;
  lang: Lang;
  /** logical (slide) size of the block */
  w: number;
  h: number;
  /** current slide → CSS px scale (backing-store size) */
  scale: () => number;
  /** draw once into an <img> (thumbnails): no canvas stays alive */
  still?: boolean;
  alt?: string;
  /** where the instrument sits inside the block when its control strip takes a part of it (default: all of it) */
  box?: Box;
  /** called after each draw (the control strip shows its values) */
  onDraw?: () => void;
  /** the slide's animation of this situation (canvas/motion.ts) */
  motion?: InstrumentMotion;
  /** where the animation rests before it plays (default: its start; the editor: its telling frame) */
  motionRest?: "start" | "telling";
}

/** One instrument on a slide. */
export class SlideInstrument {
  readonly el: HTMLDivElement;
  readonly frame: PaneFrame;
  readonly states: InstrumentStates;
  readonly overlay: Overlay | null = null;
  entry: SimEntry | null;
  mode: "frozen" | "live" | "clip";
  /** the mode the slide asked for (an animation handed over makes it live until « Réinitialiser ») */
  readonly baseMode: "frozen" | "live" | "clip";
  visible = true;
  /** the block is shown (its reveal step has come): an animation starts only then */
  shown = true;
  private canvas: HTMLCanvasElement | null = null;
  private revealN = 0;
  private momentSig = "";
  private screen: HTMLDivElement;
  private dirty = true;
  private io: IntersectionObserver | null = null;
  private lastAria = "";
  private ariaT = 0;
  constructor(
    private sims: SceneSims,
    private o: InstrumentOptions,
  ) {
    this.frame = instrumentFrame(o.view, sims.env.cockpit ?? "g1000");
    this.states = newInstrumentStates();
    this.mode = o.mode ?? "frozen";
    this.baseMode = this.mode;
    // a thumbnail never shows the "capture it" error: it falls back to the sample scene (a static instrument)
    const rest = o.still ? "telling" : (o.motionRest ?? "start");
    this.entry =
      sims.get(o.scene, o.failures, o.motion, rest) ??
      (o.still ? sims.get(DEMO_SCENE_ID, o.failures, o.motion, rest) : null);
    const gauge = this.frame.kind === "gauge";
    this.el = document.createElement("div");
    this.el.className = `sl-inst cs-scope${gauge ? " is-gauge" : " is-display"}${o.bezel === false ? " no-bezel" : ""}`;
    this.el.setAttribute("role", "img");
    this.screen = document.createElement("div");
    this.screen.className = "sl-inst-screen";
    this.el.append(this.screen);
    // the screen keeps the drawing's aspect inside the block (the bezel takes ~3 % of the short side)
    if (o.box) this.setBox(o.box);
    else this.placeScreen(o.w, o.h);
    if (!this.entry) {
      const m = document.createElement("div");
      m.className = "sl-inst-msg";
      m.textContent =
        o.lang === "fr"
          ? "Scène introuvable : capturez-la depuis le cockpit"
          : "Scene not found: capture it from the cockpit";
      this.screen.append(m);
      if (o.alt) this.el.setAttribute("aria-label", o.alt);
      return;
    }
    this.canvas = document.createElement("canvas");
    this.canvas.className = "sl-inst-canvas";
    this.screen.append(this.canvas);
    if (o.annotations?.length && !o.still) {
      const ov = new Overlay(0, { lang: o.lang });
      ov.setRect(this.frame.rect);
      ov.set(this.momentAnnotations(), { reveal: 0 });
      this.screen.append(ov.el);
      (this as { overlay: Overlay | null }).overlay = ov;
    }
    if (o.alt) this.el.setAttribute("aria-label", o.alt);
    if (o.still) {
      // draw on the next frame (the element must be laid out to know nothing: size comes from the frame)
      queueMicrotask(() => this.drawStill());
      return;
    }
    if (typeof IntersectionObserver !== "undefined") {
      this.io = new IntersectionObserver((es) => {
        for (const e of es) this.visible = e.isIntersecting;
        if (this.visible) this.sims.ensureLoop();
      });
      this.io.observe(this.el);
    }
    sims.register(this);
    sims.ensureLoop();
  }
  get sim(): Sim | null {
    return this.entry?.sim ?? null;
  }
  private placeScreen(w: number, h: number) {
    const o = this.o;
    const box = instrumentScreen(o.view, w, h, o.bezel !== false, this.sims.env.cockpit ?? "g1000");
    const s = this.screen.style;
    s.left = `${box.x}px`;
    s.top = `${box.y}px`;
    s.width = `${box.w}px`;
    s.height = `${box.h}px`;
  }
  /** Draw the instrument in a part of the block (its control strip takes the rest). */
  setBox(b: Box) {
    const s = this.el.style;
    s.inset = "auto";
    s.left = `${b.x}px`;
    s.top = `${b.y}px`;
    s.width = `${b.w}px`;
    s.height = `${b.h}px`;
    this.placeScreen(b.w, b.h);
    if (this.canvas) this.invalidate();
  }
  /** the CSS size of the screen box (logical × scale) */
  private screenPx(): { w: number; h: number } {
    const k = this.o.scale();
    const w = parseFloat(this.screen.style.width) * k;
    const h = parseFloat(this.screen.style.height) * k;
    return { w, h };
  }
  wantsFrame(): boolean {
    return (
      !!this.canvas && this.visible && (this.dirty || this.mode === "live")
    );
  }
  /** an animation on screen is waiting to start or playing */
  motionWaits(): boolean {
    const s = this.entry?.motion?.state;
    return !!this.canvas && this.visible && this.shown && (s === "armed" || s === "playing");
  }
  /** the block's reveal step has come (or gone): an armed animation starts once it is shown */
  setShown(on: boolean) {
    if (this.shown === on) return;
    this.shown = on;
    if (on) this.sims.ensureLoop();
  }
  /** the callouts shown now: one tied to a moment of the animation waits for it (canvas/motion.ts marks) */
  private momentAnnotations(): Annotation[] {
    const all = this.o.annotations ?? [];
    const r = this.entry?.motion;
    if (!r || this.o.motionRest === "telling") return all;
    return all.filter((a) => !a.moment || r.markShown(a.moment));
  }
  private syncMoments() {
    if (!this.overlay || !this.entry?.motion) return;
    const list = this.momentAnnotations();
    const sig = list.map((a) => a.id).join(",");
    if (sig === this.momentSig) return;
    this.momentSig = sig;
    this.overlay.set(list, { reveal: this.revealN });
  }
  invalidate() {
    this.dirty = true;
    this.sims.ensureLoop();
  }
  setMode(m: "frozen" | "live" | "clip") {
    this.mode = m;
    this.el.dataset.mode = m;
    this.invalidate();
  }
  setReveal(reveal: number) {
    this.revealN = reveal;
    this.overlay?.setReveal({ reveal });
  }
  highlight(id: string | null) {
    this.overlay?.highlight(id);
  }
  /** Draw into the canvas at the on-screen resolution (dpr capped at 2). */
  draw(dt: number) {
    const sim = this.sim;
    if (!sim || !this.canvas) return;
    const { w, h } = this.screenPx();
    if (!(w > 1 && h > 1)) return;
    const dpr = Math.min(
      2,
      typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
    );
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const [x, y, rw, rh] = this.frame.rect;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    const sx = pw / rw;
    const sy = ph / rh;
    ctx.setTransform(sx, 0, 0, sy, -x * sx, -y * sy);
    try {
      drawFrame(ctx, sim, this.frame, this.states, dt, {
        covers: this.o.covers,
        lang: this.o.lang,
      });
    } catch {
      /* a renderer that throws on an odd state must not take the slide down */
    }
    this.dirty = false;
    this.syncMoments();
    this.ariaT += dt;
    if (!this.o.alt && (this.mode !== "live" || this.ariaT > 1)) {
      this.ariaT = 0;
      const a = paneAriaLabel(this.frame, sim, this.o.lang);
      if (a !== this.lastAria)
        this.el.setAttribute("aria-label", (this.lastAria = a));
    }
    this.o.onDraw?.();
  }
  private drawStill() {
    this.draw(0);
    if (!this.canvas) return;
    try {
      const url = this.canvas.toDataURL("image/png");
      const img = document.createElement("img");
      img.className = "sl-inst-canvas";
      img.alt = "";
      img.src = url;
      this.canvas.replaceWith(img);
      this.canvas.width = this.canvas.height = 0;
      this.canvas = null;
    } catch {
      /* tainted or unsupported: keep the canvas */
    }
  }
  /** after a scale change (resize) */
  resized() {
    this.invalidate();
  }
  destroy() {
    this.io?.disconnect();
    this.sims.unregister(this);
    if (this.canvas) this.canvas.width = this.canvas.height = 0;
    this.el.remove();
  }
}

// ------------------------------------------------------------------ live readouts (text bindings)
const pad3 = (n: number) =>
  String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, "0");
const thousands = (n: number, lang: Lang) =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, lang === "fr" ? " " : ",");
/** A readout of a Sim as display text (null when it has no meaning now). */
export function readoutText(
  sim: Sim,
  id: ReadoutId,
  lang: Lang = "en",
): string | null {
  const v = stageView(sim);
  const dec = (n: number, d = 1) =>
    lang === "fr" ? n.toFixed(d).replace(".", ",") : n.toFixed(d);
  switch (id) {
    case "hdg":
      return pad3(v.hdgDeg);
    case "trk":
      return pad3(v.trkDeg);
    case "alt":
      return `${thousands(v.altFt, lang)} ft`;
    case "ias":
      return `${Math.round(v.iasKt)} kt`;
    case "gs":
      return `${Math.round(v.gsKt)} kt`;
    case "vs":
      return `${v.vsFpm > 0 ? "+" : ""}${thousands(Math.round(v.vsFpm / 10) * 10, lang)} ft/min`;
    case "obs1":
      return pad3(v.obs1);
    case "toFrom":
      return v.nav1.valid ? v.nav1.toFrom : null;
    case "radial":
      return v.nav1.valid ? `R-${pad3(v.nav1.radial)}` : null;
    case "dme":
      return v.nav1.dmeNm === null ? null : `${dec(v.nav1.dmeNm)} NM`;
    case "cdiDots": {
      const d = lateralDots(v);
      return d === null
        ? null
        : `${dec(Math.abs(d))} ${lang === "fr" ? "pt" : "dot"}${d > 0.05 ? " R" : d < -0.05 ? " L" : ""}`;
    }
    case "gsDots": {
      const d = verticalDots(v);
      return d === null
        ? null
        : `${dec(Math.abs(d))} ${lang === "fr" ? "pt" : "dot"}`;
    }
    case "wca": {
      const w = ((v.hdgDeg - v.trkDeg + 540) % 360) - 180;
      return `${w > 0 ? "+" : ""}${Math.round(w)}°`;
    }
    case "bank": {
      const b = Math.round(v.bankDeg);
      const side = lang === "fr" ? ["G", "D"] : ["L", "R"];
      return b === 0 ? "0°" : `${Math.abs(b)}° ${b < 0 ? side[0] : side[1]}`;
    }
    case "loadFactor":
      return `${dec(Math.max(0, sim.ac.data.gLoad), 2)} g`;
    case "stallIas":
      // the clean stall speed grows with the square root of the load factor (C172S: Vs1 48 KIAS at 1 g)
      return `${Math.round(AIRFRAME.vs1 * Math.sqrt(Math.max(0, sim.ac.data.gLoad)))} kt`;
    default:
      return null;
  }
}

// ------------------------------------------------------------------ the sim viewport's still view
/**
 * A still of the outside / cockpit view drawn from the Sim's attitude (when no poster is captured): sky and
 * ground split by the horizon at the right pitch and bank, the cowling in the cockpit view. Flat colours.
 */
export function drawOutsideStill(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sim: Sim | null,
  cockpit: boolean,
) {
  const pitch = sim ? sim.ac.s.theta : 0;
  const bank = sim ? sim.ac.s.phi : 0;
  ctx.save();
  ctx.fillStyle = "#7ea7cf";
  ctx.fillRect(0, 0, w, h);
  const fovV = (40 * Math.PI) / 180;
  const pxPerRad = h / fovV;
  ctx.translate(w / 2, h * (cockpit ? 0.42 : 0.5) + pitch * pxPerRad);
  ctx.rotate(-bank);
  ctx.fillStyle = "#c9d9e6";
  ctx.fillRect(-w * 2, -h * 0.05, w * 4, h * 0.05);
  ctx.fillStyle = "#5f6f47";
  ctx.fillRect(-w * 2, 0, w * 4, h * 3);
  ctx.fillStyle = "#6c7c52";
  for (let i = 1; i < 8; i++)
    ctx.fillRect(-w * 2, (i * i * h) / 60, w * 4, Math.max(1, h / 180));
  ctx.restore();
  if (cockpit) {
    ctx.fillStyle = "#15191d";
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.74);
    ctx.quadraticCurveTo(w / 2, h * 0.64, w, h * 0.74);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#23292f";
    ctx.fillRect(0, h * 0.86, w, h * 0.14);
  }
}
