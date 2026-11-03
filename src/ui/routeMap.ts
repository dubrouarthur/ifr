// Flight-plan map: the planned flight drawn over a real map (Esri tiles in the real world, a land/sea chart of
// the training region otherwise) — route, holds (racetracks), approach transitions, final, missed approach and
// its hold, DME arcs, fixes, navaids and runways. Pan (drag), zoom (wheel / buttons), fit, full-screen view.
// Symbols and annotations follow ICAO Annex 4 / Jeppesen plan-view conventions: VOR hexagon (VOR/DME in a
// box), NDB dotted rings, fixes as triangles (filled = FAF), magnetic courses as three digits, minimum
// altitudes underlined, maximum altitudes overlined, missed approach dashed, scale bar and north arrow.
// Also: the vertical profile of a plan (RouteProfile), Jeppesen profile style (Maltese cross at the FAF,
// glidepath angle, DA/MDA).
import { h } from "./dom";
import { svgIcon, I } from "./icons";
import {
  AIRPORTS,
  NAVAIDS,
  findFix,
  approach as getApproach,
  landMask,
  groundElevation,
  runway as getRunway,
} from "../nav/data";
import { currentRegion, toReal } from "../nav/world";
import { racetrack } from "../nav/holding";
import { bearingDeg, destination, distanceNm, type LatLon } from "../nav/geo";
import type { Circuit } from "../train/circuits";
import type { Approach, ProcLeg } from "../nav/types";

// ------------------------------------------------------------------ geometry of the plan (pure)
export type MapLine = {
  kind: "route" | "approach" | "missed" | "hold" | "transition";
  pts: LatLon[];
  /** index of the circuit leg this line belongs to (−1 = start) */
  leg?: number;
};
export type MapPoint = {
  ident: string;
  kind: "start" | "fix" | "vor" | "ndb" | "airport" | "faf" | "iaf" | "mahp";
  p: LatLon;
  /** altitude text (assigned altitude, or the minimum of a procedure fix) */
  alt?: string;
  /** procedure constraints: at or above (underlined), at or below (overlined) */
  amin?: number;
  amax?: number;
  /** procedure role tag (IAF, IF, FAF, MAHP) */
  role?: string;
  leg?: number;
};
export interface PlanGeometry {
  lines: MapLine[];
  points: MapPoint[];
  /** every point that must be in view when fitting */
  bounds: LatLon[];
}

const fixKind = (ident: string): MapPoint["kind"] => {
  const n = NAVAIDS.find((x) => x.ident === ident);
  if (n) return n.type === "NDB" ? "ndb" : "vor";
  const f = findFix(ident);
  return f?.kind === "airport" ? "airport" : "fix";
};

/** points along a procedure leg (DME arcs sampled around their centre) */
function legPath(from: LatLon, l: ProcLeg): LatLon[] {
  if (l.arc) {
    const c = findFix(l.arc.center);
    if (c) {
      const a0 = bearingDeg(c, from);
      const a1 = bearingDeg(c, l.fix);
      let d = ((a1 - a0 + 540) % 360) - 180;
      if (l.arc.dir === "R" && d < 0) d += 360;
      if (l.arc.dir === "L" && d > 0) d -= 360;
      const n = Math.max(6, Math.ceil(Math.abs(d) / 4));
      return Array.from({ length: n + 1 }, (_, k) =>
        destination(c, a0 + (d * k) / n, l.arc!.radius),
      );
    }
  }
  return [from, l.fix];
}

function holdPts(
  fix: LatLon & { ident?: string },
  inbound: number,
  turn: "L" | "R",
  legMin: number,
): LatLon[] {
  const t = racetrack(
    {
      fix: { ident: fix.ident ?? "H", lat: fix.lat, lon: fix.lon },
      inbound,
      turn,
      legMin,
      altFt: 3000,
    },
    90,
  );
  return [...t, t[0]];
}

/** the legs flown on an approach: the chosen transition, then the final segment (IF/FAF … MAP) */
export function approachSequence(
  ap: Approach,
  transition: string | null,
): ProcLeg[] {
  const tr = ap.transitions.find((t) => t.name === transition);
  return [
    ...(tr?.legs ?? []),
    ...ap.final.filter(
      (l, i) =>
        !(
          tr &&
          i === 0 &&
          tr.legs[tr.legs.length - 1]?.fix.ident === l.fix.ident
        ),
    ),
  ];
}

const roleKind = (l: ProcLeg): MapPoint["kind"] =>
  l.role === "FAF" ? "faf" : l.role === "IAF" ? "iaf" : fixKind(l.fix.ident);

function approachGeometry(
  ap: Approach,
  transition: string | null,
  missed: boolean,
  g: PlanGeometry,
  from: LatLon | null,
  leg: number,
) {
  const tr = ap.transitions.find((t) => t.name === transition);
  const seq = approachSequence(ap, transition);
  // the leg into the approach from the end of the route
  if (from && seq.length)
    g.lines.push({ kind: "route", pts: [from, seq[0].fix], leg });
  const app: LatLon[] = [];
  seq.forEach((l, i) => {
    if (i === 0) app.push(l.fix);
    else app.push(...legPath(seq[i - 1].fix, l).slice(1));
    if (l.hold && (l.hilpt || i === 0))
      g.lines.push({
        kind: "hold",
        pts: holdPts(l.fix, l.hold.inbound, l.hold.turn, l.hold.legMin),
        leg,
      });
    if (l.fix.kind !== "runway")
      g.points.push({
        ident: l.fix.ident,
        kind: roleKind(l),
        p: l.fix,
        alt: l.altMin ? String(l.altMin) : undefined,
        amin: l.altMin,
        amax: l.altMax,
        role:
          l.role === "IAF" || l.role === "IF" || l.role === "FAF"
            ? l.role
            : undefined,
        leg,
      });
  });
  if (app.length > 1) g.lines.push({ kind: "approach", pts: app, leg });
  // other transitions, faint, so the pilot sees the options
  for (const t of ap.transitions) {
    if (t === tr || !t.legs.length) continue;
    const pts: LatLon[] = [t.legs[0].fix];
    t.legs.forEach((l, i) => {
      if (i) pts.push(...legPath(t.legs[i - 1].fix, l).slice(1));
    });
    const join = ap.final[0]?.fix;
    if (join && pts[pts.length - 1] !== join) pts.push(join);
    g.lines.push({ kind: "transition", pts, leg });
    g.points.push({
      ident: t.legs[0].fix.ident,
      kind: t.legs[0].role === "IAF" ? "iaf" : fixKind(t.legs[0].fix.ident),
      p: t.legs[0].fix,
      role: t.legs[0].role === "IAF" ? "IAF" : undefined,
      leg,
    });
  }
  const map = ap.final[ap.final.length - 1]?.fix;
  if (map && ap.missed.length) {
    const pts: LatLon[] = [map];
    ap.missed.forEach((l, i) => {
      if (i || l.fix.ident !== (map as { ident?: string }).ident)
        pts.push(...legPath(pts[pts.length - 1], l).slice(1));
    });
    g.lines.push({ kind: "missed", pts, leg });
    const m = ap.missed[ap.missed.length - 1];
    if (m.hold) {
      const hp = holdPts(m.fix, m.hold.inbound, m.hold.turn, m.hold.legMin);
      g.lines.push({ kind: missed ? "hold" : "missed", pts: hp, leg });
      g.bounds.push(...hp);
    }
    if (m.fix.kind !== "runway")
      g.points.push({
        ident: m.fix.ident,
        kind: "mahp",
        p: m.fix,
        alt: m.altMin ? String(m.altMin) : undefined,
        amin: m.altMin,
        amax: m.altMax,
        role: "MAHP",
        leg,
      });
    g.bounds.push(...pts);
  }
  g.bounds.push(...app);
  // the start of the other transitions when they are close: the pilot sees the options
  const end = app[app.length - 1];
  if (end) for (const t of ap.transitions) { const f = t.legs[0]?.fix; if (f && distanceNm(f, end) < 25) g.bounds.push(f); }
}

export function planGeometry(c: Circuit): PlanGeometry {
  const g: PlanGeometry = { lines: [], points: [], bounds: [] };
  let cur: LatLon | null = null;
  try {
    if (c.start.type === "runway") {
      const st0 = c.start;
      const a = AIRPORTS.find((x) => x.icao === st0.airport);
      const rw = a?.runways.find((r) => r.id === st0.runway);
      if (rw) {
        cur = rw.end;
        g.points.push({
          ident: `${a!.icao} ${rw.id}`,
          kind: "start",
          p: rw.threshold,
          leg: -1,
        });
        g.bounds.push(rw.threshold, rw.end);
      }
    } else {
      const f = findFix(c.start.fix);
      if (f) {
        cur = destination(f, c.start.bearing, c.start.distNm);
        g.points.push({ ident: "START", kind: "start", p: cur, leg: -1 });
        g.bounds.push(cur);
      }
    }
    c.legs.forEach((l, i) => {
      if (l.type === "fix" || l.type === "hold") {
        const f = findFix(l.ident);
        if (!f) return;
        if (cur) g.lines.push({ kind: "route", pts: [cur, f], leg: i });
        cur = f;
        g.bounds.push(f);
        if (!g.points.some((p) => p.ident === f.ident))
          g.points.push({
            ident: f.ident,
            kind: fixKind(f.ident),
            p: f,
            alt: l.alt ? String(l.alt) : undefined,
            leg: i,
          });
        if (l.type === "hold") {
          const pts = holdPts(f, l.inbound, l.turn, l.legMin);
          g.lines.push({ kind: "hold", pts, leg: i });
          g.bounds.push(...pts);
        }
      } else if (l.type === "approach") {
        let ap: Approach;
        try {
          ap = getApproach(l.approachId);
        } catch {
          return;
        }
        approachGeometry(ap, l.transition, l.outcome === "missed", g, cur, i);
        cur = ap.final[ap.final.length - 1]?.fix ?? cur;
      }
    });
  } catch {
    /* a plan referring to data that is not loaded: draw what resolved */
  }
  return g;
}

// ------------------------------------------------------------------ vertical profile of the plan (pure)
export interface ProfilePt {
  /** along-track distance from the start, NM */
  d: number;
  alt: number;
  ident?: string;
  leg: number;
  /** segment arriving at this point */
  seg: "climb" | "route" | "approach" | "gp" | "missed";
  role?: string;
  amin?: number;
  amax?: number;
  hold?: boolean;
}
export interface PlanProfile {
  pts: ProfilePt[];
  /** decision / minimum descent altitude over the final segment */
  mins?: { alt: number; label: string; d0: number; d1: number };
  gp?: { angle: number; d0: number; d1: number };
  ground: { d: number; elev: number }[];
  total: number;
}

const CLIMB_FT_NM = 500;
const DESC_FT_NM = 300;

export function planProfile(c: Circuit, sampleGround = true): PlanProfile {
  const pts: ProfilePt[] = [];
  const track: LatLon[] = [];
  const out: PlanProfile = { pts, ground: [], total: 0 };
  let pos: LatLon | null = null;
  let d = 0;
  let alt = 0;
  let assigned = 3000;
  const add = (p: LatLon) => {
    if (pos) d += distanceNm(pos, p);
    pos = p;
    track.push(p);
  };
  /** fly to `p`, changing altitude toward `target` at climb/descent gradients, then level */
  const goTo = (
    p: LatLon,
    target: number,
    base: Omit<ProfilePt, "d" | "alt">,
    pathPts?: LatLon[],
  ) => {
    const d0 = d;
    const a0 = alt;
    if (pathPts) for (const q of pathPts.slice(1, -1)) add(q);
    add(p);
    const len = d - d0;
    const da = target - a0;
    const need = Math.abs(da) / (da > 0 ? CLIMB_FT_NM : DESC_FT_NM);
    if (Math.abs(da) > 20 && need < len - 0.05)
      pts.push({
        d: d0 + need,
        alt: target,
        leg: base.leg,
        seg: base.seg === "climb" ? "climb" : base.seg,
      });
    const reach =
      need <= len
        ? target
        : a0 + Math.sign(da) * len * (da > 0 ? CLIMB_FT_NM : DESC_FT_NM);
    alt = reach;
    pts.push({ ...base, d, alt });
  };
  try {
    if (c.start.type === "runway") {
      const rw = getRunway(c.start.airport, c.start.runway);
      pos = rw.threshold;
      track.push(rw.threshold);
      alt = rw.elevFt;
      assigned = c.start.initialAlt;
      pts.push({ d: 0, alt, ident: `RWY ${rw.id}`, leg: -1, seg: "climb" });
    } else {
      const f = findFix(c.start.fix);
      if (!f) return out;
      pos = destination(f, c.start.bearing, c.start.distNm);
      track.push(pos);
      alt = c.start.altFt;
      assigned = c.start.altFt;
      pts.push({ d: 0, alt, ident: "START", leg: -1, seg: "route" });
    }
    c.legs.forEach((l, i) => {
      if (l.type === "alt") {
        assigned = l.alt;
        return;
      }
      if (l.type === "fix" || l.type === "hold") {
        const f = findFix(l.ident);
        if (!f) return;
        const target = l.type === "hold" ? l.alt : (l.alt ?? assigned);
        assigned = target;
        const seg = alt < target - 20 ? "climb" : "route";
        if (l.type === "fix") goTo(f, target, { ident: f.ident, leg: i, seg });
        else {
          // the altitude still missing at the fix is gained / lost in the hold
          goTo(f, target, { leg: i, seg });
          alt = target;
          pts.push({ d, alt, ident: f.ident, leg: i, seg, hold: true });
        }
        return;
      }
      let ap: Approach;
      try {
        ap = getApproach(l.approachId);
      } catch {
        return;
      }
      const seq = approachSequence(ap, l.transition);
      const rw = (() => {
        try {
          return getRunway(ap.airport, ap.runway);
        } catch {
          return null;
        }
      })();
      const thrElev = rw?.elevFt ?? 0;
      const faf = seq.findIndex((x) => x.role === "FAF");
      const m = ap.minimums[0];
      const minAlt = m ? (m.da ?? m.mda ?? thrElev + 250) : thrElev + 250;
      let prev: LatLon | null = pos;
      seq.forEach((pl, k) => {
        // the route already ends at the first fix of the approach: annotate that point instead of a new one
        const last = pts[pts.length - 1];
        if (k === 0 && pos && last?.ident === pl.fix.ident && distanceNm(pos, pl.fix) < 0.05) {
          Object.assign(last, { role: pl.role, amin: pl.altMin, amax: pl.altMax, leg: i });
          prev = pl.fix;
          return;
        }
        const path = prev ? legPath(prev, pl) : [pl.fix];
        const isRwy = pl.fix.kind === "runway" || pl.role === "MAP";
        const base = {
          ident: isRwy ? `RW${ap.runway}` : pl.fix.ident,
          leg: i,
          role: pl.role,
          amin: pl.altMin,
          amax: pl.altMax,
        } as const;
        if (faf >= 0 && k > faf) {
          // final segment: glidepath to the threshold, or descent to the MDA then level to the MAP
          const d0 = d;
          if (ap.gsAngle && isRwy) {
            for (const q of path.slice(1, -1)) add(q);
            add(pl.fix);
            const tch = thrElev + (ap.tch ?? 50);
            out.gp = { angle: ap.gsAngle, d0, d1: d };
            out.mins = {
              alt: minAlt,
              label: `${m?.da ? "DA" : "MDA"} ${minAlt}`,
              d0,
              d1: d,
            };
            alt = tch;
            pts.push({ ...base, d, alt, seg: "gp" });
          } else {
            const target = isRwy
              ? minAlt
              : (pl.altMin ??
                Math.max(
                  minAlt,
                  alt - distanceNm(prev ?? pl.fix, pl.fix) * 318,
                ));
            const before = d;
            for (const q of path.slice(1, -1)) add(q);
            add(pl.fix);
            const len = d - before;
            const need = Math.max(0, (alt - target) / 318);
            if (need < len - 0.05 && alt - target > 20)
              pts.push({
                d: before + need,
                alt: target,
                leg: i,
                seg: "approach",
              });
            alt = target;
            pts.push({ ...base, d, alt, seg: "approach" });
            if (isRwy)
              out.mins = {
                alt: minAlt,
                label: `MDA ${minAlt}`,
                d0: pts.find((x) => x.role === "FAF" && x.leg === i)?.d ?? d0,
                d1: d,
              };
          }
        } else {
          const target = pl.altMin ?? pl.altMax ?? alt;
          goTo(
            pl.fix,
            k === 0
              ? Math.max(target, Math.min(alt, pl.altMax ?? Infinity))
              : target,
            { ...base, seg: k === 0 ? "route" : "approach" },
            path,
          );
        }
        prev = pl.fix;
      });
      if (l.outcome === "missed" && ap.missed.length) {
        const mh = ap.missed[ap.missed.length - 1];
        const target = mh.altMin ?? Math.max(alt + 2000, 3000);
        ap.missed.forEach((ml, k) => {
          if (k === 0 && ml.fix.kind === "runway") return;
          const path = prev ? legPath(prev, ml) : [ml.fix];
          const isLast = k === ap.missed.length - 1;
          goTo(
            ml.fix,
            isLast ? target : (ml.altMin ?? target),
            {
              ident: ml.fix.ident,
              leg: i,
              seg: "missed",
              role: isLast ? "MAHP" : undefined,
              amin: ml.altMin,
              hold: isLast && !!ml.hold,
            },
            path,
          );
          prev = ml.fix;
        });
        assigned = target;
      } else if (l.outcome === "land" && rw) {
        alt = thrElev;
      }
    });
  } catch {
    /* unresolved data: profile of what resolved */
  }
  out.total = d;
  if (sampleGround && track.length > 1 && d > 0) {
    const n = Math.min(240, Math.max(30, Math.round(d * 2)));
    // walk the track and sample the ground at regular along-track distances
    let acc = 0;
    let k = 1;
    for (let s = 0; s <= n; s++) {
      const want = (d * s) / n;
      while (
        k < track.length - 1 &&
        acc + distanceNm(track[k - 1], track[k]) < want
      ) {
        acc += distanceNm(track[k - 1], track[k]);
        k++;
      }
      const seg = distanceNm(track[k - 1], track[k]) || 1;
      const f = Math.max(0, Math.min(1, (want - acc) / seg));
      const p = {
        lat: track[k - 1].lat + (track[k].lat - track[k - 1].lat) * f,
        lon: track[k - 1].lon + (track[k].lon - track[k - 1].lon) * f,
      };
      let e = 0;
      try {
        e = Math.max(0, groundElevation(p));
      } catch {
        e = 0;
      }
      out.ground.push({ d: want, elev: e });
    }
  }
  return out;
}

// ------------------------------------------------------------------ web-mercator helpers
const TILE = 256;
const mx = (lon: number, z: number) => ((lon + 180) / 360) * TILE * 2 ** z;
const my = (lat: number, z: number) => {
  const s = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z;
};
const unx = (x: number, z: number) => (x / (TILE * 2 ** z)) * 360 - 180;
const uny = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * 2 ** z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

/** keyless basemaps (Esri ArcGIS Online tiles, attribution required) */
const BASEMAPS = {
  topo: {
    name: "Topo",
    url: (z: string, x: string, y: string) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${y}/${x}`,
    attr: "Tiles © Esri — Esri, HERE, Garmin, USGS, NGA, EPA, NPS",
  },
  light: {
    name: "Light",
    url: (z: string, x: string, y: string) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/${z}/${y}/${x}`,
    attr: "Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors",
  },
} as const;
type BaseStyle = keyof typeof BASEMAPS;
const loadStyle = (): BaseStyle => {
  try {
    return localStorage.getItem("ifr.map.style") === "topo" ? "topo" : "light";
  } catch {
    return "light";
  }
};

/** chart colours (light surfaces) */
export const MAP_COL = {
  route: "#0b63ce",
  approach: "#b4279a",
  missed: "#667085",
  hold: "#b7791f",
  transition: "#667085",
  start: "#13804b",
  ink: "#1d2833",
  navaid: "#0d3d73",
} as const;

const pad3 = (n: number) =>
  String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, "0");
const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
const f1 = (v: number) => v.toFixed(1);

// ------------------------------------------------------------------ the map widget
export interface RouteMapOpts {
  /** CSS height of the widget (px); 0 = fill the parent (the parent sets the height) */
  height: number;
  /** show the expand button (opens the same plan full screen) */
  onExpand?: () => void;
  /** smaller labels, no legend */
  compact?: boolean;
  /** a flown track (sim coordinates) drawn over the plan, e.g. in the debrief; included when fitting */
  track?: LatLon[];
  /** optional markers on the track (touchdown, missed approach, …) */
  marks?: { p: LatLon; label: string; color?: string }[];
  /** number the legs (circuit builder: the numbers match the leg list) */
  legNumbers?: boolean;
  /** circuit leg drawn emphasised (others dimmed); −1 = start */
  highlight?: number | null;
  /** click on a numbered leg badge */
  onPickLeg?: (leg: number) => void;
}

type Box = [number, number, number, number];

export class RouteMap {
  el: HTMLElement;
  private view: HTMLElement;
  private tiles: HTMLElement;
  private bgCanvas: HTMLCanvasElement;
  private svg: SVGSVGElement;
  private g: PlanGeometry;
  private real = !!currentRegion();
  private z = 10;
  private cx = 0; // world px at zoom z of the view centre
  private cy = 0;
  private W = 0;
  private H = 0;
  private fitted = false;
  private style: BaseStyle = loadStyle();
  private attr: HTMLElement | null = null;
  private ro: ResizeObserver | null = null;
  private airportsShown = new Set<string>();

  constructor(
    c: Circuit | null,
    private o: RouteMapOpts,
  ) {
    this.g = this.geometry(c);
    this.tiles = h("div", { class: "rm-tiles" });
    this.bgCanvas = h("canvas", { class: "rm-bg" }) as HTMLCanvasElement;
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("class", "rm-svg");
    const zoom = (d: number) => this.zoomAt(d, this.W / 2, this.H / 2);
    const btn = (
      title: string,
      body: Node | string,
      on: () => void,
      cls = "",
    ) =>
      h(
        "button",
        { type: "button", title, "aria-label": title, class: cls, onclick: on },
        body,
      );
    this.attr = h(
      "div",
      { class: "rm-attr" },
      this.real
        ? BASEMAPS[this.style].attr
        : "Ardent Islands · training region",
    );
    this.view = h(
      "div",
      { class: "rm-view" },
      this.bgCanvas,
      this.tiles,
      this.svg,
      h(
        "div",
        { class: "rm-ctl" },
        btn("Zoom in", "+", () => zoom(1)),
        btn("Zoom out", "−", () => zoom(-1)),
        btn("Fit the flight", svgIcon(I.target, 15), () => {
          this.fit();
          this.draw();
        }),
        this.real
          ? btn(
              "Basemap: light / topographic",
              svgIcon(I.map, 15),
              () => this.toggleStyle(),
              "rm-style",
            )
          : null,
        o.onExpand
          ? btn("Full-screen map", svgIcon(I.screen, 15), o.onExpand, "rm-exp")
          : null,
      ),
      o.compact ? this.attr : null,
    );
    const sw = (cls: string, label: string) =>
      h("span", { class: "rm-chip" }, h("i", { class: cls }), label);
    this.el = h(
      "div",
      {
        class: `rm${o.compact ? " compact" : ""}${this.real ? " real" : " train"}${o.height ? "" : " fill"}`,
        style: o.height ? `height:${o.height}px` : "",
      },
      this.view,
      o.compact
        ? null
        : h(
            "div",
            { class: "rm-foot" },
            h(
              "div",
              { class: "rm-legend" },
              sw("l-route", "Route"),
              sw("l-app", "Approach"),
              sw("l-mis", "Missed approach"),
              sw("l-hold", "Hold"),
              sw("l-tr", "Other transitions"),
            ),
            this.attr,
          ),
    );
    this.interact();
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.view);
  }

  private geometry(c: Circuit | null): PlanGeometry {
    const g = c ? planGeometry(c) : { lines: [], points: [], bounds: [] };
    if (this.o.track?.length) g.bounds.push(...this.o.track);
    for (const m of this.o.marks ?? []) g.bounds.push(m.p);
    // the airports the plan uses are labelled first
    this.airportsShown = new Set<string>();
    if (c) {
      if (c.start.type === "runway") this.airportsShown.add(c.start.airport);
      for (const l of c.legs)
        if (l.type === "approach")
          try {
            this.airportsShown.add(getApproach(l.approachId).airport);
          } catch {
            /* not loaded */
          }
    }
    return g;
  }

  /** replace the plan drawn (keeps the view unless `refit`) */
  setPlan(c: Circuit | null, refit = false) {
    this.g = this.geometry(c);
    if (refit) this.fitted = false;
    if (refit && this.W) this.fit();
    this.draw();
  }
  setHighlight(leg: number | null) {
    this.o.highlight = leg;
    this.draw();
  }

  /** frame used for drawing: real-world coordinates when a real region is loaded */
  private geo(p: LatLon): LatLon {
    return this.real ? toReal(p) : p;
  }
  private px(p: LatLon): [number, number] {
    const q = this.geo(p);
    return [
      mx(q.lon, this.z) - this.cx + this.W / 2,
      my(q.lat, this.z) - this.cy + this.H / 2,
    ];
  }

  private layout() {
    const r = this.view.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const changed =
      Math.round(r.width) !== this.W || Math.round(r.height) !== this.H;
    this.W = Math.round(r.width);
    this.H = Math.round(r.height);
    if (!this.fitted) this.fit();
    if (changed || !this.fitted) this.draw();
  }

  /** fit the plan with 10% padding (continuous zoom: no empty band) */
  fit() {
    const pts = (
      this.g.bounds.length ? this.g.bounds : AIRPORTS.slice(0, 3)
    ).map((p) => this.geo(p));
    if (!pts.length || !this.W) return;
    const xs = pts.map((p) => mx(p.lon, 0)),
      ys = pts.map((p) => my(p.lat, 0));
    const dx = Math.max(...xs) - Math.min(...xs),
      dy = Math.max(...ys) - Math.min(...ys);
    const padX = Math.max(30, this.W * 0.1),
      padY = Math.max(30, this.H * 0.1);
    const zx = dx > 1e-9 ? Math.log2((this.W - 2 * padX - 30) / dx) : 13;
    const zy = dy > 1e-9 ? Math.log2((this.H - 2 * padY - 20) / dy) : 13; // 20 px: scale bar
    // never closer than ~10 NM across the view (a lone runway would fill the map)
    const midLat = (Math.max(...pts.map((p) => p.lat)) + Math.min(...pts.map((p) => p.lat))) / 2;
    const zMax = Math.log2((this.W * 156543.03392 * Math.cos((midLat * Math.PI) / 180)) / 18520);
    this.z = Math.max(3, Math.min(14.5, zMax, Math.min(zx, zy)));
    this.cx = ((Math.max(...xs) + Math.min(...xs)) / 2) * 2 ** this.z;
    this.cy = ((Math.max(...ys) + Math.min(...ys)) / 2) * 2 ** this.z + 8; // keep the plan clear of the scale bar
    this.fitted = true;
  }

  private zoomAt(d: number, sx: number, sy: number) {
    const nz = Math.max(3, Math.min(16, this.z + d));
    if (nz === this.z) return;
    const k = 2 ** (nz - this.z);
    // keep the point under the cursor fixed
    const wx = this.cx + (sx - this.W / 2),
      wy = this.cy + (sy - this.H / 2);
    this.cx = wx * k - (sx - this.W / 2);
    this.cy = wy * k - (sy - this.H / 2);
    this.z = nz;
    this.draw();
  }

  private interact() {
    let drag: {
      x: number;
      y: number;
      cx: number;
      cy: number;
      moved: boolean;
    } | null = null;
    const v = this.view;
    v.addEventListener("pointerdown", (e) => {
      if ((e.target as Element).closest(".rm-ctl")) return;
      drag = {
        x: e.clientX,
        y: e.clientY,
        cx: this.cx,
        cy: this.cy,
        moved: false,
      };
      v.setPointerCapture(e.pointerId);
    });
    v.addEventListener("pointermove", (e) => {
      if (!drag) return;
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) {
        drag.moved = true;
        this.el.classList.add("drag");
      }
      this.cx = drag.cx - (e.clientX - drag.x);
      this.cy = drag.cy - (e.clientY - drag.y);
      this.draw(true);
    });
    const end = (e: PointerEvent) => {
      if (!drag) return;
      const click = !drag.moved;
      drag = null;
      this.el.classList.remove("drag");
      this.draw();
      if (click && this.o.onPickLeg) {
        const r = v.getBoundingClientRect();
        const hit = this.badgeAt(e.clientX - r.left, e.clientY - r.top);
        if (hit !== null) this.o.onPickLeg(hit);
      }
    };
    v.addEventListener("pointerup", end);
    v.addEventListener("pointercancel", end);
    v.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = v.getBoundingClientRect();
        this.zoomAt(
          e.deltaY < 0 ? 0.5 : -0.5,
          e.clientX - r.left,
          e.clientY - r.top,
        );
      },
      { passive: false },
    );
    v.addEventListener("dblclick", (e) => {
      const r = v.getBoundingClientRect();
      this.zoomAt(1, e.clientX - r.left, e.clientY - r.top);
    });
  }

  private badges: { leg: number; x: number; y: number }[] = [];
  private badgeAt(x: number, y: number): number | null {
    for (const b of this.badges)
      if (Math.hypot(b.x - x, b.y - y) < 12) return b.leg;
    return null;
  }

  // ---------------------------------------------------------------- drawing
  private draw(fast = false) {
    if (!this.W) return;
    if (this.real) this.drawTiles();
    else if (!fast) this.drawLand();
    else this.bgCanvas.style.opacity = "0.55";
    this.drawOverlay();
  }

  private drawTiles() {
    const tz = Math.max(3, Math.min(17, Math.round(this.z)));
    const s = 2 ** (this.z - tz);
    const T = TILE * s;
    const x0 = this.cx - this.W / 2,
      y0 = this.cy - this.H / 2;
    const n = 2 ** tz;
    const want = new Set<string>();
    for (let ty = Math.floor(y0 / T); ty <= Math.floor((y0 + this.H) / T); ty++)
      for (
        let tx = Math.floor(x0 / T);
        tx <= Math.floor((x0 + this.W) / T);
        tx++
      ) {
        if (ty < 0 || ty >= n) continue;
        want.add(`${tz}/${((tx % n) + n) % n}/${ty}|${tx}`);
      }
    const have = new Map<string, HTMLImageElement>();
    for (const img of [...this.tiles.children] as HTMLImageElement[]) {
      if (!want.has(img.dataset.k!)) img.remove();
      else have.set(img.dataset.k!, img);
    }
    for (const k of want) {
      const [path, txs] = k.split("|");
      const [zz, xx, yy] = path.split("/");
      const tx = Number(txs);
      let img = have.get(k);
      if (!img) {
        img = new Image(TILE, TILE);
        img.dataset.k = k;
        img.alt = "";
        img.draggable = false;
        img.decoding = "async";
        img.src = BASEMAPS[this.style].url(zz, xx, yy);
        img.onerror = () => {
          img!.style.visibility = "hidden";
        };
        this.tiles.append(img);
      }
      img.style.width = img.style.height = `${Math.ceil(T) + 1}px`;
      img.style.transform = `translate(${Math.round(tx * T - x0)}px, ${Math.round(Number(yy) * T - y0)}px)`;
    }
  }

  /** training region: land / sea from the terrain model, shaded like a chart */
  private drawLand() {
    const c = this.bgCanvas;
    const s = 3;
    const w = Math.ceil(this.W / s),
      hh = Math.ceil(this.H / s);
    c.width = w;
    c.height = hh;
    c.style.opacity = "1";
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(w, hh);
    const x0 = this.cx - this.W / 2,
      y0 = this.cy - this.H / 2;
    for (let j = 0; j < hh; j++)
      for (let i = 0; i < w; i++) {
        const p = {
          lat: uny(y0 + j * s + s / 2, this.z),
          lon: unx(x0 + i * s + s / 2, this.z),
        };
        const m = Math.max(0, Math.min(1, (landMask(p) - 0.35) / 0.3)); // soft coastline
        const k = (j * w + i) * 4;
        // chart tints: water light blue, land warm off-white
        img.data[k] = 207 + (244 - 207) * m;
        img.data[k + 1] = 226 + (241 - 226) * m;
        img.data[k + 2] = 240 + (232 - 240) * m;
        img.data[k + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  }

  private drawOverlay() {
    const svg = this.svg;
    const W = this.W,
      H = this.H;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));
    const out: string[] = [];
    const P = (p: LatLon) => this.px(p);
    const poly = (pts: LatLon[]) =>
      pts.map((p) => P(p).map(f1).join(",")).join(" ");
    const compact = !!this.o.compact;
    const hl = this.o.highlight ?? null;
    const dim = (leg: number | undefined) => hl !== null && leg !== hl;
    // label placement: every drawn label / symbol / control reserves a box
    const boxes: Box[] = [[W - 44, 0, W, 190]]; // map controls
    const free = (b: Box) =>
      b[0] >= 2 &&
      b[1] >= 2 &&
      b[2] <= W - 2 &&
      b[3] <= H - 2 &&
      !boxes.some(
        ([a, bb, c, d]) => b[0] < c && b[2] > a && b[1] < d && b[3] > bb,
      );
    const inView = (x: number, y: number, m = 60) =>
      x > -m && y > -m && x < W + m && y < H + m;

    // airports: runways (thin, chart grey)
    const rwW = Math.max(1.6, Math.min(6, 2 ** (this.z - 10) * 2));
    const apLabels: { icao: string; x: number; y: number; own: boolean }[] = [];
    for (const a of AIRPORTS) {
      const [ax, ay] = P(a);
      if (!inView(ax, ay)) continue;
      for (let k = 0; k < a.runways.length; k += 2) {
        const [x1, y1] = P(a.runways[k].threshold),
          [x2, y2] = P(a.runways[k].end);
        out.push(
          `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="#3b4652" stroke-width="${f1(rwW)}"/>`,
        );
      }
      apLabels.push({
        icao: a.icao,
        x: ax,
        y: ay,
        own: this.airportsShown.has(a.icao),
      });
    }

    // lines: faint transitions first, then missed, holds, route, approach on top
    const order: MapLine["kind"][] = [
      "transition",
      "missed",
      "hold",
      "route",
      "approach",
    ];
    const width = {
      transition: 1.3,
      missed: 2,
      hold: 2.2,
      route: 3,
      approach: 3,
    } as const;
    const dash = {
      transition: ' stroke-dasharray="1.5 4"',
      missed: ' stroke-dasharray="7 5"',
      hold: "",
      route: "",
      approach: "",
    } as const;
    // emphasis halo under the highlighted leg
    if (hl !== null)
      for (const l of this.g.lines)
        if (l.leg === hl && l.kind !== "transition")
          out.push(
            `<polyline points="${poly(l.pts)}" fill="none" stroke="rgb(11 99 206 / .22)" stroke-width="${width[l.kind] + 9}" stroke-linejoin="round" stroke-linecap="round"/>`,
          );
    const legLabels: {
      x: number;
      y: number;
      ang: number;
      text: string;
      kind: MapLine["kind"];
      leg?: number;
    }[] = [];
    for (const kind of order)
      for (const l of this.g.lines.filter((x) => x.kind === kind)) {
        const op = (kind === "transition" ? 0.75 : 1) * (dim(l.leg) ? 0.38 : 1);
        out.push(
          `<polyline points="${poly(l.pts)}" fill="none" stroke="#fff" stroke-width="${width[kind] + 2.5}" stroke-linejoin="round" opacity="${f1(0.8 * op)}"/>`,
        );
        out.push(
          `<polyline points="${poly(l.pts)}" fill="none" stroke="${MAP_COL[kind]}" stroke-width="${width[kind]}" stroke-linejoin="round" stroke-linecap="round"${dash[kind]} opacity="${op.toFixed(2)}"/>`,
        );
        // direction arrows + magnetic course / distance along legs long enough
        if (kind === "route" || kind === "approach" || kind === "missed")
          for (let i = 1; i < l.pts.length; i++) {
            const [ax, ay] = P(l.pts[i - 1]),
              [bx, by] = P(l.pts[i]);
            const len = Math.hypot(bx - ax, by - ay);
            if (len < 60) continue;
            const ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
            const mxp = (ax + bx) / 2,
              myp = (ay + by) / 2;
            if (kind !== "missed" || len > 90)
              out.push(
                `<path d="M-5,-4 L3,0 L-5,4" transform="translate(${f1(mxp)},${f1(myp)}) rotate(${f1(ang)})" fill="none" stroke="${MAP_COL[kind]}" stroke-width="1.8" opacity="${op.toFixed(2)}"/>`,
              );
            if (compact || kind === "missed" || len < 110) continue;
            // sim coordinates are on magnetic north: the bearing is the magnetic course
            const crs = pad3(bearingDeg(l.pts[i - 1], l.pts[i]));
            const nm = distanceNm(l.pts[i - 1], l.pts[i]);
            if (l.pts.length > 3 && nm < 2) continue; // arc samples
            legLabels.push({
              x: mxp,
              y: myp,
              ang,
              text: `${crs}°  ${nm < 10 ? nm.toFixed(1) : nm.toFixed(0)}`,
              kind,
              leg: l.leg,
            });
          }
        // hold: inbound arrow on the inbound leg (the last point of the racetrack is the fix)
        if (kind === "hold" && l.pts.length > 34) {
          const [ax, ay] = P(l.pts[33]),
            [bx, by] = P(l.pts[l.pts.length - 1]);
          const ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
          out.push(
            `<path d="M-5,-4 L3,0 L-5,4" transform="translate(${f1((ax + bx) / 2)},${f1((ay + by) / 2)}) rotate(${f1(ang)})" fill="none" stroke="${MAP_COL.hold}" stroke-width="1.8" opacity="${op.toFixed(2)}"/>`,
          );
        }
      }

    // flown track + marks (debrief)
    const t = this.o.track;
    if (t && t.length > 1) {
      out.push(
        `<polyline points="${poly(t)}" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round" opacity="0.8"/>`,
      );
      out.push(
        `<polyline points="${poly(t)}" fill="none" stroke="#111a24" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`,
      );
    }

    // symbols
    const seen = new Set<string>();
    const pts = [...this.g.points].sort((a, b) => rank(a) - rank(b));
    const drawn: { p: MapPoint; x: number; y: number }[] = [];
    for (const p of pts) {
      if (seen.has(p.ident)) continue;
      seen.add(p.ident);
      const [x, y] = P(p.p);
      if (!inView(x, y, 20)) continue;
      const nav = NAVAIDS.find((n) => n.ident === p.ident);
      out.push(
        `<g opacity="${dim(p.leg) && p.kind !== "start" ? 0.55 : 1}">${symbol(p.kind, x, y, nav?.type === "VORDME")}</g>`,
      );
      boxes.push([x - 7, y - 7, x + 7, y + 7]);
      drawn.push({ p, x, y });
    }
    for (const m of this.o.marks ?? []) {
      const [x, y] = P(m.p);
      out.push(
        `<circle cx="${f1(x)}" cy="${f1(y)}" r="5.5" fill="${m.color ?? "#b42318"}" stroke="#fff" stroke-width="2"/>`,
      );
      boxes.push([x - 6, y - 6, x + 6, y + 6]);
    }
    // leg number badges (builder)
    this.badges = [];
    if (this.o.legNumbers) {
      const done = new Set<number>();
      for (const l of this.g.lines) {
        if (
          l.leg === undefined ||
          l.leg < 0 ||
          done.has(l.leg) ||
          l.kind === "transition" ||
          l.kind === "missed"
        )
          continue;
        if (
          l.kind === "route" &&
          this.g.lines.some((x) => x.leg === l.leg && x.kind === "approach")
        )
          continue; // approach: badge on its own track
        done.add(l.leg);
        const a =
          l.kind === "hold"
            ? l.pts[Math.floor(l.pts.length * 0.62)]
            : l.pts[Math.floor((l.pts.length - 1) / 2)];
        const b =
          l.kind === "hold"
            ? a
            : (l.pts[Math.floor((l.pts.length - 1) / 2) + 1] ?? a);
        const [ax, ay] = P(a),
          [bx, by] = P(b);
        const x = (ax + bx) / 2,
          y = (ay + by) / 2;
        if (!inView(x, y, 0)) continue;
        const on = hl === l.leg;
        this.badges.push({ leg: l.leg, x, y });
        out.push(
          `<g class="rm-badge${on ? " on" : ""}" transform="translate(${f1(x)},${f1(y)})"><circle r="9"/><text y="3.6">${l.leg + 1}</text></g>`,
        );
        boxes.push([x - 10, y - 10, x + 10, y + 10]);
      }
    }

    // fix labels: ident (+ role tag) and the altitude, Jeppesen style (min underlined, max overlined)
    const CH = compact ? 6.1 : 6.7;
    for (const { p, x, y } of drawn) {
      const tag = !compact && p.role ? p.role : "";
      const id = p.ident;
      const altTxt = compact
        ? ""
        : p.amin !== undefined || p.amax !== undefined
          ? String(p.amin ?? p.amax)
          : (p.alt ?? "");
      const w1 = (tag ? tag.length * 5.2 + 4 : 0) + id.length * CH;
      const w = Math.max(w1, altTxt.length * 6) + 2;
      const hh = altTxt ? 25 : 13;
      const cands: [number, number][] = [
        [x + 9, y - hh - 1],
        [x + 9, y + 3],
        [x - w - 9, y - hh - 1],
        [x - w - 9, y + 3],
        [x - w / 2, y - hh - 10],
        [x - w / 2, y + 10],
      ];
      const at = cands.find(([lx, ly]) => free([lx, ly, lx + w, ly + hh]));
      if (!at) continue;
      boxes.push([at[0], at[1], at[0] + w, at[1] + hh]);
      const op = dim(p.leg) && p.kind !== "start" ? 0.6 : 1;
      let s = `<g class="rm-lbl ${p.kind}" opacity="${op}"><text x="${f1(at[0])}" y="${f1(at[1] + 10)}">${tag ? `<tspan class="role">${tag} </tspan>` : ""}${esc(id)}</text>`;
      if (altTxt) {
        const ax0 = at[0],
          ay0 = at[1] + 22,
          aw = altTxt.length * 6;
        s += `<text class="alt" x="${f1(ax0)}" y="${f1(ay0)}">${esc(altTxt)}</text>`;
        if (p.amin !== undefined)
          s += `<line class="alt-u" x1="${f1(ax0)}" x2="${f1(ax0 + aw)}" y1="${f1(ay0 + 2.2)}" y2="${f1(ay0 + 2.2)}"/>`;
        if (p.amax !== undefined)
          s += `<line class="alt-u" x1="${f1(ax0)}" x2="${f1(ax0 + aw)}" y1="${f1(ay0 - 9)}" y2="${f1(ay0 - 9)}"/>`;
      }
      out.push(s + "</g>");
    }
    // airport labels: the airports of the plan first, then others while there is room
    for (const a of apLabels.sort((p, q) => Number(q.own) - Number(p.own))) {
      if (seen.has(a.icao)) continue;
      if (!a.own && (compact || apLabels.length > 40)) continue;
      const w = a.icao.length * 7 + 2;
      const cands: [number, number][] = [
        [a.x + 8, a.y - 18],
        [a.x + 8, a.y + 6],
        [a.x - w - 8, a.y - 18],
        [a.x - w - 8, a.y + 6],
      ];
      const at = cands.find(([lx, ly]) => free([lx, ly, lx + w, ly + 13]));
      if (!at) continue;
      boxes.push([at[0], at[1], at[0] + w, at[1] + 13]);
      out.push(
        `<text class="rm-apt${a.own ? " own" : ""}" x="${f1(at[0])}" y="${f1(at[1] + 10)}">${a.icao}</text>`,
      );
    }
    // course / distance along the legs, aligned with the track, upright
    for (const lb of legLabels) {
      const w = lb.text.length * 6.1;
      const up = lb.ang > 90 || lb.ang < -90 ? lb.ang + 180 : lb.ang;
      const r = (up * Math.PI) / 180;
      const nx = -Math.sin(r) * 9,
        ny = Math.cos(r) * -9; // offset to the "upper" side of the line
      const x = lb.x + nx,
        y = lb.y + ny;
      const ex = (Math.abs(Math.cos(r)) * w) / 2 + Math.abs(Math.sin(r)) * 6,
        ey = (Math.abs(Math.sin(r)) * w) / 2 + Math.abs(Math.cos(r)) * 6;
      const b: Box = [x - ex, y - ey, x + ex, y + ey];
      if (!free(b)) continue;
      boxes.push(b);
      out.push(
        `<text class="rm-leg ${lb.kind}" opacity="${dim(lb.leg) ? 0.5 : 1}" transform="translate(${f1(x)},${f1(y)}) rotate(${f1(up)})" y="3.5">${lb.text}</text>`,
      );
    }
    for (const m of this.o.marks ?? []) {
      const [x, y] = P(m.p);
      const w = m.label.length * 6.6 + 4;
      const at = [
        [x + 8, y - 16],
        [x + 8, y + 4],
        [x - w - 8, y - 16],
      ].find(([lx, ly]) => free([lx, ly, lx + w, ly + 13]));
      if (!at) continue;
      boxes.push([at[0], at[1], at[0] + w, at[1] + 13]);
      out.push(
        `<text class="rm-mark" x="${f1(at[0])}" y="${f1(at[1] + 10)}">${esc(m.label)}</text>`,
      );
    }

    // north arrow (true north: the basemap is north-up) and scale bar
    out.push(
      `<g class="rm-north" transform="translate(18,${compact ? 18 : 22})"><path d="M0,-11 L5,5 L0,2 L-5,5 Z"/><text y="17">N</text></g>`,
    );
    const lat = uny(this.cy, this.z);
    const nmPerPx =
      (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** this.z / 1852;
    const target = (compact ? 60 : 90) * nmPerPx;
    const nice =
      [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200].find((v) => v >= target * 0.6) ??
      200;
    const bw = nice / nmPerPx;
    const sy = H - (compact ? 12 : 14);
    out.push(
      `<g class="rm-scale" transform="translate(12,${f1(sy)})"><rect x="-4" y="-13" width="${f1(bw + 40)}" height="19" rx="4"/><path d="M0,-4 V2 H${f1(bw)} V-4"/><path d="M${f1(bw / 2)},-2 V2"/><text x="${f1(bw + 5)}" y="1.5">${nice} NM</text></g>`,
    );
    svg.innerHTML = out.join("");
  }

  private toggleStyle() {
    this.style = this.style === "topo" ? "light" : "topo";
    try {
      localStorage.setItem("ifr.map.style", this.style);
    } catch {
      /* private mode */
    }
    this.tiles.replaceChildren();
    if (this.attr) this.attr.textContent = BASEMAPS[this.style].attr;
    this.draw();
  }

  destroy() {
    this.ro?.disconnect();
  }
}

const rank = (p: MapPoint) =>
  p.kind === "start"
    ? 0
    : p.kind === "airport"
      ? 1
      : p.role === "IAF" || p.role === "FAF" || p.kind === "mahp"
        ? 2
        : p.role === "IF"
          ? 3
          : p.kind === "vor" || p.kind === "ndb"
            ? 4
            : 5;

/** ICAO / Jeppesen plan-view symbols */
function symbol(
  kind: MapPoint["kind"],
  x: number,
  y: number,
  dme = false,
): string {
  const t = `translate(${f1(x)},${f1(y)})`;
  const ink = MAP_COL.ink;
  switch (kind) {
    case "start":
      return `<g transform="${t}"><circle r="7" fill="${MAP_COL.start}" stroke="#fff" stroke-width="2"/><path d="M-2.5,-3.5 L3.8,0 L-2.5,3.5 Z" fill="#fff"/></g>`;
    case "vor":
      return `<g transform="${t}">${dme ? `<rect x="-7.5" y="-6.6" width="15" height="13.2" fill="#fff" stroke="${MAP_COL.navaid}" stroke-width="1.3"/>` : ""}<polygon points="-6,0 -3,-5.2 3,-5.2 6,0 3,5.2 -3,5.2" fill="#fff" stroke="${MAP_COL.navaid}" stroke-width="1.6"/><circle r="1.5" fill="${MAP_COL.navaid}"/></g>`;
    case "ndb": {
      const dots = (r: number, n: number) =>
        Array.from(
          { length: n },
          (_, k) =>
            `<circle cx="${f1(Math.cos((k / n) * 2 * Math.PI) * r)}" cy="${f1(Math.sin((k / n) * 2 * Math.PI) * r)}" r="0.85"/>`,
        ).join("");
      return `<g transform="${t}" fill="#7a2e8c"><circle r="7.6" fill="#fff" opacity=".85"/>${dots(4.4, 9)}${dots(7, 14)}<circle r="2"/></g>`;
    }
    case "airport":
      return `<g transform="${t}"><circle r="5" fill="#fff" stroke="${ink}" stroke-width="1.6"/></g>`;
    case "faf":
      // compulsory point: filled triangle
      return `<g transform="${t}"><path d="M0,-6.5 L5.8,3.8 L-5.8,3.8 Z" fill="${ink}" stroke="#fff" stroke-width="1.2"/></g>`;
    case "iaf":
    case "mahp":
    default:
      // fix / reporting point on request: open triangle
      return `<g transform="${t}"><path d="M0,-6 L5.4,3.6 L-5.4,3.6 Z" fill="#fff" stroke="${ink}" stroke-width="1.5"/></g>`;
  }
}

// ------------------------------------------------------------------ the profile widget
export interface ProfileOpts {
  height: number;
  highlight?: number | null;
}

/** Vertical profile of the plan: altitudes along the track, glidepath and DA/MDA, terrain below. */
export class RouteProfile {
  el: HTMLElement;
  private prof: PlanProfile;
  private ro: ResizeObserver;
  private W = 0;
  constructor(
    c: Circuit | null,
    private o: ProfileOpts,
  ) {
    this.prof = c ? planProfile(c) : { pts: [], ground: [], total: 0 };
    this.el = h("div", { class: "rp", style: `height:${o.height}px` });
    this.ro = new ResizeObserver(() => {
      const w = Math.round(this.el.getBoundingClientRect().width);
      if (w > 10 && w !== this.W) {
        this.W = w;
        this.draw();
      }
    });
    this.ro.observe(this.el);
  }
  setPlan(c: Circuit | null) {
    this.prof = c ? planProfile(c) : { pts: [], ground: [], total: 0 };
    this.draw();
  }
  setHighlight(leg: number | null) {
    this.o.highlight = leg;
    this.draw();
  }
  destroy() {
    this.ro.disconnect();
  }
  private draw() {
    if (!this.W) return;
    this.el.innerHTML = profileSvg(
      this.prof,
      this.W,
      this.o.height,
      this.o.highlight ?? null,
    );
  }
}

/** SVG of a plan profile (Jeppesen profile conventions) */
export function profileSvg(
  pr: PlanProfile,
  W: number,
  H: number,
  hl: number | null = null,
): string {
  if (pr.pts.length < 2 || pr.total <= 0)
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><text class="rp-empty" x="${W / 2}" y="${H / 2}">Add a fix or an approach to see the vertical profile</text></svg>`;
  const L = 44,
    R = 14,
    T = 26,
    B = 30;
  const maxAlt = Math.max(
    ...pr.pts.map((p) => p.alt),
    ...pr.ground.map((g) => g.elev),
    1000,
  );
  const top = Math.ceil((maxAlt * 1.12) / 1000) * 1000;
  const X = (d: number) => L + (d / pr.total) * (W - L - R);
  const Y = (a: number) => T + (1 - a / top) * (H - T - B);
  const o: string[] = [];
  // grid + altitude scale
  const step = top > 8000 ? 2000 : 1000;
  for (let a = 0; a <= top; a += step)
    o.push(
      `<line class="rp-grid" x1="${L}" x2="${W - R}" y1="${f1(Y(a))}" y2="${f1(Y(a))}"/><text class="rp-ax" x="${L - 6}" y="${f1(Y(a) + 3.5)}">${a}</text>`,
    );
  // terrain
  if (pr.ground.length > 1) {
    const gp = pr.ground.map((g) => `${f1(X(g.d))},${f1(Y(g.elev))}`).join(" ");
    o.push(
      `<polygon class="rp-ground" points="${f1(X(0))},${f1(Y(0))} ${gp} ${f1(X(pr.total))},${f1(Y(0))}"/>`,
    );
  }
  // minimums
  if (pr.mins)
    o.push(
      `<line class="rp-mins" x1="${f1(X(pr.mins.d0))}" x2="${f1(X(pr.mins.d1))}" y1="${f1(Y(pr.mins.alt))}" y2="${f1(Y(pr.mins.alt))}"/><text class="rp-mins-t" x="${f1(X(pr.mins.d1) - 4)}" y="${f1(Y(pr.mins.alt) - 4)}">${pr.mins.label}</text>`,
    );
  // the path, by segment kind
  const col = (s: ProfilePt["seg"]) =>
    s === "approach" || s === "gp"
      ? MAP_COL.approach
      : s === "missed"
        ? MAP_COL.missed
        : MAP_COL.route;
  for (let i = 1; i < pr.pts.length; i++) {
    const a = pr.pts[i - 1],
      b = pr.pts[i];
    const on = hl !== null && b.leg === hl;
    const dimmed = hl !== null && !on;
    if (on)
      o.push(
        `<line x1="${f1(X(a.d))}" y1="${f1(Y(a.alt))}" x2="${f1(X(b.d))}" y2="${f1(Y(b.alt))}" stroke="rgb(11 99 206 / .2)" stroke-width="9" stroke-linecap="round"/>`,
      );
    o.push(
      `<line x1="${f1(X(a.d))}" y1="${f1(Y(a.alt))}" x2="${f1(X(b.d))}" y2="${f1(Y(b.alt))}" stroke="${col(b.seg)}" stroke-width="${b.seg === "missed" ? 1.8 : 2.4}"${b.seg === "missed" ? ' stroke-dasharray="6 4"' : ""} stroke-linecap="round" opacity="${dimmed ? 0.45 : 1}"/>`,
    );
  }
  if (pr.gp) {
    const x = (X(pr.gp.d0) + X(pr.gp.d1)) / 2;
    const a0 = pr.pts.find((p) => Math.abs(p.d - pr.gp!.d0) < 1e-6)?.alt ?? 0;
    const a1 = pr.pts.find((p) => Math.abs(p.d - pr.gp!.d1) < 1e-6)?.alt ?? 0;
    o.push(
      `<text class="rp-gp" x="${f1(x)}" y="${f1(Y((a0 + a1) / 2) - 7)}">GP ${pr.gp.angle.toFixed(2)}°</text>`,
    );
  }
  // fixes: tick + ident on the distance axis, altitude above the point (min underlined, max overlined)
  let lastAltX = -99;
  const idl: { x: number; text: string; dim: boolean; pri: number }[] = [];
  for (const p of pr.pts) {
    if (!p.ident) continue;
    const x = X(p.d),
      y = Y(p.alt);
    const dimmed = hl !== null && p.leg !== hl;
    o.push(
      `<line class="rp-tick" x1="${f1(x)}" x2="${f1(x)}" y1="${f1(y)}" y2="${H - B + 4}"/>`,
    );
    if (p.role === "FAF")
      o.push(
        `<g transform="translate(${f1(x)},${f1(y - 11)})" class="rp-faf"><path d="M0,0 L-4,-5 L-1.2,-4 L0,-7 L1.2,-4 L4,-5 Z M0,0 L-5,4 L-4,1.2 L-7,0 L-4,-1.2 L-5,-4 Z M0,0 L4,5 L1.2,4 L0,7 L-1.2,4 L-4,5 Z M0,0 L5,-4 L4,-1.2 L7,0 L4,1.2 L5,4 Z" transform="scale(0.9)"/></g>`,
      );
    else if (p.hold)
      o.push(
        `<rect class="rp-hold" x="${f1(x - 7)}" y="${f1(y - 12)}" width="14" height="7" rx="3.5"/>`,
      );
    else o.push(`<circle class="rp-pt" cx="${f1(x)}" cy="${f1(y)}" r="2.6"/>`);
    idl.push({ x, text: p.ident, dim: dimmed, pri: p.role === "FAF" || p.role === "IAF" || p.hold || p.role === "MAHP" ? 0 : p.leg < 0 ? 3 : p.ident.startsWith("RW") ? 1 : 2 });
    const at =
      p.amin ??
      p.amax ??
      (p.seg === "gp" ? undefined : Math.round(p.alt / 10) * 10);
    if (
      at !== undefined &&
      x - lastAltX > 34 &&
      p.role !== "MAP" &&
      !p.ident.startsWith("RW")
    ) {
      const ty = Math.max(10, y - (p.role === "FAF" ? 22 : p.hold ? 16 : 7));
      const tw = String(at).length * 5.8;
      o.push(
        `<text class="rp-alt${dimmed ? " dim" : ""}" x="${f1(x)}" y="${f1(ty)}">${at}</text>`,
      );
      if (p.amin !== undefined)
        o.push(
          `<line class="rp-u" x1="${f1(x - tw / 2)}" x2="${f1(x + tw / 2)}" y1="${f1(ty + 2)}" y2="${f1(ty + 2)}"/>`,
        );
      if (p.amax !== undefined)
        o.push(
          `<line class="rp-u" x1="${f1(x - tw / 2)}" x2="${f1(x + tw / 2)}" y1="${f1(ty - 9)}" y2="${f1(ty - 9)}"/>`,
        );
      lastAltX = x;
    }
  }
  // fix idents on the distance axis: the procedure fixes first, no overlaps
  const placed: [number, number][] = [];
  for (const l of idl.sort((a, b) => a.pri - b.pri)) {
    const w = l.text.length * 6 + 6;
    const x0 = Math.max(L - 8, Math.min(W - R - w / 2, l.x)) - w / 2;
    if (placed.some(([a, b]) => x0 < b && x0 + w > a)) continue;
    placed.push([x0, x0 + w]);
    o.push(`<text class="rp-id${l.dim ? " dim" : ""}" x="${f1(x0 + w / 2)}" y="${H - B + 15}">${esc(l.text)}</text>`);
  }
  o.push(
    `<text class="rp-ax" x="${W - R}" y="${H - 4}">${pr.total.toFixed(0)} NM</text><text class="rp-ax" x="${L - 6}" y="${T - 12}">ft</text>`,
  );
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${o.join("")}</svg>`;
}
