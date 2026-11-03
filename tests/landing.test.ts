// End-to-end landing: coupled ILS to 40 ft, then a pilot flare (idle, progressive back pressure),
// touchdown classification, nose lowering, rollout and braking.
import { describe, it, expect } from 'vitest';
import { Sim, SCENARIOS } from '../src/sim/sim';
import { distanceNm, crossTrackNm } from '../src/nav/geo';
import { runway } from '../src/nav/data';

/** flare: 0 = none; otherwise the pitch attitude is raised toward +6 deg at `flare` deg/s */
function flyToTouchdown(flare: number, wind = 5) {
  const s = new Sim(SCENARIOS.find((x) => x.id === 'ils27-vtf')!);
  Object.assign(s.weather, { turbulence: 0, gustKt: 0, windKt: wind, windDir: 270, ceilingFt: 15000, visibilitySm: 10 });
  s.weather.aloft = undefined;
  s.reposition('final5');
  s.setCdi('NAV1');
  s.ap.toggleAp(s.ac.data);
  s.ap.pressHdg(s.ac.data);
  s.ap.pressAlt(s.ac.data);
  s.ap.pressApr(s.ac.data, s.navInputs());
  s.ap.iasSel = 70;
  s.controls.flaps = 3;
  let phase: 'ap' | 'flare' | 'roll' = 'ap';
  let el = 0;
  let pitchTgt = 0;
  let thrI = 0.45;
  const trace: { agl: number; ias: number; vs: number; pitch: number }[] = [];
  for (let i = 0; i < 60 * 400; i++) {
    const d = s.ac.data;
    if (phase === 'ap') {
      // pilot manages the speed with the throttle: 65 KIAS on final
      thrI = Math.max(0.05, Math.min(0.9, thrI + (65 - d.iasKt) * 0.0004));
      s.controls.throttle = thrI;
    }
    if (phase === 'ap' && d.aglFt < 30 && s.ap.vert === 'GS') {
      phase = 'flare';
      el = s.controls.elevator;
      pitchTgt = d.pitchDeg;
      s.ap.disconnect();
    }
    if (phase === 'flare') {
      s.controls.throttle = 0;
      if (flare > 0) {
        pitchTgt = Math.min(6, pitchTgt + flare / 60);
        el += ((pitchTgt - d.pitchDeg) * 0.02 - s.ac.s.q * 0.6) / 60 * 20;
        el = Math.max(-0.5, Math.min(0.8, el));
      }
      s.controls.elevator = el;
      trace.push({ agl: d.aglFt, ias: d.iasKt, vs: d.vsFpm, pitch: d.pitchDeg });
      if (s.ac.s.onGround) phase = 'roll';
    } else if (phase === 'roll') {
      s.controls.elevator = 0;
      s.controls.throttle = 0;
      s.controls.brake = d.iasKt < 45 ? 0.7 : 0;
    }
    s.step(1 / 60);
    if (s.ac.s.crashed || (phase === 'roll' && s.ac.s.tas < 0.3)) break;
  }
  return { s, trace };
}

describe('landing', () => {
  it('a normal flare gives a smooth or normal touchdown, nose-high, on the centreline, then a full stop', () => {
    const { s, trace } = flyToTouchdown(2.5);
    expect(s.ac.s.crashed).toBeNull();
    const td = s.ac.touchdown!;
    expect(td).toBeTruthy();
    expect(td.vsFpm).toBeGreaterThan(-420);
    expect(td.ias).toBeLessThan(72);
    expect(td.pitchDeg).toBeGreaterThan(0.5); // main wheels first
    const rw = runway('PARD', '27');
    const along = distanceNm(rw.threshold, td) * 6076;
    expect(along).toBeGreaterThan(200);
    expect(along).toBeLessThan(3500);
    expect(Math.abs(crossTrackNm(rw.threshold, rw.end, td) * 6076)).toBeLessThan(40);
    // flare reduced the sink rate
    const v40 = trace[0].vs;
    expect(td.vsFpm).toBeGreaterThan(v40);
    // nose lowered during the rollout, stopped on the runway
    expect(s.ac.data.pitchDeg).toBeLessThan(1);
    expect(s.ac.s.tas).toBeLessThan(0.5);
  });

  it('no flare: lands flat and fast compared with a proper flare', () => {
    const { s } = flyToTouchdown(0);
    const td = s.ac.touchdown!;
    const flared = flyToTouchdown(2.5).s.ac.touchdown!;
    expect(s.ac.s.crashed).toBeNull();
    expect(td.pitchDeg).toBeLessThan(flared.pitchDeg - 3); // flat, nose-wheel close to the runway
    expect(td.ias).toBeGreaterThan(flared.ias + 5); // lands fast and floats less
  });

  it('the nose does not rise by itself during the take-off roll', () => {
    const s = new Sim(SCENARIOS.find((x) => x.id === 'rwy27')!);
    Object.assign(s.weather, { turbulence: 0, gustKt: 0, windKt: 0 });
    s.controls.throttle = 1;
    let maxPitch = 0;
    for (let i = 0; i < 60 * 12; i++) {
      s.step(1 / 60);
      if (s.ac.data.iasKt < 45) maxPitch = Math.max(maxPitch, s.ac.data.pitchDeg);
    }
    expect(maxPitch).toBeLessThan(1);
  });
});

import { assessTouchdown } from '../src/sim/landing';
import { destination } from '../src/nav/geo';
describe('touchdown assessment', () => {
  it('reports runway, distance past the threshold and centreline offset', () => {
    const rw = runway('PARD', '27');
    const p = destination(destination(rw.threshold, rw.heading, 1200 / 6076), rw.heading + 90, 10 / 6076);
    const r = assessTouchdown({ vsFpm: -150, pitchDeg: 5, bankDeg: 0, ias: 52, g: 1.3, kind: 'normal', bounced: false, ...p }, 270)!;
    expect(r.runway).toBe('27');
    expect(Math.round(r.alongFt)).toBe(1200);
    expect(Math.round(r.offsetFt)).toBe(10);
    expect(r.tone).toBe('good');
    expect(r.text).toContain('10 ft right of centreline');
    const short = assessTouchdown({ vsFpm: -700, pitchDeg: 2, bankDeg: 0, ias: 60, g: 2.5, kind: 'hard', bounced: true, ...destination(rw.threshold, rw.heading + 180, 100 / 6076) }, 270)!;
    expect(short.tone).toBe('bad');
    expect(short.text).toContain('SHORT');
  });
});
