// Crops of a full instrument drawing: show one region of a 1024 × 768 logical display (the HSI of the six-pack,
// the attitude part of the PFD…) in a smaller pane, by translate / scale / clip around the renderer's own draw.
// The renderer is unchanged and draws its whole display; only the region shows. Used by the course stage
// (`gauge` panes) and by anything that needs a zoom on one instrument. Pure canvas: no DOM, no three.js.

/** [x, y, w, h] in the source drawing's logical coordinates (1024 × 768 for every cockpit display). */
export type CropRect = [x: number, y: number, w: number, h: number];

export const LOGICAL_W = 1024;
export const LOGICAL_H = 768;

export interface CropOptions {
  /** where the crop lands, in the target context's current coordinates (default: the full logical pane) */
  dest?: CropRect;
  /** 'contain' keeps the aspect ratio and centres the region (default); 'fill' stretches it to dest */
  fit?: "contain" | "fill";
  /** fill under the drawing (the letterbox bands with 'contain'); default: transparent */
  background?: string;
}

export interface CropTransform {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

/** The mapping source logical → target: target = (source × s) + t. */
export function cropTransform(
  rect: CropRect,
  dest: CropRect = [0, 0, LOGICAL_W, LOGICAL_H],
  fit: "contain" | "fill" = "contain",
): CropTransform {
  const [rx, ry, rw, rh] = rect;
  const [dx, dy, dw, dh] = dest;
  const w = Math.max(1e-6, rw);
  const h = Math.max(1e-6, rh);
  if (fit === "fill") {
    const sx = dw / w;
    const sy = dh / h;
    return { sx, sy, tx: dx - rx * sx, ty: dy - ry * sy };
  }
  const k = Math.min(dw / w, dh / h);
  const ox = dx + (dw - w * k) / 2;
  const oy = dy + (dh - h * k) / 2;
  return { sx: k, sy: k, tx: ox - rx * k, ty: oy - ry * k };
}

/** Source logical point → target point (for annotations placed on the full drawing). */
export function cropToTarget(
  t: CropTransform,
  x: number,
  y: number,
): [number, number] {
  return [x * t.sx + t.tx, y * t.sy + t.ty];
}
/** Target point → source logical point (hit tests on a cropped pane). */
export function targetToSource(
  t: CropTransform,
  x: number,
  y: number,
): [number, number] {
  return [(x - t.tx) / t.sx, (y - t.ty) / t.sy];
}

/**
 * Draw `draw` (a full-display renderer, e.g. `(c) => drawSixPack(c, sim, 0, st)`) so that only `rect` of its
 * logical drawing shows, scaled into `dest`. The context's transform, clip and state are restored afterwards.
 * Returns the transform used (for overlays and hit tests).
 */
export function drawCropped(
  ctx: CanvasRenderingContext2D,
  draw: (ctx: CanvasRenderingContext2D) => void,
  rect: CropRect,
  opts: CropOptions = {},
): CropTransform {
  const dest = opts.dest ?? [0, 0, LOGICAL_W, LOGICAL_H];
  const t = cropTransform(rect, dest, opts.fit ?? "contain");
  ctx.save();
  ctx.beginPath();
  ctx.rect(dest[0], dest[1], dest[2], dest[3]);
  ctx.clip();
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(dest[0], dest[1], dest[2], dest[3]);
  }
  // clip to the region itself too: with 'contain', the rest of the drawing must not show in the letterbox bands
  const [a, b] = cropToTarget(t, rect[0], rect[1]);
  ctx.beginPath();
  ctx.rect(a, b, rect[2] * t.sx, rect[3] * t.sy);
  ctx.clip();
  ctx.transform(t.sx, 0, 0, t.sy, t.tx, t.ty);
  try {
    draw(ctx);
  } finally {
    ctx.restore();
  }
  return t;
}
