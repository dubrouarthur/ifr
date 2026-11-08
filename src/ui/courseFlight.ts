// The cockpit side of a course, as the pilot sees it (the logic lives in src/course/cockpitBridge.ts):
//
//   - the course strip, a second row of the situation bar (never over an instrument):
//       capture mode   "Capturing for <course> · C scene · Shift+C last 60 s · Back 10 s · Back to the editor"
//       a course flight "<course> — <step> · Back to the course"
//   - the brief card: what the course step asks, its goals and keys, shown over the outside view while the flight
//     waits paused at its start position; Start flies it.
//
// main.ts owns the sim and the bridge; this module only draws and calls back.
import { h } from "./dom";
import { svgIcon, I } from "./icons";
import { lang as uiLang, registerStrings, t as tr } from "./i18n";
import type { L10n } from "../course/types";

registerStrings("en", {
  "cf.capturing": "Capturing for",
  "cf.captureFree": "Capture mode",
  "cf.scene": "Scene",
  "cf.sceneTip": "Capture this moment as a scene for the course (C)",
  "cf.clip": "Last 60 s",
  "cf.clipTip": "Capture the last 60 seconds as a clip (Shift+C)",
  "cf.back10": "Back 10 s",
  "cf.back10Tip":
    "Look at the flight 10 seconds ago (you can capture it, or fly on from there)",
  "cf.preview": "Showing 10 s ago",
  "cf.flyHere": "Fly from here",
  "cf.backNow": "Back to now",
  "cf.editor": "Back to the editor",
  "cf.course": "Course flight",
  "cf.backCourse": "Back to the course",
  "cf.backCourseTip":
    "Your attempt is saved when the exercise ends; leaving earlier records nothing",
  "cf.briefK": "Course flight",
  "cf.goals": "Goals",
  "cf.keys": "Keys to success",
  "cf.start": "Start the flight",
  "cf.waiting": "The simulation waits at the start position.",
  "cf.openBrief": "Open the briefing",
  "cf.briefFor": "Briefing course",
  "cf.briefForTip":
    "Read the briefing course for this lesson in the Ground school (opens a new tab)",
  "cf.previewN": "Showing {n} s ago",
  "cf.captureShort": "Capture",
  "cf.preparing": "Preparing the flight…",
  "cf.leaveQ": "Leave without a result?",
  "cf.leave": "Leave",
  "cf.keepFlying": "Keep flying",
  "cf.notNow": "Not now: back to the course",
  "cf.numbers": "Your numbers",
  "cf.doThis": "In the simulator",
  "cf.panel.g1000": "Instrument panel for this flight: G1000 glass",
  "cf.panel.steam": "Instrument panel for this flight: classic six-pack",
  "cf.panel.airliner": "Instrument panel for this flight: airliner PFD / ND",
  "cf.lessonFor": "This lesson is a step of the course",
  "cf.kCourse": "Course",
  "cf.stepOf": "Step {n} of {t}",
  "cf.backingQ": "Back to the course…",
  "cf.backCourseN": "Back to the course (step {n})",
});
registerStrings("fr", {
  "cf.capturing": "Capture pour",
  "cf.captureFree": "Mode capture",
  "cf.scene": "Scène",
  "cf.sceneTip": "Capturer cet instant comme scène du cours (C)",
  "cf.clip": "60 dernières s",
  "cf.clipTip": "Capturer les 60 dernières secondes en séquence (Maj+C)",
  "cf.back10": "Retour 10 s",
  "cf.back10Tip":
    "Revoir le vol d’il y a 10 secondes (à capturer, ou pour repartir de là)",
  "cf.preview": "Il y a 10 s",
  "cf.flyHere": "Repartir d’ici",
  "cf.backNow": "Revenir au présent",
  "cf.editor": "Retour à l’éditeur",
  "cf.course": "Vol du cours",
  "cf.backCourse": "Retour au cours",
  "cf.backCourseTip":
    "Votre essai est enregistré à la fin de l’exercice ; partir avant n’enregistre rien",
  "cf.briefK": "Vol du cours",
  "cf.goals": "Objectifs",
  "cf.keys": "Les clés",
  "cf.start": "Commencer le vol",
  "cf.waiting": "La simulation attend à la position de départ.",
  "cf.openBrief": "Ouvrir le briefing",
  "cf.briefFor": "Cours de briefing",
  "cf.briefForTip":
    "Lire le cours de briefing de cette leçon à l’École au sol (nouvel onglet)",
  "cf.previewN": "Il y a {n} s",
  "cf.captureShort": "Capture",
  "cf.preparing": "Préparation du vol…",
  "cf.leaveQ": "Partir sans résultat ?",
  "cf.leave": "Partir",
  "cf.keepFlying": "Continuer le vol",
  "cf.notNow": "Pas maintenant : retour au cours",
  "cf.numbers": "Vos valeurs",
  "cf.doThis": "Dans le simulateur",
  "cf.panel.g1000": "Tableau de bord de ce vol : G1000",
  "cf.panel.steam": "Tableau de bord de ce vol : six instruments classiques",
  "cf.panel.airliner": "Tableau de bord de ce vol : PFD / ND de ligne",
  "cf.lessonFor": "Cette leçon est une étape du cours",
  "cf.kCourse": "Cours",
  "cf.stepOf": "Étape {n} sur {t}",
  "cf.backingQ": "Retour au cours…",
  "cf.backCourseN": "Retour au cours (étape {n})",
});

export const l10n = (t: L10n | undefined): string =>
  t ? (uiLang() === "fr" ? (t.fr ?? t.en) : t.en) : "";

export interface CourseStripState {
  /** capture mode: the course's title (null: not known yet) */
  capture?: {
    title: string | null;
    /** the look-back shown: how many seconds ago (null: live) */
    previewAgo: number | null;
    canBack: boolean;
    hasEditor: boolean;
  };
  /** a course flight in progress; hasResult: the exercise ended (leaving sends that result) */
  flight?: { course: string; step: string; hasResult: boolean; n?: number; of?: number };
  /** a ?fly= link is being resolved (the course store, the handoff, the samples load) */
  loading?: boolean;
}
/** what the brief card of a course flight shows (main.ts builds it from the handoff and the plan) */
export interface CourseBrief {
  course: string;
  title: string;
  brief: string;
  keys: string[];
  goals: string[];
  /** a calc target: the numbers the student solved */
  givens: { label: string; value: string }[];
  /** a calc target: what the stage asks of the trainer (its own speed, the stand-in fix) */
  doThis: string[];
  /** the bridge's messages (course changed, started again) and the panel this flight uses */
  notes: string[];
}
export interface CourseFlightActions {
  capture(): void;
  clip(): void;
  back10(): void;
  flyFromHere(): void;
  backToNow(): void;
  toEditor(): void;
  /** leave for the course page (the strip asks first when the flight has no result yet) */
  backToCourse(): void;
  /** the brief card's Start */
  start(): void;
}

const kbd = (k: string) =>
  h("kbd", { class: "cf-kbd", "aria-hidden": "true" }, k);
const btn = (
  cls: string,
  label: string,
  title: string,
  fn: () => void,
  ...pre: (Node | null)[]
) =>
  h(
    "button",
    {
      type: "button",
      class: `cf-b ${cls}`,
      title,
      onclick: (e: Event) => {
        e.stopPropagation();
        fn();
      },
    },
    ...pre,
    h("span", {}, label),
  );

/** The course strip (under the situation bar) and the brief card (over the outside view). */
export class CourseFlightUi {
  readonly strip = h("div", {
    class: "cf-strip",
    role: "region",
    hidden: true,
  });
  readonly card = h("div", { class: "cf-card-wrap", hidden: true });
  /** the loading card over the whole cockpit while a course flight is being prepared (main.ts appends it to body) */
  private readonly veilMsg = h("b", {}, tr("cf.preparing"));
  private readonly veilSub = h("small", { hidden: true });
  readonly veil = h(
    "div",
    { class: "cf-veil", hidden: true },
    h(
      "div",
      { class: "cf-veil-card", role: "status" },
      h("i", { class: "cf-spin", "aria-hidden": "true" }),
      h("div", { class: "cf-veil-t" }, this.veilMsg, this.veilSub),
    ),
  );
  /** the hand-over to the course page: « Retour au cours… » and its title, never a blank page (UX logic §7) */
  private leavingTo: string | null = null;
  leaving(course: string) {
    this.leavingTo = course;
    this.veilMsg.textContent = tr("cf.backingQ");
    this.veilSub.textContent = course;
    this.veilSub.hidden = !course;
    this.veil.hidden = false;
  }
  private key = "";
  constructor(private act: CourseFlightActions) {}

  get briefOpen(): boolean {
    return !this.card.hidden;
  }

  /** the strip asks "Leave without a result?" (touch users never see the tooltip that says so) */
  private confirming = false;
  private last: CourseStripState = {};
  /** redraw the strip when what it says changed; returns true when its visibility changed */
  render(s: CourseStripState): boolean {
    this.last = s;
    if (!s.flight || s.flight.hasResult) this.confirming = false;
    const key = JSON.stringify([s, this.confirming, uiLang()]);
    if (key === this.key) return false;
    this.key = key;
    const wasHidden = this.strip.hidden;
    this.strip.replaceChildren();
    this.strip.classList.toggle("capture", !!s.capture);
    if (s.capture) {
      const c = s.capture;
      this.strip.setAttribute("aria-label", tr("cf.captureFree"));
      const what =
        c.previewAgo !== null
          ? h(
              "div",
              { class: "cf-what" },
              h("i", { class: "cf-dot preview", "aria-hidden": "true" }),
              h("b", {}, tr("cf.previewN", { n: c.previewAgo })),
            )
          : h(
              "div",
              { class: "cf-what" },
              h("i", { class: "cf-dot", "aria-hidden": "true" }),
              // a short kicker on narrow screens (the iPad): the red dot alone does not say "capture"
              h("small", { class: "cf-k-long" }, c.title ? tr("cf.capturing") : ""),
              c.title ? h("small", { class: "cf-k-short" }, tr("cf.captureShort")) : null,
              h("b", {}, c.title ?? tr("cf.captureFree")),
            );
      const previewing = c.previewAgo !== null;
      const acts = h(
        "div",
        { class: "cf-acts" },
        btn(
          "",
          tr("cf.scene"),
          tr("cf.sceneTip"),
          () => this.act.capture(),
          kbd("C"),
        ),
        previewing
          ? null
          : btn(
              "",
              tr("cf.clip"),
              tr("cf.clipTip"),
              () => this.act.clip(),
              kbd("⇧C"),
            ),
        previewing
          ? btn(
              "",
              tr("cf.flyHere"),
              tr("cf.flyHere"),
              () => this.act.flyFromHere(),
              svgIcon(I.play, 14),
            )
          : c.canBack
            ? btn(
                "",
                tr("cf.back10"),
                tr("cf.back10Tip"),
                () => this.act.back10(),
                svgIcon(I.restart, 14),
              )
            : null,
        previewing
          ? btn("", tr("cf.backNow"), tr("cf.backNow"), () =>
              this.act.backToNow(),
            )
          : null,
        c.hasEditor
          ? btn(
              "primary",
              tr("cf.editor"),
              tr("cf.editor"),
              () => this.act.toEditor(),
              svgIcon(I.arrow, 14),
            )
          : null,
      );
      this.strip.append(what, acts);
    } else if (s.flight) {
      const f = s.flight;
      this.strip.setAttribute("aria-label", tr("cf.course"));
      // « Cours · <course> · Étape 13 sur 14 » (the step's own title is the brief card's, and this line's tooltip)
      const where = f.n && f.of ? tr("cf.stepOf", { n: f.n, t: f.of }) : f.step;
      this.strip.append(
        h(
          "div",
          { class: "cf-what", title: `${f.course} — ${f.step}` },
          svgIcon(I.learn, 16),
          h("small", { class: "cf-kind" }, tr("cf.kCourse")),
          h("b", { class: "cf-course-t" }, f.course),
          h("span", { class: "cf-stepn" }, where),
        ),
        this.confirming
          ? h(
              "div",
              { class: "cf-acts cf-confirm", role: "group", "aria-label": tr("cf.leaveQ") },
              h("span", { class: "cf-q" }, tr("cf.leaveQ")),
              btn("", tr("cf.keepFlying"), tr("cf.keepFlying"), () => {
                this.confirming = false;
                this.render(this.last);
              }),
              btn("danger", tr("cf.leave"), tr("cf.backCourseTip"), () => {
                this.confirming = false;
                this.act.backToCourse();
              }),
            )
          : h(
              "div",
              { class: "cf-acts" },
              // secondary, never filled: before take-off the one primary is « Commencer le vol » (UX logic §7)
              btn(
                "cf-back",
                tr("cf.backCourse"),
                tr("cf.backCourseTip"),
                () => {
                  // with no result yet, leaving records nothing: ask first (in the strip, never a native dialog);
                  // before Start (the brief card still up) there is nothing to lose, so no question
                  if (f.hasResult || this.briefOpen) {
                    this.closeBrief(false);
                    this.act.backToCourse();
                  }
                  else {
                    this.confirming = true;
                    this.render(this.last);
                  }
                },
                h("span", { class: "cf-larr", "aria-hidden": "true" }, svgIcon(I.arrow, 14)),
              ),
            ),
      );
    } else if (s.loading) {
      this.strip.setAttribute("aria-label", tr("cf.course"));
      this.strip.append(
        h(
          "div",
          { class: "cf-what", role: "status" },
          h("i", { class: "cf-spin", "aria-hidden": "true" }),
          h("b", {}, tr("cf.preparing")),
        ),
      );
    }
    this.strip.hidden = !s.capture && !s.flight && !s.loading;
    // while a ?fly= link resolves, the whole cockpit waits under one card: the previous panel and outside view never
    // show before the course step's own
    if (this.leavingTo === null) {
      this.veilMsg.textContent = tr("cf.preparing");
      this.veilSub.hidden = true;
      this.veil.hidden = !s.loading;
    }
    return wasHidden !== this.strip.hidden;
  }

  /** the brief card of a course flight (scene, calc, circuit, scenario or procedure target) */
  showBrief(b: CourseBrief) {
    const startBtn = h('button', { type: 'button', class: 'btn primary cf-start', onclick: () => this.closeBrief(true) }, svgIcon(I.play, 15), h('span', {}, tr('cf.start')));
    // the way out before flying is the strip's one "Back to the course" (nothing recorded: the flight has not started)
    const sec = (head: string, body: Node) => h('div', { class: 'cf-card-sec' }, h('div', { class: 'cf-card-h' }, head), body);
    // two columns: what to fly (scrolls when the outside view is short) | the goals and Start (always in view)
    const card = h('section', { class: 'cf-card', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'cf-card-t' },
      h('div', { class: 'cf-card-main' },
        h('div', { class: 'cf-card-k' }, h('span', {}, tr('cf.briefK')), h('span', { class: 'cf-card-c' }, b.course)),
        h('h2', { id: 'cf-card-t' }, b.title),
        b.brief ? h('p', { class: 'cf-card-p' }, b.brief) : null,
        b.givens.length ? sec(tr('cf.numbers'), h('dl', { class: 'cf-givens' }, ...b.givens.flatMap((g) => [h('dt', {}, g.label), h('dd', {}, g.value)]))) : null,
        b.doThis.length ? sec(tr('cf.doThis'), h('ul', { class: 'cf-keys' }, ...b.doThis.map((k) => h('li', {}, k)))) : null,
        b.keys.length ? sec(tr('cf.keys'), h('ul', { class: 'cf-keys' }, ...b.keys.map((k) => h('li', {}, k)))) : null,
        b.notes.length ? h('ul', { class: 'cf-notes', role: 'status' }, ...b.notes.map((n) => h('li', {}, n))) : null,
      ),
      h('div', { class: 'cf-card-side' },
        b.goals.length ? sec(tr('cf.goals'), h('ul', { class: 'cf-goals' }, ...b.goals.map((g) => h('li', {}, svgIcon(I.target, 14), h('span', {}, g))))) : null,
        h('div', { class: 'cf-card-foot' }, h('span', { class: 'cf-card-w' }, tr('cf.waiting')), startBtn),
      ),
    );
    this.card.replaceChildren(card);
    this.card.hidden = false;
    requestAnimationFrame(() => startBtn.focus({ preventScroll: true }));
  }
  closeBrief(start: boolean) {
    if (this.card.hidden) return;
    this.card.hidden = true;
    this.card.replaceChildren();
    if (start) this.act.start();
  }
}

/** the briefing window of a lesson flown from a course: the course and its step, where the toast used to say it */
export function lessonForCourse(course: string, step: string): HTMLElement {
  return h(
    "div",
    { class: "cf-brieflink cf-lessonfor" },
    svgIcon(I.learn, 18),
    h("div", {}, h("small", {}, tr("cf.lessonFor")), h("b", {}, `${course} — ${step}`)),
  );
}

/** "Open the briefing" for a lesson that has a briefing course (academy.html#play=<id>, a new tab). */
export function briefingLink(course: { id: string; title: L10n }): HTMLElement {
  return h(
    "div",
    { class: "cf-brieflink" },
    svgIcon(I.learn, 18),
    h(
      "div",
      {},
      h("small", {}, tr("cf.briefFor")),
      h("b", {}, l10n(course.title)),
    ),
    h(
      "a",
      {
        class: "btn",
        href: `academy.html#play=${encodeURIComponent(course.id)}`,
        target: "_blank",
        rel: "noopener",
        title: tr("cf.briefForTip"),
      },
      h("span", {}, tr("cf.openBrief")),
    ),
  );
}
