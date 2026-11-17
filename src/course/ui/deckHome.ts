// What the Accueil page (ui/home.ts) needs from the courses, loaded on demand so the slide engine stays out of the
// cockpit's first bundle:
//   - homeData(): the one « Reprendre » (the course the student left part-way, at the step they left), and an
//     assigned course for « Aussi en cours »; computed like the library's Continue (continueTarget), one « start
//     here » for the whole product;
//   - drawCover(): a real slide drawn into a 16:9 picture (the doors' covers, the Reprendre cover).
// The pure helpers featuredEntry() and shelfOrder() keep the library's order (tested in tests/slides-first).
import "../../styles/course-canvas.css";
import { allSamples, HOLDING_ID, SAMPLES } from "../samples";
import { renderSlide, renderThumb } from "../canvas/render";
import { SceneSims } from "../canvas/instruments";
import type { CourseIndexEntry, CourseStore } from "../store";
import {
  continueTarget,
  importedIds,
  libraryEntries,
  type LibraryEntry,
} from "./library";
import { loc } from "../i18n";
import { isTask } from "./reader";
import type { Course, CourseProgress, Lang, SlideCanvas, Step } from "../types";
import { coursePlacement, isOwnCourse } from "../../library/sources";
import { programDef, subjectDef } from "../../library/programs";
import { courseCover } from "../../library/covers";

const slidesOf = (c: Course | undefined): Step[] =>
  c ? c.steps.filter((s) => !!s.slide) : [];

/** The deck to feature: the one to continue when the student has started or been assigned one, else the holding
 *  sample, else the first deck with slides. */
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

// ------------------------------------------------------------------ Reprendre
export interface HomeCourse {
  id: string;
  title: string;
  /** « LAPL · PPL › Performances et préparation du vol » */
  home: string;
  /** the formation it is filed in (the player's way back) */
  program: string;
}
export interface HomeResume extends HomeCourse {
  /** the step the student left (0-based), its id and title */
  index: number;
  stepId: string;
  stepTitle: string;
  total: number;
  firstStepId: string;
  /** about how long is left, in minutes (rounded to 5) */
  minutesLeft: number | null;
}
export interface HomeData {
  resume: HomeResume | null;
  /** an assigned course other than the resumed one (« À faire ») */
  assigned: HomeCourse | null;
  /** the course of my own edited last (« Reprendre la modification », audit §3) */
  editing?: HomeCourse | null;
}

/** Where a course lives, as words: its formation › its subject. */
function homeOf(e: LibraryEntry, l: Lang): { home: string; program: string } {
  try {
    const p = coursePlacement(
      e,
      (id) => SAMPLES.find((s) => s.id === id)?.program,
    );
    const d = subjectDef(p.home);
    return {
      home: `${loc(programDef(d.program).code, l)} › ${loc(d.title, l)}`,
      program: d.program,
    };
  } catch {
    return { home: "", program: "" };
  }
}

/** The steps of a course whose task (À vous, Question, Calcul, Vol au simulateur) has no attempt yet. Pure. */
export function openTaskSteps(
  course: Pick<Course, "steps">,
  attempts: readonly { stepId: string }[],
): string[] {
  // a slide's « À vous » is recorded under its own id (« <step>~yt~<block> »): it counts for its slide
  const tried = new Set(attempts.map((a) => a.stepId.split("~")[0]));
  return course.steps.filter((s) => isTask(s) && !tried.has(s.id)).map((s) => s.id);
}

/** The pure part of homeData: the course to resume (left part-way, past its first step) and an assignment.
 *  `open`: per course, its steps with a task not done yet. A course is part-way while one is left, whatever the step
 *  the student stopped on (the last step is often the simulator flight: audit §12). */
export function pickResume(
  list: readonly LibraryEntry[],
  last: { id: string; stepId?: string } | null,
  l: Lang,
  open?: ReadonlyMap<string, readonly string[]>,
): HomeData {
  const c = continueTarget(list, last);
  let resume: HomeResume | null = null;
  const e = c?.entry;
  const course = e?.course;
  if (e && course && course.steps.length && c.started) {
    const stepId =
      e.progress?.stepId ?? (last?.id === e.id ? last.stepId : undefined);
    const index = Math.max(
      0,
      course.steps.findIndex((s) => s.id === stepId),
    );
    const total = course.steps.length;
    // left part-way: past the first step, and not on the last one unless a task is still to do
    const tasksLeft = (open?.get(e.id)?.length ?? 0) > 0;
    if (stepId && index >= 1 && (index < total - 1 || tasksLeft)) {
      const where = homeOf(e, l);
      const mins = e.minutes ?? course.minutes;
      resume = {
        id: e.id,
        title: loc(e.title, l),
        ...where,
        index,
        stepId: course.steps[index].id,
        stepTitle: loc(course.steps[index].title, l),
        total,
        firstStepId: course.steps[0].id,
        minutesLeft: mins
          ? Math.max(5, Math.round((mins * (1 - index / total)) / 5) * 5)
          : null,
      };
    }
  }
  const a = list.find(
    (x) =>
      x.assigned &&
      x.id !== resume?.id &&
      (!x.progress || x.progress.index < x.progress.total - 1),
  );
  const ed = list
    .filter(isOwnCourse)
    .sort((x, y) => (x.updated < y.updated ? 1 : -1))[0];
  return {
    resume,
    assigned: a ? { id: a.id, title: loc(a.title, l), ...homeOf(a, l) } : null,
    editing: ed ? { id: ed.id, title: loc(ed.title, l), ...homeOf(ed, l) } : null,
  };
}

/** Read the store (stored courses, progress, the last opened course) and pick what Accueil shows. */
export async function homeData(o: {
  lang: Lang;
  store: Promise<CourseStore> | null;
  profileId?: string;
}): Promise<HomeData> {
  let store: CourseStore | null = null;
  try {
    store = o.store ? await o.store : null;
  } catch {
    store = null;
  }
  const samples = allSamples();
  if (!store)
    return pickResume(libraryEntries({ samples, stored: [] }), null, o.lang);
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
  const last = store.last();
  const ids = new Set([
    ...stored.map((x) => x.entry.id),
    ...(last ? [last.id] : []),
  ]);
  for (const s of stored) if (s.entry.assigned) ids.add(s.entry.id);
  // the samples' progress only for the course last opened (reading every sample's record is slow on an iPad)
  for (const id of ids) {
    try {
      const p = await store.getProgress(id, o.profileId ?? "local");
      if (p) progress.set(id, p);
    } catch {
      /* no progress */
    }
  }
  const list = libraryEntries({
    samples,
    stored,
    imported: importedIds(),
    progress,
  });
  // the course to resume: its tasks not done yet (one course, so one read)
  const open = new Map<string, string[]>();
  if (last) {
    const c = list.find((x) => x.id === last.id)?.course;
    if (c)
      try {
        const atts = await store.listAttempts({
          courseId: c.id,
          profileId: o.profileId ?? "local",
        });
        open.set(c.id, openTaskSteps(c, atts));
      } catch {
        /* no attempts: the position alone decides */
      }
  }
  return pickResume(list, last, o.lang, open);
}

// ------------------------------------------------------------------ covers
/** A course's first slide (or a product slide) drawn into `host`, a 16:9 picture. */
export async function drawCover(
  host: HTMLElement,
  what: { course: string } | { product: string },
  lang: Lang,
): Promise<{ destroy(): void } | null> {
  let slide: SlideCanvas | null = null;
  let course: Course | null = null;
  let step: Step | undefined;
  if ("product" in what) {
    const p = await import("../samples/productDeck");
    slide = p.productDeck().find((x) => x.id === what.product)?.slide ?? null;
  } else {
    course =
      allSamples().find((c) => c.id === what.course) ??
      (await (async () => {
        try {
          const st = await (await import("../store")).courseStore();
          return await st.get(what.course);
        } catch {
          return null;
        }
      })());
    const pick = course ? courseCover(course) : null;
    slide = pick?.slide ?? null;
    step = pick?.step;
  }
  if (!slide || !host.isConnected) return null;
  const sims = course
    ? new SceneSims({ scenes: course.scenes, cockpit: course.cockpit })
    : null;
  try {
    // a product slide is drawn as it plays (its instrument moves; a picture, so nothing in it takes the pointer)
    if ("product" in what) {
      host.setAttribute("inert", "");
      const pv = renderSlide(slide, host, { mode: "play", lang, theme: "classroom" });
      return { destroy: () => pv.destroy() };
    }
    const v = renderThumb(slide, host, {
      lang,
      theme: course?.theme ?? "classroom",
      ...(course?.brand ? { brand: course.brand } : {}),
      ...(course ? { scenes: course.scenes, cockpit: course.cockpit } : {}),
      ...(step ? { step } : {}),
      ...(sims ? { sims } : {}),
    });
    return {
      destroy() {
        v.destroy();
        sims?.destroy();
      },
    };
  } catch {
    sims?.destroy();
    return null;
  }
}
