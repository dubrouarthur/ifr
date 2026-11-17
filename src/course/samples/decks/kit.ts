// The short ready-to-teach decks (samples/decks): one builder per kind of slide, so a deck reads like its lesson
// plan. Every slide is the gallery's own design (samples/exampleSlides.ts): one idea, an instrument drawn by the
// simulator's renderers and moving with an animation (canvas/motion.ts), numbered dots that appear when the needle
// gets there, the source in small type. Each step also carries the presenter's note: what to say and which
// button of the console shows it (« Piloter la démonstration », « Rejouer l'animation », « Donner les commandes à
// un élève », « Ouvrir le simulateur »: ui/demoPilot.ts).
import type {
  Annotation,
  GoalCheck,
  InstrumentMotion,
  InstrumentView,
  L10n,
  MotionScript,
  SimScene,
  SlideBlock,
  SlideCanvas,
  StageControl,
  Step,
} from "../../types";
import {
  READY_SITUATIONS,
  sceneOfSituation,
  type Situation,
} from "../../situations";
import { STEAM_GAUGE_LAYOUT, type SteamGaugeKind } from "../../../avionics/steam";
import { DEFAULT_GRID } from "../../canvas/geom";
import { G, INST, L, MARK, SHAPE, T } from "../../canvas/layouts";
import { CHECKLIST, DIAGRAM, QUIZ, SAMPLE_DATE, slideStep } from "../kit";
import {
  coverSlide,
  ideaSlide,
  objectivesSlide,
  recapSlide,
  type CoverOpts,
} from "../exampleSlides";

export { L };
export type { CoverOpts, MotionScript };

// ------------------------------------------------------------------ views and situations
export const SIX: InstrumentView = { kind: "six" };
export const gauge = (g: SteamGaugeKind): InstrumentView => ({
  kind: "gauge",
  gauge: g,
});

/** A situation of the course: a ready situation (course/situations.ts) with a few numbers changed. */
export function sit(
  id: string,
  ready: string,
  label: string,
  over: Partial<Situation> = {},
): SimScene {
  const r = READY_SITUATIONS.find((s) => s.id === ready);
  if (!r) throw new Error(`ready situation ${ready}`);
  const base = JSON.parse(JSON.stringify(r.sit)) as Situation;
  const s = sceneOfSituation({ ...base, ...over }, { id, label });
  // a fixed capture date: a sample must build the same course every time
  return {
    ...s,
    ...(s.captured ? { captured: { ...s.captured, at: SAMPLE_DATE } } : {}),
    cockpit: "steam",
  };
}

// ------------------------------------------------------------------ small pieces
const canvas = (
  blocks: SlideBlock[],
  scene: string,
  layout: SlideCanvas["layout"],
): SlideCanvas => ({
  size: { w: 1920, h: 1080 },
  grid: DEFAULT_GRID,
  layout,
  scene,
  blocks,
});
const foot = (t: L10n): SlideBlock => T("foot", t, G.left, G.foot, 1080, 32);
/** A course of the EASA PPL(A) programme cites the EASA syllabus first, its FAA handbook as « voir aussi » (audit §46). */
export const easaFirst = (src: L10n): L10n => ({
  en: `EASA PPL(A) syllabus · see also ${src.en}`,
  fr: `Programme EASA PPL(A) · voir aussi ${src.fr ?? src.en}`,
});
const text = (t: L10n) => ({ t: "text" as const, text: t });
const both = (parts: L10n[]): L10n => ({
  en: parts.map((p) => p.en).join(" "),
  fr: parts.map((p) => p.fr ?? p.en).join(" "),
});

// ------------------------------------------------------------------ the steps
export interface DeckCover extends CoverOpts {
  /** what the presenter says first */
  notes: L10n;
}
/** The cover: the title, one line, the lesson's instrument playing in a loop. */
export function coverStep(o: DeckCover): Step {
  return slideStep(
    o.id,
    o.title,
    coverSlide(o),
    [text(both([o.sub, o.lead]))],
    {
      section: "overview",
      minutes: 1,
      notes: o.notes,
    },
  );
}

/** Three goals, each with a number, revealed one by one. */
export function goalsStep(o: {
  id: string;
  items: L10n[];
  source: L10n;
  view: InstrumentView;
  alt: L10n;
  scene: string;
  motion: InstrumentMotion;
  notes: L10n;
}): Step {
  return slideStep(
    o.id,
    L("What you will be able to do", "Ce que vous saurez faire"),
    objectivesSlide(o),
    [{ t: "keys", items: o.items }],
    { section: "overview", minutes: 1, notes: o.notes },
  );
}

/** A line of an idea; `dot` puts its number on the dial when the animation reaches `moment`. */
export interface IdeaLine {
  text: L10n;
  dot?: { g: SteamGaugeKind; at?: [number, number]; moment: string };
}
/** One idea: up to three lines on the left, the moving instrument on the right. */
export function ideaStep(o: {
  id: string;
  eyebrow: L10n;
  title: L10n;
  lines: IdeaLine[];
  source: L10n;
  view: InstrumentView;
  alt: L10n;
  scene: string;
  motion: InstrumentMotion;
  notes: L10n;
  minutes?: number;
}): Step {
  const g = ideaSlide({ ...o, group: "ppl", what: o.title });
  return slideStep(
    o.id,
    o.title,
    g.slide,
    [text(both(o.lines.map((l) => l.text)))],
    {
      kind: "explain",
      section: "picture",
      minutes: o.minutes ?? 2,
      notes: o.notes,
    },
  );
}

/** A diagram drawn from numbers on the left, the moving instrument and two short lines on the right. */
export function diagramStep(o: {
  id: string;
  eyebrow: L10n;
  title: L10n;
  diagram: { d: Extract<SlideBlock, { kind: "diagram" }>["d"]; alt: L10n };
  lines: IdeaLine[];
  source: L10n;
  g: SteamGaugeKind;
  alt: L10n;
  scene: string;
  motion: InstrumentMotion;
  notes: L10n;
}): Step {
  const k = STEAM_GAUGE_LAYOUT[o.g];
  const annotations: Annotation[] = [];
  let n = 0;
  const rows = o.lines.slice(0, 2).flatMap((l, i): SlideBlock[] => {
    const y = 744 + i * 120;
    if (!l.dot) return [T("body", l.text, 1176, y, 624, 112)];
    n += 1;
    const at = l.dot.at ?? [-0.78, -0.78];
    annotations.push({
      id: `${o.id}.d${n}`,
      pane: 0,
      type: "callout",
      n,
      at: [Math.round(k.cx + at[0] * k.r), Math.round(k.cy + at[1] * k.r)],
      text: l.text,
      moment: l.dot.moment,
    });
    return [
      MARK(n, 1204, y + 36, { size: 56 }),
      T("body", l.text, 1264, y, 536, 112),
    ];
  });
  return slideStep(
    o.id,
    o.title,
    canvas(
      [
        T("eyebrow", o.eyebrow, G.left, G.eyebrowY, 1680, 32),
        T("title", o.title, G.left, G.titleY, 1680, 168),
        DIAGRAM(`${o.id}.diagram`, o.diagram.d, o.diagram.alt, G.left, 352, 960, 592),
        {
          ...INST(gauge(o.g), o.alt, 1288, 312, 400, 400, {
            id: `${o.id}.inst`,
            scene: o.scene,
            ...(annotations.length ? { annotations } : {}),
          }),
          motion: { ...structuredClone(o.motion), loop: true },
        } as SlideBlock,
        ...rows,
        foot(o.source),
      ],
      o.scene,
      "heroDiagram",
    ),
    [text(both(o.lines.map((l) => l.text)))],
    { kind: "explain", section: "picture", minutes: 2, notes: o.notes },
  );
}

/** A question to the class: three answers as tiles or rows, each with why it is right or wrong. */
export function quizStep(o: {
  id: string;
  title: L10n;
  options: { text: L10n; why: L10n }[];
  answer: number;
  source: L10n;
  view: InstrumentView;
  alt: L10n;
  scene: string;
  motion: InstrumentMotion;
  notes: L10n;
}): Step {
  const g = o.view.kind === "gauge";
  return slideStep(
    o.id,
    o.title,
    canvas(
      [
        T("eyebrow", L("Question", "Question"), G.left, G.eyebrowY, 960, 32),
        T("title", o.title, G.left, G.titleY, 960, 168),
        QUIZ(
          `${o.id}.q`,
          {
            kind: "mcq",
            prompt: L("Choose one answer", "Choisissez une réponse"),
            options: o.options.map((x) => ({ text: x.text, why: x.why })),
            answer: o.answer,
            explain: o.options[o.answer].why,
          },
          G.left,
          392,
          960,
          536,
        ),
        {
          ...INST(o.view, o.alt, 1176, g ? 240 : 320, 624, g ? 624 : 468, {
            id: `${o.id}.inst`,
            scene: o.scene,
          }),
          motion: { ...structuredClone(o.motion), loop: true },
        } as SlideBlock,
        foot(o.source),
      ],
      o.scene,
      "quiz",
    ),
    [text(o.title)],
    { section: "check", minutes: 2, notes: o.notes },
  );
}

/** « À vous »: the goal in the title, the control and its gesture, the rows ticked live, the live instrument. */
export function yourTurnStep(o: {
  id: string;
  title: L10n;
  /** the control the student uses, by its name on the slide, and what it does */
  control: L10n;
  rows: {
    text: L10n;
    check: number;
    readout?:
      | "hdg"
      | "alt"
      | "ias"
      | "vs"
      | "obs1"
      | "toFrom"
      | "cdiDots"
      | "gsDots";
  }[];
  tip: L10n;
  source: L10n;
  view: InstrumentView;
  alt: L10n;
  scene: string;
  controls: StageControl[];
  assist?: { holdAlt?: boolean; holdIas?: boolean };
  prompt: L10n;
  goal: GoalCheck[];
  holdS?: number;
  success: L10n;
  hint: L10n;
  notes: L10n;
}): Step {
  const six = o.view.kind !== "gauge";
  const [ix, iy, iw, ih] = six ? [960, 136, 840, 792] : [1080, 120, 720, 800];
  const rowsH = 80 * o.rows.length + 72;
  return slideStep(
    o.id,
    o.title,
    canvas(
      [
        T("eyebrow", L("Your turn", "À vous"), G.left, G.eyebrowY, 768, 32),
        T("title", o.title, G.left, G.titleY, 768, 168),
        T(
          "eyebrow",
          L("Your control", "Votre commande"),
          G.left,
          336,
          768,
          32,
          {
            color: "muted",
          },
        ),
        T("body", o.control, G.left, 376, 768, 96),
        SHAPE("line", G.left, 488, 768, 16, { stroke: "line", strokeW: 2 }),
        CHECKLIST(
          `${o.id}.checks`,
          o.rows.map((r) => ({
            text: r.text,
            check: r.check,
            ...(r.readout ? { readout: r.readout } : {}),
          })),
          G.left,
          520,
          768,
          rowsH,
          { title: L("Goal", "Objectif") },
        ),
        T("small", o.tip, G.left, 544 + rowsH, 768, 120),
        INST(o.view, o.alt, ix, iy, iw, ih, {
          id: `${o.id}.inst`,
          scene: o.scene,
          mode: "live",
          controls: o.controls,
          yourTurn: {
            where: "slide",
            prompt: o.prompt,
            controls: o.controls,
            assist: o.assist ?? { holdAlt: true, holdIas: true },
            goal: {
              all: o.goal,
              ...(o.holdS ? { holdS: o.holdS } : {}),
              graded: false,
              success: o.success,
            },
            hint: o.hint,
          },
        }),
        foot(o.source),
      ],
      o.scene,
      "yourTurn",
    ),
    [text(both([o.prompt, o.control, o.tip]))],
    { kind: "try", section: "technique", minutes: 3, notes: o.notes },
  );
}

/** A flight in the full simulator: the brief, what ends it, the cockpit picture; the result comes back here. */
export function simFlightStep(o: {
  id: string;
  title: L10n;
  brief: L10n;
  scene: string;
  alt: L10n;
  prompt: L10n;
  goal: GoalCheck[];
  holdS?: number;
  durationS: number;
  /** the flight also ends when these hold (durationS is then the most it lasts) */
  endWhen?: GoalCheck[];
  success: L10n;
  source: L10n;
  notes: L10n;
}): Step {
  return slideStep(
    o.id,
    o.title,
    canvas(
      [
        T("eyebrow", L("Your turn", "À vous"), G.left, G.eyebrowY, 1392, 32),
        T("title", o.title, G.left, G.titleY, 1392, 168),
        T("body", o.brief, G.left, 352, 600, 296),
        T(
          "small",
          L(
            "Press « Fly it in the simulator ». The course waits here and the result shows on this slide.",
            "Appuyez sur « Voler dans le simulateur ». Le cours attend ici, le résultat s’affiche sur cette diapo.",
          ),
          G.left,
          688,
          600,
          136,
        ),
        {
          id: `${o.id}.sim`,
          frame: { x: 816, y: 352, w: 984, h: 560, z: 1 },
          kind: "simViewport",
          scene: o.scene,
          view: "cockpit",
          alt: o.alt,
          yourTurn: {
            where: "sim",
            prompt: o.prompt,
            goal: {
              all: o.goal,
              ...(o.holdS ? { holdS: o.holdS } : {}),
              graded: false,
              success: o.success,
            },
            durationS: o.durationS,
            ...(o.endWhen?.length ? { endWhen: o.endWhen } : {}),
            returnTo: "thisStep",
          },
        },
        foot(o.source),
      ],
      o.scene,
      "yourTurn",
    ),
    [text(both([o.brief, o.prompt]))],
    { kind: "try", section: "check", minutes: 5, notes: o.notes },
  );
}

/** Takeaways: three numbers and what each means. */
export function recapStep(o: {
  id: string;
  title: L10n;
  cols: [L10n, L10n][];
  source: L10n;
  scene: string;
  notes: L10n;
}): Step {
  const s = recapSlide(o);
  return slideStep(
    o.id,
    o.title,
    { ...s, scene: o.scene },
    [{ t: "keys", items: o.cols.map(([n, t]) => both([n, t])) }],
    { section: "check", minutes: 1, notes: o.notes },
  );
}
