// Holding patterns: AIM 5-3-8 entry sectors, clearance phrasing and geometry helpers.
import { norm360, wrap180, destination, toLocal, DEG, type LatLon } from './geo';

export type HoldEntry = 'DIRECT' | 'TEARDROP' | 'PARALLEL';
export type Turn = 'R' | 'L';

export interface HoldDef {
  fix: LatLon & { ident: string };
  /** inbound course (magnetic = true here) */
  inbound: number;
  turn: Turn;
  legMin: number;
  /** altitude to hold at */
  altFt: number;
  /** if defined on a radial: the radial flown inbound (inbound = radial + 180) */
  radial?: number;
  efc?: string;
}

/**
 * Entry from the aircraft's course to the fix (AIM 5-3-8).
 * Sector boundaries: the inbound course through the fix and the 70° line
 * (drawn through the fix at 70° to the inbound course, toward the holding side).
 * With a = course to fix relative to the inbound course (right turns):
 *   direct   a ∈ [-110, +70]   (180° sector)
 *   parallel a ∈ (+70, +180]   (110° sector)
 *   teardrop a ∈ [-180, -110)  (70° sector)
 * Left turns are mirrored.
 */
export function holdEntry(inbound: number, turn: Turn, courseToFix: number): HoldEntry {
  let a = wrap180(courseToFix - inbound);
  if (turn === 'L') a = -a;
  if (a >= -110 && a <= 70) return 'DIRECT';
  if (a > 70) return 'PARALLEL';
  return 'TEARDROP';
}

const CARD = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
export function cardinal(brg: number): string {
  return CARD[Math.round(norm360(brg) / 45) % 8];
}
const pad3 = (n: number) => String(Math.round(norm360(n)) || 360).padStart(3, '0');

/** ATC phraseology: "Hold southwest of ARD on the 225 radial, left turns, …" */
export function clearanceText(h: HoldDef, isVor: boolean): string {
  const outboundSide = norm360(h.inbound + 180); // fix → hold lies along the outbound direction
  const where = `${cardinal(outboundSide).toUpperCase()} of ${h.fix.ident}`;
  const on = isVor ? `on the ${pad3(outboundSide)} radial` : `on the ${pad3(h.inbound)}° inbound course`;
  const turns = h.turn === 'L' ? 'left turns' : 'right turns';
  return `Hold ${where} ${on}, ${turns}, ${h.legMin === 1 ? 'one-minute' : h.legMin + '-minute'} legs, maintain ${h.altFt}. Expect further clearance in ${h.efc ?? '15 minutes'}.`;
}

/** Aircraft position in the hold frame: x along inbound course (fix at 0), y toward the holding side. */
export function holdFrame(h: HoldDef, p: LatLon): { x: number; y: number } {
  const l = toLocal(h.fix, p);
  const c = h.inbound * DEG;
  const x = l.x * Math.sin(c) + l.y * Math.cos(c);
  let y = l.x * Math.cos(c) - l.y * Math.sin(c);
  if (h.turn === 'L') y = -y;
  return { x, y };
}

/** Teardrop outbound course (30° toward the holding side from the outbound course). */
export function teardropCourse(inbound: number, turn: Turn): number {
  return norm360(inbound + 180 - (turn === 'R' ? 30 : -30));
}

/** Racetrack polygon for drawing (true courses). */
export function racetrack(h: HoldDef, gsKt = 90): LatLon[] {
  const R = Math.max(0.4, gsKt / (60 * Math.PI));
  const L = Math.max(1, (gsKt * h.legMin) / 60);
  const s = h.turn === 'R' ? 1 : -1;
  const pts: LatLon[] = [];
  for (let k = 0; k <= 16; k++) pts.push(destination(destination(h.fix, h.inbound + 90 * s, R), h.inbound + s * (-90 + (180 * k) / 16), R));
  for (let k = 0; k <= 16; k++) pts.push(destination(destination(destination(h.fix, h.inbound + 180, L), h.inbound + 90 * s, R), h.inbound + s * (90 + (180 * k) / 16), R));
  return pts;
}
