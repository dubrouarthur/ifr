// VHF nav receivers (VOR / LOC / GS / DME / markers).
import { bearingDeg, distanceNm, FT_PER_NM, norm360, wrap180, DEG, type LatLon } from './geo';
import type { Navaid } from './types';
import { NAVAIDS, findFix } from './data';

export interface NavOutput {
  valid: boolean;
  ident: string;
  isLoc: boolean;
  /** Radial FROM station (magnetic) the aircraft is on */
  radial: number;
  /** Bearing TO station (magnetic) */
  bearingTo: number;
  /** Lateral deviation, normalised: +1 = full-scale fly-right */
  dev: number;
  toFrom: 'TO' | 'FROM' | 'OFF';
  gsValid: boolean;
  /** Vertical deviation, normalised: +1 = full-scale fly-up (aircraft below path) */
  gsDev: number;
  dmeNm: number | null;
  course: number;
  /** horizontal distance to the station / LOC antenna (nm) */
  distNm: number;
  /** horizontal distance to the GS antenna (nm) */
  gsDistNm: number;
}

export interface AircraftPos extends LatLon {
  altFt: number;
}

export const EMPTY_NAV: NavOutput = {
  valid: false,
  ident: '',
  isLoc: false,
  radial: 0,
  bearingTo: 0,
  dev: 0,
  toFrom: 'OFF',
  gsValid: false,
  gsDev: 0,
  dmeNm: null,
  course: 0,
  distNm: 0,
  gsDistNm: 0,
};

export function tunedNavaid(freq: number): Navaid | undefined {
  return NAVAIDS.find((n) => n.type !== 'NDB' && Math.abs(n.freq - freq) < 0.004);
}

/** Line-of-sight range (nm) for a VHF station given aircraft altitude above station. */
export function vhfRange(altAboveFt: number): number {
  return 1.23 * Math.sqrt(Math.max(100, altAboveFt));
}

export function computeNav(freq: number, obs: number, ac: AircraftPos, magVar = 0): NavOutput {
  const n = tunedNavaid(freq);
  if (!n) return { ...EMPTY_NAV, course: obs };
  const d = distanceNm(n, ac);
  const range = Math.min(n.type === 'ILS' || n.type === 'LOC' ? 25 : 130, vhfRange(ac.altFt - n.elevFt));
  if (d > range) return { ...EMPTY_NAV, course: obs };

  const radial = norm360(bearingDeg(n, ac) - magVar);
  const bearingTo = norm360(radial + 180);
  const slant = Math.hypot(d, (ac.altFt - n.elevFt) / FT_PER_NM);
  const dme = n.dme ? slant : null;

  if (n.type === 'ILS' || n.type === 'LOC') {
    const course = n.course ?? obs;
    const off = wrap180(radial - course - 180); // + => fly right
    // Front course coverage ±35°, otherwise unreliable
    if (Math.abs(off) > 35) return { ...EMPTY_NAV, ident: n.ident, isLoc: true, course };
    const dev = Math.max(-1.2, Math.min(1.2, off / 2.5));
    let gsValid = false;
    let gsDev = 0;
    let gsDistNm = 0;
    if (n.gsPos && n.gsAngle) {
      gsDistNm = distanceNm(n.gsPos, ac);
      const dg = gsDistNm * FT_PER_NM;
      const brgFromGs = bearingDeg(n.gsPos, ac);
      // only in front of the GS antenna, within 10 nm and ±8°
      const inFront = Math.abs(wrap180(brgFromGs - (course + 180))) < 8;
      if (inFront && dg < 10 * FT_PER_NM && dg > 200) {
        const angle = Math.atan2(ac.altFt - n.elevFt, dg) / DEG;
        gsDev = Math.max(-1.2, Math.min(1.2, (n.gsAngle - angle) / 0.7));
        gsValid = true;
      }
    }
    return { valid: true, ident: n.ident, isLoc: true, radial, bearingTo, dev, toFrom: 'TO', gsValid, gsDev, dmeNm: dme, course, distNm: d, gsDistNm };
  }

  // VOR: cone of confusion overhead
  const overhead = d < Math.abs(ac.altFt - n.elevFt) / FT_PER_NM * 0.6;
  const toDiff = wrap180(obs - bearingTo);
  const isTo = Math.abs(toDiff) < 90;
  const devDeg = isTo ? wrap180(radial - obs - 180) : wrap180(obs - radial);
  return {
    valid: true,
    ident: n.ident,
    isLoc: false,
    radial,
    bearingTo,
    dev: Math.max(-1.2, Math.min(1.2, devDeg / 10)),
    toFrom: overhead || Math.abs(Math.abs(toDiff) - 90) < 2 ? 'OFF' : isTo ? 'TO' : 'FROM',
    gsValid: false,
    gsDev: 0,
    dmeNm: dme,
    course: obs,
    distNm: d,
    gsDistNm: 0,
  };
}

/** Marker beacon: returns 'O' | 'M' | 'I' | null */
export function markerBeacon(ac: AircraftPos): 'O' | null {
  const om = findFix('MARLO');
  if (!om) return null;
  const d = distanceNm(om, ac);
  const height = (ac.altFt - 420) / FT_PER_NM;
  // cone ~ ±40° from vertical
  return height > 0 && d < Math.max(0.15, height * 0.85) ? 'O' : null;
}
