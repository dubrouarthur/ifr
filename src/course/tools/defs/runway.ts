// Teaching tool « Décollage, atterrissage et altitude-densité »: the runway seen from the side (its surface, its
// slope, the wind), the distance to or from 15 m (50 ft) with every factor applied, the safety margin, and the runway
// available. Maths and sources: ../maths/perf.ts (UK CAA Safety Sense 7 factors, POH wind note, ISA, density altitude).
import { runwayPerf, SURFACES } from "../maths/perf";
import { L, num, ro, signed, Svg, tr, type ToolDef } from "../kit";

export const runwayTool: ToolDef = {
  id: "takeoff",
  title: L(
    "Take-off, landing and density altitude",
    "Décollage, atterrissage et altitude-densité",
  ),
  blurb: L(
    "Altitude, heat, wind, slope, grass: the distance and its margin",
    "Altitude, chaleur, vent, pente, herbe : la distance et sa marge",
  ),
  subject: "PPL · ATPL 032",
  tags: [
    "décollage",
    "atterrissage",
    "takeoff",
    "landing",
    "performance",
    "altitude densité",
    "density altitude",
    "piste",
    "runway",
    "herbe",
    "grass",
    "032",
  ],
  params: [
    {
      key: "mode",
      label: L("Phase", "Phase"),
      min: 0,
      max: 1,
      step: 1,
      choices: [L("Take-off", "Décollage"), L("Landing", "Atterrissage")],
    },
    {
      key: "elev",
      label: L("Aerodrome elevation", "Altitude du terrain"),
      min: 0,
      max: 6000,
      step: 100,
      unit: "ft",
    },
    {
      key: "oat",
      label: L("Temperature", "Température"),
      min: -10,
      max: 45,
      step: 1,
      unit: "°C",
    },
    {
      key: "wind",
      label: L("Wind (+ head, − tail)", "Vent (+ face, − arrière)"),
      min: -10,
      max: 25,
      step: 1,
      unit: "kt",
      signed: true,
    },
    {
      key: "surface",
      label: L("Surface", "Surface"),
      min: 0,
      max: 2,
      step: 1,
      choices: [
        L("Paved", "Dur"),
        L("Dry grass", "Herbe sèche"),
        L("Wet grass", "Herbe mouillée"),
      ],
    },
    {
      key: "slope",
      label: L("Slope (+ uphill)", "Pente (+ montante)"),
      min: -2,
      max: 2,
      step: 0.5,
      unit: "%",
      signed: true,
    },
    {
      key: "qnh",
      label: L("QNH", "QNH"),
      min: 980,
      max: 1040,
      step: 1,
      unit: "hPa",
    },
    {
      key: "base",
      label: L("Flight manual distance (15 m)", "Distance du manuel (15 m)"),
      min: 250,
      max: 900,
      step: 10,
      unit: "m",
    },
    {
      key: "runway",
      label: L("Runway available", "Piste disponible"),
      min: 400,
      max: 1600,
      step: 10,
      unit: "m",
    },
  ],
  defaults: {
    mode: 0,
    elev: 300,
    oat: 15,
    wind: 5,
    surface: 0,
    slope: 0,
    qnh: 1013,
    base: 500,
    runway: 900,
  },
  controls: ["mode", "elev", "oat", "wind", "surface"],
  presets: [
    {
      label: L("Summer, up high", "Été en altitude"),
      p: { elev: 3000, oat: 35, wind: 0, surface: 0 },
    },
    {
      label: L("Wet grass, tailwind", "Herbe mouillée, vent arrière"),
      p: { surface: 2, wind: -5 },
    },
    {
      label: L("Winter at the coast", "Hiver au bord de mer"),
      p: { elev: 0, oat: 2, wind: 15, surface: 0 },
    },
  ],
  sweep: { key: "oat", from: 0, to: 40, s: 8 },
  note: L(
    "Start from the flight manual's figure and add the day: altitude and heat thin the air (density altitude), a tailwind or wet grass stretch the run, an uphill slope too. The factors multiply. Then the safety factor (×1.33 take-off, ×1.43 landing, UK CAA Safety Sense 7). Ask: on a hot afternoon at a hill-top grass strip, would you go? What would you change: fuel, passengers, time of day?",
    "Partez du chiffre du manuel de vol et ajoutez la journée : l’altitude et la chaleur raréfient l’air (altitude-densité), un vent arrière ou l’herbe mouillée allongent la course, une pente montante aussi. Les facteurs se multiplient. Puis le coefficient de sécurité (×1,33 au décollage, ×1,43 à l’atterrissage, CAA Safety Sense 7). Demandez : un après-midi chaud sur une piste en herbe en altitude, vous partez ? Que changez-vous : carburant, passagers, heure ?",
  ),
  view: { w: 1000, h: 600 },
  frame: { w: 1680, h: 792 },
  draw(p, cx) {
    const { c, lang } = cx;
    const mode = Math.round(p.mode) === 1 ? "landing" : "takeoff";
    const surface = SURFACES[Math.round(p.surface)] ?? "paved";
    const st = runwayPerf({
      mode,
      elevFt: p.elev,
      qnh: p.qnh,
      oatC: p.oat,
      windKt: p.wind,
      slopePct: p.slope,
      surface,
      baseM: p.base,
      runwayM: p.runway,
    });
    const s = new Svg();
    // ---------------------------------------------------------------- the runway from the side
    const x0 = 60;
    const x1 = 940;
    const span = Math.max(p.runway, st.withSafetyM) * 1.04;
    const X = (m: number) => x0 + (m / span) * (x1 - x0);
    const gy = 250;
    // slope drawn × 8 so it shows (uphill in the direction of motion: the far end higher)
    const tilt = (-p.slope / 100) * 8;
    const Y = (m: number) => gy + (X(m) - x0) * tilt;
    const grass = surface !== "paved";
    s.poly(
      [
        [X(0), Y(0)],
        [X(p.runway), Y(p.runway)],
        [X(p.runway), Y(p.runway) + 22],
        [X(0), Y(0) + 22],
      ],
      {
        fill: grass ? c.nav : c.muted,
        "fill-opacity": grass ? (surface === "wetGrass" ? 0.55 : 0.35) : 0.5,
      },
    );
    if (!grass)
      for (let m = 30; m < p.runway - 30; m += 60)
        s.line(X(m), Y(m) + 11, X(m + 30), Y(m + 30) + 11, c.bg, 3);
    else
      for (let m = 15; m < p.runway; m += 45)
        s.path(
          `M${X(m)} ${Y(m)} l4 -12 M${X(m) + 8} ${Y(m)} l0 -14 M${X(m) + 16} ${Y(m)} l-4 -12`,
          { stroke: c.nav, "stroke-width": 2.5 },
        );
    if (surface === "wetGrass")
      for (let m = 40; m < p.runway; m += 90)
        s.circle(X(m), Y(m) + 34, 4, { fill: c.sel });
    // the path to (or from) 15 m: on the ground for about the first 55 %, then the climb (heights × 1.4)
    const d = st.distanceM;
    const h15 = 15 * 1.4 * ((x1 - x0) / span) * 0.7 + 40;
    const rollF = 0.55;
    const pts: [number, number][] = [];
    if (mode === "takeoff") {
      for (let k = 0; k <= 40; k++) {
        const m = (d * k) / 40;
        const f = m / d;
        const up = f <= rollF ? 0 : h15 * ((f - rollF) / (1 - rollF)) ** 1.6;
        pts.push([X(m), Y(m) - 6 - up]);
      }
    } else {
      for (let k = 0; k <= 40; k++) {
        const m = (d * k) / 40;
        const f = m / d;
        const down = f >= 1 - rollF ? 0 : h15 * (1 - f / (1 - rollF)) ** 1.4;
        pts.push([X(m), Y(m) - 6 - down]);
      }
    }
    const tone =
      st.verdict === "ok" ? c.accent : st.verdict === "tight" ? c.key : c.stop;
    s.polyline(pts, { stroke: tone, "stroke-width": 5 });
    // the 15 m screen
    const sx = mode === "takeoff" ? X(d) : X(0);
    const sy = mode === "takeoff" ? Y(d) : Y(0);
    s.line(sx, sy, sx, sy - h15 - 6, c.text, 3, "6 5");
    s.text(sx + (mode === "takeoff" ? 8 : -8), sy - h15 - 14, "15 m", {
      size: 22,
      weight: 700,
      fill: c.text,
      anchor: mode === "takeoff" ? "start" : "end",
      halo: c.bg,
    });
    // the runway end
    s.line(
      X(p.runway),
      Y(p.runway) - 70,
      X(p.runway),
      Y(p.runway) + 30,
      c.text,
      4,
    );
    s.text(
      X(p.runway) - 8,
      Y(p.runway) - 80,
      tr(L("end of runway", "fin de piste"), lang),
      { size: 22, fill: c.text, anchor: "end", weight: 600, halo: c.bg },
    );
    // the wind, top left
    const wk = p.wind;
    if (Math.abs(wk) >= 1) {
      const len = 40 + Math.min(25, Math.abs(wk)) * 4;
      const wy = 70;
      const head = wk > 0;
      s.arrow(
        head ? 60 + len : 60,
        wy,
        head ? 60 : 60 + len,
        wy,
        head ? c.nav : c.stop,
        6,
        18,
      );
      s.text(
        70 + len + 14,
        wy + 8,
        `${num(Math.abs(wk), 0, lang)} kt ${tr(head ? L("headwind", "de face") : L("tailwind", "arrière"), lang)}`,
        {
          size: 24,
          weight: 700,
          fill: head ? c.nav : c.stop,
        },
      );
    }
    s.text(
      940,
      70,
      `${tr(mode === "takeoff" ? L("Take-off →", "Décollage →") : L("Landing →", "Atterrissage →"), lang)}`,
      { size: 24, weight: 600, fill: c.muted, anchor: "end" },
    );
    // ---------------------------------------------------------------- the distances against the runway
    const by = 350;
    const bar = (
      y: number,
      m: number,
      label: string,
      color: string,
      filled: boolean,
    ) => {
      s.rect(
        X(0),
        y,
        X(m) - X(0),
        30,
        filled
          ? { fill: color, rx: 6 }
          : {
              fill: "none",
              stroke: color,
              "stroke-width": 3,
              rx: 6,
              "stroke-dasharray": "10 6",
            },
      );
      s.text(X(0) + 10, y - 10, label, {
        size: 22,
        weight: 600,
        fill: c.muted,
      });
      s.text(Math.min(X(m) + 10, 930), y + 23, `${num(m, 0, lang)} m`, {
        size: 24,
        weight: 700,
        fill: color,
        anchor: X(m) + 10 > 860 ? "end" : "start",
        halo: c.bg,
      });
    };
    bar(
      by,
      d,
      tr(
        L(
          "Distance with the day's factors",
          "Distance avec les facteurs du jour",
        ),
        lang,
      ),
      tone,
      true,
    );
    bar(
      by + 74,
      st.withSafetyM,
      tr(
        L(
          `With the safety factor ×${mode === "takeoff" ? "1.33" : "1.43"}`,
          `Avec la marge de sécurité ×${mode === "takeoff" ? "1,33" : "1,43"}`,
        ),
        lang,
      ),
      tone,
      false,
    );
    s.line(X(p.runway), by - 30, X(p.runway), by + 114, c.text, 4);
    s.text(
      X(p.runway),
      by + 142,
      `${tr(L("runway", "piste"), lang)} ${num(p.runway, 0, lang)} m`,
      { size: 22, weight: 700, fill: c.text, anchor: "middle", halo: c.bg },
    );
    // ---------------------------------------------------------------- the factors, multiplied
    const f = (x: number) => `×${num(x, 2, lang)}`;
    const parts: [string, number][] = [
      [tr(L("altitude", "altitude"), lang), st.altFactor],
      [tr(L("heat", "chaleur"), lang), st.tempFactor],
      [tr(L("wind", "vent"), lang), st.windFactor],
      [tr(L("surface", "surface"), lang), st.surfaceFactor],
      [tr(L("slope", "pente"), lang), st.slopeFactor],
    ];
    let x = 60;
    const fy = 560;
    for (const [name, v] of parts) {
      const col = v > 1.001 ? c.stop : v < 0.999 ? c.nav : c.muted;
      s.text(x, fy, f(v), { size: 26, weight: 700, fill: col });
      s.text(x, fy + 28, name, { size: 20, fill: c.muted });
      x += 150;
    }
    s.text(x + 10, fy, `= ${f(st.total)}`, {
      size: 28,
      weight: 700,
      fill: c.text,
    });
    const verdict =
      st.verdict === "short"
        ? L("The runway is too short", "La piste est trop courte")
        : st.verdict === "tight"
          ? L(
              "Fits, but inside the safety margin",
              "Ça passe, mais dans la marge de sécurité",
            )
          : L(
              "Fits with the safety margin",
              "Ça passe avec la marge de sécurité",
            );
    return {
      svg: s.toString(),
      readouts: [
        ro(
          L("Pressure altitude", "Altitude-pression"),
          `${num(st.pa, 0, lang)} ft`,
        ),
        ro(
          L("Density altitude", "Altitude-densité"),
          `${num(st.da, 0, lang)} ft`,
          st.da > 3000 ? "warn" : undefined,
        ),
        ro(L("ISA deviation", "Écart ISA"), `${signed(st.isaDev, 0, lang)} °C`),
        ro(
          L("Margin left", "Marge restante"),
          `${num(st.marginM, 0, lang)} m`,
          st.verdict === "ok" ? "ok" : "stop",
        ),
      ],
      say: `${tr(L("Distance", "Distance"), lang)} ${num(d, 0, lang)} m, ${tr(L("with the margin", "avec la marge"), lang)} ${num(st.withSafetyM, 0, lang)} m ${tr(L("for", "pour"), lang)} ${num(p.runway, 0, lang)} m: ${tr(verdict, lang)}.`,
    };
  },
};
