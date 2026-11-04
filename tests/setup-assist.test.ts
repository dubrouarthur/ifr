// Setup assistant: the checklist tells the student exactly what to configure and ticks it off live.
import { describe, it, expect } from 'vitest';
import { Sim, SCENARIOS } from '../src/sim/sim';
import { holdSetup, approachSetup, entryInstruction } from '../src/train/setupAssist';
import { findFix, NAVAIDS } from '../src/nav/data';

const sim0 = () => {
  const s = new Sim();
  s.load(SCENARIOS.find((x) => x.id === 'ils27-vtf')!);
  return s;
};

describe('setup assistant', () => {
  it('hold at a VOR: NAV1 frequency, CDI on NAV1, CRS = inbound, altitude, entry — ticked as the student sets them', () => {
    const sim = sim0();
    const ard = findFix('ARD')!;
    const nav = NAVAIDS.find((n) => n.ident === 'ARD')!;
    const def = { fix: { ident: 'ARD', lat: ard.lat, lon: ard.lon }, inbound: 90, turn: 'R' as const, legMin: 1, altFt: 4000 };
    sim.av.cdi = 'GPS';
    sim.av.obs1 = 270;
    let items = holdSetup(sim, def);
    const byLabel = (re: RegExp) => items.find((i) => re.test(i.label))!;
    expect(byLabel(/^NAV1/).label).toContain(nav.freq.toFixed(2));
    expect(byLabel(/CDI on NAV1/).ok).toBe(false);
    expect(byLabel(/^CRS 090/).ok).toBe(false);
    expect(byLabel(/^ALT 4000/).ok).toBe(false);
    expect(items.some((i) => /^Entry: (Direct|Teardrop|Parallel)/.test(i.label))).toBe(true);
    // the student configures the radios
    sim.av.nav1.active = nav.freq;
    sim.setCdi('NAV1');
    sim.av.obs1 = 90;
    sim.ap.altSel = 4000;
    sim.step(0.1);
    items = holdSetup(sim, def);
    expect(byLabel(/CDI on NAV1/).ok).toBe(true);
    expect(byLabel(/^CRS 090/).ok).toBe(true);
    expect(byLabel(/^ALT 4000/).ok).toBe(true);
  });

  it('hold at an NDB: ADF tuned, BRG1 on ADF and the GPS overlay / CDI — none of it "All set" until the student sets it', () => {
    const sim = sim0();
    const pa = findFix('PA')!;
    const ndb = NAVAIDS.find((n) => n.ident === 'PA' && n.type === 'NDB')!;
    const def = { fix: { ident: 'PA', lat: pa.lat, lon: pa.lon }, inbound: 270, turn: 'R' as const, legMin: 1, altFt: 3000 };
    sim.av.bearing1 = 'OFF';
    sim.av.bearing2 = 'OFF';
    sim.autoCdi = false; // the scenario's ILS would otherwise switch the CDI back to LOC
    sim.setCdi('NAV1');
    let items = holdSetup(sim, def);
    const by = (re: RegExp) => items.find((i) => re.test(i.label))!;
    expect(by(/^ADF /).label).toContain(String(ndb.freq));
    expect(by(/^BRG1 on ADF/).ok).toBe(false);
    expect(by(/CDI on GPS/).ok).toBe(false);
    sim.av.adf.active = ndb.freq;
    sim.av.bearing1 = 'ADF';
    sim.setCdi('GPS');
    sim.step(0.1);
    items = holdSetup(sim, def);
    expect(by(/^ADF /).ok).toBe(true);
    expect(by(/^BRG1 on ADF/).ok).toBe(true);
    expect(by(/CDI on GPS/).ok).toBe(true);
    // without a GPS the inbound course goes on the course arrow as a reference
    sim.equip.gps = false;
    items = holdSetup(sim, def);
    expect(items.some((i) => /GPS/.test(i.label))).toBe(false);
    expect(by(/^CRS 270° \(inbound reference\)/)).toBeTruthy();
  });

  it('entry instructions follow AIM sectors with headings to fly', () => {
    const fix = { ident: 'X', lat: 0, lon: 0 };
    const def = { fix, inbound: 360, turn: 'R' as const, legMin: 1, altFt: 3000 };
    expect(entryInstruction(def, 360).entry).toBe('Direct');
    const t = entryInstruction(def, 230); // teardrop sector (AIM 5-3-8)
    expect(t.entry).toBe('Teardrop');
    expect(t.text).toContain('150°'); // outbound 180 − 30° into the holding side (right turns)
    expect(entryInstruction(def, 150).entry).toBe('Parallel');
  });

  it('hold at a GPS fix asks for the hold in the flight plan and the CDI on GPS', () => {
    const sim = sim0();
    const f = findFix('MARLO') ?? findFix('KEDDY')!;
    const def = { fix: { ident: f.ident, lat: f.lat, lon: f.lon }, inbound: 270, turn: 'L' as const, legMin: 1, altFt: 3000 };
    const items = holdSetup(sim, def);
    expect(items.some((i) => /GPS: hold at/.test(i.label))).toBe(true);
    expect(items.some((i) => /CDI on GPS/.test(i.label))).toBe(true);
  });

  it('ILS approach: LOC frequency, CRS, CDI NAV1, minimums, altimeter, missed approach', () => {
    const sim = sim0();
    sim.loadApproach('PARD-I27', null, 'load');
    const items = approachSetup(sim, 'PARD-I27');
    const labels = items.map((i) => i.label).join(' | ');
    expect(labels).toMatch(/NAV1 110\.30/);
    expect(labels).toMatch(/CRS 270/);
    expect(labels).toMatch(/Minimums DA/);
    expect(labels).toMatch(/Altimeter/);
    expect(labels).toMatch(/Missed approach/);
    expect(items.find((i) => /CRS 270/.test(i.label))!.ok).toBe(true); // loadApproach set it
  });
});
