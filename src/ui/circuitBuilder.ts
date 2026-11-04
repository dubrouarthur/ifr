// Flight builder — the one place where every flight is configured (planner and circuit builder merged), for
// students and instructors. Navigraph / SimBrief-style, map first:
//   library (templates, my flights, school presets) | the flight as an ordered list: Departure (airport, runway,
//   SID + transition) · Enroute (route string with airways, leg cards) · Arrival (STAR + transition, approach +
//   transition or vectors, missed or land) · ATC amendments in sequence · Events (failures, weather changes at a
//   time, a leg or a fix) | a large live map (click to add a fix or a hold, drag a hold to another fix) with the
//   vertical profile (altitudes, MEA, SID/STAR constraints, glidepath, minimums) below it.
// Entry points: CircuitBuilder.edit(c?) and FlightSetup.start(type?, world?) (src/ui/flightsetup.ts) open the
// same editor.
import { h, clear, store } from "./dom";
import { Modal, WX_PRESETS } from "./modals";
import { svgIcon, I } from "./icons";
import {
  PRESET_CIRCUITS,
  TEMPLATES,
  circuitStore,
  newCircuit,
  validate,
  legText,
  circuitStats,
  encodeCircuit,
  decodeCircuit,
  expandLegs,
  procFixes,
  prevFixIdent,
  routeString,
  routeToLegs,
  applyRoute,
  circuitToScenario,
  missedHold,
  type Circuit,
  type CircuitLeg,
  type CircuitFailure,
  type CircuitEvent,
  type EventTrigger,
} from "../train/circuits";
import {
  FIXES,
  APPROACHES,
  AIRPORTS,
  AIRWAYS,
  NAVAIDS,
  approach as getApproach,
  findFix,
} from "../nav/data";
import { sidsFor, starsFor, terminalProc } from "../nav/terminal";
import { airwaysAt, airwayFixes, airwayMea } from "../nav/airways";
import {
  currentRegion,
  loadRegion,
  leaveRealWorld,
  searchAirports,
  nearbyAirports,
  airportRow,
  rowDistanceNm,
  FLAG_PROC,
  FLAG_ILS,
  type IndexRow,
} from "../nav/world";
import { bearingDeg } from "../nav/geo";
import {
  FAILURE_LABELS,
  fullEquipment,
  type Equipment,
  type Failures,
  type Scenario,
} from "../sim/sim";
import type { Approach } from "../nav/types";
import type { Weather } from "../sim/environment";
import {
  defaultSetup,
  type FlightSetupState,
  type FlightType,
} from "../train/setup";
import { RouteMap, RouteProfile, planProfile } from "./routeMap";
import {
  APPROACH_RANK,
  approachInUse,
  atisText,
  runwayInUse,
  runwayWind,
} from "./atis";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const pad3 = (n: number) =>
  String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, "0");
const stop = (e: Event) => e.stopPropagation();
const safeApproach = (id: string): Approach | null => {
  try {
    return getApproach(id);
  } catch {
    return null;
  }
};
const WX0: Weather = {
  windDir: 250,
  windKt: 10,
  gustKt: 0,
  turbulence: 0.15,
  qnh: 29.92,
  oatSeaLevelC: 15,
  ceilingFt: 900,
  cloudTopFt: 7000,
  visibilitySm: 2,
};
const visTxt = (v: number) => {
  const whole = Math.floor(v + 1e-6),
    fr = v - whole;
  const f = fr > 0.7 ? "3/4" : fr > 0.4 ? "1/2" : fr > 0.1 ? "1/4" : "";
  return whole && f ? `${whole} ${f}` : whole ? String(whole) : f || "0";
};
/** one METAR-like line, e.g. 25010KT 2SM OVC009 A2992 */
export function metarLine(w: Partial<Weather>): string {
  const x = { ...WX0, ...w };
  const wind =
    x.windKt < 3
      ? "00000KT"
      : `${pad3(x.windDir)}${String(Math.round(x.windKt)).padStart(2, "0")}${x.gustKt > x.windKt + 3 ? `G${Math.round(x.gustKt)}` : ""}KT`;
  const vis = `${x.visibilitySm >= 10 ? "10" : visTxt(x.visibilitySm)}SM`;
  const sky =
    x.ceilingFt >= 15000
      ? "SKC"
      : `OVC${String(Math.round(x.ceilingFt / 100)).padStart(3, "0")}`;
  return `${wind} ${vis} ${sky} A${Math.round(x.qnh * 100)}`;
}

export const EQUIP_PRESETS: {
  name: string;
  desc: string;
  eq: Equipment;
  cockpit?: "g1000" | "steam" | "airliner";
}[] = [
  {
    name: "Fully equipped",
    desc: "GPS/WAAS, autopilot, 2 NAV, DME, ADF",
    eq: fullEquipment(),
  },
  {
    name: "Classic IFR",
    desc: "2 NAV, DME, ADF: no GPS, no autopilot",
    eq: { gps: false, ap: false, adf: true, dme: true, nav2: true },
    cockpit: "steam",
  },
  {
    name: "Basic trainer",
    desc: "1 NAV only",
    eq: { gps: false, ap: false, adf: false, dme: false, nav2: false },
    cockpit: "steam",
  },
  {
    name: "GPS, no autopilot",
    desc: "Hand-flown glass with GPS",
    eq: { gps: true, ap: false, adf: true, dme: true, nav2: true },
  },
];

// ------------------------------------------------------------------ wiring with the planner entry point
/** what "Plan a flight" (FlightSetup) gives the builder: region changes and its fly paths */
export interface PlannerHooks {
  regionChanged: () => void;
  flyGraded?: (c: Circuit, st: FlightSetupState) => void;
  flyFree?: (sc: Scenario, st: FlightSetupState) => void;
  openChart?: (id: string) => void;
}
let planner: PlannerHooks | null = null;
/** the real-world region the builder loaded, and for which airports */
let loadedFor: { frame: unknown; icaos: string[] } = { frame: null, icaos: [] };
let shared: CircuitBuilder | null = null;
export function connectPlanner(hk: PlannerHooks) {
  planner = hk;
}
/** the builder instance (one editor shared by every entry point) */
export function sharedBuilder(): CircuitBuilder | null {
  return shared;
}

/** the student's home airport (profile), else the departure of the last real-world flight */
function homeAirport(): string {
  const p = store.get<{ homeIcao?: string | null } | null>(
    "ifr.profile.v1",
    null,
  );
  if (p?.homeIcao) return p.homeIcao;
  return (
    store.get<string>("ifr.fb.lastDep", "") ||
    store.get<{ dep?: string } | null>("ifr.setup.v1", null)?.dep ||
    ""
  );
}

/** approaches of an airport grouped by runway (precision first), then the other airports of the region */
function approachGroups(
  dest: string | null,
): { group: string; opts: [string, string][] }[] {
  const rank = (a: Approach) => APPROACH_RANK[a.type] ?? 9;
  const at = APPROACHES.filter((a) => a.airport === dest);
  const rwys = [...new Set(at.map((a) => a.runway))].sort();
  const out = rwys.map((r) => ({
    group: `${dest} RWY ${r}`,
    opts: at
      .filter((a) => a.runway === r)
      .sort((x, y) => rank(x) - rank(y))
      .map((a) => [a.id, a.name] as [string, string]),
  }));
  const others = new Map<string, Approach[]>();
  for (const a of APPROACHES)
    if (a.airport !== dest)
      others.set(a.airport, [...(others.get(a.airport) ?? []), a]);
  for (const [apt, apps] of [...others.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  ))
    out.push({
      group: apt,
      opts: apps
        .sort((x, y) => x.runway.localeCompare(y.runway) || rank(x) - rank(y))
        .map((a) => [a.id, `${a.airport} ${a.name}`] as [string, string]),
    });
  return out;
}

/** published holds of the loaded region at a fix (missed-approach holds, holds-in-lieu) */
function publishedHoldAt(ident: string) {
  for (const a of APPROACHES) {
    const m = missedHold(a);
    if (m && m.ident === ident) return m;
    for (const l of [...a.final, ...a.transitions.flatMap((t) => t.legs)])
      if (l.hold && l.fix.ident === ident)
        return {
          ident,
          inbound: Math.round(l.hold.inbound) || 360,
          turn: l.hold.turn,
          legMin: l.hold.legMin || 1,
          alt: Math.max(2000, Math.ceil((l.altMin ?? 3000) / 100) * 100),
        };
  }
  return null;
}

type Section = "dep" | "enr" | "arr";

export class CircuitBuilder extends Modal {
  private c: Circuit = clone(PRESET_CIRCUITS[0]);
  private dirty = false;
  /** the preset / template / saved flight this one was copied from */
  private sourceId: string | null = null;
  /** selected leg (−1 = start, null = none) */
  private selLeg: number | null = null;
  private tab: "flight" | "options" = "flight";
  private q = "";
  private lib!: HTMLElement;
  private libList!: HTMLElement;
  private ed!: HTMLElement;
  private mapCol!: HTMLElement;
  private stats!: HTMLElement;
  private map: RouteMap | null = null;
  private prof: RouteProfile | null = null;
  private mapReal = false;
  private pop: HTMLElement | null = null;
  /** route string being typed (null = shows the plan's route) */
  private routeDraft: string | null = null;
  private routeMsg: {
    ok: boolean;
    text: string;
    items?: ReturnType<typeof routeToLegs>["items"];
  } | null = null;
  // real-world region loading
  private loading = false;
  private progress = "";
  private loadErr = "";
  private rows: Record<string, IndexRow> = {};

  constructor(
    private onFly: (c: Circuit) => void,
    private toast: (m: string, k?: "info" | "good" | "warn" | "bad") => void,
  ) {
    super("Flight builder");
    shared = this;
    this.box.classList.add("cb", "cbx", "fb");
    clear(this.body);
    this.lib = h("nav", { class: "cbx-lib", "aria-label": "Flight library" });
    this.ed = h("section", { class: "cbx-ed", "aria-label": "Flight" });
    this.mapCol = h("section", {
      class: "cbx-map",
      "aria-label": "Map and profile",
    });
    this.body.append(
      h("div", { class: "cbx-grid" }, this.lib, this.ed, this.mapCol),
    );
    this.buildLibrary();
    // the library drawer (narrow screens) closes once a flight is picked
    this.lib.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".cbx-item, .cbx-new, .fb-libclose"))
        this.box.classList.remove("lib-open");
    });
    // Escape closes the map menu / share card first, not the whole builder (focus may be outside it
    // after a click on the map): capture phase, before the shell's Escape-closes-all handler
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape" && this.pop && this.isOpen) {
          this.closePop();
          e.stopImmediatePropagation();
          e.preventDefault();
        }
      },
      true,
    );
  }

  // ---------------------------------------------------------------- entry points
  edit(c?: Circuit) {
    if (c) this.c = clone(c);
    // reopened in another region (e.g. a training preset while a real-world region is loaded):
    // start from a fresh flight in the loaded region instead of a page of errors
    else if (!this.fitsRegion(this.c)) this.c = this.freshCircuit();
    this.sourceId = null;
    if (this.c.preset) this.copyFrom(this.c);
    else this.dirty = !circuitStore.list().some((x) => x.id === this.c.id);
    this.selLeg = null;
    this.tab = "flight";
    this.routeDraft = null;
    this.routeMsg = null;
    this.open();
    this.render();
    // a real-world flight needs its region: load it now (Load & fly also does)
    if (this.c.world === "real" && this.c.dep && !this.regionOk())
      void this.ensureRegion();
  }

  /** "Plan a flight": a new flight of the given kind, real world first */
  plan(type: FlightType = "route", world: "real" | "training" = "real") {
    this.guardOpen(() => {
      const dep = world === "real" ? homeAirport() : "";
      const c = this.blank(world, dep);
      if (type === "free") c.graded = false;
      this.c = c;
      this.pendingTemplate =
        type === "approach"
          ? "t-ilsmissed"
          : type === "hold"
            ? "t-vorhold"
            : null;
      this.sourceId = null;
      this.dirty = true;
      this.selLeg = null;
      this.tab = "flight";
      this.routeDraft = null;
      this.routeMsg = null;
      this.open();
      if (world === "training" && currentRegion()) this.leaveReal();
      if (world === "training" || this.regionOk()) this.applyPendingTemplate();
      this.render();
      if (world === "real" && dep && !this.regionOk()) void this.ensureRegion();
      if (world === "real" && !dep)
        requestAnimationFrame(() =>
          this.ed.querySelector<HTMLInputElement>(".fb-apt input")?.focus(),
        );
    });
  }
  private pendingTemplate: string | null = null;
  private applyPendingTemplate() {
    if (!this.pendingTemplate) return;
    const t = TEMPLATES.find((x) => x.id === this.pendingTemplate);
    this.pendingTemplate = null;
    const c = t?.build({
      airport: this.c.dep,
      dest: this.c.dest ?? this.c.dep,
    });
    if (c)
      this.c = {
        ...c,
        graded: this.c.graded,
        world: this.c.world,
        dep: this.c.dep ?? c.dep,
        dest: c.dest ?? this.c.dest,
      };
  }

  /** an empty flight: real world from `dep`, or the training region */
  private blank(world: "real" | "training", dep: string): Circuit {
    if (world === "training") {
      const c = this.freshCircuit();
      c.world = "training";
      return c;
    }
    const c: Circuit = {
      ...newCircuit(),
      name: "New flight",
      world: "real",
      dep: dep || undefined,
      dest: undefined,
      legs: [],
      start: { type: "runway", airport: dep, runway: "", initialAlt: 3000 },
    };
    return c;
  }

  /** every fix, airport and approach of the flight exists in the loaded region */
  private fitsRegion(c: Circuit) {
    if ((c.world === "real") !== !!currentRegion()) return false;
    const st = c.start;
    if (
      st.type === "runway"
        ? !AIRPORTS.some((a) => a.icao === st.airport)
        : !findFix(st.fix)
    )
      return false;
    return c.legs.every((l, i) => this.legResolves(c, l, i));
  }
  private legResolves(c: Circuit, l: CircuitLeg, i: number) {
    if (l.type === "fix") return !!findFix(l.ident) || !l.ident;
    if (l.type === "hold") return l.ppos || !!findFix(l.ident);
    if (l.type === "approach") return !!safeApproach(l.approachId);
    if (l.type === "sid")
      return (
        c.start.type === "runway" &&
        !!terminalProc(c.start.airport, "SID", l.id)
      );
    if (l.type === "star")
      return !!terminalProc(l.airport, "STAR", l.id) && i >= 0;
    return true;
  }

  /** start editing a copy of a preset: unsaved (the button reads Save) and the preset stays highlighted */
  private copyFrom(src: Circuit) {
    this.sourceId = src.id;
    this.c = {
      ...clone(src),
      id: `c${Date.now().toString(36)}`,
      preset: false,
      name: `${src.name} (copy)`,
    };
    this.dirty = true;
  }
  private isSaved() {
    return circuitStore.list().some((x) => x.id === this.c.id);
  }

  // ---------------------------------------------------------------- real world region
  private icaos(): string[] {
    const c = this.c;
    const dep = c.start.type === "runway" ? c.start.airport || c.dep : c.dep;
    return [...new Set([dep, c.dest].filter((x): x is string => !!x))];
  }
  /** the loaded nav data has the flight's airports */
  private regionOk() {
    const ic = this.icaos();
    // procedures (SIDs, STARs, approaches) are loaded for the airports asked for, not for every airport
    // of the region: the region must have been loaded for these airports
    const fr = currentRegion();
    return (
      !!fr &&
      fr === loadedFor.frame &&
      ic.length > 0 &&
      ic.every((i) => loadedFor.icaos.includes(i) && AIRPORTS.some((a) => a.icao === i))
    );
  }
  private loadJob: Promise<boolean> | null = null;
  private ensureRegion(): Promise<boolean> {
    // a load already running may be for other airports (the departure alone): load again after it if needed
    const job: Promise<boolean> = (this.loadJob ?? Promise.resolve(true))
      .then(() => this.doEnsureRegion())
      .finally(() => {
        if (this.loadJob === job) this.loadJob = null;
      });
    this.loadJob = job;
    return job;
  }
  private async doEnsureRegion(): Promise<boolean> {
    if (this.c.world !== "real") return true;
    if (this.regionOk()) return true;
    const ic = this.icaos();
    if (!ic.length) return false;
    this.loading = true;
    this.loadErr = "";
    this.progress = "";
    this.renderEditor();
    this.renderFooter();
    if (!this.map) this.renderMapCol();
    try {
      const r = await loadRegion(ic, undefined, (pr) => {
        this.progress =
          pr.step === "index"
            ? "airport index"
            : pr.step === "navdata"
              ? "airports, navaids and waypoints"
              : pr.step === "procedures"
                ? "instrument procedures"
                : pr.step === "terrain"
                  ? `terrain ${pr.done ?? 0}/${pr.total ?? 0}`
                  : "";
        for (const el of this.box.querySelectorAll(".fb-prog-step"))
          el.textContent = this.progress;
      });
      loadedFor = { frame: currentRegion(), icaos: ic };
      this.loading = false;
      planner?.regionChanged();
      this.adaptToRegion();
      this.applyPendingTemplate();
      store.set("ifr.fb.lastDep", ic[0]);
      this.toast(
        `Real-world region loaded: ${r.airports.length} airports, ${r.approaches} approaches`,
        "good",
      );
      this.render();
      return true;
    } catch (e) {
      this.loading = false;
      this.loadErr = String((e as Error).message || e);
      this.render();
      return false;
    }
  }
  /** back to the built-in training region */
  private leaveReal() {
    if (!currentRegion()) return;
    leaveRealWorld();
    planner?.regionChanged();
  }
  /** after a region load: point the flight at data that exists — runway in use, approach at the destination */
  private adaptToRegion() {
    const c = this.c;
    const w = this.wx();
    const dep = c.start.type === "runway" ? c.start.airport || c.dep : c.dep;
    const depApt = AIRPORTS.find((a) => a.icao === dep);
    if (depApt && c.start.type === "runway") {
      if (
        !depApt.runways.some(
          (r) => r.id === (c.start as { runway: string }).runway,
        )
      )
        c.start = {
          type: "runway",
          airport: depApt.icao,
          runway: runwayInUse(depApt.icao, w).id,
          initialAlt: Math.max(
            3000,
            Math.ceil((depApt.elevFt + 2500) / 500) * 500,
          ),
        };
    } else if (depApt && c.start.type === "air" && !findFix(c.start.fix)) {
      c.start = {
        type: "runway",
        airport: depApt.icao,
        runway: runwayInUse(depApt.icao, w).id,
        initialAlt: 3000,
      };
    }
    c.legs = c.legs.filter((l, i) => this.legResolves(c, l, i));
    if (c.dest && !c.legs.some((l) => l.type === "approach")) {
      const ap = approachInUse(
        c.dest,
        w,
        (a) => (c.equipment?.gps ?? true) || a.type !== "RNAV",
      );
      if (ap)
        c.legs.push({
          type: "approach",
          approachId: ap.id,
          transition: ap.transitions[0]?.name ?? null,
          outcome: "land",
        });
    }
    if (/^New (flight|IFR circuit)$/.test(c.name) || c.name === this.lastAuto)
      c.name = this.lastAuto = this.autoName();
    this.dirty = true;
  }
  /** the last name the builder gave the flight (renamed again while the user keeps it) */
  private lastAuto = "";
  private autoName() {
    const ic = this.icaos();
    const ap = this.c.legs.find((l) => l.type === "approach") as
      | Extract<CircuitLeg, { type: "approach" }>
      | undefined;
    const a = ap ? safeApproach(ap.approachId) : null;
    if (ic.length > 1) return `${ic[0]} → ${ic[1]}${a ? ` · ${a.name}` : ""}`;
    return ic[0] ? `${ic[0]}${a ? ` ${a.name}` : " flight"}` : "New flight";
  }

  /** a new flight in the region that is loaded (training region or real world) */
  private freshCircuit(): Circuit {
    const c = newCircuit();
    c.name = "New flight";
    c.world = currentRegion() ? "real" : "training";
    const planned = this.c?.dep ?? homeAirport();
    const a =
      AIRPORTS.find(
        (x) =>
          x.icao === planned && APPROACHES.some((p) => p.airport === x.icao),
      ) ??
      AIRPORTS.find((x) => APPROACHES.some((p) => p.airport === x.icao)) ??
      AIRPORTS[0];
    if (a) {
      const rw = a.runways.length
        ? runwayInUse(a.icao, { ...WX0, ...c.weather } as Weather)
        : undefined;
      c.start = {
        type: "runway",
        airport: a.icao,
        runway: rw?.id ?? "",
        initialAlt: Math.max(3000, Math.ceil((a.elevFt + 2500) / 500) * 500),
      };
      c.dep = a.icao;
      const ap = APPROACHES.filter((p) => p.airport === a.icao).sort(
        (p, q) => APPROACH_RANK[p.type] - APPROACH_RANK[q.type],
      )[0];
      const iaf = ap?.transitions[0]?.legs[0]?.fix.ident;
      c.legs = iaf
        ? [{ type: "fix", ident: iaf, alt: c.start.initialAlt }]
        : [];
    }
    return c;
  }

  // ---------------------------------------------------------------- change plumbing
  /** structural change: rebuild the editor; a field edit only refreshes the summaries */
  private changed(structural = false) {
    this.dirty = true;
    // a name the builder gave follows the flight (airports, approach) until the user renames it
    if (this.lastAuto && this.c.name === this.lastAuto && this.c.world === "real") {
      const n = this.autoName();
      if (n !== this.c.name) {
        this.c.name = this.lastAuto = n;
        const inp = this.ed.querySelector<HTMLInputElement>(".cbx-name");
        if (inp) inp.value = n;
      }
    }
    if (structural) this.renderEditor();
    else this.refreshCards();
    this.updateMap();
    this.renderFooter();
  }
  private render() {
    this.renderLibrary();
    this.renderEditor();
    this.renderMapCol();
    this.renderFooter();
  }
  private select(i: number | null) {
    this.selLeg = i;
    this.renderEditor();
    this.map?.setHighlight(i);
    this.prof?.setHighlight(i);
    requestAnimationFrame(() =>
      this.ed
        .querySelector(".cbx-leg.on, .cbx-start.on")
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
  }
  private wx(): Weather {
    return { ...WX0, ...this.c.weather } as Weather;
  }

  // ---------------------------------------------------------------- library
  private buildLibrary() {
    const search = h("input", {
      type: "search",
      class: "cbx-search",
      placeholder: "Search flights",
      "aria-label": "Search flights",
      spellcheck: "false",
    }) as HTMLInputElement;
    search.addEventListener("input", () => {
      this.q = search.value.trim().toLowerCase();
      this.renderLibrary();
    });
    search.addEventListener("keydown", stop);
    this.libList = h("div", { class: "cbx-lib-list" });
    const file = h("input", {
      type: "file",
      accept: "application/json,.json",
      style: "display:none",
    }) as HTMLInputElement;
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const arr: Circuit[] = Array.isArray(data) ? data : [data];
        let n = 0;
        arr.forEach((c) => {
          if (c && Array.isArray(c.legs) && c.start) {
            circuitStore.save({
              ...c,
              id: c.id || `c${Date.now().toString(36)}${n}`,
            });
            n++;
          }
        });
        this.toast(
          n
            ? `Imported ${n} flight${n === 1 ? "" : "s"}`
            : "No flight in this file",
          n ? "good" : "warn",
        );
        this.renderLibrary();
      } catch {
        this.toast("Not a valid flight file", "bad");
      }
      file.value = "";
    });
    this.lib.append(
      h(
        "button",
        {
          class: "btn cbx-new",
          onclick: () =>
            this.guard(() => {
              const real = !!currentRegion() || this.c.world === "real";
              this.c = this.blank(
                real ? "real" : "training",
                real ? (this.c.dep ?? homeAirport()) : "",
              );
              if (real && this.regionOk()) this.adaptToRegion();
              this.sourceId = null;
              this.dirty = true;
              this.selLeg = null;
              this.tab = "flight";
              this.routeDraft = null;
              this.routeMsg = null;
              this.render();
              if (real && this.c.dep && !this.regionOk())
                void this.ensureRegion();
            }),
        },
        "+ New flight",
      ),
      search,
      this.libList,
      h(
        "div",
        { class: "cbx-lib-foot" },
        file,
        h(
          "button",
          {
            class: "btn ghost sm",
            title: "Import flights from a JSON file",
            onclick: () => file.click(),
          },
          "Import…",
        ),
        h(
          "button",
          {
            class: "btn ghost sm",
            title: "Download all your flights as JSON",
            onclick: () =>
              this.download(circuitStore.list(), "ifr-flights.json"),
          },
          "Export all",
        ),
      ),
    );
  }

  /** confirm before throwing away unsaved edits of a saved flight */
  private guard(go: () => void) {
    if (
      this.dirty &&
      this.isSaved() &&
      !confirm(`Discard the unsaved changes to “${this.c.name}”?`)
    )
      return;
    go();
  }
  private guardOpen(go: () => void) {
    if (this.isOpen) this.guard(go);
    else go();
  }

  private libItem(c: Circuit, kind: "mine" | "preset") {
    const cur = c.id === this.c.id;
    const src = c.id === this.sourceId;
    const ap = c.legs.find((l) => l.type === "approach") as
      | Extract<CircuitLeg, { type: "approach" }>
      | undefined;
    const where = c.start.type === "runway" ? c.start.airport : c.start.fix;
    const dest =
      c.dest ?? (ap ? (safeApproach(ap.approachId)?.airport ?? "") : "");
    return h(
      "button",
      {
        class: `cbx-item${cur ? " on" : ""}${src ? " src" : ""}`,
        title: c.description || c.name,
        onclick: () =>
          this.guard(() => {
            if (kind === "preset") {
              if (currentRegion()) this.leaveReal();
              this.copyFrom(c);
            } else {
              this.c = clone(c);
              this.sourceId = null;
              this.dirty = false;
            }
            this.selLeg = null;
            this.routeDraft = null;
            this.routeMsg = null;
            if (this.c.world !== "real" && currentRegion()) this.leaveReal();
            this.render();
            if (this.c.world === "real" && !this.regionOk())
              void this.ensureRegion();
          }),
      },
      h("b", {}, c.name),
      h(
        "small",
        {},
        [
          dest && dest !== where ? `${where} → ${dest}` : where,
          `~${circuitStats(c).minutes} min`,
          c.mode === "checkride" ? "Checkride" : "",
          c.assignee ? `for ${c.assignee}` : "",
        ]
          .filter(Boolean)
          .join(" · "),
      ),
      src
        ? h("em", {}, "Editing a copy")
        : c.world === "real"
          ? h("i", { class: "cbx-tag" }, "Real world")
          : null,
    );
  }

  private renderLibrary() {
    clear(this.libList);
    const match = (s: string) => !this.q || s.toLowerCase().includes(this.q);
    const sec = (t: string, n: number) =>
      h("div", { class: "cbx-sec" }, t, h("span", {}, String(n)));
    // templates: built for the flight's airport (real world or training region)
    const tpls = TEMPLATES.filter((t) => match(`${t.name} ${t.desc}`));
    this.libList.append(sec("Templates", TEMPLATES.length));
    for (const t of tpls)
      this.libList.append(
        h(
          "button",
          {
            class: `cbx-item tpl${this.c.template === t.id && this.dirty && !this.isSaved() ? " on" : ""}`,
            title: t.desc,
            onclick: () =>
              this.guard(() => {
                const real = this.c.world === "real";
                const at = this.icaos()[0] || (real ? homeAirport() : "");
                if (real && !this.regionOk()) {
                  this.c = this.blank("real", at);
                  this.pendingTemplate = t.id;
                  this.render();
                  if (at) void this.ensureRegion();
                  else
                    this.toast(
                      "Choose the departure airport first: the template is built there",
                      "info",
                    );
                  return;
                }
                const c = t.build({
                  airport: at || undefined,
                  dest: this.c.dest ?? at ?? undefined,
                });
                if (!c) {
                  this.toast(
                    `No airport of the loaded region suits “${t.name}”`,
                    "warn",
                  );
                  return;
                }
                this.c = c;
                this.sourceId = null;
                this.dirty = true;
                this.selLeg = null;
                this.routeDraft = null;
                this.routeMsg = null;
                this.render();
              }),
          },
          h("b", {}, t.name),
          h("small", {}, t.desc),
        ),
      );
    const all = circuitStore.list();
    const mine = all.filter((c) =>
      match(`${c.name} ${c.description} ${c.assignee ?? ""}`),
    );
    this.libList.append(sec("My flights", all.length));
    if (!all.length)
      this.libList.append(
        h(
          "p",
          { class: "cbx-empty" },
          "Flights you save appear here. They stay in this browser: Export all moves them to another computer.",
        ),
      );
    else if (!mine.length)
      this.libList.append(
        h("p", { class: "cbx-empty" }, `No saved flight matches “${this.q}”.`),
      );
    mine.forEach((c) => this.libList.append(this.libItem(c, "mine")));
    const presets = PRESET_CIRCUITS.filter((c) =>
      match(`${c.name} ${c.description}`),
    );
    this.libList.append(
      sec("School presets", PRESET_CIRCUITS.length),
    );
    presets.forEach((c) => this.libList.append(this.libItem(c, "preset")));
  }

  // ---------------------------------------------------------------- field helpers
  private num(
    value: number | null,
    on: (v: number | null) => void,
    o: {
      min?: number;
      max?: number;
      step?: number;
      ph?: string;
      label?: string;
      structural?: boolean;
    } = {},
  ) {
    const i = h("input", {
      type: "number",
      value: value ?? "",
      min: o.min,
      max: o.max,
      step: o.step ?? 1,
      placeholder: o.ph ?? "",
      "aria-label": o.label,
      inputmode: "numeric",
    }) as HTMLInputElement;
    i.addEventListener("change", () => {
      on(i.value === "" ? null : Number(i.value));
      this.changed(o.structural);
    });
    i.addEventListener("keydown", stop);
    return i;
  }
  private sel<T extends string>(
    value: T,
    opts: ([T, string] | { group: string; opts: [T, string][] })[],
    on: (v: T) => void,
    structural = false,
  ) {
    const opt = ([v, l]: [T, string]) =>
      h("option", { value: v, selected: v === value }, l);
    const s = h(
      "select",
      {},
      ...opts.map((o) =>
        Array.isArray(o)
          ? opt(o)
          : o.opts.length
            ? h("optgroup", { label: o.group }, ...o.opts.map(opt))
            : null,
      ),
    ) as HTMLSelectElement;
    s.addEventListener("change", () => {
      on(s.value as T);
      this.changed(structural);
    });
    s.addEventListener("keydown", stop);
    return s;
  }
  private seg<T extends string>(
    value: T,
    opts: [T, string][],
    on: (v: T) => void,
    cls = "",
  ) {
    return h(
      "div",
      { class: `seg${cls ? " " + cls : ""}`, role: "radiogroup" },
      ...opts.map(([v, l]) =>
        h(
          "button",
          {
            type: "button",
            role: "radio",
            "aria-checked": String(v === value),
            class: v === value ? "on" : "",
            onclick: () => {
              if (v !== value) on(v);
            },
          },
          l,
        ),
      ),
    );
  }
  private fixListN = 0;
  /** fix entry with suggestions from the loaded region (works with thousands of real-world fixes) */
  private fixInput(
    value: string,
    on: (v: string) => void,
    ph = "Fix, navaid or airport",
  ) {
    const id = `cbx-fx-${++this.fixListN}`;
    const dl = h("datalist", { id });
    const i = h("input", {
      type: "text",
      class: "cbx-fix",
      value,
      list: id,
      spellcheck: "false",
      autocomplete: "off",
      placeholder: ph,
    }) as HTMLInputElement;
    const fill = () => {
      const q = i.value.trim().toUpperCase();
      clear(dl);
      const seen = new Set<string>();
      for (const f of FIXES) {
        if (
          f.kind === "runway" ||
          seen.has(f.ident) ||
          (q && !f.ident.startsWith(q))
        )
          continue;
        seen.add(f.ident);
        dl.append(
          h(
            "option",
            { value: f.ident },
            f.kind === "vor"
              ? "VOR"
              : f.kind === "ndb"
                ? "NDB"
                : f.kind === "airport"
                  ? "Airport"
                  : "Fix",
          ),
        );
        if (seen.size >= 40) break;
      }
    };
    i.addEventListener("focus", fill);
    i.addEventListener("input", fill);
    i.addEventListener("keydown", (e) => {
      stop(e);
      if (e.key === "Enter") i.blur();
    });
    i.addEventListener("change", () => {
      i.value = i.value.trim().toUpperCase();
      on(i.value);
      i.classList.toggle("bad", !findFix(i.value));
      this.changed();
    });
    if (value && !findFix(value)) i.classList.add("bad");
    return h("span", { class: "cbx-fixwrap" }, i, dl);
  }
  private field(label: string, ...els: (HTMLElement | string | null)[]) {
    return h("label", { class: "cb-f" }, h("span", {}, label), ...els);
  }
  private iconBtn(icon: string, title: string, on: () => void, cls = "") {
    return h(
      "button",
      {
        type: "button",
        class: `cbx-ib${cls ? " " + cls : ""}`,
        title,
        "aria-label": title,
        onclick: (e: Event) => {
          e.stopPropagation();
          on();
        },
      },
      icon.length === 1 ? h("span", { class: "g" }, icon) : svgIcon(icon, 15),
    );
  }

  /** airport search (real-world index): typing only searches; Enter or a click picks the highlighted row */
  private airportPicker(
    label: string,
    ph: string,
    on: (r: IndexRow) => void,
    suggest: () => Promise<IndexRow[]>,
    suggestTitle: string,
    from?: IndexRow,
  ) {
    const wrap = h("div", { class: "ap-pick fb-apt" });
    const inp = h("input", {
      type: "text",
      placeholder: ph,
      spellcheck: "false",
      autocomplete: "off",
      "aria-label": label,
      role: "combobox",
      "aria-autocomplete": "list",
    }) as HTMLInputElement;
    const res = h("div", { class: "ap-res", role: "listbox" });
    let seq = 0,
      hi = 0,
      shown: IndexRow[] = [],
      title = "";
    const paint = () => {
      clear(res);
      if (!shown.length) {
        if (inp.value.trim().length >= 2)
          res.append(
            h(
              "div",
              { class: "ap-none" },
              `No airport matches “${inp.value.trim()}”`,
            ),
          );
        return;
      }
      if (title) res.append(h("div", { class: "ap-res-t" }, title));
      shown.forEach((r, i) =>
        res.append(
          h(
            "button",
            {
              type: "button",
              role: "option",
              "aria-selected": String(i === hi),
              class: i === hi ? "hi" : "",
              onmousedown: (e: Event) => {
                e.preventDefault();
                commit(r);
              },
            },
            h("b", {}, r[0]),
            h(
              "span",
              {},
              h("i", {}, r[1]),
              h(
                "small",
                {},
                [
                  r[2],
                  r[3],
                  from && from[0] !== r[0]
                    ? `${Math.round(rowDistanceNm(from, r))} NM`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · "),
              ),
            ),
            r[7] & FLAG_PROC
              ? h("em", { class: "ok" }, r[7] & FLAG_ILS ? "ILS · RNAV" : "IAP")
              : h("em", {}, "GPS app."),
          ),
        ),
      );
    };
    let shownQ = "";
    const run = async () => {
      const my = ++seq;
      const q = inp.value.trim();
      const rows = q ? await searchAirports(q, 8) : await suggest();
      if (my !== seq) return;
      shown = rows;
      shownQ = q;
      hi = 0;
      title = q ? "" : suggestTitle;
      paint();
    };
    const commit = (r: IndexRow) => {
      seq++;
      clear(res);
      shown = [];
      inp.value = "";
      this.rows[r[0]] = r;
      on(r);
    };
    let tmr = 0;
    inp.addEventListener("input", () => {
      clearTimeout(tmr);
      tmr = window.setTimeout(run, 90);
    });
    inp.addEventListener("focus", () => void run());
    inp.addEventListener("blur", () =>
      setTimeout(() => {
        seq++;
        clear(res);
      }, 150),
    );
    inp.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (shown.length) {
          hi =
            (hi + (e.key === "ArrowDown" ? 1 : shown.length - 1)) %
            shown.length;
          paint();
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        // typed faster than the search: search what is typed now and take its best match
        const q = inp.value.trim();
        if (q && q !== shownQ) {
          clearTimeout(tmr);
          void searchAirports(q, 8).then((rows) => {
            // still the same text in the same box: the user did not type on or move on meanwhile
            if (rows[0] && inp.isConnected && inp.value.trim() === q) commit(rows[0]);
          });
        } else if (shown[hi]) commit(shown[hi]);
      } else if (e.key === "Escape") {
        inp.value = "";
        seq++;
        clear(res);
      }
    });
    wrap.append(inp, res);
    return wrap;
  }
  private aptName(icao: string): string {
    return (
      AIRPORTS.find((a) => a.icao === icao)?.name ?? this.rows[icao]?.[1] ?? ""
    );
  }
  private async rowFor(icao: string) {
    if (!this.rows[icao]) {
      const r = await airportRow(icao);
      if (r) this.rows[icao] = r;
    }
    return this.rows[icao];
  }

  // ---------------------------------------------------------------- validation per leg
  private problems() {
    const all = validate(this.c);
    const legs = new Map<number, string[]>();
    const start: string[] = [];
    const events: string[] = [];
    const general: string[] = [];
    for (const e of all) {
      const m = /^Leg (\d+): (.*)$/.exec(e);
      if (m)
        legs.set(Number(m[1]) - 1, [
          ...(legs.get(Number(m[1]) - 1) ?? []),
          m[2].replace(/^./, (x) => x.toUpperCase()),
        ]);
      else if (/start fix|runway/i.test(e)) start.push(e);
      else if (/^(Failure|Weather)/.test(e)) events.push(e);
      else
        general.push(
          e === "Add at least one leg."
            ? "Add a fix, a route or an approach."
            : e,
        );
    }
    if (this.c.world === "real" && !this.icaos().length)
      general.unshift("Choose the departure airport.");
    return {
      all: [
        ...(this.c.world === "real" && !this.icaos().length
          ? ["Choose the departure airport."]
          : []),
        ...all,
      ],
      legs,
      start,
      events,
      general,
    };
  }

  // ---------------------------------------------------------------- editor
  private cardRefresh: (() => void)[] = [];
  private refreshCards() {
    for (const f of this.cardRefresh) f();
    this.markLowLegs();
  }

  private renderEditor() {
    const keepScroll = this.ed.querySelector(".cbx-scroll")?.scrollTop ?? 0;
    clear(this.ed);
    this.cardRefresh = [];
    const c = this.c;
    const name = h("input", {
      type: "text",
      value: c.name,
      class: "cbx-name",
      placeholder: "Name this flight",
      "aria-label": "Flight name",
      spellcheck: "false",
    }) as HTMLInputElement;
    name.addEventListener("input", () => {
      c.name = name.value;
      this.dirty = true;
      this.renderFooter();
    });
    name.addEventListener("keydown", stop);
    const tabs = h(
      "div",
      { class: "cbx-tabs", role: "tablist" },
      ...(
        [
          [
            "flight",
            `Flight · ${c.legs.length} leg${c.legs.length === 1 ? "" : "s"}`,
          ],
          ["options", "Weather & options"],
        ] as const
      ).map(([k, t]) =>
        h(
          "button",
          {
            role: "tab",
            "aria-selected": String(this.tab === k),
            class: this.tab === k ? "on" : "",
            onclick: () => {
              if (this.tab === k) return;
              this.tab = k;
              this.renderEditor();
              const sc = this.ed.querySelector(".cbx-scroll");
              if (sc) sc.scrollTop = 0;
            },
          },
          t,
        ),
      ),
    );
    const scroll = h("div", { class: "cbx-scroll" });
    this.ed.append(
      h(
        "div",
        { class: "cbx-ed-h" },
        h(
          "div",
          { class: "fb-ed-top" },
          // narrow screens (tablet portrait): the library opens as a drawer
          h(
            "button",
            {
              class: "btn sm fb-libbtn",
              "aria-label": "Open the flight library",
              title: "Templates, my flights and school presets",
              onclick: () => this.box.classList.toggle("lib-open"),
            },
            svgIcon(I.records, 14),
            "Library",
          ),
          h(
            "label",
            { class: "cbx-name-w", title: "Rename" },
            name,
            svgIcon(I.feather, 15),
          ),
        ),
        tabs,
      ),
      scroll,
    );
    if (this.tab === "flight") this.buildFlight(scroll);
    else this.buildOptions(scroll);
    scroll.scrollTop = keepScroll;
  }

  private switchWorld(v: "real" | "training") {
    this.guard(() => {
      if (v === "training") {
        this.leaveReal();
        const c = this.freshCircuit();
        c.world = "training";
        this.c = c;
      } else {
        this.c = this.blank("real", homeAirport());
      }
      this.sourceId = null;
      this.dirty = true;
      this.selLeg = null;
      this.routeDraft = null;
      this.routeMsg = null;
      this.render();
      if (v === "real" && this.c.dep && !this.regionOk())
        void this.ensureRegion();
    });
  }

  /** index of the first arrival leg (STAR or approach); legs before it (after the SID) are the enroute part */
  private arrivalIndex() {
    const k = this.c.legs.findIndex(
      (l) => l.type === "star" || l.type === "approach",
    );
    return k < 0 ? this.c.legs.length : k;
  }
  private sectionOf(i: number): Section {
    const l = this.c.legs[i];
    if (l?.type === "sid") return "dep";
    return i >= this.arrivalIndex() ? "arr" : "enr";
  }

  private buildFlight(box: HTMLElement) {
    const c = this.c;
    const pr = this.problems();
    const real = c.world === "real";
    // real world: the region must be loaded before procedures can be listed
    if (
      real &&
      (this.loading ||
        this.loadErr ||
        (!this.regionOk() && this.icaos().length))
    )
      box.append(this.regionBar());
    const head = (t: string, extra?: HTMLElement | null, right?: HTMLElement) =>
      h("div", { class: "fb-sec" }, h("span", {}, t), extra ?? null, right ?? null);
    // navigation data: real world first, the training region as the labelled fallback
    const world = this.seg(
      real ? "real" : "training",
      [
        ["real", "Real world"],
        ["training", "Training region"],
      ],
      (v) => this.switchWorld(v),
      "fb-world",
    );
    world.setAttribute("aria-label", "Navigation data");

    // ---------------- departure
    const depIcao =
      c.start.type === "runway" ? c.start.airport || c.dep || "" : c.dep || "";
    box.append(
      head(
        "Departure",
        depIcao && c.start.type === "runway"
          ? h("small", {}, this.aptName(depIcao))
          : null,
        world,
      ),
    );
    // an airborne start has no departure airport to choose: its start card says where it begins
    const askDep = real && !depIcao && c.start.type === "runway";
    if (askDep) box.append(this.airportChooser("dep"));
    else {
      // the region still loading: its runways and procedures are not errors yet
      const waiting = real && !this.regionOk();
      box.append(this.startCard(waiting ? [] : pr.start));
      c.legs.forEach((l, i) => {
        if (l.type === "sid")
          box.append(this.legCard(l, i, waiting ? [] : (pr.legs.get(i) ?? [])));
      });
      if (c.start.type === "runway" && !c.legs.some((l) => l.type === "sid")) {
        const sids = sidsFor(c.start.airport, c.start.runway);
        if (sids.length)
          box.append(
            h(
              "button",
              {
                class: "fb-addproc",
                onclick: () => {
                  const p = sids.find((x) => x.enr.length) ?? sids[0];
                  c.legs.unshift({
                    type: "sid",
                    id: p.id,
                    transition: p.enr[0]?.name ?? null,
                  });
                  this.selLeg = 0;
                  this.routeDraft = null;
                  this.changed(true);
                },
              },
              svgIcon(I.depart, 15),
              h(
                "span",
                {},
                h("b", {}, "Add a SID"),
                h(
                  "small",
                  {},
                  `${sids.length} published for RWY ${c.start.runway}: ${sids
                    .slice(0, 4)
                    .map((p) => p.id)
                    .join(", ")}${sids.length > 4 ? "…" : ""}`,
                ),
              ),
            ),
          );
      }
    }

    // one question at a time: the departure, then the destination, then the rest of the flight
    if (askDep) return;
    if (real && !c.dest && !this.arrAirport()) {
      box.append(head("Arrival"));
      box.append(this.airportChooser("arr"));
      return;
    }
    // the route, procedures and events need the region's data: they appear once it is loaded
    if (real && !this.regionOk()) {
      box.append(head("Arrival"));
      if (c.dest) box.append(this.destRow());
      box.append(
        h(
          "p",
          { class: "fb-hint" },
          this.loading
            ? "The route, the SID, the STAR and the approach are filled in as soon as the region is loaded."
            : "Load the region to plan the route, the procedures and the approach.",
        ),
      );
      return;
    }

    // ---------------- enroute
    const ai = this.arrivalIndex();
    box.append(head("Enroute"));
    box.append(this.routeBox());
    let nEnr = 0;
    c.legs.forEach((l, i) => {
      if (i < ai && l.type !== "sid") {
        box.append(this.legCard(l, i, pr.legs.get(i) ?? []));
        nEnr++;
      }
    });
    if (!nEnr)
      box.append(
        h(
          "p",
          { class: "fb-hint" },
          c.start.type === "air"
            ? "Direct from the start to the arrival. Type a route above, click a fix on the map, or add a leg."
            : "Direct from the departure to the arrival. Type a route above, click a fix on the map, or add a leg.",
        ),
      );
    box.append(this.addBar("enr"));

    // ---------------- arrival
    box.append(
      head(
        "Arrival",
        c.dest && !real ? h("small", {}, `${c.dest} ${this.aptName(c.dest)}`) : null,
      ),
    );
    if (real && !c.dest && depIcao) box.append(this.airportChooser("arr"));
    else if (real && c.dest) box.append(this.destRow());
    const starAirport = c.dest ?? this.arrAirport();
    if (starAirport && !c.legs.some((l) => l.type === "star")) {
      const stars = starsFor(starAirport);
      if (stars.length)
        box.append(
          h(
            "button",
            {
              class: "fb-addproc",
              onclick: () => {
                const p = stars[0];
                c.legs.splice(ai, 0, {
                  type: "star",
                  airport: starAirport,
                  id: p.id,
                  transition: p.enr[0]?.name ?? null,
                });
                this.selLeg = ai;
                this.routeDraft = null;
                this.changed(true);
              },
            },
            svgIcon(I.approach, 15),
            h(
              "span",
              {},
              h("b", {}, "Add a STAR"),
              h(
                "small",
                {},
                `${stars.length} published at ${starAirport}: ${stars
                  .slice(0, 4)
                  .map((p) => p.id)
                  .join(", ")}${stars.length > 4 ? "…" : ""}`,
              ),
            ),
          ),
        );
    }
    let nArr = 0;
    c.legs.forEach((l, i) => {
      if (i >= ai) {
        box.append(this.legCard(l, i, pr.legs.get(i) ?? []));
        nArr++;
      }
    });
    if (!nArr && (!real || c.dest))
      box.append(
        h(
          "p",
          { class: "fb-hint" },
          "No approach yet: the flight ends at the last fix. Add an approach below.",
        ),
      );
    box.append(this.addBar("arr"));
    this.markLowLegs();

    // ---------------- ATC amendments + events
    box.append(
      head(
        "ATC & events",
        h(
          "small",
          {},
          "In-flight clearances, failures, weather",
        ),
      ),
    );
    box.append(this.atcBar());
    box.append(this.eventsList(pr.events));
  }

  /** airport the arrival procedures refer to: the destination, else the airport of the first approach */
  private arrAirport(): string | null {
    const ap = this.c.legs.find((l) => l.type === "approach") as
      | Extract<CircuitLeg, { type: "approach" }>
      | undefined;
    return ap ? (safeApproach(ap.approachId)?.airport ?? null) : null;
  }

  private regionBar() {
    if (this.loading)
      return h(
        "div",
        { class: "fs-prog fb-prog", role: "status" },
        h("span", { class: "spin" }),
        h(
          "span",
          { class: "fb-prog-t" },
          h("b", {}, `Loading ${this.icaos().join(" and ")}`),
          h(
            "small",
            {},
            this.progress
              ? `Real-world data: ${this.progress}`
              : "Real-world data: navaids, procedures, terrain",
          ),
        ),
      );
    if (this.loadErr)
      return h(
        "div",
        { class: "fb-note bad", role: "alert" },
        svgIcon(I.warning, 14),
        h("span", {}, this.loadErr),
        h(
          "button",
          { class: "btn sm", onclick: () => void this.ensureRegion() },
          "Retry",
        ),
      );
    return h(
      "div",
      { class: "fb-note" },
      svgIcon(I.map, 14),
      h(
        "span",
        {},
        `${this.icaos().join(" and ")}: the real-world data is not loaded yet.`,
      ),
      h(
        "button",
        { class: "btn sm primary", onclick: () => void this.ensureRegion() },
        "Load region",
      ),
    );
  }

  /** departure / destination search card (real world) */
  private airportChooser(which: "dep" | "arr") {
    const c = this.c;
    const from = c.dep ? this.rows[c.dep] : undefined;
    if (which === "arr" && c.dep && !from) void this.rowFor(c.dep);
    const pick = this.airportPicker(
      which === "dep" ? "Departure airport" : "Destination airport",
      which === "dep"
        ? "Departure: ICAO, name or city (e.g. KSFO)"
        : "Destination: ICAO, name or city (e.g. KSJC)",
      (r) => {
        if (which === "dep") {
          c.dep = r[0];
          c.start = {
            type: "runway",
            airport: r[0],
            runway: "",
            initialAlt: Math.max(3000, Math.ceil((r[6] + 2500) / 500) * 500),
          };
          c.legs = c.legs.filter((l) => l.type !== "sid");
        } else {
          c.dest = r[0];
          c.legs = c.legs.filter(
            (l) =>
              l.type !== "star" &&
              !(
                l.type === "approach" &&
                safeApproach(l.approachId)?.airport !== r[0]
              ),
          );
        }
        this.routeDraft = null;
        this.dirty = true;
        if (this.regionOk()) this.adaptToRegion();
        this.render();
        if (!this.regionOk()) void this.ensureRegion();
        if (which === "dep")
          requestAnimationFrame(() =>
            this.ed.querySelector<HTMLInputElement>(".fb-apt input")?.focus(),
          );
      },
      async () => {
        if (which === "arr" && from)
          return nearbyAirports(from[4], from[5], 8, from[0]);
        return searchAirports("", 8);
      },
      which === "arr" && from
        ? `Airports near ${from[0]}`
        : "Popular IFR airports",
      from,
    );
    return h(
      "div",
      { class: "fb-apt-card" },
      h("b", {}, which === "dep" ? "Where do you depart?" : "Where to?"),
      h(
        "small",
        {},
        which === "dep"
          ? "About 6,900 airports with real runways, navaids and terrain: official FAA procedures (SIDs, STARs, approaches) in the US, generated RNAV (GPS) approaches elsewhere."
          : "The destination: same airport for local training, or another one up to 400 NM away.",
      ),
      pick,
      which === "arr" && c.dep
        ? h(
            "button",
            {
              class: "linkbtn",
              onclick: () => {
                c.dest = c.dep;
                this.dirty = true;
                this.render();
                void this.ensureRegion().then(() => {
                  this.adaptToRegion();
                  this.render();
                });
              },
            },
            `Local flight: back to ${c.dep}`,
          )
        : null,
    );
  }
  private destRow() {
    const c = this.c;
    return h(
      "div",
      { class: "fb-dest" },
      h("b", {}, c.dest!),
      h("span", {}, this.aptName(c.dest!)),
      h(
        "button",
        {
          class: "linkbtn",
          onclick: () => {
            c.dest = undefined;
            this.render();
            requestAnimationFrame(() =>
              this.ed.querySelector<HTMLInputElement>(".fb-apt input")?.focus(),
            );
          },
        },
        "Change",
      ),
    );
  }

  /** the enroute route as an ICAO route string: type it, the legs follow (and the other way round) */
  private routeBox() {
    const c = this.c;
    const text = this.routeDraft ?? routeString(c);
    const inp = h(
      "textarea",
      {
        class: "fb-route-in",
        rows: 2,
        spellcheck: "false",
        "aria-label": "Route",
        placeholder: "KSFO NIITE4.GOBBS V25 SNS KSJC",
      },
      text,
    ) as HTMLTextAreaElement;
    const apply = () => {
      const t = inp.value.trim();
      if (!t) return;
      const before = clone(c.legs);
      const res = applyRoute(c, t);
      if (res.errors.length) {
        c.legs = before;
        this.routeMsg = {
          ok: false,
          text: res.errors.join(" · "),
          items: res.items,
        };
        this.routeDraft = inp.value;
        this.renderEditor();
        return;
      }
      if (
        res.dep &&
        c.start.type === "runway" &&
        res.dep !== c.start.airport &&
        AIRPORTS.some((a) => a.icao === res.dep)
      ) {
        const a = AIRPORTS.find((x) => x.icao === res.dep)!;
        c.start = {
          type: "runway",
          airport: a.icao,
          runway: runwayInUse(a.icao, this.wx()).id,
          initialAlt: c.start.initialAlt,
        };
      }
      // a cruise altitude at or above the highest MEA of the airways flown
      const mea = Math.max(0, ...expandLegs(c).map((l) => l.mea ?? 0));
      const floor = c.start.type === "runway" ? c.start.initialAlt : c.start.altFt;
      if (!c.cruise) c.cruise = Math.max(floor, Math.ceil(mea / 1000) * 1000);
      else if (mea > c.cruise) this.toast(`Cruise ${c.cruise} ft is below the ${mea} ft MEA of the route`, "warn");
      const first = c.legs.find((l) => l.type === "fix") as Extract<CircuitLeg, { type: "fix" }> | undefined;
      if (first && !first.alt && c.cruise > floor) first.alt = c.cruise;
      if (c.dest && !c.legs.some((l) => l.type === "approach")) this.adaptToRegion();
      const n = res.legs.length;
      this.routeMsg = {
        ok: true,
        text: `Route applied: ${n} leg${n === 1 ? "" : "s"}`,
        items: res.items,
      };
      this.routeDraft = null;
      this.refit = true;
      this.changed(true);
    };
    inp.addEventListener("keydown", (e) => {
      stop(e);
      if (e.key === "Enter") {
        e.preventDefault();
        apply();
      }
    });
    inp.addEventListener("input", () => {
      this.routeDraft = inp.value;
      this.routeMsg = null;
    });
    const msg = this.routeMsg;
    const chips = msg?.items?.length
      ? h(
          "div",
          { class: "fb-route-chips" },
          ...msg.items.map((it) =>
            h(
              "span",
              { class: `fb-tok ${it.kind}`, title: it.detail ?? it.kind },
              it.token,
              it.detail && it.kind !== "fix" ? h("small", {}, it.detail) : null,
            ),
          ),
        )
      : null;
    const cruise = this.num(
      c.cruise ?? null,
      (v) => (c.cruise = v ?? undefined),
      { min: 1000, max: 18000, step: 500, ph: "—", label: "Cruise altitude" },
    );
    return h(
      "div",
      { class: "fb-route" },
      h(
        "div",
        { class: "fb-route-row" },
        inp,
        h(
          "button",
          { class: "btn sm", onclick: apply, title: "Apply the route (Enter)" },
          "Apply",
        ),
      ),
      h(
        "div",
        { class: "fb-route-meta" },
        h("small", {}, "Airways, DCT, fixes, SID.TRANS, TRANS.STAR"),
        h(
          "label",
          { class: "fb-cruise" },
          h("span", {}, "Cruise"),
          cruise,
          h("span", {}, "ft"),
        ),
      ),
      msg
        ? h(
            "div",
            { class: `fb-route-msg ${msg.ok ? "ok" : "bad"}` },
            svgIcon(msg.ok ? I.check : I.warning, 13),
            msg.text,
          )
        : null,
      chips,
    );
  }

  private addAt(sec: Section) {
    const ai = this.arrivalIndex();
    const s = this.selLeg;
    if (s !== null && s >= 0 && this.sectionOf(s) === sec) return s + 1;
    return sec === "enr" ? ai : this.c.legs.length;
  }
  private insert(l: CircuitLeg, at: number) {
    this.c.legs.splice(at, 0, l);
    this.selLeg = at;
    this.routeDraft = null;
    this.changed(true);
    requestAnimationFrame(() =>
      (
        this.ed.querySelector(
          ".cbx-leg.on input, .cbx-leg.on select",
        ) as HTMLElement | null
      )?.focus(),
    );
  }
  /** the course flown at the end of the legs before index `at` (inbound course of a hold at present position) */
  private courseInto(at: number): number {
    const fx = expandLegs(this.c)
      .filter((l) => l.src < at && (l.type === "fix" || (l.type === "hold" && !l.ppos)))
      .map((l) => findFix((l as { ident: string }).ident))
      .filter((f): f is NonNullable<typeof f> => !!f);
    if (fx.length < 2) return 360;
    return Math.round(bearingDeg(fx[fx.length - 2], fx[fx.length - 1]) / 5) * 5 % 360 || 360;
  }
  /** the fix flown before index `at` */
  private refFix(at: number) {
    const c = this.c;
    for (let k = at - 1; k >= 0; k--) {
      const l = c.legs[k];
      if (
        (l.type === "fix" || l.type === "hold") &&
        l.ident &&
        l.ident !== "PPOS"
      )
        return l.ident;
    }
    return c.start.type === "air" ? c.start.fix : "";
  }
  private holdLeg(ident: string): CircuitLeg {
    const pub = ident ? publishedHoldAt(ident) : null;
    if (pub) return { type: "hold", ...pub, laps: 2 };
    const f = findFix(ident);
    const prev = prevFixIdent(this.c, this.c.legs.length);
    const pf = prev ? findFix(prev) : undefined;
    const inbound =
      f && pf && pf.ident !== f.ident
        ? Math.round(bearingDeg(pf, f) / 5) * 5 || 360
        : 360;
    return {
      type: "hold",
      ident,
      inbound,
      turn: "R",
      legMin: 1,
      alt: this.c.cruise ?? 3000,
      laps: 2,
    };
  }

  private addBar(sec: Section) {
    const c = this.c;
    const at = this.addAt(sec);
    const dest = c.dest ?? this.arrAirport();
    const best = dest ? approachInUse(dest, this.wx()) : APPROACHES[0];
    const b = (
      icon: string,
      label: string,
      on: () => void,
      dis = false,
      title = "",
    ) =>
      h(
        "button",
        { class: "btn sm", disabled: dis, title, onclick: on },
        svgIcon(icon, 15),
        label,
      );
    return h(
      "div",
      { class: "cbx-add" },
      h(
        "div",
        { class: "cbx-add-b" },
        ...(sec === "enr"
          ? [
              b(I.route, "Fix", () =>
                this.insert({ type: "fix", ident: "", alt: null }, at),
              ),
              b(
                I.map,
                "Airway",
                () => {
                  const from = prevFixIdent(c, at) ?? "";
                  const aw = airwaysAt(from)[0];
                  this.insert(
                    { type: "fix", ident: "", alt: null, via: aw ?? "" },
                    at,
                  );
                },
                !FIXES.length,
              ),
              b(I.hold, "Hold", () =>
                this.insert(this.holdLeg(this.refFix(at)), at),
              ),
            ]
          : [
              b(
                I.approach,
                "Approach",
                () => {
                  if (!best) return;
                  this.insert(
                    {
                      type: "approach",
                      approachId: best.id,
                      transition: best.transitions[0]?.name ?? null,
                      outcome: "land",
                    },
                    at,
                  );
                  // a landing must be last: an earlier landing approach becomes a missed approach
                  c.legs.forEach((l, k) => {
                    if (l.type === "approach" && k < c.legs.length - 1)
                      l.outcome = "missed";
                  });
                  this.changed(true);
                },
                !best,
                best ? "" : "No approach in the loaded region",
              ),
              b(I.hold, "Hold", () =>
                this.insert(
                  this.holdLeg(
                    this.refFix(at) ||
                      (best ? (missedHold(best)?.ident ?? "") : ""),
                  ),
                  at,
                ),
              ),
              b(I.route, "Fix", () =>
                this.insert({ type: "fix", ident: "", alt: null }, at),
              ),
            ]),
      ),
    );
  }

  /** ATC amendments, inserted after the selected leg (or before the arrival) */
  private atcBar() {
    const c = this.c;
    const at =
      this.selLeg !== null && this.selLeg >= 0
        ? this.selLeg + 1
        : this.arrivalIndex();
    const dest = c.dest ?? this.arrAirport();
    const ap = dest ? approachInUse(dest, this.wx()) : undefined;
    const items: [string, () => void][] = [
      [
        "Cleared direct",
        () =>
          this.insert(
            {
              type: "fix",
              ident: this.refFix(at + 1) || "",
              alt: null,
              atc: "direct",
            },
            at,
          ),
      ],
      [
        "Cross fix at altitude",
        () =>
          this.insert(
            {
              type: "fix",
              ident: this.refFix(at) || "",
              alt: c.cruise ?? 3000,
              atc: "cross",
            },
            at,
          ),
      ],
      [
        "Climb / descend",
        () => this.insert({ type: "alt", alt: c.cruise ?? 4000 }, at),
      ],
      [
        "Hold as published",
        () => {
          // "hold at X as published": X is the last fix flown before this point when a hold is
          // published there; else the missed approach holding fix of the flight's approach
          const flown = expandLegs(c).filter(
            (l) => l.src < at && (l.type === "fix" || (l.type === "hold" && !l.ppos)),
          );
          const last = (flown[flown.length - 1] as { ident?: string } | undefined)?.ident;
          const here = last ? publishedHoldAt(last) : null;
          if (here) return this.insert({ type: "hold", ...here, laps: 1 }, at);
          const k = c.legs.findIndex((l) => l.type === "approach");
          const apl = c.legs[k] as Extract<CircuitLeg, { type: "approach" }> | undefined;
          const ap = apl ? safeApproach(apl.approachId) : null;
          const mh = ap ? missedHold(ap) : null;
          if (apl && mh) {
            apl.outcome = "missed";
            this.toast(`Missed approach, then hold at ${mh.ident} as published`, "info");
            return this.insert({ type: "hold", ...mh, laps: 1 }, k + 1);
          }
          const fix = last || this.refFix(at);
          if (!fix) return this.toast("Add a fix first: the hold is flown over a fix", "info");
          this.toast(`No hold published at ${fix}: a standard hold on the inbound course`, "info");
          this.insert(this.holdLeg(fix), at);
        },
      ],
      [
        "Hold at present position",
        () =>
          this.insert(
            {
              type: "hold",
              ident: "PPOS",
              inbound: this.courseInto(at),
              turn: "R",
              legMin: 1,
              alt: c.cruise ?? 3000,
              laps: 1,
              ppos: true,
            },
            at,
          ),
      ],
      [
        "Vectors to final",
        () =>
          ap &&
          this.insert(
            {
              type: "approach",
              approachId: ap.id,
              transition: null,
              outcome: "land",
            },
            Math.max(at, this.arrivalIndex()),
          ),
      ],
      [
        "Change of approach",
        () => {
          const cur = c.legs.find((l) => l.type === "approach") as
            | Extract<CircuitLeg, { type: "approach" }>
            | undefined;
          const alt = APPROACHES.filter(
            (a) => a.airport === (dest ?? "") && a.id !== cur?.approachId,
          ).sort((x, y) => APPROACH_RANK[x.type] - APPROACH_RANK[y.type])[0];
          if (!alt)
            return this.toast("No other approach at the destination", "info");
          if (cur) cur.outcome = "missed";
          this.insert(
            {
              type: "approach",
              approachId: alt.id,
              transition: alt.transitions[0]?.name ?? null,
              outcome: "land",
              change: true,
            },
            c.legs.length,
          );
        },
      ],
    ];
    const where =
      this.selLeg !== null && this.selLeg >= 0
        ? `after leg ${this.selLeg + 1}`
        : "before the arrival";
    return h(
      "div",
      { class: "fb-addrow" },
      h("small", {}, `ATC instruction · inserted ${where}`),
      h(
        "div",
        { class: "fb-atc" },
        ...items.map(([t, on]) =>
          h(
            "button",
            {
              class: "fb-chip",
              onclick: on,
              title: `Insert “${t}” ${where}`,
            },
            t,
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- events
  private trigFields(t: { trigger: EventTrigger; at: number; fix?: string }) {
    const c = this.c;
    return [
      this.field(
        "When",
        this.sel(
          t.trigger,
          [
            ["time", "After a time"],
            ["leg", "At a leg"],
            ["fix", "At a fix"],
          ],
          (v) => {
            t.trigger = v;
            if (v === "leg")
              t.at = Math.min(
                Math.max(1, Math.round(t.at)),
                Math.max(1, c.legs.length),
              );
            if (v === "fix" && !t.fix) t.fix = this.refFix(c.legs.length) || "";
          },
          true,
        ),
      ),
      t.trigger === "fix"
        ? this.field(
            "Fix",
            this.fixInput(t.fix ?? "", (v) => (t.fix = v)),
          )
        : t.trigger === "time"
          ? this.field(
              "Minutes",
              this.num(t.at, (v) => (t.at = Math.max(0, v ?? 1)), {
                min: 0,
                max: 240,
                step: 0.5,
              }),
            )
          : this.field(
              "Leg",
              this.sel(
                String(t.at),
                c.legs.map(
                  (l, k) =>
                    [
                      String(k + 1),
                      `${k + 1} · ${legText(l)}`.slice(0, 48),
                    ] as [string, string],
                ),
                (v) => (t.at = Number(v)),
              ),
            ),
    ];
  }
  private eventsList(errs: string[]) {
    const c = this.c;
    const box = h("div", { class: "fb-events" });
    c.failures.forEach((f, k) => box.append(this.failureCard(f, k)));
    (c.events ?? []).forEach((w, k) => box.append(this.weatherCard(w, k)));
    for (const e of errs)
      box.append(h("div", { class: "cbx-err" }, svgIcon(I.warning, 13), e));
    box.append(
      h(
        "div",
        { class: "fb-addrow" },
        h("small", {}, "Failure or weather change"),
        h(
        "div",
        { class: "fb-atc" },
        h(
          "button",
          {
            class: "fb-chip",
            onclick: () => {
              // default: at the start of the first approach (the glideslope on the ILS), else after 5 min
              const ap = c.legs.findIndex((l) => l.type === "approach");
              c.failures.push({
                key: "gs",
                trigger: ap >= 0 ? "leg" : "time",
                at: ap >= 0 ? ap + 1 : 5,
                hidden: c.mode === "checkride",
              });
              this.changed(true);
            },
          },
          svgIcon(I.warning, 14),
          "Failure",
        ),
        h(
          "button",
          {
            class: "fb-chip",
            onclick: () => {
              (c.events ??= []).push({
                kind: "weather",
                trigger: "time",
                at: 10,
                wx: { ceilingFt: 200, visibilitySm: 0.5 },
              });
              this.changed(true);
            },
          },
          svgIcon(I.cloud, 14),
          "Weather change",
        ),
        ),
      ),
    );
    return box;
  }
  private trigText(t: { trigger: EventTrigger; at: number; fix?: string }) {
    return t.trigger === "time"
      ? `${t.at} min after the start`
      : t.trigger === "leg"
        ? `at leg ${t.at}`
        : `passing ${t.fix || "…"}`;
  }
  private failureCard(f: CircuitFailure, k: number) {
    const c = this.c;
    const hid = h("input", {
      type: "checkbox",
      checked: !!f.hidden,
    }) as HTMLInputElement;
    hid.addEventListener("change", () => {
      f.hidden = hid.checked;
      this.changed(true);
    });
    return h(
      "div",
      { class: "fb-ev fail" },
      h(
        "div",
        { class: "fb-ev-h" },
        svgIcon(I.warning, 14),
        h("b", {}, `${FAILURE_LABELS[f.key]} fails ${this.trigText(f)}`),
        f.hidden
          ? h(
              "span",
              {
                class: "fb-hidden",
                title: "Not announced in the student's briefing",
              },
              "Hidden",
            )
          : null,
        this.iconBtn(
          "×",
          "Remove this failure",
          () => {
            c.failures.splice(k, 1);
            this.changed(true);
          },
          "del show",
        ),
      ),
      h(
        "div",
        { class: "cb-row" },
        this.field(
          "Failure",
          this.sel(
            f.key,
            (Object.keys(FAILURE_LABELS) as (keyof Failures)[]).map(
              (x) => [x, FAILURE_LABELS[x]] as [keyof Failures, string],
            ),
            (v) => (f.key = v),
            true,
          ),
        ),
        ...this.trigFields(f),
      ),
      h(
        "label",
        { class: "fb-check" },
        hid,
        h("span", {}, "Hide from the student (not in the briefing)"),
      ),
    );
  }
  private weatherCard(w: CircuitEvent, k: number) {
    const c = this.c;
    const x = w.wx;
    return h(
      "div",
      { class: "fb-ev wx" },
      h(
        "div",
        { class: "fb-ev-h" },
        svgIcon(I.cloud, 14),
        h(
          "b",
          {},
          `Weather ${this.trigText(w)}: ${metarLine({ ...c.weather, ...x })}`,
        ),
        this.iconBtn(
          "×",
          "Remove this weather change",
          () => {
            c.events!.splice(k, 1);
            this.changed(true);
          },
          "del show",
        ),
      ),
      h(
        "div",
        { class: "cb-row" },
        ...this.trigFields(w),
        this.field(
          "Ceiling (ft)",
          this.num(
            x.ceilingFt ?? null,
            (v) => (v === null ? delete x.ceilingFt : (x.ceilingFt = v)),
            { min: 0, max: 20000, step: 50, ph: "same", structural: true },
          ),
        ),
        this.field(
          "Visibility (SM)",
          this.num(
            x.visibilitySm ?? null,
            (v) => (v === null ? delete x.visibilitySm : (x.visibilitySm = v)),
            { min: 0.25, max: 10, step: 0.25, ph: "same", structural: true },
          ),
        ),
        this.field(
          "Wind from (°)",
          this.num(
            x.windDir ?? null,
            (v) => (v === null ? delete x.windDir : (x.windDir = v)),
            { min: 0, max: 359, step: 10, ph: "same", structural: true },
          ),
        ),
        this.field(
          "Wind (kt)",
          this.num(
            x.windKt ?? null,
            (v) => (v === null ? delete x.windKt : (x.windKt = v)),
            { min: 0, max: 50, ph: "same", structural: true },
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- departure card
  private startCard(errs: string[]) {
    const c = this.c;
    const st = c.start;
    const on = this.selLeg === -1;
    const summary = (): [string, string] => {
      const s = this.c.start;
      if (s.type === "runway" && !s.runway && this.c.world === "real" && !this.regionOk())
        return [
          `${s.airport}`,
          this.loading
            ? "The runway in use is chosen once the region is loaded"
            : "Load the region to choose the runway",
        ];
      if (s.type === "runway") {
        const hw = runwayWind(s.airport, s.runway, this.wx());
        return [
          `${s.airport} RWY ${s.runway || "…"}`,
          `Take-off, climb to ${s.initialAlt} ft${hw ? ` · ${hw.head >= 0 ? "headwind" : "tailwind"} ${Math.abs(Math.round(hw.head))} kt` : ""}`,
        ];
      }
      return [
        `Airborne near ${s.fix}`,
        `${pad3(s.bearing)}° / ${s.distNm} NM from ${s.fix} · ${s.altFt} ft · ${s.iasKt} kt`,
      ];
    };
    const [title, sub] = summary();
    const card = h("div", {
      class: `cbx-start${on ? " on" : ""}${errs.length ? " bad" : ""}`,
    });
    const head = h(
      "div",
      {
        class: "cbx-leg-h",
        role: "button",
        tabindex: "0",
        "aria-expanded": String(on),
        onclick: () => this.select(on ? null : -1),
        onkeydown: (ev: Event) => {
          const e = ev as KeyboardEvent;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.select(on ? null : -1);
          }
          e.stopPropagation();
        },
      },
      h("span", { class: "cbx-n start" }, svgIcon(I.plane, 13)),
      h(
        "div",
        { class: "cbx-leg-t" },
        h(
          "small",
          { class: "cbx-kind" },
          st.type === "runway" ? "Take-off" : "Start in the air",
        ),
        h("b", {}, title),
        h("span", {}, sub),
      ),
      errs.length
        ? h("span", { class: "cbx-dot", title: errs.join(" ") })
        : null,
      h("span", { class: "cbx-chev" }, svgIcon(on ? I.chevUp : I.chevDown, 14)),
    );
    card.append(head);
    if (on) {
      const b = h(
        "div",
        { class: "cbx-leg-b" },
        this.seg(
          st.type,
          [
            ["runway", "On a runway"],
            ["air", "Airborne"],
          ],
          (v) => {
            if (v === "runway") {
              const a = AIRPORTS.find((x) => x.icao === c.dep) ?? AIRPORTS[0];
              c.start = {
                type: "runway",
                airport: a?.icao ?? "",
                runway: a ? runwayInUse(a.icao, this.wx()).id : "",
                initialAlt: 3000,
              };
            } else {
              c.legs = c.legs.filter((l) => l.type !== "sid");
              const ref =
                this.refFix(c.legs.length) ||
                NAVAIDS[0]?.ident ||
                FIXES[0]?.ident ||
                "";
              c.start = {
                type: "air",
                fix: ref,
                bearing: 90,
                distNm: 12,
                altFt: c.cruise ?? 3000,
                hdg: null,
                iasKt: 95,
              };
            }
            this.changed(true);
          },
        ),
      );
      if (st.type === "runway") {
        const apt = AIRPORTS.find((a) => a.icao === st.airport);
        const inUse = apt?.runways.length
          ? runwayInUse(apt.icao, this.wx()).id
          : "";
        b.append(
          h(
            "div",
            { class: "cb-row" },
            c.world === "real"
              ? this.field(
                  "Airport",
                  h(
                    "button",
                    {
                      class: "btn sm fb-change",
                      onclick: () => {
                        c.dep = undefined;
                        st.airport = "";
                        this.render();
                        requestAnimationFrame(() =>
                          this.ed
                            .querySelector<HTMLInputElement>(".fb-apt input")
                            ?.focus(),
                        );
                      },
                    },
                    `${st.airport} · Change`,
                  ),
                )
              : this.field(
                  "Airport",
                  this.sel(
                    st.airport,
                    [...AIRPORTS]
                      .sort((x, y) => x.icao.localeCompare(y.icao))
                      .map(
                        (a) =>
                          [a.icao, `${a.icao} · ${a.name}`] as [string, string],
                      ),
                    (v) => {
                      st.airport = v;
                      c.dep = v;
                      st.runway = runwayInUse(v, this.wx()).id;
                      c.legs = c.legs.filter((l) => l.type !== "sid");
                    },
                    true,
                  ),
                ),
            this.field(
              "Runway",
              this.sel(
                st.runway,
                (apt?.runways ?? []).map(
                  (r) =>
                    [
                      r.id,
                      `RWY ${r.id}${r.id === inUse ? " · in use" : ""} · ${r.lengthFt} ft`,
                    ] as [string, string],
                ),
                (v) => {
                  st.runway = v;
                  // a SID that does not serve the new runway is replaced by one that does (same name first)
                  const sid =
                    c.legs[0]?.type === "sid"
                      ? (c.legs[0] as Extract<CircuitLeg, { type: "sid" }>)
                      : null;
                  if (
                    sid &&
                    !sidsFor(st.airport, v).some((p) => p.id === sid.id)
                  ) {
                    const alt = sidsFor(st.airport, v)[0];
                    if (alt)
                      Object.assign(sid, {
                        id: alt.id,
                        transition:
                          alt.enr.find((e) => e.name === sid.transition)
                            ?.name ??
                          alt.enr[0]?.name ??
                          null,
                      });
                    else c.legs.shift();
                  }
                },
                true,
              ),
            ),
            this.field(
              "Initial climb (ft)",
              this.num(st.initialAlt, (v) => (st.initialAlt = v ?? 3000), {
                min: 1000,
                max: 18000,
                step: 100,
              }),
            ),
          ),
        );
        const hw = runwayWind(st.airport, st.runway, this.wx());
        if (hw && hw.head <= -2 && inUse && inUse !== st.runway)
          b.append(
            h(
              "div",
              { class: "fb-note warn" },
              svgIcon(I.warning, 14),
              h(
                "span",
                {},
                `Tailwind ${Math.round(-hw.head)} kt on RWY ${st.runway}: the ATIS has RWY ${inUse} in use.`,
              ),
              h(
                "button",
                {
                  class: "linkbtn",
                  onclick: () => {
                    st.runway = inUse;
                    if (
                      c.legs[0]?.type === "sid" &&
                      !sidsFor(st.airport, inUse).some(
                        (p) => p.id === (c.legs[0] as { id: string }).id,
                      )
                    )
                      c.legs.shift();
                    this.changed(true);
                  },
                },
                `Use RWY ${inUse}`,
              ),
            ),
          );
      } else {
        b.append(
          h(
            "div",
            { class: "cb-row" },
            this.field(
              "Reference fix",
              this.fixInput(st.fix, (v) => (st.fix = v)),
            ),
            this.field(
              "Bearing from fix (°)",
              this.num(
                st.bearing,
                (v) => (st.bearing = ((v ?? 0) + 360) % 360),
                { min: 0, max: 359 },
              ),
            ),
            this.field(
              "Distance (NM)",
              this.num(st.distNm, (v) => (st.distNm = Math.max(0.5, v ?? 10)), {
                min: 0.5,
                max: 60,
                step: 0.5,
              }),
            ),
            this.field(
              "Altitude (ft)",
              this.num(st.altFt, (v) => (st.altFt = v ?? 3000), {
                min: 1000,
                max: 18000,
                step: 100,
              }),
            ),
            this.field(
              "Heading (°)",
              this.num(st.hdg, (v) => (st.hdg = v), { ph: "to fix" }),
            ),
            this.field(
              "IAS (kt)",
              this.num(st.iasKt, (v) => (st.iasKt = v ?? 95), {
                min: 60,
                max: 250,
              }),
            ),
          ),
        );
      }
      card.append(b);
    }
    for (const e of errs)
      card.append(h("div", { class: "cbx-err" }, svgIcon(I.warning, 13), e));
    this.cardRefresh.push(() => {
      const [t, u] = summary();
      const tb = head.querySelector(".cbx-leg-t b"),
        ts = head.querySelector(".cbx-leg-t span");
      if (tb) tb.textContent = t;
      if (ts) ts.textContent = u;
    });
    return card;
  }

  /** non-blocking: a procedure fix planned below its published minimum, or an airway below its MEA */
  private markLowLegs() {
    this.ed.querySelectorAll(".cbx-low").forEach((x) => x.remove());
    const prof = planProfile(this.c, false);
    for (const p of prof.pts) {
      if (!p.ident || p.amin === undefined || p.alt >= p.amin - 50 || p.leg < 0 || p.seg === "missed")
        continue;
      const card = this.ed.querySelector(`.cbx-leg[data-i="${p.leg}"]`);
      if (!card || card.querySelector(`.cbx-low[data-f="${p.ident}"]`))
        continue;
      card.append(
        h(
          "div",
          { class: "cbx-low", "data-f": p.ident },
          svgIcon(I.warning, 13),
          `Planned ${Math.round(p.alt / 100) * 100} ft at ${p.ident}, below the ${p.amin} ft minimum${p.role ? ` (${p.role})` : ""}`,
        ),
      );
    }
    const flat = expandLegs(this.c);
    for (const m of prof.mea ?? []) {
      const lo = prof.pts.filter(
        (p) =>
          p.d > m.d0 + 0.05 &&
          p.d <= m.d1 + 1e-6 &&
          p.alt < m.alt - 50 &&
          p.seg === "route",
      );
      if (!lo.length) continue;
      const leg = lo[0].leg;
      const card = this.ed.querySelector(`.cbx-leg[data-i="${leg}"]`);
      if (
        !card ||
        card.querySelector(`.cbx-low[data-f="mea"]`) ||
        !flat.some((l) => l.src === leg)
      )
        continue;
      card.append(
        h(
          "div",
          { class: "cbx-low", "data-f": "mea" },
          svgIcon(I.warning, 13),
          `Planned ${Math.round(lo[0].alt / 100) * 100} ft on ${m.via}, below its ${m.alt} ft MEA`,
        ),
      );
    }
  }

  private legKind(l: CircuitLeg): string {
    switch (l.type) {
      case "fix":
        return l.atc ? "ATC" : l.via ? "Airway" : "Fix";
      case "alt":
        return "ATC";
      case "hold":
        return l.ppos ? "ATC · Hold" : "Hold";
      case "sid":
        return "SID";
      case "star":
        return "STAR";
      case "approach":
        return l.change
          ? "ATC · Approach"
          : l.transition
            ? "Approach"
            : "Approach · vectors";
    }
  }
  private procSeq(i: number) {
    const fx = procFixes(this.c, i);
    const cons = (t: { altMin?: number; altMax?: number }) =>
      t.altMin !== undefined && t.altMin === t.altMax
        ? ` ${t.altMin}`
        : t.altMin !== undefined
          ? ` ${t.altMin}+`
          : t.altMax !== undefined
            ? ` ${t.altMax}−`
            : "";
    return fx.map((t) => `${t.fix!.ident}${cons(t)}`);
  }
  private legSummary(l: CircuitLeg, i: number): [string, string] {
    switch (l.type) {
      case "fix":
        if (l.atc === "direct")
          return [
            `Cleared direct ${l.ident || "…"}`,
            l.alt ? `Maintain ${l.alt} ft` : "Keep the assigned altitude",
          ];
        if (l.atc === "cross")
          return [
            `Cross ${l.ident || "…"} at ${l.alt ?? "…"} ft`,
            "ATC crossing restriction",
          ];
        if (l.via) {
          const from = prevFixIdent(this.c, i);
          const path =
            from && l.ident ? airwayFixes(l.via, from, l.ident) : null;
          const mea = path
            ? airwayMea(
                l.via,
                path.map((f) => f.ident),
              )
            : 0;
          return [
            `${l.via || "…"} to ${l.ident || "…"}`,
            path
              ? `From ${from} · ${path.length - 1} segment${path.length > 2 ? "s" : ""}${mea ? ` · MEA ${mea}` : ""}${l.alt ? ` · ${l.alt} ft` : ""}`
              : `From ${from ?? "…"} along the airway`,
          ];
        }
        return [
          l.ident ? `Direct ${l.ident}` : "Direct: choose a fix",
          l.alt ? `Cross at ${l.alt} ft` : "Keep the assigned altitude",
        ];
      case "alt":
        return [
          `Climb / descend and maintain ${l.alt} ft`,
          "ATC altitude change",
        ];
      case "hold":
        return [
          l.ppos ? "Hold at present position" : `Hold at ${l.ident || "…"}`,
          `${pad3(l.inbound)}° inbound · ${l.turn === "R" ? "right" : "left"} turns · ${l.legMin} min · ${l.alt} ft · ×${l.laps}`,
        ];
      case "sid":
      case "star": {
        const seq = this.procSeq(i);
        return [
          `${l.id}${l.transition ? (l.type === "sid" ? `.${l.transition}` : ` from ${l.transition}`) : ""}`,
          seq.length ? seq.join(" · ") : "Not available for this runway",
        ];
      }
      case "approach": {
        const ap = safeApproach(l.approachId);
        if (!ap) return ["Approach not available", "Not in the loaded region"];
        const m = ap.minimums[0];
        return [
          `${ap.airport} ${ap.name}`,
          `${l.transition ? `Via ${l.transition}` : "Vectors to final"} · ${m ? `${m.da ? "DA" : "MDA"} ${m.da ?? m.mda} · ` : ""}${l.outcome === "land" ? "full-stop landing" : "missed approach, continue"}`,
        ];
      }
    }
  }

  private dragFrom: number | null = null;
  private legCard(l: CircuitLeg, i: number, errs: string[]): HTMLElement {
    const c = this.c;
    const on = this.selLeg === i;
    const move = (d: number) => {
      const j = i + d;
      if (j < 0 || j >= c.legs.length) return;
      [c.legs[i], c.legs[j]] = [c.legs[j], c.legs[i]];
      if (this.selLeg === i) this.selLeg = j;
      this.routeDraft = null;
      this.changed(true);
    };
    const remove = () => {
      c.legs.splice(i, 1);
      // failures at a leg keep pointing at the same leg
      for (const f of [...c.failures, ...(c.events ?? [])])
        if (f.trigger === "leg" && f.at > i + 1) f.at--;
      this.selLeg = null;
      this.routeDraft = null;
      this.changed(true);
    };
    const [title, sub] = this.legSummary(l, i);
    const failHere = c.failures.filter(
      (f) => f.trigger === "leg" && f.at === i + 1,
    );
    const atc =
      (l.type === "fix" && !!l.atc) ||
      l.type === "alt" ||
      (l.type === "hold" && !!l.ppos) ||
      (l.type === "approach" && !!l.change);
    const card = h("div", {
      class: `cbx-leg ${l.type}${atc ? " atc" : ""}${on ? " on" : ""}${errs.length ? " bad" : ""}`,
      "data-i": String(i),
    });
    const grip = h(
      "span",
      { class: "cbx-grip", title: "Drag to reorder", "aria-hidden": "true" },
      h("i"),
      h("i"),
      h("i"),
    );
    const icon =
      l.type === "fix"
        ? l.via
          ? I.map
          : l.atc
            ? I.direct
            : I.route
        : l.type === "alt"
          ? I.depart
          : l.type === "hold"
            ? I.hold
            : l.type === "sid"
              ? I.depart
              : I.approach;
    const head = h(
      "div",
      {
        class: "cbx-leg-h",
        role: "button",
        tabindex: "0",
        "aria-expanded": String(on),
        "aria-label": `Leg ${i + 1}: ${title}`,
        onclick: () => this.select(on ? null : i),
        onkeydown: (ev: Event) => {
          const e = ev as KeyboardEvent;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            this.select(on ? null : i);
          } else if (
            e.altKey &&
            (e.key === "ArrowUp" || e.key === "ArrowDown")
          ) {
            e.preventDefault();
            move(e.key === "ArrowUp" ? -1 : 1);
            requestAnimationFrame(() =>
              (
                this.ed.querySelector(
                  `.cbx-leg[data-i="${this.selLeg ?? i}"] .cbx-leg-h`,
                ) as HTMLElement | null
              )?.focus(),
            );
          } else if (e.key === "Delete") {
            e.preventDefault();
            remove();
          }
          e.stopPropagation();
        },
      },
      grip,
      h("span", { class: "cbx-n" }, String(i + 1)),
      h("span", { class: "cbx-ic" }, svgIcon(icon, 16)),
      h(
        "div",
        { class: "cbx-leg-t" },
        h("small", { class: "cbx-kind" }, this.legKind(l)),
        h("b", {}, title),
        h("span", {}, sub),
      ),
      failHere.length
        ? h(
            "span",
            {
              class: "cbx-fail",
              title: failHere
                .map(
                  (f) =>
                    `${FAILURE_LABELS[f.key]} fails at the start of this leg${f.hidden ? " (hidden from the student)" : ""}`,
                )
                .join("\n"),
            },
            svgIcon(I.warning, 13),
            FAILURE_LABELS[failHere[0].key],
          )
        : null,
      errs.length
        ? h("span", { class: "cbx-dot", title: errs.join(" ") })
        : null,
      h(
        "span",
        { class: "cbx-acts" },
        this.iconBtn(I.chevUp, "Move up (Alt+↑)", () => move(-1)),
        this.iconBtn(I.chevDown, "Move down (Alt+↓)", () => move(1)),
        this.iconBtn(I.clipboard, "Duplicate", () => {
          c.legs.splice(i + 1, 0, clone(l));
          this.selLeg = i + 1;
          this.changed(true);
        }),
        this.iconBtn("×", "Delete (Del)", remove, "del"),
      ),
    );
    card.append(head);
    // drag to reorder, from the grip
    grip.addEventListener("pointerdown", () => (card.draggable = true));
    card.addEventListener("dragstart", (e) => {
      this.dragFrom = i;
      card.classList.add("dragging");
      e.dataTransfer?.setData("text/plain", String(i));
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => {
      card.draggable = false;
      card.classList.remove("dragging");
      this.dragFrom = null;
      this.ed
        .querySelectorAll(".drop-a,.drop-b")
        .forEach((x) => x.classList.remove("drop-a", "drop-b"));
    });
    card.addEventListener("dragover", (e) => {
      if (this.dragFrom === null) return;
      e.preventDefault();
      const r = card.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      card.classList.toggle("drop-b", before);
      card.classList.toggle("drop-a", !before);
    });
    card.addEventListener("dragleave", () =>
      card.classList.remove("drop-a", "drop-b"),
    );
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      const from = this.dragFrom;
      if (from === null) return;
      const r = card.getBoundingClientRect();
      let to = e.clientY < r.top + r.height / 2 ? i : i + 1;
      const [x] = c.legs.splice(from, 1);
      if (from < to) to--;
      c.legs.splice(to, 0, x);
      this.selLeg = to;
      this.dragFrom = null;
      this.routeDraft = null;
      this.changed(true);
    });
    if (on) card.append(this.legFields(l, i));
    for (const e of errs)
      card.append(h("div", { class: "cbx-err" }, svgIcon(I.warning, 13), e));
    this.cardRefresh.push(() => {
      const [t, s] = this.legSummary(l, i);
      const tb = head.querySelector(".cbx-leg-t b"),
        ts = head.querySelector(".cbx-leg-t span");
      if (tb) tb.textContent = t;
      if (ts) ts.textContent = s;
      const pe = this.problems().legs.get(i) ?? [];
      card.classList.toggle("bad", pe.length > 0);
      card.querySelectorAll(".cbx-err").forEach((x) => x.remove());
      for (const e of pe)
        card.append(h("div", { class: "cbx-err" }, svgIcon(I.warning, 13), e));
    });
    return card;
  }

  private legFields(l: CircuitLeg, i: number): HTMLElement {
    const c = this.c;
    const body = h("div", { class: "cb-row" });
    const altF = (
      label: string,
      v: number | null,
      set: (x: number | null) => void,
      ph = "keep",
    ) =>
      this.field(
        label,
        this.num(v, set, { ph, step: 100, min: 1000, max: 18000 }),
      );
    if (l.type === "fix") {
      if (l.via !== undefined) {
        const from = prevFixIdent(c, i) ?? "";
        const aws = airwaysAt(from);
        body.append(
          this.field(
            `Airway from ${from || "…"}`,
            this.sel(
              l.via,
              [
                ...(aws.includes(l.via) || !l.via
                  ? []
                  : [[l.via, l.via] as [string, string]]),
                ...(l.via ? [] : [["", "Choose"] as [string, string]]),
                ...aws.map((a) => [a, a] as [string, string]),
              ],
              (v) => (l.via = v),
              true,
            ),
          ),
          this.field(
            "To fix",
            this.fixInput(l.ident, (v) => (l.ident = v), "Exit fix"),
          ),
          altF("Altitude (ft)", l.alt, (v) => (l.alt = v)),
        );
        if (l.via) {
          const fx = [...new Set(AIRWAYS_FIXES(l.via))].filter(
            (x) => x !== from,
          );
          if (fx.length)
            body.append(
              h(
                "div",
                { class: "fb-pickrow" },
                h("small", {}, `Fixes on ${l.via}`),
                ...fx.slice(0, 24).map((x) =>
                  h(
                    "button",
                    {
                      class: `fb-chip${x === l.ident ? " on" : ""}`,
                      disabled: !airwayFixes(l.via!, from, x),
                      onclick: () => {
                        l.ident = x;
                        this.routeDraft = null;
                        this.changed(true);
                      },
                    },
                    x,
                  ),
                ),
              ),
            );
        }
      } else {
        body.append(
          this.field(
            "Fix",
            this.fixInput(l.ident, (v) => (l.ident = v)),
          ),
          altF(
            l.atc === "cross" ? "Cross at (ft)" : "Altitude (ft)",
            l.alt,
            (v) => (l.alt = v),
          ),
        );
        body.append(
          this.field(
            "Given as",
            this.sel(
              l.atc ?? "",
              [
                ["", "Planned route"],
                ["direct", "ATC: cleared direct"],
                ["cross", "ATC: cross at"],
              ],
              (v) => {
                if (v) l.atc = v as "direct" | "cross";
                else delete l.atc;
              },
              true,
            ),
          ),
        );
      }
    } else if (l.type === "alt") {
      body.append(
        altF("Assigned altitude (ft)", l.alt, (v) => (l.alt = v ?? 3000), ""),
      );
    } else if (l.type === "hold") {
      if (!l.ppos)
        body.append(
          this.field(
            "Hold fix",
            this.fixInput(l.ident, (v) => (l.ident = v)),
          ),
        );
      body.append(
        this.field(
          "Inbound course (°)",
          this.num(
            l.inbound,
            (v) =>
              (l.inbound = ((Math.round(v ?? 360) % 360) + 360) % 360 || 360),
            { min: 1, max: 360 },
          ),
        ),
        this.field(
          "Turns",
          this.sel(
            l.turn,
            [
              ["R", "Right (standard)"],
              ["L", "Left"],
            ],
            (v) => (l.turn = v),
          ),
        ),
        this.field(
          "Leg",
          this.sel(
            String(l.legMin),
            [
              ["1", "1 min"],
              ["1.5", "1.5 min"],
              ["2", "2 min"],
            ],
            (v) => (l.legMin = Number(v)),
          ),
        ),
        altF("Altitude (ft)", l.alt, (v) => (l.alt = v ?? 3000), ""),
        this.field(
          "Circuits",
          this.num(l.laps, (v) => (l.laps = Math.max(1, Math.min(6, v ?? 1))), {
            min: 1,
            max: 6,
          }),
        ),
      );
      const pub = !l.ppos && l.ident ? publishedHoldAt(l.ident) : null;
      if (pub && (pub.inbound !== l.inbound || pub.turn !== l.turn))
        body.append(
          h(
            "button",
            {
              class: "linkbtn fb-wide",
              onclick: () => {
                Object.assign(l, {
                  inbound: pub.inbound,
                  turn: pub.turn,
                  legMin: pub.legMin,
                  alt: pub.alt,
                });
                this.changed(true);
              },
            },
            `Use the published hold at ${pub.ident}: ${pad3(pub.inbound)}° inbound, ${pub.turn === "R" ? "right" : "left"} turns, ${pub.alt} ft`,
          ),
        );
    } else if (l.type === "sid") {
      const st = c.start;
      const procs = st.type === "runway" ? sidsFor(st.airport, st.runway) : [];
      const p = procs.find((x) => x.id === l.id);
      body.append(
        this.field(
          st.type === "runway"
            ? `SID · RWY ${st.runway}`
            : "Departure",
          this.sel(
            l.id,
            [
              ...(p
                ? []
                : [
                    [l.id, `${l.id} (not for this runway)`] as [string, string],
                  ]),
              ...procs.map((x) => [x.id, x.id] as [string, string]),
            ],
            (v) => {
              l.id = v;
              const np = procs.find((x) => x.id === v);
              l.transition = np?.enr[0]?.name ?? null;
            },
            true,
          ),
        ),
        this.field(
          "Transition",
          this.sel(
            l.transition ?? "",
            [
              ["", p?.enr.length ? "No transition" : "None published"],
              ...(p?.enr ?? []).map(
                (t) => [t.name, t.name] as [string, string],
              ),
            ],
            (v) => (l.transition = v || null),
            true,
          ),
        ),
      );
      body.append(this.seqView(i));
    } else if (l.type === "star") {
      const procs = starsFor(l.airport);
      const p = procs.find((x) => x.id === l.id);
      body.append(
        this.field(
          `STAR · ${l.airport}`,
          this.sel(
            l.id,
            [
              ...(p
                ? []
                : [[l.id, `${l.id} (not available)`] as [string, string]]),
              ...procs.map(
                (x) =>
                  [
                    x.id,
                    `${x.id}${x.rwy.length && !x.rwy.some((r) => r.name === "ALL") ? ` · ${x.rwy.map((r) => r.name.replace(/^RW/, "")).join("/")}` : ""}`,
                  ] as [string, string],
              ),
            ],
            (v) => {
              l.id = v;
              l.transition =
                procs.find((x) => x.id === v)?.enr[0]?.name ?? null;
            },
            true,
          ),
        ),
        this.field(
          "Transition",
          this.sel(
            l.transition ?? "",
            [
              ["", p?.enr.length ? "No transition" : "None published"],
              ...(p?.enr ?? []).map(
                (t) => [t.name, t.name] as [string, string],
              ),
            ],
            (v) => (l.transition = v || null),
            true,
          ),
        ),
      );
      body.append(this.seqView(i));
    } else {
      const ap = safeApproach(l.approachId);
      const dest = c.dest ?? ap?.airport ?? null;
      body.append(
        this.field(
          "Approach",
          this.sel(
            l.approachId,
            [
              ...(ap
                ? []
                : [
                    [l.approachId, "Not available in this region"] as [
                      string,
                      string,
                    ],
                  ]),
              ...approachGroups(dest),
            ],
            (v) => {
              l.approachId = v;
              l.transition = getApproach(v).transitions[0]?.name ?? null;
            },
            true,
          ),
        ),
        ap
          ? this.field(
              "Transition",
              this.sel(
                l.transition ?? "",
                [
                  ["", "Vectors to final"],
                  ...ap.transitions.map(
                    (t) => [t.name, t.name] as [string, string],
                  ),
                ],
                (v) => (l.transition = v || null),
                true,
              ),
            )
          : "",
        this.field(
          "Then",
          this.sel(
            l.outcome,
            [
              ["missed", "Missed approach, continue"],
              ["land", "Full-stop landing"],
            ],
            (v) => (l.outcome = v),
            true,
          ),
        ),
      );
      if (ap && planner?.openChart)
        body.append(
          h(
            "button",
            {
              class: "linkbtn fb-wide",
              onclick: () => planner?.openChart?.(ap.id),
            },
            `Open the ${ap.name} plate`,
          ),
        );
    }
    return h("div", { class: "cbx-leg-b" }, body);
  }
  /** fix sequence of a SID / STAR with its constraints (Jeppesen: 5000 = at, 5000+ at or above, 5000− at or below) */
  private seqView(i: number) {
    const seq = this.procSeq(i);
    return h(
      "div",
      { class: "cbx-term-seq fb-wide" },
      h("small", {}, "Fixes flown"),
      h(
        "span",
        {},
        seq.length
          ? seq.join("  →  ")
          : "This procedure has no fix for the runway in use",
      ),
    );
  }

  // ---------------------------------------------------------------- options tab
  private buildOptions(box: HTMLElement) {
    const c = this.c;
    const sec = (t: string, ...els: (HTMLElement | null)[]) =>
      h(
        "div",
        { class: "cbx-set" },
        h("div", { class: "cbx-set-t" }, t),
        ...els,
      );
    // weather
    const w = c.weather;
    const match = WX_PRESETS.slice(1).find((p) =>
      Object.entries(p.wx).every(
        ([k, v]) => (w as Record<string, unknown>)[k] === v,
      ),
    );
    const turb = String(
      [0, 0.15, 0.4, 0.7].reduce((a, b) =>
        Math.abs(b - (w.turbulence ?? 0.15)) <
        Math.abs(a - (w.turbulence ?? 0.15))
          ? b
          : a,
      ),
    );
    const atisApt =
      c.dest ?? (c.start.type === "runway" ? c.start.airport : null);
    box.append(
      sec(
        "Weather",
        h(
          "div",
          { class: "fb-metar" },
          h("b", {}, metarLine(w)),
          atisApt && AIRPORTS.some((a) => a.icao === atisApt)
            ? h("small", {}, `ATIS ${atisApt}: ${atisText(atisApt, this.wx())}`)
            : null,
        ),
        h(
          "div",
          { class: "cb-row" },
          this.field(
            "Preset",
            this.sel(
              match?.id ?? "",
              [
                ["", "Custom"],
                ...WX_PRESETS.slice(1).map(
                  (p) => [p.id, `${p.name}: ${p.desc}`] as [string, string],
                ),
              ],
              (v) => {
                const p = WX_PRESETS.find((x) => x.id === v);
                if (p) Object.assign(w, p.wx);
              },
              true,
            ),
          ),
        ),
        h(
          "div",
          { class: "cbx-wx" },
          this.field(
            "Ceiling AGL (ft)",
            this.num(w.ceilingFt ?? 20000, (v) => (w.ceilingFt = v ?? 20000), {
              min: 0,
              max: 20000,
              step: 50,
              structural: true,
            }),
          ),
          this.field(
            "Visibility (SM)",
            this.num(w.visibilitySm ?? 10, (v) => (w.visibilitySm = v ?? 10), {
              min: 0.25,
              max: 10,
              step: 0.25,
              structural: true,
            }),
          ),
          this.field(
            "Wind from (°)",
            this.num(w.windDir ?? 250, (v) => (w.windDir = v ?? 0), {
              min: 0,
              max: 359,
              step: 10,
              structural: true,
            }),
          ),
          this.field(
            "Wind (kt)",
            this.num(w.windKt ?? 0, (v) => (w.windKt = v ?? 0), {
              min: 0,
              max: 45,
              structural: true,
            }),
          ),
          this.field(
            "Gusts (kt)",
            this.num(w.gustKt ?? 0, (v) => (w.gustKt = v ?? 0), {
              min: 0,
              max: 50,
              structural: true,
            }),
          ),
          this.field(
            "Turbulence",
            this.sel(
              turb,
              [
                ["0", "None"],
                ["0.15", "Light"],
                ["0.4", "Moderate"],
                ["0.7", "Severe"],
              ],
              (v) => (w.turbulence = Number(v)),
            ),
          ),
          this.field(
            "QNH (inHg)",
            this.num(w.qnh ?? 29.92, (v) => (w.qnh = v ?? 29.92), {
              min: 28.5,
              max: 31,
              step: 0.01,
              structural: true,
            }),
          ),
          this.field(
            "Time of day",
            this.sel(
              c.timeOfDay ?? "day",
              [
                ["day", "Day"],
                ["dusk", "Dusk"],
                ["night", "Night"],
              ],
              (v) => (c.timeOfDay = v),
            ),
          ),
        ),
      ),
    );
    // aircraft
    const eq = { ...fullEquipment(), ...(c.equipment ?? {}) };
    const same = (a: Equipment, b: Equipment) =>
      (Object.keys(a) as (keyof Equipment)[]).every((k) => a[k] === b[k]);
    const tog = (k: keyof Equipment, label: string) => {
      const i = h("input", {
        type: "checkbox",
        checked: eq[k],
      }) as HTMLInputElement;
      i.addEventListener("change", () => {
        c.equipment = { ...eq, [k]: i.checked };
        if (k === "ap" && !i.checked) c.allowAp = false;
        this.changed(true);
      });
      return h("label", { class: "fb-check" }, i, h("span", {}, label));
    };
    box.append(
      sec(
        "Aircraft",
        h(
          "div",
          { class: "fb-eq" },
          ...EQUIP_PRESETS.map((p) =>
            h(
              "button",
              {
                class: `fb-eqp${same(p.eq, eq) ? " on" : ""}`,
                onclick: () => {
                  c.equipment = { ...p.eq };
                  if (p.cockpit) c.cockpit = p.cockpit;
                  c.allowAp = p.eq.ap && c.allowAp;
                  this.changed(true);
                },
              },
              h("b", {}, p.name),
              h("small", {}, p.desc),
            ),
          ),
        ),
        h(
          "div",
          { class: "fb-checks" },
          tog("gps", "GPS / WAAS"),
          tog("ap", "Autopilot"),
          tog("nav2", "NAV 2"),
          tog("dme", "DME"),
          tog("adf", "ADF"),
        ),
        h(
          "div",
          { class: "cb-row" },
          this.field(
            "Cockpit",
            this.sel(
              c.cockpit ?? "",
              [
                ["", "Any"],
                ["g1000", "G1000 glass"],
                ["steam", "Steam gauges"],
                ["airliner", "Airliner"],
              ],
              (v) => (c.cockpit = (v || null) as Circuit["cockpit"]),
            ),
          ),
          this.field(
            "Autopilot use",
            this.sel(
              c.allowAp && eq.ap ? "y" : "n",
              [
                ["y", "Allowed"],
                ["n", "Hand-flown"],
              ],
              (v) => (c.allowAp = v === "y" && eq.ap),
            ),
          ),
          this.field(
            "Grading",
            this.sel(
              c.graded === false ? "free" : "graded",
              [
                ["graded", "Graded"],
                ["free", "Free flight"],
              ],
              (v) => (c.graded = v !== "free"),
              true,
            ),
          ),
        ),
      ),
    );
    // instructor
    const who = h("input", {
      type: "text",
      value: c.assignee ?? "",
      placeholder: "Student name",
      spellcheck: "false",
    }) as HTMLInputElement;
    who.addEventListener("input", () => {
      c.assignee = who.value.trim() || undefined;
      this.dirty = true;
      this.renderFooter();
    });
    who.addEventListener("keydown", stop);
    const desc = h(
      "textarea",
      {
        rows: 3,
        placeholder: "Briefing and objectives for the student (optional)",
      },
      c.description,
    ) as HTMLTextAreaElement;
    desc.addEventListener("input", () => {
      c.description = desc.value;
      this.dirty = true;
      this.renderFooter();
    });
    desc.addEventListener("keydown", stop);
    const hidden = c.failures.filter((f) => f.hidden).length;
    const hideAll = h("input", {
      type: "checkbox",
      checked: c.failures.length > 0 && hidden === c.failures.length,
      disabled: !c.failures.length,
    }) as HTMLInputElement;
    hideAll.addEventListener("change", () => {
      for (const f of c.failures) f.hidden = hideAll.checked;
      this.changed(true);
    });
    box.append(
      sec(
        "Instructor",
        h(
          "div",
          { class: "cb-row" },
          this.field("Assigned to", who),
          this.field(
            "Mode",
            this.sel(
              c.mode,
              [
                ["training", "Training"],
                ["checkride", "Checkride (ACS)"],
              ],
              (v) => {
                c.mode = v;
                if (v === "checkride")
                  for (const f of c.failures) f.hidden = true;
              },
              true,
            ),
          ),
        ),
        h(
          "label",
          { class: "fb-check" },
          hideAll,
          h(
            "span",
            {},
            c.failures.length
              ? `Hide the failures from the student (${hidden}/${c.failures.length} hidden)`
              : "Hide the failures from the student (no failure scheduled)",
          ),
        ),
        h("div", { class: "cb-f fb-wide" }, h("span", {}, "Briefing"), desc),
      ),
    );
  }

  // ---------------------------------------------------------------- map + profile
  private renderMapCol() {
    this.map?.destroy();
    this.prof?.destroy();
    this.closePop();
    clear(this.mapCol);
    this.mapReal = !!currentRegion();
    this.stats = h("div", { class: "cbx-stats" });
    if (this.c.world === "real" && (!currentRegion() || this.loading || !this.regionOk())) {
      // no real-world data yet (or another region still loading): no training-region chart under a real-world flight
      this.map = null;
      this.prof = null;
      this.mapCol.append(
        h(
          "div",
          { class: "fb-mapempty" },
          svgIcon(I.map, 22),
          h("b", {}, this.loading ? "Loading the real-world region…" : "The map of your flight appears here"),
          h("span", {}, this.loading ? "Navaids, procedures and terrain around the airports." : "Choose the departure and the destination: their region (navaids, airways, procedures, terrain) loads in a few seconds."),
        ),
      );
      return;
    }
    this.map = new RouteMap(this.c, {
      height: 0,
      legNumbers: true,
      highlight: this.selLeg,
      onPickLeg: (i) => this.select(this.selLeg === i ? null : i),
      onMapClick: (_p, fix, at) => this.mapMenu(fix, at),
      onMoveHold: (leg, fix) => {
        const l = this.c.legs[leg];
        if (l?.type !== "hold" || l.ident === fix) return;
        const pub = publishedHoldAt(fix);
        Object.assign(l, {
          ident: fix,
          ...(pub
            ? { inbound: pub.inbound, turn: pub.turn, legMin: pub.legMin }
            : {}),
        });
        this.toast(
          `Hold moved to ${fix}${pub ? " (published hold)" : ""}`,
          "good",
        );
        this.selLeg = leg;
        this.changed(true);
      },
    });
    this.prof = new RouteProfile(this.c, {
      height: 168,
      highlight: this.selLeg,
    });
    this.mapCol.append(
      this.stats,
      h(
        "div",
        { class: "cbx-mapbox" },
        this.map.el,
        store.get("ifr.fb.mapHint", false)
          ? null
          : h(
              "div",
              { class: "fb-maphint" },
              "Click a fix to add it · drag a hold to another fix",
            ),
      ),
      h(
        "div",
        { class: "cbx-prof-t" },
        "Vertical profile",
        h(
          "span",
          {},
          "Planned altitudes · MEA · SID/STAR constraints · glidepath and minimums",
        ),
      ),
      this.prof.el,
    );
    this.renderStats();
  }
  /** the next map update frames the whole flight again (route applied, airports changed) */
  private refit = false;
  private updateMap() {
    if (!this.map || this.mapReal !== !!currentRegion())
      return this.renderMapCol();
    this.map.setPlan(this.c, this.refit);
    this.refit = false;
    this.map.setHighlight(this.selLeg);
    this.prof?.setPlan(this.c);
    this.renderStats();
  }
  private renderStats() {
    const c = this.c;
    const s = circuitStats(c);
    const apps = c.legs.filter((l) => l.type === "approach").length;
    const holds = c.legs.filter((l) => l.type === "hold").length;
    clear(this.stats);
    const chip = (k: string, v: string) =>
      h("div", {}, h("small", {}, k), h("b", {}, v));
    const route = this.icaos();
    this.stats.append(
      chip("Route", route.length ? route.join(" → ") : "—"),
      chip("Distance", `${s.distNm.toFixed(0)} NM`),
      chip(
        "Est. time",
        s.minutes >= 60
          ? `${Math.floor(s.minutes / 60)} h ${String(Math.round(s.minutes % 60)).padStart(2, "0")}`
          : `${Math.round(s.minutes)} min`,
      ),
      chip("Holds", String(holds)),
      chip("Approaches", String(apps)),
      chip("Events", String(c.failures.length + (c.events?.length ?? 0))),
    );
  }
  /** click on the map: add the fix there as a direct leg, a hold or a cleared-direct amendment */
  private mapMenu(fix: string | null, at: { x: number; y: number }) {
    this.closePop();
    store.set("ifr.fb.mapHint", true);
    this.mapCol.querySelector(".fb-maphint")?.remove();
    const r = this.mapCol.getBoundingClientRect();
    const pop = h("div", {
      class: "fb-pop",
      role: "menu",
      style: `left:${Math.min(at.x - r.left, r.width - 230)}px;top:${at.y - r.top + 8}px`,
    });
    const c = this.c;
    const item = (label: string, on: () => void) =>
      h(
        "button",
        {
          role: "menuitem",
          onclick: () => {
            this.closePop();
            on();
          },
        },
        label,
      );
    if (!fix)
      pop.append(
        h(
          "p",
          {},
          "No fix here. Click a fix, VOR, NDB or airport (zoom in to reach the small ones).",
        ),
      );
    else {
      const f = findFix(fix)!;
      const enrAt = this.addAt("enr");
      pop.append(
        h(
          "b",
          {},
          fix,
          h(
            "small",
            {},
            f.kind === "vor"
              ? "VOR"
              : f.kind === "ndb"
                ? "NDB"
                : f.kind === "airport"
                  ? "Airport"
                  : "Fix",
          ),
        ),
        item(`Direct ${fix}`, () =>
          this.insert({ type: "fix", ident: fix, alt: null }, enrAt),
        ),
        item(`Hold at ${fix}`, () =>
          this.insert(
            this.holdLeg(fix),
            this.selLeg !== null && this.selLeg >= 0 ? this.selLeg + 1 : enrAt,
          ),
        ),
        item(`ATC: cleared direct ${fix}`, () =>
          this.insert(
            { type: "fix", ident: fix, alt: null, atc: "direct" },
            this.selLeg !== null && this.selLeg >= 0
              ? this.selLeg + 1
              : this.arrivalIndex(),
          ),
        ),
        item(`Failure passing ${fix}`, () => {
          c.failures.push({
            key: "gs",
            trigger: "fix",
            at: 0,
            fix,
            hidden: c.mode === "checkride",
          });
          this.changed(true);
          requestAnimationFrame(() =>
            this.ed
              .querySelector(".fb-events")
              ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
          );
        }),
      );
    }
    this.mapCol.append(pop);
    this.pop = pop;
    const off = (e: Event) => {
      if (!pop.contains(e.target as Node)) this.closePop();
    };
    setTimeout(
      () => document.addEventListener("pointerdown", off, { once: true }),
      0,
    );
  }
  private closePop() {
    this.pop?.remove();
    this.pop = null;
  }

  // ---------------------------------------------------------------- footer
  private renderFooter() {
    clear(this.foot);
    const pr = this.problems();
    const ok = pr.all.length === 0;
    const firstLeg = [...pr.legs.keys()].sort((a, b) => a - b)[0];
    const real = this.c.world === "real";
    const needLoad = real && !this.regionOk();
    const pending = !real
      ? null
      : !this.icaos().length
        ? "Choose the departure airport to start"
        : !this.c.dest
          ? "Choose the destination airport"
          : null;
    const status = pending
      ? h("span", { class: "cbx-status" }, pending)
      : this.loading
      ? h(
          "span",
          { class: "cbx-status" },
          h("span", { class: "spin" }),
          "Loading the real-world region…",
        )
      : ok
        ? h(
            "span",
            { class: "cbx-status ok" },
            svgIcon(I.check, 15),
            needLoad ? "Ready: the region loads when you fly" : "Ready to fly",
          )
        : h(
            "button",
            {
              class: "cbx-status bad",
              title: pr.all.join("\n"),
              onclick: () => {
                this.tab = "flight";
                if (firstLeg !== undefined) this.select(firstLeg);
                else if (pr.start.length) this.select(-1);
                else {
                  this.renderEditor();
                  if (pr.events.length)
                    requestAnimationFrame(() =>
                      this.ed
                        .querySelector(".fb-events")
                        ?.scrollIntoView({ block: "nearest" }),
                    );
                }
              },
            },
            svgIcon(I.warning, 15),
            `${pr.all.length} issue${pr.all.length === 1 ? "" : "s"} · ${pr.general[0] ?? pr.start[0] ?? (firstLeg !== undefined ? `Leg ${firstLeg + 1}: ${pr.legs.get(firstLeg)![0]}` : (pr.events[0] ?? pr.all[0]))}`,
          );
    const saved = this.isSaved();
    this.foot.classList.add("cbx-foot");
    const canFly = ok && !this.loading;
    // nothing to share yet: a real-world flight without its airports
    const empty = real && !this.c.dest;
    this.foot.append(
      ...[
        status,
        h("span", { style: "flex:1" }),
        h(
          "button",
          {
            class: "btn ghost sm",
            disabled: empty,
            title: "Share a link or a QR code students open to fly this flight",
            onclick: (e: Event) => this.share(e.currentTarget as HTMLElement),
          },
          svgIcon(I.link, 14),
          "Share",
        ),
        h(
          "button",
          {
            class: "btn ghost sm",
            disabled: empty,
            title: "Download this flight as JSON",
            onclick: () =>
              this.download(
                this.c,
                `${this.c.name.replace(/[^\w-]+/g, "_")}.json`,
              ),
          },
          "Export",
        ),
        h("span", { class: "cbx-sep" }),
        saved
          ? h(
              "button",
              {
                class: "btn danger-ghost",
                onclick: () => {
                  if (!confirm(`Delete “${this.c.name}” from your flights?`))
                    return;
                  circuitStore.remove(this.c.id);
                  this.toast(`Deleted “${this.c.name}”`, "info");
                  this.c = this.freshCircuit();
                  this.sourceId = null;
                  this.dirty = true;
                  this.selLeg = null;
                  this.render();
                },
              },
              "Delete",
            )
          : null,
        // a copy only means something for a flight that is kept (a new flight is a copy already)
        !saved
          ? null
          : h(
          "button",
          {
            class: "btn",
            title: "Edit a copy of this flight",
            onclick: () => {
              this.sourceId = this.isSaved() ? this.c.id : this.sourceId;
              this.c = {
                ...clone(this.c),
                id: `c${Date.now().toString(36)}`,
                name: `${this.c.name} (copy)`,
                preset: false,
              };
              this.dirty = true;
              this.render();
              this.toast("Duplicated: save to keep the copy", "info");
            },
          },
          "Duplicate",
        ),
        h(
          "button",
          {
            class: `btn${this.dirty ? " accent" : ""}`,
            disabled: !ok || (!this.dirty && saved),
            title: ok ? "" : "Fix the issues first",
            onclick: () => this.save(),
          },
          !this.dirty && saved ? "Saved" : "Save",
        ),
        h(
          "button",
          {
            class: "btn primary fb-fly",
            disabled: !canFly,
            title: canFly
              ? this.c.graded === false
                ? "Fly this flight (not graded)"
                : "Fly with ATC instructions and grading"
              : "Fix the issues first",
            onclick: () => void this.fly(),
          },
          needLoad
            ? "Load & fly"
            : this.c.graded === false
              ? "Fly (free)"
              : "Fly",
          svgIcon(I.plane, 15),
        ),
      ].filter((x): x is HTMLElement => !!x),
    );
  }

  private async fly() {
    if (this.c.world === "real" && !this.regionOk()) {
      if (!(await this.ensureRegion())) return;
      if (validate(this.c).length) {
        this.toast(
          "The flight changed with the real-world data: check it before flying",
          "warn",
        );
        return;
      }
    }
    if (this.c.world !== "real" && currentRegion()) this.leaveReal();
    const c = clone(this.c);
    this.save(true);
    this.close();
    const prev = store.get<Partial<FlightSetupState> | null>(
      "ifr.setup.v1",
      null,
    );
    const st: FlightSetupState = {
      ...defaultSetup(),
      ...(prev ?? {}),
      cockpit: c.cockpit ?? prev?.cockpit ?? "g1000",
      equipment: { ...fullEquipment(), ...(c.equipment ?? {}) },
      tod: c.timeOfDay ?? "day",
      weather: c.weather,
      mode: c.mode,
      graded: c.graded !== false,
    } as FlightSetupState;
    if (c.graded === false && planner?.flyFree)
      planner.flyFree(circuitToScenario(c), st);
    else if (planner?.flyGraded) planner.flyGraded(c, st);
    else this.onFly(c);
  }

  private save(quiet = false) {
    if (this.c.preset) this.c = { ...this.c, preset: false };
    circuitStore.save(this.c);
    this.dirty = false;
    this.sourceId = null;
    if (!quiet) this.toast(`Saved “${this.c.name}”`, "good");
    this.renderLibrary();
    this.renderFooter();
  }

  private async share(anchor: HTMLElement) {
    this.closePop();
    const url = `${location.origin}${location.pathname}#circuit=${encodeCircuit(this.c)}`;
    const pop = h("div", {
      class: "fb-pop fb-share",
      role: "dialog",
      "aria-label": "Share this flight",
    });
    const r = anchor.getBoundingClientRect();
    const br = this.box.getBoundingClientRect();
    pop.style.left = `${Math.max(12, r.left - br.left - 120)}px`;
    pop.style.bottom = `${br.bottom - r.top + 8}px`;
    const qrBox = h("div", { class: "fb-qr" });
    const link = h("input", {
      type: "text",
      value: url,
      readonly: true,
      "aria-label": "Share link",
    }) as HTMLInputElement;
    link.addEventListener("focus", () => link.select());
    pop.append(
      h("b", {}, "Share this flight"),
      h(
        "small",
        {},
        "Students open the link (or scan the code) to fly it. Nothing is uploaded: the flight is in the link.",
      ),
      qrBox,
      h(
        "div",
        { class: "fb-share-row" },
        link,
        h(
          "button",
          {
            class: "btn sm primary",
            onclick: async () => {
              try {
                await navigator.clipboard.writeText(url);
                this.toast("Link copied", "good");
              } catch {
                link.select();
              }
            },
          },
          "Copy",
        ),
      ),
    );
    this.box.append(pop);
    this.pop = pop;
    setTimeout(
      () =>
        document.addEventListener(
          "pointerdown",
          (e) => !pop.contains(e.target as Node) && this.closePop(),
          { once: true },
        ),
      0,
    );
    try {
      const qrcode = (await import("qrcode-generator")).default;
      const qr = qrcode(0, "L");
      qr.addData(url);
      qr.make();
      qrBox.innerHTML = qr.createSvgTag({
        cellSize: 3,
        margin: 2,
        scalable: true,
      });
    } catch {
      qrBox.textContent =
        url.length > 2900
          ? "This flight is too long for a QR code: share the link."
          : "";
    }
  }

  private download(data: unknown, name: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const a = h("a", { href: URL.createObjectURL(blob), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  close() {
    super.close();
    this.closePop();
    this.map?.destroy();
    this.prof?.destroy();
    this.map = null;
    this.prof = null;
  }
}

/** the fixes of an airway of the loaded region, in the order of its segments */
function AIRWAYS_FIXES(route: string): string[] {
  const out: string[] = [];
  for (const s of AIRWAYS)
    if (s.route === route)
      for (const f of [s.from.ident, s.to.ident]) if (!out.includes(f)) out.push(f);
  return out;
}

export { decodeCircuit, legText };
