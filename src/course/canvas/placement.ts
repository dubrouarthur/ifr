// Placement that never makes a mess (pure, no DOM):
//   fitFree      where a new w × h element goes on a slide: in free space, never on top of what is there,
//                a little smaller when that keeps it clear (down to a readable floor), or null when the slide is full
//   tidySlide    « Réorganiser la diapo »: one click puts the slide in order (header texts on top, words on the
//                left, instruments / diagrams / images on the right), callouts and markers follow their instrument
// The studio calls them from the editor core (editorCore.addDraft) and the editor host (the full-slide offer).
import type { Lang, SlideBlock, SlideCanvas, SlideTheme } from "../types";
import { SLIDE_H, SLIDE_W, type Box, mapPoint } from "./geom";
import { textBlockFit } from "./readability";

/** the cell of the occupancy grid (slide units) */
const CELL = 24;
/** the safe area of a slide: where added elements may go (the layouts' margins) */
export const SAFE: Box = { x: 96, y: 72, w: SLIDE_W - 192, h: SLIDE_H - 144 };
/** the gap kept around what is already on the slide */
const GAP = 24;
/** scales tried, largest first */
const SCALES = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.45, 0.4, 0.35] as const;

type Kind = SlideBlock["kind"];
const VISUAL: ReadonlySet<Kind> = new Set<Kind>([
  "instrument",
  "diagram",
  "image",
  "simViewport",
]);
const ATTACHABLE: ReadonlySet<Kind> = new Set<Kind>([
  "arrow",
  "callout",
  "marker",
  "shape",
]);
const HEADER_STYLES = new Set([
  "eyebrow",
  "label",
  "display",
  "title",
  "subtitle",
  "lead",
]);

/** A block that is a background (full-slide, or a large panel shape): the free space is measured over it. */
export function isBackground(b: SlideBlock): boolean {
  const f = b.frame;
  if (f.w >= SLIDE_W * 0.9 && f.h >= SLIDE_H * 0.9) return true;
  return b.kind === "shape" && f.w * f.h > SLIDE_W * SLIDE_H * 0.4;
}
/** words a new element must never cover (text, a question, a checklist, a calculation) */
export const isWords = (b: SlideBlock): boolean =>
  b.kind === "text" ||
  b.kind === "quiz" ||
  b.kind === "checklist" ||
  b.kind === "calc" ||
  b.kind === "callout";
/** the blocks that take room on the editing slide */
export function obstacles(c: SlideCanvas): SlideBlock[] {
  return c.blocks.filter((b) => !b.hiddenInEditor && !isBackground(b));
}

/** The smallest an element may become to fit (slide units): instruments and pictures stay readable, text keeps 70 %. */
export function minScaleOf(
  kind: Kind | undefined,
  w: number,
  h: number,
): number {
  if (kind === "arrow" || kind === "callout" || kind === "marker") return 1;
  if (
    kind === "text" ||
    kind === "quiz" ||
    kind === "checklist" ||
    kind === "calc"
  )
    return 0.7;
  // a live instrument or a picture under 260 px loses its markings (the readability guard's floor)
  return Math.min(1, Math.max(0.35, 260 / Math.max(1, Math.min(w, h))));
}

/** an occupancy grid with a summed-area table: O(1) "is this rectangle free?" */
class Occupancy {
  readonly cols: number;
  readonly rows: number;
  private sat: Int32Array;
  constructor(frames: readonly Box[], area: Box) {
    this.cols = Math.floor(area.w / CELL);
    this.rows = Math.floor(area.h / CELL);
    const grid = new Uint8Array(this.cols * this.rows);
    for (const f of frames) {
      const x0 = Math.max(0, Math.floor((f.x - GAP - area.x) / CELL));
      const y0 = Math.max(0, Math.floor((f.y - GAP - area.y) / CELL));
      const x1 = Math.min(
        this.cols,
        Math.ceil((f.x + f.w + GAP - area.x) / CELL),
      );
      const y1 = Math.min(
        this.rows,
        Math.ceil((f.y + f.h + GAP - area.y) / CELL),
      );
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) grid[y * this.cols + x] = 1;
    }
    const W = this.cols + 1;
    this.sat = new Int32Array(W * (this.rows + 1));
    for (let y = 0; y < this.rows; y++)
      for (let x = 0; x < this.cols; x++)
        this.sat[(y + 1) * W + x + 1] =
          grid[y * this.cols + x] +
          this.sat[y * W + x + 1] +
          this.sat[(y + 1) * W + x] -
          this.sat[y * W + x];
  }
  /** cells taken in [x, x + w) × [y, y + h); outside the grid counts as taken */
  used(x: number, y: number, w: number, h: number): number {
    if (x < 0 || y < 0 || x + w > this.cols || y + h > this.rows)
      return Infinity;
    const W = this.cols + 1;
    const s = this.sat;
    return (
      s[(y + h) * W + x + w] -
      s[y * W + x + w] -
      s[(y + h) * W + x] +
      s[y * W + x]
    );
  }
}

export interface FreeFit {
  /** the centre of the element (slide units) */
  at: [number, number];
  /** the scale the element takes (≤ 1) */
  scale: number;
  w: number;
  h: number;
}

/**
 * Where a w × h element added from the rail goes: in the free space of the slide (the safe area, a gap of 24
 * around what is there), at the largest scale ≥ the element's floor that fits; among the spots that fit, the one
 * with the most room around it, then the nearest to the centre of the free space. null: the slide is full.
 */
export function fitFree(
  c: SlideCanvas,
  w: number,
  h: number,
  kind?: Kind,
  o: { minScale?: number; ignore?: string; wordsOnly?: boolean } = {},
): FreeFit | null {
  const frames = obstacles(c)
    .filter((b) => b.id !== o.ignore && (!o.wordsOnly || isWords(b)))
    .map((b) => b.frame);
  const area = SAFE;
  if (!frames.length) {
    const k = Math.min(1, area.w / w, area.h / h);
    return { at: [SLIDE_W / 2, SLIDE_H / 2], scale: k, w: w * k, h: h * k };
  }
  const occ = new Occupancy(frames, area);
  const floor = o.minScale ?? minScaleOf(kind, w, h);
  // the centre of the free cells: the tie-break pulls towards the middle of the empty part
  let fx = 0;
  let fy = 0;
  let n = 0;
  for (let y = 0; y < occ.rows; y++)
    for (let x = 0; x < occ.cols; x++)
      if (!occ.used(x, y, 1, 1)) {
        fx += x + 0.5;
        fy += y + 0.5;
        n++;
      }
  if (!n) return null;
  fx /= n;
  fy /= n;
  for (const k0 of SCALES) {
    const k = Math.min(k0, area.w / w, area.h / h);
    if (k < floor - 1e-6) break;
    const cw = Math.ceil((w * k) / CELL);
    const ch = Math.ceil((h * k) / CELL);
    let best: { x: number; y: number; room: number; d: number } | null = null;
    for (let y = 0; y + ch <= occ.rows; y++)
      for (let x = 0; x + cw <= occ.cols; x++) {
        if (occ.used(x, y, cw, ch)) continue;
        // room: how many cells the spot can grow on every side and stay free (the edge of the safe area counts)
        let room = 0;
        while (
          room < 4 &&
          !occ.used(
            x - room - 1,
            y - room - 1,
            cw + 2 * room + 2,
            ch + 2 * room + 2,
          )
        )
          room++;
        const d = Math.hypot(x + cw / 2 - fx, y + ch / 2 - fy);
        if (
          !best ||
          room > best.room ||
          (room === best.room && d < best.d - 1e-6)
        )
          best = { x, y, room, d };
      }
    if (best) {
      // centre the element in its cells (the cells are rounded up)
      const cx = area.x + (best.x + cw / 2) * CELL;
      const cy = area.y + (best.y + ch / 2) * CELL;
      return {
        at: [Math.round(cx), Math.round(cy)],
        scale: k,
        w: Math.round(w * k),
        h: Math.round(h * k),
      };
    }
  }
  return null;
}

/** Is the slide in a mess: two elements that are not attached to each other cover each other? */
export function slideCrowded(c: SlideCanvas): boolean {
  const bs = obstacles(c);
  const att = attachments(bs);
  for (let i = 0; i < bs.length; i++)
    for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i];
      const b = bs[j];
      if (att.get(a.id) === b.id || att.get(b.id) === a.id) continue;
      if (
        overlap(a.frame, b.frame) >
        0.15 * Math.min(a.frame.w * a.frame.h, b.frame.w * b.frame.h)
      )
        return true;
    }
  return false;
}

const overlap = (a: Box, b: Box): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** the gap between two boxes (0 when they touch or overlap) */
const boxGap = (a: Box, b: Box): number =>
  Math.hypot(
    Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w)),
    Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h)),
  );

/** small arrows, callouts, markers and shapes whose centre lies on a visual: they belong to it (id → visual id) */
function attachments(bs: readonly SlideBlock[]): Map<string, string> {
  const out = new Map<string, string>();
  const visuals = bs.filter((b) => VISUAL.has(b.kind));
  for (const b of bs) {
    if (!ATTACHABLE.has(b.kind)) continue;
    const f = b.frame;
    // a callout belongs to what its leader points at
    const [cx, cy] =
      b.kind === "callout" && b.target
        ? b.target
        : [f.x + f.w / 2, f.y + f.h / 2];
    let host: SlideBlock | null = null;
    for (const v of visuals) {
      const g = v.frame;
      if (b.kind === "shape" && f.w * f.h > g.w * g.h * 0.6) continue;
      if (cx >= g.x && cx <= g.x + g.w && cy >= g.y && cy <= g.y + g.h) {
        if (!host || g.w * g.h < host.frame.w * host.frame.h) host = v;
      }
    }
    if (host) out.set(b.id, host.id);
  }
  return out;
}

const roleOf = (b: SlideBlock): "header" | "body" | "visual" | "other" => {
  if (b.kind === "text") return HEADER_STYLES.has(b.style) ? "header" : "body";
  if (VISUAL.has(b.kind)) return "visual";
  if (b.kind === "quiz" || b.kind === "checklist" || b.kind === "calc")
    return "body";
  return "other";
};

/** fit a w × h box inside a cell, centred, never larger than it was */
function fitIn(w: number, h: number, cell: Box): Box {
  const k = Math.min(1, cell.w / w, cell.h / h);
  const ww = Math.round(w * k);
  const hh = Math.round(h * k);
  return {
    x: Math.round(cell.x + (cell.w - ww) / 2),
    y: Math.round(cell.y + (cell.h - hh) / 2),
    w: ww,
    h: hh,
  };
}

/** move a block from its frame to a new box (arrows: their endpoints too) */
function moveTo(b: SlideBlock, from: Box, to: Box): SlideBlock {
  const f = { ...b.frame, x: to.x, y: to.y, w: to.w, h: to.h };
  if (b.kind === "arrow")
    return {
      ...b,
      frame: f,
      from: mapPoint(b.from, from, to),
      to: mapPoint(b.to, from, to),
    };
  if (b.kind === "callout" && b.target)
    return { ...b, frame: f, target: mapPoint(b.target, from, to) };
  return { ...b, frame: f };
}
const mapBox = (f: Box, from: Box, to: Box): Box => {
  const [x0, y0] = mapPoint([f.x, f.y], from, to);
  const [x1, y1] = mapPoint([f.x + f.w, f.y + f.h], from, to);
  return {
    x: Math.round(x0),
    y: Math.round(y0),
    w: Math.round(x1 - x0),
    h: Math.round(y1 - y0),
  };
};

/**
 * « Réorganiser la diapo »: the slide in a clean order, in one step. The header (eyebrow, title, subtitle) at the
 * top, stacked; the words (body text, question, checklist) in a left column; the visuals (instruments, diagrams,
 * images, simulator views) on the right, side by side or stacked; what is attached to a visual moves and scales
 * with it. Nothing overlaps; every element stays at most its size. Backgrounds and loose shapes keep their place.
 */
export function tidySlide(
  c: SlideCanvas,
  theme: SlideTheme,
  lang: Lang,
): SlideCanvas {
  const live = c.blocks.filter((b) => !b.hiddenInEditor && !isBackground(b));
  const att = attachments(live);
  const main = live.filter((b) => !att.has(b.id));
  const byRead = (a: SlideBlock, b: SlideBlock) =>
    a.frame.y - b.frame.y || a.frame.x - b.frame.x;
  const header = main.filter((b) => roleOf(b) === "header").sort(byRead);
  const body = main.filter((b) => roleOf(b) === "body").sort(byRead);
  const visuals = main.filter((b) => roleOf(b) === "visual").sort(byRead);
  if (!header.length && !body.length && !visuals.length) return c;
  const X = 120;
  const R = SLIDE_W - 120;
  const B = SLIDE_H - 96;
  const next = new Map<string, Box>();
  /** a text block's height at a width (its estimated lines; at least one line of its style) */
  const textH = (b: SlideBlock, w: number): number => {
    if (b.kind !== "text") return b.frame.h;
    const probe = { ...b, frame: { ...b.frame, w, h: 2000 } };
    const st = theme.styles[b.style] ?? theme.styles.body;
    const one = Math.ceil(st.size * st.lineHeight);
    return Math.max(
      one,
      Math.ceil(textBlockFit(probe, theme, lang).height) + 8,
    );
  };
  // ---- header
  let y = 96;
  const split = body.length > 0 && visuals.length > 0;
  for (const b of header) {
    const w = Math.min(R - X, Math.max(b.frame.w, split ? 760 : 0));
    const hh = textH(b, w);
    next.set(b.id, { x: X, y, w, h: hh });
    y +=
      hh +
      (b.kind === "text" && (b.style === "eyebrow" || b.style === "label")
        ? 16
        : 24);
  }
  const top = header.length ? y + 24 : 120;
  // ---- columns
  const colW = split ? 760 : Math.min(1200, R - X);
  const vis: Box = split
    ? { x: X + colW + 72, y: top, w: R - (X + colW + 72), h: B - top }
    : { x: X, y: top, w: R - X, h: B - top };
  if (body.length) {
    // the words: stacked, each at its natural height, shrunk together when they do not fit
    const gap = 24;
    const hs = body.map((b) => textH(b, colW));
    const room =
      (visuals.length && !split ? Math.round((B - top) * 0.45) : B - top) -
      gap * (body.length - 1);
    const total = hs.reduce((a, v) => a + v, 0);
    const k = total > room ? room / total : 1;
    // no header beside the visuals: the words sit in the middle of the column, level with the instrument
    const used = total * k + gap * (body.length - 1);
    let yy =
      split && !header.length
        ? Math.round(top + Math.max(0, (B - top - used) / 2))
        : top;
    body.forEach((b, i) => {
      const hh = Math.max(48, Math.round(hs[i] * k));
      const w = b.kind === "text" ? colW : Math.min(colW, b.frame.w);
      const box =
        b.kind === "text"
          ? { x: X, y: yy, w, h: hh }
          : fitIn(b.frame.w, b.frame.h, { x: X, y: yy, w: colW, h: hh });
      next.set(b.id, { ...box, x: X });
      yy += hh + gap;
    });
    if (visuals.length && !split) {
      vis.y = yy + 24;
      vis.h = B - vis.y;
    }
  }
  if (visuals.length) {
    // the visuals: one row when they are wide enough there, else a column (two at most side by side)
    const n = visuals.length;
    const gap = 48;
    const rowCells = (cols: number): Box[] => {
      const rows = Math.ceil(n / cols);
      const cw = (vis.w - gap * (cols - 1)) / cols;
      const chh = (vis.h - gap * (rows - 1)) / rows;
      return visuals.map((_, i) => ({
        x: vis.x + (i % cols) * (cw + gap),
        y: vis.y + Math.floor(i / cols) * (chh + gap),
        w: cw,
        h: chh,
      }));
    };
    const score = (cells: Box[]) =>
      visuals.reduce(
        (a, v, i) =>
          a + Math.min(1, cells[i].w / v.frame.w, cells[i].h / v.frame.h),
        0,
      );
    let best = rowCells(1);
    for (let cols = 2; cols <= Math.min(3, n); cols++) {
      const cells = rowCells(cols);
      if (score(cells) > score(best) + 1e-6) best = cells;
    }
    visuals.forEach((v, i) =>
      next.set(v.id, fitIn(v.frame.w, v.frame.h, best[i])),
    );
  }
  const blocks = c.blocks.map((b) => {
    const to = next.get(b.id);
    if (to) return moveTo(b, b.frame, to);
    const host = att.get(b.id);
    if (host) {
      const hb = live.find((x) => x.id === host)!;
      const hto = next.get(host);
      if (hto && b.kind === "callout" && b.target) {
        // the leader's end follows the instrument; the label moves with it, at its size, kept on the slide
        const t = mapPoint(b.target, hb.frame, hto);
        const f = b.frame;
        const x = Math.max(
          0,
          Math.min(SLIDE_W - f.w, Math.round(f.x + t[0] - b.target[0])),
        );
        const y = Math.max(
          0,
          Math.min(SLIDE_H - f.h, Math.round(f.y + t[1] - b.target[1])),
        );
        return { ...b, frame: { ...f, x, y }, target: t };
      }
      if (hto) return moveTo(b, b.frame, mapBox(b.frame, hb.frame, hto));
    }
    // a loose number badge or divider line beside some words follows those words (moved, never scaled up)
    if (ATTACHABLE.has(b.kind) && !isBackground(b) && !b.hiddenInEditor) {
      let near: SlideBlock | null = null;
      let nd = 96;
      for (const m of main) {
        if (!next.has(m.id) || m.id === b.id || roleOf(m) === "visual")
          continue;
        const d = boxGap(b.frame, m.frame);
        if (d < nd) {
          nd = d;
          near = m;
        }
      }
      const to = near ? next.get(near.id) : undefined;
      if (near && to) {
        const dx = to.x - near.frame.x;
        const dy = to.y - near.frame.y;
        const f = b.frame;
        const w = f.h <= 8 ? Math.min(f.w, to.w) : f.w;
        const box = {
          x: Math.max(0, Math.min(SLIDE_W - w, Math.round(f.x + dx))),
          y: Math.max(0, Math.min(SLIDE_H - f.h, Math.round(f.y + dy))),
          w,
          h: f.h,
        };
        return moveTo(b, f, box);
      }
    }
    return b;
  });
  return { ...c, blocks };
}
