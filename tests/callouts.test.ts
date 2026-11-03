import { describe, it, expect } from 'vitest';
import { CalloutMonitor, type CalloutInput } from '../src/sim/callouts';

const base = (o: Partial<CalloutInput>): CalloutInput => ({ aglFt: 3000, baroAltFt: 3420, vsFpm: -700, minimums: 670, onGround: false, bankDeg: 0, gsDots: 0, approachActive: true, throttle: 0.3, stall: false, ...o });

function descend(m: CalloutMonitor, from: number, to: number, elev = 420, extra: Partial<CalloutInput> = {}) {
  const heard: string[] = [];
  for (let agl = from; agl >= to; agl -= 2) heard.push(...m.update(0.17, base({ aglFt: agl, baroAltFt: agl + elev, ...extra })));
  return heard;
}

describe('aural callouts', () => {
  it('airline profile: radio altitudes, approaching minimums, minimums, retard — each once', () => {
    const m = new CalloutMonitor();
    m.profile = 'airline';
    const heard = descend(m, 3000, 4);
    expect(heard.filter((x) => /^\d+$/.test(x))).toEqual(['2500', '1000', '500', '400', '300', '200', '100', '50', '40', '30', '20', '10']);
    expect(heard.indexOf('plus100')).toBeLessThan(heard.indexOf('minimums'));
    expect(heard.filter((x) => x === 'minimums').length).toBe(1);
    expect(heard).toContain('retard');
  });
  it('GA profile: only 500 and the minimums', () => {
    const m = new CalloutMonitor();
    m.profile = 'ga';
    expect(descend(m, 3000, 4).filter((x) => x !== 'retard')).toEqual(['500', 'plus100', 'minimums']);
  });
  it('re-arms after a go-around', () => {
    const m = new CalloutMonitor();
    m.profile = 'ga';
    descend(m, 1200, 200);
    for (let agl = 200; agl < 1200; agl += 5) m.update(0.1, base({ aglFt: agl, baroAltFt: agl + 420, vsFpm: 800 }));
    expect(descend(m, 1200, 150)).toContain('minimums');
  });
  it('GPWS sink rate / pull up, glideslope and bank angle', () => {
    const m = new CalloutMonitor();
    expect(m.update(0.1, base({ aglFt: 800, vsFpm: -2000 }))).toContain('sinkrate');
    expect(m.update(0.1, base({ aglFt: 800, vsFpm: -3200 }))).toContain('pullup');
    expect(m.update(0.1, base({ aglFt: 600, vsFpm: -600, gsDots: 1.8 }))).toContain('glideslope');
    expect(m.update(0.1, base({ aglFt: 2000, bankDeg: 48 }))).toContain('bankangle');
    expect(new CalloutMonitor().update(0.1, base({ aglFt: 900, vsFpm: -700 }))).toEqual([]);
  });
});

import { Sim, SCENARIOS } from '../src/sim/sim';
describe('chronometer', () => {
  it('start → stop (frozen) → reset; start/stop resumes', () => {
    const s = new Sim(SCENARIOS[0]);
    expect(s.chrono()).toBeNull();
    expect(s.chronoButton()).toBe('start');
    for (let i = 0; i < 60 * 65; i++) s.step(1 / 60);
    expect(s.chronoButton()).toBe('stop');
    const frozen = s.chrono()!;
    expect(frozen).toBeGreaterThan(64);
    for (let i = 0; i < 120; i++) s.step(1 / 60);
    expect(s.chrono()).toBe(frozen);
    s.chronoStartStop();
    for (let i = 0; i < 60; i++) s.step(1 / 60);
    expect(s.chrono()!).toBeGreaterThan(frozen + 0.9);
    s.chronoButton();
    expect(s.chronoButton()).toBe('reset');
    expect(s.chrono()).toBeNull();
  });
});
