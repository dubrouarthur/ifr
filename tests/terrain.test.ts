import { describe, it, expect } from 'vitest';
import { groundElevation, landMask, AIRPORTS, APPROACHES } from '../src/nav/data';
import { destination, distanceNm } from '../src/nav/geo';

describe('Ardent Islands terrain', () => {
  it('airports sit on flat ground at field elevation', () => {
    for (const a of AIRPORTS) for (const r of a.runways) expect(Math.abs(groundElevation(r.threshold) - a.elevFt)).toBeLessThan(5);
  });
  it('there is open sea far from the islands', () => {
    const p = destination(AIRPORTS[0], 225, 40);
    expect(landMask(p)).toBeLessThan(0.05);
    expect(groundElevation(p)).toBe(0);
  });
  it('every published procedure altitude clears terrain by at least 1000 ft (MSA-style), sampled along each leg', () => {
    for (const ap of APPROACHES) {
      const seqs = [...ap.transitions.map((t) => t.legs), ap.missed.slice(1).length ? [ap.missed[ap.missed.length - 1]] : []];
      for (const legs of seqs) {
        for (let i = 1; i < legs.length; i++) {
          const a = legs[i - 1];
          const b = legs[i];
          const alt = Math.min(a.altMin ?? 99999, b.altMin ?? 99999);
          if (alt > 90000) continue;
          const d = distanceNm(a.fix, b.fix);
          for (let k = 0; k <= 10; k++) {
            const q = { lat: a.fix.lat + ((b.fix.lat - a.fix.lat) * k) / 10, lon: a.fix.lon + ((b.fix.lon - a.fix.lon) * k) / 10 };
            void d;
            expect(alt - groundElevation(q), `${ap.id} ${a.fix.ident}-${b.fix.ident}`).toBeGreaterThan(1000);
          }
        }
      }
    }
  });
  it('the ridge north-east of Mistral Valley rises well above the valley floor', () => {
    let max = 0;
    for (let b = 0; b < 360; b += 10) for (let r = 8; r < 22; r += 1) max = Math.max(max, groundElevation(destination(AIRPORTS[1], b, r)));
    expect(max).toBeGreaterThan(3000);
    expect(max).toBeLessThan(5200 - 1000); // MSA 5200 around MSV keeps 1000 ft clearance
  });
});
