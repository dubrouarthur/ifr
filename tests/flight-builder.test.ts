// Flight builder (src/ui/circuitBuilder.ts over src/train/circuits.ts): route strings with SID / airway / STAR,
// events (failures and weather at a time, a leg or a fix), templates that build a valid flight anywhere.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import { Sim } from '../src/sim/sim';
import { LessonRun } from '../src/train/engine';

const realFetch = globalThis.fetch;
beforeAll(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 } as Storage;
  globalThis.fetch = (async (u: string) => {
    const p = `public${String(u)}`;
    return String(u).startsWith('/navdata/') && fs.existsSync(p) ? new Response(fs.readFileSync(p), { status: 200 }) : new Response('', { status: 404 });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const C = async () => import('../src/train/circuits');

describe('templates (training region)', () => {
  it('every template builds a valid flight that runs', async () => {
    const { TEMPLATES, validate, circuitToExercise } = await C();
    expect(TEMPLATES.map((t) => t.name)).toEqual(['Hold over a VOR', 'ILS with missed approach and hold', 'Partial panel NDB', 'Cross-country with SID/STAR', 'ACS mock checkride']);
    for (const t of TEMPLATES) {
      const c = t.build({ airport: 'PARD', dest: 'MSVL' });
      expect(c, t.name).toBeTruthy();
      expect(validate(c!), t.name).toEqual([]);
      const sim = new Sim();
      const run = new LessonRun(circuitToExercise(c!), sim);
      expect(run.rt.steps.length, t.name).toBeGreaterThan(0);
      for (let k = 0; k < 60; k++) run.update(0.05);
    }
  });
  it('the checkride template hides its failure from the briefing', async () => {
    const { TEMPLATES, circuitToExercise } = await C();
    const c = TEMPLATES.find((t) => t.id === 't-acs')!.build({ airport: 'PARD' })!;
    expect(c.mode).toBe('checkride');
    expect(c.failures.every((f) => f.hidden)).toBe(true);
    const ex = circuitToExercise(c);
    expect(ex.briefing.join(' ')).not.toMatch(/Autopilot fails/);
    expect(ex.briefing.join(' ')).toMatch(/Expect the unexpected/);
  });
});

describe('events', () => {
  it('failures and weather changes at a time, a leg and a fix survive a share link and fire in flight', async () => {
    const { PRESET_CIRCUITS, encodeCircuit, decodeCircuit, validate, circuitToExercise } = await C();
    const c = JSON.parse(JSON.stringify(PRESET_CIRCUITS[0]));
    c.failures = [
      { key: 'gs', trigger: 'fix', at: 0, fix: 'ARD', hidden: true },
      { key: 'ap', trigger: 'leg', at: 2 },
      { key: 'nav1', trigger: 'time', at: 0.01 },
    ];
    c.events = [{ kind: 'weather', trigger: 'time', at: 0.01, wx: { ceilingFt: 200, visibilitySm: 0.5 } }];
    expect(validate(c)).toEqual([]);
    const back = decodeCircuit(encodeCircuit(c));
    expect(back.failures).toEqual(c.failures);
    expect(back.events).toEqual(c.events);
    const sim = new Sim();
    const run = new LessonRun(circuitToExercise(back), sim);
    for (let k = 0; k < 40; k++) run.update(0.05);
    expect(sim.failures.nav1).toBe(true);
    expect(sim.weather.ceilingFt).toBe(200);
    expect(sim.failures.gs).toBe(false);
    c.failures[0].fix = 'NOPE';
    expect(validate(c).join(' ')).toMatch(/unknown fix/);
  });
  it('ATC amendments: cleared direct, cross at, hold at present position, change of approach', async () => {
    const { PRESET_CIRCUITS, validate, circuitToExercise, legText } = await C();
    const c = JSON.parse(JSON.stringify(PRESET_CIRCUITS[0]));
    c.legs = [
      { type: 'fix', ident: 'ARD', alt: 3000, atc: 'direct' },
      { type: 'hold', ident: 'PPOS', inbound: 270, turn: 'R', legMin: 1, alt: 3000, laps: 1, ppos: true },
      { type: 'fix', ident: 'KEDDY', alt: 3000, atc: 'cross' },
      { type: 'approach', approachId: 'PARD-I27', transition: null, outcome: 'land', change: true },
    ];
    expect(validate(c)).toEqual([]);
    expect(legText(c.legs[1])).toMatch(/present position/);
    const steps = new LessonRun(circuitToExercise(c), new Sim()).rt.steps.map((s) => s.text).join('\n');
    expect(steps).toMatch(/Cleared direct ARD/);
    expect(steps).toMatch(/Hold at present position/);
    expect(steps).toMatch(/Cross KEDDY at 3000/);
    expect(steps).toMatch(/Amended clearance/);
  });
});

describe('real world: KSFO → KSJC', () => {
  it('a route string with a SID, an airway and a STAR builds a valid flight with the ILS 12R', async () => {
    const { loadRegion, leaveRealWorld } = await import('../src/nav/world');
    const { findFix } = await import('../src/nav/data');
    const { applyRoute, routeString, validate, expandLegs, circuitToExercise, TEMPLATES } = await C();
    const { planProfile } = await import('../src/ui/routeMap');
    await loadRegion(['KSFO', 'KSJC']);
    const c = TEMPLATES.find((t) => t.id === 't-xc')!.build({ airport: 'KSFO', dest: 'KSJC' })!;
    expect(validate(c)).toEqual([]);
    c.start = { type: 'runway', airport: 'KSFO', runway: '28L', initialAlt: 5000 };
    c.legs = [{ type: 'approach', approachId: 'KSJC-I12R', transition: 'HITIR', outcome: 'land' }];
    c.cruise = 7000;
    const res = applyRoute(c, 'KSFO GAPP7.SAU V150 SAC SAC.PYE3 KSJC');
    expect(res.errors).toEqual([]);
    expect(c.legs.map((l) => l.type)).toEqual(['sid', 'fix', 'star', 'approach']);
    expect(c.legs[1]).toMatchObject({ type: 'fix', ident: 'SAC', via: 'V150' });
    expect(validate(c)).toEqual([]);
    // the airway is flown fix by fix, each with its MEA; the plan reads back as the same route
    const flat = expandLegs(c);
    const airway = flat.filter((l) => l.src === 1);
    expect(airway.length).toBeGreaterThan(2);
    expect(airway.every((l) => (l as { mea?: number }).mea! > 0)).toBe(true);
    for (const l of flat) if (l.type === 'fix') expect(findFix(l.ident), l.ident).toBeTruthy();
    expect(routeString(c)).toBe('KSFO GAPP7.SAU V150 SAC SAC.PYE3 KSJC');
    const p = planProfile(c, false);
    expect(p.mea?.length).toBeGreaterThan(0);
    expect(p.pts.some((x) => x.amin !== undefined || x.amax !== undefined)).toBe(true);
    expect(p.gp?.angle).toBeGreaterThan(2.5);
    // flyable: the exercise starts on the runway with the clearance via the SID
    const sim = new Sim();
    const run = new LessonRun(circuitToExercise(c), sim);
    expect(run.rt.clearance).toMatch(/GAPP7 departure/);
    expect(sim.ac.s.onGround).toBe(true);
    for (let k = 0; k < 40; k++) run.update(0.05);
    // an unknown token is reported, nothing is changed
    const before = JSON.stringify(c.legs);
    expect(applyRoute(c, 'KSFO GAPP7.SAU V150 NOPE KSJC').errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(c.legs)).toBe(before);
    leaveRealWorld();
  }, 60000);
  it('templates build valid real-world flights at KSJC', async () => {
    const { loadRegion, leaveRealWorld } = await import('../src/nav/world');
    const { TEMPLATES, validate } = await C();
    await loadRegion(['KSFO', 'KSJC']);
    for (const t of TEMPLATES) {
      const c = t.build({ airport: 'KSFO', dest: 'KSJC' });
      expect(c, t.name).toBeTruthy();
      expect(validate(c!), t.name).toEqual([]);
      expect(c!.world, t.name).toBe('real');
      // an airborne start still names its airport (the builder shows its start card, not a departure search)
      expect(c!.dep ?? (c!.start.type === 'runway' ? c!.start.airport : undefined), t.name).toBeTruthy();
    }
    leaveRealWorld();
  }, 60000);
  it('the profile of a direct flight climbs to the initial altitude; the ATIS names the approach ATC picks', async () => {
    const { loadRegion, leaveRealWorld } = await import('../src/nav/world');
    const { planProfile } = await import('../src/ui/routeMap');
    const { approachInUse, atisText } = await import('../src/ui/atis');
    await loadRegion(['KSFO', 'KSJC']);
    const { newCircuit } = await C();
    const c = { ...newCircuit(), world: 'real' as const, dep: 'KSFO', dest: 'KSJC', start: { type: 'runway' as const, airport: 'KSFO', runway: '28R', initialAlt: 3000 },
      legs: [{ type: 'approach' as const, approachId: 'KSJC-I12R', transition: 'HITIR', outcome: 'land' as const }] };
    const p = planProfile(c, false);
    // before the first approach fix the aircraft is at (at least) the assigned 3000 ft, not still on the runway
    const iaf = p.pts.findIndex((x) => x.leg === 0);
    expect(p.pts[iaf].alt).toBeGreaterThanOrEqual(3000);
    const w = { ceilingFt: 800, visibilitySm: 2, windDir: 300, windKt: 12, gustKt: 0, turbulence: 0.1, oatSeaLevelC: 15, qnh: 29.92 } as never;
    const ap = approachInUse('KSJC', w)!;
    expect(atisText('KSJC', w)).toContain(`${ap.name} approach in use`);
    leaveRealWorld();
  }, 60000);
});
