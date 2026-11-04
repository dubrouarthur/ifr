// "Plan a flight" wizard: airports (real world first), flight type, aircraft & instruments, start, route /
// approach / holding (adapted to the flight type), weather & time, training options and a briefing — with a
// live summary and route map. Steps show a check only when they are valid, a warning dot when they hold an error.
import { h, clear, store } from "./dom";
import { Modal, WX_PRESETS } from "./modals";
import { svgIcon, I } from "./icons";
import {
  FIXES,
  APPROACHES,
  AIRPORTS,
  TERMINAL,
  approach as getApproach,
  findFix,
} from "../nav/data";
import {
  sidsFor,
  starsFor,
  terminalProc,
  terminalSummary,
} from "../nav/terminal";
import {
  FAILURE_LABELS,
  fullEquipment,
  type Equipment,
  type Failures,
  type Scenario,
} from "../sim/sim";
import type { Weather } from "../sim/environment";
import type { Approach, TerminalProc } from "../nav/types";
import {
  circuitStats,
  validate,
  circuitStore,
  type Circuit,
  type CircuitLeg,
} from "../train/circuits";
import {
  defaultSetup,
  adaptSetupToRegion,
  sanitizeSetup,
  setupToCircuit,
  setupToScenario,
  type FlightSetupState,
  type FlightType,
  type StartKind,
} from "../train/setup";
export type { FlightSetupState, FlightType } from "../train/setup";
import { approachPlate } from "../plates/plates";
import {
  atisText,
  runwayInUse,
  runwayWind,
  approachInUse,
  APPROACH_RANK,
} from "./atis";
import { RouteMap, RouteProfile, planProfile } from "./routeMap";
import {
  loadRegion,
  leaveRealWorld,
  currentRegion,
  searchAirports,
  nearbyAirports,
  airportRow,
  rowDistanceNm,
  MAX_REGION_NM,
  FLAG_PROC,
  FLAG_ILS,
  type IndexRow,
} from "../nav/world";
import { bearingDeg, distanceNm } from "../nav/geo";

const STEPS = [
  "Airports",
  "Flight type",
  "Aircraft & instruments",
  "Start position",
  "Route & arrival",
  "Weather & time",
  "Training options",
  "Briefing",
] as const;
const S_AIRPORTS = 0,
  S_TYPE = 1,
  S_START = 3,
  S_ROUTE = 4,
  S_TRAIN = 6,
  S_BRIEF = 7;
const EQUIP_PRESETS: {
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
    desc: "2 NAV, DME, ADF — no GPS, no autopilot",
    eq: { gps: false, ap: false, adf: true, dme: true, nav2: true },
    cockpit: "steam",
  },
  {
    name: "Basic trainer",
    desc: "1 NAV only — no DME, ADF, GPS or autopilot",
    eq: { gps: false, ap: false, adf: false, dme: false, nav2: false },
    cockpit: "steam",
  },
  {
    name: "GPS, no autopilot",
    desc: "Hand-flown glass with GPS",
    eq: { gps: true, ap: false, adf: true, dme: true, nav2: true },
  },
];
const pad3 = (n: number) =>
  String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, "0");
const stop = (e: Event) => e.stopPropagation();
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
/** slider scales: fine where it matters (low ceilings, low visibility) */
const CEIL_STEPS: number[] = (() => {
  const a: number[] = [];
  for (let v = 0; v < 1000; v += 50) a.push(v);
  for (let v = 1000; v < 5000; v += 100) a.push(v);
  for (let v = 5000; v <= 15000; v += 500) a.push(v);
  return a;
})();
const VIS_STEPS = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 4, 5, 6, 7, 8, 9,
  10,
];
const nearest = (arr: number[], v: number) =>
  arr.reduce((b, x, i) => (Math.abs(x - v) < Math.abs(arr[b] - v) ? i : b), 0);
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

/** Holds published in the procedures of the region (missed-approach holds, holds-in-lieu), destination first */
function publishedHolds(arr: string) {
  const out: {
    fix: string;
    inbound: number;
    turn: "L" | "R";
    legMin: number;
    alt: number;
    where: string;
    dest: boolean;
  }[] = [];
  const seen = new Set<string>();
  for (const a of APPROACHES)
    for (const [l, what] of [
      ...a.missed.map((l) => [l, "missed approach"] as const),
      ...a.final.map((l) => [l, "course reversal"] as const),
      ...a.transitions.flatMap((t) =>
        t.legs.map((l) => [l, "hold-in-lieu"] as const),
      ),
    ]) {
      if (!l.hold) continue;
      const key = `${l.fix.ident}|${l.hold.inbound}|${l.hold.turn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        fix: l.fix.ident,
        inbound: Math.round(l.hold.inbound) || 360,
        turn: l.hold.turn,
        legMin: l.hold.legMin || 1,
        alt: Math.max(2000, Math.ceil((l.altMin ?? 3000) / 100) * 100),
        where: `${a.airport} ${a.name} — ${what}`,
        dest: a.airport === arr,
      });
    }
  return out.sort((x, y) => Number(y.dest) - Number(x.dest)).slice(0, 12);
}

// ------------------------------------------------------------------ wizard
export interface SetupHooks {
  flyGraded: (c: Circuit, st: FlightSetupState) => void;
  flyFree: (sc: Scenario, st: FlightSetupState) => void;
  openChart: (id: string) => void;
  /** the nav database / terrain changed (real-world region loaded or left) */
  regionChanged: () => void;
}

export class FlightSetup extends Modal {
  st: FlightSetupState = store.get("ifr.setup.v1", defaultSetup());
  private step = 0;
  private visited = new Set<number>([0]);
  private nav!: HTMLElement;
  private main!: HTMLElement;
  private side!: HTMLElement;

  constructor(private hooks: SetupHooks) {
    super("Plan a flight");
    this.box.classList.add("fs");
    clear(this.body);
    this.nav = h("nav", { class: "fs-nav", "aria-label": "Steps" });
    this.main = h("section", { class: "fs-main" });
    this.side = h("aside", { class: "fs-side", "aria-label": "Your flight" });
    this.body.append(
      h("div", { class: "fs-grid" }, this.nav, this.main, this.side),
    );
    // merge older stored setups with new defaults
    this.st = {
      ...defaultSetup(),
      ...this.st,
      equipment: { ...fullEquipment(), ...(this.st.equipment ?? {}) },
    };
  }

  start(type?: FlightType, world?: "real" | "training") {
    if (type) this.applyType(type);
    if (world && world !== this.st.world) {
      this.st.world = world;
      if (world === "training" && currentRegion()) {
        leaveRealWorld();
        this.loadedKey = "";
        this.hooks.regionChanged();
      }
    }
    // a plan saved in another session may refer to procedures of a region that is not loaded now
    if (!this.needsRegion()) sanitizeSetup(this.st);
    this.step = 0;
    this.visited = new Set([0]);
    this.open(); // open first: a rendering problem must never leave the user on a paused sim with nothing shown
    this.render();
  }

  private save() {
    store.set("ifr.setup.v1", this.st);
  }
  private changed(full = true) {
    this.save();
    if (full) this.renderMain();
    this.renderSide();
    this.renderNav();
    this.renderFoot();
  }

  /** start kinds that make sense for a flight type */
  private startKinds(t: FlightType = this.st.type): StartKind[] {
    return t === "approach"
      ? ["final", "air"]
      : t === "hold"
        ? ["air", "runway"]
        : ["runway", "air"];
  }

  private applyType(t: FlightType) {
    const st = this.st;
    st.type = t;
    if (t === "approach") {
      st.start = "final";
      st.arrival.outcome = "land";
      st.hold.enabled = false;
      if (st.arrival.approachId) st.final.approachId = st.arrival.approachId;
    } else if (t === "hold") {
      st.start = "air";
      st.air = {
        fix: st.hold.fix,
        bearing: 45,
        distNm: 10,
        altFt: st.hold.alt,
        iasKt: 90,
      };
    } else if (t === "route") {
      st.start = "runway";
    } else if (t === "free") {
      if (!this.startKinds(t).includes(st.start)) st.start = "air";
      st.graded = false;
    }
  }

  /** the steps shown for the flight type: free flight has no route and no grading */
  private visibleSteps(): number[] {
    const all = STEPS.map((_, i) => i);
    return this.st.type === "free"
      ? all.filter((i) => i !== S_ROUTE && i !== S_TRAIN)
      : all;
  }
  private stepTitle(i: number): string {
    if (i === S_ROUTE)
      return this.st.type === "hold"
        ? "Holding"
        : this.st.type === "approach"
          ? "Approach"
          : "Route & arrival";
    if (i === S_START && this.st.type === "route") return "Departure";
    return STEPS[i];
  }
  private go(i: number) {
    this.step = i;
    this.visited.add(i);
    this.render();
    this.main.scrollTop = 0;
    if (
      i >= S_TYPE &&
      this.needsRegion() &&
      this.st.dep &&
      this.st.arr &&
      !this.loading
    )
      void this.ensureRegion();
  }
  private nextStep(d: 1 | -1): number | null {
    const v = this.visibleSteps();
    const k = v.indexOf(this.step);
    return v[k + d] ?? null;
  }

  /** validation errors of the plan, each with the step where it is fixed */
  private stepErrors(): { step: number; text: string }[] {
    const st = this.st;
    const out: { step: number; text: string }[] = [];
    if (st.world === "real" && (!st.dep || !st.arr))
      out.push({
        step: S_AIRPORTS,
        text: "Choose the departure and the destination airports.",
      });
    else if (this.loadErr && !this.loading)
      out.push({ step: S_AIRPORTS, text: this.loadErr });
    if (this.needsRegion() || st.type === "free") return out;
    let c: Circuit;
    try {
      c = setupToCircuit(st);
    } catch {
      return [
        ...out,
        {
          step: S_ROUTE,
          text: "The plan refers to a procedure that is not loaded.",
        },
      ];
    }
    for (const e of validate(c)) {
      const m = /^Leg (\d+):/.exec(e);
      const leg = m ? c.legs[Number(m[1]) - 1] : undefined;
      const step =
        /start fix|runway/i.test(e) && !m
          ? S_START
          : /^Failure/.test(e)
            ? S_TRAIN
            : leg || /at least one leg/.test(e)
              ? S_ROUTE
              : S_BRIEF;
      out.push({
        step,
        text:
          e === "Add at least one leg."
            ? "Add at least one fix or an approach."
            : e.replace(/^Leg \d+: /, "").replace(/^./, (x) => x.toUpperCase()),
      });
    }
    return out;
  }

  render() {
    try {
      this.renderNav();
      this.renderMain();
      this.renderSide();
      this.renderFoot();
    } catch (e) {
      console.error("flight setup render", e);
      clear(this.main);
      this.main.append(
        h(
          "div",
          { class: "fs-errs" },
          h(
            "div",
            {},
            "This plan refers to data that is not available any more.",
          ),
          h(
            "button",
            {
              class: "btn primary",
              style: "margin-top:10px",
              onclick: () => {
                this.st = {
                  ...defaultSetup(),
                  world: this.st.world,
                  dep: this.st.dep,
                  arr: this.st.arr,
                };
                this.loadedKey = "";
                this.step = 0;
                this.save();
                this.render();
              },
            },
            "Start a fresh plan",
          ),
        ),
      );
    }
  }

  private renderNav() {
    clear(this.nav);
    const errs = this.stepErrors();
    this.visibleSteps().forEach((i, k) => {
      const bad =
        errs.some((e) => e.step === i) &&
        i !== this.step &&
        (this.visited.has(i) || i === S_AIRPORTS || this.step === S_BRIEF);
      const ok =
        !bad && this.visited.has(i) && i !== this.step && i !== S_BRIEF;
      this.nav.append(
        h(
          "button",
          {
            class: `fs-step${i === this.step ? " on" : ""}${ok ? " done" : ""}${bad ? " warn" : ""}`,
            "aria-current": i === this.step ? "step" : undefined,
            title: bad
              ? errs
                  .filter((e) => e.step === i)
                  .map((e) => e.text)
                  .join("\n")
              : undefined,
            onclick: () => this.go(i),
          },
          h("span", { class: "n" }, ok ? svgIcon(I.check, 13) : String(k + 1)),
          h("span", {}, this.stepTitle(i)),
          bad
            ? h("i", { class: "fs-warn-dot", "aria-label": "Needs attention" })
            : null,
        ),
      );
    });
    this.nav.append(
      h("div", { class: "fs-sec" }, "Setup"),
      h(
        "button",
        {
          class: "fs-step",
          title: "Start again from the default plan",
          onclick: () => {
            if (!confirm("Reset the whole plan to the defaults?")) return;
            const keep = {
              world: this.st.world,
              dep: this.st.dep,
              arr: this.st.arr,
            };
            this.st = { ...defaultSetup(), ...keep };
            if (!this.needsRegion()) {
              adaptSetupToRegion(this.st);
              this.applyAtisDefaults();
            }
            this.step = 0;
            this.visited = new Set([0]);
            this.toast?.("Plan reset to the defaults");
            this.changed();
          },
        },
        h("span", { class: "n" }, svgIcon(I.restart, 13)),
        h("span", {}, "Reset to defaults"),
      ),
    );
  }

  // ---------------------------------------------------------------- helpers
  private sel<T extends string>(
    value: T,
    opts: ([T, string] | { group: string; opts: [T, string][] })[],
    on: (v: T) => void,
    full = true,
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
      this.changed(full);
    });
    s.addEventListener("keydown", stop);
    return s;
  }
  private num(
    v: number,
    on: (x: number) => void,
    o: { min: number; max: number; step: number },
  ) {
    const i = h("input", {
      type: "number",
      value: v,
      min: o.min,
      max: o.max,
      step: o.step,
    }) as HTMLInputElement;
    i.addEventListener("change", () => {
      on(Math.max(o.min, Math.min(o.max, Number(i.value))));
      this.changed(false);
    });
    i.addEventListener("keydown", stop);
    return i;
  }
  private f(label: string, ...els: (HTMLElement | string | null)[]) {
    return h("label", { class: "cb-f" }, h("span", {}, label), ...els);
  }
  private choice<T>(
    cur: T,
    items: { v: T; title: string; desc: string; icon?: string; cls?: string }[],
    on: (v: T) => void,
    cls = "",
  ) {
    return h(
      "div",
      { class: `fs-choices ${cls}` },
      ...items.map((it) =>
        h(
          "button",
          {
            class: `fs-choice${it.cls ? " " + it.cls : ""}${it.v === cur ? " on" : ""}`,
            "aria-pressed": String(it.v === cur),
            onclick: () => {
              on(it.v);
              this.changed();
            },
          },
          it.icon ? h("span", { class: "fs-ic" }, svgIcon(it.icon, 20)) : null,
          h("b", {}, it.title),
          h("span", {}, it.desc),
        ),
      ),
    );
  }
  private dlN = 0;
  /** fix entry: suggestions from the loaded region, an inline message for an unknown fix */
  private fixInput(
    v: string,
    on: (x: string) => void,
    o: { ph?: string; clearOnAdd?: boolean; width?: number } = {},
  ) {
    const id = `fs-fx-${++this.dlN}`;
    const dl = h("datalist", { id });
    const i = h("input", {
      type: "text",
      class: "fs-fixin",
      value: v,
      list: id,
      spellcheck: "false",
      autocomplete: "off",
      placeholder: o.ph ?? "Fix, navaid or airport",
      style: o.width ? `width:${o.width}px` : "",
    }) as HTMLInputElement;
    const msg = h("div", { class: "fs-fixerr", role: "status" });
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
      i.classList.remove("bad");
      msg.textContent = "";
    };
    const commit = () => {
      const x = i.value.trim().toUpperCase();
      if (!x) return;
      if (findFix(x)) {
        on(x);
        if (o.clearOnAdd) i.value = "";
        this.changed();
      } else {
        i.classList.add("bad");
        msg.textContent = `Unknown fix “${x}”`;
      }
    };
    i.addEventListener("focus", fill);
    i.addEventListener("input", fill);
    i.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
      }
    });
    if (!o.clearOnAdd) i.addEventListener("change", commit);
    return {
      el: h("span", { class: "fs-fixw" }, i, dl, msg),
      input: i,
      commit,
    };
  }
  private wx(): Weather {
    return { ...WX0, ...this.st.weather } as Weather;
  }
  /** an inline warning when the runway has a tailwind (with a one-click fix to the runway in use) */
  private tailNote(
    icao: string,
    rwyId: string,
    fix?: (rw: string) => void,
  ): HTMLElement | null {
    const w = this.wx();
    const c = runwayWind(icao, rwyId, w);
    if (!c || c.head > -2 || !AIRPORTS.some((a) => a.icao === icao))
      return null;
    const use = runwayInUse(icao, w).id;
    return h(
      "div",
      { class: "fs-note warn" },
      svgIcon(I.warning, 14),
      h(
        "span",
        {},
        `Tailwind ${Math.round(-c.head)} kt on RWY ${rwyId} — the ATIS has RWY ${use} in use.`,
      ),
      fix && use !== rwyId
        ? h(
            "button",
            { class: "linkbtn", onclick: () => fix(use) },
            `Use RWY ${use}`,
          )
        : null,
    );
  }
  /** briefing warnings (not blocking) */
  private warnings(): string[] {
    const st = this.st;
    const w = this.wx();
    const out: string[] = [];
    const c = setupToCircuit(st);
    // the planned altitude at a procedure fix is below its published minimum (e.g. cruise below the IAF altitude)
    for (const p of planProfile(c, false).pts)
      if (p.ident && p.amin !== undefined && p.alt < p.amin - 50)
        out.push(`${p.ident}: planned ${Math.round(p.alt / 100) * 100} ft, below the ${p.amin} ft minimum${p.role ? ` (${p.role})` : ""}`);
    if (c.start.type === "runway") {
      const hw = runwayWind(c.start.airport, c.start.runway, w);
      if (hw && hw.head <= -2)
        out.push(
          `Tailwind ${Math.round(-hw.head)} kt for take-off on RWY ${c.start.runway}`,
        );
    }
    const ap = c.legs.find((l) => l.type === "approach") as
      | Extract<CircuitLeg, { type: "approach" }>
      | undefined;
    if (ap) {
      const a = getApproach(ap.approachId);
      const hw = runwayWind(a.airport, a.runway, w);
      if (hw && hw.head <= -2)
        out.push(
          `Tailwind ${Math.round(-hw.head)} kt on RWY ${a.runway} at ${a.airport} (ATIS: RWY ${runwayInUse(a.airport, w).id} in use)`,
        );
      if (hw && Math.abs(hw.cross) >= 15)
        out.push(
          `Crosswind ${Math.round(Math.abs(hw.cross))} kt on RWY ${a.runway}`,
        );
    }
    return out;
  }
  /** departure runway and arrival approach as the ATIS would assign them */
  private applyAtisDefaults() {
    const st = this.st;
    const w = this.wx();
    const depApt = AIRPORTS.find((a) => a.icao === st.rwy.airport);
    if (depApt?.runways.length) st.rwy.runway = runwayInUse(depApt.icao, w).id;
    const arrIcao =
      st.world === "real"
        ? st.arr
        : st.arrival.approachId
          ? getApproach(st.arrival.approachId).airport
          : "";
    const prevId = st.arrival.approachId;
    const ap = arrIcao
      ? approachInUse(arrIcao, w, (a) => st.equipment.gps || a.type !== "RNAV")
      : undefined;
    if (ap && ap.id !== prevId) {
      const prev = prevId ? APPROACHES.find((a) => a.id === prevId) : undefined;
      const prevIaf = prev?.transitions.find(
        (t) => t.name === st.arrival.transition,
      )?.legs[0]?.fix.ident;
      const prevMahp = prev?.missed[prev.missed.length - 1]?.fix.ident;
      st.arrival = {
        approachId: ap.id,
        transition: ap.transitions[0]?.name ?? null,
        outcome: st.arrival.outcome,
      };
      st.final.approachId = ap.id;
      // a new default approach: cruise at least at its IAF minimum, so the plan starts valid
      const iafMin = ap.transitions[0]?.legs[0]?.altMin;
      if (st.type === "route" && iafMin && st.cruise < iafMin)
        st.cruise = Math.min(12000, Math.ceil(iafMin / 500) * 500);
      if (st.route.length === 1 && st.route[0] === prevIaf) this.suggestRoute();
      if (prevMahp && st.hold.fix === prevMahp)
        st.hold.fix = ap.missed[ap.missed.length - 1]?.fix.ident ?? st.hold.fix;
    }
    if (st.sid && !terminalProc(st.rwy.airport, "SID", st.sid.id))
      st.sid = null;
  }

  private loadedKey = "";
  private progress = "";
  private terrainNote = "";
  private loading = false;
  private loadErr = "";
  private loadingJob: Promise<void> | null = null;
  /** load (or leave) the real-world region for the chosen airports */
  private ensureRegion(force = false): Promise<void> {
    if (this.loadingJob) return this.loadingJob;
    this.loadingJob = this.doEnsureRegion(force).finally(
      () => (this.loadingJob = null),
    );
    return this.loadingJob;
  }
  private loadLabel() {
    const st = this.st;
    return `Loading the ${st.dep === st.arr ? st.dep : `${st.dep}–${st.arr}`} region (navaids, procedures, terrain)…`;
  }
  private async doEnsureRegion(force: boolean) {
    const st = this.st;
    if (st.world !== "real") {
      if (currentRegion()) {
        leaveRealWorld();
        this.loadedKey = "";
        this.hooks.regionChanged();
        sanitizeSetup(st);
        this.applyAtisDefaults();
        this.render();
      }
      return;
    }
    const key = `${st.dep}|${st.arr}`;
    if (!st.dep || !st.arr) {
      this.loadErr = "Choose the departure and the destination first.";
      this.render();
      return;
    }
    if (!force && key === this.loadedKey && currentRegion()) return;
    this.loading = true;
    this.loadErr = "";
    this.progress = "";
    this.render();
    try {
      const r = await loadRegion(
        [st.dep, st.arr].filter(Boolean),
        undefined,
        (pr) => {
          this.progress =
            pr.step === "index"
              ? "airport index"
              : pr.step === "navdata"
                ? "airports, navaids & waypoints"
                : pr.step === "procedures"
                  ? "instrument procedures"
                  : pr.step === "terrain"
                    ? `terrain ${pr.done ?? 0}/${pr.total ?? 0} tiles`
                    : "";
          for (const el of [
            ...this.main.querySelectorAll(".fs-prog-step"),
            ...this.side.querySelectorAll(".fs-prog-step"),
            ...this.foot.querySelectorAll(".fs-prog-step"),
          ])
            el.textContent = this.progress;
        },
      );
      this.loadedKey = key;
      this.terrainNote = r.terrainComplete
        ? "terrain loaded"
        : "terrain still loading in the background (you can fly now)";
      adaptSetupToRegion(st);
      this.applyAtisDefaults();
      this.toast?.(
        `Real-world region loaded: ${r.airports.length} airports · ${r.approaches} approaches · mag var ${r.magVar.toFixed(1)}°`,
      );
      this.hooks.regionChanged();
    } catch (e) {
      this.loadErr = String((e as Error).message || e);
    } finally {
      this.loading = false;
      this.save();
      this.render();
    }
  }
  /** progress row: spinner, what is loading, current stage */
  private progressRow(text = this.loadLabel()) {
    return h(
      "div",
      { class: "fs-prog", role: "status" },
      h("span", { class: "spin" }),
      h("span", {}, text),
      h("span", { class: "fs-prog-step" }, this.progress),
    );
  }

  private rows: Record<string, IndexRow> = {};
  /** Airport search field: typing only searches (latest query wins); nothing is committed until a result is
   *  clicked or Enter picks the highlighted one. An empty field lists `suggest()` (e.g. airports near departure). */
  private airportPicker(
    label: string,
    ph: string,
    on: (r: IndexRow) => void,
    suggest: () => Promise<IndexRow[]>,
    suggestTitle: string,
    from?: IndexRow,
  ) {
    const wrap = h("div", { class: "ap-pick" });
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
      if (title)
        res.append(
          h(
            "div",
            { class: "ap-res-t" },
            title,
            h("span", {}, "↑ ↓ to move · Enter to choose"),
          ),
        );
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
              onmouseenter: () => {
                hi = i;
                res
                  .querySelectorAll("button")
                  .forEach((b, k) => b.classList.toggle("hi", k === i));
              },
            },
            h("span", { class: "ap-r1" }, h("b", {}, r[0]), h("i", {}, r[1])),
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
            r[7] & FLAG_PROC
              ? h("em", { class: "ok" }, r[7] & FLAG_ILS ? "ILS · RNAV" : "IAP")
              : h("em", {}, "GPS app."),
          ),
        ),
      );
      res.querySelector("button.hi")?.scrollIntoView({ block: "nearest" });
    };
    const run = async () => {
      const my = ++seq;
      const q = inp.value.trim();
      const rows = q ? await searchAirports(q, 8) : await suggest();
      if (my !== seq) return; // a newer keystroke already ran
      shown = rows;
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
        if (shown[hi]) commit(shown[hi]);
      } else if (e.key === "Escape") {
        inp.value = "";
        seq++;
        clear(res);
      }
    });
    wrap.append(inp, res);
    return { el: wrap, input: inp };
  }

  /** The chosen airport as a card (with a Change button) */
  private airportCard(role: string, icao: string, onChange: () => void) {
    const r = this.rows[icao];
    return h(
      "div",
      { class: "ap-card" },
      h("span", { class: "ap-role" }, role),
      h("b", { class: "ap-icao" }, icao),
      h(
        "div",
        { class: "ap-name" },
        h("span", {}, r ? r[1] : ""),
        h(
          "small",
          {},
          r ? [r[2], r[3], `${r[6]} ft`].filter(Boolean).join(" · ") : "",
        ),
      ),
      r
        ? h(
            "em",
            { class: r[7] & FLAG_PROC ? "ok" : "" },
            r[7] & FLAG_PROC
              ? r[7] & FLAG_ILS
                ? "Official ILS · RNAV"
                : "Official IAPs"
              : "Generated GPS approaches",
          )
        : null,
      h("button", { class: "btn ghost sm", onclick: onChange }, "Change"),
    );
  }

  private editing: "dep" | "arr" | null = null;
  private renderAirports() {
    const st = this.st;
    this.main.append(
      this.h2(
        "Where do you fly?",
        st.world === "real"
          ? "Pick the departure, then the destination. Any real airport — official FAA procedures in the US, generated RNAV (GPS) approaches everywhere else."
          : "Fly anywhere in the real world, or in the compact training region used by the syllabus.",
      ),
    );
    this.main.append(
      this.choice(
        st.world,
        [
          {
            v: "real" as const,
            title: "Real world",
            icon: I.map,
            desc: "6,900+ airports with real runways, navaids and terrain. FAA procedures, SIDs, STARs and ILS in the US.",
          },
          {
            v: "training" as const,
            title: "Training region",
            icon: I.learn,
            desc: "Ardent Islands: compact fictional region used by the syllabus — every approach type within 40 NM.",
          },
        ],
        (v) => {
          st.world = v;
          if (v === "training") { void this.ensureRegion(); if (!currentRegion()) { sanitizeSetup(st); this.applyAtisDefaults(); } }
        },
        "two",
      ),
    );
    if (st.world !== "real") {
      if (currentRegion()) return; // still the real world: the training region loads first
      this.main.append(
        h(
          "div",
          { class: "fs-train-ap" },
          h("div", { class: "section-t" }, "Training airports"),
          h(
            "div",
            { class: "fs-train-list" },
            ...AIRPORTS.map((a) =>
              h(
                "span",
                {},
                h("b", {}, a.icao),
                h(
                  "em",
                  {},
                  a.name.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()),
                ),
                h("small", {}, `RWY ${a.runways.map((r) => r.id).join(" · ")}`),
              ),
            ),
          ),
          h(
            "p",
            { class: "muted" },
            "The departure runway is chosen in Departure, the destination approach in the next steps.",
          ),
        ),
      );
      return;
    }
    for (const k of ["dep", "arr"] as const)
      if (st[k] && !this.rows[st[k]])
        void airportRow(st[k]).then((r) => {
          if (r) {
            this.rows[r[0]] = r;
            if (this.step === S_AIRPORTS) this.renderMain();
          }
        });
    const box = h("div", { class: "ap-flow" });
    const depRow = this.rows[st.dep];
    // 1 — departure
    if (!st.dep || this.editing === "dep") {
      const p = this.airportPicker(
        "Departure",
        "Departure — ICAO, name or city (e.g. KSFO, San Francisco)",
        (r) => {
          st.dep = r[0];
          this.editing = st.arr ? null : "arr";
          if (
            st.arr &&
            this.rows[st.arr] &&
            rowDistanceNm(r, this.rows[st.arr]) > MAX_REGION_NM
          ) {
            st.arr = "";
            this.editing = "arr";
          }
          this.airportsChanged();
        },
        () => searchAirports("", 8),
        "Popular IFR airports",
      );
      box.append(
        h(
          "div",
          { class: "ap-stepl" },
          h("span", { class: "n" }, "1"),
          "Departure",
        ),
        p.el,
      );
      setTimeout(() => p.input.focus(), 30);
    } else
      box.append(
        this.airportCard("From", st.dep, () => {
          this.editing = "dep";
          this.renderMain();
        }),
      );
    // 2 — destination
    if (st.dep && this.editing !== "dep") {
      if (!st.arr || this.editing === "arr") {
        const p = this.airportPicker(
          "Destination",
          "Destination — ICAO, name or city (e.g. KOAK, Oakland)",
          (r) => {
            if (depRow && rowDistanceNm(depRow, r) > MAX_REGION_NM) {
              this.loadErr = `${r[0]} is ${Math.round(rowDistanceNm(depRow, r))} NM from ${st.dep}: pick a destination within ${MAX_REGION_NM} NM.`;
              this.renderMain();
              return;
            }
            st.arr = r[0];
            this.editing = null;
            this.airportsChanged();
          },
          () =>
            depRow
              ? nearbyAirports(depRow[4], depRow[5], 8, depRow[0])
              : searchAirports("", 8),
          `Near ${st.dep}`,
          depRow,
        );
        box.append(
          h(
            "div",
            { class: "ap-stepl" },
            h("span", { class: "n" }, "2"),
            "Destination",
            h(
              "button",
              {
                class: "linkbtn",
                onclick: () => {
                  st.arr = st.dep;
                  this.editing = null;
                  this.airportsChanged();
                },
              },
              `Same as departure (local flight at ${st.dep})`,
            ),
          ),
          p.el,
        );
        if (st.dep) setTimeout(() => p.input.focus(), 30);
      } else
        box.append(
          this.airportCard("To", st.arr, () => {
            this.editing = "arr";
            this.loadErr = "";
            this.renderMain();
          }),
        );
    }
    this.main.append(box);
    // route summary + load state
    const arrRow = this.rows[st.arr];
    if (st.dep && st.arr && depRow && arrRow && !this.editing) {
      const d = rowDistanceNm(depRow, arrRow);
      const brg =
        (bearingDeg(
          { lat: depRow[4], lon: depRow[5] },
          { lat: arrRow[4], lon: arrRow[5] },
        ) +
          360) %
        360;
      this.main.append(
        h(
          "div",
          { class: "ap-route" },
          h(
            "div",
            {},
            h("small", {}, "Direct distance"),
            h("b", {}, st.dep === st.arr ? "Local" : `${Math.round(d)} NM`),
          ),
          h(
            "div",
            {},
            h("small", {}, "True course"),
            h("b", {}, st.dep === st.arr ? "—" : `${pad3(brg)}°`),
          ),
          h(
            "div",
            {},
            h("small", {}, "Time, direct"),
            h(
              "b",
              {},
              st.dep === st.arr
                ? "20–40 min"
                : `${Math.round((d / 120) * 60 + 15)} min`,
            ),
          ),
        ),
      );
    }
    const key = `${st.dep}|${st.arr}`;
    const ready = !!currentRegion() && this.loadedKey === key;
    if (this.loading) this.main.append(this.progressRow());
    else if (this.loadErr)
      this.main.append(
        h(
          "div",
          { class: "ap-status bad" },
          svgIcon(I.warning, 15),
          h("span", {}, this.loadErr),
          st.dep && st.arr
            ? h(
                "button",
                {
                  class: "btn sm",
                  onclick: () => void this.ensureRegion(true),
                },
                "Retry",
              )
            : null,
        ),
      );
    else if (ready) {
      const reg = currentRegion()!;
      const apps = APPROACHES.filter((a) => a.airport === st.arr);
      const terms = TERMINAL.filter(
        (p) => p.airport === st.dep || p.airport === st.arr,
      ).length;
      this.main.append(
        h(
          "div",
          { class: "ap-status ready" },
          h("span", { class: "ok" }, svgIcon(I.check, 15)),
          h(
            "span",
            {},
            `Ready · ${apps.length} approach${apps.length === 1 ? "" : "es"} at ${st.arr}${apps.some((a) => a.source === "Generated") ? " (generated)" : ""}${terms ? ` · ${terms} SIDs/STARs` : ""} · ${AIRPORTS.length} airports in the region · var ${Math.abs(reg.magVar).toFixed(1)}° ${reg.magVar >= 0 ? "E" : "W"} · ${this.terrainNote}`,
          ),
        ),
      );
    }
  }
  private airportsChanged() {
    this.loadErr = "";
    this.save();
    if (this.st.dep && this.st.arr && !this.editing) void this.ensureRegion();
    else this.render();
  }

  private h2(t: string, sub: string) {
    return h(
      "div",
      { class: "fs-h" },
      h("h2", {}, t),
      sub ? h("p", { class: "muted" }, sub) : null,
    );
  }

  // ---------------------------------------------------------------- selects with the right scope
  /** runways of the departure airport (training region: every airport, grouped) */
  private runwayOptions(): (
    | { group: string; opts: [string, string][] }
    | [string, string]
  )[] {
    const st = this.st;
    const opt = (a: (typeof AIRPORTS)[number]) =>
      [...a.runways]
        .sort((x, y) => x.id.localeCompare(y.id))
        .map(
          (r) =>
            [
              `${a.icao}|${r.id}`,
              `${a.icao} RWY ${r.id} · ${r.lengthFt.toLocaleString("en-US")} ft`,
            ] as [string, string],
        );
    const dep = AIRPORTS.find(
      (a) => a.icao === (st.world === "real" ? st.dep : st.rwy.airport),
    );
    if (st.world === "real") return dep ? opt(dep) : [];
    return [
      ...(dep ? [{ group: dep.icao, opts: opt(dep) }] : []),
      {
        group: "Other airports",
        opts: AIRPORTS.filter((a) => a !== dep).flatMap(opt),
      },
    ];
  }
  /** approaches: destination first (precision first), then the departure / other airports */
  private approachOptions(
    allowNone: boolean,
  ): ({ group: string; opts: [string, string][] } | [string, string])[] {
    const st = this.st;
    const ok = (a: Approach) => st.equipment.gps || a.type !== "RNAV";
    const sort = (x: Approach[]) =>
      x.sort(
        (a, b) =>
          APPROACH_RANK[a.type] - APPROACH_RANK[b.type] ||
          a.runway.localeCompare(b.runway),
      );
    const o = (a: Approach) =>
      [a.id, `${a.airport} ${a.name}`] as [string, string];
    const destIcao =
      st.world === "real"
        ? st.arr
        : st.arrival.approachId
          ? getApproach(st.arrival.approachId).airport
          : "";
    const dest = sort(
      APPROACHES.filter((a) => a.airport === destIcao && ok(a)),
    );
    const others =
      st.world === "real"
        ? [] // real world: only the destination's procedures (the region holds dozens of airports)
        : APPROACHES.filter((a) => a.airport !== destIcao && ok(a)).sort(
            (a, b) =>
              a.airport.localeCompare(b.airport) ||
              APPROACH_RANK[a.type] - APPROACH_RANK[b.type],
          );
    return [
      ...(allowNone
        ? [["", "No approach (end at the last fix)"] as [string, string]]
        : []),
      ...(dest.length
        ? [{ group: `${destIcao} (destination)`, opts: dest.map(o) }]
        : []),
      ...(others.length
        ? [
            {
              group:
                st.world === "real"
                  ? `${st.dep} (departure)`
                  : "Other airports",
              opts: others.map(o),
            },
          ]
        : []),
    ];
  }

  // ---------------------------------------------------------------- steps
  private renderMain() {
    clear(this.main);
    const st = this.st;
    if (
      this.step > 0 &&
      this.needsRegion() &&
      [S_START, S_ROUTE, S_BRIEF].includes(this.step)
    ) {
      this.main.append(this.h2(this.stepTitle(this.step), ""));
      if (this.loadErr)
        this.main.append(
          h(
            "div",
            { class: "ap-status bad" },
            svgIcon(I.warning, 15),
            h("span", {}, this.loadErr),
            h(
              "button",
              { class: "btn sm", onclick: () => this.go(S_AIRPORTS) },
              "Back to the airports",
            ),
          ),
        );
      else if (!st.dep || !st.arr)
        // nothing is loading yet: an empty state that leads back to the airports, no spinner
        this.main.append(
          h(
            "div",
            { class: "fs-empty" },
            svgIcon(I.pin, 20),
            h(
              "div",
              {},
              h("b", {}, "Choose the airports first"),
              h(
                "p",
                {},
                "This step uses the runways and procedures of your departure and destination.",
              ),
            ),
            h(
              "button",
              { class: "btn", onclick: () => this.go(S_AIRPORTS) },
              "Choose airports",
            ),
          ),
        );
      else
        this.main.append(
          this.progressRow(this.loadLabel()),
          h(
            "p",
            { class: "muted fs-wait" },
            "This step needs the procedures of the region. It appears as soon as they are loaded.",
          ),
        );
      if (!this.loading && !this.loadErr && st.dep && st.arr)
        void this.ensureRegion();
      return;
    }
    switch (this.step) {
      case S_AIRPORTS:
        this.renderAirports();
        break;
      case S_TYPE:
        this.main.append(
          this.h2(
            "What kind of flight?",
            "Pick a type — the following steps adapt to it. You can fly at any time from the bottom bar.",
          ),
        );
        this.main.append(
          this.choice(
            st.type,
            [
              {
                v: "route" as FlightType,
                cls: "ft-route",
                icon: I.route,
                title: "IFR flight A → B",
                desc: "Depart, fly a SID, a route you build fix by fix, a STAR, then an approach at the destination.",
              },
              {
                v: "approach" as FlightType,
                cls: "ft-approach",
                icon: I.approach,
                title: "Approach practice",
                desc: "Start on final or before the IAF and fly one approach — ILS, LOC, LDA, VOR, NDB, RNAV.",
              },
              {
                v: "hold" as FlightType,
                cls: "ft-hold",
                icon: I.hold,
                title: "Holding practice",
                desc: "A published hold or any fix, inbound course and turns, with the entry to work out.",
              },
              {
                v: "free" as FlightType,
                cls: "ft-free",
                icon: I.plane,
                title: "Free flight",
                desc: "Start anywhere with your aircraft and weather. No plan, no grading.",
              },
            ],
            (v) => this.applyType(v),
            "big",
          ),
        );
        {
          const saved = circuitStore.list();
          if (saved.length)
            this.main.append(
              h(
                "p",
                { class: "muted fs-foot-note" },
                `You also have ${saved.length} saved IFR circuit${saved.length === 1 ? "" : "s"} in the Flight Center → IFR circuits.`,
              ),
            );
        }
        break;
      case 2: {
        this.main.append(
          this.h2(
            "Aircraft & instruments",
            "Choose the panel and what is actually installed. Missing equipment is really missing: no GPS means VOR/NDB navigation only.",
          ),
        );
        this.main.append(h("div", { class: "section-t" }, "Cockpit"));
        this.main.append(
          this.choice(
            st.cockpit,
            [
              {
                v: "g1000" as const,
                cls: "ck-g1000",
                icon: I.screen,
                title: "G1000 glass",
                desc: "PFD + MFD, synthetic vision, GFC 700 autopilot.",
              },
              {
                v: "steam" as const,
                cls: "ck-steam",
                icon: I.gauge,
                title: "Steam gauges",
                desc: "Six-pack, CDI/GS, RMI, KAP 140, radio stack.",
              },
              {
                v: "airliner" as const,
                cls: "ck-airliner",
                icon: I.plane,
                title: "Airliner",
                desc: "Boeing-style PFD/ND with MCP.",
              },
            ],
            (v) => (st.cockpit = v),
            "ck three",
          ),
        );
        this.main.append(h("div", { class: "section-t" }, "Equipment presets"));
        this.main.append(
          h(
            "div",
            { class: "fs-chips eq" },
            ...EQUIP_PRESETS.map((p) =>
              h(
                "button",
                {
                  class:
                    JSON.stringify(p.eq) === JSON.stringify(st.equipment)
                      ? "on"
                      : "",
                  "aria-pressed": String(
                    JSON.stringify(p.eq) === JSON.stringify(st.equipment),
                  ),
                  onclick: () => {
                    st.equipment = { ...p.eq };
                    if (p.cockpit) st.cockpit = p.cockpit;
                    this.changed();
                  },
                },
                h("b", {}, p.name),
                h("span", {}, p.desc),
              ),
            ),
          ),
        );
        this.main.append(
          h("div", { class: "section-t" }, "Installed avionics"),
        );
        const tog = (k: keyof Equipment, title: string, desc: string) =>
          h(
            "label",
            { class: `fs-tog${st.equipment[k] ? " on" : ""}` },
            h("input", {
              type: "checkbox",
              checked: st.equipment[k],
              onchange: (e: Event) => {
                st.equipment[k] = (e.target as HTMLInputElement).checked;
                if (
                  k === "gps" &&
                  !st.equipment.gps &&
                  st.arrival.approachId &&
                  getApproach(st.arrival.approachId).type === "RNAV"
                )
                  st.arrival.approachId = null;
                this.changed();
              },
            }),
            h("div", {}, h("b", {}, title), h("span", {}, desc)),
          );
        this.main.append(
          h(
            "div",
            { class: "fs-togs" },
            tog(
              "gps",
              "GPS / WAAS navigator",
              "Flight plan, Direct-To, RNAV approaches, LPV/LNAV-VNAV glidepath.",
            ),
            tog(
              "ap",
              "Autopilot",
              "GFC 700 / KAP 140 style. Off = everything hand-flown.",
            ),
            tog(
              "nav2",
              "Second NAV receiver",
              "VOR 2 for cross-radials and the RMI green needle.",
            ),
            tog("dme", "DME", "Slant-range distance from VOR/DME and ILS/DME."),
            tog(
              "adf",
              "ADF",
              "NDB bearing pointer — required for the NDB approach.",
            ),
            st.cockpit === "g1000"
              ? h(
                  "label",
                  { class: `fs-tog${st.svt ? " on" : ""}` },
                  h("input", {
                    type: "checkbox",
                    checked: st.svt,
                    onchange: (e: Event) => {
                      st.svt = (e.target as HTMLInputElement).checked;
                      this.changed();
                    },
                  }),
                  h(
                    "div",
                    {},
                    h("b", {}, "Synthetic vision"),
                    h(
                      "span",
                      {},
                      "Terrain, runways and flight-path marker on the G1000 PFD.",
                    ),
                  ),
                )
              : null,
          ),
        );
        break;
      }
      case S_START:
        this.renderStart();
        break;
      case S_ROUTE:
        if (st.type === "approach") this.renderApproachStep();
        else if (st.type === "hold") this.renderHoldStep();
        else this.renderRouteStep();
        break;
      case 5:
        this.renderWeather();
        break;
      case S_TRAIN:
        this.renderTraining();
        break;
      case S_BRIEF:
        this.renderBriefing();
        break;
    }
  }

  private renderStart() {
    const st = this.st;
    const kinds = this.startKinds();
    if (!kinds.includes(st.start)) st.start = kinds[0];
    const dep = st.world === "real" ? st.dep : st.rwy.airport;
    this.main.append(
      this.h2(
        this.stepTitle(S_START),
        st.type === "approach"
          ? "Where the approach starts. Choose the approach itself in the next step."
          : st.world === "real"
            ? `Where the flight starts at or near ${st.dep}.`
            : "Where does the flight start?",
      ),
    );
    const all: Record<
      StartKind,
      { v: StartKind; icon: string; title: string; desc: string }
    > = {
      runway: {
        v: "runway",
        icon: I.depart,
        title: "On a runway",
        desc: "Lined up, ready for take-off.",
      },
      air:
        st.type === "approach"
          ? {
              v: "air",
              icon: I.pin,
              title: "Before the IAF",
              desc: "A few miles outside the initial approach fix: fly the whole procedure.",
            }
          : {
              v: "air",
              icon: I.pin,
              title: "In flight near a fix",
              desc: "Choose a fix, a bearing and distance from it, altitude and speed.",
            },
      final: {
        v: "final",
        icon: I.approach,
        title: "On final",
        desc: "Established on the final approach course, a few miles out.",
      },
    };
    this.main.append(
      this.choice(
        st.start,
        kinds.map((k) => all[k]),
        (v) => {
          st.start = v;
          if (st.type === "approach" && v === "air") this.placeBeforeIaf();
        },
        "two",
      ),
    );
    if (st.type === "approach") return;
    const box = h("div", { class: "cb-card cb-row", style: "margin-top:14px" });
    if (st.start === "runway") {
      const rwSel = this.sel(
        `${st.rwy.airport}|${st.rwy.runway}`,
        this.runwayOptions(),
        (v) => {
          const [a, r] = v.split("|");
          st.rwy.airport = a;
          st.rwy.runway = r;
        },
      );
      box.append(
        this.f("Runway", rwSel),
        this.f(
          "Initial climb (ft)",
          this.num(st.rwy.initialAlt, (v) => (st.rwy.initialAlt = v), {
            min: 1500,
            max: 12000,
            step: 500,
          }),
        ),
      );
      this.main.append(box);
      const note = this.tailNote(st.rwy.airport, st.rwy.runway, (r) => {
        st.rwy.runway = r;
        this.changed();
      });
      if (note) this.main.append(note);
      if (st.type === "route") this.renderSid(dep);
    } else {
      const fx = this.fixInput(st.air.fix, (v) => (st.air.fix = v), {
        width: 130,
      });
      box.append(
        this.f("Reference fix", fx.el),
        this.f(
          "Bearing from fix (°)",
          this.num(st.air.bearing, (v) => (st.air.bearing = v % 360), {
            min: 0,
            max: 359,
            step: 5,
          }),
        ),
        this.f(
          "Distance (NM)",
          this.num(st.air.distNm, (v) => (st.air.distNm = v), {
            min: 1,
            max: 40,
            step: 1,
          }),
        ),
        this.f(
          "Altitude (ft)",
          this.num(st.air.altFt, (v) => (st.air.altFt = v), {
            min: 1500,
            max: 12000,
            step: 100,
          }),
        ),
        this.f(
          "Airspeed (KIAS)",
          this.num(st.air.iasKt, (v) => (st.air.iasKt = v), {
            min: 65,
            max: 130,
            step: 5,
          }),
        ),
      );
      box.append(
        h(
          "p",
          { class: "muted fs-hint" },
          "The aircraft starts heading toward the fix.",
        ),
      );
      this.main.append(box);
    }
  }

  /** published departure from the take-off runway (real world, US) */
  private renderSid(dep: string) {
    const st = this.st;
    const sids = sidsFor(dep, st.rwy.runway);
    if (!TERMINAL.length) return;
    if (st.sid && !sids.some((p) => p.id === st.sid!.id)) st.sid = null;
    this.main.append(h("div", { class: "section-t" }, "Departure (SID)"));
    if (!sids.length) {
      this.main.append(
        h(
          "p",
          { class: "muted fs-hint" },
          `No published departure from ${dep} RWY ${st.rwy.runway} — radar vectors to the first fix.`,
        ),
      );
      return;
    }
    this.main.append(
      this.terminalChooser(
        "SID",
        sids,
        st.sid ?? null,
        st.rwy.runway,
        (v) => (st.sid = v),
        "None — radar vectors",
      ),
    );
  }
  /** published arrival into the destination (real world, US) */
  private renderStar() {
    const st = this.st;
    if (!TERMINAL.length) return;
    // the arrivals that start on the side the flight comes from are listed first
    const from = AIRPORTS.find((a) => a.icao === st.dep);
    const entry = (p: TerminalProc) =>
      from
        ? Math.min(
            ...[p.common[0]?.fix, ...p.enr.map((e) => e.legs[0]?.fix)]
              .filter((f): f is NonNullable<typeof f> => !!f)
              .map((f) => distanceNm(from, f)),
            9999,
          )
        : 0;
    const stars = [...starsFor(st.arr)].sort((a, b) => entry(a) - entry(b));
    if (st.star && !stars.some((p) => p.id === st.star!.id)) st.star = null;
    this.main.append(h("div", { class: "section-t" }, "Arrival (STAR)"));
    if (!stars.length) {
      this.main.append(
        h(
          "p",
          { class: "muted fs-hint" },
          `No published arrival into ${st.arr}.`,
        ),
      );
      return;
    }
    const rw = st.arrival.approachId
      ? getApproach(st.arrival.approachId).runway
      : null;
    this.main.append(
      this.terminalChooser(
        "STAR",
        stars,
        st.star ?? null,
        rw,
        (v) => (st.star = v),
        "None — direct / vectors",
      ),
    );
  }
  private terminalChooser(
    kind: "SID" | "STAR",
    procs: TerminalProc[],
    cur: { id: string; transition: string | null } | null,
    runway: string | null,
    set: (v: { id: string; transition: string | null } | null) => void,
    none: string,
  ) {
    const p = cur ? procs.find((x) => x.id === cur.id) : undefined;
    const rwys = (x: TerminalProc) =>
      x.rwy
        .map((r) => r.name.replace(/^RW/, ""))
        .filter((r) => r && r !== "ALL")
        .join(", ");
    const card = h(
      "div",
      { class: "cb-card fs-term" },
      h(
        "div",
        { class: "cb-row" },
        this.f(
          kind === "SID" ? "Departure" : "Arrival",
          this.sel(
            cur?.id ?? "",
            [
              ["", none],
              ...procs.map(
                (x) =>
                  [
                    x.id,
                    `${x.id}${rwys(x) ? ` · RWY ${rwys(x)}` : ""} · ${x.enr.length} transition${x.enr.length === 1 ? "" : "s"}`,
                  ] as [string, string],
              ),
            ],
            (v) => set(v ? { id: v, transition: null } : null),
          ),
        ),
        p
          ? this.f(
              "Transition",
              this.sel(
                cur?.transition ?? "",
                [
                  [
                    "",
                    p.enr.length
                      ? kind === "SID"
                        ? "None — end of the common route"
                        : "None — start at the common route"
                      : "None published",
                  ],
                  ...p.enr.map((t) => [t.name, t.name] as [string, string]),
                ],
                (v) => set({ id: p.id, transition: v || null }),
              ),
            )
          : null,
      ),
    );
    if (p)
      card.append(
        h(
          "div",
          { class: "fs-term-seq" },
          h("small", {}, "Fixes flown"),
          h(
            "span",
            {},
            terminalSummary(p, runway, cur?.transition ?? null)
              .replace(/^[^:]*:\s*/, "")
              .split(" ")
              .join(" → "),
          ),
        ),
      );
    return card;
  }

  private renderRouteStep() {
    const st = this.st;
    this.main.append(
      this.h2(
        "Route & arrival",
        "Build the route fix by fix, set the cruise altitude and choose the arrival.",
      ),
    );
    // route strip: departure … fixes … arrival, chips draggable
    const chips = h("div", { class: "fs-route" });
    const depCap =
      st.start === "runway"
        ? `${st.rwy.airport} ${st.rwy.runway}`
        : `${st.air.distNm} NM ${pad3(st.air.bearing)}° of ${st.air.fix}`;
    chips.append(
      h(
        "span",
        { class: "fs-cap", title: "Departure" },
        svgIcon(I.depart, 13),
        depCap,
      ),
    );
    if (st.sid && st.start === "runway")
      chips.append(
        h(
          "span",
          { class: "fs-cap proc", title: "Published departure" },
          `${st.sid.id}${st.sid.transition ? `.${st.sid.transition}` : ""}`,
        ),
      );
    let dragFrom = -1;
    st.route.forEach((id, i) => {
      const chip = h(
        "span",
        { class: "fs-wp", draggable: "true", title: "Drag to reorder" },
        h("span", { class: "grip", "aria-hidden": "true" }, "⋮"),
        h("b", {}, id),
        h(
          "button",
          {
            class: "x",
            title: `Remove ${id}`,
            "aria-label": `Remove ${id}`,
            onclick: () => {
              st.route.splice(i, 1);
              this.changed();
            },
          },
          "✕",
        ),
      );
      chip.addEventListener("dragstart", (e) => {
        dragFrom = i;
        chip.classList.add("dragging");
        e.dataTransfer?.setData("text/plain", id);
      });
      chip.addEventListener("dragend", () => chip.classList.remove("dragging"));
      chip.addEventListener("dragover", (e) => {
        if (dragFrom >= 0) {
          e.preventDefault();
          chip.classList.add("drop");
        }
      });
      chip.addEventListener("dragleave", () => chip.classList.remove("drop"));
      chip.addEventListener("drop", (e) => {
        e.preventDefault();
        if (dragFrom < 0 || dragFrom === i) return;
        const [x] = st.route.splice(dragFrom, 1);
        st.route.splice(i, 0, x);
        dragFrom = -1;
        this.changed();
      });
      chips.append(chip);
    });
    if (!st.route.length)
      chips.append(
        h(
          "span",
          { class: "fs-route-empty" },
          st.sid || st.star
            ? "Direct between the procedures"
            : "Direct — add fixes below",
        ),
      );
    if (st.star)
      chips.append(
        h(
          "span",
          { class: "fs-cap proc", title: "Published arrival" },
          `${st.star.transition ? `${st.star.transition}.` : ""}${st.star.id}`,
        ),
      );
    const ap = st.arrival.approachId
      ? getApproach(st.arrival.approachId)
      : null;
    chips.append(
      h(
        "span",
        { class: "fs-cap", title: "Arrival" },
        svgIcon(I.approach, 13),
        ap ? `${ap.airport} ${ap.name.replace(/ or LOC/, "")}` : "No approach",
      ),
    );
    const iafs = ap
      ? [
          ...new Set(
            ap.transitions.map((t) => t.legs[0]?.fix.ident).filter(Boolean),
          ),
        ].slice(0, 3)
      : [];
    const fx = this.fixInput("", (v) => st.route.push(v), {
      ph: iafs.length
        ? `Add a fix, navaid or airport (e.g. ${iafs.join(", ")})`
        : "Add a fix, navaid or airport",
      clearOnAdd: true,
    });
    fx.el.classList.add("wide");
    this.main.append(
      h(
        "div",
        { class: "section-t" },
        `Route · ${st.route.length} fix${st.route.length === 1 ? "" : "es"}`,
      ),
      chips,
      h(
        "div",
        { class: "fs-addrow" },
        fx.el,
        h("button", { class: "btn", onclick: () => fx.commit() }, "+ Add"),
        h(
          "button",
          {
            class: "btn ghost",
            onclick: () => {
              this.suggestRoute();
              this.changed();
            },
            title: "Direct route to the first IAF of the chosen approach",
          },
          "Suggest",
        ),
      ),
    );
    this.main.append(
      h(
        "div",
        { class: "cb-row", style: "margin-top:12px" },
        this.f(
          "Cruise altitude (ft)",
          this.num(st.cruise, (v) => (st.cruise = v), {
            min: 2000,
            max: 12000,
            step: 500,
          }),
        ),
      ),
    );
    if (st.world === "real") this.renderStar();
    // arrival approach
    this.main.append(h("div", { class: "section-t" }, "Approach"));
    this.main.append(
      h(
        "div",
        { class: "cb-card cb-row" },
        this.f(
          "Approach",
          this.sel(
            st.arrival.approachId ?? "",
            this.approachOptions(true),
            (v) => {
              st.arrival.approachId = v || null;
              st.arrival.transition = v
                ? (getApproach(v).transitions[0]?.name ?? null)
                : null;
              if (v) st.final.approachId = v;
            },
          ),
        ),
        ap
          ? this.f(
              "Transition",
              this.sel(
                st.arrival.transition ?? "",
                [
                  ["", "Vectors to final"],
                  ...ap.transitions.map(
                    (t) => [t.name, t.name] as [string, string],
                  ),
                ],
                (v) => (st.arrival.transition = v || null),
              ),
            )
          : null,
        ap
          ? this.f(
              "Outcome",
              this.sel(
                st.arrival.outcome,
                [
                  ["land", "Land"],
                  ["missed", "Missed approach"],
                ],
                (v) => (st.arrival.outcome = v),
              ),
            )
          : null,
      ),
    );
    this.approachExtras(ap);
    // optional hold
    const hd = st.hold;
    this.main.append(
      h(
        "label",
        { class: `fs-tog${hd.enabled ? " on" : ""}`, style: "margin-top:12px" },
        h("input", {
          type: "checkbox",
          checked: hd.enabled,
          onchange: (e: Event) => {
            hd.enabled = (e.target as HTMLInputElement).checked;
            this.changed();
          },
        }),
        h(
          "div",
          {},
          h("b", {}, "Hold before the approach"),
          h("span", {}, "ATC holds you at a fix (expect further clearance)."),
        ),
      ),
    );
    if (hd.enabled) this.holdEditor();
  }

  /** tailwind note, raw-data note and plate preview under an approach select */
  private approachExtras(ap: Approach | null) {
    const st = this.st;
    if (!ap) return;
    const note = this.tailNote(ap.airport, ap.runway, (rw) => {
      const alt = approachInUse(
        ap.airport,
        this.wx(),
        (a) => a.runway === rw && (st.equipment.gps || a.type !== "RNAV"),
      );
      if (alt) {
        st.arrival.approachId = alt.id;
        st.final.approachId = alt.id;
        st.arrival.transition = alt.transitions[0]?.name ?? null;
        this.changed();
      }
    });
    if (note) this.main.append(note);
    if (!st.equipment.gps && ap.type !== "RNAV")
      this.main.append(
        h(
          "p",
          { class: "muted fs-hint" },
          "No GPS: transitions are flown on raw data (VOR/DME/ADF) — use the plate.",
        ),
      );
    this.main.append(this.platePreview(ap));
  }

  private renderApproachStep() {
    const st = this.st;
    this.main.append(
      this.h2(
        "Approach",
        st.start === "final"
          ? "Choose the approach and how far out you start on final."
          : "Choose the approach and the transition you fly from the IAF.",
      ),
    );
    const id =
      st.start === "final"
        ? st.final.approachId
        : (st.arrival.approachId ?? st.final.approachId);
    let ap: Approach | null = null;
    try {
      ap = getApproach(id);
    } catch {
      ap = null;
    }
    this.main.append(
      h(
        "div",
        { class: "cb-card cb-row" },
        this.f(
          "Approach",
          this.sel(ap?.id ?? "", this.approachOptions(false), (v) => {
            st.final.approachId = v;
            st.arrival.approachId = v;
            st.arrival.transition = getApproach(v).transitions[0]?.name ?? null;
            if (st.start === "air") this.placeBeforeIaf();
          }),
        ),
        ap && st.start === "air"
          ? this.f(
              "Transition (IAF)",
              this.sel(
                st.arrival.transition ?? "",
                ap.transitions.map((t) => [t.name, t.name] as [string, string]),
                (v) => {
                  st.arrival.transition = v || null;
                  this.placeBeforeIaf();
                },
              ),
            )
          : null,
        st.start === "final"
          ? this.f(
              "Start distance from the MAP (NM)",
              this.num(st.final.distNm, (v) => (st.final.distNm = v), {
                min: 3,
                max: 15,
                step: 1,
              }),
            )
          : null,
        this.f(
          "Outcome",
          this.sel(
            st.arrival.outcome,
            [
              ["land", "Land"],
              ["missed", "Missed approach"],
            ],
            (v) => (st.arrival.outcome = v),
          ),
        ),
      ),
    );
    if (ap && st.start === "air" && !ap.transitions.length)
      this.main.append(
        h(
          "div",
          { class: "fs-note warn" },
          svgIcon(I.warning, 14),
          h(
            "span",
            {},
            "This approach has no published transition: you start on vectors to final.",
          ),
        ),
      );
    this.approachExtras(ap);
  }
  /** approach practice "before the IAF": start outside the IAF of the chosen transition, heading toward it */
  private placeBeforeIaf() {
    const st = this.st;
    let ap: Approach;
    try {
      ap = getApproach(st.arrival.approachId ?? st.final.approachId);
    } catch {
      return;
    }
    st.arrival.approachId = ap.id;
    const tr =
      ap.transitions.find((t) => t.name === st.arrival.transition) ??
      ap.transitions[0];
    if (!tr) return;
    st.arrival.transition = tr.name;
    const iaf = tr.legs[0];
    const next = tr.legs[1]?.fix ?? ap.final[0]?.fix;
    st.air = {
      fix: iaf.fix.ident,
      bearing: next ? Math.round(bearingDeg(next, iaf.fix) + 360) % 360 : 0,
      distNm: 6,
      altFt: Math.max(2000, Math.ceil((iaf.altMin ?? 3000) / 100) * 100),
      iasKt: 95,
    };
  }

  private renderHoldStep() {
    this.main.append(
      this.h2(
        "Holding",
        "Pick a published hold or define the hold you will be cleared for.",
      ),
    );
    this.holdEditor();
  }
  private holdEditor() {
    const st = this.st;
    const hd = st.hold;
    const pub = publishedHolds(
      st.world === "real"
        ? st.arr
        : st.arrival.approachId
          ? getApproach(st.arrival.approachId).airport
          : "",
    );
    if (pub.length)
      this.main.append(
        h("div", { class: "section-t" }, "Published holds"),
        h(
          "div",
          { class: "fs-holds" },
          ...pub.map((p) =>
            h(
              "button",
              {
                class: `fs-hold${hd.fix === p.fix && hd.inbound === p.inbound && hd.turn === p.turn ? " on" : ""}`,
                onclick: () => {
                  Object.assign(hd, {
                    fix: p.fix,
                    inbound: p.inbound,
                    turn: p.turn,
                    legMin: p.legMin,
                    alt: p.alt,
                  });
                  if (st.type === "hold") st.air.fix = p.fix;
                  this.changed();
                },
              },
              h("b", {}, p.fix),
              h(
                "span",
                {},
                `${pad3(p.inbound)}° inbound · ${p.turn === "R" ? "right" : "left"} · ${p.alt} ft`,
              ),
              h("small", {}, p.where),
            ),
          ),
        ),
      );
    this.main.append(
      h(
        "div",
        { class: "section-t" },
        pub.length ? "Or define any hold" : "Hold",
      ),
    );
    const fx = this.fixInput(
      hd.fix,
      (v) => {
        hd.fix = v;
        if (st.type === "hold") st.air.fix = v;
      },
      { width: 130 },
    );
    this.main.append(
      h(
        "div",
        { class: "cb-card cb-row" },
        this.f("Hold fix", fx.el),
        this.f(
          "Inbound course (°)",
          this.num(hd.inbound, (v) => (hd.inbound = v || 360), {
            min: 1,
            max: 360,
            step: 5,
          }),
        ),
        this.f(
          "Turns",
          this.sel(
            hd.turn,
            [
              ["R", "Right (standard)"],
              ["L", "Left"],
            ],
            (v) => (hd.turn = v),
          ),
        ),
        this.f(
          "Leg",
          this.sel(
            String(hd.legMin),
            [
              ["1", "1 min"],
              ["1.5", "1.5 min"],
              ["2", "2 min"],
            ],
            (v) => (hd.legMin = Number(v)),
          ),
        ),
        this.f(
          "Altitude (ft)",
          this.num(hd.alt, (v) => (hd.alt = v), {
            min: 2000,
            max: 12000,
            step: 500,
          }),
        ),
        this.f(
          "Circuits",
          this.num(hd.laps, (v) => (hd.laps = v), { min: 1, max: 6, step: 1 }),
        ),
      ),
    );
  }

  private renderWeather() {
    const st = this.st;
    this.main.append(
      this.h2(
        "Weather & time",
        "Start from a preset and fine-tune. Winds aloft veer and strengthen automatically from the surface wind.",
      ),
    );
    const w = st.weather;
    const match = WX_PRESETS.slice(1).find((p) =>
      Object.entries(p.wx).every(
        ([k, v]) => (w as Record<string, unknown>)[k] === v,
      ),
    );
    this.main.append(
      h(
        "div",
        { class: "wx-presets" },
        ...WX_PRESETS.slice(1).map((p) =>
          h(
            "button",
            {
              class: p === match ? "on" : "",
              "aria-pressed": String(p === match),
              onclick: () => {
                Object.assign(w, p.wx);
                this.changed();
              },
            },
            h("b", {}, p.name),
            h("span", {}, p.desc),
          ),
        ),
        match
          ? null
          : h(
              "button",
              { class: "on custom", "aria-pressed": "true", disabled: true },
              h("b", {}, "Custom"),
              h("span", {}, metarLine(w)),
            ),
      ),
    );
    const slider = (
      label: string,
      get: () => number,
      set: (v: number) => void,
      o: {
        min: number;
        max: number;
        step: number;
        fmt: (v: number) => string;
        scale?: number[];
      },
    ) => {
      const out = h("b", {}, o.fmt(get()));
      const sc = o.scale;
      const r = h("input", {
        type: "range",
        min: sc ? 0 : o.min,
        max: sc ? sc.length - 1 : o.max,
        step: sc ? 1 : o.step,
        value: sc ? nearest(sc, get()) : get(),
        "aria-label": label,
      }) as HTMLInputElement;
      const val = () => (sc ? sc[Number(r.value)] : Number(r.value));
      r.addEventListener("input", () => {
        set(val());
        out.textContent = o.fmt(val());
        this.save();
        this.renderSide();
      });
      r.addEventListener("change", () => this.changed());
      return h("label", { class: "wx-f" }, h("span", {}, label), out, r);
    };
    this.main.append(
      h(
        "div",
        { class: "wx-grid fs-wx" },
        slider(
          "Ceiling (AGL)",
          () => w.ceilingFt ?? 900,
          (v) => (w.ceilingFt = v),
          {
            min: 0,
            max: 15000,
            step: 50,
            scale: CEIL_STEPS,
            fmt: (v) =>
              v >= 15000 ? "Clear" : `${v.toLocaleString("en-US")} ft`,
          },
        ),
        slider(
          "Visibility",
          () => w.visibilitySm ?? 2,
          (v) => (w.visibilitySm = v),
          {
            min: 0.25,
            max: 10,
            step: 0.25,
            scale: VIS_STEPS,
            fmt: (v) => `${visTxt(v)} SM`,
          },
        ),
        slider(
          "Wind from",
          () => w.windDir ?? 250,
          (v) => (w.windDir = v),
          { min: 0, max: 355, step: 5, fmt: (v) => `${pad3(v)}°` },
        ),
        slider(
          "Wind speed",
          () => w.windKt ?? 10,
          (v) => (w.windKt = v),
          {
            min: 0,
            max: 40,
            step: 1,
            fmt: (v) => (v < 3 ? "Calm" : `${v} kt`),
          },
        ),
        slider(
          "Gusts to",
          () => w.gustKt ?? 0,
          (v) => (w.gustKt = v),
          {
            min: 0,
            max: 50,
            step: 1,
            fmt: (v) => (v <= (w.windKt ?? 0) ? "None" : `${v} kt`),
          },
        ),
        slider(
          "Turbulence",
          () => w.turbulence ?? 0.15,
          (v) => (w.turbulence = v),
          {
            min: 0,
            max: 1,
            step: 0.05,
            fmt: (v) =>
              v < 0.08
                ? "None"
                : v < 0.3
                  ? "Light"
                  : v < 0.6
                    ? "Moderate"
                    : "Severe",
          },
        ),
        slider(
          "Altimeter",
          () => w.qnh ?? 29.92,
          (v) => (w.qnh = v),
          {
            min: 28.8,
            max: 30.8,
            step: 0.01,
            fmt: (v) => `${v.toFixed(2)} inHg`,
          },
        ),
      ),
    );
    this.main.append(h("div", { class: "section-t" }, "Time of day"));
    this.main.append(
      this.choice(
        st.tod,
        [
          {
            v: "day" as const,
            icon: I.sun,
            title: "Day",
            desc: "Full visual references below the clouds.",
          },
          {
            v: "dusk" as const,
            icon: I.dusk,
            title: "Dusk",
            desc: "Low sun, long shadows, lights coming on.",
          },
          {
            v: "night" as const,
            icon: I.moon,
            title: "Night",
            desc: "Only the approach and runway lights at minimums.",
          },
        ],
        (v) => (st.tod = v),
        "three",
      ),
    );
  }

  private renderTraining() {
    const st = this.st;
    this.main.append(
      this.h2(
        "Training options",
        "Graded flights produce a step-by-step result and an ACS evaluation.",
      ),
    );
    this.main.append(
      this.choice(
        st.graded,
        [
          {
            v: true,
            icon: I.target,
            title: "Graded",
            desc: "ATC instructions per leg, tolerances, ACS evaluation, saved to the records.",
          },
          {
            v: false,
            icon: I.feather,
            title: "Free practice",
            desc: "Route and approach loaded, no grading — fly at your own pace.",
          },
        ],
        (v) => (st.graded = v),
        "two",
      ),
    );
    if (st.graded) {
      this.main.append(h("div", { class: "section-t" }, "Mode"));
      this.main.append(
        this.choice(
          st.mode,
          [
            {
              v: "training" as const,
              icon: I.instructor,
              title: "Training",
              desc: "Coach hints and tolerance alerts.",
            },
            {
              v: "checkride" as const,
              icon: I.badge,
              title: "Checkride",
              desc: "No hints, ACS pass/fail.",
            },
          ],
          (v) => (st.mode = v),
          "two",
        ),
      );
      this.main.append(
        h(
          "label",
          {
            class: `fs-tog${st.handFlown ? " on" : ""}`,
            style: "margin-top:12px",
          },
          h("input", {
            type: "checkbox",
            checked: st.handFlown,
            disabled: !st.equipment.ap,
            onchange: (e: Event) => {
              st.handFlown = (e.target as HTMLInputElement).checked;
              this.changed();
            },
          }),
          h(
            "div",
            {},
            h("b", {}, "Hand-flown"),
            h(
              "span",
              {},
              st.equipment.ap
                ? "The autopilot is installed but not allowed."
                : "No autopilot installed.",
            ),
          ),
        ),
      );
    }
    this.main.append(
      h("div", { class: "section-t" }, `Failures · ${st.failures.length}`),
    );
    const fbox = h("div", { class: "cb-card" });
    if (!st.failures.length)
      fbox.append(
        h(
          "p",
          { class: "muted fs-hint", style: "margin:0" },
          "No failures scheduled.",
        ),
      );
    st.failures.forEach((f, k) =>
      fbox.append(
        h(
          "div",
          { class: "cb-row" },
          this.f(
            "Failure",
            this.sel(
              f.key,
              (Object.keys(FAILURE_LABELS) as (keyof Failures)[]).map(
                (x) => [x, FAILURE_LABELS[x]] as [keyof Failures, string],
              ),
              (v) => (f.key = v),
            ),
          ),
          this.f(
            "After (minutes)",
            this.num(f.at, (v) => (f.at = v), { min: 0, max: 120, step: 0.5 }),
          ),
          h(
            "button",
            {
              class: "btn ghost cb-x",
              title: "Remove this failure",
              "aria-label": "Remove this failure",
              onclick: () => {
                st.failures.splice(k, 1);
                this.changed();
              },
            },
            "✕",
          ),
        ),
      ),
    );
    fbox.append(
      h(
        "div",
        { class: "fs-btnrow" },
        h(
          "button",
          {
            class: "btn",
            onclick: () => {
              st.failures.push({ key: "gs", trigger: "time", at: 5 });
              this.changed();
            },
          },
          "+ Add a failure",
        ),
        h(
          "button",
          {
            class: "btn",
            title:
              "A failure the student does not know about, 3–15 minutes into the flight",
            onclick: () => {
              const keys = Object.keys(FAILURE_LABELS).filter(
                (x) => x !== "engine",
              ) as (keyof Failures)[];
              st.failures.push({
                key: keys[Math.floor(Math.random() * keys.length)],
                trigger: "time",
                at: 3 + Math.round(Math.random() * 12),
              });
              this.changed();
            },
          },
          svgIcon(I.dice, 15),
          "Random failure",
        ),
      ),
    );
    this.main.append(fbox);
  }

  private briefMap: RouteMap | null = null;
  private briefProf: RouteProfile | null = null;
  private renderBriefing() {
    const st = this.st;
    this.main.append(this.h2("Briefing", "Check the plan, then fly."));
    const c = setupToCircuit(st);
    this.briefMap?.destroy();
    this.briefProf?.destroy();
    this.briefMap = new RouteMap(c, {
      height: 330,
      onExpand: () => this.openBigMap(c),
    });
    this.main.append(this.briefMap.el);
    if (c.legs.length) {
      this.briefProf = new RouteProfile(c, { height: 132 });
      this.main.append(
        h("div", { class: "section-t fs-prof-t" }, "Vertical profile"),
        this.briefProf.el,
      );
    }
    const errs = this.stepErrors();
    if (errs.length)
      this.main.append(
        h(
          "div",
          { class: "fs-errs" },
          ...errs.map((e) =>
            h(
              "button",
              { class: "fs-err", onclick: () => this.go(e.step) },
              svgIcon(I.warning, 14),
              h("span", {}, e.text),
              h("small", {}, `Fix in ${this.stepTitle(e.step)} →`),
            ),
          ),
        ),
      );
    const warns = st.type === "free" ? [] : this.warnings();
    if (warns.length)
      this.main.append(
        h(
          "div",
          { class: "fs-chips-w" },
          ...warns.map((w) =>
            h("span", { class: "fs-wchip" }, svgIcon(I.warning, 13), w),
          ),
        ),
      );
    const dest = c.legs.find((l) => l.type === "approach") as
      | Extract<CircuitLeg, { type: "approach" }>
      | undefined;
    const ap = dest ? getApproach(dest.approachId) : null;
    const sid =
      st.type === "route" && st.sid && st.start === "runway"
        ? terminalProc(st.rwy.airport, "SID", st.sid.id)
        : undefined;
    const star =
      st.type === "route" && st.star
        ? terminalProc(st.arr, "STAR", st.star.id)
        : undefined;
    this.main.append(
      h(
        "div",
        { class: "fs-brief" },
        h(
          "div",
          {},
          h("div", { class: "section-t", style: "margin-top:0" }, "Plan"),
          h(
            "ol",
            { class: "cb-seq" },
            h(
              "li",
              {},
              c.start.type === "runway"
                ? `Take off ${c.start.airport} RWY ${c.start.runway}, climb ${c.start.initialAlt}`
                : `Start ${c.start.distNm} NM from ${c.start.fix} (${pad3(c.start.bearing)}°), ${c.start.altFt} ft`,
            ),
            sid
              ? h(
                  "li",
                  { class: "proc" },
                  `${sid.id}${st.sid!.transition ? `.${st.sid!.transition}` : ""} departure`,
                )
              : null,
            ...c.legs.map((l) =>
              h(
                "li",
                {},
                l.type === "fix"
                  ? `Direct ${l.ident}${l.alt ? ` at ${l.alt}` : ""}`
                  : l.type === "hold"
                    ? `Hold at ${l.ident}, inbound ${pad3(l.inbound)}°, ${l.turn === "R" ? "right" : "left"} turns ×${l.laps}`
                    : l.type === "approach"
                      ? `${getApproach(l.approachId).airport} ${getApproach(l.approachId).name} ${l.transition ? `via ${l.transition}` : "(vectors)"} → ${l.outcome === "land" ? "land" : "missed approach"}`
                      : `Maintain ${l.alt}`,
              ),
            ),
          ),
          star
            ? h(
                "p",
                { class: "muted fs-hint" },
                `Arrival ${star.id}${st.star!.transition ? ` via ${st.star!.transition}` : ""} is included in the fixes above.`,
              )
            : null,
          ap
            ? h(
                "div",
                { class: "atis fs-atis" },
                h("div", { class: "section-t" }, `ATIS ${ap.airport}`),
                h("p", {}, atisText(ap.airport, this.wx())),
              )
            : null,
        ),
        ap
          ? h(
              "div",
              { class: "fs-plate-w" },
              h(
                "button",
                {
                  class: "fs-plate",
                  title: "Open the plate in the EFB",
                  onclick: () => {
                    this.close();
                    this.hooks.openChart(ap.id);
                  },
                },
                h(
                  "span",
                  { class: "fs-plate-cap" },
                  `${ap.airport} · ${ap.name}`,
                ),
                h("div", { html: approachPlate(ap) }),
              ),
              h(
                "button",
                {
                  class: "btn sm",
                  onclick: () => {
                    this.close();
                    this.hooks.openChart(ap.id);
                  },
                },
                svgIcon(I.document, 14),
                "Open plate",
              ),
            )
          : h("div", {}),
      ),
    );
  }

  /** compact plate thumbnail of the chosen procedure (click → full plate in the EFB) */
  private platePreview(ap: Approach) {
    const fins = ap.final.filter((l) => l.role === "FAF" || l.role === "IF");
    return h(
      "div",
      { class: "fs-pp" },
      h(
        "button",
        {
          class: "fs-pp-img",
          title: "Open the plate in the EFB",
          onclick: () => {
            this.close();
            this.hooks.openChart(ap.id);
          },
        },
        h("div", { html: approachPlate(ap) }),
      ),
      h(
        "div",
        { class: "fs-pp-info" },
        h("b", {}, `${ap.airport} · ${ap.name}`),
        h(
          "span",
          { class: `fs-src${ap.source === "Generated" ? " gen" : ""}` },
          ap.source === "Generated"
            ? "Generated procedure (no official data)"
            : ap.source
              ? `Official · ${ap.source}`
              : "Training region",
        ),
        h(
          "dl",
          {},
          h("dt", {}, "Final course"),
          h("dd", {}, `${pad3(ap.finalCourse)}°`),
          ...fins.flatMap((l) => [
            h("dt", {}, l.role!),
            h("dd", {}, `${l.fix.ident}${l.altMin ? ` · ${l.altMin} ft` : ""}`),
          ]),
          h("dt", {}, "Minimums"),
          h(
            "dd",
            {},
            ap.minimums
              .slice(0, 2)
              .map((m) => `${m.label} ${m.da ?? m.mda}`)
              .join(" · "),
          ),
          h("dt", {}, "Missed"),
          h("dd", {}, ap.missedText),
        ),
        h(
          "button",
          {
            class: "btn sm",
            onclick: () => {
              this.close();
              this.hooks.openChart(ap.id);
            },
          },
          svgIcon(I.document, 14),
          "Open plate",
        ),
      ),
    );
  }

  private suggestRoute() {
    const st = this.st;
    if (!st.arrival.approachId) return;
    const ap = getApproach(st.arrival.approachId);
    const tr =
      ap.transitions.find((t) => t.name === st.arrival.transition) ??
      ap.transitions[0];
    if (tr) st.route = [tr.legs[0].fix.ident];
  }

  // ---------------------------------------------------------------- side summary
  private renderSide() {
    clear(this.side);
    const st = this.st;
    this.sideMap?.destroy();
    this.sideMap = null;
    if (this.needsRegion()) {
      const r1 = this.rows[st.dep],
        r2 = this.rows[st.arr];
      this.side.append(
        h("div", { class: "fs-kicker" }, "Your flight"),
        h(
          "h3",
          { class: "fs-title" },
          st.dep && st.arr
            ? `${st.dep} → ${st.arr}`
            : st.dep
              ? `${st.dep} → …`
              : "Real world",
        ),
        h(
          "div",
          { class: `fs-side-empty${this.loading ? " loading" : ""}` },
          this.loading
            ? h(
                "div",
                { class: "fs-side-load" },
                h("span", { class: "spin" }),
                h("b", {}, "Loading…"),
                h("span", { class: "fs-prog-step" }, this.progress),
              )
            : null,
          h(
            "p",
            {},
            !st.dep
              ? "Start by choosing the departure airport."
              : !st.arr
                ? "Now choose the destination."
                : this.loading
                  ? "Navigation data, procedures and terrain for this flight."
                  : this.loadErr
                    ? "The region could not be loaded."
                    : "Ready to load.",
          ),
          r1 ? h("p", { class: "muted" }, `${r1[0]} · ${r1[1]}`) : null,
          r2 ? h("p", { class: "muted" }, `${r2[0]} · ${r2[1]}`) : null,
        ),
      );
      return;
    }
    const c = setupToCircuit(st);
    const stats = circuitStats(c);
    const eq = st.equipment;
    const hasRoute =
      st.type !== "free" && c.legs.length > 0 && stats.distNm > 0.5;
    this.side.append(
      h("div", { class: "fs-kicker" }, "Your flight"),
      h("h3", { class: "fs-title" }, c.name),
      this.mapView(c, 250, true),
      h(
        "div",
        { class: "ios-stat fs-sum" },
        h(
          "div",
          {},
          h("small", {}, "Type"),
          h(
            "b",
            {},
            {
              route: "IFR A → B",
              approach: "Approach",
              hold: "Holding",
              free: "Free flight",
            }[st.type],
          ),
        ),
        hasRoute
          ? h(
              "div",
              {},
              h("small", {}, "Distance · time"),
              h(
                "b",
                {},
                `${stats.distNm.toFixed(0)} NM · ~${stats.minutes} min`,
              ),
            )
          : null,
        h(
          "div",
          {},
          h("small", {}, "Cockpit"),
          h(
            "b",
            {},
            { g1000: "G1000", steam: "Steam", airliner: "Airliner" }[
              st.cockpit
            ],
          ),
        ),
        st.type === "free" ? null : h(
          "div",
          {},
          h("small", {}, "Grading"),
          h(
            "b",
            {},
            !st.graded
              ? "Free"
              : st.mode === "checkride"
                ? "Checkride"
                : "Training",
          ),
        ),
        h(
          "div",
          { class: "wide" },
          h("small", {}, "Weather"),
          h("b", { class: "fs-metar" }, metarLine(st.weather)),
        ),
        h(
          "div",
          { class: "wide" },
          h("small", {}, "Equipment"),
          h(
            "span",
            { class: "fs-pills" },
            ...(
              [
                ["GPS", eq.gps],
                ["AP", eq.ap],
                ["NAV1", true],
                ["NAV2", eq.nav2],
                ["DME", eq.dme],
                ["ADF", eq.adf],
              ] as [string, boolean][]
            ).map(([k, on]) =>
              h(
                "i",
                {
                  class: on ? "on" : "",
                  title: on ? `${k} installed` : `No ${k}`,
                },
                k,
              ),
            ),
          ),
        ),
      ),
    );
  }

  private sideMap: RouteMap | null = null;
  private mapView(c: Circuit, height: number, compact: boolean): HTMLElement {
    this.sideMap?.destroy();
    const m = new RouteMap(c, {
      height,
      compact,
      onExpand: () => this.openBigMap(c),
    });
    this.sideMap = m;
    return m.el;
  }
  /** full-screen flight-plan map above the planner (the planner stays open underneath) */
  private openBigMap(c: Circuit) {
    const m = new RouteMap(c, {
      height: Math.round(window.innerHeight * 0.78),
    });
    let layer: HTMLElement | null = null;
    const close = () => {
      m.destroy();
      layer?.remove();
      document.removeEventListener("keydown", onKey, true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        close();
      }
    };
    layer = h(
      "div",
      {
        class: "rm-full",
        role: "dialog",
        "aria-label": "Flight plan map",
        onclick: (e: Event) => e.target === layer && close(),
      },
      h(
        "div",
        { class: "rm-full-box" },
        h(
          "header",
          {},
          h("b", {}, c.name),
          h(
            "span",
            { class: "muted" },
            "Drag to pan · scroll to zoom · Esc to close",
          ),
          h(
            "button",
            {
              class: "x",
              "aria-label": "Close",
              title: "Close (Esc)",
              onclick: close,
            },
            "×",
          ),
        ),
        m.el,
      ),
    );
    document.addEventListener("keydown", onKey, true);
    document.body.append(layer!);
  }

  // ---------------------------------------------------------------- footer
  private flyPending = false;
  /** real world chosen but the region for the chosen airports is not (yet) loaded */
  private needsRegion() {
    const st = this.st;
    return (
      st.world === "real" &&
      !(currentRegion() && this.loadedKey === `${st.dep}|${st.arr}`)
    );
  }
  private renderFoot() {
    clear(this.foot);
    const st = this.st;
    const pendingLoad = this.needsRegion();
    const c = pendingLoad ? null : setupToCircuit(st);
    // procedures of a region not loaded yet can't be validated — Fly loads first, then checks
    const errs = this.stepErrors().filter(
      (e) => !(pendingLoad && e.step === S_AIRPORTS && this.loading),
    );
    const noAirports = st.world === "real" && (!st.dep || !st.arr);
    const busy = this.flyPending || this.loading;
    const canFly = errs.length === 0 && !noAirports && !busy;
    const back = this.nextStep(-1);
    const next = this.nextStep(1);
    this.foot.append(...([
      back !== null
        ? h("button", { class: "btn", onclick: () => this.go(back) }, "← Back")
        : h("span", {}),
      busy
        ? h(
            "span",
            { class: "fs-errline fs-loading" },
            "Loading region ·", h("span", { class: "fs-prog-step" }, this.progress || "starting…"),
          )
        : errs[0]
          ? h(
              "button",
              {
                class: "fs-errline",
                title: "Go to the step to fix it",
                onclick: () => this.go(errs[0].step),
              },
              svgIcon(I.warning, 14),
              errs[0].text,
            )
          : h("span", {}),
      h("span", { style: "flex:1" }),
      st.type !== "free" && c
        ? h(
            "button",
            {
              class: "btn",
              disabled: !canFly,
              onclick: () => {
                circuitStore.save({ ...c, name: c.name });
                this.toast?.(`Saved “${c.name}” to IFR circuits`);
              },
              title: "Save to the Flight Center → IFR circuits",
            },
            "Save as circuit",
          )
        : null,
      next !== null
        ? h(
            "button",
            {
              class: "btn",
              disabled: busy || (this.step === S_AIRPORTS && noAirports),
              onclick: () => this.go(next),
            },
            "Next →",
          )
        : null,
      h(
        "button",
        {
          class: "btn primary fs-fly",
          disabled: !canFly,
          "aria-busy": String(busy),
          onclick: () => void this.fly(),
        },
        busy
          ? [h("span", { class: "spin light" }), "Loading region…"]
          : pendingLoad && !noAirports
            ? "Load & fly ✈"
            : "Fly ✈",
      ),
    ] as (Node | null)[]).filter((x): x is Node => !!x));
  }
  toast?: (m: string) => void;

  private async fly() {
    const st = this.st;
    this.save();
    if (this.needsRegion()) {
      if (!st.dep || !st.arr) {
        this.step = 0;
        this.loadErr = "Choose the departure and the destination first.";
        this.render();
        return;
      }
      this.flyPending = true;
      this.render();
      await this.ensureRegion();
      this.flyPending = false;
      if (this.needsRegion()) {
        this.step = 0;
        this.render();
        return;
      } // load failed: the error is on the Airports step
    }
    // build the circuit only now: a region load replaces the airports and approaches it refers to
    const c = setupToCircuit(st);
    const errs = st.type === "free" ? [] : validate(c);
    if (errs.length) {
      this.render();
      this.toast?.(errs[0]);
      return;
    }
    this.close();
    if (st.type !== "free" && st.graded && c.legs.length)
      this.hooks.flyGraded(c, st);
    else this.hooks.flyFree(setupToScenario(st), st);
  }

  close() {
    super.close();
    this.sideMap?.destroy();
    this.briefMap?.destroy();
    this.briefProf?.destroy();
  }
}
