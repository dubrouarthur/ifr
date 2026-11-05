// Flight Center: the single hub after the start page. The home screen has ONE primary action (Build a flight), a
// one-click Quick start, Continue (syllabus / last flight), the tools in a visible toolbar and six photo tiles.
// The full catalogue (every flight by type, search, filters, learning paths, detail pane) sits one click deeper,
// behind "Browse all flights".
import { h, clear, store } from "./dom";
import { Modal, WX_PRESETS, type WxPreset } from "./modals";
import { CATEGORIES, MINE_SUB as MINE, catalog, type CatId, type Item } from "./catalog";
import { PATHS, type Path } from "../train/curriculum";
import { progress } from "./learn";
import { history } from "./history";
import { approachPlate } from "../plates/plates";
import { findApproach, TRAINING_REGION } from "../nav/data";
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
  /** pair the instructor's phone or tablet (QR of the remote companion); the tool is shown only when wired */
  pairInstructor?: () => void;
  /** the instructor station (failures, weather, reposition); shown only when wired */
  openInstructor?: () => void;
  /** connections (data link, webhooks, Navigraph); shown only when wired */
  openConnections?: () => void;
}

type View =
  | { type: "home" }
  | { type: "instructor" }
  | { type: "all" }
  | { type: "cat"; cat: CatId; sub: string | null }
  | { type: "path"; path: Path }
  | { type: "search" };

type QuickKind = "approach" | "hold";

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
  holds: "Holding",
  emerg: "Partial panel",
  xc: "IFR cross-country",
  ckp: "Checkride prep",
};
const QUICK_KEY = "ifr.fc.quick";

const pathLabel = (p: Path) =>
  PATH_SHORT[p.id] ?? p.title.replace(" — complete syllabus", "");
const pct = (n: number) => `${Math.round(n)}%`;
const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;
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
/** "today", "yesterday", "3 days ago", "12 Mar" */
export function ago(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const day = 86400000;
  const d = Math.floor((now - t) / day);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}
const aptName = (icao: string) => {
  const a = TRAINING_REGION.airports.find((x) => x.icao === icao);
  return a
    ? a.name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
    : icao;
};

/** the flights Quick start draws from: approaches, or holds, at one airport (all airports when empty) */
export function quickPool(items: Item[], kind: QuickKind, apt: string): Item[] {
  return items.filter(
    (i) =>
      (kind === "approach"
        ? i.cat === "approaches"
        : i.cat === "procedures" && i.sub === "Holdings") &&
      (!apt || i.airport === apt),
  );
}

/** the Continue card: the next lesson of the syllabus and the last flight flown, when it is in the catalogue */
export function continueInfo(items: Item[]) {
  const all = progress.all();
  const ir = PATHS[0];
  const passed = ir.exercises.filter((id) => all[id]?.passed).length;
  const nextId = ir.exercises.find((id) => !all[id]?.passed);
  const next = nextId ? items.find((i) => i.id === nextId) : undefined;
  const lesson = nextId
    ? ir.exercises.indexOf(nextId) + 1
    : ir.exercises.length;
  const last = history.all()[0];
  const lastItem = last
    ? items.find((i) =>
        last.exercise
          ? i.id === last.exercise
          : i.kind === "scenario" && i.title === last.scenario,
      )
    : undefined;
  const started = passed > 0 || ir.exercises.some((id) => all[id]);
  return {
    path: ir,
    passed,
    total: ir.exercises.length,
    lesson,
    next,
    started,
    last:
      lastItem && last
        ? { item: lastItem, when: ago(last.date), passed: last.passed }
        : null,
  };
}

export class FlightCenter extends Modal {
  private view: View = { type: "home" };
  /** where to go back to when the search is emptied */
  private beforeSearch: View = { type: "home" };
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
  private crumb!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private searchClear!: HTMLElement;
  private plateView: HTMLElement | null = null;
  private quickPop: HTMLElement | null = null;

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
      { class: "fc-grid home" },
      this.side,
      this.main,
      this.detail,
    );
    this.body.append(this.gridEl);
    this.foot.remove();
    this.buildHeader();
    // "/" focuses the search field; Esc closes the plate viewer / Quick start before it closes the Flight Center
    window.addEventListener(
      "keydown",
      (e) => {
        if (!this.isOpen) return;
        if (e.key === "Escape" && (this.plateView || this.quickPop)) {
          e.stopImmediatePropagation();
          e.preventDefault();
          if (this.quickPop) this.closeQuick(true);
          else this.closePlate();
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
          this.searchInput.focus();
        }
      },
      true,
    );
  }

  /** header: "Flight Center" (back to the home screen) › section, the search field, close */
  private buildHeader() {
    const head = this.box.querySelector("header")!;
    const title = head.querySelector("h2")!;
    clear(title);
    title.classList.add("fc-title");
    this.crumb = h("span", { class: "fc-crumb" });
    title.append(
      h(
        "button",
        {
          class: "fc-title-home",
          title: "Flight Center home",
          onclick: () => this.go({ type: "home" }),
        },
        "Flight Center",
      ),
      this.crumb,
    );
    const search = h("input", {
      type: "search",
      placeholder: "Search all flights",
      "aria-label": "Search all flights",
      enterkeyhint: "search",
    }) as HTMLInputElement;
    const clearBtn = h(
      "button",
      {
        class: "fc-search-x",
        title: "Clear search",
        "aria-label": "Clear search",
        hidden: true,
        onclick: () => {
          search.value = "";
          this.onSearch("");
          search.focus();
        },
      },
      "×",
    );
    search.addEventListener("input", () => this.onSearch(search.value));
    search.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape" && search.value) {
        e.preventDefault();
        search.value = "";
        this.onSearch("");
      }
    });
    this.searchInput = search;
    this.searchClear = clearBtn;
    head.insertBefore(
      h(
        "div",
        { class: "fc-search" },
        h("span", { class: "fc-search-ic" }, svgIcon(I.target, 15)),
        search,
        clearBtn,
        h("kbd", { class: "fc-kbd", title: "Press / to search" }, "/"),
      ),
      head.querySelector(".x"),
    );
  }

  open() {
    this.items = catalog();
    this.render();
    super.open();
  }

  close() {
    this.closePlate();
    this.closeQuick();
    super.close();
  }

  private go(v: View) {
    this.view = v;
    this.sel = null;
    if (v.type !== "search") {
      this.q = "";
      this.searchInput.value = "";
    }
    this.closeQuick();
    this.render();
    this.main.scrollTop = 0;
  }

  /** leave the Flight Center and run a tool */
  private leave(fn: () => void) {
    this.close();
    fn();
  }

  render() {
    const home = this.view.type === "home" || this.view.type === "instructor";
    this.gridEl.classList.toggle("home", home);
    this.box.classList.toggle("fc-is-home", home);
    this.searchClear.hidden = !this.q;
    this.renderCrumb();
    if (home) clear(this.side);
    else this.renderSide();
    this.renderMain();
    this.renderDetail();
  }

  private renderCrumb() {
    const v = this.view;
    const label =
      v.type === "home"
        ? ""
        : v.type === "instructor"
          ? "Instructor"
          : v.type === "all"
            ? "All flights"
            : v.type === "search"
              ? "Search"
              : v.type === "path"
                ? pathLabel(v.path)
                : CATEGORIES.find((c) => c.id === v.cat)!.title;
    clear(this.crumb);
    if (label)
      this.crumb.append(
        h("span", { class: "fc-crumb-sep", "aria-hidden": "true" }, "/"),
        h("span", {}, label),
      );
    this.box
      .querySelector(".fc-title-home")
      ?.classList.toggle("link", v.type !== "home");
  }

  /** select a flight (or clear the selection): fills the detail column without rebuilding the list */
  private select(i: Item | null) {
    this.sel = i;
    this.main
      .querySelectorAll<HTMLElement>("[data-id]")
      .forEach((c) => c.classList.toggle("sel", !!i && c.dataset.id === i.id));
    this.renderDetail();
  }

  // ------------------------------------------------------------------ sidebar (catalogue only)
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
          "aria-current": on ? "page" : null,
        },
        h("span", { class: "ic" }, opts.icon ?? null),
        h("span", { class: "lb" }, label),
        opts.count ? h("span", { class: "ct" }, opts.count) : null,
      );

    this.side.append(
      navBtn("Home", false, () => this.go({ type: "home" }), {
        icon: svgIcon(I.home),
        key: "home",
        tip: "Flight Center home",
      }),
      navBtn("All flights", v.type === "all", () => this.go({ type: "all" }), {
        icon: svgIcon(I.records),
        key: "all",
        count: String(this.items.length),
      }),
    );
    this.side.append(h("div", { class: "fc-sec" }, "Flight types"));
    for (const c of CATEGORIES) {
      const n = this.items.filter((i) => i.cat === c.id).length;
      this.side.append(
        navBtn(
          c.title,
          v.type === "cat" && v.cat === c.id,
          () => this.go({ type: "cat", cat: c.id, sub: null }),
          {
            count: String(n),
            icon: svgIcon(c.icon),
            tip: `${c.title} — ${c.desc}`,
            key: c.id,
          },
        ),
      );
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
            icon: svgIcon(complete ? I.check : I.learn),
            // the count appears once the path is started, so the names fit the sidebar
            count: done ? `${done}/${p.exercises.length}` : undefined,
            tip: `${p.title} — ${done}/${p.exercises.length} passed`,
          },
        ),
      );
    }
    this.side.append(h("div", { class: "fc-sec" }, "Tools"));
    for (const t of this.tools(false))
      this.side.append(
        navBtn(t.label, false, () => this.leave(t.run), {
          icon: svgIcon(t.icon),
          tip: t.tip,
        }),
      );
  }

  /** the tools, in the home toolbar and the catalogue sidebar (only the wired ones) */
  private tools(withPair: boolean) {
    const hk = this.hooks;
    const list: {
      label: string;
      sub: string;
      icon: keyof typeof I;
      tip: string;
      run: () => void;
    }[] = [
      {
        label: "Flight builder",
        sub: "Route, procedures, weather",
        icon: I.plan,
        tip: "The flight builder, where every flight and IFR circuit is set up (reopens your last flight)",
        run: () => hk.openBuilder(),
      },
      {
        label: "Hold-entry drill",
        sub: "Timed entry decisions",
        icon: I.stopwatch,
        tip: "Timed drill: pick the right entry for random holds",
        run: () => hk.openDrill(),
      },
      {
        label: "Training records",
        sub: "Debriefs and CSV export",
        icon: I.clipboard,
        tip: "Every flight flown, debriefs and CSV export",
        run: () => hk.openRecords(),
      },
    ];
    if (withPair && hk.pairInstructor)
      list.push({
        label: "Pair instructor",
        sub: "Phone or tablet, by QR code",
        icon: I.tablet,
        tip: "Pair the instructor's phone or tablet (QR code)",
        run: hk.pairInstructor,
      });
    if (hk.openConnections)
      list.push({
        label: "Connections",
        sub: "Data link, webhooks, charts",
        icon: I.link,
        tip: "Data link, webhooks and chart accounts",
        run: hk.openConnections,
      });
    return list;
  }

  private onSearch(q: string) {
    const was = this.view.type === "search";
    if (q && !was) this.beforeSearch = this.view;
    this.q = q;
    this.searchClear.hidden = !q;
    this.sel = null;
    this.view = q ? { type: "search" } : this.beforeSearch;
    if (!q && this.beforeSearch.type === "search") this.view = { type: "home" };
    this.closeQuick();
    this.render();
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
    ) =>
      h(
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
            [
              ["", "Any airport"],
              ...apts.map((a) => [a, a] as [string, string]),
            ],
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
      h("span", { class: "fc-count" }, plural(n, "flight")),
    );
  }

  private resetFilters() {
    this.fDiff = 0;
    this.fApt = "";
    this.fAp = "";
    this.renderMain();
  }

  /** label: 'tag' (inside a category), 'sub' (by sub-type), 'cat' (search / all: category · sub) */
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
        title: "Click for the briefing · double-click (or Enter again) to fly",
        // keyboard: the first Enter opens the briefing, the second one flies
        onclick: (e: Event) =>
          (e as MouseEvent).detail === 0 && this.sel?.id === i.id
            ? this.fly(i)
            : this.select(i),
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

  private empty(
    msg: string,
    action?: string,
    fn?: () => void,
    sub?: string,
  ): HTMLElement {
    return h(
      "div",
      { class: "fc-none" },
      h("span", { class: "fc-none-ic" }, svgIcon(I.target, 28)),
      h("b", {}, msg),
      sub ? h("span", {}, sub) : null,
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
    if (v.type === "instructor") return this.renderInstructor();
    if (v.type === "path") return this.renderPath(v.path);
    if (v.type === "search") {
      const res = this.searchResults();
      this.main.append(
        h(
          "div",
          { class: "fc-head" },
          h(
            "div",
            {},
            h("h2", {}, `Results for “${this.q}”`),
          ),
        ),
      );
      if (!res.length) {
        this.main.append(
          this.empty(
            `No flights match “${this.q}”`,
            "Clear search",
            () => {
              this.searchInput.value = "";
              this.onSearch("");
            },
            "Try an airport (PARD), a procedure (ILS, hold, arc) or a skill (partial panel).",
          ),
        );
        return;
      }
      this.main.append(this.filtersBar(res), this.grid(res, "cat"));
      return;
    }
    if (v.type === "all") {
      this.main.append(
        h(
          "div",
          { class: "fc-head" },
          h(
            "div",
            {},
            h("h2", {}, "All flights"),
            h(
              "p",
              { class: "muted" },
              "Every lesson, approach, procedure and circuit, by flight type.",
            ),
          ),
        ),
        this.filtersBar(this.items),
      );
      const shown = this.filtered(this.items);
      if (!shown.length) {
        this.main.append(
          this.empty("No flights match these filters.", "Reset filters", () =>
            this.resetFilters(),
          ),
        );
        return;
      }
      for (const c of CATEGORIES) {
        const list = shown.filter((i) => i.cat === c.id);
        if (!list.length) continue;
        this.main.append(
          h(
            "div",
            { class: "fc-sec2" },
            h("span", { class: "fc-sec2-ic" }, svgIcon(c.icon, 16)),
            c.title,
            h("span", { class: "ct" }, String(list.length)),
            h(
              "button",
              {
                class: "fc-more",
                onclick: () => this.go({ type: "cat", cat: c.id, sub: null }),
              },
              "Open",
              svgIcon(I.arrow, 14),
            ),
          ),
          this.grid(list, "tag", false),
        );
      }
      return;
    }

    const cat = CATEGORIES.find((c) => c.id === v.cat)!;
    const inCatAll = this.items.filter((i) => i.cat === v.cat);
    const inCat = inCatAll.filter((i) => !v.sub || i.sub === v.sub);
    this.main.append(
      h(
        "div",
        { class: "fc-head" },
        h(
          "div",
          {},
          h("h2", { class: "has-ico" }, svgIcon(cat.icon, 22), cat.title),
          h("p", { class: "muted" }, cat.desc),
        ),
      ),
    );
    // the sub-types are chips above the list (the sidebar never grows or collapses)
    const subs = cat.subs.filter(
      (s) => v.cat === "circuits" || inCatAll.some((i) => i.sub === s),
    );
    if (subs.length > 1) {
      const chip = (label: string, sub: string | null, n: number) =>
        h(
          "button",
          {
            class: `fc-chip${v.sub === sub ? " on" : ""}`,
            "aria-pressed": String(v.sub === sub),
            onclick: () => this.go({ type: "cat", cat: cat.id, sub }),
          },
          label,
          h("span", { class: "ct" }, String(n)),
        );
      this.main.append(
        h(
          "div",
          { class: "fc-chips", role: "group", "aria-label": "Type" },
          chip("All", null, inCatAll.length),
          ...subs.map((s) =>
            chip(s, s, inCatAll.filter((i) => i.sub === s).length),
          ),
        ),
      );
    }
    this.main.append(this.filtersBar(inCat));
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
              "In the flight builder: chain departures, holds and approaches into one graded session, then share it with a link.",
            ),
          ),
          h(
            "button",
            {
              class: "btn",
              onclick: () => this.leave(() => this.hooks.openBuilder()),
            },
            svgIcon(I.plan),
            "Open the flight builder",
          ),
        ),
      );
    const shown = this.filtered(inCat);
    const mine = v.cat === "circuits" && (!v.sub || v.sub === MINE);
    if (!shown.length && !mine) {
      this.main.append(
        this.empty("No flights match these filters.", "Reset filters", () =>
          this.resetFilters(),
        ),
      );
      return;
    }
    for (const s of v.sub ? [v.sub] : cat.subs) {
      const list = shown.filter((i) => i.sub === s);
      const emptyMine =
        s === MINE && !inCatAll.some((i) => i.sub === s);
      if (!list.length && !emptyMine) continue;
      if (!v.sub && subs.length > 1)
        this.main.append(
          h(
            "div",
            { class: "fc-sec2" },
            s,
            h("span", { class: "ct" }, String(list.length)),
          ),
        );
      this.main.append(
        emptyMine
          ? this.empty(
              "No flights of your own yet",
              undefined,
              undefined,
              "Flights you save in the flight builder, or open from a shared link, appear here.",
            )
          : this.grid(list, "tag", false),
      );
    }
  }

  // ------------------------------------------------------------------ home
  private renderHome() {
    const ci = continueInfo(this.items);
    const hero = h(
      "section",
      { class: "fc-hero2" },
      h("img", {
        class: "fc-hero-img",
        src: "/img/clouds.jpg",
        alt: "",
        decoding: "async",
      }),
      h(
        "div",
        { class: "fc-hero-txt" },
        h("h1", {}, "What are we flying today?"),
        h(
          "p",
          {},
          "Every flight is set up in the flight builder: airports, route, holds and approaches, weather and failures. Or let Quick start pick one for you.",
        ),
        h(
          "div",
          { class: "fc-hero-acts" },
          h(
            "button",
            {
              class: "btn primary fc-go",
              title:
                "Open the flight builder: departure, route, approach, weather, failures",
              onclick: () => this.leave(() => this.hooks.planFlight()),
            },
            svgIcon(I.plan, 20),
            "Build a flight",
          ),
          h(
            "button",
            {
              class: "btn fc-quick-b",
              "aria-haspopup": "dialog",
              "aria-expanded": "false",
              title:
                "One click: a random approach or hold, flown straight away",
              onclick: (e: Event) =>
                this.quickPop
                  ? this.closeQuick()
                  : this.openQuick(e.currentTarget as HTMLElement),
            },
            svgIcon(I.dice, 18),
            "Quick start",
            svgIcon(I.chevDown, 14),
          ),
        ),
      ),
      this.continueCard(ci),
    );
    const tools = h(
      "div",
      { class: "fc-tools", role: "toolbar", "aria-label": "Tools" },
      ...this.tools(true).map((t) =>
        h(
          "button",
          { class: "fc-tool", title: t.tip, onclick: () => this.leave(t.run) },
          h("span", { class: "fc-tool-ic" }, svgIcon(t.icon, 18)),
          h(
            "span",
            { class: "fc-tool-tx" },
            h("b", {}, t.label),
            h("small", {}, t.sub),
          ),
        ),
      ),
      h(
        "button",
        {
          class: "fc-tool fc-browse",
          title:
            "Every flight by type, with search, filters and learning paths",
          onclick: () => this.go({ type: "all" }),
        },
        h("span", { class: "fc-tool-ic" }, svgIcon(I.records, 18)),
        h(
          "span",
          { class: "fc-tool-tx" },
          h("b", {}, "Browse all flights"),
          h("small", {}, `${this.items.length} flights · search, paths`),
        ),
        svgIcon(I.arrow, 16),
      ),
    );
    const n = (f: (i: Item) => boolean) => this.items.filter(f).length;
    const nApp = n((i) => i.cat === "approaches");
    const nHold = n((i) => i.cat === "procedures" && i.sub === "Holdings");
    const nMine = n((i) => i.cat === "circuits" && i.sub === MINE);
    const nCirc = n((i) => i.cat === "circuits");
    const tiles = h(
      "div",
      { class: "fc-tiles" },
      this.tile({
        img: "hero-cockpit",
        title: "Learn the syllabus",
        desc: "The Instrument Rating, lesson by lesson, from the first scan to the checkride.",
        meta: `${ci.passed} of ${ci.total} passed`,
        bar: ci.passed / ci.total,
        run: () => this.go({ type: "path", path: ci.path }),
      }),
      this.tile({
        img: "landing",
        title: "Practise approaches",
        desc: "ILS, LOC, VOR, NDB, RNAV and circling, coupled or hand-flown.",
        meta: plural(nApp, "approach", "approaches"),
        run: () => this.go({ type: "cat", cat: "approaches", sub: null }),
      }),
      this.tile({
        img: "above",
        title: "Practise holds",
        desc: "Direct, teardrop and parallel entries, wind correction, ATC clearances.",
        meta: plural(nHold, "hold"),
        run: () => this.go({ type: "cat", cat: "procedures", sub: "Holdings" }),
      }),
      this.tile({
        img: "sky",
        title: "My flights & circuits",
        desc: "Your saved and shared flights, school presets and templates.",
        meta: nMine
          ? `${plural(nMine, "flight")} of yours · in the flight builder`
          : `${plural(nCirc, "school preset")} · in the flight builder`,
        run: () => this.leave(() => this.hooks.openBuilder()),
      }),
      this.tile({
        img: "crew",
        title: "Instructor",
        desc: "Pair a phone, build a lesson, run the session and review the records.",
        meta: "School tools",
        run: () => this.go({ type: "instructor" }),
      }),
      this.tile({
        img: "steam",
        title: "Academy",
        desc: "Short interactive lessons: holds, intercepts, arcs, plates and minimums.",
        meta: "Opens in a new tab",
        href: "/academy.html",
      }),
    );
    this.main.append(h("div", { class: "fc-home" }, hero, tools, tiles));
  }

  private continueCard(ci: ReturnType<typeof continueInfo>): HTMLElement {
    const card = h("aside", { class: "fc-cont", "aria-label": "Continue" });
    card.append(
      h("div", { class: "fc-cont-k" }, ci.started ? "Continue" : "Start here"),
    );
    if (ci.next) {
      card.append(
        h(
          "div",
          { class: "fc-cont-sub" },
          `${pathLabel(ci.path)} · Lesson ${ci.lesson} of ${ci.total}`,
        ),
        h("b", { class: "fc-cont-t" }, ci.next.title),
        h(
          "div",
          { class: "fc-cont-prog" },
          h(
            "div",
            { class: "lp-bar" },
            h("i", { style: `width:${(ci.passed / ci.total) * 100}%` }),
          ),
          h("span", {}, `${ci.passed}/${ci.total}`),
        ),
        h(
          "button",
          {
            class: "btn fc-cont-go",
            title: "Brief and fly the next lesson",
            onclick: () => this.fly(ci.next!, ci.path),
          },
          ci.started ? "Continue lesson" : "Start lesson 1",
          svgIcon(I.arrow, 16),
        ),
      );
    } else {
      card.append(
        h("b", { class: "fc-cont-t" }, "Syllabus complete"),
        h(
          "div",
          { class: "fc-cont-sub" },
          `All ${ci.total} lessons passed. Keep current with the checkride profiles.`,
        ),
        h(
          "button",
          {
            class: "btn fc-cont-go",
            onclick: () =>
              this.go({ type: "cat", cat: "checkride", sub: null }),
          },
          "Checkride profiles",
          svgIcon(I.arrow, 16),
        ),
      );
    }
    if (ci.last) {
      const last = ci.last;
      card.append(
        h(
          "div",
          { class: "fc-cont-last" },
          h(
            "div",
            {},
            h("small", {}, `Last flight · ${last.when}`),
            h("span", { title: last.item.title }, last.item.title),
          ),
          h(
            "button",
            {
              class: "btn ghost",
              title: `Fly “${last.item.title}” again`,
              onclick: () => this.fly(last.item),
            },
            svgIcon(I.restart, 15),
            "Fly again",
          ),
        ),
      );
    }
    return card;
  }

  private tile(t: {
    img: string;
    title: string;
    desc: string;
    meta: string;
    bar?: number;
    run?: () => void;
    href?: string;
  }): HTMLElement {
    const inner = [
      h(
        "span",
        { class: "fc-tile-img" },
        h("img", {
          src: `/img/${t.img}.jpg`,
          alt: "",
          decoding: "async",
        }),
      ),
      h(
        "span",
        { class: "fc-tile-txt" },
        h("b", {}, t.title, t.href ? svgIcon(I.direct, 14) : null),
        h("span", { class: "fc-tile-d" }, t.desc),
        h(
          "span",
          { class: "fc-tile-m" },
          t.bar !== undefined
            ? h(
                "span",
                { class: "lp-bar" },
                h("i", { style: `width:${t.bar * 100}%` }),
              )
            : null,
          h("span", {}, t.meta),
        ),
      ),
    ];
    return t.href
      ? h(
          "a",
          {
            class: "fc-tile",
            href: t.href,
            target: "_blank",
            rel: "noopener",
          },
          ...inner,
        )
      : h("button", { class: "fc-tile", onclick: t.run }, ...inner);
  }

  // ------------------------------------------------------------------ Quick start
  private quickPrefs(): { apt: string } {
    return store.get<{ apt: string }>(QUICK_KEY, { apt: "" });
  }

  private openQuick(anchor: HTMLElement) {
    this.closeQuick();
    const pref = this.quickPrefs();
    const apts = [
      ...new Set(
        [
          ...quickPool(this.items, "approach", ""),
          ...quickPool(this.items, "hold", ""),
        ].map((i) => i.airport),
      ),
    ].sort();
    if (pref.apt && !apts.includes(pref.apt)) pref.apt = "";
    const pop = h("div", {
      class: "fc-pop",
      role: "dialog",
      "aria-label": "Quick start",
    });
    const opts = h("div", { class: "fc-pop-opts" });
    const fill = () => {
      clear(opts);
      const kinds: [QuickKind, string, keyof typeof I, string][] = [
        [
          "approach",
          "Random approach",
          I.approach,
          "ILS, LOC, VOR, NDB or RNAV",
        ],
        ["hold", "Random hold", I.hold, "Entries, timing, wind"],
      ];
      for (const [k, label, icon, sub] of kinds) {
        const pool = quickPool(this.items, k, pref.apt);
        opts.append(
          h(
            "button",
            {
              class: "fc-pop-b",
              disabled: !pool.length,
              title: pool.length
                ? `Fly one of ${plural(pool.length, "flight")} at random`
                : `No ${k} at ${pref.apt} yet`,
              onclick: () => {
                const it = pool[Math.floor(Math.random() * pool.length)];
                if (it) this.fly(it);
              },
            },
            h("span", { class: "fc-pop-ic" }, svgIcon(icon, 20)),
            h(
              "span",
              { class: "fc-pop-tx" },
              h("b", {}, label),
              h(
                "small",
                {},
                pool.length
                  ? `${sub} · ${plural(pool.length, "flight")}`
                  : "None at this airport",
              ),
            ),
            svgIcon(I.arrow, 16),
          ),
        );
      }
    };
    const sel = h(
      "select",
      {
        "aria-label": "Airport",
        onchange: (e: Event) => {
          pref.apt = (e.target as HTMLSelectElement).value;
          store.set(QUICK_KEY, pref);
          fill();
        },
      },
      h("option", { value: "", selected: !pref.apt }, "Any airport"),
      ...apts.map((a) =>
        h(
          "option",
          { value: a, selected: a === pref.apt },
          `${a} · ${aptName(a)}`,
        ),
      ),
    );
    fill();
    pop.append(
      h(
        "div",
        { class: "fc-pop-head" },
        h("b", {}, "Quick start"),
        h("span", {}, "Flies straight away, current weather"),
      ),
      h(
        "label",
        { class: "fc-pop-apt" },
        h("span", {}, "Airport · training region"),
        sel,
      ),
      opts,
    );
    // under the button, inside the Flight Center box
    const box = this.box.getBoundingClientRect();
    const r = anchor.getBoundingClientRect();
    pop.style.left = `${Math.max(12, r.left - box.left)}px`;
    pop.style.top = `${r.bottom - box.top + 8}px`;
    this.box.append(pop);
    this.quickPop = pop;
    anchor.setAttribute("aria-expanded", "true");
    const off = (e: Event) => {
      if (!pop.contains(e.target as Node) && !anchor.contains(e.target as Node))
        this.closeQuick();
    };
    setTimeout(() => document.addEventListener("pointerdown", off, true));
    pop.dataset.off = "1";
    (pop as HTMLElement & { _off?: (e: Event) => void })._off = off;
    requestAnimationFrame(() =>
      pop
        .querySelector<HTMLElement>(".fc-pop-b:not([disabled])")
        ?.focus({ preventScroll: true }),
    );
  }

  private closeQuick(refocus = false) {
    const pop = this.quickPop as
      | (HTMLElement & { _off?: (e: Event) => void })
      | null;
    if (!pop) return;
    if (pop._off) document.removeEventListener("pointerdown", pop._off, true);
    pop.remove();
    this.quickPop = null;
    const b = this.box.querySelector<HTMLElement>(".fc-quick-b");
    b?.setAttribute("aria-expanded", "false");
    if (refocus) b?.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ instructor
  private renderInstructor() {
    const hk = this.hooks;
    type Act = {
      icon: keyof typeof I;
      title: string;
      desc: string;
      label: string;
      run: () => void;
      leave?: boolean;
    };
    const acts: Act[] = [];
    if (hk.pairInstructor)
      acts.push({
        icon: I.tablet,
        title: "Pair a phone or tablet",
        desc: "Scan a QR code and run the lesson from the right seat: failures, weather, freeze, reposition.",
        label: "Pair instructor",
        run: hk.pairInstructor,
        leave: true,
      });
    if (hk.openInstructor)
      acts.push({
        icon: I.instructor,
        title: "Instructor station",
        desc: "Fail instruments, change the weather and move the aircraft on this screen.",
        label: "Open the station",
        run: hk.openInstructor,
        leave: true,
      });
    acts.push(
      {
        icon: I.plan,
        title: "Build a lesson",
        desc: "In the flight builder: chain a departure, holds and approaches with weather and scheduled failures, or start from a school preset. Share it with a link.",
        label: "Open the flight builder",
        run: () => hk.openBuilder(),
        leave: true,
      },
      {
        icon: I.badge,
        title: "Checkride profiles",
        desc: "Full practical-test profiles graded against the ACS, with no coaching.",
        label: "Open profiles",
        run: () => this.go({ type: "cat", cat: "checkride", sub: null }),
      },
      {
        icon: I.clipboard,
        title: "Training records",
        desc: "Every flight with its debrief, filterable by student, exportable as CSV.",
        label: "Open records",
        run: () => hk.openRecords(),
        leave: true,
      },
    );
    if (hk.openConnections)
      acts.push({
        icon: I.link,
        title: "Connections",
        desc: "Send results to your school's system, link chart accounts and external tools.",
        label: "Open connections",
        run: hk.openConnections,
        leave: true,
      });
    this.main.append(
      h(
        "div",
        { class: "fc-home fc-ins" },
        h(
          "div",
          { class: "fc-head" },
          h(
            "div",
            {},
            h(
              "button",
              { class: "fc-back", onclick: () => this.go({ type: "home" }) },
              svgIcon(I.arrow, 14),
              "Flight Center",
            ),
            h("h2", {}, "Instructor"),
            h(
              "p",
              { class: "muted" },
              "Prepare the lesson, run it from the right seat, then debrief from the records.",
            ),
          ),
        ),
        h(
          "div",
          { class: "fc-acts" },
          ...acts.map((a) =>
            h(
              "button",
              {
                class: "fc-act",
                onclick: () => (a.leave ? this.leave(a.run) : a.run()),
              },
              h("span", { class: "fc-act-ic" }, svgIcon(a.icon, 22)),
              h(
                "span",
                { class: "fc-act-tx" },
                h("b", {}, a.title),
                h("span", {}, a.desc),
              ),
              h("span", { class: "fc-act-go" }, a.label, svgIcon(I.arrow, 14)),
            ),
          ),
        ),
      ),
    );
  }

  // ------------------------------------------------------------------ learning path
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
              if ((e as KeyboardEvent).key === "Enter")
                this.sel?.id === i.id ? this.fly(i, path) : this.select(i);
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
    if (!i) {
      // empty state: what the pane is for, and the shortcuts
      const key = (k: string, what: string) =>
        h("li", {}, h("kbd", {}, k), h("span", {}, what));
      this.detail.append(
        h(
          "div",
          { class: "fc-detail-empty" },
          h("span", { class: "fc-none-ic" }, svgIcon(I.document, 28)),
          h("b", {}, "Select a flight"),
          h(
            "span",
            {},
            "Its briefing, objectives, approach plate and cockpit options appear here.",
          ),
          h(
            "ul",
            { class: "fc-keys", "aria-label": "Shortcuts" },
            key("Click", "Briefing"),
            key("Double-click", "Fly"),
            key("Enter", "Briefing, then fly"),
            key("/", "Search"),
            key("Esc", "Close"),
          ),
        ),
      );
      return;
    }
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
    const plateAp = i.plate ? findApproach(i.plate) : undefined;
    if (i.plate && plateAp) {
      const ap = plateAp;
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
          svgIcon(I.plan),
          "Edit in the flight builder",
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
    const ap = findApproach(id);
    if (!ap) return;
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
