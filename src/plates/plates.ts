// Procedurally generated charts (SVG) laid out to Jeppesen / ICAO Annex 4 conventions: instrument approach
// charts (heading, communications row, briefing strip, MSA, plan view with collision-free course labels on
// every leg and hold, profile view, conversion table, minimums by aircraft category, airport sketch),
// airport diagrams, and — through ./terminal — SID and STAR charts. Built from the nav database.
//
// Every label of the plan views goes through one placement engine (`Placer`): chart lines, symbols and
// labels are registered as obstacles, a label is only put where it crosses no symbol or other label. The
// engine records what it placed (`lastLayout()`) so tests can assert completeness and the absence of overlaps.
import {
  airport,
  navaid,
  NAVAIDS,
  runway,
  AIRPORTS,
  APPROACHES,
  TERMINAL,
  groundElevation,
  landMask,
} from "../nav/data";
import {
  destination,
  distanceNm,
  toLocal,
  norm360,
  wrap180,
  bearingDeg,
  DEG,
  FT_PER_NM,
  type LatLon,
} from "../nav/geo";
import type { Approach, Fix, Navaid, ProcLeg } from "../nav/types";
import { sidChart, starChart, procTitle } from "./terminal";

export const W = 600;
export const H = 900;
export const FONT = `'Roboto Condensed', 'Arial Narrow', Arial, Helvetica, sans-serif`;
export const INK = "#111";
export const MUTED = "#555";
export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const f1 = (n: number) => n.toFixed(1);
export const pad3 = (n: number) =>
  String(Math.round(norm360(n)) || 360).padStart(3, "0");
/** VHF communication frequency; a source value with its leading '1' lost (33.82 for 133.82) is restored */
export const freq = (f?: number) => {
  if (!f) return "—";
  if (f >= 18 && f < 37) f += 100;
  return f.toFixed(Math.round(f * 1000) % 10 ? 3 : 2).replace(/0$/, "");
};
/** leg distance as printed on charts: one decimal below 100 NM */
export const distTxt = (nm: number) =>
  nm < 100 ? nm.toFixed(1) : String(Math.round(nm));
/** ILS/LOC idents are printed with the dash (I-PRD) */
export const identTxt = (n: Navaid) =>
  (n.type === "ILS" || n.type === "LOC") && /^I[A-Z]{2,3}$/.test(n.ident)
    ? `I-${n.ident.slice(1)}`
    : n.ident;
const navFreq = (n: Navaid) =>
  n.type === "NDB"
    ? String(n.freq)
    : n.freq.toFixed(n.type === "ILS" || n.type === "LOC" ? 2 : 1);
const EFF = "05 NOV 26";

const EFF_END = "03 DEC 26";
/** latitude / longitude as printed in the bottom margin: 41°08'N-75°23'W */
const latLonTxt = (lat: number, lon: number) => {
  const dm = (v: number, w: number) => {
    const a = Math.abs(v);
    let d = Math.floor(a),
      m = Math.round((a - d) * 60);
    if (m === 60) (d += 1), (m = 0);
    return `${String(d).padStart(w, "0")}°${String(m).padStart(2, "0")}'`;
  };
  return `${dm(lat, 2)}${lat >= 0 ? "N" : "S"}-${dm(lon, 3)}${lon >= 0 ? "E" : "W"}`;
};
/**
 * Margin identification (FAA TPP / Jeppesen): the bottom margin repeats the airport (name + ident, effective
 * date) left, the reference position centre and the procedure name right; the effective dates run vertically
 * in both side margins.
 */
export function chartMargins(
  a: { icao: string; name: string; lat: number; lon: number },
  procName: string,
  source?: string,
): string {
  const o: string[] = [];
  o.push(line({ x: 10, y: H - 32 }, { x: W - 10, y: H - 32 }, 1.2));
  const rightSize = Math.min(12, (12 * (W / 2 - 92)) / Math.max(1, textW(procName, 12, true)));
  const maxL = W / 2 - 92 - 20;
  let nm = a.name.toUpperCase().replace(/\bINTERNATIONAL\b/, "INTL").replace(/\s+AIRPORT$/, "").trim();
  let lt = `${nm} (${a.icao})`;
  while (textW(lt, 8.5, true) > maxL && nm.length > 6) {
    nm = nm.slice(0, -1).trimEnd();
    lt = `${nm}… (${a.icao})`;
  }
  o.push(text(20, H - 21.5, lt, { size: 8.5, weight: 700, halo: false }));
  o.push(
    text(20, H - 13, `Eff ${EFF}${source ? `  ·  ${source}` : ""}`, {
      size: 7.5,
      fill: MUTED,
      halo: false,
    }),
  );
  o.push(text(W / 2, H - 21.5, latLonTxt(a.lat, a.lon), { size: 7.5, anchor: "middle", halo: false }));
  o.push(
    text(W / 2, H - 13, "SIMULATED — NOT FOR NAVIGATION", {
      size: 7.5,
      weight: 700,
      anchor: "middle",
      halo: false,
    }),
  );
  o.push(text(W - 20, H - 15.5, procName, { size: rightSize, weight: 700, anchor: "end", halo: false }));
  const dates = `${EFF} to ${EFF_END}`;
  o.push(text(6.8, H / 2, dates, { size: 6.5, weight: 700, anchor: "middle", rotate: -90, halo: false }));
  o.push(text(W - 6.8, H / 2, dates, { size: 6.5, weight: 700, anchor: "middle", rotate: 90, halo: false }));
  return o.join("");
}

// ------------------------------------------------------------------ fixed layout of the approach chart
// (fixed so the UI can overlay own-ship on the plan view: see planProjection)
const L = {
  head: { y: 10, h: 46 },
  comm: { y: 56, h: 20 },
  brief: { y: 76, h: 38 },
  miss: { y: 114, h: 26 },
  notes: { y: 140, h: 56 },
};
const PLAN_BOX = { x: 10, y: 196, w: W - 20, h: 318 };
const PROF = { y: PLAN_BOX.y + PLAN_BOX.h, h: 128 };

export interface Pt {
  x: number;
  y: number;
}
export interface Proj {
  (p: LatLon): Pt;
  scale: number; // px per nm
  inv: (x: number, y: number) => LatLon;
}

function makeProj(
  points: LatLon[],
  box: { x: number; y: number; w: number; h: number },
  margin = 34,
): Proj {
  const ref = points[0];
  const loc = points.map((p) => toLocal(ref, p));
  const minX = Math.min(...loc.map((p) => p.x)),
    maxX = Math.max(...loc.map((p) => p.x));
  const minY = Math.min(...loc.map((p) => p.y)),
    maxY = Math.max(...loc.map((p) => p.y));
  const scale = Math.min(
    (box.w - 2 * margin) / Math.max(0.5, maxX - minX),
    (box.h - 2 * margin) / Math.max(0.5, maxY - minY),
  );
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  const fn = ((p: LatLon) => {
    const l = toLocal(ref, p);
    return {
      x: box.x + box.w / 2 + (l.x - cx) * scale,
      y: box.y + box.h / 2 - (l.y - cy) * scale,
    };
  }) as Proj;
  fn.scale = scale;
  fn.inv = (x, y) => {
    const lx = (x - box.x - box.w / 2) / scale + cx;
    const ly = -(y - box.y - box.h / 2) / scale + cy;
    return {
      lat: ref.lat + ly / 60,
      lon: ref.lon + lx / (60 * Math.cos(ref.lat * DEG)),
    };
  };
  return fn;
}

// ------------------------------------------------------------------ text metrics (Roboto Condensed)
function charW(c: string): number {
  if (c >= "0" && c <= "9") return 0.51;
  if (c >= "A" && c <= "Z")
    return c === "I" ? 0.27 : c === "M" || c === "W" ? 0.74 : 0.58;
  if (c >= "a" && c <= "z")
    return "ijl".includes(c)
      ? 0.23
      : "mw".includes(c)
        ? 0.72
        : c === "f" || c === "t" || c === "r"
          ? 0.32
          : 0.49;
  if (c === " ") return 0.24;
  if (c === "°") return 0.36;
  if ("()[]/".includes(c)) return 0.3;
  if (".,:;'·".includes(c)) return 0.23;
  if (c === "-") return 0.32;
  if ("—→".includes(c)) return 0.85;
  if ("¼½¾⅛⅜⅝⅞".includes(c)) return 0.78;
  return 0.58;
}
export const textW = (s: string, size: number, bold = false) =>
  [...s].reduce((w, c) => w + charW(c), 0) * size * (bold ? 1.05 : 1);

// ------------------------------------------------------------------ primitives
export const P = (n: number) => n.toFixed(1);
/** text with a white halo so it stays legible over lines and terrain */
export function text(
  x: number,
  y: number,
  s: string,
  o: {
    size?: number;
    weight?: number;
    anchor?: "start" | "middle" | "end";
    halo?: boolean;
    fill?: string;
    rotate?: number;
    italic?: boolean;
    deco?: string;
  } = {},
): string {
  const tr = o.rotate
    ? ` transform="rotate(${P(o.rotate)} ${P(x)} ${P(y)})"`
    : "";
  const halo = o.halo === false ? "" : ` class="hl"`;
  const st = [
    o.fill ? `fill:${o.fill}` : "",
    o.deco ? `text-decoration:${o.deco}` : "",
  ]
    .filter(Boolean)
    .join(";");
  return `<text x="${P(x)}" y="${P(y)}" font-size="${o.size ?? 10}" font-weight="${o.weight ?? 400}"${o.anchor ? ` text-anchor="${o.anchor}"` : ""}${st ? ` style="${st}"` : ""}${o.italic ? ' font-style="italic"' : ""}${halo}${tr}>${esc(s)}</text>`;
}
/** a run of styled text: altitude constraints are underlined (at or above), overlined (at or below) or both (at) */
export interface Seg {
  t: string;
  u?: boolean;
  o?: boolean;
  b?: boolean;
  size?: number;
}
export const segsW = (segs: Seg[], size: number, bold: boolean) =>
  segs.reduce((w, s) => w + textW(s.t, s.size ?? size, s.b ?? bold), 0);
export function rich(
  x: number,
  y: number,
  segs: Seg[],
  o: {
    size?: number;
    bold?: boolean;
    anchor?: "start" | "middle" | "end";
    halo?: boolean;
  } = {},
): string {
  const spans = (withDeco: boolean) =>
    segs
      .map((s) => {
        const deco = withDeco ? [s.u ? "underline" : "", s.o ? "overline" : ""].filter(Boolean).join(" ") : "";
        return `<tspan${s.b !== undefined ? ` font-weight="${s.b ? 700 : 400}"` : ""}${s.size ? ` font-size="${s.size}"` : ""}${deco ? ` style="text-decoration:${deco}"` : ""}>${esc(s.t)}</tspan>`;
      })
      .join("");
  const head = `<text x="${P(x)}" y="${P(y)}" font-size="${o.size ?? 10}" font-weight="${o.bold ? 700 : 400}"${o.anchor ? ` text-anchor="${o.anchor}"` : ""}`;
  const decorated = segs.some((s) => s.u || s.o);
  if (o.halo === false) return `${head}>${spans(true)}</text>`;
  // the halo copy carries no decoration: an underline / overline is never stroked white
  if (decorated) return `${head} class="hl ho">${spans(false)}</text>${head}>${spans(true)}</text>`;
  return `${head} class="hl">${spans(true)}</text>`;
}
/** altitude constraint as segments: 5000 underlined (at or above), overlined (at or below), both (mandatory) */
export function altSegs(min?: number, max?: number, b = true): Seg[] {
  if (min && max && min === max) return [{ t: `${min}`, u: true, o: true, b }];
  const out: Seg[] = [];
  if (max) out.push({ t: `${max}`, o: true, b });
  if (min)
    out.push(...(out.length ? [{ t: " " }] : []), { t: `${min}`, u: true, b });
  return out;
}
export const line = (a: Pt, b: Pt, w = 1, dash = "", stroke = INK) =>
  `<line x1="${P(a.x)}" y1="${P(a.y)}" x2="${P(b.x)}" y2="${P(b.y)}" stroke="${stroke}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
export const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
  o: { fill?: string; sw?: number; stroke?: string } = {},
) =>
  `<rect x="${P(x)}" y="${P(y)}" width="${P(w)}" height="${P(h)}" fill="${o.fill ?? "none"}" stroke="${o.stroke ?? INK}" stroke-width="${o.sw ?? 1}"/>`;

export function arrowHead(at: Pt, ang: number, size = 7): string {
  const a = (d: number) =>
    `${P(at.x + size * Math.cos(ang + d))},${P(at.y + size * Math.sin(ang + d))}`;
  return `<polygon points="${P(at.x)},${P(at.y)} ${a(Math.PI - 0.38)} ${a(Math.PI + 0.38)}" fill="${INK}"/>`;
}
/** course line with direction arrowheads every ~110 px */
export function courseLine(
  a: Pt,
  b: Pt,
  o: { width?: number; dash?: boolean } = {},
): string {
  const w = o.width ?? 1.3;
  let s = line(a, b, w, o.dash ? "7 4" : "");
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  if (len < 26) return s;
  const n = Math.max(1, Math.floor(len / 110));
  for (let k = 1; k <= n; k++) {
    const t = k / (n + 1) + 0.04;
    s += arrowHead(
      { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
      ang,
      5.5 + w,
    );
  }
  return s;
}
/** screen unit vector of a course (north up) */
const dirVec = (crs: number): Pt => ({
  x: Math.sin(crs * DEG),
  y: -Math.cos(crs * DEG),
});

// ------------------------------------------------------------------ label placement without overlaps
export type Box = { x: number; y: number; w: number; h: number };
const boxPoly = (b: Box): Pt[] => [
  { x: b.x, y: b.y },
  { x: b.x + b.w, y: b.y },
  { x: b.x + b.w, y: b.y + b.h },
  { x: b.x, y: b.y + b.h },
];
/** separating-axis test between two convex polygons (a 2-point "polygon" is a segment) */
export function polysOverlap(A: Pt[], B: Pt[]): boolean {
  for (const P0 of [A, B])
    for (let i = 0; i < P0.length; i++) {
      const p = P0[i],
        q = P0[(i + 1) % P0.length];
      const ax = -(q.y - p.y),
        ay = q.x - p.x;
      if (!ax && !ay) continue;
      let a0 = Infinity,
        a1 = -Infinity,
        b0 = Infinity,
        b1 = -Infinity;
      for (const v of A) {
        const d = v.x * ax + v.y * ay;
        a0 = Math.min(a0, d);
        a1 = Math.max(a1, d);
      }
      for (const v of B) {
        const d = v.x * ax + v.y * ay;
        b0 = Math.min(b0, d);
        b1 = Math.max(b1, d);
      }
      if (a1 <= b0 || b1 <= a0) return false;
    }
  return true;
}
/** oriented rectangle centred on (cx, cy), w along the angle, h across */
function orientedRect(
  cx: number,
  cy: number,
  w: number,
  h: number,
  angDeg: number,
): Pt[] {
  const c = Math.cos(angDeg * DEG),
    s = Math.sin(angDeg * DEG);
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c }));
}

/** what the layout engine placed on the last chart rendered (for tests and debugging) */
export interface LayoutReport {
  chart: string;
  labels: { text: string; poly: Pt[] }[];
  /** every leg / hold / arc drawn and the course label it received (null: none) */
  legs: { id: string; label: string | null }[];
}
let REPORT: LayoutReport = { chart: "", labels: [], legs: [] };
export function lastLayout(): LayoutReport {
  return REPORT;
}
export function beginLayout(chart: string): LayoutReport {
  REPORT = { chart, labels: [], legs: [] };
  return REPORT;
}

export class Placer {
  /** symbols and labels: nothing may be placed over them */
  hard: Pt[][] = [];
  /** chart lines (legs, feathers, holds, rings): avoided, crossed only as a last resort */
  soft: Pt[][] = [];
  constructor(public bounds: Box) {}
  block(x: number, y: number, w: number, h: number) {
    this.hard.push(boxPoly({ x, y, w, h }));
  }
  hardPoly(p: Pt[]) {
    this.hard.push(p);
  }
  softPoly(p: Pt[]) {
    this.soft.push(p);
  }
  /** the strips along each leg where its course label goes: other labels avoid them when they can */
  reserve: Pt[][] = [];
  private legSegs: [Pt, Pt][] = [];
  segment(a: Pt, b: Pt) {
    this.soft.push([a, b]);
    if (Math.hypot(b.x - a.x, b.y - a.y) > 24) this.legSegs.push([a, b]);
  }
  polyline(pts: Pt[]) {
    for (let i = 1; i < pts.length; i++) this.soft.push([pts[i - 1], pts[i]]);
  }
  /** reserve both sides of the middle of every leg registered so far for its course label */
  reserveLegCorridors(th = 13) {
    for (const [a, b] of this.legSegs) {
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L < 70) continue; // too short to carry its label along the track anyway
      const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
      const nx = -(b.y - a.y) / L,
        ny = (b.x - a.x) / L;
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const w = Math.min(L * 0.45, 64);
      for (const sd of [-1, 1])
        this.reserve.push(orientedRect(m.x + nx * sd * (th / 2 + 2), m.y + ny * sd * (th / 2 + 2), w, th, ang));
    }
  }
  /** a symbol of radius r, blocked as its bounding square */
  circle(c: Pt, r: number) {
    this.block(c.x - r, c.y - r, 2 * r, 2 * r);
  }
  /** a circle drawn as a line (VOR rose, ring) */
  ring(c: Pt, r: number) {
    const pts: Pt[] = [];
    for (let k = 0; k <= 16; k++)
      pts.push({
        x: c.x + r * Math.cos((k * Math.PI) / 8),
        y: c.y + r * Math.sin((k * Math.PI) / 8),
      });
    this.polyline(pts);
  }
  inBounds(poly: Pt[]) {
    const B = this.bounds;
    return poly.every(
      (v) =>
        v.x >= B.x + 2 &&
        v.y >= B.y + 2 &&
        v.x <= B.x + B.w - 2 &&
        v.y <= B.y + B.h - 2,
    );
  }
  /** -1 when the polygon leaves the frame or touches a symbol / label, else the number of chart lines it crosses */
  cost(poly: Pt[]): number {
    if (!this.inBounds(poly)) return -1;
    if (this.hard.some((o) => polysOverlap(poly, o))) return -1;
    let n = 0;
    for (const o of this.soft) if (polysOverlap(poly, o)) n++;
    return n;
  }
  free(b: Box) {
    return this.cost(boxPoly(b)) === 0;
  }
  /** reserve a label's polygon and record it */
  commit(poly: Pt[], label: string) {
    this.hard.push(poly);
    REPORT.labels.push({ text: label, poly });
  }
  /** find a spot for a w×h label near (x, y), in rings of growing distance; returns its box (null: no room) */
  place(
    x: number,
    y: number,
    w: number,
    h: number,
    gap = 8,
    label = "",
    maxRing = 5,
    /** a far label gets a leader from this point: candidates whose leader would cross a symbol / label are skipped */
    leaderFrom?: Pt,
    strictLeader = true,
  ): (Box & { far: boolean; lead?: [Pt, Pt] }) | null {
    const cands: Box[] = [];
    for (let k = 0; k <= maxRing; k++) {
      const d = gap + k * 9;
      const e = d * 0.72;
      cands.push(
        { x: x + e, y: y - e - h, w, h },
        { x: x + e, y: y + e, w, h },
        { x: x - e - w, y: y - e - h, w, h },
        { x: x - e - w, y: y + e, w, h },
        { x: x + d, y: y - h / 2, w, h },
        { x: x - d - w, y: y - h / 2, w, h },
        { x: x - w / 2, y: y - d - h, w, h },
        { x: x - w / 2, y: y + d, w, h },
      );
    }
    let best: Box | null = null,
      bestC = Infinity,
      bestI = 0;
    const FAR = 8;
    const leadOf = (b: Box): [Pt, Pt] | undefined => {
      if (!leaderFrom) return undefined;
      const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
      const dx = leaderFrom.x - c.x,
        dy = leaderFrom.y - c.y;
      const t = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity);
      const end = { x: c.x + dx * t, y: c.y + dy * t };
      const L = Math.hypot(dx, dy) || 1;
      return [{ x: leaderFrom.x - (dx / L) * 9, y: leaderFrom.y - (dy / L) * 9 }, end];
    };
    for (let i = 0; i < cands.length; i++) {
      const c = this.cost(boxPoly(cands[i]));
      if (c < 0) continue;
      if (i >= FAR && leaderFrom && strictLeader) {
        const ld = leadOf(cands[i])!;
        // the symbol the leader starts from does not count
        const from: Pt[] = [leaderFrom, { x: leaderFrom.x + 0.01, y: leaderFrom.y + 0.01 }];
        if (this.hard.some((h) => polysOverlap(ld, h) && !polysOverlap(from, h))) continue;
      }
      // a crossed line costs as much as two rings of distance; so does a leader crossing a chart line
      let lc = 0;
      if (i >= FAR && leaderFrom) {
        const ld = leadOf(cands[i])!;
        for (const sg of this.soft) if (polysOverlap(ld, sg)) lc++;
      }
      let rc = 0;
      for (const r of this.reserve) if (polysOverlap(boxPoly(cands[i]), r)) rc++;
      // a reserved leg-label strip costs about three rings of distance (a fix name stays next to its symbol)
      const score = (c + lc) * 16 + rc * 3 + Math.floor(i / 8);
      if (score < bestC) {
        bestC = score;
        best = cands[i];
        bestI = i;
      }
      if (c + lc + rc === 0) break;
    }
    if (!best) return null;
    this.commit(boxPoly(best), label);
    const far = bestI >= FAR;
    const lead = far ? leadOf(best) : undefined;
    if (lead) this.segment(lead[0], lead[1]);
    return { ...best, far, lead };
  }
}

/**
 * Course / distance / altitude annotation along a leg, rotated to the leg but never upside down, beside the
 * line where it crosses no symbol or label (lines as a last resort, then horizontal near the middle).
 */
export function readableAngle(ang: number): number {
  if (ang >= 90) ang -= 180;
  if (ang < -90) ang += 180;
  return ang;
}
export function legLabel(
  a: Pt,
  b: Pt,
  segs: Seg[],
  placer: Placer,
  o: { size?: number; bold?: boolean; id?: string; awayFrom?: Pt; minT?: number } = {},
): string {
  const size = o.size ?? 9;
  const bold = o.bold ?? true;
  const label = segs.map((s) => s.t).join("");
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const th = size + 4;
  const ang = readableAngle((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
  const nx = -Math.sin(ang * DEG),
    ny = Math.cos(ang * DEG);
  const wOf = (sg: Seg[]) => segsW(sg, size, bold) + 6;
  type Cand = { cx: number; cy: number; poly: Pt[]; pri: number; segs: Seg[] };
  const draw = (c: { cx: number; cy: number; segs: Seg[] }, r: number, ground: boolean) => {
    const tw = wOf(c.segs);
    return `<g transform="rotate(${P(r)} ${P(c.cx)} ${P(c.cy)})">${ground ? `<rect x="${P(c.cx - tw / 2)}" y="${P(c.cy - th / 2)}" width="${P(tw)}" height="${P(th)}" fill="#fff"/>` : ""}${rich(c.cx, c.cy + size * 0.36, c.segs, { size, bold, anchor: "middle" })}</g>`;
  };
  const done = (s: string) => {
    if (o.id) REPORT.legs.push({ id: o.id, label });
    return s;
  };
  const ts = [0.5, 0.4, 0.6, 0.3, 0.7, 0.22, 0.78, 0.14, 0.86];
  const offs = [th / 2 + 2, th / 2 + 6, th / 2 + 11, th / 2 + 17];
  let sides = [-1, 1];
  if (o.awayFrom) {
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const dA = Math.hypot(m.x + nx * 10 - o.awayFrom.x, m.y + ny * 10 - o.awayFrom.y);
    const dB = Math.hypot(m.x - nx * 10 - o.awayFrom.x, m.y - ny * 10 - o.awayFrom.y);
    sides = dA > dB ? [1] : [-1];
  }
  const cand = (sg: Seg[], t: number, off: number, side: number, pri: number): Cand | null => {
    const tw = wOf(sg);
    if (Math.min(t, 1 - t) * len < tw / 2 + (o.minT ?? 4)) return null;
    const cx = a.x + (b.x - a.x) * t + nx * off * side,
      cy = a.y + (b.y - a.y) * t + ny * off * side;
    return { cx, cy, poly: orientedRect(cx, cy, tw, th, ang), pri, segs: sg };
  };
  const singles: Cand[] = [];
  offs.forEach((off, oi) =>
    ts.forEach((t, ti) => {
      for (const side of sides) {
        const c = cand(segs, t, off, side, oi * 3 + ti);
        if (c) singles.push(c);
      }
    }),
  );
  // 1) free of everything
  for (const c of singles)
    if (placer.cost(c.poly) === 0) {
      placer.commit(c.poly, label);
      return done(draw(c, ang, false));
    }
  // 1b) split: course (and distance) on one side of the line, altitude / annotation on the other
  const si = segs.findIndex((s) => s.t === "  ");
  const pairs: { c1: Cand; c2: Cand; k: number }[] = [];
  if (si > 0 && !o.awayFrom) {
    const A = segs.slice(0, si),
      B = segs.slice(si + 1);
    for (const off of offs.slice(0, 3))
      for (const t of ts)
        for (const [side, side2, off2] of [
          [-1, 1, off],
          [1, -1, off],
          // stacked on one side (FAA: course / distance, altitude above it, along the track)
          [-1, -1, off + th + 1],
          [1, 1, off + th + 1],
        ]) {
          const c1 = cand(A, t, off, side, 0),
            c2 = cand(B, t, off2, side2, 0);
          if (!c1 || !c2) continue;
          const k1 = placer.cost(c1.poly),
            k2 = placer.cost(c2.poly);
          if (k1 < 0 || k2 < 0) continue;
          if (k1 + k2 === 0) {
            placer.commit(c1.poly, A.map((x) => x.t).join(""));
            placer.commit(c2.poly, B.map((x) => x.t).join(""));
            return done(draw(c1, ang, false) + draw(c2, ang, false));
          }
          pairs.push({ c1, c2, k: k1 + k2 });
        }
  }
  // 2) crossing the fewest lines, on a white ground (whole label or split)
  let best: Cand | null = null,
    bc = Infinity;
  for (const c of singles) {
    const k = placer.cost(c.poly);
    if (k >= 0 && k * 20 + c.pri < bc) {
      bc = k * 20 + c.pri;
      best = c;
    }
  }
  const bp = pairs.sort((x, y) => x.k - y.k)[0];
  if (bp && (!best || bp.k * 20 + 6 < bc)) {
    placer.commit(bp.c1.poly, bp.c1.segs.map((x) => x.t).join(""));
    placer.commit(bp.c2.poly, bp.c2.segs.map((x) => x.t).join(""));
    return done(draw(bp.c1, ang, true) + draw(bp.c2, ang, true));
  }
  if (best) {
    placer.commit(best.poly, label);
    return done(draw(best, ang, true));
  }
  // 3) short or crowded leg: horizontal near its middle
  const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const tw = wOf(segs);
  const small = size <= 7.5;
  // a leader never crosses a symbol or a label: try a smaller size first, cross only as the last resort
  const bx =
    placer.place(m.x, m.y, tw, th, 4, label, small ? 14 : 6, m) ??
    (small ? placer.place(m.x, m.y, tw, th, 4, label, 14, m, false) : null);
  if (bx) {
    const lead = bx.lead ? line(m, bx.lead[1], 0.5) : "";
    return done(lead + draw({ cx: bx.x + tw / 2, cy: bx.y + th / 2, segs }, 0, true));
  }
  // 4) still no room: the same at a smaller size, then further away with a leader line
  if (!small) return legLabel(a, b, segs, placer, { ...o, size: 7.5 });
  if (o.id) REPORT.legs.push({ id: o.id, label: null });
  return "";
}

// ------------------------------------------------------------------ chart symbols (ICAO Annex 4 / Jeppesen)
export type SymKind =
  | "vor"
  | "vordme"
  | "dme"
  | "ndb"
  | "fix"
  | "wpt"
  | "flyover";
export function navSymbol(kind: SymKind, x: number, y: number): string {
  if (kind === "vor" || kind === "vordme" || kind === "dme") {
    const r = 6.5;
    const hex = Array.from(
      { length: 6 },
      (_, i) =>
        `${P(x + r * Math.cos((Math.PI / 3) * i))},${P(y + r * Math.sin((Math.PI / 3) * i))}`,
    ).join(" ");
    const box =
      kind !== "vor"
        ? `<rect x="${P(x - 8.5)}" y="${P(y - 6.5)}" width="17" height="13" fill="#fff" stroke="${INK}" stroke-width="1.1"/>`
        : "";
    if (kind === "dme")
      return `${box}<circle cx="${P(x)}" cy="${P(y)}" r="1.4" fill="${INK}"/>`;
    return `${box}<polygon points="${hex}" fill="#fff" stroke="${INK}" stroke-width="1.2"/><circle cx="${P(x)}" cy="${P(y)}" r="1.4" fill="${INK}"/>`;
  }
  if (kind === "ndb") {
    let dots = "";
    for (let ring = 1; ring <= 3; ring++)
      for (let i = 0; i < 7 + ring * 5; i++) {
        const a = (2 * Math.PI * i) / (7 + ring * 5);
        dots += `<circle cx="${P(x + ring * 3.1 * Math.cos(a))}" cy="${P(y + ring * 3.1 * Math.sin(a))}" r="0.7" fill="${INK}"/>`;
      }
    return `<circle cx="${P(x)}" cy="${P(y)}" r="11" fill="#fff" opacity="0.85"/>${dots}<circle cx="${P(x)}" cy="${P(y)}" r="2.2" fill="${INK}"/>`;
  }
  if (kind === "wpt" || kind === "flyover") {
    // RNAV waypoint: four-pointed star (fly-by); fly-over: the star in a circle
    const s = 7;
    const star = `<path d="M${P(x)},${P(y - s)} L${P(x + 1.8)},${P(y - 1.8)} L${P(x + s)},${P(y)} L${P(x + 1.8)},${P(y + 1.8)} L${P(x)},${P(y + s)} L${P(x - 1.8)},${P(y + 1.8)} L${P(x - s)},${P(y)} L${P(x - 1.8)},${P(y - 1.8)} Z" fill="#fff" stroke="${INK}" stroke-width="1.1"/>`;
    return kind === "flyover"
      ? `<circle cx="${P(x)}" cy="${P(y)}" r="5.2" fill="none" stroke="${INK}" stroke-width="0.9"/>${star}`
      : star;
  }
  return `<polygon points="${P(x)},${P(y - 6.5)} ${P(x - 6)},${P(y + 4.5)} ${P(x + 6)},${P(y + 4.5)}" fill="#fff" stroke="${INK}" stroke-width="1.3"/>`;
}
export function malteseCross(x: number, y: number, s: number): string {
  const q = s * 0.42;
  return `<path d="M${P(x)},${P(y)} L${P(x - s)},${P(y - q)} L${P(x - s)},${P(y + q)} Z M${P(x)},${P(y)} L${P(x + s)},${P(y - q)} L${P(x + s)},${P(y + q)} Z M${P(x)},${P(y)} L${P(x - q)},${P(y - s)} L${P(x + q)},${P(y - s)} Z M${P(x)},${P(y)} L${P(x - q)},${P(y + s)} L${P(x + q)},${P(y + s)} Z" fill="${INK}"/>`;
}
/** compass rose of a VOR (radials every 10°, north tick) */
function compassRose(x: number, y: number, r = 22): string {
  let s = `<circle cx="${P(x)}" cy="${P(y)}" r="${r}" fill="none" stroke="${INK}" stroke-width="0.5"/>`;
  for (let d = 0; d < 360; d += 10) {
    const a = (d - 90) * DEG;
    const l = d % 30 === 0 ? 4.5 : 2.2;
    s += `<line x1="${P(x + r * Math.cos(a))}" y1="${P(y + r * Math.sin(a))}" x2="${P(x + (r - l) * Math.cos(a))}" y2="${P(y + (r - l) * Math.sin(a))}" stroke="${INK}" stroke-width="0.5"/>`;
  }
  return (
    s + `<path d="M${P(x)},${P(y - r - 5)} l-2.6,5 h5.2 z" fill="${INK}"/>`
  );
}
export function symKindOf(f: Fix, rnav: boolean): SymKind {
  if (f.kind === "vor" || f.kind === "ndb") {
    const n = NAVAIDS.find((x) => x.ident === f.ident);
    if (f.kind === "ndb" || n?.type === "NDB") return "ndb";
    return n?.type === "VOR" ? "vor" : "vordme";
  }
  return rnav ? "wpt" : "fix";
}

/**
 * Holding pattern (not to scale, at least a readable size), registered with the placer, with its inbound
 * course on the inbound leg and the outbound course + leg time on the outbound leg (arrows show the turns).
 */
export function holdPattern(
  center: Pt,
  inbound: number,
  turn: "R" | "L",
  legMin: number,
  scale: number,
  placer: Placer,
  o: { dashed?: boolean; id: string; later: (() => string)[]; legNm?: number },
): string {
  const s = turn === "R" ? 1 : -1;
  const u = dirVec(inbound);
  const n = { x: dirVec(inbound + 90).x * s, y: dirVec(inbound + 90).y * s };
  const legPx = Math.max(44, Math.min(78, (o.legNm ?? legMin * 2) * scale));
  const r = Math.max(10, Math.min(16, 0.6 * scale));
  const p0 = center;
  const back = { x: p0.x - u.x * legPx, y: p0.y - u.y * legPx };
  const p0s = { x: p0.x + n.x * 2 * r, y: p0.y + n.y * 2 * r };
  const backs = { x: back.x + n.x * 2 * r, y: back.y + n.y * 2 * r };
  const sweep = turn === "R" ? 1 : 0;
  const d = `M${P(back.x)},${P(back.y)} L${P(p0.x)},${P(p0.y)} A${P(r)},${P(r)} 0 0 ${sweep} ${P(p0s.x)},${P(p0s.y)} L${P(backs.x)},${P(backs.y)} A${P(r)},${P(r)} 0 0 ${sweep} ${P(back.x)},${P(back.y)}`;
  // obstacles: the two legs and the turns as lines, the inside of the racetrack as a block
  placer.segment(back, p0);
  placer.segment(p0s, backs);
  for (const [a, b] of [
    [p0, p0s],
    [backs, back],
  ]) {
    const m = {
      x: (a.x + b.x) / 2 + u.x * r * (a === p0 ? 1 : -1),
      y: (a.y + b.y) / 2 + u.y * r * (a === p0 ? 1 : -1),
    };
    placer.polyline([a, m, b]);
  }
  const inset = 3;
  placer.hardPoly([
    {
      x: back.x + u.x * inset + n.x * inset,
      y: back.y + u.y * inset + n.y * inset,
    },
    {
      x: p0.x - u.x * inset + n.x * inset,
      y: p0.y - u.y * inset + n.y * inset,
    },
    {
      x: p0s.x - u.x * inset - n.x * inset,
      y: p0s.y - u.y * inset - n.y * inset,
    },
    {
      x: backs.x + u.x * inset - n.x * inset,
      y: backs.y + u.y * inset - n.y * inset,
    },
  ]);
  const inMid = {
    x: (back.x + p0.x) / 2 + u.x * 5,
    y: (back.y + p0.y) / 2 + u.y * 5,
  };
  const outMid = {
    x: (backs.x + p0s.x) / 2 - u.x * 5,
    y: (backs.y + p0s.y) / 2 - u.y * 5,
  };
  const hc = { x: (p0.x + backs.x) / 2, y: (p0.y + backs.y) / 2 };
  const ang = Math.atan2(u.y, u.x);
  o.later.push(() =>
    legLabel(back, p0, [{ t: `${pad3(inbound)}°` }], placer, {
      size: 9,
      id: o.id,
      awayFrom: hc,
      minT: 2,
    }),
  );
  o.later.push(() =>
    legLabel(
      p0s,
      backs,
      [{ t: `${pad3(inbound + 180)}°` }, { t: `  ${legMin} Min`, b: false }],
      placer,
      { size: 8.5, awayFrom: hc, minT: 2 },
    ),
  );
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.3"${o.dashed ? ' stroke-dasharray="6 3.5"' : ""}/>${arrowHead(inMid, ang, 6.5)}${arrowHead(outMid, ang + Math.PI, 6.5)}`;
}

/** runways as outlined shapes at their true length, registered as obstacles for the labels */
function runwayOutlines(
  proj: Proj,
  icao: string,
  placer?: Placer,
  minW = 3.5,
  fill = "#fff",
): string {
  const a = airport(icao);
  let out = "";
  for (let i = 0; i < a.runways.length; i += 2) {
    const r = a.runways[i];
    const q = runwayQuad(
      proj(r.threshold),
      proj(r.end),
      Math.max(minW, (r.widthFt / FT_PER_NM) * proj.scale) / 2,
    );
    out += `<polygon points="${q.map((v) => `${P(v.x)},${P(v.y)}`).join(" ")}" fill="${fill}" stroke="${INK}" stroke-width="1"/>`;
    placer?.hardPoly(q);
  }
  return out;
}
function runwayQuad(p1: Pt, p2: Pt, hw: number): Pt[] {
  const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
  const nx = (-(p2.y - p1.y) / len) * hw,
    ny = ((p2.x - p1.x) / len) * hw;
  return [
    { x: p1.x + nx, y: p1.y + ny },
    { x: p2.x + nx, y: p2.y + ny },
    { x: p2.x - nx, y: p2.y - ny },
    { x: p1.x - nx, y: p1.y - ny },
  ];
}

const ILS_RWYS = () =>
  new Set(
    NAVAIDS.filter((n) => n.type === "ILS").map(
      (n) => `${n.airport}-${n.runway}`,
    ),
  );
const lightingSystem = (icao: string, rwy: string) =>
  ILS_RWYS().has(`${icao}-${rwy}`) ? "ALSF-2" : "MALSR";
/** FAA approach-lighting symbol letter: A = ALSF-2, A5 = MALSR */
const lightingCode = (sys: string) => (sys === "ALSF-2" ? "A" : "A5");

// ------------------------------------------------------------------ terrain (browser only): smooth tint bands + contours
const terrainCache = new Map<string, string>();
function contourPath(
  v: Float32Array,
  nx: number,
  ny: number,
  step: number,
  x0: number,
  y0: number,
  level: number,
): string {
  let d = "";
  const lerp = (a: number, b: number) => a / (a - b);
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = v[j * nx + i] - level,
        b = v[j * nx + i + 1] - level,
        c2 = v[(j + 1) * nx + i + 1] - level,
        e = v[(j + 1) * nx + i] - level;
      const X = x0 + i * step,
        Y = y0 + j * step;
      const pts: Pt[] = [];
      if (a * b < 0) pts.push({ x: X + lerp(a, b) * step, y: Y });
      if (b * c2 < 0) pts.push({ x: X + step, y: Y + lerp(b, c2) * step });
      if (c2 * e < 0)
        pts.push({ x: X + (1 - lerp(c2, e)) * step, y: Y + step });
      if (e * a < 0) pts.push({ x: X, y: Y + (1 - lerp(e, a)) * step });
      if (pts.length >= 2)
        d += `M${P(pts[0].x)},${P(pts[0].y)}L${P(pts[1].x)},${P(pts[1].y)}`;
      if (pts.length === 4)
        d += `M${P(pts[2].x)},${P(pts[2].y)}L${P(pts[3].x)},${P(pts[3].y)}`;
    }
  return d;
}
/** generalized terrain like the Jeppesen plan view: 3 tint bands with thin contours, water, coastline */
export function terrainLayer(
  key: string,
  proj: Proj,
  box: Box,
  aptElevFt = 0,
): string {
  // the cache key carries a terrain fingerprint: terrain tiles that stream in later invalidate it
  const fp = [0.2, 0.5, 0.8]
    .flatMap((fx) => [0.25, 0.5, 0.75].map((fy) => proj.inv(box.x + box.w * fx, box.y + box.h * fy)))
    .map((ll) => `${Math.round(groundElevation(ll))}/${Math.round(landMask(ll) * 10)}`)
    .join(",");
  key = `${key}|${fp}`;
  if (terrainCache.has(key)) return terrainCache.get(key)!;
  if (terrainCache.size > 40) terrainCache.clear();
  const step = 4;
  const nx = Math.ceil(box.w / step) + 1,
    ny = Math.ceil(box.h / step) + 1;
  let el = new Float32Array(nx * ny);
  let land = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const ll = proj.inv(box.x + i * step, box.y + j * step);
      land[j * nx + i] = landMask(ll);
      el[j * nx + i] = groundElevation(ll);
    }
  const blur = (v: Float32Array) => {
    const o = new Float32Array(v.length);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        let sum = 0,
          n = 0;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const x = i + di,
              y = j + dj;
            if (x < 0 || y < 0 || x >= nx || y >= ny) continue;
            sum += v[y * nx + x];
            n++;
          }
        o[j * nx + i] = sum / n;
      }
    return o;
  };
  for (let k = 0; k < 3; k++) {
    el = blur(el);
    land = blur(land);
  }
  // contour levels: the first full thousand 1000 ft above the field, then +1000, +2000
  const base = Math.ceil((aptElevFt + 1000) / 1000) * 1000;
  const levels = [base, base + 1000, base + 2000];
  let out = "";
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = nx;
    c.height = ny;
    const g = c.getContext("2d");
    if (g) {
      const img = g.createImageData(nx, ny);
      const WATER = [226, 238, 247],
        LOW = [255, 255, 255],
        B = [
          [246, 240, 226],
          [237, 226, 202],
          [226, 210, 178],
        ];
      const mix = (a: number[], b: number[], t: number) =>
        a.map((v, i) => v + (b[i] - v) * Math.max(0, Math.min(1, t)));
      for (let k = 0; k < nx * ny; k++) {
        let col = LOW;
        levels.forEach(
          (lv, i) => (col = mix(col, B[i], (el[k] - lv) / 60 + 0.5)),
        );
        col = mix(WATER, col, (land[k] - 0.42) / 0.16);
        img.data[k * 4] = col[0];
        img.data[k * 4 + 1] = col[1];
        img.data[k * 4 + 2] = col[2];
        img.data[k * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      out += `<image class="terrain" href="${c.toDataURL("image/png")}" x="${P(box.x - step / 2)}" y="${P(box.y - step / 2)}" width="${nx * step}" height="${ny * step}" preserveAspectRatio="none" style="image-rendering:auto"/>`;
    }
  }
  const cont = levels
    .map((lv) => contourPath(el, nx, ny, step, box.x, box.y, lv))
    .join("");
  if (cont)
    out += `<path d="${cont}" fill="none" stroke="#b9a37a" stroke-width="0.5"/>`;
  const coast = contourPath(land, nx, ny, step, box.x, box.y, 0.5);
  if (coast)
    out += `<path d="${coast}" fill="none" stroke="#6f93ad" stroke-width="0.8"/>`;
  terrainCache.set(key, out);
  return out;
}
/** up to `n` highest terrain points (spot elevations), well apart, above the first contour */
export function spotHeights(
  proj: Proj,
  box: Box,
  minFt: number,
  n = 3,
): { p: Pt; e: number }[] {
  const all: { p: Pt; e: number }[] = [];
  for (let y = box.y + 24; y < box.y + box.h - 24; y += 9)
    for (let x = box.x + 24; x < box.x + box.w - 40; x += 9) {
      const ll = proj.inv(x, y);
      if (landMask(ll) < 0.6) continue;
      const e = groundElevation(ll);
      if (e > minFt) all.push({ p: { x, y }, e });
    }
  all.sort((a, b) => b.e - a.e);
  const out: { p: Pt; e: number }[] = [];
  for (const s of all) {
    if (out.length >= n) break;
    if (out.every((o) => Math.hypot(o.p.x - s.p.x, o.p.y - s.p.y) > 90))
      out.push(s);
  }
  return out;
}

// ------------------------------------------------------------------ visibility (fractions, RVR, metric)
const FRAC: [number, string][] = [
  [0.125, "⅛"],
  [0.25, "¼"],
  [0.375, "⅜"],
  [0.5, "½"],
  [0.625, "⅝"],
  [0.75, "¾"],
  [0.875, "⅞"],
];
/** statute miles as printed: 1¼, ½, 2 */
export function fracSM(v: number): string {
  const whole = Math.floor(v + 1e-6);
  const rest = v - whole;
  const f = FRAC.find(([x]) => Math.abs(x - rest) < 0.03)?.[1] ?? "";
  return `${whole || !f ? whole : ""}${f}`;
}
function parseSM(v: string): number | null {
  const m = /^(\d+)?\s*(?:(\d+)\/(\d+))?$/.exec(v.trim());
  if (!m || (!m[1] && !m[2])) return null;
  return (m[1] ? Number(m[1]) : 0) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
}
/** comparable RVR (hundreds of feet) of a visibility in statute miles */
const RVR_EQ: [number, number][] = [
  [0.25, 16],
  [0.5, 24],
  [0.625, 32],
  [0.75, 40],
  [0.875, 45],
  [1, 50],
  [1.25, 60],
];
type VisFmt = "us" | "metric";
/** straight-in visibility: 'RVR 24 or ½' (US) / 'RVR 750m' (ICAO); vis may be an RVR string ('RVR 1200') */
function visStraight(vis: string | number, fmt: VisFmt): string {
  if (typeof vis === "string") {
    const r = /RVR\s*(\d+)/i.exec(vis);
    if (r)
      return fmt === "metric"
        ? `RVR ${Math.round((Number(r[1]) * 0.3048) / 25) * 25}m`
        : `RVR ${r[1]}`;
  }
  const sm = typeof vis === "number" ? vis : parseSM(vis);
  if (sm === null) return String(vis);
  const rvr = RVR_EQ.find(([x]) => Math.abs(x - sm) < 0.01)?.[1];
  if (fmt === "metric")
    return rvr
      ? `RVR ${Math.round((rvr * 100 * 0.3048) / 50) * 50}m`
      : `VIS ${Math.round((sm * 1609) / 100) * 100}m`;
  return rvr ? `RVR ${rvr} or ${fracSM(sm)}` : fracSM(sm);
}
/** circling visibility: statute miles only (US) / metres (ICAO) */
function visCircle(sm: number, fmt: VisFmt): string {
  return fmt === "metric"
    ? `${Math.round((sm * 1609) / 100) * 100}m`
    : fracSM(sm);
}

// ------------------------------------------------------------------ approach plate
function holdExtent(
  fix: LatLon,
  h: { inbound: number; turn: "R" | "L" },
): LatLon[] {
  const s = h.turn === "R" ? 1 : -1;
  const back = destination(fix, h.inbound + 180, 2.6);
  return [
    back,
    destination(back, h.inbound + 90 * s, 1.4),
    destination(fix, h.inbound + 90 * s, 1.4),
  ];
}
/**
 * Points the plan view must show, and the missed-approach fixes left out because they are far beyond the rest
 * of the procedure (drawn as a leg leaving the frame plus an inset with the hold, as on published charts).
 */
function planPoints(ap: Approach): { pts: LatLon[]; offscale: Set<string> } {
  const apt = airport(ap.airport);
  const nav = ap.navaid ? navaid(ap.navaid) : undefined;
  const core: LatLon[] = [apt];
  const addLeg = (l: ProcLeg, to: LatLon[]) => {
    to.push(l.fix);
    if (l.hold) to.push(...holdExtent(l.fix, l.hold));
    if (l.pt)
      to.push(
        destination(l.fix, l.pt.outbound, 5),
        destination(destination(l.fix, l.pt.outbound, 2.6), l.pt.outbound + (l.pt.side === "L" ? -45 : 45), 2),
      );
  };
  for (const l of [...ap.transitions.flatMap((t) => t.legs), ...ap.final]) addLeg(l, core);
  if (nav && nav.type !== "ILS" && nav.type !== "LOC") core.push(nav);
  // extent of the approach itself
  const loc = core.map((p) => toLocal(apt, p));
  const cx = (Math.min(...loc.map((p) => p.x)) + Math.max(...loc.map((p) => p.x))) / 2,
    cy = (Math.min(...loc.map((p) => p.y)) + Math.max(...loc.map((p) => p.y))) / 2;
  const R = Math.max(4, ...loc.map((p) => Math.hypot(p.x - cx, p.y - cy)));
  const offscale = new Set<string>();
  const pts = [...core];
  let off = false;
  for (const l of ap.missed.slice(1)) {
    const q = toLocal(apt, l.fix);
    if (!off && Math.hypot(q.x - cx, q.y - cy) > Math.max(R * 2, R + 10)) off = true;
    if (off) offscale.add(l.fix.ident);
    else addLeg(l, pts);
  }
  // a fix that is also part of the approach itself is never off scale
  for (const l of [...ap.transitions.flatMap((t) => t.legs), ...ap.final]) offscale.delete(l.fix.ident);
  return { pts, offscale };
}

/** Projection used by the plan view, so the UI can draw own-ship on the plate. */
export function planProjection(ap: Approach): {
  proj: (p: LatLon) => { x: number; y: number };
  box: typeof PLAN_BOX;
} {
  return { proj: makeProj(planPoints(ap).pts, PLAN_BOX, 46), box: PLAN_BOX };
}

function navTypeLabel(ap: Approach, nav?: Navaid): string {
  if (!nav) return ap.gsAngle ? "WAAS CH" : "RNAV (GPS)";
  if (ap.type === "LDA") return nav.dme ? "LDA/DME" : "LDA";
  if (ap.type === "LOCBC") return "LOC BC";
  if (nav.type === "ILS") return nav.dme ? "ILS/DME" : "ILS";
  if (nav.type === "LOC") return nav.dme ? "LOC/DME" : "LOC";
  if (nav.type === "NDB") return "NDB";
  return nav.type === "VORDME" ? "VOR/DME" : "VOR";
}
/** Jeppesen chart index: 11-x ILS/LOC, 12-x RNAV, 13-x VOR/NDB */
function chartNumber(ap: Approach): string {
  const series = (t: Approach["type"]) =>
    t === "RNAV" ? 12 : t === "VOR" || t === "NDB" ? 13 : 11;
  const s = series(ap.type);
  const same = APPROACHES.filter(
    (x) => x.airport === ap.airport && series(x.type) === s,
  );
  const i = Math.max(
    0,
    same.findIndex((x) => x.id === ap.id),
  );
  return `${s}-${i + 1}`;
}
/** approach / tower facility name from the city: 'PARIS (ORLY, VAL-DE-MARNE)' → 'PARIS', 'PORT ARDENT' → 'ARDENT' */
const facility = (city: string) =>
  cityName(city).toUpperCase().replace(/^PORT /, "").split(/[,/]/)[0].trim();
const cityName = (city: string) => city.replace(/\s*\(.*$/, "").trim();

/** missed-approach parse: first climb altitude and whether the missed approach turns before proceeding */
function missedPlan(ap: Approach, rwyElev: number) {
  const t = ap.missedText;
  const climbTo =
    Number(
      /climb(?:ing)?(?: straight ahead)?(?: on [^,]*?)? to (\d{3,5})/i.exec(
        t,
      )?.[1] ?? 0,
    ) || undefined;
  const turnWord =
    /\b(right|left)\b[^.]*?\bturn\b|\bturn\b[^.]*?\b(right|left)\b/i.exec(t);
  const textTurn = turnWord
    ? (turnWord[1] ?? turnWord[2]).toUpperCase() === "RIGHT"
      ? "R"
      : "L"
    : null;
  const then = /\bthen\b/i.test(t);
  const lastAlt = [...ap.missed].reverse().find((l) => l.altMin)?.altMin;
  // a climb before the turn: drawn along the final course for the distance of a 200 ft/NM climb
  const preTurnNm =
    textTurn && then && climbTo
      ? Math.max(0.8, Math.min(3.5, (climbTo - rwyElev) / 220))
      : 0;
  return { climbTo: climbTo ?? lastAlt, lastAlt, textTurn, preTurnNm };
}

export function approachPlate(ap: Approach): string {
  const apt = airport(ap.airport);
  const rwy = runway(ap.airport, ap.runway);
  const nav = ap.navaid ? navaid(ap.navaid) : undefined;
  const uid = ap.id.replace(/[^a-z0-9]/gi, "");
  beginLayout(ap.id);
  const o: string[] = [];
  const allLegs: ProcLeg[] = [
    ...ap.transitions.flatMap((t) => t.legs),
    ...ap.final,
    ...ap.missed,
  ];
  const faf = ap.final.find((l) => l.role === "FAF");
  const precision = !!ap.gsAngle;
  const rnav = ap.type === "RNAV";
  const dmin =
    ap.minimums.find((m) => !/CIRCL/i.test(m.label)) ?? ap.minimums[0];
  const minAlt = dmin.da ?? dmin.mda ?? rwy.elevFt + 400;
  const straightIn = ap.minimums.some((m) => !/CIRCL/i.test(m.label));
  const fmt: VisFmt = ap.source === "Generated" ? "metric" : "us";
  const fafAlt = faf?.altMin ?? 0;
  const mp = missedPlan(ap, rwy.elevFt);

  o.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
  o.push(
    `<style>.p-${uid} text{font-family:${FONT};fill:${INK}} .p-${uid} .hl{paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}</style>`,
  );
  o.push(`<g class="p-${uid}">`);
  o.push(rect(10, 10, W - 20, H - 20, { sw: 1.6 }));

  // ---------------------------------------------- heading (Jeppesen: ident + elevation left, index + title right)
  o.push(text(20, 30, apt.icao, { size: 17, weight: 700, halo: false }));
  o.push(
    text(20 + textW(apt.icao, 17, true) + 10, 30, `Apt Elev ${apt.elevFt}'`, {
      size: 9.5,
      halo: false,
    }),
  );
  o.push(
    text(
      20,
      47,
      `${apt.name.toUpperCase()}${apt.city && !apt.name.toUpperCase().includes(cityName(apt.city).toUpperCase()) ? `, ${cityName(apt.city).toUpperCase()}` : ""}`,
      { size: 9.5, weight: 700, halo: false },
    ),
  );
  o.push(
    text(W - 20, 24, `${chartNumber(ap)}   ·   Eff ${EFF}`, {
      size: 8.5,
      anchor: "end",
      halo: false,
    }),
  );
  o.push(
    text(W - 20, 46, ap.name, {
      size: 19,
      weight: 700,
      anchor: "end",
      halo: false,
    }),
  );
  o.push(line({ x: 10, y: L.comm.y }, { x: W - 10, y: L.comm.y }, 1.2));

  // ---------------------------------------------- communications row
  const fq = apt.freqs;
  const fac = facility(apt.city || apt.name);
  const comms: [string, string][] = (
    [
      ["ATIS", fq.atis],
      [`${fac} Approach`, fq.approach],
      fq.tower ? [`${fac} Tower`, fq.tower] : ["CTAF", fq.ctaf],
      fq.ground
        ? ["Ground", fq.ground]
        : ["UNICOM", fq.unicom ?? (fq.tower ? undefined : fq.ctaf)],
    ] as [string, number | undefined][]
  )
    .filter((c) => c[1])
    .map((c) => [c[0], freq(c[1])]);
  const ccw = (W - 20) / Math.max(1, comms.length);
  comms.forEach((c, i) => {
    if (i)
      o.push(
        line(
          { x: 10 + i * ccw, y: L.comm.y },
          { x: 10 + i * ccw, y: L.comm.y + L.comm.h },
        ),
      );
    o.push(text(16 + i * ccw, L.comm.y + 14, c[0], { size: 8.5, halo: false }));
    o.push(
      text(10 + (i + 1) * ccw - 6, L.comm.y + 14.5, c[1], {
        size: 11,
        weight: 700,
        anchor: "end",
        halo: false,
      }),
    );
  });
  o.push(line({ x: 10, y: L.brief.y }, { x: W - 10, y: L.brief.y }));

  // ---------------------------------------------- briefing strip
  const crsShown = ap.finalCourse; // inbound course flown (a back course is flown on its inbound course)
  const cells: [string, string, string?][] = [
    [
      navTypeLabel(ap, nav),
      nav
        ? navFreq(nav)
        : precision
          ? `${5}${String(Math.round(ap.finalCourse * 7 + Number(ap.runway.replace(/\D/g, "")) * 13) % 10000).padStart(4, "0")}`
          : "GPS",
      nav ? identTxt(nav) : `W${ap.runway}A`,
    ],
    [
      "Final Apch Crs",
      `${pad3(crsShown)}°`,
      ap.crsSetting !== undefined ? `set ${pad3(ap.crsSetting)}°` : undefined,
    ],
    [
      precision
        ? `${ap.type === "ILS" ? "GS" : "GP"} ${faf?.fix.ident ?? ""}`
        : `${faf?.fix.ident ?? "FAF"}`,
      fafAlt ? `${fafAlt}'` : "—",
      fafAlt ? `(${fafAlt - rwy.elevFt}')` : undefined,
    ],
    [
      `${
        dmin.label
          .replace(/^S-/, "")
          .replace(new RegExp(`\\s*${ap.runway}\\b`), "")
          .trim() || ap.type
      } ${dmin.da !== undefined ? "DA(H)" : "MDA(H)"}`,
      `${minAlt}'`,
      `(${dmin.hat}')`,
    ],
    [
      `Rwy ${ap.runway}  ${rwy.lengthFt}'`,
      `TDZE ${rwy.elevFt}'`,
      `Apt ${apt.elevFt}'`,
    ],
  ];
  const cw = (W - 20) / cells.length;
  cells.forEach((c, i) => {
    const x = 10 + i * cw;
    if (i) o.push(line({ x, y: L.brief.y }, { x, y: L.brief.y + L.brief.h }));
    o.push(text(x + 6, L.brief.y + 12, c[0], { size: 8.5, halo: false }));
    o.push(
      text(x + 6, L.brief.y + 30, c[1], { size: 14, weight: 700, halo: false }),
    );
    if (c[2])
      o.push(
        text(x + cw - 6, L.brief.y + 30, c[2], {
          size: 9,
          anchor: "end",
          halo: false,
        }),
      );
  });
  o.push(line({ x: 10, y: L.miss.y }, { x: W - 10, y: L.miss.y }));
  // missed approach (wrapped, two lines)
  {
    const lab = "MISSED APCH:";
    const lw = textW(lab, 9, true) + 6;
    const words = ap.missedText.split(" ");
    const lines: string[] = [""];
    for (const w of words) {
      const cur = lines[lines.length - 1];
      const avail = W - 40 - (lines.length === 1 ? lw : 0);
      if (cur && textW(cur + " " + w, 9.5) > avail) lines.push("");
      lines[lines.length - 1] += (lines[lines.length - 1] ? " " : "") + w;
    }
    o.push(text(20, L.miss.y + 11, lab, { size: 9, weight: 700, halo: false }));
    lines
      .slice(0, 2)
      .forEach((l, i) =>
        o.push(
          text(i ? 20 : 20 + lw, L.miss.y + 11 + i * 11, l, {
            size: 9.5,
            halo: false,
          }),
        ),
      );
  }
  o.push(line({ x: 10, y: L.notes.y }, { x: W - 10, y: L.notes.y }));
  // notes + MSA
  const notes = [...ap.notes];
  if (
    ap.type === "LOCBC" &&
    ap.crsSetting !== undefined &&
    !notes.some((n) => /front course/i.test(n))
  )
    notes.push(
      `Back course: set ${pad3(ap.crsSetting)}° (front course) on the HSI.`,
    );
  if (!rnav && nav?.dme && !notes.some((n) => /DME required/i.test(n)))
    notes.push("DME required.");
  if (precision && !notes.some((n) => /TCH/.test(n)))
    notes.push(
      `${ap.type === "ILS" ? "Glide slope" : "Glidepath"} ${ap.gsAngle!.toFixed(2)}°, TCH ${ap.tch ?? 50}'.`,
    );
  {
    const nl: string[] = [];
    for (const n of notes) {
      let cur = "";
      for (const w of n.split(" ")) {
        if (cur && textW(cur + " " + w, 8.5) > W - 175) {
          nl.push(cur);
          cur = "  " + w;
        } else cur += (cur ? " " : "") + w;
      }
      nl.push(cur);
    }
    nl.slice(0, 5).forEach((n, i) =>
      o.push(
        text(20, L.notes.y + 12 + i * 10.5, n, { size: 8.5, halo: false }),
      ),
    );
  }
  o.push(
    line(
      { x: W - 140, y: L.notes.y },
      { x: W - 140, y: L.notes.y + L.notes.h },
    ),
  );
  {
    const mx = W - 75,
      my = L.notes.y + L.notes.h / 2,
      r = 23;
    o.push(
      `<circle cx="${mx}" cy="${P(my)}" r="${r}" fill="#fff" stroke="${INK}" stroke-width="1.1"/>`,
    );
    o.push(
      text(mx, my + 5, `${ap.msa.alt}`, {
        size: 13,
        weight: 700,
        anchor: "middle",
        halo: false,
      }),
    );
    o.push(
      text(mx, my - 9, "MSA", {
        size: 7,
        weight: 700,
        anchor: "middle",
        halo: false,
      }),
    );
    o.push(
      text(mx, my + 15, `${ap.msa.center}`, {
        size: 7,
        anchor: "middle",
        halo: false,
      }),
    );
    o.push(text(mx + r + 6, my + 3, "25 NM", { size: 7, halo: false }));
  }

  // ---------------------------------------------- plan view
  // Geometry first (every line registered with the placer), then labels where they cross nothing:
  // fix names, navaid boxes, leg courses, hold courses, annotations.
  const pv = PLAN_BOX;
  o.push(
    `<clipPath id="pv-${uid}"><rect x="${pv.x}" y="${pv.y}" width="${pv.w}" height="${pv.h}"/></clipPath>`,
  );
  o.push(`<g clip-path="url(#pv-${uid})">`);
  const plan = planPoints(ap);
  const offscale = plan.offscale;
  const proj = makeProj(plan.pts, pv, 46);
  o.push(terrainLayer(ap.id, proj, pv, apt.elevFt));
  const placer = new Placer(pv);
  const later: (() => string)[] = [];
  /** hold courses: placed right after the fix names, before the (more flexible) leg labels */
  const holdLater: (() => string)[] = [];
  /** free-standing annotations (navaid box of the localizer, 10 NM, spot heights): placed last */
  const lastLater: (() => string)[] = [];
  const geo: string[] = [];
  // keep the corners clear for the north arrow and the scale bar
  placer.block(pv.x, pv.y, 34, 46);
  const nm5 = Math.min(5 * proj.scale, 150);
  placer.block(pv.x + pv.w - nm5 - 34, pv.y + pv.h - 30, nm5 + 34, 30);
  // inset for a missed-approach fix / hold far beyond the approach (in the corner it lies towards)
  const offLeg = [...ap.missed].reverse().find((l) => offscale.has(l.fix.ident));
  let inset: Box | null = null;
  if (offLeg) {
    const q = proj(offLeg.fix),
      c0 = proj(apt);
    const iw = 138,
      ih = 100;
    const right = q.x > c0.x,
      bottom = q.y > c0.y;
    const corner = (r: boolean, bt: boolean): Box => ({
      x: r ? pv.x + pv.w - 6 - iw : pv.x + (bt ? 6 : 40),
      y: bt ? pv.y + pv.h - 6 - ih - (r ? 30 : 0) : pv.y + 6,
      w: iw,
      h: ih,
    });
    // the corner the fix lies towards, unless the approach itself (fixes, legs, the airport) is there:
    // then the free corner that hides the least of it
    const onScale = [
      ...ap.transitions.map((t) => t.legs),
      ap.final,
      ap.missed,
    ].map((ls) => ls.filter((l) => !offscale.has(l.fix.ident)).map((l) => proj(l.fix)));
    const rwyPts = [rwy.threshold, rwy.end].map((e) => proj(e));
    const hits = (b: Box) => {
      const g = { x: b.x - 10, y: b.y - 10, w: b.w + 20, h: b.h + 20 };
      const inB = (p: Pt) => p.x > g.x && p.x < g.x + g.w && p.y > g.y && p.y < g.y + g.h;
      let n = 0;
      for (const ls of onScale) {
        for (const p of ls) if (inB(p)) n += 10;
        for (let i = 1; i < ls.length; i++) if (polysOverlap([ls[i - 1], ls[i]], boxPoly(g))) n += 3;
      }
      if (polysOverlap(rwyPts, boxPoly(g))) n += 30;
      return n;
    };
    const cands = [
      corner(right, bottom),
      corner(right, !bottom),
      corner(!right, bottom),
      corner(!right, !bottom),
    ];
    inset = cands.reduce((best, b) => (hits(b) < hits(best) ? b : best), cands[0]);
    placer.block(inset.x - 2, inset.y - 2, inset.w + 4, inset.h + 4);
  }
  // 10 NM ring around the airport (FAA)
  {
    const c = proj(apt);
    const r = 10 * proj.scale;
    if (r < pv.w * 0.9) {
      geo.push(
        `<circle cx="${P(c.x)}" cy="${P(c.y)}" r="${P(r)}" fill="none" stroke="${INK}" stroke-width="0.6" stroke-dasharray="3 4"/>`,
      );
      lastLater.push(() => {
        for (const a of [-0.75, -2.4, 0.75, 2.4, -1.57, 1.57]) {
          const t = { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
          const b = {
            x: t.x + 3,
            y: t.y - 10,
            w: textW("10 NM", 7.5) + 4,
            h: 10,
          };
          if (placer.free(b)) {
            placer.commit(boxPoly(b), "10 NM");
            return text(b.x + 2, b.y + 8, "10 NM", { size: 7.5 });
          }
        }
        return "";
      });
    }
  }
  // localizer feather along the final approach course (right half shaded, as seen inbound)
  if (nav && (nav.type === "ILS" || nav.type === "LOC")) {
    const ant = proj(nav);
    const crs = nav.course ?? ap.finalCourse;
    // a fixed-size feather (as printed on FAA / Jeppesen plates: ~1 inch, narrow, notched), starting just
    // beyond the runway end it extends from, so it never hides the runway, the fixes or the final course
    const feather = (dir: number, shade: number) => {
      const one = proj(destination(nav, dir, 1));
      const len = Math.hypot(one.x - ant.x, one.y - ant.y) || 1;
      const u = { x: (one.x - ant.x) / len, y: (one.y - ant.y) / len };
      const n = { x: -u.y, y: u.x };
      // along-track distance (px) of the farthest runway end in that direction
      let s0 = 0;
      for (const e of [rwy.threshold, rwy.end]) {
        const q = proj(e);
        s0 = Math.max(s0, (q.x - ant.x) * u.x + (q.y - ant.y) * u.y);
      }
      s0 += 4;
      const fafPx = faf ? Math.hypot(proj(faf.fix).x - ant.x, proj(faf.fix).y - ant.y) : s0 + 120;
      const fLen = Math.max(34, Math.min(70, (fafPx - s0) * 0.8));
      const hw = 5;
      const at = (s: number, w: number): Pt => ({
        x: ant.x + u.x * s + n.x * w,
        y: ant.y + u.y * s + n.y * w,
      });
      const t = at(s0, 0),
        l = at(s0 + fLen, hw),
        r = at(s0 + fLen, -hw),
        m = at(s0 + fLen - 6, 0);
      const half = (q: Pt, fill: string) =>
        `<path d="M${P(t.x)},${P(t.y)} L${P(q.x)},${P(q.y)} L${P(m.x)},${P(m.y)} Z" fill="${fill}" stroke="${INK}" stroke-width="0.6" stroke-linejoin="round"/>`;
      geo.push(half(l, shade > 0 ? "#fff" : "#7a7a7a"), half(r, shade > 0 ? "#7a7a7a" : "#fff"));
      placer.softPoly([t, l, m, r]);
      return at(s0 + fLen, 0);
    };
    const featherEnd = feather(crs + 180, ap.type === "LOCBC" ? -1 : 1);
    if (ap.type === "LOCBC") feather(crs, 1);
    // navaid box near the outer end of the feather
    lastLater.push(() => {
      const lbl = [
        navTypeLabel(ap, nav),
        `${nav.freq.toFixed(2)}  ${identTxt(nav)}`,
        `${pad3(ap.type === "LOCBC" ? ap.finalCourse : crs)}°${nav.dme ? `  ·  Chan ${Math.round((nav.freq - 108) * 20 + 17)}` : ""}`,
      ];
      const fp = featherEnd;
      const bw = Math.max(...lbl.map((t, i) => textW(t, 8.5, i === 1) + 12)),
        bh = 33;
      const b = placer.place(fp.x, fp.y, bw, bh, 14, lbl.join(" "));
      if (!b) return "";
      return (
        `<rect x="${P(b.x)}" y="${P(b.y)}" width="${P(bw)}" height="${bh}" fill="#fff" stroke="${INK}" stroke-width="0.9"/>` +
        lbl
          .map((t, i) =>
            text(b.x + bw / 2, b.y + 10.5 + i * 10, t, {
              size: 8.5,
              weight: i === 1 ? 700 : 400,
              anchor: "middle",
              halo: false,
            }),
          )
          .join("")
      );
    });
  }
  // fix symbols: blocked first so no label lands on them
  const symbols = new Map<string, { leg: ProcLeg; p: Pt }>();
  for (const l of allLegs)
    if (
      !symbols.has(l.fix.ident) &&
      !offscale.has(l.fix.ident) &&
      l.fix.kind !== "runway" &&
      l.fix.kind !== "airport"
    )
      symbols.set(l.fix.ident, { leg: l, p: proj(l.fix) });
  // the role shown is the most significant one the fix has anywhere in the procedure
  const roleOf = (ident: string) => {
    const roles = allLegs
      .filter((l) => l.fix.ident === ident && l.role)
      .map((l) => l.role!);
    for (const r of ["FAF", "IF", "IAF", "MAHP", "MAP"] as const)
      if (roles.includes(r))
        return r === "IF" && roles.includes("IAF") ? "IAF/IF" : r;
    return "";
  };
  const navOf = (f: Fix) => NAVAIDS.find((x) => x.ident === f.ident);
  for (const { p, leg } of symbols.values()) {
    if (leg.fix.kind === "vor" || leg.fix.kind === "ndb") placer.circle(p, 10);
    else placer.block(p.x - 7, p.y - 7, 14, 14);
  }
  // navaid used for the final that is not a fix of the procedure
  if (
    nav &&
    nav.type !== "ILS" &&
    nav.type !== "LOC" &&
    !symbols.has(nav.ident)
  )
    placer.circle(proj(nav), 10);
  // which fix altitudes are already printed on an incoming leg label
  const altOnLeg = new Set<string>();
  const segDone = new Set<string>();
  const hasReversal = ap.transitions.some((t) =>
    t.legs.some((l) => l.pt || l.hilpt),
  );
  const legSegs = (
    crs: number,
    dist: number | null,
    alt?: number,
    altMax?: number,
    extra?: string,
  ): Seg[] => [
    { t: `${pad3(crs)}°` },
    ...(dist !== null ? [{ t: ` (${distTxt(dist)})`, b: false }] : []),
    ...(alt || altMax ? [{ t: "  " }, ...altSegs(alt, altMax)] : []),
    ...(extra ? [{ t: `  ${extra}`, b: false }] : []),
  ];
  // course reversals and arcs of the transitions, then straight legs
  const holdsDone = new Set<string>();
  const drawHold = (l: ProcLeg, dashed: boolean) => {
    if (!l.hold) return;
    const k = `${l.fix.ident}-${Math.round(l.hold.inbound)}`;
    if (holdsDone.has(k)) return;
    holdsDone.add(k);
    geo.push(
      holdPattern(
        proj(l.fix),
        l.hold.inbound,
        l.hold.turn,
        l.hold.legMin,
        proj.scale,
        placer,
        { dashed, id: `hold ${l.fix.ident}`, later: holdLater },
      ),
    );
  };
  for (const t of ap.transitions) {
    for (let i = 0; i < t.legs.length; i++) {
      const l = t.legs[i];
      if (l.pt) {
        const ob = l.pt.outbound;
        const s45 = ob + (l.pt.side === "L" ? -45 : 45);
        const p0 = proj(l.fix),
          p1 = proj(destination(l.fix, ob, 5));
        const b0 = destination(l.fix, ob, 2.6);
        const tip = destination(b0, s45, 1.8);
        geo.push(
          line(p0, p1, 1.2) +
            arrowHead(p1, Math.atan2(p1.y - p0.y, p1.x - p0.x)),
        );
        const bb = proj(b0),
          b1 = proj(tip);
        geo.push(
          line(bb, b1, 1.2) +
            arrowHead(b1, Math.atan2(b1.y - bb.y, b1.x - bb.x)),
        );
        const back = proj(
          destination(tip, ob + 180 + (l.pt.side === "L" ? 45 : -45), 1.3),
        );
        geo.push(
          line(b1, back, 1.2) +
            arrowHead(back, Math.atan2(back.y - b1.y, back.x - b1.x)),
        );
        placer.polyline([p0, p1]);
        placer.polyline([bb, b1, back]);
        const pt = l.pt;
        later.push(() =>
          legLabel(p0, p1, [{ t: `${pad3(ob)}°` }], placer, {
            size: 8.5,
            id: `PT outbound ${l.fix.ident}`,
          }),
        );
        later.push(() =>
          legLabel(bb, b1, [{ t: `${pad3(s45)}°` }], placer, {
            size: 8.5,
            id: `PT ${l.fix.ident}`,
          }),
        );
        later.push(() =>
          legLabel(b1, back, [{ t: `${pad3(s45 + 180)}°` }], placer, {
            size: 8.5,
            id: `PT inbound ${l.fix.ident}`,
          }),
        );
        later.push(() => {
          const lp = proj(destination(tip, ob, 1.2));
          const t1 = `Procedure turn  ${l.altMin ?? ""}`;
          const tt = `Remain within ${pt.withinNm} NM`;
          const bx = placer.place(
            lp.x,
            lp.y,
            Math.max(textW(t1, 8.5, true), textW(tt, 8.5)) + 8,
            24,
            4,
            `${t1} ${tt}`,
          );
          if (!bx) return "";
          return (
            text(bx.x + 4, bx.y + 10, t1, { size: 8.5, weight: 700 }) +
            text(bx.x + 4, bx.y + 21, tt, { size: 8.5 })
          );
        });
      }
      if (l.hilpt) drawHold(l, false);
      if (i === 0) continue;
      const prev = t.legs[i - 1];
      const key = `${prev.fix.ident}>${l.fix.ident}`;
      if (segDone.has(key) || distanceNm(prev.fix, l.fix) < 0.05) continue;
      segDone.add(key);
      const a = proj(prev.fix);
      const b = proj(l.fix);
      if (l.arc) {
        const c = NAVAIDS.find((n) => n.ident === l.arc!.center);
        if (c) {
          const r = l.arc.radius * proj.scale;
          const b0 = bearingDeg(c, prev.fix),
            b1 = bearingDeg(c, l.fix);
          let sweep = norm360(b1 - b0);
          if (l.arc.dir === "L") sweep -= 360;
          geo.push(
            `<path d="M${P(a.x)},${P(a.y)} A${P(r)},${P(r)} 0 ${Math.abs(sweep) > 180 ? 1 : 0} ${l.arc.dir === "R" ? 1 : 0} ${P(b.x)},${P(b.y)}" fill="none" stroke="${INK}" stroke-width="1.3"/>`,
          );
          const pts: Pt[] = [];
          for (let k = 0; k <= 16; k++)
            pts.push(proj(destination(c, b0 + (sweep * k) / 16, l.arc.radius)));
          placer.polyline(pts);
          const mid = pts[8];
          geo.push(
            arrowHead(
              mid,
              Math.atan2(pts[9].y - pts[7].y, pts[9].x - pts[7].x),
              7,
            ),
          );
          const arc = l.arc;
          altOnLeg.add(l.fix.ident);
          later.push(() => {
            const segs: Seg[] = [
              { t: `${arc.radius} DME ARC ${arc.center}` },
              ...(l.altMin
                ? [{ t: "  " }, ...altSegs(l.altMin, l.altMax)]
                : []),
            ];
            const s = legLabel(pts[6], pts[10], segs, placer, {
              size: 8.5,
              id: `arc ${prev.fix.ident}-${l.fix.ident}`,
            });
            // radial limits at both ends of the arc
            const rad = (p: LatLon, at: Pt) => {
              const tt = `R-${pad3(bearingDeg(c, p))}`;
              const bx = placer.place(
                at.x,
                at.y,
                textW(tt, 8) + 4,
                10,
                9,
                tt,
                2,
              );
              return bx ? text(bx.x + 2, bx.y + 8, tt, { size: 8 }) : "";
            };
            return s + rad(prev.fix, a) + rad(l.fix, b);
          });
        }
        continue;
      }
      geo.push(courseLine(a, b, { width: 1.2 }));
      placer.segment(a, b);
      const crs = l.course ?? bearingDeg(prev.fix, l.fix);
      const dist = l.dist ?? distanceNm(prev.fix, l.fix);
      const noPt =
        hasReversal &&
        !t.legs.some((x) => x.pt || x.hilpt) &&
        i === t.legs.length - 1;
      if (l.altMin || l.altMax) altOnLeg.add(l.fix.ident);
      later.push(() =>
        legLabel(
          a,
          b,
          legSegs(crs, dist, l.altMin, l.altMax, noPt ? "NoPT" : undefined),
          placer,
          { id: `${t.name}: ${key}` },
        ),
      );
    }
  }
  // final approach: intermediate segment, then the final approach course in bold
  let finalLabelled = false;
  for (let i = 1; i < ap.final.length; i++) {
    const from = ap.final[i - 1],
      to = ap.final[i];
    const key = `${from.fix.ident}>${to.fix.ident}`;
    if (segDone.has(key) || distanceNm(from.fix, to.fix) < 0.05) continue;
    segDone.add(key);
    const a = proj(from.fix),
      b = proj(to.fix);
    const afterFaf = ap.final.findIndex((l) => l.role === "FAF") < i && !!faf;
    geo.push(courseLine(a, b, { width: afterFaf ? 2.2 : 1.6 }));
    placer.segment(a, b);
    const crs = to.course ?? bearingDeg(from.fix, to.fix);
    const dist = to.dist ?? distanceNm(from.fix, to.fix);
    if (!afterFaf) {
      if (to.altMin || to.altMax) altOnLeg.add(to.fix.ident);
      later.push(() =>
        legLabel(a, b, legSegs(crs, dist, to.altMin, to.altMax), placer, {
          id: `final: ${key}`,
        }),
      );
    } else if (!finalLabelled) {
      // the final approach course, once, in bold
      finalLabelled = true;
      later.push(() =>
        legLabel(a, b, [{ t: `${pad3(ap.finalCourse)}°` }], placer, {
          size: 12.5,
          id: `final: ${key}`,
        }),
      );
    } else
      later.push(() =>
        legLabel(a, b, [{ t: `${pad3(crs)}°`, b: false }, { t: ` (${distTxt(dist)})`, b: false }], placer, {
          size: 8,
          id: `final: ${key}`,
        }),
      );
  }
  for (const l of ap.final) drawHold(l, false);
  for (const t of ap.transitions)
    for (const l of t.legs) if (l.hold && !l.hilpt) drawHold(l, false);
  // missed approach: dashed, with its courses (a climb before the turn is flown along the final course)
  {
    let prevPt: LatLon = ap.missed[0]?.fix ?? rwy.threshold;
    let prevOff = false;
    const legsM = ap.missed.slice(1);
    if (mp.preTurnNm && legsM.length) {
      const tp = destination(prevPt, ap.finalCourse, mp.preTurnNm);
      const a = proj(prevPt),
        b = proj(tp);
      geo.push(courseLine(a, b, { dash: true, width: 1.2 }));
      placer.segment(a, b);
      later.push(() =>
        legLabel(a, b, [{ t: `${pad3(ap.finalCourse)}°`, b: false }], placer, {
          size: 8.5,
          id: "missed: climb",
        }),
      );
      prevPt = tp;
    }
    for (const l of legsM) {
      if (distanceNm(prevPt, l.fix) < 0.05) {
        prevPt = l.fix;
        continue;
      }
      if (offscale.has(l.fix.ident)) {
        if (!prevOff) {
          // the leg leaves the frame: dashed to the edge (or the inset), with its course, fix and distance
          const a = proj(prevPt),
            far = proj(l.fix);
          const b = clipToFrame(a, far, pv, inset);
          geo.push(courseLine(a, b, { dash: true, width: 1.2 }) + arrowHead(b, Math.atan2(b.y - a.y, b.x - a.x), 7));
          placer.segment(a, b);
          const crs = bearingDeg(prevPt, l.fix);
          const dist = distanceNm(prevPt, l.fix);
          later.push(() =>
            legLabel(a, b, [{ t: `${pad3(crs)}°`, b: false }, { t: ` to ${l.fix.ident} (${distTxt(dist)})`, b: false }], placer, {
              size: 8.5,
              id: `missed: ${l.fix.ident}`,
            }),
          );
        }
        prevOff = true;
        prevPt = l.fix;
        continue;
      }
      const a = proj(prevPt),
        b = proj(l.fix);
      geo.push(courseLine(a, b, { dash: true, width: 1.2 }));
      placer.segment(a, b);
      const crs = bearingDeg(prevPt, l.fix);
      const dist = distanceNm(prevPt, l.fix);
      const id = `missed: ${l.fix.ident}`;
      later.push(() =>
        legLabel(
          a,
          b,
          [
            { t: `${pad3(crs)}°`, b: false },
            { t: ` (${distTxt(dist)})`, b: false },
          ],
          placer,
          { size: 8.5, id },
        ),
      );
      prevPt = l.fix;
    }
    for (const l of legsM) if (!offscale.has(l.fix.ident)) drawHold(l, true);
  }
  // the airport: runways outlined at their true length, or the circled airport symbol on a circling-only procedure
  if (straightIn) geo.push(runwayOutlines(proj, ap.airport, placer));
  else {
    const c = proj(apt);
    geo.push(
      `<circle cx="${P(c.x)}" cy="${P(c.y)}" r="10" fill="#fff" stroke="${INK}" stroke-width="1.3"/>`,
    );
    const rp = makeProj(
      [apt, ...apt.runways.flatMap((r) => [r.threshold, r.end])],
      { x: c.x - 7, y: c.y - 7, w: 14, h: 14 },
      0,
    );
    geo.push(runwayOutlines(rp, ap.airport, undefined, 1.6, INK));
    placer.circle(c, 11);
  }
  o.push(...geo);
  // fix and navaid symbols on top of the lines
  const roseFor = new Set(
    [
      nav?.ident,
      ...allLegs.filter((l) => l.arc).map((l) => l.arc!.center),
    ].filter(Boolean) as string[],
  );
  for (const { leg: l, p } of symbols.values()) {
    const k = symKindOf(l.fix, rnav);
    if ((k === "vor" || k === "vordme") && roseFor.has(l.fix.ident)) {
      o.push(compassRose(p.x, p.y));
      placer.ring(p, 22);
    }
    o.push(navSymbol(k, p.x, p.y));
  }
  if (
    nav &&
    nav.type !== "ILS" &&
    nav.type !== "LOC" &&
    !symbols.has(nav.ident)
  ) {
    const p = proj(nav);
    if (nav.type !== "NDB") {
      o.push(compassRose(p.x, p.y));
      placer.ring(p, 22);
    }
    o.push(
      navSymbol(
        nav.type === "NDB" ? "ndb" : nav.type === "VOR" ? "vor" : "vordme",
        p.x,
        p.y,
      ),
    );
    later.unshift(() => navBox(nav, p, placer, ""));
  }
  // spot heights (dot + elevation, the highest with an arrow)
  {
    const base = Math.ceil((apt.elevFt + 1000) / 1000) * 1000;
    spotHeights(proj, pv, base).forEach((s, i) => {
      const tt = `${Math.round(s.e / 10) * 10}`;
      lastLater.push(() => {
        if (
          placer.cost(boxPoly({ x: s.p.x - 4, y: s.p.y - 4, w: 8, h: 8 })) < 0
        )
          return "";
        const bx = placer.place(
          s.p.x,
          s.p.y,
          textW(tt, 8.5, i === 0) + 3,
          10,
          4,
          tt,
          1,
        );
        if (!bx) return "";
        placer.block(s.p.x - 3, s.p.y - 3, 6, 6);
        const sym =
          i === 0
            ? `<path d="M${P(s.p.x)},${P(s.p.y - 5)} l3.2,5.5 h-6.4 z" fill="${INK}"/>`
            : `<circle cx="${P(s.p.x)}" cy="${P(s.p.y)}" r="1.6" fill="${INK}"/>`;
        return (
          sym +
          text(bx.x + 1.5, bx.y + 8.5, tt, {
            size: 8.5,
            weight: i === 0 ? 700 : 400,
          })
        );
      });
    });
  }
  // fix names (with role and DME), placed before the leg labels but out of the legs' label strips if possible
  placer.reserveLegCorridors();
  const dmeNav = !rnav && nav?.dme ? nav : undefined;
  const fixLabels: string[] = [];
  for (const { leg: l, p } of symbols.values()) {
    const n = navOf(l.fix);
    const role = roleOf(l.fix.ident);
    if ((l.fix.kind === "vor" || l.fix.kind === "ndb") && n) {
      fixLabels.push(navBox(n, p, placer, role));
      continue;
    }
    const name: Seg[] = [
      { t: l.fix.ident, b: true, size: 10 },
      ...(role ? [{ t: `  ${role}`, b: false, size: 8 }] : []),
    ];
    const sub: Seg[][] = [];
    if (dmeNav && role !== "MAHP")
      sub.push([
        { t: `D${f1(distanceNm(l.fix, dmeNav))} ${identTxt(dmeNav)}` },
      ]);
    const al = allLegs.find(
      (x) =>
        x.fix.ident === l.fix.ident &&
        (x.altMin || x.altMax) &&
        x.role !== "MAP",
    );
    if (al && !altOnLeg.has(l.fix.ident) && role !== "MAHP")
      sub.push(altSegs(al.altMin, al.altMax, true));
    const w =
      Math.max(segsW(name, 10, true), ...sub.map((s) => segsW(s, 8.5, false))) +
      4;
    const h = 12 + sub.length * 10;
    const bx = placer.place(p.x, p.y, w, h, 9, l.fix.ident, 5, p) ?? placer.place(p.x, p.y, w, h, 9, l.fix.ident, 5, p, false);
    if (!bx) continue;
    if (bx.lead) fixLabels.push(line(bx.lead[0], bx.lead[1], 0.5));
    fixLabels.push(rich(bx.x + 2, bx.y + 10, name, { size: 10, bold: true }));
    sub.forEach((s, i) =>
      fixLabels.push(rich(bx.x + 2, bx.y + 21 + i * 10, s, { size: 8.5 })),
    );
  }
  o.push(...fixLabels);
  placer.reserve = [];
  for (const f of holdLater) o.push(f());
  for (const f of later) o.push(f());
  for (const f of lastLater) o.push(f());
  if (inset && offLeg) o.push(missedInset(offLeg, inset, rnav));
  o.push(`</g>`);
  // north arrow + scale bar + frame
  o.push(
    `<g transform="translate(${pv.x + 17} ${pv.y + 26})"><path d="M0,-15 L5,4 L0,1 L-5,4 Z" fill="${INK}"/><text y="15" font-size="8" text-anchor="middle" font-weight="700">N</text></g>`,
  );
  {
    const nm = nm5;
    const n = Math.round(nm / proj.scale);
    const x0 = pv.x + pv.w - nm - 22,
      y0 = pv.y + pv.h - 12;
    o.push(
      `<rect x="${P(x0 - 6)}" y="${P(y0 - 15)}" width="${P(nm + 26)}" height="22" fill="#fff" opacity="0.88"/>`,
    );
    for (let k = 0; k < n; k++)
      o.push(
        `<rect x="${P(x0 + (k * nm) / n)}" y="${P(y0 - 2)}" width="${P(nm / n)}" height="3.5" fill="${k % 2 ? "#fff" : INK}" stroke="${INK}" stroke-width="0.6"/>`,
      );
    o.push(text(x0, y0 - 5, "0", { size: 7.5, anchor: "middle" }));
    o.push(text(x0 + nm, y0 - 5, `${n}`, { size: 7.5, anchor: "middle" }));
    o.push(text(x0 + nm + 8, y0 + 2, "NM", { size: 7.5 }));
  }
  o.push(rect(pv.x, pv.y, pv.w, pv.h, { sw: 1.2 }));

  // ---------------------------------------------- profile view
  o.push(profileView(ap, mp, minAlt));

  // ---------------------------------------------- minimums by aircraft category
  const mnY = PROF.y + PROF.h;
  const straight = ap.minimums.filter((m) => !/CIRCL/i.test(m.label));
  const circle = ap.minimums.find((m) => /CIRCL/i.test(m.label));
  const rows = straight.length + (circle ? 1 : 0);
  // rows fill the space down to a ≥112 px bottom band (conversion table + airport sketch)
  const RH = Math.max(24, Math.min(34, Math.floor((H - 32 - 112 - mnY - 18) / Math.max(1, rows))));
  const dy = (RH - 24) / 2;
  const MH = 18 + rows * RH;
  const colL = 112,
    colA = 82;
  const catW = (W - 20 - colL - colA) / 4;
  const cx0 = 10 + colL;
  o.push(rect(10, mnY, W - 20, MH, { sw: 1.2 }));
  o.push(
    `<rect x="10" y="${mnY}" width="${W - 20}" height="18" fill="#ececec" stroke="${INK}"/>`,
  );
  o.push(
    text(18, mnY + 12.5, "CATEGORY", { size: 8.5, weight: 700, halo: false }),
  );
  const catSpd = ["A  <91 KT", "B  91–120", "C  121–140", "D  141–165"];
  catSpd.forEach((c, i) => {
    o.push(
      line(
        { x: cx0 + i * catW, y: mnY },
        { x: cx0 + i * catW, y: i ? mnY + 18 : mnY + MH },
        0.8,
      ),
    );
    o.push(
      text(cx0 + i * catW + catW / 2, mnY + 12.5, c, {
        size: 8.5,
        weight: 700,
        anchor: "middle",
        halo: false,
      }),
    );
  });
  o.push(
    line(
      { x: cx0 + 4 * catW, y: mnY },
      { x: cx0 + 4 * catW, y: mnY + MH },
      0.8,
    ),
  );
  o.push(
    text(cx0 + 4 * catW + colA / 2, mnY + 12.5, "ALS out", {
      size: 8.5,
      weight: 700,
      anchor: "middle",
      halo: false,
    }),
  );
  const rowName = (m: (typeof ap.minimums)[0]) => {
    let s = m.label
      .replace(/^S-/, "")
      .replace(new RegExp(`\\s*\\b${ap.runway}\\b`), "")
      .trim();
    if (!s) s = ap.type === "LOCBC" ? "LOC BC" : ap.type;
    if (s === "BC") s = "LOC BC";
    if (/^LOC$/.test(s) && precision) s = "LOC (GS out)";
    return s;
  };
  const cell = (i0: number, i1: number, y: number, a: string, v: string) => {
    const x = cx0 + i0 * catW,
      w = (i1 - i0 + 1) * catW;
    return (
      text(x + w / 2, y + 11 + dy, a, {
        size: 10.5,
        weight: 700,
        anchor: "middle",
        halo: false,
      }) +
      text(x + w / 2, y + 21.5 + dy, v, { size: 8.5, anchor: "middle", halo: false })
    );
  };
  straight.forEach((m, r) => {
    const y = mnY + 18 + r * RH;
    o.push(line({ x: 10, y }, { x: W - 10, y }, r ? 0.6 : 1));
    const isDa = m.da !== undefined;
    o.push(
      text(18, y + 11 + dy, rowName(m), { size: 9.5, weight: 700, halo: false }),
    );
    o.push(
      text(18, y + 21.5 + dy, isDa ? "DA(H)" : "MDA(H)", {
        size: 8,
        fill: MUTED,
        halo: false,
      }),
    );
    const alt = `${m.da ?? m.mda ?? 0}' (${m.hat}')`;
    const sm = parseSM(m.vis);
    if (isDa || sm === null) {
      o.push(cell(0, 3, y, alt, visStraight(m.vis, fmt)));
    } else {
      o.push(
        line(
          { x: cx0 + 2 * catW, y },
          { x: cx0 + 2 * catW, y: y + RH },
          0.8,
        ),
      );
      o.push(cell(0, 1, y, alt, visStraight(sm, fmt)));
      o.push(cell(2, 3, y, alt, visStraight(sm + (sm < 1 ? 0.5 : 0.25), fmt)));
    }
    const als = sm === null ? "NA" : visStraight(sm + (isDa ? 0.25 : 0.5), fmt);
    o.push(
      text(cx0 + 4 * catW + colA / 2, y + 16 + dy, als, {
        size: 8.5,
        anchor: "middle",
        halo: false,
      }),
    );
  });
  if (circle) {
    const y = mnY + 18 + straight.length * RH;
    o.push(line({ x: 10, y }, { x: W - 10, y }, straight.length ? 1 : 0.6));
    o.push(
      text(18, y + 11 + dy, "CIRCLE-TO-LAND", {
        size: 9.5,
        weight: 700,
        halo: false,
      }),
    );
    o.push(text(18, y + 21.5 + dy, "MDA(H)", { size: 8, fill: MUTED, halo: false }));
    for (let i = 1; i < 4; i++) o.push(line({ x: cx0 + i * catW, y }, { x: cx0 + i * catW, y: y + RH }, 0.8));
    const sm = parseSM(circle.vis) ?? 1;
    const base = circle.mda ?? 0;
    const vis = [sm, sm, Math.max(sm, 1.5), Math.max(sm, 2)];
    for (let i = 0; i < 4; i++)
      o.push(
        cell(
          i,
          i,
          y,
          `${base + i * 40}' (${circle.hat + i * 40}')`,
          visCircle(vis[i], fmt),
        ),
      );
    o.push(
      text(cx0 + 4 * catW + colA / 2, y + 16 + dy, "—", {
        size: 8.5,
        anchor: "middle",
        halo: false,
      }),
    );
  }

  // ---------------------------------------------- bottom: conversion table + airport sketch
  const bY = mnY + MH;
  const bH = H - 32 - bY;
  if (bH > 60) {
    const sk = { x: W - 250, y: bY, w: 240, h: bH };
    o.push(line({ x: sk.x, y: bY }, { x: sk.x, y: bY + bH }));
    o.push(airportSketch(ap, sk));
    o.push(conversionTable(ap, { x: 18, y: bY + 6, w: sk.x - 26 }));
  }
  // margins
  o.push(chartMargins(apt, ap.name, ap.source));
  o.push(`</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plate">${o.join("")}</svg>`;
}

/** the point where a segment leaves the frame (inset by 4 px) or enters a box, whichever comes first */
function clipToFrame(a: Pt, b: Pt, frame: Box, avoid: Box | null): Pt {
  const inside = (p: Pt) =>
    p.x > frame.x + 4 && p.y > frame.y + 4 && p.x < frame.x + frame.w - 4 && p.y < frame.y + frame.h - 4 &&
    !(avoid && p.x > avoid.x - 3 && p.y > avoid.y - 3 && p.x < avoid.x + avoid.w + 3 && p.y < avoid.y + avoid.h + 3);
  let last = a;
  for (let k = 1; k <= 200; k++) {
    const p = { x: a.x + ((b.x - a.x) * k) / 200, y: a.y + ((b.y - a.y) * k) / 200 };
    if (!inside(p)) return last;
    last = p;
  }
  return last;
}
/** inset (not to scale) with a missed-approach fix that lies far beyond the approach, and its hold */
function missedInset(l: ProcLeg, box: Box, rnav: boolean): string {
  const o: string[] = [];
  o.push(`<rect x="${P(box.x)}" y="${P(box.y)}" width="${box.w}" height="${box.h}" fill="#fff" stroke="${INK}" stroke-width="0.9"/>`);
  o.push(text(box.x + 5, box.y + 10, l.hold ? "MISSED APCH HOLD" : "MISSED APCH FIX", { size: 7.5, weight: 700, halo: false }));
  o.push(text(box.x + box.w - 5, box.y + 10, "not to scale", { size: 7, anchor: "end", fill: MUTED, halo: false }));
  const sub = new Placer({ x: box.x + 2, y: box.y + 13, w: box.w - 4, h: box.h - 15 });
  const later: (() => string)[] = [];
  let p: Pt = { x: box.x + box.w / 2, y: box.y + 14 + (box.h - 14) / 2 };
  let geo = "";
  if (l.hold) {
    // centre the racetrack in the inset
    const s = l.hold.turn === "R" ? 1 : -1;
    const u = dirVec(l.hold.inbound),
      n = dirVec(l.hold.inbound + 90 * s);
    p = { x: p.x + u.x * 22 - n.x * 10, y: p.y + u.y * 22 - n.y * 10 };
    geo = holdPattern(p, l.hold.inbound, l.hold.turn, l.hold.legMin, 1, sub, { dashed: true, id: `hold ${l.fix.ident}`, later });
  }
  sub.block(p.x - 7, p.y - 7, 14, 14);
  o.push(geo, navSymbol(symKindOf(l.fix, rnav), p.x, p.y));
  const name = l.fix.ident;
  const bx = sub.place(p.x, p.y, textW(name, 9.5, true) + 4, 12, 8, name, 3);
  if (bx) o.push(text(bx.x + 2, bx.y + 10, name, { size: 9.5, weight: 700 }));
  for (const f of later) o.push(f());
  return o.join("");
}

/** Jeppesen navaid box: name, frequency + ident, type (and role) */
export function navBox(n: Navaid, p: Pt, placer: Placer, role: string): string {
  const l1 = n.name.toUpperCase();
  const l2 = `${n.type === "VORDME" ? "D" : ""}${navFreq(n)}  ${n.ident}`;
  const l3 = `${n.type === "VORDME" ? "VOR/DME" : n.type}${role ? `  ${role}` : ""}`;
  const bw =
      Math.max(textW(l1, 8.5, true), textW(l2, 9, true), textW(l3, 7.5)) + 10,
    bh = 32;
  const bx = placer.place(p.x, p.y, bw, bh, 14, `${l1} ${l2}`, 5, p);
  if (!bx) return "";
  return (
    (bx.lead ? line(bx.lead[0], bx.lead[1], 0.5) : "") +
    `<rect x="${P(bx.x)}" y="${P(bx.y)}" width="${P(bw)}" height="${bh}" rx="2" fill="#fff" stroke="${INK}" stroke-width="0.9"/>` +
    text(bx.x + bw / 2, bx.y + 10, l1, {
      size: 8.5,
      weight: 700,
      anchor: "middle",
      halo: false,
    }) +
    text(bx.x + bw / 2, bx.y + 20.5, l2, {
      size: 9,
      weight: 700,
      anchor: "middle",
      halo: false,
    }) +
    text(bx.x + bw / 2, bx.y + 29, l3, {
      size: 7.5,
      anchor: "middle",
      halo: false,
    })
  );
}

// ------------------------------------------------------------------ profile view
function profileView(
  ap: Approach,
  mp: ReturnType<typeof missedPlan>,
  minAlt: number,
): string {
  const o: string[] = [];
  const rwy = runway(ap.airport, ap.runway);
  const nav = ap.navaid ? navaid(ap.navaid) : undefined;
  const precision = !!ap.gsAngle;
  const pr = PROF;
  const faf = ap.final.find((l) => l.role === "FAF");
  const fafAlt = faf?.altMin ?? 0;
  const tch = ap.tch ?? 50;
  o.push(line({ x: 10, y: pr.y + pr.h }, { x: W - 10, y: pr.y + pr.h }, 1.2));
  const fin = ap.final;
  const dists = fin.map((l) =>
    l.fix.kind === "runway" ? 0 : distanceNm(l.fix, rwy.threshold),
  );
  const maxD = Math.max(...dists, 1) * 1.04 + 0.3;
  const maxAlt =
    Math.max(...fin.map((l) => l.altMin ?? 0), rwy.elevFt + 1000) + 450;
  const xL = 44,
    xR = W - 168;
  const px = (d: number) => xR - (d / maxD) * (xR - xL);
  const gy = pr.y + pr.h - 24;
  const top = pr.y + 34;
  const py = (alt: number) =>
    gy - ((alt - rwy.elevFt) / (maxAlt - rwy.elevFt)) * (gy - top);
  const pl = new Placer({ x: 12, y: pr.y + 2, w: W - 24, h: pr.h - 4 });
  // ground with hatching, runway
  o.push(line({ x: xL - 24, y: gy }, { x: xR + 16, y: gy }, 1.2));
  for (let x = xL - 20; x < xR + 16; x += 7)
    o.push(line({ x, y: gy }, { x: x - 4, y: gy + 4 }, 0.5));
  o.push(
    `<rect x="${P(px(0) - 2)}" y="${P(gy - 3)}" width="22" height="4" fill="${INK}"/>`,
  );
  pl.block(px(0) - 2, gy - 3, 22, 5);
  o.push(
    text(px(0) + 9, gy + 13, `TDZE ${rwy.elevFt}'`, {
      size: 8,
      anchor: "middle",
      halo: false,
    }),
  );
  pl.block(px(0) - 14, gy + 4, 48, 11);
  o.push(
    text(px(0) + 9, gy + 21.5, `Rwy ${ap.runway}`, {
      size: 7.5,
      anchor: "middle",
      fill: MUTED,
      halo: false,
    }),
  );
  // vertical path
  const pts: Pt[] = [];
  const firstAlt = fin[0].altMin ?? fafAlt ?? minAlt;
  if (precision) {
    const gsFtNm = Math.tan((ap.gsAngle ?? 3) * DEG) * FT_PER_NM;
    const gAlt = fafAlt || firstAlt;
    const intercept = (gAlt - rwy.elevFt - tch) / gsFtNm;
    const x0 = px(dists[0]);
    pts.push({ x: x0, y: py(firstAlt) });
    if (firstAlt !== gAlt) {
      const xd = Math.min(
        px(intercept) - 6,
        x0 + Math.max(18, ((firstAlt - gAlt) / 500) * ((xR - xL) / maxD)),
      );
      pts.push({ x: x0 + 8, y: py(firstAlt) }, { x: xd, y: py(gAlt) });
    }
    pts.push(
      { x: px(intercept), y: py(gAlt) },
      { x: px(0), y: py(rwy.elevFt + tch) },
    );
    // LOC-only (GS out) stepdown to the MDA, dashed
    const locMin = ap.minimums.find(
      (m) => m.mda && !/CIRCL/i.test(m.label),
    )?.mda;
    if (locMin && faf) {
      const xf = px(distanceNm(faf.fix, rwy.threshold));
      const d = `M${P(xf)},${P(py(fafAlt))} L${P(Math.min(xf + 26, px(0) - 10))},${P(py(locMin))} L${P(px(0))},${P(py(locMin))}`;
      o.push(
        `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="5 3"/>`,
      );
      pl.segment({ x: xf, y: py(fafAlt) }, { x: px(0), y: py(locMin) });
      pl.segment({ x: xf + 26, y: py(locMin) }, { x: px(0), y: py(locMin) });
    }
    // GS / TCH: 18 px above the glide path, on a halo
    const gx = px(intercept * 0.42);
    const gyv = py(rwy.elevFt + tch + intercept * 0.42 * gsFtNm);
    const t1 = `${ap.type === "ILS" ? "GS" : "GP"} ${ap.gsAngle!.toFixed(2)}°`;
    const t2 = `TCH ${tch}'`;
    const bw = Math.max(textW(t1, 9, true), textW(t2, 8.5)) + 4;
    pl.commit(
      boxPoly({ x: gx - bw / 2, y: gyv - 18 - 20, w: bw, h: 22 }),
      `${t1} ${t2}`,
    );
    o.push(
      text(gx, gyv - 18 - 9, t1, { size: 9, weight: 700, anchor: "middle" }),
    );
    o.push(text(gx, gyv - 18 + 1.5, t2, { size: 8.5, anchor: "middle" }));
  } else {
    fin.forEach((l, i) => {
      const alt =
        l.role === "MAP" || i === fin.length - 1
          ? minAlt
          : (l.altMin ?? minAlt);
      const x = px(dists[i]);
      if (i === 0) pts.push({ x, y: py(alt) });
      else {
        const pa = fin[i - 1].altMin ?? alt;
        const xp = px(dists[i - 1]);
        pts.push(
          { x: Math.min(x, xp + 8), y: py(pa) },
          {
            x: Math.min(
              x,
              xp + 8 + Math.max(14, ((pa - alt) / 400) * ((xR - xL) / maxD)),
            ),
            y: py(alt),
          },
          { x, y: py(alt) },
        );
      }
    });
  }
  o.push(
    `<path d="M${pts.map((p) => `${P(p.x)},${P(p.y)}`).join(" L")}" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
  );
  pl.polyline(pts);
  // fixes: vertical lines, names + DME on top, altitudes beside the path, segment distances below the ground
  fin.forEach((l, i) => {
    const x = px(dists[i]);
    if (l.fix.kind === "runway") return;
    o.push(line({ x, y: pr.y + 26 }, { x, y: gy }, 0.6, "2 2"));
    pl.segment({ x, y: pr.y + 26 }, { x, y: gy });
    o.push(
      text(x, pr.y + 12, l.fix.ident, {
        size: 9.5,
        weight: 700,
        anchor: "middle",
        halo: false,
      }),
    );
    const dn = nav ? distanceNm(l.fix, nav) : 0;
    const sub =
      nav?.dme && ap.type !== "RNAV"
        ? dn < 0.15
          ? nav.type === "NDB" ? "NDB" : "VOR"
          : `D${f1(dn)}`
        : l.role === "MAP"
          ? "MAP"
          : `${f1(dists[i])} NM`;
    o.push(
      text(x, pr.y + 22, sub, { size: 7.5, anchor: "middle", halo: false }),
    );
    pl.block(x - 26, pr.y + 2, 52, 22);
    if (l.role === "FAF") {
      o.push(malteseCross(x, pr.y + 30, 4.5));
      pl.block(x - 5, pr.y + 25, 10, 10);
    }
  });
  // non-precision MAP at the end of the final (not the threshold): 'MAP' mark
  const mapLeg = fin[fin.length - 1];
  if (!precision && mapLeg.fix.kind !== "runway") {
    const x = px(dists[fin.length - 1]);
    o.push(
      text(x, py(minAlt) - 6, "MAP", {
        size: 8,
        weight: 700,
        anchor: "middle",
      }),
    );
    pl.block(x - 10, py(minAlt) - 15, 20, 10);
  }
  fin.forEach((l, i) => {
    if (!l.altMin || l.role === "MAP" || l.fix.kind === "runway") return;
    const segs = altSegs(l.altMin, l.altMax ?? undefined);
    segs.forEach((s) => (s.t += "'"));
    if (l.role === "FAF" && precision)
      segs.unshift({
        t: `${ap.type === "ILS" ? "GS" : "GP"} `,
        b: false,
        size: 8.5,
      });
    const w = segsW(segs, 10, true) + 2;
    const x = px(dists[i]),
      y = py(l.altMin);
    const cands = [
      { x: x - w - 3, y: y - 15 },
      { x: x + 3, y: y - 15 },
      { x: x - w - 3, y: y + 3 },
      { x: x + 3, y: y + 3 },
    ];
    const c =
      cands.find((c) => pl.cost(boxPoly({ x: c.x, y: c.y, w, h: 12 })) === 0) ??
      cands[0];
    pl.commit(
      boxPoly({ x: c.x, y: c.y, w, h: 12 }),
      segs.map((s) => s.t).join(""),
    );
    o.push(rich(c.x + 1, c.y + 10, segs, { size: 10, bold: true }));
  });
  if (precision || ap.minimums.some((m) => m.mda)) {
    const locMin = ap.minimums.find(
      (m) => m.mda && !/CIRCL/i.test(m.label),
    )?.mda;
    if (locMin) {
      const tt = precision ? `LOC MDA ${locMin}'` : `MDA ${locMin}'`;
      const w = textW(tt, 8) + 4;
      const x = px(0) - w - 10;
      // below the level segment when there is room above the ground, else above it
      const y = [py(locMin) + 3, py(locMin) - 13].find(
        (y) => y + 10 <= gy - 2 && pl.cost(boxPoly({ x, y, w, h: 10 })) === 0,
      );
      if (y !== undefined) {
        pl.commit(boxPoly({ x, y, w, h: 10 }), tt);
        o.push(text(x + 2, y + 8, tt, { size: 8 }));
      }
    }
  }
  // segment distances as dimension lines below the ground (FAA: '← 6 NM →' between the fix lines)
  for (let i = 1; i < fin.length; i++) {
    const a = px(dists[i - 1]) + 1.5,
      b = Math.min(px(dists[i]) - 1.5, px(0) - 13);
    if (b - a < 12) continue;
    const yd = gy + 11;
    const tt = `${f1(Math.abs(dists[i - 1] - dists[i]))} NM`;
    const tw = textW(tt, 7.5) + 6;
    o.push(line({ x: a, y: yd }, { x: b, y: yd }, 0.6));
    o.push(arrowHead({ x: a, y: yd }, Math.PI, 4.5), arrowHead({ x: b, y: yd }, 0, 4.5));
    if (b - a > tw + 10) {
      o.push(
        `<rect x="${P((a + b) / 2 - tw / 2)}" y="${P(yd - 5)}" width="${P(tw)}" height="10" fill="#fff"/>`,
        text((a + b) / 2, yd + 2.8, tt, { size: 7.5, anchor: "middle", halo: false }),
      );
    } else o.push(text((a + b) / 2, yd + 10, tt, { size: 7, anchor: "middle", halo: false }));
  }
  // missed approach: dashed climb from the MAP to the first icon box, then the icon boxes (climb, turn, direct, hold)
  {
    const icons = missedIcons(ap, mp);
    const bw = 66,
      bh = 26,
      gap = 4;
    const cols = icons.length > 2 ? 2 : icons.length;
    const gx0 = W - 14 - cols * bw - (cols - 1) * gap;
    const gy0 = pr.y + 40;
    const mx =
        px(mapLeg.fix.kind === "runway" ? 0 : dists[fin.length - 1]) +
        (precision ? 0 : 0),
      my = py(minAlt);
    const ex = gx0 - 3,
      ey = gy0 + bh / 2;
    const kx = Math.min(mx + 14, ex - 12);
    o.push(
      `<path d="M${P(mx)},${P(my)} L${P(kx)},${P(my - 6)} L${P(ex - 6)},${P(ey)}" fill="none" stroke="${INK}" stroke-width="1.3" stroke-dasharray="4 3"/>`,
    );
    o.push(
      arrowHead({ x: ex, y: ey }, Math.atan2(ey - (my - 6), ex - 6 - kx), 6),
    );
    icons.forEach((ic, i) => {
      const bx = gx0 + (i % cols) * (bw + gap),
        by = gy0 + Math.floor(i / cols) * (bh + gap);
      o.push(rect(bx, by, bw, bh, { fill: "#fff", sw: 1 }));
      o.push(
        `<g transform="translate(${P(bx + 4)} ${P(by + 4)})">${ic.svg}</g>`,
      );
      o.push(
        text(bx + 24 + (bw - 24) / 2, by + 17, ic.t, {
          size: ic.t.length > 6 ? 8.5 : 9.5,
          weight: 700,
          anchor: "middle",
          halo: false,
        }),
      );
    });
  }
  return o.join("");
}

/** FAA-style missed approach icons, built from the missed legs: climb, turn (only if it turns), direct, hold */
function missedIcons(
  ap: Approach,
  mp: ReturnType<typeof missedPlan>,
): { svg: string; t: string }[] {
  const S = `fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
  const head = (x: number, y: number, ang: number) => {
    const a = (d: number) =>
      `${P(x + 4.5 * Math.cos(ang + d))},${P(y + 4.5 * Math.sin(ang + d))}`;
    return `<polygon points="${P(x)},${P(y)} ${a(Math.PI - 0.5)} ${a(Math.PI + 0.5)}" fill="${INK}"/>`;
  };
  const climb = `<path d="M9,17 V4" ${S}/>${head(9, 1.5, -Math.PI / 2)}`;
  const turnR = `<path d="M5,17 V10 Q5,5 10,5 H14" ${S}/>${head(17, 5, 0)}`;
  const turnL = `<path d="M13,17 V10 Q13,5 8,5 H4" ${S}/>${head(1, 5, Math.PI)}`;
  const direct = `<path d="M1,9 H10" ${S}/>${head(12.5, 9, 0)}<polygon points="15.5,5 12.5,13 18.5,13" fill="#fff" stroke="${INK}" stroke-width="1.2"/>`;
  const hold = `<path d="M4,6 H14 A3.5,3.5 0 0 1 14,13 H4 A3.5,3.5 0 0 1 4,6 Z" ${S}/>${head(11, 6, 0)}`;
  const legs = ap.missed
    .slice(1)
    .filter(
      (l, i, a) => i === 0 || l.fix.ident !== a[i - 1].fix.ident || l.hold,
    );
  const first = legs[0];
  const last = ap.missed[ap.missed.length - 1];
  const out: { svg: string; t: string }[] = [];
  const climbAlt = mp.climbTo ?? last.altMin;
  out.push({ svg: climb, t: climbAlt ? `${climbAlt}'` : "CLIMB" });
  // does it turn? text says so, or the course to the first missed fix differs from the final course by > 20°
  let turn = mp.textTurn;
  const start = mp.preTurnNm
    ? destination(ap.missed[0].fix, ap.finalCourse, mp.preTurnNm)
    : ap.missed[0].fix;
  if (!turn && first) {
    const dc = wrap180(bearingDeg(start, first.fix) - ap.finalCourse);
    // a turn of about 180° without a published direction: no direction can be shown
    if (Math.abs(dc) > 20 && Math.abs(dc) < 165 && distanceNm(start, first.fix) > 0.2)
      turn = dc > 0 ? "R" : "L";
  }
  if (turn)
    out.push({
      svg: turn === "R" ? turnR : turnL,
      t:
        mp.lastAlt && mp.lastAlt !== climbAlt
          ? `${mp.lastAlt}'`
          : first && distanceNm(start, first.fix) > 0.2
            ? `${pad3(bearingDeg(start, first.fix))}°`
            : turn === "R"
              ? "RIGHT"
              : "LEFT",
    });
  if (first)
    out.push({
      svg: direct,
      t: first.fix.kind === "runway" ? first.fix.ident : first.fix.ident,
    });
  if (last.hold) out.push({ svg: hold, t: last.fix.ident });
  return out;
}

/** Jeppesen conversion table: groundspeed → rate of descent on the glide path / descent angle, FAF→MAP time */
function conversionTable(
  ap: Approach,
  at: { x: number; y: number; w: number },
): string {
  const o: string[] = [];
  const rwy = runway(ap.airport, ap.runway);
  const faf = ap.final.find((l) => l.role === "FAF");
  const map = ap.final[ap.final.length - 1];
  const kts = [70, 90, 100, 120, 140, 160];
  const angle =
    ap.gsAngle ??
    (faf?.altMin
      ? Math.atan(
          (faf.altMin - rwy.elevFt - 50) /
            (distanceNm(faf.fix, rwy.threshold) * FT_PER_NM),
        ) / DEG
      : 0);
  const fm = faf ? distanceNm(faf.fix, map.fix) : 0;
  const rowsT: [string, string[]][] = [["Gnd speed-Kts", kts.map(String)]];
  if (angle > 0.5)
    rowsT.push([
      `${ap.gsAngle ? (ap.type === "ILS" ? "GS" : "GP") : "Descent angle"} ${angle.toFixed(2)}°`,
      kts.map((k) =>
        String(Math.round(k * Math.tan(angle * DEG) * (FT_PER_NM / 60))),
      ),
    ]);
  if (faf && fm > 0.2)
    rowsT.push([
      `${faf.fix.ident} to MAP ${f1(fm)}`,
      kts.map((k) => {
        const s = Math.round((fm / k) * 3600);
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      }),
    ]);
  const lw = 104;
  const cwT = (at.w - lw) / kts.length;
  const rh = 15;
  o.push(rect(at.x, at.y, at.w, rh * rowsT.length, { sw: 0.8 }));
  rowsT.forEach(([lab, vals], r) => {
    const y = at.y + r * rh;
    if (r) o.push(line({ x: at.x, y }, { x: at.x + at.w, y }, 0.6));
    o.push(
      text(at.x + 5, y + 11, lab, {
        size: 8.5,
        weight: r ? 400 : 700,
        halo: false,
      }),
    );
    vals.forEach((v, i) => {
      const x = at.x + lw + i * cwT;
      if (r === 0)
        o.push(line({ x, y: at.y }, { x, y: at.y + rh * rowsT.length }, 0.6));
      o.push(
        text(x + cwT / 2, y + 11, v, {
          size: 9,
          weight: r ? 400 : 700,
          anchor: "middle",
          halo: false,
        }),
      );
    });
  });
  const ny = at.y + rh * rowsT.length + 12;
  const mapTxt =
    map.fix.kind === "runway"
      ? `MAP at ${map.fix.ident}`
      : `MAP at ${map.fix.ident}`;
  const nav = ap.navaid ? navaid(ap.navaid) : undefined;
  const dme =
    nav?.dme && map.fix.kind !== "runway"
      ? ` or D${f1(distanceNm(map.fix, nav))} ${identTxt(nav)}`
      : "";
  o.push(
    text(
      at.x,
      ny,
      `${mapTxt}${dme}  ·  Final Apch Crs ${pad3(ap.finalCourse)}°  ·  Rwy ${ap.runway} ${rwy.lengthFt}' × ${rwy.widthFt}'`,
      { size: 8.5, halo: false },
    ),
  );
  return o.join("");
}

/** FAA-style airport sketch: runways to scale, numbers beyond the thresholds, approach lights, dimensions */
function airportSketch(ap: Approach, box: Box): string {
  const o: string[] = [];
  const a = airport(ap.airport);
  const rwy = runway(ap.airport, ap.runway);
  const inner = { x: box.x + 6, y: box.y + 4, w: box.w - 12, h: box.h - 18 };
  const ends = a.runways.flatMap((r) => [r.threshold, r.end]);
  const p2 = makeProj([a, ...ends], inner, 17);
  const pl = new Placer(inner);
  // runway half-width: exaggerated for legibility, but never so wide that parallel runways merge
  let sep = Infinity;
  for (let i = 0; i < a.runways.length; i += 2)
    for (let j = i + 2; j < a.runways.length; j += 2) {
      const r1 = a.runways[i],
        r2 = a.runways[j];
      const d = Math.abs(((bearingDeg(r1.threshold, r1.end) - bearingDeg(r2.threshold, r2.end) + 540) % 180));
      if (Math.min(d, 180 - d) > 10) continue;
      const t1 = p2(r1.threshold),
        e1 = p2(r1.end),
        t2 = p2(r2.threshold);
      const len = Math.hypot(e1.x - t1.x, e1.y - t1.y) || 1;
      sep = Math.min(sep, Math.abs(((t2.x - t1.x) * -(e1.y - t1.y) + (t2.y - t1.y) * (e1.x - t1.x)) / len));
    }
  const halfW = (r: { widthFt: number }) =>
    Math.max(0.9, Math.min(Math.max(1.8, (r.widthFt / FT_PER_NM) * p2.scale * 1.8), sep * 0.28));
  for (let i = 0; i < a.runways.length; i += 2) {
    const r = a.runways[i];
    const q = runwayQuad(p2(r.threshold), p2(r.end), halfW(r));
    o.push(
      `<polygon points="${q.map((v) => `${P(v.x)},${P(v.y)}`).join(" ")}" fill="${INK}"/>`,
    );
    pl.hardPoly(q);
  }
  // runway numbers just beyond each threshold (shifted sideways when parallel runways crowd them)
  const numPos = new Map<string, Pt>();
  const centre = (() => {
    const c = a.runways.map((r) => {
      const t = p2(r.threshold),
        e = p2(r.end);
      return { x: (t.x + e.x) / 2, y: (t.y + e.y) / 2 };
    });
    return { x: c.reduce((s, p) => s + p.x, 0) / c.length, y: c.reduce((s, p) => s + p.y, 0) / c.length };
  })();
  for (const r of a.runways) {
    const t = p2(r.threshold),
      e = p2(r.end);
    const len = Math.hypot(e.x - t.x, e.y - t.y) || 1;
    const u = { x: (t.x - e.x) / len, y: (t.y - e.y) / len };
    const n = { x: -u.y, y: u.x };
    const w = textW(r.id, 8.5, true) + 2;
    const base = (Math.abs(u.x) * w) / 2 + Math.abs(u.y) * 6 + 3;
    // a number shifted sideways only moves away from the other runways (never next to a parallel one)
    const mid = { x: (t.x + e.x) / 2, y: (t.y + e.y) / 2 };
    const away = (mid.x - centre.x) * n.x + (mid.y - centre.y) * n.y;
    const sgn = Math.abs(away) < 1 ? 0 : Math.sign(away);
    const sideOk = (side: number) => side === 0 || sgn === 0 || Math.sign(side) === sgn;
    const steps: [number, number][] = [[base, 0], [base + 7, 0], [base, 1], [base, -1], [base + 7, 1], [base + 7, -1], [base + 14, 0], [base, 2], [base, -2], [base + 14, 1], [base + 14, -1], [base + 21, 0]];
    for (const [out, side] of steps.filter(([, sd]) => sideOk(sd))) {
      const c = { x: t.x + u.x * out + n.x * side * (w / 2 + 3), y: t.y + u.y * out + n.y * side * 8 };
      const b = { x: c.x - w / 2, y: c.y - 6, w, h: 12 };
      if (pl.cost(boxPoly(b)) < 0) continue;
      pl.commit(boxPoly(b), r.id);
      numPos.set(r.id, c);
      o.push(text(c.x, c.y + 3.5, r.id, { size: 8.5, weight: 700, anchor: "middle", halo: false }));
      break;
    }
  }
  // approach lighting symbol: 10 px perpendicular to the runway number of the approach runway
  {
    const c = numPos.get(ap.runway);
    if (c) {
      const t = p2(rwy.threshold),
        e = p2(rwy.end);
      const len = Math.hypot(e.x - t.x, e.y - t.y) || 1;
      const n = { x: -(e.y - t.y) / len, y: (e.x - t.x) / len };
      const u = { x: (t.x - e.x) / len, y: (t.y - e.y) / len };
      for (const d of [n, { x: -n.x, y: -n.y }, u]) {
        const lp = { x: c.x + d.x * 14, y: c.y + d.y * 14 };
        const b = { x: lp.x - 7, y: lp.y - 7, w: 14, h: 14 };
        if (pl.cost(boxPoly(b)) !== 0) continue;
        pl.commit(boxPoly(b), "ALS");
        o.push(
          `<circle cx="${P(lp.x)}" cy="${P(lp.y)}" r="6.5" fill="#fff" stroke="${INK}" stroke-width="0.9"/>`,
        );
        o.push(
          text(
            lp.x,
            lp.y + 2.6,
            lightingCode(lightingSystem(ap.airport, ap.runway)),
            { size: 6.5, weight: 700, anchor: "middle", halo: false },
          ),
        );
        break;
      }
    }
  }
  // dimensions beside each runway (perpendicular offset width/2 + 6), skipped when they would collide
  for (let i = 0; i < a.runways.length; i += 2) {
    const r = a.runways[i];
    const t = p2(r.threshold),
      e = p2(r.end);
    const m = { x: (t.x + e.x) / 2, y: (t.y + e.y) / 2 };
    let ang = (Math.atan2(e.y - t.y, e.x - t.x) * 180) / Math.PI;
    ang = readableAngle(ang);
    const tt = `${r.lengthFt} × ${r.widthFt}`;
    const tw = textW(tt, 7) + 4;
    const len = Math.hypot(e.x - t.x, e.y - t.y);
    if (len < tw + 4) continue;
    const hw = halfW(r);
    let placed = false;
    for (const along of [0, 0.22, -0.22, 0.34, -0.34])
      for (const s of [-1, 1]) {
        if (placed) break;
        const off = (hw + 6) * s;
        const c = {
          x: m.x + (e.x - t.x) * along - Math.sin(ang * DEG) * off,
          y: m.y + (e.y - t.y) * along + Math.cos(ang * DEG) * off,
        };
        const poly = orientedRect(c.x, c.y, tw, 9, ang);
        if (pl.cost(poly) !== 0) continue;
        pl.commit(poly, tt);
        o.push(
          text(c.x, c.y + 2.5, tt, {
            size: 7,
            anchor: "middle",
            rotate: ang,
            halo: false,
          }),
        );
        placed = true;
      }
  }
  o.push(
    text(
      box.x + 8,
      box.y + box.h - 5,
      `ELEV ${a.elevFt}'  ·  ${lightingSystem(ap.airport, ap.runway)} Rwy ${ap.runway}`,
      { size: 8, halo: false },
    ),
  );
  return o.join("");
}

// ------------------------------------------------------------------ airport diagram (Jeppesen 10-9)
/** magnetic bearing of a runway from its geometry (the simulator grid is magnetic), '0.0' printed as '360.0' */
const magBrg = (r: { threshold: LatLon; end: LatLon }) => {
  const b = Math.round(norm360(bearingDeg(r.threshold, r.end)) * 10) / 10;
  return (b === 0 || b === 360 ? 360 : b).toFixed(1);
};
export function airportDiagram(icao: string): string {
  const a = airport(icao);
  const uid = `apd${icao}`;
  beginLayout(`${icao}-APD`);
  const o: string[] = [`<rect width="${W}" height="${H}" fill="#fff"/>`];
  o.push(
    `<style>.p-${uid} text{font-family:${FONT};fill:${INK}} .p-${uid} .hl{paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}</style>`,
  );
  o.push(`<g class="p-${uid}">`);
  o.push(rect(10, 10, W - 20, H - 20, { sw: 1.6 }));
  o.push(text(20, 30, a.icao, { size: 17, weight: 700, halo: false }));
  o.push(
    text(20 + textW(a.icao, 17, true) + 10, 30, `Apt Elev ${a.elevFt}'`, {
      size: 9.5,
      halo: false,
    }),
  );
  o.push(
    text(20, 47, a.name.toUpperCase(), { size: 9.5, weight: 700, halo: false }),
  );
  o.push(
    text(W - 20, 24, `10-9   ·   Eff ${EFF}`, {
      size: 8.5,
      anchor: "end",
      halo: false,
    }),
  );
  o.push(
    text(W - 20, 46, "AIRPORT DIAGRAM", {
      size: 19,
      weight: 700,
      anchor: "end",
      halo: false,
    }),
  );
  o.push(line({ x: 10, y: 56 }, { x: W - 10, y: 56 }, 1.2));
  const fq = a.freqs;
  const fl: [string, string][] = (
    [
      ["ATIS", fq.atis],
      ["Tower", fq.tower],
      ["Ground", fq.ground],
      ["CTAF", fq.tower ? undefined : fq.ctaf],
      ["UNICOM", fq.unicom],
    ] as [string, number | undefined][]
  )
    .filter((x) => x[1])
    .map((x) => [x[0], freq(x[1])]);
  const cw = (W - 20) / Math.max(1, fl.length);
  fl.forEach((f, i) => {
    if (i) o.push(line({ x: 10 + i * cw, y: 56 }, { x: 10 + i * cw, y: 78 }));
    o.push(text(16 + i * cw, 71, f[0], { size: 9, halo: false }));
    o.push(
      text(10 + (i + 1) * cw - 6, 71.5, f[1], {
        size: 12,
        weight: 700,
        anchor: "end",
        halo: false,
      }),
    );
  });
  o.push(line({ x: 10, y: 78 }, { x: W - 10, y: 78 }));
  const tableRows = a.runways.length;
  const tableH = 18 + tableRows * 14;
  const box = { x: 20, y: 86, w: W - 40, h: H - 40 - tableH - 86 - 8 };
  const ends = a.runways.flatMap((r) => [r.threshold, r.end]);
  // the field fills ~75 % of the frame
  const proj = makeProj([a, ...ends], box, Math.min(box.w, box.h) * 0.12);
  const placer = new Placer(box);
  const rwW = (r: { widthFt: number }) =>
    Math.max(10, (r.widthFt / FT_PER_NM) * proj.scale * 2.5);
  // runways first (obstacles for every label)
  const rwQuads: Pt[][] = [];
  for (let i = 0; i < a.runways.length; i += 2) {
    const r = a.runways[i];
    const q = runwayQuad(proj(r.threshold), proj(r.end), rwW(r) / 2);
    rwQuads.push(q);
    placer.hardPoly(q);
  }
  // taxiways (parallel at 400 ft / 300 ft, as in the 3D scenery) + apron — only on simple layouts: on a
  // complex real airport (parallel runways, 3+ runways) the generic layout would be wrong, so it is left out
  const letters = "ABCDEFGH";
  const pairs = a.runways.filter((_, i) => i % 2 === 0);
  const parallel = pairs.some((r, i) => pairs.some((q, j) => j > i && Math.abs(wrap180(r.heading - q.heading)) < 25));
  const simpleLayout = pairs.length <= 2 && !parallel;
  for (let i = 0; simpleLayout && i < a.runways.length; i += 2) {
    const r = a.runways[i];
    const side = (i / 2) % 2 === 0 ? 1 : -1;
    // taxiway offset (400 / 300 ft) drawn 1.5× so it stays clear of the exaggerated runway width
    const off = (1.5 * (r.widthFt >= 150 ? 400 : 300)) / FT_PER_NM;
    const t1 = proj(destination(r.threshold, r.heading + 90 * side, off));
    const t2 = proj(destination(r.end, r.heading + 90 * side, off));
    o.push(
      `<line x1="${P(t1.x)}" y1="${P(t1.y)}" x2="${P(t2.x)}" y2="${P(t2.y)}" stroke="#cfcfcf" stroke-width="8"/>`,
    );
    for (const f of [0.0067, 0.36, 0.64, 0.9933]) {
      const s = destination(
        r.threshold,
        r.heading,
        (r.lengthFt / FT_PER_NM) * f,
      );
      const c1 = proj(s),
        c2 = proj(destination(s, r.heading + 90 * side, off));
      o.push(
        `<line x1="${P(c1.x)}" y1="${P(c1.y)}" x2="${P(c2.x)}" y2="${P(c2.y)}" stroke="#cfcfcf" stroke-width="7"/>`,
      );
    }
    const lab = proj(
      destination(
        destination(r.threshold, r.heading, (r.lengthFt / FT_PER_NM) * 0.2),
        r.heading + 90 * side,
        off,
      ),
    );
    const L1 = letters[(i / 2) % letters.length];
    o.push(
      `<circle cx="${P(lab.x)}" cy="${P(lab.y)}" r="6.5" fill="#fff" stroke="#777" stroke-width="0.6"/>`,
    );
    o.push(
      text(lab.x, lab.y + 3.5, L1, {
        size: 9,
        weight: 700,
        anchor: "middle",
        halo: false,
      }),
    );
    placer.block(lab.x - 7, lab.y - 7, 14, 14);
    if (i === 0) {
      const ap0 = (r.lengthFt * 0.56) / FT_PER_NM,
        ap1 = Math.min(r.lengthFt * 0.56 + 1500, r.lengthFt - 1100) / FT_PER_NM;
      const q = [
        [ap0, off + 25 / FT_PER_NM],
        [ap1, off + 25 / FT_PER_NM],
        [ap1, off + 560 / FT_PER_NM],
        [ap0, off + 560 / FT_PER_NM],
      ].map(([along, across]) =>
        proj(
          destination(
            destination(r.threshold, r.heading, along),
            r.heading + 90,
            across,
          ),
        ),
      );
      o.push(
        `<polygon points="${q.map((p) => `${P(p.x)},${P(p.y)}`).join(" ")}" fill="#e6e6e6" stroke="#999" stroke-width="0.8"/>`,
      );
      placer.hardPoly(q);
      const c = { x: (q[0].x + q[2].x) / 2, y: (q[0].y + q[2].y) / 2 };
      o.push(
        text(c.x, c.y + 3.5, "TERMINAL", {
          size: 9,
          weight: 700,
          anchor: "middle",
          halo: false,
        }),
      );
      const tw = proj(
        destination(
          destination(r.threshold, r.heading, ap1 + 160 / FT_PER_NM),
          r.heading + 90,
          off + 520 / FT_PER_NM,
        ),
      );
      o.push(`<circle cx="${P(tw.x)}" cy="${P(tw.y)}" r="3.5" fill="${INK}"/>`);
      placer.block(tw.x - 4, tw.y - 4, 8, 8);
      const tb = placer.place(
        tw.x,
        tw.y,
        textW("TWR", 8.5, true) + 2,
        10,
        5,
        "TWR",
        2,
      );
      if (tb)
        o.push(text(tb.x + 1, tb.y + 8.5, "TWR", { size: 8.5, weight: 700 }));
    }
  }
  for (let i = 0; i < a.runways.length; i += 2) {
    const r = a.runways[i];
    const p1 = proj(r.threshold),
      p2 = proj(r.end);
    o.push(
      `<polygon points="${rwQuads[i / 2].map((v) => `${P(v.x)},${P(v.y)}`).join(" ")}" fill="${INK}"/>`,
    );
    o.push(
      `<line x1="${P(p1.x)}" y1="${P(p1.y)}" x2="${P(p2.x)}" y2="${P(p2.y)}" stroke="#fff" stroke-width="1" stroke-dasharray="9 7"/>`,
    );
    // dimensions beside the runway
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    let ang = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
    ang = readableAngle(ang);
    const tt = `${r.lengthFt} × ${r.widthFt}`;
    const tw = textW(tt, 10.5, true) + 6;
    let dimDone = false;
    for (const s of [-1, 1]) {
      for (const along of [0, 0.2, -0.2]) {
        if (dimDone) break;
        const off = (rwW(r) / 2 + 9) * s;
        const c = {
          x: mid.x + (p2.x - p1.x) * along - Math.sin(ang * DEG) * off,
          y: mid.y + (p2.y - p1.y) * along + Math.cos(ang * DEG) * off,
        };
        const poly = orientedRect(c.x, c.y, tw, 13, ang);
        if (placer.cost(poly) !== 0) continue;
        placer.commit(poly, tt);
        o.push(
          text(c.x, c.y + 3.7, tt, {
            size: 10.5,
            weight: 700,
            anchor: "middle",
            rotate: ang,
          }),
        );
        dimDone = true;
      }
      if (dimDone) break;
    }
  }
  // runway numbers just outside each threshold, magnetic bearing beside them, threshold elevation
  for (const r of a.runways) {
    const t = proj(r.threshold),
      e = proj(r.end);
    const len = Math.hypot(e.x - t.x, e.y - t.y) || 1;
    const u = { x: (t.x - e.x) / len, y: (t.y - e.y) / len };
    const nrm = { x: -u.y, y: u.x };
    const w = textW(r.id, 16, true) + 2;
    const out =
      0.05 * proj.scale + Math.abs(u.x) * (w / 2) + Math.abs(u.y) * 9 + 2;
    const c = { x: t.x + u.x * out, y: t.y + u.y * out };
    const b = { x: c.x - w / 2, y: c.y - 9, w, h: 18 };
    if (placer.cost(boxPoly(b)) >= 0) {
      placer.commit(boxPoly(b), r.id);
      o.push(
        text(c.x, c.y + 6, r.id, {
          size: 16,
          weight: 700,
          anchor: "middle",
          halo: false,
        }),
      );
    }
    const brg = `${magBrg(r)}°`;
    const bw = textW(brg, 9) + 4;
    for (const s of [1, -1]) {
      const bc = {
        x: c.x + nrm.x * s * (w / 2 + bw / 2 + 4),
        y: c.y + nrm.y * s * 13 + 1,
      };
      const bb = { x: bc.x - bw / 2, y: bc.y - 5.5, w: bw, h: 11 };
      if (placer.cost(boxPoly(bb)) !== 0) continue;
      placer.commit(boxPoly(bb), brg);
      o.push(text(bc.x, bc.y + 3.5, brg, { size: 9, anchor: "middle" }));
      break;
    }
    const ep = proj(destination(r.threshold, r.heading, 0.04));
    const et = `ELEV ${r.elevFt}`;
    const ew = textW(et, 8) + 4;
    for (const s of [1, -1]) {
      const off = rwW(r) / 2 + 9;
      const ec = { x: ep.x + nrm.x * off * s, y: ep.y + nrm.y * off * s };
      const eb = { x: ec.x - ew / 2, y: ec.y - 5, w: ew, h: 10 };
      // skipped when it falls inside another runway or label
      if (
        placer.cost(boxPoly(eb)) < 0 ||
        rwQuads.some((q) => polysOverlap(boxPoly(eb), q))
      )
        continue;
      placer.commit(boxPoly(eb), et);
      o.push(text(ec.x, ec.y + 3, et, { size: 8, anchor: "middle" }));
      break;
    }
  }
  o.push(
    `<g transform="translate(${W - 46} 112)"><path d="M0,-22 L8,6 L0,1 L-8,6 Z" fill="${INK}"/><text y="20" font-size="10" text-anchor="middle" font-weight="700">N</text></g>`,
  );
  // scale bar in feet
  {
    const ftPx = proj.scale / FT_PER_NM;
    const stepFt = ftPx * 1000 > 40 ? 1000 : 2000;
    const n = 3;
    const x0 = 30,
      y0 = box.y + box.h - 10;
    for (let k = 0; k < n; k++)
      o.push(
        `<rect x="${P(x0 + k * stepFt * ftPx)}" y="${P(y0 - 3)}" width="${P(stepFt * ftPx)}" height="4" fill="${k % 2 ? "#fff" : INK}" stroke="${INK}" stroke-width="0.6"/>`,
      );
    for (let k = 0; k <= n; k++)
      o.push(
        text(x0 + k * stepFt * ftPx, y0 - 6, `${k * stepFt}`, {
          size: 7.5,
          anchor: "middle",
        }),
      );
    o.push(text(x0 + n * stepFt * ftPx + 8, y0 + 1, "FEET", { size: 7.5 }));
  }
  // runway data table
  const ty = H - 40 - tableH;
  o.push(line({ x: 10, y: ty }, { x: W - 10, y: ty }));
  const colsX = [20, 80, 170, 300, 400, 480];
  [
    "RWY",
    "MAG BRG",
    "LENGTH × WIDTH (FT)",
    "THR ELEV",
    "LIGHTING",
    "VAR",
  ].forEach((h, i) =>
    o.push(
      text(colsX[i], ty + 13, h, {
        size: 8,
        weight: 700,
        fill: MUTED,
        halo: false,
      }),
    ),
  );
  a.runways.forEach((r, i) => {
    const y = ty + 18 + i * 14 + 9;
    const cellsT = [
      r.id,
      `${magBrg(r)}°`,
      `${r.lengthFt} × ${r.widthFt}`,
      `${r.elevFt}'`,
      r.lights ? lightingSystem(a.icao, r.id) : "—",
      i === 0
        ? a.magVar === 0
          ? "0°"
          : `${Math.abs(a.magVar).toFixed(0)}° ${a.magVar > 0 ? "E" : "W"}`
        : "",
    ];
    cellsT.forEach((c, k) =>
      o.push(
        text(colsX[k], y, c, {
          size: 9,
          weight: k === 0 ? 700 : 400,
          halo: false,
        }),
      ),
    );
  });
  o.push(chartMargins(a, "AIRPORT DIAGRAM"));
  o.push(`</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plate">${o.join("")}</svg>`;
}

// ------------------------------------------------------------------ chart index
export interface ChartEntry {
  id: string;
  airport: string;
  title: string;
  kind: "APD" | "IAP" | "SID" | "STAR";
  /** Navigraph-like grouping for selectors: APD, ILS, RNAV, LOC, VOR, NDB, LDA, SID, STAR */
  group: string;
  /** Jeppesen chart index (10-9, 11-1, 10-3, …) */
  index: string;
  approachId?: string;
  render: () => string;
}

export function chartIndex(): ChartEntry[] {
  const out: ChartEntry[] = [];
  for (const a of AIRPORTS) {
    out.push({
      id: `${a.icao}-APD`,
      airport: a.icao,
      title: "AIRPORT DIAGRAM",
      kind: "APD",
      group: "APD",
      index: "10-9",
      render: () => airportDiagram(a.icao),
    });
    for (const p of TERMINAL.filter(
      (x) => x.airport === a.icao && x.kind === "STAR",
    ))
      out.push({
        id: `${a.icao}-STAR-${p.id}`,
        airport: a.icao,
        title: procTitle(p),
        kind: "STAR",
        group: "STAR",
        index: "10-2",
        render: () => starChart(p),
      });
    for (const p of TERMINAL.filter(
      (x) => x.airport === a.icao && x.kind === "SID",
    ))
      out.push({
        id: `${a.icao}-SID-${p.id}`,
        airport: a.icao,
        title: procTitle(p),
        kind: "SID",
        group: "SID",
        index: "10-3",
        render: () => sidChart(p),
      });
    for (const ap of APPROACHES.filter((x) => x.airport === a.icao))
      out.push({
        id: ap.id,
        airport: a.icao,
        title: ap.name,
        kind: "IAP",
        group: ap.type === "LOCBC" ? "LOC" : ap.type,
        index: chartNumber(ap),
        approachId: ap.id,
        render: () => approachPlate(ap),
      });
  }
  return out;
}

// re-exported for unit tests and the SID/STAR charts
export const _internal = {
  Placer,
  makeProj,
  polysOverlap,
  visStraight,
  visCircle,
  fracSM,
  missedIcons,
  missedPlan,
};
export const kit = { runwayQuad, holdPattern, terrainLayer, compassRose };
export type { Fix };
