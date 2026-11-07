// Ground school — designed slides: the small measures the renderer and the readability guard share (pure).
import type { SlideTheme } from "../types";
import { MIN_TEXT_PX } from "./themes";
import { paletteFromColors, type DiagramPalette } from "../stage/svgkit";

/** The smallest fit scale a style may shrink to: never under the 24 px floor (big display styles to 30 %, still ≥ 36 px). */
export function fitFloor(size: number): number {
  return Math.min(1, Math.max(MIN_TEXT_PX / Math.max(1, size), size >= 72 ? 0.3 : 0));
}
/** The hint row under a diagram (24 px + its 28 px glyph): this many logical px are taken from the drawing. */
export const HINT_H = 48;
/** The diagram palette of a slide theme (diagrams follow the slide theme, SPEC slides v2 §4). */
export function slidePalette(theme: SlideTheme): DiagramPalette {
  const c = theme.colors;
  return paletteFromColors({
    bg: c.bg,
    rule: c.rule,
    ruleStrong: c.ruleStrong,
    text: c.text,
    ink2: c.ink2,
    muted: c.muted,
    accent: c.accent,
    path: c.path,
    sel: c.sel,
    nav: c.nav,
    key: c.key,
    stop: c.stop,
  });
}
