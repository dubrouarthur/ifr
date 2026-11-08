// The slide decks on the Flight Center's first screen (SPEC slides v2 §12), kept simple: the hero shows one real
// deck, its cover drawn live by the slide renderer, and the shelf under it shows four decks as slide cards (cover
// thumbnail, steps, minutes, progress); the rest is one click away in the library. Loaded on demand by
// ui/flightcenter.ts, so the slide engine stays out of the cockpit's first bundle. Same entries and order as the
// library (library.ts): the deck the student should continue first, then assigned, recent and sample decks.
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
  /** the most deck cards on the shelf (default 4: the rest is one click away, in the library) */
  shelfMax?: number;
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
    open: "Open",
    playDeck: "Open the course",
    of: "{a} of {b}",
    deckOf: "{n} slides",
  },
  fr: {
    cont: "Reprendre",
    start: "Pour commencer",
    open: "Ouvrir",
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

  const href = (_k: "play", e: LibraryEntry, stepId?: string) =>
    academyHref({ k: "play", id: e.id, ...(stepId ? { s: stepId } : {}) }, page);

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

  // ---------------------------------------------------------------- the hero: one deck, its cover drawn large
  // (one slide and one caption: the Flight Center stays simple; the filmstrip and every action live in the player)
  const renderVisual = () => {
    const last = store?.last() ?? null;
    const e = featuredEntry(entries, last);
    for (const el of o.visual.querySelectorAll<HTMLElement>(".dh-slide"))
      dropView(el);
    o.visual.replaceChildren();
    const c = e?.course;
    const slides = slidesOf(c);
    if (!e || !c || !slides.length) return;
    const big = h("div", {
      class: "dh-slide",
      role: "img",
      "aria-label": loc(slides[0].title, l),
    });
    const open = h("button", {
      class: "dh-slide-hit",
      type: "button",
      "aria-label": `${tr(l, "playDeck")} · ${loc(e.title, l)}`,
      onclick: () => o.navigate(href("play", e, e.progress?.stepId)),
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
          // one count everywhere: the course's steps (its cover and the library say "20 steps", not "11 slides")
          [
            ctSteps(c.steps.length, l),
            e.minutes ? ct("minutes", l, { n: e.minutes }) : "",
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      ),
      // the way in, said: the cover is clickable, but nothing on it looked like it
      h(
        "button",
        {
          class: "btn dh-cap-go",
          type: "button",
          onclick: () => o.navigate(href("play", e, e.progress?.stepId)),
        },
        tr(l, "playDeck"),
      ),
    );
    o.visual.append(h("div", { class: "dh-stage" }, big, open), cap);
    thumb(big, c, slides[0], true);
  };

  // ---------------------------------------------------------------- the shelf: every deck as a slide card
  const renderShelf = () => {
    const last = store?.last() ?? null;
    for (const el of o.shelf.querySelectorAll<HTMLElement>(".dh-card-thumb"))
      dropView(el);
    o.shelf.replaceChildren();
    const rows = shelfOrder(entries, last).slice(0, o.shelfMax ?? 4);
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
        ),
      );
      o.shelf.append(card);
      if (c && cover) thumb(th, c, cover);
    }
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
