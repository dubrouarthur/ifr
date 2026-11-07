// Ground school — designed slides: frame geometry (package N). Pure: snapping, rotated bounds, hit tests,
// alignment guides, resize / rotate handles, the fit of a 1920 × 1080 slide into a host. No DOM.
import type { BlockFrame, Pt, SlideBlock } from "../types";

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;
export const DEFAULT_GRID = 24;
/** a block is never smaller than this (logical units) */
export const MIN_SIZE = 16;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const boxOf = (f: Pick<BlockFrame, "x" | "y" | "w" | "h">): Box => ({
  x: f.x,
  y: f.y,
  w: f.w,
  h: f.h,
});
export const centerOf = (b: Box): Pt => [b.x + b.w / 2, b.y + b.h / 2];

export function snap(v: number, grid: number): number {
  if (!(grid > 0)) return v;
  return Math.round(v / grid) * grid;
}

/** Scale and offset that fit the slide inside a host box (contain, centred). */
export function fitSlide(
  hostW: number,
  hostH: number,
  pad = 0,
): { k: number; x: number; y: number } {
  const W = Math.max(0, hostW - 2 * pad);
  const H = Math.max(0, hostH - 2 * pad);
  const k = Math.max(0.01, Math.min(W / SLIDE_W, H / SLIDE_H));
  return { k, x: (hostW - SLIDE_W * k) / 2, y: (hostH - SLIDE_H * k) / 2 };
}

const RAD = Math.PI / 180;
export function rotatePt(p: Pt, c: Pt, deg: number): Pt {
  if (!deg) return [p[0], p[1]];
  const a = deg * RAD;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return [c[0] + dx * cos - dy * sin, c[1] + dx * sin + dy * cos];
}
/** The four corners of a (rotated) frame: tl, tr, br, bl. */
export function corners(f: BlockFrame): Pt[] {
  const c = centerOf(f);
  const pts: Pt[] = [
    [f.x, f.y],
    [f.x + f.w, f.y],
    [f.x + f.w, f.y + f.h],
    [f.x, f.y + f.h],
  ];
  return pts.map((p) => rotatePt(p, c, f.rot ?? 0));
}
/** Axis-aligned bounds of a (rotated) frame. */
export function aabb(f: BlockFrame): Box {
  if (!f.rot) return boxOf(f);
  const cs = corners(f);
  const xs = cs.map((p) => p[0]);
  const ys = cs.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
export function union(boxes: readonly Box[]): Box | null {
  if (!boxes.length) return null;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
export const boxesIntersect = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
export const boxContains = (outer: Box, inner: Box): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

/** Is p inside the (rotated) frame, with `pad` logical units of tolerance? */
export function frameContains(f: BlockFrame, p: Pt, pad = 0): boolean {
  const q = rotatePt(p, centerOf(f), -(f.rot ?? 0));
  return (
    q[0] >= f.x - pad &&
    q[0] <= f.x + f.w + pad &&
    q[1] >= f.y - pad &&
    q[1] <= f.y + f.h + pad
  );
}

/** Distance from p to the segment ab. */
export function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  const t = L2
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
    : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Paint order: z, then array order. */
export function paintOrder(blocks: readonly SlideBlock[]): SlideBlock[] {
  return blocks
    .map((b, i) => ({ b, i }))
    .sort((p, q) => (p.b.frame.z ?? 0) - (q.b.frame.z ?? 0) || p.i - q.i)
    .map((p) => p.b);
}
/** Reading order for screen readers: readOrder, then top-left first (rows of 40 units). */
export function readingOrder(blocks: readonly SlideBlock[]): SlideBlock[] {
  return [...blocks].sort((a, b) => {
    const ra = a.readOrder ?? Infinity;
    const rb = b.readOrder ?? Infinity;
    if (ra !== rb) return ra - rb;
    const ya = Math.round(a.frame.y / 40);
    const yb = Math.round(b.frame.y / 40);
    return ya - yb || a.frame.x - b.frame.x;
  });
}

/**
 * The topmost block under p (paint order reversed). Locked blocks are skipped unless `withLocked`.
 * Arrows hit along their shaft (± tolerance) rather than over their whole bounding box.
 */
export function hitTest(
  blocks: readonly SlideBlock[],
  p: Pt,
  o: { pad?: number; withLocked?: boolean } = {},
): SlideBlock | null {
  const pad = o.pad ?? 0;
  const order = paintOrder(blocks).reverse();
  for (const b of order) {
    if (b.frame.locked && !o.withLocked) continue;
    if (b.hiddenInEditor) continue;
    if (b.kind === "arrow") {
      if (segDist(p, b.from, b.to) <= Math.max(18, pad + (b.strokeW ?? 4) * 2))
        return b;
      continue;
    }
    if (frameContains(b.frame, p, pad)) return b;
  }
  return null;
}
/** Blocks whose bounds intersect (or, with `contain`, lie inside) a marquee box. */
export function marquee(
  blocks: readonly SlideBlock[],
  m: Box,
  contain = false,
): SlideBlock[] {
  return blocks.filter(
    (b) =>
      !b.frame.locked &&
      !b.hiddenInEditor &&
      (contain
        ? boxContains(m, aabb(b.frame))
        : boxesIntersect(m, aabb(b.frame))),
  );
}
export function normBox(a: Pt, b: Pt): Box {
  return {
    x: Math.min(a[0], b[0]),
    y: Math.min(a[1], b[1]),
    w: Math.abs(a[0] - b[0]),
    h: Math.abs(a[1] - b[1]),
  };
}

// ------------------------------------------------------------------ alignment guides
export interface Guide {
  axis: "x" | "y";
  /** the guide line position */
  at: number;
  /** extent along the other axis (for drawing) */
  from: number;
  to: number;
  kind: "edge" | "center" | "slide";
}
export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}
/**
 * Snap a moving box to the other boxes' edges and centres and to the slide's edges, centre and safe margins,
 * within `threshold` logical units; otherwise to the grid (its top-left corner). Returns the correction to apply
 * and the guides to draw.
 */
export function snapMove(
  moving: Box,
  others: readonly Box[],
  o: { threshold?: number; grid?: number; margin?: number } = {},
): SnapResult {
  const th = o.threshold ?? 10;
  const margin = o.margin ?? 96;
  const xs: { v: number; kind: Guide["kind"]; span: [number, number] }[] = [];
  const ys: { v: number; kind: Guide["kind"]; span: [number, number] }[] = [];
  const full: [number, number] = [0, SLIDE_H];
  const fullX: [number, number] = [0, SLIDE_W];
  for (const v of [0, margin, SLIDE_W / 2, SLIDE_W - margin, SLIDE_W])
    xs.push({ v, kind: "slide", span: full });
  for (const v of [
    0,
    margin * 0.75,
    SLIDE_H / 2,
    SLIDE_H - margin * 0.75,
    SLIDE_H,
  ])
    ys.push({ v, kind: "slide", span: fullX });
  for (const b of others) {
    const sy: [number, number] = [b.y, b.y + b.h];
    const sx: [number, number] = [b.x, b.x + b.w];
    xs.push(
      { v: b.x, kind: "edge", span: sy },
      { v: b.x + b.w, kind: "edge", span: sy },
      { v: b.x + b.w / 2, kind: "center", span: sy },
    );
    ys.push(
      { v: b.y, kind: "edge", span: sx },
      { v: b.y + b.h, kind: "edge", span: sx },
      { v: b.y + b.h / 2, kind: "center", span: sx },
    );
  }
  const mx = [moving.x, moving.x + moving.w / 2, moving.x + moving.w];
  const my = [moving.y, moving.y + moving.h / 2, moving.y + moving.h];
  const best = (cands: typeof xs, mine: number[]) => {
    let d = Infinity;
    let hit: (typeof xs)[number] | null = null;
    for (const c of cands)
      for (const m of mine) {
        const dd = c.v - m;
        if (Math.abs(dd) <= th && Math.abs(dd) < Math.abs(d) - 1e-9) {
          d = dd;
          hit = c;
        }
      }
    return hit ? { d, hit } : null;
  };
  const bx = best(xs, mx);
  const by = best(ys, my);
  const grid = o.grid ?? 0;
  const dx = bx ? bx.d : grid ? snap(moving.x, grid) - moving.x : 0;
  const dy = by ? by.d : grid ? snap(moving.y, grid) - moving.y : 0;
  const guides: Guide[] = [];
  const m2: Box = { ...moving, x: moving.x + dx, y: moving.y + dy };
  if (bx) {
    // every candidate on the snapped line is drawn (two boxes aligned at once)
    const at = bx.hit.v;
    const lines = xs.filter((c) => Math.abs(c.v - at) < 0.5);
    const lo = Math.min(m2.y, ...lines.map((l) => l.span[0]));
    const hi = Math.max(m2.y + m2.h, ...lines.map((l) => l.span[1]));
    guides.push({
      axis: "x",
      at,
      from: bx.hit.kind === "slide" ? 0 : lo,
      to: bx.hit.kind === "slide" ? SLIDE_H : hi,
      kind: bx.hit.kind,
    });
  }
  if (by) {
    const at = by.hit.v;
    const lines = ys.filter((c) => Math.abs(c.v - at) < 0.5);
    const lo = Math.min(m2.x, ...lines.map((l) => l.span[0]));
    const hi = Math.max(m2.x + m2.w, ...lines.map((l) => l.span[1]));
    guides.push({
      axis: "y",
      at,
      from: by.hit.kind === "slide" ? 0 : lo,
      to: by.hit.kind === "slide" ? SLIDE_W : hi,
      kind: by.hit.kind,
    });
  }
  return { dx, dy, guides };
}

// ------------------------------------------------------------------ resize and rotate
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export const HANDLES: readonly Handle[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];
/** Handle position as fractions of the frame. */
export const HANDLE_POS: Record<Handle, Pt> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
};
export interface ResizeOptions {
  /** keep the start aspect ratio (Shift, images, instruments, markers) */
  keepAspect?: boolean;
  /** resize about the centre (Alt) */
  fromCenter?: boolean;
  grid?: number;
  min?: number;
}
/**
 * Resize a frame by dragging `handle` by (dx, dy) in slide units (the drag is mapped into the frame's rotated
 * axes, and the opposite edge or corner stays put on the slide).
 */
export function resizeFrame(
  start: BlockFrame,
  handle: Handle,
  dx: number,
  dy: number,
  o: ResizeOptions = {},
): BlockFrame {
  const min = o.min ?? MIN_SIZE;
  const rot = start.rot ?? 0;
  // the drag in the frame's own axes
  const [ldx, ldy] = rotatePt([dx, dy], [0, 0], -rot);
  const [hx, hy] = HANDLE_POS[handle];
  const sx = hx === 0 ? -1 : hx === 1 ? 1 : 0;
  const sy = hy === 0 ? -1 : hy === 1 ? 1 : 0;
  const k = o.fromCenter ? 2 : 1;
  let w = start.w + sx * ldx * k;
  let h = start.h + sy * ldy * k;
  if (o.grid && !rot) {
    if (sx) w = Math.max(o.grid, snap(w, o.grid));
    if (sy) h = Math.max(o.grid, snap(h, o.grid));
  }
  if (o.keepAspect) {
    const ar = start.w / Math.max(1e-6, start.h);
    if (sx && sy) {
      // the larger relative change wins
      if (Math.abs(w / start.w - 1) >= Math.abs(h / start.h - 1)) h = w / ar;
      else w = h * ar;
    } else if (sx) h = w / ar;
    else w = h * ar;
  }
  w = Math.max(min, w);
  h = Math.max(min, h);
  if (o.keepAspect) {
    const ar = start.w / Math.max(1e-6, start.h);
    if (w / h > ar) w = h * ar;
    else h = w / ar;
    if (w < min) {
      w = min;
      h = w / ar;
    }
    if (h < min) {
      h = min;
      w = h * ar;
    }
  }
  // the anchor (opposite handle, or the centre) stays fixed on the slide
  const c0 = centerOf(start);
  let cx: number;
  let cy: number;
  if (o.fromCenter) {
    cx = c0[0];
    cy = c0[1];
  } else {
    // anchor in local coords relative to the centre
    const ax = sx ? -sx * (start.w / 2) : 0;
    const ay = sy ? -sy * (start.h / 2) : 0;
    const anchor = rotatePt([c0[0] + ax, c0[1] + ay], c0, rot);
    // new centre = anchor + rotated half-size towards the handle (edge handles keep the other axis centred)
    const nx = sx ? sx * (w / 2) : 0;
    const ny = sy ? sy * (h / 2) : 0;
    const off = rotatePt([nx, ny], [0, 0], rot);
    cx = anchor[0] + off[0];
    cy = anchor[1] + off[1];
  }
  return { ...start, x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Rotation for a pointer at p around the frame centre (0° = handle straight up); `step` snaps (Shift = 15°). */
export function rotationAt(f: BlockFrame, p: Pt, step = 0): number {
  const c = centerOf(f);
  let deg = (Math.atan2(p[0] - c[0], -(p[1] - c[1])) * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  if (step > 0) deg = Math.round(deg / step) * step;
  else {
    // a soft magnet at the right angles
    for (const m of [0, 90, 180, 270, 360]) if (Math.abs(deg - m) < 3) deg = m;
  }
  deg = deg % 360;
  return deg > 180 ? deg - 360 : deg;
}

/** Keep a box on the slide (at least `keep` units visible). */
export function keepOnSlide(f: BlockFrame, keep = 48): BlockFrame {
  const x = Math.min(SLIDE_W - keep, Math.max(keep - f.w, f.x));
  const y = Math.min(SLIDE_H - keep, Math.max(keep - f.h, f.y));
  return x === f.x && y === f.y ? f : { ...f, x, y };
}

/** An arrow block's frame from its endpoints (the frame is their bounding box, with room for the heads). */
export function arrowFrame(from: Pt, to: Pt, z: number, pad = 12): BlockFrame {
  const b = normBox(from, to);
  return {
    x: b.x - pad,
    y: b.y - pad,
    w: Math.max(b.w + 2 * pad, MIN_SIZE),
    h: Math.max(b.h + 2 * pad, MIN_SIZE),
    z,
  };
}
/** Map a point from an old frame to a new one (proportional): arrows and callout targets follow a resize. */
export function mapPoint(p: Pt, from: Box, to: Box): Pt {
  const fx = from.w ? (p[0] - from.x) / from.w : 0.5;
  const fy = from.h ? (p[1] - from.y) / from.h : 0.5;
  return [to.x + fx * to.w, to.y + fy * to.h];
}
/** The point at fraction t of a quadratic arrow with bend `curve` (fraction of the length, + = to the left). */
export function arrowControl(from: Pt, to: Pt, curve = 0): Pt {
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const L = Math.hypot(dx, dy) || 1;
  return [mx + (dy / L) * curve * L, my - (dx / L) * curve * L];
}
