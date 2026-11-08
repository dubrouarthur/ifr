// Ground school player (package E) — a drill: N random calculations in a row, timed (stopwatch, per problem or
// total), scored for the student only, then a review of the misses with their worked solutions. Practice only:
// never ACS-graded, never logged as a flight. DrillRun is the pure state machine (unit-tested); DrillView draws it.
import type {
  AttemptRecord,
  CalcProblem,
  CalcResponse,
  CalcVerdict,
  DrillSpec,
  Lang,
} from "../types";
import {
  checkAnswer,
  generate,
  getGenerator,
  planDrill,
  scoreDrill,
  type DrillItem,
  type DrillScore,
} from "../calc";
import { newSeed } from "../calc/rng";
import { FMT } from "../calc/text";
import {
  answerForm,
  answerText,
  givensTable,
  newCalcState,
  readResponse,
  mistakeText,
  responseText,
  type CalcUiState,
} from "./calcStep";
import { btn, h, icon, L, ps, richEl, textEl } from "./reader";

// ------------------------------------------------------------------ the run (pure)
export type DrillPhase = "ready" | "question" | "feedback" | "done";
export interface DrillEntry {
  item: DrillItem;
  problem: CalcProblem;
  response?: CalcResponse;
  verdict?: CalcVerdict;
  secs: number;
  skipped?: boolean;
  timedOut?: boolean;
}
const SPEC_OF = { tolerance: undefined, unit: undefined };

export class DrillRun {
  readonly items: DrillItem[];
  readonly entries: DrillEntry[] = [];
  phase: DrillPhase = "ready";
  index = 0;
  private startedAt = 0;
  private questionAt = 0;
  private endedAt = 0;

  constructor(
    readonly spec: DrillSpec,
    readonly runSeed: number = spec.seed ?? newSeed(),
  ) {
    this.items = planDrill(spec, runSeed);
  }
  get count(): number {
    return this.items.length;
  }
  /** the problem being asked (or shown in feedback) */
  get current(): DrillEntry | null {
    return this.entries[this.index] ?? null;
  }
  start(now: number) {
    if (this.phase !== "ready" || !this.items.length) return;
    this.startedAt = now;
    this.phase = "question";
    this.ask(now);
  }
  private ask(now: number) {
    const it = this.items[this.index];
    this.entries[this.index] = {
      item: it,
      problem: generate(it.generatorId, it.seed, it.params),
      secs: 0,
    };
    this.questionAt = now;
  }
  /** Answer the current problem. */
  submit(response: CalcResponse, now: number): CalcVerdict | null {
    const e = this.current;
    if (this.phase !== "question" || !e) return null;
    let verdict: CalcVerdict;
    try {
      verdict = checkAnswer(e.problem, response, SPEC_OF);
    } catch {
      verdict = { ok: false };
    }
    e.response = response;
    e.verdict = verdict;
    e.secs = Math.max(0, (now - this.questionAt) / 1000);
    this.afterAnswer(now);
    return verdict;
  }
  /** Skip the current problem (or the per-problem timer ran out). */
  skip(now: number, timedOut = false) {
    const e = this.current;
    if (this.phase !== "question" || !e) return;
    e.skipped = true;
    e.timedOut = timedOut || undefined;
    e.secs = Math.max(0, (now - this.questionAt) / 1000);
    this.afterAnswer(now);
  }
  private afterAnswer(now: number) {
    if ((this.spec.feedback ?? "each") === "each") this.phase = "feedback";
    else this.advance(now);
  }
  /** From the feedback to the next problem (or the score). */
  next(now: number) {
    if (this.phase === "feedback") this.advance(now);
  }
  private advance(now: number) {
    if (this.index + 1 >= this.items.length) return this.finish(now);
    this.index++;
    this.phase = "question";
    this.ask(now);
  }
  private finish(now: number) {
    this.phase = "done";
    this.endedAt = now;
  }
  /** Seconds left on the per-problem or total timer (null: stopwatch or no timer). */
  timeLeft(now: number): number | null {
    const t = this.spec.timer;
    if (
      !t ||
      t.mode === "stopwatch" ||
      this.phase === "ready" ||
      this.phase === "done"
    )
      return null;
    if (t.mode === "perProblem")
      return this.phase === "question"
        ? Math.max(0, t.seconds - (now - this.questionAt) / 1000)
        : null;
    return Math.max(0, t.seconds - (now - this.startedAt) / 1000);
  }
  /** Seconds since the start (the stopwatch). */
  elapsed(now: number): number {
    if (this.phase === "ready") return 0;
    return Math.max(
      0,
      ((this.phase === "done" ? this.endedAt : now) - this.startedAt) / 1000,
    );
  }
  /** A timer tick: a per-problem timeout skips the problem; the total timeout ends the drill. Returns true on a change. */
  tick(now: number): boolean {
    const t = this.spec.timer;
    if (!t || t.mode === "stopwatch") return false;
    const left = this.timeLeft(now);
    if (left === null || left > 0) return false;
    if (t.mode === "perProblem") {
      this.skip(now, true);
      return true;
    }
    // total: the problem on screen and the rest are skipped
    if (this.phase === "question") {
      const e = this.current!;
      e.skipped = true;
      e.timedOut = true;
      e.secs = Math.max(0, (now - this.questionAt) / 1000);
    }
    for (let i = this.index + 1; i < this.items.length; i++) {
      const it = this.items[i];
      this.entries[i] = {
        item: it,
        problem: generate(it.generatorId, it.seed, it.params),
        secs: 0,
        skipped: true,
        timedOut: true,
      };
    }
    this.index = this.items.length - 1;
    this.finish(now);
    return true;
  }
  /** answered entries so far, in order */
  answered(): DrillEntry[] {
    return this.entries.filter((e) => e && (e.verdict || e.skipped));
  }
  score(): DrillScore {
    return scoreDrill(
      this.answered().map((e) => ({
        generatorId: e.item.generatorId,
        ok: !!e.verdict?.ok && !e.skipped,
        secs: e.secs,
        skipped: e.skipped,
      })),
    );
  }
  misses(): DrillEntry[] {
    return this.answered().filter((e) => e.skipped || !e.verdict?.ok);
  }
  /** The practice record of a finished drill (AttemptRecord.drill). */
  record(): NonNullable<AttemptRecord["drill"]> {
    const s = this.score();
    return {
      count: s.total,
      correct: s.correct,
      totalS: Math.round(s.totalSecs),
      items: this.answered().map((e) => ({
        generatorId: e.item.generatorId,
        seed: e.item.seed,
        correct: !!e.verdict?.ok && !e.skipped,
        secs: Math.round(e.secs * 10) / 10,
        ...(e.verdict?.mistake ? { mistake: e.verdict.mistake.id } : {}),
      })),
    };
  }
}

/** "0:45" / "45 s" */
export const clock = (s: number, lang: Lang): string =>
  FMT[lang].sec(Math.ceil(s - 1e-9));

// ------------------------------------------------------------------ the view
export interface DrillEnv {
  lang: Lang;
  /** the previous best (AttemptRecord.drill of this step) */
  best?: { correct: number; count: number } | null;
  onDone?(run: DrillRun): void;
  announce?(text: string): void;
  /** injectable clock (tests, screenshots) */
  now?: () => number;
}

export class DrillView {
  readonly el: HTMLDivElement;
  private run: DrillRun;
  private lang: Lang;
  private timer = 0;
  private st: CalcUiState = {
    seed: 0,
    input: "",
    parts: {},
    checks: 0,
    shown: 0,
  };
  private clockEl: HTMLElement | null = null;
  private now: () => number;

  constructor(
    readonly spec: DrillSpec,
    private env: DrillEnv,
    run?: DrillRun,
  ) {
    this.lang = env.lang;
    this.now = env.now ?? (() => performance.now());
    this.run = run ?? new DrillRun(spec);
    this.el = h("div", { class: "cp-drill" });
    this.render();
  }
  get state(): DrillRun {
    return this.run;
  }
  destroy() {
    window.clearInterval(this.timer);
    this.el.remove();
  }
  /** Enter on the page: Check / Next problem */
  private restart() {
    this.run = new DrillRun(this.spec, this.spec.seed ?? newSeed());
    this.render();
  }

  private render() {
    window.clearInterval(this.timer);
    this.clockEl = null;
    const r = this.run;
    this.el.replaceChildren();
    if (r.phase === "ready") this.ready();
    else if (r.phase === "done") this.done();
    else this.question();
    if (r.phase === "question" || r.phase === "feedback")
      this.timer = window.setInterval(() => this.onTick(), 250);
  }
  private onTick() {
    const r = this.run;
    const now = this.now();
    if (r.tick(now)) {
      if (r.phase === "feedback") this.env.announce?.(ps("timeUp", this.lang));
      if (r.phase === "done") this.env.onDone?.(r);
      this.render();
      return;
    }
    this.syncClock();
  }
  private syncClock() {
    if (!this.clockEl) return;
    const r = this.run;
    const now = this.now();
    const left = r.timeLeft(now);
    const t = left ?? r.elapsed(now);
    this.clockEl.textContent = clock(t, this.lang);
    this.clockEl.classList.toggle("low", left !== null && left <= 10);
  }

  // ---------------- ready
  private ready() {
    const lang = this.lang;
    const s = this.spec;
    const n = this.run.count;
    const timer = s.timer;
    const tline =
      !timer || timer.mode === "stopwatch"
        ? ps("stopwatch", lang)
        : timer.mode === "perProblem"
          ? ps("perProblem", lang, { s: timer.seconds })
          : ps("totalTime", lang, { t: FMT[lang].sec(timer.seconds) });
    const topics = [...new Set(s.generatorIds)]
      .map((id) => getGenerator(id))
      .filter((g): g is NonNullable<typeof g> => !!g);
    const card = h(
      "div",
      { class: "cp-card cp-drill-ready" },
      h(
        "div",
        { class: "cp-drill-big" },
        icon("timer", "i big"),
        h(
          "div",
          {},
          h("b", { class: "num" }, ps("drillIntro", lang, { n })),
          h(
            "span",
            { class: "cp-muted" },
            `${tline} · ${ps("practiceOnly", lang)}`,
          ),
        ),
      ),
      h(
        "div",
        { class: "cp-topics" },
        ...topics.map((g) => h("span", { class: "cp-tag" }, L(g.title, lang))),
      ),
    );
    if (this.env.best)
      card.append(
        h(
          "p",
          { class: "cp-muted sm" },
          ps("bestRun", lang, {
            c: this.env.best.correct,
            n: this.env.best.count,
          }),
        ),
      );
    const go = btn(
      ps("startDrill", lang),
      "primary lg",
      () => {
        this.run.start(this.now());
        this.render();
        (
          this.el.querySelector(".cp-input") as HTMLInputElement | null
        )?.focus();
      },
      "next",
      true,
    );
    card.append(h("div", { class: "cp-qact" }, go));
    this.el.append(card);
  }

  // ---------------- question / feedback
  private question() {
    const lang = this.lang;
    const r = this.run;
    const e = r.current!;
    const p = e.problem;
    const head = h("div", { class: "cp-drill-head" });
    const bar = h("div", {
      class: "cp-drill-bar",
      role: "progressbar",
      "aria-label": ps("problemOf", lang, { i: r.index + 1, n: r.count }),
      "aria-valuemin": "0",
      "aria-valuemax": String(r.count),
      "aria-valuenow": String(r.index + (r.phase === "feedback" ? 1 : 0)),
    });
    for (let i = 0; i < r.count; i++) {
      const x = r.entries[i];
      const cls =
        i === r.index && r.phase === "question"
          ? "now"
          : x?.verdict?.ok && !x.skipped
            ? "ok"
            : x && (x.skipped || x.verdict)
              ? "bad"
              : "";
      bar.append(h("i", { class: cls }));
    }
    this.clockEl = h("span", { class: "cp-clock num", "aria-hidden": "true" });
    head.append(
      h(
        "span",
        { class: "cp-label" },
        ps("problemOf", lang, { i: r.index + 1, n: r.count }),
      ),
      bar,
      h("span", { class: "cp-clockw" }, icon("timer"), this.clockEl),
    );
    this.syncClock();
    const g = getGenerator(e.item.generatorId);
    const card = h(
      "div",
      { class: "cp-card cp-drill-q" },
      head,
      g ? h("span", { class: "cp-tag" }, L(g.title, lang)) : null,
      richEl(p.prompt, lang, undefined, "cp-rich cp-calc-prompt"),
    );
    const giv = givensTable(p, lang);
    if (giv) card.append(giv);
    if (r.phase === "question") {
      this.st = newCalcState({ generatorId: e.item.generatorId }, e.item.seed);
      const form = answerForm(
        p,
        { generatorId: e.item.generatorId },
        this.st,
        lang,
        { onEnter: () => submit(), onChange: () => (form.err.hidden = true) },
      );
      const submit = () => {
        const rr = readResponse(
          p,
          { generatorId: e.item.generatorId },
          this.st,
          lang,
        );
        if (!rr.ok) {
          form.err.textContent = ps("numberInvalid", lang);
          form.err.hidden = false;
          return;
        }
        const v = r.submit(rr.response, this.now());
        if (v)
          this.env.announce?.(
            v.ok ? ps("correct", lang) : ps("notQuite", lang),
          );
        if (r.phase === "done") this.env.onDone?.(r);
        this.render();
        (
          this.el.querySelector(
            ".cp-drill-fb .cp-btn.primary",
          ) as HTMLButtonElement | null
        )?.focus();
      };
      card.append(
        form.el,
        h(
          "div",
          { class: "cp-qact" },
          btn(ps("check", lang), "primary", submit),
          btn(ps("skip", lang), "ghost", () => {
            r.skip(this.now());
            if (r.phase === "done") this.env.onDone?.(r);
            this.render();
          }),
        ),
      );
      this.el.append(card);
      queueMicrotask(() => form.input.focus({ preventScroll: true }));
      return;
    }
    // feedback
    const ok = !!e.verdict?.ok && !e.skipped;
    const a = answerText(p, { generatorId: e.item.generatorId }, lang);
    const fb = h(
      "div",
      { class: `cp-verdict cp-drill-fb ${ok ? "ok" : "bad"}` },
      h(
        "div",
        { class: "vh" },
        icon(ok ? "check" : "info"),
        h(
          "b",
          {},
          e.timedOut
            ? ps("timeUp", lang)
            : e.skipped
              ? ps("skipped", lang)
              : ok
                ? ps("correct", lang)
                : ps("notQuite", lang),
        ),
        h("span", { class: "num" }, ` · ${a.answer}`),
      ),
    );
    if (!ok && e.response)
      fb.append(
        h(
          "p",
          { class: "cp-muted" },
          ps("youAnswered", lang, { a: responseText(p, e.response, lang) }),
        ),
      );
    if (!ok && e.verdict?.mistake)
      fb.append(textEl("p", mistakeText(e.verdict.mistake.text, lang), lang));
    if (!ok)
      fb.append(richEl(p.ruleOfThumb, lang, undefined, "cp-rich cp-rot"));
    const last = r.index + 1 >= r.count;
    const nextB = btn(
      last ? ps("seeScore", lang) : ps("nextProblem", lang),
      "primary",
      () => {
        r.next(this.now());
        if (r.phase === "done") this.env.onDone?.(r);
        this.render();
        (
          this.el.querySelector(".cp-input") as HTMLInputElement | null
        )?.focus();
      },
      "next",
      true,
    );
    fb.append(h("div", { class: "cp-qact" }, nextB));
    card.append(fb);
    this.el.append(card);
    nextB.addEventListener("keydown", (ev) => ev.stopPropagation());
  }

  // ---------------- done
  private done() {
    const lang = this.lang;
    const r = this.run;
    const s = r.score();
    const f = FMT[lang];
    const head = h(
      "div",
      { class: "cp-card cp-drill-score" },
      h(
        "div",
        { class: "cp-score-big" },
        h("b", { class: "num" }, `${s.correct}`),
        h("span", { class: "num" }, `/ ${s.total}`),
      ),
      h(
        "div",
        { class: "cp-score-txt" },
        h("b", {}, ps("scoreLine", lang, { c: s.correct, n: s.total })),
        h(
          "span",
          { class: "cp-muted" },
          `${ps("medianLine", lang, { t: f.sec(s.medianSecs) })} · ${ps("totalLine", lang, { t: f.sec(s.totalSecs) })}`,
        ),
        h("span", { class: "cp-muted sm" }, ps("practiceOnly", lang)),
      ),
    );
    const topics = Object.entries(s.byGenerator) as [
      string,
      { correct: number; total: number },
    ][];
    const byTopic = h(
      "div",
      { class: "cp-card cp-bytopic" },
      h(
        "div",
        { class: "hd" },
        h("span", { class: "cp-label" }, ps("byTopic", lang)),
      ),
    );
    for (const [id, v] of topics) {
      const g = getGenerator(id);
      byTopic.append(
        h(
          "div",
          { class: "cp-row" },
          h("span", { class: "t" }, g ? L(g.title, lang) : id),
          h(
            "span",
            { class: "cp-meter", "aria-hidden": "true" },
            h("i", {
              style: `width:${Math.round((v.correct / Math.max(1, v.total)) * 100)}%`,
            }),
          ),
          h("span", { class: "cp-readout num" }, `${v.correct} / ${v.total}`),
        ),
      );
    }
    const misses = r.misses();
    const rev = h(
      "div",
      { class: "cp-card cp-misses" },
      h(
        "div",
        { class: "hd" },
        h("span", { class: "cp-label" }, ps("reviewMisses", lang)),
        h("span", { class: "cp-label soft num" }, String(misses.length)),
      ),
    );
    if (!misses.length)
      rev.append(h("p", { class: "cp-muted pad" }, ps("noMisses", lang)));
    for (const e of misses) {
      const a = answerText(
        e.problem,
        { generatorId: e.item.generatorId },
        lang,
      );
      const det = h("details", { class: "cp-miss" });
      det.append(
        h(
          "summary",
          {},
          h("span", { class: "n num" }, String(e.item.index + 1)),
          h(
            "span",
            { class: "t" },
            L(getGenerator(e.item.generatorId)?.title, lang),
          ),
          h(
            "span",
            { class: `cp-readout num ${e.skipped ? "skip" : "bad"}` },
            e.skipped
              ? ps("skipped", lang)
              : responseText(e.problem, e.response, lang),
          ),
          h("span", { class: "cp-readout ok num" }, a.answer),
        ),
        richEl(e.problem.prompt, lang, undefined, "cp-rich cp-calc-prompt"),
      );
      if (e.verdict?.mistake)
        det.append(textEl("p", e.verdict.mistake.text, lang, "cp-mistake"));
      det.append(
        h(
          "ol",
          { class: "cp-steps" },
          ...e.problem.solutionSteps.map((x) => h("li", {}, richEl(x, lang))),
        ),
      );
      rev.append(det);
    }
    const again = btn(
      this.spec.seed !== undefined
        ? ps("runAgainSame", lang)
        : ps("runAgain", lang),
      "primary",
      () => this.restart(),
      "refresh",
    );
    this.el.append(
      head,
      h("div", { class: "cp-drill-cols" }, byTopic, rev),
      h("div", { class: "cp-qact" }, again),
    );
  }
}
