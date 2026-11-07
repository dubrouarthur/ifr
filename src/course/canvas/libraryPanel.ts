// Ground school — designed slides: the asset library panel (package N / P). Search, tabs (text styles, shapes,
// live instruments, diagrams, icons, photos, interactive blocks) and tiles with real previews: instruments are
// drawn once by the cockpit renderers, icons and diagrams recolour to the slide theme. Tap a tile to add it to
// the middle of the slide, or drag it onto the slide (pointer events: mouse, pen and finger; on touch a drag
// starts with a sideways move or a short hold, so the list still scrolls).
import type { Lang, SlideTheme, ThemeId } from "../types";
import {
  LIBRARY_TABS,
  LIBRARY_ITEMS,
  searchItems,
  type BlockDraft,
  type LibraryItem,
  type LibraryTab,
  type LibraryPreview,
} from "./factory";
import { libraryUrl } from "./library";
import { resolveTheme, typeCss } from "./themes";
import { loc } from "./text";
import { tx, type CanvasString } from "./strings";
import { SceneSims, SlideInstrument } from "./instruments";
import { DEMO_SCENE_ID, demoScene, emptyCanvas, placeDraft } from "./factory";
import { renderThumb, type SlideView } from "./render";

export interface LibraryTarget {
  add(d: BlockDraft): unknown;
  dropAt(d: BlockDraft, clientX: number, clientY: number): boolean;
  isOverSlide?(clientX: number, clientY: number): boolean;
}
export interface LibraryPanelOptions {
  lang?: Lang;
  theme?: ThemeId | SlideTheme;
  target: LibraryTarget;
  tabs?: readonly LibraryTab[];
  /** first tab shown */
  tab?: LibraryTab;
  cockpit?: "g1000" | "steam" | "airliner";
}

const TAB_LABEL: Record<LibraryTab, CanvasString> = {
  text: "text",
  shapes: "shapes",
  instruments: "instruments",
  diagrams: "diagrams",
  icons: "icons",
  photos: "photos",
  interactive: "interactive",
};
const mk = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
const SVG = (body: string, vb = "0 0 96 64") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
// small line drawings for tiles that have no picture of their own (our own constant strings)
const GLYPHS: Record<string, string> = {
  roundRect: SVG(
    '<rect x="14" y="12" width="68" height="40" rx="7" fill="currentColor" fill-opacity="0.08"/>',
  ),
  rect: SVG(
    '<rect x="14" y="12" width="68" height="40" rx="3" stroke-width="3.5"/>',
  ),
  ellipse: SVG('<ellipse cx="48" cy="32" rx="22" ry="22" stroke-width="3.5"/>'),
  line: SVG('<path d="M12 32h72"/>'),
  triangle: SVG('<path d="M48 12l24 40H24z"/>'),
  arrow: SVG(
    '<path d="M14 32h62"/><path d="M84 32l-12-7v14z" fill="currentColor"/>',
  ),
  curve: SVG(
    '<path d="M16 50Q44 8 76 18"/><path d="M84 21l-13-9 1 14z" fill="currentColor" stroke="none"/>',
  ),
  callout: SVG(
    '<rect x="30" y="10" width="56" height="30" rx="5" fill="currentColor" fill-opacity="0.08"/><path d="M30 34L12 52"/><circle cx="12" cy="52" r="3" fill="currentColor"/>',
  ),
  marker: SVG(
    '<circle cx="48" cy="32" r="18" fill="currentColor" stroke="none"/><text x="48" y="40" text-anchor="middle" font-family="Inter,sans-serif" font-size="22" font-weight="700" fill="#fff" stroke="none">1</text>',
  ),
  viewport: SVG(
    '<rect x="10" y="10" width="76" height="44" rx="5"/><path d="M10 38c14-4 34-6 76-2"/><path d="M44 26l-4 6h12z" fill="currentColor"/>',
  ),
  quiz: SVG(
    '<rect x="16" y="10" width="64" height="12" rx="3"/><rect x="16" y="28" width="64" height="10" rx="3" fill="currentColor" fill-opacity="0.15"/><rect x="16" y="43" width="64" height="10" rx="3"/>',
  ),
  calc: SVG(
    '<rect x="18" y="8" width="60" height="48" rx="5"/><path d="M28 22h10M33 17v10M58 22h10M28 42l8-8M36 42l-8-8M58 38h10M58 44h10"/>',
  ),
  checklist: SVG(
    '<circle cx="22" cy="18" r="6" fill="currentColor"/><path d="M19 18l2 2 4-4" stroke="#fff" stroke-width="2"/><path d="M34 18h46"/><circle cx="22" cy="34" r="6"/><path d="M34 34h40"/><circle cx="22" cy="50" r="6"/><path d="M34 50h44"/>',
  ),
  hold: SVG(
    '<path d="M30 20h36a12 12 0 0 1 0 24H30a12 12 0 0 1 0-24z"/><path d="M76 32l0 0" /><path d="M18 32h-8"/><path d="M30 44l6-3v6z" fill="currentColor"/>',
  ),
  "calc:WCA": SVG('<path d="M16 50L80 50" stroke-opacity="0.35"/><path d="M16 50L74 18" /><path d="M74 18L80 50" stroke-dasharray="3 3"/><path d="M74 18l-9 1 4 7z" fill="currentColor"/><path d="M80 50l-3-9-5 5z" fill="currentColor"/>'),
  "calc:60:1": SVG('<path d="M10 40h76" stroke-dasharray="5 4" stroke-opacity="0.5"/><path d="M10 40L62 22"/><circle cx="10" cy="40" r="3" fill="currentColor"/><path d="M62 22l24 18" /><path d="M30 40a20 20 0 0 0-1-6"/>'),
  "calc:3°": SVG('<path d="M8 54h80" stroke-opacity="0.4"/><path d="M10 12h22L80 50"/><path d="M80 50h8"/><circle cx="32" cy="12" r="3" fill="currentColor"/>'),
  "calc:VDP": SVG('<path d="M8 54h80" stroke-opacity="0.4"/><path d="M10 24h40"/><path d="M50 24L84 52" stroke-dasharray="4 4"/><circle cx="50" cy="24" r="3.5" fill="currentColor"/><path d="M70 54h16" stroke-width="5"/>'),
  "calc:×3": SVG('<path d="M30 22h36a10 10 0 0 1 0 20H30a10 10 0 0 1 0-20z"/><path d="M22 10l-8 6" /><path d="M82 52l-8 4"/><path d="M44 42l-6-3v6z" fill="currentColor"/>'),
  "calc:TVMDC": SVG('<circle cx="48" cy="32" r="24"/><path d="M48 8v6M48 50v6M24 32h6M66 32h6"/><path d="M48 32L60 14"/><path d="M48 32L54 12" stroke-dasharray="3 3"/>'),
  "calc:CG": SVG('<path d="M18 54L26 14H58L74 54" /><path d="M14 54h68" stroke-opacity="0.4"/><circle cx="46" cy="34" r="4" fill="currentColor"/>'),
  airspace: SVG(
    '<path d="M8 54h80"/><rect x="38" y="36" width="20" height="18"/><rect x="24" y="20" width="48" height="16"/><rect x="12" y="10" width="72" height="10" stroke-dasharray="4 4"/>',
  ),
};

export class LibraryPanel {
  readonly el: HTMLDivElement;
  private search: HTMLInputElement;
  private tabsEl: HTMLDivElement;
  private grid: HTMLDivElement;
  private tab: LibraryTab;
  private lang: Lang;
  private theme: SlideTheme;
  private sims: SceneSims;
  private insts: SlideInstrument[] = [];
  /** live diagram previews (the real renderer, in the slide theme) */
  private views: SlideView[] = [];
  private io: IntersectionObserver | null = null;
  private ghost: HTMLElement | null = null;
  constructor(private o: LibraryPanelOptions) {
    this.lang = o.lang ?? "en";
    this.theme =
      typeof o.theme === "object"
        ? o.theme
        : resolveTheme(o.theme ?? "classroom");
    this.tab = o.tab ?? "text";
    this.sims = new SceneSims({
      scenes: { [DEMO_SCENE_ID]: demoScene(o.cockpit ?? "g1000") },
      cockpit: o.cockpit ?? "g1000",
    });
    this.el = mk("div", "sle-lib");
    this.el.setAttribute("role", "region");
    this.el.setAttribute("aria-label", tx("library", this.lang));
    const head = mk("div", "sle-lib-head");
    const title = mk("div", "sle-lib-title", tx("library", this.lang));
    this.search = mk("input", "sle-lib-search");
    this.search.type = "search";
    this.search.placeholder = `${tx("search", this.lang)}: hsi, hold, metar…`;
    this.search.setAttribute("aria-label", tx("search", this.lang));
    this.search.addEventListener("input", () => this.render());
    this.tabsEl = mk("div", "sle-lib-tabs");
    this.tabsEl.setAttribute("role", "tablist");
    head.append(title, this.search, this.tabsEl);
    this.grid = mk("div", "sle-lib-grid");
    this.grid.setAttribute("role", "list");
    const hint = mk("div", "sle-lib-hint", tx("tapToAdd", this.lang));
    this.el.append(head, this.grid, hint);
    this.renderTabs();
    this.render();
  }
  setLang(l: Lang) {
    this.lang = l;
    this.renderTabs();
    this.render();
  }
  setTheme(t: ThemeId | SlideTheme) {
    this.theme = typeof t === "object" ? t : resolveTheme(t);
    this.render();
  }
  setTab(t: LibraryTab) {
    this.tab = t;
    this.renderTabs();
    this.render();
  }
  destroy() {
    for (const i of this.insts) i.destroy();
    for (const v of this.views.splice(0)) v.destroy();
    this.io?.disconnect();
    this.sims.destroy();
    this.ghost?.remove();
    this.el.remove();
  }

  private renderTabs() {
    this.tabsEl.replaceChildren();
    for (const t of this.o.tabs ?? LIBRARY_TABS) {
      const b = mk(
        "button",
        `sle-chip${t === this.tab ? " on" : ""}`,
        tx(TAB_LABEL[t], this.lang),
      );
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(t === this.tab));
      b.addEventListener("click", () => this.setTab(t));
      this.tabsEl.append(b);
    }
  }
  private render() {
    for (const i of this.insts) i.destroy();
    this.insts = [];
    for (const v of this.views.splice(0)) v.destroy();
    this.grid.replaceChildren();
    const q = this.search.value.trim();
    const items = q
      ? searchItems(q).filter((i) =>
          (this.o.tabs ?? LIBRARY_TABS).includes(i.tab),
        )
      : LIBRARY_ITEMS.filter((i) => i.tab === this.tab);
    this.grid.dataset.tab = q ? "search" : this.tab;
    if (!items.length) {
      this.grid.append(mk("div", "sle-lib-empty", tx("noResults", this.lang)));
      return;
    }
    for (const it of items) this.grid.append(this.tile(it));
  }
  private tile(it: LibraryItem): HTMLElement {
    const b = mk("button", `sle-tile t-${it.tab}`);
    b.type = "button";
    b.setAttribute("role", "listitem");
    const name = loc(it.title, this.lang);
    b.setAttribute("aria-label", `${name}. ${tx("addHere", this.lang)}`);
    b.title = name;
    const art = mk("div", "sle-tile-art");
    this.art(art, it.preview, it);
    b.append(art, mk("span", "sle-tile-name", name));
    this.dragWire(b, it, art);
    return b;
  }
  /**
   * A diagram tile drawn by the slide renderer itself: the block fills a slide (its aspect kept) and the slide is
   * drawn as a thumbnail in the course theme, when the tile scrolls into view. The glyph stays as the fallback.
   */
  private liveDiagram(el: HTMLElement, it: LibraryItem): boolean {
    if (it.tab !== "diagrams") return false;
    const job = () => {
      try {
        const d = it.make();
        const k = Math.min(1680 / d.frame.w, 900 / d.frame.h);
        const draft = { ...d, frame: { ...d.frame, w: Math.round(d.frame.w * k), h: Math.round(d.frame.h * k) } } as typeof d;
        const b = placeDraft(emptyCanvas(), draft, undefined, 0);
        const host = mk("div", "sle-tile-live");
        const v = renderThumb({ ...emptyCanvas(), blocks: [b] }, host, {
          lang: this.lang,
          theme: this.theme.id,
        });
        this.views.push(v);
        el.replaceChildren(host);
        el.classList.add("is-live");
      } catch {
        /* keep the glyph */
      }
    };
    if (typeof IntersectionObserver === "undefined") {
      requestAnimationFrame(job);
      return true;
    }
    this.io ??= new IntersectionObserver(
      (ents) => {
        for (const e of ents)
          if (e.isIntersecting) {
            this.io?.unobserve(e.target);
            (e.target as HTMLElement & { _job?: () => void })._job?.();
          }
      },
      { rootMargin: "160px" },
    );
    (el as HTMLElement & { _job?: () => void })._job = job;
    this.io.observe(el);
    return true;
  }
  private art(el: HTMLElement, p: LibraryPreview, it: LibraryItem) {
    if (it.tab === "diagrams") this.liveDiagram(el, it);
    switch (p.k) {
      case "text": {
        // the role, written in its own style: "Add a title", "Add body text"… (the Canva text panel)
        const fr = this.lang === "fr";
        const SAMPLE: Record<string, [string, string]> = {
          display: ["Cover title", "Titre de couverture"],
          title: ["Add a title", "Ajouter un titre"],
          heading: ["Add a heading", "Ajouter un intertitre"],
          subtitle: ["Add a lead", "Ajouter un chapeau"],
          lead: ["Add a lead", "Ajouter un chapeau"],
          body: ["Add body text", "Ajouter du texte"],
          caption: ["Add a caption", "Ajouter une légende"],
          small: ["Add a caption", "Ajouter une légende"],
          label: ["EYEBROW", "SURTITRE"],
          eyebrow: ["EYEBROW", "SURTITRE"],
          number: ["318", "318"],
          quote: ["« Cleared ILS 27 »", "« Autorisé ILS 27 »"],
          mono: ["angle = 60 × off ÷ dist", "angle = 60 × écart ÷ dist"],
          formula: ["angle = 60 × off ÷ dist", "angle = 60 × écart ÷ dist"],
          foot: ["Source · FAA AIM 5-3-8", "Source · FAA AIM 5-3-8"],
        };
        const sample = SAMPLE[p.style]?.[fr ? 1 : 0] ?? "Aa";
        const s = mk("span", "sle-tile-text", sample);
        const css = typeCss(this.theme, p.style);
        s.style.fontFamily = css["font-family"];
        s.style.fontWeight = css["font-weight"];
        s.style.fontSize = `${Math.max(13, Math.min(30, parseFloat(css["font-size"]) * 0.36))}px`;
        if (css["text-transform"] === "uppercase" || p.style === "label") {
          s.style.letterSpacing = "0.12em";
          s.style.textTransform = "uppercase";
        }
        if (p.style === "mono" || p.style === "formula" || p.style === "quote") s.style.fontStyle = "italic";
        el.append(s);
        break;
      }
      case "shape":
        el.innerHTML = GLYPHS[p.shape] ?? GLYPHS.rect;
        break;
      case "glyph":
        el.innerHTML = (p.glyph === "calcDiagram" ? GLYPHS[`calc:${p.label ?? ""}`] : GLYPHS[p.glyph]) ?? "";
        if (p.glyph === "calcDiagram")
          el.append(mk("span", "sle-tile-tag", p.label ?? ""));
        break;
      case "lib": {
        const img = mk("img");
        img.alt = "";
        img.draggable = false;
        img.loading = "lazy";
        const url = libraryUrl(p.id, {
          theme: this.theme,
          lang: this.lang,
          color: this.theme.colors.text,
        });
        if (url) img.src = url;
        el.classList.add(
          it.tab === "photos"
            ? "is-photo"
            : it.tab === "icons"
              ? "is-icon"
              : "is-diagram",
        );
        el.append(img);
        break;
      }
      case "instrument": {
        el.classList.add("is-inst");
        const w = 132;
        const h = it.make().frame.h * (w / it.make().frame.w);
        const inst = new SlideInstrument(this.sims, {
          view: p.view,
          scene: DEMO_SCENE_ID,
          mode: "frozen",
          lang: this.lang,
          w,
          h: Math.min(96, h),
          scale: () => 1,
          still: true,
        });
        inst.el.style.cssText = `position:relative;width:${w}px;height:${Math.min(96, h)}px;`;
        this.insts.push(inst);
        el.append(inst.el);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- tap and drag
  private dragWire(b: HTMLButtonElement, it: LibraryItem, art: HTMLElement) {
    let start: {
      x: number;
      y: number;
      t: number;
      id: number;
      touch: boolean;
    } | null = null;
    let dragging = false;
    let dropped = false;
    let hold = 0;
    const begin = (e: PointerEvent) => {
      dragging = true;
      clearTimeout(hold);
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic */
      }
      const g = mk("div", "sle-ghost");
      g.append(art.cloneNode(true));
      document.body.append(g);
      this.ghost = g;
      this.moveGhost(e.clientX, e.clientY);
    };
    b.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      start = {
        x: e.clientX,
        y: e.clientY,
        t: performance.now(),
        id: e.pointerId,
        touch: e.pointerType !== "mouse",
      };
      dragging = false;
      // mice and pens have no implicit capture: keep the moves even when the pointer leaves the tile
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        /* synthetic events */
      }
      if (start.touch) hold = window.setTimeout(() => start && begin(e), 320);
    });
    b.addEventListener("pointermove", (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!dragging) {
        const far = Math.hypot(dx, dy) > 8;
        // on touch a vertical move scrolls the list; a sideways one drags the tile out
        if (far && start.touch && Math.abs(dy) > Math.abs(dx)) {
          clearTimeout(hold);
          start = null;
          return;
        }
        if (far) begin(e);
        return;
      }
      e.preventDefault();
      this.moveGhost(e.clientX, e.clientY);
      this.ghost?.classList.toggle(
        "over",
        !!this.o.target.isOverSlide?.(e.clientX, e.clientY),
      );
    });
    const end = (e: PointerEvent, cancel = false) => {
      if (!start || e.pointerId !== start.id) return;
      clearTimeout(hold);
      const wasDrag = dragging;
      start = null;
      dragging = false;
      this.ghost?.remove();
      this.ghost = null;
      if (cancel) return;
      if (wasDrag) {
        dropped = true;
        this.o.target.dropAt(it.make(), e.clientX, e.clientY);
      }
    };
    b.addEventListener("pointerup", (e) => end(e));
    b.addEventListener("pointercancel", (e) => end(e, true));
    b.addEventListener("click", () => {
      // a click that was not a drag (keyboard Enter / Space too) adds to the middle of the slide
      if (dropped) {
        dropped = false;
        return;
      }
      this.o.target.add(it.make());
    });
    b.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  private moveGhost(x: number, y: number) {
    if (!this.ghost) return;
    this.ghost.style.left = `${x}px`;
    this.ghost.style.top = `${y}px`;
  }
}
