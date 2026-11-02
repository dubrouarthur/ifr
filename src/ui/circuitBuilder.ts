// Instructor circuit builder (pro-simulator IOS style).
import { h, clear } from './dom';
import { Modal, WX_PRESETS } from './modals';
import {
  PRESET_CIRCUITS, circuitStore, newCircuit, validate, legText, circuitPath, circuitStats, encodeCircuit, decodeCircuit, AIRPORT_RUNWAYS,
  type Circuit, type CircuitLeg,
} from '../train/circuits';
import { FIXES, APPROACHES, AIRPORTS, approach as getApproach, findFix } from '../nav/data';
import { FAILURE_LABELS, type Failures } from '../sim/sim';
import { toLocal, type LatLon } from '../nav/geo';
import { racetrack } from '../nav/holding';

const FIX_IDS = [...new Set(FIXES.filter((f) => f.kind !== 'runway' && f.kind !== 'airport').map((f) => f.ident))].sort();
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export class CircuitBuilder extends Modal {
  private c: Circuit = clone(PRESET_CIRCUITS[0]);
  private dirty = false;
  private list!: HTMLElement;
  private ed!: HTMLElement;
  private pv!: HTMLElement;
  private errs!: HTMLElement;

  constructor(private onFly: (c: Circuit) => void, private toast: (m: string, k?: 'info' | 'good' | 'warn' | 'bad') => void) {
    super('IFR circuit builder');
    this.box.classList.add('cb');
    clear(this.body);
    this.list = h('nav', { class: 'cb-list' });
    this.ed = h('section', { class: 'cb-ed' });
    this.pv = h('aside', { class: 'cb-pv' });
    this.body.append(h('div', { class: 'cb-grid' }, this.list, this.ed, this.pv));
    this.errs = h('div', { class: 'cb-errs' });
  }

  edit(c?: Circuit) {
    if (c) this.c = clone(c);
    if (this.c.preset) this.c = { ...this.c, id: `c${Date.now().toString(36)}`, preset: false, name: `${this.c.name} (copy)` };
    this.dirty = false;
    this.render();
    this.open();
  }

  private changed(full = false) {
    this.dirty = true;
    if (full) this.renderEditor();
    this.renderPreview();
    this.renderFooter();
  }

  private render() {
    this.renderList();
    this.renderEditor();
    this.renderPreview();
    this.renderFooter();
  }

  // ---------------------------------------------------------------- library
  private renderList() {
    clear(this.list);
    this.list.append(h('button', { class: 'btn primary', style: 'width:100%;justify-content:center', onclick: () => { this.c = newCircuit(); this.dirty = true; this.render(); } }, '+ New circuit'));
    const item = (c: Circuit, preset: boolean) =>
      h('button', { class: `cb-item${c.id === this.c.id ? ' on' : ''}`, onclick: () => { this.c = clone(c); this.dirty = false; this.render(); } },
        h('b', {}, c.name), h('small', {}, `${c.legs.length} legs · ~${circuitStats(c).minutes} min${preset ? ' · preset' : ''}`));
    const mine = circuitStore.list();
    this.list.append(h('div', { class: 'fc-sec' }, `My circuits (${mine.length})`));
    if (!mine.length) this.list.append(h('p', { class: 'muted', style: 'font-size:12px;margin:4px 8px' }, 'Saved circuits appear here (stored in this browser). Export them to share between computers.'));
    mine.forEach((c) => this.list.append(item(c, false)));
    this.list.append(h('div', { class: 'fc-sec' }, 'School presets'));
    PRESET_CIRCUITS.forEach((c) => this.list.append(item(c, true)));
    const file = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' }) as HTMLInputElement;
    file.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const arr: Circuit[] = Array.isArray(data) ? data : [data];
        arr.forEach((c) => { if (c.legs && c.start) circuitStore.save({ ...c, id: c.id || `c${Date.now().toString(36)}` }); });
        this.toast(`Imported ${arr.length} circuit(s)`, 'good');
        this.renderList();
      } catch {
        this.toast('Not a valid circuit file', 'bad');
      }
    });
    this.list.append(h('div', { class: 'fc-sec' }, 'Exchange'), file,
      h('button', { class: 'btn', style: 'width:100%', onclick: () => file.click() }, 'Import JSON…'),
      h('button', { class: 'btn', style: 'width:100%;margin-top:6px', onclick: () => this.download(circuitStore.list(), 'ifr-circuits-library.json') }, 'Export my library'),
    );
  }

  // ---------------------------------------------------------------- editor
  private num(value: number | null, on: (v: number | null) => void, o: { min?: number; max?: number; step?: number; ph?: string; w?: number } = {}) {
    const i = h('input', { type: 'number', value: value ?? '', min: o.min, max: o.max, step: o.step ?? 1, placeholder: o.ph ?? '', style: `width:${o.w ?? 84}px` }) as HTMLInputElement;
    i.addEventListener('change', () => { on(i.value === '' ? null : Number(i.value)); this.changed(); });
    i.addEventListener('keydown', (e) => e.stopPropagation());
    return i;
  }
  private sel<T extends string>(value: T, opts: [T, string][], on: (v: T) => void, full = false) {
    const s = h('select', {}, ...opts.map(([v, l]) => h('option', { value: v, selected: v === value }, l))) as HTMLSelectElement;
    s.addEventListener('change', () => { on(s.value as T); this.changed(full); });
    return s;
  }
  private fixSel(value: string, on: (v: string) => void) {
    return this.sel(value, FIX_IDS.map((f) => [f, `${f} · ${findFix(f)!.kind.toUpperCase()}`] as [string, string]), on);
  }
  private field(label: string, ...els: (HTMLElement | string)[]) {
    return h('label', { class: 'cb-f' }, h('span', {}, label), ...els);
  }

  private renderEditor() {
    clear(this.ed);
    const c = this.c;
    const name = h('input', { type: 'text', value: c.name, class: 'cb-name', placeholder: 'Circuit name' }) as HTMLInputElement;
    name.addEventListener('input', () => { c.name = name.value; this.dirty = true; this.renderFooter(); });
    name.addEventListener('keydown', (e) => e.stopPropagation());
    const desc = h('textarea', { rows: 2, placeholder: 'Briefing / objectives for the student (optional)' }, c.description) as HTMLTextAreaElement;
    desc.addEventListener('input', () => { c.description = desc.value; this.dirty = true; });
    desc.addEventListener('keydown', (e) => e.stopPropagation());
    this.ed.append(name, desc);

    // start
    this.ed.append(h('div', { class: 'cb-sec' }, '1 · Start position'));
    const st = c.start;
    const startBox = h('div', { class: 'cb-card' },
      h('div', { class: 'seg' },
        h('button', { class: st.type === 'runway' ? 'on' : '', onclick: () => { c.start = { type: 'runway', airport: 'PARD', runway: '27', initialAlt: 3000 }; this.changed(true); } }, 'On the runway'),
        h('button', { class: st.type === 'air' ? 'on' : '', onclick: () => { c.start = { type: 'air', fix: 'ARD', bearing: 90, distNm: 12, altFt: 3000, hdg: null, iasKt: 95 }; this.changed(true); } }, 'Airborne'),
      ),
    );
    if (st.type === 'runway') {
      startBox.append(h('div', { class: 'cb-row' },
        this.field('Runway', this.sel(`${st.airport}|${st.runway}`, AIRPORT_RUNWAYS.map((r) => [`${r.airport}|${r.runway}`, `${r.airport} RWY ${r.runway}`] as [string, string]), (v) => { const [a, r] = v.split('|'); st.airport = a; st.runway = r; })),
        this.field('Initial climb (ft)', this.num(st.initialAlt, (v) => (st.initialAlt = v ?? 3000), { min: 1000, max: 15000, step: 100 })),
      ));
    } else {
      startBox.append(h('div', { class: 'cb-row' },
        this.field('Reference fix', this.fixSel(st.fix, (v) => (st.fix = v))),
        this.field('Bearing from fix (°)', this.num(st.bearing, (v) => (st.bearing = ((v ?? 0) + 360) % 360), { min: 0, max: 359 })),
        this.field('Distance (NM)', this.num(st.distNm, (v) => (st.distNm = Math.max(0.5, v ?? 10)), { min: 0.5, max: 60, step: 0.5 })),
        this.field('Altitude (ft)', this.num(st.altFt, (v) => (st.altFt = v ?? 3000), { min: 1000, max: 15000, step: 100 })),
        this.field('Heading (°)', this.num(st.hdg, (v) => (st.hdg = v), { ph: 'to fix' })),
        this.field('IAS (kt)', this.num(st.iasKt, (v) => (st.iasKt = v ?? 95), { min: 60, max: 140 })),
      ));
    }
    this.ed.append(startBox);

    // legs
    this.ed.append(h('div', { class: 'cb-sec' }, `2 · Legs (${c.legs.length})`));
    c.legs.forEach((l, i) => this.ed.append(this.legRow(l, i)));
    const add = (l: CircuitLeg) => { c.legs.push(l); this.changed(true); };
    this.ed.append(h('div', { class: 'cb-add' },
      h('button', { class: 'btn', onclick: () => add({ type: 'fix', ident: 'ARD', alt: null }) }, '+ Route fix'),
      h('button', { class: 'btn', onclick: () => add({ type: 'alt', alt: 4000 }) }, '+ Altitude change'),
      h('button', { class: 'btn', onclick: () => add({ type: 'hold', ident: 'ARD', inbound: 270, turn: 'R', legMin: 1, alt: 3000, laps: 2 }) }, '+ Hold'),
      h('button', { class: 'btn', onclick: () => add({ type: 'approach', approachId: 'PARD-I27', transition: null, outcome: 'land' }) }, '+ Approach'),
    ));

    // weather
    this.ed.append(h('div', { class: 'cb-sec' }, '3 · Weather'));
    const w = c.weather;
    this.ed.append(h('div', { class: 'cb-card' },
      h('div', { class: 'cb-row' },
        this.field('Preset', this.sel('', [['', 'Apply a preset…'], ...WX_PRESETS.slice(1).map((p) => [p.id, `${p.name} — ${p.desc}`] as [string, string])], (v) => { const p = WX_PRESETS.find((x) => x.id === v); if (p) Object.assign(w, p.wx); }, true)),
      ),
      h('div', { class: 'cb-row' },
        this.field('Ceiling AGL (ft)', this.num(w.ceilingFt ?? 20000, (v) => (w.ceilingFt = v ?? 20000), { min: 0, max: 20000, step: 50 })),
        this.field('Visibility (SM)', this.num(w.visibilitySm ?? 10, (v) => (w.visibilitySm = v ?? 10), { min: 0.25, max: 10, step: 0.25 })),
        this.field('Wind from (°)', this.num(w.windDir ?? 250, (v) => (w.windDir = v ?? 0), { min: 0, max: 359, step: 10 })),
        this.field('Wind (kt)', this.num(w.windKt ?? 0, (v) => (w.windKt = v ?? 0), { min: 0, max: 45 })),
        this.field('Gusts (kt)', this.num(w.gustKt ?? 0, (v) => (w.gustKt = v ?? 0), { min: 0, max: 50 })),
        this.field('Turbulence', this.sel(String([0, 0.15, 0.4, 0.7].reduce((a, b) => (Math.abs(b - (w.turbulence ?? 0.15)) < Math.abs(a - (w.turbulence ?? 0.15)) ? b : a))), [['0', 'None'], ['0.15', 'Light'], ['0.4', 'Moderate'], ['0.7', 'Severe']], (v) => (w.turbulence = Number(v)))),
        this.field('QNH (inHg)', this.num(w.qnh ?? 29.92, (v) => (w.qnh = v ?? 29.92), { min: 28.5, max: 31, step: 0.01 })),
      ),
    ));

    // failures
    this.ed.append(h('div', { class: 'cb-sec' }, `4 · Scheduled failures (${c.failures.length})`));
    const fbox = h('div', { class: 'cb-card' });
    c.failures.forEach((f, k) => {
      fbox.append(h('div', { class: 'cb-row' },
        this.field('Failure', this.sel(f.key, (Object.keys(FAILURE_LABELS) as (keyof Failures)[]).map((x) => [x, FAILURE_LABELS[x]] as [keyof Failures, string]), (v) => (f.key = v))),
        this.field('Trigger', this.sel(f.trigger, [['time', 'After N minutes'], ['leg', 'At the start of leg #']], (v) => (f.trigger = v), true)),
        this.field(f.trigger === 'time' ? 'Minutes' : 'Leg #', this.num(f.at, (v) => (f.at = v ?? 1), { min: f.trigger === 'time' ? 0.5 : 1, step: f.trigger === 'time' ? 0.5 : 1 })),
        h('button', { class: 'btn danger cb-x', title: 'Remove', onclick: () => { c.failures.splice(k, 1); this.changed(true); } }, '✕'),
      ));
    });
    fbox.append(h('button', { class: 'btn', onclick: () => { c.failures.push({ key: 'gs', trigger: 'time', at: 5 }); this.changed(true); } }, '+ Add failure'));
    this.ed.append(fbox);

    // options
    this.ed.append(h('div', { class: 'cb-sec' }, '5 · Options'));
    this.ed.append(h('div', { class: 'cb-card cb-row' },
      this.field('Autopilot', this.sel(c.allowAp ? 'y' : 'n', [['y', 'Allowed'], ['n', 'Not allowed (hand-flown)']], (v) => (c.allowAp = v === 'y'))),
      this.field('Mode', this.sel(c.mode, [['training', 'Training (coached)'], ['checkride', 'Checkride (ACS)']], (v) => (c.mode = v))),
      this.field('Cockpit', this.sel(c.cockpit ?? '', [['', 'Student’s choice'], ['g1000', 'G1000 glass'], ['steam', 'Steam gauges'], ['airliner', 'Airliner']], (v) => (c.cockpit = (v || null) as Circuit['cockpit']))),
    ));
  }

  private legRow(l: CircuitLeg, i: number): HTMLElement {
    const c = this.c;
    const move = (d: number) => {
      const j = i + d;
      if (j < 0 || j >= c.legs.length) return;
      [c.legs[i], c.legs[j]] = [c.legs[j], c.legs[i]];
      this.changed(true);
    };
    const icon = l.type === 'fix' ? '◆' : l.type === 'alt' ? '⇅' : l.type === 'hold' ? '⟳' : '🛬';
    const body = h('div', { class: 'cb-row' });
    if (l.type === 'fix') {
      body.append(this.field('Fix', this.fixSel(l.ident, (v) => (l.ident = v))), this.field('Altitude (ft)', this.num(l.alt, (v) => (l.alt = v), { ph: 'keep', step: 100 })));
    } else if (l.type === 'alt') {
      body.append(this.field('Assigned altitude (ft)', this.num(l.alt, (v) => (l.alt = v ?? 3000), { min: 1000, max: 15000, step: 100 })));
    } else if (l.type === 'hold') {
      body.append(
        this.field('Hold fix', this.fixSel(l.ident, (v) => (l.ident = v))),
        this.field('Inbound course (°)', this.num(l.inbound, (v) => (l.inbound = ((Math.round(v ?? 360) % 360) + 360) % 360 || 360), { min: 1, max: 360 })),
        this.field('Turns', this.sel(l.turn, [['R', 'Right (standard)'], ['L', 'Left']], (v) => (l.turn = v))),
        this.field('Leg', this.sel(String(l.legMin), [['1', '1 min'], ['1.5', '1.5 min'], ['2', '2 min']], (v) => (l.legMin = Number(v)))),
        this.field('Altitude (ft)', this.num(l.alt, (v) => (l.alt = v ?? 3000), { min: 1000, max: 15000, step: 100 })),
        this.field('Circuits', this.num(l.laps, (v) => (l.laps = Math.max(1, Math.min(6, v ?? 1))), { min: 1, max: 6, w: 64 })),
      );
    } else {
      const ap = getApproach(l.approachId);
      body.append(
        this.field('Approach', this.sel(l.approachId, APPROACHES.map((a) => [a.id, `${a.airport} ${a.name}`] as [string, string]), (v) => { l.approachId = v; l.transition = null; }, true)),
        this.field('Transition', this.sel(l.transition ?? '', [['', 'Vectors to final'], ...ap.transitions.map((t) => [t.name, t.name] as [string, string])], (v) => (l.transition = v || null))),
        this.field('Outcome', this.sel(l.outcome, [['missed', 'Missed approach → continue'], ['land', 'Full-stop landing']], (v) => (l.outcome = v))),
      );
    }
    return h('div', { class: `cb-leg ${l.type}` },
      h('div', { class: 'cb-leg-h' },
        h('span', { class: 'cb-n' }, String(i + 1)),
        h('span', { class: 'cb-ic' }, icon),
        h('b', {}, legText(l)),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn cb-x', title: 'Move up', onclick: () => move(-1) }, '↑'),
        h('button', { class: 'btn cb-x', title: 'Move down', onclick: () => move(1) }, '↓'),
        h('button', { class: 'btn cb-x', title: 'Duplicate', onclick: () => { c.legs.splice(i + 1, 0, clone(l)); this.changed(true); } }, '⧉'),
        h('button', { class: 'btn danger cb-x', title: 'Delete', onclick: () => { c.legs.splice(i, 1); this.changed(true); } }, '✕'),
      ),
      body,
    );
  }

  // ---------------------------------------------------------------- preview
  private renderPreview() {
    clear(this.pv);
    const c = this.c;
    const pts = circuitPath(c);
    const st = circuitStats(c);
    const W = 360;
    const H = 360;
    const near = AIRPORTS.filter((a) => pts.some((p) => Math.abs(p.lat - a.lat) < 0.25 && Math.abs(p.lon - a.lon) < 0.35));
    const all: LatLon[] = pts.length ? [...pts, ...near] : [...AIRPORTS];
    const ref = all[0];
    const loc = all.map((p) => toLocal(ref, p));
    const minX = Math.min(...loc.map((p) => p.x)) - 3, maxX = Math.max(...loc.map((p) => p.x)) + 3;
    const minY = Math.min(...loc.map((p) => p.y)) - 3, maxY = Math.max(...loc.map((p) => p.y)) + 3;
    const sc = Math.min(W / (maxX - minX), H / (maxY - minY));
    const P = (p: LatLon) => {
      const l = toLocal(ref, p);
      return { x: (l.x - minX) * sc + (W - (maxX - minX) * sc) / 2, y: H - ((l.y - minY) * sc + (H - (maxY - minY) * sc) / 2) };
    };
    let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" rx="12" fill="#081018"/>`;
    for (const a of AIRPORTS) {
      for (let k = 0; k < a.runways.length; k += 2) {
        const r1 = P(a.runways[k].threshold), r2 = P(a.runways[k].end);
        svg += `<line x1="${r1.x}" y1="${r1.y}" x2="${r2.x}" y2="${r2.y}" stroke="#cfd6dd" stroke-width="3"/>`;
      }
      const p = P(a);
      svg += `<text x="${p.x + 8}" y="${p.y - 8}" fill="#9fb0c0" font-size="11" font-weight="700" font-family="Inter">${a.icao}</text>`;
    }
    // path
    const line = pts.map((p) => P(p));
    for (let k = 1; k < line.length; k++) {
      const appr = pts[k].kind === 'approach';
      svg += `<line x1="${line[k - 1].x.toFixed(1)}" y1="${line[k - 1].y.toFixed(1)}" x2="${line[k].x.toFixed(1)}" y2="${line[k].y.toFixed(1)}" stroke="${appr ? '#ff5cf4' : '#00e4ff'}" stroke-width="2.2" ${appr ? '' : 'stroke-dasharray="6 4"'}/>`;
    }
    for (const l of c.legs) {
      if (l.type !== 'hold') continue;
      const f = findFix(l.ident);
      if (!f) continue;
      const rt = racetrack({ fix: { ident: f.ident, lat: f.lat, lon: f.lon }, inbound: l.inbound, turn: l.turn, legMin: l.legMin, altFt: l.alt }, 90).map(P);
      svg += `<polygon points="${rt.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="rgba(255,210,58,.12)" stroke="#ffd23a" stroke-width="2"/>`;
    }
    const seen = new Set<string>();
    pts.forEach((p, k) => {
      const q = line[k];
      if (seen.has(p.ident)) return;
      seen.add(p.ident);
      const col = p.kind === 'start' ? '#2bd576' : p.kind === 'hold' ? '#ffd23a' : p.kind === 'approach' ? '#ff9cf8' : '#00e4ff';
      svg += p.kind === 'start' ? `<circle cx="${q.x}" cy="${q.y}" r="6" fill="#2bd576"/>` : `<circle cx="${q.x}" cy="${q.y}" r="3.5" fill="${col}"/>`;
      if (p.kind !== 'approach' || /IAF|FAF/.test(p.ident) || k === line.length - 1 || !p.ident.startsWith('RW')) svg += `<text x="${q.x + 6}" y="${q.y + 12}" fill="${col}" font-size="10.5" font-family="Inter">${p.ident}</text>`;
    });
    svg += `<g font-family="Inter" font-size="10" fill="#8b97a4"><text x="10" y="${H - 10}"><tspan fill="#2bd576">● start</tspan>  <tspan fill="#00e4ff">route</tspan>  <tspan fill="#ffd23a">hold</tspan>  <tspan fill="#ff5cf4">approach</tspan></text></g></svg>`;
    this.pv.append(h('div', { class: 'cb-map', html: svg }));
    this.pv.append(
      h('div', { class: 'ios-stat', style: 'margin-top:10px' },
        h('div', {}, h('small', {}, 'Legs'), h('b', {}, String(c.legs.length))),
        h('div', {}, h('small', {}, 'Distance'), h('b', {}, `${st.distNm.toFixed(0)} NM`)),
        h('div', {}, h('small', {}, 'Est. time'), h('b', {}, `${st.minutes} min`)),
        h('div', {}, h('small', {}, 'Approaches'), h('b', {}, String(c.legs.filter((l) => l.type === 'approach').length))),
      ),
      h('div', { class: 'section-t' }, 'Sequence'),
      h('ol', { class: 'cb-seq' }, h('li', {}, c.start.type === 'runway' ? `Take off ${c.start.airport} RWY ${c.start.runway}, climb ${c.start.initialAlt}` : `Start airborne near ${c.start.fix}, ${c.start.altFt} ft`), ...c.legs.map((l, i) => h('li', {}, legText(l), ...c.failures.filter((f) => f.trigger === 'leg' && f.at === i + 1).map((f) => h('em', {}, ` ⚠ ${FAILURE_LABELS[f.key]} fails`))))),
    );
    const tf = c.failures.filter((f) => f.trigger === 'time');
    if (tf.length) this.pv.append(h('p', { class: 'muted', style: 'font-size:12px' }, tf.map((f) => `⚠ ${FAILURE_LABELS[f.key]} at +${f.at} min`).join(' · ')));
  }

  // ---------------------------------------------------------------- footer
  private renderFooter() {
    clear(this.foot);
    const e = validate(this.c);
    clear(this.errs);
    if (e.length) this.errs.append(...e.slice(0, 3).map((x) => h('div', {}, `⚠ ${x}`)));
    else this.errs.append(h('div', { class: 'ok' }, '✓ Circuit is valid'));
    const saved = circuitStore.list().some((x) => x.id === this.c.id);
    this.foot.append(
      this.errs,
      h('span', { style: 'flex:1' }),
      saved ? h('button', { class: 'btn danger', onclick: () => { if (confirm(`Delete “${this.c.name}”?`)) { circuitStore.remove(this.c.id); this.c = clone(PRESET_CIRCUITS[0]); this.render(); } } }, 'Delete') : h('span', {}),
      h('button', { class: 'btn', onclick: () => { this.c = { ...clone(this.c), id: `c${Date.now().toString(36)}`, name: `${this.c.name} (copy)`, preset: false }; this.dirty = true; this.render(); } }, 'Duplicate'),
      h('button', { class: 'btn', onclick: () => this.download(this.c, `${this.c.name.replace(/[^\w-]+/g, '_')}.json`) }, 'Export'),
      h('button', { class: 'btn', onclick: () => this.share() }, '🔗 Share link'),
      h('button', { class: `btn${this.dirty ? ' primary' : ''}`, disabled: e.length > 0, onclick: () => this.save() }, this.dirty ? 'Save' : 'Saved'),
      h('button', { class: 'btn primary', disabled: e.length > 0, onclick: () => { this.save(true); this.close(); this.onFly(clone(this.c)); } }, 'Fly circuit ✈'),
    );
  }

  private save(quiet = false) {
    if (this.c.preset) this.c = { ...this.c, preset: false };
    circuitStore.save(this.c);
    this.dirty = false;
    if (!quiet) this.toast(`Saved “${this.c.name}”`, 'good');
    this.renderList();
    this.renderFooter();
  }

  private async share() {
    const url = `${location.origin}${location.pathname}#circuit=${encodeCircuit(this.c)}`;
    try {
      await navigator.clipboard.writeText(url);
      this.toast('Share link copied — students open it to fly this circuit', 'good');
    } catch {
      prompt('Copy this link:', url);
    }
  }

  private download(data: unknown, name: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}

export { decodeCircuit };
