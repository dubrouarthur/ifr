import './styles.css';
// per-area overrides (src/styles/*.css) — a separate module so they load AFTER the base stylesheet
// (Vite hoists import.meta.glob imports to the top of the module that contains them)
import './styles/load';
import { FlightPlan } from './nav/flightplan';
import { Sim, SCENARIOS, type Scenario } from './sim/sim';
import { InputManager, KB_SENSITIVITY, type ButtonAction } from './sim/input';
import { drawPfd, newPfdState, PFD_W, PFD_H, softkeyAt, PFD_SOFTKEYS } from './avionics/pfd';
import { drawMfd, newMfdState, MFD_W, MFD_H, MFD_SOFTKEYS } from './avionics/mfd';
import { drawOtw, inCloud } from './avionics/otw';
import type { Outside3D, TimeOfDay, Quality } from './avionics/outside3d';
// type only: the camera module pulls three.js, which stays in the lazily loaded 3D chunk
import type { ViewMode } from './avionics/cameras';
import { drawSixPack, drawStack } from './avionics/steam';
import { drawAirlinerPfd, drawNd } from './avionics/airliner';
import { mfdRange, fmsKey, fmsView, type FmsKey } from './avionics/mfd';
import { fitCanvas } from './avionics/draw';
import { h, store, fmtTime } from './ui/dom';
import { knob, bkey, autoRepeat, openSteps, closeSteps, installLongPressTips, type StepRow } from './ui/knob';
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
import { exercise, PATHS, type Path } from './train/curriculum';
import type { AssessSettings } from './sim/sim';
import { Launcher, ProcModal, DirectModal, JoystickModal, DebriefModal, HelpModal, Modal, WX_PRESETS, type WxPreset } from './ui/modals';
import { distanceNm, wrap180 } from './nav/geo';
import { runway } from './nav/data';
import { assessTouchdown } from './sim/landing';
import { currentRegion, leaveRealWorld, toReal } from './nav/world';
import { chartIndex } from './plates/plates';
import type { Phase } from './sim/recorder';
import type { SetupItem } from './train/setupAssist';
import { FAILURE_LABELS } from './sim/sim';
import type { RemoteCommand, RemoteSnapshot } from './connect/remoteTypes';
import type { RemoteHostApi } from './connect/remoteLink';
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
// ------------------------------------------------------------------ touch / tablet
/** a touch-first device (iPad, Android tablet): bigger targets, the autopilot bar, step pads, long-press tips.
 *  iPadOS reports itself as a Mac: a Mac with a multi-touch screen is an iPad. */
const isTouchDevice = (): boolean =>
  matchMedia('(hover: none) and (pointer: coarse)').matches || (navigator.maxTouchPoints > 1 && /Macintosh|iPad/.test(navigator.userAgent));
let touchUi = isTouchDevice();
document.body.classList.toggle('touch', touchUi);
installLongPressTips();
/** audio (and speech) can only start inside a user gesture: on iOS that has to be a touchend / click */
function unlockAudio() {
  audio.start();
  try {
    if ('speechSynthesis' in window && !audio.muted) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  } catch { /* speech unavailable */ }
  for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.removeEventListener(ev, unlockAudio, true);
}
for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(ev, unlockAudio, true);
// the first finger on a hybrid laptop switches the touch layout on
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch' || touchUi) return;
  touchUi = true;
  document.body.classList.add('touch');
  if (!store.get<boolean | null>('ifr.afcsBar', null)) setAfcsBar(true, false);
  fitSoon();
}, true);
// no pinch / double-tap zoom on the cockpit (Safari ignores user-scalable=no; its gesture events can be cancelled)
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => { if ((e.target as Element | null)?.closest?.('.cockpit, .pedestal, .topbar, .afcs')) e.preventDefault(); }, { passive: false });

// ------------------------------------------------------------------ toasts
const toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
const modalToasts = h('div', { class: 'toasts toasts-top', 'aria-live': 'polite' });
document.body.append(modalToasts);
let proMode = store.get('ifr.pro', false);
document.body.classList.toggle('pro', proMode);
function toast(msg: string, kind: 'info' | 'good' | 'warn' | 'bad' = 'info', ms = 3800) {
  if (proMode && (kind === 'info' || kind === 'good') && !/FAILURE|CRASH/.test(msg)) return;
  const t = h('div', { class: `toast ${kind}` }, msg);
  // with a window open (Flight Center, builder…) the cockpit's toasts sit under its backdrop: show it above
  const host = Modal.anyOpen() ? modalToasts : toasts;
  host.append(t);
  while (host.children.length > 4) host.firstChild?.remove();
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
  flyCircuit: (c) => { if (c.world === 'real') builder.edit(c); else { backToTraining(); flyCircuit(c); } },
  planFlight: (t, world) => setup.start(t, world),
  pairInstructor: () => void pairInstructor(),
  openInstructor: () => ios.toggle(true),
  openConnections: () => connect.open(),
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
/** full-screen start page at launch: its one action opens the Flight Center, the single place every flight starts */
const intro = new Intro({
  enter: () => {
    fc.open();
    // "Start a flight" is ready: one more Enter plans a flight
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.modal.fc .fc-go')?.focus({ preventScroll: true }));
  },
});
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
  updateCoach(); // the panel shows the first step at once, not on the next coach tick
  maybeTour();
  chromeAfterStart();
}
const help = new HelpModal();
const cduPanel = new CduPanel(sim);
document.body.append(cduPanel.el);
const charts = new ChartsDrawer(sim);
const ios = new InstructorDrawer(sim, (m, k) => toast(m, k ?? 'info'));
ios.onBuilder = () => builder.edit();
ios.onPair = () => void pairInstructor();

function startScenario(sc: Scenario, wx: WxPreset, a: AssessSettings = launcher.assess) {
  hideCrash();
  lesson = null;
  lastLessonEx = null;
  // a new flight starts with a quiet radio: no transmission of the previous flight stays on screen
  atc.clear();
  lastAtcStep = -1;
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
const layoutBtn = h('button', { class: 'btn', title: 'Screen layout (Tab) and outside view (V)', 'aria-haspopup': 'menu', onclick: (e: Event) => { e.stopPropagation(); renderLayoutMenu(); layoutMenu.classList.toggle('open'); } }, icon(I.layout), h('span', { class: 'lbl' }, 'Layout'));
function renderLayoutMenu() {
  layoutMenu.innerHTML = '';
  layoutMenu.append(menuHead('Screen layout'));
  for (const [m, t, d] of LAYOUTS)
    layoutMenu.append(h('button', { class: `menu-item layout-item${otwMode === m ? ' on' : ''}`, role: 'menuitemradio', 'aria-checked': String(otwMode === m), onclick: () => { layoutMenu.classList.remove('open'); setOtw(m); } }, h('i', { class: `lay-ic lay-${m}` }), h('span', {}, h('b', {}, t), h('small', {}, d))));
  // exterior cameras exist only with the 3D outside view
  if (!outside) return;
  layoutMenu.append(
    h('div', { class: 'menu-h view-h', role: 'presentation' }, h('span', {}, 'Outside view'), h('kbd', {}, 'V')),
    h('div', { class: 'view-seg', role: 'radiogroup', 'aria-label': 'Outside view' },
      ...viewList.map((v) => h('button', { type: 'button', role: 'radio', class: viewMode === v ? 'on' : '', 'aria-checked': String(viewMode === v), title: VIEW_HINT[v], onclick: (e: Event) => { e.stopPropagation(); setView(v); renderLayoutMenu(); } }, viewNames[v]))),
  );
}
// ------------------------------------------------------------------ exterior views (Cockpit / Chase / Orbit / Tower / Fly-by)
/** the list and names come from the 3D module once it is loaded (outside3d re-exports them); these are the defaults */
let viewList: readonly ViewMode[] = ['cockpit', 'chase', 'orbit', 'tower', 'flyby'];
let viewNames: Record<ViewMode, string> = { cockpit: 'Cockpit', chase: 'Chase', orbit: 'Orbit', tower: 'Tower', flyby: 'Fly-by' };
const VIEW_HINT: Record<ViewMode, string> = {
  cockpit: 'From the pilot seat — drag to look around',
  chase: 'Behind the aircraft — drag to move the camera, pinch or scroll to zoom',
  orbit: 'Around the aircraft — drag to orbit, pinch or scroll to zoom',
  tower: 'From the control tower of the nearest airport',
  flyby: 'A fixed camera ahead on the flight path, the aircraft flies past',
};
let viewMode: ViewMode = store.get<ViewMode>('ifr.view', 'cockpit');
if (!viewList.includes(viewMode)) viewMode = 'cockpit';
function setView(v: ViewMode, announce = false) {
  if (!viewList.includes(v)) return;
  viewMode = v;
  store.set('ifr.view', v);
  outside?.setView(v);
  syncView();
  if (announce) toast(`View: ${viewNames[v]}`, 'info', 1800);
}
function cycleView(dir: 1 | -1) {
  if (!outside) return;
  const i = viewList.indexOf(viewMode);
  setView(viewList[(i + dir + viewList.length) % viewList.length], true);
}
function syncView() {
  const ext = viewMode !== 'cockpit';
  otw.classList.toggle('ext-view', ext);
  if (ext) lookHint.classList.remove('show');
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
const afcsSw = h('i', { class: 'sw', 'aria-hidden': 'true' });
const afcsItem = h('button', { class: 'menu-item', role: 'menuitemcheckbox', 'aria-checked': 'false', title: 'Big autopilot keys and − / + buttons for heading, altitude, course, baro and minimums — for touch screens and flying without a mouse', onclick: () => { setAfcsBar(!afcsBar); toast(afcsBar ? 'Autopilot bar on: tap − / + to set heading, altitude, course; tap a value for more steps' : 'Autopilot bar off'); } }, icon(I.keypad), h('span', {}, 'Autopilot bar (touch)'), afcsSw);
/** keyboard sensitivity: how fast and how far the arrow keys move the yoke */
const sensLabel = () => (KB_SENSITIVITY.reduce((a, b) => (Math.abs(b.v - input.sensitivity) < Math.abs(a.v - input.sensitivity) ? b : a)).label);
const sensVal = h('kbd', {}, sensLabel());
const sensItem = h('button', { class: 'menu-item', role: 'menuitem', title: 'How fast and how far the arrow keys move the yoke (click to change)', onclick: (e: Event) => {
  e.stopPropagation();
  const i = KB_SENSITIVITY.findIndex((x) => x.label === sensLabel());
  input.sensitivity = KB_SENSITIVITY[(i + 1) % KB_SENSITIVITY.length].v;
  sensVal.textContent = sensLabel();
  toast(`Keyboard sensitivity: ${sensLabel()}`);
} }, icon(I.keyboard), h('span', {}, 'Keyboard sensitivity'), sensVal);
moreMenu.append(
  menuHead('Flight'),
  moreItem(I.approach, 'Procedures', 'X', () => procModal.open()),
  moreItem(I.direct, 'Direct-To', 'D', () => directModal.open()),
  moreItem(I.chart, 'Debrief', 'Shift D', () => openDebrief()),
  menuHead('Tools'),
  moreItem(I.cloud, 'Weather station', '', () => weatherModal.open()),
  moreItem(I.pattern, 'Flight builder', 'U', () => builder.edit()),
  moreItem(I.link, 'Connections', '', () => connect.open()),
  moreItem(I.instructor, 'Pair instructor (phone/tablet)…', '', () => void pairInstructor()),
  menuHead('Learn'),
  moreItem(I.learn, 'Learning paths', 'J', () => learn.open()),
  moreItem(I.records, 'Training records', '', () => historyModal.open()),
  moreItem(I.compass, 'Guided tour', '', () => startTour()),
  moreItem(I.help, 'Explain instruments', 'F1', () => toggleExplain()),
  moreItem(I.keyboard, 'Keyboard shortcuts', '?', () => help.open()),
  menuHead('App'),
  moreItem(I.gear, 'Settings', ',', () => settings.open()),
  moreItem(I.joystick, 'Controllers', '', () => joyModal.open()),
  sensItem,
  afcsItem,
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
// (touch screens keep :hover on the last tapped element: it says nothing about a finger on the bar)
const chromeBusy = () => Modal.anyOpen() || !!document.querySelector('.menu.open') || (!touchUi && topbar.matches(':hover')) || topbar.contains(document.activeElement);
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
  flightItem(I.instructor, 'Pair instructor (phone/tablet)…', '', () => void pairInstructor()),
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
    // the single way home: every flight, lesson and path starts in the Flight Center (Shift N still plans directly)
    h('button', { class: 'btn primary', onclick: () => fc.open(), title: 'Flight Center — plan a flight, lessons, paths and records (F2)' }, icon(I.plane), h('span', { class: 'lbl' }, 'Flight Center')),
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
const lookHint = h('div', { class: 'look-hint', 'aria-hidden': 'true' }, touchUi ? 'Drag to look around · double-tap to recentre' : 'Drag to look around · double-click to recentre');
/** the look hint appears once per session, under the situation bar, and fades after 6 s or on the first drag */
function showLookHint() {
  let seen = false;
  try { seen = sessionStorage.getItem('ifr.lookHint') === '1'; sessionStorage.setItem('ifr.lookHint', '1'); } catch { /* storage blocked */ }
  if (seen) return;
  lookHint.classList.add('show');
  setTimeout(() => lookHint.classList.remove('show'), 6000);
}
const sitbar = h('div', { class: 'sitbar', role: 'status', 'aria-label': 'Flight situation' });
// a tap on the PAUSED pill resumes (handy on a tablet, where the top bar may be hidden)
sitbar.addEventListener('click', (e) => { if (sim.paused && !sim.replaying && (e.target as HTMLElement).closest('.sb.paused')) togglePause(); });
// the pause veil carries its own Resume button: on a tablet the top bar may be hidden and there is no Esc key
const pauseKeyHint = h('span', { class: 'pv-key' }, 'or press Esc');
const pauseVeil = h('div', { class: 'pause-veil' }, h('b', {}, 'Paused'),
  h('div', { class: 'pv-acts' }, h('button', { class: 'btn primary pv-resume', type: 'button', onclick: () => { if (sim.paused) togglePause(); } }, icon(I.play), h('span', {}, 'Resume')), pauseKeyHint));
const replayBar = h('div', { class: 'replay' });
const atc = new AtcRadio(sim, () => audio.squelch());
const otw = h('section', { class: 'otw' }, otwCanvas, glCanvas, glare, lookHint, sitbar, pauseVeil, coach, toasts, replayBar, atc.el);
let outside: Outside3D | null = null;
let timeOfDay = store.get<TimeOfDay>('ifr.tod', 'day');
// tablets: the lighter scene at native pixel ratio 1 (a 2x retina canvas costs 4x the fill rate on an iPad GPU)
let gfx = store.get<Quality>('ifr.gfx', touchUi ? 'low' : 'high');
let outsideLoading = false;
async function initOutside() {
  if (outside || outsideLoading) return;
  outsideLoading = true;
  try {
    const mod = await import('./avionics/outside3d');
    if (!mod.webglAvailable()) return;
    outside = new mod.Outside3D(glCanvas, gfx, timeOfDay);
    otw.classList.add('has-gl');
    viewList = mod.VIEWS;
    viewNames = mod.VIEW_LABELS;
    // the camera survives a rebuild (graphics quality, region change): re-apply the saved view
    outside.onViewChange = (v) => { viewMode = v; store.set('ifr.view', v); syncView(); };
    outside.setView(viewList.includes(viewMode) ? viewMode : 'cockpit');
    syncView();
    if (otwMode !== 'none' && viewMode === 'cockpit') showLookHint();
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
  glCanvas.addEventListener('pointerdown', (e) => { if (outside && outside.view !== 'cockpit') return; drag = { x: e.clientX, y: e.clientY }; glCanvas.setPointerCapture(e.pointerId); otw.classList.add('looked'); lookHint.classList.remove('show'); });
  glCanvas.addEventListener('pointermove', (e) => {
    if (!drag || !outside) return;
    outside.lookYaw = Math.max(-2.6, Math.min(2.6, outside.lookYaw + (e.clientX - drag.x) * 0.005));
    outside.lookPitch = Math.max(-0.8, Math.min(0.8, outside.lookPitch + (e.clientY - drag.y) * 0.004));
    drag = { x: e.clientX, y: e.clientY };
  });
  glCanvas.addEventListener('pointerup', () => (drag = null));
  glCanvas.addEventListener('pointercancel', () => (drag = null));
  glCanvas.addEventListener('dblclick', () => { if (outside && outside.view === 'cockpit') outside.lookYaw = outside.lookPitch = 0; });
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
const hdgSync = () => (sim.ap.hdgBug = Math.round(sim.ac.data.hdgTrue) || 360);
const altSync = () => (sim.ap.altSel = Math.round(sim.indicatedAlt() / 100) * 100);
const minsBy = (d: number, coarse: boolean) => (sim.av.minimums = Math.max(0, (sim.av.minimums ?? Math.round(sim.indicatedAlt() / 100) * 100) + d * (coarse ? 100 : 10)));
const baroBy = (d: number, coarse: boolean) => (sim.av.baro = Math.round((sim.av.baro + d * (coarse ? 0.1 : 0.01)) * 100) / 100);
// ------------------------------------------------------------------ step rows (step pads, the autopilot bar)
/** one definition per selector, shared by the bezel knobs (finger tap / right-click) and the autopilot bar */
const ROW = {
  hdg: (): StepRow => ({ label: 'HDG', value: () => `${pad3(sim.ap.hdgBug)}°`, fine: '1°', coarse: '10°', onStep: (d, c) => hdgBy(d, c), push: { label: 'SYNC', fn: hdgSync, title: 'Heading bug to the current heading' } }),
  alt: (): StepRow => ({ label: 'ALT SEL', value: () => `${sim.ap.altSel} FT`, fine: '100', coarse: '1000', onStep: (d, c) => altBy(d, c), push: { label: 'SYNC', fn: altSync, title: 'Selected altitude to the current altitude' } }),
  /** the G1000 UP / DN wheel: VS target, FLC speed or pitch reference, in the active vertical mode */
  vert: (): StepRow => {
    const v = sim.ap.vert;
    if (v === 'FLC') return { label: 'IAS (FLC)', value: () => `${Math.round(sim.ap.iasSel)} KT`, fine: '1', onStep: (d) => sim.ap.nose(d === 1 ? -1 : 1) };
    if (v === 'VS') return { label: 'VS', value: () => `${sim.ap.vsSel > 0 ? '+' : ''}${sim.ap.vsSel} FPM`, fine: '100', onStep: (d) => sim.ap.nose(d) };
    return { label: 'PITCH', value: () => `${sim.ap.pitchRef > 0 ? '+' : ''}${sim.ap.pitchRef.toFixed(1)}°`, fine: '0.5°', onStep: (d) => sim.ap.nose(d) };
  },
  crs: (): StepRow => ({ label: 'CRS', value: () => `${pad3(sim.course())}°`, fine: '1°', coarse: '10°', onStep: (d, c) => sim.setCourse(sim.course() + d * (c ? 10 : 1)), push: { label: 'CENTER', fn: () => centerCdi(), title: 'Course to centre the CDI on the station' } }),
  baro: (): StepRow => ({ label: 'BARO', value: () => `${sim.av.baro.toFixed(2)} IN`, fine: '.01', coarse: '.10', onStep: (d, c) => baroBy(d, c), push: { label: 'SET QNH', fn: () => setQnh(), title: 'Altimeter to the reported QNH (B)' } }),
  mins: (): StepRow => ({ label: 'MINS', value: () => (sim.av.minimums === null ? 'OFF' : `${sim.av.minimums} FT`), fine: '10', coarse: '100', onStep: (d, c) => minsBy(d, c), push: { label: 'OFF', fn: () => (sim.av.minimums = null), title: 'Minimums off' } }),
  radio: (name: string, r: { active: number; standby: number }, min: number, max: number, fine: number, digits: number): StepRow => ({
    label: `${name} SBY`, value: () => r.standby.toFixed(digits), fine: 'kHz', coarse: 'MHz', onStep: (d, c) => tune(r, d, c, min, max, fine), push: { label: '⇆ SWAP', fn: () => swap(r), title: `Swap ${name} active / standby` },
  }),
};


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
    // the GFC 700 keeps VNV here: not modelled, so the slot stays empty and every other key sits where a G1000
    // pilot expects it (APR BC, VS FLC, UP DN)
    h('i', { class: 'ap-gap', 'aria-hidden': 'true' }),
    k('APR', () => sim.ap.pressApr(d(), n()), 'Approach mode (R)'),
    k('BC', () => sim.ap.pressApr(d(), n()), 'Back course (auto via APR)'),
    k('VS', () => sim.ap.pressVs(d()), 'Vertical speed (Y)'),
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
    tag(knob({ label: 'NAV', sub: 'MHz · kHz', dual: true, onTurn: (d, c) => tune(sim.av.nav1, d, c, 108, 118, 0.05), readout: () => `NAV1 SBY ${sim.av.nav1.standby.toFixed(2)}`, steps: () => [ROW.radio('NAV1', sim.av.nav1, 108, 118, 0.05, 2)] }), 'nav'),
    tag(bkey('NAV ⇆', () => swap(sim.av.nav1), 'Swap NAV1 active/standby'), 'nav'),
    tag(knob({ label: 'HDG', sub: 'Push sync', onTurn: hdgBy, onPush: hdgSync, readout: () => `HDG ${pad3(sim.ap.hdgBug)}°`, steps: () => [ROW.hdg()] }), 'hdg'),
    apKeyEls(),
    tag(knob({ label: 'ALT', sub: '1000 · 100', dual: true, onTurn: altBy, onPush: altSync, readout: () => `ALT ${sim.ap.altSel} FT`, steps: () => [ROW.alt(), ROW.vert()] }), 'alt'),
  ),
  h('div', { class: 'screen' }, pfdCanvas),
  softRow(PFD_SOFTKEYS, (i) => pfdSoftkey(i)),
  h('div', { class: 'side right' },
    tag(knob({ label: 'COM', sub: 'MHz · kHz', dual: true, onTurn: (d, c) => tune(sim.av.com1, d, c, 118, 137, 0.025), readout: () => `COM1 SBY ${sim.av.com1.standby.toFixed(3)}`, steps: () => [ROW.radio('COM1', sim.av.com1, 118, 137, 0.025, 3)] }), 'com'),
    tag(bkey('COM ⇆', () => swap(sim.av.com1), 'Swap COM1'), 'com'),
    tag(knob({
      label: 'CRS',
      sub: 'Outer BARO',
      dual: true,
      onTurn: (d, c) => {
        if (c) baroBy(d, false);
        else sim.setCourse(sim.course() + d);
      },
      steps: () => [ROW.crs(), ROW.baro()],
      onPush: () => centerCdi(),
      readout: () => `CRS ${pad3(sim.course())}° · ${sim.av.baro.toFixed(2)} IN`,
      title: 'CRS/BARO — inner knob: course (push = centre CDI) · outer ring: altimeter setting',
    }), 'crs'),
    tag(knob({ label: 'MINS', sub: 'Push off', onTurn: minsBy, onPush: () => (sim.av.minimums = null), readout: () => (sim.av.minimums === null ? 'MINS OFF' : `BARO MIN ${sim.av.minimums}`), steps: () => [ROW.mins()] }), 'mins'),
    h('div', { class: 'bkey-grid' },
      bkey('D→', () => g1kKey('direct', () => directModal.open()), 'Direct-To (D)'),
      bkey('PROC', () => g1kKey('proc', () => procModal.open()), 'Procedures (X)'),
      bkey('FPL', () => { mfdSt.showFpl = true; g1kKey('fpl', () => {}); }, 'Flight plan'),
      bkey('BARO', () => setQnh(), 'Set altimeter to QNH (B)'),
      bkey('CLR', () => { if (!(cockpitType === 'g1000' && fmsKey(sim, mfdSt, 'clr'))) Modal.closeAll(); }, 'Clear'),
      bkey('TOGA', () => goAround(), 'Go-around (G)'),
    ),
  ),
);
const mfdBezel = h('div', { class: 'bezel mfd' },
  h('div', { class: 'brand-mark', 'data-r': '1' }, 'MFD'),
  h('div', { class: 'side left' },
    tag(knob({ label: 'NAV2', sub: 'MHz · kHz', dual: true, onTurn: (d, c) => tune(sim.av.nav2, d, c, 108, 118, 0.05), readout: () => `NAV2 SBY ${sim.av.nav2.standby.toFixed(2)}`, steps: () => [ROW.radio('NAV2', sim.av.nav2, 108, 118, 0.05, 2)] }), 'nav2'),
    tag(bkey('NAV2 ⇆', () => swap(sim.av.nav2), 'Swap NAV2'), 'nav2'),
    tag(knob({ label: 'ADF', sub: '100 · 1 kHz', dual: true, onTurn: (d, c) => (sim.av.adf.active = Math.max(190, Math.min(1750, sim.av.adf.active + d * (c ? 100 : 1)))), readout: () => `ADF ${sim.av.adf.active} kHz`, stepLabels: ['1', '100'] }), 'adf'),
    tag(bkey('CDI', () => doAction('cdi'), 'Cycle CDI (C)'), 'cdi'),
  ),
  h('div', { class: 'screen' }, mfdCanvas),
  softRow(MFD_SOFTKEYS, (i) => mfdSoftkey(i)),
  h('div', { class: 'side right' },
    tag(knob({ label: 'RANGE', sub: 'Map', onTurn: (d) => (mfdSt.rangeIdx = Math.max(0, Math.min(8, mfdSt.rangeIdx - d))), readout: () => `RANGE ${mfdRange(mfdSt)} NM`, steps: () => [{ label: 'RANGE', value: () => `${mfdRange(mfdSt)} NM`, fine: '', onStep: (d) => (mfdSt.rangeIdx = Math.max(0, Math.min(8, mfdSt.rangeIdx - d))) }] }), 'range'),
    h('div', { class: 'bkey-grid' },
      bkey('D→', () => g1kKey('direct', () => directModal.open()), 'Direct-To (D)'),
      bkey('MENU', () => g1kKey('menu', () => {}), 'Page menu (FPL: activate leg, hold, delete…)'),
      bkey('FPL', () => { mfdSt.showFpl = true; g1kKey('fpl', () => {}); }, 'Flight plan'),
      bkey('PROC', () => g1kKey('proc', () => procModal.open()), 'Procedures (X): select, activate, vectors to final, missed'),
      bkey('CLR', () => { if (!(cockpitType === 'g1000' && fmsKey(sim, mfdSt, 'clr'))) Modal.closeAll(); }, 'Clear / cancel'),
      tag(bkey('ENT', () => g1kKey('ent', () => {}), 'Enter / confirm'), 'act'),
    ),
    tag(knob({
      label: 'FMS',
      sub: 'Push = cursor',
      dual: true,
      onTurn: (d, coarse) => { mfdSt.showFpl = true; fmsKey(sim, mfdSt, `${coarse ? 'outer' : 'inner'}${d > 0 ? '+' : '-'}` as FmsKey); },
      onPush: () => { mfdSt.showFpl = true; fmsKey(sim, mfdSt, 'push'); },
      readout: () => {
        const v = fmsView(sim, mfdSt);
        if (v.msg) return v.msg;
        if (v.direct) return 'DIRECT-TO';
        if (v.proc) return 'PROCEDURES';
        if (v.cursor !== null && v.cursor >= 0) return `CRSR ${sim.fp.wpts[v.cursor]?.ident ?? ''}`;
        return sim.fp.out.valid ? `ACTV ${sim.fp.out.toIdent}` : 'NO FPL';
      },
      title: 'FMS — push to show the cursor, inner knob moves it, outer knob scrolls; ENT confirms, CLR cancels (the active leg changes only on MENU → Activate Leg or ACT LEG)',
    }), 'fms'),
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
const mcpVsBy = (d: number) => { if (sim.ap.vert !== 'VS') sim.ap.pressVs(sim.ac.data); sim.ap.vsSel = Math.max(-2000, Math.min(1500, sim.ap.vsSel + d * 100)); };
const mcpKey = (label: string, fn: () => void, key: string) => {
  const b = h('button', { class: 'mcp-key', onclick: fn }, h('i', {}), label);
  b.dataset.mcp = key;
  return b;
};
const mcp = h('section', { class: 'mcp' },
  h('div', { class: 'mcp-group' }, mcpKey('F/D', () => sim.ap.toggleFd(sim.ac.data), 'FD'), mcpKey('CMD A', () => doAction('apToggle'), 'AP')),
  h('div', { class: 'mcp-group' }, mcpSpd.el, knob({ label: 'IAS', onTurn: (d, c) => (sim.ap.iasSel = Math.max(60, Math.min(180, sim.ap.iasSel + d * (c ? 10 : 1)))), readout: () => `IAS ${sim.ap.iasSel} KT`, steps: () => [{ label: 'IAS', value: () => `${Math.round(sim.ap.iasSel)} KT`, fine: '1', coarse: '10', onStep: (d, c) => (sim.ap.iasSel = Math.max(60, Math.min(180, sim.ap.iasSel + d * (c ? 10 : 1)))) }] }), mcpKey('FLCH', () => sim.ap.pressFlc(sim.ac.data), 'FLC')),
  h('div', { class: 'mcp-group' }, mcpKey('LNAV', () => { if (sim.av.cdi !== 'GPS') sim.setCdi('GPS'); sim.ap.pressNav(sim.ac.data, sim.navInputs()); }, 'LNAV'), mcpKey('VOR LOC', () => { if (sim.av.cdi === 'GPS') sim.setCdi('NAV1'); sim.ap.pressNav(sim.ac.data, sim.navInputs()); }, 'VORLOC'), mcpKey('APP', () => sim.ap.pressApr(sim.ac.data, sim.navInputs()), 'APR')),
  h('div', { class: 'mcp-group' }, mcpHdg.el, knob({ label: 'HDG', onTurn: hdgBy, onPush: hdgSync, readout: () => `HDG ${pad3(sim.ap.hdgBug)}°`, steps: () => [ROW.hdg()] }), mcpKey('HDG SEL', () => sim.ap.pressHdg(sim.ac.data), 'HDG')),
  h('div', { class: 'mcp-group' }, mcpAlt.el, knob({ label: 'ALT', dual: true, onTurn: altBy, readout: () => `ALT ${sim.ap.altSel} FT`, steps: () => [ROW.alt()] }), mcpKey('ALT HOLD', () => sim.ap.pressAlt(sim.ac.data), 'ALT')),
  h('div', { class: 'mcp-group' }, mcpVs.el, knob({ label: 'V/S', onTurn: mcpVsBy, readout: () => `V/S ${sim.ap.vsSel > 0 ? '+' : ''}${sim.ap.vsSel}`, steps: () => [{ label: 'V/S', value: () => `${sim.ap.vsSel > 0 ? '+' : ''}${sim.ap.vsSel} FPM`, fine: '100', onStep: (d) => mcpVsBy(d) }] }), mcpKey('V/S', () => sim.ap.pressVs(sim.ac.data), 'VS')),
  h('div', { class: 'mcp-group' }, mcpKey('A/P DISC', () => sim.ap.disconnect(), 'DISC'), mcpKey('TO/GA', () => goAround(), 'TOGA')),
);
const mcpKeys = [...mcp.querySelectorAll<HTMLElement>('[data-mcp]')];
// ------------------------------------------------------------------ autopilot bar (touch / mouse-free)
/** GMC 710-style autopilot controller across the panel: big AP mode keys and − / + step buttons for every
 *  selector (HDG, ALT, the UP/DN target, CRS, BARO, MINS). On by default on tablets; More menu on desktop. */
const afcsVals: (() => void)[] = [];
const afcsAp = (label: string, fn: () => void, title: string) => {
  const b = bkey(label, fn, title);
  b.dataset.ap = label;
  b.classList.add('afcs-k');
  return b;
};
const afcsInc = (sign: '−' | '+', aria: string, fn: () => void) => autoRepeat(h('button', { type: 'button', class: 'afcs-inc', 'aria-label': aria }, sign), fn);
/** a selector readout: tap opens its step pad (fine + coarse steps and the push action) */
const afcsVal = (row: () => StepRow, k: string, short?: () => string, rows?: () => StepRow[]) => {
  const lab = h('small', {}, '');
  const val = h('b', {}, '');
  const el = h('button', { type: 'button', class: 'afcs-val', 'data-k': k, title: 'Tap for the step buttons', onclick: () => openSteps(el, rows ? rows() : [row()]) }, lab, val);
  afcsVals.push(() => { const r = row(); setText(lab, r.label); setText(val, short ? short() : r.value()); });
  return el;
};
/** − value + : tap = one step, hold = repeat faster */
const afcsSel = (row: () => StepRow, k: string, short?: () => string, rows?: () => StepRow[]) =>
  h('div', { class: 'afcs-sel', 'data-k': k },
    afcsInc('−', `${row().label} down`, () => row().onStep(-1, false)),
    afcsVal(row, k, short, rows),
    afcsInc('+', `${row().label} up`, () => row().onStep(1, false)));
const afcsGrp = (cls: string, ...kids: HTMLElement[]) => h('div', { class: `afcs-g ${cls}` }, ...kids);
const afcs = h('section', { class: 'afcs', 'aria-label': 'Autopilot and selectors' },
  afcsGrp('g-ap', afcsAp('AP', () => doAction('apToggle'), 'Autopilot (A)'), afcsAp('FD', () => sim.ap.toggleFd(sim.ac.data), 'Flight director (Shift+A)')),
  afcsGrp('g-hdg', afcsAp('HDG', () => sim.ap.pressHdg(sim.ac.data), 'Heading mode (H)'), afcsSel(ROW.hdg, 'hdg', () => `${pad3(sim.ap.hdgBug)}°`)),
  afcsGrp('g-nav', afcsAp('NAV', () => sim.ap.pressNav(sim.ac.data, sim.navInputs()), 'Nav mode (N)'), afcsAp('APR', () => sim.ap.pressApr(sim.ac.data, sim.navInputs()), 'Approach mode (R)'), afcsAp('BC', () => sim.ap.pressApr(sim.ac.data, sim.navInputs()), 'Back course (auto via APR)')),
  afcsGrp('g-alt', afcsAp('ALT', () => sim.ap.pressAlt(sim.ac.data), 'Altitude hold (L)'), afcsSel(ROW.alt, 'alt', () => String(sim.ap.altSel), () => [ROW.alt(), ROW.vert()])),
  afcsGrp('g-vert', afcsAp('VS', () => sim.ap.pressVs(sim.ac.data), 'Vertical speed (Y)'), afcsAp('FLC', () => sim.ap.pressFlc(sim.ac.data), 'Flight level change (Shift+K)'),
    afcsAp('DN', () => sim.ap.nose(-1), 'Nose down: VS −100, FLC speed +1, pitch −0.5°'), afcsVal(ROW.vert, 'vert', () => { const v = sim.ap.vert; return v === 'VS' ? `${sim.ap.vsSel > 0 ? '+' : ''}${sim.ap.vsSel}` : v === 'FLC' ? `${Math.round(sim.ap.iasSel)}` : `${sim.ap.pitchRef > 0 ? '+' : ''}${sim.ap.pitchRef.toFixed(1)}°`; }), afcsAp('UP', () => sim.ap.nose(1), 'Nose up: VS +100, FLC speed −1, pitch +0.5°')),
  afcsGrp('g-nav2', afcsVal(ROW.crs, 'crs', () => `${pad3(sim.course())}°`), afcsVal(ROW.baro, 'baro', () => sim.av.baro.toFixed(2)), afcsVal(ROW.mins, 'mins', () => (sim.av.minimums === null ? 'OFF' : String(sim.av.minimums)))),
);
let afcsBar = store.get<boolean | null>('ifr.afcsBar', null) ?? touchUi;
function setAfcsBar(on: boolean, persist = true) {
  afcsBar = on;
  if (persist) store.set('ifr.afcsBar', on);
  cockpit.classList.toggle('with-afcs', on && cockpitType !== 'airliner');
  afcsSw.classList.toggle('on', on);
  afcsItem.setAttribute('aria-checked', String(on));
  fitSoon();
}
const cockpit = h('main', { class: 'cockpit' }, otw, mcp, afcs, panel);
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
  { sel: '.otw', title: 'Outside view', text: 'A 3D view of the Ardent Islands with real runway lighting and PAPI. Drag to look around, double-click to recentre. Tab cycles the layout (Standard, Large view, Immersive, Instruments); V cycles the camera (Cockpit, Chase, Orbit, Tower, Fly-by) — both also in the Layout menu.' },
  { sel: '.bezel.pfd .screen', title: 'Primary flight display', text: 'Attitude, airspeed, altitude, vertical speed and the HSI. Press F1 at any time to label and explain every instrument — in all three cockpits.' },
  { sel: '.bezel.pfd .side.left', title: 'Knobs & autopilot', text: touchUi
    ? 'Tap a knob for big − / + step buttons (hold to repeat) and its push action; or drag it to turn it. The autopilot bar above the displays has the mode keys and − / + for heading and altitude.'
    : 'Drag or scroll a knob to turn it; on dual knobs the outer ring is coarse and the inner knob fine. Click without dragging to push; right-click for − / + step buttons. The keys are the autopilot: HDG, NAV, APR, ALT, VS, FLC.' },
  { sel: '.bezel.mfd', title: 'Multi-function display', text: 'Moving map with terrain and the active flight plan. RANGE zooms; PROC loads an approach; ACT activates it.' },
  { sel: '.footer', title: 'Flight controls', text: 'Throttle, flaps, trim and yoke position. Use a joystick or yoke (Controllers in the More menu), the keyboard (arrows, +/−, Home/End, F — sensitivity in the More menu), or the touch stick (drag it; it eases back to neutral when you let go).' },
  { sel: '.tb-group', title: 'EFB & CDU', text: 'EFB: approach plates (your aircraft is drawn on them), airport data, navlog, weather and checklists. CDU: the flight management computer — route, departure/arrival, legs, holds, progress.' },
  { sel: '.tb-actions > .menu-wrap:last-child', title: 'Everything else', text: 'Procedures, Direct-To and the debrief; the weather station and flight builder; learning paths, training records and keyboard shortcuts; Settings and controllers.' },
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
  cockpit.classList.toggle('with-afcs', afcsBar && t !== 'airliner');
  cockpit.dataset.theme = t;
  closeSteps();
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
window.addEventListener('pointercancel', () => (thrDragging = false));
thr.addEventListener('lostpointercapture', () => (thrDragging = false));
thr.addEventListener('change', () => (thrDragging = false));
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
  group('Controller', h('button', { class: 'ped-joy', 'data-tip': 'Joystick, yoke or gamepad (Controllers in the More menu)', onclick: () => joyModal.open(), title: 'Flying with the keyboard — click to connect a joystick, yoke or pedals' }, joyDot, joyLbl)),
  h('div', { class: 'spacer' }),
  h('div', { class: 'ped-keys' }, h('span', {}, h('kbd', {}, 'F1'), ' explain'), h('span', {}, h('kbd', {}, '?'), ' shortcuts'), h('span', {}, h('kbd', {}, 'G'), ' go-around'), h('span', {}, h('kbd', {}, 'K'), ' charts')),
);

document.getElementById('app')!.append(topbar, cockpit, footer);
document.body.append(charts.el, ios.el, chromeHandle);

// touch stick: relative drag (the yoke does not jump to where the finger lands), eased back to neutral on release
{
  let active: { id: number; x0: number; y0: number; vx: number; vy: number } | null = null;
  let ease = 0;
  const show = (x: number, y: number) => {
    stickDot.style.left = `${50 + x * 40}%`;
    stickDot.style.top = `${50 + y * 40}%`;
  };
  const move = (e: PointerEvent) => {
    if (!active || e.pointerId !== active.id) return;
    const r = stick.getBoundingClientRect();
    // full deflection = half the pad (and at least 60 px of finger travel on a small pad)
    const span = Math.max(30, r.width / 2);
    const x = Math.max(-1, Math.min(1, active.vx + (e.clientX - active.x0) / span));
    const y = Math.max(-1, Math.min(1, active.vy + (e.clientY - active.y0) / span));
    input.virtual.roll = x * 0.7;
    input.virtual.pitch = y * 0.7;
    show(x, y);
  };
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    cancelAnimationFrame(ease);
    active = { id: e.pointerId, x0: e.clientX, y0: e.clientY, vx: input.virtual.roll / 0.7, vy: input.virtual.pitch / 0.7 };
    stick.classList.add('active');
    try { stick.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
  });
  stick.addEventListener('pointermove', move);
  const end = (e: PointerEvent) => {
    if (!active || e.pointerId !== active.id) return;
    active = null;
    // a short ease back to neutral, never a snap (a snap is a control jerk the AP-off aircraft feels)
    const t0 = performance.now();
    const r0 = input.virtual.roll;
    const p0 = input.virtual.pitch;
    const step = () => {
      const k = Math.max(0, 1 - (performance.now() - t0) / 220);
      input.virtual.roll = r0 * k;
      input.virtual.pitch = p0 * k;
      show(input.virtual.roll / 0.7, input.virtual.pitch / 0.7);
      if (k > 0 && !active) ease = requestAnimationFrame(step);
      else if (!active) stick.classList.remove('active');
    };
    step();
  };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
  stick.addEventListener('lostpointercapture', end);
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
/** G1000 FMS keys go to the canvas FMS (Garmin windows); other cockpits keep the web dialogs */
function g1kKey(k: FmsKey, fallback: () => void) {
  if (cockpitType === 'g1000') fmsKey(sim, mfdSt, k);
  else fallback();
}
function mfdSoftkey(i: number) {
  if (cockpitType !== 'g1000' || DEAD_SOFTKEYS.has(MFD_SOFTKEYS[i] ?? '')) return;
  mfdSt.softkeyFlash = i;
  setTimeout(() => (mfdSt.softkeyFlash = null), 150);
  switch (MFD_SOFTKEYS[i]) {
    case 'TERRAIN': mfdSt.terrain = !mfdSt.terrain; break;
    case 'NORTH UP': mfdSt.northUp = !mfdSt.northUp; break;
    case 'DCLTR': mfdSt.declutter = (mfdSt.declutter + 1) % 3; break;
    case 'FPL': mfdSt.showFpl = !mfdSt.showFpl; break;
    case 'PROC': fmsKey(sim, mfdSt, 'proc'); break;
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
    case 'v': cycleView(e.shiftKey ? -1 : 1); break;
    case 'y': sim.ap.pressVs(d); break;
    case 'k': if (e.shiftKey) sim.ap.pressFlc(d); else charts.toggle(); break;
    case 'q': hdgBy(-1, e.shiftKey); break;
    case 'e': hdgBy(1, e.shiftKey); break;
    case 'w': altBy(1, e.shiftKey); break;
    case 's': altBy(-1, e.shiftKey); break;
    case 'o': sim.setCourse(sim.course() - (e.shiftKey ? 10 : 1)); break;
    case 'p': sim.setCourse(sim.course() + (e.shiftKey ? 10 : 1)); break;
    case 'c': doAction('cdi'); break;
    case 'd': if (e.shiftKey) openDebrief(); else g1kKey('direct', () => directModal.open()); e.preventDefault(); break;
    case 'x': g1kKey('proc', () => procModal.open()); break;
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
/** the setup checklist of the current step (source, frequency, course, altitude, entry), folded on request */
let coachSetupOpen = store.get('ifr.coachSetup', true);
let setupAllOpen = false;
function setupChecklist(items: SetupItem[]): HTMLElement {
  const checks = items.filter((i) => i.ok !== null);
  const done = checks.filter((i) => i.ok).length;
  const all = checks.length > 0 && done === checks.length;
  // everything set: the checklist folds to its header (a tap shows the items again)
  const open = all ? setupAllOpen : coachSetupOpen;
  const toggle = () => {
    if (all) setupAllOpen = !setupAllOpen;
    else { coachSetupOpen = !coachSetupOpen; store.set('ifr.coachSetup', coachSetupOpen); }
    coachKey = '';
    updateCoach();
  };
  const head = h('button', { type: 'button', class: 'setup-h', 'aria-expanded': String(open), title: open ? 'Fold the setup checklist' : 'Show the setup checklist', onclick: toggle },
    h('b', {}, 'Set up'),
    h('span', { class: `setup-n${all ? ' all' : ''}` }, checks.length ? (all ? 'All set' : `${done} of ${checks.length} done`) : ''),
    svgIcon(open ? I.chevUp : I.chevDown, 14));
  const firstInfo = items.find((i) => i.ok === null);
  const compact = cockpit.classList.contains('coach-compact') && !coachDetails;
  // short of space and everything set: one quiet line (Details shows the whole list)
  if (compact && all && !setupAllOpen) return h('div', { class: 'setup-done' }, svgIcon(I.check, 13), h('span', {}, 'Set up complete'));
  const wrap = h('div', { class: `setup${open ? ' open' : ''}${all ? ' all' : ''}` }, head);
  // folded: nothing more, except when everything is set and there is room — the instruction to fly (the hold
  // entry, how to fly it) stays in view; short of space the readout above already names the entry
  if (!open && !(all && firstInfo && !compact)) return wrap;
  const shown = open ? items : [firstInfo!];
  // short of space (small outside view): what is still to do, one chip each, and the first instruction (the hold
  // entry, cut to one line, the whole text in its tip); the full list behind Details
  if (compact) {
    wrap.classList.add('compact');
    wrap.append(h('div', { class: 'setup-chips' }, ...shown.filter((i) => i.ok === false || i === firstInfo).map((i) =>
      h('span', { class: `setup-chip ${i.ok === null ? 'info' : 'todo'}`, title: i.detail ? `${i.label} — ${i.detail}` : i.label },
        i.ok === null ? null : h('i', { class: 'mk-todo', 'aria-hidden': 'true' }), h('span', { class: 'setup-chip-t' }, i.label)))));
    return wrap;
  }
  wrap.append(h('ul', { class: 'setup-list', 'aria-label': 'Setup checklist' }, ...shown.map((i) =>
    h('li', { class: i.ok === null ? 'info' : i.ok ? 'ok' : 'todo' },
      i.ok === null ? h('i', { class: 'mk-info', 'aria-hidden': 'true' }) : i.ok ? svgIcon(I.check, 13) : h('i', { class: 'mk-todo', 'aria-hidden': 'true' }),
      h('span', { class: 'setup-t' }, h('b', {}, i.label), i.detail ? h('small', {}, i.detail) : null),
      h('span', { class: 'sr-only' }, i.ok === null ? '' : i.ok ? ' (done)' : ' (to do)')))));
  return wrap;
}
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
    const ride0 = sim.assess.mode === 'checkride';
    let setupItems: SetupItem[] = [];
    if (st?.setup && !ride0 && !run.finished) {
      try { setupItems = st.setup(ctx); } catch { setupItems = []; }
    }
    if (coachTimer) setText(coachTimer, fmtTime(run.totalT));
    const setupKey = setupItems.map((i) => `${i.label}:${i.ok}`).join(',');
    // iPad portrait: the lesson panel covers the pause veil, so it carries the Resume button itself
    const resumeHere = sim.paused && !sim.ac.s.crashed && !run.finished && document.body.classList.contains('portrait');
    const key = `lesson|${run.idx}|${run.currentViolation}|${ro}|${!!run.finished}|${coachDetails}|${coachCollapsed}|${setupKey}|${coachSetupOpen}|${setupAllOpen}|${cockpit.classList.contains('coach-compact')}|${resumeHere}`;
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
    const setupEl = setupItems.length ? setupChecklist(setupItems) : null;
    // short of space, the to-do chips replace the readout (the entry is one of them); once all is set it is back
    if (ro && !setupEl?.querySelector('.setup-chip.todo')) coach.append(h('div', { class: 'ro' }, ro));
    if (setupEl) coach.append(setupEl);
    const more = h('div', { class: 'coach-more' });
    if (st?.hint && !ride) more.append(h('div', { class: 'hint' }, st.hint));
    if (n > 1) {
      const others = run.rt.steps.map((x, i) => ({ x, i })).filter(({ i }) => i !== run.idx);
      more.append(h('ol', { class: 'steps', 'aria-label': 'Other steps' }, ...others.map(({ x, i }) => h('li', { class: i < run.idx ? 'ok' : 'todo' }, i < run.idx ? svgIcon(I.check, 13) : h('i', { class: 'dot' }), h('span', {}, x.text)))));
    }
    const hasMore = more.childElementCount > 0 || setupItems.length > 0;
    if (more.childElementCount) coach.append(more);
    coach.append(h('div', { class: 'acts' },
      hasMore ? coachBtn(coachDetails ? 'Hide details' : 'Details', () => { coachDetails = !coachDetails; store.set('ifr.coachDetails', coachDetails); updateCoach(); }, 'coach-more-btn', 'Show the hint and the other steps') : null,
      h('span', { class: 'acts-sp' }),
      resumeHere ? coachBtn('Resume', () => { if (sim.paused) togglePause(); }, 'primary coach-resume', 'Resume the flight') : null,
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
    if (ap && !fp.approachActive) hints.push(cockpitType === 'g1000' ? 'Approach loaded but not active — PROC → Activate Approach (or Activate Vector-to-Final).' : 'Approach loaded but not active — Procedures (X) → Activate.');
    if (ap && fp.approachActive && !fp.missedActive) {
      const navBased = ap.type === 'ILS' || ap.type === 'LOC' || ap.type === 'LOCBC' || ap.type === 'VOR' || ap.type === 'LDA';
      const faf = fp.wpts.find((x) => x.role === 'FAF' && x.appr === 'final');
      const dFaf = faf ? distanceNm(sim.ac.s, faf) : 99;
      if (navBased && sim.av.cdi === 'GPS' && dFaf < 12) hints.push(cockpitType === 'g1000' && sim.autoCdi && ap.type !== 'VOR' ? 'Confirm the HSI switches to LOC1 (green needle) before the FAF.' : `Switch the CDI to ${ap.type === 'VOR' ? 'VOR1' : 'LOC1'} before the FAF (C key).`);
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
    if (g.suspended) hints.push(fp.out.suspReason === 'HOLD' ? 'In the hold — press SUSP (OBS softkey) to leave the hold at the next fix crossing.' : fp.out.suspReason === 'PILOT' ? 'Sequencing suspended (OBS) — press SUSP to resume the flight plan.' : 'SUSP at the MAP — press G / MISSED to sequence the missed approach.');
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
  // the first rAF timestamp can be older than the module's performance.now(): a negative dt would poison the
  // flight model with NaN on the first frame
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
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
  if (!apKeyCache.length || !apKeyCache[0].isConnected) apKeyCache = [...cockpit.querySelectorAll<HTMLElement>('[data-ap]')];
  const ap = sim.ap;
  for (const b of apKeyCache) {
    const l = b.dataset.ap;
    const on = (l === 'AP' && ap.ap) || (l === 'FD' && ap.fd) || (l === 'HDG' && ap.engaged && ap.lat === 'HDG') || (l === 'ALT' && ap.engaged && ap.vert === 'ALT') || (l === 'NAV' && ap.engaged && (['GPS', 'VOR', 'LOC'].includes(ap.lat) || !!ap.latArmed)) || (l === 'APR' && ap.apprMode) || (l === 'BC' && ap.lat === 'BC') || (l === 'VS' && ap.engaged && ap.vert === 'VS') || (l === 'FLC' && ap.engaged && ap.vert === 'FLC');
    setClass(b, 'on', !!on);
  }
  if (afcsBar && cockpitType !== 'airliner') for (const f of afcsVals) f();
  coachAcc += dt;
  if (coachAcc > 0.25) {
    coachAcc = 0;
    updateCoach();
  }
  mark('dom');
}

// ------------------------------------------------------------------ instructor pairing (phone / tablet companion)
/** what the shell gives the instructor companion (src/connect/remoteLink.ts, src/ui/remotePair.ts): a live snapshot
 *  of the flight and the command entry point (the link validates commands; they are re-checked here) */
let remoteFrozen = false;
const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);
function remoteSnapshot(): RemoteSnapshot {
  const d = sim.ac.data;
  const s0 = sim.ac.s;
  const p = toReal({ lat: s0.lat, lon: s0.lon });
  const g = sim.fp.out;
  const to = g.valid ? sim.fp.wpts[sim.fp.active] : null;
  const w = sim.weather;
  return {
    t: sim.time,
    lat: p.lat,
    lon: p.lon,
    altFt: Math.round(sim.indicatedAlt()),
    iasKt: Math.round(d.iasKt),
    gsKt: Math.round(d.gsKt),
    hdg: Math.round(d.hdgTrue),
    trk: Math.round(d.trackTrue),
    vsFpm: Math.round(d.vsFpm),
    pitch: Math.round(d.pitchDeg * 10) / 10,
    roll: Math.round(d.rollDeg * 10) / 10,
    onGround: s0.onGround,
    crashed: s0.crashed || null,
    phase: sim.rec.phase(sim),
    lesson: lesson ? { id: lesson.ex.id, title: lesson.ex.title, step: lesson.step?.text ?? '', stepIdx: lesson.idx, steps: lesson.rt.steps.length } : null,
    flight: lesson?.ex.title ?? (sim.fp.approachId && sim.fp.approach && sim.scenario && !sim.scenario.name.includes(sim.fp.approach.name) ? `${sim.fp.approach.airport} ${sim.fp.approach.name}` : sim.scenario?.name) ?? 'Free flight',
    wpt: to ? { ident: to.ident, distNm: Math.round(g.distNm * 10) / 10 } : null,
    approach: sim.fp.approach ? { id: sim.fp.approach.id, name: sim.fp.approach.name, airport: sim.fp.approach.airport, active: sim.fp.approachActive } : null,
    failures: { ...sim.failures },
    weather: { windDir: Math.round(w.windDir), windKt: Math.round(w.windKt), gustKt: Math.round(w.gustKt), ceilingFt: Math.round(w.ceilingFt), visibilitySm: w.visibilitySm, turbulence: w.turbulence, qnh: w.qnh },
    ap: { on: sim.ap.ap, lat: sim.ap.lat, vert: sim.ap.vert, hdgBug: sim.ap.hdgBug, altSel: sim.ap.altSel },
    paused: sim.paused,
    frozen: remoteFrozen,
  };
}
function remoteCommand(c: RemoteCommand) {
  if (!c || typeof c !== 'object' || typeof (c as { type?: unknown }).type !== 'string') return;
  const say = (m: string, k: 'info' | 'good' | 'warn' | 'bad' = 'warn') => { sim.rec.log(sim.time, 'info', `Instructor: ${m}`); toast(`Instructor: ${m}`, k, 5000); };
  switch (c.type) {
    case 'pause': sim.paused = true; break;
    case 'resume': if (!remoteFrozen) sim.paused = false; break;
    case 'freeze': remoteFrozen = true; sim.paused = true; say('simulation frozen'); break;
    case 'unfreeze': remoteFrozen = false; sim.paused = false; say('simulation running'); break;
    case 'restart': Modal.closeAll(); restartFlight(); break;
    case 'end': endFlight(); break;
    case 'reposition': {
      const ok = (['iaf', 'if', 'final10', 'final5', 'runway'] as const).includes(c.where) && sim.reposition(c.where);
      if (ok) say(`repositioned (${c.where})`, 'info');
      break;
    }
    case 'failure':
      if (typeof c.on === 'boolean' && c.key in FAILURE_LABELS) { sim.setFailure(c.key, c.on); say(`${c.on ? 'failed' : 'restored'} ${FAILURE_LABELS[c.key]}`, c.on ? 'warn' : 'good'); }
      break;
    case 'weather': {
      const w = sim.weather;
      const x = c as Record<string, unknown>;
      const set = (k: 'ceilingFt' | 'visibilitySm' | 'windDir' | 'windKt' | 'gustKt' | 'turbulence', lo: number, hi: number) => { const v = num(x[k], lo, hi); if (v !== null) w[k] = v; };
      set('ceilingFt', 0, 30000); set('visibilitySm', 0, 50); set('windDir', 0, 360); set('windKt', 0, 80); set('gustKt', 0, 100); set('turbulence', 0, 1);
      if (w.gustKt && w.gustKt < w.windKt) w.gustKt = 0;
      say(`weather changed — wind ${String(Math.round(w.windDir)).padStart(3, '0')}/${Math.round(w.windKt)}${w.gustKt ? `G${Math.round(w.gustKt)}` : ''}`, 'info');
      break;
    }
    case 'vector': {
      const hdg = num(c.hdg, 1, 360);
      const alt = num(c.alt, 0, 18000);
      const parts: string[] = [];
      if (hdg !== null) {
        const dh = wrap180(hdg - sim.ac.data.hdgTrue); // the region frame is magnetic-aligned
        parts.push(Math.abs(dh) < 3 ? `fly heading ${pad3(hdg)}` : `turn ${dh > 0 ? 'right' : 'left'} heading ${pad3(hdg)}`);
      }
      if (alt !== null) parts.push(`${alt > sim.indicatedAlt() ? 'climb' : 'descend'} and maintain ${Math.round(alt / 100) * 100}`);
      if (parts.length) { const t = parts.join(', '); atc.say(t.charAt(0).toUpperCase() + t.slice(1)); sim.rec.log(sim.time, 'info', `ATC (instructor): ${t}`); }
      break;
    }
    case 'directTo':
      if (typeof c.ident === 'string' && /^[A-Z0-9]{2,7}$/i.test(c.ident)) {
        if (sim.directTo(c.ident.toUpperCase())) { atc.say(`Proceed direct ${c.ident.toUpperCase()}`); sim.rec.log(sim.time, 'info', `ATC (instructor): direct ${c.ident.toUpperCase()}`); }
        else toast(`Instructor: unknown fix ${c.ident}`, 'warn');
      }
      break;
    case 'message':
      if (typeof c.text === 'string' && c.text.trim()) say(c.text.trim().slice(0, 200));
      break;
    default: break;
  }
  syncPauseBtn();
}
const remoteApi: RemoteHostApi = { sim, snapshot: remoteSnapshot, command: remoteCommand };
/** the pairing window (QR + code) loads on demand: peerjs and the QR generator stay out of the main bundle */
async function pairInstructor() {
  try {
    const mod = await import('./ui/remotePair');
    mod.openRemotePair(remoteApi);
  } catch (e) {
    console.warn('instructor pairing', e);
    toast('Could not open instructor pairing', 'bad');
  }
}

// test/automation hook
(window as unknown as { __ifr: unknown }).__ifr = { sim, get outside() { return outside; }, thr27: runway('PARD', '27').threshold, charts: (id: string) => chartIndex().find((c) => c.id === id)?.render() ?? '', world: () => import('./nav/world'), lesson: (id: string) => pickExercise(exercise(id), null), perf, remote: remoteApi, setView: (v: ViewMode) => setView(v), afcs: (on: boolean) => setAfcsBar(on) };

// ------------------------------------------------------------------ boot
setOtw(otwMode);
setCockpit(cockpitType, false);
setAfcsBar(afcsBar, false);
new ResizeObserver(fitSoon).observe(afcs);
// portrait: the outside view grows with the lesson panel
new ResizeObserver(() => { if (document.body.classList.contains('portrait')) fitSoon(); }).observe(coach);
requestAnimationFrame(() => setTimeout(() => void initOutside(), 50));
// keep the bezel controls inside the bezel whatever the window size: ONE scale for every side column of
// both bezels (PFD and MFD knobs and keys are always the same size), plus a few sizes the CSS lays out with
/** tablet portrait (and any narrow, tall window): instruments first — the PFD then the MFD, each at its 4:3
 *  aspect across the width, the autopilot bar above them, the outside view in what is left */
const portraitMq = matchMedia('(orientation: portrait) and (max-width: 1100px)');
function fitPortrait() {
  const on = portraitMq.matches;
  document.body.classList.toggle('portrait', on);
  if (!on) { cockpit.style.removeProperty('--bz-h'); return; }
  const H = cockpit.clientHeight;
  const W = cockpit.clientWidth;
  if (H < 50 || W < 50) return;
  const strip = (afcs.offsetParent ? afcs.offsetHeight : 0) + (mcp.offsetParent ? mcp.offsetHeight : 0);
  const dock = otwMode === 'none' ? otw.offsetHeight : 0;
  const n = otwMode === 'big' || otwMode === 'visual' ? 1 : 2;
  // the outside view keeps room for the situation bar, the lesson panel (folded to its essentials) and a strip of view
  const sbH = sitbar.offsetHeight || 80;
  const coachOn = coach.offsetParent !== null && !coach.classList.contains('empty') && getComputedStyle(coach).display !== 'none';
  const coachH = coachOn ? Math.min(coach.scrollHeight, H * 0.23) + 12 : 0;
  const base = otwMode === 'normal' ? Math.max(130, Math.min(240, H * 0.15)) : H * 0.4;
  const otwMin = otwMode === 'none' ? 0 : Math.max(base, sbH + 12 + Math.max(coachH, 70));
  const scr = pfdBezel.querySelector<HTMLElement>('.screen')!;
  const chrome = Math.max(24, pfdBezel.offsetHeight - scr.offsetHeight);
  const sideW = parseFloat(getComputedStyle(cockpit).getPropertyValue('--side-w')) || 74;
  // panel padding + bezel padding + the two grid gaps
  const fitW = (W - 16 - 16 - 16 - 2 * sideW) * 0.75 + chrome;
  const per = (H - strip - dock - otwMin - 16 - (n - 1) * 8) / n;
  cockpit.style.setProperty('--bz-h', `${Math.floor(Math.max(170, Math.min(fitW, per)))}px`);
}
portraitMq.addEventListener?.('change', () => fitSoon());
function fitSides() {
  fitPortrait();
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
  document.body.style.setProperty('--afcs-h', `${afcs.offsetParent ? afcs.offsetHeight : 0}px`);
  // overlays start under the situation bar, whatever its height (two rows in portrait)
  if (otwMode !== 'none' && sitbar.offsetHeight > 20) document.body.style.setProperty('--sb-h', `${sitbar.offsetHeight}px`);
  else document.body.style.removeProperty('--sb-h');
  document.body.style.setProperty('--tb-h', `${topbar.offsetHeight}px`);
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
// deep links: ?lesson=<exerciseId>[&path=<pathId>] opens that lesson's briefing (IFR Academy "Fly it now"),
// ?builder opens the flight builder; both skip the start page
const deepQ = new URLSearchParams(location.search);
const deepLesson = deepQ.get('lesson');
const deepBuilder = deepQ.has('builder');
if (deepLesson) {
  try {
    const ex = exercise(deepLesson);
    const path = PATHS.find((p) => p.id === deepQ.get('path') && p.exercises.includes(ex.id)) ?? null;
    pickExercise(ex, path);
  } catch {
    fc.open();
    toast(`Lesson "${deepLesson}" not found — pick one in the Flight Center`, 'warn', 9000);
  }
} else if (deepBuilder) builder.edit();
else if (introWanted()) intro.show();
else fc.open();
// shared circuit: #circuit=<base64>
if (location.hash.startsWith('#circuit=')) {
  try {
    const c = decodeCircuit(location.hash.slice(9));
    Modal.closeAll();
    // a real-world flight needs its region loaded first: the builder does that, then Load & fly
    if (c.world === 'real') builder.edit(c);
    else flyCircuit(c);
    toast(`Shared flight: ${c.name}`, 'good');
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
