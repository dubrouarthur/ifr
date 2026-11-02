import { describe, it, expect } from 'vitest';
import { Sim, SCENARIOS } from '../src/sim/sim';
import { findFix } from '../src/nav/data';
import { destination, distanceNm, bearingDeg } from '../src/nav/geo';

function setup(approachId: string, trans: string, iaf: string, fromBrg: number, alt: number) {
  const s = new Sim(SCENARIOS.find((x) => x.id === 'free'));
  s.weather.windKt = 0;
  s.weather.turbulence = 0;
  const f = findFix(iaf)!;
  const p = destination(f, fromBrg, 4);
  Object.assign(s.ac.s, { lat: p.lat, lon: p.lon, altFt: alt, psi: (bearingDeg(p, f) * Math.PI) / 180 });
  s.controls.trim = -0.25;
  s.loadApproach(approachId, trans, 'activate');
  s.ap.altSel = alt;
  s.ap.toggleAp(s.ac.data);
  s.ap.pressNav(s.ac.data, s.navInputs());
  s.ap.pressAlt(s.ac.data);
  return s;
}
const run = (s: Sim, sec: number, each: () => boolean | void) => {
  for (let t = 0; t < sec; t += 1 / 30) {
    s.step(1 / 30);
    if (each()) return true;
  }
  return false;
};

describe('classic procedures flown by the FMS/autopilot', () => {
  it('DME arc: stays within ±0.5 nm of the 10 DME arc from TOMAS to GALEN', () => {
    const s = setup('MSVL-V21', 'TOMAS (10 DME ARC)', 'TOMAS', 100, 4500);
    const msv = findFix('MSV')!;
    let maxErr = 0;
    let onArc = false;
    const reached = run(s, 900, () => {
      const to = s.fp.wpts[s.fp.active].ident;
      if (to === 'GALEN' && distanceNm(s.ac.s, findFix('TOMAS')!) > 2) onArc = true;
      if (onArc && to === 'GALEN') maxErr = Math.max(maxErr, Math.abs(distanceNm(s.ac.s, msv) - 10));
      return to === 'MSV';
    });
    expect(reached).toBe(true);
    expect(onArc).toBe(true);
    expect(maxErr).toBeLessThan(0.5);
  });

  it('procedure turn: outbound, 45°, back inbound to the FAF on course 270', () => {
    const s = setup('PARD-N27', 'PA (PROC TURN)', 'PA', 270, 2500);
    expect(s.fp.wpts.map((w) => w.ident).slice(0, 5)).toEqual(['PA', 'PT-OUT', 'PT-45', 'PT-IN', 'PA']);
    let maxDist = 0;
    const pa = findFix('PA')!;
    let sawIn = false;
    const reached = run(s, 900, () => {
      maxDist = Math.max(maxDist, distanceNm(s.ac.s, pa));
      if (s.fp.wpts[s.fp.active].ident === 'PT-IN') sawIn = true;
      return sawIn && s.fp.wpts[s.fp.active].ident === 'RW27';
    });
    expect(reached).toBe(true);
    expect(maxDist).toBeLessThan(10); // remain within 10 NM
    expect(Math.abs(((s.ac.data.trackTrue - 270 + 540) % 360) - 180)).toBeLessThan(15);
  });

  it('hold-in-lieu of PT at WILLO: one circuit then continues to PERCH', () => {
    const s = setup('PARD-R09', 'WILLO (HILPT)', 'WILLO', 90, 3000);
    let held = false;
    const reached = run(s, 1200, () => {
      if (s.fp.out.holding) held = true;
      return held && s.fp.wpts[s.fp.active].ident === 'PERCH';
    });
    expect(held).toBe(true);
    expect(reached).toBe(true);
    expect(Math.abs(((s.ac.data.trackTrue - 90 + 540) % 360) - 180)).toBeLessThan(25);
  });
});

import { runway } from '../src/nav/data';
import { crossTrackNm, FT_PER_NM } from '../src/nav/geo';

describe('new approaches', () => {
  for (const [id, sc, stopAgl, maxOff] of [['MSVL-I03', 'ils03', 300, 150], ['PARD-L36', 'lda36', 450, 400]] as const) {
    it(`${id}: coupled from a 10 NM final`, () => {
      const s = new Sim(SCENARIOS.find((x) => x.id === sc));
      s.weather.turbulence = 0;
      s.weather.gustKt = 0;
      s.reposition('final10');
      s.setCdi('NAV1');
      const d = () => s.ac.data;
      s.ap.toggleAp(d());
      s.ap.pressHdg(d());
      s.ap.pressAlt(d());
      s.ap.pressApr(d(), s.navInputs());
      let locked = false;
      run(s, 900, () => {
        if (s.ap.lat === 'LOC') locked = true;
        if (id === 'PARD-L36' && locked && s.ap.vert === 'ALT' && d().aglFt > 1200) {
          s.ap.altSel = 800;
          s.ap.pressVs(d());
          s.ap.vsSel = -450;
        }
        return locked && d().aglFt < stopAgl && (s.ap.vert === 'GS' || id === 'PARD-L36');
      });
      expect(locked).toBe(true);
      expect(Math.abs(s.nav1.dev)).toBeLessThan(0.15);
      if (id === 'MSVL-I03') {
        expect(s.ap.vert).toBe('GS');
        const r = runway('MSVL', '03');
        expect(Math.abs(crossTrackNm(r.threshold, r.end, s.ac.s) * FT_PER_NM)).toBeLessThan(maxOff);
      }
      expect(s.ac.s.crashed).toBeNull();
    });
  }
});
