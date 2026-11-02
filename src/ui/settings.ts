import { h, clear } from './dom';
import { Modal } from './modals';

export interface SettingsState {
  cockpit: 'g1000' | 'steam' | 'airliner';
  tod: 'day' | 'dusk' | 'night';
  gfx: 'high' | 'low';
  pro: boolean;
  sound: boolean;
  svt: boolean;
  otw: 'normal' | 'big' | 'none';
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
      h('div', { class: 'set-sec' }, 'Cockpit'),
      row('Instrument panel', 'Glass G1000, classic steam gauges with a radio stack, or an airliner PFD/ND with MCP.', seg('cockpit', [['g1000', 'G1000'], ['steam', 'Steam'], ['airliner', 'Airliner']])),
      row('Synthetic vision', 'Terrain and runway overlay on the G1000 PFD.', seg('svt', [[true, 'On'], [false, 'Off']])),
      h('div', { class: 'set-sec' }, 'Outside view'),
      row('Time of day', 'Night makes the approach lights, PAPI and runway lighting the only visual cues.', seg('tod', [['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']])),
      row('Graphics quality', 'High: dense terrain, trees and anti-aliasing. Performance: lighter scene for laptops.', seg('gfx', [['high', 'High'], ['low', 'Performance']])),
      row('Window size', 'Size of the outside view above the panel (Tab cycles).', seg('otw', [['normal', 'Normal'], ['big', 'Large'], ['none', 'Panel only']])),
      h('div', { class: 'set-sec' }, 'Training'),
      row('Pro mode', 'No coach panel, no informational pop-ups — only failures and critical alerts. Lessons keep their step list.', seg('pro', [[false, 'Off'], [true, 'On']])),
      row('Cockpit audio', 'Engine, stall horn, marker beacons, AP disconnect, altitude alerter and minimums call-out.', seg('sound', [[true, 'On'], [false, 'Off']])),
    );
    this.foot.append(h('button', { class: 'btn primary', onclick: () => this.close() }, 'Done'));
  }
}
