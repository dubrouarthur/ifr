// « Nouveau cours » (academy.html#new, UX logic §6): a page of its own, without the editor's chrome. The instructor
// names the course, may file it in a formation, picks a starting point in one gallery (the blank slide first, then
// the templates, « Votre terrain » among them) and creates it. NOTHING is saved before « Créer le cours »: leaving the
// page leaves the course store as it was. The pure parts (the order of the cards, the course that is made) are
// unit-tested.
import type { Course, L10n, Lang, SlideCanvas, ThemeId } from "../types";
import type { CourseStore } from "../store";
import { h } from "../../ui/dom";
import { loc } from "../i18n";
import {
  BLANK_STARTER,
  DECK_STARTERS,
  addStarterDeck,
  deckTitle,
  starterSlide,
  type DeckStarter,
} from "./deckStarters";
import { renderSlide, renderThumb, type SlideView } from "../canvas/render";
import { courseMinutes } from "./templates";
import { CAPABILITY, type Capability } from "../samples/showcaseDecks";
import { armSimTip } from "./simTip";
import {
  courseProgramOf,
  isProgramId,
  isSubjectId,
  programDef,
  subjectDef,
  subjectsOf,
  type ProgramId,
  type SubjectId,
} from "../../library/programs";
import { aiCreateButton } from "../ai/entry";
import type { AirfieldKit, AirfieldKitResult } from "../airfieldKit";
import "../../styles/newcourse.css";

// ------------------------------------------------------------------ the formations a course can be filed in
/** The formations of the « Formation » field, in training order (Instructeurs is where drafts live, not a choice). */
export const NEW_COURSE_FORMATIONS: readonly ProgramId[] = [
  "ppl",
  "night",
  "ir",
  "atpl",
  "club",
];

/** The formations a template teaches (from its level line: « LAPL / PPL », « PPL / IR », « IR »). */
export function starterFormations(d: DeckStarter): ProgramId[] {
  if (d.formations) return [...d.formations];
  const lv = (d.level?.en ?? "").toUpperCase();
  const out: ProgramId[] = [];
  if (/PPL|LAPL/.test(lv)) out.push("ppl", "night", "club");
  if (/\bIR\b/.test(lv)) out.push("ir", "atpl");
  return out;
}
/** The templates the page shows, the blank slide first: with a formation chosen, only its own (its starting
 *  template first), else all of them (the starting templates first). */
export function startersFor(p: ProgramId | null): DeckStarter[] {
  const all = [...DECK_STARTERS];
  if (!p) return [BLANK_STARTER, ...all];
  const mine = all.filter((d) => starterFormations(d).includes(p));
  const first = mine.filter((d) => d.formations?.includes(p));
  return [BLANK_STARTER, ...first, ...mine.filter((d) => !first.includes(d))];
}
/** « Votre terrain »: the card whose slides are made from the ICAO code typed (course/airfieldKit.ts). */
export const AIRFIELD = "airfield";
export type StartingPoint = DeckStarter | typeof AIRFIELD;
/** The cards of the gallery, in order: the blank slide, the templates (startersFor), then « Votre terrain », the one
 *  made from a code typed: a template among the others, never in the first row. */
export function startingPoints(p: ProgramId | null): StartingPoint[] {
  return [...startersFor(p), AIRFIELD];
}
/** The card chosen when the page opens: « Votre terrain » when the link brings a code, the formation's starting
 *  template when the page is opened from a formation (its page said a template exists), else the blank slide. */
export function firstPick(p: ProgramId | null, kit?: string): string {
  if (kit !== undefined) return AIRFIELD;
  const own = p ? startersFor(p).find((d) => d.formations?.includes(p)) : undefined;
  return (own ?? BLANK_STARTER).id;
}
/** How long a template's course takes, as the editor will say it (templates.ts courseMinutes of the course it
 *  makes), so the card and the editor never disagree. */
const MINUTES = new Map<string, number>();
export function starterMinutes(d: DeckStarter): number {
  let m = MINUTES.get(d.id);
  if (m === undefined) {
    try {
      m = courseMinutes(
        buildNewCourse({
          id: "x",
          lang: "en",
          title: "",
          program: null,
          subject: null,
          starter: d,
        }),
      );
    } catch {
      m = d.slides.length;
    }
    MINUTES.set(d.id, m);
  }
  return m;
}
/** « 5 étapes · environ 5 min » */
export function starterMeta(d: DeckStarter, lang: Lang): string {
  const n = d.slides.length;
  const fr = lang === "fr";
  const steps = fr
    ? `${n} ${n > 1 ? "diapos" : "diapo"}`
    : `${n} ${n > 1 ? "slides" : "slide"}`;
  if (d.id === BLANK_STARTER.id) return steps;
  return `${steps} · ${fr ? "environ" : "about"} ${Math.max(1, starterMinutes(d))} min`;
}
const starterName = (d: DeckStarter, lang: Lang): string => loc(d.title, lang);

/** What the course will contain, in one line: « 7 diapos · simulateur intégré · 1 démonstration pilotée · 1 « À vous »
 *  · 1 vol · 1 quiz ». Read from the course the template makes (so it never says what is not there). */
const BUILT = new Map<string, Course>();
export function starterSummary(d: DeckStarter, lang: Lang): string {
  const fr = lang === "fr";
  let c = BUILT.get(d.id);
  if (!c) {
    c = buildNewCourse({ id: "x", lang: "en", title: "", program: null, subject: null, starter: d });
    BUILT.set(d.id, c);
  }
  const n = c.steps.length;
  const blocks = c.steps.flatMap((s) => s.slide?.blocks ?? []);
  const parts = [fr ? `${n} ${n > 1 ? "diapos" : "diapo"}` : `${n} ${n > 1 ? "slides" : "slide"}`];
  if (blocks.some((b) => b.kind === "instrument" || b.kind === "simViewport"))
    parts.push(fr ? "simulateur intégré" : "built-in simulator");
  const count = (k: number, en: [string, string], frw: [string, string]) => {
    if (k) parts.push(`${k} ${fr ? frw[k > 1 ? 1 : 0] : en[k > 1 ? 1 : 0]}`);
  };
  const shows = (d as { shows?: string[] }).shows ?? [];
  count(shows.filter((x) => x === "demo").length, ["guided demonstration", "guided demonstrations"], ["démonstration pilotée", "démonstrations pilotées"]);
  count(
    blocks.filter((b) => b.kind === "instrument" && !!b.yourTurn).length,
    ["“Your turn”", "“Your turn”"],
    ["« À vous »", "« À vous »"],
  );
  count(
    blocks.filter((b) => b.kind === "simViewport" && b.yourTurn?.where === "sim").length,
    ["flight", "flights"],
    ["vol", "vols"],
  );
  count(
    blocks.filter((b) => (b.kind === "diagram" && b.interactive) || b.kind === "calc").length,
    ["calculation tool", "calculation tools"],
    ["outil de calcul", "outils de calcul"],
  );
  count(blocks.filter((b) => b.kind === "quiz").length, ["quiz", "quizzes"], ["quiz", "quiz"]);
  return parts.join(" · ");
}

/** The course « Créer le cours » saves: the chosen template's steps, the typed title (else the template's), filed
 *  in the formation and the subject chosen. */
export function buildNewCourse(o: {
  id: string;
  lang: Lang;
  title: string;
  program: ProgramId | null;
  subject: SubjectId | null;
  starter: DeckStarter;
  now?: Date;
}): Course {
  const typed = o.title.trim();
  const fallback: L10n = deckTitle(o.starter) ?? {
    en: "Untitled course",
    fr: "Cours sans titre",
  };
  const title: L10n = typed ? { en: typed, fr: typed } : fallback;
  const cp = o.program ? courseProgramOf(o.program) : null;
  const subj =
    o.subject && o.program && subjectDef(o.subject).program === o.program
      ? o.subject
      : null;
  const base: Course = {
    format: "ifr-course",
    version: 1,
    id: o.id,
    rev: 0,
    updated: (o.now ?? new Date()).toISOString(),
    title,
    author: { name: o.lang === "fr" ? "Vous" : "You" },
    langs: ["en", "fr"],
    cockpit: "g1000",
    world: { kind: "training" },
    steps: [],
    scenes: {},
    clips: {},
    assets: {},
    theme: o.starter.theme as ThemeId,
    ...(cp ? { program: cp } : {}),
    ...(cp && subj ? { subject: subj } : {}),
  };
  // the title goes on the cover: the typed one, else (a template named by its title alone) the template's
  const onCover = typed || (o.starter.cover && !o.starter.cover.subtitle.en);
  const r = addStarterDeck(base, o.starter, {
    at: 0,
    theme: o.starter.theme,
    ...(onCover ? { title } : {}),
  });
  return { ...r.course, title };
}

// ------------------------------------------------------------------ the page
export interface NewCourseOptions {
  lang: Lang;
  store: Promise<CourseStore | null>;
  program?: string;
  subject?: string;
  /** a link to « Votre terrain » (#new&kit=LFPN): that card is chosen, with the code typed and its slides prepared */
  kit?: string;
  /** the way back's word (« Bibliothèque », « LAPL · PPL », « Accueil ») */
  backLabel: (l: Lang) => string;
  onBack(): void;
  /** the course was saved: open it in the editor */
  onCreated(id: string): void;
  onLang(l: Lang): void;
  /** « Importer un PDF » (only when the build has the PDF importer) */
  importPdf?: (
    store: CourseStore,
    file: File,
    lang: Lang,
  ) => Promise<{ id: string } | null>;
}
export interface NewCoursePage {
  el: HTMLElement;
  setLang(l: Lang): void;
  destroy(): void;
}

const T = (lang: Lang, en: string, fr: string) => (lang === "fr" ? fr : en);
const ARROW_L = "M15 18l-6-6 6-6";
const ARROW_R = "M5 12h14M13 6l6 6-6 6";
const svg = (d: string, size = 18): SVGSVGElement => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", String(size));
  s.setAttribute("height", String(size));
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "2");
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  s.append(p);
  return s;
};

/** « Votre terrain »'s slides for a code (the navdata is only read when the card needs it). */
const airfieldSlides = (code: string, lang: Lang): Promise<AirfieldKitResult> =>
  import("../airfieldKit").then((m) => m.airfieldKit(code, lang));
/** Before a code is typed, the card shows the slides of an example field (the code in the field's placeholder). */
const EXAMPLE_ICAO = "LFPN";
let example: Promise<AirfieldKit | null> | null = null;
const exampleKit = (lang: Lang): Promise<AirfieldKit | null> =>
  (example ??= airfieldSlides(EXAMPLE_ICAO, lang)
    .then((r) => (r.ok ? r : null))
    .catch(() => null));

export function mountNewCourse(
  root: HTMLElement,
  o: NewCourseOptions,
): NewCoursePage {
  let lang = o.lang;
  let program: ProgramId | null =
    o.program &&
    isProgramId(o.program) &&
    NEW_COURSE_FORMATIONS.includes(o.program)
      ? o.program
      : null;
  let subject: SubjectId | null =
    o.subject &&
    isSubjectId(o.subject) &&
    program &&
    subjectDef(o.subject).program === program
      ? o.subject
      : null;
  let title = "";
  /** the chosen card: a template's id, or AIRFIELD */
  let pick = firstPick(program, o.kit);
  // « Votre terrain »: the code typed, and the slides prepared for it (null: none yet, or the code changed since)
  let code = (o.kit ?? "").trim().toUpperCase();
  let kit: AirfieldKit | null = null;
  let kitSeq = 0;
  let kitT = 0;
  let busy = false;
  let views: SlideView[] = [];
  /** the playing covers, by template: the typed title shows on them as it is typed */
  const covers = new Map<string, SlideView>();
  let titleT = 0;
  /** the slide a template's card plays; on its cover, the title being typed */
  const heroSlide = (d: DeckStarter): SlideCanvas => {
    const s = starterSlide(d, d.hero ?? 0, d.theme);
    const t = title.trim();
    if ((d.hero ?? 0) !== 0 || !t) return s;
    return {
      ...s,
      blocks: s.blocks.map((b) =>
        b.kind === "text" && b.style === "display" ? { ...b, text: { en: t, fr: t } } : b,
      ),
    };
  };
  const deckOf = (id: string): DeckStarter =>
    startersFor(program).find((d) => d.id === id) ?? BLANK_STARTER;
  const el = h("div", { class: "nc-page" });
  root.append(el);
  // what render() draws and the airfield card's updates reach
  let kitIn: HTMLInputElement | null = null;
  let kitMsg: HTMLElement | null = null;
  let airfieldCover: HTMLElement | null = null;
  let airfieldMeta: HTMLElement | null = null;
  let airfieldView: SlideView | null = null;
  /** « Exemple · LFPN » over the airfield card's cover, until the slides of a code typed replace the example */
  let airfieldTag: HTMLElement | null = null;
  /** the example's navigation data is only read once the airfield card comes near the screen */
  let airfieldIO: IntersectionObserver | null = null;
  let syncFoot = () => {};

  const kitLine = (k: AirfieldKit) =>
    T(lang, `${k.name} (${k.icao}) · ${k.slides.length} slides`, `${k.name} (${k.icao}) · ${k.slides.length} diapos`);
  /** the line under the code: « code » blames the code typed (the field is marked invalid), « save » does not */
  const say = (text: string, bad: "" | "code" | "save" = "") => {
    if (!kitMsg) return;
    kitMsg.textContent = text;
    kitMsg.classList.toggle("is-bad", !!bad);
    kitIn?.toggleAttribute("aria-invalid", bad === "code");
  };
  /** the airfield card's cover and line: the field typed once its slides are ready, else the example field */
  const drawAirfield = () => {
    if (airfieldMeta)
      airfieldMeta.textContent = kit
        ? kitLine(kit)
        : T(lang, "ICAO code · 6 or 7 slides", "Code OACI · 6 ou 7 diapos");
    if (airfieldTag) airfieldTag.hidden = !!kit;
    const cover = airfieldCover;
    if (!cover) return;
    airfieldIO?.disconnect();
    airfieldIO = null;
    if (!kit && typeof IntersectionObserver !== "undefined") {
      const io = new IntersectionObserver(
        (ents) => {
          if (!ents.some((e) => e.isIntersecting)) return;
          io.disconnect();
          if (airfieldIO === io) airfieldIO = null;
          drawCover(cover);
        },
        { rootMargin: "300px" },
      );
      airfieldIO = io;
      io.observe(cover);
    } else drawCover(cover);
  };
  const drawCover = (cover: HTMLElement) => {
    void (kit ? Promise.resolve(kit) : exampleKit(lang)).then((k) => {
      if (!k || !cover.isConnected || cover !== airfieldCover) return;
      airfieldView?.destroy();
      cover.replaceChildren();
      try {
        airfieldView = renderThumb(k.slides[0].slide, cover, {
          lang,
          theme: "classroom",
          scenes: k.scenes,
          cockpit: "steam",
        });
      } catch {
        airfieldView = null; /* a cover is decoration: the card still says what it is */
      }
    });
  };
  /** the slides of the code typed (kept while the code stays the same); null with the reason said under the field */
  async function prepareKit(): Promise<AirfieldKit | null> {
    if (kit && kit.icao === code) return kit;
    const my = ++kitSeq;
    say(T(lang, "Reading the navigation data…", "Lecture des données de navigation…"));
    const r = await airfieldSlides(code, lang).catch(() => null);
    if (my !== kitSeq) return null;
    if (!r?.ok) {
      say(
        r?.message ??
          T(lang, "The slides could not be prepared. Try again.", "Les diapos n’ont pas pu être préparées. Réessayez."),
        "code",
      );
      return null;
    }
    kit = r;
    code = r.icao;
    if (kitIn && kitIn.value !== r.icao) kitIn.value = r.icao;
    say(T(lang, `${r.name}: the slides are ready.`, `${r.name} : les diapos sont prêtes.`));
    drawAirfield();
    return r;
  }

  const render = (focusTitle = false) => {
    for (const v of views.splice(0)) v.destroy();
    airfieldView?.destroy();
    airfieldView = null;
    covers.clear();
    // the focus stays where it was across a redraw (FR | EN, the formation): by id, by card, by language button
    const a = document.activeElement instanceof HTMLElement && el.contains(document.activeElement) ? document.activeElement : null;
    const keepFocus = !a
      ? ""
      : a.id
        ? `#${CSS.escape(a.id)}`
        : a.dataset.deck
          ? `[data-deck="${CSS.escape(a.dataset.deck)}"]`
          : a.closest(".nc-lang") && a.lang
            ? `.nc-lang [lang="${CSS.escape(a.lang)}"]`
            : "";
    // ---- focus bar: the labelled way back, where you are, FR | EN
    const back = h(
      "button",
      { type: "button", class: "nc-btn nc-back" },
      svg(ARROW_L),
      h("span", {}, o.backLabel(lang)),
    );
    back.addEventListener("click", () => o.onBack());
    const seg = h("div", {
      class: "nc-lang",
      role: "group",
      "aria-label": T(lang, "Language", "Langue"),
    });
    for (const l of ["fr", "en"] as Lang[]) {
      const b = h(
        "button",
        {
          type: "button",
          class: l === lang ? "on" : "",
          "aria-pressed": String(l === lang),
          lang: l,
        },
        l.toUpperCase(),
      );
      b.addEventListener("click", () => {
        if (l === lang) return;
        o.onLang(l);
      });
      seg.append(b);
    }
    const bar = h(
      "header",
      { class: "nc-bar" },
      back,
      h("span", { class: "nc-rule", "aria-hidden": "true" }),
      h("b", { class: "nc-ttl" }, T(lang, "New course", "Nouveau cours")),
      h("span", { class: "nc-sp" }),
      seg,
    );

    // ---- the fields: the title, the formation; the subject once a formation is chosen
    const tIn = h("input", {
      id: "nc-title",
      class: "nc-input",
      type: "text",
      maxlength: "120",
      autocomplete: "off",
      placeholder: T(
        lang,
        "For example: The circuit at Toussus",
        "Par exemple : Le tour de piste à Toussus",
      ),
    }) as HTMLInputElement;
    tIn.value = title;
    tIn.addEventListener("input", () => {
      title = tIn.value;
      clearTimeout(titleT);
      titleT = window.setTimeout(() => {
        for (const d of startersFor(program)) {
          const v = covers.get(d.id);
          if (v && (d.hero ?? 0) === 0) v.update(heroSlide(d));
        }
      }, 250);
    });
    tIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void create();
    });
    const pSel = h("select", {
      id: "nc-prog",
      class: "nc-input nc-select",
    }) as HTMLSelectElement;
    pSel.append(
      h("option", { value: "" }, T(lang, "Choose later", "Choisir plus tard")),
    );
    for (const p of NEW_COURSE_FORMATIONS) {
      const d = programDef(p);
      pSel.append(h("option", { value: p }, loc(d.code, lang)));
    }
    pSel.value = program ?? "";
    pSel.addEventListener("change", () => {
      program = pSel.value && isProgramId(pSel.value) ? pSel.value : null;
      subject = null;
      // the gallery follows the formation; the card chosen stays chosen while it is shown
      render();
      el.querySelector<HTMLElement>("#nc-prog")?.focus();
    });
    const field = (id: string, label: (Node | string)[], input: HTMLElement, cls = "") =>
      h(
        "div",
        { class: `nc-field ${cls}`.trim() },
        h("label", { for: id }, ...label),
        input,
      );
    let subjField: HTMLElement | null = null;
    if (program) {
      const sSel = h("select", {
        id: "nc-subj",
        class: "nc-input nc-select",
      }) as HTMLSelectElement;
      sSel.append(
        h("option", { value: "" }, T(lang, "Choose later", "Choisir plus tard")),
      );
      for (const s of subjectsOf(program))
        sSel.append(
          h("option", { value: s.id }, `${s.n} · ${loc(s.title, lang)}`),
        );
      sSel.value = subject ?? "";
      sSel.addEventListener("change", () => {
        subject = sSel.value && isSubjectId(sSel.value) ? sSel.value : null;
      });
      subjField = field(
        "nc-subj",
        [T(lang, "Subject", "Matière"), " ", h("small", {}, T(lang, "(optional)", "(facultatif)"))],
        sSel,
      );
    }
    const fields = h(
      "div",
      { class: "nc-fields" },
      field("nc-title", [T(lang, "Course title", "Titre du cours")], tIn, "is-title"),
      field(
        "nc-prog",
        [T(lang, "Programme", "Formation"), " ", h("small", {}, T(lang, "(optional)", "(facultatif)"))],
        pSel,
      ),
      subjField,
    );

    // ---- the starting points: one radio group, the blank slide first
    const points = startingPoints(program);
    const idOf = (p: StartingPoint) => (p === AIRFIELD ? AIRFIELD : p.id);
    if (!points.some((p) => idOf(p) === pick)) pick = BLANK_STARTER.id;
    const radios = h("div", {
      class: "nc-grid",
      role: "radiogroup",
      "aria-labelledby": "nc-start-h",
    });
    const cards: HTMLElement[] = [];
    const select = (id: string, focus = false) => {
      pick = id;
      cards.forEach((c) => {
        const on = c.dataset.deck === id;
        c.setAttribute("aria-checked", String(on));
        c.tabIndex = on ? 0 : -1;
        c.classList.toggle("on", on);
        if (on && focus) c.focus();
      });
      syncFoot();
    };
    const card = (
      id: string,
      info: { name: string; pitch: string; meta: HTMLElement; badge?: Capability; cls?: string; tag?: HTMLElement },
    ) => {
      const cover = h("div", { class: "nc-cover", "aria-hidden": "true" });
      // the radio is named by its title alone; the badge, the pitch and the line below describe it
      const key = `nc-c-${id}`;
      info.meta.id = `${key}-m`;
      const c = h(
        "div",
        {
          class: `nc-card${info.cls ? ` ${info.cls}` : ""}`,
          role: "radio",
          tabindex: "-1",
          "aria-checked": "false",
          "aria-labelledby": `${key}-t`,
          "aria-describedby": `${info.badge ? `${key}-b ` : ""}${key}-p ${key}-m`,
          "data-deck": id,
        },
        cover,
        info.tag ?? null,
        h(
          "span",
          { class: "nc-tick", "aria-hidden": "true" },
          svg("M5 12.5l4.5 4.5L19 7.5", 16),
        ),
        h(
          "div",
          { class: "nc-card-b" },
          info.badge
            ? h(
                "span",
                { id: `${key}-b`, class: `nc-badge is-${info.badge}` },
                h("i", { "aria-hidden": "true" }),
                loc(CAPABILITY[info.badge], lang),
              )
            : null,
          h("b", { id: `${key}-t`, class: "nc-card-t" }, info.name),
          h("span", { id: `${key}-p`, class: "nc-card-p" }, info.pitch),
          info.meta,
        ),
      );
      c.addEventListener("click", () => {
        select(id);
        // « Votre terrain » asks for its code: the field below takes the focus when nothing is typed yet
        if (id === AIRFIELD && !code) kitIn?.focus();
      });
      c.addEventListener("keydown", (e) => {
        const i = cards.indexOf(c);
        const k = e.key;
        if (k === " " || k === "Enter") {
          e.preventDefault();
          if (k === "Enter" && pick === id) void create();
          else select(id);
        } else if (k === "ArrowRight" || k === "ArrowDown") {
          e.preventDefault();
          select(cards[(i + 1) % cards.length].dataset.deck ?? "", true);
        } else if (k === "ArrowLeft" || k === "ArrowUp") {
          e.preventDefault();
          select(cards[(i - 1 + cards.length) % cards.length].dataset.deck ?? "", true);
        } else if (k === "Home" || k === "End") {
          e.preventDefault();
          select(cards[k === "Home" ? 0 : cards.length - 1].dataset.deck ?? "", true);
        }
      });
      cards.push(c);
      radios.append(c);
      return cover;
    };
    for (const p of points) {
      if (p === AIRFIELD) {
        airfieldMeta = h("span", { class: "nc-card-m" });
        airfieldTag = h("span", { class: "nc-tag", "aria-hidden": "true" }, T(lang, "Example", "Exemple"), ` · ${EXAMPLE_ICAO}`);
        airfieldCover = card(AIRFIELD, {
          name: T(lang, "Your airfield", "Votre terrain"),
          pitch: T(
            lang,
            "Its runways, its frequencies, the view on final and a takeoff in the simulator, from the navigation data.",
            "Ses pistes, ses fréquences, la vue en finale et un décollage au simulateur, tirés des données de navigation.",
          ),
          meta: airfieldMeta,
          badge: "flight",
          tag: airfieldTag,
        });
        continue;
      }
      const d = p;
      const cover = card(d.id, {
        name: starterName(d, lang),
        pitch: loc(d.pitch, lang),
        meta: h("span", { class: "nc-card-m" }, starterMeta(d, lang)),
        badge: d.badge,
        cls: d.id === BLANK_STARTER.id ? "is-blank" : "",
      });
      requestAnimationFrame(() => {
        if (!cover.isConnected) return;
        try {
          const scenes = d.scenes ? { scenes: d.scenes() } : {};
          // a showcase template plays its slide as the class will see it: the aircraft flies, the needles move
          // (only while the card is on screen; under reduced motion it rests on its telling picture)
          if (d.hero !== undefined) {
            cover.setAttribute("inert", "");
            const v = renderSlide(heroSlide(d), cover, {
              mode: "play",
              lang,
              theme: d.theme,
              reveal: 99,
              ...scenes,
            });
            views.push(v);
            covers.set(d.id, v);
          } else
            views.push(
              renderThumb(starterSlide(d, 0, d.theme), cover, {
                lang,
                theme: d.theme,
                ...scenes,
              }),
            );
        } catch {
          /* a cover is decoration: the card still says what it is */
        }
      });
    }
    drawAirfield();
    const progName = program ? loc(programDef(program).code, lang) : "";

    // ---- other ways to start, quieter: a description for the assistant, a PDF of slides already made
    const ai = aiCreateButton({ lang, store: o.store, program, onCreated: o.onCreated });
    const other = (btn: HTMLElement, note: string) =>
      h("div", { class: "nc-other-i" }, btn, h("span", { class: "nc-other-n" }, note));
    let pdf: HTMLElement | null = null;
    if (o.importPdf) {
      const file = h("input", {
        type: "file",
        accept: "application/pdf,.pdf",
        class: "nc-file",
        "aria-hidden": "true",
        tabindex: "-1",
      }) as HTMLInputElement;
      const b = h(
        "button",
        { type: "button", class: "nc-btn" },
        svg("M12 16V4M7 9l5-5 5 5M5 20h14"),
        h("span", {}, T(lang, "Import a PDF", "Importer un PDF")),
      );
      b.addEventListener("click", () => file.click());
      file.addEventListener("change", async () => {
        const f = file.files?.[0];
        file.value = "";
        const s = await o.store;
        if (!f || !s || !o.importPdf) return;
        const r = await o.importPdf(s, f, lang).catch(() => null);
        if (r) o.onCreated(r.id);
      });
      pdf = other(
        h("span", { class: "nc-other-b" }, b, file),
        T(lang, "Each page becomes a slide you can complete.", "Chaque page devient une diapo que vous pourrez compléter."),
      );
    }
    const others = h(
      "section",
      { class: "nc-other", "aria-labelledby": "nc-other-h" },
      h("h2", { id: "nc-other-h", class: "nc-h3" }, T(lang, "Other ways to start", "Autres façons de commencer")),
      h(
        "div",
        { class: "nc-other-row" },
        // what it needs, said before the click: a paid key, about a minute (audit item 42)
        other(
          ai,
          T(lang, "With your AI assistant key (paid) · about 1 minute", "Avec votre clé d’assistant IA (payante) · environ 1 minute"),
        ),
        pdf,
      ),
    );

    // ---- the sticky bar: what will be made (« Votre terrain »: its code), Annuler, Créer le cours
    const what = h("p", { class: "nc-what", "aria-live": "polite" });
    kitIn = h("input", {
      id: "nc-icao",
      class: "nc-input nc-icao",
      type: "text",
      maxlength: "4",
      autocomplete: "off",
      autocapitalize: "characters",
      spellcheck: "false",
      placeholder: EXAMPLE_ICAO,
      "aria-describedby": "nc-icao-msg",
    }) as HTMLInputElement;
    kitIn.value = code;
    kitMsg = h("span", { id: "nc-icao-msg", class: "nc-kit-msg", role: "status" });
    if (kit) say(kitLine(kit));
    kitIn.addEventListener("input", () => {
      const v = kitIn?.value.trim().toUpperCase() ?? "";
      if (v === code) return;
      code = v;
      kitSeq++;
      say("");
      if (kit) {
        kit = null;
        drawAirfield();
      }
      clearTimeout(kitT);
      // four letters typed: the card shows that field's slides (no button to press)
      if (code.length === 4) kitT = window.setTimeout(() => void prepareKit(), 300);
    });
    kitIn.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void create();
      }
    });
    const kitBox = h(
      "div",
      { class: "nc-kit" },
      h("label", { for: "nc-icao" }, T(lang, "ICAO code of your airfield", "Code OACI de votre terrain")),
      kitIn,
      kitMsg,
    );
    const cancel = h(
      "button",
      { type: "button", class: "nc-btn" },
      T(lang, "Cancel", "Annuler"),
    );
    cancel.addEventListener("click", () => o.onBack());
    const go = h(
      "button",
      { type: "button", class: "nc-btn nc-primary" },
      h("span", {}, T(lang, "Create the course", "Créer le cours")),
      svg(ARROW_R),
    );
    go.addEventListener("click", () => void create());
    const foot = h(
      "div",
      { class: "nc-foot" },
      h(
        "div",
        { class: "nc-foot-in" },
        what,
        kitBox,
        h("div", { class: "nc-acts" }, cancel, go),
      ),
    );
    syncFoot = () => {
      const asksCode = pick === AIRFIELD;
      kitBox.hidden = !asksCode;
      what.hidden = asksCode;
      if (asksCode) return;
      const d = deckOf(pick);
      what.replaceChildren(
        T(lang, "Starting point: ", "Point de départ : "),
        h("b", {}, starterName(d, lang)),
        ` · ${starterSummary(d, lang)}`,
      );
    };

    const main = h(
      "main",
      { class: "nc-main" },
      h(
        "div",
        { class: "nc-in" },
        h("p", { class: "nc-eyebrow" }, T(lang, "Teach", "Enseigner")),
        h(
          "h1",
          { class: "nc-h1", tabindex: "-1" },
          T(lang, "New course", "Nouveau cours"),
        ),
        h(
          "p",
          { class: "nc-lead" },
          T(
            lang,
            "Start from a blank slide or from a template already laid out: the instruments and the simulator come with it, and everything can be changed.",
            "Partez d’une diapo vierge ou d’un modèle déjà mis en page : les instruments et le simulateur sont prêts, et tout se modifie.",
          ),
        ),
        fields,
        h(
          "div",
          { class: "nc-h2row" },
          h(
            "h2",
            { id: "nc-start-h", class: "nc-h2" },
            T(lang, "Choose a starting point", "Choisissez un point de départ"),
          ),
          progName
            ? h(
                "span",
                { class: "nc-h2-sub" },
                T(
                  lang,
                  `The ${progName} templates`,
                  `Les modèles de la formation ${progName}`,
                ),
              )
            : null,
        ),
        radios,
        others,
      ),
    );
    el.replaceChildren(bar, main, foot);
    select(pick);
    if (focusTitle) tIn.focus();
    else if (keepFocus) el.querySelector<HTMLElement>(keepFocus)?.focus();
  };

  async function create() {
    if (busy) return;
    busy = true;
    el.classList.add("is-busy");
    try {
      const starter = pick === AIRFIELD ? (await prepareKit())?.starter : deckOf(pick);
      // « Votre terrain » without its slides: the reason is said under the code, which takes the focus
      if (!starter) {
        kitIn?.focus();
        return;
      }
      const s = await o.store;
      if (!s) throw new Error("no store");
      const id = await s.newId(lang === "fr" ? "mon-cours" : "my-course");
      const c = buildNewCourse({
        id,
        lang,
        title,
        program,
        subject,
        starter,
      });
      const r = await s.save(c);
      if (!r.ok) throw new Error(loc(r.message, lang));
      // the editor opens on slide 1; its « Simulateur » tab gets one tip (simTip.ts)
      if (starter.id !== BLANK_STARTER.id) armSimTip(lang);
      o.onCreated(r.course.id);
      return;
    } catch (e) {
      const msg = T(
        lang,
        `The course could not be saved on this device (${(e as Error).message}).`,
        `Le cours n’a pas pu être enregistré sur cet appareil (${(e as Error).message}).`,
      );
      if (pick === AIRFIELD) say(msg, "save");
      else el.querySelector<HTMLElement>(".nc-what")?.replaceChildren(msg);
    } finally {
      busy = false;
      el.classList.remove("is-busy");
    }
  }

  // the title field takes the focus on a desk (never pops a tablet's keyboard by itself); a link to « Votre
  // terrain » focuses its code instead, and a code it brings is prepared at once
  render(
    o.kit === undefined &&
      (typeof matchMedia === "undefined" ||
        !matchMedia("(pointer: coarse)").matches),
  );
  if (o.kit !== undefined) {
    requestAnimationFrame(() => {
      const reduce =
        typeof matchMedia !== "undefined" &&
        matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.querySelector(`[data-deck="${AIRFIELD}"]`)?.scrollIntoView({
        block: "center",
        behavior: reduce ? "auto" : "smooth",
      });
      kitIn?.focus({ preventScroll: true });
    });
    if (code.length === 4) void prepareKit();
  }
  return {
    el,
    setLang(l: Lang) {
      if (l === lang) return;
      lang = l;
      render();
    },
    destroy() {
      for (const v of views.splice(0)) v.destroy();
      views = [];
      airfieldView?.destroy();
      airfieldIO?.disconnect();
      kitSeq++;
      clearTimeout(kitT);
      el.remove();
    },
  };
}
