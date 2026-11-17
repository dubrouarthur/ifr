// Teaching tool « Mach et aile en flèche »: the speed of sound falling with the temperature as the aircraft climbs,
// the Mach number at the same true airspeed, and a swept wing seen from above: only the part of the flow square to
// the leading edge counts. Maths and sources: ../maths/atmos.ts (ICAO standard atmosphere, simple sweep theory).
import {
  isaTempC,
  machState,
  MCRIT_STRAIGHT,
  speedOfSoundKt,
} from "../maths/atmos";
import { L, num, ro, Svg, tr, type ToolDef } from "../kit";
import { axes, plot } from "../plot";

export const machTool: ToolDef = {
  id: "mach",
  title: L("Mach number and the swept wing", "Mach et aile en flèche"),
  blurb: L(
    "Speed of sound with altitude, Mach, and why airliners sweep their wings",
    "Vitesse du son et altitude, Mach, et pourquoi les ailes sont en flèche",
  ),
  subject: "ATPL 081",
  tags: [
    "mach",
    "flèche",
    "sweep",
    "swept wing",
    "vitesse du son",
    "speed of sound",
    "transsonique",
    "transonic",
    "081",
    "haute vitesse",
  ],
  params: [
    {
      key: "alt",
      label: L("Altitude", "Altitude"),
      min: 0,
      max: 45000,
      step: 1000,
      unit: "ft",
    },
    {
      key: "tas",
      label: L("True airspeed", "Vitesse propre"),
      min: 150,
      max: 600,
      step: 5,
      unit: "kt",
    },
    {
      key: "sweep",
      label: L("Sweep", "Flèche"),
      min: 0,
      max: 40,
      step: 1,
      unit: "°",
    },
  ],
  defaults: { alt: 37000, tas: 470, sweep: 25 },
  controls: ["alt", "tas", "sweep"],
  presets: [
    {
      label: L("Airliner cruise", "Croisière de ligne"),
      p: { alt: 37000, tas: 470, sweep: 25 },
    },
    {
      label: L("Straight wing", "Aile droite"),
      p: { alt: 37000, tas: 470, sweep: 0 },
    },
    {
      label: L("Same TAS low down", "Même vitesse en bas"),
      p: { alt: 5000, tas: 470, sweep: 25 },
    },
  ],
  sweep: { key: "alt", from: 0, to: 45000, s: 10 },
  note: L(
    "Climb at a constant true airspeed: the air gets colder, the speed of sound falls (661 kt at sea level, 574 kt above the tropopause) and the Mach number rises without going any faster. Over the wing the air goes faster still: somewhere it reaches Mach 1 and a shock wave forms (the critical Mach number). Sweep the wing: only the flow square to the leading edge counts, M × cos Λ, so the wing meets its critical Mach later. Ask: what does the sweep cost at low speed?",
    "Montez à vitesse propre constante : l’air se refroidit, la vitesse du son baisse (661 kt au niveau de la mer, 574 kt au-dessus de la tropopause) et le Mach augmente sans aller plus vite. Sur l’aile l’air va encore plus vite : quelque part il atteint Mach 1 et une onde de choc se forme (le Mach critique). Mettez de la flèche : seul l’écoulement perpendiculaire au bord d’attaque compte, M × cos Λ, l’aile atteint donc son Mach critique plus tard. Demandez : que coûte la flèche à basse vitesse ?",
  ),
  task: {
    prompt: L(
      "At FL 370 and 470 kt, find the least sweep that keeps M⊥ under 0.70",
      "À FL 370 et 470 kt, trouvez la plus petite flèche qui garde M⊥ sous 0,70",
    ),
    key: "sweep",
    target: 32,
    tol: 0.4,
  },
  view: { w: 1000, h: 600 },
  frame: { w: 1680, h: 736 },
  draw(p, cx) {
    const { c, lang } = cx;
    const st = machState(p.alt, p.tas, p.sweep);
    const s = new Svg();
    // ---------------------------------------------------------------- the swept wing from above (flow from the top)
    const rx = 270;
    const ry = 130;
    const L_ = (p.sweep * Math.PI) / 180;
    const span = 220;
    const chord = 90;
    const tip = (side: number): [number, number] => [
      rx + side * span,
      ry + span * Math.tan(L_),
    ];
    const [lx, ly] = tip(-1);
    const [rx2, ry2] = tip(1);
    const tone =
      st.verdict === "subsonic"
        ? c.accent
        : st.verdict === "transonic"
          ? c.key
          : c.stop;
    s.poly(
      [
        [rx, ry],
        [rx2, ry2],
        [rx2, ry2 + chord * 0.55],
        [rx, ry + chord],
        [lx, ly + chord * 0.55],
        [lx, ly],
      ],
      { fill: c.surface, stroke: tone, "stroke-width": 4 },
    );
    // the fuselage
    s.rect(rx - 18, ry - 90, 36, 330, {
      fill: c.surface,
      stroke: c.text,
      "stroke-width": 3,
      rx: 18,
    });
    // the free stream on the right wing and its two parts (square to the leading edge, along it)
    const mx = rx + span * 0.55;
    const my = ry + span * 0.55 * Math.tan(L_) - 6;
    const len = 150;
    s.arrow(mx, my - len, mx, my, c.sel, 5, 18);
    s.text(mx + 10, my - len - 4, `M ${num(st.mach, 2, lang)}`, {
      size: 24,
      weight: 700,
      fill: c.sel,
      halo: c.bg,
    });
    // normal to the leading edge: direction (sin Λ, cos Λ) rotated; the leading edge runs (cos Λ, sin Λ)
    const n: [number, number] = [-Math.sin(L_), Math.cos(L_)];
    const nl = len * Math.cos(L_);
    if (p.sweep > 1) {
      s.arrow(mx - n[0] * nl, my - n[1] * nl, mx, my, tone, 5, 18);
      s.text(
        mx - n[0] * nl - 12,
        my - n[1] * nl - 6,
        `M⊥ ${num(st.machNormal, 2, lang)}`,
        { size: 24, weight: 700, fill: tone, anchor: "end", halo: c.bg },
      );
    }
    s.text(rx, ry + 280, `Λ ${num(p.sweep, 0, lang)}°`, {
      size: 28,
      weight: 700,
      fill: c.key,
      anchor: "middle",
    });
    s.text(rx, 470, `M⊥ = M × cos Λ`, {
      size: 26,
      weight: 700,
      fill: c.text,
      anchor: "middle",
    });
    s.text(
      rx,
      505,
      `${tr(L("critical Mach", "Mach critique"), lang)} ≈ ${num(MCRIT_STRAIGHT, 2, lang)} / cos Λ`,
      { size: 22, fill: c.muted, anchor: "middle" },
    );
    // ---------------------------------------------------------------- the speed of sound against the altitude
    const pl = plot(600, 60, 970, 450, [560, 680], [0, 45000]);
    axes(s, pl, c, {
      xTicks: [580, 620, 660],
      yTicks: [0, 10000, 20000, 30000, 40000],
      yFmt: (v) => (v ? `FL ${v / 100}` : "0"),
      xLabel: tr(L("speed of sound (kt)", "vitesse du son (kt)"), lang),
      yLabel: tr(L("altitude", "altitude"), lang),
    });
    const pts: [number, number][] = [];
    for (let h = 0; h <= 45000; h += 1000)
      pts.push([pl.X(speedOfSoundKt(isaTempC(h))), pl.Y(h)]);
    s.polyline(pts, { stroke: c.accent, "stroke-width": 4 });
    s.line(pl.x0, pl.Y(36089), pl.x1, pl.Y(36089), c.rule, 2, "8 6");
    s.text(
      pl.x1 - 4,
      pl.Y(36089) - 10,
      tr(L("tropopause", "tropopause"), lang),
      { size: 20, fill: c.muted, anchor: "end" },
    );
    s.circle(pl.X(st.aKt), pl.Y(p.alt), 12, {
      fill: c.key,
      stroke: c.bg,
      "stroke-width": 3,
    });
    s.text(
      pl.X(st.aKt) + 16,
      pl.Y(p.alt) + 30,
      `${num(st.aKt, 0, lang)} kt · ${num(st.tempC, 0, lang)} °C`,
      { size: 22, weight: 700, fill: c.key, halo: c.bg },
    );
    const word =
      st.verdict === "subsonic"
        ? L(
            "Under the critical Mach: no shock",
            "Sous le Mach critique : pas d’onde de choc",
          )
        : st.verdict === "transonic"
          ? L(
              "Above the critical Mach: shock waves on the wing",
              "Au-delà du Mach critique : ondes de choc sur l’aile",
            )
          : L(
              "Supersonic flow square to the wing",
              "Écoulement supersonique perpendiculaire à l’aile",
            );
    s.text(500, 580, tr(word, lang), {
      size: 26,
      weight: 700,
      fill: tone,
      anchor: "middle",
    });
    return {
      svg: s.toString(),
      readouts: [
        ro(L("Speed of sound", "Vitesse du son"), `${num(st.aKt, 0, lang)} kt`),
        ro(L("Mach", "Mach"), num(st.mach, 2, lang), "key"),
        ro(
          L("Mach square to the wing", "Mach normal au bord d’attaque"),
          num(st.machNormal, 2, lang),
          st.verdict === "subsonic" ? "ok" : "stop",
        ),
        ro(L("Critical Mach", "Mach critique"), num(st.mcrit, 2, lang)),
      ],
      say: `M ${num(st.mach, 2, lang)}, ${tr(L("sweep", "flèche"), lang)} ${num(p.sweep, 0, lang)}°, M⊥ ${num(st.machNormal, 2, lang)}: ${tr(word, lang)}.`,
    };
  },
};
