// Teaching diagram: holding pattern with AIM entry sectors and the aircraft's arrival.
import { holdEntry, type Turn } from '../nav/holding';

/** SVG of a hold (inbound course pointing up the page, fix at the top) with the three entry sectors. */
export function holdDiagramSvg(inbound: number, turn: Turn, fixIdent: string, courseToFix?: number): string {
  const W = 360, H = 300, fx = 180, fy = 125;
  const s = turn === 'R' ? 1 : -1;
  // drawn in the hold frame: inbound course = up (screen -y)
  const R = 34, L = 90;
  const track = `M${fx},${fy + L} L${fx},${fy} A${R},${R} 0 0 ${s > 0 ? 1 : 0} ${fx + 2 * R * s},${fy} L${fx + 2 * R * s},${fy + L} A${R},${R} 0 0 ${s > 0 ? 1 : 0} ${fx},${fy + L}`;
  // sector boundaries through the fix: 70° line (from the holding side) and the inbound course extension
  const ray = (angFromUp: number, len: number) => {
    const a = (angFromUp * Math.PI) / 180;
    return `${fx + Math.sin(a) * len},${fy - Math.cos(a) * len}`;
  };
  // in screen frame, "up" = inbound course direction; the 70° line runs at +110° / -70° relative to the inbound course
  // boundaries (arrival position angles from the fix): inbound course extension (0°) and the 70° line (70° / 250°)
  const line70a = ray(70 * s, 170);
  const line70b = ray(-110 * s, 170);
  const ext = ray(0, 150);
  let arrival = '';
  let label = '';
  if (courseToFix !== undefined) {
    const rel = ((courseToFix - inbound + 540) % 360) - 180; // aircraft course relative to inbound (up)
    const a = (rel * Math.PI) / 180;
    const sx = fx - Math.sin(a) * 105;
    const sy = fy + Math.cos(a) * 105;
    const e = holdEntry(inbound, turn, courseToFix);
    label = e;
    arrival = `<line x1="${sx}" y1="${sy}" x2="${fx - Math.sin(a) * 14}" y2="${fy + Math.cos(a) * 14}" stroke="#ffe600" stroke-width="3" marker-end="url(#ah)"/>
      <g transform="translate(${sx} ${sy}) rotate(${rel})"><path d="M0,-10 L4,-2 L12,2 L12,5 L3,3 L2,9 L5,11 L-5,11 L-2,9 L-3,3 L-12,5 L-12,2 L-4,-2 Z" fill="#ffe600"/></g>`;
  }
  const lbl = (txt: string, ang: number, r: number, color: string) => {
    const a = (ang * Math.PI) / 180;
    return `<text x="${fx + Math.sin(a) * r}" y="${fy - Math.cos(a) * r}" fill="${color}" font-size="13" font-weight="700" text-anchor="middle" font-family="Inter, sans-serif">${txt}</text>`;
  };
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="hold-diagram">
  <defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#ffe600"/></marker></defs>
  <rect width="${W}" height="${H}" fill="#0b0f14" rx="10"/>
  <path d="M${fx},${fy} L${line70a} M${fx},${fy} L${line70b} M${fx},${fy} L${ext}" stroke="#3b4652" stroke-width="1.5" stroke-dasharray="5 4"/>
  ${lbl('DIRECT', 120 * s, 135, '#2bd576')}${lbl('DIRECT', -150 * s, 120, '#2bd576')}
  ${lbl('PARALLEL', -55 * s, 115, '#00e4ff')}
  ${lbl('TEARDROP', 35 * s, 120, '#ff7af5')}
  <path d="${track}" fill="none" stroke="#fff" stroke-width="2.5"/>
  <path d="M${fx},${fy + L} L${fx},${fy + 6}" stroke="#fff" stroke-width="2.5" marker-end="url(#ah)"/>
  <circle cx="${fx}" cy="${fy}" r="5" fill="#00e4ff"/><text x="${fx + 10 * -s}" y="${fy - 10}" fill="#00e4ff" font-size="13" font-weight="700" text-anchor="${s > 0 ? 'end' : 'start'}" font-family="Inter, sans-serif">${fixIdent}</text>
  <text x="${W / 2}" y="${H - 10}" fill="#8b97a4" font-size="11" text-anchor="middle" font-family="Inter, sans-serif">inbound ${String(Math.round(inbound) || 360).padStart(3, '0')}° · ${turn === 'R' ? 'right' : 'left'} turns · 70° line dashed</text>
  ${arrival}
  ${label ? `<rect x="8" y="${H - 52}" width="170" height="24" rx="6" fill="#2a2508"/><text x="16" y="${H - 35}" fill="#ffe600" font-size="13" font-weight="800" font-family="Inter, sans-serif">YOUR ENTRY: ${label}</text>` : ''}
</svg>`;
}
