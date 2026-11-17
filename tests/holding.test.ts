import { describe, it, expect } from 'vitest';
import { holdEntry, acceptableEntries, clearanceText, teardropCourse, entrySector } from '../src/nav/holding';

describe('hold entries (AIM 5-3-8)', () => {
  // Right hold, inbound 360: the racetrack lies south of the fix, on the east (holding) side.
  // AIM FIG 5-3-8: direct a ∈ [-70, +110], teardrop (+110, +180], parallel [-180, -70), a = course − inbound.
  it.each([
    [360, 'DIRECT'], // straight in on the inbound course
    [60, 'DIRECT'],
    [90, 'DIRECT'], // from the west (non-holding side): 90° right at the fix → outbound on the holding side
    [110, 'DIRECT'], // on the 70° line: direct (either is acceptable within 5°)
    [135, 'TEARDROP'], // arriving along the outbound course from its non-holding side
    [170, 'TEARDROP'],
    [200, 'PARALLEL'],
    [225, 'PARALLEL'],
    [270, 'PARALLEL'], // from the east (holding side), heading west: parallel on the non-holding side
    [290, 'DIRECT'], // a = −70, boundary
  ])('right turns, course to fix %i° → %s', (crs, entry) => {
    expect(holdEntry(360, 'R', crs as number)).toBe(entry);
  });
  it('left holds are mirrored', () => {
    expect(holdEntry(360, 'L', 225)).toBe('TEARDROP');
    expect(holdEntry(360, 'L', 135)).toBe('PARALLEL');
    expect(holdEntry(360, 'L', 20)).toBe('DIRECT');
    expect(holdEntry(360, 'L', 280)).toBe('DIRECT');
    expect(holdEntry(360, 'L', 90)).toBe('PARALLEL');
  });
  it('accepts the neighbouring entry within 5° of a boundary', () => {
    expect(acceptableEntries(360, 'R', 112).sort()).toEqual(['DIRECT', 'TEARDROP']);
    expect(acceptableEntries(360, 'R', 140)).toEqual(['TEARDROP']);
    expect(acceptableEntries(360, 'R', 287).sort()).toEqual(['DIRECT', 'PARALLEL']);
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
    [340, 'DIRECT'], // a = +70
    [50, 'TEARDROP'], // a = +140
    [30, 'TEARDROP'], // a = +120
    [140, 'PARALLEL'], // a = −130
    [120, 'PARALLEL'], // a = −150
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

describe('entry sector at its boundaries (70° / 110° / 180° sectors)', () => {
  // inbound 270, right turns (the course's ARD hold): boundaries at courses 020 (the 70° line), 200 (its
  // extension) and 090 (the outbound course)
  it.each([
    [19, 'DIRECT'],
    [20, 'DIRECT'], // on the 70° line: direct
    [21, 'TEARDROP'],
    [89, 'TEARDROP'],
    [90, 'TEARDROP'], // the outbound course itself: the end of the 70° sector
    [91, 'PARALLEL'],
    [199, 'PARALLEL'],
    [200, 'DIRECT'], // −70: direct
    [201, 'DIRECT'],
    [270, 'DIRECT'],
  ])('inbound 270 R, course %i° → %s', (crs, entry) => {
    expect(entrySector(270, 'R', crs as number).entry).toBe(entry);
  });
  it('measures the sectors: 180° direct, 70° teardrop, 110° parallel', () => {
    const n = { DIRECT: 0, TEARDROP: 0, PARALLEL: 0 };
    for (let c = 0; c < 360; c++) n[entrySector(270, 'R', c).entry]++;
    expect(n).toEqual({ DIRECT: 181, TEARDROP: 70, PARALLEL: 109 });
  });
  it('gives the nearest boundary and the margin to it', () => {
    expect(entrySector(270, 'R', 50)).toMatchObject({ entry: 'TEARDROP', margin: 30, boundary: 20 });
    expect(entrySector(270, 'R', 180)).toMatchObject({ entry: 'PARALLEL', margin: 20, boundary: 200 });
    expect(entrySector(270, 'R', 300)).toMatchObject({ entry: 'DIRECT', rel: 30 });
    expect(entrySector(270, 'R', 93)).toMatchObject({ margin: 3, boundary: 90 });
    expect(entrySector(270, 'R', 93).either.sort()).toEqual(['PARALLEL', 'TEARDROP']);
    expect(entrySector(270, 'R', 300).either).toEqual(['DIRECT']);
  });
  it('mirrors left turns', () => {
    // inbound 270, left turns: the 70° line is at course 160, its extension at 340
    expect(entrySector(270, 'L', 160).entry).toBe('DIRECT');
    expect(entrySector(270, 'L', 159).entry).toBe('TEARDROP');
    expect(entrySector(270, 'L', 341).entry).toBe('PARALLEL');
    expect(entrySector(270, 'L', 159).boundary).toBe(160);
  });
});
