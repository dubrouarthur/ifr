// Instructor operating station: failures, reposition, freeze, weather and a live ACS monitor.
import { h, clear, fmtTime } from './dom';
import { svgIcon, I } from './icons';
import { FAILURE_LABELS, type Failures, type Sim } from '../sim/sim';
import { WX_PRESETS, Modal } from './modals';
import { confirmAction } from './confirm';
import { evaluateAcs, computeDebrief } from '../sim/recorder';
import { FAILURE_GROUPS, FAILURE_LABELS_EN, FAILURE_LABELS_FR, type FailureKey } from '../sim/systemsTypes';
import type { ProcedureController } from './procedurePanel';
import { lang, onLangChange, registerStrings, t } from './i18n';

registerStrings('en', {
  'ios.fail.head': 'Failures',
  'ios.fail.hint': 'Tap a system, choose the procedure you expect, then Fire now. Tap a failed system to restore it.',
  'ios.g.engine': 'Engine & fuel',
  'ios.g.electrical': 'Electrical',
  'ios.g.instruments': 'Flight instruments',
  'ios.g.avionics': 'Avionics & radio',
  'ios.g.other': 'Other',
  'ios.fire': 'Fire now',
  'ios.cancel': 'Cancel',
  'ios.expect': 'Expected procedure',
  'ios.auto': 'Automatic: {p}',
  'ios.autoNone': 'Automatic (no procedure answers it)',
  'ios.noProc': 'None: do not grade',
  'ios.club': 'club',
  'ios.restore': 'Restore all',
  'ios.restored': 'Restored: {f}',
  'ios.failed': 'Failed: {f}',
  'ios.proc.head': 'Procedures',
  'ios.proc.grade': 'Grade procedures',
  'ios.proc.gradeHint': 'Failures you fire start their procedure and are graded (debrief and training records).',
  'ios.proc.gradeOff': 'Failures you fire are not graded. Drills always are.',
  'ios.proc.training': 'Training',
  'ios.proc.test': 'Test',
  'ios.proc.modeHint.training': 'Training: the student sees the emergency card.',
  'ios.proc.modeHint.test': 'Test: only a Checklist button, results at the end.',
  'ios.proc.drillMode': 'This drill is flown in {m} mode.',
  'ios.proc.pending': 'Waiting for you',
  'ios.proc.none': 'No procedure running. Fire a failure below.',
  'ios.proc.confirm': 'Heard it',
  'ios.proc.confirmTip': 'Confirm a callout the student made (Done item)',
  'ios.proc.done': '{d} of {n} done',
  'ios.proc.late': 'late',
  'ios.proc.finished': 'Finished',
  'ios.proc.checklist': 'checklist',
  'ios.proc.memoryPhase': 'memory items',
  'ios.title': 'Instructor station',
  'ios.close': 'Close',
  'ios.pair.title': 'Instructor on a phone or tablet',
  'ios.pair.on': 'Connected: {d}',
  'ios.pair.console': 'instructor console',
  'ios.pair.wait': 'Waiting for the instructor to scan the code',
  'ios.pair.hint': 'Scan a code to run failures, weather and vectors remotely',
  'ios.pair.show': 'Show pairing',
  'ios.pair.go': 'Pair a phone or tablet',
  'ios.pair.err': 'Could not open instructor pairing',
  'ios.pair.conn': 'Instructor connected: {d}',
  'ios.pair.device': 'phone or tablet',
  'ios.pair.lost': 'Instructor console disconnected',
  'ios.rep.head': 'Reposition (loaded approach)',
  'ios.rep.final10': '10 NM final',
  'ios.rep.final5': '5 NM final',
  'ios.rep.runway': 'On runway',
  'ios.rep.done': 'Repositioned: {p}',
  'ios.rep.none': 'Load an approach first',
  'ios.sim.head': 'Simulation',
  'ios.sim.freeze': 'Freeze / run',
  'ios.sim.frozen': 'Frozen',
  'ios.sim.running': 'Running',
  'ios.sim.qnh': 'New altimeter',
  'ios.sim.vector': 'ATC vector',
  'ios.sim.vectorToast': 'ATC: "turn heading {h}" (bug preset — student must fly it)',
  'ios.wx.head': 'Weather',
  'ios.traps.head': 'Avionics traps',
  'ios.traps.cdi': 'CDI left on GPS',
  'ios.traps.lpv': 'LPV → LNAV downgrade',
  'ios.on': 'on',
  'ios.off': 'off',
  'ios.train.head': 'Training',
  'ios.train.builder': 'Plan a flight',
  'ios.foot': 'All instructor actions are time-stamped in the flight record and appear in the debrief timeline.',
  'ios.st.student': 'Student',
  'ios.st.mode': 'Mode',
  'ios.st.checkride': 'Checkride',
  'ios.st.training': 'Training',
  'ios.st.time': 'Time',
  'ios.st.phase': 'Phase',
  'ios.st.lat': 'LAT dev',
  'ios.st.vert': 'VERT dev',
  'ios.st.dots': '{v} dots',
  'ios.st.visual': 'Visual',
  'ios.st.yes': 'yes',
  'ios.st.imc': 'no (IMC)',
  'ios.st.incomplete': 'Incomplete',
  'ios.st.score': 'Score {s} · {g}',
  'ios.st.notGraded': 'Not graded yet',
  'hist.title': 'Training records',
  'hist.all': 'All students',
  'hist.student': 'Student',
  'hist.flights': 'Flights',
  'hist.rides': 'Checkrides passed',
  'hist.avg': 'Average score',
  'hist.empty': 'No flights recorded yet',
  'hist.emptyHint': 'Every debrief of a flight longer than 30 seconds, and every exercise attempt, is saved here automatically (in this browser).',
  'hist.c.date': 'Date',
  'hist.c.flight': 'Flight',
  'hist.c.mode': 'Mode',
  'hist.c.score': 'Score',
  'hist.c.failed': 'Failed tasks',
  'hist.exPass': 'Exercise · passed',
  'hist.exFail': 'Exercise · not passed',
  'hist.pass': 'pass',
  'hist.fail': 'fail',
  'hist.clearAsk': 'Delete all training records stored in this browser?',
  'hist.clear': 'Clear records',
  'hist.clearBody': 'Every flight, score and exercise result in the training records is deleted. Export a CSV first to keep a copy.',
  'hist.csv': 'Export CSV',
});
registerStrings('fr', {
  'ios.fail.head': 'Pannes',
  'ios.fail.hint': 'Touchez un système, choisissez la procédure attendue, puis Déclencher. Touchez un système en panne pour le rétablir.',
  'ios.g.engine': 'Moteur et carburant',
  'ios.g.electrical': 'Électricité',
  'ios.g.instruments': 'Instruments de vol',
  'ios.g.avionics': 'Avionique et radio',
  'ios.g.other': 'Autres',
  'ios.fire': 'Déclencher',
  'ios.cancel': 'Annuler',
  'ios.expect': 'Procédure attendue',
  'ios.auto': 'Automatique : {p}',
  'ios.autoNone': 'Automatique (aucune procédure)',
  'ios.noProc': 'Aucune : ne pas évaluer',
  'ios.club': 'club',
  'ios.restore': 'Tout rétablir',
  'ios.restored': 'Rétabli : {f}',
  'ios.failed': 'En panne : {f}',
  'ios.proc.head': 'Procédures',
  'ios.proc.grade': 'Évaluer les procédures',
  'ios.proc.gradeHint': 'Les pannes déclenchées lancent leur procédure et sont évaluées (débriefing et carnet de progression).',
  'ios.proc.gradeOff': 'Les pannes déclenchées ne sont pas évaluées. Les exercices de panne le sont toujours.',
  'ios.proc.training': 'Entraînement',
  'ios.proc.test': 'Test',
  'ios.proc.modeHint.training': 'Entraînement : l’élève voit la carte d’urgence.',
  'ios.proc.modeHint.test': 'Test : un simple bouton Check-list, résultat à la fin.',
  'ios.proc.drillMode': 'Cet exercice se vole en mode {m}.',
  'ios.proc.pending': 'En attente de vous',
  'ios.proc.none': 'Aucune procédure en cours. Déclenchez une panne ci-dessous.',
  'ios.proc.confirm': 'Entendu',
  'ios.proc.confirmTip': 'Confirmer une annonce faite par l’élève (action « Fait »)',
  'ios.proc.done': '{d} sur {n} faites',
  'ios.proc.late': 'en retard',
  'ios.proc.finished': 'Terminée',
  'ios.proc.checklist': 'check-list',
  'ios.proc.memoryPhase': 'actions réflexes',
  'ios.title': 'Poste instructeur',
  'ios.close': 'Fermer',
  'ios.pair.title': 'Instructeur sur téléphone ou tablette',
  'ios.pair.on': 'Connecté : {d}',
  'ios.pair.console': 'console instructeur',
  'ios.pair.wait': 'En attente du scan du code par l’instructeur',
  'ios.pair.hint': 'Scannez un code pour piloter pannes, météo et guidages à distance',
  'ios.pair.show': 'Afficher le code',
  'ios.pair.go': 'Associer un téléphone ou une tablette',
  'ios.pair.err': 'Impossible d’ouvrir l’association instructeur',
  'ios.pair.conn': 'Instructeur connecté : {d}',
  'ios.pair.device': 'téléphone ou tablette',
  'ios.pair.lost': 'Console instructeur déconnectée',
  'ios.rep.head': 'Repositionner (approche chargée)',
  'ios.rep.final10': 'Finale 10 NM',
  'ios.rep.final5': 'Finale 5 NM',
  'ios.rep.runway': 'Sur la piste',
  'ios.rep.done': 'Repositionné : {p}',
  'ios.rep.none': 'Chargez d’abord une approche',
  'ios.sim.head': 'Simulation',
  'ios.sim.freeze': 'Figer / reprendre',
  'ios.sim.frozen': 'Figé',
  'ios.sim.running': 'En cours',
  'ios.sim.qnh': 'Nouveau calage',
  'ios.sim.vector': 'Guidage ATC',
  'ios.sim.vectorToast': 'ATC : « cap {h} » (index préréglé — l’élève doit le suivre)',
  'ios.wx.head': 'Météo',
  'ios.traps.head': 'Pièges avionique',
  'ios.traps.cdi': 'CDI laissé sur GPS',
  'ios.traps.lpv': 'Dégradation LPV → LNAV',
  'ios.on': 'activé',
  'ios.off': 'désactivé',
  'ios.train.head': 'Formation',
  'ios.train.builder': 'Ouvrir le constructeur de vol',
  'ios.foot': 'Chaque action de l’instructeur est horodatée dans l’enregistrement du vol et apparaît dans le débriefing.',
  'ios.st.student': 'Élève',
  'ios.st.mode': 'Mode',
  'ios.st.checkride': 'Test en vol',
  'ios.st.training': 'Entraînement',
  'ios.st.time': 'Temps',
  'ios.st.phase': 'Phase',
  'ios.st.lat': 'Écart LAT',
  'ios.st.vert': 'Écart VERT',
  'ios.st.dots': '{v} points',
  'ios.st.visual': 'Visuel',
  'ios.st.yes': 'oui',
  'ios.st.imc': 'non (IMC)',
  'ios.st.incomplete': 'Incomplet',
  'ios.st.score': 'Note {s} · {g}',
  'ios.st.notGraded': 'Pas encore évalué',
  'hist.title': 'Carnet de progression',
  'hist.all': 'Tous les élèves',
  'hist.student': 'Élève',
  'hist.flights': 'Vols',
  'hist.rides': 'Tests en vol réussis',
  'hist.avg': 'Note moyenne',
  'hist.empty': 'Aucun vol enregistré',
  'hist.emptyHint': 'Chaque débriefing d’un vol de plus de 30 secondes et chaque tentative d’exercice sont enregistrés ici automatiquement (dans ce navigateur).',
  'hist.c.date': 'Date',
  'hist.c.flight': 'Vol',
  'hist.c.mode': 'Mode',
  'hist.c.score': 'Note',
  'hist.c.failed': 'Tâches échouées',
  'hist.exPass': 'Exercice · réussi',
  'hist.exFail': 'Exercice · non réussi',
  'hist.pass': 'réussi',
  'hist.fail': 'échec',
  'hist.clearAsk': 'Supprimer tous les enregistrements de formation de ce navigateur ?',
  'hist.clear': 'Effacer le carnet',
  'hist.clearBody': 'Tous les vols, notes et résultats d’exercices du carnet sont supprimés. Exportez d’abord un CSV pour en garder une copie.',
  'hist.csv': 'Exporter en CSV',
});
const fName = (k: FailureKey) => (lang() === 'fr' ? FAILURE_LABELS_FR : FAILURE_LABELS_EN)[k] ?? k;
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

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
  /** procedures mode (set by the shell): grading toggle, expected procedure, live progress, callout confirmation */
  procs?: ProcedureController;
  /** the failure being armed (its 'Expected procedure' picker is open) */
  private arming: FailureKey | null = null;
  private procEl = h('div', { class: 'ios-procs' });
  private procSig = '';
  private procTimes: (() => void)[] = [];
  private procAcc = 0;
  constructor(private sim: Sim, private toast: (m: string, k?: 'info' | 'good' | 'warn' | 'bad') => void) {
    this.body = h('div', { class: 'ios-body' });
    this.live = h('div', { class: 'ios-live' });
    const title = h('h3', {}, t('ios.title'));
    const x = h('button', { class: 'x', onclick: () => this.toggle(false), title: `${t('ios.close')} (I)`, 'aria-label': t('ios.close') }, '×');
    this.el = h('aside', { class: 'drawer left ios', 'aria-label': t('ios.title') },
      h('header', {}, title, x),
      h('div', { class: 'ios-scroll' }, this.pairRow, this.procEl, this.live, this.body),
    );
    this.render();
    this.renderPair();
    // a language change redraws the drawer in the new language
    onLangChange(() => {
      title.textContent = t('ios.title');
      this.el.setAttribute('aria-label', t('ios.title'));
      x.title = `${t('ios.close')} (I)`;
      x.setAttribute('aria-label', t('ios.close'));
      this.renderPair();
      if (this.isOpen) this.render();
    });
    window.addEventListener('ifr-remote-status', (e: Event) => {
      const d = (e as CustomEvent<{ state: string; device?: string; code?: string }>).detail;
      if (!d) return;
      const was = this.remote.state;
      this.remote = d;
      if (d.state === 'connected' && was !== 'connected') this.toast(t('ios.pair.conn', { d: d.device ?? t('ios.pair.device') }), 'good');
      else if (was === 'connected' && d.state !== 'connected') this.toast(t('ios.pair.lost'), 'info');
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
        h('b', {}, t('ios.pair.title')),
        h('small', {}, on ? t('ios.pair.on', { d: r.device ?? t('ios.pair.console') }) : live ? t('ios.pair.wait') : t('ios.pair.hint')),
      ),
      h('button', { class: `btn${live ? '' : ' primary'}`, type: 'button', onclick: () => this.pair() }, svgIcon(I.tablet, 16), on || live ? t('ios.pair.show') : t('ios.pair.go')),
    );
  }
  private pair() {
    if (this.onPair) { this.onPair(); return; }
    const api = (window as unknown as { __ifr?: { remote?: unknown } }).__ifr?.remote;
    import('./remotePair')
      .then((m) => m.openRemotePair((api as Parameters<typeof m.openRemotePair>[0] | undefined) ?? this.sim))
      .catch(() => this.toast(t('ios.pair.err'), 'bad'));
  }
  get isOpen() {
    return this.el.classList.contains('open');
  }
  toggle(o?: boolean) {
    const open = o ?? !this.isOpen;
    this.el.classList.toggle('open', open);
    if (open) this.render();
    // the student's emergency card moves out from under the drawer while it is open (procedure-panel.css)
    const right = this.el.offsetLeft + this.el.offsetWidth / 2 > window.innerWidth / 2;
    document.body.classList.toggle('ios-open', open && right);
    document.body.style.setProperty('--ios-w', `${this.el.offsetWidth}px`);
  }
  render() {
    clear(this.body);
    const sim = this.sim;
    const sec = (t: string) => h('div', { class: 'section-t' }, t);
    this.procSig = '';
    this.renderProcs();
    // failures, grouped like the aircraft's systems; firing one asks which procedure is expected
    this.body.append(h('div', { class: 'section-t ios-sec-row' }, t('ios.fail.head'), Object.values(sim.failures).some(Boolean) ? h('button', { class: 'btn link quiet ios-restore', type: 'button', onclick: () => { (Object.keys(FAILURE_LABELS) as (keyof Failures)[]).forEach((k) => sim.setFailure(k, false)); this.arming = null; this.render(); } }, t('ios.restore')) : null));
    this.body.append(h('p', { class: 'ios-hint' }, t('ios.fail.hint')));
    for (const g of FAILURE_GROUPS) {
      const grid = h('div', { class: 'ios-grid' });
      let armRow: HTMLElement | null = null;
      for (const k of g.keys) {
        const on = !!sim.failures[k];
        grid.append(h('button', {
          class: `ios-toggle${on ? ' on' : ''}${this.arming === k ? ' armed' : ''}`,
          type: 'button',
          'aria-pressed': String(on),
          'aria-expanded': on ? undefined : String(this.arming === k),
          onclick: () => {
            if (on) {
              sim.setFailure(k, false);
              this.toast(t('ios.restored', { f: fName(k) }), 'good');
              this.arming = null;
            } else this.arming = this.arming === k ? null : k;
            this.render();
          },
        }, h('i', {}), fName(k)));
        if (this.arming === k && !on) armRow = this.armRow(k);
      }
      this.body.append(h('div', { class: 'ios-fgroup' }, h('h6', {}, t(`ios.g.${g.id}`)), grid, armRow));
    }

    this.body.append(sec(t('ios.rep.head')));
    const rep = (k: 'iaf' | 'if' | 'final10' | 'final5' | 'runway', l: string) =>
      h('button', { class: 'btn', onclick: () => { if (sim.reposition(k)) this.toast(t('ios.rep.done', { p: l }), 'good'); else this.toast(t('ios.rep.none'), 'warn'); } }, l);
    this.body.append(h('div', { class: 'ios-row' }, rep('iaf', 'IAF'), rep('if', 'IF'), rep('final10', t('ios.rep.final10')), rep('final5', t('ios.rep.final5')), rep('runway', t('ios.rep.runway'))));

    this.body.append(sec(t('ios.sim.head')));
    this.body.append(h('div', { class: 'ios-row' },
      h('button', { class: 'btn', onclick: () => { sim.paused = !sim.paused; this.toast(sim.paused ? t('ios.sim.frozen') : t('ios.sim.running')); } }, t('ios.sim.freeze')),
      h('button', { class: 'btn', onclick: () => { sim.weather.qnh = Math.round((29.92 + (Math.random() - 0.5) * 1.2) * 100) / 100; sim.rec.log(sim.time, 'info', `ATC: altimeter ${sim.weather.qnh.toFixed(2)}`); this.toast(`ATC: "altimeter ${sim.weather.qnh.toFixed(2)}"`, 'info'); } }, t('ios.sim.qnh')),
      h('button', { class: 'btn', onclick: () => { sim.ap.hdgBug = Math.round(Math.random() * 35) * 10 || 360; this.toast(t('ios.sim.vectorToast', { h: String(sim.ap.hdgBug).padStart(3, '0') })); } }, t('ios.sim.vector')),
    ));
    this.body.append(sec(t('ios.wx.head')));
    this.body.append(h('div', { class: 'ios-row' }, ...WX_PRESETS.slice(1).map((w) => h('button', { class: 'btn', onclick: () => { Object.assign(sim.weather, w.wx); sim.rec.log(sim.time, 'info', `Weather: ${w.name}`); this.toast(`Weather → ${w.name}`); } }, w.name))));
    this.body.append(sec(t('ios.traps.head')));
    const trap = (label: string, on: () => boolean, set: (v: boolean) => void, log: string) => {
      const b = h('button', { class: 'btn', 'aria-pressed': String(on()) }, label);
      b.onclick = () => { set(!on()); b.setAttribute('aria-pressed', String(on())); b.classList.toggle('on', on()); sim.rec.log(sim.time, 'info', `Instructor: ${log} ${on() ? 'on' : 'off'}`); this.toast(`${label}: ${on() ? t('ios.on') : t('ios.off')}`); };
      b.classList.toggle('on', on());
      return b;
    };
    this.body.append(h('div', { class: 'ios-row' },
      trap(t('ios.traps.cdi'), () => !sim.autoCdi, (v) => (sim.autoCdi = !v), 'automatic GPS→LOC CDI switch disabled'),
      trap(t('ios.traps.lpv'), () => !!sim.fp.downgrade, (v) => (sim.fp.downgrade = v), 'RNAV approach downgrade'),
    ));
    this.body.append(sec(t('ios.train.head')));
    this.body.append(h('button', { class: 'btn ios-builder', onclick: () => { this.toggle(false); this.onBuilder?.(); } }, svgIcon(I.tools, 16), t('ios.train.builder')));
    this.body.append(h('p', { class: 'muted ios-foot' }, t('ios.foot')));
  }
  /** a procedure test is running (or would start): failures are not announced to the student */
  private quiet(expect?: string): boolean {
    const pc = this.procs;
    if (!pc || expect === '-') return false;
    return pc.modeNow() === 'test' && (pc.drillMode() !== null || pc.grade || !!expect || this.sim.assess.mode === 'checkride');
  }
  /** 'Fire now' with the expected procedure picker, under the failure tile being armed */
  private armRow(k: FailureKey): HTMLElement {
    const pc = this.procs;
    const choices = pc?.choices(k) ?? [];
    const auto = pc?.autoPick(k) ?? null;
    const sel = h('select', { class: 'ios-expect', 'aria-label': t('ios.expect') },
      h('option', { value: '' }, auto ? t('ios.auto', { p: auto.title }) : t('ios.autoNone')),
      ...choices.map((c) => h('option', { value: c.id }, `${c.title}${c.club ? ` · ${t('ios.club')}` : ''}${c.lang !== lang() ? ` (${c.lang.toUpperCase()})` : ''}`)),
      pc ? h('option', { value: '-' }, t('ios.noProc')) : null,
    ) as HTMLSelectElement;
    const fire = () => {
      const v = sel.value;
      // 'automatic' follows the Grade procedures toggle; naming a procedure grades it whatever the toggle; '-' never
      if (pc) pc.fire(k, v || undefined);
      else this.sim.setFailure(k, true);
      // a test: the student diagnoses the failure — no toast names it on the shared screen
      if (!this.quiet(v)) this.toast(t('ios.failed', { f: fName(k) }), 'warn');
      this.arming = null;
      this.render();
    };
    return h('div', { class: 'ios-arm' },
      pc ? h('label', { class: 'field' }, h('b', {}, t('ios.expect')), sel) : null,
      h('div', { class: 'ios-arm-acts' },
        h('button', { class: 'btn', type: 'button', onclick: () => { this.arming = null; this.render(); } }, t('ios.cancel')),
        h('button', { class: 'btn danger-solid ios-fire', type: 'button', onclick: fire }, svgIcon(I.warning, 15), t('ios.fire')),
      ),
    );
  }

  /** procedures: the grading toggle and its mode, drill failures waiting for the instructor, live progress */
  private renderProcs() {
    const pc = this.procs;
    if (!pc) return;
    const states = pc.states();
    const pending = pc.pendingDrill();
    const drillMode = pc.drillMode();
    const sig = `${pc.version}|${pc.grade}|${pc.freeMode}|${drillMode}|${lang()}|${pending.map((p) => p.index).join(',')}|${states.map((s) => `${s.procedureId}:${s.finished}:${s.checklistOpen}:${s.items.map((i) => `${+i.done}${+i.late}`).join('')}`).join('|')}`;
    if (sig === this.procSig) {
      for (const f of this.procTimes) f();
      return;
    }
    this.procSig = sig;
    this.procTimes = [];
    clear(this.procEl);
    const seg = h('div', { class: 'seg ios-seg', role: 'radiogroup', 'aria-label': t('ios.proc.head') },
      ...(['training', 'test'] as const).map((m) => h('button', { type: 'button', role: 'radio', 'aria-checked': String(pc.freeMode === m), class: pc.freeMode === m ? 'on' : '', disabled: !pc.grade, onclick: () => { pc.setFreeMode(m); this.renderProcs(); } }, t(`ios.proc.${m}`))));
    const sw = h('button', { type: 'button', class: `ios-switch${pc.grade ? ' on' : ''}`, role: 'switch', 'aria-checked': String(pc.grade), onclick: () => { pc.setGrade(!pc.grade); this.renderProcs(); } }, h('i', { 'aria-hidden': 'true' }), t('ios.proc.grade'));
    this.procEl.append(
      h('div', { class: 'section-t' }, t('ios.proc.head')),
      h('div', { class: 'ios-grade' }, sw, seg),
      h('p', { class: 'ios-hint' }, pc.grade ? `${t('ios.proc.gradeHint')} ${t(`ios.proc.modeHint.${pc.freeMode}`)}` : t('ios.proc.gradeOff')),
    );
    if (drillMode) this.procEl.append(h('p', { class: 'ios-hint ios-drill' }, t('ios.proc.drillMode', { m: t(`ios.proc.${drillMode}`).toLowerCase() })));
    if (pending.length)
      this.procEl.append(
        h('div', { class: 'ios-pending' },
          h('h6', {}, t('ios.proc.pending')),
          ...pending.map((p) => h('div', { class: 'ios-pend' }, h('span', {}, fName(p.key)), h('button', { class: 'btn danger-solid', type: 'button', onclick: () => { if (pc.fireDrill(p.index) && !this.quiet()) this.toast(t('ios.failed', { f: fName(p.key) }), 'warn'); this.render(); } }, t('ios.fire')))),
        ),
      );
    if (!states.length) {
      this.procEl.append(h('p', { class: 'ios-empty' }, t('ios.proc.none')));
      return;
    }
    for (const st of [...states].reverse()) {
      const req = st.items.filter((i) => !i.optional);
      const d = req.filter((i) => i.done).length;
      const time = h('b', { class: 'ios-pt' }, mmss(st.elapsedS));
      if (!st.finished) this.procTimes.push(() => { const r = pc.states().find((x) => x.procedureId === st.procedureId && !x.finished); if (r) time.textContent = mmss(r.elapsedS); });
      this.procEl.append(
        h('div', { class: `ios-proc${st.finished ? ' fin' : ''}` },
          h('div', { class: 'ios-proc-h' },
            h('div', {}, h('b', {}, st.title), h('small', {}, [fName(st.failure), t(`ios.proc.${st.mode}`), st.finished ? t('ios.proc.finished') : st.checklistOpen || !st.items.some((i) => i.memory) ? t('ios.proc.checklist') : t('ios.proc.memoryPhase')].join(' · '))),
            time,
          ),
          h('div', { class: 'ios-proc-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': req.length, 'aria-valuenow': d, 'aria-label': t('ios.proc.done', { d, n: req.length }) }, h('i', { style: `width:${req.length ? Math.round((d / req.length) * 100) : 0}%` })),
          h('ol', { class: 'ios-items' },
            ...st.items.map((i) => h('li', { class: `${i.done ? 'done' : ''}${i.late ? ' late' : ''}${i.memory ? ' mem' : ''}${i.optional ? ' opt' : ''}` },
              h('span', { class: 'ios-ib', 'aria-hidden': 'true' }, i.done ? svgIcon(I.check, 13) : null),
              h('span', { class: 'ios-it' }, i.text, i.late && !i.done ? h('small', {}, ` · ${t('ios.proc.late')}`) : null),
              i.manual && !i.done && !st.finished ? h('button', { class: 'btn ios-heard', type: 'button', title: t('ios.proc.confirmTip'), onclick: () => { pc.confirm(i.id, 'instructor', st.procedureId); this.renderProcs(); } }, t('ios.proc.confirm')) : i.done && i.atS !== null && i.atS !== undefined ? h('small', { class: 'ios-at' }, `${Math.round(i.atS)} s`) : null,
            )),
          ),
        ),
      );
    }
  }

  update(dt: number) {
    if (!this.isOpen || Modal.anyOpen()) return;
    this.procAcc += dt;
    if (this.procAcc >= 0.25) {
      this.procAcc = 0;
      this.renderProcs();
    }
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
        h('div', {}, h('small', {}, t('ios.st.student')), h('b', {}, r.student || '—')),
        h('div', {}, h('small', {}, t('ios.st.mode')), h('b', {}, r.mode === 'checkride' ? t('ios.st.checkride') : t('ios.st.training'))),
        h('div', {}, h('small', {}, t('ios.st.time')), h('b', {}, fmtTime(sim.time))),
        h('div', {}, h('small', {}, t('ios.st.phase')), h('b', {}, r.phase(sim))),
        h('div', {}, h('small', {}, t('ios.st.lat')), h('b', { class: lat !== null && Math.abs(lat) > 1.5 ? 'bad' : '' }, lat === null ? '—' : t('ios.st.dots', { v: lat.toFixed(2) }))),
        h('div', {}, h('small', {}, t('ios.st.vert')), h('b', { class: vert !== null && Math.abs(vert) > 1.5 ? 'bad' : '' }, vert === null ? '—' : t('ios.st.dots', { v: vert.toFixed(2) }))),
        h('div', {}, h('small', {}, 'IAS / ALT'), h('b', {}, `${Math.round(sim.ac.data.iasKt)} kt / ${Math.round(sim.indicatedAlt())} ft`)),
        h('div', {}, h('small', {}, t('ios.st.visual')), h('b', {}, sim.hasVisual() ? t('ios.st.yes') : t('ios.st.imc'))),
      ),
      h('div', { class: `ios-verdict ${acs.result}` }, `ACS: ${acs.result === 'INCOMPLETE' ? t('ios.st.incomplete') : acs.result}`, h('span', {}, db.graded ? t('ios.st.score', { s: db.score, g: db.grade }) : t('ios.st.notGraded'))),
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
    super(t('hist.title'), 'md');
  }
  open() {
    // the title follows the language of the moment
    const h2 = this.box.querySelector('header h2');
    if (h2) h2.textContent = t('hist.title');
    this.box.setAttribute('aria-label', t('hist.title'));
    this.render();
    super.open();
  }
  render() {
    clear(this.body);
    clear(this.foot);
    const all = history.all();
    const students = [...new Set(all.map((a) => a.student || '—'))];
    const list = all.filter((a) => !this.filter || (a.student || '—') === this.filter);
    const sel = h('select', { onchange: (e: Event) => { this.filter = (e.target as HTMLSelectElement).value; this.render(); } }, h('option', { value: '' }, t('hist.all')), ...students.map((s) => h('option', { value: s, selected: s === this.filter }, s)));
    const passes = list.filter((a) => a.mode === 'checkride' && a.acs === 'PASS').length;
    const rides = list.filter((a) => a.mode === 'checkride').length;
    const scored = list.filter((a) => a.graded !== false);
    const pill = (k: string, v: string) => h('div', { class: 'hist-pill' }, h('small', {}, k), h('b', {}, v));
    this.body.append(
      h('div', { class: 'hist-bar' },
        h('label', { class: 'field' }, h('b', {}, t('hist.student')), sel),
        pill(t('hist.flights'), String(list.length)),
        pill(t('hist.rides'), rides ? `${passes} / ${rides}` : '—'),
        pill(t('hist.avg'), scored.length ? String(Math.round(scored.reduce((a, b) => a + b.score, 0) / scored.length)) : '—'),
      ),
    );
    const when = (d: string) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    if (!list.length)
      this.body.append(h('div', { class: 'hist-empty' }, svgIcon(I.records, 40), h('b', {}, t('hist.empty')), h('span', {}, t('hist.emptyHint'))));
    else
      this.body.append(
        h('table', { class: 'items hist' },
          h('tr', {}, ...[t('hist.c.date'), t('hist.student'), t('hist.c.flight'), t('hist.c.mode'), 'ACS', t('hist.c.score'), t('hist.c.failed')].map((c, i) => h('th', { class: i === 5 ? 'num' : '' }, c))),
          ...list.slice(0, 200).map((a) =>
            h('tr', {},
              h('td', { class: 'nowrap' }, when(a.date)),
              h('td', {}, a.student || '—'),
              h('td', {}, h('div', {}, a.exerciseTitle ?? a.scenario), a.exercise ? h('small', { class: 'muted' }, a.passed ? t('hist.exPass') : t('hist.exFail')) : a.approach ? h('small', { class: 'muted' }, a.approach) : null,
                // procedures mode: each graded procedure, its verdict and score (details in the CSV and the club page)
                a.procedures?.length ? h('div', { class: 'hist-procs' }, ...a.procedures.map((r) => h('span', { class: `hist-proc ${r.verdict}`, title: r.notes[0] ?? '' }, `${r.title} · ${r.verdict === 'PASS' ? t('hist.pass') : t('hist.fail')} ${r.score}`))) : null),
              h('td', {}, a.mode === 'checkride' ? t('ios.st.checkride') : t('ios.st.training')),
              h('td', { class: `acs ${a.acs}` }, a.acs === 'INCOMPLETE' ? t('ios.st.incomplete') : a.acs),
              h('td', { class: 'num' }, a.graded === false ? h('span', { class: 'muted' }, '—') : `${a.score} · ${a.grade}`),
              h('td', { class: 'muted' }, a.failedTasks.join(', ') || '—'),
            ),
          ),
        ),
      );
    this.foot.append(
      h('button', { class: 'btn link quiet', disabled: !all.length, onclick: async (e: Event) => { if (await confirmAction({ title: t('hist.clearAsk'), body: t('hist.clearBody'), confirmLabel: t('hist.clear'), cancelLabel: t('ios.cancel'), destructive: true, anchor: e.currentTarget as HTMLElement })) { history.clear(); this.render(); } } }, t('hist.clear')),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', disabled: !list.length, onclick: () => {
        const blob = new Blob([history.csv(list)], { type: 'text/csv' });
        const a = h('a', { href: URL.createObjectURL(blob), download: `ifr-training-records-${new Date().toISOString().slice(0, 10)}.csv` });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } }, t('hist.csv')),
    );
  }
}
