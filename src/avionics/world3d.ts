// Equal-angle projection of world points into the attitude frame (used by SVT and the outside view).
import { AIRPORTS, groundElevation } from '../nav/data';
import { DEG, distanceNm, FT_PER_NM, toLocal, destination, type LatLon } from '../nav/geo';

export interface Cam extends LatLon {
  altFt: number;
  hdgTrue: number;
}

/** Returns azimuth/elevation (deg) of a world point relative to the level heading frame, or null if behind. */
/** project a point on the ground: the same surface the aircraft rolls on and the 3D view draws (a sloped runway
 *  or the airport flattening may differ from the published threshold elevation by tens of feet) */
function onGround(cam: Cam, p: LatLon) {
  return project(cam, p, groundElevation(p));
}

export function project(cam: Cam, p: LatLon, altFt: number): { az: number; el: number; dist: number } | null {
  const l = toLocal(cam, p); // nm east/north
  const h = cam.hdgTrue * DEG;
  const fwd = l.x * Math.sin(h) + l.y * Math.cos(h);
  const right = l.x * Math.cos(h) - l.y * Math.sin(h);
  if (fwd < 0.01) return null;
  const up = (altFt - cam.altFt) / FT_PER_NM;
  const horiz = Math.hypot(fwd, right);
  return { az: Math.atan2(right, fwd) / DEG, el: Math.atan2(up, horiz) / DEG, dist: horiz };
}

export interface RunwayQuad {
  id: string;
  corners: { az: number; el: number }[];
  center: { az: number; el: number }[];
  /** centreline stripes fixed on the ground (each a projected segment) */
  stripes: [{ az: number; el: number }, { az: number; el: number }][];
  lights: { az: number; el: number; dist: number; kind: 'edge' | 'app' | 'thr' }[];
  dist: number;
}

/** Visible runways within range, projected. */
export function runwaysInView(cam: Cam, rangeNm = 18): RunwayQuad[] {
  const out: RunwayQuad[] = [];
  for (const a of AIRPORTS) {
    if (distanceNm(cam, a) > rangeNm) continue;
    for (let i = 0; i < a.runways.length; i += 2) {
      const r = a.runways[i];
      const halfW = r.widthFt / 2 / FT_PER_NM;
      const len = distanceNm(r.threshold, r.end);
      // Everything is clipped at a fixed near plane ahead of the eye (interpolated, never by dropping samples):
      // the near edge then stays put as the aircraft rolls and the surface flows towards it, as in reality.
      const NEAR = 0.012; // NM ahead of the eye (~70 ft)
      const h = cam.hdgTrue * DEG;
      const fwdOf = (p: LatLon) => {
        const l = toLocal(cam, p);
        return l.x * Math.sin(h) + l.y * Math.cos(h);
      };
      const at = (t: number, side: number) => destination(destination(r.threshold, r.heading, t), r.heading + 90 * side, halfW);
      /** sub-range [t0, t1] of runway distance whose points (on both edges) lie beyond the near plane */
      const visibleRange = (): [number, number] | null => {
        let t0 = len, t1 = 0;
        for (const side of [-1, 1]) {
          const f0 = fwdOf(at(0, side)), f1 = fwdOf(at(len, side));
          if (f0 < NEAR && f1 < NEAR) return null;
          if (f0 >= NEAR && f1 >= NEAR) { t0 = Math.min(t0, 0); t1 = Math.max(t1, len); continue; }
          const tc = ((NEAR - f0) / (f1 - f0)) * len; // crossing (fwd is linear along a straight runway)
          if (f1 > f0) { t0 = Math.min(t0, tc); t1 = Math.max(t1, len); } else { t0 = Math.min(t0, 0); t1 = Math.max(t1, tc); }
        }
        return t1 > t0 ? [t0, t1] : null;
      };
      const vr = visibleRange();
      if (!vr) continue;
      const left: { az: number; el: number }[] = [];
      const right: { az: number; el: number }[] = [];
      const N = 40;
      for (let k = 0; k <= N; k++) {
        const t = vr[0] + ((vr[1] - vr[0]) * k) / N;
        const pl = onGround(cam, at(t, -1));
        const pr = onGround(cam, at(t, 1));
        if (pl && pr) {
          left.push(pl);
          right.push(pr);
        }
      }
      if (left.length < 2) continue;
      const pts = [...left, ...right.reverse()];
      const center: { az: number; el: number }[] = [];
      for (let k = 0; k <= 20; k++) {
        const p = onGround(cam, destination(r.threshold, r.heading, vr[0] + ((vr[1] - vr[0]) * k) / 20));
        if (p) center.push(p);
      }
      // centreline stripes fixed on the ground (FAA: 120 ft stripe, 80 ft gap), clipped at the near plane
      const stripes: [{ az: number; el: number }, { az: number; el: number }][] = [];
      const ft = 1 / FT_PER_NM;
      for (let t = 400 * ft; t < len - 400 * ft; t += 200 * ft) {
        let a0 = t, a1 = t + 120 * ft;
        const c0 = destination(r.threshold, r.heading, a0), c1 = destination(r.threshold, r.heading, a1);
        const f0 = fwdOf(c0), f1 = fwdOf(c1);
        if (f0 < NEAR && f1 < NEAR) continue;
        if (f0 < NEAR) a0 += ((NEAR - f0) / (f1 - f0)) * (a1 - a0);
        else if (f1 < NEAR) a1 = a0 + ((NEAR - f0) / (f1 - f0)) * (a1 - a0);
        const p0 = onGround(cam, destination(r.threshold, r.heading, a0)), p1 = onGround(cam, destination(r.threshold, r.heading, a1));
        if (p0 && p1 && Math.min(p0.dist, p1.dist) < 3) stripes.push([p0, p1]);
      }
      const lights: RunwayQuad['lights'] = [];
      for (const [thr, hdg, other] of [
        [r.threshold, r.heading, a.runways[i + 1]],
        [r.end, (r.heading + 180) % 360, r],
      ] as const) {
        void other;
        for (let k = 1; k <= 12; k++) {
          const p = onGround(cam, destination(thr, hdg + 180, (k * 200) / FT_PER_NM));
          if (p) lights.push({ ...p, kind: 'app' });
        }
        for (let k = -4; k <= 4; k++) {
          const p = onGround(cam, destination(thr, hdg + 90, (k * halfW) / 4));
          if (p) lights.push({ ...p, kind: 'thr' });
        }
      }
      for (let k = 0; k <= 30; k++) {
        for (const side of [-1, 1]) {
          const base = destination(r.threshold, r.heading, (len * k) / 30);
          const p = onGround(cam, destination(base, r.heading + 90 * side, halfW));
          if (p) lights.push({ ...p, kind: 'edge' });
        }
      }
      const d = Math.min(distanceNm(cam, r.threshold), distanceNm(cam, r.end));
      out.push({ id: r.id, corners: pts, center, stripes, lights, dist: d });
    }
  }
  return out.sort((x, y) => y.dist - x.dist);
}
