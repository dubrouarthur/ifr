// Ground school — the archetype frames (SPEC slides v2 §8) shared by the two maths samples: the header, the
// footer source line, hairline rules, the cover (A1), the section opener (A2), the takeaways (A10) and the
// "keep this page" grid (A3 grid variant). Every frame is on the 12-column grid (layouts.ts G) and the 8 px
// baseline; text never sits on a card, and the only numbering device is the marker.
import type {
  ColorToken,
  InstrumentView,
  L10n,
  Pt,
  Quiz,
  ReadoutId,
  SlideBlock,
} from "../types";
import { G } from "../canvas/layouts";
import { STEAM_GAUGE_LAYOUT, type SteamGaugeKind } from "../../avionics/steam";
import { CHECKLIST, MARK, QUIZ, SHAPE, T, onInstrument } from "./kit";

export { G };

/** Eyebrow (category only, never a source) and title, ≤ 2 lines. */
export function head(eyebrow: L10n, title: L10n, w = 1392): SlideBlock[] {
  return [
    T("eyebrow", eyebrow, G.left, G.eyebrowY, w, 32),
    T("title", title, G.left, G.titleY, w, 176),
  ];
}
/** The lead under a one-line title. */
export const lead = (t: L10n, w = 1104, x: number = G.left): SlideBlock =>
  T("lead", t, x, G.leadY, w, 56);
/** The footer line: the source, on the left. */
export const foot = (t: L10n, w = 1200, x: number = G.left): SlideBlock =>
  T("foot", t, x, G.foot, w, 32);
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
    T("display", o.main, G.left, 312, 840, 256, { valign: "bottom" }),
    T("heading", o.sub, G.left, 592, 840, 112, { color: "ink2" }),
    T("lead", o.lead, G.left, 728, 744, 168),
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
}): SlideBlock[] {
  const active = o.n - 1;
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
    T("display", o.title, G.left, 424, 1680, 160),
    T("lead", o.lead, G.left, 608, 1104, 112),
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

/** A10 takeaways: three numbers (168) with one line each, then three check rows aligned to the columns. */
export function recapBlocks(o: {
  id: string;
  cols: { n: L10n; text: L10n; color?: ColorToken }[];
  checksTitle: L10n;
  checks: L10n[];
}): SlideBlock[] {
  return [
    ...o.cols.flatMap((c, i): SlideBlock[] => [
      T(
        "number",
        c.n,
        G.x(i * 4),
        320,
        528,
        176,
        c.color ? { color: c.color } : {},
      ),
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

/** A3 grid variant ("Keep this page"): 2 rows × 4 at x 120 + 432·i, number 112 + a 2-line small, rules, no boxes. */
export function sheetBlocks(items: { n: L10n; text: L10n }[]): SlideBlock[] {
  return items.flatMap((it, i): SlideBlock[] => {
    const x = G.left + (i % 4) * 432;
    const y = 320 + Math.floor(i / 4) * 344;
    return [
      rule(x, y, 384),
      T("number", it.n, x, y + 32, 384, 112),
      T("small", it.text, x, y + 168, 384, 120),
    ];
  });
}

/** A steam gauge alone, as an instrument view. */
export const gauge = (g: SteamGaugeKind): InstrumentView => ({
  kind: "gauge",
  gauge: g,
});
/** A point of a steam gauge drawn at (x, y, s, s) on the slide, from the dial centre in radii (dx right, dy down). */
export function gaugePoint(
  g: SteamGaugeKind,
  x: number,
  y: number,
  s: number,
  dx: number,
  dy: number,
): Pt {
  const l = STEAM_GAUGE_LAYOUT[g];
  return onInstrument(gauge(g), x, y, s, s, [l.cx + dx * l.r, l.cy + dy * l.r]);
}

/** One row beside an instrument (A5): a hairline, a heading and ≤ 2 lines of body; `mark` numbers the row like the
 *  marker on the instrument, `live` puts a value read from the scene in the body ({{value}}). */
export interface NoteRow {
  h: L10n;
  b: L10n;
  color?: ColorToken;
  mark?: number;
  live?: { readout: ReadoutId; scene: string };
}
export function noteRows(
  rows: NoteRow[],
  o: { x?: number; y?: number; w?: number; pitch?: number; from?: number } = {},
): SlideBlock[] {
  const x = o.x ?? 1128;
  const y0 = o.y ?? 376;
  const w = o.w ?? 672;
  const pitch = o.pitch ?? 200;
  return rows.flatMap((r, i): SlideBlock[] => {
    const y = y0 + i * pitch;
    const n = (o.from ?? 1) + i;
    const g = `row${n}`;
    const tx = r.mark ? x + 80 : x;
    const tw = r.mark ? w - 80 : w;
    return [
      rule(x, y, w, { reveal: n, group: g }),
      ...(r.mark
        ? [MARK(r.mark, x + 28, y + 52, { size: 56, reveal: n, group: g })]
        : []),
      T("heading", r.h, tx, y + 24, tw, 56, {
        reveal: n,
        group: g,
        ...(r.color ? { color: r.color } : {}),
      }),
      T("body", r.b, tx, y + 88, tw, 104, {
        reveal: n,
        group: g,
        ...(r.live
          ? {
              bind: {
                k: "readout" as const,
                readout: r.live.readout,
                scene: r.live.scene,
              },
            }
          : {}),
      }),
    ];
  });
}

/** The objectives slide: ≤ 4 numbered, measurable objectives on the left; on the right, how the course proves them
 *  (a 2 × 2 grid of counts: instruments worked, calculations, questions, flights). */
export function objectivesBlocks(o: {
  eyebrow: L10n;
  title: L10n;
  objectives: L10n[];
  proofs: { n: L10n; text: L10n; color?: ColorToken }[];
  tip: L10n;
}): SlideBlock[] {
  return [
    ...head(o.eyebrow, o.title),
    T(
      "eyebrow",
      { en: "At the end, you can", fr: "À la fin, vous savez" },
      G.left,
      320,
      816,
      32,
      { color: "muted" },
    ),
    ...o.objectives.flatMap((t, i): SlideBlock[] => [
      MARK(i + 1, G.left + 28, 404 + i * 112, { size: 56, group: `o${i}` }),
      T("body", t, 200, 376 + i * 112, 784, 96, { group: `o${i}` }),
    ]),
    T(
      "eyebrow",
      { en: "How you will prove it", fr: "Comment vous le prouvez" },
      1128,
      320,
      672,
      32,
      { color: "muted" },
    ),
    ...o.proofs.flatMap((s, i): SlideBlock[] => {
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

/** A9 — a question alone on its slide (a check, or a retrieval question at the end): header, one line of
 *  context, full-width answers, the source. */
export function quizBlocks(o: {
  id: string;
  eyebrow: L10n;
  title: L10n;
  lead: L10n;
  quiz: Quiz;
  foot: L10n;
}): SlideBlock[] {
  return [
    ...head(o.eyebrow, o.title),
    lead(o.lead, 1560),
    QUIZ(`${o.id}.q`, o.quiz, G.left, 336, 1680, 648),
    foot(o.foot),
  ];
}
