// Ground school stage — vertical calc diagrams: the descent / climb profile (3° ≈ 318 ft/NM, VS ≈ GS × 5;
// AIM 5-4-5, IFH ch. 10) and the VDP on a non-precision final ((MDA − TDZE) / 300 NM, FAA IFH / AIM 5-4-5).
// Slide units (SPEC slides v2 §5): viewBox = the block, labels 24 / 28 / 32 × u, the worked numbers outside.
import type { CalcDiagram, Lang } from "../types";
import { angleOfFtPerNm, solveProfile, vdpNm } from "./diagramMath";
import {
  clamp,
  dec,
  dimLine,
  dragHandle,
  fixMark,
  FS,
  L,
  lab,
  Labels,
  makeWidget,
  num,
  s,
  SW,
  thousands,
  type DiagramOptions,
  type DiagramWidget,
} from "./svgkit";
import { textWidth } from "../canvas/text";

export type ProfileSpec = Extract<CalcDiagram, { kind: "profile" }>;
export type VdpSpec = Extract<CalcDiagram, { kind: "vdp" }>;

const niceStep = (span: number, target: number): number => {
  const raw = span / Math.max(1, target);
  const p10 = Math.pow(10, Math.floor(Math.log10(raw)));
  for (const k of [1, 2, 2.5, 5, 10]) if (raw <= k * p10) return k * p10;
  return 10 * p10;
};

/**
 * Side view of a descent (or climb): the level segment, the top of descent, the path at its gradient and the
 * level-off at `toFt`, distances counted back from the level-off point. The altitude to lose and the distance
 * are dimensioned; the gradient sits beside the slope. Drag: 'tod' (the top of descent: the gradient re-solves).
 */
export function createProfile(
  spec0: ProfileSpec,
  o: DiagramOptions = {},
): DiagramWidget<ProfileSpec> {
  const lang: Lang = o.lang ?? "en";
  const drag = new Set(o.drag ?? spec0.drag ?? []);
  let maxNm = 10;
  let altLo = 0;
  let altHi = 1000;
  let X0 = 0;
  let X1 = 1;
  let Y0 = 0;
  let Y1 = 1;
  const xOf = (nmBefore: number) => X1 - (nmBefore / maxNm) * (X1 - X0);
  const yOf = (ft: number) => Y1 - ((ft - altLo) / (altHi - altLo)) * (Y1 - Y0);
  let hd: ReturnType<typeof dragHandle> | null = null;
  const lose = (sp: ProfileSpec) => Math.abs(sp.fromFt - sp.toFt);
  return makeWidget<ProfileSpec>(spec0, o, [1104, 552], "cs-profile", {
    build(sh, get, set) {
      const { W, H, u, p } = sh.c;
      const spec = get();
      const sol = solveProfile(spec);
      maxNm = Math.max(
        4,
        Math.ceil((sol.distNm * 1.3) / 2) * 2,
        ...(spec.marks ?? []).map((m) => Math.ceil(m.distNm + 1)),
      );
      const lo = Math.min(spec.fromFt, spec.toFt);
      const hi = Math.max(spec.fromFt, spec.toFt);
      const pad = Math.max(300, (hi - lo) * 0.25);
      const st = niceStep(hi - lo + 2 * pad, 4);
      altLo = Math.max(0, Math.floor((lo - pad) / st) * st);
      altHi = Math.ceil((hi + (hi - lo) * 0.1 + 1) / (st / 2)) * (st / 2);
      const tick = textWidth(thousands(altHi, lang), FS.sec * u, 500);
      X0 = tick + 36 * u;
      const dimW = Math.max(
        textWidth(`${thousands(lose(spec), lang)} ft`, FS.pri * u, 600),
        textWidth(L(lang, "to lose", "à perdre"), FS.sec * u, 500),
      );
      X1 = W - dimW - 72 * u;
      Y0 = 88 * u;
      Y1 = H - (sh.o.card ? 130 : 64) * u;
      hd = drag.has("tod")
        ? dragHandle(sh.svg, p, {
            u,
            color: p.accent,
            name: L(lang, "Top of descent", "Début de descente"),
            onDrag: (x) =>
              setDist(
                get(),
                set,
                clamp(((X1 - x) / (X1 - X0)) * maxNm, 0.5, maxNm),
              ),
            onKey: (dx, _dy, big) =>
              setDist(
                get(),
                set,
                clamp(
                  solveProfile(get()).distNm - dx * (big ? 1 : 0.1),
                  0.5,
                  maxNm,
                ),
              ),
          })
        : null;
      if (hd) sh.top.append(hd.g);
    },
    draw(sh, spec) {
      const c = sh.c;
      const { u, p } = c;
      const ly = sh.layer;
      const lb = new Labels(c, ly);
      const sol = solveProfile(spec);
      const descending = spec.fromFt >= spec.toFt;
      // altitude grid and axis
      const ast = niceStep(altHi - altLo, 4);
      for (let a = altLo; a <= altHi + 1e-6; a += ast) {
        const y = yOf(a);
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
        lb.put(thousands(a, lang), [[X0 - 20 * u, y + 9 * u, "end"]], {
          role: "sec",
        });
      }
      lb.put("ft", [[X0 - 20 * u, Y0 - 40 * u, "end"]], { role: "sec" });
      const dst = niceStep(maxNm, 4);
      for (let d = 0; d <= maxNm + 1e-6; d += dst) {
        const x = xOf(d);
        ly.append(
          s("line", {
            x1: x,
            y1: Y1,
            x2: x,
            y2: Y1 + 10 * u,
            stroke: p.line,
            "stroke-width": SW.dim * u,
          }),
        );
        lb.put(
          `${dec(d, dst % 1 ? 1 : 0, lang)}${d === 0 ? " NM" : ""}`,
          [[x, Y1 + 44 * u, d === 0 ? "start" : "middle"]],
          { role: "sec" },
        );
      }
      ly.append(
        s("line", {
          x1: X0,
          y1: Y1,
          x2: X1,
          y2: Y1,
          stroke: p.line,
          "stroke-width": SW.dim * u,
        }),
      );
      // the path
      const xTod = xOf(sol.distNm);
      const yFrom = yOf(spec.fromFt);
      const yTo = yOf(spec.toFt);
      ly.append(
        s("line", {
          x1: xTod,
          y1: yFrom,
          x2: xTod,
          y2: Y1,
          stroke: p.line,
          "stroke-width": 2 * u,
          "stroke-dasharray": `${6 * u} ${8 * u}`,
        }),
      );
      ly.append(
        s("path", {
          d: `M${X0} ${yFrom}L${xTod} ${yFrom}L${X1} ${yTo}`,
          fill: "none",
          stroke: p.track,
          "stroke-width": SW.hero * u,
          "stroke-linejoin": "round",
          "stroke-linecap": "round",
        }),
      );
      lb.stroke(X0, yFrom, xTod, yFrom, X1, yTo);
      ly.append(s("circle", { cx: X1, cy: yTo, r: 9 * u, fill: p.track }));
      if (!hd)
        ly.append(
          s("circle", {
            cx: xTod,
            cy: yFrom,
            r: 11 * u,
            fill: p.bg,
            stroke: p.accent,
            "stroke-width": 4 * u,
          }),
        );
      lb.circle(xTod, yFrom, 40 * u);
      // marks (fixes)
      for (const m of spec.marks ?? []) {
        const x = xOf(m.distNm);
        const pathAlt =
          m.distNm >= sol.distNm
            ? spec.fromFt
            : spec.toFt + (descending ? 1 : -1) * m.distNm * sol.ftPerNm;
        const y = yOf(m.altFt ?? pathAlt);
        ly.append(fixMark(c, x, y, p.nav));
        lb.put(
          m.label,
          [
            [x, y - 30 * u, "middle"],
            [x, y + 50 * u, "middle"],
          ],
          { role: "sec", color: p.nav, weight: 600 },
        );
      }
      // labels: top of descent, the gradient beside the slope, the two dimensions
      lb.put(
        descending
          ? L(lang, "Top of descent", "Début de descente")
          : L(lang, "Top of climb", "Fin de montée"),
        [
          [xTod, yFrom - 40 * u, "middle"],
          [xTod - 30 * u, yFrom - 40 * u, "end"],
          [xTod + 30 * u, yFrom - 40 * u, "start"],
        ],
        { role: "pri" },
      );
      const ang = `${dec(sol.angleDeg, 1, lang).replace(/[.,]0$/, "")}°`;
      const grad = `${dec(sol.ftPerNm, 0, lang)} ft/NM`;
      const sx = (t: number) => xTod + (X1 - xTod) * t;
      const sy = (t: number) => yFrom + (yTo - yFrom) * t;
      lb.put(
        `${ang}  ${grad}`,
        [
          [sx(0.55), sy(0.55) - 34 * u, "start"],
          [sx(0.4), sy(0.4) - 34 * u, "start"],
          [sx(0.55), sy(0.55) + 56 * u, "end"],
        ],
        {
          role: "pri",
          parts: [{ t: `${ang}  `, color: p.track }, { t: grad }],
        },
      );
      // altitude to lose, at the right
      const xd = X1 + 36 * u;
      ly.append(dimLine(c, xd, yFrom, xd, yTo, p.ink2));
      lb.put(
        `${thousands(lose(spec), lang)} ft`,
        [[xd + 22 * u, (yFrom + yTo) / 2, "start"]],
        {
          role: "pri",
          sub: descending
            ? L(lang, "to lose", "à perdre")
            : L(lang, "to climb", "à monter"),
          subColor: p.muted,
        },
      );
      // distance, above the axis
      const yDim =
        Math.max(yTo, yFrom) + 64 * u < Y1 - 20 * u ? Y1 - 32 * u : Y1 + 0;
      if (X1 - xTod > 60 * u) {
        ly.append(dimLine(c, xTod, yDim, X1, yDim, p.ink2));
        lb.put(
          `${dec(sol.distNm, 1, lang)} NM`,
          [
            [(xTod + X1) / 2, yDim - 18 * u, "middle"],
            [(xTod + X1) / 2, yDim + 38 * u, "middle"],
          ],
          { role: "pri" },
        );
      }
      if (sh.o.card) {
        const y = c.H - 70 * u;
        ly.append(
          lab(
            c,
            X0,
            y,
            `${thousands(lose(spec), lang)} ft ÷ ${dec(sol.ftPerNm, 0, lang)} ft/NM = ${dec(sol.distNm, 1, lang)} NM`,
            { role: "sec", color: p.ink2 },
          ),
        );
        if (sol.vsFpm !== null && spec.gsKt) {
          const rule =
            Math.abs(angleOfFtPerNm(sol.ftPerNm) - 3) < 0.15
              ? ` (≈ GS × 5 = ${thousands(spec.gsKt * 5, lang)})`
              : "";
          ly.append(
            lab(
              c,
              X0,
              y + 34 * u,
              `VS ${thousands(sol.vsFpm, lang)} ft/min ${L(lang, "at", "à")} GS ${spec.gsKt} kt${rule}`,
              { role: "sec", color: p.heading, weight: 600 },
            ),
          );
        }
      }
      if (hd) {
        hd.move(xTod, yFrom);
        hd.g.setAttribute(
          "aria-valuetext",
          `${dec(sol.distNm, 1, lang)} NM, ${Math.round(sol.ftPerNm)} ft/NM`,
        );
      }
    },
    note: (sh, spec) => {
      // the path is drawn steeper than it is: say by how much
      const sol = solveProfile(spec);
      const pxPerFtV = (Y1 - Y0) / (altHi - altLo);
      const pxPerFtH = (X1 - X0) / (maxNm * 6076.12);
      const ex = pxPerFtV / pxPerFtH;
      void sh;
      void sol;
      return ex > 1.5
        ? L(
            lang,
            `vertical scale × ${num(Math.round(ex), lang, 0)}`,
            `échelle verticale × ${num(Math.round(ex), lang, 0)}`,
          )
        : null;
    },
    label(_sh, spec) {
      const sol = solveProfile(spec);
      return L(
        lang,
        `Descent profile from ${spec.fromFt} ft to ${spec.toFt} ft at ${Math.round(sol.ftPerNm)} ft per NM (${sol.angleDeg.toFixed(1)} degrees): start ${sol.distNm.toFixed(1)} NM before${sol.vsFpm !== null ? `, ${Math.round(sol.vsFpm)} ft per minute at ${spec.gsKt} kt` : ""}.`,
        `Profil de descente de ${spec.fromFt} ft à ${spec.toFt} ft à ${Math.round(sol.ftPerNm)} ft par NM (${sol.angleDeg.toFixed(1)} degrés) : début ${sol.distNm.toFixed(1)} NM avant${sol.vsFpm !== null ? `, ${Math.round(sol.vsFpm)} ft par minute à ${spec.gsKt} kt` : ""}.`,
      );
    },
  });
  function setDist(
    spec: ProfileSpec,
    set: (n: ProfileSpec) => void,
    nm: number,
  ) {
    set({
      ...spec,
      ftPerNm: Math.round(lose(spec) / (Math.round(nm * 10) / 10)),
      angleDeg: undefined,
      distNm: undefined,
    });
  }
}

/**
 * The final segment of a non-precision approach: TDZE, MDA, the 3° path from the threshold, the VDP where the
 * path meets the MDA ((MDA − TDZE) / 300 NM) and the MAP. Drag: 'mda'.
 */
export function createVdp(
  spec0: VdpSpec,
  o: DiagramOptions = {},
): DiagramWidget<VdpSpec> {
  const lang: Lang = o.lang ?? "en";
  const drag = new Set(o.drag ?? spec0.drag ?? []);
  const maxNm = 4;
  let maxHat = 1000;
  let X0 = 0;
  let XT = 1;
  let RW = 1;
  let Y0 = 0;
  let YG = 1;
  const xOf = (nm: number) => XT - (nm / maxNm) * (XT - X0);
  const yOf = (hat: number) => YG - (hat / maxHat) * (YG - Y0);
  let hd: ReturnType<typeof dragHandle> | null = null;
  const withVdp = (n: VdpSpec): VdpSpec => ({
    ...n,
    vdpNm: Math.round(vdpNm(n.mdaFt, n.tdzeFt).rule * 100) / 100,
  });
  return makeWidget<VdpSpec>(spec0, o, [1104, 600], "cs-vdp", {
    build(sh, get, set) {
      const { W, H, u, p } = sh.c;
      const spec = get();
      maxHat = Math.max(
        600,
        Math.ceil(((spec.mdaFt - spec.tdzeFt) * 1.6) / 100) * 100,
      );
      X0 = 48 * u;
      RW = Math.max(120 * u, W * 0.12);
      XT = W - RW - 40 * u;
      Y0 = 72 * u;
      YG = H - (sh.o.card ? 150 : 100) * u;
      hd = drag.has("mda")
        ? dragHandle(sh.svg, p, {
            u,
            color: p.accent,
            name: "MDA",
            onDrag: (_x, y) => {
              const sp = get();
              const hat = clamp(((YG - y) / (YG - Y0)) * maxHat, 200, maxHat);
              set(
                withVdp({
                  ...sp,
                  mdaFt: sp.tdzeFt + Math.round(hat / 20) * 20,
                }),
              );
            },
            onKey: (_dx, dy, big) => {
              const sp = get();
              set(
                withVdp({
                  ...sp,
                  mdaFt: clamp(
                    sp.mdaFt - dy * (big ? 100 : 20),
                    sp.tdzeFt + 200,
                    sp.tdzeFt + maxHat,
                  ),
                }),
              );
            },
          })
        : null;
      if (hd) sh.top.append(hd.g);
    },
    draw(sh, spec) {
      const c = sh.c;
      const { u, p } = c;
      const ly = sh.layer;
      const lb = new Labels(c, ly);
      const hat = spec.mdaFt - spec.tdzeFt;
      const v = vdpNm(spec.mdaFt, spec.tdzeFt);
      const vdp = spec.vdpNm ?? v.rule;
      // ground, runway, NM ticks from the threshold
      ly.append(
        s("line", {
          x1: X0 - 20 * u,
          y1: YG,
          x2: XT + RW + 20 * u,
          y2: YG,
          stroke: p.line,
          "stroke-width": SW.dim * u,
        }),
      );
      ly.append(
        s("rect", {
          x: XT,
          y: YG - 7 * u,
          width: RW,
          height: 14 * u,
          rx: 3 * u,
          fill: p.text,
        }),
      );
      lb.block({ x: XT, y: YG - 7 * u, w: RW, h: 14 * u });
      for (let d = 0; d <= maxNm; d++) {
        const x = xOf(d);
        ly.append(
          s("line", {
            x1: x,
            y1: YG,
            x2: x,
            y2: YG + 12 * u,
            stroke: p.line,
            "stroke-width": SW.dim * u,
          }),
        );
        lb.put(`${d}`, [[x, YG + 46 * u, "middle"]], { role: "sec" });
      }
      lb.put(
        L(lang, "NM from the threshold", "NM du seuil"),
        [[X0 - 20 * u, YG + 86 * u, "start"]],
        { role: "sec" },
      );
      lb.put(
        `TDZE ${thousands(spec.tdzeFt, lang)} ft`,
        [
          [XT + RW / 2, YG + 46 * u, "middle"],
          [XT + RW, YG - 30 * u, "end"],
        ],
        { role: "sec" },
      );
      // 3° path
      const ftAt = (nm: number) => nm * 6076.12 * Math.tan((3 * Math.PI) / 180);
      const nmTop = Math.min(maxNm, (maxHat * 0.98) / ftAt(1));
      ly.append(
        s("line", {
          x1: XT,
          y1: YG,
          x2: xOf(nmTop),
          y2: yOf(ftAt(nmTop)),
          stroke: p.nav,
          "stroke-width": SW.second * u,
          "stroke-dasharray": `${18 * u} ${12 * u}`,
        }),
      );
      lb.stroke(XT, YG, xOf(nmTop), yOf(ftAt(nmTop)));
      // MDA
      const yM = yOf(hat);
      ly.append(
        s("line", {
          x1: X0 - 20 * u,
          y1: yM,
          x2: XT + RW,
          y2: yM,
          stroke: p.wind,
          "stroke-width": SW.second * u,
        }),
      );
      lb.stroke(X0 - 20 * u, yM, XT + RW, yM);
      if (hd) lb.circle(X0 + 24 * u, yM, 40 * u);
      // VDP
      const xV = xOf(vdp);
      ly.append(
        s("line", {
          x1: xV,
          y1: yM,
          x2: xV,
          y2: YG,
          stroke: p.heading,
          "stroke-width": 2.5 * u,
          "stroke-dasharray": `${6 * u} ${8 * u}`,
        }),
      );
      const k = 16 * u;
      ly.append(
        s("path", {
          d: `M${xV} ${yM - k}L${xV + k * 0.75} ${yM}L${xV} ${yM + k}L${xV - k * 0.75} ${yM}Z`,
          fill: p.heading,
        }),
      );
      lb.circle(xV, yM, k);
      if (spec.mapNm !== undefined) {
        const xm = xOf(spec.mapNm);
        ly.append(
          s("line", {
            x1: xm,
            y1: yM,
            x2: xm,
            y2: YG,
            stroke: p.bad,
            "stroke-width": 2.5 * u,
            "stroke-dasharray": `${3 * u} ${6 * u}`,
          }),
        );
        lb.stroke(xm, yM, xm, YG);
        lb.put(
          "MAP",
          [
            [xm + 12 * u, YG - 20 * u, "start"],
            [xm - 12 * u, YG - 20 * u, "end"],
          ],
          { role: "sec", color: p.bad, weight: 600 },
        );
      }
      lb.put(
        `VDP ${dec(vdp, 1, lang)} NM`,
        [
          [xV, yM - 32 * u, "middle"],
          [xV + 20 * u, yM - 32 * u, "start"],
          [xV, yM + 56 * u, "middle"],
        ],
        {
          role: "key",
          color: p.heading,
        },
      );
      lb.put(
        `MDA ${thousands(spec.mdaFt, lang)} ft`,
        [
          [X0 + 72 * u, yM - 58 * u, "start"],
          [X0, yM - 58 * u, "start"],
          [X0 + 72 * u, yM + 44 * u, "start"],
        ],
        {
          role: "pri",
          color: p.wind,
          sub: `HAT ${thousands(hat, lang)} ft`,
          subColor: p.muted,
        },
      );
      const pl = (t: number): [number, number] => [
        xOf(nmTop * t),
        yOf(ftAt(nmTop * t)),
      ];
      const [px, py] = pl(0.78);
      lb.put(
        L(lang, "3° path · 318 ft/NM", "plan 3° · 318 ft/NM"),
        [
          [pl(0.62)[0] + 36 * u, pl(0.62)[1] - 6 * u, "start"],
          [pl(0.45)[0] + 36 * u, pl(0.45)[1] - 6 * u, "start"],
          [px - 24 * u, py - 20 * u, "end"],
          [px + 24 * u, py + 40 * u, "start"],
        ],
        { role: "sec", color: p.nav, weight: 600 },
      );
      if (sh.o.card)
        ly.append(
          lab(
            c,
            X0 - 20 * u,
            c.H - 16 * u,
            `VDP = (${thousands(spec.mdaFt, lang)} − ${thousands(spec.tdzeFt, lang)}) ÷ 300 = ${dec(v.rule, 2, lang)} NM · ${L(lang, "exact 3°", "exact 3°")} ${dec(v.exact, 2, lang)} NM`,
            {
              role: "sec",
              color: p.ink2,
              weight: 600,
            },
          ),
        );
      if (hd) {
        hd.move(X0 + 24 * u, yM);
        hd.g.setAttribute("aria-valuetext", `MDA ${spec.mdaFt}`);
      }
    },
    note: () =>
      L(lang, "vertical scale exaggerated", "échelle verticale exagérée"),
    label(_sh, spec) {
      const hat = spec.mdaFt - spec.tdzeFt;
      const vdp = spec.vdpNm ?? vdpNm(spec.mdaFt, spec.tdzeFt).rule;
      return L(
        lang,
        `VDP: MDA ${spec.mdaFt} ft, TDZE ${spec.tdzeFt} ft, height above touchdown ${hat} ft, VDP ${vdp.toFixed(1)} NM from the threshold.`,
        `VDP : MDA ${spec.mdaFt} ft, TDZE ${spec.tdzeFt} ft, hauteur ${hat} ft, VDP à ${vdp.toFixed(1)} NM du seuil.`,
      );
    },
  });
}
