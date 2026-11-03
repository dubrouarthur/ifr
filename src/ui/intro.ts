// Full-screen start page shown at launch, before the Flight Center: one photo, the product name, one promise,
// one obvious way to start. Enter starts a flight; F2 / Esc opens the Flight Center. "Skip this screen" is kept in
// localStorage (ifr.intro.skip).
import { h, store } from "./dom";
import { svgIcon, I } from "./icons";

export interface IntroHooks {
  /** primary action: plan a new flight (the real-world planner) */
  start: () => void;
  /** secondary action: the Flight Center */
  flightCenter: () => void;
  /** the last flight, when there is one to continue */
  resume?: { label: string; go: () => void } | null;
}

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
    if (e.key === "Enter" && !onControl) {
      e.preventDefault();
      this.go(this.hooks.start);
    } else if (e.key === "F2" || e.key === "Escape") {
      e.preventDefault();
      this.go(this.hooks.flightCenter);
    }
    e.stopPropagation();
  }

  private render() {
    const skip = h("input", {
      type: "checkbox",
      checked: store.get(INTRO_SKIP_KEY, false),
      onchange: (e: Event) =>
        store.set(INTRO_SKIP_KEY, (e.target as HTMLInputElement).checked),
    });
    const r = this.hooks.resume;
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
          { class: "intro-brand" },
          h("img", { src: "/favicon.svg", alt: "", width: 40, height: 40 }),
          h("span", {}, "Instrument flight training"),
        ),
        h("h1", { id: "intro-title" }, "IFR Trainer"),
        h(
          "p",
          { class: "intro-lead" },
          "Real procedures, real weather and a coach in the right seat — from your first hold to the checkride.",
        ),
        h(
          "div",
          { class: "intro-acts" },
          h(
            "button",
            {
              class: "intro-go",
              type: "button",
              onclick: () => this.go(this.hooks.start),
            },
            "Start a flight",
            svgIcon(I.arrow, 18),
          ),
          h(
            "button",
            {
              class: "intro-alt",
              type: "button",
              onclick: () => this.go(this.hooks.flightCenter),
              title: "Every flight, exercise and learning path (F2)",
            },
            svgIcon(I.plane, 17),
            "Flight Center",
          ),
          r
            ? h(
                "button",
                {
                  class: "intro-alt intro-resume",
                  type: "button",
                  onclick: () => this.go(r.go),
                  title: `Continue: ${r.label}`,
                },
                svgIcon(I.restart, 16),
                h("span", {}, h("small", {}, "Continue"), h("b", {}, r.label)),
              )
            : null,
        ),
        h(
          "p",
          { class: "intro-keys" },
          h("kbd", {}, "Enter"),
          " start a flight",
          h("span", { class: "intro-dot" }, "·"),
          h("kbd", {}, "F2"),
          " Flight Center",
        ),
      ),
      h(
        "footer",
        { class: "intro-foot" },
        h(
          "label",
          { class: "intro-skip" },
          skip,
          h("span", {}, "Skip this screen next time"),
        ),
        h(
          "a",
          {
            class: "intro-credit",
            href: "https://www.rawpixel.com/image/5949278/free-public-domain-cc0-photo",
            target: "_blank",
            rel: "noopener",
          },
          "Photo: rawpixel · CC0",
        ),
      ),
    );
  }
}
