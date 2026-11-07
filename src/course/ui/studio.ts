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
import {
  DECK_STARTERS,
  deckStarterGallery,
  type DeckStarter,
} from "./deckStarters";

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
  elements: ["Elements", "Éléments"],
  instruments: ["Instruments", "Instruments"],
  diagrams: ["Diagrams", "Schémas"],
  media: ["Media", "Médias"],
  interactive: ["Interactive", "Interactif"],
  brand: ["Brand", "Marque"],
  cockpit: ["Cockpit", "Cockpit"],
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
    "Your photos, the library, aviation icons",
    "Vos photos, la photothèque, les icônes",
  ],
  interactive: [
    "Quiz, calculation, sim view, checklist",
    "Quiz, calcul, vue simu, check-list",
  ],
  brand: [
    "Your school's logo and colour on every slide",
    "Le logo et la couleur de l’école sur chaque diapo",
  ],
  cockpit: [
    "Moments captured in the cockpit",
    "Les moments capturés au cockpit",
  ],
};
export const RAIL_TABS: readonly RailTab[] = [
  "templates",
  "text",
  "elements",
  "instruments",
  "diagrams",
  "media",
  "interactive",
  "brand",
  "cockpit",
];
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
}

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
  private views: SlideView[] = [];
  private io: IntersectionObserver | null = null;
  private decks: { destroy(): void } | null = null;
  /** templates: add as a new slide, or replace the current one */
  private place: "new" | "replace" = "new";
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
    else if (tab === "brand") this.brand();
    else if (tab === "cockpit") this.body.replaceChildren(this.host.trayEl);
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
    this.body.replaceChildren();
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
            "Or drop an image file on the slide, or paste one (⌘V). Approach plates import as an image you can crop.",
            "Ou déposez une image sur la diapo, ou collez-la (⌘V). Les cartes d’approche s’importent comme une image recadrable.",
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
    this.body.replaceChildren(...top, this.lib.el);
  }

  // ---------------------------------------------------------------- templates
  private templates() {
    const host = this.host;
    const lang = host.lang;
    const fr = lang === "fr";
    const course = host.course;
    const theme = baseThemeId(course.theme);
    const parts: Node[] = [];
    if (host.onSlide) {
      const seg = h("div", {
        class: "ce-seg full ce-place",
        role: "radiogroup",
        "aria-label": t2(lang, "Where the template goes", "Où va le modèle"),
      });
      const opts: ["new" | "replace", string][] = [
        ["new", t2(lang, "New slide", "Nouvelle diapo")],
        ["replace", t2(lang, "Replace this one", "Remplacer celle-ci")],
      ];
      // an empty slide takes the template in place
      const placeNow = host.slideEmpty ? "replace" : this.place;
      for (const [v, label] of opts) {
        const b = h(
          "button",
          {
            type: "button",
            role: "radio",
            class: placeNow === v ? "on" : "",
            "aria-checked": placeNow === v ? "true" : "false",
          },
          label,
        );
        b.addEventListener("click", () => {
          this.place = v;
          this.refresh();
        });
        seg.append(b);
      }
      parts.push(seg);
    }
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
      const replace =
        host.onSlide && (host.slideEmpty || this.place === "replace");
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
    // whole decks
    const decks = deckStarterGallery(
      lang,
      course,
      (d, th) => host.addDeck(d, th),
      { compact: true, theme: theme === "classroom" ? "classroom" : "cockpit" },
    );
    this.decks = decks;
    parts.push(
      h(
        "h3",
        { class: "ce-panel-h" },
        t2(
          lang,
          `Whole decks · ${DECK_STARTERS.length}`,
          `Présentations complètes · ${DECK_STARTERS.length}`,
        ),
      ),
      decks.el,
    );
    // what the student does: the interactive step kinds
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
    parts.push(
      h(
        "h3",
        { class: "ce-panel-h" },
        t2(lang, "What the student does", "Ce que fait l’élève"),
      ),
      kinds,
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

/** The empty slide teaches the builder in ten seconds: three moves, each one tap. */
export function emptySlideCard(
  lang: Lang,
  on: { templates(): void; instruments(): void; title(): void },
): HTMLElement {
  const fr = lang === "fr";
  const step = (
    n: string,
    title: string,
    sub: string,
    run: () => void,
    ic: RailTab,
  ) => {
    const b = h(
      "button",
      { type: "button", class: "ce-empty-step" },
      h("span", { class: "ce-empty-n" }, n),
      railIcon(ic),
      h("span", {}, h("b", {}, title), h("small", {}, sub)),
    );
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      run();
    });
    b.addEventListener("pointerdown", (e) => e.stopPropagation());
    return b;
  };
  return h(
    "div",
    {
      class: "ce-empty-card",
      role: "group",
      "aria-label": fr ? "Diapo vide" : "Empty slide",
    },
    h(
      "b",
      { class: "ce-empty-t" },
      fr ? "Une diapo vide. Trois gestes :" : "An empty slide. Three moves:",
    ),
    step(
      "1",
      fr ? "Choisissez un modèle" : "Pick a template",
      fr
        ? "Entrée en attente, 1 sur 60, HSI, quiz…"
        : "Hold entry, 1 in 60, HSI, quiz…",
      on.templates,
      "templates",
    ),
    step(
      "2",
      fr ? "Glissez un instrument" : "Drag in an instrument",
      fr ? "PFD, HSI, six instruments, en direct" : "PFD, HSI, six-pack, live",
      on.instruments,
      "instruments",
    ),
    step(
      "3",
      fr ? "Écrivez un titre" : "Write a title",
      fr
        ? "Double-cliquez pour modifier le texte"
        : "Double-click to edit any text",
      on.title,
      "text",
    ),
  );
}
