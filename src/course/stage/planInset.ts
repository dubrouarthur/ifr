// Ground school stage — the plan inset: a small north-up map of the station, the selected course line, the
// radial the aircraft is on, the aircraft and its recent track, and a hold with its entry sectors (the sector the
// aircraft is in lights up as it moves). With the `dragAircraft` control the student drags the aircraft; the host
// re-poses the stage Sim and every needle, flag, DME and RMI reacts (SPEC §4.3).
// Entry sectors are derived from holdEntry() (nav/holding.ts, AIM FIG 5-3-8): never from a local table.
import type { Sim } from "../../sim/sim";
import { NAVAIDS, findFix } from "../../nav/data";
import {
  bearingDeg,
  destination,
  distanceNm,
  norm360,
  toLocal,
  wrap180,
  DEG,
  type LatLon,
} from "../../nav/geo";
import {
  holdEntry,
  racetrack,
  type HoldEntry,
  type Turn,
} from "../../nav/holding";
import type { Lang } from "../types";
import { t } from "./strings";

const SVG = "http://www.w3.org/2000/svg";
const el = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | undefined>,
  ...kids: (SVGElement | string)[]
): SVGElementTagNameMap[K] => {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs))
    if (v !== undefined) e.setAttribute(k, String(v));
  for (const c of kids)
    e.append(typeof c === "string" ? document.createTextNode(c) : c);
  return e;
};
const pad3 = (n: number) =>
  String(Math.round(norm360(n)) || 360).padStart(3, "0");

// ------------------------------------------------------------------ pure geometry
export interface PlanHold {
  fix: LatLon & { ident: string };
  inbound: number;
  turn: Turn;
  legMin?: number;
}
/** A hold from a diagram spec's fix ident (null when the fix is not in the loaded nav data). */
export function planHold(
  fix: string,
  inbound: number,
  turn: Turn,
  legMin = 1,
): PlanHold | null {
  const f = findFix(fix) ?? NAVAIDS.find((n) => n.ident === fix.toUpperCase());
  if (!f) return null;
  return {
    fix: { lat: f.lat, lon: f.lon, ident: f.ident },
    inbound,
    turn,
    legMin,
  };
}

export interface EntrySector {
  entry: HoldEntry;
  /** bearings FROM the fix (where the aircraft is), clockwise from `from` to `to` */
  from: number;
  to: number;
}
/**
 * The three entry sectors as areas around the fix (an aircraft at bearing b from the fix flies course b + 180 to
 * it), built by sampling holdEntry() every degree, so the boundaries are exactly the AIM's.
 */
export function entrySectors(inbound: number, turn: Turn): EntrySector[] {
  const at = (b: number) => holdEntry(inbound, turn, norm360(b + 180));
  // start on a boundary so each sector is one contiguous run
  let start = 0;
  for (let b = 0; b < 360; b++)
    if (at(b) !== at(b - 1)) {
      start = b;
      break;
    }
  const out: EntrySector[] = [];
  let cur = at(start);
  let from = start;
  for (let k = 1; k <= 360; k++) {
    const b = start + k;
    const e = at(b);
    if (e !== cur || k === 360) {
      out.push({ entry: cur, from: norm360(from), to: norm360(b) });
      cur = e;
      from = b;
    }
  }
  return out;
}
/** The sector the aircraft is in (holdEntry for its course to the fix). */
export function entryFor(hold: PlanHold, pos: LatLon): HoldEntry {
  return holdEntry(hold.inbound, hold.turn, bearingDeg(pos, hold.fix));
}

/** A round map range that shows `d` NM from the centre with a margin: 2, 3, 4, 6, 8, 10, 12, 15, 20, 25, 30, 40, 60. */
export function niceRange(d: number): number {
  const steps = [2, 3, 4, 6, 8, 10, 12, 15, 20, 25, 30, 40, 60, 80, 120];
  const need = Math.max(1.5, d * 1.25);
  return steps.find((s) => s >= need) ?? steps[steps.length - 1];
}

export interface PlanProjection {
  center: LatLon;
  /** NM from the centre to the nearest edge */
  rangeNm: number;
  w: number;
  h: number;
}
export function project(pr: PlanProjection, p: LatLon): [number, number] {
  const l = toLocal(pr.center, p);
  const k = Math.min(pr.w, pr.h) / 2 / pr.rangeNm;
  return [pr.w / 2 + l.x * k, pr.h / 2 - l.y * k];
}
export function unproject(pr: PlanProjection, x: number, y: number): LatLon {
  const k = Math.min(pr.w, pr.h) / 2 / pr.rangeNm;
  const nx = (x - pr.w / 2) / k;
  const ny = -(y - pr.h / 2) / k;
  const lat = pr.center.lat + ny / 60;
  return {
    lat,
    lon: pr.center.lon + nx / (60 * Math.cos(pr.center.lat * DEG)),
  };
}

export interface PlanModel {
  aircraft: { lat: number; lon: number; hdg: number };
  station: { ident: string; lat: number; lon: number; type: string } | null;
  /** the selected course (CDI) and the source colour */
  course: number | null;
  source: "NAV" | "GPS" | "ADF" | null;
  toFrom: "TO" | "FROM" | "OFF" | null;
  /** radial the aircraft is on (FROM the station) */
  radial: number | null;
  hold: PlanHold | null;
  trail: LatLon[];
}
/** What the inset shows, read from the Sim. */
export function planModel(
  sim: Sim,
  hold: PlanHold | null,
  trail: LatLon[] = [],
): PlanModel {
  const s = sim.ac.s;
  const n = sim.navInputs();
  let station: PlanModel["station"] = null;
  let radial: number | null = null;
  let source: PlanModel["source"] = null;
  let toFrom: PlanModel["toFrom"] = null;
  if (n.cdi !== "GPS" && n.nav.valid) {
    const nav = NAVAIDS.find((x) => x.ident === n.nav.ident);
    if (nav)
      station = {
        ident: nav.ident,
        lat: nav.lat,
        lon: nav.lon,
        type: nav.type,
      };
    radial = n.nav.radial;
    source = "NAV";
    toFrom = n.nav.toFrom;
  } else if (n.cdi === "GPS" && n.gps.valid) {
    source = "GPS";
    const wp = sim.fp.wpts?.[sim.fp.active];
    if (wp)
      station = { ident: wp.ident, lat: wp.lat, lon: wp.lon, type: "FIX" };
  } else if (sim.adf.valid) {
    const nav = NAVAIDS.find((x) => x.ident === sim.adf.ident);
    if (nav)
      station = {
        ident: nav.ident,
        lat: nav.lat,
        lon: nav.lon,
        type: nav.type,
      };
    source = "ADF";
  }
  if (hold && !station)
    station = {
      ident: hold.fix.ident,
      lat: hold.fix.lat,
      lon: hold.fix.lon,
      type: "FIX",
    };
  return {
    aircraft: { lat: s.lat, lon: s.lon, hdg: sim.ac.data.hdgTrue },
    station,
    course: source === "ADF" ? null : sim.course(),
    source,
    toFrom,
    radial,
    hold,
    trail,
  };
}
/** Centre and range that show the station (or hold fix) and the aircraft. */
export function planFraming(m: PlanModel): { center: LatLon; rangeNm: number } {
  const ref = m.hold?.fix ?? m.station;
  const a = m.aircraft;
  if (!ref) return { center: { lat: a.lat, lon: a.lon }, rangeNm: 4 };
  const d = distanceNm(ref, a);
  // keep the reference near the centre so the course line reads; aircraft inside the frame
  const center =
    d > 0.1
      ? destination(ref, bearingDeg(ref, a), d * 0.45)
      : { lat: ref.lat, lon: ref.lon };
  const legNm = m.hold ? 3.5 : 0;
  return { center, rangeNm: niceRange(Math.max(d * 0.62, legNm, 2)) };
}

// ------------------------------------------------------------------ the inset
export interface PlanInsetOptions {
  lang?: Lang;
  /** the student dragged the aircraft to `p` (the host re-poses the Sim) */
  onDrag?: (p: LatLon, phase: "move" | "end") => void;
}
export class PlanInset {
  readonly el: HTMLDivElement;
  private svg: SVGSVGElement;
  private head: HTMLDivElement;
  private titleL: HTMLSpanElement;
  private titleR: HTMLSpanElement;
  private chip: HTMLDivElement;
  private lang: Lang;
  private model: PlanModel | null = null;
  private frame: { center: LatLon; rangeNm: number } | null = null;
  private draggable = false;
  private dragging = false;
  private readonly W = 240;
  private readonly H = 168;
  private onDrag?: PlanInsetOptions["onDrag"];
  constructor(o: PlanInsetOptions = {}) {
    this.lang = o.lang ?? "en";
    this.onDrag = o.onDrag;
    this.el = document.createElement("div");
    this.el.className = "cs-plan";
    this.head = document.createElement("div");
    this.head.className = "cs-plan-h";
    this.titleL = document.createElement("span");
    this.titleR = document.createElement("span");
    this.titleR.className = "r";
    this.head.append(this.titleL, this.titleR);
    this.svg = el("svg", {
      viewBox: `0 0 ${this.W} ${this.H}`,
      class: "cs-plan-svg",
      role: "img",
    });
    this.chip = document.createElement("div");
    this.chip.className = "cs-plan-chip";
    this.el.append(this.head, this.svg, this.chip);
    this.svg.addEventListener("pointerdown", (e) => this.down(e));
    this.svg.addEventListener("pointermove", (e) => this.move(e));
    this.svg.addEventListener("pointerup", (e) => this.up(e));
    this.svg.addEventListener("pointercancel", (e) => this.up(e));
    this.svg.addEventListener("keydown", (e) => this.key(e));
  }
  setLang(l: Lang) {
    this.lang = l;
    if (this.model) this.render();
  }
  setDraggable(on: boolean) {
    this.draggable = on;
    this.el.classList.toggle("drag", on);
    this.svg.setAttribute("tabindex", on ? "0" : "-1");
    if (this.model) this.render();
  }
  /** New model. The framing is kept while dragging (the map must not move under the finger). */
  update(m: PlanModel, reframe = false) {
    this.model = m;
    if (!this.frame || reframe || (!this.dragging && this.outOfFrame(m)))
      this.frame = planFraming(m);
    this.render();
  }
  private outOfFrame(m: PlanModel): boolean {
    if (!this.frame) return true;
    const pr = this.proj();
    const [x, y] = project(pr, m.aircraft);
    return x < 8 || y < 8 || x > this.W - 8 || y > this.H - 8;
  }
  private proj(): PlanProjection {
    return {
      center: this.frame!.center,
      rangeNm: this.frame!.rangeNm,
      w: this.W,
      h: this.H,
    };
  }
  private toLocalPt(e: PointerEvent): [number, number] {
    const r = this.svg.getBoundingClientRect();
    return [
      ((e.clientX - r.left) / Math.max(1, r.width)) * this.W,
      ((e.clientY - r.top) / Math.max(1, r.height)) * this.H,
    ];
  }
  private down(e: PointerEvent) {
    if (!this.draggable || !this.model || !this.frame) return;
    const [x, y] = this.toLocalPt(e);
    const [ax, ay] = project(this.proj(), this.model.aircraft);
    // generous: anywhere within 30 units of the aircraft (≥ 44 CSS px on the inset sizes we use), or a tap anywhere
    // moves it there
    void ax;
    void ay;
    this.dragging = true;
    this.svg.setPointerCapture?.(e.pointerId);
    this.el.classList.add("dragging");
    this.onDrag?.(unproject(this.proj(), x, y), "move");
    e.preventDefault();
  }
  private move(e: PointerEvent) {
    if (!this.dragging) return;
    const [x, y] = this.toLocalPt(e);
    this.onDrag?.(
      unproject(
        this.proj(),
        Math.max(4, Math.min(this.W - 4, x)),
        Math.max(4, Math.min(this.H - 4, y)),
      ),
      "move",
    );
    e.preventDefault();
  }
  private up(e: PointerEvent) {
    if (!this.dragging) return;
    this.dragging = false;
    this.el.classList.remove("dragging");
    const [x, y] = this.toLocalPt(e);
    this.onDrag?.(
      unproject(
        this.proj(),
        Math.max(4, Math.min(this.W - 4, x)),
        Math.max(4, Math.min(this.H - 4, y)),
      ),
      "end",
    );
  }
  private key(e: KeyboardEvent) {
    if (!this.draggable || !this.model || !this.frame) return;
    const d: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const v = d[e.key];
    if (!v) return;
    const step = e.shiftKey ? 12 : 4;
    const [x, y] = project(this.proj(), this.model.aircraft);
    this.onDrag?.(
      unproject(this.proj(), x + v[0] * step, y + v[1] * step),
      "end",
    );
    e.preventDefault();
  }
  private render() {
    const m = this.model!;
    const pr = this.proj();
    const P = (p: LatLon) => project(pr, p);
    const lang = this.lang;
    const fr = lang === "fr";
    const g = this.svg;
    g.replaceChildren();
    const navCol = m.source === "GPS" ? "#e04ad0" : "#2bd576";
    // grid: one line per NM-ish
    const defs = el("defs", {});
    const pid = `csg${Math.random().toString(36).slice(2, 7)}`;
    defs.append(
      el(
        "pattern",
        { id: pid, width: 24, height: 24, patternUnits: "userSpaceOnUse" },
        el("path", {
          d: "M24 0H0V24",
          fill: "none",
          stroke: "#17202a",
          "stroke-width": 1,
        }),
      ),
    );
    g.append(
      defs,
      el("rect", { width: this.W, height: this.H, fill: `url(#${pid})` }),
    );
    // hold: entry sectors + racetrack
    let entryNow: HoldEntry | null = null;
    if (m.hold) {
      const fx = P(m.hold.fix);
      const R = Math.max(this.W, this.H);
      entryNow = entryFor(m.hold, m.aircraft);
      for (const sec of entrySectors(m.hold.inbound, m.hold.turn)) {
        const span = norm360(sec.to - sec.from) || 360;
        const a0 = sec.from * DEG;
        const a1 = (sec.from + span) * DEG;
        const p0 = [fx[0] + Math.sin(a0) * R, fx[1] - Math.cos(a0) * R];
        const p1 = [fx[0] + Math.sin(a1) * R, fx[1] - Math.cos(a1) * R];
        const on = sec.entry === entryNow;
        g.append(
          el("path", {
            d: `M${fx[0]} ${fx[1]}L${p0[0]} ${p0[1]}A${R} ${R} 0 ${span > 180 ? 1 : 0} 1 ${p1[0]} ${p1[1]}Z`,
            class: `cs-sec${on ? " on" : ""}`,
          }),
        );
        // boundary lines
        g.append(
          el("line", {
            x1: fx[0],
            y1: fx[1],
            x2: p0[0],
            y2: p0[1],
            class: "cs-sec-b",
          }),
        );
        // sector name, a bit out from the fix
        const mid = (sec.from + span / 2) * DEG;
        const rr = Math.min(this.W, this.H) * 0.36;
        const lx = Math.max(
          30,
          Math.min(this.W - 30, fx[0] + Math.sin(mid) * rr),
        );
        const ly = Math.max(
          14,
          Math.min(this.H - 8, fx[1] - Math.cos(mid) * rr),
        );
        const name =
          sec.entry === "DIRECT"
            ? t("direct", lang)
            : sec.entry === "PARALLEL"
              ? t("parallel", lang)
              : t("teardrop", lang);
        g.append(
          el(
            "text",
            {
              x: lx,
              y: ly,
              class: `cs-sec-t${on ? " on" : ""}`,
              "text-anchor": "middle",
            },
            name,
          ),
        );
      }
      const rt = racetrack(
        {
          fix: m.hold.fix,
          inbound: m.hold.inbound,
          turn: m.hold.turn,
          legMin: m.hold.legMin ?? 1,
          altFt: 0,
        },
        90,
      );
      g.append(
        el("path", {
          d:
            rt
              .map(
                (p, i) =>
                  `${i ? "L" : "M"}${P(p)
                    .map((v) => v.toFixed(1))
                    .join(" ")}`,
              )
              .join("") + "Z",
          class: "cs-rt",
        }),
      );
    }
    // course line through the station
    if (m.station && m.course !== null) {
      const st = P(m.station);
      const far = pr.rangeNm * 3;
      const a = P(destination(m.station, m.course + 180, far));
      const b = P(destination(m.station, m.course, far));
      g.append(
        el("line", {
          x1: a[0],
          y1: a[1],
          x2: b[0],
          y2: b[1],
          stroke: navCol,
          "stroke-width": 2.4,
          opacity: 0.95,
        }),
      );
      // the radial on the aircraft's side of the station
      const onSide =
        m.toFrom === "TO" ? norm360(m.course + 180) : norm360(m.course);
      const lp = P(destination(m.station, onSide, pr.rangeNm * 0.8));
      const lx = Math.max(20, Math.min(this.W - 20, lp[0]));
      const ly = Math.max(14, Math.min(this.H - 6, lp[1] + 14));
      if (m.source === "NAV")
        g.append(
          el(
            "text",
            {
              x: lx,
              y: ly,
              class: "cs-plan-t",
              fill: navCol,
              "text-anchor": "middle",
              "font-weight": 700,
            },
            `R-${pad3(onSide)}`,
          ),
        );
      void st;
    }
    // radial the aircraft is on
    if (m.station && m.radial !== null) {
      const st = P(m.station);
      const ap = P(m.aircraft);
      if (Math.hypot(ap[0] - st[0], ap[1] - st[1]) > 12) {
        g.append(
          el("line", {
            x1: st[0],
            y1: st[1],
            x2: ap[0],
            y2: ap[1],
            stroke: "#5f6b78",
            "stroke-width": 1.2,
            "stroke-dasharray": "4 4",
          }),
        );
        const mx = (st[0] + ap[0]) / 2;
        const my = (st[1] + ap[1]) / 2;
        const ang = wrap180(m.radial - (m.course ?? m.radial));
        g.append(
          el(
            "text",
            {
              x: mx,
              y: my + (ang > 0 ? 14 : -6),
              class: "cs-plan-t",
              fill: "#8b97a4",
              "text-anchor": "middle",
            },
            `R-${pad3(m.radial)}`,
          ),
        );
      }
    }
    // trail
    if (m.trail.length > 1)
      g.append(
        el("path", {
          d: m.trail
            .map(
              (p, i) =>
                `${i ? "L" : "M"}${P(p)
                  .map((v) => v.toFixed(1))
                  .join(" ")}`,
            )
            .join(""),
          fill: "none",
          stroke: "#00e4ff",
          "stroke-width": 1.5,
          "stroke-dasharray": "3 3",
          opacity: 0.8,
        }),
      );
    // station symbol
    if (m.station) {
      const [sx, sy] = P(m.station);
      const isNdb = m.station.type === "NDB";
      const sym =
        m.station.type === "FIX" || m.hold
          ? `M${sx} ${sy - 8}L${sx + 7} ${sy + 4}L${sx - 7} ${sy + 4}Z`
          : isNdb
            ? ""
            : hexPath(sx, sy, 7);
      if (isNdb)
        g.append(
          el("circle", {
            cx: sx,
            cy: sy,
            r: 6,
            fill: "none",
            stroke: "#c8a46a",
            "stroke-width": 1.8,
          }),
        );
      else
        g.append(
          el("path", {
            d: sym,
            fill: "#0e1318",
            stroke: navCol,
            "stroke-width": 1.8,
          }),
        );
      g.append(
        el(
          "text",
          {
            x: sx + 10,
            y: sy + 16,
            class: "cs-plan-t",
            fill: navCol,
            "font-weight": 700,
          },
          m.station.ident,
        ),
      );
    }
    // aircraft
    const [ax, ay] = P(m.aircraft);
    const plane = el(
      "g",
      {
        transform: `translate(${ax.toFixed(1)} ${ay.toFixed(1)}) rotate(${m.aircraft.hdg.toFixed(1)}) scale(1.05)`,
        class: "cs-plan-ac",
      },
      el("path", {
        d: "M0 -10 C1.4 -10 1.6 -8 1.6 -6 L1.6 -2 L10 2 L10 4 L1.6 2.4 L1.2 7 L4.5 9 L4.5 10.5 L0 9.6 L-4.5 10.5 L-4.5 9 L-1.2 7 L-1.6 2.4 L-10 4 L-10 2 L-1.6 -2 L-1.6 -6 C-1.6 -8 -1.4 -10 0 -10Z",
        fill: "#f2f5f7",
      }),
    );
    if (this.draggable)
      g.append(el("circle", { cx: ax, cy: ay, r: 17, class: "cs-plan-grab" }));
    g.append(plane);
    // header + chip
    this.titleL.textContent = `${t("planTitle", lang)} · ${pr.rangeNm} NM`;
    this.titleR.textContent =
      m.course !== null && m.source !== "ADF"
        ? `${pad3(m.course)} ${m.toFrom && m.toFrom !== "OFF" ? m.toFrom : ""}`.trim()
        : "";
    this.titleR.style.color = navCol;
    if (m.hold && entryNow) {
      const name =
        entryNow === "DIRECT"
          ? t("direct", lang)
          : entryNow === "PARALLEL"
            ? t("parallel", lang)
            : t("teardrop", lang);
      this.chip.textContent = `${t("entry", lang)} · ${name}`;
      this.chip.hidden = false;
    } else if (this.draggable) {
      this.chip.textContent = t("drag", lang);
      this.chip.hidden = false;
    } else this.chip.hidden = true;
    const where = m.station
      ? `${m.radial !== null ? `R-${pad3(m.radial)} ` : ""}${distanceNm(m.station, m.aircraft).toFixed(1)} NM ${fr ? "de" : "from"} ${m.station.ident}`
      : "";
    g.setAttribute(
      "aria-label",
      `${fr ? "Vue en plan" : "Plan view"}: ${fr ? "avion" : "aircraft"} ${where}, ${fr ? "cap" : "heading"} ${pad3(m.aircraft.hdg)}${m.hold && entryNow ? `, ${t("entry", lang)} ${this.chip.textContent}` : ""}`,
    );
  }
}
function hexPath(x: number, y: number, r: number): string {
  let d = "";
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    d += `${i ? "L" : "M"}${(x + Math.cos(a) * r).toFixed(1)} ${(y + Math.sin(a) * r).toFixed(1)}`;
  }
  return d + "Z";
}
