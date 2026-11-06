// Ground school stage — weight and balance: the loading points on the C172S CG limits chart (POH section 6:
// forward 35.0 in at 1950 lb or less, straight line to 41.0 in at 2550 lb; aft 47.3 in; utility max 2200 lb,
// aft 40.5 in). CG = moment ÷ weight. Drag: 'points' (each loading point: weight and CG).
import type { CalcDiagram, L10n, Lang } from "../types";
import { C172S, c172sEnvelope, checkCg } from "./diagramMath";
import {
  clamp,
  dec,
  dragHandle,
  L,
  label,
  PALETTES,
  rootSvg,
  s,
  thousands,
  type DiagramOptions,
  type DiagramTheme,
  type DiagramWidget,
} from "./svgkit";

export type CgSpec = Extract<CalcDiagram, { kind: "cgEnvelope" }>;

const tr = (t: L10n, lang: Lang) => (lang === "fr" ? (t.fr ?? t.en) : t.en);

export function createCgEnvelope(
  spec0: CgSpec,
  o: DiagramOptions = {},
): DiagramWidget<CgSpec> {
  const W = 640;
  const H = 560;
  const lang: Lang = o.lang ?? "en";
  const drag = new Set(o.drag ?? spec0.drag ?? []);
  let theme: DiagramTheme = o.theme ?? "dark";
  let spec: CgSpec = { ...spec0, points: spec0.points.map((q) => ({ ...q })) };
  const svg = rootSvg(W, H, "cs-cg");
  const desc = s("desc");
  let p = PALETTES[theme];
  let layer = s("g");
  const X0 = 82;
  const X1 = W - 30;
  const Y0 = 34;
  const Y1 = H - 140;
  const CG_LO = 33;
  const CG_HI = 49;
  const WT_LO = 1400;
  const WT_HI = 2650;
  const xOf = (cg: number) => X0 + ((cg - CG_LO) / (CG_HI - CG_LO)) * (X1 - X0);
  const yOf = (wt: number) => Y1 - ((wt - WT_LO) / (WT_HI - WT_LO)) * (Y1 - Y0);
  const cgOfX = (x: number) => CG_LO + ((x - X0) / (X1 - X0)) * (CG_HI - CG_LO);
  const wtOfY = (y: number) => WT_LO + ((Y1 - y) / (Y1 - Y0)) * (WT_HI - WT_LO);
  let handles: ReturnType<typeof dragHandle>[] = [];
  const build = () => {
    p = PALETTES[theme];
    svg.replaceChildren(desc, s("rect", { width: W, height: H, fill: p.bg }));
    layer = s("g");
    svg.append(layer);
    handles = drag.has("points")
      ? spec.points.map((pt, i) =>
          dragHandle(svg, p, {
            color: p.heading,
            name: `${tr(pt.label, lang)}: ${L(lang, "weight and CG", "masse et centrage")}`,
            onDrag: (x, y) => {
              const cg = clamp(cgOfX(x), CG_LO, CG_HI);
              const wt = clamp(wtOfY(y), WT_LO, WT_HI);
              movePoint(i, Math.round(wt / 5) * 5, Math.round(cg * 10) / 10);
            },
            onKey: (dx, dy, big) => {
              const q = spec.points[i];
              const cg = q.momentLbIn / q.weightLb;
              movePoint(
                i,
                clamp(q.weightLb - dy * (big ? 50 : 10), WT_LO, WT_HI),
                clamp(cg + dx * (big ? 1 : 0.1), CG_LO, CG_HI),
              );
            },
          }),
        )
      : [];
    draw();
  };
  const movePoint = (i: number, wt: number, cg: number) => {
    const pts = spec.points.map((q) => ({ ...q }));
    pts[i] = { ...pts[i], weightLb: wt, momentLbIn: Math.round(wt * cg) };
    spec = { ...spec, points: pts };
    draw();
    o.onChange?.({ ...spec, points: spec.points.map((q) => ({ ...q })) });
  };
  const draw = () => {
    layer.replaceChildren();
    // grid
    for (let cg = CG_LO; cg <= CG_HI; cg++) {
      const x = xOf(cg);
      layer.append(
        s("line", {
          x1: x,
          y1: Y0,
          x2: x,
          y2: Y1,
          stroke: p.grid,
          "stroke-width": cg % 2 ? 1 : 1.4,
        }),
      );
      if (cg % 2 === 1)
        layer.append(
          label(x, Y1 + 20, String(cg), p, {
            size: 12,
            color: p.muted,
            anchor: "middle",
            weight: 500,
            halo: false,
          }),
        );
    }
    for (let wt = 1500; wt <= 2600; wt += 100) {
      const y = yOf(wt);
      layer.append(
        s("line", {
          x1: X0,
          y1: y,
          x2: X1,
          y2: y,
          stroke: p.grid,
          "stroke-width": wt % 500 ? 1 : 1.4,
        }),
      );
      if (wt % 200 === 0 || wt === 2550)
        layer.append(
          label(X0 - 10, y + 4, thousands(wt, lang), p, {
            size: 12,
            color: p.muted,
            anchor: "end",
            weight: 500,
            halo: false,
          }),
        );
    }
    layer.append(
      label(
        (X0 + X1) / 2,
        Y1 + 42,
        L(
          lang,
          "CG (inches aft of datum)",
          "Centrage (pouces en arrière de la référence)",
        ),
        p,
        { size: 12.5, color: p.muted, anchor: "middle", halo: false },
      ),
    );
    layer.append(
      label(X0 - 10, Y0 - 12, "lb", p, {
        size: 12,
        color: p.muted,
        anchor: "end",
        halo: false,
      }),
    );
    // envelopes
    const poly = (pts: [number, number][]) =>
      pts
        .map(([cg, wt], i) => `${i ? "L" : "M"}${xOf(cg)} ${yOf(wt)}`)
        .join("") + "Z";
    layer.append(
      s("path", {
        d: poly(c172sEnvelope("normal")),
        fill: p.fill,
        stroke: p.heading,
        "stroke-width": 2,
      }),
    );
    layer.append(
      s("path", {
        d: poly(c172sEnvelope("utility")),
        fill: "none",
        stroke: p.heading,
        "stroke-width": 1.4,
        "stroke-dasharray": "6 5",
        opacity: 0.8,
      }),
    );
    layer.append(
      label(xOf(44.4), yOf(2470), L(lang, "NORMAL", "NORMALE"), p, {
        size: 12,
        color: p.heading,
        anchor: "middle",
        weight: 700,
      }),
    );
    layer.append(
      label(xOf(37.6), yOf(1700), L(lang, "UTILITY", "UTILITAIRE"), p, {
        size: 11.5,
        color: p.heading,
        anchor: "middle",
        weight: 700,
      }),
    );
    layer.append(
      label(
        xOf(C172S.aftNormal) + 6,
        yOf(1560),
        `${dec(C172S.aftNormal, 1, lang)}`,
        p,
        { size: 11.5, color: p.muted, weight: 600 },
      ),
    );
    layer.append(
      label(
        xOf(C172S.fwdAt2550) - 6,
        yOf(2550) - 8,
        `${thousands(C172S.maxNormalLb, lang)} lb`,
        p,
        { size: 11.5, color: p.muted, anchor: "end", weight: 600 },
      ),
    );
    // loading line and points
    const pts = spec.points.map((q) => ({
      q,
      cg: q.weightLb > 0 ? q.momentLbIn / q.weightLb : 0,
    }));
    if (pts.length > 1)
      layer.append(
        s("path", {
          d: pts
            .map((x, i) => `${i ? "L" : "M"}${xOf(x.cg)} ${yOf(x.q.weightLb)}`)
            .join(""),
          fill: "none",
          stroke: p.text,
          "stroke-width": 1.6,
          "stroke-dasharray": "5 4",
        }),
      );
    const results = pts.map((x) => ({
      ...x,
      chk: checkCg(x.q.weightLb, x.q.momentLbIn, "normal"),
    }));
    results.forEach((x, i) => {
      const cx = xOf(x.cg);
      const cy = yOf(x.q.weightLb);
      const c = x.chk.inside ? p.ok : p.bad;
      layer.append(
        s("circle", { cx, cy, r: 7, fill: c, stroke: p.bg, "stroke-width": 2 }),
      );
      layer.append(
        label(cx + 12, cy - 10, tr(x.q.label, lang), p, {
          size: 13,
          weight: 700,
        }),
      );
      if (handles[i]) {
        layer.append(handles[i].g);
        handles[i].move(cx, cy);
        handles[i].g.setAttribute(
          "aria-valuetext",
          `${Math.round(x.q.weightLb)} lb, CG ${x.cg.toFixed(1)} in`,
        );
      }
    });
    // results table
    const tbl = s("g", { transform: `translate(${X0 - 52} ${H - 76})` });
    results.slice(0, 3).forEach((x, i) => {
      const y = i * 22;
      const why =
        x.chk.reason === "ok"
          ? L(lang, "inside", "dans les limites")
          : x.chk.reason === "aft"
            ? L(
                lang,
                `aft of ${C172S.aftNormal} in`,
                `en arrière de ${dec(C172S.aftNormal, 1, lang)} in`,
              )
            : x.chk.reason === "forward"
              ? L(lang, "forward of the limit", "en avant de la limite")
              : L(
                  lang,
                  `over ${C172S.maxNormalLb} lb`,
                  `au-dessus de ${thousands(C172S.maxNormalLb, lang)} lb`,
                );
      tbl.append(
        label(0, y, tr(x.q.label, lang), p, {
          size: 13,
          weight: 600,
          halo: false,
        }),
        label(190, y, `${thousands(x.q.weightLb, lang)} lb`, p, {
          size: 13,
          color: p.muted,
          anchor: "end",
          weight: 600,
          halo: false,
          mono: true,
        }),
        label(
          300,
          y,
          `${thousands(x.q.momentLbIn / 1000, lang) === "0" ? dec(x.q.momentLbIn / 1000, 1, lang) : dec(x.q.momentLbIn / 1000, 1, lang)}`,
          p,
          {
            size: 13,
            color: p.muted,
            anchor: "end",
            weight: 600,
            halo: false,
            mono: true,
          },
        ),
        label(390, y, `${dec(x.cg, 1, lang)} in`, p, {
          size: 13,
          color: p.text,
          anchor: "end",
          weight: 700,
          halo: false,
          mono: true,
        }),
        label(408, y, why, p, {
          size: 13,
          color: x.chk.inside ? p.ok : p.bad,
          weight: 700,
          halo: false,
        }),
      );
    });
    tbl.append(
      label(220, -22, L(lang, "moment/1000", "moment/1000"), p, {
        size: 11,
        color: p.muted,
        weight: 600,
        halo: false,
      }),
    );
    layer.append(tbl);
    const a11y =
      o.label ??
      L(lang, "C172S CG envelope: ", "Enveloppe de centrage C172S : ") +
        results
          .map(
            (x) =>
              `${tr(x.q.label, lang)} ${Math.round(x.q.weightLb)} lb, CG ${x.cg.toFixed(1)} in, ${x.chk.inside ? L(lang, "inside", "dans les limites") : L(lang, "outside", "hors limites")}`,
          )
          .join("; ");
    svg.setAttribute("aria-label", a11y);
    desc.textContent = a11y;
  };
  build();
  return {
    el: svg,
    spec: () => ({ ...spec, points: spec.points.map((q) => ({ ...q })) }),
    update(next) {
      spec = { ...next, points: next.points.map((q) => ({ ...q })) };
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
