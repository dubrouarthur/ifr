// Flight-plan map: the planned flight drawn over a real map (OpenStreetMap / CARTO tiles in the real world, a
// land/sea chart of the training region otherwise) — route, holds (racetracks), approach transitions, final,
// missed approach and its hold, DME arcs, fixes, navaids and runways. Pan (drag), zoom (wheel / buttons), fit,
// and an optional full-screen view.
import { h } from "./dom";
import {
  AIRPORTS,
  NAVAIDS,
  findFix,
  approach as getApproach,
  landMask,
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
};
export type MapPoint = {
  ident: string;
  kind: "start" | "fix" | "vor" | "ndb" | "airport" | "faf" | "iaf" | "mahp";
  p: LatLon;
  alt?: string;
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

function approachGeometry(
  ap: Approach,
  transition: string | null,
  missed: boolean,
  g: PlanGeometry,
  from: LatLon | null,
) {
  const tr = ap.transitions.find((t) => t.name === transition);
  const seq: ProcLeg[] = [
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
  // the leg into the approach from the end of the route
  if (from && seq.length)
    g.lines.push({ kind: "route", pts: [from, seq[0].fix] });
  const app: LatLon[] = [];
  seq.forEach((l, i) => {
    if (i === 0) app.push(l.fix);
    else app.push(...legPath(seq[i - 1].fix, l).slice(1));
    if (l.hold && (l.hilpt || i === 0))
      g.lines.push({
        kind: "hold",
        pts: holdPts(l.fix, l.hold.inbound, l.hold.turn, l.hold.legMin),
      });
    const kind =
      l.role === "FAF"
        ? "faf"
        : l.role === "IAF"
          ? "iaf"
          : fixKind(l.fix.ident);
    if (l.fix.kind !== "runway")
      g.points.push({
        ident: l.fix.ident,
        kind,
        p: l.fix,
        alt: l.altMin ? String(l.altMin) : undefined,
      });
  });
  if (app.length > 1) g.lines.push({ kind: "approach", pts: app });
  // other transitions, faint, so the pilot sees the options
  for (const t of ap.transitions) {
    if (t === tr || !t.legs.length) continue;
    const pts: LatLon[] = [t.legs[0].fix];
    t.legs.forEach((l, i) => {
      if (i) pts.push(...legPath(t.legs[i - 1].fix, l).slice(1));
    });
    const join = ap.final[0]?.fix;
    if (join && pts[pts.length - 1] !== join) pts.push(join);
    g.lines.push({ kind: "transition", pts });
    g.points.push({
      ident: t.legs[0].fix.ident,
      kind: t.legs[0].role === "IAF" ? "iaf" : fixKind(t.legs[0].fix.ident),
      p: t.legs[0].fix,
    });
  }
  const map = ap.final[ap.final.length - 1]?.fix;
  if (map && ap.missed.length) {
    const pts: LatLon[] = [map];
    ap.missed.forEach((l, i) => {
      if (i || l.fix.ident !== (map as { ident?: string }).ident)
        pts.push(...legPath(pts[pts.length - 1], l).slice(1));
    });
    g.lines.push({ kind: "missed", pts });
    const m = ap.missed[ap.missed.length - 1];
    if (m.hold)
      g.lines.push({
        kind: missed ? "hold" : "missed",
        pts: holdPts(m.fix, m.hold.inbound, m.hold.turn, m.hold.legMin),
      });
    if (m.fix.kind !== "runway")
      g.points.push({
        ident: m.fix.ident,
        kind: "mahp",
        p: m.fix,
        alt: m.altMin ? String(m.altMin) : undefined,
      });
    g.bounds.push(...pts);
  }
  g.bounds.push(...app);
}

export function planGeometry(c: Circuit): PlanGeometry {
  const g: PlanGeometry = { lines: [], points: [], bounds: [] };
  let cur: LatLon | null = null;
  try {
    if (c.start.type === "runway") {
      const st0 = c.start;
      const a = AIRPORTS.find((x) => x.icao === st0.airport);
      const rw = a?.runways.find(
        (r) => r.id === (c.start as { runway: string }).runway,
      );
      if (rw) {
        cur = rw.end;
        g.points.push({
          ident: `${a!.icao} ${rw.id}`,
          kind: "start",
          p: rw.threshold,
        });
        g.bounds.push(rw.threshold, rw.end);
      }
    } else {
      const f = findFix(c.start.fix);
      if (f) {
        cur = destination(f, c.start.bearing, c.start.distNm);
        g.points.push({ ident: "START", kind: "start", p: cur });
        g.bounds.push(cur);
      }
    }
    let route: LatLon[] = cur ? [cur] : [];
    const flushRoute = () => {
      if (route.length > 1) g.lines.push({ kind: "route", pts: route });
      route = cur ? [cur] : [];
    };
    for (const l of c.legs) {
      if (l.type === "fix" || l.type === "hold") {
        const f = findFix(l.ident);
        if (!f) continue;
        route.push(f);
        cur = f;
        g.bounds.push(f);
        if (!g.points.some((p) => p.ident === f.ident))
          g.points.push({
            ident: f.ident,
            kind: fixKind(f.ident),
            p: f,
            alt:
              l.type === "fix" && l.alt
                ? String(l.alt)
                : l.type === "hold"
                  ? String(l.alt)
                  : undefined,
          });
        if (l.type === "hold") {
          const pts = holdPts(f, l.inbound, l.turn, l.legMin);
          g.lines.push({ kind: "hold", pts });
          g.bounds.push(...pts);
        }
      } else if (l.type === "approach") {
        flushRoute();
        let ap: Approach;
        try {
          ap = getApproach(l.approachId);
        } catch {
          continue;
        }
        approachGeometry(ap, l.transition, l.outcome === "missed", g, cur);
        cur = ap.final[ap.final.length - 1]?.fix ?? cur;
        route = [];
      }
    }
    flushRoute();
  } catch {
    /* a plan referring to data that is not loaded: draw what resolved */
  }
  return g;
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
  topo: { name: 'Topo', url: (z: string, x: string, y: string) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${y}/${x}`, attr: 'Tiles © Esri — Esri, HERE, Garmin, USGS, NGA, EPA, NPS' },
  light: { name: 'Light', url: (z: string, x: string, y: string) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/${z}/${y}/${x}`, attr: 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors' },
} as const;
type BaseStyle = keyof typeof BASEMAPS;
const loadStyle = (): BaseStyle => { try { const v = localStorage.getItem('ifr.map.style'); return v === 'light' ? 'light' : 'topo'; } catch { return 'topo'; } };

const COL = {
  route: "#0b63ce",
  approach: "#b0168f",
  missed: "#b0168f",
  hold: "#0b63ce",
  transition: "#b0168f",
} as const;

// ------------------------------------------------------------------ the map widget
export interface RouteMapOpts {
  /** CSS height of the widget (px) */
  height: number;
  /** show the expand button (opens the same plan full screen) */
  onExpand?: () => void;
  /** smaller labels, no legend */
  compact?: boolean;
}

export class RouteMap {
  el: HTMLElement;
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

  constructor(
    c: Circuit,
    private o: RouteMapOpts,
  ) {
    this.g = planGeometry(c);
    this.tiles = h("div", { class: "rm-tiles" });
    this.bgCanvas = h("canvas", { class: "rm-bg" }) as HTMLCanvasElement;
    this.svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.svg.setAttribute("class", "rm-svg");
    const zoom = (d: number) => {
      this.zoomAt(d, this.W / 2, this.H / 2);
    };
    this.el = h(
      "div",
      {
        class: `rm${o.compact ? " compact" : ""}${this.real ? " real" : " train"}`,
        style: `height:${o.height}px`,
      },
      this.bgCanvas,
      this.tiles,
      this.svg,
      h(
        "div",
        { class: "rm-ctl" },
        h(
          "button",
          { type: "button", title: "Zoom in", onclick: () => zoom(1) },
          "+",
        ),
        h(
          "button",
          { type: "button", title: "Zoom out", onclick: () => zoom(-1) },
          "−",
        ),
        h(
          "button",
          {
            type: "button",
            title: "Fit the flight",
            onclick: () => {
              this.fit();
              this.draw();
            },
          },
          "⤢",
        ),
        this.real
          ? h("button", { type: "button", title: "Map style: topographic / light", class: "rm-style", onclick: () => this.toggleStyle() }, "◐")
          : null,
        o.onExpand
          ? h(
              "button",
              {
                type: "button",
                title: "Full-screen map",
                class: "rm-exp",
                onclick: o.onExpand,
              },
              "⛶",
            )
          : null,
      ),
      o.compact
        ? null
        : h(
            "div",
            { class: "rm-legend" },
            h("span", {}, h("i", { class: "l-route" }), "Route"),
            h("span", {}, h("i", { class: "l-app" }), "Approach"),
            h("span", {}, h("i", { class: "l-mis" }), "Missed"),
            h("span", {}, h("i", { class: "l-hold" }), "Hold"),
          ),
      (this.attr = h("div", { class: "rm-attr" }, this.real ? BASEMAPS[this.style].attr : "Ardent Islands · training region")),
    );
    this.interact();
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.el);
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
    const r = this.el.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const changed =
      Math.round(r.width) !== this.W || Math.round(r.height) !== this.H;
    this.W = Math.round(r.width);
    this.H = Math.round(r.height);
    if (!this.fitted) this.fit();
    if (changed || !this.fitted) this.draw();
  }

  fit() {
    const pts = (
      this.g.bounds.length ? this.g.bounds : AIRPORTS.slice(0, 3)
    ).map((p) => this.geo(p));
    if (!pts.length || !this.W) return;
    const pad = 36;
    let z = 15;
    for (; z > 3; z--) {
      const xs = pts.map((p) => mx(p.lon, z)),
        ys = pts.map((p) => my(p.lat, z));
      if (
        Math.max(...xs) - Math.min(...xs) < this.W - 2 * pad &&
        Math.max(...ys) - Math.min(...ys) <
          this.H - 2 * pad - (this.o.compact ? 0 : 20)
      )
        break;
    }
    this.z = z;
    const xs = pts.map((p) => mx(p.lon, z)),
      ys = pts.map((p) => my(p.lat, z));
    this.cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    this.cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    this.fitted = true;
  }

  private zoomAt(d: number, sx: number, sy: number) {
    const nz = Math.max(4, Math.min(16, this.z + d));
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
    let drag: { x: number; y: number; cx: number; cy: number } | null = null;
    this.el.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest(".rm-ctl")) return;
      drag = { x: e.clientX, y: e.clientY, cx: this.cx, cy: this.cy };
      this.el.setPointerCapture(e.pointerId);
      this.el.classList.add("drag");
    });
    this.el.addEventListener("pointermove", (e) => {
      if (!drag) return;
      this.cx = drag.cx - (e.clientX - drag.x);
      this.cy = drag.cy - (e.clientY - drag.y);
      this.draw(true);
    });
    const end = () => {
      if (drag) {
        drag = null;
        this.el.classList.remove("drag");
        this.draw();
      }
    };
    this.el.addEventListener("pointerup", end);
    this.el.addEventListener("pointercancel", end);
    this.el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = this.el.getBoundingClientRect();
        this.zoomAt(
          e.deltaY < 0 ? 1 : -1,
          e.clientX - r.left,
          e.clientY - r.top,
        );
      },
      { passive: false },
    );
    this.el.addEventListener("dblclick", (e) => {
      const r = this.el.getBoundingClientRect();
      this.zoomAt(1, e.clientX - r.left, e.clientY - r.top);
    });
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
    const z = this.z;
    const x0 = this.cx - this.W / 2,
      y0 = this.cy - this.H / 2;
    const n = 2 ** z;
    const want = new Set<string>();
    for (
      let ty = Math.floor(y0 / TILE);
      ty <= Math.floor((y0 + this.H) / TILE);
      ty++
    )
      for (
        let tx = Math.floor(x0 / TILE);
        tx <= Math.floor((x0 + this.W) / TILE);
        tx++
      ) {
        if (ty < 0 || ty >= n) continue;
        want.add(`${z}/${((tx % n) + n) % n}/${ty}|${tx}`);
      }
    const have = new Map<string, HTMLImageElement>();
    for (const img of [...this.tiles.children] as HTMLImageElement[]) {
      if (!want.has(img.dataset.k!)) img.remove();
      else have.set(img.dataset.k!, img);
    }
    for (const k of want) {
      const [path, txs] = k.split("|");
      const [, , ty] = path.split("/").map(Number);
      const tx = Number(txs);
      let img = have.get(k);
      if (!img) {
        img = new Image(TILE, TILE);
        img.dataset.k = k;
        img.alt = "";
        img.draggable = false;
        img.decoding = "async";
        const [zz, xx, yy] = path.split('/');
        img.src = BASEMAPS[this.style].url(zz, xx, yy);
        img.onerror = () => { img!.style.visibility = 'hidden'; };
        this.tiles.append(img);
      }
      img.style.transform = `translate(${Math.round(tx * TILE - x0)}px, ${Math.round(ty * TILE - y0)}px)`;
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
    const ctx = c.getContext("2d")!;
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
        img.data[k] = 196 + (236 - 196) * m;
        img.data[k + 1] = 222 + (232 - 222) * m;
        img.data[k + 2] = 240 + (218 - 240) * m;
        img.data[k + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  }

  private drawOverlay() {
    const svg = this.svg;
    svg.setAttribute("viewBox", `0 0 ${this.W} ${this.H}`);
    svg.setAttribute("width", String(this.W));
    svg.setAttribute("height", String(this.H));
    const out: string[] = [];
    const P = (p: LatLon) => this.px(p);
    const poly = (pts: LatLon[]) =>
      pts
        .map((p) =>
          P(p)
            .map((v) => v.toFixed(1))
            .join(","),
        )
        .join(" ");
    // airports: runways
    const view = (p: LatLon) => {
      const [x, y] = P(p);
      return x > -60 && y > -60 && x < this.W + 60 && y < this.H + 60;
    };
    const rwW = Math.max(2, Math.min(7, 2 ** (this.z - 10) * 2.2));
    for (const a of AIRPORTS) {
      if (!view(a)) continue;
      for (let k = 0; k < a.runways.length; k += 2) {
        const [x1, y1] = P(a.runways[k].threshold),
          [x2, y2] = P(a.runways[k].end);
        out.push(
          `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#36404a" stroke-width="${rwW.toFixed(1)}" stroke-linecap="butt"/>`,
        );
      }
    }
    // lines: faint transitions first, then holds, missed, route, approach on top
    const order: MapLine["kind"][] = [
      "transition",
      "missed",
      "hold",
      "route",
      "approach",
    ];
    for (const kind of order)
      for (const l of this.g.lines.filter((x) => x.kind === kind)) {
        const dash =
          kind === "missed"
            ? ' stroke-dasharray="7 5"'
            : kind === "transition"
              ? ' stroke-dasharray="2 4"'
              : "";
        const wdt = kind === "transition" ? 1.4 : kind === "hold" ? 2.4 : 3;
        const op = kind === "transition" ? 0.6 : 1;
        out.push(
          `<polyline points="${poly(l.pts)}" fill="none" stroke="#fff" stroke-width="${wdt + 3}" stroke-linejoin="round" opacity="${0.75 * op}"/>`,
        );
        out.push(
          `<polyline points="${poly(l.pts)}" fill="none" stroke="${COL[kind]}" stroke-width="${wdt}" stroke-linejoin="round" stroke-linecap="round"${dash} opacity="${op}"/>`,
        );
        // direction arrows on route/approach legs long enough
        if (kind === "route" || kind === "approach")
          for (let i = 1; i < l.pts.length; i++) {
            const [ax, ay] = P(l.pts[i - 1]),
              [bx, by] = P(l.pts[i]);
            const len = Math.hypot(bx - ax, by - ay);
            if (len < 70) continue;
            const ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
            out.push(
              `<path d="M-5,-4 L4,0 L-5,4" transform="translate(${((ax + bx) / 2).toFixed(1)},${((ay + by) / 2).toFixed(1)}) rotate(${ang.toFixed(1)})" fill="none" stroke="${COL[kind]}" stroke-width="2"/>`,
            );
            const nm = distanceNm(l.pts[i - 1], l.pts[i]);
            if (!this.o.compact && len > 120 && kind === "route")
              out.push(
                `<text x="${((ax + bx) / 2).toFixed(1)}" y="${((ay + by) / 2 - 8).toFixed(1)}" class="rm-leg">${String(Math.round((bearingDeg(l.pts[i - 1], l.pts[i]) + 360) % 360) || 360).padStart(3, "0")}° ${nm.toFixed(0)} NM</text>`,
              );
          }
      }
    // points + labels with simple collision avoidance
    const boxes: [number, number, number, number][] = [];
    const free = (x: number, y: number, w: number, hh: number) =>
      !boxes.some(([a, b, c, d]) => x < c && x + w > a && y < d && y + hh > b);
    const seen = new Set<string>();
    const pts = [...this.g.points].sort((a, b) => rank(a.kind) - rank(b.kind));
    for (const p of pts) {
      if (seen.has(p.ident)) continue;
      seen.add(p.ident);
      const [x, y] = P(p.p);
      if (x < -20 || y < -20 || x > this.W + 20 || y > this.H + 20) continue;
      out.push(symbol(p.kind, x, y));
      const label = p.ident + (p.alt && !this.o.compact ? ` ${p.alt}` : "");
      const fw = this.o.compact ? 6.2 : 7;
      const w = label.length * fw + 8,
        hh = 15;
      const cands: [number, number][] = [
        [x + 8, y - 18],
        [x + 8, y + 4],
        [x - w - 8, y - 18],
        [x - w - 8, y + 4],
      ];
      const at = cands.find(([lx, ly]) => free(lx, ly, w, hh));
      if (!at) continue;
      boxes.push([at[0], at[1], at[0] + w, at[1] + hh]);
      out.push(
        `<g class="rm-lbl ${p.kind}"><rect x="${at[0].toFixed(1)}" y="${at[1].toFixed(1)}" width="${w.toFixed(1)}" height="${hh}" rx="4"/><text x="${(at[0] + 4).toFixed(1)}" y="${(at[1] + 11).toFixed(1)}">${esc(p.ident)}${p.alt && !this.o.compact ? `<tspan class="alt"> ${esc(p.alt)}</tspan>` : ""}</text></g>`,
      );
    }
    svg.innerHTML = out.join("");
  }

  private toggleStyle() {
    this.style = this.style === 'topo' ? 'light' : 'topo';
    try { localStorage.setItem('ifr.map.style', this.style); } catch { /* private mode */ }
    this.tiles.replaceChildren();
    if (this.attr) this.attr.textContent = BASEMAPS[this.style].attr;
    this.draw();
  }

  destroy() {
    this.ro?.disconnect();
  }
}

const rank = (k: MapPoint["kind"]) =>
  ({ start: 0, faf: 1, iaf: 2, mahp: 3, vor: 4, ndb: 5, airport: 6, fix: 7 })[
    k
  ];
const esc = (s: string) =>
  s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

function symbol(kind: MapPoint["kind"], x: number, y: number): string {
  const t = `translate(${x.toFixed(1)},${y.toFixed(1)})`;
  switch (kind) {
    case "start":
      return `<g transform="${t}"><circle r="7" fill="#127a52" stroke="#fff" stroke-width="2"/><path d="M-3,-3.5 L4,0 L-3,3.5 Z" fill="#fff"/></g>`;
    case "vor":
      return `<g transform="${t}"><polygon points="-6,0 -3,-5.2 3,-5.2 6,0 3,5.2 -3,5.2" fill="#fff" stroke="#0d3d73" stroke-width="1.8"/><circle r="1.6" fill="#0d3d73"/></g>`;
    case "ndb":
      return `<g transform="${t}"><circle r="6" fill="#fff" stroke="#7a2e8c" stroke-width="1.6" stroke-dasharray="1.6 1.4"/><circle r="2" fill="#7a2e8c"/></g>`;
    case "airport":
      return `<g transform="${t}"><circle r="5.5" fill="#fff" stroke="#36404a" stroke-width="1.8"/></g>`;
    case "faf":
      return `<g transform="${t}"><path d="M0,-7 L7,0 L0,7 L-7,0 Z" fill="#b0168f" stroke="#fff" stroke-width="1.6"/><path d="M-6,-6 L6,6 M-6,6 L6,-6" stroke="#fff" stroke-width="1.2"/></g>`;
    case "iaf":
    case "mahp":
      return `<g transform="${t}"><path d="M0,-6.5 L6,4.5 L-6,4.5 Z" fill="${kind === "mahp" ? "#fff" : "#b0168f"}" stroke="${kind === "mahp" ? "#b0168f" : "#fff"}" stroke-width="1.6"/></g>`;
    default:
      return `<g transform="${t}"><path d="M0,-5.5 L5,3.8 L-5,3.8 Z" fill="#fff" stroke="#1d2833" stroke-width="1.6"/></g>`;
  }
}
