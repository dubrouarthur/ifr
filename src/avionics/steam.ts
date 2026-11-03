// Classic "steam gauge" cockpit: six-pack on the left screen, radio stack + nav heads on the right.
import type { Sim } from '../sim/sim';
import { AIRFRAME } from '../sim/aircraft';
import { G, bezel, glass, gtext, tick, arcBand, needle, hub, flag, lcd, led } from './gauges';
import { drawMap } from './mfd';
import { tunedNavaid } from '../nav/radios';

export const STEAM_W = 1024;
export const STEAM_H = 768;
const D = Math.PI / 180;

interface SteamState {
  frozenHdg: number;
  frozenPitch: number;
  frozenRoll: number;
  compass: number;
}
const st: SteamState = { frozenHdg: 0, frozenPitch: 0, frozenRoll: 0, compass: 0 };

function panelBg(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2b2e31');
  g.addColorStop(1, '#1d1f22');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // subtle texture
  ctx.fillStyle = 'rgba(255,255,255,0.015)';
  for (let i = 0; i < 60; i++) ctx.fillRect((i * 97) % w, (i * 53) % h, 2, 2);
}

// ------------------------------------------------------------------ six pack
export function drawSixPack(ctx: CanvasRenderingContext2D, sim: Sim, dt: number) {
  const d = sim.ac.data;
  const f = sim.failures;
  ctx.clearRect(0, 0, STEAM_W, STEAM_H);
  panelBg(ctx, STEAM_W, STEAM_H);
  // vacuum failure = AHRS failure in steam mode: AI tumbles, DG freezes
  if (!f.ahrs) {
    st.frozenHdg = d.hdgTrue;
    st.frozenPitch = d.pitchDeg;
    st.frozenRoll = d.rollDeg;
  } else {
    st.frozenRoll += dt * 4;
    st.frozenPitch += dt * 0.8;
  }
  const R = 146;
  const cols = [176, 512, 848];
  const rows = [236, 578];
  topStrip(ctx, sim, dt);
  asi(ctx, cols[0], rows[0], R, f.airData ? 0 : d.iasKt);
  ai(ctx, cols[1], rows[0], R, f.ahrs ? st.frozenPitch : d.pitchDeg, f.ahrs ? st.frozenRoll : d.rollDeg, f.ahrs);
  alt(ctx, cols[2], rows[0], R, f.airData ? sim.ac.s.altFt - 500 : sim.indicatedAlt(), sim.av.baro);
  tc(ctx, cols[0], rows[1], R, d.turnRateDps, d.slip);
  hsi(ctx, sim, cols[1], rows[1], R, f.ahrs ? st.frozenHdg : d.hdgTrue, f.ahrs);
  vsi(ctx, cols[2], rows[1], R, f.airData ? 0 : d.vsFpm);
  bottomStrip(ctx, sim);
}

function topStrip(ctx: CanvasRenderingContext2D, sim: Sim, dt: number) {
  const d = sim.ac.data;
  ctx.fillStyle = '#121314';
  ctx.fillRect(0, 0, STEAM_W, 56);
  // marker beacon lights
  const lights: [string, string, boolean][] = [['O', '#2a7fff', sim.marker === 'O'], ['M', '#ffb000', false], ['I', '#ffffff', false]];
  lights.forEach(([l, c, on], i) => {
    const x = 36 + i * 46;
    ctx.fillStyle = on && Math.floor(performance.now() / 250) % 2 === 0 ? c : '#2a2c2e';
    ctx.beginPath();
    ctx.arc(x, 28, 15, 0, Math.PI * 2);
    ctx.fill();
    gtext(ctx, l, x, 29, 14, on ? '#000' : '#777', 'center', 800);
  });
  // annunciators
  const ann: [string, boolean, string][] = [
    ['STALL', d.stallWarn, G.red],
    ['VAC', sim.failures.ahrs, G.yellow],
    ['PITOT', sim.failures.airData, G.yellow],
    ['AP', !sim.ap.ap && !!sim.ap.annunciation, G.yellow],
    ['FUEL', sim.ac.s.fuelGal < 8, G.yellow],
  ];
  ann.forEach(([t, on, c], i) => {
    const x = 680 + i * 68;
    ctx.fillStyle = on ? c : '#26282a';
    ctx.fillRect(x, 14, 60, 28);
    gtext(ctx, t, x + 30, 29, 14, on ? '#000' : '#6b6e70', 'center', 800);
  });
  // wet compass
  let diff = d.hdgTrue - st.compass;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  st.compass = (st.compass + diff * Math.min(1, dt * (1.2 + Math.abs(Math.cos(d.hdgTrue * D)) * 1.5)) + Math.sin(performance.now() / 700) * 0.05 + 360) % 360;
  const cx = 460;
  ctx.save();
  ctx.fillStyle = '#e8e2cf';
  ctx.beginPath();
  ctx.roundRect(cx - 110, 6, 220, 44, 10);
  ctx.fill();
  ctx.clip();
  for (let h = -60; h <= 60; h += 5) {
    const hd = Math.round((st.compass + h) / 5) * 5;
    const x = cx + (hd - st.compass) * 3.2;
    const n = ((hd % 360) + 360) % 360;
    ctx.fillStyle = '#111';
    ctx.fillRect(x - 1, 8, 2, n % 10 === 0 ? 12 : 7);
    if (n % 30 === 0) gtext(ctx, n === 0 ? 'N' : n === 90 ? 'E' : n === 180 ? 'S' : n === 270 ? 'W' : String(n / 10), x, 34, 16, '#111', 'center', 800);
  }
  ctx.restore();
  ctx.fillStyle = G.red;
  ctx.fillRect(cx - 1.5, 4, 3, 46);
}

function bottomStrip(ctx: CanvasRenderingContext2D, sim: Sim) {
  const d = sim.ac.data;
  ctx.fillStyle = '#121314';
  ctx.fillRect(0, STEAM_H - 34, STEAM_W, 34);
  const y = STEAM_H - 17;
  gtext(ctx, `OAT ${Math.round(d.oatC)}°C`, 20, y, 16, G.dim, 'left');
  gtext(ctx, `FLAPS ${Math.round(d.flapsDeg)}°`, 170, y, 16, G.dim, 'left');
  const tmr = sim.chrono() ?? sim.time;
  gtext(ctx, `${sim.chrono() !== null ? 'TIMER' : 'ET'} ${String(Math.floor(tmr / 60)).padStart(2, '0')}:${String(Math.floor(tmr % 60)).padStart(2, '0')}`, STEAM_W - 20, y, 17, sim.av.timerStart !== null ? G.yellow : G.dim, 'right');
  if (sim.av.minimums !== null) gtext(ctx, `MINS ${sim.av.minimums}`, 660, y, 16, sim.indicatedAlt() < sim.av.minimums ? G.yellow : G.dim, 'left');
}

function asi(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, kt: number) {
  bezel(ctx, cx, cy, r);
  const ang = (k: number) => {
    const deg = k < 40 ? (Math.max(0, k) / 40) * 30 : 30 + ((Math.min(210, k) - 40) / 160) * 300;
    return (-90 + deg) * D;
  };
  arcBand(ctx, cx, cy, r - 14, ang(AIRFRAME.vso), ang(AIRFRAME.vfe), 7, G.white);
  arcBand(ctx, cx, cy, r - 6, ang(AIRFRAME.vs1), ang(AIRFRAME.vno), 9, G.green);
  arcBand(ctx, cx, cy, r - 6, ang(AIRFRAME.vno), ang(AIRFRAME.vne), 9, G.yellow);
  tick(ctx, cx, cy, ang(AIRFRAME.vne), r - 24, r - 1, 5, G.red);
  for (let k = 40; k <= 200; k += 5) {
    const major = k % 20 === 0;
    tick(ctx, cx, cy, ang(k), r - (major ? 30 : k % 10 === 0 ? 24 : 18), r - 10, major ? 3 : 2);
    if (major) {
      const a = ang(k);
      gtext(ctx, String(k), cx + Math.cos(a) * (r - 50), cy + Math.sin(a) * (r - 50), 22, G.ink, 'center', 700);
    }
  }
  gtext(ctx, 'AIRSPEED', cx, cy - 40, 14, G.dim);
  gtext(ctx, 'KNOTS', cx, cy + 44, 14, G.dim);
  needle(ctx, cx, cy, ang(kt), r - 22, 11);
  hub(ctx, cx, cy);
  glass(ctx, cx, cy, r);
}

function ai(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, pitch: number, roll: number, failed: boolean) {
  bezel(ctx, cx, cy, r);
  const ppd = r / 32;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-roll * D);
  // rotating card with bank pointer
  ctx.save();
  ctx.translate(0, Math.max(-25, Math.min(25, pitch)) * ppd);
  const sky = ctx.createLinearGradient(0, -r * 2, 0, 0);
  sky.addColorStop(0, '#174f9a');
  sky.addColorStop(1, G.sky);
  ctx.fillStyle = sky;
  ctx.fillRect(-r * 2, -r * 3, r * 4, r * 3);
  ctx.fillStyle = G.ground;
  ctx.fillRect(-r * 2, 0, r * 4, r * 3);
  ctx.fillStyle = G.white;
  ctx.fillRect(-r * 2, -1.5, r * 4, 3);
  for (const p of [-20, -15, -10, -5, 5, 10, 15, 20]) {
    const w = p % 10 === 0 ? 46 : 24;
    ctx.fillRect(-w / 2, -p * ppd - 1, w, 2.5);
    if (p % 10 === 0) {
      gtext(ctx, String(Math.abs(p)), -w / 2 - 14, -p * ppd, 13, G.white);
      gtext(ctx, String(Math.abs(p)), w / 2 + 14, -p * ppd, 13, G.white);
    }
  }
  ctx.restore();
  // bank pointer on the rotating dial
  ctx.fillStyle = G.white;
  ctx.beginPath();
  ctx.moveTo(0, -r + 26);
  ctx.lineTo(-9, -r + 42);
  ctx.lineTo(9, -r + 42);
  ctx.fill();
  ctx.restore();
  // fixed bank scale on the case
  for (const a of [-60, -30, -20, -10, 10, 20, 30, 60]) tick(ctx, cx, cy, (a - 90) * D, r - 22, r - 4, Math.abs(a) % 30 === 0 ? 4 : 2.5);
  for (const a of [-45, 45]) tick(ctx, cx, cy, (a - 90) * D, r - 14, r - 4, 3);
  ctx.fillStyle = G.orange;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 4);
  ctx.lineTo(cx - 9, cy - r + 20);
  ctx.lineTo(cx + 9, cy - r + 20);
  ctx.fill();
  // miniature aircraft
  ctx.fillStyle = G.orange;
  ctx.fillRect(cx - 70, cy - 3, 46, 6);
  ctx.fillRect(cx + 24, cy - 3, 46, 6);
  ctx.beginPath();
  ctx.moveTo(cx - 24, cy);
  ctx.lineTo(cx, cy + 16);
  ctx.lineTo(cx + 24, cy);
  ctx.lineWidth = 5;
  ctx.strokeStyle = G.orange;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();
  if (failed) flag(ctx, cx + 52, cy + 62, 'OFF');
  glass(ctx, cx, cy, r);
}

function alt(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, altFt: number, baro: number) {
  bezel(ctx, cx, cy, r);
  for (let i = 0; i < 50; i++) {
    const a = (i * 7.2 - 90) * D;
    tick(ctx, cx, cy, a, r - (i % 5 === 0 ? 26 : 16), r - 6, i % 5 === 0 ? 3 : 2);
    if (i % 5 === 0) gtext(ctx, String(i / 5), cx + Math.cos(a) * (r - 46), cy + Math.sin(a) * (r - 46), 26, G.ink, 'center', 700);
  }
  // Kollsman window
  // Kollsman window at about 4 o'clock, inside the numeral ring (clear of the 3 and the 4)
  const kx = cx + Math.cos(36 * D) * r * 0.4;
  const ky = cy + Math.sin(36 * D) * r * 0.4;
  ctx.fillStyle = '#000';
  ctx.fillRect(kx - 32, ky - 13, 64, 26);
  ctx.strokeStyle = '#3a3d40';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(kx - 32, ky - 13, 64, 26);
  gtext(ctx, baro.toFixed(2), kx, ky + 1, 17, G.white, 'center', 700);
  gtext(ctx, 'ALT', cx, cy + 28, 14, G.dim);
  gtext(ctx, '100 FEET', cx, cy - 44, 14, G.dim);
  const a = Math.max(-1000, altFt);
  if (a < 10000) {
    // low-altitude crosshatch flag
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 30, cy - 30, 22, 14);
    ctx.clip();
    for (let i = -4; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#fff' : '#000';
      ctx.beginPath();
      ctx.moveTo(cx - 30 + i * 6, cy - 16);
      ctx.lineTo(cx - 24 + i * 6, cy - 30);
      ctx.lineTo(cx - 18 + i * 6, cy - 30);
      ctx.lineTo(cx - 24 + i * 6, cy - 16);
      ctx.fill();
    }
    ctx.restore();
  }
  needle(ctx, cx, cy, ((a / 100000) * 360 - 90) * D, r - 12, 3, 0.05);
  needle(ctx, cx, cy, (((a % 10000) / 10000) * 360 - 90) * D, r * 0.55, 13, 0.15);
  needle(ctx, cx, cy, (((a % 1000) / 1000) * 360 - 90) * D, r - 22, 9, 0.2);
  hub(ctx, cx, cy);
  glass(ctx, cx, cy, r);
}

function tc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, turnRate: number, slip: number) {
  bezel(ctx, cx, cy, r);
  for (const s of [-1, 1]) {
    tick(ctx, cx, cy, (s > 0 ? 20 : 160) * D, r - 30, r - 6, 5);
    tick(ctx, cx, cy, (s > 0 ? 0 : 180) * D, r - 30, r - 6, 5);
    gtext(ctx, s > 0 ? 'R' : 'L', cx + s * (r - 44), cy + 40, 22, G.ink, 'center', 800);
  }
  gtext(ctx, 'TURN COORDINATOR', cx, cy - 62, 14, G.dim);
  gtext(ctx, '2 MIN', cx, cy + 96, 14, G.dim);
  // inclinometer
  ctx.save();
  ctx.strokeStyle = '#bbb';
  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy - 120, 180, (90 - 16) * D, (90 + 16) * D);
  ctx.stroke();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.arc(cx, cy - 120, 180, (90 - 15.5) * D, (90 + 15.5) * D);
  ctx.stroke();
  ctx.restore();
  for (const s of [-1, 1]) tick(ctx, cx, cy - 120, (90 + s * 3) * D, 168, 192, 2, '#ddd');
  const ballA = (90 - Math.max(-1, Math.min(1, slip)) * 13) * D;
  ctx.fillStyle = '#eee';
  ctx.beginPath();
  ctx.arc(cx + Math.cos(ballA) * 180, cy - 120 + Math.sin(ballA) * 180, 10, 0, Math.PI * 2);
  ctx.fill();
  // airplane symbol
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.max(-35, Math.min(35, (turnRate / 3) * 20)) * D);
  ctx.fillStyle = G.white;
  ctx.fillRect(-r + 34, -4, 2 * r - 68, 8);
  ctx.fillRect(-4, -30, 8, 30);
  ctx.fillRect(-22, -30, 44, 6);
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  glass(ctx, cx, cy, r);
}

function hsi(ctx: CanvasRenderingContext2D, sim: Sim, cx: number, cy: number, r: number, hdg: number, failed: boolean) {
  bezel(ctx, cx, cy, r);
  const n = sim.navInputs();
  const isGps = n.cdi === 'GPS';
  const crs = sim.course();
  const valid = isGps ? n.gps.valid : n.nav.valid;
  const dev = isGps ? n.gps.dev : n.nav.dev;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-hdg * D);
  for (let a = 0; a < 360; a += 5) {
    const major = a % 10 === 0;
    tick(ctx, 0, 0, (a - 90) * D, r - (major ? 22 : 14), r - 4, major ? 3 : 2);
    if (a % 30 === 0) {
      ctx.save();
      ctx.rotate(a * D);
      gtext(ctx, a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a / 10), 0, -r + 38, 20, G.ink, 'center', 700);
      ctx.restore();
    }
  }
  // heading bug
  ctx.save();
  ctx.rotate(sim.ap.hdgBug * D);
  ctx.fillStyle = G.orange;
  ctx.fillRect(-11, -r + 2, 22, 10);
  ctx.restore();
  // course arrow & CDI
  ctx.rotate(crs * D);
  const col = isGps ? '#ff4df0' : G.yellow;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, -r + 26);
  ctx.lineTo(-11, -r + 46);
  ctx.lineTo(11, -r + 46);
  ctx.fill();
  ctx.fillRect(-3, -r + 46, 6, r - 100);
  ctx.fillRect(-3, 54, 6, r - 72);
  for (const dot of [-2, -1, 1, 2]) {
    ctx.strokeStyle = G.white;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(dot * 26, 0, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (valid) {
    const dx = Math.max(-1.2, Math.min(1.2, dev)) * 52;
    ctx.fillRect(dx - 3, -52, 6, 104);
    const tf = isGps ? n.gps.toFrom : n.nav.toFrom;
    if (tf !== 'OFF') {
      ctx.beginPath();
      const ty = tf === 'TO' ? -1 : 1;
      ctx.moveTo(30, ty * 40);
      ctx.lineTo(20, ty * 26);
      ctx.lineTo(40, ty * 26);
      ctx.fill();
    }
  }
  ctx.restore();
  // GS pointers
  if (!isGps && n.nav.gsValid) {
    const y = cy - Math.max(-1.2, Math.min(1.2, n.nav.gsDev)) * 60;
    for (const s of [-1, 1]) {
      ctx.fillStyle = G.yellow;
      ctx.beginPath();
      ctx.moveTo(cx + s * (r - 12), y);
      ctx.lineTo(cx + s * (r - 28), y - 9);
      ctx.lineTo(cx + s * (r - 28), y + 9);
      ctx.fill();
    }
  }
  // fixed lubber & aircraft
  ctx.fillStyle = G.orange;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 2);
  ctx.lineTo(cx - 8, cy - r - 10);
  ctx.lineTo(cx + 8, cy - r - 10);
  ctx.fill();
  ctx.fillStyle = G.orange;
  ctx.fillRect(cx - 2, cy - 18, 4, 32);
  ctx.fillRect(cx - 18, cy - 4, 36, 4);
  ctx.fillRect(cx - 8, cy + 12, 16, 3);
  if (!valid) flag(ctx, cx - 50, cy - 40, 'NAV');
  if (!isGps && n.nav.isLoc && !n.nav.gsValid) flag(ctx, cx + r - 60, cy - 50, 'GS', G.red, 0.78);
  if (failed) flag(ctx, cx + 50, cy - 40, 'HDG');
  // source label on the fixed face, under the aircraft symbol (never on the rotating card)
  gtext(ctx, isGps ? 'GPS' : n.cdi === 'NAV1' ? 'NAV 1' : 'NAV 2', cx, cy + 44, 14, isGps ? '#ff4df0' : G.dim, 'center', 700);
  glass(ctx, cx, cy, r);
}

function vsi(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fpm: number) {
  bezel(ctx, cx, cy, r);
  const ang = (v: number) => (180 + (Math.max(-2000, Math.min(2000, v)) / 2000) * 170) * D;
  for (let v = -2000; v <= 2000; v += 100) {
    const major = v % 500 === 0;
    tick(ctx, cx, cy, ang(v), r - (major ? 26 : 14), r - 6, major ? 3 : 2);
    if (v % 500 === 0 && v !== 2000 && v !== -2000) {
      const a = ang(v);
      gtext(ctx, String(Math.abs(v) / 100), cx + Math.cos(a) * (r - 46), cy + Math.sin(a) * (r - 46), 20, G.ink, 'center', 700);
    }
  }
  gtext(ctx, '20', cx + Math.cos(ang(2000)) * (r - 46), cy + Math.sin(ang(2000)) * (r - 46) + 6, 18, G.ink);
  gtext(ctx, 'UP', cx - 50, cy - 40, 14, G.dim);
  gtext(ctx, 'DOWN', cx - 50, cy + 40, 14, G.dim);
  gtext(ctx, 'VERT SPEED', cx + 26, cy - 30, 14, G.dim);
  gtext(ctx, '100 FT/MIN', cx + 26, cy + 30, 14, G.dim);
  needle(ctx, cx, cy, ang(fpm), r - 20, 10);
  hub(ctx, cx, cy);
  glass(ctx, cx, cy, r);
}

// ------------------------------------------------------------------ radio stack & nav heads
const LED_COM = '#ffb347';
const LED_NAV = '#6cff8a';
const LED_DIM = '#b8823c';

export function drawStack(ctx: CanvasRenderingContext2D, sim: Sim) {
  ctx.clearRect(0, 0, STEAM_W, STEAM_H);
  panelBg(ctx, STEAM_W, STEAM_H);
  const d = sim.ac.data;
  cdiHead(ctx, sim, 196, 210, 150);
  rmi(ctx, sim, 196, 560, 150, d.hdgTrue);
  const x = 400;
  const w = 610;
  // audio panel: flat annunciators (lit label = selected), not buttons
  unit(ctx, x, 8, w, 40, '');
  const audio: [string, boolean][] = [['COM1', true], ['COM2', false], ['NAV1', true], ['NAV2', false], ['ADF', sim.av.bearing1 === 'ADF' || sim.av.bearing2 === 'ADF'], ['MKR', true]];
  audio.forEach(([l, on], i) => {
    const kx = x + 12 + i * 98;
    ctx.fillStyle = '#121416';
    ctx.fillRect(kx, 14, 90, 28);
    if (on) {
      ctx.fillStyle = '#7dff9a';
      ctx.fillRect(kx + 30, 37, 30, 2);
    }
    gtext(ctx, l, kx + 45, 27, 14, on ? '#bff7c9' : '#5d6266', 'center', 700);
  });
  // GNS 430-like
  unit(ctx, x, 54, w, 236, 'GPS');
  lcd(ctx, x + 60, 62, 300, 220);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 62, 64, 296, 216);
  ctx.clip();
  drawMap(ctx, sim, { x: x + 62, y: 64, w: 296, h: 216 }, 10, true);
  ctx.restore();
  lcd(ctx, x + 368, 62, 232, 220);
  const g = sim.fp.out;
  const row = (k: string, v: string, y: number, c = '#ff4df0') => {
    gtext(ctx, k, x + 380, y, 14, '#9fb', 'left', 700);
    gtext(ctx, v, x + 590, y, 19, c, 'right', 700);
  };
  gtext(ctx, g.valid ? `${g.holding ? 'HOLD ' : ''}${g.fromIdent ? g.fromIdent + ' → ' : ''}${g.toIdent}` : 'NO ACTV WPT', x + 380, 82, 16, '#ff4df0', 'left', 700);
  row('DIS', g.valid ? `${g.distNm.toFixed(1)}nm` : '—', 114);
  row('DTK', g.valid ? `${String(Math.round(g.dtk)).padStart(3, '0')}°` : '—', 142);
  row('TRK', `${String(Math.round(d.trackSmooth)).padStart(3, '0')}°`, 170, '#fff');
  row('GS', `${Math.round(d.gsSmooth)}kt`, 198, '#fff');
  row('ETE', g.eteMin !== null ? `${Math.floor(g.eteMin)}:${String(Math.round((g.eteMin % 1) * 60)).padStart(2, '0')}` : '—', 226, '#fff');
  gtext(ctx, `${g.mode}${g.suspended ? '  SUSP' : ''}${g.gpValid ? '  LPV' : ''}`, x + 380, 262, 15, g.suspended ? G.yellow : '#9f9', 'left', 700);
  // NAV/COM x2 (both NAV actives in the same LED colour; the CDI source is tagged)
  navcom(ctx, x, 298, w, sim.av.com1, sim.av.nav1, sim.av.cdi === 'NAV1');
  navcom(ctx, x, 372, w, sim.av.com2, sim.av.nav2, sim.av.cdi === 'NAV2');
  // ADF
  unit(ctx, x, 446, w, 52, 'ADF');
  lcd(ctx, x + 60, 452, 260, 40);
  led(ctx, `ADF ${sim.av.adf.active}`, x + 76, 473, 24, LED_COM);
  led(ctx, sim.adf.valid ? sim.adf.ident : '----', x + 300, 473, 20, LED_COM, 'right');
  const tmr = sim.chrono() ?? sim.time;
  lcd(ctx, x + 340, 452, 260, 40);
  led(ctx, `${sim.chrono() !== null ? 'CHR' : 'FLT'} ${String(Math.floor(tmr / 60)).padStart(2, '0')}:${String(Math.floor(tmr % 60)).padStart(2, '0')}`, x + 356, 473, 24, LED_COM);
  // DME (NAV1)
  unit(ctx, x, 504, w, 52, 'DME');
  lcd(ctx, x + 60, 510, 540, 40);
  const dme = sim.nav1.dmeNm;
  led(ctx, dme !== null ? `${dme.toFixed(1)} NM` : '--.- NM', x + 80, 531, 24, '#ff5a3c');
  led(ctx, dme !== null ? `${Math.round(d.gsKt)} KT` : '--- KT', x + 300, 531, 24, '#ff5a3c');
  led(ctx, dme !== null && d.gsKt > 30 ? `${Math.round((dme / d.gsKt) * 60)} MIN` : '-- MIN', x + 590, 531, 24, '#ff5a3c', 'right');
  // autopilot KAP 140
  unit(ctx, x, 562, w, 52, 'AP');
  lcd(ctx, x + 60, 567, 540, 42);
  const ap = sim.ap;
  const latLbl: Record<string, string> = { ROL: 'ROL', HDG: 'HDG', GPS: 'NAV', VOR: 'NAV', LOC: 'APR', BC: 'REV' };
  const AP_ON = '#ffd34d';
  const AP_ARM = '#cfa840';
  if (ap.engaged) {
    led(ctx, ap.ap ? 'AP' : 'FD', x + 76, 588, 22, AP_ON);
    led(ctx, latLbl[ap.lat] ?? ap.lat, x + 136, 588, 22, AP_ON);
    if (ap.latArmed) led(ctx, `ARM ${latLbl[ap.latArmed] ?? ''}`, x + 196, 588, 16, AP_ARM);
    const vm = ap.vert === 'GS' || ap.vert === 'GP' ? 'GS' : ap.vert === 'FLC' ? 'VS' : ap.vert === 'PIT' ? 'VS' : ap.vert;
    led(ctx, vm, x + 300, 588, 22, AP_ON);
    if (ap.vertArmed.gs || ap.vertArmed.gp) led(ctx, 'ARM GS', x + 348, 588, 16, AP_ARM);
    else if (ap.vertArmed.alts) led(ctx, 'ARM ALT', x + 348, 588, 16, AP_ARM);
  } else if (ap.inhibited) led(ctx, ap.inhibited, x + 76, 588, 18, AP_ARM);
  else gtext(ctx, 'AP OFF', x + 76, 588, 18, '#5a4a20', 'left', 700);
  led(ctx, ap.vert === 'VS' && ap.engaged ? `${ap.vsSel >= 0 ? '+' : ''}${ap.vsSel} FPM` : `${ap.altSel} FT`, x + 590, 588, 24, AP_ON, 'right');
  // transponder (squawk, pressure altitude reported in ALT, mode, reply light)
  unit(ctx, x, 620, w, 50, 'XPDR');
  lcd(ctx, x + 60, 626, 420, 38);
  led(ctx, sim.av.xpdr, x + 80, 646, 28, LED_COM);
  if (sim.av.xpdrMode === 'ALT') led(ctx, `FL${String(Math.max(0, Math.round(d.pressAltFt / 100))).padStart(3, '0')}`, x + 220, 646, 22, LED_COM);
  led(ctx, sim.av.xpdrMode, x + 466, 646, 20, LED_COM, 'right');
  ctx.fillStyle = Math.floor(performance.now() / 900) % 3 === 0 && sim.av.xpdrMode !== 'STBY' ? LED_COM : '#3a2c1a';
  ctx.beginPath();
  ctx.arc(x + 508, 645, 7, 0, Math.PI * 2);
  ctx.fill();
  gtext(ctx, 'REPLY', x + 524, 646, 14, '#8a9096', 'left', 700);
  // engine: tach, fuel flow, fuel quantity (the oil gauges are not simulated, so they are not shown)
  unit(ctx, x, 676, w, 84, 'ENG');
  const bar = (lbl: string, v: number, txt: string, bx: number, g0: number, g1: number) => {
    const bw = 160;
    gtext(ctx, lbl, bx, 694, 14, G.dim, 'left', 700);
    gtext(ctx, txt, bx + bw, 694, 18, G.ink, 'right', 700);
    ctx.fillStyle = '#0d0e0f';
    ctx.fillRect(bx, 714, bw, 12);
    ctx.fillStyle = '#1fa64a';
    ctx.fillRect(bx + g0 * bw, 714, (g1 - g0) * bw, 12);
    ctx.fillStyle = '#fff';
    ctx.fillRect(bx + Math.max(0, Math.min(1, v)) * (bw - 3), 708, 3, 24);
  };
  bar('TACH', d.rpm / 2800, `${Math.round(d.rpm / 10) * 10} RPM`, x + 66, 2100 / 2800, 2700 / 2800);
  bar('FUEL FLOW', d.fuelFlowGph / 14, `${d.fuelFlowGph.toFixed(1)} GPH`, x + 252, 0.1, 0.9);
  bar('FUEL', sim.ac.s.fuelGal / 53, `${Math.round(sim.ac.s.fuelGal)} GAL`, x + 438, 8 / 53, 1);
}

function unit(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string) {
  ctx.fillStyle = '#26292c';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,.04)';
  ctx.fillRect(x, y, w, 2);
  ctx.strokeStyle = '#0c0d0e';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  if (label) gtext(ctx, label, x + 30, y + h / 2, 14, '#8a9096', 'center', 800);
}

function navcom(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, com: { active: number; standby: number }, nav: { active: number; standby: number }, cdi: boolean) {
  unit(ctx, x, y, w, 68, '');
  lcd(ctx, x + 12, y + 8, 290, 52);
  gtext(ctx, 'COM', x + 24, y + 28, 14, LED_DIM, 'left', 700);
  led(ctx, com.active.toFixed(3), x + 290, y + 28, 22, LED_COM, 'right');
  led(ctx, com.standby.toFixed(3), x + 290, y + 50, 16, LED_DIM, 'right');
  lcd(ctx, x + 310, y + 8, 290, 52);
  gtext(ctx, 'NAV', x + 322, y + 28, 14, LED_DIM, 'left', 700);
  led(ctx, nav.active.toFixed(2), x + 470, y + 28, 22, LED_NAV, 'right');
  led(ctx, nav.standby.toFixed(2), x + 470, y + 50, 16, LED_DIM, 'right');
  const id = tunedNavaid(nav.active);
  gtext(ctx, id ? id.ident : '', x + 588, y + 28, 15, LED_NAV, 'right', 700);
  if (cdi) {
    ctx.strokeStyle = LED_NAV;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 548, y + 41, 40, 17);
    gtext(ctx, 'CDI', x + 568, y + 50, 14, LED_NAV, 'center', 700);
  }
}

/** second nav head: always NAV 2 (the HSI follows the CDI source) */
function cdiHead(ctx: CanvasRenderingContext2D, sim: Sim, cx: number, cy: number, r: number) {
  bezel(ctx, cx, cy, r);
  const nav = sim.nav2;
  const obs = sim.av.obs2;
  // rotating OBS card
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-obs * D);
  for (let a = 0; a < 360; a += 5) {
    const major = a % 30 === 0;
    tick(ctx, 0, 0, (a - 90) * D, r - (major ? 18 : a % 10 === 0 ? 12 : 8), r - 4, major ? 3 : 1.5);
    if (major) {
      ctx.save();
      ctx.rotate(a * D);
      gtext(ctx, a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a / 10), 0, -r + 32, 17, G.ink, 'center', 700);
      ctx.restore();
    }
  }
  ctx.restore();
  ctx.fillStyle = G.white;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 44);
  ctx.lineTo(cx - 8, cy - r + 58);
  ctx.lineTo(cx + 8, cy - r + 58);
  ctx.fill();
  // dots
  for (let i = -5; i <= 5; i++) {
    if (!i) continue;
    ctx.strokeStyle = G.white;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx + i * 17, cy, 3.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + i * 15, 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = G.white;
  ctx.beginPath();
  ctx.arc(cx, cy, 12, 0, Math.PI * 2);
  ctx.stroke();
  const valid = nav.valid;
  const dev = nav.dev;
  if (valid) {
    const dx = Math.max(-1.1, Math.min(1.1, dev)) * 85;
    ctx.fillStyle = G.white;
    ctx.fillRect(cx + dx - 3, cy - 88, 6, 176);
    const tf = nav.toFrom;
    if (tf !== 'OFF') {
      ctx.fillStyle = G.white;
      ctx.beginPath();
      const ty = tf === 'TO' ? -1 : 1;
      ctx.moveTo(cx + 54, cy + ty * 44);
      ctx.lineTo(cx + 42, cy + ty * 28);
      ctx.lineTo(cx + 66, cy + ty * 28);
      ctx.fill();
      gtext(ctx, tf, cx + 54, cy + ty * 60, 14, G.dim, 'center', 700);
    }
  } else flag(ctx, cx - 50, cy - 40, 'NAV');
  if (nav.isLoc) {
    if (nav.gsValid) {
      ctx.fillStyle = G.white;
      ctx.fillRect(cx - 88, cy - Math.max(-1.1, Math.min(1.1, nav.gsDev)) * 75 - 3, 176, 6);
    } else flag(ctx, cx - 50, cy + 40, 'GS');
  }
  // caption below the bezel (never on the rotating OBS card)
  gtext(ctx, `NAV 2 · OBS ${String(Math.round(obs) || 360).padStart(3, '0')}`, cx, cy + r + 24, 15, G.dim, 'center', 700);
  glass(ctx, cx, cy, r);
}

function rmi(ctx: CanvasRenderingContext2D, sim: Sim, cx: number, cy: number, r: number, hdg: number) {
  bezel(ctx, cx, cy, r);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-hdg * D);
  for (let a = 0; a < 360; a += 5) {
    const major = a % 30 === 0;
    tick(ctx, 0, 0, (a - 90) * D, r - (major ? 18 : a % 10 === 0 ? 12 : 8), r - 4, major ? 3 : 1.5);
    if (major) {
      ctx.save();
      ctx.rotate(a * D);
      gtext(ctx, a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a / 10), 0, -r + 32, 17, G.ink, 'center', 700);
      ctx.restore();
    }
  }
  const ptr = (brg: number, color: string, double: boolean) => {
    ctx.save();
    ctx.rotate(brg * D);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    if (double) {
      for (const o of [-5, 5]) {
        ctx.beginPath();
        ctx.moveTo(o, -r + 50);
        ctx.lineTo(o, r - 30);
        ctx.stroke();
      }
    } else ctx.fillRect(-3, -r + 50, 6, 2 * r - 80);
    ctx.beginPath();
    ctx.moveTo(0, -r + 26);
    ctx.lineTo(-13, -r + 52);
    ctx.lineTo(13, -r + 52);
    ctx.fill();
    ctx.restore();
  };
  if (sim.nav2.valid) ptr(sim.nav2.bearingTo, '#53d85a', true);
  if (sim.adf.valid) ptr(sim.adf.bearingTo, G.yellow, false);
  ctx.restore();
  ctx.fillStyle = G.orange;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 2);
  ctx.lineTo(cx - 8, cy - r - 10);
  ctx.lineTo(cx + 8, cy - r - 10);
  ctx.fill();
  hub(ctx, cx, cy, 12);
  if (!sim.adf.valid) flag(ctx, cx - 50, cy + 40, 'ADF');
  // caption below the bezel: needle legend in the needle colours
  gtext(ctx, `ADF ${sim.av.adf.active}`, cx - 12, cy + r + 24, 15, G.yellow, 'right', 800);
  gtext(ctx, '·', cx, cy + r + 24, 15, G.dim, 'center', 800);
  gtext(ctx, `VOR 2 ${sim.av.nav2.active.toFixed(2)}`, cx + 12, cy + r + 24, 15, '#53d85a', 'left', 800);
  glass(ctx, cx, cy, r);
}


