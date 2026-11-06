import { h, clear } from './dom';
import { Modal } from './modals';

export interface SettingsState {
  cockpit: 'g1000' | 'steam' | 'airliner';
  tod: 'day' | 'dusk' | 'night';
  gfx: 'high' | 'low';
  pro: boolean;
  sound: boolean;
  svt: boolean;
  otw: 'normal' | 'big' | 'visual' | 'none';
}

export class SettingsModal extends Modal {
  constructor(private get: () => SettingsState, private set: (patch: Partial<SettingsState>) => void) {
    super('Settings', 'md');
  }
  open() {
    this.render();
    super.open();
  }
  private render() {
    clear(this.body);
    clear(this.foot);
    const s = this.get();
    const seg = <K extends keyof SettingsState>(key: K, opts: [SettingsState[K], string][]) =>
      h('div', { class: 'seg' }, ...opts.map(([v, l]) => h('button', { class: s[key] === v ? 'on' : '', onclick: () => { this.set({ [key]: v } as Partial<SettingsState>); this.render(); } }, l)));
    const row = (title: string, desc: string, ctl: HTMLElement) => h('div', { class: 'set-row' }, h('div', {}, h('b', {}, title), h('span', {}, desc)), ctl);
    this.body.append(
      h('div', { class: 'set-sec' }, 'Instrument panel'),
      row('Instrument panel', 'G1000 glass, a classic six-pack with a radio stack, or an airliner-style PFD / ND with a mode control panel. Every panel flies the same Cessna 172 flight model.', seg('cockpit', [['g1000', 'G1000'], ['steam', 'Six-pack'], ['airliner', 'Airliner PFD / ND']])),
      row('Synthetic vision', 'Terrain and runway overlay on the G1000 PFD.', seg('svt', [[true, 'On'], [false, 'Off']])),
      h('div', { class: 'set-sec' }, 'Outside view'),
      row('Time of day', 'Night makes the approach lights, PAPI and runway lighting the only visual cues.', seg('tod', [['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']])),
      row('Graphics quality', 'High: dense terrain, trees and anti-aliasing. Performance: lighter scene for laptops.', seg('gfx', [['high', 'High'], ['low', 'Performance']])),
      row('Screen layout', 'How much outside view and how much panel (Tab / Shift+Tab, or the View button).', seg('otw', [['normal', 'Standard'], ['big', 'Large view'], ['visual', 'Immersive'], ['none', 'Instruments']])),
      h('div', { class: 'set-sec' }, 'Training'),
      row('Pro mode', 'No coach panel, no informational pop-ups — only failures and critical alerts. Lessons keep their step list.', seg('pro', [[false, 'Off'], [true, 'On']])),
      row('Cockpit audio', 'Engine, stall horn, marker beacons, AP disconnect, altitude alerter and minimums call-out.', seg('sound', [[true, 'On'], [false, 'Off']])),
    );
    this.foot.append(h('button', { class: 'btn primary', onclick: () => this.close() }, 'Done'));
  }
}
