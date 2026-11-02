// Airliner-style displays (Boeing-like PFD and ND) for the same trainer aircraft.
import type { Sim } from '../sim/sim';
import { AIRFRAME } from '../sim/aircraft';
import { C, box, line, poly, text, pad3 } from './draw';
import { AIRPORTS, FIXES, NAVAIDS } from '../nav/data';
import { toLocal, destination, wrap180, DEG, bearingDeg, type LatLon } from '../nav/geo';
import { tunedNavaid } from '../nav/radios';

export const AL_W = 1024;
export const AL_H = 768;
const MAG = '#ff5cf4';
const GRN = '#3cf56b';
const CYN = '#20e3ff';
const AMB = '#ffb21e';
const WHT = '#ffffff';
const GRY = '#5c636b';

// ------------------------------------------------------------------ PFD
export function drawAirlinerPfd(ctx: CanvasRenderingContext2D, sim: Sim) {
  const d = sim.ac.data;
  ctx.clearRect(0, 0, AL_W, AL_H);
  box(ctx, 0, 0, AL_W, AL_H, '#000');
  const cx = 500;
  const cy = 340;
  const ppd = 8.5;
  // --- ADI
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(cx - 190, cy - 200, 380, 400, 34);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-d.rollDeg * DEG);
  ctx.translate(0, d.pitchDeg * ppd);
  ctx.fillStyle = '#1b7fe0';
  ctx.fillRect(-900, -1800, 1800, 1800);
  ctx.fillStyle = '#7a4a17';
  ctx.fillRect(-900, 0, 1800, 1800);
  line(ctx, -900, 0, 900, 0, WHT, 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-130, -d.pitchDeg * ppd - 150, 260, 270);
  ctx.clip();
  for (let p = -30; p <= 30; p += 2.5) {
    if (!p) continue;
    const y = -p * ppd;
    const w = p % 10 === 0 ? 70 : p % 5 === 0 ? 40 : 18;
    line(ctx, -w / 2, y, w / 2, y, WHT, 2);
    if (p % 10 === 0) {
      text(ctx, String(Math.abs(p)), -w / 2 - 16, y, WHT, 15, 'center');
      text(ctx, String(Math.abs(p)), w / 2 + 16, y, WHT, 15, 'center');
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
    line(ctx, Math.cos(ang) * 170, Math.sin(ang) * 170, Math.cos(ang) * (170 + l), Math.sin(ang) * (170 + l), WHT, 2);
  }
  ctx.strokeStyle = WHT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 170, -150 * DEG, -30 * DEG);
  ctx.stroke();
  poly(ctx, [[0, -172], [-9, -186], [9, -186]], undefined, WHT, 2);
  ctx.rotate(-d.rollDeg * DEG);
  poly(ctx, [[0, -168], [-10, -150], [10, -150]], Math.abs(d.rollDeg) > 35 ? AMB : WHT);
  const sl = d.slip * 16;
  poly(ctx, [[-12 + sl, -146], [12 + sl, -146], [14 + sl, -139], [-14 + sl, -139]], Math.abs(d.slip) > 0.6 ? AMB : WHT);
  ctx.restore();
  // flight director bars (Boeing crossbars)
  if (sim.ap.fd) {
    const dx = Math.max(-1, Math.min(1, (sim.ap.bankCmd - d.rollDeg) / 25)) * 110;
    const dy = Math.max(-1, Math.min(1, (sim.ap.pitchCmd - d.pitchDeg) / 10)) * 110;
    line(ctx, cx + dx, cy - 110, cx + dx, cy + 110, MAG, 3.5);
    line(ctx, cx - 110, cy - dy, cx + 110, cy - dy, MAG, 3.5);
  }
  // aircraft symbol
  const wing = (s: number) => {
    poly(ctx, [[cx + s * 50, cy - 5], [cx + s * 120, cy - 5], [cx + s * 120, cy + 5], [cx + s * 62, cy + 5], [cx + s * 62, cy + 22], [cx + s * 50, cy + 22]], '#000', WHT, 2.5);
  };
  wing(-1);
  wing(1);
  box(ctx, cx - 6, cy - 6, 12, 12, '#000', WHT);
  // ILS deviation
  const n = sim.navInputs();
  const isGps = n.cdi === 'GPS';
  const latValid = isGps ? n.gps.valid && sim.fp.approachActive : n.nav.valid && n.nav.isLoc;
  const vertValid = isGps ? n.gps.gpValid : n.nav.gsValid;
  for (const k of [-2, -1, 1, 2]) {
    ctx.strokeStyle = WHT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx + k * 44, cy + 228, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 222, cy + k * 44, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  line(ctx, cx, cy + 216, cx, cy + 240, WHT, 2);
  line(ctx, cx + 210, cy, cx + 234, cy, WHT, 2);
  if (latValid) {
    const x = cx + Math.max(-1.2, Math.min(1.2, isGps ? n.gps.dev : n.nav.dev)) * 88;
    poly(ctx, [[x, cy + 218], [x + 10, cy + 228], [x, cy + 238], [x - 10, cy + 228]], MAG, MAG);
  }
  if (vertValid) {
    const y = cy - Math.max(-1.2, Math.min(1.2, isGps ? n.gps.gpDev : n.nav.gsDev)) * 88;
    poly(ctx, [[cx + 222, y - 10], [cx + 232, y], [cx + 222, y + 10], [cx + 212, y]], MAG, MAG);
  }
  // ILS info top-left of ADI
  if (!isGps && n.nav.valid) {
    text(ctx, `${n.nav.ident}/${(n.cdi === 'NAV2' ? sim.av.nav2 : sim.av.nav1).active.toFixed(2)}`, cx - 186, cy - 182, WHT, 15);
    text(ctx, `${pad3(sim.course())}°`, cx - 186, cy - 164, WHT, 15);
    if (n.nav.dmeNm !== null) text(ctx, `DME ${n.nav.dmeNm.toFixed(1)}`, cx - 186, cy - 146, WHT, 15);
  } else if (isGps && n.gps.valid) {
    text(ctx, `FMC ${n.gps.mode}`, cx - 186, cy - 182, MAG, 15);
  }
  // marker
  if (sim.marker) {
    box(ctx, cx + 120, cy - 196, 44, 26, '#000', CYN);
    text(ctx, 'OM', cx + 142, cy - 183, CYN, 16, 'center', 700);
  }
  // radio altitude & minimums
  if (d.aglFt < 2500 && !sim.ac.s.onGround) text(ctx, String(Math.round(d.aglFt / 10) * 10), cx, cy + 170, d.aglFt < 1000 ? AMB : WHT, 22, 'center', 700);
  if (sim.av.minimums !== null) {
    const below = sim.indicatedAlt() < sim.av.minimums;
    text(ctx, 'BARO', cx + 150, cy + 168, below ? AMB : GRN, 13, 'center');
    text(ctx, String(sim.av.minimums), cx + 150, cy + 186, below ? AMB : GRN, 17, 'center', 700);
    if (below && Math.floor(performance.now() / 400) % 2 === 0) text(ctx, 'MINIMUMS', cx, cy - 120, AMB, 20, 'center', 700);
  }
  if (d.stallWarn) {
    box(ctx, cx - 50, cy + 80, 100, 26, '#000', C.red);
    text(ctx, 'STALL', cx, cy + 93, C.red, 18, 'center', 700);
  }
  drawFma(ctx, sim, cx);
  drawSpeedTape(ctx, sim, 110, cy);
  drawAltTape(ctx, sim, 760, cy);
  drawVsiAl(ctx, d.vsFpm, 900, cy);
  drawHdgArc(ctx, sim, cx, 640);
  if (sim.paused) {
    box(ctx, cx - 70, cy + 40, 140, 32, '#000', WHT);
    text(ctx, 'PAUSED', cx, cy + 56, WHT, 20, 'center', 700);
  }
  if (sim.ac.s.crashed) {
    box(ctx, cx - 200, cy - 40, 400, 80, 'rgba(160,0,0,.9)', WHT);
    text(ctx, sim.ac.s.crashed, cx, cy, WHT, 18, 'center', 700);
  }
}

function drawFma(ctx: CanvasRenderingContext2D, sim: Sim, cx: number) {
  const ap = sim.ap;
  box(ctx, cx - 300, 6, 600, 58, '#000');
  ctx.strokeStyle = GRY;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - 299, 7, 598, 56);
  for (const x of [cx - 100, cx + 100]) line(ctx, x, 10, x, 60, GRY, 1.5);
  const lat: Record<string, string> = { ROL: 'ROLL', HDG: 'HDG SEL', GPS: 'LNAV', VOR: 'VOR/LOC', LOC: 'LOC', BC: 'B/CRS' };
  const ver: Record<string, string> = { PIT: 'PITCH', ALT: 'ALT HOLD', VS: 'V/S', FLC: 'FLCH SPD', GS: 'G/S', GP: 'G/P' };
  const thr = sim.controls.throttle;
  text(ctx, thr > 0.97 ? 'TO/GA' : 'MAN THR', cx - 200, 24, GRN, 17, 'center', 700);
  if (ap.engaged) {
    text(ctx, lat[ap.lat] ?? ap.lat, cx, 24, GRN, 17, 'center', 700);
    if (ap.latArmed) text(ctx, lat[ap.latArmed] ?? '', cx, 48, WHT, 15, 'center');
    text(ctx, ver[ap.vert] ?? ap.vert, cx + 200, 24, GRN, 17, 'center', 700);
    const armed = ap.vertArmed.gs ? 'G/S' : ap.vertArmed.gp ? 'G/P' : '';
    if (armed) text(ctx, armed, cx + 200, 48, WHT, 15, 'center');
  }
  const status = ap.ap ? 'CMD' : ap.fd ? 'FD' : '';
  if (status) {
    box(ctx, cx - 30, 72, 60, 26, '#000', GRN);
    text(ctx, status, cx, 85, GRN, 17, 'center', 700);
  } else if (ap.annunciation && Math.floor(performance.now() / 300) % 2 === 0) {
    box(ctx, cx - 70, 72, 140, 26, AMB);
    text(ctx, 'AP DISCONNECT', cx, 85, '#000', 14, 'center', 700);
  }
}

function drawSpeedTape(ctx: CanvasRenderingContext2D, sim: Sim, x: number, cy: number) {
  const d = sim.ac.data;
  const w = 100;
  const top = cy - 210;
  const h = 420;
  const kpx = 4.6;
  const ias = Math.max(30, d.iasKt);
  box(ctx, x, top, w, h, '#3a3f45');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top, w, h);
  ctx.clip();
  const yOf = (k: number) => cy - (k - ias) * kpx;
  for (let k = Math.floor((ias - 50) / 10) * 10; k < ias + 50; k += 10) {
    if (k < 30) continue;
    const y = yOf(k);
    line(ctx, x + w - 16, y, x + w, y, WHT, 2);
    if (k % 20 === 0) text(ctx, String(k), x + w - 22, y, WHT, 19, 'right');
    line(ctx, x + w - 8, y + 5 * kpx, x + w, y + 5 * kpx, WHT, 2);
  }
  // barber pole above VNE
  const yv = yOf(AIRFRAME.vne);
  for (let yy = yv; yy > top - 20; yy -= 16) {
    box(ctx, x + w - 8, yy - 8, 8, 8, C.red);
    box(ctx, x + w - 8, yy - 16, 8, 8, '#000');
  }
  // amber low speed / red stall band
  box(ctx, x + w - 8, yOf(AIRFRAME.vs1 + 10), 6, yOf(AIRFRAME.vs1) - yOf(AIRFRAME.vs1 + 10), AMB);
  for (let yy = yOf(AIRFRAME.vs1); yy < top + h + 20; yy += 16) {
    box(ctx, x + w - 8, yy, 8, 8, C.red);
  }
  // speed bug
  const bug = sim.ap.vert === 'FLC' ? sim.ap.iasSel : AIRFRAME.vapp;
  const yb = yOf(bug);
  poly(ctx, [[x + w, yb], [x + w + 10, yb - 8], [x + w + 18, yb - 8], [x + w + 18, yb + 8], [x + w + 10, yb + 8]], undefined, MAG, 2.5);
  // V-speed refs
  for (const [v, l] of [[AIRFRAME.vr, 'VR'], [AIRFRAME.vy, 'VY'], [AIRFRAME.vfe, 'F20']] as const) {
    const y = yOf(v);
    if (y > top && y < top + h) {
      line(ctx, x + w, y, x + w + 8, y, GRN, 2);
      text(ctx, l, x + w + 10, y, GRN, 13);
    }
  }
  ctx.restore();
  // readout
  poly(ctx, [[x + 4, cy - 22], [x + w - 12, cy - 22], [x + w - 12, cy - 8], [x + w, cy], [x + w - 12, cy + 8], [x + w - 12, cy + 22], [x + 4, cy + 22]], '#000', WHT, 2);
  text(ctx, d.iasKt < 30 ? '---' : String(Math.round(d.iasKt)), x + w - 18, cy, d.stallWarn ? AMB : WHT, 28, 'right', 700);
  text(ctx, String(Math.round(sim.ap.vert === 'FLC' ? sim.ap.iasSel : AIRFRAME.vapp)), x + w / 2, top - 18, MAG, 22, 'center', 700);
  text(ctx, `GS ${Math.round(d.gsKt)}`, x + w / 2, top + h + 22, WHT, 16, 'center');
  text(ctx, `TAS ${Math.round(d.tasKt)}`, x + w / 2, top + h + 42, WHT, 14, 'center');
}

function drawAltTape(ctx: CanvasRenderingContext2D, sim: Sim, x: number, cy: number) {
  const alt = sim.indicatedAlt();
  const w = 110;
  const top = cy - 210;
  const h = 420;
  const fpx = 0.42;
  box(ctx, x, top, w, h, '#3a3f45');
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, top, w, h);
  ctx.clip();
  const yOf = (a: number) => cy - (a - alt) * fpx;
  for (let a = Math.floor((alt - 600) / 100) * 100; a < alt + 600; a += 100) {
    const y = yOf(a);
    line(ctx, x, y, x + 14, y, WHT, 2);
    if (a % 200 === 0) text(ctx, String(a), x + 20, y, WHT, 18);
    if (a % 1000 === 0) {
      line(ctx, x, y - 12, x + w, y - 12, WHT, 1.5);
      line(ctx, x, y + 12, x + w, y + 12, WHT, 1.5);
    }
  }
  const yb = Math.max(top + 8, Math.min(top + h - 8, yOf(sim.ap.altSel)));
  poly(ctx, [[x, yb - 18], [x + 18, yb - 18], [x + 18, yb + 18], [x, yb + 18], [x, yb + 8], [x + 8, yb], [x, yb - 8]], undefined, MAG, 3);
  if (sim.av.minimums !== null) {
    const y = yOf(sim.av.minimums);
    line(ctx, x - 20, y, x + w, y, GRN, 2.5);
  }
  const gnd = alt - sim.ac.data.aglFt;
  if (yOf(gnd) < top + h) box(ctx, x, yOf(gnd), w, top + h - yOf(gnd), 'rgba(255,178,30,0.35)');
  ctx.restore();
  poly(ctx, [[x - 10, cy], [x + 4, cy - 12], [x + 4, cy - 24], [x + w + 4, cy - 24], [x + w + 4, cy + 24], [x + 4, cy + 24], [x + 4, cy + 12]], '#000', WHT, 2);
  const a = Math.round(alt / 20) * 20;
  text(ctx, String(Math.floor(a / 100)), x + 64, cy, WHT, 28, 'right', 700);
  text(ctx, String(Math.abs(a % 100)).padStart(2, '0'), x + 66, cy + 2, WHT, 20, 'left', 700);
  text(ctx, String(sim.ap.altSel), x + w / 2, top - 18, MAG, 22, 'center', 700);
  const std = Math.abs(sim.av.baro - 29.92) < 0.001;
  text(ctx, std ? 'STD' : `${sim.av.baro.toFixed(2)} IN`, x + w / 2, top + h + 22, std ? GRN : GRN, 17, 'center', 700);
}

function drawVsiAl(ctx: CanvasRenderingContext2D, fpm: number, x: number, cy: number) {
  poly(ctx, [[x, cy - 170], [x + 30, cy - 170], [x + 56, cy - 60], [x + 56, cy + 60], [x + 30, cy + 170], [x, cy + 170]], '#3a3f45');
  const yOf = (v: number) => {
    const s = Math.sign(v);
    const a = Math.abs(v);
    const f = a <= 1000 ? (a / 1000) * 100 : a <= 2000 ? 100 + ((a - 1000) / 1000) * 40 : 140 + Math.min(1, (a - 2000) / 4000) * 25;
    return cy - s * f;
  };
  for (const v of [-6000, -2000, -1000, -500, 500, 1000, 2000, 6000]) {
    const y = yOf(v);
    line(ctx, x + 4, y, x + 16, y, WHT, 2);
    if (Math.abs(v) >= 1000) text(ctx, String(Math.abs(v) / 1000), x + 2, y, WHT, 13, 'right');
  }
  line(ctx, x + 4, cy, x + 22, cy, WHT, 3);
  line(ctx, x + 80, cy, x + 8, yOf(fpm), WHT, 3);
  if (Math.abs(fpm) > 400) text(ctx, String(Math.round(Math.abs(fpm) / 50) * 50), x + 28, fpm > 0 ? cy - 186 : cy + 186, WHT, 15, 'center');
}

function drawHdgArc(ctx: CanvasRenderingContext2D, sim: Sim, cx: number, cy: number) {
  const d = sim.ac.data;
  const R = 230;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 280, cy - 30, 560, 140);
  ctx.clip();
  box(ctx, cx - 280, cy - 30, 560, 140, '#000');
  ctx.translate(cx, cy + R - 10);
  ctx.fillStyle = '#3a3f45';
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(-d.hdgTrue * DEG);
  for (let a = 0; a < 360; a += 5) {
    const ang = (a - 90) * DEG;
    const l = a % 10 === 0 ? 16 : 9;
    line(ctx, Math.cos(ang) * R, Math.sin(ang) * R, Math.cos(ang) * (R - l), Math.sin(ang) * (R - l), WHT, 2);
    if (a % 30 === 0) {
      ctx.save();
      ctx.rotate(a * DEG);
      text(ctx, String(a / 10), 0, -R + 30, WHT, 18, 'center');
      ctx.restore();
    }
  }
  ctx.save();
  ctx.rotate(sim.ap.hdgBug * DEG);
  poly(ctx, [[-12, -R], [12, -R], [12, -R + 10], [0, -R + 4], [-12, -R + 10]], undefined, MAG, 2.5);
  ctx.restore();
  ctx.save();
  ctx.rotate(d.trackTrue * DEG);
  line(ctx, 0, -R + 6, 0, -R + 80, WHT, 2);
  ctx.restore();
  ctx.restore();
  box(ctx, cx - 34, cy - 36, 68, 30, '#000', WHT);
  text(ctx, pad3(d.hdgTrue), cx, cy - 21, WHT, 22, 'center', 700);
  text(ctx, 'MAG', cx + 54, cy - 21, GRN, 13);
  text(ctx, `${pad3(sim.ap.hdgBug)} H`, cx - 150, cy - 18, MAG, 17, 'center', 700);
  if (sim.navInputs().cdi !== 'GPS') text(ctx, `CRS ${pad3(sim.course())}`, cx + 150, cy - 18, GRN, 17, 'center', 700);
}

// ------------------------------------------------------------------ ND (map arc mode)
export function drawNd(ctx: CanvasRenderingContext2D, sim: Sim, rangeNm: number) {
  const d = sim.ac.data;
  const s = sim.ac.s;
  ctx.clearRect(0, 0, AL_W, AL_H);
  box(ctx, 0, 0, AL_W, AL_H, '#000');
  const cx = 512;
  const cy = 640;
  const R = 520;
  const ppn = R / rangeNm;
  const up = d.hdgTrue;
  const xy = (p: LatLon) => {
    const l = toLocal(s, p);
    // heading-up: rotate world by +heading so that the heading points up the screen
    const a = up * DEG;
    const x = l.x * Math.cos(a) - l.y * Math.sin(a);
    const y = l.x * Math.sin(a) + l.y * Math.cos(a);
    return { x: cx + x * ppn, y: cy - y * ppn };
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 50, AL_W, AL_H - 50);
  ctx.clip();
  // range arcs
  ctx.strokeStyle = WHT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, -150 * DEG, -30 * DEG);
  ctx.stroke();
  ctx.setLineDash([6, 8]);
  ctx.lineWidth = 1.2;
  for (const f of [0.25, 0.5, 0.75]) {
    ctx.beginPath();
    ctx.arc(cx, cy, R * f, -150 * DEG, -30 * DEG);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  text(ctx, String(rangeNm / 2), cx - R * 0.5 * Math.cos(30 * DEG) - 16, cy - R * 0.5 * Math.sin(60 * DEG) + 30, WHT, 15);
  // compass on arc
  for (let a = -60; a <= 60; a += 5) {
    const hd = Math.round((up + a) / 5) * 5;
    const rel = wrap180(hd - up);
    if (Math.abs(rel) > 62) continue;
    const ang = (rel - 90) * DEG;
    const l = hd % 10 === 0 ? 16 : 9;
    line(ctx, cx + Math.cos(ang) * R, cy + Math.sin(ang) * R, cx + Math.cos(ang) * (R + l), cy + Math.sin(ang) * (R + l), WHT, 2);
    if (hd % 30 === 0) text(ctx, String((((hd % 360) + 360) % 360) / 10), cx + Math.cos(ang) * (R + 30), cy + Math.sin(ang) * (R + 30), WHT, 18, 'center');
  }
  // heading bug & track line
  const rb = wrap180(sim.ap.hdgBug - up);
  if (Math.abs(rb) < 62) {
    const ang = (rb - 90) * DEG;
    poly(ctx, [[cx + Math.cos(ang) * R, cy + Math.sin(ang) * R], [cx + Math.cos(ang - 0.02) * (R - 14), cy + Math.sin(ang - 0.02) * (R - 14)], [cx + Math.cos(ang + 0.02) * (R - 14), cy + Math.sin(ang + 0.02) * (R - 14)]], undefined, MAG, 2.5);
  }
  const rt = wrap180(d.trackTrue - up);
  const at = (rt - 90) * DEG;
  ctx.setLineDash([10, 8]);
  line(ctx, cx, cy, cx + Math.cos(at) * R, cy + Math.sin(at) * R, WHT, 1.5);
  ctx.setLineDash([]);
  // airports & navaids
  for (const a of AIRPORTS) {
    const p = xy(a);
    ctx.strokeStyle = CYN;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.stroke();
    text(ctx, a.icao, p.x + 12, p.y - 10, CYN, 15);
    for (let i = 0; i < a.runways.length; i += 2) {
      const r1 = xy(a.runways[i].threshold);
      const r2 = xy(a.runways[i].end);
      line(ctx, r1.x, r1.y, r2.x, r2.y, WHT, 3);
    }
  }
  for (const n of NAVAIDS) {
    if (n.type === 'ILS' || n.type === 'LOC') {
      if (tunedNavaid(sim.av.nav1.active)?.ident !== n.ident) continue;
      const a = xy(n);
      const b = xy(destination(n, (n.course ?? 0) + 180, 14));
      ctx.setLineDash([12, 8]);
      line(ctx, a.x, a.y, b.x, b.y, MAG, 2);
      ctx.setLineDash([]);
      continue;
    }
    const p = xy(n);
    ctx.strokeStyle = n.type === 'NDB' ? '#a7f' : CYN;
    ctx.lineWidth = 2;
    if (n.type === 'NDB') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      poly(ctx, [[p.x, p.y - 9], [p.x + 8, p.y + 5], [p.x - 8, p.y + 5]], undefined, CYN, 2);
    }
    text(ctx, n.ident, p.x + 12, p.y + 12, n.type === 'NDB' ? '#a7f' : CYN, 14);
  }
  if (rangeNm <= 20) {
    for (const f of FIXES) {
      if (f.kind !== 'fix') continue;
      const p = xy(f);
      poly(ctx, [[p.x, p.y - 6], [p.x + 6, p.y + 4], [p.x - 6, p.y + 4]], undefined, '#9aa', 1.5);
      text(ctx, f.ident, p.x + 8, p.y - 6, '#9aa', 12);
    }
  }
  // route
  const fp = sim.fp;
  for (let i = 1; i < fp.wpts.length; i++) {
    const a = xy(fp.wpts[i - 1]);
    const b = xy(fp.wpts[i]);
    const act = i === fp.active;
    if (fp.wpts[i].appr === 'missed') ctx.setLineDash([10, 8]);
    line(ctx, a.x, a.y, b.x, b.y, act ? MAG : WHT, act ? 3 : 2);
    ctx.setLineDash([]);
  }
  if (fp.directFrom && fp.wpts[fp.active]) {
    const a = xy(fp.directFrom);
    const b = xy(fp.wpts[fp.active]);
    line(ctx, a.x, a.y, b.x, b.y, MAG, 3);
  }
  fp.wpts.forEach((w, i) => {
    const p = xy(w);
    const c = i === fp.active ? MAG : WHT;
    // 4-point star
    poly(ctx, [[p.x, p.y - 10], [p.x + 3, p.y - 3], [p.x + 10, p.y], [p.x + 3, p.y + 3], [p.x, p.y + 10], [p.x - 3, p.y + 3], [p.x - 10, p.y], [p.x - 3, p.y - 3]], undefined, c, 2);
    text(ctx, w.ident, p.x + 12, p.y + 2, c, 15);
    if (w.altMin) text(ctx, String(w.altMin), p.x + 12, p.y + 18, c, 12);
  });
  ctx.restore();
  // own ship
  poly(ctx, [[cx, cy - 22], [cx - 13, cy + 14], [cx + 13, cy + 14]], undefined, WHT, 3);
  // top-left: GS/TAS/wind
  text(ctx, 'GS', 16, 22, WHT, 15);
  text(ctx, String(Math.round(d.gsKt)), 44, 22, WHT, 22, 'left', 700);
  text(ctx, 'TAS', 100, 22, WHT, 15);
  text(ctx, String(Math.round(d.tasKt)), 134, 22, WHT, 22, 'left', 700);
  if (d.windKt > 1) {
    text(ctx, `${pad3(d.windDir)}°/${Math.round(d.windKt)}`, 16, 50, WHT, 18);
    ctx.save();
    ctx.translate(40, 86);
    ctx.rotate((d.windDir + 180 - up) * DEG);
    line(ctx, 0, -18, 0, 18, WHT, 2.5);
    poly(ctx, [[0, 20], [-6, 10], [6, 10]], WHT);
    ctx.restore();
  }
  // top-right: active waypoint
  const g = fp.out;
  if (g.valid) {
    text(ctx, g.toIdent, AL_W - 16, 22, MAG, 22, 'right', 700);
    const eta = g.eteMin !== null ? sim.time / 60 + g.eteMin : null;
    if (eta !== null) {
      const hh = Math.floor((eta / 60 + 14) % 24);
      const mm = Math.floor(eta % 60);
      text(ctx, `${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}.${Math.floor((eta * 60) % 60 / 6)}z`, AL_W - 16, 48, WHT, 18, 'right');
    }
    text(ctx, `${g.distNm.toFixed(1)} NM`, AL_W - 16, 72, WHT, 18, 'right');
  }
  // bottom: VOR info
  const vor = (label: string, n: typeof sim.nav1, x: number, align: CanvasTextAlign, color: string) => {
    text(ctx, n.valid ? n.ident : label, x, AL_H - 50, color, 18, align, 700);
    text(ctx, n.valid && n.dmeNm !== null ? `DME ${n.dmeNm.toFixed(1)}` : 'DME ---', x, AL_H - 26, color, 16, align);
  };
  vor('VOR L', sim.nav1, 16, 'left', GRN);
  vor('VOR R', sim.nav2, AL_W - 16, 'right', GRN);
  text(ctx, `${sim.fp.out.mode} · ${rangeNm} NM`, cx, AL_H - 26, CYN, 15, 'center');
  void bearingDeg;
}
