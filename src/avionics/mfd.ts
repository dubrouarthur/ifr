// G1000-style Multi-Function Display: engine strip, moving map, flight plan.
import type { Sim } from '../sim/sim';
import { C, line, poly, text, pad3 } from './draw';
import { drawTopBar, drawSoftkeys, setTextScaleFor, fs, tw, cbox } from './pfd';
import { AIRPORTS, FIXES, NAVAIDS, groundElevation, terrainProviderActive, terrainEpoch } from '../nav/data';
import { destination, distanceNm, toLocal, DEG, bearingDeg, type LatLon } from '../nav/geo';
import { flyablePath, type PathFix } from '../nav/pathgeom';
import type { Waypoint } from '../nav/flightplan';

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

const EIS_W = 152;
const TITLE_H = 22;
const SOFT_Y = MFD_H - 24;

export function drawMfd(ctx: CanvasRenderingContext2D, sim: Sim, st: MfdState) {
  setTextScaleFor(ctx, MFD_W);
  ctx.clearRect(0, 0, MFD_W, MFD_H);
  cbox(ctx, 0, 0, MFD_W, MFD_H, '#000');
  drawTopBar(ctx, sim, 'MFD');
  drawEis(ctx, sim);
  // the FPL pane hides itself when there is no flight plan (full-width map)
  const fpl = st.showFpl && sim.fp.wpts.length > 0;
  const mx = EIS_W + 2;
  const fplX = 718;
  const mw = (fpl ? fplX : MFD_W) - mx;
  // page title in its own strip above the map
  cbox(ctx, mx, 54, mw, TITLE_H, '#000');
  line(ctx, mx, 54 + TITLE_H - 0.5, mx + mw, 54 + TITLE_H - 0.5, '#2c3137', 1);
  text(ctx, 'MAP - NAVIGATION MAP', mx + mw / 2, 54 + TITLE_H / 2 + 1, C.white, fs(14), 'center', 700);
  const mapRect = { x: mx, y: 54 + TITLE_H, w: mw, h: SOFT_Y - 54 - TITLE_H };
  ctx.save();
  ctx.beginPath();
  ctx.rect(mapRect.x, mapRect.y, mapRect.w, mapRect.h);
  ctx.clip();
  drawMap(ctx, sim, mapRect, mfdRange(st), false, st);
  ctx.restore();
  if (fpl) drawFpl(ctx, sim, { x: fplX, y: 54, w: MFD_W - fplX, h: SOFT_Y - 54 });
  drawSoftkeys(ctx, MFD_SOFTKEYS, st.softkeyFlash, { TERRAIN: st.terrain, 'NORTH UP': st.northUp, DCLTR: st.declutter > 0, FPL: st.showFpl });
}

// ------------------------------------------------------------------ engine indication
const EIS_GREEN = '#0a6';
const EIS_YELLOW = '#e0b000';
const EIS_RED = '#d42a2a';

/** Round gauge (RPM): 220° arc, coloured bands, white pointer, digital value in the centre. */
function gaugeArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, v: number, min: number, max: number, green: [number, number], red: number, label: string, valueText: string) {
  const a0 = 160 * DEG;
  const a1 = 380 * DEG;
  const ang = (x: number) => a0 + ((Math.max(min, Math.min(max, x)) - min) / (max - min)) * (a1 - a0);
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#2a2f35';
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a1);
  ctx.stroke();
  ctx.strokeStyle = EIS_GREEN;
  ctx.beginPath();
  ctx.arc(cx, cy, r, ang(green[0]), ang(green[1]));
  ctx.stroke();
  ctx.strokeStyle = EIS_RED;
  ctx.beginPath();
  ctx.arc(cx, cy, r, ang(red), a1);
  ctx.stroke();
  // major ticks every 500 rpm
  for (let t = min; t <= max; t += 500) {
    const a = ang(t);
    line(ctx, cx + Math.cos(a) * (r - 5), cy + Math.sin(a) * (r - 5), cx + Math.cos(a) * (r - 11), cy + Math.sin(a) * (r - 11), '#c9ced3', 1.5);
  }
  const a = ang(v);
  poly(ctx, [[cx + Math.cos(a) * (r + 5), cy + Math.sin(a) * (r + 5)], [cx + Math.cos(a - 0.13) * (r - 14), cy + Math.sin(a - 0.13) * (r - 14)], [cx + Math.cos(a + 0.13) * (r - 14), cy + Math.sin(a + 0.13) * (r - 14)]], C.white, C.black, 1);
  text(ctx, valueText, cx, cy + 2, C.white, fs(22), 'center', 700);
  text(ctx, label, cx, cy + r * 0.62, C.white, fs(13), 'center');
}

type Band = [number, number, string];
/** Horizontal bar gauge: label and value above, coloured bands, white pointer under the bar pointing up. */
function hbar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, label: string, frac: number, valueText: string, bands: Band[]): number {
  const ls = fs(13);
  text(ctx, label, x, y, C.white, ls);
  if (valueText) text(ctx, valueText, x + w, y, C.white, fs(15), 'right', 700);
  const by = y + ls / 2 + 5;
  cbox(ctx, x, by, w, 5, '#2a2f35');
  for (const [a, b, c] of bands) cbox(ctx, x + w * a, by, w * (b - a), 5, c);
  const px = x + Math.max(0, Math.min(1, frac)) * w;
  poly(ctx, [[px, by + 4], [px - 5, by + 12], [px + 5, by + 12]], C.white);
  return by + 12 - y; // height used below the label centre
}

function drawEis(ctx: CanvasRenderingContext2D, sim: Sim) {
  const d = sim.ac.data;
  const top = 54;
  cbox(ctx, 0, top, EIS_W, SOFT_Y - top, '#000');
  line(ctx, EIS_W + 0.5, top, EIS_W + 0.5, SOFT_Y, '#4a4f55', 1);
  const x = 10;
  const w = EIS_W - 20;
  const ls = fs(13);
  const vs = fs(15);
  gaugeArc(ctx, EIS_W / 2, top + 66, 52, d.rpm, 0, 2800, [2100, 2700], 2700, 'RPM', Number.isFinite(d.rpm) ? String(Math.round(d.rpm / 10) * 10) : '----');
  // one vertical rhythm for the whole strip: 5 engine bars, fuel (header + 2 bars), flaps, trim, engine hours
  const y0 = top + 146;
  const yEnd = SOFT_Y - 14;
  const units = 5 + 0.7 + 1.5 + 0.35 + 3; // rows in units of one bar pitch
  const pitch = Math.max(ls + 26, (yEnd - y0) / units);
  const thr = sim.controls.throttle;
  let y = y0;
  const g = (a: number, b: number): Band => [a, b, EIS_GREEN];
  hbar(ctx, x, y, w, 'FFLOW GPH', finite(d.fuelFlowGph) / 20, Number.isFinite(d.fuelFlowGph) ? d.fuelFlowGph.toFixed(1) : '--.-', [g(0, 0.6)]);
  y += pitch;
  const oilP = 60 + thr * 20;
  hbar(ctx, x, y, w, 'OIL PRES', oilP / 115, String(Math.round(oilP)), [[0, 0.17, EIS_RED], g(0.43, 0.87), [0.96, 1, EIS_RED]]);
  y += pitch;
  const oilT = 180 + thr * 30;
  hbar(ctx, x, y, w, 'OIL TEMP', (oilT - 75) / 175, String(Math.round(oilT)), [g(0.14, 0.97), [0.97, 1, EIS_RED]]);
  y += pitch;
  const egt = 1200 + thr * 250;
  hbar(ctx, x, y, w, 'EGT °F', (egt - 1000) / 700, String(Math.round(egt)), []);
  y += pitch;
  // vacuum: not modelled, shown as a static green band (no fake reading)
  hbar(ctx, x, y, w, 'VAC', 0.5, '', [g(0.25, 0.75)]);
  y += pitch;
  line(ctx, x, y - pitch * 0.3, x + w, y - pitch * 0.3, '#2c3137', 1);
  // fuel: two thin bars (L / R), 0 .. 26 gal each
  y += pitch * 0.1;
  text(ctx, 'FUEL QTY GAL', EIS_W / 2, y, C.white, ls, 'center');
  y += pitch * 0.6;
  const q = finite(sim.ac.s.fuelGal) / 2;
  const fb: Band[] = [[0, 0.06, EIS_RED], [0.06, 0.19, EIS_YELLOW], g(0.19, 1)];
  for (const lbl of ['L', 'R']) {
    text(ctx, lbl, x, y, C.white, ls, 'left', 700);
    const bx = x + 16;
    const bw = w - 16 - tw(ctx, '26', vs, 700) - 8;
    const by = y - 3;
    cbox(ctx, bx, by, bw, 5, '#2a2f35');
    for (const [a, b, c] of fb) cbox(ctx, bx + bw * a, by, bw * (b - a), 5, c);
    const px = bx + Math.max(0, Math.min(1, q / 26)) * bw;
    poly(ctx, [[px, by + 4], [px - 5, by + 12], [px + 5, by + 12]], C.white);
    text(ctx, Number.isFinite(sim.ac.s.fuelGal) ? q.toFixed(0) : '--', x + w, y, q < 5 ? EIS_YELLOW : C.white, vs, 'right', 700);
    y += pitch * 0.75;
  }
  line(ctx, x, y - pitch * 0.15, x + w, y - pitch * 0.15, '#2c3137', 1);
  y += pitch * 0.35;
  // flaps: 0 / 10 / 20 / 30 detents
  text(ctx, 'FLAPS', x, y, C.white, ls);
  text(ctx, `${Math.round(d.flapsDeg)}°`, x + w, y, C.white, vs, 'right', 700);
  const fy = y + ls / 2 + 5;
  cbox(ctx, x, fy, w, 5, '#2a2f35');
  for (const det of [0, 10, 20, 30]) line(ctx, x + (det / 30) * w, fy - 3, x + (det / 30) * w, fy + 8, '#6b7178', 1.5);
  const fpx = x + Math.max(0, Math.min(1, d.flapsDeg / 30)) * w;
  poly(ctx, [[fpx, fy + 4], [fpx - 5, fy + 12], [fpx + 5, fy + 12]], C.white);
  y += pitch;
  // elevator trim: DN .. T/O band .. UP
  const tr = sim.controls.trim;
  text(ctx, 'ELEV TRIM', x, y, C.white, ls);
  const ty = y + ls / 2 + 5;
  text(ctx, 'DN', x, ty + 2, C.gray, fs(11));
  text(ctx, 'UP', x + w, ty + 2, C.gray, fs(11), 'right');
  const tx0 = x + 24;
  const tw0 = w - 48;
  cbox(ctx, tx0, ty, tw0, 5, '#2a2f35');
  cbox(ctx, tx0 + tw0 * 0.42, ty, tw0 * 0.16, 5, EIS_GREEN);
  const tpx = tx0 + tw0 / 2 - Math.max(-1, Math.min(1, tr)) * (tw0 / 2);
  poly(ctx, [[tpx, ty + 4], [tpx - 5, ty + 12], [tpx + 5, ty + 12]], C.white);
  y += pitch;
  text(ctx, 'ENG HRS', x, y, C.white, ls);
  text(ctx, (finite(sim.ac.s.hobbs) / 3600).toFixed(1), x + w, y, C.white, vs, 'right', 700);
}

// ------------------------------------------------------------------ map
type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Greedy map-label placer: tries the four quadrants around a symbol and drops the label when all collide. */
export class LabelPlacer {
  readonly placed: Rect[] = [];
  constructor(private bounds: Rect) {}
  block(r: Rect) {
    this.placed.push(r);
  }
  place(px: number, py: number, w: number, h: number, s: number): Rect | null {
    const b = this.bounds;
    const cands = [
      { x: px + s, y: py - s - h },
      { x: px + s, y: py + s },
      { x: px - s - w, y: py - s - h },
      { x: px - s - w, y: py + s },
    ];
    for (const c of cands) {
      const r = { x: c.x, y: c.y, w, h };
      if (r.x < b.x || r.y < b.y || r.x + w > b.x + b.w || r.y + h > b.y + b.h) continue;
      if (this.placed.some((q) => overlaps(q, r))) continue;
      this.placed.push(r);
      return r;
    }
    return null;
  }
}

interface MapLabel {
  s: string;
  x: number;
  y: number;
  r: number; // symbol radius
  color: string;
  size: number;
  weight: number;
  prio: number; // 0 = FPL (active first), 1 = airports, 2 = navaids, 3 = fixes
}

const finite = (v: number, d = 0) => (Number.isFinite(v) ? v : d);

/**
 * The flight plan as flyable legs: legs[i] is the path of the leg that ends at wpts[i] (legs[0] is empty).
 * Straight legs are joined by fly-by arcs (turn anticipation) or fly-over turns (MAP, MAHP, runway, holding fix)
 * from the shared path geometry; DME-arc legs are true arcs.
 */
export function routeLegs(wpts: Waypoint[], gsKt: number): LatLon[][] {
  const legs: LatLon[][] = wpts.map(() => []);
  const arcLeg = (i: number) => {
    const w = wpts[i];
    const arc = w.arc!;
    const th0 = bearingDeg(arc.center, wpts[i - 1]);
    const th1 = bearingDeg(arc.center, w);
    let span = th1 - th0;
    if (arc.dir === 'R') span = ((span % 360) + 360) % 360;
    else span = -(((-span % 360) + 360) % 360);
    const n = Math.max(8, Math.ceil(Math.abs(span) / 4));
    return Array.from({ length: n + 1 }, (_, k) => destination(arc.center, th0 + (span * k) / n, arc.radius));
  };
  let j = 0; // start of the current run of straight legs
  const flush = (k: number) => {
    // straight legs j+1 .. k as one flyable path, split at the point nearest each interior waypoint
    if (k <= j) return;
    const fixes: PathFix[] = wpts.slice(j, k + 1).map((w) => ({ lat: w.lat, lon: w.lon, ident: w.ident, role: w.role, hold: w.hold }));
    const path = flyablePath(fixes, gsKt);
    let from = 0;
    for (let m = j + 1; m <= k; m++) {
      let to = path.length - 1;
      if (m < k) {
        let best = Infinity;
        for (let q = from; q < path.length; q++) {
          const dd = distanceNm(path[q], wpts[m]);
          if (dd < best) {
            best = dd;
            to = q;
          }
        }
      }
      legs[m] = path.slice(from, to + 1);
      from = to;
    }
  };
  for (let i = 1; i < wpts.length; i++) {
    if (wpts[i].arc) {
      flush(i - 1);
      legs[i] = arcLeg(i);
      j = i;
    }
  }
  flush(wpts.length - 1);
  return legs;
}

/** Runway outline on the map: a true rectangle from the two threshold points and the half width (px). */
export function runwayQuad(r1: { x: number; y: number }, r2: { x: number; y: number }, halfW: number): [number, number][] {
  const len = Math.hypot(r2.x - r1.x, r2.y - r1.y) || 1;
  const ux = (r2.x - r1.x) / len;
  const uy = (r2.y - r1.y) / len;
  const nx = -uy * halfW;
  const ny = ux * halfW;
  return [[r1.x + nx, r1.y + ny], [r2.x + nx, r2.y + ny], [r2.x - nx, r2.y - ny], [r1.x - nx, r1.y - ny]];
}

// G1000-like topographic bands (ft MSL → colour), muted so the symbology stays on top
const TOPO: [number, [number, number, number]][] = [
  [1, [8, 26, 50]], // water
  [250, [30, 62, 32]],
  [500, [44, 76, 36]],
  [1000, [70, 88, 40]],
  [1500, [98, 94, 48]],
  [2000, [118, 96, 54]],
  [3000, [110, 80, 46]],
  [5000, [92, 66, 42]],
  [Infinity, [118, 108, 98]],
];
const TAWS_RED: [number, number, number] = [150, 30, 30];
const TAWS_YELLOW: [number, number, number] = [150, 124, 22];
/** offset (deg lat, deg lon) that is half a period of the synthetic terrain's fine diagonal ripple
 *  (60·sin(310·lat + 170·lon)): averaging two samples this far apart cancels it exactly. */
const RIPPLE = { lat: (Math.PI * 310) / (310 * 310 + 170 * 170), lon: (Math.PI * 170) / (310 * 310 + 170 * 170) };

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
  // track-up uses the smoothed (GPS-like) track so the map never shakes in turbulence
  const trk = finite(d.trackSmooth, finite(d.hdgTrue));
  const gsS = finite(d.gsSmooth);
  const rot = northUp ? 0 : trk * DEG;
  const cx = r.x + r.w / 2;
  // track-up: ownship in the bottom third, the range arc as large as the map allows
  const cy = r.y + r.h * (northUp ? 0.5 : 0.68);
  const arcR = Math.min(cy - r.y - 16, (r.w / 2 - 10) / 0.866);
  const ppn = northUp ? (Math.min(r.w, r.h) * 0.45) / rangeNm : arcR / (0.92 * rangeNm);
  const xy = (p: LatLon) => {
    const l = toLocal(s, p);
    const x = l.x * Math.cos(rot) - l.y * Math.sin(rot);
    const y = l.x * Math.sin(rot) + l.y * Math.cos(rot);
    return { x: cx + x * ppn, y: cy - y * ppn };
  };
  // symbols are drawn only when entirely inside the map (4 px padding on the inset: no half symbols)
  const padIn = inset ? 4 : 0;
  const inside = (p: { x: number; y: number }, rad: number) =>
    p.x - rad >= r.x + padIn && p.x + rad <= r.x + r.w - padIn && p.y - rad >= r.y + padIn && p.y + rad <= r.y + r.h - padIn;
  const reach = rangeNm * 2.2; // nm: anything farther is off the map
  cbox(ctx, r.x, r.y, r.w, r.h, inset ? '#0b1620' : '#000');
  // terrain: quantised topographic bands, relative (TAWS-style) colours when airborne; cached
  if ((st?.terrain ?? true) && !inset && st) {
    const key = `${rangeNm}|${northUp}|${Math.round(s.lat * 300)}|${Math.round(s.lon * 300)}|${Math.round(s.altFt / 100)}|${northUp ? 0 : Math.round(trk / 3)}|${r.w}x${r.h}|${terrainEpoch}`;
    const cache = st.terrainCache;
    if (cache.key !== key || !cache.canvas) {
      const off = cache.canvas ?? document.createElement('canvas');
      off.width = r.w;
      off.height = r.h;
      const o = off.getContext('2d')!;
      // band index sampled on a coarse grid; cells whose corners disagree are resolved per pixel,
      // so band edges are exact (no blobs, no staircase) at a fraction of the per-pixel cost
      const step = 4;
      const agl = s.altFt - groundElevation(s);
      const relative = agl > 250;
      const synthetic = !terrainProviderActive();
      const cosR = Math.cos(-rot);
      const sinR = Math.sin(-rot);
      const elevAt = (px: number, py: number) => {
        const lx = (r.x + px - cx) / ppn;
        const ly = -(r.y + py - cy) / ppn;
        const p = destination(destination(s, 90, lx * cosR - ly * sinR), 0, lx * sinR + ly * cosR);
        const e = groundElevation(p);
        return synthetic && e >= 1 ? (e + Math.max(0, groundElevation({ lat: p.lat + RIPPLE.lat, lon: p.lon + RIPPLE.lon }))) / 2 : e;
      };
      const bandOf = (e: number) => {
        if (relative && e >= 1) {
          if (s.altFt - e < 100) return TOPO.length + 1;
          if (s.altFt - e < 1000) return TOPO.length;
        }
        for (let i = 0; i < TOPO.length; i++) if (e < TOPO[i][0]) return i;
        return TOPO.length - 1;
      };
      const PAL = [...TOPO.map((t) => t[1]), TAWS_YELLOW, TAWS_RED];
      const gw = Math.ceil(r.w / step) + 1;
      const gh = Math.ceil(r.h / step) + 1;
      const G = new Uint8Array(gw * gh);
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) G[j * gw + i] = bandOf(elevAt(i * step, j * step));
      const img = o.createImageData(r.w, r.h);
      const put = (px: number, py: number, c: [number, number, number]) => {
        const k = (py * r.w + px) * 4;
        img.data[k] = c[0];
        img.data[k + 1] = c[1];
        img.data[k + 2] = c[2];
        img.data[k + 3] = 255;
      };
      for (let j = 0; j < gh - 1; j++) {
        for (let i = 0; i < gw - 1; i++) {
          const k0 = j * gw + i;
          const b0 = G[k0];
          const uniform = G[k0 + 1] === b0 && G[k0 + gw] === b0 && G[k0 + gw + 1] === b0;
          const x1 = Math.min(r.w, (i + 1) * step);
          const y1 = Math.min(r.h, (j + 1) * step);
          for (let py = j * step; py < y1; py++) {
            for (let px = i * step; px < x1; px++) put(px, py, PAL[uniform ? b0 : bandOf(elevAt(px + 0.5, py + 0.5))]);
          }
        }
      }
      o.putImageData(img, 0, 0);
      cache.canvas = off;
      cache.key = key;
    }
    ctx.drawImage(cache.canvas, r.x, r.y, r.w, r.h);
  }
  const lblSize = (n: number) => (inset ? fs(n) : fs(n));
  const placer = new LabelPlacer({ x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 });
  const labels: MapLabel[] = [];
  const fp = sim.fp;
  const fplIdents = new Set(fp.wpts.map((w) => w.ident));
  const declutter = st?.declutter ?? (inset ? 1 : 0);
  const ap = fp.approach;

  // range ring (half range) with its label; track-up: compass arc at the full range
  const ringR = (rangeNm / 2) * ppn;
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  ctx.beginPath();
  ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (!inset) {
    const rl = `${rangeNm / 2}NM`;
    const rs = fs(12);
    const lx = cx - ringR * 0.7071;
    const ly = cy - ringR * 0.7071;
    const lw = tw(ctx, rl, rs) + 8;
    cbox(ctx, lx - lw / 2, ly - rs / 2 - 2, lw, rs + 4, '#000');
    text(ctx, rl, lx, ly + 1, '#c9ced3', rs, 'center');
    placer.block({ x: lx - lw / 2, y: ly - rs / 2 - 2, w: lw, h: rs + 4 });
    if (!northUp) {
      const R = rangeNm * ppn * 0.92;
      ctx.strokeStyle = '#c9ced3';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2 - 1.05, -Math.PI / 2 + 1.05);
      ctx.stroke();
      for (let b = Math.ceil((trk - 60) / 5) * 5; b <= trk + 60; b += 5) {
        const a = (b - trk) * DEG - Math.PI / 2;
        const major = ((b % 30) + 30) % 30 === 0;
        const len = major ? 12 : ((b % 10) + 10) % 10 === 0 ? 8 : 5;
        line(ctx, cx + Math.cos(a) * R, cy + Math.sin(a) * R, cx + Math.cos(a) * (R - len), cy + Math.sin(a) * (R - len), '#c9ced3', 1.5);
        if (major) {
          const hb = ((b % 360) + 360) % 360;
          const lbl = hb === 0 ? 'N' : hb === 90 ? 'E' : hb === 180 ? 'S' : hb === 270 ? 'W' : String(hb / 10);
          text(ctx, lbl, cx + Math.cos(a) * (R - 24), cy + Math.sin(a) * (R - 24), C.white, fs(14), 'center', 700);
        }
      }
      // lubber line at the top of the arc
      poly(ctx, [[cx, cy - R + 1], [cx - 6, cy - R - 9], [cx + 6, cy - R - 9]], C.white);
    }
  }

  // localizer feather: only the loaded approach's runway, thin outline
  if (ap && declutter < 2) {
    for (const n of NAVAIDS) {
      if (n.type !== 'ILS' && n.type !== 'LOC') continue;
      if (!(n.ident === ap.navaid || (n.airport === ap.airport && n.runway === ap.runway))) continue;
      if (distanceNm(s, n) > reach + 10) continue;
      const a = xy(n);
      const crs = (n.course ?? 0) + 180;
      const far = xy(destination(n, crs, 10));
      const l = xy(destination(n, crs - 2.5, 10));
      const rr = xy(destination(n, crs + 2.5, 10));
      poly(ctx, [[a.x, a.y], [l.x, l.y], [far.x, far.y], [rr.x, rr.y]], undefined, 'rgba(0,228,255,0.55)', 1);
    }
  }
  // fixes (generic intersections)
  if (declutter < 2 && rangeNm <= 30) {
    for (const f of FIXES) {
      if (f.kind !== 'fix') continue;
      if (Math.abs(f.lat - s.lat) * 60 > reach) continue;
      const p = xy(f);
      if (!inside(p, 6)) continue;
      if (fplIdents.has(f.ident)) continue; // drawn by the flight plan
      poly(ctx, [[p.x, p.y - 5], [p.x - 5, p.y + 4], [p.x + 5, p.y + 4]], undefined, '#b9c3cc', 1.2);
      if (!inset && rangeNm <= 20) labels.push({ s: f.ident, x: p.x, y: p.y, r: 6, color: '#b9c3cc', size: lblSize(12), weight: 600, prio: 3 });
    }
  }
  // navaids (VOR hexagon, VOR/DME hexagon in a box, NDB dotted circle)
  for (const n of NAVAIDS) {
    if (n.type === 'ILS' || n.type === 'LOC') continue;
    if (Math.abs(n.lat - s.lat) * 60 > reach) continue;
    const p = xy(n);
    if (!inside(p, 9)) continue;
    const inFpl = fplIdents.has(n.ident);
    if (n.type === 'NDB') {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        cbox(ctx, p.x + Math.cos(a) * 6 - 1, p.y + Math.sin(a) * 6 - 1, 2, 2, '#b98cf0');
      }
      cbox(ctx, p.x - 2, p.y - 2, 4, 4, '#b98cf0');
    } else {
      const pts: [number, number][] = Array.from({ length: 6 }, (_, i) => [p.x + 7 * Math.cos((i * Math.PI) / 3), p.y + 7 * Math.sin((i * Math.PI) / 3)]);
      poly(ctx, pts, undefined, C.cyan, 1.6);
      if (n.type === 'VORDME' || n.dme) {
        ctx.strokeStyle = C.cyan;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(p.x - 8.5, p.y - 7, 17, 14);
      }
      cbox(ctx, p.x - 1.5, p.y - 1.5, 3, 3, C.cyan);
    }
    if (!inset && !inFpl && declutter < 2) labels.push({ s: n.ident, x: p.x, y: p.y, r: 9, color: n.type === 'NDB' ? '#c9a6f5' : C.cyan, size: lblSize(13), weight: 700, prio: 2 });
  }
  // airports: runways at true width (min 4 px), outlined; numbers when zoomed in; ring symbol at long range
  const airportLbl = new Map<string, MapLabel>();
  for (const a of AIRPORTS) {
    if (Math.abs(a.lat - s.lat) * 60 > reach + 3) continue;
    const p = xy(a);
    // runways are drawn whenever any part is on the map (clipped by the map rect), even with the airport
    // reference point off screen: on the take-off roll or short final at 1-2 NM range
    const symOk = inside(p, 8);
    const big = rangeNm <= 10;
    for (let i = 0; i < a.runways.length; i += 2) {
      const rw = a.runways[i];
      const r1 = xy(rw.threshold);
      const r2 = xy(rw.end);
      if (Math.max(r1.x, r2.x) < r.x - 20 || Math.min(r1.x, r2.x) > r.x + r.w + 20 || Math.max(r1.y, r2.y) < r.y - 20 || Math.min(r1.y, r2.y) > r.y + r.h + 20) continue;
      const len = Math.hypot(r2.x - r1.x, r2.y - r1.y) || 1;
      const ux = (r2.x - r1.x) / len, uy = (r2.y - r1.y) / len;
      const halfW = Math.max(big ? 2.2 : 1.6, ((rw.widthFt / 6076) * ppn) / 2);
      poly(ctx, runwayQuad(r1, r2, halfW), big ? '#4a525b' : '#d7dde3', big ? '#e8ecef' : undefined, 1);
      if (big && halfW > 4) {
        ctx.setLineDash([6, 5]);
        line(ctx, r1.x + ux * 8, r1.y + uy * 8, r2.x - ux * 8, r2.y - uy * 8, '#e8ecef', 1);
        ctx.setLineDash([]);
      }
      if (!inset && rangeNm <= 5 && a.runways[i + 1]) {
        for (const [q, id, sgn] of [[r1, rw.id, -1], [r2, a.runways[i + 1].id, 1]] as const) {
          const tx = q.x + ux * sgn * 14;
          const ty = q.y + uy * sgn * 14;
          const rs = fs(12);
          const w = tw(ctx, id, rs, 700) + 4;
          text(ctx, id, tx, ty + 1, '#ffffff', rs, 'center', 700);
          placer.block({ x: tx - w / 2, y: ty - rs / 2, w, h: rs });
        }
      }
    }
    if (!symOk) continue;
    if (!big) {
      ctx.strokeStyle = '#d7dde3';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    placer.block({ x: p.x - 6, y: p.y - 6, w: 12, h: 12 });
    if (!inset && !fplIdents.has(a.icao)) {
      const L: MapLabel = { s: a.icao, x: p.x, y: p.y, r: big ? 14 : 10, color: C.white, size: lblSize(13), weight: 700, prio: 1 };
      airportLbl.set(a.icao, L);
      labels.push(L);
    }
  }
  // flight plan: active leg magenta, others white, missed approach dashed
  if (fp.wpts.length) {
    const direct = fp.out.valid && fp.out.fromIdent === 'DCT' && !!fp.directFrom;
    const legs = routeLegs(fp.wpts, Math.max(60, gsS || 100));
    const strokeLeg = (pts: LatLon[], color: string, w: number) => {
      if (pts.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach((q, k) => {
        const p = xy(q);
        if (k) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.lineCap = 'butt';
    };
    // inactive legs (white) first, the active leg (magenta) on top
    for (let i = 1; i < fp.wpts.length; i++) {
      if (i === fp.active && !fp.out.holding && !direct) continue;
      if (fp.wpts[i].appr === 'missed') ctx.setLineDash([8, 6]);
      strokeLeg(legs[i], C.white, 2.5);
      ctx.setLineDash([]);
    }
    if (fp.active > 0 && fp.active < fp.wpts.length && !fp.out.holding && !direct) {
      if (fp.wpts[fp.active].appr === 'missed') ctx.setLineDash([8, 6]);
      strokeLeg(legs[fp.active], C.magenta, 4);
      ctx.setLineDash([]);
    }
    if (direct) {
      const to = xy(fp.wpts[fp.active]);
      const f = xy(fp.directFrom!);
      line(ctx, f.x, f.y, to.x, to.y, C.magenta, 4);
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
    // waypoints: symbol + label (a runway waypoint at an airport is labelled by the airport ident only)
    const seen = new Set<string>();
    for (let i = 0; i < fp.wpts.length; i++) {
      const w = fp.wpts[i];
      const p = xy(w);
      if (!inside(p, 5)) continue;
      const active = i === fp.active;
      ctx.fillStyle = active ? C.magenta : C.white;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
      placer.block({ x: p.x - 5, y: p.y - 5, w: 10, h: 10 });
      if (seen.has(w.ident) && !active) continue;
      seen.add(w.ident);
      if (/^RW\d/.test(w.ident)) {
        const apt = AIRPORTS.find((a) => distanceNm(a, w) < 2);
        if (apt) {
          const L = airportLbl.get(apt.icao);
          if (L && active) L.color = C.magenta;
          if (L || !inset) continue;
        }
      }
      labels.push({ s: w.ident, x: p.x, y: p.y, r: 6, color: active ? C.magenta : C.white, size: lblSize(13), weight: 700, prio: active ? -1 : 0 });
    }
  }
  // track vector (1 minute), from the smoothed track / ground speed
  const ahead = xy(destination(s, trk, gsS / 60));
  ctx.setLineDash([3, 4]);
  line(ctx, cx, cy, ahead.x, ahead.y, '#d6d6d6', 1.5);
  ctx.setLineDash([]);
  // own ship
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(d.hdgTrue * DEG - rot);
  poly(ctx, [[0, -14], [3, -5], [13, 2], [13, 5], [3, 2], [2, 9], [6, 12], [6, 14], [0, 12], [-6, 14], [-6, 12], [-2, 9], [-3, 2], [-13, 5], [-13, 2], [-3, -5]], C.white, C.black, 1);
  ctx.restore();
  placer.block({ x: cx - 15, y: cy - 15, w: 30, h: 30 });

  // corner overlays (reserved before the labels are placed)
  const os = fs(13);
  const oh = os + 10;
  const corner = (x: number, y: number, w: number, h: number) => {
    cbox(ctx, x, y, w, h, 'rgba(0,0,0,0.78)', '#5f656b');
    placer.block({ x, y, w, h });
  };
  if (!inset) {
    // orientation (top right)
    const ori = northUp ? 'NORTH UP' : 'TRK UP';
    const ow = tw(ctx, ori, os, 700) + 16;
    corner(r.x + r.w - ow - 8, r.y + 8, ow, oh);
    text(ctx, ori, r.x + r.w - 8 - ow / 2, r.y + 8 + oh / 2 + 1, C.white, os, 'center', 700);
    // map range (bottom right)
    const rg = `${rangeNm}NM`;
    const rw = tw(ctx, rg, fs(15), 700) + 16;
    corner(r.x + r.w - rw - 8, r.y + r.h - oh - 8, rw, oh);
    text(ctx, rg, r.x + r.w - 8 - rw / 2, r.y + r.h - 8 - oh / 2 + 1, C.white, fs(15), 'center', 700);
    // wind vector (top left)
    const ww = tw(ctx, '00KT', os, 700) + 40;
    corner(r.x + 8, r.y + 8, ww, oh + 8);
    if (d.windKt > 0.5 && !s.onGround) {
      ctx.save();
      ctx.translate(r.x + 22, r.y + 8 + (oh + 8) / 2);
      ctx.rotate((d.windDir + 180) * DEG - rot);
      line(ctx, 0, 9, 0, -6, C.white, 2.5);
      poly(ctx, [[0, -11], [-5, -3], [5, -3]], C.white);
      ctx.restore();
      text(ctx, `${Math.round(d.windKt)}KT`, r.x + 38, r.y + 8 + (oh + 8) / 2 + 1, C.white, os, 'left', 700);
    } else text(ctx, 'WIND ---', r.x + 8 + ww / 2, r.y + 8 + (oh + 8) / 2 + 1, C.gray, fs(12), 'center');
    // no flight plan (bottom left)
    if (!fp.wpts.length) {
      const t1 = 'NO FLIGHT PLAN';
      const t2 = 'PROC  ·  D→';
      const nw = Math.max(tw(ctx, t1, os, 700), tw(ctx, t2, fs(12))) + 20;
      const nh = os + fs(12) + 16;
      corner(r.x + 8, r.y + r.h - nh - 8, nw, nh);
      text(ctx, t1, r.x + 18, r.y + r.h - nh - 8 + 6 + os / 2, C.white, os, 'left', 700);
      text(ctx, t2, r.x + 18, r.y + r.h - 14 - fs(12) / 2, C.gray, fs(12));
    }
  } else {
    const rg = `${rangeNm}NM`;
    const rs = fs(12);
    const rw = tw(ctx, rg, rs, 700) + 8;
    cbox(ctx, r.x + r.w - rw - 4, r.y + 4, rw, rs + 4, 'rgba(0,0,0,0.7)');
    text(ctx, rg, r.x + r.w - 4 - rw / 2, r.y + 6 + rs / 2, C.white, rs, 'center', 700);
    placer.block({ x: r.x + r.w - rw - 4, y: r.y + 4, w: rw, h: rs + 4 });
  }

  // labels by priority: FPL (active first) > airports > navaids > fixes
  labels.sort((a, b) => a.prio - b.prio);
  for (const L of labels) {
    const w = tw(ctx, L.s, L.size, L.weight) + 6;
    const h = L.size + 4;
    const q = placer.place(L.x, L.y, w, h, L.r);
    if (!q) continue;
    cbox(ctx, q.x, q.y, w, h, 'rgba(0,0,0,0.62)');
    text(ctx, L.s, q.x + 3, q.y + h / 2 + 1, L.color, L.size, 'left', L.weight);
  }
}

// ------------------------------------------------------------------ flight plan page
/** Drawn hold (racetrack) glyph. */
function holdGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - 3, y - 4);
  ctx.lineTo(x + 3, y - 4);
  ctx.arc(x + 3, y, 4, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x - 3, y + 4);
  ctx.arc(x - 3, y, 4, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.stroke();
}

const ROLE_SUFFIX: Partial<Record<string, string>> = { IAF: 'iaf', IF: 'if', FAF: 'faf', MAP: 'map', MAHP: 'mahp', STEPDOWN: 'sdf' };

function drawFpl(ctx: CanvasRenderingContext2D, sim: Sim, r: { x: number; y: number; w: number; h: number }) {
  cbox(ctx, r.x, r.y, r.w, r.h, '#05080c');
  line(ctx, r.x + 0.5, r.y, r.x + 0.5, r.y + r.h, '#4a4f55', 1);
  const fp = sim.fp;
  const hs = fs(14);
  cbox(ctx, r.x + 1, r.y, r.w - 1, TITLE_H, '#000');
  text(ctx, 'ACTIVE FLIGHT PLAN', r.x + r.w / 2, r.y + TITLE_H / 2 + 1, C.white, hs, 'center', 700);
  // origin / destination
  const first = fp.wpts[0]?.ident ?? '';
  const dest = fp.approach?.airport ?? fp.wpts[fp.wpts.length - 1]?.ident ?? '';
  text(ctx, `${first} / ${dest}`, r.x + r.w / 2, r.y + TITLE_H + 14, C.cyan, fs(15), 'center', 700);
  // column header
  const cols = { id: r.x + 22, hold: r.x + 128, dtk: r.x + 170, dis: r.x + 232, alt: r.x + 296 };
  let y = r.y + TITLE_H + 38;
  const ch = fs(12);
  text(ctx, 'WPT', cols.id, y, C.gray, ch);
  text(ctx, 'DTK', cols.dtk, y, C.gray, ch, 'right');
  text(ctx, 'DIS', cols.dis, y, C.gray, ch, 'right');
  text(ctx, 'ALT', cols.alt, y, C.gray, ch, 'right');
  line(ctx, r.x + 8, y + 10, r.x + r.w - 8, y + 10, '#3a4048', 1);
  y += 26;
  // rows: section headers + waypoints, scrolled so the active waypoint stays in view
  type Row = { kind: 'sec'; label: string } | { kind: 'wpt'; i: number };
  const rows: Row[] = [];
  let lastSection = '';
  fp.wpts.forEach((w, i) => {
    const section = w.appr === 'missed' ? 'MISSED APPROACH' : w.appr ? `${fp.approach?.airport ?? ''} ${fp.approach?.name ?? 'APPROACH'}`.trim() : 'ENROUTE';
    if (section !== lastSection) {
      rows.push({ kind: 'sec', label: section });
      lastSection = section;
    }
    rows.push({ kind: 'wpt', i });
  });
  const rowH = Math.max(24, fs(16) + 8);
  const footerH = fs(14) * 2 + 20;
  const maxRows = Math.max(1, Math.floor((r.y + r.h - footerH - 6 - y) / rowH));
  const activeRow = rows.findIndex((q) => q.kind === 'wpt' && q.i === fp.active);
  let start = 0;
  if (rows.length > maxRows && activeRow >= 0) start = Math.max(0, Math.min(rows.length - maxRows, activeRow - 2));
  const ids = fs(16);
  const nums = fs(15);
  for (let k = start; k < Math.min(rows.length, start + maxRows); k++) {
    const row = rows[k];
    const ry = y + (k - start) * rowH;
    if (row.kind === 'sec') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x + 8, ry - rowH / 2, r.w - 16, rowH);
      ctx.clip();
      text(ctx, row.label, r.x + 12, ry, '#c9ced3', fs(13), 'left', 700);
      ctx.restore();
      continue;
    }
    const i = row.i;
    const w = fp.wpts[i];
    const active = i === fp.active;
    const prev = i > 0 ? fp.wpts[i - 1] : null;
    const dtk = prev ? bearingDeg(prev, w) : null;
    const dis = prev ? distanceNm(prev, w) : null;
    if (active) poly(ctx, [[r.x + 8, ry - 6], [r.x + 16, ry], [r.x + 8, ry + 6]], C.magenta);
    const col = active ? C.magenta : C.white;
    // ident cell (clipped) + role suffix in grey
    ctx.save();
    ctx.beginPath();
    ctx.rect(cols.id - 2, ry - rowH / 2, cols.hold - 10 - cols.id, rowH);
    ctx.clip();
    text(ctx, w.ident, cols.id, ry, col, ids, 'left', 700);
    const suf = w.role ? ROLE_SUFFIX[w.role] : undefined;
    if (suf) text(ctx, suf, cols.id + tw(ctx, w.ident, ids, 700) + 4, ry + 1, '#8a9097', fs(12));
    ctx.restore();
    if (w.hold) holdGlyph(ctx, cols.hold, ry, col);
    if (dtk !== null) text(ctx, `${pad3(dtk)}°`, cols.dtk, ry, col, nums, 'right');
    if (dis !== null) text(ctx, dis.toFixed(1), cols.dis, ry, col, nums, 'right');
    if (w.altMin) {
      // at-or-above constraint: cyan with a bar underneath (G1000 convention)
      text(ctx, `${w.altMin}`, cols.alt, ry, C.cyan, nums, 'right');
      const aw = tw(ctx, `${w.altMin}`, nums);
      line(ctx, cols.alt - aw, ry + nums / 2 + 2, cols.alt, ry + nums / 2 + 2, C.cyan, 1.5);
    }
  }
  // scroll hints
  if (start > 0) poly(ctx, [[r.x + r.w - 14, y - 16], [r.x + r.w - 20, y - 8], [r.x + r.w - 8, y - 8]], C.gray);
  if (start + maxRows < rows.length) {
    const yb = y + maxRows * rowH - rowH / 2 + 2;
    poly(ctx, [[r.x + r.w - 14, yb + 8], [r.x + r.w - 20, yb], [r.x + r.w - 8, yb]], C.gray);
  }
  // footer
  const o = fp.out;
  const fy = r.y + r.h - footerH;
  cbox(ctx, r.x + 1, fy, r.w - 1, footerH, '#0b1118');
  line(ctx, r.x + 1, fy + 0.5, r.x + r.w, fy + 0.5, '#2c3137', 1);
  const fsz = fs(14);
  const status = fp.approachActive ? (fp.missedActive ? 'MISSED APPROACH ACTIVE' : 'APPROACH ACTIVE') : fp.approachId ? 'APPROACH LOADED' : 'ENROUTE';
  text(ctx, status, r.x + 14, fy + 8 + fsz / 2, fp.approachActive ? C.green : C.white, fsz, 'left', 700);
  if (o.valid) text(ctx, `CDI ${o.mode}  ±${o.fullScaleNm.toFixed(1)}NM`, r.x + 14, fy + 14 + fsz * 1.5, C.magenta, fsz);
}
