// Accueil and Simulateur, the two places of index.html (UX logic §4). Each is one light page under the app bar:
//   Accueil (newcomer)   « Que voulez-vous faire ? »: three doors (Apprendre · Enseigner · Voler), each with a
//                        picture, one sentence, one button and one quiet link. The page's only filled button is
//                        « Voir les cours ».
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
  title: { fr: "Que voulez-vous faire ?", en: "What would you like to do?" },
  lead: {
    fr: "Wingdeck réunit des cours en diapositives et un simulateur de vol. Choisissez par où entrer : vous pourrez changer à tout moment avec les onglets en haut.",
    en: "Wingdeck brings slide courses and a flight simulator together. Choose a way in: you can switch at any time with the tabs at the top.",
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
    fr: "Je débute : commencer par LAPL · PPL",
    en: "I’m new to flying: start with LAPL · PPL",
  },
  teach: { fr: "Enseigner", en: "Teach" },
  teachLine: {
    fr: "Créez un cours à partir d’un modèle, puis présentez-le en salle sur le projecteur.",
    en: "Create a course from a template, then present it to your class on the projector.",
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
    fr: "Le simulateur seul : un vol rapide en un clic, ou un vol que vous préparez.",
    en: "The simulator on its own: a quick flight in one click, or a flight you plan.",
  },
  flyWho: {
    fr: "Sans cours, à votre rythme",
    en: "No course, at your own pace",
  },
  flyGo: { fr: "Ouvrir le simulateur", en: "Open the simulator" },
  flyQuick: {
    fr: "Ou un vol rapide, en un clic",
    en: "Or a quick flight, in one click",
  },
  flyPhoto: {
    fr: "Cessna 172 · tableau classique ou G1000",
    en: "Cessna 172 · classic panel or G1000",
  },
  newHere: { fr: "Nouveau sur Wingdeck ?", en: "New to Wingdeck?" },
  newHereLine: {
    fr: "Découvrez en une page ce que vous pouvez y faire.",
    en: "See on one page what you can do with it.",
  },
  newHereGo: {
    fr: "Voir la présentation · 1 min",
    en: "See the introduction · 1 min",
  },
  // returning
  welcome: { fr: "Bon retour", en: "Welcome back" },
  kindCourse: { fr: "Cours", en: "Course" },
  stepOf: { fr: "Étape {n} sur {t}", en: "Step {n} of {t}" },
  left: { fr: "≈ {m} min restantes", en: "≈ {m} min left" },
  nextStep: { fr: "Vous reprenez à", en: "You pick up at" },
  resume: { fr: "Reprendre à l’étape {n}", en: "Resume at step {n}" },
  restart: { fr: "Recommencer", en: "Start again" },
  loading: { fr: "Chargement de votre cours…", en: "Loading your course…" },
  also: { fr: "Aussi en cours", en: "Also in progress" },
  redo: { fr: "Refaire", en: "Fly again" },
  open: { fr: "Ouvrir", en: "Open" },
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
    fr: "Le simulateur seul, sans cours : un vol rapide en un clic, ou un vol que vous préparez vous-même.",
    en: "The simulator on its own, no course: a quick flight in one click, or a flight you plan yourself.",
  },
  quick: { fr: "Vol rapide", en: "Quick flight" },
  quickLine: {
    fr: "Wingdeck choisit pour vous une approche ou une attente dans la région d’entraînement, avec la météo actuelle. Le briefing s’affiche avant le départ.",
    en: "Wingdeck picks an approach or a hold in the training region for you, with the current weather. The briefing shows before you start.",
  },
  quickWhat: { fr: "Quoi ?", en: "What?" },
  kApproach: { fr: "Une approche", en: "An approach" },
  kHold: { fr: "Une attente", en: "A hold" },
  kAny: { fr: "Au hasard", en: "Surprise me" },
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
    fr: "Vos vols apparaîtront ici. Commencez par un vol rapide : il ne faut qu’un clic.",
    en: "Your flights will show here. Start with a quick flight: it takes one click.",
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
};
const icon = (d: string, size = 18) =>
  h("span", { class: "wd-ic", html: lineIcon(d, size) });

export type QuickKind = "approach" | "hold" | "any";
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
}

/** academy.html links of the doors (one route per place, UX logic §1) */
export const HOME_LINKS = {
  library: PLACE_HREF.lib,
  ppl: "academy.html#library&p=ppl",
  newCourse: "academy.html#new",
  instructors: "academy.html#library&p=instructors",
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

const playHref = (id: string, step?: string) =>
  `academy.html#play=${encodeURIComponent(id)}${step ? `&s=${encodeURIComponent(step)}` : ""}&from=home`;

/** a link that leaves the page through `nav` (a real href: open in a new tab works) */
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
    },
    ...kids,
  );
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
  const doors = () => {
    const learnFront = h("div", { class: "wd-cover wd-s1" });
    const learnBack = h("div", { class: "wd-cover wd-s2" });
    const teachCover = h("div", { class: "wd-cover" });
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
        ),
      );
    const list = h(
      "ul",
      { class: "wd-doors" },
      door(
        "learn",
        h("div", { class: "wd-stack" }, learnBack, learnFront),
        I.cap,
        "wd-d-learn",
        T("learn"),
        T("learnLine"),
        T("learnWho"),
        navLink(
          "wd-btn primary",
          HOME_LINKS.library,
          o.nav,
          T("learnGo"),
          icon(I.arrow),
        ),
        navLink("wd-link wd-door-alt", HOME_LINKS.ppl, o.nav, T("learnFirst")),
      ),
      door(
        "teach",
        h(
          "div",
          { class: "wd-teachvis" },
          h("div", { class: "wd-scr" }, teachCover),
          h("span", { class: "wd-pres" }, icon(I.play, 14), T("present")),
        ),
        I.users,
        "wd-d-teach",
        T("teach"),
        T("teachLine"),
        T("teachWho"),
        navLink(
          "wd-btn",
          HOME_LINKS.newCourse,
          o.nav,
          icon(I.plus),
          T("teachGo"),
        ),
        navLink(
          "wd-link wd-door-alt",
          HOME_LINKS.instructors,
          o.nav,
          T("teachPresent"),
        ),
      ),
      door(
        "sim",
        h(
          "div",
          { class: "wd-simvis" },
          h("span", { class: "wd-simtag" }, T("flyPhoto")),
        ),
        I.plane,
        "wd-d-sim",
        T("fly"),
        T("flyLine"),
        T("flyWho"),
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
            onclick: () => o.quickFly("any", ""),
          },
          T("flyQuick"),
        ),
      ),
    );
    cover(learnFront, { product: "p-asi" });
    cover(learnBack, { course: "sample-maths-vfr" });
    cover(teachCover, { course: "sample-holding" });
    return list;
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
  const showNew = () => {
    clearCovers();
    root.classList.remove("is-return");
    root.replaceChildren(head(T("title"), T("lead")), doors(), newHere());
  };

  // ---------------------------------------------------------------- returning: Reprendre
  const clearCovers = () => {
    for (const c of covers.splice(0)) c.destroy();
  };
  const showReturn = (
    r: import("../course/ui/deckHome").HomeResume | null,
    assigned: import("../course/ui/deckHome").HomeCourse | null,
  ) => {
    clearCovers();
    root.classList.add("is-return");
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
        h(
          "div",
          { class: "wd-resume-acts" },
          navLink(
            "wd-btn primary wd-resume-go",
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
  };

  const hint = lastCourseHint();
  if (hint?.stepId) showReturn(null, null);
  else showNew();
  void mod
    .then((m) => m.homeData({ lang: l, store: storeP }))
    .then((d) => {
      if (destroyed) return;
      if (d.resume) showReturn(d.resume, d.assigned);
      else if (root.classList.contains("is-return")) showNew();
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
    for (const b of seg.querySelectorAll<HTMLButtonElement>("button")) {
      const on = b.dataset.k === pref.kind;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
  };
  const kinds: [QuickKind, Key][] = [
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
  return { el: root, destroy() {} };
}
