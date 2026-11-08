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
import { appBar, placeName, PLACE_HREF } from "../ui/appBar";
import { isProgramId, programDef } from "../library/programs";
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
  BACK_ITEM_KEY,
  courseHomeLine,
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
import {
  runSlideYourTurn,
  yourTurnSlideRenderer,
  type YourTurnCtx,
} from "./slideTurn";

const root =
  document.getElementById("academy") ??
  document.body.appendChild(h("div", { id: "academy" }));
root.classList.add("ga");
document.documentElement.classList.add("ga-doc");

let lang: Lang = courseLang();
let storeP: Promise<CourseStore | null> = courseStore().catch(() => null);
let view: {
  destroy(): void;
  setLang?(l: Lang): void;
  goTo?(stepId: string): void;
} | null = null;
let routeKey = "";
/** the route being drawn (its page may still be loading a chunk or the store) */
let loadingKey = "";

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
  importPdfCourse?: (
    store: CourseStore,
    file: File,
    lang: Lang,
  ) => Promise<{ id: string } | null>;
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
  if (r.k === "edit" || r.k === "present" || r.k === "project")
    return `${r.k}:${r.id}`;
  // the library keeps its programme and subject in the hash itself (#library&p=ir&s=ir.hold)
  if (r.k === "library") return "library";
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
  // the same route while it is still loading (go() routes, then the hashchange routes again): one page, not two
  if (key === routeKey && !view && loadingKey === key) return;
  if (key === routeKey && view) {
    // a link to another step of the course already open
    if ((r.k === "play" || r.k === "present" || r.k === "edit") && r.s)
      view.goTo?.(r.s);
    return;
  }
  routeKey = key;
  loadingKey = key;
  view?.destroy();
  view = null;
  root.replaceChildren();
  document.title = brandTitle(ct("groundSchool", lang));
  switch (r.k) {
    case "library":
      return showLibrary();
    case "play":
      return showPlayer(r.id, { stepId: r.s, token: r.a, from: r.from });
    case "edit":
      return showEditor(r.id);
    case "present":
    case "project":
      return showPresent(r.k, r.id);
    case "share":
      return openShare(r.code);
    case "new":
      return showNewCourse(r);
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
/** a course opened from Accueil (index.html) goes back there (flightcenter.ts COURSE_FROM_KEY) */
const COURSE_FROM_KEY = "ifr.courseFrom";
function leftHome(): boolean {
  try {
    const was = sessionStorage.getItem(COURSE_FROM_KEY) === "fc";
    sessionStorage.removeItem(COURSE_FROM_KEY);
    return was;
  } catch {
    return false;
  }
}
/** Where a course was opened from (#play=…&from=home|lib|<formation>): kept per course for the session, so the
 *  way back survives the round trip to the cockpit (its return link carries no from=). */
const FROM_KEY = (id: string) => `ifr.courseFrom.${id}`;
function courseFrom(id: string, from?: string): string {
  try {
    if (from) {
      sessionStorage.setItem(FROM_KEY(id), from);
      return from;
    }
    const kept = sessionStorage.getItem(FROM_KEY(id));
    if (kept) return kept;
  } catch {
    /* storage blocked */
  }
  return leftHome() ? "home" : "lib";
}
/** the labelled way back of a course: its word and where it goes */
function backTarget(
  from: string,
  courseId: string,
): { label: (l: Lang) => string; go: () => void } {
  if (from === "home")
    return {
      label: (l) => placeName("home", l),
      go: () => location.assign(PLACE_HREF.home),
    };
  if (isProgramId(from))
    return {
      label: (l) => loc(programDef(from).code, l),
      go: () => {
        // the formation page opens with this course's card in view
        try {
          sessionStorage.setItem(BACK_ITEM_KEY, `course:${courseId}`);
        } catch {
          /* storage blocked */
        }
        go({ k: "library", p: from });
      },
    };
  return { label: (l) => placeName("lib", l), go: () => go({ k: "library" }) };
}
/** where a presentation was opened (« edit:<id> »): its « Quitter la présentation » returns there */
const PRESENT_FROM_KEY = "ifr.presentFrom";
/** the presenter's and the editor's way back: the library, or Accueil when they were opened from there */
function exitToLibrary() {
  if (leftHome()) location.assign(PLACE_HREF.home);
  else go({ k: "library" });
}
/** The app bar (ui/appBar.ts): the same header as Accueil and Simulateur, Bibliothèque current. */
function topBar(): {
  el: HTMLElement;
  input: HTMLInputElement;
  setLang(l: Lang): void;
} {
  const bar = appBar({
    place: "lib",
    lang,
    onLang: (l) => setCourseLang(l),
    go: (p) => {
      if (p !== "lib") return false;
      go({ k: "library" });
      return true;
    },
  });
  return bar;
}
function showLibrary(intent?: "new" | "present") {
  const page = h("div", { class: "ga-page" });
  const bar = topBar();
  // the library is the page's main content (one main landmark; the app bar is its banner)
  const scroller = h("main", { class: "ga-scroll" });
  // this page's own library: a course opened from here comes back here
  leftHome();
  page.append(bar.el, scroller);
  root.append(page);
  const lib: CourseLibrary = mountLibrary(scroller, {
    lang,
    searchInput: bar.input,
    ...(intent ? { intent } : {}),
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
      bar.setLang(l);
    },
  };
}

// ------------------------------------------------------------------ Nouveau cours
/** « Créer un cours » (Accueil, the library, an empty subject): the Nouveau cours page. Nothing is saved before its
 *  « Créer le cours »; its way back returns to where it was opened. */
async function showNewCourse(r: Extract<AcademyRoute, { k: "new" }>) {
  loading("new");
  const key = routeKey;
  const { mountNewCourse } = await import("../course/ui/newCourse");
  if (key !== routeKey) return;
  root.replaceChildren();
  const from = r.from ?? (leftHome() ? "home" : "lib");
  const back =
    from === "home"
      ? {
          label: (l: Lang) => placeName("home", l),
          go: () => location.assign(PLACE_HREF.home),
        }
      : from !== "lib" && isProgramId(from)
        ? {
            label: (l: Lang) => loc(programDef(from).code, l),
            go: () => go({ k: "library", p: from }),
          }
        : {
            label: (l: Lang) => placeName("lib", l),
            go: () => go({ k: "library" }),
          };
  const page = mountNewCourse(root, {
    lang,
    store: storeP,
    ...(r.p ? { program: r.p } : {}),
    ...(r.s ? { subject: r.s } : {}),
    backLabel: back.label,
    onBack: () => back.go(),
    onLang: (l) => setCourseLang(l),
    onCreated: (id) => go({ k: "edit", id }),
    ...(PDF["../course/pdfImport.ts"]
      ? {
          importPdf: async (s: CourseStore, f: File, l: Lang) => {
            const m = await optional(PDF, "../course/pdfImport.ts");
            return m?.importPdfCourse ? m.importPdfCourse(s, f, l) : null;
          },
        }
      : {}),
  });
  document.title = brandTitle(lang === "fr" ? "Nouveau cours" : "New course");
  view = {
    destroy: () => page.destroy(),
    setLang: (l) => {
      page.setLang(l);
      document.title = brandTitle(l === "fr" ? "Nouveau cours" : "New course");
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
/** A course with no step yet: nothing to present or play, one way back to the editor (never a blank page). */
function emptyCourse(id: string) {
  loadingKey = "";
  root.replaceChildren(
    h(
      "div",
      { class: "ga-page" },
      topBar().el,
      h(
        "main",
        { class: "ga-center" },
        h(
          "div",
          { class: "ga-card" },
          h("h1", {}, ct("emptyCourse", lang)),
          h("p", {}, ct("emptyCourseBody", lang)),
          h(
            "button",
            {
              class: "gl-primary",
              type: "button",
              onclick: () => go({ k: "edit", id }),
            },
            ct("backToEditor", lang),
          ),
        ),
      ),
    ),
  );
}
function notFound(id: string) {
  loadingKey = "";
  root.replaceChildren(
    h(
      "div",
      { class: "ga-page" },
      topBar().el,
      h(
        "main",
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
/** The same skeleton as academy.html's first frame: the focus bar and a sentence that says what is opening. */
function loading(what: "course" | "editor" | "new" = "course") {
  const fr = lang === "fr";
  const text =
    what === "editor"
      ? fr
        ? "Ouverture de l’éditeur de cours…"
        : "Opening the course editor…"
      : what === "new"
        ? fr
          ? "Ouverture de Nouveau cours…"
          : "Opening New course…"
        : fr
          ? "Ouverture du cours…"
          : "Opening the course…";
  root.replaceChildren(
    h(
      "div",
      { class: "ga-boot", role: "status" },
      h(
        "div",
        { class: "ga-boot-top" },
        h("i", { "aria-hidden": "true" }),
        BRAND.name,
      ),
      h("p", { class: "ga-boot-t" }, text),
      h("div", { class: "ga-boot-line", "aria-hidden": "true" }, h("i")),
    ),
  );
}

// ------------------------------------------------------------------ player
async function showPlayer(
  id: string,
  o: {
    stepId?: string;
    token?: string;
    mode?: string;
    notice?: string;
    from?: string;
  } = {},
) {
  loading();
  const key = routeKey;
  const { course, store } = await loadCourse(id);
  if (key !== routeKey) return;
  if (!course) return notFound(id);
  if (!course.steps.length) return emptyCourse(id);
  root.replaceChildren();
  const host = h("div", { class: "ga-player" });
  root.append(host);
  let player: CoursePlayer | null = null;
  const slideRenderer = academySlideRenderer(store, () => player?.el ?? null);
  const back = backTarget(courseFrom(course.id, o.from), course.id);
  player = playCourse(host, {
    course,
    store,
    lang,
    profileId: "local",
    stepId: o.stepId,
    token: o.token,
    ...(o.mode ? { mode: o.mode } : {}),
    renderSlide: slideRenderer,
    onExit: () => back.go(),
    backLabel: back.label,
    context: (l) => {
      try {
        return courseHomeLine(course, l);
      } catch {
        return "";
      }
    },
    onLang: (l) => setCourseLang(l),
    onStep: (sid) => {
      const hash = academyHash({ k: "play", id: course.id, s: sid });
      if (location.hash !== hash) history.replaceState(null, "", hash);
      store?.setLast(course.id, sid);
    },
  });
  store?.setLast(course.id, o.stepId);
  document.title = brandTitle(loc(course.title, lang));
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
  return yourTurnSlideRenderer({
    store,
    playerEl,
    root: () => root,
    run: yourTurn,
  });
}

// ------------------------------------------------------------------ Your turn on a slide
async function yourTurn(c: YourTurnCtx): Promise<YourTurnResult | null> {
  // a dedicated runner (package Q) when the build has one
  const q = await optional(YOURTURN, "../course/yourTurn.ts");
  if (q?.runYourTurn)
    return q.runYourTurn({
      course: c.course,
      step: c.step,
      block: c.block,
      yourTurn: c.yt,
      lang: c.lang,
      store: c.store,
    });
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
    onExit: () => exitToLibrary(),
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
  if (!course.steps.length) return emptyCourse(id);
  root.replaceChildren();
  let el: HTMLElement | null = null;
  const renderSlide = academySlideRenderer(
    k === "present" ? store : null,
    () => el,
  );
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
      onExit: () => {
        // back to where the presentation was opened: the editor, else the library (or Accueil)
        let from: string | null = null;
        try {
          from = sessionStorage.getItem(PRESENT_FROM_KEY);
          sessionStorage.removeItem(PRESENT_FROM_KEY);
        } catch {
          from = null;
        }
        if (from === `edit:${course.id}`) go({ k: "edit", id: course.id });
        else exitToLibrary();
      },
      onLang: (l) => setCourseLang(l),
      onStep: (s) => {
        const hash = academyHash({ k: "present", id: course.id, s });
        if (location.hash !== hash) history.replaceState(null, "", hash);
      },
    });
    el = v.el;
    document.title = brandTitle(
      `${loc(course.title, lang)} — ${lang === "fr" ? "Présentation" : "Presenting"}`,
    );
    view = {
      destroy: () => v.destroy(),
      setLang: (l) => v.setLang(l),
      goTo: (sid) => v.goTo(sid),
    };
    return;
  }
  const { mountProjector } = await import("../course/ui/projector");
  if (key !== routeKey) return;
  document.documentElement.classList.add("ga-projector");
  const v = mountProjector(root, { course, lang, renderSlide });
  el = v.el;
  document.title = `${loc(course.title, lang)} — ${lang === "fr" ? "Projection" : "Projector"}`;
  view = {
    destroy: () => {
      document.documentElement.classList.remove("ga-projector");
      v.destroy();
    },
  };
}

// ------------------------------------------------------------------ builder
async function showEditor(id: string) {
  loading("editor");
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
      academyHash({
        k: "edit",
        id: course.id,
        ...(r0.k === "edit" && r0.s ? { s: r0.s } : {}),
      }),
    );
  }
  if (!course) return notFound(id);
  // the course editor (package F): one builder for courses, briefings and designed slides (a lazy chunk)
  const editor = await import("../course/ui/editor");
  if (key !== routeKey && routeKey !== routeKeyOf({ k: "edit", id: course.id }))
    return;
  root.replaceChildren();
  const c = course;
  const r = academyRoute(location.hash);
  const ed = editor.openCourseEditor(root, {
    course: c,
    store,
    lang,
    ...(r.k === "edit" && r.s ? { stepId: r.s } : {}),
    // « ← Mes cours »: the instructor's own courses and drafts
    onExit: () => go({ k: "library", p: "instructors" }),
    onLang: (l) => setCourseLang(l),
    onStep: (s) => {
      const hash = academyHash({ k: "edit", id: c.id, s });
      if (location.hash !== hash) history.replaceState(null, "", hash);
    },
    onPresent: (cid, sid) => {
      // « Quitter la présentation » comes back to this editor
      try {
        sessionStorage.setItem(PRESENT_FROM_KEY, `edit:${cid}`);
      } catch {
        /* storage blocked */
      }
      go({ k: "present", id: cid, ...(sid ? { s: sid } : {}) });
    },
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
