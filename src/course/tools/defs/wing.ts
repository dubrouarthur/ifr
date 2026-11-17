// Teaching tool « Aile et incidence »: the aerofoil in the relative wind, the airflow over it (attached, then torn
// from the upper surface past the critical angle), lift and drag, and the lift curve CL(α) with its top, CL max.
// Maths and sources: ../maths/aero.ts (POH C172S stall speeds, NACA 2412, lifting-line slope, drag polar).
import {
  alphaForLevel,
  cd,
  cl,
  stallAlpha,
  wingState,
  type Flaps,
} from "../maths/aero";
import { L, num, ro, Svg, tr, type ToolDef, type ToolValues } from "../kit";
import { axes, plot } from "../plot";

const FLAPS: Flaps[] = [0, 10, 30];
export const flapsOf = (p: ToolValues): Flaps =>
  FLAPS[Math.round(p.flaps ?? 0)] ?? 0;

/** NACA 2412 mean line and thickness (x along the chord 0..1) */
function naca2412(x: number): { yc: number; yt: number } {
  const m = 0.02;
  const pp = 0.4;
  const t = 0.12;
  const yt =
    5 *
    t *
    (0.2969 * Math.sqrt(x) -
      0.126 * x -
      0.3516 * x * x +
      0.2843 * x ** 3 -
      0.1015 * x ** 4);
  const yc =
    x < pp
      ? (m / (pp * pp)) * (2 * pp * x - x * x)
      : (m / (1 - pp) ** 2) * (1 - 2 * pp + 2 * pp * x - x * x);
  return { yc, yt };
}
/** the section's outline (chord C, pivot at the quarter chord, flap hinged at 75 %), nose up by alpha, in the drawing */
export function aerofoil(
  alphaDeg: number,
  flapDeg: number,
  C: number,
  cx: number,
  cy: number,
): [number, number][] {
  const n = 36;
  const xs = Array.from(
    { length: n + 1 },
    (_, i) => (1 - Math.cos((Math.PI * i) / n)) / 2,
  );
  const upper = xs.map((x) => {
    const { yc, yt } = naca2412(x);
    return [x, yc + yt] as [number, number];
  });
  const lower = xs.map((x) => {
    const { yc, yt } = naca2412(x);
    return [x, yc - yt] as [number, number];
  });
  const pts = [...upper.reverse(), ...lower.slice(1)];
  const hx = 0.75;
  const hy = naca2412(hx).yc;
  const d = (flapDeg * Math.PI) / 180;
  const a = (alphaDeg * Math.PI) / 180;
  return pts.map(([x, y]) => {
    let X = x;
    let Y = y;
    if (x > hx) {
      // the flap turns down about its hinge
      const dx = x - hx;
      const dy = y - hy;
      X = hx + dx * Math.cos(d) + dy * Math.sin(d);
      Y = hy - dx * Math.sin(d) + dy * Math.cos(d);
    }
    const lx = (X - 0.25) * C;
    const ly = -Y * C;
    return [
      cx + lx * Math.cos(a) - ly * Math.sin(a),
      cy + lx * Math.sin(a) + ly * Math.cos(a),
    ];
  });
}
/** the top and bottom of an outline at x (null outside it) */
function spanAt(poly: [number, number][], x: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    if ((x1 <= x && x <= x2) || (x2 <= x && x <= x1)) {
      const y = x1 === x2 ? y1 : y1 + ((x - x1) * (y2 - y1)) / (x2 - x1);
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
  }
  return lo === Infinity ? null : [lo, hi];
}
const smooth = (ys: number[], k = 2): number[] =>
  ys.map((_, i) => {
    let s = 0;
    let n = 0;
    for (let j = i - k; j <= i + k; j++)
      if (j >= 0 && j < ys.length) {
        s += ys[j];
        n++;
      }
    return s / n;
  });

export const wingTool: ToolDef = {
  id: "wing",
  title: L("Wing and angle of attack", "Aile et incidence"),
  blurb: L(
    "Airflow, lift and drag, the stall at CL max",
    "Écoulement, portance et traînée, le décrochage au Cz max",
  ),
  subject: "PPL · ATPL 081",
  tags: [
    "aile",
    "wing",
    "incidence",
    "angle of attack",
    "portance",
    "lift",
    "décrochage",
    "stall",
    "cz",
    "cl",
    "081",
    "aérodynamique",
  ],
  params: [
    {
      key: "alpha",
      label: L("Angle of attack", "Incidence"),
      min: -4,
      max: 24,
      step: 0.5,
      unit: "°",
    },
    {
      key: "ias",
      label: L("Airspeed", "Vitesse"),
      min: 40,
      max: 140,
      step: 1,
      unit: "kt",
    },
    {
      key: "flaps",
      label: L("Flaps", "Volets"),
      min: 0,
      max: 2,
      step: 1,
      choices: [L("0°", "0°"), L("10°", "10°"), L("30°", "30°")],
    },
  ],
  defaults: { alpha: 4, ias: 100, flaps: 0 },
  controls: ["alpha", "ias", "flaps"],
  presets: [
    {
      label: L("Cruise", "Croisière"),
      p: {
        alpha: Math.round((alphaForLevel(110, 0) ?? 2.5) * 2) / 2,
        ias: 110,
        flaps: 0,
      },
    },
    {
      label: L("Climb (Vy)", "Montée (Vy)"),
      p: {
        alpha: Math.round((alphaForLevel(74, 0) ?? 7) * 2) / 2,
        ias: 74,
        flaps: 0,
      },
    },
    {
      label: L("Approach, flaps 30", "Approche, volets 30"),
      p: {
        alpha: Math.round((alphaForLevel(65, 30) ?? 6) * 2) / 2,
        ias: 65,
        flaps: 2,
      },
    },
    { label: L("Stall", "Décrochage"), p: { alpha: 20, ias: 53, flaps: 0 } },
  ],
  sweep: { key: "alpha", from: -2, to: 22, s: 10 },
  note: L(
    "Raise the angle of attack slowly: lift grows in a straight line, the curve rounds off near the top, then past the critical angle the airflow tears off the upper surface and lift falls. Ask: at what speed does it happen? (Any speed: the stall is an angle.) Then set 30° of flaps: more lift, a smaller critical angle.",
    "Augmentez lentement l’incidence : la portance croît en ligne droite, la courbe s’arrondit vers le haut, puis au-delà de l’incidence critique les filets d’air décollent de l’extrados et la portance chute. Demandez : à quelle vitesse cela arrive-t-il ? (À n’importe quelle vitesse : le décrochage est une incidence.) Puis sortez 30° de volets : plus de portance, une incidence critique plus petite.",
  ),
  task: {
    prompt: L(
      "Find the angle of attack at which the wing stalls (flaps up)",
      "Trouvez l’incidence à laquelle l’aile décroche (volets rentrés)",
    ),
    key: "alpha",
    target: Math.round(stallAlpha(0) * 2) / 2,
    tol: 1,
  },
  view: { w: 1000, h: 600 },
  frame: { w: 1680, h: 768 },
  animated: true,
  draw(p, cx) {
    const { c, lang } = cx;
    const flaps = flapsOf(p);
    const alpha = p.alpha;
    const st = wingState(alpha, p.ias, flaps);
    const s = new Svg();
    // ---------------------------------------------------------------- the section in the airflow
    const CX = 320;
    const CY = 245;
    const C = 380;
    const poly = aerofoil(alpha, flaps, C, CX, CY);
    const X0 = 30;
    const X1 = 620;
    const sepX = st.stalled
      ? CX - C * 0.25 + C * Math.max(0.05, 0.45 - 0.1 * (alpha - st.stallAlpha))
      : Infinity;
    const offs = [-185, -135, -88, -46, 46, 92, 140, 190];
    const amp = (y0: number) => st.cl * 62 * Math.exp(-Math.abs(y0) / 260);
    const dash = cx.moving ? "22 16" : undefined;
    const flowOff = cx.moving ? -((cx.t * 160) % 38) : 0;
    for (const y0 of offs) {
      const xs: number[] = [];
      for (let x = X0; x <= X1; x += 6) xs.push(x);
      let ys = xs.map((x) => {
        const up = 0.55 * Math.exp(-(((x - (CX - 150)) / 100) ** 2));
        const down = 0.5 * (1 + Math.tanh((x - CX - 30) / 110));
        return CY + y0 + amp(y0) * (down - up);
      });
      // never through the section: each line keeps clear of it
      const gap = Math.abs(y0) * 0.55;
      ys = ys.map((y, i) => {
        const sp = spanAt(poly, xs[i]);
        if (!sp) return y;
        return y0 < 0 ? Math.min(y, sp[0] - gap) : Math.max(y, sp[1] + gap);
      });
      ys = smooth(smooth(smooth(ys)));
      // past the critical angle the lines nearest the upper surface leave it at the separation point
      const torn = y0 < 0 && Math.abs(y0) < 100 && st.stalled;
      if (torn) {
        const k = xs.findIndex((x) => x >= sepX);
        if (k > 1) {
          const slope = (ys[k] - ys[k - 2]) / (xs[k] - xs[k - 2]);
          for (let i = k; i < xs.length; i++)
            ys[i] =
              ys[k] +
              slope * 0.6 * (xs[i] - xs[k]) -
              (Math.abs(y0) < 60 ? 10 : 4);
        }
      }
      s.polyline(
        xs.map((x, i) => [x, ys[i]] as [number, number]),
        {
          stroke: torn ? c.stop : c.sel,
          "stroke-width": 3,
          "stroke-opacity": torn ? 0.9 : 0.75,
          "stroke-dasharray": dash,
          "stroke-dashoffset": flowOff,
        },
      );
    }
    // the separated wake: eddies over the rear of the upper surface
    if (st.stalled) {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const x = sepX + 20 + i * 42;
        const sp = spanAt(
          poly,
          Math.min(x, poly.reduce((m, q) => Math.max(m, q[0]), 0) - 2),
        );
        const top = sp
          ? sp[0]
          : CY + (x - CX) * Math.tan((alpha * Math.PI) / 180) * 0.4;
        const r = 12 + (i % 3) * 5;
        const spin = cx.moving ? cx.t * 4 + i : i;
        const y = top - 26 - (i % 2) * 18;
        const a0 = spin % (2 * Math.PI);
        const a1 = a0 + 4.4;
        s.path(
          `M${x + r * Math.cos(a0)} ${y + r * Math.sin(a0)} A${r} ${r} 0 1 1 ${x + r * Math.cos(a1)} ${y + r * Math.sin(a1)}`,
          { stroke: c.stop, "stroke-width": 3, "stroke-opacity": 0.85 },
        );
      }
    }
    // the section, its chord and the relative wind
    s.poly(poly, { fill: c.surface, stroke: c.text, "stroke-width": 3 });
    const a = (alpha * Math.PI) / 180;
    const le: [number, number] = [
      CX - 0.25 * C * Math.cos(a) - 120 * Math.cos(a),
      CY - 0.25 * C * Math.sin(a) - 120 * Math.sin(a),
    ];
    const te: [number, number] = [
      CX + 0.75 * C * Math.cos(a) + 40 * Math.cos(a),
      CY + 0.75 * C * Math.sin(a) + 40 * Math.sin(a),
    ];
    s.line(le[0], le[1], te[0], te[1], c.ruleStrong, 2.5, "10 8");
    // α: between the relative wind and the chord, the vertex at the pivot, drawn ahead of the leading edge
    const R = 0.25 * C + 70;
    s.line(CX - R - 70, CY, CX - 0.25 * C - 6, CY, c.muted, 2.5, "10 8");
    if (Math.abs(alpha) >= 0.5) {
      const p2x = CX - R * Math.cos(a);
      const p2y = CY - R * Math.sin(a);
      s.path(`M${CX - R} ${CY} A${R} ${R} 0 0 ${alpha > 0 ? 1 : 0} ${p2x} ${p2y}`, { stroke: c.key, "stroke-width": 5 });
    }
    const mid = a / 2;
    s.text(CX - (R + 16) * Math.cos(mid), CY - (R + 16) * Math.sin(mid) + (alpha >= 0 ? -6 : 22), `α ${num(alpha, 1, lang)}°`, {
      size: 30,
      weight: 700,
      fill: c.key,
      anchor: "end",
      halo: c.bg,
    });
    s.text(X0, 40, tr(L("Relative wind →", "Vent relatif →"), lang), {
      size: 24,
      fill: c.muted,
      weight: 600,
    });
    // lift (perpendicular to the relative wind) and drag (along it), the same scale: 1 = 120 units
    const px = CX + 0.02 * C;
    const py = CY - 6;
    const k = 130;
    s.arrow(px, py, px, py - Math.max(0, st.cl) * k, c.accent, 6, 22);
    s.text(
      px + 14,
      py - Math.max(0, st.cl) * k + 8,
      tr(L("Lift", "Portance"), lang),
      { size: 26, weight: 700, fill: c.accent, halo: c.bg },
    );
    s.arrow(px + 40, py + 40, px + 40 + st.cd * k, py + 40, c.stop, 6, 16);
    s.text(px + 48 + st.cd * k + 6, py + 50, tr(L("Drag", "Traînée"), lang), {
      size: 24,
      weight: 700,
      fill: c.stop,
      halo: c.bg,
    });
    if (st.stalled)
      s.text(
        CX + 40,
        CY + 210,
        tr(
          L(
            "Stalled: the airflow leaves the upper surface",
            "Décroché : l’écoulement quitte l’extrados",
          ),
          lang,
        ),
        {
          size: 28,
          weight: 700,
          fill: c.stop,
          anchor: "middle",
          halo: c.bg,
        },
      );
    // ---------------------------------------------------------------- lift ÷ weight at this speed
    const gx = 40;
    const gy = 520;
    const gw = 560;
    const ratio = st.liftRatio;
    const gX = (v: number) => gx + (Math.max(0, Math.min(2, v)) / 2) * gw;
    s.text(
      gx,
      gy - 22,
      tr(
        L(
          `Lift ÷ weight at ${Math.round(p.ias)} kt`,
          `Portance ÷ poids à ${Math.round(p.ias)} kt`,
        ),
        lang,
      ),
      {
        size: 24,
        fill: c.muted,
        weight: 600,
      },
    );
    s.rect(gx, gy, gw, 22, {
      fill: c.surface,
      stroke: c.rule,
      "stroke-width": 2,
      rx: 11,
    });
    s.rect(gx, gy, gX(ratio) - gx, 22, {
      fill: ratio > 1.05 ? c.nav : ratio < 0.95 ? c.key : c.accent,
      rx: 11,
    });
    s.line(gX(1), gy - 8, gX(1), gy + 30, c.text, 3);
    s.text(gX(1), gy + 56, "1", {
      size: 24,
      anchor: "middle",
      fill: c.text,
      weight: 700,
    });
    s.text(gX(2), gy + 56, "2", { size: 22, anchor: "end", fill: c.muted });
    s.text(gx, gy + 56, "0", { size: 22, fill: c.muted });
    // ---------------------------------------------------------------- the lift curve CL(α)
    const pl = plot(700, 70, 975, 470, [-4, 24], [-0.4, 2.0]);
    axes(s, pl, c, {
      xTicks: [0, 8, 16, 24],
      yTicks: [0, 1, 2],
      xFmt: (v) => `${v}°`,
      yFmt: (v) => num(v, 0, lang),
      xLabel: "α",
      yLabel: lang === "fr" ? "Cz" : "CL",
    });
    for (const f of FLAPS) {
      if (f === flaps) continue;
      const pts: [number, number][] = [];
      for (let x = -4; x <= 24; x += 0.25) pts.push([pl.X(x), pl.Y(cl(x, f))]);
      s.polyline(pts, { stroke: c.rule, "stroke-width": 2.5 });
    }
    const cur: [number, number][] = [];
    for (let x = -4; x <= 24; x += 0.25)
      cur.push([pl.X(x), pl.Y(cl(x, flaps))]);
    s.polyline(cur, { stroke: c.accent, "stroke-width": 4 });
    const sa = st.stallAlpha;
    s.line(pl.X(sa), pl.y0, pl.X(sa), pl.y1, c.stop, 2.5, "8 6");
    s.text(
      pl.X(sa) - 8,
      pl.Y(st.clMax) - 16,
      `${lang === "fr" ? "Cz" : "CL"} max ${num(st.clMax, 2, lang)}`,
      {
        size: 22,
        anchor: "end",
        fill: c.stop,
        weight: 600,
        halo: c.bg,
      },
    );
    s.text(pl.x0 + 12, pl.y0 + 6, `${tr(L("Flaps", "Volets"), lang)} ${flaps}°`, { size: 22, fill: c.accent, weight: 700, halo: c.bg });
    s.circle(pl.X(alpha), pl.Y(st.cl), 11, {
      fill: st.stalled ? c.stop : c.key,
      stroke: c.bg,
      "stroke-width": 3,
    });
    void cd;
    const C_ = lang === "fr" ? "Cz" : "CL";
    const verdict = st.stalled
      ? L("stalled", "décroché")
      : ratio < 0.95
        ? L("not enough lift: it sinks", "portance insuffisante : il descend")
        : ratio > 1.05
          ? L(
              "more lift than weight: it climbs or turns",
              "plus de portance que de poids : il monte ou vire",
            )
          : L(
              "lift = weight: level flight",
              "portance = poids : vol en palier",
            );
    return {
      svg: s.toString(),
      readouts: [
        ro(L(`Lift coefficient ${C_}`, `Coefficient ${C_}`), num(st.cl, 2, lang), st.stalled ? "stop" : undefined),
        ro(L("Lift / drag", "Finesse"), num(st.ld, 1, lang)),
        ro(L("Critical angle", "Incidence critique"), `${num(st.stallAlpha, 0, lang)}°`, st.nearStall > 0.85 ? "stop" : undefined),
        ro(L("Stall speed (1 g)", "Vitesse de décrochage (1 g)"), `${num(st.vs, 0, lang)} kt`, p.ias < st.vs ? "stop" : undefined),
      ],
      say: `${tr(L("Angle of attack", "Incidence"), lang)} ${num(alpha, 1, lang)}°, ${C_} ${num(st.cl, 2, lang)}: ${tr(verdict, lang)}.`,
    };
  },
};
