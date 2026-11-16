// Teaser — an 18-second film of the product, drawn by the product. window.seek(ms) lays out the exact frame for film
// time ms: every motion below is a function of that time, and the instruments are the app's own renderers
// (avionics/steam.ts, avionics/pfd.ts through course/stage/views.ts drawFrame) drawing real Sims advanced to it
// (flight.ts). The control strip is the slides' own (course/canvas/controlStrip.ts), the course cards carry real
// thumbnails of the sample library (course/canvas/render.ts renderThumb). render.cjs screenshots each frame.
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
import type { StageControl } from "../../src/course/types";
import { Track, sixPackTurn, knobTurn, ilsFinal, type Flight } from "./flight";

// ------------------------------------------------------------------ timing
export const DURATION = 18.0;
const T = {
  s2: 3.0, // the slide builds
  s3: 6.35, // the deck advances: the control strip
  push: 9.45, // the camera pushes into the HSI
  s4: 9.9, // the cockpit
  s5: 12.7, // the library sheet comes up
  s6: 15.4, // the end card
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

// ================================================================== shot 1: the airspeed indicator, the logo
const L1 = el("div", "layer", stage);
el("div", "wash", L1);
const ASI = { cx: 960, cy: 540, d: 600 };
const asiShadow = el("div", "asi-shadow", L1);
const asiBox = el("div", "abs", L1);
place(asiBox, ASI.cx - ASI.d / 2, ASI.cy - ASI.d / 2, ASI.d, ASI.d);
asiBox.style.transformOrigin = "50% 50%";
const asiCv = canvas(asiBox, ASI.d, ASI.d, ASI.d * 1.25, ASI.d * 1.25);
const asiSim = new Sim();
const lock1 = el("div", "lockup", L1);
const mark1 = mark(lock1, 172);
const word1 = wordmark(lock1, 132);

function asiKt(t: number): number {
  const up = inOutCubic(prog(t, 0.55, 1.6));
  const settle = outCubic(prog(t, 1.6, 2.05));
  return lerp(0, 158, up) + (118 - 158) * settle;
}
function shot1(t: number) {
  show(L1, 1 - prog(t, 3.0, 3.35));
  // the gauge: its bezel ring draws clockwise from 12 o'clock while the face opens out from the hub to meet it
  const ring = inOutSine(prog(t, 0.05, 0.75));
  const iris = outCubic(prog(t, 0.3, 1.0));
  const grow = outCubic(prog(t, 0.0, 1.1));
  const shrink = inOutCubic(prog(t, 1.95, 2.42));
  const s = lerp(0.94, 1, grow) * lerp(1, 0.29, shrink);
  const op = prog(t, 0.0, 0.12) * (1 - prog(t, 2.18, 2.4));
  const rot = lerp(-16, 0, grow);
  show(asiBox, op, `rotate(${rot}deg) scale(${s})`);
  const sd = ASI.d * (1.1 / 1.12) * s;
  place(asiShadow, ASI.cx - sd / 2, ASI.cy - sd / 2, sd, sd);
  show(asiShadow, op * outCubic(prog(t, 0.7, 1.25)));
  if (op > 0) {
    asiSim.ac.data.iasKt = asiKt(t);
    const c = asiCv.getContext("2d")!;
    const P = asiCv.width;
    const C = P / 2;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, P, P);
    const r = P / 2 / 1.12;
    if (iris > 0) {
      c.save();
      // the gauge alone on the page: its bezel, not the panel's mounting screws
      c.beginPath();
      c.arc(C, C, r * 1.1 * iris, 0, Math.PI * 2);
      c.clip();
      drawSteamGauge(c, asiSim, "asi", C, C, r);
      c.restore();
    }
    if (iris < 1 && ring > 0) {
      c.save();
      c.globalAlpha = 1 - prog(iris, 0.85, 1);
      c.strokeStyle = "#2a2e33";
      c.lineWidth = 7;
      c.lineCap = "round";
      c.beginPath();
      c.arc(C, C, r * 1.1 - 3.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ring);
      c.stroke();
      c.restore();
    }
  }
  // the logo: the mark takes the gauge's place, builds, then makes room for the name
  const lockW = 172 + 40 + wordW1;
  const left = 960 - lockW / 2;
  const slide = inOutCubic(prog(t, 2.45, 2.9));
  const markX = lerp(960 - 86, left, slide);
  place(lock1, markX, 540 - 86);
  const mIn = outBack(prog(t, 2.12, 2.5), 1.0);
  show(mark1.svg, prog(t, 2.12, 2.3), `scale(${lerp(0.55, 1, mIn)})`);
  mark1.build(prog(t, 2.2, 2.75));
  letterIn(word1.letters, t, 2.52, 0.035, 0.38, 34);
  const out = inCubic(prog(t, 2.98, 3.35));
  lock1.style.transform = `translateY(${-out * 50}px)`;
}

// ================================================================== slides (shots 2, 3)
const K = 0.8; // a slide (1920 × 1080 logical) shown at 1536 × 864 on the app's background
const CARD = { x: 192, y: 108 };
const L2 = el("div", "layer", stage);
const card2 = el("div", "card", L2);
const card3 = el("div", "card", L2);
function cardAt(c: HTMLElement, dx: number, dy: number, s = 1, op = 1) {
  show(c, op, `translate(${dx}px, ${dy}px) scale(${K * s})`);
}

// ---------------------------------------------------------------- shot 2: the slide builds itself
const s2 = {
  eyebrow: el("div", "abs eyebrow", card2, "Pilotage aux instruments"),
  title: el("div", "abs title", card2),
  lead: el("div", "abs lead", card2),
  facts: el("div", "facts", card2),
  inst: el("div", "inst", card2),
};
place(s2.eyebrow, 128, 112);
place(s2.title, 128, 156);
const TITLE2 = "Le virage au taux standard";
const titleText = el("span", "", s2.title);
const caret = el("span", "caret", s2.title);
place(s2.lead, 128, 316, 640);
s2.lead.textContent =
  "Les six instruments en direct, dessinés par le simulateur, racontent le même virage.";
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
// the flight: time-lapsed a little (×2.3) so the autopilot's roll-in to standard rate fits the shot
const TURN_RATE = 2.3;
const turnSpec = { ...sixPackTurn(0.15), rate: TURN_RATE };
const turn = new Track(turnSpec);
/** when the needles reach the values the facts name (found once by flying the shot) */
const when = { alt: 1.55, bank: 99, rate: 99, rollMax: 0 };
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
function shot2(t: number) {
  const u = t - T.s2;
  const vis = u > -0.05 && t < T.s3 + 0.75;
  show(card2, vis ? 1 : 0);
  if (!vis) return;
  // arrival (rises in under the logo) and the deck advance to the next slide
  const inK = outCubic(prog(u, 0, 0.62));
  const adv = inOutCubic(prog(t, T.s3, T.s3 + 0.62));
  cardAt(
    card2,
    CARD.x - adv * 1640,
    CARD.y + (1 - inK) * 90,
    lerp(0.97, 1, inK),
    prog(u, 0, 0.3),
  );
  rise(s2.eyebrow, u, 0.25, 0.65, 18);
  // the title types in
  const n = Math.round(TITLE2.length * prog(u, 0.38, 1.25));
  titleText.textContent = TITLE2.slice(0, n);
  const typing = u >= 0.3 && u < 1.25;
  const blinkOn =
    typing || (u >= 0.3 && u < 2.1 && Math.floor((u - 1.25) / 0.42) % 2 === 1);
  caret.style.opacity = blinkOn ? "1" : "0";
  rise(s2.lead, u, 1.15, 1.6, 22);
  // the six-pack slides into place
  const k = outQuint(prog(u, 0.35, 1.25));
  show(
    s2.inst,
    prog(u, 0.35, 0.7),
    `translateX(${(1 - k) * 300}px) scale(${lerp(0.96, 1, k)})`,
  );
  const f = turn.at(Math.max(0, u));
  const d = f.sim.ac.data;
  if (sixDrawnAt !== u) {
    paint(sixCv, f, SIX_FRAME, 0);
    sixDrawnAt = u;
  }
  // the facts light up as the needles reach them, with a ring on the instrument that shows it
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

// ---------------------------------------------------------------- shot 3: the students take the controls
const s3 = {
  eyebrow: el("div", "abs eyebrow", card3, "À vous"),
  title: el("div", "abs title", card3),
  lead: el("div", "abs lead", card3),
  block: el("div", "abs", card3),
};
place(s3.eyebrow, 128, 300);
place(s3.title, 128, 344);
const t3words = ["Les élèves prennent", "les commandes"].map((line) => {
  const ln = el("div", "", s3.title);
  return line.split(" ").map((w, i) => {
    const sp = el("span", "w", ln, w);
    if (i) sp.style.marginLeft = "0.26em";
    return sp;
  });
});
place(s3.lead, 128, 540, 700);
s3.lead.textContent =
  "Sur la diapositive même, ils tournent le bouton de cap : l’avion suit.";
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
  plan.inst.w * 2.2,
  plan.inst.h * 2.2,
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
/** the knob's centre in slide coordinates (measured once laid out) */
const knobC = { x: 0, y: 0, r: 36 };
function measureKnob() {
  cardAt(card3, CARD.x, CARD.y);
  const kr = knobEl.getBoundingClientRect();
  const cr = card3.getBoundingClientRect();
  knobC.x = (kr.left + kr.width / 2 - cr.left) / K;
  knobC.y = (kr.top + kr.height / 2 - cr.top) / K;
  knobC.r = kr.width / 2 / K;
}
let hsiDrawnAt = -1;
function shot3(t: number) {
  const v = t - T.s3;
  const vis = v > -0.05 && t < T.s4 + 0.3;
  show(card3, vis ? 1 : 0);
  if (!vis) return;
  const adv = inOutCubic(prog(v, 0, 0.62));
  cardAt(card3, CARD.x + (1 - adv) * 1640, CARD.y);
  rise(s3.eyebrow, v, 0.5, 0.85, 16);
  t3words.flat().forEach((w, i) => {
    const k = outCubic(prog(v, 0.55 + i * 0.07, 0.95 + i * 0.07));
    show(w, k, `translateY(${(1 - k) * 40}px)`);
  });
  rise(s3.lead, v, 1.05, 1.5, 20);
  // the aircraft, the HSI, the strip's live values
  const f = knob.at(Math.max(0, v));
  if (hsiDrawnAt !== v) {
    paint(hsiCv, f, HSI_FRAME, 0);
    strip.refresh();
    hsiDrawnAt = v;
  }
  // the finger: comes in, presses the knob, turns it clockwise, lets go
  const a0 = -60; // degrees from 12 o'clock, clockwise
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
  // the camera pushes into the HSI
  const pk = inCubic(prog(t, T.push, T.s4 + 0.25));
  if (pk > 0) {
    const cx = CARD.x + (BLOCK.x + plan.inst.x + plan.inst.w / 2) * K;
    const cy = CARD.y + (BLOCK.y + plan.inst.y + plan.inst.h / 2) * K;
    const s = lerp(1, 11, pk);
    L2.style.transform = `translate(${cx}px, ${cy}px) scale(${s}) translate(${-cx}px, ${-cy}px)`;
  } else L2.style.transform = "";
}

// ================================================================== shot 4: the cockpit, an ILS on the G1000 PFD
const L4 = el("div", "layer dark", stage);
const PFD = { x: 612, y: 92, w: 1216, h: 896, pad: 18 };
const pfdWrap = el("div", "abs", L4);
place(pfdWrap, 0, 0, 1920, 1080);
pfdWrap.style.transformOrigin = `${PFD.x + PFD.w / 2}px ${PFD.y + PFD.h / 2}px`;
const bezel = el("div", "bezel", pfdWrap);
place(bezel, PFD.x, PFD.y, PFD.w, PFD.h);
const pfdInW = PFD.w - 2 * PFD.pad;
const pfdInH = (pfdInW * 3) / 4;
const pfdCvBox = el("div", "abs", bezel);
place(pfdCvBox, PFD.pad, (PFD.h - pfdInH) / 2, pfdInW, pfdInH);
pfdCvBox.style.borderRadius = "10px";
pfdCvBox.style.overflow = "hidden";
const pfdCv = canvas(pfdCvBox, pfdInW, pfdInH);
const PFD_FRAME = instrumentFrame({ kind: "pfd" });
const ILS_RATE = 2;
const ils = new Track(ilsFinal(ILS_RATE));
const cap4 = {
  eyebrow: el("div", "abs ck-eyebrow", L4, "Simulateur intégré"),
  title: el("div", "abs ck-title", L4),
  sub: el(
    "div",
    "abs ck-sub",
    L4,
    "Un ILS au pilote automatique, puis retour au cours.",
  ),
};
cap4.title.innerHTML = "Du cours<br>au cockpit";
place(cap4.eyebrow, 112, 364);
place(cap4.title, 108, 404, 470);
place(cap4.sub, 112, 600, 440);
const fade4 = el("div", "layer", stage);
fade4.style.background = "#0b0e12";
let ilsLastW = 0;
function shot4(t: number) {
  const w = t - T.s4;
  // the dark closes in during the push, then the PFD opens out of it
  show(
    fade4,
    prog(t, T.push + 0.3, T.s4 + 0.1) * (1 - prog(t, T.s4 + 0.05, T.s4 + 0.4)),
  );
  const vis = w > -0.02 && t < T.s5 + 0.65;
  show(
    L4,
    vis ? 1 : 0,
    `translateY(${-inOutCubic(prog(t, T.s5, T.s5 + 0.6)) * 260}px)`,
  );
  if (!vis) return;
  const open = outCubic(prog(w, 0, 0.75));
  const drift = lerp(0, 0.035, inOutSine(prog(w, 0, 3.4)));
  show(pfdWrap, prog(w, 0, 0.3), `scale(${lerp(1.32, 1, open) + drift})`);
  const f = ils.at(Math.max(0, w));
  const dt = Math.max(0, w - ilsLastW) * ILS_RATE;
  paint(pfdCv, f, PFD_FRAME, Math.min(0.1, dt));
  ilsLastW = w;
  rise(cap4.eyebrow, w, 0.55, 0.95, 18);
  rise(cap4.title, w, 0.65, 1.15, 30);
  rise(cap4.sub, w, 0.9, 1.35, 24);
}

// ================================================================== shot 5: the library
const L5 = el("div", "layer", stage);
L5.style.background = "var(--bg)";
L5.style.boxShadow = "0 -30px 80px rgba(0,0,0,0.35)";
const lib = el("div", "layer", L5);
const head5 = {
  eyebrow: el("div", "abs lib-eyebrow", lib, "Bibliothèque"),
  title: el("div", "abs lib-title", lib, "Des cours prêts à présenter"),
  sub: el("div", "abs lib-sub", lib, BRAND.programmes.fr),
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
function shot5(t: number) {
  const x = t - T.s5;
  const up = inOutCubic(prog(t, T.s5, T.s5 + 0.6));
  const vis = up > 0 && t < T.s6 + 0.6;
  show(L5, vis ? 1 : 0, `translateY(${(1 - up) * 1100}px)`);
  L5.style.borderRadius = `${Math.round(44 * (1 - up))}px ${Math.round(44 * (1 - up))}px 0 0`;
  if (!vis) return;
  const outK = inOutCubic(prog(t, T.s6, T.s6 + 0.45));
  show(lib, 1 - outK, `translateY(${-outK * 30}px)`);
  rise(head5.eyebrow, x, 0.3, 0.7, 20);
  rise(head5.title, x, 0.36, 0.8, 26);
  rise(head5.sub, x, 0.48, 0.92, 22);
  grid.style.transform = `translateY(${-lerp(0, 22, inOutSine(prog(x, 0.4, 3.2)))}px)`;
  cards5.forEach((c, i) => {
    const a = 0.5 + i * 0.075;
    const k = outQuint(prog(x, a, a + 0.85));
    show(
      c,
      prog(x, a, a + 0.3),
      `translateY(${(1 - k) * 110}px) scale(${lerp(0.94, 1, k)})`,
    );
  });
}

// ================================================================== shot 6: the end card
const L6 = el("div", "layer", stage);
const lock6 = el("div", "lockup", L6);
const mark6 = mark(lock6, 140);
const word6 = wordmark(lock6, 112);
const tag6 = el("div", "abs tagline", L6, BRAND.tagline.fr);
const slogan = el("div", "abs slogan", L6);
const sloganWords = ["Créez.", "Présentez.", "Faites voler."].map((w) =>
  el("span", "", slogan, w),
);
function shot6(t: number) {
  const y = t - T.s6;
  const vis = y > 0;
  // a slow, quiet push on the end card
  L6.style.transformOrigin = "960px 540px";
  show(L6, vis ? 1 : 0, `scale(${lerp(1, 1.025, inOutSine(prog(y, 0, 2.6)))})`);
  if (!vis) return;
  const lockW = 140 + 34 + wordW6;
  place(lock6, 960 - lockW / 2, 380);
  lock6.style.gap = "34px";
  const m = outBack(prog(y, 0.25, 0.75), 1.0);
  show(mark6.svg, prog(y, 0.25, 0.45), `scale(${lerp(0.6, 1, m)})`);
  mark6.build(prog(y, 0.3, 0.9));
  letterIn(word6.letters, y, 0.38, 0.035, 0.4, 30);
  place(tag6, 960 - tagW / 2, 572);
  rise(tag6, y, 0.72, 1.2, 22);
  place(slogan, 960 - sloganW / 2, 668);
  sloganWords.forEach((w, i) => {
    const a = 1.02 + i * 0.18;
    const k = outCubic(prog(y, a, a + 0.45));
    show(w, k, `translateY(${(1 - k) * 18}px)`);
  });
}

// ------------------------------------------------------------------ measures, seek
let wordW1 = 560;
let wordW6 = 480;
let tagW = 900;
let sloganW = 600;
function measure() {
  wordW1 = word1.el.getBoundingClientRect().width;
  wordW6 = word6.el.getBoundingClientRect().width;
  tagW = tag6.getBoundingClientRect().width;
  sloganW = slogan.getBoundingClientRect().width;
  measureKnob();
}

function frame(t: number) {
  setClock(t * 1000);
  shot1(t);
  shot2(t);
  shot3(t);
  shot4(t);
  shot5(t);
  shot6(t);
}

declare global {
  interface Window {
    seek(ms: number): void;
    teaserReady: boolean;
    teaserInfo: unknown;
  }
}
window.seek = (ms: number) => frame(ms / 1000);
(async () => {
  await document.fonts.ready;
  measure();
  frame(0);
  // the thumbnails draw their instruments on the next frames
  await new Promise((r) => setTimeout(r, 2500));
  measure();
  window.teaserInfo = {
    duration: DURATION,
    when,
    knobC,
    plan: { inst: plan.inst, strip: plan.strip },
    ils: (() => {
      const f = new Track(ilsFinal(ILS_RATE)).at(3);
      const d = f.sim.ac.data;
      return { ias: d.iasKt, alt: d.altFt, vs: d.vsFpm, lat: f.sim.ap.lat, vert: f.sim.ap.vert, loc: f.sim.nav1.cdiDev, gs: f.sim.nav1.gsDev };
    })(),
  };
  window.teaserReady = true;
})();
