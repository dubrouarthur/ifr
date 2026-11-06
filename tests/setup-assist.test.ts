// Setup assistant: the checklist tells the student exactly what to configure and ticks it off live.
import { describe, it, expect } from 'vitest';
import { Sim, SCENARIOS } from '../src/sim/sim';
import { holdSetup, approachSetup, entryInstruction, vorSetup, setAllRemaining, setSetupHelp, type SetupItem } from '../src/train/setupAssist';
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
    const t = entryInstruction(def, 150); // teardrop sector (AIM FIG 5-3-8): along the outbound course
    expect(t.entry).toBe('Teardrop');
    expect(t.text).toContain('150°'); // outbound 180 − 30° into the holding side (right turns)
    expect(entryInstruction(def, 230).entry).toBe('Parallel'); // from the holding side
    expect(entryInstruction(def, 90).entry).toBe('Direct'); // from the non-holding side, 90° right turn
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

// one-tap setup help: every settable item has an action, the action makes it ok, and the debrief knows
const helpLog = (sim: Sim) => sim.rec.events.filter((e) => e.text.startsWith('Set up with help:')).map((e) => e.text);
/** runs each to-do item's action alone and checks that this item (same label) is ok right after */
function everyActionFixesItsItem(sim: Sim, build: () => SetupItem[]) {
  const first = build();
  const todo = first.filter((i) => i.ok === false);
  expect(todo.length).toBeGreaterThan(0);
  for (const i of todo) {
    const now = build().find((x) => x.label === i.label)!;
    if (now.ok) continue; // a previous action already set it (CDI on a localizer slews the course)
    expect(now.action, `${i.label} has a one-tap action`).toBeTruthy();
    const before = helpLog(sim).length;
    now.action!.run(sim);
    expect(build().find((x) => x.label === i.label)!.ok, `${i.label} ok after "${now.action!.label}"`).toBe(true);
    expect(helpLog(sim).length).toBe(before + 1);
    expect(helpLog(sim).at(-1)).toMatch(/^Set up with help: /);
  }
  expect(build().filter((i) => i.ok === false && i.action)).toEqual([]);
}

describe('setup assistant: one-tap actions', () => {
  it('hold at a VOR: NAV1 is tuned like a pilot (standby, then swap), CDI, CRS and ALT are set', () => {
    const sim = sim0();
    const ard = findFix('ARD')!;
    const nav = NAVAIDS.find((n) => n.ident === 'ARD')!;
    const def = { fix: { ident: 'ARD', lat: ard.lat, lon: ard.lon }, inbound: 90, turn: 'R' as const, legMin: 1, altFt: 4000 };
    sim.av.nav1.active = 108.1;
    sim.autoCdi = false;
    sim.setCdi('GPS');
    sim.av.obs1 = 270;
    sim.ap.altSel = 3000;
    sim.updateAvionics(0);
    const nav1 = holdSetup(sim, def).find((i) => /^NAV1/.test(i.label))!;
    expect(nav1.action!.label).toBe('Tune');
    nav1.action!.run(sim);
    expect(sim.av.nav1.active).toBeCloseTo(nav.freq, 2);
    expect(sim.av.nav1.standby).toBeCloseTo(108.1, 2); // the old frequency stays in standby
    expect(helpLog(sim)).toEqual([`Set up with help: NAV1 ${nav.freq.toFixed(2)} (ARD)`]);
    everyActionFixesItsItem(sim, () => holdSetup(sim, def));
    expect(sim.av.cdi).toBe('NAV1');
    expect(sim.av.obs1).toBe(90);
    expect(sim.ap.altSel).toBe(4000);
    // information lines and the speed (flown, not set) have no action
    for (const i of holdSetup(sim, def).filter((x) => x.ok === null || /speed/.test(x.label))) expect(i.action).toBeUndefined();
  });

  it('hold at an NDB with a GPS: ADF, BRG1 on ADF, the GPS hold loaded and the CDI on GPS', () => {
    const sim = sim0();
    const pa = findFix('PA')!;
    const def = { fix: { ident: 'PA', lat: pa.lat, lon: pa.lon }, inbound: 270, turn: 'R' as const, legMin: 1, altFt: 3000 };
    sim.av.adf.active = 200;
    sim.av.bearing1 = 'OFF';
    sim.av.bearing2 = 'OFF';
    sim.autoCdi = false;
    sim.setCdi('NAV1');
    sim.updateAvionics(0);
    everyActionFixesItsItem(sim, () => holdSetup(sim, def));
    expect(sim.av.bearing1).toBe('ADF');
    const w = sim.fp.wpts.find((x) => x.ident === 'PA' && x.hold)!;
    expect(w.hold).toMatchObject({ inbound: 270, turn: 'R', legMin: 1 });
    // without a GPS: the inbound course on the course arrow
    const sim2 = sim0();
    sim2.equip.gps = false;
    sim2.av.obs1 = 10;
    everyActionFixesItsItem(sim2, () => holdSetup(sim2, def));
    expect(sim2.av.obs1).toBe(270);
  });

  it('hold at a GPS fix: the hold is loaded in the flight plan', () => {
    const sim = sim0();
    const f = findFix('MARLO') ?? findFix('KEDDY')!;
    const def = { fix: { ident: f.ident, lat: f.lat, lon: f.lon }, inbound: 270, turn: 'L' as const, legMin: 1, altFt: 3000 };
    sim.autoCdi = false;
    sim.setCdi('NAV1');
    everyActionFixesItsItem(sim, () => holdSetup(sim, def));
    expect(sim.fp.wpts.some((w) => w.ident === f.ident && w.hold?.turn === 'L')).toBe(true);
  });

  it('ILS: LOC frequency, CRS, CDI on NAV1, minimums and the current altimeter setting', () => {
    const sim = sim0();
    sim.av.nav1.active = 114.2;
    sim.av.obs1 = 90;
    sim.autoCdi = false;
    sim.setCdi('GPS');
    sim.av.minimums = null;
    sim.av.baro = 29.92;
    sim.weather.qnh = 30.12;
    sim.updateAvionics(0);
    everyActionFixesItsItem(sim, () => approachSetup(sim, 'PARD-I27'));
    expect(sim.av.nav1.active).toBeCloseTo(110.3, 2);
    expect(sim.av.baro).toBeCloseTo(30.12, 2);
    expect(sim.av.minimums).toBeGreaterThan(0);
  });

  it('RNAV: the approach is loaded and the CDI on GPS; VOR approach and NDB approach set their radios', () => {
    const sim = sim0();
    sim.autoCdi = false;
    sim.setCdi('NAV1');
    sim.av.minimums = null;
    everyActionFixesItsItem(sim, () => approachSetup(sim, 'PARD-R09'));
    expect(sim.fp.approachId).toBe('PARD-R09');
    const vor = sim0();
    vor.av.nav1.active = 108.1;
    vor.av.obs1 = 1;
    vor.autoCdi = false;
    vor.setCdi('GPS');
    everyActionFixesItsItem(vor, () => approachSetup(vor, 'MSVL-V21'));
    const ndb = sim0();
    ndb.av.adf.active = 200;
    ndb.av.bearing1 = 'OFF';
    ndb.av.bearing2 = 'OFF';
    ndb.av.minimums = null;
    everyActionFixesItsItem(ndb, () => approachSetup(ndb, 'PARD-N27'));
  });

  it('VOR tracking: NAV1, CDI and course', () => {
    const sim = sim0();
    sim.av.nav1.active = 108.1;
    sim.av.obs1 = 1;
    sim.autoCdi = false;
    sim.setCdi('GPS');
    sim.updateAvionics(0);
    everyActionFixesItsItem(sim, () => vorSetup(sim, 'ARD', 45));
    expect(sim.av.obs1).toBe(45);
  });

  it('"Set all remaining" sets every to-do item in one tap and logs one line', () => {
    const sim = sim0();
    sim.av.nav1.active = 114.2;
    sim.av.obs1 = 90;
    sim.autoCdi = false;
    sim.setCdi('GPS');
    sim.av.minimums = null;
    sim.av.baro = 29.92;
    sim.weather.qnh = 30.12;
    sim.updateAvionics(0);
    const items = approachSetup(sim, 'PARD-I27');
    const todo = items.filter((i) => i.ok === false).length;
    expect(todo).toBeGreaterThanOrEqual(4);
    expect(setAllRemaining(sim, items)).toBe(todo);
    expect(approachSetup(sim, 'PARD-I27').filter((i) => i.ok === false)).toEqual([]);
    const log = helpLog(sim);
    expect(log.length).toBe(1);
    expect(log[0]).toContain('NAV1 110.30');
    expect(log[0]).toContain('Minimums');
    expect(setAllRemaining(sim, approachSetup(sim, 'PARD-I27'))).toBe(0); // nothing left: no new line
    expect(helpLog(sim).length).toBe(1);
  });

  it('no help in a checkride or a test: the items carry no action', () => {
    const sim = sim0();
    sim.av.nav1.active = 114.2;
    sim.assess.mode = 'checkride';
    expect(approachSetup(sim, 'PARD-I27').some((i) => i.action)).toBe(false);
    sim.assess.mode = 'training';
    expect(approachSetup(sim, 'PARD-I27').some((i) => i.action)).toBe(true);
    setSetupHelp(false);
    try {
      expect(approachSetup(sim, 'PARD-I27').some((i) => i.action)).toBe(false);
      expect(setAllRemaining(sim, approachSetup(sim, 'PARD-I27'))).toBe(0);
    } finally {
      setSetupHelp(true);
    }
  });
});
