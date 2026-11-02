// G1000-style Multi-Function Display: engine strip, moving map, flight plan.
import type { Sim } from '../sim/sim';
import { C, box, line, poly, text, pad3 } from './draw';
import { drawTopBar, drawSoftkeys } from './pfd';
import { AIRPORTS, FIXES, NAVAIDS, groundElevation } from '../nav/data';
import { destination, distanceNm, toLocal, DEG, bearingDeg, type LatLon } from '../nav/geo';

export const MFD_W = 1024;
export const MFD_H = 768;
export const MFD_SOFTKEYS = ['ENGINE', '', 'MAP', '', 'TERRAIN', 'NORTH UP', 'DCLTR', '', '', 'FPL', 'PROC', 'CHKLIST'];
const RANGES = [1, 2, 5, 10, 15, 20, 30, 50, 80];

export interface MfdState {
  rangeIdx: number;
  terrain: boolean;
  northUp: boolean;
  declutter: number;
  showFpl: boolean;
  terrainCache: { key: string; img: ImageData | null; canvas: HTMLCanvasElement | null };
  softkeyFlash: number | null;
}

export const newMfdState = (): MfdState => ({
  rangeIdx: 4,
  terrain: true,
  northUp: true,
  declutter: 0,
  showFpl: true,
  terrainCache: { key: '', img: null, canvas: null },
  softkeyFlash: null,
});

export function mfdRange(st: MfdState) {
  return RANGES[st.rangeIdx];
}

export function drawMfd(ctx: CanvasRenderingContext2D, sim: Sim, st: MfdState) {
  ctx.clearRect(0, 0, MFD_W, MFD_H);
  box(ctx, 0, 0, MFD_W, MFD_H, '#000');
  drawTopBar(ctx, sim);
  drawEis(ctx, sim);
  const mapRect = { x: 156, y: 54, w: st.showFpl ? 560 : 868, h: MFD_H - 54 - 26 };
  ctx.save();
  ctx.beginPath();
  ctx.rect(mapRect.x, mapRect.y, mapRect.w, mapRect.h);
  ctx.clip();
  drawMap(ctx, sim, mapRect, mfdRange(st), false, st);
  ctx.restore();
  text(ctx, 'MAP - NAVIGATION MAP', mapRect.x + mapRect.w / 2, 66, C.white, 14, 'center');
  if (st.showFpl) drawFpl(ctx, sim, { x: 718, y: 54, w: 306, h: MFD_H - 54 - 26 });
  drawSoftkeys(ctx, MFD_SOFTKEYS, st.softkeyFlash, { TERRAIN: st.terrain, 'NORTH UP': st.northUp, DCLTR: st.declutter > 0, FPL: st.showFpl });
}

// ------------------------------------------------------------------ engine indication
function gaugeArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, v: number, min: number, max: number, green: [number, number], red: number, label: string, valueText: string) {
  const a0 = 200 * DEG;
  const a1 = 340 * DEG;
  const ang = (x: number) => a0 + ((Math.max(min, Math.min(max, x)) - min) / (max - min)) * (a1 - a0);
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#333';
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a1);
  ctx.stroke();
  ctx.strokeStyle = C.green;
  ctx.beginPath();
  ctx.arc(cx, cy, r, ang(green[0]), ang(green[1]));
  ctx.stroke();
  ctx.strokeStyle = C.red;
  ctx.beginPath();
  ctx.arc(cx, cy, r, ang(red), a1);
  ctx.stroke();
  const a = ang(v);
  poly(ctx, [[cx + Math.cos(a) * (r + 6), cy + Math.sin(a) * (r + 6)], [cx + Math.cos(a - 0.12) * (r - 12), cy + Math.sin(a - 0.12) * (r - 12)], [cx + Math.cos(a + 0.12) * (r - 12), cy + Math.sin(a + 0.12) * (r - 12)]], C.white);
  text(ctx, label, cx, cy - 4, C.white, 14, 'center');
  text(ctx, valueText, cx, cy + 16, C.white, 20, 'center', 700);
}

function hbar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, label: string, frac: number, valueText: string, greenFrom = 0.15, greenTo = 0.85) {
  text(ctx, label, x, y, C.white, 13);
  text(ctx, valueText, x + w, y, C.white, 14, 'right');
  const by = y + 12;
  box(ctx, x, by, w, 6, '#333');
  box(ctx, x + w * greenFrom, by, w * (greenTo - greenFrom), 6, '#0a6');
  const px = x + Math.max(0, Math.min(1, frac)) * w;
  poly(ctx, [[px, by - 2], [px - 5, by - 9], [px + 5, by - 9]], C.white);
}

function drawEis(ctx: CanvasRenderingContext2D, sim: Sim) {
  const d = sim.ac.data;
  box(ctx, 0, 54, 152, MFD_H - 80, '#050505');
  line(ctx, 152, 54, 152, MFD_H - 26, C.gray, 1);
  gaugeArc(ctx, 76, 130, 52, d.rpm, 0, 2800, [2100, 2700], 2700, 'RPM', String(Math.round(d.rpm / 10) * 10));
  const thr = sim.controls.throttle;
  let y = 210;
  hbar(ctx, 10, y, 132, 'FFLOW GPH', d.fuelFlowGph / 20, d.fuelFlowGph.toFixed(1));
  y += 40;
  hbar(ctx, 10, y, 132, 'OIL PRES', 0.45 + thr * 0.2, String(Math.round(60 + thr * 20)));
  y += 40;
  hbar(ctx, 10, y, 132, 'OIL TEMP', 0.5 + thr * 0.15, String(Math.round(180 + thr * 30)));
  y += 40;
  hbar(ctx, 10, y, 132, 'EGT °F', 0.4 + thr * 0.4, String(Math.round(1200 + thr * 250)));
  y += 40;
  hbar(ctx, 10, y, 132, 'VAC', 0.55, '5.0');
  y += 48;
  text(ctx, 'FUEL QTY GAL', 76, y, C.white, 13, 'center');
  const q = sim.ac.s.fuelGal / 2;
  for (const [i, lbl] of [[0, 'L'], [1, 'R']] as const) {
    const bx = 34 + i * 60;
    box(ctx, bx, y + 14, 24, 110, '#222', C.gray);
    const h = (q / 26.5) * 108;
    box(ctx, bx + 2, y + 124 - h, 20, h, q < 5 ? C.amber : C.green);
    text(ctx, lbl, bx + 12, y + 136, C.white, 13, 'center');
  }
  text(ctx, `${q.toFixed(0)} / ${q.toFixed(0)}`, 76, y + 156, C.white, 14, 'center');
  y += 186;
  text(ctx, 'FLAPS', 10, y, C.white, 13);
  text(ctx, `${Math.round(d.flapsDeg)}°`, 142, y, C.white, 15, 'right');
  text(ctx, 'TRIM', 10, y + 22, C.white, 13);
  const tr = sim.controls.trim;
  box(ctx, 60, y + 16, 80, 10, '#222', C.gray);
  box(ctx, 98 + tr * -38, y + 14, 4, 14, C.white);
  text(ctx, tr < 0 ? 'UP' : 'DN', 142, y + 40, C.gray, 11, 'right');
  text(ctx, 'HOBBS', 10, y + 62, C.white, 13);
  text(ctx, `${(sim.ac.s.hobbs / 3600).toFixed(1)}`, 142, y + 62, C.white, 14, 'right');
}

// ------------------------------------------------------------------ map
export function drawMap(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  r: { x: number; y: number; w: number; h: number },
  rangeNm: number,
  inset: boolean,
  st?: MfdState,
) {
  const s = sim.ac.s;
  const d = sim.ac.data;
  const northUp = st ? st.northUp : false;
  const rot = northUp ? 0 : d.trackTrue * DEG;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h * (northUp ? 0.5 : 0.62);
  const ppn = (Math.min(r.w, r.h) * (northUp ? 0.45 : 0.55)) / rangeNm;
  const xy = (p: LatLon) => {
    const l = toLocal(s, p);
    const x = l.x * Math.cos(rot) - l.y * Math.sin(rot);
    const y = l.x * Math.sin(rot) + l.y * Math.cos(rot);
    return { x: cx + x * ppn, y: cy - y * ppn };
  };
  box(ctx, r.x, r.y, r.w, r.h, '#06121f');
  // terrain shading (coarse, relative to aircraft altitude)
  if ((st?.terrain ?? true) && !inset && st) {
    const key = `${rangeNm}|${northUp}|${Math.round(s.lat * 300)}|${Math.round(s.lon * 300)}|${Math.round(s.altFt / 100)}|${northUp ? 0 : Math.round(d.trackTrue / 3)}|${r.w}x${r.h}`;
    const cache = st.terrainCache;
    if (cache.key !== key || !cache.canvas) {
      const off = cache.canvas ?? document.createElement('canvas');
      off.width = r.w;
      off.height = r.h;
      const o = off.getContext('2d')!;
      const step = 10;
      for (let py = 0; py < r.h; py += step) {
        for (let px = 0; px < r.w; px += step) {
          const lx = (r.x + px + step / 2 - cx) / ppn;
          const ly = -(r.y + py + step / 2 - cy) / ppn;
          const ex = lx * Math.cos(-rot) - ly * Math.sin(-rot);
          const ey = lx * Math.sin(-rot) + ly * Math.cos(-rot);
          const p = destination(destination(s, 90, ex), 0, ey);
          const e = groundElevation(p);
          o.fillStyle = s.altFt - e < 100 ? '#7a1010' : s.altFt - e < 1000 ? '#6b5d10' : e > 1200 ? '#20311d' : e > 700 ? '#1b2a19' : '#14211a';
          o.fillRect(px, py, step, step);
        }
      }
      cache.canvas = off;
      cache.key = key;
    }
    ctx.drawImage(cache.canvas, r.x, r.y, r.w, r.h);
  } else if (inset) box(ctx, r.x, r.y, r.w, r.h, '#122016');
  // range ring
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.arc(cx, cy, (rangeNm / 2) * ppn, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  text(ctx, `${rangeNm / 2}`, cx + (rangeNm / 2) * ppn * 0.7, cy - (rangeNm / 2) * ppn * 0.7, C.white, 12);
  const declutter = st?.declutter ?? (inset ? 1 : 0);
  // fixes
  if (declutter < 2 && rangeNm <= 30) {
    for (const f of FIXES) {
      if (f.kind !== 'fix') continue;
      const p = xy(f);
      if (p.x < r.x || p.x > r.x + r.w || p.y < r.y || p.y > r.y + r.h) continue;
      poly(ctx, [[p.x, p.y - 5], [p.x - 5, p.y + 4], [p.x + 5, p.y + 4]], undefined, '#b9c3cc', 1.2);
      if (!inset) text(ctx, f.ident, p.x + 7, p.y - 6, '#b9c3cc', 12);
    }
  }
  // navaids
  for (const n of NAVAIDS) {
    if (n.type === 'ILS' || n.type === 'LOC') {
      if (declutter > 1) continue;
      const a = xy(n);
      const crs = (n.course ?? 0) + 180;
      const far = xy(destination(n, crs, 10));
      const l = xy(destination(n, crs - 2.5, 10));
      const rr = xy(destination(n, crs + 2.5, 10));
      poly(ctx, [[a.x, a.y], [l.x, l.y], [far.x, far.y], [rr.x, rr.y]], 'rgba(0,228,255,0.10)', 'rgba(0,228,255,0.6)', 1);
      continue;
    }
    const p = xy(n);
    if (n.type === 'NDB') {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        box(ctx, p.x + Math.cos(a) * 6 - 1, p.y + Math.sin(a) * 6 - 1, 2, 2, C.magenta);
      }
      box(ctx, p.x - 2, p.y - 2, 4, 4, C.magenta);
    } else {
      const pts: [number, number][] = Array.from({ length: 6 }, (_, i) => [p.x + 7 * Math.cos((i * Math.PI) / 3), p.y + 7 * Math.sin((i * Math.PI) / 3)]);
      poly(ctx, pts, undefined, C.cyan, 1.6);
      box(ctx, p.x - 1.5, p.y - 1.5, 3, 3, C.cyan);
      if (!inset) {
        ctx.strokeStyle = 'rgba(0,228,255,0.35)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 * ppn, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (!inset || rangeNm <= 10) text(ctx, n.ident, p.x + 10, p.y + 12, n.type === 'NDB' ? C.magenta : C.cyan, 13);
  }
  // airports
  for (const a of AIRPORTS) {
    const p = xy(a);
    for (let i = 0; i < a.runways.length; i += 2) {
      const r1 = xy(a.runways[i].threshold);
      const r2 = xy(a.runways[i].end);
      line(ctx, r1.x, r1.y, r2.x, r2.y, '#ffffff', Math.max(2, ppn * 0.05));
    }
    if (ppn * 1.5 < 20) {
      ctx.strokeStyle = C.cyan;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    text(ctx, a.icao, p.x + 12, p.y - 12, C.white, 14, 'left', 700);
  }
  // flight plan
  const fp = sim.fp;
  if (fp.wpts.length) {
    for (let i = 1; i < fp.wpts.length; i++) {
      const a = xy(fp.wpts[i - 1]);
      const b = xy(fp.wpts[i]);
      const isActive = i === fp.active && !fp.out.holding;
      const missed = fp.wpts[i].appr === 'missed';
      if (missed) ctx.setLineDash([8, 6]);
      const arc = fp.wpts[i].arc;
      if (arc) {
        const th0 = bearingDeg(arc.center, fp.wpts[i - 1]);
        const th1 = bearingDeg(arc.center, fp.wpts[i]);
        let span = th1 - th0;
        if (arc.dir === 'R') span = ((span % 360) + 360) % 360;
        else span = -((((-span) % 360) + 360) % 360);
        ctx.beginPath();
        for (let k = 0; k <= 24; k++) {
          const p = xy(destination(arc.center, th0 + (span * k) / 24, arc.radius));
          if (k) ctx.lineTo(p.x, p.y);
          else ctx.moveTo(p.x, p.y);
        }
        ctx.strokeStyle = isActive ? C.magenta : C.white;
        ctx.lineWidth = isActive ? 4 : 2.5;
        ctx.stroke();
      } else line(ctx, a.x, a.y, b.x, b.y, isActive ? C.magenta : C.white, isActive ? 4 : 2.5);
      ctx.setLineDash([]);
    }
    // direct-to leg
    if (fp.out.valid && fp.out.fromIdent === 'DCT') {
      const to = xy(fp.wpts[fp.active]);
      const dct = fp.directFrom;
      if (dct) {
        const f = xy(dct);
        line(ctx, f.x, f.y, to.x, to.y, C.magenta, 4);
      }
    }
    // holds
    for (const w of fp.wpts) {
      if (!w.hold) continue;
      const pts: { x: number; y: number }[] = [];
      const R = 0.48;
      const L = 1.5;
      const sgn = w.hold.turn === 'R' ? 1 : -1;
      const inb = w.hold.inbound;
      for (let k = 0; k <= 16; k++) {
        const a = -90 + (180 * k) / 16;
        const c = destination(w, inb + 90 * sgn, R);
        pts.push(xy(destination(c, inb + sgn * a, R)));
      }
      for (let k = 0; k <= 16; k++) {
        const a = 90 + (180 * k) / 16;
        const c = destination(destination(w, inb + 180, L), inb + 90 * sgn, R);
        pts.push(xy(destination(c, inb + sgn * a, R)));
      }
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.strokeStyle = fp.out.holding && fp.wpts[fp.active] === w ? C.magenta : C.white;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    for (let i = 0; i < fp.wpts.length; i++) {
      const w = fp.wpts[i];
      const p = xy(w);
      const active = i === fp.active;
      ctx.fillStyle = active ? C.magenta : C.white;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      if (!inset || active) {
        box(ctx, p.x + 6, p.y + 2, w.ident.length * 8 + 6, 17, active ? C.magenta : 'rgba(255,255,255,0.9)');
        text(ctx, w.ident, p.x + 9, p.y + 11, active ? C.white : C.black, 13, 'left', 700);
      }
    }
  }
  // track vector (1 minute)
  const ahead = xy(destination(s, d.trackTrue, d.gsKt / 60));
  ctx.setLineDash([3, 4]);
  line(ctx, cx, cy, ahead.x, ahead.y, '#d6d6d6', 1.5);
  ctx.setLineDash([]);
  // own ship
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(d.hdgTrue * DEG - rot);
  poly(ctx, [[0, -14], [3, -5], [13, 2], [13, 5], [3, 2], [2, 9], [6, 12], [6, 14], [0, 12], [-6, 14], [-6, 12], [-2, 9], [-3, 2], [-13, 5], [-13, 2], [-3, -5]], C.white, C.black, 1);
  ctx.restore();
  // north indicator & range
  if (!inset) {
    box(ctx, r.x + r.w - 70, r.y + 8, 62, 22, 'rgba(0,0,0,0.7)', C.gray);
    text(ctx, `${rangeNm} NM`, r.x + r.w - 39, r.y + 19, C.white, 14, 'center');
    box(ctx, r.x + 8, r.y + 8, 82, 22, 'rgba(0,0,0,0.7)', C.gray);
    text(ctx, northUp ? 'NORTH UP' : 'TRK UP', r.x + 49, r.y + 19, C.white, 13, 'center');
    box(ctx, r.x + 8, r.y + r.h - 60, 120, 52, 'rgba(0,0,0,0.7)', C.gray);
    text(ctx, `GS  ${Math.round(d.gsKt)}KT`, r.x + 16, r.y + r.h - 46, C.white, 14);
    text(ctx, `TRK ${pad3(d.trackTrue)}°`, r.x + 16, r.y + r.h - 22, C.magenta, 14);
  } else {
    text(ctx, `${rangeNm}NM`, r.x + r.w - 6, r.y + 12, C.white, 13, 'right');
  }
}

// ------------------------------------------------------------------ flight plan page
function drawFpl(ctx: CanvasRenderingContext2D, sim: Sim, r: { x: number; y: number; w: number; h: number }) {
  box(ctx, r.x, r.y, r.w, r.h, '#05080c');
  line(ctx, r.x, r.y, r.x, r.y + r.h, C.gray, 1);
  text(ctx, 'ACTIVE FLIGHT PLAN', r.x + r.w / 2, r.y + 16, C.white, 15, 'center', 700);
  const fp = sim.fp;
  let y = r.y + 40;
  text(ctx, 'WPT', r.x + 14, y, C.white, 13);
  text(ctx, 'DTK', r.x + 132, y, C.white, 13, 'right');
  text(ctx, 'DIS', r.x + 196, y, C.white, 13, 'right');
  text(ctx, 'ALT', r.x + 284, y, C.white, 13, 'right');
  line(ctx, r.x + 8, y + 10, r.x + r.w - 8, y + 10, C.gray, 1);
  y += 28;
  if (!fp.wpts.length) {
    text(ctx, 'Empty — use PROC to load an approach', r.x + r.w / 2, y + 20, C.gray, 14, 'center');
    text(ctx, 'or D→ to go direct', r.x + r.w / 2, y + 40, C.gray, 14, 'center');
  }
  let lastSection = '';
  for (let i = 0; i < fp.wpts.length; i++) {
    const w = fp.wpts[i];
    const section = w.appr === 'missed' ? 'MISSED APPROACH' : w.appr ? `${fp.approach?.airport} ${fp.approach?.name}` : 'ENROUTE';
    if (section !== lastSection) {
      text(ctx, section, r.x + 14, y, C.white, 13, 'left', 700);
      y += 22;
      lastSection = section;
    }
    const active = i === fp.active;
    const prev = i > 0 ? fp.wpts[i - 1] : null;
    const dtk = prev ? bearingDeg(prev, w) : null;
    const dis = prev ? distanceNm(prev, w) : null;
    if (active) {
      poly(ctx, [[r.x + 8, y - 6], [r.x + 16, y], [r.x + 8, y + 6]], C.magenta);
    }
    const col = active ? C.magenta : C.white;
    text(ctx, `${w.ident}${w.role && w.role !== 'ENR' ? ' ' + (w.role === 'MAHP' ? 'mahp' : w.role.toLowerCase()) : ''}${w.hold ? ' ⟳' : ''}`, r.x + 22, y, col, 16, 'left', 700);
    if (dtk !== null) text(ctx, `${pad3(dtk)}°`, r.x + 132, y, col, 15, 'right');
    if (dis !== null) text(ctx, dis.toFixed(1), r.x + 196, y, col, 15, 'right');
    if (w.altMin) text(ctx, `${w.altMin}`, r.x + 284, y, C.cyan, 15, 'right');
    y += 24;
    if (y > r.y + r.h - 60) break;
  }
  // footer
  const o = fp.out;
  box(ctx, r.x, r.y + r.h - 48, r.w, 48, '#0b1118');
  text(ctx, fp.approachActive ? (fp.missedActive ? 'MISSED APPROACH ACTIVE' : 'APPROACH ACTIVE') : fp.approachId ? 'APPROACH LOADED' : '', r.x + 14, r.y + r.h - 32, fp.approachActive ? C.green : C.white, 14);
  if (o.valid) text(ctx, `CDI ${o.mode}  ±${o.fullScaleNm.toFixed(1)}NM`, r.x + 14, r.y + r.h - 12, C.magenta, 14);
}
