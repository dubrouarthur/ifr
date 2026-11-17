// « Nouveau cours » (academy.html#new, UX logic §6): a page of its own, without the editor's chrome. The instructor
// names the course, says where it belongs (formation, optional subject), picks a starting point (the templates of
// that formation first, then the empty course) and creates it. NOTHING is saved before « Créer le cours »: leaving
// the page leaves the course store as it was. The pure parts (the order of the templates, the course that is made)
// are unit-tested.
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
import { CAPABILITY } from "../samples/showcaseDecks";
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
import type { AirfieldKit } from "../airfieldKit";
import { airfieldKitPanel, type AirfieldKitPanel } from "./airfieldKitPanel";
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
/** The templates the page shows: with a formation chosen, only its own (its starting template first), else all of
 *  them (the starting templates first); the blank slide is always last. */
export function startersFor(p: ProgramId | null): DeckStarter[] {
  const all = [...DECK_STARTERS];
  if (!p) return [...all, BLANK_STARTER];
  const mine = all.filter((d) => starterFormations(d).includes(p));
  const first = mine.filter((d) => d.formations?.includes(p));
  return [...first, ...mine.filter((d) => !first.includes(d)), BLANK_STARTER];
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
  if (d.id === BLANK_STARTER.id) return fr ? "1 diapo vierge, les diapos prêtes à portée de main" : "1 blank slide, the ready slides at hand";
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
  let pick: DeckStarter = startersFor(program)[0];
  // « Adapter à mon terrain »: the slides prepared for the instructor's field (a starting point like a template)
  let kit: AirfieldKit | null = null;
  let kitPanel: AirfieldKitPanel | null = null;
  let kitValue = "";
  const isKit = (d: DeckStarter) => !!kit && d.id === kit.starter.id;
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
  const el = h("div", { class: "nc-page" });
  root.append(el);

  const render = (focusTitle = false) => {
    for (const v of views.splice(0)) v.destroy();
    if (kitPanel) {
      kitValue = kitPanel.value();
      kitPanel.destroy();
      kitPanel = null;
    }
    covers.clear();
    const keepFocus = document.activeElement?.id;
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
      h(
        "div",
        { class: "nc-ttl" },
        h("b", {}, T(lang, "New course", "Nouveau cours")),
        h(
          "span",
          {},
          T(
            lang,
            "Nothing is saved before “Create the course”",
            "Rien n’est enregistré avant « Créer le cours »",
          ),
        ),
      ),
      h("span", { class: "nc-sp" }),
      seg,
    );

    // ---- the three fields
    const tIn = h("input", {
      id: "nc-title",
      class: "nc-input",
      type: "text",
      maxlength: "120",
      autocomplete: "off",
      placeholder: T(
        lang,
        "For example: The circuit at Lognes",
        "Par exemple : Le tour de piste à Lognes",
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
      // the gallery follows the formation, and so does the pick: its starting template (the field's slides stay)
      if (!isKit(pick)) pick = startersFor(program)[0];
      render();
      el.querySelector<HTMLElement>("#nc-prog")?.focus();
    });
    const sSel = h("select", {
      id: "nc-subj",
      class: "nc-input nc-select",
    }) as HTMLSelectElement;
    sSel.append(
      h("option", { value: "" }, T(lang, "Choose later", "Choisir plus tard")),
    );
    if (program)
      for (const s of subjectsOf(program))
        sSel.append(
          h("option", { value: s.id }, `${s.n} · ${loc(s.title, lang)}`),
        );
    sSel.disabled = !program;
    sSel.value = subject ?? "";
    sSel.addEventListener("change", () => {
      subject = sSel.value && isSubjectId(sSel.value) ? sSel.value : null;
    });
    const field = (
      id: string,
      label: HTMLElement,
      input: HTMLElement,
      cls = "",
    ) =>
      h(
        "div",
        { class: `nc-field ${cls}`.trim() },
        h("label", { for: id }, label),
        input,
      );
    const fields = h(
      "div",
      { class: "nc-fields" },
      field(
        "nc-title",
        h("span", {}, T(lang, "Course title", "Titre du cours")),
        tIn,
        "is-title",
      ),
      field("nc-prog", h("span", {}, T(lang, "Programme", "Formation")), pSel),
      field(
        "nc-subj",
        h(
          "span",
          {},
          T(lang, "Subject", "Matière"),
          " ",
          h("small", {}, T(lang, "(optional)", "(facultatif)")),
        ),
        sSel,
      ),
    );

    // ---- the starting points
    const list = startersFor(program);
    if (!list.some((d) => d.id === pick.id) && !isKit(pick)) pick = list[0];
    // « Partir d'une description (IA) » is the first card of the grid (a button that opens the assistant), then
    // the templates as one radio group (audit item 62)
    const radios = h("div", {
      class: "nc-radios",
      role: "radiogroup",
      "aria-label": T(lang, "Starting point", "Point de départ"),
    });
    const ai = aiCreateButton({ lang, store: o.store, program, onCreated: o.onCreated });
    const sparkIco = ai.querySelector("svg");
    sparkIco?.setAttribute("width", "30");
    sparkIco?.setAttribute("height", "30");
    ai.className = "nc-card nc-card-ai";
    ai.style.marginTop = "";
    ai.replaceChildren(
      h("div", { class: "nc-cover nc-cover-ai", "aria-hidden": "true" }, sparkIco),
      h(
        "div",
        { class: "nc-card-b" },
        h("b", { class: "nc-card-t" }, T(lang, "Start from a description (AI)", "Partir d’une description (IA)")),
        h(
          "span",
          { class: "nc-card-p" },
          T(
            lang,
            "Describe the course in a few lines: the slides are laid out for you, ready to change.",
            "Décrivez le cours en quelques lignes : les diapos sont mises en page pour vous, prêtes à modifier.",
          ),
        ),
        // what it needs, said before the click: a paid key, about a minute (audit item 42)
        h(
          "span",
          { class: "nc-card-m" },
          T(lang, "With your AI assistant key (paid) · about 1 minute", "Avec votre clé d’assistant IA (payante) · environ 1 minute"),
        ),
      ),
    );
    const grid = h("div", { class: "nc-grid" }, ai, radios);
    const cards: HTMLElement[] = [];
    const select = (d: DeckStarter, focus = false) => {
      pick = d;
      cards.forEach((c) => {
        const on = c.dataset.deck === d.id;
        c.setAttribute("aria-checked", String(on));
        c.tabIndex = on ? 0 : -1;
        c.classList.toggle("on", on);
        if (on && focus) c.focus();
      });
      kitPanel?.setChosen(isKit(d));
      syncFoot();
    };
    list.forEach((d) => {
      const blank = d.id === BLANK_STARTER.id;
      const feature = d.hero !== undefined;
      const cover = h("div", {
        class: `nc-cover${blank ? " is-blank" : ""}`,
        "aria-hidden": "true",
      });
      const badge = d.badge
        ? h(
            "span",
            { class: `nc-badge is-${d.badge}` },
            h("i", { "aria-hidden": "true" }),
            loc(CAPABILITY[d.badge], lang),
          )
        : null;
      const card = h(
        "div",
        {
          class: `nc-card${feature ? " is-feature" : ""}`,
          role: "radio",
          tabindex: "-1",
          "aria-checked": "false",
          "data-deck": d.id,
        },
        cover,
        h(
          "span",
          { class: "nc-tick", "aria-hidden": "true" },
          svg("M5 12.5l4.5 4.5L19 7.5", 16),
        ),
        h(
          "div",
          { class: "nc-card-b" },
          badge,
          h("b", { class: "nc-card-t" }, starterName(d, lang)),
          h("span", { class: "nc-card-p" }, loc(d.pitch, lang)),
          h("span", { class: "nc-card-m" }, starterMeta(d, lang)),
        ),
      );
      card.addEventListener("click", () => select(d));
      card.addEventListener("keydown", (e) => {
        const i = list.indexOf(d);
        const k = e.key;
        if (k === " " || k === "Enter") {
          e.preventDefault();
          if (k === "Enter" && pick.id === d.id) void create();
          else select(d);
        } else if (k === "ArrowRight" || k === "ArrowDown") {
          e.preventDefault();
          select(list[(i + 1) % list.length], true);
        } else if (k === "ArrowLeft" || k === "ArrowUp") {
          e.preventDefault();
          select(list[(i - 1 + list.length) % list.length], true);
        }
      });
      cards.push(card);
      radios.append(card);
      if (blank) {
        cover.append(
          h("span", { class: "nc-plus" }, svg("M12 5v14M5 12h14", 22)),
        );
        return;
      }
      requestAnimationFrame(() => {
        if (!cover.isConnected) return;
        try {
          const scenes = d.scenes ? { scenes: d.scenes() } : {};
          // a showcase template plays its slide as the class will see it: the aircraft flies, the needles move
          // (only while the card is on screen; under reduced motion it rests on its telling picture)
          if (feature) {
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
    });
    const progName = program ? loc(programDef(program).code, lang) : "";

    // ---- « Adapter à mon terrain »: an ICAO code, the slides of that field as the starting point
    kitPanel = airfieldKitPanel({
      lang,
      idPrefix: "nc-afk",
      value: kitValue,
      kit,
      onReady: (k) => {
        kit = k;
        select(k.starter);
      },
      readyLine: () =>
        T(
          lang,
          "These slides are the starting point: “Create the course”, below.",
          "Ces diapos sont le point de départ : « Créer le cours », en bas.",
        ),
    });
    kitPanel.el.classList.add("nc-afk");

    // ---- already have slides? (only when the build can import a PDF)
    let importRow: HTMLElement | null = null;
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
      importRow = h(
        "div",
        { class: "nc-import" },
        h(
          "div",
          {},
          h(
            "b",
            {},
            T(
              lang,
              "Already have your slides?",
              "Vous avez déjà vos diapos ?",
            ),
          ),
          h(
            "span",
            {},
            T(
              lang,
              "Import a PDF: each page becomes a step you can complete.",
              "Importez un PDF : chaque page devient une étape que vous pourrez compléter.",
            ),
          ),
        ),
        b,
        file,
      );
    }

    // ---- the sticky bar: what will be made, Annuler, Créer le cours
    const what = h("p", { class: "nc-what", "aria-live": "polite" });
    const sum = h("p", { class: "nc-sum" });
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
        h("span", { class: "nc-sp" }),
        cancel,
        go,
      ),
    );
    function syncFoot() {
      sum.replaceChildren(
        h("span", { class: "nc-sum-k" }, T(lang, "Your course: ", "Votre cours : ")),
        starterSummary(pick, lang),
      );
      what.replaceChildren(
        T(lang, "Starting point: ", "Point de départ : "),
        h("b", {}, starterName(pick, lang)),
        ` · ${starterMeta(pick, lang).split(" · ")[0]}`,
      );
    }

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
            "Start from a template that is already laid out: you change the words, the instruments stay live. Everything can be changed afterwards.",
            "Partez d’un modèle déjà mis en page : vous changez les mots, les instruments restent vivants. Tout se modifie ensuite.",
          ),
        ),
        fields,
        h(
          "div",
          { class: "nc-h2row" },
          h(
            "h2",
            { class: "nc-h2" },
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
        kitPanel.el,
        grid,
        sum,
        importRow,
      ),
    );
    el.replaceChildren(bar, main, foot);
    select(pick);
    if (focusTitle) tIn.focus();
    else if (keepFocus)
      el.querySelector<HTMLElement>(`#${CSS.escape(keepFocus)}`)?.focus();
  };

  async function create() {
    if (busy) return;
    busy = true;
    el.classList.add("is-busy");
    try {
      const s = await o.store;
      if (!s) throw new Error("no store");
      const id = await s.newId(lang === "fr" ? "mon-cours" : "my-course");
      const c = buildNewCourse({
        id,
        lang,
        title,
        program,
        subject,
        starter: pick,
      });
      const r = await s.save(c);
      if (!r.ok) throw new Error(loc(r.message, lang));
      // the editor opens on slide 1; its « Simulateur » tab gets one tip (simTip.ts)
      if (pick.id !== BLANK_STARTER.id) armSimTip(lang);
      o.onCreated(r.course.id);
    } catch (e) {
      busy = false;
      el.classList.remove("is-busy");
      const msg = el.querySelector<HTMLElement>(".nc-what");
      if (msg)
        msg.textContent = T(
          lang,
          `The course could not be saved on this device (${(e as Error).message}).`,
          `Le cours n’a pas pu être enregistré sur cet appareil (${(e as Error).message}).`,
        );
    }
  }

  // the title field takes the focus on a desk (never pops a tablet's keyboard by itself)
  render(
    typeof matchMedia === "undefined" ||
      !matchMedia("(pointer: coarse)").matches,
  );
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
      kitPanel?.destroy();
      el.remove();
    },
  };
}
