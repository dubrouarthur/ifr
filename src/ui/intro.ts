// Full-screen start page shown at launch: the product name, one promise and a short slide deck about the product,
// played by our slide player (the slides are the product's flagship, SPEC slides v2 §12). Everything starts from
// the Flight Center, so the main action opens it (Enter, Esc or F2 do the same); the second opens its courses.
// "Skip this screen" is kept in localStorage (ifr.intro.skip).
import { BRAND, brandTagline } from "../brand";
import { h, store } from "./dom";
import { svgIcon, I } from "./icons";
import { lang as uiLang } from "./i18n";
import type { DeckStage } from "../course/ui/deckStage";

export interface IntroHooks {
  /** the single way in: the Flight Center (where every flight, lesson and path starts) */
  enter: () => void;
  /** the Flight Center's courses (every slide deck); hidden when not wired */
  courses?: () => void;
}

const AUTO_MS = 6500;

export const INTRO_SKIP_KEY = "ifr.intro.skip";

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

export class Intro {
  el: HTMLElement;
  isOpen = false;
  private onKey = (e: KeyboardEvent) => this.key(e);
  private deck: DeckStage | null = null;
  private deckSeq = 0;
  private timer = 0;
  private auto = true;
  private bar: HTMLElement | null = null;

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
    // the photo fades in once decoded, so the page never flashes a half-loaded image
    const img = this.el.querySelector("img");
    const ready = () => this.el.classList.add("ready");
    if (img?.complete) ready();
    else img?.addEventListener("load", ready, { once: true });
    img?.addEventListener("error", ready, { once: true });
    requestAnimationFrame(() => this.el.classList.add("open"));
    window.addEventListener("keydown", this.onKey, true);
    // focus the page itself (no ring on load); Tab then reaches "Start a flight" first
    setTimeout(() => this.el.focus({ preventScroll: true }), 60);
  }

  hide() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.stopDeck();
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
    if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && this.deck && !(t && t.tagName === "INPUT")) {
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

  // ---------------------------------------------------------------- the deck about the product
  private stopDeck() {
    this.deckSeq++;
    window.clearTimeout(this.timer);
    this.deck?.destroy();
    this.deck = null;
  }
  private schedule() {
    window.clearTimeout(this.timer);
    if (!this.auto || !this.deck || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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
    const fr = uiLang() === "fr";
    bar.replaceChildren(
      d.segments((i) => this.userMove(i, true)),
      h("span", { class: "intro-deck-n num" }, `${d.index + 1} / ${d.count}`),
      h("span", { class: "intro-deck-sp" }),
      h("button", { class: "intro-deck-b", type: "button", "aria-label": fr ? "Diapositive précédente" : "Previous slide", disabled: d.index === 0, onclick: () => this.userMove(-1) }, svgIcon(I.arrow, 18)),
      h("button", { class: "intro-deck-b next", type: "button", "aria-label": fr ? "Diapositive suivante" : "Next slide", onclick: () => this.userMove(1) }, svgIcon(I.arrow, 18)),
    );
  }
  private mountDeck(stage: HTMLElement) {
    this.stopDeck();
    this.auto = true;
    const seq = this.deckSeq;
    const l = uiLang() === "fr" ? "fr" : "en";
    void Promise.all([import("../course/ui/deckStage"), import("../course/samples/productDeck")])
      .then(([m, p]) => {
        if (seq !== this.deckSeq || !this.isOpen) return;
        this.deck = m.mountDeck(stage, {
          lang: l,
          slides: p.productDeck(),
          theme: "cockpit",
          revealAll: true,
          onChange: () => this.renderBar(),
        });
        stage.classList.add("ready");
        this.renderBar();
        this.schedule();
      })
      .catch(() => stage.closest(".intro-deck")?.remove());
  }

  private render() {
    const fr = uiLang() === "fr";
    const L = (en: string, frText: string) => (fr ? frText : en);
    const skip = h("input", {
      type: "checkbox",
      checked: store.get(INTRO_SKIP_KEY, false),
      onchange: (e: Event) =>
        store.set(INTRO_SKIP_KEY, (e.target as HTMLInputElement).checked),
    });
    const stage = h("div", { class: "intro-stage", role: "group", "aria-label": L("A short tour of the product, in slides", "Un court aperçu du produit, en diapositives") });
    this.bar = h("div", { class: "intro-deck-bar" });
    this.el.replaceChildren(
      h("img", {
        class: "intro-photo",
        src: "/img/departure.jpg",
        alt: "",
        decoding: "async",
        fetchpriority: "high",
      }),
      h("div", { class: "intro-scrim", "aria-hidden": "true" }),
      h(
        "main",
        { class: "intro-main" },
        h(
          "div",
          { class: "intro-txt" },
          h(
            "div",
            { class: "intro-brand" },
            h("img", { src: "/favicon.svg", alt: "", width: 36, height: 36 }),
            h("span", {}, L("Instrument flight training", "Formation au vol aux instruments")),
          ),
          h("h1", { id: "intro-title" }, BRAND.name),
          h("p", { class: "intro-lead" }, brandTagline(fr ? "fr" : "en")),
          h(
            "div",
            { class: "intro-acts" },
            h(
              "button",
              {
                class: "intro-go",
                type: "button",
                onclick: () => this.go(this.hooks.enter),
                title: L(
                  "Open the Flight Center: courses, lessons, flights and paths (Enter)",
                  "Ouvrir le Flight Center : cours, leçons, vols et parcours (Entrée)",
                ),
              },
              L("Get started", "Commencer"),
              svgIcon(I.arrow, 18),
            ),
            this.hooks.courses
              ? h(
                  "button",
                  { class: "intro-alt", type: "button", onclick: () => this.go(this.hooks.courses!) },
                  svgIcon(I.slides, 18),
                  L("Browse the courses", "Voir les cours"),
                )
              : null,
          ),
          // the keyboard hint only where there is a keyboard (not on a touch-only tablet)
          matchMedia("(pointer: coarse)").matches
            ? null
            : h(
                "span",
                { class: "intro-keys" },
                L("or press ", "ou appuyez sur "),
                h("kbd", {}, L("Enter", "Entrée")),
              ),
        ),
        h("section", { class: "intro-deck", "aria-label": L("The slides", "Les diapositives") }, stage, this.bar),
      ),
      h(
        "footer",
        { class: "intro-foot" },
        h(
          "label",
          { class: "intro-skip" },
          skip,
          h("span", {}, L("Skip this screen next time", "Ne plus afficher cet écran")),
        ),
        h(
          "a",
          {
            class: "intro-credit",
            href: "https://unsplash.com/photos/a-small-plane-is-flying-low-to-the-ground-nLLXwSShKtA",
            target: "_blank",
            rel: "noopener",
          },
          "Photo: Marko Pavlichenko · Unsplash",
        ),
      ),
    );
    this.mountDeck(stage);
  }
}
