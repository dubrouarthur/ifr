// Navigation database for the "Ardent Islands" training region.
// The region, airports, navaids and procedures are FICTIONAL and self-consistent,
// placed over the open North Atlantic so they can't be confused with real-world data.
// NOT FOR REAL-WORLD NAVIGATION.
import { destination, FT_PER_NM, distanceNm, bearingDeg, type LatLon } from './geo';
import type { Airport, Approach, Fix, Navaid, ProcLeg, Runway } from './types';

const ft2nm = (ft: number) => ft / FT_PER_NM;

function makeRunwayPair(
  center: LatLon,
  heading: number,
  lengthFt: number,
  widthFt: number,
  elevFt: number,
  ids: [string, string],
): [Runway, Runway] {
  const half = ft2nm(lengthFt / 2);
  const thrA = destination(center, heading + 180, half); // runway `heading` lands from this end
  const thrB = destination(center, heading, half);
  return [
    { id: ids[0], heading, threshold: thrA, end: thrB, lengthFt, widthFt, elevFt, lights: true },
    { id: ids[1], heading: (heading + 180) % 360, threshold: thrB, end: thrA, lengthFt, widthFt, elevFt, lights: true },
  ];
}

// ---------------------------------------------------------------- Airports
const PARD_REF: LatLon = { lat: 47.5, lon: -35.0 };
const pardRwy = [
  ...makeRunwayPair(PARD_REF, 90, 9000, 150, 420, ['09', '27']),
  ...makeRunwayPair(destination(PARD_REF, 200, 0.55), 180, 6500, 100, 420, ['18', '36']),
];

const MSVL_REF: LatLon = destination(PARD_REF, 45, 26);
const msvlRwy = makeRunwayPair(MSVL_REF, 30, 5500, 100, 1150, ['03', '21']);

export const AIRPORTS: Airport[] = [
  {
    icao: 'PARD',
    name: 'PORT ARDENT INTL',
    city: 'PORT ARDENT',
    ...PARD_REF,
    elevFt: 420,
    runways: pardRwy,
    freqs: { atis: 127.65, approach: 119.85, tower: 118.3, ground: 121.9 },
    magVar: 0,
  },
  {
    icao: 'MSVL',
    name: 'MISTRAL VALLEY',
    city: 'MISTRAL',
    ...MSVL_REF,
    elevFt: 1150,
    runways: msvlRwy,
    freqs: { atis: 135.275, ctaf: 122.8, approach: 119.85 },
    magVar: 0,
  },
];

export function airport(icao: string): Airport {
  const a = AIRPORTS.find((x) => x.icao === icao);
  if (!a) throw new Error(`Unknown airport ${icao}`);
  return a;
}
export function runway(icao: string, id: string): Runway {
  const r = airport(icao).runways.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown runway ${icao} ${id}`);
  return r;
}

// ---------------------------------------------------------------- Navaids
const r27 = runway('PARD', '27');
const r09 = runway('PARD', '09');
const r21 = runway('MSVL', '21');

const ARD_POS = destination(PARD_REF, 330, 2.2);
const MSV_POS = destination(r21.threshold, 30, 5.0);

export const NAVAIDS: Navaid[] = [
  { ident: 'ARD', name: 'ARDENT', type: 'VORDME', freq: 114.2, elevFt: 430, dme: true, ...ARD_POS },
  { ident: 'MSV', name: 'MISTRAL', type: 'VORDME', freq: 112.7, elevFt: 1600, dme: true, ...MSV_POS },
  {
    ident: 'IPRD',
    name: 'I-PRD',
    type: 'ILS',
    freq: 110.3,
    elevFt: 420,
    course: 270,
    gsAngle: 3.0,
    tch: 50,
    dme: true,
    runway: '27',
    airport: 'PARD',
    // Localizer antenna 1000 ft beyond the departure end of runway 27
    ...destination(r27.end, 270, ft2nm(1000)),
    // Glideslope antenna ~1000 ft past the threshold
    gsPos: destination(r27.threshold, 270, ft2nm(1000)),
  },
  { ident: 'PA', name: 'PADDY', type: 'NDB', freq: 344, elevFt: 400, ...destination(r27.threshold, 90, 4.5) },
];

export function navaid(ident: string): Navaid {
  const n = NAVAIDS.find((x) => x.ident === ident);
  if (!n) throw new Error(`Unknown navaid ${ident}`);
  return n;
}

// ---------------------------------------------------------------- Fixes
const GS_FT_PER_NM = FT_PER_NM * Math.tan((3 * Math.PI) / 180); // ~318 ft/nm

/** Distance from threshold where a 3° path from TCH reaches altFt */
function distForAlt(altFt: number, elevFt: number, tch = 50): number {
  return (altFt - elevFt - tch) / GS_FT_PER_NM;
}

const fixes: Fix[] = [];
function fix(ident: string, p: LatLon, kind: Fix['kind'] = 'fix'): Fix {
  const f: Fix = { ident, kind, lat: p.lat, lon: p.lon };
  fixes.push(f);
  return f;
}

// ILS 27 (final from the east)
const MARLO = fix('MARLO', destination(r27.threshold, 90, distForAlt(2400, 420)));
const KEDDY = fix('KEDDY', destination(r27.threshold, 90, 11));
const TOBEY = fix('TOBEY', destination(KEDDY, 0, 8));
const SANDR = fix('SANDR', destination(KEDDY, 180, 8));
// RNAV 09 (final from the west)
const PERCH = fix('PERCH', destination(r09.threshold, 270, distForAlt(2100, 420)));
const WILLO = fix('WILLO', destination(r09.threshold, 270, 10));
const LUNKS = fix('LUNKS', destination(WILLO, 0, 7));
const BRAVR = fix('BRAVR', destination(WILLO, 180, 7));
// VOR 21 at MSVL
const GALEN = fix('GALEN', destination(MSV_POS, 30, 10));
const DOPPS = fix('DOPPS', destination(MSV_POS, 210, 2.5));
// Enroute
fix('ORCAS', destination(PARD_REF, 160, 22));
fix('HERON', destination(PARD_REF, 260, 24));
fix('KRILL', destination(MSVL_REF, 330, 15));

const ARD = fix('ARD', ARD_POS, 'vor');
const MSV = fix('MSV', MSV_POS, 'vor');
fix('PA', navaid('PA'), 'ndb');
const RW27 = fix('RW27', r27.threshold, 'runway');
const RW09 = fix('RW09', r09.threshold, 'runway');
const RW21 = fix('RW21', r21.threshold, 'runway');
for (const a of AIRPORTS) fix(a.icao, a, 'airport');

export const FIXES = fixes;

export function findFix(ident: string): Fix | undefined {
  return fixes.find((f) => f.ident === ident.toUpperCase());
}

// ---------------------------------------------------------------- Approaches
function legs(...l: ProcLeg[]): ProcLeg[] {
  for (let i = 1; i < l.length; i++) {
    l[i].dist ??= distanceNm(l[i - 1].fix, l[i].fix);
    l[i].course ??= Math.round(bearingDeg(l[i - 1].fix, l[i].fix));
  }
  return l;
}

export const APPROACHES: Approach[] = [
  {
    id: 'PARD-I27',
    airport: 'PARD',
    name: 'ILS or LOC RWY 27',
    type: 'ILS',
    runway: '27',
    finalCourse: 270,
    navaid: 'IPRD',
    gsAngle: 3.0,
    tch: 50,
    transitions: [
      { name: 'TOBEY', legs: legs({ fix: TOBEY, role: 'IAF', altMin: 4000 }, { fix: KEDDY, role: 'IF', altMin: 3000 }) },
      { name: 'SANDR', legs: legs({ fix: SANDR, role: 'IAF', altMin: 4000 }, { fix: KEDDY, role: 'IF', altMin: 3000 }) },
      { name: 'ARD', legs: legs({ fix: ARD, role: 'IAF', altMin: 4000 }, { fix: KEDDY, role: 'IF', altMin: 3000 }) },
    ],
    final: legs(
      { fix: KEDDY, role: 'IF', altMin: 3000 },
      { fix: MARLO, role: 'FAF', altMin: 2400, course: 270 },
      { fix: RW27, role: 'MAP', course: 270 },
    ),
    missed: legs(
      { fix: RW27 },
      { fix: ARD, role: 'MAHP', altMin: 3000, hold: { inbound: 270, turn: 'R', legMin: 1 } },
    ),
    missedText: 'Climb to 1000 then climbing right turn to 3000 direct ARD VOR/DME and hold.',
    minimums: [
      { label: 'S-ILS 27', da: 670, vis: '1/2', hat: 250 },
      { label: 'S-LOC 27', mda: 900, vis: '3/4', hat: 480 },
      { label: 'CIRCLING', mda: 1000, vis: '1', hat: 580 },
    ],
    msa: { center: 'ARD', alt: 3100 },
    notes: ['Simulated procedure. Not for navigation.', 'DME from I-PRD. Glideslope 3.00°, TCH 50.'],
  },
  {
    id: 'PARD-R09',
    airport: 'PARD',
    name: 'RNAV (GPS) RWY 09',
    type: 'RNAV',
    runway: '09',
    finalCourse: 90,
    gsAngle: 3.0,
    tch: 50,
    transitions: [
      { name: 'LUNKS', legs: legs({ fix: LUNKS, role: 'IAF', altMin: 3500 }, { fix: WILLO, role: 'IF', altMin: 3000 }) },
      { name: 'BRAVR', legs: legs({ fix: BRAVR, role: 'IAF', altMin: 3500 }, { fix: WILLO, role: 'IF', altMin: 3000 }) },
    ],
    final: legs(
      { fix: WILLO, role: 'IAF', altMin: 3000, hold: { inbound: 90, turn: 'L', legMin: 1 } },
      { fix: PERCH, role: 'FAF', altMin: 2100, course: 90 },
      { fix: RW09, role: 'MAP', course: 90 },
    ),
    missed: legs(
      { fix: RW09 },
      { fix: ARD, role: 'MAHP', altMin: 3000, hold: { inbound: 270, turn: 'R', legMin: 1 } },
    ),
    missedText: 'Climb to 3000 direct ARD VOR/DME and hold.',
    minimums: [
      { label: 'LPV', da: 670, vis: '1/2', hat: 250 },
      { label: 'LNAV/VNAV', da: 760, vis: '3/4', hat: 340 },
      { label: 'LNAV', mda: 880, vis: '1', hat: 460 },
    ],
    msa: { center: 'RW09', alt: 3100 },
    notes: ['Simulated procedure. Not for navigation.', 'WILLO hold-in-lieu of procedure turn.'],
  },
  {
    id: 'MSVL-V21',
    airport: 'MSVL',
    name: 'VOR/DME RWY 21',
    type: 'VOR',
    runway: '21',
    finalCourse: 210,
    navaid: 'MSV',
    transitions: [{ name: 'GALEN', legs: legs({ fix: GALEN, role: 'IAF', altMin: 4500 }, { fix: MSV, role: 'FAF', altMin: 3200 }) }],
    final: legs(
      { fix: MSV, role: 'FAF', altMin: 3200 },
      { fix: DOPPS, role: 'STEPDOWN', altMin: 2100, course: 210 },
      { fix: RW21, role: 'MAP', course: 210 },
    ),
    missed: legs({ fix: RW21 }, { fix: MSV, role: 'MAHP', altMin: 4000, hold: { inbound: 210, turn: 'R', legMin: 1 } }),
    missedText: 'Climb to 4000 direct MSV VOR/DME and hold.',
    minimums: [
      { label: 'S-21', mda: 1640, vis: '1', hat: 490 },
      { label: 'CIRCLING', mda: 1740, vis: '1 1/4', hat: 590 },
    ],
    msa: { center: 'MSV', alt: 5200 },
    notes: ['Simulated procedure. Not for navigation.', 'MAP at 5.0 DME / RW21.'],
  },
];

export function approach(id: string): Approach {
  const a = APPROACHES.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown approach ${id}`);
  return a;
}

// ---------------------------------------------------------------- Terrain
/** Ground elevation in ft MSL. Flat near airports, gentle hills elsewhere. */
export function groundElevation(p: LatLon): number {
  let wSum = 0;
  let eSum = 0;
  let nearest = Infinity;
  for (const a of AIRPORTS) {
    const d = Math.max(0.05, distanceNm(p, a));
    nearest = Math.min(nearest, d);
    const w = 1 / (d * d);
    wSum += w;
    eSum += w * a.elevFt;
  }
  const base = eSum / wSum;
  // Rolling hills fading out within 4 nm of any airport
  const fade = Math.min(1, Math.max(0, (nearest - 4) / 6));
  const hills =
    250 * (1 + Math.sin(p.lat * 37.1) * Math.cos(p.lon * 23.3)) + 150 * (1 + Math.sin(p.lat * 91 + p.lon * 57));
  return Math.max(0, base + fade * hills * 0.9);
}
