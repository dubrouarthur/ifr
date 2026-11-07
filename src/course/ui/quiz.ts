// Ground school player (package E) — quiz widgets (SPEC §4.4): multiple choice (with a "why" per option), numeric
// with tolerance and unit, order, tap (a region on the stage), answer by flying (Check evaluates GoalChecks once
// on the live stage, no hold time), and calc (a generated calculation, calcStep.ts). A Predict step uses the same
// widgets with "Lock in my prediction". Quizzes never block Next.
import type { CalcProblem, GoalCheck, L10n, Lang, Pt, Quiz, Rect } from "../types";
import type { StageView } from "../goals";
import { checkNow, goalRow } from "../goals";
import { CalcView, parseNumber, type CalcUiState } from "./calcStep";
import { btn, h, icon, L, ps, richEl, textEl } from "./reader";
import { FMT } from "../calc/text";

// ------------------------------------------------------------------ pure helpers (unit-tested)
export interface QuizResult {
  correct: boolean;
  /** option index, number, order (item indices in the student's order), annotation id, or 'fly' */
  answer: number | number[] | string;
  /** fly quizzes: each check met at the Check */
  checks?: boolean[];
  /** a calc quiz: its UI state (seed, answer, solution shown) */
  calc?: CalcUiState;
}
export const numericCorrect = (
  value: number,
  answer: number,
  tol: number,
): boolean =>
  Number.isFinite(value) && Math.abs(value - answer) <= Math.abs(tol) + 1e-9;
export const orderCorrect = (order: readonly number[]): boolean =>
  order.length > 0 && order.every((v, i) => v === i);
/** A deterministic shuffle of 0..n-1 that is never already in order (n ≥ 2). */
export function shuffledOrder(n: number, seed: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return a;
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0;
    return s / 4294967296;
  };
  for (let k = 0; k < 4; k++) {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (!orderCorrect(a)) return a;
  }
  [a[0], a[1]] = [a[1], a[0]];
  return a;
}
/** Move item `i` of an order by `d` (−1 up, +1 down); returns a new array. */
export function moveItem(
  order: readonly number[],
  i: number,
  d: -1 | 1,
): number[] {
  const j = i + d;
  const out = [...order];
  if (j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
export const inRect = (p: Pt, r: Rect): boolean =>
  p[0] >= r[0] && p[0] <= r[0] + r[2] && p[1] >= r[1] && p[1] <= r[1] + r[3];
/** Is a stage tap the answer of a tap quiz? */
export function tapCorrect(
  quiz: Extract<Quiz, { kind: "tap" }>,
  annotation: string | null,
  pane: 0 | 1,
  p: Pt,
): boolean {
  const t = quiz.target;
  if ("annotation" in t) return annotation === t.annotation;
  return pane === t.pane && inRect(p, t.rect);
}
/** An answer-by-flying quiz checked once against the live view. */
export function flyQuizResult(
  checks: GoalCheck[],
  view: StageView,
  lang: Lang,
): {
  met: boolean;
  rows: { met: boolean; readout: string; violation: string | null }[];
} {
  const r = checkNow(checks, view, lang);
  return { met: r.met, rows: r.results };
}

// ------------------------------------------------------------------ the widget
export interface QuizEnv {
  lang: Lang;
  /** shuffle seed for order quizzes (stable per student and step) */
  seed?: number;
  restore?: QuizResult | null;
  /** Predict: commit wording */
  predict?: boolean;
  /** inline in the reader (smaller title) */
  inline?: boolean;
  /** the live stage view (answer-by-flying quizzes) */
  view?: () => StageView | null;
  /** tap quizzes: turn tap mode on / off on the stage */
  setTappable?: (on: boolean) => void;
  /** calc quiz → the player's stage */
  onCalcProblem?: (p: CalcProblem) => void;
  onAnswer?(r: QuizResult, first: boolean): void;
  announce?(text: string): void;
}

export class QuizView {
  readonly el: HTMLDivElement;
  private res: QuizResult | null;
  private lang: Lang;
  private body!: HTMLDivElement;
  private fb!: HTMLDivElement;
  private calc: CalcView | null = null;
  private order: number[] = [];
  private pick: number | null = null;

  constructor(
    readonly quiz: Quiz,
    private env: QuizEnv,
  ) {
    this.lang = env.lang;
    this.res = env.restore ? structuredClone(env.restore) : null;
    this.el = h("div", {
      class: `cp-quiz q-${quiz.kind}${env.inline ? " inline" : ""}`,
    });
    this.render();
  }
  get result(): QuizResult | null {
    return this.res;
  }
  get answered(): boolean {
    return !!this.res;
  }
  /** A tap on the stage (tap quizzes). Returns true when it was this quiz's answer. */
  tap(annotation: string | null, pane: 0 | 1, p: Pt): boolean {
    const q = this.quiz;
    if (q.kind !== "tap" || this.res?.correct) return false;
    const ok = tapCorrect(q, annotation, pane, p);
    if (ok || annotation)
      this.answer({
        correct: ok,
        answer: annotation ?? `${pane}:${Math.round(p[0])},${Math.round(p[1])}`,
      });
    if (!ok) {
      this.fb.className = "cp-fb bad";
      this.fb.replaceChildren(
        h(
          "div",
          { class: "vh" },
          icon("info"),
          h("b", {}, ps("tapWrong", this.lang)),
        ),
      );
      this.env.announce?.(ps("tapWrong", this.lang));
    }
    return ok;
  }
  /** Predict: the outcome has played; show whether the prediction was right, the "why" and the explanation. */
  revealOutcome() {
    if (!this.res || !this.env.predict) return;
    this.env = { ...this.env, predict: false };
    this.render();
  }
  destroy() {
    if (this.quiz.kind === "tap") this.env.setTappable?.(false);
    this.el.remove();
  }

  // ---------------- render
  private render() {
    const q = this.quiz;
    const lang = this.lang;
    this.el.replaceChildren();
    this.body = h("div", { class: "cp-qbody" });
    this.fb = h("div", { class: "cp-fb", "aria-live": "polite" });
    if (q.kind === "calc") {
      this.calc = new CalcView(q.calc, {
        lang,
        compact: true,
        prompt: q.prompt,
        explain: q.explain,
        state: this.res?.calc ?? null,
        onProblem: this.env.onCalcProblem,
        announce: this.env.announce,
        onState: (s) => {
          if (this.res) this.res.calc = s;
        },
        onCheck: (e) => {
          const first = !this.res;
          this.res = {
            correct: e.verdict.ok,
            answer: e.response.answer,
            calc: this.calc!.state,
          };
          this.env.onAnswer?.(this.res, first);
        },
      });
      this.el.append(this.calc.el);
      return;
    }
    this.el.append(
      richEl(q.prompt, lang, undefined, "cp-rich cp-qprompt"),
      this.body,
      this.fb,
    );
    switch (q.kind) {
      case "mcq":
        return this.mcq(q);
      case "numeric":
        return this.numeric(q);
      case "order":
        return this.orderQ(q);
      case "tap":
        return this.tapQ();
      case "fly":
        return this.fly(q);
    }
  }
  private mcq(q: Extract<Quiz, { kind: "mcq" }>) {
    const lang = this.lang;
    const done = !!this.res;
    if (done) this.pick = this.res!.answer as number;
    const list = h("div", {
      class: "cp-opts",
      role: "radiogroup",
      "aria-label": L(q.prompt, lang),
    });
    const letters = "ABCDEFGH";
    const buttons: HTMLButtonElement[] = [];
    q.options.forEach((o, i) => {
      const b = h(
        "button",
        {
          type: "button",
          role: "radio",
          class: "cp-opt",
          "aria-checked": String(this.pick === i),
        },
        h(
          "span",
          { class: "lt", "aria-hidden": "true" },
          letters[i] ?? String(i + 1),
        ),
        textEl("span", o.text, lang, "ot"),
      );
      if (done) {
        b.disabled = true;
        if (i === q.answer) b.classList.add("right");
        else if (i === this.pick) b.classList.add("wrong");
      }
      b.addEventListener("click", () => {
        if (this.res) return;
        this.pick = i;
        for (const [k, x] of buttons.entries())
          x.setAttribute("aria-checked", String(k === i));
        go.disabled = false;
      });
      buttons.push(b);
      list.append(b);
    });
    // arrow keys move inside the radio group
    list.addEventListener("keydown", (e) => {
      if (this.res || !["ArrowDown", "ArrowUp"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const cur = this.pick ?? -1;
      const n =
        (cur + (e.key === "ArrowDown" ? 1 : -1) + q.options.length) %
        q.options.length;
      buttons[n].click();
      buttons[n].focus();
    });
    const go = btn(
      this.env.predict ? ps("lockIn", lang) : ps("check", lang),
      "primary",
      () => {
        if (this.pick === null || this.res) return;
        this.answer({ correct: this.pick === q.answer, answer: this.pick });
        this.render();
      },
    );
    go.disabled = this.pick === null;
    this.body.append(list);
    if (!done) this.body.append(h("div", { class: "cp-qact" }, go));
    else
      this.feedback(
        this.res!.correct,
        q.explain,
        this.pick !== null
          ? (q.options[this.pick]?.why ??
              (this.pick !== q.answer ? q.options[q.answer]?.why : undefined))
          : undefined,
      );
  }
  private numeric(q: Extract<Quiz, { kind: "numeric" }>) {
    const lang = this.lang;
    const inp = h("input", {
      class: "cp-input num",
      type: "text",
      inputmode: "decimal",
      autocomplete: "off",
      "aria-label": L(q.prompt, lang),
    });
    const err = h("div", { class: "cp-err", role: "alert" });
    err.hidden = true;
    if (this.res) {
      inp.value = String(this.res.answer);
      inp.disabled = true;
    }
    const go = () => {
      const v = parseNumber(inp.value, lang);
      if (!Number.isFinite(v)) {
        err.textContent = ps("numberInvalid", lang);
        err.hidden = false;
        return;
      }
      this.answer({ correct: numericCorrect(v, q.answer, q.tol), answer: v });
      this.render();
    };
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        go();
      }
    });
    this.body.append(
      h(
        "div",
        { class: "cp-field" },
        inp,
        q.unit ? h("span", { class: "cp-unit static" }, q.unit) : null,
      ),
      err,
    );
    if (!this.res)
      this.body.append(
        h(
          "div",
          { class: "cp-qact" },
          btn(
            this.env.predict ? ps("lockIn", lang) : ps("check", lang),
            "primary",
            go,
          ),
        ),
      );
    else {
      const f = FMT[lang];
      const d = q.tol > 0 && q.tol < 1 ? (q.tol < 0.1 ? 2 : 1) : 0;
      const ans = `${f.n(q.answer, d)}${q.unit ? ` ${q.unit}` : ""}`;
      this.feedback(
        this.res.correct,
        q.explain,
        undefined,
        this.res.correct
          ? ans
          : `${ps("theAnswer", lang, { a: ans })} (${ps("accepted", lang, { t: `${f.n(q.tol, d)}${q.unit ? ` ${q.unit}` : ""}` })})`,
      );
    }
  }
  private orderQ(q: Extract<Quiz, { kind: "order" }>) {
    const lang = this.lang;
    if (!this.order.length)
      this.order = this.res
        ? (this.res.answer as number[])
        : shuffledOrder(q.items.length, this.env.seed ?? 1);
    const list = h("ol", { class: "cp-order" });
    const done = !!this.res;
    this.order.forEach((item, i) => {
      const li = h(
        "li",
        { class: done ? (item === i ? "right" : "wrong") : "" },
        h("span", { class: "n num" }, String(i + 1)),
        textEl("span", q.items[item], lang, "ot"),
      );
      if (!done) {
        const up = h(
          "button",
          {
            type: "button",
            class: "cp-btn iconbtn quiet sm",
            "aria-label": `${ps("moveUp", lang)}: ${L(q.items[item], lang)}`,
          },
          icon("up"),
        );
        const dn = h(
          "button",
          {
            type: "button",
            class: "cp-btn iconbtn quiet sm",
            "aria-label": `${ps("moveDown", lang)}: ${L(q.items[item], lang)}`,
          },
          icon("down"),
        );
        up.disabled = i === 0;
        dn.disabled = i === this.order.length - 1;
        up.addEventListener("click", () => {
          this.order = moveItem(this.order, i, -1);
          this.render();
          (
            this.el
              .querySelectorAll<HTMLButtonElement>(".cp-order li")
              [i - 1]?.querySelector("button") as HTMLButtonElement | null
          )?.focus();
        });
        dn.addEventListener("click", () => {
          this.order = moveItem(this.order, i, 1);
          this.render();
          (
            this.el
              .querySelectorAll<HTMLButtonElement>(".cp-order li")
              [i + 1]?.querySelectorAll("button")[1] as
              | HTMLButtonElement
              | undefined
          )?.focus();
        });
        li.append(h("span", { class: "mv" }, up, dn));
      }
      list.append(li);
    });
    this.body.append(list);
    if (!done) {
      this.body.append(h("p", { class: "cp-muted sm" }, ps("orderHint", lang)));
      this.body.append(
        h(
          "div",
          { class: "cp-qact" },
          btn(ps("check", lang), "primary", () => {
            this.answer({
              correct: orderCorrect(this.order),
              answer: [...this.order],
            });
            this.render();
          }),
        ),
      );
    } else {
      this.feedback(this.res!.correct, q.explain);
      if (!this.res!.correct)
        this.fb.append(
          h("div", { class: "cp-label" }, ps("correctOrder", lang)),
          h("ol", { class: "cp-order solution" }, ...q.items.map((it, i) => h("li", { class: "right" }, h("span", { class: "n num" }, String(i + 1)), textEl("span", it, lang, "ot")))),
        );
    }
  }
  private tapQ() {
    const q = this.quiz as Extract<Quiz, { kind: "tap" }>;
    const lang = this.lang;
    if (!this.res?.correct) {
      this.env.setTappable?.(true);
      this.body.append(
        h("p", { class: "cp-tapnote" }, icon("info"), ps("tapPrompt", lang)),
      );
    }
    if (this.res?.correct) this.feedback(true, q.explain);
  }
  private fly(q: Extract<Quiz, { kind: "fly" }>) {
    const lang = this.lang;
    this.body.append(
      h("p", { class: "cp-tapnote" }, icon("info"), ps("flyPrompt", lang)),
    );
    const rows = h("div", { class: "cp-rows cp-card" });
    const go = btn(
      this.res && !this.res.correct
        ? ps("checkAgain", lang)
        : ps("check", lang),
      "primary",
      () => {
        const v = this.env.view?.() ?? null;
        if (!v) return;
        const r = flyQuizResult(q.answer, v, lang);
        rows.replaceChildren(
          ...r.rows.map((x, i) =>
            h(
              "div",
              { class: `cp-row${x.met ? " done" : ""}` },
              h("span", { class: `cp-check${x.met ? " ok" : " miss"}` }),
              h(
                "span",
                { class: "t" },
                x.met
                  ? goalText(q.answer[i], lang)
                  : (x.violation ?? goalText(q.answer[i], lang)),
              ),
              h(
                "span",
                { class: `cp-readout${x.met ? " ok" : ""}` },
                x.readout,
              ),
            ),
          ),
        );
        rows.hidden = false;
        const first = !this.res;
        if (first || !this.res!.correct)
          this.res = {
            correct: r.met,
            answer: "fly",
            checks: r.rows.map((x) => x.met),
          };
        this.env.onAnswer?.(this.res!, first);
        this.feedbackEl(r.met, q.explain);
        go.querySelector(".cp-bl")!.textContent = r.met
          ? ps("check", lang)
          : ps("checkAgain", lang);
        this.env.announce?.(r.met ? ps("correct", lang) : ps("notQuite", lang));
      },
    );
    rows.hidden = true;
    this.body.append(h("div", { class: "cp-qact" }, go), rows);
    if (this.res) this.feedbackEl(this.res.correct, q.explain);
  }

  // ---------------- feedback
  private answer(r: QuizResult) {
    const first = !this.res;
    if (first || (!this.res!.correct && this.quiz.kind === "tap")) this.res = r;
    this.env.onAnswer?.(this.res!, first);
    if (this.quiz.kind === "tap" && r.correct) {
      this.env.setTappable?.(false);
      this.render();
    }
    if (this.quiz.kind !== "tap")
      this.env.announce?.(
        r.correct ? ps("correct", this.lang) : ps("notQuite", this.lang),
      );
    else if (r.correct) this.env.announce?.(ps("correct", this.lang));
  }
  private feedback(
    ok: boolean,
    explain: L10n,
    why?: L10n,
    line?: string,
  ) {
    this.feedbackEl(ok, explain, why, line);
  }
  private feedbackEl(
    ok: boolean,
    explain: L10n,
    why?: L10n,
    line?: string,
  ) {
    const lang = this.lang;
    const fb = this.fb;
    fb.className = `cp-fb ${this.env.predict ? "neutral" : ok ? "ok" : "bad"}`;
    fb.replaceChildren(
      h(
        "div",
        { class: "vh" },
        icon(ok ? "check" : "info"),
        h(
          "b",
          {},
          this.env.predict
            ? ps("watchWhat", lang)
            : ok
              ? ps("correct", lang)
              : ps("notQuite", lang),
        ),
        line ? h("span", { class: "num" }, ` · ${line}`) : null,
      ),
    );
    if (why) fb.append(richEl(why, lang, undefined, "cp-rich why"));
    if (!this.env.predict) fb.append(richEl(explain, lang));
  }
}
const goalText = (c: GoalCheck, lang: Lang): string => goalRow(c, lang);
