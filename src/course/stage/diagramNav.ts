// Ground school stage — navigation calc diagrams: the 60:1 rule (track error and closing angle, IFH ch. 9) and
// the TVMDC strip (true course → true heading → magnetic → compass, PHAK ch. 16: "East is least, West is best").
// Drawn in slide units (SPEC slides v2 §5): the viewBox is the block's size, labels 24 / 28 / 32 × u, strokes per
// role, theme tokens only, labels placed without overlaps, and the worked numbers outside the drawing on a slide.
import type { CalcDiagram, Lang } from "../types";
import { sixtyToOne, tvmdc, variationText } from "./diagramMath";
import {
  aircraftIcon,
  clamp,
  dec,
  dimLine,
  dragHandle,
  FS,
  fixMark,
  hdg3,
  head,
  L,
  lab,
  Labels,
  makeWidget,
  num,
  s,
  signed,
  SW,
  tint,
  wpt,
  type DiagramOptions,
  type DiagramWidget,
} from "./svgkit";
import { textWidth } from "../canvas/text";

export type SixtyToOneSpec = Extract<CalcDiagram, { kind: "sixtyToOne" }>;
export type CompassSpec = Extract<CalcDiagram, { kind: "compass" }>;

// ------------------------------------------------------------------ 60:1
/**
 * The 1-in-60 triangle, course to the right: departure point, intended course (dashed), the track actually
 * flown (magenta) to the aircraft `offNm` off after `flownNm`, the track error, and with `toGoNm` the closing
 * angle at the destination. The vertical scale is exaggerated to fill the block (note() says by how much).
 * Drag: 'aircraft'. `offNm` + = right of the course.
 */
export function createSixtyToOne(
  spec0: SixtyToOneSpec,
  o: DiagramOptions = {},
): DiagramWidget<SixtyToOneSpec> {
  const lang: Lang = o.lang ?? "en";
  const drag = new Set(o.drag ?? spec0.drag ?? []);
  // the geometry is fixed at build so the handle stays under the finger while dragging
  let g = {
    x0: 0,
    x1: 0,
    yc: 0,
    kx: 1,
    ex: 1,
    side: 1,
    total: 1,
    offMin: -1,
    offMax: 1,
    yDim: 0,
  };
  let hd: ReturnType<typeof dragHandle> | null = null;
  return makeWidget<SixtyToOneSpec>(spec0, o, [960, 520], "cs-sixty", {
    build(sh, get, set) {
      const { W, H, u } = sh.c;
      const spec = get();
      const total = Math.max(
        10,
        spec.flownNm + (spec.toGoNm ?? spec.flownNm * 0.6),
      );
      const mx = Math.max(40 * u, W * 0.04);
      const x0 = mx;
      const x1 = W - mx;
      const kx = (x1 - x0) / total;
      const side = spec.offNm < 0 ? -1 : 1;
      const top = 96 * u; // course labels above the line
      const bottom = (sh.o.card ? 200 : 120) * u; // distances (and the worked numbers in a pane)
      // course line near the top when the aircraft is right of course (below), near the bottom otherwise
      const yc = side > 0 ? top : H - bottom - 64 * u;
      const room = side > 0 ? H - bottom - 56 * u - yc : yc - 56 * u;
      const off = Math.max(0.5, Math.abs(spec.offNm));
      // exaggerate the offset to use the block, but keep the drawn angle under ~27° so it still reads as small
      const cap = (Math.tan((27 * Math.PI) / 180) * Math.max(1, spec.flownNm)) / off;
      const ex = clamp(Math.floor(Math.min(room / (off * kx), cap)), 1, 8);
      // centre the drawing in the block when the angle cap leaves height unused (right of course: the dimensions
      // follow the aircraft down, the whole drawing moves to the middle)
      const used = off * kx * ex + 56 * u;
      const spare = side > 0 ? Math.max(0, room - used) : 0;
      const ycc = yc + spare / 2;
      g = {
        x0,
        x1,
        yc: ycc,
        kx,
        ex,
        side,
        total,
        offMin: side > 0 ? -((ycc - 48 * u) / (kx * ex)) : -room / (kx * ex),
        offMax: side > 0 ? (room - spare) / (kx * ex) : (H - bottom - yc) / (kx * ex),
        yDim: H - bottom + 36 * u - spare / 2,
      };
      hd = drag.has("aircraft")
        ? dragHandle(sh.svg, sh.c.p, {
            u,
            color: sh.c.p.accent,
            dot: "transparent",
            name: L(lang, "Aircraft position", "Position de l'avion"),
            onDrag: (x, y) => {
              const sp = get();
              const flown = clamp(
                (x - g.x0) / g.kx,
                1,
                g.total - (sp.toGoNm !== undefined ? 1 : 0),
              );
              const offv = clamp(
                (y - g.yc) / (g.kx * g.ex),
                g.offMin,
                g.offMax,
              );
              const next: SixtyToOneSpec = {
                ...sp,
                flownNm: Math.round(flown * 2) / 2,
                offNm: Math.round(offv * 10) / 10,
              };
              if (sp.toGoNm !== undefined)
                next.toGoNm = Math.max(
                  1,
                  Math.round((g.total - next.flownNm) * 2) / 2,
                );
              set(next);
            },
            onKey: (dx, dy, big) => {
              const sp = get();
              const next: SixtyToOneSpec = {
                ...sp,
                flownNm: clamp(sp.flownNm + dx * (big ? 5 : 1), 1, g.total - 1),
                offNm: clamp(
                  Math.round((sp.offNm + dy * (big ? 1 : 0.1)) * 10) / 10,
                  g.offMin,
                  g.offMax,
                ),
              };
              if (sp.toGoNm !== undefined)
                next.toGoNm = Math.max(1, g.total - next.flownNm);
              set(next);
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
      const r = sixtyToOne(spec.flownNm, spec.offNm, spec.toGoNm);
      const { x0, yc, kx, ex, side } = g;
      const ax = x0 + spec.flownNm * kx;
      const ay = yc + spec.offNm * kx * ex;
      const x1 = spec.toGoNm !== undefined ? ax + spec.toGoNm * kx : g.x1;
      const hasDest = spec.toGoNm !== undefined;
      const above = (y: number) => (side > 0 ? y - 34 * u : y + 56 * u);
      // planned course
      ly.append(
        s("line", {
          x1: x0,
          y1: yc,
          x2: x1,
          y2: yc,
          stroke: p.muted,
          "stroke-width": SW.planned * u,
          "stroke-dasharray": `${16 * u} ${12 * u}`,
        }),
      );
      lb.stroke(x0, yc, x1, yc);
      // the track flown and the closing course
      const aTE = Math.atan2(ay - yc, ax - x0);
      ly.append(
        s("line", {
          x1: x0,
          y1: yc,
          x2: ax,
          y2: ay,
          stroke: p.track,
          "stroke-width": SW.hero * u,
          "stroke-linecap": "round",
        }),
      );
      lb.stroke(x0, yc, ax, ay);
      let aCA = 0;
      if (hasDest && Math.abs(spec.offNm) > 0.05) {
        aCA = Math.atan2(ay - yc, x1 - ax);
        ly.append(
          s("line", {
            x1: ax,
            y1: ay,
            x2: x1,
            y2: yc,
            stroke: p.heading,
            "stroke-width": SW.second * u,
            "stroke-dasharray": `${18 * u} ${12 * u}`,
            "stroke-linecap": "round",
          }),
        );
        lb.stroke(ax, ay, x1, yc);
        const t = 0.62;
        ly.append(
          head(
            c,
            ax + (x1 - ax) * t,
            ay + (yc - ay) * t,
            Math.atan2(yc - ay, x1 - ax),
            p.heading,
            26,
          ),
        );
      }
      // off-course dimension
      if (Math.abs(spec.offNm) > 0.05) {
        const yEnd = ay - Math.sign(ay - yc) * 52 * u;
        if (Math.abs(yEnd - yc) > 8 * u)
          ly.append(dimLine(c, ax, yc, ax, yEnd, p.ink2));
        lb.stroke(ax, yc, ax, yEnd);
      }
      // aircraft (a target ring when it can be dragged)
      lb.circle(ax, ay, 46 * u);
      if (!hd)
        ly.append(
          s("circle", { cx: ax, cy: ay, r: 40 * u, fill: tint(p.track, 0.12) }),
        );
      ly.append(
        aircraftIcon(
          ax,
          ay,
          90 + (aTE * 180) / Math.PI,
          hd ? p.accent : p.track,
          2.0 * u,
        ),
      );
      // points
      ly.append(wpt(c, x0, yc, p.text));
      lb.circle(x0, yc, 14 * u);
      if (hasDest) {
        ly.append(fixMark(c, x1, yc, p.text));
        lb.circle(x1, yc, 18 * u);
      }
      // angle arcs and their numbers, inside their wedge past the arc
      if (Math.abs(r.teExact) > 0.3) {
        const R = Math.min(150 * u, (ax - x0) * 0.5);
        ly.append(
          s("path", {
            d: `M${x0 + R} ${yc}A${R} ${R} 0 0 ${aTE > 0 ? 1 : 0} ${x0 + R * Math.cos(aTE)} ${yc + R * Math.sin(aTE)}`,
            fill: "none",
            stroke: p.wind,
            "stroke-width": 4 * u,
          }),
        );
        const mid = aTE / 2;
        const lx = x0 + (R + 22 * u) * Math.cos(mid);
        const lyy = yc + (R + 22 * u) * Math.sin(mid) + side * 10 * u;
        lb.put(
          `${num(Math.abs(r.te), lang)}°`,
          [
            [lx, lyy + side * 18 * u],
            [lx + 30 * u, lyy + side * 30 * u],
            [lx, lyy + side * 60 * u],
          ],
          {
            role: "key",
            color: p.wind,
            sub: L(lang, "track error", "d’erreur"),
          },
        );
      }
      if (hasDest && Math.abs(spec.offNm) > 0.05 && r.ca !== null) {
        const R = Math.min(150 * u, (x1 - ax) * 0.5);
        ly.append(
          s("path", {
            d: `M${x1 - R} ${yc}A${R} ${R} 0 0 ${aCA > 0 ? 0 : 1} ${x1 - R * Math.cos(aCA)} ${yc + R * Math.sin(aCA)}`,
            fill: "none",
            stroke: p.heading,
            "stroke-width": 4 * u,
          }),
        );
        const lx = x1 - R - 24 * u;
        lb.put(
          `${num(Math.abs(r.ca), lang)}°`,
          [
            [lx, yc + side * 44 * u, "end"],
            [lx - 30 * u, yc + side * 64 * u, "end"],
            [lx, yc + side * 90 * u, "end"],
          ],
          {
            role: "key",
            color: p.heading,
            sub: L(lang, "to close", "pour rejoindre"),
          },
        );
      }
      if (Math.abs(spec.offNm) > 0.05) {
        const my = (yc + ay) / 2 + 8 * u;
        lb.put(
          `${num(Math.abs(spec.offNm), lang)} NM`,
          [
            [ax - 20 * u, my, "end"],
            [ax + 20 * u, my, "start"],
            [ax + 56 * u, ay + side * 8 * u, "start"],
          ],
          {
            role: "pri",
            sub:
              spec.offNm > 0
                ? L(lang, "right", "à droite")
                : L(lang, "left", "à gauche"),
            subColor: p.muted,
          },
        );
      }
      // course labels
      lb.put(
        L(lang, "Departure", "Départ"),
        [
          [x0, above(yc)],
          [x0, above(yc) - side * 30 * u],
        ],
        { role: "pri" },
      );
      if (hasDest)
        lb.put("Destination", [[x1, above(yc), "end"]], { role: "pri" });
      const cl = `${L(lang, "Planned course", "Route prévue")} ${hdg3(spec.course)}°`;
      const mxl = (x0 + x1) / 2;
      lb.put(
        cl,
        [
          [mxl, above(yc), "middle"],
          [x0 + (x1 - x0) * 0.32, above(yc), "middle"],
          [x0 + (x1 - x0) * 0.7, above(yc), "middle"],
        ],
        {
          role: "sec",
        },
      );
      // distances along the bottom
      const yb = g.yDim;
      const dim = (xa: number, xb: number, t: string) => {
        if (xb - xa < 40 * u) return;
        ly.append(dimLine(c, xa, yb, xb, yb, p.line));
        lb.put(t, [[(xa + xb) / 2, yb + 44 * u, "middle"]], {
          role: "sec",
          color: p.ink2,
        });
      };
      dim(
        x0,
        ax,
        `${num(spec.flownNm, lang)} NM ${L(lang, "flown", "parcourus")}`,
      );
      if (hasDest)
        dim(
          ax,
          x1,
          `${num(spec.toGoNm!, lang)} NM ${L(lang, "to go", "restants")}`,
        );
      // the worked numbers (stage panes only)
      if (sh.o.card) {
        const y = yb + 96 * u;
        ly.append(
          lab(
            c,
            x0,
            y,
            `TE = 60 × ${dec(Math.abs(spec.offNm), 1, lang)} ÷ ${num(spec.flownNm, lang)} ≈ ${dec(Math.abs(r.te), 1, lang)}°`,
            {
              role: "sec",
              color: p.wind,
              weight: 600,
            },
          ),
        );
        if (r.correction !== null && Math.abs(spec.offNm) > 0.05)
          ly.append(
            lab(
              c,
              x0,
              y + 36 * u,
              `CA = 60 × ${dec(Math.abs(spec.offNm), 1, lang)} ÷ ${num(spec.toGoNm!, lang)} ≈ ${dec(Math.abs(r.ca!), 1, lang)}° → ${L(lang, "turn", "virez de")} ${dec(Math.abs(r.correction), 0, lang)}° ${spec.offNm > 0 ? L(lang, "left", "à gauche") : L(lang, "right", "à droite")}`,
              { role: "sec", color: p.heading, weight: 600 },
            ),
          );
      }
      if (hd) {
        hd.move(ax, ay);
        hd.g.setAttribute(
          "aria-valuetext",
          `${dec(spec.flownNm, 1, lang)} NM, ${dec(spec.offNm, 1, lang)} NM`,
        );
      }
    },
    note: () =>
      g.ex > 1
        ? L(
            lang,
            `vertical scale × ${num(g.ex, lang)}`,
            `échelle verticale × ${num(g.ex, lang)}`,
          )
        : null,
    label(_sh, spec) {
      const r = sixtyToOne(spec.flownNm, spec.offNm, spec.toGoNm);
      return L(
        lang,
        `60 to 1 rule: ${spec.offNm.toFixed(1)} NM off course after ${spec.flownNm} NM, track error about ${r.te.toFixed(1)} degrees${r.correction !== null ? `, closing angle ${r.ca!.toFixed(1)}, total correction ${r.correction.toFixed(0)} degrees` : ""}.`,
        `Règle du 1 sur 60 : ${spec.offNm.toFixed(1)} NM d'écart après ${spec.flownNm} NM, erreur de route d'environ ${r.te.toFixed(1)} degrés${r.correction !== null ? `, angle de ralliement ${r.ca!.toFixed(1)}, correction totale ${r.correction.toFixed(0)} degrés` : ""}.`,
      );
    },
  });
}

// ------------------------------------------------------------------ TVMDC strip
/**
 * TVMDC on a heading tape: the four headings as markers (TC, TH, MH, CH) with the step between each (WCA,
 * variation, deviation); in a pane, the written log line a pilot keeps. `variation` + = East (subtract),
 * `deviation` = the compass card's correction (add). Drag: 'wca' (TH marker), 'variation' (MH), 'deviation' (CH).
 */
export function createTvmdc(
  spec0: CompassSpec,
  o: DiagramOptions = {},
): DiagramWidget<CompassSpec> {
  const lang: Lang = o.lang ?? "en";
  const fr = lang === "fr";
  const drag = new Set(o.drag ?? spec0.drag ?? []);
  let lo = 0;
  let span = 40;
  let x0 = 0;
  let x1 = 1;
  let tapeY = 0;
  const hs: Partial<
    Record<"wca" | "variation" | "deviation", ReturnType<typeof dragHandle>>
  > = {};
  const rels = (sp: CompassSpec) => [
    0,
    sp.wca,
    sp.wca - sp.variation,
    sp.wca - sp.variation + sp.deviation,
  ];
  const fit = (sp: CompassSpec) => {
    const r = rels(sp);
    const mn = Math.min(...r);
    const mx = Math.max(...r);
    span = Math.max(30, Math.ceil((mx - mn + 20) / 10) * 10);
    lo = Math.floor((mn + mx) / 2 - span / 2);
  };
  const relX = (rel: number) => x0 + ((rel - lo) / span) * (x1 - x0);
  const xRel = (x: number) => lo + ((x - x0) / (x1 - x0)) * span;
  return makeWidget<CompassSpec>(spec0, o, [1104, 432], "cs-tvmdc", {
    build(sh, get, set) {
      const { W, u, p } = sh.c;
      fit(get());
      x0 = 72 * u;
      x1 = W - 72 * u;
      tapeY = 104 * u;
      const mk = (key: "wca" | "variation" | "deviation", name: string) => {
        delete hs[key];
        if (!drag.has(key)) return;
        const h = dragHandle(sh.svg, p, {
          u,
          color: p.accent,
          name,
          onDrag: (x) => {
            const sp = get();
            const rel = Math.round(clamp(xRel(x), lo, lo + span));
            if (key === "wca") set({ ...sp, wca: clamp(rel, -45, 45) });
            else if (key === "variation")
              set({ ...sp, variation: clamp(sp.wca - rel, -30, 30) });
            else
              set({
                ...sp,
                deviation: clamp(rel - (sp.wca - sp.variation), -10, 10),
              });
          },
          onKey: (dx) => {
            const sp = get();
            if (key === "wca") set({ ...sp, wca: clamp(sp.wca + dx, -45, 45) });
            else if (key === "variation")
              set({ ...sp, variation: clamp(sp.variation - dx, -30, 30) });
            else set({ ...sp, deviation: clamp(sp.deviation + dx, -10, 10) });
          },
        });
        hs[key] = h;
        sh.top.append(h.g);
      };
      mk(
        "wca",
        L(
          lang,
          "True heading (wind correction)",
          "Cap vrai (correction de dérive)",
        ),
      );
      mk(
        "variation",
        L(lang, "Magnetic heading (variation)", "Cap magnétique (déclinaison)"),
      );
      mk(
        "deviation",
        L(lang, "Compass heading (deviation)", "Cap compas (déviation)"),
      );
    },
    draw(sh, spec) {
      const c = sh.c;
      const { u, p, H } = c;
      const ly = sh.layer;
      const r = tvmdc(spec.tc, spec.wca, spec.variation, spec.deviation);
      // refit only when a marker leaves the tape (keeps it steady while dragging)
      const rr = rels(spec);
      if (!rr.every((v) => v >= lo + 2 && v <= lo + span - 2)) fit(spec);
      // tape
      ly.append(
        s("rect", {
          x: x0 - 20 * u,
          y: tapeY - 48 * u,
          width: x1 - x0 + 40 * u,
          height: 72 * u,
          rx: 12 * u,
          fill: tint(p.heading, 0.08),
        }),
      );
      for (let d = Math.ceil(lo); d <= lo + span; d++) {
        const x = relX(d);
        const abs = Math.round(spec.tc + d);
        const big = abs % 10 === 0;
        const mid = abs % 5 === 0;
        ly.append(
          s("line", {
            x1: x,
            y1: tapeY + 24 * u,
            x2: x,
            y2: tapeY + 24 * u - (big ? 22 : mid ? 14 : 8) * u,
            stroke: p.line,
            "stroke-width": (big ? 2.5 : 1.5) * u,
          }),
        );
        if (big)
          ly.append(
            lab(c, x, tapeY - 12 * u, hdg3(abs), {
              role: "sec",
              anchor: "middle",
            }),
          );
      }
      // markers and their rows
      const marks = [
        { rel: 0, name: fr ? "Rv" : "TC", v: r.tc, color: p.text },
        { rel: spec.wca, name: fr ? "Cv" : "TH", v: r.th, color: p.heading },
        {
          rel: spec.wca - spec.variation,
          name: fr ? "Cm" : "MH",
          v: r.mh,
          color: p.nav,
        },
        {
          rel: spec.wca - spec.variation + spec.deviation,
          name: fr ? "Cc" : "CH",
          v: r.ch,
          color: p.wind,
        },
      ];
      // one row per heading: the step arrow from the previous heading, its words behind it, the heading at its tip
      // (no long vertical lines: they would cross the rows above)
      const rowH = Math.min(64 * u, (H - tapeY - 64 * u - (sh.o.card ? 110 * u : 0)) / 4);
      const rowY = (i: number) => tapeY + 88 * u + i * rowH;
      const stepTxt = [
        "",
        `${spec.wca >= 0 ? "+" : "−"} ${fr ? "dérive" : "WCA"} ${Math.abs(Math.round(spec.wca))}°`,
        `${spec.variation > 0 ? "−" : "+"} ${fr ? "décl." : "var"} ${variationText(spec.variation, fr)}`,
        `${spec.deviation >= 0 ? "+" : "−"} ${fr ? "dév." : "dev"} ${Math.abs(Math.round(spec.deviation * 10) / 10)}°`,
      ];
      marks.forEach((m, i) => {
        const x = relX(m.rel);
        ly.append(s("path", { d: `M${x} ${tapeY + 30 * u}l${-10 * u} ${-16 * u}h${20 * u}z`, fill: m.color }));
        ly.append(s("line", { x1: x, y1: tapeY - 40 * u, x2: x, y2: tapeY + 24 * u, stroke: m.color, "stroke-width": SW.constr * u }));
        const y = rowY(i);
        const t = `${m.name} ${hdg3(m.v)}°`;
        const xa = i ? relX(marks[i - 1].rel) : x;
        const dir = x >= xa ? 1 : -1;
        if (i && Math.abs(x - xa) > 12 * u) {
          ly.append(s("line", { x1: xa, y1: y - 9 * u, x2: x - dir * 14 * u, y2: y - 9 * u, stroke: m.color, "stroke-width": SW.constr * u }));
          ly.append(head(c, x, y - 9 * u, dir > 0 ? 0 : Math.PI, m.color, 18));
          ly.append(s("line", { x1: xa, y1: y - 22 * u, x2: xa, y2: y + 4 * u, stroke: marks[i - 1].color, "stroke-width": 2 * u }));
        }
        // the heading past the tip, the step's words behind the tail
        const fits = (xx: number, w: number, a: "start" | "end") => (a === "start" ? xx + w < c.W - 8 * u : xx - w > 8 * u);
        let a1: "start" | "end" = dir > 0 ? "start" : "end";
        const w1 = textWidth(t, FS.pri * u, 600);
        if (!fits(x + (a1 === "start" ? 16 : -16) * u, w1, a1)) a1 = a1 === "start" ? "end" : "start";
        ly.append(lab(c, x + (a1 === "start" ? 16 : -16) * u, y, t, { role: "pri", color: m.color, anchor: a1 }));
        if (i) {
          const a2: "start" | "end" = dir > 0 ? "end" : "start";
          ly.append(lab(c, Math.min(xa, x) * (dir > 0 ? 1 : 0) + Math.max(xa, x) * (dir > 0 ? 0 : 1) + (dir > 0 ? -16 : 16) * u, y, stepTxt[i], { role: "sec", color: m.color, anchor: a2 }));
        }
      });
      // the log line (panes only: on a slide the text beside the diagram carries it)
      if (sh.o.card) {
        const logY = H - 52 * u;
        const cells: [string, string, string][] = [
          [fr ? "Rv" : "TC", hdg3(r.tc), p.text],
          [fr ? "Dérive" : "WCA", signed(spec.wca), p.heading],
          [fr ? "Cv" : "TH", hdg3(r.th), p.heading],
          [fr ? "Décl." : "VAR", variationText(spec.variation, fr), p.nav],
          [fr ? "Cm" : "MH", hdg3(r.mh), p.nav],
          [fr ? "Dév." : "DEV", signed(spec.deviation), p.wind],
          [fr ? "Cc" : "CH", hdg3(r.ch), p.wind],
        ];
        const cw = (x1 - x0 + 40 * u) / cells.length;
        cells.forEach(([k, v, col], i) => {
          const x = x0 - 20 * u + i * cw + cw / 2;
          ly.append(
            lab(c, x, logY - 22 * u, k, { role: "sec", anchor: "middle" }),
          );
          ly.append(
            lab(c, x, logY + 12 * u, v, {
              role: "pri",
              anchor: "middle",
              color: col,
            }),
          );
        });
      }
      for (const [key, rel] of [
        ["wca", spec.wca],
        ["variation", spec.wca - spec.variation],
        ["deviation", spec.wca - spec.variation + spec.deviation],
      ] as const) {
        const h = hs[key];
        if (!h) continue;
        h.move(relX(rel), tapeY + 24 * u);
      }
      hs.wca?.g.setAttribute("aria-valuetext", `TH ${hdg3(r.th)}`);
      hs.variation?.g.setAttribute(
        "aria-valuetext",
        `MH ${hdg3(r.mh)}, ${variationText(spec.variation, fr)}`,
      );
      hs.deviation?.g.setAttribute("aria-valuetext", `CH ${hdg3(r.ch)}`);
    },
    label(_sh, spec) {
      const r = tvmdc(spec.tc, spec.wca, spec.variation, spec.deviation);
      return L(
        lang,
        `TVMDC: true course ${hdg3(r.tc)}, wind correction ${signed(spec.wca)}, true heading ${hdg3(r.th)}, variation ${variationText(spec.variation)}, magnetic heading ${hdg3(r.mh)}, deviation ${signed(spec.deviation)}, compass heading ${hdg3(r.ch)}.`,
        `Route vraie ${hdg3(r.tc)}, dérive ${signed(spec.wca)}, cap vrai ${hdg3(r.th)}, déclinaison ${variationText(spec.variation, true)}, cap magnétique ${hdg3(r.mh)}, déviation ${signed(spec.deviation)}, cap compas ${hdg3(r.ch)}.`,
      );
    },
  });
}
