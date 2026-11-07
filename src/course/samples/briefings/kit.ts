// Ground school — the crafted lesson briefings' building kit: one builder per slide archetype (SPEC slides v2 §8),
// so every briefing reads like the lesson plan it is: cover (A1), why it matters (A3), the picture (A4 hero
// diagram, A5 instrument with callouts), the numbers (A8 formula), the common mistakes, a question on the slide
// (A9), "Your turn" on a live instrument, then "Ready to fly" (A11) and Fly it. Cockpit theme always (§11): the
// deck is what the cockpit plays before the lesson (course/ui/briefingDeck.ts reads `briefingFor.exerciseId`).
//
// Frames are the archetype frames on the 12-column grid; text never sits on a card; the marker is the only
// numbering device; one idea per reveal; sources go on the footer line, never in the eyebrow.
import type {
  Briefing,
  ColorToken,
  InstrumentView,
  L10n,
  Quiz,
  ReaderBlock,
  SimScene,
  SlideBlock,
  Step,
  StepGoal,
  StageControl,
} from "../../types";
import {
  DIAGRAM,
  INST,
  L,
  MARK,
  QUIZ,
  T,
  course,
  onInstrument,
  slideStep,
  step,
} from "../kit";
import {
  G,
  bigNumberBlocks,
  calloutRows,
  coverBlocks,
  foot,
  head,
  lead,
  pointRows,
  readyBlocks,
  rule,
  slide,
  stepRows,
} from "../navSlides";
import {
  STEAM_GAUGE_LAYOUT,
  type SteamGaugeKind,
} from "../../../avionics/steam";

export { DIAGRAM, G, INST, L, MARK, QUIZ, T, foot, head, lead, rule, slide };

// ------------------------------------------------------------------ small helpers
export const wrap360 = (d: number): number => ((d % 360) + 360) % 360;
/** A heading as three digits (000 shown as 360). */
export const pad3 = (n: number): string =>
  String(Math.round(wrap360(Math.round(n))) || 360).padStart(3, "0");
/** French decimal comma. */
export const dec = (n: number, digits = 1): L10n => {
  const s = n.toFixed(digits);
  return { en: s, fr: s.replace(".", ",") };
};
/** The same text in both languages (numbers, idents). */
export const S = (s: string): L10n => ({ en: s, fr: s });
const text = (t: L10n): ReaderBlock => ({ t: "text", text: t });

export const GAUGE = (gauge: SteamGaugeKind): InstrumentView => ({
  kind: "gauge",
  gauge,
});
/** A point of a steam gauge drawn at (x, y, s, s), from the gauge centre in radii (dx right, dy down). */
export function gaugePoint(
  gauge: SteamGaugeKind,
  x: number,
  y: number,
  s: number,
  dx: number,
  dy: number,
): [number, number] {
  const g = STEAM_GAUGE_LAYOUT[gauge];
  return onInstrument(GAUGE(gauge), x, y, s, s, [
    g.cx + dx * g.r,
    g.cy + dy * g.r,
  ]);
}

// ------------------------------------------------------------------ A1 cover
export interface CoverOpts {
  eyebrow: L10n;
  main: L10n;
  sub: L10n;
  lead: L10n;
  meta: L10n;
  /** the hero, in 984,96,816,888 */
  hero: SlideBlock[];
  scene?: string;
  reader: L10n;
}
export function coverStep(id: string, title: L10n, o: CoverOpts): Step {
  return slideStep(
    id,
    title,
    slide("cover", coverBlocks(o), o.scene ? { scene: o.scene } : {}),
    [text(o.reader)],
    { section: "overview", minutes: 1 },
  );
}
/** The cover hero: a gauge, 720 square, centred in the hero column. */
export function heroGauge(
  id: string,
  gauge: SteamGaugeKind,
  alt: L10n,
  sceneId: string,
  e: { mode?: "frozen" | "live" } = {},
): SlideBlock {
  return INST(GAUGE(gauge), alt, 1032, 180, 720, 720, {
    id,
    scene: sceneId,
    ...(e.mode ? { mode: e.mode } : {}),
  });
}

// ------------------------------------------------------------------ A3 why it matters (big number + a side list)
export interface WhyOpts {
  eyebrow: L10n;
  title: L10n;
  n: L10n;
  nW: number;
  unit?: L10n;
  color?: ColorToken;
  statement: L10n;
  body: L10n;
  /** the side list (≤ 3 rows): a number and its line */
  sideTitle?: L10n;
  side?: { n: L10n; text: L10n; color?: ColorToken }[];
  /** or a visual in 1272,312,528,672 */
  visual?: SlideBlock[];
  foot: L10n;
  reader: L10n;
}
export function whyStep(id: string, o: WhyOpts): Step {
  return slideStep(
    id,
    o.title,
    slide("bigNumber", [
      ...head(o.eyebrow, o.title),
      ...bigNumberBlocks(o),
      ...(o.visual ?? []),
      ...(o.sideTitle ? [T("eyebrow", o.sideTitle, 1272, 312, 528, 32, { color: "muted" })] : []),
      ...(o.side ?? []).flatMap((s, i): SlideBlock[] => {
        const y = 376 + i * 200;
        const g = { reveal: i + 1, group: `side${i}` };
        return [
          rule(1272, y, 528, g),
          T("number", s.n, 1272, y + 24, 528, 96, { color: s.color ?? "text", ...g }),
          T("small", s.text, 1272, y + 124, 528, 56, g),
        ];
      }),
      foot(o.foot),
    ]),
    [text(o.reader)],
    { section: "why", minutes: 1 },
  );
}

// ------------------------------------------------------------------ A4 hero diagram + three points
export interface HeroOpts {
  eyebrow: L10n;
  title: L10n;
  /** the visual, in 120,288,960,696 */
  visual: SlideBlock[];
  points: { heading: L10n; body: L10n; color?: ColorToken }[];
  foot: L10n;
  scene?: string;
  reader: L10n;
  kind?: Step["kind"];
}
export function heroStep(id: string, o: HeroOpts): Step {
  return slideStep(
    id,
    o.title,
    slide(
      "heroDiagram",
      [
        ...head(o.eyebrow, o.title),
        ...o.visual,
        ...pointRows(o.points),
        foot(o.foot),
      ],
      o.scene ? { scene: o.scene } : {},
    ),
    [text(o.reader)],
    { kind: o.kind ?? "explain", section: "picture", minutes: 2 },
  );
}

// ------------------------------------------------------------------ A5 instrument + callout rows
export interface InstrumentOpts {
  eyebrow: L10n;
  title: L10n;
  lead: L10n;
  gauge: SteamGaugeKind;
  alt: L10n;
  scene: string;
  mode?: "frozen" | "live";
  /** marker positions on the gauge, in radii from its centre (≤ 3) */
  marks: [number, number][];
  rows: {
    heading: L10n;
    body: L10n;
    readout?: import("../../types").ReadoutId;
  }[];
  foot: L10n;
  reader: L10n;
}
export function instrumentStep(id: string, o: InstrumentOpts): Step {
  const [x, y, s] = [G.left, 120, 840];
  return slideStep(
    id,
    o.title,
    slide(
      "instrumentNotes",
      [
        INST(GAUGE(o.gauge), o.alt, x, y, s, s, {
          id: `${id}.inst`,
          scene: o.scene,
          group: "inst",
          ...(o.mode ? { mode: o.mode } : {}),
        }),
        ...o.marks.map((m, i) => {
          const p = gaugePoint(o.gauge, x, y, s, m[0], m[1]);
          return MARK(i + 1, p[0], p[1], {
            size: 56,
            reveal: i + 1,
            group: "inst",
          });
        }),
        T("eyebrow", o.eyebrow, 1128, 120, 672, 32),
        T("title", o.title, 1128, 160, 672, 160),
        T("body", o.lead, 1128, 336, 672, 56, { color: "ink2" }),
        ...calloutRows(
          o.rows.map((r) => ({
            ...r,
            ...(r.readout ? { scene: o.scene } : {}),
          })),
          { y: 432, pitch: 184 },
        ),
        foot(o.foot, 672, 1128),
      ],
      { scene: o.scene },
    ),
    [text(o.reader)],
    { kind: "explain", section: "picture", minutes: 2 },
  );
}

// ------------------------------------------------------------------ A8 the numbers (formula + derivation)
export interface FormulaOpts {
  eyebrow: L10n;
  title: L10n;
  lead?: L10n;
  /** the visual on the left, in 120,368,960,592 (a diagram, an instrument); none = the centred variant */
  visual?: SlideBlock[];
  formula: L10n;
  units: L10n;
  /** derivation rows "label | = expr = !result!", one per reveal (≤ 4) */
  lines: L10n[];
  /** one line of body under the derivation (the rule of thumb) */
  after?: L10n;
  foot: L10n;
  scene?: string;
  reader: ReaderBlock[];
}
export function formulaStep(id: string, o: FormulaOpts): Step {
  const blocks: SlideBlock[] = [
    ...head(o.eyebrow, o.title),
    ...(o.lead ? [lead(o.lead)] : []),
  ];
  if (o.visual) {
    const x = 1176;
    const w = 624;
    // three derivation rows and a rule of thumb: the formula block is tighter, so the rule of thumb keeps two
    // full lines of body under the rows (never a squeezed frame)
    const tight = !!o.after && o.lines.length >= 3;
    const top = tight ? 608 : 664;
    const afterH = o.after ? 104 : 0;
    const pitch = Math.min(96, Math.floor((984 - afterH - top) / o.lines.length));
    blocks.push(
      ...o.visual,
      T("eyebrow", L("The formula", "La formule"), x, 360, w, 32, {
        color: "muted",
      }),
      T("formula", o.formula, x, 408, w, tight ? 104 : 136),
      T("small", o.units, x, tight ? 520 : 560, w, 40),
      rule(x, top - 32, w),
      ...o.lines.map((l, i) =>
        T("formula", l, x, top + i * pitch, w, pitch - 8, { reveal: i + 1 }),
      ),
    );
    if (o.after) {
      const y = top + o.lines.length * pitch + 8;
      blocks.push(
        T("body", o.after, x, y, w, 984 - y, {
          reveal: o.lines.length + 1,
          color: "ink2",
        }),
      );
    }
  } else {
    // the no-diagram variant: the formula large on the left, the derivation below it, one line per reveal
    blocks.push(
      T("formula", o.formula, G.left, 336, 1680, 168),
      T("small", o.units, G.left, 520, 1680, 40),
      rule(G.left, 600, 1680),
      ...o.lines.map((l, i) => T("formula", l, G.left, 632 + i * 96, 1104, 88, { reveal: i + 1 })),
    );
    if (o.after)
      blocks.push(
        T("body", o.after, 1272, 632, 528, 280, {
          reveal: o.lines.length + 1,
          color: "ink2",
        }),
      );
  }
  blocks.push(foot(o.foot));
  return slideStep(
    id,
    o.title,
    slide("formula", blocks, o.scene ? { scene: o.scene } : {}),
    o.reader,
    {
      kind: "explain",
      section: "numbers",
      minutes: 2,
    },
  );
}

// ------------------------------------------------------------------ the common mistakes (three columns)
export interface MistakesOpts {
  eyebrow?: L10n;
  title: L10n;
  rows: { error: L10n; why: L10n; fix: L10n }[];
  foot: L10n;
  reader: L10n;
}
export function mistakesStep(id: string, o: MistakesOpts): Step {
  return slideStep(
    id,
    o.title,
    slide("compare", [
      ...head(o.eyebrow ?? L("Common mistakes", "Erreurs fréquentes"), o.title),
      ...o.rows.flatMap((r, i): SlideBlock[] => {
        const x = G.x(i * 4);
        const g = `err${i + 1}`;
        const rv = { reveal: i + 1, group: g };
        return [
          T("foot", S(String(i + 1).padStart(2, "0")), x, 336, 528, 32, {
            color: "stop",
            ...rv,
          }),
          T("heading", r.error, x, 376, 528, 112, { ...rv }),
          T("body", r.why, x, 504, 528, 200, { color: "ink2", ...rv }),
          rule(x, 736, 528, rv),
          T("eyebrow", L("The fix", "La correction"), x, 760, 528, 32, {
            color: "nav",
            ...rv,
          }),
          T("body", r.fix, x, 808, 528, 160, { ...rv }),
        ];
      }),
      foot(o.foot),
    ]),
    [text(o.reader)],
    { kind: "explain", section: "mistakes", minutes: 1 },
  );
}

// ------------------------------------------------------------------ A9 a question on the slide
export interface QuizOpts {
  eyebrow: L10n;
  title: L10n;
  /** a quote (clearance, a situation) over the question; or a visual on the left */
  quote?: L10n;
  visual?: SlideBlock[];
  quiz: Quiz;
  foot: L10n;
  scene?: string;
  reader: L10n;
}
export function quizStep(id: string, o: QuizOpts): Step {
  const blocks: SlideBlock[] = [...head(o.eyebrow, o.title)];
  if (o.visual) {
    blocks.push(...o.visual, QUIZ(`${id}.q`, o.quiz, 984, 312, 816, 672));
  } else {
    if (o.quote) blocks.push(T("quote", o.quote, G.left, 312, 1560, 144));
    blocks.push(
      QUIZ(
        `${id}.q`,
        o.quiz,
        G.left,
        o.quote ? 504 : 336,
        1680,
        o.quote ? 480 : 648,
      ),
    );
  }
  blocks.push(foot(o.foot, o.visual ? 768 : 1200));
  return slideStep(
    id,
    o.title,
    slide("quiz", blocks, o.scene ? { scene: o.scene } : {}),
    [text(o.reader)],
    {
      kind: "quiz",
      section: "check",
      minutes: 1,
    },
  );
}
/** An MCQ (the first option is not necessarily the answer: `answer` says which). */
export function mcq(
  prompt: L10n,
  options: { text: L10n; why?: L10n }[],
  answer: number,
  explain: L10n,
): Quiz {
  return {
    kind: "mcq",
    prompt,
    options: options.map((op) => ({
      text: op.text,
      ...(op.why ? { why: op.why } : {}),
    })),
    answer,
    explain,
  };
}

// ------------------------------------------------------------------ A7 steps + "Your turn" on a live instrument
export interface YourTurnOpts {
  eyebrow: L10n;
  title: L10n;
  rows: { heading: L10n; small: L10n }[];
  view: InstrumentView;
  alt: L10n;
  scene: string;
  prompt: L10n;
  controls: StageControl[];
  goal: StepGoal;
  hint: L10n;
  foot: L10n;
  reader: L10n;
  /** instrument frame (default: a 720 square at 1080,264) */
  frame?: [number, number, number, number];
  /** the autopilot-like helpers while the student flies (default: hold altitude and speed) */
  assist?: { holdAlt?: boolean; holdIas?: boolean };
  covers?: ("ai" | "dg")[];
}
export function yourTurnStep(id: string, o: YourTurnOpts): Step {
  const [x, y, w, h] = o.frame ?? [1080, 264, 720, 720];
  const pitch = o.rows.length > 4 ? 132 : 152;
  return slideStep(
    id,
    o.title,
    slide(
      "stepByStep",
      [
        ...head(o.eyebrow, o.title, 960),
        ...stepRows(o.rows, { y: 312, pitch, w: 840 }),
        INST(o.view, o.alt, x, y, w, h, {
          id: `${id}.inst`,
          scene: o.scene,
          mode: "live",
          controls: o.controls,
          ...(o.covers ? { covers: o.covers } : {}),
          yourTurn: {
            where: "slide",
            prompt: o.prompt,
            controls: o.controls,
            assist: o.assist ?? { holdAlt: true, holdIas: true },
            goal: o.goal,
            hint: o.hint,
          },
        }),
        foot(o.foot, 840),
      ],
      { scene: o.scene },
    ),
    [text(o.reader)],
    { kind: "try", section: "technique", minutes: 2 },
  );
}
/** A7 steps without an instrument: the rows on the left, an optional visual on the right (1080,264,720,720). */
export function stepsStep(
  id: string,
  o: {
    eyebrow: L10n;
    title: L10n;
    rows: { heading: L10n; small: L10n }[];
    visual?: SlideBlock[];
    foot: L10n;
    scene?: string;
    reader: L10n;
  },
): Step {
  const pitch = o.rows.length > 4 ? 132 : 152;
  return slideStep(
    id,
    o.title,
    slide(
      "stepByStep",
      [
        ...head(o.eyebrow, o.title, o.visual ? 960 : 1392),
        ...stepRows(o.rows, {
          y: 312,
          pitch,
          w: o.visual ? 840 : 1392,
          reveal: true,
        }),
        ...(o.visual ?? []),
        foot(o.foot, o.visual ? 840 : 1200),
      ],
      o.scene ? { scene: o.scene } : {},
    ),
    [text(o.reader)],
    { kind: "explain", section: "technique", minutes: 2 },
  );
}

// ------------------------------------------------------------------ A6 two cases side by side (an instrument each)
export interface CompareHalf {
  eyebrow: L10n;
  color: ColorToken;
  view: InstrumentView;
  alt: L10n;
  scene: string;
  covers?: ("ai" | "dg")[];
  /** ≤ 3 ordered rows beside the instrument */
  rows: { heading: L10n; small: L10n }[];
  body: L10n;
}
export function compareStep(
  id: string,
  o: {
    eyebrow: L10n;
    title: L10n;
    halves: [CompareHalf, CompareHalf];
    foot: L10n;
    reader: L10n;
  },
): Step {
  const blocks: SlideBlock[] = [...head(o.eyebrow, o.title)];
  o.halves.forEach((h, k) => {
    const x = k === 0 ? G.left : 984;
    const g = { reveal: k + 1, group: `half${k + 1}` };
    blocks.push(
      T("eyebrow", h.eyebrow, x, 312, 816, 32, { color: h.color, ...g }),
      INST(h.view, h.alt, x, 368, 384, 384, {
        id: `${id}.inst${k + 1}`,
        scene: h.scene,
        ...(h.covers ? { covers: h.covers } : {}),
        reveal: { order: k + 1 },
        group: g.group,
      }),
      ...h.rows.flatMap((r, i): SlideBlock[] => {
        const y = 368 + i * 128;
        return [
          MARK(i + 1, x + 432 + 28, y + 28, { size: 56, ...g }),
          T("heading", r.heading, x + 504, y, 312, 56, g),
          T("small", r.small, x + 504, y + 56, 312, 64, g),
        ];
      }),
      rule(x, 784, 816, g),
      T("body", h.body, x, 808, 816, 104, { color: "ink2", ...g }),
    );
  });
  blocks.push(foot(o.foot));
  return slideStep(id, o.title, slide("compare", blocks), [text(o.reader)], {
    kind: "explain",
    section: "picture",
    minutes: 2,
  });
}

// ------------------------------------------------------------------ A11 ready to fly + Fly it
export interface ReadyOpts {
  objectives: L10n[];
  standards: { n: L10n; text: L10n; color?: ColorToken }[];
  tip: L10n;
  reader: L10n;
}
export function readyStep(id: string, o: ReadyOpts): Step {
  return slideStep(
    id,
    L("Ready to fly", "Prêt à voler"),
    slide("ready", readyBlocks(o)),
    [{ t: "keys", items: [o.reader] }],
    { section: "check", minutes: 1 },
  );
}
export function flyStep(
  id: string,
  exerciseId: string,
  title: L10n,
  brief: L10n,
  keys: L10n[],
  minutes: number,
  options: ("wind" | "turbulence")[] = [],
): Step {
  return step(id, "fly", title, [], {
    section: "check",
    minutes,
    flyIt: {
      target: { kind: "lesson", exerciseId },
      brief,
      keys,
      options,
      defaultsOn: options.filter((x) => x === "wind"),
      criteria: [],
      returnTo: "thisStep",
    },
  });
}

// ------------------------------------------------------------------ the briefing itself
export interface BriefingMeta {
  id: string;
  exerciseId: string;
  title: L10n;
  summary: L10n;
  tags: string[];
  minutes: number;
  cockpit?: "steam" | "g1000";
}
/** A crafted lesson briefing: a Course with shape 'briefing', cockpit theme, for `exerciseId`. */
export function briefing(
  meta: BriefingMeta,
  steps: Step[],
  scenes: Record<string, SimScene>,
): Briefing {
  const c = course(
    {
      id: meta.id,
      title: meta.title,
      summary: meta.summary,
      cockpit: meta.cockpit ?? "steam",
      theme: "classroom",
      tags: [...meta.tags, "briefing"],
      minutes: meta.minutes,
      shape: "briefing",
      briefingFor: { exerciseId: meta.exerciseId },
    },
    steps,
    scenes,
  );
  return c as Briefing;
}
