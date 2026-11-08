// « Nouveau cours » (academy.html#new, UX logic §6): a page of its own, without the editor's chrome. The instructor
// names the course, says where it belongs (formation, optional subject), picks a starting point (the templates of
// that formation first, then the empty course) and creates it. NOTHING is saved before « Créer le cours »: leaving
// the page leaves the course store as it was. The pure parts (the order of the templates, the course that is made)
// are unit-tested.
import type { Course, L10n, Lang, ThemeId } from "../types";
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
import { renderThumb, type SlideView } from "../canvas/render";
import { courseMinutes } from "./templates";
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
  const lv = (d.level?.en ?? "").toUpperCase();
  const out: ProgramId[] = [];
  if (/PPL|LAPL/.test(lv)) out.push("ppl", "night", "club");
  if (/\bIR\b/.test(lv)) out.push("ir", "atpl");
  return out;
}
/** The templates in the order the page shows them: those of the chosen formation first, then the others, then the
 *  empty course (always last). */
export function startersFor(p: ProgramId | null): DeckStarter[] {
  const all = [...DECK_STARTERS];
  const mine = p ? all.filter((d) => starterFormations(d).includes(p)) : [];
  const rest = all.filter((d) => !mine.includes(d));
  return [...mine, ...rest, BLANK_STARTER];
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
    ? `${n} ${n > 1 ? "étapes" : "étape"}`
    : `${n} ${n > 1 ? "steps" : "step"}`;
  if (d.id === BLANK_STARTER.id) return steps;
  return `${steps} · ${fr ? "environ" : "about"} ${Math.max(1, starterMinutes(d))} min`;
}
const starterName = (d: DeckStarter, lang: Lang): string =>
  d.id === BLANK_STARTER.id
    ? lang === "fr"
      ? "Cours vide"
      : "Empty course"
    : loc(d.title, lang);

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
  const r = addStarterDeck(base, o.starter, { at: 0, theme: o.starter.theme });
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
  let busy = false;
  let views: SlideView[] = [];
  const el = h("div", { class: "nc-page" });
  root.append(el);

  const render = (focusTitle = false) => {
    for (const v of views.splice(0)) v.destroy();
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
            "Nothing is saved before « Create the course »",
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
      // the gallery follows the formation; the pick stays when it still exists
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
    if (!list.some((d) => d.id === pick.id)) pick = list[0];
    const grid = h("div", {
      class: "nc-grid",
      role: "radiogroup",
      "aria-label": T(lang, "Starting point", "Point de départ"),
    });
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
      syncFoot();
    };
    list.forEach((d) => {
      const blank = d.id === BLANK_STARTER.id;
      const cover = h("div", {
        class: `nc-cover${blank ? " is-blank" : ""}`,
        "aria-hidden": "true",
      });
      const card = h(
        "div",
        {
          class: "nc-card",
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
      grid.append(card);
      if (blank) {
        cover.append(
          h("span", { class: "nc-plus" }, svg("M12 5v14M5 12h14", 22)),
        );
        return;
      }
      requestAnimationFrame(() => {
        if (!cover.isConnected) return;
        try {
          views.push(
            renderThumb(starterSlide(d, 0, d.theme), cover, {
              lang,
              theme: d.theme,
            }),
          );
        } catch {
          /* a cover is decoration: the card still says what it is */
        }
      });
    });
    const progName = program ? loc(programDef(program).code, lang) : "";

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
              "Vous avez déjà vos diapositives ?",
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
                  `The ${progName} templates first`,
                  `Les modèles de la formation ${progName} d’abord`,
                ),
              )
            : null,
        ),
        grid,
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
      el.remove();
    },
  };
}
