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
