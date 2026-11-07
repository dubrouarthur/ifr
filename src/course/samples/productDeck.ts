// The start page's slide (ui/intro.ts): one real course slide, drawn by our slide renderer on the design-system
// frames, FR and EN, in the light classroom theme. It shows what an instructor builds and teaches, for a PPL student
// first: the simulator's own airspeed indicator on the slide, its arcs called out (C172S POH section 2). The page
// itself is the cover (its headline would repeat a cover slide's title), so the slide carries no eyebrow, label or
// source line: it is drawn at hero size, about a third of the 1920 canvas, and every text on it stays at or above
// HERO_MIN_CSS_PX there (tests/slide-readability.test.ts checks it at HERO_MIN_SCALE). No claims beyond what the
// app does.
import { INST, L, MARK, SHAPE, T } from "../canvas/layouts";
import { onInstrument } from "./kit";
import { STEAM_GAUGE_LAYOUT } from "../../avionics/steam";
import type { L10n, SlideBlock, SlideCanvas } from "../types";

export interface ProductSlide {
  id: string;
  title: L10n;
  slide: SlideCanvas;
}

/** The smallest scale the start page draws its slide at, with a margin (1280 × 720: a 672 px wide screen for the
 *  1920 canvas, 0.35; 1024 × 768 and an iPad mini in portrait: about 640 px, 0.33). */
export const HERO_MIN_SCALE = 0.32;
/** The smallest text, in CSS px, the slide may show at that scale. */
export const HERO_MIN_CSS_PX = 12;
/** …so the smallest logical size a text of the slide may have. */
export const HERO_MIN_TEXT = HERO_MIN_CSS_PX / HERO_MIN_SCALE;

const canvas = (
  blocks: SlideBlock[],
  layout: SlideCanvas["layout"],
): SlideCanvas => ({ size: { w: 1920, h: 1080 }, grid: 8, layout, blocks });
const rule = (x: number, y: number, w: number): SlideBlock =>
  SHAPE("line", x, y - 8, w, 16, { stroke: "line", strokeW: 2 });

/** a point of the ASI drawn at (x, y, s, s), from the dial's centre in radii (dx right, dy down) */
function asiPoint(x: number, y: number, s: number, dx: number, dy: number) {
  const g = STEAM_GAUGE_LAYOUT.asi;
  return onInstrument({ kind: "gauge", gauge: "asi" }, x, y, s, s, [
    g.cx + dx * g.r,
    g.cy + dy * g.r,
  ]);
}

export function productDeck(): ProductSlide[] {
  const [x, y, s] = [120, 120, 840];
  // the arcs, and where each mark sits on the dial: on the arc itself (radius 0.94), clear of the numerals and the
  // needle (white near 60 kt, green near 120, the red line's mark just short of 163 so the line stays visible)
  const rows: { at: [number, number]; head: L10n; line: L10n }[] = [
    {
      at: [0.83, -0.44],
      head: L("White arc", "Arc blanc"),
      line: L("Flaps extended: 40–85 kt", "Volets sortis : 40 à 85 kt"),
    },
    {
      at: [0, 0.94],
      head: L("Green arc", "Arc vert"),
      line: L("Normal use: 48–129 kt", "Usage normal : 48 à 129 kt"),
    },
    {
      at: [-0.883, 0.32],
      head: L("Red line", "Trait rouge"),
      line: L("Never exceed: 163 kt", "Ne jamais dépasser : 163 kt"),
    },
  ];
  return [
    {
      id: "p-asi",
      title: L("The airspeed indicator’s arcs", "Les arcs de l’anémomètre"),
      slide: canvas(
        [
          INST(
            { kind: "gauge", gauge: "asi" },
            L(
              "C172S airspeed indicator: white arc 40–85, green 48–129, yellow 129–163, red line 163 KIAS",
              "Anémomètre du C172S : arc blanc 40–85, vert 48–129, jaune 129–163, trait rouge 163 KIAS",
            ),
            x,
            y,
            s,
            s,
          ),
          ...rows.map((r, i) => {
            const p = asiPoint(x, y, s, r.at[0], r.at[1]);
            return MARK(i + 1, p[0], p[1], { size: 80 });
          }),
          T(
            "title",
            L("The airspeed indicator’s arcs", "Les arcs de l’anémomètre"),
            1128,
            136,
            672,
            168,
          ),
          ...rows.flatMap((r, i): SlideBlock[] => {
            const ry = 384 + i * 192;
            return [
              rule(1128, ry, 672),
              MARK(i + 1, 1168, ry + 64, { size: 80 }),
              T("heading", r.head, 1240, ry + 32, 560, 56),
              T("lead", r.line, 1240, ry + 96, 560, 64, { color: "ink2" }),
            ];
          }),
        ],
        "instrumentNotes",
      ),
    },
  ];
}
