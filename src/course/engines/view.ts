// The 3D engine view (course/engines): one engine cut open, its parts named, turning at the speed its gauges
// read (slowed down so the eye can follow), the levers the student moves, the steps of its cycle or its stations.
// Self-contained: mountEngine(el, { kind, lang, controls, onChange }) → { set, state, resize, destroy }.
// Light on the GPU: low-poly merged meshes, one renderer per view, drawn only while it moves or is touched and
// only while on screen; destroy() frees every geometry, material and the WebGL context. Reduced motion: no
// animation, a still cutaway posed on the step chosen with the step buttons. Every word FR / EN.
import * as THREE from "three";
import type { EngineControl, EngineKind, EngineSettings, Lang } from "../types";
import { disposeTree, makeMats, type EngineModel, type Mats } from "./kit";
import { buildPiston } from "./piston3d";
import { buildTurbofan, buildTurboprop } from "./turbine3d";
import { buildProp } from "./prop3d";
import {
  ENGINE_CONTROLS,
  ENGINE_GAUGES,
  ENGINE_NAME,
  EngineSim,
  controlEnds,
  controlName,
  gaugeText,
  tl,
} from "./sim";
import "../../styles/engines.css";

export function buildEngineModel(kind: EngineKind, mats: Mats): EngineModel {
  switch (kind) {
    case "piston":
      return buildPiston(mats);
    case "turboprop":
      return buildTurboprop(mats);
    case "turbofan":
      return buildTurbofan(mats);
    case "prop":
      return buildProp(mats);
  }
}

/** What the view is showing: the levers, the step, playing or not (the presenter mirrors it on the projector). */
export interface EngineLiveState {
  set: Required<EngineSettings>;
  stage: number;
  playing: boolean;
  slow: boolean;
  labels: boolean;
}
export interface EngineViewOpts {
  kind: EngineKind;
  lang: Lang;
  /** the levers the student may move (default: all of that engine's); [] = watch only */
  controls?: EngineControl[];
  set?: EngineSettings;
  stage?: number;
  labels?: boolean;
  slow?: boolean;
  /** start playing (default true) */
  playing?: boolean;
  /** a still picture: no animation loop, no controls (the editor, a still frame) */
  still?: boolean;
  /** no pointer or keyboard input at all (the slide editor selects the block instead) */
  inert?: boolean;
  /** force reduced motion (default: the system setting) */
  reducedMotion?: boolean;
  /** the « Plein écran » button (default true) */
  fullscreen?: boolean;
  /** mouse-wheel zoom (the full-screen view; on a slide the wheel scrolls the page) */
  wheelZoom?: boolean;
  /** called after every change made here (a lever, a step, play / pause) */
  onChange?: (st: EngineLiveState) => void;
  /** tests: a renderer stand-in (no WebGL in node) */
  renderer?: (canvas: HTMLCanvasElement) => RendererLike | null;
}
/** the part of THREE.WebGLRenderer the view uses */
export interface RendererLike {
  setPixelRatio(r: number): void;
  setSize(w: number, h: number, style?: boolean): void;
  setClearColor(c: number, a?: number): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
  forceContextLoss?(): void;
}
export interface EngineHandle {
  readonly el: HTMLElement;
  set(
    p: Partial<Omit<EngineLiveState, "set">> & { set?: EngineSettings },
  ): void;
  state(): EngineLiveState;
  resize(): void;
  destroy(): void;
  /** destroy() ran (tests) */
  readonly destroyed: boolean;
}

// ------------------------------------------------------------------ words
const W = {
  play: ["Play", "Lecture"],
  pause: ["Pause", "Pause"],
  slow: ["Slow motion", "Ralenti"],
  prev: ["Previous step", "Étape précédente"],
  next: ["Next step", "Étape suivante"],
  labels: ["All names", "Tous les noms"],
  full: ["Full screen", "Plein écran"],
  close: ["Close", "Fermer"],
  steps: ["Steps", "Étapes"],
  levers: ["Controls", "Commandes"],
  gauges: ["Gauges", "Instruments moteur"],
  reduced: [
    "Reduced motion: choose a step.",
    "Animation réduite : choisissez une étape.",
  ],
  slowed: [
    "Rotation slowed down for the eye",
    "Rotation ralentie pour la lisibilité",
  ],
  orbit: [
    "Drag to turn the engine, pinch to zoom. Arrow keys turn it, + and − zoom.",
    "Glissez pour tourner le moteur, pincez pour zoomer. Les flèches le tournent, + et − zooment.",
  ],
  no3d: [
    "3D is not available on this device: the steps and gauges still work.",
    "La 3D n’est pas disponible sur cet appareil : les étapes et les instruments fonctionnent.",
  ],
  step: ["Step {n} of {t}", "Étape {n} sur {t}"],
  on: ["On", "Oui"],
  off: ["Off", "Non"],
  both: ["Both", "Les deux"],
  left: ["L", "G"],
  right: ["R", "D"],
  magOff: ["Off", "Arrêt"],
  notCert: [
    "Procedural training, not FSTD certified",
    "Entraînement procédural, non certifié FSTD",
  ],
} as const;
const w = (
  k: keyof typeof W,
  lang: Lang,
  v: Record<string, string | number> = {},
) =>
  W[k][lang === "fr" ? 1 : 0].replace(/\{(\w+)\}/g, (_, x: string) =>
    String(v[x] ?? ""),
  );

const mk = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const btn = (cls: string, label: string, text?: string): HTMLButtonElement => {
  const b = mk("button", cls, text ?? label);
  b.type = "button";
  if (text !== undefined) b.setAttribute("aria-label", label);
  return b;
};
const prefersReduced = (): boolean => {
  try {
    return (
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
};
const lowGfx = (): boolean => {
  try {
    return localStorage.getItem("ifr.gfx") === '"low"';
  } catch {
    return false;
  }
};

function defaultRenderer(canvas: HTMLCanvasElement): RendererLike | null {
  try {
    const r = new THREE.WebGLRenderer({
      canvas,
      antialias: !lowGfx(),
      alpha: true,
      powerPreference: "low-power",
    });
    r.outputColorSpace = THREE.SRGBColorSpace;
    return r;
  } catch {
    return null;
  }
}

/** Mount an engine in `host`. */
export function mountEngine(
  host: HTMLElement,
  o: EngineViewOpts,
): EngineHandle {
  const lang = o.lang;
  const kind = o.kind;
  const reduced = o.reducedMotion ?? prefersReduced();
  const still = !!o.still || reduced;
  const sim = new EngineSim(kind, o.set);
  const controls = (o.controls ?? ENGINE_CONTROLS[kind]).filter((c) =>
    ENGINE_CONTROLS[kind].includes(c),
  );
  const mats = makeMats();
  const model = buildEngineModel(kind, mats);
  const nStages = model.stages.length;
  const st: EngineLiveState = {
    set: sim.set,
    stage: Math.min(nStages - 1, Math.max(0, Math.round(o.stage ?? 0))),
    playing: !still && o.playing !== false,
    slow: !!o.slow,
    labels: !!o.labels,
  };
  if (still) sim.settle();

  // ---- DOM
  const root = mk(
    "div",
    `eng eng-${kind}${still ? " still" : ""}${o.inert ? " inert" : ""}${o.wheelZoom ? " big" : ""}`,
  );
  root.setAttribute("role", "group");
  // in the slide editor the engine is a picture: no focus, no clicks (the editor selects the block)
  if (o.inert) (root as HTMLElement & { inert?: boolean }).inert = true;
  root.setAttribute("aria-label", tl(ENGINE_NAME[kind], lang));
  const stageBox = mk("div", "eng-view");
  const canvas = mk("canvas", "eng-cv");
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    `${tl(ENGINE_NAME[kind], lang)}. ${w("orbit", lang)}`,
  );
  if (!o.inert) canvas.tabIndex = 0;
  const labelsBox = mk("div", "eng-labels");
  labelsBox.setAttribute("aria-hidden", "true");
  const cap = mk("div", "eng-cap");
  cap.setAttribute("aria-live", "polite");
  const capN = mk("span", "eng-cap-n");
  const capT = mk("b", "eng-cap-t");
  const capX = mk("span", "eng-cap-x");
  cap.append(capN, capT, capX);
  // the bar over the picture: the steps and play on the left, names and full screen on the right
  const top = mk("div", "eng-top");
  const tools = mk("div", "eng-tools");
  stageBox.append(canvas, labelsBox, cap, top);
  const panel = mk("div", "eng-panel");
  root.append(stageBox, panel);
  host.append(root);

  // tools: names on/off, full screen
  const lbBtn = btn("eng-btn eng-tool", w("labels", lang));
  lbBtn.setAttribute("aria-pressed", String(st.labels));
  tools.append(lbBtn);
  let fsBtn: HTMLButtonElement | null = null;
  if (o.fullscreen !== false && !o.inert) {
    fsBtn = btn("eng-btn eng-tool", w("full", lang));
    tools.append(fsBtn);
  }

  // gauges
  const gaugesBox = mk("div", "eng-gauges");
  gaugesBox.setAttribute("role", "group");
  gaugesBox.setAttribute("aria-label", w("gauges", lang));
  const gaugeEls = ENGINE_GAUGES[kind].map((g) => {
    const box = mk("div", "eng-g");
    const name = mk("span", "eng-g-n", tl(g.name, lang));
    const val = mk("b", "eng-g-v");
    const unit = mk("span", "eng-g-u", g.unit);
    const bar = mk("span", "eng-g-bar");
    const fill = mk("i", "eng-g-fill");
    bar.append(fill);
    if (g.red !== undefined) {
      const red = mk("i", "eng-g-red");
      red.style.left = `${(100 * (g.red - g.min)) / (g.max - g.min)}%`;
      bar.append(red);
    }
    if (g.min < 0) {
      const zero = mk("i", "eng-g-zero");
      zero.style.left = `${(100 * -g.min) / (g.max - g.min)}%`;
      bar.append(zero);
    }
    box.append(name, mk("span", "eng-g-row"), bar);
    (box.children[1] as HTMLElement).append(val, unit);
    gaugesBox.append(box);
    return { g, box, val, fill };
  });
  const status = mk("p", "eng-status");
  status.setAttribute("aria-live", "polite");
  panel.append(gaugesBox, status);

  // levers
  const ctlBox = mk("div", "eng-ctl");
  ctlBox.setAttribute("role", "group");
  ctlBox.setAttribute("aria-label", w("levers", lang));
  const sync: (() => void)[] = [];
  const changed = () => {
    o.onChange?.({ ...st, set: { ...st.set } });
  };
  const apply = (s: EngineSettings) => {
    sim.setSettings(s);
    st.set = sim.set;
    if (still || !st.playing) sim.settle();
    dirty = true;
    kick();
  };
  for (const c of controls) {
    const row = mk("div", `eng-c eng-c-${c}`);
    const id = `eng-${Math.random().toString(36).slice(2, 9)}`;
    const name = tl(controlName(c, kind), lang);
    if (c === "throttle" || c === "mixture" || c === "prop") {
      const lab = mk("label", "eng-c-n", name);
      lab.htmlFor = id;
      const range = mk("input", "eng-range");
      range.type = "range";
      range.id = id;
      range.min = "0";
      range.max = "100";
      range.step = "1";
      const [lo, hi] = controlEnds(c, kind);
      const ends = mk("span", "eng-c-ends");
      ends.append(mk("span", "", tl(lo, lang)), mk("span", "", tl(hi, lang)));
      const read = () => st.set[c];
      const put = () => {
        range.value = String(Math.round(read() * 100));
        range.setAttribute("aria-valuetext", `${Math.round(read() * 100)} %`);
      };
      range.addEventListener("input", () => {
        apply({ [c]: Number(range.value) / 100 });
        put();
        changed();
      });
      sync.push(put);
      row.append(lab, range, ends);
    } else if (c === "carbHeat" || c === "reverse") {
      const t = btn("eng-btn eng-toggle", name);
      const put = () => {
        t.setAttribute("aria-pressed", String(st.set[c]));
        t.textContent = `${name} · ${st.set[c] ? w("on", lang) : w("off", lang)}`;
      };
      t.addEventListener("click", () => {
        apply({ [c]: !st.set[c] });
        put();
        changed();
      });
      sync.push(put);
      row.append(t);
    } else if (c === "magnetos") {
      const lab = mk("span", "eng-c-n", name);
      lab.id = id;
      const seg = mk("div", "eng-seg");
      seg.setAttribute("role", "radiogroup");
      seg.setAttribute("aria-labelledby", id);
      const opts: ["off" | "left" | "right" | "both", string][] = [
        ["off", w("magOff", lang)],
        ["right", w("right", lang)],
        ["left", w("left", lang)],
        ["both", w("both", lang)],
      ];
      const bs = opts.map(([v, txt]) => {
        const b = btn("eng-btn eng-seg-b", txt);
        b.setAttribute("role", "radio");
        b.addEventListener("click", () => {
          apply({ mags: v });
          put();
          changed();
        });
        seg.append(b);
        return { v, b };
      });
      const put = () => {
        for (const x of bs) {
          x.b.setAttribute("aria-checked", String(st.set.mags === x.v));
          x.b.tabIndex = st.set.mags === x.v ? 0 : -1;
        }
      };
      seg.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        const k = opts.findIndex(([v]) => v === st.set.mags);
        const n =
          (k + (e.key === "ArrowRight" ? 1 : opts.length - 1)) % opts.length;
        apply({ mags: opts[n][0] });
        put();
        bs[n].b.focus();
        changed();
      });
      sync.push(put);
      row.append(lab, seg);
    }
    ctlBox.append(row);
  }
  if (controls.length) panel.append(ctlBox);

  // transport: steps, play / pause, slow motion
  const tr = mk("div", "eng-tr");
  const prev = btn("eng-btn eng-ic", w("prev", lang), "‹");
  const next = btn("eng-btn eng-ic", w("next", lang), "›");
  const playB = btn("eng-btn eng-play", w("pause", lang));
  const slowB = btn("eng-btn", w("slow", lang));
  slowB.setAttribute("aria-pressed", String(st.slow));
  tr.append(prev);
  if (!still) tr.append(playB, slowB);
  tr.append(next);
  top.append(tr, tools);
  const chips = mk("div", "eng-steps");
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", w("steps", lang));
  const chipEls = model.stages.map((s, k) => {
    const b = btn("eng-btn eng-chip", tl(s.name, lang));
    b.addEventListener("click", () => goStage(k, true));
    chips.append(b);
    return b;
  });
  panel.append(chips);
  const foot = mk(
    "p",
    "eng-foot",
    still ? (reduced && !o.still ? w("reduced", lang) : "") : w("slowed", lang),
  );
  if (foot.textContent) panel.append(foot);
  const cert = mk("p", "eng-cert", w("notCert", lang));
  panel.append(cert);

  // part labels
  // a dot on the part, its name beside it (moved up or down a line to clear the others)
  const labels = model.parts.map((p) => {
    const el = mk("span", "eng-lb");
    const dot = mk("i", "eng-lb-dot");
    const t = mk("span", "eng-lb-t", tl(p.name, lang));
    el.append(dot, t);
    labelsBox.append(el);
    return { p, el, t, w: 0, h: 0, x: 0, y: 0, z: 0, on: false };
  });

  // ---- three
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x2a3038, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-4, 8, 6);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9fb8d8, 0.8);
  fill.position.set(6, -2, -5);
  scene.add(fill);
  scene.add(model.root);
  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.5, 100);
  const target = new THREE.Vector3(...model.view.target);
  let yaw = model.view.yaw;
  let pitch = model.view.pitch;
  let radius = model.view.radius;
  const placeCamera = () => {
    // a tall box (a phone): step back so the whole engine stays in the picture
    const R = radius * Math.max(1, 1.5 / Math.max(0.3, camera.aspect)) ** 0.9;
    camera.position.set(
      target.x + R * Math.cos(pitch) * Math.sin(yaw),
      target.y + R * Math.sin(pitch),
      target.z + R * Math.cos(pitch) * Math.cos(yaw),
    );
    camera.lookAt(target);
  };
  placeCamera();
  const renderer = (o.renderer ?? defaultRenderer)(canvas);
  if (!renderer) {
    root.classList.add("no3d");
    stageBox.append(mk("p", "eng-no3d", w("no3d", lang)));
  } else renderer.setClearColor(0x000000, 0);

  // ---- state and loop
  let dirty = true;
  let raf = 0;
  let visible = true;
  let destroyed = false;
  let last = 0;
  let gaugeT = 0;
  let wSize = 0;
  let hSize = 0;
  let pxScale = 1;
  const tmp = new THREE.Vector3();
  const focusOf = () => new Set(model.stages[shownStage()]?.focus ?? []);
  const shownStage = () => {
    if (!still && st.playing && st.stage < 4 && kind === "piston")
      return model.liveStage?.() ?? st.stage;
    return st.stage;
  };
  let lastShown = -1;
  const paintCaption = () => {
    const k = shownStage();
    if (k === lastShown) return;
    lastShown = k;
    const s = model.stages[k];
    capN.textContent = w("step", lang, { n: k + 1, t: nStages });
    capT.textContent = tl(s.name, lang);
    capX.textContent = tl(s.text, lang);
    chipEls.forEach((b, i) =>
      b.setAttribute("aria-current", i === k ? "step" : "false"),
    );
    dirty = true;
  };
  const paintGauges = () => {
    for (const x of gaugeEls) {
      const v = sim.v[x.g.id] ?? 0;
      x.val.textContent = gaugeText(x.g, v, lang);
      const f = Math.max(0, Math.min(1, (v - x.g.min) / (x.g.max - x.g.min)));
      x.fill.style.width = `${f * 100}%`;
      x.box.classList.toggle("over", x.g.red !== undefined && v > x.g.red);
    }
    const s = sim.status(lang);
    if (status.textContent !== s) status.textContent = s;
  };
  const paintControls = () => {
    for (const f of sync) f();
    playB.textContent = st.playing ? w("pause", lang) : w("play", lang);
    playB.setAttribute("aria-label", playB.textContent);
    slowB.setAttribute("aria-pressed", String(st.slow));
    lbBtn.setAttribute("aria-pressed", String(st.labels));
    root.classList.toggle("nolabels", !st.labels);
  };
  const measure = () => {
    const cw = stageBox.clientWidth;
    const ch = stageBox.clientHeight;
    if (!cw || !ch) return false;
    // the slide is scaled as a whole: render at the size it is on the screen, not its logical size
    const rect = stageBox.getBoundingClientRect?.();
    const k = rect && rect.width ? rect.width / cw : 1;
    const dpr = Math.min(
      typeof devicePixelRatio === "number" ? devicePixelRatio : 1,
      lowGfx() ? 1 : 1.5,
    );
    let pw = Math.max(1, Math.round(cw * k * dpr));
    let ph = Math.max(1, Math.round(ch * k * dpr));
    // at most about 1.3 Mpx: software WebGL stays smooth
    const cap = 1.3e6 / (pw * ph);
    if (cap < 1) {
      pw = Math.round(pw * Math.sqrt(cap));
      ph = Math.round(ph * Math.sqrt(cap));
    }
    if (pw !== wSize || ph !== hSize) {
      wSize = pw;
      hSize = ph;
      renderer?.setPixelRatio(1);
      renderer?.setSize(pw, ph, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      placeCamera();
    }
    if (k !== pxScale) for (const l of labels) l.w = l.h = 0;
    pxScale = k;
    return true;
  };
  const shown = (o: THREE.Object3D | null): boolean => {
    for (let x = o; x; x = x.parent) if (!x.visible) return false;
    return true;
  };
  type Box = { x: number; y: number; w: number; h: number };
  const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const boxOf = (e: HTMLElement): Box => ({ x: e.offsetLeft, y: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight });
  const paintLabels = () => {
    const cw = stageBox.clientWidth;
    const ch = stageBox.clientHeight;
    const focus = focusOf();
    for (const l of labels) {
      tmp.copy(l.p.at);
      l.p.obj.localToWorld(tmp);
      tmp.project(camera);
      l.x = ((tmp.x + 1) / 2) * cw;
      l.y = ((1 - tmp.y) / 2) * ch;
      l.z = tmp.z;
      l.on = focus.has(l.p.id);
      if (!l.w || !l.h) {
        l.w = l.t.offsetWidth;
        l.h = l.t.offsetHeight;
      }
    }
    // the step's parts first, then the nearest: a name that cannot find room is left out (never on another)
    const order = [...labels].sort((a, b) => Number(b.on) - Number(a.on) || a.z - b.z);
    const placed: Box[] = [boxOf(cap), boxOf(top)];
    const gap = 4;
    for (const l of order) {
      // the step's parts are always named; « Tous les noms » names the rest
      const off = (!st.labels && !l.on) || l.z > 1 || l.x < 0 || l.y < 0 || l.x > cw || l.y > ch || !shown(l.p.obj);
      let put: Box | null = null;
      if (!off) {
        const pad = l.h * 0.45;
        for (const dy of [0, 1, -1, 2, -2]) {
          const b = { x: l.x + pad, y: l.y - l.h / 2 + dy * (l.h + gap), w: l.w, h: l.h };
          if (b.x + b.w > cw) b.x = l.x - pad - l.w;
          if (b.y < 0 || b.y + b.h > ch) continue;
          if (!placed.some((p) => hit(p, b))) {
            put = b;
            break;
          }
        }
      }
      l.el.style.display = put ? "" : "none";
      l.el.classList.toggle("on", l.on);
      if (!put) continue;
      placed.push(put);
      l.el.style.transform = `translate(${l.x}px, ${l.y}px)`;
      l.t.style.transform = `translate(${put.x - l.x}px, ${put.y - l.y}px)`;
    }
  };
  const frame = (dt: number) => {
    sim.step(dt);
    model.update({
      dt,
      v: sim.v,
      set: sim.set,
      stage: st.stage,
      still: still || !st.playing,
    });
    if (renderer && wSize) renderer.render(scene, camera);
    paintLabels();
    paintCaption();
  };
  const loop = (t: number) => {
    raf = 0;
    if (destroyed) return;
    if (!measure()) {
      // not laid out yet: try again next frame
      raf = requestAnimationFrame(loop);
      return;
    }
    const moving = st.playing && !still;
    const real = last ? Math.min(0.05, (t - last) / 1000) : 0;
    last = t;
    const dt = moving ? real * (st.slow ? 0.2 : 1) : 0;
    if (moving || dirty) {
      dirty = false;
      frame(dt);
      gaugeT += real;
      if (gaugeT > 0.1 || !moving) {
        gaugeT = 0;
        paintGauges();
      }
    }
    if (moving && visible) raf = requestAnimationFrame(loop);
    else last = 0;
  };
  const kick = () => {
    if (destroyed || raf || !visible) return;
    raf = requestAnimationFrame(loop);
  };
  const goStage = (k: number, user: boolean) => {
    st.stage = ((k % nStages) + nStages) % nStages;
    lastShown = -1;
    // a chosen step pauses the engine on it (except the piston's strokes, which play on with the stroke named)
    if (user && !still && !(kind === "piston" && st.stage < 4))
      st.playing = false;
    if (user && kind === "piston" && st.stage < 4 && st.playing) {
      // jump the crank to that stroke so the class sees it now
      st.playing = false;
    }
    if (!st.playing) sim.settle();
    dirty = true;
    paintControls();
    kick();
    if (user) changed();
  };

  // ---- input
  const listen = <K extends keyof HTMLElementEventMap>(
    el: HTMLElement | Document,
    type: K,
    f: (e: HTMLElementEventMap[K]) => void,
    opt?: AddEventListenerOptions,
  ) => {
    el.addEventListener(type, f as EventListener, opt);
    offs.push(() => el.removeEventListener(type, f as EventListener, opt));
  };
  const offs: (() => void)[] = [];
  prev.addEventListener("click", () => goStage(shownStage() - 1, true));
  next.addEventListener("click", () => goStage(shownStage() + 1, true));
  playB.addEventListener("click", () => {
    st.playing = !st.playing;
    if (st.playing && kind === "piston" && st.stage >= 4) st.stage = 0;
    paintControls();
    dirty = true;
    kick();
    changed();
  });
  slowB.addEventListener("click", () => {
    st.slow = !st.slow;
    paintControls();
    changed();
  });
  lbBtn.addEventListener("click", () => {
    st.labels = !st.labels;
    paintControls();
    dirty = true;
    kick();
    changed();
  });
  fsBtn?.addEventListener("click", () => openFullscreen());
  if (!o.inert) {
    // the slide around must not take these (a tap on the slide, the presenter's Space for the next slide)
    for (const t of ["pointerdown", "click", "keydown", "wheel"] as const)
      listen(root, t, (e: Event) => e.stopPropagation());
    const pts = new Map<number, { x: number; y: number }>();
    let pinch0 = 0;
    let r0 = radius;
    listen(canvas, "pointerdown", (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
        r0 = radius;
      }
    });
    listen(canvas, "pointermove", (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 2) {
        p.x = e.clientX;
        p.y = e.clientY;
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) radius = clampR((r0 * pinch0) / Math.max(10, d));
      } else {
        const k = 1 / Math.max(0.2, pxScale);
        yaw -= ((e.clientX - p.x) * 0.008) / k;
        pitch = Math.max(
          -1.2,
          Math.min(1.35, pitch + ((e.clientY - p.y) * 0.008) / k),
        );
        p.x = e.clientX;
        p.y = e.clientY;
      }
      placeCamera();
      dirty = true;
      kick();
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch0 = 0;
    };
    listen(canvas, "pointerup", up);
    listen(canvas, "pointercancel", up);
    if (o.wheelZoom)
      listen(
        canvas,
        "wheel",
        (e) => {
          e.preventDefault();
          radius = clampR(radius * (e.deltaY > 0 ? 1.08 : 1 / 1.08));
          placeCamera();
          dirty = true;
          kick();
        },
        { passive: false },
      );
    listen(canvas, "keydown", (e) => {
      const k = e.key;
      if (k === "ArrowLeft") yaw += 0.12;
      else if (k === "ArrowRight") yaw -= 0.12;
      else if (k === "ArrowUp") pitch = Math.min(1.35, pitch + 0.1);
      else if (k === "ArrowDown") pitch = Math.max(-1.2, pitch - 0.1);
      else if (k === "+" || k === "=") radius = clampR(radius / 1.1);
      else if (k === "-" || k === "_") radius = clampR(radius * 1.1);
      else if (k === " " && !still) {
        playB.click();
        e.preventDefault();
        return;
      } else return;
      e.preventDefault();
      placeCamera();
      dirty = true;
      kick();
    });
  }
  const r0v = model.view.radius;
  const clampR = (r: number) => Math.max(r0v * 0.45, Math.min(r0v * 1.8, r));

  // ---- on screen only
  let io: IntersectionObserver | null = null;
  if (typeof IntersectionObserver === "function") {
    io = new IntersectionObserver((es) => {
      visible = es.some((e) => e.isIntersecting);
      if (visible) {
        dirty = true;
        kick();
      }
    });
    io.observe(root);
  }
  const onVis = () => {
    visible =
      typeof document === "undefined" || document.visibilityState !== "hidden";
    if (visible) kick();
  };
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", onVis);
    offs.push(() => document.removeEventListener("visibilitychange", onVis));
  }
  // a narrow box (a phone): the picture over the panel, the steps and play move down into the panel
  const layoutMode = () => {
    const narrow = root.clientWidth > 0 && root.clientWidth < 760;
    if (narrow === root.classList.contains("narrow")) return;
    root.classList.toggle("narrow", narrow);
    if (narrow) panel.prepend(tr);
    else top.prepend(tr);
    for (const l of labels) l.w = l.h = 0;
  };
  layoutMode();
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver === "function") {
    ro = new ResizeObserver(() => {
      layoutMode();
      dirty = true;
      kick();
    });
    ro.observe(stageBox);
    ro.observe(root);
  }

  // ---- full screen: the same engine, big, in its own layer (Échap closes; the levers come back to the slide)
  let fs: { close(): void } | null = null;
  const openFullscreen = () => {
    if (fs || typeof document === "undefined") return;
    const back = document.activeElement as HTMLElement | null;
    const layer = mk("div", "eng-fs");
    layer.setAttribute("role", "dialog");
    layer.setAttribute("aria-modal", "true");
    layer.setAttribute("aria-label", tl(ENGINE_NAME[kind], lang));
    // the slide's theme colours follow
    try {
      const cs = getComputedStyle(root);
      for (const v of [
        "--sl-font-body",
        "--sl-bg",
        "--sl-text",
        "--sl-accent",
        "--sl-surface",
        "--sl-line",
        "--sl-ink2",
        "--sl-raise",
        "--sl-accentInk",
        "--sl-stop",
        "--sl-key",
      ]) {
        const x = cs.getPropertyValue(v);
        if (x) layer.style.setProperty(v, x.trim());
      }
    } catch {
      /* default colours */
    }
    const head = mk("div", "eng-fs-h");
    const title = mk("h2", "eng-fs-t", tl(ENGINE_NAME[kind], lang));
    const x = btn("eng-btn eng-fs-x", w("close", lang));
    head.append(title, x);
    const body = mk("div", "eng-fs-b");
    layer.append(head, body);
    document.body.append(layer);
    const inner = mountEngine(body, {
      ...o,
      set: st.set,
      stage: st.stage,
      playing: st.playing,
      slow: st.slow,
      labels: st.labels,
      fullscreen: false,
      wheelZoom: true,
      onChange: (s) => {
        handle.set(s);
        changed();
      },
    });
    // pause this one while the big one runs
    const wasVisible = visible;
    visible = false;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Tab") {
        // keep the focus in the layer
        const f = [
          ...layer.querySelectorAll<HTMLElement>(
            "button, input, [tabindex='0']",
          ),
        ].filter((n) => !n.hasAttribute("disabled"));
        if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && i === f.length - 1) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    layer.addEventListener("keydown", key);
    const close = () => {
      if (!fs) return;
      fs = null;
      inner.destroy();
      layer.remove();
      visible = wasVisible;
      dirty = true;
      kick();
      back?.focus?.();
    };
    x.addEventListener("click", close);
    fs = { close };
    x.focus();
  };

  // ---- first paint
  paintControls();
  paintGauges();
  paintCaption();
  dirty = true;
  kick();

  const handle: EngineHandle = {
    el: root,
    get destroyed() {
      return destroyed;
    },
    set(p) {
      if (p.set) {
        sim.setSettings(p.set);
        st.set = sim.set;
      }
      if (p.labels !== undefined) st.labels = p.labels;
      if (p.slow !== undefined) st.slow = p.slow;
      if (p.playing !== undefined) st.playing = !still && p.playing;
      if (p.stage !== undefined && p.stage !== st.stage) {
        st.stage = Math.min(nStages - 1, Math.max(0, Math.round(p.stage)));
        lastShown = -1;
      }
      if (still || !st.playing) sim.settle();
      paintControls();
      paintGauges();
      dirty = true;
      kick();
    },
    state: () => ({ ...st, set: { ...st.set } }),
    resize() {
      dirty = true;
      kick();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      fs?.close();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      io?.disconnect();
      ro?.disconnect();
      for (const f of offs.splice(0)) f();
      scene.remove(model.root);
      disposeTree(model.root, mats);
      scene.clear();
      renderer?.dispose();
      renderer?.forceContextLoss?.();
      root.remove();
    },
  };
  return handle;
}

// ------------------------------------------------------------------ still pictures (thumbnails)
let shot:
  | { r: THREE.WebGLRenderer; canvas: HTMLCanvasElement }
  | null
  | undefined;
const SHOTS = new Map<string, string>();
/**
 * A still picture of an engine (the slide's thumbnails, the studio's cards): one shared offscreen renderer, so a
 * page of thumbnails never opens a WebGL context per card. null when WebGL is not there.
 */
export function engineSnapshot(
  kind: EngineKind,
  stage = 0,
  w = 640,
  h = 360,
): string | null {
  const key = `${kind}:${stage}:${w}x${h}`;
  const hit = SHOTS.get(key);
  if (hit) return hit;
  if (shot === undefined) {
    try {
      const canvas = document.createElement("canvas");
      const r = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      r.outputColorSpace = THREE.SRGBColorSpace;
      shot = { r, canvas };
    } catch {
      shot = null;
    }
  }
  if (!shot) return null;
  const mats = makeMats();
  const model = buildEngineModel(kind, mats);
  const sim = new EngineSim(kind);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x2a3038, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-4, 8, 6);
  scene.add(sun, model.root);
  const cam = new THREE.PerspectiveCamera(32, w / h, 0.5, 100);
  const t = new THREE.Vector3(...model.view.target);
  const { radius, yaw, pitch } = model.view;
  cam.position.set(
    t.x + radius * Math.cos(pitch) * Math.sin(yaw),
    t.y + radius * Math.sin(pitch),
    t.z + radius * Math.cos(pitch) * Math.cos(yaw),
  );
  cam.lookAt(t);
  model.update({ dt: 0, v: sim.v, set: sim.set, stage, still: true });
  shot.r.setPixelRatio(1);
  shot.r.setSize(w, h, false);
  shot.r.setClearColor(0x000000, 0);
  shot.r.render(scene, cam);
  let url: string | null = null;
  try {
    url = shot.canvas.toDataURL("image/png");
  } catch {
    url = null;
  }
  disposeTree(model.root, mats);
  if (url) SHOTS.set(key, url);
  return url;
}
