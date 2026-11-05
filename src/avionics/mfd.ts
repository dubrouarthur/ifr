// G1000-style Multi-Function Display: engine strip, moving map, flight plan.
import type { Sim } from '../sim/sim';
import { C, line, poly, text, pad3 } from './draw';
import { drawTopBar, drawSoftkeys, setTextScaleFor, fs, tw, cbox } from './pfd';
import { AIRPORTS, APPROACHES, FIXES, NAVAIDS, groundElevation, terrainProviderActive, terrainEpoch } from '../nav/data';
import { destination, distanceNm, toLocal, DEG, bearingDeg, type LatLon } from '../nav/geo';
import { flyablePath, type PathFix } from '../nav/pathgeom';
import { isLocApproach, type Waypoint } from '../nav/flightplan';
import type { Approach } from '../nav/types';
import { TANK_GAL } from '../sim/systems';
import { darkScreen, hasPower, smokeHaze } from './gauges';

export const MFD_W = 1024;
export const MFD_H = 768;
/** slot 8 ACT LEG (G1000 NXi FPL page): active only while the FPL cursor is on a waypoint */
export const MFD_SOFTKEYS = ['ENGINE', '', 'MAP', '', 'TERRAIN', 'NORTH UP', 'DCLTR', 'ACT LEG', '', 'FPL', 'PROC', 'CHKLIST'];
const RANGES = [1, 2, 5, 10, 15, 20, 30, 50, 80];

export interface MfdState {
  rangeIdx: number;
  terrain: boolean;
  northUp: boolean;
  declutter: number;
  showFpl: boolean;
  terrainCache: { key: string; img: ImageData | null; canvas: HTMLCanvasElement | null };
  softkeyFlash: number | null;
  /** flight-plan management: cursor, windows, touch regions */
  fms: FmsUi;
}

export const newMfdState = (): MfdState => ({
  rangeIdx: 4,
  terrain: true,
  northUp: true,
  declutter: 0,
  showFpl: true,
  terrainCache: { key: '', img: null, canvas: null },
  softkeyFlash: null,
  fms: newFmsUi(),
});

export function mfdRange(st: MfdState) {
  return RANGES[st.rangeIdx];
}

const EIS_W = 152;
const TITLE_H = 22;
const FPL_X = 718;
const SOFT_Y = MFD_H - 24;

/** Draw the display, then the cabin smoke veil over it (smokeHaze: electrical or engine fire) */
export function drawMfd(ctx: CanvasRenderingContext2D, sim: Sim, st: MfdState) {
  drawMfdBody(ctx, sim, st);
  smokeHaze(ctx, sim, MFD_W, MFD_H, (typeof performance !== 'undefined' ? performance.now() : 0) / 1000);
}

function drawMfdBody(ctx: CanvasRenderingContext2D, sim: Sim, st: MfdState) {
  setTextScaleFor(ctx, MFD_W);
  // the MFD is on the avionics bus: dark with the AVIONICS switch OFF or a dead bus (the PFD then shows the
  // engine strip, reversionary mode). The flight plan and its cursor are kept: they are back with the power.
  if (!hasPower(sim, 'mfd')) {
    st.fms.hits = [];
    darkScreen(ctx, MFD_W, MFD_H);
    return;
  }
  ctx.clearRect(0, 0, MFD_W, MFD_H);
  cbox(ctx, 0, 0, MFD_W, MFD_H, '#000');
  drawTopBar(ctx, sim, 'MFD');
  drawEis(ctx, sim);
  // the FPL pane hides itself when there is no flight plan (full-width map)
  const fpl = st.showFpl && sim.fp.wpts.length > 0;
  const mx = EIS_W + 2;
  const fplX = FPL_X;
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
  const f = st.fms;
  f.hits = [];
  bindMfdPointer(ctx.canvas, st, sim);
  // the shell flashes the pressed softkey (bezel button or a tap on its label): ACT LEG is acted on here
  if (st.softkeyFlash !== null && st.softkeyFlash !== f.lastFlash && MFD_SOFTKEYS[st.softkeyFlash] === 'ACT LEG') fmsKey(sim, st, 'actleg');
  f.lastFlash = st.softkeyFlash;
  if (fpl) drawFpl(ctx, sim, st, { x: fplX, y: 54, w: MFD_W - fplX, h: SOFT_Y - 54 });
  drawFmsWindows(ctx, sim, st, fpl);
  const keys = MFD_SOFTKEYS.map((k) => (k === 'ACT LEG' && !(f.page === 'fpl' && f.cursor && typeof f.cursor === 'object') ? '' : k));
  drawSoftkeys(ctx, keys, st.softkeyFlash, { TERRAIN: st.terrain, 'NORTH UP': st.northUp, DCLTR: st.declutter > 0, FPL: st.showFpl });
}

// ------------------------------------------------------------------ engine indication
const EIS_GREEN = '#0a6';
const EIS_YELLOW = '#e0b000';
const EIS_RED = '#d42a2a';

/** Round gauge (RPM): 220° arc, coloured bands, white pointer, digital value in the centre. */
function gaugeArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, v: number, min: number, max: number, green: [number, number], red: number, label: string, valueText: string, valueColor: string = C.white) {
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
  text(ctx, valueText, cx, cy + 2, valueColor, fs(22), 'center', 700);
  text(ctx, label, cx, cy + r * 0.62, C.white, fs(13), 'center');
}

type Band = [number, number, string];
/** Horizontal bar gauge: label and value above, coloured bands, white pointer under the bar pointing up. */
function hbar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, label: string, frac: number, valueText: string, bands: Band[], valueColor: string = C.white): number {
  const ls = fs(13);
  text(ctx, label, x, y, C.white, ls);
  if (valueText) text(ctx, valueText, x + w, y, valueColor, fs(15), 'right', 700);
  const by = y + ls / 2 + 5;
  cbox(ctx, x, by, w, 5, '#2a2f35');
  for (const [a, b, c] of bands) cbox(ctx, x + w * a, by, w * (b - a), 5, c);
  const px = x + Math.max(0, Math.min(1, frac)) * w;
  poly(ctx, [[px, by + 4], [px - 5, by + 12], [px + 5, by + 12]], C.white);
  return by + 12 - y; // height used below the label centre
}

/** EIS markings (C172S, G1000): value range of each gauge and its coloured bands, in the gauge's units */
export const EIS_SCALES = {
  rpm: { min: 0, max: 2800, bands: [[2100, 2700, 'green'], [2700, 2800, 'red']] },
  fflow: { min: 0, max: 20, bands: [[0, 12, 'green']] },
  oilP: { min: 0, max: 120, bands: [[0, 20, 'red'], [20, 50, 'yellow'], [50, 90, 'green'], [90, 115, 'yellow'], [115, 120, 'red']] },
  oilT: { min: 75, max: 250, bands: [[100, 245, 'green'], [245, 250, 'red']] },
  egt: { min: 1000, max: 1700, bands: [] },
  vac: { min: 3, max: 7, bands: [[4.5, 5.5, 'green']] },
  fuel: { min: 0, max: TANK_GAL, bands: [[0, 1.5, 'red'], [1.5, 8, 'yellow'], [8, TANK_GAL, 'green']] },
} as const satisfies Record<string, { min: number; max: number; bands: readonly (readonly [number, number, 'green' | 'yellow' | 'red'])[] }>;

export type EisLevel = 'normal' | 'caution' | 'warning';
export type EisId = 'rpm' | 'fflow' | 'oilP' | 'oilT' | 'egt' | 'vac' | 'fuelL' | 'fuelR' | 'mBus' | 'eBus' | 'mBatt' | 'sBatt';
/** one EIS reading: the value, its text, where the pointer sits (0..1) and the colour it is drawn in */
export interface EisReading {
  id: EisId;
  value: number;
  text: string;
  frac: number;
  level: EisLevel;
}

const levelOf = (v: number, bands: readonly (readonly [number, number, string])[]): EisLevel => {
  if (!Number.isFinite(v)) return 'normal';
  let red = false;
  let yellow = false;
  for (const [a, b, c] of bands) {
    // band edges count as inside (a pegged needle reads red)
    if (v >= a && v <= b) {
      if (c === 'red') red = true;
      else if (c === 'yellow') yellow = true;
    }
  }
  // below / above the whole scale: the colour of the end band
  const first = bands[0];
  const last = bands[bands.length - 1];
  if (first && v < first[0] && first[0] === Math.min(...bands.map((x) => x[0]))) {
    if (first[2] === 'red') red = true;
    else if (first[2] === 'yellow') yellow = true;
  }
  if (last && v > last[1]) {
    if (last[2] === 'red') red = true;
    else if (last[2] === 'yellow') yellow = true;
  }
  return red ? 'warning' : yellow ? 'caution' : 'normal';
};

/** What the EIS shows for the aircraft now (pure: the MFD strip, the reversionary PFD strip and the tests read
 *  this). Real readings from the systems model: oil pressure / temperature, vacuum, fuel per tank, bus volts and
 *  battery amps. Without a systems model (stubs) it shows a healthy engine. */
export function eisReadings(sim: Sim): Record<EisId, EisReading> {
  const d = sim.ac.data;
  const sys = (sim as { sys?: Sim['sys'] }).sys;
  const thr = sim.controls?.throttle ?? 0;
  const mk = (id: EisId, v: number, txt: string, sc: { min: number; max: number; bands: readonly (readonly [number, number, string])[] } | null, lvl?: EisLevel): EisReading => ({
    id,
    value: v,
    text: Number.isFinite(v) ? txt : '---',
    frac: sc ? Math.max(0, Math.min(1, (finite(v, sc.min) - sc.min) / (sc.max - sc.min))) : 0,
    level: lvl ?? (sc ? levelOf(v, sc.bands) : 'normal'),
  });
  const S = EIS_SCALES;
  const oilP = sys ? sys.oilPressPsi : 60 + thr * 20;
  const oilT = sys ? sys.oilTempF : 180 + thr * 30;
  const egt = sys ? sys.egtF : 1200 + thr * 250;
  const vac = sys ? sys.vacuumInHg : 5;
  const half = finite(sim.ac.s.fuelGal) / 2;
  const fL = sys ? sys.fuelGalL : half;
  const fR = sys ? sys.fuelGalR : half;
  const volts = sys ? sys.busVolts : 28;
  const amps = sys ? sys.battAmps : 0;
  const rpm = d.rpm;
  const vTxt = (v: number) => v.toFixed(1);
  const vLvl: EisLevel = volts < 24.5 ? 'warning' : volts > 32 ? 'warning' : 'normal';
  const aTxt = (a: number) => `${a >= 0 ? '+' : '−'}${Math.abs(a) < 9.95 ? Math.abs(a).toFixed(1) : Math.round(Math.abs(a))}`;
  return {
    rpm: mk('rpm', rpm, String(Math.round(finite(rpm) / 10) * 10), S.rpm),
    fflow: mk('fflow', d.fuelFlowGph, finite(d.fuelFlowGph).toFixed(1), S.fflow),
    oilP: mk('oilP', oilP, String(Math.round(oilP)), S.oilP),
    oilT: mk('oilT', oilT, String(Math.round(oilT)), S.oilT),
    egt: mk('egt', egt, String(Math.round(egt)), S.egt),
    // amber below the LOW VACUUM annunciation threshold (3.5 inHg, as the systems model lights it), so the gauge
    // and the annunciator always agree; a low idle suction between 3.5 and the green arc stays white
    vac: mk('vac', vac, vac.toFixed(1), S.vac, vac < 3.5 ? 'caution' : 'normal'),
    fuelL: mk('fuelL', fL, fL.toFixed(0), S.fuel),
    fuelR: mk('fuelR', fR, fR.toFixed(0), S.fuel),
    // one main bus in the model: the essential bus reads the same voltage (tied in normal operation)
    mBus: mk('mBus', volts, vTxt(volts), null, vLvl),
    eBus: mk('eBus', volts, vTxt(volts), null, vLvl),
    // main battery ammeter: − = discharging (no alternator); the standby battery is not modelled (reads 0)
    mBatt: mk('mBatt', amps, aTxt(amps), null, amps < -0.5 ? 'caution' : 'normal'),
    sBatt: mk('sBatt', 0, aTxt(0), null),
  };
}

const LEVEL_COLOR: Record<EisLevel, string> = { normal: C.white, caution: EIS_YELLOW, warning: EIS_RED };
const BAND_COLOR: Record<string, string> = { green: EIS_GREEN, yellow: EIS_YELLOW, red: EIS_RED };
function bandsOf(sc: { min: number; max: number; bands: readonly (readonly [number, number, string])[] }): Band[] {
  return sc.bands.map(([a, b, c]) => [(a - sc.min) / (sc.max - sc.min), (b - sc.min) / (sc.max - sc.min), BAND_COLOR[c]] as Band);
}

function drawEis(ctx: CanvasRenderingContext2D, sim: Sim) {
  drawEisStrip(ctx, sim, { x: 0, top: 54, w: EIS_W, bottom: SOFT_Y }, true);
}

/** The engine strip in a region (the MFD's left edge, or the left edge of a PFD in reversionary mode). `full`
 *  adds flaps and trim (the MFD). */
export function drawEisStrip(ctx: CanvasRenderingContext2D, sim: Sim, r: { x: number; top: number; w: number; bottom: number }, full = false) {
  const d = sim.ac.data;
  const top = r.top;
  const W = r.w;
  cbox(ctx, r.x, top, W, r.bottom - top, '#000');
  line(ctx, r.x + W + 0.5, top, r.x + W + 0.5, r.bottom, '#4a4f55', 1);
  const x = r.x + 10;
  const w = W - 20;
  const ls = fs(13);
  const vs = fs(15);
  const e = eisReadings(sim);
  const S = EIS_SCALES;
  // a narrow strip (reversionary PFD) uses the short G1000 labels
  const narrow = W < 140;
  const gr = narrow ? 44 : Math.min(52, W * 0.34);
  gaugeArc(ctx, r.x + W / 2, top + 14 + gr, gr, finite(d.rpm), 0, 2800, [2100, 2700], 2700, 'RPM', e.rpm.text, LEVEL_COLOR[e.rpm.level]);
  // one vertical rhythm for the whole strip: 5 engine bars, fuel (header + 2 bars), electrical, flaps and trim
  const y0 = top + 28 + gr * 2.3;
  const yEnd = r.bottom - 14;
  const units = 5 + 0.7 + 1.5 + 0.35 + 1.5 + (full ? 2 : 0); // rows in units of one bar pitch
  const pitch = Math.max(ls + 26, (yEnd - y0) / units);
  let y = y0;
  const bar = (label: string, rd: EisReading, sc: { min: number; max: number; bands: readonly (readonly [number, number, string])[] }) => {
    hbar(ctx, x, y, w, label, rd.frac, rd.text, bandsOf(sc), LEVEL_COLOR[rd.level]);
    y += pitch;
  };
  bar(narrow ? 'FFLOW' : 'FFLOW GPH', e.fflow, S.fflow);
  bar(narrow ? 'OIL P' : 'OIL PRES', e.oilP, S.oilP);
  bar(narrow ? 'OIL T' : 'OIL TEMP', e.oilT, S.oilT);
  bar(narrow ? 'EGT' : 'EGT °F', e.egt, S.egt);
  bar('VAC', e.vac, S.vac);
  line(ctx, x, y - pitch * 0.3, x + w, y - pitch * 0.3, '#2c3137', 1);
  // fuel: two thin bars (L / R)
  y += pitch * 0.1;
  text(ctx, narrow ? 'FUEL GAL' : 'FUEL QTY GAL', r.x + W / 2, y, C.white, ls, 'center');
  y += pitch * 0.6;
  const fb = bandsOf(S.fuel);
  for (const rd of [e.fuelL, e.fuelR]) {
    text(ctx, rd.id === 'fuelL' ? 'L' : 'R', x, y, C.white, ls, 'left', 700);
    const bx = x + 16;
    const bw = w - 16 - tw(ctx, '26', vs, 700) - 8;
    const by = y - 3;
    cbox(ctx, bx, by, bw, 5, '#2a2f35');
    for (const [a, b, c] of fb) cbox(ctx, bx + bw * a, by, bw * (b - a), 5, c);
    const px = bx + rd.frac * bw;
    poly(ctx, [[px, by + 4], [px - 5, by + 12], [px + 5, by + 12]], C.white);
    text(ctx, rd.text, x + w, y, LEVEL_COLOR[rd.level], vs, 'right', 700);
    y += pitch * 0.75;
  }
  line(ctx, x, y - pitch * 0.15, x + w, y - pitch * 0.15, '#2c3137', 1);
  // electrical: bus volts and battery amps, digital (G1000 ENGINE page)
  y += pitch * 0.3;
  const pair = (lbl: string, a: string, ra: EisReading, b: string, rb: EisReading) => {
    text(ctx, lbl, x, y, C.gray, fs(11), 'left', 700);
    y += ls + 3;
    const half = w / 2;
    text(ctx, a, x, y, C.white, fs(11));
    text(ctx, ra.text, x + half - 4, y, LEVEL_COLOR[ra.level], vs, 'right', 700);
    text(ctx, b, x + half + 4, y, C.white, fs(11));
    text(ctx, rb.text, x + w, y, LEVEL_COLOR[rb.level], vs, 'right', 700);
    y += pitch * 0.62;
  };
  if (narrow) {
    // one value per line: main bus volts and main battery amps
    const one = (lbl: string, rd: EisReading) => {
      text(ctx, lbl, x, y, C.white, ls);
      text(ctx, rd.text, x + w, y, LEVEL_COLOR[rd.level], vs, 'right', 700);
      y += pitch * 0.6;
    };
    one('VOLTS', e.mBus);
    one('M BATT', e.mBatt);
  } else {
    pair('VOLTS', 'M', e.mBus, 'E', e.eBus);
    pair('AMPS', 'M', e.mBatt, 'S', e.sBatt);
  }
  if (!full) return;
  line(ctx, x, y - pitch * 0.25, x + w, y - pitch * 0.25, '#2c3137', 1);
  y += pitch * 0.2;
  // flaps: 0 / 10 / 20 / 30 detents
  text(ctx, 'FLAPS', x, y, C.white, ls);
  text(ctx, `${Math.round(finite(d.flapsDeg))}°`, x + w, y, C.white, vs, 'right', 700);
  const fy = y + ls / 2 + 5;
  cbox(ctx, x, fy, w, 5, '#2a2f35');
  for (const det of [0, 10, 20, 30]) line(ctx, x + (det / 30) * w, fy - 3, x + (det / 30) * w, fy + 8, '#6b7178', 1.5);
  const fpx = x + Math.max(0, Math.min(1, finite(d.flapsDeg) / 30)) * w;
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
    const obs = fp.obsMode && fp.out.valid && !!fp.wpts[fp.active];
    for (let i = 1; i < fp.wpts.length; i++) {
      if (i === fp.active && !fp.out.holding && !direct && !obs) continue;
      if (fp.wpts[i].appr === 'missed') ctx.setLineDash([8, 6]);
      strokeLeg(legs[i], C.white, 2.5);
      ctx.setLineDash([]);
    }
    if (obs) {
      // OBS: the pilot's course through the active waypoint, magenta TO it, then on past it (no sequencing)
      const to = fp.wpts[fp.active];
      const L = Math.max(30, rangeNm * 3);
      const a = xy(destination(to, fp.obsCourse + 180, L));
      const b = xy(to);
      const c = xy(destination(to, fp.obsCourse, L));
      line(ctx, a.x, a.y, b.x, b.y, C.magenta, 4);
      line(ctx, b.x, b.y, c.x, c.y, C.magenta, 2);
    } else if (fp.active > 0 && fp.active < fp.wpts.length && !fp.out.holding && !direct) {
      if (fp.wpts[fp.active].appr === 'missed') ctx.setLineDash([8, 6]);
      strokeLeg(legs[fp.active], C.magenta, 4);
      ctx.setLineDash([]);
    }
    if (direct && !obs) {
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

// ================================================================== G1000 flight-plan management (FMS)
// The FPL page cursor, the page menu, 'Remove XXXXX?' / 'Activate leg?' confirmations, the Direct-To window, the
// PROC window, Hold At Waypoint / Present Position and Insert. Driven by the FMS knob and the bezel keys
// (fmsKey) or by touch on the drawn screen (hit regions registered while drawing).

/** FMS inputs: FMS knob (outer / inner ring, push for the cursor) and the bezel keys. */
export type FmsKey = 'push' | 'outer+' | 'outer-' | 'inner+' | 'inner-' | 'ent' | 'clr' | 'menu' | 'direct' | 'proc' | 'fpl' | 'actleg';

type Hit = { x: number; y: number; w: number; h: number; run: () => void };
type MenuItem = { label: string; enabled: boolean; run: () => void };
type PickItem = { ident: string; lat: number; lon: number; kind: string; name?: string; wpt?: Waypoint };

export interface FmsUi {
  page: 'fpl' | 'direct' | 'proc';
  /** FPL cursor: the waypoint object, the approach header, the blank add row; null = no cursor */
  cursor: Waypoint | 'appr' | 'blank' | null;
  menu: { title: string; items: MenuItem[]; sel: number } | null;
  confirm: { text: string; ok: string; run: () => void; cancel?: () => void } | null;
  direct: { list: PickItem[]; nFpl: number; sel: number; field: 'ident' | 'course' | 'activate'; listOpen: boolean; course: number | null } | null;
  proc: { stage: 'menu' | 'approach' | 'transition' | 'action'; sel: number; apId: string | null; trans: string | null } | null;
  hold: { at: number | 'ppos'; ident: string; inbound: number; turn: 'R' | 'L'; legMin: number; field: number } | null;
  insert: { at: number; title: string; list: PickItem[]; sel: number } | null;
  msg: { text: string; until: number } | null;
  hits: Hit[];
  lastFlash: number | null;
}

export const newFmsUi = (): FmsUi => ({ page: 'fpl', cursor: null, menu: null, confirm: null, direct: null, proc: null, hold: null, insert: null, msg: null, hits: [], lastFlash: null });

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const say = (f: FmsUi, text: string) => (f.msg = { text, until: nowMs() + 3500 });

type FplRow = { kind: 'sec'; label: string; sec: 'enr' | 'appr' | 'missed' } | { kind: 'wpt'; i: number } | { kind: 'blank'; at: number };

/** section of a waypoint: an off-plan Direct-To fix between two approach fixes belongs to the approach */
function sectionOf(wpts: Waypoint[], i: number): 'enr' | 'appr' | 'missed' {
  const w = wpts[i];
  const s = (x: Waypoint | undefined) => (x?.appr === 'missed' ? 'missed' : x?.appr ? 'appr' : 'enr');
  if (w.appr) return s(w);
  if (w.user && wpts[i - 1]?.appr && wpts[i + 1]?.appr) return s(wpts[i + 1]);
  return 'enr';
}

/** FPL page rows: section headers, waypoints, and the blank row where a waypoint is added at the end of the route */
export function fplRows(sim: Sim): FplRow[] {
  const fp = sim.fp;
  const rows: FplRow[] = [];
  let last = '';
  let enrEnd = 0;
  fp.wpts.forEach((_w, i) => {
    const sec = sectionOf(fp.wpts, i);
    if (sec === 'enr') enrEnd = i + 1;
    if (sec !== last) {
      if (last === 'enr' || (last === '' && sec !== 'enr')) rows.push({ kind: 'blank', at: last === '' ? 0 : enrEnd });
      const label = sec === 'missed' ? 'MISSED APPROACH' : sec === 'appr' ? `${fp.approach?.airport ?? ''} ${fp.approach?.name ?? 'APPROACH'}`.trim() : 'ENROUTE';
      rows.push({ kind: 'sec', label, sec });
      last = sec;
    }
    rows.push({ kind: 'wpt', i });
  });
  if (last === 'enr' || last === '') rows.push({ kind: 'blank', at: fp.wpts.length });
  return rows;
}

const selectable = (r: FplRow) => r.kind === 'wpt' || r.kind === 'blank' || (r.kind === 'sec' && r.sec === 'appr');

function cursorRow(sim: Sim, f: FmsUi, rows = fplRows(sim)): number {
  const c = f.cursor;
  if (c === null) return -1;
  if (c === 'appr') return rows.findIndex((r) => r.kind === 'sec' && r.sec === 'appr');
  if (c === 'blank') return rows.findIndex((r) => r.kind === 'blank');
  return rows.findIndex((r) => r.kind === 'wpt' && sim.fp.wpts[r.i] === c);
}

function setCursorRow(sim: Sim, f: FmsUi, r: FplRow | undefined) {
  if (!r) return;
  f.cursor = r.kind === 'wpt' ? sim.fp.wpts[r.i] : r.kind === 'blank' ? 'blank' : 'appr';
}

function moveCursor(sim: Sim, f: FmsUi, d: number) {
  const rows = fplRows(sim);
  let k = cursorRow(sim, f, rows);
  if (k < 0) {
    k = rows.findIndex((r) => r.kind === 'wpt' && r.i === sim.fp.active);
    if (k < 0) k = rows.findIndex(selectable);
    setCursorRow(sim, f, rows[k]);
    return;
  }
  const step = d > 0 ? 1 : -1;
  for (let n = 0; n < Math.abs(d); n++) {
    let j = k + step;
    while (j >= 0 && j < rows.length && !selectable(rows[j])) j += step;
    if (j < 0 || j >= rows.length) break;
    k = j;
  }
  setCursorRow(sim, f, rows[k]);
}

/** waypoint index under the cursor (-1 when the cursor is on a header or the blank row) */
const cursorWpt = (sim: Sim, f: FmsUi) => (f.cursor && typeof f.cursor === 'object' ? sim.fp.wpts.indexOf(f.cursor) : -1);

function nearestPicks(sim: Sim, around: LatLon, n: number, exclude: Set<string>): PickItem[] {
  const out: (PickItem & { d: number })[] = [];
  const add = (ident: string, lat: number, lon: number, kind: string, name?: string) => {
    if (exclude.has(ident)) return;
    const d = distanceNm(around, { lat, lon });
    if (d > 120) return;
    out.push({ ident, lat, lon, kind, name, d });
  };
  for (const a of AIRPORTS) add(a.icao, a.lat, a.lon, 'APT', a.name);
  // localizers are not Direct-To waypoints
  for (const v of NAVAIDS) if (!/ILS|LOC|LDA/.test(v.type)) add(v.ident, v.lat, v.lon, v.type === 'VORDME' ? 'VOR/DME' : v.type, v.name);
  for (const x of FIXES) add(x.ident, x.lat, x.lon, 'INT');
  out.sort((a, b) => a.d - b.d);
  const seen = new Set<string>();
  const res: PickItem[] = [];
  for (const p of out) {
    if (seen.has(p.ident) || /^RW\d/.test(p.ident)) continue;
    seen.add(p.ident);
    res.push({ ident: p.ident, lat: p.lat, lon: p.lon, kind: p.kind, name: p.name });
    if (res.length >= n) break;
  }
  void sim;
  return res;
}

function closeAll(f: FmsUi) {
  f.menu = null;
  f.confirm = null;
  f.hold = null;
  f.insert = null;
}

// ---------------------------------------------------------------- actions
function askActivateLeg(sim: Sim, f: FmsUi, i: number) {
  const fp = sim.fp;
  if (!fp.requestActivateLeg(i)) {
    say(f, 'Select a waypoint after the first one');
    return;
  }
  const from = fp.wpts[i - 1]?.ident ?? '';
  f.confirm = {
    text: `Activate leg ${from}–${fp.wpts[i].ident}?`,
    ok: 'ACTIVATE',
    run: () => {
      const to = fp.wpts[i]?.ident;
      if (fp.activeLegConfirm(true)) say(f, `Leg to ${to} active`);
      sim.updateAvionics(0);
      f.cursor = null;
    },
    cancel: () => fp.activeLegConfirm(false),
  };
}

function askRemove(sim: Sim, f: FmsUi) {
  const fp = sim.fp;
  if (f.cursor === 'appr') {
    f.confirm = { text: 'Remove Approach?', ok: 'OK', run: () => { fp.removeApproach(); sim.updateAvionics(0); f.cursor = null; say(f, 'Approach removed'); } };
    return;
  }
  const i = cursorWpt(sim, f);
  if (i < 0) return;
  const w = fp.wpts[i];
  if (w.appr) {
    say(f, 'Procedure waypoints: remove the approach');
    return;
  }
  f.confirm = {
    text: `Remove ${w.ident}?`,
    ok: 'OK',
    run: () => {
      if (fp.removeWaypoint(i)) {
        sim.updateAvionics(0);
        // the cursor moves to the waypoint that took its place in the same section (else the blank add row)
        const nxt = fp.wpts[i];
        f.cursor = nxt && !nxt.appr ? nxt : 'blank';
        if (cursorRow(sim, f) < 0) f.cursor = null;
        say(f, `${w.ident} removed`);
      }
    },
  };
}

function openHold(sim: Sim, f: FmsUi, at: number | 'ppos') {
  const fp = sim.fp;
  closeAll(f);
  if (at === 'ppos') {
    f.hold = { at, ident: 'PRESENT POSITION', inbound: Math.round(sim.ac.data.trackTrue) % 360 || 360, turn: 'R', legMin: 1, field: 0 };
    return;
  }
  const w = fp.wpts[at];
  if (!w) return;
  const prev = fp.wpts[at - 1];
  const inbound = w.hold?.inbound ?? (prev ? bearingDeg(prev, w) : sim.ac.data.trackTrue);
  f.hold = { at, ident: w.ident, inbound: Math.round(inbound) % 360 || 360, turn: w.hold?.turn ?? 'R', legMin: w.hold?.legMin ?? 1, field: 0 };
}

function loadHold(sim: Sim, f: FmsUi) {
  const h = f.hold;
  if (!h) return;
  const spec = { inbound: h.inbound, turn: h.turn, legMin: h.legMin, kind: 'user' as const };
  const s = sim.ac.s;
  const i = sim.fp.holdAt(h.at, spec, { lat: s.lat, lon: s.lon, trackDeg: sim.ac.data.trackTrue });
  sim.updateAvionics(0);
  f.hold = null;
  f.cursor = null;
  if (i >= 0) say(f, `Hold at ${h.at === 'ppos' ? 'present position' : h.ident} loaded`);
}

function openInsert(sim: Sim, f: FmsUi) {
  const fp = sim.fp;
  let at: number;
  let title: string;
  if (f.cursor === 'blank') {
    const b = fplRows(sim).find((r) => r.kind === 'blank') as { kind: 'blank'; at: number } | undefined;
    at = b?.at ?? fp.wpts.length;
    title = 'ADD WAYPOINT';
  } else {
    at = cursorWpt(sim, f);
    if (at < 0) return;
    if (fp.wpts[at].appr && fp.wpts[at - 1]?.appr) {
      say(f, 'Procedures cannot be edited inside');
      return;
    }
    title = `INSERT BEFORE ${fp.wpts[at].ident}`;
  }
  const around = fp.wpts[at] ?? fp.wpts[at - 1] ?? sim.ac.s;
  const inPlan = new Set(fp.wpts.map((w) => w.ident));
  closeAll(f);
  f.insert = { at, title, list: nearestPicks(sim, around, 10, inPlan), sel: 0 };
}

function doInsert(sim: Sim, f: FmsUi) {
  const ins = f.insert;
  if (!ins) return;
  const p = ins.list[ins.sel];
  if (!p) return;
  const w: Waypoint = { ident: p.ident, lat: p.lat, lon: p.lon };
  if (sim.fp.insertWaypoint(ins.at, w)) {
    sim.updateAvionics(0);
    f.cursor = sim.fp.wpts[ins.at] ?? null;
    say(f, `${p.ident} inserted`);
  } else say(f, `${p.ident} cannot go there`);
  f.insert = null;
}

function openDirect(sim: Sim, f: FmsUi) {
  const fp = sim.fp;
  closeAll(f);
  const seen = new Set<string>();
  const fpl: PickItem[] = [];
  for (const w of fp.wpts) {
    if (w.ptPoint || seen.has(w.ident)) continue;
    seen.add(w.ident);
    fpl.push({ ident: w.ident, lat: w.lat, lon: w.lon, kind: 'FPL', wpt: w });
  }
  const nrst = nearestPicks(sim, sim.ac.s, 6, seen);
  const list = [...fpl, ...nrst];
  // default: the waypoint under the cursor, else the active waypoint
  const target = (f.cursor && typeof f.cursor === 'object' ? f.cursor : fp.wpts[fp.active]) ?? null;
  const sel = Math.max(0, target ? list.findIndex((p) => p.wpt === target || p.ident === target.ident) : 0);
  f.direct = { list, nFpl: fpl.length, sel, field: 'ident', listOpen: false, course: null };
  f.page = 'direct';
}

function activateDirect(sim: Sim, f: FmsUi) {
  const d = f.direct;
  if (!d) return;
  const p = d.list[d.sel];
  if (!p) return;
  const opts = d.course !== null ? { course: d.course } : {};
  if (p.wpt && sim.fp.wpts.includes(p.wpt)) sim.fp.directTo(p.wpt, sim.ac.s, opts);
  else sim.fp.directTo({ ident: p.ident, lat: p.lat, lon: p.lon }, sim.ac.s, opts);
  sim.updateAvionics(0);
  say(f, `Direct-To ${p.ident} active`);
  f.direct = null;
  f.page = 'fpl';
  f.cursor = null;
}

function procItems(sim: Sim, f: FmsUi): MenuItem[] {
  const fp = sim.fp;
  const ap = fp.approach;
  const loaded = !!ap && fp.wpts.some((w) => w.appr);
  const hasFaf = fp.wpts.some((w) => w.role === 'FAF' && w.appr === 'final');
  const firstAppr = fp.wpts.find((w) => w.appr);
  const done = (m: string) => {
    sim.updateAvionics(0);
    say(f, m);
    f.proc = null;
    f.page = 'fpl';
  };
  return [
    { label: 'Activate Vector-to-Final', enabled: loaded && hasFaf, run: () => { fp.vectorsToFinal(); done('Vectors to final active'); } },
    { label: firstAppr ? `Activate Approach (D→ ${firstAppr.ident})` : 'Activate Approach', enabled: loaded, run: () => { fp.activateApproach(sim.ac.s); done('Approach active'); } },
    { label: 'Activate Missed Approach', enabled: loaded && fp.approachActive && !fp.missedActive, run: () => { fp.activateMissed(); done('Missed approach active'); } },
    { label: 'Select Approach', enabled: true, run: () => { if (f.proc) Object.assign(f.proc, { stage: 'approach', sel: 0 }); } },
  ];
}

/** approaches, the destination airport first (then the airport nearest the aircraft) */
function approachList(sim: Sim): Approach[] {
  const dest = sim.fp.approach?.airport;
  const s = sim.ac.s;
  const dist = (ap: Approach) => {
    const a = AIRPORTS.find((x) => x.icao === ap.airport);
    return ap.airport === dest ? -1 : a ? distanceNm(s, a) : 9999;
  };
  return [...APPROACHES].sort((a, b) => dist(a) - dist(b) || a.airport.localeCompare(b.airport) || a.name.localeCompare(b.name));
}

function procTransitions(apId: string | null): string[] {
  const ap = apId ? APPROACHES.find((a) => a.id === apId) : undefined;
  return ap ? ['VECTORS', ...ap.transitions.map((t) => t.name)] : [];
}

function procAction(sim: Sim, f: FmsUi, activate: boolean) {
  const p = f.proc;
  if (!p?.apId) return;
  const vectors = p.trans === 'VECTORS' || p.trans === null;
  sim.loadApproach(p.apId, vectors ? null : p.trans, activate ? (vectors ? 'vtf' : 'activate') : 'load');
  sim.updateAvionics(0);
  const ap = sim.fp.approach;
  say(f, `${ap ? ap.airport + ' ' + ap.name : 'Approach'} ${activate ? (vectors ? '— vectors to final' : 'activated') : 'loaded'}`);
  f.proc = null;
  f.page = 'fpl';
}

function fplMenu(sim: Sim, f: FmsUi): FmsUi['menu'] {
  const fp = sim.fp;
  const i = cursorWpt(sim, f);
  const w = i >= 0 ? fp.wpts[i] : null;
  const direct = fp.out.valid && fp.out.fromIdent === 'DCT';
  const items: MenuItem[] = [
    { label: 'Activate Leg', enabled: i > 0, run: () => askActivateLeg(sim, f, i) },
    { label: 'Hold At Waypoint', enabled: !!w, run: () => openHold(sim, f, i) },
    { label: 'Hold At Present Position', enabled: fp.out.valid && !sim.ac.s.onGround, run: () => openHold(sim, f, 'ppos') },
    { label: 'Insert Waypoint', enabled: f.cursor === 'blank' || (!!w && !(w.appr && fp.wpts[i - 1]?.appr)), run: () => openInsert(sim, f) },
    { label: 'Remove Approach', enabled: !!fp.approachId && fp.wpts.some((x) => x.appr), run: () => { f.cursor = 'appr'; askRemove(sim, f); } },
    { label: 'Cancel Direct-To', enabled: direct, run: () => { fp.cancelDirect(); sim.updateAvionics(0); say(f, 'Direct-To cancelled'); } },
  ];
  const sel = Math.max(0, items.findIndex((x) => x.enabled));
  return { title: 'PAGE MENU', items, sel };
}

const stepEnabled = (items: { enabled: boolean }[], sel: number, d: number) => {
  let j = sel;
  for (let n = 0; n < items.length; n++) {
    j = (j + (d > 0 ? 1 : -1) + items.length) % items.length;
    if (items[j].enabled) return j;
  }
  return sel;
};

/** One FMS input (knob detent, knob push, bezel key). Returns true when it was used. */
export function fmsKey(sim: Sim, st: MfdState, key: FmsKey): boolean {
  const f = st.fms;
  const fp = sim.fp;
  const d = key.endsWith('+') ? 1 : key.endsWith('-') ? -1 : 0;
  const turn = key.startsWith('outer') || key.startsWith('inner');
  // global keys
  if (key === 'direct') {
    openDirect(sim, f);
    return true;
  }
  if (key === 'proc') {
    closeAll(f);
    f.page = 'proc';
    f.proc = { stage: 'menu', sel: 0, apId: null, trans: null };
    const it = procItems(sim, f);
    // default cursor: Activate Approach while it is only loaded; once active, the harmless Select Approach (an ENT
    // pressed by habit must never drop the transition or start the missed approach)
    const want = fp.approachActive ? 3 : 1;
    f.proc.sel = it[want]?.enabled ? want : Math.max(0, it.findIndex((x) => x.enabled));
    return true;
  }
  if (key === 'fpl') {
    closeAll(f);
    f.page = 'fpl';
    f.direct = null;
    f.proc = null;
    return true;
  }
  // confirmation window: ENT = OK, CLR = cancel
  if (f.confirm) {
    const c = f.confirm;
    if (key === 'ent') {
      f.confirm = null;
      c.run();
    } else if (key === 'clr' || key === 'menu') {
      f.confirm = null;
      c.cancel?.();
    }
    return true;
  }
  if (f.menu) {
    const m = f.menu;
    if (turn) m.sel = stepEnabled(m.items, m.sel, d);
    else if (key === 'ent') {
      f.menu = null;
      if (m.items[m.sel]?.enabled) m.items[m.sel].run();
    } else if (key === 'clr' || key === 'menu') f.menu = null;
    return true;
  }
  if (f.hold) {
    const h = f.hold;
    if (key === 'outer+' || key === 'outer-') h.field = Math.max(0, Math.min(3, h.field + d));
    else if (key === 'inner+' || key === 'inner-') holdAdjust(h, d);
    else if (key === 'ent') {
      if (h.field < 3) h.field++;
      else loadHold(sim, f);
    } else if (key === 'clr') f.hold = null;
    return true;
  }
  if (f.insert) {
    const ins = f.insert;
    if (turn) ins.sel = Math.max(0, Math.min(ins.list.length - 1, ins.sel + d));
    else if (key === 'ent') doInsert(sim, f);
    else if (key === 'clr') f.insert = null;
    return true;
  }
  if (f.page === 'direct' && f.direct) {
    const dr = f.direct;
    if (key === 'outer+' || key === 'outer-') {
      if (dr.listOpen) dr.sel = Math.max(0, Math.min(dr.list.length - 1, dr.sel + d));
      else {
        const order = ['ident', 'course', 'activate'] as const;
        dr.field = order[Math.max(0, Math.min(2, order.indexOf(dr.field) + d))];
      }
    } else if (key === 'inner+' || key === 'inner-') {
      if (dr.field === 'course') {
        const p = dr.list[dr.sel];
        const base = dr.course ?? (p ? Math.round(bearingDeg(sim.ac.s, p)) : 360);
        dr.course = ((base + d - 1 + 360) % 360) + 1;
      } else {
        dr.field = 'ident';
        if (!dr.listOpen) dr.listOpen = true;
        else dr.sel = Math.max(0, Math.min(dr.list.length - 1, dr.sel + d));
      }
    } else if (key === 'ent') {
      if (dr.field === 'activate') activateDirect(sim, f);
      else {
        dr.listOpen = false;
        dr.field = 'activate';
      }
    } else if (key === 'clr') {
      if (dr.listOpen) dr.listOpen = false;
      else if (dr.course !== null && dr.field === 'course') dr.course = null;
      else {
        f.direct = null;
        f.page = 'fpl';
      }
    } else if (key === 'menu') {
      const items: MenuItem[] = [{ label: 'Cancel Direct-To NAV', enabled: fp.out.valid && fp.out.fromIdent === 'DCT', run: () => { fp.cancelDirect(); sim.updateAvionics(0); f.direct = null; f.page = 'fpl'; say(f, 'Direct-To cancelled'); } }];
      f.menu = { title: 'PAGE MENU', items, sel: 0 };
    }
    return true;
  }
  if (f.page === 'proc' && f.proc) {
    const p = f.proc;
    if (p.stage === 'menu') {
      const items = procItems(sim, f);
      if (turn) p.sel = stepEnabled(items, p.sel, d);
      else if (key === 'ent' && items[p.sel]?.enabled) items[p.sel].run();
      else if (key === 'clr') {
        f.proc = null;
        f.page = 'fpl';
      }
    } else if (p.stage === 'approach') {
      const list = approachList(sim);
      if (turn) p.sel = Math.max(0, Math.min(list.length - 1, p.sel + d));
      else if (key === 'ent' && list[p.sel]) Object.assign(p, { apId: list[p.sel].id, stage: 'transition', sel: 0 });
      else if (key === 'clr') Object.assign(p, { stage: 'menu', sel: 0 });
    } else if (p.stage === 'transition') {
      const list = procTransitions(p.apId);
      if (turn) p.sel = Math.max(0, Math.min(list.length - 1, p.sel + d));
      else if (key === 'ent') Object.assign(p, { trans: list[p.sel] ?? 'VECTORS', stage: 'action', sel: 1 });
      else if (key === 'clr') Object.assign(p, { stage: 'approach', sel: 0 });
    } else {
      if (turn) p.sel = p.sel === 0 ? 1 : 0;
      else if (key === 'ent') procAction(sim, f, p.sel === 1);
      else if (key === 'clr') Object.assign(p, { stage: 'transition', sel: 0 });
    }
    return true;
  }
  // FPL page
  if (key === 'push') {
    if (f.cursor !== null) f.cursor = null;
    else moveCursor(sim, f, 0);
    return true;
  }
  if (key === 'outer+' || key === 'outer-') {
    moveCursor(sim, f, f.cursor === null ? 0 : d);
    return true;
  }
  if (key === 'inner+' || key === 'inner-') {
    if (f.cursor === null) moveCursor(sim, f, 0);
    else openInsert(sim, f);
    return true;
  }
  if (key === 'menu') {
    f.menu = fplMenu(sim, f);
    return true;
  }
  if (key === 'actleg') {
    const i = cursorWpt(sim, f);
    if (i > 0) askActivateLeg(sim, f, i);
    else say(f, 'Push FMS, select the leg end waypoint');
    return true;
  }
  if (key === 'clr') {
    if (f.cursor !== null) askRemove(sim, f);
    else return false;
    return true;
  }
  return false;
}

function holdAdjust(h: NonNullable<FmsUi['hold']>, d: number) {
  if (h.field === 0) h.inbound = ((h.inbound + d - 1 + 360) % 360) + 1;
  else if (h.field === 1) h.turn = h.turn === 'R' ? 'L' : 'R';
  else if (h.field === 2) h.legMin = Math.max(0.5, Math.min(5, Math.round((h.legMin + d * 0.5) * 10) / 10));
}

/** What the FMS shows (for tests, the remote companion and grading): page, cursor, windows. */
export function fmsView(sim: Sim, st: MfdState) {
  const f = st.fms;
  return {
    page: f.page,
    cursor: f.cursor && typeof f.cursor === 'object' ? sim.fp.wpts.indexOf(f.cursor) : null,
    cursorOn: f.cursor,
    menu: f.menu ? { items: f.menu.items.map((i) => i.label), sel: f.menu.sel } : null,
    confirm: f.confirm ? { text: f.confirm.text } : null,
    direct: f.direct ? { fpl: f.direct.list.slice(0, f.direct.nFpl).map((p) => p.ident), nearest: f.direct.list.slice(f.direct.nFpl).map((p) => p.ident), sel: f.direct.sel, field: f.direct.field } : null,
    proc: f.proc ? { stage: f.proc.stage, sel: f.proc.sel, items: procItems(sim, f).map((i) => ({ label: i.label.startsWith('Activate Approach') ? 'Activate Approach' : i.label, enabled: i.enabled })) } : null,
    hold: f.hold ? { ...f.hold } : null,
    insert: f.insert ? { title: f.insert.title, list: f.insert.list.map((p) => p.ident), sel: f.insert.sel } : null,
    msg: f.msg && f.msg.until > nowMs() ? f.msg.text : null,
  };
}

// ---------------------------------------------------------------- touch
const mfdBound = new WeakMap<HTMLCanvasElement, { st: MfdState; sim: Sim }>();
/** Taps on the drawn FPL rows, windows and buttons run the hit region drawn under the finger (softkeys stay with
 *  the shell's own handler). */
function bindMfdPointer(canvas: HTMLCanvasElement | null | undefined, st: MfdState, sim: Sim) {
  if (!canvas || typeof canvas.addEventListener !== 'function') return;
  const b = mfdBound.get(canvas);
  if (b) {
    b.st = st;
    b.sim = sim;
    return;
  }
  const ref = { st, sim };
  mfdBound.set(canvas, ref);
  // automation hook (screenshots, the remote companion): the same inputs as the FMS knob and bezel keys
  (canvas as HTMLCanvasElement & { ifrFms?: unknown }).ifrFms = { key: (k: FmsKey) => fmsKey(ref.sim, ref.st, k), view: () => fmsView(ref.sim, ref.st) };
  canvas.addEventListener('click', (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = ((e.clientX - r.left) / r.width) * MFD_W;
    const y = ((e.clientY - r.top) / r.height) * MFD_H;
    if (y >= SOFT_Y) return;
    const hits = ref.st.fms.hits;
    for (let k = hits.length - 1; k >= 0; k--) {
      const h = hits[k];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) {
        h.run();
        e.stopPropagation();
        return;
      }
    }
  });
}

// ---------------------------------------------------------------- drawing
const WIN_BG = '#05080c';
const WIN_EDGE = '#5f656b';
const DIM = '#5d636a';

function hit(f: FmsUi, x: number, y: number, w: number, h: number, run: () => void) {
  f.hits.push({ x, y, w, h, run });
}

/** G1000 cursor: the selected field is drawn inverse (black on cyan) */
function field(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, w: number, h: number, on: boolean, size: number, color = C.white, align: CanvasTextAlign = 'left') {
  if (on) cbox(ctx, x, y - h / 2, w, h, C.cyan);
  const tx = align === 'left' ? x + 6 : align === 'right' ? x + w - 6 : x + w / 2;
  text(ctx, s, tx, y + 1, on ? '#000' : color, size, align, 700);
}

function button(ctx: CanvasRenderingContext2D, f: FmsUi, label: string, x: number, y: number, w: number, h: number, on: boolean, enabled: boolean, run: () => void) {
  cbox(ctx, x, y, w, h, on ? C.cyan : '#11171e', enabled ? '#6b7178' : '#2c3137');
  const size = Math.min(fs(14), fs(14) * ((w - 10) / Math.max(1, tw(ctx, label, fs(14), 700))));
  text(ctx, label, x + w / 2, y + h / 2 + 1, on ? '#000' : enabled ? C.white : DIM, size, 'center', 700);
  if (enabled) hit(f, x, y, w, h, run);
}

function windowFrame(ctx: CanvasRenderingContext2D, f: FmsUi, title: string, x: number, y: number, w: number, h: number) {
  // the whole window swallows taps (nothing under it runs)
  hit(f, x, y, w, h, () => undefined);
  cbox(ctx, x, y, w, h, WIN_BG, WIN_EDGE);
  cbox(ctx, x + 1, y + 1, w - 2, TITLE_H + 4, '#000');
  text(ctx, title, x + w / 2, y + TITLE_H / 2 + 3, C.white, fs(14), 'center', 700);
  line(ctx, x + 1, y + TITLE_H + 5.5, x + w - 1, y + TITLE_H + 5.5, '#2c3137', 1);
  return y + TITLE_H + 6;
}

function drawFpl(ctx: CanvasRenderingContext2D, sim: Sim, st: MfdState, r: { x: number; y: number; w: number; h: number }) {
  const f = st.fms;
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
  const cols = { id: r.x + 22, dtk: r.x + 170, dis: r.x + 232, alt: r.x + 296 };
  let y = r.y + TITLE_H + 38;
  const ch = fs(12);
  text(ctx, 'WPT', cols.id, y, C.gray, ch);
  text(ctx, 'DTK', cols.dtk, y, C.gray, ch, 'right');
  text(ctx, 'DIS', cols.dis, y, C.gray, ch, 'right');
  text(ctx, 'ALT', cols.alt, y, C.gray, ch, 'right');
  line(ctx, r.x + 8, y + 10, r.x + r.w - 8, y + 10, '#3a4048', 1);
  y += 26;
  const rows = fplRows(sim);
  const cur = cursorRow(sim, f, rows);
  if (f.cursor !== null && cur < 0) f.cursor = null; // the row went away (sequenced off, removed)
  const rowH = Math.max(26, fs(16) + 10);
  const cursorOn = f.cursor !== null && f.page === 'fpl';
  const liveMsg = f.msg && f.msg.until > nowMs() ? f.msg.text : null;
  const footerH = cursorOn ? 2 * 40 + 22 + (liveMsg ? fs(13) + 8 : 0) : fs(14) * 2 + 26;
  const maxRows = Math.max(1, Math.floor((r.y + r.h - footerH - 6 - y + rowH / 2) / rowH));
  const focus = cursorOn ? cur : rows.findIndex((q) => q.kind === 'wpt' && q.i === fp.active);
  let start = 0;
  if (rows.length > maxRows && focus >= 0) start = Math.max(0, Math.min(rows.length - maxRows, focus - 2));
  const ids = fs(16);
  const nums = fs(15);
  // hold glyph column: just left of the widest DTK value, so it never touches it at any text scale
  const holdX = cols.dtk - tw(ctx, '000°', nums, 600) - 12;
  const rowY = new Map<number, number>();
  for (let k = start; k < Math.min(rows.length, start + maxRows); k++) {
    const row = rows[k];
    const ry = y + (k - start) * rowH;
    const sel = cursorOn && k === cur;
    // a tap on a selectable row puts the cursor on it (a second tap on the same row clears it)
    if (selectable(row) && f.page === 'fpl')
      hit(f, r.x + 2, ry - rowH / 2, r.w - 4, rowH, () => {
        if (sel) f.cursor = null;
        else setCursorRow(sim, f, row);
      });
    if (row.kind === 'sec') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(r.x + 8, ry - rowH / 2, r.w - 16, rowH);
      ctx.clip();
      const lw = Math.min(r.w - 22, tw(ctx, row.label, fs(13), 700) + 10);
      if (sel) cbox(ctx, r.x + 8, ry - rowH / 2 + 3, lw, rowH - 6, C.cyan);
      text(ctx, row.label, r.x + 12, ry, sel ? '#000' : '#c9ced3', fs(13), 'left', 700);
      ctx.restore();
      continue;
    }
    if (row.kind === 'blank') {
      const bw = tw(ctx, '_____', ids, 700) + 12;
      if (sel) cbox(ctx, cols.id - 6, ry - rowH / 2 + 3, bw, rowH - 6, C.cyan);
      text(ctx, '_____', cols.id, ry - 2, sel ? '#000' : '#6b7178', ids, 'left', 700);
      continue;
    }
    const i = row.i;
    const w = fp.wpts[i];
    const active = i === fp.active;
    const pending = fp.pendingLeg === i;
    const prev = i > 0 ? fp.wpts[i - 1] : null;
    // the active leg reads the desired track and the distance to go from the present position (G1000 FPL page)
    const live = active && fp.out.valid;
    const dtk = live ? fp.out.dtk : prev ? bearingDeg(prev, w) : null;
    const dis = live ? fp.out.distNm : prev ? distanceNm(prev, w) : null;
    rowY.set(i, ry);
    if (active) poly(ctx, [[r.x + 9, ry - 6], [r.x + 17, ry], [r.x + 9, ry + 6]], C.magenta);
    const col = active ? C.magenta : C.white;
    // ident cell (clipped) + role suffix in grey; the cursor is an inverse cyan box on the ident
    const idW = tw(ctx, w.ident, ids, 700);
    ctx.save();
    ctx.beginPath();
    ctx.rect(cols.id - 6, ry - rowH / 2, holdX - 3 - cols.id, rowH);
    ctx.clip();
    if (sel || pending) cbox(ctx, cols.id - 5, ry - rowH / 2 + 3, idW + 10, rowH - 6, sel ? C.cyan : 'transparent', pending ? C.cyan : undefined);
    text(ctx, w.ident, cols.id, ry, sel ? '#000' : col, ids, 'left', 700);
    const suf = w.role ? ROLE_SUFFIX[w.role] : undefined;
    if (suf) text(ctx, suf, cols.id + idW + 10, ry + 1, '#8a9097', fs(12));
    ctx.restore();
    if (w.hold) holdGlyph(ctx, holdX, ry, w.hold.kind === 'user' ? C.cyan : col);
    if (dtk !== null) text(ctx, `${pad3(dtk)}°`, cols.dtk, ry, col, nums, 'right');
    if (dis !== null) text(ctx, dis.toFixed(1), cols.dis, ry, col, nums, 'right');
    if (w.altMin) {
      // at-or-above constraint: cyan with a bar underneath (G1000 convention)
      text(ctx, `${w.altMin}`, cols.alt, ry, C.cyan, nums, 'right');
      const aw = tw(ctx, `${w.altMin}`, nums);
      line(ctx, cols.alt - aw, ry + nums / 2 + 2, cols.alt, ry + nums / 2 + 2, C.cyan, 1.5);
    }
  }
  // G1000 active-leg arrow: a magenta bracket from the FROM waypoint down to the TO waypoint (not on a Direct-To)
  const yTo = rowY.get(fp.active);
  const yFrom = rowY.get(fp.active - 1);
  if (yTo !== undefined && yFrom !== undefined && fp.out.valid && fp.out.fromIdent !== 'DCT') {
    ctx.save();
    ctx.strokeStyle = C.magenta;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(r.x + 15, yFrom);
    ctx.lineTo(r.x + 5, yFrom);
    ctx.lineTo(r.x + 5, yTo);
    ctx.lineTo(r.x + 10, yTo);
    ctx.stroke();
    ctx.restore();
  }
  // scroll hints
  if (start > 0) poly(ctx, [[r.x + r.w - 14, y - 16], [r.x + r.w - 20, y - 8], [r.x + r.w - 8, y - 8]], C.gray);
  if (start + maxRows < rows.length) {
    const yb = y + maxRows * rowH - rowH / 2 + 2;
    poly(ctx, [[r.x + r.w - 14, yb + 8], [r.x + r.w - 20, yb], [r.x + r.w - 8, yb]], C.gray);
  }
  // footer: waypoint options while the cursor is shown, the plan status otherwise
  const o = fp.out;
  const fy = r.y + r.h - footerH;
  cbox(ctx, r.x + 1, fy, r.w - 1, footerH, '#0b1118');
  line(ctx, r.x + 1, fy + 0.5, r.x + r.w, fy + 0.5, '#2c3137', 1);
  const fsz = fs(14);
  if (cursorOn) {
    const i = cursorWpt(sim, f);
    const w = i >= 0 ? fp.wpts[i] : null;
    const inProc = !!w && !!w.appr && !!fp.wpts[i - 1]?.appr;
    const bw = (r.w - 8 * 2 - 6 * 2) / 3;
    const bh = 38;
    const bx = (k: number) => r.x + 8 + k * (bw + 6);
    if (liveMsg) text(ctx, liveMsg, r.x + 12, fy + 6 + fs(13) / 2, C.cyan, fs(13));
    const y1 = fy + 8 + (liveMsg ? fs(13) + 8 : 0);
    const y2 = y1 + bh + 6;
    if (f.cursor === 'appr') {
      // approach header: the procedure actions (PROC window), then remove the whole approach
      const hasFaf = fp.wpts.some((x) => x.role === 'FAF' && x.appr === 'final');
      button(ctx, f, 'PROC', bx(0), y1, bw, bh, false, true, () => fmsKey(sim, st, 'proc'));
      button(ctx, f, 'VTF', bx(1), y1, bw, bh, false, hasFaf, () => { fp.vectorsToFinal(); sim.updateAvionics(0); say(f, 'Vectors to final active'); f.cursor = null; });
      button(ctx, f, 'ACTIVATE', bx(2), y1, bw, bh, false, true, () => { fp.activateApproach(sim.ac.s); sim.updateAvionics(0); say(f, 'Approach active'); f.cursor = null; });
    } else {
      button(ctx, f, 'ACT LEG', bx(0), y1, bw, bh, false, i > 0, () => askActivateLeg(sim, f, i));
      button(ctx, f, 'D→', bx(1), y1, bw, bh, false, !!w, () => openDirect(sim, f));
      button(ctx, f, 'HOLD', bx(2), y1, bw, bh, false, !!w, () => openHold(sim, f, i));
    }
    button(ctx, f, 'INSERT', bx(0), y2, bw, bh, false, f.cursor === 'blank' || (!!w && !inProc), () => openInsert(sim, f));
    button(ctx, f, 'REMOVE', bx(1), y2, bw, bh, false, f.cursor === 'appr' || (!!w && !w.appr), () => askRemove(sim, f));
    button(ctx, f, 'MENU', bx(2), y2, bw, bh, false, true, () => fmsKey(sim, st, 'menu'));
  } else {
    const status = fp.approachActive ? (fp.missedActive ? 'MISSED APPROACH ACTIVE' : fp.vtf ? 'VECTORS TO FINAL' : 'APPROACH ACTIVE') : fp.approachId ? 'APPROACH LOADED' : 'ENROUTE';
    text(ctx, status, r.x + 14, fy + 10 + fsz / 2, fp.approachActive ? C.green : C.white, fsz, 'left', 700);
    if (liveMsg) text(ctx, liveMsg, r.x + 14, fy + 16 + fsz * 1.5, C.cyan, fsz);
    else if (o.valid) {
      const susp = o.suspended ? `  ${o.obs ? '' : 'SUSP'}` : o.obs ? '  OBS' : '';
      text(ctx, `GPS ${o.phaseLabel}  ±${o.fullScaleNm.toFixed(o.fullScaleNm < 1 ? 2 : 1)}NM${susp}`, r.x + 14, fy + 16 + fsz * 1.5, C.magenta, fsz);
    }
  }
}

/** pop-up windows: page menu, confirmations, Direct-To, PROC, hold, insert (drawn over the map and FPL pane) */
function drawFmsWindows(ctx: CanvasRenderingContext2D, sim: Sim, st: MfdState, fplShown: boolean) {
  const f = st.fms;
  const fp = sim.fp;
  const W = 392;
  // over the right part of the map, next to the flight plan (which stays readable while it is edited)
  const X = (fplShown ? FPL_X : MFD_W) - 10 - W;
  const top = 54 + TITLE_H + 8;
  const rowH = Math.max(30, fs(15) + 14);
  const s15 = fs(15);
  const s13 = fs(13);
  const listRows = (items: { label: string; sub?: string; enabled: boolean }[], sel: number, y0: number, maxN: number, onPick: (k: number) => void) => {
    const start = Math.max(0, Math.min(items.length - maxN, sel - Math.floor(maxN / 2)));
    for (let k = start; k < Math.min(items.length, start + maxN); k++) {
      const it = items[k];
      const ry = y0 + (k - start) * rowH + rowH / 2;
      const on = k === sel;
      field(ctx, it.label, X + 10, ry, W - 20, rowH - 4, on, s15, it.enabled ? C.white : DIM);
      if (it.sub) text(ctx, it.sub, X + W - 16, ry + 1, on ? '#000' : C.gray, s13, 'right');
      if (it.enabled) hit(f, X + 6, ry - rowH / 2, W - 12, rowH, () => onPick(k));
    }
    if (start > 0) poly(ctx, [[X + W - 10, y0 - 2], [X + W - 15, y0 + 5], [X + W - 5, y0 + 5]], C.gray);
    if (start + maxN < items.length) {
      const yb = y0 + maxN * rowH;
      poly(ctx, [[X + W - 10, yb + 2], [X + W - 15, yb - 5], [X + W - 5, yb - 5]], C.gray);
    }
    return y0 + Math.min(items.length, maxN) * rowH;
  };

  if (f.page === 'direct' && f.direct) {
    const dr = f.direct;
    const p = dr.list[dr.sel];
    // the window fits its content: the FLIGHT PLAN and NEAREST groups under the fields, scrolled when too long
    type DRow = { head: string } | { k: number };
    const drows: DRow[] = [];
    dr.list.forEach((_, k) => {
      if (k === 0 && dr.nFpl > 0) drows.push({ head: 'FLIGHT PLAN' });
      if (k === dr.nFpl) drows.push({ head: 'NEAREST' });
      drows.push({ k });
    });
    const fieldsH = 6 + 8 + (rowH + 4) + (rowH - 4) + (rowH + 8) + 38 + 12;
    const maxH = SOFT_Y - 10 - top;
    const h = Math.min(maxH, fieldsH + drows.length * rowH + 10);
    let y = windowFrame(ctx, f, 'DIRECT TO', X, top, W, h) + 8;
    // ident field + bearing / distance / course
    text(ctx, 'IDENT', X + 14, y + 12, C.gray, s13);
    field(ctx, p?.ident ?? '_____', X + 80, y + 12, 140, rowH - 4, dr.field === 'ident' && !dr.listOpen, fs(18), C.cyan);
    hit(f, X + 80, y + 12 - rowH / 2, 140, rowH, () => { dr.field = 'ident'; dr.listOpen = !dr.listOpen; });
    const nav = p ? NAVAIDS.find((v) => v.ident === p.ident) ?? null : null;
    const apt = p ? AIRPORTS.find((a) => a.icao === p.ident) ?? null : null;
    const what = p ? (p.wpt ? 'FLIGHT PLAN' : p.kind) : '';
    const name = p?.name ?? nav?.name ?? apt?.name ?? '';
    text(ctx, what, X + W - 14, y + 4, C.gray, s13, 'right');
    if (name) text(ctx, name.toUpperCase(), X + W - 14, y + 4 + s13 + 4, C.white, s13, 'right');
    y += rowH + 4;
    if (p) {
      const brg = bearingDeg(sim.ac.s, p);
      const dis = distanceNm(sim.ac.s, p);
      text(ctx, `BRG ${pad3(brg)}°    DIS ${dis.toFixed(dis < 100 ? 1 : 0)}NM`, X + 14, y + 6, C.white, s15);
    }
    y += rowH - 4;
    text(ctx, 'COURSE', X + 14, y + 12, C.gray, s13);
    const crs = dr.course ?? (p ? Math.round(bearingDeg(sim.ac.s, p)) : null);
    field(ctx, crs !== null ? `${pad3(crs)}°` : '___°', X + 80, y + 12, 90, rowH - 4, dr.field === 'course', fs(18), dr.course !== null ? C.cyan : C.white);
    hit(f, X + 80, y + 12 - rowH / 2, 90, rowH, () => (dr.field = 'course'));
    const nudge = (dd: number) => {
      dr.field = 'course';
      const base = dr.course ?? (crs ?? 360);
      dr.course = ((base + dd - 1 + 3600) % 360) + 1;
    };
    button(ctx, f, '−5°', X + W - 14 - 2 * 58 - 6, y + 12 - (rowH - 4) / 2, 58, rowH - 4, false, true, () => nudge(-5));
    button(ctx, f, '+5°', X + W - 14 - 58, y + 12 - (rowH - 4) / 2, 58, rowH - 4, false, true, () => nudge(5));
    y += rowH + 8;
    button(ctx, f, 'ACTIVATE?', X + 14, y, W - 28, 38, dr.field === 'activate', !!p, () => activateDirect(sim, f));
    y += 38 + 12;
    line(ctx, X + 8, y - 4.5, X + W - 8, y - 4.5, '#2c3137', 1);
    // one cursor at a time: the list row is filled while the knob scrolls the list, outlined otherwise
    const maxN = Math.max(1, Math.floor((top + h - 8 - y) / rowH));
    const selRow = drows.findIndex((r) => 'k' in r && r.k === dr.sel);
    const start = Math.max(0, Math.min(drows.length - maxN, selRow - Math.floor(maxN / 2)));
    for (let j = start; j < Math.min(drows.length, start + maxN); j++) {
      const r = drows[j];
      const ry = y + (j - start) * rowH + rowH / 2;
      if ('head' in r) {
        text(ctx, r.head, X + 16, ry + 2, C.gray, s13, 'left', 700);
        continue;
      }
      const q = dr.list[r.k];
      const on = r.k === dr.sel;
      if (on && !dr.listOpen) cbox(ctx, X + 10, ry - (rowH - 4) / 2, W - 20, rowH - 4, 'transparent', C.cyan);
      field(ctx, q.ident, X + 10, ry, W - 20, rowH - 4, on && dr.listOpen, s15, on ? C.cyan : C.white);
      const sub = r.k < dr.nFpl ? (q.wpt?.role ? q.wpt.role : '') : q.kind;
      if (sub) text(ctx, sub, X + W - 16, ry + 1, on && dr.listOpen ? '#000' : C.gray, s13, 'right');
      hit(f, X + 6, ry - rowH / 2, W - 12, rowH, () => { dr.sel = r.k; dr.course = null; dr.listOpen = false; dr.field = 'activate'; });
    }
    if (start > 0) poly(ctx, [[X + W - 10, y - 2], [X + W - 15, y + 5], [X + W - 5, y + 5]], C.gray);
    if (start + maxN < drows.length) {
      const yb = y + maxN * rowH;
      poly(ctx, [[X + W - 10, yb + 2], [X + W - 15, yb - 5], [X + W - 5, yb - 5]], C.gray);
    }
  }

  if (f.page === 'proc' && f.proc) {
    const p = f.proc;
    if (p.stage === 'menu') {
      const items = procItems(sim, f);
      const ap = fp.approach;
      const h = TITLE_H + 6 + 8 + items.length * rowH + (ap ? 24 + rowH * 0.75 + s13 + 6 : 0) + 12;
      let y = windowFrame(ctx, f, 'PROCEDURES', X, top, W, h) + 8;
      y = listRows(items.map((i) => ({ label: i.label.toUpperCase(), enabled: i.enabled })), p.sel, y, items.length, (k) => { p.sel = k; items[k].run(); });
      if (ap) {
        line(ctx, X + 8, y + 6.5, X + W - 8, y + 6.5, '#2c3137', 1);
        text(ctx, 'LOADED', X + 14, y + 22, C.gray, s13);
        text(ctx, `${ap.airport} ${ap.name}`, X + 80, y + 22, C.white, s15, 'left', 700);
        const tr = fp.wpts.find((w) => w.appr === 'trans' && w.role === 'IAF')?.ident ?? (fp.vtf ? 'VECTORS' : '');
        text(ctx, `${tr ? tr + ' · ' : ''}${fp.approachActive ? (fp.missedActive ? 'MISSED ACTIVE' : 'ACTIVE') : 'NOT ACTIVE'}`, X + 80, y + 22 + rowH * 0.75, fp.approachActive ? C.green : C.gray, s13);
      }
    } else if (p.stage === 'approach') {
      const list = approachList(sim);
      const n = Math.min(list.length, 12);
      const h = TITLE_H + 6 + 16 + n * rowH + 12;
      const y = windowFrame(ctx, f, 'SELECT APPROACH', X, top, W, h) + 8;
      listRows(list.map((a) => ({ label: `${a.airport}  ${a.name}`, enabled: true })), p.sel, y, n, (k) => Object.assign(p, { apId: list[k].id, stage: 'transition', sel: 0 }));
    } else if (p.stage === 'transition') {
      const list = procTransitions(p.apId);
      const ap = APPROACHES.find((a) => a.id === p.apId);
      const h = TITLE_H + 6 + 16 + rowH + list.length * rowH + 12;
      let y = windowFrame(ctx, f, 'TRANSITION', X, top, W, h) + 8;
      text(ctx, ap ? `${ap.airport} ${ap.name}` : '', X + 14, y + rowH / 2, C.cyan, s15, 'left', 700);
      y += rowH;
      listRows(list.map((t) => ({ label: t, enabled: true })), p.sel, y, list.length, (k) => Object.assign(p, { trans: list[k], stage: 'action', sel: 1 }));
    } else {
      const ap = APPROACHES.find((a) => a.id === p.apId);
      const loc = isLocApproach(ap);
      const h = TITLE_H + 6 + 16 + rowH * 3 + (loc ? rowH : 0) + 54;
      let y = windowFrame(ctx, f, 'LOAD APPROACH', X, top, W, h) + 8;
      text(ctx, ap ? `${ap.airport} ${ap.name}` : '', X + 14, y + rowH / 2, C.cyan, s15, 'left', 700);
      y += rowH;
      text(ctx, 'TRANS', X + 14, y + rowH / 2, C.gray, s13);
      text(ctx, p.trans ?? 'VECTORS', X + 80, y + rowH / 2, C.white, s15, 'left', 700);
      y += rowH;
      const m = ap?.minimums[0];
      text(ctx, 'MINS', X + 14, y + rowH / 2, C.gray, s13);
      text(ctx, m ? `BARO ${m.da ?? m.mda}FT  ${m.label}` : '—', X + 80, y + rowH / 2, C.cyan, s15, 'left', 700);
      y += rowH;
      if (loc) {
        text(ctx, 'NOT APPROVED FOR GPS', X + W / 2, y + rowH / 2, C.yellow, s13, 'center', 700);
        y += rowH;
      }
      const bw = (W - 28 - 10) / 2;
      button(ctx, f, 'LOAD?', X + 14, y + 6, bw, 38, p.sel === 0, true, () => procAction(sim, f, false));
      button(ctx, f, p.trans === 'VECTORS' ? 'ACTIVATE VTF?' : 'ACTIVATE?', X + 24 + bw, y + 6, bw, 38, p.sel === 1, true, () => procAction(sim, f, true));
    }
  }

  if (f.hold) {
    const hd = f.hold;
    const h = TITLE_H + 6 + 16 + rowH * 3 + 58;
    let y = windowFrame(ctx, f, `HOLD AT ${hd.ident}`, X, top, W, h) + 10;
    const rowsDef: [string, string][] = [
      ['INBOUND CRS', `${pad3(hd.inbound)}°`],
      ['TURNS', hd.turn === 'R' ? 'RIGHT' : 'LEFT'],
      ['LEG TIME', `${hd.legMin.toFixed(1)} MIN`],
    ];
    rowsDef.forEach(([lbl, val], k) => {
      const ry = y + rowH / 2;
      text(ctx, lbl, X + 14, ry, C.gray, s13);
      field(ctx, val, X + 150, ry, 120, rowH - 4, hd.field === k, s15, C.cyan, 'center');
      hit(f, X + 150, ry - rowH / 2, 120, rowH, () => (hd.field = k));
      button(ctx, f, '◂', X + 282, ry - (rowH - 6) / 2, 44, rowH - 6, false, true, () => { hd.field = k; holdAdjust(hd, k === 0 ? -5 : -1); });
      button(ctx, f, '▸', X + 332, ry - (rowH - 6) / 2, 44, rowH - 6, false, true, () => { hd.field = k; holdAdjust(hd, k === 0 ? 5 : 1); });
      y += rowH;
    });
    button(ctx, f, 'LOAD HOLD?', X + 14, y + 8, W - 28, 38, hd.field === 3, true, () => loadHold(sim, f));
  }

  if (f.insert) {
    const ins = f.insert;
    const n = Math.min(ins.list.length, 10);
    const h = TITLE_H + 6 + 16 + rowH + n * rowH + 12;
    let y = windowFrame(ctx, f, ins.title, X, top, W, h) + 8;
    text(ctx, 'NEAREST', X + 14, y + rowH / 2, C.gray, s13);
    y += rowH;
    listRows(ins.list.map((q) => ({ label: q.ident, sub: q.kind, enabled: true })), ins.sel, y, n, (k) => { ins.sel = k; doInsert(sim, f); });
  }

  if (f.menu) {
    const m = f.menu;
    const h = TITLE_H + 6 + 16 + m.items.length * rowH;
    const y = windowFrame(ctx, f, m.title, X, top, W, h) + 8;
    listRows(m.items.map((i) => ({ label: i.label.toUpperCase(), enabled: i.enabled })), m.sel, y, m.items.length, (k) => { f.menu = null; m.items[k].run(); });
  }

  if (f.confirm) {
    const c = f.confirm;
    const w = 340;
    const x = X + (W - w) / 2;
    const h = TITLE_H + 6 + rowH + 66;
    hit(f, 0, 0, MFD_W, SOFT_Y, () => undefined); // modal
    const y0 = 290;
    const y = windowFrame(ctx, f, 'CONFIRM', x, y0, w, h) + 8;
    text(ctx, c.text, x + w / 2, y + rowH / 2, C.white, fs(16), 'center', 700);
    const bw = (w - 28 - 10) / 2;
    button(ctx, f, c.ok, x + 14, y + rowH + 10, bw, 38, true, true, () => { f.confirm = null; c.run(); });
    button(ctx, f, 'CANCEL', x + 24 + bw, y + rowH + 10, bw, 38, false, true, () => { f.confirm = null; c.cancel?.(); });
  }
}
