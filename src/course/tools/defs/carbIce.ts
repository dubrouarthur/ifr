// Teaching tool « Givrage carburateur »: the carburettor's venturi and throttle (ice where the air cools), and the
// day's temperature and humidity on the risk chart. Maths and sources: ../maths/met.ts (FAA PHAK ch. 7 thresholds,
// Magnus formula for the humidity).
import { CARB, carbIceRisk, dewPointAt } from "../maths/met";
import { L, num, ro, Svg, tr, type ToolDef } from "../kit";
import { axes, plot } from "../plot";

export const carbIceTool: ToolDef = {
  id: "carbIce",
  title: L("Carburettor icing", "Givrage carburateur"),
  blurb: L(
    "Temperature and dew point of the day: when ice forms in the venturi",
    "Température et point de rosée du jour : quand la glace se forme dans le venturi",
  ),
  subject: "PPL · ATPL 021 · 050",
  tags: [
    "givrage",
    "carburateur",
    "carburettor",
    "carburetor",
    "icing",
    "réchauffage",
    "carb heat",
    "humidité",
    "point de rosée",
    "021",
    "050",
  ],
  params: [
    {
      key: "t",
      label: L("Air temperature", "Température de l’air"),
      min: -10,
      max: 40,
      step: 1,
      unit: "°C",
    },
    {
      key: "td",
      label: L("Dew point", "Point de rosée"),
      min: -20,
      max: 40,
      step: 1,
      unit: "°C",
    },
    {
      key: "power",
      label: L("Power", "Puissance"),
      min: 0,
      max: 1,
      step: 1,
      choices: [
        L("Cruise", "Croisière"),
        L("Reduced (descent)", "Réduite (descente)"),
      ],
    },
  ],
  defaults: { t: 12, td: 9, power: 0 },
  controls: ["t", "td", "power"],
  presets: [
    { label: L("Damp morning 10/8", "Matin humide 10/8"), p: { t: 10, td: 8 } },
    { label: L("Summer 30/20", "Été 30/20"), p: { t: 30, td: 20 } },
    { label: L("Dry 30/5", "Sec 30/5"), p: { t: 30, td: 5 } },
    { label: L("Mist 5/5", "Brume 5/5"), p: { t: 5, td: 5 } },
  ],
  note: L(
    "Read the METAR's temperature and dew point (12/09) into the chart: close together means humid air, and between −7 °C and +21 °C humid air ices the carburettor at any power. The air speeds up in the venturi, its pressure and temperature drop, the fuel evaporates and cools it further: ice forms on the throttle valve. With the throttle closed (descent) the risk reaches warm days. Ask: why carb heat before reducing power, and why the rpm first drops when you pull it?",
    "Placez la température et le point de rosée du METAR (12/09) sur le diagramme : proches veut dire air humide, et entre −7 °C et +21 °C l’air humide givre le carburateur à toute puissance. L’air accélère dans le venturi, sa pression et sa température baissent, l’essence s’évapore et le refroidit encore : la glace se forme sur le papillon. Gaz réduits (descente), le risque s’étend aux journées chaudes. Demandez : pourquoi le réchauffage carburateur avant de réduire, et pourquoi le régime baisse d’abord quand on le tire ?",
  ),
  view: { w: 1000, h: 600 },
  frame: { w: 1680, h: 736 },
  draw(p, cx) {
    const { c, lang } = cx;
    const td = Math.min(p.td, p.t);
    const { rh, risk } = carbIceRisk(p.t, td);
    const reduced = Math.round(p.power) === 1;
    // the risk at this power: the reduced-power zone only matters with the throttle closed
    const live = risk === "serious" || (risk === "reducedPower" && reduced);
    const s = new Svg();
    // ---------------------------------------------------------------- the carburettor, cut open (air flows down)
    const cxv = 200;
    const top = 60;
    const bot = 470;
    const half = (y: number) => {
      const f = (y - top) / (bot - top);
      // the venturi: narrowest at 35 % of the height
      return 110 - 62 * Math.exp(-(((f - 0.35) / 0.18) ** 2));
    };
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (let y = top; y <= bot; y += 10) {
      left.push([cxv - half(y), y]);
      right.push([cxv + half(y), y]);
    }
    s.polyline(left, { stroke: c.text, "stroke-width": 5 });
    s.polyline(right, { stroke: c.text, "stroke-width": 5 });
    // air and fuel
    for (const dx of [-50, 0, 50])
      s.arrow(cxv + dx, top - 30, cxv + dx * 0.5, top + 60, c.sel, 3, 12);
    s.text(cxv, top - 40, tr(L("air", "air"), lang), {
      size: 22,
      fill: c.sel,
      anchor: "middle",
      weight: 600,
    });
    const vy = top + 0.35 * (bot - top);
    s.line(cxv - half(vy) - 70, vy, cxv - half(vy) + 6, vy, c.key, 4);
    s.text(cxv - half(vy) - 76, vy - 12, tr(L("fuel", "essence"), lang), {
      size: 22,
      fill: c.key,
      anchor: "end",
      weight: 600,
    });
    s.text(
      cxv + half(vy) + 16,
      vy + 8,
      tr(L("venturi: air cools", "venturi : l’air se refroidit"), lang),
      { size: 20, fill: c.muted },
    );
    // the throttle valve (butterfly): open in cruise, almost closed reduced
    const by = top + 0.72 * (bot - top);
    const ang = reduced ? 12 : 62;
    const bw = half(by) - 6;
    const a = (ang * Math.PI) / 180;
    s.line(
      cxv - bw * Math.cos(a),
      by + bw * Math.sin(a),
      cxv + bw * Math.cos(a),
      by - bw * Math.sin(a),
      c.text,
      7,
    );
    s.circle(cxv, by, 7, { fill: c.text });
    s.text(
      cxv + half(by) + 16,
      by + 8,
      tr(L("throttle valve", "papillon des gaz"), lang),
      { size: 20, fill: c.muted },
    );
    // the ice: on the walls at the venturi and on the valve
    if (live) {
      const n = risk === "serious" ? 9 : 5;
      for (let i = 0; i < n; i++) {
        const y = vy - 40 + i * 12;
        const w = half(y);
        s.poly(
          [
            [cxv - w + 2, y - 6],
            [cxv - w + 16 + (i % 3) * 5, y],
            [cxv - w + 2, y + 6],
          ],
          { fill: c.sel, "fill-opacity": 0.9 },
        );
        s.poly(
          [
            [cxv + w - 2, y - 6],
            [cxv + w - 16 - (i % 3) * 5, y],
            [cxv + w - 2, y + 6],
          ],
          { fill: c.sel, "fill-opacity": 0.9 },
        );
      }
      s.circle(
        cxv - bw * Math.cos(a) * 0.6,
        by + bw * Math.sin(a) * 0.6 - 8,
        9,
        { fill: c.sel, "fill-opacity": 0.9 },
      );
      s.circle(
        cxv + bw * Math.cos(a) * 0.5,
        by - bw * Math.sin(a) * 0.5 - 8,
        8,
        { fill: c.sel, "fill-opacity": 0.9 },
      );
      s.text(cxv, bot + 50, tr(L("ice", "glace"), lang), {
        size: 26,
        weight: 700,
        fill: c.sel,
        anchor: "middle",
      });
    }
    s.text(cxv, bot + 20, tr(L("to the engine ↓", "vers le moteur ↓"), lang), {
      size: 20,
      fill: c.muted,
      anchor: "middle",
    });
    // ---------------------------------------------------------------- the chart: temperature × relative humidity
    const pl = plot(520, 60, 970, 470, [-10, 40], [0, 100]);
    // the zones: PHAK thresholds; serious at any power, or with the throttle closed up to 38 °C and 50 % (CAA SS14)
    const zone = (
      t0: number,
      t1: number,
      h0: number,
      color: string,
      op: number,
    ) =>
      s.rect(pl.X(t0), pl.Y(100), pl.X(t1) - pl.X(t0), pl.Y(h0) - pl.Y(100), {
        fill: color,
        "fill-opacity": op,
      });
    zone(
      CARB.seriousLoC,
      CARB.warmHiC,
      CARB.warmRh,
      c.key,
      reduced ? 0.3 : 0.12,
    );
    zone(CARB.seriousLoC, CARB.seriousHiC, CARB.seriousRh, c.stop, 0.35);
    axes(s, pl, c, {
      xTicks: [-10, 0, 10, 20, 30, 40],
      yTicks: [0, 50, 80, 100],
      xFmt: (v) => `${v}`.replace("-", "−"),
      yFmt: (v) => `${v} %`,
      xLabel: tr(L("air temperature (°C)", "température de l’air (°C)"), lang),
      yLabel: tr(L("relative humidity", "humidité relative"), lang),
    });
    s.text(
      pl.X(7),
      pl.Y(91),
      tr(L("serious, any power", "fort, toute puissance"), lang),
      { size: 20, weight: 700, fill: c.stop, anchor: "middle", halo: c.bg },
    );
    s.text(
      pl.X(29.5),
      pl.Y(64),
      tr(L("throttle closed", "gaz réduits"), lang),
      { size: 20, weight: 700, fill: c.key, anchor: "middle", halo: c.bg },
    );
    // the day
    const px = pl.X(Math.max(-10, Math.min(40, p.t)));
    const py = pl.Y(rh);
    s.circle(px, py, 14, {
      fill: live ? c.stop : c.nav,
      stroke: c.bg,
      "stroke-width": 4,
    });
    // the day's label beside its point, never on the axis title or the zone's name (at 91 %): level with the
    // point at the very top, under it just below the name, above it elsewhere; on its left near the right edge
    const nameY = pl.Y(91);
    const dy =
      rh >= 95 ? 8 : Math.abs(py - nameY) < 44 && py > nameY ? 36 : -14;
    const onRight = px > pl.X(30);
    s.text(
      px + (onRight ? -18 : 18),
      py + dy,
      `${num(p.t, 0, lang)}/${num(td, 0, lang)}`,
      {
        size: 24,
        weight: 700,
        fill: c.text,
        halo: c.bg,
        anchor: onRight ? "end" : "start",
      },
    );
    const word =
      risk === "serious"
        ? L(
            "Serious icing risk at any power",
            "Risque de givrage fort à toute puissance",
          )
        : risk === "reducedPower"
          ? reduced
            ? L(
                "Icing risk with the throttle closed",
                "Risque de givrage gaz réduits",
              )
            : L("Risk once power is reduced", "Risque dès que l’on réduit")
          : L("Low risk (keep checking)", "Risque faible (restez vigilant)");
    s.text(pl.X(15), 570, tr(word, lang), {
      size: 26,
      weight: 700,
      fill: live ? c.stop : risk === "reducedPower" ? c.key : c.nav,
      anchor: "middle",
    });
    void dewPointAt;
    return {
      svg: s.toString(),
      readouts: [
        ro(
          L("Relative humidity", "Humidité relative"),
          `${num(rh, 0, lang)} %`,
          rh >= 80 ? "warn" : undefined,
        ),
        ro(L("Spread T − Td", "Écart T − Td"), `${num(p.t - td, 0, lang)} °C`),
        ro(
          L("Risk", "Risque"),
          tr(
            risk === "serious"
              ? L("serious", "fort")
              : risk === "reducedPower"
                ? L("reduced power", "gaz réduits")
                : L("low", "faible"),
            lang,
          ),
          live ? "stop" : risk === "reducedPower" ? "warn" : "ok",
        ),
      ],
      say: `${num(p.t, 0, lang)} °C, ${tr(L("dew point", "point de rosée"), lang)} ${num(td, 0, lang)} °C, ${tr(L("humidity", "humidité"), lang)} ${num(rh, 0, lang)} %: ${tr(word, lang)}.`,
    };
  },
};
