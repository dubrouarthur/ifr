// Teaching tool « Fronts et nuages »: a cross-section of a warm or a cold front moving towards an observer, the
// frontal surface (vertical scale greatly exaggerated), the clouds and the precipitation, and what the observer sees
// overhead as the front comes and goes. Maths and sources: ../maths/met.ts (Met Office "Fronts", FAA-H-8083-28).
import {
  frontHeightFt,
  frontSky,
  type CloudKey,
  type FrontKind,
} from "../maths/met";
import { L, ro, Svg, tr, type ToolDef } from "../kit";

const CLOUD_NAME: Record<CloudKey, { en: string; fr: string }> = {
  Ci: { en: "cirrus", fr: "cirrus" },
  Cs: { en: "cirrostratus", fr: "cirrostratus" },
  As: { en: "altostratus", fr: "altostratus" },
  Ns: { en: "nimbostratus", fr: "nimbostratus" },
  St: { en: "stratus", fr: "stratus" },
  Sc: { en: "stratocumulus", fr: "stratocumulus" },
  Cb: { en: "cumulonimbus", fr: "cumulonimbus" },
  Cu: { en: "cumulus", fr: "cumulus" },
};

export const frontsTool: ToolDef = {
  id: "fronts",
  title: L("Fronts and clouds", "Fronts et nuages"),
  blurb: L(
    "A warm or a cold front passes: the cloud sequence, rain, wind and pressure",
    "Un front chaud ou froid passe : la suite des nuages, la pluie, le vent, la pression",
  ),
  subject: "PPL · ATPL 050",
  tags: [
    "front",
    "fronts",
    "nuages",
    "clouds",
    "météo",
    "meteorology",
    "chaud",
    "froid",
    "warm",
    "cold",
    "050",
    "cumulonimbus",
  ],
  params: [
    {
      key: "kind",
      label: L("Front", "Front"),
      min: 0,
      max: 1,
      step: 1,
      choices: [L("Warm", "Chaud"), L("Cold", "Froid")],
    },
    {
      key: "dist",
      label: L("Front still to come", "Front encore à venir"),
      min: -300,
      max: 1000,
      step: 25,
      unit: "km",
    },
  ],
  defaults: { kind: 0, dist: 450 },
  controls: ["kind", "dist"],
  presets: [
    {
      label: L("Cirrus arrive", "Les cirrus arrivent"),
      p: { kind: 0, dist: 800 },
    },
    { label: L("Rain belt", "Zone de pluie"), p: { kind: 0, dist: 100 } },
    {
      label: L("Cold front passing", "Passage du front froid"),
      p: { kind: 1, dist: 0 },
    },
  ],
  sweep: { key: "dist", from: 1000, to: -300, s: 12 },
  note: L(
    "Let the warm front come to you: first cirrus a day ahead, then the sky thickens (cirrostratus, the halo round the sun), lowers (altostratus) and the rain starts under nimbostratus, long and steady; behind the front, low stratus and drizzle in the warm sector. Then switch to a cold front: steep, fast, a narrow line of cumulonimbus with heavy showers and gusts, then clearing and showers in cold air. Ask: which is the worse for a VFR pilot, and why?",
    "Laissez venir le front chaud : d’abord des cirrus un jour à l’avance, puis le ciel s’épaissit (cirrostratus, le halo autour du soleil), s’abaisse (altostratus), et la pluie commence sous le nimbostratus, longue et continue ; derrière le front, stratus bas et bruine dans le secteur chaud. Puis passez au front froid : pentu, rapide, une ligne étroite de cumulonimbus avec averses fortes et rafales, puis éclaircies et averses dans l’air froid. Demandez : lequel est le pire pour un pilote VFR, et pourquoi ?",
  ),
  view: { w: 1000, h: 600 },
  frame: { w: 1680, h: 736 },
  draw(p, cx) {
    const { c, lang } = cx;
    const kind: FrontKind = Math.round(p.kind) === 1 ? "cold" : "warm";
    const s = new Svg();
    // the section: the front at x = 0, moving right towards the observer, who is `dist` km ahead of it
    const xr: [number, number] = kind === "warm" ? [-350, 1100] : [-500, 600];
    const x0 = 30;
    const x1 = 970;
    const X = (km: number) => x0 + ((km - xr[0]) / (xr[1] - xr[0])) * (x1 - x0);
    const gy = 470;
    const Y = (ft: number) => gy - (ft / 40000) * 400;
    // the ground
    s.line(x0, gy, x1, gy, c.text, 4);
    // the cold air mass (under the frontal surface)
    const surf: [number, number][] = [];
    for (let km = xr[0]; km <= xr[1]; km += 10)
      surf.push([X(km), Y(Math.min(40000, frontHeightFt(kind, km)))]);
    const cold: [number, number][] =
      kind === "warm"
        ? [[X(0), gy], ...surf.filter(([x]) => x >= X(0)), [X(xr[1]), gy]]
        : [[X(xr[0]), gy], ...surf.filter(([x]) => x <= X(0)), [X(0), gy]];
    s.poly(cold, { fill: c.sel, "fill-opacity": 0.12 });
    s.polyline(
      kind === "warm"
        ? surf.filter(([x]) => x >= X(0))
        : surf.filter(([x]) => x <= X(0)),
      { stroke: kind === "warm" ? c.stop : c.accent, "stroke-width": 5 },
    );
    s.text(
      kind === "warm" ? X(xr[1]) - 10 : X(xr[0]) + 10,
      kind === "warm" ? gy - 20 : Y(9000),
      tr(L("cold air", "air froid"), lang),
      {
        size: 24,
        weight: 700,
        fill: c.sel,
        anchor: kind === "warm" ? "end" : "start",
      },
    );
    s.text(
      kind === "warm" ? X(xr[0]) + 10 : X(xr[1]) - 10,
      Y(9000),
      tr(L("warm air", "air chaud"), lang),
      {
        size: 24,
        weight: 700,
        fill: c.stop,
        anchor: kind === "warm" ? "start" : "end",
      },
    );
    // the clouds
    const sheet = (
      k0: number,
      k1: number,
      ftLo: number,
      ftHi: number,
      op: number,
      label: string,
    ) => {
      s.rect(X(k0), Y(ftHi), X(k1) - X(k0), Y(ftLo) - Y(ftHi), {
        fill: c.muted,
        "fill-opacity": op,
        rx: 18,
      });
      s.text((X(k0) + X(k1)) / 2, (Y(ftLo) + Y(ftHi)) / 2, label, {
        size: 22,
        weight: 700,
        fill: c.text,
        anchor: "middle",
        mid: true,
        halo: c.bg,
      });
    };
    const rain = (k0: number, k1: number, ftTop: number, heavy: boolean) => {
      for (let km = k0; km < k1; km += heavy ? 12 : 22)
        s.line(X(km), Y(ftTop), X(km) - 8, gy - 4, c.sel, heavy ? 3 : 2);
    };
    if (kind === "warm") {
      // cirrus: wisps high up
      for (let km = 620; km < 1060; km += 70)
        s.path(`M${X(km)} ${Y(31000)} q20 -10 40 -2 q10 4 18 -10`, {
          stroke: c.muted,
          "stroke-width": 3,
        });
      s.text(X(840), Y(33500), "Ci", {
        size: 24,
        weight: 700,
        fill: c.text,
        anchor: "middle",
      });
      sheet(300, 620, 23000, 27000, 0.25, "Cs");
      sheet(150, 330, 10000, 20000, 0.35, "As");
      rain(10, 280, 2500, false);
      sheet(0, 170, 2000, 16000, 0.55, "Ns");
      sheet(-330, 0, 800, 3500, 0.4, "St · Sc");
      rain(-320, -10, 900, false);
    } else {
      // the cumulonimbus at the front, its anvil leaning ahead
      s.path(
        `M${X(-70)} ${Y(1500)} L${X(-80)} ${Y(20000)} Q${X(-60)} ${Y(33000)} ${X(-10)} ${Y(35000)} L${X(160)} ${Y(36500)} L${X(40)} ${Y(32000)} Q${X(50)} ${Y(18000)} ${X(40)} ${Y(1500)} Z`,
        {
          fill: c.muted,
          "fill-opacity": 0.55,
        },
      );
      s.text(X(-15), Y(18000), "Cb", {
        size: 28,
        weight: 700,
        fill: c.text,
        anchor: "middle",
        halo: c.bg,
      });
      rain(-65, 35, 1500, true);
      sheet(60, 580, 800, 3500, 0.4, "St · Sc");
      for (const km of [-200, -310, -420]) {
        s.path(
          `M${X(km) - 34} ${Y(2500)} q8 -26 30 -20 q14 -22 34 -4 q18 -4 18 24 Z`,
          { fill: c.muted, "fill-opacity": 0.4 },
        );
        rain(km - 6, km + 10, 2500, false);
      }
      s.text(X(-310), Y(7000), "Cu", {
        size: 22,
        weight: 700,
        fill: c.text,
        anchor: "middle",
      });
    }
    // the front's motion
    s.arrow(
      X(0) - 70,
      gy + 40,
      X(0) + 70,
      gy + 40,
      kind === "warm" ? c.stop : c.accent,
      5,
      16,
    );
    s.text(
      X(0),
      gy + 76,
      tr(
        kind === "warm"
          ? L("warm front", "front chaud")
          : L("cold front", "front froid"),
        lang,
      ),
      {
        size: 22,
        weight: 700,
        fill: kind === "warm" ? c.stop : c.accent,
        anchor: "middle",
      },
    );
    // the observer
    const ox = X(Math.max(xr[0], Math.min(xr[1], p.dist)));
    s.line(ox, gy, ox, Y(38000), c.key, 2.5, "8 6");
    s.poly(
      [
        [ox, gy - 2],
        [ox - 14, gy + 24],
        [ox + 14, gy + 24],
      ],
      { fill: c.key },
    );
    s.text(ox, Y(38500), tr(L("you", "vous"), lang), {
      size: 24,
      weight: 700,
      fill: c.key,
      anchor: "middle",
      halo: c.bg,
    });
    s.text(
      x1,
      Y(40000) - 8,
      tr(
        L(
          "vertical scale greatly exaggerated",
          "échelle verticale très exagérée",
        ),
        lang,
      ),
      { size: 20, fill: c.muted, anchor: "end" },
    );
    const sky = frontSky(kind, p.dist);
    const clouds = sky.clouds.length
      ? sky.clouds
          .map((k) => (lang === "fr" ? CLOUD_NAME[k].fr : CLOUD_NAME[k].en))
          .join(", ")
      : tr(L("clear", "dégagé"), lang);
    const precip = tr(
      {
        none: L("none", "aucune"),
        rain: L("steady rain", "pluie continue"),
        heavyShowers: L("heavy showers", "fortes averses"),
        showers: L("showers", "averses"),
        drizzle: L("drizzle", "bruine"),
      }[sky.precip],
      lang,
    );
    const pres = tr(
      {
        falling: L("falling", "en baisse"),
        steady: L("steady", "stable"),
        rising: L("rising", "en hausse"),
      }[sky.pressure],
      lang,
    );
    const temp = tr(
      {
        falling: L("falling", "en baisse"),
        steady: L("steady", "stable"),
        rising: L("rising", "en hausse"),
      }[sky.temp],
      lang,
    );
    s.text(
      500,
      585,
      `${tr(L("Overhead:", "Au-dessus de vous :"), lang)} ${clouds}`,
      { size: 26, weight: 700, fill: c.text, anchor: "middle" },
    );
    return {
      svg: s.toString(),
      readouts: [
        ro(
          L("Precipitation", "Précipitations"),
          precip,
          sky.precip === "heavyShowers"
            ? "stop"
            : sky.precip === "none"
              ? undefined
              : "sel",
        ),
        ro(L("Pressure", "Pression"), pres),
        ro(L("Temperature", "Température"), temp),
        ro(
          L("Wind", "Vent"),
          sky.veer
            ? tr(L("has veered", "a viré à droite"), lang)
            : tr(L("backs and freshens", "recule et forcit"), lang),
        ),
      ],
      say: `${tr(kind === "warm" ? L("Warm front", "Front chaud") : L("Cold front", "Front froid"), lang)}: ${clouds}, ${precip}, ${tr(L("pressure", "pression"), lang)} ${pres}.`,
    };
  },
};
