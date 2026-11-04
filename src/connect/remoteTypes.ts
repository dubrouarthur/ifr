// Instructor companion: the shapes exchanged between the simulator (host) and the phone / tablet console
// (remote.html). Pure module: no simulator or DOM imports, so the console bundle stays small and both sides
// validate with the same code.
import type { Failures } from "../sim/sim";

export type FailureKey = keyof Failures;
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
  | { type: "failure"; key: FailureKey; on: boolean }
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
export const PROTOCOL = 1;
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
export const FAILURE_KEYS: FailureKey[] = [
  "ahrs",
  "airData",
  "gs",
  "nav1",
  "gps",
  "ap",
  "engine",
];
export const FAILURE_TEXT: Record<FailureKey, { name: string; sub: string }> = {
  ahrs: { name: "Attitude / heading", sub: "AHRS or vacuum: partial panel" },
  airData: { name: "Air data", sub: "Pitot-static: airspeed, altitude, VSI" },
  gs: { name: "Glideslope", sub: "ILS vertical guidance" },
  nav1: { name: "NAV 1", sub: "VOR / localizer receiver" },
  gps: { name: "GPS", sub: "Loss of integrity" },
  ap: { name: "Autopilot", sub: "Disconnects, cannot re-engage" },
  engine: { name: "Engine", sub: "Total power loss" },
};
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
      return `${FAILURE_TEXT[c.key].name} ${c.on ? "failed" : "restored"}`;
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
    case "failure":
      return typeof x.key === "string" &&
        (FAILURE_KEYS as string[]).includes(x.key) &&
        typeof x.on === "boolean"
        ? { type: "failure", key: x.key as FailureKey, on: x.on }
        : null;
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
