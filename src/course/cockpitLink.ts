// What a page outside the cockpit needs to know about the cockpit's course bridge (no sim, no three.js: the player
// and the editor import this, index.html installs the bridge from cockpitBridge.ts).
import type { FlyTarget } from "./types";

/** localStorage key the installed bridge writes (the player reads it in another page of the same origin) */
export const BRIDGE_KEY = "ifr.cockpit.courses";
export const BRIDGE_VERSION = 1;

type Kv = Pick<Storage, "getItem" | "setItem">;
const kvOr = (kv?: Kv): Kv | null => {
  if (kv) return kv;
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};
/**
 * The academy and the cockpit ship in the same build, and the cockpit installs its course bridge at boot, so a
 * course page can always hand a step to index.html?fly=, even on a device that has never opened the simulator.
 * The stored flag only matters when a caller asks about a specific store (an older build's cockpit, tests).
 */
export const COCKPIT_IN_BUILD = true;
/** The cockpit of this build flies course steps (?fly=) and sends the result back. */
export function cockpitBridgeReady(kv?: Kv): boolean {
  if (!kv && COCKPIT_IN_BUILD) return true;
  try {
    return Number(kvOr(kv)?.getItem(BRIDGE_KEY) ?? 0) >= BRIDGE_VERSION;
  } catch {
    return false;
  }
}
export function markCockpitBridge(kv?: Kv): void {
  try {
    kvOr(kv)?.setItem(BRIDGE_KEY, String(BRIDGE_VERSION));
  } catch {
    /* private mode: the player keeps its fallback */
  }
}

/** The deep link the cockpit already understands for a target, when it has one (no result comes back). */
export function legacyFlyLink(
  t: FlyTarget | undefined,
  page = "index.html",
): string | null {
  if (!t) return null;
  const e = encodeURIComponent;
  if (t.kind === "lesson")
    return `${page}?lesson=${e(t.exerciseId)}${t.pathId ? `&path=${e(t.pathId)}` : ""}`;
  if (t.kind === "scenario")
    return `${page}?scenario=${e(t.scenarioId)}${t.wx ? `&wx=${e(t.wx)}` : ""}`;
  return null;
}

/** What the cockpit knows of a capture link (?capture=…) at boot, before its course bridge has loaded. */
export interface CaptureBoot {
  /** capture mode: the cockpit opens for a slide (a ?fly= link wins) */
  capturing: boolean;
  /** the link carries the slide's situation (?scene=): the bridge poses it, no default flight starts first */
  scene: boolean;
  /** the link names the studio to go back to: the top-left button is « Revenir à la diapo », not « Accueil » */
  back: boolean;
}
export function captureBoot(search: string): CaptureBoot {
  const q = new URLSearchParams(search);
  const capturing = q.has("capture") && !q.has("fly");
  return {
    capturing,
    scene: capturing && /^S[01]\.[A-Za-z0-9_-]+$/.test(q.get("scene") ?? ""),
    back: capturing && !!q.get("return"),
  };
}

/**
 * What the course page tells the cockpit before it leaves for ?fly=<token>, so the loading card can say which step
 * is being prepared and offer « Annuler, revenir au cours » while the course bridge still loads (audit §16). It lives
 * in sessionStorage for that one tab: the course store is asynchronous and loads after the cockpit's first frame.
 */
export interface FlyNote {
  token: string;
  /** the course and the step, in the language of the page that wrote it */
  course: string;
  step: string;
  /** where « Annuler » goes: the course page, on that step */
  back: string;
}
export const FLY_NOTE_KEY = "ifr.fly.note";
const sess = (): Storage | null => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
};
export function noteFly(n: FlyNote, s: Storage | null = sess()): void {
  try {
    s?.setItem(FLY_NOTE_KEY, JSON.stringify(n));
  } catch {
    /* private mode: the card just says « Préparation du vol… » */
  }
}
/** the note for this ?fly= token (another token's note, or a malformed one, is ignored) */
export function readFlyNote(search: string, s: Storage | null = sess()): FlyNote | null {
  const token = new URLSearchParams(search).get("fly");
  if (!token) return null;
  try {
    const raw = s?.getItem(FLY_NOTE_KEY);
    const n = raw ? (JSON.parse(raw) as Partial<FlyNote>) : null;
    if (!n || n.token !== token) return null;
    if (typeof n.course !== "string" || typeof n.step !== "string" || typeof n.back !== "string") return null;
    // only a page of this site (a relative course link)
    if (!/^[a-z0-9_-]+\.html(?:[?#][^\s]*)?$/i.test(n.back)) return null;
    return { token, course: n.course, step: n.step, back: n.back };
  } catch {
    return null;
  }
}
