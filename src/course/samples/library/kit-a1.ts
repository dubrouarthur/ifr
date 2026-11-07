// Ground school — course library, author A1's private helpers (flight instruments and the pilot's senses). Thin
// layers over the shared archetype kits (samples/kit.ts, navSlides.ts, briefings/kit.ts): a six-pack on a slide
// with markers on its gauges, an A5 variant for a whole panel, a recap step (A10), a two-panel comparison and a
// "Your turn" with live check rows. Frames follow SPEC slides v2 §8 on the 12-column grid and the 8 px baseline.
import type {
  ColorToken,
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
  type SceneOpts,
} from "../kit";
import {
  G,
  calloutRows,
  foot,
  head,
  recapBlocks,
  rule,
  slide,
  stepRows,
} from "../navSlides";
import { onInstrument } from "../../canvas/layouts";
import {
  STEAM_GAUGE_LAYOUT,
  type SteamGaugeKind,
} from "../../../avionics/steam";

export const SIX: InstrumentView = { kind: "six" };
const text = (t: L10n) => ({ t: "text" as const, text: t });

/** A scene posed from numbers, with the optional autopilot, failures, controls and covers. */
export function sceneA1(
  id: string,
  fields: Omit<SceneFields, "kind">,
  o: SceneOpts & {
    ap?: SimScene["ap"];
    failures?: Partial<Failures>;
    controls?: SimScene["controls"];
    covers?: ("ai" | "dg")[];
  },
): SimScene {
  const sc = scene(id, fields, o);
  if (o.ap) sc.ap = { ...o.ap };
  if (o.failures) sc.failures = { ...o.failures };
  if (o.controls) sc.controls = { ...o.controls };
  if (o.covers) sc.covers = [...o.covers];
  return sc;
}

/** A point of a six-pack drawn in (x, y, w, h): gauge centre + (dx, dy) in gauge radii. */
export function sixPoint(
  gauge: Exclude<SteamGaugeKind, "cdi" | "rmi">,
  x: number,
  y: number,
  w: number,
  h: number,
  dx: number,
  dy: number,
): [number, number] {
  const g = STEAM_GAUGE_LAYOUT[gauge];
  return onInstrument(SIX, x, y, w, h, [g.cx + dx * g.r, g.cy + dy * g.r]);
}
/** A 56 marker in the clear corner of a six-pack gauge (outside the dial, inside its bezel square). */
export function sixMark(
  n: number,
  gauge: Exclude<SteamGaugeKind, "cdi" | "rmi">,
  f: [number, number, number, number],
  e: {
    reveal?: number;
    group?: string;
    corner?: "tl" | "tr" | "bl" | "br";
  } = {},
): SlideBlock {
  const c = e.corner ?? "tl";
  const dx = c === "tl" || c === "bl" ? -0.86 : 0.86;
  const dy = c === "tl" || c === "tr" ? -0.86 : 0.86;
  const p = sixPoint(gauge, f[0], f[1], f[2], f[3], dx, dy);
  return MARK(n, p[0], p[1], {
    size: 56,
    ...(e.reveal ? { reveal: e.reveal } : {}),
    ...(e.group ? { group: e.group } : {}),
  });
}

// ------------------------------------------------------------------ A5 for a panel: the view left, callout rows right
export interface PanelNotesOpts {
  eyebrow: L10n;
  title: L10n;
  lead: L10n;
  view: InstrumentView;
  alt: L10n;
  scene: string;
  mode?: "frozen" | "live";
  failures?: Partial<Failures>;
  covers?: ("ai" | "dg")[];
  /** the instrument frame (default a 4:3 panel 120,192,960,720) */
  frame?: [number, number, number, number];
  /** markers on the instrument, in slide units, one per row (reveal with it) */
  marks: [number, number][];
  rows: { heading: L10n; body: L10n; readout?: ReadoutId }[];
  foot: L10n;
  reader: L10n;
  notes?: L10n;
  kind?: Step["kind"];
}
export function panelNotesStep(id: string, o: PanelNotesOpts): Step {
  const [x, y, w, h] = o.frame ?? [G.left, 192, 960, 720];
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
          ...(o.covers ? { covers: o.covers } : {}),
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
          { y: 432, pitch: 184 },
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

// ------------------------------------------------------------------ A6 two panels from one scene, one thing changed
export interface PanelHalf {
  eyebrow: L10n;
  color: ColorToken;
  view: InstrumentView;
  alt: L10n;
  scene: string;
  failures?: Partial<Failures>;
  covers?: ("ai" | "dg")[];
  mode?: "frozen" | "live";
  /** frame size inside the half (default 640 × 480, a 4:3 panel); gauges use a square */
  size?: [number, number];
  body: L10n;
}
export function panelCompareStep(
  id: string,
  o: {
    eyebrow: L10n;
    title: L10n;
    halves: [PanelHalf, PanelHalf];
    foot: L10n;
    reader: L10n;
    notes?: L10n;
  },
): Step {
  const blocks: SlideBlock[] = [...head(o.eyebrow, o.title)];
  o.halves.forEach((hf, k) => {
    const x = k === 0 ? G.left : 984;
    const [w, h] = hf.size ?? [640, 480];
    const g = { reveal: k + 1, group: `half${k + 1}` };
    blocks.push(
      T("eyebrow", hf.eyebrow, x, 312, 816, 32, { color: hf.color, ...g }),
      INST(hf.view, hf.alt, x, 360, w, h, {
        id: `${id}.inst${k + 1}`,
        scene: hf.scene,
        ...(hf.mode ? { mode: hf.mode } : {}),
        ...(hf.failures ? { failures: hf.failures } : {}),
        ...(hf.covers ? { covers: hf.covers } : {}),
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
  covers?: ("ai" | "dg")[];
  failures?: Partial<Failures>;
  notes?: L10n;
}
export function turnStep(id: string, o: TurnOpts): Step {
  const [x, y, w, h] = o.frame ?? [1000, 296, 800, 600];
  const pitch = 136;
  const rowsEnd = 312 + o.rows.length * pitch;
  return slideStep(
    id,
    o.title,
    slide(
      "stepByStep",
      [
        ...head(o.eyebrow, o.title, 960),
        ...stepRows(o.rows, { y: 312, pitch, w: 816 }),
        rule(G.left, rowsEnd + 8, 816),
        CHECKLIST(
          `${id}.checks`,
          o.checks.map((c, i) => ({
            text: c.text,
            check: i,
            ...(c.readout ? { readout: c.readout } : {}),
          })),
          G.left,
          rowsEnd + 32,
          816,
          Math.min(984 - (rowsEnd + 32), 80 * o.checks.length + 24),
          { title: { en: "", fr: "" } },
        ),
        INST(o.view, o.alt, x, y, w, h, {
          id: `${id}.inst`,
          scene: o.scene,
          mode: "live",
          controls: o.controls,
          ...(o.covers ? { covers: o.covers } : {}),
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

// ------------------------------------------------------------------ A10 recap
export function recapStep(
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
