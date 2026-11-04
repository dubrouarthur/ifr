// IFR circuit builder (instructor tool, pro-simulator IOS style).
// Layout: library (search + list) | the circuit: start + ordered leg cards (drag to reorder, inline editing,
// validation per leg) and a compact settings tab | a large live map of the circuit with the selected leg
// highlighted, and the vertical profile below it.
import { h, clear, store } from "./dom";
import { Modal, WX_PRESETS } from "./modals";
import { svgIcon, I } from "./icons";
import {
  PRESET_CIRCUITS,
  circuitStore,
  newCircuit,
  validate,
  legText,
  circuitStats,
  encodeCircuit,
  decodeCircuit,
  type Circuit,
  type CircuitLeg,
} from "../train/circuits";
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
  terminalLegs,
  terminalSummary,
} from "../nav/terminal";
import { currentRegion } from "../nav/world";
import { FAILURE_LABELS, type Failures } from "../sim/sim";
import type { Approach } from "../nav/types";
import { RouteMap, RouteProfile, planProfile } from "./routeMap";
import { APPROACH_RANK, runwayInUse } from "./atis";
import type { Weather } from "../sim/environment";

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const pad3 = (n: number) =>
  String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, "0");
const TYPE_LABEL: Record<CircuitLeg["type"], string> = {
  fix: "Fix",
  alt: "Altitude",
  hold: "Hold",
  approach: "Approach",
};
const TYPE_ICON: Record<CircuitLeg["type"], string> = {
  fix: I.route,
  alt: I.depart,
  hold: I.hold,
  approach: I.approach,
};
const stop = (e: Event) => e.stopPropagation();
/** approaches grouped by airport (the circuit's airports first), precision first */
function approachOptions(
  first: string[],
): { airport: string; apps: Approach[] }[] {
  const by = new Map<string, Approach[]>();
  for (const a of APPROACHES)
    by.set(a.airport, [...(by.get(a.airport) ?? []), a]);
  return [...by.entries()]
    .sort(
      ([a], [b]) =>
        (first.includes(b) ? 1 : 0) - (first.includes(a) ? 1 : 0) ||
        a.localeCompare(b),
    )
    .map(([airport, apps]) => ({
      airport,
      apps: apps.sort(
        (x, y) =>
          APPROACH_RANK[x.type] - APPROACH_RANK[y.type] ||
          x.runway.localeCompare(y.runway),
      ),
    }));
}

export class CircuitBuilder extends Modal {
  private c: Circuit = clone(PRESET_CIRCUITS[0]);
  private dirty = false;
  /** the preset (or saved circuit) this one was copied from */
  private sourceId: string | null = null;
  /** selected leg (−1 = start, null = none) */
  private selLeg: number | null = null;
  private tab: "route" | "settings" = "route";
  private q = "";
  private lib!: HTMLElement;
  private libList!: HTMLElement;
  private ed!: HTMLElement;
  private mapCol!: HTMLElement;
  private stats!: HTMLElement;
  private map: RouteMap | null = null;
  private prof: RouteProfile | null = null;
  private mapReal = false;
  private sidPanel = false;

  constructor(
    private onFly: (c: Circuit) => void,
    private toast: (m: string, k?: "info" | "good" | "warn" | "bad") => void,
  ) {
    super("IFR circuit builder");
    this.box.classList.add("cb", "cbx");
    clear(this.body);
    this.lib = h("nav", { class: "cbx-lib", "aria-label": "Circuit library" });
    this.ed = h("section", { class: "cbx-ed", "aria-label": "Circuit" });
    this.mapCol = h("section", {
      class: "cbx-map",
      "aria-label": "Map and profile",
    });
    this.body.append(
      h("div", { class: "cbx-grid" }, this.lib, this.ed, this.mapCol),
    );
    this.buildLibrary();
  }

  edit(c?: Circuit) {
    if (c) this.c = clone(c);
    // reopened in another region (e.g. a training preset while a real-world region is loaded):
    // start from a fresh circuit at an airport of the loaded region instead of a page of errors
    else if (!this.fitsRegion(this.c)) this.c = this.freshCircuit();
    this.sourceId = null;
    if (this.c.preset) this.copyFrom(this.c);
    else this.dirty = !circuitStore.list().some((x) => x.id === this.c.id);
    this.selLeg = null;
    this.open();
    this.render();
  }

  /** every fix, airport and approach of the circuit exists in the loaded region */
  private fitsRegion(c: Circuit) {
    const st = c.start;
    if (st.type === "runway" ? !AIRPORTS.some((a) => a.icao === st.airport) : !findFix(st.fix))
      return false;
    return c.legs.every((l) => {
      if (l.type === "fix" || l.type === "hold") return !!findFix(l.ident);
      if (l.type === "approach")
        try {
          getApproach(l.approachId);
          return true;
        } catch {
          return false;
        }
      return true;
    });
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

  // ---------------------------------------------------------------- change plumbing
  /** structural change: rebuild the editor; a field edit only refreshes the summaries */
  private changed(structural = false) {
    this.dirty = true;
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

  // ---------------------------------------------------------------- library
  private buildLibrary() {
    const search = h("input", {
      type: "search",
      class: "cbx-search",
      placeholder: "Search circuits",
      "aria-label": "Search circuits",
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
          if (c.legs && c.start) {
            circuitStore.save({
              ...c,
              id: c.id || `c${Date.now().toString(36)}${n}`,
            });
            n++;
          }
        });
        this.toast(`Imported ${n} circuit${n === 1 ? "" : "s"}`, "good");
        this.renderLibrary();
      } catch {
        this.toast("Not a valid circuit file", "bad");
      }
      file.value = "";
    });
    this.lib.append(
      h(
        "button",
        {
          class: "btn primary cbx-new",
          onclick: () =>
            this.guard(() => {
              this.c = this.freshCircuit();
              this.sourceId = null;
              this.dirty = true;
              this.selLeg = 0;
              this.render();
            }),
        },
        "+ New circuit",
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
            title: "Import circuits from a JSON file",
            onclick: () => file.click(),
          },
          "Import…",
        ),
        h(
          "button",
          {
            class: "btn ghost sm",
            title: "Download all your circuits as JSON",
            onclick: () =>
              this.download(circuitStore.list(), "ifr-circuits-library.json"),
          },
          "Export all",
        ),
      ),
    );
  }

  /** confirm before throwing away unsaved edits */
  private guard(go: () => void) {
    if (
      this.dirty &&
      this.isSaved() &&
      !confirm(`Discard the unsaved changes to “${this.c.name}”?`)
    )
      return;
    go();
  }

  private renderLibrary() {
    clear(this.libList);
    const match = (c: Circuit) =>
      !this.q || `${c.name} ${c.description}`.toLowerCase().includes(this.q);
    const item = (c: Circuit, preset: boolean) => {
      const cur = c.id === this.c.id;
      const src = c.id === this.sourceId;
      const ap = c.legs.find((l) => l.type === "approach") as
        | Extract<CircuitLeg, { type: "approach" }>
        | undefined;
      const where = c.start.type === "runway" ? c.start.airport : c.start.fix;
      let dest = "";
      try {
        dest = ap ? getApproach(ap.approachId).airport : "";
      } catch {
        dest = "";
      }
      return h(
        "button",
        {
          class: `cbx-item${cur ? " on" : ""}${src ? " src" : ""}`,
          title: c.description || c.name,
          onclick: () =>
            this.guard(() => {
              if (preset) this.copyFrom(c);
              else {
                this.c = clone(c);
                this.sourceId = null;
                this.dirty = false;
              }
              this.selLeg = null;
              this.render();
            }),
        },
        h("b", {}, c.name),
        h(
          "small",
          {},
          [
            `${c.legs.length} leg${c.legs.length === 1 ? "" : "s"}`,
            `~${circuitStats(c).minutes} min`,
            dest && dest !== where ? `${where} → ${dest}` : where,
          ].join(" · "),
        ),
        src ? h("em", {}, "Editing a copy") : null,
      );
    };
    const mine = circuitStore.list().filter(match);
    const presets = PRESET_CIRCUITS.filter(match);
    this.libList.append(
      h(
        "div",
        { class: "cbx-sec" },
        `My circuits`,
        h("span", {}, String(circuitStore.list().length)),
      ),
    );
    if (!circuitStore.list().length)
      this.libList.append(
        h(
          "p",
          { class: "cbx-empty" },
          "Circuits you save appear here. They are stored in this browser — use Export all to move them to another computer.",
        ),
      );
    else if (!mine.length)
      this.libList.append(
        h("p", { class: "cbx-empty" }, `No saved circuit matches “${this.q}”.`),
      );
    mine.forEach((c) => this.libList.append(item(c, false)));
    this.libList.append(
      h(
        "div",
        { class: "cbx-sec" },
        "School presets",
        h("span", {}, String(PRESET_CIRCUITS.length)),
      ),
    );
    if (currentRegion())
      this.libList.append(
        h(
          "p",
          { class: "cbx-empty" },
          "Presets fly in the Ardent Islands training region.",
        ),
      );
    if (!presets.length)
      this.libList.append(
        h("p", { class: "cbx-empty" }, `No preset matches “${this.q}”.`),
      );
    presets.forEach((c) => this.libList.append(item(c, true)));
  }

  /** a new circuit in the region that is loaded (training region or real world) */
  private freshCircuit(): Circuit {
    const c = newCircuit();
    // the departure planned in "Plan a flight" first (real world), then any airport with approaches
    const planned = store.get<{ dep?: string } | null>("ifr.setup.v1", null)?.dep;
    const a =
      AIRPORTS.find((x) => x.icao === planned && APPROACHES.some((p) => p.airport === x.icao)) ??
      AIRPORTS.find((x) => APPROACHES.some((p) => p.airport === x.icao)) ??
      AIRPORTS[0];
    if (a && c.start.type === "runway" && !AIRPORTS.some((x) => c.start.type === "runway" && x.icao === c.start.airport)) {
      // the runway in use for the circuit's wind (the longest one in calm wind), like the ATIS
      const rw = a.runways.length
        ? runwayInUse(a.icao, { windDir: 0, windKt: 0, ...c.weather } as Weather)
        : undefined;
      c.start = {
        type: "runway",
        airport: a.icao,
        runway: rw?.id ?? "",
        initialAlt: Math.max(3000, Math.ceil((a.elevFt + 2500) / 500) * 500),
      };
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

  // ---------------------------------------------------------------- field helpers
  private num(
    value: number | null,
    on: (v: number | null) => void,
    o: {
      min?: number;
      max?: number;
      step?: number;
      ph?: string;
      w?: number;
      label?: string;
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
    }) as HTMLInputElement;
    i.addEventListener("change", () => {
      on(i.value === "" ? null : Number(i.value));
      this.changed();
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
          : h("optgroup", { label: o.group }, ...o.opts.map(opt)),
      ),
    ) as HTMLSelectElement;
    s.addEventListener("change", () => {
      on(s.value as T);
      this.changed(structural);
    });
    s.addEventListener("keydown", stop);
    return s;
  }
  private fixListN = 0;
  /** fix entry with suggestions from the loaded region (works with thousands of real-world fixes) */
  private fixInput(value: string, on: (v: string) => void) {
    const id = `cbx-fx-${++this.fixListN}`;
    const dl = h("datalist", { id });
    const i = h("input", {
      type: "text",
      class: "cbx-fix",
      value,
      list: id,
      spellcheck: "false",
      autocomplete: "off",
      placeholder: "Fix, navaid or airport",
      
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
      on(i.value.trim().toUpperCase());
      i.value = i.value.trim().toUpperCase();
      i.classList.toggle("bad", !findFix(i.value));
      this.changed();
    });
    if (value && !findFix(value)) i.classList.add("bad");
    return h("span", { class: "cbx-fixwrap" }, i, dl);
  }
  private field(label: string, ...els: (HTMLElement | string)[]) {
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

  // ---------------------------------------------------------------- validation per leg
  private problems() {
    const all = validate(this.c);
    const legs = new Map<number, string[]>();
    const start: string[] = [];
    const general: string[] = [];
    for (const e of all) {
      const m = /^Leg (\d+): (.*)$/.exec(e);
      if (m)
        legs.set(Number(m[1]) - 1, [
          ...(legs.get(Number(m[1]) - 1) ?? []),
          m[2].replace(/^./, (x) => x.toUpperCase()),
        ]);
      else if (/start fix|runway/i.test(e)) start.push(e);
      else
        general.push(
          e === "Add at least one leg."
            ? "Add at least one fix or an approach."
            : e,
        );
    }
    return { all, legs, start, general };
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
      placeholder: "Name this circuit",
      "aria-label": "Circuit name",
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
            "route",
            `Route · ${c.legs.length} leg${c.legs.length === 1 ? "" : "s"}`,
          ],
          ["settings", "Weather, failures & options"],
        ] as const
      ).map(([k, t]) =>
        h(
          "button",
          {
            role: "tab",
            "aria-selected": String(this.tab === k),
            class: this.tab === k ? "on" : "",
            onclick: () => {
              this.tab = k;
              this.renderEditor();
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
          "label",
          { class: "cbx-name-w", title: "Rename" },
          name,
          svgIcon(I.feather, 15),
        ),
        tabs,
      ),
      scroll,
    );
    if (this.tab === "route") this.buildRoute(scroll);
    else this.buildSettings(scroll);
    scroll.scrollTop = keepScroll;
  }

  private buildRoute(box: HTMLElement) {
    const c = this.c;
    const pr = this.problems();
    box.append(this.startCard(pr.start));
    if (!c.legs.length)
      box.append(
        h(
          "div",
          { class: "cbx-nolegs" },
          h("b", {}, "No legs yet"),
          h(
            "span",
            {},
            "Add a fix to fly to, a hold or an approach with the buttons below.",
          ),
        ),
      );
    c.legs.forEach((l, i) => box.append(this.legCard(l, i, pr.legs.get(i) ?? [])));
    this.markLowLegs();
    // add-leg bar: inserted after the selected leg
    const add = (l: CircuitLeg) => {
      const at =
        this.selLeg !== null &&
        this.selLeg >= 0 &&
        this.selLeg < c.legs.length - 1
          ? this.selLeg + 1
          : c.legs.length;
      c.legs.splice(at, 0, l);
      this.selLeg = at;
      this.changed(true);
      requestAnimationFrame(() =>
        (
          this.ed.querySelector(
            ".cbx-leg.on input, .cbx-leg.on select",
          ) as HTMLElement | null
        )?.focus(),
      );
    };
    const lastFix = [...c.legs]
      .reverse()
      .find((l) => l.type === "fix" || l.type === "hold") as
      | { ident: string }
      | undefined;
    const refFix =
      lastFix?.ident ?? (c.start.type === "air" ? c.start.fix : "");
    const firstApp = approachOptions(this.circuitAirports())[0]?.apps[0];
    const after =
      this.selLeg !== null &&
      this.selLeg >= 0 &&
      this.selLeg < c.legs.length - 1
        ? ` after leg ${this.selLeg + 1}`
        : "";
    box.append(
      h(
        "div",
        { class: "cbx-add" },
        h("span", { class: "cbx-add-t" }, `Add a leg${after}`),
        h(
          "div",
          { class: "cbx-add-b" },
          h(
            "button",
            {
              class: "btn sm",
              onclick: () => add({ type: "fix", ident: "", alt: null }),
            },
            svgIcon(I.route, 15),
            "Fix",
          ),
          h(
            "button",
            { class: "btn sm", onclick: () => add({ type: "alt", alt: 4000 }) },
            svgIcon(I.depart, 15),
            "Altitude",
          ),
          h(
            "button",
            {
              class: "btn sm",
              onclick: () =>
                add({
                  type: "hold",
                  ident: refFix,
                  inbound: 360,
                  turn: "R",
                  legMin: 1,
                  alt: 3000,
                  laps: 2,
                }),
            },
            svgIcon(I.hold, 15),
            "Hold",
          ),
          h(
            "button",
            {
              class: "btn sm",
              disabled: !firstApp,
              title: firstApp ? "" : "No approach in the loaded region",
              onclick: () =>
                firstApp &&
                add({
                  type: "approach",
                  approachId: firstApp.id,
                  transition: firstApp.transitions[0]?.name ?? null,
                  outcome: "land",
                }),
            },
            svgIcon(I.approach, 15),
            "Approach",
          ),
          TERMINAL.length
            ? h(
                "button",
                {
                  class: `btn sm${this.sidPanel ? " on" : ""}`,
                  "aria-expanded": String(this.sidPanel),
                  onclick: () => {
                    this.sidPanel = !this.sidPanel;
                    this.renderEditor();
                  },
                },
                svgIcon(I.map, 15),
                "SID / STAR",
              )
            : null,
        ),
      ),
    );
    if (this.sidPanel && TERMINAL.length) box.append(this.terminalPanel());
  }

  private circuitAirports(): string[] {
    const c = this.c;
    const out: string[] = [];
    for (const l of c.legs)
      if (l.type === "approach")
        try {
          out.push(getApproach(l.approachId).airport);
        } catch {
          /* not loaded */
        }
    if (c.start.type === "runway") out.push(c.start.airport);
    return out;
  }

  /** insert the fixes of a published SID / STAR as fix legs */
  private tp = { kind: "SID" as "SID" | "STAR", key: "", tr: "" };
  private terminalPanel() {
    const c = this.c;
    const tp = this.tp;
    const depApt = c.start.type === "runway" ? c.start.airport : "";
    const depRwy = c.start.type === "runway" ? c.start.runway : undefined;
    const procs =
      tp.kind === "SID"
        ? depApt
          ? sidsFor(depApt, depRwy)
          : []
        : [
            ...new Set([
              ...this.circuitAirports(),
              ...TERMINAL.map((p) => p.airport),
            ]),
          ].flatMap((a) => starsFor(a));
    const key = (p: { airport: string; id: string }) => `${p.airport}|${p.id}`;
    let p = procs.find((x) => key(x) === tp.key) ?? procs[0];
    if (p && key(p) !== tp.key) {
      tp.key = key(p);
      tp.tr = "";
    }
    const arrRwy = (() => {
      const a = c.legs.find((l) => l.type === "approach") as
        | Extract<CircuitLeg, { type: "approach" }>
        | undefined;
      try {
        return a ? getApproach(a.approachId).runway : null;
      } catch {
        return null;
      }
    })();
    const rw = tp.kind === "SID" ? (depRwy ?? null) : arrRwy;
    const legs = p
      ? terminalLegs(p, rw, tp.tr || null).filter((l) => l.fix)
      : [];
    const s = (
      v: string,
      opts: [string, string][],
      on: (v: string) => void,
    ) => {
      const el = h(
        "select",
        {},
        ...opts.map(([k, l]) =>
          h("option", { value: k, selected: k === v }, l),
        ),
      ) as HTMLSelectElement;
      el.addEventListener("change", () => {
        on(el.value);
        this.renderEditor();
      });
      el.addEventListener("keydown", stop);
      return el;
    };
    const insert = () => {
      if (!p) return;
      const fx: CircuitLeg[] = legs.map((l) => ({
        type: "fix",
        ident: l.fix!.ident,
        alt: l.altMin !== undefined && l.altMin === l.altMax ? l.altMin : null,
      }));
      const at =
        tp.kind === "SID"
          ? 0
          : Math.max(
              0,
              c.legs.findIndex((l) => l.type === "approach") < 0
                ? c.legs.length
                : c.legs.findIndex((l) => l.type === "approach"),
            );
      c.legs.splice(at, 0, ...fx);
      this.sidPanel = false;
      this.selLeg = at;
      this.toast(
        `${p.id}${tp.tr ? `.${tp.tr}` : ""}: ${fx.length} fixes inserted`,
        "good",
      );
      this.changed(true);
    };
    return h(
      "div",
      { class: "cbx-term" },
      h(
        "div",
        { class: "seg" },
        h(
          "button",
          {
            class: tp.kind === "SID" ? "on" : "",
            onclick: () => {
              tp.kind = "SID";
              tp.key = "";
              this.renderEditor();
            },
          },
          "Departure (SID)",
        ),
        h(
          "button",
          {
            class: tp.kind === "STAR" ? "on" : "",
            onclick: () => {
              tp.kind = "STAR";
              tp.key = "";
              this.renderEditor();
            },
          },
          "Arrival (STAR)",
        ),
      ),
      procs.length && p
        ? h(
            "div",
            { class: "cb-row" },
            this.field(
              tp.kind === "SID"
                ? `Departures from ${depApt} RWY ${depRwy}`
                : "Arrival",
              s(
                tp.key,
                procs.map((x) => [key(x), `${x.airport} ${x.id}`]),
                (v) => {
                  tp.key = v;
                  tp.tr = "";
                },
              ),
            ),
            this.field(
              "Transition",
              s(
                tp.tr,
                [
                  ["", p.enr.length ? "No transition" : "None published"],
                  ...p.enr.map((t) => [t.name, t.name] as [string, string]),
                ],
                (v) => (tp.tr = v),
              ),
            ),
          )
        : h(
            "p",
            { class: "cbx-empty" },
            tp.kind === "SID"
              ? depApt
                ? `No published departure from ${depApt} RWY ${depRwy}.`
                : "Start on a runway to add a departure."
              : "No published arrival in the loaded region.",
          ),
      p
        ? h(
            "div",
            { class: "cbx-term-seq" },
            h("small", {}, "Fixes flown"),
            h(
              "span",
              {},
              terminalSummary(p, rw, tp.tr || null)
                .replace(/^[^:]*:\s*/, "")
                .split(" ")
                .join(" → "),
            ),
          )
        : null,
      h(
        "div",
        { class: "cbx-term-a" },
        h(
          "button",
          {
            class: "btn ghost sm",
            onclick: () => {
              this.sidPanel = false;
              this.renderEditor();
            },
          },
          "Cancel",
        ),
        h(
          "button",
          { class: "btn primary sm", disabled: !legs.length, onclick: insert },
          legs.length ? `Insert ${legs.length} fixes` : "Nothing to insert",
        ),
      ),
    );
  }

  private startCard(errs: string[]) {
    const c = this.c;
    const st = c.start;
    const on = this.selLeg === -1;
    const title =
      st.type === "runway"
        ? `Take off ${st.airport} RWY ${st.runway}`
        : `Airborne near ${st.fix}`;
    const sub =
      st.type === "runway"
        ? `Climb to ${st.initialAlt} ft`
        : `${pad3(st.bearing)}° / ${st.distNm} NM from ${st.fix} · ${st.altFt} ft · ${st.iasKt} kt`;
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
        },
      },
      h("span", { class: "cbx-n start" }, svgIcon(I.plane, 13)),
      h(
        "div",
        { class: "cbx-leg-t" },
        h("small", { class: "cbx-kind" }, "Start"),
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
        h(
          "div",
          { class: "seg" },
          h(
            "button",
            {
              class: st.type === "runway" ? "on" : "",
              onclick: () => {
                const a = AIRPORTS[0];
                c.start = {
                  type: "runway",
                  airport: a?.icao ?? "PARD",
                  runway: a?.runways[0]?.id ?? "27",
                  initialAlt: 3000,
                };
                this.changed(true);
              },
            },
            "On a runway",
          ),
          h(
            "button",
            {
              class: st.type === "air" ? "on" : "",
              onclick: () => {
                c.start = {
                  type: "air",
                  fix: findFix("ARD")
                    ? "ARD"
                    : (FIXES.find((f) => f.kind === "vor")?.ident ??
                      FIXES[0]?.ident ??
                      ""),
                  bearing: 90,
                  distNm: 12,
                  altFt: 3000,
                  hdg: null,
                  iasKt: 95,
                };
                this.changed(true);
              },
            },
            "Airborne",
          ),
        ),
      );
      if (st.type === "runway") {
        const apt = AIRPORTS.find((a) => a.icao === st.airport);
        b.append(
          h(
            "div",
            { class: "cb-row" },
            this.field(
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
                  const a = AIRPORTS.find((x) => x.icao === v);
                  st.runway =
                    [...(a?.runways ?? [])].sort(
                      (p, q) => q.lengthFt - p.lengthFt,
                    )[0]?.id ?? "";
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
                    [r.id, `RWY ${r.id} · ${r.lengthFt} ft`] as [
                      string,
                      string,
                    ],
                ),
                (v) => (st.runway = v),
              ),
            ),
            this.field(
              "Initial climb (ft)",
              this.num(st.initialAlt, (v) => (st.initialAlt = v ?? 3000), {
                min: 1000,
                max: 15000,
                step: 100,
              }),
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
                { min: 0, max: 359, w: 76 },
              ),
            ),
            this.field(
              "Distance (NM)",
              this.num(st.distNm, (v) => (st.distNm = Math.max(0.5, v ?? 10)), {
                min: 0.5,
                max: 60,
                step: 0.5,
                w: 76,
              }),
            ),
            this.field(
              "Altitude (ft)",
              this.num(st.altFt, (v) => (st.altFt = v ?? 3000), {
                min: 1000,
                max: 15000,
                step: 100,
              }),
            ),
            this.field(
              "Heading (°)",
              this.num(st.hdg, (v) => (st.hdg = v), { ph: "to fix", w: 76 }),
            ),
            this.field(
              "IAS (kt)",
              this.num(st.iasKt, (v) => (st.iasKt = v ?? 95), {
                min: 60,
                max: 140,
                w: 70,
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
      const s = this.c.start;
      const t = head.querySelector(".cbx-leg-t b"),
        u = head.querySelector(".cbx-leg-t span");
      if (t)
        t.textContent =
          s.type === "runway"
            ? `Take off ${s.airport} RWY ${s.runway}`
            : `Airborne near ${s.fix}`;
      if (u)
        u.textContent =
          s.type === "runway"
            ? `Climb to ${s.initialAlt} ft`
            : `${pad3(s.bearing)}° / ${s.distNm} NM from ${s.fix} · ${s.altFt} ft · ${s.iasKt} kt`;
    });
    return card;
  }

  /** non-blocking: a procedure fix planned below its published minimum (seen on the profile) */
  private markLowLegs() {
    this.ed.querySelectorAll('.cbx-low').forEach((x) => x.remove());
    const pts = planProfile(this.c, false).pts;
    for (const p of pts) {
      if (!p.ident || p.amin === undefined || p.alt >= p.amin - 50 || p.leg < 0) continue;
      const card = this.ed.querySelector(`.cbx-leg[data-i="${p.leg}"]`);
      if (!card || card.querySelector(`.cbx-low[data-f="${p.ident}"]`)) continue;
      card.append(h("div", { class: "cbx-low", "data-f": p.ident }, svgIcon(I.warning, 13), `Planned ${Math.round(p.alt / 100) * 100} ft at ${p.ident}, below the ${p.amin} ft minimum${p.role ? ` (${p.role})` : ""}`));
    }
  }

  private legSummary(l: CircuitLeg): [string, string] {
    switch (l.type) {
      case "fix":
        return [
          l.ident ? `Direct ${l.ident}` : "Direct — choose a fix",
          l.alt ? `Cross at ${l.alt} ft` : "Keep the assigned altitude",
        ];
      case "alt":
        return [`Maintain ${l.alt} ft`, "ATC altitude change"];
      case "hold":
        return [
          `Hold at ${l.ident || "…"}`,
          `${pad3(l.inbound)}° inbound · ${l.turn === "R" ? "right" : "left"} turns · ${l.legMin} min · ${l.alt} ft · ×${l.laps}`,
        ];
      case "approach": {
        try {
          const ap = getApproach(l.approachId);
          return [
            `${ap.airport} ${ap.name}`,
            `${l.transition ? `Via ${l.transition}` : "Vectors to final"} · ${l.outcome === "land" ? "full-stop landing" : "missed approach, continue"}`,
          ];
        } catch {
          return ["Approach not available", "Not in the loaded region"];
        }
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
      this.changed(true);
    };
    const [title, sub] = this.legSummary(l);
    const failHere = c.failures.filter(
      (f) => f.trigger === "leg" && f.at === i + 1,
    );
    const card = h("div", {
      class: `cbx-leg ${l.type}${on ? " on" : ""}${errs.length ? " bad" : ""}`,
      "data-i": String(i),
    });
    const grip = h(
      "span",
      { class: "cbx-grip", title: "Drag to reorder", "aria-hidden": "true" },
      h("i"),
      h("i"),
      h("i"),
    );
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
            c.legs.splice(i, 1);
            this.selLeg = null;
            this.changed(true);
          }
          e.stopPropagation();
        },
      },
      grip,
      h("span", { class: "cbx-n" }, String(i + 1)),
      h("span", { class: "cbx-ic" }, svgIcon(TYPE_ICON[l.type], 16)),
      h(
        "div",
        { class: "cbx-leg-t" },
        h("small", { class: "cbx-kind" }, TYPE_LABEL[l.type]),
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
                    `${FAILURE_LABELS[f.key]} fails at the start of this leg`,
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
        this.iconBtn(
          "×",
          "Delete (Del)",
          () => {
            c.legs.splice(i, 1);
            this.selLeg = null;
            this.changed(true);
          },
          "del",
        ),
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
      this.changed(true);
    });
    if (on) card.append(this.legFields(l));
    for (const e of errs)
      card.append(h("div", { class: "cbx-err" }, svgIcon(I.warning, 13), e));
    this.cardRefresh.push(() => {
      const [t, s] = this.legSummary(l);
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

  private legFields(l: CircuitLeg): HTMLElement {
    const body = h("div", { class: "cb-row" });
    if (l.type === "fix") {
      body.append(
        this.field(
          "Fix",
          this.fixInput(l.ident, (v) => (l.ident = v)),
        ),
        this.field(
          "Crossing altitude (ft)",
          this.num(l.alt, (v) => (l.alt = v), {
            ph: "keep",
            step: 100,
            w: 110,
          }),
        ),
      );
    } else if (l.type === "alt") {
      body.append(
        this.field(
          "Assigned altitude (ft)",
          this.num(l.alt, (v) => (l.alt = v ?? 3000), {
            min: 1000,
            max: 15000,
            step: 100,
            w: 110,
          }),
        ),
      );
    } else if (l.type === "hold") {
      body.append(
        this.field(
          "Hold fix",
          this.fixInput(l.ident, (v) => (l.ident = v)),
        ),
        this.field(
          "Inbound course (°)",
          this.num(
            l.inbound,
            (v) =>
              (l.inbound = ((Math.round(v ?? 360) % 360) + 360) % 360 || 360),
            { min: 1, max: 360, w: 76 },
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
        this.field(
          "Altitude (ft)",
          this.num(l.alt, (v) => (l.alt = v ?? 3000), {
            min: 1000,
            max: 15000,
            step: 100,
          }),
        ),
        this.field(
          "Circuits",
          this.num(l.laps, (v) => (l.laps = Math.max(1, Math.min(6, v ?? 1))), {
            min: 1,
            max: 6,
            w: 64,
          }),
        ),
      );
    } else {
      let ap: Approach | null = null;
      try {
        ap = getApproach(l.approachId);
      } catch {
        ap = null;
      }
      const groups = approachOptions(this.circuitAirports());
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
              ...groups.map((g) => ({
                group: g.airport,
                opts: g.apps.map(
                  (a) => [a.id, `${a.airport} ${a.name}`] as [string, string],
                ),
              })),
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
              ),
            )
          : "",
        this.field(
          "Outcome",
          this.sel(
            l.outcome,
            [
              ["missed", "Missed approach, continue"],
              ["land", "Full-stop landing"],
            ],
            (v) => (l.outcome = v),
          ),
        ),
      );
    }
    return h("div", { class: "cbx-leg-b" }, body);
  }

  private buildSettings(box: HTMLElement) {
    const c = this.c;
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
    box.append(
      h(
        "div",
        { class: "cbx-set" },
        h("div", { class: "cbx-set-t" }, "Briefing"),
        desc,
      ),
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
    box.append(
      h(
        "div",
        { class: "cbx-set" },
        h("div", { class: "cbx-set-t" }, "Weather"),
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
                  (p) => [p.id, `${p.name} — ${p.desc}`] as [string, string],
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
              w: 0,
            }),
          ),
          this.field(
            "Visibility (SM)",
            this.num(w.visibilitySm ?? 10, (v) => (w.visibilitySm = v ?? 10), {
              min: 0.25,
              max: 10,
              step: 0.25,
              w: 0,
            }),
          ),
          this.field(
            "Wind from (°)",
            this.num(w.windDir ?? 250, (v) => (w.windDir = v ?? 0), {
              min: 0,
              max: 359,
              step: 10,
              w: 0,
            }),
          ),
          this.field(
            "Wind (kt)",
            this.num(w.windKt ?? 0, (v) => (w.windKt = v ?? 0), {
              min: 0,
              max: 45,
              w: 0,
            }),
          ),
          this.field(
            "Gusts (kt)",
            this.num(w.gustKt ?? 0, (v) => (w.gustKt = v ?? 0), {
              min: 0,
              max: 50,
              w: 0,
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
              w: 0,
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
    // failures
    const fbox = h(
      "div",
      { class: "cbx-set" },
      h(
        "div",
        { class: "cbx-set-t" },
        `Scheduled failures`,
        h("span", {}, String(c.failures.length)),
      ),
    );
    if (!c.failures.length)
      fbox.append(
        h(
          "p",
          { class: "cbx-empty" },
          "No failures scheduled. Add one to test the student at a chosen time or leg.",
        ),
      );
    c.failures.forEach((f, k) => {
      fbox.append(
        h(
          "div",
          { class: "cb-row cbx-failrow" },
          this.field(
            "Failure",
            this.sel(
              f.key,
              (Object.keys(FAILURE_LABELS) as (keyof Failures)[]).map(
                (x) => [x, FAILURE_LABELS[x]] as [keyof Failures, string],
              ),
              (v) => (f.key = v),
            ),
          ),
          this.field(
            "When",
            this.sel(
              f.trigger,
              [
                ["time", "After N minutes"],
                ["leg", "At the start of leg"],
              ],
              (v) => (f.trigger = v),
              true,
            ),
          ),
          this.field(
            f.trigger === "time" ? "Minutes" : "Leg #",
            this.num(f.at, (v) => (f.at = v ?? 1), {
              min: f.trigger === "time" ? 0.5 : 1,
              max: f.trigger === "leg" ? Math.max(1, c.legs.length) : 180,
              step: f.trigger === "time" ? 0.5 : 1,
              w: 70,
            }),
          ),
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
      );
    });
    fbox.append(
      h(
        "div",
        { class: "cbx-set-a" },
        h(
          "button",
          {
            class: "btn sm",
            onclick: () => {
              c.failures.push({ key: "gs", trigger: "time", at: 5 });
              this.changed(true);
            },
          },
          "+ Add a failure",
        ),
      ),
    );
    box.append(fbox);
    // options
    box.append(
      h(
        "div",
        { class: "cbx-set" },
        h("div", { class: "cbx-set-t" }, "Options"),
        h(
          "div",
          { class: "cb-row cbx-opts" },
          this.field(
            "Autopilot",
            this.sel(
              c.allowAp ? "y" : "n",
              [
                ["y", "Allowed"],
                ["n", "Not allowed (hand-flown)"],
              ],
              (v) => (c.allowAp = v === "y"),
            ),
          ),
          this.field(
            "Mode",
            this.sel(
              c.mode,
              [
                ["training", "Training (coached)"],
                ["checkride", "Checkride (ACS)"],
              ],
              (v) => (c.mode = v),
            ),
          ),
          this.field(
            "Cockpit",
            this.sel(
              c.cockpit ?? "",
              [
                ["", "Student’s choice"],
                ["g1000", "G1000 glass"],
                ["steam", "Steam gauges"],
                ["airliner", "Airliner"],
              ],
              (v) => (c.cockpit = (v || null) as Circuit["cockpit"]),
            ),
          ),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- map + profile
  private renderMapCol() {
    this.map?.destroy();
    this.prof?.destroy();
    clear(this.mapCol);
    this.mapReal = !!currentRegion();
    this.stats = h("div", { class: "cbx-stats" });
    this.map = new RouteMap(this.c, {
      height: 0,
      legNumbers: true,
      highlight: this.selLeg,
      onPickLeg: (i) => this.select(this.selLeg === i ? null : i),
    });
    this.prof = new RouteProfile(this.c, {
      height: 156,
      highlight: this.selLeg,
    });
    this.mapCol.append(
      this.stats,
      h("div", { class: "cbx-mapbox" }, this.map.el),
      h(
        "div",
        { class: "cbx-prof-t" },
        "Vertical profile",
        h(
          "span",
          {},
          "Altitudes along the circuit · glidepath and minimums on the approach",
        ),
      ),
      this.prof.el,
    );
    this.renderStats();
  }
  private updateMap() {
    if (!this.map || this.mapReal !== !!currentRegion())
      return this.renderMapCol();
    this.map.setPlan(this.c);
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
    this.stats.append(
      chip("Legs", String(c.legs.length)),
      chip("Distance", `${s.distNm.toFixed(0)} NM`),
      chip("Est. time", `${s.minutes} min`),
      chip("Holds", String(holds)),
      chip("Approaches", String(apps)),
      chip("Failures", String(c.failures.length)),
    );
  }

  // ---------------------------------------------------------------- footer
  private renderFooter() {
    clear(this.foot);
    const pr = this.problems();
    const ok = pr.all.length === 0;
    const firstLeg = [...pr.legs.keys()].sort((a, b) => a - b)[0];
    const status = ok
      ? h(
          "span",
          { class: "cbx-status ok" },
          svgIcon(I.check, 15),
          "Ready to fly",
        )
      : h(
          "button",
          {
            class: "cbx-status bad",
            title: pr.all.join("\n"),
            onclick: () => {
              this.tab = "route";
              if (firstLeg !== undefined) this.select(firstLeg);
              else if (pr.start.length) this.select(-1);
              else this.renderEditor();
            },
          },
          svgIcon(I.warning, 15),
          `${pr.all.length} issue${pr.all.length === 1 ? "" : "s"} · ${pr.general[0] ?? pr.start[0] ?? (firstLeg !== undefined ? `Leg ${firstLeg + 1}: ${pr.legs.get(firstLeg)![0]}` : pr.all[0])}`,
        );
    const saved = this.isSaved();
    this.foot.classList.add("cbx-foot");
    this.foot.append(
      ...[
      status,
      h("span", { style: "flex:1" }),
      h(
        "button",
        {
          class: "btn ghost sm",
          title: "Download this circuit as JSON",
          onclick: () =>
            this.download(
              this.c,
              `${this.c.name.replace(/[^\w-]+/g, "_")}.json`,
            ),
        },
        "Export",
      ),
      h(
        "button",
        {
          class: "btn ghost sm",
          title: "Copy a link students open to fly this circuit",
          onclick: () => this.share(),
        },
        svgIcon(I.link, 14),
        "Share link",
      ),
      h("span", { class: "cbx-sep" }),
      saved
        ? h(
            "button",
            {
              class: "btn danger-ghost",
              onclick: () => {
                if (confirm(`Delete “${this.c.name}” from your circuits?`)) {
                  circuitStore.remove(this.c.id);
                  this.toast(`Deleted “${this.c.name}”`, "info");
                  this.c = this.freshCircuit();
                  this.sourceId = null;
                  this.dirty = true;
                  this.selLeg = null;
                  this.render();
                }
              },
            },
            "Delete",
          )
        : null,
      h(
        "button",
        {
          class: "btn",
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
            this.toast("Duplicated — save to keep the copy", "info");
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
          class: "btn primary",
          disabled: !ok,
          title: ok
            ? "Fly this circuit with ATC instructions and grading"
            : "Fix the issues first",
          onclick: () => {
            this.save(true);
            this.close();
            this.onFly(clone(this.c));
          },
        },
        "Fly graded ✈",
      ),
      ].filter((x): x is HTMLElement => !!x),
    );
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

  private async share() {
    const url = `${location.origin}${location.pathname}#circuit=${encodeCircuit(this.c)}`;
    try {
      await navigator.clipboard.writeText(url);
      this.toast(
        "Share link copied — students open it to fly this circuit",
        "good",
      );
    } catch {
      prompt("Copy this link:", url);
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
    this.map?.destroy();
    this.prof?.destroy();
    this.map = null;
    this.prof = null;
  }
}

export { decodeCircuit, legText };
