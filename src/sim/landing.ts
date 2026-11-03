// Touchdown assessment: where and how the aircraft landed (for the pilot's feedback and the debrief).
import { AIRPORTS } from '../nav/data';
import { alongTrackNm, crossTrackNm, distanceNm, FT_PER_NM, type LatLon } from '../nav/geo';
import type { Runway } from '../nav/types';

export interface TouchdownInfo { vsFpm: number; pitchDeg: number; bankDeg: number; ias: number; g: number; kind: 'smooth' | 'normal' | 'firm' | 'hard'; bounced: boolean; lat: number; lon: number }
export interface TouchdownReport { airport: string; runway: string; alongFt: number; offsetFt: number; inTdz: boolean; text: string; tone: 'good' | 'info' | 'warn' | 'bad' }

/** Landing runway = the threshold behind the aircraft whose centreline is closest. */
export function landingRunway(p: LatLon): { icao: string; rw: Runway } | null {
  let best: { icao: string; rw: Runway; off: number } | null = null;
  for (const a of AIRPORTS)
    for (const rw of a.runways) {
      const along = alongTrackNm(rw.threshold, rw.end, p) * FT_PER_NM;
      if (along < -500 || along > rw.lengthFt + 200) continue;
      const off = Math.abs(crossTrackNm(rw.threshold, rw.end, p) * FT_PER_NM);
      if (off > rw.widthFt) continue;
      // of the two directions prefer the one we are moving along (closest threshold behind us)
      if (!best || off < best.off - 1 || (Math.abs(off - best.off) <= 1 && distanceNm(rw.threshold, p) < distanceNm(best.rw.threshold, p))) best = { icao: a.icao, rw, off };
    }
  return best;
}

export function assessTouchdown(td: TouchdownInfo, headingDeg: number): TouchdownReport | null {
  // pick the runway direction aligned with the aircraft heading
  let pick: { icao: string; rw: Runway } | null = null;
  for (const a of AIRPORTS)
    for (const rw of a.runways) {
      const d = Math.abs(((headingDeg - rw.heading + 540) % 360) - 180);
      if (d > 45) continue;
      const along = alongTrackNm(rw.threshold, rw.end, td) * FT_PER_NM;
      const off = crossTrackNm(rw.threshold, rw.end, td) * FT_PER_NM;
      if (along < -300 || along > rw.lengthFt || Math.abs(off) > rw.widthFt) continue;
      pick = { icao: a.icao, rw };
    }
  if (!pick) return null;
  const { rw } = pick;
  const alongFt = alongTrackNm(rw.threshold, rw.end, td) * FT_PER_NM;
  const offsetFt = crossTrackNm(rw.threshold, rw.end, td) * FT_PER_NM;
  const inTdz = alongFt >= 0 && alongFt <= 3000;
  const side = Math.abs(offsetFt) < 3 ? 'on the centreline' : `${Math.round(Math.abs(offsetFt))} ft ${offsetFt > 0 ? 'right' : 'left'} of centreline`;
  const where = alongFt < 0 ? `${Math.round(-alongFt)} ft SHORT of the threshold` : `${Math.round(alongFt)} ft past the threshold${inTdz ? '' : ' (long — beyond the TDZ)'}`;
  const label = { smooth: 'Smooth touchdown', normal: 'Good touchdown', firm: 'Firm touchdown', hard: 'Hard landing' }[td.kind];
  const text = `${label}${td.bounced ? ' — bounced' : ''} · RWY ${rw.id} · ${Math.round(-td.vsFpm)} fpm · ${td.g.toFixed(1)} g · ${Math.round(td.ias)} KIAS · ${where} · ${side}`;
  const tone = td.kind === 'hard' || alongFt < 0 ? 'bad' : td.kind === 'firm' || td.bounced || !inTdz || Math.abs(offsetFt) > rw.widthFt / 4 ? 'warn' : 'good';
  return { airport: pick.icao, runway: rw.id, alongFt, offsetFt, inTdz, text, tone };
}
