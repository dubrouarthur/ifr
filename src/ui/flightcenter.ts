// Flight Center: one hub for every flight, classified by type, with search, filters and a detail pane.
import { h, clear, store } from "./dom";
import { Modal, WX_PRESETS, type WxPreset } from "./modals";
import { CATEGORIES, catalog, type CatId, type Item } from "./catalog";
import { PATHS, type Path } from "../train/curriculum";
import { progress } from "./learn";
import { approachPlate } from "../plates/plates";
import { approach } from "../nav/data";
import { I, svgIcon } from "./icons";
import type { AssessSettings, Scenario } from "../sim/sim";
import type { Exercise } from "../train/engine";

export type CockpitType = "g1000" | "steam" | "airliner";

export interface FcHooks {
  flyScenario: (sc: Scenario, wx: WxPreset, a: AssessSettings) => void;
  briefExercise: (ex: Exercise, path: Path | null) => void;
  openPaths: () => void;
  openDrill: () => void;
  openRecords: () => void;
  openChart: (id: string) => void;
  setCockpit: (t: CockpitType) => void;
  getCockpit: () => CockpitType;
  openBuilder: (c?: import("../train/circuits").Circuit) => void;
  flyCircuit: (c: import("../train/circuits").Circuit) => void;
  planFlight: (
    t?: import("./flightsetup").FlightType,
    world?: "real" | "training",
  ) => void;
}

type View =
  | { type: "home" }
  | { type: "cat"; cat: CatId; sub: string | null }
  | { type: "path"; path: Path }
  | { type: "search" };

const DIFF = ["", "Easy", "Medium", "Hard"];
const COCKPITS: { id: CockpitType; title: string; desc: string }[] = [
  {
    id: "g1000",
    title: "G1000",
    desc: "G1000 glass: PFD + MFD, GFC 700 autopilot",
  },
  {
    id: "steam",
    title: "Steam",
    desc: "Steam gauges: six-pack, CDI/RMI, KAP 140, radio stack",
  },
  {
    id: "airliner",
    title: "Airliner",
    desc: "Airliner: Boeing-style PFD/ND with MCP",
  },
];
/** sidebar labels for the learning paths (the full title stays in the tooltip and the page heading) */
const PATH_SHORT: Record<string, string> = {
  ir: "Instrument Rating",
  classic: "VOR/NDB classics",
  emerg: "Partial panel & abnormals",
  xc: "IFR cross-country",
  ckp: "Checkride prep",
};
const QUICK = [
  "sc-ils27-vtf",
  "hold-teardrop",
  "ifr-pard-msvl-rnav",
  "app-vor-arc",
  "int-loc30",
  "sc-lda36",
];
const PLAN: {
  t: import("./flightsetup").FlightType;
  icon: keyof typeof I;
  label: string;
  tip: string;
}[] = [
  {
    t: "route",
    icon: I.route,
    label: "Route A→B",
    tip: "IFR flight from one airport to another",
  },
  {
    t: "approach",
    icon: I.approach,
    label: "Approach",
    tip: "Approach practice at one airport",
  },
  {
    t: "hold",
    icon: I.hold,
    label: "Holding",
    tip: "Holding practice over a fix",
  },
  {
    t: "free",
    icon: I.plane,
    label: "Free flight",
    tip: "Free flight, no plan required",
  },
];

const pathLabel = (p: Path) =>
  PATH_SHORT[p.id] ?? p.title.replace(" — complete syllabus", "");
const pct = (n: number) => `${Math.round(n)}%`;
/** search cards: "Category · TAG", without repeating the category in the tag (CIRCUIT · ILS → IFR circuits · ILS) */
const searchLabel = (cat: (typeof CATEGORIES)[number], tag: string) => {
  const short = cat.short.toUpperCase();
  const rest =
    tag === short || tag === cat.title.toUpperCase()
      ? ""
      : tag.startsWith(`${short} · `)
        ? tag.slice(short.length + 3)
        : tag;
  return rest ? `${cat.short} · ${rest}` : cat.title;
};

export class FlightCenter extends Modal {
  private view: View = { type: "home" };
  private q = "";
  private fDiff = 0;
  private fApt = "";
  private fAp: "" | "ap" | "hand" = "";
  private sel: Item | null = null;
  private items = catalog();
  private wx: WxPreset = WX_PRESETS[0];
  private assess: AssessSettings = store.get<AssessSettings>("ifr.assess", {
    mode: "training",
    student: "",
    handFlown: false,
    randomFailure: false,
  });
  private gridEl!: HTMLElement;
  private side!: HTMLElement;
  private main!: HTMLElement;
  private detail!: HTMLElement;
  private searchInput: HTMLInputElement | null = null;
  private plateView: HTMLElement | null = null;

  constructor(private hooks: FcHooks) {
    super("Flight Center");
    this.box.classList.add("fc");
    clear(this.body);
    this.side = h("nav", {
      class: "fc-side",
      "aria-label": "Flight Center sections",
    });
    this.main = h("section", { class: "fc-main" });
    this.detail = h("aside", {
      class: "fc-detail",
      "aria-label": "Flight details",
    });
    this.gridEl = h(
      "div",
      { class: "fc-grid no-sel" },
      this.side,
      this.main,
      this.detail,
    );
    this.body.append(this.gridEl);
    this.foot.remove();
    // "/" focuses the search field; Esc closes the plate viewer before it closes the Flight Center
    window.addEventListener(
      "keydown",
      (e) => {
        if (!this.isOpen) return;
        if (this.plateView && e.key === "Escape") {
          e.stopImmediatePropagation();
          e.preventDefault();
          this.closePlate();
          return;
        }
        const t = e.target as HTMLElement | null;
        const typing =
          !!t &&
          (t.tagName === "INPUT" ||
            t.tagName === "SELECT" ||
            t.tagName === "TEXTAREA");
        if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          this.searchInput?.focus();
        }
      },
      true,
    );
  }

  open() {
    this.items = catalog();
    this.render();
    super.open();
  }

  close() {
    this.closePlate();
    super.close();
  }

  private go(v: View) {
    this.view = v;
    this.sel = null;
    if (v.type !== "search") this.q = "";
    this.render();
    this.main.scrollTop = 0;
  }

  render() {
    this.renderSide();
    this.renderMain();
    this.renderDetail();
  }

  /** select a flight (or clear the selection): shows or hides the detail column without rebuilding the list */
  private select(i: Item | null) {
    this.sel = i;
    this.main
      .querySelectorAll<HTMLElement>("[data-id]")
      .forEach((c) => c.classList.toggle("sel", !!i && c.dataset.id === i.id));
    this.renderDetail();
  }

  // ------------------------------------------------------------------ sidebar
  private renderSide() {
    clear(this.side);
    const all = progress.all();
    const v = this.view;
    const navBtn = (
      label: string,
      on: boolean,
      fn: () => void,
      opts: { count?: string; icon?: Node; tip?: string; key?: string } = {},
    ) =>
      h(
        "button",
        {
          class: `fc-nav${on ? " on" : ""}`,
          onclick: fn,
          title: opts.tip ?? label,
          "data-nav": opts.key,
        },
        h("span", { class: "ic" }, opts.icon ?? null),
        h("span", { class: "lb" }, label),
        opts.count ? h("span", { class: "ct" }, opts.count) : null,
      );

    const search = h("input", {
      type: "search",
      placeholder: "Search",
      value: this.q,
      "aria-label": "Search flights",
    }) as HTMLInputElement;
    const clearBtn = h(
      "button",
      {
        class: "fc-search-x",
        title: "Clear search",
        "aria-label": "Clear search",
        hidden: !this.q,
        onclick: () => {
          search.value = "";
          this.onSearch("");
          search.focus();
        },
      },
      "×",
    );
    search.addEventListener("input", () => {
      clearBtn.hidden = !search.value;
      this.onSearch(search.value);
    });
    search.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape" && search.value) {
        e.preventDefault();
        search.value = "";
        clearBtn.hidden = true;
        this.onSearch("");
      }
    });
    this.searchInput = search;
    this.side.append(
      h(
        "div",
        { class: "fc-search" },
        h("span", { class: "fc-search-ic" }, svgIcon(I.target, 15)),
        search,
        clearBtn,
        h("kbd", { class: "fc-kbd", title: "Press / to search" }, "/"),
      ),
    );

    this.side.append(
      navBtn("Home", v.type === "home", () => this.go({ type: "home" }), {
        icon: svgIcon(I.home),
        key: "home",
      }),
    );
    this.side.append(h("div", { class: "fc-sec" }, "Flight types"));
    for (const c of CATEGORIES) {
      const n = this.items.filter((i) => i.cat === c.id).length;
      const on = v.type === "cat" && v.cat === c.id;
      this.side.append(
        navBtn(
          c.title,
          on && !v.sub,
          () => this.go({ type: "cat", cat: c.id, sub: null }),
          {
            count: String(n),
            icon: svgIcon(c.icon),
            tip: `${c.title} — ${c.desc}`,
          },
        ),
      );
      if (on && c.subs.length > 1) {
        for (const s of c.subs) {
          const ns = this.items.filter(
            (i) => i.cat === c.id && i.sub === s,
          ).length;
          if (!ns) continue;
          this.side.append(
            h(
              "button",
              {
                class: `fc-sub${v.sub === s ? " on" : ""}`,
                title: s,
                onclick: () => this.go({ type: "cat", cat: c.id, sub: s }),
              },
              h("span", { class: "lb" }, s),
              h("span", { class: "ct" }, String(ns)),
            ),
          );
        }
      }
    }
    this.side.append(h("div", { class: "fc-sec" }, "Learning paths"));
    for (const p of PATHS) {
      const done = p.exercises.filter((id) => all[id]?.passed).length;
      const complete = done === p.exercises.length;
      this.side.append(
        navBtn(
          pathLabel(p),
          v.type === "path" && v.path.id === p.id,
          () => this.go({ type: "path", path: p }),
          {
            icon: svgIcon(complete ? I.check : I.badge),
            count: done ? `${done}/${p.exercises.length}` : undefined,
            tip: `${p.title} — ${done}/${p.exercises.length} passed`,
          },
        ),
      );
    }
    this.side.append(h("div", { class: "fc-sec" }, "Tools"));
    this.side.append(
      navBtn(
        "Circuit builder",
        false,
        () => {
          this.close();
          this.hooks.openBuilder();
        },
        {
          icon: svgIcon(I.tools),
          tip: "IFR circuit builder: chain departures, holds and approaches",
        },
      ),
    );
    this.side.append(
      navBtn(
        "Hold-entry drill",
        false,
        () => {
          this.close();
          this.hooks.openDrill();
        },
        { icon: svgIcon(I.stopwatch), tip: "Timed hold-entry drill" },
      ),
    );
    this.side.append(
      navBtn(
        "Training records",
        false,
        () => {
          this.close();
          this.hooks.openRecords();
        },
        { icon: svgIcon(I.clipboard), tip: "Training records and debriefs" },
      ),
    );
  }

  private onSearch(q: string) {
    this.q = q;
    const wasSearch = this.view.type === "search";
    this.view = q ? { type: "search" } : { type: "home" };
    // the search is not a section: no nav item is highlighted while it runs; Home lights up again when it is emptied
    this.side
      .querySelectorAll(".fc-nav, .fc-sub")
      .forEach((b) =>
        b.classList.toggle(
          "on",
          !q && (b as HTMLElement).dataset.nav === "home",
        ),
      );
    if (!q || !wasSearch) {
      // leaving a category also folds its sub-list
      this.side.querySelectorAll(".fc-sub").forEach((b) => b.remove());
      if (this.sel && !q) this.sel = null;
    }
    this.renderMain();
    this.renderDetail();
  }

  // ------------------------------------------------------------------ lists
  private filtered(list: Item[]): Item[] {
    return list.filter(
      (i) =>
        (!this.fDiff || i.difficulty === this.fDiff) &&
        (!this.fApt || i.airport === this.fApt) &&
        (!this.fAp || (this.fAp === "ap" ? i.ap !== false : i.ap === false)),
    );
  }

  private filtersBar(list: Item[]): HTMLElement {
    const select = (
      label: string,
      value: string,
      opts: [string, string][],
      set: (v: string) => void,
    ) => {
      const s = h(
        "select",
        {
          "aria-label": label,
          title: label,
          class: value ? "set" : "",
          onchange: (e: Event) => {
            set((e.target as HTMLSelectElement).value);
            this.renderMain();
          },
        },
        ...opts.map(([v, t]) =>
          h("option", { value: v, selected: v === value }, t),
        ),
      );
      return s;
    };
    const apts = [...new Set(list.map((i) => i.airport))].sort();
    const n = this.filtered(list).length;
    const active = !!(this.fDiff || this.fApt || this.fAp);
    return h(
      "div",
      { class: "fc-filters" },
      select(
        "Level",
        String(this.fDiff || ""),
        [
          ["", "Any level"],
          ["1", DIFF[1]],
          ["2", DIFF[2]],
          ["3", DIFF[3]],
        ],
        (v) => (this.fDiff = Number(v) || 0),
      ),
      apts.length > 1 || this.fApt
        ? select(
            "Airport",
            this.fApt,
            [["", "Any airport"], ...apts.map((a) => [a, a] as [string, string])],
            (v) => (this.fApt = v),
          )
        : null,
      select(
        "Autopilot",
        this.fAp,
        [
          ["", "Autopilot or hand"],
          ["ap", "Autopilot allowed"],
          ["hand", "Hand-flown only"],
        ],
        (v) => (this.fAp = v as "" | "ap" | "hand"),
      ),
      active
        ? h(
            "button",
            { class: "fc-reset", onclick: () => this.resetFilters() },
            "Reset",
          )
        : null,
      h(
        "span",
        { class: "fc-count" },
        `${n} ${n === 1 ? "flight" : "flights"}`,
      ),
    );
  }

  private resetFilters() {
    this.fDiff = 0;
    this.fApt = "";
    this.fAp = "";
    this.renderMain();
  }

  /** label: 'tag' (inside a category), 'sub' (home), 'cat' (search: category · sub) */
  private card(i: Item, label: "tag" | "sub" | "cat"): HTMLElement {
    const p = i.kind === "exercise" ? progress.get(i.id) : undefined;
    const cat = CATEGORIES.find((c) => c.id === i.cat)!;
    const top =
      label === "tag"
        ? i.tag
        : label === "cat"
          ? searchLabel(cat, i.tag)
          : i.sub;
    const badge = p?.passed
      ? h(
          "span",
          { class: "lp-badge ok", title: `Passed, best score ${pct(p.best)}` },
          `Best ${pct(p.best)}`,
        )
      : p
        ? h(
            "span",
            {
              class: "lp-badge try",
              title: `Not passed yet, best score ${pct(p.best)}`,
            },
            `Best ${pct(p.best)}`,
          )
        : h(
            "span",
            {
              class: "lp-badge",
              title: i.graded
                ? "Scored against standards at the end"
                : "Free practice, no score",
            },
            i.graded ? "Scored" : "Practice",
          );
    const ic = (name: keyof typeof I, tip: string) =>
      h("span", { class: "fc-mi", title: tip }, svgIcon(name, 14));
    return h(
      "button",
      {
        class: `fc-card ${i.cat}${this.sel?.id === i.id ? " sel" : ""}`,
        "data-id": i.id,
        title: "Click for the briefing · double-click to fly",
        onclick: () => this.select(i),
        ondblclick: () => this.fly(i),
      },
      h(
        "div",
        { class: "fc-card-top" },
        h("span", { class: "fc-type", title: `${cat.title} · ${i.sub}` }, top),
        badge,
      ),
      h("h3", {}, i.title),
      h("p", {}, i.summary),
      h(
        "div",
        { class: "fc-meta" },
        h("span", { class: `fc-lvl d${i.difficulty}` }, DIFF[i.difficulty]),
        h("span", {}, i.airport),
        h("span", {}, `${i.minutes} min`),
        i.ap === false ? ic(I.hand, "Hand-flown: autopilot inhibited") : null,
        i.plate ? ic(I.document, "Approach plate included") : null,
      ),
    );
  }

  private grid(
    list: Item[],
    label: "tag" | "sub" | "cat",
    filter = true,
  ): HTMLElement {
    const f = filter ? this.filtered(list) : list;
    if (!f.length)
      return this.empty(
        "No flights match these filters.",
        "Reset filters",
        () => this.resetFilters(),
      );
    return h(
      "div",
      { class: "fc-cards" },
      ...f.map((i) => this.card(i, label)),
    );
  }

  private empty(msg: string, action?: string, fn?: () => void): HTMLElement {
    return h(
      "div",
      { class: "fc-none" },
      h("span", { class: "fc-none-ic" }, svgIcon(I.target, 28)),
      h("b", {}, msg),
      action && fn ? h("button", { class: "btn", onclick: fn }, action) : null,
    );
  }

  private searchResults(): Item[] {
    const words = this.q.toLowerCase().split(/\s+/).filter(Boolean);
    const score = (i: Item): number => {
      const cat = CATEGORIES.find((c) => c.id === i.cat)!;
      const title = i.title.toLowerCase();
      const group = `${i.sub} ${cat.title}`.toLowerCase();
      const rest =
        `${i.tag} ${i.tags.join(" ")} ${i.summary} ${i.airport}`.toLowerCase();
      let s = 0;
      for (const w of words) {
        const ws = title.includes(w)
          ? 3
          : group.includes(w)
            ? 2
            : rest.includes(w)
              ? 1
              : 0;
        if (!ws) return 0;
        s += ws;
      }
      return s;
    };
    return this.items
      .map((i) => ({ i, s: score(i) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || a.i.title.localeCompare(b.i.title))
      .map((r) => r.i);
  }

  // ------------------------------------------------------------------ main column
  private renderMain() {
    clear(this.main);
    const v = this.view;
    if (v.type === "home") return this.renderHome();
    if (v.type === "search") {
      const res = this.searchResults();
      this.main.append(
        h(
          "div",
          { class: "fc-head" },
          h("div", {}, h("h2", {}, `Results for “${this.q}”`)),
        ),
      );
      if (!res.length) {
        this.main.append(
          this.empty(`No flights match “${this.q}”`, "Clear search", () => {
            if (this.searchInput) this.searchInput.value = "";
            this.onSearch("");
          }),
        );
        return;
      }
      this.main.append(this.filtersBar(res), this.grid(res, "cat"));
      return;
    }
    if (v.type === "path") return this.renderPath(v.path);

    const cat = CATEGORIES.find((c) => c.id === v.cat)!;
    const inCat = this.items.filter(
      (i) => i.cat === v.cat && (!v.sub || i.sub === v.sub),
    );
    this.main.append(
      h(
        "div",
        { class: "fc-head" },
        h(
          "div",
          {},
          h(
            "h2",
            { class: "has-ico" },
            svgIcon(cat.icon, 22),
            v.sub ? `${cat.title} · ${v.sub}` : cat.title,
          ),
          h("p", { class: "muted" }, cat.desc),
        ),
      ),
      this.filtersBar(inCat),
    );
    if (v.cat === "circuits")
      this.main.append(
        h(
          "div",
          { class: "fc-builder-cta" },
          h(
            "div",
            {},
            h("b", {}, "Build your own IFR circuit"),
            h(
              "span",
              {},
              "Chain departures, holds and approaches into one graded session.",
            ),
          ),
          h(
            "button",
            {
              class: "btn",
              onclick: () => {
                this.close();
                this.hooks.openBuilder();
              },
            },
            svgIcon(I.tools),
            "Open the builder",
          ),
        ),
      );
    const shown = this.filtered(inCat);
    if (!shown.length) {
      this.main.append(
        this.empty("No flights match these filters.", "Reset filters", () =>
          this.resetFilters(),
        ),
      );
      return;
    }
    const subs = v.sub ? [v.sub] : cat.subs;
    for (const s of subs) {
      const list = shown.filter((i) => i.sub === s);
      if (!list.length) continue;
      if (!v.sub && subs.length > 1)
        this.main.append(
          h(
            "div",
            { class: "fc-sec2" },
            s,
            h("span", { class: "ct" }, String(list.length)),
          ),
        );
      this.main.append(this.grid(list, "tag", false));
    }
  }

  private renderHome() {
    const all = progress.all();
    const ir = PATHS[0];
    const nextId =
      ir.exercises.find((id) => !all[id]?.passed) ?? ir.exercises[0];
    const next = this.items.find((i) => i.id === nextId)!;
    const passed = ir.exercises.filter((id) => all[id]?.passed).length;
    this.main.append(
      h(
        "div",
        { class: "fc-hero" },
        h(
          "div",
          { class: "fc-start" },
          h("div", { class: "fc-kicker" }, "IFR Trainer"),
          h("h1", {}, "What are we flying today?"),
          h(
            "p",
            { class: "muted" },
            "Any airport in the world, real procedures, your weather — or a guided lesson.",
          ),
          h(
            "div",
            { class: "fc-start-row" },
            h(
              "button",
              {
                class: "btn primary fc-go",
                onclick: () => {
                  this.close();
                  this.hooks.planFlight("route", "real");
                },
              },
              svgIcon(I.plane, 20),
              "Start a flight",
            ),
            h(
              "span",
              { class: "fc-start-hint" },
              "Departure → destination · real world",
            ),
          ),
        ),
        next
          ? h(
              "div",
              { class: "fc-next" },
              h("small", {}, "Continue your syllabus"),
              h("b", {}, next.title),
              h(
                "span",
                {},
                `${passed}/${ir.exercises.length} exercises passed`,
              ),
              h(
                "div",
                { class: "lp-bar" },
                h("i", {
                  style: `width:${(passed / ir.exercises.length) * 100}%`,
                }),
              ),
              h(
                "button",
                { class: "btn", onclick: () => this.select(next) },
                "Open lesson",
              ),
            )
          : null,
      ),
    );
    this.main.append(h("div", { class: "fc-sec2" }, "Quick start"));
    const quick = QUICK.map((id) => this.items.find((i) => i.id === id)).filter(
      (i): i is Item => !!i,
    );
    this.main.append(
      h("div", { class: "fc-quick" }, this.grid(quick, "sub", false)),
    );
    this.main.append(
      h(
        "div",
        { class: "fc-plan" },
        h(
          "div",
          { class: "fc-plan-t" },
          h("b", {}, "Plan a custom flight"),
          h("span", {}, "Build a session: aircraft, route, weather, failures"),
        ),
        ...PLAN.map((p) =>
          h(
            "button",
            {
              class: "fc-plan-b",
              title: p.tip,
              onclick: () => {
                this.close();
                this.hooks.planFlight(p.t);
              },
            },
            svgIcon(p.icon, 18),
            h("b", {}, p.label),
          ),
        ),
      ),
    );
    this.main.append(h("div", { class: "fc-sec2" }, "Browse by flight type"));
    this.main.append(
      h(
        "div",
        { class: "fc-cats" },
        ...CATEGORIES.map((c) => {
          const n = this.items.filter((i) => i.cat === c.id).length;
          return h(
            "button",
            {
              class: `fc-cat ${c.id}`,
              title: c.desc,
              onclick: () => this.go({ type: "cat", cat: c.id, sub: null }),
            },
            h("span", { class: "fc-cat-ic" }, svgIcon(c.icon, 22)),
            h("b", {}, c.title),
            h("small", {}, `${n} ${n === 1 ? "flight" : "flights"}`),
          );
        }),
      ),
    );
  }

  private renderPath(path: Path) {
    const all = progress.all();
    const list = path.exercises
      .map((id) => this.items.find((i) => i.id === id))
      .filter((i): i is Item => !!i);
    const done = list.filter((i) => all[i.id]?.passed).length;
    this.main.append(
      h(
        "div",
        { class: "fc-head" },
        h(
          "div",
          {},
          h("h2", {}, path.title),
          h("p", { class: "muted" }, path.desc),
        ),
        h(
          "div",
          { class: "fc-path-prog" },
          h("span", {}, `${done}/${list.length} passed`),
          h(
            "div",
            { class: "lp-bar" },
            h("i", {
              style: `width:${list.length ? (done / list.length) * 100 : 0}%`,
            }),
          ),
        ),
      ),
    );
    const next = list.find((i) => !all[i.id]?.passed);
    const ol = h("ol", { class: "lp-list" });
    list.forEach((i, k) => {
      const p = all[i.id];
      const isNext = i === next;
      ol.append(
        h(
          "li",
          {
            class: `${p?.passed ? "done" : ""}${isNext ? " next" : ""}${this.sel?.id === i.id ? " sel" : ""}`,
            "data-id": i.id,
            tabindex: 0,
            onclick: () => this.select(i),
            onkeydown: (e: Event) => {
              if ((e as KeyboardEvent).key === "Enter") this.select(i);
            },
          },
          h(
            "span",
            { class: "lp-num" },
            p?.passed ? svgIcon(I.check, 15) : String(k + 1),
          ),
          h(
            "div",
            { class: "lp-txt" },
            h(
              "b",
              {},
              i.title,
              isNext ? h("span", { class: "lp-next" }, "Next") : null,
            ),
            h(
              "small",
              {},
              `${i.sub} · ${DIFF[i.difficulty]} · ${i.minutes} min`,
            ),
            h("span", {}, i.summary),
          ),
          p
            ? h(
                "span",
                { class: `lp-badge ${p.passed ? "ok" : "try"}` },
                p.passed
                  ? `Best ${pct(p.best)}`
                  : `Best ${pct(p.best)} · retry`,
              )
            : h("span", {}),
          h(
            "button",
            {
              class: `btn${isNext ? " primary" : ""}`,
              onclick: (e: Event) => {
                e.stopPropagation();
                this.fly(i, path);
              },
            },
            isNext ? "Start" : "Fly",
          ),
        ),
      );
    });
    this.main.append(ol);
  }

  // ------------------------------------------------------------------ detail column
  private renderDetail() {
    const i = this.sel;
    const prev = this.detail.querySelector(".fc-detail-body");
    const keep = prev && this.detail.dataset.id === i?.id ? prev.scrollTop : 0;
    clear(this.detail);
    this.gridEl.classList.toggle("no-sel", !i);
    this.detail.dataset.id = i?.id ?? "";
    if (!i) return;
    const cat = CATEGORIES.find((c) => c.id === i.cat)!;
    const body = h("div", { class: "fc-detail-body" });
    body.append(
      h(
        "div",
        { class: "fc-detail-head" },
        h("div", { class: "fc-kicker" }, `${cat.title} · ${i.sub}`),
        h(
          "button",
          {
            class: "fc-x",
            title: "Close details",
            "aria-label": "Close details",
            onclick: () => this.select(null),
          },
          "×",
        ),
      ),
      h("h2", {}, i.title),
      h(
        "div",
        { class: "fc-meta" },
        h("span", { class: `fc-lvl d${i.difficulty}` }, DIFF[i.difficulty]),
        h("span", {}, i.airport),
        h("span", {}, `${i.minutes} min`),
        h("span", {}, i.graded ? "Scored" : "Practice"),
        i.ap === false ? h("span", {}, "Hand-flown") : null,
      ),
      h("p", {}, i.summary),
    );
    if (i.ex) {
      body.append(
        h("div", { class: "section-t" }, "Objectives"),
        h(
          "ul",
          { class: "tips" },
          ...i.ex.objectives.map((o) => h("li", {}, o)),
        ),
      );
      body.append(
        h("div", { class: "section-t" }, "Standards"),
        h(
          "ul",
          { class: "tips" },
          ...i.ex.standards.map((o) => h("li", {}, o)),
        ),
      );
    } else if (i.sc) {
      body.append(
        h("div", { class: "section-t" }, "Briefing"),
        h("ul", { class: "tips" }, ...i.sc.briefing.map((o) => h("li", {}, o))),
      );
    }
    if (i.plate) {
      const ap = approach(i.plate);
      const svg = approachPlate(ap);
      body.append(
        h("div", { class: "section-t" }, `Plate · ${ap.airport} ${ap.name}`),
        h(
          "div",
          { class: "fc-plate" },
          h("button", {
            class: "fc-plate-img",
            title: "Open the plate",
            "aria-label": `Open the ${ap.name} plate`,
            onclick: () => this.openPlate(i.plate!, svg),
            html: svg,
          }),
          h(
            "button",
            {
              class: "btn fc-plate-open",
              onclick: () => this.openPlate(i.plate!, svg),
            },
            svgIcon(I.document, 14),
            "Open plate",
          ),
        ),
      );
    }
    body.append(this.cockpitPicker());
    if (i.kind === "scenario") {
      body.append(h("div", { class: "section-t" }, "Weather"));
      body.append(
        h(
          "select",
          {
            "aria-label": "Weather",
            onchange: (e: Event) =>
              (this.wx =
                WX_PRESETS[Number((e.target as HTMLSelectElement).value)]),
          },
          ...WX_PRESETS.map((w, k) =>
            h(
              "option",
              { value: k, selected: w === this.wx },
              `${w.name} — ${w.desc}`,
            ),
          ),
        ),
      );
      body.append(h("div", { class: "section-t" }, "Session"));
      const name = h("input", {
        type: "text",
        placeholder: "Student name (optional)",
        "aria-label": "Student name",
        value: this.assess.student,
        oninput: (e: Event) => {
          this.assess.student = (e.target as HTMLInputElement).value;
          store.set("ifr.assess", this.assess);
        },
      });
      name.addEventListener("keydown", (e) => e.stopPropagation());
      const mode = (m: AssessSettings["mode"], label: string, tip: string) =>
        h(
          "button",
          {
            class: this.assess.mode === m ? "on" : "",
            title: tip,
            onclick: () => {
              this.assess.mode = m;
              store.set("ifr.assess", this.assess);
              this.renderDetail();
            },
          },
          label,
        );
      body.append(
        name,
        h(
          "div",
          { class: "seg fc-seg" },
          mode(
            "training",
            "Training",
            "Coached: hints and call-outs during the flight",
          ),
          mode("checkride", "Checkride", "Graded against the ACS, no coaching"),
        ),
      );
      if (this.assess.mode === "checkride")
        body.append(
          h(
            "label",
            { class: "fc-check" },
            h("input", {
              type: "checkbox",
              checked: this.assess.handFlown,
              onchange: (e: Event) => {
                this.assess.handFlown = (e.target as HTMLInputElement).checked;
                store.set("ifr.assess", this.assess);
              },
            }),
            "Hand-flown (autopilot inhibited)",
          ),
          h(
            "label",
            { class: "fc-check" },
            h("input", {
              type: "checkbox",
              checked: this.assess.randomFailure,
              onchange: (e: Event) => {
                this.assess.randomFailure = (
                  e.target as HTMLInputElement
                ).checked;
                store.set("ifr.assess", this.assess);
              },
            }),
            "Random failure on the approach",
          ),
        );
    }
    if (i.circuit)
      body.append(
        h(
          "button",
          {
            class: "btn fc-edit",
            onclick: () => {
              this.close();
              this.hooks.openBuilder(i.circuit);
            },
          },
          svgIcon(I.tools),
          "Edit in the circuit builder",
        ),
      );
    const label =
      i.kind === "exercise"
        ? "Brief and fly"
        : this.assess.mode === "checkride"
          ? "Start checkride"
          : "Fly";
    this.detail.append(
      body,
      h(
        "div",
        { class: "fc-detail-foot" },
        h(
          "button",
          { class: "btn primary big", onclick: () => this.fly(i) },
          label,
        ),
      ),
    );
    body.scrollTop = keep;
  }

  private cockpitPicker(): HTMLElement {
    const cur = this.hooks.getCockpit();
    const seg = h("div", {
      class: "seg fc-seg",
      role: "group",
      "aria-label": "Cockpit",
    });
    for (const c of COCKPITS)
      seg.append(
        h(
          "button",
          {
            class: cur === c.id ? "on" : "",
            title: c.desc,
            "data-ck": c.id,
            onclick: () => {
              this.hooks.setCockpit(c.id);
              seg
                .querySelectorAll<HTMLElement>("button")
                .forEach((b) =>
                  b.classList.toggle("on", b.dataset.ck === c.id),
                );
            },
          },
          c.title,
        ),
      );
    return h("div", {}, h("div", { class: "section-t" }, "Cockpit"), seg);
  }

  // ------------------------------------------------------------------ plate viewer (inside the Flight Center)
  private openPlate(id: string, svg: string) {
    this.closePlate();
    const ap = approach(id);
    this.plateView = h(
      "div",
      {
        class: "fc-plate-view",
        role: "dialog",
        "aria-label": `${ap.airport} ${ap.name}`,
        onclick: (e: Event) => {
          if (e.target === this.plateView) this.closePlate();
        },
      },
      h(
        "div",
        { class: "fc-plate-box" },
        h(
          "div",
          { class: "fc-plate-bar" },
          h("b", {}, `${ap.airport} · ${ap.name}`),
          h("span", { class: "grow" }),
          h(
            "button",
            {
              class: "btn",
              title: "Open in the chart viewer (zoom, other plates)",
              onclick: () => {
                this.close();
                this.hooks.openChart(id);
              },
            },
            svgIcon(I.chart, 14),
            "Chart viewer",
          ),
          h(
            "button",
            {
              class: "fc-x",
              title: "Close (Esc)",
              "aria-label": "Close the plate",
              onclick: () => this.closePlate(),
            },
            "×",
          ),
        ),
        h("div", { class: "fc-plate-full", html: svg }),
      ),
    );
    this.box.append(this.plateView);
  }

  private closePlate() {
    this.plateView?.remove();
    this.plateView = null;
  }

  private fly(i: Item, path: Path | null = null) {
    this.close();
    if (i.circuit) this.hooks.flyCircuit(i.circuit);
    else if (i.ex)
      this.hooks.briefExercise(
        i.ex,
        path ?? (this.view.type === "path" ? this.view.path : null),
      );
    else if (i.sc) this.hooks.flyScenario(i.sc, this.wx, { ...this.assess });
  }
}
