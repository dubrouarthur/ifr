import { describe, it, expect } from 'vitest';
import { Sim, SCENARIOS } from '../src/sim/sim';
import { computeDebrief } from '../src/sim/recorder';
import { runway, APPROACHES } from '../src/nav/data';
import { crossTrackNm, FT_PER_NM } from '../src/nav/geo';

function run(s: Sim, seconds: number, each?: () => boolean | void) {
  for (let t = 0; t < seconds; t += 1 / 30) {
    s.step(1 / 30);
    if (each && each()) break;
  }
}

describe('scenarios', () => {
  for (const sc of SCENARIOS) {
    it(`${sc.id} loads and flies 30 s hands-off`, () => {
      const s = new Sim(sc);
      run(s, 30);
      expect(s.ac.s.crashed).toBeNull();
      if (sc.approachId) expect(s.fp.approachId).toBe(sc.approachId);
    });
  }
  it('every approach is used by at least one scenario', () => {
    for (const a of APPROACHES) expect(SCENARIOS.some((s) => s.approachId === a.id)).toBe(true);
  });
});

describe('back course', () => {
  it('autopilot flies the LOC BC 09 in BC mode to the runway', () => {
    const s = new Sim(SCENARIOS.find((x) => x.id === 'locbc09'));
    s.weather.turbulence = 0;
    const d = () => s.ac.data;
    s.ap.toggleAp(d());
    s.ap.pressHdg(d());
    s.ap.pressAlt(d());
    s.ap.pressApr(d(), s.navInputs());
    let captured = false;
    run(s, 900, () => {
      if (s.ap.lat === 'BC') captured = true;
      if (captured && s.ap.vert === 'ALT' && s.ap.altHold === 3000) {
        s.ap.altSel = 860;
        s.ap.pressVs(d());
        s.ap.vsSel = -400;
      }
      const r = runway('PARD', '09');
      return captured && crossTrackNm(r.threshold, r.end, s.ac.s) !== 0 && s.fp.out.distNm < 0.8 && s.fp.out.toIdent === 'RW09';
    });
    expect(captured).toBe(true);
    const r = runway('PARD', '09');
    const xt = crossTrackNm(r.threshold, r.end, s.ac.s) * FT_PER_NM;
    expect(Math.abs(xt)).toBeLessThan(250);
  });
});

describe('debrief', () => {
  it('scores a coupled ILS highly and logs events', () => {
    const s = new Sim(SCENARIOS.find((x) => x.id === 'ils27-vtf'));
    s.weather.turbulence = 0;
    const d = () => s.ac.data;
    s.ap.toggleAp(d());
    s.ap.pressHdg(d());
    s.ap.pressAlt(d());
    s.ap.pressApr(d(), s.navInputs());
    run(s, 900, () => {
      if (s.ap.vert === 'GS') {
        s.controls.flaps = 1;
        s.controls.throttle = 0.42;
      }
      return s.ap.vert === 'GS' && d().aglFt < 150;
    });
    const db = computeDebrief(s.rec, s.av.minimums);
    expect(db.finalSamples.length).toBeGreaterThan(20);
    expect(['A', 'B']).toContain(db.grade);
    const texts = s.rec.events.map((e) => e.text).join('\n');
    expect(texts).toMatch(/LOC captured/);
    expect(texts).toMatch(/Glideslope captured/);
    expect(texts).toMatch(/Minimums/);
  });
  it('a crash is an F', () => {
    const s = new Sim(SCENARIOS.find((x) => x.id === 'ils27-vtf'));
    s.controls.elevator = -1;
    s.controls.throttle = 1;
    run(s, 120, () => !!s.ac.s.crashed);
    expect(s.ac.s.crashed).not.toBeNull();
    expect(computeDebrief(s.rec, 670).grade).toBe('F');
  });
});
