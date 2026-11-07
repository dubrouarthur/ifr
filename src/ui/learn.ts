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
import { registerStrings, t as tr } from './i18n';

// the briefing and result windows' own words (FR/EN): a course flight brings French students here
registerStrings('en', {
  'br.title': 'Exercise briefing',
  'br.objectives': 'Objectives',
  'br.standards': 'Standards',
  'br.briefing': 'Briefing',
  'br.steps': 'Steps · {n}',
  'br.quizFirst': 'Answer the knowledge check to start.',
  'br.restartHint': 'Keep flying returns to your exercise as it was. Restart flies it again from step 1.',
  'br.pausedHint': 'The simulation starts paused at the briefing position.',
  'br.keepFlying': 'Keep flying',
  'br.cancel': 'Cancel',
  'br.restart': 'Restart exercise',
  'br.start': 'Start exercise',
  'br.clearance': 'ATC CLEARANCE',
  'br.quiz': 'Knowledge check',
  'br.right': 'Correct.',
  'br.wrong': 'Not quite.',
  'lr.title': 'Exercise result',
  'lr.passed': 'Passed',
  'lr.notYet': 'Not yet',
  'lr.notGraded': 'Not graded',
  'lr.endedEarly': 'Ended early',
  'lr.earlyText': '{n} of {m} steps flown · {t}. An exercise you end before it is complete has no score and does not count as an attempt.',
  'lr.step': 'Step',
  'lr.done': 'Done',
  'lr.outTol': 'Out of tolerance',
  'lr.firstDev': 'First deviation',
  'lr.notCompleted': 'Not completed',
  'lr.notFlown': 'Not flown',
  'lr.debrief': 'Full debrief',
  'lr.close': 'Close',
  'lr.retry': 'Retry',
  'lr.next': 'Next exercise',
  'lr.holding': 'Holding',
});
registerStrings('fr', {
  'br.title': 'Briefing de l’exercice',
  'br.objectives': 'Objectifs',
  'br.standards': 'Tolérances',
  'br.briefing': 'Briefing',
  'br.steps': 'Étapes · {n}',
  'br.quizFirst': 'Répondez à la question de contrôle pour commencer.',
  'br.restartHint': 'Continuer le vol reprend votre exercice tel quel. Recommencer le reprend depuis l’étape 1.',
  'br.pausedHint': 'La simulation démarre en pause à la position du briefing.',
  'br.keepFlying': 'Continuer le vol',
  'br.cancel': 'Annuler',
  'br.restart': 'Recommencer l’exercice',
  'br.start': 'Commencer l’exercice',
  'br.clearance': 'CLAIRANCE ATC',
  'br.quiz': 'Question de contrôle',
  'br.right': 'Exact.',
  'br.wrong': 'Pas tout à fait.',
  'lr.title': 'Résultat de l’exercice',
  'lr.passed': 'Réussi',
  'lr.notYet': 'Pas encore',
  'lr.notGraded': 'Non noté',
  'lr.endedEarly': 'Arrêté avant la fin',
  'lr.earlyText': '{n} étape(s) sur {m} volée(s) · {t}. Un exercice arrêté avant la fin n’a pas de note et ne compte pas comme un essai.',
  'lr.step': 'Étape',
  'lr.done': 'Fait',
  'lr.outTol': 'Hors tolérance',
  'lr.firstDev': 'Premier écart',
  'lr.notCompleted': 'Non terminée',
  'lr.notFlown': 'Non volée',
  'lr.debrief': 'Débriefing complet',
  'lr.close': 'Fermer',
  'lr.retry': 'Réessayer',
  'lr.next': 'Exercice suivant',
  'lr.holding': 'Attente',
});
/** a window's title in the current language (the Modal sets it once, in English, at construction) */
function setModalTitle(m: Modal, title: string) {
  const h2 = m.box.querySelector('header h2');
  if (h2) h2.textContent = title;
  m.box.setAttribute('aria-label', title);
}
import { lang as uiLang } from './i18n';
import type { BriefingSource, DeckStage } from '../course/ui/briefingDeck';

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

/** the first step's set-up items as the briefing deck shows them (the exercise window's "Set it" list) */
function briefSetup(run: LessonRun): NonNullable<BriefingSource['setup']> {
  const st = run.rt.steps[0];
  if (!st?.setup) return [];
  try {
    return st.setup(run.ctx(0)).map((i) => ({ label: i.label, ...(i.detail ? { detail: i.detail } : {}), ok: i.ok, ...(i.action ? { action: i.action.label } : {}) }));
  } catch {
    return [];
  }
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
  /** the slide deck (course/ui/deckStage.ts, loaded on demand); null while it loads or if it cannot */
  private deck: DeckStage | null = null;
  private deckSeq = 0;
  private stageHost: HTMLElement;
  private hint = '';
  constructor(private sim: Sim, private onStart: (run: LessonRun) => void, private onPlate: (id: string) => void) {
    super('Exercise briefing', 'md');
    // every lesson is briefed by slides played in the cockpit (SPEC slides v2 §11): a dark sheet, the slide at
    // 16:9, a bar with progress, Cancel, Previous, Next, then Start exercise
    this.box.classList.remove('md');
    this.box.classList.add('brief-deck');
    this.stageHost = h('div', { class: 'bd-stage' });
    window.addEventListener('keydown', (e) => this.key(e), true);
    this.swipe(this.stageHost);
  }
  /** a horizontal swipe on the slide (iPad): left = Next, right = Previous; never starts the exercise */
  private swipe(el: HTMLElement) {
    let x0 = 0;
    let y0 = 0;
    let id = -1;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !e.isPrimary) return;
      // a drag on a diagram handle or an instrument control is not a swipe
      if ((e.target as HTMLElement | null)?.closest('.cs-handle, input, button')) return;
      id = e.pointerId;
      x0 = e.clientX;
      y0 = e.clientY;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      const d = this.deck;
      if (!d || Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) {
        if (!d.atEnd || d.reveal < d.revealCount) this.next();
      } else if (d.prev()) this.renderBar();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => (id = -1));
  }
  private get fr() {
    return uiLang() === 'fr';
  }
  private key(e: KeyboardEvent) {
    if (!this.isOpen || Modal.stack[Modal.stack.length - 1] !== this) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    const d = this.deck;
    if (!d) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !(t && t.tagName === 'BUTTON'))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      // the arrow never starts the exercise: on the last slide only Enter or the button does
      if (!d.atEnd || d.reveal < d.revealCount) this.next();
    } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (d.prev()) this.renderBar();
    } else if (e.key === 'Enter' && !(t && t.tagName === 'BUTTON')) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (d.atEnd && d.gatesDone) this.start();
      else this.next();
    }
  }
  /** Next: the next reveal or slide; on the last slide, Start (or the knowledge check still to answer) */
  private next() {
    const d = this.deck;
    if (!d) return;
    if (d.next()) return this.renderBar();
    if (d.gatesDone) return this.start();
    const g = d.pendingGate;
    if (g >= 0) {
      d.go(g);
      this.hint = this.fr ? 'Répondez à la question pour commencer.' : 'Answer the knowledge check to start.';
      this.renderBar();
    }
  }
  /** true while the briefing previews a restart: the sim still holds the exercise that was flying */
  get previewing() {
    return this.isOpen && this.seed !== null;
  }
  show(ex: Exercise, opts: BriefingOptions = {}) {
    if (this.isOpen) this.close(); // a briefing already open is cancelled first
    this.aside = null;
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
    this.deckSeq++;
    this.deck?.destroy();
    this.deck = null;
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
  /** an extra card at the top of the briefing (main.ts: the lesson's briefing course), kept across re-renders */
  aside: HTMLElement | null = null;
  /** the briefing as slides: the school's deck for this lesson, else the deck built from the exercise */
  render() {
    const run = this.run!;
    const ex = run.ex;
    const fr = this.fr;
    this.hint = '';
    this.deck?.destroy();
    this.deck = null;
    const seq = ++this.deckSeq;
    // header: Briefing · the lesson · the sim is paused at the start
    const head = this.box.querySelector('header')!;
    const h2 = head.querySelector('h2')!;
    clear(h2);
    h2.classList.add('bd-title');
    h2.append(h('span', { class: 'bd-k' }, 'Briefing'), h('span', { class: 'bd-t' }, ex.title));
    head.querySelector('.bd-chip')?.remove();
    head.insertBefore(
      h('span', { class: 'bd-chip' }, h('i', { 'aria-hidden': 'true' }), this.seed !== null ? (fr ? 'Votre exercice continue derrière' : 'Your exercise is kept behind') : fr ? 'Simulateur en pause au point de départ' : 'Simulator paused at the start'),
      head.querySelector('.x'),
    );
    this.box.setAttribute('aria-label', `Briefing · ${ex.title}`);
    clear(this.body);
    clear(this.stageHost);
    this.stageHost.classList.add('loading');
    this.body.append(this.stageHost);
    this.renderBar();
    const stage = STAGES.find((s) => s.id === ex.stage);
    const ap = ex.plate ? findApproach(ex.plate) : undefined;
    const src: BriefingSource = {
      id: ex.id,
      title: ex.title,
      summary: ex.summary,
      stageTitle: stage?.title,
      stage: ex.stage,
      minutes: ex.minutes,
      allowAp: ex.allowAp,
      objectives: ex.objectives,
      standards: ex.standards,
      briefing: ex.briefing,
      ...(ex.plate && ap ? { plate: ex.plate, plateName: `${ap.airport} ${ap.name}` } : {}),
      ...(run.rt.clearance ? { clearance: run.rt.clearance } : {}),
      ...(run.rt.quiz ? { quiz: { question: run.rt.quiz.question, options: run.rt.quiz.options, answer: run.rt.quiz.answer, explain: run.rt.quiz.explain } } : {}),
      ...(run.rt.hold ? { hold: { inbound: run.rt.hold.inbound, turn: run.rt.hold.turn, fix: run.rt.hold.fix.ident, legMin: run.rt.hold.legMin, altFt: run.rt.hold.altFt } } : {}),
      steps: run.rt.steps.map((x) => x.text),
      setup: briefSetup(run),
    };
    void import('../course/ui/briefingDeck')
      .then((m) => {
        if (seq !== this.deckSeq || !this.isOpen) return;
        const deck = m.briefingDeck(src, fr ? 'fr' : 'en');
        const d = m.briefingStage(deck, {
          lang: fr ? 'fr' : 'en',
          // the plate slide: the approach plate drawn by the chart engine, as an image
          assetUrl: (id: string) => {
            const a = id.startsWith('plate:') ? findApproach(id.slice(6)) : undefined;
            return a ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(approachPlate(a))}` : null;
          },
          onChange: () => this.renderBar(),
          onAnswered: () => {
            this.hint = '';
            this.renderBar();
          },
        });
        this.deck = d;
        this.stageHost.classList.remove('loading');
        d.mount(this.stageHost);
        this.renderBar();
      })
      .catch(() => {
        // the slide engine could not load (offline, an old cached build): the text briefing
        if (seq !== this.deckSeq || !this.isOpen) return;
        this.box.classList.add('bd-text');
        this.renderText();
      });
  }
  /** the bar under the slide: progress, Skip to summary, Cancel, Previous, Next / Start exercise */
  private renderBar() {
    const fr = this.fr;
    const d = this.deck;
    const restart = this.seed !== null;
    clear(this.foot);
    const segs = d ? d.segments((i) => { d.go(i, i < d.index ? Infinity : 0); this.renderBar(); }) : h('div', { class: 'ds-segs' });
    const last = !!d && d.atEnd;
    const needQuiz = !!d && !d.gatesDone;
    const ex = this.run?.ex;
    const items: (HTMLElement | null)[] = [
      h('div', { class: 'bd-prog' }, segs, d ? h('span', { class: 'bd-n num' }, `${d.index + 1} / ${d.count}`) : null),
      d && !last ? h('button', { class: 'btn link bd-skip', type: 'button', title: fr ? 'Aller au dernier écran, puis Démarrer l’exercice' : 'Go to the last screen, then Start exercise', onclick: () => { d.go(d.count - 1); this.renderBar(); } }, fr ? 'Passer le briefing ›' : 'Skip briefing ›') : null,
      this.hint
        ? h('span', { class: 'bd-hint', role: 'status' }, this.hint)
        : last && needQuiz && d
          ? h('button', { class: 'btn link bd-hint bd-gate', type: 'button', onclick: () => { d.go(d.pendingGate); this.renderBar(); } }, fr ? `Répondez à la question (diapo ${d.pendingGate + 1}) pour commencer` : `Answer the question (slide ${d.pendingGate + 1}) to start`)
          : h('span', { class: 'bd-sp' }),
      ex?.plate ? h('button', { class: 'btn ghost bd-plate', type: 'button', onclick: () => this.onPlate(ex.plate!), title: fr ? 'Ouvrir la carte d’approche dans le visualiseur' : 'Open the approach plate in the chart viewer' }, fr ? 'Carte' : 'Plate') : null,
      h('button', { class: 'btn ghost bd-cancel', type: 'button', onclick: () => this.close() }, restart ? (fr ? 'Continuer le vol' : 'Keep flying') : fr ? 'Annuler' : 'Cancel'),
      h('button', { class: 'btn bd-prev', type: 'button', disabled: !d || (d.index === 0), onclick: () => { if (d?.prev()) this.renderBar(); } }, '‹ ', fr ? 'Précédent' : 'Previous'),
      last
        ? h(
            'button',
            {
              class: 'btn primary bd-start',
              type: 'button',
              disabled: needQuiz,
              title: needQuiz ? (fr ? 'Répondez à la question pour commencer' : 'Answer the knowledge check to start') : '',
              onclick: () => this.start(),
            },
            restart ? (fr ? 'Recommencer l’exercice' : 'Restart exercise') : fr ? 'Démarrer l’exercice' : 'Start exercise',
            ' ›',
          )
        : h('button', { class: 'btn primary bd-next', type: 'button', disabled: !d, onclick: () => this.next() }, fr ? 'Suivant' : 'Next', ' ›'),
    ];
    this.foot.append(...items.filter((x): x is HTMLElement => !!x));
  }
  /** the text briefing (fallback when the slide engine cannot load) */
  private renderText() {
    const run = this.run!;
    const ex = run.ex;
    clear(this.body);
    clear(this.foot);
    setModalTitle(this, tr('br.title'));
    const stage = STAGES.find((s) => s.id === ex.stage);
    if (this.aside) this.body.append(this.aside);
    this.body.append(
      h('div', { class: 'section-t brief-kicker' }, stage?.title ?? ''),
      h('h2', { class: 'brief-title' }, ex.title),
      h('p', { class: 'brief-sum' }, ex.summary),
    );
    if (run.rt.clearance) this.body.append(h('div', { class: 'atc' }, h('b', {}, tr('br.clearance')), h('span', {}, `“${run.rt.clearance}”`)));
    this.body.append(
      h('div', { class: 'two' },
        h('div', {},
          h('div', { class: 'section-t' }, tr('br.objectives')), h('ul', { class: 'tips' }, ...ex.objectives.map((o) => h('li', {}, o))),
          h('div', { class: 'section-t' }, tr('br.standards')), h('ul', { class: 'tips' }, ...ex.standards.map((o) => h('li', {}, o))),
        ),
        h('div', {},
          h('div', { class: 'section-t' }, tr('br.briefing')), h('ul', { class: 'tips' }, ...ex.briefing.map((o) => h('li', {}, o))),
        ),
      ),
      h('section', { class: 'brief-steps' }, h('div', { class: 'section-t' }, tr('br.steps', { n: run.rt.steps.length })), h('ol', {}, ...run.rt.steps.map((s) => h('li', {}, s.text)))),
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
      this.body.append(h('div', { class: 'section-t' }, tr('br.quiz')), h('p', {}, q.question));
      const opts = h('div', { class: 'quiz-opts' });
      q.options.forEach((o, i) => {
        const cls = this.answered === null ? '' : i === q.answer ? 'right' : i === this.answered ? 'wrong' : '';
        opts.append(h('button', { class: `btn ${cls}`, disabled: this.answered !== null, onclick: () => { this.answered = i; this.renderText(); } }, o));
      });
      this.body.append(opts);
      if (this.answered !== null) {
        this.body.append(h('div', { class: `quiz-fb ${this.answered === q.answer ? 'ok' : 'ko'}` }, h('b', {}, this.answered === q.answer ? tr('br.right') : tr('br.wrong')), ' ', q.explain));
        if (q.svg) this.body.append(h('div', { class: 'diagram', html: q.svg }));
      }
    } else if (run.rt.hold) {
      this.body.append(h('div', { class: 'diagram', html: holdDiagramSvg(run.rt.hold.inbound, run.rt.hold.turn, run.rt.hold.fix.ident) }));
    }
    const needQuiz = !!q && this.answered === null;
    const restart = this.seed !== null;
    this.foot.append(
      h('span', { class: 'muted', style: 'flex:1;align-self:center;font-size:12.5px' }, needQuiz ? tr('br.quizFirst') : restart ? tr('br.restartHint') : tr('br.pausedHint')),
      h('button', { class: 'btn', onclick: () => this.close() }, restart ? tr('br.keepFlying') : tr('br.cancel')),
      h('button', { class: 'btn primary', disabled: needQuiz, onclick: () => this.start() }, restart ? tr('br.restart') : tr('br.start')),
    );
  }
}

// ----------------------------------------------------------------- result
/** a result with a score (an exercise ended early is not graded; results saved before the field existed are) */
export const isGraded = (r: LessonResult) => r.graded !== false && r.score !== null;
/** the step was flown, at least in part (the steps after the one the exercise stopped on were never reached) */
const stepReached = (run: LessonRun, i: number) => run.finished?.steps[i]?.done || i <= run.idx;

/** options of the result window (main.ts): a course flight offers "Back to the course" as the primary action */
export interface LessonResultOptions {
  backToCourse?: { label: string; title?: string; run: () => void | Promise<void> };
}
export class LessonResultModal extends Modal {
  /** the training record the last show() saved (null: too short to keep) */
  recordId: string | null = null;
  constructor(private onRetry: (ex: Exercise) => void, private onNext: (ex: Exercise) => void, private onDebrief: () => void) {
    super('Exercise result', 'md');
  }
  /** open, with "Back to the course" as the one primary action when the flight came from a course (isolated) */
  private openWith(opts: LessonResultOptions) {
    const b = opts.backToCourse;
    if (b) {
      this.foot.querySelectorAll('.btn.primary').forEach((x) => x.classList.remove('primary'));
      const go: HTMLButtonElement = h('button', { class: 'btn primary res-course', title: b.title ?? b.label, onclick: () => {
        go.disabled = true;
        void Promise.resolve(b.run()).catch(() => undefined).finally(() => { go.disabled = false; });
      } }, svgIcon(I.arrow, 15), h('span', {}, b.label));
      this.foot.append(go);
    }
    this.open();
  }
  show(run: LessonRun, path: Path | null, opts: LessonResultOptions = {}) {
    const r = run.finished!;
    const graded = isGraded(r);
    // a graded attempt counts in the progress (attempts, best score); an exercise ended early does not
    progress.record(run.ex.id, r);
    // the flight goes into the training records: with the exercise and its score, or marked not graded
    run.sim.rec.lesson = graded ? { id: run.ex.id, title: run.ex.title, score: r.score!, passed: r.passed } : { id: run.ex.id, title: run.ex.title };
    const rec = saveFlightRecord(run.sim);
    this.recordId = rec?.id ?? null;
    if (rec && !graded) history.upsert({ ...rec, graded: false });
    clear(this.body);
    clear(this.foot);
    setModalTitle(this, tr('lr.title'));
    const flown = r.steps.filter((_, i) => stepReached(run, i)).length;
    this.body.append(
      graded
        ? h('div', { class: 'grade-row' },
            h('div', { class: `grade ${r.passed ? 'A' : 'F'}` }, r.passed ? '✓' : '✗', h('small', {}, `${r.score}/100`)),
            h('div', {}, h('h2', { style: 'margin:0 0 4px' }, `${r.passed ? tr('lr.passed') : tr('lr.notYet')} — ${run.ex.title}`), h('p', { class: 'muted' }, `${r.reason} · ${fmtTime(r.durationSec)}`)),
          )
        : h('div', { class: 'grade-row' },
            h('div', { class: 'grade none', 'aria-label': tr('lr.notGraded') }, '—', h('small', {}, tr('lr.notGraded'))),
            h('div', {},
              h('h2', { style: 'margin:0 0 4px' }, `${tr('lr.endedEarly')} — ${run.ex.title}`),
              h('p', { class: 'muted' }, tr('lr.earlyText', { n: flown, m: r.steps.length, t: fmtTime(r.durationSec) })),
            ),
          ),
      h('table', { class: 'items res-steps' },
        h('tr', {}, h('th', {}, tr('lr.step')), h('th', {}, tr('lr.done')), h('th', { class: 'num' }, tr('lr.outTol')), h('th', {}, tr('lr.firstDev'))),
        ...r.steps.map((s, i) => {
          const reached = stepReached(run, i);
          const sec = Math.round(s.violationSec);
          // green "0 s" only for a step flown to the end within tolerance; "—" for a step never reached
          const pen = !reached ? h('td', { class: 'num na' }, '—') : h('td', { class: `pen${sec < 1 ? (s.done ? ' zero' : ' na') : ''}` }, s.violationSec <= 0 ? '0 s' : sec < 1 ? '<1 s' : `${sec} s`);
          return h('tr', {}, h('td', {}, s.text), h('td', { class: s.done ? 'done' : 'na' }, s.done ? svgIcon(I.check, 15) : reached ? tr('lr.notCompleted') : tr('lr.notFlown')), pen, h('td', { class: 'muted' }, s.worst ?? ''));
        })),
    );
    if (!graded) {
      this.foot.append(
        h('button', { class: 'btn', onclick: () => { this.close(); this.onDebrief(); } }, tr('lr.debrief')),
        h('span', { style: 'flex:1' }),
        h('button', { class: 'btn', onclick: () => this.close() }, tr('lr.close')),
        h('button', { class: 'btn primary', onclick: () => { this.close(); this.onRetry(run.ex); } }, tr('lr.retry')),
      );
      this.openWith(opts);
      return;
    }
    if (r.holdReport) this.body.append(h('div', { class: 'section-t' }, tr('lr.holding')), h('table', { class: 'items acs-table' }, ...r.holdReport.map((i) => h('tr', { class: i.ok === null ? 'N/A' : i.ok ? 'PASS' : 'FAIL' }, h('td', {}, i.ok === null ? '—' : i.ok ? 'PASS' : 'FAIL'), h('td', {}, i.label), h('td', {}, i.value)))));
    if (run.rt.hold && run.holdEval?.correctEntry) this.body.append(h('div', { class: 'diagram', html: holdDiagramSvg(run.rt.hold.inbound, run.rt.hold.turn, run.rt.hold.fix.ident, run.holdEval.arrivalCourse) }));
    if (r.acs) this.body.append(h('div', { class: 'section-t' }, `ACS — ${r.acs.result}`), h('table', { class: 'items acs-table' }, ...r.acs.items.map((i) => h('tr', { class: i.result }, h('td', {}, i.result), h('td', {}, i.task), h('td', { class: 'muted' }, i.standard), h('td', {}, i.actual)))));
    const idx = path ? path.exercises.indexOf(run.ex.id) : -1;
    const nextId = path && idx >= 0 ? path.exercises[idx + 1] : EXERCISES[EXERCISES.findIndex((e) => e.id === run.ex.id) + 1]?.id;
    this.foot.append(
      h('button', { class: 'btn', onclick: () => { this.close(); this.onDebrief(); } }, tr('lr.debrief')),
      h('span', { style: 'flex:1' }),
      // the primary action sits on the right: Next exercise after a pass, Retry after a fail
      ...(() => {
        const retry = h('button', { class: `btn${r.passed ? '' : ' primary'}`, onclick: () => { this.close(); this.onRetry(run.ex); } }, tr('lr.retry'));
        const next = nextId ? h('button', { class: `btn${r.passed ? ' primary' : ''}`, onclick: () => { this.close(); this.onNext(exercise(nextId)); } }, tr('lr.next')) : null;
        return next ? (r.passed ? [retry, next] : [next, retry]) : [retry];
      })(),
    );
    this.openWith(opts);
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
