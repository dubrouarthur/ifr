// Ground school player (package E) — the Fly-it step (mockup final/flyit.png): Brief → Fly → Debrief.
//   left   kind chip, title, brief, the three-stage stepper, the scene card (start, radios, panel, weather) with the
//          instructor options, and "Passes when": the criteria with their ACS codes and, after a flight, met / missed
//          with the worst value.
//   right  before the flight: keys to success, the interactive briefing (FlyIt.briefing), Fly it, Watch the CFI.
//          after it: the student grades themselves FIRST (Nailed it / Close / Not yet), then sees what the sim
//          measured, the trace of the governing parameter with the ACS band and the exceedance, the one-line cause,
//          the CFI's note, and Fly it again / Watch the CFI / Replay with trace.
// Pure helpers (headline, rows, trace geometry) are unit-tested.
import type {
  AttemptRecord,
  Criterion,
  FlyIt,
  FlyOption,
  Lang,
  Step,
} from "../types";
import { FMT } from "../calc/text";
import {
  btn,
  h,
  icon,
  kindChip,
  L,
  ps,
  richEl,
  stepMeta,
  textEl,
} from "./reader";

export type SelfGrade = "nailed" | "close" | "notyet";
export const SELF_GRADES: SelfGrade[] = ["nailed", "close", "notyet"];
export const selfGradeLabel = (g: SelfGrade, lang: Lang): string =>
  ps(g === "nailed" ? "nailed" : g === "close" ? "closeGrade" : "notYet", lang);

// ------------------------------------------------------------------ pure helpers
export interface CriterionRow {
  id: string;
  label: string;
  acs: string;
  /** null before a flight (or before the self-grade) */
  met: boolean | null;
  value: string;
}
/** The "Passes when" rows: the criteria, with the attempt's met / worst / time when there is one to show. */
export function criterionRows(
  criteria: readonly Criterion[],
  attempt: AttemptRecord | null | undefined,
  lang: Lang,
  reveal: boolean,
): CriterionRow[] {
  const f = FMT[lang];
  return criteria.map((c) => {
    const r = reveal
      ? attempt?.fly?.criteria.find((x) => x.id === c.id)
      : undefined;
    let value = "";
    if (r) {
      if (!r.met && r.atS !== undefined)
        value =
          `${r.worst ?? ""}${r.worst ? " " : ""}${ps("at", lang, { t: f.sec(r.atS) })}`.trim();
      else if (r.worst) value = ps("worst", lang, { v: r.worst });
    }
    return {
      id: c.id,
      label: L(c.label, lang),
      acs: c.acs ? `ACS ${c.acs}` : ps("thisCourse", lang),
      met: r ? r.met : null,
      value,
    };
  });
}
/** "Not yet · 2 of 3 met" / "Passed · 3 of 3 met" */
export function attemptHeadline(
  attempt: AttemptRecord,
  criteria: readonly Criterion[],
  lang: Lang,
): string {
  const fl = attempt.fly;
  const rows = fl?.criteria ?? [];
  const n = criteria.length || rows.length;
  const m = criteria.length
    ? criteria.filter((c) => rows.find((r) => r.id === c.id)?.met).length
    : rows.filter((r) => r.met).length;
  const head = fl?.passed ? ps("passed", lang) : ps("notYet", lang);
  return n ? `${head} · ${ps("metOf", lang, { m, n })}` : head;
}
/** "6 min 40 s" / "6:40" for the top-bar pill and the Fly stage */
export const flownText = (secs: number, lang: Lang): string =>
  lang === "fr"
    ? FMT.fr.sec(secs)
    : `${Math.floor(secs / 60)} min ${Math.round(secs % 60)} s`;

/** The trace of the governing parameter (from the recorder; the integrator provides it). */
export interface DebriefTrace {
  /** what is plotted, e.g. "CDI (dots)" */
  label: string;
  samples: { t: number; v: number }[];
  /** the y range drawn (default: from the samples, the band and the limit) */
  range?: [number, number];
  /** the ACS band, shaded (e.g. ±¾ scale) */
  band?: [number, number];
  /** the limit line (e.g. full scale) */
  limit?: { v: number; label: string };
  /** y axis labels */
  yLabels?: { v: number; label: string }[];
  /** the exceedance: shaded from t0 to t1, marked at (t, v) */
  exceed?: { t0: number; t1: number; t: number; v: number; label: string };
  /** the one-line cause built from the recorder (wind, heading, distance) */
  cause?: string;
}
export interface TraceGeom {
  path: string;
  x(t: number): number;
  y(v: number): number;
  t0: number;
  t1: number;
  ticks: number[];
}
/** Map a trace into a w × h box (padding left for the labels): an SVG path and the scales. */
export function traceGeometry(
  tr: DebriefTrace,
  w: number,
  hgt: number,
  pad = { l: 48, r: 16, t: 18, b: 26 },
): TraceGeom {
  const s = tr.samples.length ? tr.samples : [{ t: 0, v: 0 }];
  const t0 = s[0].t;
  const t1 = Math.max(t0 + 1, s[s.length - 1].t);
  const vs = s.map((p) => p.v);
  if (tr.band) vs.push(...tr.band);
  if (tr.limit) vs.push(tr.limit.v);
  let [lo, hi] = tr.range ?? [Math.min(...vs), Math.max(...vs)];
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const m = (hi - lo) * 0.06;
  lo -= m;
  hi += m;
  const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * (w - pad.l - pad.r);
  const y = (v: number) =>
    pad.t + (1 - (v - lo) / (hi - lo)) * (hgt - pad.t - pad.b);
  // a smooth trace (Catmull-Rom through the samples, as cubic Béziers)
  const pts = s.map((p) => [x(p.t), y(p.v)] as const);
  let path = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    path += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  // time ticks every 15 s / 30 s / 1 min / 2 min / 5 min (at most 4 intervals)
  const span = t1 - t0;
  const step = [15, 30, 60, 120, 300, 600].find((k) => span / k <= 4) ?? 1200;
  const ticks: number[] = [];
  for (let t = Math.ceil(t0 / step) * step; t <= t1 + 1e-9; t += step)
    ticks.push(t);
  return { path, x, y, t0, t1, ticks };
}

// ------------------------------------------------------------------ the view
export type FlyStatusKind = "brief" | "flown" | "notFinished" | "pending";
export interface FlyModel {
  lang: Lang;
  step: Step;
  fly: FlyIt;
  criteria: Criterion[];
  /** Start / Radios / Panel / Weather */
  sceneRows?: { label: string; value: string }[];
  /** the scene still or thumbnail */
  still?: Promise<string | null> | string | null;
  /** no still: draw the panel at the scene into this canvas (the stage renderers) */
  drawThumb?: (canvas: HTMLCanvasElement) => void;
  status: FlyStatusKind;
  attempt?: AttemptRecord | null;
  /** 1-based number of this attempt */
  attemptNo?: number;
  /** the student already graded themselves on this attempt */
  selfGraded?: boolean;
  /** options on for the next flight */
  options: FlyOption[];
  /** the CFI's name (the note's byline) */
  author?: string;
  trace?: DebriefTrace | null;
  /** Watch the CFI clip length (s) */
  workedS?: number;
  /** the store is available (flying writes a handoff token) */
  canFly: boolean;
  /** a message instead of flying (no store, an error) */
  message?: string;
  /** a neutral note above the Fly button (e.g. the cockpit of this build cannot fly course steps yet) */
  note?: string;
  /** the Fly button's label (default "Fly it") */
  flyLabel?: string;
}
export interface FlyHandlers {
  onFly(options: FlyOption[]): void;
  onOptions?(options: FlyOption[]): void;
  onWatch?(): void;
  onReplay?(): void;
  onSelfGrade?(g: SelfGrade): void;
  onBriefing?(): void;
}
const OPTION_LABEL: Record<FlyOption, [string, string]> = {
  wind: ["Wind", "Vent"],
  partialPanel: ["Partial panel", "Panneau partiel"],
  surpriseMe: ["Surprise me", "Surprise"],
  goMissed: ["Go missed", "Remise de gaz"],
  turbulence: ["Turbulence", "Turbulence"],
  allowAp: ["Autopilot allowed", "Pilote automatique permis"],
};
export const optionLabel = (o: FlyOption, lang: Lang): string =>
  OPTION_LABEL[o][lang === "fr" ? 1 : 0];

export class FlyItView {
  readonly el: HTMLDivElement;
  constructor(
    private m: FlyModel,
    private on: FlyHandlers,
  ) {
    this.el = h("div", { class: "cp-fly" });
    this.render();
  }
  update(m: Partial<FlyModel>) {
    this.m = { ...this.m, ...m };
    this.render();
  }
  private get revealed(): boolean {
    return this.m.status === "flown" && !!this.m.attempt && !!this.m.selfGraded;
  }

  private render() {
    const m = this.m;
    const lang = m.lang;
    this.el.replaceChildren();
    // ---- left
    const main = h("div", { class: "cp-fly-main" });
    main.append(
      h(
        "div",
        { class: "cp-meta" },
        kindChip("fly", lang),
        h("span", { class: "cp-muted" }, stepMeta(m.step, lang)),
      ),
      textEl("h1", m.step.title, lang, "cp-h1"),
    );
    if (m.fly.brief)
      main.append(richEl(m.fly.brief, lang, undefined, "cp-rich cp-lead"));
    const stage =
      m.status === "brief" || m.status === "pending"
        ? 0
        : m.status === "notFinished"
          ? 1
          : 2;
    const durS =
      m.fly.target.kind === "scene" || m.fly.target.kind === "calc"
        ? m.fly.target.durationS
        : undefined;
    const steps: [string, string][] = [
      [ps("flyBrief", lang), ps("flyBriefSub", lang)],
      [
        ps("flyFly", lang),
        ps("flyFlySub", lang) +
          (m.attempt?.secs
            ? ` · ${FMT[lang].sec(m.attempt.secs)}`
            : durS
              ? ` · ${FMT[lang].sec(durS)}`
              : ""),
      ],
      [ps("flyDebrief", lang), ps("flyDebriefSub", lang)],
    ];
    main.append(
      h(
        "ol",
        { class: "cp-stepper" },
        ...steps.map(([t, s], i) =>
          h(
            "li",
            {
              class: i === stage ? "on" : i < stage ? "past" : "",
              "aria-current": i === stage ? "step" : null,
            },
            h(
              "span",
              { class: "n num" },
              i < stage ? icon("check") : String(i + 1),
            ),
            h("span", {}, h("b", {}, t), h("span", { class: "cp-muted" }, s)),
          ),
        ),
      ),
    );
    // scene card
    const card = h("div", { class: "cp-card cp-scene" });
    const top = h("div", { class: "cp-scene-top" });
    const thumb = h("div", { class: "cp-thumb" }, icon("plane", "i big"));
    Promise.resolve(m.still ?? null).then((url) => {
      if (url) thumb.replaceChildren(h("img", { src: url, alt: "", decoding: "async" }));
      else if (m.drawThumb) {
        const c = h("canvas", { class: "cp-thumbc", "aria-hidden": "true" });
        thumb.replaceChildren(c);
        thumb.classList.add("panel");
        requestAnimationFrame(() => {
          try {
            m.drawThumb!(c);
          } catch {
            thumb.replaceChildren(icon("plane", "i big"));
          }
        });
      }
    });
    top.append(thumb);
    if (m.sceneRows?.length)
      top.append(
        h(
          "dl",
          { class: "cp-dl" },
          ...m.sceneRows.flatMap((r) => [
            h("dt", {}, r.label),
            h("dd", {}, r.value),
          ]),
        ),
      );
    card.append(top);
    if (m.fly.options.length) {
      const opts = h(
        "div",
        { class: "cp-opts-row" },
        h("span", { class: "cp-label" }, ps("options", lang)),
      );
      for (const o of m.fly.options) {
        const on = m.options.includes(o);
        const b = h(
          "button",
          {
            type: "button",
            class: `cp-chip${on ? " on" : ""}`,
            "aria-pressed": String(on),
          },
          optionLabel(o, lang),
        );
        b.addEventListener("click", () => {
          const next = on
            ? m.options.filter((x) => x !== o)
            : [...m.options, o];
          this.m.options = next;
          this.on.onOptions?.(next);
          this.render();
        });
        opts.append(b);
      }
      card.append(opts);
    }
    main.append(card);
    // passes when
    const pass = h(
      "div",
      { class: "cp-card cp-pass" },
      h(
        "div",
        { class: "hd" },
        h("span", { class: "cp-label" }, ps("passesWhen", lang)),
        m.attemptNo
          ? h(
              "span",
              { class: "cp-label soft" },
              ps("attemptN", lang, { n: m.attemptNo }),
            )
          : null,
      ),
    );
    if (!m.criteria.length)
      pass.append(h("p", { class: "cp-muted pad" }, ps("engineGrades", lang)));
    for (const r of criterionRows(m.criteria, m.attempt, lang, this.revealed))
      pass.append(
        h(
          "div",
          { class: `cp-row${r.met === false ? " miss" : ""}` },
          h("span", {
            class: `cp-check${r.met === true ? " ok" : r.met === false ? " miss" : ""}`,
            role: "img",
            "aria-label":
              r.met === true
                ? ps("done", lang)
                : r.met === false
                  ? ps("notYet", lang)
                  : "",
          }),
          h("span", { class: "t" }, r.label),
          h("span", { class: "acs" }, r.acs),
          h(
            "span",
            { class: `cp-readout${r.met === false ? " warn" : ""}` },
            r.value,
          ),
        ),
      );
    main.append(pass);
    // ---- right
    const side = h("div", { class: "cp-fly-side" });
    if (m.status === "flown" && m.attempt) side.append(this.attemptCard());
    else side.append(this.briefCard());
    side.append(h("p", { class: "cp-records" }, ps("records", lang)));
    this.el.append(main, side);
  }

  private briefCard(): HTMLElement {
    const m = this.m;
    const lang = m.lang;
    const card = h("div", { class: "cp-card cp-attempt" });
    if (m.status === "notFinished")
      card.append(
        h("div", { class: "cp-label" }, ps("yourAttempt", lang)),
        h("h2", { class: "cp-h2" }, ps("notFinished", lang)),
        h("p", { class: "cp-muted" }, ps("notFinishedBody", lang)),
      );
    if (m.fly.keys?.length)
      card.append(
        h(
          "div",
          { class: "cp-key" },
          h("div", { class: "cp-label" }, ps("keyToSuccess", lang)),
          ...m.fly.keys.map((k) => richEl(k, lang)),
        ),
      );
    if (m.fly.briefing?.length && this.on.onBriefing)
      card.append(
        h(
          "button",
          { type: "button", class: "cp-brieflaunch" },
          h("span", { class: "n" }, icon("play")),
          h(
            "span",
            {},
            h("b", {}, ps("startBriefing", lang)),
            h(
              "span",
              { class: "cp-muted" },
              ps("briefingPages", lang, { n: m.fly.briefing.length }),
            ),
          ),
          icon("next"),
        ),
      );
    card
      .querySelector(".cp-brieflaunch")
      ?.addEventListener("click", () => this.on.onBriefing?.());
    if (m.message) card.append(h("p", { class: "cp-err" }, m.message));
    if (m.note) card.append(h("p", { class: "cp-fly-note", role: "note" }, m.note));
    const acts = h("div", { class: "cp-fly-acts" });
    const fly = btn(
      m.flyLabel ?? (m.status === "notFinished" ? ps("flyAgain", lang) : ps("flyIt", lang)),
      "primary lg",
      () => this.on.onFly(m.options),
      "plane",
    );
    fly.disabled = !m.canFly;
    acts.append(fly);
    if (m.fly.worked && this.on.onWatch)
      acts.append(
        btn(
          ps("watchCfi", lang) +
            (m.workedS ? ` · ${FMT.en.sec(m.workedS)}` : ""),
          "",
          () => this.on.onWatch?.(),
          "play",
        ),
      );
    card.append(acts);
    return card;
  }

  private attemptCard(): HTMLElement {
    const m = this.m;
    const lang = m.lang;
    const a = m.attempt!;
    const card = h(
      "div",
      { class: "cp-card cp-attempt" },
      h("div", { class: "cp-label" }, ps("yourAttempt", lang)),
    );
    const chosen = a.fly?.selfGrade;
    if (!this.revealed)
      card.append(h("h2", { class: "cp-h2" }, ps("gradeFirst", lang)));
    else {
      card.append(
        h("h2", { class: "cp-h2" }, attemptHeadline(a, m.criteria, lang)),
      );
      if (chosen)
        card.append(
          h(
            "p",
            { class: "cp-muted" },
            ps("youSaid", lang, { g: selfGradeLabel(chosen, lang) }),
          ),
        );
    }
    const grades = h("div", {
      class: "cp-grades",
      role: "radiogroup",
      "aria-label": ps("gradeFirst", lang),
    });
    for (const g of SELF_GRADES) {
      const on = this.revealed && chosen === g;
      const b = h(
        "button",
        {
          type: "button",
          role: "radio",
          class: `cp-grade g-${g}${on ? " on" : ""}`,
          "aria-checked": String(on),
        },
        selfGradeLabel(g, lang),
      );
      b.addEventListener("click", () => this.on.onSelfGrade?.(g));
      grades.append(b);
    }
    card.append(grades);
    if (!this.revealed) return card;
    if (m.trace) card.append(traceSvg(m.trace));
    if (m.trace?.cause)
      card.append(h("p", { class: "cp-cause" }, m.trace.cause));
    const note = a.cfiNote ? { en: a.cfiNote } : m.fly.debrief;
    if (note)
      card.append(
        h(
          "div",
          { class: "cp-note" },
          h(
            "div",
            { class: "cp-label" },
            ps("noteFrom", lang, { name: m.author ?? "CFI" }),
          ),
          richEl(note, lang),
        ),
      );
    const acts = h("div", { class: "cp-fly-acts" });
    const again = btn(
      ps("flyAgain", lang),
      "primary",
      () => this.on.onFly(m.options),
      "plane",
    );
    again.disabled = !m.canFly;
    acts.append(again);
    if (m.fly.worked && this.on.onWatch)
      acts.append(
        btn(
          ps("watchCfi", lang) +
            (m.workedS ? ` · ${FMT.en.sec(m.workedS)}` : ""),
          "",
          () => this.on.onWatch?.(),
          "play",
        ),
      );
    if (this.on.onReplay)
      acts.append(
        btn(ps("replayTrace", lang), "ghost", () => this.on.onReplay?.()),
      );
    card.append(acts);
    return card;
  }
}

/** The trace chart (SVG): the band, the limit, the trace, the exceedance. */
export function traceSvg(tr: DebriefTrace): SVGSVGElement {
  const W = 600;
  const H = 180;
  const g = traceGeometry(tr, W, H);
  const NS = "http://www.w3.org/2000/svg";
  const el = <K extends keyof SVGElementTagNameMap>(
    tag: K,
    a: Record<string, string | number>,
    text?: string,
  ) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(a)) e.setAttribute(k, String(v));
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const svg = el("svg", {
    viewBox: `0 0 ${W} ${H}`,
    class: "cp-trace",
    role: "img",
    "aria-label": `${tr.label}${tr.exceed ? ` · ${tr.exceed.label}` : ""}`,
  });
  const x0 = g.x(g.t0);
  const x1 = g.x(g.t1);
  if (tr.exceed)
    svg.append(
      el("rect", {
        x: g.x(tr.exceed.t0),
        y: 8,
        width: Math.max(2, g.x(tr.exceed.t1) - g.x(tr.exceed.t0)),
        height: H - 34,
        class: "ex",
      }),
    );
  if (tr.band) {
    const [lo, hi] = tr.band;
    svg.append(
      el("rect", {
        x: x0,
        y: g.y(hi),
        width: x1 - x0,
        height: g.y(lo) - g.y(hi),
        class: "band",
      }),
    );
    for (const v of [lo, hi])
      svg.append(
        el("line", { x1: x0, x2: x1, y1: g.y(v), y2: g.y(v), class: "bandl" }),
      );
  }
  if (tr.limit) {
    svg.append(
      el("line", {
        x1: x0,
        x2: x1,
        y1: g.y(tr.limit.v),
        y2: g.y(tr.limit.v),
        class: "lim",
      }),
    );
  }
  for (const l of tr.yLabels ?? [])
    svg.append(el("text", { x: 8, y: g.y(l.v) + 4, class: "yl" }, l.label));
  for (const t of g.ticks)
    svg.append(
      el(
        "text",
        {
          x: g.x(t),
          y: H - 6,
          class: "xl",
          "text-anchor": t === g.t0 ? "start" : "middle",
        },
        FMT.en.sec(t),
      ),
    );
  svg.append(el("path", { d: g.path, class: "tr" }));
  if (tr.exceed) {
    svg.append(
      el("circle", {
        cx: g.x(tr.exceed.t),
        cy: g.y(tr.exceed.v),
        r: 5,
        class: "exd",
      }),
    );
    const tx = Math.min(W - 8, g.x(tr.exceed.t) + 10);
    svg.append(
      el(
        "text",
        {
          x: tx,
          y: Math.max(14, g.y(tr.exceed.v) - 6),
          class: "exl",
          "text-anchor": tx > W - 120 ? "end" : "start",
        },
        tr.exceed.label,
      ),
    );
  }
  return svg;
}
