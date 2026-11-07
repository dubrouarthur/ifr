// Ground school — course library, author A2's private helpers (radio navigation and IFR procedures). Thin layers
// over the shared archetype kits (samples/kit.ts, navSlides.ts, briefings/kit.ts): a scene with a flight plan, the
// A5 instrument + callout rows for any instrument view (markers given in slide units), the A6 comparison of two
// instruments from one scene, a "Your turn" with live check rows, an A4 hero with up to four points, two
// rule-separated text columns (FAA | EASA), a typographic minima box, the A10 recap and Fly-it steps for any
// target (lesson, scenario, procedure drill). Frames follow SPEC slides v2 §8 on the 12-column grid.
import type {
  ColorToken,
  FlyTarget,
  InstrumentView,
  L10n,
  ReadoutId,
  SceneFields,
  SimScene,
  SlideBlock,
  StageControl,
  Step,
  StepGoal,
} from "../../types";
import type { Failures } from "../../../sim/sim";
import {
  CHECKLIST,
  INST,
  MARK,
  T,
  scene,
  slideStep,
  step,
  type SceneOpts,
} from "../kit";
import {
  G,
  calloutRows,
  foot,
  head,
  pointRows,
  recapBlocks,
  rule,
  slide,
  stepRows,
} from "../navSlides";

const text = (t: L10n) => ({ t: "text" as const, text: t });

/** A scene posed from numbers, with the optional autopilot, flight plan, failures, controls and covers. */
export function sceneA2(
  id: string,
  fields: Omit<SceneFields, "kind">,
  o: SceneOpts & {
    ap?: SimScene["ap"];
    plan?: SimScene["plan"];
    failures?: Partial<Failures>;
    controls?: SimScene["controls"];
    covers?: ("ai" | "dg")[];
  },
): SimScene {
  const sc = scene(id, fields, o);
  if (o.ap) sc.ap = { ...o.ap };
  if (o.plan) sc.plan = { ...o.plan };
  if (o.failures) sc.failures = { ...o.failures };
  if (o.controls) sc.controls = { ...o.controls };
  if (o.covers) sc.covers = [...o.covers];
  return sc;
}

// ------------------------------------------------------------------ A5 for any view: the instrument left, rows right
export interface NotesOpts {
  eyebrow: L10n;
  title: L10n;
  lead: L10n;
  view: InstrumentView;
  alt: L10n;
  scene: string;
  mode?: "frozen" | "live";
  failures?: Partial<Failures>;
  /** the instrument frame (default the A5 hero square 120,120,840,840) */
  frame?: [number, number, number, number];
  /** markers on the instrument, in slide units, one per row (reveal with it) */
  marks: [number, number][];
  rows: { heading: L10n; body: L10n; readout?: ReadoutId }[];
  foot: L10n;
  reader: L10n;
  notes?: L10n;
  kind?: Step["kind"];
}
export function notesStep(id: string, o: NotesOpts): Step {
  const [x, y, w, h] = o.frame ?? [G.left, 120, 840, 840];
  const pitch = o.rows.length > 3 ? 144 : 184;
  return slideStep(
    id,
    o.title,
    slide(
      "instrumentNotes",
      [
        INST(o.view, o.alt, x, y, w, h, {
          id: `${id}.inst`,
          scene: o.scene,
          group: "inst",
          ...(o.mode ? { mode: o.mode } : {}),
          ...(o.failures ? { failures: o.failures } : {}),
        }),
        ...o.marks.map((m, i) =>
          MARK(i + 1, m[0], m[1], { size: 56, reveal: i + 1, group: "inst" }),
        ),
        T("eyebrow", o.eyebrow, 1128, 120, 672, 32),
        T("title", o.title, 1128, 160, 672, 160),
        T("body", o.lead, 1128, 336, 672, 56, { color: "ink2" }),
        ...calloutRows(
          o.rows.map((r) => ({
            ...r,
            ...(r.readout ? { scene: o.scene } : {}),
          })),
          { y: 432, pitch },
        ),
        foot(o.foot, 672, 1128),
      ],
      { scene: o.scene },
    ),
    [text(o.reader)],
    {
      kind: o.kind ?? "explain",
      section: "picture",
      minutes: 2,
      ...(o.notes ? { notes: o.notes } : {}),
    },
  );
}

// ------------------------------------------------------------------ A6 two instruments from one scene, one thing changed
export interface Half {
  eyebrow: L10n;
  color: ColorToken;
  view: InstrumentView;
  alt: L10n;
  scene: string;
  mode?: "frozen" | "live";
  failures?: Partial<Failures>;
  /** frame size inside the half (default a 480 square, centred) */
  size?: [number, number];
  body: L10n;
}
export function twoUpStep(
  id: string,
  o: {
    eyebrow: L10n;
    title: L10n;
    halves: [Half, Half];
    foot: L10n;
    reader: L10n;
    notes?: L10n;
  },
): Step {
  const blocks: SlideBlock[] = [...head(o.eyebrow, o.title)];
  o.halves.forEach((hf, k) => {
    const x = k === 0 ? G.left : 984;
    const [w, h] = hf.size ?? [480, 480];
    const g = { reveal: k + 1, group: `half${k + 1}` };
    const ix = x + Math.round((816 - w) / 16) * 8;
    blocks.push(
      T("eyebrow", hf.eyebrow, x, 312, 816, 32, { color: hf.color, ...g }),
      INST(hf.view, hf.alt, ix, 360, w, h, {
        id: `${id}.inst${k + 1}`,
        scene: hf.scene,
        ...(hf.mode ? { mode: hf.mode } : {}),
        ...(hf.failures ? { failures: hf.failures } : {}),
        reveal: { order: k + 1 },
        group: g.group,
      }),
      rule(x, 360 + h + 24, 816, g),
      T("body", hf.body, x, 360 + h + 48, 816, 984 - (360 + h + 48), {
        color: "ink2",
        ...g,
      }),
    );
  });
  blocks.push(foot(o.foot));
  return slideStep(id, o.title, slide("compare", blocks), [text(o.reader)], {
    kind: "explain",
    section: "picture",
    minutes: 2,
    ...(o.notes ? { notes: o.notes } : {}),
  });
}

// ------------------------------------------------------------------ A6 in text: two rule-separated columns of rows
export interface TextHalf {
  eyebrow: L10n;
  color: ColorToken;
  rows: { heading: L10n; small: L10n }[];
}
export function textCompareStep(
  id: string,
  o: {
    eyebrow: L10n;
    title: L10n;
    halves: [TextHalf, TextHalf];
    foot: L10n;
    reader: L10n;
    notes?: L10n;
    pitch?: number;
  },
): Step {
  const pitch = o.pitch ?? 168;
  const blocks: SlideBlock[] = [...head(o.eyebrow, o.title)];
  o.halves.forEach((hf, k) => {
    const x = k === 0 ? G.left : 984;
    const w = 816;
    const g = { reveal: k + 1, group: `half${k + 1}` };
    blocks.push(
      T("eyebrow", hf.eyebrow, x, 312, w, 32, { color: hf.color, ...g }),
      ...hf.rows.flatMap((r, i): SlideBlock[] => {
        const y = 376 + i * pitch;
        return [
          ...(i > 0 ? [rule(x + 80, y - 16, w - 80, g)] : []),
          MARK(i + 1, x + 28, y + 36, { size: 56, ...g }),
          T("heading", r.heading, x + 80, y, w - 80, 56, g),
          T("small", r.small, x + 80, y + 60, w - 80, pitch - 84, g),
        ];
      }),
    );
  });
  blocks.push(foot(o.foot));
  return slideStep(id, o.title, slide("compare", blocks), [text(o.reader)], {
    kind: "explain",
    section: "picture",
    minutes: 2,
    ...(o.notes ? { notes: o.notes } : {}),
  });
}

// ------------------------------------------------------------------ A4 hero + up to four points
export function heroPointsStep(
  id: string,
  o: {
    eyebrow: L10n;
    title: L10n;
    visual: SlideBlock[];
    points: { heading: L10n; body: L10n; color?: ColorToken }[];
    foot: L10n;
    scene?: string;
    reader: L10n;
    notes?: L10n;
    kind?: Step["kind"];
  },
): Step {
  const four = o.points.length > 3;
  return slideStep(
    id,
    o.title,
    slide(
      "heroDiagram",
      [
        ...head(o.eyebrow, o.title),
        ...o.visual,
        ...pointRows(o.points, four ? { pitch: 160, bodyH: 56, y: 320 } : {}),
        foot(o.foot),
      ],
      o.scene ? { scene: o.scene } : {},
    ),
    [text(o.reader)],
    {
      kind: o.kind ?? "explain",
      section: "picture",
      minutes: 2,
      ...(o.notes ? { notes: o.notes } : {}),
    },
  );
}

// ------------------------------------------------------------------ "Your turn" with live check rows under the steps
export interface TurnOpts {
  eyebrow: L10n;
  title: L10n;
  rows: { heading: L10n; small: L10n }[];
  /** the live check rows (one per goal check, ticked as each is met) */
  checks: { text: L10n; readout?: ReadoutId }[];
  view: InstrumentView;
  alt: L10n;
  scene: string;
  prompt: L10n;
  controls: StageControl[];
  goal: StepGoal;
  hint: L10n;
  foot: L10n;
  reader: L10n;
  frame?: [number, number, number, number];
  assist?: { holdAlt?: boolean; holdIas?: boolean };
  failures?: Partial<Failures>;
  notes?: L10n;
}
export function turnStepA2(id: string, o: TurnOpts): Step {
  const [x, y, w, h] = o.frame ?? [1080, 264, 720, 720];
  const pitch = 136;
  const rowsEnd = 312 + o.rows.length * pitch;
  return slideStep(
    id,
    o.title,
    slide(
      "stepByStep",
      [
        ...head(o.eyebrow, o.title, 912),
        ...stepRows(o.rows, { y: 312, pitch, w: 840 }),
        rule(G.left, rowsEnd + 8, 840),
        CHECKLIST(
          `${id}.checks`,
          o.checks.map((c, i) => ({
            text: c.text,
            check: i,
            ...(c.readout ? { readout: c.readout } : {}),
          })),
          G.left,
          rowsEnd + 32,
          840,
          Math.min(984 - (rowsEnd + 32), 80 * o.checks.length + 24),
          { title: { en: "", fr: "" } },
        ),
        INST(o.view, o.alt, x, y, w, h, {
          id: `${id}.inst`,
          scene: o.scene,
          mode: "live",
          controls: o.controls,
          ...(o.failures ? { failures: o.failures } : {}),
          yourTurn: {
            where: "slide",
            prompt: o.prompt,
            controls: o.controls,
            assist: o.assist ?? {},
            goal: o.goal,
            hint: o.hint,
          },
        }),
        foot(o.foot, 840),
      ],
      { scene: o.scene },
    ),
    [text(o.reader)],
    {
      kind: "try",
      section: "technique",
      minutes: 3,
      ...(o.notes ? { notes: o.notes } : {}),
    },
  );
}

// ------------------------------------------------------------------ a typographic minima box (rule-separated rows)
export interface MinimaRow {
  label: L10n;
  kind: L10n;
  value: L10n;
  color: ColorToken;
  note: L10n;
}
/** Rows of a minima box at (x, y, w): label, DA/MDA tag, value in its colour, one small note; one reveal each. */
export function minimaRows(
  rows: MinimaRow[],
  x: number,
  y: number,
  w: number,
  pitch = 144,
): SlideBlock[] {
  return rows.flatMap((r, i): SlideBlock[] => {
    const yy = y + i * pitch;
    const g = { reveal: i + 1, group: `min${i + 1}` };
    return [
      rule(x, yy, w, g),
      T("heading", r.label, x, yy + 24, 384, 56, { color: r.color, ...g }),
      T("eyebrow", r.kind, x + 408, yy + 36, 144, 32, { color: "muted", ...g }),
      T("number", r.value, x + 576, yy + 16, w - 576, 72, {
        color: r.color,
        align: "right",
        ...g,
      }),
      T("small", r.note, x, yy + 88, w, 40, g),
    ];
  });
}

// ------------------------------------------------------------------ A10 recap
export function recapStepA2(
  id: string,
  o: {
    eyebrow?: L10n;
    title: L10n;
    cols: { n: L10n; text: L10n; color?: ColorToken }[];
    checksTitle?: L10n;
    checks: L10n[];
    foot: L10n;
    reader: L10n;
  },
): Step {
  return slideStep(
    id,
    o.title,
    slide("recap", [
      ...head(o.eyebrow ?? { en: "Key points", fr: "À retenir" }, o.title),
      ...recapBlocks({
        id,
        cols: o.cols,
        checksTitle: o.checksTitle ?? {
          en: "Check yourself",
          fr: "Vérifiez-vous",
        },
        checks: o.checks,
      }),
      foot(o.foot),
    ]),
    [{ t: "keys", items: [o.reader] }],
    { section: "check", minutes: 1 },
  );
}

// ------------------------------------------------------------------ Fly it, for any target
export function flyTargetStep(
  id: string,
  target: FlyTarget,
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
      target,
      brief,
      keys,
      options,
      defaultsOn: options.filter((x) => x === "wind"),
      criteria: [],
      returnTo: "thisStep",
    },
  });
}
