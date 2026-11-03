// Weather station: surface wind, gusts, shear, winds aloft, clouds, pressure, runway wind calculator and ATIS.
import { h, clear } from './dom';
import { Modal, WX_PRESETS } from './modals';
import type { Sim } from '../sim/sim';
import { defaultAloft, components, steadyWind, type WindLayer } from '../sim/wind';
import { AIRPORTS } from '../nav/data';

const pad3 = (n: number) => String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, '0');
export const C172_XWIND_DEMO = 15;

import { runwayInUse, atisText } from './atis';
export { runwayInUse, atisText };

export class WeatherStation extends Modal {
  private apt = 'PARD';
  constructor(private sim: Sim) {
    super('Weather station', 'md');
  }
  open() {
    this.render();
    super.open();
  }
  private render() {
    clear(this.body);
    clear(this.foot);
    const w = this.sim.weather;
    const rerender = () => this.render();
    const num = (label: string, get: () => number, set: (v: number) => void, o: { min: number; max: number; step: number; unit: string; fmt?: (v: number) => string }) => {
      const out = h('b', {}, (o.fmt ?? String)(get()) + (o.unit ? ` ${o.unit}` : ''));
      const r = h('input', { type: 'range', min: o.min, max: o.max, step: o.step, value: get() }) as HTMLInputElement;
      r.addEventListener('input', () => {
        set(Number(r.value));
        out.textContent = (o.fmt ?? String)(Number(r.value)) + (o.unit ? ` ${o.unit}` : '');
        this.renderLive();
      });
      r.addEventListener('change', rerender);
      return h('label', { class: 'wx-f' }, h('span', {}, label), out, r);
    };
    this.body.append(h('div', { class: 'wx-presets' }, ...WX_PRESETS.slice(1).map((p) => h('button', { onclick: () => { Object.assign(w, p.wx); delete w.aloft; rerender(); } }, h('b', {}, p.name), h('span', {}, p.desc)))));

    this.body.append(h('div', { class: 'set-sec', style: 'margin-top:16px' }, 'Surface wind'));
    this.body.append(h('div', { class: 'wx-grid' },
      num('Direction (from)', () => w.windDir, (v) => (w.windDir = v), { min: 0, max: 359, step: 5, unit: '', fmt: (v) => `${pad3(v)}°` }),
      num('Speed', () => w.windKt, (v) => { w.windKt = v; if (w.gustKt < v) w.gustKt = 0; }, { min: 0, max: 40, step: 1, unit: 'kt' }),
      num('Gusts to', () => w.gustKt, (v) => (w.gustKt = v), { min: 0, max: 50, step: 1, unit: 'kt', fmt: (v) => (v <= w.windKt ? 'none' : String(v)) }),
      num('Turbulence', () => w.turbulence, (v) => (w.turbulence = v), { min: 0, max: 1, step: 0.05, unit: '', fmt: (v) => (v < 0.08 ? 'none' : v < 0.3 ? 'light' : v < 0.6 ? 'moderate' : 'severe') }),
      num('Low-level shear (below 500 ft)', () => w.shearKt ?? 0, (v) => (w.shearKt = v), { min: 0, max: 25, step: 1, unit: '', fmt: (v) => (v === 0 ? 'none' : `−${v} kt`) }),
    ));

    // winds aloft
    const auto = !w.aloft;
    const layers: WindLayer[] = w.aloft ?? defaultAloft(w);
    this.body.append(h('div', { class: 'set-sec' }, 'Winds aloft', h('span', { class: 'seg', style: 'margin-left:12px' },
      h('button', { class: auto ? 'on' : '', onclick: () => { delete w.aloft; rerender(); } }, 'Auto (veer & strengthen)'),
      h('button', { class: !auto ? 'on' : '', onclick: () => { w.aloft = defaultAloft(w).map((l) => ({ ...l })); rerender(); } }, 'Custom'),
    )));
    const tbl = h('table', { class: 'items wx-aloft' }, h('tr', {}, ...['Altitude (MSL)', 'Direction', 'Speed', 'Turbulence'].map((t) => h('th', {}, t))));
    layers.forEach((l) => {
      const cell = (val: number, set: (v: number) => void, step: number, max: number) => {
        const i = h('input', { type: 'number', value: val, step, min: 0, max, disabled: auto }) as HTMLInputElement;
        i.addEventListener('change', () => { set(Number(i.value)); rerender(); });
        i.addEventListener('keydown', (e) => e.stopPropagation());
        return h('td', {}, i);
      };
      tbl.append(h('tr', {}, h('td', {}, `${l.altFt} ft`), cell(l.dir, (v) => (l.dir = ((v % 360) + 360) % 360), 10, 360), cell(l.kt, (v) => (l.kt = v), 1, 120), cell(Math.round((l.turb ?? 0) * 100), (v) => (l.turb = v / 100), 5, 100)));
    });
    this.body.append(tbl);

    this.body.append(h('div', { class: 'set-sec' }, 'Clouds, visibility & pressure'));
    this.body.append(h('div', { class: 'wx-grid' },
      num('Ceiling (AGL)', () => w.ceilingFt, (v) => (w.ceilingFt = v), { min: 0, max: 15000, step: 50, unit: '', fmt: (v) => (v >= 15000 ? 'clear' : `${v} ft`) }),
      num('Cloud tops (MSL)', () => w.cloudTopFt, (v) => (w.cloudTopFt = v), { min: 1000, max: 15000, step: 100, unit: 'ft' }),
      num('Visibility', () => w.visibilitySm, (v) => (w.visibilitySm = v), { min: 0.25, max: 10, step: 0.25, unit: 'SM' }),
      num('Altimeter (QNH)', () => w.qnh, (v) => (w.qnh = v), { min: 28.8, max: 30.8, step: 0.01, unit: 'inHg', fmt: (v) => v.toFixed(2) }),
      num('Sea-level temperature', () => w.oatSeaLevelC, (v) => (w.oatSeaLevelC = v), { min: -20, max: 40, step: 1, unit: '°C' }),
    ));

    // runway wind calculator & ATIS
    this.body.append(h('div', { class: 'set-sec' }, 'Runway wind & ATIS', h('span', { class: 'seg', style: 'margin-left:12px' }, ...AIRPORTS.map((a) => h('button', { class: this.apt === a.icao ? 'on' : '', onclick: () => { this.apt = a.icao; rerender(); } }, a.icao)))));
    this.body.append(h('div', { class: 'wx-live', 'data-live': '1' }));
    this.renderLive();
    this.foot.append(h('span', { class: 'muted', style: 'flex:1;align-self:center;font-size:12.5px' }, 'Changes apply immediately. Set the altimeter when the QNH changes (B or BARO knob).'), h('button', { class: 'btn primary', onclick: () => this.close() }, 'Done'));
  }

  private renderLive() {
    const box = this.body.querySelector('[data-live]') as HTMLElement | null;
    if (!box) return;
    clear(box);
    const w = this.sim.weather;
    const a = AIRPORTS.find((x) => x.icao === this.apt)!;
    const inUse = runwayInUse(this.apt, w);
    const rows = a.runways.map((r) => {
      const c = components(w.windDir, w.windKt, r.heading);
      const g = components(w.windDir, Math.max(w.windKt, w.gustKt), r.heading);
      const xw = Math.abs(g.cross);
      const status = c.head < -5 ? 'tailwind' : xw > C172_XWIND_DEMO ? 'over demo' : xw > 10 ? 'challenging' : 'ok';
      return h('tr', { class: r === inUse ? 'inuse' : '' },
        h('td', {}, h('b', {}, `RWY ${r.id}`), r === inUse ? h('span', { class: 'chip live', style: 'margin-left:6px' }, 'in use') : null),
        h('td', {}, `${c.head >= 0 ? 'Head' : 'Tail'} ${Math.abs(Math.round(c.head))} kt`),
        h('td', {}, `${Math.abs(Math.round(c.cross))} kt from the ${c.cross >= 0 ? 'right' : 'left'}${w.gustKt > w.windKt ? ` (gust ${Math.round(xw)})` : ''}`),
        h('td', { class: `xw ${status.replace(' ', '-')}` }, status === 'ok' ? '✓ within limits' : status === 'challenging' ? '⚠ challenging' : status === 'tailwind' ? '⚠ tailwind' : `✗ above ${C172_XWIND_DEMO} kt demonstrated`),
      );
    });
    const at3 = steadyWind(w, 3000, 3000 - a.elevFt);
    box.append(
      h('table', { class: 'items wx-rwy' }, h('tr', {}, ...['Runway', 'Head / tail', 'Crosswind', 'C172 limits'].map((t) => h('th', {}, t))), ...rows),
      h('p', { class: 'muted', style: 'font-size:12.5px;margin:8px 0' }, `Wind at 3000 ft: ${pad3(at3.dir)}° / ${Math.round(at3.kt)} kt — expect a larger drift on the intermediate approach than at the surface.`),
      h('div', { class: 'atis' }, h('b', {}, `ATIS ${this.apt}`), h('span', {}, atisText(this.apt, w))),
    );
  }
}
