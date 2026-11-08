// The exercise result sheet (SPEC §2.1–2.3): opens when an exercise ends, in three states: Standard met (green),
// Standard not met (red), Not graded · ended early (grey, "—", no score). Top to bottom: the ACS-worded verdict and
// a headline naming the main finding, "N of M standards met" and help chips, the standard tiles, the flight
// timeline, the finding cards, Practise next, the spatial view, Help used and Met the standard. The footer keeps
// Debrief, Retry, Next and Close; its primary is Practise next row 1, or "Back to the course" when the exercise was
// launched from a course (opts.backToCourse).
import { h, clear } from "../dom";
import { Modal, saveFlightRecord } from "../modals";
import { svgIcon, I } from "../icons";
import { setLang, onLangChange } from "../i18n";
import { history } from "../history";
import { progress, isGraded } from "../learn";
import { EXERCISES, STAGES, exercise, type Path } from "../../train/curriculum";
import type { Exercise, LessonRun } from "../../train/engine";
import { findApproach } from "../../nav/data";
import { buildReport } from "./report";
import { practiseNext, SKILL_LESSON } from "./practise";
import { inputFromRun, type ResultObserver } from "./observe";
import { curLang, mmss, rt } from "./i18n";
import { verdictChip, stdBar, helpChips } from "./verdict";
import { tiles } from "./tiles";
import { mountTimeline } from "./timeline";
import { findingCard } from "./findingCard";
import { nextList } from "./nextList";
import { helpBox } from "./helpBox";
import { planViewSvg } from "./planView";
import type {
  EndedBy,
  Lang,
  NextItem,
  NextPlan,
  ResultInput,
  ResultReport,
  StopReason,
} from "./types";

export interface ResultDeps {
  /** fly the exercise again (opens its briefing) */
  onRetry: (ex: Exercise) => void;
  /** the next exercise (opens its briefing) */
  onNext: (ex: Exercise) => void;
  /** the full debrief (at a lesson time: a finding's "Replay from") */
  onDebrief: (atLessonT?: number) => void;
  /** resume an exercise ended early, exactly where it stopped */
  onResume?: (run: LessonRun) => void;
  /** the hold-entry drill */
  onDrill?: () => void;
  /** another exercise (practise next) */
  onLesson?: (ex: Exercise) => void;
  /** « ← Accueil »: the home page */
  onHome?: () => void;
}

export interface ResultOpenOpts {
  /** launched from a course: the primary action goes back to it */
  backToCourse?: { label: string; run: () => void };
  /** course title (crumb) */
  course?: string;
  /** extra sections for the main column (emergency procedures graded during the flight) */
  extra?: HTMLElement[];
  /** how the run ended (default: from the run) */
  endedBy?: EndedBy;
}

const STOP_REASONS: StopReason[] = ["time", "lost", "restart-entry", "broken"];

/** how a finished run ended: an exercise ended with End before it was complete is not graded */
export function endedByOf(run: LessonRun): EndedBy {
  const r = run.finished;
  if (!r) return "user";
  if (run.sim.ac.s.crashed) return "crash";
  if (!isGraded(r)) return "user";
  return /^Drill complete|^Exercice terminé/.test(r.reason)
    ? "drill-end"
    : "complete";
}

export class ResultSheet extends Modal {
  private run: LessonRun | null = null;
  private path: Path | null = null;
  private opts: ResultOpenOpts = {};
  private input: ResultInput | null = null;
  private rep: ResultReport | null = null;
  private plan: NextPlan | null = null;
  private stopReason: StopReason | null = null;
  private recId: string | null = null;
  private cleanups: (() => void)[] = [];
  private ro: ResizeObserver | null = null;
  private pnEl: HTMLElement | null = null;
  private pnHome: { narrow: HTMLElement; wide: HTMLElement } | null = null;
  private langOff: (() => void) | null = null;
  /** where the aircraft was when the exercise ended: Resume is offered only while the sim is still there */
  private stopAt: { time: number; lat: number; lon: number; alt: number } | null = null;

  constructor(
    private deps: ResultDeps,
    private observer: ResultObserver | null = null,
  ) {
    super("Exercise result");
    this.box.className = "modal rs";
    this.bg.classList.add("rs-bg");
    this.onClose = () => this.teardown();
  }

  /** the report shown (tests, the course bridge) */
  get report() {
    return this.rep;
  }
  /** the practise-next plan shown */
  get nextPlan() {
    return this.plan;
  }
  /** the result's input (the debrief re-grades it in its own language) */
  get resultInput() {
    return this.input;
  }
  /** the training record of the attempt shown */
  get recordId() {
    return this.recId;
  }
  /** the run shown (its exercise, its flight record) */
  get lastRun() {
    return this.run;
  }
  /** lesson time → sim time of the run shown (the observer's clock; the run's own clock without it) */
  toSim(lessonT: number): number {
    const run = this.run;
    if (this.observer && this.observer.run === run) return this.observer.toSim(lessonT);
    return run ? lessonT + (run.sim.time - run.totalT) : lessonT;
  }

  /** an exercise ended early can resume "exactly where you stopped" only while the sim has not run since the stop
   *  (the sheet was closed and the flight went on, or the debrief handed the aircraft over at another time) */
  canResume(run: LessonRun | null = this.run): boolean {
    const a = this.stopAt;
    if (!run || run !== this.run || !a || run.sim.ac.s.crashed) return false;
    const s = run.sim.ac.s;
    return (
      Math.abs(run.sim.time - a.time) < 0.05 &&
      Math.abs(s.lat - a.lat) < 1e-7 &&
      Math.abs(s.lon - a.lon) < 1e-7 &&
      Math.abs(s.altFt - a.alt) < 0.5
    );
  }

  /** Practise next for a report, in a language */
  planFor(rep0: ResultReport, L: Lang = curLang()): NextPlan {
    const run = this.run!;
    const next = this.nextEx();
    const rep =
      rep0.resumable && !this.canResume() ? { ...rep0, resumable: false } : rep0;
    // a "simpler exercise" comes before this one in the curriculum (stage order, then the order within a stage)
    const order = (id: string) => EXERCISES.findIndex((x) => x.id === id);
    const here = order(run.ex.id);
    return practiseNext(rep, {
      lang: L,
      ex: { id: run.ex.id, title: run.ex.title, minutes: run.ex.minutes },
      next: next
        ? { id: next.id, title: next.title, minutes: next.minutes }
        : null,
      hold: !!this.input?.hold,
      stopReason: this.stopReason,
      simpler: (skill) => {
        const id = SKILL_LESSON[skill];
        const e = id ? EXERCISES.find((x) => x.id === id) : undefined;
        if (!e || (here >= 0 && order(e.id) >= here)) return null;
        return { id: e.id, title: e.title, minutes: e.minutes };
      },
    });
  }

  /** an exercise ended: record it, then show its result */
  show(run: LessonRun, path: Path | null, opts: ResultOpenOpts = {}) {
    const r = run.finished!;
    this.run = run;
    this.path = path;
    this.opts = opts;
    this.stopReason = null;
    const s0 = run.sim.ac.s;
    this.stopAt = { time: run.sim.time, lat: s0.lat, lon: s0.lon, alt: s0.altFt };
    const graded = isGraded(r);
    // a graded attempt counts in the progress; an exercise ended early does not (no score, no attempt)
    progress.record(run.ex.id, r);
    // the flight goes into the training records: with the exercise and its result, or marked not graded
    run.sim.rec.lesson = graded
      ? {
          id: run.ex.id,
          title: run.ex.title,
          score: r.score!,
          passed: r.passed,
        }
      : { id: run.ex.id, title: run.ex.title };
    const rec = saveFlightRecord(run.sim);
    if (rec && !graded) history.upsert({ ...rec, graded: false });
    this.recId = rec?.id ?? null;
    const n = Math.max(
      1,
      history.all().filter((a) => a.exercise === run.ex.id).length,
    );
    const st = STAGES.find((s) => s.id === run.ex.stage);
    const pi = path ? path.exercises.indexOf(run.ex.id) : -1;
    const ap = run.ex.plate ? findApproach(run.ex.plate) : undefined;
    const fixes = ap
      ? [
          ...ap.transitions.flatMap((t) => t.legs),
          ...ap.final,
          ...ap.missed,
        ].map((l) => ({ ident: l.fix.ident, lat: l.fix.lat, lon: l.fix.lon }))
      : undefined;
    this.input = inputFromRun(run, this.observer, {
      lang: curLang(),
      endedBy: opts.endedBy ?? endedByOf(run),
      stageTitle: st?.title,
      pathPos:
        path && pi >= 0
          ? { n: pi + 1, of: path.exercises.length, title: path.title }
          : undefined,
      attempt: { n, at: Date.now() },
      fixes,
      course: opts.course,
    });
    this.render();
    this.open();
  }

  /** open again ("‹ Result" in the debrief) */
  reopen() {
    if (!this.input) return;
    this.render();
    this.open();
  }

  open() {
    super.open();
    this.langOff?.();
    this.langOff = onLangChange(() => {
      if (this.isOpen) this.render(true);
    });
    requestAnimationFrame(() =>
      this.box
        .querySelector<HTMLElement>(".rs-foot .rs-btn.primary")
        ?.focus({ preventScroll: true }),
    );
  }

  private teardown() {
    this.cleanups.forEach((f) => f());
    this.cleanups = [];
    this.ro?.disconnect();
    this.ro = null;
    this.langOff?.();
    this.langOff = null;
  }

  private nextEx(): Exercise | null {
    const run = this.run!;
    const path = this.path;
    const idx = path ? path.exercises.indexOf(run.ex.id) : -1;
    const id =
      path && idx >= 0
        ? path.exercises[idx + 1]
        : EXERCISES[EXERCISES.findIndex((e) => e.id === run.ex.id) + 1]?.id;
    return id ? (EXERCISES.find((e) => e.id === id) ?? null) : null;
  }

  private render(keepScroll = false) {
    const run = this.run!;
    const inp = this.input!;
    const L = curLang();
    const prevScroll = keepScroll
      ? (this.box.querySelector(".rs-body")?.scrollTop ?? 0)
      : 0;
    this.teardown();
    inp.lang = L;
    const rep0 = buildReport(inp);
    // Resume only while the aircraft is still where the exercise stopped (canResume)
    const rep =
      rep0.resumable && !this.canResume() ? { ...rep0, resumable: false } : rep0;
    const next = this.nextEx();
    const plan = this.planFor(rep, L);
    this.rep = rep;
    this.plan = plan;
    const ungraded = rep.outcome === "ungraded";
    clear(this.box);
    this.box.classList.toggle("ungraded", ungraded);
    this.box.setAttribute("aria-labelledby", "rs-hl");
    this.box.removeAttribute("aria-label");

    // ---- header
    const crumb: string[] = [];
    if (inp.stageTitle)
      crumb.push(
        inp.stageTitle.replace(
          /^Stage (\d+) — /,
          L === "fr" ? "Étape $1 · " : "Stage $1 · ",
        ),
      );
    if (inp.pathPos)
      crumb.push(rt("crumb.lesson", { n: inp.pathPos.n, of: inp.pathPos.of }));
    if (inp.course) crumb.push(rt("crumb.course", { c: inp.course }));
    const date = new Intl.DateTimeFormat(L === "fr" ? "fr-FR" : "en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(inp.attempt.at);
    const meta = [
      rt("sheet.attempt", { n: inp.attempt.n, date }),
      ungraded ? null : rt("sheet.flown", { t: mmss(inp.durationSec) }),
    ]
      .filter(Boolean)
      .join(" · ");
    const langSeg = h(
      "div",
      { class: "rs-lang", role: "group", "aria-label": rt("sheet.lang") },
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
    const head = h(
      "header",
      { class: "rs-hd" },
      h("h1", {}, rt(ungraded ? "sheet.titleEnded" : "sheet.title")),
      crumb.length ? h("span", { class: "crumb" }, crumb.join(" · ")) : null,
      h("span", { class: "sp" }),
      h("span", { class: "meta" }, meta),
      langSeg,
      h(
        "button",
        {
          class: "rs-x",
          "aria-label": rt("sheet.close"),
          onclick: () => this.close(),
        },
        h("span", {
          class: "xi",
          "aria-hidden": "true",
          html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
        }),
      ),
    );

    // ---- verdict block
    const sub: (Node | string)[] = [];
    if (ungraded) sub.push(...bold(rep.summary));
    else
      sub.push(
        h("b", {}, rt("std.count", { k: rep.metCount, n: rep.gradedCount })),
        rep.summary ? ` · ${rep.summary}` : "",
      );
    const chips = helpChips(rep.help);
    const verdict = h(
      "section",
      { class: "rs-head" },
      h(
        "div",
        { class: "rh-top" },
        // one word: Réussi · Presque (one standard short) · À retravailler
        verdictChip(rep.outcome, rep.outcome === "not-met" && rep.gradedCount >= 2 && rep.metCount >= rep.gradedCount - 1),
        rep.withHelp
          ? h("span", { class: "rs-chip help" }, rt("v.metHelp"))
          : null,
        // plain words; the FAA / ACS code is a reference in the tooltip (« Norme du test en vol »), never shown
        rep.taskRef
          ? h(
              "span",
              { class: "rs-eyebrow", title: rt("sheet.norm", { ref: rep.taskRef }) },
              rep.eyebrow.endsWith(` · ${rep.taskRef}`)
                ? rep.eyebrow.slice(0, -(rep.taskRef.length + 3))
                : rep.eyebrow,
            )
          : h("span", { class: "rs-eyebrow" }, rep.eyebrow),
      ),
      h("h2", { id: "rs-hl" }, rep.headline),
      h(
        "div",
        { class: "rh-sub" },
        h("span", { class: "sub" }, ...sub),
        ungraded ? null : stdBar(rep.standards),
        h("span", { class: "sp" }),
        ...chips,
      ),
      tiles(rep.tiles),
    );

    // ---- timeline
    const tlHost = h("div", { class: "rs-tlc" });
    const legend: HTMLElement[] = [];
    if (rep.trace.ideal !== undefined)
      legend.push(
        h(
          "span",
          { class: "rs-chip" },
          h("i", { class: "lg-ideal" }),
          rt("tl.target", {
            v: rep.trace.ideal.toLocaleString(L === "fr" ? "fr-FR" : "en-US"),
          }),
        ),
      );
    if (rep.trace.band)
      legend.push(
        h(
          "span",
          { class: "rs-chip" },
          h("i", { class: "lg-band" }),
          rt("tl.band", { v: 100 }),
        ),
      );
    const timeline =
      rep.trace.points.length > 1
        ? h(
            "section",
            { class: "rs-tl" },
            h(
              "div",
              { class: "hd" },
              h("b", {}, rt("tl.title")),
              rep.findings.length ? h("span", {}, rt("tl.sub")) : null,
              h("span", { class: "sp" }),
              ...legend,
            ),
            tlHost,
          )
        : null;

    // ---- practise next
    // one primary per screen: the footer's primary runs the first row (unless it leads back to a course). An
    // ungraded attempt the pilot can resume: the footer says "Resume at 0:46", so the list keeps the other ways
    // ("Or · Restart") and does not repeat it
    // one primary per screen: the footer's (« ← Retour au cours » from a course, else « Recommencer le vol »);
    // the list's rows are plain buttons, and a « fly it again » row would repeat the footer's primary
    const back0 = !!this.opts.backToCourse;
    const listItems = plan.items
      .filter((it) => back0 || (it.kind !== "retry" && it.kind !== "restart"))
      .map((it) => ({ ...it, primary: false }));
    const listPlan: NextPlan = { ...plan, items: listItems };
    this.pnEl = nextList(
      listPlan,
      rt(ungraded && listItems[0]?.kind === "resume" ? "sec.pickUp" : "sec.next"),
      (it) => this.runItem(it),
    );

    // ---- spatial view
    const pv = planViewSvg(inp, rep);
    const pvPanel = pv
      ? h(
          "section",
          { class: "rs-panel rs-pv" },
          h(
            "h4",
            {},
            rt(inp.hold ? "sec.trackHold" : "sec.track"),
            h("span", { class: "sp" }),
            h("span", { class: "h4r" }, rt("sec.northUp")),
          ),
          h("div", { class: "pv", html: pv }),
          h(
            "div",
            { class: "pv-lg" },
            h("span", {}, h("i", { class: "lg-trk" }), rt("pv.flown")),
            rep.outcome === "ungraded" && inp.hold?.crossedAt === null
              ? h("span", {}, h("i", { class: "lg-todo" }), rt("pv.todo"))
              : null,
            inp.hold
              ? h(
                  "span",
                  {},
                  h("i", { class: "lg-hold" }),
                  rt("pv.hold", { m: inp.hold.legMin }),
                )
              : null,
          ),
        )
      : null;

    // ---- main column
    const main = h("div", { class: "rs-main" });
    const side = h("div", { class: "rs-side" });
    const findingActs = {
      onReplay: (f: { t0: number }) => this.replayFrom(f.t0),
      onAgain: () => this.act(() => this.deps.onRetry(run.ex)),
      onDrill: this.deps.onDrill
        ? () => this.act(() => this.deps.onDrill!())
        : undefined,
    };
    if (ungraded) {
      main.append(
        h(
          "div",
          { class: "rs-sec-t" },
          rt("sec.flew"),
          h("span", { class: "cnt" }, ` ${rt("sec.flewSub")}`),
        ),
        h(
          "ol",
          { class: "rs-steps" },
          ...rep.steps.map((s) =>
            h(
              "li",
              { class: s.state === "not-reached" ? "nf" : "" },
              h(
                "span",
                {
                  class: `s ${s.state === "done" ? "ok" : s.state === "at" ? "at" : "no"}`,
                  "aria-hidden": "true",
                },
                s.state === "done" ? svgIcon(I.check, 12) : null,
              ),
              h("div", {}, s.text, s.note ? h("small", {}, s.note) : null),
              h(
                "span",
                { class: "t" },
                s.state === "not-reached"
                  ? rt("step.notReached")
                  : s.t0 !== undefined
                    ? `${mmss(s.t0)} – ${mmss(s.t1 ?? inp.durationSec)}`
                    : "",
              ),
            ),
          ),
        ),
      );
      if (rep.wouldGrade.length)
        main.append(
          h(
            "div",
            { class: "rs-would" },
            h(
              "b",
              {},
              inp.hold
                ? rt("sec.wouldHold", { fix: inp.hold.fix.ident })
                : rt("sec.would"),
            ),
            rep.wouldGrade.join(" · "),
          ),
        );
      if (rep.findings.length) {
        main.append(
          h(
            "div",
            { class: "rs-sec-t mt" },
            rt("sec.seen"),
            h("span", { class: "cnt" }, ` ${rt("sec.seenSub")}`),
          ),
        );
        main.append(
          h(
            "div",
            { class: "rs-finds" },
            ...rep.findings.map((f) => findingCard(f, findingActs, true)),
          ),
        );
      }
      main.append(
        h(
          "div",
          { class: "rs-sec-row" },
          h("div", { class: "rs-sec-t" }, rt("sec.why")),
          h("span", { class: "sp" }),
          h("small", {}, rt("sec.whySub")),
        ),
        h(
          "div",
          { class: "rs-whystop", role: "group", "aria-label": rt("sec.why") },
          ...STOP_REASONS.map((k) =>
            h(
              "button",
              {
                class: this.stopReason === k ? "on" : "",
                "aria-pressed": String(this.stopReason === k),
                onclick: () => this.setStop(this.stopReason === k ? null : k),
              },
              rt(
                k === "restart-entry" && !inp.hold
                  ? "stop.restart"
                  : `stop.${k}`,
              ),
            ),
          ),
        ),
      );
      if (pvPanel) side.append(pvPanel);
      side.append(this.pnEl);
    } else {
      const notMet = rep.findings.filter((f) => f.group !== "watch").length;
      const watch = rep.findings.length - notMet;
      const nmStd = rep.standards.filter((s) => s.verdict === "not-met").length;
      if (rep.findings.length) {
        const cnt =
          rep.outcome === "met"
            ? watch === 1
              ? rt("sec.lookCount1")
              : rt("sec.lookCount", { w: watch })
            : rt(nmStd === 1 ? "sec.fixCount" : "sec.fixCountN", {
                a: nmStd,
                b: watch ? rt("sec.watchTail", { w: watch }) : "",
              });
        main.append(
          h(
            "div",
            { class: "rs-sec-t" },
            rt(rep.outcome === "met" ? "sec.look" : "sec.fix"),
            h("span", { class: "cnt" }, ` ${cnt}`),
          ),
        );
        main.append(
          h(
            "div",
            { class: "rs-finds" },
            ...rep.findings.map((f) => findingCard(f, findingActs)),
          ),
        );
      }
      const hb = helpBox(rep.help);
      if (hb) main.append(hb);
      for (const x of this.opts.extra ?? [])
        main.append(h("section", { class: "rs-panel rs-extra" }, x));
      const met = rep.standards.filter((s) => s.verdict === "met");
      if (met.length)
        main.append(
          h(
            "section",
            { class: "rs-panel" },
            h(
              "h4",
              {},
              rt("sec.met"),
              h("span", { class: "sp" }),
              h(
                "span",
                { class: "h4r" },
                rt("std.countShort", { k: met.length, n: rep.gradedCount }),
              ),
            ),
            h(
              "div",
              { class: "pb" },
              ...met.map((s) =>
                h(
                  "div",
                  {
                    class: `rs-okrow${s.exceeded ? " ex" : ""}`,
                    title: s.exceeded ? rt("tile.exceeded") : undefined,
                  },
                  // past the limit within the time allowance: a warning, never a green check
                  svgIcon(s.exceeded ? I.warning : I.check, 14),
                  h(
                    "span",
                    { class: "l" },
                    `${s.label}${s.short && s.short !== s.label ? ` · ${s.short}` : ""}`,
                  ),
                  h(
                    "span",
                    { class: "v" },
                    [
                      s.value !== "—"
                        ? `${s.value}${s.unit ? ` ${s.unit}` : ""}`
                        : "",
                      s.pct !== null
                        ? rt("pctShort", { p: Math.round(s.pct * 100) })
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  ),
                ),
              ),
            ),
          ),
        );
      side.append(this.pnEl);
      if (pvPanel) side.append(pvPanel);
    }
    const pnNarrow = h("div", { class: "rs-pn-slot" });
    const grid = h("div", { class: "rs-grid" }, main, side);
    const body = h(
      "div",
      { class: "rs-body" },
      verdict,
      pnNarrow,
      timeline,
      grid,
    );
    if (ungraded)
      body.append(
        h(
          "div",
          { class: "rs-note" },
          svgIcon(I.help, 15),
          h(
            "span",
            {},
            ...bold(
              rt("foot.savedUngraded", { t: mmss(inp.durationSec) }).replace(
                /(Ended · \d+:\d+|Arrêté · \d+:\d+)/,
                "**$1**",
              ),
            ),
          ),
        ),
      );
    this.pnHome = { narrow: pnNarrow, wide: side };

    // ---- footer
    const foot = this.footer(rep, plan, next);
    this.box.append(head, body, foot);
    if (timeline)
      this.cleanups.push(
        mountTimeline(tlHost, rep, {
          onPin: (n) => this.focusFinding(n),
          touch: document.body.classList.contains("touch"),
        }),
      );
    // portrait / narrow: one column, Practise next right under the tiles, a footer with the primary and More
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(this.box);
    this.layout();
    if (keepScroll) body.scrollTop = prevScroll;
  }

  private layout() {
    const narrow = this.box.clientWidth > 0 && this.box.clientWidth < 900;
    this.box.classList.toggle("narrow", narrow);
    const pn = this.pnEl;
    const home = this.pnHome;
    if (!pn || !home) return;
    const want = narrow ? home.narrow : home.wide;
    if (pn.parentElement !== want) {
      if (narrow) want.append(pn);
      else if (this.rep?.outcome === "ungraded") want.append(pn);
      else want.prepend(pn);
    }
  }

  private footer(
    rep: ResultReport,
    plan: NextPlan,
    next: Exercise | null,
  ): HTMLElement {
    const run = this.run!;
    const ungraded = rep.outcome === "ungraded";
    void plan;
    const back = this.opts.backToCourse;
    const larr = () => h("span", { class: "rs-larr", "aria-hidden": "true" }, svgIcon(I.arrow, 15));
    // the primary depends on where the flight came from (UX logic §7): back to the course, else fly it again
    const primary = back
      ? h(
          "button",
          { class: "rs-btn primary", onclick: () => this.act(back.run) },
          larr(),
          back.label,
        )
      : h(
          "button",
          { class: "rs-btn primary", onclick: () => this.act(() => this.deps.onRetry(run.ex)) },
          svgIcon(I.restart, 15),
          rt("foot.retry"),
        );
    // the other ways on (resume, restart, the next lesson) are the rows of « Pour progresser » above: the footer
    // keeps « ← Accueil », « Voir le débriefing » and the one primary (UX logic §7)
    const sec: HTMLElement[] = [];
    void next;
    const debrief = h(
      "button",
      { class: "rs-btn", onclick: () => this.act(() => this.deps.onDebrief()) },
      svgIcon(I.chart, 16),
      rt(ungraded ? "foot.replayFlown" : "foot.debrief"),
    );
    const home = this.deps.onHome
      ? h(
          "button",
          { class: "rs-btn rs-home", onclick: () => this.act(() => this.deps.onHome!()) },
          larr(),
          rt("foot.home"),
        )
      : null;
    const note = ungraded
      ? null
      : h(
          "span",
          { class: "fine" },
          this.recId ? rt(rep.withHelp ? "foot.savedHelp" : "foot.saved") : "",
        );
    // narrow footer: the primary and a More menu (Debrief, Retry, Next, Close)
    const menu = h("div", {
      class: "rs-more-menu",
      role: "menu",
      hidden: true,
    });
    const moreItems = [debrief, ...sec, ...(home ? [home] : [])].map((b) => {
      const c = b.cloneNode(true) as HTMLElement;
      c.className = "rs-mi";
      c.setAttribute("role", "menuitem");
      c.addEventListener("click", () => {
        menu.hidden = true;
        b.click();
      });
      return c;
    });
    menu.append(...moreItems);
    const more = h(
      "button",
      {
        class: "rs-btn rs-more",
        "aria-haspopup": "menu",
        onclick: (e: Event) => {
          e.stopPropagation();
          menu.hidden = !menu.hidden;
        },
      },
      svgIcon(I.more, 16),
      rt("foot.more"),
    );
    const off = (e: Event) => {
      if (!menu.contains(e.target as Node)) menu.hidden = true;
    };
    document.addEventListener("click", off);
    this.cleanups.push(() => document.removeEventListener("click", off));
    return h(
      "footer",
      { class: "rs-foot" },
      h("div", { class: "wide-only l" }, home, debrief, note),
      h("span", { class: "sp" }),
      h("div", { class: "wide-only r" }, ...sec),
      h("div", { class: "narrow-only" }, more, menu),
      primary,
    );
  }

  private act(fn: () => void) {
    this.close();
    fn();
  }

  /** run a Practise next row (the sheet's, or the debrief's) */
  runItem(it: NextItem) {
    const run = this.run!;
    switch (it.kind) {
      case "resume":
        if (this.deps.onResume) this.act(() => this.deps.onResume!(run));
        break;
      case "restart":
      case "retry":
      case "brief":
        this.act(() => this.deps.onRetry(run.ex));
        break;
      case "next-lesson":
        if (it.ref) this.act(() => this.deps.onNext(exercise(it.ref!)));
        break;
      case "lesson":
        if (it.ref)
          this.act(() =>
            (this.deps.onLesson ?? this.deps.onNext)(exercise(it.ref!)),
          );
        break;
      case "drill":
        if (this.deps.onDrill) this.act(() => this.deps.onDrill!());
        break;
    }
  }

  /** "Replay from 4:34": the debrief opens at that moment (its "‹ Result" comes back here) */
  private replayFrom(t: number) {
    this.close();
    this.deps.onDebrief(Math.max(0, t));
  }

  private focusFinding(n: number) {
    const card = this.box.querySelector<HTMLElement>(`#rs-f${n}`);
    if (!card) return;
    this.box
      .querySelectorAll(".rs-find.on")
      .forEach((e) => e.classList.remove("on"));
    card.classList.add("on");
    card.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "center",
    });
  }

  private setStop(r: StopReason | null) {
    this.stopReason = r;
    // the instructor sees it: kept with the training record (SPEC §4.7 stopReason)
    if (this.recId) {
      const a = history.all().find((x) => x.id === this.recId);
      if (a) history.upsert({ ...a, stopReason: r } as typeof a);
    }
    this.render(true);
  }
}

/** "**No score**" → <b>No score</b> */
function bold(s: string): (Node | string)[] {
  return s
    .split(/(\*\*[^*]+\*\*)/)
    .map((p) => (p.startsWith("**") ? h("b", {}, p.slice(2, -2)) : p));
}

export function createResultSheet(
  deps: ResultDeps,
  observer: ResultObserver | null = null,
) {
  return new ResultSheet(deps, observer);
}
