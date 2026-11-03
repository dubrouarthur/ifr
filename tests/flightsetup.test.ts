import { describe, it, expect, beforeAll } from 'vitest';
import { Sim } from '../src/sim/sim';
import { validate } from '../src/train/circuits';
import { distanceNm } from '../src/nav/geo';
import { findFix } from '../src/nav/data';

beforeAll(() => {
  // the wizard module imports DOM helpers; give it a minimal localStorage
  (globalThis as unknown as { localStorage: Storage }).localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 } as Storage;
});

const load = async () => (await import('../src/train/setup')) as typeof import('../src/train/setup');

describe('flight setup wizard conversion', () => {
  it('route flight → valid circuit with route, hold and approach, equipment applied', async () => {
    const { defaultSetup, setupToCircuit } = await load();
    const st = defaultSetup();
    st.hold.enabled = true;
    st.hold.fix = 'SCREE';
    st.equipment.adf = false;
    const c = setupToCircuit(st);
    expect(validate(c)).toEqual([]);
    expect(c.legs.map((l) => l.type)).toEqual(['fix', 'fix', 'hold', 'approach']);
    expect(c.equipment?.adf).toBe(false);
    expect(c.start.type).toBe('runway');
  });

  it('approach on final starts on the final course below the FAF altitude', async () => {
    const { defaultSetup, setupToCircuit, setupStart } = await load();
    const st = defaultSetup();
    st.type = 'approach';
    st.start = 'final';
    st.final = { approachId: 'PARD-I27', distNm: 7 };
    const s = setupStart(st);
    expect(s.type).toBe('air');
    if (s.type === 'air') {
      expect(s.hdg).toBe(270);
      expect(s.bearing).toBe(90);
      expect(s.altFt).toBeGreaterThan(2000);
      expect(s.altFt).toBeLessThan(3200);
    }
    expect(validate(setupToCircuit(st))).toEqual([]);
  });

  it('free flight scenario loads route + approach and flies with the AP', async () => {
    const { defaultSetup, setupToScenario } = await load();
    const st = defaultSetup();
    st.start = 'air';
    st.air = { fix: 'ARD', bearing: 90, distNm: 10, altFt: 4000, iasKt: 100 };
    st.route = ['ARD'];
    st.equipment.ap = true;
    const sim = new Sim();
    sim.load(setupToScenario(st));
    expect(sim.ac.s.onGround).toBe(false);
    expect(sim.fp.out.valid).toBe(true);
    sim.setCdi('GPS');
    sim.ap.toggleAp(sim.ac.data);
    sim.ap.pressNav(sim.ac.data, sim.navInputs());
    const d0 = distanceNm(sim.ac.s, findFix('ARD')!);
    for (let t = 0; t < 120; t += 1 / 30) sim.step(1 / 30);
    expect(distanceNm(sim.ac.s, findFix('ARD')!)).toBeLessThan(d0 - 2);
    expect(sim.ac.s.crashed).toBeNull();
  });

  it('a no-GPS setup really has no GPS', async () => {
    const { defaultSetup, setupToScenario } = await load();
    const st = defaultSetup();
    st.type = 'hold';
    st.start = 'air';
    st.equipment = { gps: false, ap: false, adf: true, dme: true, nav2: true };
    const sim = new Sim();
    sim.load(setupToScenario(st));
    sim.step(0.1);
    expect(sim.equip.gps).toBe(false);
    expect(sim.av.cdi).not.toBe('GPS');
    expect(sim.ap.inhibited).toBe('NO AUTOPILOT');
  });
});

describe('stored plans from another session', () => {
  it('a plan referring to procedures that are not loaded is repaired, not thrown on', async () => {
    const { defaultSetup, setupToCircuit, sanitizeSetup } = await load();
    const st = { ...defaultSetup(), world: 'training' as const };
    st.arrival.approachId = 'LFPO-G06';
    st.final.approachId = 'LFPO-G06';
    st.rwy = { airport: 'LFPN', runway: '07L', initialAlt: 3000 };
    st.route = ['PO06I'];
    expect(() => setupToCircuit(st)).toThrow();
    sanitizeSetup(st);
    expect(() => setupToCircuit(st)).not.toThrow();
    expect(validate(setupToCircuit(st))).toEqual([]);
  });
});
