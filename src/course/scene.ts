// Ground school scenes (SPEC §9.3, the fidelity rules): capture a live Sim into a SimScene, apply a scene to any Sim
// in the load-bearing order, re-derive what the displays read (TRK, GS, turn rate) from the wind triangle, verify the
// result against what was captured, build a scene from fields ("Edit as numbers"), validate it against the loaded
// nav data, and encode it for `index.html?scene=S1.…` links.
//
// Capture is exact where the state is plain (raw `sim.ac.s`, raw `sim.av`) and declarative where it is private
// (autopilot modes and bugs through the public API, the flight plan by idents + approach + active leg). Private state
// that cannot be restored is listed in `notCaptured` (hold sequencing restarts at the fix, autopilot capture
// integrators restart from the current attitude).
//
// Time origin: a scene's clock starts at 0. `pose.av.timerStart` is stored relative to that origin (a chronometer
// started 40 s before the capture reads -40), so the chronometer shows the same time after applyScene (sim.time 0)
// or after poseScene on a running Sim (rebased on sim.time).
//
// Flight-plan idents (`plan.idents`, the en-route part; the approach comes from `plan.approach`):
//   IDENT                    a fix, navaid or airport of the loaded nav data
//   IDENT@lat,lon            a waypoint at that position (PPOS, a user waypoint, or a fix that moved)
//   …/A3000                  altitude constraint (altMin)
//   …/H270R1  …/H090L1.5N4   a user hold: inbound course, turn, leg minutes, optional leg NM
//   …/O  …/S  …/U            fly-over, part of a SID, entered by the pilot
//   ~D@lat,lon               (last) the Direct-To origin of the active leg
//   ~O123                    (last) GPS OBS mode on, course 123
import type { AircraftState } from "../sim/aircraft";
import { AIRFRAME, asiPositionError as asiErr } from "../sim/aircraft";
import type { Avionics, Equipment, Failures, Sim } from "../sim/sim";
import { FAILURE_LABELS, fullEquipment } from "../sim/sim";
import {
  density,
  FT,
  G,
  KT,
  pressureAltitude,
  type Weather,
} from "../sim/environment";
import { apSnapshot, cloneAvionics, type ApSnapshot } from "../sim/recorder";
import { defaultSwitches } from "../sim/systemsTypes";
import type { LatMode, VertMode } from "../avionics/autopilot";
import type { HoldSpec, Waypoint } from "../nav/flightplan";
import {
  findApproach,
  findFix,
  groundElevation,
  NAVAIDS,
  runway,
} from "../nav/data";
import {
  bearingDeg,
  DEG,
  destination,
  distanceNm,
  norm360,
  wrap180,
  type LatLon,
} from "../nav/geo";
import { currentRegion } from "../nav/world";
import { startAt } from "../train/engine";
import type {
  Cockpit,
  L10n,
  Lang,
  SceneFields,
  SimScene,
  StagePose,
  World,
} from "./types";

// ---------------------------------------------------------------- types
export type SceneVerify = NonNullable<SimScene["verify"]>;
export type SceneAp = NonNullable<SimScene["ap"]>;
export type ScenePlan = NonNullable<SimScene["plan"]>;
export type ExactPose = Extract<SimScene["pose"], { kind: "exact" }>;

/** one difference between what was captured and what the sim shows after applyScene */
export interface SceneDiff {
  field: keyof SceneVerify | "approach" | "plan" | "position";
  expected: string | number | null;
  got: string | number | null;
  text: L10n;
}

export interface CaptureOptions {
  id?: string;
  label?: string;
  /** the cockpit on screen (the Sim does not know it); default g1000 */
  cockpit?: Cockpit;
  /** default: training, or the loaded real-world region (name it: the Sim does not know it) */
  world?: World;
  covers?: ("ai" | "dg")[];
  timeOfDay?: "day" | "dusk" | "night";
  from?: "cockpit" | "fields" | "rewind" | "calc";
  /** ISO time of the capture (default now) */
  at?: string;
  /** pinned seed; default the Sim's current stream state (the stream continues from here) */
  seed?: number;
  airac?: string;
  thumb?: string;
  still?: string;
}

export class SceneError extends Error {
  constructor(
    readonly code:
      | "position"
      | "approach"
      | "format"
      | "version"
      | "corrupt"
      | "size",
    message: string,
  ) {
    super(message);
    this.name = "SceneError";
  }
}

const SCENE_V = 1;
const round = (x: number, k: number) => Math.round(x * 10 ** k) / 10 ** k;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

let idSeq = 0;
/** short unique id (no crypto.randomUUID: it needs a secure context, and an iPad on the LAN is not one) */
export function newSceneId(prefix = "sc"): string {
  idSeq = (idSeq + 1) % 1296;
  return `${prefix}-${Date.now().toString(36)}${idSeq.toString(36).padStart(2, "0")}${Math.floor(
    Math.random() * 1296,
  )
    .toString(36)
    .padStart(2, "0")}`;
}

// ---------------------------------------------------------------- the aircraft's display filters
/** The Aircraft's private display filters. A pose written into `ac.s` leaves them describing the previous state
 *  (a VS spike from the altitude jump, a turn rate from the heading jump, a track that lags the new heading), so
 *  they are settled here. Kept in one place and covered by tests/scene.test.ts: a rename in aircraft.ts fails it. */
interface AircraftInternals {
  lastWind: unknown;
  lastPsi: number;
  lastAlt: number;
  vsFilt: number;
  iasFilt: number;
  gvE: number;
  gvN: number;
  gFilt: number;
  nz: number;
  thrEff: number;
  clLast: number;
  clFilt: number;
  computeData(dt: number, w: Weather): void;
}

/** wing lift coefficient of steady flight at this state (a level turn's load factor) */
function steadyCl(s: AircraftState, w: Weather): number {
  if (s.onGround) return 0.5;
  const rho = density(pressureAltitude(s.altFt, w.qnh), w.oatSeaLevelC);
  const n = 1 / Math.max(0.2, Math.cos(s.phi));
  const V = Math.max(10, s.tas);
  return clamp(
    (n * AIRFRAME.massKg * G) / (0.5 * rho * V * V * AIRFRAME.wingArea),
    -1.2,
    2.2,
  );
}

/**
 * Re-derive the display data after a pose was written into `sim.ac.s` (SPEC §9.3 step 5): ground track and ground
 * speed from the wind triangle (TAS, heading, wind at altitude), the turn rate from bank and TAS (g·tanφ/V), the
 * vertical speed from the flight path, the indicated airspeed from TAS and density, the load factor from the bank.
 * `applySnapshot` leaves these unset, which drew TRK 232° against HDG 264° on a 270° final.
 */
export function rederive(sim: Sim): void {
  const ac = sim.ac;
  const s = ac.s;
  const I = ac as unknown as AircraftInternals;
  const air = !s.onGround;
  const n = air ? 1 / Math.max(0.2, Math.cos(s.phi)) : 1;
  const cl = steadyCl(s, sim.weather);
  I.lastWind = null; // resample the wind at the new position and altitude
  I.lastPsi = s.psi;
  I.lastAlt = s.altFt;
  I.vsFilt = air ? ((s.tas * Math.sin(s.gamma)) / FT) * 60 : 0;
  I.iasFilt = -1; // re-initialised from TAS and density
  I.gvE = NaN; // GPS-smoothed ground velocity: re-initialised to the wind triangle
  I.gvN = NaN;
  I.gFilt = n;
  I.nz = n;
  I.thrEff = -1; // the engine sees the throttle as set
  I.clLast = cl;
  I.clFilt = cl;
  I.computeData(0, sim.weather);
  const d = ac.data;
  d.turnRateDps = air ? (G * Math.tan(s.phi)) / Math.max(10, s.tas) / DEG : 0;
  sim.systems.step(0, sim);
}

/** TAS (m/s) that indicates `iasKt` at this altitude, with the C172 pitot-static position error */
export function tasForIas(
  iasKt: number,
  altFt: number,
  w: Weather,
  bankDeg = 0,
): number {
  const rho = density(pressureAltitude(altFt, w.qnh), w.oatSeaLevelC);
  const sq = Math.sqrt(rho / 1.225);
  let tas = (iasKt * KT) / sq;
  // the ASI error depends on CL, which depends on TAS: a few fixed-point iterations converge
  for (let i = 0; i < 4; i++) {
    const n = 1 / Math.max(0.2, Math.cos(bankDeg * DEG));
    const cl = clamp(
      (n * AIRFRAME.massKg * G) / (0.5 * rho * tas * tas * AIRFRAME.wingArea),
      -1.2,
      2.2,
    );
    tas = Math.max(1, (iasKt - asiErr(cl)) * KT) / sq;
  }
  return tas;
}

// ---------------------------------------------------------------- flight-plan idents
const COORD = (x: number) => round(x, 7).toString();

function sameSpot(a: LatLon, b: LatLon): boolean {
  return Math.abs(a.lat - b.lat) < 2e-5 && Math.abs(a.lon - b.lon) < 2e-5;
}

function encodeWpt(w: Waypoint): string {
  const f = w.ident === "PPOS" ? undefined : findFix(w.ident);
  let out =
    f && sameSpot(f, w)
      ? w.ident
      : `${w.ident}@${COORD(w.lat)},${COORD(w.lon)}`;
  if (w.altMin !== undefined) out += `/A${Math.round(w.altMin)}`;
  if (w.hold && w.hold.kind !== "published") {
    const h = w.hold;
    out += `/H${String(Math.round(norm360(h.inbound))).padStart(3, "0")}${h.turn}${round(h.legMin, 2)}`;
    if (h.legNm) out += `N${round(h.legNm, 2)}`;
  }
  if (w.flyOver) out += "/O";
  if (w.sid) out += "/S";
  if (w.user) out += "/U";
  return out;
}

/** the en-route part of the plan as idents (+ the Direct-To origin and OBS mode as trailing entries) */
export function planIdents(sim: Sim): string[] {
  const fp = sim.fp;
  const out = fp.wpts.filter((w) => !w.appr).map(encodeWpt);
  if (fp.directFrom)
    out.push(`~D@${COORD(fp.directFrom.lat)},${COORD(fp.directFrom.lon)}`);
  if (fp.obsMode) out.push(`~O${Math.round(norm360(fp.obsCourse))}`);
  return out;
}

export interface ParsedIdents {
  wpts: Waypoint[];
  directFrom: LatLon | null;
  obs: number | null;
  /** idents that are neither in the nav data nor carry a position */
  unknown: string[];
}

export function parseIdents(idents: string[]): ParsedIdents {
  const out: ParsedIdents = {
    wpts: [],
    directFrom: null,
    obs: null,
    unknown: [],
  };
  for (const raw of idents) {
    if (raw.startsWith("~D@")) {
      const [la, lo] = raw.slice(3).split(",").map(Number);
      if (Number.isFinite(la) && Number.isFinite(lo))
        out.directFrom = { lat: la, lon: lo };
      continue;
    }
    if (raw.startsWith("~O")) {
      const c = Number(raw.slice(2));
      if (Number.isFinite(c)) out.obs = c;
      continue;
    }
    const [head, ...flags] = raw.split("/");
    const at = head.indexOf("@");
    const ident = (at >= 0 ? head.slice(0, at) : head).trim();
    let pos: LatLon | null = null;
    if (at >= 0) {
      const [la, lo] = head
        .slice(at + 1)
        .split(",")
        .map(Number);
      if (Number.isFinite(la) && Number.isFinite(lo))
        pos = { lat: la, lon: lo };
    } else {
      const f = findFix(ident);
      if (f) pos = { lat: f.lat, lon: f.lon };
    }
    if (!pos || !ident) {
      out.unknown.push(ident || raw);
      continue;
    }
    const w: Waypoint = { ident, lat: pos.lat, lon: pos.lon };
    for (const fl of flags) {
      if (fl.startsWith("A")) w.altMin = Number(fl.slice(1));
      else if (fl.startsWith("H")) {
        const m = /^H(\d{1,3})([RL])([\d.]+)(?:N([\d.]+))?$/.exec(fl);
        if (m) {
          const h: HoldSpec = {
            inbound: Number(m[1]),
            turn: m[2] as "R" | "L",
            legMin: Number(m[3]),
            kind: "user",
          };
          if (m[4]) h.legNm = Number(m[4]);
          w.hold = h;
        }
      } else if (fl === "O") w.flyOver = true;
      else if (fl === "S") w.sid = true;
      else if (fl === "U") w.user = true;
    }
    out.wpts.push(w);
  }
  return out;
}

/** the approach transition flown, from the transition waypoints in the plan */
function transitionOf(sim: Sim): string | null {
  const ap = sim.fp.approach;
  if (!ap) return null;
  const trans = sim.fp.wpts
    .filter((w) => w.appr === "trans" && !w.ptPoint)
    .map((w) => w.ident);
  if (!trans.length) return null;
  const tr = ap.transitions.find(
    (t) => t.legs.length > 0 && t.legs[0].fix.ident === trans[0],
  );
  return (
    tr?.name ??
    ap.transitions.find((t) => t.legs.some((l) => l.fix.ident === trans[0]))
      ?.name ??
    null
  );
}

// ---------------------------------------------------------------- annunciation and verify
const LAT_MODES: readonly string[] = ["ROL", "HDG", "GPS", "VOR", "LOC", "BC"];
const VERT_MODES: readonly string[] = ["PIT", "ALT", "VS", "FLC", "GS", "GP"];

/** "AP HDG ALT · LOC GS APR", "FD ROL PIT", "AP off" */
export function apAnnunciation(ap: ApSnapshot | SceneAp): string {
  const engaged = ap.engaged || !!ap.fd;
  if (!engaged) return "AP off";
  const armed = ap.armed?.length ? ` · ${ap.armed.join(" ")}` : "";
  return `${ap.engaged ? "AP" : "FD"} ${ap.lat ?? "ROL"} ${ap.vert ?? "PIT"}${armed}`;
}

/** what the instruments show now, in the verify shape (dots to 0.01, DME to 0.1 NM, TRK and HDG to the degree) */
export function verifyOf(sim: Sim): SceneVerify {
  const lat = sim.rec.latDots(sim);
  const vert = sim.rec.vertDots(sim);
  const nav = sim.av.cdi === "NAV2" ? sim.nav2 : sim.nav1;
  const d = sim.ac.data;
  return {
    cdiDots: lat === null ? null : round(lat, 2),
    gsDots: vert === null ? null : round(vert, 2),
    dmeNm: nav.valid && nav.dmeNm !== null ? round(nav.dmeNm, 1) : null,
    activeWpt:
      sim.fp.out.valid && sim.fp.out.toIdent ? sim.fp.out.toIdent : null,
    apAnnun: apAnnunciation(apSnapshot(sim.ap)),
    trk: Math.round(norm360(d.trackSmooth)) % 360,
    hdg: Math.round(norm360(d.hdgTrue)) % 360,
  };
}

const fmtDots = (x: number | null) => (x === null ? "—" : `${x.toFixed(2)}`);

/** the differences between a captured verify line and what the sim shows (tolerances of SPEC §9.3) */
export function compareVerify(
  want: SceneVerify,
  got: SceneVerify,
): SceneDiff[] {
  const out: SceneDiff[] = [];
  const dots = (field: "cdiDots" | "gsDots", name: L10n) => {
    const a = want[field];
    const b = got[field];
    if (a === null && b === null) return;
    if (a !== null && b !== null && Math.abs(a - b) <= 0.05 + 1e-9) return;
    out.push({
      field,
      expected: a,
      got: b,
      text: {
        en: `${name.en} ${fmtDots(b)} dot (captured ${fmtDots(a)})`,
        fr: `${name.fr} ${fmtDots(b)} point (capturé ${fmtDots(a)})`,
      },
    });
  };
  dots("cdiDots", { en: "CDI", fr: "CDI" });
  dots("gsDots", { en: "Vertical deviation", fr: "Écart vertical" });
  if (
    (want.dmeNm === null) !== (got.dmeNm === null) ||
    (want.dmeNm !== null &&
      got.dmeNm !== null &&
      Math.abs(want.dmeNm - got.dmeNm) > 0.15)
  )
    out.push({
      field: "dmeNm",
      expected: want.dmeNm,
      got: got.dmeNm,
      text: {
        en: `DME ${got.dmeNm ?? "—"} NM (captured ${want.dmeNm ?? "—"})`,
        fr: `DME ${got.dmeNm ?? "—"} NM (capturé ${want.dmeNm ?? "—"})`,
      },
    });
  if (want.activeWpt !== got.activeWpt)
    out.push({
      field: "activeWpt",
      expected: want.activeWpt,
      got: got.activeWpt,
      text: {
        en: `Active waypoint ${got.activeWpt ?? "none"} (captured ${want.activeWpt ?? "none"})`,
        fr: `Point actif ${got.activeWpt ?? "aucun"} (capturé ${want.activeWpt ?? "aucun"})`,
      },
    });
  if (want.apAnnun !== got.apAnnun)
    out.push({
      field: "apAnnun",
      expected: want.apAnnun,
      got: got.apAnnun,
      text: {
        en: `Autopilot ${got.apAnnun} (captured ${want.apAnnun})`,
        fr: `Pilote automatique ${got.apAnnun} (capturé ${want.apAnnun})`,
      },
    });
  if (Math.abs(wrap180(want.trk - got.trk)) > 2)
    out.push({
      field: "trk",
      expected: want.trk,
      got: got.trk,
      text: {
        en: `Track ${got.trk}° (captured ${want.trk}°)`,
        fr: `Route ${got.trk}° (capturée ${want.trk}°)`,
      },
    });
  if (Math.abs(wrap180(want.hdg - got.hdg)) > 1)
    out.push({
      field: "hdg",
      expected: want.hdg,
      got: got.hdg,
      text: {
        en: `Heading ${got.hdg}° (captured ${want.hdg}°)`,
        fr: `Cap ${got.hdg}° (capturé ${want.hdg}°)`,
      },
    });
  return out;
}

const pad3 = (x: number) =>
  String(Math.round(norm360(x)) % 360 || 360).padStart(3, "0");

/**
 * The editor's green verify line (SPEC §5): "Re-applied as captured: LOC 0.1 dot R · GS 0.4 dot high · DME 5.0 ·
 * AP off · seed 4183 · AIRAC 2611". Pass the Sim the scene was applied to (it names the CDI source) and the diffs
 * applyScene returned; with diffs the line starts "Re-applied with N differences".
 */
export function verifyLine(
  sim: Sim,
  scene: SimScene,
  diffs: SceneDiff[],
  lang: Lang = "en",
): { ok: boolean; text: string } {
  const v = verifyOf(sim);
  const fr = lang === "fr";
  const parts: string[] = [];
  const nav = sim.navInputs();
  const src = nav.cdi === "GPS" ? "GPS" : nav.nav.isLoc ? "LOC" : "VOR";
  if (v.cdiDots !== null) {
    const a = Math.abs(v.cdiDots);
    const side =
      a < 0.05 ? "" : v.cdiDots > 0 ? (fr ? " D" : " R") : fr ? " G" : " L";
    parts.push(`${src} ${a.toFixed(1)} ${fr ? "point" : "dot"}${side}`);
  } else parts.push(`${src} ${fr ? "invalide" : "invalid"}`);
  if (v.gsDots !== null) {
    const a = Math.abs(v.gsDots);
    const what =
      a < 0.05
        ? fr
          ? "centré"
          : "centred"
        : v.gsDots > 0
          ? fr
            ? "bas"
            : "low"
          : fr
            ? "haut"
            : "high";
    parts.push(
      `${nav.cdi === "GPS" ? "GP" : "GS"} ${a < 0.05 ? "" : a.toFixed(1) + (fr ? " point " : " dot ")}${what}`.replace(
        "  ",
        " ",
      ),
    );
  }
  if (v.dmeNm !== null) parts.push(`DME ${v.dmeNm.toFixed(1)}`);
  parts.push(`HDG ${pad3(v.hdg)} · TRK ${pad3(v.trk)}`);
  parts.push(
    v.apAnnun === "AP off"
      ? fr
        ? "PA off"
        : "AP off"
      : v.apAnnun.replace(" · ", fr ? " · armé " : " · armed "),
  );
  parts.push(`${fr ? "graine" : "seed"} ${scene.seed}`);
  if (scene.refs?.airac) parts.push(`AIRAC ${scene.refs.airac}`);
  const ok = diffs.length === 0;
  const head = ok
    ? fr
      ? "Réappliquée comme capturée"
      : "Re-applied as captured"
    : fr
      ? `Réappliquée avec ${diffs.length} écart${diffs.length > 1 ? "s" : ""}`
      : `Re-applied with ${diffs.length} difference${diffs.length > 1 ? "s" : ""}`;
  return { ok, text: `${head}${fr ? " :" : ":"} ${parts.join(" · ")}` };
}

// ---------------------------------------------------------------- not captured
export const NOT_CAPTURED = {
  hold: "hold sequencing: restarts at the fix",
  apIntegrators:
    "autopilot capture integrators: re-engaged from the current attitude",
  susp: "GPS suspension (SUSP): sequencing resumes",
  switches:
    "switches (masters, magnetos, fuel selector, lights): flight-ready positions",
  approachHold: "a pilot hold at an approach fix",
  orphanWpt: "a waypoint inserted inside the approach",
} as const;
const NOT_CAPTURED_FR: Record<string, string> = {
  [NOT_CAPTURED.hold]: "séquencement de l'attente : reprend au repère",
  [NOT_CAPTURED.apIntegrators]:
    "intégrateurs de capture du pilote automatique : réengagé depuis l'assiette du moment",
  [NOT_CAPTURED.susp]: "suspension GPS (SUSP) : le séquencement reprend",
  [NOT_CAPTURED.switches]:
    "interrupteurs (batterie, magnétos, sélecteur carburant, feux) : positions de vol",
  [NOT_CAPTURED.approachHold]: "une attente pilote sur un repère d'approche",
  [NOT_CAPTURED.orphanWpt]: "un point inséré dans l'approche",
};
export function describeNotCaptured(text: string, lang: Lang = "en"): string {
  return lang === "fr" ? (NOT_CAPTURED_FR[text] ?? text) : text;
}

// ---------------------------------------------------------------- capture
/** FNV-1a of a procedure's definition: the "procedure changed since this step was made" banner compares it */
const procHashes = new WeakMap<object, string>();
export function procedureHash(id: string): string | undefined {
  const ap = findApproach(id);
  if (!ap) return undefined;
  const cached = procHashes.get(ap);
  if (cached) return cached;
  const json = JSON.stringify(ap);
  let h = 2166136261;
  for (let i = 0; i < json.length; i++)
    h = Math.imul(h ^ json.charCodeAt(i), 16777619) >>> 0;
  const hex = h.toString(16).padStart(8, "0");
  procHashes.set(ap, hex);
  return hex;
}

/** Capture the live Sim (raw aircraft state and avionics, declarative autopilot and plan) with its verify line. */
export function captureScene(sim: Sim, opts: CaptureOptions = {}): SimScene {
  const s = sim.ac.s;
  const fp = sim.fp;
  const av = cloneAvionics(sim.av);
  if (av.timerStart !== null) av.timerStart = av.timerStart - sim.time;
  const ap = apSnapshot(sim.ap);
  const notCaptured: string[] = [];
  if (fp.holdActive) notCaptured.push(NOT_CAPTURED.hold);
  if (
    sim.ap.engaged &&
    (["GPS", "VOR", "LOC", "BC"].includes(sim.ap.lat) ||
      ["ALT", "GS", "GP", "VS", "FLC"].includes(sim.ap.vert))
  )
    notCaptured.push(NOT_CAPTURED.apIntegrators);
  if (fp.out.suspended && !fp.holdActive) notCaptured.push(NOT_CAPTURED.susp);
  if (fp.wpts.some((w) => w.appr && w.hold?.kind === "user"))
    notCaptured.push(NOT_CAPTURED.approachHold);
  const firstAppr = fp.wpts.findIndex((w) => w.appr);
  if (firstAppr >= 0 && fp.wpts.slice(firstAppr).some((w) => !w.appr))
    notCaptured.push(NOT_CAPTURED.orphanWpt);
  const sw0 = defaultSwitches() as unknown as Record<string, unknown>;
  const sw = sim.sw as unknown as Record<string, unknown>;
  if (Object.keys(sw0).some((k) => k !== "mixture" && sw[k] !== sw0[k]))
    notCaptured.push(NOT_CAPTURED.switches);

  const approachId = fp.approachId;
  const plan: ScenePlan | undefined =
    fp.wpts.length || approachId
      ? {
          idents: planIdents(sim),
          ...(approachId
            ? {
                approach: {
                  id: approachId,
                  transition: transitionOf(sim),
                  mode: fp.vtf
                    ? ("vtf" as const)
                    : fp.approachActive
                      ? ("activate" as const)
                      : ("load" as const),
                },
              }
            : {}),
          activeLeg: fp.active,
        }
      : undefined;
  const failures: Partial<Failures> = {};
  for (const [k, v] of Object.entries(sim.failures))
    if (v) failures[k as keyof Failures] = true;
  const eq0 = fullEquipment();
  const equipment: Partial<Equipment> = {};
  for (const k of Object.keys(eq0) as (keyof Equipment)[])
    if (sim.equip[k] !== eq0[k]) equipment[k] = sim.equip[k];
  const world: World =
    opts.world ??
    (currentRegion()
      ? { kind: "real", region: "unknown" }
      : { kind: "training" });
  const procIds = approachId ? [approachId] : undefined;
  const procHash = approachId ? procedureHash(approachId) : undefined;
  const scene: SimScene = {
    v: SCENE_V,
    id: opts.id ?? newSceneId(),
    ...(opts.label ? { label: opts.label } : {}),
    world,
    cockpit: opts.cockpit ?? "g1000",
    ...(Object.keys(equipment).length ? { equipment } : {}),
    pose: { kind: "exact", ac: { ...s }, av },
    ap: {
      engaged: ap.engaged,
      fd: ap.fd,
      lat: ap.lat,
      vert: ap.vert,
      armed: ap.armed,
      hdg: ap.hdg,
      alt: ap.alt,
      vs: ap.vs,
      ias: ap.ias,
    },
    ...(plan ? { plan } : {}),
    controls: {
      throttle: sim.controls.throttle,
      mixture: sim.sw.mixture,
      trim: sim.controls.trim,
      flaps: sim.controls.flaps,
    },
    weather: JSON.parse(JSON.stringify(sim.weather)) as Weather,
    seed: opts.seed ?? (sim.rng.raw || 1),
    ...(Object.keys(failures).length ? { failures } : {}),
    ...(opts.covers?.length ? { covers: [...opts.covers] } : {}),
    ...(opts.timeOfDay ? { timeOfDay: opts.timeOfDay } : {}),
    refs: {
      ...((opts.airac ?? (world.kind === "real" ? world.airac : undefined))
        ? { airac: opts.airac ?? (world as { airac?: string }).airac }
        : {}),
      ...(procIds ? { procIds } : {}),
      ...(procHash ? { procHash } : {}),
    },
    verify: verifyOf(sim),
    ...(notCaptured.length ? { notCaptured } : {}),
    captured: {
      at: opts.at ?? new Date().toISOString(),
      from: opts.from ?? "cockpit",
      ...(opts.thumb ? { thumb: opts.thumb } : {}),
      ...(opts.still ? { still: opts.still } : {}),
    },
  };
  if (scene.refs && !Object.keys(scene.refs).length) delete scene.refs;
  return scene;
}

// ---------------------------------------------------------------- apply
/** where a fields pose puts the aircraft (null: the fix or runway is not in the loaded nav data) */
export function resolveFieldsPos(f: SceneFields): LatLon | null {
  const p = f.pos;
  if ("fix" in p) {
    const fx = findFix(p.fix);
    return fx ? destination(fx, p.radial, p.distNm) : null;
  }
  if ("runway" in p) {
    try {
      const r = runway(p.runway.icao, p.runway.id);
      const back = bearingDeg(r.end, r.threshold);
      return destination(r.threshold, back + (p.offsetDeg ?? 0), p.distNm);
    } catch {
      return null;
    }
  }
  return Number.isFinite(p.lat) && Number.isFinite(p.lon)
    ? { lat: p.lat, lon: p.lon }
    : null;
}

function freqOf(x: number | string | undefined): number | undefined {
  if (x === undefined) return undefined;
  if (typeof x === "number") return x;
  return NAVAIDS.find((n) => n.ident === x.toUpperCase())?.freq;
}

/** `restartFrom`: a scene captured inside a hold restarts it at the fix: Direct-To the holding fix from the
 *  aircraft's position (the box then computes the entry again when it reaches the fix) */
function applyPlan(sim: Sim, plan: ScenePlan | undefined, diffs: SceneDiff[], restartFrom: LatLon | null) {
  if (!plan) return;
  const fp = sim.fp;
  const parsed = parseIdents(plan.idents ?? []);
  if (parsed.unknown.length)
    diffs.push({
      field: "plan",
      expected: parsed.unknown.join(" "),
      got: null,
      text: {
        en: `Not in the loaded nav data: ${parsed.unknown.join(", ")}`,
        fr: `Absent des données de navigation chargées : ${parsed.unknown.join(", ")}`,
      },
    });
  if (parsed.wpts.length) fp.setEnroute(parsed.wpts);
  if (plan.approach) {
    if (findApproach(plan.approach.id))
      sim.loadApproach(
        plan.approach.id,
        plan.approach.transition,
        plan.approach.mode,
      );
    else
      diffs.push({
        field: "approach",
        expected: plan.approach.id,
        got: null,
        text: {
          en: `Approach ${plan.approach.id} is not in the loaded nav data`,
          fr: `L'approche ${plan.approach.id} est absente des données chargées`,
        },
      });
  }
  const i = plan.activeLeg;
  if (i !== undefined && i >= 0 && i < fp.wpts.length) {
    if (fp.wpts[i].appr === "missed" && !fp.missedActive) fp.activateMissed();
    if (i !== fp.active) {
      if (i === 0) fp.active = 0;
      else fp.activateLeg(i);
      if (fp.wpts[i].appr && fp.approachId) fp.approachActive = true;
    }
  }
  if (parsed.directFrom) fp.directFrom = parsed.directFrom;
  if (restartFrom && fp.wpts[fp.active]?.hold) {
    fp.holdActive = false;
    fp.directFrom = { lat: restartFrom.lat, lon: restartFrom.lon };
  }
  if (parsed.obs !== null) fp.setObs(true, parsed.obs);
}

/** Set the autopilot's modes and bugs through its public API, bumpless (the flight director starts from the current
 *  attitude). Used by applyScene, poseScene and clip take-over. */
export function applyApModes(sim: Sim, ap: SceneAp | undefined) {
  if (!ap) return;
  const A = sim.ap;
  const d = sim.ac.data;
  if (ap.hdg !== undefined) A.hdgBug = ap.hdg;
  if (ap.alt !== undefined) A.altSel = ap.alt;
  if (ap.vs !== undefined) A.vsSel = ap.vs;
  if (ap.ias !== undefined) A.iasSel = ap.ias;
  if (!ap.engaged && !ap.fd) {
    if (A.ap) A.disconnect();
    if (A.fd) A.toggleFd(d);
    return;
  }
  // bumpless: the flight director starts from the current attitude, then the modes are set
  if (!A.fd) A.toggleFd(d);
  if (ap.engaged && !A.ap) A.toggleAp(d);
  if (!ap.engaged && A.ap) A.disconnect();
  if (ap.lat && LAT_MODES.includes(ap.lat)) A.lat = ap.lat as LatMode;
  const vert =
    ap.vert && VERT_MODES.includes(ap.vert) ? (ap.vert as VertMode) : "PIT";
  if (vert === "ALT") {
    A.pressAlt(d);
    if (Math.abs(A.altSel - d.altFt) < 60) A.altHold = A.altSel;
  } else if (vert === "VS") {
    A.vert = "VS";
    if (ap.vs !== undefined) A.vsSel = ap.vs;
  } else if (vert === "FLC") {
    A.vert = "FLC";
    if (ap.ias !== undefined) A.iasSel = ap.ias;
  } else A.vert = vert;
  const armed = ap.armed ?? [];
  const latArmed = armed.find((x) => LAT_MODES.includes(x));
  A.latArmed = latArmed ? (latArmed as LatMode) : null;
  A.vertArmed = {
    alts: armed.includes("ALTS"),
    gs: armed.includes("GS"),
    gp: armed.includes("GP"),
  };
  A.apprMode = armed.includes("APR");
}

function applyFieldsPose(sim: Sim, f: SceneFields) {
  const s = sim.ac.s;
  const r = f.radios ?? {};
  if (r.baro !== undefined) sim.av.baro = r.baro;
  s.altFt = f.altFt - (sim.av.baro - sim.weather.qnh) * 1000;
  s.psi = norm360(f.hdg) * DEG;
  const bank = f.bank ?? 0;
  const air = f.iasKt >= 25;
  s.onGround = !air && s.altFt <= groundElevation(s) + 5;
  s.tas = air ? tasForIas(f.iasKt, s.altFt, sim.weather, bank) : f.iasKt * KT;
  s.phi = bank * DEG;
  s.gamma =
    air && f.vsFpm
      ? Math.asin(clamp((f.vsFpm * FT) / 60 / s.tas, -0.5, 0.5))
      : 0;
  // without a pitch, the attitude flies the requested path at the trimmed angle of attack (≈ 2° in cruise)
  s.theta =
    f.pitch !== undefined ? f.pitch * DEG : s.gamma + (air ? 2 * DEG : 0);
  s.q = 0;
  s.p = 0;
  s.beta = 0;
  s.crashed = null;
  const n1 = freqOf(r.nav1);
  if (n1 !== undefined) sim.av.nav1.active = n1;
  const n2 = freqOf(r.nav2);
  if (n2 !== undefined) sim.av.nav2.active = n2;
  if (r.adf !== undefined) sim.av.adf.active = r.adf;
  if (r.cdi) sim.setCdi(r.cdi);
  if (r.obs1 !== undefined) sim.av.obs1 = norm360(r.obs1);
  if (r.obs2 !== undefined) sim.av.obs2 = norm360(r.obs2);
  if (r.brg1) sim.av.bearing1 = r.brg1;
  if (r.brg2) sim.av.bearing2 = r.brg2;
  if (r.minimums !== undefined) sim.av.minimums = r.minimums;
}

/**
 * Apply a scene to a Sim in the load-bearing order of SPEC §9.3 and return the differences with its verify line
 * (empty: the instruments show what was captured).
 *  1 startAt (rebuilds the Autopilot, the FlightPlan, failures, equipment, weather; reseeds; restarts the recorder)
 *  2 cockpit, equipment and controls   3 plan: idents, loadApproach, activateLeg   4 the pose (raw ac.s and av)
 *  5 re-derive TRK / GS / turn rate    6 autopilot modes and bugs (public API)     7 weather and failures
 *  8 seed LAST                         9 updateAvionics(0)                         10 compare with verify
 */
export function applyScene(sim: Sim, scene: SimScene): SceneDiff[] {
  const diffs: SceneDiff[] = [];
  const exact = scene.pose.kind === "exact" ? scene.pose : null;
  const fields = scene.pose.kind === "fields" ? scene.pose : null;
  const weather = JSON.parse(
    JSON.stringify(scene.weather ?? {}),
  ) as Partial<Weather>;
  // 1
  let start: {
    pos: LatLon;
    altFt: number;
    hdg: number;
    iasKt: number;
    onGround: boolean;
  };
  if (exact) {
    const a = exact.ac;
    start = {
      pos: { lat: a.lat, lon: a.lon },
      altFt: a.altFt,
      hdg: norm360(a.psi / DEG),
      iasKt: a.onGround ? 0 : a.tas / KT,
      onGround: a.onGround,
    };
  } else {
    const pos = resolveFieldsPos(fields!);
    if (!pos)
      throw new SceneError(
        "position",
        "The scene's position is not in the loaded nav data",
      );
    start = {
      pos,
      altFt: fields!.altFt,
      hdg: fields!.hdg,
      iasKt: fields!.iasKt,
      onGround: fields!.iasKt < 25 && fields!.altFt <= groundElevation(pos) + 5,
    };
  }
  startAt(sim, { ...start, weather });
  // 2
  sim.cockpitEyeFt = scene.cockpit === "airliner" ? 18 : 7;
  sim.equip = { ...fullEquipment(), ...(scene.equipment ?? {}) };
  if (scene.controls) {
    const c = scene.controls;
    sim.controls.throttle = clamp(c.throttle, 0, 1);
    sim.controls.trim = clamp(c.trim, -1, 1);
    sim.controls.flaps = clamp(Math.round(c.flaps), 0, 3);
    if (c.mixture !== undefined) sim.sw.mixture = clamp(c.mixture, 0, 1);
  } else if (fields && !start.onGround && fields.iasKt >= 90) {
    // a scene typed as numbers: trim for its speed (the load trim holds about 100 KIAS; ~7.5 kt per 0.1 of
    // trim), so the stage does not zoom up or dive the moment it goes live
    sim.controls.trim = clamp(-0.3 - (fields.iasKt - 100) / 75, -0.8, 0);
    // and the power for level flight there (measured on the C172 model: 90 kt needs 0.48 at 3,000 ft and 0.72 at
    // 12,000 ft; 105 kt needs 0.68 and 0.88+), so a stage that holds the speed for the student starts level
    if (!fields.vsFpm) {
      const v = clamp(fields.iasKt, 80, 110) - 90;
      const thr = 0.4 + v * 0.0107 + (0.027 + v * 0.00087) * (Math.max(0, fields.altFt) / 1000);
      sim.controls.throttle = clamp(thr, 0.3, 1);
    }
  }
  // 3
  applyPlan(sim, scene.plan, diffs, scene.notCaptured?.includes(NOT_CAPTURED.hold) ? start.pos : null);
  sim.updateAvionics(0); // settle the sequencing side effects (missed-approach CDI switch) before the exact avionics
  // 4
  if (exact) {
    Object.assign(sim.ac.s, { ...exact.ac });
    Object.assign(sim.av, cloneAvionics(exact.av));
  } else applyFieldsPose(sim, fields!);
  // 5
  rederive(sim);
  // 6
  applyApModes(sim, scene.ap);
  // 7
  Object.assign(sim.weather, weather);
  for (const [k, on] of Object.entries(scene.failures ?? {}))
    if (on && k in FAILURE_LABELS) sim.setFailure(k as keyof Failures, true);
  // 8
  sim.seed(scene.seed);
  // 9
  sim.updateAvionics(0);
  // the pilot's CDI choice wins over the GPS → LOC auto-switch (in the live sim it had already happened)
  if (exact && sim.av.cdi !== exact.av.cdi && sim.equip.gps) {
    sim.av.cdi = exact.av.cdi;
    sim.updateAvionics(0);
  }
  sim.rec.resync(sim);
  // 10
  if (scene.verify) diffs.push(...compareVerify(scene.verify, verifyOf(sim)));
  return diffs;
}

/**
 * Pose a running Sim at an exact state without reloading it (no startAt: the flight record, the plan and the
 * random stream are kept): the rewind ring's "Back 10 s", clip keyframes, take-over. `timeOrigin` is the sim time
 * the pose's clock origin maps to (default: now), for the chronometer.
 */
export function poseExact(
  sim: Sim,
  ac: AircraftState,
  av: Avionics,
  timeOrigin = sim.time,
): void {
  Object.assign(sim.ac.s, { ...ac });
  const a = cloneAvionics(av);
  if (a.timerStart !== null) a.timerStart += timeOrigin;
  Object.assign(sim.av, a);
  rederive(sim);
  sim.updateAvionics(0);
}

/** poseExact for a whole scene on a running Sim: pose, autopilot, failures and plan sequencing (when the same
 *  plan is loaded). Returns false for a fields pose (use applyScene). */
export function poseScene(sim: Sim, scene: SimScene): boolean {
  if (scene.pose.kind !== "exact") return false;
  const p = scene.plan;
  const fp = sim.fp;
  if (p) {
    const same =
      (p.approach?.id ?? null) === fp.approachId &&
      JSON.stringify(p.idents ?? []) === JSON.stringify(planIdents(sim));
    if (!same) {
      // the plan changed since (an approach loaded, a Direct-To): rebuild it quietly, the record keeps the pilot's edits
      const onEdit = fp.onEdit;
      fp.onEdit = () => undefined;
      applyPlan(sim, p, [], null);
      fp.onEdit = onEdit;
    } else if (
      p.activeLeg !== undefined &&
      p.activeLeg < fp.wpts.length &&
      p.activeLeg !== fp.active
    ) {
      if (p.activeLeg === 0) fp.active = 0;
      else fp.activateLeg(p.activeLeg);
      const d = parseIdents(p.idents ?? []).directFrom;
      if (d) fp.directFrom = d;
    }
    sim.updateAvionics(0);
  }
  Object.assign(sim.ac.s, { ...scene.pose.ac });
  const a = cloneAvionics(scene.pose.av);
  if (a.timerStart !== null) a.timerStart += sim.time;
  Object.assign(sim.av, a);
  if (scene.controls) {
    sim.controls.throttle = scene.controls.throttle;
    sim.controls.trim = scene.controls.trim;
    sim.controls.flaps = scene.controls.flaps;
    if (scene.controls.mixture !== undefined)
      sim.sw.mixture = scene.controls.mixture;
  }
  rederive(sim);
  applyApModes(sim, scene.ap);
  const f = sim.failures as unknown as Record<string, boolean>;
  for (const k of Object.keys(f))
    f[k] = !!(scene.failures as Record<string, boolean> | undefined)?.[k];
  sim.updateAvionics(0);
  if (sim.av.cdi !== scene.pose.av.cdi && sim.equip.gps) {
    sim.av.cdi = scene.pose.av.cdi;
    sim.updateAvionics(0);
  }
  return true;
}

// ---------------------------------------------------------------- fields
export interface FieldsOptions {
  id?: string;
  label?: string;
  cockpit?: Cockpit;
  world?: World;
  weather?: Partial<Weather>;
  seed?: number;
  plan?: ScenePlan;
  ap?: SceneAp;
  equipment?: Partial<Equipment>;
  failures?: Partial<Failures>;
  controls?: SimScene["controls"];
  from?: "fields" | "calc";
}

/** "Edit as numbers": a scene from fields (also the stage hint of a calc generator) */
export function sceneFromFields(
  fields: SceneFields,
  o: FieldsOptions = {},
): SimScene {
  return {
    v: SCENE_V,
    id: o.id ?? newSceneId(),
    ...(o.label ? { label: o.label } : {}),
    world: o.world ?? { kind: "training" },
    cockpit: o.cockpit ?? "g1000",
    ...(o.equipment ? { equipment: { ...o.equipment } } : {}),
    pose: JSON.parse(
      JSON.stringify({ ...fields, kind: "fields" }),
    ) as SceneFields,
    ...(o.ap ? { ap: { ...o.ap } } : {}),
    ...(o.plan
      ? { plan: JSON.parse(JSON.stringify(o.plan)) as ScenePlan }
      : {}),
    ...(o.controls ? { controls: { ...o.controls } } : {}),
    weather: { ...(o.weather ?? {}) },
    seed: o.seed ?? 1,
    ...(o.failures ? { failures: { ...o.failures } } : {}),
    captured: { at: new Date().toISOString(), from: o.from ?? "fields" },
  };
}

/** the fields of a live Sim (the editor's "Edit as numbers" starts from what is on screen) */
export function fieldsOf(sim: Sim): SceneFields {
  const s = sim.ac.s;
  const d = sim.ac.data;
  return {
    kind: "fields",
    pos: { lat: round(s.lat, 7), lon: round(s.lon, 7) },
    altFt: Math.round(sim.baroAlt()),
    hdg: Math.round(norm360(d.hdgTrue)),
    iasKt: Math.round(d.iasKt),
    pitch: round(d.pitchDeg, 1),
    bank: round(d.rollDeg, 1),
    vsFpm: Math.round(d.vsFpm / 10) * 10,
    radios: {
      nav1: sim.av.nav1.active,
      nav2: sim.av.nav2.active,
      adf: sim.av.adf.active,
      obs1: Math.round(sim.av.obs1),
      obs2: Math.round(sim.av.obs2),
      cdi: sim.av.cdi,
      brg1: sim.av.bearing1,
      brg2: sim.av.bearing2,
      baro: sim.av.baro,
      minimums: sim.av.minimums,
    },
  };
}

// ---------------------------------------------------------------- stage pose (presenter → projector mirroring)
export function stagePoseOf(sim: Sim): StagePose {
  const s = sim.ac.s;
  const d = sim.ac.data;
  return {
    lat: s.lat,
    lon: s.lon,
    altFt: s.altFt,
    hdg: d.hdgTrue,
    pitch: d.pitchDeg,
    bank: d.rollDeg,
    ias: d.iasKt,
    vs: d.vsFpm,
    trk: d.trackSmooth,
    gs: d.gsSmooth,
    turnRate: d.turnRateDps,
  };
}

/** Mirror a presenter's pose on another Sim (the projector): the display values are the presenter's, exactly. */
export function applyStagePose(
  sim: Sim,
  p: StagePose,
  av?: Partial<Avionics>,
): void {
  const s = sim.ac.s;
  s.lat = p.lat;
  s.lon = p.lon;
  s.altFt = p.altFt;
  s.psi = norm360(p.hdg) * DEG;
  s.theta = p.pitch * DEG;
  s.phi = p.bank * DEG;
  s.tas = tasForIas(p.ias, p.altFt, sim.weather, p.bank);
  s.gamma = Math.asin(clamp((p.vs * FT) / 60 / Math.max(10, s.tas), -0.5, 0.5));
  s.q = 0;
  s.p = 0;
  s.beta = 0;
  s.onGround = p.ias < 25 && p.altFt <= groundElevation(s) + 5;
  if (av)
    Object.assign(sim.av, JSON.parse(JSON.stringify(av)) as Partial<Avionics>);
  rederive(sim);
  const d = sim.ac.data;
  Object.assign(d, {
    iasKt: p.ias,
    vsFpm: p.vs,
    trackSmooth: p.trk,
    trackTrue: p.trk,
    gsSmooth: p.gs,
    gsKt: p.gs,
    turnRateDps: p.turnRate,
    hdgTrue: p.hdg,
    pitchDeg: p.pitch,
    rollDeg: p.bank,
  });
  sim.updateAvionics(0);
}

// ---------------------------------------------------------------- validate
export interface SceneIssue {
  level: "error" | "warning";
  code: string;
  text: L10n;
}
export interface SceneValidation {
  ok: boolean;
  issues: SceneIssue[];
}

/** Check a scene against the loaded nav data (fixes, approaches, region, AIRAC) before applying or saving it. */
export function validateScene(
  scene: unknown,
  opts: { airac?: string; region?: string | null } = {},
): SceneValidation {
  const issues: SceneIssue[] = [];
  const err = (code: string, en: string, fr: string) =>
    issues.push({ level: "error", code, text: { en, fr } });
  const warn = (code: string, en: string, fr: string) =>
    issues.push({ level: "warning", code, text: { en, fr } });
  const sc = scene as SimScene;
  if (!sc || typeof sc !== "object") {
    err("format", "Not a scene", "Ce n'est pas une scène");
    return { ok: false, issues };
  }
  if (sc.v !== SCENE_V)
    err(
      "version",
      `Scene version ${String(sc.v)} is not supported`,
      `La version de scène ${String(sc.v)} n'est pas prise en charge`,
    );
  if (!sc.pose || (sc.pose.kind !== "exact" && sc.pose.kind !== "fields")) {
    err("format", "The scene has no position", "La scène n'a pas de position");
    return { ok: false, issues };
  }
  if (!Number.isFinite(sc.seed))
    err("seed", "The scene has no seed", "La scène n'a pas de graine");
  // region
  const region = currentRegion();
  const world = sc.world ?? { kind: "training" };
  if (world.kind === "real" && !region)
    err(
      "region",
      `This scene is in the ${world.region} region: load it first`,
      `Cette scène est dans la région ${world.region} : chargez-la d'abord`,
    );
  else if (world.kind === "training" && region)
    err(
      "region",
      "This scene is in the training region: leave the real world first",
      "Cette scène est dans la région d'entraînement : quittez d'abord le monde réel",
    );
  else if (world.kind === "real" && opts.region && world.region !== opts.region)
    err(
      "region",
      `This scene is in ${world.region}, the loaded region is ${opts.region}`,
      `Cette scène est dans ${world.region}, la région chargée est ${opts.region}`,
    );
  // pose
  if (sc.pose.kind === "exact") {
    const a = sc.pose.ac;
    const nums = [
      a?.lat,
      a?.lon,
      a?.altFt,
      a?.tas,
      a?.psi,
      a?.theta,
      a?.phi,
      a?.gamma,
    ];
    if (!a || nums.some((x) => !Number.isFinite(x)))
      err(
        "pose",
        "The aircraft state is incomplete",
        "L'état de l'avion est incomplet",
      );
    else {
      if (a.altFt < -1500 || a.altFt > 45000)
        err(
          "pose",
          `Altitude ${Math.round(a.altFt)} ft is out of range`,
          `L'altitude ${Math.round(a.altFt)} ft est hors limites`,
        );
      if (a.crashed)
        warn(
          "crashed",
          "The scene was captured after a crash",
          "La scène a été capturée après un crash",
        );
    }
    if (!sc.pose.av || !sc.pose.av.nav1)
      err(
        "pose",
        "The avionics state is incomplete",
        "L'état de l'avionique est incomplet",
      );
  } else {
    const f = sc.pose;
    if (!resolveFieldsPos(f)) {
      const p = f.pos as {
        fix?: string;
        runway?: { icao: string; id: string };
      };
      const what =
        p.fix ?? (p.runway ? `${p.runway.icao} ${p.runway.id}` : "lat/lon");
      err(
        "fix",
        `Unknown position ${what} in the loaded nav data`,
        `Position ${what} inconnue dans les données chargées`,
      );
    }
    if (!Number.isFinite(f.altFt) || f.altFt < -1500 || f.altFt > 45000)
      err("pose", "Altitude out of range", "Altitude hors limites");
    if (!Number.isFinite(f.iasKt) || f.iasKt < 0 || f.iasKt > 300)
      err("pose", "Airspeed out of range", "Vitesse hors limites");
    if (!Number.isFinite(f.hdg)) err("pose", "Heading missing", "Cap manquant");
    for (const k of ["nav1", "nav2"] as const) {
      const v = f.radios?.[k];
      if (typeof v === "string" && freqOf(v) === undefined)
        err("navaid", `Unknown navaid ${v}`, `Balise ${v} inconnue`);
    }
  }
  // plan
  if (sc.plan) {
    const parsed = parseIdents(sc.plan.idents ?? []);
    for (const u of parsed.unknown)
      err(
        "fix",
        `Unknown fix ${u} in the loaded nav data`,
        `Repère ${u} inconnu dans les données chargées`,
      );
    const ap = sc.plan.approach;
    if (ap) {
      const a = findApproach(ap.id);
      if (!a)
        err(
          "approach",
          `Unknown approach ${ap.id}`,
          `Approche ${ap.id} inconnue`,
        );
      else {
        if (
          ap.transition &&
          !a.transitions.some((t) => t.name === ap.transition)
        )
          err(
            "approach",
            `Approach ${a.name}: no transition ${ap.transition}`,
            `Approche ${a.name} : pas de transition ${ap.transition}`,
          );
        const h = procedureHash(ap.id);
        if (sc.refs?.procHash && h && sc.refs.procHash !== h)
          warn(
            "procChanged",
            `${a.airport} ${a.name} changed since this scene was captured`,
            `${a.airport} ${a.name} a changé depuis la capture de cette scène`,
          );
      }
    }
  }
  if (sc.refs?.airac && opts.airac && sc.refs.airac !== opts.airac)
    warn(
      "airac",
      `Captured with AIRAC ${sc.refs.airac}, the loaded data is ${opts.airac}`,
      `Capturée avec l'AIRAC ${sc.refs.airac}, les données chargées sont ${opts.airac}`,
    );
  for (const k of Object.keys(sc.failures ?? {}))
    if (!(k in FAILURE_LABELS))
      warn(
        "failure",
        `Unknown failure ${k} (ignored)`,
        `Panne ${k} inconnue (ignorée)`,
      );
  const eq = fullEquipment() as unknown as Record<string, boolean>;
  for (const k of Object.keys(sc.equipment ?? {}))
    if (!(k in eq))
      warn(
        "equipment",
        `Unknown equipment ${k} (ignored)`,
        `Équipement ${k} inconnu (ignoré)`,
      );
  if (JSON.stringify(sc).length > 16000)
    warn(
      "size",
      "This scene is unusually large",
      "Cette scène est anormalement volumineuse",
    );
  return { ok: !issues.some((i) => i.level === "error"), issues };
}

// ---------------------------------------------------------------- ?scene= links
const MAX_CODE = 64 * 1024;
const MAX_JSON = 256 * 1024;

/** numbers to 9 significant digits (1 cm in latitude), undefined dropped: a smaller link that still round-trips
 *  position within 1 m and altitude within 1 ft */
export function compactScene(scene: SimScene): SimScene {
  return JSON.parse(
    JSON.stringify(scene, (_k, v: unknown) =>
      typeof v === "number" && Number.isFinite(v) && !Number.isInteger(v)
        ? Number(v.toPrecision(9))
        : v,
    ),
  ) as SimScene;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s: string): Uint8Array {
  const b = atob(
    s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4),
  );
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
async function pump(
  bytes: Uint8Array,
  ts: {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<BufferSource>;
  },
  limit: number,
): Promise<Uint8Array> {
  const w = ts.writable.getWriter();
  void w
    .write(bytes as Uint8Array<ArrayBuffer>)
    .then(() => w.close())
    .catch(() => undefined);
  const r = ts.readable.getReader();
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    n += value.length;
    if (n > limit) {
      void r.cancel();
      throw new SceneError("size", "The scene link is too large");
    }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** `S1.<base64url(deflate-raw(JSON))>` (≈ 1 KB for a captured scene; QR-able). Without CompressionStream (Safari
 *  before 16.4) the uncompressed `S0.<base64url(JSON)>` form, which decodeScene also reads. */
export async function encodeScene(scene: SimScene): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(compactScene(scene)));
  if (typeof CompressionStream === "undefined") return "S0." + b64url(json);
  const z = await pump(json, new CompressionStream("deflate-raw"), MAX_JSON);
  return "S1." + b64url(z);
}

/** Read a scene code (`S1.…`, `S0.…`, or a whole link carrying `?scene=`). Throws SceneError. */
export async function decodeScene(input: string): Promise<SimScene> {
  let code = input.trim();
  const m = /[?&#]scene=([^&#]+)/.exec(code);
  if (m) code = decodeURIComponent(m[1]);
  if (code.length > MAX_CODE)
    throw new SceneError("size", "The scene link is too large");
  const dot = code.indexOf(".");
  const tag = code.slice(0, dot);
  if (dot < 0 || (tag !== "S1" && tag !== "S0"))
    throw new SceneError("format", "Not a scene link");
  let bytes: Uint8Array;
  try {
    bytes = unb64url(code.slice(dot + 1));
  } catch {
    throw new SceneError("corrupt", "The scene link is damaged");
  }
  if (tag === "S1") {
    if (typeof DecompressionStream === "undefined")
      throw new SceneError(
        "format",
        "This browser cannot read compressed scene links",
      );
    try {
      bytes = await pump(
        bytes,
        new DecompressionStream("deflate-raw"),
        MAX_JSON,
      );
    } catch (e) {
      if (e instanceof SceneError) throw e;
      throw new SceneError("corrupt", "The scene link is damaged");
    }
  }
  let sc: SimScene;
  try {
    sc = JSON.parse(new TextDecoder().decode(bytes)) as SimScene;
  } catch {
    throw new SceneError("corrupt", "The scene link is damaged");
  }
  if (!sc || typeof sc !== "object" || !sc.pose)
    throw new SceneError("format", "Not a scene");
  if (sc.v !== SCENE_V)
    throw new SceneError(
      "version",
      `Scene version ${String(sc.v)} is not supported`,
    );
  return sc;
}

/** `index.html?scene=S1.…` */
export async function sceneLink(
  scene: SimScene,
  base = "index.html",
): Promise<string> {
  return `${base}${base.includes("?") ? "&" : "?"}scene=${await encodeScene(scene)}`;
}

/** the distance (m) between two scenes' positions, for diffs and tests */
export function sceneDistanceM(a: LatLon, b: LatLon): number {
  return distanceNm(a, b) * 1852;
}

// ---------------------------------------------------------------- the editor's Scene card
export interface SceneSummaryRow {
  key: "from" | "position" | "flight" | "hdgTrk" | "radios";
  label: string;
  value: string;
}

const MINUS = "−";
function thousands(n: number, lang: Lang): string {
  const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, lang === "fr" ? " " : ",");
  return n < 0 ? MINUS + s : s;
}

/**
 * The rows of the editor's Scene card (mockup final/editor.png), read from the Sim the scene was applied to:
 * From "Cockpit · 14:32", Position "ILS 27 PARD · 5.0 NM · on LOC", Flight "2,040 ft · 90 kt · −500 fpm",
 * HDG · TRK "273° · 270° · wind 300/12", Radios "NAV1 110.30 IPRD · CRS 270".
 */
export function sceneSummary(sim: Sim, scene: SimScene, lang: Lang = "en"): SceneSummaryRow[] {
  const fr = lang === "fr";
  const d = sim.ac.data;
  const s = sim.ac.s;
  const from = scene.captured?.from ?? (scene.pose.kind === "exact" ? "cockpit" : "fields");
  const fromName: Record<string, [string, string]> = { cockpit: ["Cockpit", "Cockpit"], fields: ["Numbers", "Valeurs"], rewind: ["Rewind", "Retour arrière"], calc: ["Calculation", "Calcul"] };
  let when = "";
  if (scene.captured?.at) {
    const t = new Date(scene.captured.at);
    if (!Number.isNaN(t.getTime())) when = ` · ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  }
  // position: on an approach, the distance to the threshold; otherwise radial and distance from the nearest navaid
  let position = "";
  const ap = sim.fp.approach;
  const nav = sim.navInputs();
  if (ap) {
    let dist: number | null = null;
    try {
      dist = distanceNm(s, runway(ap.airport, ap.runway).threshold);
    } catch {
      dist = null;
    }
    const name = `${ap.type === "LOCBC" ? "LOC BC" : ap.type} ${ap.runway} ${ap.airport}`;
    position = dist === null ? name : `${name} · ${dist.toFixed(1)} NM`;
    const dev = nav.cdi === "GPS" ? (nav.gps.valid ? nav.gps.dev : null) : nav.nav.valid ? nav.nav.dev : null;
    const what = nav.cdi === "GPS" ? "GPS" : nav.nav.isLoc ? "LOC" : "VOR";
    if (dev !== null && Math.abs(dev) < 0.25) position += fr ? ` · sur le ${what}` : ` · on ${what}`;
  } else {
    let best: { ident: string; lat: number; lon: number } | null = null;
    let bd = Infinity;
    for (const n of NAVAIDS) {
      const x = distanceNm(s, n);
      if (x < bd) {
        bd = x;
        best = n;
      }
    }
    position = best ? `${best.ident} R-${pad3(bearingDeg(best, s))} · ${bd.toFixed(1)} NM` : `${round(s.lat, 4)}, ${round(s.lon, 4)}`;
  }
  const vs = Math.round(d.vsFpm / 50) * 50;
  const flight = `${thousands(Math.round(sim.indicatedAlt() / 10) * 10, lang)} ft · ${Math.round(d.iasKt)} kt · ${vs === 0 ? "0" : thousands(vs, lang)} fpm`;
  const wdir = Math.round(d.windDir / 10) * 10 || 360;
  const wind = d.windKt < 1 ? (fr ? "vent calme" : "wind calm") : `${fr ? "vent" : "wind"} ${String(wdir).padStart(3, "0")}/${Math.round(d.windKt)}`;
  const hdgTrk = `${pad3(d.hdgTrue)}° · ${pad3(d.trackSmooth)}° · ${wind}`;
  const src = sim.av.cdi;
  const radio = src === "NAV2" ? sim.av.nav2 : sim.av.nav1;
  const out = src === "NAV2" ? sim.nav2 : sim.nav1;
  const radios =
    src === "GPS"
      ? `GPS${sim.fp.out.valid && sim.fp.out.toIdent ? ` → ${sim.fp.out.toIdent}` : ""} · DTK ${pad3(sim.fp.out.dtk)} · NAV1 ${sim.av.nav1.active.toFixed(2)}`
      : `${src} ${radio.active.toFixed(2)}${out.valid && out.ident ? ` ${out.ident}` : ""} · CRS ${pad3(sim.course())}`;
  return [
    { key: "from", label: fr ? "Origine" : "From", value: `${fromName[from]?.[fr ? 1 : 0] ?? from}${when}` },
    { key: "position", label: fr ? "Position" : "Position", value: position },
    { key: "flight", label: fr ? "Vol" : "Flight", value: flight },
    { key: "hdgTrk", label: fr ? "CAP · ROUTE" : "HDG · TRK", value: hdgTrk },
    { key: "radios", label: fr ? "Radios" : "Radios", value: radios },
  ];
}
