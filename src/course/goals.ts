// Ground school — the goal catalogue (SPEC §9.5) and its live evaluation.
//
// One catalogue serves the editor chips, the player's "Do this" rows, the stage goal strip, the cockpit HUD and the
// Fly-it debrief, so "within 1 dot" means the same thing everywhere:
//   - GOALS[id]                 every GoalCheck id: FR/EN name, editor params, chip label, "Do this" row text,
//                               live readout, ACS-worded standard and violation, evaluate()
//   - CheckRef ids (ias, altBand, heading, bankMax, switch, …) DELEGATE to CHECKS (train/procedureChecks.ts):
//     same labels, same params, same evaluate() over the same ProcSimView fields.
//   - nav checks (obs, toFrom, cdiDefl, gsDefl, acsScale, onRadial, dme, track, vsBand, distTo, passedFix) are new;
//     hold checks (holdEntry, holdLaps) read a HoldEvaluator (train/holdEval.ts) whose expected entry is holdEntry()
//     from nav/holding.ts (AIM FIG 5-3-8) — never a local table.
//   - StageView = ProcSimView + nav fields, built from any Sim (the stage Sim or the cockpit's) by stageView().
//
// Units rule (SPEC §9.5): a deviation is shown as dots AND an angle or distance for the active source. Dots follow
// what the student sees: the steam CDI has 5 dots each side (VOR 1 dot = 2°), the G1000 / airliner HSI 2 dots each
// side (VOR 1 dot = 5°). `maxDots` in cdiDefl / gsDefl is in the course cockpit's dots; acsScale is cockpit-free
// (a fraction of full scale: ACS ¾ scale).
//
// GoalTracker semantics (Try it / YourTurn rows, live):
//   - a row ticks when its check holds for the check's own holdS (CHECKS holdS param) and stays ticked (sticky);
//   - the goal is met when every row has ticked and, if StepGoal.holdS is set, "what you have" holds that long: the
//     checks still true when the last row ticked must stay true together for holdS (any break restarts the timer).
//     ("Heading 120 for the intercept" ticks early and is not part of the hold; "OBS 090 TO" and "bar within 1 dot"
//     are.)
import type {
  CalcProblem,
  Criterion,
  FlyIt,
  YourTurn,
  Cockpit,
  GoalCheck,
  Lang,
  L10n,
  ReadoutId,
  SimScene,
  StepGoal,
} from "./types";
import type { CheckId, CheckRef } from "../train/procedureTypes";
import {
  CHECKS,
  checkParamIssues,
  type CheckParam,
  type ParamValue,
} from "../train/procedureChecks";
import { fakeView, simView, type ProcSimView } from "../train/procedures";
import type { Sim } from "../sim/sim";
import type { HoldEvaluator } from "../train/holdEval";
import {
  holdEntry,
  type HoldDef,
  type HoldEntry,
} from "../nav/holding";
import { bearingDeg, distanceNm, norm360, wrap180 } from "../nav/geo";
import { findFix } from "../nav/data";

// ------------------------------------------------------------------ view
export type HoldEntryName = "direct" | "parallel" | "teardrop";
export interface NavView {
  valid: boolean;
  ident: string;
  isLoc: boolean;
  /** radial FROM the station the aircraft is on (magnetic) */
  radial: number;
  toFrom: "TO" | "FROM" | "OFF";
  /** normalised lateral deviation: +1 = full-scale fly-right */
  dev: number;
  gsValid: boolean;
  /** normalised vertical deviation: +1 = full-scale fly-up (aircraft below the path) */
  gsDev: number;
  dmeNm: number | null;
}
export interface HoldView {
  /** the hold being evaluated (inbound course, turn, fix) */
  inbound: number;
  turn: "L" | "R";
  fix: string;
  /** the fix has been crossed (entry decided) */
  crossed: boolean;
  /** AIM entry for the arrival course, once crossed (holdEntry, lower-cased) */
  correct: HoldEntryName | null;
  /** acceptable entries (the correct one + the neighbour within 5° of a sector boundary, AIM 5-3-8 j) */
  ok: HoldEntryName[];
  /** what the evaluator saw flown (null while in progress) */
  flown: HoldEntryName | null;
  /** before the fix: the entry the current course to the fix would give */
  predicted: HoldEntryName | null;
  laps: number;
  /** inbound leg times (s) */
  inboundS: number[];
}
/** What a goal reads: the procedures-mode view plus navigation, built from any Sim (stageView) or by hand (tests). */
export interface StageView extends ProcSimView {
  lat: number;
  lon: number;
  /** ground track (the sim frame is magnetic = true) */
  trkDeg: number;
  gsKt: number;
  cockpit: Cockpit;
  obs1: number;
  obs2: number;
  nav1: NavView;
  nav2: NavView;
  gps: {
    valid: boolean;
    /** normalised, + = fly right */
    dev: number;
    fullScaleNm: number;
    toIdent: string;
    gpValid: boolean;
    gpDev: number;
  };
  hold: HoldView | null;
  /** annotation ids the student tapped on the stage (tap goals / quizzes) */
  taps: string[];
  /** the option the student chose (choice goals) */
  choice: number | null;
}

const NAV_OFF: NavView = {
  valid: false,
  ident: "",
  isLoc: false,
  radial: 0,
  toFrom: "OFF",
  dev: 0,
  gsValid: false,
  gsDev: 0,
  dmeNm: null,
};
const lower = (e: HoldEntry | null | undefined): HoldEntryName | null =>
  e ? (e.toLowerCase() as HoldEntryName) : null;

/** The hold part of a view: from a HoldEvaluator in flight, or from a definition alone (stage, plan inset). */
export function holdView(
  def: HoldDef,
  pos: { lat: number; lon: number },
  ev?: HoldEvaluator | null,
): HoldView {
  const crossed = !!ev && ev.crossedAt !== null;
  const toFix = bearingDeg(pos, def.fix);
  return {
    inbound: def.inbound,
    turn: def.turn,
    fix: def.fix.ident,
    crossed,
    correct: crossed ? lower(ev!.correctEntry) : null,
    ok: crossed ? ev!.okEntries.map((e) => lower(e)!) : [],
    flown: ev ? lower(ev.flownEntry) : null,
    predicted: crossed ? null : lower(holdEntry(def.inbound, def.turn, toFix)),
    laps: ev?.laps ?? 0,
    inboundS: ev ? [...ev.inboundTimes] : [],
  };
}

export interface StageViewExtras {
  cockpit?: Cockpit;
  /** a running HoldEvaluator (LessonRun.holdEval in the cockpit) */
  holdEval?: HoldEvaluator | null;
  /** the hold to evaluate when there is no evaluator (default: the evaluator's) */
  hold?: HoldDef | null;
  taps?: string[];
  choice?: number | null;
}

/** Build the view from a Sim (the stage Sim or the cockpit's). Cheap enough for every frame. */
export function stageView(sim: Sim, x: StageViewExtras = {}): StageView {
  const base = simView(sim);
  const d = sim.ac.data;
  const s = sim.ac.s;
  const nv = (n: Sim["nav1"]): NavView =>
    n.valid
      ? {
          valid: true,
          ident: n.ident,
          isLoc: n.isLoc,
          radial: n.radial,
          toFrom: n.toFrom,
          dev: n.dev,
          gsValid: n.gsValid,
          gsDev: n.gsDev,
          dmeNm: n.dmeNm,
        }
      : NAV_OFF;
  const g = sim.fp.out;
  const def = x.hold ?? x.holdEval?.def ?? null;
  return {
    ...base,
    lat: s.lat,
    lon: s.lon,
    trkDeg: norm360(d.trackTrue),
    gsKt: d.gsKt,
    cockpit: x.cockpit ?? "g1000",
    obs1: sim.av.obs1,
    obs2: sim.av.obs2,
    nav1: nv(sim.nav1),
    nav2: nv(sim.nav2),
    gps: {
      valid: g.valid,
      dev: g.dev,
      fullScaleNm: g.fullScaleNm,
      toIdent: g.toIdent,
      gpValid: g.gpValid,
      gpDev: g.gpDev,
    },
    hold: def ? holdView(def, s, x.holdEval) : null,
    taps: x.taps ?? [],
    choice: x.choice ?? null,
  };
}

/** A hand-made view (tests, editor previews): wings level at 4 500 ft heading 270, nothing tuned. */
export function fakeStageView(over: Partial<StageView> = {}): StageView {
  return {
    ...fakeView(),
    lat: 45,
    lon: 3,
    trkDeg: 270,
    gsKt: 105,
    cockpit: "g1000",
    obs1: 270,
    obs2: 90,
    nav1: NAV_OFF,
    nav2: NAV_OFF,
    gps: {
      valid: false,
      dev: 0,
      fullScaleNm: 1,
      toIdent: "",
      gpValid: false,
      gpDev: 0,
    },
    hold: null,
    taps: [],
    choice: null,
    ...over,
  };
}

// ------------------------------------------------------------------ units (dots AND degrees / NM)
export type DevSource = "VOR" | "LOC" | "GPS" | "GS" | "GP";
/** dots on each side of the needle: steam CDI 5, G1000 / airliner 2 (both lateral and vertical) */
export function dotsPerSide(cockpit: Cockpit): number {
  return cockpit === "steam" ? 5 : 2;
}
/** full-scale deflection of a source: degrees for VOR / LOC / GS, NM for GPS (sim values: radios.ts, flightplan.ts) */
export function fullScale(
  source: DevSource,
  gpsFullScaleNm = 1,
): { value: number; unit: "deg" | "NM" | "ft" } {
  switch (source) {
    case "VOR":
      return { value: 10, unit: "deg" };
    case "LOC":
      return { value: 2.5, unit: "deg" };
    case "GS":
      return { value: 0.7, unit: "deg" };
    case "GP":
      return { value: 0.7, unit: "deg" };
    case "GPS":
      return { value: gpsFullScaleNm, unit: "NM" };
  }
}

const fmtNum = (n: number, digits: number, lang: Lang) => {
  const s = n.toFixed(digits);
  return lang === "fr" ? s.replace(".", ",") : s;
};
/** a quantity in the source's unit, rounded like an instructor says it (2°, 0.5°, 0.3 NM) */
function amount(v: number, unit: "deg" | "NM" | "ft", lang: Lang): string {
  const a = Math.abs(v);
  if (unit === "NM")
    return `${fmtNum(a, a < 1 ? 2 : 1, lang).replace(/([.,]\d)0$/, "$1")} NM`;
  // 10° and more: whole degrees; below: up to two decimals, trailing zeros dropped (7.5°, 2°, 1.25°, 0.14°)
  if (a >= 10) return `${fmtNum(a, 0, lang)}°`;
  return `${fmtNum(Math.round(a * 100) / 100, 2, lang).replace(/([.,]\d*?)0+$/, "$1").replace(/[.,]$/, "")}°`;
}

export interface DevTextOptions {
  cockpit?: Cockpit;
  lang?: Lang;
  /** GPS full-scale (NM) for a GPS source */
  gpsFullScaleNm?: number;
  /** leave out the angle / distance in brackets */
  short?: boolean;
}
/**
 * Deviation in dots and in the source's unit: "1.0 dot R (2°)" (steam VOR), "0.4 dot high (0.14°)" (GS).
 * `dots` is signed in the cockpit's dots: + = fly right (course to the right) / fly up (aircraft low).
 */
export function devText(
  dots: number,
  source: DevSource,
  o: DevTextOptions = {},
): string {
  const lang = o.lang ?? "en";
  const cockpit = o.cockpit ?? "g1000";
  const fr = lang === "fr";
  const vertical = source === "GS" || source === "GP";
  const a = Math.abs(dots);
  const dir =
    a < 0.05
      ? fr
        ? "centré"
        : "centred"
      : vertical
        ? dots > 0
          ? fr
            ? "bas"
            : "low"
          : fr
            ? "haut"
            : "high"
        : dots > 0
          ? fr
            ? "D"
            : "R"
          : fr
            ? "G"
            : "L";
  const word = fr
    ? "point" + (a >= 2 ? "s" : "")
    : "dot" + (a >= 1.05 ? "s" : "");
  const head =
    a < 0.05 ? `0 ${word} (${dir})` : `${fmtNum(a, 1, lang)} ${word} ${dir}`;
  if (o.short) return a < 0.05 ? (fr ? "centré" : "centred") : head;
  const fs = fullScale(source, o.gpsFullScaleNm);
  const v = (a / dotsPerSide(cockpit)) * fs.value;
  return a < 0.05
    ? fr
      ? "centré"
      : "centred"
    : `${head} (${amount(v, fs.unit, lang)})`;
}

const FRAC_WORD: [number, string][] = [
  [0.25, "¼"],
  [0.5, "½"],
  [0.75, "¾"],
  [1, "full"],
];
export function fracText(frac: number, lang: Lang = "en"): string {
  const w = FRAC_WORD.find(([f]) => Math.abs(f - frac) < 0.01)?.[1];
  if (w === "full") return lang === "fr" ? "pleine échelle" : "full scale";
  if (w) return lang === "fr" ? `${w} d’échelle` : `${w} scale`;
  return lang === "fr"
    ? `${Math.round(frac * 100)} % de l’échelle`
    : `${Math.round(frac * 100)} % of full scale`;
}

/**
 * The units note under the "Do this" rows: "On a VOR, 1 dot = 2°. The checkride limit is ¾ scale (7.5°, about
 * 4 dots). This step asks for 1 dot so you learn to keep it tight."
 */
export function unitsNote(
  source: DevSource,
  cockpit: Cockpit,
  lang: Lang = "en",
  askedDots?: number,
  gpsFullScaleNm?: number,
): string {
  const fr = lang === "fr";
  const n = dotsPerSide(cockpit);
  const fs = fullScale(source, gpsFullScaleNm);
  const perDot = fs.value / n;
  const three = 0.75 * n;
  // a half dot is shown as is (1.5 dots on a 2-dot HSI); "about N" only when rounding is harmless (3.75 → about 4)
  const half = Math.abs(three * 2 - Math.round(three * 2)) < 0.01;
  const threeTxt =
    Math.abs(three - Math.round(three)) < 0.01
      ? String(Math.round(three))
      : half
        ? fmtNum(three, 1, lang)
        : `${fr ? "environ " : "about "}${Math.round(three)}`;
  const name: Record<DevSource, [string, string]> = {
    VOR: ["On a VOR", "Sur un VOR"],
    LOC: ["On a localizer", "Sur un localizer"],
    GPS: [
      `On GPS (${amount(fs.value, "NM", lang)} full scale)`,
      `En GPS (pleine échelle ${amount(fs.value, "NM", lang)})`,
    ],
    GS: ["On the glideslope", "Sur le glide"],
    GP: ["On the glidepath", "Sur le glidepath"],
  };
  let s = fr
    ? `${name[source][1]}, 1 point = ${amount(perDot, fs.unit, lang)}. La limite du test en vol est ¾ d’échelle (${amount(0.75 * fs.value, fs.unit, lang)}, ${threeTxt} point${three >= 2 ? "s" : ""}).`
    : `${name[source][0]}, 1 dot = ${amount(perDot, fs.unit, lang)}. The checkride limit is ¾ scale (${amount(0.75 * fs.value, fs.unit, lang)}, ${threeTxt} dot${three === 1 ? "" : "s"}).`;
  if (askedDots !== undefined && askedDots < three - 0.01)
    s += fr
      ? ` Cette étape demande ${fmtNum(askedDots, askedDots % 1 ? 1 : 0, lang)} point${askedDots >= 2 ? "s" : ""} pour apprendre à rester précis.`
      : ` This step asks for ${fmtNum(askedDots, askedDots % 1 ? 1 : 0, lang)} dot${askedDots === 1 ? "" : "s"} so you learn to keep it tight.`;
  return s;
}

/** the lateral source the CDI shows */
export function lateralSource(v: StageView): {
  source: DevSource;
  dev: number | null;
  nav: NavView | null;
} {
  if (v.cdi === "GPS")
    return { source: "GPS", dev: v.gps.valid ? v.gps.dev : null, nav: null };
  const nav = v.cdi === "NAV2" ? v.nav2 : v.nav1;
  return {
    source: nav.isLoc ? "LOC" : "VOR",
    dev: nav.valid ? nav.dev : null,
    nav,
  };
}
/** the vertical source (GS on a NAV source, GP on GPS) */
export function verticalSource(v: StageView): {
  source: DevSource;
  dev: number | null;
} {
  if (v.cdi === "GPS")
    return { source: "GP", dev: v.gps.gpValid ? v.gps.gpDev : null };
  const nav = v.cdi === "NAV2" ? v.nav2 : v.nav1;
  return { source: "GS", dev: nav.gsValid ? nav.gsDev : null };
}
/** the active NAV receiver (CDI on NAV1 / NAV2; NAV1 when the CDI is on GPS) */
const activeNav = (v: StageView) => (v.cdi === "NAV2" ? v.nav2 : v.nav1);

// ------------------------------------------------------------------ catalogue
export type GoalId = GoalCheck["id"];
/** nav / hold / event ids (the CheckRef ids live in CHECKS) */
export type NavGoalId = Exclude<GoalId, CheckId>;
/**
 * path: a flight-path condition held while flying (continuous: graded the whole time in a Fly it);
 * action: something the pilot sets (OBS, switch); milestone: something that happens (fix passed, laps, entry);
 * event: a tap / choice on the stage; outcome / manual: from CHECKS.
 */
export type GoalKind =
  | "path"
  | "action"
  | "milestone"
  | "event"
  | "outcome"
  | "manual";

/** stateful memory a check may keep between frames (passed fix…) */
export type CheckMem = Record<string, number | boolean | string>;
type P = Record<string, unknown>;

export interface GoalDef {
  id: GoalId;
  kind: GoalKind;
  name: L10n;
  /** editor fields (the same schema as the procedures editor) */
  params: CheckParam[];
  /** chip / criterion label: "CDI within 1 dot" */
  label(p: P, lang: Lang): string;
  /** "Do this" row: "Keep the bar within 1 dot" */
  row(p: P, lang: Lang): string;
  /** live value: "1.0 dot R", "HDG 120", "090 TO" */
  readout(v: StageView, p: P, lang: Lang): string;
  /** ACS-style standard: "Maintain the CDI within 1 dot" */
  standard(p: P, lang: Lang): string;
  /** ACS-worded violation when not met right now (null when met or nothing to say) */
  violation(v: StageView, p: P, lang: Lang): string | null;
  evaluate(v: StageView, p: P, mem: CheckMem): boolean;
  /** seconds the condition must hold to tick (0 = at once) */
  holdS(p: P): number;
  /** the readout id the player's row shows for it */
  readoutId?: ReadoutId;
}

const tr = (l: L10n, lang: Lang) => (lang === "fr" ? (l.fr ?? l.en) : l.en);
const L = (en: string, fr: string): L10n => ({ en, fr });
const n = (p: P, k: string, d: number) => {
  const v = p[k];
  const x =
    typeof v === "number"
      ? v
      : typeof v === "string" && v !== ""
        ? Number(v)
        : NaN;
  return Number.isFinite(x) ? x : d;
};
const s = (p: P, k: string, d: string) =>
  typeof p[k] === "string" && p[k] !== "" ? (p[k] as string) : d;
const hdg3 = (h: number) =>
  String(Math.round(norm360(h)) % 360 || 360).padStart(3, "0");
const grp = (x: number, lang: Lang) =>
  Math.round(x)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, lang === "fr" ? " " : ",");
const signedInt = (x: number) =>
  `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(Math.round(x))}`;
const fr = (lang: Lang) => lang === "fr";
const word = (lang: Lang, en: string, frw: string) =>
  lang === "fr" ? frw : en;

/** lateral dots in the cockpit's scale (null = no valid source) */
export function lateralDots(v: StageView): number | null {
  const { dev } = lateralSource(v);
  return dev === null ? null : dev * dotsPerSide(v.cockpit);
}
export function verticalDots(v: StageView): number | null {
  const { dev } = verticalSource(v);
  return dev === null ? null : dev * dotsPerSide(v.cockpit);
}
function latText(v: StageView, lang: Lang, short = false): string {
  const d = lateralDots(v);
  const src = lateralSource(v).source;
  if (d === null) return word(lang, "no signal", "pas de signal");
  return devText(d, src, {
    cockpit: v.cockpit,
    lang,
    gpsFullScaleNm: v.gps.fullScaleNm,
    short,
  });
}
function vertText(v: StageView, lang: Lang, short = false): string {
  const d = verticalDots(v);
  const src = verticalSource(v).source;
  if (d === null) return word(lang, "no glidepath", "pas de glide");
  return devText(d, src, { cockpit: v.cockpit, lang, short });
}
const dotsWord = (x: number, lang: Lang) =>
  `${fmtNum(x, x % 1 ? 1 : 0, lang)} ${lang === "fr" ? "point" + (x >= 2 ? "s" : "") : "dot" + (x === 1 ? "" : "s")}`;

function navigaidPos(ident: string) {
  const f = findFix(ident);
  return f ? { lat: f.lat, lon: f.lon } : null;
}

const NAV: Record<NavGoalId, GoalDef> = {
  obs: {
    id: "obs",
    kind: "action",
    name: L("Course selected (OBS)", "Route affichée (OBS)"),
    readoutId: "obs1",
    params: [
      {
        name: "nav",
        type: "enum",
        label: L("Receiver", "Récepteur") as Record<Lang, string>,
        default: 1,
        options: [
          { value: 1, label: { en: "NAV1", fr: "NAV1" } },
          { value: 2, label: { en: "NAV2", fr: "NAV2" } },
        ],
      },
      {
        name: "value",
        type: "number",
        label: { en: "Course (°)", fr: "Route (°)" },
        default: 90,
        min: 1,
        max: 360,
        step: 1,
        unit: "°",
      },
      {
        name: "tol",
        type: "number",
        label: { en: "Tolerance (±°)", fr: "Tolérance (±°)" },
        default: 2,
        min: 0,
        max: 20,
        step: 1,
        unit: "°",
      },
    ],
    label: (p) =>
      `OBS ${hdg3(n(p, "value", 90))}${n(p, "nav", 1) === 2 ? " (NAV2)" : ""}`,
    row: (p, lang) =>
      fr(lang)
        ? `Affichez l’OBS sur ${hdg3(n(p, "value", 90))}`
        : `Set the OBS to ${hdg3(n(p, "value", 90))}`,
    readout: (v, p) => hdg3(n(p, "nav", 1) === 2 ? v.obs2 : v.obs1),
    standard: (p, lang) =>
      fr(lang)
        ? `Route ${hdg3(n(p, "value", 90))} affichée`
        : `Course ${hdg3(n(p, "value", 90))} selected`,
    violation: (v, p, lang) => {
      const cur = n(p, "nav", 1) === 2 ? v.obs2 : v.obs1;
      return fr(lang)
        ? `OBS sur ${hdg3(cur)}, attendu ${hdg3(n(p, "value", 90))}`
        : `OBS set to ${hdg3(cur)}, ${hdg3(n(p, "value", 90))} expected`;
    },
    evaluate: (v, p) =>
      Math.abs(
        wrap180((n(p, "nav", 1) === 2 ? v.obs2 : v.obs1) - n(p, "value", 90)),
      ) <=
      n(p, "tol", 2) + 1e-9,
    holdS: () => 0,
  },
  toFrom: {
    id: "toFrom",
    kind: "action",
    name: L("TO / FROM flag", "Indicateur TO / FROM"),
    readoutId: "toFrom",
    params: [
      {
        name: "value",
        type: "enum",
        label: { en: "Flag", fr: "Indicateur" },
        default: "TO",
        options: [
          { value: "TO", label: { en: "TO", fr: "TO" } },
          { value: "FROM", label: { en: "FROM", fr: "FROM" } },
        ],
      },
    ],
    label: (p, lang) =>
      fr(lang)
        ? `Indicateur ${s(p, "value", "TO")}`
        : `${s(p, "value", "TO")} flag`,
    row: (p, lang) =>
      fr(lang)
        ? `Obtenez l’indicateur ${s(p, "value", "TO")}`
        : `Get a ${s(p, "value", "TO")} flag`,
    readout: (v) => {
      const nav = activeNav(v);
      return nav.valid ? nav.toFrom : "OFF";
    },
    standard: (p, lang) =>
      fr(lang)
        ? `Indicateur ${s(p, "value", "TO")}`
        : `${s(p, "value", "TO")} indication`,
    violation: (v, p, lang) => {
      const nav = activeNav(v);
      const cur = nav.valid ? nav.toFrom : "OFF";
      return fr(lang)
        ? `Indicateur ${cur}, ${s(p, "value", "TO")} attendu`
        : `${cur} flag, ${s(p, "value", "TO")} expected`;
    },
    evaluate: (v, p) => {
      const nav = activeNav(v);
      return nav.valid && nav.toFrom === s(p, "value", "TO");
    },
    holdS: () => 0,
  },
  cdiDefl: {
    id: "cdiDefl",
    kind: "path",
    name: L("CDI deflection", "Déviation CDI"),
    readoutId: "cdiDots",
    params: [
      {
        name: "maxDots",
        type: "number",
        label: { en: "Within (dots)", fr: "À moins de (points)" },
        default: 1,
        min: 0.25,
        max: 5,
        step: 0.25,
        unit: "dots",
      },
    ],
    label: (p, lang) =>
      fr(lang)
        ? `CDI à moins de ${dotsWord(n(p, "maxDots", 1), lang)}`
        : `CDI within ${dotsWord(n(p, "maxDots", 1), lang)}`,
    row: (p, lang) =>
      fr(lang)
        ? `Gardez l’aiguille à moins de ${dotsWord(n(p, "maxDots", 1), lang)}`
        : `Keep the bar within ${dotsWord(n(p, "maxDots", 1), lang)}`,
    readout: (v, _p, lang) => latText(v, lang, true),
    standard: (p, lang) =>
      fr(lang)
        ? `Maintenir le CDI à moins de ${dotsWord(n(p, "maxDots", 1), lang)}`
        : `Maintain the CDI within ${dotsWord(n(p, "maxDots", 1), lang)}`,
    violation: (v, p, lang) =>
      fr(lang)
        ? `CDI ${latText(v, lang)}, limite ${dotsWord(n(p, "maxDots", 1), lang)}`
        : `CDI ${latText(v, lang)}, limit ${dotsWord(n(p, "maxDots", 1), lang)}`,
    evaluate: (v, p) => {
      const d = lateralDots(v);
      return d !== null && Math.abs(d) <= n(p, "maxDots", 1) + 1e-9;
    },
    holdS: () => 0,
  },
  gsDefl: {
    id: "gsDefl",
    kind: "path",
    name: L("Glidepath deflection", "Déviation glide"),
    readoutId: "gsDots",
    params: [
      {
        name: "maxDots",
        type: "number",
        label: { en: "Within (dots)", fr: "À moins de (points)" },
        default: 1,
        min: 0.25,
        max: 5,
        step: 0.25,
        unit: "dots",
      },
    ],
    label: (p, lang) =>
      fr(lang)
        ? `Glide à moins de ${dotsWord(n(p, "maxDots", 1), lang)}`
        : `Glidepath within ${dotsWord(n(p, "maxDots", 1), lang)}`,
    row: (p, lang) =>
      fr(lang)
        ? `Gardez le glide à moins de ${dotsWord(n(p, "maxDots", 1), lang)}`
        : `Keep the glidepath within ${dotsWord(n(p, "maxDots", 1), lang)}`,
    readout: (v, _p, lang) => vertText(v, lang, true),
    standard: (p, lang) =>
      fr(lang)
        ? `Maintenir le glide à moins de ${dotsWord(n(p, "maxDots", 1), lang)}`
        : `Maintain the glidepath within ${dotsWord(n(p, "maxDots", 1), lang)}`,
    violation: (v, p, lang) =>
      fr(lang)
        ? `Glide ${vertText(v, lang)}, limite ${dotsWord(n(p, "maxDots", 1), lang)}`
        : `Glidepath ${vertText(v, lang)}, limit ${dotsWord(n(p, "maxDots", 1), lang)}`,
    evaluate: (v, p) => {
      const d = verticalDots(v);
      return d !== null && Math.abs(d) <= n(p, "maxDots", 1) + 1e-9;
    },
    holdS: () => 0,
  },
  acsScale: {
    id: "acsScale",
    kind: "path",
    name: L(
      "Within a fraction of full scale (ACS)",
      "Dans une fraction d’échelle (ACS)",
    ),
    readoutId: "cdiDots",
    params: [
      {
        name: "axis",
        type: "enum",
        label: { en: "Axis", fr: "Axe" },
        default: "lat",
        options: [
          { value: "lat", label: { en: "Lateral (CDI)", fr: "Latéral (CDI)" } },
          {
            value: "vert",
            label: { en: "Vertical (GS / GP)", fr: "Vertical (glide)" },
          },
        ],
      },
      {
        name: "frac",
        type: "number",
        label: { en: "Fraction of full scale", fr: "Fraction d’échelle" },
        default: 0.75,
        min: 0.1,
        max: 1,
        step: 0.05,
      },
    ],
    label: (p, lang) => {
      const vert = s(p, "axis", "lat") === "vert";
      const what = vert ? word(lang, "Glidepath", "Glide") : "CDI";
      return fr(lang)
        ? `${what} dans ${fracText(n(p, "frac", 0.75), lang)}`
        : `${what} within ${fracText(n(p, "frac", 0.75), lang)}`;
    },
    row: (p, lang) => {
      const vert = s(p, "axis", "lat") === "vert";
      return fr(lang)
        ? `Restez dans ${fracText(n(p, "frac", 0.75), lang)} (${vert ? "glide" : "CDI"})`
        : `Stay within ${fracText(n(p, "frac", 0.75), lang)} on the ${vert ? "glidepath" : "CDI"}`;
    },
    readout: (v, p, lang) =>
      s(p, "axis", "lat") === "vert"
        ? vertText(v, lang, true)
        : latText(v, lang, true),
    standard: (p, lang) => {
      const vert = s(p, "axis", "lat") === "vert";
      return fr(lang)
        ? `Guidage ${vert ? "vertical" : "latéral"} maintenu à moins de ${fracText(n(p, "frac", 0.75), lang)}`
        : `${vert ? "Vertical" : "Lateral"} guidance within ${fracText(n(p, "frac", 0.75), lang)} deflection`;
    },
    violation: (v, p, lang) => {
      const vert = s(p, "axis", "lat") === "vert";
      const lim = n(p, "frac", 0.75) * dotsPerSide(v.cockpit);
      const t = vert ? vertText(v, lang) : latText(v, lang);
      return fr(lang)
        ? `${vert ? "Glide" : "CDI"} ${t}, au-delà de ${fracText(n(p, "frac", 0.75), lang)} (${dotsWord(lim, lang)})`
        : `${vert ? "Glidepath" : "CDI"} ${t}, beyond ${fracText(n(p, "frac", 0.75), lang)} (${dotsWord(lim, lang)})`;
    },
    evaluate: (v, p) => {
      const dev =
        s(p, "axis", "lat") === "vert"
          ? verticalSource(v).dev
          : lateralSource(v).dev;
      return dev !== null && Math.abs(dev) <= n(p, "frac", 0.75) + 1e-9;
    },
    holdS: () => 0,
  },
  onRadial: {
    id: "onRadial",
    kind: "path",
    name: L("On a radial", "Sur un radial"),
    readoutId: "radial",
    params: [
      {
        name: "navaid",
        type: "string",
        label: { en: "Navaid", fr: "Balise" },
        default: "",
        required: true,
      },
      {
        name: "radial",
        type: "number",
        label: { en: "Radial (°)", fr: "Radial (°)" },
        default: 90,
        min: 0,
        max: 360,
        step: 1,
        unit: "°",
      },
      {
        name: "tol",
        type: "number",
        label: { en: "Tolerance (±°)", fr: "Tolérance (±°)" },
        default: 5,
        min: 1,
        max: 30,
        step: 1,
        unit: "°",
      },
    ],
    label: (p) =>
      `${s(p, "navaid", "?").toUpperCase()} R-${hdg3(n(p, "radial", 90))} (±${n(p, "tol", 5)}°)`,
    row: (p, lang) =>
      fr(lang)
        ? `Suivez le radial ${hdg3(n(p, "radial", 90))} de ${s(p, "navaid", "?").toUpperCase()}`
        : `Track the ${s(p, "navaid", "?").toUpperCase()} ${hdg3(n(p, "radial", 90))} radial`,
    readout: (v, p) => {
      const pos = navigaidPos(s(p, "navaid", ""));
      return pos ? `R-${hdg3(bearingDeg(pos, v))}` : "—";
    },
    standard: (p, lang) =>
      fr(lang)
        ? `Sur le radial ${hdg3(n(p, "radial", 90))} de ${s(p, "navaid", "?").toUpperCase()} à ±${n(p, "tol", 5)}°`
        : `On the ${s(p, "navaid", "?").toUpperCase()} ${hdg3(n(p, "radial", 90))} radial within ${n(p, "tol", 5)}°`,
    violation: (v, p, lang) => {
      const pos = navigaidPos(s(p, "navaid", ""));
      if (!pos)
        return fr(lang)
          ? `Balise ${s(p, "navaid", "?")} inconnue`
          : `Unknown navaid ${s(p, "navaid", "?")}`;
      const r = bearingDeg(pos, v);
      return fr(lang)
        ? `Sur le R-${hdg3(r)} (R-${hdg3(n(p, "radial", 90))} ±${n(p, "tol", 5)}°)`
        : `On R-${hdg3(r)} (R-${hdg3(n(p, "radial", 90))} ±${n(p, "tol", 5)}°)`;
    },
    evaluate: (v, p) => {
      const pos = navigaidPos(s(p, "navaid", ""));
      if (!pos) return false;
      return (
        Math.abs(wrap180(bearingDeg(pos, v) - n(p, "radial", 90))) <=
        n(p, "tol", 5)
      );
    },
    holdS: () => 0,
  },
  dme: {
    id: "dme",
    kind: "path",
    name: L("DME distance", "Distance DME"),
    readoutId: "dme",
    params: [
      {
        name: "min",
        type: "number",
        label: { en: "Min (NM)", fr: "Min (NM)" },
        default: 9,
        min: 0,
        max: 200,
        step: 0.1,
        unit: "NM",
      },
      {
        name: "max",
        type: "number",
        label: { en: "Max (NM)", fr: "Max (NM)" },
        default: 11,
        min: 0,
        max: 200,
        step: 0.1,
        unit: "NM",
      },
    ],
    label: (p, lang) =>
      `DME ${fmtNum(n(p, "min", 9), 1, lang)}–${fmtNum(n(p, "max", 11), 1, lang)} NM`,
    row: (p, lang) =>
      fr(lang)
        ? `Restez entre ${fmtNum(n(p, "min", 9), 1, lang)} et ${fmtNum(n(p, "max", 11), 1, lang)} NM DME`
        : `Stay between ${fmtNum(n(p, "min", 9), 1, lang)} and ${fmtNum(n(p, "max", 11), 1, lang)} DME`,
    readout: (v, _p, lang) => {
      const d = dmeOf(v);
      return d === null ? "DME —" : `DME ${fmtNum(d, 1, lang)}`;
    },
    standard: (p, lang) =>
      fr(lang)
        ? `DME entre ${fmtNum(n(p, "min", 9), 1, lang)} et ${fmtNum(n(p, "max", 11), 1, lang)} NM`
        : `DME between ${fmtNum(n(p, "min", 9), 1, lang)} and ${fmtNum(n(p, "max", 11), 1, lang)} NM`,
    violation: (v, p, lang) => {
      const d = dmeOf(v);
      if (d === null) return fr(lang) ? "Pas de DME" : "No DME";
      return fr(lang)
        ? `DME ${fmtNum(d, 1, lang)} (${fmtNum(n(p, "min", 9), 1, lang)}–${fmtNum(n(p, "max", 11), 1, lang)})`
        : `DME ${fmtNum(d, 1, lang)} (${fmtNum(n(p, "min", 9), 1, lang)}–${fmtNum(n(p, "max", 11), 1, lang)})`;
    },
    evaluate: (v, p) => {
      const d = dmeOf(v);
      return d !== null && d >= n(p, "min", 9) && d <= n(p, "max", 11);
    },
    holdS: () => 0,
  },
  holdEntry: {
    id: "holdEntry",
    kind: "milestone",
    name: L("Hold entry (AIM 5-3-8)", "Entrée d’attente (AIM 5-3-8)"),
    readoutId: "entry",
    params: [
      {
        name: "expected",
        type: "enum",
        label: { en: "Entry", fr: "Entrée" },
        default: "direct",
        options: [
          { value: "direct", label: { en: "Direct", fr: "Directe" } },
          { value: "parallel", label: { en: "Parallel", fr: "Parallèle" } },
          {
            value: "teardrop",
            label: { en: "Teardrop", fr: "Décalée (teardrop)" },
          },
        ],
      },
    ],
    label: (p, lang) =>
      entryName(s(p, "expected", "direct") as HoldEntryName, lang, true),
    row: (p, lang) =>
      fr(lang)
        ? `Faites l’entrée ${entryName(s(p, "expected", "direct") as HoldEntryName, lang)}`
        : `Fly the ${entryName(s(p, "expected", "direct") as HoldEntryName, lang)} entry`,
    readout: (v, _p, lang) => {
      const h = v.hold;
      if (!h) return "—";
      if (h.flown) return entryName(h.flown, lang, true);
      if (h.crossed) return word(lang, "entry in progress", "entrée en cours");
      return h.predicted
        ? `${word(lang, "predicted", "prévue")} : ${entryName(h.predicted, lang)}`.replace(
            " :",
            lang === "fr" ? " :" : ":",
          )
        : "—";
    },
    standard: (p, lang) =>
      fr(lang)
        ? `Entrée ${entryName(s(p, "expected", "direct") as HoldEntryName, lang)} correcte (AIM 5-3-8)`
        : `Correct ${entryName(s(p, "expected", "direct") as HoldEntryName, lang)} entry (AIM 5-3-8)`,
    violation: (v, p, lang) => {
      const h = v.hold;
      const exp = s(p, "expected", "direct") as HoldEntryName;
      if (!h || !h.flown) return null;
      return fr(lang)
        ? `Entrée ${entryName(h.flown, lang)} volée, ${entryName(exp, lang)} attendue (AIM 5-3-8)`
        : `Flew a ${entryName(h.flown, lang)} entry, ${entryName(exp, lang)} expected (AIM 5-3-8)`;
    },
    evaluate: (v, p) => {
      const h = v.hold;
      const exp = s(p, "expected", "direct") as HoldEntryName;
      if (!h || !h.flown) return false;
      if (h.flown === exp) return true;
      // within 5° of a sector boundary either neighbouring entry is acceptable (AIM 5-3-8 j)
      return h.ok.includes(h.flown) && h.ok.includes(exp);
    },
    holdS: () => 0,
  },
  holdLaps: {
    id: "holdLaps",
    kind: "milestone",
    name: L("Laps in the hold", "Tours d’attente"),
    readoutId: "holdS",
    params: [
      {
        name: "laps",
        type: "number",
        label: { en: "Laps", fr: "Tours" },
        default: 2,
        min: 1,
        max: 10,
        step: 1,
      },
      {
        name: "legS",
        type: "number",
        label: { en: "Inbound leg (s)", fr: "Branche rapprochement (s)" },
        default: 60,
        min: 30,
        max: 180,
        step: 5,
        unit: "s",
        optional: true,
      },
    ],
    label: (p, lang) => {
      const k = n(p, "laps", 2);
      const leg =
        p.legS !== undefined
          ? ` · ${fmtTime(n(p, "legS", 60))} ${word(lang, "inbound", "en rapprochement")}`
          : "";
      return fr(lang)
        ? `${k} tour${k > 1 ? "s" : ""}${leg}`
        : `${k} lap${k > 1 ? "s" : ""}${leg}`;
    },
    row: (p, lang) => {
      const k = n(p, "laps", 2);
      const leg =
        p.legS !== undefined
          ? fr(lang)
            ? `, ${fmtTime(n(p, "legS", 60))} en rapprochement`
            : `, ${fmtTime(n(p, "legS", 60))} inbound`
          : "";
      return fr(lang)
        ? `Faites ${k} tour${k > 1 ? "s" : ""}${leg}`
        : `Fly ${k} lap${k > 1 ? "s" : ""}${leg}`;
    },
    readout: (v, p, lang) => {
      const h = v.hold;
      if (!h) return "—";
      const last = h.inboundS[h.inboundS.length - 1];
      return `${word(lang, "Lap", "Tour")} ${Math.min(h.laps, n(p, "laps", 2))}/${n(p, "laps", 2)}${last ? ` · ${fmtTime(last)}` : ""}`;
    },
    standard: (p, lang) =>
      fr(lang)
        ? `${n(p, "laps", 2)} tours, branche rapprochement ${fmtTime(n(p, "legS", 60))} ±15 s`
        : `${n(p, "laps", 2)} laps, inbound leg ${fmtTime(n(p, "legS", 60))} ±15 s`,
    violation: (v, p, lang) => {
      const h = v.hold;
      if (!h) return null;
      const last = h.inboundS[h.inboundS.length - 1];
      if (
        p.legS !== undefined &&
        last &&
        Math.abs(last - n(p, "legS", 60)) > 15
      )
        return fr(lang)
          ? `Branche rapprochement ${fmtTime(last)} (${fmtTime(n(p, "legS", 60))} ±15 s)`
          : `Inbound leg ${fmtTime(last)} (${fmtTime(n(p, "legS", 60))} ±15 s)`;
      return null;
    },
    evaluate: (v, p) => {
      const h = v.hold;
      if (!h || h.laps < n(p, "laps", 2)) return false;
      if (p.legS === undefined) return true;
      const last = h.inboundS[h.inboundS.length - 1];
      return last !== undefined && Math.abs(last - n(p, "legS", 60)) <= 15;
    },
    holdS: () => 0,
  },
  passedFix: {
    id: "passedFix",
    kind: "milestone",
    name: L("Fix passed", "Point passé"),
    params: [
      {
        name: "ident",
        type: "string",
        label: { en: "Fix", fr: "Point" },
        default: "",
        required: true,
      },
    ],
    label: (p, lang) =>
      fr(lang)
        ? `Passer ${s(p, "ident", "?").toUpperCase()}`
        : `Pass ${s(p, "ident", "?").toUpperCase()}`,
    row: (p, lang) =>
      fr(lang)
        ? `Passez la verticale de ${s(p, "ident", "?").toUpperCase()}`
        : `Fly over ${s(p, "ident", "?").toUpperCase()}`,
    readout: (v, p, lang) => {
      const pos = navigaidPos(s(p, "ident", ""));
      return pos
        ? `${s(p, "ident", "?").toUpperCase()} ${fmtNum(distanceNm(v, pos), 1, lang)} NM`
        : "—";
    },
    standard: (p, lang) =>
      fr(lang)
        ? `Verticale de ${s(p, "ident", "?").toUpperCase()}`
        : `Crossed ${s(p, "ident", "?").toUpperCase()}`,
    violation: () => null,
    evaluate: (v, p, mem) => {
      if (mem.passed) return true;
      const pos = navigaidPos(s(p, "ident", ""));
      if (!pos) return false;
      const d = distanceNm(v, pos);
      const b = bearingDeg(v, pos);
      // overhead, or the bearing to the fix swung past abeam close to it (the same test as holdEval)
      const prev = typeof mem.brg === "number" ? mem.brg : null;
      const swung = prev !== null && Math.abs(wrap180(b - prev)) > 100 && d < 2;
      mem.brg = b;
      if (d < 0.6 || swung) mem.passed = true;
      return !!mem.passed;
    },
    holdS: () => 0,
  },
  distTo: {
    id: "distTo",
    kind: "milestone",
    name: L("Distance to a fix", "Distance d’un point"),
    params: [
      {
        name: "fix",
        type: "string",
        label: { en: "Fix", fr: "Point" },
        default: "",
        required: true,
      },
      {
        name: "maxNm",
        type: "number",
        label: { en: "Within (NM)", fr: "À moins de (NM)" },
        default: 2,
        min: 0,
        max: 200,
        step: 0.1,
        unit: "NM",
        optional: true,
      },
      {
        name: "minNm",
        type: "number",
        label: { en: "Beyond (NM)", fr: "Au-delà de (NM)" },
        default: 0,
        min: 0,
        max: 200,
        step: 0.1,
        unit: "NM",
        optional: true,
      },
    ],
    label: (p, lang) => {
      const f = s(p, "fix", "?").toUpperCase();
      const lo = p.minNm !== undefined ? n(p, "minNm", 0) : null;
      const hi = p.maxNm !== undefined ? n(p, "maxNm", 2) : null;
      if (lo !== null && hi !== null)
        return `${f} ${fmtNum(lo, 1, lang)}–${fmtNum(hi, 1, lang)} NM`;
      if (hi !== null)
        return fr(lang)
          ? `À moins de ${fmtNum(hi, 1, lang)} NM de ${f}`
          : `Within ${fmtNum(hi, 1, lang)} NM of ${f}`;
      return fr(lang)
        ? `À plus de ${fmtNum(lo ?? 0, 1, lang)} NM de ${f}`
        : `More than ${fmtNum(lo ?? 0, 1, lang)} NM from ${f}`;
    },
    row: (p, lang) => NAV.distTo.label(p, lang),
    readout: (v, p, lang) => {
      const pos = navigaidPos(s(p, "fix", ""));
      return pos
        ? `${s(p, "fix", "?").toUpperCase()} ${fmtNum(distanceNm(v, pos), 1, lang)} NM`
        : "—";
    },
    standard: (p, lang) => NAV.distTo.label(p, lang),
    violation: (v, p, lang) => {
      const pos = navigaidPos(s(p, "fix", ""));
      if (!pos)
        return fr(lang)
          ? `Point ${s(p, "fix", "?")} inconnu`
          : `Unknown fix ${s(p, "fix", "?")}`;
      return `${s(p, "fix", "?").toUpperCase()} ${fmtNum(distanceNm(v, pos), 1, lang)} NM (${NAV.distTo.label(p, lang)})`;
    },
    evaluate: (v, p) => {
      const pos = navigaidPos(s(p, "fix", ""));
      if (!pos) return false;
      const d = distanceNm(v, pos);
      if (p.maxNm !== undefined && d > n(p, "maxNm", 2)) return false;
      if (p.minNm !== undefined && d < n(p, "minNm", 0)) return false;
      return p.maxNm !== undefined || p.minNm !== undefined;
    },
    holdS: () => 0,
  },
  tap: {
    id: "tap",
    kind: "event",
    name: L("Tap a highlight", "Toucher une zone"),
    params: [
      {
        name: "annotation",
        type: "string",
        label: { en: "Annotation", fr: "Annotation" },
        default: "",
        required: true,
      },
    ],
    label: (_p, lang) =>
      word(lang, "Tap the right spot", "Touchez la bonne zone"),
    row: (_p, lang) =>
      word(
        lang,
        "Tap the right spot on the instrument",
        "Touchez la bonne zone de l’instrument",
      ),
    readout: (v, p, lang) =>
      v.taps.includes(s(p, "annotation", ""))
        ? word(lang, "found", "trouvé")
        : "—",
    standard: (_p, lang) =>
      word(lang, "Identified on the instrument", "Identifié sur l’instrument"),
    violation: () => null,
    evaluate: (v, p) => v.taps.includes(s(p, "annotation", "")),
    holdS: () => 0,
  },
  choice: {
    id: "choice",
    kind: "event",
    name: L("Choose an option", "Choisir une réponse"),
    params: [
      {
        name: "index",
        type: "number",
        label: { en: "Option (0 = first)", fr: "Réponse (0 = la première)" },
        default: 0,
        min: 0,
        max: 9,
        step: 1,
      },
    ],
    label: (_p, lang) =>
      word(lang, "Choose the right option", "Choisissez la bonne réponse"),
    row: (_p, lang) =>
      word(lang, "Choose the right option", "Choisissez la bonne réponse"),
    readout: (v, _p, lang) =>
      v.choice === null
        ? "—"
        : word(lang, `option ${v.choice + 1}`, `réponse ${v.choice + 1}`),
    standard: (_p, lang) =>
      word(lang, "Right option chosen", "Bonne réponse choisie"),
    violation: () => null,
    evaluate: (v, p) => v.choice !== null && v.choice === n(p, "index", 0),
    holdS: () => 0,
  },
  track: {
    id: "track",
    kind: "path",
    name: L("Ground track", "Route sol"),
    readoutId: "trk",
    params: [
      {
        name: "value",
        type: "number",
        label: { en: "Track (°)", fr: "Route (°)" },
        default: 90,
        min: 1,
        max: 360,
        step: 1,
        unit: "°",
      },
      {
        name: "tol",
        type: "number",
        label: { en: "Tolerance (±°)", fr: "Tolérance (±°)" },
        default: 5,
        min: 1,
        max: 30,
        step: 1,
        unit: "°",
      },
    ],
    label: (p, lang) =>
      `${word(lang, "Track", "Route")} ${hdg3(n(p, "value", 90))}° (±${n(p, "tol", 5)}°)`,
    row: (p, lang) =>
      fr(lang)
        ? `Tenez la route ${hdg3(n(p, "value", 90))}° à ±${n(p, "tol", 5)}°`
        : `Hold a ${hdg3(n(p, "value", 90))}° track within ${n(p, "tol", 5)}°`,
    readout: (v) => `TRK ${hdg3(v.trkDeg)}`,
    standard: (p, lang) =>
      fr(lang)
        ? `Route sol ${hdg3(n(p, "value", 90))}° ±${n(p, "tol", 5)}°`
        : `Ground track ${hdg3(n(p, "value", 90))}° ±${n(p, "tol", 5)}°`,
    violation: (v, p, lang) =>
      fr(lang)
        ? `Route ${hdg3(v.trkDeg)}° (${hdg3(n(p, "value", 90))} ±${n(p, "tol", 5)}°)`
        : `Track ${hdg3(v.trkDeg)}° (${hdg3(n(p, "value", 90))} ±${n(p, "tol", 5)}°)`,
    evaluate: (v, p) =>
      !v.onGround &&
      Math.abs(wrap180(v.trkDeg - n(p, "value", 90))) <= n(p, "tol", 5),
    holdS: () => 0,
  },
  vsBand: {
    id: "vsBand",
    kind: "path",
    name: L("Vertical speed band", "Plage de vitesse verticale"),
    readoutId: "vs",
    params: [
      {
        name: "min",
        type: "number",
        label: { en: "Min (ft/min)", fr: "Min (ft/min)" },
        default: -800,
        min: -3000,
        max: 3000,
        step: 50,
        unit: "ft/min",
      },
      {
        name: "max",
        type: "number",
        label: { en: "Max (ft/min)", fr: "Max (ft/min)" },
        default: -400,
        min: -3000,
        max: 3000,
        step: 50,
        unit: "ft/min",
      },
    ],
    label: (p) =>
      `VS ${signedInt(n(p, "min", -800))} … ${signedInt(n(p, "max", -400))} ft/min`,
    row: (p, lang) => {
      const a = n(p, "min", -800),
        b = n(p, "max", -400);
      const mid = Math.round((a + b) / 2 / 10) * 10;
      const desc = mid < 0;
      return fr(lang)
        ? `${desc ? "Descendez" : "Montez"} à ${grp(Math.abs(mid), lang)} ft/min (${grp(Math.abs(desc ? b : a), lang)}–${grp(Math.abs(desc ? a : b), lang)})`
        : `${desc ? "Descend" : "Climb"} at ${grp(Math.abs(mid), lang)} ft/min (${grp(Math.abs(desc ? b : a), lang)}–${grp(Math.abs(desc ? a : b), lang)})`;
    },
    readout: (v, _p, lang) =>
      `${signedInt(Math.round(v.vsFpm / 10) * 10)} ft/min`.replace(
        /\d{4,}/,
        (m) => grp(Number(m), lang),
      ),
    standard: (p, lang) =>
      fr(lang)
        ? `Vitesse verticale ${NAV.vsBand.label(p, lang).slice(3)}`
        : `Vertical speed ${NAV.vsBand.label(p, lang).slice(3)}`,
    violation: (v, p, lang) =>
      fr(lang)
        ? `Vario ${signedInt(v.vsFpm)} ft/min (${signedInt(n(p, "min", -800))} … ${signedInt(n(p, "max", -400))})`
        : `Vertical speed ${signedInt(v.vsFpm)} ft/min (${signedInt(n(p, "min", -800))} … ${signedInt(n(p, "max", -400))})`,
    evaluate: (v, p) =>
      !v.onGround &&
      v.vsFpm >= n(p, "min", -800) &&
      v.vsFpm <= n(p, "max", -400),
    holdS: () => 0,
  },
};

function dmeOf(v: StageView): number | null {
  const a = activeNav(v);
  if (a.valid && a.dmeNm !== null) return a.dmeNm;
  for (const nv of [v.nav1, v.nav2])
    if (nv.valid && nv.dmeNm !== null) return nv.dmeNm;
  return null;
}
function fmtTime(sec: number): string {
  const t = Math.round(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
export function entryName(e: HoldEntryName, lang: Lang, cap = false): string {
  const m: Record<HoldEntryName, [string, string]> = {
    direct: ["direct", "directe"],
    parallel: ["parallel", "parallèle"],
    teardrop: ["teardrop", "décalée"],
  };
  const w = m[e]?.[lang === "fr" ? 1 : 0] ?? e;
  if (!cap) return w;
  return lang === "fr"
    ? `Entrée ${w}`
    : `${w[0].toUpperCase()}${w.slice(1)} entry`;
}

// ---- CheckRef delegation (procedures-mode catalogue)
const PATH_READOUT: Partial<
  Record<CheckId, (v: StageView, lang: Lang) => string>
> = {
  ias: (v) => `${Math.round(v.iasKt)} kt`,
  altBand: (v, lang) => `${grp(Math.round(v.altFt / 10) * 10, lang)} ft`,
  heading: (v) => `HDG ${hdg3(v.hdgDeg)}`,
  bankMax: (v, lang) =>
    `${word(lang, "Bank", "Incl.")} ${Math.round(Math.abs(v.bankDeg))}°`,
  pitchAtt: (v, lang) =>
    `${word(lang, "Pitch", "Assiette")} ${signedInt(v.pitchDeg)}°`,
};
const READOUT_ID: Partial<Record<CheckId, ReadoutId>> = {
  ias: "ias",
  altBand: "alt",
  heading: "hdg",
};

function delegated(id: CheckId): GoalDef {
  const c = CHECKS[id];
  const kind: GoalKind =
    c.kind === "path" ? "path" : c.kind === "action" ? "action" : c.kind;
  const asParams = (p: P) => p as Record<string, ParamValue>;
  const ctx = (v: StageView) => ({ failedAtS: 0, elapsedS: v.t });
  return {
    id,
    kind,
    name: c.name,
    params: c.params,
    readoutId: READOUT_ID[id],
    label: (p, lang) => c.label(asParams(p), lang),
    row: (p, lang) => {
      const l = c.label(asParams(p), lang);
      if (id === "heading")
        return fr(lang)
          ? `Tenez le ${l.toLowerCase()}`
          : `Hold ${l.toLowerCase()}`;
      if (id === "altBand")
        return fr(lang)
          ? `Tenez ${l.toLowerCase()}`
          : `Hold ${l.toLowerCase()}`;
      if (id === "ias")
        return fr(lang)
          ? `Tenez la ${l.toLowerCase()}`
          : `Hold ${l.toLowerCase()}`;
      return l;
    },
    readout: (v, p, lang) => {
      const f = PATH_READOUT[id];
      if (f) return f(v, lang);
      return c.evaluate(v, asParams(p), ctx(v))
        ? word(lang, "done", "fait")
        : "—";
    },
    standard: (p, lang) => c.label(asParams(p), lang),
    violation: (v, p, lang) => {
      const f = PATH_READOUT[id];
      const l = c.label(asParams(p), lang);
      if (f) return `${f(v, lang)} — ${l}`;
      return fr(lang) ? `Non fait : ${l}` : `Not done: ${l}`;
    },
    evaluate: (v, p) => c.evaluate(v, asParams(p), ctx(v)),
    holdS: (p) => c.holdS(asParams(p)),
  };
}

/** The whole catalogue, keyed by GoalCheck id. */
export const GOALS: Record<GoalId, GoalDef> = {
  ...(Object.fromEntries(
    (Object.keys(CHECKS) as CheckId[]).map((id) => [id, delegated(id)]),
  ) as Record<CheckId, GoalDef>),
  ...NAV,
};
export const GOAL_IDS = Object.keys(GOALS) as GoalId[];
/** the chips the course editor offers (procedures-only checks such as 'switch' are still accepted, listed last) */
export const COURSE_GOAL_ORDER: GoalId[] = [
  "obs",
  "toFrom",
  "cdiDefl",
  "acsScale",
  "gsDefl",
  "onRadial",
  "track",
  "heading",
  "altBand",
  "ias",
  "vsBand",
  "bankMax",
  "pitchAtt",
  "dme",
  "distTo",
  "passedFix",
  "holdEntry",
  "holdLaps",
  "tap",
  "choice",
  "cdi",
  "ap",
  "directTo",
  "radio",
  "xpdr",
  "flaps",
  "throttle",
  "switch",
  "timer",
  "landed",
  "engineRunning",
  "manual",
];

export function goalDef(
  check: GoalCheck | { id: string } | null | undefined,
): GoalDef | null {
  if (!check) return null;
  return (GOALS as Record<string, GoalDef | undefined>)[check.id] ?? null;
}
const pOf = (check: GoalCheck): P => ((check as { p?: P }).p ?? {}) as P;

/** Is the check met right now? Unknown ids are never met. `mem` keeps state across frames (passed fix). */
export function evaluate(
  check: GoalCheck,
  view: StageView,
  mem: CheckMem = {},
): boolean {
  const d = goalDef(check);
  if (!d) return false;
  try {
    return d.evaluate(view, pOf(check), mem);
  } catch {
    return false;
  }
}
export function goalLabel(check: GoalCheck, lang: Lang = "en"): string {
  const d = goalDef(check);
  return d ? d.label(pOf(check), lang) : check.id;
}
export function goalRow(check: GoalCheck, lang: Lang = "en"): string {
  const d = goalDef(check);
  return d ? d.row(pOf(check), lang) : check.id;
}
export function goalReadout(
  check: GoalCheck,
  view: StageView,
  lang: Lang = "en",
): string {
  const d = goalDef(check);
  try {
    return d ? d.readout(view, pOf(check), lang) : "";
  } catch {
    return "";
  }
}
export function goalStandard(check: GoalCheck, lang: Lang = "en"): string {
  const d = goalDef(check);
  return d ? d.standard(pOf(check), lang) : check.id;
}
/** ACS-worded violation now (null when met) */
export function goalViolation(
  check: GoalCheck,
  view: StageView,
  lang: Lang = "en",
  mem: CheckMem = {},
): string | null {
  const d = goalDef(check);
  if (!d)
    return lang === "fr"
      ? `Vérification inconnue « ${check.id} »`
      : `Unknown check '${check.id}'`;
  if (evaluate(check, view, mem)) return null;
  try {
    return d.violation(view, pOf(check), lang);
  } catch {
    return null;
  }
}
export function goalKind(check: GoalCheck): GoalKind {
  return goalDef(check)?.kind ?? "manual";
}
export function goalHoldS(check: GoalCheck): number {
  const d = goalDef(check);
  return d ? Math.max(0, d.holdS(pOf(check))) : 0;
}
/** the units note that goes with a check (null when the check has no deviation unit) */
export function goalUnitsNote(
  check: GoalCheck,
  cockpit: Cockpit,
  lang: Lang = "en",
  source?: DevSource,
): string | null {
  const p = pOf(check);
  if (check.id === "cdiDefl")
    return unitsNote(source ?? "VOR", cockpit, lang, n(p, "maxDots", 1));
  if (check.id === "gsDefl")
    return unitsNote(source ?? "GS", cockpit, lang, n(p, "maxDots", 1));
  if (check.id === "acsScale") {
    const vert = s(p, "axis", "lat") === "vert";
    return unitsNote(
      source ?? (vert ? "GS" : "LOC"),
      cockpit,
      lang,
      n(p, "frac", 0.75) * dotsPerSide(cockpit),
    );
  }
  return null;
}

/** Readable problems with a check's parameters (empty = fine). CheckRef ids use the procedures validator. */
export function goalParamIssues(check: GoalCheck, lang: Lang = "en"): string[] {
  const d = goalDef(check);
  const f = lang === "fr";
  if (!d)
    return [
      f
        ? `Vérification inconnue « ${check.id} »`
        : `Unknown check '${check.id}'`,
    ];
  if (check.id in CHECKS) return checkParamIssues(check as CheckRef, lang);
  const p = pOf(check);
  const out: string[] = [];
  for (const prm of d.params) {
    const v = p[prm.name];
    if (v === undefined || v === "") {
      if (prm.required)
        out.push(
          f
            ? `${prm.label.fr} : valeur manquante`
            : `${prm.label.en}: missing value`,
        );
      continue;
    }
    if (prm.type === "number") {
      const x = Number(v);
      if (typeof v === "boolean" || !Number.isFinite(x))
        out.push(
          f
            ? `${prm.label.fr} : nombre attendu`
            : `${prm.label.en}: a number is expected`,
        );
      else if (
        (prm.min !== undefined && x < prm.min) ||
        (prm.max !== undefined && x > prm.max)
      )
        out.push(
          f
            ? `${prm.label.fr} : entre ${prm.min} et ${prm.max}`
            : `${prm.label.en}: must be between ${prm.min} and ${prm.max}`,
        );
    } else if (
      prm.type === "enum" &&
      prm.options &&
      !prm.options.some((o) => o.value === v || String(o.value) === String(v))
    )
      out.push(
        f
          ? `${prm.label.fr} : valeur « ${String(v)} » non prévue`
          : `${prm.label.en}: '${String(v)}' is not an option`,
      );
    else if (prm.type === "string" && typeof v !== "string")
      out.push(
        f
          ? `${prm.label.fr} : texte attendu`
          : `${prm.label.en}: text is expected`,
      );
  }
  if (
    (check.id === "dme" || check.id === "vsBand") &&
    n(p, "min", 0) > n(p, "max", 0)
  )
    out.push(
      f ? "Le minimum dépasse le maximum" : "The minimum is above the maximum",
    );
  if (check.id === "distTo" && p.maxNm === undefined && p.minNm === undefined)
    out.push(
      f
        ? "Donnez une distance maximale ou minimale"
        : "Give a maximum or a minimum distance",
    );
  if (
    (check.id === "onRadial" && !navigaidPos(s(p, "navaid", ""))) ||
    ((check.id === "passedFix" || check.id === "distTo") &&
      !navigaidPos(s(p, check.id === "distTo" ? "fix" : "ident", "")))
  )
    out.push(
      f
        ? "Point ou balise introuvable dans la base de navigation"
        : "Fix or navaid not found in the nav database",
    );
  return out;
}

// ------------------------------------------------------------------ rows and live tracking
export interface GoalRow {
  /** index into goal.all, or -1 for the "Hold it for N s" row */
  check: number;
  text: string;
  readoutId?: ReadoutId;
}
/** "Do this" rows for a goal: one per check, then "Hold it for N s" when the goal has a hold time. */
export function rowsFor(
  goal: StepGoal | GoalCheck[],
  lang: Lang = "en",
): GoalRow[] {
  const checks = Array.isArray(goal) ? goal : goal.all;
  const rows: GoalRow[] = checks.map((c, i) => ({
    check: i,
    text: goalRow(c, lang),
    readoutId: goalDef(c)?.readoutId,
  }));
  const holdS = Array.isArray(goal) ? 0 : (goal.holdS ?? 0);
  if (holdS > 0)
    rows.push({
      check: -1,
      text: lang === "fr" ? `Tenez-le ${holdS} s` : `Hold it for ${holdS} s`,
    });
  return rows;
}
/** the goal strip line: "bar within 1 dot, TO, for 10 s" */
export function goalSummary(goal: StepGoal, lang: Lang = "en"): string {
  const parts = goal.all.map((c) => goalLabel(c, lang));
  const h = goal.holdS
    ? lang === "fr"
      ? `pendant ${goal.holdS} s`
      : `for ${goal.holdS} s`
    : "";
  return [parts.join(", "), h]
    .filter(Boolean)
    .join(lang === "fr" ? ", " : ", ");
}

export interface RowState {
  check: number;
  text: string;
  /** sticky: met once (for its own hold time) */
  ticked: boolean;
  /** true right now */
  now: boolean;
  readout: string;
  /** the first row not yet ticked */
  current: boolean;
}
export interface GoalState {
  rows: RowState[];
  /** sticky once met */
  met: boolean;
  /** seconds held so far in the final hold (0 when there is none) */
  heldS: number;
  holdS: number;
  /** seconds since the tracker started */
  t: number;
  /** when the goal was met (tracker time) */
  metAtS: number | null;
}

/** Live "Do this" tracking of a StepGoal (Try it, YourTurn, the stage goal strip). */
export class GoalTracker {
  readonly checks: GoalCheck[];
  readonly holdS: number;
  private mem: CheckMem[];
  private since: (number | null)[];
  private ticked: boolean[];
  private now: boolean[];
  private holdSet: number[] | null = null;
  private heldS = 0;
  private t = 0;
  private metAt: number | null = null;
  private texts: string[];
  private readouts: string[];
  constructor(
    goal: StepGoal | GoalCheck[],
    private lang: Lang = "en",
    /** custom row texts (reader "Do this" rows), by check index */
    rowTexts?: (string | undefined)[],
  ) {
    this.checks = Array.isArray(goal) ? goal : goal.all;
    this.holdS = Array.isArray(goal) ? 0 : Math.max(0, goal.holdS ?? 0);
    const k = this.checks.length;
    this.mem = Array.from({ length: k }, () => ({}));
    this.since = Array(k).fill(null);
    this.ticked = Array(k).fill(false);
    this.now = Array(k).fill(false);
    this.texts = this.checks.map((c, i) => rowTexts?.[i] ?? goalRow(c, lang));
    this.readouts = Array(k).fill("");
  }
  reset() {
    const k = this.checks.length;
    this.mem = Array.from({ length: k }, () => ({}));
    this.since.fill(null);
    this.ticked.fill(false);
    this.now.fill(false);
    this.holdSet = null;
    this.heldS = 0;
    this.t = 0;
    this.metAt = null;
  }
  update(view: StageView, dt: number): GoalState {
    this.t += Math.max(0, dt);
    this.checks.forEach((c, i) => {
      const ok = evaluate(c, view, this.mem[i]);
      this.now[i] = ok;
      this.readouts[i] = goalReadout(c, view, this.lang);
      if (ok) {
        this.since[i] ??= this.t - Math.max(0, dt);
        if (this.t - this.since[i]! + 1e-9 >= goalHoldS(c))
          this.ticked[i] = true;
      } else this.since[i] = null;
    });
    if (this.metAt === null && this.ticked.every(Boolean)) {
      if (this.holdS <= 0) this.metAt = this.t;
      else {
        if (this.holdSet === null) {
          // the hold starts now, with what the student has at the moment the last row ticks
          this.holdSet = this.now.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
          this.heldS = 0;
        } else {
          const holding = this.holdSet.every((i) => this.now[i]);
          this.heldS = holding ? this.heldS + Math.max(0, dt) : 0;
        }
        if (this.heldS + 1e-9 >= this.holdS) this.metAt = this.t;
      }
    }
    return this.state();
  }
  state(): GoalState {
    const first = this.ticked.findIndex((x) => !x);
    const rows: RowState[] = this.checks.map((_, i) => ({
      check: i,
      text: this.texts[i],
      ticked: this.ticked[i],
      now: this.now[i],
      readout: this.readouts[i],
      current: i === first,
    }));
    if (this.holdS > 0)
      rows.push({
        check: -1,
        text:
          this.lang === "fr"
            ? `Tenez-le ${this.holdS} s`
            : `Hold it for ${this.holdS} s`,
        ticked: this.metAt !== null,
        now: this.metAt !== null || this.heldS > 0,
        readout: `${Math.min(this.holdS, Math.floor(this.metAt !== null ? this.holdS : this.heldS))} / ${this.holdS} s`,
        current: first < 0 && this.metAt === null,
      });
    return {
      rows,
      met: this.metAt !== null,
      heldS: this.metAt !== null ? this.holdS : this.heldS,
      holdS: this.holdS,
      t: this.t,
      metAtS: this.metAt,
    };
  }
}

/** An answer-by-flying quiz: evaluate once, on demand, no hold time (SPEC §4.4). */
export function checkNow(
  checks: GoalCheck[],
  view: StageView,
  lang: Lang = "en",
): {
  met: boolean;
  results: { met: boolean; readout: string; violation: string | null }[];
} {
  const results = checks.map((c) => {
    const mem: CheckMem = {};
    const met = evaluate(c, view, mem);
    return {
      met,
      readout: goalReadout(c, view, lang),
      violation: met ? null : goalViolation(c, view, lang, mem),
    };
  });
  return { met: results.length > 0 && results.every((r) => r.met), results };
}

// ------------------------------------------------------------------ suggestions ("Suggested for this scene")
export interface GoalSuggestion {
  check: GoalCheck;
  why: L10n;
}
const r5 = (x: number) => Math.round(x / 5) * 5;
const r100 = (x: number) => Math.round(x / 100) * 100;
/**
 * Goals that match what the stage shows (SPEC §5): on a localizer LOC/GS ¾ scale and IAS ±10; in a hold entry and
 * laps; tracking a VOR the CDI within 1 dot (steam: 2 dots) with the flag; descending a VS band; in cruise altitude
 * ±100 and heading ±10.
 */
export function suggestGoals(
  view: StageView,
  scene?: SimScene | null,
): GoalSuggestion[] {
  const out: GoalSuggestion[] = [];
  const lat = lateralSource(view);
  const vert = verticalSource(view);
  const airborne = !view.onGround;
  const ias = r5(view.iasKt);
  const iasBand: GoalCheck = {
    id: "ias",
    p: { min: ias - 10, max: ias + 10, holdS: 0 },
  };
  const onApproach =
    !!scene?.plan?.approach ||
    (lat.source === "LOC" && lat.dev !== null) ||
    (vert.dev !== null && view.cdi === "GPS");
  if (view.hold) {
    const expected = view.hold.correct ?? view.hold.predicted;
    if (expected)
      out.push({
        check: { id: "holdEntry", p: { expected } },
        why: L(
          "In a hold: the AIM entry for your arrival",
          "En attente : l’entrée AIM pour votre arrivée",
        ),
      });
    out.push({
      check: { id: "holdLaps", p: { laps: 2, legS: 60 } },
      why: L("Two laps, 1:00 inbound", "Deux tours, 1:00 en rapprochement"),
    });
    out.push({
      check: {
        id: "altBand",
        p: { min: r100(view.altFt) - 100, max: r100(view.altFt) + 100 },
      },
      why: L("Holding altitude ±100 ft", "Altitude d’attente ±100 ft"),
    });
    return out;
  }
  if (airborne && onApproach && lat.dev !== null) {
    out.push({
      check: { id: "acsScale", p: { axis: "lat", frac: 0.75 } },
      why: L("ACS: lateral within ¾ scale", "ACS : latéral dans ¾ d’échelle"),
    });
    if (vert.dev !== null)
      out.push({
        check: { id: "acsScale", p: { axis: "vert", frac: 0.75 } },
        why: L(
          "ACS: vertical within ¾ scale",
          "ACS : vertical dans ¾ d’échelle",
        ),
      });
    out.push({
      check: iasBand,
      why: L("Approach speed ±10 kt", "Vitesse d’approche ±10 kt"),
    });
    return out;
  }
  if (airborne && lat.source === "VOR" && lat.nav && lat.dev !== null) {
    out.push({
      check: {
        id: "obs",
        p: {
          nav: view.cdi === "NAV2" ? 2 : 1,
          value: Math.round(view.cdi === "NAV2" ? view.obs2 : view.obs1) || 360,
          tol: 2,
        },
      },
      why: L("The course you have set", "La route affichée"),
    });
    if (lat.nav.toFrom !== "OFF")
      out.push({
        check: { id: "toFrom", p: { value: lat.nav.toFrom } },
        why: L("The flag you have now", "L’indicateur actuel"),
      });
    out.push({
      check: {
        id: "cdiDefl",
        p: { maxDots: view.cockpit === "steam" ? 2 : 1 },
      },
      why: L(
        "Tracking: bar within 2° … 5°",
        "Suivi : aiguille à moins de 2° … 5°",
      ),
    });
  }
  if (airborne && view.vsFpm < -300) {
    const vs = Math.round(view.vsFpm / 50) * 50;
    out.push({
      check: { id: "vsBand", p: { min: vs - 150, max: vs + 150 } },
      why: L(
        "The descent rate you are flying ±150",
        "Le taux de descente actuel ±150",
      ),
    });
  } else if (airborne && view.vsFpm > 300) {
    out.push({
      check: iasBand,
      why: L("Climb speed ±10 kt", "Vitesse de montée ±10 kt"),
    });
  } else if (airborne) {
    const alt = r100(view.altFt);
    out.push({
      check: { id: "altBand", p: { min: alt - 100, max: alt + 100 } },
      why: L("Cruise: altitude ±100 ft", "Croisière : altitude ±100 ft"),
    });
    if (!out.some((x) => x.check.id === "cdiDefl"))
      out.push({
        check: {
          id: "heading",
          p: { value: r5(view.hdgDeg) % 360 || 360, tol: 10 },
        },
        why: L("Cruise: heading ±10°", "Croisière : cap ±10°"),
      });
  }
  return out;
}

// ------------------------------------------------------------------ "Use what I just did"
export interface FittedCheck {
  check: GoalCheck;
  /** what was observed: "max 0.6 dot", "±70 ft" */
  observed: string;
  changed: boolean;
}
const ceilTo = (x: number, step: number) => Math.ceil(x / step - 1e-9) * step;
/**
 * Set tolerances from the author's preview run (SPEC §5): each tolerance becomes the worst deviation seen, plus a
 * 25 % margin, rounded up to an instructor's figure (0.5 dot, 5°, 50 ft, 5 kt, 50 ft/min), never below a floor.
 * Checks without a tolerance (OBS value, flags, entries) are returned unchanged. Bands keep their centre.
 */
export function fitTolerances(
  checks: GoalCheck[],
  run: StageView[],
  lang: Lang = "en",
): FittedCheck[] {
  const f = lang === "fr";
  return checks.map((check) => {
    const p = pOf(check);
    const keep = (observed = ""): FittedCheck => ({
      check,
      observed,
      changed: false,
    });
    if (!run.length) return keep();
    const fit = (np: P, observed: string): FittedCheck => {
      const next = { ...check, p: { ...p, ...np } } as GoalCheck;
      return {
        check: next,
        observed,
        changed: JSON.stringify(next) !== JSON.stringify(check),
      };
    };
    const maxAbs = (xs: (number | null)[]) =>
      Math.max(0, ...xs.filter((x): x is number => x !== null).map(Math.abs));
    switch (check.id) {
      case "cdiDefl": {
        const m = maxAbs(run.map(lateralDots));
        return fit(
          { maxDots: Math.max(0.5, ceilTo(m * 1.25, 0.5)) },
          `max ${fmtNum(m, 1, lang)} ${f ? "point" : "dot"}`,
        );
      }
      case "gsDefl": {
        const m = maxAbs(run.map(verticalDots));
        return fit(
          { maxDots: Math.max(0.5, ceilTo(m * 1.25, 0.5)) },
          `max ${fmtNum(m, 1, lang)} ${f ? "point" : "dot"}`,
        );
      }
      case "acsScale": {
        const vert = s(p, "axis", "lat") === "vert";
        const m = maxAbs(
          run.map((v) => (vert ? verticalSource(v).dev : lateralSource(v).dev)),
        );
        // never wider than the ACS ¾ scale: a tighter practice goal is fine, a looser one is not ACS
        return fit(
          { frac: Math.min(0.75, Math.max(0.25, ceilTo(m * 1.25, 0.05))) },
          `max ${Math.round(m * 100)} %`,
        );
      }
      case "heading":
      case "track": {
        const target = n(p, "value", 90);
        const m = maxAbs(
          run.map((v) =>
            wrap180((check.id === "heading" ? v.hdgDeg : v.trkDeg) - target),
          ),
        );
        return fit(
          { tol: Math.max(5, ceilTo(m * 1.25, 5)) },
          `±${Math.round(m)}°`,
        );
      }
      case "onRadial": {
        const pos = navigaidPos(s(p, "navaid", ""));
        if (!pos) return keep();
        const m = maxAbs(
          run.map((v) => wrap180(bearingDeg(pos, v) - n(p, "radial", 90))),
        );
        return fit(
          { tol: Math.max(2, ceilTo(m * 1.25, 1)) },
          `±${Math.round(m)}°`,
        );
      }
      case "altBand":
      case "ias":
      case "vsBand":
      case "dme": {
        const key = {
          altBand: "altFt",
          ias: "iasKt",
          vsBand: "vsFpm",
          dme: "dme",
        }[check.id] as string;
        const val = (v: StageView) =>
          key === "dme" ? dmeOf(v) : (v[key as "altFt"] as number);
        const lo = n(p, "min", 0),
          hi = n(p, "max", 0);
        const mid = (lo + hi) / 2;
        const m = maxAbs(
          run.map((v) => {
            const x = val(v);
            return x === null ? null : x - mid;
          }),
        );
        const step = { altBand: 50, ias: 5, vsBand: 50, dme: 0.5 }[check.id];
        const floor = { altBand: 50, ias: 5, vsBand: 100, dme: 0.5 }[check.id];
        const half = Math.max(floor, ceilTo(m * 1.25, step));
        const unit = { altBand: "ft", ias: "kt", vsBand: "ft/min", dme: "NM" }[
          check.id
        ];
        return fit(
          {
            min: Math.round((mid - half) * 10) / 10,
            max: Math.round((mid + half) * 10) / 10,
          },
          `±${fmtNum(m, check.id === "dme" ? 1 : 0, lang)} ${unit}`,
        );
      }
      case "bankMax": {
        const m = maxAbs(run.map((v) => v.bankDeg));
        return fit(
          { max: Math.max(5, ceilTo(m * 1.25, 5)) },
          `max ${Math.round(m)}°`,
        );
      }
      default:
        return keep();
    }
  });
}

/** Practice wording for a graded Try it: "met / not met" with the tolerance, never a score (SPEC §9.8). */
export function practiceVerdict(
  met: boolean,
  goal: StepGoal,
  lang: Lang = "en",
): string {
  const sum = goalSummary(goal, lang);
  return lang === "fr"
    ? `${met ? "Atteint" : "Pas encore atteint"} : ${sum}`
    : `${met ? "Met" : "Not met yet"}: ${sum}`;
}

export { tr as l10n };

// ------------------------------------------------------------------ Fly-it criteria (shared by toExercise and handoff)
/** criteria of a Fly it, completed from a calc problem's goals when the author wrote none */
export function flyCriteria(fly: FlyIt, calc?: CalcProblem): Criterion[] {
  if (fly.criteria.length) return fly.criteria;
  const goals = fly.target.kind === "calc" ? (calc?.stage?.goals ?? []) : [];
  return goals.map((check, i) => ({
    id: `calc${i}`,
    label: { en: goalLabel(check, "en"), fr: goalLabel(check, "fr") },
    check,
  }));
}

/** The FlyIt a YourTurn { where: 'sim' } stands for: the block's scene, its goal as criteria, back to the slide. */
export function yourTurnFlyIt(yt: YourTurn, sceneId: string): FlyIt {
  return {
    target: {
      kind: "scene",
      scene: yt.scene ?? sceneId,
      durationS: yt.durationS,
      endWhen: yt.endWhen,
    },
    brief: yt.prompt,
    options: yt.options ?? [],
    defaultsOn: [],
    criteria: yt.goal.all.map((check, i) => ({
      id: `g${i}`,
      label: { en: goalLabel(check, "en"), fr: goalLabel(check, "fr") },
      check,
    })),
    returnTo: yt.returnTo ?? "thisStep",
  };
}
