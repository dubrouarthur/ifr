// Airliner-style displays (Boeing 737/777-like PFD and ND in MAP mode) for the same trainer aircraft.
// Conventions follow the Boeing flight-deck displays: green = engaged modes and references, white = armed modes
// and scales, magenta = selected targets (MCP) and the active FMC route, cyan = navaids/airports, amber = cautions.
import type { Sim } from "../sim/sim";
import { AIRFRAME } from "../sim/aircraft";
import { C, box, line, poly, text, pad3 } from "./draw";
import { slipBarPx } from "./pfd";
import { airDataShown, darkScreen, hasPower, smokeHaze } from "./gauges";
import { AIRPORTS, FIXES, NAVAIDS } from "../nav/data";
import {
  toLocal,
  destination,
  wrap180,
  norm360,
  DEG,
  bearingDeg,
  type LatLon,
} from "../nav/geo";
import { tunedNavaid } from "../nav/radios";
import { flyablePath } from "../nav/pathgeom";
import { racetrack } from "../nav/holding";
import type { Waypoint } from "../nav/flightplan";

export const AL_W = 1024;
export const AL_H = 768;
const MAG = "#ff5cf4";
const GRN = "#3cf56b";
const CYN = "#20e3ff";
const AMB = "#ffb21e";
const WHT = "#ffffff";
const GRY = "#5c636b";
const TAPE = "#4b5157";
const RED = "#f0322a";

// ------------------------------------------------------------------ shared helpers
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** stall speed for the current flap position (Vs1 clean → Vso full flaps) */
export function vStall(flapsDeg: number) {
  return (
    AIRFRAME.vs1 - (AIRFRAME.vs1 - AIRFRAME.vso) * clamp(flapsDeg / 30, 0, 1)
  );
}
/** maximum speed for the configuration: flap placard with flaps out, VNE clean */
export function vMax(flapsDeg: number) {
  return flapsDeg > 12
    ? AIRFRAME.vfe
    : flapsDeg > 0.5
      ? AIRFRAME.vfe10
      : AIRFRAME.vne;
}
/** flap manoeuvre speed for a flap setting (Boeing "UP / 1 / 5" bugs): ~1.45 Vs for that configuration */
const flapManeuver = (deg: number) => Math.round(vStall(deg) * 1.45);
/** take-off speeds of the trainer, shown like airliner V1 / VR / V2 bugs */
const V_TO = { v1: AIRFRAME.vr - 3, vr: AIRFRAME.vr, v2: AIRFRAME.vr + 7 };

/** red/black checkerboard column (Boeing min/max speed "barber pole") between y0 and y1 */
function barberPole(
  ctx: CanvasRenderingContext2D,
  x: number,
  y0: number,
  y1: number,
  w: number,
) {
  const a = Math.min(y0, y1);
  const b = Math.max(y0, y1);
  box(ctx, x, a, w, b - a, "#000");
  const step = 10;
  for (let y = a; y < b; y += step * 2)
    box(ctx, x, y, w, Math.min(step, b - y), RED);
}

/**
 * One rolling-drum column: `label(k)` prints the drum position k (0 = current, 1 = next value up) and
 * `frac` (0..1) is how far the drum has rolled toward the next value. Neighbours show above/below.
 */
function drum(ctx: CanvasRenderingContext2D, label: (k: number) => string, frac: number, x: number, cy: number, wBox: number, hBox: number, size: number, color: string, pitchK = 1.05) {
  const pitch = size * pitchK;
  // ease the roll so a digit reads centred most of the time and only rolls through the middle of its step
  const f = clamp((frac - 0.25) / 0.5, 0, 1);
  frac = f * f * (3 - 2 * f);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - wBox, cy - hBox / 2, wBox, hBox);
  ctx.clip();
  for (let k = -1; k <= 2; k++) text(ctx, label(k), x - 2, cy - (k - frac) * pitch + 1, color, size, 'right', 700);
  ctx.restore();
}

/** Memory of one airliner PFD: every display owns one, so two PFDs on a page never share it. */
export interface AirlinerState {
  /** mode-change highlight (Boeing draws a box around a new FMA mode for 10 s) */
  fmaPrev: string[];
  fmaSince: number[];
  /** speed trend (10-s prediction from the filtered acceleration) */
  trend: { t: number; ias: number; acc: number };
}
export const newAirlinerState = (): AirlinerState => ({
  fmaPrev: ["", "", ""],
  fmaSince: [0, 0, 0],
  trend: { t: -1, ias: 0, acc: 0 },
});
/** the cockpit's display (callers that pass no state) */
const defaultAirliner = newAirlinerState();

/** Draw the display, then the cabin smoke veil over it (smokeHaze: electrical or engine fire) */
export function drawAirlinerPfd(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  st: AirlinerState = defaultAirliner,
) {
  drawAirlinerPfdBody(ctx, sim, st);
  smokeHaze(ctx, sim, AL_W, AL_H, (typeof performance !== 'undefined' ? performance.now() : 0) / 1000);
}

// ------------------------------------------------------------------ PFD
// Layout (logical 1024 × 768): speed tape 58–176, ADI 258–690, LOC/GS scales, altitude tape 744–876,
// VSI 890–980, FMA on top, heading rose at the bottom.
function drawAirlinerPfdBody(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  st: AirlinerState,
) {
  const trend = st.trend;
  const d = sim.ac.data;
  // no power: a dark display
  if (!hasPower(sim, "pfd")) {
    trend.t = -1;
    darkScreen(ctx, AL_W, AL_H);
    return;
  }
  const air = airDataShown(sim);
  ctx.clearRect(0, 0, AL_W, AL_H);
  box(ctx, 0, 0, AL_W, AL_H, "#000");
  const cx = 474;
  const cy = 352;
  const ppd = 9.4;
  const AW = 216; // ADI half-width
  const AH = 210;
  // speed trend filter (sim time, so it freezes with the simulation)
  if (trend.t < 0 || sim.time < trend.t || sim.time - trend.t > 2)
    trend.acc = 0;
  else if (sim.time > trend.t) {
    const dt = sim.time - trend.t;
    const raw = (air.iasKt - trend.ias) / dt;
    trend.acc += (clamp(raw, -15, 15) - trend.acc) * Math.min(1, dt / 1.2);
  }
  trend.t = sim.time;
  trend.ias = air.iasKt;

  // --- ADI
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cx - AW, cy - AH, 2 * AW, 2 * AH, 34);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-d.rollDeg * DEG);
  ctx.translate(0, d.pitchDeg * ppd);
  ctx.fillStyle = "#1b7fe0";
  ctx.fillRect(-900, -1800, 1800, 1800);
  ctx.fillStyle = "#7a4a17";
  ctx.fillRect(-900, 0, 1800, 1800);
  line(ctx, -900, 0, 900, 0, WHT, 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-150, -d.pitchDeg * ppd - 160, 300, 290);
  ctx.clip();
  for (let p = -30; p <= 30; p += 2.5) {
    if (!p) continue;
    const y = -p * ppd;
    const w = p % 10 === 0 ? 84 : p % 5 === 0 ? 46 : 22;
    line(ctx, -w / 2, y, w / 2, y, WHT, 2.4);
    if (p % 10 === 0) {
      text(ctx, String(Math.abs(p)), -w / 2 - 18, y, WHT, 18, "center", 700);
      text(ctx, String(Math.abs(p)), w / 2 + 18, y, WHT, 18, "center", 700);
    }
  }
  ctx.restore();
  ctx.restore();
  // roll scale
  ctx.save();
  ctx.translate(cx, cy);
  for (const a of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
    const ang = (a - 90) * DEG;
    const l = Math.abs(a) % 30 === 0 ? 18 : 10;
    line(
      ctx,
      Math.cos(ang) * 192,
      Math.sin(ang) * 192,
      Math.cos(ang) * (192 + l),
      Math.sin(ang) * (192 + l),
      WHT,
      2.4,
    );
  }
  ctx.strokeStyle = WHT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 192, -150 * DEG, -30 * DEG);
  ctx.stroke();
  poly(
    ctx,
    [
      [0, -194],
      [-10, -208],
      [10, -208],
    ],
    undefined,
    WHT,
    2.4,
  );
  ctx.rotate(-d.rollDeg * DEG);
  poly(
    ctx,
    [
      [0, -190],
      [-11, -171],
      [11, -171],
    ],
    Math.abs(d.rollDeg) > 35 ? AMB : WHT,
  );
  const sl = slipBarPx(d.slip); // 1 brick width = 1 ball width, like the G1000 and the steam inclinometer
  poly(
    ctx,
    [
      [-13 + sl, -167],
      [13 + sl, -167],
      [15 + sl, -159],
      [-15 + sl, -159],
    ],
    Math.abs(d.slip) > 0.6 ? AMB : WHT,
  );
  ctx.restore();
  // flight director bars (Boeing crossbars)
  if (sim.ap.fd) {
    const dx = clamp((sim.ap.bankCmd - d.rollDeg) / 25, -1, 1) * 140;
    const dy = clamp((sim.ap.pitchCmd - d.pitchDeg) / 10, -1, 1) * 140;
    line(ctx, cx + dx, cy - 140, cx + dx, cy + 140, MAG, 4);
    line(ctx, cx - 140, cy - dy, cx + 140, cy - dy, MAG, 4);
  }
  // aircraft symbol
  const wing = (s: number) => {
    poly(
      ctx,
      [
        [cx + s * 50, cy - 5],
        [cx + s * 120, cy - 5],
        [cx + s * 120, cy + 5],
        [cx + s * 62, cy + 5],
        [cx + s * 62, cy + 22],
        [cx + s * 50, cy + 22],
      ],
      "#000",
      WHT,
      2.5,
    );
  };
  wing(-1);
  wing(1);
  box(ctx, cx - 6, cy - 6, 12, 12, "#000", WHT);
  // LOC (below) and G/S (right) deviation scales
  const n = sim.navInputs();
  const isGps = n.cdi === "GPS";
  const latValid = isGps
    ? n.gps.valid && sim.fp.approachActive
    : n.nav.valid && n.nav.isLoc;
  const vertValid = isGps ? n.gps.gpValid : n.nav.gsValid;
  for (const k of [-2, -1, 1, 2]) {
    ctx.strokeStyle = WHT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx + k * 48, cy + AH + 24, 5.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + AW + 24, cy + k * 48, 5.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  line(ctx, cx, cy + AH + 11, cx, cy + AH + 37, WHT, 2.4);
  line(ctx, cx + AW + 11, cy, cx + AW + 37, cy, WHT, 2.4);
  if (latValid) {
    const x = cx + clamp(isGps ? n.gps.dev : n.nav.dev, -1.2, 1.2) * 96;
    poly(
      ctx,
      [
        [x, cy + AH + 12],
        [x + 11, cy + AH + 24],
        [x, cy + AH + 36],
        [x - 11, cy + AH + 24],
      ],
      MAG,
      MAG,
    );
  }
  if (vertValid) {
    const y = cy - clamp(isGps ? n.gps.gpDev : n.nav.gsDev, -1.2, 1.2) * 96;
    poly(
      ctx,
      [
        [cx + AW + 24, y - 11],
        [cx + AW + 35, y],
        [cx + AW + 24, y + 11],
        [cx + AW + 13, y],
      ],
      MAG,
      MAG,
    );
  }
  // ILS source block: on black, above and left of the ADI
  if (!isGps && n.nav.valid) {
    const fx = cx - AW - 4;
    text(
      ctx,
      `${n.nav.ident}/${(n.cdi === "NAV2" ? sim.av.nav2 : sim.av.nav1).active.toFixed(2)}`,
      fx,
      cy - AH - 34,
      WHT,
      16,
      "left",
      700,
    );
    text(
      ctx,
      `${pad3(sim.course())}°${n.nav.dmeNm !== null ? `   DME ${n.nav.dmeNm.toFixed(1)}` : ""}`,
      fx,
      cy - AH - 14,
      WHT,
      16,
      "left",
      700,
    );
  }
  // marker beacon
  if (sim.marker) {
    box(ctx, cx + 120, cy - 150, 44, 26, "#000", CYN);
    text(ctx, "OM", cx + 142, cy - 137, CYN, 16, "center", 700);
  }
  // radio altitude (lower centre of the ADI) & minimums (lower right)
  if (d.aglFt < 2500 && !sim.ac.s.onGround) {
    const ra =
      d.aglFt < 100
        ? Math.round(d.aglFt / 2) * 2
        : d.aglFt < 500
          ? Math.round(d.aglFt / 10) * 10
          : Math.round(d.aglFt / 20) * 20;
    box(ctx, cx - 44, cy + AH - 56, 88, 32, "rgba(0,0,0,.55)");
    text(
      ctx,
      String(ra),
      cx,
      cy + AH - 40,
      d.aglFt < 1000 &&
        sim.av.minimums !== null &&
        sim.indicatedAlt() < sim.av.minimums
        ? AMB
        : WHT,
      26,
      "center",
      700,
    );
  }
  if (sim.av.minimums !== null) {
    const below = sim.indicatedAlt() < sim.av.minimums && !sim.ac.s.onGround;
    text(
      ctx,
      "BARO",
      cx + AW - 56,
      cy + AH - 58,
      below ? AMB : GRN,
      15,
      "center",
      700,
    );
    text(
      ctx,
      String(sim.av.minimums),
      cx + AW - 56,
      cy + AH - 36,
      below ? AMB : GRN,
      20,
      "center",
      700,
    );
    if (below && Math.floor(performance.now() / 400) % 2 === 0)
      text(ctx, "MINIMUMS", cx, cy - 110, AMB, 22, "center", 700);
  }
  if (d.stallWarn) {
    box(ctx, cx - 50, cy + 80, 100, 26, "#000", C.red);
    text(ctx, "STALL", cx, cy + 93, C.red, 18, "center", 700);
  }
  drawFma(ctx, sim, cx, st);
  drawSpeedTape(ctx, sim, 58, cy, st.trend.acc);
  drawAltTape(ctx, sim, 744, cy);
  drawVsiAl(ctx, sim, air.vsFpm, 890, cy);
  drawHdgArc(ctx, sim, cx, 668);
  drawAirlinerFlags(ctx, sim, cx, cy, AW, AH);
  if (sim.paused) {
    box(ctx, cx - 70, cy + 40, 140, 32, "#000", WHT);
    text(ctx, "PAUSED", cx, cy + 56, WHT, 20, "center", 700);
  }
  if (sim.ac.s.crashed) {
    box(ctx, cx - 200, cy - 40, 400, 80, "rgba(160,0,0,.9)", WHT);
    text(ctx, sim.ac.s.crashed, cx, cy, WHT, 18, "center", 700);
  }
}

function drawFma(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  cx: number,
  st: AirlinerState,
) {
  const { fmaPrev, fmaSince } = st;
  const ap = sim.ap;
  const d = sim.ac.data;
  const x0 = cx - 300;
  box(ctx, x0, 4, 600, 58, "#000");
  ctx.strokeStyle = GRY;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x0 + 1, 5, 598, 56);
  for (const x of [cx - 100, cx + 100]) line(ctx, x, 9, x, 57, GRY, 1.5);
  const lat: Record<string, string> = {
    ROL: "ATT",
    HDG: "HDG SEL",
    GPS: "LNAV",
    VOR: "VOR/LOC",
    LOC: "LOC",
    BC: "B/CRS",
  };
  const ver: Record<string, string> = {
    PIT: "PITCH",
    ALT: "ALT HOLD",
    VS: "V/S",
    FLC: "FLCH SPD",
    GS: "G/S",
    GP: "G/P",
  };
  // column 1: thrust mode — this trainer has no autothrottle, so only TO/GA (full power, low and climbing)
  const toga =
    sim.controls.throttle > 0.97 &&
    (sim.ac.s.onGround || (d.aglFt < 1500 && d.vsFpm > 100));
  const modes = [
    toga ? "TO/GA" : "",
    ap.engaged ? (lat[ap.lat] ?? ap.lat) : "",
    ap.engaged ? (ver[ap.vert] ?? ap.vert) : "",
  ];
  const now = performance.now();
  modes.forEach((m, i) => {
    const x = cx - 200 + i * 200;
    if (m !== fmaPrev[i]) {
      fmaPrev[i] = m;
      fmaSince[i] = now;
    }
    if (!m) return;
    text(ctx, m, x, 22, GRN, 19, "center", 700);
    if (now - fmaSince[i] < 10000) {
      ctx.font = `700 19px 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif`;
      const w = ctx.measureText(m).width + 16;
      ctx.strokeStyle = GRN;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - w / 2, 10, w, 25);
    }
  });
  if (ap.engaged) {
    if (ap.latArmed)
      text(ctx, lat[ap.latArmed] ?? "", cx, 48, WHT, 16, "center", 700);
    const armed = ap.vertArmed.gs ? "G/S" : ap.vertArmed.gp ? "G/P" : "";
    if (armed) text(ctx, armed, cx + 200, 48, WHT, 16, "center", 700);
  }
  const status = ap.ap ? "CMD" : ap.fd ? "FD" : "";
  if (status) {
    box(ctx, cx - 34, 70, 68, 28, "#000", GRN);
    text(ctx, status, cx, 85, GRN, 19, "center", 700);
  } else if (ap.annunciation && Math.floor(now / 300) % 2 === 0) {
    box(ctx, cx - 76, 70, 152, 28, AMB);
    text(ctx, "AP DISCONNECT", cx, 85, "#000", 16, "center", 700);
  }
}

function drawSpeedTape(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  x: number,
  cy: number,
  trendAcc: number,
) {
  const d = sim.ac.data;
  // the tape reads the pitot-static system (an iced or blocked pitot shows on it)
  const iasKt = airDataShown(sim).iasKt;
  const s = sim.ac.s;
  const w = 118;
  const top = cy - 210;
  const h = 420;
  const kpx = 4.6;
  const ias = Math.max(30, iasKt);
  const bx = x + w; // right edge: bugs hang outside
  box(ctx, x, top, w, h, TAPE);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top, w + 30, h);
  ctx.clip();
  const yOf = (k: number) => cy - (k - ias) * kpx;
  // scale: ticks every 10 kt, numbers every 20 kt; nothing below 30 kt (Boeing tape floor)
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top, w, h);
  ctx.clip();
  for (let k = Math.floor((ias - 50) / 10) * 10; k < ias + 50; k += 10) {
    if (k < 30) continue;
    const y = yOf(k);
    line(ctx, bx - 16, y, bx, y, WHT, 2);
    if (k % 20 === 0) text(ctx, String(k), bx - 22, y, WHT, 20, "right", 600);
  }
  const flaps = d.flapsDeg;
  // maximum speed barber pole (VNE clean, flap placard with flaps out) and amber caution band VNO → VNE
  const vmx = vMax(flaps);
  barberPole(ctx, bx - 9, yOf(vmx), top - 10, 9);
  if (vmx >= AIRFRAME.vne - 1) {
    ctx.strokeStyle = AMB;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx - 7, yOf(vmx), 5, yOf(AIRFRAME.vno) - yOf(vmx));
  }
  // minimum speed barber pole (stall warning) and amber minimum-manoeuvre band (airborne only)
  if (!s.onGround) {
    const vs = vStall(flaps);
    barberPole(ctx, bx - 9, yOf(vs), top + h + 10, 9);
    ctx.strokeStyle = AMB;
    ctx.lineWidth = 2;
    ctx.strokeRect(bx - 7, yOf(vs * 1.3), 5, yOf(vs) - yOf(vs * 1.3));
  }
  // speed trend vector: where the speed will be in 10 s
  const tr = trendAcc * 10;
  if (Math.abs(tr) > 2 && iasKt > 30) {
    const yt = clamp(yOf(iasKt + tr), top + 4, top + h - 4);
    const xt = bx - 26;
    line(ctx, xt, cy, xt, yt, GRN, 2.5);
    const sg = tr > 0 ? 1 : -1;
    poly(
      ctx,
      [
        [xt, yt],
        [xt - 7, yt + sg * 12],
        [xt + 7, yt + sg * 12],
      ],
      undefined,
      GRN,
      2.2,
    );
  }
  ctx.restore();
  // green reference bugs: V1 / VR / V2 for take-off, flap manoeuvre speeds once airborne
  const bugs: [number, string][] = [];
  const takeoff =
    s.onGround || (d.aglFt < 1000 && d.vsFpm > 100 && !sim.fp.approachActive);
  if (takeoff) bugs.push([V_TO.v1, "V1"], [V_TO.vr, "VR"], [V_TO.v2, "V2"]);
  else if (iasKt < 140) {
    const cur = Math.round(flaps / 10) * 10;
    for (const f of [0, 10, 20])
      if (Math.abs(f - cur) <= 10)
        bugs.push([flapManeuver(f), f === 0 ? "UP" : String(f)]);
  }
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top, w + 60, h);
  ctx.clip();
  // labels pushed apart so close bugs (V1 / VR) stay readable
  let lastY = Infinity;
  for (const [v, l] of [...bugs].sort((p, q) => p[0] - q[0])) {
    const y = yOf(v);
    const ly = Math.min(y, lastY - 17);
    lastY = ly;
    line(ctx, bx, y, bx + 10, y, GRN, 2.5);
    text(ctx, l, bx + 13, ly, GRN, 16, "left", 700);
  }
  ctx.restore();
  // magenta selected-speed bug (parked half-visible at the tape end when off scale)
  const sel = sim.ap.iasSel > 0 ? sim.ap.iasSel : null;
  if (sel !== null) {
    const yb = clamp(yOf(sel), top, top + h);
    poly(
      ctx,
      [
        [bx, yb],
        [bx + 9, yb - 9],
        [bx + 22, yb - 9],
        [bx + 22, yb + 9],
        [bx + 9, yb + 9],
      ],
      undefined,
      MAG,
      2.5,
    );
  }
  // readout box with rolling units digit
  poly(
    ctx,
    [
      [x + 4, cy - 24],
      [bx - 12, cy - 24],
      [bx - 12, cy - 9],
      [bx, cy],
      [bx - 12, cy + 9],
      [bx - 12, cy + 24],
      [x + 4, cy + 24],
    ],
    "#000",
    WHT,
    2,
  );
  const col = d.stallWarn ? AMB : WHT;
  if (iasKt < 30) text(ctx, "---", bx - 18, cy, col, 30, "right", 700);
  else {
    const v = iasKt;
    const u = Math.floor(v);
    const fu = v - u;
    // tens/hundreds roll together with the units drum while it passes 9 → 0
    const ft = u % 10 === 9 ? fu : 0;
    const tens = Math.floor(u / 10);
    drum(ctx, (k) => (tens + k > 0 ? String(tens + k) : ''), ft, bx - 40, cy, bx - 40 - (x + 6), 44, 30, col, 1.6);
    // units drum: a taller window, like the Boeing readout
    box(ctx, bx - 39, cy - 34, 26, 68, "#000");
    ctx.strokeStyle = WHT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx - 39, cy - 24);
    ctx.lineTo(bx - 39, cy - 34);
    ctx.lineTo(bx - 13, cy - 34);
    ctx.lineTo(bx - 13, cy - 9);
    ctx.moveTo(bx - 13, cy + 9);
    ctx.lineTo(bx - 13, cy + 34);
    ctx.lineTo(bx - 39, cy + 34);
    ctx.lineTo(bx - 39, cy + 24);
    ctx.stroke();
    drum(ctx, (k) => String((((u + k) % 10) + 10) % 10), fu, bx - 14, cy, 24, 66, 30, col);
  }
  // selected speed above, Mach and ground speed below
  if (sel !== null)
    text(
      ctx,
      String(Math.round(sel)),
      x + w / 2,
      top - 22,
      MAG,
      24,
      "center",
      700,
    );
  const a = 661.5 * Math.sqrt(Math.max(0.6, (273.15 + d.oatC) / 288.15));
  const mach = d.tasKt / a;
  if (d.tasKt > 30) text(
    ctx,
    mach >= 0.995
      ? mach.toFixed(2)
      : `.${String(Math.round(mach * 1000)).padStart(3, "0")}`,
    x + w / 2,
    top + h + 24,
    WHT,
    22,
    "center",
    700,
  );
  text(
    ctx,
    `GS ${Math.round(d.gsSmooth)}`,
    x + w / 2,
    top + h + 50,
    WHT,
    18,
    "center",
    600,
  );
}

/** amber boxed failure flag (Boeing) */
function failFlag(ctx: CanvasRenderingContext2D, label: string, x: number, y: number) {
  ctx.font = "700 22px 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif";
  const w = ctx.measureText(label).width + 18;
  box(ctx, x - w / 2, y - 15, w, 30, "#000", AMB);
  text(ctx, label, x, y + 1, AMB, 22, "center", 700);
}

/** Failure flags (Boeing convention: the failed indication is removed and an amber boxed flag replaces it):
 *  ATT and HDG for an AHRS (IRS) failure, SPD / ALT / V/S for an air-data failure. */
function drawAirlinerFlags(ctx: CanvasRenderingContext2D, sim: Sim, cx: number, cy: number, AW: number, AH: number) {
  const f = sim.failures;
  const d = sim.ac.data;
  const att = f.ahrs || !Number.isFinite(d.pitchDeg) || !Number.isFinite(d.rollDeg);
  const adc = f.airData || !Number.isFinite(d.iasKt) || !Number.isFinite(sim.indicatedAlt());
  const flagBox = (label: string, x: number, y: number) => failFlag(ctx, label, x, y);
  if (att) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cx - AW, cy - AH, 2 * AW, 2 * AH, 34);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.restore();
    flagBox("ATT", cx, cy);
    box(ctx, cx - 270, 668 - 48, 540, AL_H - 668 + 48, "#000");
    flagBox("HDG", cx, 700);
  }
  if (att) {
    // ground speed comes from the IRS: removed with it
    box(ctx, 58, cy + 210 + 38, 118, 28, "#000");
  }
  if (adc) {
    // the speed tape goes with its bugs (flap manoeuvre speeds, selected speed) and the Mach read-out under it
    box(ctx, 55, cy - 213, 169, 426 + 38, "#000");
    flagBox("SPD", 58 + 59, cy);
    box(ctx, 741, cy - 213, 138, 426, "#000");
    flagBox("ALT", 744 + 66, cy);
    box(ctx, 879, cy - 178, 86, 356, "#000");
    flagBox("V/S", 922, cy);
  }
}

function drawAltTape(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  x: number,
  cy: number,
) {
  const alt = airDataShown(sim).altFt;
  const w = 132;
  const top = cy - 210;
  const h = 420;
  const fpx = 0.42;
  box(ctx, x, top, w, h, TAPE);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top, w, h);
  ctx.clip();
  const yOf = (a: number) => cy - (a - alt) * fpx;
  for (let a = Math.floor((alt - 600) / 100) * 100; a < alt + 600; a += 100) {
    const y = yOf(a);
    line(ctx, x, y, x + 14, y, WHT, 2);
    if (a % 200 === 0) text(ctx, String(a), x + 22, y, WHT, 20, "left", 600);
    if (a % 1000 === 0) {
      line(ctx, x + 18, y - 13, x + w, y - 13, WHT, 1.5);
      line(ctx, x + 18, y + 13, x + w, y + 13, WHT, 1.5);
    }
  }
  // landing altitude reference: amber hatching below the ground under the aircraft
  const gnd = alt - sim.ac.data.aglFt;
  const yg = yOf(gnd);
  if (yg < top + h) {
    line(ctx, x, yg, x + w, yg, AMB, 3);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + w - 16, yg, 16, top + h - yg);
    ctx.clip();
    for (let yy = yg - 16; yy < top + h; yy += 9)
      line(ctx, x + w - 16, yy + 16, x + w, yy, AMB, 2);
    ctx.restore();
  }
  // baro minimums pointer
  if (sim.av.minimums !== null) {
    const y = yOf(sim.av.minimums);
    line(ctx, x, y, x + 46, y, GRN, 3);
    poly(
      ctx,
      [
        [x, y],
        [x + 12, y - 9],
        [x + 12, y + 9],
      ],
      GRN,
    );
  }
  ctx.restore();
  // magenta selected-altitude bug on the left edge (parked half-visible when off scale)
  const yb = clamp(yOf(sim.ap.altSel), top, top + h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 4, top, w, h);
  ctx.clip();
  poly(
    ctx,
    [
      [x, yb - 22],
      [x + 20, yb - 22],
      [x + 20, yb + 22],
      [x, yb + 22],
      [x, yb + 9],
      [x + 9, yb],
      [x, yb - 9],
    ],
    undefined,
    MAG,
    3,
  );
  ctx.restore();
  // readout: thousands large, hundreds medium, 20-ft drum for the last two digits
  poly(
    ctx,
    [
      [x - 12, cy],
      [x + 2, cy - 12],
      [x + 2, cy - 25],
      [x + w + 4, cy - 25],
      [x + w + 4, cy + 25],
      [x + 2, cy + 25],
      [x + 2, cy + 12],
    ],
    "#000",
    WHT,
    2,
  );
  const a = Math.max(-1000, alt);
  const neg = a < 0;
  const aa = Math.abs(a);
  const last = aa % 100;
  const step20 = Math.floor(last / 20);
  const f20 = last / 20 - step20;
  // hundreds roll with the 20-ft drum between 80 and 100; thousands roll with the hundreds past 9
  const h100 = Math.floor(aa / 100);
  const fh = step20 === 4 ? f20 : 0;
  const fth = h100 % 10 === 9 ? fh : 0;
  const th = Math.floor(h100 / 10);
  const dx = x + w + 4 - 40;
  box(ctx, dx, cy - 36, 40, 72, "#000");
  ctx.strokeStyle = WHT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dx, cy - 25);
  ctx.lineTo(dx, cy - 36);
  ctx.lineTo(dx + 40, cy - 36);
  ctx.lineTo(dx + 40, cy + 36);
  ctx.lineTo(dx, cy + 36);
  ctx.lineTo(dx, cy + 25);
  ctx.stroke();
  drum(ctx, (k) => String(((((step20 + k) % 5) + 5) % 5) * 20).padStart(2, "0"), f20, dx + 40, cy, 39, 70, 22, WHT);
  drum(ctx, (k) => String((((h100 + k) % 10) + 10) % 10), fh, dx - 1, cy, 19, 46, 26, WHT, 1.7);
  drum(ctx, (k) => (th + k > 0 ? String(th + k) : neg && k === 0 ? "-" : ""), fth, dx - 20, cy, dx - 20 - (x + 4), 46, 32, WHT, 1.5);
  // selected altitude above, altimeter setting below
  text(ctx, String(sim.ap.altSel), x + w / 2, top - 22, MAG, 24, "center", 700);
  text(
    ctx,
    `${sim.av.baro.toFixed(2)} IN`,
    x + w / 2,
    top + h + 24,
    GRN,
    20,
    "center",
    700,
  );
}

function drawVsiAl(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  fpm: number,
  x: number,
  cy: number,
) {
  poly(
    ctx,
    [
      [x, cy - 170],
      [x + 30, cy - 170],
      [x + 58, cy - 60],
      [x + 58, cy + 60],
      [x + 30, cy + 170],
      [x, cy + 170],
    ],
    TAPE,
  );
  const yOf = (v: number) => {
    const s = Math.sign(v);
    const a = Math.abs(v);
    const f =
      a <= 1000
        ? (a / 1000) * 100
        : a <= 2000
          ? 100 + ((a - 1000) / 1000) * 40
          : 140 + Math.min(1, (a - 2000) / 4000) * 25;
    return cy - s * f;
  };
  for (const v of [-6000, -2000, -1000, -500, 500, 1000, 2000, 6000]) {
    const y = yOf(v);
    line(ctx, x + 4, y, x + 16, y, WHT, 2);
    if (Math.abs(v) >= 1000)
      text(ctx, String(Math.abs(v) / 1000), x + 18, y, WHT, 16, "left", 700);
  }
  line(ctx, x + 4, cy, x + 22, cy, WHT, 3);
  if (sim.ap.engaged && sim.ap.vert === "VS") {
    const y = yOf(sim.ap.vsSel);
    poly(
      ctx,
      [
        [x + 2, y - 6],
        [x + 14, y - 6],
        [x + 14, y + 6],
        [x + 2, y + 6],
      ],
      undefined,
      MAG,
      2.5,
    );
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, cy - 172, 60, 344);
  ctx.clip();
  line(ctx, x + 90, cy, x + 6, yOf(fpm), WHT, 3);
  ctx.restore();
  if (Math.abs(fpm) > 400)
    text(
      ctx,
      String(Math.round(Math.abs(fpm) / 50) * 50),
      x + 30,
      fpm > 0 ? cy - 188 : cy + 188,
      WHT,
      18,
      "center",
      700,
    );
}

function drawHdgArc(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  cx: number,
  cy: number,
) {
  const d = sim.ac.data;
  const R = 230;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 280, cy - 30, 560, 140);
  ctx.clip();
  ctx.translate(cx, cy + R - 10);
  ctx.fillStyle = "#3a3f45";
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(-d.hdgTrue * DEG);
  for (let a = 0; a < 360; a += 5) {
    const ang = (a - 90) * DEG;
    const l = a % 10 === 0 ? 16 : 9;
    line(
      ctx,
      Math.cos(ang) * R,
      Math.sin(ang) * R,
      Math.cos(ang) * (R - l),
      Math.sin(ang) * (R - l),
      WHT,
      2,
    );
    if (a % 30 === 0) {
      ctx.save();
      ctx.rotate(a * DEG);
      text(ctx, String(a / 10), 0, -R + 32, WHT, 20, "center", 600);
      ctx.restore();
    }
  }
  ctx.save();
  ctx.rotate(sim.ap.hdgBug * DEG);
  poly(
    ctx,
    [
      [-12, -R],
      [12, -R],
      [12, -R + 10],
      [0, -R + 4],
      [-12, -R + 10],
    ],
    undefined,
    MAG,
    2.5,
  );
  ctx.restore();
  ctx.save();
  ctx.rotate(d.trackSmooth * DEG);
  line(ctx, 0, -R + 6, 0, -R + 80, WHT, 2);
  ctx.restore();
  ctx.restore();
  box(ctx, cx - 36, cy - 38, 72, 32, "#000", WHT);
  text(ctx, pad3(d.hdgTrue), cx, cy - 22, WHT, 24, "center", 700);
  text(ctx, "MAG", cx + 50, cy - 22, GRN, 16, "left", 700);
  text(
    ctx,
    `${pad3(sim.ap.hdgBug)} H`,
    cx - 150,
    cy - 20,
    MAG,
    20,
    "center",
    700,
  );
}

// ------------------------------------------------------------------ ND (MAP mode)
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** greedy label placer: a label is drawn only where it does not overlap one already placed */
export class Placer {
  rects: Rect[] = [];
  reserve(r: Rect) {
    this.rects.push(r);
  }
  fits(r: Rect) {
    return !this.rects.some(
      (o) =>
        r.x < o.x + o.w &&
        r.x + r.w > o.x &&
        r.y < o.y + o.h &&
        r.y + r.h > o.y,
    );
  }
  /** try a few positions around a symbol; returns the chosen top-left or null */
  place(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    label: string,
    size: number,
    lines = 1,
  ): { x: number; y: number } | null {
    ctx.font = `600 ${size}px 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif`;
    const w = ctx.measureText(label).width + 4;
    const hh = size * 1.15 * lines;
    for (const [ox, oy] of [
      [12, -hh / 2 - 2],
      [12, -hh - 4],
      [12, 4],
      [-w - 12, -hh / 2 - 2],
      [-w - 12, 4],
    ]) {
      const r = { x: px + ox, y: py + oy, w, h: hh };
      if (this.fits(r)) {
        this.rects.push(r);
        return { x: r.x, y: r.y };
      }
    }
    return null;
  }
}

/** the flight-plan polyline from `fixes`: fly-by/fly-over turns from flyablePath, DME arcs drawn as arcs */
export function routePolyline(fixes: Waypoint[], gs: number): LatLon[] {
  const out: LatLon[] = [];
  let run: Waypoint[] = fixes.length ? [fixes[0]] : [];
  const flush = () => {
    if (run.length) out.push(...flyablePath(run, gs));
  };
  for (let i = 1; i < fixes.length; i++) {
    const w = fixes[i];
    if (w.arc) {
      flush();
      const c = w.arc.center;
      const b0 = bearingDeg(c, fixes[i - 1]);
      const b1 = bearingDeg(c, w);
      const sweep = w.arc.dir === "R" ? norm360(b1 - b0) : -norm360(b0 - b1);
      const nSeg = Math.max(2, Math.ceil(Math.abs(sweep) / 3));
      for (let k = 0; k <= nSeg; k++)
        out.push(destination(c, b0 + (sweep * k) / nSeg, w.arc.radius));
      run = [w];
    } else run.push(w);
  }
  if (run.length > 1 || !out.length) flush();
  return out;
}

/** Draw the display, then the cabin smoke veil over it (smokeHaze: electrical or engine fire) */
export function drawNd(ctx: CanvasRenderingContext2D, sim: Sim, rangeNm: number) {
  drawNdBody(ctx, sim, rangeNm);
  smokeHaze(ctx, sim, AL_W, AL_H, (typeof performance !== "undefined" ? performance.now() : 0) / 1000 + 0.7);
}

function drawNdBody(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  rangeNm: number,
) {
  const d = sim.ac.data;
  const s = sim.ac.s;
  // the ND (MFD position) is on the avionics bus
  if (!hasPower(sim, "mfd")) {
    darkScreen(ctx, AL_W, AL_H);
    return;
  }
  ctx.clearRect(0, 0, AL_W, AL_H);
  box(ctx, 0, 0, AL_W, AL_H, "#000");
  // no heading / position reference (IRS-AHRS failure): the map is removed, MAP and HDG flags
  if (sim.failures.ahrs || !Number.isFinite(d.hdgTrue)) {
    failFlag(ctx, "HDG", 512, 120);
    failFlag(ctx, "MAP", 512, 400);
    return;
  }
  const cx = 512;
  const cy = 652;
  const R = 516;
  const ppn = R / rangeNm;
  const up = d.hdgTrue; // heading-up MAP
  const a0 = up * DEG;
  const ca = Math.cos(a0);
  const sa = Math.sin(a0);
  const xy = (p: LatLon) => {
    const l = toLocal(s, p);
    return {
      x: cx + (l.x * ca - l.y * sa) * ppn,
      y: cy - (l.x * sa + l.y * ca) * ppn,
    };
  };
  const near = (p: LatLon) => {
    const l = toLocal(s, p);
    return Math.abs(l.x) < rangeNm * 1.3 && Math.abs(l.y) < rangeNm * 1.3;
  };
  const fp = sim.fp;
  const place = new Placer();
  // reserved zones: data blocks, heading box, compass numerals
  place.reserve({ x: 0, y: 0, w: 250, h: 124 });
  place.reserve({ x: AL_W - 240, y: 0, w: 240, h: 96 });
  place.reserve({ x: 0, y: AL_H - 92, w: 210, h: 92 });
  place.reserve({ x: AL_W - 210, y: AL_H - 92, w: 210, h: 92 });
  place.reserve({ x: cx - 90, y: 60, w: 180, h: 76 });
  place.reserve({ x: cx - 24, y: cy - 30, w: 48, h: 60 });

  // ---- map content, clipped to the compass circle
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  // half-range ring
  ctx.strokeStyle = "rgba(255,255,255,.8)";
  ctx.setLineDash([7, 9]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.5, -152 * DEG, -28 * DEG);
  ctx.stroke();
  ctx.setLineDash([]);
  // green altitude range arc: where the selected altitude will be reached
  const dAlt = sim.ap.altSel - sim.indicatedAlt();
  if (
    Math.abs(dAlt) > 60 &&
    Math.abs(d.vsFpm) > 150 &&
    Math.sign(dAlt) === Math.sign(d.vsFpm)
  ) {
    const dist = ((dAlt / d.vsFpm) * d.gsSmooth) / 60;
    if (dist > 0.2 && dist < rangeNm * 0.98) {
      const r = dist * ppn;
      const rt = (wrap180(d.trackSmooth - up) - 90) * DEG;
      const half = Math.min(0.6, 46 / r);
      ctx.strokeStyle = GRN;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, rt - half, rt + half);
      ctx.stroke();
    }
  }
  // airports
  for (const a of AIRPORTS) {
    if (!near(a)) continue;
    const p = xy(a);
    if (rangeNm <= 40) {
      for (let i = 0; i < a.runways.length; i += 2) {
        const r1 = xy(a.runways[i].threshold);
        const r2 = xy(a.runways[i].end);
        line(ctx, r1.x, r1.y, r2.x, r2.y, WHT, rangeNm <= 10 ? 4 : 3);
      }
    }
    ctx.strokeStyle = CYN;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
    ctx.stroke();
    const at = place.place(ctx, p.x, p.y - 8, a.icao, 16);
    if (at) text(ctx, a.icao, at.x, at.y + 9, CYN, 16, "left", 600);
  }
  // runway extended centreline of the tuned localizer (white dashed, 14 NM)
  for (const nv of NAVAIDS) {
    if (nv.type !== "ILS" && nv.type !== "LOC") continue;
    if (
      tunedNavaid(sim.av.nav1.active)?.ident !== nv.ident &&
      tunedNavaid(sim.av.nav2.active)?.ident !== nv.ident
    )
      continue;
    const a = xy(nv);
    const b = xy(destination(nv, (nv.course ?? 0) + 180, 14));
    ctx.setLineDash([12, 9]);
    line(ctx, a.x, a.y, b.x, b.y, "rgba(255,255,255,.75)", 1.5);
    ctx.setLineDash([]);
  }
  // flight-plan idents are drawn by the route: navaids and fixes show only their symbol there
  const inPlan = new Set(fp.wpts.map((w) => w.ident));
  const tuned = new Set(
    [
      sim.nav1.valid ? sim.nav1.ident : "",
      sim.nav2.valid ? sim.nav2.ident : "",
      sim.adf.valid ? sim.adf.ident : "",
    ].filter(Boolean),
  );
  const navLabels: [number, number, string, string][] = [];
  for (const nv of NAVAIDS) {
    if (nv.type === "ILS" || nv.type === "LOC" || !near(nv)) continue;
    const p = xy(nv);
    const col = tuned.has(nv.ident) ? GRN : CYN;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    if (nv.type === "NDB") {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.stroke();
      box(ctx, p.x - 1.5, p.y - 1.5, 3, 3, col);
    } else {
      // VOR: hexagon (with DME: open ears)
      const hex: [number, number][] = [];
      for (let k = 0; k < 6; k++)
        hex.push([
          p.x + Math.cos(k * 60 * DEG) * 8,
          p.y + Math.sin(k * 60 * DEG) * 8,
        ]);
      poly(ctx, hex, undefined, col, 2);
      box(ctx, p.x - 1.5, p.y - 1.5, 3, 3, col);
    }
    if (!inPlan.has(nv.ident)) navLabels.push([p.x, p.y, nv.ident, col]);
  }
  const fixLabels: [number, number, string][] = [];
  if (rangeNm <= 20) {
    for (const f of FIXES) {
      if (f.kind !== "fix" || inPlan.has(f.ident) || !near(f)) continue;
      const p = xy(f);
      poly(
        ctx,
        [
          [p.x, p.y - 7],
          [p.x + 6.5, p.y + 5],
          [p.x - 6.5, p.y + 5],
        ],
        undefined,
        CYN,
        1.6,
      );
      fixLabels.push([p.x, p.y, f.ident]);
    }
  }
  // ---- route: active leg magenta, the rest white, missed approach dashed; turns curved (fly-by / fly-over)
  const gs = Math.max(60, d.gsSmooth);
  const routeLabels: [number, number, string, string, number | undefined][] =
    [];
  if (fp.wpts.length && fp.active < fp.wpts.length) {
    const from: Waypoint | undefined = fp.directFrom
      ? { ...fp.directFrom, ident: "" }
      : fp.wpts[fp.active - 1];
    const ahead = fp.wpts.slice(fp.active);
    const firstMissed = fp.missedActive
      ? -1
      : ahead.findIndex((w) => w.appr === "missed");
    const main =
      firstMissed > 0
        ? ahead.slice(0, firstMissed)
        : firstMissed === 0
          ? []
          : ahead;
    const missed =
      firstMissed >= 0 ? ahead.slice(Math.max(0, firstMissed - 1)) : [];
    const seq = from ? [from, ...main] : main;
    const pts = routePolyline(seq, gs).map(xy);
    // split at the point of the path closest to the active waypoint: before = active leg
    const tgt = xy(fp.wpts[fp.active]);
    let split = pts.length - 1;
    let best = Infinity;
    pts.forEach((p, i) => {
      const dd = Math.hypot(p.x - tgt.x, p.y - tgt.y);
      if (dd < best - 0.5) {
        best = dd;
        split = i;
      }
    });
    if (!from) split = 0;
    const stroke = (
      ps: { x: number; y: number }[],
      col: string,
      w: number,
      dash?: number[],
    ) => {
      if (ps.length < 2) return;
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineJoin = "round";
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      ps.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.setLineDash([]);
    };
    stroke(pts.slice(split), WHT, 2.5);
    stroke(pts.slice(0, split + 1), MAG, 3.5);
    if (missed.length > 1)
      stroke(
        routePolyline(missed, gs).map(xy),
        "rgba(255,255,255,.8)",
        2,
        [10, 8],
      );
    // holds as racetracks
    for (let i = Math.max(0, fp.active - 1); i < fp.wpts.length; i++) {
      const w = fp.wpts[i];
      if (!w.hold) continue;
      const rt = racetrack(
        {
          fix: w,
          inbound: w.hold.inbound,
          turn: w.hold.turn,
          legMin: w.hold.legMin,
          altFt: 0,
        },
        gs,
      ).map(xy);
      rt.push(rt[0]);
      stroke(
        rt,
        i === fp.active && fp.holdActive ? MAG : WHT,
        2.5,
        w.appr === "missed" && !fp.missedActive ? [10, 8] : undefined,
      );
    }
    // waypoint stars
    const list = from && !fp.directFrom ? [fp.active - 1] : [];
    for (let i = fp.active; i < fp.wpts.length; i++) list.push(i);
    for (const i of list) {
      const w = fp.wpts[i];
      if (!near(w)) continue;
      const p = xy(w);
      const c = i === fp.active ? MAG : WHT;
      poly(
        ctx,
        [
          [p.x, p.y - 11],
          [p.x + 3.5, p.y - 3.5],
          [p.x + 11, p.y],
          [p.x + 3.5, p.y + 3.5],
          [p.x, p.y + 11],
          [p.x - 3.5, p.y + 3.5],
          [p.x - 11, p.y],
          [p.x - 3.5, p.y - 3.5],
        ],
        "#000",
        c,
        2,
      );
      routeLabels.push([p.x, p.y, w.ident, c, w.altMin]);
    }
  }
  // labels: route first (priority), then navaids, airports already placed, fixes last
  for (const [x, y, id, c, alt] of routeLabels) {
    const at = place.place(ctx, x, y, alt ? `${id}  ` : id, 17, alt ? 2 : 1);
    if (!at) continue;
    text(ctx, id, at.x, at.y + 10, c, 17, "left", 700);
    if (alt) text(ctx, String(alt), at.x, at.y + 29, c, 15, "left", 600);
  }
  for (const [x, y, id, c] of navLabels) {
    const at = place.place(ctx, x, y, id, 16);
    if (at) text(ctx, id, at.x, at.y + 9, c, 16, "left", 600);
  }
  for (const [x, y, id] of fixLabels) {
    const at = place.place(ctx, x, y, id, 14);
    if (at) text(ctx, id, at.x, at.y + 8, CYN, 14, "left", 600);
  }
  ctx.restore();

  // ---- compass rose arc (ticks and numerals inside the arc), heading pointer, bugs, track line
  ctx.strokeStyle = WHT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, -152 * DEG, -28 * DEG);
  ctx.stroke();
  for (let k = -60; k <= 60; k += 5) {
    const hd = Math.round((up + k) / 5) * 5;
    const rel = wrap180(hd - up);
    if (Math.abs(rel) > 61) continue;
    const ang = (rel - 90) * DEG;
    const l = hd % 10 === 0 ? 16 : 9;
    line(
      ctx,
      cx + Math.cos(ang) * R,
      cy + Math.sin(ang) * R,
      cx + Math.cos(ang) * (R - l),
      cy + Math.sin(ang) * (R - l),
      WHT,
      2,
    );
    if (hd % 10 === 0) {
      ctx.save();
      ctx.translate(
        cx + Math.cos(ang) * (R - 32),
        cy + Math.sin(ang) * (R - 32),
      );
      ctx.rotate(rel * DEG);
      text(
        ctx,
        String(norm360(hd) / 10),
        0,
        0,
        WHT,
        hd % 30 === 0 ? 22 : 17,
        "center",
        hd % 30 === 0 ? 700 : 600,
      );
      ctx.restore();
    }
  }
  // half-range label on the ring (left side, on black)
  {
    const ang = (-50 - 90) * DEG;
    const lx = cx + Math.cos(ang) * R * 0.5;
    const ly = cy + Math.sin(ang) * R * 0.5;
    const lbl = String(rangeNm / 2);
    box(ctx, lx - 22, ly - 12, 44, 24, "#000");
    text(ctx, lbl, lx, ly, WHT, 17, "center", 600);
  }
  // track line (dashed, airplane → arc) with a tick at the arc
  const rt = wrap180(d.trackSmooth - up);
  const at = (rt - 90) * DEG;
  ctx.setLineDash([12, 9]);
  line(
    ctx,
    cx + Math.cos(at) * 26,
    cy + Math.sin(at) * 26,
    cx + Math.cos(at) * (R - 4),
    cy + Math.sin(at) * (R - 4),
    WHT,
    2,
  );
  ctx.setLineDash([]);
  line(
    ctx,
    cx + Math.cos(at) * R,
    cy + Math.sin(at) * R,
    cx + Math.cos(at) * (R - 24),
    cy + Math.sin(at) * (R - 24),
    WHT,
    3,
  );
  // selected heading bug (magenta, on the arc) and its dashed line in HDG SEL
  const rb = wrap180(sim.ap.hdgBug - up);
  if (sim.ap.engaged && sim.ap.lat === "HDG") {
    const ab = (clamp(rb, -61, 61) - 90) * DEG;
    ctx.setLineDash([8, 10]);
    line(
      ctx,
      cx + Math.cos(ab) * 26,
      cy + Math.sin(ab) * 26,
      cx + Math.cos(ab) * (R - 6),
      cy + Math.sin(ab) * (R - 6),
      MAG,
      1.5,
    );
    ctx.setLineDash([]);
  }
  {
    const rbc = clamp(rb, -61, 61);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rbc * DEG);
    poly(
      ctx,
      [
        [-13, -R],
        [-13, -R - 11],
        [-5, -R - 11],
        [0, -R - 3],
        [5, -R - 11],
        [13, -R - 11],
        [13, -R],
      ],
      undefined,
      MAG,
      2.5,
    );
    ctx.restore();
  }
  // bearing pointers (VOR green, ADF cyan): head near the arc, tail opposite
  const ptr = (brg: number, col: string, dbl: boolean) => {
    const rel = wrap180(brg - up);
    if (Math.abs(rel) > 61) return;
    const r0 = R * 0.62;
    const r1 = R - 26;
    const ang = (rel - 90) * DEG;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const nx = -uy;
    const ny = ux;
    for (const o of dbl ? [-4, 4] : [0]) line(ctx, cx + ux * r0 + nx * o, cy + uy * r0 + ny * o, cx + ux * (r1 - 10) + nx * o, cy + uy * (r1 - 10) + ny * o, col, 2.5);
    poly(ctx, [[cx + ux * r1, cy + uy * r1], [cx + ux * (r1 - 16) + nx * 8, cy + uy * (r1 - 16) + ny * 8], [cx + ux * (r1 - 16) - nx * 8, cy + uy * (r1 - 16) - ny * 8]], undefined, col, 2.5);
  };
  const b1 = sim.av.bearing1;
  const b2 = sim.av.bearing2;
  if (b1 === "NAV1" && sim.nav1.valid) ptr(sim.nav1.bearingTo, GRN, false);
  if (b1 === "ADF" && sim.adf.valid) ptr(sim.adf.bearingTo, CYN, false);
  if (b1 === "GPS" && fp.out.valid) ptr(fp.out.bearingTo, MAG, false);
  if (b2 === "NAV2" && sim.nav2.valid) ptr(sim.nav2.bearingTo, GRN, true);
  if (b2 === "ADF" && sim.adf.valid) ptr(sim.adf.bearingTo, CYN, true);
  if (b2 === "GPS" && fp.out.valid) ptr(fp.out.bearingTo, MAG, true);
  // heading pointer and box (HDG up, magnetic)
  poly(
    ctx,
    [
      [cx, cy - R + 1],
      [cx - 10, cy - R - 16],
      [cx + 10, cy - R - 16],
    ],
    WHT,
  );
  box(ctx, cx - 38, cy - R - 54, 76, 34, "#000", WHT);
  text(ctx, pad3(up), cx, cy - R - 36, WHT, 26, "center", 700);
  text(ctx, "HDG", cx - 48, cy - R - 36, GRN, 18, "right", 700);
  text(ctx, "MAG", cx + 48, cy - R - 36, GRN, 18, "left", 700);
  // own ship (white triangle, apex at the aircraft position)
  poly(
    ctx,
    [
      [cx, cy - 2],
      [cx - 14, cy + 28],
      [cx + 14, cy + 28],
    ],
    "#000",
    WHT,
    3,
  );
  line(ctx, cx, cy + 28, cx, cy + 40, WHT, 3);
  // VNAV / glidepath deviation scale (right side) on an approach with vertical guidance
  const n = sim.navInputs();
  if (n.gps.gpValid && n.cdi === "GPS") {
    const vx = AL_W - 36;
    const vy = 420;
    for (const k of [-2, -1, 1, 2]) {
      ctx.strokeStyle = WHT;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(vx, vy + k * 34, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    line(ctx, vx - 14, vy, vx + 14, vy, WHT, 2.5);
    const y = vy - clamp(n.gps.gpDev, -1.2, 1.2) * 68;
    poly(
      ctx,
      [
        [vx, y - 11],
        [vx + 9, y],
        [vx, y + 11],
        [vx - 9, y],
      ],
      MAG,
      MAG,
    );
  }
  // top left: GS / TAS / wind
  text(ctx, "GS", 16, 26, WHT, 17, "left", 600);
  text(ctx, String(Math.round(d.gsSmooth)), 46, 26, WHT, 26, "left", 700);
  text(ctx, "TAS", 112, 26, WHT, 17, "left", 600);
  text(ctx, String(Math.round(d.tasKt)), 148, 26, WHT, 26, "left", 700);
  if (d.windKt > 1) {
    text(
      ctx,
      `${pad3(d.windDir)}°/${Math.round(d.windKt)}`,
      16,
      56,
      WHT,
      20,
      "left",
      700,
    );
    ctx.save();
    ctx.translate(36, 96);
    ctx.rotate((d.windDir + 180 - up) * DEG);
    line(ctx, 0, -18, 0, 16, WHT, 2.5);
    poly(
      ctx,
      [
        [0, 20],
        [-7, 8],
        [7, 8],
      ],
      WHT,
    );
    ctx.restore();
  }
  // top right: active waypoint, ETA, distance to go
  const g = fp.out;
  if (g.valid) {
    text(ctx, g.toIdent, AL_W - 16, 26, MAG, 26, "right", 700);
    const eta = g.eteMin !== null ? sim.time / 60 + g.eteMin : null;
    if (eta !== null) {
      const hh = Math.floor((eta / 60 + 14) % 24);
      const mm = Math.floor(eta % 60);
      text(
        ctx,
        `${String(hh).padStart(2, "0")}${String(mm).padStart(2, "0")}.${Math.floor(((eta * 60) % 60) / 6)}z`,
        AL_W - 16,
        56,
        WHT,
        20,
        "right",
        600,
      );
    }
    text(
      ctx,
      `${g.distNm.toFixed(1)} NM`,
      AL_W - 16,
      82,
      WHT,
      20,
      "right",
      600,
    );
  }
  // bottom corners: VOR / ADF L and R
  const side = (
    sel: string,
    nav: typeof sim.nav1,
    radio: { active: number },
    isL: boolean,
  ) => {
    const x = isL ? 16 : AL_W - 16;
    const al: CanvasTextAlign = isL ? "left" : "right";
    if (sel === "ADF") {
      text(ctx, isL ? "ADF L" : "ADF R", x, AL_H - 74, CYN, 16, al, 700);
      text(
        ctx,
        sim.adf.valid ? sim.adf.ident : String(sim.av.adf.active),
        x,
        AL_H - 48,
        CYN,
        22,
        al,
        700,
      );
      return;
    }
    text(ctx, isL ? "VOR L" : "VOR R", x, AL_H - 74, GRN, 16, al, 700);
    text(
      ctx,
      nav.valid ? nav.ident : radio.active.toFixed(2),
      x,
      AL_H - 48,
      GRN,
      22,
      al,
      700,
    );
    text(
      ctx,
      nav.valid && nav.dmeNm !== null
        ? `DME ${nav.dmeNm.toFixed(1)}`
        : "DME ---",
      x,
      AL_H - 22,
      GRN,
      18,
      al,
      600,
    );
  };
  side(b1, sim.nav1, sim.av.nav1, true);
  side(b2, sim.nav2, sim.av.nav2, false);
}
