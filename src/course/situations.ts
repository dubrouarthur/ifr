// Ground school — « Situation de vol »: what the aircraft is doing, in the words an instructor uses (heading,
// altitude, speed, vertical speed, bank, pitch, power, flaps; where it is; what the radios show; the wind, the
// weather, the failures, the autopilot). A Situation is the form of the studio; it becomes a SimScene (a fields
// pose) that the simulator's own renderers draw, and it is stored on the scene so the form opens as it was left.
//
// Pure: the model, the aircraft's limits, the consistency checks (an impossible combination is explained),
// « Stabiliser » (the real flight model flies the situation until it is steady and the result is kept), the ready
// situations, and the goal sentences of « À vous ».
import { Sim } from "../sim/sim";
import { AIRFRAME } from "../sim/aircraft";
import type { FailureKey } from "../sim/systemsTypes";
import { FAILURE_LABELS_EN, FAILURE_LABELS_FR } from "../sim/systemsTypes";
import { AIRPORTS, NAVAIDS, groundElevation, runway } from "../nav/data";
import { bearingDeg, distanceNm, norm360, type LatLon } from "../nav/geo";
import {
  applyScene,
  fieldsOf,
  newSceneId,
  resolveFieldsPos,
  shiftAltitude,
} from "./scene";
import type {
  Course,
  GoalCheck,
  L10n,
  Lang,
  SceneFields,
  SimScene,
  SlideBlock,
  SlideCanvas,
  StageControl,
  YourTurn,
} from "./types";

const L = (en: string, fr: string): L10n => ({ en, fr });
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const DEG = Math.PI / 180;
const pad3 = (v: number) =>
  String(Math.round(norm360(v)) % 360).padStart(3, "0");

// ---------------------------------------------------------------- the model
export type SitPos =
  /** on a radial of a VOR (or a bearing from an NDB), at a distance */
  | { kind: "radial"; station: string; radial: number; distNm: number }
  /** on the final of an ILS / localizer, n NM from the threshold, on the glide path */
  | { kind: "ils"; airport: string; rwy: string; distNm: number }
  /** established in the hold over a station: on the inbound leg, 2 NM from the fix */
  | { kind: "hold"; fix: string; inbound: number; turn: "R" | "L" }
  /** overhead an airport */
  | { kind: "over"; airport: string }
  /** where a capture left the aircraft */
  | { kind: "free"; lat: number; lon: number };

export interface Situation {
  /** heading, ° (the training region has no magnetic variation) */
  hdg: number;
  altFt: number;
  iasKt: number;
  /** vertical speed, ft/min (negative: descent) */
  vsFpm: number;
  /** bank, ° (right positive) */
  bank: number;
  /** pitch attitude, °; null: the attitude that flies this speed and this path (the usual case) */
  pitch: number | null;
  /** throttle, % */
  power: number;
  /** flap detent 0..3 (0, 10, 20, 30°) */
  flaps: number;
  pos: SitPos;
  /** the station tuned on NAV1 / NAV2 (a VOR or an ILS ident), the NDB on the ADF; null: left as it is */
  nav1: string | null;
  nav2: string | null;
  adf: string | null;
  obs1: number;
  obs2: number;
  source: "NAV1" | "NAV2" | "GPS";
  wind: { dir: number; kt: number };
  wx: "vmc" | "imc";
  /** cloud base (ft) when IMC */
  ceilingFt: number;
  failures: FailureKey[];
  /** autopilot holding this heading and this altitude (or this vertical speed) */
  ap: boolean;
  night: boolean;
  /** set by « Stabiliser »: the attitude and the trim of the steady flight (cleared when a flight value changes) */
  trimmed?: { pitch: number; trim: number };
}

export interface Limit {
  min: number;
  max: number;
  step: number;
  unit: string;
}
/** The limits of every field: the aircraft's own numbers (C172S: VS0 40, VNE 163, flaps to 30°). */
export const SIT_LIMITS: Record<
  | "hdg"
  | "altFt"
  | "iasKt"
  | "vsFpm"
  | "bank"
  | "pitch"
  | "power"
  | "flaps"
  | "radial"
  | "distNm"
  | "obs"
  | "windDir"
  | "windKt"
  | "ceilingFt",
  Limit
> = {
  hdg: { min: 0, max: 359, step: 1, unit: "°" },
  altFt: { min: 0, max: 14000, step: 100, unit: "ft" },
  iasKt: { min: AIRFRAME.vso, max: AIRFRAME.vne, step: 1, unit: "kt" },
  vsFpm: { min: -1500, max: 1200, step: 50, unit: "ft/min" },
  bank: { min: -60, max: 60, step: 1, unit: "°" },
  pitch: { min: -15, max: 20, step: 1, unit: "°" },
  power: { min: 0, max: 100, step: 5, unit: "%" },
  flaps: { min: 0, max: 3, step: 1, unit: "" },
  radial: { min: 0, max: 359, step: 1, unit: "°" },
  distNm: { min: 0, max: 40, step: 0.5, unit: "NM" },
  obs: { min: 0, max: 359, step: 1, unit: "°" },
  windDir: { min: 0, max: 350, step: 10, unit: "°" },
  windKt: { min: 0, max: 50, step: 1, unit: "kt" },
  ceilingFt: { min: 200, max: 6000, step: 100, unit: "ft" },
};
export const FLAP_DEG = [0, 10, 20, 30] as const;

/** The failures an instructor shows on instruments (chips), in teaching order. */
export const SIT_FAILURES: FailureKey[] = [
  "vacuum",
  "pitotBlocked",
  "staticBlocked",
  "airData",
  "ahrs",
  "alternator",
  "nav1",
  "gs",
  "gps",
  "engine",
];
export const failureName = (k: FailureKey, lang: Lang): string =>
  (lang === "fr" ? FAILURE_LABELS_FR : FAILURE_LABELS_EN)[k] ?? k;

export function defaultSituation(): Situation {
  return {
    hdg: 270,
    altFt: 3000,
    iasKt: 100,
    vsFpm: 0,
    bank: 0,
    pitch: null,
    power: 60,
    flaps: 0,
    pos: { kind: "radial", station: "ARD", radial: 90, distNm: 8 },
    nav1: "ARD",
    nav2: null,
    adf: null,
    obs1: 270,
    obs2: 0,
    source: "NAV1",
    wind: { dir: 0, kt: 0 },
    wx: "vmc",
    ceilingFt: 1500,
    failures: [],
    ap: false,
    night: false,
  };
}

// ---------------------------------------------------------------- the training region, as the form lists it
export interface StationOpt {
  ident: string;
  name: string;
  kind: "VOR" | "NDB" | "ILS";
  freq: number;
}
/** VORs and NDBs of the loaded region (a position is given from one of them). */
export function stations(): StationOpt[] {
  return NAVAIDS.filter(
    (n) => n.type === "VOR" || n.type === "VORDME" || n.type === "NDB",
  ).map((n) => ({
    ident: n.ident,
    name: n.name,
    kind: n.type === "NDB" ? "NDB" : "VOR",
    freq: n.freq,
  }));
}
/** What NAV1 / NAV2 can be tuned to: the VORs, then the ILS and localizers. */
export function navStations(): StationOpt[] {
  return [
    ...stations().filter((s) => s.kind === "VOR"),
    ...NAVAIDS.filter((n) => n.type === "ILS" || n.type === "LOC").map(
      (n): StationOpt => ({
        ident: n.ident,
        name: n.name,
        kind: "ILS",
        freq: n.freq,
      }),
    ),
  ];
}
export interface IlsOpt {
  ident: string;
  airport: string;
  rwy: string;
  course: number;
  glide: boolean;
}
export function ilsList(): IlsOpt[] {
  return NAVAIDS.filter(
    (n) => (n.type === "ILS" || n.type === "LOC") && n.airport && n.runway,
  ).map((n) => ({
    ident: n.ident,
    airport: n.airport!,
    rwy: n.runway!,
    course: n.course ?? 0,
    glide: n.type === "ILS",
  }));
}
export const airportList = (): { icao: string; name: string }[] =>
  AIRPORTS.map((a) => ({ icao: a.icao, name: a.name }));

const station = (ident: string) => NAVAIDS.find((n) => n.ident === ident);

/** The SceneFields position of a Situation position (null: not in the loaded region). */
export function fieldsPos(p: SitPos): SceneFields["pos"] | null {
  switch (p.kind) {
    case "radial":
      return station(p.station)
        ? { fix: p.station, radial: norm360(p.radial), distNm: p.distNm }
        : null;
    case "ils": {
      try {
        runway(p.airport, p.rwy);
      } catch {
        return null;
      }
      return { runway: { icao: p.airport, id: p.rwy }, distNm: p.distNm };
    }
    case "hold":
      return station(p.fix)
        ? { fix: p.fix, radial: norm360(p.inbound + 180), distNm: 2 }
        : null;
    case "over": {
      const a = AIRPORTS.find((x) => x.icao === p.airport);
      return a ? { lat: a.lat, lon: a.lon } : null;
    }
    case "free":
      return { lat: p.lat, lon: p.lon };
  }
}
export function positionOf(sit: Situation): LatLon | null {
  const f = fieldsPos(sit.pos);
  return f
    ? resolveFieldsPos({ kind: "fields", pos: f, altFt: 0, hdg: 0, iasKt: 0 })
    : null;
}
/** The nearest VOR / NDB of a point, as a radial and a distance (how a free position is read). */
export function nearestStation(
  p: LatLon,
): { station: string; radial: number; distNm: number } | null {
  let best: { station: string; radial: number; distNm: number } | null = null;
  // a VOR first (« ARD · radial 090 »): an NDB only when no VOR is within 40 NM
  const all = stations();
  const vors = all.filter((s) => s.kind === "VOR");
  const near = (list: StationOpt[]) => {
    let b: { station: string; radial: number; distNm: number } | null = null;
    for (const s of list) {
      const n = station(s.ident)!;
      const d = distanceNm(n, p);
      if (!b || d < b.distNm) b = { station: s.ident, radial: Math.round(norm360(bearingDeg(n, p))), distNm: Math.round(d * 10) / 10 };
    }
    return b;
  };
  const v = near(vors);
  if (v && v.distNm <= 40) return v;
  for (const s of all) {
    const n = station(s.ident)!;
    const d = distanceNm(n, p);
    if (!best || d < best.distNm)
      best = {
        station: s.ident,
        radial: Math.round(norm360(bearingDeg(n, p))),
        distNm: Math.round(d * 10) / 10,
      };
  }
  return best;
}

/** One line for a position (« ARD · radial 276 · 6 NM », « ILS 27 de PARD · 5 NM », « Dans l’attente à ARD »). */
export function posLine(p: SitPos, lang: Lang): string {
  const fr = lang === "fr";
  const nm = (v: number) =>
    `${(Math.round(v * 10) / 10).toLocaleString(fr ? "fr-FR" : "en-US")} NM`;
  switch (p.kind) {
    case "radial": {
      const ndb = station(p.station)?.type === "NDB";
      return `${p.station} · ${ndb ? (fr ? "relèvement" : "bearing") : fr ? "radial" : "radial"} ${pad3(p.radial)} · ${nm(p.distNm)}`;
    }
    case "ils":
      return fr
        ? `ILS ${p.rwy} de ${p.airport} · ${nm(p.distNm)}`
        : `ILS ${p.rwy} at ${p.airport} · ${nm(p.distNm)}`;
    case "hold":
      return fr
        ? `Dans l’attente à ${p.fix} · rapprochement ${pad3(p.inbound)}`
        : `In the hold at ${p.fix} · inbound ${pad3(p.inbound)}`;
    case "over":
      return fr ? `À la verticale de ${p.airport}` : `Overhead ${p.airport}`;
    case "free": {
      const n = nearestStation(p);
      return n
        ? `${n.station} · ${fr ? "radial" : "radial"} ${pad3(n.radial)} · ${nm(n.distNm)}`
        : fr
          ? "Position capturée"
          : "Captured position";
    }
  }
}
/** The short name of a situation, language neutral (the scene's label): « 270° · 3 000 ft · 100 kt ». */
export function sitLabel(sit: Situation): string {
  const alt = Math.round(sit.altFt).toLocaleString("en-US").replace(/,/g, " ");
  const turn =
    Math.abs(sit.bank) >= 3
      ? ` · ${Math.abs(Math.round(sit.bank))}° ${sit.bank < 0 ? "L" : "R"}`
      : "";
  const vs =
    Math.abs(sit.vsFpm) >= 50
      ? ` · ${sit.vsFpm > 0 ? "+" : "−"}${Math.abs(Math.round(sit.vsFpm))} ft/min`
      : "";
  return `${pad3(sit.hdg)}° · ${alt} ft · ${Math.round(sit.iasKt)} kt${vs}${turn}`;
}

// ---------------------------------------------------------------- the aircraft's numbers
/** Indicated stall speed (kt) in this configuration and this bank (VS × √n). */
export function stallKt(flaps: number, bank: number): number {
  const vs = [AIRFRAME.vs1, 45, 42, AIRFRAME.vso][
    clamp(Math.round(flaps), 0, 3)
  ];
  return (
    vs *
    Math.sqrt(1 / Math.max(0.3, Math.cos(clamp(Math.abs(bank), 0, 75) * DEG)))
  );
}
/** Flap limit speed (kt) of a detent (10° to 110 kt, 20° and 30° to 85 kt); Infinity flaps up. */
export const flapLimitKt = (flaps: number): number =>
  flaps <= 0 ? Infinity : flaps === 1 ? AIRFRAME.vfe10 : AIRFRAME.vfe;

/** Standard-rate bank (°) at a speed. */
export const standardBank = (iasKt: number): number =>
  Math.round(
    Math.atan((Math.max(40, iasKt) * 0.514444 * 3 * DEG) / 9.80665) / DEG,
  );

/**
 * The pitch attitude (°) that flies this speed on this path: flight path angle plus the angle of attack of the lift
 * needed (weight × load factor), from the airframe's own lift curve. Slow flight shows its nose-up attitude, a
 * steep turn a little more than level flight.
 */
export function pitchFor(
  sit: Pick<Situation, "iasKt" | "altFt" | "vsFpm" | "bank" | "flaps">,
): number {
  const sigma = Math.pow(1 - 6.8756e-6 * clamp(sit.altFt, 0, 20000), 4.2559);
  const tas = (Math.max(35, sit.iasKt) * 0.514444) / Math.sqrt(sigma);
  const n = 1 / Math.max(0.3, Math.cos(clamp(Math.abs(sit.bank), 0, 75) * DEG));
  const q = 0.5 * 1.225 * Math.pow(Math.max(35, sit.iasKt) * 0.514444, 2);
  const cl = (n * AIRFRAME.massKg * 9.80665) / (q * AIRFRAME.wingArea);
  const f = clamp(sit.flaps, 0, 3) / 3;
  const alpha = (cl - AIRFRAME.cl0 - AIRFRAME.flapCl * f) / AIRFRAME.cla / DEG;
  const gamma = Math.asin(clamp((sit.vsFpm * 0.00508) / tas, -0.5, 0.5)) / DEG;
  return Math.round(clamp(gamma + clamp(alpha, -4, 15), -20, 25) * 10) / 10;
}

/**
 * What the flight model gives, measured once with « Stabiliser » (speed led) and kept as a table: the throttle (%)
 * of level flight, the best climb at full power and the sink at idle (ft/min), by indicated speed and altitude.
 * tests/course-situations.test.ts flies samples again and fails if the table drifts from the aircraft.
 */
const PERF = {
  ias: [55, 65, 75, 90, 105, 120, 135],
  alt: [1000, 4000, 8000, 12000],
  // above 100: more than the engine has (the level speed is not reachable)
  level: [
    [37, 37, 38, 45, 57, 71, 115],
    [43, 42, 44, 51, 64, 82, 125],
    [51, 50, 52, 61, 77, 110, 140],
    [62, 60, 62, 73, 105, 130, 160],
  ],
  up: [
    [650, 700, 700, 650, 450, 150, -250],
    [500, 550, 550, 450, 250, -50, -500],
    [300, 350, 350, 250, 0, -300, -850],
    [100, 150, 100, 0, -200, -550, -1200],
  ],
  down: [
    [-750, -750, -800, -850, -1150, -1500, -1950],
    [-750, -750, -800, -900, -1200, -1550, -2050],
    [-800, -800, -850, -1000, -1250, -1650, -2250],
    [-800, -850, -900, -1050, -1300, -1800, -2500],
  ],
};
function perf(table: number[][], iasKt: number, altFt: number): number {
  const at = (xs: number[], v: number): [number, number] => {
    const x = clamp(v, xs[0], xs[xs.length - 1]);
    let i = 0;
    while (i < xs.length - 2 && x > xs[i + 1]) i++;
    return [i, (x - xs[i]) / (xs[i + 1] - xs[i])];
  };
  const [i, u] = at(PERF.ias, iasKt);
  const [j, v] = at(PERF.alt, altFt);
  const row = (r: number[]) => r[i] + (r[i + 1] - r[i]) * u;
  return row(table[j]) + (row(table[j + 1]) - row(table[j])) * v;
}
type Flight = Pick<Situation, "iasKt" | "altFt" | "vsFpm" | "bank" | "flaps">;
/** Throttle (%) of level flight in this configuration; above 100 the engine does not have it. */
export function levelPower(sit: Flight): number {
  const n = 1 / Math.max(0.3, Math.cos(clamp(Math.abs(sit.bank), 0, 75) * DEG));
  return perf(PERF.level, sit.iasKt, sit.altFt) + 5 * clamp(sit.flaps, 0, 3) + 43 * Math.pow(n - 1, 1.25);
}
/** Best climb (ft/min, full power) and sink at idle (ft/min, negative) at this speed, height and configuration. */
export function climbRange(sit: Flight): { up: number; down: number } {
  const clean = perf(PERF.level, sit.iasKt, sit.altFt);
  const lvl = levelPower(sit);
  const up0 = perf(PERF.up, sit.iasKt, sit.altFt);
  // flaps and bank cost climb in proportion to the power they take
  const up = up0 > 0 && clean < 100 ? up0 * clamp((100 - lvl) / (100 - clean), -1, 1) : up0 - (lvl - clean) * 12;
  const down = perf(PERF.down, sit.iasKt, sit.altFt) * (1 + (lvl - clean) / Math.max(30, clean));
  return { up: Math.round(up / 10) * 10, down: Math.round(down / 10) * 10 };
}
/**
 * The throttle (%) this flight needs, roughly. Used to tell the author that the power and the speed do not go
 * together before « Stabiliser » shows the real figure. Above 100: more than the engine has; below 0: even at
 * idle the aircraft does not come down that fast at this speed.
 */
export function powerNeeded(sit: Flight): number {
  const lvl = levelPower(sit);
  const { up, down } = climbRange(sit);
  let need: number;
  if (sit.vsFpm > 0) {
    if (lvl >= 100 || up <= 0) need = Math.max(lvl, 100) + sit.vsFpm / 10;
    else {
      const x = sit.vsFpm / up;
      need = x <= 1 ? lvl + (100 - lvl) * (0.4 * x + 0.6 * Math.pow(x, 8)) : 100 + (x - 1) * 60;
    }
  } else if (sit.vsFpm < 0) {
    const x = sit.vsFpm / Math.min(-100, down);
    need = x <= 1 ? Math.min(lvl, 100) * (1 - x) : -(x - 1) * 60;
  } else need = lvl;
  return Math.round(need);
}

// ---------------------------------------------------------------- consistency
export interface SitIssue {
  /** error: the aircraft cannot be there like this; warn: allowed but outside normal flying; info: not steady yet */
  level: "error" | "warn" | "info";
  field: keyof Situation;
  text: L10n;
  /** one tap puts it right */
  fix?: { label: L10n; patch: Partial<Situation> };
}

/** What does not go together in a situation, in plain words, each with a way out. */
export function checkSituation(sit: Situation): SitIssue[] {
  const out: SitIssue[] = [];
  const vs = stallKt(sit.flaps, sit.bank);
  const flying = sit.iasKt >= 25;
  if (flying && sit.iasKt < vs) {
    const safe = Math.ceil((vs * 1.2) / 5) * 5;
    const why =
      Math.abs(sit.bank) >= 20
        ? L(
            `At ${Math.abs(Math.round(sit.bank))}° of bank the aircraft stalls at about ${Math.round(vs)} kt: it cannot fly at ${Math.round(sit.iasKt)} kt.`,
            `À ${Math.abs(Math.round(sit.bank))}° d’inclinaison, l’avion décroche vers ${Math.round(vs)} kt : il ne peut pas voler à ${Math.round(sit.iasKt)} kt.`,
          )
        : L(
            `With ${FLAP_DEG[sit.flaps] ? `flaps ${FLAP_DEG[sit.flaps]}°` : "flaps up"} the aircraft stalls at about ${Math.round(vs)} kt: it cannot fly at ${Math.round(sit.iasKt)} kt.`,
            `${FLAP_DEG[sit.flaps] ? `Volets ${FLAP_DEG[sit.flaps]}°` : "Volets rentrés"}, l’avion décroche vers ${Math.round(vs)} kt : il ne peut pas voler à ${Math.round(sit.iasKt)} kt.`,
          );
    out.push({
      level: "error",
      field: "iasKt",
      text: why,
      fix: {
        label: L(`Set ${safe} kt`, `Afficher ${safe} kt`),
        patch: { iasKt: safe },
      },
    });
  }
  if (sit.iasKt > AIRFRAME.vne)
    out.push({
      level: "error",
      field: "iasKt",
      text: L(
        `${Math.round(sit.iasKt)} kt is above the never-exceed speed (${AIRFRAME.vne} kt).`,
        `${Math.round(sit.iasKt)} kt dépasse la vitesse à ne jamais dépasser (${AIRFRAME.vne} kt).`,
      ),
      fix: {
        label: L(`Set ${AIRFRAME.vno} kt`, `Afficher ${AIRFRAME.vno} kt`),
        patch: { iasKt: AIRFRAME.vno },
      },
    });
  else if (sit.iasKt > AIRFRAME.vno)
    out.push({
      level: "warn",
      field: "iasKt",
      text: L(
        `${Math.round(sit.iasKt)} kt is in the yellow arc (above ${AIRFRAME.vno} kt): smooth air only.`,
        `${Math.round(sit.iasKt)} kt est dans l’arc jaune (au-dessus de ${AIRFRAME.vno} kt) : air calme seulement.`,
      ),
    });
  const vfe = flapLimitKt(sit.flaps);
  if (sit.iasKt > vfe)
    out.push({
      level: "warn",
      field: "flaps",
      text: L(
        `Flaps ${FLAP_DEG[sit.flaps]}° are limited to ${vfe} kt: at ${Math.round(sit.iasKt)} kt they would be retracted.`,
        `Les volets ${FLAP_DEG[sit.flaps]}° sont limités à ${vfe} kt : à ${Math.round(sit.iasKt)} kt ils seraient rentrés.`,
      ),
      fix: {
        label: L("Retract the flaps", "Rentrer les volets"),
        patch: { flaps: 0 },
      },
    });
  const p = positionOf(sit);
  if (!p)
    out.push({
      level: "error",
      field: "pos",
      text: L(
        "This position is not in the training region.",
        "Cette position n’est pas dans la région d’entraînement.",
      ),
      fix: {
        label: L("Place it near ARD", "La placer près d’ARD"),
        patch: { pos: defaultSituation().pos },
      },
    });
  else if (flying) {
    const g = groundElevation(p);
    if (sit.altFt < g + 100) {
      const safe = Math.ceil((g + 1000) / 100) * 100;
      out.push({
        level: "error",
        field: "altFt",
        text: L(
          `The ground is at ${Math.round(g)} ft here: at ${Math.round(sit.altFt)} ft the aircraft would be in it.`,
          `Le sol est à ${Math.round(g)} ft ici : à ${Math.round(sit.altFt)} ft, l’avion serait dedans.`,
        ),
        fix: {
          label: L(`Set ${safe} ft`, `Afficher ${safe} ft`),
          patch: { altFt: safe },
        },
      });
    }
  }
  if (sit.pitch !== null) {
    const nat = pitchFor(sit);
    if (Math.abs(sit.pitch - nat) > 6)
      out.push({
        level: "warn",
        field: "pitch",
        text: L(
          `This speed and this path fly at about ${Math.round(nat)}° of pitch: ${Math.round(sit.pitch)}° is an unusual attitude that will not last.`,
          `Cette vitesse et cette pente se volent vers ${Math.round(nat)}° d’assiette : ${Math.round(sit.pitch)}° est une assiette inhabituelle, qui ne dure pas.`,
        ),
        fix: {
          label: L("Natural attitude", "Assiette naturelle"),
          patch: { pitch: null },
        },
      });
  }
  if (
    flying &&
    !sit.failures.includes("engine") &&
    !out.some((i) => i.level === "error")
  ) {
    const need = powerNeeded(sit);
    const what =
      sit.vsFpm >= 50
        ? L(
            `a ${Math.round(sit.vsFpm)} ft/min climb at ${Math.round(sit.iasKt)} kt`,
            `une montée à ${Math.round(sit.vsFpm)} ft/min à ${Math.round(sit.iasKt)} kt`,
          )
        : sit.vsFpm <= -50
          ? L(
              `a ${Math.abs(Math.round(sit.vsFpm))} ft/min descent at ${Math.round(sit.iasKt)} kt`,
              `une descente à ${Math.abs(Math.round(sit.vsFpm))} ft/min à ${Math.round(sit.iasKt)} kt`,
            )
          : L(
              `level flight at ${Math.round(sit.iasKt)} kt`,
              `le palier à ${Math.round(sit.iasKt)} kt`,
            );
    const range = climbRange(sit);
    if (need > 118)
      out.push({
        level: "error",
        field: "power",
        text:
          sit.vsFpm >= 50 && range.up > 0
            ? L(
                `The engine does not have the power for ${what.en} at ${Math.round(sit.altFt)} ft: full power gives about ${range.up} ft/min at this speed.`,
                `Le moteur n’a pas la puissance pour ${what.fr} à ${Math.round(sit.altFt)} ft : la pleine puissance donne environ ${range.up} ft/min à cette vitesse.`,
              )
            : L(
                `The engine does not have the power for ${what.en} at ${Math.round(sit.altFt)} ft, even at full power.`,
                `Le moteur n’a pas la puissance pour ${what.fr} à ${Math.round(sit.altFt)} ft, même à pleine puissance.`,
              ),
        ...(sit.vsFpm >= 50 && range.up >= 100
          ? {
              fix: {
                label: L(`Set +${range.up} ft/min, full power`, `Afficher +${range.up} ft/min, pleine puissance`),
                patch: { vsFpm: range.up, power: 100 },
              },
            }
          : {}),
      });
    else if (need < -18)
      out.push({
        level: "error",
        field: "vsFpm",
        text: L(
          `Even at idle the aircraft comes down at about ${Math.abs(range.down)} ft/min at ${Math.round(sit.iasKt)} kt: for ${what.en} it would speed up.`,
          `Même moteur réduit, l’avion descend à environ ${Math.abs(range.down)} ft/min à ${Math.round(sit.iasKt)} kt : pour ${what.fr}, il accélérerait.`,
        ),
        fix: {
          label: L(`Set ${range.down} ft/min, idle`, `Afficher ${range.down} ft/min, moteur réduit`),
          patch: { vsFpm: range.down, power: 0 },
        },
      });
    else if (!sit.trimmed && Math.abs(need - sit.power) > 8)
      out.push({
        level: "info",
        field: "power",
        text: L(
          `${Math.round(sit.power)} % of power does not hold ${what.en} (it takes about ${clamp(need, 0, 100)} %). Stabilise lets the aircraft fly a few seconds and keeps what it really does.`,
          `${Math.round(sit.power)} % de puissance ne tient pas ${what.fr} (il en faut environ ${clamp(need, 0, 100)} %). Stabiliser laisse l’avion voler quelques secondes et garde ce qu’il fait vraiment.`,
        ),
      });
  }
  return out;
}

// ---------------------------------------------------------------- editing
const FLIGHT_KEYS: (keyof Situation)[] = [
  "altFt",
  "iasKt",
  "vsFpm",
  "bank",
  "pitch",
  "power",
  "flaps",
  "failures",
];

/** A situation with some fields changed, kept inside the limits. A flight value that changes forgets the trim. */
export function editSituation(
  sit: Situation,
  patch: Partial<Situation>,
): Situation {
  const n: Situation = { ...sit, ...patch };
  const lim = SIT_LIMITS;
  n.hdg = Math.round(norm360(n.hdg)) % 360;
  n.altFt = clamp(Math.round(n.altFt / 10) * 10, lim.altFt.min, lim.altFt.max);
  n.iasKt = clamp(Math.round(n.iasKt), 0, 200);
  n.vsFpm = clamp(Math.round(n.vsFpm / 10) * 10, -3000, 3000);
  n.bank = clamp(Math.round(n.bank), lim.bank.min, lim.bank.max);
  n.pitch =
    n.pitch === null || n.pitch === undefined
      ? null
      : clamp(Math.round(n.pitch), lim.pitch.min, lim.pitch.max);
  n.power = clamp(Math.round(n.power), 0, 100);
  n.flaps = clamp(Math.round(n.flaps), 0, 3);
  n.obs1 = Math.round(norm360(n.obs1)) % 360;
  n.obs2 = Math.round(norm360(n.obs2)) % 360;
  n.wind = {
    dir: Math.round(norm360(n.wind.dir)) % 360,
    kt: clamp(Math.round(n.wind.kt), 0, lim.windKt.max),
  };
  n.ceilingFt = clamp(
    Math.round(n.ceilingFt / 100) * 100,
    lim.ceilingFt.min,
    lim.ceilingFt.max,
  );
  if (
    FLIGHT_KEYS.some(
      (k) => k in patch && JSON.stringify(patch[k]) !== JSON.stringify(sit[k]),
    )
  )
    delete n.trimmed;
  return n;
}

/**
 * Move the aircraft somewhere and set what goes with the place: on an ILS the heading, the altitude of the glide
 * path, NAV1 and the course; in a hold the inbound heading and the station. `set` says what was set, for one line
 * under the field.
 */
export function placeAt(
  sit: Situation,
  pos: SitPos,
): { sit: Situation; set: L10n | null } {
  if (pos.kind === "ils") {
    const ils = ilsList().find(
      (i) => i.airport === pos.airport && i.rwy === pos.rwy,
    );
    let elev = 0;
    try {
      elev = groundElevation(runway(pos.airport, pos.rwy).threshold);
    } catch {
      /* unknown runway: the check says so */
    }
    const alt = Math.round((elev + 50 + pos.distNm * 318) / 10) * 10;
    const ias = clamp(sit.iasKt, 65, 110);
    return {
      sit: editSituation(sit, {
        pos,
        altFt: alt,
        iasKt: ias,
        vsFpm: -Math.round((ias * 5.3) / 50) * 50,
        bank: 0,
        ...(ils
          ? {
              hdg: ils.course,
              nav1: ils.ident,
              obs1: ils.course,
              source: "NAV1" as const,
            }
          : {}),
      }),
      set: ils
        ? L(
            `Heading ${pad3(ils.course)}, ${alt} ft on the glide path, NAV1 on ${ils.ident}.`,
            `Cap ${pad3(ils.course)}, ${alt} ft sur le plan de descente, NAV1 sur ${ils.ident}.`,
          )
        : null,
    };
  }
  if (pos.kind === "hold") {
    const vor = station(pos.fix)?.type !== "NDB";
    return {
      sit: editSituation(sit, {
        pos,
        hdg: pos.inbound,
        bank: 0,
        vsFpm: 0,
        ...(vor
          ? { nav1: pos.fix, obs1: pos.inbound, source: "NAV1" as const }
          : { adf: pos.fix }),
      }),
      set: L(
        `On the inbound leg, 2 NM from ${pos.fix}, heading ${pad3(pos.inbound)}.`,
        `Sur la branche de rapprochement, à 2 NM de ${pos.fix}, cap ${pad3(pos.inbound)}.`,
      ),
    };
  }
  if (pos.kind === "radial") {
    const st = station(pos.station);
    const ndb = st?.type === "NDB";
    return {
      sit: editSituation(sit, {
        pos,
        ...(ndb
          ? { adf: pos.station }
          : sit.nav1 && station(sit.nav1)?.type !== "ILS"
            ? {}
            : { nav1: pos.station }),
      }),
      set: null,
    };
  }
  return { sit: editSituation(sit, { pos }), set: null };
}

// ---------------------------------------------------------------- Situation ⇄ SimScene
/** the trim that holds a speed, before « Stabiliser » has measured it (the cockpit's load trim holds ~100 kt) */
const guessTrim = (iasKt: number) =>
  clamp(-0.3 - (iasKt - 100) / 75, -0.8, 0.6);

export interface SceneOfOptions {
  id?: string;
  label?: string;
  /** the scene the situation replaces: its cockpit, world, equipment, seed, covers (and its plan) are kept */
  base?: SimScene;
}
/** The SimScene of a situation: a fields pose the simulator applies, with the situation stored for the form. */
export function sceneOfSituation(
  sit: Situation,
  o: SceneOfOptions = {},
): SimScene {
  const base = o.base;
  const pos = fieldsPos(sit.pos) ?? fieldsPos(defaultSituation().pos)!;
  const pitch = sit.pitch ?? sit.trimmed?.pitch ?? pitchFor(sit);
  const baseRadios =
    base?.pose.kind === "fields" ? (base.pose.radios ?? {}) : {};
  const navF = (id: string | null) => (id ? station(id)?.freq : undefined);
  const radios: NonNullable<SceneFields["radios"]> = {
    ...(baseRadios.baro !== undefined ? { baro: baseRadios.baro } : {}),
    ...(baseRadios.minimums !== undefined
      ? { minimums: baseRadios.minimums }
      : {}),
    ...(baseRadios.brg1 ? { brg1: baseRadios.brg1 } : {}),
    ...(baseRadios.brg2 ? { brg2: baseRadios.brg2 } : {}),
    ...(navF(sit.nav1) !== undefined ? { nav1: navF(sit.nav1) } : {}),
    ...(navF(sit.nav2) !== undefined ? { nav2: navF(sit.nav2) } : {}),
    ...(navF(sit.adf) !== undefined
      ? { adf: navF(sit.adf), brg2: "ADF" as const }
      : {}),
    obs1: sit.obs1,
    obs2: sit.obs2,
    cdi: sit.source,
  };
  const keepPlan =
    base?.plan && sit.pos.kind !== "hold" && base.situation?.pos.kind !== "hold"
      ? base.plan
      : undefined;
  const weather: SimScene["weather"] = {
    ...(base?.weather?.qnh !== undefined ? { qnh: base.weather.qnh } : {}),
    ...(base?.weather?.oatSeaLevelC !== undefined
      ? { oatSeaLevelC: base.weather.oatSeaLevelC }
      : {}),
    windDir: sit.wind.dir,
    windKt: sit.wind.kt,
    gustKt: 0,
    turbulence: 0,
    ...(sit.wx === "imc"
      ? {
          ceilingFt: sit.ceilingFt,
          cloudTopFt: Math.max(
            sit.ceilingFt + 3000,
            Math.round(sit.altFt) + 2000,
          ),
          visibilitySm: 1.5,
        }
      : { ceilingFt: 25000, cloudTopFt: 27000, visibilitySm: 20 }),
  };
  const failures = Object.fromEntries(sit.failures.map((k) => [k, true]));
  const scene: SimScene = {
    v: 1,
    id: o.id ?? base?.id ?? newSceneId(),
    label: o.label ?? sitLabel(sit),
    world: base?.world ?? { kind: "training" },
    cockpit: base?.cockpit ?? "g1000",
    ...(base?.equipment ? { equipment: { ...base.equipment } } : {}),
    pose: {
      kind: "fields",
      pos,
      altFt: sit.altFt,
      hdg: sit.hdg,
      iasKt: sit.iasKt,
      pitch,
      bank: sit.bank,
      vsFpm: sit.vsFpm,
      radios,
    },
    ...(sit.ap
      ? {
          ap: {
            engaged: true,
            fd: true,
            lat: "HDG",
            vert: Math.abs(sit.vsFpm) >= 50 ? "VS" : "ALT",
            hdg: sit.hdg,
            alt: sit.altFt,
            ...(Math.abs(sit.vsFpm) >= 50 ? { vs: sit.vsFpm } : {}),
          },
        }
      : {}),
    ...(sit.pos.kind === "hold"
      ? {
          plan: {
            idents: [
              `${sit.pos.fix}/H${pad3(sit.pos.inbound)}${sit.pos.turn}1`,
            ],
            activeLeg: 0,
          },
        }
      : keepPlan
        ? {
            plan: JSON.parse(JSON.stringify(keepPlan)) as NonNullable<
              SimScene["plan"]
            >,
          }
        : {}),
    controls: {
      throttle: sit.power / 100,
      trim: sit.trimmed?.trim ?? guessTrim(sit.iasKt),
      flaps: sit.flaps,
      ...(base?.controls?.mixture !== undefined
        ? { mixture: base.controls.mixture }
        : {}),
    },
    weather,
    seed: base?.seed ?? 1,
    ...(sit.failures.length ? { failures } : {}),
    ...(base?.covers?.length ? { covers: [...base.covers] } : {}),
    ...(sit.night ? { timeOfDay: "night" as const } : {}),
    captured: {
      at: base?.captured?.at ?? new Date().toISOString(),
      from: "fields",
    },
    situation: JSON.parse(JSON.stringify(sit)) as Situation,
  };
  return scene;
}

/**
 * The situation a scene shows: the one stored with it, or what its instruments read (a capture from the cockpit,
 * a scene written by hand). `sim`: a Sim already posed at the scene (the editor has one); built here otherwise.
 */
export function situationOfScene(scene: SimScene, sim?: Sim): Situation {
  if (scene.situation)
    return editSituation({ ...defaultSituation(), ...scene.situation }, {});
  let s = sim;
  if (!s) {
    s = new Sim();
    try {
      applyScene(s, scene);
    } catch {
      return defaultSituation();
    }
  }
  const f = fieldsOf(s);
  const fp = scene.pose.kind === "fields" ? scene.pose.pos : null;
  let pos: SitPos;
  if (fp && "fix" in fp && station(fp.fix))
    pos = {
      kind: "radial",
      station: fp.fix,
      radial: fp.radial,
      distNm: fp.distNm,
    };
  else if (fp && "runway" in fp && !fp.offsetDeg)
    pos = {
      kind: "ils",
      airport: fp.runway.icao,
      rwy: fp.runway.id,
      distNm: fp.distNm,
    };
  else pos = { kind: "free", lat: s.ac.s.lat, lon: s.ac.s.lon };
  const byFreq = (freq: number, kinds: string[]) =>
    NAVAIDS.find(
      (n) => kinds.includes(n.type) && Math.abs(n.freq - freq) < 0.005,
    )?.ident ?? null;
  const w = s.weather;
  const base = defaultSituation();
  const sit: Situation = {
    ...base,
    hdg: f.hdg,
    altFt: f.altFt,
    iasKt: f.iasKt,
    vsFpm: Math.abs(f.vsFpm ?? 0) < 50 ? 0 : (f.vsFpm ?? 0),
    bank: Math.abs(f.bank ?? 0) < 1 ? 0 : Math.round(f.bank ?? 0),
    pitch: null,
    power: Math.round(s.controls.throttle * 100),
    flaps: s.controls.flaps,
    pos,
    nav1: byFreq(s.av.nav1.active, ["VOR", "VORDME", "ILS", "LOC"]),
    nav2: byFreq(s.av.nav2.active, ["VOR", "VORDME", "ILS", "LOC"]),
    adf:
      s.av.bearing2 === "ADF" || s.av.bearing1 === "ADF"
        ? byFreq(s.av.adf.active, ["NDB"])
        : null,
    obs1: Math.round(s.av.obs1),
    obs2: Math.round(s.av.obs2),
    source: s.av.cdi,
    wind: { dir: Math.round(w.windDir), kt: Math.round(w.windKt) },
    wx: w.ceilingFt < 10000 ? "imc" : "vmc",
    ceilingFt: w.ceilingFt < 10000 ? w.ceilingFt : base.ceilingFt,
    failures: (Object.keys(s.failures) as FailureKey[]).filter(
      (k) => s!.failures[k],
    ),
    ap: !!s.ap.ap,
    night: scene.timeOfDay === "night",
    // what the instruments read now stays until a flight value is changed
    trimmed: { pitch: f.pitch ?? 0, trim: s.controls.trim },
  };
  return editSituation(sit, {});
}

// ---------------------------------------------------------------- « Stabiliser »
/** what leads: the power set (the speed follows), the speed asked (the power follows), or the pitch set */
export type StabDriver = "power" | "speed" | "pitch";
export interface StabResult {
  ok: boolean;
  /** the situation after the flight (unchanged when it did not hold) */
  sit: Situation;
  secs: number;
  /** what changed, or why it does not hold, in one sentence */
  text: L10n;
}

/**
 * The real flight model flies the situation: the vertical speed and the bank asked are held (pitch and ailerons),
 * the power stays where the author put it and the speed settles (or the other way round), until nothing moves any
 * more. Stepped by the caller so the instruments can follow; `finish()` gives the result.
 */
export class StabiliseRun {
  readonly sim: Sim;
  t = 0;
  done = false;
  private stalled = false;
  private pitchInt = 0;
  private spdInt = 0;
  private thrInt = 0;
  private pitch0: number;
  private lastPitch: number | null = null;
  private lastRoll: number | null = null;
  private lastIas: number | null = null;
  private lastVs: number | null = null;
  private iasRate = 0;
  private vsRate = 0;
  private bankCmd: number;
  private window: { t: number; ias: number; vs: number; thr: number }[] = [];
  private altFt: number;
  /** a failed pitot or static source: the controller flies on the true speed, as an instructor would */
  private blind: boolean;
  constructor(
    readonly start: Situation,
    readonly driver: StabDriver = "power",
    private maxS = 150,
    base?: SimScene,
  ) {
    this.sim = new Sim();
    // fly it by hand: the autopilot would fight the controller, and the failures of the lesson stay
    applyScene(this.sim, sceneOfSituation({ ...start, ap: false }, { base, id: "stab" }));
    this.sim.paused = false;
    this.bankCmd = start.bank;
    this.altFt = this.sim.ac.s.altFt;
    this.pitch0 = this.sim.ac.data.pitchDeg;
    this.thrInt = this.sim.controls.throttle;
    this.blind = start.failures.some((f) => f === "pitotBlocked" || f === "pitotIcing" || f === "staticBlocked" || f === "airData");
  }
  /** the speed the aircraft really flies (kt, indicated unless the pitot-static system has failed) */
  private ias(): number {
    const d = this.sim.ac.data;
    if (!this.blind) return d.iasKt;
    const sigma = Math.pow(1 - 6.8756e-6 * clamp(this.sim.ac.s.altFt, 0, 20000), 4.2559);
    return d.tasKt * Math.sqrt(sigma);
  }
  /** fly `seconds` more (sim time) */
  step(seconds: number): void {
    const dt = 1 / 30;
    for (let k = Math.round(seconds / dt); k > 0 && !this.done; k--) this.tick(dt);
  }
  private tick(dt: number) {
    const sim = this.sim;
    const d = sim.ac.data;
    const c = sim.controls;
    const s = this.start;
    const ias = this.ias();
    const pr = this.lastPitch === null ? 0 : (d.pitchDeg - this.lastPitch) / dt;
    const rr = this.lastRoll === null ? 0 : (d.rollDeg - this.lastRoll) / dt;
    const acc = this.lastIas === null ? 0 : (ias - this.lastIas) / dt;
    const vsd = this.lastVs === null ? 0 : (d.vsFpm - this.lastVs) / dt;
    this.iasRate += (clamp(acc, -6, 6) - this.iasRate) * Math.min(1, dt / 0.8);
    this.vsRate += (clamp(vsd, -400, 400) - this.vsRate) * Math.min(1, dt / 1.5);
    this.lastPitch = d.pitchDeg;
    this.lastRoll = d.rollDeg;
    this.lastIas = ias;
    this.lastVs = d.vsFpm;
    // bank
    this.bankCmd += (s.bank - this.bankCmd) * Math.min(1, dt * 1.6);
    c.aileron = clamp((this.bankCmd - d.rollDeg) * 0.02 - rr * 0.012, -0.35, 0.35);
    c.rudder = 0;
    let pitch: number;
    if (this.driver === "pitch" && s.pitch !== null) pitch = s.pitch;
    else if (this.driver === "speed") {
      // pitch for the speed asked, power for the path: stable on both sides of the power curve
      const e = ias - s.iasKt;
      this.spdInt = clamp(this.spdInt + e * SPD.i * dt, -14, 14);
      pitch = clamp(this.pitch0 + e * SPD.p + this.spdInt + this.iasRate * SPD.d, -15, 18);
      const ve = s.vsFpm - d.vsFpm;
      this.thrInt = clamp(this.thrInt + ve * SPD.ti * dt, -0.2, 1.2);
      c.throttle = clamp(this.thrInt + ve * SPD.tp - this.vsRate * SPD.td, 0, 1);
    } else {
      // the power stays where it is: the pitch holds the vertical speed and the speed settles
      const tasFpm = Math.max(40, d.tasKt) * 101.27;
      const gC = Math.asin(clamp(s.vsFpm / tasFpm, -0.5, 0.5)) / DEG;
      this.pitchInt = clamp(this.pitchInt + (s.vsFpm - d.vsFpm) * 0.0012 * dt, -8, 8);
      pitch = clamp(gC + d.aoaDeg + this.pitchInt + (s.vsFpm - d.vsFpm) * 0.002, -15, 18);
    }
    const pe = pitch - d.pitchDeg;
    c.elevator = clamp(pe * 0.07 - pr * 0.025, -0.4, 0.4);
    c.trim = clamp(c.trim + pe * 0.012 * dt, -1, 1);
    sim.step(dt);
    this.t += dt;
    // the height asked is kept (a climb is a rate, not a place to go): the air stays the same, the ground stays away
    if (Math.abs(sim.ac.s.altFt - this.altFt) > 200) shiftAltitude(sim, this.altFt);
    const now = this.ias();
    if (sim.ac.s.crashed || sim.ac.s.onGround || (this.t > 3 && now < stallKt(s.flaps, sim.ac.data.rollDeg) - 1)) {
      this.stalled = true;
      this.done = true;
      return;
    }
    // steady: over the last 5 s the speed, the vertical speed and the throttle have stopped moving
    if (Math.round(this.t * 30) % 15 === 0) {
      const vs = sim.ac.data.vsFpm;
      this.window.push({ t: this.t, ias: now, vs, thr: c.throttle });
      while (this.window.length && this.window[0].t < this.t - 5) this.window.shift();
      const w0 = this.window[0];
      const steady =
        this.window.length >= 10 &&
        Math.abs(now - w0.ias) < 0.4 &&
        Math.abs(vs - w0.vs) < 40 &&
        Math.abs(c.throttle - w0.thr) < 0.006;
      const pinned = c.throttle >= 0.995 || c.throttle <= 0.005;
      const onTarget =
        this.driver === "power"
          ? Math.abs(vs - s.vsFpm) < 60
          : this.driver === "speed"
            ? Math.abs(now - s.iasKt) < 1 && (pinned || Math.abs(vs - s.vsFpm) < 50)
            : true;
      if (this.t > 10 && steady && onTarget) this.done = true;
    }
    if (this.t >= this.maxS) this.done = true;
  }
  /** the situation as the aircraft flies it now (the instruments follow the run) */
  now(): Situation {
    const d = this.sim.ac.data;
    const s = this.start;
    const thr = this.sim.controls.throttle;
    const pinned = this.driver === "speed" && (thr >= 0.995 || thr <= 0.005) && Math.abs(d.vsFpm - s.vsFpm) > 60;
    return {
      ...s,
      iasKt: this.blind ? s.iasKt : Math.round(this.ias()),
      power: Math.round(thr * 100),
      vsFpm: this.driver === "pitch" || pinned ? Math.round(d.vsFpm / 50) * 50 : s.vsFpm,
      pitch: this.driver === "pitch" ? s.pitch : null,
      trimmed: {
        pitch: Math.round(d.pitchDeg * 10) / 10,
        trim: Math.round(this.sim.controls.trim * 1000) / 1000,
      },
    };
  }
  finish(): StabResult {
    const s = this.start;
    const secs = Math.round(this.t);
    const sign = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;
    if (this.stalled) {
      const vs = Math.round(stallKt(s.flaps, s.bank));
      return {
        ok: false,
        sit: s,
        secs,
        text:
          this.driver === "pitch"
            ? L(
                `At ${s.pitch}° of pitch with ${s.power} % of power the aircraft slows down to the stall (about ${vs} kt). Lower the nose or add power.`,
                `À ${s.pitch}° d’assiette avec ${s.power} % de puissance, l’avion ralentit jusqu’au décrochage (vers ${vs} kt). Baissez le nez ou ajoutez de la puissance.`,
              )
            : L(
                `With ${Math.round(this.sim.controls.throttle * 100)} % of power the aircraft cannot hold ${this.what().en}: it slows down to the stall (about ${vs} kt). Add power or ask for less.`,
                `Avec ${Math.round(this.sim.controls.throttle * 100)} % de puissance, l’avion ne tient pas ${this.what().fr} : il ralentit jusqu’au décrochage (vers ${vs} kt). Ajoutez de la puissance ou demandez moins.`,
              ),
      };
    }
    const n = this.now();
    const out = editSituation(n, {});
    out.trimmed = n.trimmed;
    const dIas = out.iasKt - s.iasKt;
    const dPow = out.power - s.power;
    let text: L10n;
    if (this.driver === "speed" && out.vsFpm !== s.vsFpm)
      text =
        out.power >= 99
          ? L(
              `At full power and ${out.iasKt} kt the aircraft gives ${sign(out.vsFpm)} ft/min here, not ${sign(s.vsFpm)}. The situation now shows ${sign(out.vsFpm)} ft/min.`,
              `À pleine puissance et ${out.iasKt} kt, l’avion donne ${sign(out.vsFpm)} ft/min ici, et non ${sign(s.vsFpm)}. La situation affiche maintenant ${sign(out.vsFpm)} ft/min.`,
            )
          : L(
              `Even at idle, at ${out.iasKt} kt the aircraft gives ${sign(out.vsFpm)} ft/min, not ${sign(s.vsFpm)}. The situation now shows ${sign(out.vsFpm)} ft/min.`,
              `Même au ralenti, à ${out.iasKt} kt l’avion donne ${sign(out.vsFpm)} ft/min, et non ${sign(s.vsFpm)}. La situation affiche maintenant ${sign(out.vsFpm)} ft/min.`,
            );
    else if (this.driver === "speed")
      text =
        Math.abs(dPow) >= 3
          ? L(
              `Steady: ${out.iasKt} kt takes ${out.power} % of power here (it was ${s.power} %).`,
              `Stable : ${out.iasKt} kt demande ${out.power} % de puissance ici (au lieu de ${s.power} %).`,
            )
          : L(
              `Steady: ${out.iasKt} kt at ${out.power} % of power.`,
              `Stable : ${out.iasKt} kt à ${out.power} % de puissance.`,
            );
    else if (this.driver === "pitch")
      text = L(
        `Steady at ${s.pitch}° of pitch: ${out.iasKt} kt, ${sign(out.vsFpm)} ft/min.`,
        `Stable à ${s.pitch}° d’assiette : ${out.iasKt} kt, ${sign(out.vsFpm)} ft/min.`,
      );
    else
      text =
        Math.abs(dIas) >= 2
          ? L(
              `Steady: with ${out.power} % of power the aircraft flies ${out.iasKt} kt here (it showed ${s.iasKt} kt).`,
              `Stable : avec ${out.power} % de puissance, l’avion vole à ${out.iasKt} kt ici (au lieu de ${s.iasKt} kt).`,
            )
          : L(
              `Steady: ${out.iasKt} kt at ${out.power} % of power.`,
              `Stable : ${out.iasKt} kt à ${out.power} % de puissance.`,
            );
    return { ok: true, sit: out, secs, text };
  }
  private what(): L10n {
    const s = this.start;
    const turn =
      Math.abs(s.bank) >= 5
        ? L(
            ` in a ${Math.abs(s.bank)}° turn`,
            ` en virage à ${Math.abs(s.bank)}°`,
          )
        : L("", "");
    const base =
      s.vsFpm >= 50
        ? L(`a ${s.vsFpm} ft/min climb`, `la montée à ${s.vsFpm} ft/min`)
        : s.vsFpm <= -50
          ? L(
              `a ${-s.vsFpm} ft/min descent`,
              `la descente à ${-s.vsFpm} ft/min`,
            )
          : L("level flight", "le palier");
    return L(base.en + turn.en, (base.fr ?? "") + (turn.fr ?? ""));
  }
}
/** gains of the speed-led controller (pitch for speed: p, i, d; power for path: tp, ti, td) */
export const SPD = { p: 0.5, i: 0.06, d: 1.2, tp: 0.0005, ti: 0.00012, td: 0.0003 };
/** « Stabiliser » in one call (tests, and a studio without animation). */
export function stabilise(
  sit: Situation,
  driver: StabDriver = "power",
  maxS = 150,
): StabResult {
  const run = new StabiliseRun(sit, driver, maxS);
  while (!run.done) run.step(1);
  return run.finish();
}

// ---------------------------------------------------------------- situations prêtes
export interface ReadySituation {
  id: string;
  name: L10n;
  /** what it is for, one line */
  note: L10n;
  /** the instrument that shows it best (the tiny live preview) */
  preview: "six" | "ai" | "hsi" | "cdi" | "rmi" | "pfd";
  sit: Situation;
}
const R = (over: Partial<Situation>): Situation => ({
  ...defaultSituation(),
  ...over,
});
const EAST_OF_ARD: SitPos = {
  kind: "radial",
  station: "ARD",
  radial: 90,
  distNm: 8,
};

/** Named starting points: every one is a steady flight of the aircraft (the test flies them). */
export const READY_SITUATIONS: ReadySituation[] = [
  {
    id: "level",
    name: L("Level flight, 3,000 ft, 100 kt", "En palier, 3 000 ft, 100 kt"),
    note: L(
      "The reference picture of straight and level flight.",
      "L’image de référence du vol rectiligne en palier.",
    ),
    preview: "six",
    sit: R({ hdg: 270, altFt: 3000, iasKt: 100, power: 58 }),
  },
  {
    id: "climb",
    name: L("Climb at VY", "Montée à VY"),
    note: L(
      "Full power, 74 kt: the best rate of climb.",
      "Pleine puissance, 74 kt : le meilleur taux de montée.",
    ),
    preview: "six",
    sit: R({ hdg: 270, altFt: 2500, iasKt: 74, vsFpm: 650, power: 100 }),
  },
  {
    id: "descent",
    name: L("Descent at 500 ft/min", "Descente à 500 ft/min"),
    note: L(
      "Power reduced, speed held: a steady descent.",
      "Puissance réduite, vitesse tenue : une descente stable.",
    ),
    preview: "six",
    sit: R({ hdg: 270, altFt: 4000, iasKt: 100, vsFpm: -500, power: 34 }),
  },
  {
    id: "rate1-left",
    name: L("Standard-rate turn to the left", "Virage standard à gauche"),
    note: L(
      "3° per second: 2 minutes for a full turn.",
      "3° par seconde : 2 minutes pour un tour complet.",
    ),
    preview: "six",
    sit: R({ hdg: 360, altFt: 3000, iasKt: 100, bank: -15, power: 58 }),
  },
  {
    id: "steep",
    name: L("Steep turn, 45°", "Virage à 45°"),
    note: L(
      "Load factor 1.4: back pressure and power.",
      "Facteur de charge 1,4 : il faut tirer et remettre de la puissance.",
    ),
    preview: "six",
    sit: R({ hdg: 90, altFt: 3500, iasKt: 95, bank: 45, power: 72 }),
  },
  {
    id: "slow",
    name: L("Slow flight", "Vol lent"),
    note: L(
      "Flaps 30°, 55 kt, nose high: the back of the power curve.",
      "Volets 30°, 55 kt, nez haut : le second régime.",
    ),
    preview: "six",
    sit: R({ hdg: 180, altFt: 3500, iasKt: 55, flaps: 3, power: 52 }),
  },
  {
    id: "climbing-turn",
    name: L("Climbing turn to the right", "Virage en montée à droite"),
    note: L(
      "15° of bank in the climb: speed first.",
      "15° d’inclinaison en montée : la vitesse d’abord.",
    ),
    preview: "six",
    sit: R({
      hdg: 30,
      altFt: 2500,
      iasKt: 80,
      vsFpm: 500,
      bank: 15,
      power: 69,
    }),
  },
  {
    id: "ils27",
    name: L("ILS 27 final at 5 NM", "Finale ILS 27 à 5 NM"),
    note: L(
      "On the localizer and the glide path, 90 kt.",
      "Sur l’axe et le plan, 90 kt.",
    ),
    preview: "pfd",
    sit: R({
      hdg: 270,
      altFt: 2060,
      iasKt: 90,
      vsFpm: -500,
      power: 24,
      pos: { kind: "ils", airport: "PARD", rwy: "27", distNm: 5 },
      nav1: "IPRD",
      obs1: 270,
      wx: "imc",
      ceilingFt: 800,
    }),
  },
  {
    id: "vor-inbound",
    name: L("Inbound to a VOR", "En rapprochement d’un VOR"),
    note: L(
      "On the 090 radial of ARD, course 270, TO: bar centred.",
      "Sur le radial 090 d’ARD, route 270, TO : barre centrée.",
    ),
    preview: "cdi",
    sit: R({
      hdg: 270,
      altFt: 4000,
      iasKt: 100,
      power: 60,
      pos: EAST_OF_ARD,
      nav1: "ARD",
      nav2: "ARD",
      obs1: 270,
      obs2: 270,
    }),
  },
  {
    id: "vor-intercept",
    name: L("Intercepting a radial", "Interception d’un radial"),
    note: L(
      "South of the course, heading 300 for a 30° intercept.",
      "Au sud de la route, cap 300 pour intercepter à 30°.",
    ),
    preview: "hsi",
    sit: R({
      hdg: 300,
      altFt: 4000,
      iasKt: 100,
      power: 60,
      pos: { kind: "radial", station: "ARD", radial: 100, distNm: 10 },
      nav1: "ARD",
      nav2: "ARD",
      obs1: 270,
      obs2: 270,
    }),
  },
  {
    id: "ndb-abeam",
    name: L("Abeam an NDB", "Travers d’un NDB"),
    note: L(
      "PA is on the right wing: the needle shows 090 relative.",
      "PA est sur l’aile droite : l’aiguille indique 090 de gisement.",
    ),
    preview: "rmi",
    sit: R({
      hdg: 360,
      altFt: 3000,
      iasKt: 100,
      power: 58,
      pos: { kind: "radial", station: "PA", radial: 270, distNm: 3 },
      adf: "PA",
      nav1: "ARD",
      obs1: 270,
    }),
  },
  {
    id: "hold",
    name: L("In the hold", "Dans l’attente"),
    note: L(
      "Inbound to ARD on 270, right turns, 90 kt.",
      "En rapprochement d’ARD au 270, virages à droite, 90 kt.",
    ),
    preview: "hsi",
    sit: R({
      hdg: 270,
      altFt: 4000,
      iasKt: 90,
      power: 50,
      pos: { kind: "hold", fix: "ARD", inbound: 270, turn: "R" },
      nav1: "ARD",
      obs1: 270,
    }),
  },
  {
    id: "vacuum",
    name: L("Vacuum failure", "Panne de dépression"),
    note: L(
      "The attitude indicator and the heading indicator are lost: partial panel.",
      "L’horizon et le conservateur de cap sont perdus : panneau partiel.",
    ),
    preview: "six",
    sit: R({
      hdg: 270,
      altFt: 3000,
      iasKt: 100,
      power: 58,
      failures: ["vacuum"],
      wx: "imc",
      ceilingFt: 1000,
    }),
  },
  {
    id: "night",
    name: L("At night", "De nuit"),
    note: L(
      "Level at 3,000 ft over Port Ardent, lights on.",
      "En palier à 3 000 ft au-dessus de Port Ardent, de nuit.",
    ),
    preview: "six",
    sit: R({
      hdg: 90,
      altFt: 3000,
      iasKt: 100,
      power: 58,
      pos: { kind: "over", airport: "PARD" },
      night: true,
    }),
  },
  {
    id: "pitot",
    name: L("Blocked pitot in the climb", "Pitot obstrué en montée"),
    note: L(
      "The airspeed rises with altitude: trust the attitude.",
      "La vitesse indiquée monte avec l’altitude : croire l’assiette.",
    ),
    preview: "six",
    sit: R({
      hdg: 270,
      altFt: 3000,
      iasKt: 80,
      vsFpm: 500,
      power: 70,
      failures: ["pitotBlocked"],
    }),
  },
];
export const readySituation = (id: string): ReadySituation | undefined =>
  READY_SITUATIONS.find((r) => r.id === id);

// ---------------------------------------------------------------- « Ce qu’on lui demande »: goal sentences
export interface GoalSentence {
  id: string;
  /** the sentence, written with the situation's own numbers */
  text(sit: Situation): L10n;
  checks(sit: Situation): GoalCheck[];
  holdS?: number;
  /** the controls the student needs for it */
  controls: StageControl[];
  /** where it makes sense: on the slide's instrument, in the full simulator, or both */
  where: ("slide" | "sim")[];
}
const r10 = (v: number) => Math.round(v / 10) * 10;
/** a heading as the goal checks want it (1 to 360) */
const h360 = (v: number) => Math.round(norm360(v)) % 360 || 360;
/** the heading a quarter turn to the right of the situation's */
const quarter = (sit: Situation) => Math.round(norm360(sit.hdg + 90)) % 360;

export const GOAL_SENTENCES: GoalSentence[] = [
  {
    id: "holdHeading",
    text: (s) =>
      L(
        `Hold heading ${pad3(s.hdg)} ± 10° for 10 s`,
        `Tenir le cap ${pad3(s.hdg)} ± 10° pendant 10 s`,
      ),
    checks: (s) => [
      { id: "heading", p: { value: h360(s.hdg), tol: 10 } } as GoalCheck,
    ],
    holdS: 10,
    controls: ["bank"],
    where: ["slide", "sim"],
  },
  {
    id: "turnTo",
    text: (s) =>
      L(
        `Turn right to heading ${pad3(quarter(s))} and hold it 5 s`,
        `Virer à droite au cap ${pad3(quarter(s))} et le tenir 5 s`,
      ),
    checks: (s) => [
      { id: "heading", p: { value: h360(quarter(s)), tol: 10 } } as GoalCheck,
    ],
    holdS: 5,
    controls: ["bank"],
    where: ["slide", "sim"],
  },
  {
    id: "holdAlt",
    text: (s) =>
      L(
        `Hold ${r10(s.altFt).toLocaleString("en-US")} ft ± 100 ft for 20 s`,
        `Tenir ${r10(s.altFt).toLocaleString("en-US").replace(/,/g, " ")} ft ± 100 ft pendant 20 s`,
      ),
    checks: (s) => [
      {
        id: "altBand",
        p: { min: r10(s.altFt) - 100, max: r10(s.altFt) + 100 },
      } as GoalCheck,
    ],
    holdS: 20,
    controls: ["pitch", "power"],
    where: ["slide", "sim"],
  },
  {
    id: "holdSpeed",
    text: (s) =>
      L(
        `Hold ${Math.round(s.iasKt)} kt ± 5 kt for 15 s`,
        `Tenir ${Math.round(s.iasKt)} kt ± 5 kt pendant 15 s`,
      ),
    checks: (s) => [
      {
        id: "ias",
        p: { min: Math.round(s.iasKt) - 5, max: Math.round(s.iasKt) + 5 },
      } as GoalCheck,
    ],
    holdS: 15,
    controls: ["pitch", "power"],
    where: ["slide", "sim"],
  },
  {
    id: "bank30",
    text: () =>
      L(
        "Hold a 30° ± 5° turn for 10 s",
        "Tenir un virage à 30° ± 5° pendant 10 s",
      ),
    checks: () => [{ id: "bankBand", p: { min: 25, max: 35 } }],
    holdS: 10,
    controls: ["bank", "pitch"],
    where: ["slide", "sim"],
  },
  {
    id: "climb500",
    text: () =>
      L(
        "Climb at 500 ft/min ± 100 for 10 s",
        "Monter à 500 ft/min ± 100 pendant 10 s",
      ),
    checks: () => [{ id: "vsBand", p: { min: 400, max: 600 } }],
    holdS: 10,
    controls: ["pitch", "power"],
    where: ["slide", "sim"],
  },
  {
    id: "descend500",
    text: () =>
      L(
        "Descend at 500 ft/min ± 100 for 10 s",
        "Descendre à 500 ft/min ± 100 pendant 10 s",
      ),
    checks: () => [{ id: "vsBand", p: { min: -600, max: -400 } }],
    holdS: 10,
    controls: ["pitch", "power"],
    where: ["slide", "sim"],
  },
  {
    id: "centreBar",
    text: () => L("Centre the bar with the OBS", "Centrer la barre avec l’OBS"),
    checks: () => [{ id: "cdiDefl", p: { maxDots: 0.5 } }],
    holdS: 2,
    controls: ["obs1", "obs2"],
    where: ["slide"],
  },
  {
    id: "setCourse",
    text: (s) =>
      L(
        `Set course ${pad3(s.obs1)} on the OBS`,
        `Afficher la route ${pad3(s.obs1)} à l’OBS`,
      ),
    checks: (s) => [{ id: "obs", p: { nav: 1, value: s.obs1, tol: 2 } }],
    controls: ["obs1"],
    where: ["slide"],
  },
  {
    id: "trackCourse",
    text: () =>
      L(
        "Intercept the course and keep the bar within one dot for 20 s",
        "Intercepter la route et garder la barre à moins d’un point pendant 20 s",
      ),
    checks: () => [{ id: "cdiDefl", p: { maxDots: 1 } }],
    holdS: 20,
    controls: ["bank", "hdgBug"],
    where: ["slide", "sim"],
  },
  {
    id: "flyIls",
    text: () =>
      L(
        "Keep the localizer and the glide path within one dot for 30 s",
        "Garder l’axe et le plan à moins d’un point pendant 30 s",
      ),
    checks: () => [
      { id: "cdiDefl", p: { maxDots: 1 } },
      { id: "gsDefl", p: { maxDots: 1 } },
    ],
    holdS: 30,
    controls: ["bank", "pitch", "power"],
    where: ["sim"],
  },
];
export const goalSentence = (id: string): GoalSentence | undefined =>
  GOAL_SENTENCES.find((g) => g.id === id);

/** The sentence a list of checks came from (so the picker shows it selected), or null for a hand-built goal. */
export function sentenceOf(
  yt: Pick<YourTurn, "goal">,
  sit: Situation,
): GoalSentence | null {
  const want = JSON.stringify(yt.goal.all);
  return (
    GOAL_SENTENCES.find(
      (g) =>
        JSON.stringify(g.checks(sit)) === want &&
        (g.holdS ?? 0) === (yt.goal.holdS ?? 0),
    ) ?? null
  );
}

/** The sentences that suit an instrument and a situation, the most natural first. */
export function sentencesFor(
  where: "slide" | "sim",
  sit: Situation,
  navInstrument = false,
): GoalSentence[] {
  const list = GOAL_SENTENCES.filter((g) => g.where.includes(where));
  const onIls = sit.pos.kind === "ils";
  const first = (ids: string[]) => [
    ...ids
      .map((id) => list.find((g) => g.id === id))
      .filter((g): g is GoalSentence => !!g),
    ...list.filter((g) => !ids.includes(g.id)),
  ];
  if (where === "sim" && onIls) return first(["flyIls"]);
  if (navInstrument)
    return first(
      where === "slide"
        ? ["centreBar", "setCourse", "trackCourse"]
        : ["trackCourse"],
    );
  if (Math.abs(sit.bank) >= 20) return first(["bank30"]);
  if (sit.vsFpm >= 200) return first(["climb500", "holdSpeed"]);
  if (sit.vsFpm <= -200) return first(["descend500", "holdSpeed"]);
  return first(["holdHeading", "holdAlt"]);
}

/** A ready « À vous » from a sentence: the task written out, the goal, the controls ticked. */
export function yourTurnFor(
  g: GoalSentence,
  sit: Situation,
  where: "slide" | "sim",
  scene?: string,
): YourTurn {
  const t = g.text(sit);
  return {
    where,
    prompt: L(`Your turn: ${lower(t.en)}.`, `À vous : ${lower(t.fr ?? t.en)}.`),
    ...(scene ? { scene } : {}),
    ...(where === "slide" ? { controls: [...g.controls] } : {}),
    goal: {
      all: g.checks(sit),
      ...(g.holdS ? { holdS: g.holdS } : {}),
      graded: false,
    },
    ...(where === "sim"
      ? { durationS: Math.max(60, (g.holdS ?? 10) * 4) }
      : {}),
    returnTo: "thisStep",
  };
}
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

// ---------------------------------------------------------------- a slide and its situation
type SimBlock = Extract<SlideBlock, { kind: "instrument" | "simViewport" }>;
const isSimBlock = (b: SlideBlock): b is SimBlock => b.kind === "instrument" || b.kind === "simViewport";

/** The scene id a block of a slide shows: its own, or the slide's (undefined: the sample situation). */
export function blockSceneId(slide: SlideCanvas, blockId?: string): { id: string | undefined; own: boolean } {
  const b = blockId ? slide.blocks.find((x) => x.id === blockId) : undefined;
  // a block that names the slide's own situation shows the slide's aircraft: it is not « its own situation »
  if (b && isSimBlock(b) && b.scene) return { id: b.scene, own: b.scene !== slide.scene };
  return { id: slide.scene, own: false };
}
/** How many other instruments and simulator views of the slide show the same situation as this block. */
export function sharedWith(slide: SlideCanvas, blockId?: string): number {
  const me = blockSceneId(slide, blockId).id;
  return slide.blocks.filter((b) => isSimBlock(b) && b.id !== blockId && (b.scene ?? slide.scene) === me).length;
}
/** Is a scene used by another step of the course (or by a recorded clip)? Then editing it here must not move it there. */
export function sceneUsedElsewhere(course: Course, sceneId: string, stepId: string): boolean {
  const needle = `"scene":${JSON.stringify(sceneId)}`;
  if (course.steps.some((s) => s.id !== stepId && JSON.stringify(s).includes(needle))) return true;
  return Object.values(course.clips ?? {}).some((c) => c.startScene === sceneId);
}
export interface SituationPlan {
  scene: SimScene;
  sceneId: string;
  /** a new scene: what showed the old one in this step must be pointed at it */
  isNew: boolean;
}
/**
 * Where an edited situation is stored: in the scene it came from when that scene belongs to this step alone;
 * in a new scene when there was none (the sample situation), or when other steps show the same one.
 */
export function planSituation(
  course: Course,
  stepId: string,
  cur: string | undefined,
  sit: Situation,
  fallback?: SimScene,
): SituationPlan {
  const have = cur ? course.scenes[cur] : undefined;
  const isNew = !have || sceneUsedElsewhere(course, cur!, stepId);
  const sceneId = isNew ? newSceneId() : cur!;
  const base = have ?? fallback;
  const scene = sceneOfSituation(sit, {
    id: sceneId,
    base: base ? { ...base, id: sceneId, cockpit: have ? base.cockpit : course.cockpit } : undefined,
  });
  if (!base) scene.cockpit = course.cockpit;
  return { scene, sceneId, isNew };
}
/** Point a slide (or one of its blocks, when it has its own situation) at a scene. */
export function repointSlide(slide: SlideCanvas, from: string | undefined, to: string, blockId?: string): SlideCanvas {
  const own = blockId ? blockSceneId(slide, blockId).own : false;
  const blocks = slide.blocks.map((b) => {
    if (!isSimBlock(b)) return b;
    const mine = own ? b.id === blockId : !!from && b.scene === from;
    if (!mine && !(b.yourTurn?.scene && b.yourTurn.scene === from && (!own || b.id === blockId))) return b;
    const n = { ...b } as SimBlock;
    if (mine) n.scene = to;
    if (n.yourTurn?.scene && n.yourTurn.scene === from) n.yourTurn = { ...n.yourTurn, scene: to };
    return n as SlideBlock;
  });
  return own ? { ...slide, blocks } : { ...slide, scene: to, blocks };
}
/** Give a block its own situation: a copy of the one it shows, under a new id (the others keep theirs). */
export function splitBlock(
  course: Course,
  slide: SlideCanvas,
  blockId: string,
  fallback: SimScene,
): { scene: SimScene; slide: SlideCanvas } | null {
  const b = slide.blocks.find((x) => x.id === blockId);
  if (!b || !isSimBlock(b)) return null;
  const cur = blockSceneId(slide, blockId).id;
  const src = (cur ? course.scenes[cur] : undefined) ?? fallback;
  const id = newSceneId();
  const scene: SimScene = { ...(JSON.parse(JSON.stringify(src)) as SimScene), id };
  const blocks = slide.blocks.map((x) => (x.id === blockId ? ({ ...x, scene: id } as SlideBlock) : x));
  return { scene, slide: { ...slide, blocks } };
}
/** The block shows the slide's situation again. */
export function joinBlock(slide: SlideCanvas, blockId: string): SlideCanvas {
  return {
    ...slide,
    blocks: slide.blocks.map((x) => {
      if (x.id !== blockId || !isSimBlock(x)) return x;
      const { scene: _s, ...rest } = x;
      void _s;
      return rest as SlideBlock;
    }),
  };
}

// ---------------------------------------------------------------- « Ajouter » : four simulator contents, ready to work
export type SimContentKind = "live" | "yourTurn" | "moment" | "flight";
export interface SimContentDef {
  kind: SimContentKind;
  name: L10n;
  /** one line: what the student gets */
  line: L10n;
}
export const SIM_CONTENTS: SimContentDef[] = [
  {
    kind: "live",
    name: L("Live instrument", "Instrument vivant"),
    line: L("The instrument shows what the aircraft does, and moves.", "L’instrument montre ce que fait l’avion, et il bouge."),
  },
  {
    kind: "yourTurn",
    name: L("Your turn on the instrument", "À vous sur l’instrument"),
    line: L("The student takes the controls on the slide, with a goal.", "L’élève prend les commandes sur la diapo, avec un objectif."),
  },
  {
    kind: "moment",
    name: L("Flight moment", "Moment de vol"),
    line: L("A view of the simulator, or a recorded moment, on the slide.", "Une vue du simulateur, ou un moment enregistré, sur la diapo."),
  },
  {
    kind: "flight",
    name: L("Flight in the simulator", "Vol dans le simulateur"),
    line: L("A full flight with a goal, then back to the course.", "Un vol complet avec un objectif, puis retour au cours."),
  },
];
/** a block before it is placed (canvas/factory.ts BlockDraft, for the two simulator kinds) */
export type SimDraft = SimBlock extends infer B
  ? B extends SimBlock
    ? Omit<B, "id" | "frame"> & { frame: { w: number; h: number } }
    : never
  : never;
/** the instrument a cockpit teaches on: the six instruments, or the glass PFD */
export function mainInstrument(cockpit: SimScene["cockpit"]): Extract<SlideBlock, { kind: "instrument" }>["view"] {
  return cockpit === "steam" ? { kind: "six" } : cockpit === "airliner" ? { kind: "airlinerPfd" } : { kind: "pfd" };
}
/**
 * The block one of the four choices puts on the slide: never an empty shell. The instrument is live, the controls
 * of the goal are ticked, the goal is a sentence written with the situation's numbers.
 */
export function simContentDraft(
  kind: SimContentKind,
  sit: Situation,
  cockpit: SimScene["cockpit"],
  clip?: string,
): SimDraft {
  const view = mainInstrument(cockpit);
  const instFrame = view.kind === "six" ? { w: 864, h: 648 } : { w: 816, h: 612 };
  const onIls = sit.pos.kind === "ils";
  switch (kind) {
    case "live":
      return {
        kind: "instrument",
        view,
        mode: "live",
        alt: L("The instruments, live", "Les instruments, en direct"),
        frame: instFrame,
      };
    case "yourTurn": {
      const g = sentencesFor("slide", sit, false)[0];
      const yt = yourTurnFor(g, sit, "slide");
      return {
        kind: "instrument",
        view,
        mode: "live",
        controls: [...g.controls],
        yourTurn: yt,
        alt: L("The instruments: your turn", "Les instruments : à vous"),
        frame: { w: instFrame.w, h: instFrame.h + 168 },
      };
    }
    case "moment":
      return {
        kind: "simViewport",
        view: "outside",
        ...(clip ? { clip } : {}),
        alt: L("The simulator: outside view", "Le simulateur : vue extérieure"),
        frame: { w: 960, h: 552 },
      };
    case "flight": {
      const g = sentencesFor("sim", sit, false).find((x) => (onIls ? x.id === "flyIls" : true))!;
      return {
        kind: "simViewport",
        view: "cockpit",
        yourTurn: yourTurnFor(g, sit, "sim"),
        alt: L("A flight in the simulator", "Un vol dans le simulateur"),
        frame: { w: 960, h: 552 },
      };
    }
  }
}
