// Ground school stage — the runways calc diagram: an aerodrome's runways drawn from their published thresholds
// (plan view, true north up, to scale; the width is exaggerated so a 30 m strip reads), each end with its
// designator and, where there is one, its displaced threshold; and the wind. Drag the wind handle (where the wind
// comes FROM) and every runway direction shows its headwind and crosswind: the one with the headwind is the runway
// in use, and it lights up.
//   headwind = wind × cos(wind − QFU)      crosswind = wind × sin(wind − QFU)     (PHAK ch. 14, runway wind)
// Slide units (SPEC slides v2 §5): viewBox = the block, labels 24 / 28 / 32 × u, theme tokens only.
import type { CalcDiagram, Lang } from "../types";
import { windDial, type WindDial } from "./diagramWind";
import {
  DEG,
  L,
  Labels,
  SW,
  clamp,
  hdg3,
  head,
  lab,
  makeWidget,
  s,
  tint,
  type DiagramOptions,
  type DiagramWidget,
} from "./svgkit";

export type RunwaysSpec = Extract<CalcDiagram, { kind: "runways" }>;

/** Head (+) / tail (−) and cross (+ from the right) components of a magnetic wind on a QFU. Pure. */
export function runwayComponents(
  qfu: number,
  windDir: number,
  windKt: number,
): { head: number; cross: number } {
  const a = (windDir - qfu) * DEG;
  return { head: windKt * Math.cos(a), cross: windKt * Math.sin(a) };
}
/** The runway direction in use: the end with the most headwind (null when calm, under 1 kt). Pure. */
export function runwayInUse(
  spec: Pick<RunwaysSpec, "strips" | "windDir" | "windKt">,
): { strip: number; end: 0 | 1; head: number; cross: number } | null {
  if (spec.windKt < 1) return null;
  let best: { strip: number; end: 0 | 1; head: number; cross: number } | null =
    null;
  spec.strips.forEach((st, i) =>
    ([0, 1] as const).forEach((e) => {
      const c = runwayComponents(st.qfu[e], spec.windDir, spec.windKt);
      if (!best || c.head > best.head + 0.01) best = { strip: i, end: e, ...c };
    }),
  );
  return best;
}
/** The QFU a designator names ("25R" → 25): runways that share it are one direction. */
const qfuNum = (id: string) => id.replace(/[LRC]$/, "");

export function createRunways(
  spec0: RunwaysSpec,
  o: DiagramOptions = {},
): DiagramWidget<RunwaysSpec> {
  const lang: Lang = o.lang ?? "en";
  const fr = lang === "fr";
  const drag = new Set(o.drag ?? spec0.drag ?? []);
  let dial: WindDial | null = null;
  let dialBox = { x: 0, y: 0, r: 0 };
  return makeWidget<RunwaysSpec>(spec0, o, [1104, 592], "cs-runways", {
    clone: (x) => JSON.parse(JSON.stringify(x)) as RunwaysSpec,
    build(sh, get, set) {
      const { W, H, u } = sh.c;
      const r = clamp(Math.min(W * 0.12, H * 0.2), 48 * u, 104 * u);
      // the dial on the right, the verdict under it (the wind caption sits right under the dial)
      dialBox = { x: W - r - 48 * u, y: Math.max(r + 56 * u, H * 0.36), r };
      dial = windDial(
        sh,
        lang,
        dialBox.x,
        dialBox.y,
        r,
        30,
        drag.has("wind"),
        (dir, kt) => set({ ...get(), windDir: dir, windKt: kt }),
        () => ({ dir: get().windDir, kt: get().windKt }),
        true,
      );
    },
    draw(sh, spec) {
      const c = sh.c;
      const { H, u, p } = c;
      const ly = sh.layer;
      const lb = new Labels(c, ly);
      dial?.set(spec.windDir, spec.windKt);
      lb.circle(dialBox.x, dialBox.y, dialBox.r + 12 * u);
      const colX = dialBox.x - dialBox.r - 48 * u;
      // the plan: the strips' ends fitted in the area left of the dial
      const pts = spec.strips.flatMap((st) => st.ends);
      const xs = pts.map((q) => q[0]);
      const ys = pts.map((q) => q[1]);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      const areaW = colX - 24 * u;
      const padX = 110 * u;
      const padY = 120 * u;
      const k = Math.min(
        (areaW - 2 * padX) / Math.max(1, x1 - x0),
        (H - 2 * padY) / Math.max(1, y1 - y0),
      );
      const cx = areaW / 2;
      const cy = H / 2 + 12 * u;
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      const X = (e: number) => cx + (e - mx) * k;
      const Y = (n: number) => cy - (n - my) * k;
      // north
      const nx = 32 * u;
      const ny = 64 * u;
      ly.append(head(c, nx, ny - 26 * u, -Math.PI / 2, p.muted, 30));
      ly.append(
        s("line", {
          x1: nx,
          y1: ny + 24 * u,
          x2: nx,
          y2: ny - 30 * u,
          stroke: p.muted,
          "stroke-width": SW.dim * u,
        }),
      );
      ly.append(
        lab(c, nx, ny + 56 * u, "N", { role: "sec", anchor: "middle" }),
      );
      lb.block({ x: nx - 24 * u, y: ny - 60 * u, w: 48 * u, h: 128 * u });
      const use = runwayInUse(spec);
      const inUseQfu =
        use === null ? null : qfuNum(spec.strips[use.strip].ids[use.end]);
      spec.strips.forEach((st, i) => {
        const [a, b] = st.ends;
        const ax = X(a[0]);
        const ay = Y(a[1]);
        const bx = X(b[0]);
        const by = Y(b[1]);
        const len = Math.hypot(bx - ax, by - ay) || 1;
        const ux = (bx - ax) / len;
        const uy = (by - ay) / len;
        const wpx = Math.max(18 * u, st.widthM * k);
        // the strip
        const nxp = -uy * (wpx / 2);
        const nyp = ux * (wpx / 2);
        const lit = (e: 0 | 1) =>
          inUseQfu !== null && qfuNum(st.ids[e]) === inUseQfu;
        const on = lit(0) || lit(1);
        ly.append(
          s("path", {
            d: `M${ax + nxp} ${ay + nyp}L${bx + nxp} ${by + nyp}L${bx - nxp} ${by - nyp}L${ax - nxp} ${ay - nyp}Z`,
            fill: on ? tint(p.accent, 0.18) : tint(p.text, 0.08),
            stroke: on ? p.accent : p.line,
            "stroke-width": (on ? SW.second : SW.constr) * u,
            "stroke-linejoin": "round",
          }),
        );
        lb.stroke(ax, ay, bx, by);
        lb.block({
          x: Math.min(ax, bx) - wpx,
          y: Math.min(ay, by) - wpx,
          w: Math.abs(bx - ax) + 2 * wpx,
          h: Math.abs(by - ay) + 2 * wpx,
        });
        // displaced thresholds: a bar across the strip where the landing threshold is
        ([0, 1] as const).forEach((e) => {
          const d = st.dthrM?.[e] ?? 0;
          if (d <= 0) return;
          const sx = e === 0 ? ax + ux * d * k : bx - ux * d * k;
          const sy = e === 0 ? ay + uy * d * k : by - uy * d * k;
          ly.append(
            s("line", {
              x1: sx + nxp * 1.5,
              y1: sy + nyp * 1.5,
              x2: sx - nxp * 1.5,
              y2: sy - nyp * 1.5,
              stroke: p.wind,
              "stroke-width": SW.hero * u,
              "stroke-linecap": "round",
            }),
          );
          const side = i === 0 ? -1 : 1;
          lb.put(
            fr ? `seuil décalé ${d} m` : `displaced ${d} m`,
            [
              [sx, sy - side * (wpx + 30 * u), "middle"],
              [sx, sy + side * (wpx + 48 * u), "middle"],
            ],
            { role: "sec", color: p.wind },
          );
        });
        // the designators, beyond each end; the ones in use in the accent
        ([0, 1] as const).forEach((e) => {
          const ex = e === 0 ? ax - ux * 40 * u : bx + ux * 40 * u;
          const ey = e === 0 ? ay - uy * 40 * u : by + uy * 40 * u;
          const mine = lit(e);
          const anchor = e === 0 ? "end" : "start";
          lb.put(
            st.ids[e],
            [
              [ex, ey + 10 * u, anchor],
              [ex, ey + (i === 0 ? -20 : 40) * u, anchor],
              [ex, ey + (i === 0 ? 40 : -20) * u, anchor],
            ],
            { role: mine ? "key" : "pri", color: mine ? p.accent : p.text },
          );
        });
        if (st.label) {
          // beside the strip, along its normal: the first strip's label above it, the others' below
          const side = i === 0 ? -1 : 1;
          const mxp = (ax + bx) / 2;
          const myp = (ay + by) / 2;
          const nx0 = -uy;
          const ny0 = ux;
          const off = (k: number) => wpx / 2 + k * u;
          lb.put(
            st.label,
            [
              [mxp + side * nx0 * off(36), myp + side * ny0 * off(36) + (side > 0 ? 24 : 4) * u, "middle"],
              [mxp - side * nx0 * off(36), myp - side * ny0 * off(36) + (side > 0 ? 4 : 24) * u, "middle"],
            ],
            { role: "sec" },
          );
        }
      });
      // the verdict under the dial: the direction in use and its wind
      const vx = dialBox.x;
      let vy = dialBox.y + dialBox.r + 112 * u;
      if (use === null) {
        ly.append(
          lab(c, vx, vy, L(lang, "Calm", "Vent calme"), {
            role: "key",
            anchor: "middle",
            color: p.muted,
          }),
        );
        ly.append(
          lab(c, vx, vy + 40 * u, L(lang, "either direction", "l’un ou l’autre sens"), {
            role: "sec",
            anchor: "middle",
          }),
        );
      } else {
        ly.append(
          lab(c, vx, vy, L(lang, `In use: ${inUseQfu}`, `En service : ${inUseQfu}`), {
            role: "key",
            anchor: "middle",
            color: p.accent,
          }),
        );
        vy += 40 * u;
        ly.append(
          lab(
            c,
            vx,
            vy,
            L(
              lang,
              `headwind ${Math.round(use.head)} kt`,
              `vent de face ${Math.round(use.head)} kt`,
            ),
            { role: "sec", anchor: "middle", color: p.ink2 },
          ),
        );
        ly.append(
          lab(
            c,
            vx,
            vy + 32 * u,
            L(
              lang,
              `crosswind ${Math.round(Math.abs(use.cross))} kt`,
              `travers ${Math.round(Math.abs(use.cross))} kt`,
            ),
            { role: "sec", anchor: "middle", color: p.ink2 },
          ),
        );
      }
    },
    label(_sh, spec) {
      const use = runwayInUse(spec);
      const names = spec.strips
        .map((st) => st.ids.join("/"))
        .join(fr ? " et " : " and ");
      const wind =
        spec.windKt < 1
          ? L(lang, "calm wind", "vent calme")
          : L(
              lang,
              `wind ${hdg3(spec.windDir)} at ${Math.round(spec.windKt)} kt`,
              `vent ${hdg3(spec.windDir)} pour ${Math.round(spec.windKt)} kt`,
            );
      const res =
        use === null
          ? ""
          : L(
              lang,
              `: runway ${qfuNum(spec.strips[use.strip].ids[use.end])} in use, ${Math.round(use.head)} kt of headwind`,
              ` : piste ${qfuNum(spec.strips[use.strip].ids[use.end])} en service, ${Math.round(use.head)} kt de vent de face`,
            );
      return L(
        lang,
        `Runways ${names}, ${wind}${res}`,
        `Pistes ${names}, ${wind}${res}`,
      );
    },
    note: () =>
      L(
        lang,
        "Runway width not to scale",
        "Largeur des pistes non à l’échelle",
      ),
  });
}
