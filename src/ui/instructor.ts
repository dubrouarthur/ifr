// Instructor operating station: failures, reposition, freeze, weather and a live ACS monitor.
import { h, clear, fmtTime, store } from './dom';
import { FAILURE_LABELS, type Failures, type Sim } from '../sim/sim';
import { WX_PRESETS, Modal } from './modals';
import { evaluateAcs, computeDebrief } from '../sim/recorder';

export class InstructorDrawer {
  el: HTMLElement;
  private body: HTMLElement;
  private live: HTMLElement;
  private acc = 0;
  onBuilder?: () => void;
  constructor(private sim: Sim, private toast: (m: string, k?: 'info' | 'good' | 'warn' | 'bad') => void) {
    this.body = h('div', { class: 'ios-body' });
    this.live = h('div', { class: 'ios-live' });
    this.el = h('aside', { class: 'drawer left', 'aria-label': 'Instructor station' },
      h('header', {}, h('h3', {}, 'Instructor station'), h('button', { class: 'x', onclick: () => this.toggle(false), title: 'Close (I)' }, '×')),
      h('div', { class: 'ios-scroll' }, this.live, this.body),
    );
    this.render();
  }
  get isOpen() {
    return this.el.classList.contains('open');
  }
  toggle(o?: boolean) {
    const open = o ?? !this.isOpen;
    this.el.classList.toggle('open', open);
    if (open) this.render();
  }
  render() {
    clear(this.body);
    const sim = this.sim;
    const sec = (t: string) => h('div', { class: 'section-t' }, t);
    this.body.append(h('button', { class: 'btn primary', style: 'width:100%;justify-content:center;margin-top:12px', onclick: () => { this.toggle(false); this.onBuilder?.(); } }, '🛠️ Build an IFR circuit'));
    this.body.append(sec('Failures'));
    const grid = h('div', { class: 'ios-grid' });
    for (const k of Object.keys(FAILURE_LABELS) as (keyof Failures)[]) {
      const on = sim.failures[k];
      grid.append(h('button', { class: `ios-toggle${on ? ' on' : ''}`, onclick: () => { sim.setFailure(k, !on); this.toast(`${on ? 'Restored' : 'Failed'}: ${FAILURE_LABELS[k]}`, on ? 'good' : 'warn'); this.render(); } }, h('i', {}), FAILURE_LABELS[k]));
    }
    this.body.append(grid, h('button', { class: 'btn', style: 'margin-top:8px', onclick: () => { (Object.keys(FAILURE_LABELS) as (keyof Failures)[]).forEach((k) => sim.setFailure(k, false)); this.render(); } }, 'Clear all failures'));

    this.body.append(sec('Reposition (loaded approach)'));
    const rep = (k: 'iaf' | 'if' | 'final10' | 'final5' | 'runway', l: string) =>
      h('button', { class: 'btn', onclick: () => { if (sim.reposition(k)) this.toast(`Repositioned: ${l}`, 'good'); else this.toast('Load an approach first', 'warn'); } }, l);
    this.body.append(h('div', { class: 'ios-row' }, rep('iaf', 'IAF'), rep('if', 'IF'), rep('final10', '10 NM final'), rep('final5', '5 NM final'), rep('runway', 'On runway')));

    this.body.append(sec('Simulation'));
    this.body.append(h('div', { class: 'ios-row' },
      h('button', { class: 'btn', onclick: () => { sim.paused = !sim.paused; this.toast(sim.paused ? 'Frozen' : 'Running'); } }, 'Freeze / run'),
      h('button', { class: 'btn', onclick: () => { sim.weather.qnh = Math.round((29.92 + (Math.random() - 0.5) * 1.2) * 100) / 100; sim.rec.log(sim.time, 'info', `ATC: altimeter ${sim.weather.qnh.toFixed(2)}`); this.toast(`ATC: "altimeter ${sim.weather.qnh.toFixed(2)}"`, 'info'); } }, 'New altimeter'),
      h('button', { class: 'btn', onclick: () => { sim.ap.hdgBug = Math.round(Math.random() * 35) * 10 || 360; this.toast(`ATC: "turn heading ${String(sim.ap.hdgBug).padStart(3, '0')}" (bug preset — student must fly it)`); } }, 'ATC vector'),
    ));
    this.body.append(sec('Weather'));
    this.body.append(h('div', { class: 'ios-row' }, ...WX_PRESETS.slice(1).map((w) => h('button', { class: 'btn', onclick: () => { Object.assign(sim.weather, w.wx); sim.rec.log(sim.time, 'info', `Weather: ${w.name}`); this.toast(`Weather → ${w.name}`); } }, w.name))));
    this.body.append(h('p', { class: 'muted', style: 'font-size:12px;margin-top:16px' }, 'All instructor actions are time-stamped in the flight record and appear in the debrief timeline.'));
  }
  update(dt: number) {
    if (!this.isOpen || Modal.anyOpen()) return;
    this.acc += dt;
    if (this.acc < 0.5) return;
    this.acc = 0;
    const sim = this.sim;
    const r = sim.rec;
    const acs = evaluateAcs(r);
    const db = computeDebrief(r, sim.av.minimums);
    const lat = r.latDots(sim);
    const vert = r.vertDots(sim);
    clear(this.live);
    this.live.append(
      h('div', { class: 'ios-stat' },
        h('div', {}, h('small', {}, 'Student'), h('b', {}, r.student || '—')),
        h('div', {}, h('small', {}, 'Mode'), h('b', {}, r.mode === 'checkride' ? 'Checkride' : 'Training')),
        h('div', {}, h('small', {}, 'Time'), h('b', {}, fmtTime(sim.time))),
        h('div', {}, h('small', {}, 'Phase'), h('b', {}, r.phase(sim))),
        h('div', {}, h('small', {}, 'LAT dev'), h('b', { class: lat !== null && Math.abs(lat) > 1.5 ? 'bad' : '' }, lat === null ? '—' : `${lat.toFixed(2)} dots`)),
        h('div', {}, h('small', {}, 'VERT dev'), h('b', { class: vert !== null && Math.abs(vert) > 1.5 ? 'bad' : '' }, vert === null ? '—' : `${vert.toFixed(2)} dots`)),
        h('div', {}, h('small', {}, 'IAS / ALT'), h('b', {}, `${Math.round(sim.ac.data.iasKt)} kt / ${Math.round(sim.indicatedAlt())} ft`)),
        h('div', {}, h('small', {}, 'Visual'), h('b', {}, sim.hasVisual() ? 'yes' : 'no (IMC)')),
      ),
      h('div', { class: `ios-verdict ${acs.result}` }, `ACS: ${acs.result}`, h('span', {}, `Score ${db.score} · ${db.grade}`)),
      h('div', { class: 'ios-acs' }, ...acs.items.map((i) => h('div', { class: i.result }, h('b', {}, i.result), h('span', {}, i.task), h('small', {}, i.actual)))),
    );
  }
}

// ------------------------------------------------------------------ attempt history
export interface Attempt {
  id: string;
  date: string;
  student: string;
  scenario: string;
  approach: string;
  mode: 'training' | 'checkride';
  score: number;
  grade: string;
  acs: string;
  failedTasks: string[];
  failures: string[];
  durationSec: number;
}

const KEY = 'ifr.history.v1';
export const history = {
  all(): Attempt[] {
    return store.get<Attempt[]>(KEY, []);
  },
  add(a: Attempt) {
    const list = history.all();
    list.unshift(a);
    store.set(KEY, list.slice(0, 500));
  },
  clear() {
    store.set(KEY, []);
  },
  csv(list: Attempt[]): string {
    const head = ['date', 'student', 'mode', 'scenario', 'approach', 'acs', 'score', 'grade', 'failed_tasks', 'failures', 'duration_s'];
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    return [head.join(','), ...list.map((a) => [a.date, a.student, a.mode, a.scenario, a.approach, a.acs, a.score, a.grade, a.failedTasks.join('; '), a.failures.join('; '), Math.round(a.durationSec)].map(q).join(','))].join('\n');
  },
};

export class HistoryModal extends Modal {
  private filter = '';
  constructor() {
    super('Training records', 'md');
  }
  open() {
    this.render();
    super.open();
  }
  render() {
    clear(this.body);
    clear(this.foot);
    const all = history.all();
    const students = [...new Set(all.map((a) => a.student || '—'))];
    const list = all.filter((a) => !this.filter || (a.student || '—') === this.filter);
    const sel = h('select', { onchange: (e: Event) => { this.filter = (e.target as HTMLSelectElement).value; this.render(); } }, h('option', { value: '' }, 'All students'), ...students.map((s) => h('option', { value: s, selected: s === this.filter }, s)));
    const passes = list.filter((a) => a.mode === 'checkride' && a.acs === 'PASS').length;
    const rides = list.filter((a) => a.mode === 'checkride').length;
    this.body.append(
      h('div', { class: 'ios-row', style: 'align-items:center' }, h('label', { class: 'field', style: 'min-width:220px' }, h('b', {}, 'Student'), sel), h('span', { class: 'chip' }, `${list.length} flights`), h('span', { class: 'chip' }, `Checkrides ${passes}/${rides} passed`), h('span', { class: 'chip' }, `Avg score ${list.length ? Math.round(list.reduce((a, b) => a + b.score, 0) / list.length) : '—'}`)),
    );
    if (!list.length) this.body.append(h('p', { class: 'muted' }, 'No flights recorded yet. Every debrief is saved here automatically (in this browser).'));
    else
      this.body.append(
        h('table', { class: 'items hist' },
          h('tr', {}, ...['Date', 'Student', 'Scenario', 'Mode', 'ACS', 'Score', 'Failed tasks'].map((t) => h('th', {}, t))),
          ...list.slice(0, 200).map((a) => h('tr', {}, h('td', {}, new Date(a.date).toLocaleString()), h('td', {}, a.student || '—'), h('td', {}, a.scenario), h('td', {}, a.mode), h('td', { class: `acs ${a.acs}` }, a.acs), h('td', {}, `${a.score} ${a.grade}`), h('td', { class: 'muted' }, a.failedTasks.join(', ') || '—'))),
        ),
      );
    this.foot.append(
      h('button', { class: 'btn danger', onclick: () => { if (confirm('Delete all training records stored in this browser?')) { history.clear(); this.render(); } } }, 'Clear records'),
      h('span', { style: 'flex:1' }),
      h('button', { class: 'btn primary', onclick: () => {
        const blob = new Blob([history.csv(list)], { type: 'text/csv' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `ifr-training-records-${new Date().toISOString().slice(0, 10)}.csv` });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } }, 'Export CSV'),
    );
  }
}
