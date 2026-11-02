import { describe, it, expect } from 'vitest';
import { holdEntry, clearanceText, teardropCourse } from '../src/nav/holding';

describe('hold entries (AIM 5-3-8)', () => {
  // Right hold, inbound 360 (pattern east of the inbound course)
  it.each([
    [360, 'DIRECT'],
    [60, 'DIRECT'],
    [270, 'DIRECT'],
    [90, 'PARALLEL'], // arriving from the west: 110° parallel sector
    [135, 'PARALLEL'],
    [170, 'PARALLEL'],
    [225, 'TEARDROP'],
    [200, 'TEARDROP'],
  ])('right turns, course to fix %i° → %s', (crs, entry) => {
    expect(holdEntry(360, 'R', crs as number)).toBe(entry);
  });
  it('left holds are mirrored', () => {
    expect(holdEntry(360, 'L', 225)).toBe('PARALLEL');
    expect(holdEntry(360, 'L', 135)).toBe('TEARDROP');
    expect(holdEntry(360, 'L', 20)).toBe('DIRECT');
    expect(holdEntry(360, 'L', 280)).toBe('PARALLEL');
  });
  it('teardrop course is 30° toward the holding side', () => {
    expect(teardropCourse(270, 'R')).toBe(60);
    expect(teardropCourse(270, 'L')).toBe(120);
  });
  it('phrases a clearance', () => {
    const t = clearanceText({ fix: { ident: 'ARD', lat: 0, lon: 0 }, inbound: 45, turn: 'L', legMin: 1, altFt: 4000 }, true);
    expect(t).toMatch(/Hold SOUTHWEST of ARD on the 225 radial, left turns/);
  });
});

import { Sim, SCENARIOS } from '../src/sim/sim';
import { HoldEvaluator } from '../src/train/holdEval';
import { findFix } from '../src/nav/data';
import { destination } from '../src/nav/geo';

describe('flying hold entries with the autopilot', () => {
  const ard = findFix('ARD')!;
  const def = { fix: ard, inbound: 270, turn: 'R' as const, legMin: 1, altFt: 3000 };
  it.each([
    [270, 'DIRECT'],
    [200, 'DIRECT'], // a = -70
    [20, 'PARALLEL'], // a = +110
    [30, 'PARALLEL'], // course to fix 030 → a = +120
    [120, 'TEARDROP'], // a = -150
  ])('course to fix %i° → %s entry is flown and the hold is stable', (crs, expected) => {
    const s = new Sim(SCENARIOS.find((x) => x.id === 'free'));
    s.weather.windKt = 0;
    s.weather.turbulence = 0;
    const p = destination(ard, (crs as number) + 180, 3);
    s.ac.s.lat = p.lat;
    s.ac.s.lon = p.lon;
    s.ac.s.altFt = 3000;
    s.ac.s.psi = ((crs as number) * Math.PI) / 180;
    s.controls.trim = -0.25;
    s.fp.setHold({ ident: 'ARD', lat: ard.lat, lon: ard.lon }, 270, 'R', 1, s.ac.s, 3000);
    s.ap.altSel = 3000;
    s.ap.toggleAp(s.ac.data);
    s.ap.pressNav(s.ac.data, s.navInputs());
    s.ap.pressAlt(s.ac.data);
    const ev = new HoldEvaluator(def);
    for (let t = 0; t < 1150; t += 1 / 30) {
      s.step(1 / 30);
      const d = s.ac.data;
      ev.update({ lat: s.ac.s.lat, lon: s.ac.s.lon, alt: s.indicatedAlt(), track: d.trackTrue, turnRate: d.turnRateDps, gsKt: d.gsKt, t: s.time }, 1 / 30);
    }
    expect(s.fp.out.holdEntry).toBe(expected);
    expect(ev.correctEntry).toBe(expected);
    expect(ev.flownEntry).toBe(expected);
    expect(ev.laps).toBeGreaterThanOrEqual(3);
    const lastIn = ev.inboundTimes[ev.inboundTimes.length - 1];
    expect(lastIn).toBeGreaterThan(35);
    expect(lastIn).toBeLessThan(85);
    expect(ev.maxNonHoldingSide).toBeLessThan(0.6);
  });
});
