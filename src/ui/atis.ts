// ATIS text and runway-in-use (pure: no UI dependencies, safe to import anywhere).
import type { Weather } from "../sim/environment";
import { components } from "../sim/wind";
import { AIRPORTS, APPROACHES } from "../nav/data";
import type { Approach, Runway } from "../nav/types";

const pad3 = (n: number) =>
  String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, "0");
const PHON = [
  "Alpha",
  "Bravo",
  "Charlie",
  "Delta",
  "Echo",
  "Foxtrot",
  "Golf",
  "Hotel",
  "India",
  "Juliett",
  "Kilo",
  "Lima",
  "Mike",
];
/** below this the wind is reported calm and the longest runway is in use */
const CALM_KT = 3;

/** Runway best aligned with the wind at an airport (calm wind: the longest runway). */
export function runwayInUse(icao: string, w: Weather): Runway {
  const a = AIRPORTS.find((x) => x.icao === icao)!;
  const head = (r: Runway) =>
    w.windKt < CALM_KT ? 0 : components(w.windDir, w.windKt, r.heading).head;
  return [...a.runways].sort(
    (x, y) => head(y) - head(x) || y.lengthFt - x.lengthFt,
  )[0];
}

/** Head (+) / tail (−) and cross wind on a runway, kt. */
export function runwayWind(
  icao: string,
  runwayId: string,
  w: Pick<Weather, "windDir" | "windKt">,
): { head: number; cross: number } | null {
  const r = AIRPORTS.find((x) => x.icao === icao)?.runways.find(
    (x) => x.id === runwayId,
  );
  if (!r) return null;
  if (w.windKt < CALM_KT) return { head: 0, cross: 0 };
  return components(w.windDir, w.windKt, r.heading);
}

/** Approach type preference used by ATC (and the planner defaults): precision first. */
export const APPROACH_RANK: Record<Approach["type"], number> = {
  ILS: 0,
  RNAV: 1,
  LOC: 2,
  LDA: 3,
  LOCBC: 4,
  VOR: 5,
  NDB: 6,
};

/** The approach the ATIS advertises: best-ranked approach to the runway in use (optionally among `allowed`). */
export function approachInUse(
  icao: string,
  w: Weather,
  allowed: (a: Approach) => boolean = () => true,
): Approach | undefined {
  if (!AIRPORTS.some((x) => x.icao === icao)) return undefined;
  const rw = runwayInUse(icao, w);
  const apps = APPROACHES.filter((x) => x.airport === icao && allowed(x)).sort(
    (a, b) => APPROACH_RANK[a.type] - APPROACH_RANK[b.type],
  );
  return (
    apps.find((x) => x.runway === rw.id) ??
    apps.find((x) => (runwayWind(icao, x.runway, w)?.head ?? 0) >= 0) ??
    apps[0]
  );
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function atisText(icao: string, w: Weather, letterIdx = 0): string {
  const a = AIRPORTS.find((x) => x.icao === icao)!;
  const rw = runwayInUse(icao, w);
  const ap = APPROACHES.filter(
    (x) => x.airport === icao && x.runway === rw.id,
  ).sort((p, q) => APPROACH_RANK[p.type] - APPROACH_RANK[q.type])[0];
  const letter = PHON[letterIdx % PHON.length];
  const wind =
    w.windKt < CALM_KT
      ? "wind calm"
      : `wind ${pad3(w.windDir)} at ${Math.round(w.windKt)}${w.gustKt > w.windKt + 3 ? `, gusts ${Math.round(w.gustKt)}` : ""}`;
  const vis =
    w.visibilitySm >= 10
      ? "visibility 10"
      : `visibility ${w.visibilitySm < 1 ? (w.visibilitySm === 0.5 ? "one half" : w.visibilitySm === 0.25 ? "one quarter" : w.visibilitySm === 0.75 ? "three quarters" : w.visibilitySm) : w.visibilitySm}`;
  const sky =
    w.ceilingFt >= 15000
      ? "sky clear"
      : `ceiling ${Math.round(w.ceilingFt / 100) * 100} overcast`;
  const t = Math.round(w.oatSeaLevelC - (a.elevFt / 1000) * 2);
  const sentences = [
    `${a.name} information ${letter}`,
    wind,
    vis,
    sky,
    `temperature ${t}, altimeter ${w.qnh.toFixed(2)}`,
    ap ? `${ap.name} approach in use` : `runway ${rw.id} in use`,
    w.shearKt && w.shearKt > 5
      ? "low level wind shear advisories in effect"
      : "",
    `advise on initial contact you have information ${letter}`,
  ];
  return sentences
    .filter(Boolean)
    .map((s) => `${cap(s)}.`)
    .join(" ");
}
