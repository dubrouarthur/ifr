// GFC-700-style autopilot / flight director.
import { DEG, wrap180 } from '../nav/geo';
import type { Controls, FlightData } from '../sim/aircraft';
import type { NavOutput } from '../nav/radios';
import type { GpsOutput } from '../nav/flightplan';

export type LatMode = 'ROL' | 'HDG' | 'GPS' | 'VOR' | 'LOC' | 'BC';
export type VertMode = 'PIT' | 'ALT' | 'VS' | 'FLC' | 'GS' | 'GP';
export type CdiSource = 'GPS' | 'NAV1' | 'NAV2';

export interface NavInputs {
  cdi: CdiSource;
  nav: NavOutput; // output of the receiver selected on the CDI (if NAV)
  gps: GpsOutput;
}

export class Autopilot {
  ap = false;
  fd = false;
  lat: LatMode = 'ROL';
  latArmed: LatMode | null = null;
  vert: VertMode = 'PIT';
  vertArmed: { alts: boolean; gs: boolean; gp: boolean } = { alts: false, gs: false, gp: false };
  apprMode = false;

  hdgBug = 270;
  altSel = 3000;
  vsSel = 0;
  iasSel = 90;
  pitchRef = 0;
  rollRef = 0;
  altHold = 3000;

  bankCmd = 0;
  pitchCmd = 0;
  /** last annunciation e.g. "AP OFF" flash */
  annunciation: { text: string; until: number } | null = null;
  private pitchInt = 0;
  private time = 0;

  get engaged() {
    return this.ap || this.fd;
  }

  private navSourceMode(n: NavInputs): LatMode {
    if (n.cdi === 'GPS') return 'GPS';
    return n.nav.isLoc ? (n.nav.backCourse ? 'BC' : 'LOC') : 'VOR';
  }

  private ensureFd(d: FlightData) {
    if (!this.fd && !this.ap) {
      this.fd = true;
      this.setDefaultModes(d);
    }
  }

  private setDefaultModes(d: FlightData) {
    this.lat = 'ROL';
    this.rollRef = Math.abs(d.rollDeg) < 6 ? 0 : Math.max(-22, Math.min(22, d.rollDeg));
    this.vert = 'PIT';
    this.pitchRef = Math.max(-10, Math.min(15, d.pitchDeg));
    this.latArmed = null;
    this.vertArmed = { alts: true, gs: false, gp: false };
    this.apprMode = false;
    this.pitchInt = 0;
  }

  toggleAp(d: FlightData) {
    if (this.ap) {
      this.disconnect();
      return;
    }
    if (!this.fd) this.setDefaultModes(d);
    this.ap = true;
    this.fd = true;
    this.pitchInt = 0;
  }

  disconnect() {
    if (this.ap) this.annunciation = { text: 'AP', until: this.time + 4 };
    this.ap = false;
  }

  toggleFd(d: FlightData) {
    if (this.fd && !this.ap) {
      this.fd = false;
      return;
    }
    if (!this.fd) {
      this.fd = true;
      this.setDefaultModes(d);
    }
  }

  pressHdg(d: FlightData) {
    this.ensureFd(d);
    if (this.lat === 'HDG') {
      this.lat = 'ROL';
      this.rollRef = 0;
    } else this.lat = 'HDG';
  }

  pressNav(d: FlightData, n: NavInputs) {
    this.ensureFd(d);
    const m = this.navSourceMode(n);
    if (this.lat === m || this.latArmed === m) {
      this.latArmed = null;
      if (this.lat === m) this.lat = 'ROL';
      this.apprMode = false;
      return;
    }
    this.latArmed = m;
  }

  pressApr(d: FlightData, n: NavInputs) {
    this.ensureFd(d);
    if (this.apprMode) {
      this.apprMode = false;
      this.vertArmed.gs = this.vertArmed.gp = false;
      if (this.vert === 'GS' || this.vert === 'GP') this.vert = 'PIT';
      this.latArmed = null;
      return;
    }
    this.apprMode = true;
    const m = this.navSourceMode(n);
    if (this.lat !== m) this.latArmed = m;
    if (m === 'LOC') this.vertArmed.gs = true;
    if (m === 'GPS') this.vertArmed.gp = true;
  }

  pressAlt(d: FlightData) {
    this.ensureFd(d);
    this.vert = 'ALT';
    this.altHold = Math.round(d.altFt / 10) * 10;
    this.pitchInt = 0;
  }

  pressVs(d: FlightData) {
    this.ensureFd(d);
    if (this.vert === 'VS') return this.pitchMode(d);
    this.vert = 'VS';
    this.vsSel = Math.round(d.vsFpm / 100) * 100;
    this.vertArmed.alts = true;
  }

  pressFlc(d: FlightData) {
    this.ensureFd(d);
    if (this.vert === 'FLC') return this.pitchMode(d);
    this.vert = 'FLC';
    this.iasSel = Math.round(d.iasKt);
    this.vertArmed.alts = true;
  }

  private pitchMode(d: FlightData) {
    this.vert = 'PIT';
    this.pitchRef = d.pitchDeg;
  }

  /** NOSE UP / NOSE DN wheel */
  nose(dir: 1 | -1) {
    if (this.vert === 'PIT') this.pitchRef = Math.max(-10, Math.min(15, this.pitchRef + 0.5 * dir));
    else if (this.vert === 'VS') this.vsSel = Math.max(-2000, Math.min(1500, this.vsSel + 100 * dir));
    else if (this.vert === 'FLC') this.iasSel = Math.max(60, Math.min(140, this.iasSel - dir));
  }

  /** Called every frame. Writes control surface commands when AP engaged. */
  update(dt: number, d: FlightData, n: NavInputs, c: Controls, pitchRateDps: number, rollRateDps: number): void {
    this.time += dt;
    if (!this.fd && !this.ap) return;
    const navMode = this.navSourceMode(n);

    // ------------- Lateral capture logic
    if (this.latArmed) {
      if (this.latArmed !== navMode) {
        // CDI source changed after arming: re-arm for the new source
        this.latArmed = navMode;
      }
      const src = navMode === 'GPS' ? n.gps : n.nav;
      const valid = navMode === 'GPS' ? n.gps.valid : n.nav.valid;
      const capThreshold = navMode === 'LOC' || navMode === 'BC' ? 0.85 : navMode === 'VOR' ? 0.75 : 0.9;
      if (valid && Math.abs(src.dev) < capThreshold) {
        this.lat = navMode;
        this.latArmed = null;
      }
    }
    if ((this.lat === 'GPS' || this.lat === 'VOR' || this.lat === 'LOC' || this.lat === 'BC') && this.lat !== navMode) {
      // source switched while coupled -> revert to ROL like the real system
      this.lat = 'ROL';
      this.rollRef = 0;
    }

    // ------------- Lateral law
    let bank = 0;
    const track = d.trackTrue; // magVar = 0 in this region
    const trackErr = (desired: number) => wrap180(desired - track);
    switch (this.lat) {
      case 'ROL':
        bank = this.rollRef;
        break;
      case 'HDG':
        bank = wrap180(this.hdgBug - d.hdgTrue) * 1.1;
        bank = clamp(bank, -22, 22);
        break;
      case 'GPS': {
        const g = n.gps;
        if (!g.valid) {
          bank = 0;
          break;
        }
        const intercept = clamp(-g.xtkNm * (g.holding ? 70 : 45), -45, 45);
        bank = clamp(trackErr(g.dtk + intercept) * 1.3, -22, 22);
        break;
      }
      case 'VOR':
      case 'LOC':
      case 'BC': {
        const v = n.nav;
        if (!v.valid) {
          bank = 0;
          break;
        }
        const loc = this.lat !== 'VOR';
        const fsDeg = loc ? 2.5 : 10;
        const distNm = Math.max(0.3, v.distNm);
        const offNm = distNm * Math.tan(v.dev * fsDeg * DEG); // + => course is to the right (pointer frame)
        const gain = loc ? 60 : 35;
        const lim = loc ? 30 : 45;
        if (this.lat === 'BC') {
          // flying opposite to the front course: left/right are reversed
          bank = clamp(trackErr(v.course + 180 + clamp(-offNm * gain, -lim, lim)) * 1.3, -22, 22);
        } else {
          bank = clamp(trackErr(v.course + clamp(offNm * gain, -lim, lim)) * 1.3, -22, 22);
        }
        break;
      }
    }
    this.bankCmd += (bank - this.bankCmd) * Math.min(1, dt * 1.5);

    // ------------- Vertical capture logic
    const altErr = this.altSel - d.altFt;
    if (this.vertArmed.gs && this.lat === 'LOC' && n.nav.gsValid && n.nav.gsDev < 0.25 && n.nav.gsDev > -0.5) {
      this.vert = 'GS';
      this.vertArmed.gs = false;
      this.vertArmed.alts = false;
    }
    if (this.vertArmed.gp && this.lat === 'GPS' && n.gps.gpValid && n.gps.gpDev < 0.25 && n.gps.gpDev > -0.5) {
      this.vert = 'GP';
      this.vertArmed.gp = false;
      this.vertArmed.alts = false;
    }
    if (this.vert !== 'ALT' && this.vert !== 'GS' && this.vert !== 'GP') {
      this.vertArmed.alts = true;
      const capWindow = Math.max(60, Math.abs(d.vsFpm) * 0.2);
      const movingToward = Math.sign(altErr) === Math.sign(d.vsFpm) || Math.abs(altErr) < 30;
      if (Math.abs(altErr) < capWindow && movingToward && (this.vert !== 'PIT' || Math.abs(d.vsFpm) > 200)) {
        this.vert = 'ALT';
        this.altHold = this.altSel;
        this.vertArmed.alts = false;
      }
    } else if (this.vert === 'ALT') this.vertArmed.alts = false;

    // ------------- Vertical law -> pitch command
    const tasFpm = Math.max(40, d.tasKt) * 101.27;
    const gsFpm = Math.max(40, d.gsKt) * 101.27;
    const fpaFor = (vs: number) => Math.asin(clamp(vs / tasFpm, -0.5, 0.5)) / DEG;
    let pitch = d.pitchDeg;
    let vsTarget: number | null = null;
    switch (this.vert) {
      case 'PIT':
        pitch = this.pitchRef;
        break;
      case 'ALT':
        vsTarget = clamp((this.altHold - d.altFt) * 4, -700, 700);
        break;
      case 'VS':
        vsTarget = this.vsSel;
        break;
      case 'FLC': {
        // pitch for airspeed; never climb/descend away from the selected altitude
        const spdErr = d.iasKt - this.iasSel;
        vsTarget = d.vsFpm + clamp(spdErr * 40, -400, 400);
        if (altErr > 0) vsTarget = Math.max(0, vsTarget);
        else vsTarget = Math.min(0, vsTarget);
        vsTarget = clamp(vsTarget, -1500, 1200);
        break;
      }
      case 'GS':
      case 'GP': {
        const valid = this.vert === 'GS' ? n.nav.gsValid : n.gps.gpValid;
        const dev = this.vert === 'GS' ? n.nav.gsDev : n.gps.gpDev;
        const dist = (this.vert === 'GS' ? n.nav.gsDistNm : n.gps.gpDistNm) * 6076;
        if (!valid) {
          vsTarget = -gsFpm * Math.tan(3 * DEG);
          break;
        }
        const heightErr = dev * 0.7 * DEG * dist; // + => below path, need to climb
        vsTarget = -gsFpm * Math.tan(3 * DEG) + clamp(heightErr * 5, -400, 400);
        break;
      }
    }
    if (vsTarget !== null) {
      this.pitchInt += (vsTarget - d.vsFpm) * 0.0012 * dt;
      this.pitchInt = clamp(this.pitchInt, -5, 5);
      pitch = fpaFor(vsTarget) + d.aoaDeg + this.pitchInt + (vsTarget - d.vsFpm) * 0.002;
    }
    pitch = clamp(pitch, -10, 15);
    this.pitchCmd += (pitch - this.pitchCmd) * Math.min(1, dt * 2);

    // ------------- Servos
    if (this.ap) {
      const pe = this.pitchCmd - d.pitchDeg;
      c.elevator = clamp(pe * 0.07 - pitchRateDps * 0.025, -0.35, 0.35);
      c.trim = clamp(c.trim + pe * 0.012 * dt, -1, 1); // autotrim
      const be = this.bankCmd - d.rollDeg;
      c.aileron = clamp(be * 0.02 - rollRateDps * 0.012, -0.3, 0.3);
    }
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
