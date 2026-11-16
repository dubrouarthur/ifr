// Ground school builder — the studio around the slide canvas ("the Canva of aviation"):
//   rail    Templates · Text · Elements · Instruments · Diagrams · Media · Interactive · Brand · Cockpit
//   panel   the open rail tab: the template gallery (live-rendered archetypes and composed examples, whole decks,
//           the interactive step kinds), the asset library (live instruments and diagrams, tap or drag onto the
//           slide), uploads, the school's brand kit, the cockpit captures
//   empty   the empty-slide card that teaches the builder in ten seconds
// The editor (editor.ts) owns the course, the history and the canvas; this module only builds DOM and calls the
// host. Every word is FR / EN; every control is 44 px on a coarse pointer.
import type {
  Course,
  Lang,
  SchoolBrand,
  SlideCanvas,
  SlideLayoutId,
  ThemeId,
} from "../types";
import { h } from "../../ui/dom";
import { LAYOUTS, layoutCanvas } from "../canvas/layouts";
import { renderThumb, type SlideView } from "../canvas/render";
import { exampleSlides, exampleScenes } from "../canvas/examples";
import { LibraryPanel } from "../canvas/libraryPanel";
import type { BlockDraft, LibraryTab } from "../canvas/factory";
import { baseThemeId } from "../canvas/themes";
import { KINDS } from "./reader";
import { TEMPLATES, titleOfSlide, tr, type TemplateId } from "./templates";
import type { DeckStarter } from "./deckStarters";
import {
  SIM_CONTENTS,
  mainInstrument,
  posLine,
  sceneOfSituation,
  sitLabel,
  situationOfScene,
  type SimContentKind,
} from "../situations";
import {
  SituationEditor,
  readyGrid,
  type SitTarget,
  type SituationHost,
} from "./situationEditor";

/** the paste shortcut as the platform writes it */
const PASTE_KEY =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
    ? "⌘V"
    : "Ctrl+V";

export type RailTab =
  | "templates"
  | "text"
  | "elements"
  | "instruments"
  | "diagrams"
  | "media"
  | "interactive"
  | "brand"
  | "cockpit";

const SVGNS = "http://www.w3.org/2000/svg";
// rail glyphs: 24 × 24 strokes
const RAIL_ICON: Record<RailTab, string> = {
  templates: "M4 4h7v9H4z M13 4h7v5h-7z M13 11h7v9h-7z M4 15h7v5H4z",
  text: "M5 6V4h14v2 M12 4v16 M9 20h6",
  elements:
    "M4 14l5-9 5 9z M15 5h5v5h-5z M15.5 17.5a2.5 2.5 0 1 0 5 0a2.5 2.5 0 0 0-5 0 M4 19h9",
  instruments:
    "M12 21a8 8 0 1 0 0-16a8 8 0 0 0 0 16z M12 13l4-4 M12 7v1.5 M7 13h1.5 M15.5 13H17",
  diagrams: "M7 8h10a4 4 0 0 1 0 8H7a4 4 0 0 1 0-8z M3 12h0.5 M7 16l-2 3",
  media: "M4 5h16v14H4z M4 15l4-4 4 4 3-3 5 5 M15 9.5a1.5 1.5 0 1 0 0-.01",
  interactive:
    "M9 9a3 3 0 1 1 4 2.8c-.8.4-1 1-1 1.7V14 M12 17.5v.5 M4 4h16v16H4z",
  brand: "M5 20V5h9l-1.5 3.5L14 12H5 M5 4v17",
  cockpit: "M3 17l9-9 9 9 M7 13v6h10v-6 M12 3v5",
};
const RAIL_LABEL: Record<RailTab, [string, string]> = {
  templates: ["Templates", "Modèles"],
  text: ["Text", "Texte"],
  elements: ["Shapes", "Formes"],
  instruments: ["Instruments", "Instruments"],
  diagrams: ["Diagrams", "Schémas"],
  media: ["Media", "Médias"],
  interactive: ["Questions", "Questions"],
  brand: ["Club logo", "Logo du club"],
  cockpit: ["Simulator", "Simulateur"],
};
const RAIL_HINT: Record<RailTab, [string, string]> = {
  templates: [
    "Designed slides with real aviation content: tap to add",
    "Des diapos composées avec un vrai contenu aviation : touchez pour ajouter",
  ],
  text: ["Type styles of the course theme", "Les styles de texte du thème"],
  elements: [
    "Shapes, arrows, callouts, markers",
    "Formes, flèches, légendes, repères",
  ],
  instruments: [
    "Live instruments: drag one onto the slide",
    "Instruments en direct : glissez-en un sur la diapo",
  ],
  diagrams: [
    "Hold entry, 1 in 60, 3° path, VDP, wind triangle, airspace…",
    "Entrée en attente, 1 sur 60, plan à 3°, VDP, triangle des vents, espaces…",
  ],
  media: [
    "Pictures, shapes, diagrams and your club’s logo",
    "Images, formes, schémas et le logo du club",
  ],
  interactive: [
    "A question, a calculation, a checklist the simulator ticks",
    "Une question, un calcul, une check-list cochée par le simulateur",
  ],
  brand: [
    "Your school's logo and colour on every slide",
    "Le logo et la couleur de l’école sur chaque diapo",
  ],
  cockpit: [
    "What the aircraft does, and the student at the controls",
    "Ce que fait l’avion, et l’élève aux commandes",
  ],
};
/** The rail, in the order a creator thinks: a slide, its words, its instruments, the simulator, a question, the
 *  rest (images, shapes, diagrams, club logo under « Médias »). Shapes, diagrams and the logo stay tabs of their
 *  own inside « Médias » (and for older callers of show()). */
export const RAIL_TABS: readonly RailTab[] = [
  "templates",
  "text",
  "instruments",
  "cockpit",
  "interactive",
  "media",
];
/** the parts of « Médias », in order */
const MEDIA_PARTS: readonly RailTab[] = ["media", "elements", "diagrams", "brand"];
const MEDIA_PART_LABEL: Record<string, [string, string]> = {
  media: ["Images", "Images"],
  elements: ["Shapes", "Formes"],
  diagrams: ["Diagrams", "Schémas"],
  brand: ["Club logo", "Logo du club"],
};
let MEDIA_PART: RailTab = "media";
/** Rail tabs that add blocks to a designed slide (off on a Reader + Stage step). */
export const SLIDE_ONLY: ReadonlySet<RailTab> = new Set([
  "text",
  "elements",
  "instruments",
  "diagrams",
  "media",
  "interactive",
]);
const LIB_TABS: Partial<Record<RailTab, LibraryTab[]>> = {
  text: ["text"],
  elements: ["shapes"],
  instruments: ["instruments"],
  diagrams: ["diagrams"],
  media: ["photos", "icons"],
  interactive: ["interactive"],
};

export function railIcon(tab: RailTab | string, path?: string): SVGSVGElement {
  const s = document.createElementNS(SVGNS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", "ce-i");
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS(SVGNS, "path");
  p.setAttribute("d", path ?? RAIL_ICON[tab as RailTab] ?? "");
  s.append(p);
  return s;
}
export const railLabel = (t: RailTab, lang: Lang): string =>
  RAIL_LABEL[t][lang === "fr" ? 1 : 0];

/** What the studio needs from the editor. */
export interface StudioHost {
  readonly lang: Lang;
  readonly course: Course;
  /** the current step is a designed slide */
  readonly onSlide: boolean;
  /** the current slide has no block */
  readonly slideEmpty: boolean;
  /** add a block to the slide at its centre */
  addDraft(d: BlockDraft): void;
  dropDraft(d: BlockDraft, clientX: number, clientY: number): boolean;
  isOverSlide(clientX: number, clientY: number): boolean;
  /** a new step from a template (after the current one) */
  addTemplate(id: TemplateId, o?: { layout?: SlideLayoutId }): void;
  /** the current slide takes this layout (one undo step) */
  replaceLayout(id: SlideLayoutId): void;
  /** a composed example slide as a new step (its scenes join the course) */
  addSlide(
    slide: SlideCanvas,
    title: { en: string; fr?: string },
    scenes?: Course["scenes"],
  ): void;
  addDeck(s: DeckStarter, theme: ThemeId): void;
  setCourse(c: Course, key?: string): void;
  importImage(
    file: File,
  ): Promise<{ asset: string; w: number; h: number } | null>;
  addImageFile(file: File): void;
  assetUrl(id: string): string | null | Promise<string | null>;
  /** the tray of cockpit captures (moved into the Cockpit panel) */
  trayEl: HTMLElement;
  /** a block was added from the panel (the host may close an overlay panel) */
  afterAdd?(): void;
  /** the « Situation de vol » plumbing (ui/situationEditor.ts): the Simulateur panel sets the slide's situation */
  readonly situations?: SituationHost;
  /** the selected instrument or simulator view, when there is exactly one */
  readonly simSelection?: string;
  /** one of the four simulator contents on the slide, ready to work */
  addSim?(kind: SimContentKind): void;
  /** a blank slide after the current step */
  newSlide?(): void;
}

/** the way to get a situation the author used last in the Simulateur panel */
let SIM_WAY: "set" | "ready" | "fly" = "set";
/** the three ways are folded until asked for (back from the cockpit they open on « Voler et capturer ») */
let SIM_OPEN = false;
/** Open the Simulateur panel on one of its three ways (back from the cockpit: on « Voler et capturer »). */
export function setSimWay(w: "set" | "ready" | "fly") {
  SIM_WAY = w;
  SIM_OPEN = true;
}
// the four simulator contents, drawn (our own constant strings)
const SIM_ART: Record<SimContentKind, string> = {
  live: '<circle cx="48" cy="32" r="22"/><path d="M48 32l12-12"/><path d="M48 14v4M30 32h4M62 32h4"/><path d="M78 20c4 7 4 17 0 24M84 15c6 10 6 24 0 34" stroke-opacity=".45"/>',
  yourTurn:
    '<circle cx="38" cy="28" r="19"/><path d="M38 28l9-10"/><circle cx="74" cy="44" r="10"/><path d="M74 38v6"/><path d="M60 58h28" stroke-opacity=".45"/>',
  moment:
    '<rect x="12" y="10" width="72" height="44" rx="5"/><path d="M12 38c16-5 38-7 72-2" stroke-opacity=".5"/><path d="M42 23v18l15-9z" fill="currentColor" stroke="none"/>',
  flight:
    '<rect x="10" y="10" width="62" height="44" rx="5"/><path d="M10 36h62" stroke-opacity=".45"/><path d="M28 30h26M41 22v16"/><path d="M82 12v42"/><path d="M82 14h10l-3 5 3 5H82" fill="currentColor" fill-opacity=".2"/>',
};

const t2 = (lang: Lang, en: string, fr: string) => (lang === "fr" ? fr : en);

/** Gallery sections: the archetypes by teaching intent, most used first. */
const SECTIONS: { title: [string, string]; ids: SlideLayoutId[] }[] = [
  { title: ["Open", "Ouvrir"], ids: ["cover", "section", "title"] },
  {
    title: ["Explain", "Expliquer"],
    ids: [
      "heroDiagram",
      "instrumentNotes",
      "stepByStep",
      "compare",
      "twoColumn",
      "fullBleed",
    ],
  },
  { title: ["Work it out", "Calculer"], ids: ["formula", "bigNumber", "calc"] },
  { title: ["Check", "Vérifier"], ids: ["quiz", "checklist", "yourTurn"] },
  { title: ["Wrap up", "Conclure"], ids: ["recap", "ready", "blank"] },
];

export class StudioPanel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private titleEl: HTMLElement;
  private hintEl: HTMLElement;
  tab: RailTab | null = null;
  private lib: LibraryPanel | null = null;
  /** the situation form and the ready situations of the Simulateur panel (they hold instruments) */
  private simParts: { destroy(): void }[] = [];
  private views: SlideView[] = [];
  private io: IntersectionObserver | null = null;
  private decks: { destroy(): void } | null = null;
  constructor(
    private host: StudioHost,
    private onClose: () => void,
  ) {
    this.titleEl = h("h2", { class: "ce-panel-t" });
    this.hintEl = h("p", { class: "ce-panel-hint" });
    const x = h(
      "button",
      {
        type: "button",
        class: "ce-btn ic ghost ce-panel-x",
        "aria-label": t2(host.lang, "Close the panel", "Fermer le panneau"),
        title: t2(host.lang, "Close the panel", "Fermer le panneau"),
      },
      railIcon("x", "M6 6l12 12 M18 6L6 18"),
    );
    x.addEventListener("click", () => this.onClose());
    this.body = h("div", { class: "ce-panel-b" });
    this.el = h(
      "section",
      { class: "ce-panel", "aria-label": "", hidden: "" },
      h(
        "header",
        { class: "ce-panel-hd" },
        h("div", {}, this.titleEl, this.hintEl),
        x,
      ),
      this.body,
    );
  }
  get open(): boolean {
    return this.tab !== null;
  }
  /** drawing a part of « Médias » */
  private inMedia = false;
  /** « Médias »: Images · Formes · Schémas · Logo du club, one choice at the top, the part below. */
  private media() {
    const lang = this.host.lang;
    const part = MEDIA_PART;
    this.inMedia = true;
    try {
      if (part === "brand") this.brand();
      else this.library(part);
    } finally {
      this.inMedia = false;
    }
    const bar = h("div", {
      class: "ce-subtabs",
      role: "radiogroup",
      "aria-label": t2(lang, "What to add", "Quoi ajouter"),
    });
    for (const p of MEDIA_PARTS) {
      const on = p === part;
      const b = h(
        "button",
        { type: "button", role: "radio", "aria-checked": on ? "true" : "false", class: on ? "on" : "" },
        MEDIA_PART_LABEL[p][lang === "fr" ? 1 : 0],
      );
      b.addEventListener("click", () => {
        if (on) return;
        MEDIA_PART = p;
        this.show("media");
      });
      bar.append(b);
    }
    this.hintEl.textContent = RAIL_HINT[part][lang === "fr" ? 1 : 0];
    this.body.prepend(bar);
  }
  show(tab: RailTab) {
    this.teardown();
    this.tab = tab;
    const lang = this.host.lang;
    this.el.hidden = false;
    this.el.dataset.tab = tab;
    this.el.setAttribute("aria-label", railLabel(tab, lang));
    this.titleEl.textContent = railLabel(tab, lang);
    this.hintEl.textContent = RAIL_HINT[tab][lang === "fr" ? 1 : 0];
    if (tab === "templates") this.templates();
    else if (MEDIA_PARTS.includes(tab) && RAIL_TABS.includes("media") && tab !== "media" && !this.inMedia) {
      // an older caller opens a part of « Médias »: open « Médias » on that part
      MEDIA_PART = tab;
      this.show("media");
      return;
    } else if (tab === "media") this.media();
    else if (tab === "brand") this.brand();
    else if (tab === "cockpit") this.simulator();
    else this.library(tab);
  }
  hide() {
    this.teardown();
    this.tab = null;
    this.el.hidden = true;
  }
  /** re-draw the open tab (language, theme or slide changed) */
  refresh() {
    if (this.tab) this.show(this.tab);
  }
  destroy() {
    this.teardown();
    this.el.remove();
  }
  private teardown() {
    this.lib?.destroy();
    this.lib = null;
    for (const v of this.views.splice(0)) v.destroy();
    this.io?.disconnect();
    this.io = null;
    this.decks?.destroy();
    this.decks = null;
    for (const p of this.simParts.splice(0)) p.destroy();
    this.body.replaceChildren();
  }

  // ---------------------------------------------------------------- the Simulateur panel
  /**
   * Everything the simulator brings to a slide, in one place: four things to add (each lands ready to work), then
   * the flight situation of the slide and three ways to get one: set it here, start from a ready one, or fly and
   * capture.
   */
  private simulator() {
    const host = this.host;
    const lang = host.lang;
    const T = (en: string, fr: string) => t2(lang, en, fr);
    const S = host.situations;
    const out: Node[] = [];
    // ---- add
    const cards = h("div", { class: "sim-add", role: "list" });
    for (const c of SIM_CONTENTS) {
      const art = h("span", { class: "sim-add-art", "aria-hidden": "true" });
      art.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${SIM_ART[c.kind]}</svg>`;
      const b = h(
        "button",
        { type: "button", class: "sim-add-b", role: "listitem", "data-sim": c.kind },
        art,
        h("span", { class: "sim-add-t" }, h("b", {}, tr(c.name, lang)), h("span", {}, tr(c.line, lang))),
      );
      b.disabled = !host.onSlide || !host.addSim;
      b.addEventListener("click", () => host.addSim?.(c.kind));
      cards.append(b);
    }
    out.push(h("h3", { class: "sim-h" }, T("Add to the slide", "Ajouter à la diapo")), cards);
    if (!host.onSlide) {
      const add = h(
        "button",
        { type: "button", class: "ce-btn sm" },
        h("span", {}, T("New slide", "Nouvelle diapo")),
      );
      add.addEventListener("click", () => host.newSlide?.());
      out.push(
        h(
          "div",
          { class: "ce-panel-off" },
          h(
            "p",
            {},
            T(
              "These go on a slide. Pick a slide in the strip below, or start a new one.",
              "Ces éléments vont sur une diapo. Choisissez une diapo dans la bande du bas, ou commencez-en une.",
            ),
          ),
          host.newSlide ? add : null,
        ),
      );
      this.body.replaceChildren(...out, host.trayEl);
      return;
    }
    if (!S) {
      this.body.replaceChildren(...out, host.trayEl);
      return;
    }
    // ---- the situation of the slide (or of the selected element, when it has its own)
    const sel = host.simSelection;
    const read = S.read(sel);
    const target = (): SitTarget => {
      const id = host.simSelection;
      const r = S.read(id);
      return r.own && id ? { kind: "block", id, from: "panel" } : { kind: "slide", from: "panel" };
    };
    let sit = situationOfScene(read.scene);
    const headName = h("b", {}, sitLabel(sit));
    const headPos = h("span", {}, posLine(sit.pos, lang));
    const paint = () => {
      headName.textContent = sitLabel(sit);
      headPos.textContent = posLine(sit.pos, lang);
    };
    out.push(
      h(
        "h3",
        { class: "sim-h" },
        read.own ? T("The situation of the selected element", "La situation de l’élément sélectionné") : T("The flight situation of this slide", "La situation de vol de cette diapo"),
      ),
      h("div", { class: "sit-head" }, headName, headPos),
      h(
        "p",
        { class: "ce-panel-note" },
        read.own
          ? T("Only this element shows it.", "Seul cet élément la montre.")
          : T("Every instrument of the slide shows it.", "Tous les instruments de la diapo la montrent."),
      ),
    );
    const ways: { id: typeof SIM_WAY; label: string; line: string }[] = [
      {
        id: "set",
        label: T("Set it here", "Régler ici"),
        line: T("Heading, altitude, speed, power… with sliders.", "Cap, altitude, vitesse, puissance… avec des curseurs."),
      },
      {
        id: "ready",
        label: T("Start from a ready situation", "Partir d’une situation prête"),
        line: T("Steady flights with a name, to adjust.", "Des vols stables qui ont un nom, à ajuster."),
      },
      {
        id: "fly",
        label: T("Fly and capture", "Voler et capturer"),
        line: T("In the simulator from this situation, then back here.", "Dans le simulateur depuis cette situation, puis retour ici."),
      },
    ];
    const tabs = h("div", {
      class: "sim-ways",
      role: "tablist",
      "aria-label": T("Three ways to get a situation", "Trois façons d’obtenir une situation"),
    });
    const pane = h("div", { class: "sim-way", role: "tabpanel" });
    const showWay = (w: typeof SIM_WAY) => {
      SIM_WAY = w;
      for (const p of this.simParts.splice(0)) p.destroy();
      for (const b of tabs.querySelectorAll("button")) {
        const on = b.dataset.way === w;
        b.classList.toggle("on", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      }
      if (w === "set") {
        const ed = new SituationEditor({
          lang,
          sit,
          base: read.scene,
          cockpit: host.course.cockpit,
          preview: mainInstrument(host.course.cockpit),
          onChange: (s, final) => {
            sit = s;
            paint();
            S.write(s, final, target());
          },
        });
        this.simParts.push(ed);
        pane.replaceChildren(
          h(
            "p",
            { class: "ce-panel-note" },
            T(
              "Move a value: the instruments on the slide follow at once.",
              "Bougez une valeur : les instruments de la diapo suivent aussitôt.",
            ),
          ),
          ed.el,
        );
      } else if (w === "ready") {
        const grid = readyGrid(
          lang,
          (r) => {
            sit = r.sit;
            paint();
            S.write(r.sit, true, target());
            showWay("set");
            tabs.scrollIntoView?.({ block: "start" });
          },
          { cockpit: host.course.cockpit },
        );
        this.simParts.push(grid);
        pane.replaceChildren(
          h(
            "p",
            { class: "ce-panel-note" },
            T(
              "A steady flight to start from: pick one, then adjust it.",
              "Un vol stable pour partir : choisissez-en une, puis ajustez-la.",
            ),
          ),
          grid.el,
        );
      } else {
        const go = h(
          "button",
          { type: "button", class: "ce-btn sim-fly" },
          railIcon("fly", "M5 4l14 8-14 8z"),
          h("span", {}, T("Open the simulator from this situation", "Ouvrir le simulateur depuis cette situation")),
        );
        go.disabled = !S.canFly;
        go.addEventListener("click", () => S.fly(sceneOfSituation(sit, { base: read.scene })));
        const kids: (Node | null)[] = [
          h(
            "ol",
            { class: "sim-steps" },
            h("li", {}, T("The course is saved, then the simulator opens with the aircraft in this situation.", "Le cours est enregistré, puis le simulateur s’ouvre avec l’avion dans cette situation.")),
            h("li", {}, T("Fly. At the right moment, press C (Shift + C also keeps the last 60 seconds).", "Volez. Au bon moment, appuyez sur C (Maj + C garde aussi les 60 dernières secondes).")),
            h("li", {}, T("“Back to the editor” brings you back here: the captured moment waits below.", "« Retour à l’éditeur » vous ramène ici : le moment capturé vous attend ci-dessous.")),
          ),
          go,
          S.canFly
            ? null
            : h(
                "p",
                { class: "ce-panel-note" },
                T(
                  "The simulator cannot be opened from this window. Set the situation here instead.",
                  "Le simulateur ne peut pas s’ouvrir depuis cette fenêtre. Réglez plutôt la situation ici.",
                ),
              ),
          host.trayEl,
        ];
        pane.replaceChildren(...kids.filter((k): k is Node => !!k));
      }
    };
    for (const w of ways) {
      const b = h(
        "button",
        { type: "button", role: "tab", class: "sim-way-b", "data-way": w.id },
        h("b", {}, w.label),
        h("span", {}, w.line),
      );
      b.addEventListener("click", () => {
        showWay(w.id);
        // the chosen way starts at the top of the panel's view
        tabs.scrollIntoView?.({ block: "start" });
      });
      tabs.append(b);
    }
    // the three ways, folded: a creator first adds, then changes the situation when needed
    const fold = h(
      "details",
      { class: "sit-fold sim-ways-fold" },
      h("summary", {}, T("Change the flight situation", "Changer la situation de vol")),
      h("div", { class: "sit-fold-b" }, tabs, pane),
    );
    let drawn = false;
    const open = () => {
      if (drawn) return;
      drawn = true;
      showWay(SIM_WAY);
    };
    fold.addEventListener("toggle", () => {
      SIM_OPEN = fold.open;
      if (fold.open) open();
    });
    if (SIM_OPEN) {
      fold.open = true;
      open();
    }
    out.push(fold);
    this.body.replaceChildren(...out);
  }

  // ---------------------------------------------------------------- the asset library tabs
  private library(tab: RailTab) {
    const host = this.host;
    const lang = host.lang;
    const tabs = LIB_TABS[tab] ?? ["text"];
    if (!host.onSlide) {
      this.body.replaceChildren(
        h(
          "div",
          { class: "ce-panel-off" },
          h(
            "p",
            {},
            t2(
              lang,
              "These go on a designed slide. Pick a slide in the strip below, or add one from Templates.",
              "Ces éléments vont sur une diapositive. Choisissez une diapo dans la bande du bas, ou ajoutez-en une depuis Modèles.",
            ),
          ),
        ),
        ...(tab === "interactive" ? this.stepKinds() : []),
      );
      return;
    }
    const top: Node[] = [];
    if (tab === "media") {
      const up = h(
        "button",
        { type: "button", class: "ce-btn primary ce-upload" },
        railIcon("up", "M12 16V4 M7 9l5-5 5 5 M5 20h14"),
        h(
          "span",
          {},
          t2(
            lang,
            "Upload a photo or a plate",
            "Importer une photo ou une carte",
          ),
        ),
      );
      up.addEventListener("click", () => {
        const i = h("input", {
          type: "file",
          accept: "image/png,image/jpeg,image/webp,image/gif",
        });
        i.addEventListener("change", () => {
          const f = i.files?.[0];
          if (f) host.addImageFile(f);
        });
        i.click();
      });
      top.push(
        up,
        h(
          "p",
          { class: "ce-panel-note" },
          t2(
            lang,
            `Or drop an image file on the slide, or paste one (${PASTE_KEY}). Approach plates import as an image you can crop.`,
            `Ou déposez une image sur la diapo, ou collez-la (${PASTE_KEY}). Les cartes d’approche s’importent comme une image recadrable.`,
          ),
        ),
      );
    }
    this.lib = new LibraryPanel({
      lang,
      theme: host.course.theme ?? "classroom",
      target: {
        add: (d) => {
          host.addDraft(d);
          host.afterAdd?.();
        },
        dropAt: (d, x, y) => {
          const ok = host.dropDraft(d, x, y);
          if (ok) host.afterAdd?.();
          return ok;
        },
        isOverSlide: (x, y) => host.isOverSlide(x, y),
      },
      tabs,
      tab: tabs[0],
      cockpit: host.course.cockpit,
    });
    this.lib.el.classList.add(tabs.length === 1 ? "is-single" : "is-multi");
    this.body.replaceChildren(...top, this.lib.el, ...(tab === "interactive" ? this.stepKinds() : []));
  }
  /** The interactive pieces that are a whole step (not a block on a slide): one home, the Interactive panel. */
  private stepKinds(): Node[] {
    const host = this.host;
    const lang = host.lang;
    const kinds = h("div", { class: "ce-kinds" });
    for (const t of TEMPLATES.filter((x) => x.id !== "slide")) {
      const k = KINDS[t.kind] ?? KINDS.page;
      const b = h(
        "button",
        { type: "button", class: "ce-kindrow" },
        h("span", { class: `ce-kind k-${k.cls}` }, tr(t.title, lang)),
        h("small", {}, tr(t.intent, lang)),
      );
      b.addEventListener("click", () => host.addTemplate(t.id));
      kinds.append(b);
    }
    return [
      h("h3", { class: "ce-panel-h" }, t2(lang, "A whole step for the student", "Une étape entière pour l’élève")),
      h(
        "p",
        { class: "ce-panel-note" },
        t2(
          lang,
          "Added after this slide, full screen in the student’s player.",
          "Ajoutée après cette diapo, en plein écran chez l’élève.",
        ),
      ),
      kinds,
    ];
  }

  // ---------------------------------------------------------------- templates
  private templates() {
    const host = this.host;
    const lang = host.lang;
    const fr = lang === "fr";
    const course = host.course;
    const theme = baseThemeId(course.theme);
    const parts: Node[] = [];
    const opts = {
      lang,
      theme,
      brand: course.brand,
      scenes: course.scenes,
      cockpit: course.cockpit,
    };
    // thumbnails are drawn when they scroll into view (26 live slides would stall a tablet)
    const pending = new Map<Element, () => void>();
    this.io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (ents) => {
              for (const e of ents) {
                if (!e.isIntersecting) continue;
                const job = pending.get(e.target);
                pending.delete(e.target);
                this.io?.unobserve(e.target);
                job?.();
              }
            },
            { root: this.body, rootMargin: "200px" },
          )
        : null;
    const lazy = (el: HTMLElement, job: () => void) => {
      if (this.io) {
        pending.set(el, job);
        this.io.observe(el);
      } else requestAnimationFrame(job);
    };
    const card = (
      label: string,
      sub: string,
      make: () => SlideCanvas,
      onPick: () => void,
      cls = "",
    ) => {
      const th = h("div", { class: "ce-tpl-th" });
      const b = h(
        "button",
        { type: "button", class: `ce-tpl ${cls}`.trim(), title: sub },
        th,
        h(
          "span",
          { class: "ce-tpl-l" },
          h("b", {}, label),
          sub ? h("small", {}, sub) : null,
        ),
      );
      b.addEventListener("click", onPick);
      lazy(th, () => {
        try {
          this.views.push(renderThumb(make(), th, opts));
        } catch {
          /* a thumbnail is decoration */
        }
      });
      return b;
    };
    const pickLayout = (id: SlideLayoutId) => {
      // Templates add a new slide; an empty slide takes it in place (the toolbar's Layout changes a slide)
      const replace = host.onSlide && host.slideEmpty;
      if (replace) host.replaceLayout(id);
      else host.addTemplate("slide", { layout: id });
    };
    for (const sec of SECTIONS) {
      const grid = h("div", { class: "ce-tpl-grid" });
      for (const id of sec.ids) {
        const def = LAYOUTS.find((l) => l.id === id);
        if (!def) continue;
        // the card names the archetype and the aviation content it comes with ("Diagram + 3 points · Hold entries")
        let sample = "";
        try {
          sample = tr(titleOfSlide(layoutCanvas(id)) ?? undefined, lang);
        } catch {
          sample = "";
        }
        grid.append(
          card(
            tr(def.title, lang),
            sample && sample !== tr(def.title, lang)
              ? sample
              : tr(def.summary, lang),
            () => layoutCanvas(id),
            () => pickLayout(id),
            id === "blank" ? "is-blank" : "",
          ),
        );
      }
      parts.push(h("h3", { class: "ce-panel-h" }, sec.title[fr ? 1 : 0]), grid);
    }
    // composed example slides (the six-pack, reading the HSI, hold entries, ILS minimums, 60:1…)
    const exGrid = h("div", { class: "ce-tpl-grid" });
    const scenes = exampleScenes();
    const exOpts = { ...opts, scenes: { ...scenes, ...course.scenes } };
    for (const ex of exampleSlides()) {
      const th = h("div", { class: "ce-tpl-th" });
      const b = h(
        "button",
        { type: "button", class: "ce-tpl" },
        th,
        h("span", { class: "ce-tpl-l" }, h("b", {}, tr(ex.title, lang))),
      );
      b.addEventListener("click", () =>
        host.addSlide(ex.slide, ex.title, scenes),
      );
      lazy(th, () => {
        try {
          this.views.push(renderThumb(ex.slide, th, exOpts));
        } catch {
          /* decoration */
        }
      });
      exGrid.append(b);
    }
    parts.push(
      h(
        "h3",
        { class: "ce-panel-h" },
        t2(lang, "Ready-made slides", "Diapos prêtes à l’emploi"),
      ),
      exGrid,
    );
    this.body.replaceChildren(...parts);
  }

  // ---------------------------------------------------------------- brand kit
  private brand() {
    const host = this.host;
    const lang = host.lang;
    const c = host.course;
    const b: SchoolBrand = c.brand ?? {
      name: c.author.club ?? "",
      color: "#1d5fd1",
    };
    const set = (nb: SchoolBrand | undefined, extra: Partial<Course> = {}) => {
      const next: Course = { ...host.course, ...extra };
      if (nb) next.brand = nb;
      else delete next.brand;
      host.setCourse(next, "brand");
      this.refresh();
    };
    const preview = h("div", { class: "ce-brand-pv" });
    const name = h("input", {
      type: "text",
      class: "ce-in",
      value: b.name,
      placeholder: t2(lang, "School name", "Nom de l’école"),
      "aria-label": t2(lang, "School name", "Nom de l’école"),
    });
    name.addEventListener("change", () =>
      set({ ...b, name: name.value.trim() }),
    );
    const logoBox = h("div", { class: "ce-brand-logo" });
    if (b.logo && "asset" in b.logo) {
      void Promise.resolve(host.assetUrl(b.logo.asset)).then((u) => {
        if (u) logoBox.replaceChildren(h("img", { src: u, alt: "" }));
      });
    } else
      logoBox.append(
        h(
          "span",
          {},
          (b.name || (lang === "fr" ? "Votre école" : "Your school")).slice(
            0,
            18,
          ),
        ),
      );
    const up = h(
      "button",
      { type: "button", class: "ce-btn sm" },
      h(
        "span",
        {},
        b.logo
          ? t2(lang, "Replace the logo", "Remplacer le logo")
          : t2(lang, "Add your logo", "Ajouter votre logo"),
      ),
    );
    up.addEventListener("click", () => {
      const i = h("input", {
        type: "file",
        accept: "image/png,image/jpeg,image/webp,image/svg+xml",
      });
      i.addEventListener("change", async () => {
        const f = i.files?.[0];
        if (!f) return;
        const r = await host.importImage(f);
        if (r) set({ ...b, logo: { asset: r.asset } });
      });
      i.click();
    });
    const rm = b.logo
      ? (() => {
          const x = h(
            "button",
            { type: "button", class: "ce-btn sm ghost" },
            h("span", {}, t2(lang, "Remove", "Retirer")),
          );
          x.addEventListener("click", () => {
            const { logo: _l, ...rest } = b;
            void _l;
            set(rest);
          });
          return x;
        })()
      : null;
    // school colours: a few classic aviation-school blues, reds and greens, and a custom picker
    const SW = [
      "#1d5fd1",
      "#0b3b7a",
      "#0f766e",
      "#17763c",
      "#b42323",
      "#a04d06",
      "#6d28d9",
      "#111827",
    ];
    const sw = h("div", {
      class: "ce-brand-sw",
      role: "radiogroup",
      "aria-label": t2(lang, "School colour", "Couleur de l’école"),
    });
    for (const col of SW) {
      const x = h("button", {
        type: "button",
        role: "radio",
        class: `ce-swatch${b.color.toLowerCase() === col ? " on" : ""}`,
        "aria-checked": b.color.toLowerCase() === col ? "true" : "false",
        "aria-label": col,
        title: col,
        style: `--sw:${col}`,
      });
      x.addEventListener("click", () => set({ ...b, color: col }));
      sw.append(x);
    }
    const custom = h("input", {
      type: "color",
      class: "ce-color",
      value: b.color,
      "aria-label": t2(lang, "Custom colour", "Couleur personnalisée"),
    });
    custom.addEventListener("change", () => set({ ...b, color: custom.value }));
    sw.append(custom);
    // where the logo sits
    const corners: [NonNullable<SchoolBrand["logoCorner"]>, string][] = [
      ["tl", t2(lang, "Top left", "Haut gauche")],
      ["tr", t2(lang, "Top right", "Haut droite")],
      ["bl", t2(lang, "Bottom left", "Bas gauche")],
      ["br", t2(lang, "Bottom right", "Bas droite")],
    ];
    const cornerEl = h("div", {
      class: "ce-corners",
      role: "radiogroup",
      "aria-label": t2(lang, "Logo corner", "Coin du logo"),
    });
    for (const [v, label] of corners) {
      const on = (b.logoCorner ?? "br") === v;
      const x = h(
        "button",
        {
          type: "button",
          role: "radio",
          class: `ce-corner c-${v}${on ? " on" : ""}`,
          "aria-checked": on ? "true" : "false",
          title: label,
          "aria-label": label,
        },
        h("i", {}),
      );
      x.addEventListener("click", () => set({ ...b, logoCorner: v }));
      cornerEl.append(x);
    }
    // the colour as the accent of every slide (classroom courses: SPEC §4 "brand = classroom + school accent")
    const base = baseThemeId(c.theme);
    const asAccent = c.theme === "brand";
    const accent = h(
      "button",
      {
        type: "button",
        role: "switch",
        class: `ce-brand-acc${asAccent ? " on" : ""}`,
        "aria-checked": asAccent ? "true" : "false",
        disabled: base === "cockpit" ? "" : undefined,
      },
      h("i", { class: "ce-sw-knob" }),
      h(
        "span",
        {},
        h(
          "b",
          {},
          t2(
            lang,
            "School colour as the accent",
            "Couleur de l’école en accent",
          ),
        ),
        h(
          "small",
          {},
          base === "cockpit"
            ? t2(
                lang,
                "Classroom courses only: the cockpit theme keeps its avionics colours.",
                "Cours en salle uniquement : le thème Cockpit garde ses couleurs avioniques.",
              )
            : t2(
                lang,
                "Eyebrows, numbers and markers take your colour (made readable).",
                "Surtitres, chiffres et repères prennent votre couleur (rendue lisible).",
              ),
        ),
      ),
    );
    accent.addEventListener("click", () => {
      if (base === "cockpit") return;
      set({ ...b }, { theme: asAccent ? "classroom" : "brand" });
    });
    const off = h(
      "button",
      { type: "button", class: "ce-btn sm ghost" },
      h(
        "span",
        {},
        t2(lang, "No brand on the slides", "Pas de marque sur les diapos"),
      ),
    );
    off.addEventListener("click", () =>
      set(undefined, c.theme === "brand" ? { theme: "classroom" } : {}),
    );
    this.body.replaceChildren(
      preview,
      h(
        "label",
        { class: "ce-field" },
        h("span", { class: "ce-label" }, t2(lang, "School", "École")),
        name,
      ),
      h(
        "div",
        { class: "ce-field" },
        h("span", { class: "ce-label" }, t2(lang, "Logo", "Logo")),
        h(
          "div",
          { class: "ce-brand-row" },
          logoBox,
          h("div", { class: "ce-brand-act" }, up, rm),
        ),
      ),
      h(
        "div",
        { class: "ce-field" },
        h("span", { class: "ce-label" }, t2(lang, "Colour", "Couleur")),
        sw,
      ),
      h(
        "div",
        { class: "ce-field" },
        h(
          "span",
          { class: "ce-label" },
          t2(lang, "Logo position", "Position du logo"),
        ),
        cornerEl,
      ),
      accent,
      h(
        "p",
        { class: "ce-panel-note" },
        t2(
          lang,
          "Applied to every slide of the course, in the player, the projector and the PDF. A slide can hide it (Slide tab).",
          "Appliqué à chaque diapo du cours, dans le lecteur, au projecteur et dans le PDF. Une diapo peut le masquer (onglet Diapo).",
        ),
      ),
    );
    if (c.brand) this.body.append(off);
    // live preview: the first designed slide of the course (or a cover) with the brand
    const first = c.steps.find((s) => s.slide)?.slide ?? layoutCanvas("cover");
    requestAnimationFrame(() => {
      try {
        this.views.push(
          renderThumb(first, preview, {
            lang,
            theme: c.theme ?? "classroom",
            brand: c.brand ?? {
              ...b,
              name: b.name || (lang === "fr" ? "Votre école" : "Your school"),
            },
            scenes: c.scenes,
            cockpit: c.cockpit,
            assetUrl: (id) => host.assetUrl(id),
          }),
        );
      } catch {
        /* decoration */
      }
    });
  }
}

/** What the first-run card of an empty slide can start. */
export interface EmptyStarts {
  /** the empty slide takes a layout */
  layout(id: SlideLayoutId): void;
  /** a flight in the simulator, with a goal, on this slide */
  flight(): void;
  /** start from nothing: the card goes away */
  blank(): void;
  /** the whole template gallery (the « Modèles » panel) */
  more?(): void;
}
/** the keyboard hints are shown once on this device */
const KEYS_SEEN = "ifr.studio.keys.v1";
const STARTS: { id: SlideLayoutId | "flight"; t: [string, string]; s: [string, string] }[] = [
  { id: "cover", t: ["A cover", "Une couverture"], s: ["The title of the course", "Le titre du cours"] },
  {
    id: "instrumentNotes",
    t: ["An idea and an instrument", "Une idée et un instrument"],
    s: ["A live instrument, explained", "Un instrument en direct, expliqué"],
  },
  {
    id: "yourTurn",
    t: ["The student at the controls", "L’élève aux commandes"],
    s: ["“Your turn”: the simulator checks", "« À vous » : le simulateur vérifie"],
  },
  { id: "quiz", t: ["A question", "Une question"], s: ["Answers as tiles", "Des réponses en tuiles"] },
  {
    id: "flight",
    t: ["A flight in the simulator", "Un vol dans le simulateur"],
    s: ["With a goal, then back to the course", "Avec un objectif, puis retour au cours"],
  },
];
/**
 * The empty slide teaches the builder without a manual: « Que voulez-vous montrer ? » and five starting slides
 * drawn for real (a cover, an idea with a live instrument, the student at the controls, a question, a flight in
 * the simulator), « Partir d’une diapo vide », and the keyboard hints the first time.
 */
export function emptySlideCard(
  lang: Lang,
  on: EmptyStarts,
  thumbs?: { theme?: ThemeId; brand?: SchoolBrand; scenes?: Course["scenes"]; cockpit?: Course["cockpit"] },
): { el: HTMLElement; destroy(): void } {
  const fr = lang === "fr";
  const views: SlideView[] = [];
  const grid = h("div", { class: "ce-fr-grid", role: "list" });
  for (const st of STARTS) {
    const th = h("span", { class: "ce-fr-th", "aria-hidden": "true" });
    if (st.id === "flight") {
      th.classList.add("art");
      th.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${SIM_ART.flight}</svg>`;
    } else if (thumbs) {
      const id = st.id;
      requestAnimationFrame(() => {
        if (!th.isConnected) return;
        try {
          views.push(renderThumb(layoutCanvas(id, { theme: thumbs.theme }), th, { lang, ...thumbs }));
        } catch {
          /* a thumbnail is decoration */
        }
      });
    }
    const b = h(
      "button",
      { type: "button", class: "ce-fr", role: "listitem" },
      th,
      h("span", { class: "ce-fr-l" }, h("b", {}, st.t[fr ? 1 : 0]), h("small", {}, st.s[fr ? 1 : 0])),
    );
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      if (st.id === "flight") on.flight();
      else on.layout(st.id);
    });
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    grid.append(b);
  }
  const blank = h("button", { type: "button", class: "ce-link ce-fr-blank" }, fr ? "Partir d’une diapo vide" : "Start from an empty slide");
  blank.addEventListener("click", (e) => {
    e.stopPropagation();
    on.blank();
  });
  blank.addEventListener("pointerdown", (e) => e.stopPropagation());
  let more: HTMLElement | null = null;
  if (on.more) {
    more = h("button", { type: "button", class: "ce-link ce-fr-blank" }, fr ? "Tous les modèles" : "All templates");
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      on.more?.();
    });
    more.addEventListener("pointerdown", (e) => e.stopPropagation());
  }
  let seen = true;
  try {
    seen = localStorage.getItem(KEYS_SEEN) === "1";
    if (!seen) localStorage.setItem(KEYS_SEEN, "1");
  } catch {
    seen = true;
  }
  const mod = PASTE_KEY.startsWith("⌘") ? "⌘" : "Ctrl+";
  const keys = seen
    ? null
    : h(
        "p",
        { class: "ce-fr-keys" },
        fr
          ? `Double-clic : écrire · Glisser : déplacer · Suppr : effacer · ${mod}Z : annuler`
          : `Double-click: type · Drag: move · Delete: remove · ${mod}Z: undo`,
      );
  const el = h(
    "div",
    { class: "ce-empty-card ce-fr-card", role: "group", "aria-label": fr ? "Diapo vide" : "Empty slide" },
    h("h2", { class: "ce-empty-t" }, fr ? "Que voulez-vous montrer ?" : "What do you want to show?"),
    grid,
    h("div", { class: "ce-fr-ft" }, h("span", { class: "ce-fr-links" }, more, blank), keys),
  );
  return {
    el,
    destroy: () => {
      for (const v of views.splice(0)) v.destroy();
      el.remove();
    },
  };
}
