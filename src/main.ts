import './styles.css';
// per-area overrides (src/styles/*.css) — a separate module so they load AFTER the base stylesheet
// (Vite hoists import.meta.glob imports to the top of the module that contains them)
import './styles/load';
import { FlightPlan } from './nav/flightplan';
import { Sim, SCENARIOS, type Scenario } from './sim/sim';
import { InputManager, type ButtonAction } from './sim/input';
import { drawPfd, newPfdState, PFD_W, PFD_H, softkeyAt, PFD_SOFTKEYS } from './avionics/pfd';
import { drawMfd, newMfdState, MFD_W, MFD_H, MFD_SOFTKEYS } from './avionics/mfd';
import { drawOtw, inCloud } from './avionics/otw';
import type { Outside3D, TimeOfDay, Quality } from './avionics/outside3d';
import { drawSixPack, drawStack } from './avionics/steam';
import { drawAirlinerPfd, drawNd } from './avionics/airliner';
import { mfdRange } from './avionics/mfd';
import { fitCanvas } from './avionics/draw';
import { h, store, fmtTime } from './ui/dom';
import { knob, bkey } from './ui/knob';
import { svgIcon, I } from './ui/icons';
import { ChartsDrawer } from './ui/charts';
import { InstructorDrawer, HistoryModal } from './ui/instructor';
import { LearnModal, BriefingModal, LessonResultModal, HoldDrillModal } from './ui/learn';
import { FlightCenter } from './ui/flightcenter';
import { FlightSetup } from './ui/flightsetup';
import { SettingsModal } from './ui/settings';
import { WeatherStation } from './ui/weather';
import { ExplainOverlay, Tour } from './ui/explain';
import { ConnectModal } from './ui/connect';
import { CduPanel } from './ui/cduPanel';
import { AtcRadio } from './ui/atcRadio';
import { CircuitBuilder, decodeCircuit } from './ui/circuitBuilder';
import { circuitToExercise, type Circuit } from './train/circuits';
import { LessonRun, type Exercise } from './train/engine';
import { exercise, type Path } from './train/curriculum';
import type { AssessSettings } from './sim/sim';
import { Launcher, ProcModal, DirectModal, JoystickModal, DebriefModal, HelpModal, Modal, WX_PRESETS, type WxPreset } from './ui/modals';
import { distanceNm, wrap180 } from './nav/geo';
import { runway } from './nav/data';
import { assessTouchdown } from './sim/landing';
import { currentRegion, leaveRealWorld } from './nav/world';
import { chartIndex } from './plates/plates';
import type { Phase } from './sim/recorder';
import { CockpitAudio } from './sim/audio';
import { Intro, introWanted } from './ui/intro';

// ------------------------------------------------------------------ state
const sim = new Sim(SCENARIOS[1]);
sim.paused = true;
const pfdSt = newPfdState();
const mfdSt = newMfdState();
pfdSt.svt = store.get('ifr.svt', true);
let lastScenario: Scenario = SCENARIOS[1];
let lastWx: WxPreset = WX_PRESETS[0];
export type CockpitType = 'g1000' | 'steam' | 'airliner';
let cockpitType = store.get<CockpitType>('ifr.cockpit', 'g1000');
type OtwMode = 'normal' | 'big' | 'visual' | 'none';
let otwMode = store.get<OtwMode>('ifr.otw', 'normal');
let debriefShown = false;
let endTimer = 0;

const input = new InputManager({ onAction: (a) => doAction(a) });
const audio = new CockpitAudio(store.get('ifr.muted', false));
window.addEventListener('pointerdown', () => audio.start(), { once: true });
window.addEventListener('keydown', () => audio.start(), { once: true });

// ------------------------------------------------------------------ toasts
const toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
let proMode = store.get('ifr.pro', false);
document.body.classList.toggle('pro', proMode);
function toast(msg: string, kind: 'info' | 'good' | 'warn' | 'bad' = 'info', ms = 3800) {
  if (proMode && (kind === 'info' || kind === 'good') && !/FAILURE|CRASH/.test(msg)) return;
  const t = h('div', { class: `toast ${kind}` }, msg);
  toasts.append(t);
  while (toasts.children.length > 4) toasts.firstChild?.remove();
  setTimeout(() => t.remove(), ms);
}
sim.rec.onEvent = (e) => {
  if (sim.assess.mode === 'checkride' && !e.text.startsWith('FAILURE') && !e.text.startsWith('CRASH')) return;
  if (e.kind !== 'info' || /Crossed FAF|Minimums|Liftoff/.test(e.text)) toast(e.text, e.kind);
};

// ------------------------------------------------------------------ modals
const launcher = new Launcher((sc, wx, a) => startScenario(sc, wx, a));
const weatherModal = new WeatherStation(sim);
const procModal = new ProcModal(sim, (m) => toast(m, 'good'));
const directModal = new DirectModal(sim, (m) => toast(m, 'good'));
const joyModal = new JoystickModal(input);
const debrief = new DebriefModal(sim, () => startScenario(lastScenario, lastWx, sim.assess), () => fc.open());
debrief.onReplay = () => startReplay();
const historyModal = new HistoryModal();
const connect = new ConnectModal(sim, (m, k) => toast(m, k ?? 'info'));
let lesson: LessonRun | null = null;
let lessonPath: Path | null = null;
const briefing = new BriefingModal(sim, (run) => startLesson(run), (id) => { charts.toggle(true); charts.show(id); });
const drill = new HoldDrillModal();
const learn = new LearnModal((ex, path) => pickExercise(ex, path), () => drill.open());
// ------------------------------------------------------------------ replay
interface ReplayState { samples: import('./sim/recorder').Sample[]; events: import('./sim/recorder').FlightEvent[]; pos: number; playing: boolean; speed: number; saved: string; wasPaused: boolean }
let replay: ReplayState | null = null;
function startReplay() {
  const r = sim.rec;
  if (r.samples.length < 10) return;
  replay = { samples: [...r.samples], events: [...r.events], pos: 0, playing: true, speed: 4, saved: JSON.stringify(sim.ac.s), wasPaused: sim.paused };
  sim.paused = true;
  sim.replaying = true;
  document.body.classList.add('replaying');
  renderReplayBar();
}
function stopReplay() {
  if (!replay) return;
  Object.assign(sim.ac.s, JSON.parse(replay.saved));
  sim.paused = replay.wasPaused;
  replay = null;
  sim.replaying = false;
  document.body.classList.remove('replaying');
  replayBar.innerHTML = '';
  sim.step(0.01);
}
function renderReplayBar() {
  if (!replay) return;
  const R = replay;
  const t0 = R.samples[0].t;
  const t1 = R.samples[R.samples.length - 1].t;
  replayBar.innerHTML = '';
  const slider = h('input', { type: 'range', min: 0, max: R.samples.length - 1, step: 0.1, value: R.pos, class: 'lever', 'aria-label': 'Replay position' }) as HTMLInputElement;
  slider.addEventListener('input', () => { R.pos = Number(slider.value); R.playing = false; applyReplay(); });
  slider.addEventListener('keydown', (e) => e.stopPropagation());
  const marks = h('div', { class: 'rp-marks' }, ...R.events.filter((e) => e.kind !== 'info' || /FAF|Minimums|Touchdown|Liftoff/.test(e.text)).map((e) => h('i', { class: e.kind, style: `left:${((e.t - t0) / Math.max(1, t1 - t0)) * 100}%`, title: e.text })));
  replayBar.append(
    h('span', { class: 'rp-tag' }, 'REPLAY'),
    h('button', { class: 'btn', onclick: () => { R.playing = !R.playing; renderReplayBar(); } }, R.playing ? '❚❚' : '▶'),
    h('div', { class: 'rp-track' }, marks, slider),
    h('span', { class: 'rp-time', 'data-rp': 'time' }, ''),
    h('div', { class: 'seg' }, ...[1, 4, 16].map((k) => h('button', { class: R.speed === k ? 'on' : '', onclick: () => { R.speed = k; renderReplayBar(); } }, `${k}×`))),
    h('span', { class: 'rp-ev', 'data-rp': 'ev' }, ''),
    h('button', { class: 'btn primary', onclick: () => stopReplay() }, 'Exit replay'),
  );
  applyReplay();
}
function applyReplay() {
  if (!replay) return;
  const R = replay;
  const i = Math.max(0, Math.min(R.samples.length - 1, Math.floor(R.pos)));
  const a = R.samples[i];
  const b = R.samples[Math.min(R.samples.length - 1, i + 1)];
  const f = R.pos - i;
  const lerp = (x: number, y: number) => x + (y - x) * f;
  let dh = b.hdg - a.hdg;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  sim.ac.applySnapshot({ lat: lerp(a.lat, b.lat), lon: lerp(a.lon, b.lon), altFt: lerp(a.alt, b.alt) - (sim.av.baro - sim.weather.qnh) * 1000, hdg: (a.hdg + dh * f + 360) % 360, pitch: lerp(a.pitch, b.pitch), bank: lerp(a.bank, b.bank), ias: lerp(a.ias, b.ias), vs: lerp(a.vs, b.vs), agl: lerp(a.agl, b.agl) });
  const t = lerp(a.t, b.t) - R.samples[0].t;
  const time = replayBar.querySelector('[data-rp=time]');
  if (time) time.textContent = `${fmtTime(t)} / ${fmtTime(R.samples[R.samples.length - 1].t - R.samples[0].t)}`;
  const ev = [...R.events].reverse().find((e) => e.t <= a.t);
  const evEl = replayBar.querySelector('[data-rp=ev]');
  if (evEl) evEl.textContent = ev ? ev.text : '';
  const sl = replayBar.querySelector('input') as HTMLInputElement | null;
  if (sl && R.playing) sl.value = String(R.pos);
}

// late terrain tiles of a real-world region: rebuild the 3D view with the real relief
window.addEventListener('ifr-terrain-updated', () => rebuildOutside());
/** Flight Center content lives in the built-in training region */
function backToTraining() {
  if (!currentRegion()) return;
  leaveRealWorld();
  rebuildOutside();
  charts.refresh?.();
}
const fc = new FlightCenter({
  flyScenario: (sc, wx, a) => { backToTraining(); startScenario(sc, wx, a); },
  briefExercise: (ex, path) => { backToTraining(); pickExercise(ex, path); },
  openPaths: () => learn.open(),
  openDrill: () => drill.open(),
  openRecords: () => historyModal.open(),
  openChart: (id) => { charts.toggle(true); charts.show(id); },
  setCockpit: (t) => setCockpit(t),
  getCockpit: () => cockpitType,
  openBuilder: (c) => builder.edit(c),
  flyCircuit: (c) => { backToTraining(); flyCircuit(c); },
  planFlight: (t, world) => setup.start(t, world),
});
const builder = new CircuitBuilder((c) => flyCircuit(c), (m, k) => toast(m, k ?? 'info'));
const setup = new FlightSetup({
  flyGraded: (c, st) => { applySetupPrefs(st); if (c.cockpit && c.cockpit !== cockpitType) setCockpit(c.cockpit); startExerciseNow(circuitToExercise(c)); },
  flyFree: (sc, st) => { applySetupPrefs(st); startScenario(sc, { id: 'custom', name: 'Custom', desc: '', wx: st.weather }, { mode: 'training', student: launcher.assess.student, handFlown: false, randomFailure: false }); },
  openChart: (id) => { charts.toggle(true); charts.show(id); },
  regionChanged: () => {
    // the previous flight refers to the old nav database: stop it cleanly (no result, no debrief) before
    // anything else reads its route, approach or lesson steps
    lesson = null;
    hideCrash();
    sim.paused = true;
    sim.fp = new FlightPlan();
    atc.clear();
    rebuildOutside();
    charts.refresh?.();
  },
});
setup.toast = (m) => toast(m, 'good');
/** full-screen start page at launch (before the Flight Center) */
const intro = new Intro({ start: () => setup.start('route', 'real'), flightCenter: () => fc.open(), get resume() { return lastFlight(); } });
function applySetupPrefs(st: import('./ui/flightsetup').FlightSetupState) {
  if (st.cockpit !== cockpitType) setCockpit(st.cockpit);
  pfdSt.svt = st.svt;
  store.set('ifr.svt', st.svt);
  if (st.tod !== timeOfDay) { timeOfDay = st.tod; store.set('ifr.tod', st.tod); outside?.setTime(st.tod); }
}
function flyCircuit(c: Circuit) {
  if (c.cockpit && c.cockpit !== cockpitType) setCockpit(c.cockpit);
  pickExercise(circuitToExercise(c), null);
}
const lessonResult = new LessonResultModal((ex) => pickExercise(ex, lessonPath), (ex) => pickExercise(ex, lessonPath), () => openDebrief());
/** start an exercise immediately (no briefing window) — used by Plan a flight, Retry */
function startExerciseNow(ex: Exercise, path: Path | null = null) {
  lessonPath = path;
  sim.assess = { mode: sim.assess.mode, student: launcher.assess.student, handFlown: false, randomFailure: false };
  hideCrash();
  startLesson(new LessonRun(ex, sim));
}
function pickExercise(ex: Exercise, path: Path | null) {
  hideCrash();
  lesson = null;
  lessonPath = path;
  sim.assess = { mode: 'training', student: launcher.assess.student, handFlown: false, randomFailure: false };
  briefing.show(ex);
}
function startLesson(run: LessonRun) {
  lesson = run;
  lastLessonEx = run.ex;
  debriefShown = true; // the lesson result replaces the automatic debrief
  sim.paused = false;
  input.keys.clear();
  coachKey = '';
  updateHeader();
  if (run.ex.plate) charts.show(run.ex.plate);
  toast(`Exercise started: ${run.ex.title}`, 'info');
  atc.clear();
  lastAtcStep = -1;
  if (run.rt.clearance) atc.say(run.rt.clearance);
  try { if (exercise(run.ex.id) === run.ex) rememberFlight({ k: 'ex', id: run.ex.id, name: run.ex.title }); } catch { /* a circuit or generated exercise */ }
  maybeTour();
  chromeAfterStart();
}
const help = new HelpModal();
const cduPanel = new CduPanel(sim);
document.body.append(cduPanel.el);
const charts = new ChartsDrawer(sim);
const ios = new InstructorDrawer(sim, (m, k) => toast(m, k ?? 'info'));
ios.onBuilder = () => builder.edit();

/** the last flight that can be resumed from the intro (built-in scenarios and catalogue exercises only) */
type LastFlight = { k: 'sc'; id: string; wx: string; name: string } | { k: 'ex'; id: string; name: string };
function rememberFlight(f: LastFlight) { store.set('ifr.lastFlight', f); }
function lastFlight(): { label: string; go: () => void } | null {
  const f = store.get<LastFlight | null>('ifr.lastFlight', null);
  if (!f) return null;
  if (f.k === 'sc') {
    const sc = SCENARIOS.find((x) => x.id === f.id);
    return sc ? { label: sc.name, go: () => startScenario(sc, WX_PRESETS.find((w) => w.id === f.wx) ?? WX_PRESETS[0]) } : null;
  }
  try {
    const ex = exercise(f.id);
    return { label: ex.title, go: () => pickExercise(ex, null) };
  } catch { return null; }
}
function startScenario(sc: Scenario, wx: WxPreset, a: AssessSettings = launcher.assess) {
  hideCrash();
  lesson = null;
  lastLessonEx = null;
  // a new flight starts with a quiet radio: no transmission of the previous flight stays on screen
  atc.clear();
  lastAtcStep = -1;
  if (SCENARIOS.includes(sc)) rememberFlight({ k: 'sc', id: sc.id, wx: wx.id, name: sc.name });
  lastScenario = sc;
  lastWx = wx;
  sim.assess = { ...a };
  sim.load(sc);
  Object.assign(sim.weather, wx.wx);
  sim.paused = false;
  debriefShown = false;
  endTimer = 0;
  input.keys.clear();
  updateHeader();
  if (charts.isOpen || sc.approachId) {
    if (sc.approachId) charts.show(sc.approachId);
  }
  toast(`${sc.name} — good luck!`, 'info');
  maybeTour();
  chromeAfterStart();
}
function maybeTour() {
  if (!store.get('ifr.tour.v1', false)) setTimeout(() => { if (!Modal.anyOpen()) startTour(); }, 900);
}

// ------------------------------------------------------------------ layout
/** chrome icons come from the shared line set (src/ui/icons.ts) */
const icon = (name: string) => svgIcon(name, 16);
const scnName = h('b', {}, '');
const scnSub = h('span', {}, '');
const scnBtn = h('button', { class: 'scn', title: 'Flight: restart, end, plan a new one', 'aria-haspopup': 'menu', onclick: (e: Event) => { e.stopPropagation(); flightMenu.classList.toggle('open'); } }, scnName, scnSub);
const pauseBtn = h('button', { class: 'btn tb-pause', title: 'Pause (Esc)', onclick: () => togglePause() }, icon(I.pause), h('span', { class: 'lbl' }, 'Pause'));
/** simulation rate: one compact button next to Pause that cycles 1× → 2× → 4× */
const RATES = [1, 2, 4];
const rateBtn = h('button', { class: 'btn tb-rate', title: 'Simulation rate — click to change (Ctrl+1 / 2 / 4)', onclick: () => setRate(RATES[(RATES.indexOf(sim.rate) + 1) % RATES.length] ?? 1) }, '1×');
const COCKPITS = [['g1000', 'G1000', 'Garmin G1000 glass cockpit'], ['steam', 'Steam', 'Classic six-pack and radio stack'], ['airliner', 'Boeing', 'Airliner PFD / ND with a mode control panel']] as const;
const cockpitSeg = h('div', { class: 'seg tb-cockpit', role: 'radiogroup', 'aria-label': 'Cockpit type' }, ...COCKPITS.map(([c, l, t]) => h('button', { 'data-c': c, role: 'radio', title: t, onclick: () => setCockpit(c) }, l)));
/** layout picker in the top bar — the same four names everywhere (menu, Tab toast, tour) */
const LAYOUTS = [
  ['normal', 'Standard', 'Outside view above the full instrument panel'],
  ['big', 'Large view', 'Bigger outside view, smaller panel'],
  ['visual', 'Immersive', 'Full-screen outside view with a floating PFD'],
  ['none', 'Instruments', 'Instrument panel only (pure IFR)'],
] as const;
const layoutName = (m: OtwMode) => LAYOUTS.find((x) => x[0] === m)?.[1] ?? 'Standard';
const layoutMenu = h('div', { class: 'menu layout-menu', role: 'menu' });
const layoutBtn = h('button', { class: 'btn', title: 'Screen layout (Tab cycles)', 'aria-haspopup': 'menu', onclick: (e: Event) => { e.stopPropagation(); renderLayoutMenu(); layoutMenu.classList.toggle('open'); } }, icon(I.layout), h('span', { class: 'lbl' }, 'Layout'));
function renderLayoutMenu() {
  layoutMenu.innerHTML = '';
  for (const [m, t, d] of LAYOUTS)
    layoutMenu.append(h('button', { class: `menu-item layout-item${otwMode === m ? ' on' : ''}`, role: 'menuitemradio', 'aria-checked': String(otwMode === m), onclick: () => { layoutMenu.classList.remove('open'); setOtw(m); } }, h('i', { class: `lay-ic lay-${m}` }), h('span', {}, h('b', {}, t), h('small', {}, d))));
}
document.addEventListener('click', (e) => { if (!layoutMenu.contains(e.target as Node) && !layoutBtn.contains(e.target as Node)) layoutMenu.classList.remove('open'); });

const muteBtn = h('button', { class: 'btn ghost tb-icon', title: 'Sound on/off (M)', 'aria-label': 'Sound on/off', onclick: () => toggleMute() }, icon(audio.muted ? I.mute : I.sound));
function toggleMute() {
  audio.setMuted(!audio.muted);
  store.set('ifr.muted', audio.muted);
  muteBtn.replaceChildren(icon(audio.muted ? I.mute : I.sound));
}
const settings = new SettingsModal(
  () => ({ cockpit: cockpitType, tod: timeOfDay, gfx, pro: proMode, sound: !audio.muted, svt: pfdSt.svt, otw: otwMode }),
  (p) => {
    if (p.cockpit) setCockpit(p.cockpit);
    if (p.tod) {
      timeOfDay = p.tod;
      store.set('ifr.tod', p.tod);
      outside?.setTime(p.tod);
    }
    if (p.gfx) {
      gfx = p.gfx;
      store.set('ifr.gfx', p.gfx);
      rebuildOutside();
    }
    if (p.pro !== undefined) {
      proMode = p.pro;
      store.set('ifr.pro', p.pro);
      document.body.classList.toggle('pro', p.pro);
    }
    if (p.sound !== undefined && p.sound === audio.muted) toggleMute();
    if (p.svt !== undefined) {
      pfdSt.svt = p.svt;
      store.set('ifr.svt', p.svt);
    }
    if (p.otw) setOtw(p.otw);
  },
);
const moreMenu = h('div', { class: 'menu more-menu', role: 'menu' });
/** flight menu (click the flight name): restart / end & debrief / plan a new flight / Flight Center */
const flightMenu = h('div', { class: 'menu flight-menu', role: 'menu' });
const flightItem = (ic: string, label: string, hint: string, fn: () => void, danger = false) =>
  h('button', { class: `menu-item${danger ? ' danger' : ''}`, role: 'menuitem', onclick: () => { flightMenu.classList.remove('open'); fn(); } }, icon(ic), h('span', {}, label), hint ? h('kbd', {}, hint) : null);
function restartFlight() {
  if (lesson || lastLessonEx) startExerciseNow((lesson?.ex ?? lastLessonEx)!, lessonPath);
  else startScenario(lastScenario, lastWx, sim.assess);
}
function endFlight() {
  sim.paused = true;
  // a lesson ends with its own result window (which offers the full debrief) — never both
  if (lesson) { lesson.abort(); return; }
  openDebrief();
}
document.addEventListener('click', (e) => { if (!flightMenu.contains(e.target as Node)) flightMenu.classList.remove('open'); });
const moreItem = (ic: string, label: string, kbd: string, fn: () => void) =>
  h('button', { class: 'menu-item', role: 'menuitem', onclick: () => { moreMenu.classList.remove('open'); fn(); } }, icon(ic), h('span', {}, label), kbd ? h('kbd', {}, kbd) : null);
const menuHead = (t: string) => h('div', { class: 'menu-h', role: 'presentation' }, t);
const autoHideSw = h('i', { class: 'sw', 'aria-hidden': 'true' });
const autoHideItem = h('button', { class: 'menu-item', role: 'menuitemcheckbox', 'aria-checked': 'true', onclick: () => { setAutoHide(!autoHide); toast(autoHide ? 'Top bar hides in flight — touch the top edge of the screen or press F10 to show it' : 'Top bar always visible'); } }, icon(I.eye), h('span', {}, 'Auto-hide top bar'), autoHideSw);
moreMenu.append(
  menuHead('Flight'),
  moreItem(I.approach, 'Procedures', 'X', () => procModal.open()),
  moreItem(I.direct, 'Direct-To', 'D', () => directModal.open()),
  moreItem(I.chart, 'Debrief', 'Shift D', () => openDebrief()),
  menuHead('Tools'),
  moreItem(I.cloud, 'Weather station', '', () => weatherModal.open()),
  moreItem(I.pattern, 'Circuit builder', 'U', () => builder.edit()),
  moreItem(I.link, 'Connections', '', () => connect.open()),
  menuHead('Learn'),
  moreItem(I.learn, 'Learning paths', 'J', () => learn.open()),
  moreItem(I.records, 'Training records', '', () => historyModal.open()),
  moreItem(I.compass, 'Guided tour', '', () => startTour()),
  moreItem(I.help, 'Explain instruments', 'F1', () => toggleExplain()),
  moreItem(I.keyboard, 'Keyboard shortcuts', '?', () => help.open()),
  menuHead('App'),
  moreItem(I.gear, 'Settings', ',', () => settings.open()),
  moreItem(I.joystick, 'Controllers', '', () => joyModal.open()),
  autoHideItem,
);
// auto-hiding top bar in flight (game-style HUD). It comes back only on purpose: the pointer touches the very top
// edge of the screen (a short dwell, so crossing the edge on the way to the browser tabs does nothing), the handle
// at the top centre is clicked, or F10 / a tap on Alt. It hides again once the pointer leaves it. The logo pins it.
let autoHide = store.get('ifr.autohide', true);
let revealTimer = 0;
let hideTimer = 0;
let revealedAt = 0;
const EDGE_PX = 4;
const DWELL_MS = 250;
const chromeHidden = () => document.body.classList.contains('chrome-hidden');
/** Instruments layout: the bar stays docked so the layout switch is always one click away */
function chromeShow(on: boolean) {
  const hide = autoHide && !on && otwMode !== 'none' && !intro.isOpen;
  if (!hide && chromeHidden()) revealedAt = performance.now();
  document.body.classList.toggle('chrome-hidden', hide);
}
/** something in the top bar is in use: an open menu or window, the pointer on it, the keyboard focus in it */
const chromeBusy = () => Modal.anyOpen() || !!document.querySelector('.menu.open') || topbar.matches(':hover') || topbar.contains(document.activeElement);
function scheduleHide(ms = 700) {
  clearTimeout(hideTimer);
  if (!autoHide) return;
  hideTimer = window.setTimeout(() => { if (!chromeBusy()) chromeShow(false); else scheduleHide(ms); }, ms);
}
/** a flight just started: give the bar a moment, then get out of the way */
function chromeAfterStart() {
  if (autoHide) scheduleHide(1600);
}
function revealChrome() {
  clearTimeout(revealTimer);
  revealTimer = 0;
  chromeShow(true);
  scheduleHide(2600);
}
document.body.classList.toggle('chrome-auto', autoHide);
window.addEventListener('pointermove', (e) => {
  if (!autoHide || e.pointerType === 'touch') return;
  if (chromeHidden()) {
    if (e.clientY <= EDGE_PX) { if (!revealTimer) revealTimer = window.setTimeout(revealChrome, DWELL_MS); }
    else if (revealTimer) { clearTimeout(revealTimer); revealTimer = 0; }
    return;
  }
  const bottom = topbar.getBoundingClientRect().bottom;
  if (e.clientY <= bottom + 24) clearTimeout(hideTimer);
  else if (performance.now() - revealedAt > 400) scheduleHide();
});
document.documentElement.addEventListener('pointerleave', () => { clearTimeout(revealTimer); revealTimer = 0; });
// keyboard: F10 toggles; a tap on Alt alone (no other key between press and release) shows it
let altTap = false;
window.addEventListener('keydown', (e) => {
  altTap = e.key === 'Alt' && !e.repeat;
  if (e.key !== 'F10' || intro.isOpen) return;
  e.preventDefault();
  if (chromeHidden()) revealChrome();
  else if (autoHide) chromeShow(false);
}, true);
window.addEventListener('keyup', (e) => {
  if (e.key === 'Alt' && altTap && autoHide && chromeHidden() && !intro.isOpen) { e.preventDefault(); revealChrome(); }
  altTap = false;
}, true);
window.addEventListener('pointerdown', () => (altTap = false), true);
/** small handle at the top centre while the bar is hidden, so everyone can find it again */
const chromeHandle = h('button', { class: 'tb-handle', type: 'button', title: 'Show the top bar (F10, or touch the top edge of the screen)', 'aria-label': 'Show the top bar', onclick: () => revealChrome() }, svgIcon(I.chevDown, 14));
function setAutoHide(on: boolean) {
  autoHide = on;
  store.set('ifr.autohide', on);
  document.body.classList.toggle('chrome-auto', on);
  chromeShow(true);
  if (on) scheduleHide(1200);
  syncAutoHide();
}
function syncAutoHide() {
  autoHideItem.setAttribute('aria-checked', String(autoHide));
  autoHideSw.classList.toggle('on', autoHide);
  brandBtn.title = autoHide ? 'Keep the top bar shown' : 'Hide the top bar in flight (F10 shows it again)';
  brandBtn.setAttribute('aria-pressed', String(!autoHide));
}
/** the logo pins / unpins the top bar */
function toggleChromePin() {
  setAutoHide(!autoHide);
  if (autoHide && otwMode === 'none') toast('Top bar hides in flight — in the Instruments layout it stays docked', 'info', 3600);
  else if (autoHide) { chromeShow(false); toast('Top bar hidden — touch the top edge of the screen or press F10 to show it', 'info', 4200); }
  else toast('Top bar pinned — click the logo again to hide it', 'info', 3000);
}
const brandBtn = h('button', { class: 'brand', type: 'button', onclick: () => toggleChromePin() }, h('img', { class: 'logo', src: '/favicon.svg', alt: '' }), h('span', { class: 'brand-t' }, h('b', {}, 'IFR'), h('span', {}, ' Trainer')));
flightMenu.append(
  flightItem(I.restart, 'Restart this flight', '', () => restartFlight()),
  flightItem(I.flag, 'End flight & debrief', 'Shift D', () => endFlight()),
  h('div', { class: 'menu-sep' }),
  flightItem(I.plan, 'Plan a new flight…', 'Shift N', () => setup.start()),
  flightItem(I.plane, 'Flight Center', 'F2', () => fc.open()),
);
const moreBtn = h('button', { class: 'btn tb-icon', title: 'More', 'aria-label': 'More', 'aria-haspopup': 'menu', onclick: (e: Event) => { e.stopPropagation(); moreMenu.classList.toggle('open'); } }, icon(I.more));
document.addEventListener('click', (e) => { if (!moreMenu.contains(e.target as Node)) moreMenu.classList.remove('open'); });
const topbar = h('header', { class: 'topbar' },
  brandBtn,
  h('div', { class: 'menu-wrap scn-wrap' }, scnBtn, flightMenu),
  h('div', { class: 'spacer' }),
  h('div', { class: 'tb-actions' },
    h('button', { class: 'btn primary', onclick: () => fc.open(), title: 'Flight Center — all flights, exercises and paths (F2)' }, icon(I.plane), h('span', { class: 'lbl' }, 'Flight Center')),
    h('button', { class: 'btn', onclick: () => setup.start(), title: 'Plan a flight — aircraft, instruments, route, weather (Shift N)' }, icon(I.plan), h('span', { class: 'lbl' }, 'Plan')),
    h('div', { class: 'tb-group' },
      h('button', { class: 'btn', onclick: () => charts.toggle(), title: 'EFB — charts, airport, navlog, weather, checklists (K)' }, icon(I.tablet), h('span', { class: 'lbl' }, 'EFB')),
      h('button', { class: 'btn', onclick: () => cduPanel.toggle(), title: 'FMC CDU — route, approach, legs, hold (F3)' }, icon(I.keypad), h('span', { class: 'lbl' }, 'CDU')),
    ),
    h('button', { class: 'btn', onclick: () => ios.toggle(), title: 'Instructor station (I)' }, icon(I.instructor), h('span', { class: 'lbl' }, 'Instructor')),
    h('div', { class: 'menu-wrap' }, layoutBtn, layoutMenu),
    cockpitSeg,
    h('div', { class: 'tb-sim' }, pauseBtn, rateBtn),
    muteBtn,
    h('div', { class: 'menu-wrap' }, moreBtn, moreMenu),
  ),
);
syncAutoHide();

// outside view
const otwCanvas = h('canvas', { 'aria-label': 'Outside view' });
const coach = h('div', { class: `coach${store.get('ifr.coachMin', false) ? ' min' : ''}` });
const glCanvas = h('canvas', { 'aria-label': 'Outside view (3D)', class: 'gl' });
const glare = h('div', { class: 'glare' });
const lookHint = h('div', { class: 'look-hint', 'aria-hidden': 'true' }, 'Drag to look around · double-click to recentre');
/** the look hint appears once per session, under the situation bar, and fades after 6 s or on the first drag */
function showLookHint() {
  let seen = false;
  try { seen = sessionStorage.getItem('ifr.lookHint') === '1'; sessionStorage.setItem('ifr.lookHint', '1'); } catch { /* storage blocked */ }
  if (seen) return;
  lookHint.classList.add('show');
  setTimeout(() => lookHint.classList.remove('show'), 6000);
}
const sitbar = h('div', { class: 'sitbar', role: 'status', 'aria-label': 'Flight situation' });
const pauseVeil = h('div', { class: 'pause-veil' }, h('b', {}, 'Paused'), h('span', {}, 'Press Esc or the Resume button to continue'));
const replayBar = h('div', { class: 'replay' });
const atc = new AtcRadio(sim, () => audio.squelch());
const otw = h('section', { class: 'otw' }, otwCanvas, glCanvas, glare, lookHint, sitbar, pauseVeil, coach, toasts, replayBar, atc.el);
let outside: Outside3D | null = null;
let timeOfDay = store.get<TimeOfDay>('ifr.tod', 'day');
let gfx = store.get<Quality>('ifr.gfx', 'high');
let outsideLoading = false;
async function initOutside() {
  if (outside || outsideLoading) return;
  outsideLoading = true;
  try {
    const mod = await import('./avionics/outside3d');
    if (!mod.webglAvailable()) return;
    outside = new mod.Outside3D(glCanvas, gfx, timeOfDay);
    otw.classList.add('has-gl');
    if (otwMode !== 'none') showLookHint();
  } catch (e) {
    console.warn('WebGL outside view unavailable', e);
    outside = null;
  } finally {
    outsideLoading = false;
  }
}
function rebuildOutside() {
  outside?.renderer.dispose();
  outside = null;
  otw.classList.remove('has-gl');
  glCanvas.dataset.size = '';
  void initOutside();
}
// mouse look
{
  let drag: { x: number; y: number } | null = null;
  glCanvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; glCanvas.setPointerCapture(e.pointerId); otw.classList.add('looked'); lookHint.classList.remove('show'); });
  glCanvas.addEventListener('pointermove', (e) => {
    if (!drag || !outside) return;
    outside.lookYaw = Math.max(-2.6, Math.min(2.6, outside.lookYaw + (e.clientX - drag.x) * 0.005));
    outside.lookPitch = Math.max(-0.8, Math.min(0.8, outside.lookPitch + (e.clientY - drag.y) * 0.004));
    drag = { x: e.clientX, y: e.clientY };
  });
  glCanvas.addEventListener('pointerup', () => (drag = null));
  glCanvas.addEventListener('dblclick', () => { if (outside) outside.lookYaw = outside.lookPitch = 0; });
}

// PFD bezel
const pfdCanvas = h('canvas', { 'aria-label': 'Primary flight display' });
const mfdCanvas = h('canvas', { 'aria-label': 'Multi-function display' });
const hdgBy = (d: number, coarse: boolean) => (sim.ap.hdgBug = ((((sim.ap.hdgBug + d * (coarse ? 10 : 1)) % 360) + 360) % 360) || 360);
const altBy = (d: number, coarse: boolean) => (sim.ap.altSel = Math.max(0, Math.min(18000, sim.ap.altSel + d * (coarse ? 1000 : 100))));
const tune = (r: { standby: number }, d: number, coarse: boolean, min: number, max: number, fine: number) => {
  let v = r.standby;
  if (coarse) {
    v += d;
    if (v > max) v -= max - min;
    if (v < min) v += max - min;
  } else {
    const mhz = Math.floor(v + 1e-6);
    let k = Math.round((v - mhz) / fine) + d;
    const steps = Math.round(1 / fine);
    k = ((k % steps) + steps) % steps;
    v = mhz + k * fine;
  }
  r.standby = Math.round(v * 1000) / 1000;
};
const swap = (r: { active: number; standby: number }) => ([r.active, r.standby] = [r.standby, r.active]);

const apKeyEls = () => {
  const d = () => sim.ac.data;
  const n = () => sim.navInputs();
  const k = (label: string, fn: () => void, title: string) => {
    const b = bkey(label, fn, title);
    b.dataset.ap = label;
    return b;
  };
  return h('div', { class: 'ap-col' },
    k('AP', () => doAction('apToggle'), 'Autopilot (A)'),
    k('FD', () => sim.ap.toggleFd(d()), 'Flight director (Shift+A)'),
    k('HDG', () => sim.ap.pressHdg(d()), 'Heading mode (H)'),
    k('ALT', () => sim.ap.pressAlt(d()), 'Altitude hold (L)'),
    k('NAV', () => sim.ap.pressNav(d(), n()), 'Nav mode (N)'),
    k('APR', () => sim.ap.pressApr(d(), n()), 'Approach mode (R)'),
    k('BC', () => sim.ap.pressApr(d(), n()), 'Back course (auto via APR)'),
    k('VS', () => sim.ap.pressVs(d()), 'Vertical speed (V)'),
    k('FLC', () => sim.ap.pressFlc(d()), 'Flight level change (K)'),
    k('UP', () => sim.ap.nose(1), 'Nose up'),
    k('DN', () => sim.ap.nose(-1), 'Nose down'),
  );
};

const pad3 = (n: number) => String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, '0');
/** softkeys this trainer does not model: drawn blank or inert, never a fake toast */
const DEAD_SOFTKEYS = new Set(['', 'ENGINE', 'ALERTS']);
const softRow = (labels: readonly string[], fn: (i: number) => void) => h('div', { class: 'softrow' }, ...labels.map((l, i) => DEAD_SOFTKEYS.has(l)
  ? h('button', { class: 'dead', 'aria-disabled': 'true', tabindex: -1, 'aria-label': l ? `${l} (not modelled)` : `Softkey ${i + 1} (blank)` })
  : h('button', { 'aria-label': `Softkey ${l}`, title: l, onclick: () => fn(i) })));
/** tag a bezel control so each cockpit theme can show only the controls it really has */
const tag = <T extends HTMLElement>(el: T, k: string): T => { el.dataset.k = k; return el; };
const pfdBezel = h('div', { class: 'bezel pfd' },
  h('div', { class: 'brand-mark', 'data-l': '1' }, 'PFD'),
  h('div', { class: 'side left' },
    tag(knob({ label: 'NAV', sub: 'MHz · kHz', dual: true, onTurn: (d, c) => tune(sim.av.nav1, d, c, 108, 118, 0.05), readout: () => `NAV1 SBY ${sim.av.nav1.standby.toFixed(2)}` }), 'nav'),
    tag(bkey('NAV ⇆', () => swap(sim.av.nav1), 'Swap NAV1 active/standby'), 'nav'),
    tag(knob({ label: 'HDG', sub: 'Push sync', onTurn: hdgBy, onPush: () => (sim.ap.hdgBug = Math.round(sim.ac.data.hdgTrue) || 360), readout: () => `HDG ${pad3(sim.ap.hdgBug)}°` }), 'hdg'),
    apKeyEls(),
    tag(knob({ label: 'ALT', sub: '1000 · 100', dual: true, onTurn: altBy, onPush: () => (sim.ap.altSel = Math.round(sim.indicatedAlt() / 100) * 100), readout: () => `ALT ${sim.ap.altSel} FT` }), 'alt'),
  ),
  h('div', { class: 'screen' }, pfdCanvas),
  softRow(PFD_SOFTKEYS, (i) => pfdSoftkey(i)),
  h('div', { class: 'side right' },
    tag(knob({ label: 'COM', sub: 'MHz · kHz', dual: true, onTurn: (d, c) => tune(sim.av.com1, d, c, 118, 137, 0.025), readout: () => `COM1 SBY ${sim.av.com1.standby.toFixed(3)}` }), 'com'),
    tag(bkey('COM ⇆', () => swap(sim.av.com1), 'Swap COM1'), 'com'),
    tag(knob({
      label: 'CRS',
      sub: 'Outer BARO',
      dual: true,
      onTurn: (d, c) => {
        if (c) sim.av.baro = Math.round((sim.av.baro + d * 0.01) * 100) / 100;
        else sim.setCourse(sim.course() + d);
      },
      onPush: () => centerCdi(),
      readout: () => `CRS ${pad3(sim.course())}° · ${sim.av.baro.toFixed(2)} IN`,
      title: 'CRS/BARO — inner knob: course (push = centre CDI) · outer ring: altimeter setting',
    }), 'crs'),
    tag(knob({ label: 'MINS', sub: 'Push off', onTurn: (d, c) => (sim.av.minimums = Math.max(0, (sim.av.minimums ?? Math.round(sim.indicatedAlt() / 100) * 100) + d * (c ? 100 : 10))), onPush: () => (sim.av.minimums = null), readout: () => (sim.av.minimums === null ? 'MINS OFF' : `BARO MIN ${sim.av.minimums}`) }), 'mins'),
    h('div', { class: 'bkey-grid' },
      bkey('D→', () => directModal.open(), 'Direct-To (D)'),
      bkey('PROC', () => procModal.open(), 'Procedures (X)'),
      bkey('FPL', () => (mfdSt.showFpl = !mfdSt.showFpl), 'Flight plan'),
      bkey('BARO', () => setQnh(), 'Set altimeter to QNH (B)'),
      bkey('CLR', () => Modal.closeAll(), 'Clear'),
      bkey('TOGA', () => goAround(), 'Go-around (G)'),
    ),
  ),
);
const mfdBezel = h('div', { class: 'bezel mfd' },
  h('div', { class: 'brand-mark', 'data-r': '1' }, 'MFD'),
  h('div', { class: 'side left' },
    tag(knob({ label: 'NAV2', sub: 'MHz · kHz', dual: true, onTurn: (d, c) => tune(sim.av.nav2, d, c, 108, 118, 0.05), readout: () => `NAV2 SBY ${sim.av.nav2.standby.toFixed(2)}` }), 'nav2'),
    tag(bkey('NAV2 ⇆', () => swap(sim.av.nav2), 'Swap NAV2'), 'nav2'),
    tag(knob({ label: 'ADF', sub: '100 · 1 kHz', dual: true, onTurn: (d, c) => (sim.av.adf.active = Math.max(190, Math.min(1750, sim.av.adf.active + d * (c ? 100 : 1)))), readout: () => `ADF ${sim.av.adf.active} kHz` }), 'adf'),
    tag(bkey('CDI', () => doAction('cdi'), 'Cycle CDI (C)'), 'cdi'),
  ),
  h('div', { class: 'screen' }, mfdCanvas),
  softRow(MFD_SOFTKEYS, (i) => mfdSoftkey(i)),
  h('div', { class: 'side right' },
    tag(knob({ label: 'RANGE', sub: 'Map', onTurn: (d) => (mfdSt.rangeIdx = Math.max(0, Math.min(8, mfdSt.rangeIdx - d))), readout: () => `RANGE ${mfdRange(mfdSt)} NM` }), 'range'),
    h('div', { class: 'bkey-grid' },
      bkey('D→', () => directModal.open(), 'Direct-To (D)'),
      bkey('PROC', () => procModal.open(), 'Procedures (X)'),
      bkey('FPL', () => (mfdSt.showFpl = !mfdSt.showFpl), 'Flight plan'),
      tag(bkey('ACT', () => { sim.fp.activateApproach(sim.ac.s); toast('Approach activated', 'good'); }, 'Activate the loaded approach'), 'act'),
    ),
    tag(knob({ label: 'FMS', sub: 'Leg select', dual: true, onTurn: (d) => sim.fp.activateLeg(Math.max(1, Math.min(sim.fp.wpts.length - 1, sim.fp.active + d))), readout: () => (sim.fp.out.valid ? `ACTV ${sim.fp.out.toIdent}` : 'NO FPL'), title: 'FMS — select the active leg' }), 'fms'),
  ),
);
const panel = h('section', { class: 'panel' }, pfdBezel, mfdBezel);
// airliner mode-control panel
const mcpWin = (label: string) => {
  const v = h('b', {}, '');
  return { el: h('div', { class: 'mcp-win' }, h('small', {}, label), v), v };
};
const mcpSpd = mcpWin('IAS');
const mcpHdg = mcpWin('HEADING');
const mcpAlt = mcpWin('ALTITUDE');
const mcpVs = mcpWin('VERT SPD');
const mcpKey = (label: string, fn: () => void, key: string) => {
  const b = h('button', { class: 'mcp-key', onclick: fn }, h('i', {}), label);
  b.dataset.mcp = key;
  return b;
};
const mcp = h('section', { class: 'mcp' },
  h('div', { class: 'mcp-group' }, mcpKey('F/D', () => sim.ap.toggleFd(sim.ac.data), 'FD'), mcpKey('CMD A', () => doAction('apToggle'), 'AP')),
  h('div', { class: 'mcp-group' }, mcpSpd.el, knob({ label: 'IAS', onTurn: (d, c) => (sim.ap.iasSel = Math.max(60, Math.min(180, sim.ap.iasSel + d * (c ? 10 : 1)))), readout: () => `IAS ${sim.ap.iasSel} KT` }), mcpKey('FLCH', () => sim.ap.pressFlc(sim.ac.data), 'FLC')),
  h('div', { class: 'mcp-group' }, mcpKey('LNAV', () => { if (sim.av.cdi !== 'GPS') sim.setCdi('GPS'); sim.ap.pressNav(sim.ac.data, sim.navInputs()); }, 'LNAV'), mcpKey('VOR LOC', () => { if (sim.av.cdi === 'GPS') sim.setCdi('NAV1'); sim.ap.pressNav(sim.ac.data, sim.navInputs()); }, 'VORLOC'), mcpKey('APP', () => sim.ap.pressApr(sim.ac.data, sim.navInputs()), 'APR')),
  h('div', { class: 'mcp-group' }, mcpHdg.el, knob({ label: 'HDG', onTurn: hdgBy, onPush: () => (sim.ap.hdgBug = Math.round(sim.ac.data.hdgTrue) || 360) }), mcpKey('HDG SEL', () => sim.ap.pressHdg(sim.ac.data), 'HDG')),
  h('div', { class: 'mcp-group' }, mcpAlt.el, knob({ label: 'ALT', dual: true, onTurn: altBy }), mcpKey('ALT HOLD', () => sim.ap.pressAlt(sim.ac.data), 'ALT')),
  h('div', { class: 'mcp-group' }, mcpVs.el, knob({ label: 'V/S', onTurn: (d) => { if (sim.ap.vert !== 'VS') sim.ap.pressVs(sim.ac.data); sim.ap.vsSel = Math.max(-2000, Math.min(1500, sim.ap.vsSel + d * 100)); } }), mcpKey('V/S', () => sim.ap.pressVs(sim.ac.data), 'VS')),
  h('div', { class: 'mcp-group' }, mcpKey('A/P DISC', () => sim.ap.disconnect(), 'DISC'), mcpKey('TO/GA', () => goAround(), 'TOGA')),
);
const mcpKeys = [...mcp.querySelectorAll<HTMLElement>('[data-mcp]')];
const cockpit = h('main', { class: 'cockpit' }, otw, mcp, panel);
/** only the G1000 has engraved PFD / MFD labels; the steam panel and the airliner displays carry none */
const BEZEL_LABELS: Record<CockpitType, [string, string]> = { g1000: ['PFD', 'MFD'], steam: ['', ''], airliner: ['', ''] };
let explain: ExplainOverlay | null = null;
function toggleExplain(force?: boolean) {
  explain ??= new ExplainOverlay(pfdBezel.querySelector('.screen')!, mfdBezel.querySelector('.screen')!);
  explain.set(force ?? !explain.on, cockpitType);
  if (explain.on) toast('Explain mode: hover any outlined instrument · F1 to exit', 'info', 5000);
}
const TOUR = [
  { sel: '.tb-actions .btn.primary', title: 'Flight Center', text: 'Every flight lives here, sorted by type: approaches, holdings and procedures, IFR cross-country flights, basics, abnormals, checkrides, your own IFR circuits and the learning paths.' },
  { sel: '.sitbar', title: 'Situation bar', text: 'The essentials at a glance: flight phase, next fix and its altitude constraint, selected altitude, wind with headwind/crosswind and drift, distance to minimums, IMC or VMC.' },
  { sel: '.otw', title: 'Outside view', text: 'A 3D view of the Ardent Islands with real runway lighting and PAPI. Drag to look around, double-click to recentre. Tab cycles the layout: Standard, Large view, Immersive, Instruments.' },
  { sel: '.bezel.pfd .screen', title: 'Primary flight display', text: 'Attitude, airspeed, altitude, vertical speed and the HSI. Press F1 at any time to label and explain every instrument — in all three cockpits.' },
  { sel: '.bezel.pfd .side.left', title: 'Knobs & autopilot', text: 'Drag or scroll a knob to turn it; on dual knobs the outer ring is coarse and the inner knob fine. Click without dragging to push. The keys are the autopilot: HDG, NAV, APR, ALT, VS, FLC.' },
  { sel: '.bezel.mfd', title: 'Multi-function display', text: 'Moving map with terrain and the active flight plan. RANGE zooms; PROC loads an approach; ACT activates it.' },
  { sel: '.footer', title: 'Flight controls', text: 'Throttle, flaps, trim and yoke position. Use a joystick or yoke (Controllers in the More menu), the keyboard (arrows, +/−, Home/End, F), or the touch stick.' },
  { sel: '.tb-group', title: 'EFB & CDU', text: 'EFB: approach plates (your aircraft is drawn on them), airport data, navlog, weather and checklists. CDU: the flight management computer — route, departure/arrival, legs, holds, progress.' },
  { sel: '.tb-actions > .menu-wrap:last-child', title: 'Everything else', text: 'Procedures, Direct-To and the debrief; the weather station and circuit builder; learning paths, training records and keyboard shortcuts; Settings and controllers.' },
];
function startTour() {
  Modal.closeAll();
  new Tour(TOUR, () => store.set('ifr.tour.v1', true)).start();
}
function setCockpit(t: CockpitType, announce = true) {
  cockpitType = t;
  store.set('ifr.cockpit', t);
  sim.cockpitEyeFt = t === 'airliner' ? 18 : 7;
  audio.setCalloutProfile(t === 'airliner' ? 'airline' : 'ga');
  panel.classList.remove('theme-g1000', 'theme-steam', 'theme-airliner');
  panel.classList.add(`theme-${t}`);
  cockpit.classList.toggle('with-mcp', t === 'airliner');
  pfdBezel.querySelector('[data-l]')!.textContent = BEZEL_LABELS[t][0];
  mfdBezel.querySelector('[data-r]')!.textContent = BEZEL_LABELS[t][1];
  cockpitSeg.querySelectorAll('button').forEach((b) => { const on = (b as HTMLElement).dataset.c === t; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
  fitSoon();
  if (explain?.on) explain.set(true, t);
  if (announce) toast(t === 'g1000' ? 'Cockpit: G1000 glass' : t === 'steam' ? 'Cockpit: classic steam gauges' : 'Cockpit: airliner PFD/ND', 'info');
}

// control pedestal (footer)
const thr = h('input', { type: 'range', min: 0, max: 100, value: 60, class: 'lever', 'aria-label': 'Throttle' }) as HTMLInputElement;
let thrDragging = false;
thr.addEventListener('pointerdown', () => (thrDragging = true));
window.addEventListener('pointerup', () => (thrDragging = false));
thr.addEventListener('input', () => (sim.controls.throttle = Number(thr.value) / 100));
thr.addEventListener('keydown', (e) => e.stopPropagation());
const thrPct = h('b', {}, '');
const thrRpm = h('small', {}, '');
const flapNeedle = h('i', { class: 'flap-needle' });
const flapBtns = ['UP', '10', '20', 'FULL'].map((l, i) => h('button', { onclick: () => (sim.controls.flaps = i), title: `Flaps ${i * 10}° (F / Shift+F)` }, l));
const trimWheel = h('div', { class: 'trim-wheel', title: 'Elevator trim — Home (nose down) / End (nose up), or scroll here' }, h('i', {}));
trimWheel.addEventListener('wheel', (e) => { e.preventDefault(); sim.controls.trim = Math.max(-1, Math.min(1, sim.controls.trim + (e.deltaY < 0 ? -0.02 : 0.02))); }, { passive: false });
const trimMark = h('i', { class: 'trim-mark' });
const stickDot = h('i', {});
const stick = h('div', { class: 'stick', title: 'Yoke position — drag here to fly with the mouse or a touch screen' }, h('span', { class: 'cross' }), stickDot);
const rudderBar = h('div', { class: 'rudder', title: 'Rudder ( , and . )' }, h('i', {}));
const brakeLight = h('span', { class: 'brake-light', role: 'status', title: 'Wheel brakes (hold Space)' }, h('i', {}), 'BRAKES');
const joyDot = h('span', { class: 'joy-dot' });
const joyLbl = h('span', { class: 'joy-lbl' }, 'Keyboard');
// chronometer widget (pedestal): START/STOP, RESET, minute chime
const chronoRead = h('b', { class: 'chrono-lcd' }, '00:00');
const chronoSS = h('button', { class: 'ped-btn chrono-b', onclick: () => sim.chronoStartStop(), title: 'Start / stop (T cycles start → stop → reset)' }, 'ST/SP');
const chronoRst = h('button', { class: 'ped-btn chrono-b', onclick: () => sim.chronoReset(), title: 'Reset' }, 'RST');
let chronoMin = -1;
function updateChrono() {
  const t = sim.chrono();
  setText(chronoRead, t === null ? '00:00' : `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
  setClass(chronoRead, 'run', sim.av.timerStart !== null);
  setClass(chronoRead, 'idle', t === null);
  const m = t === null || sim.av.timerStart === null ? -1 : Math.floor(t / 60);
  if (m > 0 && m !== chronoMin) audio.chime();
  chronoMin = m;
}
const group = (title: string, ...kids: (HTMLElement | string)[]) => h('div', { class: 'ped-g' }, h('div', { class: 'ped-t' }, title), h('div', { class: 'ped-c' }, ...kids));
const footer = h('footer', { class: 'footer pedestal' },
  group('Throttle', h('div', { class: 'lever-box' }, h('span', { class: 'lv-l' }, 'IDLE'), thr, h('span', { class: 'lv-l' }, 'FULL')), h('div', { class: 'ped-read' }, thrPct, thrRpm)),
  group('Flaps', h('div', { class: 'flap-sel' }, ...flapBtns, flapNeedle)),
  group('Trim', h('button', { class: 'ped-btn', onclick: () => (sim.controls.trim = Math.max(-1, sim.controls.trim - 0.05)), title: 'Nose down (Home)' }, '▼'), h('div', { class: 'trim-box' }, trimWheel, h('div', { class: 'trim-scale' }, h('span', {}, 'DN'), h('b', {}, 'T/O'), h('span', {}, 'UP'), trimMark)), h('button', { class: 'ped-btn', onclick: () => (sim.controls.trim = Math.min(1, sim.controls.trim + 0.05)), title: 'Nose up (End)' }, '▲')),
  group('Yoke & rudder', stick, h('div', { class: 'ped-col' }, rudderBar, brakeLight)),
  group('Chrono', h('div', { class: 'chrono' }, chronoRead, h('div', { class: 'chrono-btns' }, chronoSS, chronoRst))),
  group('Controller', h('button', { class: 'ped-joy', onclick: () => joyModal.open(), title: 'Flying with the keyboard — click to connect a joystick, yoke or pedals' }, joyDot, joyLbl)),
  h('div', { class: 'spacer' }),
  h('div', { class: 'ped-keys' }, h('span', {}, h('kbd', {}, 'F1'), ' explain'), h('span', {}, h('kbd', {}, '?'), ' shortcuts'), h('span', {}, h('kbd', {}, 'G'), ' go-around'), h('span', {}, h('kbd', {}, 'K'), ' charts')),
);

document.getElementById('app')!.append(topbar, cockpit, footer);
document.body.append(charts.el, ios.el, chromeHandle);

// touch stick
{
  let active = false;
  const move = (e: PointerEvent) => {
    const r = stick.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    const y = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    input.virtual.roll = x * 0.7;
    input.virtual.pitch = y * 0.7;
    stickDot.style.left = `${50 + x * 40}%`;
    stickDot.style.top = `${50 + y * 40}%`;
  };
  stick.addEventListener('pointerdown', (e) => { active = true; stick.classList.add('active'); stick.setPointerCapture(e.pointerId); move(e); });
  stick.addEventListener('pointermove', (e) => active && move(e));
  const end = () => { active = false; stick.classList.remove('active'); input.virtual.roll = input.virtual.pitch = 0; };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
}

// softkeys
function canvasPoint(c: HTMLCanvasElement, e: MouseEvent, W: number, H: number) {
  const r = c.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}
function pfdSoftkey(i: number) {
  if (cockpitType !== 'g1000' || DEAD_SOFTKEYS.has(PFD_SOFTKEYS[i] ?? '')) return;
  pfdSt.softkeyFlash = i;
  setTimeout(() => (pfdSt.softkeyFlash = null), 150);
  const av = sim.av;
  switch (PFD_SOFTKEYS[i]) {
    case 'INSET': av.inset = !av.inset; break;
    case 'SVT': pfdSt.svt = !pfdSt.svt; store.set('ifr.svt', pfdSt.svt); break;
    case 'BRG1': { const o = ['OFF', 'NAV1', 'GPS', 'ADF'] as const; av.bearing1 = o[(o.indexOf(av.bearing1) + 1) % o.length]; break; }
    case 'BRG2': { const o = ['OFF', 'NAV2', 'GPS', 'ADF'] as const; av.bearing2 = o[(o.indexOf(av.bearing2) + 1) % o.length]; break; }
    case 'CDI': doAction('cdi'); break;
    case 'DME': pfdSt.dmeWindow = !pfdSt.dmeWindow; break;
    case 'TMR/REF': toggleTimer(); break;
    case 'XPDR': { const o = ['STBY', 'ON', 'ALT'] as const; av.xpdrMode = o[(o.indexOf(av.xpdrMode) + 1) % 3]; break; }
    case 'IDENT': toast('IDENT — squawking ' + av.xpdr, 'info'); break;
    case 'MINS': cycleMins(); break;
  }
}
pfdCanvas.addEventListener('click', (e) => {
  if (cockpitType !== 'g1000') return;
  const p = canvasPoint(pfdCanvas, e, PFD_W, PFD_H);
  const i = softkeyAt(p.x, p.y);
  if (i !== null) pfdSoftkey(i);
});
pfdCanvas.addEventListener('wheel', (e) => {
  // wheel over the HSI adjusts heading bug, over the altimeter adjusts ALT SEL
  const p = canvasPoint(pfdCanvas, e, PFD_W, PFD_H);
  const d = e.deltaY < 0 ? 1 : -1;
  if (p.x > 760 && p.y < 470) altBy(d, e.shiftKey);
  else if (p.y > 450 && p.y < 740 && Math.abs(p.x - 512) < 160) hdgBy(d, e.shiftKey);
  else if (p.x < 240 && p.y < 470 && sim.ap.vert === 'FLC') sim.ap.iasSel += d;
  else if (p.x > 880 && p.y < 470 && sim.ap.vert === 'VS') sim.ap.vsSel += d * 100;
  else return;
  e.preventDefault();
}, { passive: false });
function mfdSoftkey(i: number) {
  if (cockpitType !== 'g1000' || DEAD_SOFTKEYS.has(MFD_SOFTKEYS[i] ?? '')) return;
  mfdSt.softkeyFlash = i;
  setTimeout(() => (mfdSt.softkeyFlash = null), 150);
  switch (MFD_SOFTKEYS[i]) {
    case 'TERRAIN': mfdSt.terrain = !mfdSt.terrain; break;
    case 'NORTH UP': mfdSt.northUp = !mfdSt.northUp; break;
    case 'DCLTR': mfdSt.declutter = (mfdSt.declutter + 1) % 3; break;
    case 'FPL': mfdSt.showFpl = !mfdSt.showFpl; break;
    case 'PROC': procModal.open(); break;
    case 'CHKLIST': showChecklist(); break;
    case 'MAP': mfdSt.rangeIdx = 4; break;
  }
}
mfdCanvas.addEventListener('click', (e) => {
  if (cockpitType !== 'g1000') return;
  const p = canvasPoint(mfdCanvas, e, MFD_W, MFD_H);
  const i = softkeyAt(p.x, p.y, MFD_H, MFD_W);
  if (i !== null) mfdSoftkey(i);
});
mfdCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  mfdSt.rangeIdx = Math.max(0, Math.min(8, mfdSt.rangeIdx + (e.deltaY > 0 ? 1 : -1)));
}, { passive: false });

// ------------------------------------------------------------------ actions
function togglePause() {
  sim.paused = !sim.paused;
  syncPauseBtn();
}
let pauseShown: boolean | null = null;
/** the Pause button follows sim.paused whoever changed it (lessons, modals, crash, replay) */
function syncPauseBtn() {
  if (pauseShown === sim.paused) return;
  pauseShown = sim.paused;
  pauseBtn.replaceChildren(icon(sim.paused ? I.play : I.pause), h('span', { class: 'lbl' }, sim.paused ? 'Resume' : 'Pause'));
  pauseBtn.title = sim.paused ? 'Resume (Esc)' : 'Pause (Esc)';
  pauseBtn.classList.toggle('on', sim.paused);
}
function setRate(r: number) {
  sim.rate = r;
  rateBtn.textContent = `${r}×`;
  rateBtn.classList.toggle('on', r !== 1);
  toast(`Sim rate ${r}×`);
}
function setOtw(m: OtwMode, announce = false) {
  otwMode = m;
  store.set('ifr.otw', m);
  cockpit.classList.toggle('big-otw', m === 'big');
  cockpit.classList.toggle('vis-otw', m === 'visual');
  cockpit.classList.toggle('no-otw', m === 'none');
  // Instruments: the top bar stays put so the panel never jumps when it would auto-hide
  if (m === 'none') chromeShow(true);
  if (announce) toast(`Layout: ${layoutName(m)}`, 'info', 2200);
  fitSoon();
}
function setQnh() {
  sim.av.baro = sim.weather.qnh;
  toast(`Altimeter ${sim.weather.qnh.toFixed(2)}`, 'good');
}
function centerCdi() {
  const n = sim.navInputs();
  if (n.cdi === 'GPS') return;
  if (n.nav.valid && !n.nav.isLoc) {
    sim.setCourse(n.nav.toFrom === 'FROM' ? n.nav.radial : n.nav.bearingTo);
    toast(`CRS ${Math.round(sim.course())}° — needle centred`);
  }
}
function toggleTimer() {
  const r = sim.chronoButton();
  toast(r === 'start' ? 'Chronometer started' : r === 'stop' ? `Chronometer stopped — ${fmtTime(sim.chrono() ?? 0)}` : 'Chronometer reset');
}
function cycleMins() {
  const ap = sim.fp.approach;
  const opts: (number | null)[] = ap ? ap.minimums.map((m) => (m.da ?? m.mda) as number) : [];
  opts.push(null);
  const i = opts.indexOf(sim.av.minimums);
  sim.av.minimums = opts[(i + 1) % opts.length];
  const label = ap?.minimums.find((m) => (m.da ?? m.mda) === sim.av.minimums)?.label;
  toast(sim.av.minimums === null ? 'Minimums off' : `Minimums ${sim.av.minimums} ${label ? '(' + label + ')' : ''}`);
}
function goAround() {
  sim.ap.disconnect();
  sim.ap.fd = true;
  sim.ap.lat = 'ROL';
  sim.ap.rollRef = 0;
  sim.ap.vert = 'PIT';
  sim.ap.pitchRef = 7;
  sim.ap.latArmed = null;
  sim.ap.apprMode = false;
  sim.ap.vertArmed = { alts: true, gs: false, gp: false };
  sim.controls.throttle = 1;
  if (sim.controls.flaps > 1) sim.controls.flaps = 1;
  if (sim.fp.approachId) {
    sim.fp.activateMissed();
    const mahp = sim.fp.wpts.find((w) => w.role === 'MAHP');
    if (mahp?.altMin) sim.ap.altSel = mahp.altMin;
    sim.setCdi('GPS');
  }
  toast('GO-AROUND: full power, pitch 7°, flaps 10. Missed approach active — press NAV, then AP.', 'warn', 6000);
}
function showChecklist() {
  const ph = sim.rec.phase(sim);
  const lists: Record<string, string> = {
    ground: 'Before takeoff: flaps 0–10 · trim T/O · transponder ALT · altimeter set · heading bug runway hdg · ALT SEL 3000',
    final: 'Before landing: fuel selector both · mixture rich · flaps as required · 90 KIAS · landing light',
    initial: 'Approach: ATIS · altimeter · approach loaded & activated · NAV tuned/identified · CRS set · minimums set · missed approach briefed',
    missed: 'Missed: power full · pitch 7° · flaps 10 then 0 · positive rate · NAV · climb to MAHP altitude',
  };
  toast(lists[ph] ?? lists.initial, 'info', 9000);
}
function openDebrief() {
  debriefShown = true;
  debrief.open();
}

function doAction(a: ButtonAction) {
  const d = sim.ac.data;
  switch (a) {
    case 'apDisc': sim.ap.disconnect(); break;
    case 'apToggle': sim.ap.toggleAp(d); break;
    case 'toga': goAround(); break;
    case 'flapsDn': sim.controls.flaps = Math.min(3, sim.controls.flaps + 1); toast(`Flaps ${sim.controls.flaps * 10}°`); break;
    case 'flapsUp': sim.controls.flaps = Math.max(0, sim.controls.flaps - 1); toast(`Flaps ${sim.controls.flaps * 10}°`); break;
    case 'cdi': sim.cycleCdi(); toast(`CDI ${sim.av.cdi === 'GPS' ? 'GPS' : sim.av.cdi + (sim.navInputs().nav.isLoc ? ' (LOC)' : ' (VOR)')}`); break;
    case 'pause': togglePause(); break;
    case 'hdgSync': sim.ap.hdgBug = Math.round(d.hdgTrue) || 360; break;
    default: break;
  }
}

// ------------------------------------------------------------------ keyboard
const HOLD_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ',', '.', '<', '>', '=', '+', '-', '_', 'PageUp', 'PageDown', 'Home', 'End', ' ']);
window.addEventListener('keydown', (e) => {
  const tgt = e.target as HTMLElement;
  if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'SELECT' || tgt.tagName === 'TEXTAREA')) return;
  if (Modal.anyOpen()) {
    if (e.key === 'Escape') Modal.closeAll();
    return;
  }
  const k = e.key;
  const d = sim.ac.data;
  if (e.shiftKey && (k === 'ArrowUp' || k === 'ArrowDown') && sim.ap.engaged) {
    sim.ap.nose(k === 'ArrowUp' ? 1 : -1);
    e.preventDefault();
    return;
  }
  if (HOLD_KEYS.has(k)) {
    input.keys.add(k);
    e.preventDefault();
    return;
  }
  if (e.ctrlKey || e.metaKey) {
    if (k === '1' || k === '2' || k === '4') { setRate(Number(k)); e.preventDefault(); }
    return;
  }
  const n = sim.navInputs();
  if (cduPanel.keydown(e)) return;
  if (k === 'F3') { cduPanel.toggle(); e.preventDefault(); return; }
  const lower = k.toLowerCase();
  if (k === 'N' && e.shiftKey) { setup.start(); e.preventDefault(); return; }
  // throttle by digit: use the physical key so AZERTY keyboards (à, &, é…) work without Shift
  const dig = /^(Digit|Numpad)([0-9])$/.exec(e.code)?.[2] ?? (/^[0-9]$/.test(k) ? k : null);
  if (dig !== null && !e.altKey) { sim.controls.throttle = dig === '0' ? 1 : Number(dig) / 10; return; }
  switch (lower) {
    case 'a': if (e.shiftKey) sim.ap.toggleFd(d); else doAction('apToggle'); break;
    case 'h': sim.ap.pressHdg(d); break;
    case 'n': sim.ap.pressNav(d, n); break;
    case 'r': sim.ap.pressApr(d, n); break;
    case 'l': sim.ap.pressAlt(d); break;
    case 'v': sim.ap.pressVs(d); break;
    case 'k': if (e.shiftKey) sim.ap.pressFlc(d); else charts.toggle(); break;
    case 'q': hdgBy(-1, e.shiftKey); break;
    case 'e': hdgBy(1, e.shiftKey); break;
    case 'w': altBy(1, e.shiftKey); break;
    case 's': altBy(-1, e.shiftKey); break;
    case 'o': sim.setCourse(sim.course() - (e.shiftKey ? 10 : 1)); break;
    case 'p': sim.setCourse(sim.course() + (e.shiftKey ? 10 : 1)); break;
    case 'c': doAction('cdi'); break;
    case 'd': if (e.shiftKey) openDebrief(); else directModal.open(); e.preventDefault(); break;
    case 'x': procModal.open(); break;
    case 'i': ios.toggle(); break;
    case 'j': learn.open(); break;
    case 'f2': fc.open(); break;
    case 'u': builder.edit(); break;
    case 'f1': toggleExplain(); e.preventDefault(); break;
    case ',': settings.open(); break;
    case 'm': toggleMute(); break;
    case 'g': goAround(); break;
    case 'b': setQnh(); break;
    case 't': toggleTimer(); break;
    case 'f': doAction(e.shiftKey ? 'flapsUp' : 'flapsDn'); break;
    case 'escape': case 'pause': togglePause(); break;
    case 'tab': setOtw(({ normal: 'big', big: 'visual', visual: 'none', none: 'normal' } as const)[otwMode], true); e.preventDefault(); break;
    case '?': case '/': help.open(); break;
    default: return;
  }
});
window.addEventListener('keyup', (e) => {
  input.keys.delete(e.key);
  // shifted variants
  if (e.key === 'Shift') input.keys.clear();
});
window.addEventListener('blur', () => input.keys.clear());

// ------------------------------------------------------------------ header / coach
const PHASE_LABEL: Record<Phase, string> = { ground: 'On ground', departure: 'Departure', enroute: 'Enroute', initial: 'Approach', final: 'Final approach', missed: 'Missed approach', landed: 'Landed' };
const AIRCRAFT: Record<CockpitType, string> = { g1000: 'C172 G1000', steam: 'C172 steam gauges', airliner: '737-800' };
/** top bar: the flight's name, and a short "airport · procedure · aircraft" descriptor (the sitbar owns flight state) */
function updateHeader() {
  const ex = lesson?.ex ?? lastLessonEx;
  const name = ex ? ex.title : sim.scenario?.name ?? 'Free flight';
  const ap = sim.fp.approach;
  const hold = lesson?.rt.hold;
  const parts: string[] = [];
  if (ap) parts.push(ap.airport, ap.name);
  else if (hold) parts.push(`Hold at ${hold.fix.ident}`);
  else if (!ex && sim.scenario?.kind) parts.push(sim.scenario.kind);
  parts.push(AIRCRAFT[cockpitType]);
  const sub = parts.join(' · ');
  setText(scnName, name);
  setText(scnSub, sub);
  const full = `${name} — ${ex ? ex.summary : sim.scenario?.description ?? sub}`;
  if (cached(scnBtn, 'title', full)) scnBtn.title = `${full}\nClick: restart, end or plan a new flight`;
}
let coachKey = '';
let sitKey = '';
function updateSitbar() {
  const d = sim.ac.data;
  const g = sim.fp.out;
  const ph = sim.rec.phase(sim);
  const to = g.valid ? sim.fp.wpts[sim.fp.active] : null;
  const alt = Math.round(sim.indicatedAlt());
  const sel = sim.ap.altSel;
  const altDiff = sel - alt;
  const imc = inCloud(sim);
  const hw = Math.round(d.headwindKt);
  const xw = Math.round(d.crosswindKt);
  const gust = sim.weather.gustKt > sim.weather.windKt ? `G${Math.round(sim.weather.gustKt)}` : '';
  const mins = sim.av.minimums;
  const cells: [string, string, string][] = [
    ['Phase', sim.replaying ? 'Replay' : sim.ac.s.crashed ? 'Crashed' : sim.paused ? 'Paused' : PHASE_LABEL[ph], sim.ac.s.crashed ? 'bad' : sim.replaying ? 'warn' : sim.paused ? 'paused' : ''],
    ['Next', to ? `${g.holding ? 'HOLD ' : ''}${to.ident}${to.altMin ? ` ≥${to.altMin}` : ''} · ${g.distNm.toFixed(1)} NM${g.eteMin !== null ? ` · ${fmtTime(g.eteMin * 60)}` : ''}` : 'no flight plan', 'mag'],
    ['Altitude', `${alt} ft → ${sel}${Math.abs(altDiff) > 100 ? ` (${altDiff > 0 ? '+' : ''}${altDiff})` : ' ✓'}`, Math.abs(altDiff) > 100 ? '' : 'good'],
    sim.ac.s.onGround
      ? ['Surface wind', `${String(Math.round(sim.weather.windDir)).padStart(3, '0')}°/${Math.round(sim.weather.windKt)}${gust} · ${hw >= 0 ? 'HW' : 'TW'} ${Math.abs(hw)} · XW ${Math.abs(xw)}${xw >= 0 ? 'R' : 'L'}`, Math.abs(xw) > 15 || hw < -5 ? 'warn' : '']
      : ['Wind at aircraft', `${String(Math.round(d.windDir) || 360).padStart(3, '0')}°/${Math.round(d.windKt)} · ${hw >= 0 ? 'HW' : 'TW'} ${Math.abs(hw)} · XW ${Math.abs(xw)}${xw >= 0 ? 'R' : 'L'} · drift ${Math.abs(Math.round(d.driftDeg))}°${d.driftDeg >= 0 ? 'R' : 'L'}`, Math.abs(xw) > 15 || hw < -5 ? 'warn' : ''],
    ['Minimums', mins === null ? '—' : `${mins} · ${alt - mins >= 0 ? '+' : ''}${alt - mins} ft`, mins === null ? 'dim' : alt < mins ? 'warn' : ''],
    ['Conditions', imc ? 'IMC' : 'VMC', imc ? 'imc' : 'good'],
  ];
  const key = cells.map((c) => c[1]).join('|');
  if (key === sitKey) return;
  sitKey = key;
  sitbar.innerHTML = '';
  for (const [k, v, cls] of cells) sitbar.append(h('div', { class: `sb ${cls}` }, h('small', {}, k), h('b', {}, v)));
  sitbar.append(h('div', { class: 'sb-fill' }));
  pauseVeil.classList.toggle('on', sim.paused && !sim.ac.s.crashed);
}
/** lesson panel: hint and step list behind "Details" when the space for the panel is short */
let coachDetails = store.get('ifr.coachDetails', false);
/** the lesson panel folds to its header and the current instruction (never to a bare pill) */
let coachCollapsed = store.get('ifr.coachCollapsed', false);
function setCoachCollapsed(on: boolean) {
  coachCollapsed = on;
  store.set('ifr.coachCollapsed', on);
  coachKey = '';
  updateCoach();
}
const foldBtn = (collapsed: boolean, fn: () => void, what: string) => h('button', { class: 'coach-fold', type: 'button', 'aria-expanded': String(!collapsed), 'aria-label': collapsed ? `Expand ${what}` : `Collapse ${what}`, title: collapsed ? `Expand ${what}` : `Collapse ${what}`, onclick: fn }, svgIcon(collapsed ? I.chevDown : I.chevUp, 15));
let coachTimer: HTMLElement | null = null;
const coachBtn = (label: string, fn: () => void, cls = '', title = '') => h('button', { class: `btn ${cls}`, type: 'button', title: title || label, onclick: fn }, label);
function updateCoach() {
  updateSitbar();
  updateHeader();
  syncPauseBtn();
  if (lesson) {
    const run = lesson;
    const st = run.step;
    if (st && run.idx !== lastAtcStep) {
      lastAtcStep = run.idx;
      if (ATC_LIKE.test(st.text) && !(run.idx === 0 && run.rt.clearance)) atc.say(st.text.replace(/\.$/, ''));
    }
    const ctx = run.ctx(0);
    const ro = st?.readout ? st.readout(ctx) : '';
    if (coachTimer) setText(coachTimer, fmtTime(run.totalT));
    const key = `lesson|${run.idx}|${run.currentViolation}|${ro}|${!!run.finished}|${coachDetails}|${coachCollapsed}`;
    if (key === coachKey) return;
    coachKey = key;
    coach.innerHTML = '';
    coach.classList.add('lesson');
    coach.classList.remove('empty', 'min');
    coach.classList.toggle('details', coachDetails);
    coach.classList.toggle('collapsed', coachCollapsed);
    const ride = sim.assess.mode === 'checkride';
    const n = run.rt.steps.length;
    coachTimer = h('span', { class: 'coach-time', title: 'Exercise time' }, fmtTime(run.totalT));
    coach.append(
      h('h4', { class: 'coach-k' },
        h('span', { class: 'coach-step' }, run.finished ? 'Exercise complete' : n > 1 ? `Step ${run.idx + 1} of ${n}` : 'Exercise'),
        h('span', { class: 'coach-fill' }),
        coachTimer,
        foldBtn(coachCollapsed, () => setCoachCollapsed(!coachCollapsed), 'the lesson panel'),
      ),
    );
    if (n > 1) coach.append(h('div', { class: 'coach-prog', role: 'progressbar', 'aria-label': 'Exercise progress', 'aria-valuemin': 0, 'aria-valuemax': n, 'aria-valuenow': run.idx }, h('i', { style: `width:${Math.round(((run.finished ? n : run.idx) / n) * 100)}%` })));
    coach.append(h('div', { class: 'next' }, st ? st.text : run.finished ? 'Complete' : ''));
    if (run.currentViolation && !ride) coach.append(h('div', { class: 'viol' }, svgIcon(I.warning, 14), h('span', {}, run.currentViolation)));
    if (coachCollapsed) return;
    if (ro) coach.append(h('div', { class: 'ro' }, ro));
    const more = h('div', { class: 'coach-more' });
    if (st?.hint && !ride) more.append(h('div', { class: 'hint' }, st.hint));
    if (n > 1) {
      const others = run.rt.steps.map((x, i) => ({ x, i })).filter(({ i }) => i !== run.idx);
      more.append(h('ol', { class: 'steps', 'aria-label': 'Other steps' }, ...others.map(({ x, i }) => h('li', { class: i < run.idx ? 'ok' : 'todo' }, i < run.idx ? svgIcon(I.check, 13) : h('i', { class: 'dot' }), h('span', {}, x.text)))));
    }
    const hasMore = more.childElementCount > 0;
    if (hasMore) coach.append(more);
    coach.append(h('div', { class: 'acts' },
      hasMore ? coachBtn(coachDetails ? 'Hide details' : 'Details', () => { coachDetails = !coachDetails; store.set('ifr.coachDetails', coachDetails); updateCoach(); }, 'coach-more-btn', 'Show the hint and the other steps') : null,
      h('span', { class: 'acts-sp' }),
      run.ex.plate ? coachBtn('Plate', () => { charts.toggle(true); charts.show(run.ex.plate!); }, '', 'Open the approach plate in the EFB') : null,
      coachBtn('Restart', () => pickExercise(run.ex, lessonPath), '', 'Restart this exercise from the briefing'),
      coachBtn('End', () => { if (confirm('End lesson and see debrief?')) endFlight(); }, 'danger', 'End the exercise and see the result'),
    ));
    return;
  }
  coachTimer = null;
  const d = sim.ac.data;
  const ph = sim.rec.phase(sim);
  coach.classList.remove('lesson');
  if (sim.assess.mode === 'checkride') {
    const fails = Object.values(sim.failures).some(Boolean);
    const key = `ride|${sim.ac.s.crashed}|${sim.paused}|${fails}`;
    if (key !== coachKey) {
      coachKey = key;
      coach.innerHTML = '';
      coach.append(h('h4', {}, 'Checkride in progress'), h('div', { class: 'next' }, sim.assess.student || 'Applicant'), h('ul', {}, h('li', {}, 'No coaching. Fly as briefed — the evaluator is recording.'), h('li', {}, 'Shift+D opens the report at any time.')));
    }
    return;
  }

  const fp = sim.fp;
  const g = fp.out;
  const to = fp.wpts[fp.active];
  let next = '';
  const hints: string[] = [];
  if (sim.ac.s.crashed) {
    next = 'Flight ended';
    hints.push('Your debrief is ready. Press Shift+D or fly it again.');
  } else if (ph === 'ground' && !sim.rec.touchdown) {
    next = 'Ready for departure';
    hints.push('Full throttle: key 0, PageUp or drag the THROTTLE lever. At 55 KIAS hold ↓ (pull) to rotate to ~8° nose-up.', 'Climb at 74 KIAS (Vy). AP: HDG + VS at 1000 ft AGL.');
  } else if (ph === 'landed') {
    next = d.gsKt > 2 ? 'Rollout — brakes (Space)' : 'Stopped. Nice work.';
    hints.push('Debrief opens automatically when you stop.');
  } else if (g.valid && to) {
    const ete = g.eteMin !== null ? ` · ${fmtTime(g.eteMin * 60)}` : '';
    next = `${g.holding ? 'Holding at' : 'Next'} <em>${to.ident}</em>${to.altMin ? ` · ≥ ${to.altMin} ft` : ''} · ${g.distNm.toFixed(1)} nm${ete}`;
    const ap = fp.approach;
    if (ap && !fp.approachActive) hints.push('Approach loaded but not active — ACT on the MFD bezel, or Procedures.');
    if (ap && fp.approachActive && !fp.missedActive) {
      const navBased = ap.type === 'ILS' || ap.type === 'LOC' || ap.type === 'LOCBC' || ap.type === 'VOR' || ap.type === 'LDA';
      const faf = fp.wpts.find((x) => x.role === 'FAF' && x.appr === 'final');
      const dFaf = faf ? distanceNm(sim.ac.s, faf) : 99;
      if (navBased && sim.av.cdi === 'GPS' && dFaf < 12) hints.push(`Switch the CDI to ${ap.type === 'VOR' ? 'VOR1' : 'LOC1'} before the FAF (C key).`);
      if (ap.type === 'NDB' && sim.av.bearing1 !== 'ADF') hints.push('Set BRG1 to ADF (PFD softkey) to see the NDB needle.');
      if (sim.ap.engaged && !sim.ap.apprMode && dFaf < 15 && (ap.gsAngle || navBased)) hints.push('Press APR to arm the approach mode.');
      if (to.altMin && sim.indicatedAlt() > to.altMin + 300 && g.distNm < 6 && ph === 'initial') hints.push(`Descend: you are ${Math.round(sim.indicatedAlt() - to.altMin)} ft above the ${to.ident} crossing altitude.`);
      if (ph === 'final') {
        const mins = sim.av.minimums;
        if (mins !== null) {
          const above = Math.round(sim.indicatedAlt() - mins);
          hints.push(above > 0 ? `Minimums ${mins}: ${above} ft to go.` : 'AT MINIMUMS — runway in sight? Land. Otherwise go around (G).');
        }
        if (d.iasKt > 105) hints.push('Fast: reduce power, target 90 KIAS.');
        if (d.flapsDeg < 5 && d.aglFt < 1200) hints.push('Configure: flaps 10 (F).');
      }
      if (Math.abs(wrap180(sim.av.baro - sim.weather.qnh)) > 0.005) hints.push(`Altimeter not set (QNH ${sim.weather.qnh.toFixed(2)}) — press B.`);
    }
    if (fp.missedActive) hints.push('Climb to the missed approach altitude, then NAV + AP to fly the hold.');
    if (g.suspended) hints.push('SUSP at the MAP — press G / MISSED to sequence the missed approach.');
  } else {
    next = 'No flight plan';
    hints.push('Press D for Direct-To, or Procedures to load an approach.');
  }
  if (d.stallWarn) hints.unshift('STALL WARNING — lower the nose, add power!');
  if (sim.paused && !sim.ac.s.crashed) hints.unshift('Paused — Esc to resume.');
  const key = next + hints.join('|');
  if (key === coachKey) return;
  coachKey = key;
  coach.innerHTML = '';
  const isMin = coach.classList.contains('min');
  const minBtn = foldBtn(isMin, () => { coach.classList.toggle('min'); store.set('ifr.coachMin', coach.classList.contains('min')); coachKey = ''; updateCoach(); }, 'the coach tips');
  const shown = hints.filter((t) => !t.startsWith('Paused'));
  coach.classList.toggle('empty', shown.length === 0);
  coach.classList.remove('details', 'collapsed');
  coach.append(h('h4', { class: 'coach-k' }, h('span', { class: 'coach-step' }, 'Coach'), h('span', { class: 'coach-title' }, 'What to do now'), minBtn));
  if (shown.length) coach.append(h('ul', {}, ...shown.slice(0, 4).map((t) => h('li', {}, t))));
  void next;
}

// ------------------------------------------------------------------ loop
let last = performance.now();
let coachAcc = 0;
let lastTouchdown: unknown = null;
let lastLessonEx: Exercise | null = null;
// crash screen: a clear way out (retry / debrief / new flight / Flight Center)
const crashVeil = h('div', { class: 'crash-veil', role: 'alertdialog', 'aria-label': 'Crash' });
let crashShown = '';
function showCrash(reason: string) {
  crashShown = reason;
  if (!crashVeil.isConnected) document.body.append(crashVeil);
  crashVeil.innerHTML = '';
  crashVeil.append(
    h('div', { class: 'crash-card' },
      h('div', { class: 'crash-k' }, 'Flight ended'),
      h('h2', {}, reason),
      h('p', {}, 'Review what happened in the debrief, or go again.'),
      h('div', { class: 'crash-acts' },
        h('button', { class: 'btn primary', onclick: () => restartFlight() }, 'Retry this flight'),
        h('button', { class: 'btn', onclick: () => { hideCrash(); openDebrief(); } }, 'Debrief'),
        h('button', { class: 'btn', onclick: () => { hideCrash(); setup.start(); } }, 'Plan a new flight'),
        h('button', { class: 'btn ghost', onclick: () => { hideCrash(); fc.open(); } }, 'Flight Center'),
      ),
    ),
  );
  crashVeil.classList.add('open');
}
function hideCrash() {
  crashShown = '';
  crashVeil.classList.remove('open');
}
let lastAtcStep = -1;
/** lesson steps that read as ATC instructions are transmitted on the radio */
const ATC_LIKE = /^(fly|turn|climb|descend|maintain|cleared|hold|proceed|intercept|join|expect|contact|cross|reduce|increase|go around|track|enter)\b/i;
let cduTick = 0;
let apKeyCache: HTMLElement[] = [];
// change-checked DOM writes (the frame loop runs 60×/s; unchanged writes still invalidate style)
const domCache = new WeakMap<Element, Record<string, string>>();
function cached(el: Element, k: string, v: string): boolean {
  let c = domCache.get(el);
  if (!c) domCache.set(el, (c = {}));
  if (c[k] === v) return false;
  c[k] = v;
  return true;
}
function setText(el: HTMLElement, v: string) {
  if (cached(el, '#t', v)) el.textContent = v;
}
function setCss(el: HTMLElement, prop: string, v: string) {
  if (!cached(el, prop, v)) return;
  if (prop.startsWith('--')) el.style.setProperty(prop, v);
  else (el.style as unknown as Record<string, string>)[prop] = v;
}
function setClass(el: Element, cls: string, on: boolean) {
  if (cached(el, '.' + cls, on ? '1' : '0')) el.classList.toggle(cls, on);
}
function setProp(el: HTMLInputElement, k: 'value', v: string) {
  if (el[k] !== v) el[k] = v;
}
/** per-section frame timings (ms, exponential average) — window.__ifr.perf */
const perf: Record<string, number> = {};
let perfT = 0;
const mark = (k: string) => {
  const t = performance.now();
  perf[k] = (perf[k] ?? 0) * 0.95 + (t - perfT) * 0.05;
  perfT = t;
};
let frameErr = '';
/** the render loop must survive any exception (a stale reference after a region change, a bad datum…):
 *  one failing frame is logged once, the next frame runs normally */
function frame(now: number) {
  try {
    frameBody(now);
  } catch (e) {
    const msg = String((e as Error)?.stack ?? e);
    if (msg !== frameErr) {
      frameErr = msg;
      console.error('frame', e);
    }
    last = now;
  }
  requestAnimationFrame(frame);
}
function frameBody(now: number) {
  perfT = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (intro.isOpen) return; // the start page covers everything: no sim, no drawing
  if (sim.ac.s.crashed && !crashShown && !sim.replaying) showCrash(sim.ac.s.crashed);
  if (!sim.ac.s.crashed && crashShown) hideCrash();
  // touchdown feedback (rate, g, speed, position on the runway)
  const tdn = sim.ac.touchdown;
  if (tdn && tdn !== lastTouchdown && !sim.replaying) {
    lastTouchdown = tdn;
    const rep = assessTouchdown(tdn, sim.ac.data.hdgTrue);
    if (rep) sim.rec.log(sim.time, rep.tone, rep.text); // logged in the debrief and toasted
  }
  const override = input.update(dt, sim.controls, sim.ap.ap && !sim.paused);
  if (override) {
    sim.ap.disconnect();
    toast('Autopilot disconnected — control input', 'warn');
  }
  if (replay) {
    if (replay.playing) {
      replay.pos = Math.min(replay.samples.length - 1, replay.pos + (dt * replay.speed) / 0.5);
      if (replay.pos >= replay.samples.length - 1) replay.playing = false;
    }
    applyReplay();
    sim.updateAvionics(0);
  } else sim.step(dt);
  mark('sim');
  if (lesson && !sim.paused) {
    lesson.update(Math.min(0.1, dt) * sim.rate);
  }
  if (lesson?.finished && !lessonResult.isOpen && !Modal.anyOpen()) {
    const run = lesson;
    lesson = null;
    sim.paused = true;
    lessonResult.show(run, lessonPath);
  }

  // auto debrief at the end of a flight
  if (!debriefShown && !sim.ac.s.crashed && sim.rec.touchdown && sim.ac.s.onGround && sim.ac.data.gsKt < 2) {
    endTimer += dt;
    if (endTimer > 1.5) openDebrief();
  }

  const otwH = otw.clientHeight;
  if (otwH > 10 && outside) {
    const rect = glCanvas.getBoundingClientRect();
    const key = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
    if (glCanvas.dataset.size !== key) {
      glCanvas.dataset.size = key;
      outside.resize(rect.width, rect.height);
    }
    // ease the view back to centre when not dragging
    if (!otw.matches(':active')) {
      outside.lookYaw *= 0.995;
      outside.lookPitch *= 0.995;
    }
    outside.render(sim, now / 1000);
    mark('outside3d');
  } else if (otwH > 10) {
    const octx = otwCanvas.getContext('2d')!;
    const rect = otwCanvas.getBoundingClientRect();
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const W = Math.round(rect.width * dpr);
    const Hh = Math.round(rect.height * dpr);
    if (otwCanvas.width !== W || otwCanvas.height !== Hh) {
      otwCanvas.width = W;
      otwCanvas.height = Hh;
    }
    octx.setTransform(1, 0, 0, 1, 0, 0);
    drawOtw(octx, sim, W, Hh, now / 1000);
    mark('outside2d');
  }
  fitCanvas(pfdCanvas, PFD_W, PFD_H);
  fitCanvas(mfdCanvas, MFD_W, MFD_H);
  const lctx = pfdCanvas.getContext('2d')!;
  const rctx = mfdCanvas.getContext('2d')!;
  if (cockpitType === 'steam') {
    drawSixPack(lctx, sim, sim.paused ? 0 : dt);
    drawStack(rctx, sim);
  } else if (cockpitType === 'airliner') {
    drawAirlinerPfd(lctx, sim);
    drawNd(rctx, sim, mfdRange(mfdSt));
    setText(mcpSpd.v, sim.ap.iasSel > 0 ? String(Math.round(sim.ap.iasSel)) : '---');
    setText(mcpHdg.v, String(sim.ap.hdgBug).padStart(3, '0'));
    setText(mcpAlt.v, String(sim.ap.altSel));
    setText(mcpVs.v, sim.ap.vert === 'VS' ? `${sim.ap.vsSel > 0 ? '+' : ''}${sim.ap.vsSel}` : '');
    const a = sim.ap;
    const lit: Record<string, boolean> = { FD: a.fd, AP: a.ap, FLC: a.engaged && a.vert === 'FLC', LNAV: a.engaged && (a.lat === 'GPS' || a.latArmed === 'GPS'), VORLOC: a.engaged && (['VOR', 'LOC', 'BC'].includes(a.lat) || ['VOR', 'LOC', 'BC'].includes(a.latArmed ?? '')), APR: a.apprMode, HDG: a.engaged && a.lat === 'HDG', ALT: a.engaged && a.vert === 'ALT', VS: a.engaged && a.vert === 'VS' };
    for (const b of mcpKeys) setClass(b, 'on', !!lit[b.dataset.mcp!]);
  } else {
    drawPfd(lctx, sim, pfdSt, sim.paused ? 0 : dt);
    mark('pfd');
    drawMfd(rctx, sim, mfdSt);
    mark('mfd');
  }
  charts.update();
  ios.update(dt);
  audio.update(sim, dt);
  updateChrono();
  if ((cduTick = (cduTick + 1) % 15) === 0) cduPanel.tick();
  connect.link.update(sim, dt);
  mark('misc');

  // pedestal — every write goes through a change check so an idle panel costs no style/paint work
  const ctl = sim.controls;
  const thrV = Math.round(ctl.throttle * 100);
  if (!thrDragging) setProp(thr, 'value', String(thrV));
  setCss(thr, '--v', `${thrV}%`);
  setText(thrPct, `${thrV}%`);
  setText(thrRpm, `${Math.round(sim.ac.data.rpm / 10) * 10} RPM`);
  flapBtns.forEach((b, i) => setClass(b, 'on', Math.round(ctl.flaps) === i));
  setCss(flapNeedle, 'left', `${((sim.ac.data.flapsDeg / 30) * 75 + 12.5).toFixed(1)}%`);
  setCss(trimWheel, '--t', `${Math.round(ctl.trim * 220)}px`);
  setCss(trimMark, 'left', `${(50 + ctl.trim * 50).toFixed(1)}%`);
  if (!stick.classList.contains('active')) {
    setCss(stickDot, 'left', `${(50 + Math.max(-1, Math.min(1, ctl.aileron)) * 42).toFixed(1)}%`);
    setCss(stickDot, 'top', `${(50 + Math.max(-1, Math.min(1, ctl.elevator)) * 42).toFixed(1)}%`);
  }
  setCss(rudderBar.firstChild as HTMLElement, 'left', `${(50 + Math.max(-1, Math.min(1, ctl.rudder)) * 46).toFixed(1)}%`);
  setClass(brakeLight, 'on', ctl.brake > 0.1);
  const joy = input.current();
  setClass(joyDot, 'on', !!joy);
  setText(joyLbl, joy ? joy.id.split('(')[0].trim().slice(0, 22) || 'Joystick' : 'Keyboard');
  if (!apKeyCache.length || !apKeyCache[0].isConnected) apKeyCache = [...pfdBezel.querySelectorAll<HTMLElement>('[data-ap]')];
  const ap = sim.ap;
  for (const b of apKeyCache) {
    const l = b.dataset.ap;
    const on = (l === 'AP' && ap.ap) || (l === 'FD' && ap.fd) || (l === 'HDG' && ap.engaged && ap.lat === 'HDG') || (l === 'ALT' && ap.engaged && ap.vert === 'ALT') || (l === 'NAV' && ap.engaged && (['GPS', 'VOR', 'LOC'].includes(ap.lat) || !!ap.latArmed)) || (l === 'APR' && ap.apprMode) || (l === 'BC' && ap.lat === 'BC') || (l === 'VS' && ap.engaged && ap.vert === 'VS') || (l === 'FLC' && ap.engaged && ap.vert === 'FLC');
    setClass(b, 'on', !!on);
  }
  coachAcc += dt;
  if (coachAcc > 0.25) {
    coachAcc = 0;
    updateCoach();
  }
  mark('dom');
}

// test/automation hook
(window as unknown as { __ifr: unknown }).__ifr = { sim, get outside() { return outside; }, thr27: runway('PARD', '27').threshold, charts: (id: string) => chartIndex().find((c) => c.id === id)?.render() ?? '', world: () => import('./nav/world'), lesson: (id: string) => pickExercise(exercise(id), null), perf };

// ------------------------------------------------------------------ boot
setOtw(otwMode);
setCockpit(cockpitType, false);
requestAnimationFrame(() => setTimeout(() => void initOutside(), 50));
// keep the bezel controls inside the bezel whatever the window size: ONE scale for every side column of
// both bezels (PFD and MFD knobs and keys are always the same size), plus a few sizes the CSS lays out with
function fitSides() {
  const sides = [...panel.querySelectorAll<HTMLElement>('.bezel .side')].filter((x) => x.offsetParent !== null);
  for (const side of sides) side.style.zoom = '1';
  let k = 1;
  for (const side of sides) {
    const avail = (side.parentElement as HTMLElement).clientHeight - 26;
    const need = side.scrollHeight;
    if (need > avail && avail > 50) k = Math.min(k, avail / need);
  }
  k = Math.max(0.55, Math.round(k * 100) / 100);
  for (const side of sides) side.style.zoom = k < 1 ? String(k) : '';
  cockpit.style.setProperty('--bz-scale', String(k));
  cockpit.style.setProperty('--pfd-w', `${pfdBezel.offsetWidth}px`);
  cockpit.style.setProperty('--pfd-h', `${pfdBezel.offsetHeight}px`);
  document.body.style.setProperty('--ped-h', `${footer.offsetHeight}px`);
  // the lesson panel shows its hint and steps behind "Details" when its space is short
  const room = otwMode === 'none' ? 0 : otwMode === 'visual' ? otw.clientHeight - pfdBezel.offsetHeight - 150 : otw.clientHeight - 120;
  cockpit.classList.toggle('coach-compact', room < 300);
}
let fitRaf = 0;
function fitSoon() {
  cancelAnimationFrame(fitRaf);
  fitRaf = requestAnimationFrame(() => fitSides());
}
new ResizeObserver(fitSoon).observe(panel);
new ResizeObserver(fitSoon).observe(otw);
window.addEventListener('resize', fitSoon);
setTimeout(fitSides, 100);
updateHeader();
updateCoach();
requestAnimationFrame(frame);
if (introWanted()) intro.show();
else fc.open();
// shared circuit: #circuit=<base64>
if (location.hash.startsWith('#circuit=')) {
  try {
    const c = decodeCircuit(location.hash.slice(9));
    Modal.closeAll();
    flyCircuit(c);
    toast(`Shared circuit: ${c.name}`, 'good');
  } catch {
    toast('This circuit link is invalid', 'bad');
  }
}
// deep link: ?scenario=ils27-vtf&wx=mins
{
  const q = new URLSearchParams(location.search);
  const sc = SCENARIOS.find((s) => s.id === q.get('scenario'));
  if (sc) {
    Modal.closeAll();
    startScenario(sc, WX_PRESETS.find((w) => w.id === q.get('wx')) ?? WX_PRESETS[0]);
  }
}
