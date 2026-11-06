// Learning paths, exercise briefings, hold-entry drill and lesson results.
import { h, clear, fmtTime, store } from './dom';
import { Modal, saveFlightRecord } from './modals';
import { EXERCISES, PATHS, STAGES, exercise, type Path } from '../train/curriculum';
import { LessonRun, withSeed, newRunSeed, type Exercise, type LessonResult } from '../train/engine';
import { holdDiagramSvg } from '../train/diagram';
import { holdEntry, clearanceText, type Turn } from '../nav/holding';
import { approachPlate } from '../plates/plates';
import { findApproach } from '../nav/data';
import { svgIcon, I } from './icons';
import { confirmAction } from './confirm';
import { history } from './history';
import { Sim } from '../sim/sim';

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
  /** one graded attempt (an exercise ended early is not an attempt: nothing is recorded) */
  record(id: string, r: LessonResult) {
    if (r.graded === false || r.score === null) return;
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
    super('Learning paths');
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
            h('span', { class: 'k count' }, `${p.exercises.length} exercises`),
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
              h('div', { class: 'meta' }, h('span', { class: 'k count' }, e.allowAp ? 'AP allowed' : 'Hand-flown'), statusBadge(e.id)),
              h('h3', {}, e.title),
              h('p', {}, e.summary),
              h('div', { class: 'meta' }, h('span', {}, `~${e.minutes} min`), h('span', {}, e.plate ? 'Approach plate' : '')),
            ),
          );
        }
        this.body.append(grid);
      }
    }
    if (passedCount || Object.keys(all).length)
      this.body.append(h('div', { class: 'learn-reset' }, h('button', { class: 'btn link quiet', onclick: (e: Event) => void this.askReset(e.currentTarget as HTMLElement) }, 'Reset progress')));
  }
  private async askReset(anchor: HTMLElement) {
    const ok = await confirmAction({
      title: 'Reset exercise progress?',
      body: 'Passed exercises, attempts and best scores in this browser are deleted. Your training records are kept.',
      confirmLabel: 'Reset progress',
      destructive: true,
      anchor,
    });
    if (!ok) return;
    progress.reset();
    if (this.isOpen) this.render();
  }
}

// ----------------------------------------------------------------- briefing
export interface BriefingOptions {
  /** the exercise flying now (Restart): it stays as it is behind the briefing, and nothing is reset until Start */
  current?: LessonRun | null;
  /** the briefing closed without Start: Cancel, ×, Esc, a backdrop tap or another window opening */
  onCancel?: () => void;
}

/**
 * The briefing of an exercise, opened before it starts.
 *
 *   briefing.show(ex)                                    first start: the sim is set up at once (paused at the
 *                                                        briefing position) and Start runs it
 *   briefing.show(ex, { current: lesson, onCancel })     Restart: the running exercise is kept until Start; Cancel
 *                                                        leaves it flying as it was (pause state restored) and calls
 *                                                        onCancel; Start builds a new run with the same random
 *                                                        draws as the one briefed and hands it to onStart
 */
export class BriefingModal extends Modal {
  run: LessonRun | null = null;
  private answered: number | null = null;
  private opts: BriefingOptions = {};
  /** Restart preview: the seed Start replays on the live sim (null: the run is already set up on it) */
  private seed: number | null = null;
  private wasPaused = false;
  private starting = false;
  /** set-up of a previewed run (built once, reused) */
  private static scratch: Sim | null = null;
  constructor(private sim: Sim, private onStart: (run: LessonRun) => void, private onPlate: (id: string) => void) {
    super('Exercise briefing', 'md');
  }
  /** true while the briefing previews a restart: the sim still holds the exercise that was flying */
  get previewing() {
    return this.isOpen && this.seed !== null;
  }
  show(ex: Exercise, opts: BriefingOptions = {}) {
    if (this.isOpen) this.close(); // a briefing already open is cancelled first
    this.opts = opts;
    this.answered = null;
    this.starting = false;
    this.wasPaused = this.sim.paused;
    this.sim.paused = true;
    const cur = opts.current;
    if (cur && !cur.finished && cur.sim === this.sim) {
      this.seed = newRunSeed();
      BriefingModal.scratch ??= new Sim();
      const scratch = BriefingModal.scratch;
      this.run = withSeed(this.seed, () => new LessonRun(ex, scratch));
    } else {
      this.seed = null;
      this.run = new LessonRun(ex, this.sim);
      this.sim.rec.lesson = { id: ex.id, title: ex.title };
    }
    this.render();
    this.open();
  }
  private start() {
    let run = this.run!;
    if (this.seed !== null) {
      const seed = this.seed;
      const ex = run.ex;
      run = withSeed(seed, () => new LessonRun(ex, this.sim));
      this.sim.rec.lesson = { id: ex.id, title: ex.title };
      this.run = run;
      this.seed = null;
    }
    this.starting = true;
    this.close();
    this.starting = false;
    this.opts = {};
    this.onStart(run);
  }
  close() {
    const wasOpen = this.isOpen;
    super.close();
    if (!wasOpen || this.starting) return;
    // closed without Start: a restart preview leaves the running exercise as it was
    if (this.seed !== null) {
      this.sim.paused = this.wasPaused;
      this.seed = null;
    }
    const cb = this.opts.onCancel;
    this.opts = {};
    cb?.();
  }
  render() {
    const run = this.run!;
    const ex = run.ex;
    clear(this.body);
    clear(this.foot);
    const stage = STAGES.find((s) => s.id === ex.stage);
    this.body.append(
      h('div', { class: 'section-t brief-kicker' }, stage?.title ?? ''),
      h('h2', { class: 'brief-title' }, ex.title),
      h('p', { class: 'brief-sum' }, ex.summary),
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
        ),
      ),
      h('section', { class: 'brief-steps' }, h('div', { class: 'section-t' }, `Steps · ${run.rt.steps.length}`), h('ol', {}, ...run.rt.steps.map((s) => h('li', {}, s.text)))),
    );
    const ap = ex.plate ? findApproach(ex.plate) : undefined;
    if (ex.plate && ap) {
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
    const restart = this.seed !== null;
    this.foot.append(
      h('span', { class: 'muted', style: 'flex:1;align-self:center;font-size:12.5px' }, needQuiz ? 'Answer the knowledge check to start.' : restart ? 'Keep flying returns to your exercise as it was. Restart flies it again from step 1.' : 'The simulation starts paused at the briefing position.'),
      h('button', { class: 'btn', onclick: () => this.close() }, restart ? 'Keep flying' : 'Cancel'),
      h('button', { class: 'btn primary', disabled: needQuiz, onclick: () => this.start() }, restart ? 'Restart exercise' : 'Start exercise'),
    );
  }
}

// ----------------------------------------------------------------- result
/** a result with a score (an exercise ended early is not graded; results saved before the field existed are) */
export const isGraded = (r: LessonResult) => r.graded !== false && r.score !== null;
/** the step was flown, at least in part (the steps after the one the exercise stopped on were never reached) */
const stepReached = (run: LessonRun, i: number) => run.finished?.steps[i]?.done || i <= run.idx;

export class LessonResultModal extends Modal {
  constructor(private onRetry: (ex: Exercise) => void, private onNext: (ex: Exercise) => void, private onDebrief: () => void) {
    super('Exercise result', 'md');
  }
  show(run: LessonRun, path: Path | null) {
    const r = run.finished!;
    const graded = isGraded(r);
    // a graded attempt counts in the progress (attempts, best score); an exercise ended early does not
    progress.record(run.ex.id, r);
    // the flight goes into the training records: with the exercise and its score, or marked not graded
    run.sim.rec.lesson = graded ? { id: run.ex.id, title: run.ex.title, score: r.score!, passed: r.passed } : { id: run.ex.id, title: run.ex.title };
    const rec = saveFlightRecord(run.sim);
    if (rec && !graded) history.upsert({ ...rec, graded: false });
    clear(this.body);
    clear(this.foot);
    const flown = r.steps.filter((_, i) => stepReached(run, i)).length;
    this.body.append(
      graded
        ? h('div', { class: 'grade-row' },
            h('div', { class: `grade ${r.passed ? 'A' : 'F'}` }, r.passed ? '✓' : '✗', h('small', {}, `${r.score}/100`)),
            h('div', {}, h('h2', { style: 'margin:0 0 4px' }, `${r.passed ? 'Passed' : 'Not yet'} — ${run.ex.title}`), h('p', { class: 'muted' }, `${r.reason} · ${fmtTime(r.durationSec)}`)),
          )
        : h('div', { class: 'grade-row' },
            h('div', { class: 'grade none', 'aria-label': 'Not graded' }, '—', h('small', {}, 'Not graded')),
            h('div', {},
              h('h2', { style: 'margin:0 0 4px' }, `Ended early — ${run.ex.title}`),
              h('p', { class: 'muted' }, `${flown} of ${r.steps.length} step${r.steps.length === 1 ? '' : 's'} flown · ${fmtTime(r.durationSec)}. An exercise you end before it is complete has no score and does not count as an attempt.`),
            ),
          ),
      h('table', { class: 'items res-steps' },
        h('tr', {}, h('th', {}, 'Step'), h('th', {}, 'Done'), h('th', { class: 'num' }, 'Out of tolerance'), h('th', {}, 'First deviation')),
        ...r.steps.map((s, i) => {
          const reached = stepReached(run, i);
          const sec = Math.round(s.violationSec);
          // green "0 s" only for a step flown to the end within tolerance; "—" for a step never reached
          const pen = !reached ? h('td', { class: 'num na' }, '—') : h('td', { class: `pen${sec < 1 ? (s.done ? ' zero' : ' na') : ''}` }, s.violationSec <= 0 ? '0 s' : sec < 1 ? '<1 s' : `${sec} s`);
          return h('tr', {}, h('td', {}, s.text), h('td', { class: s.done ? 'done' : 'na' }, s.done ? svgIcon(I.check, 15) : reached ? 'Not completed' : 'Not flown'), pen, h('td', { class: 'muted' }, s.worst ?? ''));
        })),
    );
    if (!graded) {
      this.foot.append(
        h('button', { class: 'btn', onclick: () => { this.close(); this.onDebrief(); } }, 'Full debrief'),
        h('span', { style: 'flex:1' }),
        h('button', { class: 'btn', onclick: () => this.close() }, 'Close'),
        h('button', { class: 'btn primary', onclick: () => { this.close(); this.onRetry(run.ex); } }, 'Retry'),
      );
      this.open();
      return;
    }
    if (r.holdReport) this.body.append(h('div', { class: 'section-t' }, 'Holding'), h('table', { class: 'items acs-table' }, ...r.holdReport.map((i) => h('tr', { class: i.ok === null ? 'N/A' : i.ok ? 'PASS' : 'FAIL' }, h('td', {}, i.ok === null ? '—' : i.ok ? 'PASS' : 'FAIL'), h('td', {}, i.label), h('td', {}, i.value)))));
    if (run.rt.hold && run.holdEval?.correctEntry) this.body.append(h('div', { class: 'diagram', html: holdDiagramSvg(run.rt.hold.inbound, run.rt.hold.turn, run.rt.hold.fix.ident, run.holdEval.arrivalCourse) }));
    if (r.acs) this.body.append(h('div', { class: 'section-t' }, `ACS — ${r.acs.result}`), h('table', { class: 'items acs-table' }, ...r.acs.items.map((i) => h('tr', { class: i.result }, h('td', {}, i.result), h('td', {}, i.task), h('td', { class: 'muted' }, i.standard), h('td', {}, i.actual)))));
    const idx = path ? path.exercises.indexOf(run.ex.id) : -1;
    const nextId = path && idx >= 0 ? path.exercises[idx + 1] : EXERCISES[EXERCISES.findIndex((e) => e.id === run.ex.id) + 1]?.id;
    this.foot.append(
      h('button', { class: 'btn', onclick: () => { this.close(); this.onDebrief(); } }, 'Full debrief'),
      h('span', { style: 'flex:1' }),
      // the primary action sits on the right: Next exercise after a pass, Retry after a fail
      ...(() => {
        const retry = h('button', { class: `btn${r.passed ? '' : ' primary'}`, onclick: () => { this.close(); this.onRetry(run.ex); } }, 'Retry');
        const next = nextId ? h('button', { class: `btn${r.passed ? ' primary' : ''}`, onclick: () => { this.close(); this.onNext(exercise(nextId)); } }, 'Next exercise') : null;
        return next ? (r.passed ? [retry, next] : [next, retry]) : [retry];
      })(),
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
      if ([-70, 110, 180, -180].every((b) => Math.abs(a - b) > 8)) break;
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
          : h('button', { class: 'btn primary', onclick: () => { this.n++; this.newQ(); } }, 'Next question'),
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
    this.foot.append(h('button', { class: 'btn', onclick: () => this.close() }, 'Close'), h('button', { class: 'btn primary', onclick: () => this.open() }, 'Drill again'));
  }
}
