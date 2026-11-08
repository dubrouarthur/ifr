// The app bar: the one header of every "place" page (UX logic §3). Left to right: the Wingdeck mark and word (a
// link to Accueil), the three places as tabs with an icon AND a word (Accueil · Bibliothèque · Simulateur, the
// current one underlined with aria-current="page"), the library search, and FR | EN.
// The same component draws on index.html (Accueil, Simulateur) and academy.html (Bibliothèque and its formation
// pages), so a place keeps one name and one position everywhere. Pure DOM: no page module is imported here.
import "../styles/appbar.css";
import { BRAND, brandMarkSvg } from "../brand";
import { h } from "./dom";

export type Place = "home" | "lib" | "sim";
type Lang = "fr" | "en";

/** The places, their words (one word per thing, §2) and the page each lives on. */
export const PLACES: readonly { id: Place; fr: string; en: string }[] = [
  { id: "home", fr: "Accueil", en: "Home" },
  { id: "lib", fr: "Bibliothèque", en: "Library" },
  { id: "sim", fr: "Simulateur", en: "Simulator" },
];
/** A place's name in a language (the tab, the page eyebrow, a « ← » back button). */
export const placeName = (p: Place, l: Lang): string =>
  PLACES.find((x) => x.id === p)![l === "fr" ? "fr" : "en"];

/** Where each place lives. index.html and academy.html sit side by side at the site root. */
export const PLACE_HREF: Record<Place, string> = {
  home: "index.html#accueil",
  lib: "academy.html#library",
  sim: "index.html#simulateur",
};

const W = {
  nav: { fr: "Navigation principale", en: "Main navigation" },
  brand: { fr: `${BRAND.name} – Accueil`, en: `${BRAND.name} – Home` },
  search: {
    fr: "Rechercher un cours, une leçon…",
    en: "Search courses, lessons…",
  },
  searchShort: { fr: "Rechercher…", en: "Search…" },
  lang: { fr: "Langue", en: "Language" },
  slash: { fr: "Appuyez sur / pour rechercher", en: "Press / to search" },
} as const;

const ICON: Record<Place | "search", string> = {
  home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
  lib: '<path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5c-.8 0-1.5-.7-1.5-1.5z"/><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5-.7 1.5-1.5z"/>',
  sim: '<path d="M21 15.5 13.5 11V5.5a1.5 1.5 0 0 0-3 0V11L3 15.5V17l7.5-2.2V19l-2 1.5V22l3.5-1 3.5 1v-1.5l-2-1.5v-4.2L21 17z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
};
/** a line icon (always next to a word) */
export const lineIcon = (d: string, size = 18): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;

export interface AppBarOptions {
  /** the place on screen (null: a page below a place, e.g. the club tools: no tab is current) */
  place: Place | null;
  lang: Lang;
  /** FR | EN: the page switches its language (and calls bar.setLang) */
  onLang: (l: Lang) => void;
  /** in-page navigation: return true when the page shows the place itself (no reload) */
  go?: (p: Place) => boolean;
  /** the search box: a placeholder, and what Enter does with the text when no library is on the page
   *  (index.html opens the library with the query) */
  search?: { placeholder?: string; submit?: (q: string) => void };
}

export interface AppBar {
  el: HTMLElement;
  /** the search field (the library adopts it on academy.html) */
  input: HTMLInputElement;
  setPlace(p: Place | null): void;
  setLang(l: Lang): void;
}

/** The app bar (a `<header>`: the page's banner). */
export function appBar(o: AppBarOptions): AppBar {
  let lang = o.lang;
  let place = o.place;
  const tabs = PLACES.map((p) => {
    const word = h("span", { class: "wd-tab-w" });
    const a = h(
      "a",
      {
        class: "wd-tab",
        href: PLACE_HREF[p.id],
        "data-place": p.id,
        onclick: (e: Event) => {
          const me = e as MouseEvent;
          if (me.metaKey || me.ctrlKey || me.shiftKey || me.button > 0) return;
          if (o.go?.(p.id)) e.preventDefault();
        },
      },
      h("span", { class: "wd-tab-ic", html: lineIcon(ICON[p.id]) }),
      word,
    );
    return { p, a, word };
  });
  const nav = h("nav", { class: "wd-tabs" }, ...tabs.map((t) => t.a));
  const brand = h(
    "a",
    {
      class: "wd-brand",
      href: PLACE_HREF.home,
      onclick: (e: Event) => {
        const me = e as MouseEvent;
        if (me.metaKey || me.ctrlKey || me.shiftKey || me.button > 0) return;
        if (o.go?.("home")) e.preventDefault();
      },
    },
    h("span", { class: "wd-brand-mark", html: brandMarkSvg(26) }),
    h("span", { class: "wd-brand-w" }, BRAND.name),
  );
  const input = h("input", {
    class: "wd-search-in",
    type: "search",
    enterkeyhint: "search",
    autocomplete: "off",
    spellcheck: "false",
  }) as HTMLInputElement;
  const kbd = h("kbd", { "aria-hidden": "true" }, "/");
  const search = h(
    "label",
    { class: "wd-search" },
    h("span", { class: "wd-search-ic", html: lineIcon(ICON.search, 17) }),
    input,
    kbd,
  );
  input.addEventListener("keydown", (e) => {
    // the cockpit's keys never fire while typing here
    e.stopPropagation();
    if (e.key === "Enter" && o.search?.submit) {
      const q = input.value.trim();
      if (q) {
        e.preventDefault();
        o.search.submit(q);
      }
    }
  });
  const langBtns = (["fr", "en"] as Lang[]).map((l) =>
    h(
      "button",
      {
        type: "button",
        class: "wd-lang-b",
        lang: l,
        onclick: () => o.onLang(l),
      },
      l.toUpperCase(),
    ),
  );
  const langSeg = h("div", { class: "wd-lang", role: "group" }, ...langBtns);
  const el = h(
    "header",
    { class: "wd-appbar" },
    brand,
    nav,
    h("span", { class: "wd-sp" }),
    search,
    langSeg,
  );
  // "/" focuses the search from anywhere on the page (not while typing)
  const onSlash = (e: KeyboardEvent) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || !el.isConnected)
      return;
    if (el.closest("[inert]") || el.offsetParent === null) return;
    const t = e.target as HTMLElement | null;
    if (
      t &&
      (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
    )
      return;
    e.preventDefault();
    input.focus();
  };
  document.addEventListener("keydown", onSlash);

  const paint = () => {
    const fr = lang === "fr";
    const L = (x: { fr: string; en: string }) => (fr ? x.fr : x.en);
    nav.setAttribute("aria-label", L(W.nav));
    brand.setAttribute("aria-label", L(W.brand));
    for (const t of tabs) {
      t.word.textContent = fr ? t.p.fr : t.p.en;
      if (t.p.id === place) t.a.setAttribute("aria-current", "page");
      else t.a.removeAttribute("aria-current");
      t.a.classList.toggle("on", t.p.id === place);
    }
    if (!input.dataset.ownPlaceholder) {
      const ph = o.search?.placeholder ?? L(W.search);
      // a narrow bar shows the short word (the full one stays the field's name)
      input.placeholder = narrow?.matches ? L(W.searchShort) : ph;
      input.setAttribute("aria-label", ph);
    }
    kbd.title = L(W.slash);
    langSeg.setAttribute("aria-label", L(W.lang));
    for (const b of langBtns) {
      const on = b.lang === lang;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
  };
  const narrow = typeof matchMedia === "function" ? matchMedia("(max-width: 1200px)") : null;
  narrow?.addEventListener?.("change", () => paint());
  paint();
  return {
    el,
    input,
    setPlace(p) {
      place = p;
      paint();
    },
    setLang(l) {
      lang = l;
      paint();
    },
  };
}
