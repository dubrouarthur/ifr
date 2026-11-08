// Full-screen start page shown at launch ("story": one reading order, one object, one action). Left: what it is
// (the tagline), one sentence (slides plus a simulator; build, teach, fly: the only "story"), who it is for
// (students, instructors, clubs and schools; the programmes), then one filled button (Commencer) and a quiet text
// link (Explorer les cours). Right: one screen, one real course slide for a PPL student (the airspeed indicator's
// arcs) drawn by our slide player. It is a picture: passive (inert), it never moves on by itself. Footer: don't
// show again, the references the courses cite, "not a certified FSTD".
// Everything starts from the Flight Center, so the main action opens it (Enter, Esc or F2 do the same); the link
// opens its courses. While the page is open everything behind it is inert, so Tab stays on the page and no hidden
// control can be reached. "Don't show again" is kept in localStorage (ifr.intro.skip). The FR / EN toggle switches
// the UI language and redraws the page. Styles: src/styles/ui-landing.css.
import {
  BRAND,
  brandLead,
  brandMarkSvg,
  brandProgrammes,
  brandTagline,
  brandWho,
} from "../brand";
import { h, store } from "./dom";
import { svgIcon, I } from "./icons";
import { lang as uiLang, setLang, onLangChange } from "./i18n";
import type { DeckStage } from "../course/ui/deckStage";

export interface IntroHooks {
  /** the single way in: the Flight Center (where every flight, lesson and path starts) */
  enter: () => void;
  /** the Flight Center's courses (every slide deck); hidden when not wired */
  courses?: () => void;
  /** after the page has closed, whichever way (the app boots what it held back while the page was up) */
  closed?: () => void;
}

export const INTRO_SKIP_KEY = "ifr.intro.skip";

/** the slide the screen shows (by id, src/course/samples/productDeck.ts) */
export const INTRO_SLIDE = "p-asi";

type Lang2 = "fr" | "en";
type Copy = Record<Lang2, string>;

/** Every word of the page, in both languages (tests snapshot it). No claim the code does not back. */
export const INTRO_COPY = {
  start: { fr: "Commencer", en: "Start" },
  explore: { fr: "Explorer les cours", en: "Explore courses" },
  skip: { fr: "Ne plus afficher", en: "Don’t show again" },
  refsLead: { fr: "Sources des cours\u00a0:", en: "Sources:" },
  note: {
    fr: "Entraînement procédural, non certifié FSTD",
    en: "Procedure trainer, not a certified FSTD",
  },
  deckLabel: {
    fr: "Une diapositive de cours : les arcs de l’anémomètre, avec l’instrument du simulateur",
    en: "A course slide: the airspeed indicator’s arcs, with the simulator’s own instrument",
  },
  langLabel: { fr: "Langue", en: "Language" },
  startTip: {
    fr: "Ouvrir le Flight Center : cours, leçons, vols et parcours (Entrée)",
    en: "Open the Flight Center: courses, lessons, flights and paths (Enter)",
  },
} satisfies Record<string, Copy>;

/** the references the library's courses cite (their slide footers and quiz sources), grouped by authority */
export const INTRO_REFS: readonly { org: string; docs: string }[] = [
  { org: "FAA", docs: "PHAK, AIM, IFH, ACS" },
  { org: "EASA", docs: "Part-FCL, Part-NCO" },
];

/** set for the browser session once the page has been shown (sessionStorage): it is a welcome, not a gate */
export const INTRO_SEEN_KEY = "ifr.intro.seen";

function sessionSeen(): boolean {
  try {
    return sessionStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}
function markSessionSeen() {
  try {
    sessionStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    /* storage blocked */
  }
}

/** the intro is shown once per browser session, unless the user skipped it for good, a deep link asks for a flight,
 *  the user comes back from a course (the academy page), or a test browser drives the page (?intro=1 forces it) */
export function introWanted(
  loc: Pick<Location, "search" | "hash"> = location,
  nav: { webdriver?: boolean } = navigator,
  referrer: string = typeof document !== "undefined" ? document.referrer : "",
  seen: boolean = sessionSeen(),
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
  // a round trip from a course (academy.html) or a second visit in the same session goes straight to the app
  if (seen || /\/academy\.html(?:[?#]|$)/.test(referrer)) return false;
  return !store.get(INTRO_SKIP_KEY, false);
}

/** the part of an element inertOthers needs (an HTMLElement; a plain object in the tests) */
export interface InertTarget {
  inert: boolean;
}
/** Makes every child of `parent` but `keep` inert (no focus, no click, hidden from assistive tech: a modal page
 *  that Tab cannot leave) and returns the undo, which restores only the ones it changed. Pure over its input. */
export function inertOthers<T extends InertTarget>(
  children: Iterable<T>,
  keep: T,
): () => void {
  const changed: T[] = [];
  for (const c of children)
    if (c !== keep && !c.inert) {
      c.inert = true;
      changed.push(c);
    }
  return () => {
    for (const c of changed) c.inert = false;
  };
}

const CHEVRON =
  '<svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M8 5l5 5-5 5"/></svg>';

export class Intro {
  el: HTMLElement;
  isOpen = false;
  private onKey = (e: KeyboardEvent) => this.key(e);
  private deck: DeckStage | null = null;
  private seq = 0;
  private offLang: (() => void) | null = null;
  private unInert: (() => void) | null = null;

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
    // a real modal: everything behind the page is inert (Tab never reaches the cockpit, a click never lands there)
    this.unInert?.();
    this.unInert = inertOthers(
      Array.from(document.body.children) as HTMLElement[],
      this.el,
    );
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
    markSessionSeen();
    this.teardown();
    this.offLang?.();
    this.offLang = null;
    this.unInert?.();
    this.unInert = null;
    window.removeEventListener("keydown", this.onKey, true);
    document.body.classList.remove("intro-open");
    this.el.classList.remove("open");
    this.el.classList.add("closing");
    setTimeout(() => {
      this.el.classList.remove("closing", "ready");
      this.el.remove();
    }, 260);
    this.hooks.closed?.();
  }

  private leave(fn: () => void) {
    this.hide();
    fn();
  }

  /** while the intro is up it owns the keyboard: nothing reaches the cockpit (Tab, Space and Enter keep their
   *  default on the page's own controls; everything behind the page is inert) */
  private key(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const onControl =
      !!t &&
      t !== document.body &&
      this.el.contains(t) &&
      (t.tagName === "BUTTON" || t.tagName === "INPUT");
    // Tab wraps inside the page (the background is inert; this also keeps the focus off the browser's own chrome)
    if (e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const f = Array.from(
        this.el.querySelectorAll<HTMLElement>("button, input"),
      ).filter((x) => !x.closest("[inert]") && x.offsetParent !== null);
      if (f.length) {
        const i = f.indexOf(t as HTMLElement);
        const to = e.shiftKey
          ? i <= 0
            ? f[f.length - 1]
            : null
          : i === f.length - 1 || i < 0
            ? f[0]
            : null;
        if (to) {
          e.preventDefault();
          to.focus();
        }
      }
      e.stopPropagation();
      return;
    }
    if (
      (e.key === "Enter" && !onControl) ||
      e.key === "F2" ||
      e.key === "Escape"
    ) {
      e.preventDefault();
      this.leave(this.hooks.enter);
    } else if (e.key === " " && !onControl) e.preventDefault();
    e.stopPropagation();
  }

  private teardown() {
    this.seq++;
    this.deck?.destroy();
    this.deck = null;
  }

  /** the slide player and the slide load on demand; the screen fades in once the slide is drawn */
  private mountSlide(host: HTMLElement) {
    const seq = this.seq;
    const l: Lang2 = uiLang() === "fr" ? "fr" : "en";
    void Promise.all([
      import("../course/ui/deckStage"),
      import("../course/samples/productDeck"),
    ])
      .then(([m, p]) => {
        if (seq !== this.seq || !this.isOpen) return;
        const s = p.productDeck().find((x) => x.id === INTRO_SLIDE);
        if (!s) return;
        this.deck = m.mountDeck(host, {
          lang: l,
          slides: [s],
          theme: "classroom",
          revealAll: true,
        });
      })
      .catch(() => undefined)
      .finally(() => {
        if (seq === this.seq && this.isOpen) this.el.classList.add("ready");
      });
  }

  private render() {
    this.teardown();
    this.el.classList.remove("ready");
    const l: Lang2 = uiLang() === "fr" ? "fr" : "en";
    const C = (k: keyof typeof INTRO_COPY) => INTRO_COPY[k][l];
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
          "aria-pressed": l === v ? "true" : "false",
          lang: v,
          "data-intro-lang": v,
          onclick: () => {
            if (v !== l) setLang(v);
          },
        },
        label,
      );

    // the screen: one course slide, a picture of the product (inert: no tab stop, no click inside it)
    const stage = h("div", {
      class: "intro-stage",
      inert: true,
      "aria-hidden": "true",
    });
    const screen = h(
      "div",
      { class: "intro-screen", role: "img", "aria-label": C("deckLabel") },
      stage,
    );

    this.el.lang = l;
    this.el.replaceChildren(
      h(
        "div",
        { class: "intro-page" },
        h(
          "main",
          { class: "intro-hero" },
          h(
            "section",
            { class: "intro-txt" },
            h("h1", { id: "intro-title" }, brandTagline(l)),
            h("p", { class: "intro-lead" }, brandLead(l)),
            h(
              "p",
              { class: "intro-who" },
              h("b", {}, brandWho(l)),
              h("span", {}, brandProgrammes(l)),
            ),
            h(
              "div",
              { class: "intro-acts" },
              h(
                "button",
                {
                  class: "intro-go",
                  type: "button",
                  onclick: () => this.leave(this.hooks.enter),
                  title: C("startTip"),
                },
                h("span", {}, C("start")),
                svgIcon(I.arrow, 18),
              ),
              this.hooks.courses
                ? h(
                    "button",
                    {
                      class: "intro-more",
                      type: "button",
                      onclick: () => this.leave(this.hooks.courses!),
                    },
                    h("span", {}, C("explore")),
                    h("span", { class: "intro-chev", html: CHEVRON }),
                  )
                : null,
            ),
          ),
          h("section", { class: "intro-show" }, screen),
        ),
        // the top bar comes after the hero in the focus order (Tab reaches "Start" first); the grid draws it on top
        h(
          "header",
          { class: "intro-top" },
          h(
            "div",
            { class: "intro-brand" },
            h("span", { class: "intro-mark", html: brandMarkSvg(28) }),
            h("b", {}, BRAND.name),
          ),
          h(
            "div",
            {
              class: "intro-lang",
              role: "group",
              "aria-label": C("langLabel"),
            },
            langBtn("fr", "FR"),
            langBtn("en", "EN"),
          ),
        ),
        h(
          "footer",
          { class: "intro-foot" },
          h("label", { class: "intro-skip" }, skip, h("span", {}, C("skip"))),
          h(
            "span",
            { class: "intro-refs" },
            `${C("refsLead")} `,
            ...INTRO_REFS.flatMap((r, i) => [
              i ? " · " : "",
              h("b", {}, `${r.org} ${r.docs}`),
            ]),
          ),
          h("span", { class: "intro-note" }, C("note")),
        ),
      ),
    );
    this.mountSlide(stage);
  }
}
