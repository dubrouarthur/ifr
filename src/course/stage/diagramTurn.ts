// Ground school stage — the turn calc diagram: a top view of the circle an aeroplane flies at a given bank and true
// airspeed, with its rate and radius (FAA IFH ch. 7; PHAK ch. 5):
//   rate (°/s) = 1,091 × tan(bank) ÷ TAS (kt)        radius (ft) = TAS² ÷ (11.26 × tan(bank))
// so 3°/s (standard rate, 360° in 2 minutes) needs about TAS ÷ 10 + 7 degrees of bank.
// Slide units (SPEC slides v2 §5): viewBox = the block, labels 24 / 28 / 32 × u, the worked numbers outside.
import type { CalcDiagram, Lang } from "../types";
import {
  DEG,
  FS,
  L,
  Labels,
  SW,
  aircraftIcon,
  clamp,
  dec,
  dimLine,
  makeWidget,
  s,
  thousands,
  type DiagramOptions,
  type DiagramWidget,
} from "./svgkit";

export type TurnSpec = Extract<CalcDiagram, { kind: "turn" }>;

/** Rate (°/s), radius (ft and NM) and the time for 360° (s) of a coordinated level turn. Pure. */
export function solveTurn(
  tasKt: number,
  bankDeg: number,
): {
  rateDps: number;
  radiusFt: number;
  radiusNm: number;
  fullS: number;
} {
  const b = clamp(Math.abs(bankDeg), 1, 80) * DEG;
  const v = Math.max(20, tasKt);
  const rateDps = (1091 * Math.tan(b)) / v;
  const radiusFt = (v * v) / (11.26 * Math.tan(b));
  return {
    rateDps,
    radiusFt,
    radiusNm: radiusFt / 6076.12,
    fullS: 360 / rateDps,
  };
}
/** an integer as is, else one decimal with the language's separator */
const numL = (n: number, lang: Lang) => (Number.isInteger(n) ? String(n) : dec(n, 1, lang));
const mmss = (sec: number) => {
  const t = Math.round(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * The turn circle seen from above: the aeroplane on its left edge heading up (a right turn; a negative bank flies
 * the mirror image), the centre, the radius dimensioned, the rate and the time for a full circle above it, the
 * bank and the speed in the corner. Static (no drag).
 */
export function createTurn(
  spec0: TurnSpec,
  o: DiagramOptions = {},
): DiagramWidget<TurnSpec> {
  const lang: Lang = o.lang ?? "en";
  return makeWidget<TurnSpec>(spec0, o, [1104, 828], "cs-turn", {
    draw(sh, spec) {
      const c = sh.c;
      const { W, H, u, p } = c;
      const ly = sh.layer;
      const lb = new Labels(c, ly);
      const t = solveTurn(spec.tasKt, spec.bankDeg);
      const left = spec.bankDeg < 0;
      // the circle: centred, room above for the rate and on the side for the radius
      const R = Math.max(60 * u, Math.min(W * 0.27, (H - 220 * u) / 2));
      const cx = W / 2;
      const cy = H / 2 + 40 * u;
      const ax = left ? cx + R : cx - R;
      ly.append(
        s("circle", {
          cx,
          cy,
          r: R,
          fill: "none",
          stroke: p.track,
          "stroke-width": SW.hero * u,
        }),
      );
      // an arrow on the circle: the direction of the turn (a quarter ahead of the aeroplane)
      const k = 22 * u;
      const qx = cx;
      const qy = cy - R;
      ly.append(
        s("path", {
          d: left
            ? `M${qx - k} ${qy}L${qx + k * 0.4} ${qy - k * 0.9}L${qx + k * 0.4} ${qy + k * 0.9}Z`
            : `M${qx + k} ${qy}L${qx - k * 0.4} ${qy - k * 0.9}L${qx - k * 0.4} ${qy + k * 0.9}Z`,
          fill: p.track,
        }),
      );
      lb.circle(qx, qy, k);
      // the centre and the radius
      ly.append(s("circle", { cx, cy, r: 7 * u, fill: p.text }));
      lb.circle(cx, cy, 10 * u);
      ly.append(dimLine(c, cx, cy, left ? cx - R : cx + R, cy, p.muted));
      lb.stroke(cx, cy, left ? cx - R : cx + R, cy);
      // the aeroplane on the circle, heading up
      ly.append(aircraftIcon(ax, cy, 0, p.accent, 3.2 * u));
      lb.circle(ax, cy, 44 * u);
      lb.stroke(cx - R, cy - R, cx + R, cy - R);
      // labels
      const rx = left ? cx - R / 2 : cx + R / 2;
      lb.put(
        `r ≈ ${dec(t.radiusNm, 2, lang)} NM`,
        [
          [rx, cy - 24 * u, "middle"],
          [rx, cy + 52 * u, "middle"],
        ],
        {
          role: "pri",
          sub: `${thousands(Math.round(t.radiusFt / 10) * 10, lang)} ft`,
          subColor: p.muted,
        },
      );
      const std = Math.abs(t.rateDps - 3) < 0.3;
      lb.put(
        `${dec(t.rateDps, 1, lang)}°/s`,
        [
          [cx, cy - R - 48 * u, "middle"],
          [cx, cy - R - 40 * u, "middle"],
          [cx + 36 * u, 56 * u, "start"],
        ],
        {
          role: "key",
          color: p.accent,
          sub: std
            ? L(
                lang,
                `standard rate · 360° in ${mmss(t.fullS)}`,
                `taux standard · 360° en ${mmss(t.fullS)}`,
              )
            : L(lang, `360° in ${mmss(t.fullS)}`, `360° en ${mmss(t.fullS)}`),
          subColor: p.ink2,
        },
      );
      lb.put(
        L(
          lang,
          `bank ${numL(Math.abs(spec.bankDeg), lang)}°`,
          `inclinaison ${numL(Math.abs(spec.bankDeg), lang)}°`,
        ),
        [
          [24 * u, 24 * u + FS.pri * u, "start"],
          [W - 24 * u, 24 * u + FS.pri * u, "end"],
        ],
        {
          role: "pri",
          sub: L(lang, `TAS ${spec.tasKt} kt`, `Vp ${spec.tasKt} kt`),
          subColor: p.muted,
        },
      );
    },
    label(_sh, spec) {
      const t = solveTurn(spec.tasKt, spec.bankDeg);
      return L(
        lang,
        `Turn at ${spec.tasKt} kt TAS and ${numL(Math.abs(spec.bankDeg), lang)}° of bank: ${dec(t.rateDps, 1, lang)}° per second, radius ${dec(t.radiusNm, 2, lang)} NM, 360° in ${mmss(t.fullS)}`,
        `Virage à ${spec.tasKt} kt de vitesse propre et ${numL(Math.abs(spec.bankDeg), lang)}° d’inclinaison : ${dec(t.rateDps, 1, lang)}° par seconde, rayon ${dec(t.radiusNm, 2, lang)} NM, 360° en ${mmss(t.fullS)}`,
      );
    },
  });
}
