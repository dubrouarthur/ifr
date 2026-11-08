import { BRAND } from '../brand';
import { h, clear, fmtTime, store } from './dom';
import { svgIcon, I } from './icons';
import type { ProcAttempt } from './history';
import { SCENARIOS, type Scenario, type Sim, type AssessSettings } from '../sim/sim';
import type { Weather } from '../sim/environment';
import { APPROACHES, FIXES } from '../nav/data';
import { approachPlate } from '../plates/plates';
import { computeDebrief, evaluateAcs } from '../sim/recorder';
import { history } from './history';
import { webhookCfg, postWebhook } from '../connect/webhook';
import { AXIS_LABELS, BUTTON_LABELS, AxisDetector, type AxisName, type ButtonAction, type InputManager } from '../sim/input';
import { distanceNm } from '../nav/geo';
import type { Lang, ProcedureResult } from '../train/procedureTypes';
import { FAILURE_LABELS_EN, FAILURE_LABELS_FR } from '../sim/systemsTypes';
import { lang as uiLang, onLangChange } from './i18n';

/** the base dialog's close button name, in the UI language */
const closeLabel = () => (uiLang() === 'fr' ? 'Fermer' : 'Close');

/** A dialog over the app. open() makes it a real modal: the focus moves inside (initialFocus()), everything else in
 *  the page becomes inert (Tab, clicks and screen readers stay in the dialog; live regions such as toasts stay
 *  reachable), and close() undoes that and gives the focus back to what opened it (or Modal.fallbackFocus). */
export class Modal {
  bg: HTMLElement;
  box: HTMLElement;
  body: HTMLElement;
  foot: HTMLElement;
  onClose?: () => void;
  private closeBtn: HTMLElement;
  private unInert: (() => void) | null = null;
  private opener: HTMLElement | null = null;
  /** set by a dialog that closes to launch a tool (a flight, another page): the focus is not handed back to the
   *  opener (it leaves the dialog, so the keyboard flies the aircraft) */
  protected leavingForTool = false;
  constructor(title: string, size: '' | 'sm' | 'md' = '') {
    this.body = h('div', { class: 'body' });
    this.foot = h('footer', {});
    this.closeBtn = h('button', { class: 'x', type: 'button', onclick: () => this.close(), 'aria-label': closeLabel(), title: closeLabel() }, '×');
    // the dialog's own header is not a page banner (role none: no second "banner" landmark)
    this.box = h('div', { class: `modal ${size}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: -1 },
      h('header', { role: 'none' }, h('h2', {}, title), this.closeBtn),
      this.body,
      this.foot,
    );
    this.bg = h('div', { class: 'modal-bg', onclick: (e: Event) => e.target === this.bg && this.close() }, this.box);
    document.body.append(this.bg);
    onLangChange(() => {
      this.closeBtn.setAttribute('aria-label', closeLabel());
      this.closeBtn.setAttribute('title', closeLabel());
    });
  }
  get isOpen() {
    return this.bg.classList.contains('open');
  }
  open() {
    Modal.closeAll();
    const was = this.isOpen;
    this.bg.classList.add('open');
    Modal.stack.push(this);
    if (!was) this.trapFocus();
  }
  /** where the focus goes when the dialog opens: a [data-autofocus] element, else the dialog itself */
  protected initialFocus(): HTMLElement | null {
    return this.box.querySelector<HTMLElement>('[data-autofocus]') ?? this.box;
  }
  /** the element that opened the dialog, the rest of the page made inert, the focus moved inside */
  private trapFocus() {
    const a = document.activeElement as HTMLElement | null;
    this.opener = a && a !== document.body && !this.bg.contains(a) ? a : null;
    this.unInert?.();
    const changed: HTMLElement[] = [];
    for (const c of Array.from(document.body.children) as HTMLElement[]) {
      if (c === this.bg || c.inert || c.tagName === 'SCRIPT') continue;
      // live regions (toasts, status) stay reachable; another open dialog stacked over this one too
      if (c.matches('[aria-live], [role="status"], [role="alert"], .toasts, .modal-bg.open')) continue;
      c.inert = true;
      changed.push(c);
    }
    this.unInert = () => changed.forEach((c) => (c.inert = false));
    // after the caller has filled the dialog (a timer, not a frame: a busy 3D frame must not delay the focus)
    setTimeout(() => {
      if (!this.isOpen || this.box.contains(document.activeElement)) return;
      this.initialFocus()?.focus({ preventScroll: true });
    }, 0);
  }
  close() {
    const was = this.isOpen;
    this.bg.classList.remove('open');
    Modal.stack = Modal.stack.filter((m) => m !== this);
    if (was && this.unInert) {
      this.unInert();
      this.unInert = null;
      const a = document.activeElement as HTMLElement | null;
      if (this.leavingForTool) {
        if (a && this.bg.contains(a)) a.blur();
      } else {
        const back = this.opener?.isConnected && this.opener.offsetParent !== null ? this.opener : Modal.fallbackFocus?.() ?? null;
        // only when the focus was in the dialog (a tool the dialog opened may have taken it already)
        if (back && (!a || a === document.body || this.bg.contains(a))) back.focus({ preventScroll: true });
      }
      this.opener = null;
    }
    this.leavingForTool = false;
    this.onClose?.();
  }
  static stack: Modal[] = [];
  /** where the focus goes back to when the element that opened a dialog is gone (main.ts: the top bar's hub button) */
  static fallbackFocus: (() => HTMLElement | null) | null = null;
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
export function flightRecord(sim: Sim, db = computeDebrief(sim.rec, sim.av.minimums), acs = evaluateAcs(sim.rec)): ProcAttempt {
  const rec = sim.rec;
  const ls = rec.lesson;
  const lessonScored = !!ls && ls.score !== undefined;
  // an exercise ended early (no score on its record) is not graded: no score goes to the records or the school
  // webhook, whatever the approach grader would have said about the same flight
  const lessonUngraded = !!ls && !lessonScored;
  const score = lessonScored ? ls!.score! : lessonUngraded ? 0 : db.score;
  const letter = (v: number) => (v >= 90 ? 'A' : v >= 80 ? 'B' : v >= 70 ? 'C' : v >= 60 ? 'D' : 'F');
  return {
    id: String(rec.startedAt),
    date: new Date(rec.startedAt).toISOString(),
    student: rec.student,
    scenario: ls ? ls.title : sim.scenario?.id === 'lesson' ? 'Exercise' : sim.scenario?.name ?? '',
    approach: db.approachName ?? '',
    mode: rec.mode,
    score,
    grade: lessonScored ? letter(score) : lessonUngraded ? '—' : db.grade,
    graded: lessonUngraded ? false : lessonScored || db.graded,
    acs: acs.result,
    failedTasks: acs.items.filter((i) => i.result === 'FAIL').map((i) => i.task),
    failures: rec.failuresInjected,
    durationSec: db.durationSec,
    ...(ls ? { exercise: ls.id, exerciseTitle: ls.title, passed: ls.passed } : {}),
    ...(() => {
      const procedures = flightProcedures.results();
      return procedures.length ? { procedures } : {};
    })(),
  };
}

/** procedures mode: the shell (main.ts) hands over the procedures graded during the current flight, so the debrief,
 *  the lesson result and the training records show them */
export const flightProcedures: { results: () => ProcedureResult[] } = { results: () => [] };
const posted = new Map<string, string>();
/** save the flight in the training records (flights over ~30 s, and every lesson attempt) and post the school webhook */
export function saveFlightRecord(sim: Sim): ProcAttempt | null {
  const rec = sim.rec;
  const db = computeDebrief(rec, sim.av.minimums);
  const acs = evaluateAcs(rec);
  if (db.durationSec < 30 && !rec.lesson && !rec.crashed) return null;
  const a = flightRecord(sim, db, acs);
  history.upsert(a);
  const sig = `${a.score}|${a.acs}|${a.graded}|${Math.round(a.durationSec / 30)}`;
  if (webhookCfg().auto && webhookCfg().url && posted.get(a.id) !== sig) {
    posted.set(a.id, sig);
    void postWebhook({ type: 'debrief', app: BRAND.name, ...a, acsItems: acs.items, scoreItems: db.items, events: rec.events });
  }
  return a;
}

// The flight debrief is the full-window replay of src/ui/result/debrief.ts (SPEC debrief §2.4): it grades exercises
// as well as approaches, with the instructor review and sign-off.

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
      ['ALT hold / VS / FLC', 'L / Y / Shift+K'],
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
      ['Flight builder', 'U'],
      ['Aircraft systems panel (switches, mixture, fuel)', 'Z'],
      ['Emergency checklist: open / fold', 'Shift+C'],
      ['Outside view (camera)', 'V / Shift+V'],
      ['Knob step buttons', 'right-click a knob (tap on a touch screen)'],
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

// ----------------------------------------------------------------- procedures mode: graded procedures (debrief, lesson result)
const PR_W = {
  en: {
    head: 'Emergency procedures',
    pass: 'PASS',
    fail: 'FAIL',
    training: 'Training',
    test: 'Test',
    at: 'at',
    first: 'First thing to work on',
    summary: 'Summary',
    bonus: 'bonus',
    reaction: 'Reaction',
    none: 'no reaction',
    checklist: 'Checklist opened',
    notOpened: 'not opened',
    ias: 'Airspeed in band',
    bank: 'Max bank',
    alt: 'Altitude lost',
    item: 'Item',
    time: 'Time',
    result: 'Result',
    memory: 'from memory',
    notMemory: 'not from memory',
    late: 'late',
    order: 'out of order',
    missed: 'missed',
    notDone: 'not done',
    verified: 'checked (already set)',
    instructor: 'confirmed by the instructor',
    student: 'confirmed',
    optional: 'optional',
    optSkipped: 'optional — not done',
    failure: 'Failure',
    opened: 'Checklist',
    outcome: {
      completed: 'Completed',
      incomplete: 'Not completed',
      crashed: 'Crashed',
      landed: 'Landed',
    },
    followUp: 'follow-up',
    solo: 'Solo test: callouts graded as checklist confirmations',
    path: 'Flight path',
    reactionShort: 'Reaction',
    score: 'Score',
    items: 'Items',
    capCrash: 'capped at 20: crash',
    capped: 'capped at',
  },
  fr: {
    head: 'Procédures d’urgence',
    pass: 'RÉUSSI',
    fail: 'ÉCHEC',
    training: 'Entraînement',
    test: 'Test',
    at: 'à',
    first: 'À travailler en premier',
    summary: 'Bilan',
    bonus: 'bonus',
    reaction: 'Réaction',
    none: 'aucune réaction',
    checklist: 'Check-list ouverte',
    notOpened: 'non ouverte',
    ias: 'Vitesse dans la plage',
    bank: 'Inclinaison max',
    alt: 'Altitude perdue',
    item: 'Action',
    time: 'Temps',
    result: 'Résultat',
    memory: 'de mémoire',
    notMemory: 'pas de mémoire',
    late: 'en retard',
    order: 'hors ordre',
    missed: 'oubliée',
    notDone: 'non faites',
    verified: 'vérifiée (déjà en place)',
    instructor: 'confirmée par l’instructeur',
    student: 'confirmée',
    optional: 'facultative',
    optSkipped: 'facultative — non faite',
    failure: 'Panne',
    opened: 'Check-list',
    outcome: {
      completed: 'Terminée',
      incomplete: 'Non terminée',
      crashed: 'Accident',
      landed: 'Posé',
    },
    followUp: 'suite',
    solo: 'Test en solo : les annonces sont notées comme confirmations de check-list',
    path: 'Trajectoire',
    reactionShort: 'Réaction',
    score: 'Note',
    items: 'Actions',
    capCrash: 'plafonnée à 20 : accident',
    capped: 'plafonnée à',
  },
} as const;
const prSec = (s: number | null | undefined, l: Lang) =>
  s === null || s === undefined ? '—' : `${(s < 10 ? Math.round(s * 10) / 10 : Math.round(s)).toString().replace('.', l === 'fr' ? ',' : '.')} s`;

/** "Items 70/70 · Flight path 18/20 · Reaction 10/10": only the parts that were graded, bonus points apart */
function breakdownText(r: ProcedureResult, w: (typeof PR_W)[Lang]): string {
  const b = r.breakdown!;
  const pathW = r.targets?.iasKt || r.targets?.maxBankDeg !== undefined ? 20 : 0;
  const reactW = r.followUpOf ? 0 : 10;
  const itemsW = 100 - pathW - reactW;
  const items = Math.round(b.items);
  const parts = [`${w.items} ${Math.min(items, itemsW)}/${itemsW}${items > itemsW ? ` (+${items - itemsW} ${w.bonus})` : ''}`];
  if (pathW) parts.push(`${w.path} ${Math.round(b.path)}/${pathW}`);
  if (reactW) parts.push(`${w.reactionShort} ${Math.round(b.reaction)}/${reactW}`);
  // a crash caps the score: say so, or the parts would not add up to it
  const sum = Math.min(100, Math.round(b.items + b.path + b.reaction));
  if (r.score < sum) parts.push(r.outcome === 'crashed' ? w.capCrash : `${w.capped} ${r.score}`);
  return parts.join(' · ');
}

/** one graded procedure: verdict and score, the notes (most important first), reaction, checklist and flight path,
 *  a timeline of the items and the item table (time, late / out of order / missed) */
export function procedureCard(r: ProcedureResult): HTMLElement {
  const L: Lang = r.lang === 'fr' ? 'fr' : 'en';
  const w = PR_W[L];
  // nothing to fix: the first note is the summary ("… flown correctly: 100/100"), not a thing to work on
  const clean = r.verdict === 'PASS' && !!r.notes[0] && r.notes[0].includes(r.title) && r.notes[0].includes(`${r.score}/100`);
  const fname = (L === 'fr' ? FAILURE_LABELS_FR : FAILURE_LABELS_EN)[r.failure] ?? r.failure;
  const pass = r.verdict === 'PASS';
  const items = r.items;
  // timeline: 0 = the failure, to the last thing that happened (at least 30 s)
  const span = Math.max(30, ...items.map((i) => i.atS ?? 0), r.checklistOpenedS ?? 0, r.reactionS ?? 0) * 1.06;
  const x = (s: number) => `${((Math.max(0, s) / span) * 100).toFixed(2)}%`;
  const kind = (i: ProcedureResult['items'][number]) =>
    !i.done ? (i.optional ? 'skip' : 'missed') : i.late ? 'late' : !i.inOrder || (i.memory && !i.fromMemory) ? 'warn' : 'ok';
  const tip = (i: ProcedureResult['items'][number], n: number) =>
    `${n + 1}. ${i.text ?? i.id} — ${i.done ? prSec(i.atS, L) : i.optional ? w.optSkipped : w.missed}`;
  // items not done: side by side after the end of the axis, under one label
  const notDone = items.map((i, n) => ({ i, n })).filter((x) => !x.i.done);
  const missEl = notDone.length
    ? h(
        'div',
        { class: 'prr-miss', title: notDone.map(({ i, n }) => tip(i, n)).join('\n') },
        h('div', {}, ...notDone.map(({ i, n }) => h('span', { class: `prr-dot ${kind(i)}` }, String(n + 1)))),
        h('small', {}, w.notDone),
      )
    : null;
  const tl = h(
    'div',
    {
      class: 'prr-tl',
      role: 'img',
      'aria-label': `${w.time}: ${items.filter((i) => i.done).length}/${items.length}`,
    },
    h('i', { class: 'prr-axis' }),
    h('span', {
      class: 'prr-m fail',
      style: `left:0`,
      title: `${w.failure} 0 s`,
    }),
    r.reactionS !== null
      ? h('span', {
          class: 'prr-m react',
          style: `left:${x(r.reactionS)}`,
          title: `${w.reaction} ${prSec(r.reactionS, L)}`,
        })
      : null,
    r.checklistOpenedS !== null && r.checklistOpenedS !== undefined
      ? h(
          'span',
          {
            class: 'prr-m cl',
            style: `left:${x(r.checklistOpenedS)}`,
            title: `${w.checklist} ${prSec(r.checklistOpenedS, L)}`,
          },
          h('small', {}, w.opened),
        )
      : null,
    ...(() => {
      // done items at their time, in time order; dots closer than ~22 px share the axis on alternate lanes (above /
      // below), never on top of each other. Items not done sit side by side past the end of the axis.
      const lastIn: number[] = [-1e9, -1e9];
      const done = items
        .map((i, n) => ({ i, n }))
        .filter((x) => x.i.done && x.i.atS !== null)
        .sort((a, b) => a.i.atS! - b.i.atS!);
      const dots = done.map(({ i, n }) => {
        const pos = Math.max(0, i.atS!) / span;
        const lane = pos - lastIn[0] > 0.035 ? 0 : pos - lastIn[1] > 0.035 ? 1 : 0;
        lastIn[lane] = pos;
        return h(
          'span',
          {
            class: `prr-dot ${kind(i)}${lane ? ' up' : ''}`,
            style: `left:${(pos * 100).toFixed(2)}%`,
            title: tip(i, n),
          },
          String(n + 1),
        );
      });
      return dots;
    })(),
    h('span', { class: 'prr-tick', style: 'left:0' }, '0'),
    h('span', { class: 'prr-tick', style: 'left:100%' }, prSec(span / 1.06, L)),
  );
  const chip = (cls: string, t: string) => h('span', { class: `prr-chip ${cls}` }, t);
  const rows = items.map((i, n) => {
    const chips: HTMLElement[] = [];
    if (!i.done) chips.push(i.optional ? chip('muted', w.optSkipped) : chip('bad', w.missed));
    else {
      if (i.late) chips.push(chip('warn', i.lateByS ? `${w.late} +${prSec(i.lateByS, L)}` : w.late));
      if (!i.inOrder) chips.push(chip('warn', w.order));
      if (i.memory) chips.push(i.fromMemory ? chip('good', w.memory) : chip('warn', w.notMemory));
      if (i.by === 'verified') chips.push(chip('muted', w.verified));
      else if (i.by === 'instructor') chips.push(chip('muted', w.instructor));
      if (!chips.length) chips.push(chip('good', i.optional ? w.optional : 'OK'));
    }
    return h(
      'tr',
      {
        class: i.done ? (i.late || !i.inOrder ? 'warn' : 'ok') : i.optional ? 'skip' : 'bad',
      },
      h('td', { class: 'num prr-n' }, String(n + 1)),
      h('td', {}, i.text ?? i.id, i.limitS !== undefined && i.limitS !== null ? h('small', { class: 'muted' }, ` ≤ ${i.limitS} s`) : null),
      h('td', { class: 'num nowrap' }, i.done ? prSec(i.atS, L) : '—'),
      h('td', { class: 'prr-res' }, ...chips),
    );
  });
  const tg = r.targets;
  const stat = (k: string, v: string, sub?: string, bad = false) =>
    h('div', { class: `prr-stat${bad ? ' bad' : ''}` }, h('small', {}, k), h('b', {}, v), sub ? h('span', {}, sub) : null);
  const p = r.path;
  return h(
    'article',
    { class: `prr-card ${pass ? 'pass' : 'fail'}` },
    h(
      'header',
      { class: 'prr-head' },
      h('span', { class: `prr-verdict ${pass ? 'pass' : 'fail'}` }, pass ? w.pass : w.fail),
      h(
        'div',
        { class: 'prr-t' },
        h('b', {}, r.title),
        h(
          'small',
          {},
          [fname, r.mode === 'test' ? w.test : w.training, `${w.at} ${fmtTime(r.failedAtS)}`, w.outcome[r.outcome], r.followUpOf ? w.followUp : '']
            .filter(Boolean)
            .join(' · '),
        ),
      ),
      h(
        'div',
        { class: 'prr-score', 'aria-label': `${w.score} ${r.score}/100` },
        h('div', {}, h('b', {}, String(r.score)), h('small', {}, '/100')),
        r.breakdown ? h('span', { class: 'prr-bd' }, breakdownText(r, w)) : null,
      ),
    ),
    r.notes.length
      ? h(
          'ol',
          { class: 'prr-notes' },
          ...r.notes.map((n, i) =>
            h(
              'li',
              { class: i === 0 ? (clean ? 'first good' : 'first') : '' },
              i === 0 ? h('small', {}, clean ? w.summary : w.first) : null,
              h('span', {}, n),
            ),
          ),
        )
      : null,
    h(
      'div',
      { class: 'prr-stats' },
      stat(
        w.reaction,
        r.followUpOf ? '—' : r.reactionS === null ? w.none : prSec(r.reactionS, L),
        undefined,
        !r.followUpOf && (r.reactionS === null || r.reactionS > 8),
      ),
      stat(w.checklist, r.checklistOpenedS === null || r.checklistOpenedS === undefined ? w.notOpened : prSec(r.checklistOpenedS, L)),
      p.iasBandPct !== null
        ? stat(w.ias, `${Math.round(p.iasBandPct)} %`, tg?.iasKt ? `${tg.iasKt[0]}–${tg.iasKt[1]} kt` : undefined, p.iasBandPct < 70)
        : null,
      stat(
        w.bank,
        `${Math.round(p.maxBankDeg)}°`,
        tg?.maxBankDeg !== undefined ? `≤ ${tg.maxBankDeg}°` : undefined,
        tg?.maxBankDeg !== undefined && p.maxBankDeg > tg.maxBankDeg + 5,
      ),
      stat(w.alt, `${Math.round(p.altLostFt).toLocaleString(L === 'fr' ? 'fr-FR' : 'en-US')} ft`),
    ),
    h('div', { class: 'prr-tlrow' }, tl, missEl),
    h(
      'table',
      { class: 'items prr-items' },
      h('tr', {}, h('th', { class: 'num' }, '#'), h('th', {}, w.item), h('th', { class: 'num' }, w.time), h('th', {}, w.result)),
      ...rows,
    ),
    r.soloTest ? h('p', { class: 'prr-solo muted' }, w.solo) : null,
  );
}

/** the Procedures section of the debrief and of the lesson result */
export function procedureSection(results: ProcedureResult[]): HTMLElement {
  const L: Lang = results[0]?.lang === 'fr' ? 'fr' : 'en';
  const pass = results.filter((r) => r.verdict === 'PASS').length;
  return h(
    'section',
    { class: 'chartbox prr' },
    h(
      'h5',
      {},
      PR_W[L].head,
      h('span', { class: `acs-badge ${pass === results.length ? 'PASS' : 'FAIL'}` }, `${pass}/${results.length} ${PR_W[L].pass}`),
    ),
    ...results.map((r) => procedureCard(r)),
  );
}
