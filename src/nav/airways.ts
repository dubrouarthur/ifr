// Airways and ICAO-style route strings, as typed in a flight planner / FMS:
//   "KSFO SSTIK5.PORTE V25 SNS DCT CARME ALWYS3 KSJC"  or  "KSFO DCT SFO V25 SNS KSJC"
// Tokens: departure / destination airport, SID (optionally SID.TRANSITION), airway followed by its exit fix,
// DCT, fixes / navaids, STAR (optionally STAR.TRANSITION or TRANSITION.STAR). Pure logic over the loaded region.
import { AIRWAYS, AIRPORTS, findFix } from "./data";
import { sidsFor, starsFor } from "./terminal";
import type { AirwaySeg, Fix } from "./types";

/** the fixes along an airway from `from` to `to` (both included), or null if not on the same airway chain */
export function airwayFixes(
  route: string,
  from: string,
  to: string,
): Fix[] | null {
  const segs = AIRWAYS.filter((s) => s.route === route);
  if (!segs.length) return null;
  const adj = new Map<string, { fix: Fix; seg: AirwaySeg }[]>();
  const add = (a: Fix, b: Fix, seg: AirwaySeg) => {
    if (!adj.has(a.ident)) adj.set(a.ident, []);
    adj.get(a.ident)!.push({ fix: b, seg });
  };
  for (const s of segs) {
    add(s.from, s.to, s);
    add(s.to, s.from, s);
  }
  if (!adj.has(from) || !adj.has(to)) return null;
  // BFS along the airway graph
  const prev = new Map<string, Fix | null>();
  const start =
    segs.find((s) => s.from.ident === from)?.from ??
    segs.find((s) => s.to.ident === from)!.to;
  prev.set(from, null);
  const q: Fix[] = [start];
  while (q.length) {
    const f = q.shift()!;
    if (f.ident === to) break;
    for (const n of adj.get(f.ident) ?? []) {
      if (prev.has(n.fix.ident)) continue;
      prev.set(n.fix.ident, f);
      q.push(n.fix);
    }
  }
  if (!prev.has(to)) return null;
  const out: Fix[] = [];
  let cur: string | null = to;
  const byId = new Map<string, Fix>();
  for (const s of segs) {
    byId.set(s.from.ident, s.from);
    byId.set(s.to.ident, s.to);
  }
  while (cur) {
    out.unshift(byId.get(cur)!);
    cur = prev.get(cur)?.ident ?? null;
  }
  return out;
}

/** minimum enroute altitude along an airway between two fixes (max of the segment MEAs) */
export function airwayMea(route: string, fixes: string[]): number {
  let m = 0;
  for (let i = 1; i < fixes.length; i++) {
    const s = AIRWAYS.find(
      (x) =>
        x.route === route &&
        ((x.from.ident === fixes[i - 1] && x.to.ident === fixes[i]) ||
          (x.to.ident === fixes[i - 1] && x.from.ident === fixes[i])),
    );
    if (s) m = Math.max(m, s.mea);
  }
  return m;
}

/** airways of the loaded region that pass through a fix (for an FMS "airway from this fix" picker) */
export function airwaysAt(ident: string): string[] {
  return [
    ...new Set(
      AIRWAYS.filter((s) => s.from.ident === ident || s.to.ident === ident).map(
        (s) => s.route,
      ),
    ),
  ].sort();
}

export interface ParsedRoute {
  dep?: string;
  arr?: string;
  sid?: { id: string; transition: string | null };
  star?: { id: string; transition: string | null };
  /** enroute fixes in order (airways expanded), excluding the SID / STAR legs */
  fixes: string[];
  /** for display: each element of the route with how it was understood */
  items: {
    token: string;
    kind: "airport" | "sid" | "star" | "airway" | "fix" | "dct" | "unknown";
    detail?: string;
  }[];
  errors: string[];
}

const isAirport = (t: string) => AIRPORTS.some((a) => a.icao === t);

/** Parse an ICAO-style route string against the loaded region. */
export function parseRoute(text: string): ParsedRoute {
  const toks = text
    .toUpperCase()
    .replace(/[,;]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const r: ParsedRoute = { fixes: [], items: [], errors: [] };
  const last = () => r.fixes[r.fixes.length - 1];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t === "DCT") {
      r.items.push({ token: t, kind: "dct" });
      continue;
    }
    if (isAirport(t) && (i === 0 || i === toks.length - 1 || !r.dep)) {
      if (!r.dep && i === 0) r.dep = t;
      else r.arr = t;
      r.items.push({ token: t, kind: "airport" });
      continue;
    }
    const [a, b] = t.split(".");
    // SID (first procedure after the departure)
    if (r.dep && !r.sid && !r.fixes.length) {
      const sid = sidsFor(r.dep).find((p) => p.id === a || p.id === b);
      if (sid) {
        const tr = sid.id === a ? (b ?? null) : a;
        r.sid = {
          id: sid.id,
          transition: tr && sid.enr.some((e) => e.name === tr) ? tr : null,
        };
        r.items.push({
          token: t,
          kind: "sid",
          detail: r.sid.transition
            ? `${sid.id} via ${r.sid.transition}`
            : sid.id,
        });
        if (r.sid.transition) r.fixes.push(r.sid.transition);
        continue;
      }
    }
    // STAR (destination known from the last token)
    const arr = r.arr ?? toks.filter(isAirport).slice(-1)[0];
    if (arr) {
      const star = starsFor(arr).find((p) => p.id === a || p.id === b);
      if (star) {
        const tr = star.id === a ? (b ?? null) : a;
        r.star = {
          id: star.id,
          transition: tr && star.enr.some((e) => e.name === tr) ? tr : null,
        };
        r.items.push({
          token: t,
          kind: "star",
          detail: r.star.transition
            ? `${star.id} from ${r.star.transition}`
            : star.id,
        });
        continue;
      }
    }
    // airway: needs the previous fix and the next token as exit fix
    if (AIRWAYS.some((s) => s.route === t)) {
      const from = last();
      const to = toks[i + 1];
      if (!from || !to) {
        r.errors.push(
          `${t}: an airway needs an entry fix before it and an exit fix after it`,
        );
        r.items.push({ token: t, kind: "unknown" });
        continue;
      }
      const path = airwayFixes(t, from, to);
      if (!path) {
        r.errors.push(
          `${from} ${t} ${to}: ${from} and ${to} are not both on ${t}`,
        );
        r.items.push({ token: t, kind: "unknown" });
        continue;
      }
      for (const f of path.slice(1)) r.fixes.push(f.ident);
      r.items.push({
        token: t,
        kind: "airway",
        detail: `${from} → ${to} · ${path.length - 1} legs · MEA ${airwayMea(
          t,
          path.map((f) => f.ident),
        )}`,
      });
      i++; // the exit fix is consumed
      continue;
    }
    if (findFix(t)) {
      if (last() !== t) r.fixes.push(t);
      r.items.push({ token: t, kind: "fix" });
      continue;
    }
    r.errors.push(`${t}: unknown fix, airway or procedure in this region`);
    r.items.push({ token: t, kind: "unknown" });
  }
  return r;
}
