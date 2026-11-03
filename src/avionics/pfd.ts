// G1000-style Primary Flight Display, rendered on a 1024×768 logical canvas.
import type { Sim } from '../sim/sim';
import { AIRFRAME } from '../sim/aircraft';
import { C, box, line, poly, text, pad3, fmtFreq } from './draw';
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
  st.flash += dt;
  // trend vectors on the SIM clock (immune to frame drops, pause, sim rate and replay):
  // airspeed predicted 6 s ahead (G1000), filtered, capped
  const simDt = sim.time - st.lastT;
  if (simDt > 0 && simDt < 1 && !sim.replaying) {
    const accel = (d.iasKt - st.lastIas) / simDt; // kt/s
    const target = Math.max(-40, Math.min(40, accel * 6));
    st.iasTrend += (target - st.iasTrend) * Math.min(1, simDt / 0.8);
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
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        rw.center.forEach((p, i) => (i ? ctx.lineTo(p.az * PPD, -p.el * PPD) : ctx.moveTo(p.az * PPD, -p.el * PPD)));
        ctx.stroke();
        ctx.setLineDash([]);
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
  ctx.rect(-160, -pitch * PPD - 175, 320, 290);
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
  ctx.save();
  ctx.translate(CX, CY);
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 175, (-150 * Math.PI) / 180, (-30 * Math.PI) / 180);
  ctx.stroke();
  for (const a of [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60]) {
    const r1 = 175;
    const r2 = Math.abs(a) === 30 || Math.abs(a) === 60 ? 197 : 187;
    const ang = (a - 90) * DEG;
    if (Math.abs(a) === 45) {
      poly(ctx, [
        [Math.cos(ang) * 176, Math.sin(ang) * 176],
        [Math.cos(ang - 0.025) * 188, Math.sin(ang - 0.025) * 188],
        [Math.cos(ang + 0.025) * 188, Math.sin(ang + 0.025) * 188],
      ], C.white);
    } else line(ctx, Math.cos(ang) * r1, Math.sin(ang) * r1, Math.cos(ang) * r2, Math.sin(ang) * r2, C.white, 2.5);
  }
  poly(ctx, [[0, -176], [-10, -194], [10, -194]], C.white);
  // roll pointer + slip
  ctx.rotate(-roll);
  poly(ctx, [[0, -174], [-11, -156], [11, -156]], C.white, C.black, 1);
  const slip = sim.ac.data.slip * 18;
  poly(ctx, [[-13 + slip, -152], [13 + slip, -152], [15 + slip, -146], [-15 + slip, -146]], C.white, C.black, 1);
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

  // annunciations
  if (d.stallWarn && Math.floor(st.flash * 3) % 2 === 0) {
    box(ctx, CX - 60, CY + 70, 120, 32, C.red);
    text(ctx, 'STALL', CX, CY + 86, C.white, 22, 'center', 700);
  }
  const mins = sim.av.minimums;
  if (mins !== null && sim.indicatedAlt() < mins && !sim.ac.s.onGround) {
    text(ctx, 'MINIMUMS', CX + 210, CY + 150, C.yellow, 20, 'left', 700);
  }
  if (sim.ac.s.crashed) {
    box(ctx, CX - 210, CY - 40, 420, 80, 'rgba(160,0,0,0.85)', C.white);
    text(ctx, 'CRASH', CX, CY - 12, C.white, 28, 'center', 700);
    text(ctx, sim.ac.s.crashed, CX, CY + 20, C.white, 16, 'center');
  }
  if (sim.paused && !sim.replaying && !sim.ac.s.crashed) {
    box(ctx, CX - 70, CY + 110, 140, 34, 'rgba(0,0,0,0.7)', C.white);
    text(ctx, 'PAUSED', CX, CY + 127, C.white, 22, 'center', 700);
  }
}

// ------------------------------------------------------------------ top bar
export function drawTopBar(ctx: CanvasRenderingContext2D, sim: Sim) {
  box(ctx, 0, 0, PFD_W, 52, '#000');
  line(ctx, 0, 52, PFD_W, 52, C.gray, 1);
  const av = sim.av;
  const navRow = (y: number, label: string, r: { active: number; standby: number }, selected: boolean) => {
    const n = tunedNavaid(r.active);
    text(ctx, label, 10, y, C.white, 15);
    text(ctx, fmtFreq(r.active), 66, y, selected ? C.green : C.white, 19);
    text(ctx, '↔', 138, y, C.cyan, 15);
    text(ctx, fmtFreq(r.standby), 160, y, C.white, 19);
    text(ctx, n ? n.ident : '', 232, y, C.green, 15);
  };
  navRow(15, 'NAV1', av.nav1, av.cdi === 'NAV1');
  navRow(38, 'NAV2', av.nav2, av.cdi === 'NAV2');
  const comRow = (y: number, label: string, r: { active: number; standby: number }, sel: boolean) => {
    text(ctx, r.active.toFixed(3), PFD_W - 225, y, sel ? C.green : C.white, 19);
    text(ctx, '↔', PFD_W - 152, y, C.cyan, 15);
    text(ctx, r.standby.toFixed(3), PFD_W - 130, y, C.white, 19);
    text(ctx, label, PFD_W - 10, y, C.white, 15, 'right');
  };
  comRow(15, 'COM1', av.com1, true);
  comRow(38, 'COM2', av.com2, false);
  // nav status
  const g = sim.fp.out;
  ctx.save();
  if (g.valid) {
    const arrow = g.holding ? 'HOLD' : g.fromIdent ? `${g.fromIdent} → ` : '→ ';
    text(ctx, g.holding ? `HOLD ${g.toIdent}${g.holdEntry && g.holdPhase !== 'racetrack' ? ' · ' + g.holdEntry + ' ENTRY' : ''}` : `${arrow}${g.toIdent}`, 300, 15, C.magenta, 17);
    text(ctx, 'DIS', 300, 38, C.white, 14);
    text(ctx, `${g.distNm.toFixed(g.distNm < 10 ? 1 : 0)}NM`, 330, 38, C.magenta, 17);
    text(ctx, 'DTK', 420, 38, C.white, 14);
    text(ctx, `${pad3(g.dtk)}°`, 452, 38, C.magenta, 17);
    text(ctx, 'TRK', 520, 38, C.white, 14);
    text(ctx, `${pad3(sim.ac.data.trackTrue)}°`, 552, 38, C.magenta, 17);
    if (g.eteMin !== null) {
      text(ctx, 'ETE', 620, 38, C.white, 14);
      const m = Math.floor(g.eteMin);
      const s = Math.round((g.eteMin - m) * 60);
      text(ctx, `${m}:${String(s).padStart(2, '0')}`, 652, 38, C.magenta, 17);
    }
    if (g.suspended) text(ctx, 'SUSP', 720, 15, C.yellow, 17);
  } else {
    text(ctx, 'NO FLIGHT PLAN — press D→ to go direct', 300, 26, C.gray, 15);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ AP bar
function drawApBar(ctx: CanvasRenderingContext2D, sim: Sim, st: PfdState) {
  const ap = sim.ap;
  const y = 53;
  box(ctx, 250, y, 524, 28, 'rgba(0,0,0,0.85)');
  ctx.strokeStyle = C.gray;
  ctx.lineWidth = 1;
  ctx.strokeRect(250.5, y + 0.5, 523, 27);
  if (!ap.engaged) {
    if (ap.annunciation && Math.floor(st.flash * 2) % 2 === 0 && st.flash < 10000) text(ctx, 'AP', 512, y + 14, C.yellow, 19, 'center', 700);
    return;
  }
  const latMap: Record<string, string> = { ROL: 'ROL', HDG: 'HDG', GPS: 'GPS', VOR: 'VOR', LOC: 'LOC', BC: 'BC' };
  text(ctx, latMap[ap.lat], 270, y + 14, C.green, 19, 'left', 700);
  if (ap.latArmed) text(ctx, latMap[ap.latArmed], 340, y + 14, C.white, 17);
  text(ctx, ap.ap ? 'AP' : 'FD', 512, y + 14, C.green, 19, 'center', 700);
  if (ap.ap && ap.annunciation) ap.annunciation = null;
  let vert = ap.vert as string;
  let ref = '';
  if (ap.vert === 'ALT') ref = `${ap.altHold}FT`;
  if (ap.vert === 'VS') ref = `${ap.vsSel > 0 ? '↑' : ap.vsSel < 0 ? '↓' : ''}${Math.abs(ap.vsSel)}FPM`;
  if (ap.vert === 'FLC') ref = `${ap.iasSel}KT`;
  if (ap.vert === 'PIT') ref = `${ap.pitchRef >= 0 ? '↑' : '↓'}${Math.abs(ap.pitchRef).toFixed(1)}°`;
  if (ap.vert === 'ALT') vert = 'ALT';
  text(ctx, vert, 600, y + 14, C.green, 19, 'left', 700);
  text(ctx, ref, 650, y + 14, C.green, 17);
  const armed = [ap.vertArmed.alts && ap.vert !== 'ALT' ? 'ALTS' : '', ap.vertArmed.gs ? 'GS' : '', ap.vertArmed.gp ? 'GP' : ''].filter(Boolean).join(' ');
  text(ctx, armed, 765, y + 14, C.white, 16, 'right');
}

// ------------------------------------------------------------------ airspeed
function drawAirspeed(ctx: CanvasRenderingContext2D, sim: Sim, st: PfdState) {
  const d = sim.ac.data;
  const x = 120;
  const w = 96;
  const top = 92;
  const bot = 448;
  const cy = CY;
  const kpx = 5.6;
  const ias = Math.max(20, d.iasKt);
  box(ctx, x, top, w, bot - top, 'rgba(40,40,40,0.55)');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top, w, bot - top);
  ctx.clip();
  const yOf = (kt: number) => cy - (kt - ias) * kpx;
  // speed bands
  const band = (from: number, to: number, color: string, xo: number, bw: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + w - xo, yOf(to), bw, yOf(from) - yOf(to));
  };
  band(0, AIRFRAME.vso, C.red, 10, 10);
  band(AIRFRAME.vso, AIRFRAME.vfe, C.white, 16, 6);
  band(AIRFRAME.vs1, AIRFRAME.vno, C.green, 10, 10);
  band(AIRFRAME.vno, AIRFRAME.vne, C.yellow, 10, 10);
  band(AIRFRAME.vne, 400, C.red, 10, 10);
  for (let k = Math.floor((ias - 40) / 5) * 5; k < ias + 40; k += 5) {
    if (k < 20) continue;
    const y = yOf(k);
    const major = k % 10 === 0;
    line(ctx, x + w - 10 - (major ? 18 : 10), y, x + w - 10, y, C.white, 2);
    if (major) text(ctx, String(k), x + w - 34, y, C.white, 20, 'right');
  }
  // Vr / Vy / Vapp references
  for (const [v, l] of [[AIRFRAME.vr, 'R'], [AIRFRAME.vy, 'Y'], [AIRFRAME.vapp, 'G']] as const) {
    const y = yOf(v);
    if (y > top && y < bot) text(ctx, l, x + w + 6, y, C.cyan, 14);
  }
  // trend vector
  if (Math.abs(st.iasTrend) > 1.5 && d.iasKt >= 20) {
    line(ctx, x + w - 4, cy, x + w - 4, cy - st.iasTrend * kpx, C.magenta, 4);
  }
  // speed bug
  if (sim.ap.vert === 'FLC') {
    const y = yOf(sim.ap.iasSel);
    poly(ctx, [[x + w - 2, y - 9], [x + w + 6, y - 9], [x + w + 6, y + 9], [x + w - 2, y + 9], [x + w - 8, y]], C.cyan);
  }
  ctx.restore();
  // pointer box with rolling digits
  const pw = 78;
  poly(ctx, [[x + 2, cy - 22], [x + pw, cy - 22], [x + pw, cy - 10], [x + pw + 12, cy], [x + pw, cy + 10], [x + pw, cy + 22], [x + 2, cy + 22]], '#000', C.white, 2);
  if (d.iasKt < 20) text(ctx, '---', x + 40, cy, C.white, 26, 'center', 700);
  else rollingIas(ctx, d.iasKt, x + 4, cy, d.stallWarn || d.iasKt > AIRFRAME.vne ? C.red : C.white);
  // TAS / selected
  box(ctx, x, bot, w, 26, '#000', C.gray);
  text(ctx, 'TAS', x + 6, bot + 13, C.white, 14);
  text(ctx, `${Math.round(d.tasKt)}KT`, x + w - 6, bot + 13, C.white, 16, 'right');
  if (sim.ap.vert === 'FLC') {
    box(ctx, x, top - 26, w, 26, '#000', C.gray);
    text(ctx, `${sim.ap.iasSel}KT`, x + w / 2, top - 13, C.cyan, 18, 'center');
  }
}

/** IAS readout with a smoothly rolling ones digit. */
function rollingIas(ctx: CanvasRenderingContext2D, value: number, x: number, cy: number, color: string) {
  const v = Math.max(0, value);
  const tens = Math.floor(v / 10);
  const ones = v - tens * 10;
  text(ctx, tens > 0 ? String(tens) : '', x + 44, cy, color, 30, 'right', 700);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 44, cy - 15, 22, 30);
  ctx.clip();
  const base = Math.floor(ones);
  const off = ones - base;
  for (let i = -1; i <= 2; i++) {
    const digit = (((base + i) % 10) + 10) % 10;
    text(ctx, String(digit), x + 46, cy + (off - i) * 32, color, 30, 'left', 700);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ altimeter
function drawAltimeter(ctx: CanvasRenderingContext2D, sim: Sim, st: PfdState) {
  const alt = sim.indicatedAlt();
  const x = 788;
  const w = 100;
  const top = 92;
  const bot = 448;
  const cy = CY;
  const fpx = 0.62;
  box(ctx, x, top, w, bot - top, 'rgba(40,40,40,0.55)');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top, w, bot - top);
  ctx.clip();
  const yOf = (a: number) => cy - (a - alt) * fpx;
  // ground band
  const gnd = sim.ac.s.altFt - sim.ac.data.aglFt + (sim.av.baro - sim.weather.qnh) * 1000;
  if (yOf(gnd) < bot) {
    ctx.fillStyle = '#8a5a24';
    ctx.fillRect(x, yOf(gnd), w, bot - yOf(gnd));
    ctx.strokeStyle = '#d9a35a';
    for (let i = -10; i < 30; i++) line(ctx, x + i * 12, yOf(gnd), x + i * 12 + 30, yOf(gnd) + 30, '#c7924c', 1);
  }
  for (let a = Math.floor((alt - 320) / 20) * 20; a < alt + 320; a += 20) {
    const y = yOf(a);
    const major = a % 100 === 0;
    line(ctx, x, y, x + (major ? 18 : 10), y, C.white, 2);
    if (major) text(ctx, String(a), x + 24, y, C.white, 18);
  }
  // minimums bug
  const mins = sim.av.minimums;
  if (mins !== null) {
    const y = yOf(mins);
    if (y > top && y < bot) {
      poly(ctx, [[x, y], [x + 14, y - 10], [x + 14, y + 10]], undefined, C.cyan, 2.5);
      line(ctx, x + 14, y, x + 30, y, C.cyan, 2.5);
    }
  }
  // altitude bug
  const yb = yOf(sim.ap.altSel);
  const ybc = Math.max(top + 8, Math.min(bot - 8, yb));
  poly(ctx, [[x, ybc - 12], [x + 8, ybc - 12], [x + 8, ybc - 5], [x + 3, ybc], [x + 8, ybc + 5], [x + 8, ybc + 12], [x, ybc + 12]], C.cyan);
  // trend
  if (Math.abs(st.altTrend) > 2) line(ctx, x + 3, cy, x + 3, cy - st.altTrend * 6 * fpx * 10 / 10, C.magenta, 4);
  ctx.restore();
  // pointer box
  const px = x + 8;
  poly(ctx, [[x - 4, cy], [px, cy - 12], [px, cy - 22], [x + w + 6, cy - 22], [x + w + 6, cy + 22], [px, cy + 22], [px, cy + 12]], '#000', C.white, 2);
  const a = Math.round(alt);
  const hundreds = Math.floor(Math.abs(a) / 100);
  text(ctx, String(hundreds), x + 64, cy, C.white, 28, 'right', 700);
  // rolling 20s
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 64, cy - 12, 44, 24);
  ctx.clip();
  const tens = Math.abs(alt) % 100;
  const step = 20;
  const baseVal = Math.floor(tens / step) * step;
  const off = (tens - baseVal) / step;
  for (let i = -2; i <= 2; i++) {
    const v = (((baseVal + i * step) % 100) + 100) % 100;
    text(ctx, String(v).padStart(2, '0'), x + 66, cy + (off - i) * 30, C.white, 20, 'left', 700);
  }
  ctx.restore();
  // selected altitude
  box(ctx, x, top - 26, w, 26, '#000', C.gray);
  text(ctx, String(sim.ap.altSel), x + w / 2, top - 13, C.cyan, 20, 'center', 700);
  // baro
  box(ctx, x, bot, w, 26, '#000', C.gray);
  const std = Math.abs(sim.av.baro - 29.92) < 0.001;
  text(ctx, std ? 'STD BARO' : `${sim.av.baro.toFixed(2)}IN`, x + w / 2, bot + 13, C.cyan, 17, 'center');
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
    text(ctx, showGp ? 'V' : 'G', gx, 140, showGp ? C.magenta : C.green, 16, 'center', 700);
    for (const dot of [-2, -1, 1, 2]) {
      ctx.strokeStyle = C.white;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gx, cy + dot * 50, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    line(ctx, gx - 10, cy, gx + 10, cy, C.white, 2);
    const valid = showGp ? n.gps.gpValid : n.nav.gsValid;
    if (valid) {
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
  poly(ctx, [[x, top], [x + 44, top], [x + 44, bot], [x, bot], [x, cy + 20], [x - 6, cy], [x, cy - 20]], 'rgba(40,40,40,0.55)');
  for (const v of [-2000, -1500, -1000, -500, 500, 1000, 1500, 2000]) {
    const y = cy - v * k;
    const major = v % 1000 === 0;
    line(ctx, x, y, x + (major ? 14 : 8), y, C.white, 2);
    if (major) text(ctx, String(Math.abs(v) / 1000), x + 18, y, C.white, 15);
  }
  line(ctx, x, cy, x + 14, cy, C.white, 2);
  if (sim.ap.vert === 'VS') {
    const y = cy - Math.max(-2000, Math.min(2000, sim.ap.vsSel)) * k;
    poly(ctx, [[x + 2, y - 8], [x + 10, y - 8], [x + 10, y + 8], [x + 2, y + 8]], C.cyan);
    box(ctx, x - 6, top - 26, 54, 24, '#000', C.gray);
    text(ctx, String(sim.ap.vsSel), x + 21, top - 14, C.cyan, 16, 'center');
  }
  const yp = cy - Math.max(-2050, Math.min(2050, vs)) * k;
  poly(ctx, [[x + 4, yp], [x + 16, yp - 11], [x + 62, yp - 11], [x + 62, yp + 11], [x + 16, yp + 11]], '#000', C.white, 1.5);
  if (Math.abs(vs) >= 100) text(ctx, String(Math.round(vs / 50) * 50), x + 60, yp, C.white, 15, 'right');
}

// ------------------------------------------------------------------ HSI
function drawHsi(ctx: CanvasRenderingContext2D, sim: Sim, st: PfdState) {
  const d = sim.ac.data;
  const hx = 512;
  const hy = 610;
  const R = 132;
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

  // bearing pointers
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
  ctx.rotate(crs * DEG);
  // arrow head and tail
  line(ctx, 0, -R + 18, 0, -58, col, 5);
  poly(ctx, [[0, -R + 6], [-13, -R + 28], [13, -R + 28]], col);
  line(ctx, 0, 58, 0, R - 8, col, 5);
  // dots
  for (const dot of [-2, -1, 1, 2]) {
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(dot * 34, 0, 6, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (valid) {
    const dx = Math.max(-1.2, Math.min(1.2, dev)) * 68;
    line(ctx, dx, -52, dx, 52, col, 5);
    if (toFrom !== 'OFF') {
      const ty = toFrom === 'TO' ? -1 : 1;
      poly(ctx, [[dx + 22, ty * 32], [dx + 12, ty * 18], [dx + 32, ty * 18]], col);
    }
  }
  ctx.restore();
  // aircraft symbol in HSI
  ctx.save();
  ctx.translate(hx, hy);
  ctx.fillStyle = C.white;
  ctx.fillRect(-2, -18, 4, 34);
  ctx.fillRect(-16, -4, 32, 4);
  ctx.fillRect(-7, 12, 14, 3);
  ctx.restore();
  // source labels
  const srcLabel = isGps ? 'GPS' : `${n.nav.isLoc ? 'LOC' : 'VOR'}${n.cdi === 'NAV1' ? '1' : '2'}`;
  text(ctx, srcLabel, hx - 62, hy - 30, col, 17, 'center', 700);
  if (isGps) text(ctx, n.gps.mode === 'MAPR' ? 'MAPR' : n.gps.mode, hx + 62, hy - 30, col, 17, 'center', 700);
  if (!valid && !isGps) {
    text(ctx, '—', hx + 62, hy - 30, C.amber, 17, 'center');
  }
  if (isGps && n.gps.approachName && n.gps.mode === 'APR') {
    const ap = sim.fp.approach;
    const lbl = ap?.type === 'RNAV' ? (ap.minimums[0].label === 'LPV' ? 'LPV' : 'L/VNAV') : 'LNAV';
    text(ctx, lbl, hx + 62, hy - 10, col, 14, 'center');
  }
  // HDG / CRS windows
  box(ctx, hx - R - 108, hy - R - 46, 96, 28, '#000', C.gray);
  text(ctx, 'HDG', hx - R - 100, hy - R - 32, C.white, 15);
  text(ctx, `${pad3(sim.ap.hdgBug)}°`, hx - R - 18, hy - R - 32, C.cyan, 19, 'right');
  box(ctx, hx + R + 12, hy - R - 46, 96, 28, '#000', C.gray);
  text(ctx, 'CRS', hx + R + 20, hy - R - 32, C.white, 15);
  text(ctx, `${pad3(crs)}°`, hx + R + 102, hy - R - 32, col, 19, 'right');
  // DME window / bearing info
  if (st.dmeWindow) {
    const nv = sim.nav1;
    box(ctx, 300, 640, 100, 66, 'rgba(0,0,0,0.75)', C.gray);
    text(ctx, 'DME', 310, 654, C.white, 14);
    text(ctx, 'NAV1', 360, 654, C.white, 13);
    text(ctx, nv.valid ? fmtFreq(sim.av.nav1.active) : '—', 310, 674, C.green, 16);
    text(ctx, nv.dmeNm !== null ? `${nv.dmeNm.toFixed(1)} NM` : '---.- NM', 310, 694, C.white, 16);
  }
  const brgInfo = (src: string, x: number, align: CanvasTextAlign) => {
    if (src === 'OFF') return;
    const b = bearing(src);
    const ident = src === 'NAV1' ? sim.nav1.ident : src === 'NAV2' ? sim.nav2.ident : src === 'ADF' ? sim.adf.ident : sim.fp.out.toIdent;
    const dist = src === 'NAV1' ? sim.nav1.dmeNm : src === 'NAV2' ? sim.nav2.dmeNm : src === 'ADF' ? null : sim.fp.out.distNm;
    box(ctx, x, 708, 120, 32, 'rgba(0,0,0,0.75)', C.gray);
    const tx = align === 'left' ? x + 8 : x + 112;
    text(ctx, `${dist !== null && dist !== undefined ? dist.toFixed(1) + ' NM' : ''} ${src}`, tx, 717, C.white, 13, align);
    text(ctx, `${b !== null ? pad3(b) + '°' : 'NO DATA'} ${ident}`, tx, 732, C.cyan, 14, align);
  };
  brgInfo(sim.av.bearing1, 270, 'left');
  brgInfo(sim.av.bearing2, 634, 'right');
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
    text(ctx, 'STBY ATTITUDE', cx, cy + r + 18, C.white, 14, 'center', 700);
    text(ctx, 'AHRS FAIL', cx, 108, C.red, 18, 'center', 700);
    // HSI red X + magnetic compass with lag (northerly turning errors are left to the pilot!)
    redX(ctx, 512 - 150, 610 - 165, 300, 300, 'HDG FAIL');
    let diff = d.hdgTrue - compassHdg;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    compassHdg = (compassHdg + diff * Math.min(1, 0.05 + Math.abs(Math.cos(d.hdgTrue * DEG)) * 0.08) + 360) % 360;
    box(ctx, 452, 690, 120, 36, '#111', C.gray);
    text(ctx, `COMPASS ${pad3(compassHdg)}`, 512, 708, C.white, 15, 'center', 700);
  } else compassHdg = d.hdgTrue;
  if (f.airData) {
    redX(ctx, 120, 92, 96, 356);
    redX(ctx, 788, 92, 100, 356);
    redX(ctx, 896, 118, 46, 300);
    text(ctx, 'ADC FAIL', 840, 470, C.red, 15, 'center', 700);
  }
  const alerts: string[] = [];
  if (f.gps) alerts.push('LOI — GPS INTEGRITY LOST');
  if (f.ap) alerts.push('AP FAIL');
  if (f.nav1) alerts.push('NAV1 FAIL');
  if (f.gs) alerts.push('GS OUT');
  if (f.engine) alerts.push('ENGINE FAILURE');
  if (sim.ac.s.fuelGal < 8) alerts.push('LOW FUEL');
  alerts.forEach((a, i) => {
    const flash = Math.floor(st.flash * 2) % 2 === 0 || st.flash % 10 > 5;
    box(ctx, 640, 460 + i * 26, 140, 22, flash ? C.amber : '#000', C.amber);
    text(ctx, a.length > 20 ? a.slice(0, 18) + '…' : a, 710, 471 + i * 26, flash ? '#000' : C.amber, 12.5, 'center', 700);
  });
}

// ------------------------------------------------------------------ lower windows
function drawLowerWindows(ctx: CanvasRenderingContext2D, sim: Sim, st: PfdState) {
  const d = sim.ac.data;
  // OAT
  box(ctx, 0, 716, 110, 26, '#000', C.gray);
  text(ctx, `OAT ${Math.round(d.oatC)}°C`, 8, 729, C.white, 16);
  // wind
  box(ctx, 120, 470, 112, 56, 'rgba(0,0,0,0.75)', C.gray);
  if (d.windKt > 0.5 && !sim.ac.s.onGround) {
    const rel = (d.windDir + 180 - d.hdgTrue) * DEG;
    ctx.save();
    ctx.translate(146, 498);
    ctx.rotate(rel);
    line(ctx, 0, 14, 0, -12, C.white, 3);
    poly(ctx, [[0, -16], [-7, -5], [7, -5]], C.white);
    ctx.restore();
    text(ctx, `${pad3(d.windDir)}°`, 176, 484, C.white, 15, 'left');
    text(ctx, `${Math.round(d.windKt)}KT`, 176, 500, C.white, 15, 'left');
    // G1000 wind option 2: head/tail and cross components
    const hw = Math.round(d.headwindKt);
    const xw = Math.round(d.crosswindKt);
    text(ctx, `${hw >= 0 ? '▼' : '▲'}${Math.abs(hw)}`, 176, 516, hw >= 0 ? C.white : C.amber, 13, 'left');
    text(ctx, `${xw >= 0 ? '◀' : '▶'}${Math.abs(xw)}`, 206, 516, Math.abs(xw) > 15 ? C.amber : C.white, 13, 'left');
  } else text(ctx, 'NO WIND DATA', 176, 498, C.white, 12, 'center');
  // inset map
  if (sim.av.inset) {
    const x = 6;
    const y = 534;
    const w = 236;
    const h = 176;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    drawMap(ctx, sim, { x, y, w, h }, 6, true);
    ctx.restore();
    ctx.strokeStyle = C.gray;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  // XPDR / time
  box(ctx, 780, 716, 244, 26, '#000', C.gray);
  text(ctx, `XPDR ${sim.av.xpdr}`, 790, 729, C.green, 16);
  text(ctx, sim.av.xpdrMode, 890, 729, C.green, 16);
  const tmr = sim.chrono();
  const tt = tmr ?? sim.time;
  const mm = Math.floor(tt / 60);
  const ss = Math.floor(tt % 60);
  text(ctx, `${tmr !== null ? 'TMR' : 'ET'} ${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, 1016, 729, tmr !== null ? C.cyan : C.white, 16, 'right');
  // baro minimums window
  if (sim.av.minimums !== null) {
    box(ctx, 790, 470, 98, 46, 'rgba(0,0,0,0.75)', C.gray);
    text(ctx, 'BARO MIN', 798, 484, C.white, 13);
    text(ctx, `${sim.av.minimums}FT`, 880, 504, C.cyan, 17, 'right');
  }
  void st;
}

export function drawSoftkeys(ctx: CanvasRenderingContext2D, labels: string[], flashIdx: number | null, active: Record<string, boolean>) {
  const y = PFD_H - 24;
  box(ctx, 0, y, PFD_W, 24, '#000');
  const w = PFD_W / 12;
  labels.forEach((l, i) => {
    const x = i * w;
    line(ctx, x, y + 2, x, PFD_H, '#333', 1);
    if (!l) return;
    const on = active[l];
    if (on) box(ctx, x + 4, y + 2, w - 8, 20, '#5b6066');
    if (flashIdx === i) box(ctx, x + 4, y + 2, w - 8, 20, '#9aa0a6');
    text(ctx, l, x + w / 2, y + 12, on ? '#000' : C.white, 14, 'center', 700);
  });
}

export function softkeyAt(xLogical: number, yLogical: number, h = PFD_H, w = PFD_W): number | null {
  if (yLogical < h - 28) return null;
  return Math.floor(xLogical / (w / 12));
}

