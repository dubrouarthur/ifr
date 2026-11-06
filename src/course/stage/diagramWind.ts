// Ground school stage — the wind diagrams: the wind triangle (E6B face, north up) and the hold in wind
// (racetrack with the inbound correction and the tripled outbound correction, AIM 5-3-8). Both take a wind dial:
// put the handle where the wind comes FROM, its distance from the centre is the speed.
import type { CalcDiagram, Lang } from "../types";
import { solveHoldWind, solveWind, trackFromHeading } from "./diagramMath";
import {
  arcPath,
  aircraftIcon,
  arrow,
  bearingVec,
  clamp,
  dragHandle,
  hdg3,
  L,
  label,
  norm360,
  PALETTES,
  rootSvg,
  s,
  signed,
  vecBearing,
  wrap180,
  type DiagramOptions,
  type DiagramPalette,
  type DiagramTheme,
  type DiagramWidget,
} from "./svgkit";

export type WindTriangleSpec = Extract<
  CalcDiagram,
  { kind: "windTriangle" }
> & { heading?: number };
export type HoldWindSpec = Extract<CalcDiagram, { kind: "holdWind" }>;

// ------------------------------------------------------------------ wind dial (shared)
interface WindDial {
  g: SVGGElement;
  set(dir: number, kt: number): void;
}
function windDial(
  svg: SVGSVGElement,
  p: DiagramPalette,
  lang: Lang,
  cx: number,
  cy: number,
  r: number,
  maxKt: number,
  interactive: boolean,
  onSet: (dir: number, kt: number) => void,
  get: () => { dir: number; kt: number },
): WindDial {
  const g = s("g", { class: "cs-wdial" });
  const face = s("circle", {
    cx,
    cy,
    r,
    fill: p.bg,
    stroke: p.line,
    "stroke-width": 1.2,
  });
  const rings = s("g");
  for (const k of [0.5, 1])
    rings.append(
      s("circle", {
        cx,
        cy,
        r: r * k,
        fill: "none",
        stroke: p.grid,
        "stroke-width": 1,
      }),
    );
  for (const [b, t] of [
    [0, "N"],
    [90, "E"],
    [180, "S"],
    [270, L(lang, "W", "O")],
  ] as [number, string][]) {
    const [x, y] = bearingVec(b);
    rings.append(
      label(cx + x * (r + 11), cy + y * (r + 11) + 4, t, p, {
        size: 11,
        color: p.muted,
        anchor: "middle",
        weight: 700,
      }),
    );
  }
  const arr = s("g");
  const cap = label(cx, cy + r + 30, "", p, {
    size: 13,
    anchor: "middle",
    color: p.wind,
    weight: 700,
  });
  g.append(face, rings, arr, cap);
  let h: ReturnType<typeof dragHandle> | null = null;
  if (interactive) {
    const toWind = (x: number, y: number): [number, number] => {
      const dx = x - cx;
      const dy = y - cy;
      const kt = clamp((Math.hypot(dx, dy) / r) * maxKt, 0, maxKt);
      return [Math.round(vecBearing(dx, dy) / 5) * 5 || 360, Math.round(kt)];
    };
    h = dragHandle(svg, p, {
      color: p.wind,
      name: L(
        lang,
        "Wind: drag to where the wind comes from",
        "Vent : placez la poignée d'où vient le vent",
      ),
      onDrag: (x, y) => {
        const [d, k] = toWind(x, y);
        onSet(d, k);
      },
      onKey: (dx, dy, big) => {
        const w = get();
        onSet(
          norm360(w.dir + dx * (big ? 10 : 5)) || 360,
          clamp(w.kt - dy * (big ? 5 : 1), 0, maxKt),
        );
      },
    });
    g.append(h.g);
  }
  return {
    g,
    set(dir: number, kt: number) {
      arr.replaceChildren();
      const [ux, uy] = bearingVec(dir);
      const rr = (clamp(kt, 0, maxKt) / maxKt) * r;
      // the arrow flies downwind: from the upwind side through the centre
      if (kt > 0.5)
        arr.append(
          arrow(
            cx + ux * rr,
            cy + uy * rr,
            cx - ux * rr * 0.55,
            cy - uy * rr * 0.55,
            p.wind,
            3,
            11,
          ),
        );
      cap.textContent =
        kt > 0.5
          ? `${L(lang, "Wind", "Vent")} ${hdg3(dir)}/${Math.round(kt)}`
          : L(lang, "Calm", "Calme");
      h?.move(cx + ux * rr, cy + uy * rr);
      h?.g.setAttribute("aria-valuetext", cap.textContent);
    },
  };
}

// ------------------------------------------------------------------ wind triangle
/**
 * Wind triangle on an E6B-style rose, north up: TAS vector on the heading (cyan), the wind vector from its tip
 * (amber, blowing downwind), the ground vector (magenta) along the track. Drag: 'wind' (dial), 'heading' (the TAS
 * tip: the student finds the heading that keeps the track on the course), 'tas' (its length), 'course'.
 */
export function createWindTriangle(
  spec0: WindTriangleSpec,
  o: DiagramOptions = {},
): DiagramWidget<WindTriangleSpec> {
  const W = 560;
  const H = 560;
  const lang: Lang = o.lang ?? "en";
  const drag = new Set(o.drag ?? spec0.drag ?? []);
  let theme: DiagramTheme = o.theme ?? "dark";
  let spec: WindTriangleSpec = { ...spec0 };
  if (drag.has("heading") && spec.heading === undefined)
    spec.heading = spec.course;
  const svg = rootSvg(W, H, "cs-wind");
  const cx = 250;
  const cy = 290;
  const R = 205;
  let maxKt = Math.max(
    60,
    Math.ceil((spec.tasKt + Math.max(30, spec.windKt)) / 10) * 10,
  );
  let p = PALETTES[theme];
  let layer = s("g");
  let dial: WindDial | null = null;
  const desc = s("desc");
  const build = () => {
    p = PALETTES[theme];
    svg.replaceChildren(desc);
    svg.append(s("rect", { width: W, height: H, fill: p.bg, rx: 0 }));
    // rose
    const rose = s("g", { class: "cs-rose" });
    rose.append(
      s("circle", {
        cx,
        cy,
        r: R,
        fill: "none",
        stroke: p.line,
        "stroke-width": 1.2,
      }),
    );
    for (let b = 0; b < 360; b += 10) {
      const [x, y] = bearingVec(b);
      const big = b % 30 === 0;
      rose.append(
        s("line", {
          x1: cx + x * R,
          y1: cy + y * R,
          x2: cx + x * (R - (big ? 12 : 6)),
          y2: cy + y * (R - (big ? 12 : 6)),
          stroke: p.line,
          "stroke-width": big ? 1.6 : 1,
        }),
      );
      if (big) {
        const t =
          b === 0
            ? "N"
            : b === 90
              ? "E"
              : b === 180
                ? "S"
                : b === 270
                  ? L(lang, "W", "O")
                  : String(b / 10);
        rose.append(
          label(cx + x * (R + 16), cy + y * (R + 16) + 5, t, p, {
            size: 13,
            color: b % 90 === 0 ? p.text : p.muted,
            anchor: "middle",
            weight: b % 90 === 0 ? 700 : 500,
          }),
        );
      }
    }
    // speed rings every 20 kt (scale)
    for (let k = 20; k < maxKt; k += 20)
      rose.append(
        s("circle", {
          cx,
          cy,
          r: (k / maxKt) * (R - 14),
          fill: "none",
          stroke: p.grid,
          "stroke-width": 1,
        }),
      );
    svg.append(rose);
    layer = s("g");
    svg.append(layer);
    dial = windDial(
      svg,
      p,
      lang,
      495,
      78,
      46,
      Math.max(40, Math.ceil(Math.max(spec.windKt, 30) / 10) * 10 + 10),
      drag.has("wind"),
      (dir, kt) => set({ ...spec, windDir: dir, windKt: kt }),
      () => ({ dir: spec.windDir, kt: spec.windKt }),
    );
    svg.append(dial.g);
    handles();
    draw();
  };
  const scale = () => (R - 14) / maxKt;
  const pt = (b: number, kt: number): [number, number] => {
    const [x, y] = bearingVec(b);
    return [cx + x * kt * scale(), cy + y * kt * scale()];
  };
  let hHead: ReturnType<typeof dragHandle> | null = null;
  let hCourse: ReturnType<typeof dragHandle> | null = null;
  const handles = () => {
    hHead = null;
    hCourse = null;
    if (drag.has("heading") || drag.has("tas")) {
      hHead = dragHandle(svg, p, {
        color: p.heading,
        name: L(lang, "Heading and true airspeed", "Cap et vitesse propre"),
        onDrag: (x, y) => {
          const b = vecBearing(x - cx, y - cy);
          const kt = Math.hypot(x - cx, y - cy) / scale();
          const next = { ...spec };
          if (drag.has("heading")) next.heading = Math.round(b) || 360;
          if (drag.has("tas"))
            next.tasKt = Math.round(clamp(kt, 40, maxKt - 5));
          set(next);
        },
        onKey: (dx, dy, big) => {
          const next = { ...spec };
          if (drag.has("heading"))
            next.heading =
              norm360((next.heading ?? solve().th) + dx * (big ? 5 : 1)) || 360;
          if (drag.has("tas"))
            next.tasKt = clamp(next.tasKt - dy * (big ? 10 : 1), 40, maxKt - 5);
          set(next);
        },
      });
    }
    if (drag.has("course")) {
      hCourse = dragHandle(svg, p, {
        color: p.text,
        name: L(lang, "True course", "Route vraie"),
        onDrag: (x, y) =>
          set({
            ...spec,
            course: Math.round(vecBearing(x - cx, y - cy)) || 360,
          }),
        onKey: (dx, _dy, big) =>
          set({
            ...spec,
            course: norm360(spec.course + dx * (big ? 10 : 1)) || 360,
          }),
      });
    }
  };
  const solve = () =>
    solveWind(spec.course, spec.tasKt, spec.windDir, spec.windKt);
  const draw = () => {
    layer.replaceChildren();
    const sol = solve();
    const heading = drag.has("heading")
      ? (spec.heading ?? spec.course)
      : sol.th;
    const fl = trackFromHeading(heading, spec.tasKt, spec.windDir, spec.windKt);
    const Hp = pt(heading, spec.tasKt);
    const Gp = pt(fl.trk, fl.gs);
    const C = pt(spec.course, maxKt);
    // course line (dashed, to the rose)
    layer.append(
      s("line", {
        x1: cx,
        y1: cy,
        x2: C[0],
        y2: C[1],
        stroke: p.text,
        "stroke-width": 1.6,
        "stroke-dasharray": "7 6",
        opacity: 0.8,
      }),
    );
    const Cl = pt(spec.course, maxKt * 0.93);
    layer.append(
      label(Cl[0] + 10, Cl[1] - 8, `TC ${hdg3(spec.course)}°`, p, {
        size: 14,
        weight: 700,
      }),
    );
    // WCA arc
    const wca = wrap180(heading - spec.course);
    if (Math.abs(wca) >= 0.5) {
      layer.append(
        s("path", {
          d: arcPath(cx, cy, 70, spec.course, heading),
          fill: "none",
          stroke: p.heading,
          "stroke-width": 2,
        }),
      );
      const mid = pt(spec.course + wca / 2, 92 / scale());
      layer.append(
        label(
          mid[0],
          mid[1] + 5,
          `${L(lang, "WCA", "Dérive")} ${signed(wca)}°`,
          p,
          { size: 13, color: p.heading, anchor: "middle", weight: 700 },
        ),
      );
    }
    // vectors
    layer.append(arrow(cx, cy, Gp[0], Gp[1], p.track, 4, 14));
    layer.append(arrow(Hp[0], Hp[1], Gp[0], Gp[1], p.wind, 3, 12));
    layer.append(arrow(cx, cy, Hp[0], Hp[1], p.heading, 4, 14));
    layer.append(s("circle", { cx, cy, r: 4.5, fill: p.text }));
    // labels at the vector midpoints, pushed off the line
    const off = (
      a: [number, number],
      b: [number, number],
      d: number,
    ): [number, number] => {
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      return [mx + (-(b[1] - a[1]) / len) * d, my + ((b[0] - a[0]) / len) * d];
    };
    const side = wca >= 0 ? -1 : 1;
    const lh = off([cx, cy], Hp, 22 * side);
    layer.append(
      label(
        lh[0],
        lh[1],
        `TH ${hdg3(heading)}° · TAS ${Math.round(spec.tasKt)}`,
        p,
        { size: 13, color: p.heading, anchor: "middle", weight: 700 },
      ),
    );
    const lg = off([cx, cy], Gp, -22 * side);
    layer.append(
      label(
        lg[0],
        lg[1],
        `${L(lang, "TRK", "Route")} ${hdg3(fl.trk)}° · GS ${Math.round(fl.gs)}`,
        p,
        { size: 13, color: p.track, anchor: "middle", weight: 700 },
      ),
    );
    if (spec.windKt > 0.5) {
      const lw = off(Hp, Gp, 18 * side);
      layer.append(
        label(
          lw[0],
          lw[1],
          `${hdg3(spec.windDir)}/${Math.round(spec.windKt)}`,
          p,
          { size: 12.5, color: p.wind, anchor: "middle", weight: 700 },
        ),
      );
    }
    // readout card
    const onCourse = Math.abs(wrap180(fl.trk - spec.course)) < 0.75;
    const rows: [string, string, string][] = [
      [
        L(lang, "WCA", "Correction de dérive"),
        `${signed(sol.wca)}° ${sol.wca >= 0 ? L(lang, "R", "D") : L(lang, "L", "G")}`,
        p.heading,
      ],
      [L(lang, "True heading", "Cap vrai"), `${hdg3(sol.th)}°`, p.heading],
      [
        L(lang, "Ground speed", "Vitesse sol"),
        `${Math.round(sol.gs)} kt`,
        p.track,
      ],
    ];
    const card = s("g", {
      transform: `translate(18 ${H - 18 - rows.length * 24 - (drag.has("heading") ? 26 : 0)})`,
    });
    rows.forEach(([k, v, c], i) => {
      card.append(
        label(0, i * 24, k, p, { size: 13, color: p.muted, weight: 600 }),
        label(196, i * 24, v, p, {
          size: 14,
          color: c,
          anchor: "end",
          weight: 700,
        }),
      );
    });
    if (drag.has("heading")) {
      const e = wrap180(fl.trk - spec.course);
      const t = onCourse
        ? L(
            lang,
            "On course: the track is the course",
            "Sur la route : la route suivie est la route prévue",
          )
        : `${L(lang, "Track", "Route")} ${Math.abs(Math.round(e))}° ${e > 0 ? L(lang, "right of", "à droite de") : L(lang, "left of", "à gauche de")} ${L(lang, "course", "la route")}`;
      card.append(
        label(0, rows.length * 24 + 2, t, p, {
          size: 13,
          color: onCourse ? p.ok : p.wind,
          weight: 700,
        }),
      );
    }
    if (!sol.ok)
      card.append(
        label(
          0,
          -24,
          L(
            lang,
            "Crosswind stronger than TAS: no solution",
            "Vent traversier plus fort que la TAS : pas de solution",
          ),
          p,
          { size: 13, color: p.bad, weight: 700 },
        ),
      );
    layer.append(card);
    dial?.set(spec.windDir, spec.windKt);
    if (hHead) {
      layer.append(hHead.g);
      hHead.move(Hp[0], Hp[1]);
      hHead.g.setAttribute(
        "aria-valuetext",
        `${L(lang, "heading", "cap")} ${hdg3(heading)}, TAS ${Math.round(spec.tasKt)} kt`,
      );
    }
    if (hCourse) {
      layer.append(hCourse.g);
      hCourse.move(C[0], C[1]);
      hCourse.g.setAttribute(
        "aria-valuetext",
        `${L(lang, "course", "route")} ${hdg3(spec.course)}`,
      );
    }
    const a11y =
      o.label ??
      L(
        lang,
        `Wind triangle: true course ${hdg3(spec.course)}, TAS ${Math.round(spec.tasKt)} kt, wind ${hdg3(spec.windDir)} at ${Math.round(spec.windKt)} kt. Wind correction ${signed(sol.wca)} degrees, true heading ${hdg3(sol.th)}, ground speed ${Math.round(sol.gs)} kt.`,
        `Triangle des vitesses : route vraie ${hdg3(spec.course)}, TAS ${Math.round(spec.tasKt)} kt, vent ${hdg3(spec.windDir)} pour ${Math.round(spec.windKt)} kt. Correction ${signed(sol.wca)} degrés, cap vrai ${hdg3(sol.th)}, vitesse sol ${Math.round(sol.gs)} kt.`,
      );
    svg.setAttribute("aria-label", a11y);
    desc.textContent = a11y;
  };
  const set = (next: WindTriangleSpec) => {
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
      if (drag.has("heading") && spec.heading === undefined)
        spec.heading = spec.course;
      const m = Math.max(
        60,
        Math.ceil((spec.tasKt + Math.max(30, spec.windKt)) / 10) * 10,
      );
      if (m !== maxKt) {
        maxKt = m;
        build();
      } else draw();
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

// ------------------------------------------------------------------ hold in wind
/**
 * The hold in wind, inbound course up: the racetrack (standard or left turns), the wind, the aircraft crabbed on
 * each leg with its heading, the tripled outbound correction (AIM 5-3-8), and the outbound time for a 1:00
 * inbound leg. Drag: 'wind' (dial).
 */
export function createHoldWind(
  spec0: HoldWindSpec,
  o: DiagramOptions = {},
): DiagramWidget<HoldWindSpec> {
  const W = 640;
  const H = 480;
  const lang: Lang = o.lang ?? "en";
  const drag = new Set(o.drag ?? spec0.drag ?? []);
  let theme: DiagramTheme = o.theme ?? "dark";
  let spec: HoldWindSpec = { ...spec0 };
  const svg = rootSvg(W, H, "cs-holdwind");
  const desc = s("desc");
  let p = PALETTES[theme];
  let layer = s("g");
  let dial: WindDial | null = null;
  const build = () => {
    p = PALETTES[theme];
    svg.replaceChildren(desc, s("rect", { width: W, height: H, fill: p.bg }));
    layer = s("g");
    svg.append(layer);
    dial = windDial(
      svg,
      p,
      lang,
      566,
      84,
      46,
      Math.max(40, Math.ceil(Math.max(spec.windKt, 30) / 10) * 10 + 10),
      drag.has("wind"),
      (dir, kt) => set({ ...spec, windDir: dir, windKt: kt }),
      () => ({ dir: spec.windDir, kt: spec.windKt }),
    );
    svg.append(dial.g);
    draw();
  };
  const draw = () => {
    layer.replaceChildren();
    const sol = solveHoldWind(
      spec.inbound,
      spec.windDir,
      spec.windKt,
      spec.tasKt,
      60,
    );
    const t = spec.turn === "R" ? 1 : -1;
    // inbound-course-up frame: the inbound leg flies up the screen and ends at the fix (top); right turns put the
    // holding side on the right, left turns on the left
    const fx = 250 - t * 40;
    const fy = 122;
    const leg = 190;
    const rad = 58;
    const ox = fx + t * 2 * rad;
    const sw = t > 0 ? 1 : 0;
    const track = `M${fx} ${fy + leg}L${fx} ${fy}A${rad} ${rad} 0 0 ${sw} ${ox} ${fy}L${ox} ${fy + leg}A${rad} ${rad} 0 0 ${sw} ${fx} ${fy + leg}`;
    layer.append(s("path", { d: track, fill: "none", stroke: p.track, "stroke-width": 3 }));
    // direction arrows on the legs: inbound up, outbound down
    layer.append(arrow(fx, fy + leg * 0.7, fx, fy + leg * 0.34, p.track, 3, 12));
    layer.append(arrow(ox, fy + leg * 0.3, ox, fy + leg * 0.66, p.track, 3, 12));
    // fix (end of the inbound leg)
    layer.append(s("path", { d: `M${fx} ${fy - 9}L${fx + 9} ${fy + 7}L${fx - 9} ${fy + 7}Z`, fill: p.bg, stroke: p.nav, "stroke-width": 2.2 }));
    layer.append(label(fx - t * 16, fy + 4, L(lang, "FIX", "REPÈRE"), p, { size: 12, color: p.nav, anchor: t > 0 ? "end" : "start", weight: 700 }));
    // aircraft crabbed on each leg: the screen is inbound-up, so a heading h shows rotated by h − inbound
    const crabIn = wrap180(sol.inboundHdg - spec.inbound);
    const crabOut = wrap180(sol.outboundHdg - spec.inbound);
    layer.append(aircraftIcon(fx, fy + leg * 0.5, crabIn, p.heading, 1.25));
    layer.append(aircraftIcon(ox, fy + leg * 0.5, crabOut, p.heading, 1.25));
    // legend boxes
    const inX = fx - t * 26;
    const anchorIn = t > 0 ? "end" : "start";
    const anchorOut = t > 0 ? "start" : "end";
    const outX = ox + t * 26;
    const mm = (sec: number) =>
      `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
    const outS = Math.round(spec.outboundS ?? sol.outboundS);
    layer.append(
      label(
        inX,
        fy + leg * 0.5 - 22,
        L(lang, "INBOUND", "RAPPROCHEMENT"),
        p,
        { size: 11.5, color: p.muted, anchor: anchorIn, weight: 700 },
      ),
      label(
        inX,
        fy + leg * 0.5,
        `${L(lang, "HDG", "Cap")} ${hdg3(sol.inboundHdg)}°`,
        p,
        { size: 16, color: p.heading, anchor: anchorIn, weight: 700 },
      ),
      label(
        inX,
        fy + leg * 0.5 + 20,
        `${L(lang, "crs", "route")} ${hdg3(spec.inbound)} · WCA ${signed(sol.wcaIn)}°`,
        p,
        { size: 12.5, color: p.muted, anchor: anchorIn, weight: 600 },
      ),
      label(
        inX,
        fy + leg * 0.5 + 40,
        `1:00 · GS ${Math.round(sol.gsIn)} kt`,
        p,
        { size: 12.5, color: p.muted, anchor: anchorIn, weight: 600 },
      ),
      label(outX, fy + leg * 0.5 - 22, L(lang, "OUTBOUND", "ÉLOIGNEMENT"), p, {
        size: 11.5,
        color: p.muted,
        anchor: anchorOut,
        weight: 700,
      }),
      label(
        outX,
        fy + leg * 0.5,
        `${L(lang, "HDG", "Cap")} ${hdg3(sol.outboundHdg)}°`,
        p,
        { size: 16, color: p.heading, anchor: anchorOut, weight: 700 },
      ),
      label(
        outX,
        fy + leg * 0.5 + 20,
        `3 × ${Math.abs(Math.round(sol.wcaIn))}° = ${Math.abs(Math.round(3 * sol.wcaIn))}° ${L(lang, "into the wind", "face au vent")}`,
        p,
        { size: 12.5, color: p.muted, anchor: anchorOut, weight: 600 },
      ),
      label(
        outX,
        fy + leg * 0.5 + 40,
        `${mm(outS)} · GS ${Math.round(sol.gsOut)} kt`,
        p,
        { size: 12.5, color: p.wind, anchor: anchorOut, weight: 700 },
      ),
    );
    // wind arrow over the pattern, in the inbound-up frame
    if (spec.windKt > 0.5) {
      const rel = wrap180(spec.windDir - spec.inbound);
      const [ux, uy] = bearingVec(rel);
      const mx = (fx + ox) / 2;
      const my = fy + leg / 2;
      layer.append(
        arrow(
          mx + ux * 70,
          my + uy * 70,
          mx + ux * 18,
          my + uy * 18,
          p.wind,
          3,
          12,
        ),
      );
    }
    // north reference: the screen is rotated (inbound up)
    const [nx, ny] = bearingVec(-spec.inbound);
    layer.append(
      arrow(
        44 - nx * 14,
        60 - ny * 14,
        44 + nx * 16,
        60 + ny * 16,
        p.muted,
        2,
        8,
      ),
      label(44 + nx * 30, 60 + ny * 30 + 4, "N", p, {
        size: 12,
        color: p.muted,
        anchor: "middle",
        weight: 700,
      }),
    );
    layer.append(
      label(
        18,
        H - 46,
        L(
          lang,
          "Triple the inbound correction outbound (AIM 5-3-8)",
          "Triplez la correction en éloignement (AIM 5-3-8)",
        ),
        p,
        { size: 13, color: p.text, weight: 600 },
      ),
    );
    layer.append(
      label(
        18,
        H - 24,
        L(
          lang,
          `Outbound time for a 1:00 inbound leg (turns not counted)`,
          `Temps d'éloignement pour 1:00 en rapprochement (virages non comptés)`,
        ),
        p,
        { size: 12.5, color: p.muted, weight: 500 },
      ),
    );
    dial?.set(spec.windDir, spec.windKt);
    const a11y =
      o.label ??
      L(
        lang,
        `Hold in wind: inbound ${hdg3(spec.inbound)}, ${spec.turn === "R" ? "right" : "left"} turns, wind ${hdg3(spec.windDir)} at ${Math.round(spec.windKt)} kt. Inbound heading ${hdg3(sol.inboundHdg)}, outbound heading ${hdg3(sol.outboundHdg)}, outbound time ${mm(outS)}.`,
        `Attente avec vent : rapprochement ${hdg3(spec.inbound)}, virages à ${spec.turn === "R" ? "droite" : "gauche"}, vent ${hdg3(spec.windDir)} pour ${Math.round(spec.windKt)} kt. Cap en rapprochement ${hdg3(sol.inboundHdg)}, cap en éloignement ${hdg3(sol.outboundHdg)}, temps d'éloignement ${mm(outS)}.`,
      );
    svg.setAttribute("aria-label", a11y);
    desc.textContent = a11y;
  };
  const set = (next: HoldWindSpec) => {
    spec = { ...next, outboundS: undefined };
    draw();
    o.onChange?.({ ...spec });
  };
  build();
  return {
    el: svg,
    spec: () => ({ ...spec }),
    update(next) {
      spec = { ...next };
      draw();
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
