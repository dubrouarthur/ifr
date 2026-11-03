// "Plan a flight" wizard: flight type, aircraft & instruments, departure, route & arrival, weather & time,
// training options and a briefing — with a live summary and route map.
import { h, clear, store } from './dom';
import { Modal, WX_PRESETS } from './modals';
import { FIXES, APPROACHES, AIRPORTS, approach as getApproach, findFix } from '../nav/data';
import { FAILURE_LABELS, fullEquipment, type Equipment, type Failures, type Scenario } from '../sim/sim';
import type { Weather } from '../sim/environment';
import { circuitPath, circuitStats, validate, circuitStore, type Circuit, type CircuitLeg } from '../train/circuits';
import { defaultSetup, adaptSetupToRegion, setupToCircuit, setupToScenario, type FlightSetupState, type FlightType, type StartKind } from '../train/setup';
export type { FlightSetupState, FlightType } from '../train/setup';
import { racetrack } from '../nav/holding';
import { toLocal, type LatLon } from '../nav/geo';
import { approachPlate } from '../plates/plates';
import { atisText } from './weather';
import { loadRegion, leaveRealWorld, currentRegion, searchAirports, nearbyAirports, airportRow, rowDistanceNm, MAX_REGION_NM, FLAG_PROC, FLAG_ILS, type IndexRow } from '../nav/world';
import { bearingDeg } from '../nav/geo';

const STEPS = ['Airports', 'Flight type', 'Aircraft & instruments', 'Start position', 'Route & arrival', 'Weather & time', 'Training options', 'Briefing'] as const;
const EQUIP_PRESETS: { name: string; desc: string; eq: Equipment; cockpit?: 'g1000' | 'steam' | 'airliner' }[] = [
  { name: 'Fully equipped', desc: 'GPS/WAAS, autopilot, 2 NAV, DME, ADF', eq: fullEquipment() },
  { name: 'Classic IFR', desc: '2 NAV, DME, ADF — no GPS, no autopilot', eq: { gps: false, ap: false, adf: true, dme: true, nav2: true }, cockpit: 'steam' },
  { name: 'Basic trainer', desc: '1 NAV, no DME, no ADF, no GPS, no autopilot', eq: { gps: false, ap: false, adf: false, dme: false, nav2: false }, cockpit: 'steam' },
  { name: 'GPS, no autopilot', desc: 'Hand-flown glass with GPS', eq: { gps: true, ap: false, adf: true, dme: true, nav2: true } },
];
const fixIds = () => [...new Set(FIXES.filter((f) => f.kind !== 'runway').map((f) => f.ident))].sort();
const pad3 = (n: number) => String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, '0');

/** Holds published in the procedures of the region (missed-approach holds, holds-in-lieu), destination first */
function publishedHolds(arr: string) {
  const out: { fix: string; inbound: number; turn: 'L' | 'R'; legMin: number; alt: number; where: string; dest: boolean }[] = [];
  const seen = new Set<string>();
  for (const a of APPROACHES)
    for (const [l, what] of [...a.missed.map((l) => [l, 'missed approach'] as const), ...a.final.map((l) => [l, 'course reversal'] as const), ...a.transitions.flatMap((t) => t.legs.map((l) => [l, 'hold-in-lieu'] as const))]) {
      if (!l.hold) continue;
      const key = `${l.fix.ident}|${l.hold.inbound}|${l.hold.turn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ fix: l.fix.ident, inbound: Math.round(l.hold.inbound) || 360, turn: l.hold.turn, legMin: l.hold.legMin || 1, alt: Math.max(2000, Math.ceil((l.altMin ?? 3000) / 100) * 100), where: `${a.airport} ${a.name} — ${what}`, dest: a.airport === arr });
    }
  return out.sort((x, y) => Number(y.dest) - Number(x.dest)).slice(0, 12);
}

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
    this.step = 0;
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
  private progress = '';
  private terrainNote = '';
  private loading = false;
  private loadErr = '';
  private loadingJob: Promise<void> | null = null;
  /** load (or leave) the real-world region for the chosen airports */
  private ensureRegion(force = false): Promise<void> {
    if (this.loadingJob) return this.loadingJob;
    this.loadingJob = this.doEnsureRegion(force).finally(() => (this.loadingJob = null));
    return this.loadingJob;
  }
  private async doEnsureRegion(force: boolean) {
    const st = this.st;
    if (st.world !== 'real') {
      if (currentRegion()) { leaveRealWorld(); this.loadedKey = ''; this.hooks.regionChanged(); }
      return;
    }
    const key = `${st.dep}|${st.arr}`;
    if (!st.dep || !st.arr) { this.loadErr = 'Choose the departure and the destination first.'; this.render(); return; }
    if (!force && key === this.loadedKey && currentRegion()) return;
    this.loading = true;
    this.loadErr = '';
    this.render();
    try {
      const r = await loadRegion([st.dep, st.arr].filter(Boolean), undefined, (pr) => {
        this.progress = pr.step === 'index' ? 'Airport index…' : pr.step === 'navdata' ? 'Airports, navaids & waypoints…' : pr.step === 'procedures' ? 'Instrument procedures…' : pr.step === 'terrain' ? `Terrain ${pr.done ?? 0}/${pr.total ?? 0} tiles…` : '';
        const el = this.main.querySelector('.ap-status span:last-child');
        if (el && this.loading) el.textContent = `Loading — ${this.progress}`;
        const fb = this.foot.querySelector('.fs-loading');
        if (fb && this.loading) fb.textContent = this.progress;
      });
      this.loadedKey = key;
      this.terrainNote = r.terrainComplete ? 'terrain loaded' : 'terrain still loading in the background (you can fly now)';
      adaptSetupToRegion(st);
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
  private rows: Record<string, IndexRow> = {};
  /** Airport search field: typing only searches (latest query wins); nothing is committed until a result is
   *  clicked or Enter picks the highlighted one. An empty field lists `suggest()` (e.g. airports near departure). */
  private airportPicker(label: string, ph: string, on: (r: IndexRow) => void, suggest: () => Promise<IndexRow[]>, suggestTitle: string, from?: IndexRow) {
    const wrap = h('div', { class: 'ap-pick' });
    const inp = h('input', { type: 'text', placeholder: ph, spellcheck: 'false', autocomplete: 'off', 'aria-label': label }) as HTMLInputElement;
    const res = h('div', { class: 'ap-res', role: 'listbox' });
    let seq = 0, hi = 0, shown: IndexRow[] = [];
    const paint = (title: string) => {
      clear(res);
      if (!shown.length) { if (inp.value.trim().length >= 2) res.append(h('div', { class: 'ap-none' }, `No airport matches “${inp.value.trim()}”`)); return; }
      if (title) res.append(h('div', { class: 'ap-res-t' }, title));
      shown.forEach((r, i) => res.append(h('button', { type: 'button', class: i === hi ? 'hi' : '', onmousedown: (e: Event) => { e.preventDefault(); commit(r); } },
        h('b', {}, r[0]), h('span', {}, h('i', {}, r[1]), h('small', {}, [r[2], r[3], from && from[0] !== r[0] ? `${Math.round(rowDistanceNm(from, r))} NM` : ''].filter(Boolean).join(' · '))),
        r[7] & FLAG_PROC ? h('em', { class: 'ok' }, r[7] & FLAG_ILS ? 'ILS · RNAV' : 'IAP') : h('em', {}, 'GPS app.'))));
    };
    const run = async () => {
      const my = ++seq;
      const q = inp.value.trim();
      const rows = q ? await searchAirports(q, 8) : await suggest();
      if (my !== seq) return; // a newer keystroke already ran
      shown = rows; hi = 0;
      paint(q ? '' : suggestTitle);
    };
    const commit = (r: IndexRow) => { seq++; clear(res); shown = []; inp.value = ''; this.rows[r[0]] = r; on(r); };
    let tmr = 0;
    inp.addEventListener('input', () => { clearTimeout(tmr); tmr = window.setTimeout(run, 90); });
    inp.addEventListener('focus', () => void run());
    inp.addEventListener('blur', () => setTimeout(() => { seq++; clear(res); }, 150));
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (shown.length) { hi = (hi + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length; paint(''); } }
      else if (e.key === 'Enter') { e.preventDefault(); if (shown[hi]) commit(shown[hi]); }
      else if (e.key === 'Escape') { inp.value = ''; seq++; clear(res); }
    });
    wrap.append(inp, res);
    return { el: wrap, input: inp };
  }

  /** The chosen airport as a card (with a Change button) */
  private airportCard(role: string, icao: string, onChange: () => void) {
    const r = this.rows[icao];
    return h('div', { class: 'ap-card' },
      h('span', { class: 'ap-role' }, role),
      h('b', { class: 'ap-icao' }, icao),
      h('div', { class: 'ap-name' }, h('span', {}, r ? r[1] : ''), h('small', {}, r ? [r[2], r[3], `${r[6]} ft`].filter(Boolean).join(' · ') : '')),
      r ? h('em', { class: r[7] & FLAG_PROC ? 'ok' : '' }, r[7] & FLAG_PROC ? (r[7] & FLAG_ILS ? 'Official ILS · RNAV' : 'Official IAPs') : 'Generated GPS approaches') : null,
      h('button', { class: 'btn ghost sm', onclick: onChange }, 'Change'),
    );
  }

  private editing: 'dep' | 'arr' | null = null;
  private renderAirports() {
    const st = this.st;
    this.main.append(this.h2('Where do you fly?', 'Pick the departure, then the destination. Any real airport in the world — official FAA procedures in the US, generated RNAV (GPS) approaches everywhere else.'));
    this.main.append(this.choice(st.world, [
      { v: 'real' as const, title: 'Real world', desc: '40,000+ airports with real runways, navaids and terrain. Procedures, waypoints and ILS from the FAA for the US.' },
      { v: 'training' as const, title: 'Training region', desc: 'Ardent Islands: compact fictional region used by the syllabus — every approach type within 40 NM.' },
    ], (v) => { st.world = v; if (v === 'training') void this.ensureRegion(); }));
    if (st.world !== 'real') return;
    for (const k of ['dep', 'arr'] as const) if (st[k] && !this.rows[st[k]]) void airportRow(st[k]).then((r) => { if (r) { this.rows[r[0]] = r; this.renderMain(); } });
    const box = h('div', { class: 'ap-flow' });
    const depRow = this.rows[st.dep];
    // 1 — departure
    if (!st.dep || this.editing === 'dep') {
      const p = this.airportPicker('Departure', 'Departure — ICAO, name or city (e.g. LFPN, Toussus)', (r) => { st.dep = r[0]; this.editing = st.arr ? null : 'arr'; if (st.arr && this.rows[st.arr] && rowDistanceNm(r, this.rows[st.arr]) > MAX_REGION_NM) { st.arr = ''; this.editing = 'arr'; } this.airportsChanged(); }, () => searchAirports('', 8), 'Popular IFR airports');
      box.append(h('div', { class: 'ap-stepl' }, h('span', { class: 'n' }, '1'), 'Departure'), p.el);
      setTimeout(() => p.input.focus(), 30);
    } else box.append(this.airportCard('From', st.dep, () => { this.editing = 'dep'; this.renderMain(); }));
    // 2 — destination
    if (st.dep && this.editing !== 'dep') {
      if (!st.arr || this.editing === 'arr') {
        const p = this.airportPicker('Destination', 'Destination — ICAO, name or city (e.g. LFPO, Orly)', (r) => {
          if (depRow && rowDistanceNm(depRow, r) > MAX_REGION_NM) { this.loadErr = `${r[0]} is ${Math.round(rowDistanceNm(depRow, r))} NM from ${st.dep}: pick a destination within ${MAX_REGION_NM} NM.`; this.renderMain(); return; }
          st.arr = r[0]; this.editing = null; this.airportsChanged();
        }, () => (depRow ? nearbyAirports(depRow[4], depRow[5], 8, depRow[0]) : searchAirports('', 8)), `Near ${st.dep}`, depRow);
        box.append(h('div', { class: 'ap-stepl' }, h('span', { class: 'n' }, '2'), 'Destination', h('button', { class: 'linkbtn', onclick: () => { st.arr = st.dep; this.editing = null; this.airportsChanged(); } }, `Same as departure (local flight at ${st.dep})`)), p.el);
        if (st.dep) setTimeout(() => p.input.focus(), 30);
      } else box.append(this.airportCard('To', st.arr, () => { this.editing = 'arr'; this.loadErr = ''; this.renderMain(); }));
    }
    this.main.append(box);
    // route summary + load state
    const arrRow = this.rows[st.arr];
    if (st.dep && st.arr && depRow && arrRow && !this.editing) {
      const d = rowDistanceNm(depRow, arrRow);
      const brg = (bearingDeg({ lat: depRow[4], lon: depRow[5] }, { lat: arrRow[4], lon: arrRow[5] }) + 360) % 360;
      this.main.append(h('div', { class: 'ap-route' },
        h('div', {}, h('small', {}, 'Distance'), h('b', {}, st.dep === st.arr ? 'Local' : `${Math.round(d)} NM`)),
        h('div', {}, h('small', {}, 'True course'), h('b', {}, st.dep === st.arr ? '—' : `${pad3(brg)}°`)),
        h('div', {}, h('small', {}, 'Approx. time'), h('b', {}, st.dep === st.arr ? '20–40 min' : `${Math.round((d / 120) * 60 + 15)} min`)),
      ));
    }
    const key = `${st.dep}|${st.arr}`;
    const ready = !!currentRegion() && this.loadedKey === key;
    const status = h('div', { class: `ap-status${this.loadErr ? ' bad' : ready ? ' good' : ''}` });
    if (this.loading) status.append(h('span', { class: 'spin' }), h('span', {}, `Loading — ${this.progress || 'starting…'}`));
    else if (this.loadErr) { status.append(h('span', {}, this.loadErr)); if (st.dep && st.arr) status.append(h('button', { class: 'btn sm', onclick: () => void this.ensureRegion(true) }, 'Retry')); }
    else if (ready) {
      const reg = currentRegion()!;
      const apps = APPROACHES.filter((a) => a.airport === st.arr);
      status.append(h('span', {}, `Ready · ${AIRPORTS.length} airports · ${apps.length} approaches at ${st.arr}${apps.some((a) => a.source === 'Generated') ? ' (generated)' : ''} · var ${Math.abs(reg.magVar).toFixed(1)}° ${reg.magVar >= 0 ? 'E' : 'W'} · ${this.terrainNote}`));
    }
    if (status.childNodes.length) this.main.append(status);
  }
  private airportsChanged() {
    this.loadErr = '';
    this.save();
    if (this.st.dep && this.st.arr && !this.editing) void this.ensureRegion();
    else this.render();
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
        this.renderAirports();
        break;
      case 1:
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
      case 2: {
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
      case 3: {
        this.main.append(this.h2('Start position', st.world === 'real' ? `Where the flight starts at or near ${st.dep}.` : 'Where does the flight start?'));
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
      case 4: {
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
          // destination procedures first, then the other airports of the region
          const apps = APPROACHES.filter((a) => st.equipment.gps || a.type !== 'RNAV').sort((a, b) => (b.airport === st.arr ? 1 : 0) - (a.airport === st.arr ? 1 : 0) || a.airport.localeCompare(b.airport));
          const ap = st.arrival.approachId ? getApproach(st.arrival.approachId) : null;
          this.main.append(h('div', { class: 'section-t' }, 'Arrival'), h('div', { class: 'cb-card cb-row' },
            this.f('Approach', this.sel(st.arrival.approachId ?? '', [...(st.type === 'route' ? ([['', 'No approach (end at the last fix)']] as [string, string][]) : []), ...apps.map((a) => [a.id, `${a.airport} ${a.name}`] as [string, string])], (v) => { st.arrival.approachId = v || null; st.arrival.transition = v ? getApproach(v).transitions[0]?.name ?? null : null; })),
            ap ? this.f('Transition', this.sel(st.arrival.transition ?? '', [['', 'Vectors to final'], ...ap.transitions.map((t) => [t.name, t.name] as [string, string])], (v) => (st.arrival.transition = v || null))) : '',
            ap ? this.f('Outcome', this.sel(st.arrival.outcome, [['land', 'Land'], ['missed', 'Missed approach']], (v) => (st.arrival.outcome = v))) : '',
          ));
          if (ap && !st.equipment.gps && ap.type !== 'RNAV') this.main.append(h('p', { class: 'muted', style: 'font-size:12px' }, 'No GPS: transitions are flown on raw data (VOR/DME/ADF) — use the plate.'));
          if (ap) this.main.append(this.platePreview(ap));
        }
        if (st.type === 'approach' && st.start === 'final') this.main.append(h('div', { class: 'cb-card cb-row' }, this.f('Outcome', this.sel(st.arrival.outcome, [['land', 'Land'], ['missed', 'Missed approach']], (v) => (st.arrival.outcome = v)))));
        if (st.type === 'hold' || st.type === 'route') {
          const hd = st.hold;
          if (st.type === 'route') this.main.append(h('label', { class: `fs-tog${hd.enabled ? ' on' : ''}`, style: 'margin-top:12px' }, h('input', { type: 'checkbox', checked: hd.enabled, onchange: (e: Event) => { hd.enabled = (e.target as HTMLInputElement).checked; this.changed(); } }), h('div', {}, h('b', {}, 'Hold before the approach'), h('span', {}, 'ATC holds you at a fix (expect further clearance).'))));
          if (st.type === 'hold' || hd.enabled) {
            const pub = publishedHolds(st.arr);
            if (pub.length)
              this.main.append(h('div', { class: 'section-t' }, 'Published holds'), h('div', { class: 'fs-holds' }, ...pub.map((p) =>
                h('button', { class: `fs-hold${hd.fix === p.fix && hd.inbound === p.inbound && hd.turn === p.turn ? ' on' : ''}`, onclick: () => { Object.assign(hd, { fix: p.fix, inbound: p.inbound, turn: p.turn, legMin: p.legMin, alt: p.alt }); if (st.type === 'hold') st.air.fix = p.fix; this.changed(); } },
                  h('b', {}, p.fix), h('span', {}, `${pad3(p.inbound)}° inbound · ${p.turn === 'R' ? 'right' : 'left'} · ${p.alt} ft`), h('small', {}, p.where)))));
            this.main.append(h('div', { class: 'section-t' }, pub.length ? 'Or define any hold' : 'Hold'));
            this.main.append(h('div', { class: 'cb-card cb-row', style: 'margin-top:8px' },
              this.f('Hold fix', this.fixSel(hd.fix, (v) => { hd.fix = v; if (st.type === 'hold') st.air.fix = v; })),
              this.f('Inbound course (°)', this.num(hd.inbound, (v) => (hd.inbound = v || 360), { min: 1, max: 360, step: 5 })),
              this.f('Turns', this.sel(hd.turn, [['R', 'Right (standard)'], ['L', 'Left']], (v) => (hd.turn = v))),
              this.f('Leg', this.sel(String(hd.legMin), [['1', '1 min'], ['1.5', '1.5 min'], ['2', '2 min']], (v) => (hd.legMin = Number(v)))),
              this.f('Altitude (ft)', this.num(hd.alt, (v) => (hd.alt = v), { min: 2000, max: 12000, step: 500 })),
              this.f('Circuits', this.num(hd.laps, (v) => (hd.laps = v), { min: 1, max: 6, step: 1 })),
            ));
          }
        }
        break;
      }
      case 5: {
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
      case 6: {
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
      case 7: {
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

  /** compact plate thumbnail of the chosen procedure (click → full plate in the EFB) */
  private platePreview(ap: ReturnType<typeof getApproach>) {
    const fins = ap.final.filter((l) => l.role === 'FAF' || l.role === 'IF');
    return h('div', { class: 'fs-pp' },
      h('button', { class: 'fs-pp-img', title: 'Open the plate in the EFB', onclick: () => { this.close(); this.hooks.openChart(ap.id); } }, h('div', { html: approachPlate(ap) })),
      h('div', { class: 'fs-pp-info' },
        h('b', {}, `${ap.airport} · ${ap.name}`),
        h('span', { class: `fs-src${ap.source === 'Generated' ? ' gen' : ''}` }, ap.source === 'Generated' ? 'Generated procedure (no official data)' : ap.source ? `Official · ${ap.source}` : 'Training region'),
        h('dl', {},
          h('dt', {}, 'Final course'), h('dd', {}, `${pad3(ap.finalCourse)}°`),
          ...fins.flatMap((l) => [h('dt', {}, l.role!), h('dd', {}, `${l.fix.ident}${l.altMin ? ` · ${l.altMin} ft` : ''}`)]),
          h('dt', {}, 'Minimums'), h('dd', {}, ap.minimums.slice(0, 2).map((m) => `${m.label} ${m.da ?? m.mda}`).join(' · ')),
          h('dt', {}, 'Missed'), h('dd', {}, ap.missedText),
        ),
        h('button', { class: 'btn sm', onclick: () => { this.close(); this.hooks.openChart(ap.id); } }, 'Open the plate'),
      ),
    );
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
    if (this.needsRegion()) {
      const r1 = this.rows[st.dep], r2 = this.rows[st.arr];
      this.side.append(
        h('div', { class: 'fs-kicker' }, 'Your flight'),
        h('h3', { class: 'fs-title' }, st.dep && st.arr ? `${st.dep} → ${st.arr}` : st.dep ? `${st.dep} → …` : 'Real world'),
        h('div', { class: 'fs-side-empty' },
          h('p', {}, !st.dep ? 'Start by choosing the departure airport.' : !st.arr ? 'Now choose the destination.' : this.loading ? 'Loading the navigation data, procedures and terrain for this flight…' : this.loadErr ? 'The region could not be loaded.' : 'Ready to load.'),
          r1 ? h('p', { class: 'muted' }, `${r1[0]} · ${r1[1]}`) : null,
          r2 ? h('p', { class: 'muted' }, `${r2[0]} · ${r2[1]}`) : null,
        ),
      );
      return;
    }
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
  private flyPending = false;
  /** real world chosen but the region for the chosen airports is not (yet) loaded */
  private needsRegion() {
    const st = this.st;
    return st.world === 'real' && !(currentRegion() && this.loadedKey === `${st.dep}|${st.arr}`);
  }
  private renderFoot() {
    clear(this.foot);
    const st = this.st;
    const c = setupToCircuit(st);
    const pendingLoad = this.needsRegion();
    // procedures of a region not loaded yet can't be validated — Fly loads first, then checks
    const errs = st.type === 'free' || pendingLoad ? [] : validate(c);
    const noAirports = st.world === 'real' && (!st.dep || !st.arr);
    const canFly = errs.length === 0 && !noAirports && !this.flyPending;
    this.foot.append(
      this.step > 0 ? h('button', { class: 'btn', onclick: () => { this.step--; this.render(); } }, '← Back') : h('span', {}),
      this.flyPending || this.loading ? h('span', { class: 'fs-errline fs-loading' }, this.progress || 'Loading…') : h('span', { class: 'fs-errline' }, noAirports ? 'Choose the departure and destination airports' : errs[0] ? `⚠ ${errs[0]}` : ''),
      h('span', { style: 'flex:1' }),
      st.type !== 'free' && !pendingLoad ? h('button', { class: 'btn ghost', disabled: !canFly, onclick: () => { circuitStore.save({ ...c, name: c.name }); this.toast?.(`Saved “${c.name}” to IFR circuits`); }, title: 'Save to the Flight Center → IFR circuits' }, 'Save as circuit') : h('span', {}),
      this.step < STEPS.length - 1 ? h('button', { class: 'btn', disabled: this.step === 0 && noAirports, onclick: () => { this.step++; this.render(); if (this.step === 1 && this.needsRegion() && !noAirports) void this.ensureRegion(); } }, 'Next →') : h('span', {}),
      h('button', { class: 'btn primary', disabled: !canFly, onclick: () => void this.fly() }, this.flyPending ? 'Loading…' : pendingLoad && !noAirports ? 'Load & fly ✈' : 'Fly ✈'),
    );
  }
  toast?: (m: string) => void;

  private async fly() {
    const st = this.st;
    this.save();
    if (this.needsRegion()) {
      if (!st.dep || !st.arr) { this.step = 0; this.loadErr = 'Choose the departure and the destination first.'; this.render(); return; }
      this.flyPending = true;
      this.renderFoot();
      await this.ensureRegion();
      this.flyPending = false;
      if (this.needsRegion()) { this.step = 0; this.render(); return; } // load failed: the error is on the Airports step
    }
    // build the circuit only now: a region load replaces the airports and approaches it refers to
    const c = setupToCircuit(st);
    const errs = st.type === 'free' ? [] : validate(c);
    if (errs.length) { this.render(); this.toast?.(errs[0]); return; }
    this.close();
    if (st.type !== 'free' && st.graded && c.legs.length) this.hooks.flyGraded(c, st);
    else this.hooks.flyFree(setupToScenario(st), st);
  }
}
