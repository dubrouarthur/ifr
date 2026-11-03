// "Plan a flight" wizard: flight type, aircraft & instruments, departure, route & arrival, weather & time,
// training options and a briefing — with a live summary and route map.
import { h, clear, store } from './dom';
import { Modal, WX_PRESETS } from './modals';
import { FIXES, APPROACHES, AIRPORTS, approach as getApproach, findFix } from '../nav/data';
import { FAILURE_LABELS, fullEquipment, type Equipment, type Failures, type Scenario } from '../sim/sim';
import type { Weather } from '../sim/environment';
import { circuitPath, circuitStats, validate, circuitStore, type Circuit, type CircuitLeg } from '../train/circuits';
import { defaultSetup, setupToCircuit, setupToScenario, type FlightSetupState, type FlightType, type StartKind } from '../train/setup';
export type { FlightSetupState, FlightType } from '../train/setup';
import { racetrack } from '../nav/holding';
import { toLocal, type LatLon } from '../nav/geo';
import { approachPlate } from '../plates/plates';
import { atisText } from './weather';
import { loadRegion, leaveRealWorld, currentRegion, searchAirports, FLAG_PROC, FLAG_ILS } from '../nav/world';

const STEPS = ['Flight type', 'Aircraft & instruments', 'Departure', 'Route & arrival', 'Weather & time', 'Training options', 'Briefing'] as const;
const EQUIP_PRESETS: { name: string; desc: string; eq: Equipment; cockpit?: 'g1000' | 'steam' | 'airliner' }[] = [
  { name: 'Fully equipped', desc: 'GPS/WAAS, autopilot, 2 NAV, DME, ADF', eq: fullEquipment() },
  { name: 'Classic IFR', desc: '2 NAV, DME, ADF — no GPS, no autopilot', eq: { gps: false, ap: false, adf: true, dme: true, nav2: true }, cockpit: 'steam' },
  { name: 'Basic trainer', desc: '1 NAV, no DME, no ADF, no GPS, no autopilot', eq: { gps: false, ap: false, adf: false, dme: false, nav2: false }, cockpit: 'steam' },
  { name: 'GPS, no autopilot', desc: 'Hand-flown glass with GPS', eq: { gps: true, ap: false, adf: true, dme: true, nav2: true } },
];
const fixIds = () => [...new Set(FIXES.filter((f) => f.kind !== 'runway').map((f) => f.ident))].sort();
const pad3 = (n: number) => String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, '0');

// ------------------------------------------------------------------ wizard
export interface SetupHooks {
  flyGraded: (c: Circuit, st: FlightSetupState) => void;
  flyFree: (sc: Scenario, st: FlightSetupState) => void;
  openChart: (id: string) => void;
  /** the nav database / terrain changed (real-world region loaded or left) */
  regionChanged: () => void;
}

export class FlightSetup extends Modal {
  st: FlightSetupState = store.get('ifr.setup.v1', defaultSetup());
  private step = 0;
  private nav!: HTMLElement;
  private main!: HTMLElement;
  private side!: HTMLElement;

  constructor(private hooks: SetupHooks) {
    super('Plan a flight');
    this.box.classList.add('fs');
    clear(this.body);
    this.nav = h('nav', { class: 'fs-nav' });
    this.main = h('section', { class: 'fs-main' });
    this.side = h('aside', { class: 'fs-side' });
    this.body.append(h('div', { class: 'fs-grid' }, this.nav, this.main, this.side));
    // merge older stored setups with new defaults
    this.st = { ...defaultSetup(), ...this.st, equipment: { ...fullEquipment(), ...(this.st.equipment ?? {}) } };
  }

  start(type?: FlightType) {
    if (type) this.applyType(type);
    this.step = type ? 1 : 0;
    this.render();
    this.open();
  }

  private save() {
    store.set('ifr.setup.v1', this.st);
  }
  private changed(full = true) {
    this.save();
    if (full) this.renderMain();
    this.renderSide();
    this.renderNav();
    this.renderFoot();
  }

  private applyType(t: FlightType) {
    const st = this.st;
    st.type = t;
    if (t === 'approach') {
      st.start = 'final';
      st.arrival.outcome = 'land';
      st.hold.enabled = false;
    } else if (t === 'hold') {
      st.start = 'air';
      st.air = { fix: st.hold.fix, bearing: 45, distNm: 10, altFt: st.hold.alt, iasKt: 90 };
    } else if (t === 'route') {
      st.start = 'runway';
    } else if (t === 'free') {
      st.start = 'air';
      st.graded = false;
    }
  }

  private visibleSteps(): number[] {
    return STEPS.map((_, i) => i);
  }

  render() {
    this.renderNav();
    this.renderMain();
    this.renderSide();
    this.renderFoot();
  }

  private renderNav() {
    clear(this.nav);
    this.visibleSteps().forEach((i) => {
      this.nav.append(h('button', { class: `fs-step${i === this.step ? ' on' : ''}${i < this.step ? ' done' : ''}`, onclick: () => { this.step = i; this.render(); } }, h('span', { class: 'n' }, i < this.step ? '✓' : String(i + 1)), h('span', {}, STEPS[i])));
    });
    this.nav.append(h('div', { class: 'fs-sec' }, 'Shortcuts'), h('button', { class: 'fs-step', onclick: () => { this.st = defaultSetup(); this.step = 0; this.changed(); } }, h('span', { class: 'n' }, '↺'), h('span', {}, 'Reset to defaults')));
  }

  // ---------------------------------------------------------------- helpers
  private sel<T extends string>(value: T, opts: [T, string][], on: (v: T) => void, full = true) {
    const s = h('select', {}, ...opts.map(([v, l]) => h('option', { value: v, selected: v === value }, l))) as HTMLSelectElement;
    s.addEventListener('change', () => { on(s.value as T); this.changed(full); });
    return s;
  }
  private num(v: number, on: (x: number) => void, o: { min: number; max: number; step: number }) {
    const i = h('input', { type: 'number', value: v, min: o.min, max: o.max, step: o.step }) as HTMLInputElement;
    i.addEventListener('change', () => { on(Math.max(o.min, Math.min(o.max, Number(i.value)))); this.changed(false); });
    i.addEventListener('keydown', (e) => e.stopPropagation());
    return i;
  }
  private f(label: string, ...els: (HTMLElement | string)[]) {
    return h('label', { class: 'cb-f' }, h('span', {}, label), ...els);
  }
  private choice<T>(cur: T, items: { v: T; title: string; desc: string; icon?: string; cls?: string }[], on: (v: T) => void, cls = '') {
    return h('div', { class: `fs-choices ${cls}` }, ...items.map((it) => h('button', { class: `fs-choice${it.cls ? ' ' + it.cls : ''}${it.v === cur ? ' on' : ''}`, onclick: () => { on(it.v); this.changed(); } }, it.icon ? h('span', { class: 'ic' }, it.icon) : null, h('b', {}, it.title), h('span', {}, it.desc))));
  }
  private fixSel(v: string, on: (x: string) => void) {
    const i = h('input', { type: 'text', value: v, list: 'fs-fixes', spellcheck: 'false', style: 'text-transform:uppercase;width:130px' }) as HTMLInputElement;
    i.addEventListener('keydown', (e) => e.stopPropagation());
    i.addEventListener('change', () => {
      const x = i.value.trim().toUpperCase();
      if (findFix(x)) { on(x); this.changed(); } else i.classList.add('bad');
    });
    return h('span', {}, i, this.fixList());
  }
  private fixList() {
    const old = document.getElementById('fs-fixes');
    if (old) return h('span', {});
    return h('datalist', { id: 'fs-fixes' }, ...fixIds().map((f) => h('option', { value: f }, `${findFix(f)!.kind}`)));
  }
  private loadedKey = '';
  private loading = false;
  private loadErr = '';
  /** load (or leave) the real-world region for the chosen airports */
  private async ensureRegion(force = false) {
    const st = this.st;
    if (st.world !== 'real') {
      if (currentRegion()) { leaveRealWorld(); this.loadedKey = ''; this.hooks.regionChanged(); }
      return;
    }
    const key = `${st.dep}|${st.arr}`;
    if (!force && key === this.loadedKey && currentRegion()) return;
    this.loading = true;
    this.loadErr = '';
    this.render();
    try {
      const r = await loadRegion([st.dep, st.arr].filter(Boolean));
      this.loadedKey = key;
      // sensible defaults from the real data
      const dep = AIRPORTS.find((a) => a.icao === st.dep);
      if (dep) {
        const best = [...dep.runways].sort((a, b) => b.lengthFt - a.lengthFt)[0];
        if (!dep.runways.some((x) => x.id === st.rwy.runway) || st.rwy.airport !== dep.icao) st.rwy = { airport: dep.icao, runway: best.id, initialAlt: Math.max(3000, Math.ceil((dep.elevFt + 2500) / 500) * 500) };
      }
      const arrApps = APPROACHES.filter((a) => a.airport === st.arr);
      const pref = arrApps.find((a) => a.type === 'ILS') ?? arrApps[0];
      if (pref && !arrApps.some((a) => a.id === st.arrival.approachId)) {
        st.arrival = { approachId: pref.id, transition: pref.transitions[0]?.name ?? null, outcome: st.arrival.outcome };
        st.final = { approachId: pref.id, distNm: st.final.distNm };
      }
      if (!findFix(st.air.fix)) st.air.fix = st.arr || st.dep;
      if (!findFix(st.hold.fix)) st.hold.fix = pref?.missed[pref.missed.length - 1]?.fix.ident ?? st.arr;
      st.route = st.route.filter((f) => findFix(f));
      document.getElementById('fs-fixes')?.remove();
      this.toast?.(`Real-world region loaded: ${r.airports.length} airports · ${r.approaches} approaches · mag var ${r.magVar.toFixed(1)}°`);
      this.hooks.regionChanged();
    } catch (e) {
      this.loadErr = String((e as Error).message || e);
    } finally {
      this.loading = false;
      this.save();
      this.render();
    }
  }
  private airportPicker(label: string, value: string, on: (icao: string) => void) {
    const wrap = h('div', { class: 'ap-pick' });
    const inp = h('input', { type: 'text', value, placeholder: 'ICAO, name or city', spellcheck: 'false', autocomplete: 'off' }) as HTMLInputElement;
    const res = h('div', { class: 'ap-res' });
    let tmr = 0;
    const run = async () => {
      const rows = await searchAirports(inp.value, 8);
      clear(res);
      for (const r of rows)
        res.append(h('button', { type: 'button', onmousedown: (e: Event) => { e.preventDefault(); inp.value = r[0]; clear(res); on(r[0]); } },
          h('b', {}, r[0]), h('span', {}, `${r[1]}${r[2] ? ' · ' + r[2] : ''} · ${r[3]}`), r[7] & FLAG_PROC ? h('em', {}, r[7] & FLAG_ILS ? 'ILS · RNAV' : 'IAP') : null));
    };
    inp.addEventListener('input', () => { clearTimeout(tmr); tmr = window.setTimeout(run, 120); });
    inp.addEventListener('focus', run);
    inp.addEventListener('blur', () => setTimeout(() => clear(res), 150));
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { const v = inp.value.trim().toUpperCase(); if (/^[A-Z0-9]{3,4}$/.test(v)) { clear(res); on(v); } } });
    wrap.append(h('span', { class: 'lbl' }, label), inp, res);
    return wrap;
  }

  private h2(t: string, sub: string) {
    return h('div', { class: 'fs-h' }, h('h2', {}, t), h('p', { class: 'muted' }, sub));
  }

  // ---------------------------------------------------------------- steps
  private renderMain() {
    clear(this.main);
    const st = this.st;
    switch (this.step) {
      case 0:
        this.main.append(this.h2('What kind of flight?', 'Pick a type — every following step adapts to it. You can fly at any time from the bottom bar.'));
        this.main.append(this.choice(st.type, [
          { v: 'route' as FlightType, cls: 'ft-route', icon: '🧭', title: 'IFR flight A → B', desc: 'Depart, fly a route you build fix by fix, then an approach at the destination.' },
          { v: 'approach' as FlightType, cls: 'ft-approach', icon: '🛬', title: 'Approach practice', desc: 'Start on final or before the IAF and fly one approach — ILS, LOC, LDA, VOR, NDB, RNAV.' },
          { v: 'hold' as FlightType, cls: 'ft-hold', icon: '🔁', title: 'Holding practice', desc: 'Any fix, any inbound course, left or right turns, with the entry to work out.' },
          { v: 'free' as FlightType, cls: 'ft-free', icon: '✈️', title: 'Free flight', desc: 'Start anywhere with your aircraft and weather. No plan, no grading.' },
        ], (v) => this.applyType(v), 'big'));
        {
          const saved = circuitStore.list();
          if (saved.length) this.main.append(h('p', { class: 'muted', style: 'margin-top:16px;font-size:12.5px' }, `You also have ${saved.length} saved IFR circuit(s) in the Flight Center → IFR circuits.`));
        }
        break;
      case 1: {
        this.main.append(this.h2('Aircraft & instruments', 'Choose the panel and what is actually installed. Missing equipment is really missing: no GPS means VOR/NDB navigation only.'));
        this.main.append(h('div', { class: 'section-t' }, 'Cockpit'));
        this.main.append(this.choice(st.cockpit, [
          { v: 'g1000' as const, cls: 'ck-g1000', icon: '🖥️', title: 'G1000 glass', desc: 'PFD + MFD, synthetic vision, GFC 700 autopilot.' },
          { v: 'steam' as const, cls: 'ck-steam', icon: '⏱️', title: 'Steam gauges', desc: 'Six-pack, CDI/GS, RMI, KAP 140, radio stack.' },
          { v: 'airliner' as const, cls: 'ck-airliner', icon: '🛫', title: 'Airliner', desc: 'Boeing-style PFD/ND with MCP.' },
        ], (v) => (st.cockpit = v), 'ck'));
        this.main.append(h('div', { class: 'section-t' }, 'Equipment presets'));
        this.main.append(h('div', { class: 'fs-chips' }, ...EQUIP_PRESETS.map((p) => h('button', { class: JSON.stringify(p.eq) === JSON.stringify(st.equipment) ? 'on' : '', onclick: () => { st.equipment = { ...p.eq }; if (p.cockpit) st.cockpit = p.cockpit; this.changed(); } }, h('b', {}, p.name), h('span', {}, p.desc)))));
        this.main.append(h('div', { class: 'section-t' }, 'Installed avionics'));
        const tog = (k: keyof Equipment, title: string, desc: string) =>
          h('label', { class: `fs-tog${st.equipment[k] ? ' on' : ''}` }, h('input', { type: 'checkbox', checked: st.equipment[k], onchange: (e: Event) => { st.equipment[k] = (e.target as HTMLInputElement).checked; if (k === 'gps' && !st.equipment.gps && (st.arrival.approachId && getApproach(st.arrival.approachId).type === 'RNAV')) st.arrival.approachId = null; this.changed(); } }), h('div', {}, h('b', {}, title), h('span', {}, desc)));
        this.main.append(h('div', { class: 'fs-togs' },
          tog('gps', 'GPS / WAAS navigator', 'Flight plan, Direct-To, RNAV approaches, LPV/LNAV-VNAV glidepath.'),
          tog('ap', 'Autopilot', 'GFC 700 / KAP 140 style. Off = everything hand-flown.'),
          tog('nav2', 'Second NAV receiver', 'VOR 2 for cross-radials and the RMI green needle.'),
          tog('dme', 'DME', 'Slant-range distance from VOR/DME and ILS/DME.'),
          tog('adf', 'ADF', 'NDB bearing pointer — required for the NDB approach.'),
        ));
        this.main.append(h('label', { class: `fs-tog${st.svt ? ' on' : ''}` }, h('input', { type: 'checkbox', checked: st.svt, onchange: (e: Event) => { st.svt = (e.target as HTMLInputElement).checked; this.changed(); } }), h('div', {}, h('b', {}, 'Synthetic vision on the PFD'), h('span', {}, 'Terrain, runways and flight-path marker on the G1000 attitude display.'))));
        break;
      }
      case 2: {
        this.main.append(this.h2('Departure', 'Where does the flight start?'));
        this.main.append(h('div', { class: 'section-t' }, 'World'));
        this.main.append(this.choice(st.world, [
          { v: 'training' as const, title: 'Training region', desc: 'Ardent Islands: fictional, self-consistent region used by the syllabus — 9 procedures, every approach type.' },
          { v: 'real' as const, title: 'Real world', desc: '6,900+ airports worldwide with real runways and navaids; official FAA procedures (ILS, LOC, RNAV, VOR, NDB) and waypoints for 2,000+ US airports; real terrain.' },
        ], (v) => { st.world = v; void this.ensureRegion(); }));
        if (st.world === 'real') {
          const pickers = h('div', { class: 'ap-picks' },
            this.airportPicker('Departure', st.dep, (v) => { st.dep = v; void this.ensureRegion(); }),
            h('div', { class: 'ap-arrow' }, '→'),
            this.airportPicker('Destination', st.arr, (v) => { st.arr = v; void this.ensureRegion(); }),
          );
          this.main.append(pickers);
          const reg = currentRegion();
          this.main.append(h('p', { class: `ap-status${this.loadErr ? ' bad' : ''}` }, this.loading ? 'Loading navigation data and terrain…' : this.loadErr ? `Could not load: ${this.loadErr}` : reg && this.loadedKey === `${st.dep}|${st.arr}` ? `${AIRPORTS.length} airports · ${APPROACHES.filter((a) => a.airport === st.arr).length} approaches at ${st.arr} · magnetic variation ${Math.abs(reg.magVar).toFixed(1)}° ${reg.magVar >= 0 ? 'E' : 'W'} · terrain loaded` : ''));
          if (!this.loading && this.loadedKey !== `${st.dep}|${st.arr}`) void this.ensureRegion();
        }
        this.main.append(h('div', { class: 'section-t' }, 'Start'));
        const appIds = APPROACHES.filter((a) => st.equipment.gps || a.type !== 'RNAV');
        this.main.append(this.choice(st.start, [
          { v: 'runway' as StartKind, icon: '🛫', title: 'On a runway', desc: 'Lined up, ready for take-off.' },
          { v: 'air' as StartKind, icon: '📍', title: 'In flight near a fix', desc: 'Choose a fix, a bearing and distance from it, altitude and speed.' },
          { v: 'final' as StartKind, icon: '🛬', title: 'On final', desc: 'Established on an approach course, a few miles out.' },
        ], (v) => (st.start = v)));
        const box = h('div', { class: 'cb-card cb-row', style: 'margin-top:14px' });
        if (st.start === 'runway') {
          box.append(
            this.f('Runway', this.sel(`${st.rwy.airport}|${st.rwy.runway}`, AIRPORTS.flatMap((a) => a.runways.map((r) => [`${a.icao}|${r.id}`, `${a.icao} RWY ${r.id} · ${r.lengthFt} ft`] as [string, string])), (v) => { const [a, r] = v.split('|'); st.rwy.airport = a; st.rwy.runway = r; })),
            this.f('Initial climb (ft)', this.num(st.rwy.initialAlt, (v) => (st.rwy.initialAlt = v), { min: 1500, max: 12000, step: 500 })),
          );
        } else if (st.start === 'air') {
          box.append(
            this.f('Reference fix', this.fixSel(st.air.fix, (v) => (st.air.fix = v))),
            this.f('Bearing from fix (°)', this.num(st.air.bearing, (v) => (st.air.bearing = v % 360), { min: 0, max: 359, step: 5 })),
            this.f('Distance (NM)', this.num(st.air.distNm, (v) => (st.air.distNm = v), { min: 1, max: 40, step: 1 })),
            this.f('Altitude (ft)', this.num(st.air.altFt, (v) => (st.air.altFt = v), { min: 1500, max: 12000, step: 100 })),
            this.f('Airspeed (KIAS)', this.num(st.air.iasKt, (v) => (st.air.iasKt = v), { min: 65, max: 130, step: 5 })),
          );
          box.append(h('p', { class: 'muted', style: 'width:100%;margin:0;font-size:12px' }, 'The aircraft starts heading toward the fix.'));
        } else {
          box.append(
            this.f('Approach', this.sel(st.final.approachId, appIds.map((a) => [a.id, `${a.airport} ${a.name}`] as [string, string]), (v) => { st.final.approachId = v; st.arrival.approachId = v; })),
            this.f('Distance from the MAP (NM)', this.num(st.final.distNm, (v) => (st.final.distNm = v), { min: 3, max: 15, step: 1 })),
          );
        }
        this.main.append(box);
        break;
      }
      case 3: {
        this.main.append(this.h2(st.type === 'hold' ? 'Holding' : 'Route & arrival', st.type === 'route' ? 'Build the route fix by fix, set the cruise altitude and choose the arrival.' : st.type === 'approach' ? 'Choose the approach and how you join it.' : st.type === 'hold' ? 'Define the hold you will be cleared for.' : 'Free flight has no route — skip to the weather.'));
        if (st.type === 'route') {
          const chips = h('div', { class: 'fs-route' });
          st.route.forEach((id, i) =>
            chips.append(h('span', { class: 'fs-wp' },
              h('button', { title: 'Move left', onclick: () => { if (i > 0) { [st.route[i - 1], st.route[i]] = [st.route[i], st.route[i - 1]]; this.changed(); } } }, '‹'),
              h('b', {}, id),
              h('button', { title: 'Move right', onclick: () => { if (i < st.route.length - 1) { [st.route[i + 1], st.route[i]] = [st.route[i], st.route[i + 1]]; this.changed(); } } }, '›'),
              h('button', { class: 'x', title: 'Remove', onclick: () => { st.route.splice(i, 1); this.changed(); } }, '✕'),
            )),
          );
          const inp = h('input', { type: 'text', placeholder: 'Add a fix… (e.g. ARD, KEDDY, TOBEY)', list: 'fs-fixes', spellcheck: 'false', style: 'text-transform:uppercase' }) as HTMLInputElement;
          const dl = this.fixList();
          const add = () => { const v = inp.value.trim().toUpperCase(); if (findFix(v)) { st.route.push(v); this.changed(); } else inp.classList.add('bad'); };
          inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') add(); });
          this.main.append(h('div', { class: 'section-t' }, `Route (${st.route.length} fixes)`), chips, h('div', { class: 'cx-row', style: 'margin-top:8px' }, inp, dl, h('button', { class: 'btn', onclick: add }, '+ Add'), h('button', { class: 'btn ghost', onclick: () => { this.suggestRoute(); this.changed(); }, title: 'Direct route to the first IAF of the chosen approach' }, 'Suggest')));
          this.main.append(h('div', { class: 'cb-row', style: 'margin-top:12px' }, this.f('Cruise altitude (ft)', this.num(st.cruise, (v) => (st.cruise = v), { min: 2000, max: 12000, step: 500 }))));
        }
        if (st.type === 'route' || (st.type === 'approach' && st.start !== 'final')) {
          const apps = APPROACHES.filter((a) => st.equipment.gps || a.type !== 'RNAV');
          const ap = st.arrival.approachId ? getApproach(st.arrival.approachId) : null;
          this.main.append(h('div', { class: 'section-t' }, 'Arrival'), h('div', { class: 'cb-card cb-row' },
            this.f('Approach', this.sel(st.arrival.approachId ?? '', [...(st.type === 'route' ? ([['', 'No approach (end at the last fix)']] as [string, string][]) : []), ...apps.map((a) => [a.id, `${a.airport} ${a.name}`] as [string, string])], (v) => { st.arrival.approachId = v || null; st.arrival.transition = v ? getApproach(v).transitions[0]?.name ?? null : null; })),
            ap ? this.f('Transition', this.sel(st.arrival.transition ?? '', [['', 'Vectors to final'], ...ap.transitions.map((t) => [t.name, t.name] as [string, string])], (v) => (st.arrival.transition = v || null))) : '',
            ap ? this.f('Outcome', this.sel(st.arrival.outcome, [['land', 'Land'], ['missed', 'Missed approach']], (v) => (st.arrival.outcome = v))) : '',
          ));
          if (ap && !st.equipment.gps && ap.type !== 'RNAV') this.main.append(h('p', { class: 'muted', style: 'font-size:12px' }, 'No GPS: transitions are flown on raw data (VOR/DME/ADF) — use the plate.'));
        }
        if (st.type === 'approach' && st.start === 'final') this.main.append(h('div', { class: 'cb-card cb-row' }, this.f('Outcome', this.sel(st.arrival.outcome, [['land', 'Land'], ['missed', 'Missed approach']], (v) => (st.arrival.outcome = v)))));
        if (st.type === 'hold' || st.type === 'route') {
          const hd = st.hold;
          if (st.type === 'route') this.main.append(h('label', { class: `fs-tog${hd.enabled ? ' on' : ''}`, style: 'margin-top:12px' }, h('input', { type: 'checkbox', checked: hd.enabled, onchange: (e: Event) => { hd.enabled = (e.target as HTMLInputElement).checked; this.changed(); } }), h('div', {}, h('b', {}, 'Hold before the approach'), h('span', {}, 'ATC holds you at a fix (expect further clearance).'))));
          if (st.type === 'hold' || hd.enabled)
            this.main.append(h('div', { class: 'cb-card cb-row', style: 'margin-top:8px' },
              this.f('Hold fix', this.fixSel(hd.fix, (v) => { hd.fix = v; if (st.type === 'hold') st.air.fix = v; })),
              this.f('Inbound course (°)', this.num(hd.inbound, (v) => (hd.inbound = v || 360), { min: 1, max: 360, step: 5 })),
              this.f('Turns', this.sel(hd.turn, [['R', 'Right (standard)'], ['L', 'Left']], (v) => (hd.turn = v))),
              this.f('Leg', this.sel(String(hd.legMin), [['1', '1 min'], ['1.5', '1.5 min'], ['2', '2 min']], (v) => (hd.legMin = Number(v)))),
              this.f('Altitude (ft)', this.num(hd.alt, (v) => (hd.alt = v), { min: 2000, max: 12000, step: 500 })),
              this.f('Circuits', this.num(hd.laps, (v) => (hd.laps = v), { min: 1, max: 6, step: 1 })),
            ));
        }
        break;
      }
      case 4: {
        this.main.append(this.h2('Weather & time', 'Start from a preset and fine-tune. Winds aloft veer and strengthen automatically from the surface wind.'));
        const w = st.weather;
        this.main.append(h('div', { class: 'wx-presets' }, ...WX_PRESETS.slice(1).map((p) => h('button', { onclick: () => { Object.assign(w, p.wx); this.changed(); } }, h('b', {}, p.name), h('span', {}, p.desc)))));
        const slider = (label: string, get: () => number, set: (v: number) => void, o: { min: number; max: number; step: number; fmt: (v: number) => string }) => {
          const out = h('b', {}, o.fmt(get()));
          const r = h('input', { type: 'range', min: o.min, max: o.max, step: o.step, value: get() }) as HTMLInputElement;
          r.addEventListener('input', () => { set(Number(r.value)); out.textContent = o.fmt(Number(r.value)); this.save(); this.renderSide(); });
          return h('label', { class: 'wx-f' }, h('span', {}, label), out, r);
        };
        this.main.append(h('div', { class: 'wx-grid', style: 'margin-top:14px' },
          slider('Ceiling (AGL)', () => w.ceilingFt ?? 900, (v) => (w.ceilingFt = v), { min: 0, max: 15000, step: 50, fmt: (v) => (v >= 15000 ? 'clear' : `${v} ft`) }),
          slider('Visibility', () => w.visibilitySm ?? 2, (v) => (w.visibilitySm = v), { min: 0.25, max: 10, step: 0.25, fmt: (v) => `${v} SM` }),
          slider('Wind from', () => w.windDir ?? 250, (v) => (w.windDir = v), { min: 0, max: 355, step: 5, fmt: (v) => `${pad3(v)}°` }),
          slider('Wind speed', () => w.windKt ?? 10, (v) => (w.windKt = v), { min: 0, max: 40, step: 1, fmt: (v) => `${v} kt` }),
          slider('Gusts to', () => w.gustKt ?? 0, (v) => (w.gustKt = v), { min: 0, max: 50, step: 1, fmt: (v) => (v <= (w.windKt ?? 0) ? 'none' : `${v} kt`) }),
          slider('Turbulence', () => w.turbulence ?? 0.15, (v) => (w.turbulence = v), { min: 0, max: 1, step: 0.05, fmt: (v) => (v < 0.08 ? 'none' : v < 0.3 ? 'light' : v < 0.6 ? 'moderate' : 'severe') }),
          slider('Altimeter (QNH)', () => w.qnh ?? 29.92, (v) => (w.qnh = v), { min: 28.8, max: 30.8, step: 0.01, fmt: (v) => `${v.toFixed(2)} inHg` }),
        ));
        this.main.append(h('div', { class: 'section-t' }, 'Time of day'));
        this.main.append(this.choice(st.tod, [
          { v: 'day' as const, icon: '☀️', title: 'Day', desc: 'Full visual references below the clouds.' },
          { v: 'dusk' as const, icon: '🌇', title: 'Dusk', desc: 'Low sun, long shadows, lights coming on.' },
          { v: 'night' as const, icon: '🌙', title: 'Night', desc: 'Only the approach and runway lights at minimums.' },
        ], (v) => (st.tod = v)));
        break;
      }
      case 5: {
        this.main.append(this.h2('Training options', 'Graded flights produce a step-by-step result and an ACS evaluation.'));
        if (st.type === 'free') this.main.append(h('p', { class: 'muted' }, 'Free flights are not graded. You still get the debrief and the replay.'));
        else
          this.main.append(this.choice(st.graded, [
            { v: true, icon: '🎯', title: 'Graded', desc: 'ATC instructions per leg, tolerances, ACS evaluation, saved to the records.' },
            { v: false, icon: '🕊️', title: 'Free practice', desc: 'Route and approach loaded, no grading — fly at your own pace.' },
          ], (v) => (st.graded = v)));
        if (st.graded && st.type !== 'free') {
          this.main.append(h('div', { class: 'section-t' }, 'Mode'));
          this.main.append(this.choice(st.mode, [
            { v: 'training' as const, icon: '🧑‍🏫', title: 'Training', desc: 'Coach hints and tolerance alerts.' },
            { v: 'checkride' as const, icon: '🎓', title: 'Checkride', desc: 'No hints, ACS pass/fail.' },
          ], (v) => (st.mode = v)));
          this.main.append(h('label', { class: `fs-tog${st.handFlown ? ' on' : ''}`, style: 'margin-top:12px' }, h('input', { type: 'checkbox', checked: st.handFlown, disabled: !st.equipment.ap, onchange: (e: Event) => { st.handFlown = (e.target as HTMLInputElement).checked; this.changed(); } }), h('div', {}, h('b', {}, 'Hand-flown'), h('span', {}, st.equipment.ap ? 'The autopilot is installed but not allowed.' : 'No autopilot installed.'))));
        }
        this.main.append(h('div', { class: 'section-t' }, `Failures (${st.failures.length})`));
        const fbox = h('div', { class: 'cb-card' });
        st.failures.forEach((f, k) =>
          fbox.append(h('div', { class: 'cb-row' },
            this.f('Failure', this.sel(f.key, (Object.keys(FAILURE_LABELS) as (keyof Failures)[]).map((x) => [x, FAILURE_LABELS[x]] as [keyof Failures, string]), (v) => (f.key = v))),
            this.f('After (minutes)', this.num(f.at, (v) => (f.at = v), { min: 0, max: 120, step: 0.5 })),
            h('button', { class: 'btn danger cb-x', onclick: () => { st.failures.splice(k, 1); this.changed(); } }, '✕'),
          )),
        );
        fbox.append(h('div', { class: 'cx-row wrap' },
          h('button', { class: 'btn', onclick: () => { st.failures.push({ key: 'gs', trigger: 'time', at: 5 }); this.changed(); } }, '+ Add a failure'),
          h('button', { class: 'btn ghost', onclick: () => { const keys = Object.keys(FAILURE_LABELS).filter((k) => k !== 'engine') as (keyof Failures)[]; st.failures.push({ key: keys[Math.floor(Math.random() * keys.length)], trigger: 'time', at: 3 + Math.round(Math.random() * 12) }); this.changed(); } }, '🎲 Surprise failure'),
        ));
        this.main.append(fbox);
        break;
      }
      case 6: {
        this.main.append(this.h2('Briefing', 'Check the plan, then fly.'));
        const c = setupToCircuit(st);
        const errs = st.type === 'free' ? [] : validate(c);
        if (errs.length) this.main.append(h('div', { class: 'fs-errs' }, ...errs.map((e) => h('div', {}, `⚠ ${e}`))));
        const dest = c.legs.find((l) => l.type === 'approach') as Extract<CircuitLeg, { type: 'approach' }> | undefined;
        const ap = dest ? getApproach(dest.approachId) : null;
        this.main.append(
          h('div', { class: 'fs-brief' },
            h('div', {},
              h('div', { class: 'section-t', style: 'margin-top:0' }, 'Plan'),
              h('ol', { class: 'cb-seq' },
                h('li', {}, c.start.type === 'runway' ? `Take off ${c.start.airport} RWY ${c.start.runway}, climb ${c.start.initialAlt}` : `Start ${c.start.distNm} NM from ${c.start.fix} (${pad3(c.start.bearing)}°), ${c.start.altFt} ft`),
                ...c.legs.map((l) => h('li', {}, l.type === 'fix' ? `Direct ${l.ident} at ${l.alt}` : l.type === 'hold' ? `Hold at ${l.ident}, inbound ${pad3(l.inbound)}°, ${l.turn === 'R' ? 'right' : 'left'} turns ×${l.laps}` : l.type === 'approach' ? `${getApproach(l.approachId).airport} ${getApproach(l.approachId).name} ${l.transition ? `via ${l.transition}` : '(vectors)'} → ${l.outcome}` : `Maintain ${l.alt}`)),
              ),
              ap ? h('div', { class: 'atis', style: 'margin-top:12px' }, h('b', {}, `ATIS ${ap.airport}`), h('span', {}, atisText(ap.airport, { ...({ windDir: 250, windKt: 10, gustKt: 0, turbulence: 0.15, qnh: 29.92, oatSeaLevelC: 15, ceilingFt: 900, cloudTopFt: 7000, visibilitySm: 2 } as Weather), ...st.weather }))) : null,
            ),
            ap ? h('button', { class: 'fs-plate', title: 'Open the plate', onclick: () => { this.close(); this.hooks.openChart(ap.id); } }, h('div', { html: approachPlate(ap) })) : h('div', {}),
          ),
        );
        break;
      }
    }
  }

  private suggestRoute() {
    const st = this.st;
    if (!st.arrival.approachId) return;
    const ap = getApproach(st.arrival.approachId);
    const tr = ap.transitions.find((t) => t.name === st.arrival.transition) ?? ap.transitions[0];
    if (tr) st.route = [tr.legs[0].fix.ident];
  }

  // ---------------------------------------------------------------- side summary
  private renderSide() {
    clear(this.side);
    const st = this.st;
    const c = setupToCircuit(st);
    const stats = circuitStats(c);
    const eq = st.equipment;
    const eqList = [eq.gps && 'GPS', eq.ap && 'AP', 'NAV1', eq.nav2 && 'NAV2', eq.dme && 'DME', eq.adf && 'ADF'].filter(Boolean).join(' · ');
    const w = st.weather;
    this.side.append(
      h('div', { class: 'fs-kicker' }, 'Your flight'),
      h('h3', { class: 'fs-title' }, c.name),
      this.mapSvg(c),
      h('div', { class: 'ios-stat', style: 'margin-top:10px' },
        h('div', {}, h('small', {}, 'Type'), h('b', {}, { route: 'IFR A → B', approach: 'Approach', hold: 'Holding', free: 'Free flight' }[st.type])),
        h('div', {}, h('small', {}, 'Distance · time'), h('b', {}, `${stats.distNm.toFixed(0)} NM · ~${stats.minutes} min`)),
        h('div', {}, h('small', {}, 'Cockpit'), h('b', {}, { g1000: 'G1000', steam: 'Steam', airliner: 'Airliner' }[st.cockpit])),
        h('div', {}, h('small', {}, 'Equipment'), h('b', { style: 'font-size:11.5px' }, eqList)),
        h('div', {}, h('small', {}, 'Weather'), h('b', { style: 'font-size:12px' }, `${(w.ceilingFt ?? 0) >= 15000 ? 'CLR' : `OVC${String(Math.round((w.ceilingFt ?? 0) / 100)).padStart(3, '0')}`} · ${w.visibilitySm} SM · ${pad3(w.windDir ?? 0)}/${w.windKt}${(w.gustKt ?? 0) > (w.windKt ?? 0) ? 'G' + w.gustKt : ''}`)),
        h('div', {}, h('small', {}, 'Grading'), h('b', {}, st.type === 'free' || !st.graded ? 'Free' : st.mode === 'checkride' ? 'Checkride' : 'Training')),
      ),
    );
  }

  private mapSvg(c: Circuit): HTMLElement {
    const pts = c.legs.length ? circuitPath(c) : circuitPath({ ...c, legs: [] });
    const W = 340, H = 220;
    const near = AIRPORTS.filter((a) => pts.some((p) => Math.abs(p.lat - a.lat) < 0.3 && Math.abs(p.lon - a.lon) < 0.4));
    const all: LatLon[] = [...pts, ...(near.length ? near : AIRPORTS)];
    const ref = all[0];
    const loc = all.map((p) => toLocal(ref, p));
    const minX = Math.min(...loc.map((p) => p.x)) - 3, maxX = Math.max(...loc.map((p) => p.x)) + 3;
    const minY = Math.min(...loc.map((p) => p.y)) - 3, maxY = Math.max(...loc.map((p) => p.y)) + 3;
    const sc = Math.min(W / (maxX - minX), H / (maxY - minY));
    const P = (p: LatLon) => { const l = toLocal(ref, p); return { x: (l.x - minX) * sc + (W - (maxX - minX) * sc) / 2, y: H - ((l.y - minY) * sc + (H - (maxY - minY) * sc) / 2) }; };
    let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" rx="12" fill="#07101a"/>`;
    for (const a of AIRPORTS) for (let k = 0; k < a.runways.length; k += 2) { const r1 = P(a.runways[k].threshold), r2 = P(a.runways[k].end); svg += `<line x1="${r1.x}" y1="${r1.y}" x2="${r2.x}" y2="${r2.y}" stroke="#cfd6dd" stroke-width="3"/>`; }
    const line = pts.map(P);
    for (let k = 1; k < line.length; k++) svg += `<line x1="${line[k - 1].x}" y1="${line[k - 1].y}" x2="${line[k].x}" y2="${line[k].y}" stroke="${pts[k].kind === 'approach' ? '#ff5cf4' : '#00e4ff'}" stroke-width="2.2"${pts[k].kind === 'approach' ? '' : ' stroke-dasharray="6 4"'}/>`;
    for (const l of c.legs) if (l.type === 'hold') { const f = findFix(l.ident); if (f) svg += `<polygon points="${racetrack({ fix: { ident: f.ident, lat: f.lat, lon: f.lon }, inbound: l.inbound, turn: l.turn, legMin: l.legMin, altFt: l.alt }, 90).map(P).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="rgba(255,210,58,.12)" stroke="#ffd23a" stroke-width="2"/>`; }
    const seen = new Set<string>();
    pts.forEach((p, k) => { if (seen.has(p.ident)) return; seen.add(p.ident); const q = line[k]; const col = p.kind === 'start' ? '#2bd576' : p.kind === 'approach' ? '#ff9cf8' : p.kind === 'hold' ? '#ffd23a' : '#00e4ff'; svg += `<circle cx="${q.x}" cy="${q.y}" r="${p.kind === 'start' ? 5 : 3}" fill="${col}"/><text x="${q.x + 6}" y="${q.y - 5}" fill="${col}" font-size="10" font-family="Inter">${p.ident}</text>`; });
    svg += '</svg>';
    return h('div', { class: 'fs-map', html: svg });
  }

  // ---------------------------------------------------------------- footer
  private renderFoot() {
    clear(this.foot);
    const st = this.st;
    const c = setupToCircuit(st);
    const errs = st.type === 'free' ? [] : validate(c);
    const canFly = errs.length === 0;
    this.foot.append(
      this.step > 0 ? h('button', { class: 'btn', onclick: () => { this.step--; this.render(); } }, '← Back') : h('span', {}),
      h('span', { class: 'fs-errline' }, errs[0] ? `⚠ ${errs[0]}` : ''),
      h('span', { style: 'flex:1' }),
      st.type !== 'free' ? h('button', { class: 'btn ghost', disabled: !canFly, onclick: () => { circuitStore.save({ ...c, name: c.name }); this.toast?.(`Saved “${c.name}” to IFR circuits`); }, title: 'Save to the Flight Center → IFR circuits' }, 'Save as circuit') : h('span', {}),
      this.step < STEPS.length - 1 ? h('button', { class: 'btn', onclick: () => { this.step++; this.render(); } }, 'Next →') : h('span', {}),
      h('button', { class: 'btn primary', disabled: !canFly, onclick: () => this.fly() }, 'Fly ✈'),
    );
  }
  toast?: (m: string) => void;

  private fly() {
    const st = this.st;
    this.save();
    this.close();
    const c = setupToCircuit(st);
    if (st.world === 'real' && this.loadedKey !== `${st.dep}|${st.arr}`) {
      void this.ensureRegion().then(() => this.fly());
      return;
    }
    if (st.type !== 'free' && st.graded && c.legs.length) this.hooks.flyGraded(c, st);
    else this.hooks.flyFree(setupToScenario(st), st);
  }
}
