// The simulation world: aircraft + weather + avionics state.
import { Aircraft, neutralControls, type Controls } from './aircraft';
import { defaultWeather, KT, type Weather } from './environment';
import { Autopilot, type CdiSource, type NavInputs } from '../avionics/autopilot';
import { computeNav, EMPTY_NAV, markerBeacon, type NavOutput } from '../nav/radios';
import { FlightPlan } from '../nav/flightplan';
import { AIRPORTS, groundElevation, runway, findFix, approach } from '../nav/data';
import { destination, distanceNm, DEG, FT_PER_NM, crossTrackNm, alongTrackNm, type LatLon } from '../nav/geo';

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
  bearing1: 'OFF' | 'NAV1' | 'GPS';
  bearing2: 'OFF' | 'NAV2' | 'GPS';
  inset: boolean;
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
  av: Avionics = {
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
    bearing1: 'OFF',
    bearing2: 'OFF',
    inset: true,
  };
  nav1: NavOutput = EMPTY_NAV;
  nav2: NavOutput = EMPTY_NAV;
  marker: 'O' | null = null;
  time = 0;
  paused = false;
  rate = 1;
  scenario: Scenario | null = null;
  private lastPitch = 0;
  private lastRoll = 0;
  events: string[] = [];

  constructor(sc?: Scenario) {
    this.load(sc ?? SCENARIOS[1]);
  }

  load(sc: Scenario) {
    this.scenario = sc;
    this.ap = new Autopilot();
    this.fp = new FlightPlan();
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
      this.controls.trim = -0.1;
      this.controls.brake = 0;
    } else {
      // rough trim for the requested speed
      this.controls.trim = sc.iasKt < 95 ? -0.17 : -0.3;
      this.controls.throttle = sc.iasKt < 95 ? 0.5 : 0.68;
    }
    this.ap.hdgBug = sc.hdg;
    this.ap.altSel = Math.round(sc.altFt / 100) * 100;
    sc.setup?.(this);
    this.ac.step(0.01, this.controls, this.weather);
    this.updateAvionics(0);
  }

  step(dtReal: number) {
    if (this.paused || this.ac.s.crashed) {
      this.updateAvionics(0);
      return;
    }
    const dt = Math.min(0.1, dtReal) * this.rate;
    this.time += dt;
    this.ac.step(dt, this.controls, this.weather);
    this.updateAvionics(dt);
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
    this.marker = markerBeacon(pos);
    this.fp.update(pos, d.gsKt, d.trackTrue);
    if (dt > 0) {
      const pr = (d.pitchDeg - this.lastPitch) / dt;
      const rr = (d.rollDeg - this.lastRoll) / dt;
      this.ap.update(dt, d, this.navInputs(), this.controls, pr, rr);
    }
    this.lastPitch = d.pitchDeg;
    this.lastRoll = d.rollDeg;
  }

  /** Indicated altitude for the current baro setting */
  indicatedAlt(): number {
    return this.ac.s.altFt + (this.av.baro - this.weather.qnh) * 1000;
  }

  setCdi(src: CdiSource) {
    this.av.cdi = src;
    // G1000 auto-slews the course to the localizer when a LOC is selected
    const nav = src === 'NAV1' ? this.nav1 : src === 'NAV2' ? this.nav2 : null;
    if (nav && nav.isLoc) {
      if (src === 'NAV1') this.av.obs1 = nav.course;
      else this.av.obs2 = nav.course;
    }
  }

  cycleCdi() {
    const order: CdiSource[] = ['GPS', 'NAV1', 'NAV2'];
    this.setCdi(order[(order.indexOf(this.av.cdi) + 1) % order.length]);
  }

  /** current course pointer value for the HSI */
  course(): number {
    if (this.av.cdi === 'GPS') return this.fp.out.dtk;
    return this.av.cdi === 'NAV1' ? this.av.obs1 : this.av.obs2;
  }

  setCourse(v: number) {
    const n = ((Math.round(v) % 360) + 360) % 360 || 360;
    if (this.av.cdi === 'NAV2') this.av.obs2 = n;
    else this.av.obs1 = n;
  }

  directTo(ident: string): boolean {
    const f = findFix(ident);
    if (!f) return false;
    this.fp.directTo({ ident: f.ident, lat: f.lat, lon: f.lon }, this.ac.s);
    return true;
  }
}

// --------------------------------------------------------------- Scenarios
const r27 = runway('PARD', '27');

export const SCENARIOS: Scenario[] = [
  {
    id: 'rwy27',
    name: 'Departure — PARD RWY 27',
    description: 'Lined up on runway 27 at Port Ardent. Full power, rotate at 55 KIAS, climb runway heading to 3000.',
    pos: destination(r27.threshold, 270, 0.05),
    altFt: 420,
    hdg: 270,
    iasKt: 0,
    onGround: true,
    setup: (s) => {
      s.ap.altSel = 3000;
      s.ap.hdgBug = 270;
      s.av.minimums = 670;
    },
  },
  {
    id: 'ils27-vtf',
    name: 'ILS 27 — vectors to final',
    description: '14 nm east of PARD, 3000 ft, heading 240 to intercept the I-PRD localizer. NAV1 tuned, approach loaded (vectors to final).',
    pos: destination(destination(r27.threshold, 90, 14), 0, 3.2),
    altFt: 3000,
    hdg: 240,
    iasKt: 90,
    setup: (s) => {
      s.av.nav1.active = 110.3;
      s.av.obs1 = 270;
      s.ap.hdgBug = 240;
      s.ap.altSel = 3000;
      s.av.minimums = 670;
      s.fp.loadApproach('PARD-I27', null);
      s.fp.vectorsToFinal();
      s.setCdi('NAV1');
    },
  },
  {
    id: 'ils27-full',
    name: 'ILS 27 — full procedure via TOBEY',
    description: 'Enroute north-east at 4000 ft, cleared direct TOBEY, ILS 27 via TOBEY transition. Fly the GPS to the LOC switch-over.',
    pos: destination(findFix('TOBEY')!, 30, 12),
    altFt: 4000,
    hdg: 210,
    iasKt: 105,
    setup: (s) => {
      s.av.nav1.active = 110.3;
      s.av.obs1 = 270;
      s.ap.altSel = 4000;
      s.av.minimums = 670;
      s.fp.loadApproach('PARD-I27', 'TOBEY');
      s.fp.activateApproach(s.ac.s);
    },
  },
  {
    id: 'rnav09',
    name: 'RNAV (GPS) 09 — LPV via LUNKS',
    description: 'West of PARD at 3500 ft, RNAV 09 loaded via LUNKS. Couple APR for LPV glidepath.',
    pos: destination(findFix('LUNKS')!, 320, 10),
    altFt: 3500,
    hdg: 140,
    iasKt: 100,
    setup: (s) => {
      s.ap.altSel = 3500;
      s.av.minimums = 670;
      s.fp.loadApproach('PARD-R09', 'LUNKS');
      s.fp.activateApproach(s.ac.s);
    },
  },
  {
    id: 'vor21',
    name: 'VOR/DME 21 — Mistral Valley',
    description: 'Non-precision approach into MSVL. 4500 ft north-east, NAV1 on MSV 112.70, step-down at DOPPS, MDA 1640.',
    pos: destination(findFix('GALEN')!, 60, 8),
    altFt: 4500,
    hdg: 240,
    iasKt: 100,
    setup: (s) => {
      s.av.nav1.active = 112.7;
      s.av.obs1 = 210;
      s.ap.altSel = 4500;
      s.av.minimums = 1640;
      s.av.baro = s.weather.qnh;
      s.fp.loadApproach('MSVL-V21', 'GALEN');
      s.fp.activateApproach(s.ac.s);
    },
  },
  {
    id: 'hold-ard',
    name: 'Holding at ARD',
    description: 'Hold at ARD VOR/DME, inbound 270, right turns, 3000 ft. Enter via the GPS (missed-approach hold) or by hand.',
    pos: destination(approach('PARD-I27').missed[1].fix, 45, 9),
    altFt: 3000,
    hdg: 225,
    iasKt: 90,
    setup: (s) => {
      s.av.nav1.active = 114.2;
      s.av.obs1 = 270;
      s.ap.altSel = 3000;
      s.fp.loadApproach('PARD-I27', null);
      s.fp.activateMissed();
    },
  },
];

