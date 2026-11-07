// Ground school builder — "Start from a beautiful deck": whole starter decks built from the design system's
// archetypes (SPEC slides v2 §8), with real aviation content (hold entries, the 1-in-60 rule, the HSI, a
// checklist, a quiz, the takeaways). Used when a course is created (library), when a course has no step yet
// (the editor's empty state) and from the Templates panel. Pure data + one DOM picker; the slides themselves
// come from the engine's layoutCanvas() (we never draw a slide here).
import type {
  Course,
  L10n,
  Lang,
  SlideCanvas,
  SlideLayoutId,
  Step,
  ThemeId,
} from "../types";
import { h } from "../../ui/dom";
import { layoutCanvas } from "../canvas/layouts";
import { renderThumb, type SlideView } from "../canvas/render";
import { insertStep, linearText, makeStep } from "./templates";

const L = (en: string, fr: string): L10n => ({ en, fr });

export interface DeckStarter {
  id: string;
  title: L10n;
  /** one line: what the deck is for */
  pitch: L10n;
  /** the course theme it is built for (light classroom by default; cockpit only for a deck that needs dark slides) */
  theme: "cockpit" | "classroom";
  slides: SlideLayoutId[];
  /** the cover's words and its hero (the deck's signature diagram or instrument, from one of its archetypes) */
  cover?: DeckCover;
}

export interface DeckCover {
  eyebrow: L10n;
  title: L10n;
  subtitle: L10n;
  lead: L10n;
  foot: L10n;
  /** the hero comes from this archetype's first block of this kind (absent: the cover's quiet hold) */
  hero?: { from: SlideLayoutId; kind: "diagram" | "instrument" };
}

export const DECK_STARTERS: readonly DeckStarter[] = [
  {
    id: "hold-briefing",
    title: L("Hold briefing", "Briefing d’attente"),
    pitch: L(
      "Entry, timing and wind, then a question and Ready to fly",
      "Entrée, chronométrage et vent, puis une question et Prêt à voler",
    ),
    theme: "classroom",
    slides: ["cover", "heroDiagram", "stepByStep", "quiz", "ready"],
  },
  {
    id: "maths-lesson",
    title: L("Maths for IFR lesson", "Leçon de maths IFR"),
    pitch: L(
      "One rule in one number, its formula, a quiz and the takeaways",
      "Une règle en un chiffre, sa formule, un quiz et l’essentiel",
    ),
    theme: "classroom",
    slides: ["cover", "bigNumber", "formula", "quiz", "recap"],
    cover: {
      eyebrow: L("Ground school · Maths for IFR", "Théorie · Maths de l’IFR"),
      title: L("The 1 in 60 rule", "La règle du 1 sur 60"),
      subtitle: L("Off course, back on course", "Écart, puis retour sur la route"),
      lead: L(
        "One degree off is one mile off at sixty miles: work it out in your head, then fly it.",
        "Un degré d’erreur, un mille d’écart à soixante milles : le calcul de tête, puis en vol.",
      ),
      foot: L("5 slides · about 15 min · FAA IFH ch. 9", "5 diapos · environ 15 min · FAA IFH ch. 9"),
      hero: { from: "formula", kind: "diagram" },
    },
  },
  {
    id: "instrument-reading",
    title: L("Reading an instrument", "Lire un instrument"),
    pitch: L(
      "A live instrument with callouts, a before / after, the checklist",
      "Un instrument en direct annoté, un avant / après, la check-list",
    ),
    theme: "classroom",
    slides: ["cover", "instrumentNotes", "compare", "checklist", "recap"],
    cover: {
      eyebrow: L("Instruments · HSI", "Instruments · HSI"),
      title: L("Reading the HSI", "Lire le HSI"),
      subtitle: L("Heading, course, deviation", "Cap, route et écart"),
      lead: L(
        "What each needle says, where to look first, and how to fly back onto the course.",
        "Ce que dit chaque aiguille, où regarder d’abord, et comment rejoindre la route.",
      ),
      foot: L("5 slides · about 15 min · FAA IFH ch. 7", "5 diapos · environ 15 min · FAA IFH ch. 7"),
      hero: { from: "instrumentNotes", kind: "instrument" },
    },
  },
  {
    id: "ground-school",
    title: L("Ground-school theory", "Cours théorique"),
    pitch: L(
      "Section openers, a diagram, two columns, a quiz: for the classroom",
      "Ouvertures de partie, un schéma, deux colonnes, un quiz : pour la salle",
    ),
    theme: "classroom",
    slides: ["cover", "section", "heroDiagram", "twoColumn", "quiz", "recap"],
    cover: {
      eyebrow: L("Ground school · Holding", "Théorie · Attentes"),
      title: L("Holding patterns", "Les attentes"),
      subtitle: L("The theory, before the simulator", "La théorie, avant le simulateur"),
      lead: L(
        "Entries, timing and wind correction, for the classroom: then fly them at ARD.",
        "Entrées, chronométrage et correction de vent, en salle : puis en vol à ARD.",
      ),
      foot: L("6 slides · about 20 min · FAA AIM 5-3-8", "6 diapos · environ 20 min · FAA AIM 5-3-8"),
    },
  },
];

/** A blank starter: the cover only. */
export const BLANK_STARTER: DeckStarter = {
  id: "blank",
  title: L("Blank deck", "Présentation vierge"),
  pitch: L("A cover, then add your slides", "Une couverture, puis vos diapos"),
  theme: "classroom",
  slides: ["cover"],
};

export const starterById = (id: string): DeckStarter =>
  DECK_STARTERS.find((d) => d.id === id) ?? BLANK_STARTER;

/**
 * A deck's cover: the cover archetype (its frames and fresh ids) with the deck's words, and its hero swapped for the
 * deck's signature diagram or instrument (taken from one of its archetypes, placed in the hero frame).
 */
export function deckCover(
  d: DeckStarter,
  o: { theme?: ThemeId; scene?: string } = {},
): SlideCanvas {
  const cv = d.cover;
  const slide = layoutCanvas("cover", {
    ...(o.theme ? { theme: o.theme } : {}),
    ...(o.scene ? { scene: o.scene } : {}),
    ...(cv ? { title: cv.title, subtitle: cv.subtitle, byline: cv.foot } : {}),
  });
  if (!cv) return slide;
  for (const b of slide.blocks)
    if (b.kind === "text" && (b.style === "eyebrow" || b.style === "label")) b.text = { ...cv.eyebrow };
    else if (b.kind === "text" && (b.style === "lead" || b.style === "subtitle")) b.text = { ...cv.lead };
  if (cv.hero) {
    const src = layoutCanvas(cv.hero.from, o.scene ? { scene: o.scene } : {}).blocks.find(
      (b) => b.kind === cv.hero!.kind,
    );
    const at = slide.blocks.findIndex((b) => b.kind === "diagram");
    if (src && at >= 0) {
      const old = slide.blocks[at].frame;
      // an instrument is square (720, centred in the hero frame); a diagram fills the frame's middle
      const frame =
        src.kind === "instrument"
          ? { ...old, x: old.x + (old.w - 720) / 2, y: old.y + (old.h - 720) / 2, w: 720, h: 720 }
          : { ...old, y: old.y + 120, h: old.h - 240 };
      slide.blocks[at] = { ...JSON.parse(JSON.stringify(src)), id: "hero", frame };
    }
  }
  return slide;
}
/** "The 1 in 60 rule: off course, back on course" (the course and cover step title of a deck). */
export function deckTitle(d: DeckStarter): L10n | null {
  const c = d.cover;
  if (!c) return null;
  const low = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
  return {
    en: `${c.title.en}: ${low(c.subtitle.en)}`,
    fr: `${c.title.fr} : ${low(c.subtitle.fr ?? c.subtitle.en)}`,
  };
}
/** The cover slide with the deck's own words, in place of the made step's. */
function withCover(step: Step, d: DeckStarter): Step {
  const slide = deckCover(d, step.slide?.scene ? { scene: step.slide.scene } : {});
  delete slide.theme;
  const title = deckTitle(d) ?? step.title;
  return { ...step, title, slide, reader: linearText(slide) };
}
/** The slide a deck card shows: the deck's cover, then its archetypes. */
export function starterSlide(d: DeckStarter, i: number, theme: ThemeId): SlideCanvas {
  const id = d.slides[i];
  if (id === "cover") return deckCover(d, { theme });
  return layoutCanvas(id, { theme });
}

/**
 * Append a starter's slides to a course (after `at`, default the end). The course theme is set to the starter's
 * when the course is new (no step yet) or when `theme` is given. Returns the new course and the first new step.
 */
export function addStarterDeck(
  course: Course,
  starter: DeckStarter,
  o: { at?: number; theme?: ThemeId; title?: L10n } = {},
): { course: Course; firstStepId: string | null } {
  let c: Course = course;
  const fresh = !course.steps.length;
  if (fresh || o.theme) c = { ...c, theme: o.theme ?? starter.theme };
  let at = o.at ?? c.steps.length;
  let first: string | null = null;
  for (const id of starter.slides) {
    const r = makeStep(c, "slide", {
      layout: id,
      ...(id === "cover" && o.title ? { title: o.title } : {}),
    });
    let step = r.step;
    if (id === "cover" && starter.cover && !o.title) step = withCover(step, starter);
    c = insertStep(r.course, step, at++);
    first ??= step.id;
  }
  return { course: c, firstStepId: first };
}

/**
 * The starter gallery: one card per deck, its cover drawn live by the renderer with the next slides as a strip,
 * plus the blank deck. `theme` re-draws the cards (the "light (recommended) / dark" switch).
 */
export function deckStarterGallery(
  lang: Lang,
  course: Pick<Course, "brand" | "scenes" | "cockpit">,
  onPick: (s: DeckStarter, theme: ThemeId) => void,
  o: { theme?: "cockpit" | "classroom" | "auto"; compact?: boolean } = {},
): { el: HTMLElement; destroy(): void } {
  const fr = lang === "fr";
  const views: SlideView[] = [];
  const el = h("div", { class: `ce-decks${o.compact ? " compact" : ""}` });
  let mode: "cockpit" | "classroom" | "auto" = o.theme ?? "auto";
  const grid = h("div", { class: "ce-decks-grid" });
  const draw = () => {
    for (const v of views.splice(0)) v.destroy();
    grid.replaceChildren();
    for (const d of [...DECK_STARTERS, BLANK_STARTER]) {
      const theme: ThemeId = mode === "auto" ? d.theme : mode;
      const cover = h("div", { class: "ce-deck-cover" });
      const strip = h("div", { class: "ce-deck-strip" });
      const card = h(
        "button",
        {
          type: "button",
          class: `ce-deck${d.id === "blank" ? " is-blank" : ""}`,
          "data-deck": d.id,
        },
        cover,
        h(
          "span",
          { class: "ce-deck-tx" },
          h("b", {}, d.title[fr ? "fr" : "en"] ?? d.title.en),
          h("small", {}, d.pitch[fr ? "fr" : "en"] ?? d.pitch.en),
          h(
            "span",
            { class: "ce-deck-meta" },
            `${d.slides.length} ${fr ? (d.slides.length > 1 ? "diapos" : "diapo") : d.slides.length > 1 ? "slides" : "slide"} · ${
              theme === "classroom"
                ? fr
                  ? "Salle de cours"
                  : "Classroom"
                : "Cockpit"
            }`,
          ),
        ),
        d.slides.length > 1 ? strip : null,
      );
      card.addEventListener("click", () => onPick(d, theme));
      grid.append(card);
      const opts = {
        lang,
        theme,
        brand: course.brand,
        scenes: course.scenes,
        cockpit: course.cockpit,
      };
      const job = () => {
        try {
          views.push(
            renderThumb(starterSlide(d, 0, theme), cover, opts),
          );
          d.slides.slice(1, 6).forEach((_, k) => {
            const t = h("div", { class: "ce-deck-mini" });
            strip.append(t);
            views.push(renderThumb(starterSlide(d, k + 1, theme), t, opts));
          });
        } catch {
          /* a thumbnail is decoration */
        }
      };
      requestAnimationFrame(job);
    }
  };
  const seg = h("div", {
    class: "ce-seg ce-decks-theme",
    role: "radiogroup",
    "aria-label": fr ? "Thème" : "Theme",
  });
  const segOpts: [typeof mode, string][] = [
    ["auto", fr ? "Clair (recommandé)" : "Light (recommended)"],
    ["cockpit", fr ? "Sombre, pour la nuit ou l’IMC" : "Dark, for night or IMC"],
  ];
  const drawSeg = () => {
    seg.replaceChildren(
      ...segOpts.map(([v, label]) => {
        const b = h(
          "button",
          {
            type: "button",
            role: "radio",
            class: mode === v ? "on" : "",
            "aria-checked": mode === v ? "true" : "false",
          },
          label,
        );
        b.addEventListener("click", () => {
          if (mode === v) return;
          mode = v;
          drawSeg();
          draw();
        });
        return b;
      }),
    );
  };
  drawSeg();
  el.append(seg, grid);
  draw();
  return {
    el,
    destroy() {
      for (const v of views.splice(0)) v.destroy();
    },
  };
}
