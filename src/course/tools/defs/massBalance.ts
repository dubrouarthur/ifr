// Teaching tool « Masse et centrage »: the loading stations of the training aeroplane seen from above (their arms
// from the datum), and the CG envelope with the take-off point, the landing point and the fuel burnt between them.
// Maths and sources: ../maths/massBalance.ts (POH C172S §6 arms and CG limits; sample empty weight).
import { massBalance, WB } from "../maths/massBalance";
import { c172sEnvelope } from "../../stage/diagramMath";
import { L, lerpMap, num, ro, Svg, tr, type ToolDef } from "../kit";
import { axes, plot } from "../plot";

export const massBalanceTool: ToolDef = {
  id: "massBalance",
  title: L("Mass and balance", "Masse et centrage"),
  blurb: L(
    "Load the training aeroplane: the CG in its envelope, before and after the flight",
    "Chargez l’avion-école : le centrage dans son enveloppe, avant et après le vol",
  ),
  subject: "PPL · ATPL 031",
  tags: [
    "masse",
    "centrage",
    "mass",
    "balance",
    "weight",
    "cg",
    "enveloppe",
    "envelope",
    "chargement",
    "031",
  ],
  params: [
    {
      key: "front",
      label: L("Front seats", "Places avant"),
      min: 0,
      max: 400,
      step: 10,
      unit: "lb",
    },
    {
      key: "rear",
      label: L("Rear seats", "Places arrière"),
      min: 0,
      max: 400,
      step: 10,
      unit: "lb",
    },
    {
      key: "bag",
      label: L("Baggage", "Bagages"),
      min: 0,
      max: 120,
      step: 5,
      unit: "lb",
    },
    {
      key: "fuel",
      label: L("Fuel at take-off", "Carburant au départ"),
      min: 0,
      max: 53,
      step: 1,
      unit: "gal",
    },
    {
      key: "burn",
      label: L("Fuel burnt", "Carburant consommé"),
      min: 0,
      max: 40,
      step: 1,
      unit: "gal",
    },
  ],
  defaults: { front: 340, rear: 0, bag: 20, fuel: 40, burn: 15 },
  controls: ["front", "rear", "bag", "fuel"],
  presets: [
    {
      label: L("Two on board", "Deux à bord"),
      p: { front: 340, rear: 0, bag: 20, fuel: 40 },
    },
    {
      label: L("Four adults, full", "Quatre adultes, pleins"),
      p: { front: 360, rear: 340, bag: 40, fuel: 53 },
    },
    {
      label: L("Solo, full tanks", "Solo, pleins faits"),
      p: { front: 170, rear: 0, bag: 0, fuel: 53 },
    },
  ],
  note: L(
    "Load four adults with full tanks: the point goes above the maximum mass, so take fuel off, not people, and check the trip still holds its reserve. Then move weight to the rear seats and the baggage: the CG walks aft towards its limit, where the aeroplane is less stable and the stall recovery harder. Burning fuel moves the point down and slightly forward: check the landing point too.",
    "Chargez quatre adultes et les pleins : le point passe au-dessus de la masse maximale ; on enlève du carburant, pas des passagers, et on vérifie que la réserve tient. Puis mettez du poids à l’arrière et en soute : le centre de gravité recule vers sa limite, l’avion devient moins stable et la sortie de décrochage plus difficile. La consommation fait descendre le point et l’avance un peu : vérifiez aussi le point à l’atterrissage.",
  ),
  view: { w: 1000, h: 600 },
  frame: { w: 1680, h: 736 },
  draw(p, cx) {
    const { c, lang } = cx;
    const st = massBalance({
      front: p.front,
      rear: p.rear,
      bag: p.bag,
      fuelGal: p.fuel,
      burnGal: p.burn,
    });
    const s = new Svg();
    // ---------------------------------------------------------------- the stations from above (nose left)
    const X = (arm: number) => lerpMap(arm, -10, 160, 40, 490);
    const cy = 250;
    // fuselage and wing outline
    s.path(
      `M${X(-8)} ${cy} Q${X(0)} ${cy - 40} ${X(20)} ${cy - 44} L${X(110)} ${cy - 30} L${X(152)} ${cy - 10} L${X(152)} ${cy + 10} L${X(110)} ${cy + 30} L${X(20)} ${cy + 44} Q${X(0)} ${cy + 40} ${X(-8)} ${cy}Z`,
      {
        fill: c.surface,
        stroke: c.ruleStrong,
        "stroke-width": 3,
      },
    );
    s.rect(X(33), cy - 210, X(62) - X(33), 420, {
      fill: c.surface,
      stroke: c.ruleStrong,
      "stroke-width": 3,
      rx: 10,
    });
    const station = (
      arm: number,
      lb: number,
      max: number,
      label: string,
      h = 70,
      tone = c.accent,
      low = 0,
    ) => {
      const w = 54;
      const x = X(arm) - w / 2;
      s.rect(x, cy - h / 2, w, h, {
        fill: c.bg,
        stroke: tone,
        "stroke-width": 3,
        rx: 8,
      });
      const f = Math.max(0, Math.min(1, lb / max));
      s.rect(x + 4, cy + h / 2 - 4 - (h - 8) * f, w - 8, (h - 8) * f, {
        fill: tone,
        "fill-opacity": 0.85,
        rx: 5,
      });
      s.text(X(arm), cy + h / 2 + 30 + low, label, {
        size: 22,
        weight: 600,
        fill: c.text,
        anchor: "middle",
        halo: c.bg,
      });
      s.text(X(arm), cy - h / 2 - 12, `${num(lb, 0, lang)}`, {
        size: 22,
        weight: 700,
        fill: tone,
        anchor: "middle",
        halo: c.bg,
      });
    };
    station(WB.frontArm, p.front, 400, tr(L("Front", "Avant"), lang));
    station(WB.rearArm, p.rear, 400, tr(L("Rear", "Arrière"), lang));
    station(WB.bag1Arm, p.bag, 120, tr(L("Bags", "Soute"), lang), 56, c.accent, 34);
    // fuel in the wings (both tanks)
    const fuelLb = p.fuel * WB.fuelLbPerGal;
    for (const dy of [-150, 150]) {
      const h = 90;
      const x = X(WB.fuelArm) - 28;
      s.rect(x, cy + dy - h / 2, 56, h, {
        fill: c.bg,
        stroke: c.key,
        "stroke-width": 3,
        rx: 8,
      });
      const f = p.fuel / WB.fuelUsableGal;
      s.rect(x + 4, cy + dy + h / 2 - 4 - (h - 8) * f, 48, (h - 8) * f, {
        fill: c.key,
        "fill-opacity": 0.85,
        rx: 5,
      });
    }
    s.text(
      X(WB.fuelArm) + 40,
      cy - 150,
      `${tr(L("Fuel", "Carburant"), lang)} ${num(fuelLb, 0, lang)} lb`,
      { size: 22, weight: 700, fill: c.key, halo: c.bg },
    );
    // the datum and the arms
    const ay = 520;
    s.line(X(0), ay, X(140), ay, c.ruleStrong, 2.5);
    for (const a of [0, 40, 80, 120]) {
      s.line(X(a), ay - 8, X(a), ay + 8, c.ruleStrong, 2.5);
      s.text(X(a), ay + 34, `${a}`, {
        size: 22,
        fill: c.muted,
        anchor: "middle",
      });
    }
    s.text(
      X(-10),
      ay + 66,
      tr(
        L(
          "arm (in from the datum)",
          "bras de levier (in, depuis la référence)",
        ),
        lang,
      ),
      { size: 22, fill: c.muted },
    );
    // the CG on the arm line
    const cgx = X(st.takeoff.cg);
    s.poly(
      [
        [cgx, ay - 4],
        [cgx - 14, ay - 30],
        [cgx + 14, ay - 30],
      ],
      { fill: st.takeoff.normal ? c.nav : c.stop },
    );
    s.text(cgx, ay - 40, tr(L("CG", "CG"), lang), {
      size: 22,
      weight: 700,
      fill: st.takeoff.normal ? c.nav : c.stop,
      anchor: "middle",
      halo: c.bg,
    });
    // ---------------------------------------------------------------- the envelope
    const pl = plot(560, 50, 975, 470, [33, 49], [1500, 2700]);
    axes(s, pl, c, {
      xTicks: [35, 40, 45],
      yTicks: [1600, 2000, 2400],
      yFmt: (v) => num(v, 0, lang),
      xLabel: tr(L("CG (in)", "Centrage (in)"), lang),
      yLabel: tr(L("Mass (lb)", "Masse (lb)"), lang),
    });
    const poly = (cat: "normal" | "utility") =>
      c172sEnvelope(cat).map(
        ([cg, w]) => [pl.X(cg), pl.Y(w)] as [number, number],
      );
    s.poly(poly("normal"), {
      fill: c.accent,
      "fill-opacity": 0.1,
      stroke: c.accent,
      "stroke-width": 3.5,
    });
    s.poly(poly("utility"), {
      fill: "none",
      stroke: c.sel,
      "stroke-width": 3,
      "stroke-dasharray": "10 7",
    });
    s.text(pl.X(44.5), pl.Y(2550) + 30, tr(L("Normal", "Normale"), lang), {
      size: 22,
      weight: 700,
      fill: c.accent,
      anchor: "middle",
    });
    s.text(pl.X(37.6), pl.Y(1700), tr(L("Utility", "Utilitaire"), lang), {
      size: 22,
      weight: 700,
      fill: c.sel,
      anchor: "middle",
      halo: c.bg,
    });
    s.line(pl.x0, pl.Y(2550), pl.x1, pl.Y(2550), c.stop, 2, "6 6");
    const to = st.takeoff;
    const ld = st.landing;
    const P = (q: typeof to): [number, number] => [
      pl.X(Math.max(33, Math.min(49, q.cg))),
      pl.Y(Math.max(1500, Math.min(2700, q.weight))),
    ];
    const [tx, ty] = P(to);
    const [lx, ly] = P(ld);
    if (Math.hypot(tx - lx, ty - ly) > 20)
      s.arrow(tx, ty, lx, ly, c.muted, 3, 14);
    s.circle(lx, ly, 10, {
      fill: ld.normal ? c.nav : c.stop,
      stroke: c.bg,
      "stroke-width": 3,
    });
    s.circle(tx, ty, 14, {
      fill: to.normal ? c.nav : c.stop,
      stroke: c.bg,
      "stroke-width": 4,
    });
    s.text(tx + 20, ty - 6, tr(L("take-off", "décollage"), lang), {
      size: 22,
      weight: 700,
      fill: c.text,
      halo: c.bg,
    });
    s.text(lx + 18, ly + 22, tr(L("landing", "atterrissage"), lang), {
      size: 22,
      weight: 600,
      fill: c.muted,
      halo: c.bg,
    });
    const verdict =
      to.reason === "overweight"
        ? L("Above the maximum mass", "Au-dessus de la masse maximale")
        : to.reason === "aft"
          ? L("CG too far aft", "Centrage trop arrière")
          : to.reason === "forward"
            ? L("CG too far forward", "Centrage trop avant")
            : st.stationOver.length
              ? L(
                  "A station limit is exceeded",
                  "Une limite de chargement est dépassée",
                )
              : to.utility
                ? L(
                    "Inside: normal and utility categories",
                    "Dans les catégories normale et utilitaire",
                  )
                : L("Inside the normal category", "Dans la catégorie normale");
    const ok = to.normal && !st.stationOver.length;
    s.text((pl.x0 + pl.x1) / 2, 560, tr(verdict, lang), {
      size: 26,
      weight: 700,
      fill: ok ? c.nav : c.stop,
      anchor: "middle",
    });
    return {
      svg: s.toString(),
      readouts: [
        ro(
          L("Take-off mass", "Masse au décollage"),
          `${num(to.weight, 0, lang)} lb`,
          to.reason === "overweight" ? "stop" : undefined,
        ),
        ro(
          L("Take-off CG", "Centrage au décollage"),
          `${num(to.cg, 1, lang)} in`,
          to.normal ? "ok" : "stop",
        ),
        ro(
          L("Landing CG", "Centrage à l’atterrissage"),
          `${num(ld.cg, 1, lang)} in`,
          ld.normal ? "ok" : "stop",
        ),
        ro(
          L("Maximum mass", "Masse maximale"),
          `${num(WB.maxTakeoffLb, 0, lang)} lb`,
        ),
      ],
      say: `${tr(L("Take-off", "Décollage"), lang)} ${num(to.weight, 0, lang)} lb, ${tr(L("CG", "centrage"), lang)} ${num(to.cg, 1, lang)} in: ${tr(verdict, lang)}.`,
    };
  },
};
