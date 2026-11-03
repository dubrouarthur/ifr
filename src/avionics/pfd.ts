// G1000-style Primary Flight Display, rendered on a 1024×768 logical canvas.
import type { Sim } from '../sim/sim';
import { AIRFRAME } from '../sim/aircraft';
import { C, FONT, box, line, poly, text, pad3, fmtFreq } from './draw';
import { runwaysInView } from './world3d';
import { wrap180, DEG } from '../nav/geo';
import { tunedNavaid } from '../nav/radios';
import { drawMap } from './mfd';

export const PFD_W = 1024;
export const PFD_H = 768;
const CX = 512;
const CY = 268;
const PPD = 10; // pixels per degree of pitch

export const PFD_SOFTKEYS = ['', 'INSET', 'SVT', 'BRG1', 'BRG2', 'CDI', 'DME', 'TMR/REF', 'XPDR', 'IDENT', 'MINS', 'ALERTS'];
/** softkeys the trainer does not model: drawn dimmed so they never look like a live function */
const INERT_SOFTKEYS = new Set(['ENGINE', 'ALERTS']);

/** G1000 reference speeds (C172). AIRFRAME has no Vx / Vglide: published C172S values. */
export const VSPEEDS = { vr: AIRFRAME.vr, vx: 62, vy: AIRFRAME.vy, vg: 68 };

// ------------------------------------------------------------------ legibility
/** Secondary-text scale: the canvas is often shown at 0.3–0.5× its logical size, so small labels get bigger. */
let SEC = 1;
/** Scale factor for secondary text on a canvas shown `cssWidth` px wide (1 at full size, 1.25 when small). */
export function secondaryTextScale(cssWidth: number, logicalW = PFD_W): number {
  const k = cssWidth > 0 ? cssWidth / logicalW : 1;
  return k < 0.55 ? 1.25 : 1;
}
/** Set the secondary-text scale from the canvas being drawn (PFD and MFD call this). */
export function setTextScaleFor(ctx: CanvasRenderingContext2D, logicalW = PFD_W) {
  const c = ctx.canvas as HTMLCanvasElement | undefined;
  SEC = secondaryTextScale(c && 'clientWidth' in c ? c.clientWidth : 0, logicalW);
}
/** Font size of a secondary label: scaled up on small screens, never below 15 logical px then. */
export const fs = (n: number) => (SEC > 1 ? Math.max(15, n * SEC) : n);
/** Text width at a given size/weight. */
export function tw(ctx: CanvasRenderingContext2D, s: string, size: number, weight = 600) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  return ctx.measureText(s).width;
}

// ------------------------------------------------------------------ rolling drums
/**
 * Odometer drum state for a readout whose lowest drum counts `step` units modulo `mod`
 * (IAS: step 1, mod 10, the ones digit; altimeter: step 20, mod 100, the 20-ft drum).
 * `hi` is the value of the upper digits; while the low drum is in its last step the upper
 * digits roll towards `hi + 1` by `hiFrac` (0..1), exactly like a mechanical counter.
 */
export interface Drum {
  hi: number;
  hiFrac: number;
  low: number;
  lowFrac: number;
}
export function drum(v: number, step: number, mod: number): Drum {
  const a = Math.max(0, v);
  const hi = Math.floor(a / mod);
  const rest = a - hi * mod;
  const low = Math.min(mod - step, Math.floor(rest / step) * step);
  const lowFrac = Math.min(1, (rest - low) / step);
  const hiFrac = rest > mod - step ? Math.min(1, (rest - (mod - step)) / step) : 0;
  return { hi, hiFrac, low, lowFrac };
}
/** The value a pilot reads off the drums (each drum shows the digit nearest the centre line). */
export function drumReading(d: Drum, step: number, mod: number): number {
  const low = d.lowFrac >= 0.5 ? (d.low + step) % mod : d.low;
  const hi = d.hiFrac >= 0.5 ? d.hi + 1 : d.hi;
  return hi * mod + low;
}

/** Draws the upper digits of a drum readout right-aligned at `xr`, rolling only the digits that change. */
function drawHiDigits(ctx: CanvasRenderingContext2D, hi: number, hiFrac: number, xr: number, cy: number, size: number, color: string, pitch: number, clip: { top: number; bot: number; left: number }) {
  ctx.font = `700 ${size}px ${FONT}`;
  const dw = ctx.measureText('0').width;
  const cur = hi > 0 ? String(hi) : '';
  const nxt = String(hi + 1);
  const n = Math.max(cur.length, nxt.length);
  ctx.save();
  ctx.beginPath();
  ctx.rect(clip.left, clip.top, xr - clip.left + 2, clip.bot - clip.top);
  ctx.clip();
  for (let i = 0; i < n; i++) {
    const cd = cur[cur.length - 1 - i] ?? '';
    const nd = nxt[nxt.length - 1 - i] ?? '';
    const x = xr - i * dw - dw / 2;
    if (cd === nd || hiFrac <= 0) {
      if (cd) text(ctx, cd, x, cy, color, size, 'center', 700);
    } else {
      if (cd) text(ctx, cd, x, cy + hiFrac * pitch, color, size, 'center', 700);
      text(ctx, nd, x, cy - (1 - hiFrac) * pitch, color, size, 'center', 700);
    }
  }
  ctx.restore();
}

export interface PfdState {
  svt: boolean;
  dmeWindow: boolean;
  iasTrend: number;
  altTrend: number;
  lastIas: number;
  lastT: number;
  lastAlt: number;
  flash: number;
  softkeyFlash: number | null;
}

export const newPfdState = (): PfdState => ({
  svt: true,
  dmeWindow: false,
  iasTrend: 0,
  altTrend: 0,
  lastIas: 0,
  lastT: 0,
  lastAlt: 0,
  flash: 0,
  softkeyFlash: null,
});

export function drawPfd(ctx: CanvasRenderingContext2D, sim: Sim, st: PfdState, dt: number) {
  const d = sim.ac.data;
  setTextScaleFor(ctx, PFD_W);
  st.flash += dt;
  // trend vectors on the SIM clock (immune to frame drops, pause, sim rate and replay):
  // airspeed predicted 6 s ahead (G1000), filtered, capped
  const simDt = sim.time - st.lastT;
  if (simDt > 0 && simDt < 1 && !sim.replaying) {
    const accel = (d.iasKt - st.lastIas) / simDt; // kt/s
    const target = Math.max(-40, Math.min(40, accel * 6));
    st.iasTrend += (target - st.iasTrend) * Math.min(1, simDt / 0.8);
    // altitude 6 s ahead (ft)
    st.altTrend += ((d.vsFpm / 10) - st.altTrend) * Math.min(1, simDt * 2);
  } else if (simDt >= 1 || simDt < 0) st.iasTrend = 0;
  if (simDt !== 0) st.lastT = sim.time;
  if (simDt !== 0) st.lastIas = d.iasKt;
  void dt;
  st.lastAlt = d.altFt;

  ctx.save();
  ctx.clearRect(0, 0, PFD_W, PFD_H);
  drawAttitude(ctx, sim, st);
  drawTopBar(ctx, sim);
  drawApBar(ctx, sim, st);
  drawAirspeed(ctx, sim, st);
  drawAltimeter(ctx, sim, st);
  drawVsi(ctx, sim);
  drawHsi(ctx, sim, st);
  drawLowerWindows(ctx, sim, st);
  drawFailures(ctx, sim, st);
  drawSoftkeys(ctx, PFD_SOFTKEYS, st.softkeyFlash, {
    INSET: sim.av.inset,
    SVT: st.svt,
    BRG1: sim.av.bearing1 !== 'OFF',
    BRG2: sim.av.bearing2 !== 'OFF',
    DME: st.dmeWindow,
    'TMR/REF': sim.chrono() !== null,
  });
  ctx.restore();
}

// ------------------------------------------------------------------ attitude
function drawAttitude(ctx: CanvasRenderingContext2D, sim: Sim, st: PfdState) {
  const d = sim.ac.data;
  const roll = d.rollDeg * DEG;
  const pitch = d.pitchDeg;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, PFD_W, PFD_H);
  ctx.clip();
  ctx.translate(CX, CY);
  ctx.rotate(-roll);
  ctx.translate(0, pitch * PPD);
  // sky/ground
  const R = 1400;
  const sky = ctx.createLinearGradient(0, -500, 0, 0);
  sky.addColorStop(0, '#1d4fa8');
  sky.addColorStop(1, '#5f9cf0');
  ctx.fillStyle = sky;
  ctx.fillRect(-R, -R, 2 * R, R);
  const gnd = ctx.createLinearGradient(0, 0, 0, 500);
  if (st.svt) {
    gnd.addColorStop(0, '#5c7a3a');
    gnd.addColorStop(1, '#2f4a1f');
  } else {
    gnd.addColorStop(0, '#8a5a24');
    gnd.addColorStop(1, '#4e3112');
  }
  ctx.fillStyle = gnd;
  ctx.fillRect(-R, 0, 2 * R, R);

  // synthetic vision runways
  if (st.svt) {
    const cam = { lat: sim.ac.s.lat, lon: sim.ac.s.lon, altFt: sim.ac.s.altFt + sim.cockpitEyeFt, hdgTrue: d.hdgTrue };
    for (const rw of runwaysInView(cam, 20)) {
      ctx.beginPath();
      rw.corners.forEach((p, i) => {
        const x = p.az * PPD;
        const y = -p.el * PPD;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = '#444b52';
      ctx.fill();
      ctx.strokeStyle = '#e8e8e8';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (rw.dist < 6) {
        // centreline stripes are fixed on the ground: they flow towards the aircraft during the take-off roll
        ctx.beginPath();
        for (const [a, b] of rw.stripes) {
          ctx.moveTo(a.az * PPD, -a.el * PPD);
          ctx.lineTo(b.az * PPD, -b.el * PPD);
        }
        ctx.stroke();
      }
    }
    // flight path marker
    const fpaDeg = Math.atan2(d.vsFpm, Math.max(30, d.gsKt) * 101.27) / DEG;
    const drift = wrap180(d.trackTrue - d.hdgTrue);
    if (!sim.ac.s.onGround) {
      const x = drift * PPD;
      const y = -fpaDeg * PPD;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(roll);
      ctx.strokeStyle = '#00ff3c';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.moveTo(-8, 0);
      ctx.lineTo(-20, 0);
      ctx.moveTo(8, 0);
      ctx.lineTo(20, 0);
      ctx.moveTo(0, -8);
      ctx.lineTo(0, -15);
      ctx.stroke();
      ctx.restore();
    }
  }
  // horizon line
  line(ctx, -R, 0, R, 0, C.white, 2);
  // heading marks on horizon (SVT style)
  if (st.svt) {
    for (let h = -60; h <= 60; h += 10) {
      const hdg = Math.round((d.hdgTrue + h) / 10) * 10;
      const x = wrap180(hdg - d.hdgTrue) * PPD;
      line(ctx, x, 0, x, -8, C.white, 1.5);
      if (hdg % 30 === 0) text(ctx, pad3(hdg).slice(0, 2), x, -16, C.white, 13, 'center');
    }
  }
  // pitch ladder (clipped)
  ctx.save();
  ctx.beginPath();
  ctx.rect(-160, -pitch * PPD - 165, 320, 285);
  ctx.clip();
  for (let p = -90; p <= 90; p += 2.5) {
    if (p === 0) continue;
    const y = -p * PPD;
    const major = p % 10 === 0;
    const mid = p % 5 === 0;
    const w = major ? 70 : mid ? 35 : 15;
    line(ctx, -w, y, w, y, C.white, 2);
    if (major) {
      text(ctx, String(Math.abs(p)), -w - 18, y, C.white, 16, 'center');
      text(ctx, String(Math.abs(p)), w + 18, y, C.white, 16, 'center');
    }
  }
  ctx.restore();
  ctx.restore();

  // roll scale (fixed)
  const RR = 168;
  ctx.save();
  ctx.translate(CX, CY);
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, RR, (-150 * Math.PI) / 180, (-30 * Math.PI) / 180);
  ctx.stroke();
  for (const a of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
    const r2 = Math.abs(a) === 30 || Math.abs(a) === 60 ? RR + 20 : RR + 11;
    const ang = (a - 90) * DEG;
    if (Math.abs(a) === 45) {
      poly(ctx, [
        [Math.cos(ang) * (RR + 1), Math.sin(ang) * (RR + 1)],
        [Math.cos(ang - 0.025) * (RR + 13), Math.sin(ang - 0.025) * (RR + 13)],
        [Math.cos(ang + 0.025) * (RR + 13), Math.sin(ang + 0.025) * (RR + 13)],
      ], C.white);
    } else line(ctx, Math.cos(ang) * RR, Math.sin(ang) * RR, Math.cos(ang) * r2, Math.sin(ang) * r2, C.white, 2.5);
  }
  poly(ctx, [[0, -RR - 1], [-9, -RR - 16], [9, -RR - 16]], C.white);
  // roll pointer + slip
  ctx.rotate(-roll);
  poly(ctx, [[0, -RR + 1], [-11, -RR + 18], [11, -RR + 18]], C.white, C.black, 1);
  const slip = sim.ac.data.slip * 18;
  poly(ctx, [[-13 + slip, -RR + 22], [13 + slip, -RR + 22], [15 + slip, -RR + 28], [-15 + slip, -RR + 28]], C.white, C.black, 1);
  ctx.restore();

  // flight director (magenta command bars)
  if (sim.ap.fd) {
    ctx.save();
    ctx.translate(CX, CY);
    ctx.translate(0, -Math.max(-15, Math.min(15, sim.ap.pitchCmd - d.pitchDeg)) * PPD);
    ctx.rotate(Math.max(-30, Math.min(30, sim.ap.bankCmd - d.rollDeg)) * DEG);
    poly(ctx, [[0, 0], [-120, 34], [-120, 46], [-40, 26]], C.magenta, C.black, 1);
    poly(ctx, [[0, 0], [120, 34], [120, 46], [40, 26]], C.magenta, C.black, 1);
    ctx.restore();
  }
  // aircraft symbol (single cue, yellow)
  ctx.save();
  ctx.translate(CX, CY);
  poly(ctx, [[0, 0], [-110, 32], [-80, 32], [0, 10]], C.yellow, C.black, 1.5);
  poly(ctx, [[0, 0], [110, 32], [80, 32], [0, 10]], C.yellow, C.black, 1.5);
  poly(ctx, [[-180, -3], [-140, -3], [-140, 4], [-180, 4]], C.yellow, C.black, 1.5);
  poly(ctx, [[180, -3], [140, -3], [140, 4], [180, 4]], C.yellow, C.black, 1.5);
  ctx.restore();

  // annunciations (the outside-view veil and the top bar are the pause cue: nothing is drawn over the attitude)
  if (d.stallWarn && Math.floor(st.flash * 3) % 2 === 0) {
    box(ctx, CX - 60, CY + 70, 120, 32, C.red);
    text(ctx, 'STALL', CX, CY + 86, C.white, 22, 'center', 700);
  }
  const mins = sim.av.minimums;
  if (mins !== null && sim.indicatedAlt() < mins && !sim.ac.s.onGround) {
    const s = fs(20);
    const w = tw(ctx, 'MINIMUMS', s, 700) + 14;
    box(ctx, 774 - w, CY + 126, w, s + 8, 'rgba(0,0,0,0.6)');
    text(ctx, 'MINIMUMS', 774 - w / 2, CY + 130 + s / 2, C.yellow, s, 'center', 700);
  }
  if (sim.ac.s.crashed) {
    box(ctx, CX - 210, CY - 40, 420, 80, 'rgba(160,0,0,0.85)', C.white);
    text(ctx, 'CRASH', CX, CY - 12, C.white, 28, 'center', 700);
    text(ctx, sim.ac.s.crashed, CX, CY + 20, C.white, 16, 'center');
  }
}

// ------------------------------------------------------------------ top bar
/** Horizontal double arrow (frequency transfer) centred at x, y. */
function xferArrow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, color: string) {
  const h = w / 2;
  line(ctx, x - h + 3, y, x + h - 3, y, color, 1.6);
  poly(ctx, [[x - h, y], [x - h + 6, y - 4], [x - h + 6, y + 4]], color);
  poly(ctx, [[x + h, y], [x + h - 6, y - 4], [x + h - 6, y + 4]], color);
}

interface Field {
  label: string;
  value: string;
  color?: string;
}
/** Draws label/value pairs on one row centred at cx. */
function fieldRow(ctx: CanvasRenderingContext2D, fields: Field[], cx: number, y: number, ls: number, vs: number) {
  const gap = 16;
  const widths = fields.map((f) => tw(ctx, f.label, ls) + 5 + tw(ctx, f.value, vs));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (fields.length - 1);
  let x = cx - total / 2;
  fields.forEach((f, i) => {
    text(ctx, f.label, x, y, C.white, ls);
    text(ctx, f.value, x + tw(ctx, f.label, ls) + 5, y, f.color ?? C.magenta, vs);
    x += widths[i] + gap;
  });
}

const fmtEte = (min: number | null) => {
  if (min === null || !Number.isFinite(min)) return '__:__';
  if (min >= 60) return `${Math.floor(min / 60)}:${String(Math.floor(min % 60)).padStart(2, '0')}h`;
  const m = Math.floor(min);
  const s = Math.min(59, Math.round((min - m) * 60));
  return `${m}:${String(s).padStart(2, '0')}`;
};

/** NAV/COM boxes and the navigation status (PFD) or data fields (MFD: GS, DTK, TRK, DIS, ETE). */
export function drawTopBar(ctx: CanvasRenderingContext2D, sim: Sim, kind: 'PFD' | 'MFD' = 'PFD') {
  box(ctx, 0, 0, PFD_W, 52, '#000');
  line(ctx, 0, 52.5, PFD_W, 52.5, '#4a4f55', 1);
  const av = sim.av;
  const ls = fs(15);
  const fsz = fs(19);
  const lw = tw(ctx, 'NAV2', ls);
  const fwN = tw(ctx, '000.00', fsz);
  const fwC = tw(ctx, '000.000', fsz);
  const aw = 20;
  // NAV (left): label · active · ⇄ · standby (cyan tuning box on NAV1) · ident
  const xA = 8 + lw + 10;
  const xArr = xA + fwN + 6 + aw / 2;
  const xS = xA + fwN + 12 + aw;
  const navRow = (y: number, label: string, r: { active: number; standby: number }, selected: boolean, tuning: boolean) => {
    const n = tunedNavaid(r.active);
    text(ctx, label, 8, y, C.white, ls);
    text(ctx, fmtFreq(r.active), xA, y, selected ? C.green : C.white, fsz);
    xferArrow(ctx, xArr, y, aw, C.white);
    text(ctx, fmtFreq(r.standby), xS, y, C.white, fsz);
    if (tuning) {
      ctx.strokeStyle = C.cyan;
      ctx.lineWidth = 2;
      ctx.strokeRect(xS - 4, y - fsz / 2 - 2, fwN + 8, fsz + 4);
    }
    if (n) text(ctx, n.ident, xS + fwN + 12, y, selected ? C.green : C.white, ls);
  };
  navRow(15, 'NAV1', av.nav1, av.cdi === 'NAV1', true);
  navRow(38, 'NAV2', av.nav2, av.cdi === 'NAV2', false);
  // COM (right, mirrored): active (green = transmit) · ⇄ · standby (cyan tuning box on COM1) · label
  const xCs = PFD_W - 8 - lw - 16 - fwC;
  const xCarr = xCs - 6 - aw / 2;
  const xCa = xCs - 12 - aw - fwC;
  const comRow = (y: number, label: string, r: { active: number; standby: number }, sel: boolean, tuning: boolean) => {
    text(ctx, r.active.toFixed(3), xCa, y, sel ? C.green : C.white, fsz);
    xferArrow(ctx, xCarr, y, aw, C.white);
    text(ctx, r.standby.toFixed(3), xCs, y, C.white, fsz);
    if (tuning) {
      ctx.strokeStyle = C.cyan;
      ctx.lineWidth = 2;
      ctx.strokeRect(xCs - 4, y - fsz / 2 - 2, fwC + 8, fsz + 4);
    }
    text(ctx, label, PFD_W - 8, y, C.white, ls, 'right');
  };
  comRow(15, 'COM1', av.com1, true, true);
  comRow(38, 'COM2', av.com2, false, false);
  // centre block
  const left = xS + fwN + 12 + tw(ctx, 'WWWW', ls) + 6;
  const right = xCa - 14;
  const cx = (left + right) / 2;
  line(ctx, left - 4, 4, left - 4, 48, '#2c3137', 1);
  line(ctx, right + 6, 4, right + 6, 48, '#2c3137', 1);
  const g = sim.fp.out;
  const d = sim.ac.data;
  if (kind === 'MFD') {
    fieldRow(ctx, [
      { label: 'GS', value: `${Math.round(d.gsKt)}KT` },
      { label: 'DTK', value: g.valid ? `${pad3(g.dtk)}°` : '___°' },
      { label: 'TRK', value: `${pad3(d.trackTrue)}°` },
    ], cx, 15, fs(14), fs(17));
    fieldRow(ctx, [
      { label: 'DIS', value: g.valid ? `${g.distNm.toFixed(g.distNm < 10 ? 1 : 0)}NM` : '__._NM' },
      { label: 'ETE', value: g.valid ? fmtEte(g.eteMin) : '__:__' },
    ], cx, 38, fs(14), fs(17));
    return;
  }
  if (g.valid) {
    const ls2 = fs(17);
    if (g.holding) text(ctx, `HOLD ${g.toIdent}${g.holdEntry && g.holdPhase !== 'racetrack' ? ' · ' + g.holdEntry + ' ENTRY' : ''}`, cx, 15, C.magenta, ls2, 'center');
    else {
      // "FROM → TO" with a drawn arrow
      const from = g.fromIdent || '';
      const a = from ? tw(ctx, from, ls2) : 0;
      const b = tw(ctx, g.toIdent, ls2);
      const total = a + (from ? 34 : 28) + b;
      let x = cx - total / 2;
      if (from) {
        text(ctx, from, x, 15, C.magenta, ls2);
        x += a + 6;
      }
      line(ctx, x, 15, x + 17, 15, C.magenta, 2);
      poly(ctx, [[x + 22, 15], [x + 14, 10.5], [x + 14, 19.5]], C.magenta);
      text(ctx, g.toIdent, x + 28, 15, C.magenta, ls2);
    }
    if (g.suspended) text(ctx, 'SUSP', right, 15, C.yellow, ls2, 'right');
    fieldRow(ctx, [
      { label: 'DIS', value: `${g.distNm.toFixed(g.distNm < 10 ? 1 : 0)}NM` },
      { label: 'DTK', value: `${pad3(g.dtk)}°` },
      { label: 'TRK', value: `${pad3(d.trackTrue)}°` },
      ...(g.eteMin !== null ? [{ label: 'ETE', value: fmtEte(g.eteMin) }] : []),
    ], cx, 38, fs(14), fs(17));
  } else {
    text(ctx, 'NO FLIGHT PLAN', cx, 15, C.white, fs(15), 'center', 700);
    text(ctx, 'PROC to load an approach · D→ to go direct', cx, 38, C.gray, fs(13), 'center');
  }
}

// ------------------------------------------------------------------ AP bar
function drawApBar(ctx: CanvasRenderingContext2D, sim: Sim, st: PfdState) {
  const ap = sim.ap;
  const y = 54;
  const h = 27;
  const x0 = 250;
  const x1 = 774;
  const s1 = 448;
  const s2 = 576;
  // three compartments (lateral | AP/FD | vertical) on a dark band, no outline
  box(ctx, x0, y, x1 - x0, h, '#1b1f24');
  line(ctx, s1 + 0.5, y + 4, s1 + 0.5, y + h - 4, '#3a4048', 1);
  line(ctx, s2 + 0.5, y + 4, s2 + 0.5, y + h - 4, '#3a4048', 1);
  const my = y + h / 2 + 1;
  if (!ap.engaged) {
    if (ap.annunciation && Math.floor(st.flash * 2) % 2 === 0) text(ctx, 'AP', (s1 + s2) / 2, my, C.yellow, 19, 'center', 700);
    return;
  }
  // lateral: active (green) left, armed (white) right
  text(ctx, ap.lat, x0 + 14, my, C.green, 19, 'left', 700);
  if (ap.latArmed) text(ctx, ap.latArmed, s1 - 14, my, C.white, 18, 'right', 600);
  // centre: AP / FD
  text(ctx, ap.ap ? 'AP' : 'FD', (s1 + s2) / 2, my, C.green, 19, 'center', 700);
  if (ap.ap && ap.annunciation) ap.annunciation = null;
  // vertical: active + reference (green), armed (white)
  let ref = '';
  if (ap.vert === 'ALT') ref = `${ap.altHold}FT`;
  if (ap.vert === 'VS') ref = `${ap.vsSel > 0 ? '↑' : ap.vsSel < 0 ? '↓' : ''}${Math.abs(ap.vsSel)}FPM`;
  if (ap.vert === 'FLC') ref = `${ap.iasSel}KT`;
  if (ap.vert === 'PIT') ref = `${ap.pitchRef >= 0 ? '↑' : '↓'}${Math.abs(ap.pitchRef).toFixed(1)}°`;
  text(ctx, ap.vert, s2 + 12, my, C.green, 19, 'left', 700);
  text(ctx, ref, s2 + 18 + tw(ctx, ap.vert, 19, 700), my, C.green, 17);
  const armed = [ap.vertArmed.alts && ap.vert !== 'ALT' ? 'ALTS' : '', ap.vertArmed.gs ? 'GS' : '', ap.vertArmed.gp ? 'GP' : ''].filter(Boolean).join(' ');
  text(ctx, armed, x1 - 10, my, C.white, 17, 'right');
}

// ------------------------------------------------------------------ airspeed
const IAS_X = 120;
const IAS_W = 100;
const TAPE_TOP = 92;
const TAPE_BOT = 448;

function drawAirspeed(ctx: CanvasRenderingContext2D, sim: Sim, st: PfdState) {
  const d = sim.ac.data;
  const x = IAS_X;
  const w = IAS_W;
  const top = TAPE_TOP;
  const bot = TAPE_BOT;
  const cy = CY;
  const kpx = 5.6;
  const air = !sim.ac.s.onGround;
  const valid = d.iasKt >= 20;
  // below 20 kt the tape stops: its graduations end at 20 kt
  const ias = Math.max(20, d.iasKt);
  const A = AIRFRAME;
  box(ctx, x, top, w, bot - top, 'rgba(30,34,38,0.6)');
  const yOf = (kt: number) => cy - (kt - ias) * kpx;
  const right = x + w;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top, w, bot - top);
  ctx.clip();
  // below 20 kt: no scale
  const y20 = yOf(20);
  if (y20 < bot) box(ctx, x, y20, w, bot - y20, 'rgba(10,12,14,0.55)');
  // colour bands at the tape edge: outer column = red / green / yellow / barber pole, inner column = white flap arc
  const band = (from: number, to: number, color: string, x0: number, bw: number) => {
    const a = Math.max(20, from);
    if (to <= a) return;
    ctx.fillStyle = color;
    ctx.fillRect(x0, yOf(to), bw, yOf(a) - yOf(to));
  };
  const outer = right - 7;
  const inner = right - 12;
  if (air) band(20, A.vso, C.red, outer, 7); // low-speed awareness (airborne only)
  band(A.vso, A.vfe, C.white, inner, 5);
  band(A.vs1, A.vno, '#00c832', outer, 7);
  band(A.vno, A.vne, C.yellow, outer, 7);
  {
    // red/white barber pole above Vne
    const yT = yOf(A.vne + 80);
    const yB = yOf(A.vne);
    ctx.save();
    ctx.beginPath();
    ctx.rect(outer, yT, 7, yB - yT);
    ctx.clip();
    ctx.fillStyle = C.red;
    ctx.fillRect(outer, yT, 7, yB - yT);
    ctx.fillStyle = C.white;
    for (let yy = yB; yy > yT - 20; yy -= 14) {
      ctx.beginPath();
      ctx.moveTo(outer, yy);
      ctx.lineTo(outer + 7, yy - 7);
      ctx.lineTo(outer + 7, yy - 14);
      ctx.lineTo(outer, yy - 7);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  // graduations: ticks end at the band column, labels left of the ticks (clipped clear of the boxes)
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top + 10, w, bot - top - 20);
  ctx.clip();
  for (let k = Math.floor((ias - 40) / 5) * 5; k < ias + 40; k += 5) {
    if (k < 20) continue;
    const y = yOf(k);
    const major = k % 10 === 0;
    line(ctx, inner - 2 - (major ? 20 : 11), y, inner - 2, y, C.white, 2);
    if (major && y > top + 22 && y < bot - 22) text(ctx, String(k), inner - 28, y, C.white, 20, 'right');
  }
  ctx.restore();
  // trend vector (6 s), magenta, along the band column
  if (Math.abs(st.iasTrend) > 1.5 && valid) {
    const yt = Math.max(top, Math.min(bot, cy - st.iasTrend * kpx));
    line(ctx, inner - 1, cy, inner - 1, yt, C.magenta, 4);
  }
  ctx.restore();
  // selected-airspeed bug (FLC): cyan notched bug on the tape edge, parked at the end when off scale
  if (sim.ap.vert === 'FLC') {
    const y = Math.max(top + 9, Math.min(bot - 9, yOf(sim.ap.iasSel)));
    poly(ctx, [[right - 9, y - 10], [right, y - 10], [right, y + 10], [right - 9, y + 10], [right - 9, y + 4], [right - 4, y], [right - 9, y - 4]], C.cyan);
  }
  // V-speed reference bugs (cyan, right of the tape): R = Vr, X = Vx, Y = Vy, G = best glide
  const vs: [number, string][] = [[VSPEEDS.vr, 'R'], [VSPEEDS.vx, 'X'], [VSPEEDS.vy, 'Y'], [VSPEEDS.vg, 'G']];
  const vsz = fs(15);
  for (const [v, l] of vs) {
    const y = yOf(v);
    if (y < top + 6 || y > bot - 6 || Math.abs(y - cy) < 26) continue;
    line(ctx, right - 2, y, right + 5, y, C.cyan, 2);
    const lw = tw(ctx, l, vsz, 700) + 6;
    box(ctx, right + 5, y - vsz / 2 - 1, lw, vsz + 2, 'rgba(0,0,0,0.75)');
    text(ctx, l, right + 8, y + 1, C.cyan, vsz, 'left', 700);
  }
  // pointer box: tens/hundreds (rolling only on carry), ones on a taller rolling drum
  const xl = x + 2;
  const xd = x + 50; // drum window left
  const xr = x + 76; // drum window right
  poly(ctx, [[xl, cy - 22], [xd, cy - 22], [xd, cy - 33], [xr, cy - 33], [xr, cy - 9], [xr + 11, cy], [xr, cy + 9], [xr, cy + 33], [xd, cy + 33], [xd, cy + 22], [xl, cy + 22]], '#000', C.white, 2);
  const col = d.stallWarn || d.iasKt >= A.vne ? C.red : d.iasKt > A.vno ? C.yellow : C.white;
  if (!valid) text(ctx, '---', x + 40, cy + 1, C.white, 26, 'center', 700);
  else {
    const dr = drum(d.iasKt, 1, 10);
    drawHiDigits(ctx, dr.hi, dr.hiFrac, xd + 2, cy + 1, 30, col, 42, { top: cy - 21, bot: cy + 21, left: xl + 1 });
    ctx.save();
    ctx.beginPath();
    ctx.rect(xd + 1, cy - 32, xr - xd - 2, 64);
    ctx.clip();
    for (let i = -2; i <= 2; i++) {
      const digit = (((dr.low + i) % 10) + 10) % 10;
      text(ctx, String(digit), xd + 3, cy + 1 + (dr.lowFrac - i) * 28, col, 30, 'left', 700);
    }
    ctx.restore();
  }
  // TAS box under the tape
  const s1 = fs(14);
  const s2 = fs(16);
  box(ctx, x, bot, w, 26, '#000', '#5f656b');
  text(ctx, 'TAS', x + 6, bot + 13, C.white, s1);
  text(ctx, valid && air ? `${Math.round(d.tasKt)}KT` : '---KT', x + w - 6, bot + 13, C.white, s2, 'right');
  // box above the tape: selected airspeed in FLC, otherwise the unit
  box(ctx, x, top - 26, w, 26, '#000', '#5f656b');
  if (sim.ap.vert === 'FLC') {
    const by = top - 13;
    poly(ctx, [[x + 8, by - 7], [x + 16, by - 7], [x + 16, by + 7], [x + 8, by + 7], [x + 8, by + 3], [x + 12, by], [x + 8, by - 3]], C.cyan);
    text(ctx, `${sim.ap.iasSel}KT`, x + w - 6, by, C.cyan, fs(18), 'right', 700);
  } else {
    text(ctx, 'IAS', x + 6, top - 13, C.white, s1);
    text(ctx, 'KT', x + w - 6, top - 13, C.gray, s1, 'right');
  }
}

// ------------------------------------------------------------------ altimeter
const ALT_X = 788;
const ALT_W = 100;

function drawAltimeter(ctx: CanvasRenderingContext2D, sim: Sim, st: PfdState) {
  const alt = sim.indicatedAlt();
  const x = ALT_X;
  const w = ALT_W;
  const top = TAPE_TOP;
  const bot = TAPE_BOT;
  const cy = CY;
  const fpx = 0.62;
  box(ctx, x, top, w, bot - top, 'rgba(30,34,38,0.6)');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top, w, bot - top);
  ctx.clip();
  const yOf = (a: number) => cy - (a - alt) * fpx;
  // ground band (brown, hatched) at the terrain elevation
  const gnd = sim.ac.s.altFt - sim.ac.data.aglFt + (sim.av.baro - sim.weather.qnh) * 1000;
  const yg = yOf(gnd);
  if (yg < bot) {
    ctx.fillStyle = '#6b4a22';
    ctx.fillRect(x, yg, w, bot - yg);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, yg, w, bot - yg);
    ctx.clip();
    for (let i = -4; i < 14; i++) line(ctx, x + i * 12, yg, x + i * 12 + 40, yg + 40, '#a8783c', 1.5);
    ctx.restore();
    line(ctx, x, yg, x + w, yg, '#d9a35a', 2);
  }
  // graduations (labels clipped 10 px inside the boxes above / below)
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top + 10, w, bot - top - 20);
  ctx.clip();
  for (let a = Math.floor((alt - 320) / 20) * 20; a < alt + 320; a += 20) {
    const y = yOf(a);
    const major = a % 100 === 0;
    line(ctx, x, y, x + (major ? 18 : 10), y, C.white, 2);
    if (major && y > top + 21 && y < bot - 21) text(ctx, String(a), x + 24, y, C.white, 18);
  }
  ctx.restore();
  // minimums bug (cyan; yellow once below)
  const mins = sim.av.minimums;
  if (mins !== null) {
    const y = yOf(mins);
    if (y > top && y < bot) {
      const mc = alt < mins ? C.yellow : C.cyan;
      poly(ctx, [[x + 2, y], [x + 14, y - 9], [x + 14, y + 9]], undefined, mc, 2.5);
      line(ctx, x + 14, y, x + 28, y, mc, 2.5);
    }
  }
  // trend vector: altitude 6 s ahead, magenta, left edge
  if (Math.abs(st.altTrend) > 2) {
    const yt = Math.max(top, Math.min(bot, cy - st.altTrend * fpx));
    line(ctx, x + 3, cy, x + 3, yt, C.magenta, 4);
  }
  ctx.restore();
  // selected-altitude bug: cyan notched bug on the left edge, parked at the end when off scale
  const ybc = Math.max(top + 12, Math.min(bot - 12, yOf(sim.ap.altSel)));
  poly(ctx, [[x, ybc - 12], [x + 9, ybc - 12], [x + 9, ybc - 5], [x + 4, ybc], [x + 9, ybc + 5], [x + 9, ybc + 12], [x, ybc + 12]], C.cyan);
  // pointer box: thousands + hundreds, 20-ft drum (with carry into the hundreds)
  const px = x + 8;
  const xd = x + 62;
  const xr = x + w + 6;
  poly(ctx, [[x - 4, cy], [px, cy - 12], [px, cy - 22], [xd, cy - 22], [xd, cy - 33], [xr, cy - 33], [xr, cy + 33], [xd, cy + 33], [xd, cy + 22], [px, cy + 22], [px, cy + 12]], '#000', C.white, 2);
  const dr = drum(Math.abs(alt), 20, 100);
  drawHiDigits(ctx, dr.hi, dr.hiFrac, xd - 1, cy + 1, 28, C.white, 42, { top: cy - 21, bot: cy + 21, left: px + 1 });
  if (alt < 0) text(ctx, '-', px + 6, cy, C.white, 24, 'left', 700);
  ctx.save();
  ctx.beginPath();
  ctx.rect(xd + 1, cy - 32, xr - xd - 2, 64);
  ctx.clip();
  for (let i = -2; i <= 2; i++) {
    const v = (((dr.low + i * 20) % 100) + 100) % 100;
    text(ctx, String(v).padStart(2, '0'), xd + 4, cy + 1 + (dr.lowFrac - i) * 24, C.white, 21, 'left', 700);
  }
  ctx.restore();
  // selected altitude box (cyan, with the bug glyph)
  box(ctx, x, top - 26, w, 26, '#000', '#5f656b');
  const by = top - 13;
  poly(ctx, [[x + 6, by - 8], [x + 13, by - 8], [x + 13, by - 3], [x + 10, by], [x + 13, by + 3], [x + 13, by + 8], [x + 6, by + 8]], C.cyan);
  text(ctx, String(sim.ap.altSel), x + w - 8, by, C.cyan, fs(20), 'right', 700);
  // baro setting box
  box(ctx, x, bot, w, 26, '#000', '#5f656b');
  const std = Math.abs(sim.av.baro - 29.92) < 0.001;
  text(ctx, std ? 'STD BARO' : `${sim.av.baro.toFixed(2)}IN`, x + w / 2, bot + 13, C.cyan, fs(17), 'center');
  // marker beacon
  if (sim.marker && Math.floor(st.flash * 3) % 2 === 0) {
    box(ctx, x - 40, top + 4, 30, 30, C.cyan, C.white);
    text(ctx, 'O', x - 25, top + 19, C.black, 20, 'center', 700);
  }
  // vertical deviation (GS / GP)
  const n = sim.navInputs();
  const showGs = n.cdi !== 'GPS' && n.nav.isLoc && sim.nav1.valid;
  const showGp = n.cdi === 'GPS' && n.gps.gpValid;
  if (showGs || showGp || (n.cdi !== 'GPS' && n.nav.gsValid)) {
    const gx = x - 26;
    box(ctx, gx - 12, 150, 24, 236, 'rgba(0,0,0,0.6)');
    text(ctx, showGp ? 'V' : 'G', gx, 140, showGp ? C.magenta : C.green, fs(16), 'center', 700);
    for (const dot of [-2, -1, 1, 2]) {
      ctx.strokeStyle = C.white;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gx, cy + dot * 50, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    line(ctx, gx - 10, cy, gx + 10, cy, C.white, 2);
    const ok = showGp ? n.gps.gpValid : n.nav.gsValid;
    if (ok) {
      const dev = showGp ? n.gps.gpDev : n.nav.gsDev;
      const y = cy - Math.max(-1.2, Math.min(1.2, dev)) * 100;
      poly(ctx, [[gx, y - 10], [gx + 8, y], [gx, y + 10], [gx - 8, y]], showGp ? C.magenta : C.green, C.black, 1);
    }
  }
}

function drawVsi(ctx: CanvasRenderingContext2D, sim: Sim) {
  const vs = sim.ac.data.vsFpm;
  const x = 896;
  const top = 118;
  const bot = 418;
  const cy = CY;
  const k = 150 / 2000;
  poly(ctx, [[x, top], [x + 44, top], [x + 44, bot], [x, bot], [x, cy + 20], [x - 6, cy], [x, cy - 20]], 'rgba(30,34,38,0.6)');
  for (const v of [-2000, -1500, -1000, -500, 500, 1000, 1500, 2000]) {
    const y = cy - v * k;
    const major = v % 1000 === 0;
    line(ctx, x, y, x + (major ? 14 : 8), y, C.white, 2);
    if (major) text(ctx, String(Math.abs(v) / 1000), x + 18, y, C.white, 15);
  }
  line(ctx, x, cy, x + 14, cy, C.white, 2);
  // selected vertical speed: cyan bug + readout box (VS mode)
  if (sim.ap.vert === 'VS') {
    const y = cy - Math.max(-2000, Math.min(2000, sim.ap.vsSel)) * k;
    poly(ctx, [[x, y - 8], [x + 9, y - 8], [x + 9, y - 3], [x + 5, y], [x + 9, y + 3], [x + 9, y + 8], [x, y + 8]], C.cyan);
    box(ctx, x - 4, top - 26, 62, 24, '#000', '#5f656b');
    text(ctx, String(sim.ap.vsSel), x + 27, top - 14, C.cyan, fs(16), 'center', 700);
  }
  const yp = cy - Math.max(-2050, Math.min(2050, vs)) * k;
  poly(ctx, [[x + 4, yp], [x + 16, yp - 11], [x + 62, yp - 11], [x + 62, yp + 11], [x + 16, yp + 11]], '#000', C.white, 1.5);
  if (Math.abs(vs) >= 100) text(ctx, String(Math.round(vs / 50) * 50), x + 60, yp + 1, C.white, 15, 'right', 700);
}

// ------------------------------------------------------------------ HSI
const HX = 512;
const HY = 610;
const HR = 132;

/** Small label on a black backing box (drawn over the needles). */
function tag(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, color: string, size: number) {
  const w = tw(ctx, s, size, 700) + 8;
  box(ctx, x - w / 2, y - size / 2 - 2, w, size + 4, '#000');
  text(ctx, s, x, y + 1, color, size, 'center', 700);
}

function drawHsi(ctx: CanvasRenderingContext2D, sim: Sim, st: PfdState) {
  const d = sim.ac.data;
  const hx = HX;
  const hy = HY;
  const R = HR;
  const hdg = d.hdgTrue;
  // rose
  ctx.save();
  ctx.beginPath();
  ctx.arc(hx, hy, R + 6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(20,20,20,0.85)';
  ctx.fill();
  ctx.restore();
  // heading box
  poly(ctx, [[hx - 32, hy - R - 48], [hx + 32, hy - R - 48], [hx + 32, hy - R - 16], [hx + 6, hy - R - 16], [hx, hy - R - 8], [hx - 6, hy - R - 16], [hx - 32, hy - R - 16]], '#000', C.white, 1.5);
  text(ctx, `${pad3(hdg)}°`, hx, hy - R - 32, C.white, 22, 'center', 700);
  // turn rate indicator
  ctx.save();
  ctx.translate(hx, hy);
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, R + 10, (-90 - 25) * DEG, (-90 + 25) * DEG);
  ctx.stroke();
  for (const a of [-18, -9, 9, 18]) {
    const ang = (a - 90) * DEG;
    line(ctx, Math.cos(ang) * (R + 10), Math.sin(ang) * (R + 10), Math.cos(ang) * (R + (Math.abs(a) === 18 ? 22 : 16)), Math.sin(ang) * (R + (Math.abs(a) === 18 ? 22 : 16)), C.white, 2);
  }
  const tr = Math.max(-24, Math.min(24, d.turnRateDps * 6));
  if (Math.abs(tr) > 0.5) {
    ctx.strokeStyle = C.magenta;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, R + 15, -90 * DEG, (-90 + tr) * DEG, tr < 0);
    ctx.stroke();
  }
  ctx.rotate(-hdg * DEG);
  for (let a = 0; a < 360; a += 5) {
    const major = a % 10 === 0;
    const ang = (a - 90) * DEG;
    line(ctx, Math.cos(ang) * R, Math.sin(ang) * R, Math.cos(ang) * (R - (major ? 16 : 9)), Math.sin(ang) * (R - (major ? 16 : 9)), C.white, 2);
    if (a % 30 === 0) {
      ctx.save();
      ctx.rotate(a * DEG);
      const lbl = a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a / 10);
      text(ctx, lbl, 0, -R + 30, C.white, a % 90 === 0 ? 22 : 18, 'center', 700);
      ctx.restore();
    }
  }
  // heading bug
  ctx.save();
  ctx.rotate(sim.ap.hdgBug * DEG);
  poly(ctx, [[-12, -R - 2], [-12, -R + 8], [0, -R + 2], [12, -R + 8], [12, -R - 2]], C.cyan);
  ctx.restore();
  // track pointer
  ctx.save();
  ctx.rotate(d.trackTrue * DEG);
  poly(ctx, [[0, -R + 1], [-6, -R + 9], [0, -R + 17], [6, -R + 9]], C.magenta);
  ctx.restore();

  // bearing pointers (BRG1 single line, BRG2 double line, cyan)
  const bearing = (src: string): number | null => {
    if (src === 'NAV1') return sim.nav1.valid ? sim.nav1.bearingTo : null;
    if (src === 'NAV2') return sim.nav2.valid ? sim.nav2.bearingTo : null;
    if (src === 'GPS') return sim.fp.out.valid ? sim.fp.out.bearingTo : null;
    if (src === 'ADF') return sim.adf.valid ? sim.adf.bearingTo : null;
    return null;
  };
  const b1 = bearing(sim.av.bearing1);
  if (b1 !== null) {
    ctx.save();
    ctx.rotate(b1 * DEG);
    line(ctx, 0, -R + 20, 0, -60, C.cyan, 2.5);
    line(ctx, 0, 60, 0, R - 10, C.cyan, 2.5);
    poly(ctx, [[0, -R + 20], [-10, -R + 36], [10, -R + 36]], undefined, C.cyan, 2.5);
    ctx.restore();
  }
  const b2 = bearing(sim.av.bearing2);
  if (b2 !== null) {
    ctx.save();
    ctx.rotate(b2 * DEG);
    for (const ox of [-4, 4]) {
      line(ctx, ox, -R + 30, ox, -60, C.cyan, 2);
      line(ctx, ox, 60, ox, R - 10, C.cyan, 2);
    }
    poly(ctx, [[0, -R + 18], [-10, -R + 34], [10, -R + 34]], undefined, C.cyan, 2);
    ctx.restore();
  }

  // course pointer & CDI
  const n = sim.navInputs();
  const isGps = n.cdi === 'GPS';
  const crs = sim.course();
  const col = isGps ? C.magenta : C.green;
  const valid = isGps ? n.gps.valid : n.nav.valid;
  const dev = isGps ? n.gps.dev : n.nav.dev;
  const toFrom = isGps ? n.gps.toFrom : n.nav.toFrom;
  ctx.save();
  ctx.rotate(crs * DEG);
  line(ctx, 0, -R + 18, 0, -58, col, 5);
  poly(ctx, [[0, -R + 6], [-13, -R + 28], [13, -R + 28]], col);
  line(ctx, 0, 58, 0, R - 8, col, 5);
  if (valid) {
    const dx = Math.max(-1.2, Math.min(1.2, dev)) * 68;
    line(ctx, dx, -52, dx, 52, col, 5);
    if (toFrom !== 'OFF') {
      const ty = toFrom === 'TO' ? -1 : 1;
      poly(ctx, [[dx + 22, ty * 32], [dx + 12, ty * 18], [dx + 32, ty * 18]], col);
    }
  }
  ctx.restore();
  ctx.restore();
  // source and flight-phase labels: after the needle, on black backing, clear of the dots
  const srcLabel = isGps ? 'GPS' : `${n.nav.isLoc ? 'LOC' : 'VOR'}${n.cdi === 'NAV1' ? '1' : '2'}`;
  const ls = fs(17);
  tag(ctx, srcLabel, hx - 95, hy - 45, col, ls);
  if (isGps) {
    tag(ctx, n.gps.mode, hx + 95, hy - 45, col, ls);
    if (n.gps.approachName && n.gps.mode === 'APR') {
      const ap = sim.fp.approach;
      const lbl = ap?.type === 'RNAV' ? (ap.minimums[0].label === 'LPV' ? 'LPV' : 'L/VNAV') : 'LNAV';
      tag(ctx, lbl, hx + 95, hy - 45 + ls + 6, col, fs(14));
    }
  } else if (!valid) tag(ctx, 'NO SIG', hx + 95, hy - 45, C.amber, fs(15));
  // deviation dots (over the labels), then the aircraft symbol
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate((crs - hdg) * DEG);
  for (const dot of [-2, -1, 1, 2]) {
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(dot * 34, 0, 6, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.translate(hx, hy);
  ctx.fillStyle = C.white;
  ctx.fillRect(-2, -18, 4, 34);
  ctx.fillRect(-16, -4, 32, 4);
  ctx.fillRect(-7, 12, 14, 3);
  ctx.restore();
  // HDG / CRS windows
  const ws = fs(15);
  const vsz = fs(19);
  const ww = Math.max(96, tw(ctx, 'HDG', ws) + tw(ctx, '000°', vsz, 700) + 22);
  box(ctx, hx - R - 12 - ww, hy - R - 46, ww, 28, '#000', '#5f656b');
  text(ctx, 'HDG', hx - R - 4 - ww, hy - R - 32, C.white, ws);
  text(ctx, `${pad3(sim.ap.hdgBug)}°`, hx - R - 18, hy - R - 32, C.cyan, vsz, 'right', 700);
  box(ctx, hx + R + 12, hy - R - 46, ww, 28, '#000', '#5f656b');
  text(ctx, 'CRS', hx + R + 20, hy - R - 32, C.white, ws);
  text(ctx, `${pad3(crs)}°`, hx + R + 6 + ww, hy - R - 32, col, vsz, 'right', 700);
  // fixed slots, all clear of the rose: DME above BRG1 (left), BRG1 bottom-left, BRG2 bottom-right
  const s13 = fs(14);
  const s16 = fs(16);
  const slotW = 124;
  const lRight = hx - R - 10; // BRG1 right edge
  const rLeft = hx + R + 10; // BRG2 left edge
  const brgH = s13 + s16 + 12;
  if (st.dmeWindow) {
    const nv = sim.nav1;
    const h = s13 + 2 * s16 + 20;
    const x0 = hx - R - 12 - slotW;
    const y0 = 742 - brgH - 6 - h;
    box(ctx, x0, y0, slotW, h, 'rgba(0,0,0,0.8)', '#5f656b');
    text(ctx, 'DME', x0 + 8, y0 + 4 + s13 / 2, C.white, s13, 'left', 700);
    text(ctx, 'NAV1', x0 + slotW - 8, y0 + 4 + s13 / 2, C.white, s13, 'right');
    text(ctx, fmtFreq(sim.av.nav1.active), x0 + 8, y0 + 10 + s13 + s16 / 2, C.green, s16);
    text(ctx, nv.dmeNm !== null ? `${nv.dmeNm.toFixed(1)}NM` : '---.-NM', x0 + 8, y0 + 14 + s13 + s16 * 1.5, C.white, s16, 'left', 700);
  }
  const brgInfo = (src: string, which: 1 | 2) => {
    if (src === 'OFF') return;
    const b = bearing(src);
    const ident = src === 'NAV1' ? sim.nav1.ident : src === 'NAV2' ? sim.nav2.ident : src === 'ADF' ? sim.adf.ident : sim.fp.out.toIdent;
    const dist = src === 'NAV1' ? sim.nav1.dmeNm : src === 'NAV2' ? sim.nav2.dmeNm : src === 'ADF' ? null : sim.fp.out.valid ? sim.fp.out.distNm : null;
    const y0 = 742 - brgH;
    const x0 = which === 1 ? lRight - slotW : rLeft;
    box(ctx, x0, y0, slotW, brgH, 'rgba(0,0,0,0.8)', '#5f656b');
    const right = which === 1;
    const tx = right ? x0 + slotW - 8 : x0 + 8;
    const al: CanvasTextAlign = right ? 'right' : 'left';
    // pointer glyph: single (BRG1) or double (BRG2) line with an arrow head
    const gx = right ? x0 + 8 : x0 + slotW - 26;
    const gy = y0 + 4 + s13 / 2;
    if (which === 1) line(ctx, gx, gy, gx + 12, gy, C.cyan, 2);
    else {
      line(ctx, gx, gy - 2.5, gx + 11, gy - 2.5, C.cyan, 1.5);
      line(ctx, gx, gy + 2.5, gx + 11, gy + 2.5, C.cyan, 1.5);
    }
    poly(ctx, [[gx + 18, gy], [gx + 10, gy - 5], [gx + 10, gy + 5]], C.cyan);
    text(ctx, `${dist !== null && dist !== undefined ? dist.toFixed(1) + 'NM' : '---NM'} ${src}`, right ? tx : tx, gy, C.white, s13, al);
    text(ctx, `${b !== null ? pad3(b) + '°' : '---°'} ${ident || '----'}`, tx, y0 + 8 + s13 + s16 / 2, C.cyan, s16, al, 700);
  };
  brgInfo(sim.av.bearing1, 1);
  brgInfo(sim.av.bearing2, 2);
}

// ------------------------------------------------------------------ failures
function redX(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label?: string) {
  box(ctx, x, y, w, h, '#000');
  ctx.strokeStyle = C.red;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 4, y + 4);
  ctx.lineTo(x + w - 4, y + h - 4);
  ctx.moveTo(x + w - 4, y + 4);
  ctx.lineTo(x + 4, y + h - 4);
  ctx.stroke();
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  if (label) {
    box(ctx, x + w / 2 - 70, y + h / 2 - 14, 140, 28, '#000');
    text(ctx, label, x + w / 2, y + h / 2, C.red, 17, 'center', 700);
  }
}

let compassHdg = 0;
function drawFailures(ctx: CanvasRenderingContext2D, sim: Sim, st: PfdState) {
  const f = sim.failures;
  const d = sim.ac.data;
  if (f.ahrs) {
    redX(ctx, 222, 84, 556, 370);
    // standby attitude indicator (vacuum/electric backup)
    const cx = 500, cy = 270, r = 92;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate(-d.rollDeg * DEG);
    ctx.translate(0, d.pitchDeg * 4);
    ctx.fillStyle = '#2b78c9';
    ctx.fillRect(-300, -300, 600, 300);
    ctx.fillStyle = '#7a4c1c';
    ctx.fillRect(-300, 0, 600, 300);
    line(ctx, -300, 0, 300, 0, C.white, 2);
    for (const p of [-20, -10, 10, 20]) line(ctx, -18, -p * 4, 18, -p * 4, C.white, 2);
    ctx.restore();
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
    ctx.stroke();
    line(ctx, cx - 46, cy, cx - 14, cy, C.amber, 4);
    line(ctx, cx + 14, cy, cx + 46, cy, C.amber, 4);
    box(ctx, cx - 3, cy - 3, 6, 6, C.amber);
    text(ctx, 'STBY ATTITUDE', cx, cy + r + 18, C.white, fs(14), 'center', 700);
    text(ctx, 'AHRS FAIL', cx, 108, C.red, 18, 'center', 700);
    // HSI red X + magnetic compass with lag (northerly turning errors are left to the pilot!)
    redX(ctx, HX - 150, HY - 165, 300, 300, 'HDG FAIL');
    let diff = d.hdgTrue - compassHdg;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    compassHdg = (compassHdg + diff * Math.min(1, 0.05 + Math.abs(Math.cos(d.hdgTrue * DEG)) * 0.08) + 360) % 360;
    box(ctx, HX - 66, 690, 132, 36, '#111', C.gray);
    text(ctx, `COMPASS ${pad3(compassHdg)}`, HX, 708, C.white, fs(15), 'center', 700);
  } else compassHdg = d.hdgTrue;
  if (f.airData) {
    redX(ctx, IAS_X, TAPE_TOP, IAS_W, TAPE_BOT - TAPE_TOP);
    redX(ctx, ALT_X, TAPE_TOP, ALT_W, TAPE_BOT - TAPE_TOP);
    redX(ctx, 896, 118, 46, 300);
    text(ctx, 'ADC FAIL', ALT_X + ALT_W / 2, 540, C.red, fs(15), 'center', 700);
  }
  // annunciation window (right column, under the VSI)
  const alerts: string[] = [];
  if (f.gps) alerts.push('GPS LOI');
  if (f.ap) alerts.push('AP FAIL');
  if (f.nav1) alerts.push('NAV1 FAIL');
  if (f.gs) alerts.push('GS FAIL');
  if (f.engine) alerts.push('ENGINE FAIL');
  if (sim.ac.s.fuelGal < 8) alerts.push('LOW FUEL');
  const as = fs(13);
  const ah = as + 9;
  alerts.forEach((a, i) => {
    const flash = Math.floor(st.flash * 2) % 2 === 0 || st.flash % 10 > 5;
    const y = 436 + i * (ah + 4);
    box(ctx, 898, y, 120, ah, flash ? C.amber : '#000', C.amber);
    text(ctx, a, 958, y + ah / 2 + 1, flash ? '#000' : C.amber, as, 'center', 700);
  });
}

// ------------------------------------------------------------------ lower windows
function drawLowerWindows(ctx: CanvasRenderingContext2D, sim: Sim, st: PfdState) {
  const d = sim.ac.data;
  const s15 = fs(15);
  const s16 = fs(16);
  // OAT
  box(ctx, 0, 716, 110, 26, '#000', '#5f656b');
  text(ctx, `OAT ${Math.round(d.oatC)}°C`, 8, 729, C.white, s16);
  // wind: arrow relative to the nose, direction/speed, head/tail and cross components
  const wx = IAS_X;
  const wy = 480;
  const ww = 124;
  const wh = 50;
  box(ctx, wx, wy, ww, wh, 'rgba(0,0,0,0.8)', '#5f656b');
  if (d.windKt > 0.5 && !sim.ac.s.onGround) {
    const rel = (d.windDir + 180 - d.hdgTrue) * DEG;
    ctx.save();
    ctx.translate(wx + 18, wy + wh / 2);
    ctx.rotate(rel);
    line(ctx, 0, 13, 0, -9, C.white, 3);
    poly(ctx, [[0, -15], [-7, -5], [7, -5]], C.white);
    ctx.restore();
    const tx = wx + 36;
    text(ctx, `${pad3(d.windDir)}° ${Math.round(d.windKt)}KT`, tx, wy + 14, C.white, s15, 'left', 700);
    const hw = Math.round(d.headwindKt);
    const xw = Math.round(d.crosswindKt);
    const cy2 = wy + 36;
    // drawn component arrows: down = headwind, up = tailwind, left/right = crosswind from the right/left
    const tri = (x: number, dir: 'up' | 'down' | 'left' | 'right', c: string) => {
      const p: Record<string, [number, number][]> = {
        down: [[x, cy2 + 5], [x - 5, cy2 - 4], [x + 5, cy2 - 4]],
        up: [[x, cy2 - 5], [x - 5, cy2 + 4], [x + 5, cy2 + 4]],
        left: [[x - 5, cy2], [x + 4, cy2 - 5], [x + 4, cy2 + 5]],
        right: [[x + 5, cy2], [x - 4, cy2 - 5], [x - 4, cy2 + 5]],
      };
      poly(ctx, p[dir], c);
    };
    const hc = hw >= 0 ? C.white : C.amber;
    tri(tx + 5, hw >= 0 ? 'down' : 'up', hc);
    text(ctx, String(Math.abs(hw)), tx + 13, cy2 + 1, hc, s15);
    const xc = Math.abs(xw) > 15 ? C.amber : C.white;
    const x2 = wx + ww - 8 - tw(ctx, String(Math.abs(xw)), s15);
    tri(x2 - 9, xw >= 0 ? 'left' : 'right', xc);
    text(ctx, String(Math.abs(xw)), wx + ww - 8, cy2 + 1, xc, s15, 'right');
  } else text(ctx, 'NO WIND DATA', wx + ww / 2, wy + wh / 2, C.white, fs(12), 'center');
  // inset map
  if (sim.av.inset) {
    const x = 6;
    const y = 536;
    const w = 236;
    const h = 174;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    drawMap(ctx, sim, { x, y, w, h }, 6, true);
    ctx.restore();
    ctx.strokeStyle = '#5f656b';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  // XPDR / time
  box(ctx, 780, 716, 244, 26, '#000', '#5f656b');
  const xc = sim.av.xpdrMode === 'STBY' ? C.white : C.green;
  text(ctx, `XPDR ${sim.av.xpdr}`, 790, 729, xc, s16);
  text(ctx, sim.av.xpdrMode, 790 + tw(ctx, 'XPDR 0000', s16) + 12, 729, xc, s16);
  const tmr = sim.chrono();
  const tt = tmr ?? sim.time;
  const mm = Math.floor(tt / 60);
  const ss = Math.floor(tt % 60);
  text(ctx, `${tmr !== null ? 'TMR' : 'ET'} ${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, 1016, 729, tmr !== null ? C.cyan : C.white, s16, 'right');
  // baro minimums window (under the baro setting box)
  if (sim.av.minimums !== null) {
    const s13 = fs(13);
    const s17 = fs(17);
    box(ctx, ALT_X, 480, ALT_W, s13 + s17 + 14, 'rgba(0,0,0,0.8)', '#5f656b');
    text(ctx, 'BARO MIN', ALT_X + 8, 485 + s13 / 2, C.white, s13);
    text(ctx, `${sim.av.minimums}FT`, ALT_X + ALT_W - 8, 490 + s13 + s17 / 2, C.cyan, s17, 'right', 700);
  }
  void st;
}

/** Softkey labels along the bottom edge. Active keys are inverse (light grey, black text), a pressed key flashes a cyan border. */
export function drawSoftkeys(ctx: CanvasRenderingContext2D, labels: string[], flashIdx: number | null, active: Record<string, boolean>) {
  const h = 24;
  const y = PFD_H - h;
  box(ctx, 0, y, PFD_W, h, '#000');
  line(ctx, 0, y + 0.5, PFD_W, y + 0.5, '#2c3137', 1);
  const w = PFD_W / 12;
  const size = fs(14);
  labels.forEach((l, i) => {
    const x = i * w;
    if (i) line(ctx, x + 0.5, y + 4, x + 0.5, PFD_H - 2, '#2c3137', 1);
    if (!l) return;
    const on = !!active[l];
    const inert = INERT_SOFTKEYS.has(l);
    if (on) box(ctx, x + 4, y + 2, w - 8, h - 3, '#c9ced3');
    if (flashIdx === i) {
      ctx.strokeStyle = C.cyan;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 4, y + 2.5, w - 8, h - 4);
    }
    const fit = Math.min(size, size * ((w - 12) / Math.max(1, tw(ctx, l, size, 700))));
    text(ctx, l, x + w / 2, y + h / 2 + 1, on ? '#000' : inert ? '#6b7178' : C.white, fit, 'center', 700);
  });
}

export function softkeyAt(xLogical: number, yLogical: number, h = PFD_H, w = PFD_W): number | null {
  if (yLogical < h - 28) return null;
  return Math.floor(xLogical / (w / 12));
}
