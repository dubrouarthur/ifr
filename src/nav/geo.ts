// Spherical-earth navigation math. Distances in nautical miles, angles in degrees.
export const EARTH_RADIUS_NM = 3440.065;
export const FT_PER_NM = 6076.12;
export const DEG = Math.PI / 180;

export interface LatLon {
  lat: number;
  lon: number;
}

/** Normalise an angle to [0, 360). */
export function norm360(a: number): number {
  const r = a % 360;
  return r < 0 ? r + 360 : r;
}

/** Normalise an angle to (-180, 180]. */
export function wrap180(a: number): number {
  let r = norm360(a);
  if (r > 180) r -= 360;
  return r;
}

export function distanceNm(a: LatLon, b: LatLon): number {
  const φ1 = a.lat * DEG;
  const φ2 = b.lat * DEG;
  const dφ = (b.lat - a.lat) * DEG;
  const dλ = (b.lon - a.lon) * DEG;
  const h = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial true bearing from a to b. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const φ1 = a.lat * DEG;
  const φ2 = b.lat * DEG;
  const dλ = (b.lon - a.lon) * DEG;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return norm360(Math.atan2(y, x) / DEG);
}

/** Point reached travelling distNm along true bearing brg from p. */
export function destination(p: LatLon, brg: number, distNm: number): LatLon {
  const δ = distNm / EARTH_RADIUS_NM;
  const θ = brg * DEG;
  const φ1 = p.lat * DEG;
  const λ1 = p.lon * DEG;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: φ2 / DEG, lon: wrap180(λ2 / DEG) };
}

/**
 * Cross-track distance (nm) of p from the great circle a→b.
 * Positive when p is to the RIGHT of the path.
 */
export function crossTrackNm(a: LatLon, b: LatLon, p: LatLon): number {
  const d13 = distanceNm(a, p) / EARTH_RADIUS_NM;
  const θ13 = bearingDeg(a, p) * DEG;
  const θ12 = bearingDeg(a, b) * DEG;
  return Math.asin(Math.sin(d13) * Math.sin(θ13 - θ12)) * EARTH_RADIUS_NM;
}

/** Along-track distance (nm) of p's projection on a→b, measured from a. */
export function alongTrackNm(a: LatLon, b: LatLon, p: LatLon): number {
  const d13 = distanceNm(a, p) / EARTH_RADIUS_NM;
  const xt = crossTrackNm(a, b, p) / EARTH_RADIUS_NM;
  const v = Math.cos(d13) / Math.cos(xt);
  const at = Math.acos(Math.max(-1, Math.min(1, v))) * EARTH_RADIUS_NM;
  const θ13 = bearingDeg(a, p);
  const θ12 = bearingDeg(a, b);
  return Math.abs(wrap180(θ13 - θ12)) > 90 ? -at : at;
}

/** Local flat projection (nm east, nm north) around a reference point. Good to ~100 nm. */
export function toLocal(ref: LatLon, p: LatLon): { x: number; y: number } {
  const y = (p.lat - ref.lat) * 60;
  const x = wrap180(p.lon - ref.lon) * 60 * Math.cos(ref.lat * DEG);
  return { x, y };
}
