// The simulation world: aircraft + weather + avionics state.
import { seedSim } from './rng';
import { Aircraft, neutralControls, type Controls } from './aircraft';
import { defaultWeather, KT, type Weather } from './environment';
import { Autopilot, type CdiSource, type NavInputs } from '../avionics/autopilot';
import { computeAdf, computeNav, EMPTY_NAV, markerBeacon, type AdfOutput, type NavOutput } from '../nav/radios';
import { Recorder } from './recorder';
import { SystemsModel } from './systems';
import { defaultSwitches, FAILURE_LABELS_EN, FAILURE_LABELS_FR, SWITCH_LABELS_EN, SWITCH_LABELS_FR, switchValueText, switchValueTextFr, type FailureKey, type Switches, type SystemsState } from './systemsTypes';
import { FlightPlan, isLocApproach } from '../nav/flightplan';
import { AIRPORTS, NAVAIDS, groundElevation, runway, findFix, approach, terrainEpoch } from '../nav/data';
import { destination, distanceNm, bearingDeg, DEG, FT_PER_NM, crossTrackNm, alongTrackNm, wrap180, type LatLon } from '../nav/geo';

export interface Radio {
  active: number;
  standby: number;
}

export interface Avionics {
  nav1: Radio;
  nav2: Radio;
  com1: Radio;
  com2: Radio;
  obs1: number;
  obs2: number;
  cdi: CdiSource;
  baro: number; // altimeter setting inHg
  minimums: number | null; // baro minimums ft
  xpdr: string;
  xpdrMode: 'STBY' | 'ON' | 'ALT';
  timerStart: number | null;
  /** chronometer value frozen when stopped (s), null when reset */
  timerHold: number | null;
  bearing1: 'OFF' | 'NAV1' | 'GPS' | 'ADF';
  bearing2: 'OFF' | 'NAV2' | 'GPS' | 'ADF';
  adf: Radio;
  inset: boolean;
}

/** the avionics of a fresh page: radios, courses, sources, transponder (the lesson baseline starts from it) */
export const defaultAvionics = (): Avionics => ({
  nav1: { active: 110.3, standby: 114.2 },
  nav2: { active: 114.2, standby: 112.7 },
  com1: { active: 119.85, standby: 118.3 },
  com2: { active: 127.65, standby: 121.9 },
  obs1: 270,
  obs2: 90,
  cdi: 'GPS',
  baro: 29.92,
  minimums: 670,
  xpdr: '1200',
  xpdrMode: 'ALT',
  timerStart: null,
  timerHold: null,
  bearing1: 'OFF',
  bearing2: 'OFF',
  adf: { active: 344, standby: 344 },
  inset: true,
});

/** every injectable failure (see src/sim/systemsTypes.ts FailureKey) */
export type Failures = Record<FailureKey, boolean>;
export const FAILURE_LABELS: Record<FailureKey, string> = FAILURE_LABELS_EN;
export const noFailures = (): Failures => Object.fromEntries((Object.keys(FAILURE_LABELS_EN) as FailureKey[]).map((k) => [k, false])) as Failures;

/** Installed avionics: lets schools train on equipment-limited aircraft (no GPS, no autopilot…). */
export interface Equipment {
  gps: boolean;
  ap: boolean;
  adf: boolean;
  dme: boolean;
  nav2: boolean;
}
export const fullEquipment = (): Equipment => ({ gps: true, ap: true, adf: true, dme: true, nav2: true });

export interface AssessSettings {
  mode: 'training' | 'checkride';
  student: string;
  handFlown: boolean;
  randomFailure: boolean;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  pos: LatLon;
  altFt: number;
  hdg: number;
  iasKt: number;
  onGround?: boolean;
  /** Category shown on the launcher card */
  kind: 'Departure' | 'Precision' | 'APV' | 'Non-precision' | 'Holding' | 'Free flight';
  difficulty: 1 | 2 | 3;
  approachId?: string;
  weather?: Partial<Weather>;
  briefing: string[];
  setup?: (s: Sim) => void;
}

function onRunway(p: LatLon): boolean {
  for (const a of AIRPORTS) {
    for (const r of a.runways) {
      const len = distanceNm(r.threshold, r.end);
      const at = alongTrackNm(r.threshold, r.end, p);
      const xt = Math.abs(crossTrackNm(r.threshold, r.end, p)) * FT_PER_NM;
      if (at > -0.15 && at < len + 0.15 && xt < r.widthFt / 2 + 60) return true;
    }
  }
  return false;
}

export class Sim {
  ac!: Aircraft;
  weather: Weather = defaultWeather();
  controls: Controls = neutralControls();
  ap = new Autopilot();
  fp = new FlightPlan();
  av: Avionics = defaultAvionics();
  nav1: NavOutput = EMPTY_NAV;
  nav2: NavOutput = EMPTY_NAV;
  marker: 'O' | null = null;
  adf: AdfOutput = { valid: false, ident: '', bearingTo: 0, distNm: 0 };
  rec = new Recorder();
  /** failure injection (instructor station) */
  failures: Failures = noFailures();
  /** what the pilot can switch (masters, mixture, magnetos, fuel selector…): change it with setSwitch() */
  sw: Switches = defaultSwitches();
  /** aircraft systems model (electrical, vacuum, pitot-static, engine/fuel/oil, fire…) */
  systems = new SystemsModel();
  /** what the systems read: gauges, annunciators, powered consumers, indicated air data */
  sys: SystemsState = this.systems.r;
  /** a mixture change waiting to be logged once the knob has settled */
  private mixturePending: { t: number; from: number } | null = null;
  /** assessment settings */
  assess: AssessSettings = { mode: 'training', student: '', handFlown: false, randomFailure: false };
  private randomFailureArmed: keyof Failures | null | undefined = null;
  get gsFailed() {
    return this.failures.gs;
  }
  set gsFailed(v: boolean) {
    this.failures.gs = v;
  }
  time = 0;
  paused = false;
  /** installed avionics */
  equip: Equipment = fullEquipment();
  /** true while the debrief replay drives the aircraft */
  replaying = false;
  /** chronometer elapsed seconds (running or stopped), null when reset */
  chrono(): number | null {
    return this.av.timerStart !== null ? this.time - this.av.timerStart : this.av.timerHold;
  }
  /** CHR button: start → stop → reset */
  chronoButton(): 'start' | 'stop' | 'reset' {
    if (this.av.timerStart !== null) {
      this.av.timerHold = this.time - this.av.timerStart;
      this.av.timerStart = null;
      return 'stop';
    }
    if (this.av.timerHold !== null) {
      this.av.timerHold = null;
      return 'reset';
    }
    this.av.timerStart = this.time;
    return 'start';
  }
  chronoStartStop(): void {
    if (this.av.timerStart !== null) this.chronoButton();
    else {
      this.av.timerStart = this.time - (this.av.timerHold ?? 0);
      this.av.timerHold = null;
    }
  }
  chronoReset(): void {
    this.av.timerStart = this.av.timerStart !== null ? this.time : null;
    this.av.timerHold = null;
  }
  /** pilot eye height above the wheels (ft): 7 for a C172, ~18 in the airliner cockpit */
  cockpitEyeFt = 7;
  rate = 1;
  /**
   * Garmin automatic GPS → LOC1 CDI switch on a localizer-based approach (G1000; GNS 'ILS CDI: Auto').
   * false = Manual (GNS 430W AUX setting, or the instructor's 'CDI left on GPS' trap): the pilot presses CDI.
   */
  autoCdi = true;
  /** approach phase already switched automatically (the pilot may switch back by hand without a fight) */
  private autoCdiDone = '';
  private lastMissed = false;
  private lastFmsKey = -1e9;
  scenario: Scenario | null = null;
  private lastPitch = 0;
  private lastRoll = 0;
  events: string[] = [];

  constructor(sc?: Scenario) {
    this.load(sc ?? SCENARIOS[1]);
  }

  load(sc: Scenario) {
    seedSim(sc.id);
    this.scenario = sc;
    this.ap = new Autopilot();
    this.fp = new FlightPlan();
    this.wireFlightPlan();
    this.autoCdiDone = '';
    this.lastMissed = false;
    this.failures = noFailures();
    this.sw = defaultSwitches();
    this.mixturePending = null;
    this.equip = fullEquipment();
    this.weather = defaultWeather();
    this.randomFailureArmed = null;
    this.controls = neutralControls();
    const ground = groundElevation(sc.pos);
    this.ac = new Aircraft(
      {
        lat: sc.pos.lat,
        lon: sc.pos.lon,
        altFt: sc.onGround ? ground : sc.altFt,
        psi: sc.hdg * DEG,
        tas: sc.onGround ? 0 : sc.iasKt * KT * (1 + sc.altFt / 1000 * 0.015),
        onGround: !!sc.onGround,
        theta: sc.onGround ? 0 : 1 * DEG,
      },
      groundElevation,
    );
    this.ac.onRunwayCheck = onRunway;
    if (sc.onGround) {
      this.controls.throttle = 0;
      this.controls.trim = 0; // take-off trim mark
      this.controls.brake = 0;
    } else {
      // rough trim for the requested speed
      this.controls.trim = sc.iasKt < 95 ? -0.17 : -0.3;
      this.controls.throttle = sc.iasKt < 95 ? 0.5 : 0.68;
    }
    this.ap.hdgBug = sc.hdg;
    this.ap.altSel = Math.round(sc.altFt / 100) * 100;
    this.time = 0;
    this.systems.reset(this);
    if (sc.weather) Object.assign(this.weather, sc.weather);
    sc.setup?.(this);
    this.ac.step(0.01, this.controls, this.weather);
    this.systems.step(0, this);
    this.systems.flightReady();
    this.updateAvionics(0);
    this.terrainSeen = terrainEpoch;
    this.rec.start(this);
  }

  /** every pilot edit of the flight plan goes in the flight record (debrief timeline, box-task grading) */
  private wireFlightPlan() {
    this.fp.onEdit = (op, detail) => this.rec.log(this.time, 'info', `FMS ${op}${detail ? ': ' + detail : ''}`);
  }

  /** Load an approach the way a pilot would: FPL, minimums, CRS and NAV frequency. */
  loadApproach(id: string, transition: string | null, mode: 'load' | 'activate' | 'vtf' = 'activate') {
    this.fp.loadApproach(id, transition);
    this.autoCdiDone = '';
    const ap = this.fp.approach!;
    const m = ap.minimums[0];
    this.av.minimums = (m.da ?? m.mda) ?? null;
    const nav = ap.navaid ? NAVAIDS.find((n) => n.ident === ap.navaid) : undefined;
    if (nav && nav.type !== 'NDB') {
      this.av.nav1.standby = this.av.nav1.active;
      this.av.nav1.active = nav.freq;
      this.av.obs1 = ap.crsSetting ?? ap.finalCourse;
    }
    if (nav && nav.type === 'NDB') {
      this.av.adf.active = nav.freq;
      this.av.bearing1 = 'ADF';
    }
    if (mode === 'activate') this.fp.activateApproach(this.ac.s);
    if (mode === 'vtf') this.fp.vectorsToFinal();
  }

  step(dtReal: number) {
    if (this.paused || this.ac.s.crashed) {
      this.updateAvionics(0);
      return;
    }
    const dt = Math.min(0.1, dtReal) * this.rate;
    this.time += dt;
    if (terrainEpoch !== this.terrainSeen) this.reseatOnTerrain();
    if (this.failures.engine) this.controls.throttle = 0;
    this.maybeRandomFailure();
    this.ac.step(dt, this.controls, this.weather);
    this.systems.step(dt, this);
    this.flushMixtureLog();
    this.updateAvionics(dt);
    this.rec.update(this, dt);
  }

  private terrainSeen = terrainEpoch;
  /** terrain data changed under the aircraft (late terrain tiles, region swap): a data update must never
   *  read as an impact — keep a ground roll on the new surface and an airborne aircraft above it */
  private reseatOnTerrain() {
    this.terrainSeen = terrainEpoch;
    const s = this.ac.s;
    const g = groundElevation(s);
    if (s.onGround) s.altFt = g;
    else if (s.altFt < g + 3) {
      s.altFt = g + 3;
      s.gamma = Math.max(s.gamma, 0);
    }
  }

  navInputs(): NavInputs {
    const nav = this.av.cdi === 'NAV2' ? this.nav2 : this.nav1;
    return { cdi: this.av.cdi, nav, gps: this.fp.out };
  }

  updateAvionics(dt: number) {
    const s = this.ac.s;
    const d = this.ac.data;
    const pos = { lat: s.lat, lon: s.lon, altFt: s.altFt };
    this.nav1 = computeNav(this.av.nav1.active, this.av.obs1, pos);
    this.nav2 = computeNav(this.av.nav2.active, this.av.obs2, pos);
    const f = this.failures;
    if (f.gs) {
      this.nav1 = { ...this.nav1, gsValid: false };
      this.nav2 = { ...this.nav2, gsValid: false };
    }
    if (f.nav1) this.nav1 = { ...EMPTY_NAV, course: this.av.obs1 };
    if (f.gps) {
      this.fp.out.valid = false;
      this.fp.out.gpValid = false;
    }
    // no electrical power: the receivers and the GPS go dark with their bus
    const el = this.sys.elec;
    if (!el.nav1) this.nav1 = { ...EMPTY_NAV, course: this.av.obs1 };
    if (!el.nav2) this.nav2 = { ...EMPTY_NAV, course: this.av.obs2 };
    if (!el.gps) {
      this.fp.out.valid = false;
      this.fp.out.gpValid = false;
    }
    if (f.ap && this.ap.ap) this.ap.disconnect();
    this.ap.inhibited = !this.equip.ap ? 'NO AUTOPILOT' : f.ap || f.ahrs || f.airData || !el.ap || this.sys.trimRunning ? 'AP FAIL' : this.assess.handFlown && this.assess.mode === 'checkride' ? 'HAND-FLOWN CHECKRIDE' : null;
    if (this.ap.inhibited && this.ap.ap) this.ap.disconnect();
    this.marker = markerBeacon(pos);
    this.adf = computeAdf(this.av.adf.active, pos);
    const eq = this.equip;
    if (!eq.adf || !el.adf) this.adf = { valid: false, ident: '', bearingTo: 0, distNm: 0 };
    if (!eq.dme) {
      this.nav1 = { ...this.nav1, dmeNm: null };
      this.nav2 = { ...this.nav2, dmeNm: null };
    }
    if (!eq.nav2) this.nav2 = { ...EMPTY_NAV, course: this.av.obs2 };
    if (!eq.gps) {
      this.fp.out.valid = false;
      this.fp.out.gpValid = false;
      if (this.av.cdi === 'GPS') this.av.cdi = 'NAV1';
    }
    if (this.fp.onEdit === null) this.wireFlightPlan(); // a plan swapped in from outside (planner, real world)
    this.fp.update(pos, d.gsKt, d.trackTrue);
    this.autoCdiSwitch();
    if (dt > 0) {
      const pr = (d.pitchDeg - this.lastPitch) / dt;
      const rr = (d.rollDeg - this.lastRoll) / dt;
      this.ap.update(dt, d, this.navInputs(), this.controls, pr, rr);
    }
    this.lastPitch = d.pitchDeg;
    this.lastRoll = d.rollDeg;
  }

  /** Instructor reposition: put the aircraft at a point of the loaded approach, trimmed at 90 KIAS. */
  reposition(kind: 'iaf' | 'if' | 'final10' | 'final5' | 'runway'): boolean {
    const ap = this.fp.approach;
    if (!ap) return false;
    const rw = runway(ap.airport, ap.runway);
    let pos: LatLon;
    let alt: number;
    let hdg = ap.finalCourse;
    if (kind === 'iaf' || kind === 'if') {
      const tr = ap.transitions[0];
      const leg = kind === 'iaf' && tr ? tr.legs[0] : ap.final[0];
      const nextFix = kind === 'iaf' && tr ? tr.legs[1].fix : ap.final[1].fix;
      pos = destination(leg.fix, bearingDeg(nextFix, leg.fix), 2);
      alt = leg.altMin ?? 3000;
      hdg = bearingDeg(pos, nextFix);
    } else if (kind === 'runway') {
      pos = destination(rw.threshold, rw.heading, 0.05);
      alt = rw.elevFt;
    } else {
      const dist = kind === 'final10' ? 10 : 5;
      const mapFix = ap.final[ap.final.length - 1].fix;
      pos = destination(mapFix, ap.finalCourse + 180, dist);
      const faf = ap.final.find((l) => l.role === 'FAF');
      alt = ap.gsAngle ? rw.elevFt + (ap.tch ?? 50) + dist * 318.4 : Math.max(faf?.altMin ?? 2000, rw.elevFt + 1000);
      alt = Math.round(alt / 10) * 10;
    }
    const onGround = kind === 'runway';
    const fuel = this.ac.s.fuelGal;
    this.ac = new Aircraft(
      { lat: pos.lat, lon: pos.lon, altFt: onGround ? groundElevation(pos) : alt, psi: hdg * DEG, tas: onGround ? 0 : 90 * KT * (1 + alt / 1000 * 0.015), onGround, theta: onGround ? 0 : 1.5 * DEG },
      groundElevation,
    );
    this.ac.onRunwayCheck = onRunway;
    this.ac.s.fuelGal = fuel; // the fuel on board stays on board
    this.controls.throttle = onGround ? 0 : 0.5;
    this.controls.trim = onGround ? 0 : -0.17;
    this.controls.flaps = 0;
    this.ap.hdgBug = Math.round(hdg) || 360;
    this.ap.altSel = Math.round(alt / 100) * 100;
    if (kind === 'final10' || kind === 'final5') this.fp.vectorsToFinal();
    else if (kind !== 'runway') this.fp.activateApproach(this.ac.s);
    this.ac.step(0.01, this.controls, this.weather);
    this.systems.step(0, this);
    this.updateAvionics(0);
    this.rec.log(this.time, 'info', `Instructor reposition: ${kind}`);
    return true;
  }

  /** Instructor: set or clear a failure, logged in the flight record. */
  setFailure(k: FailureKey, on: boolean) {
    if (!(k in FAILURE_LABELS) || !!this.failures[k] === on) return;
    this.failures[k] = on;
    this.rec.log(this.time, on ? 'warn' : 'info', `${on ? 'FAILURE' : 'Restored'}: ${FAILURE_LABELS[k]}`, `${on ? 'PANNE' : 'Rétabli'} : ${FAILURE_LABELS_FR[k]}`);
    if (k === 'ap' && on) this.ap.disconnect();
    this.systems.step(0, this);
    this.updateAvionics(0);
  }

  /** Pilot: operate a switch / control of the aircraft systems. Logged as a readable event ('Mixture → IDLE
   *  CUT-OFF', 'Fuel selector → OFF', 'Master ALT → OFF') and as an action for procedure grading. */
  setSwitch<K extends keyof Switches>(k: K, v: Switches[K]): void {
    const old = this.sw[k];
    if (k === 'mixture') v = Math.max(0, Math.min(1, Number(v))) as Switches[K];
    if (old === v) return;
    this.sw[k] = v;
    if (k === 'mixture') {
      // a knob turned in small steps logs once it has settled; IDLE CUT-OFF and FULL RICH log at once
      const m = Number(v);
      if (m < 0.06 || m >= 0.98) {
        this.mixturePending = null;
        this.logSwitch(k, v);
      } else if (this.mixturePending) this.mixturePending.t = this.time;
      else this.mixturePending = { t: this.time, from: Number(old) };
    } else this.logSwitch(k, v);
    this.systems.step(0, this);
    this.updateAvionics(0);
  }

  private logSwitch<K extends keyof Switches>(k: K, v: Switches[K]) {
    this.rec.action(this.time, k, v);
    this.rec.log(this.time, 'info', `${SWITCH_LABELS_EN[k]} → ${switchValueText(k, v)}`, `${SWITCH_LABELS_FR[k]} → ${switchValueTextFr(k, v)}`);
  }

  private flushMixtureLog() {
    const p = this.mixturePending;
    if (p && this.time - p.t > 1.2) {
      this.mixturePending = null;
      this.logSwitch('mixture', this.sw.mixture);
    }
  }

  /** Checkride option: one random failure somewhere on the approach. */
  private maybeRandomFailure() {
    if (!this.assess.randomFailure || this.randomFailureArmed === undefined) return;
    if (this.randomFailureArmed === null) {
      const pool: (keyof Failures)[] = ['gs', 'ap', 'ahrs', 'gps'];
      const ap = this.fp.approach;
      const choices = pool.filter((k) => (k === 'gs' ? ap?.type === 'ILS' : k === 'gps' ? ap?.type !== 'RNAV' : true));
      this.randomFailureArmed = choices[Math.floor(Math.random() * choices.length)] ?? 'ap';
    }
    const fafIdx = this.fp.wpts.findIndex((w) => w.role === 'FAF' && w.appr === 'final');
    if (fafIdx >= 0 && this.fp.active >= fafIdx - 1 && this.fp.out.distNm < 3 && this.fp.approachActive && Math.random() < 0.002) {
      this.setFailure(this.randomFailureArmed, true);
      this.randomFailureArmed = undefined;
    }
  }

  /** True when the pilot would see the runway environment (below the cloud base, within visibility). */
  hasVisual(): boolean {
    const ap = this.fp.approach;
    const s = this.ac.s;
    let near = AIRPORTS[0];
    for (const a of AIRPORTS) if (distanceNm(s, a) < distanceNm(s, near)) near = a;
    const base = near.elevFt + this.weather.ceilingFt;
    if (this.weather.ceilingFt < 15000 && s.altFt > base) return false;
    const thr = ap ? runway(ap.airport, ap.runway).threshold : near;
    const visNm = this.weather.visibilitySm / 1.15078;
    return distanceNm(s, thr) < visNm + 0.3;
  }

  /** Altitude the altimeter shows for the current baro setting — through the static system (a blocked static
   *  port freezes it, the alternate static source adds its small error). Displays read this. */
  indicatedAlt(): number {
    return this.baroAlt() + this.systems.altOffsetFt;
  }

  /** True altitude referenced to the baro setting (what a perfect altimeter would read): grading, callouts of the
   *  true flight path and the autopilot use this, never the faulty indication. */
  baroAlt(): number {
    return this.ac.s.altFt + (this.av.baro - this.weather.qnh) * 1000;
  }

  setCdi(src: CdiSource) {
    this.av.cdi = src;
    // G1000 auto-slews the course to the localizer when a LOC is selected (the receiver as tuned now, not as it was
    // on the last frame)
    const s = this.ac?.s;
    const pos = s ? { lat: s.lat, lon: s.lon, altFt: s.altFt } : null;
    const nav = !pos ? null : src === 'NAV1' ? (this.failures.nav1 ? null : computeNav(this.av.nav1.active, this.av.obs1, pos)) : src === 'NAV2' ? computeNav(this.av.nav2.active, this.av.obs2, pos) : null;
    if (nav && nav.isLoc) {
      if (src === 'NAV1') this.av.obs1 = nav.course;
      else this.av.obs2 = nav.course;
    }
  }

  cycleCdi() {
    const order: CdiSource[] = (['GPS', 'NAV1', 'NAV2'] as CdiSource[]).filter((c) => (c === 'GPS' ? this.equip.gps : c === 'NAV2' ? this.equip.nav2 : true));
    this.setCdi(order[(order.indexOf(this.av.cdi) + 1) % order.length]);
  }

  /** current course pointer value for the HSI */
  course(): number {
    if (this.av.cdi === 'GPS') return this.fp.obsMode ? this.fp.obsCourse || 360 : this.fp.out.dtk;
    return this.av.cdi === 'NAV1' ? this.av.obs1 : this.av.obs2;
  }

  /** CRS knob. With the GPS CDI in OBS mode it sets the OBS course through the active waypoint. */
  setCourse(v: number) {
    const n = ((Math.round(v) % 360) + 360) % 360 || 360;
    if (this.av.cdi === 'GPS' && this.fp.obsMode) this.fp.obsCourse = n;
    else if (this.av.cdi === 'NAV2') this.av.obs2 = n;
    else this.av.obs1 = n;
  }

  /** Direct-To a fix by ident (optionally on a selected course, magnetic). The flight plan is kept. */
  directTo(ident: string, course?: number): boolean {
    const f = findFix(ident);
    if (!f) return false;
    this.fp.directTo({ ident: f.ident, lat: f.lat, lon: f.lon }, this.ac.s, course !== undefined ? { course } : {});
    this.updateAvionics(0);
    return true;
  }

  /** a second call for the same physical press (bezel key and screen both wired) is ignored */
  private fmsDebounce(): boolean {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - this.lastFmsKey < 120) return false;
    this.lastFmsKey = now;
    return true;
  }

  /**
   * G1000 PFD OBS softkey. It reads SUSP while automatic sequencing is suspended (past the MAP, in a hold):
   * pressing it then resumes sequencing (missed approach / exit hold). Otherwise it toggles OBS mode on the GPS
   * CDI, with the OBS course starting at the current desired track.
   */
  obsKey(): 'obs-on' | 'obs-off' | 'resume' | null {
    const fp = this.fp;
    if (!fp.out.valid || !this.equip.gps) return null;
    if (!this.fmsDebounce()) return null;
    if (fp.obsMode) {
      fp.setObs(false);
      this.updateAvionics(0);
      return 'obs-off';
    }
    if (fp.out.suspended) {
      fp.resume();
      this.updateAvionics(0);
      return 'resume';
    }
    if (this.av.cdi !== 'GPS') return null;
    fp.setObs(true, fp.out.dtk);
    this.updateAvionics(0);
    return 'obs-on';
  }

  /** the PFD softkey label for slot 1: OBS, or SUSP while sequencing is suspended */
  obsKeyLabel(): 'OBS' | 'SUSP' {
    return this.fp.out.valid && this.fp.out.suspended && !this.fp.obsMode ? 'SUSP' : 'OBS';
  }

  /**
   * Garmin automatic CDI switching (G1000 Pilot's Guide, 'Automatic CDI switching'): GPS → LOC1 when a localizer
   * approach is active, the FAF is the active waypoint, within 15 NM and being approached, the localizer is tuned
   * in NAV1 and received, and the GPS deviation is under 1.2 × full scale; at once after Activate Vector-To-Final.
   * Activating the missed approach switches back to GPS.
   */
  private autoCdiSwitch() {
    const fp = this.fp;
    const g = fp.out;
    if (fp.missedActive && !this.lastMissed && this.autoCdi && this.equip.gps && this.av.cdi !== 'GPS' && g.valid) {
      this.setCdi('GPS');
      this.rec.log(this.time, 'info', 'CDI auto-switch: GPS (missed approach)');
    }
    this.lastMissed = fp.missedActive;
    const ap = fp.approach;
    if (!this.autoCdi || !ap || !isLocApproach(ap) || this.av.cdi !== 'GPS' || !g.valid || fp.missedActive || !fp.approachActive) return;
    const to = fp.wpts[fp.active];
    if (!to || to.role !== 'FAF' || to.appr !== 'final') return;
    const key = `${fp.approachId}|${fp.active}|${fp.vtf ? 'vtf' : 'leg'}`;
    if (this.autoCdiDone === key) return;
    const nav = ap.navaid ? NAVAIDS.find((n) => n.ident === ap.navaid) : undefined;
    const tuned = !!nav && Math.abs(this.av.nav1.active - nav.freq) < 0.005 && this.nav1.valid && this.nav1.isLoc;
    if (!tuned) return;
    const s = this.ac.s;
    const approaching = Math.abs(wrap180(bearingDeg(s, to) - this.ac.data.trackTrue)) < 90;
    const ok = fp.vtf || (g.distNm < 15 && approaching && Math.abs(g.dev) < 1.2);
    if (!ok) return;
    this.autoCdiDone = key;
    const coupled = this.ap.lat === 'GPS' || this.ap.latArmed === 'GPS';
    this.setCdi('NAV1');
    // GFC 700: with APR armed the autopilot goes on to capture the localizer and the glideslope
    if (this.ap.apprMode && coupled) {
      this.ap.latArmed = this.nav1.backCourse ? 'BC' : 'LOC';
      this.ap.vertArmed.gp = false;
      this.ap.vertArmed.gs = ap.type === 'ILS';
    }
    this.rec.log(this.time, 'info', `CDI auto-switch: LOC1 (${to.ident} ${g.distNm.toFixed(1)} NM)`);
  }
}

// --------------------------------------------------------------- Scenarios
const r27 = runway('PARD', '27');
const fixPos = (id: string) => findFix(id)!;

export const SCENARIOS: Scenario[] = [
  {
    id: 'rwy27',
    name: 'IFR departure — PARD RWY 27',
    kind: 'Departure',
    difficulty: 1,
    description: 'Lined up on runway 27. Take off into an 800 ft overcast, climb runway heading to 3000, then proceed direct ARD.',
    pos: destination(r27.threshold, 270, 0.05),
    altFt: 420,
    hdg: 270,
    iasKt: 0,
    onGround: true,
    weather: { ceilingFt: 1200, visibilitySm: 2 },
    briefing: [
      'Full power (Shift+Up or throttle axis), release brakes.',
      'Rotate at 55 KIAS, pitch ~8° nose up, climb at 74 KIAS (Vy).',
      'At 1000 ft press HDG then ALT/VS on the autopilot, or hand-fly to 3000.',
      'Use Direct-To (D) and type ARD to proceed to the VOR.',
    ],
    setup: (s) => {
      s.ap.altSel = 3000;
      s.ap.hdgBug = 270;
      s.av.minimums = null;
    },
  },
  {
    id: 'ils27-vtf',
    name: 'ILS RWY 27 — vectors to final',
    kind: 'Precision',
    difficulty: 1,
    approachId: 'PARD-I27',
    description: '14 nm east, 3000 ft, heading 240 to intercept the I-PRD localizer. Ceiling 500 ft.',
    pos: destination(destination(r27.threshold, 90, 14), 0, 3.2),
    altFt: 3000,
    hdg: 240,
    iasKt: 90,
    weather: { ceilingFt: 900, visibilitySm: 1 },
    briefing: [
      'NAV1 is tuned to I-PRD 110.30, CDI on LOC1, course 270.',
      'Press APR to arm LOC and GS (or hand-fly the intercept).',
      'Glideslope intercept at 3000 ft, cross MARLO (OM) at 2400.',
      'DA 670 ft — at minimums with the runway in sight, land; otherwise go around (G).',
    ],
    setup: (s) => {
      s.ap.hdgBug = 240;
      s.ap.altSel = 3000;
      s.loadApproach('PARD-I27', null, 'vtf');
      s.setCdi('NAV1');
    },
  },
  {
    id: 'ils27-full',
    name: 'ILS RWY 27 — full procedure via TOBEY',
    kind: 'Precision',
    difficulty: 2,
    approachId: 'PARD-I27',
    description: 'Enroute at 4000 ft, cleared ILS 27 via TOBEY. GPS to the LOC switch-over, then down the glideslope.',
    pos: destination(fixPos('TOBEY'), 30, 12),
    altFt: 4000,
    hdg: 210,
    iasKt: 105,
    weather: { ceilingFt: 700, visibilitySm: 1 },
    briefing: [
      'Fly the GPS (CDI GPS) to TOBEY, then KEDDY at 3000.',
      'Inside 15 NM of MARLO (the FAF active) the CDI switches to LOC1 by itself: confirm the green LOC1 and press APR.',
      'Descend to 3000 after TOBEY; GS intercept just after KEDDY.',
    ],
    setup: (s) => {
      s.ap.altSel = 4000;
      s.loadApproach('PARD-I27', 'TOBEY');
    },
  },
  {
    id: 'loc27',
    name: 'LOC RWY 27 (glideslope out)',
    kind: 'Non-precision',
    difficulty: 2,
    approachId: 'PARD-I27',
    description: 'Same ILS, but the glideslope is NOTAMed out. Fly the localizer-only minimums: MDA 900.',
    pos: destination(destination(r27.threshold, 90, 12), 180, 3),
    altFt: 3000,
    hdg: 300,
    iasKt: 95,
    weather: { ceilingFt: 1000, visibilitySm: 1.5 },
    briefing: [
      'Descend to 2400 after intercepting the localizer, cross MARLO, then descend to MDA 900.',
      'Do not descend below 900 until the runway is in sight. Missed approach at RW27.',
      'Tip: a "dive and drive" at 800–1000 fpm is acceptable; continuous descent of ~500 fpm is better.',
    ],
    setup: (s) => {
      s.ap.altSel = 3000;
      s.ap.hdgBug = 300;
      s.loadApproach('PARD-I27', null, 'vtf');
      s.av.minimums = 900;
      s.gsFailed = true;
      s.setCdi('NAV1');
    },
  },
  {
    id: 'rnav09',
    name: 'RNAV (GPS) RWY 09 — LPV via LUNKS',
    kind: 'APV',
    difficulty: 1,
    approachId: 'PARD-R09',
    description: 'West of PARD at 3500 ft, RNAV 09 via LUNKS. Couple APR for the LPV glidepath to DA 670.',
    pos: destination(fixPos('LUNKS'), 320, 10),
    altFt: 3500,
    hdg: 140,
    iasKt: 100,
    weather: { ceilingFt: 800, visibilitySm: 1, windDir: 120, windKt: 10 },
    briefing: [
      'Press NAV to fly the GPS flight plan, then APR to arm the glidepath (GP).',
      'Descend to 3000 at WILLO. The CDI scales to APR 2 nm before PERCH.',
      'LPV DA 670 ft.',
    ],
    setup: (s) => {
      s.ap.altSel = 3500;
      s.loadApproach('PARD-R09', 'LUNKS');
    },
  },
  {
    id: 'locbc09',
    name: 'LOC BC RWY 09 — back course',
    kind: 'Non-precision',
    difficulty: 3,
    approachId: 'PARD-B09',
    description: 'A rare back-course approach. Course set to the front course 270; HSI sensing stays correct.',
    pos: destination(fixPos('WILLO'), 300, 6),
    altFt: 3000,
    hdg: 120,
    iasKt: 95,
    weather: { ceilingFt: 1100, visibilitySm: 1.5, windDir: 60, windKt: 12 },
    briefing: [
      'NAV1 on I-PRD 110.30, CRS 270 (front course) — the HSI course arrow points behind you.',
      'Autopilot: APR engages BC mode. No glideslope on the back course.',
      'Cross BACKY at 2000, then descend to MDA 860.',
    ],
    setup: (s) => {
      s.ap.altSel = 3000;
      s.ap.hdgBug = 120;
      s.loadApproach('PARD-B09', null, 'load');
      s.fp.activateLeg(s.fp.wpts.findIndex((w) => w.ident === 'BACKY'));
      s.setCdi('NAV1');
      s.av.obs1 = 270;
    },
  },
  {
    id: 'ndb27',
    name: 'NDB RWY 27 — ADF approach',
    kind: 'Non-precision',
    difficulty: 3,
    approachId: 'PARD-N27',
    description: 'Old-school: track the ADF bearing pointer (cyan) to the PA NDB and outbound to the MAP. Time it.',
    pos: destination(fixPos('SANDR'), 150, 6),
    altFt: 4000,
    hdg: 330,
    iasKt: 95,
    weather: { ceilingFt: 1300, visibilitySm: 2, windDir: 200, windKt: 15 },
    briefing: [
      'ADF tuned to PA 344 kHz, bearing pointer 1 = ADF.',
      'Via SANDR and KEDDY to PA (FAF) at 1800, then MDA 1000.',
      'Start the timer at PA: 3:00 at 90 KT to the MAP.',
      'GPS overlay is available — but try to fly it on the needle.',
    ],
    setup: (s) => {
      s.ap.altSel = 4000;
      s.loadApproach('PARD-N27', 'SANDR');
    },
  },
  {
    id: 'vor21',
    name: 'VOR/DME RWY 21 — Mistral Valley',
    kind: 'Non-precision',
    difficulty: 2,
    approachId: 'MSVL-V21',
    description: 'Step-down VOR/DME approach into a valley airport. Step-down at DOPPS, MDA 1640.',
    pos: destination(fixPos('GALEN'), 60, 8),
    altFt: 4500,
    hdg: 240,
    iasKt: 100,
    weather: { ceilingFt: 2000, visibilitySm: 2, windDir: 230, windKt: 14, turbulence: 0.3 },
    briefing: [
      'NAV1 on MSV 112.70, CRS 210. CDI VOR1 for the final.',
      'GALEN 4500 → MSV (FAF) 3200 → DOPPS (2.5 DME) 2100 → MDA 1640.',
      'MAP at RW21 (5.0 DME).',
    ],
    setup: (s) => {
      s.ap.altSel = 4500;
      s.loadApproach('MSVL-V21', 'GALEN');
      s.av.baro = s.weather.qnh;
    },
  },
  {
    id: 'rnav03',
    name: 'RNAV (GPS) RWY 03 — LNAV/VNAV',
    kind: 'APV',
    difficulty: 2,
    approachId: 'MSVL-R03',
    description: 'Mistral Valley from the south-west, via TALUS. LNAV/VNAV DA 1500 with a gusty crosswind.',
    pos: destination(fixPos('TALUS'), 140, 8),
    altFt: 4000,
    hdg: 300,
    iasKt: 100,
    weather: { ceilingFt: 1700, visibilitySm: 1.5, windDir: 320, windKt: 16, gustKt: 24, turbulence: 0.35 },
    briefing: [
      'TALUS 4000 → FENNY 3600 → CRAGG (FAF) 2900, glidepath 3.00°.',
      'Strong crosswind from the left: expect a 10° wind correction on final.',
      'LNAV/VNAV DA 1500.',
    ],
    setup: (s) => {
      s.ap.altSel = 4000;
      s.loadApproach('MSVL-R03', 'TALUS');
    },
  },
  {
    id: 'ils03',
    name: 'ILS RWY 03 — Mistral Valley',
    kind: 'Precision',
    difficulty: 2,
    approachId: 'MSVL-I03',
    description: 'Valley ILS with rising terrain and a gusty wind. Via SCREE, GS intercept at 3600, DA 1400.',
    pos: destination(fixPos('SCREE'), 250, 8),
    altFt: 4000,
    hdg: 70,
    iasKt: 100,
    weather: { ceilingFt: 300, visibilitySm: 0.75, windDir: 60, windKt: 14, gustKt: 22, turbulence: 0.3 },
    briefing: ['NAV1 I-MSV 111.10, CRS 030.', 'SCREE 4000 → FENNY 3600 → GS. DA 1400.', 'Missed: 4500 direct MSV, hold.'],
    setup: (s) => {
      s.ap.altSel = 4000;
      s.loadApproach('MSVL-I03', 'SCREE');
    },
  },
  {
    id: 'lda36',
    name: 'LDA/DME RWY 36 — offset localizer',
    kind: 'Non-precision',
    difficulty: 3,
    approachId: 'PARD-L36',
    description: 'A localizer offset 16° from the runway. Track it to ADNAP, then manoeuvre visually to runway 36.',
    pos: destination(fixPos('GULLS'), 240, 6),
    altFt: 3500,
    hdg: 60,
    iasKt: 95,
    weather: { ceilingFt: 1100, visibilitySm: 2, windDir: 340, windKt: 10 },
    briefing: ['NAV1 I-ADN 109.50, CRS 016.', 'GULLS 3500 → OSPRY 3000 → NIXIE (FAF) 2100 → MDA 800.', 'At ADNAP with the runway in sight: turn ~16° right to line up with RWY 36.'],
    setup: (s) => {
      s.ap.altSel = 3500;
      s.loadApproach('PARD-L36', 'GULLS');
    },
  },
  {
    id: 'hold-ard',
    name: 'Holding at ARD',
    kind: 'Holding',
    difficulty: 2,
    approachId: 'PARD-I27',
    description: 'Missed approach hold at ARD: inbound 270, right turns, 1-minute legs, 3000 ft.',
    pos: destination(approach('PARD-I27').missed[1].fix, 45, 9),
    altFt: 3000,
    hdg: 225,
    iasKt: 90,
    weather: { ceilingFt: 600, visibilitySm: 0.75 },
    briefing: [
      'Determine the entry: arriving from the north-east → parallel or teardrop.',
      'The GPS flies the hold in NAV mode, or hand-fly it on the magenta racetrack.',
      'Time 1 minute outbound, adjust for wind.',
    ],
    setup: (s) => {
      s.av.nav1.active = 114.2;
      s.av.obs1 = 270;
      s.ap.altSel = 3000;
      s.fp.loadApproach('PARD-I27', null);
      s.fp.approachActive = true;
      s.fp.activateMissed();
    },
  },
  {
    id: 'free',
    name: 'Free flight — VFR on top',
    kind: 'Free flight',
    difficulty: 1,
    description: 'Clear skies at 5500 ft over the Ardent Islands. Explore, load any approach, practice anything.',
    pos: destination(fixPos('PARD'), 90, 20),
    altFt: 5500,
    hdg: 270,
    iasKt: 105,
    weather: { ceilingFt: 20000, visibilitySm: 10, windKt: 5, turbulence: 0.05 },
    briefing: ['Use the FPL panel to load any approach and the Charts drawer to read the plate.'],
    setup: (s) => {
      s.ap.altSel = 5500;
      s.av.minimums = null;
    },
  },
];
