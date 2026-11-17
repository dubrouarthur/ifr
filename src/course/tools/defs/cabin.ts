// Teaching tool « Pressurisation »: the fuselage holding the cabin pressure against the thinner air outside, the
// aircraft's altitude and the cabin altitude on one scale, the differential against its maximum, and the time of
// useful consciousness if the cabin is lost. Maths and sources: ../maths/atmos.ts (ICAO standard atmosphere,
// CS 25.841(a) cabin altitude, FAA AC 61-107B table of useful consciousness).
import { cabin, CABIN_MAX_FT, HPA_PER_PSI } from "../maths/atmos";
import { L, num, ro, Svg, tr, type ToolDef } from "../kit";

export const cabinTool: ToolDef = {
  id: "pressurisation",
  title: L("Pressurisation", "Pressurisation"),
  blurb: L(
    "Cabin altitude, pressure differential, and the time left if it is lost",
    "Altitude cabine, pression différentielle, et le temps qui reste si on la perd",
  ),
  subject: "ATPL 021 · 040",
  tags: [
    "pressurisation",
    "pressurization",
    "cabine",
    "cabin",
    "différentiel",
    "differential",
    "décompression",
    "hypoxie",
    "hypoxia",
    "tuc",
    "021",
    "040",
  ],
  params: [
    {
      key: "alt",
      label: L("Aircraft altitude", "Altitude de l’avion"),
      min: 0,
      max: 45000,
      step: 1000,
      unit: "ft",
    },
    {
      key: "dp",
      label: L("Maximum differential", "Différentiel maximal"),
      min: 5,
      max: 9.5,
      step: 0.1,
      unit: "psi",
    },
    {
      key: "target",
      label: L("Cabin altitude wanted", "Altitude cabine voulue"),
      min: 0,
      max: 10000,
      step: 500,
      unit: "ft",
    },
  ],
  defaults: { alt: 37000, dp: 8.0, target: 8000 },
  controls: ["alt", "dp", "target"],
  presets: [
    {
      label: L("Cruise FL 370", "Croisière FL 370"),
      p: { alt: 37000, dp: 8, target: 8000 },
    },
    {
      label: L("Higher: FL 430", "Plus haut : FL 430"),
      p: { alt: 43000, dp: 8, target: 8000 },
    },
    {
      label: L("Lower differential", "Différentiel plus faible"),
      p: { alt: 25000, dp: 5.5, target: 8000 },
    },
  ],
  sweep: { key: "alt", from: 0, to: 45000, s: 10 },
  note: L(
    "The fuselage is a pressure vessel: the cabin is kept at a pressure altitude of 8,000 ft at most (CS 25.841) while the air outside thins. The difference pushes outward on every square inch: the structure allows a maximum differential. Climb: the differential grows until it reaches its maximum, then the cabin has to climb with the aircraft. Then lose it: at FL 350 you have 30 to 60 seconds of useful consciousness (FAA AC 61-107B). Ask: why do the masks drop, and why put yours on first?",
    "Le fuselage est une enceinte sous pression : la cabine est tenue à 8 000 ft d’altitude-pression au plus (CS 25.841) pendant que l’air extérieur se raréfie. La différence pousse vers l’extérieur sur chaque centimètre carré : la structure admet un différentiel maximal. Montez : le différentiel grandit jusqu’à son maximum, puis la cabine doit monter avec l’avion. Puis perdez-la : à FL 350 il reste 30 à 60 secondes de conscience utile (FAA AC 61-107B). Demandez : pourquoi les masques tombent-ils, et pourquoi mettre le sien d’abord ?",
  ),
  view: { w: 1000, h: 600 },
  frame: { w: 1680, h: 768 },
  draw(p, cx) {
    const { c, lang } = cx;
    const st = cabin(p.alt, p.target, p.dp);
    const s = new Svg();
    // ---------------------------------------------------------------- the fuselage in section, the pressure pushing out
    const fx = 230;
    const fy = 270;
    const fr = 150;
    const tone = st.cabinFt > CABIN_MAX_FT + 1 ? c.stop : c.accent;
    s.circle(fx, fy, fr, {
      fill: c.accent,
      "fill-opacity": 0.08 + 0.1 * Math.min(1, st.diffPsi / 9),
      stroke: c.text,
      "stroke-width": 8,
    });
    // the floor
    s.line(
      fx - fr * 0.92,
      fy + fr * 0.38,
      fx + fr * 0.92,
      fy + fr * 0.38,
      c.text,
      4,
    );
    const n = 12;
    const len = 14 + 7 * st.diffPsi;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI;
      const x0 = fx + (fr - 6 - len) * Math.cos(a);
      const y0 = fy + (fr - 6 - len) * Math.sin(a);
      if (st.diffPsi > 0.2)
        s.arrow(
          x0,
          y0,
          fx + (fr - 6) * Math.cos(a),
          fy + (fr - 6) * Math.sin(a),
          tone,
          4,
          12,
        );
    }
    s.text(fx, fy - 20, tr(L("cabin", "cabine"), lang), {
      size: 24,
      weight: 700,
      fill: c.text,
      anchor: "middle",
    });
    s.text(fx, fy + 14, `${num(st.cabinHpa, 0, lang)} hPa`, {
      size: 24,
      weight: 700,
      fill: tone,
      anchor: "middle",
    });
    s.text(
      fx,
      fy + fr + 44,
      `${tr(L("outside", "extérieur"), lang)} ${num(st.outsideHpa, 0, lang)} hPa`,
      { size: 24, weight: 600, fill: c.muted, anchor: "middle" },
    );
    // the differential gauge
    const gx = 60;
    const gy = 520;
    const gw = 360;
    s.text(gx, gy - 14, tr(L("Differential", "Différentiel"), lang), {
      size: 22,
      weight: 600,
      fill: c.muted,
    });
    s.rect(gx, gy, gw, 22, {
      fill: c.surface,
      stroke: c.rule,
      "stroke-width": 2,
      rx: 11,
    });
    s.rect(gx, gy, (gw * Math.min(st.diffPsi, 10)) / 10, 22, {
      fill: st.limited ? c.key : c.accent,
      rx: 11,
    });
    s.line(
      gx + (gw * p.dp) / 10,
      gy - 8,
      gx + (gw * p.dp) / 10,
      gy + 30,
      c.stop,
      4,
    );
    s.text(gx + (gw * p.dp) / 10, gy + 54, `max ${num(p.dp, 1, lang)} psi`, {
      size: 20,
      weight: 700,
      fill: c.stop,
      anchor: "middle",
    });
    // ---------------------------------------------------------------- one altitude scale: the aircraft and the cabin
    const ax = 640;
    const top = 50;
    const bot = 470;
    const Y = (ft: number) => bot - (ft / 45000) * (bot - top);
    s.line(ax, top, ax, bot, c.ruleStrong, 3);
    for (let h = 0; h <= 45000; h += 5000) {
      s.line(ax - 8, Y(h), ax + 8, Y(h), c.ruleStrong, 2.5);
      s.text(ax - 16, Y(h), h ? `${num(h, 0, lang)}` : "0", {
        size: 20,
        fill: c.muted,
        anchor: "end",
        mid: true,
      });
    }
    s.text(ax - 16, top - 22, "ft", { size: 20, fill: c.muted, anchor: "end" });
    // 8,000 ft
    s.line(ax, Y(CABIN_MAX_FT), 975, Y(CABIN_MAX_FT), c.key, 2.5, "8 6");
    s.text(
      975,
      Y(CABIN_MAX_FT) + 26,
      tr(
        L("8,000 ft: cabin limit (CS 25)", "8 000 ft : limite cabine (CS 25)"),
        lang,
      ),
      { size: 20, weight: 600, fill: c.key, anchor: "end" },
    );
    // the aircraft
    const ay = Y(p.alt);
    s.poly(
      [
        [ax + 20, ay],
        [ax + 44, ay - 12],
        [ax + 44, ay + 12],
      ],
      { fill: c.text },
    );
    s.text(
      ax + 54,
      ay,
      `${tr(L("aircraft", "avion"), lang)} ${num(p.alt, 0, lang)} ft`,
      { size: 22, weight: 700, fill: c.text, mid: true, halo: c.bg },
    );
    const cy = Y(st.cabinFt);
    s.circle(ax + 30, cy, 11, { fill: tone, stroke: c.bg, "stroke-width": 3 });
    s.text(
      ax + 54,
      cy + (Math.abs(cy - ay) < 30 ? 28 : Math.abs(st.cabinFt - CABIN_MAX_FT) < 2500 ? -22 : 0),
      `${tr(L("cabin", "cabine"), lang)} ${num(st.cabinFt, 0, lang)} ft`,
      { size: 22, weight: 700, fill: tone, mid: true, halo: c.bg },
    );
    // useful consciousness
    const tuc = st.tuc;
    const tucText = tuc
      ? tuc[1] >= 120
        ? `${num(tuc[0] / 60, 0, lang)}–${num(tuc[1] / 60, 0, lang)} min`
        : `${num(tuc[0], 0, lang)}–${num(tuc[1], 0, lang)} s`
      : tr(
          L("not in the table (below FL 250)", "hors du tableau (sous FL 250)"),
          lang,
        );
    s.text(
      800,
      555,
      `${tr(L("If the cabin is lost:", "Si la cabine est perdue :"), lang)} ${tucText}`,
      { size: 24, weight: 700, fill: tuc ? c.stop : c.muted, anchor: "middle" },
    );
    s.text(
      800,
      585,
      tr(
        L(
          "of useful consciousness (FAA AC 61-107B)",
          "de conscience utile (FAA AC 61-107B)",
        ),
        lang,
      ),
      { size: 20, fill: c.muted, anchor: "middle" },
    );
    void HPA_PER_PSI;
    return {
      svg: s.toString(),
      readouts: [
        ro(
          L("Cabin altitude", "Altitude cabine"),
          `${num(st.cabinFt, 0, lang)} ft`,
          st.cabinFt > CABIN_MAX_FT + 1 ? "stop" : "ok",
        ),
        ro(
          L("Differential", "Différentiel"),
          `${num(st.diffPsi, 1, lang)} psi`,
          st.limited ? "warn" : undefined,
        ),
        ro(
          L("Needed for the target", "Nécessaire pour la cible"),
          `${num(Math.max(0, st.neededPsi), 1, lang)} psi`,
        ),
        ro(
          L("Useful consciousness", "Conscience utile"),
          tucText,
          tuc ? "stop" : undefined,
        ),
      ],
      say: `${tr(L("Aircraft", "Avion"), lang)} ${num(p.alt, 0, lang)} ft, ${tr(L("cabin", "cabine"), lang)} ${num(st.cabinFt, 0, lang)} ft, ${tr(L("differential", "différentiel"), lang)} ${num(st.diffPsi, 1, lang)} psi.`,
    };
  },
};
