// Ground school player (package E) — progress marks, the top-bar progress ticks and the Outline sheet (every step
// with its kind, minutes and status; tap to jump). Pure helpers are unit-tested.
import type { L10n, Lang, Step } from "../types";
import { h, icon, KINDS, kindChip, kindLabel, L, ps, textEl } from "./reader";

// ------------------------------------------------------------------ marks (pure)
/** What the student did on a step (kept by the player, summarised at the end and in the handout). */
export interface StepMark {
  visited?: boolean;
  /** a quiz / prediction answered: right or not */
  answered?: boolean;
  correct?: boolean;
  /** a Try it / fly quiz goal met */
  goalMet?: boolean;
  /** a calc step checked: right or not */
  calcOk?: boolean;
  /** a drill finished: correct of count */
  drill?: { correct: number; count: number };
  /** a Fly it came back: passed or not */
  flown?: { passed: boolean };
  /** left an acting step without doing it */
  skipped?: boolean;
}
export type StepStatus = "todo" | "current" | "seen" | "done" | "missed";
/** The status a step shows in the outline and the ticks. */
export function stepStatus(
  step: Step,
  mark: StepMark | undefined,
  current: boolean,
): StepStatus {
  if (current) return "current";
  if (!mark?.visited) return "todo";
  const acts = KINDS[step.kind]?.acts;
  if (!acts) return "seen";
  if (
    mark.goalMet ||
    mark.correct ||
    mark.calcOk ||
    mark.flown?.passed ||
    (mark.drill && mark.drill.correct === mark.drill.count)
  )
    return "done";
  if (mark.answered || mark.calcOk === false || mark.flown || mark.drill)
    return "missed";
  return mark.skipped ? "missed" : "seen";
}
/** CSS classes of a progress tick: acting steps are outlined (Try it green, Fly it magenta). */
export function tickClass(step: Step, status: StepStatus): string {
  const c: string[] = [];
  const k = KINDS[step.kind]?.cls;
  if (k === "fly") c.push("fly");
  else if (KINDS[step.kind]?.acts) c.push("do");
  if (status === "current") c.push("now");
  else if (status !== "todo") c.push("done");
  if (status === "missed") c.push("miss");
  return c.join(" ");
}
export function courseMinutes(steps: readonly Step[]): number {
  return steps.reduce((s, x) => s + (x.minutes ?? 0), 0);
}
/** One-line status text ("Goal met", "2 of 3 met"…) for the outline row. */
export function markText(
  step: Step,
  mark: StepMark | undefined,
  lang: Lang,
): string {
  if (!mark?.visited) return "";
  if (mark.drill)
    return ps("scoreLine", lang, {
      c: mark.drill.correct,
      n: mark.drill.count,
    });
  if (mark.flown)
    return mark.flown.passed ? ps("passed", lang) : ps("notYet", lang);
  if (mark.goalMet) return ps("goalMet", lang);
  if (mark.correct || mark.calcOk) return ps("correct", lang);
  if (mark.answered || mark.calcOk === false) return ps("notQuite", lang);
  if (KINDS[step.kind]?.acts && mark.skipped) return ps("skipped", lang);
  return ps("done", lang);
}

// ------------------------------------------------------------------ the ticks
export function ticksEl(
  steps: readonly Step[],
  marks: Record<string, StepMark>,
  current: number,
  lang: Lang,
): HTMLElement {
  // the state never rests on colour alone: acting steps are taller ticks, the current one is longer, each tick
  // names its step on hover, and the accessible name says how many are done
  let done = 0;
  const el = h("div", { class: "cp-ticks", role: "img" });
  steps.forEach((s, i) => {
    const st = stepStatus(s, marks[s.id], i === current);
    if (st === "done" || st === "seen") done++;
    const what = markText(s, marks[s.id], lang);
    el.append(
      h("i", {
        class: tickClass(s, st),
        title: `${ps("stepN", lang, { n: i + 1 })} · ${kindLabel(s.kind, lang)} · ${L(s.title, lang)}${
          st === "current" ? ` · ${ps("current", lang)}` : what ? ` · ${what}` : ""
        }`,
      }),
    );
  });
  el.setAttribute(
    "aria-label",
    `${ps("stepOf", lang, { n: current + 1, total: steps.length })} · ${ps("ticksDone", lang, { n: done })}`,
  );
  el.dataset.n = String(steps.length);
  return el;
}

// ------------------------------------------------------------------ the sheet
export interface OutlineOptions {
  lang: Lang;
  title: L10n;
  steps: readonly Step[];
  marks: Record<string, StepMark>;
  current: number;
  onJump(i: number): void;
  onClose?(): void;
}
export class OutlineSheet {
  readonly el: HTMLDivElement;
  private prevFocus: Element | null = null;
  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    } else if (e.key === "Tab") {
      // keep the focus inside the sheet
      const f = [...this.el.querySelectorAll<HTMLElement>("button")];
      if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && i === f.length - 1) {
        e.preventDefault();
        f[0].focus();
      }
    }
  };
  constructor(private o: OutlineOptions) {
    const lang = o.lang;
    const titleId = `cp-ol-${Math.random().toString(36).slice(2, 7)}`;
    const list = h("ol", { class: "cp-ol-list" });
    let section: string | undefined;
    o.steps.forEach((s, i) => {
      if (s.section && s.section !== section) {
        section = s.section;
        list.append(
          h(
            "li",
            { class: "cp-ol-sec cp-label", role: "presentation" },
            s.section,
          ),
        );
      }
      const st = stepStatus(s, o.marks[s.id], i === o.current);
      const b = h(
        "button",
        {
          type: "button",
          class: `cp-ol-row st-${st}`,
          "aria-current": i === o.current ? "step" : null,
        },
        h("span", { class: "n num" }, String(i + 1)),
        h(
          "span",
          { class: "mid" },
          textEl("span", s.title, lang, "t"),
          h(
            "span",
            { class: "meta" },
            kindChip(s.kind, lang),
            s.minutes
              ? h(
                  "span",
                  { class: "cp-muted" },
                  ps("aboutMin", lang, { n: s.minutes }),
                )
              : null,
          ),
        ),
        h(
          "span",
          { class: "st" },
          st === "done" ? icon("check", "i ok") : null,
          h(
            "span",
            {},
            i === o.current
              ? ps("current", lang)
              : markText(s, o.marks[s.id], lang),
          ),
        ),
      );
      b.addEventListener("click", () => {
        this.close();
        o.onJump(i);
      });
      list.append(h("li", {}, b));
    });
    const mins = courseMinutes(o.steps);
    const closeB = h(
      "button",
      {
        type: "button",
        class: "cp-btn iconbtn ghost",
        "aria-label": ps("close", lang),
      },
      icon("x"),
    );
    closeB.addEventListener("click", () => this.close());
    const sheet = h(
      "div",
      {
        class: "cp-sheet",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": titleId,
      },
      h(
        "div",
        { class: "cp-sheet-hd" },
        h(
          "div",
          {},
          h("b", { id: titleId }, ps("outlineTitle", lang)),
          h(
            "span",
            { class: "cp-muted" },
            [
              L(o.title, lang),
              ps("stepsCount", lang, { n: o.steps.length }),
              mins ? ps("minutesTotal", lang, { n: mins }) : "",
            ]
              .filter(Boolean)
              .join(" · "),
          ),
        ),
        closeB,
      ),
      list,
    );
    this.el = h("div", { class: "cp-scrim" }, sheet);
    this.el.addEventListener("click", (e) => {
      if (e.target === this.el) this.close();
    });
  }
  open(parent: HTMLElement) {
    this.prevFocus = document.activeElement;
    parent.append(this.el);
    document.addEventListener("keydown", this.onKey, true);
    const cur =
      this.el.querySelector<HTMLElement>('[aria-current="step"]') ??
      this.el.querySelector<HTMLElement>("button");
    cur?.scrollIntoView({ block: "center" });
    cur?.focus({ preventScroll: true });
  }
  close() {
    if (!this.el.isConnected) return;
    document.removeEventListener("keydown", this.onKey, true);
    this.el.remove();
    (this.prevFocus as HTMLElement | null)?.focus?.();
    this.o.onClose?.();
  }
  get isOpen(): boolean {
    return this.el.isConnected;
  }
}
