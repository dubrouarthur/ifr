// academy.html — the Ground school host (package I, SPEC §9.1): a hash router that never imports three.js (the 2D
// instrument renderers draw from the same Sim as the cockpit, without WebGL), so it loads fast on an iPad.
//   #library                       the course library (the same component as the Flight Center view)
//   #play=<id>&s=<step>&a=<token>  the player (resume, back from the cockpit with the attempt token)
//   #edit=<id>                     the course editor (one builder for courses, briefings and designed slides)
//   #present=<id> / #project=<id>  presenter console / projector window (BroadcastChannel sync, course/present.ts)
//   #c=C1.<code>                   a text-only course from a share link (imported, then played)
// A "Your turn" on a designed slide (package Q) runs here when no dedicated runner is installed: the slide's
// instrument becomes a live Try-it stage over the slide, its goal checked live, and the result comes back to the
// slide (the yourTurnDone reveal, the bound values, an AttemptRecord of kind 'yourTurn').
import { BRAND, brandTitle } from "../brand";
import "../styles/course.css";
import type {
  Course,
  Lang,
  SlideBlock,
  Step,
  YourTurn,
  YourTurnResult,
} from "../course/types";
import type { CourseStore } from "../course/store";
import { courseStore, storageNotice } from "../course/store";
import { h } from "../ui/dom";
import {
  ct,
  courseLang,
  loc,
  onCourseLang,
  setCourseLang,
} from "../course/i18n";
import {
  academyHash,
  academyRoute,
  mountLibrary,
  type AcademyRoute,
  type CourseLibrary,
} from "../course/ui/library";
import { isSampleId, sampleCourse } from "../course/samples";
import {
  playCourse,
  type CoursePlayer,
  type SlideRenderer,
} from "../course/ui/player";
import { runSlideYourTurn, yourTurnSlideRenderer, type YourTurnCtx } from "./slideTurn";

const root =
  document.getElementById("academy") ??
  document.body.appendChild(h("div", { id: "academy" }));
root.classList.add("ga");
document.documentElement.classList.add("ga-doc");

let lang: Lang = courseLang();
let storeP: Promise<CourseStore | null> = courseStore().catch(() => null);
let view: { destroy(): void; setLang?(l: Lang): void; goTo?(stepId: string): void } | null = null;
let routeKey = "";

// optional modules other packages ship (resolved at build time: absent files simply give no entry)
type YourTurnModule = {
  runYourTurn?: (o: {
    course: Course;
    step: Step;
    block: SlideBlock;
    yourTurn: YourTurn;
    lang: Lang;
    store: CourseStore | null;
  }) => Promise<YourTurnResult | null>;
};
const YOURTURN = import.meta.glob<YourTurnModule>("../course/yourTurn.ts");
type PdfModule = {
  importPdfCourse?: (store: CourseStore, file: File, lang: Lang) => Promise<{ id: string } | null>;
};
const PDF = import.meta.glob<PdfModule>("../course/pdfImport.ts");
async function optional<T>(
  table: Record<string, () => Promise<T>>,
  key: string,
): Promise<T | null> {
  const f = table[key];
  if (!f) return null;
  try {
    return await f();
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ routing
/** A step change inside the player, the editor or the presenter is not a new route. */
function routeKeyOf(r: AcademyRoute): string {
  if (r.k === "play") return `play:${r.id}:${r.a ?? ""}`;
  if (r.k === "edit" || r.k === "present" || r.k === "project") return `${r.k}:${r.id}`;
  return academyHash(r);
}
function go(r: AcademyRoute, replace = false) {
  const hash = academyHash(r);
  if (replace) history.replaceState(null, "", hash);
  else if (location.hash !== hash) location.hash = hash;
  void route();
}
async function route() {
  const r = academyRoute(location.hash);
  // the player keeps #play=…&s= in sync itself: a step change is not a new route
  const key = routeKeyOf(r);
  if (key === routeKey && view) {
    // a link to another step of the course already open
    if ((r.k === "play" || r.k === "present" || r.k === "edit") && r.s) view.goTo?.(r.s);
    return;
  }
  routeKey = key;
  view?.destroy();
  view = null;
  root.replaceChildren();
  document.title = brandTitle(ct("groundSchool", lang));
  switch (r.k) {
    case "library":
      return showLibrary();
    case "play":
      return showPlayer(r.id, { stepId: r.s, token: r.a });
    case "edit":
      return showEditor(r.id);
    case "present":
    case "project":
      return showPresent(r.k, r.id);
    case "share":
      return openShare(r.code);
  }
}
window.addEventListener("hashchange", () => void route());
onCourseLang((l) => {
  if (l === lang) return;
  lang = l;
  document.documentElement.lang = l;
  view?.setLang?.(l);
});
document.documentElement.lang = lang;

// ------------------------------------------------------------------ library
function topBar(): HTMLElement {
  const seg = h(
    "div",
    { class: "ga-lang", role: "group", "aria-label": "Language" },
    ...(["en", "fr"] as Lang[]).map((l) =>
      h(
        "button",
        {
          type: "button",
          class: l === lang ? "on" : "",
          "aria-pressed": l === lang ? "true" : "false",
          onclick: () => {
            setCourseLang(l);
            seg.querySelectorAll("button").forEach((b, i) => {
              const on = (i === 0 ? "en" : "fr") === l;
              b.classList.toggle("on", on);
              b.setAttribute("aria-pressed", on ? "true" : "false");
            });
          },
        },
        l.toUpperCase(),
      ),
    ),
  );
  const sim = h(
    "a",
    { class: "ga-link", href: "index.html" },
    ct("openSim", lang),
  );
  const bar = h(
    "header",
    { class: "ga-top" },
    h(
      "a",
      {
        class: "ga-brand",
        href: "index.html",
        "aria-label": ct("flightCenter", lang),
      },
      h("span", { class: "ga-brand-mark", "aria-hidden": "true" }),
      BRAND.name,
    ),
    h("span", { class: "ga-crumb-sep", "aria-hidden": "true" }, "/"),
    h("span", { class: "ga-crumb" }, ct("groundSchool", lang)),
    h("span", { class: "ga-sp" }),
    seg,
    sim,
  );
  return bar;
}
function showLibrary() {
  const page = h("div", { class: "ga-page" });
  let bar = topBar();
  const scroller = h("div", { class: "ga-scroll" });
  page.append(bar, scroller);
  root.append(page);
  const lib: CourseLibrary = mountLibrary(scroller, {
    lang,
    store: storeP.then((s) => s ?? Promise.reject(new Error("no store"))),
    navigate: (url) => {
      const hash = url.slice(url.indexOf("#"));
      go(academyRoute(hash));
    },
    ...(PDF["../course/pdfImport.ts"]
      ? {
          importPdf: async (s: CourseStore, f: File, l: Lang) => {
            const m = await optional(PDF, "../course/pdfImport.ts");
            return m?.importPdfCourse ? m.importPdfCourse(s, f, l) : null;
          },
        }
      : {}),
  });
  view = {
    destroy: () => lib.destroy(),
    setLang: (l) => {
      lib.setLang(l);
      const nb = topBar();
      bar.replaceWith(nb);
      bar = nb;
    },
  };
}

// ------------------------------------------------------------------ courses
async function loadCourse(
  id: string,
): Promise<{ course: Course | null; store: CourseStore | null }> {
  const store = await storeP;
  let course: Course | null = null;
  try {
    course = store ? await store.get(id) : null;
  } catch {
    course = null;
  }
  if (!course && isSampleId(id)) course = sampleCourse(id);
  return { course, store };
}
function notFound(id: string) {
  root.replaceChildren(
    h(
      "div",
      { class: "ga-page" },
      topBar(),
      h(
        "div",
        { class: "ga-center" },
        h(
          "div",
          { class: "ga-card" },
          h("h1", {}, ct("notFound", lang)),
          h("p", {}, ct("notFoundBody", lang)),
          h("p", { class: "ga-mono" }, id),
          h(
            "button",
            {
              class: "gl-primary",
              type: "button",
              onclick: () => go({ k: "library" }),
            },
            ct("backToLibrary", lang),
          ),
        ),
      ),
    ),
  );
}
function loading() {
  root.replaceChildren(
    h("div", { class: "ga-loading", role: "status" }, ct("loading", lang)),
  );
}

// ------------------------------------------------------------------ player
async function showPlayer(
  id: string,
  o: { stepId?: string; token?: string; mode?: string; notice?: string } = {},
) {
  loading();
  const key = routeKey;
  const { course, store } = await loadCourse(id);
  if (key !== routeKey) return;
  if (!course) return notFound(id);
  root.replaceChildren();
  const host = h("div", { class: "ga-player" });
  root.append(host);
  let player: CoursePlayer | null = null;
  const slideRenderer = academySlideRenderer(store, () => player?.el ?? null);
  player = playCourse(host, {
    course,
    store,
    lang,
    profileId: "local",
    stepId: o.stepId,
    token: o.token,
    ...(o.mode ? { mode: o.mode } : {}),
    renderSlide: slideRenderer,
    onExit: () => go({ k: "library" }),
    onLang: (l) => setCourseLang(l),
    onStep: (sid) => {
      const hash = academyHash({ k: "play", id: course.id, s: sid });
      if (location.hash !== hash) history.replaceState(null, "", hash);
      store?.setLast(course.id, sid);
    },
  });
  store?.setLast(course.id, o.stepId);
  document.title = `${loc(course.title, lang)} — ${ct("groundSchool", lang)}`;
  if (store && storageNotice(store, lang)) toast(storageNotice(store, lang)!);
  if (o.notice) toast(o.notice);
  view = {
    destroy: () => player?.destroy(),
    setLang: (l) => player?.setLang(l),
    goTo: (sid) => {
      if (player && player.step.id !== sid) player.goToId(sid);
    },
  };
}

/** Designed slides in academy: the canvas renderer plus Your turn on the slide's instrument (course/ui/slideTurn.ts). */
function academySlideRenderer(
  store: CourseStore | null,
  playerEl: () => HTMLElement | null,
): SlideRenderer {
  return yourTurnSlideRenderer({ store, playerEl, root: () => root, run: yourTurn });
}

// ------------------------------------------------------------------ Your turn on a slide
async function yourTurn(c: YourTurnCtx): Promise<YourTurnResult | null> {
  // a dedicated runner (package Q) when the build has one
  const q = await optional(YOURTURN, "../course/yourTurn.ts");
  if (q?.runYourTurn)
    return q.runYourTurn({ course: c.course, step: c.step, block: c.block, yourTurn: c.yt, lang: c.lang, store: c.store });
  if (c.yt.where === "sim") {
    toast(ct("yourTurnSim", c.lang));
    return null;
  }
  return runSlideYourTurn(c, root);
}

// ------------------------------------------------------------------ share links
async function openShare(code: string) {
  loading();
  const store = await storeP;
  const pack = await import("../course/pack");
  const course = await pack.decodeCourseShare(code);
  if (!course) {
    notFound(ct("shareBad", lang));
    return;
  }
  if (store) {
    const rep = await pack.importCourseShare(store, code, "newer", { lang });
    const { markImported } = await import("../course/ui/library");
    const id =
      rep.renamed[0]?.to ?? rep.added[0] ?? rep.replaced[0] ?? course.id;
    markImported([id]);
    routeKey = "";
    history.replaceState(null, "", academyHash({ k: "play", id }));
    return showPlayer(id, { notice: ct("shareOpened", lang) });
  }
  // no storage: play it from memory
  root.replaceChildren();
  const host = h("div", { class: "ga-player" });
  root.append(host);
  const p = playCourse(host, {
    course,
    store: null,
    lang,
    onExit: () => go({ k: "library" }),
    onLang: (l) => setCourseLang(l),
  });
  view = { destroy: () => p.destroy(), setLang: (l) => p.setLang(l) };
}

// ------------------------------------------------------------------ present / project
async function showPresent(k: "present" | "project", id: string) {
  loading();
  const key = routeKey;
  const { course, store } = await loadCourse(id);
  if (key !== routeKey) return;
  if (!course) return notFound(id);
  root.replaceChildren();
  let el: HTMLElement | null = null;
  const renderSlide = academySlideRenderer(k === "present" ? store : null, () => el);
  if (k === "present") {
    const { mountPresenter } = await import("../course/ui/presenter");
    if (key !== routeKey) return;
    const r = academyRoute(location.hash);
    const v = mountPresenter(root, {
      course,
      store,
      lang,
      ...(r.k === "present" && r.s ? { stepId: r.s } : {}),
      renderSlide,
      onExit: () => go({ k: "library" }),
      onLang: (l) => setCourseLang(l),
      onStep: (s) => {
        const hash = academyHash({ k: "present", id: course.id, s });
        if (location.hash !== hash) history.replaceState(null, "", hash);
      },
    });
    el = v.el;
    document.title = `${loc(course.title, lang)} — ${ct("groundSchool", lang)}`;
    view = { destroy: () => v.destroy(), setLang: (l) => v.setLang(l), goTo: (sid) => v.goTo(sid) };
    return;
  }
  const { mountProjector } = await import("../course/ui/projector");
  if (key !== routeKey) return;
  document.documentElement.classList.add("ga-projector");
  const v = mountProjector(root, { course, lang, renderSlide });
  el = v.el;
  document.title = `${loc(course.title, lang)} — ${ct("groundSchool", lang)}`;
  view = {
    destroy: () => {
      document.documentElement.classList.remove("ga-projector");
      v.destroy();
    },
  };
}

// ------------------------------------------------------------------ builder
async function showEditor(id: string) {
  loading();
  const key = routeKey;
  const store = await storeP;
  if (key !== routeKey) return;
  if (!store) return notFound(id);
  let course = await store.get(id).catch(() => null);
  let notice: string | undefined;
  if (!course && isSampleId(id)) {
    // samples are read-only: edit a copy
    const src = sampleCourse(id)!;
    const r = await store.duplicate(src, { sample: id });
    if (!r.ok) return notFound(id);
    course = r.course;
    notice = ct("sampleCopy", lang);
    routeKey = routeKeyOf({ k: "edit", id: course.id });
    // keep the step the link pointed at (#edit=sample-vor&s=<step>)
    const r0 = academyRoute(location.hash);
    history.replaceState(
      null,
      "",
      academyHash({ k: "edit", id: course.id, ...(r0.k === "edit" && r0.s ? { s: r0.s } : {}) }),
    );
  }
  if (!course) return notFound(id);
  // the course editor (package F): one builder for courses, briefings and designed slides (a lazy chunk)
  const editor = await import("../course/ui/editor");
  if (key !== routeKey && routeKey !== routeKeyOf({ k: "edit", id: course.id })) return;
  root.replaceChildren();
  const c = course;
  const r = academyRoute(location.hash);
  const ed = editor.openCourseEditor(root, {
    course: c,
    store,
    lang,
    ...(r.k === "edit" && r.s ? { stepId: r.s } : {}),
    onExit: () => go({ k: "library" }),
    onLang: (l) => setCourseLang(l),
    onStep: (s) => {
      const hash = academyHash({ k: "edit", id: c.id, s });
      if (location.hash !== hash) history.replaceState(null, "", hash);
    },
    onPresent: (cid, sid) => go({ k: "present", id: cid, ...(sid ? { s: sid } : {}) }),
  });
  if (notice) toast(notice);
  view = {
    destroy: () => {
      void ed.saveNow().catch(() => false);
      ed.destroy();
    },
    setLang: (l) => ed.setLang(l),
    goTo: (sid) => ed.goTo(sid),
  };
}

// ------------------------------------------------------------------ toast (the app's own, never alert())
let toastT = 0;
function toast(text: string) {
  let el = document.querySelector<HTMLElement>(".ga-toast");
  if (!el) {
    el = h("div", { class: "ga-toast", role: "status" });
    document.body.append(el);
  }
  el.textContent = text;
  el.hidden = false;
  window.clearTimeout(toastT);
  toastT = window.setTimeout(() => el && (el.hidden = true), 5000);
}

// ------------------------------------------------------------------ boot
if (!location.hash || location.hash === "#")
  history.replaceState(null, "", "#library");
void route();
// a store that failed to open is retried once (an iPad waking up from a long sleep)
storeP.then((s) => {
  if (!s) storeP = courseStore().catch(() => null);
});
