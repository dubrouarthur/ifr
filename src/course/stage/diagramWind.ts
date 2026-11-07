// Ground school stage — the wind diagrams: the wind triangle (E6B face, north up) and the hold in wind
// (racetrack with the inbound correction and the tripled outbound correction, AIM 5-3-8). Both take a wind dial:
// put the handle where the wind comes FROM, its distance from the centre is the speed.
// Slide units (SPEC slides v2 §5): viewBox = the block, labels 24 / 28 / 32 × u, theme tokens only.
import type { CalcDiagram, Lang } from "../types";
import { solveHoldWind, solveWind, trackFromHeading } from "./diagramMath";
import {
  aircraftIcon,
  arcPath,
  bearingVec,
  clamp,
  dragHandle,
  fixMark,
  FS,
  hdg3,
  head,
  L,
  lab,
  Labels,
  makeWidget,
  norm360,
  s,
  signed,
  SW,
  vecBearing,
  wrap180,
  type Ctx,
  type DiagramOptions,
  type DiagramWidget,
  type Shell,
} from "./svgkit";
import { textWidth } from "../canvas/text";

export type WindTriangleSpec = Extract<
  CalcDiagram,
  { kind: "windTriangle" }
> & { heading?: number };
export type HoldWindSpec = Extract<CalcDiagram, { kind: "holdWind" }>;

/** A vector with a head proportionate to its length. */
function vector(
  c: Ctx,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  w: number,
): SVGGElement {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const g = s("g");
  if (len < 2) return g;
  const hl = Math.min(30 * c.u, len * 0.35);
  const a = Math.atan2(y2 - y1, x2 - x1);
  g.append(
    s("line", {
      x1,
      y1,
      x2: x2 - Math.cos(a) * hl * 0.8,
      y2: y2 - Math.sin(a) * hl * 0.8,
      stroke: color,
      "stroke-width": w,
      "stroke-linecap": "round",
    }),
    head(c, x2, y2, a, color, hl / c.u),
  );
  return g;
}

// ------------------------------------------------------------------ wind dial (shared)
interface WindDial {
  set(dir: number, kt: number): void;
}
function windDial(
  sh: Shell,
  lang: Lang,
  cx: number,
  cy: number,
  r: number,
  maxKt: number,
  interactive: boolean,
  onSet: (dir: number, kt: number) => void,
  get: () => { dir: number; kt: number },
  capBelow = false,
): WindDial {
  const c = sh.c;
  const { u, p } = c;
  const g = s("g", { class: "cs-wdial" });
  g.append(
    s("circle", {
      cx,
      cy,
      r,
      fill: "none",
      stroke: p.line,
      "stroke-width": SW.grid * u,
    }),
  );
  g.append(
    s("circle", {
      cx,
      cy,
      r: r * 0.5,
      fill: "none",
      stroke: p.grid,
      "stroke-width": SW.grid * u,
    }),
  );
  g.append(
    lab(c, cx, cy - r - 14 * u, "N", {
      role: "sec",
      anchor: "middle",
      weight: 600,
    }),
  );
  const arr = s("g");
  // the readout sits left of the dial (never under it, where the labels of the drawing go)
  const cap = capBelow
    ? lab(c, cx, cy + r + 40 * u, "", { role: "pri", anchor: "middle", color: p.wind })
    : lab(c, cx - r - 24 * u, cy + 10 * u, "", { role: "pri", anchor: "end", color: p.wind });
  g.append(arr, cap);
  sh.layer.parentNode?.insertBefore(g, sh.layer.nextSibling);
  let h: ReturnType<typeof dragHandle> | null = null;
  if (interactive) {
    const toWind = (x: number, y: number): [number, number] => {
      const dx = x - cx;
      const dy = y - cy;
      const kt = clamp((Math.hypot(dx, dy) / r) * maxKt, 0, maxKt);
      return [Math.round(vecBearing(dx, dy) / 5) * 5 || 360, Math.round(kt)];
    };
    h = dragHandle(sh.svg, p, {
      u: u * 0.8,
      color: p.accent,
      name: L(
        lang,
        "Wind: drag to where the wind comes from",
        "Vent : placez la poignée d'où vient le vent",
      ),
      onDrag: (x, y) => onSet(...toWind(x, y)),
      onKey: (dx, dy, big) => {
        const w = get();
        onSet(
          norm360(w.dir + dx * (big ? 10 : 5)) || 360,
          clamp(w.kt - dy * (big ? 5 : 1), 0, maxKt),
        );
      },
    });
    sh.top.append(h.g);
  }
  return {
    set(dir: number, kt: number) {
      arr.replaceChildren();
      const [ux, uy] = bearingVec(dir);
      const rr = (clamp(kt, 0, maxKt) / maxKt) * r;
      // the arrow flies downwind: from the upwind side through the centre
      if (kt > 0.5)
        arr.append(
          vector(
            c,
            cx + ux * rr,
            cy + uy * rr,
            cx - ux * rr * 0.6,
            cy - uy * rr * 0.6,
            p.wind,
            SW.second * u,
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
  const lang: Lang = o.lang ?? "en";
  const fr = lang === "fr";
  const drag = new Set(o.drag ?? spec0.drag ?? []);
  let maxKt = 60;
  let cx = 0;
  let cy = 0;
  let R = 1;
  let dial: WindDial | null = null;
  let dialArea = { x: 0, y: 0, w: 0, h: 0 };
  let hHead: ReturnType<typeof dragHandle> | null = null;
  let hCourse: ReturnType<typeof dragHandle> | null = null;
  const scale = () => (R - 18) / maxKt;
  const pt = (b: number, kt: number): [number, number] => {
    const [x, y] = bearingVec(b);
    return [cx + x * kt * scale(), cy + y * kt * scale()];
  };
  const norm = (sp: WindTriangleSpec) =>
    drag.has("heading") && sp.heading === undefined
      ? { ...sp, heading: sp.course }
      : sp;
  const solve = (sp: WindTriangleSpec) =>
    solveWind(sp.course, sp.tasKt, sp.windDir, sp.windKt);
  return makeWidget<WindTriangleSpec>(spec0, o, [1008, 696], "cs-wind", {
    norm,
    build(sh, get, set) {
      const c = sh.c;
      const { W, H, u, p } = c;
      const spec = get();
      // the TAS vector spans about 80 % of the rose
      maxKt = Math.max(60, Math.ceil(Math.max(spec.tasKt * 1.22, spec.tasKt + spec.windKt * 0.8) / 10) * 10);
      // the rose on the left two thirds, the wind dial top right
      const dialR = clamp(Math.min(W, H) * 0.09, 44 * u, 72 * u);
      const dialW = 2 * dialR + 120 * u;
      R = Math.max(80 * u, Math.min(H / 2 - 52 * u, (W - dialW) / 2 - 40 * u));
      cx = Math.min(W - dialW - R - 20 * u, W / 2);
      cx = Math.max(R + 44 * u, cx);
      cy = H / 2 + (sh.o.card ? -30 * u : 0);
      // rose
      const rose = s("g", { class: "cs-rose" });
      rose.append(
        s("circle", {
          cx,
          cy,
          r: R,
          fill: "none",
          stroke: p.line,
          "stroke-width": SW.grid * u,
        }),
      );
      for (let b = 0; b < 360; b += 10) {
        const [x, y] = bearingVec(b);
        const big = b % 30 === 0;
        rose.append(
          s("line", {
            x1: cx + x * R,
            y1: cy + y * R,
            x2: cx + x * (R - (big ? 18 : 9) * u),
            y2: cy + y * (R - (big ? 18 : 9) * u),
            stroke: p.line,
            "stroke-width": (big ? 2.5 : 1.5) * u,
          }),
        );
      }
      for (const [b, t] of [
        [0, "N"],
        [90, "E"],
        [180, "S"],
        [270, L(lang, "W", "O")],
      ] as [number, string][]) {
        const [x, y] = bearingVec(b);
        rose.append(
          lab(c, cx + x * (R + 26 * u), cy + y * (R + 26 * u) + 9 * u, t, {
            role: "sec",
            anchor: "middle",
            weight: 600,
            color: p.ink2,
          }),
        );
      }
      for (let k = 20; k < maxKt; k += 20)
        rose.append(
          s("circle", {
            cx,
            cy,
            r: (k / maxKt) * (R - 18),
            fill: "none",
            stroke: p.grid,
            "stroke-width": 1.5 * u,
          }),
        );
      sh.layer.parentNode?.insertBefore(rose, sh.layer);
      // the dial and its readout (left of it): the drawing's labels keep off
      dialArea = { x: W - 2 * dialR - 60 * u - 260 * u, y: 48 * u - 8 * u, w: 2 * dialR + 260 * u, h: 2 * dialR + 16 * u };
      dial = windDial(
        sh,
        lang,
        W - dialR - 60 * u,
        dialR + 48 * u,
        dialR,
        Math.max(40, Math.ceil(Math.max(spec.windKt, 30) / 10) * 10 + 10),
        drag.has("wind"),
        (dir, kt) => set({ ...get(), windDir: dir, windKt: kt }),
        () => ({ dir: get().windDir, kt: get().windKt }),
      );
      hHead = null;
      hCourse = null;
      if (drag.has("heading") || drag.has("tas")) {
        hHead = dragHandle(sh.svg, p, {
          u,
          color: p.accent,
          name: L(lang, "Heading and true airspeed", "Cap et vitesse propre"),
          onDrag: (x, y) => {
            const next = { ...get() };
            if (drag.has("heading"))
              next.heading = Math.round(vecBearing(x - cx, y - cy)) || 360;
            if (drag.has("tas"))
              next.tasKt = Math.round(
                clamp(Math.hypot(x - cx, y - cy) / scale(), 40, maxKt - 5),
              );
            set(next);
          },
          onKey: (dx, dy, big) => {
            const next = { ...get() };
            if (drag.has("heading"))
              next.heading =
                norm360(
                  (next.heading ?? solve(next).th) + dx * (big ? 5 : 1),
                ) || 360;
            if (drag.has("tas"))
              next.tasKt = clamp(
                next.tasKt - dy * (big ? 10 : 1),
                40,
                maxKt - 5,
              );
            set(next);
          },
        });
        sh.top.append(hHead.g);
      }
      if (drag.has("course")) {
        hCourse = dragHandle(sh.svg, p, {
          u,
          color: p.accent,
          name: L(lang, "True course", "Route vraie"),
          onDrag: (x, y) =>
            set({
              ...get(),
              course: Math.round(vecBearing(x - cx, y - cy)) || 360,
            }),
          onKey: (dx, _dy, big) =>
            set({
              ...get(),
              course: norm360(get().course + dx * (big ? 10 : 1)) || 360,
            }),
        });
        sh.top.append(hCourse.g);
      }
    },
    draw(sh, spec) {
      const c = sh.c;
      const { u, p } = c;
      const ly = sh.layer;
      const lb = new Labels(c, ly);
      const sol = solve(spec);
      const heading = drag.has("heading")
        ? (spec.heading ?? spec.course)
        : sol.th;
      const fl = trackFromHeading(
        heading,
        spec.tasKt,
        spec.windDir,
        spec.windKt,
      );
      const Hp = pt(heading, spec.tasKt);
      const Gp = pt(fl.trk, fl.gs);
      const C = pt(spec.course, maxKt);
      // the rim labels and the dial stay clear
      lb.circle(cx, cy, 8 * u);
      lb.block(dialArea);
      // the rose's N / E / S / W letters
      for (const b of [0, 90, 180, 270]) {
        const [x, y] = bearingVec(b);
        lb.circle(cx + x * (R + 26 * u), cy + y * (R + 26 * u), 20 * u);
      }
      ly.append(
        s("line", {
          x1: cx,
          y1: cy,
          x2: C[0],
          y2: C[1],
          stroke: p.text,
          "stroke-width": SW.planned * u,
          "stroke-dasharray": `${16 * u} ${12 * u}`,
        }),
      );
      lb.stroke(cx, cy, C[0], C[1]);
      const wca = wrap180(heading - spec.course);
      if (Math.abs(wca) >= 0.5)
        ly.append(
          s("path", {
            d: arcPath(cx, cy, R * 0.3, spec.course, heading),
            fill: "none",
            stroke: p.heading,
            "stroke-width": SW.constr * u,
          }),
        );
      // vectors
      ly.append(vector(c, cx, cy, Gp[0], Gp[1], p.track, SW.hero * u));
      ly.append(vector(c, Hp[0], Hp[1], Gp[0], Gp[1], p.wind, SW.second * u));
      ly.append(vector(c, cx, cy, Hp[0], Hp[1], p.heading, SW.hero * u));
      ly.append(s("circle", { cx, cy, r: 7 * u, fill: p.text }));
      lb.stroke(cx, cy, Gp[0], Gp[1]);
      lb.stroke(Hp[0], Hp[1], Gp[0], Gp[1]);
      lb.stroke(cx, cy, Hp[0], Hp[1]);
      // labels beside the vectors, pushed off the line on both sides
      const beside = (
        a: [number, number],
        b: [number, number],
        t: number,
        d: number,
      ): [number, number] => {
        const mx = a[0] + (b[0] - a[0]) * t;
        const my = a[1] + (b[1] - a[1]) * t;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        return [
          mx + (-(b[1] - a[1]) / len) * d,
          my + ((b[0] - a[0]) / len) * d + 9 * u,
        ];
      };
      const cands = (
        a: [number, number],
        b: [number, number],
      ): [number, number, "middle"][] =>
        [0.5, 0.7, 0.35, 0.85].flatMap((t) => [
          [...beside(a, b, t, 40 * u), "middle"] as [number, number, "middle"],
          [...beside(a, b, t, -40 * u), "middle"] as [number, number, "middle"],
          [...beside(a, b, t, 64 * u), "middle"] as [number, number, "middle"],
          [...beside(a, b, t, -64 * u), "middle"] as [number, number, "middle"],
        ]);
      // beside a vector's tip, on the side away from the other tip (the two tips are close in a light wind)
      const tipCands = (
        tip: [number, number],
        other: [number, number],
        dy: number,
      ): [number, number, "start" | "end"][] => {
        const left = tip[0] < other[0] || (tip[0] === other[0] && dy < 0);
        const a: "start" | "end" = left ? "end" : "start";
        const dx = (left ? -1 : 1) * 30 * u;
        return [
          [tip[0] + dx, tip[1] + (dy < 0 ? -18 : 40) * u, a],
          [tip[0] + dx, tip[1] + (dy < 0 ? 40 : -18) * u, a],
          [tip[0] + dx * 2, tip[1] + 10 * u, a],
        ];
      };
      const Cl = pt(spec.course, maxKt * 1.02);
      const [ux] = bearingVec(spec.course);
      lb.put(
        `${fr ? "Rv" : "TC"} ${hdg3(spec.course)}°`,
        [
          [
            Cl[0] + (ux >= 0 ? 16 : -16) * u,
            Cl[1] - 12 * u,
            ux >= 0 ? "start" : "end",
          ],
          [Cl[0], Cl[1] - 30 * u, "middle"],
          [Cl[0], Cl[1] + 46 * u, "middle"],
          ...cands([cx, cy], C).slice(4),
        ],
        { role: "pri" },
      );
      if (Math.abs(wca) >= 0.5) {
        const mid = pt(spec.course + wca / 2, (R * 0.3 + 40 * u) / scale());
        lb.put(
          `${fr ? "Dérive" : "WCA"} ${signed(wca)}°`,
          [
            [mid[0], mid[1] + 9 * u, "middle"],
            [mid[0] + 30 * u, mid[1] + 40 * u, "start"],
            [mid[0] - 30 * u, mid[1] + 40 * u, "end"],
            [mid[0] + 30 * u, mid[1] - 24 * u, "start"],
            [mid[0] - 30 * u, mid[1] - 24 * u, "end"],
          ],
          {
            role: "sec",
            color: p.heading,
            weight: 600,
          },
        );
      }
      lb.put(
        `${fr ? "Cv" : "TH"} ${hdg3(heading)}° · ${fr ? "Vp" : "TAS"} ${Math.round(spec.tasKt)}`,
        [...tipCands(Hp, Gp, -1), ...cands([cx, cy], Hp)],
        { role: "pri", color: p.heading },
      );
      lb.put(
        `${fr ? "Route" : "TRK"} ${hdg3(fl.trk)}° · ${fr ? "Vs" : "GS"} ${Math.round(fl.gs)}`,
        [...tipCands(Gp, Hp, 1), ...cands([cx, cy], Gp)],
        { role: "pri", color: p.track },
      );
      if (sh.o.card) {
        const y0 = c.H - 96 * u;
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
        rows.forEach(([k, v, col], i) => {
          ly.append(lab(c, 24 * u, y0 + i * 32 * u, k, { role: "sec" }));
          ly.append(
            lab(
              c,
              24 * u + textWidth(k, FS.sec * u, 500) + 16 * u,
              y0 + i * 32 * u,
              v,
              { role: "sec", color: col, weight: 600 },
            ),
          );
        });
      }
      if (drag.has("heading")) {
        const e = wrap180(fl.trk - spec.course);
        const onCourse = Math.abs(e) < 0.75;
        const t = onCourse
          ? L(lang, "On course", "Sur la route")
          : `${L(lang, "Track", "Route")} ${Math.abs(Math.round(e))}° ${e > 0 ? L(lang, "right", "à droite") : L(lang, "left", "à gauche")}`;
        ly.append(
          lab(c, c.W - 24 * u, c.H - 28 * u, t, {
            role: "pri",
            anchor: "end",
            color: onCourse ? p.ok : p.wind,
          }),
        );
      }
      if (!sol.ok)
        ly.append(
          lab(
            c,
            24 * u,
            40 * u,
            L(
              lang,
              "Crosswind stronger than TAS: no solution",
              "Vent traversier plus fort que la Vp : pas de solution",
            ),
            { role: "pri", color: p.bad },
          ),
        );
      dial?.set(spec.windDir, spec.windKt);
      if (hHead) {
        hHead.move(Hp[0], Hp[1]);
        hHead.g.setAttribute(
          "aria-valuetext",
          `${L(lang, "heading", "cap")} ${hdg3(heading)}, TAS ${Math.round(spec.tasKt)} kt`,
        );
      }
      if (hCourse) {
        hCourse.move(C[0], C[1]);
        hCourse.g.setAttribute(
          "aria-valuetext",
          `${L(lang, "course", "route")} ${hdg3(spec.course)}`,
        );
      }
    },
    label(_sh, spec) {
      const sol = solve(spec);
      return L(
        lang,
        `Wind triangle: true course ${hdg3(spec.course)}, TAS ${Math.round(spec.tasKt)} kt, wind ${hdg3(spec.windDir)} at ${Math.round(spec.windKt)} kt. Wind correction ${signed(sol.wca)} degrees, true heading ${hdg3(sol.th)}, ground speed ${Math.round(sol.gs)} kt.`,
        `Triangle des vitesses : route vraie ${hdg3(spec.course)}, Vp ${Math.round(spec.tasKt)} kt, vent ${hdg3(spec.windDir)} pour ${Math.round(spec.windKt)} kt. Correction ${signed(sol.wca)} degrés, cap vrai ${hdg3(sol.th)}, vitesse sol ${Math.round(sol.gs)} kt.`,
      );
    },
  });
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
  const lang: Lang = o.lang ?? "en";
  const fr = lang === "fr";
  const drag = new Set(o.drag ?? spec0.drag ?? []);
  let dial: WindDial | null = null;
  let dialBox = { x: 0, y: 0, w: 0, h: 0 };
  const mm = (sec: number) =>
    `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;
  return makeWidget<HoldWindSpec>(spec0, o, [1008, 696], "cs-holdwind", {
    build(sh, get, set) {
      const { W, H, u } = sh.c;
      const spec = get();
      const dialR = clamp(Math.min(W, H) * 0.075, 40 * u, 64 * u);
      dialBox = { x: W - 2 * dialR - 40 * u, y: 44 * u, w: 2 * dialR, h: 2 * dialR };
      dial = windDial(
        sh,
        lang,
        W - dialR - 40 * u,
        dialR + 44 * u,
        dialR,
        Math.max(40, Math.ceil(Math.max(spec.windKt, 30) / 10) * 10 + 10),
        drag.has("wind"),
        (dir, kt) =>
          set({ ...get(), windDir: dir, windKt: kt, outboundS: undefined }),
        () => ({ dir: get().windDir, kt: get().windKt }),
        true,
      );
      void H;
    },
    draw(sh, spec) {
      const c = sh.c;
      const { W, H, u, p } = c;
      const ly = sh.layer;
      const sol = solveHoldWind(
        spec.inbound,
        spec.windDir,
        spec.windKt,
        spec.tasKt,
        60,
      );
      const t = spec.turn === "R" ? 1 : -1;
      // the two label columns beside the racetrack
      const outS = Math.round(spec.outboundS ?? sol.outboundS);
      const inLines: [string, "sec" | "key", string][] = [
        [L(lang, "INBOUND", "RAPPROCHEMENT"), "sec", p.muted],
        [`${fr ? "Cap" : "HDG"} ${hdg3(sol.inboundHdg)}°`, "key", p.heading],
        [`${fr ? "dérive" : "WCA"} ${signed(sol.wcaIn)}°`, "sec", p.muted],
        [
          `1:00 · ${fr ? "Vs" : "GS"} ${Math.round(sol.gsIn)} kt`,
          "sec",
          p.muted,
        ],
      ];
      const outLines: [string, "sec" | "key", string][] = [
        [L(lang, "OUTBOUND", "ÉLOIGNEMENT"), "sec", p.muted],
        [`${fr ? "Cap" : "HDG"} ${hdg3(sol.outboundHdg)}°`, "key", p.heading],
        [
          `3 × ${Math.abs(Math.round(sol.wcaIn))}° = ${Math.abs(Math.round(3 * sol.wcaIn))}°`,
          "sec",
          p.muted,
        ],
        [
          `${mm(outS)} · ${fr ? "Vs" : "GS"} ${Math.round(sol.gsOut)} kt`,
          "sec",
          p.wind,
        ],
      ];
      const colW = (ls: [string, "sec" | "key", string][]) =>
        Math.max(
          ...ls.map(([s0, r]) =>
            textWidth(
              s0,
              FS[r] * u,
              600,
              r === "sec" && s0 === s0.toUpperCase() ? 0.08 : 0,
              false,
            ),
          ),
        );
      const leftW = colW(t > 0 ? inLines : outLines);
      const rightW = colW(t > 0 ? outLines : inLines);
      const gap = 28 * u;
      const dialSpace = 0; // the dial sits top right, above the right column
      const avail = W - leftW - rightW - 2 * gap - 48 * u - dialSpace;
      const top = 96 * u;
      const bottom = (sh.o.card ? 110 : 56) * u;
      const leg = Math.max(120 * u, H - top - bottom - 0);
      const rad = clamp(Math.min(avail / 2, leg * 0.32), 40 * u, 140 * u);
      const legL = Math.max(80 * u, leg - 2 * rad);
      const mid = 24 * u + leftW + gap + (avail - 2 * rad) / 2;
      const fxX = t > 0 ? mid : mid + 2 * rad;
      const ox = fxX + t * 2 * rad;
      const fy = top + rad;
      const by = fy + legL;
      const sw = t > 0 ? 1 : 0;
      const track = `M${fxX} ${by}L${fxX} ${fy}A${rad} ${rad} 0 0 ${sw} ${ox} ${fy}L${ox} ${by}A${rad} ${rad} 0 0 ${sw} ${fxX} ${by}`;
      ly.append(
        s("path", {
          d: track,
          fill: "none",
          stroke: p.track,
          "stroke-width": SW.hero * u,
          "stroke-linejoin": "round",
        }),
      );
      ly.append(head(c, fxX, fy + legL * 0.3, -Math.PI / 2, p.track, 26));
      ly.append(head(c, ox, fy + legL * 0.72, Math.PI / 2, p.track, 26));
      ly.append(fixMark(c, fxX, fy, p.nav));
      ly.append(
        lab(c, fxX - t * 26 * u, fy - 22 * u, L(lang, "FIX", "REPÈRE"), {
          role: "sec",
          color: p.nav,
          weight: 600,
          anchor: t > 0 ? "end" : "start",
          spacing: 0.08,
        }),
      );
      // aircraft crabbed on each leg: the screen is inbound-up, so a heading h shows rotated by h − inbound
      const ym = fy + legL * 0.5;
      ly.append(
        aircraftIcon(
          fxX,
          ym,
          wrap180(sol.inboundHdg - spec.inbound),
          p.heading,
          1.7 * u,
        ),
      );
      ly.append(
        aircraftIcon(
          ox,
          ym,
          wrap180(sol.outboundHdg - spec.inbound),
          p.heading,
          1.7 * u,
        ),
      );
      // the label columns
      const col = (
        x: number,
        anchor: "start" | "end",
        ls: [string, "sec" | "key", string][],
      ) => {
        // below the fix label, and below the wind dial when the column runs under it
        const w0 = Math.max(...ls.map(([s0, r]) => textWidth(s0, FS[r] * u, 600)));
        const x0 = anchor === "start" ? x : x - w0;
        const underDial = x0 < dialBox.x + dialBox.w && x0 + w0 > dialBox.x - 260 * u;
        let y = Math.max(ym - 54 * u, fy + 40 * u, underDial ? dialBox.y + dialBox.h + 84 * u : 0);
        const room = Math.floor((H - 12 * u - y) / (36 * u)) + 1;
        ls = ls.slice(0, Math.max(2, room));
        for (const [s0, r, colr] of ls) {
          ly.append(
            lab(c, x, y, s0, {
              role: r,
              color: colr,
              anchor,
              weight: 600,
              spacing:
                r === "sec" && s0 === s0.toUpperCase() ? 0.08 : undefined,
            }),
          );
          y += (r === "key" ? 40 : 34) * u;
        }
      };
      const inX = fxX - t * gap;
      const outX = ox + t * gap;
      col(inX, t > 0 ? "end" : "start", inLines);
      col(outX, t > 0 ? "start" : "end", outLines);
      // the wind over the pattern, in the inbound-up frame
      if (spec.windKt > 0.5) {
        const rel = wrap180(spec.windDir - spec.inbound);
        const [vx, vy] = bearingVec(rel);
        const mx = (fxX + ox) / 2;
        const my = fy + legL / 2;
        const k = Math.min(rad * 0.9, 90 * u);
        ly.append(
          vector(
            c,
            mx + vx * k,
            my + vy * k,
            mx + vx * 12 * u,
            my + vy * 12 * u,
            p.wind,
            SW.second * u,
          ),
        );
      }
      // north reference (the screen is rotated: inbound up)
      const [nx, ny] = bearingVec(-spec.inbound);
      const nX = 48 * u;
      const nY = 64 * u;
      ly.append(
        vector(
          c,
          nX - nx * 22 * u,
          nY - ny * 22 * u,
          nX + nx * 22 * u,
          nY + ny * 22 * u,
          p.ink2,
          SW.constr * u,
        ),
      );
      ly.append(
        lab(c, nX + nx * 50 * u, nY + ny * 50 * u + 9 * u, "N", {
          role: "sec",
          anchor: "middle",
          weight: 600,
          color: p.ink2,
        }),
      );
      if (sh.o.card) {
        ly.append(
          lab(
            c,
            24 * u,
            H - 64 * u,
            L(
              lang,
              "Triple the inbound correction outbound (AIM 5-3-8)",
              "Triplez la correction en éloignement (AIM 5-3-8)",
            ),
            { role: "sec", color: p.text, weight: 600 },
          ),
        );
        ly.append(
          lab(
            c,
            24 * u,
            H - 28 * u,
            L(
              lang,
              "Outbound time for a 1:00 inbound leg (turns not counted)",
              "Temps d'éloignement pour 1:00 en rapprochement (virages non comptés)",
            ),
            { role: "sec" },
          ),
        );
      }
      dial?.set(spec.windDir, spec.windKt);
    },
    label(_sh, spec) {
      const sol = solveHoldWind(
        spec.inbound,
        spec.windDir,
        spec.windKt,
        spec.tasKt,
        60,
      );
      const outS = Math.round(spec.outboundS ?? sol.outboundS);
      return L(
        lang,
        `Hold in wind: inbound ${hdg3(spec.inbound)}, ${spec.turn === "R" ? "right" : "left"} turns, wind ${hdg3(spec.windDir)} at ${Math.round(spec.windKt)} kt. Inbound heading ${hdg3(sol.inboundHdg)}, outbound heading ${hdg3(sol.outboundHdg)}, outbound time ${mm(outS)}.`,
        `Attente avec vent : rapprochement ${hdg3(spec.inbound)}, virages à ${spec.turn === "R" ? "droite" : "gauche"}, vent ${hdg3(spec.windDir)} pour ${Math.round(spec.windKt)} kt. Cap en rapprochement ${hdg3(sol.inboundHdg)}, cap en éloignement ${hdg3(sol.outboundHdg)}, temps d'éloignement ${mm(outS)}.`,
      );
    },
  });
}
