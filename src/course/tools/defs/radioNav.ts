// Teaching tool « VOR et ADF »: the station seen from above with the aircraft on its radial, the selected course and
// its TO / FROM halves, and the two instruments (the VOR indicator, the ADF). Maths and sources: ../maths/radio.ts
// (FAA Instrument Flying Handbook ch. 9).
import { radioState, VOR_DEG_PER_DOT, wrap360 } from "../maths/radio";
import { hdg, L, ro, Svg, tr, type ToolDef } from "../kit";

export const radioNavTool: ToolDef = {
  id: "radioNav",
  title: L("VOR and ADF", "VOR et ADF"),
  blurb: L(
    "Radial, QDM / QDR, TO / FROM, the needle and the ADF bearing",
    "Radial, QDM / QDR, TO / FROM, l’aiguille et le gisement ADF",
  ),
  subject: "PPL · ATPL 062",
  tags: [
    "vor",
    "adf",
    "ndb",
    "radial",
    "qdm",
    "qdr",
    "to from",
    "obs",
    "cdi",
    "gisement",
    "radionavigation",
    "062",
  ],
  params: [
    {
      key: "radial",
      label: L("Aircraft on radial", "Avion sur le radial"),
      min: 0,
      max: 359,
      step: 1,
      heading: true,
      wrap: true,
    },
    {
      key: "obs",
      label: L("OBS course", "Route affichée (OBS)"),
      min: 0,
      max: 359,
      step: 1,
      heading: true,
      wrap: true,
    },
    {
      key: "hdg",
      label: L("Heading", "Cap"),
      min: 0,
      max: 359,
      step: 1,
      heading: true,
      wrap: true,
    },
  ],
  defaults: { radial: 120, obs: 270, hdg: 330 },
  controls: ["radial", "obs", "hdg"],
  presets: [
    {
      label: L("Inbound, centred", "En rapprochement, centré"),
      p: { radial: 120, obs: 300, hdg: 300 },
    },
    {
      label: L("Outbound, centred", "En éloignement, centré"),
      p: { radial: 120, obs: 120, hdg: 120 },
    },
    {
      label: L("Reverse sensing", "Indication inversée"),
      p: { radial: 120, obs: 300, hdg: 120 },
    },
  ],
  sweep: { key: "radial", from: 0, to: 359, s: 14 },
  note: L(
    "Move the aircraft round the station: the radial is where you are FROM the station, the QDM the way TO it, 180° apart. The VOR indicator does not care about the heading: turn the aircraft, nothing moves; only the OBS and your position count. The ADF does care: its needle points at the station relative to the nose. Ask: on radial 120 with 300 set, why is the needle centred with a TO flag, and what happens if you fly heading 120?",
    "Déplacez l’avion autour de la station : le radial dit où vous êtes PAR RAPPORT à la station (QDR), le QDM la route POUR y aller, à 180° l’un de l’autre. L’indicateur VOR ignore le cap : tournez l’avion, rien ne bouge ; seuls l’OBS et votre position comptent. L’ADF, lui, dépend du cap : son aiguille montre la station par rapport au nez. Demandez : sur le radial 120 avec 300 affiché, pourquoi l’aiguille est-elle centrée avec TO, et que se passe-t-il au cap 120 ?",
  ),
  task: {
    prompt: L(
      "Set the OBS to fly to the station: needle centred, TO",
      "Affichez l’OBS pour rejoindre la station : aiguille centrée, TO",
    ),
    key: "obs",
    target: 300,
    tol: 1,
  },
  view: { w: 1000, h: 600 },
  frame: { w: 1680, h: 768 },
  draw(p, cx) {
    const { c, lang } = cx;
    const st = radioState(p.radial, p.obs, p.hdg);
    const s = new Svg();
    // ---------------------------------------------------------------- the station from above, north up
    const sx = 270;
    const sy = 300;
    const R = 220;
    const dir = (b: number, r: number): [number, number] => [
      sx + r * Math.sin((b * Math.PI) / 180),
      sy - r * Math.cos((b * Math.PI) / 180),
    ];
    // the FROM half (in front of the line square to the course, on the course's side) and the TO half
    const o = p.obs;
    const a1 = dir(o - 90, R);
    const a2 = dir(o + 90, R);
    s.path(`M${a1[0]} ${a1[1]} A${R} ${R} 0 0 1 ${a2[0]} ${a2[1]} Z`, {
      fill: c.key,
      "fill-opacity": 0.1,
      stroke: "none",
    });
    s.path(`M${a2[0]} ${a2[1]} A${R} ${R} 0 0 1 ${a1[0]} ${a1[1]} Z`, {
      fill: c.sel,
      "fill-opacity": 0.08,
      stroke: "none",
    });
    const [fx, fy] = dir(o, R * 0.62);
    const [tx2, ty2] = dir(o + 180, R * 0.62);
    s.text(fx, fy, "FROM", {
      size: 22,
      weight: 700,
      fill: c.key,
      anchor: "middle",
      mid: true,
      halo: c.bg,
    });
    s.text(tx2, ty2, "TO", {
      size: 22,
      weight: 700,
      fill: c.sel,
      anchor: "middle",
      mid: true,
      halo: c.bg,
    });
    // the compass rose
    s.circle(sx, sy, R, {
      fill: "none",
      stroke: c.ruleStrong,
      "stroke-width": 2.5,
    });
    for (let b = 0; b < 360; b += 10) {
      const [ax, ay] = dir(b, R);
      const [bx, by] = dir(b, R - (b % 30 === 0 ? 18 : 9));
      s.line(ax, ay, bx, by, c.ruleStrong, 2);
      if (b % 30 === 0) {
        const [lx, ly] = dir(b, R + 22);
        s.text(lx, ly, b === 0 ? "N" : String(b / 10), {
          size: 22,
          weight: 600,
          fill: c.muted,
          anchor: "middle",
          mid: true,
        });
      }
    }
    // the selected course through the station
    const [c1x, c1y] = dir(o + 180, R);
    const [c2x, c2y] = dir(o, R);
    s.line(c1x, c1y, c2x, c2y, c.path, 4);
    const [hx, hy] = dir(o, R * 0.3);
    s.arrow(sx, sy, hx, hy, c.path, 4, 18);
    // the radial the aircraft is on
    const [ax, ay] = dir(p.radial, 160);
    s.line(sx, sy, ax, ay, c.text, 2.5, "8 6");
    // the station
    s.poly(
      [0, 60, 120, 180, 240, 300].map((k) => dir(k, 14)),
      { fill: c.bg, stroke: c.text, "stroke-width": 3 },
    );
    s.circle(sx, sy, 3.5, { fill: c.text });
    // the aircraft, pointing along its heading
    const h = (p.hdg * Math.PI) / 180;
    const rot = (dx: number, dy: number): [number, number] => [
      ax + dx * Math.cos(h) - dy * Math.sin(h),
      ay + dx * Math.sin(h) + dy * Math.cos(h),
    ];
    s.poly(
      [
        rot(0, -24),
        rot(20, 6),
        rot(5, 2),
        rot(4, 16),
        rot(-4, 16),
        rot(-5, 2),
        rot(-20, 6),
      ],
      { fill: c.accent },
    );
    s.text(ax + 26, ay + 30, `R-${hdg(st.radial)}`, {
      size: 22,
      weight: 700,
      fill: c.text,
      halo: c.bg,
    });
    // ---------------------------------------------------------------- the VOR indicator
    const vx = 655;
    const vy = 220;
    const vr = 108;
    s.circle(vx, vy, vr, {
      fill: c.surface,
      stroke: c.text,
      "stroke-width": 4,
    });
    s.text(vx, vy - vr + 34, hdg(o), {
      size: 28,
      weight: 700,
      fill: c.path,
      anchor: "middle",
    });
    for (let d = -5; d <= 5; d++)
      if (d) s.circle(vx + d * 16, vy + 10, 4, { fill: c.muted });
    s.circle(vx, vy + 10, 9, {
      fill: "none",
      stroke: c.muted,
      "stroke-width": 2.5,
    });
    const nx = vx + st.dots * 16;
    s.line(nx, vy - 62, nx, vy + 74, st.centred ? c.nav : c.text, 6);
    s.text(vx, vy + 58, st.flag, {
      size: 24,
      weight: 700,
      fill: st.flag === "TO" ? c.sel : c.key,
      anchor: "middle",
    });
    s.text(vx, vy + vr + 34, tr(L("VOR indicator", "Indicateur VOR"), lang), {
      size: 22,
      weight: 600,
      fill: c.muted,
      anchor: "middle",
    });
    // ---------------------------------------------------------------- the ADF (fixed card, 0 at the nose)
    const dx = 885;
    const dr = 98;
    s.circle(dx, vy, dr, {
      fill: c.surface,
      stroke: c.text,
      "stroke-width": 4,
    });
    for (let b = 0; b < 360; b += 30) {
      const t = (b * Math.PI) / 180;
      s.line(
        dx + (dr - 14) * Math.sin(t),
        vy - (dr - 14) * Math.cos(t),
        dx + dr * Math.sin(t),
        vy - dr * Math.cos(t),
        c.ruleStrong,
        2.5,
      );
      if (b % 90 === 0)
        s.text(
          dx + (dr - 30) * Math.sin(t),
          vy - (dr - 30) * Math.cos(t),
          String(b / 10),
          { size: 20, fill: c.muted, anchor: "middle", mid: true },
        );
    }
    const rb = (st.rb * Math.PI) / 180;
    s.arrow(
      dx - (dr - 24) * Math.sin(rb),
      vy + (dr - 24) * Math.cos(rb),
      dx + (dr - 16) * Math.sin(rb),
      vy - (dr - 16) * Math.cos(rb),
      c.key,
      6,
      20,
    );
    s.text(dx, vy + vr + 34, "ADF", {
      size: 22,
      weight: 600,
      fill: c.muted,
      anchor: "middle",
    });
    // the rules
    s.text(770, 440, `QDM = QDR ± 180 = ${hdg(st.qdm)}°`, {
      size: 26,
      weight: 700,
      fill: c.text,
      anchor: "middle",
    });
    s.text(
      770,
      480,
      `${tr(L("MB = MH + RB", "QDM = Cm + G"), lang)} = ${hdg(wrap360(p.hdg + st.rb))}°`,
      { size: 24, fill: c.muted, anchor: "middle" },
    );
    s.text(
      770,
      520,
      `${tr(L("1 dot =", "1 point ="), lang)} ${VOR_DEG_PER_DOT}°`,
      { size: 22, fill: c.muted, anchor: "middle" },
    );
    const dev = Math.round(Math.abs(st.deviation));
    const side =
      st.deviation > 0 ? L("right", "à droite") : L("left", "à gauche");
    const needle = st.centred
      ? tr(L("centred", "centrée"), lang)
      : `${dev}° ${tr(side, lang)}`;
    return {
      svg: s.toString(),
      readouts: [
        ro(L("Radial (QDR)", "Radial (QDR)"), `${hdg(st.radial)}°`),
        ro(L("QDM", "QDM"), `${hdg(st.qdm)}°`, "key"),
        ro(L("Flag", "Indicateur"), st.flag, st.flag === "TO" ? "sel" : "warn"),
        ro(L("Needle", "Aiguille"), needle, st.centred ? "ok" : undefined),
        ro(L("ADF bearing", "Gisement ADF"), `${hdg(st.rb)}°`),
      ],
      say: `R-${hdg(st.radial)}, OBS ${hdg(o)}, ${st.flag}, ${tr(L("needle", "aiguille"), lang)} ${needle}; ${tr(L("ADF bearing", "gisement"), lang)} ${hdg(st.rb)}°.`,
    };
  },
};
