// Shared drawing primitives for round ("steam") instruments.
import { FONT } from './draw';
import type { Sim } from '../sim/sim';
import type { Annunciator, ElecFlags, SystemsState } from '../sim/systemsTypes';

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

// ------------------------------------------------------------------ aircraft systems as the displays show them
// Shared by the G1000 (pfd.ts / mfd.ts), the steam panel (steam.ts) and the airliner displays (airliner.ts).
// Every reader tolerates a Sim without a systems model (older tests, stubs): it then shows a normal aircraft.

/** the systems readout, or null when the Sim has none (stubs) */
export function sysOf(sim: Sim): SystemsState | null {
  return (sim as { sys?: SystemsState }).sys ?? null;
}

/** is this consumer powered? (true without a systems model) */
export function hasPower(sim: Sim, k: keyof ElecFlags): boolean {
  const e = sysOf(sim)?.elec;
  return e ? e[k] !== false : true;
}

/** is this annunciator lit? */
export function annLit(sim: Sim, a: Annunciator): boolean {
  return !!sysOf(sim)?.annunciators.includes(a);
}

/** true when the pitot-static system is not plain (blocked / iced pitot, blocked static, alternate static open) */
export function pitotStaticFault(sim: Sim): boolean {
  const s = sysOf(sim);
  const f = sim.failures as Partial<Record<string, boolean>>;
  const sw = (sim as { sw?: { altStatic?: boolean } }).sw;
  return !!(f.pitotBlocked || f.pitotIcing || f.staticBlocked || sw?.altStatic || (s && s.pitotIce > 0.001));
}

/** Air data as the pitot-static instruments read it (airspeed, altitude for the set baro, vertical speed). With a
 *  healthy system this is the live aircraft data (no one-frame lag); with a pitot-static fault it is what the
 *  systems model computed (an iced pitot reads low, a blocked static port freezes the altimeter…). */
export function airDataShown(sim: Sim): { iasKt: number; altFt: number; vsFpm: number } {
  const d = sim.ac.data;
  const s = sysOf(sim);
  if (s && pitotStaticFault(sim)) return { iasKt: s.indicated.iasKt, altFt: sim.indicatedAlt(), vsFpm: s.indicated.vsFpm };
  return { iasKt: d.iasKt, altFt: sim.indicatedAlt(), vsFpm: d.vsFpm };
}

/** Attitude and heading of the vacuum gyros (steam AI / DG, G1000 standby attitude): drift and topple after a
 *  vacuum failure. Falls back to the true attitude without a systems model. */
export function vacuumGyro(sim: Sim): { pitchDeg: number; rollDeg: number; hdgDeg: number } {
  const g = sysOf(sim)?.gyro;
  const d = sim.ac.data;
  return g ? g : { pitchDeg: d.pitchDeg, rollDeg: d.rollDeg, hdgDeg: d.hdgTrue };
}

/** Small panel shake (logical px) from engine roughness: a rough magneto or an engine about to seize is felt in
 *  the instruments. Deterministic in time, ≤ 2.5 px, nothing for a smooth engine. */
export function panelShake(sim: Sim, tSec: number): { dx: number; dy: number } {
  const v = sysOf(sim)?.vibration ?? 0;
  if (!(v > 0.05)) return { dx: 0, dy: 0 };
  const a = Math.min(2.5, v * 2.8);
  return { dx: a * Math.sin(tSec * 53.1) * Math.sin(tSec * 7.3), dy: a * 0.7 * Math.sin(tSec * 61.7 + 1.3) };
}

/** An unpowered display: black glass with a faint reflection of the cockpit (no data, no labels). */
export function darkScreen(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.fillStyle = '#030405';
  ctx.fillRect(0, 0, w, h);
  // the glass catches a little light from the side window: one soft diagonal sheen
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(255,255,255,0.045)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.012)');
  g.addColorStop(0.36, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** Cabin smoke (electrical fire, or an engine fire with the cabin heat open) veils every instrument a little: the
 *  pilot's first cue in a cockpit with no smoke annunciator. Grey, translucent, slowly moving; drawn last, over a
 *  dark screen too (the smoke does not need power). Nothing without smoke. `tSec` drives the slow drift. */
export function smokeHaze(ctx: CanvasRenderingContext2D, sim: Sim, w: number, h: number, tSec = 0) {
  const s = sysOf(sim)?.smokeLevel ?? 0;
  if (!(s > 0.03)) return;
  // dense enough to read as smoke at a glance (≈ 0.65 smoke level dims the screens by half), never a blackout:
  // the instruments stay readable through it
  const a = Math.min(0.6, s * 0.8);
  ctx.save();
  ctx.fillStyle = `rgba(178,176,170,${(a * 0.72).toFixed(3)})`;
  ctx.fillRect(0, 0, w, h);
  // three denser wisps drifting across the panel
  for (let i = 0; i < 3; i++) {
    const cx = w * (0.5 + 0.4 * Math.sin(tSec * (0.05 + i * 0.03) + i * 2.1));
    const cy = h * (0.45 + 0.32 * Math.sin(tSec * (0.04 + i * 0.02) + i * 1.3));
    const r = Math.max(w, h) * (0.3 + i * 0.12);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(196,194,188,${(a * 0.7).toFixed(3)})`);
    g.addColorStop(1, 'rgba(196,194,188,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}
