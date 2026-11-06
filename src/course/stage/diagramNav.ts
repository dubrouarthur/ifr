// Ground school stage — navigation calc diagrams: the 60:1 rule (track error and closing angle, IFH ch. 9) and
// the TVMDC strip (true course → true heading → magnetic → compass, PHAK ch. 16: "East is least, West is best").
import type { CalcDiagram, Lang } from "../types";
import { sixtyToOne, tvmdc, variationText } from "./diagramMath";
import {
  aircraftIcon,
  arrow,
  clamp,
  dec,
  DEG,
  dragHandle,
  hdg3,
  L,
  label,
  PALETTES,
  rootSvg,
  s,
  signed,
  wrap180,
  type DiagramOptions,
  type DiagramTheme,
  type DiagramWidget,
} from "./svgkit";

export type SixtyToOneSpec = Extract<CalcDiagram, { kind: "sixtyToOne" }>;
export type CompassSpec = Extract<CalcDiagram, { kind: "compass" }>;

// ------------------------------------------------------------------ 60:1
/**
 * The 1-in-60 triangle, course to the right: departure point, intended course (dashed), the track actually
 * flown (magenta) to the aircraft `offNm` off after `flownNm`, the track error, and with `toGoNm` the closing
 * angle and the heading change to go direct. Honest scale (no vertical exaggeration). Drag: 'aircraft'.
 * `offNm` + = right of the course.
 */
export function createSixtyToOne(
  spec0: SixtyToOneSpec,
  o: DiagramOptions = {},
): DiagramWidget<SixtyToOneSpec> {
  const W = 720;
  const H = 405;
  const lang: Lang = o.lang ?? "en";
  const drag = new Set(o.drag ?? spec0.drag ?? []);
  let theme: DiagramTheme = o.theme ?? "dark";
  let spec: SixtyToOneSpec = { ...spec0 };
  const svg = rootSvg(W, H, "cs-sixty");
  const desc = s("desc");
  let p = PALETTES[theme];
  let layer = s("g");
  let handle: ReturnType<typeof dragHandle> | null = null;
  // the scale is fixed at build (so the handle stays under the finger while dragging)
  let totalNm = 1;
  const ax = 64;
  const ay = 170;
  const span = 590;
  const k = () => span / totalNm;
  const build = () => {
    p = PALETTES[theme];
    totalNm = Math.max(10, spec.flownNm + (spec.toGoNm ?? spec.flownNm * 0.6));
    svg.replaceChildren(desc, s("rect", { width: W, height: H, fill: p.bg }));
    layer = s("g");
    svg.append(layer);
    handle = drag.has("aircraft")
      ? dragHandle(svg, p, {
          color: p.track,
          name: L(lang, "Aircraft position", "Position de l'avion"),
          onDrag: (x, y) => {
            const flown = clamp(
              (x - ax) / k(),
              1,
              totalNm - (spec.toGoNm !== undefined ? 1 : 0),
            );
            const off = clamp((y - ay) / k(), -totalNm * 0.2, totalNm * 0.2);
            const next: SixtyToOneSpec = {
              ...spec,
              flownNm: Math.round(flown * 2) / 2,
              offNm: Math.round(off * 10) / 10,
            };
            if (spec.toGoNm !== undefined)
              next.toGoNm = Math.max(
                1,
                Math.round((totalNm - next.flownNm) * 2) / 2,
              );
            set(next);
          },
          onKey: (dx, dy, big) => {
            const next: SixtyToOneSpec = {
              ...spec,
              flownNm: clamp(spec.flownNm + dx * (big ? 5 : 1), 1, totalNm - 1),
              offNm: Math.round((spec.offNm + dy * (big ? 1 : 0.1)) * 10) / 10,
            };
            if (spec.toGoNm !== undefined)
              next.toGoNm = Math.max(1, totalNm - next.flownNm);
            set(next);
          },
        })
      : null;
    draw();
  };
  const draw = () => {
    layer.replaceChildren();
    const r = sixtyToOne(spec.flownNm, spec.offNm, spec.toGoNm);
    const cx = ax + spec.flownNm * k();
    const cy = ay + spec.offNm * k();
    const bx = spec.toGoNm !== undefined ? cx + spec.toGoNm * k() : ax + span;
    // course line and destination
    layer.append(
      s("line", {
        x1: ax,
        y1: ay,
        x2: bx + (spec.toGoNm !== undefined ? 0 : 20),
        y2: ay,
        stroke: p.text,
        "stroke-width": 1.8,
        "stroke-dasharray": "8 7",
        opacity: 0.85,
      }),
    );
    layer.append(
      s("circle", {
        cx: ax,
        cy: ay,
        r: 6,
        fill: p.bg,
        stroke: p.text,
        "stroke-width": 2.2,
      }),
    );
    layer.append(
      label(ax, ay - 16, L(lang, "Departure", "Départ"), p, {
        size: 13,
        color: p.muted,
        anchor: "middle",
      }),
    );
    layer.append(
      label(
        ax + 120,
        ay - 12,
        `${L(lang, "Course", "Route")} ${hdg3(spec.course)}°`,
        p,
        { size: 14, weight: 700 },
      ),
    );
    if (spec.toGoNm !== undefined) {
      layer.append(
        s("path", {
          d: `M${bx} ${ay - 10}L${bx + 9} ${ay + 6}L${bx - 9} ${ay + 6}Z`,
          fill: p.bg,
          stroke: p.nav,
          "stroke-width": 2.2,
        }),
      );
      layer.append(
        label(bx, ay - 18, L(lang, "Destination", "Destination"), p, {
          size: 13,
          color: p.nav,
          anchor: "middle",
          weight: 700,
        }),
      );
    }
    // track flown
    layer.append(
      s("line", {
        x1: ax,
        y1: ay,
        x2: cx,
        y2: cy,
        stroke: p.track,
        "stroke-width": 3.2,
      }),
    );
    const trk = spec.course + r.teExact;
    layer.append(aircraftIcon(cx, cy, 90 + r.teExact, p.track, 1.15));
    // off-course bracket
    if (Math.abs(spec.offNm) > 0.05) {
      layer.append(
        s("line", {
          x1: cx,
          y1: ay,
          x2: cx,
          y2: cy,
          stroke: p.wind,
          "stroke-width": 2,
          "stroke-dasharray": "4 4",
        }),
      );
      layer.append(
        label(
          cx + 10,
          (ay + cy) / 2 + 5,
          `${dec(Math.abs(spec.offNm), 1, lang)} NM ${spec.offNm > 0 ? L(lang, "right", "à droite") : L(lang, "left", "à gauche")}`,
          p,
          { size: 13, color: p.wind, weight: 700 },
        ),
      );
    }
    // flown / to go dimensions
    const dimY = Math.max(ay, cy) + 46;
    const dim = (x1: number, x2: number, t: string, c: string) => {
      layer.append(
        s("path", {
          d: `M${x1} ${dimY - 6}V${dimY + 6}M${x2} ${dimY - 6}V${dimY + 6}M${x1} ${dimY}H${x2}`,
          stroke: c,
          "stroke-width": 1.4,
          fill: "none",
        }),
      );
      layer.append(
        label((x1 + x2) / 2, dimY + 22, t, p, {
          size: 13,
          color: c,
          anchor: "middle",
          weight: 600,
        }),
      );
    };
    dim(
      ax,
      cx,
      `${dec(spec.flownNm, spec.flownNm % 1 ? 1 : 0, lang)} NM ${L(lang, "flown", "parcourus")}`,
      p.muted,
    );
    if (spec.toGoNm !== undefined)
      dim(
        cx,
        bx,
        `${dec(spec.toGoNm, spec.toGoNm % 1 ? 1 : 0, lang)} NM ${L(lang, "to go", "restants")}`,
        p.muted,
      );
    // track-error angle at the departure point
    const arcR = 86;
    const a1 = r.teExact * DEG;
    if (Math.abs(r.teExact) > 0.3) {
      layer.append(
        s("path", {
          d: `M${ax + arcR} ${ay}A${arcR} ${arcR} 0 0 ${a1 > 0 ? 1 : 0} ${ax + arcR * Math.cos(a1)} ${ay + arcR * Math.sin(a1)}`,
          fill: "none",
          stroke: p.track,
          "stroke-width": 2,
        }),
      );
      layer.append(
        label(
          ax + arcR + 8,
          ay + (a1 > 0 ? 22 : -10),
          `TE ${dec(Math.abs(r.te), 1, lang).replace(/[.,]0$/, "")}°`,
          p,
          { size: 13.5, color: p.track, weight: 700 },
        ),
      );
    }
    // direct to the destination: closing angle at the aircraft
    if (spec.toGoNm !== undefined && Math.abs(spec.offNm) > 0.05) {
      layer.append(
        s("line", {
          x1: cx,
          y1: cy,
          x2: bx,
          y2: ay,
          stroke: p.heading,
          "stroke-width": 2.4,
          "stroke-dasharray": "6 5",
        }),
      );
      layer.append(
        s("line", {
          x1: cx,
          y1: cy,
          x2: cx + 110,
          y2: cy,
          stroke: p.line,
          "stroke-width": 1.2,
          "stroke-dasharray": "3 4",
        }),
      );
      const cr = 64;
      const b = -Math.atan2(cy - ay, bx - cx);
      layer.append(
        s("path", {
          d: `M${cx + cr} ${cy}A${cr} ${cr} 0 0 ${b > 0 ? 1 : 0} ${cx + cr * Math.cos(b)} ${cy + cr * Math.sin(b)}`,
          fill: "none",
          stroke: p.heading,
          "stroke-width": 2,
        }),
      );
      layer.append(
        label(
          cx + cr + 8,
          cy + (b > 0 ? 20 : -8),
          `CA ${dec(Math.abs(r.ca ?? 0), 1, lang).replace(/[.,]0$/, "")}°`,
          p,
          { size: 13.5, color: p.heading, weight: 700 },
        ),
      );
    }
    // the rule card
    const card = s("g", { transform: `translate(24 ${H - 92})` });
    const teTxt = `TE = 60 × ${dec(Math.abs(spec.offNm), 1, lang)} ÷ ${dec(spec.flownNm, spec.flownNm % 1 ? 1 : 0, lang)} ≈ ${dec(Math.abs(r.te), 1, lang)}°`;
    card.append(
      label(0, 0, teTxt, p, {
        size: 14.5,
        color: p.track,
        weight: 700,
        mono: true,
      }),
    );
    card.append(
      label(
        0,
        22,
        `${L(lang, "exact", "exact")} atan: ${dec(Math.abs(r.teExact), 2, lang)}° · ${L(lang, "track", "route suivie")} ${hdg3(trk)}°`,
        p,
        { size: 12.5, color: p.muted, weight: 500 },
      ),
    );
    if (r.correction !== null && Math.abs(spec.offNm) > 0.05) {
      const dir =
        spec.offNm > 0
          ? L(lang, "left", "à gauche")
          : L(lang, "right", "à droite");
      card.append(
        label(
          0,
          48,
          `CA = 60 × ${dec(Math.abs(spec.offNm), 1, lang)} ÷ ${dec(spec.toGoNm!, spec.toGoNm! % 1 ? 1 : 0, lang)} ≈ ${dec(Math.abs(r.ca!), 1, lang)}° → ${L(lang, "turn", "virez de")} ${dec(Math.abs(r.correction), 0, lang)}° ${dir} (TE + CA)`,
          p,
          { size: 14.5, color: p.heading, weight: 700, mono: true },
        ),
      );
      card.append(
        label(
          0,
          70,
          `${L(lang, "To parallel the course: turn TE only", "Pour revenir parallèle à la route : virez de TE seulement")}`,
          p,
          { size: 12.5, color: p.muted, weight: 500 },
        ),
      );
    }
    layer.append(card);
    if (handle) {
      layer.append(handle.g);
      handle.move(cx, cy);
      handle.g.setAttribute(
        "aria-valuetext",
        `${dec(spec.flownNm, 1, lang)} NM, ${dec(spec.offNm, 1, lang)} NM`,
      );
    }
    const a11y =
      o.label ??
      L(
        lang,
        `60 to 1 rule: ${spec.offNm.toFixed(1)} NM off course after ${spec.flownNm} NM, track error about ${r.te.toFixed(1)} degrees${r.correction !== null ? `, closing angle ${r.ca!.toFixed(1)}, total correction ${r.correction.toFixed(0)} degrees` : ""}.`,
        `Règle du 1 sur 60 : ${spec.offNm.toFixed(1)} NM d'écart après ${spec.flownNm} NM, erreur de route d'environ ${r.te.toFixed(1)} degrés${r.correction !== null ? `, angle de ralliement ${r.ca!.toFixed(1)}, correction totale ${r.correction.toFixed(0)} degrés` : ""}.`,
      );
    svg.setAttribute("aria-label", a11y);
    desc.textContent = a11y;
  };
  const set = (next: SixtyToOneSpec) => {
    spec = next;
    draw();
    o.onChange?.({ ...spec });
  };
  build();
  return {
    el: svg,
    spec: () => ({ ...spec }),
    update(next) {
      spec = { ...next };
      build();
    },
    setTheme(t) {
      theme = t;
      build();
    },
    destroy() {
      svg.remove();
    },
  };
}

// ------------------------------------------------------------------ TVMDC strip
/**
 * TVMDC on a heading tape: the four headings as markers (TC, TH, MH, CH) with the step between each (WCA,
 * variation, deviation), then the written line a pilot keeps on the log. `variation` + = East (subtract),
 * `deviation` = the compass card's correction (add). Drag: 'wca' (TH marker), 'variation' (MH), 'deviation' (CH).
 */
export function createTvmdc(
  spec0: CompassSpec,
  o: DiagramOptions = {},
): DiagramWidget<CompassSpec> {
  const W = 960;
  const H = 370;
  const lang: Lang = o.lang ?? "en";
  const fr = lang === "fr";
  const drag = new Set(o.drag ?? spec0.drag ?? []);
  let theme: DiagramTheme = o.theme ?? "dark";
  let spec: CompassSpec = { ...spec0 };
  const svg = rootSvg(W, H, "cs-tvmdc");
  const desc = s("desc");
  let p = PALETTES[theme];
  let layer = s("g");
  const x0 = 60;
  const x1 = W - 60;
  const tapeY = 92;
  let lo = 0;
  let span = 40;
  const hs: Partial<
    Record<"wca" | "variation" | "deviation", ReturnType<typeof dragHandle>>
  > = {};
  const relX = (rel: number) => x0 + ((rel - lo) / span) * (x1 - x0);
  const xRel = (x: number) => lo + ((x - x0) / (x1 - x0)) * span;
  const fit = () => {
    const rels = [
      0,
      spec.wca,
      spec.wca - spec.variation,
      spec.wca - spec.variation + spec.deviation,
    ];
    const mn = Math.min(...rels);
    const mx = Math.max(...rels);
    span = Math.max(36, Math.ceil((mx - mn + 24) / 10) * 10);
    lo = Math.floor((mn + mx) / 2 - span / 2);
  };
  const build = () => {
    p = PALETTES[theme];
    fit();
    svg.replaceChildren(desc, s("rect", { width: W, height: H, fill: p.bg }));
    layer = s("g");
    svg.append(layer);
    const mk = (
      key: "wca" | "variation" | "deviation",
      name: string,
      color: string,
    ) => {
      if (!drag.has(key)) return;
      hs[key] = dragHandle(svg, p, {
        color,
        name,
        onDrag: (x) => {
          const rel = Math.round(clamp(xRel(x), lo, lo + span));
          if (key === "wca") set({ ...spec, wca: clamp(rel, -45, 45) });
          else if (key === "variation")
            set({ ...spec, variation: clamp(spec.wca - rel, -30, 30) });
          else
            set({
              ...spec,
              deviation: clamp(rel - (spec.wca - spec.variation), -10, 10),
            });
        },
        onKey: (dx) => {
          if (key === "wca")
            set({ ...spec, wca: clamp(spec.wca + dx, -45, 45) });
          else if (key === "variation")
            set({ ...spec, variation: clamp(spec.variation - dx, -30, 30) });
          else set({ ...spec, deviation: clamp(spec.deviation + dx, -10, 10) });
        },
      });
    };
    mk(
      "wca",
      L(
        lang,
        "True heading (wind correction)",
        "Cap vrai (correction de dérive)",
      ),
      p.heading,
    );
    mk(
      "variation",
      L(lang, "Magnetic heading (variation)", "Cap magnétique (déclinaison)"),
      p.nav,
    );
    mk(
      "deviation",
      L(lang, "Compass heading (deviation)", "Cap compas (déviation)"),
      p.wind,
    );
    draw();
  };
  const draw = () => {
    layer.replaceChildren();
    const r = tvmdc(spec.tc, spec.wca, spec.variation, spec.deviation);
    // tape
    layer.append(
      s("rect", {
        x: x0 - 16,
        y: tapeY - 40,
        width: x1 - x0 + 32,
        height: 64,
        rx: 8,
        fill: p.fill,
        stroke: p.line,
        "stroke-width": 1,
      }),
    );
    for (let d = Math.ceil(lo); d <= lo + span; d++) {
      const x = relX(d);
      const abs = Math.round(spec.tc + d);
      const big = abs % 10 === 0;
      const mid = abs % 5 === 0;
      layer.append(
        s("line", {
          x1: x,
          y1: tapeY + 24,
          x2: x,
          y2: tapeY + 24 - (big ? 18 : mid ? 11 : 6),
          stroke: p.line,
          "stroke-width": big ? 1.6 : 1,
        }),
      );
      if (big)
        layer.append(
          label(x, tapeY - 6, hdg3(abs), p, {
            size: 13,
            color: p.muted,
            anchor: "middle",
            weight: 600,
            halo: false,
          }),
        );
    }
    // markers
    const marks: {
      key: string;
      rel: number;
      name: string;
      v: number;
      color: string;
      row: number;
    }[] = [
      { key: "tc", rel: 0, name: "TC", v: r.tc, color: p.text, row: 0 },
      {
        key: "th",
        rel: spec.wca,
        name: "TH",
        v: r.th,
        color: p.heading,
        row: 1,
      },
      {
        key: "mh",
        rel: spec.wca - spec.variation,
        name: "MH",
        v: r.mh,
        color: p.nav,
        row: 2,
      },
      {
        key: "ch",
        rel: spec.wca - spec.variation + spec.deviation,
        name: "CH",
        v: r.ch,
        color: p.wind,
        row: 3,
      },
    ];
    const rowY = (i: number) => tapeY + 54 + i * 34;
    for (const m of marks) {
      const x = relX(m.rel);
      layer.append(
        s("line", {
          x1: x,
          y1: tapeY - 30,
          x2: x,
          y2: rowY(m.row) - 4,
          stroke: m.color,
          "stroke-width": 2,
          opacity: 0.9,
        }),
      );
      layer.append(
        s("path", { d: `M${x} ${tapeY + 26}l-7 -11h14z`, fill: m.color }),
      );
      layer.append(
        label(x + 8, rowY(m.row) + 5, `${m.name} ${hdg3(m.v)}°`, p, {
          size: 15,
          color: m.color,
          weight: 700,
        }),
      );
    }
    // steps between markers
    const steps: [number, number, string, string, number][] = [
      [
        0,
        spec.wca,
        `${spec.wca >= 0 ? "+" : "−"} WCA ${Math.abs(Math.round(spec.wca))}° ${spec.wca >= 0 ? L(lang, "R", "D") : L(lang, "L", "G")}`,
        p.heading,
        1,
      ],
      [
        spec.wca,
        spec.wca - spec.variation,
        `${spec.variation > 0 ? "−" : "+"} ${L(lang, "VAR", "DÉCL")} ${variationText(spec.variation, fr)} · ${spec.variation > 0 ? L(lang, "East is least", "Est : on retranche") : spec.variation < 0 ? L(lang, "West is best", "Ouest : on ajoute") : ""}`,
        p.nav,
        2,
      ],
      [
        spec.wca - spec.variation,
        spec.wca - spec.variation + spec.deviation,
        `${spec.deviation >= 0 ? "+" : "−"} DEV ${Math.abs(Math.round(spec.deviation * 10) / 10)}°`,
        p.wind,
        3,
      ],
    ];
    for (const [a, b, t, c, row] of steps) {
      const xa = relX(a);
      const xb = relX(b);
      const y = rowY(row) - 16;
      if (Math.abs(xb - xa) > 4) layer.append(arrow(xa, y, xb, y, c, 2, 9));
      // the step's words sit on the side away from the marker label
      const right = xb >= xa;
      const tx = right ? Math.min(xa, xb) - 12 : Math.max(xa, xb) + 12;
      layer.append(label(tx, y + 5, t, p, { size: 12.5, color: c, anchor: right ? "end" : "start", weight: 600 }));
    }
    // the log line
    const logY = H - 48;
    const cells: [string, string, string][] = [
      ["TC", hdg3(r.tc), p.text],
      [L(lang, "WCA", "Dérive"), `${signed(spec.wca)}`, p.heading],
      ["TH", hdg3(r.th), p.heading],
      [
        L(lang, "VAR", "Décl."),
        `${variationText(spec.variation, fr)} ${spec.variation > 0 ? "−" : spec.variation < 0 ? "+" : ""}`.trim(),
        p.nav,
      ],
      ["MH", hdg3(r.mh), p.nav],
      ["DEV", `${signed(spec.deviation)}`, p.wind],
      ["CH", hdg3(r.ch), p.wind],
    ];
    const cw = (x1 - x0 + 32) / cells.length;
    cells.forEach(([k, v, c], i) => {
      const x = x0 - 16 + i * cw;
      const head = i % 2 === 0;
      layer.append(
        s("rect", {
          x: x + 3,
          y: logY - 30,
          width: cw - 6,
          height: 56,
          rx: 7,
          fill: head ? p.fill : "none",
          stroke: head ? c : p.line,
          "stroke-width": head ? 1.6 : 1,
          "stroke-dasharray": head ? undefined : "4 3",
        }),
      );
      layer.append(
        label(x + cw / 2, logY - 12, k, p, {
          size: 11.5,
          color: p.muted,
          anchor: "middle",
          weight: 700,
          halo: false,
        }),
      );
      layer.append(
        label(x + cw / 2, logY + 12, v, p, {
          size: head ? 19 : 15,
          color: c,
          anchor: "middle",
          weight: 700,
          halo: false,
          mono: true,
        }),
      );
    });
    for (const [key, rel] of [
      ["wca", spec.wca],
      ["variation", spec.wca - spec.variation],
      ["deviation", spec.wca - spec.variation + spec.deviation],
    ] as const) {
      const h = hs[key];
      if (!h) continue;
      layer.append(h.g);
      h.move(relX(rel), tapeY + 24);
    }
    hs.wca?.g.setAttribute("aria-valuetext", `TH ${hdg3(r.th)}`);
    hs.variation?.g.setAttribute(
      "aria-valuetext",
      `MH ${hdg3(r.mh)}, ${variationText(spec.variation, fr)}`,
    );
    hs.deviation?.g.setAttribute("aria-valuetext", `CH ${hdg3(r.ch)}`);
    const a11y =
      o.label ??
      L(
        lang,
        `TVMDC: true course ${hdg3(r.tc)}, wind correction ${signed(spec.wca)}, true heading ${hdg3(r.th)}, variation ${variationText(spec.variation)}, magnetic heading ${hdg3(r.mh)}, deviation ${signed(spec.deviation)}, compass heading ${hdg3(r.ch)}.`,
        `Route vraie ${hdg3(r.tc)}, dérive ${signed(spec.wca)}, cap vrai ${hdg3(r.th)}, déclinaison ${variationText(spec.variation, true)}, cap magnétique ${hdg3(r.mh)}, déviation ${signed(spec.deviation)}, cap compas ${hdg3(r.ch)}.`,
      );
    svg.setAttribute("aria-label", a11y);
    desc.textContent = a11y;
    void wrap180;
  };
  const set = (next: CompassSpec) => {
    spec = next;
    const before = [lo, span];
    fit();
    if (before[0] !== lo || before[1] !== span) {
      // keep the tape steady while dragging: only refit when a marker leaves it
      const rels = [
        0,
        spec.wca,
        spec.wca - spec.variation,
        spec.wca - spec.variation + spec.deviation,
      ];
      if (
        rels.every((v) => v >= before[0] + 2 && v <= before[0] + before[1] - 2)
      ) {
        lo = before[0];
        span = before[1];
      }
    }
    draw();
    o.onChange?.({ ...spec });
  };
  build();
  return {
    el: svg,
    spec: () => ({ ...spec }),
    update(next) {
      spec = { ...next };
      build();
    },
    setTheme(t) {
      theme = t;
      build();
    },
    destroy() {
      svg.remove();
    },
  };
}
