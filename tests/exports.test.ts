import { describe, it, expect } from 'vitest';
import { Sim, SCENARIOS } from '../src/sim/sim';
import { garminFpl, xplaneFms, msfsPln, routeGpx, trackGpx, trackKml, trackCsv } from '../src/connect/exports';

describe('exports', () => {
  const s = new Sim(SCENARIOS.find((x) => x.id === 'ils27-full'));
  for (let i = 0; i < 30 * 20; i++) s.step(1 / 30);
  it('flight plan formats contain every waypoint', () => {
    const ids = [...new Set(s.fp.wpts.map((w) => w.ident))];
    const fpl = garminFpl(s.fp);
    const fms = xplaneFms(s.fp, 4000);
    const pln = msfsPln(s.fp, 4000);
    const gpx = routeGpx(s.fp);
    for (const id of ids) {
      expect(fpl).toContain(`<identifier>${id}</identifier>`);
      expect(fms).toContain(` ${id} DRCT `);
      expect(pln).toContain(`id="${id}"`);
      expect(gpx).toContain(`<name>${id}</name>`);
    }
    expect(fms).toMatch(/^I\n1100 Version\n/);
    expect(fms).toContain(`NUMENR ${s.fp.wpts.filter((w, i, a) => i === 0 || w.ident !== a[i - 1].ident).length}`);
    expect(pln).toContain('<FPType>IFR</FPType>');
    expect(fpl).toContain('xmlns="http://www8.garmin.com/xmlschemas/FlightPlan/v1"');
  });
  it('track formats contain the recorded samples', () => {
    const n = s.rec.samples.length;
    expect(n).toBeGreaterThan(20);
    expect((trackGpx(s.rec.samples, new Date().toISOString()).match(/<trkpt /g) ?? []).length).toBe(n);
    expect(trackKml(s.rec.samples)).toContain('<altitudeMode>absolute</altitudeMode>');
    expect(trackCsv(s.rec.samples).split('\n')).toHaveLength(n + 1);
  });
});
