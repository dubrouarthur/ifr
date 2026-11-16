// Teaser (v2) — a 22-second film for flight instructors, aeroclubs and flight schools: what Wingdeck is, who it is
// for, and its three verbs (Créez, Présentez, Faites voler), drawn by the product itself. window.seek(ms) lays out
// the exact frame for film time ms: every motion below is a function of that time.
//   - the instruments are the app's own renderers (avionics/steam.ts, avionics/pfd.ts through course/stage/views.ts
//     drawFrame) drawing real Sims advanced to that time (flight.ts);
//   - « Créez » is the real course studio (academy.html), running in an iframe and driven step by step: the
//     instrument tile is dragged with the studio's own ghost and dropped, « Explorer » is pressed in its inspector;
//   - the control strip is the slides' own (course/canvas/controlStrip.ts), the library cards carry real thumbnails
//     of the sample courses (course/canvas/render.ts renderThumb).
// render.cjs screenshots each frame.
import { setClock } from "./clock";
import "../../src/styles/course-canvas.css";
import { BRAND } from "../../src/brand";
import { Sim } from "../../src/sim/sim";
import { drawSteamGauge } from "../../src/avionics/steam";
import { drawFrame } from "../../src/course/stage/views";
import {
  gaugeFrame,
  instrumentFrame,
  type PaneFrame,
} from "../../src/course/stage/geometry";
import { ControlStrip, stripPlan } from "../../src/course/canvas/controlStrip";
import { renderThumb } from "../../src/course/canvas/render";
import { SceneSims } from "../../src/course/canvas/instruments";
import { sampleCourse } from "../../src/course/samples";
import { AIRFRAME } from "../../src/sim/aircraft";
import type { StageControl } from "../../src/course/types";
import { Track, sixPackTurn, knobTurn, slideSituation, type Flight } from "./flight";

// ------------------------------------------------------------------ timing (s)
export const DURATION = 23.0;
const T = {
  w: 2.6, // what + who: the mark, the tagline, for whom
  c: 4.9, // 1 · Créez: the studio, its simulator, the cockpit and back
  p: 13.2, // 2 · Présentez: the classroom screen
  f: 15.4, // 3 · Les élèves prennent les commandes: the tablet
  l: 17.5, // the library
  e: 19.5, // the end card
};

// ------------------------------------------------------------------ easing
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const prog = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const outCubic = (x: number) => 1 - (1 - x) ** 3;
const outQuint = (x: number) => 1 - (1 - x) ** 5;
const inCubic = (x: number) => x * x * x;
const inOutCubic = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
const inOutSine = (x: number) => -(Math.cos(Math.PI * x) - 1) / 2;
const outBack = (x: number, s = 1.2) =>
  1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2;

// ------------------------------------------------------------------ dom helpers
const stage = document.getElementById("stage")!;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  parent: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.append(e);
  return e;
}
function place(e: HTMLElement, x: number, y: number, w?: number, h?: number) {
  e.style.left = `${x}px`;
  e.style.top = `${y}px`;
  if (w !== undefined) e.style.width = `${w}px`;
  if (h !== undefined) e.style.height = `${h}px`;
}
function show(e: HTMLElement | SVGElement, opacity: number, transform = "") {
  const s = (e as HTMLElement).style;
  const o = opacity <= 0.001 ? 0 : opacity >= 0.999 ? 1 : opacity;
  s.opacity = String(o);
  s.visibility = o === 0 ? "hidden" : "visible";
  s.transform = transform;
}
/** rise + fade in over [a, b] */
function rise(
  e: HTMLElement,
  t: number,
  a: number,
  b: number,
  dy = 28,
  ease = outCubic,
) {
  const k = ease(prog(t, a, b));
  show(e, k, `translateY(${(1 - k) * dy}px)`);
}
function canvas(
  parent: HTMLElement,
  w: number,
  h: number,
  pw = w,
  ph = h,
): HTMLCanvasElement {
  const c = el("canvas", "", parent);
  c.width = Math.round(pw);
  c.height = Math.round(ph);
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  return c;
}
/** draw an instrument pane (its source rectangle onto the whole canvas) */
function paint(c: HTMLCanvasElement, f: Flight, frame: PaneFrame, dt: number) {
  const ctx = c.getContext("2d")!;
  const [x, y, w, h] = frame.rect;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  const sx = c.width / w;
  const sy = c.height / h;
  ctx.setTransform(sx, 0, 0, sy, -x * sx, -y * sy);
  drawFrame(ctx, f.sim, frame, f.st, dt, { lang: "fr" });
}
const frDec = (n: number, d = 1) => n.toFixed(d).replace(".", ",");
const frInt = (n: number) =>
  String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

// ------------------------------------------------------------------ the logo (public/logo.svg, in parts)
const SVGNS = "http://www.w3.org/2000/svg";
interface Mark {
  svg: SVGSVGElement;
  /** p 0..1: the horizon draws, the runway rises, the flight-director chevron draws */
  build(p: number): void;
}
let markN = 0;
function mark(parent: HTMLElement, size: number): Mark {
  const id = `g${markN++}`;
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.classList.add("mark");
  svg.innerHTML = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14467f"/><stop offset="1" stop-color="#0a2547"/></linearGradient>
    <clipPath id="${id}c"><rect width="64" height="64" rx="15"/></clipPath></defs>
    <rect width="64" height="64" rx="15" fill="url(#${id})"/>
    <g clip-path="url(#${id}c)">
    <path class="hz" d="M8 30.5h48" stroke="#ffffff" stroke-opacity=".35" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="48 48"/>
    <g class="rw"><path d="M29.2 33h5.6l7.4 23H21.8z" fill="#ffffff"/>
    <path d="M32 37v3.2M32 43.5v4M32 51v3.5" stroke="#0a2547" stroke-width="1.5" stroke-linecap="round"/></g>
    <path class="fd" d="M17 24.5l15-7 15 7" fill="none" stroke="#7cc4ff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="34 34"/>
    </g>`;
  parent.append(svg);
  const hz = svg.querySelector(".hz") as SVGPathElement;
  const rw = svg.querySelector(".rw") as SVGGElement;
  const fd = svg.querySelector(".fd") as SVGPathElement;
  return {
    svg,
    build(p) {
      const a = outCubic(prog(p, 0, 0.5));
      hz.setAttribute("stroke-dashoffset", String(48 * (1 - a)));
      const b = outCubic(prog(p, 0.2, 0.75));
      rw.setAttribute("transform", `translate(0 ${(1 - b) * 26})`);
      rw.setAttribute("opacity", String(b));
      const c = outCubic(prog(p, 0.45, 1));
      fd.setAttribute("stroke-dashoffset", String(34 * (1 - c)));
      fd.setAttribute("opacity", c > 0 ? "1" : "0");
    },
  };
}
function wordmark(
  parent: HTMLElement,
  size: number,
): { el: HTMLElement; letters: HTMLElement[] } {
  const w = el("div", "word", parent);
  w.style.fontSize = `${size}px`;
  const letters = [...BRAND.name].map((ch) => el("span", "", w, ch));
  return { el: w, letters };
}
function letterIn(
  letters: HTMLElement[],
  t: number,
  a: number,
  step: number,
  dur: number,
  dy: number,
) {
  letters.forEach((l, i) => {
    const k = outCubic(prog(t, a + i * step, a + i * step + dur));
    show(l, k, `translateY(${(1 - k) * dy}px)`);
  });
}
/** words that rise one after the other */
function words(parent: HTMLElement, text: string, cls = "w"): HTMLElement[] {
  return text.split(" ").map((w, i) => {
    const s = el("span", cls, parent, w);
    if (i) s.style.marginLeft = "0.26em";
    return s;
  });
}
function wordsIn(
  ws: HTMLElement[],
  t: number,
  a: number,
  step: number,
  dur: number,
  dy: number,
) {
  ws.forEach((w, i) => {
    const k = outCubic(prog(t, a + i * step, a + i * step + dur));
    show(w, k, `translateY(${(1 - k) * dy}px)`);
  });
}

// ------------------------------------------------------------------ the numbered captions (shots C, P, F)
function caption(n: number, text: string) {
  const c = el("div", "cap", stage);
  el("span", "cap-n", c, String(n));
  el("span", "cap-t", c, text);
  return c;
}

// ================================================================== H: the hook — a handout comes alive
const LH = el("div", "layer", stage);
el("div", "wash", LH);
const hookTitle = el("div", "abs hook", LH);
place(hookTitle, 120, 372);
const hook1 = el("div", "", hookTitle);
const hook2 = el("div", "", hookTitle);
const hookW = [
  ...words(hook1, "Vos cours de pilotage,"),
  ...words(hook2, "enfin vivants."),
];
hookW[hookW.length - 1].classList.add("acc");
const hookSub = el(
  "div",
  "abs hook-sub",
  LH,
  "Les instruments de vos diapositives prennent vie.",
);
place(hookSub, 136, 620);
// the page of a handout: grey lines of text and a printed figure of the airspeed indicator
const SHEET = { x: 1196, y: 150, w: 640, h: 790 };
const sheet = el("div", "sheet", LH);
place(sheet, SHEET.x, SHEET.y, SHEET.w, SHEET.h);
sheet.style.transformOrigin = "50% 50%";
for (const [y, w, h] of [
  [56, 300, 22],
  [100, 520, 12],
  [124, 470, 12],
  [148, 500, 12],
  [696, 520, 12],
  [720, 430, 12],
] as const) {
  const b = el("div", "bar", sheet);
  place(b, 60, y, w, h);
  if (h > 20) b.classList.add("bar-h");
}
const FIG = { cx: 320, cy: 418, d: 440 };
const figCap = el("div", "abs fig-cap", sheet, "Fig. 3 — L’anémomètre");
place(figCap, 0, 650, SHEET.w);
const fig = document.createElementNS(SVGNS, "svg");
fig.setAttribute("viewBox", "-230 -230 460 460");
fig.setAttribute("width", String(FIG.d));
fig.setAttribute("height", String(FIG.d));
fig.style.position = "absolute";
fig.style.left = `${FIG.cx - FIG.d / 2}px`;
fig.style.top = `${FIG.cy - FIG.d / 2}px`;
sheet.append(fig);
{
  // the same scale as the live gauge (avionics/steam.ts asi), printed in line work
  const R = 200;
  const ang = (k: number) => {
    const deg =
      k < 40
        ? (Math.max(0, k) / 40) * 30
        : 30 + ((Math.min(210, k) - 40) / 160) * 300;
    return ((-90 + deg) * Math.PI) / 180;
  };
  const arc = (r: number, a: number, b: number, w: number, dash = "") => {
    const x0 = Math.cos(ang(a)) * r;
    const y0 = Math.sin(ang(a)) * r;
    const x1 = Math.cos(ang(b)) * r;
    const y1 = Math.sin(ang(b)) * r;
    const large = ang(b) - ang(a) > Math.PI ? 1 : 0;
    return `<path d="M${x0} ${y0}A${r} ${r} 0 ${large} 1 ${x1} ${y1}" fill="none" stroke="#7b8590" stroke-width="${w}" ${dash}/>`;
  };
  let s = `<circle r="${R + 18}" fill="none" stroke="#55606b" stroke-width="3"/>`;
  s += arc(R - 22, AIRFRAME.vso, AIRFRAME.vfe, 3, 'stroke-dasharray="3 5"');
  s += arc(R - 8, AIRFRAME.vs1, AIRFRAME.vno, 6);
  s += arc(R - 8, AIRFRAME.vno, AIRFRAME.vne, 6, 'stroke-dasharray="10 6"');
  for (let k = 40; k <= 200; k += 5) {
    const major = k % 20 === 0;
    const a = ang(k);
    const r0 = R - (major ? 34 : k % 10 === 0 ? 28 : 22);
    const r1 = R - 14;
    s += `<line x1="${Math.cos(a) * r0}" y1="${Math.sin(a) * r0}" x2="${Math.cos(a) * r1}" y2="${Math.sin(a) * r1}" stroke="#55606b" stroke-width="${major ? 3 : 1.6}"/>`;
    if (major)
      s += `<text x="${Math.cos(a) * (R - 62)}" y="${Math.sin(a) * (R - 62) + 9}" text-anchor="middle" font-size="26" font-weight="600" fill="#55606b">${k}</text>`;
  }
  s += `<text y="-46" text-anchor="middle" font-size="15" letter-spacing="2" fill="#7b8590">NŒUDS</text>`;
  s += `<line x1="0" y1="18" x2="0" y2="${-R + 30}" stroke="#3a434d" stroke-width="5" stroke-linecap="round"/><circle r="10" fill="#3a434d"/>`;
  fig.innerHTML = s;
}
// the live gauge: the app's own airspeed indicator, opening over the figure
const asiBox = el("div", "abs", sheet);
place(asiBox, FIG.cx - FIG.d / 2, FIG.cy - FIG.d / 2, FIG.d, FIG.d);
const asiCv = canvas(asiBox, FIG.d, FIG.d, FIG.d * 1.4, FIG.d * 1.4);
const asiSim = new Sim();
function asiKt(t: number): number {
  const up = inOutCubic(prog(t, 1.3, 2.15));
  const settle = outCubic(prog(t, 2.15, 2.6));
  return lerp(0, 152, up) + (112 - 152) * settle;
}
function hook(t: number) {
  const out = inOutCubic(prog(t, 2.55, 3.0));
  show(LH, t < 3.1 ? 1 : 0);
  if (t >= 3.1) return;
  wordsIn(hookW, t, 0.12, 0.09, 0.55, 46);
  hookTitle.style.opacity = String(1 - out);
  hookTitle.style.transform = `translateY(${-out * 40}px)`;
  const sub = outCubic(prog(t, 0.75, 1.2)) * (1 - out);
  show(
    hookSub,
    sub,
    `translateY(${(1 - outCubic(prog(t, 0.75, 1.2))) * 20 - out * 40}px)`,
  );
  // the handout: lands slightly askew, straightens as it comes alive
  const inK = outCubic(prog(t, 0.0, 0.6));
  const alive = inOutCubic(prog(t, 0.95, 1.65));
  const rot = lerp(-3, 0, alive);
  show(
    sheet,
    prog(t, 0, 0.35) * (1 - prog(t, 2.65, 2.95)),
    `translateY(${(1 - inK) * 50}px) rotate(${rot}deg)`,
  );
  show(fig, 1 - prog(t, 1.35, 1.75));
  const iris = outCubic(prog(t, 1.0, 1.6));
  const shrink = inOutCubic(prog(t, 2.6, 3.0));
  show(
    asiBox,
    iris > 0 ? 1 - prog(t, 2.8, 3.0) : 0,
    `scale(${lerp(1, 0.38, shrink)})`,
  );
  if (iris > 0 && t < 3.0) {
    asiSim.ac.data.iasKt = asiKt(t);
    const c = asiCv.getContext("2d")!;
    const P = asiCv.width;
    const C = P / 2;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, P, P);
    const r = P / 2 / 1.12;
    c.save();
    c.beginPath();
    c.arc(C, C, r * 1.1 * iris, 0, Math.PI * 2);
    c.clip();
    drawSteamGauge(c, asiSim, "asi", C, C, r);
    c.restore();
  }
  // the page fades from under the gauge as it shrinks into the mark
  sheet.classList.toggle("lit", alive > 0.5);
}

// ================================================================== W: what it is, who it is for
const LW = el("div", "layer", stage);
const lockW = el("div", "lockup", LW);
const markW = mark(lockW, 168);
const wordW = wordmark(lockW, 128);
const tagW = el("div", "abs tagline", LW, BRAND.tagline.fr);
const whoW = el(
  "div",
  "abs who",
  LW,
  "Pour les instructeurs, les aéroclubs et les écoles de pilotage",
);
let wordWW = 560;
let tagWW = 900;
let whoWW = 1000;
function what(t: number) {
  const y = t - T.w;
  const out = inOutCubic(prog(t, T.c - 0.05, T.c + 0.3));
  const vis = y > 0 && t < T.c + 0.35;
  show(LW, vis ? 1 - out : 0, `translateY(${-out * 40}px)`);
  if (!vis) return;
  // the mark takes the gauge's place (the gauge's centre on the page), then glides to the lockup
  const gx = SHEET.x + FIG.cx;
  const gy = SHEET.y + FIG.cy;
  const total = 168 + 40 + wordWW;
  const lx = 960 - total / 2 + 84;
  const ly = 440;
  const go = inOutCubic(prog(y, 0.38, 0.95));
  const cx = lerp(gx, lx, go);
  const cy = lerp(gy, ly, go);
  place(lockW, cx - 84, cy - 84);
  const mIn = outBack(prog(y, 0.2, 0.55), 1.0);
  show(markW.svg, prog(y, 0.2, 0.36), `scale(${lerp(0.55, 1, mIn)})`);
  markW.build(prog(y, 0.3, 0.85));
  letterIn(wordW.letters, y, 0.62, 0.035, 0.38, 34);
  place(tagW, 960 - tagWW / 2, 586);
  rise(tagW, y, 0.95, 1.4, 22);
  place(whoW, 960 - whoWW / 2, 664);
  rise(whoW, y, 1.2, 1.65, 18);
}

// ================================================================== C: « Créez » — the real course studio, and its simulator
const LC = el("div", "layer", stage);
const WIN = { x: 173, y: 134, k: 0.82, chrome: 40 };
const win = el("div", "win", LC);
win.style.transformOrigin = "0 0";
const winIn = el("div", "abs", win);
place(winIn, 0, 0, 1920, 1080 + WIN.chrome);
const chrome = el("div", "win-chrome", winIn);
for (let i = 0; i < 3; i++) el("span", "", chrome);
el("div", "win-url", chrome, "Wingdeck · Studio");
const frame = el("iframe", "studio", winIn);
place(frame, 0, WIN.chrome, 1920, 1080);
const cursor = el("div", "cursor", winIn);
cursor.innerHTML = `<svg viewBox="0 0 32 32" width="44" height="44"><path d="M6 3l0 22 6-5.5 4 9 4-1.8-4-8.8 8.2-.4z" fill="#fff" stroke="#0f1722" stroke-width="2" stroke-linejoin="round"/></svg>`;
const cursorRing = el("div", "cursor-ring", winIn);
const cap1 = caption(1, "Créez vos cours avec de vrais instruments");
const cap1b = caption(1, "L’éditeur de diapos et le simulateur ne font qu’un");
/** the studio, measured once it is ready (iframe CSS px) */
const S = {
  ready: false,
  drop: { x: 1265, y: 500, w: 470, h: 352 },
  doc: null as Document | null,
  ghost: null as HTMLElement | null,
  done: new Set<string>(),
  /** where the cursor pressed last (iframe px) */
  press: { x: 0, y: 0 },
};
const SIT = { cap: [120, 200] as const, bank: [0, 20] as const };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<X>(f: () => X | null | undefined | false, ms = 30000): Promise<X> {
  const t0 = Date.now();
  for (;;) {
    const v = f();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("studio: timed out");
    await sleep(100);
  }
}
const byText = (d: Document, sel: string, re: RegExp) =>
  [...d.querySelectorAll<HTMLElement>(sel)].find((e) => re.test((e.textContent ?? "").trim()) && e.offsetParent);
const bigInstrument = (d: Document) =>
  [...d.querySelectorAll<HTMLElement>(".sle-canvas .sl-b.sl-instrument, .ce-stage .sl-b.sl-instrument, .sl-b.sl-instrument")].find(
    (e) => e.getBoundingClientRect().width > 200,
  );
const railSim = (d: Document) => byText(d, ".ce-rail-b", /Simulateur/);
const liveTile = (d: Document) => byText(d, "button.sim-add-b", /^Instrument vivant/);
const changeSit = (d: Document) => byText(d, "summary, button, .ce-fold-h, [aria-expanded]", /^Changer la situation de vol$/);
const slider = (d: Document, name: string) =>
  [...d.querySelectorAll<HTMLInputElement>(".sim-way input[type=range]")].find((e) => e.getAttribute("aria-label") === name);
const flyTab = (d: Document) => d.querySelector<HTMLElement>(".sim-ways button[data-way=fly]");
const flyBtn = (d: Document) => d.querySelector<HTMLElement>(".sim-way button.sim-fly");
/** the panel's scrolling box (the Simulateur panel) */
const panelBox = (d: Document) => {
  let e: HTMLElement | null = liveTile(d) ?? null;
  while (e && !(e.scrollHeight > e.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(e).overflowY))) e = e.parentElement;
  return e;
};
const centre = (e: Element | null | undefined) => {
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
};
async function setupStudio() {
  try {
    localStorage.setItem("ifr.lang", "fr");
  } catch {
    /* private mode */
  }
  frame.src = "/academy.html#new";
  await new Promise((r) => frame.addEventListener("load", r, { once: true }));
  const d = frame.contentDocument!;
  S.doc = d;
  (await until(() => byText(d, "*", /^Lire un instrument$/))).click();
  await sleep(300);
  (await until(() => byText(d, "button", /^Créer le cours/))).click();
  await until(() => d.querySelector(".ce-rail-b"));
  await sleep(2000);
  // the template's slide, without its instrument: the author adds one in the film
  (await until(() => byText(d, ".ce-layer", /^Instrument/))).click();
  await sleep(500);
  (await until(() => d.querySelector<HTMLElement>('button[aria-label="Supprimer"]'))).click();
  await sleep(600);
  // the properties column folded: the slide and the Simulateur panel are the story
  d.querySelector<HTMLElement>(".ce-insp-t.on")?.click();
  await sleep(600);
  // a rehearsal: where the studio puts the live instrument; then undo it and close the panel
  (await until(() => railSim(d))).click();
  await sleep(800);
  (await until(() => liveTile(d))).click();
  await sleep(1200);
  const blk = await until(() => bigInstrument(d));
  // the instrument's own picture (its canvas), so the cockpit's display lands exactly on it
  const br = (blk.querySelector("canvas") ?? blk).getBoundingClientRect();
  S.drop = { x: br.left + br.width / 2, y: br.top + br.height / 2, w: br.width, h: br.height };
  d.querySelector<HTMLElement>(".ce-undo")!.click();
  await sleep(900);
  if (bigInstrument(d)) throw new Error("studio: the rehearsal was not undone");
  railSim(d)?.click();
  await sleep(500);
  d.querySelector<HTMLElement>(".ce-panel-x")?.click();
  await sleep(500);
  if (d.activeElement instanceof HTMLElement) d.activeElement.blur();
  S.ready = true;
}
function cursorAt(x: number, y: number, press: number, op: number) {
  place(cursor, x - 6, y - 4 + WIN.chrome);
  cursor.style.transformOrigin = "6px 4px";
  show(cursor, op, `scale(${lerp(1, 0.86, press)})`);
}
/** the window's transform: at rest, or carrying the slide's instrument onto the cockpit's display */
function winTransform(bridge: number, inK: number, out: number) {
  const k = WIN.k * lerp(1, 0.97, out);
  let tx = WIN.x;
  let ty = WIN.y + (1 - inK) * 70;
  let s = k;
  if (bridge > 0) {
    // the slide's PFD (iframe px) → the cockpit's PFD (stage px)
    const sx = COCK.pfd.w / S.drop.w;
    const ex = COCK.pfd.x + COCK.pfd.w / 2 - S.drop.x * sx;
    const ey = COCK.pfd.y + COCK.pfd.h / 2 - (S.drop.y + WIN.chrome) * sx;
    s = Math.exp(lerp(Math.log(k), Math.log(sx), bridge));
    tx = lerp(tx, ex, bridge);
    ty = lerp(ty, ey, bridge);
  }
  win.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
}
function creez(t: number) {
  const c = t - T.c;
  const out = inOutCubic(prog(t, T.p - 0.3, T.p + 0.05));
  const vis = c > -0.02 && t < T.p + 0.25;
  show(LC, vis ? 1 - out : 0);
  rise(cap1, c, 0.2, 0.6, 16);
  if (c > 5.4) show(cap1, 1 - prog(c, 5.4, 5.6));
  rise(cap1b, c, 5.55, 5.95, 16);
  if (t > T.p - 0.15) show(cap1b, 1 - prog(t, T.p - 0.15, T.p + 0.05));
  if (!vis) return;
  const inK = outCubic(prog(c, 0, 0.55));
  // into the cockpit and back: 6.0 → 6.6 the window carries the slide's PFD onto the cockpit's, 7.6 → 8.1 back
  const bridge = Math.max(inOutCubic(prog(c, 6.0, 6.6)) * (1 - inOutCubic(prog(c, 7.6, 8.1))), 0);
  winTransform(bridge, inK, out);
  win.style.opacity = String(prog(c, 0, 0.35));
  const d = S.doc;
  if (!S.ready || !d) return;
  const once = (k: string, at: number, f: () => void) => {
    if (c >= at && !S.done.has(k)) {
      S.done.add(k);
      f();
    }
  };
  // the targets, read from the studio as it is now
  const pRail = centre(railSim(d)) ?? { x: 41, y: 290 };
  const pTile = centre(liveTile(d)) ?? { x: 176, y: 230 };
  const pChange = centre(changeSit(d)) ?? { x: 200, y: 730 };
  const cap = slider(d, "Cap");
  const bank = slider(d, "Inclinaison");
  const thumb = (r: HTMLInputElement | undefined, v: number) => {
    if (!r) return { x: 250, y: 600 };
    const b = r.getBoundingClientRect();
    const k = (v - Number(r.min)) / (Number(r.max) - Number(r.min));
    return { x: b.left + 13 + k * (b.width - 26), y: b.top + b.height / 2 };
  };
  const capV = lerp(SIT.cap[0], SIT.cap[1], inOutSine(prog(c, 3.3, 4.2)));
  const bankV = lerp(SIT.bank[0], SIT.bank[1], inOutSine(prog(c, 4.55, 5.2)));
  const pCap = thumb(cap, capV);
  const pBank = thumb(bank, bankV);
  const pFly = centre(flyTab(d)) ?? { x: 255, y: 920 };
  const pOpen = centre(flyBtn(d)) ?? { x: 280, y: 850 };
  // the cursor's path, leg by leg
  const legs: [number, number, { x: number; y: number }][] = [
    [0.35, 0.75, pRail],
    [0.9, 1.25, pTile],
    [1.35, 2.0, S.drop],
    [2.15, 2.5, pChange],
    [3.0, 3.28, thumb(cap, SIT.cap[0])],
    [4.3, 4.52, thumb(bank, SIT.bank[0])],
    [5.3, 5.55, pFly],
    [5.65, 5.9, pOpen],
  ];
  let pos = { x: 980, y: 1160 };
  for (const [a, b, p] of legs) {
    if (c < a) break;
    const k = inOutCubic(prog(c, a, b));
    const lift = a === 1.35 ? Math.sin(Math.PI * k) * 60 : 0;
    pos = { x: lerp(pos.x, p.x, k), y: lerp(pos.y, p.y, k) - lift };
  }
  if (c >= 3.3 && c < 4.3) pos = pCap;
  if (c >= 4.55 && c < 5.3) pos = pBank;
  const pressAt = (a: number, b: number) => prog(c, a, a + 0.06) * (1 - prog(c, b, b + 0.06));
  const press = Math.max(
    pressAt(0.78, 0.84),
    pressAt(1.28, 2.0),
    pressAt(2.52, 2.58),
    pressAt(3.28, 4.22),
    pressAt(4.53, 5.22),
    pressAt(5.57, 5.63),
    pressAt(5.92, 6.0),
  );
  cursorAt(pos.x, pos.y, press, prog(c, 0.3, 0.45) * (1 - prog(c, 5.95, 6.15)));
  // a ring where the cursor clicks
  const clicks = [0.8, 2.02, 2.55, 5.6, 5.95];
  let rk = 0;
  let rp = pos;
  for (const a of clicks)
    if (c >= a && c < a + 0.45) {
      rk = prog(c, a, a + 0.45);
      rp = a === 2.02 ? S.drop : pos;
    }
  const rr = lerp(10, 46, outCubic(rk));
  place(cursorRing, rp.x - rr, rp.y + WIN.chrome - rr, 2 * rr, 2 * rr);
  show(cursorRing, rk > 0 && rk < 1 ? (1 - rk) * 0.9 : 0);
  // the actions, in the real studio
  once("rail", 0.8, () => railSim(d)?.click());
  once("ghost", 1.32, () => {
    const g = d.createElement("div");
    g.className = "sle-ghost over";
    const art = liveTile(d)?.firstElementChild;
    if (art) {
      const a = art.cloneNode(true) as HTMLElement;
      a.style.width = "100%";
      g.append(a);
    }
    d.body.append(g);
    S.ghost = g;
  });
  if (S.ghost) {
    S.ghost.style.left = `${pos.x}px`;
    S.ghost.style.top = `${pos.y}px`;
  }
  once("drop", 2.02, () => {
    S.ghost?.remove();
    S.ghost = null;
    liveTile(d)?.click();
  });
  once("change", 2.55, () => changeSit(d)?.click());
  // the panel scrolls: down to the sliders, back up to « Voler et capturer », then to its button
  const box = panelBox(d);
  const scrollPhase = (key: string, a: number, b: number, target: () => number | null) => {
    if (!box || c < a) return;
    const memo = S as unknown as Record<string, number>;
    if (memo[key + "0"] === undefined) {
      const tg = target();
      memo[key + "0"] = box.scrollTop;
      memo[key + "1"] = tg === null ? box.scrollTop : Math.max(0, box.scrollTop + tg);
    }
    if (c <= b + 0.1) box.scrollTop = lerp(memo[key + "0"], memo[key + "1"], inOutCubic(prog(c, a, b)));
  };
  scrollPhase("sA", 2.62, 3.0, () => {
    const e = slider(d, "Cap");
    return e ? e.getBoundingClientRect().top - 520 : null;
  });
  scrollPhase("sB", 5.22, 5.5, () => {
    const e = flyTab(d);
    return e ? e.getBoundingClientRect().top - 600 : null;
  });
  scrollPhase("sC", 5.64, 5.84, () => {
    const e = flyBtn(d);
    if (!e) return null;
    const top = e.getBoundingClientRect().top;
    return top > 860 ? top - 860 : 0;
  });
  const drive = (r: HTMLInputElement | undefined, v: number, key: string, a: number, b: number) => {
    if (!r || c < a) return;
    const vv = String(Math.round(v));
    if (c <= b + 0.05 && r.value !== vv) {
      r.value = vv;
      r.dispatchEvent(new Event("input", { bubbles: true }));
    }
    once(key, b + 0.05, () => r.dispatchEvent(new Event("change", { bubbles: true })));
  };
  drive(cap, capV, "capDone", 3.3, 4.2);
  drive(bank, bankV, "bankDone", 4.55, 5.2);
  once("fly", 5.6, () => flyTab(d)?.click());
}

// ---------------------------------------------------------------- the cockpit: the slide's situation, flying
const LK = el("div", "layer dark", stage);
const COCK = {
  pfd: { x: 64, y: 196, w: 880, h: 660 },
  mfd: { x: 976, y: 196, w: 880, h: 660 },
};
function display(r: { x: number; y: number; w: number; h: number }) {
  const b = el("div", "bezel", LK);
  place(b, r.x - 14, r.y - 14, r.w + 28, r.h + 28);
  const box = el("div", "abs", b);
  place(box, 14, 14, r.w, r.h);
  box.style.borderRadius = "8px";
  box.style.overflow = "hidden";
  return { b, cv: canvas(box, r.w, r.h) };
}
const ckPfd = display(COCK.pfd);
const ckMfd = display(COCK.mfd);
const ckLabel = el("div", "abs ck-label", LK);
el("div", "ck-eyebrow", ckLabel, "Simulateur intégré");
el("div", "ck-sub", ckLabel, "La situation de la diapo, en vol. Puis retour à la diapo.");
place(ckLabel, 64, 908);
const PFD_FRAME = instrumentFrame({ kind: "pfd" });
const MFD_FRAME = instrumentFrame({ kind: "mfd" });
const ckFlight = new Track(slideSituation(SIT.cap[1], SIT.bank[1]));
let ckLast = 0;
function cockpit(t: number) {
  const c = t - T.c;
  const vis = c > 6.25 && c < 8.0;
  const bg = prog(c, 6.25, 6.55) * (1 - prog(c, 7.62, 7.95));
  show(LK, vis ? bg : 0);
  if (!vis) return;
  show(ckPfd.b, prog(c, 6.48, 6.6) * (1 - prog(c, 7.6, 7.7)));
  const m = outCubic(prog(c, 6.55, 7.0));
  show(ckMfd.b, m * (1 - prog(c, 7.45, 7.62)), `translateX(${(1 - m) * 120}px)`);
  const l = outCubic(prog(c, 6.75, 7.1));
  show(ckLabel, l * (1 - prog(c, 7.45, 7.6)), `translateY(${(1 - l) * 16}px)`);
  const w = Math.max(0, c - 6.0);
  const f = ckFlight.at(w);
  const dt = Math.max(0, w - ckLast);
  paint(ckPfd.cv, f, PFD_FRAME, Math.min(0.1, dt));
  paint(ckMfd.cv, f, MFD_FRAME, 0);
  ckLast = w;
}

// ================================================================== slides shown in the film (P and F)
const L2 = el("div", "layer", stage);
// P: the classroom
const room = el("div", "layer room", L2);
const screenCase = el("div", "screen-case", room);
const SCREEN = { x: 288, y: 132, w: 1344, h: 756 };
place(screenCase, SCREEN.x - 40, SCREEN.y - 34, SCREEN.w + 80, 22);
const screen = el("div", "screen", room);
place(screen, SCREEN.x - 10, SCREEN.y - 10, SCREEN.w + 20, SCREEN.h + 20);
const card2 = el("div", "card flat", room);
const audience = document.createElementNS(SVGNS, "svg");
audience.setAttribute("viewBox", "0 0 1920 260");
audience.setAttribute("width", "1920");
audience.setAttribute("height", "260");
audience.style.position = "absolute";
audience.style.left = "0";
audience.style.top = "820px";
room.append(audience);
{
  let s = `<defs><linearGradient id="aud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a313a"/><stop offset="1" stop-color="#161b21"/></linearGradient></defs>`;
  const seats: [number, number, number][] = [
    [150, 120, 1],
    [430, 96, 0.94],
    [700, 132, 1.04],
    [990, 104, 0.96],
    [1270, 128, 1.02],
    [1540, 100, 0.95],
    [1800, 126, 1],
  ];
  for (const [x, y, k] of seats) {
    s += `<g transform="translate(${x} ${y}) scale(${k})" fill="url(#aud)"><ellipse cx="0" cy="190" rx="140" ry="120"/><circle cx="0" cy="40" r="56"/></g>`;
  }
  audience.innerHTML = s;
}
const cap2 = caption(2, "Présentez en classe : les instruments bougent");
// F: the tablet
const tablet = el("div", "tablet", L2);
const TAB = { x: 232, y: 150, w: 1456, bezel: 40 };
const TAB_S = (TAB.w - 2 * TAB.bezel) / 1920;
const TAB_H = 1080 * TAB_S + 2 * TAB.bezel;
place(tablet, TAB.x, TAB.y, TAB.w, TAB_H);
el("div", "tablet-cam", tablet);
const tabScreen = el("div", "tablet-screen", tablet);
place(tabScreen, TAB.bezel, TAB.bezel, TAB.w - 2 * TAB.bezel, 1080 * TAB_S);
const card3 = el("div", "card flat", tabScreen);
const cap3 = caption(
  3,
  "Vos élèves prennent les commandes, sur la diapo",
);

// ---------------------------------------------------------------- the projected slide: a live six-pack, a turn
const s2 = {
  eyebrow: el("div", "abs eyebrow", card2, "Pilotage aux instruments"),
  title: el("div", "abs title", card2, "Le virage au taux standard"),
  lead: el(
    "div",
    "abs lead",
    card2,
    "Inclinez, la bille au centre : le cap tourne de 3° par seconde.",
  ),
  facts: el("div", "facts", card2),
  inst: el("div", "inst", card2),
};
place(s2.eyebrow, 128, 112);
place(s2.title, 128, 156);
place(s2.lead, 128, 316, 640);
place(s2.facts, 128, 590, 620);
const SIX = { x: 872, y: 304, w: 920, h: 690 };
place(s2.inst, SIX.x, SIX.y, SIX.w, SIX.h);
const sixCv = canvas(s2.inst, SIX.w, SIX.h);
const SIX_FRAME = instrumentFrame({ kind: "six" });
const sixK = SIX.w / 1024;
function gaugeRing(parent: HTMLElement, cx: number, cy: number, r: number) {
  const g = el("div", "ring", parent);
  const R = r * sixK;
  place(g, cx * sixK - R, cy * sixK - R, 2 * R, 2 * R);
  return g;
}
const TICK = `<svg class="tick" viewBox="0 0 44 44"><circle cx="22" cy="22" r="22" fill="#17763c"/><path d="M13 22.5l6 6 12-13" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
function fact(label: string) {
  const f = el("div", "fact", s2.facts);
  f.innerHTML = TICK;
  el("div", "lab", f, label);
  const v = el("div", "val", f);
  return { f, v };
}
const facts = {
  alt: { ...fact("Altitude tenue"), ring: gaugeRing(s2.inst, 848, 236, 152) },
  bank: { ...fact("Inclinaison"), ring: gaugeRing(s2.inst, 512, 236, 152) },
  rate: { ...fact("Taux standard"), ring: gaugeRing(s2.inst, 176, 578, 152) },
};
// the flight: the autopilot rolls into a standard-rate turn; time-lapsed a little (×2.3) to fit the shot
const TURN_RATE = 2.3;
const turnSpec = { ...sixPackTurn(0.6), rate: TURN_RATE };
const turn = new Track(turnSpec);
/** when the needles reach the values the facts name (found once by flying the shot) */
const when = { alt: 0.35, bank: 99, rate: 99, rollMax: 0 };
{
  const probe = new Track(turnSpec);
  let rollMax = 0;
  for (let u = 0; u <= 4.2; u += 1 / 60)
    rollMax = Math.max(rollMax, probe.at(u).sim.ac.data.rollDeg);
  when.rollMax = rollMax;
  probe.reset();
  for (let u = 0; u <= 4.2; u += 1 / 60) {
    const d = probe.at(u).sim.ac.data;
    if (when.bank === 99 && d.rollDeg >= rollMax - 1.2) when.bank = u;
    if (when.rate === 99 && d.turnRateDps >= 2.85) when.rate = u;
  }
  when.rate = Math.max(when.rate, when.bank + 0.3);
}
let sixDrawnAt = -1;
function present(t: number) {
  const p = t - T.p;
  // the slide was already running when the camera arrives: its flight is 1.1 s in
  const u = p + 1.1;
  const inK = outCubic(prog(p, 0, 0.6));
  const out = inOutCubic(prog(t, T.f - 0.1, T.f + 0.3));
  const vis = p > -0.1 && t < T.f + 0.35;
  show(room, vis ? prog(p, -0.1, 0.3) * (1 - out) : 0);
  rise(cap2, p, 0.15, 0.55, 16);
  if (t > T.f - 0.15) show(cap2, 1 - prog(t, T.f - 0.15, T.f + 0.05));
  if (!vis) return;
  // the camera settles on the screen
  const z = lerp(1.06, 1, inK);
  room.style.transformOrigin = "960px 510px";
  room.style.transform = `scale(${z})`;
  card2.style.transform = `translate(${SCREEN.x}px, ${SCREEN.y}px) scale(${SCREEN.w / 1920})`;
  const f = turn.at(Math.max(0, u));
  const d = f.sim.ac.data;
  if (sixDrawnAt !== u) {
    paint(sixCv, f, SIX_FRAME, 0);
    sixDrawnAt = u;
  }
  const lit = (x: typeof facts.alt, at: number, value: string) => {
    const kk = outCubic(prog(u, at, at + 0.4));
    show(x.f, kk, `translateX(${(1 - kk) * -24}px)`);
    x.v.textContent = value;
    const rr = prog(u, at, at + 0.3);
    const fade = 1 - 0.65 * prog(u, at + 0.7, at + 1.3);
    show(x.ring, rr * fade, `scale(${lerp(1.12, 1, outCubic(rr))})`);
  };
  lit(facts.alt, when.alt, `${frInt(Math.round(d.altFt / 10) * 10)} ft`);
  lit(facts.bank, when.bank, `${Math.round(d.rollDeg)}°`);
  lit(facts.rate, when.rate, `${frDec(Math.min(3, d.turnRateDps))}°/s`);
}

// ---------------------------------------------------------------- the slide on the tablet: the heading knob
const s3 = {
  eyebrow: el("div", "abs eyebrow", card3, "À vous"),
  title: el("div", "abs title", card3, "Prenez le cap 150"),
  lead: el(
    "div",
    "abs lead",
    card3,
    "Tournez le bouton de cap : le pilote automatique suit, l’avion vire.",
  ),
  block: el("div", "abs", card3),
};
place(s3.eyebrow, 128, 330);
place(s3.title, 128, 374);
place(s3.lead, 128, 492, 700);
const CONTROLS: StageControl[] = ["hdgBug", "ap"];
const BLOCK = { x: 1050, y: 96, w: 680, h: 900 };
place(s3.block, BLOCK.x, BLOCK.y, BLOCK.w, BLOCK.h);
const plan = stripPlan(CONTROLS, "below", BLOCK.w, BLOCK.h, 1, 1)!;
const hsiBox = el("div", "inst", s3.block);
place(hsiBox, plan.inst.x, plan.inst.y, plan.inst.w, plan.inst.h);
const HSI_FRAME = gaugeFrame("hsi");
const hsiCv = canvas(
  hsiBox,
  plan.inst.w,
  plan.inst.h,
  plan.inst.w * 2.4,
  plan.inst.h * 2.4,
);
const KNOB_FROM = 90;
const KNOB_TO = 150;
const knobK = (v: number) => inOutSine(prog(v, 1.5, 2.5));
const bugAt = (v: number) => KNOB_FROM + (KNOB_TO - KNOB_FROM) * knobK(v);
const knob = new Track(knobTurn(bugAt, 4));
const strip = new ControlStrip({
  controls: CONTROLS,
  lang: "fr",
  sim: () => knob.f.sim,
  pilot: null,
  interactive: false,
  changed: () => undefined,
  reset: () => undefined,
});
strip.setPlan(plan);
s3.block.append(strip.el);
const knobEl = strip.el.querySelector(".sl-sc-knob") as HTMLElement;
const finger = el("div", "finger", card3);
const ripple = el("div", "ripple", finger);
const dot = el("div", "dot", finger);
/** the knob's centre in slide coordinates (from the strip plan: measured once laid out) */
const knobC = { x: 0, y: 0, r: 36 };
function measureKnob() {
  const kr = knobEl.getBoundingClientRect();
  const cr = card3.getBoundingClientRect();
  const k = cr.width / 1920;
  knobC.x = (kr.left + kr.width / 2 - cr.left) / k;
  knobC.y = (kr.top + kr.height / 2 - cr.top) / k;
  knobC.r = kr.width / 2 / k;
}
/** the film's time on the tablet slide: the knob is turned from 0.75 s into the shot */
const V0 = 0.55;
let hsiDrawnAt = -1;
function fly(t: number) {
  const f = t - T.f;
  const vis = f > -0.05 && t < T.l + 0.65;
  const inK = outCubic(prog(f, 0, 0.6));
  show(tablet, vis ? prog(f, 0, 0.3) : 0);
  rise(cap3, f, 0.2, 0.6, 16);
  if (t > T.l - 0.1) show(cap3, 1 - prog(t, T.l - 0.1, T.l + 0.1));
  if (!vis) {
    L2.style.transform = "";
    return;
  }
  card3.style.transform = `scale(${TAB_S})`;
  const v = f + V0;
  const fl = knob.at(Math.max(0, v));
  if (hsiDrawnAt !== v) {
    paint(hsiCv, fl, HSI_FRAME, 0);
    strip.refresh();
    hsiDrawnAt = v;
  }
  // the finger: comes in, presses the knob, turns it clockwise, lets go
  const a0 = -60;
  const sweep = 200;
  const turnK = knobK(v);
  const ang = ((a0 + sweep * turnK) * Math.PI) / 180;
  const rim = knobC.r * 0.92;
  const onKnob = {
    x: knobC.x + Math.sin(ang) * rim,
    y: knobC.y - Math.cos(ang) * rim,
  };
  const comeK = outCubic(prog(v, 0.9, 1.38));
  const leaveK = inOutCubic(prog(v, 2.62, 3.0));
  const x = lerp(knobC.x + 330, onKnob.x, comeK) + leaveK * 160;
  const y = lerp(knobC.y + 330, onKnob.y, comeK) + leaveK * 220;
  const press = prog(v, 1.36, 1.48) * (1 - prog(v, 2.5, 2.62));
  place(finger, x, y);
  show(finger, prog(v, 0.9, 1.1) * (1 - prog(v, 2.65, 2.9)));
  show(dot, 1, `scale(${lerp(1, 0.84, press)})`);
  const rp = prog(v, 1.38, 1.9);
  const rr = lerp(30, 92, outCubic(rp));
  place(ripple, -rr, -rr, 2 * rr, 2 * rr);
  show(ripple, rp > 0 && rp < 1 ? 1 - rp : 0);
  knobEl.style.setProperty("--a", `${sweep * turnK}deg`);
  knobEl.classList.toggle("on", press > 0.5);
  // the tablet arrives, the camera eases in a little
  const z = lerp(1, 1.04, inOutSine(prog(f, 0.4, 2.4)));
  const cx = TAB.x + TAB.bezel + (BLOCK.x + plan.inst.x + plan.inst.w / 2) * TAB_S;
  const cy = TAB.y + TAB.bezel + (BLOCK.y + plan.inst.y + plan.inst.h / 2) * TAB_S;
  const dy = (1 - inK) * 80;
  L2.style.transform = `translate(0, ${dy}px) translate(${cx}px, ${cy}px) scale(${z}) translate(${-cx}px, ${-cy}px)`;
  const out = inOutCubic(prog(t, T.l, T.l + 0.6));
  tablet.style.opacity = String(prog(f, 0, 0.3) * (1 - out));
}

// ================================================================== L: the library
const L5 = el("div", "layer", stage);
L5.style.background = "var(--bg)";
L5.style.boxShadow = "0 -30px 80px rgba(0,0,0,0.35)";
L5.style.overflow = "hidden";
const lib = el("div", "layer", L5);
const head5 = {
  eyebrow: el("div", "abs lib-eyebrow", lib, "Bibliothèque"),
  title: el("div", "abs lib-title", lib, "Des cours prêts à présenter"),
  sub: el("div", "abs lib-sub", lib, "LAPL · PPL · IR · ATPL"),
};
place(head5.eyebrow, 120, 70);
place(head5.title, 118, 104);
place(head5.sub, 120, 190);
interface CardDef {
  id: string;
  pick: number;
  chip: string;
}
const CARDS: CardDef[] = [
  { id: "sample-lib-ppl-flight-manoeuvres", pick: 2, chip: "LAPL / PPL" },
  { id: "sample-lib-ppl-human-performance", pick: 0, chip: "LAPL / PPL" },
  { id: "sample-lib-ir-scan-attitude", pick: 4, chip: "IR" },
  { id: "sample-lib-ir-gyros-compass", pick: 2, chip: "IR" },
  { id: "sample-vor", pick: 2, chip: "Radionavigation" },
  { id: "sample-holding", pick: 1, chip: "Procédures IFR" },
  { id: "sample-maths-ifr", pick: 1, chip: "Calcul mental" },
  { id: "sample-lib-atpl-022-instruments", pick: 1, chip: "ATPL" },
];
const grid = el("div", "layer", lib);
const cards5: HTMLElement[] = [];
CARDS.forEach((def, i) => {
  const c = sampleCourse(def.id);
  if (!c) return;
  const col = i % 4;
  const row = Math.floor(i / 4);
  const card = el("div", "ccard", grid);
  place(card, 120 + col * (396 + 32), 268 + row * (370 + 26));
  card.style.height = "370px";
  const th = el("div", "th", card);
  const bd = el("div", "bd", card);
  el("span", "chip", bd, def.chip);
  el("div", "tt", bd, c.title.fr);
  el("div", "mt", bd, `${c.steps.length} étapes`);
  const cands = c.steps.filter(
    (s) =>
      s.slide &&
      s.slide.blocks.some(
        (b) => b.kind === "instrument" || b.kind === "diagram",
      ),
  );
  const step = cands[Math.min(def.pick, cands.length - 1)];
  const sims = new SceneSims({ scenes: c.scenes, cockpit: c.cockpit });
  if (step?.slide)
    renderThumb(step.slide, th, {
      lang: "fr",
      theme: c.theme,
      scenes: c.scenes,
      cockpit: c.cockpit,
      sims,
      step,
    });
  cards5.push(card);
});
function library(t: number) {
  const x = t - T.l;
  const up = inOutCubic(prog(t, T.l, T.l + 0.6));
  const vis = up > 0 && t < T.e + 0.6;
  show(L5, vis ? 1 : 0, `translateY(${(1 - up) * 1100}px)`);
  L5.style.borderRadius = `${Math.round(44 * (1 - up))}px ${Math.round(44 * (1 - up))}px 0 0`;
  if (!vis) return;
  const outK = inOutCubic(prog(t, T.e, T.e + 0.45));
  show(lib, 1 - outK, `translateY(${-outK * 30}px)`);
  rise(head5.eyebrow, x, 0.3, 0.7, 20);
  rise(head5.title, x, 0.36, 0.8, 26);
  rise(head5.sub, x, 0.48, 0.92, 22);
  grid.style.transform = `translateY(${-lerp(0, 22, inOutSine(prog(x, 0.4, 2.6)))}px)`;
  cards5.forEach((c, i) => {
    const a = 0.45 + i * 0.07;
    const k = outQuint(prog(x, a, a + 0.8));
    show(
      c,
      prog(x, a, a + 0.3),
      `translateY(${(1 - k) * 110}px) scale(${lerp(0.94, 1, k)})`,
    );
  });
}

// ================================================================== E: the end card
const L6 = el("div", "layer", stage);
const lock6 = el("div", "lockup", L6);
const mark6 = mark(lock6, 140);
const word6 = wordmark(lock6, 112);
const tag6 = el("div", "abs tagline", L6, BRAND.tagline.fr);
const slogan = el("div", "abs slogan", L6);
const sloganWords = ["Créez.", "Présentez.", "Faites voler."].map((w) =>
  el("span", "", slogan, w),
);
const soon = el("div", "abs soon", L6);
el("span", "soon-dot", soon);
el("span", "", soon, "Bientôt disponible");
let word6W = 480;
let tag6W = 900;
let sloganW = 600;
let soonW = 360;
function endCard(t: number) {
  const y = t - T.e;
  const vis = y > 0;
  // a slow, quiet push on the end card
  L6.style.transformOrigin = "960px 540px";
  show(L6, vis ? 1 : 0, `scale(${lerp(1, 1.025, inOutSine(prog(y, 0, 3.5)))})`);
  if (!vis) return;
  const lw = 140 + 34 + word6W;
  // the lockup lifts a little to make room for « Bientôt disponible »
  const lift = inOutCubic(prog(y, 1.75, 2.3)) * 34;
  place(lock6, 960 - lw / 2, 330 - lift);
  lock6.style.gap = "34px";
  const m = outBack(prog(y, 0.25, 0.75), 1.0);
  show(mark6.svg, prog(y, 0.25, 0.45), `scale(${lerp(0.6, 1, m)})`);
  mark6.build(prog(y, 0.3, 0.9));
  letterIn(word6.letters, y, 0.38, 0.035, 0.4, 30);
  place(tag6, 960 - tag6W / 2, 522 - lift);
  rise(tag6, y, 0.72, 1.2, 22);
  place(slogan, 960 - sloganW / 2, 610 - lift);
  sloganWords.forEach((w, i) => {
    const a = 1.02 + i * 0.18;
    const k = outCubic(prog(y, a, a + 0.45));
    show(w, k, `translateY(${(1 - k) * 18}px)`);
  });
  place(soon, 960 - soonW / 2, 724 - lift);
  const sk = outCubic(prog(y, 1.95, 2.5));
  show(soon, sk, `translateY(${(1 - sk) * 24}px) scale(${lerp(0.96, 1, sk)})`);
}

// ------------------------------------------------------------------ measures, seek
function measure() {
  wordWW = wordW.el.getBoundingClientRect().width;
  tagWW = tagW.getBoundingClientRect().width;
  whoWW = whoW.getBoundingClientRect().width;
  word6W = word6.el.getBoundingClientRect().width;
  tag6W = tag6.getBoundingClientRect().width;
  sloganW = slogan.getBoundingClientRect().width;
  soonW = soon.getBoundingClientRect().width;
  // the tablet slide at rest, to find the knob
  const keep = L2.style.transform;
  L2.style.transform = "";
  card3.style.transform = `scale(${TAB_S})`;
  measureKnob();
  L2.style.transform = keep;
}

/** a click in the studio can scroll its focused element into view, scrolling our boxes too: pin them */
function pinScroll() {
  const boxes: (Element | null)[] = [document.scrollingElement, document.documentElement, document.body, stage, LC, win, winIn, L2, room, tablet, tabScreen, LK];
  for (const b of boxes) {
    if (!b) continue;
    if (b.scrollTop) b.scrollTop = 0;
    if (b.scrollLeft) b.scrollLeft = 0;
  }
  window.scrollTo(0, 0);
}
function frameAt(t: number) {
  setClock(t * 1000);
  pinScroll();
  hook(t);
  what(t);
  creez(t);
  cockpit(t);
  present(t);
  fly(t);
  library(t);
  endCard(t);
  pinScroll();
}

declare global {
  interface Window {
    seek(ms: number): void;
    teaserReady: boolean;
    teaserInfo: unknown;
  }
}
window.seek = (ms: number) => frameAt(ms / 1000);
(async () => {
  await document.fonts.ready;
  measure();
  frameAt(0);
  let studio = "ready";
  try {
    await setupStudio();
  } catch (e) {
    studio = String(e);
  }
  // the thumbnails draw their instruments on the next frames
  await new Promise((r) => setTimeout(r, 1500));
  measure();
  window.teaserInfo = {
    duration: DURATION,
    when,
    knobC,
    studio,
    drop: S.drop,
  };
  window.teaserReady = true;
})();
