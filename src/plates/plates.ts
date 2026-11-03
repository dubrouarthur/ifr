// Procedurally generated instrument approach plates and airport diagrams (SVG), laid out like FAA/Jeppesen
// charts: briefing strip, plan view with tinted terrain and collision-free labels, profile view, minimums,
// FAF→MAP timing and an airport sketch. Built from the nav database.
import {
  airport,
  navaid,
  NAVAIDS,
  runway,
  AIRPORTS,
  APPROACHES,
  groundElevation,
  landMask,
} from "../nav/data";
import {
  destination,
  distanceNm,
  toLocal,
  norm360,
  bearingDeg,
  DEG,
  type LatLon,
} from "../nav/geo";
import type { Approach, Fix, ProcLeg } from "../nav/types";

const W = 600;
const H = 900;
const FONT = `'Roboto Condensed', 'Arial Narrow', Arial, Helvetica, sans-serif`;
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const f1 = (n: number) => n.toFixed(1);
const pad3 = (n: number) =>
  String(Math.round(norm360(n)) || 360).padStart(3, "0");
const freq = (f?: number) =>
  f ? f.toFixed((f * 1000) % 10 ? 3 : 2).replace(/0$/, "") : "—";
const INK = "#111";

// ------------------------------------------------------------------ layout (fixed, so the UI can overlay own-ship)
const L = {
  head: { y: 10, h: 40 },
  brief: { y: 50, h: 40 },
  miss: { y: 90, h: 30 },
  comm: { y: 120, h: 22 },
  notes: { y: 142, h: 62 },
};
const PLAN_BOX = { x: 10, y: 204, w: W - 20, h: 334 };
const PROF = { y: PLAN_BOX.y + PLAN_BOX.h, h: 148 };

interface Pt {
  x: number;
  y: number;
}
interface Proj {
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
    (box.w - 2 * margin) / Math.max(1, maxX - minX),
    (box.h - 2 * margin) / Math.max(1, maxY - minY),
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

// ------------------------------------------------------------------ primitives
const P = (n: number) => n.toFixed(1);
/** text with a white halo so it stays legible over lines and terrain */
function text(
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
  return `<text x="${P(x)}" y="${P(y)}" font-size="${o.size ?? 10}" font-weight="${o.weight ?? 400}"${o.anchor ? ` text-anchor="${o.anchor}"` : ""}${o.fill ? ` style="fill:${o.fill}"` : ""}${o.italic ? ' font-style="italic"' : ""}${o.deco ? ` text-decoration="${o.deco}"` : ""}${halo}${tr}>${esc(s)}</text>`;
}
const line = (a: Pt, b: Pt, w = 1, dash = "") =>
  `<line x1="${P(a.x)}" y1="${P(a.y)}" x2="${P(b.x)}" y2="${P(b.y)}" stroke="${INK}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
  o: { fill?: string; sw?: number } = {},
) =>
  `<rect x="${P(x)}" y="${P(y)}" width="${P(w)}" height="${P(h)}" fill="${o.fill ?? "none"}" stroke="${INK}" stroke-width="${o.sw ?? 1}"/>`;

function arrowHead(at: Pt, ang: number, size = 7): string {
  const a = (d: number) =>
    `${P(at.x + size * Math.cos(ang + d))},${P(at.y + size * Math.sin(ang + d))}`;
  return `<polygon points="${P(at.x)},${P(at.y)} ${a(Math.PI - 0.42)} ${a(Math.PI + 0.42)}" fill="${INK}"/>`;
}
/** course line with arrowheads every ~70 px */
function courseLine(
  a: Pt,
  b: Pt,
  o: { width?: number; dash?: boolean } = {},
): string {
  const w = o.width ?? 1.4;
  let s = line(a, b, w, o.dash ? "7 4" : "");
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const n = Math.max(1, Math.floor(len / 90));
  for (let k = 1; k <= n; k++) {
    const t = k / (n + 1) + 0.05;
    s += arrowHead(
      { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
      ang,
      6 + w,
    );
  }
  return s;
}

// ------------------------------------------------------------------ label placement without overlaps
class Placer {
  boxes: { x: number; y: number; w: number; h: number }[] = [];
  constructor(private bounds: { x: number; y: number; w: number; h: number }) {}
  block(x: number, y: number, w: number, h: number) {
    this.boxes.push({ x, y, w, h });
  }
  free(b: { x: number; y: number; w: number; h: number }) {
    const B = this.bounds;
    if (
      b.x < B.x + 2 ||
      b.y < B.y + 2 ||
      b.x + b.w > B.x + B.w - 2 ||
      b.y + b.h > B.y + B.h - 2
    )
      return false;
    return !this.boxes.some(
      (o) =>
        b.x < o.x + o.w &&
        b.x + b.w > o.x &&
        b.y < o.y + o.h &&
        b.y + b.h > o.y,
    );
  }
  /** find a spot for a w×h label near (x, y); returns the top-left corner */
  place(
    x: number,
    y: number,
    w: number,
    h: number,
    gap = 9,
  ): { x: number; y: number } {
    const c = [
      [gap, -h - 2],
      [gap, 2],
      [-w - gap, -h - 2],
      [-w - gap, 2],
      [-w / 2, -h - gap],
      [-w / 2, gap],
      [gap + 12, -h - 14],
      [-w - gap - 12, -h - 14],
      [gap + 12, 14],
      [-w - gap - 12, 14],
      [-w / 2, -h - gap - 16],
      [-w / 2, gap + 16],
    ];
    for (const [dx, dy] of c) {
      const b = { x: x + dx, y: y + dy, w, h };
      if (this.free(b)) {
        this.boxes.push(b);
        return b;
      }
    }
    const b = { x: x + gap, y: y - h - 2, w, h };
    this.boxes.push(b);
    return b;
  }
}
const textW = (s: string, size: number, bold = false) =>
  s.length * size * (bold ? 0.53 : 0.49);

// ------------------------------------------------------------------ chart symbols
function navSymbol(
  kind: "vor" | "ndb" | "fix" | "wpt",
  x: number,
  y: number,
  o: { compulsory?: boolean; faf?: boolean } = {},
): string {
  if (kind === "vor") {
    const r = 7.5;
    const hex = Array.from(
      { length: 6 },
      (_, i) =>
        `${P(x + r * Math.cos((Math.PI / 3) * i))},${P(y + r * Math.sin((Math.PI / 3) * i))}`,
    ).join(" ");
    // compass rose ticks
    let rose = `<circle cx="${P(x)}" cy="${P(y)}" r="26" fill="none" stroke="${INK}" stroke-width="0.6"/>`;
    for (let d = 0; d < 360; d += 10) {
      const a = (d - 90) * DEG;
      const l = d % 30 === 0 ? 5 : 2.5;
      rose += `<line x1="${P(x + 26 * Math.cos(a))}" y1="${P(y + 26 * Math.sin(a))}" x2="${P(x + (26 - l) * Math.cos(a))}" y2="${P(y + (26 - l) * Math.sin(a))}" stroke="${INK}" stroke-width="0.6"/>`;
    }
    rose += `<path d="M${P(x)},${P(y - 30)} l-3,6 h6 z" fill="${INK}"/>`;
    return `${rose}<rect x="${P(x - 9.5)}" y="${P(y - 7)}" width="19" height="14" fill="#fff" stroke="${INK}" stroke-width="1.2"/><polygon points="${hex}" fill="#fff" stroke="${INK}" stroke-width="1.3"/><circle cx="${P(x)}" cy="${P(y)}" r="1.5" fill="${INK}"/>`;
  }
  if (kind === "ndb") {
    let dots = "";
    for (let ring = 1; ring <= 3; ring++)
      for (let i = 0; i < 8 + ring * 5; i++) {
        const a = (2 * Math.PI * i) / (8 + ring * 5);
        dots += `<circle cx="${P(x + ring * 3.4 * Math.cos(a))}" cy="${P(y + ring * 3.4 * Math.sin(a))}" r="0.75" fill="${INK}"/>`;
      }
    return `<circle cx="${P(x)}" cy="${P(y)}" r="12" fill="#fff" opacity="0.9"/>${dots}<circle cx="${P(x)}" cy="${P(y)}" r="2.4" fill="${INK}"/>`;
  }
  if (kind === "wpt") {
    // RNAV waypoint: four-pointed star (fly-by)
    const s = 7;
    return `<path d="M${P(x)},${P(y - s)} L${P(x + 2)},${P(y - 2)} L${P(x + s)},${P(y)} L${P(x + 2)},${P(y + 2)} L${P(x)},${P(y + s)} L${P(x - 2)},${P(y + 2)} L${P(x - s)},${P(y)} L${P(x - 2)},${P(y - 2)} Z" fill="${o.compulsory ? INK : "#fff"}" stroke="${INK}" stroke-width="1.1"/>${o.faf ? malteseCross(x, y + 16, 5) : ""}`;
  }
  return `<polygon points="${P(x)},${P(y - 7)} ${P(x - 6.5)},${P(y + 5)} ${P(x + 6.5)},${P(y + 5)}" fill="${o.compulsory ? INK : "#fff"}" stroke="${INK}" stroke-width="1.3"/>${o.faf ? malteseCross(x, y + 16, 5) : ""}`;
}
function malteseCross(x: number, y: number, s: number): string {
  return `<path d="M${P(x - s)},${P(y - s)} L${P(x + s)},${P(y + s)} M${P(x + s)},${P(y - s)} L${P(x - s)},${P(y + s)}" stroke="${INK}" stroke-width="2.4"/>`;
}

function holdPath(
  proj: Proj,
  fix: LatLon,
  inbound: number,
  turn: "R" | "L",
  dashed: boolean,
  legNm = 1.6,
): string {
  const rNm = 0.55;
  const s = turn === "R" ? 1 : -1;
  const p0 = proj(fix);
  const back = proj(destination(fix, inbound + 180, legNm));
  const side = proj(destination(fix, inbound + 90 * s, 2 * rNm));
  const sideBack = proj(
    destination(
      destination(fix, inbound + 90 * s, 2 * rNm),
      inbound + 180,
      legNm,
    ),
  );
  const r = rNm * proj.scale;
  const sweep = turn === "R" ? 1 : 0;
  const d = `M${P(back.x)},${P(back.y)} L${P(p0.x)},${P(p0.y)} A${P(r)},${P(r)} 0 0 ${sweep} ${P(side.x)},${P(side.y)} L${P(sideBack.x)},${P(sideBack.y)} A${P(r)},${P(r)} 0 0 ${sweep} ${P(back.x)},${P(back.y)}`;
  const ang = Math.atan2(p0.y - back.y, p0.x - back.x);
  const mid = {
    x: (back.x + p0.x) / 2 + Math.cos(ang) * 6,
    y: (back.y + p0.y) / 2 + Math.sin(ang) * 6,
  };
  return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.4"${dashed ? ' stroke-dasharray="6 4"' : ""}/>${arrowHead(mid, ang, 7)}`;
}

function runwayShape(proj: Proj, icao: string, minW = 3, scaleUp = 1): string {
  const a = airport(icao);
  let out = "";
  for (let i = 0; i < a.runways.length; i += 2) {
    const r = a.runways[i];
    const p1 = proj(r.threshold),
      p2 = proj(r.end);
    const w = Math.max(minW, (r.widthFt / 6076) * proj.scale * scaleUp);
    out += `<line x1="${P(p1.x)}" y1="${P(p1.y)}" x2="${P(p2.x)}" y2="${P(p2.y)}" stroke="${INK}" stroke-width="${P(w)}"/>`;
  }
  return out;
}

const ILS_RWYS = () =>
  new Set(
    NAVAIDS.filter((n) => n.type === "ILS").map(
      (n) => `${n.airport}-${n.runway}`,
    ),
  );
const lightingSystem = (icao: string, rwy: string) =>
  ILS_RWYS().has(`${icao}-${rwy}`) ? "ALSF-2" : "MALSR";

// ------------------------------------------------------------------ terrain tint for the plan view (browser only)
const terrainCache = new Map<string, string>();
function terrainImage(
  key: string,
  proj: Proj,
  box: { x: number; y: number; w: number; h: number },
): string {
  if (typeof document === "undefined") return "";
  if (terrainCache.has(key)) return terrainCache.get(key)!;
  const step = 3;
  const c = document.createElement("canvas");
  c.width = Math.ceil(box.w / step);
  c.height = Math.ceil(box.h / step);
  const g = c.getContext("2d");
  if (!g) return "";
  const img = g.createImageData(c.width, c.height);
  for (let j = 0; j < c.height; j++)
    for (let i = 0; i < c.width; i++) {
      const ll = proj.inv(
        box.x + i * step + step / 2,
        box.y + j * step + step / 2,
      );
      const m = landMask(ll);
      const e = groundElevation(ll);
      let col: [number, number, number];
      if (m < 0.5) col = [222, 236, 246];
      else if (e < 600) col = [252, 251, 246];
      else if (e < 1000) col = [244, 240, 226];
      else if (e < 1500) col = [236, 227, 204];
      else if (e < 2000) col = [227, 213, 182];
      else col = [216, 198, 160];
      const k = (j * c.width + i) * 4;
      img.data[k] = col[0];
      img.data[k + 1] = col[1];
      img.data[k + 2] = col[2];
      img.data[k + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const url = c.toDataURL("image/png");
  const s = `<image href="${url}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" preserveAspectRatio="none" style="image-rendering:auto"/>`;
  terrainCache.set(key, s);
  return s;
}
/** coastline as a contour of the land mask (marching squares on a coarse grid) */
function coastline(
  proj: Proj,
  box: { x: number; y: number; w: number; h: number },
): string {
  const step = 6;
  const nx = Math.ceil(box.w / step) + 1,
    ny = Math.ceil(box.h / step) + 1;
  const v = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++)
      v[j * nx + i] =
        landMask(proj.inv(box.x + i * step, box.y + j * step)) - 0.5;
  let d = "";
  const lerp = (a: number, b: number) => a / (a - b);
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = v[j * nx + i],
        b = v[j * nx + i + 1],
        c2 = v[(j + 1) * nx + i + 1],
        e = v[(j + 1) * nx + i];
      const x0 = box.x + i * step,
        y0 = box.y + j * step;
      const pts: Pt[] = [];
      if (a * b < 0) pts.push({ x: x0 + lerp(a, b) * step, y: y0 });
      if (b * c2 < 0) pts.push({ x: x0 + step, y: y0 + lerp(b, c2) * step });
      if (c2 * e < 0)
        pts.push({ x: x0 + (1 - lerp(c2, e)) * step, y: y0 + step });
      if (e * a < 0) pts.push({ x: x0, y: y0 + (1 - lerp(e, a)) * step });
      if (pts.length >= 2)
        d += `M${P(pts[0].x)},${P(pts[0].y)}L${P(pts[1].x)},${P(pts[1].y)}`;
      if (pts.length === 4)
        d += `M${P(pts[2].x)},${P(pts[2].y)}L${P(pts[3].x)},${P(pts[3].y)}`;
    }
  return d
    ? `<path d="${d}" fill="none" stroke="#6a8ca6" stroke-width="0.8"/>`
    : "";
}
/** highest terrain point inside the plan view (spot elevation) */
function spotElevation(
  proj: Proj,
  box: { x: number; y: number; w: number; h: number },
): { p: Pt; e: number } | null {
  let best: { p: Pt; e: number } | null = null;
  for (let y = box.y + 30; y < box.y + box.h - 30; y += 8)
    for (let x = box.x + 30; x < box.x + box.w - 60; x += 8) {
      const ll = proj.inv(x, y);
      if (landMask(ll) < 0.6) continue;
      const e = groundElevation(ll);
      if (!best || e > best.e) best = { p: { x, y }, e };
    }
  return best && best.e > 600 ? best : null;
}

// ------------------------------------------------------------------ approach plate
function planPoints(ap: Approach): LatLon[] {
  const apt = airport(ap.airport);
  const nav = ap.navaid ? navaid(ap.navaid) : undefined;
  const allLegs: ProcLeg[] = [
    ...ap.transitions.flatMap((t) => t.legs),
    ...ap.final,
    ...ap.missed,
  ];
  const pts: LatLon[] = [apt, ...allLegs.map((l) => l.fix)];
  if (nav && nav.type !== "ILS") pts.push(nav);
  return pts;
}

/** Projection used by the plan view, so the UI can draw own-ship on the plate. */
export function planProjection(ap: Approach): {
  proj: (p: LatLon) => { x: number; y: number };
  box: typeof PLAN_BOX;
} {
  return { proj: makeProj(planPoints(ap), PLAN_BOX, 50), box: PLAN_BOX };
}

function navTypeLabel(ap: Approach): string {
  const nav = ap.navaid ? navaid(ap.navaid) : undefined;
  if (!nav) return "WAAS";
  if (nav.type === "ILS") return "LOC/DME";
  if (nav.type === "LOC") return ap.type === "LDA" ? "LDA/DME" : "LOC/DME";
  if (nav.type === "NDB") return "NDB";
  return "VOR/DME";
}

export function approachPlate(ap: Approach): string {
  const apt = airport(ap.airport);
  const rwy = runway(ap.airport, ap.runway);
  const nav = ap.navaid ? navaid(ap.navaid) : undefined;
  const uid = ap.id.replace(/[^a-z0-9]/gi, "");
  const o: string[] = [];
  const allLegs: ProcLeg[] = [
    ...ap.transitions.flatMap((t) => t.legs),
    ...ap.final,
    ...ap.missed,
  ];
  const faf = ap.final.find((l) => l.role === "FAF");
  const precision = !!ap.gsAngle;
  const dmin = ap.minimums[0];
  const minAlt = dmin.da ?? dmin.mda ?? rwy.elevFt + 400;

  o.push(`<rect width="${W}" height="${H}" fill="#fff"/>`);
  o.push(
    `<style>.p-${uid} text{font-family:${FONT};fill:${INK}} .p-${uid} .hl{paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}</style>`,
  );
  o.push(`<g class="p-${uid}">`);
  o.push(rect(10, 10, W - 20, H - 20, { sw: 1.6 }));

  // ---------------------------------------------- header
  o.push(text(20, 26, `${apt.city.toUpperCase()}`, { size: 9.5, halo: false }));
  o.push(
    text(20, 41, `${apt.name.toUpperCase()} (${apt.icao})`, {
      size: 11,
      weight: 700,
      halo: false,
    }),
  );
  o.push(
    text(W - 20, 30, ap.name, {
      size: 19,
      weight: 700,
      anchor: "end",
      halo: false,
    }),
  );
  o.push(
    text(W - 20, 44, `AMDT 3  ·  05NOV26  ·  ${ap.category.toUpperCase()}`, {
      size: 8.5,
      anchor: "end",
      halo: false,
    }),
  );
  o.push(
    line(
      { x: 10, y: L.head.y + L.head.h },
      { x: W - 10, y: L.head.y + L.head.h },
      1.2,
    ),
  );

  // ---------------------------------------------- briefing strip
  const fafAlt = faf?.altMin ?? 0;
  const cells: [string, string, string?][] = [
    [
      navTypeLabel(ap),
      nav
        ? `${nav.type === "NDB" ? nav.freq : nav.freq.toFixed(2)}`
        : `CH 5${String(Math.round(ap.finalCourse)).padStart(4, "0")}`,
      nav ? nav.name : `W${ap.runway}A`,
    ],
    ["APP CRS", `${pad3(ap.crsSetting ?? ap.finalCourse)}°`],
    [
      precision
        ? `${ap.type === "ILS" ? "GS" : "GP"} ${faf?.fix.ident ?? ""}`
        : `FAF ${faf?.fix.ident ?? ""}`,
      `${fafAlt}`,
      `(${fafAlt - rwy.elevFt}')`,
    ],
    [precision ? "DA(H)" : "MDA(H)", `${minAlt}'`, `(${dmin.hat}')`],
    [
      `Rwy ${ap.runway}  ·  ${rwy.lengthFt}'`,
      `TDZE ${rwy.elevFt}`,
      `Apt ${apt.elevFt}`,
    ],
  ];
  const cw = (W - 20) / cells.length;
  cells.forEach((c, i) => {
    const x = 10 + i * cw;
    if (i) o.push(line({ x, y: L.brief.y }, { x, y: L.brief.y + L.brief.h }));
    o.push(text(x + 6, L.brief.y + 12, c[0], { size: 8.5, halo: false }));
    o.push(
      text(x + 6, L.brief.y + 29, c[1], { size: 14, weight: 700, halo: false }),
    );
    if (c[2])
      o.push(
        text(x + cw - 6, L.brief.y + 29, c[2], {
          size: 9,
          anchor: "end",
          halo: false,
        }),
      );
  });
  o.push(line({ x: 10, y: L.miss.y }, { x: W - 10, y: L.miss.y }));
  // missed approach (wrapped)
  o.push(
    `<rect x="10" y="${L.miss.y}" width="86" height="${L.miss.h}" fill="#111"/>`,
  );
  o.push(
    text(53, L.miss.y + 13, "MISSED", {
      size: 9,
      weight: 700,
      anchor: "middle",
      fill: "#fff",
      halo: false,
    }),
  );
  o.push(
    text(53, L.miss.y + 24, "APPROACH", {
      size: 9,
      weight: 700,
      anchor: "middle",
      fill: "#fff",
      halo: false,
    }),
  );
  const words = ap.missedText.toUpperCase().split(" ");
  const lines: string[] = [""];
  for (const w of words) {
    if (textW(lines[lines.length - 1] + " " + w, 9.5) > W - 130) lines.push("");
    lines[lines.length - 1] += (lines[lines.length - 1] ? " " : "") + w;
  }
  lines
    .slice(0, 2)
    .forEach((l, i) =>
      o.push(
        text(104, L.miss.y + 13 + i * 11, l, {
          size: 9.5,
          weight: 700,
          halo: false,
        }),
      ),
    );
  o.push(line({ x: 10, y: L.comm.y }, { x: W - 10, y: L.comm.y }));
  const fq = apt.freqs;
  const comms: [string, string][] = [
    ["ATIS", freq(fq.atis)],
    ["ARDENT APP CON", freq(fq.approach)],
    [fq.tower ? `${ap.airport} TOWER` : "CTAF", freq(fq.tower ?? fq.ctaf)],
    [fq.ground ? "GND CON" : "UNICOM", freq(fq.ground ?? fq.ctaf)],
  ];
  const ccw = (W - 20) / comms.length;
  comms.forEach((c, i) => {
    if (i)
      o.push(
        line(
          { x: 10 + i * ccw, y: L.comm.y },
          { x: 10 + i * ccw, y: L.comm.y + L.comm.h },
        ),
      );
    o.push(text(16 + i * ccw, L.comm.y + 15, c[0], { size: 8.5, halo: false }));
    o.push(
      text(10 + (i + 1) * ccw - 6, L.comm.y + 15, c[1], {
        size: 11,
        weight: 700,
        anchor: "end",
        halo: false,
      }),
    );
  });
  o.push(line({ x: 10, y: L.notes.y }, { x: W - 10, y: L.notes.y }));
  // notes + MSA
  const notes = [...ap.notes];
  if (ap.type !== "RNAV" && nav?.dme && !notes.some((n) => /DME required/i.test(n))) notes.push("DME required.");
  if (precision && !notes.some((n) => /TCH/.test(n)))
    notes.push(
      `${ap.type === "ILS" ? "Glideslope" : "Glidepath"} ${ap.gsAngle!.toFixed(2)}° · TCH ${ap.tch ?? 50}.`,
    );
  notes
    .slice(0, 5)
    .forEach((n, i) =>
      o.push(
        text(20, L.notes.y + 14 + i * 11, `${i ? "" : "▼ "}${n}`, {
          size: 9,
          halo: false,
        }),
      ),
    );
  o.push(
    line(
      { x: W - 140, y: L.notes.y },
      { x: W - 140, y: L.notes.y + L.notes.h },
    ),
  );
  {
    const mx = W - 75,
      my = L.notes.y + L.notes.h / 2 + 2,
      r = 25;
    o.push(
      `<circle cx="${mx}" cy="${my}" r="${r}" fill="#fff" stroke="${INK}" stroke-width="1.2"/>`,
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
      text(mx, my - 9, `MSA ${ap.msa.center}`, {
        size: 7,
        anchor: "middle",
        halo: false,
      }),
    );
  }

  // ---------------------------------------------- plan view
  const pv = PLAN_BOX;
  o.push(
    `<clipPath id="pv-${uid}"><rect x="${pv.x}" y="${pv.y}" width="${pv.w}" height="${pv.h}"/></clipPath>`,
  );
  o.push(`<g clip-path="url(#pv-${uid})">`);
  const proj = makeProj(planPoints(ap), pv, 50);
  o.push(terrainImage(ap.id, proj, pv));
  o.push(coastline(proj, pv));
  const placer = new Placer(pv);
  // 10 NM ring around the airport
  {
    const c = proj(apt);
    const r = 10 * proj.scale;
    o.push(
      `<circle cx="${P(c.x)}" cy="${P(c.y)}" r="${P(r)}" fill="none" stroke="${INK}" stroke-width="0.7" stroke-dasharray="4 4"/>`,
    );
    const t = { x: c.x + r * Math.cos(-0.8), y: c.y + r * Math.sin(-0.8) };
    o.push(text(t.x + 4, t.y, "10 NM", { size: 8 }));
  }
  const spot = spotElevation(proj, pv);
  if (spot) {
    o.push(
      `<path d="M${P(spot.p.x)},${P(spot.p.y - 4)} l3.5,6 h-7 z" fill="${INK}"/>`,
    );
    o.push(
      text(spot.p.x + 6, spot.p.y + 2, `${Math.round(spot.e / 10) * 10}`, {
        size: 9,
        weight: 700,
      }),
    );
    placer.block(spot.p.x - 5, spot.p.y - 6, 34, 12);
  }
  // localizer course (feathers)
  if (nav && (nav.type === "ILS" || nav.type === "LOC")) {
    const ant = proj(nav);
    const crs = nav.course ?? ap.finalCourse;
    const far = (off: number, d = 11) =>
      proj(destination(nav, crs + 180 + off, d));
    o.push(
      `<path d="M${P(ant.x)},${P(ant.y)} L${P(far(2.4).x)},${P(far(2.4).y)} L${P(far(0).x)},${P(far(0).y)} Z" fill="#555"/>`,
    );
    o.push(
      `<path d="M${P(ant.x)},${P(ant.y)} L${P(far(-2.4).x)},${P(far(-2.4).y)} L${P(far(0).x)},${P(far(0).y)} Z" fill="#fff" stroke="${INK}" stroke-width="0.8"/>`,
    );
    if (ap.type === "LOCBC") {
      const back = (off: number) => proj(destination(nav, crs + off, 5));
      o.push(
        `<path d="M${P(ant.x)},${P(ant.y)} L${P(back(2.4).x)},${P(back(2.4).y)} L${P(back(0).x)},${P(back(0).y)} Z" fill="#555"/>`,
      );
      o.push(
        `<path d="M${P(ant.x)},${P(ant.y)} L${P(back(-2.4).x)},${P(back(-2.4).y)} L${P(back(0).x)},${P(back(0).y)} Z" fill="#fff" stroke="${INK}" stroke-width="0.8"/>`,
      );
    }
    // navaid box near the outer end of the feather
    const lbl = [
      `${nav.name.toUpperCase()}`,
      `${nav.freq.toFixed(2)} ${nav.ident}`,
      `Chan ${Math.round((nav.freq - 108) * 20 + 17)}`,
    ];
    const fp = far(-5, 9.5);
    const bw = 78,
      bh = 34;
    const b = placer.place(fp.x, fp.y, bw, bh, 4);
    o.push(
      `<rect x="${P(b.x)}" y="${P(b.y)}" width="${bw}" height="${bh}" fill="#fff" stroke="${INK}" stroke-width="0.9"/>`,
    );
    lbl.forEach((t, i) =>
      o.push(
        text(b.x + bw / 2, b.y + 11 + i * 10, t, {
          size: i === 0 ? 8.5 : 8.5,
          weight: i === 1 ? 700 : 400,
          anchor: "middle",
          halo: false,
        }),
      ),
    );
  }
  // block the symbol spots first so labels avoid them
  const symbols = new Map<string, { leg: ProcLeg; p: Pt }>();
  for (const l of allLegs)
    if (
      !symbols.has(l.fix.ident) &&
      l.fix.kind !== "runway" &&
      l.fix.kind !== "airport"
    )
      symbols.set(l.fix.ident, { leg: l, p: proj(l.fix) });
  for (const { p, leg } of symbols.values())
    placer.block(p.x - 9, p.y - 9, 18, leg.role === "FAF" ? 30 : 18);
  // transitions
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
        o.push(line(p0, p1, 1.4));
        o.push(arrowHead(p1, Math.atan2(p1.y - p0.y, p1.x - p0.x)));
        const bb = proj(b0),
          b1 = proj(tip);
        o.push(
          line(bb, b1, 1.4) +
            arrowHead(b1, Math.atan2(b1.y - bb.y, b1.x - bb.x)),
        );
        const back = proj(
          destination(tip, ob + 180 + (l.pt.side === "L" ? 45 : -45), 1.3),
        );
        o.push(
          line(b1, back, 1.4) +
            arrowHead(back, Math.atan2(back.y - b1.y, back.x - b1.x)),
        );
        o.push(legLabel(bb, b1, `${pad3(s45)}°`, placer));
        o.push(legLabel(b1, back, `${pad3(s45 + 180)}°`, placer));
        const lp = proj(destination(tip, ob, 1.2));
        const tt = `REMAIN WITHIN ${l.pt.withinNm} NM`;
        const bx = placer.place(lp.x, lp.y, textW(tt, 8.5) + 8, 24, 4);
        o.push(
          text(bx.x + 4, bx.y + 10, `PROCEDURE TURN  ${l.altMin ?? ""}`, {
            size: 8.5,
            weight: 700,
          }),
        );
        o.push(text(bx.x + 4, bx.y + 21, tt, { size: 8.5 }));
      }
      if (l.hilpt && l.hold)
        o.push(holdPath(proj, l.fix, l.hold.inbound, l.hold.turn, false));
      if (i === 0) continue;
      const a = proj(t.legs[i - 1].fix);
      const b = proj(l.fix);
      if (l.arc) {
        const c = NAVAIDS.find((n) => n.ident === l.arc!.center);
        if (c) {
          const r = l.arc.radius * proj.scale;
          o.push(
            `<path d="M${P(a.x)},${P(a.y)} A${P(r)},${P(r)} 0 0 ${l.arc.dir === "R" ? 1 : 0} ${P(b.x)},${P(b.y)}" fill="none" stroke="${INK}" stroke-width="1.4"/>`,
          );
          const midB =
            (bearingDeg(c, t.legs[i - 1].fix) + bearingDeg(c, l.fix)) / 2;
          const mid = proj(destination(c, midB, l.arc.radius));
          const tt = `${l.arc.radius} DME ARC  ${l.altMin ?? ""}`;
          const bx = placer.place(mid.x, mid.y, textW(tt, 9, true) + 4, 12, 6);
          o.push(text(bx.x + 2, bx.y + 10, tt, { size: 9, weight: 700 }));
        }
        continue;
      }
      o.push(courseLine(a, b, { width: 1.3 }));
      o.push(
        legLabel(
          a,
          b,
          `${l.altMin ?? ""}  NoPT  ${pad3(l.course ?? bearingDeg(t.legs[i - 1].fix, l.fix))}° (${(l.dist ?? 0).toFixed(1)})`,
          placer,
        ),
      );
    }
  }
  // final approach course: heavy
  for (let i = 1; i < ap.final.length; i++) {
    const a = proj(ap.final[i - 1].fix),
      b = proj(ap.final[i].fix);
    o.push(courseLine(a, b, { width: 3 }));
    if (i === 1)
      o.push(
        legLabel(
          a,
          b,
          `${pad3(ap.finalCourse)}°  (${(ap.final[i].dist ?? 0).toFixed(1)})`,
          placer,
          12,
          true,
        ),
      );
  }
  // missed approach: dashed with arrows
  for (let i = 1; i < ap.missed.length; i++) {
    const a = proj(ap.missed[i - 1].fix),
      b = proj(ap.missed[i].fix);
    o.push(courseLine(a, b, { dash: true, width: 1.3 }));
    const hd = ap.missed[i].hold;
    if (hd) o.push(holdPath(proj, ap.missed[i].fix, hd.inbound, hd.turn, true));
  }
  for (const l of ap.final)
    if (l.hold)
      o.push(holdPath(proj, l.fix, l.hold.inbound, l.hold.turn, false));
  o.push(runwayShape(proj, ap.airport, 3.2, 3));
  // fix symbols + collision-free labels
  for (const { leg: l, p } of symbols.values()) {
    const kind =
      l.fix.kind === "vor"
        ? "vor"
        : l.fix.kind === "ndb"
          ? "ndb"
          : ap.type === "RNAV"
            ? "wpt"
            : "fix";
    o.push(
      navSymbol(kind, p.x, p.y, {
        compulsory: l.role === "FAF" || l.role === "IAF",
        faf: l.role === "FAF" && !precision,
      }),
    );
    const role =
      l.role && l.role !== "STEPDOWN" && l.role !== "ENR" && l.role !== "RWY"
        ? ` (${l.role})`
        : "";
    const name = `${l.fix.ident}${role}`;
    const sub: string[] = [];
    if (l.fix.kind === "vor" || l.fix.kind === "ndb") {
      const n = NAVAIDS.find((x) => x.ident === l.fix.ident);
      if (n)
        sub.push(
          `${n.name.toUpperCase()} ${n.type === "NDB" ? n.freq : n.freq.toFixed(2)}`,
        );
    } else if (nav?.dme && nav.type !== "NDB" && l.role !== "MAHP")
      sub.push(
        `${(nav.type === "ILS" || nav.type === "LOC") && nav.ident.startsWith("I") ? `I-${nav.ident.slice(1)}` : nav.ident} ${f1(distanceNm(l.fix, nav))} DME`,
      );
    const alt = allLegs.find(
      (x) => x.fix.ident === l.fix.ident && x.altMin,
    )?.altMin;
    if (alt && l.role !== "MAHP") sub.push(`${alt}`);
    const w = Math.max(
      textW(name, 10.5, true),
      ...sub.map((s) => textW(s, 8.5)),
    );
    const bx = placer.place(p.x, p.y, w + 4, 12 + sub.length * 10, 10);
    o.push(text(bx.x + 2, bx.y + 10, name, { size: 10.5, weight: 700 }));
    sub.forEach((s, i) =>
      o.push(
        text(bx.x + 2, bx.y + 21 + i * 10, s, {
          size: 8.5,
          deco: /^\d+$/.test(s) ? "underline" : undefined,
        }),
      ),
    );
  }
  if (
    nav &&
    nav.type !== "ILS" &&
    nav.type !== "LOC" &&
    !symbols.has(nav.ident)
  ) {
    const p = proj(nav);
    o.push(navSymbol(nav.type === "NDB" ? "ndb" : "vor", p.x, p.y));
  }
  o.push(`</g>`);
  // north arrow + scale bar + frame
  o.push(
    `<g transform="translate(${pv.x + 26} ${pv.y + 30})"><path d="M0,-18 L6,5 L0,1 L-6,5 Z" fill="${INK}"/><text y="17" font-size="9" text-anchor="middle" font-weight="700">N</text></g>`,
  );
  {
    const nm = 5 * proj.scale;
    const x0 = pv.x + pv.w - nm - 22,
      y0 = pv.y + pv.h - 14;
    o.push(
      `<rect x="${P(x0 - 4)}" y="${P(y0 - 15)}" width="${P(nm + 8)}" height="20" fill="#fff" opacity="0.85"/>`,
    );
    o.push(
      `<rect x="${P(x0)}" y="${P(y0 - 2)}" width="${P(nm / 2)}" height="4" fill="${INK}"/><rect x="${P(x0 + nm / 2)}" y="${P(y0 - 2)}" width="${P(nm / 2)}" height="4" fill="#fff" stroke="${INK}" stroke-width="0.8"/>`,
    );
    o.push(text(x0 + nm / 2, y0 - 5, "5 NM", { size: 8.5, anchor: "middle" }));
  }
  o.push(rect(pv.x, pv.y, pv.w, pv.h, { sw: 1.2 }));

  // ---------------------------------------------- profile view
  const pr = PROF;
  o.push(line({ x: 10, y: pr.y + pr.h }, { x: W - 10, y: pr.y + pr.h }, 1.2));
  const fin = ap.final;
  const dists = fin.map((l) => distanceNm(l.fix, rwy.threshold));
  const maxD = Math.max(...dists) * 1.06 + 0.4;
  const maxAlt =
    Math.max(...fin.map((l) => l.altMin ?? 0), rwy.elevFt + 1000) + 500;
  const xL = 40,
    xR = W - 150;
  const px = (d: number) => xR - (d / maxD) * (xR - xL);
  const gy = pr.y + pr.h - 34;
  const py = (alt: number) =>
    gy - ((alt - rwy.elevFt) / (maxAlt - rwy.elevFt)) * (pr.h - 72);
  // ground with hatching
  o.push(line({ x: xL - 20, y: gy }, { x: xR + 30, y: gy }, 1.2));
  for (let x = xL - 16; x < xR + 30; x += 7)
    o.push(line({ x, y: gy }, { x: x - 5, y: gy + 5 }, 0.5));
  o.push(
    `<rect x="${P(px(0))}" y="${P(gy - 3)}" width="30" height="5" fill="${INK}"/>`,
  );
  o.push(
    text(px(0) + 15, gy + 17, `TDZE ${rwy.elevFt}`, {
      size: 8.5,
      anchor: "middle",
      halo: false,
    }),
  );
  // vertical fix lines + labels
  fin.forEach((l, i) => {
    const x = px(dists[i]);
    if (l.role === "MAP" && l.fix.kind === "runway") return;
    o.push(line({ x, y: pr.y + 26 }, { x, y: gy }, 0.6, "2 2"));
    o.push(
      text(x, pr.y + 14, l.fix.ident, {
        size: 10,
        weight: 700,
        anchor: "middle",
        halo: false,
      }),
    );
    if (l.role === "FAF")
      o.push(
        precision
          ? `<path d="M${P(x - 4)},${P(pr.y + 18)} l3,4 l-2,0 l3,5" stroke="${INK}" fill="none" stroke-width="1.3"/>`
          : malteseCross(x, pr.y + 22, 4),
      );
    if (nav?.dme || nav?.type === "ILS")
      o.push(
        text(x, gy + 26, `${f1(dists[i])}`, {
          size: 8,
          anchor: "middle",
          halo: false,
        }),
      );
  });
  // segment distances between fixes
  for (let i = 1; i < fin.length; i++) {
    const a = px(dists[i - 1]),
      b = px(dists[i]);
    o.push(
      text((a + b) / 2, gy - 4, `${f1(Math.abs(dists[i - 1] - dists[i]))} NM`, {
        size: 8,
        anchor: "middle",
      }),
    );
  }
  // vertical path
  let d = "";
  if (precision) {
    // initial altitude, step down to the FAF altitude, intercept the glide path at the FAF altitude
    const iAlt = fin[0].altMin ?? fafAlt;
    const gAlt = fafAlt || iAlt;
    const intercept =
      (gAlt - rwy.elevFt - (ap.tch ?? 50)) /
      (Math.tan((ap.gsAngle ?? 3) * DEG) * 6076);
    const x0 = px(dists[0]);
    const xStep = Math.min(px(intercept) - 4, x0 + 26);
    d = `M${P(x0)},${P(py(iAlt))}${iAlt !== gAlt ? ` L${P(x0 + 12)},${P(py(iAlt))} L${P(xStep)},${P(py(gAlt))}` : ""} L${P(px(intercept))},${P(py(gAlt))} L${P(px(0))},${P(py(rwy.elevFt + (ap.tch ?? 50)))}`;
    // LOC-only stepdown (dashed) to the MDA
    const locMin = ap.minimums.find((m) => m.mda)?.mda;
    if (locMin && faf)
      o.push(
        `<path d="M${P(px(distanceNm(faf.fix, rwy.threshold)))},${P(py(fafAlt))} L${P(px(distanceNm(faf.fix, rwy.threshold)) + 20)},${P(py(locMin))} L${P(px(0))},${P(py(locMin))}" fill="none" stroke="${INK}" stroke-width="1" stroke-dasharray="5 3"/>`,
      );
    const gsMid = px(intercept * 0.45);
    o.push(
      text(
        gsMid,
        py(rwy.elevFt + intercept * 0.45 * 318 + 50) - 14,
        `${ap.type === "ILS" ? "GS" : "GP"} ${ap.gsAngle!.toFixed(2)}°`,
        { size: 9, weight: 700, anchor: "middle" },
      ),
    );
    o.push(
      text(
        gsMid,
        py(rwy.elevFt + intercept * 0.45 * 318 + 50) - 3,
        `TCH ${ap.tch ?? 50}`,
        { size: 8.5, anchor: "middle" },
      ),
    );
  } else {
    fin.forEach((l, i) => {
      const alt = l.role === "MAP" ? minAlt : (l.altMin ?? minAlt);
      const x = px(dists[i]);
      if (i === 0) d += `M${P(x)},${P(py(alt))}`;
      else
        d += ` L${P(Math.min(x, px(dists[i - 1]) + 14))},${P(py(fin[i - 1].altMin ?? alt))} L${P(Math.min(x, px(dists[i - 1]) + 30))},${P(py(alt))} L${P(x)},${P(py(alt))}`;
    });
  }
  o.push(`<path d="${d}" fill="none" stroke="${INK}" stroke-width="2.6"/>`);
  fin.forEach((l, i) => {
    if (l.altMin && l.role !== "MAP")
      o.push(
        text(px(dists[i]) - 4, py(l.altMin) - 6, `${l.altMin}`, {
          size: 10,
          weight: 700,
          anchor: "end",
          deco: "underline",
        }),
      );
  });
  // missed approach: dashed climb + FAA-style icon boxes
  {
    const x0 = px(0) + 30,
      y0 = py(minAlt);
    o.push(
      `<path d="M${P(px(0))},${P(y0)} L${P(x0)},${P(y0)} L${P(x0 + 16)},${P(pr.y + 36)}" fill="none" stroke="${INK}" stroke-width="1.3" stroke-dasharray="5 3"/>`,
    );
    o.push(arrowHead({ x: x0 + 16, y: pr.y + 36 }, -1.2, 7));
    const last = ap.missed[ap.missed.length - 1];
    const first = ap.missed[1] ?? last;
    const turn = /RIGHT/i.test(ap.missedText)
      ? "↱"
      : /LEFT/i.test(ap.missedText)
        ? "↰"
        : "↑";
    const icons: [string, string][] = [
      ["↑", `${first.altMin ?? last.altMin ?? ""}`],
      [turn, `${last.altMin ?? ""}`],
      ["→", first.fix.ident],
      ["⟲", last.hold ? `${last.fix.ident}` : last.fix.ident],
    ];
    icons.forEach(([ic, t], i) => {
      const bx = W - 132 + (i % 2) * 60,
        by = pr.y + 52 + Math.floor(i / 2) * 32;
      o.push(rect(bx, by, 56, 28, { fill: "#fff", sw: 1 }));
      o.push(
        text(bx + 12, by + 19, ic, {
          size: 15,
          weight: 700,
          anchor: "middle",
          halo: false,
        }),
      );
      o.push(
        text(bx + 34, by + 18, t, {
          size: 9.5,
          weight: 700,
          anchor: "middle",
          halo: false,
        }),
      );
    });
  }

  // ---------------------------------------------- minimums (Jeppesen-style: straight-in | circle-to-land)
  const mnY = pr.y + pr.h;
  const straight = ap.minimums.filter((m) => !/CIRCL/i.test(m.label));
  const circle = ap.minimums.find((m) => /CIRCL/i.test(m.label));
  const visTxt = (v: string) => ({ "1/4": "RVR 12 or ¼", "1/2": "RVR 18 or ½", "3/4": "RVR 40 or ¾", "1": "RVR 50 or 1", "1 1/4": "1¼", "1 1/2": "1½" } as Record<string, string>)[v] ?? (v.startsWith("RVR") ? v : `VIS ${v}`);
  const alsOut = (v: string) => ({ "1/4": "RVR 24 or ½", "1/2": "RVR 40 or ¾", "3/4": "RVR 60 or 1¼", "1": "1½" } as Record<string, string>)[v] ?? v;
  const MH = 92;
  const split = circle ? W - 10 - 196 : W - 10;
  o.push(rect(10, mnY, W - 20, MH, { sw: 1.2 }));
  o.push(`<rect x="10" y="${mnY}" width="${W - 20}" height="17" fill="#e6e6e6" stroke="${INK}"/>`);
  o.push(text((10 + split) / 2, mnY + 12.5, `STRAIGHT-IN LANDING RWY ${ap.runway}`, { size: 10, weight: 700, anchor: "middle", halo: false }));
  if (circle) {
    o.push(line({ x: split, y: mnY }, { x: split, y: mnY + MH }, 1.2));
    o.push(text((split + W - 10) / 2, mnY + 12.5, "CIRCLE-TO-LAND", { size: 10, weight: 700, anchor: "middle", halo: false }));
  }
  const colW = (split - 10) / Math.max(1, straight.length);
  straight.forEach((m, i) => {
    const x0 = 10 + i * colW;
    if (i) o.push(line({ x: x0, y: mnY + 17 }, { x: x0, y: mnY + MH }, 0.8));
    const isDa = m.da !== undefined;
    const alt = m.da ?? m.mda ?? 0;
    const lbl = m.label.replace(/^S-/, "").replace(/ \d+[LRC]?$/, "");
    o.push(text(x0 + colW / 2, mnY + 29, lbl + (/LOC/.test(lbl) && precision ? " (GS out)" : ""), { size: 9, weight: 700, anchor: "middle", halo: false }));
    o.push(text(x0 + colW / 2, mnY + 45, `${isDa ? "DA(H)" : "MDA(H)"} ${alt}'(${m.hat}')`, { size: 11.5, weight: 700, anchor: "middle", halo: false }));
    o.push(line({ x: x0 + 6, y: mnY + 52 }, { x: x0 + colW - 6, y: mnY + 52 }, 0.5));
    o.push(text(x0 + 8, mnY + 66, "FULL", { size: 8, halo: false }));
    o.push(text(x0 + colW - 8, mnY + 66, visTxt(m.vis), { size: 10, weight: 700, anchor: "end", halo: false }));
    o.push(text(x0 + 8, mnY + 83, "ALS out", { size: 8, halo: false }));
    o.push(text(x0 + colW - 8, mnY + 83, alsOut(m.vis), { size: 10, weight: 700, anchor: "end", halo: false }));
  });
  if (circle) {
    const cx0 = split;
    const base = circle.mda ?? 0;
    ["A", "B", "C", "D"].forEach((c, i) => {
      const y = mnY + 31 + i * 16;
      const extra = i * 40;
      o.push(text(cx0 + 10, y, c, { size: 10, weight: 700, halo: false }));
      o.push(text(cx0 + 98, y, `${base + extra}'(${circle.hat + extra}')`, { size: 10, weight: 700, anchor: "middle", halo: false }));
      o.push(text(cx0 + 186, y, i < 2 ? visTxt(circle.vis).replace(/^VIS /, "") : "1½", { size: 10, weight: 700, anchor: "end", halo: false }));
    });
    o.push(text(cx0 + 98, mnY + 21, "MDA(H)", { size: 7, anchor: "middle", halo: false }));
  }
  const rows = 4;
  const rowH = (MH - 20) / rows;

  // ---------------------------------------------- bottom: timing table + airport sketch
  const bY = mnY + 20 + rows * rowH;
  const bH = H - 32 - bY;
  if (bH > 70) {
    const box = { x: W - 220, y: bY, w: 210, h: bH };
    o.push(line({ x: box.x, y: bY }, { x: box.x, y: bY + bH }));
    const a = airport(ap.airport);
    const ends = a.runways.flatMap((r) => [r.threshold, r.end]);
    const p2 = makeProj([a, ...ends], box, 26);
    o.push(runwayShape(p2, ap.airport, 5, 4));
    for (const r of a.runways) {
      const p = p2(destination(r.threshold, r.heading + 180, 0.13));
      o.push(
        text(p.x, p.y + 3.5, r.id, { size: 9, weight: 700, anchor: "middle" }),
      );
    }
    for (let i = 0; i < a.runways.length; i += 2) {
      const r = a.runways[i];
      const m = p2({
        lat: (r.threshold.lat + r.end.lat) / 2,
        lon: (r.threshold.lon + r.end.lon) / 2,
      });
      let ang = r.heading - 90;
      if (ang > 90) ang -= 180;
      if (ang < -90) ang += 180;
      o.push(
        text(m.x, m.y - 6, `${r.lengthFt} × ${r.widthFt}`, {
          size: 7.5,
          anchor: "middle",
          rotate: ang,
        }),
      );
    }
    // approach lighting symbol at the approach runway
    const lp = p2(destination(rwy.threshold, rwy.heading + 180, 0.32));
    o.push(
      `<circle cx="${P(lp.x)}" cy="${P(lp.y)}" r="7" fill="#fff" stroke="${INK}"/>`,
    );
    o.push(
      text(
        lp.x,
        lp.y + 3,
        lightingSystem(ap.airport, ap.runway) === "ALSF-2" ? "A5" : "A1",
        { size: 7, weight: 700, anchor: "middle", halo: false },
      ),
    );
    o.push(
      text(
        box.x + 6,
        box.y + box.h - 6,
        `ELEV ${a.elevFt}   ·   ${lightingSystem(ap.airport, ap.runway)} RWY ${ap.runway}`,
        { size: 8, halo: false },
      ),
    );
    // FAF → MAP timing table
    const fm = faf ? distanceNm(faf.fix, fin[fin.length - 1].fix) : 0;
    const kts = [60, 90, 120, 140, 160];
    const tx = 20,
      ty = bY + 14;
    o.push(
      text(tx, ty, `${faf?.fix.ident ?? "FAF"} to MAP ${f1(fm)} NM`, {
        size: 10,
        weight: 700,
        halo: false,
      }),
    );
    const cwT = 62;
    o.push(rect(tx, ty + 6, 70 + kts.length * cwT, 36, { sw: 0.8 }));
    o.push(
      line(
        { x: tx, y: ty + 24 },
        { x: tx + 70 + kts.length * cwT, y: ty + 24 },
        0.6,
      ),
    );
    o.push(text(tx + 6, ty + 19, "Knots", { size: 9, halo: false }));
    o.push(text(tx + 6, ty + 37, "Min:Sec", { size: 9, halo: false }));
    kts.forEach((k, i) => {
      const x = tx + 70 + i * cwT;
      o.push(line({ x, y: ty + 6 }, { x, y: ty + 42 }, 0.6));
      const sec = (fm / k) * 3600;
      o.push(
        text(x + cwT / 2, ty + 19, `${k}`, {
          size: 9.5,
          weight: 700,
          anchor: "middle",
          halo: false,
        }),
      );
      o.push(
        text(
          x + cwT / 2,
          ty + 37,
          `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`,
          { size: 9.5, anchor: "middle", halo: false },
        ),
      );
    });
    o.push(
      text(
        tx,
        ty + 56,
        `Final course ${pad3(ap.finalCourse)}°  ·  Rwy ${ap.runway} ${rwy.lengthFt} × ${rwy.widthFt}  ·  ${lightingSystem(ap.airport, ap.runway)}`,
        { size: 9, halo: false },
      ),
    );
    if (precision)
      o.push(
        text(
          tx,
          ty + 68,
          `Rate of descent on ${ap.gsAngle!.toFixed(1)}°: 90 KT ≈ ${Math.round(90 * 101.3 * Math.tan(ap.gsAngle! * DEG) * 1.0)} fpm  ·  120 KT ≈ ${Math.round(120 * 101.3 * Math.tan(ap.gsAngle! * DEG))} fpm`,
          { size: 9, halo: false },
        ),
      );
  }
  // footer
  o.push(line({ x: 10, y: H - 32 }, { x: W - 10, y: H - 32 }, 1.2));
  o.push(
    text(20, H - 17, `${apt.city.toUpperCase()} · ${apt.icao}`, {
      size: 9,
      weight: 700,
      halo: false,
    }),
  );
  o.push(
    text(W / 2, H - 17, "SIMULATED — NOT FOR NAVIGATION", {
      size: 9,
      weight: 700,
      anchor: "middle",
      halo: false,
    }),
  );
  o.push(
    text(W - 20, H - 17, ap.name, {
      size: 9,
      weight: 700,
      anchor: "end",
      halo: false,
    }),
  );
  o.push(`</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plate">${o.join("")}</svg>`;
}

function legLabel(
  a: Pt,
  b: Pt,
  s: string,
  placer: Placer,
  size = 9.5,
  bold = true,
): string {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const tw = textW(s, size, bold);
  if (len < tw * 0.6) return "";
  let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (ang > 90) ang -= 180;
  if (ang < -90) ang += 180;
  // try a few positions along the leg, both sides
  for (const t of [0.5, 0.38, 0.62, 0.28, 0.72])
    for (const side of [-1, 1]) {
      const mx = a.x + (b.x - a.x) * t,
        my = a.y + (b.y - a.y) * t;
      const nx = -Math.sin((ang * Math.PI) / 180) * side * 8,
        ny = Math.cos((ang * Math.PI) / 180) * side * 8;
      const cx = mx + nx,
        cy = my + ny;
      const bb = {
        x:
          cx -
          (Math.max(tw, 10) / 2) * Math.abs(Math.cos((ang * Math.PI) / 180)) -
          5,
        y: cy - 7,
        w: Math.max(14, tw * Math.abs(Math.cos((ang * Math.PI) / 180)) + 10),
        h: 14 + tw * Math.abs(Math.sin((ang * Math.PI) / 180)),
      };
      bb.y = cy - bb.h / 2;
      if (placer.free(bb)) {
        placer.block(bb.x, bb.y, bb.w, bb.h);
        return text(cx, cy + size * 0.35, s, {
          size,
          weight: bold ? 700 : 400,
          anchor: "middle",
          rotate: ang,
        });
      }
    }
  return "";
}

// ------------------------------------------------------------------ airport diagram
export function airportDiagram(icao: string): string {
  const a = airport(icao);
  const uid = `apd${icao}`;
  const o: string[] = [`<rect width="${W}" height="${H}" fill="#fff"/>`];
  o.push(
    `<style>.p-${uid} text{font-family:${FONT};fill:${INK}} .p-${uid} .hl{paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}</style>`,
  );
  o.push(`<g class="p-${uid}">`);
  o.push(rect(10, 10, W - 20, H - 20, { sw: 1.6 }));
  o.push(text(20, 26, a.city.toUpperCase(), { size: 9.5, halo: false }));
  o.push(
    text(20, 41, `${a.name.toUpperCase()} (${a.icao})`, {
      size: 11,
      weight: 700,
      halo: false,
    }),
  );
  o.push(
    text(W - 20, 34, "AIRPORT DIAGRAM", {
      size: 19,
      weight: 700,
      anchor: "end",
      halo: false,
    }),
  );
  o.push(line({ x: 10, y: 50 }, { x: W - 10, y: 50 }, 1.2));
  const fq = a.freqs;
  const fl: [string, string][] = (
    [
      ["ATIS", fq.atis],
      [`${a.icao} TOWER`, fq.tower],
      ["GND CON", fq.ground],
      ["CTAF", fq.ctaf],
    ] as [string, number | undefined][]
  )
    .filter((x) => x[1])
    .map((x) => [x[0], freq(x[1])]);
  const cw = (W - 20) / fl.length;
  fl.forEach((f, i) => {
    if (i) o.push(line({ x: 10 + i * cw, y: 50 }, { x: 10 + i * cw, y: 74 }));
    o.push(text(16 + i * cw, 66, f[0], { size: 9, halo: false }));
    o.push(
      text(10 + (i + 1) * cw - 6, 66, f[1], {
        size: 12,
        weight: 700,
        anchor: "end",
        halo: false,
      }),
    );
  });
  o.push(line({ x: 10, y: 74 }, { x: W - 10, y: 74 }));
  const box = { x: 20, y: 84, w: W - 40, h: H - 170 };
  const ends = a.runways.flatMap((r) => [r.threshold, r.end]);
  const proj = makeProj([a, ...ends], box, 80);
  // taxiways (parallel at 400 ft / 300 ft, as in the 3D scenery) + apron
  for (let i = 0; i < a.runways.length; i += 2) {
    const r = a.runways[i];
    const side = i === 0 ? 1 : -1;
    const off = (r.widthFt >= 150 ? 400 : 300) / 6076;
    const t1 = proj(destination(r.threshold, r.heading + 90 * side, off));
    const t2 = proj(destination(r.end, r.heading + 90 * side, off));
    o.push(
      `<line x1="${P(t1.x)}" y1="${P(t1.y)}" x2="${P(t2.x)}" y2="${P(t2.y)}" stroke="#c9c9c9" stroke-width="9"/>`,
    );
    for (const f of [0.0067, 0.36, 0.64, 0.9933]) {
      const s = destination(r.threshold, r.heading, (r.lengthFt / 6076) * f);
      const c1 = proj(s),
        c2 = proj(destination(s, r.heading + 90 * side, off));
      o.push(
        `<line x1="${P(c1.x)}" y1="${P(c1.y)}" x2="${P(c2.x)}" y2="${P(c2.y)}" stroke="#c9c9c9" stroke-width="8"/>`,
      );
    }
    const lab = proj(
      destination(
        destination(r.threshold, r.heading, (r.lengthFt / 6076) * 0.2),
        r.heading + 90 * side,
        off,
      ),
    );
    o.push(
      text(lab.x, lab.y + 4, i === 0 ? "A" : "B", {
        size: 10,
        weight: 700,
        anchor: "middle",
      }),
    );
    if (i === 0) {
      const ap0 = (r.lengthFt * 0.56) / 6076,
        ap1 = Math.min(r.lengthFt * 0.56 + 1500, r.lengthFt - 1100) / 6076;
      const q = [
        destination(
          destination(r.threshold, r.heading, ap0),
          r.heading + 90,
          off + 25 / 6076,
        ),
        destination(
          destination(r.threshold, r.heading, ap1),
          r.heading + 90,
          off + 25 / 6076,
        ),
        destination(
          destination(r.threshold, r.heading, ap1),
          r.heading + 90,
          off + 560 / 6076,
        ),
        destination(
          destination(r.threshold, r.heading, ap0),
          r.heading + 90,
          off + 560 / 6076,
        ),
      ].map(proj);
      o.push(
        `<polygon points="${q.map((p) => `${P(p.x)},${P(p.y)}`).join(" ")}" fill="#e3e3e3" stroke="#999" stroke-width="0.8"/>`,
      );
      const c = { x: (q[0].x + q[2].x) / 2, y: (q[0].y + q[2].y) / 2 };
      o.push(
        text(c.x, c.y + 4, "TERMINAL APRON", {
          size: 9,
          weight: 700,
          anchor: "middle",
        }),
      );
      const tw = proj(
        destination(
          destination(r.threshold, r.heading, ap1 + 160 / 6076),
          r.heading + 90,
          off + 520 / 6076,
        ),
      );
      o.push(`<circle cx="${P(tw.x)}" cy="${P(tw.y)}" r="4" fill="${INK}"/>`);
      o.push(text(tw.x + 7, tw.y + 4, "TWR", { size: 8.5, weight: 700 }));
    }
  }
  for (let i = 0; i < a.runways.length; i += 2) {
    const r = a.runways[i];
    const p1 = proj(r.threshold),
      p2 = proj(r.end);
    const w = Math.max(12, (r.widthFt / 6076) * proj.scale * 2.5);
    o.push(
      `<line x1="${P(p1.x)}" y1="${P(p1.y)}" x2="${P(p2.x)}" y2="${P(p2.y)}" stroke="${INK}" stroke-width="${P(w)}"/>`,
    );
    o.push(
      `<line x1="${P(p1.x)}" y1="${P(p1.y)}" x2="${P(p2.x)}" y2="${P(p2.y)}" stroke="#fff" stroke-width="1.2" stroke-dasharray="9 7"/>`,
    );
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    let ang = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
    if (ang > 90) ang -= 180;
    if (ang < -90) ang += 180;
    const nx = -Math.sin((ang * Math.PI) / 180) * (w / 2 + 9),
      ny = Math.cos((ang * Math.PI) / 180) * (w / 2 + 9);
    o.push(
      text(mid.x - nx, mid.y - ny + 4, `${r.lengthFt} × ${r.widthFt}`, {
        size: 11,
        weight: 700,
        anchor: "middle",
        rotate: ang,
      }),
    );
  }
  for (const r of a.runways) {
    const p = proj(destination(r.threshold, r.heading + 180, 0.16));
    o.push(
      text(p.x, p.y + 6, r.id, { size: 17, weight: 700, anchor: "middle" }),
    );
    const q = proj(destination(r.threshold, r.heading + 180, 0.28));
    o.push(
      text(q.x, q.y + 4, `${pad3(r.heading)}.0°`, {
        size: 9,
        anchor: "middle",
      }),
    );
    const e = proj(destination(r.threshold, r.heading + 90, 0.06));
    o.push(text(e.x, e.y, `ELEV ${r.elevFt}`, { size: 8, anchor: "middle" }));
  }
  o.push(
    `<g transform="translate(${W - 50} 120)"><path d="M0,-26 L9,7 L0,1 L-9,7 Z" fill="${INK}"/><text y="23" font-size="11" text-anchor="middle" font-weight="700">N</text></g>`,
  );
  o.push(line({ x: 10, y: H - 80 }, { x: W - 10, y: H - 80 }));
  o.push(
    text(20, H - 60, `FIELD ELEV ${a.elevFt}`, {
      size: 12,
      weight: 700,
      halo: false,
    }),
  );
  o.push(
    text(
      20,
      H - 44,
      `VAR ${a.magVar === 0 ? "0°" : `${Math.abs(a.magVar)}° ${a.magVar > 0 ? "E" : "W"}`}  ·  ${a.runways.length / 2} runway${a.runways.length > 2 ? "s" : ""}  ·  lighting: ${a.runways.map((r) => `${r.id} ${lightingSystem(a.icao, r.id)}`).join(", ")}`,
      { size: 9, halo: false },
    ),
  );
  o.push(line({ x: 10, y: H - 32 }, { x: W - 10, y: H - 32 }, 1.2));
  o.push(
    text(W / 2, H - 17, "SIMULATED — NOT FOR NAVIGATION", {
      size: 9,
      weight: 700,
      anchor: "middle",
      halo: false,
    }),
  );
  o.push(`</g>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="plate">${o.join("")}</svg>`;
}

export interface ChartEntry {
  id: string;
  airport: string;
  title: string;
  kind: "IAP" | "APD";
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
      render: () => airportDiagram(a.icao),
    });
    for (const ap of APPROACHES.filter((x) => x.airport === a.icao))
      out.push({
        id: ap.id,
        airport: a.icao,
        title: ap.name,
        kind: "IAP",
        approachId: ap.id,
        render: () => approachPlate(ap),
      });
  }
  return out;
}

// re-exported for unit tests
export const _internal = { Placer, makeProj };
export type { Fix };
