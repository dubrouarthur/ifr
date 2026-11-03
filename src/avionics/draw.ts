// Canvas helpers shared by PFD / MFD / out-the-window renderers.
export const FONT = "'Roboto Condensed', 'Arial Narrow', Arial, sans-serif";
export const C = {
  cyan: '#00e4ff',
  magenta: '#ff40ff',
  green: '#00ff3c',
  white: '#ffffff',
  yellow: '#ffe600',
  red: '#ff2a2a',
  amber: '#ffb000',
  gray: '#9aa0a6',
  black: '#000000',
  panel: 'rgba(0,0,0,0.55)',
};

export function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color = C.white,
  size = 18,
  align: CanvasTextAlign = 'left',
  weight = 600,
) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

export function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = C.panel, stroke?: string) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
}

export function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color = C.white, w = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

export function poly(ctx: CanvasRenderingContext2D, pts: [number, number][], fill?: string, stroke?: string, w = 1.5) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = w;
    ctx.stroke();
  }
}

export const pad3 = (n: number) => String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, '0');
export const fmtFreq = (f: number) => f.toFixed(2);

/** Resize a canvas for crisp rendering at a fixed logical size. Returns the scale. */
export function fitCanvas(canvas: HTMLCanvasElement, logicalW: number, logicalH: number): number {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(1.75, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(w / logicalW, 0, 0, h / logicalH, 0, 0);
  return w / logicalW;
}
