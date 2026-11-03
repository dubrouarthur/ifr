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
      // sample both edges so that a runway partially behind the camera still draws
      const left: { az: number; el: number }[] = [];
      const right: { az: number; el: number }[] = [];
      for (let k = 0; k <= 40; k++) {
        const base = destination(r.threshold, r.heading, (len * k) / 40);
        const pl = onGround(cam, destination(base, r.heading - 90, halfW));
        const pr = onGround(cam, destination(base, r.heading + 90, halfW));
        if (pl && pr && pl.dist > 0.02 && pr.dist > 0.02) {
          left.push(pl);
          right.push(pr);
        }
      }
      if (left.length < 2) continue;
      const pts = [...left, ...right.reverse()];
      const center: { az: number; el: number }[] = [];
      for (let k = 0; k <= 20; k++) {
        const p = onGround(cam, destination(r.threshold, r.heading, (len * k) / 20));
        if (p) center.push(p);
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
      out.push({ id: r.id, corners: pts, center, lights, dist: d });
    }
  }
  return out.sort((x, y) => y.dist - x.dist);
}
