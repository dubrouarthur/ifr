// Teaching diagram: holding pattern with the entry sectors (ICAO PANS-OPS / FAA AIM 5-3-8), drawn NORTH-UP in
// the real geometry of the clearance, black on white like the official PANS-OPS figure:
//  - a circle around the fix with the two sector boundaries (the 70° line through the fix and the extension of
//    the inbound course beyond the fix) and the arc sizes 70° / 110° / 180°;
//  - SECTOR 1 / PARALLEL, SECTOR 2 / OFFSET (teardrop), SECTOR 3 / DIRECT;
//  - the racetrack with its turn direction, the aircraft arriving on its course, its sector tinted and the entry
//    it must fly drawn dashed (30° offset for the teardrop).
import { holdEntry, cardinal, type Turn } from "../nav/holding";

const pad3 = (n: number) =>
  String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, "0");
const r1 = (v: number) => Math.round(v * 10) / 10;

/** SVG of a hold (north up) with the three entry sectors; `courseToFix` adds the aircraft and its entry. */
const escSvg = (s: string) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export function holdDiagramSvg(
  inbound: number,
  turn: Turn,
  fixIdent: string,
  courseToFix?: number,
  lang: "en" | "fr" = "en",
): string {
  // the ident comes from author or imported content: escaped before it is interpolated into SVG markup
  fixIdent = escSvg(fixIdent);
  const fr = lang === "fr";
  const W = 400,
    H = 360,
    fx = 200,
    fy = 176;
  const RC = 132; // sector circle radius
  const L = 74,
    R = 24; // racetrack leg length and turn radius (px)
  const s = turn === "R" ? 1 : -1;
  const I = inbound;
  const O = I + 180;
  /** screen point at compass bearing b (degrees, north up) and distance r from (x0, y0) */
  const at = (b: number, r: number, x0 = fx, y0 = fy): [number, number] => {
    const a = (b * Math.PI) / 180;
    return [x0 + Math.sin(a) * r, y0 - Math.cos(a) * r];
  };
  const P = (p: [number, number]) => `${r1(p[0])},${r1(p[1])}`;
  const side = I + 90 * s; // holding side
  // racetrack: inbound leg ends at the fix, turn onto the holding side, outbound leg, turn back
  const pIn = at(O, L);
  const pTurn = at(side, 2 * R);
  const pOutEnd = at(O, L, ...pTurn);
  const sweep = s > 0 ? 1 : 0; // north-up: a right (clockwise) turn is clockwise on the screen
  const track = `M${P(pIn)} L${fx},${fy} A${R},${R} 0 0 ${sweep} ${P(pTurn)} L${P(pOutEnd)} A${R},${R} 0 0 ${sweep} ${P(pIn)}`;
  const arrowOn = (from: [number, number], to: [number, number]) => {
    const mx = (from[0] + to[0]) / 2,
      my = (from[1] + to[1]) / 2;
    const ang = (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
    return `<path d="M-6,-4 L3,0 L-6,4 Z" transform="translate(${r1(mx)} ${r1(my)}) rotate(${r1(ang)})" fill="#1d2833"/>`;
  };
  // sector boundaries (aircraft POSITION bearings from the fix, AIM FIG 5-3-8): the 70° line at 70° to the
  // outbound course on the holding side = I+110s / I−70s; the holding course extended beyond the fix = I
  const b70a = I + 110 * s,
    b70b = I - 70 * s;
  // sectors by position bearing (relative to I, measured with the turn direction):
  // parallel [0,110), direct [110,290), teardrop [290,360)
  const SECT = {
    PARALLEL: {
      from: 0,
      to: 110,
      name: fr ? "SECTEUR 1" : "SECTOR 1",
      entry: fr ? "PARALLÈLE" : "PARALLEL",
      sub: "",
      label: 50,
      arc: "110°",
    },
    TEARDROP: {
      from: 290,
      to: 360,
      name: fr ? "SECTEUR 2" : "SECTOR 2",
      entry: fr ? "DÉCALÉE" : "OFFSET",
      sub: fr ? "(goutte d’eau)" : "(teardrop)",
      label: 325,
      arc: "70°",
    },
    DIRECT: {
      from: 110,
      to: 290,
      name: fr ? "SECTEUR 3" : "SECTOR 3",
      entry: fr ? "DIRECTE" : "DIRECT",
      sub: "",
      label: 240,
      arc: "180°",
    },
  } as const;
  const absB = (rel: number) => I + rel * s;
  const wedge = (k: keyof typeof SECT) => {
    const { from, to } = SECT[k];
    const a = at(absB(from), RC),
      b = at(absB(to), RC);
    const large = to - from > 180 ? 1 : 0;
    return `M${fx},${fy} L${P(a)} A${RC},${RC} 0 ${large} ${sweep} ${P(b)} Z`;
  };
  let entry: keyof typeof SECT | null = null;
  let aircraft = "";
  let entryPath = "";
  let entryNote = "";
  if (courseToFix !== undefined) {
    const e = holdEntry(I, turn, courseToFix);
    entry = e;
    const pos = at(courseToFix + 180, RC + 2); // arriving from outside the sector circle
    const near = at(courseToFix + 180, 12);
    aircraft = `<line x1="${r1(pos[0])}" y1="${r1(pos[1])}" x2="${r1(near[0])}" y2="${r1(near[1])}" stroke="#b54708" stroke-width="2.2" marker-end="url(#hd-ah)"/>
      <g transform="translate(${r1(pos[0])} ${r1(pos[1])}) rotate(${r1(courseToFix)})"><path d="M0,-11 L2.2,-3 L12,1.5 L12,4 L2,2.6 L1.4,8.5 L5,10.5 L5,12 L-5,12 L-5,10.5 L-1.4,8.5 L-2,2.6 L-12,4 L-12,1.5 L-2.2,-3 Z" fill="#b54708" stroke="#fff" stroke-width="0.8"/></g>`;
    // the entry to fly, dashed
    if (e === "TEARDROP") {
      const leg = at(O - 30 * s, L * 0.95);
      const join = at(O, L * 0.55);
      const ctrl = at(O - 15 * s, L * 1.35);
      entryPath = `M${fx},${fy} L${P(leg)} Q${P(ctrl)} ${P(join)}`;
      const lab = at(O - 15 * s, 30);
      entryNote = `<text x="${r1(lab[0])}" y="${r1(lab[1]) + 4}" font-size="11" font-weight="700" text-anchor="middle" fill="#b54708" font-family="Inter, sans-serif">30°</text>`;
    } else if (e === "PARALLEL") {
      const off = at(O, L, ...at(I - 90 * s, 7));
      const ctrl = at(O, L * 1.25, ...at(side, 3 * R));
      entryPath = `M${fx},${fy} L${P(off)} Q${P(ctrl)} ${fx},${fy}`;
    } else {
      const c = at(side, R);
      entryPath = `M${fx},${fy} A${R},${R} 0 0 ${sweep} ${P(pTurn)} L${P(at(O, L * 0.6, ...pTurn))}`;
      void c;
    }
  }
  const lineThrough = (b: number) => `M${P(at(b, RC))} L${P(at(b + 180, RC))}`;
  const ray = (b: number) => `M${fx},${fy} L${P(at(b, RC))}`;
  // boundary ticks on the circle (the bow-tie marks of the ICAO figure)
  const tick = (b: number) => {
    const p = at(b, RC);
    return `<path d="M-7,-5 L0,0 L-7,5 Z M7,-5 L0,0 L7,5 Z" transform="translate(${P(p)}) rotate(${r1(b)})" fill="#1d2833"/>`;
  };
  const label = (k: keyof typeof SECT) => {
    const S = SECT[k];
    const r =
      k === "DIRECT" ? RC * 0.62 : k === "TEARDROP" ? RC * 0.7 : RC * 0.58;
    // keep the label of the aircraft's sector clear of its arrival line: pick, among a few positions that
    // stay inside the sector and off the racetrack, the one farthest from the arrival bearing
    const CAND: Record<string, number[]> = { TEARDROP: [325, 342, 308], PARALLEL: [50, 30, 75], DIRECT: [240, 262, 222] };
    let ang: number = S.label;
    if (courseToFix !== undefined && entry === k) {
      const rel = ((((courseToFix + 180 - I) * s) % 360) + 360) % 360;
      const dist = (a: number) => Math.abs(((a - rel + 540) % 360) - 180);
      ang = CAND[k].reduce((best, a) => (dist(a) > dist(best) ? a : best), S.label);
    }
    const p = at(absB(ang), r);
    const on = entry === k;
    const col = on ? "#b54708" : "#1d2833";
    return `<text x="${r1(p[0])}" y="${r1(p[1]) - 14}" text-anchor="middle" font-family="Inter, sans-serif" fill="${col}" font-weight="800"><tspan x="${r1(p[0])}" font-size="11">${S.name}</tspan><tspan x="${r1(p[0])}" dy="13" font-size="11">${fr ? "ENTRÉE" : S.entry}</tspan><tspan x="${r1(p[0])}" dy="13" font-size="11">${fr ? S.entry : "ENTRY"}</tspan>${S.sub ? `<tspan x="${r1(p[0])}" dy="12" font-size="10" font-weight="600">${S.sub}</tspan>` : ""}</text>`;
  };
  const arcLabel = (k: keyof typeof SECT) => {
    const S = SECT[k];
    const p = at(absB((S.from + S.to) / 2), RC + 13);
    return `<text x="${r1(p[0])}" y="${r1(p[1]) + 4}" text-anchor="middle" font-size="11" font-style="italic" fill="#475467" font-family="Inter, sans-serif">${S.arc}</text>`;
  };
  const fixLab = at(I - 90 * s + 20 * s, 18);
  const CARD_FR: Record<string, string> = { north: "au nord", northeast: "au nord-est", east: "à l’est", southeast: "au sud-est", south: "au sud", southwest: "au sud-ouest", west: "à l’ouest", northwest: "au nord-ouest" };
  const ENTRY_FR = { DIRECT: "DIRECTE", TEARDROP: "DÉCALÉE", PARALLEL: "PARALLÈLE" } as const;
  const foot = fr
    ? `Attente ${CARD_FR[cardinal(O)] ?? cardinal(O)} de ${fixIdent} · rapprochement ${pad3(I)}° · virages à ${turn === "R" ? "droite" : "gauche"} · nord en haut`
    : `Hold ${cardinal(O)} of ${fixIdent} · inbound ${pad3(I)}° · ${turn === "R" ? "right" : "left"} turns · north up`;
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="hold-diagram north-up" role="img" aria-label="Hold ${cardinal(O)} of ${fixIdent}, inbound ${pad3(I)}°, ${turn === "R" ? "right" : "left"} turns${entry ? `, ${entry.toLowerCase()} entry` : ""}">
  <style>.hold-diagram text{paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round}</style><defs><marker id="hd-ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#b54708"/></marker></defs>
  <rect class="hd-bg" width="${W}" height="${H}" rx="10" fill="#ffffff" stroke="#e2e7ed"/>
  ${entry ? `<path d="${wedge(entry)}" fill="#fff4e0" stroke="none"/>` : ""}
  <circle cx="${fx}" cy="${fy}" r="${RC}" fill="none" stroke="#1d2833" stroke-width="1"/>
  <path d="${lineThrough(b70a)} ${ray(I)}" stroke="#1d2833" stroke-width="1" fill="none"/>
  ${tick(b70a)}${tick(b70b)}${tick(I)}
  ${arcLabel("TEARDROP")}${arcLabel("PARALLEL")}${arcLabel("DIRECT")}
  <path d="${track}" fill="none" stroke="#1d2833" stroke-width="2.6" stroke-linejoin="round"/>
  ${arrowOn(pIn, [fx, fy])}${arrowOn(pTurn, pOutEnd)}
  ${entryPath ? `<path d="${entryPath}" fill="none" stroke="#b54708" stroke-width="2" stroke-dasharray="6 4"/>${entryNote}` : ""}
  ${label("TEARDROP")}${label("PARALLEL")}${label("DIRECT")}
  <path d="M${fx},${fy - 8} L${fx + 7},${fy + 5} L${fx - 7},${fy + 5} Z" fill="#fff" stroke="#1d2833" stroke-width="1.6"/>
  <text x="${r1(fixLab[0])}" y="${r1(fixLab[1]) + 4}" text-anchor="middle" font-size="12" font-weight="800" fill="#1d2833" font-family="Inter, sans-serif">${fixIdent}</text>
  ${aircraft}
  <g transform="translate(26 30)"><path d="M0,-14 L5,2 L0,-2 L-5,2 Z" fill="#1d2833"/><text x="0" y="16" text-anchor="middle" font-size="11" font-weight="800" fill="#1d2833" font-family="Inter, sans-serif">N</text></g>
  <text x="${W / 2}" y="${H - 10}" fill="#475467" font-size="11" text-anchor="middle" font-family="Inter, sans-serif">${foot}</text>
  ${entry ? `<rect x="${W - 168}" y="12" width="156" height="24" rx="6" fill="#fff4e0" stroke="#f5c27a"/><text x="${W - 90}" y="29" text-anchor="middle" fill="#b54708" font-size="12" font-weight="800" font-family="Inter, sans-serif">${fr ? `VOTRE ENTRÉE : ${ENTRY_FR[entry]}` : `YOUR ENTRY: ${entry}`}</text>` : ""}
</svg>`;
}

// ------------------------------------------------------------------ the hold in slide units (SPEC slides v2 §5)
/** Theme colours for the slide hold (the slide theme's tokens: the diagram follows the slide, no white card). */
export interface HoldColors {
  bg: string;
  ink: string;
  ink2: string;
  mute: string;
  ruleStrong: string;
  accent: string;
  sel: string;
  key: string;
  nav: string;
}
export interface HoldSlideOptions {
  /** the drawing size: viewBox 0 0 w h (on a slide, the block's logical size: 1 unit = 1 px) */
  w: number;
  h: number;
  /** type unit (labels 24 / 28 / 32 × u) */
  u?: number;
  lang?: "en" | "fr";
  colors: HoldColors;
  /** cover mode: the racetrack in accent, the aircraft, no sector labels */
  quiet?: boolean;
  /** the aircraft's course to the fix: its sector stands out and its entry is drawn dashed */
  courseToFix?: number;
}
const f2 = (v: number) => Math.round(v * 10) / 10;
/** The slide-unit hold with the three entry sectors tinted in their colours (AIM FIG 5-3-8), north up. */
export function holdSlideSvg(
  inbound: number,
  turn: Turn,
  fixIdent: string,
  o: HoldSlideOptions,
): string {
  const fix = escSvg(fixIdent);
  const fr = (o.lang ?? "en") === "fr";
  const u = o.u ?? 1;
  const C = o.colors;
  const { w, h } = o;
  const quiet = !!o.quiet;
  const I = inbound;
  const s = turn === "R" ? 1 : -1;
  const cx = w / 2 + (quiet ? 0 : 12 * u);
  const cy = h / 2 + (quiet ? 0 : 8 * u);
  const RC = Math.max(60 * u, Math.min(w / 2 - 92 * u, h / 2 - 64 * u));
  const L = RC * (quiet ? 0.7 : 0.56);
  const R = RC * (quiet ? 0.2 : 0.17);
  const at = (b: number, r: number, x0 = cx, y0 = cy): [number, number] => {
    const a = (b * Math.PI) / 180;
    return [x0 + Math.sin(a) * r, y0 - Math.cos(a) * r];
  };
  const P = (p: [number, number]) => `${f2(p[0])},${f2(p[1])}`;
  const O = I + 180;
  const side = I + 90 * s;
  const pIn = at(O, L);
  const pTurn = at(side, 2 * R);
  const pOutEnd = at(O, L, ...pTurn);
  const sw = s > 0 ? 1 : 0;
  const track = `M${P(pIn)} L${f2(cx)},${f2(cy)} A${f2(R)},${f2(R)} 0 0 ${sw} ${P(pTurn)} L${P(pOutEnd)} A${f2(R)},${f2(R)} 0 0 ${sw} ${P(pIn)}`;
  type K = "PARALLEL" | "TEARDROP" | "DIRECT";
  const SECT: Record<K, { from: number; to: number; n: number; name: string; col: string; lab: number; lr: number; arc: string }> = {
    PARALLEL: { from: 0, to: 110, n: 1, name: fr ? "Parallèle" : "Parallel", col: C.sel, lab: 52, lr: 0.62, arc: "110°" },
    TEARDROP: { from: 290, to: 360, n: 2, name: fr ? "Décalée" : "Offset", col: C.key, lab: 325, lr: 0.66, arc: "70°" },
    DIRECT: { from: 110, to: 290, n: 3, name: fr ? "Directe" : "Direct", col: C.nav, lab: 236, lr: 0.6, arc: "180°" },
  };
  const absB = (rel: number) => I + rel * s;
  const wedge = (k: K) => {
    const { from, to } = SECT[k];
    const a = at(absB(from), RC);
    const b = at(absB(to), RC);
    return `M${f2(cx)},${f2(cy)} L${P(a)} A${f2(RC)},${f2(RC)} 0 ${to - from > 180 ? 1 : 0} ${sw} ${P(b)} Z`;
  };
  const entry: K | null = o.courseToFix !== undefined ? holdEntry(I, turn, o.courseToFix) : null;
  const text = (x: number, y: number, t: string, size: number, fill: string, extra = "") =>
    `<text x="${f2(x)}" y="${f2(y)}" font-size="${f2(size * u)}" fill="${fill}" font-family="Inter, system-ui, sans-serif" font-variant-numeric="tabular-nums" ${extra}>${t}</text>`;
  const arrowHead = (p: [number, number], ang: number, size: number, fill: string) =>
    `<path d="M${-size},${-size * 0.62} L${size * 0.55},0 L${-size},${size * 0.62} Z" transform="translate(${P(p)}) rotate(${f2(ang)})" fill="${fill}"/>`;
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const ang = (a: [number, number], b: [number, number]) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  let out = "";
  if (!quiet)
    for (const k of Object.keys(SECT) as K[])
      out += `<path d="${wedge(k)}" fill="${SECT[k].col}" fill-opacity="${entry ? (entry === k ? 0.24 : 0.07) : 0.13}" stroke="none"/>`;
  out += `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(RC)}" fill="none" stroke="${C.ruleStrong}" stroke-width="${2 * u}"/>`;
  const b70 = I + 110 * s;
  out += `<path d="M${P(at(b70, RC))} L${P(at(b70 + 180, RC))} M${f2(cx)},${f2(cy)} L${P(at(I, RC))}" stroke="${quiet ? C.ruleStrong : C.mute}" stroke-width="${3 * u}" fill="none"/>`;
  const tc = quiet ? C.accent : C.ink;
  out += `<path d="${track}" fill="none" stroke="${tc}" stroke-width="${(quiet ? 8 : 6) * u}" stroke-linejoin="round" stroke-linecap="round"/>`;
  out += arrowHead(mid(pIn, [cx, cy]), ang(pIn, [cx, cy]), (quiet ? 20 : 17) * u, tc);
  if (!quiet) out += arrowHead(mid(pTurn, pOutEnd), ang(pTurn, pOutEnd), 17 * u, tc);
  const plane = (p: [number, number], hdg: number, k: number, fill: string) =>
    `<g transform="translate(${P(p)}) rotate(${f2(hdg)}) scale(${f2(k * u)})"><path d="M0,-11 L2.2,-3 L12,1.5 L12,4 L2,2.6 L1.4,8.5 L5,10.5 L5,12 L-5,12 L-5,10.5 L-1.4,8.5 L-2,2.6 L-12,4 L-12,1.5 L-2.2,-3 Z" fill="${fill}"/></g>`;
  if (quiet) {
    const pa: [number, number] = [pTurn[0] + (pOutEnd[0] - pTurn[0]) * 0.64, pTurn[1] + (pOutEnd[1] - pTurn[1]) * 0.64];
    out += `<circle cx="${f2(pa[0])}" cy="${f2(pa[1])}" r="${f2(34 * u)}" fill="${C.bg}"/>`;
    out += plane(pa, O, 2.3, C.ink);
  }
  // the aircraft arriving and the entry it must fly
  if (entry && o.courseToFix !== undefined) {
    const crs = o.courseToFix;
    const pos = at(crs + 180, RC + 40 * u);
    const near = at(crs + 180, 26 * u);
    out += `<line x1="${f2(pos[0])}" y1="${f2(pos[1])}" x2="${f2(near[0])}" y2="${f2(near[1])}" stroke="${C.accent}" stroke-width="${4 * u}" stroke-dasharray="${14 * u} ${10 * u}"/>`;
    out += arrowHead(near, ang(pos, near), 14 * u, C.accent);
    out += `<circle cx="${f2(pos[0])}" cy="${f2(pos[1])}" r="${f2(30 * u)}" fill="${C.bg}"/>`;
    out += plane(pos, crs, 2.1, C.accent);
    let path = "";
    if (entry === "TEARDROP") {
      const leg = at(O - 30 * s, L * 0.95);
      const join = at(O, L * 0.55);
      const ctrl = at(O - 15 * s, L * 1.35);
      path = `M${f2(cx)},${f2(cy)} L${P(leg)} Q${P(ctrl)} ${P(join)}`;
    } else if (entry === "PARALLEL") {
      const off = at(O, L, ...at(I - 90 * s, 14 * u));
      const ctrl = at(O, L * 1.25, ...at(side, 3 * R));
      path = `M${f2(cx)},${f2(cy)} L${P(off)} Q${P(ctrl)} ${f2(cx)},${f2(cy)}`;
    } else path = `M${f2(cx)},${f2(cy)} A${f2(R)},${f2(R)} 0 0 ${sw} ${P(pTurn)} L${P(at(O, L * 0.6, ...pTurn))}`;
    out += `<path d="${path}" fill="none" stroke="${C.accent}" stroke-width="${5 * u}" stroke-dasharray="${18 * u} ${12 * u}" stroke-linecap="round"/>`;
  }
  // the fix, its label between the two boundaries next to it (never on a line)
  const k = 15 * u;
  out += `<path d="M${f2(cx)},${f2(cy - k * 1.13)} L${f2(cx + k)},${f2(cy + k * 0.67)} L${f2(cx - k)},${f2(cy + k * 0.67)} Z" fill="${C.bg}" stroke="${C.ink}" stroke-width="${4 * u}" stroke-linejoin="round"/>`;
  const fl = at(I - 35 * s, 78 * u);
  out += text(fl[0], fl[1] + 10 * u, fix, 28, C.ink, `text-anchor="middle" font-weight="600"`);
  if (!quiet) {
    for (const kk of Object.keys(SECT) as K[]) {
      const S = SECT[kk];
      const p = at(absB(S.lab), RC * S.lr);
      out += text(p[0], p[1] - 10 * u, `${fr ? "SECTEUR" : "SECTOR"} ${S.n}`, 24, C.mute, `text-anchor="middle" font-weight="500" letter-spacing="${2.5 * u}"`);
      out += text(p[0], p[1] + 30 * u, S.name, 32, S.col, `text-anchor="middle" font-weight="600"`);
      if (entry === kk) out += text(p[0], p[1] + 64 * u, fr ? "votre entrée" : "your entry", 24, C.ink2, `text-anchor="middle" font-weight="600"`);
      const q = at(absB((S.from + S.to) / 2), RC + 44 * u);
      out += text(q[0], q[1] + 9 * u, S.arc, 24, C.mute, `text-anchor="middle" font-style="italic" font-weight="500"`);
    }
  }
  // north arrow, just outside the circle, top left
  const nx = cx - RC * 0.8 - 34 * u;
  const ny = cy - RC * 0.8 - 20 * u;
  out += `<g transform="translate(${f2(nx)} ${f2(ny)}) scale(${u})"><path d="M0,-26 L11,8 L0,0 L-11,8 Z" fill="${C.ink2}"/></g>`;
  out += text(nx, ny + 44 * u, "N", 24, C.ink2, `text-anchor="middle" font-weight="600"`);
  const label = `Hold ${cardinal(O)} of ${fix}, inbound ${pad3(I)}°, ${turn === "R" ? "right" : "left"} turns${entry ? `, ${entry.toLowerCase()} entry` : ""}`;
  return `<svg viewBox="0 0 ${f2(w)} ${f2(h)}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" class="hold-diagram hold-slide" role="img" aria-label="${label}">${out}</svg>`;
}

/** The line under a hold diagram: where it is, inbound course, turns, north up (the slide's hint / foot line). */
export function holdFootText(inbound: number, turn: Turn, fixIdent: string, lang: "en" | "fr" = "en"): string {
  const O = inbound + 180;
  const CARD_FR: Record<string, string> = { north: "au nord", northeast: "au nord-est", east: "à l’est", southeast: "au sud-est", south: "au sud", southwest: "au sud-ouest", west: "à l’ouest", northwest: "au nord-ouest" };
  return lang === "fr"
    ? `Attente ${CARD_FR[cardinal(O)] ?? cardinal(O)} de ${fixIdent} · rapprochement ${pad3(inbound)}° · virages à ${turn === "R" ? "droite" : "gauche"} · nord en haut`
    : `Hold ${cardinal(O)} of ${fixIdent} · inbound ${pad3(inbound)}° · ${turn === "R" ? "right" : "left"} turns · north up`;
}
