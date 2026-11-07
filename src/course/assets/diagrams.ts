// Ground school — the shipped teaching diagrams (package N / P), drawn as SVG from code so they recolour to the
// slide theme and stay sharp on a projector. Each diagram is factual and cites its source in `ref`:
//   ils           localizer and glideslope geometry (FAA AIM 1-1-9)
//   three-degree  the 3° path: 318 ft/NM, VS ≈ GS × 5 (FAA IFH ch. 10, AIM 5-4-5)
//   sixty-to-one  1° off at 60 NM ≈ 1 NM (FAA IFH ch. 9 / the 60:1 rule)
//   standard-rate 3°/s, 360° in 2 min, bank ≈ TAS/10 + 7 (FAA IFH ch. 4)
//   radial-scan   the hub-and-spoke scan around the attitude indicator (FAA IFH ch. 6)
//   vor-to-from   TO / FROM sides of the OBS (FAA IFH ch. 9, AIM 1-1-3)
//   hold-entries  AIM FIG 5-3-8 (drawn by train/diagram.ts holdDiagramSvg, the cockpit's own figure)
import { holdDiagramSvg } from "../../train/diagram";

export interface DiagramPalette {
  fg: string;
  muted: string;
  line: string;
  accent: string;
  green: string;
  magenta: string;
  amber: string;
  cyan: string;
  surface: string;
}
export const LIGHT_PALETTE: DiagramPalette = {
  fg: "#111827",
  muted: "#5a6575",
  line: "#c9d1db",
  accent: "#1665d8",
  green: "#13804a",
  magenta: "#b3249e",
  amber: "#b45309",
  cyan: "#0e7490",
  surface: "#f3f5f8",
};

export interface DiagramDef {
  id: string;
  en: string;
  fr: string;
  tags: string[];
  w: number;
  h: number;
  ref: string;
  svg(p: DiagramPalette, lang: "en" | "fr"): string;
}

const FONT = `font-family="Inter, system-ui, sans-serif"`;
const r1 = (n: number) => Math.round(n * 10) / 10;
const DEG = Math.PI / 180;
function txt(
  x: number,
  y: number,
  s: string,
  fill: string,
  size = 22,
  o: { anchor?: string; weight?: number; italic?: boolean } = {},
) {
  const esc = s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<text x="${r1(x)}" y="${r1(y)}" ${FONT} font-size="${size}" font-weight="${o.weight ?? 500}" fill="${fill}" text-anchor="${o.anchor ?? "start"}"${o.italic ? ' font-style="italic"' : ""}>${esc}</text>`;
}
const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  w = 2,
  dash = "",
) =>
  `<line x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
function arrowHead(
  x: number,
  y: number,
  angDeg: number,
  fill: string,
  size = 14,
) {
  return `<path d="M0,0 L${-size},${-size * 0.5} L${-size},${size * 0.5} Z" fill="${fill}" transform="translate(${r1(x)} ${r1(y)}) rotate(${r1(angDeg)})"/>`;
}
const doc = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
const T = (lang: "en" | "fr", en: string, fr: string) =>
  lang === "fr" ? fr : en;

function planeTop(x: number, y: number, hdgDeg: number, fill: string, k = 1.6) {
  return `<path transform="translate(${r1(x)} ${r1(y)}) rotate(${r1(hdgDeg)}) scale(${k}) translate(-12 -12)" fill="${fill}" d="M12 1.8c.9 0 1.5 1 1.5 2.4V9l8.2 3.6v2l-8.2-2v5.1l2.6 2v1.6L12 20.4l-4.1.9v-1.6l2.6-2v-5.1l-8.2 2v-2L10.5 9V4.2c0-1.4.6-2.4 1.5-2.4z"/>`;
}

export const DIAGRAMS: DiagramDef[] = [
  {
    id: "ils",
    en: "ILS: localizer and glideslope",
    fr: "ILS : localizer et glide",
    tags: ["ils", "localizer", "glideslope", "approach", "loc", "gs"],
    w: 1200,
    h: 640,
    ref: "FAA AIM 1-1-9",
    svg(p, lang) {
      const b: string[] = [];
      // plan view
      const cy = 160;
      const ax = 1120; // localizer antenna beyond the far end
      b.push(
        txt(
          40,
          44,
          T(lang, "PLAN VIEW · LOCALIZER", "VUE EN PLAN · LOCALIZER"),
          p.muted,
          20,
          { weight: 600 },
        ),
      );
      const half = 9; // drawn half-angle (exaggerated)
      const L = 1060;
      const dy = Math.tan(half * DEG) * L;
      b.push(
        `<path d="M${ax},${cy} L${ax - L},${cy - dy} L${ax - L},${cy + dy} Z" fill="${p.green}" fill-opacity="0.08"/>`,
      );
      b.push(
        line(ax, cy, ax - L, cy - dy, p.green, 2, "10 8"),
        line(ax, cy, ax - L, cy + dy, p.green, 2, "10 8"),
      );
      b.push(line(ax, cy, 60, cy, p.green, 3));
      // runway
      b.push(
        `<rect x="860" y="${cy - 14}" width="220" height="28" rx="3" fill="${p.surface}" stroke="${p.fg}" stroke-width="2"/>`,
      );
      for (let x = 880; x < 1060; x += 34)
        b.push(line(x, cy, x + 18, cy, p.fg, 2));
      b.push(
        `<rect x="${ax - 4}" y="${cy - 18}" width="8" height="36" fill="${p.fg}"/>`,
      );
      b.push(
        txt(ax, cy + 46, T(lang, "LOC antenna", "Antenne LOC"), p.muted, 18, {
          anchor: "middle",
        }),
      );
      b.push(planeTop(330, cy - 34, 90, p.accent, 1.5));
      b.push(
        txt(
          80,
          cy - dy + 40,
          T(lang, "full-scale fly-right", "pleine déviation : à droite"),
          p.green,
          20,
        ),
      );
      b.push(
        txt(
          80,
          cy + dy - 22,
          T(lang, "full-scale fly-left", "pleine déviation : à gauche"),
          p.green,
          20,
        ),
      );
      b.push(
        txt(
          600,
          cy + 74,
          T(
            lang,
            "Course width 3° to 6°, set to 700 ft at the threshold (≈ ±2.5° full scale)",
            "Largeur 3° à 6°, réglée à 700 ft au seuil (≈ ±2,5° pleine déviation)",
          ),
          p.fg,
          22,
          {
            anchor: "middle",
          },
        ),
      );
      // profile
      const gy = 560;
      const gx = 900; // glideslope antenna abeam the touchdown zone
      b.push(
        txt(
          40,
          360,
          T(lang, "PROFILE · GLIDESLOPE", "PROFIL · GLIDE"),
          p.muted,
          20,
          { weight: 600 },
        ),
      );
      b.push(line(40, gy, 1160, gy, p.fg, 2));
      b.push(
        `<rect x="840" y="${gy - 6}" width="260" height="6" fill="${p.fg}"/>`,
      );
      const ang = 10; // drawn (exaggerated)
      const spread = 2.6;
      const len = 860;
      const P = (a: number) => [
        gx - Math.cos(a * DEG) * len,
        gy - Math.sin(a * DEG) * len,
      ];
      const [x0, y0] = P(ang);
      const [xu, yu] = P(ang + spread);
      const [xl, yl] = P(ang - spread);
      b.push(
        `<path d="M${gx},${gy} L${r1(xu)},${r1(yu)} L${r1(xl)},${r1(yl)} Z" fill="${p.magenta}" fill-opacity="0.08"/>`,
      );
      b.push(
        line(gx, gy, xu, yu, p.magenta, 2, "10 8"),
        line(gx, gy, xl, yl, p.magenta, 2, "10 8"),
      );
      b.push(line(gx, gy, x0, y0, p.magenta, 3));
      b.push(
        `<path d="M${gx - 150},${gy} A150,150 0 0 0 ${r1(gx - Math.cos(ang * DEG) * 150)},${r1(gy - Math.sin(ang * DEG) * 150)}" fill="none" stroke="${p.muted}" stroke-width="1.5"/>`,
      );
      b.push(
        txt(gx - 170, gy - 14, "3°", p.fg, 24, { anchor: "end", weight: 700 }),
      );
      b.push(
        txt(
          150,
          yu - 10,
          T(lang, "full-scale fly-down", "pleine déviation : descendre"),
          p.magenta,
          20,
        ),
      );
      b.push(
        txt(
          150,
          yl + 46,
          T(lang, "full-scale fly-up", "pleine déviation : monter"),
          p.magenta,
          20,
        ),
      );
      b.push(
        txt(
          600,
          620,
          T(
            lang,
            "Glidepath about 3°, full scale ±0.7° (1.4° wide) · not to scale",
            "Plan d’environ 3°, pleine déviation ±0,7° (1,4° de large) · échelle non respectée",
          ),
          p.fg,
          22,
          { anchor: "middle" },
        ),
      );
      return doc(1200, 640, b.join(""));
    },
  },
  {
    id: "three-degree",
    en: "The 3° descent path",
    fr: "Le plan de descente à 3°",
    tags: ["descent", "3°", "glidepath", "vs", "descente", "profile"],
    w: 1200,
    h: 560,
    ref: "FAA IFH ch. 10; AIM 5-4-5",
    svg(p, lang) {
      const b: string[] = [];
      const gy = 470;
      b.push(line(60, gy, 1140, gy, p.fg, 2));
      b.push(
        `<rect x="980" y="${gy - 6}" width="160" height="6" fill="${p.fg}"/>`,
      );
      // path drawn at an exaggerated angle with 1 NM ticks
      const x1 = 990;
      const x0 = 110;
      const y0 = 110;
      b.push(line(x1, gy, x0, y0, p.magenta, 4));
      const n = 5;
      for (let i = 1; i <= n; i++) {
        const x = x1 - ((x1 - x0) * i) / n;
        const y = gy - ((gy - y0) * i) / n;
        b.push(line(x, gy, x, y, p.line, 1.5, "4 6"));
        b.push(
          `<circle cx="${r1(x)}" cy="${r1(y)}" r="6" fill="${p.magenta}"/>`,
        );
        b.push(txt(x, gy + 34, `${i} NM`, p.muted, 20, { anchor: "middle" }));
        b.push(
          txt(x + 14, y - 12, `${Math.round(318.4 * i)} ft`, p.fg, 22, {
            weight: 600,
          }),
        );
      }
      b.push(
        planeTop(
          x0 + 4,
          y0 - 4,
          90 + Math.atan2(gy - y0, x1 - x0) / DEG,
          p.accent,
          1.6,
        ),
      );
      b.push(
        txt(
          60,
          48,
          T(
            lang,
            "1 NM = 6,076 ft · tan 3° × 6,076 = 318 ft per NM",
            "1 NM = 6 076 ft · tan 3° × 6 076 = 318 ft par NM",
          ),
          p.fg,
          26,
          { weight: 600 },
        ),
      );
      b.push(
        txt(
          60,
          84,
          T(
            lang,
            "Rule of thumb: ≈ 300 ft/NM · descent rate ≈ ground speed × 5 (90 kt → 450 ft/min)",
            "Règle pratique : ≈ 300 ft/NM · Vz ≈ vitesse sol × 5 (90 kt → 450 ft/min)",
          ),
          p.muted,
          22,
        ),
      );
      return doc(1200, 560, b.join(""));
    },
  },
  {
    id: "sixty-to-one",
    en: "The 60:1 rule",
    fr: "La règle du 1 sur 60",
    tags: ["60:1", "sixty", "track error", "navigation", "1 sur 60"],
    w: 1200,
    h: 520,
    ref: "FAA IFH ch. 9",
    svg(p, lang) {
      const b: string[] = [];
      const ox = 100;
      const oy = 360;
      const ex = 1100;
      b.push(line(ox, oy, ex, oy, p.green, 3));
      const errDeg = 6; // drawn
      const ey = oy - Math.tan(errDeg * DEG) * (ex - ox);
      b.push(line(ox, oy, ex, ey, p.magenta, 3, "12 8"));
      b.push(line(ex, oy, ex, ey, p.amber, 3));
      b.push(`<circle cx="${ox}" cy="${oy}" r="8" fill="${p.fg}"/>`);
      b.push(planeTop(ex, ey, 90 - errDeg, p.accent, 1.6));
      b.push(
        `<path d="M${ox + 220},${oy} A220,220 0 0 0 ${r1(ox + Math.cos(errDeg * DEG) * 220)},${r1(oy - Math.sin(errDeg * DEG) * 220)}" fill="none" stroke="${p.fg}" stroke-width="2"/>`,
      );
      b.push(txt(ox + 236, oy - 6, "1°", p.fg, 26, { weight: 700 }));
      b.push(
        txt(ex + 18, (oy + ey) / 2 + 8, "1 NM", p.amber, 26, { weight: 700 }),
      );
      b.push(
        txt(
          (ox + ex) / 2,
          oy + 44,
          T(lang, "60 NM flown", "60 NM parcourus"),
          p.fg,
          24,
          { anchor: "middle", weight: 600 },
        ),
      );
      b.push(
        txt(ox, oy + 44, T(lang, "departure", "départ"), p.muted, 20, {
          anchor: "middle",
        }),
      );
      b.push(
        txt(
          60,
          60,
          T(
            lang,
            "Track error (°) = distance off (NM) × 60 ÷ distance flown (NM)",
            "Erreur de route (°) = écart (NM) × 60 ÷ distance parcourue (NM)",
          ),
          p.fg,
          26,
          { weight: 600 },
        ),
      );
      b.push(
        txt(
          60,
          98,
          T(
            lang,
            "1 in 60: an angle of 1° opens 1 NM every 60 NM (exact: tan 1° × 60 = 1.05 NM)",
            "1 sur 60 : 1° d’écart ouvre 1 NM tous les 60 NM (exact : tan 1° × 60 = 1,05 NM)",
          ),
          p.muted,
          22,
        ),
      );
      b.push(
        txt(60, 470, T(lang, "intended course", "route prévue"), p.green, 20),
        txt(
          560,
          ey + (oy - ey) / 2 - 22,
          T(lang, "actual track", "route suivie"),
          p.magenta,
          20,
        ),
      );
      return doc(1200, 520, b.join(""));
    },
  },
  {
    id: "standard-rate",
    en: "Standard-rate turn",
    fr: "Virage au taux standard",
    tags: ["turn", "standard rate", "bank", "taux 1", "virage"],
    w: 1000,
    h: 640,
    ref: "FAA IFH ch. 4",
    svg(p, lang) {
      const b: string[] = [];
      const cx = 330;
      const cy = 330;
      const R = 230;
      b.push(
        `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${p.magenta}" stroke-width="3"/>`,
      );
      const marks = [
        [0, "0"],
        [90, "30 s"],
        [180, "1 min"],
        [270, "1:30"],
      ] as const;
      for (const [a, s] of marks) {
        const x = cx + Math.sin(a * DEG) * R;
        const y = cy - Math.cos(a * DEG) * R;
        b.push(
          `<circle cx="${r1(x)}" cy="${r1(y)}" r="7" fill="${p.magenta}"/>`,
        );
        const lx = cx + Math.sin(a * DEG) * (R + 46);
        const ly = cy - Math.cos(a * DEG) * (R + 46) + 8;
        b.push(txt(lx, ly, s, p.fg, 24, { anchor: "middle", weight: 600 }));
      }
      b.push(
        planeTop(
          cx + Math.sin(45 * DEG) * R,
          cy - Math.cos(45 * DEG) * R,
          135,
          p.accent,
          1.7,
        ),
      );
      b.push(
        arrowHead(
          cx + Math.sin(60 * DEG) * R,
          cy - Math.cos(60 * DEG) * R,
          150,
          p.magenta,
          18,
        ),
      );
      b.push(
        txt(cx, cy - 6, "3°/s", p.fg, 44, { anchor: "middle", weight: 700 }),
        txt(
          cx,
          cy + 34,
          T(lang, "360° in 2 min", "360° en 2 min"),
          p.muted,
          24,
          { anchor: "middle" },
        ),
      );
      const tx = 640;
      b.push(
        txt(
          tx,
          160,
          T(lang, "BANK FOR STANDARD RATE", "INCLINAISON AU TAUX 1"),
          p.muted,
          20,
          { weight: 600 },
        ),
      );
      b.push(txt(tx, 210, "≈ TAS ÷ 10 + 7", p.fg, 38, { weight: 700 }));
      const rows = [
        [90, 16],
        [120, 19],
        [150, 22],
      ];
      rows.forEach(([tas, bank], i) => {
        const y = 290 + i * 62;
        b.push(
          `<rect x="${tx}" y="${y - 38}" width="300" height="52" rx="6" fill="${p.surface}"/>`,
        );
        b.push(
          txt(tx + 20, y - 4, `${tas} kt`, p.fg, 26, { weight: 600 }),
          txt(tx + 280, y - 4, `≈ ${bank}°`, p.accent, 26, {
            anchor: "end",
            weight: 700,
          }),
        );
      });
      b.push(
        txt(
          tx,
          520,
          T(
            lang,
            "Exact: tan(bank) = ω·V / g",
            "Exact : tan(inclinaison) = ω·V / g",
          ),
          p.muted,
          22,
        ),
      );
      return doc(1000, 640, b.join(""));
    },
  },
  {
    id: "radial-scan",
    en: "Radial scan (six-pack)",
    fr: "Circuit visuel en étoile",
    tags: ["scan", "six-pack", "attitude", "instrument", "circuit visuel"],
    w: 1000,
    h: 640,
    ref: "FAA IFH ch. 6",
    svg(p, lang) {
      const b: string[] = [];
      const xs = [220, 500, 780];
      const ys = [210, 450];
      const names = [
        [
          T(lang, "Airspeed", "Badin"),
          T(lang, "Attitude", "Horizon"),
          T(lang, "Altimeter", "Altimètre"),
        ],
        [
          T(lang, "Turn coord.", "Bille-aiguille"),
          "HSI / DG",
          T(lang, "Vertical speed", "Variomètre"),
        ],
      ];
      const R = 92;
      // spokes from the AI
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < 3; c++) {
          if (r === 0 && c === 1) continue;
          const x = xs[c];
          const y = ys[r];
          const dx = x - xs[1];
          const dy = y - ys[0];
          const L = Math.hypot(dx, dy);
          const ux = dx / L;
          const uy = dy / L;
          const sx = xs[1] + ux * (R + 10);
          const sy = ys[0] + uy * (R + 10);
          const ex = x - ux * (R + 12);
          const ey = y - uy * (R + 12);
          b.push(line(sx, sy, ex, ey, p.accent, 4));
          b.push(
            arrowHead(
              ex,
              ey,
              (Math.atan2(uy, ux) * 180) / Math.PI,
              p.accent,
              18,
            ),
          );
          b.push(
            arrowHead(
              sx,
              sy,
              (Math.atan2(-uy, -ux) * 180) / Math.PI,
              p.accent,
              18,
            ),
          );
        }
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < 3; c++) {
          const hub = r === 0 && c === 1;
          b.push(
            `<circle cx="${xs[c]}" cy="${ys[r]}" r="${R}" fill="${p.surface}" stroke="${hub ? p.accent : p.line}" stroke-width="${hub ? 6 : 3}"/>`,
          );
          b.push(
            txt(xs[c], ys[r] + 9, names[r][c], hub ? p.accent : p.fg, 24, {
              anchor: "middle",
              weight: hub ? 700 : 600,
            }),
          );
        }
      b.push(
        txt(
          500,
          600,
          T(
            lang,
            "Attitude is the hub: glance out to one instrument, come back to the AI, then the next",
            "L’horizon est le centre : un coup d’œil vers un instrument, retour à l’horizon, puis le suivant",
          ),
          p.muted,
          22,
          { anchor: "middle" },
        ),
      );
      return doc(1000, 640, b.join(""));
    },
  },
  {
    id: "vor-to-from",
    en: "VOR: TO and FROM",
    fr: "VOR : TO et FROM",
    tags: ["vor", "obs", "to", "from", "radial"],
    w: 1000,
    h: 640,
    ref: "FAA IFH ch. 9",
    svg(p, lang) {
      const b: string[] = [];
      const cx = 500;
      const cy = 330;
      const R = 260;
      // OBS 090: TO on the west half, FROM on the east half; the 000/180 line is the ambiguity line
      b.push(
        `<path d="M${cx},${cy - R} A${R},${R} 0 0 0 ${cx},${cy + R} Z" fill="${p.accent}" fill-opacity="0.08"/>`,
      );
      b.push(
        `<path d="M${cx},${cy - R} A${R},${R} 0 0 1 ${cx},${cy + R} Z" fill="${p.green}" fill-opacity="0.08"/>`,
      );
      b.push(
        `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${p.line}" stroke-width="2"/>`,
      );
      b.push(line(cx, cy - R - 20, cx, cy + R + 20, p.muted, 2, "8 8"));
      b.push(line(cx - R - 20, cy, cx + R + 20, cy, p.green, 3));
      b.push(arrowHead(cx + R + 24, cy, 0, p.green, 18));
      b.push(
        `<path d="M${cx - 22},${cy} L${cx - 11},${cy - 19} L${cx + 11},${cy - 19} L${cx + 22},${cy} L${cx + 11},${cy + 19} L${cx - 11},${cy + 19} Z" fill="none" stroke="${p.fg}" stroke-width="3"/>`,
      );
      b.push(`<circle cx="${cx}" cy="${cy}" r="4" fill="${p.fg}"/>`);
      b.push(
        txt(cx - R / 2, cy - 90, "TO", p.accent, 44, {
          anchor: "middle",
          weight: 700,
        }),
      );
      b.push(
        txt(cx + R / 2, cy - 90, "FROM", p.green, 44, {
          anchor: "middle",
          weight: 700,
        }),
      );
      b.push(
        planeTop(cx - 170, cy + 120, 90, p.accent, 1.5),
        planeTop(cx + 170, cy + 120, 90, p.green, 1.5),
      );
      b.push(
        txt(cx + R + 30, cy - 18, "OBS 090", p.green, 22, { weight: 600 }),
      );
      b.push(
        txt(
          cx,
          cy - R - 32,
          T(
            lang,
            "000 / 180: flag changes (ambiguity)",
            "000 / 180 : changement de flag (ambiguïté)",
          ),
          p.muted,
          20,
          { anchor: "middle" },
        ),
      );
      b.push(
        txt(
          cx,
          630,
          T(
            lang,
            "The flag depends on where you are, not where you point",
            "Le flag dépend de votre position, pas de votre cap",
          ),
          p.fg,
          24,
          { anchor: "middle", weight: 600 },
        ),
      );
      return doc(1000, 640, b.join(""));
    },
  },
  {
    id: "hold-entries",
    en: "Hold entries (AIM FIG 5-3-8)",
    fr: "Entrées en attente (AIM FIG 5-3-8)",
    tags: ["hold", "entry", "direct", "parallel", "teardrop", "attente"],
    w: 400,
    h: 360,
    ref: "FAA AIM 5-3-8, FIG 5-3-8",
    svg(_p, lang) {
      return holdDiagramSvg(360, "R", "FIX", undefined, lang);
    },
  },
];

export function diagramSvg(
  def: DiagramDef,
  p: DiagramPalette = LIGHT_PALETTE,
  lang: "en" | "fr" = "en",
): string {
  return def.svg(p, lang);
}
