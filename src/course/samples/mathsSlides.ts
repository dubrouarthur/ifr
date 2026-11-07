// Ground school — the archetype frames (SPEC slides v2 §8) shared by the two maths samples: the header, the
// footer source line, hairline rules, the cover (A1), the section opener (A2), the takeaways (A10) and the
// "keep this page" grid (A3 grid variant). Every frame is on the 12-column grid (layouts.ts G) and the 8 px
// baseline; text never sits on a card, and the only numbering device is the marker.
import type { ColorToken, L10n, SlideBlock } from "../types";
import { G } from "../canvas/layouts";
import { CHECKLIST, SHAPE, T } from "./kit";

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
