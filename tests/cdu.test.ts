import { describe, it, expect } from 'vitest';
import { Sim, SCENARIOS } from '../src/sim/sim';
import { Cdu } from '../src/avionics/cdu';

const typeIn = (c: Cdu, s: string) => { for (const ch of s) c.type(ch); };
const text = (c: Cdu) => c.screen().map((l) => l.map((x) => x.t).join(' ')).join('\n');

describe('FMC CDU', () => {
  it('RTE: origin, destination, runway, VIA/TO, ARR approach, EXEC builds the flight plan', () => {
    const s = new Sim(SCENARIOS.find((x) => x.id === 'rwy27')!);
    const c = new Cdu(s);
    c.press('RTE');
    typeIn(c, 'PARD'); c.lsk('L', 1);
    typeIn(c, 'MSVL'); c.lsk('R', 1);
    typeIn(c, '27'); c.lsk('L', 2);
    expect(text(c)).toContain('RW27');
    c.press('NEXT PAGE');
    typeIn(c, 'SCREE'); c.lsk('R', 1);
    expect(text(c)).toContain('SCREE');
    c.press('DEP ARR');
    c.lsk('R', 2); // destination ARR
    expect(text(c)).toContain('ARRIVALS');
    // select the first approach and its first transition
    c.lsk('R', 1);
    c.lsk('L', 1);
    expect(c.mod).toBe(true);
    c.press('EXEC');
    expect(c.mod).toBe(false);
    expect(s.fp.wpts.map((w) => w.ident)).toContain('SCREE');
    expect(s.fp.approach?.airport).toBe('MSVL');
    c.press('LEGS');
    expect(text(c)).toContain('LEGS');
  });

  it('LEGS: direct-to via LSK 1L and EXEC', () => {
    const s = new Sim(SCENARIOS.find((x) => x.id === 'ils27-vtf')!);
    const c = new Cdu(s);
    c.press('LEGS');
    typeIn(c, 'ARD');
    c.lsk('L', 1);
    expect(c.mod).toBe(true);
    c.press('EXEC');
    expect(s.fp.wpts[s.fp.active].ident).toBe('ARD');
  });

  it('HOLD: hold at a fix with inbound course / turn and leg time', () => {
    const s = new Sim(SCENARIOS.find((x) => x.id === 'ils27-vtf')!);
    const c = new Cdu(s);
    c.press('HOLD');
    typeIn(c, 'ARD'); c.lsk('L', 6);
    typeIn(c, '090/L'); c.lsk('L', 3);
    typeIn(c, '1.5'); c.lsk('L', 4);
    expect(text(c)).toContain('090°/L TURN');
    c.press('EXEC');
    const w = s.fp.wpts[s.fp.active];
    expect(w.ident).toBe('ARD');
    expect(w.hold).toMatchObject({ inbound: 90, turn: 'L', legMin: 1.5 });
  });

  it('rejects unknown identifiers with a scratchpad message', () => {
    const s = new Sim(SCENARIOS[0]);
    const c = new Cdu(s);
    c.press('RTE');
    typeIn(c, 'ZZZZ');
    c.lsk('R', 1);
    expect(c.screen()[13][0].t).toBe('NOT IN DATA BASE');
    c.press('CLR');
    expect(c.screen()[13][0].t).toBe('ZZZZ');
  });
});
