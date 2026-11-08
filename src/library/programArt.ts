// The drawn instrument of each formation card on the library's home (UX logic §5): an airspeed indicator for
// LAPL · PPL, an attitude indicator banking in the dark for the night rating, an HSI for the IR and a mass-and-balance
// envelope for ATPL theory. Static SVG strings, decorative (the card's words say everything).
import type { ProgramId } from "./programs";

const F = 'font-family="Inter, system-ui, sans-serif"';

function asi(): string {
  const a = (kt: number) => ((kt - 20) / 180) * 300 - 150;
  const pt = (deg: number, r: number): [number, number] => [
    100 + r * Math.sin((deg * Math.PI) / 180),
    100 - r * Math.cos((deg * Math.PI) / 180),
  ];
  const arc = (k1: number, k2: number, r: number, col: string, w: number) => {
    const [x1, y1] = pt(a(k1), r);
    const [x2, y2] = pt(a(k2), r);
    const large = a(k2) - a(k1) > 180 ? 1 : 0;
    return `<path d="M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2}" stroke="${col}" stroke-width="${w}" fill="none"/>`;
  };
  let ticks = "";
  for (let k = 40; k <= 200; k += 10) {
    const [x1, y1] = pt(a(k), 78);
    const [x2, y2] = pt(a(k), k % 20 ? 70 : 64);
    ticks += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff" stroke-width="${k % 20 ? 1.6 : 2.6}"/>`;
    if (k % 40 === 0) {
      const [tx, ty] = pt(a(k), 50);
      ticks += `<text x="${tx}" y="${ty + 5}" fill="#fff" font-size="15" font-weight="700" text-anchor="middle" ${F}>${k}</text>`;
    }
  }
  const [nx, ny] = pt(a(105), 66);
  return `<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false"><rect x="2" y="2" width="196" height="196" rx="18" fill="#0f1318"/><circle cx="100" cy="100" r="88" fill="#1b2027"/>${arc(40, 85, 80, "#f2f2f2", 6)}${arc(48, 129, 74, "#2fa84f", 6)}${arc(129, 163, 74, "#e8b923", 6)}${arc(162, 165, 76, "#e03131", 10)}${ticks}<text x="100" y="80" fill="#c5ccd6" font-size="9" font-weight="700" text-anchor="middle" ${F} letter-spacing="1">AIRSPEED</text><text x="100" y="128" fill="#c5ccd6" font-size="9" font-weight="700" text-anchor="middle" ${F} letter-spacing="1">KNOTS</text><line x1="100" y1="100" x2="${nx}" y2="${ny}" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="100" cy="100" r="7" fill="#333"/></svg>`;
}

function ai(bank: number, pitch: number): string {
  const id = `lbpai${bank}`;
  const bars = [-20, -10, 10, 20]
    .map((p) => {
      const w = Math.abs(p) === 10 ? 18 : 28;
      return `<line x1="${100 - w}" y1="${100 - p * 3}" x2="${100 + w}" y2="${100 - p * 3}" stroke="#fff" stroke-width="2"/>`;
    })
    .join("");
  return `<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false"><defs><clipPath id="${id}"><circle cx="100" cy="100" r="80"/></clipPath></defs><rect x="2" y="2" width="196" height="196" rx="100" fill="#0f1318"/><g clip-path="url(#${id})"><g transform="rotate(${-bank} 100 100) translate(0 ${pitch * 3})"><rect x="-50" y="-50" width="300" height="150" fill="#3d86d9"/><rect x="-50" y="100" width="300" height="150" fill="#8a5a2b"/><line x1="-50" y1="100" x2="250" y2="100" stroke="#fff" stroke-width="2.5"/>${bars}</g></g><circle cx="100" cy="100" r="80" fill="none" stroke="#262c35" stroke-width="6"/><path d="M58 102h28l8 9 6-9h0l6 9 8-9h28" stroke="#ff8a1f" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="100" cy="102" r="3.5" fill="#ff8a1f"/><path d="M100 24l-7 12h14z" fill="#ff8a1f"/></svg>`;
}

function hsi(hdg: number, crs: number, dev: number): string {
  let card = "";
  for (let d = 0; d < 360; d += 5) {
    const r2 = d % 30 ? (d % 10 ? 79 : 76) : 72;
    const rad = ((d - hdg) * Math.PI) / 180;
    card += `<line x1="${100 + 84 * Math.sin(rad)}" y1="${100 - 84 * Math.cos(rad)}" x2="${100 + r2 * Math.sin(rad)}" y2="${100 - r2 * Math.cos(rad)}" stroke="#fff" stroke-width="${d % 10 ? 1 : 1.8}"/>`;
    if (d % 30 === 0) {
      const lab =
        ({ 0: "N", 90: "E", 180: "S", 270: "W" } as Record<number, string>)[
          d
        ] ?? String(d / 10);
      const x = 100 + 62 * Math.sin(rad);
      const y = 100 - 62 * Math.cos(rad);
      card += `<text x="${x}" y="${y + 5}" fill="#fff" font-size="14" font-weight="700" text-anchor="middle" ${F} transform="rotate(${d - hdg} ${x} ${y})">${lab}</text>`;
    }
  }
  const dots = [-2, -1, 1, 2]
    .map(
      (k) =>
        `<circle cx="${100 + k * 15}" cy="100" r="3" fill="none" stroke="#fff" stroke-width="1.6"/>`,
    )
    .join("");
  return `<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false"><rect x="2" y="2" width="196" height="196" rx="18" fill="#0f1318"/><circle cx="100" cy="100" r="90" fill="#1b2027"/>${card}<g transform="rotate(${crs - hdg} 100 100)">${dots}<path d="M100 22l-7 13h14z" fill="#f4c20d"/><line x1="100" y1="34" x2="100" y2="66" stroke="#f4c20d" stroke-width="5"/><line x1="100" y1="134" x2="100" y2="176" stroke="#f4c20d" stroke-width="5"/><line x1="${100 + dev}" y1="70" x2="${100 + dev}" y2="130" stroke="#f4c20d" stroke-width="5"/></g><path d="M100 88v26M88 98h24M94 112h12" stroke="#ff8a1f" stroke-width="3.2" stroke-linecap="round"/><path d="M93 6h14l-7 10z" fill="#ff8a1f"/></svg>`;
}

function envelope(): string {
  const h = [30, 60, 90, 120, 150]
    .map((y) => `<line x1="20" x2="210" y1="${y}" y2="${y}"/>`)
    .join("");
  const v = [50, 90, 130, 170]
    .map((x) => `<line y1="20" y2="160" x1="${x}" x2="${x}"/>`)
    .join("");
  return `<svg viewBox="0 0 220 170" aria-hidden="true" focusable="false"><g stroke="#d7d3ca" stroke-width="1">${h}${v}</g><path d="M60 150 L60 90 L110 40 L190 40 L190 150 Z" fill="rgba(29,95,209,.12)" stroke="#1d5fd1" stroke-width="3"/><circle cx="132" cy="84" r="7" fill="#a8238f"/><circle cx="118" cy="120" r="7" fill="#fff" stroke="#a8238f" stroke-width="3"/><line x1="132" y1="84" x2="118" y2="120" stroke="#a8238f" stroke-width="2.5" stroke-dasharray="4 4"/></svg>`;
}

/** The drawing of a formation card (an empty string for a formation without one). */
export function programArt(p: ProgramId): string {
  switch (p) {
    case "ppl":
      return asi();
    case "night":
      return ai(-25, 6);
    case "ir":
      return hsi(120, 90, 10);
    case "atpl":
      return `<span class="lb-pc-paper">${envelope()}</span>`;
    default:
      return "";
  }
}
