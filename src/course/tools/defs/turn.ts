// Teaching tool « Facteur de charge en virage »: the aeroplane seen from behind in its bank (lift, weight, the two
// components of lift), and the V-n diagram of the training aeroplane with the point flown. Maths and sources:
// ../maths/turn.ts (POH stall speeds in a turn, load factor limits, VA, VNO, VNE).
import {
  cornerKcas,
  loadFactor,
  nStall,
  nStallNeg,
  turnState,
  vsAt,
  VN,
} from "../maths/turn";
import { L, num, rad, ro, Svg, tr, type ToolDef } from "../kit";
import { axes, plot } from "../plot";

export const turnTool: ToolDef = {
  id: "loadFactor",
  title: L("Load factor in a turn", "Facteur de charge en virage"),
  blurb: L(
    "Bank, apparent weight, the stall speed that rises, the V-n diagram",
    "Inclinaison, poids apparent, vitesse de décrochage qui monte, diagramme V-n",
  ),
  subject: "PPL · ATPL 081",
  tags: [
    "virage",
    "turn",
    "facteur de charge",
    "load factor",
    "inclinaison",
    "bank",
    "v-n",
    "décrochage",
    "stall",
    "081",
  ],
  params: [
    {
      key: "bank",
      label: L("Bank", "Inclinaison"),
      min: 0,
      max: 75,
      step: 5,
      unit: "°",
    },
    {
      key: "v",
      label: L("Airspeed (CAS)", "Vitesse (Vc)"),
      min: 50,
      max: 170,
      step: 1,
      unit: "kt",
    },
    {
      key: "w",
      label: L("Weight", "Masse"),
      min: 1900,
      max: 2550,
      step: 50,
      unit: "lb",
    },
  ],
  defaults: { bank: 30, v: 100, w: 2550 },
  controls: ["bank", "v", "w"],
  presets: [
    { label: L("Turn at 30°", "Virage à 30°"), p: { bank: 30, v: 100 } },
    { label: L("Steep turn 60°", "Virage serré 60°"), p: { bank: 60, v: 110 } },
    { label: L("60° too slow", "60° trop lent"), p: { bank: 60, v: 70 } },
    { label: L("75° fast", "75° rapide"), p: { bank: 75, v: 150 } },
  ],
  sweep: { key: "bank", from: 0, to: 75, s: 8 },
  note: L(
    "Bank the aeroplane: to stay level the lift must hold up the weight AND pull the aeroplane round, so the wing works harder: n = 1 / cos φ, 2 g at 60°. The stall speed rises as √n: 53 kt wings level becomes 75 kt at 60° (CAS; the airspeed indicator shows 48 and 68 kt IAS, the flight manual gives both). Then slow down at 60° and watch the point leave the envelope on the stall side. Ask: why does VA fall when the aeroplane is lighter?",
    "Inclinez : pour tenir le palier, la portance doit porter le poids ET tirer l’avion dans le virage, l’aile travaille plus : n = 1 / cos φ, 2 g à 60°. La vitesse de décrochage croît comme √n : 53 kt ailes à plat deviennent 75 kt à 60° (Vc ; l’anémomètre indique 48 et 68 kt Vi, le manuel de vol donne les deux). Puis ralentissez à 60° et regardez le point sortir du domaine côté décrochage. Demandez : pourquoi VA baisse-t-elle quand l’avion est plus léger ?",
  ),
  task: {
    prompt: L(
      "Find the bank angle that doubles the apparent weight (2 g)",
      "Trouvez l’inclinaison qui double le poids apparent (2 g)",
    ),
    key: "bank",
    // the apparent weight depends on the bank alone (n = 1 / cos φ): any speed and weight
    met: (p) => Math.abs(loadFactor(p.bank) - 2) < 0.02,
  },
  view: { w: 1000, h: 600 },
  frame: { w: 1680, h: 736 },
  draw(p, cx) {
    const { c, lang } = cx;
    const st = turnState(p.bank, p.v, p.w);
    const s = new Svg();
    // ---------------------------------------------------------------- seen from behind
    const ox = 200;
    const oy = 330;
    const phi = rad(p.bank);
    const ca = Math.cos(phi);
    const sa = Math.sin(phi);
    // the horizon and the bank arc
    s.line(20, oy, 410, oy, c.rule, 2, "8 8");
    const span = 150;
    const wing = (d: number): [number, number] => [ox + d * ca, oy + d * sa];
    // right bank: the right wing goes down (seen from behind)
    const [lx, ly] = wing(-span);
    const [rx, ry] = wing(span);
    s.line(lx, ly, rx, ry, c.text, 9);
    s.circle(ox, oy, 26, {
      fill: c.surface,
      stroke: c.text,
      "stroke-width": 5,
    });
    // the fin, perpendicular to the wing
    s.line(ox + 26 * sa, oy - 26 * ca, ox + 70 * sa, oy - 70 * ca, c.text, 7);
    // the forces: weight down (1 g = 95), lift along the fin (n g), its components dashed
    // past 3 g the whole figure (weight AND lift) shrinks, so the vertical part of lift still equals the weight;
    // the legend gives the exact value
    const g1 = 80 * Math.min(1, 3 / st.n);
    const nLen = st.n * g1;
    const tx = ox + nLen * sa;
    const ty = oy - nLen * ca;
    s.line(ox, oy, ox, oy - g1, c.accent, 3, "8 6");
    s.line(ox, oy - g1, tx, ty, c.accent, 3, "8 6");
    s.arrow(ox, oy, tx, ty, c.accent, 6, 22);
    s.arrow(ox, oy, ox, oy + g1, c.text, 6, 22);
    // the labels off the lines: lift's beyond its tip on the low-wing side, weight's on the high-wing side
    s.text(
      tx + 16 * ca + 6 * sa,
      ty + 16 * sa - 6 * ca,
      lang === "fr" ? "Rz" : "L",
      {
        size: 28,
        weight: 700,
        fill: c.accent,
        halo: c.bg,
        mid: true,
      },
    );
    s.text(ox - 14, oy + g1 + 4, lang === "fr" ? "P" : "W", {
      size: 28,
      weight: 700,
      fill: c.text,
      halo: c.bg,
      anchor: "end",
    });
    // the legend, under the figure
    const ly0 = 500;
    s.line(20, ly0 - 8, 52, ly0 - 8, c.accent, 6);
    s.text(
      62,
      ly0,
      `${tr(L("Lift", "Portance"), lang)} ${num(st.n, 2, lang)} × ${tr(L("weight", "poids"), lang)}`,
      { size: 24, weight: 700, fill: c.accent },
    );
    s.line(20, ly0 + 26, 52, ly0 + 26, c.accent, 3, "8 6");
    s.text(
      62,
      ly0 + 34,
      tr(
        L("its parts: carry, turn", "composantes : porter, faire virer"),
        lang,
      ),
      { size: 22, fill: c.accent },
    );
    // the bank angle
    // the bank angle: between the horizon and the lowered wing (clear of the forces above)
    if (p.bank > 0) {
      const R = 110;
      s.path(
        `M${ox + R} ${oy} A${R} ${R} 0 0 1 ${ox + R * ca} ${oy + R * sa}`,
        {
          stroke: c.key,
          "stroke-width": 5,
        },
      );
      const h = phi / 2;
      s.text(
        ox + (R + 18) * Math.cos(h),
        oy + (R + 18) * Math.sin(h) + 10,
        `φ ${num(p.bank, 0, lang)}°`,
        { size: 28, weight: 700, fill: c.key, halo: c.bg },
      );
    }
    s.text(
      20,
      585,
      `n = 1 / cos ${num(p.bank, 0, lang)}° = ${num(st.n, 2, lang)}`,
      { size: 28, weight: 700, fill: c.text },
    );
    // ---------------------------------------------------------------- the V-n diagram
    const pl = plot(520, 60, 975, 470, [0, 180], [-2, 5]);
    axes(s, pl, c, {
      xTicks: [0, 60, 120, 180],
      yTicks: [-1, 0, 1, 2, 3, 4],
      yFmt: (v) => (v > 0 ? `+${v}` : String(v).replace("-", "−")),
      xLabel: tr(L("CAS (kt)", "Vc (kt)"), lang),
      yLabel: "n (g)",
    });
    const W = p.w;
    const va = cornerKcas(W);
    const vneg = vsAt(W) * Math.sqrt(-VN.nNeg / VN.invertedClRatio);
    const env: [number, number][] = [];
    for (let v = 0; v <= va; v += 2) env.push([pl.X(v), pl.Y(nStall(v, W))]);
    env.push(
      [pl.X(va), pl.Y(VN.nPos)],
      [pl.X(VN.vne), pl.Y(VN.nPos)],
      [pl.X(VN.vne), pl.Y(0)],
      [pl.X(VN.vno), pl.Y(VN.nNeg)],
    );
    env.push([pl.X(vneg), pl.Y(VN.nNeg)]);
    for (let v = vneg; v >= 0; v -= 2)
      env.push([pl.X(v), pl.Y(nStallNeg(v, W))]);
    s.poly(env, {
      fill: c.accent,
      "fill-opacity": 0.1,
      stroke: c.accent,
      "stroke-width": 3.5,
    });
    s.line(pl.x0, pl.Y(0), pl.x1, pl.Y(0), c.ruleStrong, 2);
    // the speeds
    const tick = (v: number, label: string, color: string, dy = 0) => {
      s.line(pl.X(v), pl.y0 + 10, pl.X(v), pl.y1, color, 2, "6 6");
      s.text(pl.X(v), pl.y0 + dy, label, {
        size: 22,
        weight: 700,
        fill: color,
        anchor: "middle",
        halo: c.bg,
      });
    };
    // the POH VA (KIAS) on the CAS axis: IAS ≈ CAS within about 2 kt at these speeds (POH §5 "Airspeed
    // calibration"), so the tick and the readout give the same figure
    tick(st.vaKias, "VA", c.key);
    tick(VN.vno, "VNO", c.muted, 26);
    tick(VN.vne, "VNE", c.stop);
    s.text(pl.X(158), pl.Y(VN.nPos) + 30, `+${num(VN.nPos, 1, lang)} g`, {
      size: 22,
      fill: c.muted,
      weight: 600,
      anchor: "end",
    });
    s.text(pl.X(56), pl.Y(1.9), tr(L("stall", "décrochage"), lang), {
      size: 22,
      fill: c.stop,
      weight: 600,
      rotate: -52,
      halo: c.bg,
      anchor: "middle",
    });
    // the point flown
    const tone = st.verdict === "ok" ? c.nav : c.stop;
    const vx = pl.X(Math.min(180, p.v));
    const ny = pl.Y(Math.min(5, st.n));
    s.line(pl.x0, ny, vx, ny, tone, 2, "4 6");
    s.circle(vx, ny, 13, { fill: tone, stroke: c.bg, "stroke-width": 4 });
    const word =
      st.verdict === "stall"
        ? L(
            "Stalls: not enough speed for this bank",
            "Décroche : pas assez de vitesse pour cette inclinaison",
          )
        : st.verdict === "overload"
          ? L(
              "Beyond the limit load factor",
              "Au-delà du facteur de charge limite",
            )
          : st.verdict === "overspeed"
            ? L("Beyond VNE", "Au-delà de la VNE")
            : L("Inside the flight envelope", "Dans le domaine de vol");
    s.text((pl.x0 + pl.x1) / 2, 560, tr(word, lang), {
      size: 26,
      weight: 700,
      fill: tone,
      anchor: "middle",
    });
    return {
      svg: s.toString(),
      readouts: [
        ro(
          L("Load factor", "Facteur de charge"),
          `${num(st.n, 2, lang)} g`,
          st.verdict === "overload" ? "stop" : "key",
        ),
        ro(
          L("Stall in this turn (kt)", "Décrochage dans ce virage (kt)"),
          // the POH table in both: CAS (the V-n diagram) and IAS (what the airspeed indicator shows)
          tr(
            L(
              `${num(st.vsTurnKcas, 0, lang)} CAS · ${num(st.vsTurnKias, 0, lang)} IAS`,
              `${num(st.vsTurnKcas, 0, lang)} Vc · ${num(st.vsTurnKias, 0, lang)} Vi`,
            ),
            lang,
          ),
          st.verdict === "stall" ? "stop" : undefined,
        ),
        ro(
          L("VA at this weight", "VA à cette masse"),
          `${num(st.vaKias, 0, lang)} kt`,
          st.aboveVa ? "warn" : undefined,
        ),
        ro(
          L("Turn radius", "Rayon de virage"),
          p.bank > 0 ? `${num(st.radiusFt * 0.3048, 0, lang)} m` : "—",
        ),
      ],
      say: `${tr(L("Bank", "Inclinaison"), lang)} ${num(p.bank, 0, lang)}°, n ${num(st.n, 2, lang)} g, ${tr(L("stall at", "décrochage à"), lang)} ${num(st.vsTurnKias, 0, lang)} kt ${tr(L("IAS", "Vi"), lang)}: ${tr(word, lang)}.`,
    };
  },
};
