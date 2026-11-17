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
// hand-over: the one vocabulary and the derived « À vous » words (course/handover.ts)
import { barePrompt, deriveBrief, detectDevice, hw, hwq } from "../course/handover";

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
  "cf.backCourse": hw("backToCourse", "en"),
  "cf.backCourseTip":
    "Your attempt is saved when the exercise ends; leaving earlier records nothing",
  "cf.briefK": `${hw("yourTurn", "en")} · in the simulator`,
  "cf.goals": "Goals",
  "cf.keys": "Keys to success",
  "cf.start": hw("take", "en"),
  "cf.waiting": "The simulation waits at the start position.",
  "cf.howto": "How it goes",
  "cf.where": "You are in the full simulator: the whole cockpit is yours.",
  "cf.fly.mouse":
    "Keyboard: ↓ nose up (pull), ↑ nose down (push), ← → bank, + and − for power. With the mouse: drag the yoke at the bottom of the screen.",
  "cf.fly.touch":
    "With a finger: drag the yoke at the bottom of the screen; the throttle is on its left.",
  "cf.comeBack": `To come back: ${hwq("backToCourse", "en")}, in the course strip at the top. Your result comes back to the slide with you.`,
  "cf.goalK": "Goal",
  "cf.openBrief": "Open the briefing",
  "cf.briefFor": "Briefing course",
  "cf.briefForTip":
    "Read the briefing course for this lesson in the Ground school (opens a new tab)",
  "cf.previewN": "Showing {n} s ago",
  "cf.captureShort": "Capture",
  "cf.preparing": "Preparing the flight…",
  "cf.preparingCapture": "Preparing the capture…",
  "cf.leaveQ": "Back to the course without a result?",
  "cf.leave": "Back to the course",
  "cf.keepFlying": "Keep flying",
  "cf.notNow": `Not now: ${hw("backToCourse", "en").toLowerCase()}`,
  "cf.numbers": "Your numbers",
  "cf.doThis": "In the simulator",
  "cf.panel.g1000": "Instrument panel for this flight: glass panel",
  "cf.panel.steam": "Instrument panel for this flight: classic six-pack",
  "cf.panel.airliner": "Instrument panel for this flight: airliner PFD / ND",
  "cf.lessonFor": "This lesson is a step of the course",
  "cf.kCourse": "Course",
  "cf.stepOf": "Slide {n} of {t}",
  "cf.backingQ": "Back to the course…",
  "cf.backCourseN": `${hw("backToCourse", "en")} (slide {n})`,
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
  "cf.backCourse": hw("backToCourse", "fr"),
  "cf.backCourseTip":
    "Votre essai est enregistré à la fin de l’exercice ; partir avant n’enregistre rien",
  "cf.briefK": `${hw("yourTurn", "fr")} · dans le simulateur`,
  "cf.goals": "Objectifs",
  "cf.keys": "Les clés",
  "cf.start": hw("take", "fr"),
  "cf.waiting": "La simulation attend à la position de départ.",
  "cf.howto": "Comment ça se passe",
  "cf.where": "Vous êtes dans le simulateur complet : tout le cockpit est à vous.",
  "cf.fly.mouse":
    "Au clavier : ↓ cabrer (tirer), ↑ piquer (pousser), ← → incliner, + et − pour la puissance. À la souris : glissez le manche, en bas de l’écran.",
  "cf.fly.touch":
    "Au doigt : glissez le manche, en bas de l’écran ; la manette des gaz est à sa gauche.",
  "cf.comeBack": `Pour revenir : ${hwq("backToCourse", "fr")}, dans la bande du cours en haut. Votre résultat revient avec vous sur la diapositive.`,
  "cf.goalK": "Objectif",
  "cf.openBrief": "Ouvrir le briefing",
  "cf.briefFor": "Cours de briefing",
  "cf.briefForTip":
    "Lire le cours de briefing de cette leçon à l’École au sol (nouvel onglet)",
  "cf.previewN": "Il y a {n} s",
  "cf.captureShort": "Capture",
  "cf.preparing": "Préparation du vol…",
  "cf.preparingCapture": "Préparation de la capture…",
  "cf.leaveQ": "Revenir au cours sans résultat ?",
  "cf.leave": "Revenir au cours",
  "cf.keepFlying": "Continuer le vol",
  "cf.notNow": `Pas maintenant : ${hw("backToCourse", "fr").toLowerCase()}`,
  "cf.numbers": "Vos valeurs",
  "cf.doThis": "Dans le simulateur",
  "cf.panel.g1000": "Tableau de bord de ce vol : écrans de vol",
  "cf.panel.steam": "Tableau de bord de ce vol : six instruments classiques",
  "cf.panel.airliner": "Tableau de bord de ce vol : PFD / ND de ligne",
  "cf.lessonFor": "Cette leçon est une étape du cours",
  "cf.kCourse": "Cours",
  "cf.stepOf": "Diapo {n} sur {t}",
  "cf.backingQ": "Vous reprenez le cours…",
  "cf.backCourseN": `${hw("backToCourse", "fr")} (diapo {n})`,
});

export const l10n = (t: L10n | undefined): string =>
  t ? (uiLang() === "fr" ? (t.fr ?? t.en) : t.en) : "";

export interface CourseStripState {
  /** capture mode: the course's title (null: not known yet) */
  capture?: {
    title: string | null;
    /** the slide the moment is for (null: not known, or a capture for the course) */
    slide?: string | null;
    /** the captures that will go back to the studio */
    count?: number;
    /** the aircraft has crashed (the strip's capture buttons wait for a way back) */
    crashed?: boolean;
    /** the look-back shown: how many seconds ago (null: live) */
    previewAgo: number | null;
    canBack: boolean;
    hasEditor: boolean;
  };
  /** a course flight in progress; hasResult: the exercise ended (leaving sends that result) */
  flight?: {
    course: string;
    step: string;
    hasResult: boolean;
    n?: number;
    of?: number;
    /** hand-over: what the student is flying for, always in view in the strip (default: the step's title) */
    goal?: string;
  };
  /** a ?fly= link is being resolved (the course store, the handoff, the samples load); 'capture': a ?capture= link */
  loading?: boolean | "capture";
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
  /** hand-over: the flight stops by itself after this long (a scene or calc target) */
  durationS?: number;
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
  /** the aircraft waits while the strip asks « Revenir au cours sans résultat ? »: pause it (true if it was flying),
   *  then fly on with « Continuer le vol » */
  hold?(): boolean;
  release?(): void;
  /** the brief card's Start */
  start(): void;
  /** capture mode (all optional: a course flight does not use them) */
  intro?(): void;
  rewind?(): void;
  restart?(): void;
  useCapture?(id: string): void;
  removeCapture?(id: string): void;
  undoRemove?(id: string): void;
  foldShelf?(folded: boolean): void;
}

/** one capture in the cockpit's strip of captures */
export interface ShelfItem {
  id: string;
  /** « 270° · 3 000 ft · 100 kt · virage 15° D · ARD radial 090 6 NM » */
  line: string;
  /** « 14:32 » */
  time: string;
  /** Shift+C: a recording of n seconds */
  clipS?: number;
  thumbUrl?: string;
  /** removed a moment ago: the card offers « Annuler » */
  removed?: boolean;
}
export interface ShelfState {
  items: ShelfItem[];
  folded: boolean;
  /** a refusal (a crash, beyond VNE…) or a confirmation, shown at the head of the strip */
  notice: { kind: "bad" | "good"; text: string } | null;
  hasEditor: boolean;
  /** captures cannot reach the studio (storage blocked) */
  blocked: boolean;
}
/** the card on arrival in capture mode */
export interface CaptureIntro {
  slide: string | null;
  course: string | null;
  blocked: boolean;
  blockedText?: string;
  hasEditor: boolean;
}
/** the card after a crash in capture mode */
export interface CaptureCrash {
  reason: string;
  kept: number;
  canRewind: boolean;
  canRestart: boolean;
  hasEditor: boolean;
}
/** FR / EN in place (the cockpit's capture words) */
const L2 = (en: string, fr: string) => (uiLang() === "fr" ? fr : en);

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
  /** capture mode: « Revenir à la diapo » on the loading card itself (the top bar is under it) */
  private veilBackFn: (() => void) | null = null;
  private readonly veilBack = h("button", {
    type: "button",
    class: "btn cf-veil-back",
    hidden: true,
    onclick: () => this.veilBackFn?.(),
  });
  /** the way back the loading card offers: « Revenir à la diapo » in capture mode, « Annuler, revenir au cours »
   *  for a course flight (null: none) */
  setVeilBack(fn: (() => void) | null) {
    this.veilBackFn = fn;
  }
  /** a course flight: the step being prepared, as the course page named it before leaving (cockpitLink FlyNote) */
  private veilNote: { course: string; step: string } | null = null;
  setVeilNote(n: { course: string; step: string } | null) {
    this.veilNote = n;
  }
  /** « Briefing ✓ · Vol · Débriefing »: where the student is in the hand-over while the cockpit loads (audit §16) */
  private readonly veilSteps = h("ol", { class: "cf-veil-steps", hidden: true });
  /** the loading bar (it moves while the cockpit loads; it promises no time) */
  private readonly veilBar = h("i", { class: "cf-veil-bar", hidden: true, "aria-hidden": "true" }, h("i", {}));
  private readonly veilCard = h(
    "div",
    { class: "cf-veil-card", role: "status" },
    h("i", { class: "cf-spin", "aria-hidden": "true" }),
    h("div", { class: "cf-veil-t" }, this.veilMsg, this.veilSub),
    this.veilSteps,
    this.veilBar,
    this.veilBack,
  );
  readonly veil = h("div", { class: "cf-veil", hidden: true }, this.veilCard);
  /** the hand-over to the course page: « Retour au cours… » and its title, never a blank page (UX logic §7) */
  private leavingTo: string | null = null;
  leaving(course: string) {
    this.leavingTo = course;
    this.veilMsg.textContent = tr("cf.backingQ");
    this.veilSub.textContent = course;
    this.veilSub.hidden = !course;
    this.veilBack.hidden = true;
    this.veilSteps.hidden = true;
    this.veilBar.hidden = true;
    this.veilCard.classList.remove("is-fly");
    this.veil.hidden = false;
  }
  private key = "";
  constructor(private act: CourseFlightActions) {}

  get briefOpen(): boolean {
    return !this.card.hidden;
  }
  /** which card is up over the outside view: a course flight's brief, the capture card, the crash card */
  cardKind: "brief" | "capture" | "crash" | null = null;

  /** the strip asks "Leave without a result?" (touch users never see the tooltip that says so) */
  private confirming = false;
  /** the strip paused the aircraft to ask: « Continuer le vol » flies on */
  private held = false;
  /** « Reprendre le cours » (the strip, and the top bar's « ← <cours> »): with no result yet, leaving records
   *  nothing, so it asks first, in the strip, with the aircraft paused (never a native dialog); before Start (the
   *  brief card still up) there is nothing to lose, so no question. */
  requestBack() {
    const f = this.last?.flight;
    if (!f || f.hasResult || this.briefOpen) {
      this.closeBrief(false);
      this.act.backToCourse();
      return;
    }
    if (this.confirming) return;
    this.confirming = true;
    this.held = this.act.hold?.() ?? false;
    this.render(this.last);
  }
  /** the strip is asking: its two buttons are the one choice (no pause veil, no top-bar Pause meanwhile) */
  get asking() {
    return this.confirming;
  }
  private last: CourseStripState = {};
  /** redraw the strip when what it says changed; returns true when its visibility changed */
  render(s: CourseStripState): boolean {
    this.last = s;
    if (!s.flight || s.flight.hasResult) this.confirming = false;
    const key = JSON.stringify([s, this.confirming, uiLang(), this.briefOpen]);
    if (key === this.key) return false;
    this.key = key;
    const wasHidden = this.strip.hidden;
    this.strip.replaceChildren();
    this.strip.classList.toggle("capture", !!s.capture);
    if (s.capture) {
      const c = s.capture;
      this.strip.setAttribute("aria-label", L2("Capture a moment for the slide", "Capturer un moment pour la diapo"));
      const previewing = c.previewAgo !== null;
      const what = previewing
        ? h(
            "div",
            { class: "cf-what" },
            h("i", { class: "cf-dot preview", "aria-hidden": "true" }),
            h("b", {}, tr("cf.previewN", { n: c.previewAgo ?? 10 })),
          )
        : h(
            "div",
            { class: "cf-what", title: [c.title, c.slide].filter(Boolean).join(" — ") },
            h("i", { class: "cf-dot", "aria-hidden": "true" }),
            h("small", { class: "cf-k-long" }, L2("Capture for the slide", "Capture pour la diapo")),
            h("small", { class: "cf-k-short" }, L2("Capture", "Capture")),
            h("b", {}, c.slide || c.title || tr("cf.captureFree")),
          );
      const two = (long: string, short: string) =>
        h("span", { class: "cf-two" }, h("span", { class: "cf-long" }, long), h("span", { class: "cf-short", "aria-hidden": "true" }, short));
      const n = c.count ?? 0;
      const capBtn = btn(
        "primary cf-cap",
        "",
        L2("Capture this moment for the slide (C)", "Capturer ce moment pour la diapo (C)"),
        () => this.act.capture(),
        kbd("C"),
      );
      capBtn.lastElementChild?.replaceWith(two(L2("Capture this moment", "Capturer ce moment"), L2("Capture", "Capturer")));
      capBtn.disabled = !!c.crashed;
      const clipBtn = btn(
        "cf-clip",
        "",
        L2(
          "Keep the minute of flight that just went by: the slide can replay it (Shift+C)",
          "Garder la minute de vol qui vient de passer : la diapo peut la rejouer (Maj+C)",
        ),
        () => this.act.clip(),
        kbd("⇧C"),
      );
      clipBtn.lastElementChild?.replaceWith(two(L2("Record the last 60 seconds", "Enregistrer les 60 dernières secondes"), L2("Last 60 s", "60 dernières s")));
      clipBtn.disabled = !!c.crashed;
      const back = c.hasEditor
        ? btn(
            "cf-back-slide",
            "",
            L2("Go back to the slide: your captures go with you", "Revenir à la diapo : vos captures vous suivent"),
            () => this.act.toEditor(),
            svgIcon(I.arrow, 14),
          )
        : null;
      back?.lastElementChild?.replaceWith(
        h(
          "span",
          {},
          L2("Go back to the slide", "Revenir à la diapo"),
          n ? h("i", { class: "cf-count", "aria-label": L2(`${n} captures`, `${n} captures`) }, String(n)) : null,
        ),
      );
      const help = this.act.intro
        ? btn("cf-help", "", L2("What is captured, and how", "Ce qui est capturé, et comment"), () => this.act.intro?.(), svgIcon(I.help, 15))
        : null;
      help?.setAttribute("aria-label", L2("What is captured, and how", "Ce qui est capturé, et comment"));
      const acts = h(
        "div",
        { class: "cf-acts" },
        capBtn,
        previewing ? null : clipBtn,
        previewing
          ? btn("", tr("cf.flyHere"), tr("cf.flyHere"), () => this.act.flyFromHere(), svgIcon(I.play, 14))
          : c.canBack && !c.crashed
            ? btn("", tr("cf.back10"), tr("cf.back10Tip"), () => this.act.back10(), svgIcon(I.restart, 14))
            : null,
        previewing ? btn("", tr("cf.backNow"), tr("cf.backNow"), () => this.act.backToNow()) : null,
        help,
        back,
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
          // hand-over: the goal stays in view while the student flies (the exercise window can be folded)
          h(
            "span",
            { class: "cf-goal" },
            h("small", {}, tr("cf.goalK")),
            h("span", {}, f.goal || barePrompt(f.step)),
          ),
          // who flies: the same words as on a slide's instrument, once the student has started
          !this.briefOpen && !f.hasResult
            ? h("span", { class: "cf-you", role: "status" }, hw("youHave", uiLang()))
            : null,
        ),
        this.confirming
          ? h(
              "div",
              { class: "cf-acts cf-confirm", role: "group", "aria-label": tr("cf.leaveQ") },
              h("span", { class: "cf-q" }, tr("cf.leaveQ")),
              btn("", tr("cf.keepFlying"), tr("cf.keepFlying"), () => {
                this.confirming = false;
                if (this.held) this.act.release?.();
                this.held = false;
                this.render(this.last);
              }),
              btn("primary", tr("cf.leave"), tr("cf.backCourseTip"), () => {
                this.confirming = false;
                this.held = false;
                this.act.backToCourse();
              }),
            )
          : h(
              "div",
              { class: "cf-acts" },
              // secondary, never filled: before take-off the one primary is « Prendre les commandes » (UX logic §7)
              btn(
                "cf-back",
                tr("cf.backCourse"),
                tr("cf.backCourseTip"),
                () => this.requestBack(),
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
          h("b", {}, tr(s.loading === "capture" ? "cf.preparingCapture" : "cf.preparing")),
        ),
      );
    }
    this.strip.hidden = !s.capture && !s.flight && !s.loading;
    // while a ?fly= link resolves, the whole cockpit waits under one card: the previous panel and outside view never
    // show before the course step's own
    if (this.leavingTo === null) {
      const cap = s.loading === "capture";
      this.veilMsg.textContent = tr(cap ? "cf.preparingCapture" : "cf.preparing");
      // a course flight: the step's name, where the hand-over is, a moving bar and a way back (audit §16)
      const fly = !!s.loading && !cap;
      const n = fly ? this.veilNote : null;
      this.veilSub.textContent = n ? `${n.course} · ${n.step}` : "";
      this.veilSub.hidden = !n;
      this.veilCard.classList.toggle("is-fly", fly);
      this.veilSteps.hidden = !fly;
      this.veilBar.hidden = !fly;
      if (fly) {
        const st = (label: string, state: "done" | "now" | "next") =>
          h("li", { class: state, ...(state === "now" ? { "aria-current": "step" } : {}) },
            label,
            state === "done" ? h("span", { class: "sr-only" }, L2(" (done)", " (fait)")) : null);
        this.veilSteps.replaceChildren(
          st(L2("Briefing", "Briefing"), "done"),
          st(L2("Flight", "Vol"), "now"),
          st(L2("Debrief", "Débriefing"), "next"),
        );
        this.veilSteps.setAttribute("aria-label", L2("Course flight", "Vol du cours"));
      }
      const back = !!s.loading && !!this.veilBackFn;
      this.veilBack.hidden = !back;
      if (back) this.veilBack.textContent = cap ? L2("Go back to the slide", "Revenir à la diapo") : L2("Cancel, back to the course", "Annuler, revenir au cours");
      this.veil.hidden = !s.loading;
    }
    return wasHidden !== this.strip.hidden;
  }

  /** the brief card of a course flight (scene, calc, circuit, scenario or procedure target) */
  showBrief(b: CourseBrief) {
    const startBtn = h('button', { type: 'button', class: 'btn primary cf-start', onclick: () => this.closeBrief(true) }, svgIcon(I.play, 15), h('span', {}, tr('cf.start')));
    // the way out before flying is the strip's one "Back to the course" (nothing recorded: the flight has not started)
    const ho = deriveBrief({ where: 'sim', durationS: b.durationS }, detectDevice(), uiLang());
    const sec = (head: string, body: Node) => h('div', { class: 'cf-card-sec' }, h('div', { class: 'cf-card-h' }, head), body);
    // two columns: what to fly (scrolls when the outside view is short) | the goals and Start (always in view)
    const card = h('section', { class: 'cf-card', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'cf-card-t' },
      h('div', { class: 'cf-card-main' },
        h('div', { class: 'cf-card-k' }, h('span', {}, tr('cf.briefK')), h('span', { class: 'cf-card-c' }, b.course)),
        h('h2', { id: 'cf-card-t' }, barePrompt(b.title)),
        b.brief ? h('p', { class: 'cf-card-p' }, b.brief) : null,
        // hand-over: where the student is, which controls fly it on this device, how it ends, how to come back
        sec(tr('cf.howto'), h('ul', { class: 'cf-keys cf-howto' },
          h('li', {}, tr('cf.where')),
          h('li', {}, tr(detectDevice() === 'touch' ? 'cf.fly.touch' : 'cf.fly.mouse')),
          h('li', {}, ho.ends),
          h('li', {}, tr('cf.comeBack')),
        )),
        b.givens.length ? sec(tr('cf.numbers'), h('dl', { class: 'cf-givens' }, ...b.givens.flatMap((g) => [h('dt', {}, g.label), h('dd', {}, g.value)]))) : null,
        b.doThis.length ? sec(tr('cf.doThis'), h('ul', { class: 'cf-keys' }, ...b.doThis.map((k) => h('li', {}, k)))) : null,
        b.keys.length ? sec(tr('cf.keys'), h('ul', { class: 'cf-keys' }, ...b.keys.map((k) => h('li', {}, k)))) : null,
        b.notes.length ? h('ul', { class: 'cf-notes', role: 'status' }, ...b.notes.map((n) => h('li', {}, n))) : null,
      ),
      h('div', { class: 'cf-card-side' },
        b.goals.length ? sec(tr('cf.goals'), h('ul', { class: 'cf-goals' }, ...b.goals.map((g) => h('li', {}, svgIcon(I.target, 14), h('span', {}, g))))) : null,
        h('div', { class: 'cf-card-foot' }, h('span', { class: 'cf-card-w' }, ho.waits), startBtn),
      ),
    );
    this.card.replaceChildren(card);
    this.card.hidden = false;
    this.cardKind = "brief";
    this.render(this.last); // hand-over: the strip says who flies
    requestAnimationFrame(() => startBtn.focus({ preventScroll: true }));
  }
  // ---------------------------------------------------------------- capture mode
  /**
   * The card on arrival: what this is for (the slide), what a capture keeps, the three things to do. The aircraft
   * waits paused in the slide's situation until « Commencer à voler » (Enter / Esc), or a capture right away (C).
   */
  showCaptureIntro(o: CaptureIntro) {
    const fly = h(
      "button",
      { type: "button", class: "cf-b primary cf-go", onclick: () => this.closeBrief(true) },
      svgIcon(I.play, 15),
      h("span", {}, L2("Start flying", "Commencer à voler")),
    );
    const capNow = h(
      "button",
      {
        type: "button",
        class: "cf-b",
        onclick: () => {
          this.closeBrief(false);
          this.act.capture();
        },
      },
      h("span", {}, L2("Capture this situation now", "Capturer cette situation tout de suite")),
    );
    const row = (keys: string, name: string, line: string) =>
      h(
        "li",
        {},
        h("span", { class: "cf-ci-name" }, keys ? kbd(keys) : svgIcon(I.arrow, 14), h("b", {}, name)),
        h("span", { class: "cf-ci-line" }, line),
      );
    const card = h(
      "section",
      { class: "cf-card cf-capcard", role: "dialog", "aria-modal": "false", "aria-labelledby": "cf-cap-t" },
      h(
        "div",
        { class: "cf-capcard-main" },
        h("div", { class: "cf-card-k" }, h("span", {}, L2("Capture a moment for the slide", "Capturer un moment pour la diapo")), o.course ? h("span", { class: "cf-card-c" }, o.course) : null),
        h("h2", { id: "cf-cap-t" }, o.slide || o.course || L2("Your slide", "Votre diapo")),
        h(
          "p",
          { class: "cf-card-p" },
          L2(
            "What is captured: the position, the attitude, the speed, the radios. The slide’s instruments will show exactly this moment.",
            "Ce qui est capturé : la position, l’attitude, la vitesse, les radios. Les instruments de la diapo montreront exactement ce moment.",
          ),
        ),
        h(
          "ul",
          { class: "cf-capsteps" },
          row(
            "C",
            L2("Capture this moment", "Capturer ce moment"),
            L2(
              "Fly to the right moment, then press it. Take as many as you like: you choose on the slide.",
              "Volez jusqu’au bon moment, puis appuyez. Prenez-en autant que vous voulez : vous choisirez sur la diapo.",
            ),
          ),
          row(
            "⇧C",
            L2("Record the last 60 seconds", "Enregistrer les 60 dernières secondes"),
            L2(
              "Keeps the minute of flight that just went by: the slide can replay it, like a video of the instruments.",
              "Garde la minute de vol qui vient de passer : la diapo peut la rejouer, comme une vidéo des instruments.",
            ),
          ),
          o.hasEditor
            ? row(
                "",
                L2("Go back to the slide", "Revenir à la diapo"),
                L2(
                  "Your captures are waiting there, under « Your captures »: pick the one the slide shows.",
                  "Vos captures vous y attendent, sous « Vos captures » : choisissez celle que la diapo montre.",
                ),
              )
            : null,
        ),
        o.blocked ? h("p", { class: "cf-capwarn", role: "alert" }, o.blockedText ?? "") : null,
      ),
      h(
        "div",
        { class: "cf-capcard-foot" },
        h("span", { class: "cf-card-w" }, L2("The aircraft waits, paused, in the slide’s situation.", "L’avion attend, en pause, dans la situation de la diapo.")),
        h("div", { class: "cf-capcard-acts" }, o.blocked ? null : capNow, fly),
      ),
    );
    this.card.replaceChildren(card);
    this.card.hidden = false;
    this.cardKind = "capture";
    this.render(this.last);
    requestAnimationFrame(() => fly.focus({ preventScroll: true }));
  }
  /** After a crash in capture mode: never a broken state, three calm ways on (the cockpit stays frozen meanwhile). */
  showCaptureCrash(o: CaptureCrash) {
    const b = (cls: string, label: string, fn: () => void, icon?: string) =>
      h("button", { type: "button", class: `cf-b ${cls}`, onclick: fn }, icon ? svgIcon(icon as keyof typeof I, 15) : null, h("span", {}, label));
    const acts: HTMLElement[] = [];
    if (o.canRewind) acts.push(b("primary", L2("Go back 10 s", "Revenir 10 s en arrière"), () => this.act.rewind?.(), I.restart));
    if (o.canRestart)
      acts.push(b(o.canRewind ? "" : "primary", L2("Start again from the slide’s situation", "Repartir de la situation de la diapo"), () => this.act.restart?.()));
    if (o.hasEditor) acts.push(b(acts.length ? "ghost" : "primary", L2("Go back to the slide", "Revenir à la diapo"), () => this.act.toEditor(), I.arrow));
    const card = h(
      "section",
      { class: "cf-card cf-capcard cf-crashcard", role: "alertdialog", "aria-modal": "false", "aria-labelledby": "cf-crash-t", "aria-describedby": "cf-crash-p" },
      h(
        "div",
        { class: "cf-capcard-main" },
        h("div", { class: "cf-card-k" }, h("span", {}, L2("Capture for the slide", "Capture pour la diapo"))),
        h("h2", { id: "cf-crash-t" }, L2("The aircraft crashed. Nothing was captured at that instant.", "L’avion s’est écrasé. Rien n’a été capturé à cet instant.")),
        h(
          "p",
          { class: "cf-card-p", id: "cf-crash-p" },
          `${o.reason}. `,
          o.kept
            ? L2(
                `Your ${o.kept} capture${o.kept > 1 ? "s" : ""} taken before ${o.kept > 1 ? "are" : "is"} kept.`,
                `${o.kept > 1 ? `Vos ${o.kept} captures prises` : "Votre capture prise"} avant ${o.kept > 1 ? "sont gardées" : "est gardée"}.`,
              )
            : L2("No capture yet: go back a little and try again.", "Aucune capture pour l’instant : revenez un peu en arrière et réessayez."),
        ),
      ),
      h("div", { class: "cf-capcard-foot" }, h("div", { class: "cf-capcard-acts" }, ...acts)),
    );
    this.card.replaceChildren(card);
    this.card.hidden = false;
    this.cardKind = "crash";
    this.render(this.last);
    requestAnimationFrame(() => acts[0]?.focus({ preventScroll: true }));
  }

  /** the cockpit's strip of captures: each one at once, with its picture and its numbers */
  readonly shelf = h("section", { class: "cf-shelf", hidden: true });
  private shelfKey = "";
  renderShelf(st: ShelfState) {
    const key = JSON.stringify([st, uiLang()]);
    if (key === this.shelfKey) return;
    this.shelfKey = key;
    const live = st.items.filter((i) => !i.removed).length;
    const show = st.items.length > 0 || !!st.notice;
    this.shelf.hidden = !show;
    this.shelf.classList.toggle("folded", st.folded);
    this.shelf.classList.toggle("has-note", st.notice?.kind === "bad");
    this.shelf.setAttribute("aria-label", L2("Your captures", "Vos captures"));
    if (!show) {
      this.shelf.replaceChildren();
      return;
    }
    const fold = h(
      "button",
      {
        type: "button",
        class: "cf-shelf-fold",
        "aria-expanded": st.folded ? "false" : "true",
        title: st.folded ? L2("Show the captures", "Montrer les captures") : L2("Fold the captures", "Replier les captures"),
        onclick: () => this.act.foldShelf?.(!st.folded),
      },
      h("b", {}, L2("Your captures", "Vos captures")),
      h("i", { class: "cf-count" }, String(live)),
      h(
        "span",
        { class: "cf-shelf-sub" },
        st.blocked
          ? L2("they cannot leave this page", "elles ne pourront pas quitter cette page")
          : live
            ? L2(`${live === 1 ? "it comes" : "they come"} back to the slide with you`, `${live === 1 ? "elle revient" : "elles reviennent"} sur la diapo avec vous`)
            : L2("none yet", "aucune pour l’instant"),
      ),
      svgIcon(st.folded ? I.chevDown : I.chevUp, 14),
    );
    const notice = st.notice ? h("p", { class: `cf-shelf-note ${st.notice.kind}`, role: st.notice.kind === "bad" ? "alert" : "status" }, st.notice.text) : null;
    const cards = st.folded
      ? null
      : h(
          "ol",
          { class: "cf-shelf-row" },
          ...st.items.map((it) => {
            if (it.removed)
              return h(
                "li",
                { class: "cf-capc removed" },
                h("span", {}, L2("Capture deleted", "Capture supprimée")),
                h("button", { type: "button", class: "cf-b", onclick: () => this.act.undoRemove?.(it.id) }, h("span", {}, L2("Undo", "Annuler"))),
              );
            const pic = h("span", { class: "cf-capc-pic" }, it.thumbUrl ? h("img", { src: it.thumbUrl, alt: L2("The instruments at that moment", "Les instruments à ce moment") }) : svgIcon(I.gauge, 22));
            return h(
              "li",
              { class: "cf-capc", "data-id": it.id },
              pic,
              h(
                "div",
                { class: "cf-capc-t" },
                h("small", {}, it.clipS ? L2(`Recording · ${it.clipS} s · ${it.time}`, `Enregistrement · ${it.clipS} s · ${it.time}`) : L2(`Moment · ${it.time}`, `Moment · ${it.time}`)),
                h("span", { class: "cf-capc-line" }, it.line),
              ),
              h(
                "div",
                { class: "cf-capc-acts" },
                st.hasEditor && !st.blocked
                  ? h("button", { type: "button", class: "cf-b primary", onclick: () => this.act.useCapture?.(it.id) }, h("span", {}, L2("Use for the slide", "Utiliser pour la diapo")))
                  : null,
                h("button", { type: "button", class: "cf-b ghost", onclick: () => this.act.removeCapture?.(it.id) }, h("span", {}, L2("Delete", "Supprimer"))),
              ),
            );
          }),
        );
    this.shelf.replaceChildren(h("div", { class: "cf-shelf-hd" }, fold, notice), ...(cards ? [cards] : []));
  }

  closeBrief(start: boolean) {
    if (this.card.hidden) return;
    this.card.hidden = true;
    this.cardKind = null;
    this.card.replaceChildren();
    this.render(this.last); // hand-over: « Vous avez les commandes »
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
