// Ground school — designed slides: the airspace cross-section sketch (package N), drawn from an AirspaceSketch
// (classes, floors, ceilings, VMC minima tags). Flat fills at low opacity per class, chart-like outlines.
import type { AirspaceSketch, Lang } from "../types";
import type { DiagramPalette } from "../assets/diagrams";
import { loc } from "./text";

const CLASS_COLOR: Record<string, keyof DiagramPalette> = {
  A: "fg",
  B: "accent",
  C: "magenta",
  D: "accent",
  E: "magenta",
  F: "amber",
  G: "green",
  TMA: "accent",
  CTR: "accent",
  RMZ: "amber",
  TMZ: "amber",
};
const esc = (s: string) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export const AIRSPACE_W = 1200;
export const AIRSPACE_H = 640;

/** Heights in ft: a nice label ("FL 65", "2,500 ft", "SFC"). Above 5,000 ft shown as FL when `fl`. */
export function heightLabel(ft: number, lang: Lang, fl = false): string {
  if (ft <= 0) return lang === "fr" ? "SOL" : "SFC";
  if (fl && ft >= 5000) return `FL ${Math.round(ft / 100)}`;
  return `${Math.round(ft)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, lang === "fr" ? " " : ",")} ft`;
}

export function airspaceSvg(
  sk: AirspaceSketch,
  p: DiagramPalette,
  lang: Lang,
): string {
  const W = AIRSPACE_W;
  const H = AIRSPACE_H;
  const L = 120; // left axis
  const R = W - 40;
  const T = 40;
  const B = H - 70;
  const top = Math.max(1000, sk.topFt);
  const half = Math.max(1, sk.widthNm / 2);
  const X = (nm: number) => L + ((nm + half) / (2 * half)) * (R - L);
  const Y = (ft: number) =>
    B - (Math.min(top, Math.max(0, ft)) / top) * (B - T);
  const out: string[] = [];
  const font = `font-family="Inter, system-ui, sans-serif"`;
  // altitude axis
  const step = top > 12000 ? 5000 : top > 6000 ? 2000 : 1000;
  for (let ft = 0; ft <= top; ft += step) {
    out.push(
      `<line x1="${L}" x2="${R}" y1="${Y(ft)}" y2="${Y(ft)}" stroke="${p.line}" stroke-width="1" stroke-dasharray="${ft ? "4 8" : ""}"/>`,
    );
    out.push(
      `<text x="${L - 14}" y="${Y(ft) + 7}" ${font} font-size="19" fill="${p.muted}" text-anchor="end">${esc(heightLabel(ft, lang))}</text>`,
    );
  }
  // layers (largest first so small ones sit on top)
  const layers = [...sk.layers].sort(
    (a, b) =>
      (b.span[1] - b.span[0]) * (b.ceilFt - b.floorFt) -
      (a.span[1] - a.span[0]) * (a.ceilFt - a.floorFt),
  );
  for (const l of layers) {
    const c = p[CLASS_COLOR[l.cls] ?? "accent"];
    const x0 = X(Math.max(-half, l.span[0]));
    const x1 = X(Math.min(half, l.span[1]));
    const y0 = Y(l.ceilFt);
    const y1 = Y(l.floorFt);
    const dash =
      l.cls === "E" || l.cls === "G" || l.cls === "RMZ" || l.cls === "TMZ"
        ? ` stroke-dasharray="10 6"`
        : "";
    out.push(
      `<rect x="${x0}" y="${y0}" width="${Math.max(2, x1 - x0)}" height="${Math.max(2, y1 - y0)}" fill="${c}" fill-opacity="0.1" stroke="${c}" stroke-width="2.5"${dash}/>`,
    );
    const label = l.label
      ? loc(l.label, lang)
      : `${lang === "fr" ? "Classe" : "Class"} ${l.cls}`;
    const big = l.cls.length > 1 ? l.cls : l.cls;
    out.push(
      `<text x="${x0 + 14}" y="${y0 + 34}" ${font} font-size="26" font-weight="700" fill="${c}">${esc(big)}</text>`,
    );
    if (x1 - x0 > 220 && l.label)
      out.push(
        `<text x="${x0 + 14}" y="${y0 + 62}" ${font} font-size="18" fill="${p.fg}">${esc(label)}</text>`,
      );
    if (y1 - y0 > 70)
      out.push(
        `<text x="${x1 - 12}" y="${y1 - 12}" ${font} font-size="17" fill="${p.muted}" text-anchor="end">${esc(heightLabel(l.floorFt, lang))} – ${esc(heightLabel(l.ceilFt, lang, true))}</text>`,
      );
  }
  // ground and the airport
  out.push(
    `<line x1="${L}" x2="${R}" y1="${B}" y2="${B}" stroke="${p.fg}" stroke-width="3"/>`,
  );
  out.push(
    `<rect x="${X(0) - 40}" y="${B - 5}" width="80" height="5" fill="${p.fg}"/>`,
  );
  // distance axis
  for (let nm = -Math.floor(half / 5) * 5; nm <= half; nm += 5)
    out.push(
      `<text x="${X(nm)}" y="${B + 32}" ${font} font-size="18" fill="${p.muted}" text-anchor="middle">${Math.abs(nm)} NM</text>`,
    );
  if (sk.aircraft) {
    const x = X(sk.aircraft.distNm);
    const y = Y(sk.aircraft.altFt);
    out.push(
      `<path transform="translate(${x} ${y}) scale(1.6) translate(-12 -8)" fill="${p.accent}" d="M2.5 9.5h15.2c1.8 0 3.3-.6 3.8-1.5-.5-.9-2-1.5-3.8-1.5H8.6L5.2 2.5H3.4l1.3 4H2.5z"/>`,
    );
  }
  // minima tags (right column)
  (sk.minima ?? []).forEach((m, i) => {
    const y = T + 18 + i * 64;
    out.push(
      `<rect x="${R - 330}" y="${y}" width="330" height="54" rx="6" fill="${p.surface}" stroke="${p.line}"/>`,
    );
    out.push(
      `<text x="${R - 314}" y="${y + 34}" ${font} font-size="20" font-weight="700" fill="${p.fg}">${esc(m.cls)}</text>`,
    );
    out.push(
      `<text x="${R - 270}" y="${y + 34}" ${font} font-size="18" fill="${p.fg}">${esc(loc(m.text, lang))}</text>`,
    );
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${out.join("")}</svg>`;
}
