// Ground school — the archetype frames (SPEC slides v2 §8) shared by the radio-navigation samples (VOR tracking,
// Holding, the hold-ndb briefing): header, footer source line, hairline rules, cover (A1), section opener (A2),
// big number (A3), hero diagram + three points (A4), instrument + callout rows (A5), step list (A7 vertical),
// takeaways (A10) and "Ready to fly" (A11). Every frame sits on the 12-column grid (layouts.ts G) and the 8 px
// baseline; text never sits on a card; the marker is the only numbering device; one idea per reveal.
import type {
  ColorToken,
  L10n,
  ReadoutId,
  SlideBlock,
  SlideCanvas,
  SlideLayoutId,
} from "../types";
import { G } from "../canvas/layouts";
import { CHECKLIST, MARK, SHAPE, T, canvas } from "./kit";

export { G };

/** A slide on the design-system grid (8 px baseline), tagged with its archetype for the editor. */
export const slide = (
  layout: SlideLayoutId,
  blocks: SlideBlock[],
  o: Partial<SlideCanvas> = {},
): SlideCanvas => canvas(blocks, { grid: 8, layout, ...o });

/** Eyebrow (category only, never a source) and title (≤ 2 lines). */
export function head(
  eyebrow: L10n,
  title: L10n,
  w = 1392,
  x: number = G.left,
): SlideBlock[] {
  return [
    T("eyebrow", eyebrow, x, G.eyebrowY, w, 32),
    T("title", title, x, G.titleY, w, 152),
  ];
}
/** The lead under a one-line title. */
export const lead = (t: L10n, w = 1104, x: number = G.left): SlideBlock =>
  T("lead", t, x, G.leadY, w, 56);
/** The footer line: the source, on the left. */
export const foot = (
  t: L10n,
  w = 1200,
  x: number = G.left,
  color?: ColorToken,
): SlideBlock => T("foot", t, x, G.foot, w, 32, color ? { color } : {});
/** A 2 px hairline centred on y. */
export function rule(
  x: number,
  y: number,
  w: number,
  e: { reveal?: number; group?: string } = {},
): SlideBlock {
  return SHAPE("line", x, y - 8, w, 16, {
    stroke: "line",
    strokeW: 2,
    ...(e.reveal ? { reveal: { order: e.reveal } } : {}),
    ...(e.group ? { group: e.group } : {}),
  });
}

/** A1 cover: eyebrow, display (main), subtitle, lead, meta line; the hero goes in 984,96,816,888. */
export function coverBlocks(o: {
  eyebrow: L10n;
  main: L10n;
  sub: L10n;
  lead: L10n;
  meta: L10n;
  hero: SlideBlock[];
}): SlideBlock[] {
  return [
    T("eyebrow", o.eyebrow, G.left, G.eyebrowY, 816, 32),
    T("display", o.main, G.left, 296, 840, 248, { valign: "bottom" }),
    T("heading", o.sub, G.left, 568, 840, 112, { color: "ink2" }),
    T("lead", o.lead, G.left, 712, 744, 168),
    T("foot", o.meta, G.left, 920, 840, 32),
    ...o.hero,
  ];
}

/** A2 section opener: "Part n of N", the numeral, the title, the lead and the roadmap (≤ 4 items). */
export function sectionBlocks(o: {
  n: number;
  of: number;
  title: L10n;
  lead: L10n;
  items: L10n[];
  active?: number;
}): SlideBlock[] {
  const active = o.active ?? o.n - 1;
  const num = String(o.n).padStart(2, "0");
  return [
    T(
      "eyebrow",
      { en: `Part ${o.n} of ${o.of}`, fr: `Partie ${o.n} sur ${o.of}` },
      G.left,
      G.eyebrowY,
      1392,
      32,
    ),
    T("number", { en: num, fr: num }, 112, 200, 480, 200),
    T("display", o.title, G.left, 424, 1680, 136),
    T("lead", o.lead, G.left, 584, 1104, 112),
    rule(G.left, 840, 1680),
    SHAPE("rect", G.left + 432 * active, 832, 384, 8, {
      fill: "accent",
      stroke: null,
      z: 1,
    }),
    ...o.items.flatMap((it, i): SlideBlock[] => [
      T(
        "foot",
        { en: String(i + 1), fr: String(i + 1) },
        G.left + 432 * i,
        864,
        384,
        32,
        i === active ? { color: "accent" } : {},
      ),
      T("body", it, G.left + 432 * i, 904, 384, 56, {
        color: i === active ? "text" : "muted",
      }),
    ]),
  ];
}

/** A3 big number: the number (with an optional unit at 0.3×, mute), the statement and one line of body. */
export function bigNumberBlocks(o: {
  n: L10n;
  /** number width (for the unit to sit just after it) */
  nW: number;
  unit?: L10n;
  color?: ColorToken;
  statement: L10n;
  body: L10n;
}): SlideBlock[] {
  return [
    T("number", o.n, G.left, 304, o.nW, 232, {
      ...(o.color ? { color: o.color } : {}),
      valign: "bottom",
    }),
    ...(o.unit
      ? [
          T("title", o.unit, G.left + o.nW + 16, 432, 400, 88, {
            color: "muted",
            valign: "bottom",
          }),
        ]
      : []),
    T("heading", o.statement, G.left, 568, 960, 112),
    T("body", o.body, G.left, 696, 816, 200),
  ];
}

/** A4 points beside a hero diagram: rule, heading in the semantic colour of its region, ≤ 2 lines of body. */
export function pointRows(
  pts: { heading: L10n; body: L10n; color?: ColorToken }[],
  o: {
    x?: number;
    y?: number;
    w?: number;
    pitch?: number;
    bodyH?: number;
  } = {},
): SlideBlock[] {
  const x = o.x ?? 1128;
  const y0 = o.y ?? 336;
  const w = o.w ?? 672;
  const pitch = o.pitch ?? 216;
  const bodyH = o.bodyH ?? 104;
  return pts.flatMap((p, i): SlideBlock[] => {
    const y = y0 + i * pitch;
    const g = `pt${i + 1}`;
    return [
      rule(x, y, w, { reveal: i + 1, group: g }),
      T("heading", p.heading, x, y + 24, w, 56, {
        ...(p.color ? { color: p.color } : {}),
        reveal: i + 1,
        group: g,
      }),
      T("body", p.body, x, y + 88, w, bodyH, { reveal: i + 1, group: g }),
    ];
  });
}

/** A5 callout rows beside an instrument: marker, 40 heading, 34 body with the live value (3 × 176 from y 400). */
export function calloutRows(
  rows: { heading: L10n; body: L10n; readout?: ReadoutId; scene?: string }[],
  o: { x?: number; y?: number; w?: number; pitch?: number } = {},
): SlideBlock[] {
  const x = o.x ?? 1128;
  const y0 = o.y ?? 400;
  const w = o.w ?? 672;
  const pitch = o.pitch ?? 176;
  return rows.flatMap((r, i): SlideBlock[] => {
    const y = y0 + i * pitch;
    const g = `row${i + 1}`;
    return [
      rule(x, y, w, { reveal: i + 1, group: g }),
      MARK(i + 1, x + 28, y + 52, { size: 56, reveal: i + 1, group: g }),
      T("heading", r.heading, x + 80, y + 24, w - 80, 56, {
        reveal: i + 1,
        group: g,
      }),
      T("body", r.body, x + 80, y + 88, w - 80, 80, {
        reveal: i + 1,
        group: g,
        ...(r.readout
          ? {
              bind: {
                k: "readout" as const,
                readout: r.readout,
                ...(r.scene ? { scene: r.scene } : {}),
              },
            }
          : {}),
      }),
    ];
  });
}

/** A7 vertical step list: marker + heading 40 + small line, rows of `pitch` from y. */
export function stepRows(
  rows: { heading: L10n; small: L10n }[],
  o: {
    x?: number;
    y?: number;
    w?: number;
    pitch?: number;
    reveal?: boolean;
  } = {},
): SlideBlock[] {
  const x = o.x ?? G.left;
  const y0 = o.y ?? 312;
  const w = o.w ?? 816;
  const pitch = o.pitch ?? 132;
  return rows.flatMap((r, i): SlideBlock[] => {
    const y = y0 + i * pitch;
    const g = `s${i + 1}`;
    const rv = o.reveal ? { reveal: i + 1 } : {};
    return [
      MARK(i + 1, x + 28, y + 36, { size: 56, group: g, ...rv }),
      T("heading", r.heading, x + 80, y, w - 80, 56, { group: g, ...rv }),
      T("small", r.small, x + 80, y + 60, w - 80, 48, { group: g, ...rv }),
    ];
  });
}

/** A10 takeaways: three numbers (168) with one line each, then three check rows aligned to the columns. */
export function recapBlocks(o: {
  id: string;
  cols: { n: L10n; text: L10n; color?: ColorToken }[];
  checksTitle: L10n;
  checks: L10n[];
}): SlideBlock[] {
  return [
    ...o.cols.flatMap((c, i): SlideBlock[] => [
      T("number", c.n, G.x(i * 4), 320, 528, 176, {
        ...(c.color ? { color: c.color } : {}),
      }),
      rule(G.x(i * 4), 536, 528),
      T("body", c.text, G.x(i * 4), 560, 528, 104),
    ]),
    T("eyebrow", o.checksTitle, G.left, 760, 1680, 32, { color: "muted" }),
    ...o.checks.map((t, i) =>
      CHECKLIST(
        `${o.id}.ck${i + 1}`,
        [{ text: t }],
        G.x(i * 4),
        808,
        528,
        152,
        {
          title: { en: "", fr: "" },
        },
      ),
    ),
  ];
}

/** A11 "Ready to fly": ≤ 4 numbered objectives on the left, a 2 × 2 grid of standards, the tip line. */
export function readyBlocks(o: {
  objectives: L10n[];
  standards: { n: L10n; text: L10n; color?: ColorToken }[];
  tip: L10n;
}): SlideBlock[] {
  return [
    ...head(
      { en: "Before the flight", fr: "Avant le vol" },
      { en: "Ready to fly", fr: "Prêt à voler" },
    ),
    T(
      "eyebrow",
      { en: "What you will do", fr: "Ce que vous allez faire" },
      G.left,
      320,
      816,
      32,
      { color: "muted" },
    ),
    ...o.objectives.flatMap((t, i): SlideBlock[] => [
      MARK(i + 1, G.left + 28, 404 + i * 112, { size: 56, group: `o${i}` }),
      T("body", t, 200, 376 + i * 112, 736, 96, { group: `o${i}` }),
    ]),
    T("eyebrow", { en: "To pass", fr: "Pour réussir" }, 1128, 320, 672, 32, {
      color: "muted",
    }),
    ...o.standards.flatMap((s, i): SlideBlock[] => {
      const x = 1128 + (i % 2) * 360;
      const y = 376 + Math.floor(i / 2) * 224;
      return [
        T("number", s.n, x, y, 312, 104, { color: s.color ?? "key" }),
        T("small", s.text, x, y + 112, 312, 80),
      ];
    }),
    rule(G.left, 864, 1680),
    T("body", o.tip, G.left, 888, 1680, 96),
  ];
}
