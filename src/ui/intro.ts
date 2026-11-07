// Full-screen start page shown at launch (intro v2, light "chart room" variant): what the product is (the platform
// for aviation education), a real course slide played live by our slide player as the hero, the simulator as the
// engine beside it, the lesson as a flight plan (BUILD → TEACH → BRIEF → FLY → DEBRIEF), the references the courses
// cite and an honest "not a certified FSTD" line. Paper, fine chart linework, a graduated neatline and one magenta
// course line; no photo, no gradient, no glow. Everything starts from the Flight Center, so the main action opens it
// (Enter, Esc or F2 do the same); the second opens its courses. "Don't show again" is kept in localStorage
// (ifr.intro.skip). The FR / EN toggle switches the UI language and redraws the page.
import { BRAND, brandAudience, brandEyebrow, brandKicker, brandLead, brandMarkSvg, brandTagline } from "../brand";
import { h, store } from "./dom";
import { svgIcon, I } from "./icons";
import { lang as uiLang, setLang, onLangChange } from "./i18n";
import type { DeckStage } from "../course/ui/deckStage";
import type { ProductSlide } from "../course/samples/productDeck";

export interface IntroHooks {
  /** the single way in: the Flight Center (where every flight, lesson and path starts) */
  enter: () => void;
  /** the Flight Center's courses (every slide deck); hidden when not wired */
  courses?: () => void;
}

const AUTO_MS = 6500;

export const INTRO_SKIP_KEY = "ifr.intro.skip";

/** the only picture the page loads: our own rendered PFD (public/img/credits.json: rendered by the app) */
export const INTRO_SIM_IMG = "/img/glass.jpg";

type Lang2 = "fr" | "en";
type Copy = Record<Lang2, string>;

/** Every word of the page, in both languages (tests snapshot it). No claim the code does not back. */
export const INTRO_COPY = {
  start: { fr: "Commencer", en: "Start" },
  explore: { fr: "Explorer les cours", en: "Explore courses" },
  keys: { fr: "ou", en: "or" },
  enterKey: { fr: "Entrée", en: "Enter" },
  tabCourse: { fr: "Cours", en: "Course" },
  tabSim: { fr: "Simulateur", en: "Simulator" },
  simAlt: {
    fr: "Le PFD du simulateur intégré",
    en: "The built-in simulator’s PFD",
  },
  fplHead: { fr: "Du cours au vol", en: "From course to flight" },
  fplNote: { fr: "Une leçon, cinq étapes", en: "One lesson, five legs" },
  skip: { fr: "Ne plus afficher", en: "Don’t show again" },
  refsLead: {
    fr: "Références citées dans les cours :",
    en: "References cited in the courses:",
  },
  note: {
    fr: "Entraînement procédural, non certifié FSTD",
    en: "Procedure trainer, not a certified FSTD",
  },
  deckLabel: { fr: "Un cours, joué en direct", en: "A course, played live" },
  prev: { fr: "Diapositive précédente", en: "Previous slide" },
  next: { fr: "Diapositive suivante", en: "Next slide" },
  langLabel: { fr: "Langue", en: "Language" },
  startTip: {
    fr: "Ouvrir le Flight Center : cours, leçons, vols et parcours (Entrée)",
    en: "Open the Flight Center: courses, lessons, flights and paths (Enter)",
  },
} satisfies Record<string, Copy>;

/** the five legs of a lesson, each one a real feature (slides, present mode, cockpit briefing, simulator, debrief) */
export const INTRO_LEGS: readonly { name: Copy; desc: Copy }[] = [
  {
    name: { fr: "Créer", en: "Build" },
    desc: {
      fr: "Diapositives avec instruments en direct, calculs et quiz",
      en: "Slides with live instruments, maths and quizzes",
    },
  },
  {
    name: { fr: "Enseigner", en: "Teach" },
    desc: {
      fr: "Projetées en salle ou suivies à son rythme",
      en: "Projected in class or followed at one’s own pace",
    },
  },
  {
    name: { fr: "Briefer", en: "Brief" },
    desc: {
      fr: "Le briefing se joue dans le cockpit, avant l’exercice",
      en: "The briefing plays in the cockpit, before the exercise",
    },
  },
  {
    name: { fr: "Voler", en: "Fly" },
    desc: {
      fr: "Simulateur IFR : ILS, VOR/DME, NDB, RNAV, attentes",
      en: "IFR simulator: ILS, VOR/DME, NDB, RNAV, holds",
    },
  },
  {
    name: { fr: "Débriefer", en: "Debrief" },
    desc: {
      fr: "Trajectoire rejouée, notée selon les tolérances ACS",
      en: "Flight path replayed, graded against ACS tolerances",
    },
  },
];

/** the references the sample courses cite (their slide footers and quiz sources) */
export const INTRO_REFS: Copy[] = [
  { fr: "FAA AIM", en: "FAA AIM" },
  { fr: "Instrument Flying Handbook", en: "Instrument Flying Handbook" },
  { fr: "ACS instrument", en: "Instrument Rating ACS" },
  { fr: "EASA Part-NCO", en: "EASA Part-NCO" },
];

/** "Slide 2 of 5" (the caption under the live slide, under the slide's title) */
export function introCaption(i: number, n: number, l: Lang2): string {
  return l === "fr" ? `Diapositive ${i + 1} sur ${n}` : `Slide ${i + 1} of ${n}`;
}

/** the intro is shown unless the user skipped it, a deep link asks for a flight, or a test browser drives the page
 *  (?intro=1 forces it) */
export function introWanted(
  loc: Pick<Location, "search" | "hash"> = location,
  nav: { webdriver?: boolean } = navigator,
): boolean {
  const q = new URLSearchParams(loc.search);
  if (q.get("intro") === "1") return true;
  if (
    q.get("intro") === "0" ||
    q.has("scenario") ||
    loc.hash.startsWith("#circuit=")
  )
    return false;
  if (nav.webdriver) return false;
  return !store.get(INTRO_SKIP_KEY, false);
}

/** A compass card drawn as fine chart linework (a frame, not an instrument: no needle, no bug). */
export function roseSvg(): string {
  const R = 440;
  let s = `<svg viewBox="-520 -520 1040 1040" aria-hidden="true" focusable="false"><circle r="${R}" class="r-ring"/><circle r="${R - 96}" class="r-in"/>`;
  for (let a = 0; a < 360; a += 5) {
    const big = a % 10 === 0;
    const r1 = R - (big ? 22 : 12);
    const t = (a * Math.PI) / 180;
    const f = (v: number) => v.toFixed(1);
    s += `<line class="${big ? "r-big" : "r-tick"}" x1="${f(Math.sin(t) * R)}" y1="${f(-Math.cos(t) * R)}" x2="${f(Math.sin(t) * r1)}" y2="${f(-Math.cos(t) * r1)}"/>`;
  }
  const lab: Record<number, string> = { 0: "N", 90: "E", 180: "S", 270: "W" };
  for (let a = 0; a < 360; a += 30) {
    const t = (a * Math.PI) / 180;
    const x = (Math.sin(t) * (R + 28)).toFixed(1);
    const y = (-Math.cos(t) * (R + 28)).toFixed(1);
    s += `<text x="${x}" y="${y}" transform="rotate(${a} ${x} ${y})">${lab[a] ?? String(a / 10)}</text>`;
  }
  return s + "</svg>";
}


export class Intro {
  el: HTMLElement;
  isOpen = false;
  private onKey = (e: KeyboardEvent) => this.key(e);
  private deck: DeckStage | null = null;
  private slides: ProductSlide[] = [];
  private deckSeq = 0;
  private timer = 0;
  private auto = true;
  private bar: HTMLElement | null = null;
  private offLang: (() => void) | null = null;
  private resize: ResizeObserver | null = null;

  constructor(private hooks: IntroHooks) {
    this.el = h("div", {
      class: "intro",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "intro-title",
      tabindex: -1,
    });
  }

  show() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.render();
    if (!this.el.isConnected) document.body.append(this.el);
    document.body.classList.add("intro-open");
    requestAnimationFrame(() => this.el.classList.add("open"));
    window.addEventListener("keydown", this.onKey, true);
    this.offLang = onLangChange(() => {
      if (!this.isOpen) return;
      const hadFocus = (document.activeElement as HTMLElement | null)?.dataset
        .introLang;
      this.render();
      if (hadFocus)
        this.el
          .querySelector<HTMLElement>(`[data-intro-lang="${hadFocus}"]`)
          ?.focus({ preventScroll: true });
    });
    // focus the page itself (no ring on load); Tab then reaches "Start" first
    setTimeout(() => this.el.focus({ preventScroll: true }), 60);
  }

  hide() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.stopDeck();
    this.offLang?.();
    this.offLang = null;
    this.resize?.disconnect();
    this.resize = null;
    window.removeEventListener("keydown", this.onKey, true);
    document.body.classList.remove("intro-open");
    this.el.classList.remove("open");
    this.el.classList.add("closing");
    setTimeout(() => {
      this.el.classList.remove("closing", "ready");
      this.el.remove();
    }, 260);
  }

  private go(fn: () => void) {
    this.hide();
    fn();
  }

  /** while the intro is up it owns the keyboard: nothing reaches the cockpit (Tab still moves the focus: its default is kept) */
  private key(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const onControl =
      !!t &&
      t !== document.body &&
      this.el.contains(t) &&
      (t.tagName === "BUTTON" || t.tagName === "INPUT");
    if (
      (e.key === "ArrowRight" || e.key === "ArrowLeft") &&
      this.deck &&
      !(t && t.tagName === "INPUT")
    ) {
      e.preventDefault();
      this.userMove(e.key === "ArrowRight" ? 1 : -1);
      e.stopPropagation();
      return;
    }
    if (
      (e.key === "Enter" && !onControl) ||
      e.key === "F2" ||
      e.key === "Escape"
    ) {
      e.preventDefault();
      this.go(this.hooks.enter);
    }
    e.stopPropagation();
  }

  // ---------------------------------------------------------------- the live course slide
  private stopDeck() {
    this.deckSeq++;
    window.clearTimeout(this.timer);
    this.deck?.destroy();
    this.deck = null;
  }
  private schedule() {
    window.clearTimeout(this.timer);
    if (
      !this.auto ||
      !this.deck ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    this.timer = window.setTimeout(() => {
      const d = this.deck;
      if (!d || !this.isOpen) return;
      d.go(d.atEnd ? 0 : d.index + 1);
      this.schedule();
    }, AUTO_MS);
  }
  /** a move by the viewer stops the slideshow (it never moves under their eyes again) */
  private userMove(dir: 1 | -1 | number, abs = false) {
    const d = this.deck;
    if (!d) return;
    this.auto = false;
    window.clearTimeout(this.timer);
    if (abs) d.go(dir);
    else if (dir > 0) {
      if (!d.next()) d.go(0);
    } else d.prev();
  }
  private renderBar() {
    const d = this.deck;
    const bar = this.bar;
    if (!bar || !d) return;
    const l: Lang2 = uiLang() === "fr" ? "fr" : "en";
    const s = this.slides[d.index];
    const title = s ? (l === "fr" ? s.title.fr || s.title.en : s.title.en) : "";
    bar.replaceChildren(
      h(
        "button",
        {
          class: "intro-nb",
          type: "button",
          "aria-label": INTRO_COPY.prev[l],
          disabled: d.index === 0,
          onclick: () => this.userMove(-1),
        },
        svgIcon(I.arrow, 16),
      ),
      h(
        "button",
        {
          class: "intro-nb next",
          type: "button",
          "aria-label": INTRO_COPY.next[l],
          onclick: () => this.userMove(1),
        },
        svgIcon(I.arrow, 16),
      ),
      d.segments((i) => this.userMove(i, true)),
      h(
        "span",
        { class: "intro-cap-t", "aria-live": "polite" },
        h("b", {}, title),
        h("small", { class: "num" }, introCaption(d.index, d.count, l)),
      ),
    );
    // the VOLER leg lights up while the deck shows its simulator slide
    const flying = !!s && s.id === "p-fly";
    this.el.querySelector(".intro-wp.is-fly")?.classList.toggle("lit", flying);
  }
  private mountDeck(stage: HTMLElement) {
    this.stopDeck();
    this.auto = true;
    const seq = this.deckSeq;
    const l: Lang2 = uiLang() === "fr" ? "fr" : "en";
    void Promise.all([
      import("../course/ui/deckStage"),
      import("../course/samples/productDeck"),
    ])
      .then(([m, p]) => {
        if (seq !== this.deckSeq || !this.isOpen) return;
        // open on the live instrument (the most visual slide); the cover comes back round at the end
        const all = p.productDeck();
        this.slides = [...all.slice(1), ...all.slice(0, 1)];
        this.deck = m.mountDeck(stage, {
          lang: l,
          slides: this.slides,
          theme: "classroom",
          revealAll: true,
          onChange: () => this.renderBar(),
        });
        stage.classList.add("ready");
        this.el.classList.add("ready");
        this.renderBar();
        this.schedule();
      })
      .catch(() => {
        stage.closest(".intro-screen")?.classList.add("is-off");
        this.el.classList.add("ready");
      });
  }

  private render() {
    this.stopDeck();
    this.resize?.disconnect();
    const l: Lang2 = uiLang() === "fr" ? "fr" : "en";
    const C = (k: keyof typeof INTRO_COPY) => INTRO_COPY[k][l];
    const coarse = matchMedia("(pointer: coarse)").matches;
    const skip = h("input", {
      type: "checkbox",
      checked: store.get(INTRO_SKIP_KEY, false),
      onchange: (e: Event) =>
        store.set(INTRO_SKIP_KEY, (e.target as HTMLInputElement).checked),
    });
    const langBtn = (v: Lang2, label: string) =>
      h(
        "button",
        {
          type: "button",
          class: l === v ? "on" : "",
          role: "radio",
          "aria-checked": l === v ? "true" : "false",
          lang: v,
          "data-intro-lang": v,
          onclick: () => setLang(v),
        },
        label,
      );
    const stage = h("div", {
      class: "intro-stage",
      role: "group",
      "aria-label": C("deckLabel"),
    });
    this.bar = h("div", { class: "intro-cap" });
    const slideScreen = h(
      "div",
      { class: "intro-screen is-slide" },
      h("span", { class: "intro-tab" }, C("tabCourse")),
      stage,
    );
    const sim = h("img", {
      src: INTRO_SIM_IMG,
      alt: C("simAlt"),
      decoding: "async",
      width: 1400,
      height: 920,
    });
    // the PFD fades in once decoded (never a black box while it loads)
    const shown = () => sim.classList.add("ok");
    if (sim.complete && sim.naturalWidth) shown();
    else sim.addEventListener("load", shown, { once: true });
    const simScreen = h(
      "figure",
      { class: "intro-screen is-sim" },
      h("span", { class: "intro-tab" }, C("tabSim")),
      sim,
    );
    const stack = h("div", { class: "intro-stack" }, slideScreen, simScreen);
    const legs = h(
      "ol",
      { class: "intro-legs" },
      ...INTRO_LEGS.map((g, i) =>
        h(
          "li",
          { class: `intro-wp${i === 3 ? " is-fly" : ""}`, style: `--i:${i}` },
          h("span", { class: "intro-dot", "aria-hidden": "true" }),
          h(
            "span",
            { class: "intro-wp-n" },
            h("span", { class: "num" }, `0${i + 1}`),
            h("b", {}, g.name[l]),
          ),
          h("p", {}, g.desc[l]),
        ),
      ),
    );
    this.el.lang = l;
    this.el.replaceChildren(
      h(
        "div",
        { class: "intro-frame" },
        h("span", { class: "intro-grad t", "aria-hidden": "true" }),
        h("span", { class: "intro-grad b", "aria-hidden": "true" }),
        h("span", { class: "intro-grad l", "aria-hidden": "true" }),
        h("span", { class: "intro-grad r", "aria-hidden": "true" }),
        h(
          "header",
          { class: "intro-top" },
          h(
            "div",
            { class: "intro-brand" },
            h("span", { class: "intro-mark", html: brandMarkSvg(30) }),
            h("b", {}, BRAND.name),
            h("i", {}, brandKicker(l)),
          ),
          h(
            "div",
            {
              class: "intro-lang",
              role: "radiogroup",
              "aria-label": C("langLabel"),
            },
            langBtn("fr", "FR"),
            langBtn("en", "EN"),
          ),
        ),
        h(
          "section",
          { class: "intro-hero" },
          h(
            "div",
            { class: "intro-txt" },
            h("div", { class: "intro-eyebrow" }, brandEyebrow(l)),
            h("h1", { id: "intro-title" }, brandTagline(l)),
            h("p", { class: "intro-lead" }, brandLead(l)),
            h("p", { class: "intro-aud" }, brandAudience(l)),
            h(
              "div",
              { class: "intro-acts" },
              h(
                "button",
                {
                  class: "intro-go",
                  type: "button",
                  onclick: () => this.go(this.hooks.enter),
                  title: C("startTip"),
                },
                C("start"),
                svgIcon(I.arrow, 18),
              ),
              this.hooks.courses
                ? h(
                    "button",
                    {
                      class: "intro-alt",
                      type: "button",
                      onclick: () => this.go(this.hooks.courses!),
                    },
                    C("explore"),
                  )
                : null,
              // the keyboard hint only where there is a keyboard (not on a touch-only tablet)
              coarse
                ? null
                : h(
                    "span",
                    { class: "intro-keys" },
                    `${C("keys")} `,
                    h("kbd", {}, C("enterKey")),
                  ),
            ),
          ),
          h(
            "div",
            { class: "intro-scope" },
            h("div", {
              class: "intro-rose",
              "aria-hidden": "true",
              html: roseSvg(),
            }),
            stack,
            this.bar,
          ),
        ),
        h(
          "section",
          { class: "intro-fpl", "aria-labelledby": "intro-fpl-t" },
          h(
            "div",
            { class: "intro-fpl-h" },
            h("span", { id: "intro-fpl-t" }, C("fplHead")),
            h("em", {}, C("fplNote")),
          ),
          legs,
        ),
        h(
          "footer",
          { class: "intro-foot" },
          h("label", { class: "intro-skip" }, skip, h("span", {}, C("skip"))),
          h(
            "span",
            { class: "intro-refs" },
            `${C("refsLead")} `,
            ...INTRO_REFS.flatMap((r, i) => [i ? " · " : "", h("b", {}, r[l])]),
          ),
          h("span", { class: "intro-note" }, C("note")),
        ),
      ),
    );
    // the simulator screen tucks under the slide's bottom-right corner: its top follows the slide's height
    const scope = stack.parentElement as HTMLElement;
    this.resize = new ResizeObserver(() => {
      const hs = slideScreen.getBoundingClientRect().height;
      const hm = simScreen.getBoundingClientRect().height;
      if (!hs) return;
      scope.style.setProperty("--slide-h", `${hs}px`);
      const capBottom = hs + this.bar!.getBoundingClientRect().height + 14;
      scope.style.setProperty("--stack-h", `${Math.max(hs * 0.93 + hm, capBottom)}px`);
    });
    this.resize.observe(slideScreen);
    this.resize.observe(simScreen);
    this.mountDeck(stage);
  }
}
