// Ground school — designed slides: live instrument widgets and the sim viewport (package N).
// Every instrument / simViewport block naming the same scene shares ONE stage Sim (the HSI and the CDI on a slide
// move together); a block with its own failures gets its own Sim (a before / after slide). The drawing is the
// stage package's (course/stage/views.ts drawFrame over the cockpit renderers, overlay.ts annotations), sized
// from the block's on-screen size, and all live widgets of a page run on the stage's ONE rAF loop (StageLoop).
import { Sim } from "../../sim/sim";
import type { Failures } from "../../sim/sim";
import { applyScene, type SceneDiff } from "../scene";
import { stageView, lateralDots, verticalDots } from "../goals";
import { instrumentFrame, type PaneFrame } from "../stage/geometry";
import { instrumentScreen } from "./factory";
import {
  drawFrame,
  newInstrumentStates,
  paneAriaLabel,
  type InstrumentStates,
} from "../stage/views";
import { Overlay } from "../stage/overlay";
import { stageLoop, type LoopClient, type StageLoop } from "../stage/host";
import type {
  Annotation,
  Cockpit,
  InstrumentView,
  Lang,
  ReadoutId,
  SimScene,
} from "../types";

export interface SceneEnv {
  scenes: Record<string, SimScene>;
  cockpit?: Cockpit;
}

interface SimEntry {
  sim: Sim;
  scene: SimScene;
  diffs: SceneDiff[];
  /** live widgets drawing from it */
  live: Set<SlideInstrument>;
  stepped: number;
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
  private key(scene: SimScene | string, failures?: Partial<Failures>): string {
    const base =
      typeof scene === "string"
        ? `id:${scene}`
        : `obj:${JSON.stringify(scene)}`;
    const f =
      failures &&
      Object.keys(failures).some((k) => failures[k as keyof Failures])
        ? `|f:${JSON.stringify(failures)}`
        : "";
    return base + f;
  }
  /** The Sim for a scene id (or a scene object: a calc stage hint, a YourTurn result pose). */
  get(
    scene: SimScene | string | undefined,
    failures?: Partial<Failures>,
  ): SimEntry | null {
    if (!scene) return null;
    const k = this.key(scene, failures);
    if (this.map.has(k)) return this.map.get(k)!;
    const sc = typeof scene === "string" ? this.env.scenes[scene] : scene;
    let entry: SimEntry | null = null;
    if (sc) {
      try {
        const sim = new Sim();
        const diffs = applyScene(sim, sc);
        for (const [f, on] of Object.entries(failures ?? {}))
          if (on) sim.setFailure(f as keyof Failures, true);
        sim.updateAvionics(0);
        entry = { sim, scene: sc, diffs, live: new Set(), stepped: -1 };
      } catch {
        entry = null;
      }
    }
    this.map.set(k, entry);
    return entry;
  }
  /** Re-apply a scene (Reset). */
  reset(scene: string) {
    for (const k of [...this.map.keys()])
      if (k.startsWith(`id:${scene}`)) this.map.delete(k);
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
    for (const w of this.widgets) if (w.wantsFrame()) return true;
    return false;
  }
  frame(dt: number) {
    this.frameNo++;
    // step each live Sim once per frame, whatever the number of widgets showing it
    for (const w of this.widgets) {
      if (w.mode !== "live" || !w.visible) continue;
      const e = w.entry;
      if (e && e.stepped !== this.frameNo) {
        e.stepped = this.frameNo;
        e.sim.paused = false;
        e.sim.step(dt);
      }
    }
    for (const w of this.widgets)
      if (w.wantsFrame()) w.draw(w.mode === "live" ? dt : 0);
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
}

/** One instrument on a slide. */
export class SlideInstrument {
  readonly el: HTMLDivElement;
  readonly frame: PaneFrame;
  readonly states: InstrumentStates;
  readonly overlay: Overlay | null = null;
  entry: SimEntry | null;
  mode: "frozen" | "live" | "clip";
  visible = true;
  private canvas: HTMLCanvasElement | null = null;
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
    this.entry = sims.get(o.scene, o.failures);
    const gauge = this.frame.kind === "gauge";
    this.el = document.createElement("div");
    this.el.className = `sl-inst cs-scope${gauge ? " is-gauge" : " is-display"}${o.bezel === false ? " no-bezel" : ""}`;
    this.el.setAttribute("role", "img");
    this.screen = document.createElement("div");
    this.screen.className = "sl-inst-screen";
    this.el.append(this.screen);
    // the screen keeps the drawing's aspect inside the block (the bezel takes ~3 % of the short side)
    const box = instrumentScreen(o.view, o.w, o.h, o.bezel !== false, sims.env.cockpit ?? "g1000");
    const s = this.screen.style;
    s.left = `${box.x}px`;
    s.top = `${box.y}px`;
    s.width = `${box.w}px`;
    s.height = `${box.h}px`;
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
      ov.set(o.annotations, { reveal: 0 });
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
    this.ariaT += dt;
    if (!this.o.alt && (this.mode !== "live" || this.ariaT > 1)) {
      this.ariaT = 0;
      const a = paneAriaLabel(this.frame, sim, this.o.lang);
      if (a !== this.lastAria)
        this.el.setAttribute("aria-label", (this.lastAria = a));
    }
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
