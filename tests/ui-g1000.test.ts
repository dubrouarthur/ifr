import { describe, expect, it } from 'vitest';
import { drum, drumReading, secondaryTextScale, VSPEEDS, newPfdState, updatePfdFilters } from '../src/avionics/pfd';
import { LabelPlacer, drawMap, newMfdState, routeLegs } from '../src/avionics/mfd';
import { Sim, SCENARIOS } from '../src/sim/sim';
import { runway } from '../src/nav/data';
import { destination, distanceNm } from '../src/nav/geo';
import type { Waypoint } from '../src/nav/flightplan';

describe('G1000 rolling drums', () => {
  const ias = (v: number) => drumReading(drum(v, 1, 10), 1, 10);
  const alt = (v: number) => drumReading(drum(v, 20, 100), 20, 100);

  it('carries the tens digit of the airspeed (89.6 kt reads 90, not 80)', () => {
    expect(ias(89.6)).toBe(90);
    const d = drum(89.6, 1, 10);
    expect(d.hi).toBe(8);
    expect(d.hiFrac).toBeCloseTo(0.6, 5); // the tens drum is 60 % of the way from 8 to 9
    expect(ias(89.4)).toBe(89);
    expect(ias(99.7)).toBe(100);
    expect(ias(120)).toBe(120);
  });

  it('only rolls the upper digits during the last step of the low drum', () => {
    expect(drum(85.5, 1, 10).hiFrac).toBe(0);
    expect(drum(2950, 20, 100).hiFrac).toBe(0);
  });

  it('carries the hundreds of the altimeter (2999 ft reads 3000, not 2900)', () => {
    expect(alt(2999)).toBe(3000);
    const d = drum(2999, 20, 100);
    expect(d.hi).toBe(29);
    expect(d.low).toBe(80);
    expect(d.hiFrac).toBeCloseTo(0.95, 5);
    expect(alt(3000)).toBe(3000);
    expect(alt(2940)).toBe(2940);
    expect(alt(1011)).toBe(1020);
  });
});

describe('G1000 legibility and references', () => {
  it('scales secondary text when the screen is drawn small', () => {
    expect(secondaryTextScale(1024)).toBe(1);
    expect(secondaryTextScale(600)).toBe(1);
    expect(secondaryTextScale(420)).toBe(1.25);
  });
  it('orders the V-speed bugs like a C172 (Vr < Vx < Vg < Vy)', () => {
    expect(VSPEEDS.vr).toBeLessThan(VSPEEDS.vx);
    expect(VSPEEDS.vx).toBeLessThan(VSPEEDS.vg);
    expect(VSPEEDS.vg).toBeLessThan(VSPEEDS.vy);
  });
});

describe('MFD label placer', () => {
  it('tries the four quadrants and drops a label when all collide', () => {
    const p = new LabelPlacer({ x: 0, y: 0, w: 400, h: 400 });
    const a = p.place(200, 200, 40, 14, 6);
    expect(a).toEqual({ x: 206, y: 180, w: 40, h: 14 }); // NE first
    const b = p.place(200, 200, 40, 14, 6);
    expect(b).toEqual({ x: 206, y: 206, w: 40, h: 14 }); // then SE
    p.place(200, 200, 40, 14, 6); // NW
    p.place(200, 200, 40, 14, 6); // SW
    expect(p.place(200, 200, 40, 14, 6)).toBeNull();
  });
  it('keeps labels inside the map and clear of blocked boxes', () => {
    const p = new LabelPlacer({ x: 0, y: 0, w: 100, h: 100 });
    p.block({ x: 50, y: 0, w: 50, h: 50 });
    expect(p.place(95, 30, 30, 12, 5)).toBeNull(); // east is off the map, west is blocked
    const r = p.place(45, 30, 30, 12, 5)!;
    expect(r).toEqual({ x: 10, y: 13, w: 30, h: 12 }); // NW: the only free quadrant
  });
});

/** Canvas stand-in that records every filled path with its fill colour. */
function recordingCtx() {
  const fills: { color: string; pts: [number, number][] }[] = [];
  let path: [number, number][] = [];
  const state: Record<string, unknown> = { fillStyle: '#000' };
  const api: Record<string, unknown> = {
    beginPath: () => (path = []),
    moveTo: (x: number, y: number) => path.push([x, y]),
    lineTo: (x: number, y: number) => path.push([x, y]),
    fill: () => fills.push({ color: String(state.fillStyle), pts: path.slice() }),
    measureText: (t: string) => ({ width: t.length * 8, actualBoundingBoxAscent: 6, actualBoundingBoxDescent: 6 }),
  };
  const ctx = new Proxy(state, {
    get: (t, k: string) => (k in api ? api[k] : k in t ? t[k] : () => undefined),
    set: (t, k: string, v) => ((t[k] = v), true),
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fills };
}

describe('MFD / inset map runways', () => {
  const RW = ['#4a525b', '#d7dde3'];
  const check = (lat: number, lon: number, hdg: number, rangeNm: number, northUp: boolean, inset: boolean) => {
    const sim = new Sim(SCENARIOS.find((x) => x.id === 'rwy27')!);
    sim.ac.s.lat = lat;
    sim.ac.s.lon = lon;
    sim.ac.data.trackSmooth = hdg;
    sim.ac.data.hdgTrue = hdg;
    const st = newMfdState();
    st.terrain = false;
    st.northUp = northUp;
    const { ctx, fills } = recordingCtx();
    drawMap(ctx, sim, { x: 0, y: 0, w: 560, h: 660 }, rangeNm, inset, inset ? undefined : st);
    const quads = fills.filter((f) => RW.includes(f.color) && f.pts.length === 4);
    expect(quads.length).toBeGreaterThan(0);
    for (const { pts } of quads) {
      const v = (a: number, b: number) => [pts[b][0] - pts[a][0], pts[b][1] - pts[a][1]];
      const cross = (p: number[], q: number[]) => p[0] * q[1] - p[1] * q[0];
      const dot = (p: number[], q: number[]) => p[0] * q[0] + p[1] * q[1];
      const e0 = v(0, 1), e1 = v(1, 2), e2 = v(3, 2), e3 = v(0, 3);
      // opposite edges parallel and equal: straight-edged, never bent
      expect(Math.abs(cross(e0, e2))).toBeLessThan(1e-6 * (1 + Math.hypot(...e0) * Math.hypot(...e2)));
      expect(Math.abs(cross(e1, e3))).toBeLessThan(1e-6 * (1 + Math.hypot(...e1) * Math.hypot(...e3)));
      // right angles: a rectangle, not a skewed shape
      expect(Math.abs(dot(e0, e1))).toBeLessThan(1e-6 * (1 + Math.hypot(...e0) * Math.hypot(...e1)));
    }
    return quads;
  };
  const thr = runway('PARD', '27').threshold;
  it('draws runways as true rectangles at 0.5–5 NM, on the take-off roll and on final, north-up and track-up', () => {
    for (const range of [0.5, 1, 2, 5]) {
      for (const northUp of [true, false]) {
        check(thr.lat, thr.lon, 270, range, northUp, false); // take-off roll: on the threshold
        const fin = destination(thr, 90, Math.min(2, range * 0.6)); // on final, threshold on the map
        check(fin.lat, fin.lon, 272, range, northUp, false);
      }
      check(thr.lat, thr.lon, 270, range, false, true); // PFD inset
    }
  });
  it('keeps the runway on the map when the airport reference point is off screen', () => {
    const fin = destination(thr, 90, 0.55); // 0.5 NM range: the airport reference point is off the map
    const q = check(fin.lat, fin.lon, 270, 0.5, false, false);
    expect(q.length).toBeGreaterThan(0);
  });
});

describe('MFD route geometry', () => {
  const w = (lat: number, lon: number, ident: string, extra: Partial<Waypoint> = {}): Waypoint => ({ lat, lon, ident, ...extra });
  it('rounds a fly-by turn and overflies a fly-over point', () => {
    const a = w(47, 7, 'AAA');
    const b = w(47, 7.3, 'BBB');
    const c = w(47.2, 7.3, 'CCC');
    const flyBy = routeLegs([a, b, c], 100);
    // the turn at BBB starts before it: no point of the path is on the fix itself
    const all = [...flyBy[1], ...flyBy[2]];
    expect(Math.min(...all.map((p) => distanceNm(p, b)))).toBeGreaterThan(0.05);
    expect(flyBy[1].length).toBeGreaterThan(2); // curved, not a single corner
    const flyOver = routeLegs([a, { ...b, role: 'MAP' } as Waypoint, c], 100);
    expect(Math.min(...flyOver[1].map((p) => distanceNm(p, b)))).toBeLessThan(1e-6);
    // the legs join end to end
    expect(distanceNm(flyBy[1][flyBy[1].length - 1], flyBy[2][0])).toBeLessThan(1e-9);
  });
});

describe('PFD display filtering', () => {
  it('keeps the airspeed digits and trend vector steady in light turbulence', () => {
    const sim = new Sim(SCENARIOS.find((x) => x.id === 'ils27-vtf')!);
    sim.weather.turbulence = 0.25;
    const st = newPfdState();
    const dt = 1 / 30;
    for (let t = 0; t < 15; t += dt) {
      sim.step(dt);
      updatePfdFilters(st, sim);
    }
    const raw: number[] = [];
    const shown: number[] = [];
    let toggles = 0;
    let on = st.trendOn;
    for (let t = 0; t < 10; t += dt) {
      sim.step(dt);
      updatePfdFilters(st, sim);
      raw.push(sim.ac.data.iasKt);
      shown.push(st.iasF);
      if (st.trendOn !== on) toggles++;
      on = st.trendOn;
      expect(Number.isFinite(st.iasTrend)).toBe(true);
    }
    const jitter = (a: number[]) => {
      const d = a.slice(1).map((v, i) => v - a[i]);
      const m = d.reduce((x, y) => x + y, 0) / d.length;
      return Math.sqrt(d.reduce((x, y) => x + (y - m) ** 2, 0) / d.length);
    };
    expect(jitter(shown)).toBeLessThan(0.1); // kt per frame
    expect(jitter(shown)).toBeLessThanOrEqual(jitter(raw));
    expect(toggles).toBeLessThanOrEqual(4); // the trend vector never flickers
  });
  it('freezes while paused and snaps after a jump in time', () => {
    const sim = new Sim(SCENARIOS.find((x) => x.id === 'ils27-vtf')!);
    const st = newPfdState();
    sim.step(1 / 30);
    updatePfdFilters(st, sim);
    const v = st.iasF;
    updatePfdFilters(st, sim); // no sim time elapsed
    expect(st.iasF).toBe(v);
    sim.time += 30;
    updatePfdFilters(st, sim);
    expect(st.iasTrend).toBe(0);
    expect(st.iasF).toBe(sim.ac.data.iasKt);
  });
});
