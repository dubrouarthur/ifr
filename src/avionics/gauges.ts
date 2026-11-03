// Shared drawing primitives for round ("steam") instruments.
import { FONT } from './draw';

export const G = {
  face: '#141516',
  ink: '#f2f2ee',
  dim: '#a9aba6',
  needle: '#f7f7f2',
  green: '#1fbf4a',
  yellow: '#f0c419',
  red: '#e2312c',
  white: '#f2f2ee',
  orange: '#ff8a1a',
  sky: '#2f7fd8',
  ground: '#7a4b1f',
};

export function bezel(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r * 1.12);
  g.addColorStop(0, '#5a5e63');
  g.addColorStop(0.6, '#2a2d31');
  g.addColorStop(1, '#0e0f10');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
  ctx.fill();
  // mounting screws
  ctx.fillStyle = '#3c4045';
  for (const a of [45, 135, 225, 315]) {
    const x = cx + Math.cos((a * Math.PI) / 180) * r * 1.2;
    const y = cy + Math.sin((a * Math.PI) / 180) * r * 1.2;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a1c1e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x + 4, y);
    ctx.stroke();
  }
  ctx.fillStyle = G.face;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

export function glass(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const g = ctx.createLinearGradient(cx - r, cy - r, cx + r * 0.3, cy + r * 0.3);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.02)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

export function gtext(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color = G.ink, align: CanvasTextAlign = 'center', weight = 600) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

/** angle in radians (canvas convention: 0 = 3 o'clock, clockwise positive) */
export function tick(ctx: CanvasRenderingContext2D, cx: number, cy: number, a: number, r1: number, r2: number, w = 2, color = G.ink) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
  ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
  ctx.stroke();
}

export function arcBand(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, a0: number, a1: number, w: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a1);
  ctx.stroke();
}

export function needle(ctx: CanvasRenderingContext2D, cx: number, cy: number, a: number, len: number, w: number, tail = 0.18, color = G.needle) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(a);
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.moveTo(-len * tail, -w * 0.7);
  ctx.lineTo(len * 0.85, -w / 2);
  ctx.lineTo(len, 0);
  ctx.lineTo(len * 0.85, w / 2);
  ctx.lineTo(-len * tail, w * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function hub(ctx: CanvasRenderingContext2D, cx: number, cy: number, r = 9) {
  const g = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, r);
  g.addColorStop(0, '#777');
  g.addColorStop(1, '#151515');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
}

/** red warning flag (OFF, NAV, GS, HDG...); `k` scales it (0.8 for the small GS flag inside an HSI) */
export function flag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color = G.red, k = 1) {
  const w = 46 * k;
  const h = 20 * k;
  ctx.fillStyle = color;
  ctx.fillRect(x - w / 2, y - h / 2, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - w / 2 + 0.5, y - h / 2 + 0.5, w - 1, h - 1);
  gtext(ctx, text, x, y + 1, Math.round(14 * k), '#fff', 'center', 800);
}

export function lcd(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#060807';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

/** seven-segment-ish readout */
export function led(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left') {
  ctx.font = `700 ${size}px 'Roboto Mono', 'Courier New', monospace`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.fillText(s, x, y);
  ctx.shadowBlur = 0;
}
