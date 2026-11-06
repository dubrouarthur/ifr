// Ground school stage — vertical calc diagrams: the descent / climb profile (3° ≈ 318 ft/NM, VS ≈ GS × 5;
// AIM 5-4-5, IFH ch. 10) and the VDP on a non-precision final ((MDA − TDZE) / 300 NM, FAA IFH / AIM 5-4-5).
import type { CalcDiagram, Lang } from "../types";
import { angleOfFtPerNm, solveProfile, vdpNm, vsOf } from "./diagramMath";
import {
  arrow,
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
 * level-off at `toFt`, distances counted back from the level-off point (marks use the same convention: NM
 * before it). Readouts: ft/NM, angle, %, the distance needed and the VS at the ground speed (exact and ≈ GS × 5).
 * Drag: 'tod' (move the top of descent: the gradient re-solves).
 */
export function createProfile(
  spec0: ProfileSpec,
  o: DiagramOptions = {},
): DiagramWidget<ProfileSpec> {
  const W = 880;
  const H = 400;
  const lang: Lang = o.lang ?? "en";
  const drag = new Set(o.drag ?? spec0.drag ?? []);
  let theme: DiagramTheme = o.theme ?? "dark";
  let spec: ProfileSpec = { ...spec0 };
  const svg = rootSvg(W, H, "cs-profile");
  const desc = s("desc");
  let p = PALETTES[theme];
  let layer = s("g");
  let handle: ReturnType<typeof dragHandle> | null = null;
  const X0 = 86;
  const X1 = W - 40;
  const Y0 = 52;
  const Y1 = H - 126;
  let maxNm = 10;
  let altLo = 0;
  let altHi = 1000;
  const xOf = (nmBefore: number) => X1 - (nmBefore / maxNm) * (X1 - X0);
  const yOf = (ft: number) => Y1 - ((ft - altLo) / (altHi - altLo)) * (Y1 - Y0);
  const fitAxes = () => {
    const sol = solveProfile(spec);
    maxNm = Math.max(
      4,
      Math.ceil((sol.distNm * 1.35) / 2) * 2,
      ...(spec.marks ?? []).map((m) => Math.ceil(m.distNm + 1)),
    );
    const lo = Math.min(spec.fromFt, spec.toFt);
    const hi = Math.max(spec.fromFt, spec.toFt);
    const pad = Math.max(300, (hi - lo) * 0.18);
    const st = niceStep(hi - lo + 2 * pad, 5);
    altLo = Math.max(0, Math.floor((lo - pad) / st) * st);
    altHi = Math.ceil((hi + pad) / st) * st;
  };
  const build = () => {
    p = PALETTES[theme];
    fitAxes();
    svg.replaceChildren(desc, s("rect", { width: W, height: H, fill: p.bg }));
    layer = s("g");
    svg.append(layer);
    handle = drag.has("tod")
      ? dragHandle(svg, p, {
          color: p.heading,
          name: L(lang, "Top of descent", "Début de descente"),
          onDrag: (x) => {
            const nm = clamp(((X1 - x) / (X1 - X0)) * maxNm, 0.5, maxNm);
            setDist(Math.round(nm * 10) / 10);
          },
          onKey: (dx, _dy, big) =>
            setDist(
              clamp(
                solveProfile(spec).distNm - dx * (big ? 1 : 0.1),
                0.5,
                maxNm,
              ),
            ),
        })
      : null;
    draw();
  };
  const setDist = (nm: number) => {
    const lose = Math.abs(spec.fromFt - spec.toFt);
    const next: ProfileSpec = {
      ...spec,
      ftPerNm: Math.round(lose / nm),
      angleDeg: undefined,
      distNm: undefined,
    };
    spec = next;
    draw();
    o.onChange?.({ ...spec });
  };
  const draw = () => {
    layer.replaceChildren();
    const sol = solveProfile(spec);
    const descending = spec.fromFt >= spec.toFt;
    // grid + axes
    const ast = niceStep(altHi - altLo, 5);
    for (let a = altLo; a <= altHi + 1e-6; a += ast) {
      const y = yOf(a);
      layer.append(
        s("line", {
          x1: X0,
          y1: y,
          x2: X1,
          y2: y,
          stroke: p.grid,
          "stroke-width": 1,
        }),
      );
      layer.append(
        label(X0 - 10, y + 4, thousands(a, lang), p, {
          size: 12,
          color: p.muted,
          anchor: "end",
          weight: 500,
          halo: false,
        }),
      );
    }
    const dst = niceStep(maxNm, 8);
    for (let d = 0; d <= maxNm + 1e-6; d += dst) {
      const x = xOf(d);
      layer.append(
        s("line", {
          x1: x,
          y1: Y1,
          x2: x,
          y2: Y1 + 6,
          stroke: p.line,
          "stroke-width": 1.2,
        }),
      );
      layer.append(
        label(x, Y1 + 22, dec(d, dst % 1 ? 1 : 0, lang), p, {
          size: 12,
          color: p.muted,
          anchor: "middle",
          weight: 500,
          halo: false,
        }),
      );
    }
    layer.append(
      s("line", {
        x1: X0,
        y1: Y1,
        x2: X1,
        y2: Y1,
        stroke: p.line,
        "stroke-width": 1.4,
      }),
    );
    layer.append(
      label(X0 - 10, Y0 - 18, "ft", p, {
        size: 12,
        color: p.muted,
        anchor: "end",
        halo: false,
      }),
    );
    layer.append(
      label(
        X1,
        Y1 + 40,
        L(
          lang,
          "NM before the level-off point",
          "NM avant le point de mise en palier",
        ),
        p,
        { size: 12, color: p.muted, anchor: "end", halo: false },
      ),
    );
    // the path
    const xTod = xOf(sol.distNm);
    const yFrom = yOf(spec.fromFt);
    const yTo = yOf(spec.toFt);
    layer.append(
      s("path", {
        d: `M${X0} ${yFrom}L${xTod} ${yFrom}L${X1} ${yTo}`,
        fill: "none",
        stroke: p.track,
        "stroke-width": 3.2,
        "stroke-linejoin": "round",
      }),
    );
    layer.append(
      s("line", {
        x1: X1,
        y1: yTo,
        x2: X1,
        y2: Y1,
        stroke: p.line,
        "stroke-width": 1,
        "stroke-dasharray": "3 4",
      }),
    );
    layer.append(
      s("line", {
        x1: xTod,
        y1: yFrom,
        x2: xTod,
        y2: Y1,
        stroke: p.heading,
        "stroke-width": 1.2,
        "stroke-dasharray": "4 4",
      }),
    );
    // dimension: altitude to lose
    layer.append(arrow(X1 + 18, yFrom, X1 + 18, yTo, p.wind, 1.8, 9));
    layer.append(
      label(
        xTod - 10,
        yFrom - 12,
        `${descending ? "TOD" : "TOC"} · ${dec(sol.distNm, 1, lang)} NM`,
        p,
        { size: 14, color: p.heading, anchor: "end", weight: 700 },
      ),
    );
    layer.append(
      label(
        X1 - 6,
        yTo + (descending ? -12 : 22),
        thousands(spec.toFt, lang) + " ft",
        p,
        { size: 13, color: p.text, anchor: "end", weight: 700 },
      ),
    );
    layer.append(
      label(X0 + 4, yFrom - 12, thousands(spec.fromFt, lang) + " ft", p, {
        size: 13,
        color: p.text,
        weight: 700,
      }),
    );
    // marks (fixes)
    for (const m of spec.marks ?? []) {
      const x = xOf(m.distNm);
      const pathAlt =
        m.distNm >= sol.distNm
          ? spec.fromFt
          : spec.toFt + (descending ? 1 : -1) * m.distNm * sol.ftPerNm;
      const y = yOf(m.altFt ?? pathAlt);
      layer.append(
        s("line", {
          x1: x,
          y1: Y1,
          x2: x,
          y2: y,
          stroke: p.nav,
          "stroke-width": 1,
          "stroke-dasharray": "2 4",
        }),
      );
      layer.append(
        s("path", {
          d: `M${x} ${y - 7}L${x + 7} ${y + 5}L${x - 7} ${y + 5}Z`,
          fill: p.bg,
          stroke: p.nav,
          "stroke-width": 1.8,
        }),
      );
      layer.append(
        label(x, y - 14, m.label, p, {
          size: 12.5,
          color: p.nav,
          anchor: "middle",
          weight: 700,
        }),
      );
      if (m.altFt !== undefined)
        layer.append(
          label(x, y + 22, thousands(m.altFt, lang), p, {
            size: 11.5,
            color: p.muted,
            anchor: "middle",
            weight: 600,
          }),
        );
    }
    // readout card
    const card = s("g", { transform: `translate(${X0} ${H - 62})` });
    const lose = Math.abs(spec.fromFt - spec.toFt);
    card.append(
      label(
        0,
        0,
        `${dec(sol.ftPerNm, 0, lang)} ft/NM · ${dec(sol.angleDeg, 1, lang)}° · ${dec(sol.pct, 1, lang)} %`,
        p,
        { size: 16, color: p.track, weight: 700, mono: true },
      ),
      label(
        0,
        24,
        `${thousands(lose, lang)} ft ÷ ${dec(sol.ftPerNm, 0, lang)} ft/NM = ${dec(sol.distNm, 1, lang)} NM`,
        p,
        { size: 13, color: p.muted, weight: 600, mono: true },
      ),
    );
    if (sol.vsFpm !== null && spec.gsKt) {
      const rule =
        Math.abs(angleOfFtPerNm(sol.ftPerNm) - 3) < 0.15
          ? ` (≈ GS × 5 = ${thousands(spec.gsKt * 5, lang)})`
          : "";
      card.append(
        label(470, 0, `VS ${thousands(sol.vsFpm, lang)} ft/min`, p, {
          size: 16,
          color: p.heading,
          weight: 700,
          mono: true,
        }),
        label(
          470,
          24,
          `${L(lang, "at", "à")} GS ${spec.gsKt} kt: ${dec(sol.ftPerNm, 0, lang)} × ${spec.gsKt} ÷ 60${rule}`,
          p,
          { size: 13, color: p.muted, weight: 600, mono: true },
        ),
      );
    }
    layer.append(card);
    if (handle) {
      layer.append(handle.g);
      handle.move(xTod, yFrom);
      handle.g.setAttribute(
        "aria-valuetext",
        `${dec(sol.distNm, 1, lang)} NM, ${Math.round(sol.ftPerNm)} ft/NM`,
      );
    }
    const a11y =
      o.label ??
      L(
        lang,
        `Descent profile from ${spec.fromFt} ft to ${spec.toFt} ft at ${Math.round(sol.ftPerNm)} ft per NM (${sol.angleDeg.toFixed(1)} degrees): start ${sol.distNm.toFixed(1)} NM before${sol.vsFpm !== null ? `, ${Math.round(sol.vsFpm)} ft per minute at ${spec.gsKt} kt` : ""}.`,
        `Profil de descente de ${spec.fromFt} ft à ${spec.toFt} ft à ${Math.round(sol.ftPerNm)} ft par NM (${sol.angleDeg.toFixed(1)} degrés) : début ${sol.distNm.toFixed(1)} NM avant${sol.vsFpm !== null ? `, ${Math.round(sol.vsFpm)} ft par minute à ${spec.gsKt} kt` : ""}.`,
      );
    svg.setAttribute("aria-label", a11y);
    desc.textContent = a11y;
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

/**
 * The final segment of a non-precision approach: TDZE, MDA, the 3° path from the threshold, the VDP where the
 * path meets the MDA ((MDA − TDZE) / 300 NM) and the MAP. Drag: 'mda'.
 */
export function createVdp(
  spec0: VdpSpec,
  o: DiagramOptions = {},
): DiagramWidget<VdpSpec> {
  const W = 880;
  const H = 360;
  const lang: Lang = o.lang ?? "en";
  const drag = new Set(o.drag ?? spec0.drag ?? []);
  let theme: DiagramTheme = o.theme ?? "dark";
  let spec: VdpSpec = { ...spec0 };
  const svg = rootSvg(W, H, "cs-vdp");
  const desc = s("desc");
  let p = PALETTES[theme];
  let layer = s("g");
  let handle: ReturnType<typeof dragHandle> | null = null;
  const X0 = 70;
  const XT = W - 150;
  const Y0 = 56;
  const YG = H - 110;
  const maxNm = 4;
  let maxHat = 1000;
  const xOf = (nm: number) => XT - (nm / maxNm) * (XT - X0);
  const yOf = (hat: number) => YG - (hat / maxHat) * (YG - Y0);
  const build = () => {
    p = PALETTES[theme];
    maxHat = Math.max(
      600,
      Math.ceil(((spec.mdaFt - spec.tdzeFt) * 1.5) / 100) * 100,
    );
    svg.replaceChildren(desc, s("rect", { width: W, height: H, fill: p.bg }));
    layer = s("g");
    svg.append(layer);
    handle = drag.has("mda")
      ? dragHandle(svg, p, {
          color: p.wind,
          name: "MDA",
          onDrag: (_x, y) => {
            const hat = clamp(((YG - y) / (YG - Y0)) * maxHat, 200, maxHat);
            set({ ...spec, mdaFt: spec.tdzeFt + Math.round(hat / 20) * 20 });
          },
          onKey: (_dx, dy, big) =>
            set({
              ...spec,
              mdaFt: clamp(
                spec.mdaFt - dy * (big ? 100 : 20),
                spec.tdzeFt + 200,
                spec.tdzeFt + maxHat,
              ),
            }),
        })
      : null;
    draw();
  };
  const set = (next: VdpSpec) => {
    const v = vdpNm(next.mdaFt, next.tdzeFt);
    spec = { ...next, vdpNm: Math.round(v.rule * 100) / 100 };
    draw();
    o.onChange?.({ ...spec });
  };
  const draw = () => {
    layer.replaceChildren();
    const hat = spec.mdaFt - spec.tdzeFt;
    const v = vdpNm(spec.mdaFt, spec.tdzeFt);
    const vdp = spec.vdpNm ?? v.rule;
    // ground and runway
    layer.append(
      s("line", {
        x1: X0 - 20,
        y1: YG,
        x2: W - 20,
        y2: YG,
        stroke: p.line,
        "stroke-width": 1.4,
      }),
    );
    layer.append(
      s("rect", {
        x: XT,
        y: YG - 5,
        width: 120,
        height: 10,
        fill: p.text,
        opacity: 0.85,
      }),
    );
    layer.append(
      label(XT + 60, YG + 26, `TDZE ${thousands(spec.tdzeFt, lang)}`, p, {
        size: 13,
        color: p.muted,
        anchor: "middle",
        weight: 600,
      }),
    );
    // NM ticks from the threshold
    for (let d = 0; d <= maxNm; d++) {
      const x = xOf(d);
      layer.append(
        s("line", { x1: x, y1: YG, x2: x, y2: YG + 6, stroke: p.line }),
      );
      layer.append(
        label(x, YG + 22, `${d}`, p, {
          size: 12,
          color: p.muted,
          anchor: "middle",
          halo: false,
        }),
      );
    }
    layer.append(
      label(
        X0 - 20,
        YG + 46,
        L(lang, "NM from the threshold", "NM du seuil"),
        p,
        { size: 12, color: p.muted, halo: false },
      ),
    );
    // 3° path
    const x3 = xOf(maxNm);
    const y3 = yOf(maxNm * 6076.12 * Math.tan((3 * Math.PI) / 180));
    layer.append(
      s("line", {
        x1: XT,
        y1: YG,
        x2: x3,
        y2: Math.max(Y0 - 30, y3),
        stroke: p.nav,
        "stroke-width": 2,
        "stroke-dasharray": "8 6",
      }),
    );
    layer.append(
      label(
        xOf(maxNm * 0.82),
        yOf(maxNm * 0.82 * 318) - 12,
        L(lang, "3° path (318 ft/NM)", "plan 3° (318 ft/NM)"),
        p,
        { size: 12.5, color: p.nav, weight: 600 },
      ),
    );
    // MDA
    const yM = yOf(hat);
    layer.append(
      s("line", {
        x1: X0 - 20,
        y1: yM,
        x2: XT + 120,
        y2: yM,
        stroke: p.wind,
        "stroke-width": 2.4,
      }),
    );
    layer.append(
      label(
        X0 - 16,
        yM - 10,
        `MDA ${thousands(spec.mdaFt, lang)} (HAT ${thousands(hat, lang)})`,
        p,
        { size: 13.5, color: p.wind, weight: 700 },
      ),
    );
    // VDP
    const xV = xOf(vdp);
    layer.append(
      s("line", {
        x1: xV,
        y1: yM,
        x2: xV,
        y2: YG,
        stroke: p.heading,
        "stroke-width": 1.4,
        "stroke-dasharray": "4 4",
      }),
    );
    layer.append(
      s("path", {
        d: `M${xV} ${yM - 12}L${xV + 8} ${yM}L${xV} ${yM + 12}L${xV - 8} ${yM}Z`,
        fill: p.heading,
      }),
    );
    layer.append(
      label(xV, yM - 20, `VDP ${dec(vdp, 1, lang)} NM`, p, {
        size: 14,
        color: p.heading,
        anchor: "middle",
        weight: 700,
      }),
    );
    if (spec.mapNm !== undefined) {
      const xm = xOf(spec.mapNm);
      layer.append(
        s("line", {
          x1: xm,
          y1: yM,
          x2: xm,
          y2: YG,
          stroke: p.bad,
          "stroke-width": 1.4,
          "stroke-dasharray": "2 3",
        }),
      );
      layer.append(
        label(xm, YG - 10, "MAP", p, {
          size: 12,
          color: p.bad,
          anchor: "middle",
          weight: 700,
        }),
      );
    }
    const card = s("g", { transform: `translate(${X0 - 20} ${H - 24})` });
    card.append(
      label(
        0,
        0,
        `VDP = (${thousands(spec.mdaFt, lang)} − ${thousands(spec.tdzeFt, lang)}) ÷ 300 = ${dec(v.rule, 2, lang)} NM · ${L(lang, "exact 3°", "exact 3°")} ${dec(v.exact, 2, lang)} NM`,
        p,
        { size: 14, color: p.text, weight: 700, mono: true },
      ),
    );
    layer.append(card);
    if (handle) {
      layer.append(handle.g);
      handle.move(X0 + 60, yM);
      handle.g.setAttribute("aria-valuetext", `MDA ${spec.mdaFt}`);
    }
    const a11y =
      o.label ??
      L(
        lang,
        `VDP: MDA ${spec.mdaFt} ft, TDZE ${spec.tdzeFt} ft, height above touchdown ${hat} ft, VDP ${vdp.toFixed(1)} NM from the threshold.`,
        `VDP : MDA ${spec.mdaFt} ft, TDZE ${spec.tdzeFt} ft, hauteur ${hat} ft, VDP à ${vdp.toFixed(1)} NM du seuil.`,
      );
    svg.setAttribute("aria-label", a11y);
    desc.textContent = a11y;
    void vsOf;
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
