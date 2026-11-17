// Teaching tool « Hélice : pas fixe et pas variable »: the blade section at 75 % of the radius with its speeds (the
// rotation, the airspeed, the relative wind), the blade angle, the helix angle and the angle of attack between them,
// and how that angle moves with the airspeed for a fixed-pitch and a constant-speed propeller. Maths and sources:
// ../maths/prop.ts (FAA PHAK ch. 7; model figures stated there and on the tool).
import { PROP, propState } from "../maths/prop";
import { L, num, ro, Svg, tr, type ToolDef } from "../kit";
import { axes, plot } from "../plot";

export const propTool: ToolDef = {
  id: "prop",
  title: L(
    "Propeller: fixed and variable pitch",
    "Hélice : pas fixe et pas variable",
  ),
  blurb: L(
    "Blade angle, relative wind, the blade's angle of attack from take-off to cruise",
    "Calage, vent relatif, incidence de la pale du décollage à la croisière",
  ),
  subject: "PPL · ATPL 021",
  tags: [
    "hélice",
    "propeller",
    "pas variable",
    "constant speed",
    "pas fixe",
    "fixed pitch",
    "calage",
    "blade angle",
    "021",
    "moteur",
  ],
  params: [
    {
      key: "tas",
      label: L("Airspeed", "Vitesse"),
      min: 0,
      max: 160,
      step: 5,
      unit: "kt",
    },
    {
      key: "rpm",
      label: L("RPM", "Régime"),
      min: 1800,
      max: 2700,
      step: 50,
      unit: "tr/min",
    },
    {
      key: "mode",
      label: L("Propeller", "Hélice"),
      min: 0,
      max: 1,
      step: 1,
      choices: [
        L("Fixed pitch", "Pas fixe"),
        L("Constant speed", "Pas variable"),
      ],
    },
  ],
  defaults: { tas: 0, rpm: 2300, mode: 0 },
  controls: ["tas", "rpm", "mode"],
  presets: [
    { label: L("Brakes off", "Lâcher des freins"), p: { tas: 0, rpm: 2300 } },
    { label: L("Climb", "Montée"), p: { tas: 75, rpm: 2500 } },
    { label: L("Cruise", "Croisière"), p: { tas: 110, rpm: 2400 } },
    { label: L("Dive", "Piqué"), p: { tas: 155, rpm: 2400 } },
  ],
  sweep: { key: "tas", from: 0, to: 160, s: 9 },
  note: L(
    "The blade is a small wing turning in a circle: it meets a relative wind made of its own rotation and the aeroplane's speed. A fixed blade angle suits one speed only: brakes off it meets the air at a big angle (near its stall, poor thrust), in a dive at almost none (the engine over-speeds). A constant-speed propeller turns its blades so they keep a small angle of attack at the RPM the pilot selected: fine pitch for take-off, coarse for cruise. Ask: why full fine pitch before landing?",
    "La pale est une petite aile qui tourne : elle reçoit un vent relatif fait de sa rotation et de la vitesse de l’avion. Un calage fixe ne convient qu’à une vitesse : au lâcher des freins la pale attaque l’air sous un grand angle (près du décrochage, peu de traction), en piqué presque plus (le moteur s’emballe). Une hélice à pas variable tourne ses pales pour garder une petite incidence au régime choisi : petit pas au décollage, grand pas en croisière. Demandez : pourquoi plein petit pas avant l’atterrissage ?",
  ),
  view: { w: 1000, h: 600 },
  frame: { w: 1680, h: 736 },
  draw(p, cx) {
    const { c, lang } = cx;
    const variable = Math.round(p.mode) === 1;
    const st = propState(p.tas, p.rpm, variable);
    const s = new Svg();
    // ---------------------------------------------------------------- the blade section and its speeds
    // the plane of rotation is horizontal (the blade moves left), the aeroplane flies up the page
    const ox = 430;
    const oy = 330;
    const k = 1.9; // px per m/s
    const rot = st.rotMs * k;
    const v = p.tas * 0.514444 * k;
    s.line(40, oy, 640, oy, c.rule, 2, "8 8");
    s.text(40, oy + 64, tr(L("plane of rotation", "plan de rotation"), lang), {
      size: 20,
      fill: c.muted,
      anchor: "start",
    });
    // the relative wind on the blade: the rotation (from the left, it moves left) and the airspeed (from above)
    s.arrow(ox - rot, oy, ox, oy, c.muted, 4, 16);
    s.text(ox - rot / 2, oy + 30, tr(L("rotation", "rotation"), lang), {
      size: 20,
      fill: c.muted,
      anchor: "middle",
    });
    if (v > 4) {
      s.arrow(ox - rot, oy - v, ox - rot, oy, c.muted, 4, 16);
      s.text(ox - rot - 10, oy - v / 2, tr(L("airspeed", "vitesse"), lang), {
        size: 20,
        fill: c.muted,
        anchor: "end",
      });
    }
    s.arrow(ox - rot, oy - v, ox, oy, c.sel, 5, 20);
    s.text(
      ox - rot / 2 - 10,
      oy - v / 2 - 22,
      tr(L("relative wind", "vent relatif"), lang),
      { size: 22, weight: 700, fill: c.sel, halo: c.bg, anchor: "end" },
    );
    // the blade section: chord at β above the plane of rotation, leading edge to the left (into the rotation)
    const b = (st.beta * Math.PI) / 180;
    const ch = 180;
    const ux = -Math.cos(b);
    const uy = -Math.sin(b);
    const le: [number, number] = [ox + ux * ch * 0.25, oy + uy * ch * 0.25];
    const te: [number, number] = [ox - ux * ch * 0.75, oy - uy * ch * 0.75];
    const nx = -uy;
    const ny = ux;
    const prof: [number, number][] = [];
    for (let i = 0; i <= 20; i++) {
      const f = i / 20;
      const t =
        0.6 *
        0.12 *
        ch *
        (1.48 * Math.sqrt(f) -
          0.63 * f -
          1.76 * f * f +
          1.42 * f ** 3 -
          0.51 * f ** 4);
      prof.push([le[0] - ux * ch * f + nx * t, le[1] - uy * ch * f + ny * t]);
    }
    for (let i = 20; i >= 0; i--) {
      const f = i / 20;
      const t =
        0.25 *
        0.12 *
        ch *
        (1.48 * Math.sqrt(f) -
          0.63 * f -
          1.76 * f * f +
          1.42 * f ** 3 -
          0.51 * f ** 4);
      prof.push([le[0] - ux * ch * f - nx * t, le[1] - uy * ch * f - ny * t]);
    }
    const tone =
      st.state === "stalled"
        ? c.stop
        : st.state === "windmill"
          ? c.key
          : c.accent;
    s.poly(prof, { fill: c.surface, stroke: tone, "stroke-width": 4 });
    s.line(
      le[0] + ux * 60,
      le[1] + uy * 60,
      te[0] - ux * 40,
      te[1] - uy * 40,
      c.ruleStrong,
      2,
      "8 6",
    );
    // the angles at the leading edge side: β from the plane, φ of the relative wind, α between
    const arc = (
      r: number,
      a0: number,
      a1: number,
      color: string,
      label: string,
      dy: number,
    ) => {
      // drawn behind the pivot (trailing-edge side), clear of the speed vectors
      const p0: [number, number] = [
        ox + r * Math.cos(a0),
        oy + r * Math.sin(a0),
      ];
      const p1: [number, number] = [
        ox + r * Math.cos(a1),
        oy + r * Math.sin(a1),
      ];
      s.path(
        `M${p0[0]} ${p0[1]} A${r} ${r} 0 0 ${a1 > a0 ? 1 : 0} ${p1[0]} ${p1[1]}`,
        { stroke: color, "stroke-width": 4 },
      );
      s.text(
        ox + (r + 14) * Math.cos(a1),
        oy + (r + 14) * Math.sin(a1) + dy,
        label,
        { size: 24, weight: 700, fill: color, anchor: "start", halo: c.bg },
      );
    };
    const phi = (st.phi * Math.PI) / 180;
    // the relative wind carried on past the pivot, so its angle reads against the plane of rotation
    s.line(
      ox,
      oy,
      ox + 200 * Math.cos(phi),
      oy + 200 * Math.sin(phi),
      c.sel,
      2.5,
      "8 6",
    );
    // β and φ close together (cruise, a dive): β's label goes above its arc end, φ's below, never on each other
    const close = Math.abs(st.beta - st.phi) < 6;
    arc(150, 0, b, c.text, `β ${num(st.beta, 1, lang)}°`, close ? -8 : 8);
    if (st.phi > 0.5)
      arc(100, 0, phi, c.sel, `φ ${num(st.phi, 1, lang)}°`, close ? 34 : 8);
    s.text(40, 520, `α = β − φ = ${num(st.alpha, 1, lang)}°`, {
      size: 28,
      weight: 700,
      fill: tone,
    });
    // ---------------------------------------------------------------- α against the airspeed, both propellers
    const pl = plot(745, 70, 975, 440, [0, 160], [-5, 25]);
    axes(s, pl, c, {
      xTicks: [0, 80, 160],
      yTicks: [0, 5, 15, 25],
      yFmt: (y) => `${y}°`,
      xLabel: tr(L("airspeed (kt)", "vitesse (kt)"), lang),
      yLabel: tr(L("blade angle of attack α", "incidence de la pale α"), lang),
    });
    s.rect(
      pl.X(0),
      pl.Y(25),
      pl.X(160) - pl.X(0),
      pl.Y(PROP.stallAlpha) - pl.Y(25),
      { fill: c.stop, "fill-opacity": 0.1 },
    );
    s.text(pl.X(158), pl.Y(23), tr(L("blade stall", "pale décrochée"), lang), {
      size: 20,
      fill: c.stop,
      anchor: "end",
      weight: 600,
    });
    for (const vm of [false, true]) {
      const pts: [number, number][] = [];
      for (let t = 0; t <= 160; t += 4)
        pts.push([
          pl.X(t),
          pl.Y(Math.max(-5, Math.min(25, propState(t, p.rpm, vm).alpha))),
        ]);
      s.polyline(pts, {
        stroke: vm === variable ? c.accent : c.rule,
        "stroke-width": vm === variable ? 4 : 3,
      });
    }
    s.circle(pl.X(p.tas), pl.Y(Math.max(-5, Math.min(25, st.alpha))), 12, {
      fill: tone,
      stroke: c.bg,
      "stroke-width": 3,
    });
    s.text(
      pl.X(4),
      pl.Y(-3),
      tr(
        variable
          ? L("constant speed: α held", "pas variable : α constante")
          : L("fixed pitch: α falls", "pas fixe : α diminue"),
        lang,
      ),
      {
        size: 20,
        weight: 600,
        fill: c.accent,
      },
    );
    s.text(
      30,
      585,
      tr(
        L(
          `Model: Ø ${num(PROP.diameterM, 1, "en")} m, section at 75 % of the radius`,
          `Modèle : Ø ${num(PROP.diameterM, 1, "fr")} m, section à 75 % du rayon`,
        ),
        lang,
      ),
      {
        size: 20,
        fill: c.muted,
      },
    );
    const word =
      st.state === "stalled"
        ? L("Blade stalled: little thrust", "Pale décrochée : peu de traction")
        : st.state === "windmill"
          ? L(
              "Negative angle: the propeller is driven by the air",
              "Incidence négative : l’air entraîne l’hélice",
            )
          : L(
              "The blade works at a good angle",
              "La pale travaille sous une bonne incidence",
            );
    s.text(800, 520, tr(word, lang), {
      size: 22,
      weight: 700,
      fill: tone,
      anchor: "middle",
    });
    return {
      svg: s.toString(),
      readouts: [
        ro(L("Blade angle β", "Calage β"), `${num(st.beta, 1, lang)}°`),
        ro(
          L("Helix angle φ", "Angle d’hélice φ"),
          `${num(st.phi, 1, lang)}°`,
          "sel",
        ),
        ro(
          L("Angle of attack α", "Incidence α"),
          `${num(st.alpha, 1, lang)}°`,
          st.state === "working" ? "ok" : "stop",
        ),
        ro(L("Tip Mach", "Mach en bout de pale"), num(st.tipMach, 2, lang)),
      ],
      say: `${num(p.tas, 0, lang)} kt, ${num(p.rpm, 0, lang)} ${tr(L("RPM", "tr/min"), lang)}: β ${num(st.beta, 1, lang)}°, φ ${num(st.phi, 1, lang)}°, α ${num(st.alpha, 1, lang)}°. ${tr(word, lang)}.`,
    };
  },
};
