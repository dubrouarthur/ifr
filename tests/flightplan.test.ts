import { describe, it, expect } from 'vitest';
import { FlightPlan, holdSteer } from '../src/nav/flightplan';
import { findFix } from '../src/nav/data';
import { destination } from '../src/nav/geo';

describe('flight plan', () => {
  it('loads an approach with transition and sequences legs', () => {
    const fp = new FlightPlan();
    fp.loadApproach('PARD-I27', 'TOBEY');
    expect(fp.wpts.map((w) => w.ident)).toEqual(['TOBEY', 'KEDDY', 'MARLO', 'RW27', 'ARD']);
    const tobey = findFix('TOBEY')!;
    fp.activateApproach(destination(tobey, 0, 10));
    expect(fp.wpts[fp.active].ident).toBe('TOBEY');
    // fly onto TOBEY -> sequence to KEDDY
    const out = fp.update({ ...destination(tobey, 0, 0.05), altFt: 4000 }, 100, 180);
    expect(out.toIdent).toBe('KEDDY');
  });
  it('suspends at the MAP until missed approach', () => {
    const fp = new FlightPlan();
    fp.loadApproach('PARD-I27', null);
    fp.vectorsToFinal();
    const rw = findFix('RW27')!;
    fp.activateLeg(fp.wpts.findIndex((w) => w.ident === 'RW27'));
    const o = fp.update({ ...destination(rw, 270, 0.3), altFt: 600 }, 90, 270);
    expect(o.suspended).toBe(true);
    expect(o.toIdent).toBe('RW27');
    fp.activateMissed();
    expect(fp.update({ ...destination(rw, 270, 0.3), altFt: 600 }, 90, 270).toIdent).toBe('ARD');
  });
});

describe('hold steering', () => {
  const fix = { lat: 47.5, lon: -35 };
  it('on the inbound course gives inbound track', () => {
    const p = destination(fix, 90, 0.8); // east of fix, inbound 270
    const h = holdSteer(fix, 270, 'R', 90, 1, p);
    expect(h.phase).toBe('inbound');
    expect(h.dtk).toBeCloseTo(270, 0);
    expect(Math.abs(h.xtk)).toBeLessThan(0.01);
  });
  it('outbound leg of a right hold lies to the north for inbound 270', () => {
    const R = 90 / (60 * Math.PI);
    const p = destination(destination(fix, 90, 0.8), 0, 2 * R);
    const h = holdSteer(fix, 270, 'R', 90, 1, p);
    expect(h.phase).toBe('outbound');
    expect(h.dtk).toBeCloseTo(90, 0);
  });
});
