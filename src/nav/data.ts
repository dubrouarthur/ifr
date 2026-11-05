// Navigation database for the "Ardent Islands" training region.
// The region, airports, navaids and procedures are FICTIONAL and self-consistent,
// placed over the open North Atlantic so they can't be confused with real-world data.
// NOT FOR REAL-WORLD NAVIGATION.
import { destination, FT_PER_NM, distanceNm, bearingDeg, type LatLon } from './geo';
import type { Airport, Approach, AirwaySeg, Fix, Navaid, ProcLeg, Runway, TerminalProc } from './types';

const ft2nm = (ft: number) => ft / FT_PER_NM;
/** set once the module is initialised: lookups fall back to the training region while a real region is loaded */
let TRAIN: { airports: Airport[]; navaids: Navaid[]; approaches: Approach[] } | null = null;

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
  const a = AIRPORTS.find((x) => x.icao === icao) ?? TRAIN?.airports.find((x) => x.icao === icao);
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

const r36 = runway('PARD', '36');
const r03n = runway('MSVL', '03');
// LDA 36: offset localizer, course 016, passes 1.3 NM SSW of the RWY 36 threshold
const LDA_MAP_POS = destination(r36.threshold, 200, 1.3);
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
  {
    ident: 'IMSV',
    name: 'I-MSV',
    type: 'ILS',
    freq: 111.1,
    elevFt: 1150,
    course: 30,
    gsAngle: 3.0,
    tch: 50,
    dme: true,
    runway: '03',
    airport: 'MSVL',
    ...destination(r03n.end, 30, ft2nm(1000)),
    gsPos: destination(r03n.threshold, 30, ft2nm(1000)),
  },
  {
    ident: 'IADN',
    name: 'I-ADN',
    type: 'LOC',
    freq: 109.5,
    elevFt: 420,
    course: 16,
    dme: true,
    runway: '36',
    airport: 'PARD',
    ...destination(LDA_MAP_POS, 16, 4.2),
  },
  { ident: 'PA', name: 'PADDY', type: 'NDB', freq: 344, elevFt: 400, ...destination(r27.threshold, 90, 4.5) },
];

export function navaid(ident: string): Navaid {
  const n = NAVAIDS.find((x) => x.ident === ident) ?? TRAIN?.navaids.find((x) => x.ident === ident);
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
// LOC BC 09 (final from the west on the back course)
const BACKY = fix('BACKY', destination(r09.threshold, 270, 5));
// RNAV 03 at MSVL (final from the south-west)
const r03 = runway('MSVL', '03');
const CRAGG = fix('CRAGG', destination(r03.threshold, 210, distForAlt(2900, 1150)));
const FENNY = fix('FENNY', destination(r03.threshold, 210, 10));
const TALUS = fix('TALUS', destination(FENNY, 120, 6));
const SCREE = fix('SCREE', destination(FENNY, 300, 6));
// LDA 36 at PARD (final from the south-southwest, offset 16°)
const LDAMP = fix('ADNAP', LDA_MAP_POS);
const NIXIE = fix('NIXIE', destination(LDA_MAP_POS, 196, 4.5));
const OSPRY = fix('OSPRY', destination(LDA_MAP_POS, 196, 10));
const GULLS = fix('GULLS', destination(destination(LDA_MAP_POS, 196, 10), 286, 6));
// VOR 21 at MSVL
const GALEN = fix('GALEN', destination(MSV_POS, 30, 10));
const TOMAS = fix('TOMAS', destination(MSV_POS, 100, 10));
const DOPPS = fix('DOPPS', destination(MSV_POS, 210, 2.5));
// Enroute
fix('ORCAS', destination(PARD_REF, 160, 22));
fix('HERON', destination(PARD_REF, 260, 24));
fix('KRILL', destination(MSVL_REF, 330, 15));

const ARD = fix('ARD', ARD_POS, 'vor');
const MSV = fix('MSV', MSV_POS, 'vor');
const PA = fix('PA', navaid('PA'), 'ndb');
const RW27 = fix('RW27', r27.threshold, 'runway');
const RW09 = fix('RW09', r09.threshold, 'runway');
const RW21 = fix('RW21', r21.threshold, 'runway');
const RW03 = fix('RW03', r03.threshold, 'runway');
function findFixRaw(id: string) {
  return fixes.find((f) => f.ident === id)!;
}
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
    category: 'Precision',
    difficulty: 1,
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
      { label: 'S-ILS 27 CAT II', da: 520, vis: 'RVR 1200', hat: 100 },
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
    category: 'APV',
    difficulty: 1,
    runway: '09',
    finalCourse: 90,
    gsAngle: 3.0,
    tch: 50,
    transitions: [
      { name: 'LUNKS', legs: legs({ fix: LUNKS, role: 'IAF', altMin: 3500 }, { fix: WILLO, role: 'IF', altMin: 3000 }) },
      { name: 'BRAVR', legs: legs({ fix: BRAVR, role: 'IAF', altMin: 3500 }, { fix: WILLO, role: 'IF', altMin: 3000 }) },
      { name: 'WILLO (HILPT)', legs: [{ fix: WILLO, role: 'IAF', altMin: 3000, hold: { inbound: 90, turn: 'L', legMin: 1 }, hilpt: true }] },
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
    category: 'Non-precision',
    difficulty: 2,
    runway: '21',
    finalCourse: 210,
    navaid: 'MSV',
    transitions: [
      { name: 'GALEN', legs: legs({ fix: GALEN, role: 'IAF', altMin: 4500 }, { fix: MSV, role: 'FAF', altMin: 3200 }) },
      {
        name: 'TOMAS (10 DME ARC)',
        legs: legs(
          { fix: TOMAS, role: 'IAF', altMin: 4500 },
          { fix: GALEN, role: 'IF', altMin: 4500, arc: { center: 'MSV', radius: 10, dir: 'L' }, dist: (70 * Math.PI * 10) / 180 },
          { fix: MSV, role: 'FAF', altMin: 3200 },
        ),
      },
    ],
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
    notes: ['Simulated procedure. Not for navigation.', 'TOMAS: 10 DME arc MSV R-100 to R-030 (lead R-035).', 'MAP at 5.0 DME / RW21.'],
  },
  {
    id: 'PARD-B09',
    airport: 'PARD',
    name: 'LOC BC RWY 09',
    type: 'LOCBC',
    category: 'Non-precision',
    difficulty: 3,
    runway: '09',
    finalCourse: 90,
    crsSetting: 270,
    navaid: 'IPRD',
    transitions: [
      { name: 'LUNKS', legs: legs({ fix: LUNKS, role: 'IAF', altMin: 3500 }, { fix: WILLO, role: 'IF', altMin: 3000 }) },
      { name: 'BRAVR', legs: legs({ fix: BRAVR, role: 'IAF', altMin: 3500 }, { fix: WILLO, role: 'IF', altMin: 3000 }) },
    ],
    final: legs(
      { fix: WILLO, role: 'IF', altMin: 3000 },
      { fix: BACKY, role: 'FAF', altMin: 2000, course: 90 },
      { fix: RW09, role: 'MAP', course: 90 },
    ),
    missed: legs({ fix: RW09 }, { fix: ARD, role: 'MAHP', altMin: 3000, hold: { inbound: 270, turn: 'R', legMin: 1 } }),
    missedText: 'Climb to 3000 direct ARD VOR/DME and hold.',
    minimums: [
      { label: 'S-BC 09', mda: 860, vis: '3/4', hat: 440 },
      { label: 'CIRCLING', mda: 1000, vis: '1', hat: 580 },
    ],
    msa: { center: 'ARD', alt: 3100 },
    notes: ['Simulated procedure. Not for navigation.', 'Set HSI course to 270 (front course).', 'Glideslope unusable. MAP at RW09.'],
  },
  {
    id: 'PARD-N27',
    airport: 'PARD',
    name: 'NDB RWY 27',
    type: 'NDB',
    category: 'Non-precision',
    difficulty: 3,
    runway: '27',
    finalCourse: 270,
    navaid: 'PA',
    transitions: [
      { name: 'TOBEY', legs: legs({ fix: TOBEY, role: 'IAF', altMin: 4000 }, { fix: KEDDY, role: 'IF', altMin: 3000 }) },
      { name: 'SANDR', legs: legs({ fix: SANDR, role: 'IAF', altMin: 4000 }, { fix: KEDDY, role: 'IF', altMin: 3000 }) },
      { name: 'PA (PROC TURN)', joinFaf: true, legs: [{ fix: PA, role: 'IAF', altMin: 2500, pt: { outbound: 90, side: 'L', withinNm: 10 } }] },
    ],
    final: legs(
      { fix: KEDDY, role: 'IF', altMin: 3000 },
      { fix: PA, role: 'FAF', altMin: 1800, course: 270 },
      { fix: RW27, role: 'MAP', course: 270 },
    ),
    missed: legs({ fix: RW27 }, { fix: ARD, role: 'MAHP', altMin: 3000, hold: { inbound: 270, turn: 'R', legMin: 1 } }),
    missedText: 'Climb to 3000 direct ARD VOR/DME and hold.',
    minimums: [
      { label: 'S-27', mda: 1000, vis: '1 1/4', hat: 580 },
      { label: 'CIRCLING', mda: 1080, vis: '1 1/2', hat: 660 },
    ],
    msa: { center: 'PA', alt: 3100 },
    notes: ['Simulated procedure. Not for navigation.', 'ADF required. Procedure turn N of crs, 045°/225°, remain within 10 NM.', 'MAP 4.5 NM from PA NDB (FAF to MAP 3:00 @ 90 KT).'],
  },
  {
    id: 'MSVL-R03',
    airport: 'MSVL',
    name: 'RNAV (GPS) RWY 03',
    type: 'RNAV',
    category: 'APV',
    difficulty: 2,
    runway: '03',
    finalCourse: 30,
    gsAngle: 3.0,
    tch: 50,
    transitions: [
      { name: 'TALUS', legs: legs({ fix: TALUS, role: 'IAF', altMin: 4000 }, { fix: FENNY, role: 'IF', altMin: 3600 }) },
      { name: 'SCREE', legs: legs({ fix: SCREE, role: 'IAF', altMin: 4000 }, { fix: FENNY, role: 'IF', altMin: 3600 }) },
    ],
    final: legs(
      { fix: FENNY, role: 'IF', altMin: 3600 },
      { fix: CRAGG, role: 'FAF', altMin: 2900, course: 30 },
      { fix: RW03, role: 'MAP', course: 30 },
    ),
    missed: legs({ fix: RW03 }, { fix: MSV, role: 'MAHP', altMin: 4500, hold: { inbound: 210, turn: 'R', legMin: 1 } }),
    missedText: 'Climb to 4500 direct MSV VOR/DME and hold.',
    minimums: [
      { label: 'LNAV/VNAV', da: 1500, vis: '1', hat: 350 },
      { label: 'LNAV', mda: 1620, vis: '1', hat: 470 },
      { label: 'CIRCLING', mda: 1740, vis: '1 1/4', hat: 590 },
    ],
    msa: { center: 'MSV', alt: 5200 },
    notes: ['Simulated procedure. Not for navigation.', 'LPV not authorized. Baro-VNAV / WAAS glidepath 3.00°.'],
  },
  {
    id: 'MSVL-I03',
    airport: 'MSVL',
    name: 'ILS RWY 03',
    type: 'ILS',
    category: 'Precision',
    difficulty: 2,
    runway: '03',
    finalCourse: 30,
    navaid: 'IMSV',
    gsAngle: 3.0,
    tch: 50,
    transitions: [
      { name: 'TALUS', legs: legs({ fix: TALUS, role: 'IAF', altMin: 4000 }, { fix: FENNY, role: 'IF', altMin: 3600 }) },
      { name: 'SCREE', legs: legs({ fix: SCREE, role: 'IAF', altMin: 4000 }, { fix: FENNY, role: 'IF', altMin: 3600 }) },
    ],
    final: legs(
      { fix: FENNY, role: 'IF', altMin: 3600 },
      { fix: CRAGG, role: 'FAF', altMin: 2900, course: 30 },
      { fix: RW03, role: 'MAP', course: 30 },
    ),
    missed: legs({ fix: RW03 }, { fix: MSV, role: 'MAHP', altMin: 4500, hold: { inbound: 210, turn: 'R', legMin: 1 } }),
    missedText: 'Climb to 4500 direct MSV VOR/DME and hold.',
    minimums: [
      { label: 'S-ILS 03', da: 1400, vis: '3/4', hat: 250 },
      { label: 'S-LOC 03', mda: 1640, vis: '1', hat: 490 },
      { label: 'CIRCLING', mda: 1740, vis: '1 1/4', hat: 590 },
    ],
    msa: { center: 'MSV', alt: 5200 },
    notes: ['Simulated procedure. Not for navigation.', 'Rising terrain north-east: missed approach climb gradient 250 ft/NM to 2500.', 'DME from I-MSV. GS 3.00°, TCH 50.'],
  },
  {
    id: 'PARD-L36',
    airport: 'PARD',
    name: 'LDA/DME RWY 36',
    type: 'LDA',
    category: 'Non-precision',
    difficulty: 3,
    runway: '36',
    finalCourse: 16,
    navaid: 'IADN',
    transitions: [
      { name: 'GULLS', legs: legs({ fix: GULLS, role: 'IAF', altMin: 3500 }, { fix: OSPRY, role: 'IF', altMin: 3000 }) },
      { name: 'ORCAS', legs: legs({ fix: findFixRaw('ORCAS'), role: 'IAF', altMin: 3500 }, { fix: OSPRY, role: 'IF', altMin: 3000 }) },
    ],
    final: legs(
      { fix: OSPRY, role: 'IF', altMin: 3000 },
      { fix: NIXIE, role: 'FAF', altMin: 2100, course: 16 },
      { fix: LDAMP, role: 'MAP', course: 16 },
    ),
    missed: legs({ fix: LDAMP }, { fix: ARD, role: 'MAHP', altMin: 3000, hold: { inbound: 270, turn: 'R', legMin: 1 } }),
    missedText: 'Climb to 3000 direct ARD VOR/DME and hold.',
    minimums: [
      { label: 'S-LDA 36', mda: 800, vis: '1', hat: 380 },
      { label: 'CIRCLING', mda: 1000, vis: '1 1/4', hat: 580 },
    ],
    msa: { center: 'ARD', alt: 3100 },
    notes: ['Simulated procedure. Not for navigation.', 'LDA course 016° is offset 16° from the runway: manoeuvre visually at ADNAP (MAP).', 'DME from I-ADN.'],
  },
];

/** the approach, or undefined when it is not resolvable (a real-world plate whose region is not loaded) */
export function findApproach(id: string): Approach | undefined {
  return APPROACHES.find((x) => x.id === id) ?? TRAIN?.approaches.find((x) => x.id === id);
}

export function approach(id: string): Approach {
  // the training-region catalogue stays resolvable while a real-world region is loaded
  const a = APPROACHES.find((x) => x.id === id) ?? TRAIN?.approaches.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown approach ${id}`);
  return a;
}

// ---------------------------------------------------------------- Terrain
// The Ardent Islands: two main islands joined by an isthmus, a ridge north-east of Mistral Valley,
// flat ground around each airport, sea (0 ft) elsewhere.
const ISLANDS: { c: LatLon; r: number }[] = [
  { c: PARD_REF, r: 15 },
  { c: destination(PARD_REF, 45, 26), r: 17 },
  { c: destination(PARD_REF, 45, 13), r: 9 },
  { c: destination(PARD_REF, 200, 14), r: 7 },
  { c: destination(PARD_REF, 300, 12), r: 6 },
];
const RIDGE = { c: destination(destination(PARD_REF, 45, 26), 352, 16), along: 80, len: 8, width: 3, peak: 2000 };

function smooth(e0: number, e1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------- real-world region hook
/** When a real-world region is loaded, terrain comes from a DEM provider instead of the island model. */
export interface TerrainProvider {
  elev(p: LatLon): number; // ft MSL
  land(p: LatLon): number; // 0 sea .. 1 land
}
let provider: TerrainProvider | null = null;
/** bumped whenever the terrain under the aircraft may have changed (region loaded, late terrain tiles) */
export let terrainEpoch = 0;
export function setTerrainProvider(p: TerrainProvider | null) {
  provider = p;
  terrainEpoch++;
}
export function terrainProviderActive(): boolean {
  return provider !== null;
}
/** Snapshot of the built-in training region (restored when leaving a real-world flight). */
export const TRAINING_REGION = { airports: [...AIRPORTS], navaids: [...NAVAIDS], fixes: [...FIXES], approaches: [...APPROACHES] };
TRAIN = TRAINING_REGION;
/** SIDs and STARs of the loaded region (real world only; the training region has none) */
export const TERMINAL: TerminalProc[] = [];
/** enroute airway segments of the loaded region (real world, US) */
export const AIRWAYS: AirwaySeg[] = [];
export function replaceNavData(d: { airports: Airport[]; navaids: Navaid[]; fixes: Fix[]; approaches: Approach[]; terminal?: TerminalProc[]; airways?: AirwaySeg[] }) {
  TERMINAL.splice(0, TERMINAL.length, ...(d.terminal ?? []));
  AIRWAYS.splice(0, AIRWAYS.length, ...(d.airways ?? []));
  AIRPORTS.splice(0, AIRPORTS.length, ...d.airports);
  NAVAIDS.splice(0, NAVAIDS.length, ...d.navaids);
  FIXES.splice(0, FIXES.length, ...d.fixes);
  APPROACHES.splice(0, APPROACHES.length, ...d.approaches);
}
export function restoreTrainingRegion() {
  replaceNavData(TRAINING_REGION);
  provider = null;
  terrainEpoch++;
}

/** 0 = open sea, 1 = inland. */
export function landMask(p: LatLon): number {
  if (provider) return provider.land(p);
  let m = 0;
  const wob = Math.sin(p.lat * 61.7 + p.lon * 13.1) * 1.4 + Math.sin(p.lon * 47.3 - p.lat * 21.9) * 1.1;
  for (const is of ISLANDS) {
    const d = distanceNm(p, is.c);
    m = Math.max(m, smooth(is.r + wob + 1.5, is.r + wob - 2.5, d));
  }
  return m;
}

/** Ground elevation in ft MSL. Flat near airports, hills and a ridge elsewhere, sea beyond the coast. */
export function groundElevation(p: LatLon): number {
  if (provider) return provider.elev(p);
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
  const fade = Math.min(1, Math.max(0, (nearest - 4) / 6));
  const hills =
    250 * (1 + Math.sin(p.lat * 37.1) * Math.cos(p.lon * 23.3)) + 150 * (1 + Math.sin(p.lat * 91 + p.lon * 57)) + 60 * Math.sin(p.lat * 310 + p.lon * 170);
  // ridge: elongated gaussian with a rough crest
  const dr = distanceNm(p, RIDGE.c);
  const br = (bearingDeg(RIDGE.c, p) - RIDGE.along) * (Math.PI / 180);
  const u = dr * Math.cos(br);
  const v = dr * Math.sin(br);
  const ridge = RIDGE.peak * Math.exp(-((u / RIDGE.len) ** 2) - (v / RIDGE.width) ** 2) * (0.85 + 0.15 * Math.sin(u * 3.1));
  const land = Math.max(0, base + fade * hills * 0.9);
  const m = landMask(p);
  const airportFlat = nearest < 3.5;
  if (airportFlat) return land;
  return Math.max(0, land * m + ridge * m - (1 - m) * 40);
}
