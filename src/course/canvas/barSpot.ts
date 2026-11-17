// Where the format bar goes over the slide (AUDIT item 50): never on the other words of the slide. It tries
// above the selection (room for the rotate handle), below it, then beside it, and keeps the first spot that
// covers no other text; when every spot covers some, the one that covers least. Pure, in view pixels.
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlap = (a: Rect, b: Rect): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * The bar's top-left corner.
 * @param sel   the selection's box
 * @param bar   the bar's size
 * @param words the other blocks with words (texts, callouts, questions…), never the selection itself
 * @param vis   the visible part of the surface (the bar stays inside it, 6 px in)
 */
export function barSpot(
  sel: Rect,
  bar: { w: number; h: number },
  words: readonly Rect[],
  vis: Rect,
): { left: number; top: number } {
  const clamp = (left: number, top: number) => ({
    left: Math.max(vis.x + 6, Math.min(vis.x + vis.w - bar.w - 6, left)),
    top: Math.max(vis.y + 6, Math.min(vis.y + vis.h - bar.h - 6, top)),
  });
  const cx = sel.x + sel.w / 2 - bar.w / 2;
  const spots = [
    clamp(cx, sel.y - bar.h - 30), // above (the rotate handle sits just over the box)
    clamp(cx, sel.y + sel.h + 18), // below
    clamp(sel.x + sel.w + 18, sel.y), // right
    clamp(sel.x - bar.w - 18, sel.y), // left
  ];
  let best = spots[0];
  let bestScore = Infinity;
  for (const s of spots) {
    const r = { x: s.left, y: s.top, w: bar.w, h: bar.h };
    // covering the selection (a clamped spot) counts as much as covering other words
    const score = words.reduce((n, w) => n + overlap(r, w), 0) + overlap(r, sel);
    if (score < bestScore) {
      best = s;
      bestScore = score;
      if (score === 0) break;
    }
  }
  return best;
}
