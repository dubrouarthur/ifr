// Real-world region loader: airports, runways, ILS, navaids, waypoints and instrument approaches from the
// generated navdata (OurAirports + FAA CIFP), plus real terrain (Terrarium DEM tiles).
//
// Magnetic variation: the whole region is rotated about its centre so that MAGNETIC north becomes the
// simulator's grid north. Published magnetic courses (runways, localizers, VOR radials, procedure legs)
// then match the instruments exactly without touching the avionics. Real coordinates are recovered with
// `toReal()` for exports and EFB links. (Variation changes < ~1° across a typical region.)
import {
  replaceNavData,
  setTerrainProvider,
  restoreTrainingRegion,
} from "./data";
import {
  destination,
  distanceNm,
  bearingDeg,
  FT_PER_NM,
  type LatLon,
} from "./geo";
import type { Airport, Approach, AirwaySeg, Fix, Navaid, ProcLeg, Runway, TermLeg, TerminalProc } from "./types";

export type IndexRow = [
  icao: string,
  name: string,
  city: string,
  country: string,
  lat: number,
  lon: number,
  elev: number,
  flags: number,
];
export const FLAG_LARGE = 2,
  FLAG_MEDIUM = 1,
  FLAG_PROC = 4,
  FLAG_ILS = 8,
  FLAG_TERM = 16;

interface TileAirport {
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
  elev: number;
  type: string;
  runways: {
    ids: [string, string];
    len: number;
    wid: number;
    lit: boolean;
    surf: string;
    le: [number, number, number, number];
    he: [number, number, number, number];
  }[];
  freqs: Record<string, number>;
  magVar: number | null;
  wpts?: [string, number, number][];
  ils?: {
    id: string;
    f: number;
    rwy: string;
    lat: number;
    lon: number;
    crs: number;
    gs: number | null;
    gsLat: number | null;
    gsLon: number | null;
    tch: number;
  }[];
  rwCifp?: Record<
    string,
    {
      lat: number;
      lon: number;
      elev: number;
      brg: number;
      len: number;
      wid: number;
      tch: number;
      disp: number;
    }
  >;
}
interface Tile {
  airports: Record<string, TileAirport>;
  navaids: {
    id: string;
    name: string;
    t: "VOR" | "VORDME" | "NDB";
    f: number;
    lat: number;
    lon: number;
    elev: number;
    dme: boolean;
    mv: number | null;
    src?: string;
  }[];
  fixes: [string, number, number][];
  /** airway segments: [route, from, lat, lon, to, lat, lon, MEA, level] */
  aw?: [string, string, number, number, string, number, number, number, string][];
}
type RawLeg = Omit<ProcLeg, "fix"> & {
  fix: Fix;
  hold?: { inbound: number; turn: "L" | "R"; legMin: number; legNm?: number };
};
type RawApproach = Omit<
  Approach,
  | "minimums"
  | "msa"
  | "notes"
  | "missedText"
  | "difficulty"
  | "transitions"
  | "final"
  | "missed"
> & {
  transitions: { name: string; legs: RawLeg[] }[];
  final: RawLeg[];
  missed: RawLeg[];
};

const BASE = "/navdata";
/** fetch with a timeout: a stalled request must never block the region load */
async function fetchT(url: string, ms: number): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}
export type LoadStep = { step: "index" | "navdata" | "procedures" | "terrain" | "done"; done?: number; total?: number };
let indexCache: IndexRow[] | null = null;
const tileCache = new Map<string, Promise<Tile | null>>();

export async function airportIndex(): Promise<IndexRow[]> {
  if (!indexCache)
    indexCache = await (await fetchT(`${BASE}/index.json`, 30000)).json();
  return indexCache!;
}

/** Great-circle distance between two index rows (NM). */
export function rowDistanceNm(a: IndexRow, b: IndexRow): number {
  return distanceNm({ lat: a[4], lon: a[5] }, { lat: b[4], lon: b[5] });
}
/** Largest departure–destination distance one region can hold (the region is a flat local grid). */
export const MAX_REGION_NM = 400;
/** Airports around a point, nearest first (towered / larger fields only, the strip list would be noise). */
export async function nearbyAirports(lat: number, lon: number, limit = 8, exclude = ""): Promise<IndexRow[]> {
  const rows = await airportIndex();
  return rows
    .filter((r) => r[0] !== exclude && r[7] & (FLAG_LARGE | FLAG_MEDIUM) && Math.abs(r[4] - lat) < 3 && Math.abs(r[5] - lon) < 4)
    .map((r) => [distanceNm({ lat, lon }, { lat: r[4], lon: r[5] }), r] as const)
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map(([, r]) => r);
}
/** Exact lookup by ICAO. */
export async function airportRow(icao: string): Promise<IndexRow | null> {
  const s = icao.trim().toUpperCase();
  return (await airportIndex()).find((r) => r[0] === s) ?? null;
}

/** Search by ICAO prefix, name or city; IFR-capable and larger airports first. */
export async function searchAirports(
  q: string,
  limit = 12,
): Promise<IndexRow[]> {
  const rows = await airportIndex();
  const s = q.trim().toUpperCase();
  if (!s) return rows.filter((r) => r[7] & FLAG_PROC).slice(0, limit);
  const score = (r: IndexRow) =>
    r[0] === s
      ? 0
      : r[0].startsWith(s)
        ? 1
        : r[1].toUpperCase().includes(s)
          ? 2
          : (r[2] ?? "").toUpperCase().includes(s)
            ? 3
            : 9;
  return rows
    .map((r) => [score(r), r] as const)
    .filter(([sc]) => sc < 9)
    .sort((a, b) => a[0] - b[0] || (b[1][7] & 7) - (a[1][7] & 7))
    .slice(0, limit)
    .map(([, r]) => r);
}

function tileKey(lat: number, lon: number) {
  return `${Math.floor(lat / 5) * 5}_${Math.floor(lon / 5) * 5}`;
}
function getTile(k: string): Promise<Tile | null> {
  if (!tileCache.has(k))
    tileCache.set(
      k,
      fetchT(`${BASE}/tiles/${k}.json`, 20000)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  return tileCache.get(k)!;
}

// ------------------------------------------------------------------ magnetic rotation
export interface RegionFrame {
  center: LatLon;
  magVar: number;
}
let frame: RegionFrame | null = null;
export function currentRegion(): RegionFrame | null {
  return frame;
}
const DEG = Math.PI / 180;
function rot(p: LatLon, c: LatLon, deg: number): LatLon {
  if (!deg) return { lat: p.lat, lon: p.lon };
  const k = Math.cos(c.lat * DEG);
  const x = (p.lon - c.lon) * k,
    y = p.lat - c.lat;
  const a = deg * DEG;
  // bearing β → β − var: rotate the local frame counter-clockwise by var
  const x2 = x * Math.cos(a) - y * Math.sin(a);
  const y2 = y * Math.cos(a) + x * Math.sin(a);
  return { lat: c.lat + y2, lon: c.lon + x2 / k };
}
/** real → simulator coordinates */
export function toSim(p: LatLon): LatLon {
  return frame ? rot(p, frame.center, frame.magVar) : p;
}
/** simulator → real coordinates (exports, EFB) */
export function toReal(p: LatLon): LatLon {
  return frame ? rot(p, frame.center, -frame.magVar) : p;
}

// ------------------------------------------------------------------ DEM (Terrarium tiles, z9 ≈ 300 m)
const Z = 9;
interface DemTile {
  x: number;
  y: number;
  data: Float32Array;
}
const dem = new Map<string, DemTile>();
const lon2x = (lon: number) => ((lon + 180) / 360) * 2 ** Z;
const lat2y = (lat: number) =>
  ((1 - Math.log(Math.tan(lat * DEG) + 1 / Math.cos(lat * DEG)) / Math.PI) /
    2) *
  2 ** Z;

async function loadDem(
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
  onTile?: (done: number, total: number) => void,
) {
  const x0 = Math.floor(lon2x(minLon)),
    x1 = Math.floor(lon2x(maxLon));
  const y0 = Math.floor(lat2y(maxLat)),
    y1 = Math.floor(lat2y(minLat));
  const jobs: Promise<void>[] = [];
  let doneTiles = 0;
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++) {
      const k = `${x}/${y}`;
      if (dem.has(k)) continue;
      jobs.push(
        (async () => {
          try {
            const r = await fetchT(
              `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${x}/${y}.png`,
              15000,
            );
            if (!r.ok) return;
            const bmp = await createImageBitmap(await r.blob());
            const c = new OffscreenCanvas(256, 256);
            const g = c.getContext("2d")!;
            g.drawImage(bmp, 0, 0);
            const px = g.getImageData(0, 0, 256, 256).data;
            const data = new Float32Array(256 * 256);
            for (let i = 0; i < data.length; i++)
              data[i] =
                px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
            dem.set(k, { x, y, data });
          } catch {
            /* offline / blocked: that tile stays flat */
          } finally {
            onTile?.(++doneTiles, jobs.length);
          }
        })(),
      );
    }
  onTile?.(0, jobs.length);
  await Promise.all(jobs);
}
function demMeters(p: LatLon): number | null {
  const fx = lon2x(p.lon),
    fy = lat2y(p.lat);
  const tx = Math.floor(fx),
    ty = Math.floor(fy);
  const t = dem.get(`${tx}/${ty}`);
  if (!t) return null;
  const u = (fx - tx) * 255,
    v = (fy - ty) * 255;
  const i = Math.floor(u),
    j = Math.floor(v);
  const du = u - i,
    dv = v - j;
  const at = (a: number, b: number) =>
    t.data[Math.min(255, b) * 256 + Math.min(255, a)];
  return (
    at(i, j) * (1 - du) * (1 - dv) +
    at(i + 1, j) * du * (1 - dv) +
    at(i, j + 1) * (1 - du) * dv +
    at(i + 1, j + 1) * du * dv
  );
}

// ------------------------------------------------------------------ building the region
const ILS_DA_HAT = 200;
function deriveMinimums(
  type: Approach["type"],
  tdze: number,
  hasGs: boolean,
): Approach["minimums"] {
  const r20 = (x: number) => Math.ceil(x / 20) * 20;
  if (type === "ILS")
    return [
      { label: "S-ILS", da: tdze + ILS_DA_HAT, vis: "1/2", hat: ILS_DA_HAT },
      {
        label: "S-LOC",
        mda: r20(tdze + 400),
        vis: "3/4",
        hat: r20(tdze + 400) - tdze,
      },
      {
        label: "CIRCLING",
        mda: r20(tdze + 600),
        vis: "1",
        hat: r20(tdze + 600) - tdze,
      },
    ];
  if (type === "RNAV")
    return [
      ...(hasGs
        ? [
            { label: "LPV", da: tdze + 250, vis: "3/4", hat: 250 },
            { label: "LNAV/VNAV", da: tdze + 350, vis: "1", hat: 350 },
          ]
        : []),
      {
        label: "LNAV",
        mda: r20(tdze + 420),
        vis: "1",
        hat: r20(tdze + 420) - tdze,
      },
      {
        label: "CIRCLING",
        mda: r20(tdze + 600),
        vis: "1 1/4",
        hat: r20(tdze + 600) - tdze,
      },
    ];
  const hat = type === "NDB" ? 520 : 440;
  return [
    {
      label: `S-${type === "LOCBC" ? "LOC BC" : type}`,
      mda: r20(tdze + hat),
      vis: "1",
      hat: r20(tdze + hat) - tdze,
    },
    {
      label: "CIRCLING",
      mda: r20(tdze + hat + 160),
      vis: "1 1/4",
      hat: r20(tdze + hat + 160) - tdze,
    },
  ];
}

const ceil100 = (x: number) => Math.ceil(x / 100) * 100;
/** Generated RNAV (GPS) T-approaches (TAA style) for an airport that has no procedure in the data set.
 *  Geometry follows the PANS-OPS / FAA standard: IF 10 NM, FAF 5 NM, 3.00° path, IAFs 6 NM either side of the IF,
 *  missed approach straight ahead to a hold 8 NM beyond the threshold. Sim coordinates (grid north = magnetic). */
export function syntheticApproaches(apt: Airport, addFix: (f: Fix) => void): Approach[] {
  const ends = apt.runways.filter((r) => r.lengthFt >= 2500).sort((a, b) => b.lengthFt - a.lengthFt);
  const longest = new Set(ends.slice(0, 2).map((r) => r.lengthFt));
  const out: Approach[] = [];
  const tag = apt.icao.slice(-2);
  for (const rw of ends.filter((r) => longest.has(r.lengthFt)).slice(0, 4)) {
    const crs = rw.heading;
    const back = (crs + 180) % 360;
    const thr = rw.threshold;
    const tdze = rw.elevFt;
    const pt = (from: LatLon, brg: number, nm: number) => destination(from, brg, nm);
    const fx = (suffix: string, p: LatLon): Fix => {
      const f: Fix = { ident: `${tag}${rw.id}${suffix}`, kind: "fix", ...p };
      addFix(f);
      return f;
    };
    const fafAlt = ceil100(tdze + 5 * 318.4);
    const ifAlt = Math.max(fafAlt + 1000, ceil100(tdze + 2500));
    const mahAlt = Math.max(ceil100(tdze + 3000), ifAlt);
    const IF = fx("I", pt(thr, back, 10));
    const FAF = fx("F", pt(thr, back, 5));
    const IAFL = fx("L", pt(IF, (crs + 270) % 360, 6));
    const IAFR = fx("R", pt(IF, (crs + 90) % 360, 6));
    const MAH = fx("M", pt(thr, crs, 8));
    const RWF: Fix = { ident: `RW${rw.id}`, kind: "runway", ...thr };
    const leg = (l: ProcLeg) => l;
    const t = (iaf: Fix) => ({
      name: iaf.ident,
      legs: [
        leg({ fix: iaf, role: "IAF", altMin: ifAlt }),
        leg({ fix: IF, role: "IF", altMin: ifAlt, course: Math.round(bearingDeg(iaf, IF)), dist: 6 }),
      ],
    });
    const final: ProcLeg[] = [
      { fix: IF, role: "IF", altMin: ifAlt, hold: { inbound: Math.round(crs), turn: "R", legMin: 1 } },
      { fix: FAF, role: "FAF", altMin: fafAlt, course: Math.round(crs), dist: 5 },
      { fix: RWF, role: "MAP", course: Math.round(crs), dist: 5 },
    ];
    const missed: ProcLeg[] = [
      { fix: RWF },
      { fix: MAH, role: "MAHP", altMin: mahAlt, course: Math.round(crs), dist: 8, hold: { inbound: Math.round(back), turn: "R", legMin: 1 } },
    ];
    out.push({
      id: `${apt.icao}-G${rw.id}`,
      airport: apt.icao,
      name: `RNAV (GPS) RWY ${rw.id}`,
      type: "RNAV",
      category: "APV",
      difficulty: 1,
      runway: rw.id,
      finalCourse: Math.round(crs),
      gsAngle: 3,
      tch: 50,
      transitions: [t(IAFL), t(IAFR), { name: `${IF.ident} (HILPT)`, legs: [{ fix: IF, role: "IAF", altMin: ifAlt, hold: { inbound: Math.round(crs), turn: "R", legMin: 1 }, hilpt: true }] }],
      final,
      missed,
      missedText: `Climb straight ahead to ${mahAlt} direct ${MAH.ident} and hold.`,
      minimums: deriveMinimums("RNAV", tdze, true),
      msa: { center: apt.icao, alt: ceil100(Math.max(ifAlt, apt.elevFt + 2000) + 500) },
      notes: [
        "Generated procedure: no official approach for this airport in the data set (official procedures are FAA CIFP, US only).",
        "Standard RNAV T geometry (IF 10 NM, FAF 5 NM, 3.00°). Terrain is not assessed — check the MSA and terrain display.",
        "For training only — not for real-world navigation.",
      ],
      source: "Generated",
    });
  }
  return out;
}

function missedText(m: ProcLeg[]): string {
  const parts: string[] = [];
  const legs = m.slice(1);
  const first = legs[0];
  if (first?.altMin) parts.push(`Climb to ${first.altMin}`);
  for (const l of legs) {
    if (l.hold)
      parts.push(
        `hold at ${l.fix.ident} (${l.hold.turn === "L" ? "left" : "right"} turns, ${String(Math.round(l.hold.inbound)).padStart(3, "0")}° inbound)`,
      );
    else
      parts.push(
        `direct ${l.fix.ident}${l.altMin && l !== first ? ` at ${l.altMin}` : ""}`,
      );
  }
  return parts.join(", ").replace(/^./, (c) => c.toUpperCase()) + ".";
}

export interface LoadedRegion {
  /** false while terrain tiles are still streaming in the background */
  terrainComplete?: boolean;
  airports: string[];
  approaches: number;
  magVar: number;
  center: LatLon;
  demTiles: number;
}

/**
 * Load the real-world region around the given airports (departure first). Replaces the simulator's nav
 * database and terrain until `leaveRealWorld()`.
 */
export async function loadRegion(
  icaos: string[],
  marginDeg = 1.2,
  onProgress?: (s: LoadStep) => void,
): Promise<LoadedRegion> {
  onProgress?.({ step: "index" });
  const idx = await airportIndex();
  const pick = icaos
    .map((c) => idx.find((r) => r[0] === c.toUpperCase()))
    .filter(Boolean) as IndexRow[];
  if (!pick.length) throw new Error("Unknown airport");
  if (pick.length > 1 && rowDistanceNm(pick[0], pick[pick.length - 1]) > MAX_REGION_NM)
    throw new Error(`${pick[0][0]} → ${pick[pick.length - 1][0]} is ${Math.round(rowDistanceNm(pick[0], pick[pick.length - 1]))} NM: one flight is limited to ${MAX_REGION_NM} NM`);
  const lats = pick.map((r) => r[4]),
    lons = pick.map((r) => r[5]);
  const minLat = Math.min(...lats) - marginDeg,
    maxLat = Math.max(...lats) + marginDeg;
  const k = Math.cos(((minLat + maxLat) / 2) * DEG);
  const minLon = Math.min(...lons) - marginDeg / k,
    maxLon = Math.max(...lons) + marginDeg / k;
  const center: LatLon = {
    lat: (minLat + maxLat) / 2,
    lon: (minLon + maxLon) / 2,
  };
  // tiles
  const keys = new Set<string>();
  for (let la = Math.floor(minLat / 5) * 5; la <= maxLat; la += 5)
    for (let lo = Math.floor(minLon / 5) * 5; lo <= maxLon; lo += 5)
      keys.add(tileKey(la, lo));
  onProgress?.({ step: "navdata" });
  const tiles = (await Promise.all([...keys].map(getTile))).filter(
    Boolean,
  ) as Tile[];
  const inBox = (lat: number, lon: number) =>
    lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
  // magnetic variation: departure (CIFP) → nearest navaid declination → 0
  const dep = tiles.map((t) => t.airports[pick[0][0]]).find(Boolean);
  let magVar = dep?.magVar ?? null;
  if (magVar === null) {
    let best = Infinity;
    for (const t of tiles)
      for (const n of t.navaids)
        if (n.mv !== null && n.mv !== undefined) {
          const d = distanceNm(n, center);
          if (d < best) {
            best = d;
            magVar = n.mv;
          }
        }
  }
  frame = { center, magVar: magVar ?? 0 };
  const S = (lat: number, lon: number) => toSim({ lat, lon });

  const airports: Airport[] = [];
  const navaids: Navaid[] = [];
  const fixes: Fix[] = [];
  const approaches: Approach[] = [];
  const seenFix = new Set<string>();
  const addFix = (f: Fix) => {
    const key = `${f.ident}|${f.kind}`;
    if (seenFix.has(key)) return;
    seenFix.add(key);
    fixes.push(f);
  };
  // navaids (CIFP preferred over OurAirports duplicates)
  const navSeen = new Map<string, Navaid>();
  for (const t of tiles)
    for (const n of t.navaids) {
      if (!inBox(n.lat, n.lon)) continue;
      const key = `${n.id}|${n.t === "NDB" ? "N" : "V"}`;
      if (navSeen.has(key) && n.src !== "cifp") continue;
      const p = S(n.lat, n.lon);
      navSeen.set(key, {
        ident: n.id,
        name: n.name,
        type: n.t,
        freq: n.f,
        elevFt: n.elev,
        dme: n.dme,
        ...p,
      });
    }
  navaids.push(...navSeen.values());
  for (const n of navaids)
    addFix({
      ident: n.ident,
      lat: n.lat,
      lon: n.lon,
      kind: n.type === "NDB" ? "ndb" : "vor",
    });
  // enroute waypoints
  for (const t of tiles)
    for (const [id, la, lo] of t.fixes)
      if (inBox(la, lo)) addFix({ ident: id, ...S(la, lo), kind: "fix" });
  // airports
  const wanted = new Set(pick.map((r) => r[0]));
  for (const t of tiles)
    for (const [icao, a] of Object.entries(t.airports)) {
      if (!inBox(a.lat, a.lon)) continue;
      const rws: Runway[] = [];
      for (const r of a.runways) {
        const ends = [r.le, r.he];
        for (let e = 0; e < 2; e++) {
          const me = ends[e],
            other = ends[1 - e];
          const id = /^\d[LRC]?$/.test(r.ids[e]) ? `0${r.ids[e]}` : r.ids[e];
          const c = a.rwCifp?.[id] ?? a.rwCifp?.[r.ids[e]];
          const phys = S(me[0], me[1]);
          const far = S(other[0], other[1]);
          const disp = c?.disp ?? me[3] ?? 0;
          const thr = c
            ? S(c.lat, c.lon)
            : disp > 0
              ? destination(phys, bearingDeg(phys, far), disp / FT_PER_NM)
              : phys;
          rws.push({
            id,
            heading: Math.round(bearingDeg(phys, far) * 10) / 10,
            threshold: thr,
            end: far,
            lengthFt: r.len,
            widthFt: c?.wid ?? r.wid ?? 100,
            elevFt: c?.elev ?? me[2] ?? a.elev,
            lights: r.lit,
          });
        }
      }
      if (!rws.length) continue;
      const pos = S(a.lat, a.lon);
      const apt: Airport = {
        icao,
        name: a.name,
        city: a.city || a.country,
        elevFt: a.elev,
        runways: rws,
        freqs: {
          atis: a.freqs.atis,
          approach: a.freqs.approach,
          tower: a.freqs.tower,
          ground: a.freqs.ground,
          ctaf: a.freqs.ctaf,
        },
        magVar: frame.magVar,
        ...pos,
      };
      airports.push(apt);
      addFix({ ident: icao, ...pos, kind: "airport" });
      for (const [id, la, lo] of a.wpts ?? [])
        addFix({ ident: id, ...S(la, lo), kind: "fix" });
      for (const r of rws)
        addFix({ ident: `RW${r.id}`, ...r.threshold, kind: "runway" });
      for (const L of a.ils ?? []) {
        const rw = rws.find((r) => r.id === L.rwy);
        navaids.push({
          ident: L.id,
          name: `I-${L.id.replace(/^I/, "")}`,
          type: L.gs ? "ILS" : "LOC",
          freq: L.f,
          elevFt: rw?.elevFt ?? a.elev,
          course: L.crs,
          gsAngle: L.gs ?? undefined,
          gsPos:
            L.gsLat !== null && L.gsLon !== null
              ? S(L.gsLat, L.gsLon)
              : undefined,
          tch: rw ? (a.rwCifp?.[L.rwy]?.tch ?? 50) : 50,
          dme: true,
          runway: L.rwy,
          airport: icao,
          ...S(L.lat, L.lon),
        });
      }
    }
  // departure/arrival first so AIRPORTS[0] is the departure
  airports.sort(
    (x, y) =>
      (wanted.has(y.icao) ? 1 : 0) - (wanted.has(x.icao) ? 1 : 0) ||
      (x.icao === pick[0][0] ? -1 : y.icao === pick[0][0] ? 1 : 0),
  );
  // approaches of the chosen airports (and others with procedures nearby)
  const procAirports = idx.filter(
    (r) =>
      r[7] & FLAG_PROC &&
      inBox(r[4], r[5]) &&
      (wanted.has(r[0]) ||
        pick.some(
          (p) => Math.abs(p[4] - r[4]) < 0.5 && Math.abs(p[5] - r[5]) < 0.7,
        )),
  );
  onProgress?.({ step: "procedures" });
  const lists = await Promise.all(
    procAirports.map((r) =>
      fetchT(`${BASE}/proc/${r[0]}.json`, 20000)
        .then((x) => (x.ok ? x.json() : []))
        .catch(() => []),
    ),
  );
  for (const list of lists as RawApproach[][]) {
    for (const raw of list) {
      const apt = airports.find((a) => a.icao === raw.airport);
      const rw = apt?.runways.find((r) => r.id === raw.runway);
      if (!apt || !rw) continue;
      const fixLeg = (l: RawLeg): ProcLeg => {
        const p = S(l.fix.lat, l.fix.lon);
        const fx: Fix = { ident: l.fix.ident, kind: l.fix.kind, ...p };
        if (fx.kind !== "runway") addFix(fx);
        const out: ProcLeg = { ...l, fix: fx };
        if (l.hold)
          out.hold = {
            inbound: l.hold.inbound,
            turn: l.hold.turn,
            legMin: l.hold.legMin || 1,
          };
        return out;
      };
      const final = raw.final.map(fixLeg);
      const missed = raw.missed.map(fixLeg);
      const transitions = raw.transitions
        .map((t) => ({ name: t.name, legs: t.legs.map(fixLeg) }))
        .filter((t) => t.legs.length);
      // fill leg distances / courses where the source has none (sim geometry is magnetic)
      for (const seq of [final, missed, ...transitions.map((t) => t.legs)])
        for (let i = 1; i < seq.length; i++) {
          seq[i].dist ??= distanceNm(seq[i - 1].fix, seq[i].fix);
          seq[i].course ??= Math.round(bearingDeg(seq[i - 1].fix, seq[i].fix));
        }
      const map = final[final.length - 1];
      if (map.fix.kind === "runway") map.fix = { ...map.fix, ...rw.threshold };
      const hasGs = !!raw.gsAngle;
      const iafAlt = Math.max(
        0,
        ...transitions.flatMap((t) => t.legs.map((l) => l.altMin ?? 0)),
        ...final.map((l) => l.altMin ?? 0),
      );
      approaches.push({
        ...raw,
        transitions,
        final,
        missed,
        crsSetting:
          raw.type === "LOCBC" ? (raw.finalCourse + 180) % 360 : undefined,
        difficulty:
          raw.type === "ILS"
            ? 1
            : raw.type === "RNAV" || raw.type === "LOC"
              ? 2
              : 3,
        minimums: deriveMinimums(raw.type, rw.elevFt, hasGs),
        msa: {
          center:
            raw.navaid &&
            navaids.some(
              (n) =>
                n.ident === raw.navaid && n.type !== "ILS" && n.type !== "LOC",
            )
              ? raw.navaid
              : apt.icao,
          alt:
            Math.ceil((Math.max(iafAlt, apt.elevFt + 2000) + 500) / 100) * 100,
        },
        missedText: missedText(missed),
        notes: [
          `Source: ${raw.source ?? "FAA CIFP"} (AIRAC). Minimums derived (not in source data) — check the official chart.`,
          "For training only — not for real-world navigation.",
        ],
      } as Approach);
    }
  }
  // SIDs of the departure and STARs of the destination (FAA CIFP, US only)
  const terminal: TerminalProc[] = [];
  {
    const termOf = await Promise.all(
      pick.filter((r) => r[7] & FLAG_TERM).map((r) =>
        fetchT(`${BASE}/term/${r[0]}.json`, 20000)
          .then((x) => (x.ok ? x.json() : null))
          .then((j) => [r[0], j] as const)
          .catch(() => [r[0], null] as const),
      ),
    );
    const conv = (legs: TermLeg[]): TermLeg[] =>
      legs.map((l) => {
        if (!l.fix) return { ...l };
        const p = S(l.fix.lat, l.fix.lon);
        const fx: Fix = { ident: l.fix.ident, kind: l.fix.kind, ...p };
        if (fx.kind !== "runway") addFix(fx);
        return { ...l, fix: fx };
      });
    for (const [icao, j] of termOf) {
      if (!j) continue;
      const mk = (kind: "SID" | "STAR", e: { id: string; rwy: { name: string; legs: TermLeg[] }[]; common: TermLeg[]; enr: { name: string; legs: TermLeg[] }[] }): TerminalProc => ({
        id: e.id,
        airport: icao,
        kind,
        rwy: e.rwy.map((t) => ({ name: t.name, legs: conv(t.legs) })),
        common: conv(e.common),
        enr: e.enr.map((t) => ({ name: t.name, legs: conv(t.legs) })),
        source: "FAA CIFP",
      });
      for (const e of j.sids ?? []) terminal.push(mk("SID", e));
      for (const e of j.stars ?? []) terminal.push(mk("STAR", e));
    }
  }
  // enroute airways crossing the region
  const airways: AirwaySeg[] = [];
  {
    const seen = new Set<string>();
    const fixOf = (id: string, la: number, lo: number): Fix => {
      const p = S(la, lo);
      const nav = navaids.find((n) => n.ident === id && Math.abs(n.lat - p.lat) < 0.02 && Math.abs(n.lon - p.lon) < 0.02);
      const f: Fix = { ident: id, kind: nav ? (nav.type === "NDB" ? "ndb" : "vor") : "fix", ...p };
      if (!nav) addFix(f);
      return f;
    };
    for (const t of tiles)
      for (const [route, a, la1, lo1, b, la2, lo2, mea, level] of t.aw ?? []) {
        if (!inBox(la1, lo1) && !inBox(la2, lo2)) continue;
        const key = `${route}|${a}|${b}`;
        if (seen.has(key)) continue;
        seen.add(key);
        airways.push({ route, from: fixOf(a, la1, lo1), to: fixOf(b, la2, lo2), mea, level: (level as AirwaySeg["level"]) || " " });
      }
  }
  // airports chosen by the pilot without any published procedure in the data set (everything outside the US):
  // generate a standard RNAV (GPS) "T" approach per usable runway end so every real airport can be flown IFR.
  for (const icao of wanted) {
    if (approaches.some((x) => x.airport === icao)) continue;
    const apt = airports.find((a) => a.icao === icao);
    if (apt) approaches.push(...syntheticApproaches(apt, addFix));
  }
  replaceNavData({ airports, navaids, fixes, approaches, terminal, airways });
  // terrain: precomputed elevation grid (sim coordinates) with airport surfaces flattened. Navigation is
  // usable immediately; terrain tiles stream in (bounded wait), the grid is rebuilt when late tiles arrive.
  const flat = airports.map((a) => ({
    p: a as LatLon,
    e: Math.min(...a.runways.map((r) => r.elevFt)),
    r: Math.max(1.2, ...a.runways.map((r) => r.lengthFt / FT_PER_NM / 2 + 0.6)),
    size: Math.max(...a.runways.map((r) => r.lengthFt)),
  }));
  const gb = { minLat: minLat - 0.5, maxLat: maxLat + 0.5, minLon: minLon - 0.6 / k, maxLon: maxLon + 0.6 / k };
  const build = () => {
    const grid = buildGrid(gb, flat);
    setTerrainProvider({
      elev: (p) => grid.sample(p, true),
      land: (p) => (grid.sample(p, false) > 0.5 ? 1 : 0),
    });
  };
  const demJob = loadDem(minLat - 0.3, maxLat + 0.3, minLon - 0.4, maxLon + 0.4, (d, t) => onProgress?.({ step: "terrain", done: d, total: t }));
  const ready = await Promise.race([demJob.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 12000))]);
  build();
  if (!ready)
    void demJob.then(() => {
      if (frame && frame.center === center) {
        build();
        window.dispatchEvent(new CustomEvent("ifr-terrain-updated"));
      }
    });
  onProgress?.({ step: "done" });
  return {
    airports: airports.map((a) => a.icao),
    approaches: approaches.length,
    magVar: frame.magVar,
    center,
    demTiles: dem.size,
    terrainComplete: ready,
  };
}

/** Elevation grid in simulator coordinates (~330 m), raw metres (sea < 0), airports flattened (ft). */
function buildGrid(gb: { minLat: number; maxLat: number; minLon: number; maxLon: number }, flat: { p: LatLon; e: number; r: number; size?: number }[]) {
  const dLat = 0.003;
  const dLon = dLat / Math.cos(((gb.minLat + gb.maxLat) / 2) * DEG);
  const nx = Math.ceil((gb.maxLon - gb.minLon) / dLon) + 1;
  const ny = Math.ceil((gb.maxLat - gb.minLat) / dLat) + 1;
  const g = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const p = { lat: gb.minLat + j * dLat, lon: gb.minLon + i * dLon };
      const m = demMeters(toReal(p));
      g[j * nx + i] = m === null ? 1 : m;
    }
  // flatten airport surfaces (stored as metres). Where the surfaces of two airports overlap, the airport whose
  // flat zone the cell is deepest in wins — never "last one written" (a small strip next to a large field would
  // otherwise sink the big field's runways below their published elevation).
  const base = g.slice();
  const wBest = new Float32Array(nx * ny);
  for (const f of flat) {
    const rad = f.r + 1;
    const j0 = Math.max(0, Math.floor((f.p.lat - gb.minLat - rad / 60) / dLat)), j1 = Math.min(ny - 1, Math.ceil((f.p.lat - gb.minLat + rad / 60) / dLat));
    const di = rad / 60 / Math.cos(f.p.lat * DEG) / dLon;
    const ic = (f.p.lon - gb.minLon) / dLon;
    for (let j = j0; j <= j1; j++)
      for (let i = Math.max(0, Math.floor(ic - di)); i <= Math.min(nx - 1, Math.ceil(ic + di)); i++) {
        const p = { lat: gb.minLat + j * dLat, lon: gb.minLon + i * dLon };
        const d = distanceNm(p, f.p);
        if (d >= rad) continue;
        const k = j * nx + i;
        // 1 at the reference point, 0 at the edge of the blend ring; longer runways win ties (bigger airport)
        const depth = 1 - d / rad + Math.min(0.5, (f.size ?? 0) / 24000);
        if (depth <= wBest[k]) continue;
        wBest[k] = depth;
        const w = d < f.r ? 1 : 1 - (d - f.r);
        g[k] = Math.max(0.6, base[k]) * (1 - w) + f.e * 0.3048 * w;
      }
  }
  return {
    sample(p: LatLon, asFeet: boolean): number {
      const fx = (p.lon - gb.minLon) / dLon, fy = (p.lat - gb.minLat) / dLat;
      if (fx < 0 || fy < 0 || fx >= nx - 1 || fy >= ny - 1) return asFeet ? 0 : 1;
      const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
      const a = g[j * nx + i], b = g[j * nx + i + 1], c = g[(j + 1) * nx + i], d = g[(j + 1) * nx + i + 1];
      const m = a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
      return asFeet ? Math.max(0, m) / 0.3048 : m;
    },
  };
}

/** Back to the built-in Ardent Islands training region. */
export function leaveRealWorld() {
  frame = null;
  restoreTrainingRegion();
}
