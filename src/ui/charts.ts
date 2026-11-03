// Charts drawer (EFB): approach plates, SIDs, STARs and airport diagrams with zoom/pan, fit-width / fit-page,
// night mode and geo-referenced own-ship, plus the airport / navlog / weather / checklists / clearance pages.
// Charts are classified like Navigraph: REF (airport diagram & reference), DEP (SIDs), ARR (STARs) and APP
// (approaches grouped by runway, ILS before LOC before RNAV before VOR/NDB), with a filter box, pins and recents.
import { h, clear, store } from "./dom";
import { chartIndex, planProjection, type ChartEntry } from "../plates/plates";
import { rwyName } from "../plates/terminal";
import { approach, AIRPORTS, APPROACHES, TERMINAL } from "../nav/data";
import type { Approach } from "../nav/types";
import type { Sim } from "../sim/sim";
import { DEG } from "../nav/geo";
import { svgIcon } from "./icons";
import {
  airportPage,
  navlogPage,
  weatherPage,
  checklistPage,
  clearancePage,
} from "./efb";
import {
  navigraphStatus,
  navigraphCharts,
  navigraphChartImage,
  chartPixel,
  onNavigraph,
  type NgChart,
} from "../connect/navigraph";
import { toReal, currentRegion } from "../nav/world";

type App =
  | "charts"
  | "airport"
  | "navlog"
  | "weather"
  | "checklists"
  | "clearance";
type FitMode = "width" | "page";
type Cat = "REF" | "DEP" | "ARR" | "APP";

const APPS: [App, string][] = [
  ["charts", "Charts"],
  ["airport", "Airport"],
  ["navlog", "NavLog"],
  ["weather", "Weather"],
  ["checklists", "Checklists"],
  ["clearance", "Clearance"],
];
/** chart categories, in the order Navigraph and Jeppesen pilots read them */
const CATS: { id: Cat; label: string; name: string; tip: string }[] = [
  {
    id: "REF",
    label: "REF",
    name: "Reference",
    tip: "Airport diagram and reference charts",
  },
  { id: "DEP", label: "DEP", name: "Departures", tip: "Departures (SIDs)" },
  { id: "ARR", label: "ARR", name: "Arrivals", tip: "Arrivals (STARs)" },
  {
    id: "APP",
    label: "APP",
    name: "Approaches",
    tip: "Instrument approaches, by runway",
  },
];
/** precision first: ILS, LOC, LOC back course, LDA, RNAV, VOR, NDB */
const TYPE_RANK: Record<string, number> = {
  ILS: 0,
  LOC: 1,
  LOCBC: 2,
  LDA: 3,
  RNAV: 4,
  VOR: 5,
  NDB: 6,
};
const TYPE_TAG: Record<string, string> = {
  ILS: "ILS",
  LOC: "LOC",
  LOCBC: "LOC BC",
  LDA: "LDA",
  RNAV: "RNAV",
  VOR: "VOR",
  NDB: "NDB",
};

/** one row of the chart list: a built-in chart or a Navigraph chart */
export interface ChartItem {
  /** built-in chart id, or `ng:<id>` for a Navigraph chart */
  key: string;
  cat: Cat;
  airport: string;
  /** Jeppesen chart index (10-9, 11-1, …) */
  index: string;
  title: string;
  /** procedure identifier (I28R, SSTIK5) */
  ident: string;
  /** small type tag (ILS, RNAV, SID, …) */
  tag: string;
  /** runway group of an approach ('RWY 28R', 'Circling'); '' elsewhere */
  group: string;
  /** extra detail line (runways served by a SID / STAR) */
  detail: string;
  rank: number;
}

const safeApproach = (id: string): Approach | null => {
  try {
    return approach(id);
  } catch {
    return null;
  }
};
const stripApt = (id: string, apt: string) =>
  id.startsWith(`${apt}-`) ? id.slice(apt.length + 1) : id;

/** classify a built-in chart */
export function builtinItem(e: ChartEntry): ChartItem {
  const kind = e.kind as string;
  const cat: Cat =
    kind === "SID"
      ? "DEP"
      : kind === "STAR"
        ? "ARR"
        : kind === "IAP"
          ? "APP"
          : "REF";
  const it: ChartItem = {
    key: e.id,
    cat,
    airport: e.airport,
    index: e.index ?? "",
    title: e.title,
    ident: "",
    tag: "",
    group: "",
    detail: "",
    rank: 0,
  };
  if (cat === "APP") {
    const ap = safeApproach(e.approachId ?? e.id);
    const type = ap?.type ?? e.group ?? "RNAV";
    it.ident = stripApt(e.approachId ?? e.id, e.airport);
    it.tag = TYPE_TAG[type] ?? type;
    it.rank = TYPE_RANK[type] ?? 9;
    const rw = ap?.runway ?? "";
    it.group = /^\d/.test(rw) ? `RWY ${rw}` : "Circling";
  } else if (cat === "DEP" || cat === "ARR") {
    const pid = e.id.split(`-${kind}-`)[1] ?? e.id;
    it.ident = pid;
    // the list is already split SID / STAR: tag only the RNAV procedures (they need GPS)
    it.tag = /\(RNAV\)/.test(e.title) ? "RNAV" : "";
    const p = TERMINAL.find(
      (x) => x.airport === e.airport && x.kind === kind && x.id === pid,
    );
    const rws = [
      ...new Set(
        (p?.rwy ?? []).map((t) => rwyName(t.name)).filter((x) => x !== "ALL"),
      ),
    ];
    it.detail = rws.length ? `RWY ${rws.join(", ")}` : "All runways";
  } else {
    it.title = kind === "APD" ? "Airport diagram" : e.title;
    it.tag = kind === "APD" ? "APD" : "REF";
    it.detail = kind === "APD" ? "Runways, taxiways, frequencies" : "";
    it.rank = kind === "APD" ? 0 : 1;
  }
  return it;
}
/** classify a Navigraph chart */
export function navigraphItem(c: NgChart, airport: string): ChartItem {
  const cat: Cat =
    c.category === "DEP"
      ? "DEP"
      : c.category === "ARR"
        ? "ARR"
        : c.category === "APP"
          ? "APP"
          : "REF";
  const rw = c.runways?.[0] ?? "";
  const type = /^ILS/i.test(c.name)
    ? "ILS"
    : /^LOC/i.test(c.name)
      ? "LOC"
      : /^(RNAV|RNP|GPS)/i.test(c.name)
        ? "RNAV"
        : /^VOR/i.test(c.name)
          ? "VOR"
          : /^NDB/i.test(c.name)
            ? "NDB"
            : "";
  return {
    key: `ng:${c.id}`,
    cat,
    airport,
    index: c.index_number,
    title: c.name,
    ident: (c.procedures ?? []).slice(0, 3).join(", "),
    tag:
      cat === "APP"
        ? (TYPE_TAG[type] ?? "")
        : cat === "REF"
          ? ""
          : cat === "DEP"
            ? "SID"
            : "STAR",
    group:
      cat === "APP" ? (rw ? `RWY ${rw.replace(/^RW/, "")}` : "Circling") : "",
    detail:
      cat === "DEP" || cat === "ARR"
        ? c.runways?.length
          ? `RWY ${c.runways.join(", ")}`
          : ""
        : "",
    rank: cat === "APP" ? (TYPE_RANK[type] ?? 9) : 0,
  };
}
/** runway heading order: 01L, 01R, 09, 27, 28L, 28R … then circling */
function runwayKey(g: string): number {
  const m = /^RWY (\d+)([LCR]?)/.exec(g);
  if (!m) return 1e4;
  return (
    Number(m[1]) * 10 +
    (({ L: 1, C: 2, R: 3 } as Record<string, number>)[m[2]] ?? 0)
  );
}
/** the list of one category: approaches grouped by runway, the rest sorted by index then name */
export function groupItems(
  items: ChartItem[],
): { head: string; items: ChartItem[] }[] {
  const groups = new Map<string, ChartItem[]>();
  for (const it of items) {
    const g = it.group;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(it);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => runwayKey(a) - runwayKey(b) || a.localeCompare(b))
    .map(([head, list]) => ({
      head,
      items: list.sort(
        (a, b) =>
          a.rank - b.rank ||
          a.title.localeCompare(b.title, "en", { numeric: true }),
      ),
    }));
}
/** case-insensitive filter on the title, identifier, tag and runways ('ils 27', 'rnav', 'sstik') */
export function matchItem(it: ChartItem, q: string): boolean {
  const hay =
    `${it.title} ${it.ident} ${it.tag} ${it.group} ${it.detail} ${it.index} ${it.cat}`.toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

/** short label of a quick-access chip: 'ILS or LOC 27', 'RNAV (GPS) Z 28R', 'Airport diagram' */
const chipLabel = (it: ChartItem) =>
  it.cat === "DEP" || it.cat === "ARR"
    ? it.ident || it.title
    : it.title.replace(/\bRWY\s+/, "");

/** favourite star (filled when pinned); a local glyph, the shared icon set has no star */
function starIcon(on: boolean, size = 16): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", String(size));
  s.setAttribute("height", String(size));
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(NS, "path");
  p.setAttribute(
    "d",
    "M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z",
  );
  p.setAttribute("fill", on ? "currentColor" : "none");
  p.setAttribute("stroke", "currentColor");
  p.setAttribute("stroke-width", "1.6");
  p.setAttribute("stroke-linejoin", "round");
  s.append(p);
  return s;
}

export class ChartsDrawer {
  el: HTMLElement;
  private bar: HTMLElement;
  private view: HTMLElement;
  private sheet: HTMLElement;
  private ship: SVGGElement | null = null;
  private entries = chartIndex();
  private navSig = this.signature();
  current: ChartEntry | null = null;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  /** size of the current sheet in CSS px at zoom 1 (plates are 600 × 900, Navigraph charts vary) */
  private sheetW = 600;
  private sheetH = 900;
  private fitMode: FitMode =
    store.get<FitMode>("ifr.charts.fit", "width") === "page" ? "page" : "width";
  /** true once the pilot zoomed by hand: a resize then keeps the zoom instead of refitting */
  private manual = false;
  private night = store.get("ifr.charts.night", false);
  private airportSel: string;
  /** EFB applications: the chart viewer plus airport / navlog / weather / checklists / clearance pages */
  private app: App = "charts";
  private appBar = h("nav", {
    class: "efb-apps",
    role: "tablist",
    "aria-label": "EFB apps",
  });
  private page = h("div", { class: "efb-pagehost" });
  /** header: current chart (index · title · airport · procedure id), opens the chart list */
  private headIdx = h("span", { class: "efb-idx" });
  private headTitle = h("span", { class: "efb-tt" });
  private headMeta = h("span", { class: "efb-meta" });
  private headChev = svgIcon("chevDown", 16);
  private headBtn = h(
    "button",
    {
      class: "efb-title",
      "aria-haspopup": "listbox",
      "aria-expanded": "false",
    },
    this.headIdx,
    this.headTitle,
    this.headChev,
    this.headMeta,
  );
  private pinBtn = h("button", { class: "efb-pin ico" });
  /** chart list: category tabs in the toolbar, the list itself in a panel over the viewer */
  private catSeg = h("div", {
    class: "seg chart-cats",
    role: "tablist",
    "aria-label": "Chart categories",
  });
  private listCat: Cat = "APP";
  private listOpen = false;
  private query = "";
  private list = h("div", {
    class: "chart-list",
    role: "dialog",
    "aria-label": "Charts",
    hidden: true,
  });
  private scrim = h("div", { class: "chart-scrim", hidden: true });
  private search = h("input", {
    class: "cl-search",
    type: "search",
    spellcheck: "false",
    autocomplete: "off",
    "aria-label": "Filter charts",
  }) as HTMLInputElement;
  private listBody = h("div", { class: "cl-body" });
  private srcSeg = h("div", {
    class: "seg chart-src",
    role: "group",
    "aria-label": "Chart source",
  });
  private pins: string[] = store.get<string[]>("ifr.charts.pins", []);
  private recent: string[] = store.get<string[]>("ifr.charts.recent", []);
  private zoomLbl = h(
    "button",
    { class: "cz-pct", title: "Fit again (double-click the chart)" },
    "100%",
  );
  private fitSeg = h("div", {
    class: "seg cz-fit",
    role: "group",
    "aria-label": "Fit",
  });
  private nightBtn = h(
    "button",
    { class: "cz-night", title: "Night mode", "aria-label": "Night mode" },
    svgIcon("moon", 16),
    h("span", {}, "Night"),
  );
  private aptSel = h("select", {
    class: "chart-apt",
    "aria-label": "Airport",
    title: "Airport",
  }) as HTMLSelectElement;

  private renderApps() {
    clear(this.appBar);
    for (const [id, label] of APPS)
      this.appBar.append(
        h(
          "button",
          {
            class: id === this.app ? "on" : "",
            role: "tab",
            "aria-selected": id === this.app ? "true" : "false",
            onclick: () => this.setApp(id),
          },
          label,
        ),
      );
  }
  setApp(id: App) {
    this.app = id;
    this.renderApps();
    const charts = id === "charts";
    if (!charts) this.closeList();
    this.bar.style.display = charts ? "" : "none";
    this.view.style.display = charts ? "" : "none";
    this.page.style.display = charts ? "none" : "block";
    // the airport picker means nothing on the checklists and the clearance pad
    this.aptSel.style.visibility =
      id === "checklists" || id === "clearance" ? "hidden" : "";
    clear(this.page);
    if (id === "airport")
      this.page.append(
        airportPage(this.airportSel, this.sim, (apId) => {
          this.setApp("charts");
          this.show(apId);
        }),
      );
    if (id === "navlog") this.page.append(navlogPage(this.sim));
    if (id === "weather")
      this.page.append(weatherPage(this.sim, this.airportSel));
    if (id === "checklists") this.page.append(checklistPage());
    if (id === "clearance") this.page.append(clearancePage());
    this.page.scrollTop = 0;
    this.renderHead();
    if (charts) requestAnimationFrame(() => this.fit());
  }

  // ------------------------------------------------------------------ chart items
  private aptName(icao: string) {
    return AIRPORTS.find((a) => a.icao === icao)?.name ?? "";
  }
  /** every chart the list can offer: the whole region (built-in) or the selected airport (Navigraph) */
  private allItems(): ChartItem[] {
    if (this.source === "navigraph")
      return this.ngCharts.map((c) => navigraphItem(c, this.airportSel));
    return this.entries.map(builtinItem);
  }
  private itemsOf(cat: Cat): ChartItem[] {
    return this.allItems().filter(
      (x) => x.airport === this.airportSel && x.cat === cat,
    );
  }
  private currentItem(): ChartItem | null {
    if (this.source === "navigraph")
      return this.ngCurrent
        ? navigraphItem(this.ngCurrent, this.airportSel)
        : null;
    return this.current ? builtinItem(this.current) : null;
  }
  private openItem(it: ChartItem) {
    if (it.key.startsWith("ng:")) {
      const c = this.ngCharts.find((x) => `ng:${x.id}` === it.key);
      if (c) void this.showNavigraph(c);
    } else this.show(it.key);
    // keyboard users land back on the chart title, not on the page body
    const hadFocus = this.list.contains(document.activeElement);
    this.closeList();
    if (hadFocus) this.headBtn.focus({ preventScroll: true });
  }
  private togglePin(key: string) {
    const i = this.pins.indexOf(key);
    if (i >= 0) this.pins.splice(i, 1);
    else this.pins.unshift(key);
    this.pins = this.pins.slice(0, 24);
    store.set("ifr.charts.pins", this.pins);
    this.renderHead();
    if (this.listOpen) this.renderList();
  }
  private pushRecent(key: string) {
    this.recent = [key, ...this.recent.filter((k) => k !== key)].slice(0, 8);
    store.set("ifr.charts.recent", this.recent);
  }

  // ------------------------------------------------------------------ header
  /** current chart (or app) named in the drawer header, with its airport and procedure id */
  private renderHead() {
    const charts = this.app === "charts";
    const it = charts ? this.currentItem() : null;
    const apt = this.airportSel;
    const name = this.aptName(apt);
    this.headBtn.classList.toggle("static", !charts);
    this.headBtn.disabled = !charts;
    this.headChev.style.display = charts ? "" : "none";
    if (charts && it) {
      this.headIdx.textContent = it.index;
      this.headIdx.style.display = it.index ? "" : "none";
      this.headTitle.textContent = it.title;
      this.headMeta.textContent = [
        it.airport,
        this.aptName(it.airport),
        it.ident,
      ]
        .filter(Boolean)
        .join(" · ");
      this.headBtn.title = "Show all charts of this airport";
    } else {
      this.headIdx.style.display = "none";
      this.headTitle.textContent = charts
        ? "Charts"
        : APPS.find((a) => a[0] === this.app)![1];
      this.headMeta.textContent =
        this.app === "checklists"
          ? "C172 normal procedures"
          : this.app === "clearance"
            ? "IFR clearance copy pad"
            : [apt, name].filter(Boolean).join(" · ");
      this.headBtn.title = "";
    }
    // pin: charts only
    const key = it?.key ?? "";
    const on = !!key && this.pins.includes(key);
    clear(this.pinBtn);
    this.pinBtn.append(starIcon(on, 18));
    this.pinBtn.style.display = charts && key ? "" : "none";
    this.pinBtn.classList.toggle("on", on);
    this.pinBtn.setAttribute("aria-pressed", String(on));
    this.pinBtn.title = on ? "Unpin this chart" : "Pin this chart";
    this.pinBtn.setAttribute("aria-label", this.pinBtn.title);
  }

  /** category tabs with counts; the selected tab is the category being browsed (or of the open chart) */
  private renderCats() {
    clear(this.catSeg);
    const cur = this.currentItem();
    for (const c of CATS) {
      const n = this.itemsOf(c.id).length;
      const on = c.id === this.listCat;
      this.catSeg.append(
        h(
          "button",
          {
            class: `${on ? "on" : ""}${n ? "" : " none"}${cur?.cat === c.id ? " cur" : ""}`,
            role: "tab",
            "aria-selected": String(on),
            "aria-expanded": String(on && this.listOpen),
            title: `${c.tip}: ${n}`,
            onclick: () => {
              if (this.listOpen && this.listCat === c.id && !this.query)
                this.closeList();
              else this.openList(c.id);
            },
          },
          h("span", {}, c.label),
          h("i", {}, String(n)),
        ),
      );
    }
  }

  // ------------------------------------------------------------------ chart list panel
  private openList(cat?: Cat) {
    if (cat) this.listCat = cat;
    this.listOpen = true;
    this.list.hidden = false;
    this.scrim.hidden = false;
    this.headBtn.setAttribute("aria-expanded", "true");
    this.renderCats();
    this.renderList();
    requestAnimationFrame(() => {
      const cur = this.listBody.querySelector<HTMLElement>(".cl-row.cur");
      cur?.scrollIntoView({ block: "nearest" });
      this.search.focus({ preventScroll: true });
    });
  }
  private closeList() {
    if (!this.listOpen) return;
    this.listOpen = false;
    this.list.hidden = true;
    this.scrim.hidden = true;
    this.headBtn.setAttribute("aria-expanded", "false");
    if (this.query) {
      this.query = "";
      this.search.value = "";
    }
    const cur = this.currentItem();
    if (cur) this.listCat = cur.cat;
    this.renderCats();
  }
  private row(it: ChartItem, showApt = false): HTMLElement {
    const cur = this.currentItem()?.key === it.key;
    const pinned = this.pins.includes(it.key);
    const pin = h(
      "button",
      {
        class: `cl-pin${pinned ? " on" : ""}`,
        title: pinned ? "Unpin" : "Pin",
        "aria-label": `${pinned ? "Unpin" : "Pin"} ${it.title}`,
        "aria-pressed": String(pinned),
        tabindex: "-1",
        onclick: (e: Event) => {
          e.stopPropagation();
          this.togglePin(it.key);
        },
      },
      starIcon(pinned, 16),
    );
    const sub = [showApt ? it.airport : "", it.ident, it.detail]
      .filter(Boolean)
      .join(" · ");
    return h(
      "div",
      { class: `cl-item${cur ? " cur" : ""}` },
      h(
        "button",
        {
          class: `cl-row${cur ? " cur" : ""}`,
          "aria-current": cur ? "true" : null,
          onclick: () => this.openItem(it),
        },
        h("span", { class: "cl-idx" }, it.index || "—"),
        h(
          "span",
          { class: "cl-txt" },
          h("b", {}, it.title),
          sub ? h("small", {}, sub) : null,
        ),
        it.tag
          ? h(
              "span",
              { class: `cl-tag t-${it.tag.toLowerCase().replace(/\s+/g, "")}` },
              it.tag,
            )
          : null,
      ),
      pin,
    );
  }
  private renderList() {
    clear(this.listBody);
    const all = this.allItems();
    const byKey = new Map(all.map((x) => [x.key, x]));
    const mine = all.filter((x) => x.airport === this.airportSel);
    const q = this.query.trim();
    this.search.placeholder = `Filter ${this.airportSel} charts: ILS 27, RNAV, SID…`;
    if (q) {
      const hits = mine.filter((x) => matchItem(x, q));
      if (!hits.length) {
        this.listBody.append(
          h(
            "div",
            { class: "cl-empty" },
            h("b", {}, "No chart matches"),
            h("span", {}, `Nothing at ${this.airportSel} contains “${q}”.`),
          ),
        );
        return;
      }
      for (const c of CATS) {
        const list = hits.filter((x) => x.cat === c.id);
        if (!list.length) continue;
        this.listBody.append(
          h(
            "div",
            { class: "cl-h" },
            `${c.name}`,
            h("i", {}, String(list.length)),
          ),
        );
        for (const g of groupItems(list))
          for (const it of g.items) this.listBody.append(this.row(it));
      }
      return;
    }
    // quick access: pinned charts and recently opened ones (any airport of the region)
    const pinned = this.pins
      .map((k) => byKey.get(k))
      .filter(Boolean) as ChartItem[];
    const cur = this.currentItem()?.key;
    const recent = (
      this.recent.map((k) => byKey.get(k)).filter(Boolean) as ChartItem[]
    )
      .filter((x) => x.key !== cur && !this.pins.includes(x.key))
      .slice(0, 4);
    const chip = (it: ChartItem, kind: "pin" | "recent") =>
      h(
        "button",
        {
          class: `cl-chip ${kind}`,
          title: `${it.airport} ${it.index} ${it.title}`,
          onclick: () => this.openItem(it),
        },
        kind === "pin" ? starIcon(true, 13) : svgIcon("restart", 13),
        it.airport !== this.airportSel ? h("em", {}, it.airport) : null,
        h("span", {}, chipLabel(it)),
      );
    if (pinned.length || recent.length)
      this.listBody.append(
        h(
          "div",
          { class: "cl-quick" },
          pinned.length
            ? h(
                "div",
                { class: "cl-qrow" },
                h("span", { class: "cl-ql" }, "Pinned"),
                ...pinned.map((x) => chip(x, "pin")),
              )
            : null,
          recent.length
            ? h(
                "div",
                { class: "cl-qrow" },
                h("span", { class: "cl-ql" }, "Recent"),
                ...recent.map((x) => chip(x, "recent")),
              )
            : null,
        ),
      );
    const c = CATS.find((x) => x.id === this.listCat)!;
    const list = mine.filter((x) => x.cat === this.listCat);
    if (!list.length) {
      const what =
        this.listCat === "DEP"
          ? "No departure procedure (SID) is published"
          : this.listCat === "ARR"
            ? "No arrival procedure (STAR) is published"
            : this.listCat === "APP"
              ? "No instrument approach is published"
              : "No reference chart is available";
      this.listBody.append(
        h(
          "div",
          { class: "cl-empty" },
          h("b", {}, `${what} for ${this.airportSel}`),
          h(
            "span",
            {},
            this.listCat === "DEP" || this.listCat === "ARR"
              ? "Expect radar vectors. Real-world US airports come with their FAA SIDs and STARs."
              : "Pick another airport above.",
          ),
        ),
      );
      return;
    }
    for (const g of groupItems(list)) {
      this.listBody.append(
        h(
          "div",
          { class: "cl-h" },
          g.head || c.name,
          h("i", {}, String(g.items.length)),
        ),
      );
      for (const it of g.items) this.listBody.append(this.row(it));
    }
  }
  /** ↑/↓ move between rows, Esc closes; keys never reach the flight controls while the list has focus */
  private listKeys(e: KeyboardEvent) {
    e.stopPropagation();
    const rows = [
      ...this.list.querySelectorAll<HTMLButtonElement>(".cl-row, .cl-chip"),
    ];
    const i = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "Escape") {
      e.preventDefault();
      if (this.query) {
        this.query = "";
        this.search.value = "";
        this.renderList();
      } else {
        this.closeList();
        this.headBtn.focus({ preventScroll: true });
      }
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const rowsOnly = rows.filter((r) => r.classList.contains("cl-row"));
      const j = rowsOnly.indexOf(document.activeElement as HTMLButtonElement);
      const n =
        e.key === "ArrowDown"
          ? Math.min(rowsOnly.length - 1, j + 1)
          : j <= 0
            ? -1
            : j - 1;
      if (n < 0) this.search.focus();
      else rowsOnly[n]?.focus();
    } else if (e.key === "Enter" && document.activeElement === this.search) {
      e.preventDefault();
      const first = this.list.querySelector<HTMLButtonElement>(".cl-row");
      first?.click();
    } else if (
      i < 0 &&
      e.key.length === 1 &&
      document.activeElement !== this.search &&
      !e.ctrlKey &&
      !e.metaKey
    ) {
      // typing anywhere in the list filters it
      this.search.focus();
    }
  }

  /** airports offered: those with procedures first, then the rest of the loaded region */
  private fillAirports() {
    const withIap = new Set(
      this.entries.filter((e) => e.kind === "IAP").map((e) => e.airport),
    );
    const list = [...new Set(this.entries.map((e) => e.airport))].sort(
      (a, b) =>
        Number(withIap.has(b)) - Number(withIap.has(a)) || a.localeCompare(b),
    );
    clear(this.aptSel);
    for (const icao of list)
      this.aptSel.append(
        h(
          "option",
          { value: icao, selected: icao === this.airportSel },
          `${icao}${withIap.has(icao) ? "" : " (diagram)"}`,
        ),
      );
  }
  /** chart opened for an airport: its first approach in list order (an ILS when there is one), else its diagram */
  private defaultChart(icao: string): ChartEntry | null {
    const mine = this.entries.filter((x) => x.airport === icao);
    const apps = mine.filter((x) => x.kind === "IAP").map(builtinItem);
    const best = apps.sort(
      (a, b) => a.rank - b.rank || runwayKey(a.group) - runwayKey(b.group),
    )[0];
    return (
      (best && mine.find((x) => x.id === best.key)) ||
      mine[0] ||
      this.entries[0] ||
      null
    );
  }
  /** what the chart index depends on: rebuilt when a real-world region was loaded or left */
  private signature() {
    return `${AIRPORTS.length}/${APPROACHES.length}/${TERMINAL.length}/${AIRPORTS[0]?.icao ?? ""}/${currentRegion() ? 1 : 0}`;
  }
  /** rebuild after the nav database changed (real-world region loaded / left) */
  refresh() {
    this.entries = chartIndex();
    this.navSig = this.signature();
    if (!this.entries.some((e) => e.airport === this.airportSel))
      this.airportSel = this.entries[0]?.airport ?? "";
    if (this.current && !this.entries.some((e) => e.id === this.current!.id))
      this.current = null;
    this.fillAirports();
    this.renderTabs();
    const first = this.defaultChart(this.airportSel);
    if (first) this.show(first.id, false);
    if (this.app !== "charts") this.setApp(this.app);
  }

  constructor(private sim: Sim) {
    this.airportSel = "PARD";
    this.sheet = h("div", { class: "sheet" });
    this.view = h(
      "div",
      { class: `chart-view${this.night ? " night" : ""}` },
      this.sheet,
    );
    for (const [m, label, tip] of [
      ["width", "Width", "Fit the chart width (scroll to read down)"],
      ["page", "Page", "Show the whole page"],
    ] as [FitMode, string, string][])
      this.fitSeg.append(
        h(
          "button",
          { "data-fit": m, title: tip, onclick: () => this.setFit(m) },
          label,
        ),
      );
    this.nightBtn.addEventListener("click", () => this.toggleNight());
    this.zoomLbl.addEventListener("click", () => this.fit(true));
    this.headBtn.addEventListener("click", () =>
      this.listOpen
        ? this.closeList()
        : this.openList(this.currentItem()?.cat ?? this.listCat),
    );
    this.pinBtn.addEventListener("click", () => {
      const k = this.currentItem()?.key;
      if (k) this.togglePin(k);
    });
    this.search.addEventListener("input", () => {
      this.query = this.search.value;
      this.renderList();
    });
    this.list.addEventListener("keydown", (e) => this.listKeys(e));
    this.scrim.addEventListener("pointerdown", () => this.closeList());
    this.list.append(
      h("div", { class: "cl-top" }, this.srcSeg, this.search),
      this.listBody,
      h(
        "div",
        { class: "cl-foot" },
        h("span", {}, h("kbd", {}, "↑"), h("kbd", {}, "↓"), " move"),
        h("span", {}, h("kbd", {}, "Enter"), " open"),
        h("span", {}, h("kbd", {}, "Esc"), " close"),
      ),
    );
    this.bar = h(
      "div",
      { class: "chart-bar" },
      this.catSeg,
      h(
        "div",
        { class: "cz" },
        h(
          "div",
          { class: "cz-zoom", role: "group", "aria-label": "Zoom" },
          h(
            "button",
            {
              onclick: () => this.setZoom(this.zoom / 1.25),
              title: "Zoom out (Ctrl + wheel)",
              "aria-label": "Zoom out",
            },
            "−",
          ),
          this.zoomLbl,
          h(
            "button",
            {
              onclick: () => this.setZoom(this.zoom * 1.25),
              title: "Zoom in (Ctrl + wheel)",
              "aria-label": "Zoom in",
            },
            "+",
          ),
        ),
        this.fitSeg,
        this.nightBtn,
      ),
    );
    this.aptSel.addEventListener("change", () => {
      this.airportSel = this.aptSel.value;
      if (this.source === "navigraph") void this.loadNavigraph();
      else {
        const first = this.defaultChart(this.airportSel);
        if (first) this.show(first.id);
      }
      // every page follows the selected airport
      if (this.app !== "charts") this.setApp(this.app);
      else this.renderHead();
    });
    this.fillAirports();
    this.el = h(
      "aside",
      {
        class: `drawer efb${this.night ? " night" : ""}`,
        "aria-label": "Charts",
      },
      h(
        "header",
        {},
        this.headBtn,
        this.pinBtn,
        this.aptSel,
        h(
          "button",
          {
            class: "x",
            onclick: () => this.toggle(false),
            title: "Close (K)",
            "aria-label": "Close",
          },
          "×",
        ),
      ),
      this.appBar,
      this.bar,
      this.view,
      this.page,
      this.scrim,
      this.list,
    );
    this.renderApps();
    this.renderTabs();
    this.renderTools();
    this.bindPanZoom();
    onNavigraph(() => this.renderTabs());
    if (typeof ResizeObserver !== "undefined")
      new ResizeObserver(() => {
        if (this.isOpen && this.app === "charts")
          this.manual ? this.clampPan() : this.fit();
      }).observe(this.view);
  }

  /** chart source: generated plates or the user's Navigraph subscription */
  private source: "builtin" | "navigraph" = "builtin";
  private ngCharts: NgChart[] = [];
  private ngCurrent: NgChart | null = null;
  private ngShip: HTMLElement | null = null;
  /** source switch, category tabs, list and header after a change of chart, airport or source */
  private renderTabs() {
    const signed = navigraphStatus() === "signed-in";
    clear(this.srcSeg);
    this.srcSeg.style.display = signed ? "" : "none";
    if (!signed && this.source === "navigraph") this.source = "builtin";
    if (signed) {
      this.srcSeg.append(
        h(
          "button",
          {
            class: this.source === "builtin" ? "on" : "",
            "aria-pressed": String(this.source === "builtin"),
            onclick: () => {
              this.source = "builtin";
              this.renderTabs();
              if (this.current) this.show(this.current.id, false);
            },
          },
          "Built-in",
        ),
        h(
          "button",
          {
            class: this.source === "navigraph" ? "on" : "",
            "aria-pressed": String(this.source === "navigraph"),
            onclick: () => {
              this.source = "navigraph";
              void this.loadNavigraph();
            },
          },
          "Navigraph",
        ),
      );
    }
    this.renderCats();
    if (this.listOpen) this.renderList();
    this.renderHead();
  }
  private async loadNavigraph() {
    this.ngCharts = await navigraphCharts(this.airportSel);
    this.ngCurrent = null;
    this.renderTabs();
    const first =
      this.ngCharts.find((c) => c.category === "APP") ?? this.ngCharts[0];
    if (first) void this.showNavigraph(first);
    else
      this.sheet.innerHTML = `<div class="ng-empty">No Navigraph charts for ${this.airportSel} (training-region airports are fictional).</div>`;
  }
  private async showNavigraph(c: NgChart) {
    this.ngCurrent = c;
    this.listCat = navigraphItem(c, this.airportSel).cat;
    this.pushRecent(`ng:${c.id}`);
    this.renderTabs();
    const url = await navigraphChartImage(c, this.night);
    if (!url) return;
    this.sheet.innerHTML = "";
    this.ship = null;
    this.sheetW = c.width;
    this.sheetH = c.height;
    const wrap = h(
      "div",
      { class: "ng-sheet", style: `width:${c.width}px;height:${c.height}px` },
      h("img", { src: url, width: c.width, height: c.height, alt: c.name }),
    );
    this.ngShip = c.is_georeferenced ? h("div", { class: "ng-ship" }) : null;
    if (this.ngShip) wrap.append(this.ngShip);
    this.sheet.append(wrap);
    requestAnimationFrame(() => this.fit(true));
  }

  get isOpen() {
    return this.el.classList.contains("open");
  }

  toggle(open?: boolean) {
    const o = open ?? !this.isOpen;
    this.el.classList.toggle("open", o);
    document.body.classList.toggle("efb-open", o);
    if (!o) {
      this.closeList();
      return;
    }
    // the nav database changed while the drawer was closed (region loaded or left): rebuild the index
    if (this.signature() !== this.navSig) this.refresh();
    if (!this.current) {
      const id = this.sim.fp.approachId;
      const first =
        (id && this.entries.find((x) => x.id === id)) ||
        this.defaultChart(this.airportSel);
      if (first) this.show(first.id);
    } else requestAnimationFrame(() => this.fit());
    if (this.app !== "charts") this.setApp(this.app);
  }

  show(id: string, remember = true) {
    if (this.signature() !== this.navSig) {
      this.entries = chartIndex();
      this.navSig = this.signature();
      this.fillAirports();
    }
    const e = this.entries.find((x) => x.id === id);
    if (!e) return;
    if (this.source === "navigraph") this.source = "builtin";
    this.current = e;
    this.airportSel = e.airport;
    this.aptSel.value = e.airport;
    this.sheet.innerHTML = e.render();
    // charts are 600 × 900 (Jeppesen 5.5 × 8.25 in); read the real size so another format still fits
    const vb = this.sheet
      .querySelector("svg")
      ?.getAttribute("viewBox")
      ?.split(/[\s,]+/)
      .map(Number);
    this.sheetW = vb && vb[2] > 0 ? vb[2] : 600;
    this.sheetH = vb && vb[3] > 0 ? vb[3] : 900;
    const svgEl = this.sheet.querySelector<SVGSVGElement>("svg");
    if (svgEl) {
      svgEl.style.width = `${this.sheetW}px`;
      svgEl.style.height = `${this.sheetH}px`;
    }
    this.ship = null;
    this.listCat = builtinItem(e).cat;
    if (remember) this.pushRecent(e.id);
    if (e.kind === "IAP") {
      const svg = this.sheet.querySelector("svg")!;
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "ownship");
      g.innerHTML =
        '<circle r="11" fill="rgba(163,22,143,0.16)"/><path d="M0,-9 L2,-3 L8,1 L8,3 L2,1 L1,6 L4,8 L4,9 L0,8 L-4,9 L-4,8 L-1,6 L-2,1 L-8,3 L-8,1 L-2,-3 Z" fill="#a3168f" stroke="#fff" stroke-width="0.8"/>';
      svg.append(g);
      this.ship = g;
    }
    this.renderTabs();
    requestAnimationFrame(() => this.fit(true));
  }

  /** Update own-ship position on the plate. */
  update() {
    if (
      this.isOpen &&
      this.source === "navigraph" &&
      this.ngCurrent &&
      this.ngShip
    ) {
      const real = toReal(this.sim.ac.s);
      const p = chartPixel(this.ngCurrent, real.lat, real.lon);
      const bb = this.ngCurrent.bounding_boxes!.planview.pixels;
      const inside =
        p &&
        p.x >= Math.min(bb.x1, bb.x2) &&
        p.x <= Math.max(bb.x1, bb.x2) &&
        p.y >= Math.min(bb.y1, bb.y2) &&
        p.y <= Math.max(bb.y1, bb.y2);
      this.ngShip.style.display = inside ? "" : "none";
      if (p)
        this.ngShip.style.transform = `translate(${p.x}px, ${p.y}px) rotate(${(this.sim.ac.s.psi / DEG + (currentRegion()?.magVar ?? 0)).toFixed(0)}deg)`;
      return;
    }
    if (!this.isOpen || !this.ship || !this.current?.approachId) return;
    const ap = safeApproach(this.current.approachId);
    if (!ap) return;
    const { proj, box } = planProjection(ap);
    const p = proj(this.sim.ac.s);
    const inside =
      p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h;
    this.ship.style.display = inside ? "" : "none";
    this.ship.setAttribute(
      "transform",
      `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${(this.sim.ac.s.psi / DEG).toFixed(0)})`,
    );
  }

  private toggleNight() {
    this.night = !this.night;
    store.set("ifr.charts.night", this.night);
    this.renderTools();
    if (this.source === "navigraph" && this.ngCurrent)
      void this.showNavigraph(this.ngCurrent);
  }
  private setFit(m: FitMode) {
    this.fitMode = m;
    store.set("ifr.charts.fit", m);
    this.renderTools();
    this.fit(true);
  }
  /** pressed states of the toolbar (night, fit mode) */
  private renderTools() {
    this.el?.classList.toggle("night", this.night);
    this.view.classList.toggle("night", this.night);
    this.nightBtn.classList.toggle("on", this.night);
    this.nightBtn.setAttribute("aria-pressed", String(this.night));
    this.nightBtn.title = this.night ? "Day mode" : "Night mode";
    for (const b of this.fitSeg.querySelectorAll<HTMLButtonElement>("button")) {
      const on = b.dataset.fit === this.fitMode && !this.manual;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    }
  }

  private apply() {
    this.sheet.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.zoomLbl.textContent = `${Math.round(this.zoom * 100)}%`;
  }
  /** keep at least part of the sheet on screen; a sheet larger than the view cannot leave a gap past its edges */
  private clampPan() {
    const r = this.view.getBoundingClientRect();
    if (!r.width) return;
    const axis = (p: number, view: number, size: number) =>
      size + 24 <= view
        ? Math.max(12, Math.min(view - size - 12, p))
        : Math.max(view - size - 12, Math.min(12, p));
    this.panX = axis(this.panX, r.width, this.sheetW * this.zoom);
    this.panY = axis(this.panY, r.height, this.sheetH * this.zoom);
    this.apply();
  }

  private setZoom(z: number, cx?: number, cy?: number) {
    const r = this.view.getBoundingClientRect();
    const px = cx ?? r.width / 2;
    const py = cy ?? r.height / 2;
    const nz = Math.max(0.3, Math.min(5, z));
    this.panX = px - ((px - this.panX) * nz) / this.zoom;
    this.panY = py - ((py - this.panY) * nz) / this.zoom;
    this.zoom = nz;
    if (!this.manual) {
      this.manual = true;
      this.renderTools();
    }
    this.clampPan();
  }

  /** fit the chart to the viewer: full width (scroll vertically) or the whole page */
  fit(reset = false) {
    const r = this.view.getBoundingClientRect();
    if (!r.width) return;
    if (reset && this.manual) {
      this.manual = false;
      this.renderTools();
    }
    const keepY = !reset && this.fitMode === "width" ? this.panY : null;
    const zw = (r.width - 24) / this.sheetW;
    if (this.fitMode === "width") {
      this.zoom = zw;
      this.panX = 12;
      this.panY = keepY ?? 12;
    } else {
      this.zoom = Math.min(zw, (r.height - 24) / this.sheetH);
      this.panX = (r.width - this.sheetW * this.zoom) / 2;
      this.panY = 12;
    }
    this.clampPan();
  }

  private bindPanZoom() {
    let drag: { x: number; y: number } | null = null;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch: number | null = null;
    // wheel / two-finger scroll pans like any document; Ctrl + wheel (and trackpad pinch) zooms
    this.view.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const r = this.view.getBoundingClientRect();
        if (e.ctrlKey || e.metaKey) {
          this.setZoom(
            this.zoom * Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025)),
            e.clientX - r.left,
            e.clientY - r.top,
          );
          return;
        }
        const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1;
        this.panX -= (e.shiftKey ? e.deltaY : e.deltaX) * k;
        this.panY -= (e.shiftKey ? 0 : e.deltaY) * k;
        this.clampPan();
      },
      { passive: false },
    );
    this.view.addEventListener("dblclick", (e) => {
      const r = this.view.getBoundingClientRect();
      if (this.manual) this.fit(true);
      else this.setZoom(this.zoom * 1.6, e.clientX - r.left, e.clientY - r.top);
    });
    this.view.addEventListener("pointerdown", (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      drag = { x: e.clientX, y: e.clientY };
      this.view.setPointerCapture(e.pointerId);
      this.view.classList.add("grabbing");
    });
    this.view.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) this.setZoom(this.zoom * (d / pinch));
        pinch = d;
        return;
      }
      if (drag) {
        this.panX += e.clientX - drag.x;
        this.panY += e.clientY - drag.y;
        drag = { x: e.clientX, y: e.clientY };
        this.clampPan();
      }
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = null;
      if (!pts.size) {
        drag = null;
        this.view.classList.remove("grabbing");
      }
    };
    this.view.addEventListener("pointerup", up);
    this.view.addEventListener("pointercancel", up);
  }
}
