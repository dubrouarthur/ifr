// Accueil and Simulateur, the two places of index.html (UX logic §4). Each is one light page under the app bar:
//   Accueil (newcomer)   « Le deck de slides pour l'aviation »: the slides are the product, the simulator the tool
//                        inside them. Two doors (Enseigner · Apprendre), each with a picture, one sentence, one
//                        button and one quiet link, then Voler as a slim row (the simulator on its own). The page's
//                        only filled button is « Créer un cours ».
//   Accueil (returning)  « Bon retour »: the Reprendre card (the course left part-way, at its step) is the hero and
//                        holds the only filled button; « Aussi en cours » (at most 2 rows); the doors as one row.
//   Simulateur           « Lancer un vol »: Vol rapide (the filled button), Préparer un vol, the last flights, and
//                        the library's simulator lessons.
// The words are the vocabulary of §2. The covers are real slides, drawn by course/ui/deckHome.ts once it loads.
import { h } from "./dom";
import { lineIcon, PLACE_HREF } from "./appBar";
import "../styles/home.css";

type Lang = "fr" | "en";
type W = { fr: string; en: string };

/** Every word of the two pages (tests read it: one word per thing). */
export const HOME_COPY = {
  eyebrow: { fr: "Accueil", en: "Home" },
  // slides are the product, the simulator is the tool inside them (the start page says the same: ui/intro.ts)
  title: {
    fr: "Le deck de slides pour l’aviation",
    en: "The slide deck for aviation",
  },
  // the start page already says what the product is: this line says what to do next
  lead: {
    fr: "Créez votre cours en diapositives, présentez-le en salle, partagez-le avec vos élèves : les instruments bougent, le simulateur est dedans.",
    en: "Make your course as slides, present it in class, share it with your students: the instruments move, the simulator is inside.",
  },
  kitLabel: { fr: "Votre terrain en diapositives", en: "Your airfield as slides" },
  kitCode: { fr: "Code OACI", en: "ICAO code" },
  kitGo: {
    fr: "Préparer les diapositives de ce terrain",
    en: "Prepare this airfield’s slides",
  },
  learn: { fr: "Apprendre", en: "Learn" },
  learnLine: {
    fr: "Des cours en diapositives avec de vrais instruments, puis l’exercice au simulateur.",
    en: "Slide courses with real instruments, then the exercise in the simulator.",
  },
  learnWho: {
    fr: "LAPL · PPL, vol de nuit, IR, théorie ATPL",
    en: "LAPL · PPL, night flying, IR, ATPL theory",
  },
  learnGo: { fr: "Voir les cours", en: "See the courses" },
  learnFirst: {
    fr: "Je débute : premier cours de LAPL · PPL",
    en: "I’m new to flying: first LAPL · PPL course",
  },
  teach: { fr: "Enseigner", en: "Teach" },
  teachLine: {
    fr: "Créez un cours en diapositives à partir d’un modèle, présentez-le en salle, partagez-le avec vos élèves.",
    en: "Create a slide course from a template, present it in class, share it with your students.",
  },
  teachWho: {
    fr: "Pour les instructeurs et les aéroclubs",
    en: "For instructors and flying clubs",
  },
  teachGo: { fr: "Créer un cours", en: "Create a course" },
  teachPresent: {
    fr: "Présenter un cours existant",
    en: "Present an existing course",
  },
  present: { fr: "Présenter", en: "Present" },
  fly: { fr: "Voler", en: "Fly" },
  flyLine: {
    fr: "Le simulateur des cours, utilisé seul : un vol rapide ou un vol que vous préparez.",
    en: "The courses’ simulator, on its own: a quick flight or a flight you plan.",
  },
  flyGo: { fr: "Ouvrir le simulateur", en: "Open the simulator" },
  // a free VFR flight in clear weather (audit §24); its short briefing (goal, « Comment piloter ») comes first (§31)
  flyQuick: {
    fr: "Ou voler librement",
    en: "Or fly freely",
  },
  newHere: { fr: "Nouveau sur Wingdeck ?", en: "New to Wingdeck?" },
  newHereLine: {
    fr: "Découvrez en une page ce que vous pouvez y faire.",
    en: "See on one page what you can do with it.",
  },
  newHereGo: {
    fr: "Découvrir Wingdeck",
    en: "Discover Wingdeck",
  },
  // returning
  welcome: { fr: "Bon retour", en: "Welcome back" },
  kindCourse: { fr: "Cours", en: "Course" },
  stepOf: { fr: "Diapo {n} sur {t}", en: "Slide {n} of {t}" },
  left: { fr: "≈ {m} min restantes", en: "≈ {m} min left" },
  nextStep: { fr: "Vous reprenez à", en: "You pick up at" },
  resume: { fr: "Reprendre à la diapo {n}", en: "Resume at slide {n}" },
  restart: { fr: "Recommencer", en: "Start again" },
  loading: { fr: "Chargement de votre cours…", en: "Loading your course…" },
  also: { fr: "Aussi en cours", en: "Also in progress" },
  redo: { fr: "Refaire", en: "Fly again" },
  open: { fr: "Ouvrir", en: "Open" },
  flyingNow: { fr: "Vol en cours", en: "Flight in progress" },
  flyingPaused: { fr: "En pause", en: "Paused" },
  flyResume: { fr: "Reprendre le vol", en: "Resume the flight" },
  flyEnd: { fr: "Terminer et débriefer", en: "End and debrief" },
  resumeEdit: { fr: "Reprendre la modification", en: "Continue editing" },
  editingWho: { fr: "Votre cours : {t}", en: "Your course: {t}" },
  myCourse: { fr: "Votre cours · brouillon", en: "Your course · draft" },
  assigned: {
    fr: "À faire · demandé par votre instructeur",
    en: "To do · set by your instructor",
  },
  seeAll: {
    fr: "Tout voir dans la bibliothèque",
    en: "See everything in the library",
  },
  orElse: { fr: "Ou bien", en: "Or else" },
  learnMini: {
    fr: "Tous les cours, par formation",
    en: "Every course, by programme",
  },
  teachMini: {
    fr: "Créer ou présenter un cours",
    en: "Create or present a course",
  },
  flyMini: { fr: "Le simulateur, sans cours", en: "The simulator, no course" },
  // Simulateur
  simEyebrow: { fr: "Simulateur", en: "Simulator" },
  simTitle: { fr: "Lancer un vol", en: "Start a flight" },
  simLead: {
    fr: "Le simulateur seul, sans cours : un vol rapide, ou un vol que vous préparez vous-même.",
    en: "The simulator on its own, no course: a quick flight, or a flight you plan yourself.",
  },
  quick: { fr: "Vol rapide", en: "Quick flight" },
  quickLine: {
    fr: "Un vol libre par beau temps, ou une procédure aux instruments (IFR) à Port Ardent, une région fictive conçue pour l’entraînement, avec toutes ses cartes et ses balises. Vous commencez en vol.",
    en: "A free flight in clear weather, or an instrument (IFR) procedure at Port Ardent, a fictional region made for training, with all its charts and navaids. You start in the air.",
  },
  quickWhat: { fr: "Quoi ?", en: "What?" },
  kFree: { fr: "Voler librement (VFR)", en: "Fly freely (VFR)" },
  kApproach: { fr: "Une approche IFR", en: "An IFR approach" },
  kHold: { fr: "Une attente IFR", en: "An IFR hold" },
  kAny: { fr: "Une procédure IFR au hasard", en: "Any IFR procedure" },
  quickWhere: { fr: "Où ?", en: "Where?" },
  anyApt: { fr: "Tous les aérodromes", en: "Any airport" },
  quickCount: { fr: "{n} vols possibles", en: "{n} possible flights" },
  quickCount1: { fr: "1 vol possible", en: "1 possible flight" },
  quickNone: {
    fr: "Aucun vol de ce type ici : changez d’aérodrome.",
    en: "No flight of this kind here: pick another airport.",
  },
  quickGo: { fr: "Voler maintenant", en: "Fly now" },
  plan: { fr: "Préparer un vol", en: "Plan a flight" },
  planLine: {
    fr: "Choisissez vous-même le départ, la route, l’approche, la météo et les pannes, dans le monde réel ou la région d’entraînement.",
    en: "Choose the departure, the route, the approach, the weather and the failures yourself, in the real world or the training region.",
  },
  recent: { fr: "Vos derniers vols", en: "Your last flights" },
  recentEmpty: {
    fr: "Vos vols apparaîtront ici. Commencez par un vol rapide, juste au-dessus.",
    en: "Your flights will show here. Start with a quick flight, just above.",
  },
  lessons: {
    fr: "Leçons et entraînements au simulateur",
    en: "Simulator lessons and practice",
  },
  lessonsLine: {
    fr: "Les vols notés, avec un briefing, rangés par formation dans la bibliothèque.",
    en: "Graded flights with a briefing, filed by programme in the library.",
  },
  lessonsGo: { fr: "Voir dans la bibliothèque", en: "See them in the library" },
  passed: { fr: "Réussi", en: "Passed" },
  notPassed: { fr: "À retravailler", en: "Needs work" },
  notGraded: { fr: "Non noté", en: "Not graded" },
} satisfies Record<string, W>;
type Key = keyof typeof HOME_COPY;

const I = {
  arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M7 5v14l11-7z"/>',
  cap: '<path d="m2 9 10-5 10 5-10 5z"/><path d="M6 11v5c2 2 10 2 12 0v-5"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.7c1.6.8 2.7 2.6 3 5.3"/>',
  plane:
    '<path d="M21 15.5 13.5 11V5.5a1.5 1.5 0 0 0-3 0V11L3 15.5V17l7.5-2.2V19l-2 1.5V22l3.5-1 3.5 1v-1.5l-2-1.5v-4.2L21 17z"/>',
  chevR: '<path d="m9 6 6 6-6 6"/>',
  map: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r=".8" fill="currentColor"/><circle cx="15" cy="15" r=".8" fill="currentColor"/><circle cx="15" cy="9" r=".8" fill="currentColor"/><circle cx="9" cy="15" r=".8" fill="currentColor"/>',
  reset: '<path d="M4 4v6h6"/><path d="M5.5 15A7.5 7.5 0 1 0 6 8.5L4 10"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
};
type HomeCourse = import("../course/ui/deckHome").HomeCourse;
const icon = (d: string, size = 18) =>
  h("span", { class: "wd-ic", html: lineIcon(d, size) });

export type QuickKind = "free" | "approach" | "hold" | "any";
export interface RecentFlight {
  title: string;
  when: string;
  verdict: "passed" | "failed" | "ungraded";
  again: () => void;
}
export interface HomeHooks {
  lang: Lang;
  /** leave this page for a URL (the library, a course) */
  nav: (url: string) => void;
  /** show the Simulateur place (in this page) */
  showSim: () => void;
  /** the start page again (the product introduction) */
  intro: () => void;
  /** fly a random flight of this kind now (false: none) */
  quickFly: (kind: QuickKind, apt: string) => boolean;
  quickCount: (kind: QuickKind, apt: string) => number;
  quickAirports: () => { icao: string; name: string }[];
  /** the remembered Vol rapide choice */
  quickPref: () => { kind: QuickKind; apt: string };
  setQuickPref: (p: { kind: QuickKind; apt: string }) => void;
  /** open « Préparer un vol » (the opener gets the focus back when it closes) */
  planFlight: (opener: HTMLElement) => void;
  recent: () => RecentFlight[];
  /** a simulator lesson flown but not passed yet (« Aussi en cours ») */
  lessonToRedo: () => { title: string; meta: string; again: () => void } | null;
  /** the flight paused behind this page, if one is under way (audit §5: never lose a flight by going home) */
  flight?: () => FlightNow | null;
  /** back to that flight (the cockpit, flying again) */
  resumeFlight?: () => void;
  /** end that flight and open its debrief */
  endFlight?: () => void;
}
/** A flight under way, paused behind Accueil or Simulateur. */
export interface FlightNow {
  title: string;
  /** seconds flown */
  timeS: number;
}
/** « 3:07 » (m:ss) or « 1:02:07 » */
export function flightClock(s: number): string {
  const t = Math.max(0, Math.floor(s));
  const hh = Math.floor(t / 3600);
  const mm = Math.floor((t % 3600) / 60);
  const ss = String(t % 60).padStart(2, "0");
  return hh ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}
/** The « Vol en cours » card, on top of Accueil and Simulateur while a flight waits: « Reprendre le vol » is the
 *  page's one filled button, « Terminer et débriefer » beside it. Null when no flight is under way. */
function flightCard(o: HomeHooks): HTMLElement | null {
  const f = o.flight?.();
  if (!f || !o.resumeFlight) return null;
  const T = (k: Key) => HOME_COPY[k][o.lang];
  return h(
    "section",
    { class: "wd-card wd-flying", "aria-labelledby": "wd-flying-t" },
    h(
      "span",
      { class: "wd-row-ic sim", "aria-hidden": "true" },
      icon(I.plane, 20),
    ),
    h(
      "div",
      { class: "wd-flying-t" },
      h("p", { class: "wd-flying-k" }, T("flyingNow")),
      h("h2", { id: "wd-flying-t" }, f.title),
      h(
        "p",
        { class: "wd-flying-m num" },
        `${T("flyingPaused")} · ${flightClock(f.timeS)}`,
      ),
    ),
    h(
      "div",
      { class: "wd-flying-acts" },
      h(
        "button",
        {
          class: "wd-btn primary wd-fly-go",
          type: "button",
          onclick: () => o.resumeFlight?.(),
        },
        icon(I.play, 16),
        T("flyResume"),
      ),
      o.endFlight
        ? h(
            "button",
            {
              class: "wd-btn wd-fly-end",
              type: "button",
              onclick: () => o.endFlight?.(),
            },
            T("flyEnd"),
          )
        : null,
    ),
  );
}
/** a page with the « Vol en cours » card keeps ONE filled button: the flight's */
function withFlight(root: HTMLElement, o: HomeHooks): void {
  const card = flightCard(o);
  if (!card) return;
  root
    .querySelectorAll(".wd-btn.primary")
    .forEach((b) => b.classList.remove("primary"));
  const head = root.querySelector(".wd-head");
  if (head) head.after(card);
  else root.prepend(card);
}

/** academy.html links of the doors (one route per place, UX logic §1) */
export const HOME_LINKS = {
  library: PLACE_HREF.lib,
  /** « Je débute »: the first course of LAPL · PPL itself (its way back is the formation page) */
  ppl: "academy.html#play=sample-deck-basic-instruments&from=ppl",
  newCourse: "academy.html#new",
  instructors: "academy.html#library&p=instructors",
  /** « Présenter un cours existant »: the Instructeurs page with the course picker already open */
  present: "academy.html#library&p=instructors&do=present",
  simLessons: "academy.html#library&v=sim",
} as const;

/** The course the student left: the localStorage hint (course/store LAST_KEY), read before the store opens so the
 *  page draws the right layout at once. */
export function lastCourseHint(): { id: string; stepId?: string } | null {
  try {
    const raw = localStorage.getItem("ifr.course.last");
    if (!raw) return null;
    const v = JSON.parse(raw) as { id?: unknown; stepId?: unknown };
    return typeof v.id === "string"
      ? {
          id: v.id,
          ...(typeof v.stepId === "string" ? { stepId: v.stepId } : {}),
        }
      : null;
  } catch {
    return null;
  }
}

const editHref = (id: string) => `academy.html#edit=${encodeURIComponent(id)}`;
const playHref = (id: string, step?: string) =>
  `academy.html#play=${encodeURIComponent(id)}${step ? `&s=${encodeURIComponent(step)}` : ""}&from=home`;

/** a link that leaves the page through `nav` (a real href: open in a new tab works) */
/** « Votre terrain en slides » on the Enseigner door: an ICAO code, then Nouveau cours with its slides prepared
 *  (« Adapter à mon terrain », course/airfieldKit.ts). Empty: Nouveau cours with the code field focused. */
function kitEntry(
  T: (k: "kitLabel" | "kitCode" | "kitGo") => string,
  nav: (u: string) => void,
): HTMLElement {
  const input = h("input", {
    id: "wd-kit-icao",
    class: "wd-kit-in",
    type: "text",
    maxlength: "4",
    autocomplete: "off",
    autocapitalize: "characters",
    spellcheck: "false",
    placeholder: T("kitCode"),
    "aria-label": T("kitCode"),
  }) as HTMLInputElement;
  const form = h(
    "form",
    { class: "wd-kit", novalidate: "" },
    h("label", { class: "wd-kit-l", for: "wd-kit-icao" }, T("kitLabel")),
    // the code and its button stay on one line
    h(
      "span",
      { class: "wd-kit-row" },
      input,
      h(
        "button",
        { type: "submit", class: "wd-kit-go", "aria-label": T("kitGo"), title: T("kitGo") },
        icon(I.arrow),
      ),
    ),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const code = input.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    nav(`${HOME_LINKS.newCourse}&from=home&kit=${code}`);
  });
  return form;
}

function navLink(
  cls: string,
  url: string,
  nav: (u: string) => void,
  ...kids: (Node | string)[]
): HTMLAnchorElement {
  return h(
    "a",
    {
      class: cls,
      href: url,
      onclick: (e: Event) => {
        const me = e as MouseEvent;
        if (me.metaKey || me.ctrlKey || me.shiftKey || me.button > 0) return;
        e.preventDefault();
        nav(url);
      },
      // the course pages are another document: fetch it while the pointer (or the focus) is on its way (audit §17)
      onpointerenter: () => prefetchPage(url),
      onfocus: () => prefetchPage(url),
    },
    ...kids,
  );
}
/** pages already asked for (one <link rel="prefetch"> per document) */
const prefetched = new Set<string>();
/** Hint the browser to fetch a page of this site (`academy.html#…` → `academy.html`) before it is opened. */
export function prefetchPage(url: string): void {
  const page = url.split("#")[0].split("?")[0];
  if (!page || !/^[a-z0-9_-]+\.html$/i.test(page) || prefetched.has(page) || typeof document === "undefined") return;
  prefetched.add(page);
  document.head.append(h("link", { rel: "prefetch", href: page }));
}

export interface HomeView {
  el: HTMLElement;
  destroy(): void;
}

/** The Accueil page's content (inside the page's `<main>`). */
export function homeView(o: HomeHooks): HomeView {
  const l = o.lang;
  const T = (k: Key, v: Record<string, string | number> = {}) =>
    HOME_COPY[k][l].replace(/\{(\w+)\}/g, (_, x: string) => String(v[x] ?? ""));
  const root = h("div", { class: "wd-page wd-home" });
  const covers: { destroy(): void }[] = [];
  let destroyed = false;
  const mod = import("../course/ui/deckHome");
  const storeP = import("../course/store").then((m) => m.courseStore());
  const cover = (
    host: HTMLElement,
    what: { course: string } | { product: string },
  ) => {
    void mod
      .then(async (m) => {
        if (destroyed) return;
        const v = await m.drawCover(host, what, l);
        if (!v) return;
        if (destroyed) v.destroy();
        else covers.push(v);
      })
      .catch(() => undefined);
  };
  const head = (title: string, lead?: string) =>
    h(
      "div",
      { class: "wd-head" },
      h("p", { class: "wd-eyebrow" }, T("eyebrow")),
      h("h1", { class: "wd-h1", tabindex: "-1" }, title),
      lead ? h("p", { class: "wd-lead" }, lead) : null,
    );

  // ---------------------------------------------------------------- newcomer: three doors
  const doors = (editing: HomeCourse | null = null) => {
    const learnFront = h("div", { class: "wd-cover wd-s1" });
    const learnBack = h("div", { class: "wd-cover wd-s2" });
    const teachCover = h("div", { class: "wd-cover" });
    // « Créer un cours » is the one filled button of the doors (audit §60): Wingdeck is where courses are made
    const teachBtn = "wd-btn primary";
    const door = (
      cls: string,
      vis: HTMLElement,
      ic: string,
      id: string,
      title: string,
      line: string,
      who: string,
      go: HTMLElement,
      alt: HTMLElement,
      extra?: HTMLElement,
    ) =>
      h(
        "li",
        { class: `wd-door ${cls}` },
        h("div", { class: "wd-door-vis", "aria-hidden": "true" }, vis),
        h(
          "div",
          { class: "wd-door-bd" },
          h(
            "div",
            { class: "wd-door-k" },
            icon(ic, 20),
            h("h2", { id }, title),
          ),
          h("p", { class: "wd-door-line" }, line),
          h("p", { class: "wd-door-who" }, who),
          h("div", { class: "wd-door-acts" }, go),
          alt,
          extra ?? "",
        ),
      );
    const list = h(
      "ul",
      { class: "wd-doors" },
      door(
        "teach",
        h(
          "div",
          { class: "wd-teachvis" },
          h("div", { class: "wd-scr" }, teachCover),
          h("span", { class: "wd-pres", "aria-hidden": "true" }, icon(I.play, 14), T("present")),
        ),
        I.users,
        "wd-d-teach",
        T("teach"),
        T("teachLine"),
        editing ? T("editingWho", { t: editing.title }) : T("teachWho"),
        // a course of my own is waiting: the door continues it, and « Créer un cours » becomes the quiet link
        editing
          ? navLink(
              `${teachBtn} wd-edit-go`,
              editHref(editing.id),
              o.nav,
              icon(I.edit),
              T("resumeEdit"),
            )
          : navLink(
              teachBtn,
              HOME_LINKS.newCourse,
              o.nav,
              icon(I.plus),
              T("teachGo"),
            ),
        editing
          ? navLink(
              "wd-link wd-door-alt",
              HOME_LINKS.newCourse,
              o.nav,
              T("teachGo"),
            )
          : navLink(
              "wd-link wd-door-alt",
              HOME_LINKS.present,
              o.nav,
              T("teachPresent"),
            ),
        kitEntry(T, o.nav),
      ),
      door(
        "learn",
        h("div", { class: "wd-stack" }, learnBack, learnFront),
        I.cap,
        "wd-d-learn",
        T("learn"),
        T("learnLine"),
        T("learnWho"),
        navLink(
          "wd-btn",
          HOME_LINKS.library,
          o.nav,
          T("learnGo"),
          icon(I.arrow),
        ),
        navLink("wd-link wd-door-alt", HOME_LINKS.ppl, o.nav, T("learnFirst")),
      ),
    );
    // Voler: the simulator is the tool inside the courses; on its own it is a slim row under the two doors, still one
    // click away (« Ouvrir le simulateur », « Ou voler librement »)
    const simRow = h(
      "section",
      { class: "wd-door sim is-slim", "aria-labelledby": "wd-d-sim" },
      h(
        "div",
        { class: "wd-door-k" },
        icon(I.plane, 20),
        h("h2", { id: "wd-d-sim" }, T("fly")),
      ),
      h("p", { class: "wd-door-line" }, T("flyLine")),
      h(
        "div",
        { class: "wd-door-acts" },
        h(
          "a",
          {
            class: "wd-btn",
            href: PLACE_HREF.sim,
            onclick: (e: Event) => {
              e.preventDefault();
              o.showSim();
            },
          },
          T("flyGo"),
          icon(I.arrow),
        ),
        h(
          "button",
          {
            class: "wd-link wd-door-alt",
            type: "button",
            onclick: () => o.quickFly("free", ""),
          },
          T("flyQuick"),
        ),
      ),
    );
    cover(learnFront, { product: "p-asi" });
    cover(learnBack, { course: "sample-maths-vfr" });
    cover(teachCover, { course: "sample-holding" });
    return h("div", { class: "wd-doorset" }, list, simRow);
  };
  const newHere = () =>
    h(
      "div",
      { class: "wd-newhere" },
      h(
        "span",
        { class: "wd-newhere-play", "aria-hidden": "true" },
        icon(I.play, 16),
      ),
      h("p", {}, h("b", {}, T("newHere")), " ", T("newHereLine")),
      h(
        "button",
        { class: "wd-link", type: "button", onclick: () => o.intro() },
        T("newHereGo"),
        icon(I.arrow, 16),
      ),
    );
  const showNew = (editing: HomeCourse | null = null) => {
    clearCovers();
    root.classList.remove("is-return");
    root.replaceChildren(head(T("title"), T("lead")), doors(editing), newHere());
    withFlight(root, o);
  };

  // ---------------------------------------------------------------- returning: Reprendre
  const clearCovers = () => {
    for (const c of covers.splice(0)) c.destroy();
  };
  const showReturn = (
    r: import("../course/ui/deckHome").HomeResume | null,
    assigned: HomeCourse | null,
    editing: HomeCourse | null = null,
  ) => {
    clearCovers();
    root.classList.add("is-return");
    const ownDraft = !!(r && editing && editing.id === r.id);
    // the hero's one filled button (either branch below)
    const goCls = "wd-btn primary wd-resume-go";
    const cv = h("div", {
      class: "wd-cover wd-resume-cv",
      "aria-hidden": "true",
    });
    const bd = h("div", { class: "wd-resume-bd" });
    if (r) {
      const pct = Math.round((r.index / Math.max(1, r.total)) * 100);
      bd.append(
        h("span", { class: "wd-kind" }, T("kindCourse")),
        h("h2", { class: "wd-resume-t", id: "wd-resume-t" }, r.title),
        r.home ? h("p", { class: "wd-resume-home" }, r.home) : "",
        h(
          "div",
          { class: "wd-prog" },
          h(
            "span",
            { class: "num" },
            T("stepOf", { n: r.index + 1, t: r.total }),
          ),
          h(
            "span",
            {
              class: "wd-bar",
              role: "progressbar",
              "aria-label": T("stepOf", { n: r.index + 1, t: r.total }),
              "aria-valuemin": "0",
              "aria-valuemax": String(r.total),
              "aria-valuenow": String(r.index),
            },
            h("i", { style: `width:${pct}%` }),
          ),
          r.minutesLeft
            ? h("span", { class: "num" }, T("left", { m: r.minutesLeft }))
            : "",
        ),
        h("p", { class: "wd-next" }, T("nextStep"), h("b", {}, r.stepTitle)),
        // the author's own draft: what they were doing is writing it, so « Reprendre la modification » leads and
        // reading it is the quiet link (re-walk P2: two « Reprendre » for one course)
        ownDraft
          ? h(
              "div",
              { class: "wd-resume-acts" },
              navLink(goCls, editHref(r.id), o.nav, T("resumeEdit")),
              navLink("wd-link", playHref(r.id, r.stepId), o.nav, T("resume", { n: r.index + 1 })),
            )
          : h(
              "div",
              { class: "wd-resume-acts" },
              navLink(
                goCls,
                playHref(r.id, r.stepId),
                o.nav,
                icon(I.play, 16),
                T("resume", { n: r.index + 1 }),
              ),
              navLink(
                "wd-link",
                playHref(r.id, r.firstStepId),
                o.nav,
                T("restart"),
              ),
            ),
      );
      cover(cv, { course: r.id });
    } else
      bd.append(
        h("p", { class: "wd-resume-wait", role: "status" }, T("loading")),
      );
    const hero = h(
      "article",
      { class: "wd-card wd-resume", "aria-labelledby": "wd-resume-t" },
      cv,
      bd,
    );
    const rows: HTMLElement[] = [];
    const redo = o.lessonToRedo();
    if (redo)
      rows.push(
        h(
          "li",
          { class: "wd-row" },
          h(
            "span",
            { class: "wd-row-ic sim", "aria-hidden": "true" },
            icon(I.plane, 18),
          ),
          h(
            "span",
            { class: "wd-row-t" },
            h("b", {}, redo.title),
            h("small", {}, redo.meta),
          ),
          h(
            "button",
            { class: "wd-link", type: "button", onclick: () => redo.again() },
            T("redo"),
          ),
        ),
      );
    if (assigned)
      rows.push(
        h(
          "li",
          { class: "wd-row" },
          h(
            "span",
            { class: "wd-row-ic", "aria-hidden": "true" },
            icon(I.cap, 18),
          ),
          h(
            "span",
            { class: "wd-row-t" },
            h("b", {}, assigned.title),
            h("small", { class: "wd-due" }, T("assigned")),
          ),
          navLink("wd-link", playHref(assigned.id), o.nav, T("open")),
        ),
      );
    if (editing && !ownDraft)
      rows.push(
        h(
          "li",
          { class: "wd-row" },
          h(
            "span",
            { class: "wd-row-ic", "aria-hidden": "true" },
            icon(I.edit, 18),
          ),
          h(
            "span",
            { class: "wd-row-t" },
            h("b", {}, editing.title),
            h("small", {}, T("myCourse")),
          ),
          navLink("wd-link", editHref(editing.id), o.nav, T("resumeEdit")),
        ),
      );
    const side = rows.length
      ? h(
          "aside",
          { class: "wd-card wd-side", "aria-labelledby": "wd-also" },
          h("h2", { class: "wd-side-h", id: "wd-also" }, T("also")),
          h("ul", { class: "wd-rows" }, ...rows),
          h(
            "div",
            { class: "wd-side-foot" },
            navLink(
              "wd-link",
              HOME_LINKS.library,
              o.nav,
              T("seeAll"),
              icon(I.arrow, 16),
            ),
          ),
        )
      : null;
    const mini = (
      cls: string,
      ic: string,
      title: string,
      sub: string,
      el: HTMLAnchorElement,
    ) => {
      el.className = `wd-card wd-mini ${cls}`;
      el.append(
        h("span", { class: "wd-mini-ic", "aria-hidden": "true" }, icon(ic, 22)),
        h(
          "span",
          { class: "wd-mini-t" },
          h("b", {}, title),
          h("small", {}, sub),
        ),
        h(
          "span",
          { class: "wd-mini-chev", "aria-hidden": "true" },
          icon(I.chevR, 20),
        ),
      );
      return h("li", {}, el);
    };
    const simLink = h("a", {
      href: PLACE_HREF.sim,
      onclick: (e: Event) => {
        e.preventDefault();
        o.showSim();
      },
    });
    root.replaceChildren(
      head(T("welcome")),
      h("div", { class: `wd-return${side ? "" : " solo"}` }, hero, side),
      h(
        "section",
        { class: "wd-more", "aria-labelledby": "wd-more-h" },
        h("h2", { class: "wd-h2", id: "wd-more-h" }, T("orElse")),
        h(
          "ul",
          { class: "wd-minis" },
          mini(
            "learn",
            I.cap,
            T("learn"),
            T("learnMini"),
            navLink("", HOME_LINKS.library, o.nav),
          ),
          mini(
            "teach",
            I.users,
            T("teach"),
            T("teachMini"),
            navLink("", HOME_LINKS.instructors, o.nav),
          ),
          mini("sim", I.plane, T("fly"), T("flyMini"), simLink),
        ),
      ),
    );
    withFlight(root, o);
  };

  const hint = lastCourseHint();
  if (hint?.stepId) showReturn(null, null);
  else showNew();
  void mod
    .then((m) => m.homeData({ lang: l, store: storeP }))
    .then((d) => {
      if (destroyed) return;
      if (d.resume) showReturn(d.resume, d.assigned, d.editing ?? null);
      else if (d.editing || root.classList.contains("is-return"))
        showNew(d.editing ?? null);
    })
    .catch(() => {
      if (!destroyed && root.classList.contains("is-return")) showNew();
    });
  return {
    el: root,
    destroy() {
      destroyed = true;
      clearCovers();
    },
  };
}

/** The Simulateur page's content. */
export function simView(o: HomeHooks): HomeView {
  const l = o.lang;
  const T = (k: Key, v: Record<string, string | number> = {}) =>
    HOME_COPY[k][l].replace(/\{(\w+)\}/g, (_, x: string) => String(v[x] ?? ""));
  const pref = o.quickPref();
  const apts = o.quickAirports();
  if (pref.apt && !apts.some((a) => a.icao === pref.apt)) pref.apt = "";
  const count = h("p", { class: "wd-quick-n", role: "status" });
  const go = h(
    "button",
    {
      class: "wd-btn primary wd-quick-go",
      type: "button",
      onclick: () => {
        o.quickFly(pref.kind, pref.apt);
      },
    },
    icon(I.plane, 18),
    T("quickGo"),
  ) as HTMLButtonElement;
  const sync = () => {
    o.setQuickPref(pref);
    const n = o.quickCount(pref.kind, pref.apt);
    count.textContent = n
      ? n === 1
        ? T("quickCount1")
        : T("quickCount", { n })
      : T("quickNone");
    go.disabled = !n;
    // the free flight is over the training region's islands: no airport to pick
    sel.disabled = pref.kind === "free";
    for (const b of seg.querySelectorAll<HTMLButtonElement>("button")) {
      const on = b.dataset.k === pref.kind;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
  };
  const kinds: [QuickKind, Key][] = [
    ["free", "kFree"],
    ["approach", "kApproach"],
    ["hold", "kHold"],
    ["any", "kAny"],
  ];
  const seg = h(
    "div",
    { class: "wd-seg", role: "group", "aria-labelledby": "wd-q-what" },
    ...kinds.map(([k, w]) =>
      h(
        "button",
        {
          type: "button",
          "data-k": k,
          onclick: () => {
            pref.kind = k;
            sync();
          },
        },
        T(w),
      ),
    ),
  );
  const sel = h(
    "select",
    {
      id: "wd-q-apt",
      class: "wd-select",
      onchange: (e: Event) => {
        pref.apt = (e.target as HTMLSelectElement).value;
        sync();
      },
    },
    h("option", { value: "", selected: !pref.apt }, T("anyApt")),
    ...apts.map((a) =>
      h(
        "option",
        { value: a.icao, selected: a.icao === pref.apt },
        `${a.icao} · ${a.name}`,
      ),
    ),
  );
  const quick = h(
    "section",
    { class: "wd-card wd-quick", "aria-labelledby": "wd-quick-h" },
    h(
      "div",
      { class: "wd-card-k" },
      icon(I.dice, 20),
      h("h2", { id: "wd-quick-h" }, T("quick")),
    ),
    h("p", { class: "wd-card-line" }, T("quickLine")),
    h(
      "div",
      { class: "wd-quick-f" },
      h(
        "div",
        { class: "wd-field" },
        h("span", { class: "wd-field-l", id: "wd-q-what" }, T("quickWhat")),
        seg,
      ),
      h(
        "label",
        { class: "wd-field", for: "wd-q-apt" },
        h("span", { class: "wd-field-l" }, T("quickWhere")),
        sel,
      ),
    ),
    h("div", { class: "wd-quick-acts" }, go, count),
  );
  const planBtn = h(
    "button",
    {
      class: "wd-btn wd-plan-b",
      type: "button",
      onclick: () => o.planFlight(planBtn),
    },
    icon(I.map, 18),
    T("plan"),
  ) as HTMLButtonElement;
  const plan = h(
    "section",
    { class: "wd-card wd-plan", "aria-labelledby": "wd-plan-h" },
    h(
      "div",
      { class: "wd-card-k" },
      icon(I.map, 20),
      h("h2", { id: "wd-plan-h" }, T("plan")),
    ),
    h("p", { class: "wd-card-line" }, T("planLine")),
    h("div", { class: "wd-plan-acts" }, planBtn),
  );
  const flights = o.recent().slice(0, 4);
  const verdict = (v: RecentFlight["verdict"]) =>
    h(
      "span",
      { class: `wd-verdict ${v}` },
      v === "passed"
        ? T("passed")
        : v === "failed"
          ? T("notPassed")
          : T("notGraded"),
    );
  const recent = h(
    "section",
    { class: "wd-recent", "aria-labelledby": "wd-recent-h" },
    h("h2", { class: "wd-h2", id: "wd-recent-h" }, T("recent")),
    flights.length
      ? h(
          "ul",
          { class: "wd-card wd-rows" },
          ...flights.map((f) =>
            h(
              "li",
              { class: "wd-row" },
              h(
                "span",
                { class: "wd-row-ic sim", "aria-hidden": "true" },
                icon(I.plane, 18),
              ),
              h(
                "span",
                { class: "wd-row-t" },
                h("b", {}, f.title),
                h("small", {}, f.when),
              ),
              verdict(f.verdict),
              h(
                "button",
                { class: "wd-link", type: "button", onclick: () => f.again() },
                icon(I.reset, 16),
                T("redo"),
              ),
            ),
          ),
        )
      : h("p", { class: "wd-card wd-empty" }, T("recentEmpty")),
  );
  const lessons = h(
    "div",
    { class: "wd-newhere wd-lessons" },
    h(
      "span",
      { class: "wd-newhere-play sim", "aria-hidden": "true" },
      icon(I.cap, 16),
    ),
    h("p", {}, h("b", {}, T("lessons")), " · ", T("lessonsLine")),
    navLink(
      "wd-link",
      HOME_LINKS.simLessons,
      o.nav,
      T("lessonsGo"),
      icon(I.arrow, 16),
    ),
  );
  const root = h(
    "div",
    { class: "wd-page wd-sim" },
    h(
      "div",
      { class: "wd-head" },
      h("p", { class: "wd-eyebrow" }, T("simEyebrow")),
      h("h1", { class: "wd-h1", tabindex: "-1" }, T("simTitle")),
      h("p", { class: "wd-lead" }, T("simLead")),
    ),
    h("div", { class: "wd-sim-grid" }, quick, plan),
    recent,
    lessons,
  );
  sync();
  withFlight(root, o);
  return { el: root, destroy() {} };
}
