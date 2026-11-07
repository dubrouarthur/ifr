// Instructor companion: the shapes exchanged between the simulator (host) and the phone / tablet console
// (remote.html). Pure module: no simulator or DOM imports, so the console bundle stays small and both sides
// validate with the same code.
import type { Failures } from "../sim/sim";
import { FAILURE_GROUPS, FAILURE_LABELS_EN, FAILURE_LABELS_FR, type FailureKey as SysFailureKey } from "../sim/systemsTypes";
import type { DrillMode, Lang } from "../train/procedureTypes";

/** every failure the simulator can inject (src/sim/systemsTypes.ts) */
export type FailureKey = SysFailureKey;

/** procedures mode: a running (or finished) emergency procedure as the instructor sees it, live */
export interface RemoteProcState {
  procedureId: string;
  title: string;
  failure: FailureKey;
  mode: DrillMode;
  /** s since the failure */
  elapsedS: number;
  checklistOpen: boolean;
  finished: boolean;
  /** language of the procedure text */
  lang: Lang;
  items: {
    id: string;
    text: string;
    memory: boolean;
    done: boolean;
    late: boolean;
    /** s left before the item is late (null: no limit / done) */
    due: number | null;
    /** a callout: confirmed by a Done button or by the instructor */
    manual: boolean;
    optional: boolean;
    /** already in the required position at the failure */
    ready: boolean;
    /** s after the failure it was done */
    atS: number | null;
  }[];
}
/** a procedure the instructor can name as expected when firing a failure */
export interface RemoteProcChoice {
  id: string;
  title: string;
  failures: FailureKey[];
  lang: Lang;
  club: boolean;
}
export type RepositionKind = "iaf" | "if" | "final10" | "final5" | "runway";

/** what the console shows: sent by the host at 4 Hz */
export interface RemoteSnapshot {
  /** simulation time (s) */
  t: number;
  /** real-world position when a real region is loaded (toReal), training-area coordinates otherwise */
  lat: number;
  lon: number;
  /** indicated altitude (ft) */
  altFt: number;
  iasKt: number;
  gsKt: number;
  /** heading and track as the student's HSI shows them (deg) */
  hdg: number;
  trk: number;
  vsFpm: number;
  pitch: number;
  roll: number;
  onGround?: boolean;
  crashed?: string | boolean | null;
  /** flight phase (recorder) */
  phase: string;
  lesson: {
    id: string;
    title: string;
    step: string;
    stepIdx?: number;
    steps?: number;
  } | null;
  /** what is being flown: lesson title, scenario name or 'Free flight' */
  flight?: string;
  /** active waypoint */
  wpt: { ident: string; distNm: number } | null;
  approach: {
    id: string;
    name: string;
    airport: string;
    active?: boolean;
  } | null;
  failures: Failures;
  /** procedures mode (protocol 2): the procedures graded in this flight, live */
  procedures?: RemoteProcState[];
  /** the failure drill being flown: its mode and the failures waiting for the instructor */
  drill?: {
    mode: DrillMode;
    pending: { index: number; key: FailureKey }[];
  } | null;
  /** 'Grade procedures' (failures outside a drill start their procedure) and the mode they start in */
  grade?: { on: boolean; mode: DrillMode };
  /** what the systems show the student: lit annunciators, radio / transponder working */
  systems?: { annunciators: string[]; comOk: boolean; xpdrOk: boolean };
  weather: {
    windDir: number;
    windKt: number;
    gustKt: number;
    ceilingFt: number;
    visibilitySm: number;
    turbulence: number;
    qnh?: number;
  };
  ap?: {
    on: boolean;
    lat: string;
    vert: string;
    hdgBug: number;
    altSel: number;
  };
  paused: boolean;
  frozen: boolean;
  /** added by the link: offset (deg) from the displayed heading to true north on the map */
  magVar?: number;
}

/** route and nearby airports for the console map: sent when they change (real-world coordinates) */
export interface RemoteRoute {
  key: string;
  wpts: { ident: string; lat: number; lon: number; role?: string }[];
  active: number;
  airports: {
    ident: string;
    lat: number;
    lon: number;
    rwys: [number, number, number, number][];
  }[];
}

export type RemoteCommand =
  | { type: "pause" }
  | { type: "resume" }
  | { type: "freeze" }
  | { type: "unfreeze" }
  | { type: "restart" }
  | { type: "end" }
  | { type: "reposition"; where: RepositionKind }
  | { type: "failure"; key: FailureKey; on: boolean; expect?: string }
  /** procedures mode: the instructor confirms a callout (Done) item they heard */
  | { type: "procConfirm"; procedureId: string; itemId: string }
  /** fire a drill failure that waits for the instructor */
  | { type: "drillFire"; index: number }
  | { type: "gradeProcedures"; on: boolean; mode?: DrillMode }
  | {
      type: "weather";
      ceilingFt?: number;
      visibilitySm?: number;
      windDir?: number;
      windKt?: number;
      gustKt?: number;
      turbulence?: number;
    }
  | { type: "vector"; hdg?: number; alt?: number }
  | { type: "directTo"; ident: string }
  | { type: "message"; text: string };

// ------------------------------------------------------------------ wire protocol (JSON over the data channel)
// 2: every system failure (FailureKey widened), procedures in the snapshot, procedure commands, 'procs' message.
// Compatible both ways: new fields are optional, and a host refuses a command it does not know with an ack.
export const PROTOCOL = 2;
/** console → simulator */
export type ClientMsg =
  | { k: "hello"; v: number; cid: string; device: string }
  | { k: "cmd"; id: number; c: RemoteCommand }
  | { k: "ping"; t: number }
  | { k: "bye" };
/** simulator → console */
export type HostMsg =
  | { k: "welcome"; v: number; code: string }
  | { k: "refused"; reason: string }
  | { k: "snap"; s: RemoteSnapshot }
  | { k: "route"; r: RemoteRoute }
  /** the procedures the instructor can expect (sent when the club library changes) */
  | { k: "procs"; list: RemoteProcChoice[] }
  | { k: "ack"; id: number; ok: boolean; text: string }
  | { k: "pong"; t: number }
  | { k: "bye"; reason: string };

// ------------------------------------------------------------------ pairing codes
/** no 0/O, 1/I/L: a code read off a screen and typed on a phone must not be ambiguous */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LEN = 6;
export const PEER_PREFIX = "ifr-sim-";

export function newPairCode(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < CODE_LEN; i++)
    s +=
      CODE_ALPHABET[
        Math.floor(rand() * CODE_ALPHABET.length) % CODE_ALPHABET.length
      ];
  return s;
}
/** what a person typed (or a URL hash) -> a canonical code, or null. Accepts spaces, dashes, lower case and the
 *  full broker id. The alphabet has no 0/O/1/I/L, so a look-alike typed by mistake is rejected, never guessed. */
export function parsePairCode(input: string): string | null {
  let s = String(input ?? '').trim();
  if (s.toLowerCase().startsWith(PEER_PREFIX)) s = s.slice(PEER_PREFIX.length);
  s = s.toUpperCase().replace(/[\s\-_.#]/g, '');
  if (s.length !== CODE_LEN) return null;
  for (const c of s) if (!CODE_ALPHABET.includes(c)) return null;
  return s;
}
export const peerIdFor = (code: string) => PEER_PREFIX + code.toLowerCase();
/** 'K7P4QX' → 'K7P 4QX' */
export const formatPairCode = (code: string) =>
  `${code.slice(0, 3)} ${code.slice(3)}`;

// ------------------------------------------------------------------ labels (console tiles, logs)
/** every failure, in the order of the instructor's groups */
export const FAILURE_KEYS: FailureKey[] = FAILURE_GROUPS.flatMap((g) => g.keys);
export const FAILURE_GROUP_IDS = FAILURE_GROUPS.map((g) => g.id);
export const FAILURE_GROUP_TEXT: Record<(typeof FAILURE_GROUPS)[number]["id"], Record<Lang, string>> = {
  engine: { en: "Engine & fuel", fr: "Moteur et carburant" },
  electrical: { en: "Electrical", fr: "Électricité" },
  instruments: { en: "Flight instruments", fr: "Instruments de vol" },
  avionics: { en: "Avionics & radio", fr: "Avionique et radio" },
  other: { en: "Other", fr: "Autres" },
};
/** one line under each failure tile: what the student will see */
const FAILURE_SUB: Record<FailureKey, Record<Lang, string>> = {
  gs: { en: "ILS vertical guidance", fr: "Guidage vertical de l’ILS" },
  nav1: { en: "VOR / localizer receiver", fr: "Récepteur VOR / localizer" },
  gps: { en: "Loss of integrity", fr: "Perte d’intégrité" },
  ap: { en: "Disconnects, cannot re-engage", fr: "Se déconnecte, ne se réengage pas" },
  ahrs: { en: "G1000 attitude and heading: red X", fr: "Assiette et cap G1000 : croix rouge" },
  airData: { en: "Pitot-static: airspeed, altitude, VSI", fr: "Vitesse, altitude, vario" },
  engine: { en: "Total power loss", fr: "Perte totale de puissance" },
  enginePartial: { en: "About 60 % power left", fr: "Environ 60 % de puissance" },
  engineRough: { en: "One bad magneto: rough running", fr: "Une magnéto défaillante : vibrations" },
  fuelPump: { en: "Engine quits unless the aux pump is ON", fr: "Le moteur s’arrête sans pompe électrique" },
  fuelLeak: { en: "The left tank loses fuel", fr: "Le réservoir gauche se vide" },
  oilPressure: { en: "Engine seizes about 10 min later", fr: "Serrage moteur environ 10 min plus tard" },
  engineFire: { en: "Fire in flight", fr: "Feu en vol" },
  fuelStarvation: { en: "Selector on a single tank only: that tank runs dry; the restart flow cures it", fr: "Sélecteur sur un seul réservoir uniquement : il se vide ; le redémarrage le corrige" },
  alternator: { en: "LOW VOLTS: on the battery only", fr: "LOW VOLTS : sur batterie seule" },
  battery: { en: "Battery dead, contactor open", fr: "Batterie hors service" },
  electricalFire: { en: "Smoke from a shorted radio (avionics bus 2)", fr: "Fumée d’une radio en court-circuit (barre avionique 2)" },
  vacuum: { en: "Steam attitude and DG (G1000: standby attitude) drift", fr: "Horizon et conservateur (G1000 : horizon de secours) dérivent" },
  pitotBlocked: { en: "Airspeed acts like an altimeter", fr: "Le badin réagit comme un altimètre" },
  pitotIcing: { en: "Airspeed to zero without pitot heat", fr: "Badin à zéro sans réchauffage" },
  staticBlocked: { en: "Altimeter frozen, VSI at zero", fr: "Altimètre figé, vario à zéro" },
  flaps: { en: "Stuck where they are", fr: "Bloqués dans leur position" },
  trimRunaway: { en: "Runs nose-down until the breaker is pulled", fr: "Part à piquer jusqu’au disjoncteur" },
  comms: { en: "No transmit, no receive: lost comms", fr: "Ni émission ni réception" },
  xpdr: { en: "Transponder inoperative", fr: "Transpondeur hors service" },
  door: { en: "Noise and a little drag", fr: "Bruit et un peu de traînée" },
};
/** the console's short English names of the historical avionics failures (kept: the session logs read them) */
const SHORT_EN: Partial<Record<FailureKey, string>> = {
  ahrs: "Attitude / heading",
  airData: "Air data",
  gs: "Glideslope",
  nav1: "NAV 1",
  gps: "GPS",
  ap: "Autopilot",
  engine: "Engine",
};
/** a failure's tile text in a language */
export function failureText(k: FailureKey, lang: Lang = "en"): { name: string; sub: string } {
  const name = lang === "en" ? (SHORT_EN[k] ?? FAILURE_LABELS_EN[k]) : FAILURE_LABELS_FR[k];
  return { name: name ?? k, sub: FAILURE_SUB[k]?.[lang] ?? "" };
}
/** English tile texts (console log lines) */
export const FAILURE_TEXT = Object.fromEntries(FAILURE_KEYS.map((k) => [k, failureText(k, "en")])) as Record<FailureKey, { name: string; sub: string }>;
export const REPOSITIONS: { where: RepositionKind; name: string }[] = [
  { where: "iaf", name: "IAF" },
  { where: "if", name: "IF" },
  { where: "final10", name: "10 NM final" },
  { where: "final5", name: "5 NM final" },
  { where: "runway", name: "On the runway" },
];
/** same presets as the simulator's weather menu (src/ui/modals.ts WX_PRESETS), copied so the console does not
 *  bundle the simulator */
export const REMOTE_WX_PRESETS: {
  id: string;
  name: string;
  desc: string;
  wx: {
    ceilingFt: number;
    visibilitySm: number;
    windKt: number;
    gustKt: number;
    turbulence: number;
  };
}[] = [
  {
    id: "cavok",
    name: "CAVOK",
    desc: "Clear, 10 SM, calm",
    wx: {
      ceilingFt: 20000,
      visibilitySm: 10,
      windKt: 4,
      gustKt: 0,
      turbulence: 0.03,
    },
  },
  {
    id: "mvfr",
    name: "Marginal VFR",
    desc: "OVC 2500, 5 SM",
    wx: {
      ceilingFt: 2500,
      visibilitySm: 5,
      windKt: 8,
      gustKt: 0,
      turbulence: 0.1,
    },
  },
  {
    id: "imc",
    name: "Low IMC",
    desc: "OVC 800, 2 SM",
    wx: {
      ceilingFt: 800,
      visibilitySm: 2,
      windKt: 10,
      gustKt: 0,
      turbulence: 0.15,
    },
  },
  {
    id: "mins",
    name: "At minimums",
    desc: "OVC 280, 1/2 SM fog",
    wx: {
      ceilingFt: 280,
      visibilitySm: 0.5,
      windKt: 6,
      gustKt: 0,
      turbulence: 0.1,
    },
  },
  {
    id: "below",
    name: "Below minimums",
    desc: "OVC 150, fly the miss",
    wx: {
      ceilingFt: 150,
      visibilitySm: 0.25,
      windKt: 5,
      gustKt: 0,
      turbulence: 0.1,
    },
  },
  {
    id: "xwind",
    name: "Gusty crosswind",
    desc: "18G28 kt, moderate chop",
    wx: {
      ceilingFt: 1100,
      visibilitySm: 3,
      windKt: 18,
      gustKt: 28,
      turbulence: 0.45,
    },
  },
  {
    id: "storm",
    name: "Rough day",
    desc: "OVC 600, 1 SM, turbulence",
    wx: {
      ceilingFt: 600,
      visibilitySm: 1,
      windKt: 22,
      gustKt: 32,
      turbulence: 0.7,
    },
  },
];
export const turbulenceName = (t: number) =>
  t < 0.05 ? "None" : t < 0.25 ? "Light" : t < 0.55 ? "Moderate" : "Severe";
export const pad3 = (n: number) =>
  String(((Math.round(n) % 360) + 360) % 360 || 360).padStart(3, "0");

/** one line a person reads: "Glideslope failed", "Weather: wind 250/12G20, OVC 800, 2 SM" */
export function describeCommand(c: RemoteCommand): string {
  switch (c.type) {
    case "pause":
      return "Simulation paused";
    case "resume":
      return "Simulation resumed";
    case "freeze":
      return "Simulation frozen";
    case "unfreeze":
      return "Simulation unfrozen";
    case "restart":
      return "Flight restarted";
    case "end":
      return "Flight ended";
    case "reposition":
      return `Repositioned: ${REPOSITIONS.find((r) => r.where === c.where)?.name ?? c.where}`;
    case "failure":
      return `${FAILURE_TEXT[c.key]?.name ?? c.key} ${c.on ? "failed" : "restored"}`;
    case "procConfirm":
      return "Callout confirmed";
    case "drillFire":
      return "Drill failure fired";
    case "gradeProcedures":
      return c.on ? `Procedures graded (${c.mode === "test" ? "test" : "training"})` : "Procedures not graded";
    case "weather": {
      const p: string[] = [];
      if (c.windKt !== undefined)
        p.push(
          `wind ${c.windDir !== undefined ? pad3(c.windDir) : "---"}/${Math.round(c.windKt)}${c.gustKt ? `G${Math.round(c.gustKt)}` : ""}`,
        );
      if (c.ceilingFt !== undefined)
        p.push(
          c.ceilingFt >= 12000
            ? "no ceiling"
            : `ceiling ${Math.round(c.ceilingFt)} ft`,
        );
      if (c.visibilitySm !== undefined) p.push(`${fmtVis(c.visibilitySm)} SM`);
      if (c.turbulence !== undefined)
        p.push(`${turbulenceName(c.turbulence).toLowerCase()} turbulence`);
      return `Weather: ${p.join(", ") || "unchanged"}`;
    }
    case "vector": {
      const p: string[] = [];
      if (c.hdg !== undefined) p.push(`heading ${pad3(c.hdg)}`);
      if (c.alt !== undefined)
        p.push(`maintain ${Math.round(c.alt).toLocaleString("en-US")} ft`);
      return `ATC: ${p.join(", ")}`;
    }
    case "directTo":
      return `ATC: proceed direct ${c.ident}`;
    case "message":
      return `Message: ${c.text}`;
  }
}
export const fmtVis = (v: number) =>
  v >= 10
    ? "10"
    : v === 0.25
      ? "1/4"
      : v === 0.5
        ? "1/2"
        : v === 0.75
          ? "3/4"
          : String(Math.round(v * 100) / 100);

// ------------------------------------------------------------------ validation (host side, before anything is applied)
const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const fin = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
/** a procedure or item id: short, printable, no spaces */
const isProcId = (v: unknown): v is string => typeof v === "string" && /^[\w.:-]{1,80}$/.test(v);
/** a number inside [lo, hi] (rejects out-of-range values rather than silently clamping them) */
function inRange(
  v: unknown,
  lo: number,
  hi: number,
): number | undefined | null {
  if (v === undefined) return undefined;
  return fin(v) && v >= lo && v <= hi ? v : null;
}

/** Anything received from the network → a well-formed command, or null. Unknown keys are dropped. */
export function validateCommand(x: unknown): RemoteCommand | null {
  if (!isObj(x) || typeof x.type !== "string") return null;
  switch (x.type) {
    case "pause":
    case "resume":
    case "freeze":
    case "unfreeze":
    case "restart":
    case "end":
      return { type: x.type };
    case "reposition":
      return REPOSITIONS.some((r) => r.where === x.where)
        ? { type: "reposition", where: x.where as RepositionKind }
        : null;
    case "failure": {
      if (
        typeof x.key !== "string" ||
        !(FAILURE_KEYS as string[]).includes(x.key) ||
        typeof x.on !== "boolean"
      )
        return null;
      const c: { type: "failure"; key: FailureKey; on: boolean; expect?: string } = { type: "failure", key: x.key as FailureKey, on: x.on };
      if (x.expect !== undefined) {
        if (!isProcId(x.expect)) return null;
        c.expect = x.expect;
      }
      return c;
    }
    case "procConfirm":
      return isProcId(x.procedureId) && isProcId(x.itemId)
        ? { type: "procConfirm", procedureId: x.procedureId, itemId: x.itemId }
        : null;
    case "drillFire":
      return fin(x.index) && Number.isInteger(x.index) && x.index >= 0 && x.index < 100
        ? { type: "drillFire", index: x.index }
        : null;
    case "gradeProcedures":
      if (typeof x.on !== "boolean") return null;
      if (x.mode !== undefined && x.mode !== "training" && x.mode !== "test") return null;
      return x.mode ? { type: "gradeProcedures", on: x.on, mode: x.mode as DrillMode } : { type: "gradeProcedures", on: x.on };
    case "weather": {
      const lim: Record<string, [number, number]> = {
        ceilingFt: [0, 30000],
        visibilitySm: [0, 50],
        windDir: [0, 360],
        windKt: [0, 80],
        gustKt: [0, 100],
        turbulence: [0, 1],
      };
      const out: Record<string, number> = {};
      for (const [k, [lo, hi]] of Object.entries(lim)) {
        const v = inRange(x[k], lo, hi);
        if (v === null) return null;
        if (v !== undefined) out[k] = v;
      }
      if (!Object.keys(out).length) return null;
      if (
        out.gustKt !== undefined &&
        out.windKt !== undefined &&
        out.gustKt > 0 &&
        out.gustKt < out.windKt
      )
        return null;
      return { type: "weather", ...out };
    }
    case "vector": {
      const hdg = inRange(x.hdg, 0, 360);
      const alt = inRange(x.alt, -1000, 45000);
      if (
        hdg === null ||
        alt === null ||
        (hdg === undefined && alt === undefined)
      )
        return null;
      const c: { type: "vector"; hdg?: number; alt?: number } = {
        type: "vector",
      };
      if (hdg !== undefined) c.hdg = Math.round(hdg) % 360 || 360;
      if (alt !== undefined) c.alt = Math.round(alt / 100) * 100;
      return c;
    }
    case "directTo":
      return typeof x.ident === "string" &&
        /^[A-Za-z0-9]{2,7}$/.test(x.ident.trim())
        ? { type: "directTo", ident: x.ident.trim().toUpperCase() }
        : null;
    case "message": {
      if (typeof x.text !== "string") return null;
      // printable text only, one line, bounded
      const t = x.text
        .replace(/[\u0000-\u001f\u007f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
      return t ? { type: "message", text: t } : null;
    }
    default:
      return null;
  }
}

/** a console message → typed, or null */
export function parseClientMsg(x: unknown): ClientMsg | null {
  if (!isObj(x) || typeof x.k !== "string") return null;
  if (x.k === "hello")
    return typeof x.cid === "string" && x.cid.length <= 64
      ? {
          k: "hello",
          v: fin(x.v) ? x.v : 0,
          cid: x.cid,
          device:
            typeof x.device === "string" ? x.device.slice(0, 40) : "Browser",
        }
      : null;
  if (x.k === "cmd")
    return fin(x.id) ? { k: "cmd", id: x.id, c: x.c as RemoteCommand } : null;
  if (x.k === "ping") return { k: "ping", t: fin(x.t) ? x.t : 0 };
  if (x.k === "bye") return { k: "bye" };
  return null;
}

/** what this browser is, in a person's words: 'iPad', 'iPhone', 'Android tablet'… */
export function deviceName(ua: string, touchPoints = 0): string {
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1))
    return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua))
    return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  if (/CrOS/.test(ua)) return "Chromebook";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Macintosh|Mac OS/.test(ua)) return "Mac";
  if (/Linux/.test(ua)) return "Linux PC";
  return "Browser";
}
