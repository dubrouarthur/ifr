import { describe, it, expect } from 'vitest';
import { Sim, SCENARIOS } from '../src/sim/sim';
import { runway } from '../src/nav/data';
import { alongTrackNm, crossTrackNm, FT_PER_NM } from '../src/nav/geo';

const sc = (id: string) => SCENARIOS.find((s) => s.id === id)!;
function run(s: Sim, seconds: number, each?: (t: number) => boolean | void) {
  const dt = 1 / 30;
  for (let t = 0; t < seconds; t += dt) {
    s.step(dt);
    if (each && each(t)) break;
  }
}

describe('flight model', () => {
  it('is stable hands-off in cruise', () => {
    const s = new Sim(sc('ils27-vtf'));
    s.weather.turbulence = 0;
    const alt0 = s.ac.s.altFt;
    run(s, 60);
    expect(s.ac.s.crashed).toBeNull();
    expect(Math.abs(s.ac.s.altFt - alt0)).toBeLessThan(600);
    expect(s.ac.data.iasKt).toBeGreaterThan(60);
    expect(s.ac.data.iasKt).toBeLessThan(140);
  });

  it('takes off with full power and back pressure', () => {
    const s = new Sim(sc('rwy27'));
    s.weather.turbulence = 0;
    s.controls.throttle = 1;
    let rotated = false;
    run(s, 60, () => {
      if (s.ac.data.iasKt > 55) {
        s.controls.elevator = 0.35;
        rotated = true;
      }
      return s.ac.data.aglFt > 300;
    });
    expect(rotated).toBe(true);
    expect(s.ac.s.onGround).toBe(false);
    expect(s.ac.data.aglFt).toBeGreaterThan(300);
  });
});

describe('autopilot', () => {
  it('holds altitude and heading', () => {
    const s = new Sim(sc('ils27-vtf'));
    s.weather.turbulence = 0;
    s.ap.toggleAp(s.ac.data);
    s.ap.pressHdg(s.ac.data);
    s.ap.pressAlt(s.ac.data);
    s.ap.hdgBug = 180;
    run(s, 90);
    expect(Math.abs(s.ac.s.altFt - 3000)).toBeLessThan(60);
    expect(Math.abs(s.ac.data.hdgTrue - 180)).toBeLessThan(4);
  });

  it('climbs in VS and captures the selected altitude', () => {
    const s = new Sim(sc('ils27-vtf'));
    s.weather.turbulence = 0;
    s.controls.throttle = 0.9;
    s.ap.toggleAp(s.ac.data);
    s.ap.altSel = 4000;
    s.ap.pressVs(s.ac.data);
    s.ap.vsSel = 500;
    run(s, 240);
    expect(s.ap.vert).toBe('ALT');
    expect(Math.abs(s.ac.s.altFt - 4000)).toBeLessThan(60);
  });

  it('flies a coupled ILS 27 to 200 ft AGL on centerline', () => {
    const s = new Sim(sc('ils27-vtf'));
    s.weather.turbulence = 0.1;
    const d = () => s.ac.data;
    s.ap.toggleAp(d());
    s.ap.pressHdg(d());
    s.ap.pressAlt(d());
    s.ap.pressApr(d(), s.navInputs());
    let gsCaptured = false;
    run(s, 900, () => {
      if (s.ap.vert === 'GS') gsCaptured = true;
      // slow down & configure on glideslope
      if (gsCaptured) {
        s.controls.flaps = 1;
        s.controls.throttle = 0.42;
      }
      return d().aglFt < 200 && gsCaptured;
    });
    expect(s.ap.lat).toBe('LOC');
    expect(gsCaptured).toBe(true);
    const r = runway('PARD', '27');
    const xt = crossTrackNm(r.end, r.threshold, s.ac.s) * FT_PER_NM;
    const at = alongTrackNm(r.end, r.threshold, s.ac.s);
    expect(Math.abs(xt)).toBeLessThan(150); // ft from centerline
    expect(at).toBeLessThan(r.lengthFt / FT_PER_NM + 1.5); // within 1.5 nm of threshold
    expect(Math.abs(s.nav1.gsDev)).toBeLessThan(0.4); // on glideslope (< ~1 dot)
    expect(s.ac.s.crashed).toBeNull();
  });

  it('flies a coupled RNAV LPV approach', () => {
    const s = new Sim(sc('rnav09'));
    s.weather.turbulence = 0;
    const d = () => s.ac.data;
    s.ap.toggleAp(d());
    s.ap.pressNav(d(), s.navInputs());
    s.ap.pressAlt(d());
    s.ap.altSel = 3000;
    s.ap.pressApr(d(), s.navInputs());
    let gp = false;
    run(s, 1500, () => {
      if (s.fp.wpts[s.fp.active].ident === 'WILLO' || s.fp.wpts[s.fp.active].ident === 'PERCH') {
        if (s.ap.vert === 'ALT' && s.ap.altHold > 3000) s.ap.pressVs(d()), (s.ap.vsSel = -500);
      }
      if (s.ap.vert === 'GP') gp = true;
      return gp && d().aglFt < 250;
    });
    expect(gp).toBe(true);
    const r = runway('PARD', '09');
    const xt = crossTrackNm(r.end, r.threshold, s.ac.s) * FT_PER_NM;
    expect(Math.abs(xt)).toBeLessThan(200);
    expect(Math.abs(s.fp.out.gpDev)).toBeLessThan(0.4);
  });
});
