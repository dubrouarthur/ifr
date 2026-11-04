import type { LatLon } from './geo';

export type NavaidType = 'VOR' | 'VORDME' | 'NDB' | 'LOC' | 'ILS';

export interface Navaid extends LatLon {
  ident: string;
  name: string;
  type: NavaidType;
  freq: number; // MHz (kHz for NDB)
  elevFt: number;
  /** For LOC/ILS: magnetic inbound course */
  course?: number;
  /** For ILS: glideslope angle (deg) and the GS antenna position (abeam touchdown) */
  gsAngle?: number;
  gsPos?: LatLon;
  /** Threshold crossing height */
  tch?: number;
  /** Optional DME co-located */
  dme?: boolean;
  /** Runway the LOC serves */
  runway?: string;
  airport?: string;
}

export interface Runway {
  id: string; // e.g. "27"
  heading: number; // magnetic
  threshold: LatLon; // landing threshold
  end: LatLon; // opposite threshold
  lengthFt: number;
  widthFt: number;
  elevFt: number;
  lights: boolean;
}

export interface Frequencies {
  atis?: number;
  approach?: number;
  tower?: number;
  ground?: number;
  ctaf?: number;
  unicom?: number;
}

export interface Airport extends LatLon {
  icao: string;
  name: string;
  city: string;
  elevFt: number;
  runways: Runway[];
  freqs: Frequencies;
  magVar: number; // + = east
}

export interface Fix extends LatLon {
  ident: string;
  kind: 'fix' | 'vor' | 'ndb' | 'airport' | 'runway';
}

export type LegRole = 'IAF' | 'IF' | 'FAF' | 'MAP' | 'MAHP' | 'STEPDOWN' | 'ENR' | 'RWY';

export interface ProcLeg {
  fix: Fix;
  role?: LegRole;
  /** Altitude constraint: at-or-above unless `atAlt` given. */
  altMin?: number;
  altMax?: number;
  /** Course to fly to this fix (magnetic), for chart labelling */
  course?: number;
  /** Distance of the leg (nm), filled in at build time */
  dist?: number;
  /** Hold at this fix (missed approach / course reversal) */
  hold?: { inbound: number; turn: 'R' | 'L'; legMin: number };
  /** Hold-in-lieu of procedure turn: one circuit then continue */
  hilpt?: boolean;
  /** The leg TO this fix is a DME arc around `center` (navaid/fix ident) */
  arc?: { center: string; radius: number; dir: 'L' | 'R' };
  /** Barbed procedure turn starting at this fix: outbound course, side of the 45° turn */
  pt?: { outbound: number; side: 'L' | 'R'; withinNm: number };
}

export interface Minimums {
  label: string; // e.g. "S-ILS 27"
  da?: number; // decision altitude
  mda?: number;
  vis: string;
  hat: number;
}

export interface Approach {
  id: string;
  airport: string;
  name: string; // e.g. "ILS or LOC RWY 27"
  type: 'ILS' | 'RNAV' | 'VOR' | 'LOC' | 'LOCBC' | 'NDB' | 'LDA';
  /** Short tag for UI (e.g. 'Precision', 'Non-precision') */
  category: 'Precision' | 'APV' | 'Non-precision';
  /** CRS to set on the HSI if different from the final course (back course) */
  crsSetting?: number;
  difficulty: 1 | 2 | 3;
  runway: string;
  finalCourse: number; // magnetic
  /** Navaid used for final (LOC/VOR ident) */
  navaid?: string;
  /** `direct`: the transition joins the final at the FAF (course reversal transitions) */
  transitions: { name: string; legs: ProcLeg[]; joinFaf?: boolean }[];
  final: ProcLeg[]; // IF/FAF ... MAP (runway)
  missed: ProcLeg[];
  missedText: string;
  minimums: Minimums[];
  gsAngle?: number;
  tch?: number;
  msa: { center: string; alt: number };
  notes: string[];
  /** data source (e.g. 'FAA CIFP') — absent for the built-in training region */
  source?: string;
}

/** One leg of a SID / STAR: a fix (with constraints) or a heading/course leg without a fix (vectors, climb to…) */
export interface TermLeg {
  fix?: Fix;
  vec?: { pt: string; course: number | null };
  altMin?: number;
  altMax?: number;
  speed?: number;
  hold?: { inbound: number; turn: 'L' | 'R'; legMin: number };
}
/** A departure (SID) or arrival (STAR) procedure: runway transitions, common route, enroute transitions. */
export interface TerminalProc {
  id: string; // e.g. SSTIK5
  airport: string;
  kind: 'SID' | 'STAR';
  rwy: { name: string; legs: TermLeg[] }[]; // name RW28B (both 28L/R), RW01L, ALL
  common: TermLeg[];
  enr: { name: string; legs: TermLeg[] }[]; // name = transition fix
  source: string;
}

/** One segment of an enroute airway (V/T low, J/Q high), between two consecutive fixes; MEA in ft */
export interface AirwaySeg {
  route: string;
  from: Fix;
  to: Fix;
  mea: number;
  level: 'L' | 'H' | 'B' | ' ';
}
