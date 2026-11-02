import { h, clear, fmtTime, store } from './dom';
import { SCENARIOS, type Scenario, type Sim, type AssessSettings } from '../sim/sim';
import type { Weather } from '../sim/environment';
import { APPROACHES, FIXES, runway, airport } from '../nav/data';
import { approachPlate } from '../plates/plates';
import { computeDebrief, evaluateAcs, type Recorder } from '../sim/recorder';
import { history } from './instructor';
import { AXIS_LABELS, BUTTON_LABELS, AxisDetector, type AxisName, type ButtonAction, type InputManager } from '../sim/input';
import { alongTrackNm, distanceNm, toLocal } from '../nav/geo';

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
    this.foot.append(h('button', { class: 'btn primary', onclick: () => this.fly() }, this.assess.mode === 'checkride' ? 'Start checkride ✈' : 'Fly this scenario ✈'));
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
    super('Procedures — load an approach', 'md');
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
      h('div', { class: 'section-t', style: 'margin-top:0' }, 'Approach'),
      h('div', { class: 'list' }, ...APPROACHES.map((a) => h('button', { class: a.id === this.apId ? 'on' : '', onclick: () => { this.apId = a.id; this.trans = null; this.render(); } }, h('span', {}, `${a.airport} ${a.name}`), h('small', {}, a.category)))),
      h('div', { class: 'section-t' }, 'Transition'),
      h('div', { class: 'list' },
        h('button', { class: this.trans === null ? 'on' : '', onclick: () => { this.trans = null; this.render(); } }, h('span', {}, 'Vectors'), h('small', {}, 'VTF')),
        ...ap.transitions.map((t) => h('button', { class: this.trans === t.name ? 'on' : '', onclick: () => { this.trans = t.name; this.render(); } }, h('span', {}, t.name), h('small', {}, `IAF ${t.legs[0].altMin ?? ''}`))),
      ),
    );
    const mins = ap.minimums.map((m) => `${m.label} ${m.da ? 'DA' : 'MDA'} ${m.da ?? m.mda}`).join(' · ');
    const right = h('div', {}, h('div', { class: 'plate-mini', html: approachPlate(ap) }), h('p', { style: 'color:var(--muted);font-size:12.5px' }, mins));
    this.body.append(h('div', { class: 'two' }, left, right));
    const run = (mode: 'load' | 'activate' | 'vtf') => {
      this.sim.loadApproach(this.apId, this.trans, this.trans === null && mode === 'activate' ? 'vtf' : mode);
      this.onDone(`${ap.airport} ${ap.name} ${mode === 'load' ? 'loaded' : 'activated'}${this.trans ? ' via ' + this.trans : ' (vectors)'}`);
      this.close();
    };
    this.foot.append(
      h('button', { class: 'btn', onclick: () => run('load') }, 'Load'),
      h('button', { class: 'btn', onclick: () => run('vtf') }, 'Activate vectors-to-final'),
      h('button', { class: 'btn primary', onclick: () => run('activate') }, 'Load & activate'),
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
    this.input = h('input', { type: 'text', placeholder: 'Waypoint, VOR, NDB or airport (e.g. ARD, KEDDY, MSVL)', autocomplete: 'off', spellcheck: 'false', style: 'text-transform:uppercase' }) as HTMLInputElement;
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
    this.foot.append(h('button', { class: 'btn primary', onclick: () => { const f = this.matches()[this.idx]; if (f) this.go(f.ident); } }, 'Activate'));
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
    this.matches().forEach((f, i) => this.list.append(h('button', { class: i === this.idx ? 'on' : '', onclick: () => this.go(f.ident) }, h('span', {}, `${f.ident}`), h('small', { style: 'color:var(--muted)' }, `${f.kind.toUpperCase()} · ${distanceNm(this.sim.ac.s, f).toFixed(1)} NM`))));
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
    super('Joystick, yoke & gamepad', 'md');
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
        h('div', { style: 'text-align:center;padding:30px 10px' },
          h('div', { style: 'font-size:46px' }, '🕹️'),
          h('h3', {}, 'No controller detected'),
          h('p', { style: 'color:var(--muted)' }, 'Plug in your joystick, yoke, rudder pedals or gamepad and press any button on it. Browsers only expose controllers after a button press.'),
          h('p', { style: 'color:var(--muted);font-size:12.5px' }, 'Works with Chrome, Edge and Firefox via the Gamepad API. Keyboard: arrows = yoke, , . = rudder, +/− or 1–0 = throttle, Home/End = trim.'),
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
export class DebriefModal extends Modal {
  private savedFor = new WeakSet<Recorder>();
  constructor(private sim: Sim, private onAgain: () => void, private onNew: () => void) {
    super('Flight debrief');
  }
  open() {
    this.render();
    super.open();
  }
  render() {
    clear(this.body);
    clear(this.foot);
    const rec = this.sim.rec;
    const db = computeDebrief(rec, this.sim.av.minimums);
    const acs = evaluateAcs(rec);
    if (!this.savedFor.has(rec) && (db.finalSamples.length > 4 || rec.touchdown || rec.crashed || rec.missedAt !== null)) {
      this.savedFor.add(rec);
      history.add({
        id: String(Date.now()),
        date: new Date().toISOString(),
        student: rec.student,
        scenario: this.sim.scenario?.name ?? '',
        approach: db.approachName ?? '',
        mode: rec.mode,
        score: db.score,
        grade: db.grade,
        acs: acs.result,
        failedTasks: acs.items.filter((i) => i.result === 'FAIL').map((i) => i.task),
        failures: rec.failuresInjected,
        durationSec: db.durationSec,
      });
    }
    // persist best
    const sc = this.sim.scenario;
    if (sc && (db.finalSamples.length > 4 || rec.touchdown || rec.crashed)) {
      const best = store.get<Record<string, { score: number; grade: string }>>('ifr.best', {});
      if (!best[sc.id] || best[sc.id].score < db.score) {
        best[sc.id] = { score: db.score, grade: db.grade };
        store.set('ifr.best', best);
      }
    }
    this.body.append(
      h('div', { class: 'report-head' }, h('h2', { style: 'margin:0' }, `IFR Trainer — ${rec.mode === 'checkride' ? 'Checkride report' : 'Training debrief'}`), h('div', {}, `Student: ${rec.student || '—'} · ${new Date().toLocaleString()} · ${this.sim.scenario?.name ?? ''}`)),
    );
    const acsBlock = h('div', { class: 'chartbox', style: 'margin-top:16px' },
      h('h5', {}, 'FAA Instrument ACS evaluation — ', h('span', { class: `acs-badge ${acs.result}` }, acs.result)),
      h('table', { class: 'items acs-table' }, h('tr', {}, ...['Result', 'Task', 'Standard', 'Performance'].map((t) => h('th', {}, t))), ...acs.items.map((i) => h('tr', { class: i.result }, h('td', {}, i.result), h('td', {}, i.task), h('td', { class: 'muted' }, i.standard), h('td', {}, i.actual)))),
    );
    this.body.append(
      h('div', { class: 'grade-row' },
        h('div', { class: `grade ${db.grade}` }, db.grade, h('small', {}, `${db.score}/100`)),
        h('div', {},
          h('h2', { style: 'margin:0 0 6px' }, db.headline),
          h('div', { style: 'color:var(--muted);font-size:13px;margin-bottom:10px' }, `${rec.mode === 'checkride' ? 'CHECKRIDE · ' : ''}${rec.student ? rec.student + ' · ' : ''}${sc?.name ?? ''}${db.approachName ? ' · ' + db.approachName : ''} · ${fmtTime(db.durationSec)} flight time`),
          h('table', { class: 'items' }, ...db.items.map((i) => h('tr', {}, h('td', {}, h('b', {}, i.label), i.note ? h('div', { style: 'color:var(--muted);font-size:12px' }, i.note) : null), h('td', {}, i.value), h('td', { class: `pen${i.penalty === 0 ? ' zero' : ''}` }, i.penalty === 0 ? '✓' : `−${Math.round(i.penalty)}`)))),
        ),
      ),
    );
    if (rec.mode === 'checkride') this.body.insertBefore(acsBlock, this.body.children[1]);
    else this.body.append(acsBlock);
    this.body.append(h('div', { class: 'charts2' }, h('div', { class: 'chartbox' }, h('h5', {}, 'Ground track'), this.trackSvg(rec)), h('div', { class: 'chartbox' }, h('h5', {}, 'Vertical profile'), this.profileSvg(rec))));
    this.body.append(
      h('div', { class: 'charts2' },
        h('div', { class: 'chartbox' }, h('h5', {}, 'Instructor notes'), db.tips.length ? h('ul', { class: 'tips' }, ...db.tips.map((t) => h('li', {}, t))) : h('p', { style: 'color:var(--muted)' }, 'Nothing to add — well flown.')),
        h('div', { class: 'chartbox' }, h('h5', {}, 'Timeline'), h('div', { class: 'timeline' }, ...rec.events.map((e) => h('div', { class: e.kind }, h('span', { class: 't' }, fmtTime(e.t)), h('span', { class: 'dot' }), h('span', {}, e.text))))),
      ),
    );
    this.foot.append(
      h('button', { class: 'btn', onclick: () => this.exportJson() }, 'Export flight (JSON)'),
      h('button', { class: 'btn', onclick: () => window.print(), title: 'Print or save as PDF' }, 'Print / PDF'),
      h('span', { style: 'flex:1' }),
      h('button', { class: 'btn', onclick: () => { this.close(); } }, 'Keep flying'),
      h('button', { class: 'btn', onclick: () => { this.close(); this.onNew(); } }, 'New scenario'),
      h('button', { class: 'btn primary', onclick: () => { this.close(); this.onAgain(); } }, 'Fly it again ↻'),
    );
  }
  private exportJson() {
    const r = this.sim.rec;
    const blob = new Blob([JSON.stringify({ scenario: this.sim.scenario?.id, events: r.events, touchdown: r.touchdown, samples: r.samples }, null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `ifr-flight-${Date.now()}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  private trackSvg(rec: Recorder): SVGElement | HTMLElement {
    const smp = rec.samples;
    if (smp.length < 2) return h('p', { style: 'color:var(--muted)' }, 'No track recorded yet.');
    const ap = rec.approach;
    const ref = ap ? runway(ap.airport, ap.runway).threshold : smp[0];
    const pts = smp.map((s) => toLocal(ref, s));
    const path: { x: number; y: number }[] = [];
    if (ap) for (const l of [...(ap.transitions[0]?.legs ?? []), ...ap.final]) path.push(toLocal(ref, l.fix));
    const all = [...pts, ...path, { x: 0, y: 0 }];
    const minX = Math.min(...all.map((p) => p.x)) - 0.5, maxX = Math.max(...all.map((p) => p.x)) + 0.5;
    const minY = Math.min(...all.map((p) => p.y)) - 0.5, maxY = Math.max(...all.map((p) => p.y)) + 0.5;
    const W = 460, H = 300;
    const sc = Math.min(W / (maxX - minX), H / (maxY - minY));
    const X = (x: number) => ((x - minX) * sc + (W - (maxX - minX) * sc) / 2).toFixed(1);
    const Y = (y: number) => (H - (y - minY) * sc - (H - (maxY - minY) * sc) / 2).toFixed(1);
    let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#0b0f14"/>`;
    if (ap) {
      const a = airport(ap.airport);
      for (const r of a.runways) {
        const p1 = toLocal(ref, r.threshold), p2 = toLocal(ref, r.end);
        svg += `<line x1="${X(p1.x)}" y1="${Y(p1.y)}" x2="${X(p2.x)}" y2="${Y(p2.y)}" stroke="#ccc" stroke-width="4"/>`;
      }
      svg += `<polyline points="${path.map((p) => `${X(p.x)},${Y(p.y)}`).join(' ')}" fill="none" stroke="#ff40ff" stroke-width="2" stroke-dasharray="6 4" opacity="0.8"/>`;
      for (const l of [...(ap.transitions[0]?.legs ?? []), ...ap.final]) {
        const p = toLocal(ref, l.fix);
        if (l.fix.kind !== 'runway') svg += `<text x="${X(p.x)}" y="${Number(Y(p.y)) - 6}" fill="#ff9cff" font-size="11" text-anchor="middle" font-family="Inter">${l.fix.ident}</text>`;
      }
    }
    // track colored by phase
    const col: Record<string, string> = { final: '#2bd576', initial: '#00e4ff', missed: '#ffb020', landed: '#fff', ground: '#888', departure: '#9ad', enroute: '#7da7c7' };
    for (let i = 1; i < pts.length; i++) svg += `<line x1="${X(pts[i - 1].x)}" y1="${Y(pts[i - 1].y)}" x2="${X(pts[i].x)}" y2="${Y(pts[i].y)}" stroke="${col[smp[i].phase]}" stroke-width="2.2"/>`;
    const last = pts[pts.length - 1];
    svg += `<circle cx="${X(last.x)}" cy="${Y(last.y)}" r="4" fill="#ffe600"/>`;
    svg += `<g font-family="Inter" font-size="10" fill="#8b97a4"><text x="8" y="${H - 8}">● <tspan fill="#00e4ff">initial</tspan>  <tspan fill="#2bd576">final</tspan>  <tspan fill="#ffb020">missed</tspan>  <tspan fill="#ff40ff">procedure</tspan></text></g></svg>`;
    return h('div', { html: svg });
  }
  private profileSvg(rec: Recorder): SVGElement | HTMLElement {
    const ap = rec.approach;
    const smp = rec.samples.filter((s) => s.phase === 'final' || s.phase === 'initial' || s.phase === 'landed');
    if (!ap || smp.length < 2) return h('p', { style: 'color:var(--muted)' }, 'Fly an approach to see the vertical profile.');
    const rw = runway(ap.airport, ap.runway);
    const dist = smp.map((s) => -alongTrackNm(rw.threshold, rw.end, s));
    const maxD = Math.min(14, Math.max(4, ...dist));
    const elev = rw.elevFt;
    const maxA = Math.max(elev + 1500, ...smp.filter((_, i) => dist[i] <= maxD).map((s) => s.alt)) + 200;
    const W = 460, H = 300, L = 44, B = 24;
    const X = (d: number) => (L + (1 - d / maxD) * (W - L - 10)).toFixed(1);
    const Y = (a: number) => (H - B - ((a - elev) / (maxA - elev)) * (H - B - 10)).toFixed(1);
    let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#0b0f14"/><g font-family="Inter" font-size="10" fill="#8b97a4">`;
    for (let a = Math.ceil(elev / 500) * 500; a < maxA; a += 500) svg += `<line x1="${L}" x2="${W - 10}" y1="${Y(a)}" y2="${Y(a)}" stroke="#1d252e"/><text x="${L - 4}" y="${Number(Y(a)) + 3}" text-anchor="end">${a}</text>`;
    for (let d = 0; d <= maxD; d += 2) svg += `<text x="${X(d)}" y="${H - 8}" text-anchor="middle">${d}nm</text>`;
    svg += '</g>';
    // ideal path
    if (ap.gsAngle) svg += `<line x1="${X(0)}" y1="${Y(elev + (ap.tch ?? 50))}" x2="${X(maxD)}" y2="${Y(elev + (ap.tch ?? 50) + maxD * 318.4)}" stroke="#ff40ff" stroke-width="2" stroke-dasharray="6 4"/>`;
    // step-downs
    for (const l of ap.final) {
      if (!l.altMin) continue;
      const d = -alongTrackNm(rw.threshold, rw.end, l.fix);
      if (d > maxD) continue;
      svg += `<line x1="${X(d)}" x2="${X(d)}" y1="${Y(elev)}" y2="${Y(l.altMin)}" stroke="#36414d" stroke-dasharray="2 3"/><text x="${X(d)}" y="${Number(Y(l.altMin)) - 5}" fill="#c9d3dc" font-size="10" text-anchor="middle" font-family="Inter">${l.fix.ident} ${l.altMin}</text>`;
    }
    const mins = this.sim.av.minimums;
    if (mins !== null) svg += `<line x1="${L}" x2="${W - 10}" y1="${Y(mins)}" y2="${Y(mins)}" stroke="#00e4ff" stroke-dasharray="4 4"/><text x="${W - 12}" y="${Number(Y(mins)) - 4}" fill="#00e4ff" font-size="10" text-anchor="end" font-family="Inter">MINS ${mins}</text>`;
    svg += `<rect x="${X(0)}" y="${Number(Y(elev)) - 2}" width="18" height="4" fill="#ccc"/>`;
    const pts = smp.map((s, i) => (dist[i] <= maxD && dist[i] > -1.5 ? `${X(Math.max(0, dist[i]))},${Y(s.alt)}` : '')).filter(Boolean);
    svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="#2bd576" stroke-width="2.2"/></svg>`;
    return h('div', { html: svg });
  }
}

// ----------------------------------------------------------------- help
export class HelpModal extends Modal {
  constructor() {
    super('Controls & shortcuts', 'md');
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
      ['Heading bug ∓1 (Shift ±10)', 'Q / E'],
      ['Altitude select ∓100', 'W / S'],
      ['Course (OBS) ∓1 (Shift ±10)', 'O / P'],
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
      ['This help', '?'],
    ];
    this.body.append(h('div', { class: 'help-grid' }, ...rows.map(([a, k]) => h('div', {}, h('span', {}, a), h('span', {}, ...k.split('  ').map((x) => h('kbd', {}, x)))))));
    this.body.append(
      h('div', { class: 'section-t' }, 'Glass cockpit'),
      h('p', { style: 'color:var(--muted);font-size:13px;line-height:1.6' }, 'Every bezel knob responds to the mouse wheel, dragging, or clicking its left/right half (Shift or the outer ring = coarse). Click the centre of HDG to sync the bug, CRS to centre the needle, ALT to set current altitude. The PFD and MFD softkeys along the bottom of each screen are clickable. Pulling hard on the yoke with the autopilot engaged disconnects it.'),
      h('div', { class: 'section-t' }, 'Disclaimer'),
      h('p', { style: 'color:var(--muted);font-size:13px' }, 'Training region, navaids and procedures are fictional. Not for real-world navigation.'),
    );
  }
}

