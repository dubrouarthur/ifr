import './styles.css';
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
import { ChartsDrawer } from './ui/charts';
import { InstructorDrawer, HistoryModal } from './ui/instructor';
import { LearnModal, BriefingModal, LessonResultModal, HoldDrillModal } from './ui/learn';
import { FlightCenter } from './ui/flightcenter';
import { SettingsModal } from './ui/settings';
import { CircuitBuilder, decodeCircuit } from './ui/circuitBuilder';
import { circuitToExercise, type Circuit } from './train/circuits';
import type { LessonRun, Exercise } from './train/engine';
import type { Path } from './train/curriculum';
import type { AssessSettings } from './sim/sim';
import { Launcher, WeatherModal, ProcModal, DirectModal, JoystickModal, DebriefModal, HelpModal, Modal, WX_PRESETS, type WxPreset } from './ui/modals';
import { distanceNm, wrap180 } from './nav/geo';
import type { Phase } from './sim/recorder';
import { CockpitAudio } from './sim/audio';

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
let otwMode = store.get<'normal' | 'big' | 'none'>('ifr.otw', 'normal');
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
const weatherModal = new WeatherModal(sim);
const procModal = new ProcModal(sim, (m) => toast(m, 'good'));
const directModal = new DirectModal(sim, (m) => toast(m, 'good'));
const joyModal = new JoystickModal(input);
const debrief = new DebriefModal(sim, () => startScenario(lastScenario, lastWx, sim.assess), () => fc.open());
const historyModal = new HistoryModal();
let lesson: LessonRun | null = null;
let lessonPath: Path | null = null;
const briefing = new BriefingModal(sim, (run) => startLesson(run), (id) => { charts.toggle(true); charts.show(id); });
const drill = new HoldDrillModal();
const learn = new LearnModal((ex, path) => pickExercise(ex, path), () => drill.open());
const fc = new FlightCenter({
  flyScenario: (sc, wx, a) => startScenario(sc, wx, a),
  briefExercise: (ex, path) => pickExercise(ex, path),
  openPaths: () => learn.open(),
  openDrill: () => drill.open(),
  openRecords: () => historyModal.open(),
  openChart: (id) => { charts.toggle(true); charts.show(id); },
  setCockpit: (t) => setCockpit(t),
  getCockpit: () => cockpitType,
  openBuilder: (c) => builder.edit(c),
  flyCircuit: (c) => flyCircuit(c),
});
const builder = new CircuitBuilder((c) => flyCircuit(c), (m, k) => toast(m, k ?? 'info'));
function flyCircuit(c: Circuit) {
  if (c.cockpit && c.cockpit !== cockpitType) setCockpit(c.cockpit);
  pickExercise(circuitToExercise(c), null);
}
const lessonResult = new LessonResultModal((ex) => pickExercise(ex, lessonPath), (ex) => pickExercise(ex, lessonPath), () => openDebrief());
function pickExercise(ex: Exercise, path: Path | null) {
  lesson = null;
  lessonPath = path;
  sim.assess = { mode: 'training', student: launcher.assess.student, handFlown: false, randomFailure: false };
  briefing.show(ex);
}
function startLesson(run: LessonRun) {
  lesson = run;
  debriefShown = true; // the lesson result replaces the automatic debrief
  sim.paused = false;
  input.keys.clear();
  scnName.textContent = `Lesson · ${run.ex.title}`;
  scnSub.textContent = run.ex.summary;
  if (run.ex.plate) charts.show(run.ex.plate);
  toast(`Exercise started: ${run.ex.title}`, 'info');
}
const help = new HelpModal();
const charts = new ChartsDrawer(sim);
const ios = new InstructorDrawer(sim, (m, k) => toast(m, k ?? 'info'));
ios.onBuilder = () => builder.edit();

function startScenario(sc: Scenario, wx: WxPreset, a: AssessSettings = launcher.assess) {
  lesson = null;
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
}

// ------------------------------------------------------------------ layout
const icon = (d: string) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.innerHTML = `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  return s;
};
const I = {
  plane: 'M2 16l20-6-20-6 4 6-4 6zM6 10h8',
  cloud: 'M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 1.5A3.5 3.5 0 0 0 7 18z',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  route: 'M5 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM19 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM7 17l10-10',
  joy: 'M12 3v9M9 3h6M6 16h12a2 2 0 0 1 2 2v2H4v-2a2 2 0 0 1 2-2zM12 12v4',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  help: 'M12 18h.01M9.1 9a3 3 0 1 1 4.2 2.7c-.8.4-1.3 1.2-1.3 2.1v.2',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 5l12 7-12 7z',
  proc: 'M4 6h16M4 12h10M4 18h7',
  ga: 'M12 20V5M5 12l7-7 7 7',
  sound: 'M4 9v6h4l5 4V5L8 9H4zM17 8a5 5 0 0 1 0 8M19.5 5.5a9 9 0 0 1 0 13',
  mute: 'M4 9v6h4l5 4V5L8 9H4zM17 9l5 6M22 9l-5 6',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  learn: 'M2 9l10-5 10 5-10 5-10-5zM6 11v5c3 2 9 2 12 0v-5M22 9v6',
  ios: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  records: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
};
const scnName = h('b', {}, '');
const scnSub = h('span', {}, '');
const phaseChip = h('span', { class: 'chip live' }, 'Ready');
const wxChip = h('span', { class: 'chip', id: 'wx-chip' }, '');
const pauseBtn = h('button', { class: 'btn', title: 'Pause (Esc)', onclick: () => togglePause() }, icon(I.pause), h('span', { class: 'lbl' }, 'Pause'));
const rateSeg = h('div', { class: 'seg', title: 'Simulation rate' }, ...[1, 2, 4].map((r) => h('button', { class: r === 1 ? 'on' : '', onclick: () => setRate(r) }, `${r}×`)));
const cockpitSeg = h('div', { class: 'seg', title: 'Cockpit type' }, ...([['g1000', 'G1000'], ['steam', 'Steam'], ['airliner', 'Airliner']] as const).map(([c, l]) => h('button', { 'data-c': c, onclick: () => setCockpit(c) }, l)));
const viewSeg = h('div', { class: 'seg', title: 'Outside view (Tab)' }, ...(['normal', 'big', 'none'] as const).map((m) => h('button', { 'data-m': m, onclick: () => setOtw(m) }, m === 'normal' ? 'View' : m === 'big' ? 'Big' : 'Panel')));

const muteBtn = h('button', { class: 'btn ghost', title: 'Sound on/off (M)', onclick: () => toggleMute() }, icon(audio.muted ? I.mute : I.sound));
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
const moreMenu = h('div', { class: 'menu', role: 'menu' });
const moreItem = (ic: string, label: string, kbd: string, fn: () => void) =>
  h('button', { class: 'menu-item', role: 'menuitem', onclick: () => { moreMenu.classList.remove('open'); fn(); } }, icon(ic), h('span', {}, label), kbd ? h('kbd', {}, kbd) : null);
moreMenu.append(
  moreItem(I.gear, 'Settings', ',', () => settings.open()),
  moreItem(I.cloud, 'Weather', '', () => weatherModal.open()),
  moreItem(I.joy, 'Joystick & controls', '', () => joyModal.open()),
  moreItem(I.chart, 'Debrief', 'Shift D', () => openDebrief()),
  moreItem(I.records, 'Training records', '', () => historyModal.open()),
  moreItem(I.learn, 'Learning paths', 'J', () => learn.open()),
  moreItem(I.proc, 'IFR circuit builder', 'U', () => builder.edit()),
  moreItem(I.help, 'Keyboard shortcuts', '?', () => help.open()),
  h('div', { class: 'menu-sep' }),
  h('div', { class: 'menu-row' }, h('span', {}, 'Outside view'), viewSeg),
  h('div', { class: 'menu-row' }, h('span', {}, 'Sim rate'), rateSeg),
);
const moreBtn = h('button', { class: 'btn', title: 'More', 'aria-haspopup': 'menu', onclick: (e: Event) => { e.stopPropagation(); moreMenu.classList.toggle('open'); } }, icon(I.more), h('span', { class: 'lbl' }, 'More'));
document.addEventListener('click', (e) => { if (!moreMenu.contains(e.target as Node)) moreMenu.classList.remove('open'); });
const topbar = h('header', { class: 'topbar' },
  h('div', { class: 'brand' }, h('img', { class: 'logo', src: '/favicon.svg', alt: '' }), h('span', { class: 'brand-t' }, 'IFR Trainer')),
  h('div', { class: 'scn' }, scnName, scnSub),
  phaseChip,
  wxChip,
  h('div', { class: 'spacer' }),
  h('div', { class: 'tb-actions' },
    h('button', { class: 'btn primary', onclick: () => fc.open(), title: 'Flight Center — all flights, exercises and paths (F2)' }, icon(I.plane), h('span', { class: 'lbl' }, 'Flight Center')),
    h('div', { class: 'tb-group' },
      h('button', { class: 'btn', onclick: () => charts.toggle(), title: 'Charts (K)' }, icon(I.map), h('span', { class: 'lbl' }, 'Charts')),
      h('button', { class: 'btn', onclick: () => procModal.open(), title: 'Load an approach (X)' }, icon(I.proc), h('span', { class: 'lbl' }, 'Procedures')),
      h('button', { class: 'btn', onclick: () => directModal.open(), title: 'Direct-To (D)' }, icon(I.route), h('span', { class: 'lbl' }, 'D→')),
    ),
    h('button', { class: 'btn', onclick: () => ios.toggle(), title: 'Instructor station (I)' }, icon(I.ios), h('span', { class: 'lbl' }, 'Instructor')),
    cockpitSeg,
    pauseBtn,
    muteBtn,
    h('div', { class: 'menu-wrap' }, moreBtn, moreMenu),
  ),
);

// outside view
const otwCanvas = h('canvas', { 'aria-label': 'Outside view' });
const coach = h('div', { class: `coach${store.get('ifr.coachMin', false) ? ' min' : ''}` });
const badges = h('div', { class: 'otw-badges' });
const glCanvas = h('canvas', { 'aria-label': 'Outside view (3D)', class: 'gl' });
const glare = h('div', { class: 'glare' });
const lookHint = h('div', { class: 'look-hint' }, 'Drag to look around · double-click to recentre');
const otw = h('section', { class: 'otw' }, otwCanvas, glCanvas, glare, lookHint, coach, badges, toasts);
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
  glCanvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; glCanvas.setPointerCapture(e.pointerId); otw.classList.add('looked'); });
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

const apKeys = () => {
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
    k('VNV', () => toast('VNAV not available in this unit — use VS/FLC or APR', 'warn'), 'Vertical navigation'),
    k('APR', () => sim.ap.pressApr(d(), n()), 'Approach mode (R)'),
    k('BC', () => sim.ap.pressApr(d(), n()), 'Back course (auto via APR)'),
    k('VS', () => sim.ap.pressVs(d()), 'Vertical speed (V)'),
    k('FLC', () => sim.ap.pressFlc(d()), 'Flight level change (K)'),
    k('UP', () => sim.ap.nose(1), 'Nose up'),
    k('DN', () => sim.ap.nose(-1), 'Nose down'),
  );
};

const pfdBezel = h('div', { class: 'bezel pfd' },
  h('div', { class: 'brand-mark', 'data-l': '1' }, 'PFD'),
  h('div', { class: 'side left' },
    knob({ label: 'NAV', sub: 'NAV1 STBY', dual: true, onTurn: (d, c) => tune(sim.av.nav1, d, c, 108, 118, 0.05) }),
    bkey('NAV ⇆', () => swap(sim.av.nav1), 'Swap NAV1 active/standby'),
    knob({ label: 'HDG', sub: 'PUSH SYNC', onTurn: hdgBy, onPush: () => (sim.ap.hdgBug = Math.round(sim.ac.data.hdgTrue) || 360) }),
    apKeys(),
    knob({ label: 'ALT', sub: 'PUSH = CUR', dual: true, onTurn: altBy, onPush: () => (sim.ap.altSel = Math.round(sim.indicatedAlt() / 100) * 100) }),
  ),
  h('div', { class: 'screen' }, pfdCanvas),
  h('div', { class: 'side right' },
    knob({ label: 'COM', sub: 'COM1 STBY', dual: true, onTurn: (d, c) => tune(sim.av.com1, d, c, 118, 137, 0.025) }),
    bkey('COM ⇆', () => swap(sim.av.com1), 'Swap COM1'),
    knob({ label: 'CRS', sub: 'PUSH CTR', onTurn: (d, c) => sim.setCourse(sim.course() + d * (c ? 10 : 1)), onPush: () => centerCdi() }),
    knob({ label: 'BARO', sub: 'PUSH QNH', onTurn: (d, c) => (sim.av.baro = Math.round((sim.av.baro + d * (c ? 0.1 : 0.01)) * 100) / 100), onPush: () => setQnh() }),
    knob({ label: 'MINS', sub: 'BARO MIN', onTurn: (d, c) => (sim.av.minimums = Math.max(0, (sim.av.minimums ?? Math.round(sim.indicatedAlt() / 100) * 100) + d * (c ? 100 : 10))), onPush: () => (sim.av.minimums = null) }),
    h('div', { class: 'bkey-grid' },
      bkey('D→', () => directModal.open(), 'Direct-To (D)'),
      bkey('PROC', () => procModal.open(), 'Procedures (X)'),
      bkey('FPL', () => (mfdSt.showFpl = !mfdSt.showFpl), 'Flight plan'),
      bkey('TOGA', () => goAround(), 'Go-around (G)'),
    ),
  ),
);
const mfdBezel = h('div', { class: 'bezel mfd' },
  h('div', { class: 'brand-mark', 'data-r': '1' }, 'MFD'),
  h('div', { class: 'side left' },
    knob({ label: 'NAV2', sub: 'STBY', dual: true, onTurn: (d, c) => tune(sim.av.nav2, d, c, 108, 118, 0.05) }),
    bkey('NAV2 ⇆', () => swap(sim.av.nav2), 'Swap NAV2'),
    knob({ label: 'ADF', sub: 'kHz', dual: true, onTurn: (d, c) => (sim.av.adf.active = Math.max(190, Math.min(1750, sim.av.adf.active + d * (c ? 100 : 1)))) }),
    bkey('CDI', () => doAction('cdi'), 'Cycle CDI (C)'),
    bkey('CHARTS', () => charts.toggle(), 'Charts (K)'),
    bkey('MISSED', () => goAround(), 'Activate missed approach'),
  ),
  h('div', { class: 'screen' }, mfdCanvas),
  h('div', { class: 'side right' },
    knob({ label: 'RANGE', sub: 'MAP', onTurn: (d) => (mfdSt.rangeIdx = Math.max(0, Math.min(8, mfdSt.rangeIdx - d))) }),
    h('div', { class: 'bkey-grid' },
      bkey('D→', () => directModal.open()),
      bkey('PROC', () => procModal.open()),
      bkey('FPL', () => (mfdSt.showFpl = !mfdSt.showFpl)),
      bkey('ACT', () => { sim.fp.activateApproach(sim.ac.s); toast('Approach activated', 'good'); }, 'Activate approach'),
      bkey('VTF', () => { sim.fp.vectorsToFinal(); toast('Vectors to final', 'good'); }, 'Vectors to final'),
      bkey('CLR', () => Modal.closeAll()),
    ),
    knob({ label: 'FMS', sub: 'LEG', onTurn: (d) => sim.fp.activateLeg(Math.max(1, Math.min(sim.fp.wpts.length - 1, sim.fp.active + d))), title: 'Select active leg' }),
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
  h('div', { class: 'mcp-group' }, mcpSpd.el, mcpKey('FLCH', () => sim.ap.pressFlc(sim.ac.data), 'FLC')),
  h('div', { class: 'mcp-group' }, mcpKey('LNAV', () => { if (sim.av.cdi !== 'GPS') sim.setCdi('GPS'); sim.ap.pressNav(sim.ac.data, sim.navInputs()); }, 'LNAV'), mcpKey('VOR LOC', () => { if (sim.av.cdi === 'GPS') sim.setCdi('NAV1'); sim.ap.pressNav(sim.ac.data, sim.navInputs()); }, 'VORLOC'), mcpKey('APP', () => sim.ap.pressApr(sim.ac.data, sim.navInputs()), 'APR')),
  h('div', { class: 'mcp-group' }, mcpHdg.el, knob({ label: 'HDG', onTurn: hdgBy, onPush: () => (sim.ap.hdgBug = Math.round(sim.ac.data.hdgTrue) || 360) }), mcpKey('HDG SEL', () => sim.ap.pressHdg(sim.ac.data), 'HDG')),
  h('div', { class: 'mcp-group' }, mcpAlt.el, knob({ label: 'ALT', dual: true, onTurn: altBy }), mcpKey('ALT HOLD', () => sim.ap.pressAlt(sim.ac.data), 'ALT')),
  h('div', { class: 'mcp-group' }, mcpVs.el, knob({ label: 'V/S', onTurn: (d) => { if (sim.ap.vert !== 'VS') sim.ap.pressVs(sim.ac.data); sim.ap.vsSel = Math.max(-2000, Math.min(1500, sim.ap.vsSel + d * 100)); } }), mcpKey('V/S', () => sim.ap.pressVs(sim.ac.data), 'VS')),
  h('div', { class: 'mcp-group' }, mcpKey('A/P DISC', () => sim.ap.disconnect(), 'DISC'), mcpKey('TO/GA', () => goAround(), 'TOGA')),
);
const cockpit = h('main', { class: 'cockpit' }, otw, mcp, panel);
const BEZEL_LABELS: Record<CockpitType, [string, string]> = { g1000: ['PFD', 'MFD'], steam: ['FLIGHT INSTRUMENTS', 'NAV / COM STACK'], airliner: ['CAPT PFD', 'NAVIGATION DISPLAY'] };
function setCockpit(t: CockpitType, announce = true) {
  cockpitType = t;
  store.set('ifr.cockpit', t);
  panel.classList.remove('theme-g1000', 'theme-steam', 'theme-airliner');
  panel.classList.add(`theme-${t}`);
  cockpit.classList.toggle('with-mcp', t === 'airliner');
  pfdBezel.querySelector('[data-l]')!.textContent = BEZEL_LABELS[t][0];
  mfdBezel.querySelector('[data-r]')!.textContent = BEZEL_LABELS[t][1];
  cockpitSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.c === t));
  if (announce) toast(t === 'g1000' ? 'Cockpit: G1000 glass' : t === 'steam' ? 'Cockpit: classic steam gauges' : 'Cockpit: airliner PFD/ND', 'info');
}

// footer
const thr = h('input', { type: 'range', min: 0, max: 100, value: 60, 'aria-label': 'Throttle' }) as HTMLInputElement;
let thrDragging = false;
thr.addEventListener('pointerdown', () => (thrDragging = true));
window.addEventListener('pointerup', () => (thrDragging = false));
thr.addEventListener('input', () => (sim.controls.throttle = Number(thr.value) / 100));
const thrVal = h('span', {}, '');
const flapBtns = [0, 1, 2, 3].map((i) => h('button', { onclick: () => (sim.controls.flaps = i), title: `Flaps ${i * 10}°` }, String(i * 10)));
const trimMeter = h('div', { class: 'meter center', title: 'Elevator trim' }, h('i', {}));
const elevMeter = h('div', { class: 'meter center', title: 'Elevator' }, h('i', {}));
const ailMeter = h('div', { class: 'meter center', title: 'Aileron' }, h('i', {}));
const stickDot = h('i', {});
const stick = h('div', { class: 'stick', title: 'Touch yoke: drag' }, stickDot);
const joyDot = h('span', { class: 'joy-dot' });
const joyLbl = h('span', {}, 'Keyboard');
const footer = h('footer', { class: 'footer' },
  h('div', { class: 'ctl' }, h('label', {}, 'Throttle'), thr, thrVal),
  h('div', { class: 'ctl' }, h('label', {}, 'Flaps'), h('div', { class: 'flaps' }, ...flapBtns)),
  h('div', { class: 'ctl' }, h('label', {}, 'Trim'), h('button', { class: 'btn', style: 'height:24px;padding:0 6px', onclick: () => (sim.controls.trim = Math.max(-1, sim.controls.trim - 0.05)), title: 'Nose down (Home)' }, '▼'), trimMeter, h('button', { class: 'btn', style: 'height:24px;padding:0 6px', onclick: () => (sim.controls.trim = Math.min(1, sim.controls.trim + 0.05)), title: 'Nose up (End)' }, '▲')),
  h('div', { class: 'ctl' }, h('label', {}, 'Yoke'), elevMeter, ailMeter, stick),
  h('div', { class: 'ctl', style: 'cursor:pointer', onclick: () => joyModal.open() }, joyDot, joyLbl),
  h('div', { class: 'spacer' }),
  h('div', { class: 'ctl' }, h('kbd', {}, '?'), ' shortcuts · ', h('kbd', {}, 'G'), ' go-around · ', h('kbd', {}, 'K'), ' charts'),
);

document.getElementById('app')!.append(topbar, cockpit, footer);
document.body.append(charts.el, ios.el);

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
  stick.addEventListener('pointerdown', (e) => { active = true; stick.setPointerCapture(e.pointerId); move(e); });
  stick.addEventListener('pointermove', (e) => active && move(e));
  const end = () => { active = false; input.virtual.roll = input.virtual.pitch = 0; stickDot.style.left = stickDot.style.top = '50%'; };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
}

// softkeys
function canvasPoint(c: HTMLCanvasElement, e: MouseEvent, W: number, H: number) {
  const r = c.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
}
pfdCanvas.addEventListener('click', (e) => {
  if (cockpitType !== 'g1000') return;
  const p = canvasPoint(pfdCanvas, e, PFD_W, PFD_H);
  const i = softkeyAt(p.x, p.y);
  if (i === null) return;
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
    case 'ALERTS': toast(sim.ac.s.fuelGal < 10 ? 'LOW FUEL' : 'No alerts', 'info'); break;
  }
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
mfdCanvas.addEventListener('click', (e) => {
  if (cockpitType !== 'g1000') return;
  const p = canvasPoint(mfdCanvas, e, MFD_W, MFD_H);
  const i = softkeyAt(p.x, p.y, MFD_H, MFD_W);
  if (i === null) return;
  mfdSt.softkeyFlash = i;
  setTimeout(() => (mfdSt.softkeyFlash = null), 150);
  switch (MFD_SOFTKEYS[i]) {
    case 'TERRAIN': mfdSt.terrain = !mfdSt.terrain; break;
    case 'NORTH UP': mfdSt.northUp = !mfdSt.northUp; break;
    case 'DCLTR': mfdSt.declutter = (mfdSt.declutter + 1) % 3; break;
    case 'FPL': mfdSt.showFpl = !mfdSt.showFpl; break;
    case 'PROC': procModal.open(); break;
    case 'CHKLIST': showChecklist(); break;
    case 'ENGINE': toast('Engine: all parameters normal', 'good'); break;
    case 'MAP': mfdSt.rangeIdx = 4; break;
  }
});
mfdCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  mfdSt.rangeIdx = Math.max(0, Math.min(8, mfdSt.rangeIdx + (e.deltaY > 0 ? 1 : -1)));
}, { passive: false });

// ------------------------------------------------------------------ actions
function togglePause() {
  sim.paused = !sim.paused;
  pauseBtn.replaceChildren(icon(sim.paused ? I.play : I.pause), h('span', { class: 'lbl' }, sim.paused ? 'Resume' : 'Pause'));
}
function setRate(r: number) {
  sim.rate = r;
  rateSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.textContent === `${r}×`));
  toast(`Sim rate ${r}×`);
}
function setOtw(m: 'normal' | 'big' | 'none') {
  otwMode = m;
  store.set('ifr.otw', m);
  cockpit.classList.toggle('big-otw', m === 'big');
  cockpit.classList.toggle('no-otw', m === 'none');
  viewSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.m === m));
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
  sim.av.timerStart = sim.av.timerStart === null ? sim.time : null;
  toast(sim.av.timerStart !== null ? 'Timer started' : 'Timer stopped');
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
  const lower = k.toLowerCase();
  if (/^[0-9]$/.test(k)) { sim.controls.throttle = k === '0' ? 1 : Number(k) / 10; return; }
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
    case ',': settings.open(); break;
    case 'm': toggleMute(); break;
    case 'g': goAround(); break;
    case 'b': setQnh(); break;
    case 't': toggleTimer(); break;
    case 'f': doAction(e.shiftKey ? 'flapsUp' : 'flapsDn'); break;
    case 'escape': case 'pause': togglePause(); break;
    case 'tab': setOtw(otwMode === 'normal' ? 'big' : otwMode === 'big' ? 'none' : 'normal'); e.preventDefault(); break;
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
function updateHeader() {
  scnName.textContent = sim.scenario?.name ?? 'Free flight';
  scnSub.textContent = sim.fp.approach ? `${sim.fp.approach.airport} ${sim.fp.approach.name}` : sim.scenario?.description ?? '';
}
let coachKey = '';
function updateCoach() {
  const d = sim.ac.data;
  const ph = sim.rec.phase(sim);
  phaseChip.textContent = sim.ac.s.crashed ? 'Crashed' : sim.paused ? 'Paused' : PHASE_LABEL[ph];
  phaseChip.className = `chip ${sim.ac.s.crashed ? 'warn' : sim.paused ? '' : 'live'}`;

  const imc = inCloud(sim);
  const w = sim.weather;
  wxChip.textContent = `${imc ? 'IMC' : 'VMC'} · ${w.ceilingFt >= 15000 ? 'CLR' : 'OVC' + String(Math.round(w.ceilingFt / 100)).padStart(3, '0')} · ${w.visibilitySm}SM · ${String(w.windDir).padStart(3, '0')}/${w.windKt}${w.gustKt ? 'G' + w.gustKt : ''}`;
  wxChip.className = `chip${imc ? ' warn' : ''}`;
  if (lesson) {
    const run = lesson;
    const st = run.step;
    const ctx = run.ctx(0);
    const ro = st?.readout ? st.readout(ctx) : '';
    const key = `lesson|${run.idx}|${run.currentViolation}|${ro}|${sim.paused}|${!!run.finished}`;
    if (key === coachKey) return;
    coachKey = key;
    coach.innerHTML = '';
    coach.classList.add('lesson');
    const steps = h('ul', { class: 'steps' }, ...run.rt.steps.map((x, i) => h('li', { class: i < run.idx ? 'ok' : i === run.idx ? 'cur' : '' }, i < run.idx ? '✓' : i === run.idx ? '▶' : '○', ' ', x.text)));
    coach.append(
      h('h4', {}, `Lesson · ${run.ex.title}`, h('span', { class: 'muted', style: 'font-size:11px' }, fmtTime(run.totalT))),
      h('div', { class: 'next' }, st ? st.text : run.finished ? 'Complete' : ''),
    );
    const ride = sim.assess.mode === 'checkride';
    if (st?.hint && !ride) coach.append(h('div', { class: 'hint', style: 'color:#9fb0c0;font-size:12.5px;margin-top:4px' }, st.hint));
    if (ro) coach.append(h('div', { class: 'ro' }, ro));
    if (run.currentViolation && !ride) coach.append(h('div', { class: 'viol' }, `⚠ ${run.currentViolation}`));
    coach.append(steps);
    coach.append(h('div', { class: 'acts' },
      h('button', { class: 'btn', onclick: () => pickExercise(run.ex, lessonPath) }, 'Restart'),
      run.ex.plate ? h('button', { class: 'btn', onclick: () => { charts.toggle(true); charts.show(run.ex.plate!); } }, 'Plate') : null,
      h('button', { class: 'btn', onclick: () => { run.abort(); } }, 'End'),
    ));
    return;
  }
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
    hints.push('Throttle full (0 key), release brakes, rotate at 55 KIAS.', 'Climb at 74 KIAS (Vy). AP: HDG + VS at 1000 ft AGL.');
  } else if (ph === 'landed') {
    next = d.gsKt > 2 ? 'Rollout — brakes (Space)' : 'Stopped. Nice work.';
    hints.push('Debrief opens automatically when you stop.');
  } else if (g.valid && to) {
    const ete = g.eteMin !== null ? ` · ${fmtTime(g.eteMin * 60)}` : '';
    next = `${g.holding ? 'Holding at' : 'Next'} <em>${to.ident}</em>${to.altMin ? ` · ≥ ${to.altMin} ft` : ''} · ${g.distNm.toFixed(1)} nm${ete}`;
    const ap = fp.approach;
    if (ap && !fp.approachActive) hints.push('Approach loaded but not active — ACT/VTF on the MFD bezel, or Procedures.');
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
  const minBtn = h('button', { onclick: () => { coach.classList.toggle('min'); store.set('ifr.coachMin', coach.classList.contains('min')); }, title: 'Minimise' }, '▾');
  coach.append(h('h4', {}, 'Coach', minBtn), h('div', { class: 'next', html: next }));
  if (hints.length) coach.append(h('ul', {}, ...hints.slice(0, 4).map((t) => h('li', {}, t))));
}

// ------------------------------------------------------------------ loop
let last = performance.now();
let coachAcc = 0;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const override = input.update(dt, sim.controls, sim.ap.ap && !sim.paused);
  if (override) {
    sim.ap.disconnect();
    toast('Autopilot disconnected — control input', 'warn');
  }
  sim.step(dt);
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
  if (!debriefShown && (sim.ac.s.crashed || (sim.rec.touchdown && sim.ac.s.onGround && sim.ac.data.gsKt < 2))) {
    endTimer += dt;
    if (endTimer > (sim.ac.s.crashed ? 2.5 : 1.5)) openDebrief();
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
    mcpSpd.v.textContent = sim.ap.vert === 'FLC' ? String(sim.ap.iasSel) : '---';
    mcpHdg.v.textContent = String(sim.ap.hdgBug).padStart(3, '0');
    mcpAlt.v.textContent = String(sim.ap.altSel).padStart(5, '0');
    mcpVs.v.textContent = sim.ap.vert === 'VS' ? `${sim.ap.vsSel > 0 ? '+' : ''}${sim.ap.vsSel}` : '';
    const a = sim.ap;
    const lit: Record<string, boolean> = { FD: a.fd, AP: a.ap, FLC: a.engaged && a.vert === 'FLC', LNAV: a.engaged && (a.lat === 'GPS' || a.latArmed === 'GPS'), VORLOC: a.engaged && (['VOR', 'LOC', 'BC'].includes(a.lat) || ['VOR', 'LOC', 'BC'].includes(a.latArmed ?? '')), APR: a.apprMode, HDG: a.engaged && a.lat === 'HDG', ALT: a.engaged && a.vert === 'ALT', VS: a.engaged && a.vert === 'VS' };
    mcp.querySelectorAll<HTMLElement>('[data-mcp]').forEach((b) => b.classList.toggle('on', !!lit[b.dataset.mcp!]));
  } else {
    drawPfd(lctx, sim, pfdSt, sim.paused ? 0 : dt);
    drawMfd(rctx, sim, mfdSt);
  }
  charts.update();
  ios.update(dt);
  audio.update(sim, dt);

  // footer
  if (!thrDragging) thr.value = String(Math.round(sim.controls.throttle * 100));
  thrVal.textContent = `${Math.round(sim.controls.throttle * 100)}% · ${Math.round(sim.ac.data.rpm / 10) * 10} RPM`;
  flapBtns.forEach((b, i) => b.classList.toggle('on', Math.round(sim.controls.flaps) === i));
  const setMeter = (m: HTMLElement, v: number) => {
    const i = m.firstChild as HTMLElement;
    i.style.left = v < 0 ? `${50 + v * 50}%` : '50%';
    i.style.width = `${Math.abs(v) * 50}%`;
  };
  setMeter(trimMeter, sim.controls.trim);
  setMeter(elevMeter, sim.controls.elevator);
  setMeter(ailMeter, sim.controls.aileron);
  joyDot.classList.toggle('on', !!input.current());
  joyLbl.textContent = input.current() ? input.current()!.id.split('(')[0].trim().slice(0, 28) || 'Joystick' : 'Keyboard (connect a joystick)';
  pfdBezel.querySelectorAll<HTMLElement>('[data-ap]').forEach((b) => {
    const l = b.dataset.ap;
    const ap = sim.ap;
    const on = (l === 'AP' && ap.ap) || (l === 'FD' && ap.fd) || (l === 'HDG' && ap.engaged && ap.lat === 'HDG') || (l === 'ALT' && ap.engaged && ap.vert === 'ALT') || (l === 'NAV' && ap.engaged && (['GPS', 'VOR', 'LOC'].includes(ap.lat) || !!ap.latArmed)) || (l === 'APR' && ap.apprMode) || (l === 'BC' && ap.lat === 'BC') || (l === 'VS' && ap.engaged && ap.vert === 'VS') || (l === 'FLC' && ap.engaged && ap.vert === 'FLC');
    b.classList.toggle('on', !!on);
  });
  coachAcc += dt;
  if (coachAcc > 0.25) {
    coachAcc = 0;
    updateCoach();
  }
  requestAnimationFrame(frame);
}

// test/automation hook
(window as unknown as { __ifr: unknown }).__ifr = { sim, get outside() { return outside; } };

// ------------------------------------------------------------------ boot
setOtw(otwMode);
setCockpit(cockpitType, false);
requestAnimationFrame(() => setTimeout(() => void initOutside(), 50));
updateHeader();
updateCoach();
requestAnimationFrame(frame);
fc.open();
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
