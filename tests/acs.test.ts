import { describe, it, expect } from 'vitest';
import { Sim, SCENARIOS } from '../src/sim/sim';
import { evaluateAcs } from '../src/sim/recorder';

function coupledIls(ceilingFt: number, stopAglFt: number, onMins?: (s: Sim) => boolean) {
  const s = new Sim(SCENARIOS.find((x) => x.id === 'ils27-vtf'));
  s.weather.turbulence = 0;
  s.weather.ceilingFt = ceilingFt;
  s.weather.visibilitySm = ceilingFt < 200 ? 0.25 : 1;
  const d = () => s.ac.data;
  s.ap.toggleAp(d());
  s.ap.pressHdg(d());
  s.ap.pressAlt(d());
  s.ap.pressApr(d(), s.navInputs());
  let done = false;
  for (let t = 0; t < 1200 && !done; t += 1 / 30) {
    s.step(1 / 30);
    if (s.ap.vert === 'GS') {
      s.controls.flaps = 1;
      s.controls.throttle = 0.42;
    }
    if (onMins && s.indicatedAlt() < 670 && onMins(s)) done = true;
    if (s.ap.vert === 'GS' && d().aglFt < stopAglFt) done = true;
  }
  return s;
}

describe('ACS checkride evaluation', () => {
  it('passes a coupled ILS that breaks out above DA', () => {
    const s = coupledIls(400, 150);
    expect(s.rec.visualAtMins).toBe(true);
    const r = evaluateAcs(s.rec);
    expect(r.items.filter((i) => i.result === 'FAIL')).toEqual([]);
    expect(r.result).toBe('PASS');
  });

  it('fails when continuing below DA in cloud', () => {
    const s = coupledIls(120, 150);
    expect(s.rec.visualAtMins).toBe(false);
    const r = evaluateAcs(s.rec);
    expect(r.result).toBe('FAIL');
    expect(r.items.find((i) => i.task === 'Decision altitude')?.result).toBe('FAIL');
    expect(r.items.find((i) => i.task === 'Missed approach')?.result).toBe('FAIL');
  });

  it('credits a missed approach flown at DA', () => {
    const s = coupledIls(120, 50, (sim) => {
      sim.fp.activateMissed();
      sim.ap.disconnect();
      sim.controls.throttle = 1;
      sim.controls.elevator = 0.3;
      for (let i = 0; i < 30 * 20; i++) sim.step(1 / 30);
      return true;
    });
    const r = evaluateAcs(s.rec);
    expect(r.items.find((i) => i.task === 'Missed approach')?.result).toBe('PASS');
    expect(r.items.find((i) => i.task === 'Decision altitude')?.result).toBe('PASS');
  });

  it('logs injected failures', () => {
    const s = new Sim(SCENARIOS.find((x) => x.id === 'ils27-vtf'));
    s.setFailure('ap', true);
    s.ap.toggleAp(s.ac.data);
    expect(s.ap.ap).toBe(false);
    expect(s.rec.failuresInjected).toContain('Autopilot');
  });
});

describe('instructor reposition', () => {
  for (const kind of ['iaf', 'if', 'final10', 'final5', 'runway'] as const) {
    it(`repositions to ${kind} and flies 20 s`, () => {
      const s = new Sim(SCENARIOS.find((x) => x.id === 'rnav09'));
      expect(s.reposition(kind)).toBe(true);
      for (let i = 0; i < 600; i++) s.step(1 / 30);
      expect(s.ac.s.crashed).toBeNull();
    });
  }
});
