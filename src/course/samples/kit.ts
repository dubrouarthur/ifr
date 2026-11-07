// Ground school — the sample courses' building kit (package I). Small, typed builders so the four built-in
// courses read like the lesson plan they are: designed slides composed with the canvas helpers (layouts.ts),
// Reader + Stage steps (try / quiz / calc / drill / fly), scenes posed from numbers, and a finishing pass that
// gives every block a stable id (the canvas helpers number blocks with a module counter: ids would otherwise
// depend on how many slides were built before).
//
// Content rules (SPEC §1, VISION): restrained aviation design (theme tokens only, no decoration), FR / EN for
// every author text, every rule taught cites its source, hold entries come from holdEntry() (nav/holding.ts).
import type {
  Cockpit,
  Course,
  CourseShape,
  BriefingFor,
  GoalCheck,
  L10n,
  ReaderBlock,
  SceneFields,
  SimScene,
  SlideBlock,
  SlideCanvas,
  Step,
  StepKind,
  ThemeId,
} from "../types";
import type { Weather } from "../../sim/environment";
import { sceneFromFields } from "../scene";
import { DEFAULT_GRID } from "../canvas/geom";

export {
  ARROW,
  CALLOUT,
  IMG,
  INST,
  L,
  M,
  MARK,
  SHAPE,
  T,
  onInstrument,
} from "../canvas/layouts";

/** The date the built-in samples carry (stable: a sample's hash must not change between page loads). */
export const SAMPLE_DATE = "2026-11-06T00:00:00.000Z";
/** The built-in samples' author line ("Built in" in the library). */
export const SAMPLE_AUTHOR: { name: string; club?: string } = { name: "IFR Trainer" };

// ------------------------------------------------------------------ scenes
export interface SceneOpts {
  label: string;
  cockpit?: Cockpit;
  wind?: [dir: number, kt: number];
  weather?: Partial<Weather>;
  seed?: number;
}
/** A scene posed from numbers ("Edit as numbers"), with a fixed capture date and seed. */
export function scene(
  id: string,
  fields: Omit<SceneFields, "kind">,
  o: SceneOpts,
): SimScene {
  const sc = sceneFromFields(
    { kind: "fields", ...fields },
    {
      id,
      label: o.label,
      cockpit: o.cockpit ?? "steam",
      weather: {
        ...(o.wind ? { windDir: o.wind[0], windKt: o.wind[1] } : {}),
        ...(o.weather ?? {}),
      },
      seed: o.seed ?? 4183,
    },
  );
  sc.captured = { at: SAMPLE_DATE, from: "fields" };
  return sc;
}

// ------------------------------------------------------------------ slides
/** A 16:9 canvas on the default grid. */
export function canvas(
  blocks: SlideBlock[],
  o: Partial<SlideCanvas> = {},
): SlideCanvas {
  return {
    size: { w: 1920, h: 1080 },
    grid: DEFAULT_GRID,
    layout: o.layout ?? "blank",
    ...o,
    blocks,
  };
}

/** A checklist block ("Do this" rows ticked live). */
export function CHECKLIST(
  id: string,
  rows: {
    text: L10n;
    check?: number;
    readout?: import("../types").ReadoutId;
  }[],
  x: number,
  y: number,
  w: number,
  h: number,
  e: { title?: L10n; reveal?: number | import("../types").BlockReveal; goal?: number[] } = {},
): SlideBlock {
  return {
    id,
    frame: { x, y, w, h, z: 1 },
    kind: "checklist",
    rows,
    ...(e.title ? { title: e.title } : {}),
    ...(e.reveal ? { reveal: typeof e.reveal === "number" ? { order: e.reveal } : e.reveal } : {}),
    ...(e.goal ? { goal: e.goal } : {}),
  };
}
/** A diagram block (hold, calc diagram…). */
export function DIAGRAM(
  id: string,
  d: Extract<SlideBlock, { kind: "diagram" }>["d"],
  alt: L10n,
  x: number,
  y: number,
  w: number,
  h: number,
  e: {
    caption?: L10n;
    interactive?: boolean;
    reveal?: number | import("../types").BlockReveal;
    fromCalc?: string;
  } = {},
): SlideBlock {
  return {
    id,
    frame: { x, y, w, h, z: 1 },
    kind: "diagram",
    ...(d ? { d } : {}),
    ...(e.fromCalc ? { fromCalc: e.fromCalc } : {}),
    alt,
    ...(e.caption ? { caption: e.caption } : {}),
    ...(e.interactive ? { interactive: true } : {}),
    ...(e.reveal ? { reveal: typeof e.reveal === "number" ? { order: e.reveal } : e.reveal } : {}),
  };
}
/** A quiz block on a slide (MCQ answered in place; blocks with reveal when 'answered' follow it). */
export function QUIZ(
  id: string,
  quiz: Extract<SlideBlock, { kind: "quiz" }>["quiz"],
  x: number,
  y: number,
  w: number,
  h: number,
): SlideBlock {
  return { id, frame: { x, y, w, h, z: 2 }, kind: "quiz", quiz };
}

// ------------------------------------------------------------------ steps
type StepExtra = Partial<Omit<Step, "id" | "kind" | "title" | "reader">>;
/** A designed slide step. `reader` is its linear text (screen readers, handout, phone portrait). */
export function slideStep(
  id: string,
  title: L10n,
  slide: SlideCanvas,
  reader: ReaderBlock[] = [],
  e: StepExtra & { kind?: StepKind } = {},
): Step {
  const { kind, ...rest } = e;
  return {
    id,
    kind: kind ?? "slide",
    title,
    layout: "canvas",
    reader: reader.length ? reader : [{ t: "heading", text: title }],
    slide,
    ...rest,
  };
}
/** A Reader + Stage step (try, quiz, predict, explain, fly…). */
export function step(
  id: string,
  kind: StepKind,
  title: L10n,
  reader: ReaderBlock[],
  e: StepExtra = {},
): Step {
  return { id, kind, title, reader, ...e };
}

// ------------------------------------------------------------------ courses
export interface CourseMeta {
  id: string;
  title: L10n;
  summary: L10n;
  cockpit: Cockpit;
  theme: ThemeId;
  tags: string[];
  minutes?: number;
  shape?: CourseShape;
  briefingFor?: BriefingFor;
}
/** Assemble a built-in course: stable block ids, minutes from the steps, the sample marker. */
export function course(
  meta: CourseMeta,
  steps: Step[],
  scenes: Record<string, SimScene>,
): Course {
  const c: Course = {
    format: "ifr-course",
    version: 1,
    id: meta.id,
    rev: 1,
    updated: SAMPLE_DATE,
    title: meta.title,
    summary: meta.summary,
    author: { ...SAMPLE_AUTHOR },
    langs: ["en", "fr"],
    cockpit: meta.cockpit,
    world: { kind: "training" },
    minutes:
      meta.minutes ??
      Math.round(steps.reduce((s, x) => s + (x.minutes ?? 1), 0)),
    steps,
    scenes,
    clips: {},
    assets: {},
    sample: meta.id,
    tags: meta.tags,
    theme: meta.theme,
    ...(meta.shape ? { shape: meta.shape } : {}),
    ...(meta.briefingFor ? { briefingFor: meta.briefingFor } : {}),
  };
  stableIds(c);
  return c;
}

/** Ids the canvas helpers generate (`t12`, `m3`…): replaced by `<step>.<prefix><n>` so they never depend on order. */
const AUTO_ID = /^[a-z]\d+$/;
export function stableIds(c: Course): void {
  const each = (steps: Step[]) => {
    for (const s of steps) {
      if (s.slide) {
        let n = 0;
        for (const b of s.slide.blocks)
          if (AUTO_ID.test(b.id)) b.id = `${s.id}.${b.id[0]}${++n}`;
      }
      if (s.flyIt?.briefing) each(s.flyIt.briefing);
    }
  };
  each(c.steps);
}

/** The step ids where the student acts (used by the pacing test and the library's kind-mix bar). */
export function isStudentAction(s: Step): boolean {
  if (
    ["try", "quiz", "predict", "tap", "calc", "drill", "fly"].includes(s.kind)
  )
    return true;
  if (s.quiz) return true;
  return !!s.slide?.blocks.some(
    (b) =>
      b.kind === "quiz" ||
      b.kind === "calc" ||
      (b.kind === "diagram" && b.interactive) ||
      ((b.kind === "instrument" || b.kind === "simViewport") && !!b.yourTurn),
  );
}

/** Goal check helpers (shapes from types.ts GoalCheck / procedures-mode CheckRef). */
export const G = {
  heading: (value: number, tol: number): GoalCheck => ({
    id: "heading",
    p: { value, tol },
  }),
  alt: (min: number, max: number): GoalCheck => ({
    id: "altBand",
    p: { min, max },
  }),
  ias: (min: number, max: number): GoalCheck => ({
    id: "ias",
    p: { min, max },
  }),
  obs: (value: number, tol = 3): GoalCheck => ({
    id: "obs",
    p: { nav: 1, value, tol },
  }),
  toFrom: (value: "TO" | "FROM"): GoalCheck => ({ id: "toFrom", p: { value } }),
  cdi: (maxDots: number): GoalCheck => ({ id: "cdiDefl", p: { maxDots } }),
  acsLat: (): GoalCheck => ({ id: "acsScale", p: { axis: "lat", frac: 0.75 } }),
  passed: (ident: string): GoalCheck => ({ id: "passedFix", p: { ident } }),
  track: (value: number, tol: number): GoalCheck => ({
    id: "track",
    p: { value, tol },
  }),
  vs: (min: number, max: number): GoalCheck => ({
    id: "vsBand",
    p: { min, max },
  }),
};
