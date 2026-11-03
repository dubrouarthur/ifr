// Charts drawer (EFB): approach plates & airport diagrams with zoom/pan, fit-width / fit-page, night mode and
// geo-referenced own-ship, plus the airport / navlog / weather / checklists / clearance pages.
import { h, clear, store } from "./dom";
import { chartIndex, planProjection, type ChartEntry } from "../plates/plates";
import { approach } from "../nav/data";
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

/** procedure groups of the chart selector, in the order a pilot looks for them */
const GROUPS: [string, string][] = [
  ["APD", "Airport"],
  ["ILS", "ILS"],
  ["RNAV", "RNAV (GPS)"],
  ["LOC", "LOC"],
  ["VOR", "VOR"],
  ["NDB", "NDB"],
  ["LDA", "LDA"],
];
function groupOf(e: ChartEntry): string {
  if (e.kind === "APD") return "APD";
  let t: string;
  try {
    t = approach(e.approachId ?? e.id).type;
  } catch {
    t = "RNAV";
  }
  return t === "LOCBC" ? "LOC" : t;
}
const NG_CATS: [NgChart["category"], string][] = [
  ["APT", "Airport"],
  ["DEP", "Departures"],
  ["ARR", "Arrivals"],
  ["APP", "Approaches"],
  ["REF", "Reference"],
];

export class ChartsDrawer {
  el: HTMLElement;
  private bar: HTMLElement;
  private view: HTMLElement;
  private sheet: HTMLElement;
  private ship: SVGGElement | null = null;
  private entries = chartIndex();
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
  private appBar = h("nav", { class: "efb-apps", role: "tablist" });
  private page = h("div", { class: "efb-pagehost" });
  private sub = h("span", { class: "efb-cur" });
  private chartSel = h("select", {
    class: "chart-sel",
    "aria-label": "Chart",
  }) as HTMLSelectElement;
  private srcSeg = h("div", { class: "seg chart-src" });
  private zoomLbl = h(
    "button",
    { class: "cz-pct", title: "Fit again" },
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
  }) as HTMLSelectElement;

  private renderApps() {
    clear(this.appBar);
    const apps: [App, string][] = [
      ["charts", "Charts"],
      ["airport", "Airport"],
      ["navlog", "NavLog"],
      ["weather", "Weather"],
      ["checklists", "Checklists"],
      ["clearance", "Clearance"],
    ];
    for (const [id, label] of apps)
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
    this.renderSub();
    if (charts) requestAnimationFrame(() => this.fit());
  }
  /** current chart (or page) named in the drawer header */
  private renderSub() {
    const t =
      this.app === "charts"
        ? this.source === "navigraph" && this.ngCurrent
          ? this.ngCurrent.name
          : this.current
            ? this.current.kind === "APD"
              ? "Airport diagram"
              : this.current.title
            : ""
        : this.app === "checklists" || this.app === "clearance"
          ? ""
          : this.airportSel;
    this.sub.textContent = t;
    this.sub.title = t;
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
  /** rebuild after the nav database changed (real-world region loaded / left) */
  refresh() {
    this.entries = chartIndex();
    if (!this.entries.some((e) => e.airport === this.airportSel))
      this.airportSel = this.entries[0]?.airport ?? "";
    this.fillAirports();
    this.renderTabs();
    const first =
      this.entries.find(
        (x) => x.airport === this.airportSel && x.kind === "IAP",
      ) ?? this.entries[0];
    if (first) this.show(first.id);
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
      ["width", "Width", "Fit the chart width"],
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
    this.chartSel.addEventListener("change", () => {
      const v = this.chartSel.value;
      if (this.source === "navigraph") {
        const c = this.ngCharts.find((x) => x.id === v);
        if (c) void this.showNavigraph(c);
      } else this.show(v);
    });
    this.bar = h(
      "div",
      { class: "chart-bar" },
      this.srcSeg,
      this.chartSel,
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
      this.renderTabs();
      const first =
        this.entries.find(
          (x) => x.airport === this.airportSel && x.kind === "IAP",
        ) ?? this.entries.find((x) => x.airport === this.airportSel);
      if (first) this.show(first.id);
      if (this.source === "navigraph") void this.loadNavigraph();
      // every page follows the selected airport
      if (this.app !== "charts") this.setApp(this.app);
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
        h("div", { class: "efb-ttl" }, h("h3", {}, "EFB"), this.sub),
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
  /** chart selector: a native <select> grouped by procedure type, never clipped whatever the titles */
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
            onclick: () => {
              this.source = "builtin";
              this.renderTabs();
              if (this.current) this.show(this.current.id);
            },
          },
          "Built-in",
        ),
        h(
          "button",
          {
            class: this.source === "navigraph" ? "on" : "",
            onclick: () => {
              this.source = "navigraph";
              void this.loadNavigraph();
            },
          },
          "Navigraph",
        ),
      );
    }
    clear(this.chartSel);
    if (this.source === "navigraph") {
      for (const [cat, label] of NG_CATS) {
        const list = this.ngCharts.filter((x) => x.category === cat);
        if (!list.length) continue;
        this.chartSel.append(
          h(
            "optgroup",
            { label },
            ...list.map((c) =>
              h(
                "option",
                { value: c.id, selected: this.ngCurrent?.id === c.id },
                `${c.index_number}  ${c.name}`,
              ),
            ),
          ),
        );
      }
      if (!this.ngCharts.length)
        this.chartSel.append(h("option", { value: "" }, "No Navigraph charts"));
    } else {
      const mine = this.entries.filter((x) => x.airport === this.airportSel);
      for (const [g, label] of GROUPS) {
        const list = mine.filter((e) => groupOf(e) === g);
        if (!list.length) continue;
        this.chartSel.append(
          h(
            "optgroup",
            { label },
            ...list.map((e) =>
              h(
                "option",
                { value: e.id, selected: this.current?.id === e.id },
                e.kind === "APD" ? "Airport diagram" : e.title,
              ),
            ),
          ),
        );
      }
    }
    this.renderSub();
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
    if (o) {
      if (!this.current) {
        const id = this.sim.fp.approachId;
        this.show(id ?? "PARD-I27");
      } else requestAnimationFrame(() => this.fit());
    }
  }

  show(id: string) {
    const e = this.entries.find((x) => x.id === id);
    if (!e) return;
    if (this.source === "navigraph") this.source = "builtin";
    this.current = e;
    this.airportSel = e.airport;
    this.aptSel.value = e.airport;
    this.sheet.innerHTML = e.render();
    this.sheetW = 600;
    this.sheetH = 900;
    this.ship = null;
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
    const ap = approach(this.current.approachId);
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
