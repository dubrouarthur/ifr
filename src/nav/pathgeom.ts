// Flight-path geometry shared by guidance and every display (MFD map, ND, PFD inset, planner map, charts):
// legs are joined by real turns instead of corners.
//  - fly-by waypoint: the turn starts before the waypoint (turn anticipation) on an arc tangent to both legs;
//  - fly-over waypoint (MAP, MAHP, runway, holding fix, or flagged): the aircraft overflies it, then turns
//    and rejoins the next leg directly.
// Turn radius: standard-rate turn (3°/s), but never more than 25° of bank (FMS/GPS convention).
import { bearingDeg, destination, distanceNm, type LatLon } from "./geo";

const G = 9.80665;
const KT = 0.514444;
const NM = 1852;
const wrap180 = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

/** turn radius (NM) at a ground speed: standard rate, bank limited to 25° */
export function turnRadiusNm(gsKt: number, maxBankDeg = 25): number {
  const v = Math.max(40, gsKt) * KT;
  const rStd = v / ((3 * Math.PI) / 180); // m, 3°/s
  const rBank = (v * v) / (G * Math.tan((maxBankDeg * Math.PI) / 180));
  return Math.max(rStd, rBank) / NM;
}

/** distance before a fly-by waypoint at which the turn starts (NM) */
export function turnAnticipationNm(
  inCourse: number,
  outCourse: number,
  gsKt: number,
): number {
  const d = Math.abs(wrap180(outCourse - inCourse));
  if (d < 1 || d > 175) return 0;
  return turnRadiusNm(gsKt) * Math.tan(((d / 2) * Math.PI) / 180);
}

export interface PathFix extends LatLon {
  ident?: string;
  /** overfly this point before turning (default: fly-by) */
  flyOver?: boolean;
  role?: string;
  hold?: unknown;
}

/** conventional fly-over points: missed-approach point, MAHP, runway thresholds and holding fixes */
export function isFlyOver(f: PathFix): boolean {
  if (f.flyOver !== undefined) return f.flyOver;
  return (
    f.role === "MAP" ||
    f.role === "MAHP" ||
    f.role === "RWY" ||
    !!f.hold ||
    /^RW\d/.test(f.ident ?? "")
  );
}

function arc(
  c: LatLon,
  r: number,
  a0: number,
  sweep: number,
  stepDeg = 4,
): LatLon[] {
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / stepDeg));
  return Array.from({ length: n + 1 }, (_, k) =>
    destination(c, a0 + (sweep * k) / n, r),
  );
}

/**
 * The flyable path through a sequence of fixes: straight legs joined by fly-by arcs, or by an
 * overfly-then-turn segment at fly-over fixes. The first and last fixes are passed through unchanged.
 */
export function flyablePath(fixes: PathFix[], gsKt = 100): LatLon[] {
  if (fixes.length < 3) return fixes.map((f) => ({ lat: f.lat, lon: f.lon }));
  const R = turnRadiusNm(gsKt);
  const out: LatLon[] = [{ lat: fixes[0].lat, lon: fixes[0].lon }];
  let from: LatLon = fixes[0];
  for (let i = 1; i < fixes.length - 1; i++) {
    const wp = fixes[i],
      nx = fixes[i + 1];
    const c1 = bearingDeg(from, wp);
    const c2 = bearingDeg(wp, nx);
    const d = wrap180(c2 - c1);
    const s = Math.sign(d) || 1;
    if (Math.abs(d) < 2) {
      out.push({ lat: wp.lat, lon: wp.lon });
      from = wp;
      continue;
    }
    if (!isFlyOver(wp) && Math.abs(d) <= 150) {
      // fly-by: tangent arc, anticipation limited to half of each adjoining leg
      const lim = Math.min(distanceNm(from, wp), distanceNm(wp, nx)) / 2;
      let r = R;
      let a = r * Math.tan((Math.abs(d) / 2) * (Math.PI / 180));
      if (a > lim) {
        a = lim;
        r = a / Math.tan((Math.abs(d) / 2) * (Math.PI / 180));
      }
      const t1 = destination(wp, c1 + 180, a);
      const centre = destination(t1, c1 + 90 * s, r);
      const a0 = bearingDeg(centre, t1);
      out.push(...arc(centre, r, a0, d));
      from = out[out.length - 1];
      continue;
    }
    // fly-over (or a turn too sharp to fly by): overfly, turn at the standard radius until the track points
    // at the next fix, then go direct
    out.push({ lat: wp.lat, lon: wp.lon });
    let hdg = c1;
    let pos: LatLon = wp;
    const centre = destination(wp, c1 + 90 * s, R);
    let ang = bearingDeg(centre, wp);
    for (let k = 0; k < 90; k++) {
      const err = wrap180(bearingDeg(pos, nx) - hdg);
      if (Math.abs(err) < 4 || Math.sign(err) !== s) break;
      ang += 4 * s;
      hdg += 4 * s;
      pos = destination(centre, ang, R);
      out.push(pos);
    }
    from = pos;
  }
  const last = fixes[fixes.length - 1];
  out.push({ lat: last.lat, lon: last.lon });
  return out;
}
