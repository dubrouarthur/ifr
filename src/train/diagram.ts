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
export function holdDiagramSvg(
  inbound: number,
  turn: Turn,
  fixIdent: string,
  courseToFix?: number,
): string {
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
  // sector boundaries (aircraft POSITION bearings from the fix): 70° line = I+70s / I−110s; inbound extension = I
  const b70a = I + 70 * s,
    b70b = I - 110 * s;
  // sectors by position bearing (relative to I, measured with the turn direction): teardrop [0,70), direct [70,250), parallel [250,360)
  const SECT = {
    TEARDROP: {
      from: 0,
      to: 70,
      name: "SECTOR 2",
      entry: "OFFSET",
      sub: "(teardrop)",
      label: 35,
      arc: "70°",
    },
    DIRECT: {
      from: 70,
      to: 250,
      name: "SECTOR 3",
      entry: "DIRECT",
      sub: "",
      label: 214,
      arc: "180°",
    },
    PARALLEL: {
      from: 250,
      to: 360,
      name: "SECTOR 1",
      entry: "PARALLEL",
      sub: "",
      label: 305,
      arc: "110°",
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
    const CAND: Record<string, number[]> = { TEARDROP: [35, 18, 52], PARALLEL: [305, 280, 330], DIRECT: [214, 236, 198] };
    let ang: number = S.label;
    if (courseToFix !== undefined && entry === k) {
      const rel = ((((courseToFix + 180 - I) * s) % 360) + 360) % 360;
      const dist = (a: number) => Math.abs(((a - rel + 540) % 360) - 180);
      ang = CAND[k].reduce((best, a) => (dist(a) > dist(best) ? a : best), S.label);
    }
    const p = at(absB(ang), r);
    const on = entry === k;
    const col = on ? "#b54708" : "#1d2833";
    return `<text x="${r1(p[0])}" y="${r1(p[1]) - 14}" text-anchor="middle" font-family="Inter, sans-serif" fill="${col}" font-weight="800"><tspan x="${r1(p[0])}" font-size="11">${S.name}</tspan><tspan x="${r1(p[0])}" dy="13" font-size="11">${S.entry}</tspan><tspan x="${r1(p[0])}" dy="13" font-size="11">ENTRY</tspan>${S.sub ? `<tspan x="${r1(p[0])}" dy="12" font-size="10" font-weight="600">${S.sub}</tspan>` : ""}</text>`;
  };
  const arcLabel = (k: keyof typeof SECT) => {
    const S = SECT[k];
    const p = at(absB((S.from + S.to) / 2), RC + 13);
    return `<text x="${r1(p[0])}" y="${r1(p[1]) + 4}" text-anchor="middle" font-size="11" font-style="italic" fill="#475467" font-family="Inter, sans-serif">${S.arc}</text>`;
  };
  const fixLab = at(I - 90 * s + 20 * s, 18);
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
  <text x="${W / 2}" y="${H - 10}" fill="#475467" font-size="11" text-anchor="middle" font-family="Inter, sans-serif">Hold ${cardinal(O)} of ${fixIdent} · inbound ${pad3(I)}° · ${turn === "R" ? "right" : "left"} turns · north up</text>
  ${entry ? `<rect x="${W - 168}" y="12" width="156" height="24" rx="6" fill="#fff4e0" stroke="#f5c27a"/><text x="${W - 90}" y="29" text-anchor="middle" fill="#b54708" font-size="12" font-weight="800" font-family="Inter, sans-serif">YOUR ENTRY: ${entry}</text>` : ""}
</svg>`;
}
