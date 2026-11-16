// The start page (« Page de démarrage », UX logic §1), shown on the first visit of a browser session. It is centred
// on the one thing Wingdeck is for: slides for aviation, built and shared by instructors, with real aviation tools
// inside. A newcomer reads it in five seconds and sees one next step:
//   1. hero: « Des cours d'aviation qui volent », one sentence (what it is, for whom), ONE filled action « Créer un
//      cours » (academy.html#new), a secondary « Découvrir les cours » (the library) and a quiet door to the
//      simulator, presented as what makes the slides alive. Beside it a large LIVE slide drawn by the app's own slide
//      renderer (course/canvas/render.ts): the G1000 PFD flies on its autopilot and its control strip works right
//      there (turn the heading knob: the aircraft follows);
//   2. « Créez. Partagez. Faites voler. »: three short beats, each with a live mini-slide (a needle that moves by
//      itself, a template's cover, a student's « À vous » with its control strip), drawn when they come near;
//   3. ready courses: the four short decks of the library with thumbnails drawn from their own slides, and the
//      library's formations with their counts;
//   4. the closing card: the same two actions, the AI assistant as a helper (a first draft, the user's own key),
//      « Ne plus afficher… », and the honest note (procedure training, not a certified FSTD).
// A slim sticky bar holds the brand, FR | EN, « Passer » and a « Créer un cours » that shows only while neither
// in-page one is on screen (one filled button per screen). Esc or F2 closes the page to Accueil. While the page is
// open everything behind it is inert and the 3D world is held back (main.ts). No picture is a screenshot: every
// slide is the renderer's, so the page never goes stale. Styles: src/styles/ui-landing.css.
import { BRAND, brandMarkSvg } from "../brand";
import { h, store } from "./dom";
import { lang as uiLang, setLang, onLangChange } from "./i18n";
import type { SlideView } from "../course/canvas/render";

export interface IntroHooks {
  /** « Passer », Esc, F2: Accueil (it focuses its own h1) */
  enter: () => void;
  /** « Découvrir les cours »: the library (academy.html#library when not wired) */
  courses?: () => void;
  /** after the page has closed, whichever way (the app boots what it held back while the page was up) */
  closed?: () => void;
}

export const INTRO_SKIP_KEY = "ifr.intro.skip";

type Lang2 = "fr" | "en";

/** The deep links the page opens (the app's own routes, UX logic §1). */
export const INTRO_LINKS = {
  newCourse: "academy.html#new",
  library: "academy.html#library",
  ppl: "academy.html#library&p=ppl",
  night: "academy.html#library&p=night",
  ir: "academy.html#library&p=ir",
  atpl: "academy.html#library&p=atpl",
  /** the simulator place of this page (main.ts follows the hash) */
  simulator: "#simulateur",
} as const;

/** A ready deck of the library, opened in the player. */
export const deckLink = (id: string): string =>
  `academy.html#play=${encodeURIComponent(id)}`;

/** The page's actions, in their order of weight: one primary, one secondary, one quiet door. */
export const INTRO_ACTIONS = {
  primary: INTRO_LINKS.newCourse,
  secondary: INTRO_LINKS.library,
  tertiary: INTRO_LINKS.simulator,
} as const;

/** What the library holds, as its landing shows it (src/library/model shelves(); tests/intro.test.ts keeps these in
 *  step with the live model): items per formation and its number of subjects, and the whole library. */
export const INTRO_COUNTS = {
  total: 134,
  ppl: { n: 64, s: 15 },
  night: { n: 22, s: 4 },
  ir: { n: 96, s: 7 },
  atpl: { n: 8, s: 13 },
  club: { n: 4 },
} as const;

/** The formations the page links to, in training order. */
export const INTRO_PROGS = ["ppl", "night", "ir", "atpl"] as const;

/** The ready decks the page shows (src/course/samples/decks: playable at #play=<id>, in the library). */
export const INTRO_DECKS = [
  "sample-deck-basic-instruments",
  "sample-deck-standard-turn-scan",
  "sample-deck-vor-intercept",
  "sample-deck-ils-end-to-end",
] as const;

interface BeatText {
  /** the verb */
  h: string;
  p: string;
}
export interface IntroText {
  langLabel: string;
  skipBtn: string;
  skipTip: string;
  eyebrow: string;
  h1: string;
  lead: string;
  who: string;
  create: string;
  discover: string;
  simDoor: readonly [string, string];
  heroLabel: string;
  heroCap: readonly [string, string];
  beatsH: string;
  beats: readonly [BeatText, BeatText, BeatText];
  decksH: string;
  decksP: string;
  slidesN: string;
  progsLabel: string;
  progs: Record<(typeof INTRO_PROGS)[number], string>;
  itemsN: string;
  libAll: string;
  loading: string;
  finH: string;
  finP: string;
  ai: readonly [string, string];
  skip: string;
  again: string;
  note: string;
  noteTip: string;
}

/** French typography: a no-break space before « : ; ? ! » and inside « guillemets » (a colon or a closing
 *  guillemet never starts a line). Pure; keeps the shape. */
export function frTypo<T>(o: T): T {
  if (typeof o === "string")
    return o
      .replace(/ ([:;?!»])/g, "\u00a0$1")
      .replace(/« /g, "«\u00a0") as unknown as T;
  if (Array.isArray(o)) return o.map((x) => frTypo(x)) as unknown as T;
  if (o && typeof o === "object")
    return Object.fromEntries(
      Object.entries(o).map(([k, v]) => [k, frTypo(v)]),
    ) as T;
  return o;
}

const FR: IntroText = frTypo({
  langLabel: "Langue",
  skipBtn: "Passer",
  skipTip: "Passer la présentation et aller à l’Accueil (Échap)",
  eyebrow: "Diapositives pour l’aviation",
  h1: "Des cours d’aviation qui volent",
  lead: "Créez et partagez vos cours en diapositives, avec de vrais outils d’aviation dedans : instruments en direct, simulateur de vol, calculs.",
  who: "Pour les instructeurs, les aéroclubs, les écoles de pilotage et leurs élèves.",
  create: "Créer un cours",
  discover: "Découvrir les cours",
  simDoor: [
    "Le simulateur intégré donne vie à vos diapos.",
    "Ouvrir le simulateur",
  ],
  heroLabel: "Une diapositive Wingdeck, en direct",
  heroCap: [
    "Cette diapo est en direct.",
    "Tournez le bouton de cap : l’avion suit.",
  ],
  beatsH: "Créez. Partagez. Faites voler.",
  beats: [
    {
      h: "Créez",
      p: "Posez un instrument sur la diapo, choisissez sa situation : il bouge tout seul. Ou partez d’un modèle déjà mis en page.",
    },
    {
      h: "Présentez, partagez",
      p: "En salle, « Présenter » : vous pilotez la démonstration, le projecteur suit. « Partager » : un lien ou un fichier de cours pour vos élèves ou votre club.",
    },
    {
      h: "Faites voler",
      p: "« À vous » : l’élève prend les commandes sur la diapo, vole la leçon dans le simulateur, puis revient au cours.",
    },
  ],
  decksH: "Des cours prêts à présenter",
  decksP:
    "Ouvrez-les tels quels, ou dupliquez-les pour les adapter à votre leçon.",
  slidesN: "{n} diapos",
  progsLabel: "Toute la bibliothèque, par formation",
  progs: {
    ppl: "LAPL · PPL",
    night: "Vol de nuit",
    ir: "IR",
    atpl: "Théorie ATPL",
  },
  itemsN: "{n} éléments",
  libAll: "Toute la bibliothèque",
  loading: "Chargement des diapositives…",
  finH: "Créez votre premier cours",
  finP: "Partez d’un modèle déjà mis en page ou d’une page vierge. Tout se modifie ensuite.",
  ai: [
    "Assistant IA.",
    "Il prépare un premier jet de vos diapos ; vous relisez et modifiez tout. Avec votre propre clé API.",
  ],
  skip: "Ne plus afficher cette page au démarrage",
  again: "Elle reste dans l’Accueil : « Voir la présentation ».",
  note: "Entraînement procédural, non certifié FSTD",
  noteTip:
    "Wingdeck n’est pas un FSTD (simulateur d’entraînement au vol certifié) : les heures n’y sont pas comptées.",
});

const EN: IntroText = {
  langLabel: "Language",
  skipBtn: "Skip",
  skipTip: "Skip the introduction and go to Home (Esc)",
  eyebrow: "Slides for aviation",
  h1: "Aviation courses that fly",
  lead: "Build and share your courses as slides, with real aviation tools inside: live instruments, a flight simulator, calculations.",
  who: "For instructors, aeroclubs, flight schools and their students.",
  create: "Create a course",
  discover: "Explore the courses",
  simDoor: [
    "The built-in simulator brings your slides to life.",
    "Open the simulator",
  ],
  heroLabel: "A Wingdeck slide, live",
  heroCap: [
    "This slide is live.",
    "Turn the heading knob: the aircraft follows.",
  ],
  beatsH: "Create. Share. Fly.",
  beats: [
    {
      h: "Create",
      p: "Put an instrument on the slide, pick its situation: it moves by itself. Or start from a laid-out template.",
    },
    {
      h: "Present, share",
      p: "In class, “Present”: you fly the demonstration, the projector follows. “Share”: a link or a course file for your students or your club.",
    },
    {
      h: "Fly",
      p: "“Your turn”: students take the controls on the slide, fly the lesson in the simulator, then come back to the course.",
    },
  ],
  decksH: "Ready-to-teach courses",
  decksP: "Open them as they are, or duplicate one to fit your lesson.",
  slidesN: "{n} slides",
  progsLabel: "The whole library, by training",
  progs: {
    ppl: "LAPL · PPL",
    night: "Night rating",
    ir: "IR",
    atpl: "ATPL theory",
  },
  itemsN: "{n} items",
  libAll: "The whole library",
  loading: "Loading the slides…",
  finH: "Create your first course",
  finP: "Start from a laid-out template or a blank page. Everything can be changed afterwards.",
  ai: [
    "AI assistant.",
    "It drafts your slides; you review and change everything. With your own API key.",
  ],
  skip: "Don’t show this page at start-up",
  again: "It stays in Home: “See the introduction”.",
  note: "Procedural training, not a certified FSTD",
  noteTip:
    "Wingdeck is not an FSTD (a certified flight simulation training device): time flown here is not logged.",
};

/** Every word of the page, in both languages (same shape; tests check both). No claim the code does not back. */
export const INTRO_COPY: Record<Lang2, IntroText> = { fr: FR, en: EN };

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

/** "{n} diapos" → "10 diapos" */
export const fill = (t: string, n: number): string =>
  t.replace("{n}", String(n));

// ------------------------------------------------------------------ icons (decorative: every one sits next to a word)
const sv = (w: number, body: string, vb = 20, extra = "") =>
  `<svg width="${w}" height="${w}" viewBox="0 0 ${vb} ${vb}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"${extra}>${body}</svg>`;
const IC = {
  arrow: sv(18, '<path d="M4 10h12M11 5l5 5-5 5" stroke-width="2"/>'),
  chev: sv(16, '<path d="M8 5l5 5-5 5" stroke-width="2"/>'),
  book: sv(
    18,
    '<path d="M2 5.5A1.5 1.5 0 0 1 3.5 4H9a3 3 0 0 1 3 3v13a2.5 2.5 0 0 0-2.5-2.5H3.5A1.5 1.5 0 0 1 2 16z"/><path d="M22 5.5A1.5 1.5 0 0 0 20.5 4H15a3 3 0 0 0-3 3v13a2.5 2.5 0 0 1 2.5-2.5h6a1.5 1.5 0 0 0 1.5-1.5z"/>',
    24,
    ' stroke-width="1.9"',
  ),
  plane: sv(
    18,
    '<path d="M10 2.5c.9 0 1.3 1 1.3 2.4v3l5.7 3.2v1.6l-5.7-1.7v3.3l1.9 1.4V17L10 16.2 6.8 17v-1.3l1.9-1.4V11L3 12.7v-1.6L8.7 7.9v-3c0-1.4.4-2.4 1.3-2.4z"/>',
    20,
    ' stroke-width="1.6"',
  ),
  knob: sv(
    18,
    '<circle cx="10" cy="10" r="6.5"/><path d="M10 3.5V7"/><path d="M15.5 2.8l1.7 1.7-1.7 1.7" opacity=".7"/>',
    20,
    ' stroke-width="1.7"',
  ),
  spark: sv(
    18,
    '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    24,
    ' stroke-width="1.8"',
  ),
};
const cx = (s: string) =>
  s
    .split(" ")
    .filter(Boolean)
    .map((c) => `intro-${c}`)
    .join(" ");
const ico = (svg: string, cls = "ic") =>
  h("span", { class: cx(cls), html: svg });

/** what the page's slides need from the course package (loaded when the page opens; the ready decks come after,
 *  so they never hold the hero back) */
type SlideKit = {
  render: typeof import("../course/canvas/render");
  intro: typeof import("../course/samples/introSlides");
};
let kitP: Promise<SlideKit> | null = null;
const loadKit = (): Promise<SlideKit> =>
  (kitP ??= Promise.all([
    import("../course/canvas/render"),
    import("../course/samples/introSlides"),
  ]).then(([render, intro]) => ({ render, intro })));
let decksP: Promise<typeof import("../course/samples/decks")> | null = null;
const loadDecks = () => (decksP ??= import("../course/samples/decks"));

export class Intro {
  el: HTMLElement;
  isOpen = false;
  private onKey = (e: KeyboardEvent) => this.key(e);
  private offLang: (() => void) | null = null;
  private unInert: (() => void) | null = null;
  private observers: IntersectionObserver[] = [];
  private onScroll: (() => void) | null = null;
  /** the live slides on the page (destroyed with it, or on a language change) */
  private views: SlideView[] = [];
  /** bumped on every render: a slide that loads after the page changed is dropped */
  private gen = 0;

  constructor(private hooks: IntroHooks) {
    this.el = h("div", {
      class: "intro",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "intro-title",
      tabindex: -1,
    });
    // keys typed on the page's own controls (a strip's knob, a slider) reach them, then stop here: nothing goes on
    // to the cockpit behind
    this.el.addEventListener("keydown", (e) => e.stopPropagation());
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
      const top = this.el.scrollTop;
      this.render();
      this.el.scrollTo({ top, behavior: "instant" });
      if (hadFocus)
        this.el
          .querySelector<HTMLElement>(`[data-intro-lang="${hadFocus}"]`)
          ?.focus({ preventScroll: true });
    });
    // focus the hero title (no ring on load): the first Tab then reaches « Créer un cours »
    setTimeout(() => this.focusTitle(), 60);
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
      this.el.classList.remove("closing");
      this.el.remove();
    }, 260);
    this.hooks.closed?.();
  }

  private focusTitle() {
    const t = this.el.querySelector<HTMLElement>("#intro-title");
    (t ?? this.el).focus({ preventScroll: true });
  }

  private leave(fn: () => void) {
    this.hide();
    fn();
  }

  /** the focusable controls of the page, in order (what Tab walks through) */
  private focusables(): HTMLElement[] {
    return Array.from(
      this.el.querySelectorAll<HTMLElement>(
        'a[href], button, input, [tabindex="0"]',
      ),
    ).filter(
      (x) =>
        !x.closest("[inert]") &&
        !(x as HTMLButtonElement).disabled &&
        x.offsetParent !== null,
    );
  }

  /** while the page is up it owns the keyboard: Tab wraps inside it, Esc and F2 close it to Accueil, and no key
   *  reaches the cockpit (keys on the page's own controls get there first, see the constructor) */
  private key(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    const inside = !!t && t !== this.el && this.el.contains(t);
    // Tab follows the DOM order (the bar, then the page); it only wraps at the ends, so focus never leaves the page
    if (e.key === "Tab" && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const f = this.focusables();
      if (f.length) {
        const i = f.indexOf(t as HTMLElement);
        let to: HTMLElement | null = null;
        if (i < 0 && !inside) to = e.shiftKey ? f[f.length - 1] : f[0];
        else if (e.shiftKey && i === 0) to = f[f.length - 1];
        else if (!e.shiftKey && i === f.length - 1) to = f[0];
        if (to) {
          e.preventDefault();
          to.focus();
        }
      }
      if (!inside) e.stopPropagation();
      return;
    }
    if (e.key === "F2" || e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      this.leave(this.hooks.enter);
      return;
    }
    // a key on the page's own controls goes on to them; anywhere else it stops here
    if (!inside) e.stopPropagation();
  }

  private teardown() {
    this.gen++;
    for (const o of this.observers) o.disconnect();
    this.observers = [];
    if (this.onScroll) this.el.removeEventListener("scroll", this.onScroll);
    this.onScroll = null;
    for (const v of this.views) v.destroy();
    this.views = [];
  }

  private render() {
    this.teardown();
    const gen = this.gen;
    const l: Lang2 = uiLang() === "fr" ? "fr" : "en";
    const C = INTRO_COPY[l];
    const reduce =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    /** a link that leaves the page for a place of the app (a real link: a middle click opens it in a tab) */
    const out = (
      href: string,
      cls: string,
      go: (() => void) | null,
      ...kids: (Node | string | null)[]
    ) =>
      h(
        "a",
        {
          href,
          class: cx(cls),
          onclick: (e: Event) => {
            const m = e as MouseEvent;
            if (m.ctrlKey || m.metaKey || m.shiftKey) return;
            e.preventDefault();
            this.leave(go ?? (() => location.assign(href)));
          },
        },
        ...kids,
      );
    const createBtn = (cls = "") =>
      out(
        INTRO_ACTIONS.primary,
        `btn btn-primary ${cls}`,
        null,
        h("span", {}, C.create),
        ico(IC.arrow),
      );
    const discoverBtn = () =>
      out(
        INTRO_ACTIONS.secondary,
        "btn btn-secondary",
        this.hooks.courses ?? null,
        ico(IC.book),
        h("span", {}, C.discover),
      );
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
    /** a 16:9 host a slide is drawn into (the renderer scales the 1920 × 1080 slide to fit) */
    const stage = (cls: string, label: string) =>
      h(
        "div",
        { class: cx(`stage ${cls}`), role: "group", "aria-label": label },
        h("p", { class: cx("stage-wait") }, C.loading),
      );

    // ---------------------------------------------------------------- the sticky bar
    const barGo = createBtn("btn-sm top-go");
    barGo.inert = true;
    barGo.setAttribute("aria-hidden", "true");
    const bar = h(
      "header",
      { class: cx("top") },
      h(
        "div",
        { class: cx("wrap") },
        h(
          "span",
          { class: cx("brand") },
          h("span", { class: cx("mark"), html: brandMarkSvg(28) }),
          h("b", {}, BRAND.name),
        ),
        h("span", { class: cx("sp") }),
        h(
          "div",
          { class: cx("lang"), role: "group", "aria-label": C.langLabel },
          langBtn("fr", "FR"),
          langBtn("en", "EN"),
        ),
        h(
          "button",
          {
            type: "button",
            class: cx("skip-btn"),
            title: C.skipTip,
            "aria-label": C.skipTip,
            onclick: () => this.leave(this.hooks.enter),
          },
          h("span", {}, C.skipBtn),
          ico(IC.chev),
        ),
        barGo,
      ),
    );

    // ---------------------------------------------------------------- 1. hero
    const heroActs = h(
      "div",
      { class: cx("acts") },
      createBtn(),
      discoverBtn(),
    );
    const heroStage = stage("hero-stage", C.heroLabel);
    const hero = h(
      "section",
      { class: cx("hero"), id: "intro-hero", "aria-labelledby": "intro-title" },
      h(
        "div",
        { class: cx("wrap hero-grid") },
        h(
          "div",
          { class: cx("hero-txt") },
          h("p", { class: cx("eyebrow") }, C.eyebrow),
          h("h1", { id: "intro-title", tabindex: -1 }, C.h1),
          h("p", { class: cx("lead") }, C.lead),
          heroActs,
        ),
        // the slide comes right after the actions in the reading order (and under them on a phone)
        h(
          "figure",
          { class: cx("hero-fig") },
          heroStage,
          h(
            "figcaption",
            {},
            ico(IC.knob),
            h("span", {}, h("b", {}, C.heroCap[0]), ` ${C.heroCap[1]}`),
          ),
        ),
        h(
          "div",
          { class: cx("hero-more") },
          h("p", { class: cx("who") }, C.who),
          h(
            "p",
            { class: cx("door") },
            ico(IC.plane),
            h("span", {}, `${C.simDoor[0]} `),
            out(
              INTRO_ACTIONS.tertiary,
              "door-a",
              () => {
                location.hash = INTRO_ACTIONS.tertiary.slice(1);
              },
              C.simDoor[1],
              ico(IC.chev),
            ),
          ),
        ),
      ),
    );

    // ---------------------------------------------------------------- 2. Créez · Partagez · Faites voler
    const beatStages: HTMLElement[] = [];
    const beats = h(
      "section",
      {
        class: cx("beats"),
        id: "intro-beats",
        "aria-labelledby": "intro-beats-h",
      },
      h(
        "div",
        { class: cx("wrap") },
        h("h2", { id: "intro-beats-h" }, C.beatsH),
        h(
          "ol",
          { class: cx("beat-list") },
          C.beats.map((b, i) => {
            const st = stage("mini", b.h);
            beatStages.push(st);
            return h(
              "li",
              { class: cx("beat") },
              st,
              h(
                "h3",
                {},
                h(
                  "span",
                  { class: cx("num"), "aria-hidden": "true" },
                  String(i + 1),
                ),
                b.h,
              ),
              h("p", {}, b.p),
            );
          }),
        ),
      ),
    );

    // ---------------------------------------------------------------- 3. ready courses, the library's formations
    const deckList = h("ul", { class: cx("decks") });
    const decks = h(
      "section",
      {
        class: cx("ready"),
        id: "intro-ready",
        "aria-labelledby": "intro-ready-h",
      },
      h(
        "div",
        { class: cx("wrap") },
        h(
          "div",
          { class: cx("sec-head") },
          h("h2", { id: "intro-ready-h" }, C.decksH),
          h("p", {}, C.decksP),
        ),
        deckList,
        h(
          "nav",
          { class: cx("progs"), "aria-label": C.progsLabel },
          h("span", { class: cx("progs-l") }, C.progsLabel),
          h(
            "ul",
            {},
            INTRO_PROGS.map((p) =>
              h(
                "li",
                {},
                out(
                  INTRO_LINKS[p],
                  "prog",
                  null,
                  h("b", {}, C.progs[p]),
                  h("span", {}, fill(C.itemsN, INTRO_COUNTS[p].n)),
                ),
              ),
            ),
            h(
              "li",
              {},
              out(
                INTRO_LINKS.library,
                "prog prog-all",
                this.hooks.courses ?? null,
                h("b", {}, C.libAll),
                h("span", {}, fill(C.itemsN, INTRO_COUNTS.total)),
                ico(IC.chev),
              ),
            ),
          ),
        ),
      ),
    );

    // ---------------------------------------------------------------- 4. the closing card
    const skip = h("input", {
      type: "checkbox",
      checked: store.get(INTRO_SKIP_KEY, false),
      onchange: (e: Event) =>
        store.set(INTRO_SKIP_KEY, (e.target as HTMLInputElement).checked),
    });
    const finalActs = h(
      "div",
      { class: cx("acts") },
      createBtn(),
      discoverBtn(),
    );
    const fin = h(
      "section",
      {
        class: cx("final"),
        id: "intro-final",
        "aria-labelledby": "intro-final-h",
      },
      h(
        "div",
        { class: cx("wrap") },
        h(
          "div",
          { class: cx("final-card") },
          h("h2", { id: "intro-final-h" }, C.finH),
          h("p", { class: cx("final-p") }, C.finP),
          finalActs,
          h(
            "p",
            { class: cx("ai") },
            ico(IC.spark),
            h("span", {}, h("b", {}, C.ai[0]), ` ${C.ai[1]}`),
          ),
          h(
            "div",
            { class: cx("skip-row") },
            h("label", { class: cx("skip") }, skip, h("span", {}, C.skip)),
            h("span", { class: cx("again") }, C.again),
          ),
        ),
      ),
    );

    const foot = h(
      "footer",
      { class: cx("foot") },
      h(
        "div",
        { class: cx("wrap") },
        h(
          "span",
          { class: cx("brand") },
          h("span", { class: cx("mark"), html: brandMarkSvg(22) }),
          h("b", {}, BRAND.name),
        ),
        h("span", { class: cx("sp") }),
        h("span", { class: cx("note"), title: C.noteTip }, C.note),
      ),
    );

    this.el.lang = l;
    this.el.classList.toggle("intro-motion", !reduce);
    this.el.replaceChildren(
      bar,
      h("main", { class: cx("main-col") }, hero, beats, decks, fin),
      foot,
    );

    // the bar's own « Créer un cours » shows only while neither in-page one is on screen (one filled button per
    // screen)
    if (typeof IntersectionObserver === "function") {
      const vis = new Map<Element, boolean>([
        [heroActs, true],
        [finalActs, false],
      ]);
      const io = new IntersectionObserver(
        (es) => {
          for (const e of es) vis.set(e.target, e.isIntersecting);
          const show = ![...vis.values()].some(Boolean);
          barGo.classList.toggle("intro-show", show);
          barGo.inert = !show;
          barGo.setAttribute("aria-hidden", String(!show));
        },
        { root: this.el },
      );
      io.observe(heroActs);
      io.observe(finalActs);
      this.observers.push(io);
    }
    this.onScroll = () =>
      bar.classList.toggle("intro-scrolled", this.el.scrollTop > 8);
    this.el.addEventListener("scroll", this.onScroll, { passive: true });
    this.onScroll();

    // ---------------------------------------------------------------- the live slides
    void loadKit().then((kit) => {
      if (gen !== this.gen || !this.isOpen) return;
      this.mountSlides(kit, l, reduce, heroStage, beatStages, deckList, C);
    });
  }

  /** Draws the hero now, and each other slide when it comes near the screen (one renderer, one rAF loop for every
   *  live instrument: the stage loop of course/stage/host.ts, which stops off screen and while the tab is hidden). */
  private mountSlides(
    kit: SlideKit,
    l: Lang2,
    reduce: boolean,
    heroStage: HTMLElement,
    beatStages: HTMLElement[],
    deckList: HTMLElement,
    C: IntroText,
  ) {
    const { renderSlide, renderThumb } = kit.render;
    const I = kit.intro;
    const scenes = I.introScenes(reduce);
    const play = (
      host: HTMLElement,
      slide: import("../course/types").SlideCanvas,
      label: string,
      cockpit: "g1000" | "steam",
    ) => {
      host.replaceChildren();
      this.views.push(
        renderSlide(slide, host, {
          mode: "play",
          lang: l,
          theme: "classroom",
          scenes,
          cockpit,
          label,
        }),
      );
      host.classList.add("intro-on");
    };
    play(heroStage, I.introHeroSlide(), C.heroLabel, "g1000");

    // the rest is drawn when it comes within half a screen of the view
    const todo = new Map<Element, () => void>();
    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (es) => {
              for (const e of es) {
                if (!e.isIntersecting) continue;
                const draw = todo.get(e.target);
                todo.delete(e.target);
                io?.unobserve(e.target);
                draw?.();
              }
            },
            { root: this.el, rootMargin: "50% 0px" },
          )
        : null;
    if (io) this.observers.push(io);
    const lazy = (el: HTMLElement, draw: () => void) => {
      if (!io) return draw();
      todo.set(el, draw);
      io.observe(el);
    };
    beatStages.forEach((st, i) =>
      lazy(st, () =>
        play(st, I.introBeatSlide(I.INTRO_BEATS[i]), C.beats[i].h, "steam"),
      ),
    );
    const gen = this.gen;
    void loadDecks().then(({ DECKS }) => {
      if (gen !== this.gen || !this.isOpen) return;
      for (const id of INTRO_DECKS) {
        const def = DECKS.find((d) => d.id === id);
        if (!def) continue;
        const course = def.build();
        const slides = course.steps.flatMap((s) => (s.slide ? [s.slide] : []));
        // the card shows the deck's first slide with an instrument on it (its cover may be words only)
        const pick =
          slides.find((s) =>
            s.blocks.some(
              (b) => b.kind === "instrument" || b.kind === "simViewport",
            ),
          ) ?? slides[0];
        const title = course.title[l] ?? course.title.en;
        const thumb = h("div", { class: cx("thumb"), "aria-hidden": "true" });
        deckList.append(
          h(
            "li",
            {},
            h(
              "a",
              {
                href: deckLink(id),
                class: cx("deck"),
                onclick: (e: Event) => {
                  const m = e as MouseEvent;
                  if (m.ctrlKey || m.metaKey || m.shiftKey) return;
                  e.preventDefault();
                  this.leave(() => location.assign(deckLink(id)));
                },
              },
              thumb,
              h(
                "span",
                { class: cx("deck-txt") },
                h("b", {}, title),
                h(
                  "span",
                  { class: cx("deck-blurb") },
                  def.blurb[l] ?? def.blurb.en,
                ),
                h(
                  "span",
                  { class: cx("deck-n") },
                  fill(C.slidesN, course.steps.length),
                ),
              ),
            ),
          ),
        );
        if (pick)
          lazy(thumb, () =>
            this.views.push(
              renderThumb(pick, thumb, {
                lang: l,
                theme: course.theme ?? "classroom",
                scenes: course.scenes,
                cockpit: course.cockpit,
              }),
            ),
          );
      }
    });
  }
}
