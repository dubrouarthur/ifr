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
 * Entry from the aircraft's course to the fix (AIM 5-3-8, FIG 5-3-8).
 * Sector boundaries: the holding course line through the fix, and the 70° line drawn through the fix
 * at 70° to the OUTBOUND course on the holding side.
 * With a = course to fix relative to the inbound course (right turns, positive = clockwise):
 *   direct   a ∈ [-70, +110]    (180° sector: e.g. inbound 360, arriving heading 090 from the non-holding
 *                                 side — a 90° right turn at the fix puts you outbound on the holding side)
 *   teardrop a ∈ (+110, +180]   (70° sector: arriving roughly along the outbound course, from the
 *                                 non-holding side of it)
 *   parallel a ∈ [-180, -70)    (110° sector: arriving from the holding side, heading away from it)
 * A course exactly on a boundary takes the direct entry (either entry is acceptable within 5°: AIM 5-3-8 j).
 * Left turns are mirrored.
 */
export function holdEntry(inbound: number, turn: Turn, courseToFix: number): HoldEntry {
  let a = wrap180(courseToFix - inbound);
  if (turn === 'L') a = -a;
  if (a >= -70 && a <= 110) return 'DIRECT';
  if (a > 110) return 'TEARDROP';
  return 'PARALLEL';
}

/** entries a pilot may fly: the correct one, plus the neighbouring one within 5° of a sector boundary */
export function acceptableEntries(inbound: number, turn: Turn, courseToFix: number): HoldEntry[] {
  const set = new Set<HoldEntry>([
    holdEntry(inbound, turn, courseToFix),
    holdEntry(inbound, turn, courseToFix - 5),
    holdEntry(inbound, turn, courseToFix + 5),
  ]);
  return [...set];
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

/** The entry sector a course to the fix falls in, and how far it is from the nearest sector boundary. */
export interface EntrySector {
  entry: HoldEntry;
  /** course to the fix relative to the inbound course, −180..180 (+ = towards the holding side's turn) */
  rel: number;
  /** degrees to the nearest boundary (the 70° line, its extension or the inbound course's reciprocal) */
  margin: number;
  /** the boundary nearest the course, as a course to the fix */
  boundary: number;
  /** the entries a pilot may fly (the neighbour too within 5° of a boundary: AIM 5-3-8 j / ICAO Doc 8168) */
  either: HoldEntry[];
}
/**
 * The sector of a course to the fix (AIM FIG 5-3-8): direct 180°, teardrop 70°, parallel 110°. The three boundaries
 * are courses to the fix of inbound + 110 (the 70° line, direct / teardrop), inbound − 70 (its extension, direct /
 * parallel) and inbound + 180 (the outbound course, teardrop / parallel); mirrored for left turns. Pure.
 */
export function entrySector(inbound: number, turn: Turn, courseToFix: number): EntrySector {
  const s = turn === 'L' ? -1 : 1;
  const rel = wrap180(courseToFix - inbound) * s;
  const bounds = [110, -70, 180];
  let best = bounds[0];
  let margin = Infinity;
  for (const b of bounds) {
    const d = Math.abs(wrap180(rel - b));
    if (d < margin) [best, margin] = [b, d];
  }
  return {
    entry: holdEntry(inbound, turn, courseToFix),
    rel,
    margin,
    boundary: norm360(inbound + best * s),
    either: acceptableEntries(inbound, turn, courseToFix),
  };
}
