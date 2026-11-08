// Ground school builder — "Start from a beautiful deck": whole starter decks built from the design system's
// archetypes (SPEC slides v2 §8), with real aviation content (hold entries, the 1-in-60 rule, the HSI, a
// checklist, a quiz, the takeaways). Used when a course is created (library), when a course has no step yet
// (the editor's empty state) and from the Templates panel. Pure data + one DOM picker; the slides themselves
// come from the engine's layoutCanvas() (we never draw a slide here).
import type {
  Course,
  DiagramSpec,
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
import { AIRSPACE_DIAGRAM, AIRSPACE_SLIDES, CG_DIAGRAM, WB_SLIDES } from "./deckVfr";

const L = (en: string, fr: string): L10n => ({ en, fr });

export interface DeckStarter {
  id: string;
  title: L10n;
  /** one line: what the deck is for */
  pitch: L10n;
  /** the course theme it is built for (light classroom by default; cockpit only for a deck that needs dark slides) */
  theme: "cockpit" | "classroom";
  slides: SlideLayoutId[];
  /** the licence level it teaches (shown on its card): "LAPL / PPL", "IR"… */
  level?: L10n;
  /** whole slides written for this deck, by slide index (they replace the archetype of that index) */
  make?: Partial<Record<number, (theme?: ThemeId) => SlideCanvas>>;
  /** the cover's words and its hero (the deck's signature diagram or instrument, from one of its archetypes) */
  cover?: DeckCover;
}

export interface DeckCover {
  eyebrow: L10n;
  title: L10n;
  subtitle: L10n;
  lead: L10n;
  foot: L10n;
  /** the hero comes from this archetype's first block of this kind, or is this diagram (absent: the cover's quiet hold) */
  hero?: { from: SlideLayoutId; kind: "diagram" | "instrument" } | { d: DiagramSpec };
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
    level: L("IR", "IR"),
    slides: ["cover", "heroDiagram", "stepByStep", "quiz", "ready"],
    cover: {
      eyebrow: L("Ground school · Holding", "Théorie · Attentes"),
      title: L("Holding", "L’attente"),
      subtitle: L("Entries, timing and wind", "Entrées, chronométrage et vent"),
      lead: L(
        "Read the clearance, pick the entry, time it, correct for the wind — then fly the hold at ARD.",
        "Lire la clairance, choisir l’entrée, chronométrer, corriger le vent — puis voler l’attente à ARD.",
      ),
      foot: L("FAA AIM 5-3-8", "FAA AIM 5-3-8"),
      hero: { from: "heroDiagram", kind: "diagram" },
    },
  },
  {
    id: "weight-balance",
    title: L("Weight and balance", "Masse et centrage"),
    pitch: L(
      "Weight, moment, the envelope, then a question and the checks",
      "Masse, moment, l’enveloppe, puis une question et les vérifications",
    ),
    theme: "classroom",
    level: L("LAPL / PPL", "LAPL / PPL"),
    slides: ["cover", "heroDiagram", "quiz", "recap"],
    make: { 1: WB_SLIDES[0], 2: WB_SLIDES[1], 3: WB_SLIDES[2] },
    cover: {
      eyebrow: L("Ground school · Weight and balance", "Théorie · Masse et centrage"),
      title: L("Weight and balance", "Masse et centrage"),
      subtitle: L("Inside the envelope, every flight", "Dans l’enveloppe, à chaque vol"),
      lead: L(
        "Weigh the loaded aircraft, work out the moment, place the point: outside the envelope, you do not take off.",
        "Peser l’avion chargé, calculer le moment, placer le point : hors de l’enveloppe, on ne décolle pas.",
      ),
      foot: L("POH section 6", "Manuel de vol (POH) · section 6"),
      hero: { d: CG_DIAGRAM },
    },
  },
  {
    id: "airspace",
    title: L("Airspace classes", "Les espaces aériens"),
    pitch: L(
      "A cross-section to read, a question, what to check before the flight",
      "Une coupe à lire, une question, ce qu’il faut vérifier avant le vol",
    ),
    theme: "classroom",
    level: L("LAPL / PPL", "LAPL / PPL"),
    slides: ["cover", "heroDiagram", "quiz", "recap"],
    make: { 1: AIRSPACE_SLIDES[0], 2: AIRSPACE_SLIDES[1], 3: AIRSPACE_SLIDES[2] },
    cover: {
      eyebrow: L("Ground school · Airspace", "Théorie · Espaces aériens"),
      title: L("Airspace classes", "Les espaces aériens"),
      subtitle: L("Where you need a clearance", "Où faut-il une clairance ?"),
      lead: L(
        "Class G, E and D, the control zone and the TMA: read the chart before you plan the route.",
        "Classes G, E et D, la zone de contrôle et la TMA : lire la carte avant de préparer la navigation.",
      ),
      foot: L("SERA.6001 · VFR chart", "SERA.6001 · carte VFR"),
      hero: { d: AIRSPACE_DIAGRAM },
    },
  },
  {
    id: "maths-lesson",
    title: L("Maths for IFR lesson", "Leçon de maths IFR"),
    pitch: L(
      "One rule in one number, its formula, a quiz and the takeaways",
      "Une règle en un chiffre, sa formule, un quiz et l’essentiel",
    ),
    theme: "classroom",
    level: L("PPL / IR", "PPL / IR"),
    slides: ["cover", "bigNumber", "formula", "quiz", "recap"],
    cover: {
      eyebrow: L("Ground school · Maths for IFR", "Théorie · Maths de l’IFR"),
      title: L("The 1 in 60 rule", "La règle du 1 sur 60"),
      subtitle: L("Off course, back on course", "Écart, puis retour sur la route"),
      lead: L(
        "One degree off is one mile off at sixty miles: work it out in your head, then fly it.",
        "Un degré d’erreur, un mille d’écart à soixante milles : le calcul de tête, puis en vol.",
      ),
      foot: L("FAA IFH ch. 9", "FAA IFH ch. 9"),
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
    level: L("IR", "IR"),
    slides: ["cover", "instrumentNotes", "compare", "checklist", "recap"],
    cover: {
      eyebrow: L("Instruments · HSI", "Instruments · HSI"),
      title: L("Reading the HSI", "Lire le HSI"),
      subtitle: L("Heading, course, deviation", "Cap, route et écart"),
      lead: L(
        "What each needle says, where to look first, and how to fly back onto the course.",
        "Ce que dit chaque aiguille, où regarder d’abord, et comment rejoindre la route.",
      ),
      foot: L("FAA IFH ch. 7", "FAA IFH ch. 7"),
      hero: { from: "instrumentNotes", kind: "instrument" },
    },
  },
];

/** Start from scratch: one truly blank slide (no sample words, no diagram). */
export const BLANK_STARTER: DeckStarter = {
  id: "blank",
  title: L("Start from scratch", "Partir de zéro"),
  pitch: L("One blank slide: you compose it", "Une diapo vierge, à composer vous-même"),
  theme: "classroom",
  slides: ["blank"],
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
  if (cv.hero && "d" in cv.hero) {
    const at = slide.blocks.findIndex((b) => b.kind === "diagram");
    if (at >= 0) {
      const old = slide.blocks[at];
      slide.blocks[at] = {
        ...old,
        id: "hero",
        frame: { ...old.frame, y: old.frame.y + 120, h: old.frame.h - 240 },
        kind: "diagram",
        d: JSON.parse(JSON.stringify(cv.hero.d)) as DiagramSpec,
        alt: cv.title,
      } as SlideCanvas["blocks"][number];
    }
  } else if (cv.hero) {
    const hero = cv.hero;
    const src = layoutCanvas(hero.from, o.scene ? { scene: o.scene } : {}).blocks.find(
      (b) => b.kind === hero.kind,
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
  const made = d.make?.[i];
  if (made) return { ...made(theme), layout: id };
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
  for (const [i, id] of starter.slides.entries()) {
    const r = makeStep(c, "slide", {
      layout: id,
      ...(id === "cover" && o.title ? { title: o.title } : {}),
    });
    let step = r.step;
    if (id === "cover" && starter.cover && !o.title) step = withCover(step, starter);
    const made = starter.make?.[i];
    if (made) {
      const slide: SlideCanvas = { ...made(), layout: id };
      // the step is titled by the slide's own title
      const t = slide.blocks.find((b) => b.kind === "text" && b.style === "title");
      const title = t && t.kind === "text" ? { ...t.text } : step.title;
      step = { ...step, title, slide, reader: linearText(slide) };
    }
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
            d.id === "blank"
              ? fr
                ? "1 diapo vierge"
                : "1 blank slide"
              : [
                  d.level ? (fr ? (d.level.fr ?? d.level.en) : d.level.en) : "",
                  `${d.slides.length} ${fr ? (d.slides.length > 1 ? "diapos" : "diapo") : d.slides.length > 1 ? "slides" : "slide"}`,
                  theme === "classroom" ? (fr ? "Clair" : "Light") : fr ? "Sombre" : "Dark",
                ]
                  .filter(Boolean)
                  .join(" · "),
          ),
        ),
        d.slides.length > 1 ? strip : null,
      );
      card.addEventListener("click", () => onPick(d, theme));
      grid.append(card);
      if (d.id === "blank") {
        // a truly empty cover: the card says what you get
        cover.append(
          h(
            "span",
            { class: "ce-deck-empty", "aria-hidden": "true" },
            h("i", {}, "+"),
            h("span", {}, fr ? "Diapo vierge" : "Blank slide"),
          ),
        );
        continue;
      }
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
    ["cockpit", fr ? "Sombre" : "Dark"],
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
