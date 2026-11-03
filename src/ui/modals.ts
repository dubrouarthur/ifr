import { h, clear, fmtTime, store } from './dom';
import { svgIcon, I } from './icons';
import { RouteMap, MAP_COL } from './routeMap';
import type { Circuit, CircuitLeg } from '../train/circuits';
import type { Attempt } from './history';
import { SCENARIOS, type Scenario, type Sim, type AssessSettings } from '../sim/sim';
import type { Weather } from '../sim/environment';
import { APPROACHES, FIXES, runway, findFix, groundElevation } from '../nav/data';
import { approachPlate } from '../plates/plates';
import { computeDebrief, evaluateAcs, type Recorder, type ScoreItem } from '../sim/recorder';
import { history } from './history';
import { webhookCfg, postWebhook } from '../connect/webhook';
import { trackGpx, trackKml, download } from '../connect/exports';
import { AXIS_LABELS, BUTTON_LABELS, AxisDetector, type AxisName, type ButtonAction, type InputManager } from '../sim/input';
import { alongTrackNm, destination, distanceNm, FT_PER_NM, type LatLon } from '../nav/geo';

export class Modal {
  bg: HTMLElement;
  box: HTMLElement;
  body: HTMLElement;
  foot: HTMLElement;
  onClose?: () => void;
  constructor(title: string, size: '' | 'sm' | 'md' = '') {
    this.body = h('div', { class: 'body' });
    this.foot = h('footer', {});
    this.box = h('div', { class: `modal ${size}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', {}, h('h2', {}, title), h('button', { class: 'x', onclick: () => this.close(), 'aria-label': 'Close' }, '×')),
      this.body,
      this.foot,
    );
    this.bg = h('div', { class: 'modal-bg', onclick: (e: Event) => e.target === this.bg && this.close() }, this.box);
    document.body.append(this.bg);
  }
  get isOpen() {
    return this.bg.classList.contains('open');
  }
  open() {
    Modal.closeAll();
    this.bg.classList.add('open');
    Modal.stack.push(this);
  }
  close() {
    this.bg.classList.remove('open');
    Modal.stack = Modal.stack.filter((m) => m !== this);
    this.onClose?.();
  }
  static stack: Modal[] = [];
  static closeAll() {
    [...Modal.stack].forEach((m) => m.close());
  }
  static anyOpen() {
    return Modal.stack.length > 0;
  }
}

// ----------------------------------------------------------------- weather presets
export interface WxPreset {
  id: string;
  name: string;
  desc: string;
  wx: Partial<Weather>;
}
export const WX_PRESETS: WxPreset[] = [
  { id: 'scenario', name: 'Scenario default', desc: 'As briefed', wx: {} },
  { id: 'cavok', name: 'CAVOK', desc: 'Clear, 10 SM, calm', wx: { ceilingFt: 20000, visibilitySm: 10, windKt: 4, gustKt: 0, turbulence: 0.03 } },
  { id: 'mvfr', name: 'Marginal VFR', desc: 'OVC 2500, 5 SM', wx: { ceilingFt: 2500, visibilitySm: 5, windKt: 8, turbulence: 0.1 } },
  { id: 'imc', name: 'Low IMC', desc: 'OVC 800, 2 SM', wx: { ceilingFt: 800, visibilitySm: 2, windKt: 10, turbulence: 0.15 } },
  { id: 'mins', name: 'At minimums', desc: 'OVC 280, ½ SM fog', wx: { ceilingFt: 280, visibilitySm: 0.5, windKt: 6, turbulence: 0.1 } },
  { id: 'below', name: 'Below minimums', desc: 'OVC 150 — fly the miss', wx: { ceilingFt: 150, visibilitySm: 0.25, windKt: 5, turbulence: 0.1 } },
  { id: 'xwind', name: 'Gusty crosswind', desc: '18G28 kt, moderate chop', wx: { ceilingFt: 1100, visibilitySm: 3, windKt: 18, gustKt: 28, turbulence: 0.45 } },
  { id: 'storm', name: 'Rough day', desc: 'OVC 600, 1 SM, turbulence', wx: { ceilingFt: 600, visibilitySm: 1, windKt: 22, gustKt: 32, turbulence: 0.7 } },
];

// ----------------------------------------------------------------- launcher
export class Launcher extends Modal {
  private sel: Scenario = SCENARIOS[1];
  private wx: WxPreset = WX_PRESETS[0];
  private filter = 'All';
  assess: AssessSettings = store.get<AssessSettings>('ifr.assess', { mode: 'training', student: '', handFlown: false, randomFailure: false });
  constructor(private onFly: (sc: Scenario, wx: WxPreset, a: AssessSettings) => void) {
    super('Choose your flight');
    this.render();
  }
  render() {
    clear(this.body);
    clear(this.foot);
    const best = store.get<Record<string, { score: number; grade: string }>>('ifr.best', {});
    this.body.append(
      h('div', { class: 'hero' },
        h('div', {},
          h('h1', {}, 'Fly real IFR. In your browser.'),
          h('p', {}, 'A G1000-style glass cockpit with a GFC700-class autopilot, every approach type — ILS, LOC, back course, VOR/DME, NDB, RNAV LPV and LNAV/VNAV — generated approach plates, joystick support and a scored debrief after every flight.'),
        ),
        h('div', { class: 'feat' },
          h('div', {}, h('b', {}, '7 approach types'), 'Precision, APV and non-precision, with holds and missed approaches.'),
          h('div', {}, h('b', {}, 'Charts'), 'Approach plates & airport diagrams with own-ship.'),
          h('div', {}, h('b', {}, 'Joystick ready'), 'Yokes, HOTAS, gamepads — auto-detect mapping.'),
          h('div', {}, h('b', {}, 'Debrief'), 'ACS-style scoring, track & profile replay.'),
        ),
      ),
    );
    const kinds = ['All', 'Precision', 'APV', 'Non-precision', 'Departure', 'Holding', 'Free flight'];
    this.body.append(h('div', { class: 'filter' }, ...kinds.map((k) => h('button', { class: this.filter === k ? 'on' : '', onclick: () => { this.filter = k; this.render(); } }, k))));
    const cards = h('div', { class: 'cards' });
    for (const sc of SCENARIOS.filter((s) => this.filter === 'All' || s.kind === this.filter)) {
      const b = best[sc.id];
      cards.append(
        h('button', { class: `card${sc === this.sel ? ' sel' : ''}`, onclick: () => { this.sel = sc; this.render(); }, ondblclick: () => this.fly() },
          b ? h('span', { class: 'score-badge', title: 'Your best' }, `${b.grade} · ${b.score}`) : null,
          h('span', { class: `k ${sc.kind.split(' ')[0]}` }, sc.kind),
          h('h3', {}, sc.name),
          h('p', {}, sc.description),
          h('div', { class: 'meta' }, h('span', { class: 'dots', title: `Difficulty ${sc.difficulty}/3` }, ...[1, 2, 3].map((i) => h('i', { class: i <= sc.difficulty ? 'on' : '' }))), h('span', {}, sc.approachId ? 'Plate available' : '')),
        ),
      );
    }
    this.body.append(cards);
    this.body.append(h('div', { class: 'section-t' }, 'Weather'));
    this.body.append(h('div', { class: 'wx-presets' }, ...WX_PRESETS.map((w) => h('button', { class: w === this.wx ? 'on' : '', onclick: () => { this.wx = w; this.render(); } }, h('b', {}, w.name), h('span', {}, w.desc)))));
    this.body.append(h('div', { class: 'section-t' }, 'Session'));
    const a = this.assess;
    const save = () => store.set('ifr.assess', a);
    const name = h('input', { type: 'text', placeholder: 'Student name (for records)', value: a.student, oninput: (e: Event) => { a.student = (e.target as HTMLInputElement).value; save(); } });
    name.addEventListener('keydown', (e) => e.stopPropagation());
    this.body.append(
      h('div', { class: 'mode-box' },
        h('label', { class: 'field' }, h('b', {}, 'Student'), name),
        h('div', { class: 'field' }, h('b', {}, 'Mode'),
          h('div', { class: 'seg' },
            h('button', { class: a.mode === 'training' ? 'on' : '', onclick: () => { a.mode = 'training'; save(); this.render(); } }, 'Training (coached)'),
            h('button', { class: a.mode === 'checkride' ? 'on' : '', onclick: () => { a.mode = 'checkride'; save(); this.render(); } }, 'Checkride (ACS)'),
          ),
        ),
        h('div', { class: 'opts' },
          h('label', {}, h('input', { type: 'checkbox', checked: a.handFlown, disabled: a.mode !== 'checkride', onchange: (e: Event) => { a.handFlown = (e.target as HTMLInputElement).checked; save(); } }), ' Hand-flown (AP inhibited)'),
          h('label', {}, h('input', { type: 'checkbox', checked: a.randomFailure, disabled: a.mode !== 'checkride', onchange: (e: Event) => { a.randomFailure = (e.target as HTMLInputElement).checked; save(); } }), ' Random failure on the approach'),
        ),
      ),
    );
    if (a.mode === 'checkride') this.body.append(h('p', { class: 'muted', style: 'font-size:12.5px;margin:8px 0 0' }, 'Checkride: no coaching, no evaluation toasts. Graded PASS/FAIL against FAA Instrument ACS tolerances — ¾-scale deflection, DA/MDA discipline with visual references, published altitudes, missed approach, ±10 kt. The instructor station (I) can inject failures at any time.'));
    this.body.append(h('div', { class: 'section-t' }, 'Briefing — ' + this.sel.name), h('ul', { class: 'tips' }, ...this.sel.briefing.map((b) => h('li', {}, b))));
    this.foot.append(h('span', { style: 'flex:1;color:var(--muted);font-size:12px;align-self:center' }, 'Tip: double-click a card to fly immediately. Press ? in flight for all keyboard shortcuts.'));
    this.foot.append(h('button', { class: 'btn primary', onclick: () => this.fly() }, this.assess.mode === 'checkride' ? 'Start checkride' : 'Fly this scenario'));
  }
  private fly() {
    this.close();
    this.onFly(this.sel, this.wx, { ...this.assess });
  }
}

// ----------------------------------------------------------------- weather
export class WeatherModal extends Modal {
  constructor(private sim: Sim) {
    super('Weather & environment', 'md');
  }
  open() {
    this.render();
    super.open();
  }
  render() {
    clear(this.body);
    clear(this.foot);
    const w = this.sim.weather;
    const field = (label: string, key: keyof Weather, min: number, max: number, step: number, fmt: (v: number) => string) => {
      const out = h('span', {}, fmt(w[key] as number));
      const inp = h('input', { type: 'range', min, max, step, value: w[key] as number }) as HTMLInputElement;
      inp.addEventListener('input', () => {
        (w as unknown as Record<string, number>)[key] = Number(inp.value);
        out.textContent = fmt(Number(inp.value));
      });
      return h('label', { class: 'field' }, h('b', {}, label, out), inp);
    };
    this.body.append(h('div', { class: 'wx-presets' }, ...WX_PRESETS.slice(1).map((p) => h('button', { onclick: () => { Object.assign(w, p.wx); this.render(); } }, h('b', {}, p.name), h('span', {}, p.desc)))));
    this.body.append(
      h('div', { class: 'form' },
        field('Ceiling (AGL)', 'ceilingFt', 0, 20000, 50, (v) => (v >= 15000 ? 'Clear' : `${v} ft`)),
        field('Cloud tops (MSL)', 'cloudTopFt', 1000, 15000, 100, (v) => `${v} ft`),
        field('Visibility', 'visibilitySm', 0.25, 10, 0.25, (v) => `${v} SM`),
        field('Wind direction', 'windDir', 0, 359, 5, (v) => `${String(v).padStart(3, '0')}°`),
        field('Wind speed', 'windKt', 0, 40, 1, (v) => `${v} kt`),
        field('Turbulence', 'turbulence', 0, 1, 0.05, (v) => (v < 0.1 ? 'None' : v < 0.3 ? 'Light' : v < 0.6 ? 'Moderate' : 'Severe')),
        field('Altimeter (QNH)', 'qnh', 28.8, 30.8, 0.01, (v) => `${v.toFixed(2)} inHg`),
        field('Sea-level temp', 'oatSeaLevelC', -20, 40, 1, (v) => `${v} °C`),
      ),
    );
    this.body.append(h('p', { style: 'color:var(--muted);font-size:12.5px;margin-top:14px' }, 'Changes apply instantly. Remember to set your altimeter (B key or BARO knob) when the QNH changes.'));
    this.foot.append(h('button', { class: 'btn primary', onclick: () => this.close() }, 'Done'));
  }
}

// ----------------------------------------------------------------- procedures
export class ProcModal extends Modal {
  private apId: string;
  private trans: string | null = null;
  constructor(private sim: Sim, private onDone: (msg: string) => void) {
    super('Procedures', 'md');
    this.box.classList.add('proc');
    this.apId = APPROACHES[0].id;
  }
  open() {
    this.apId = this.sim.fp.approachId ?? this.apId;
    this.render();
    super.open();
  }
  render() {
    clear(this.body);
    clear(this.foot);
    const ap = APPROACHES.find((a) => a.id === this.apId)!;
    const left = h('div', {},
      h('div', { class: 'section-t first' }, 'Approach'),
      h('div', { class: 'list' }, ...APPROACHES.map((a) => h('button', { class: a.id === this.apId ? 'on' : '', onclick: () => { this.apId = a.id; this.trans = null; this.render(); } }, h('span', {}, `${a.airport} ${a.name}`), h('small', {}, a.category)))),
      h('div', { class: 'section-t' }, 'Transition'),
      h('div', { class: 'list' },
        h('button', { class: this.trans === null ? 'on' : '', onclick: () => { this.trans = null; this.render(); } }, h('span', {}, 'Vectors to final'), h('small', {}, 'VTF')),
        ...ap.transitions.map((t) => h('button', { class: this.trans === t.name ? 'on' : '', onclick: () => { this.trans = t.name; this.render(); } }, h('span', {}, t.name), h('small', {}, t.legs[0].altMin ? `IAF · ${t.legs[0].altMin} ft` : 'IAF'))),
      ),
    );
    const mins = ap.minimums.map((m) => `${m.label} ${m.da ? 'DA' : 'MDA'} ${m.da ?? m.mda}`).join(' · ');
    const right = h('div', {}, h('div', { class: 'plate-mini', html: approachPlate(ap) }), h('p', { class: 'proc-mins' }, mins));
    this.body.append(h('div', { class: 'two' }, left, right));
    const run = (mode: 'load' | 'activate') => {
      this.sim.loadApproach(this.apId, this.trans, this.trans === null && mode === 'activate' ? 'vtf' : mode);
      this.onDone(`${ap.airport} ${ap.name} ${mode === 'load' ? 'loaded' : 'activated'}${this.trans ? ' via ' + this.trans : ' (vectors)'}`);
      this.close();
    };
    const iaf = this.trans ? ap.transitions.find((t) => t.name === this.trans)?.legs[0]?.fix.ident ?? this.trans : null;
    this.foot.append(
      h('span', { class: 'foot-note' }, 'Load adds the approach to the flight plan; Activate also flies it.'),
      h('button', { class: 'btn', onclick: () => run('load') }, 'Load'),
      h('button', { class: 'btn primary', onclick: () => run('activate') }, iaf ? `Activate via ${iaf}` : 'Activate vectors-to-final'),
    );
  }
}

// ----------------------------------------------------------------- direct-to
export class DirectModal extends Modal {
  private input: HTMLInputElement;
  private list: HTMLElement;
  private idx = 0;
  constructor(private sim: Sim, private onDone: (msg: string) => void) {
    super('Direct-To', 'sm');
    this.input = h('input', { type: 'text', placeholder: 'Waypoint, VOR, NDB or airport (e.g. ARD, KEDDY)', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Identifier', style: 'text-transform:uppercase' }) as HTMLInputElement;
    this.box.classList.add('dto');
    this.list = h('div', { class: 'ac-list' });
    this.body.append(h('label', { class: 'field' }, h('b', {}, 'Identifier'), h('div', { class: 'ac' }, this.input, this.list)));
    this.input.addEventListener('input', () => { this.idx = 0; this.renderList(); });
    this.input.addEventListener('keydown', (e) => {
      const items = this.matches();
      if (e.key === 'ArrowDown') { this.idx = Math.min(items.length - 1, this.idx + 1); this.renderList(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { this.idx = Math.max(0, this.idx - 1); this.renderList(); e.preventDefault(); }
      if (e.key === 'Enter') { const f = items[this.idx]; if (f) this.go(f.ident); }
      e.stopPropagation();
    });
    this.foot.append(h('span', { class: 'foot-note' }, '↑ ↓ to choose · Enter to activate'), h('button', { class: 'btn primary', onclick: () => { const f = this.matches()[this.idx]; if (f) this.go(f.ident); } }, 'Activate'));
  }
  open() {
    super.open();
    this.input.value = this.sim.fp.out.valid ? this.sim.fp.out.toIdent : '';
    this.renderList();
    setTimeout(() => { this.input.focus(); this.input.select(); }, 30);
  }
  private matches() {
    const q = this.input.value.trim().toUpperCase();
    const seen = new Set<string>();
    return FIXES.filter((f) => !f.ident.startsWith('RW') && (!q || f.ident.startsWith(q)) && !seen.has(f.ident) && seen.add(f.ident))
      .sort((a, b) => distanceNm(this.sim.ac.s, a) - distanceNm(this.sim.ac.s, b))
      .slice(0, 8);
  }
  private renderList() {
    clear(this.list);
    const m = this.matches();
    m.forEach((f, i) => this.list.append(h('button', { class: i === this.idx ? 'on' : '', onclick: () => this.go(f.ident) }, h('b', {}, `${f.ident}`), h('small', {}, `${f.kind.toUpperCase()} · ${distanceNm(this.sim.ac.s, f).toFixed(1)} NM`))));
    if (!m.length) this.list.append(h('div', { class: 'ac-none' }, 'No waypoint starts with these letters.'));
  }
  private go(ident: string) {
    if (this.sim.directTo(ident)) this.onDone(`Direct ${ident}`);
    this.close();
  }
}

// ----------------------------------------------------------------- joystick
export class JoystickModal extends Modal {
  private listen: { kind: 'axis' | 'button'; name: string; det: AxisDetector } | null = null;
  private raf = 0;
  constructor(private input: InputManager) {
    super('Controllers', 'md');
    this.onClose = () => cancelAnimationFrame(this.raf);
  }
  open() {
    super.open();
    this.render();
    const tick = () => {
      this.live();
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }
  render() {
    clear(this.body);
    clear(this.foot);
    const pads = this.input.pads();
    const pad = this.input.current();
    if (!pad) {
      this.body.append(
        h('div', { class: 'joy-empty' },
          (() => { const ic = svgIcon(I.joystick, 40); ic.classList.add('empty-ico'); return ic; })(),
          h('h3', {}, 'No controller detected'),
          h('p', {}, 'Plug in your joystick, yoke, rudder pedals or gamepad and press any button on it. Browsers only expose controllers after a button press.'),
          h('p', { class: 'small' }, 'Works with Chrome, Edge and Firefox (Gamepad API). On the keyboard: arrow keys for the yoke, comma and period for the rudder, + / − or 1–0 for the throttle, Home / End for trim.'),
        ),
      );
      this.foot.append(h('button', { class: 'btn', onclick: () => this.render() }, 'Re-scan'));
      return;
    }
    const p = this.input.profile!;
    if (pads.length > 1) {
      const sel = h('select', { onchange: (e: Event) => { this.input.attach(Number((e.target as HTMLSelectElement).value)); this.render(); } }, ...pads.map((g) => h('option', { value: g.index, selected: g.index === pad.index }, g.id)));
      this.body.append(h('label', { class: 'field' }, h('b', {}, 'Controller'), sel));
    } else this.body.append(h('div', { class: 'chip live' }, pad.id.slice(0, 80)));
    this.body.append(h('div', { class: 'section-t' }, 'Axes — click Assign, then move the control'));
    const axes = h('div', { class: 'axes' });
    for (const name of Object.keys(AXIS_LABELS) as AxisName[]) {
      const m = p.axes[name];
      const listening = this.listen?.kind === 'axis' && this.listen.name === name;
      axes.append(
        h('div', { class: 'axis-row' },
          h('b', {}, AXIS_LABELS[name]),
          h('div', { class: 'bar', 'data-axis': name }, h('b', {}), h('i', {})),
          h('button', { class: `btn${listening ? ' listening' : ''}`, onclick: () => { this.listen = { kind: 'axis', name, det: new AxisDetector(() => this.input.current()) }; this.render(); } }, listening ? 'Move it…' : m.index === null ? 'Assign' : `Axis ${m.index}`),
          h('label', { class: 'ctl' }, h('input', { type: 'checkbox', checked: m.invert, onchange: (e: Event) => { m.invert = (e.target as HTMLInputElement).checked; this.input.saveProfile(); } }), 'Invert'),
          h('select', { title: 'Response curve', onchange: (e: Event) => { m.curve = Number((e.target as HTMLSelectElement).value); this.input.saveProfile(); } },
            ...[[0, 'Linear'], [0.3, 'Soft'], [0.6, 'Expo']].map(([v, l]) => h('option', { value: v, selected: Math.abs(m.curve - (v as number)) < 0.01 }, l as string))),
        ),
      );
    }
    this.body.append(axes);
    this.body.append(h('div', { class: 'section-t' }, 'Buttons — click a slot, then press the button'));
    const grid = h('div', { class: 'btn-grid' });
    for (const a of Object.keys(BUTTON_LABELS) as ButtonAction[]) {
      const idx = p.buttons[a];
      const listening = this.listen?.kind === 'button' && this.listen.name === a;
      grid.append(h('div', { class: 'row' }, h('span', {}, BUTTON_LABELS[a]), h('button', { class: `btn${listening ? ' listening' : ''}`, 'data-btn': idx ?? '', onclick: () => { this.listen = { kind: 'button', name: a, det: new AxisDetector(() => this.input.current()) }; this.render(); } }, listening ? 'Press…' : idx === undefined ? '—' : `Btn ${idx}`)));
    }
    this.body.append(grid);
    this.body.append(h('div', { class: 'section-t' }, 'Raw input'), h('div', { class: 'raw-axes', 'data-raw': '1' }));
    this.foot.append(h('button', { class: 'btn danger', onclick: () => { this.input.resetProfile(); this.render(); } }, 'Reset to defaults'), h('button', { class: 'btn primary', onclick: () => { this.input.saveProfile(); this.close(); } }, 'Save'));
  }
  private live() {
    const pad = this.input.current();
    if (!pad || !this.input.profile) return;
    const p = this.input.profile;
    for (const name of Object.keys(AXIS_LABELS) as AxisName[]) {
      const bar = this.body.querySelector(`[data-axis="${name}"]`) as HTMLElement | null;
      if (!bar) continue;
      const v = this.input.readAxis(pad, p.axes[name]) ?? 0;
      const i = bar.querySelector('i') as HTMLElement;
      const b = bar.querySelector('b') as HTMLElement;
      i.style.left = `${50 + v * 50}%`;
      b.style.left = v < 0 ? `${50 + v * 50}%` : '50%';
      b.style.width = `${Math.abs(v) * 50}%`;
    }
    const raw = this.body.querySelector('[data-raw]');
    if (raw) raw.innerHTML = pad.axes.map((v, i) => `<div>A${i} ${v.toFixed(2)}</div>`).join('') + pad.buttons.map((b, i) => (b.pressed ? `<div class="pill lit">B${i}</div>` : '')).join('');
    if (this.listen) {
      if (this.listen.kind === 'axis') {
        const a = this.listen.det.axis();
        if (a !== null) {
          p.axes[this.listen.name as AxisName].index = a;
          this.listen = null;
          this.input.saveProfile();
          this.render();
        }
      } else {
        const b = this.listen.det.button();
        if (b !== null) {
          p.buttons[this.listen.name as ButtonAction] = b;
          this.listen = null;
          this.input.saveProfile();
          this.render();
        }
      }
    }
  }
}

// ----------------------------------------------------------------- debrief
/** the training record of the current flight (one per flight: a later save replaces the earlier one) */
export function flightRecord(sim: Sim, db = computeDebrief(sim.rec, sim.av.minimums), acs = evaluateAcs(sim.rec)): Attempt {
  const rec = sim.rec;
  const ls = rec.lesson;
  const lessonScored = !!ls && ls.score !== undefined;
  const score = lessonScored ? ls!.score! : db.score;
  const letter = (v: number) => (v >= 90 ? 'A' : v >= 80 ? 'B' : v >= 70 ? 'C' : v >= 60 ? 'D' : 'F');
  return {
    id: String(rec.startedAt),
    date: new Date(rec.startedAt).toISOString(),
    student: rec.student,
    scenario: ls ? ls.title : sim.scenario?.id === 'lesson' ? 'Exercise' : sim.scenario?.name ?? '',
    approach: db.approachName ?? '',
    mode: rec.mode,
    score,
    grade: lessonScored ? letter(score) : db.grade,
    graded: lessonScored || db.graded,
    acs: acs.result,
    failedTasks: acs.items.filter((i) => i.result === 'FAIL').map((i) => i.task),
    failures: rec.failuresInjected,
    durationSec: db.durationSec,
    ...(ls ? { exercise: ls.id, exerciseTitle: ls.title, passed: ls.passed } : {}),
  };
}
const posted = new Map<string, string>();
/** save the flight in the training records (flights over ~30 s, and every lesson attempt) and post the school webhook */
export function saveFlightRecord(sim: Sim): Attempt | null {
  const rec = sim.rec;
  const db = computeDebrief(rec, sim.av.minimums);
  const acs = evaluateAcs(rec);
  if (db.durationSec < 30 && !rec.lesson && !rec.crashed) return null;
  const a = flightRecord(sim, db, acs);
  history.upsert(a);
  const sig = `${a.score}|${a.acs}|${a.graded}|${Math.round(a.durationSec / 30)}`;
  if (webhookCfg().auto && webhookCfg().url && posted.get(a.id) !== sig) {
    posted.set(a.id, sig);
    void postWebhook({ type: 'debrief', app: 'IFR Trainer', ...a, acsItems: acs.items, scoreItems: db.items, events: rec.events });
  }
  return a;
}

const DBF = { ink: '#1d2833', proc: MAP_COL.approach, missed: '#9a5b00', mins: '#b42318', good: '#13804b', grid: '#d0d5dd', axis: '#667085' } as const;

export class DebriefModal extends Modal {
  onReplay?: () => void;
  private map: RouteMap | null = null;
  private ro: ResizeObserver | null = null;
  private menu: HTMLElement | null = null;
  constructor(private sim: Sim, private onAgain: () => void, private onNew: () => void) {
    super('Flight debrief');
    this.box.classList.add('dbf');
    this.onClose = () => this.teardown();
  }
  open() {
    this.render();
    super.open();
  }
  private teardown() {
    this.map?.destroy();
    this.map = null;
    this.ro?.disconnect();
    this.ro = null;
  }
  render() {
    this.teardown();
    clear(this.body);
    clear(this.foot);
    const rec = this.sim.rec;
    const db = computeDebrief(rec, this.sim.av.minimums);
    const acs = evaluateAcs(rec);
    saveFlightRecord(this.sim);
    // persist the best graded score of a built-in scenario
    const sc = this.sim.scenario;
    if (sc && sc.id !== 'lesson' && db.graded) {
      const best = store.get<Record<string, { score: number; grade: string }>>('ifr.best', {});
      if (!best[sc.id] || best[sc.id].score < db.score) {
        best[sc.id] = { score: db.score, grade: db.grade };
        store.set('ifr.best', best);
      }
    }
    const title = rec.lesson?.title ?? (sc?.id === 'lesson' ? 'Exercise' : sc?.name ?? 'Free flight');
    this.body.append(
      h('div', { class: 'report-head' }, h('h2', { style: 'margin:0' }, `IFR Trainer — ${rec.mode === 'checkride' ? 'Checkride report' : 'Training debrief'}`), h('div', {}, `Student: ${rec.student || '—'} · ${new Date().toLocaleString()} · ${title}`)),
    );
    const sub = [rec.mode === 'checkride' ? 'Checkride' : 'Training', rec.student, title, db.approachName, `${fmtTime(db.durationSec)} flight time`].filter(Boolean).join(' · ');
    const penCell = (i: ScoreItem) =>
      i.na ? h('td', { class: 'pen na', title: 'Not flown' }, '—') : h('td', { class: `pen${i.penalty === 0 ? ' zero' : ''}` }, i.penalty === 0 ? svgIcon(I.check, 15) : `−${Math.round(i.penalty)}`);
    this.body.append(
      h('div', { class: 'grade-row dbf-sum' },
        db.graded
          ? h('div', { class: `grade ${db.grade}`, 'aria-label': `Grade ${db.grade}, ${db.score} out of 100` }, db.grade, h('small', {}, `${db.score}/100`))
          : h('div', { class: 'grade none', 'aria-label': 'Not graded' }, '—', h('small', {}, 'not graded')),
        h('div', {},
          h('h2', { class: 'dbf-headline' }, db.headline),
          h('div', { class: 'dbf-sub' }, sub),
          db.graded
            ? null
            : h('p', { class: 'dbf-hint' }, rec.lesson || sc?.id === 'lesson'
              ? 'This debrief grades approaches, landings and missed approaches. The exercise itself is graded against its own standards in the exercise result.'
              : 'Grades start once you fly the final approach segment, land or fly a missed approach. Keep flying, or start a new flight.'),
          db.items.length === 0 ? null : h('table', { class: 'items dbf-items' }, ...db.items.map((i) => h('tr', { class: i.na ? 'na' : '' }, h('td', {}, h('b', {}, i.label), i.note ? h('div', { class: 'dbf-note' }, i.note) : null), h('td', { class: 'num' }, i.value), penCell(i)))),
        ),
      ),
    );
    const acsBlock = h('section', { class: 'chartbox dbf-acs' },
      h('h5', {}, 'FAA Instrument ACS evaluation', h('span', { class: `acs-badge ${acs.result}` }, acs.result === 'INCOMPLETE' ? 'Incomplete' : acs.result)),
      h('table', { class: 'items acs-table' }, h('tr', {}, ...['Result', 'Task', 'Standard', 'Performance'].map((t) => h('th', {}, t))), ...acs.items.map((i) => h('tr', { class: i.result }, h('td', { class: 'res' }, i.result === 'N/A' ? '—' : i.result), h('td', {}, i.task), h('td', { class: 'muted' }, i.standard), h('td', {}, i.actual)))),
    );
    if (rec.mode === 'checkride') this.body.append(acsBlock);
    this.body.append(this.charts(rec));
    if (rec.mode !== 'checkride') this.body.append(acsBlock);
    const notes = db.tips.length
      ? h('ul', { class: 'tips' }, ...db.tips.map((t) => h('li', {}, t)))
      : h('p', { class: 'muted' }, db.graded ? 'Nothing to add — well flown.' : 'Notes appear once there is enough flight to grade.');
    this.body.append(
      h('div', { class: 'charts2' },
        h('section', { class: 'chartbox' }, h('h5', {}, 'Instructor notes'), notes),
        h('section', { class: 'chartbox' }, h('h5', {}, 'Timeline'), h('div', { class: 'timeline' }, ...rec.events.map((e) => h('div', { class: e.kind }, h('span', { class: 't' }, fmtTime(e.t)), h('span', { class: 'dot' }), h('span', {}, e.text))))),
      ),
    );
    // footer: one export menu, then the next step (Fly again is the primary action)
    const exp = h('div', { class: 'dbf-menu', role: 'menu' },
      this.menuItem('Flight data (JSON)', 'Every sample and event', () => this.exportJson()),
      this.menuItem('GPX track', 'CloudAhoy · ForeFlight · Garmin', () => download(trackGpx(rec.samples, new Date(rec.startedAt).toISOString()), 'ifr_trainer_track.gpx', 'application/gpx+xml'), rec.samples.length < 2),
      this.menuItem('KML 3D track', 'Google Earth', () => download(trackKml(rec.samples), 'ifr_trainer_track.kml', 'application/vnd.google-earth.kml+xml'), rec.samples.length < 2),
      this.menuItem('Print or save as PDF', 'The debrief as a report', () => window.print()),
    );
    this.menu = exp;
    const expBtn = h('button', { class: 'btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: (e: Event) => { e.stopPropagation(); this.toggleMenu(); } }, 'Export', svgIcon(I.chevUp, 14));
    this.foot.append(
      h('div', { class: 'dbf-exp' }, expBtn, exp),
      h('span', { class: 'grow' }),
      ...(rec.samples.length >= 10 ? [h('button', { class: 'btn', onclick: () => { this.close(); this.onReplay?.(); }, title: 'Replay the flight with the instruments and the 3D view' }, svgIcon(I.play, 14), 'Replay')] : []),
      h('button', { class: 'btn ghost', onclick: () => this.close() }, 'Keep flying'),
      h('button', { class: 'btn', onclick: () => { this.close(); this.onNew(); } }, 'New flight'),
      h('button', { class: 'btn primary', onclick: () => { this.close(); this.onAgain(); } }, 'Fly again'),
    );
    this.box.addEventListener('click', this.closeMenu);
  }
  private closeMenu = () => {
    this.menu?.classList.remove('open');
    this.foot.querySelector('[aria-haspopup]')?.setAttribute('aria-expanded', 'false');
  };
  private toggleMenu() {
    const open = !this.menu?.classList.contains('open');
    this.menu?.classList.toggle('open', open);
    this.foot.querySelector('[aria-haspopup]')?.setAttribute('aria-expanded', String(open));
  }
  private menuItem(label: string, hint: string, fn: () => void, disabled = false) {
    return h('button', { class: 'dbf-mi', role: 'menuitem', disabled, onclick: () => { this.closeMenu(); fn(); } }, h('b', {}, label), h('small', {}, hint));
  }
  private exportJson() {
    const r = this.sim.rec;
    const blob = new Blob([JSON.stringify({ scenario: this.sim.scenario?.id, events: r.events, touchdown: r.touchdown, samples: r.samples }, null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `ifr-flight-${Date.now()}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /** the plan the flight followed (route + approach), drawn under the flown track */
  private plan(): Circuit | null {
    const fp = this.sim.fp;
    const legs: CircuitLeg[] = [];
    for (const w of fp.wpts) if (!w.appr && !w.ptPoint && findFix(w.ident)) legs.push({ type: 'fix', ident: w.ident, alt: null });
    const apId = fp.approachId ?? this.sim.rec.approach?.id ?? null;
    if (apId) {
      const ap = APPROACHES.find((a) => a.id === apId);
      const first = fp.wpts.find((w) => w.appr === 'trans' && !w.ptPoint);
      const tr = ap?.transitions.find((t) => t.legs[0]?.fix.ident === first?.ident)?.name ?? null;
      if (ap) legs.push({ type: 'approach', approachId: apId, transition: tr, outcome: this.sim.rec.missedAt !== null ? 'missed' : 'land' });
    }
    if (!legs.length) return null;
    // no start point: the flown track shows where the flight began
    return { id: 'debrief', name: 'Flown plan', description: '', start: { type: 'runway', airport: '', runway: '', initialAlt: 0 }, legs, weather: {}, failures: [], allowAp: true, mode: 'training', cockpit: null };
  }

  private charts(rec: Recorder): HTMLElement {
    const smp = rec.samples;
    if (smp.length < 10)
      return h('section', { class: 'chartbox dbf-empty' }, svgIcon(I.route, 22), h('div', {}, h('b', {}, 'No track recorded yet'), h('span', {}, 'The ground track on the map and the vertical profile appear here after a few seconds of flight.')));
    const near = (t: number) => smp.reduce((b, s) => (Math.abs(s.t - t) < Math.abs(b.t - t) ? s : b), smp[0]);
    const marks: { p: LatLon; label: string; color?: string }[] = [];
    if (smp[0]) marks.push({ p: smp[0], label: 'Start', color: '#475467' });
    if (rec.missedAt !== null) marks.push({ p: near(rec.missedAt), label: 'Missed approach', color: DBF.missed });
    if (rec.touchdown) marks.push({ p: near(rec.touchdown.t), label: 'Touchdown', color: DBF.good });
    if (rec.crashed) marks.push({ p: smp[smp.length - 1], label: 'Accident', color: DBF.mins });
    else if (!rec.touchdown) marks.push({ p: smp[smp.length - 1], label: 'End', color: '#475467' });
    this.map = new RouteMap(this.plan(), { height: 380, track: smp.map((s) => ({ lat: s.lat, lon: s.lon })), marks });
    const leg = this.map.el.querySelector('.rm-legend');
    leg?.prepend(h('span', { class: 'rm-chip' }, h('i', { class: 'l-flown' }), 'Flown track'));
    const prof = h('div', { class: 'dbf-prof' });
    const draw = () => {
      const w = Math.round(prof.getBoundingClientRect().width);
      if (w > 40 && Number(prof.dataset.w) !== w) {
        prof.dataset.w = String(w);
        prof.innerHTML = this.profileSvg(rec, w, 250);
      }
    };
    this.ro = new ResizeObserver(draw);
    this.ro.observe(prof);
    const ap = rec.approach;
    return h('div', { class: 'dbf-charts' },
      h('section', { class: 'chartbox dbf-map' }, h('h5', {}, 'Ground track'), this.map.el),
      h('section', { class: 'chartbox' },
        h('h5', {}, ap ? `Vertical profile — ${ap.airport} ${ap.name}` : 'Altitude profile'),
        prof,
        h('div', { class: 'dbf-legend' },
          h('span', {}, h('i', { class: 'l-flown' }), 'Flown altitude'),
          ap ? h('span', {}, h('i', { class: 'l-proc' }), ap.gsAngle ? 'Glidepath' : 'Step-down altitudes') : null,
          ap && this.minsAlt(rec) !== null ? h('span', {}, h('i', { class: 'l-mins' }), this.minsKind(rec)) : null,
          h('span', {}, h('i', { class: 'l-gnd' }), 'Terrain'),
        ),
      ),
    );
  }
  private minsAlt(rec: Recorder): number | null {
    return rec.minsUsed ?? this.sim.av.minimums;
  }
  private minsKind(rec: Recorder): 'DA' | 'MDA' {
    const ap = rec.approach;
    return ap?.gsAngle || rec.samples.some((s) => s.phase === 'final' && s.vertDots !== null) ? 'DA' : 'MDA';
  }

  /** vertical profile: altitude against the distance to the threshold (approach), or against time; light chart */
  private profileSvg(rec: Recorder, W: number, H: number): string {
    const ap = rec.approach;
    const all = rec.samples;
    const L = 52, R = 16, T = 26, B = 34;
    const o: string[] = [];
    const ft = (v: number) => Math.round(v).toLocaleString('en-US');
    let X: (v: number) => number;
    let xs: number[]; // x value of each sample
    let x0: number, x1: number; // domain, left → right
    let ground: [number, number][] = [];
    let rw: ReturnType<typeof runway> | null = null;
    const used = all.filter((s) => s.phase !== 'ground' || all.length < 40);
    const smp = used.length > 1 ? used : all;
    if (ap) {
      rw = runway(ap.airport, ap.runway);
      const r = rw;
      const dist = smp.map((s) => -alongTrackNm(r.threshold, r.end, s));
      const firstFinal = Math.max(...ap.final.map((l) => -alongTrackNm(r.threshold, r.end, l.fix)).filter((d) => d < 30), 4);
      const flown = dist.filter((_d, i) => smp[i].phase === 'final' || smp[i].phase === 'initial' || smp[i].phase === 'landed' || smp[i].phase === 'missed');
      const maxD = Math.min(Math.max(firstFinal + 1, ...flown.filter((d) => d < 30), 5), 25);
      x0 = Math.ceil(maxD);
      x1 = -1;
      xs = dist;
      for (let d = x1; d <= x0; d += x0 / 80) ground.push([d, groundElevation(destination(r.threshold, r.heading + 180, d))]);
    } else {
      const t0 = smp[0].t;
      xs = smp.map((s) => (s.t - t0) / 60);
      x0 = 0;
      x1 = Math.max(1, xs[xs.length - 1]);
      ground = smp.map((s, i) => [xs[i], s.alt - s.agl]);
    }
    const inX = (v: number) => (ap ? v <= x0 && v >= x1 : true);
    const vis = smp.filter((_, i) => inX(xs[i]));
    const elev = rw ? rw.elevFt : Math.min(...ground.map((g) => g[1]));
    const mins = this.minsAlt(rec);
    const tops = [...vis.map((s) => s.alt), ...ground.map((g) => g[1]), elev + 1200];
    if (ap) for (const l of ap.final) if (l.altMin) tops.push(l.altMin);
    const lo = Math.max(0, Math.floor((Math.min(elev, ...ground.map((g) => g[1])) - 100) / 500) * 500);
    const hi = Math.ceil((Math.max(...tops) + 250) / 500) * 500;
    X = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
    const Y = (a: number) => T + (1 - (a - lo) / (hi - lo)) * (H - T - B);
    const f = (v: number) => v.toFixed(1);
    // plot area + grid
    o.push(`<rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="#f6f8fa"/>`);
    const step = hi - lo > 5000 ? 1000 : 500;
    for (let a = lo; a <= hi; a += step) o.push(`<line x1="${L}" x2="${W - R}" y1="${f(Y(a))}" y2="${f(Y(a))}" stroke="${DBF.grid}" stroke-width="1"/><text class="ax" x="${L - 6}" y="${f(Y(a) + 3.5)}" text-anchor="end">${ft(a)}</text>`);
    const span = Math.abs(x0 - x1);
    const xstep = span > 16 ? 4 : span > 8 ? 2 : 1;
    const lo2 = Math.min(x0, x1), hi2 = Math.max(x0, x1);
    for (let v = Math.ceil(lo2 / xstep) * xstep; v <= hi2; v += xstep) {
      if (ap && v < 0) continue;
      o.push(`<line x1="${f(X(v))}" x2="${f(X(v))}" y1="${T}" y2="${H - B}" stroke="${DBF.grid}" stroke-width="1" stroke-dasharray="2 3"/><text class="ax" x="${f(X(v))}" y="${H - B + 14}" text-anchor="middle">${v}</text>`);
    }
    o.push(`<text class="ax t" x="${W - R}" y="${H - 4}" text-anchor="end">${ap ? 'NM to threshold' : 'Minutes'}</text><text class="ax t" x="${L - 6}" y="${T - 12}" text-anchor="end">ft MSL</text>`);
    // terrain
    if (ground.length > 1) {
      const g = ground.filter((p) => inX(p[0])).sort((a, b) => X(a[0]) - X(b[0]));
      if (g.length > 1) o.push(`<polygon points="${f(X(g[0][0]))},${f(Y(lo))} ${g.map((p) => `${f(X(p[0]))},${f(Y(Math.max(lo, p[1])))}`).join(' ')} ${f(X(g[g.length - 1][0]))},${f(Y(lo))}" fill="#e6dfd0" stroke="#b9ab90" stroke-width="1"/>`);
    }
    if (ap && rw) {
      const r = rw;
      // procedure: glidepath, or the step-down altitudes of the final segment
      const fixes = ap.final.map((l) => ({ l, d: -alongTrackNm(r.threshold, r.end, l.fix) })).filter((x) => x.d >= -0.05 && x.d <= x0);
      if (ap.gsAngle) {
        const tch = r.elevFt + (ap.tch ?? 50);
        const k = Math.tan((ap.gsAngle * Math.PI) / 180) * FT_PER_NM;
        const dTop = Math.min(x0, (hi - tch) / k);
        o.push(`<line x1="${f(X(0))}" y1="${f(Y(tch))}" x2="${f(X(dTop))}" y2="${f(Y(tch + dTop * k))}" stroke="${DBF.proc}" stroke-width="2" stroke-dasharray="7 4"/>`);
        // the angle label sits midway between the FAF and the threshold (clear of the FAF altitude and cross)
        const fafD = fixes.find((x) => x.l.role === 'FAF')?.d;
        const dl = fafD ? fafD * 0.5 : Math.min(dTop * 0.45, x0 * 0.45);
        o.push(`<text class="lbl" fill="${DBF.proc}" x="${f(X(dl))}" y="${f(Y(tch + dl * k) - 8)}" text-anchor="middle">${ap.type === 'ILS' ? 'GS' : 'GP'} ${ap.gsAngle.toFixed(2)}° · TCH ${ap.tch ?? 50}'</text>`);
      } else {
        const st = fixes.filter((x) => x.l.altMin).sort((a, b) => b.d - a.d);
        let path = '';
        st.forEach((x, i) => {
          const nd = st[i + 1]?.d ?? 0;
          path += `${i ? 'L' : 'M'}${f(X(x.d))},${f(Y(x.l.altMin!))} L${f(X(nd))},${f(Y(x.l.altMin!))} `;
        });
        if (path) o.push(`<path d="${path}" fill="none" stroke="${DBF.proc}" stroke-width="2" stroke-dasharray="7 4"/>`);
      }
      // fixes: dotted tick, ident and minimum altitude (underlined, Jeppesen style)
      let lastX = -99;
      for (const x of fixes.sort((a, b) => b.d - a.d)) {
        if (x.l.fix.kind === 'runway' || x.d < 0.2) continue;
        const px = X(x.d);
        if (px - lastX < 46) continue;
        lastX = px;
        o.push(`<line x1="${f(px)}" x2="${f(px)}" y1="${T}" y2="${H - B}" stroke="${DBF.proc}" stroke-width="1" stroke-dasharray="1 3" opacity=".7"/>`);
        o.push(`<text class="fix" x="${f(px)}" y="${T + 12}" text-anchor="middle">${x.l.role === 'FAF' ? 'FAF ' : ''}${x.l.fix.ident}</text>`);
        if (x.l.altMin) {
          const faf = x.l.role === 'FAF';
          const ay = Y(x.l.altMin);
          // Jeppesen: Maltese cross at the FAF, minimum altitudes underlined, feet marked with a prime
          if (faf) o.push(`<path transform="translate(${f(px)},${f(ay)}) scale(0.85)" d="M0,0 L-4,-5 L-1.2,-4 L0,-7 L1.2,-4 L4,-5 Z M0,0 L-5,4 L-4,1.2 L-7,0 L-4,-1.2 L-5,-4 Z M0,0 L4,5 L1.2,4 L0,7 L-1.2,4 L-4,5 Z M0,0 L5,-4 L4,-1.2 L7,0 L4,1.2 L5,4 Z" fill="${DBF.ink}" stroke="#fff" stroke-width="0.8"/>`);
          const ty = ay - (faf ? 11 : 6);
          const txt = `${x.l.altMin}'`;
          const tw = String(x.l.altMin).length * 6.2;
          o.push(`<text class="alt" x="${f(px)}" y="${f(ty)}" text-anchor="middle">${txt}</text><line x1="${f(px - tw / 2 - 1)}" x2="${f(px + tw / 2 + 2)}" y1="${f(ty + 2.5)}" y2="${f(ty + 2.5)}" stroke="${DBF.ink}" stroke-width="1"/>`);
        }
      }
      // minimums
      if (mins !== null && mins > lo && mins < hi) {
        o.push(`<line x1="${L}" x2="${W - R}" y1="${f(Y(mins))}" y2="${f(Y(mins))}" stroke="${DBF.mins}" stroke-width="1.4" stroke-dasharray="5 4"/>`);
        o.push(`<text class="lbl" fill="${DBF.mins}" x="${L + 6}" y="${f(Y(mins) - 5)}">${this.minsKind(rec)} ${mins}' (${Math.round(mins - r.elevFt)}')</text>`);
      }
      // runway
      const len = Math.max(0.2, Math.min(0.9, distanceNm(r.threshold, r.end)));
      o.push(`<rect x="${f(X(0))}" y="${f(Y(r.elevFt) - 2.5)}" width="${f(Math.max(6, X(-len) - X(0)))}" height="5" fill="${DBF.ink}"/><text class="fix" x="${f(X(0) + 4)}" y="${f(Y(r.elevFt) + 15)}">RWY ${ap.runway}</text>`);
    }
    // flown altitude (white halo, ink line; the missed approach part in amber)
    const segs: { miss: boolean; pts: string[] }[] = [];
    smp.forEach((s, i) => {
      // a reposition (instructor, replay) is a jump, not a flown line
      if (i && distanceNm(smp[i - 1], s) > 1 && segs.length && segs[segs.length - 1].pts.length) segs.push({ miss: s.phase === 'missed', pts: [] });
      if (!inX(xs[i])) { if (segs.length && segs[segs.length - 1].pts.length) segs.push({ miss: s.phase === 'missed', pts: [] }); return; }
      const miss = s.phase === 'missed';
      const pt = `${f(X(xs[i]))},${f(Y(s.alt))}`;
      const cur = segs[segs.length - 1];
      if (!cur || cur.miss !== miss) {
        const prev = cur?.pts[cur.pts.length - 1];
        segs.push({ miss, pts: prev ? [prev, pt] : [pt] });
      } else cur.pts.push(pt);
    });
    for (const sg of segs) if (sg.pts.length > 1) o.push(`<polyline points="${sg.pts.join(' ')}" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round" opacity=".9"/>`);
    for (const sg of segs) if (sg.pts.length > 1) o.push(`<polyline points="${sg.pts.join(' ')}" fill="none" stroke="${sg.miss ? DBF.missed : DBF.ink}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`);
    const td = rec.touchdown;
    if (td) {
      const i = smp.reduce((b, s, k) => (Math.abs(s.t - td.t) < Math.abs(smp[b].t - td.t) ? k : b), 0);
      if (inX(xs[i])) o.push(`<circle cx="${f(X(xs[i]))}" cy="${f(Y(smp[i].alt))}" r="4.5" fill="${DBF.good}" stroke="#fff" stroke-width="2"/>`);
    }
    if (rec.missedAt !== null) {
      const i = smp.reduce((b, s, k) => (Math.abs(s.t - rec.missedAt!) < Math.abs(smp[b].t - rec.missedAt!) ? k : b), 0);
      if (inX(xs[i])) o.push(`<circle cx="${f(X(xs[i]))}" cy="${f(Y(smp[i].alt))}" r="4.5" fill="${DBF.missed}" stroke="#fff" stroke-width="2"/>`);
    }
    o.push(`<rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="none" stroke="${DBF.grid}"/>`);
    return `<svg class="dbf-psvg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Vertical profile of the flight">${o.join('')}</svg>`;
  }
}

// ----------------------------------------------------------------- help
export class HelpModal extends Modal {
  constructor() {
    super('Keyboard shortcuts', 'md');
    const rows: [string, string][] = [
      ['Pitch / roll (yoke)', '↑ ↓ ← →'],
      ['Rudder', ', .'],
      ['Throttle', '+ / −  or  1…0'],
      ['Trim nose down / up', 'Home / End'],
      ['Flaps down / up', 'F / Shift+F'],
      ['Brakes', 'Space (hold)'],
      ['Autopilot on/off', 'A'],
      ['Flight director', 'Shift+A'],
      ['HDG / NAV / APR', 'H / N / R'],
      ['ALT hold / VS / FLC', 'L / V / K'],
      ['Nose up / down (AP)', 'Shift+↑ / Shift+↓'],
      ['Heading bug ±1° (Shift ±10°)', 'Q / E'],
      ['Altitude select ±100 ft', 'W / S'],
      ['Course (OBS) ±1° (Shift ±10°)', 'O / P'],
      ['CDI source GPS/NAV1/NAV2', 'C'],
      ['Direct-To', 'D'],
      ['Procedures (load approach)', 'X'],
      ['Charts drawer', 'K'],
      ['Go-around / missed approach', 'G'],
      ['Set altimeter to QNH', 'B'],
      ['Timer start/stop', 'T'],
      ['Pause', 'Esc / Pause'],
      ['Sim rate', 'Ctrl+1 / 2 / 4'],
      ['Outside view size', 'Tab'],
      ['Debrief / checkride report', 'Shift+D'],
      ['Instructor station', 'I'],
      ['Learn (paths & exercises)', 'J'],
      ['Sound on/off', 'M'],
      ['IFR circuit builder', 'U'],
      ['Flight Center', 'F2'],
      ['This help', '?'],
    ];
    // keys: chips; "or" and "/" are plain text between them; single keys in a row (", ." rudder, arrows) are chips each
    const keys = (k: string) => {
      const out: (HTMLElement | string)[] = [];
      k.split(/\s{2}or\s{2}/).forEach((alt, i) => {
        if (i) out.push(h('span', { class: 'kbd-or' }, 'or'));
        alt.split(' / ').forEach((chip, j) => {
          if (j) out.push(h('span', { class: 'kbd-sep' }, '/'));
          for (const c of /^\S( \S)+$/.test(chip) ? chip.split(' ') : [chip]) out.push(h('kbd', {}, c));
        });
      });
      return out;
    };
    this.body.append(h('div', { class: 'help-grid' }, ...rows.map(([a, k]) => h('div', {}, h('span', {}, a), h('span', { class: 'keys' }, ...keys(k))))));
    this.body.append(
      h('div', { class: 'section-t' }, 'Glass cockpit'),
      h('p', { class: 'help-p' }, 'Every bezel knob responds to the mouse wheel, dragging, or clicking its left/right half (Shift or the outer ring = coarse). Click the centre of HDG to sync the bug, CRS to centre the needle, ALT to set current altitude. The PFD and MFD softkeys along the bottom of each screen are clickable. Pulling hard on the yoke with the autopilot engaged disconnects it.'),
      h('div', { class: 'section-t' }, 'Disclaimer'),
      h('p', { class: 'help-p' }, 'Training region, navaids and procedures are fictional. Not for real-world navigation.'),
    );
  }
}

