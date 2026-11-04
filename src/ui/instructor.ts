// Instructor operating station: failures, reposition, freeze, weather and a live ACS monitor.
import { h, clear, fmtTime } from './dom';
import { svgIcon, I } from './icons';
import { FAILURE_LABELS, type Failures, type Sim } from '../sim/sim';
import { WX_PRESETS, Modal } from './modals';
import { evaluateAcs, computeDebrief } from '../sim/recorder';

export class InstructorDrawer {
  el: HTMLElement;
  private body: HTMLElement;
  private live: HTMLElement;
  private acc = 0;
  onBuilder?: () => void;
  /** open the phone / tablet pairing window (the shell sets it; without it the drawer opens src/ui/remotePair.ts itself) */
  onPair?: () => void;
  /** last state of the instructor companion link (src/connect/remoteLink.ts announces it on window) */
  private remote: { state: string; device?: string; code?: string } = { state: 'off' };
  private pairRow = h('div', { class: 'ios-pair' });
  constructor(private sim: Sim, private toast: (m: string, k?: 'info' | 'good' | 'warn' | 'bad') => void) {
    this.body = h('div', { class: 'ios-body' });
    this.live = h('div', { class: 'ios-live' });
    this.el = h('aside', { class: 'drawer left ios', 'aria-label': 'Instructor station' },
      h('header', {}, h('h3', {}, 'Instructor station'), h('button', { class: 'x', onclick: () => this.toggle(false), title: 'Close (I)', 'aria-label': 'Close' }, '×')),
      h('div', { class: 'ios-scroll' }, this.pairRow, this.live, this.body),
    );
    this.render();
    this.renderPair();
    window.addEventListener('ifr-remote-status', (e: Event) => {
      const d = (e as CustomEvent<{ state: string; device?: string; code?: string }>).detail;
      if (!d) return;
      const was = this.remote.state;
      this.remote = d;
      if (d.state === 'connected' && was !== 'connected') this.toast(`Instructor connected: ${d.device ?? 'phone or tablet'}`, 'good');
      else if (was === 'connected' && d.state !== 'connected') this.toast('Instructor console disconnected', 'info');
      this.renderPair();
    });
  }
  /** "Pair a phone or tablet": the instructor runs the session from a phone or tablet (remote.html) */
  private renderPair() {
    const r = this.remote;
    const on = r.state === 'connected';
    const live = on || r.state === 'waiting' || r.state === 'reconnecting' || r.state === 'starting';
    clear(this.pairRow);
    this.pairRow.className = `ios-pair${on ? ' on' : live ? ' live' : ''}`;
    this.pairRow.append(
      h('i', { 'aria-hidden': 'true' }),
      h('div', {},
        h('b', {}, 'Instructor on a phone or tablet'),
        h('small', {}, on ? `Connected: ${r.device ?? 'instructor console'}` : live ? 'Waiting for the instructor to scan the code' : 'Scan a code to run failures, weather and vectors remotely'),
      ),
      h('button', { class: `btn${live ? '' : ' primary'}`, type: 'button', onclick: () => this.pair() }, svgIcon(I.tablet, 16), on || live ? 'Show pairing' : 'Pair a phone or tablet'),
    );
  }
  private pair() {
    if (this.onPair) { this.onPair(); return; }
    const api = (window as unknown as { __ifr?: { remote?: unknown } }).__ifr?.remote;
    import('./remotePair')
      .then((m) => m.openRemotePair((api as Parameters<typeof m.openRemotePair>[0] | undefined) ?? this.sim))
      .catch(() => this.toast('Could not open instructor pairing', 'bad'));
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
    this.body.append(sec('Training'));
    this.body.append(h('button', { class: 'btn ios-builder', onclick: () => { this.toggle(false); this.onBuilder?.(); } }, svgIcon(I.tools, 16), 'Build an IFR circuit'));
    this.body.append(h('p', { class: 'muted ios-foot' }, 'All instructor actions are time-stamped in the flight record and appear in the debrief timeline.'));
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
      h('div', { class: `ios-verdict ${acs.result}` }, `ACS: ${acs.result === 'INCOMPLETE' ? 'Incomplete' : acs.result}`, h('span', {}, db.graded ? `Score ${db.score} · ${db.grade}` : 'Not graded yet')),
      h('div', { class: 'ios-acs' }, ...acs.items.map((i) => h('div', { class: i.result === 'N/A' ? 'NA' : i.result }, h('b', {}, i.result === 'N/A' ? '—' : i.result), h('span', {}, i.task), h('small', {}, i.actual)))),
    );
  }
}

// ------------------------------------------------------------------ attempt history
import { history, type Attempt } from './history';
export { history, type Attempt };

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
    const scored = list.filter((a) => a.graded !== false);
    const pill = (k: string, v: string) => h('div', { class: 'hist-pill' }, h('small', {}, k), h('b', {}, v));
    this.body.append(
      h('div', { class: 'hist-bar' },
        h('label', { class: 'field' }, h('b', {}, 'Student'), sel),
        pill('Flights', String(list.length)),
        pill('Checkrides passed', rides ? `${passes} / ${rides}` : '—'),
        pill('Average score', scored.length ? String(Math.round(scored.reduce((a, b) => a + b.score, 0) / scored.length)) : '—'),
      ),
    );
    const when = (d: string) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    if (!list.length)
      this.body.append(h('div', { class: 'hist-empty' }, svgIcon(I.records, 40), h('b', {}, 'No flights recorded yet'), h('span', {}, 'Every debrief of a flight longer than 30 seconds, and every exercise attempt, is saved here automatically (in this browser).')));
    else
      this.body.append(
        h('table', { class: 'items hist' },
          h('tr', {}, ...['Date', 'Student', 'Flight', 'Mode', 'ACS', 'Score', 'Failed tasks'].map((t) => h('th', { class: t === 'Score' ? 'num' : '' }, t))),
          ...list.slice(0, 200).map((a) =>
            h('tr', {},
              h('td', { class: 'nowrap' }, when(a.date)),
              h('td', {}, a.student || '—'),
              h('td', {}, h('div', {}, a.exerciseTitle ?? a.scenario), a.exercise ? h('small', { class: 'muted' }, a.passed ? 'Exercise · passed' : 'Exercise · not passed') : a.approach ? h('small', { class: 'muted' }, a.approach) : null),
              h('td', {}, a.mode === 'checkride' ? 'Checkride' : 'Training'),
              h('td', { class: `acs ${a.acs}` }, a.acs === 'INCOMPLETE' ? 'Incomplete' : a.acs),
              h('td', { class: 'num' }, a.graded === false ? h('span', { class: 'muted' }, '—') : `${a.score} · ${a.grade}`),
              h('td', { class: 'muted' }, a.failedTasks.join(', ') || '—'),
            ),
          ),
        ),
      );
    this.foot.append(
      h('button', { class: 'btn link quiet', disabled: !all.length, onclick: () => { if (confirm('Delete all training records stored in this browser?')) { history.clear(); this.render(); } } }, 'Clear records'),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', disabled: !list.length, onclick: () => {
        const blob = new Blob([history.csv(list)], { type: 'text/csv' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `ifr-training-records-${new Date().toISOString().slice(0, 10)}.csv` });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } }, 'Export CSV'),
    );
  }
}
