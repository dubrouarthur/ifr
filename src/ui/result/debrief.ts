// The full-window debrief replay (SPEC §2.4). Top bar: ‹ Result, the title, the verdict, the KPIs of the failed and
// closest standards, help, sign-off state, Export, Sign-off, Close. Stage: the moment card | the plan view over the
// vertical profile against the plate | the instruments redrawn at the playhead (PFD / MFD / Steam, the cockpit's own
// renderers with their own per-instance state) over the aircraft state table. Replay dock: transport, lane filter
// chips, "Fly from", the lanes. Below the fold: the ACS standards table with the tolerance used, Help used, the
// instructor review and sign-off (stored on this device), Practise next.
//
// The replay is ClipPlayer.fromRecorder (src/course/clip.ts) on the cockpit's own Sim: begin() saves the live state,
// seek() applies the recording at any time, takeOver() hands the aircraft over ("Fly from 5:03"), end() restores the
// flight exactly as it was. Everything moves together when scrubbing: the map aircraft, the profile cursor, the
// instruments, the state table, the moment card (it snaps to the finding under the playhead) and the lanes.
import { h, clear } from "../dom";
import { Modal } from "../modals";
import { svgIcon, I } from "../icons";
import { setLang, onLangChange } from "../i18n";
import type { Sim } from "../../sim/sim";
import { ClipPlayer } from "../../course/clip";
import {
  renderPane,
  newInstrumentStates,
  type InstrumentStates,
} from "../../course/stage/views";
import { FULL_RECT, type DisplayKind } from "../../course/stage/geometry";
import { trackGpx, trackKml, download } from "../../connect/exports";
import { curLang, mmss, num, rt as resultRt } from "./i18n";
import { drt } from "./debriefStrings";
import { helpBox } from "./helpBox";
import { nextList } from "./nextList";
import {
  LANES,
  clockText,
  eventsCsv,
  momentAt,
  momentsOf,
  neighbourTime,
  samplesCsv,
  sampleAt,
  stateRows,
  type DebriefModel,
  type LaneKey,
  type Moment,
  type StateRow,
} from "./debriefData";
import {
  lanesSvg,
  mapSvg,
  profileSvg,
  type LanesDrawn,
  type MapDrawn,
  type MapGeom,
  type PlateGeom,
  type ProfileDrawn,
  type TrackPt,
} from "./debriefCharts";
import {
  signoffs,
  lockHash,
  verifySignOff,
  lockText,
  initials,
  type Grade,
  type SignOff,
} from "./signoff";
import type { Lang, NextItem, NextPlan } from "./types";

export type CockpitKind = "g1000" | "steam" | "airliner";

export interface DebriefDeps {
  sim: Sim;
  cockpit: () => CockpitKind;
  toast: (msg: string, kind?: "info" | "good" | "warn" | "bad") => void;
  /** a practise-next row (exercise) */
  onNext?: (it: NextItem) => void;
  /** free flight: fly it again / plan a new one */
  onAgain: () => void;
  onNew: () => void;
  /** the aircraft was handed over at clip time t: the flight goes on from there */
  onTakeOver?: (t: number) => void;
}

export interface DebriefOpen {
  /** the model in a language (rebuilt when the language changes) */
  build: (L: Lang) => DebriefModel;
  geom: MapGeom;
  plate: PlateGeom | null;
  /** sim time of the recording's first sample (clip time 0) */
  t0: number;
  /** sim time the replay ends at (an exercise's end; undefined: the whole recording) */
  t1?: number;
  /** open at this clip time (a finding of the result sheet) */
  at?: number;
  /** "‹ Result" goes back to the exercise result */
  onBack?: () => void;
}

type Tab = "pfd" | "mfd" | "steam";

const SPEEDS = [1, 4, 16];

export class DebriefView extends Modal {
  private o: DebriefOpen | null = null;
  private m: DebriefModel | null = null;
  private player: ClipPlayer | null = null;
  private t = 0;
  private raf = 0;
  private lastFrame = 0;
  private dirty = true;
  private track: TrackPt[] = [];
  private samples: import("../../sim/recorder").Sample[] = [];
  private moments: Moment[] = [];
  private mi = -1;
  private allEvents = false;
  private visible = new Set<LaneKey>(LANES);
  private tab: Tab = "pfd";
  private states: InstrumentStates = newInstrumentStates();
  private loop: { t0: number; t1: number } | null = null;
  private profMode: "dist" | "time" = "dist";
  private mapD: MapDrawn | null = null;
  private profD: ProfileDrawn | null = null;
  private laneD: LanesDrawn | null = null;
  private els: Record<string, HTMLElement> = {};
  private stateEls = new Map<string, { v: HTMLElement; row: HTMLElement }>();
  private ro: ResizeObserver | null = null;
  private cleanups: (() => void)[] = [];
  private langOff: (() => void) | null = null;
  private liveAt = 0;
  private pinnedUntil = 0;
  private lastInst = 0;
  private menu: HTMLElement | null = null;
  private tookOver = false;
  private so: SignOff | null = null;

  constructor(private deps: DebriefDeps) {
    super("Debrief");
    this.box.className = "modal dbx";
    this.bg.classList.add("dbx-bg");
    this.onClose = () => this.teardown(true);
  }

  /** the model shown (tests, automation) */
  get model() {
    return this.m;
  }
  get time() {
    return this.t;
  }

  show(o: DebriefOpen) {
    this.o = o;
    this.tookOver = false;
    this.loop = null;
    this.allEvents = false;
    this.visible = new Set(LANES);
    this.mi = -1;
    const sim = this.deps.sim;
    const rec = sim.rec;
    const end = o.t1 ?? Infinity;
    this.samples = rec.samples
      .filter((s) => s.t <= end + 0.5)
      .map((s) => ({ ...s, t: s.t - o.t0 }));
    this.track = this.samples.map((s) => ({
      t: s.t,
      lat: s.lat,
      lon: s.lon,
      alt: s.alt,
    }));
    this.player = ClipPlayer.fromRecorder(sim, sim.rec, { speed: 4 }, o.t1);
    const ck = this.deps.cockpit();
    this.tab = ck === "steam" ? "steam" : "pfd";
    this.profMode = o.plate ? "dist" : "time";
    this.states = newInstrumentStates();
    this.player?.begin();
    this.render();
    super.open();
    this.langOff?.();
    this.langOff = onLangChange(() => {
      if (this.isOpen) this.render();
    });
    const m = this.m!;
    const first =
      o.at ?? (m.findings[0] ? Math.max(0, m.findings[0].tWorst) : m.durS);
    this.seek(Math.min(m.durS, Math.max(0, first)));
    if (o.at !== undefined) {
      const k = this.moments.findIndex(
        (x) => x.kind === "finding" && o.at! >= x.t0 - 6 && o.at! <= x.t1 + 3,
      );
      if (k >= 0) this.showMoment(k, false);
    } else if (this.moments.length) this.showMoment(0, false);
    this.lastFrame = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((n) => this.frame(n));
    requestAnimationFrame(() =>
      this.box
        .querySelector<HTMLElement>(".dbx-play")
        ?.focus({ preventScroll: true }),
    );
  }

  private teardown(closing: boolean) {
    this.cleanups.forEach((f) => f());
    this.cleanups = [];
    this.ro?.disconnect();
    this.ro = null;
    if (closing) {
      cancelAnimationFrame(this.raf);
      this.langOff?.();
      this.langOff = null;
      // the flight is restored exactly as it was before the replay (unless the aircraft was handed over)
      if (!this.tookOver) this.player?.end();
      this.player = null;
    }
  }

  // ---------------------------------------------------------------- render
  private render() {
    const o = this.o!;
    this.teardown(false);
    const L = curLang();
    const m = o.build(L);
    this.m = m;
    this.moments = momentsOf(m, this.allEvents);
    if (this.mi >= this.moments.length) this.mi = this.moments.length - 1;
    this.so = signoffs.get(m.attemptId);
    clear(this.box);
    this.els = {};
    this.stateEls.clear();
    this.box.setAttribute("aria-label", `${drt("d.title")} · ${m.title}`);
    this.box.tabIndex = -1;

    const top = this.topBar(m);
    const stage = h(
      "section",
      { class: "dbx-stage" },
      this.momentCard(),
      this.centre(),
      this.right(),
    );
    const dock = this.dock(m);
    const lower = this.lower(m);
    const body = h("div", { class: "dbx-body" }, stage, dock, lower);
    this.els.body = body;
    this.els.stage = stage;
    this.els.dock = dock;
    this.els.top = top;
    const live = h("div", { class: "sr-only", "aria-live": "polite" });
    this.els.live = live;
    this.box.append(top, body, live);

    const key = (e: KeyboardEvent) => this.onKey(e);
    this.box.addEventListener("keydown", key);
    this.cleanups.push(() => this.box.removeEventListener("keydown", key));
    const off = (e: Event) => {
      if (this.menu && !this.menu.contains(e.target as Node)) this.closeMenu();
    };
    document.addEventListener("click", off);
    this.cleanups.push(() => document.removeEventListener("click", off));
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.box);
    this.layout();
    if (this.mi >= 0) this.showMoment(this.mi, false);
    else this.showMoment(-1, false);
    this.dirty = true;
  }

  private topBar(m: DebriefModel): HTMLElement {
    const L = m.lang;
    const o = this.o!;
    const cls =
      m.outcome === "met" ? "pass" : m.outcome === "not-met" ? "fail" : "none";
    const vtxt =
      m.outcome === "ungraded"
        ? drt("d.vUngraded")
        : drt(m.outcome === "met" ? "d.vMet" : "d.vNotMet", {
            k: m.metCount,
            n: m.gradedCount,
          });
    const kpis = m.kpis.map((k) =>
      h(
        "div",
        { class: `dbx-kpi${k.bad ? " bad" : ""}` },
        h("span", { class: "l" }, k.label),
        h(
          "span",
          { class: "v" },
          h("b", {}, k.value),
          k.unit ? (k.unit.startsWith("°") ? k.unit : ` ${k.unit}`) : "",
        ),
      ),
    );
    const so = this.so;
    const soChip =
      so && !so.draft
        ? h(
            "span",
            { class: "rs-chip dbx-sochip signed" },
            svgIcon(I.check, 13),
            drt("d.signedBy", { name: so.by.name }),
          )
        : m.outcome !== "ungraded" || so
          ? h(
              "span",
              { class: "rs-chip dbx-sochip" },
              so?.by.name
                ? drt(so.draft ? "d.draft" : "d.awaitingBy", {
                    name: so.by.name,
                  })
                : drt("d.awaiting"),
            )
          : null;
    const help = m.help.length
      ? h(
          "span",
          { class: "rs-chip help" },
          svgIcon(I.help, 13),
          drt("d.help", { n: m.help.length }),
        )
      : null;
    const exp = this.exportMenu(m);
    const langSeg = h(
      "div",
      { class: "rs-lang", role: "group", "aria-label": "Language" },
      ...(["en", "fr"] as const).map((l) =>
        h(
          "button",
          {
            class: l === L ? "on" : "",
            "aria-pressed": String(l === L),
            onclick: () => setLang(l),
          },
          l.toUpperCase(),
        ),
      ),
    );
    return h(
      "header",
      { class: "dbx-top" },
      o.onBack
        ? h(
            "button",
            { class: "rs-btn ghost dbx-back", onclick: () => this.back() },
            svgIcon(I.chevDown, 15),
            drt("d.result"),
          )
        : null,
      h(
        "div",
        { class: "dbx-ttl" },
        h("b", {}, m.title),
        h("small", {}, m.meta),
      ),
      h(
        "span",
        { class: `rs-verdict ${cls}` },
        h("i", { "aria-hidden": "true" }),
        vtxt,
      ),
      h("div", { class: "dbx-kpis" }, ...kpis),
      help,
      soChip,
      h("span", { class: "sp" }),
      exp,
      h(
        "button",
        { class: "rs-btn dbx-sobtn", onclick: () => this.scrollToSignOff() },
        svgIcon(I.feather, 15),
        h("span", { class: "lbl" }, drt("d.signoff")),
      ),
      langSeg,
      h(
        "button",
        {
          class: "rs-x",
          "aria-label": drt("d.close"),
          onclick: () => this.close(),
        },
        h("span", {
          class: "xi",
          "aria-hidden": "true",
          html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        }),
      ),
    );
  }

  private back() {
    const b = this.o?.onBack;
    this.close();
    b?.();
  }

  // ---- moment card
  private momentCard(): HTMLElement {
    const card = h("article", { class: "dbx-moment", "aria-live": "off" });
    this.els.moment = card;
    return card;
  }

  private showMoment(i: number, seek = true) {
    const m = this.m!;
    const card = this.els.moment;
    if (!card) return;
    this.mi = i;
    clear(card);
    const list = this.moments;
    const x = i >= 0 ? list[i] : null;
    const nav = h(
      "div",
      { class: "nav" },
      h(
        "button",
        {
          class: "rs-btn ghost ic",
          "aria-label": drt("m.prev"),
          disabled: list.length < 2,
          onclick: () => this.page(-1),
        },
        svgIcon(I.chevDown, 16),
      ),
      h(
        "button",
        {
          class: "rs-btn ghost ic nx",
          "aria-label": drt("m.next"),
          disabled: list.length < 2,
          onclick: () => this.page(1),
        },
        svgIcon(I.chevDown, 16),
      ),
    );
    const allChip = h(
      "label",
      { class: "dbx-all" },
      h("input", {
        type: "checkbox",
        checked: this.allEvents,
        onchange: (e: Event) => {
          this.allEvents = (e.target as HTMLInputElement).checked;
          const cur = this.moments[this.mi];
          this.moments = momentsOf(m, this.allEvents);
          const k = cur
            ? this.moments.findIndex(
                (q) => q.t === cur.t && q.label === cur.label,
              )
            : -1;
          this.showMoment(k >= 0 ? k : this.moments.length ? 0 : -1, false);
        },
      }),
      drt("m.allEvents"),
    );
    if (!x) {
      const ung = m.outcome === "ungraded";
      card.append(
        h(
          "header",
          {},
          h(
            "span",
            { class: `eb ${ung ? "" : "ok"}` },
            ung ? drt("d.vUngraded") : drt("m.none"),
          ),
          h("span", { class: "sp" }),
          nav,
        ),
        h(
          "div",
          { class: "mb" },
          h("h3", {}, ung ? m.task || drt("d.vUngraded") : drt("m.none")),
          h(
            "p",
            { class: "lead" },
            m.note ??
              (m.source === "flight" ? drt("m.noneFlight") : drt("m.noneText")),
          ),
          allChip,
        ),
        h("div", { class: "ma" }, this.flyBtn(true)),
      );
      return;
    }
    const f = x.finding;
    const grp = f
      ? f.group
      : x.lane === "deviation"
        ? x.item?.kind === "warn"
          ? "watch"
          : "not-met"
        : "procedure";
    const grpWord = f
      ? drt(
          f.group === "watch"
            ? "m.watch"
            : f.group === "safety"
              ? "m.safety"
              : f.group === "procedure"
                ? "m.procedure"
                : "m.notMet",
        )
      : drt(`l.${x.lane}`);
    const eyebrow =
      x.kind === "finding" || (m.source === "flight" && x.lane === "deviation")
        ? `${drt(x.kind === "finding" ? "m.finding" : "m.event", { k: i + 1, n: list.length })} · ${grpWord}`
        : `${drt("m.event", { k: i + 1, n: list.length })} · ${grpWord}`;
    const body = h("div", { class: "mb" });
    body.append(
      h(
        "h3",
        {},
        x.n !== undefined
          ? h("span", { class: `n ${grp === "watch" ? "w" : ""}` }, String(x.n))
          : null,
        x.label,
      ),
      h(
        "div",
        { class: "where" },
        h(
          "b",
          {},
          x.t1 - x.t0 >= 2 ? `${mmss(x.t0)} – ${mmss(x.t1)}` : mmss(x.t),
        ),
        f?.where ? ` · ${f.where}` : "",
      ),
    );
    if (f) {
      const rows: [string, Node | string][] = [
        [
          drtR("f.standard"),
          h(
            "span",
            {},
            h("span", { class: "rs-mono" }, f.stdChip),
            " ",
            f.stdText,
          ),
        ],
        [drtR("f.what"), f.whatHappened],
      ];
      if (f.group !== "watch") rows.push([drtR("f.why"), f.why]);
      rows.push([drtR("f.next"), f.next]);
      body.append(
        h(
          "dl",
          {},
          ...rows.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]),
        ),
      );
    }
    body.append(allChip);
    const loopOn = !!this.loop && this.loop.t0 === Math.max(0, x.t0 - 7);
    card.append(
      h(
        "header",
        {},
        h(
          "span",
          {
            class: `eb ${grp === "watch" ? "warn" : grp === "not-met" || grp === "safety" ? "bad" : ""}`,
          },
          eyebrow,
        ),
        h("span", { class: "sp" }),
        nav,
      ),
      body,
      h(
        "div",
        { class: "ma" },
        this.flyBtn(true, Math.max(0, x.t0 - 20)),
        h(
          "button",
          {
            class: `rs-btn${loopOn ? " on" : ""}`,
            "aria-pressed": String(loopOn),
            onclick: () => this.toggleLoop(x),
          },
          svgIcon(I.restart, 15),
          drt(loopOn ? "m.loopStop" : "m.loop"),
        ),
      ),
    );
    if (seek) {
      this.pinnedUntil = performance.now() + 1500;
      this.seek(x.t);
    }
    this.highlightPins(x.n);
  }

  private page(d: 1 | -1) {
    const n = this.moments.length;
    if (!n) return;
    const i = this.mi < 0 ? (d > 0 ? 0 : n - 1) : (this.mi + d + n) % n;
    this.showMoment(i, true);
  }

  private highlightPins(n?: number) {
    this.box
      .querySelectorAll(".pin.on")
      .forEach((e) => e.classList.remove("on"));
    if (n !== undefined)
      this.box
        .querySelectorAll(`.pin[data-pin="${n}"]`)
        .forEach((e) => e.classList.add("on"));
  }

  private toggleLoop(x: Moment) {
    const t0 = Math.max(0, x.t0 - 7);
    if (this.loop && this.loop.t0 === t0) {
      this.loop = null;
      this.player?.pause();
    } else {
      this.loop = { t0, t1: Math.min(this.m!.durS, x.t1 + 3) };
      const p = this.player;
      if (p) {
        p.speed = 1;
        p.seek(t0);
        // reduced motion: no autoplay of the loop (SPEC §10)
        if (!matchMedia("(prefers-reduced-motion: reduce)").matches) p.play();
        this.t = t0;
      }
    }
    this.showMoment(this.mi, false);
    this.syncTransport();
  }

  private flyBtn(primary: boolean, at?: number): HTMLElement {
    const b = h(
      "button",
      {
        class: `rs-btn${primary ? " primary" : ""} dbx-fly`,
        disabled: !this.player,
        onclick: () => this.takeOver(at ?? this.t),
      },
      svgIcon(I.play, 15),
      h("span", { class: "ft" }, drt("m.flyFrom", { t: mmss(at ?? this.t) })),
    );
    if (at === undefined) b.classList.add("follow");
    return b;
  }

  // ---- centre: plan view + profile
  private centre(): HTMLElement {
    const o = this.o!;
    const mapHost = h("div", { class: "host" });
    const profHost = h("div", { class: "host" });
    this.els.map = mapHost;
    this.els.prof = profHost;
    const toggle = o.plate
      ? h(
          "div",
          {
            class: "rs-lang dbx-seg",
            role: "group",
            "aria-label": drt("c.profile"),
          },
          ...(["dist", "time"] as const).map((k) =>
            h(
              "button",
              {
                class: this.profMode === k ? "on" : "",
                "aria-pressed": String(this.profMode === k),
                onclick: () => {
                  this.profMode = k;
                  this.render();
                },
              },
              drt(k === "dist" ? "c.distance" : "c.time"),
            ),
          ),
        )
      : null;
    const empty = this.track.length < 4;
    const pinClick = (e: Event) => {
      const g = (e.target as Element).closest?.("[data-pin]");
      if (!g) return;
      const n = Number(g.getAttribute("data-pin"));
      const k = this.moments.findIndex((x) => x.n === n);
      if (k >= 0) this.showMoment(k, true);
    };
    mapHost.addEventListener("click", pinClick);
    profHost.addEventListener("click", pinClick);
    if (empty)
      return h(
        "div",
        { class: "dbx-centre" },
        h(
          "section",
          { class: "dbx-card dbx-empty" },
          svgIcon(I.route, 22),
          h("b", {}, drt("c.noTrack")),
          h("span", {}, drt("c.noTrackText")),
        ),
      );
    return h(
      "div",
      { class: "dbx-centre" },
      h("section", { class: "dbx-card dbx-map" }, mapHost),
      h(
        "section",
        { class: "dbx-card dbx-prof" },
        h(
          "div",
          { class: "hd" },
          h(
            "b",
            {},
            o.plate
              ? drt("c.profilePlate", { name: o.plate.name })
              : drt("c.profile"),
          ),
          h("span", { class: "sp" }),
          toggle,
        ),
        profHost,
      ),
    );
  }

  // ---- right: instruments + state
  private right(): HTMLElement {
    const canvas = h("canvas", {
      class: "dbx-cv",
      role: "img",
    }) as HTMLCanvasElement;
    this.els.canvas = canvas;
    const title = h("b", {}, drt("i.title", { t: mmss(this.t) }));
    this.els.instTitle = title;
    const tabs = h(
      "div",
      { class: "dbx-tabs", role: "tablist" },
      ...(["pfd", "mfd", "steam"] as const).map((k) =>
        h(
          "button",
          {
            role: "tab",
            class: this.tab === k ? "on" : "",
            "aria-selected": String(this.tab === k),
            onclick: () => {
              this.tab = k;
              this.box.querySelectorAll(".dbx-tabs button").forEach((b, j) => {
                const on = ["pfd", "mfd", "steam"][j] === k;
                b.classList.toggle("on", on);
                b.setAttribute("aria-selected", String(on));
              });
              this.drawInstruments(0.5);
            },
          },
          drt(`i.${k}`),
        ),
      ),
    );
    const table = h("div", { class: "dbx-state", role: "table" });
    this.els.state = table;
    return h(
      "div",
      { class: "dbx-right" },
      h(
        "section",
        { class: "dbx-inst" },
        h("div", { class: "hd" }, title, h("span", { class: "sp" }), tabs),
        h("div", { class: "cvw" }, canvas),
      ),
      table,
    );
  }

  // ---- dock
  private dock(m: DebriefModel): HTMLElement {
    const play = h(
      "button",
      {
        class: "rs-btn primary ic dbx-play",
        "aria-label": drt("k.play"),
        onclick: () => this.togglePlay(),
      },
      svgIcon(I.play, 16),
    );
    this.els.play = play;
    const time = h("span", { class: "dbx-time" }, clockText(this.t, m.durS));
    this.els.time = time;
    const speed = h(
      "div",
      {
        class: "rs-lang dbx-speed",
        role: "group",
        "aria-label": drt("k.speed"),
      },
      ...SPEEDS.map((s) =>
        h(
          "button",
          {
            class: (this.player?.speed ?? 4) === s ? "on" : "",
            "aria-pressed": String((this.player?.speed ?? 4) === s),
            onclick: () => this.setSpeed(s),
          },
          `${s}×`,
        ),
      ),
    );
    this.els.speed = speed;
    if (this.player && !SPEEDS.includes(this.player.speed))
      this.player.speed = 4;
    const chips = h(
      "div",
      { class: "dbx-chips", role: "group", "aria-label": drt("k.lanes") },
      ...LANES.map((ln) => {
        const n = m.lanes[ln].length;
        const on = this.visible.has(ln);
        return h(
          "button",
          {
            class: `dbx-chip ${ln}${on ? " on" : ""}`,
            "aria-pressed": String(on),
            onclick: () => {
              if (this.visible.has(ln)) this.visible.delete(ln);
              else this.visible.add(ln);
              this.render();
            },
          },
          h("i", { "aria-hidden": "true" }),
          `${drt(`l.${ln}`)} ${n}`,
        );
      }),
    );
    const lanes = h("div", {
      class: "rs-tlc dbx-lanes",
      role: "slider",
      tabindex: "0",
      "aria-label": drt("k.scrub"),
      "aria-valuemin": "0",
      "aria-valuemax": String(Math.round(m.durS)),
    });
    this.els.lanes = lanes;
    this.bindScrub(lanes);
    return h(
      "section",
      { class: "dbx-dock" },
      h(
        "div",
        { class: "dbx-tr" },
        h(
          "button",
          {
            class: "rs-btn ic",
            "aria-label": drt("k.prev"),
            onclick: () => this.jump(-1),
          },
          svgIcon(I.chevDown, 16),
        ),
        play,
        h(
          "button",
          {
            class: "rs-btn ic nx",
            "aria-label": drt("k.next"),
            onclick: () => this.jump(1),
          },
          svgIcon(I.chevDown, 16),
        ),
        time,
        speed,
        chips,
        h("span", { class: "sp" }),
        this.flyBtn(false),
      ),
      lanes,
    );
  }

  private bindScrub(el: HTMLElement) {
    let drag = false;
    const at = (e: PointerEvent) => {
      const d = this.laneD;
      if (!d) return;
      const r = el.getBoundingClientRect();
      this.seek(d.tOf(e.clientX - r.left));
    };
    el.addEventListener("pointerdown", (e) => {
      const pin = (e.target as Element).closest?.("[data-pin]");
      if (pin) {
        const n = Number(pin.getAttribute("data-pin"));
        const k = this.moments.findIndex((x) => x.n === n);
        if (k >= 0) this.showMoment(k, true);
        return;
      }
      const ev = (e.target as Element).closest?.("[data-t]");
      if (ev) {
        this.seek(Number(ev.getAttribute("data-t")));
        return;
      }
      drag = true;
      this.player?.pause();
      this.loop = null;
      el.setPointerCapture(e.pointerId);
      at(e);
      this.syncTransport();
    });
    el.addEventListener("pointermove", (e) => {
      if (drag) at(e);
    });
    const up = () => {
      drag = false;
      this.announce(true);
    };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  }

  // ---- below the fold
  private lower(m: DebriefModel): HTMLElement {
    const left = h("div", { class: "l" });
    const right = h("div", { class: "r" });
    left.append(this.standardsTable(m));
    const hb = helpBox(m.help);
    if (hb) left.append(hb);
    right.append(this.signOff(m));
    const plan = this.planFor(m);
    if (plan.items.length)
      right.append(
        nextList(plan, drt("p.title"), (it) => {
          if (m.source === "exercise" && this.deps.onNext) {
            this.close();
            this.deps.onNext(it);
          } else if (it.ref === "new") {
            this.close();
            this.deps.onNew();
          } else {
            this.close();
            this.deps.onAgain();
          }
        }),
      );
    return h("section", { class: "dbx-lower" }, left, right);
  }

  private planFor(m: DebriefModel): NextPlan {
    const so = this.so;
    if (m.source === "exercise" && m.plan) {
      const items = [...m.plan.items];
      if (so?.assign && so.by.name) {
        const first = items[0];
        const assigned: NextItem = {
          kind: "retry",
          label: so.assign.label,
          sub: drt("so.assignedBy", { name: so.by.name }),
          action: drt("p.fly"),
          primary: true,
        };
        items.splice(
          0,
          items.length,
          assigned,
          ...items
            .filter((x) => x.kind !== "retry")
            .map((x) => ({ ...x, primary: false }))
            .slice(0, 2),
        );
        void first;
      }
      return { why: m.plan.why, items };
    }
    return {
      why: { lead: "", text: "" },
      items: [
        {
          kind: "retry",
          label: drt("p.again"),
          sub: drt("p.againSub"),
          action: drt("p.fly"),
          primary: true,
        },
        {
          kind: "brief",
          label: drt("p.new"),
          sub: drt("p.newSub"),
          action: drt("p.open"),
          ref: "new",
          primary: false,
        },
      ],
    };
  }

  private standardsTable(m: DebriefModel): HTMLElement {
    const head = h(
      "h4",
      {},
      m.task ? drt("t.standardsOf", { task: m.task }) : drt("t.standards"),
      h("span", { class: "sp" }),
      h("span", { class: "h4r" }, drt("t.legend")),
    );
    if (!m.standards.length)
      return h(
        "section",
        { class: "rs-panel dbx-std" },
        head,
        h("p", { class: "dbx-none" }, m.note ?? drt("t.none")),
        m.wouldGrade
          ? h(
              "div",
              { class: "dbx-would" },
              h("b", {}, resultRt("sec.would")),
              h("ul", {}, ...m.wouldGrade.map((w) => h("li", {}, w))),
            )
          : null,
      );
    const rows = m.standards.map((s) => {
      const pct = s.pct;
      const bad = s.verdict === "not-met";
      const icon =
        s.verdict === "met" && s.exceeded
          ? h(
              "span",
              { class: "st warn", "aria-label": drt("t.exceeded") },
              h("b", { "aria-hidden": "true" }, "!"),
            )
          : s.verdict === "met"
          ? h(
              "span",
              { class: "st ok", "aria-label": drt("t.met") },
              svgIcon(I.check, 12),
            )
          : s.verdict === "not-met"
            ? h(
                "span",
                { class: "st bad", "aria-label": drt("t.notMet") },
                h("span", {
                  html: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M7 7l10 10M17 7L7 17"/></svg>',
                }),
              )
            : h("span", { class: "st na", "aria-label": drt("t.na") }, "—");
      const bar =
        pct !== null && s.verdict !== "not-reached"
          ? h(
              "div",
              { class: "dbx-bar" },
              h(
                "div",
                { class: "trk" },
                h("i", {
                  class: bad ? "bad" : pct >= 0.7 || s.exceeded ? "warn" : "",
                  style: `width:${Math.min(100, (pct / Math.max(1.25, pct)) * 100).toFixed(1)}%`,
                }),
                h("b", {
                  style: `left:${((1 / Math.max(1.25, pct)) * 100).toFixed(1)}%`,
                }),
              ),
              h(
                "small",
                { class: bad ? "bad" : "" },
                drt("t.pct", { p: Math.round(pct * 100) }),
              ),
            )
          : h("div", { class: "dbx-bar" });
      return h(
        "div",
        {
          class: `tr${bad ? " bad" : ""}${s.verdict === "not-reached" ? " na" : ""}`,
          role: "row",
        },
        h(
          "div",
          { class: "c std", role: "cell" },
          icon,
          h(
            "span",
            {},
            h("b", {}, s.label),
            s.sub ? h("small", {}, s.sub) : null,
          ),
        ),
        h("div", { class: "c tol", role: "cell" }, s.tol),
        h(
          "div",
          { class: "c flew", role: "cell" },
          h("span", { class: bad ? "bad" : "" }, s.flew),
          s.n !== undefined
            ? h(
                "button",
                {
                  class: `n${bad ? "" : " w"}`,
                  "aria-label": `${s.n}`,
                  onclick: () => {
                    const k = this.moments.findIndex((x) => x.n === s.n);
                    if (k >= 0) {
                      this.showMoment(k, true);
                      this.els.body?.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  },
                },
                String(s.n),
              )
            : null,
        ),
        h("div", { class: "c", role: "cell" }, bar),
      );
    });
    return h(
      "section",
      { class: "rs-panel dbx-std" },
      head,
      h(
        "div",
        { class: "tbl", role: "table" },
        h(
          "div",
          { class: "tr th", role: "row" },
          ...[drt("t.std"), drt("t.tol"), drt("t.flew"), ""].map((x) =>
            h("div", { class: "c", role: "columnheader" }, x),
          ),
        ),
        ...rows,
      ),
    );
  }

  // ---- sign-off (SPEC §6)
  private signOff(m: DebriefModel): HTMLElement {
    const me = signoffs.me();
    const cur: SignOff = this.so ?? {
      by: { ...me },
      grade: null,
      notes: "",
      tags: [],
      at: new Date().toISOString(),
      draft: true,
    };
    const locked = !cur.draft && !!cur.lockHash;
    const sec = h("section", { class: "rs-panel dbx-so", id: "dbx-so" });
    const status = locked
      ? drt("so.signed")
      : this.so
        ? drt("so.draftSaved")
        : drt("so.awaiting");
    sec.append(
      h(
        "h4",
        {},
        drt("so.title"),
        h("span", { class: "sp" }),
        h("span", { class: `h4r ${locked ? "ok" : "acc"}` }, status),
      ),
    );
    const pb = h("div", { class: "pb" });
    sec.append(pb);
    if (m.outcome === "ungraded")
      pb.append(h("p", { class: "dbx-fine" }, drt("so.ungraded")));
    const name = h("input", {
      type: "text",
      value: cur.by.name,
      placeholder: drt("so.namePh"),
      "aria-label": drt("so.name"),
      disabled: locked,
      autocomplete: "name",
    }) as HTMLInputElement;
    const role = h("input", {
      type: "text",
      value: cur.by.role,
      placeholder: drt("so.rolePh"),
      "aria-label": drt("so.role"),
      disabled: locked,
    }) as HTMLInputElement;
    const av = h(
      "span",
      { class: "av", "aria-hidden": "true" },
      initials(cur.by.name),
    );
    name.addEventListener(
      "input",
      () => (av.textContent = initials(name.value)),
    );
    pb.append(
      h("div", { class: "who" }, av, h("div", { class: "fields" }, name, role)),
    );
    let grade: Grade | null = cur.grade;
    const gradeBtns = (
      ["satisfactory", "repeat", "unsatisfactory"] as const
    ).map((g) =>
      h(
        "button",
        {
          class: `g ${g}${grade === g ? " on" : ""}`,
          "aria-pressed": String(grade === g),
          disabled: locked,
          onclick: () => {
            grade = g;
            gradeBtns.forEach((b, j) => {
              const on = ["satisfactory", "repeat", "unsatisfactory"][j] === g;
              b.classList.toggle("on", on);
              b.setAttribute("aria-pressed", String(on));
            });
          },
        },
        drt(
          g === "satisfactory"
            ? "so.sat"
            : g === "repeat"
              ? "so.repeat"
              : "so.unsat",
        ),
      ),
    );
    pb.append(
      h(
        "div",
        { class: "dbx-grade", role: "group", "aria-label": drt("so.grade") },
        ...gradeBtns,
      ),
    );
    const notes = h("textarea", {
      rows: 3,
      placeholder: drt("so.notesPh"),
      "aria-label": drt("so.notes"),
      disabled: locked,
    }) as HTMLTextAreaElement;
    notes.value = cur.notes;
    pb.append(notes);
    // tags: the standards of this attempt (the school's tag set is phase 2)
    const opts = [
      ...new Set([...cur.tags, ...m.standards.map((s) => s.label)]),
    ].slice(0, 7);
    const tags = new Set(cur.tags);
    if (opts.length)
      pb.append(
        h(
          "div",
          { class: "tags", role: "group", "aria-label": drt("so.tags") },
          ...opts.map((t) =>
            h(
              "button",
              {
                class: `tag${tags.has(t) ? " on" : ""}`,
                "aria-pressed": String(tags.has(t)),
                disabled: locked,
                onclick: (e: Event) => {
                  const b = e.currentTarget as HTMLElement;
                  if (tags.has(t)) tags.delete(t);
                  else tags.add(t);
                  b.classList.toggle("on", tags.has(t));
                  b.setAttribute("aria-pressed", String(tags.has(t)));
                },
              },
              t,
            ),
          ),
        ),
      );
    const assignLabel = m.source === "exercise" ? `${m.title}` : drt("p.again");
    const assign = h("input", {
      type: "checkbox",
      checked: !!cur.assign,
      disabled: locked,
    }) as HTMLInputElement;
    pb.append(
      h(
        "label",
        { class: "assign" },
        assign,
        drt("so.assign", { what: assignLabel }),
      ),
    );
    const collect = (draft: boolean): SignOff => ({
      by: { name: name.value.trim(), role: role.value.trim() },
      grade,
      notes: notes.value,
      tags: [...tags],
      assign: assign.checked
        ? { kind: "retry", ref: m.attemptId, label: assignLabel, times: 2 }
        : undefined,
      at: new Date().toISOString(),
      draft,
      // the record of reopens stays with it through drafts and the next signature
      reopened: cur.reopened,
    });
    const foot = h("div", { class: "ft" });
    if (locked) {
      const d = new Intl.DateTimeFormat(m.lang === "fr" ? "fr-FR" : "en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(cur.at));
      // the lock is checked every time the record is shown: an edit of the stored record since signing says so
      const check = h("span", { class: "dbx-so-check", role: "status" });
      void verifySignOff(m.attemptId, m.outcome, cur).then((ok) => {
        if (ok === false) {
          check.className = "dbx-so-check bad";
          check.textContent = drt("so.edited");
        } else if (ok === null) {
          check.className = "dbx-so-check";
          check.textContent = drt("so.unverified");
        }
      });
      const reo = cur.reopened ?? [];
      foot.append(
        h(
          "span",
          { class: "fine" },
          drt("so.signedOn", { date: d }),
          h("code", {}, ` ${cur.lockHash!.slice(0, 12)}`),
          reo.length
            ? h(
                "span",
                { class: "reo" },
                ` · ${drt("so.reopened", { n: reo.length, name: reo[reo.length - 1].by })}`,
              )
            : null,
          check,
        ),
        h(
          "button",
          {
            class: "rs-btn",
            title: drt("so.unlockTip"),
            onclick: () => {
              this.so = signoffs.put(m.attemptId, {
                ...cur,
                draft: true,
                lockHash: undefined,
                reopened: [
                  ...reo,
                  { by: cur.by.name, at: new Date().toISOString() },
                ],
              });
              this.render();
              this.scrollToSignOff();
            },
          },
          drt("so.unlock"),
        ),
      );
    } else {
      foot.append(
        h("span", { class: "fine" }, drt("so.fine")),
        h(
          "button",
          {
            class: "rs-btn",
            onclick: () => {
              const so = collect(true);
              if (so.by.name) signoffs.setMe(so.by);
              this.so = signoffs.put(m.attemptId, so);
              this.deps.toast(drt("so.draftSaved"), "info");
              this.render();
              this.scrollToSignOff();
            },
          },
          drt("so.saveDraft"),
        ),
        h(
          "button",
          {
            class: "rs-btn primary",
            onclick: async () => {
              const so = collect(false);
              if (!so.by.name) {
                this.deps.toast(drt("so.needName"), "warn");
                name.focus();
                return;
              }
              if (!so.grade) {
                this.deps.toast(drt("so.needGrade"), "warn");
                gradeBtns[0].focus();
                return;
              }
              so.lockHash = await lockHash(
                lockText(m.attemptId, m.outcome, so),
              );
              signoffs.setMe(so.by);
              this.so = signoffs.put(m.attemptId, so);
              this.deps.toast(drt("d.signedBy", { name: so.by.name }), "good");
              this.render();
              this.scrollToSignOff();
            },
          },
          svgIcon(I.feather, 15),
          drt("so.sign"),
        ),
      );
    }
    pb.append(foot);
    return sec;
  }

  private scrollToSignOff() {
    requestAnimationFrame(() => {
      const el = this.box.querySelector<HTMLElement>("#dbx-so");
      const body = this.els.body;
      if (el && body)
        body.scrollTo({
          top: el.offsetTop - 12,
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        });
    });
  }

  // ---- export (SPEC §7)
  private exportMenu(m: DebriefModel): HTMLElement {
    const rec = this.deps.sim.rec;
    const t0 = this.o!.t0;
    const stamp = new Date(rec.startedAt)
      .toISOString()
      .slice(0, 16)
      .replace(/[:T]/g, "-");
    const item = (
      label: string,
      sub: string,
      fn: () => void,
      disabled = false,
    ) =>
      h(
        "button",
        {
          class: "dbx-mi",
          role: "menuitem",
          disabled,
          onclick: () => {
            this.closeMenu();
            fn();
          },
        },
        h("b", {}, label),
        h("small", {}, sub),
      );
    const none = rec.samples.length < 2;
    const menu = h(
      "div",
      { class: "dbx-menu", role: "menu", hidden: true },
      item(
        drt("x.csv"),
        drt("x.csvSub"),
        () =>
          download(
            samplesCsv(rec.samples, t0),
            `ifr-flight-${stamp}.csv`,
            "text/csv",
          ),
        none,
      ),
      item(drt("x.events"), drt("x.eventsSub"), () =>
        download(eventsCsv(m), `ifr-events-${stamp}.csv`, "text/csv"),
      ),
      item(drt("x.json"), drt("x.jsonSub"), () =>
        download(
          JSON.stringify(
            {
              scenario: this.deps.sim.scenario?.id,
              events: rec.events,
              touchdown: rec.touchdown,
              samples: rec.samples,
            },
            null,
            1,
          ),
          `ifr-flight-${stamp}.json`,
          "application/json",
        ),
      ),
      item(
        drt("x.gpx"),
        drt("x.gpxSub"),
        () =>
          download(
            trackGpx(rec.samples, new Date(rec.startedAt).toISOString()),
            `ifr-track-${stamp}.gpx`,
            "application/gpx+xml",
          ),
        none,
      ),
      item(
        drt("x.kml"),
        drt("x.kmlSub"),
        () =>
          download(
            trackKml(rec.samples),
            `ifr-track-${stamp}.kml`,
            "application/vnd.google-earth.kml+xml",
          ),
        none,
      ),
      item(drt("x.print"), drt("x.printSub"), () => this.print()),
    );
    this.menu = menu;
    const btn = h(
      "button",
      {
        class: "rs-btn dbx-expbtn",
        "aria-haspopup": "menu",
        "aria-expanded": "false",
        onclick: (e: Event) => {
          e.stopPropagation();
          const open = menu.hidden;
          menu.hidden = !open;
          btn.setAttribute("aria-expanded", String(open));
        },
      },
      svgIcon(I.document, 15),
      h("span", { class: "lbl" }, drt("d.export")),
      svgIcon(I.chevDown, 14),
    );
    return h("div", { class: "dbx-exp" }, btn, menu);
  }
  private closeMenu() {
    if (this.menu && !this.menu.hidden) {
      this.menu.hidden = true;
      this.box
        .querySelector(".dbx-expbtn")
        ?.setAttribute("aria-expanded", "false");
    }
  }
  private print() {
    document.body.classList.add("dbx-printing");
    const done = () => {
      document.body.classList.remove("dbx-printing");
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    setTimeout(done, 1500);
  }

  // ---------------------------------------------------------------- layout and drawing
  private layout() {
    const box = this.box;
    const W = box.clientWidth;
    if (W <= 0) return;
    const narrow = W < 900;
    box.classList.toggle("narrow", narrow);
    box.classList.toggle("compact", W < 1300 || document.body.classList.contains("touch"));
    const top = this.els.top?.offsetHeight ?? 56;
    const dock = this.els.dock;
    // lanes first (they set the dock's height), then the stage fills the first screen above the dock
    this.drawLanes();
    const dockH = dock?.offsetHeight ?? 220;
    const stage = this.els.stage;
    if (stage) {
      const avail = box.clientHeight - top - dockH;
      // compact windows (iPad landscape): the stage keeps room for the moment card's text and the whole state table;
      // the body scrolls to the dock below rather than squeezing them
      const minH = box.classList.contains("compact") ? 540 : 400;
      stage.style.height = narrow ? "" : `${Math.max(minH, avail)}px`;
    }
    this.drawMap();
    this.drawProfile();
    this.drawInstruments(0.5);
    // the playhead, the aircraft and the cursors at once: never wait for the next animation frame (a busy page can
    // hold it for seconds, and the charts were just redrawn without them)
    this.updatePlayhead(true);
  }

  private drawMap() {
    const host = this.els.map;
    const m = this.m;
    if (!host || !m) return;
    const W = Math.floor(host.clientWidth);
    const H = Math.floor(host.clientHeight);
    this.mapD = mapSvg(W, H, this.track, this.o!.geom, m.findings, m.lang);
    host.innerHTML = this.mapD?.svg ?? "";
    this.highlightPins(this.moments[this.mi]?.n);
  }
  private drawProfile() {
    const host = this.els.prof;
    const m = this.m;
    if (!host || !m) return;
    const W = Math.floor(host.clientWidth);
    const H = Math.floor(host.clientHeight);
    this.profD = profileSvg(
      W,
      H,
      this.o!.plate ? this.profMode : "time",
      this.track,
      m.durS,
      this.o!.plate,
      m.findings,
      { ideal: m.ideal, band: m.band, L: m.lang },
    );
    host.innerHTML = this.profD?.svg ?? "";
  }
  private drawLanes() {
    const host = this.els.lanes;
    const m = this.m;
    if (!host || !m) return;
    const W = Math.floor(host.clientWidth);
    if (W < 100) return;
    this.laneD = lanesSvg(
      W,
      m,
      this.track,
      this.visible,
      document.body.classList.contains("touch"),
    );
    host.innerHTML = this.laneD.svg;
    this.highlightPins(this.moments[this.mi]?.n);
  }

  private display(): DisplayKind {
    const ck = this.deps.cockpit();
    if (this.tab === "steam") return "six";
    if (this.tab === "mfd") return ck === "airliner" ? "nd" : "mfd";
    return ck === "airliner" ? "airlinerPfd" : "pfd";
  }

  private drawInstruments(dt: number) {
    const cv = this.els.canvas as HTMLCanvasElement | undefined;
    if (!cv) return;
    const d = this.display();
    const table =
      d === "pfd"
        ? "G1000_PFD"
        : d === "mfd"
          ? "G1000_MFD"
          : d === "six"
            ? "STEAM_LEFT"
            : d === "nd"
              ? "AL_ND"
              : "AL_PFD";
    try {
      renderPane(
        cv,
        this.deps.sim,
        { kind: "display", display: d, rect: FULL_RECT, table, cropped: false },
        this.states,
        dt,
      );
    } catch {
      /* a renderer that needs a live panel: the pane stays as drawn */
    }
    cv.setAttribute(
      "aria-label",
      drt("i.aria", { d: drt(`i.${this.tab}`), t: mmss(this.t) }),
    );
  }

  private seek(t: number) {
    const m = this.m;
    if (!m) return;
    this.t = Number.isFinite(t) ? Math.max(0, Math.min(m.durS, t)) : 0;
    this.player?.seek(this.t);
    this.dirty = true;
    this.updatePlayhead(true);
  }

  private frame(now: number) {
    if (!this.isOpen) return;
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const p = this.player;
    if (p && p.playing) {
      p.tick(dt);
      this.t = Number.isFinite(p.t) ? Math.max(0, Math.min(this.m?.durS ?? p.t, p.t)) : 0;
      if (this.loop && this.t >= this.loop.t1 - 1e-3) {
        p.seek(this.loop.t0);
        p.play();
        this.t = this.loop.t0;
      }
      if (!p.playing) this.syncTransport();
      this.dirty = true;
    }
    if (this.dirty) this.updatePlayhead(!p?.playing, dt);
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }

  private updatePlayhead(settled: boolean, dt = 0.5) {
    const m = this.m;
    if (!m) return;
    this.dirty = false;
    const t = this.t;
    const s = sampleAt(this.samples, t);
    // map aircraft and its altitude tag
    const map = this.els.map;
    if (s && this.mapD && map) {
      const [x, y] = this.mapD.P(s);
      const ac = map.querySelector("#dbx-ac");
      ac?.setAttribute(
        "transform",
        `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${s.hdg.toFixed(0)})`,
      );
      const tag = map.querySelector<SVGGElement>("#dbx-actag");
      if (tag) {
        const txt = `${num(m.lang, Math.round(s.alt / 10) * 10)} ft`;
        const w = txt.length * 7 + 14;
        const W = map.clientWidth;
        const Hm = map.clientHeight;
        // the tag never covers a finding pin: above right, above left, below right, below left of the aircraft
        const pins = [...map.querySelectorAll<SVGCircleElement>(".pin .dot")].map((c) => [
          Number(c.getAttribute("cx")),
          Number(c.getAttribute("cy")),
        ]);
        const free = (tx: number, ty: number) =>
          tx >= 2 &&
          tx + w <= W - 2 &&
          ty >= 2 &&
          ty + 20 <= Hm - 2 &&
          !pins.some(([px, py]) => px > tx - 11 && px < tx + w + 11 && py > ty - 11 && py < ty + 31);
        const cands: [number, number][] = [
          [x + 16, y - 28],
          [x - 16 - w, y - 28],
          [x + 16, y + 10],
          [x - 16 - w, y + 10],
        ];
        const [tx, ty] =
          cands.find(([a, b]) => free(a, b)) ??
          (x + 16 + w > W - 4 ? cands[1] : cands[0]);
        tag.setAttribute(
          "transform",
          `translate(${tx.toFixed(1)} ${ty.toFixed(1)})`,
        );
        const rect = tag.querySelector("rect");
        rect?.setAttribute("width", String(w));
        const te = tag.querySelector("text");
        if (te) {
          te.textContent = txt;
          te.setAttribute("x", String(w / 2));
        }
        const fbad = m.findings.some(
          (f) => f.group !== "watch" && t >= f.t0 && t <= f.t1,
        );
        tag.classList.toggle("bad", fbad);
      }
    }
    // profile cursor
    const prof = this.els.prof;
    if (s && this.profD && prof) {
      const cur = prof.querySelector<SVGGElement>("#dbx-pcur");
      const x = this.profD.xOf({ t, lat: s.lat, lon: s.lon, alt: s.alt });
      if (cur) {
        cur.style.display = x === null ? "none" : "";
        if (x !== null) {
          cur.querySelector("line")?.setAttribute("x1", x.toFixed(1));
          cur.querySelector("line")?.setAttribute("x2", x.toFixed(1));
          const c = cur.querySelector("circle");
          c?.setAttribute("cx", x.toFixed(1));
          c?.setAttribute("cy", this.profD.yOf(s.alt).toFixed(1));
        }
      }
    }
    // lanes playhead
    const lanes = this.els.lanes;
    if (this.laneD && lanes) {
      const g = lanes.querySelector<SVGGElement>("#dbx-play");
      // inside the plot area, whatever the time (never over the lane labels)
      const xr = this.laneD.X(t);
      const xa = this.laneD.X(0);
      const xb = this.laneD.X(m.durS);
      const x = Number.isFinite(xr) ? Math.max(xa, Math.min(xb, xr)) : xa;
      if (g) {
        g.querySelector("line")?.setAttribute("x1", x.toFixed(1));
        g.querySelector("line")?.setAttribute("x2", x.toFixed(1));
        const W = lanes.clientWidth;
        const rx = Math.max(0, Math.min(W - 44, x - 22));
        const r = g.querySelector("rect");
        r?.setAttribute("x", rx.toFixed(1));
        r?.setAttribute("width", "44");
        const te = g.querySelector("text");
        if (te) {
          te.setAttribute("x", (rx + 22).toFixed(1));
          te.textContent = mmss(t);
        }
      }
      lanes.setAttribute("aria-valuenow", String(Math.round(t)));
      lanes.setAttribute("aria-valuetext", mmss(t));
    }
    if (this.els.time) this.els.time.textContent = clockText(t, m.durS);
    if (this.els.instTitle)
      this.els.instTitle.textContent = this.box.classList.contains("compact")
        ? mmss(t)
        : drt("i.title", { t: mmss(t) });
    // iPad / smaller windows: the dock's "Fly from" shows its time only (the full words are its accessible name)
    this.box.querySelectorAll<HTMLElement>(".dbx-fly.follow").forEach((b) => {
      const full = drt("k.flyFrom", { t: mmss(t) });
      const ft = b.querySelector(".ft");
      if (ft) ft.textContent = this.box.classList.contains("compact") && b.closest(".dbx-tr") ? mmss(t) : full;
      b.setAttribute("aria-label", full);
    });
    // state table
    if (s) this.updateState(s);
    // instruments: every frame when settled, 30 Hz while playing
    const now = performance.now();
    if (settled || now - this.lastInst > 33) {
      this.lastInst = now;
      this.drawInstruments(settled ? 0.5 : dt);
    }
    // the moment card snaps to the finding under the playhead
    if (now > this.pinnedUntil) {
      const k = momentAt(this.moments, t);
      if (k >= 0 && k !== this.mi) this.showMoment(k, false);
    }
    this.announce(false);
  }

  private updateState(s: NonNullable<ReturnType<typeof sampleAt>>) {
    const m = this.m!;
    const sim = this.deps.sim;
    const n = sim.navInputs();
    const loc = n.cdi !== "GPS" && n.nav.valid && n.nav.isLoc;
    const rows: StateRow[] = stateRows(m.lang, {
      alt: s.alt,
      target:
        m.ideal !== undefined
          ? { v: m.ideal, band: m.band ? (m.band[1] - m.band[0]) / 2 : 100 }
          : undefined,
      vs: s.vs,
      ias: s.ias,
      hdg: s.hdg,
      trk: this.player ? sim.ac.data.trackTrue : undefined,
      latDots: s.latDots,
      vertDots: s.vertDots,
      loc,
      gradeDots: s.agl > 200,
      altSel: this.player ? sim.ap.altSel : null,
      rpm: this.player ? sim.ac.s.rpm : null,
      ap: s.ap,
      apModes: s.ap ? `${sim.ap.lat} · ${sim.ap.vert}` : undefined,
    });
    const table = this.els.state;
    if (!table) return;
    const seen = new Set<string>();
    for (const r of rows) {
      seen.add(r.key);
      let e = this.stateEls.get(r.key);
      if (!e) {
        const v = h("span", { class: "v", role: "cell" });
        const row = h(
          "div",
          { class: "row", role: "row" },
          h("span", { class: "k", role: "cell" }, r.label),
          v,
        );
        table.append(row);
        e = { v, row };
        this.stateEls.set(r.key, e);
      }
      (e.row.firstChild as HTMLElement).textContent = r.label;
      e.v.textContent = r.value;
      e.row.classList.toggle("bad", !!r.bad);
    }
    for (const [k, e] of this.stateEls)
      if (!seen.has(k)) {
        e.row.remove();
        this.stateEls.delete(k);
      }
    // keep the table in a stable order
    for (const r of rows) {
      const e = this.stateEls.get(r.key)!;
      table.append(e.row);
    }
  }

  /** the scrub readout for screen readers, throttled to 1/s (final value on release) */
  private announce(force: boolean) {
    const now = performance.now();
    if (!force && now - this.liveAt < 1000) return;
    this.liveAt = now;
    const s = sampleAt(this.samples, this.t);
    const live = this.els.live;
    if (live && s)
      live.textContent = drt("k.live", {
        t: mmss(this.t),
        what: `${num(this.m!.lang, Math.round(s.alt / 10) * 10)} ft, ${Math.round(s.ias)} kt`,
      });
  }

  // ---------------------------------------------------------------- transport
  private togglePlay() {
    const p = this.player;
    if (!p) return;
    if (p.playing) p.pause();
    else {
      if (this.t >= this.m!.durS - 0.5) this.seek(0);
      p.play();
    }
    this.syncTransport();
  }
  private syncTransport() {
    const b = this.els.play;
    const playing = !!this.player?.playing;
    if (b) {
      clear(b);
      b.append(svgIcon(playing ? I.pause : I.play, 16));
      b.setAttribute("aria-label", drt(playing ? "k.pause" : "k.play"));
    }
  }
  private setSpeed(s: number) {
    if (this.player) this.player.speed = s;
    this.els.speed?.querySelectorAll("button").forEach((b, i) => {
      b.classList.toggle("on", SPEEDS[i] === s);
      b.setAttribute("aria-pressed", String(SPEEDS[i] === s));
    });
  }
  private jump(d: 1 | -1) {
    const t = neighbourTime(this.m!, this.t, d, [...this.visible]);
    if (t !== null) {
      this.pinnedUntil = 0;
      this.seek(t);
    }
  }

  private takeOver(t: number) {
    const p = this.player;
    if (!p) return;
    const r = p.takeOver(t);
    this.tookOver = true;
    this.close();
    this.deps.toast(drt("k.flyToast", { t: mmss(r.t) }), "info");
    this.deps.onTakeOver?.(r.t);
  }

  private onKey(e: KeyboardEvent) {
    const tg = e.target as HTMLElement;
    if (
      tg &&
      (tg.tagName === "INPUT" ||
        tg.tagName === "TEXTAREA" ||
        tg.tagName === "SELECT")
    )
      return;
    const k = e.key;
    let used = true;
    if (k === "ArrowLeft" || k === "ArrowRight") {
      this.player?.pause();
      this.syncTransport();
      this.pinnedUntil = 0;
      this.seek(this.t + (k === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 30 : 5));
    } else if (k === " " && tg?.tagName !== "BUTTON") this.togglePlay();
    else if (k === "j" || k === "J") this.jump(-1);
    else if (k === "k" || k === "K") this.jump(1);
    else if (k === "n" || k === "N") this.page(1);
    else if (k === "p" || k === "P") this.page(-1);
    else if (k === "1") this.setSpeed(1);
    else if (k === "4") this.setSpeed(4);
    else if (k === "6") this.setSpeed(16);
    else used = false;
    if (used) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
}

/** the finding row labels come from the result sheet's strings (one vocabulary with the result) */
const drtR = (k: string) => resultRt(k);
