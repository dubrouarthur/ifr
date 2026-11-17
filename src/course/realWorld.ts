// A course set at a real airfield (Course.world = { kind: "real", icaos }): its situations are posed relative to the
// real runways and radio aids (« 8 NM out on the ILS 25R of LFPN »), so the real-world navigation data around the
// airfield must be loaded before its slides draw an instrument or the cockpit poses the flight. A course of the
// training region puts the training region back. The academy loads the navigation data only (no terrain tiles);
// the cockpit loads the terrain too (main.ts).
import type { Course, World } from "./types";
import { currentRegion, leaveRealWorld, loadRegion } from "../nav/world";

/** The airfields a world needs loaded (none for the training region). */
export function worldAirports(w: World | undefined): string[] {
  if (!w || w.kind !== "real") return [];
  const list = w.icaos?.length ? w.icaos : [w.region];
  return list.filter((x) => /^[A-Z0-9]{3,4}$/.test(x));
}
/** The world a course flies in: its own, else the first real-world scene's (a course of captures). */
export function courseWorld(c: Course | null | undefined): World {
  if (!c) return { kind: "training" };
  if (c.world?.kind === "real" && worldAirports(c.world).length) return c.world;
  for (const sc of Object.values(c.scenes ?? {}))
    if (sc.world?.kind === "real" && worldAirports(sc.world).length)
      return sc.world;
  return { kind: "training" };
}

let loaded = "";
/** the region frame this module loaded (another load, the flight builder's, replaces it) */
let loadedFrame: ReturnType<typeof currentRegion> = null;
let job: Promise<boolean> | null = null;
/**
 * Load the navigation data a world needs (or go back to the training region). Resolves true when the world is
 * ready, false when the data could not be loaded (the slides then show what they can without it).
 */
export function enterWorld(
  w: World,
  o: { terrain?: boolean } = {},
): Promise<boolean> {
  const icaos = worldAirports(w);
  const key = icaos.join(",");
  const run = async (): Promise<boolean> => {
    if (!icaos.length) {
      if (currentRegion()) leaveRealWorld();
      loaded = "";
      return true;
    }
    if (currentRegion() && currentRegion() === loadedFrame && loaded === key)
      return true;
    try {
      await loadRegion(icaos, 1.2, undefined, { terrain: o.terrain ?? false });
      loaded = key;
      loadedFrame = currentRegion();
      return true;
    } catch {
      loaded = "";
      return false;
    }
  };
  // one load at a time: a second request waits for the first (two routes in a row)
  const next = (job ?? Promise.resolve(true)).then(run, run);
  job = next;
  return next;
}
/** Load what a course needs before its slides are drawn. */
export const enterCourseWorld = (
  c: Course | null | undefined,
): Promise<boolean> => enterWorld(courseWorld(c));
