// Ground school — the sample courses' building kit (package I). Small, typed builders so the four built-in
// courses read like the lesson plan they are: designed slides composed with the canvas helpers (layouts.ts),
// Reader + Stage steps (try / quiz / calc / drill / fly), scenes posed from numbers, and a finishing pass that
// gives every block a stable id (the canvas helpers number blocks with a module counter: ids would otherwise
// depend on how many slides were built before).
//
// Content rules (SPEC §1, VISION): restrained aviation design (theme tokens only, no decoration), FR / EN for
// every author text, every rule taught cites its source, hold entries come from holdEntry() (nav/holding.ts).
import { BRAND } from "../../brand";
import type {
  Cockpit,
  Course,
  CourseShape,
  BriefingFor,
  GoalCheck,
  InstrumentMotion,
  L10n,
  MotionScript,
  ReaderBlock,
  SceneFields,
  SimScene,
  SlideBlock,
  SlideCanvas,
  StageControl,
  Step,
  StepKind,
  ThemeId,
} from "../types";
import type { Weather } from "../../sim/environment";
import { sceneFromFields } from "../scene";
import { DEFAULT_GRID } from "../canvas/geom";
import { L } from "../canvas/layouts";

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
export const SAMPLE_AUTHOR: { name: string; club?: string } = { name: BRAND.name };

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
        // the wind the slide states is the wind the student flies, at the scene's altitude too (the sim's default
        // profile veers and strengthens it with height: 240/20 on the slide read 266/31 at 3,200 ft, audit §16)
        ...(o.wind && !o.weather?.aloft
          ? { aloft: [{ altFt: Math.max(1000, fields.altFt ?? 0), dir: o.wind[0], kt: o.wind[1] }] }
          : {}),
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

// ------------------------------------------------------------------ the animations the sample slides play
/**
 * The aircraft flies on as it is posed (heading, altitude and speed held) for `duration` seconds: a slide whose
 * picture is a moment (the flag flips abeam the fix, the bar leaves in the wind) plays it, the presenter replays it
 * (« Rejouer l’animation ») or takes the aircraft (« Piloter la démonstration »). `telling` is the moment itself
 * (thumbnails, reduced motion). The simulator's own flight model and renderers draw it (canvas/motion.ts).
 */
export function flyOn(
  duration: number,
  telling: number,
  iasKt: number,
  /** at `atS` s, a standard-rate turn (3°/s, FAA IFH ch. 4) of `deg` degrees (+ right, − left): the entry turn at the fix */
  turn?: { atS: number; deg: number },
): InstrumentMotion {
  const hdg: [number, number][] = turn
    ? [
        [0, 0],
        [turn.atS, 0],
        [turn.atS + Math.abs(turn.deg) / 3, turn.deg],
      ]
    : [[0, 0]];
  const end = turn ? Math.max(duration, turn.atS + Math.abs(turn.deg) / 3 + 8) : duration;
  return {
    script: {
      duration: end,
      telling,
      tracks: { hdg, vs: [[0, 0]], ias: [[0, iasKt]] },
    },
    loop: true,
  };
}
/** An instrument block that plays an animation (a preset by name, or a script); any other block is unchanged. */
export function moving(b: SlideBlock, m: InstrumentMotion | string): SlideBlock {
  if (b.kind !== "instrument") return b;
  const motion: InstrumentMotion = typeof m === "string" ? { preset: m, loop: true } : (JSON.parse(JSON.stringify(m)) as InstrumentMotion);
  return { ...b, motion };
}
/** What liven() changes on an instrument block. */
export interface Liven {
  motion?: InstrumentMotion | string;
  controls?: StageControl[];
  /** frozen: the picture is read as it is (marks on the needles) */
  still?: boolean;
  /** the accessible description, when the picture now moves */
  alt?: L10n;
}
/**
 * Bring a slide's instrument to life after the step is built: an animation to play (a preset by name or a script)
 * and/or the controls the student turns on the slide (canvas/controlStrip.ts). Throws when the block is not there
 * (a renamed block fails the build, not the class).
 */
export function liven(
  s: Step,
  blockId: string,
  o: Liven,
): Step {
  const slide = s.slide;
  const at = slide?.blocks.findIndex((b) => b.id === blockId) ?? -1;
  if (!slide || at < 0) throw new Error(`${s.id}: no block ${blockId}`);
  let b = slide.blocks[at];
  if (b.kind !== "instrument") throw new Error(`${s.id}: ${blockId} is not an instrument`);
  if (o.motion) b = moving(b, o.motion);
  if (o.controls && b.kind === "instrument") b = { ...b, mode: "live", controls: [...o.controls] };
  // a reading lesson (marks on the needles): an honest still picture the presenter can still fly
  if (o.still && b.kind === "instrument") b = { ...b, mode: "frozen" };
  if (o.alt) b = { ...b, alt: { ...o.alt } };
  const blocks = slide.blocks.slice();
  blocks[at] = b;
  return { ...s, slide: { ...slide, blocks } };
}
/** liven() for several blocks of a course, by block id (each id must be on one of the steps). */
export function livenAll(
  steps: Step[],
  table: Record<string, Liven>,
): Step[] {
  const left = new Set(Object.keys(table));
  const out = steps.map((s) => {
    let r = s;
    for (const b of s.slide?.blocks ?? [])
      if (table[b.id]) {
        r = liven(r, b.id, table[b.id]);
        left.delete(b.id);
      }
    return r;
  });
  if (left.size) throw new Error(`livenAll: no block ${[...left].join(", ")}`);
  return out;
}
/** A 30° intercept of a VOR course (FAA IFH ch. 9), flown from the scene of the VOR course's cover: 6 NM from ARD,
 *  where full scale (10°) is 6 · tan 10° ≈ 1.06 NM off. At 100 kt with a 30° cut the aircraft closes at 50 kt: the bar
 *  comes off the stop at 8 s and reaches a quarter of a dot (0.125 of full scale, about 0.13 NM) some 67 s later. The
 *  standard-rate turn starts there, as the course teaches (a 30° turn at standard rate needs less than 0.1 NM:
 *  10 s at 3°/s), and rolls out centred. The heading is measured from the course set on the OBS. */
export const VOR_CAPTURE: MotionScript = {
  duration: 100,
  hdgRef: "course",
  tracks: {
    cdi: [
      [0, 1],
      [8, 1],
      [75, 0.125],
      [85, 0.05],
      [92, 0],
      [100, 0],
    ],
    hdg: [
      [0, 30],
      [75, 30],
      [85, 3],
      [92, 0],
      [100, 0],
    ],
    alt: [[0, 0]],
    vs: [[0, 0]],
    ias: [[0, 100]],
  },
  telling: 60,
  marks: [
    {
      id: "move",
      channel: "cdi",
      value: 0.125,
      label: L("A quarter of a dot: start the turn", "Un quart de point : on commence le virage"),
    },
    {
      id: "on",
      channel: "cdi",
      value: 0.05,
      label: L("Centred: on the course", "Centrée : sur la route"),
    },
  ],
};

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
