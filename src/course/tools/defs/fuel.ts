// Teaching tool « Carburant, autonomie et réserve »: the fuel on board as one bar (start-up and taxi, the trip, the
// VFR reserve, the extra) and the same in time (the flight, the endurance, the reserve). Maths and sources:
// ../maths/perf.ts (EU Part-NCO.OP.125 reserve: 30 min by day, 45 min by night; 53 US gal usable).
import { fuelPlan, USABLE_L } from "../maths/perf";
import { FMT } from "../../calc/text";
import { hidden, L, num, ro, Svg, tr, type ToolDef } from "../kit";

export const fuelTool: ToolDef = {
  id: "fuel",
  title: L("Fuel, endurance and reserve", "Carburant, autonomie et réserve"),
  blurb: L(
    "Taxi, trip, reserve, extra: what is left on landing",
    "Roulage, étape, réserve, supplément : ce qui reste à l’arrivée",
  ),
  subject: "PPL · ATPL 033",
  tags: [
    "carburant",
    "fuel",
    "autonomie",
    "endurance",
    "réserve",
    "reserve",
    "consommation",
    "033",
    "préparation",
  ],
  params: [
    {
      key: "fuel",
      label: L("Usable fuel at start", "Carburant utilisable"),
      min: 20,
      max: 200,
      step: 1,
      unit: "L",
    },
    {
      key: "flow",
      label: L("Fuel flow", "Consommation"),
      min: 20,
      max: 50,
      step: 1,
      unit: "L/h",
    },
    {
      key: "trip",
      label: L("Flight time", "Temps de vol"),
      min: 0,
      max: 300,
      step: 5,
      unit: "min",
    },
    {
      key: "night",
      label: L("Flight", "Vol"),
      min: 0,
      max: 1,
      step: 1,
      choices: [L("By day", "De jour"), L("By night", "De nuit")],
    },
    {
      key: "taxi",
      label: L("Start-up and taxi", "Mise en route et roulage"),
      min: 0,
      max: 10,
      step: 1,
      unit: "L",
    },
  ],
  defaults: { fuel: 110, flow: 35, trip: 120, night: 0, taxi: 5 },
  controls: ["fuel", "flow", "trip", "night"],
  presets: [
    {
      label: L("Local flight", "Vol local"),
      p: { fuel: 80, trip: 60, night: 0 },
    },
    {
      label: L("Long leg, day", "Longue étape, jour"),
      p: { fuel: 150, trip: 180, night: 0 },
    },
  ],
  note: L(
    "Build the fuel from the bottom: start-up and taxi, the trip at the planned flow, then the VFR reserve (30 minutes by day, 45 by night, at normal cruise). What is left is extra, for a diversion or a headwind. Change the flow (rich mixture, a climb, a stronger headwind) and watch the reserve get eaten first. Ask: if you land with less than the reserve, what went wrong in the plan?",
    "Construisez le carburant par le bas : mise en route et roulage, l’étape à la consommation prévue, puis la réserve VFR (30 minutes de jour, 45 de nuit, en croisière normale). Le reste est du supplément, pour un déroutement ou un vent de face. Changez la consommation (mélange riche, montée, vent de face plus fort) et regardez la réserve être entamée en premier. Demandez : si vous atterrissez sous la réserve, qu’est-ce qui n’allait pas dans la préparation ?",
  ),
  task: {
    prompt: L(
      "Find the least fuel for 2 h of flight by day at 35 L/h",
      "Trouvez le carburant minimum pour 2 h de vol de jour à 35 L/h",
    ),
    key: "fuel",
    // the prompt's figures are givens. Never below the legal minimum (taxi 5 + trip 70 + reserve 17.5 = 92.5 L,
    // Part-NCO.OP.125): one-sided, the reserve covered and less than 3 L more (93, 94 or 95 L in 1 L steps)
    givens: { flow: 35, trip: 120, night: 0, taxi: 5 },
    met: (p) => {
      const st = fuelPlan({
        fuelL: p.fuel,
        flowLph: p.flow,
        tripMin: p.trip,
        taxiL: p.taxi,
        night: Math.round(p.night) === 1,
      });
      return st.verdict === "ok" && p.fuel - st.requiredL < 3;
    },
    hides: ["required"],
  },
  view: { w: 1000, h: 600 },
  frame: { w: 1680, h: 736 },
  draw(p, cx) {
    const { c, lang } = cx;
    const st = fuelPlan({
      fuelL: p.fuel,
      flowLph: p.flow,
      tripMin: p.trip,
      taxiL: p.taxi,
      night: Math.round(p.night) === 1,
    });
    const s = new Svg();
    const x0 = 60;
    const x1 = 940;
    // ---------------------------------------------------------------- the fuel, litres
    const maxL = Math.max(USABLE_L, st.requiredL) * 1.02;
    const X = (l: number) => x0 + (Math.max(0, l) / maxL) * (x1 - x0);
    const y = 120;
    const h = 80;
    s.text(x0, y - 50, tr(L("Fuel (litres)", "Carburant (litres)"), lang), {
      size: 24,
      weight: 700,
      fill: c.text,
    });
    // the tank: usable capacity
    s.rect(X(0), y, X(USABLE_L) - X(0), h, {
      fill: "none",
      stroke: c.ruleStrong,
      "stroke-width": 2.5,
      rx: 10,
      "stroke-dasharray": "8 6",
    });
    s.text(
      X(USABLE_L),
      y - 12,
      `${tr(L("tanks", "réservoirs"), lang)} ${num(USABLE_L, 0, lang)} L`,
      { size: 20, fill: c.muted, anchor: "end" },
    );
    const segs: [number, number, string, string][] = [];
    let at = 0;
    const seg = (l: number, color: string, name: string) => {
      segs.push([at, at + l, color, name]);
      at += l;
    };
    seg(p.taxi, c.muted, tr(L("taxi", "roulage"), lang));
    seg(st.tripL, c.accent, tr(L("trip", "étape"), lang));
    seg(st.reserveL, c.key, tr(L("reserve", "réserve"), lang));
    for (const [a, b, color, name] of segs) {
      const shown = Math.min(b, p.fuel);
      if (shown > a)
        s.rect(X(a), y, X(shown) - X(a), h, {
          fill: color,
          "fill-opacity": 0.85,
        });
      if (b > p.fuel)
        s.rect(X(Math.max(a, p.fuel)), y, X(b) - X(Math.max(a, p.fuel)), h, {
          fill: "none",
          stroke: c.stop,
          "stroke-width": 3,
          "stroke-dasharray": "8 6",
        });
      if (X(b) - X(a) > 110)
        s.text((X(a) + X(b)) / 2, y + h / 2, name, {
          size: 22,
          weight: 700,
          fill: c.bg,
          anchor: "middle",
          mid: true,
        });
    }
    if (p.fuel > at) {
      s.rect(X(at), y, X(p.fuel) - X(at), h, {
        fill: c.nav,
        "fill-opacity": 0.75,
      });
      if (X(p.fuel) - X(at) > 90)
        s.text(
          (X(at) + X(p.fuel)) / 2,
          y + h / 2,
          tr(L("extra", "supplément"), lang),
          { size: 22, weight: 700, fill: c.bg, anchor: "middle", mid: true },
        );
    }
    // what is on board
    s.line(X(p.fuel), y - 18, X(p.fuel), y + h + 18, c.text, 4);
    s.text(
      X(p.fuel),
      y + h + 46,
      `${tr(L("on board", "à bord"), lang)} ${num(p.fuel, 0, lang)} L`,
      {
        size: 24,
        weight: 700,
        fill: c.text,
        anchor: X(p.fuel) > 820 ? "end" : "middle",
      },
    );
    if (st.requiredL > 0 && !hidden(cx, "required"))
      s.text(
        X(st.requiredL) + (st.requiredL < p.fuel ? -8 : 8),
        y - 12,
        `${tr(L("required", "nécessaire"), lang)} ${num(st.requiredL, 0, lang)} L`,
        {
          size: 20,
          weight: 700,
          fill: c.key,
          anchor: st.requiredL < p.fuel ? "end" : "start",
          halo: c.bg,
        },
      );
    // ---------------------------------------------------------------- the same in time
    const maxMin = Math.max(st.enduranceMin, p.trip + st.reserveMin, 60) * 1.05;
    const T = (m: number) => x0 + (Math.max(0, m) / maxMin) * (x1 - x0);
    const ty = 390;
    s.text(x0, ty - 70, tr(L("Time (hours)", "Temps (heures)"), lang), {
      size: 24,
      weight: 700,
      fill: c.text,
    });
    s.line(T(0), ty, T(maxMin), ty, c.ruleStrong, 3);
    for (let m = 0; m <= maxMin; m += 60) {
      s.line(T(m), ty - 8, T(m), ty + 8, c.ruleStrong, 3);
      s.text(T(m), ty + 36, `${m / 60} h`, {
        size: 22,
        fill: c.muted,
        anchor: "middle",
      });
    }
    s.rect(T(0), ty - 40, T(p.trip) - T(0), 26, {
      fill: c.accent,
      "fill-opacity": 0.85,
      rx: 6,
    });
    s.rect(T(p.trip), ty - 40, T(p.trip + st.reserveMin) - T(p.trip), 26, {
      fill: c.key,
      "fill-opacity": 0.85,
      rx: 6,
    });
    // the endurance
    const ex = T(st.enduranceMin);
    s.line(ex, ty - 60, ex, ty + 50, st.verdict === "ok" ? c.nav : c.stop, 4);
    s.text(
      ex,
      ty + 80,
      `${tr(L("dry tanks", "réservoirs secs"), lang)} ${FMT[lang].dur(st.enduranceMin)}`,
      {
        size: 22,
        weight: 700,
        fill: st.verdict === "ok" ? c.nav : c.stop,
        anchor: ex > 800 ? "end" : ex < 200 ? "start" : "middle",
      },
    );
    const verdict =
      st.verdict === "short"
        ? L(
            "Not enough fuel for the trip",
            "Pas assez de carburant pour l’étape",
          )
        : st.verdict === "reserve"
          ? L(
              "The reserve is eaten into: not legal",
              "La réserve est entamée : non réglementaire",
            )
          : L("Trip and reserve covered", "Étape et réserve couvertes");
    s.text(500, 560, tr(verdict, lang), {
      size: 28,
      weight: 700,
      fill: st.verdict === "ok" ? c.nav : c.stop,
      anchor: "middle",
    });
    return {
      svg: s.toString(),
      readouts: [
        ro(L("Endurance", "Autonomie"), FMT[lang].dur(st.enduranceMin)),
        ro(
          L("Fuel required", "Carburant nécessaire"),
          `${num(st.requiredL, 0, lang)} L`,
          "key",
          "required",
        ),
        ro(
          L("Left on landing", "Restant à l’arrivée"),
          `${num(Math.max(0, st.onLandingL), 0, lang)} L`,
          st.verdict === "ok" ? "ok" : "stop",
        ),
        ro(
          L("Reserve", "Réserve"),
          `${st.reserveMin} min · ${num(st.reserveL, 0, lang)} L`,
        ),
      ],
      say: `${tr(L("On board", "À bord"), lang)} ${num(p.fuel, 0, lang)} L${hidden(cx, "required") ? "" : `, ${tr(L("required", "nécessaire"), lang)} ${num(st.requiredL, 0, lang)} L`}: ${tr(verdict, lang)}.`,
    };
  },
};
