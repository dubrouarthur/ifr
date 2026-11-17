// The real fields a course's situations stand on (« Adapter à mon terrain », course/airfieldKit.ts). A slide finds a
// field through the slide registry (nav/data.ts registerSlideAirport); a kit course reopened later (another visit, a
// shared link) registers its fields again from the navdata before its slides are drawn. Small on purpose: the
// academy pages call it before every course they open.
import type { SimScene } from "./types";
import { registerSlideAirport, slideAirportKnown } from "../nav/data";

/** An ICAO location indicator: a letter, then 3 letters or digits (LFPN, KSFO, EGLL). */
export const ICAO_RE = /^[A-Z][A-Z0-9]{3}$/;

/** the real fields named by these situations */
export function sceneAirfields(scenes: Record<string, SimScene> | undefined): string[] {
  const want = new Set<string>();
  for (const s of Object.values(scenes ?? {}))
    if (s?.world?.kind === "real")
      for (const c of s.world.icaos?.length ? s.world.icaos : [s.world.region]) if (ICAO_RE.test(c)) want.add(c);
  return [...want];
}

/** Register the fields a course stands on that the slides do not know yet (at most `timeoutMs`: a slow network
 *  never holds a course back; its view then shows the sky until the next visit). */
export async function prepareCourseAirfields(
  scenes: Record<string, SimScene> | undefined,
  timeoutMs = 6000,
): Promise<void> {
  const missing = sceneAirfields(scenes).filter((c) => !slideAirportKnown(c));
  if (!missing.length) return;
  const job = (async () => {
    const { realAirfield } = await import("../nav/world");
    for (const c of missing) {
      const f = await realAirfield(c).catch(() => null);
      if (f) registerSlideAirport(f.airport);
    }
  })();
  let t = 0;
  await Promise.race([job, new Promise((r) => (t = setTimeout(r, timeoutMs) as unknown as number))]);
  clearTimeout(t);
}
