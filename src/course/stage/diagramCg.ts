// Ground school stage — weight and balance: the loading points on the C172S CG limits chart (POH section 6:
// forward 35.0 in at 1950 lb or less, straight line to 41.0 in at 2550 lb; aft 47.3 in; utility max 2200 lb,
// aft 40.5 in). CG = moment ÷ weight. Drag: 'points' (each loading point: weight and CG).
// Slide units (SPEC slides v2 §5): viewBox = the block, labels 24 / 28 / 32 × u, theme tokens only.
import type { CalcDiagram, L10n, Lang } from "../types";
import { C172S, c172sEnvelope, checkCg } from "./diagramMath";
import {
  clamp,
  dec,
  dragHandle,
  FS,
  L,
  lab,
  Labels,
  makeWidget,
  s,
  SW,
  thousands,
  tint,
  type DiagramOptions,
  type DiagramWidget,
} from "./svgkit";
import { textWidth } from "../canvas/text";

export type CgSpec = Extract<CalcDiagram, { kind: "cgEnvelope" }>;

const tr = (t: L10n, lang: Lang) => (lang === "fr" ? (t.fr ?? t.en) : t.en);

export function createCgEnvelope(
  spec0: CgSpec,
  o: DiagramOptions = {},
): DiagramWidget<CgSpec> {
  const lang: Lang = o.lang ?? "en";
  const drag = new Set(o.drag ?? spec0.drag ?? []);
  const CG_LO = 33;
  const CG_HI = 49;
  const WT_LO = 1400;
  const WT_HI = 2650;
  let X0 = 0;
  let X1 = 1;
  let Y0 = 0;
  let Y1 = 1;
  const xOf = (cg: number) => X0 + ((cg - CG_LO) / (CG_HI - CG_LO)) * (X1 - X0);
  const yOf = (wt: number) => Y1 - ((wt - WT_LO) / (WT_HI - WT_LO)) * (Y1 - Y0);
  const cgOfX = (x: number) => CG_LO + ((x - X0) / (X1 - X0)) * (CG_HI - CG_LO);
  const wtOfY = (y: number) => WT_LO + ((Y1 - y) / (Y1 - Y0)) * (WT_HI - WT_LO);
  let handles: ReturnType<typeof dragHandle>[] = [];
  const clone = (x: CgSpec): CgSpec => ({
    ...x,
    points: x.points.map((q) => ({ ...q })),
  });
  return makeWidget<CgSpec>(spec0, o, [672, 720], "cs-cg", {
    clone,
    build(sh, get, set) {
      const { W, H, u, p } = sh.c;
      X0 = textWidth(thousands(2600, lang), FS.sec * u, 500) + 36 * u;
      X1 = W - 28 * u;
      Y0 = 56 * u;
      Y1 = H - (sh.o.card ? 210 : 104) * u;
      const move = (i: number, wt: number, cg: number) => {
        const sp = clone(get());
        sp.points[i] = {
          ...sp.points[i],
          weightLb: wt,
          momentLbIn: Math.round(wt * cg),
        };
        set(sp);
      };
      handles = drag.has("points")
        ? get().points.map((pt, i) => {
            const h = dragHandle(sh.svg, p, {
              u: u * 0.8,
              color: p.accent,
              name: `${tr(pt.label, lang)}: ${L(lang, "weight and CG", "masse et centrage")}`,
              onDrag: (x, y) =>
                move(
                  i,
                  Math.round(clamp(wtOfY(y), WT_LO, WT_HI) / 5) * 5,
                  Math.round(clamp(cgOfX(x), CG_LO, CG_HI) * 10) / 10,
                ),
              onKey: (dx, dy, big) => {
                const q = get().points[i];
                const cg = q.momentLbIn / q.weightLb;
                move(
                  i,
                  clamp(q.weightLb - dy * (big ? 50 : 10), WT_LO, WT_HI),
                  clamp(cg + dx * (big ? 1 : 0.1), CG_LO, CG_HI),
                );
              },
            });
            sh.top.append(h.g);
            return h;
          })
        : [];
    },
    draw(sh, spec) {
      const c = sh.c;
      const { u, p } = c;
      const ly = sh.layer;
      const lb = new Labels(c, ly);
      // grid: every 2 in and 200 lb
      for (let cg = CG_LO + 1; cg <= CG_HI; cg += 2) {
        const x = xOf(cg);
        ly.append(
          s("line", {
            x1: x,
            y1: Y0,
            x2: x,
            y2: Y1,
            stroke: p.grid,
            "stroke-width": SW.grid * u,
          }),
        );
        lb.put(String(cg), [[x, Y1 + 38 * u, "middle"]], { role: "sec" });
      }
      for (let wt = 1600; wt <= 2600; wt += 200) {
        const y = yOf(wt);
        ly.append(
          s("line", {
            x1: X0,
            y1: y,
            x2: X1,
            y2: y,
            stroke: p.grid,
            "stroke-width": SW.grid * u,
          }),
        );
        lb.put(thousands(wt, lang), [[X0 - 16 * u, y + 9 * u, "end"]], {
          role: "sec",
        });
      }
      lb.put(
        L(
          lang,
          "CG (in aft of datum)",
          "Centrage (in en arrière de la référence)",
        ),
        [[(X0 + X1) / 2, Y1 + 76 * u, "middle"]],
        { role: "sec" },
      );
      lb.put("lb", [[X0 - 16 * u, Y0 - 22 * u, "end"]], { role: "sec" });
      // envelopes
      const poly = (pts: [number, number][]) =>
        pts
          .map(([cg, wt], i) => `${i ? "L" : "M"}${xOf(cg)} ${yOf(wt)}`)
          .join("") + "Z";
      ly.append(
        s("path", {
          d: poly(c172sEnvelope("normal")),
          fill: tint(p.heading, 0.12),
          stroke: p.heading,
          "stroke-width": SW.constr * u,
          "stroke-linejoin": "round",
        }),
      );
      ly.append(
        s("path", {
          d: poly(c172sEnvelope("utility")),
          fill: "none",
          stroke: p.heading,
          "stroke-width": SW.constr * u,
          "stroke-dasharray": `${14 * u} ${10 * u}`,
        }),
      );
      for (const pts of [c172sEnvelope("normal"), c172sEnvelope("utility")])
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          lb.stroke(xOf(a[0]), yOf(a[1]), xOf(b[0]), yOf(b[1]));
        }
      lb.put(
        L(lang, "NORMAL", "NORMALE"),
        [
          [xOf(44.2), yOf(2440), "middle"],
          [xOf(44.2), yOf(2350), "middle"],
        ],
        { role: "sec", color: p.heading, weight: 600, spacing: 0.08 },
      );
      lb.put(
        L(lang, "UTILITY", "UTILITAIRE"),
        [
          [xOf(37.8), yOf(1720), "middle"],
          [xOf(37.8), yOf(1620), "middle"],
        ],
        { role: "sec", color: p.heading, weight: 600, spacing: 0.08 },
      );
      // loading line and points
      const pts = spec.points.map((q) => ({
        q,
        cg: q.weightLb > 0 ? q.momentLbIn / q.weightLb : 0,
      }));
      if (pts.length > 1)
        ly.append(
          s("path", {
            d: pts
              .map(
                (x, i) => `${i ? "L" : "M"}${xOf(x.cg)} ${yOf(x.q.weightLb)}`,
              )
              .join(""),
            fill: "none",
            stroke: p.text,
            "stroke-width": SW.constr * u,
            "stroke-dasharray": `${12 * u} ${9 * u}`,
          }),
        );
      const results = pts.map((x) => ({
        ...x,
        chk: checkCg(x.q.weightLb, x.q.momentLbIn, "normal"),
      }));
      results.forEach((x) => lb.circle(xOf(x.cg), yOf(x.q.weightLb), 16 * u));
      results.forEach((x, i) => {
        const cx = xOf(x.cg);
        const cy = yOf(x.q.weightLb);
        const col = x.chk.inside ? p.ok : p.bad;
        ly.append(
          s("circle", {
            cx,
            cy,
            r: 11 * u,
            fill: col,
            stroke: p.bg,
            "stroke-width": 4 * u,
          }),
        );
        lb.put(
          tr(x.q.label, lang),
          [
            [cx + 22 * u, cy - 14 * u, "start"],
            [cx - 22 * u, cy - 14 * u, "end"],
            [cx + 22 * u, cy + 34 * u, "start"],
            [cx - 22 * u, cy + 34 * u, "end"],
          ],
          {
            role: "pri",
            sub: `${thousands(x.q.weightLb, lang)} lb · ${dec(x.cg, 1, lang)} in`,
            subColor: x.chk.inside ? p.muted : p.bad,
          },
        );
        if (handles[i]) {
          handles[i].move(cx, cy);
          handles[i].g.setAttribute(
            "aria-valuetext",
            `${Math.round(x.q.weightLb)} lb, CG ${x.cg.toFixed(1)} in`,
          );
        }
      });
      if (sh.o.card) {
        results.slice(0, 3).forEach((x, i) => {
          const y = c.H - 100 * u + i * 32 * u;
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
          ly.append(
            lab(
              c,
              24 * u,
              y,
              `${tr(x.q.label, lang)} · ${thousands(x.q.weightLb, lang)} lb · ${dec(x.cg, 1, lang)} in · ${why}`,
              {
                role: "sec",
                color: x.chk.inside ? p.ink2 : p.bad,
              },
            ),
          );
        });
      }
    },
    label(_sh, spec) {
      return (
        L(lang, "C172S CG envelope: ", "Enveloppe de centrage C172S : ") +
        spec.points
          .map((q) => {
            const cg = q.weightLb > 0 ? q.momentLbIn / q.weightLb : 0;
            const chk = checkCg(q.weightLb, q.momentLbIn, "normal");
            return `${tr(q.label, lang)} ${Math.round(q.weightLb)} lb, CG ${cg.toFixed(1)} in, ${chk.inside ? L(lang, "inside", "dans les limites") : L(lang, "outside", "hors limites")}`;
          })
          .join("; ")
      );
    },
  });
}
