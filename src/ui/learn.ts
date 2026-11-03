// Learning paths, exercise briefings, hold-entry drill and lesson results.
import { h, clear, fmtTime, store } from './dom';
import { Modal } from './modals';
import { EXERCISES, PATHS, STAGES, exercise, type Path } from '../train/curriculum';
import { LessonRun, type Exercise, type LessonResult } from '../train/engine';
import { holdDiagramSvg } from '../train/diagram';
import { holdEntry, clearanceText, type Turn } from '../nav/holding';
import { approachPlate } from '../plates/plates';
import { approach } from '../nav/data';
import type { Sim } from '../sim/sim';

export interface Progress {
  passed: boolean;
  best: number;
  attempts: number;
  last: string;
}
const PKEY = 'ifr.progress.v1';
export const progress = {
  all: () => store.get<Record<string, Progress>>(PKEY, {}),
  get: (id: string) => progress.all()[id],
  record(id: string, r: LessonResult) {
    const all = progress.all();
    const p = all[id] ?? { passed: false, best: 0, attempts: 0, last: '' };
    p.attempts++;
    p.best = Math.max(p.best, r.score);
    p.passed = p.passed || r.passed;
    p.last = new Date().toISOString();
    all[id] = p;
    store.set(PKEY, all);
  },
  reset: () => store.set(PKEY, {}),
};

function statusBadge(id: string) {
  const p = progress.get(id);
  if (!p) return h('span', { class: 'lp-badge' }, 'New');
  return p.passed ? h('span', { class: 'lp-badge ok' }, `✓ ${p.best}`) : h('span', { class: 'lp-badge try' }, `${p.attempts}× · ${p.best}`);
}

export class LearnModal extends Modal {
  private tab: 'paths' | 'stages' = 'paths';
  private path: Path | null = null;
  constructor(private onPick: (ex: Exercise, path: Path | null) => void, private onDrill: () => void) {
    super('Learn IFR');
  }
  open() {
    this.render();
    super.open();
  }
  render() {
    clear(this.body);
    clear(this.foot);
    const all = progress.all();
    const passedCount = EXERCISES.filter((e) => all[e.id]?.passed).length;
    this.body.append(
      h('div', { class: 'lp-hero' },
        h('div', {},
          h('h1', {}, 'Your instrument rating, step by step'),
          h('p', { class: 'muted' }, `${EXERCISES.length} graded exercises in ${STAGES.length} stages — from the first instrument scan to holding entries, DME arcs, procedure turns, every approach type and the full checkride profile. Each exercise has a briefing, the approach plate, a knowledge check and objective standards.`),
        ),
        h('div', { class: 'lp-ring' }, h('b', {}, `${passedCount}/${EXERCISES.length}`), h('span', {}, 'exercises passed'), h('div', { class: 'lp-bar' }, h('i', { style: `width:${(passedCount / EXERCISES.length) * 100}%` }))),
      ),
    );
    this.body.append(
      h('div', { class: 'filter' },
        h('button', { class: this.tab === 'paths' ? 'on' : '', onclick: () => { this.tab = 'paths'; this.path = null; this.render(); } }, 'Learning paths'),
        h('button', { class: this.tab === 'stages' ? 'on' : '', onclick: () => { this.tab = 'stages'; this.render(); } }, 'All exercises by stage'),
        h('button', { onclick: () => { this.close(); this.onDrill(); } }, '⚡ Hold-entry drill (no flying)'),
      ),
    );
    if (this.tab === 'paths' && !this.path) {
      const grid = h('div', { class: 'cards' });
      for (const p of PATHS) {
        const done = p.exercises.filter((id) => all[id]?.passed).length;
        grid.append(
          h('button', { class: 'card', onclick: () => { this.path = p; this.render(); } },
            h('span', { class: 'k Departure' }, `${p.exercises.length} exercises`),
            h('h3', {}, p.title),
            h('p', {}, p.desc),
            h('div', { class: 'lp-bar' }, h('i', { style: `width:${(done / p.exercises.length) * 100}%` })),
            h('div', { class: 'meta' }, h('span', {}, `${done}/${p.exercises.length} passed`), h('span', {}, 'Open →')),
          ),
        );
      }
      this.body.append(grid);
    } else if (this.tab === 'paths' && this.path) {
      const p = this.path;
      const next = p.exercises.find((id) => !all[id]?.passed) ?? p.exercises[0];
      this.body.append(h('div', { class: 'lp-path-head' }, h('button', { class: 'btn', onclick: () => { this.path = null; this.render(); } }, '← All paths'), h('h2', {}, p.title)));
      const list = h('ol', { class: 'lp-list' });
      p.exercises.forEach((id, i) => {
        const e = exercise(id);
        list.append(
          h('li', { class: `${all[id]?.passed ? 'done' : ''}${id === next ? ' next' : ''}` },
            h('span', { class: 'lp-num' }, all[id]?.passed ? '✓' : String(i + 1)),
            h('div', { class: 'lp-txt' }, h('b', {}, e.title), h('small', {}, `${STAGES.find((s) => s.id === e.stage)?.title.split('—')[1]?.trim() ?? ''} · ~${e.minutes} min · ${e.allowAp ? 'AP allowed' : 'hand-flown'}`), h('span', {}, e.summary)),
            statusBadge(id),
            h('button', { class: `btn${id === next ? ' primary' : ''}`, onclick: () => { this.close(); this.onPick(e, p); } }, id === next ? 'Start' : 'Fly'),
          ),
        );
      });
      this.body.append(list);
    } else {
      for (const st of STAGES) {
        this.body.append(h('div', { class: 'section-t' }, st.title), h('p', { class: 'muted', style: 'margin:0 0 8px;font-size:12.5px' }, st.desc));
        const grid = h('div', { class: 'cards' });
        for (const e of EXERCISES.filter((x) => x.stage === st.id)) {
          grid.append(
            h('button', { class: 'card', onclick: () => { this.close(); this.onPick(e, null); } },
              h('div', { class: 'meta' }, h('span', { class: 'k Precision' }, e.allowAp ? 'AP allowed' : 'Hand-flown'), statusBadge(e.id)),
              h('h3', {}, e.title),
              h('p', {}, e.summary),
              h('div', { class: 'meta' }, h('span', {}, `~${e.minutes} min`), h('span', {}, e.plate ? 'Plate ✓' : '')),
            ),
          );
        }
        this.body.append(grid);
      }
    }
    this.foot.append(
      h('button', { class: 'btn danger', onclick: () => { if (confirm('Reset all exercise progress in this browser?')) { progress.reset(); this.render(); } } }, 'Reset progress'),
      h('span', { style: 'flex:1' }),
      h('button', { class: 'btn', onclick: () => this.close() }, 'Close'),
    );
  }
}

// ----------------------------------------------------------------- briefing
export class BriefingModal extends Modal {
  run: LessonRun | null = null;
  private answered: number | null = null;
  constructor(private sim: Sim, private onStart: (run: LessonRun) => void, private onPlate: (id: string) => void) {
    super('Exercise briefing', 'md');
  }
  show(ex: Exercise) {
    this.sim.paused = true;
    this.run = new LessonRun(ex, this.sim);
    this.answered = null;
    this.render();
    this.open();
  }
  render() {
    const run = this.run!;
    const ex = run.ex;
    clear(this.body);
    clear(this.foot);
    const stage = STAGES.find((s) => s.id === ex.stage);
    this.body.append(
      h('div', { class: 'muted', style: 'font-size:12px;text-transform:uppercase;letter-spacing:1px' }, stage?.title ?? ''),
      h('h2', { style: 'margin:4px 0 6px' }, ex.title),
      h('p', { style: 'margin:0 0 12px;color:var(--text-2)' }, ex.summary),
    );
    if (run.rt.clearance) this.body.append(h('div', { class: 'atc' }, h('b', {}, 'ATC CLEARANCE'), h('span', {}, `“${run.rt.clearance}”`)));
    this.body.append(
      h('div', { class: 'two' },
        h('div', {},
          h('div', { class: 'section-t' }, 'Objectives'), h('ul', { class: 'tips' }, ...ex.objectives.map((o) => h('li', {}, o))),
          h('div', { class: 'section-t' }, 'Standards'), h('ul', { class: 'tips' }, ...ex.standards.map((o) => h('li', {}, o))),
        ),
        h('div', {},
          h('div', { class: 'section-t' }, 'Briefing'), h('ul', { class: 'tips' }, ...ex.briefing.map((o) => h('li', {}, o))),
          h('div', { class: 'section-t' }, 'Steps'), h('ol', { class: 'tips' }, ...run.rt.steps.map((s) => h('li', {}, s.text))),
        ),
      ),
    );
    if (ex.plate) {
      const ap = approach(ex.plate);
      this.body.append(
        h('div', { class: 'section-t' }, `Approach plate — ${ap.airport} ${ap.name}`),
        h('div', { class: 'plate-row' }, h('div', { class: 'plate-mini', html: approachPlate(ap) }), h('div', {}, h('p', { class: 'muted' }, 'Brief it like a pro: ATIS/frequencies · final course · FAF altitude · minimums · MAP · missed approach (climb, turn, altitude, hold).'), h('button', { class: 'btn', onclick: () => this.onPlate(ex.plate!) }, 'Open in chart viewer'))),
      );
    }
    const q = run.rt.quiz;
    if (q) {
      this.body.append(h('div', { class: 'section-t' }, 'Knowledge check'), h('p', {}, q.question));
      const opts = h('div', { class: 'quiz-opts' });
      q.options.forEach((o, i) => {
        const cls = this.answered === null ? '' : i === q.answer ? 'right' : i === this.answered ? 'wrong' : '';
        opts.append(h('button', { class: `btn ${cls}`, disabled: this.answered !== null, onclick: () => { this.answered = i; this.render(); } }, o));
      });
      this.body.append(opts);
      if (this.answered !== null) {
        this.body.append(h('div', { class: `quiz-fb ${this.answered === q.answer ? 'ok' : 'ko'}` }, h('b', {}, this.answered === q.answer ? 'Correct.' : 'Not quite.'), ' ', q.explain));
        if (q.svg) this.body.append(h('div', { class: 'diagram', html: q.svg }));
      }
    } else if (run.rt.hold) {
      this.body.append(h('div', { class: 'diagram', html: holdDiagramSvg(run.rt.hold.inbound, run.rt.hold.turn, run.rt.hold.fix.ident) }));
    }
    const needQuiz = !!q && this.answered === null;
    this.foot.append(
      h('span', { class: 'muted', style: 'flex:1;align-self:center;font-size:12.5px' }, needQuiz ? 'Answer the knowledge check to start.' : 'The simulation starts paused at the briefing position.'),
      h('button', { class: 'btn', onclick: () => this.close() }, 'Cancel'),
      h('button', { class: 'btn primary', disabled: needQuiz, onclick: () => { this.close(); this.onStart(run); } }, 'Start exercise ✈'),
    );
  }
}

// ----------------------------------------------------------------- result
export class LessonResultModal extends Modal {
  constructor(private onRetry: (ex: Exercise) => void, private onNext: (ex: Exercise) => void, private onDebrief: () => void) {
    super('Exercise result', 'md');
  }
  show(run: LessonRun, path: Path | null) {
    const r = run.finished!;
    progress.record(run.ex.id, r);
    clear(this.body);
    clear(this.foot);
    this.body.append(
      h('div', { class: 'grade-row' },
        h('div', { class: `grade ${r.passed ? 'A' : 'F'}` }, r.passed ? '✓' : '✗', h('small', {}, `${r.score}/100`)),
        h('div', {}, h('h2', { style: 'margin:0 0 4px' }, `${r.passed ? 'Passed' : 'Not yet'} — ${run.ex.title}`), h('p', { class: 'muted' }, `${r.reason} · ${fmtTime(r.durationSec)}`)),
      ),
      h('table', { class: 'items' }, h('tr', {}, ...['Step', 'Done', 'Out of tolerance', 'First deviation'].map((t) => h('th', {}, t))), ...r.steps.map((s) => h('tr', {}, h('td', {}, s.text), h('td', {}, s.done ? '✓' : '—'), h('td', { class: `pen${s.violationSec < 1 ? ' zero' : ''}` }, s.violationSec < 1 ? '0 s' : `${Math.round(s.violationSec)} s`), h('td', { class: 'muted' }, s.worst ?? '')))),
    );
    if (r.holdReport) this.body.append(h('div', { class: 'section-t' }, 'Holding'), h('table', { class: 'items acs-table' }, ...r.holdReport.map((i) => h('tr', { class: i.ok === null ? 'N/A' : i.ok ? 'PASS' : 'FAIL' }, h('td', {}, i.ok === null ? '—' : i.ok ? 'PASS' : 'FAIL'), h('td', {}, i.label), h('td', {}, i.value)))));
    if (run.rt.hold && run.holdEval?.correctEntry) this.body.append(h('div', { class: 'diagram', html: holdDiagramSvg(run.rt.hold.inbound, run.rt.hold.turn, run.rt.hold.fix.ident, run.holdEval.arrivalCourse) }));
    if (r.acs) this.body.append(h('div', { class: 'section-t' }, `ACS — ${r.acs.result}`), h('table', { class: 'items acs-table' }, ...r.acs.items.map((i) => h('tr', { class: i.result }, h('td', {}, i.result), h('td', {}, i.task), h('td', { class: 'muted' }, i.standard), h('td', {}, i.actual)))));
    const idx = path ? path.exercises.indexOf(run.ex.id) : -1;
    const nextId = path && idx >= 0 ? path.exercises[idx + 1] : EXERCISES[EXERCISES.findIndex((e) => e.id === run.ex.id) + 1]?.id;
    this.foot.append(
      h('button', { class: 'btn', onclick: () => { this.close(); this.onDebrief(); } }, 'Full debrief'),
      h('span', { style: 'flex:1' }),
      h('button', { class: 'btn', onclick: () => { this.close(); this.onRetry(run.ex); } }, 'Retry ↻'),
      nextId ? h('button', { class: 'btn primary', onclick: () => { this.close(); this.onNext(exercise(nextId)); } }, 'Next exercise →') : h('span', {}),
    );
    this.open();
  }
}

// ----------------------------------------------------------------- hold entry drill
export class HoldDrillModal extends Modal {
  private n = 0;
  private score = 0;
  private q: { inbound: number; turn: Turn; crs: number; fix: string; answer: string } | null = null;
  private picked: string | null = null;
  private t0 = 0;
  private times: number[] = [];
  constructor() {
    super('Hold-entry drill', 'md');
  }
  open() {
    this.n = 0;
    this.score = 0;
    this.times = [];
    this.newQ();
    super.open();
  }
  private newQ() {
    const fixes = ['ARD', 'MSV', 'KEDDY', 'WILLO', 'TOBEY', 'PA'];
    const inbound = Math.round(Math.random() * 35) * 10 || 360;
    const turn: Turn = Math.random() < 0.65 ? 'R' : 'L';
    let crs = 360;
    for (let k = 0; k < 50; k++) {
      crs = Math.round(Math.random() * 71) * 5 || 360;
      let a = ((crs - inbound + 540) % 360) - 180;
      if (turn === 'L') a = -a;
      if ([-110, 70, 180, -180].every((b) => Math.abs(a - b) > 8)) break;
    }
    const fix = fixes[Math.floor(Math.random() * fixes.length)];
    this.q = { inbound, turn, crs, fix, answer: holdEntry(inbound, turn, crs) };
    this.picked = null;
    this.t0 = performance.now();
    this.render();
  }
  render() {
    const q = this.q!;
    clear(this.body);
    clear(this.foot);
    const isVor = q.fix === 'ARD' || q.fix === 'MSV';
    const txt = clearanceText({ fix: { ident: q.fix, lat: 0, lon: 0 }, inbound: q.inbound, turn: q.turn, legMin: 1, altFt: 4000 }, isVor);
    this.body.append(
      h('div', { class: 'meta', style: 'display:flex;justify-content:space-between' }, h('b', {}, `Question ${this.n + 1} / 10`), h('span', { class: 'chip' }, `Score ${this.score}`)),
      h('div', { class: 'atc' }, h('b', {}, 'ATC'), h('span', {}, `“${txt}”`)),
      h('p', { style: 'font-size:16px' }, `You are proceeding to ${q.fix} on a course of `, h('b', {}, `${String(q.crs).padStart(3, '0')}°`), '. Which entry?'),
    );
    const opts = h('div', { class: 'quiz-opts' });
    for (const o of ['DIRECT', 'TEARDROP', 'PARALLEL']) {
      const cls = this.picked === null ? '' : o === q.answer ? 'right' : o === this.picked ? 'wrong' : '';
      opts.append(h('button', { class: `btn big ${cls}`, disabled: this.picked !== null, onclick: () => { this.picked = o; this.times.push((performance.now() - this.t0) / 1000); if (o === q.answer) this.score++; this.render(); } }, o));
    }
    this.body.append(opts);
    if (this.picked !== null) {
      this.body.append(h('div', { class: 'diagram', html: holdDiagramSvg(q.inbound, q.turn, q.fix, q.crs) }));
      const last = this.n >= 9;
      this.foot.append(
        h('span', { class: 'muted', style: 'flex:1;align-self:center' }, `Answered in ${this.times[this.times.length - 1].toFixed(1)} s`),
        last
          ? h('button', { class: 'btn primary', onclick: () => this.finish() }, 'See result')
          : h('button', { class: 'btn primary', onclick: () => { this.n++; this.newQ(); } }, 'Next →'),
      );
    }
  }
  private finish() {
    clear(this.body);
    clear(this.foot);
    const avg = this.times.reduce((a, b) => a + b, 0) / this.times.length;
    this.body.append(
      h('div', { class: 'grade-row' }, h('div', { class: `grade ${this.score >= 9 ? 'A' : this.score >= 7 ? 'B' : this.score >= 5 ? 'C' : 'F'}` }, `${this.score}`, h('small', {}, '/ 10')), h('div', {}, h('h2', {}, this.score >= 9 ? 'Entries are automatic.' : 'Keep drilling.'), h('p', { class: 'muted' }, `Average decision time ${avg.toFixed(1)} s — aim for under 5 s before flying it.`))),
    );
    this.foot.append(h('button', { class: 'btn', onclick: () => this.close() }, 'Close'), h('button', { class: 'btn primary', onclick: () => this.open() }, 'Again ↻'));
  }
}
