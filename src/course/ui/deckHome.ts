// The slide decks on the Flight Center's first screen (SPEC slides v2 §12): the hero shows a real deck, drawn live
// by the slide renderer (a large slide and its filmstrip), and the shelf under it lists every deck as a slide card
// (cover thumbnail, steps, minutes, progress, Present). Loaded on demand by ui/flightcenter.ts, so the slide
// engine stays out of the cockpit's first bundle. Same entries and order as the library (library.ts): the deck the
// student should continue first, then assigned, recent and sample decks.
import "../../styles/course-canvas.css";
import { h } from "../../ui/dom";
import { allSamples, HOLDING_ID } from "../samples";
import { renderThumb, type SlideView } from "../canvas/render";
import { SceneSims } from "../canvas/instruments";
import type { CourseIndexEntry, CourseStore } from "../store";
import {
  academyHref,
  continueTarget,
  importedIds,
  libraryEntries,
  type LibraryEntry,
} from "./library";
import { ct, ctSteps, loc } from "../i18n";
import type { Course, CourseProgress, Lang, Step } from "../types";

export interface DeckHomeOptions {
  lang: Lang;
  /** the large slide and its filmstrip (inside the hero band) */
  visual: HTMLElement;
  /** the row of deck cards */
  shelf: HTMLElement;
  /** academy.html (the Flight Center sits at the site root, so does academy.html) */
  page?: string;
  /** open a URL (the Flight Center closes first) */
  navigate: (url: string) => void;
  /** "Create a course" (the library's new-course flow) */
  onCreate: () => void;
  /** the store, when it opens (stored decks and progress join the samples) */
  store?: Promise<CourseStore> | null;
  profileId?: string;
}

export interface DeckHome {
  destroy(): void;
}

const S = {
  en: {
    cont: "Continue",
    start: "Start here",
    present: "Present",
    open: "Open",
    create: "Create a course",
    createSub: "Start from a template: cover, diagram, instrument, quiz",
    slides: "Slides of this deck",
    slideN: "Slide {n}",
    playDeck: "Open the deck",
    of: "{a} of {b}",
    deckOf: "{n} slides",
  },
  fr: {
    cont: "Reprendre",
    start: "Pour commencer",
    present: "Présenter",
    open: "Ouvrir",
    create: "Créer un cours",
    createSub: "Partez d’un modèle : couverture, schéma, instrument, quiz",
    slides: "Diapositives de ce cours",
    slideN: "Diapositive {n}",
    playDeck: "Ouvrir le cours",
    of: "{a} sur {b}",
    deckOf: "{n} diapositives",
  },
} as const;
type Key = keyof (typeof S)["en"];
const tr = (l: Lang, k: Key, v: Record<string, string | number> = {}) =>
  (S[l === "fr" ? "fr" : "en"][k] as string).replace(
    /\{(\w+)\}/g,
    (_, x: string) => String(v[x] ?? ""),
  );

const slidesOf = (c: Course | undefined): Step[] =>
  c ? c.steps.filter((s) => !!s.slide) : [];

/** The deck the hero shows: the one to continue when the student has started or been assigned one, else the
 *  holding sample (the most telling cover: a hold drawn in slide units), else the first deck with slides. */
export function featuredEntry(
  list: readonly LibraryEntry[],
  last: { id: string; stepId?: string } | null,
): LibraryEntry | null {
  const c = continueTarget(list, last);
  if (c && (c.started || c.entry.assigned) && slidesOf(c.entry.course).length)
    return c.entry;
  return (
    list.find((e) => e.id === HOLDING_ID && slidesOf(e.course).length) ??
    list.find((e) => !e.briefing && slidesOf(e.course).length) ??
    null
  );
}

/** Shelf order: Continue first, then assigned, then the rest as the library lists them (stored, then samples). */
export function shelfOrder(
  list: readonly LibraryEntry[],
  last: { id: string; stepId?: string } | null,
): { entry: LibraryEntry; cont: boolean; started: boolean }[] {
  const c = continueTarget(list, last);
  const out: { entry: LibraryEntry; cont: boolean; started: boolean }[] = [];
  if (c) out.push({ entry: c.entry, cont: true, started: c.started });
  for (const e of list)
    if (e.assigned && e !== c?.entry)
      out.push({ entry: e, cont: false, started: !!e.progress });
  for (const e of list)
    if (!e.assigned && e !== c?.entry)
      out.push({ entry: e, cont: false, started: !!e.progress });
  return out;
}

export function mountDeckHome(o: DeckHomeOptions): DeckHome {
  const l = o.lang;
  const page = o.page ?? "academy.html";
  let destroyed = false;
  let store: CourseStore | null = null;
  let entries: LibraryEntry[] = libraryEntries({
    samples: allSamples(),
    stored: [],
  });
  const views = new Set<SlideView>();
  const sims = new Map<string, SceneSims>();
  const io =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(
          (list) => {
            for (const x of list)
              if (x.isIntersecting) {
                io?.unobserve(x.target);
                (x.target as HTMLElement & { _draw?: () => void })._draw?.();
              }
          },
          { rootMargin: "120px" },
        )
      : null;

  const href = (k: "play" | "present", e: LibraryEntry, stepId?: string) =>
    academyHref(
      k === "play"
        ? { k: "play", id: e.id, ...(stepId ? { s: stepId } : {}) }
        : { k: "present", id: e.id },
      page,
    );

  /** one SceneSims per course: every thumbnail of a deck shares its instruments */
  const simsFor = (c: Course) => {
    let s = sims.get(c.id);
    if (!s) {
      s = new SceneSims({ scenes: c.scenes, cockpit: c.cockpit });
      sims.set(c.id, s);
    }
    return s;
  };
  const assetUrl = (id: string) =>
    store
      ? store.getAsset(id).then((b) => (b ? URL.createObjectURL(b) : null))
      : null;
  /** a static slide drawn into a 16:9 box (lazily, once it scrolls into view) */
  const thumb = (host: HTMLElement, c: Course, s: Step, eager = false) => {
    const draw = () => {
      if (destroyed || !host.isConnected || host.dataset.drawn) return;
      host.dataset.drawn = "1";
      try {
        const v = renderThumb(s.slide!, host, {
          lang: l,
          theme: c.theme,
          brand: c.brand,
          scenes: c.scenes,
          cockpit: c.cockpit,
          step: s,
          sims: simsFor(c),
          assetUrl,
          label: loc(s.title, l),
        });
        views.add(v);
        (host as HTMLElement & { _view?: SlideView })._view = v;
      } catch {
        host.classList.add("no-slide");
      }
    };
    (host as HTMLElement & { _draw?: () => void })._draw = draw;
    if (eager || !io) requestAnimationFrame(draw);
    else io.observe(host);
  };
  const dropView = (host: HTMLElement) => {
    const v = (host as HTMLElement & { _view?: SlideView })._view;
    if (v) {
      v.destroy();
      views.delete(v);
    }
  };

  // ---------------------------------------------------------------- the hero: one deck, a large slide + filmstrip
  const renderVisual = () => {
    const last = store?.last() ?? null;
    const e = featuredEntry(entries, last);
    for (const el of o.visual.querySelectorAll<HTMLElement>(
      ".dh-slide,.dh-film-t",
    ))
      dropView(el);
    o.visual.replaceChildren();
    const c = e?.course;
    const slides = slidesOf(c);
    if (!e || !c || !slides.length) return;
    let cur = 0;
    const big = h("div", {
      class: "dh-slide",
      role: "img",
      "aria-label": loc(slides[0].title, l),
    });
    const film = h("div", {
      class: "dh-film",
      role: "tablist",
      "aria-label": tr(l, "slides"),
    });
    const show = (i: number) => {
      cur = i;
      dropView(big);
      delete big.dataset.drawn;
      big.replaceChildren();
      big.setAttribute("aria-label", loc(slides[i].title, l));
      thumb(big, c, slides[i], true);
      film.querySelectorAll<HTMLElement>(".dh-film-b").forEach((b, k) => {
        b.classList.toggle("on", k === i);
        b.setAttribute("aria-selected", k === i ? "true" : "false");
      });
    };
    // the cover, then the slides that show the most (a diagram, an instrument, a formula, a quiz)
    const pick = [0, ...slides.map((_, i) => i).filter((i) => i > 0)].slice(
      0,
      5,
    );
    for (const i of pick) {
      const t = h("span", { class: "dh-film-t", "aria-hidden": "true" });
      const b = h(
        "button",
        {
          class: "dh-film-b",
          type: "button",
          role: "tab",
          title: loc(slides[i].title, l),
          "aria-label": `${tr(l, "slideN", { n: i + 1 })} · ${loc(slides[i].title, l)}`,
          onclick: () => show(i),
        },
        t,
      );
      film.append(b);
      thumb(t, c, slides[i], true);
    }
    const playAt = () =>
      o.navigate(
        href("play", e, cur > 0 ? slides[cur].id : e.progress?.stepId),
      );
    const open = h("button", {
      class: "dh-slide-hit",
      type: "button",
      "aria-label": `${tr(l, "playDeck")} · ${loc(e.title, l)}`,
      onclick: playAt,
    });
    const cap = h(
      "div",
      { class: "dh-cap" },
      h(
        "span",
        { class: "dh-cap-t" },
        h("b", {}, loc(e.title, l)),
        h(
          "small",
          {},
          [
            tr(l, "deckOf", { n: slides.length }),
            e.minutes ? ct("minutes", l, { n: e.minutes }) : "",
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      ),
      h(
        "button",
        {
          class: "dh-cap-b",
          type: "button",
          onclick: () => o.navigate(href("present", e)),
          title: tr(l, "present"),
        },
        icon("screen"),
        h("span", {}, tr(l, "present")),
      ),
    );
    o.visual.append(h("div", { class: "dh-stage" }, big, open), film, cap);
    show(0);
  };

  // ---------------------------------------------------------------- the shelf: every deck as a slide card
  const renderShelf = () => {
    const last = store?.last() ?? null;
    for (const el of o.shelf.querySelectorAll<HTMLElement>(".dh-card-thumb"))
      dropView(el);
    o.shelf.replaceChildren();
    const rows = shelfOrder(entries, last);
    for (const { entry: e, cont, started } of rows) {
      const c = e.course;
      const slides = slidesOf(c);
      const cover = slides[0];
      const tag = cont
        ? started
          ? tr(l, "cont")
          : tr(l, "start")
        : e.briefing
          ? ct("tagBriefing", l)
          : e.shelf === "assigned"
            ? ct("tagAssigned", l)
            : e.shelf === "club"
              ? ct("tagClub", l)
              : e.shelf === "draft"
                ? ct("tagDraft", l)
                : ct("tagSample", l);
      const th = h("div", {
        class: `dh-card-thumb${cover ? "" : " no-slide"}`,
        "aria-hidden": "true",
      });
      const idx = e.progress?.index ?? 0;
      const pct =
        e.progress && e.progress.total
          ? Math.round((idx / e.progress.total) * 100)
          : 0;
      const meta = [
        ctSteps(e.steps, l),
        e.minutes ? ct("minutes", l, { n: e.minutes }) : "",
      ]
        .filter(Boolean)
        .join(" · ");
      const go = () =>
        o.navigate(href("play", e, started ? e.progress?.stepId : undefined));
      const card = h(
        "article",
        {
          class: `dh-card${cont ? " is-cont" : ""}${e.shelf === "draft" ? " is-draft" : ""}`,
          role: "listitem",
        },
        h("button", {
          class: "dh-card-hit",
          type: "button",
          "aria-label": `${tr(l, "open")} · ${loc(e.title, l)}`,
          onclick: go,
        }),
        h(
          "div",
          { class: "dh-card-media" },
          th,
        ),
        h(
          "div",
          { class: "dh-card-b" },
          h("h3", {}, loc(e.title, l)),
          h(
            "p",
            { class: "dh-meta" },
            h("span", { class: `dh-tag${cont ? " on" : ""}` }, tag),
            h("span", {}, meta),
          ),
          started && e.progress
            ? h(
                "div",
                { class: "dh-prog" },
                h(
                  "span",
                  {
                    class: "dh-bar",
                    role: "progressbar",
                    "aria-valuemin": "0",
                    "aria-valuemax": String(e.progress.total),
                    "aria-valuenow": String(idx),
                  },
                  h("i", { style: `width:${pct}%` }),
                ),
                h(
                  "span",
                  { class: "num" },
                  tr(l, "of", { a: idx + 1, b: e.progress.total }),
                ),
              )
            : null,
          h(
            "div",
            { class: "dh-acts" },
            e.briefing
              ? null
              : h(
                  "button",
                  {
                    class: "dh-act",
                    type: "button",
                    onclick: () => o.navigate(href("present", e)),
                    title: tr(l, "present"),
                  },
                  icon("screen"),
                  tr(l, "present"),
                ),
            h(
              "button",
              { class: "dh-act primary", type: "button", onclick: go },
              cont && started ? tr(l, "cont") : tr(l, "open"),
              icon("chev"),
            ),
          ),
        ),
      );
      o.shelf.append(card);
      if (c && cover) thumb(th, c, cover);
    }
    o.shelf.append(
      h(
        "button",
        {
          class: "dh-card dh-new",
          type: "button",
          role: "listitem",
          onclick: () => o.onCreate(),
        },
        h(
          "span",
          { class: "dh-new-media", "aria-hidden": "true" },
          h("span", { class: "dh-new-ic" }, icon("plus", 28)),
        ),
        h(
          "span",
          { class: "dh-card-b" },
          h("b", {}, tr(l, "create")),
          h("small", {}, tr(l, "createSub")),
        ),
      ),
    );
  };

  renderVisual();
  renderShelf();

  // stored decks and progress join when the store opens
  void (async () => {
    if (!o.store) return;
    try {
      store = await o.store;
    } catch {
      store = null;
    }
    if (destroyed || !store) return;
    const samples = allSamples();
    const stored: { entry: CourseIndexEntry; course?: Course | null }[] = [];
    for (const entry of store.list()) {
      let course: Course | null = null;
      try {
        course = await store.get(entry.id);
      } catch {
        course = null;
      }
      stored.push({ entry, course });
    }
    const progress = new Map<string, CourseProgress>();
    for (const id of [
      ...stored.map((x) => x.entry.id),
      ...samples.map((c) => c.id),
    ]) {
      try {
        const p = await store.getProgress(id, o.profileId ?? "local");
        if (p) progress.set(id, p);
      } catch {
        /* no progress */
      }
    }
    if (destroyed) return;
    entries = libraryEntries({
      samples,
      stored,
      imported: importedIds(),
      progress,
    });
    if (!stored.length && !progress.size && !store.last()) return; // nothing changed: keep the drawn slides
    renderVisual();
    renderShelf();
  })();

  return {
    destroy() {
      destroyed = true;
      io?.disconnect();
      for (const v of views) v.destroy();
      views.clear();
      for (const s of sims.values()) s.destroy();
      sims.clear();
    },
  };
}

// ------------------------------------------------------------------ icons (24 × 24 strokes)
const PATHS = {
  screen: "M3 5h18v11H3zM8 20h8M12 16v4",
  chev: "M9 6l6 6-6 6",
  plus: "M12 5v14M5 12h14",
} as const;
function icon(name: keyof typeof PATHS, size = 18): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("width", String(size));
  s.setAttribute("height", String(size));
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("class", "dh-ic");
  const p = document.createElementNS(NS, "path");
  p.setAttribute("d", PATHS[name]);
  s.append(p);
  return s;
}
