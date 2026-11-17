// Toussus-le-Noble (LFPN): every number the course « IFR à Toussus-le-Noble » (lfpnIfr.ts) shows comes from this
// module, and each one carries its source. Nothing here is invented: what the official sources do not settle is
// left out, or marked `check: true` (the slide then says « à vérifier sur la carte SIA en vigueur »).
//
// Source: SIA, eAIP France, AIRAC cycle 29 OCT 2026 (the cycle in force when this was written; the next one is
// 26 NOV 2026), https://www.sia.aviation-civile.gouv.fr/media/dvd/eAIP_29_OCT_2026/ — researched 16 NOV 2026.
//   [AD2]     AD 2 LFPN text (section valid from 01 OCT 2026)
//   [IAC]     AD 2 LFPN instrument charts: FNA ILS ou LOC RWY 25R (10 JUL 2025, AMDT 07/25), FNA RNP / VOR Z RWY 25R
//             and RWY 07L (20 MAR 2025), INA charts (10 JUL 2025)
//   [VAC]     VAC LFPN, 11 JUN 2026, AMDT 07/26
//   [ENR2.1]  ENR 2.1 (TMA), [ENR4.1] ENR 4.1 (navaids), [ENR4.4] ENR 4.4 (points), [ENR5.1] ENR 5.1 (R areas),
//   [LFPV]    AD 2 LFPV (Villacoublay), [COM]  COM chart LFPN (11 JUN 2026)
// The course is training material: « Entraînement, non pour la navigation réelle ».
import type { L10n } from "../../types";

/** The AIRAC cycle the facts were read in, and the next one (after it, every value must be checked again). */
export const LFPN_AIRAC = {
  cycle: "29 OCT 2026",
  iso: "2026-10-29",
  next: "26 NOV 2026",
} as const;

/** What the slides say about where the numbers come from, and what they are not for. */
export const LFPN_DISCLAIMER: Required<L10n> = {
  en: "Training, not for real-world navigation",
  fr: "Entraînement, non pour la navigation réelle",
};
export const LFPN_CHECK: Required<L10n> = {
  en: "check on the current SIA chart",
  fr: "à vérifier sur la carte SIA en vigueur",
};
export const LFPN_SOURCE: Required<L10n> = {
  en: `SIA eAIP France · AIRAC ${LFPN_AIRAC.cycle}`,
  fr: `eAIP France (SIA) · AIRAC ${LFPN_AIRAC.cycle}`,
};

/** "48°44'59\"N" → decimal degrees. */
export function dms(d: number, m: number, s: number): number {
  return Math.round((d + m / 60 + s / 3600) * 1e6) / 1e6;
}

export const LFPN = {
  icao: "LFPN",
  // [AD2] « LFPN — PARIS SACLAY VERSAILLES »; the call sign stays TOUSSUS (charts: « CHG : renommage AD », AMDT 03/25)
  name: "PARIS SACLAY VERSAILLES",
  callsign: "TOUSSUS",
  // [AD2 2.2] « 48°44'59"N 002°06'40"E … 118 m / 222° de la TWR »
  arp: { lat: dms(48, 44, 59), lon: dms(2, 6, 40) },
  // [AD2 2.2] elevation 538 ft; magnetic variation 1.7372°E (2025), annual change 0.134°
  elevFt: 538,
  magVar: 1.7372,
  // [AD2 2.2 / 2.3 / 2.22.1] IFR and VFR, intra-Schengen only, MTOW 12 t
  mtowT: 12,
  // [AD2 2.3] « TWR : 0600-2100 » (UTC in winter, −1 HR in summer); [AD2 2.21] AD closed 2130-0500
  twrUtc: { open: "0600", close: "2100" },
  closedUtc: { from: "2130", to: "0500" },
  // [AD2 2.17] ATS airspace of the aerodrome: class G only, no CTR
  airspaceClass: "G",
} as const;

/** [AD2 2.12 / 2.13 / 2.14] The runways: thresholds, magnetic QFU, size, declared distances, PAPI. */
export const LFPN_RUNWAYS = [
  {
    ids: ["07L", "25R"] as [string, string],
    qfu: [69, 249] as [number, number],
    // QFU true 071.23 / 251.23 (the localizer 25R is on this axis)
    qfuTrue: [71.23, 251.23] as [number, number],
    lengthM: 1100,
    widthM: 30,
    thr: [
      { lat: dms(48, 45, 4.34), lon: dms(2, 5, 55.41), elevFt: 538 },
      { lat: dms(48, 45, 15.81), lon: dms(2, 6, 46.44), elevFt: 503 },
    ],
    /** displaced threshold, m, at each end (none on 07L/25R) */
    dthrM: [0, 0] as [number, number],
    lda: [1100, 1100] as [number, number],
    papiDeg: [3.0, 3.5] as [number, number],
  },
  {
    ids: ["07R", "25L"] as [string, string],
    qfu: [69, 249] as [number, number],
    lengthM: 1050,
    widthM: 30,
    thr: [
      { lat: dms(48, 44, 58.33), lon: dms(2, 5, 59.07), elevFt: 536 },
      { lat: dms(48, 45, 9.27), lon: dms(2, 6, 47.74), elevFt: 499 },
    ],
    // 07R: DTHR at 48°44'59.99"N 002°06'06.49"E, elev 528 ft — LDA 890 m, so 1050 − 890 = 160 m displaced
    dthrM: [160, 0] as [number, number],
    dthr07R: { lat: dms(48, 44, 59.99), lon: dms(2, 6, 6.49), elevFt: 528 },
    lda: [890, 1050] as [number, number],
    papiDeg: [3.0, 3.0] as [number, number],
  },
] as const;

/** [COM] [AD2 2.18] The frequencies (MHz). */
export const LFPN_FREQ = {
  atis: 127.48,
  ground: 122.13,
  tower: 120.755,
  // FIS CHEVREUSE Info, also the tower's auxiliary frequency
  chevreuse: 119.305,
  // VILLA Approche: departures
  villaApp: 119.425,
  // ORLY APP approach; DE GAULLE APP for the arrivals via VEBEK
  orlyApp: 123.875,
  cdgVebek: 121.155,
} as const;

/** [AD2 2.19] [ENR4.1] The navaids the procedures use. */
export const LFPN_NAV = {
  // VOR without DME, 042° / 387 m from THR 07L
  tsu: {
    ident: "TSU",
    freq: 108.25,
    lat: dms(48, 45, 13.4),
    lon: dms(2, 6, 8.5),
  },
  // ILS 25R « LOC 25R (I.E.1) »: LOC 110.15, GP 334.25 at 3.5°, RDH 17.8 m / 59 ft, DME Ch 38Y at the GP
  tno: {
    ident: "TNO",
    loc: 110.15,
    gp: 334.25,
    gpDeg: 3.5,
    rdhFt: 59,
    locPos: { lat: dms(48, 44, 58.5), lon: dms(2, 5, 29.4) },
    gpPos: { lat: dms(48, 45, 16.8), lon: dms(2, 6, 32.5) },
  },
  // DME only (Ch 94X)
  rbt: { ident: "RBT", freq: 114.7 },
  // VOR-DME, the clearance limit of the 25R missed approaches
  epr: { ident: "EPR", freq: 115.65 },
} as const;

/** [IAC] FNA ILS ou LOC RWY 25R (10 JUL 2025). Minima and distances: `check` (dense columns, a new cycle). */
export const LFPN_ILS25R = {
  name: "ILS ou LOC RWY 25R",
  check: true,
  finalCourse: 250,
  gpDeg: 3.5,
  gpPct: 6.1,
  // IF at 10.2 DME TNO, 3000 (2497); FAF (LOC) at 6.7 DME TNO
  ifDme: 10.2,
  ifAltFt: 3000,
  fafDme: 6.7,
  // « En cas de clairance : à 2000 (1497) : FAP à 4 NM TNO »
  fapAltFt: 2000,
  fapDme: 4,
  // ILS DA 710 (200), RVR 750 m; LOC MDA 870 (360), RVR 1200 m
  daFt: 710,
  dhFt: 200,
  rvrIlsM: 750,
  mdaLocFt: 870,
  mdhLocFt: 360,
  rvrLocM: 1200,
  // the missed approach, quoted
  missed: {
    fr: "Monter dans l’axe. À TSU, tourner à gauche R 246 TSU (RM 246°) en montée vers 2000 (1497) pour rejoindre EPR et suivre clairance du CTL. Monter à 1400 (897) avant d’accélérer en palier.",
    en: "Climb on the centreline. At TSU, turn left onto R 246 TSU (MAG 246°) climbing to 2000 (1497) to join EPR and follow the ATC clearance. Climb to 1400 (897) before accelerating in level flight.",
  } as L10n,
  missedRm: 246,
  missedAltFt: 2000,
  accelAltFt: 1400,
  // « Monter à 1400 (897) »: the height above the threshold 25R
  accelHgtFt: 897,
  // « VOR et DME requis »
  equipment: "VOR + DME",
} as const;

/** [IAC] The other approaches of the cycle (names only on the slides). */
export const LFPN_APPROACHES = [
  "ILS ou LOC RWY 25R",
  "RNP RWY 25R",
  "VOR Z RWY 25R",
  "RNP RWY 07L",
  "VOR Z RWY 07L",
] as const;

/** [IAC] MSA. Sector bearings: `check` (whether they read TO or FROM TSU). */
export const LFPN_MSA = {
  check: true,
  // conventional charts: « ALT MNM 25 NM TSU + DME ATT TNO » 2000 in general
  convFt: 2000,
  convNm: 25,
  // RNAV charts: « ALT MNM 25 NM ARP LFPN » 2400
  rnavFt: 2400,
} as const;

/** [IAC INA] Initial approach fixes and holds (10 JUL 2025). The INA routings themselves: `check`. */
export const LFPN_ARRIVAL = {
  iafs: ["ODILO", "MOLBA", "VEBEK"] as const,
  // RNAV hold, inbound 313° right, 1 min, FL070–FL140, MAX IAS 230 kt
  molba: {
    fix: "MOLBA",
    inbound: 313,
    turn: "R" as const,
    legMin: 1,
    minFl: 70,
    maxFl: 140,
    maxIasKt: 230,
  },
  // DME hold, inbound 033° right, 30–35 NM RBT, FL070–FL110, MAX IAS 230 kt
  odilo: {
    fix: "ODILO",
    inbound: 33,
    turn: "R" as const,
    dmeFrom: 30,
    dmeTo: 35,
    minFl: 70,
    maxFl: 110,
    maxIasKt: 230,
  },
  // [AD2 2.22.2.1] after the INA, ATC vectors the aircraft to the final
  vectors: true,
} as const;

/** [IAC] [ENR1.7] [AD2 2.22.2] Altitudes and speeds around the field. */
export const LFPN_RULES = {
  // « TA : 5000 » on every IAC and SID
  taFt: 5000,
  // « Dans les TMA Paris de classe A (parties 2 à 10), la vitesse est limitée à IAS 250 kt maximum en dessous du FL 100 »
  tmaIasKt: 250,
  tmaBelowFl: 100,
  // [ENR5.1] LF-R 35 A SFC–1500 ft AMSL, LF-R 35 B 1500–2000 ft AMSL: entry on TOUSSUS TWR clearance, mode 3/A
  r35a: { name: "LF-R 35 A", floorFt: 0, ceilFt: 1500 },
  r35b: { name: "LF-R 35 B", floorFt: 1500, ceilFt: 2000 },
  // [LFPV 2.17] CTR VILLACOUBLAY D SFC–2000 ft AMSL (NE of LFPN); [ENR2.1] TMA VILLACOUBLAY A 1500–2500 ft (north)
  ctrVillaCeilFt: 2000,
  tmaVilla: { floorFt: 1500, ceilFt: 2500 },
  // [AD2 2.22.3] RNAV SIDs only; minimum climb gradient 5.5 % up to FL150
  sidPct: 5.5,
  sidFl: 150,
} as const;

/** Training numbers of the lesson (not procedure data): the speed flown, how long a goal is held. */
export const LFPN_LESSON = {
  /** the approach speed of the training aircraft (C172S class) */
  iasKt: 90,
  /** a goal is met once held this long, s */
  holdS: 8,
  /** the intercept angle taught (FAA IFH ch. 9) */
  interceptDeg: 30,
  /** the power of the situations, % (the C172S class: about 20 % on a 3.5° glide at 90 kt, 50 % level) */
  glidePower: 20,
  levelPower: 50,
  /** the bank to roll onto the localizer with (about half a standard-rate turn at 90 kt) */
  bankDeg: 15,
  /** the heading tolerance of the intercept goal, ° */
  hdgTol: 10,
  /** how high above the glide path the « rejoin » situation starts, ft */
  highFt: 150,
  /** the descent-rate band of the glide goal, ft/min (the 3.5° rate at 90 kt, 558, ± about 100) */
  vsBand: [450, 650] as [number, number],
  /** the RVR of the minima question (an example below the LOC minimum, above the ILS one), m */
  rvrExampleM: 1000,
  /** EASA Air OPS NCO.OP.210: below the RVR minimum, no continuation below 1,000 ft above the aerodrome */
  banFt: 1000,
  /** the example arrival heading to MOLBA of the hold-entry question (a school example, not a routing) */
  molbaCourse: 180,
  /** the simulator flight: start this far out on the localizer, NM; hold the goal this long, s; at most, s */
  flyStartNm: 9,
  flyHoldS: 60,
  flyDurationS: 300,
} as const;

const FT_PER_NM = 6076.12;
/** Numbers worked out from the facts above (each with its formula). */
export const LFPN_DERIVED = {
  /** a 3.5° path: tan(3.5°) × 6,076 ft ≈ 372 ft per NM */
  ftPerNm: Math.round(Math.tan(LFPN_ILS25R.gpDeg * (Math.PI / 180)) * FT_PER_NM),
  /** at 90 kt over the ground: 372 × 90 ÷ 60 = 558 ft/min */
  vsFpm: Math.round(
    (Math.round(Math.tan(LFPN_ILS25R.gpDeg * (Math.PI / 180)) * FT_PER_NM) * LFPN_LESSON.iasKt) / 60,
  ),
  /** the same rule for 3°: about 318 ft per NM, 477 ft/min at 90 kt (« 5 × la vitesse sol ») */
  ftPerNm3: Math.round(Math.tan(3 * (Math.PI / 180)) * FT_PER_NM),
  /** threshold 25R elevation + RDH: where the glide path crosses the threshold, ft */
  thrCrossFt: LFPN_RUNWAYS[0].thr[1].elevFt + LFPN_NAV.tno.rdhFt,
  /** the heading of the 30° intercept: final course + 30° */
  interceptHdg: LFPN_ILS25R.finalCourse + LFPN_LESSON.interceptDeg,
} as const;

/** The real-world region the course's scenes fly in (the navdata is loaded around LFPN). */
export const LFPN_WORLD = {
  kind: "real" as const,
  region: "LFPN",
  icaos: ["LFPN"],
  airac: LFPN_AIRAC.iso,
};

/** Every fact of the module, for the provenance test (the numbers a slide may show). */
export const LFPN_FACTS = {
  LFPN_AIRAC,
  LFPN,
  LFPN_RUNWAYS,
  LFPN_FREQ,
  LFPN_NAV,
  LFPN_ILS25R,
  LFPN_APPROACHES,
  LFPN_MSA,
  LFPN_ARRIVAL,
  LFPN_RULES,
  LFPN_LESSON,
  LFPN_DERIVED,
} as const;
