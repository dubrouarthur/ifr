// Flight-model performance against C172S POH figures (tolerance bands) and handling sanity checks.
import { describe, it, expect } from 'vitest';
import { Sim, SCENARIOS } from '../src/sim/sim';
import { distanceNm } from '../src/nav/geo';

const sc = (id: string) => SCENARIOS.find((s) => s.id === id)!;
const calm = (s: Sim) => {
  Object.assign(s.weather, { windKt: 0, gustKt: 0, turbulence: 0, shearKt: 0 });
  s.weather.aloft = undefined;
};
const run = (s: Sim, sec: number, f?: () => boolean | void) => {
  for (let t = 0; t < sec; t += 1 / 60) {
    s.step(1 / 60);
    if (f?.()) return t;
  }
  return sec;
};

describe('C172 performance', () => {
  it('take-off: ~960 ft ground roll, lifts off below 66 KIAS with light back pressure', () => {
    const s = new Sim(sc('rwy27'));
    calm(s);
    s.controls.throttle = 1;
    const p0 = { lat: s.ac.s.lat, lon: s.ac.s.lon };
    let lift = 0;
    run(s, 60, () => {
      if (s.ac.data.iasKt > 55) s.controls.elevator = 0.3;
      if (!s.ac.s.onGround) return !!(lift = s.ac.data.iasKt);
    });
    const roll = distanceNm(p0, s.ac.s) * 6076;
    expect(roll).toBeGreaterThan(700);
    expect(roll).toBeLessThan(1250);
    expect(lift).toBeGreaterThan(50);
    expect(lift).toBeLessThan(66);
  });

  it('climbs 550-800 fpm at Vy with full power', () => {
    const s = new Sim(sc('ils27-vtf'));
    calm(s);
    s.ac.s.altFt = 1500;
    s.controls.throttle = 1;
    s.ap.altSel = 9000;
    s.ap.toggleAp(s.ac.data);
    s.ap.pressHdg(s.ac.data);
    s.ap.pressFlc(s.ac.data);
    s.ap.iasSel = 74;
    run(s, 90);
    expect(s.ac.data.iasKt).toBeGreaterThan(70);
    expect(s.ac.data.vsFpm).toBeGreaterThan(550);
    expect(s.ac.data.vsFpm).toBeLessThan(800);
  });

  it('cruises 115-130 KTAS at full throttle', () => {
    const s = new Sim(sc('ils27-vtf'));
    calm(s);
    s.ac.s.altFt = 3000;
    s.controls.throttle = 1;
    s.ap.toggleAp(s.ac.data);
    s.ap.pressHdg(s.ac.data);
    s.ap.altSel = 3000;
    s.ap.pressAlt(s.ac.data);
    run(s, 240);
    expect(s.ac.data.tasKt).toBeGreaterThan(115);
    expect(s.ac.data.tasKt).toBeLessThan(130);
  });

  for (const [flaps, lo, hi] of [[0, 46, 57], [3, 40, 51]] as const)
    it(`power-off stall (flaps ${flaps * 10}): warning at ${lo}-${hi} KIAS, nose drops, AoA stays bounded`, () => {
      const s = new Sim(sc('ils27-vtf'));
      calm(s);
      s.ac.s.altFt = 5000;
      s.controls.throttle = 0;
      s.controls.trim = 0;
      s.controls.flaps = flaps;
      s.ac.s.flapPos = flaps / 3;
      let warn = 0, maxAoa = 0, stalled = false, t = 0;
      run(s, 80, () => {
        t += 1 / 60;
        s.controls.elevator = Math.min(1, t * 0.015); // slow, steady back pressure (~1 kt/s)
        maxAoa = Math.max(maxAoa, s.ac.data.aoaDeg);
        if (s.ac.data.stallWarn && !warn) warn = s.ac.data.iasKt;
        if (s.ac.stalled) stalled = true;
      });
      expect(warn).toBeGreaterThan(lo);
      expect(warn).toBeLessThan(hi);
      expect(stalled).toBe(true);
      expect(maxAoa).toBeLessThan(24);
      // recovery: release back pressure, full power → flying again within 10 s
      s.controls.elevator = 0;
      s.controls.throttle = 1;
      run(s, 10);
      expect(s.ac.stalled).toBe(false);
      expect(s.ac.data.iasKt).toBeGreaterThan(55);
    });

  it('moderate turbulence moves the aircraft but stays controllable', () => {
    const s = new Sim(sc('ils27-vtf'));
    s.ac.s.altFt = 3000;
    s.controls.throttle = 0.68;
    s.weather.turbulence = 0.45;
    let maxB = 0;
    run(s, 60, () => void (maxB = Math.max(maxB, Math.abs(s.ac.data.rollDeg))));
    expect(maxB).toBeGreaterThan(3);
    expect(maxB).toBeLessThan(20);
  });

  it('brakes stop the aircraft from 58 kt in under 700 ft', () => {
    const s = new Sim(sc('rwy27'));
    calm(s);
    s.ac.s.tas = 30;
    s.controls.throttle = 0;
    s.controls.brake = 1;
    const p = { lat: s.ac.s.lat, lon: s.ac.s.lon };
    run(s, 60, () => s.ac.s.tas < 0.3);
    expect(distanceNm(p, s.ac.s) * 6076).toBeLessThan(700);
  });
});
