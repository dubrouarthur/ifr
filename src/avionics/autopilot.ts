// GFC-700-style autopilot / flight director.
import { DEG, wrap180 } from '../nav/geo';
import type { Controls, FlightData } from '../sim/aircraft';
import type { NavOutput } from '../nav/radios';
import type { GpsOutput } from '../nav/flightplan';

/** flight-path angle (deg) equivalent to an airspeed rate of 1 kt/s: (0.5144 / 9.81) rad */
const DEG_PER_KTS = 0.514444 / 9.80665 / DEG;

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
  /** speed envelope (KIAS): MINSPD clean / flaps >= 15 deg, MAXSPD (C172: 1.2 VS1, 1.2 VS0, ~VNE) */
  minSpd = 58;
  minSpdFlaps = 50;
  maxSpd = 160;
  /** MINSPD / MAXSPD protection active (annunciated in yellow on the PFD) */
  underspeed = false;
  overspeed = false;
  private pitchInt = 0;
  private time = 0;
  private lastIas: number | null = null;
  private iasRate = 0;
  private gammaPot = 0;
  private gammaPotInit = false;
  private vsCmd: number | null = null;
  private holdLoop = false;

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
    // bumpless engagement: the commands start from the current attitude
    this.pitchCmd = d.pitchDeg;
    this.bankCmd = d.rollDeg;
    this.vsCmd = null;
    this.lat = 'ROL';
    this.rollRef = Math.abs(d.rollDeg) < 6 ? 0 : Math.max(-22, Math.min(22, d.rollDeg));
    this.vert = 'PIT';
    this.pitchRef = Math.max(-10, Math.min(15, d.pitchDeg));
    this.latArmed = null;
    this.vertArmed = { alts: true, gs: false, gp: false };
    this.apprMode = false;
    this.pitchInt = 0;
  }

  /** set by the sim when the AP is failed or a hand-flown checkride is in progress */
  inhibited: string | null = null;

  toggleAp(d: FlightData) {
    if (!this.ap && this.inhibited) {
      this.annunciation = { text: this.inhibited, until: this.time + 4 };
      return;
    }
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
    if (this.lat === 'GPS' && navMode === 'LOC' && this.apprMode && n.gps.valid) {
      // G1000 automatic GPS → LOC switch on an ILS/LOC approach (GFC 700): keep flying the GPS path with LOC armed
      // until the localizer captures, never drop to ROL in between
      if (this.latArmed !== 'LOC') this.latArmed = 'LOC';
    } else if ((this.lat === 'GPS' || this.lat === 'VOR' || this.lat === 'LOC' || this.lat === 'BC') && this.lat !== navMode) {
      // source switched while coupled -> revert to ROL like the real system
      this.lat = 'ROL';
      this.rollRef = 0;
    }

    // ------------- Lateral law
    let bank = 0;
    const track = d.trackTrue; // magVar = 0 in this region
    const trackErr = (desired: number) => wrap180(desired - track);
    // bank limits: HDG turns at standard rate (3 deg/s) up to 25 deg (GFC 700 / KAP 140); NAV modes may use 5 deg
    // more to hold a curved path with a tailwind, never more than 25 deg
    const tasMs = Math.max(40, d.tasKt) * 0.514444;
    const stdBank = Math.atan((tasMs * 3 * DEG) / 9.80665) / DEG;
    const hdgLim = Math.min(25, stdBank);
    const navLim = Math.min(25, stdBank + 5);
    switch (this.lat) {
      case 'ROL':
        bank = this.rollRef;
        break;
      case 'HDG':
        bank = clamp(wrap180(this.hdgBug - d.hdgTrue) * 1.1, -hdgLim, hdgLim);
        break;
      case 'GPS': {
        const g = n.gps;
        if (!g.valid) {
          bank = 0;
          break;
        }
        // roll steering: feed-forward bank for the curved parts of the path (fly-by turns, DME arcs, holds) so
        // the aircraft flies the same arc the map draws, plus a track-error correction with an intercept angle
        let ff = 0;
        if (g.arcRadiusNm && g.arcDir) {
          const v = Math.max(30, d.gsKt) * 0.514444;
          ff = (Math.atan((v * v) / (9.80665 * g.arcRadiusNm * 1852)) / DEG) * (g.arcDir === 'R' ? 1 : -1);
        }
        const intercept = clamp(-g.xtkNm * (g.holding ? 70 : 45), -45, 45);
        const err = trackErr(g.dtk + intercept);
        if (g.turnDir && Math.abs(err) > 100) bank = g.turnDir === 'R' ? navLim : -navLim;
        else bank = clamp(err * 1.3 + ff, -navLim, navLim);
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
        const gain = 60; // deg of intercept per NM off course (45° cap for VOR, 30° for LOC)
        const lim = loc ? 30 : 45;
        if (this.lat === 'BC') {
          // flying opposite to the front course: left/right are reversed
          bank = clamp(trackErr(v.course + 180 + clamp(-offNm * gain, -lim, lim)) * 1.3, -navLim, navLim);
        } else {
          bank = clamp(trackErr(v.course + clamp(offNm * gain, -lim, lim)) * 1.3, -navLim, navLim);
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
    // energy state: the flight-path angle this thrust would sustain at a constant speed ("potential" path,
    // gamma + dV/dt / g). Pitch-for-speed laws (FLC, MINSPD/MAXSPD) command a path relative to it, which
    // removes the phugoid coupling of a plain speed-error loop.
    if (dt > 0) {
      const rawRate = this.lastIas === null ? 0 : (d.iasKt - this.lastIas) / dt;
      this.iasRate += (clamp(rawRate, -8, 8) - this.iasRate) * Math.min(1, dt / 0.8);
    }
    this.lastIas = d.iasKt;
    const gammaDeg = fpaFor(d.vsFpm);
    const gPot = gammaDeg + this.iasRate * DEG_PER_KTS;
    this.gammaPot = this.gammaPotInit ? this.gammaPot + (gPot - this.gammaPot) * Math.min(1, dt / 3) : gPot;
    this.gammaPotInit = true;
    /** vertical speed that brings the indicated airspeed to `kt` (first order, tau 12 s, |dV/dt| <= 0.7 kt/s) */
    const vsForSpeed = (kt: number) => {
      const aDes = clamp((kt - d.iasKt) / 12, -0.7, 0.7);
      return tasFpm * Math.sin((this.gammaPot - aDes * DEG_PER_KTS) * DEG);
    };
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
        // pitch for airspeed, towards the selected altitude only (G1000: FLC never climbs or descends away
        // from the selected altitude, it trades speed instead)
        let vs = vsForSpeed(this.iasSel);
        if (altErr > 0) vs = Math.max(0, vs);
        else vs = Math.min(0, vs);
        vsTarget = clamp(vs, -1500, 1500);
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
    // ------------- Speed envelope protection (GFC 700 ESP-style MINSPD / MAXSPD): the AP never flies the
    // aircraft into a stall or past VNE in ALT / VS / PIT / FLC; there is no autothrottle, so it trades altitude
    // and annunciates. Coupled to a glidepath it only annunciates (it will not leave the path).
    const coupledPath = this.vert === 'GS' || this.vert === 'GP';
    const vMin = d.flapsDeg >= 15 ? this.minSpdFlaps : this.minSpd;
    if (!coupledPath && this.ap) {
      const modeVs = vsTarget ?? d.vsFpm;
      const vsMin = vsForSpeed(vMin + 3);
      const vsMax = vsForSpeed(this.maxSpd - 3);
      // engage below VMIN / above VMAX; release only once the selected mode no longer asks for more than the
      // protection allows (a gust above VMIN must not hand a slow aircraft back to a mode that would stall it)
      // (with a 3 s lead on the deceleration, so the nose comes down progressively instead of at the last moment)
      if (d.iasKt + Math.min(0, this.iasRate) * 3 < vMin) this.underspeed = true;
      else if (this.underspeed && d.iasKt > vMin + 3 && modeVs <= vsMin) this.underspeed = false;
      if (d.iasKt > this.maxSpd) this.overspeed = true;
      else if (this.overspeed && d.iasKt < this.maxSpd - 3 && modeVs >= vsMax) this.overspeed = false;
      if (this.underspeed) vsTarget = Math.min(modeVs, vsMin);
      else if (this.overspeed) vsTarget = Math.max(modeVs, vsMax);
    } else {
      this.underspeed = this.ap && d.iasKt < vMin;
      this.overspeed = this.ap && d.iasKt > this.maxSpd;
    }
    if (vsTarget !== null) {
      // Two inner loops, both "pitch = path angle + AoA + integral + proportional":
      //  - ALT / GS / GP (hold a reference): the VS-referenced loop flown by the landing campaign;
      //  - VS / FLC / speed protection (change altitude): the commanded VS is slewed (600 fpm/s) so a new target
      //    or mode never steps the pitch, and the loop works on the flight-path-angle error, so it has the same
      //    authority at 60 KIAS with flaps as at 120 KIAS.
      this.holdLoop = this.vert === 'ALT' || this.vert === 'GS' || this.vert === 'GP';
      if (this.vsCmd === null) this.vsCmd = clamp(d.vsFpm, -2000, 2000); // a reposition can make the raw VS read garbage
      if (this.holdLoop) this.vsCmd = vsTarget;
      else {
        const maxStep = 600 * dt;
        this.vsCmd = clamp(this.vsCmd + clamp(vsTarget - this.vsCmd, -maxStep, maxStep), -2500, 2500);
      }
      const vsC = this.vsCmd;
      const gC = fpaFor(vsC);
      if (this.holdLoop) {
        this.pitchInt = clamp(this.pitchInt + (vsC - d.vsFpm) * 0.0012 * dt, -5, 5);
        pitch = gC + d.aoaDeg + this.pitchInt + (vsC - d.vsFpm) * 0.002;
      } else {
        const gErr = gC - gammaDeg;
        this.pitchInt = clamp(this.pitchInt + gErr * 0.3 * dt, -5, 5);
        pitch = gC + d.aoaDeg + this.pitchInt + gErr * 1.5;
      }
    } else {
      this.vsCmd = null;
      this.holdLoop = false;
    }
    pitch = clamp(pitch, -10, 15);
    // pitch command smoothing; climbs and descents are also rate limited to 3 deg/s (GA servo authority)
    const rl = this.holdLoop ? Infinity : 3 * dt;
    this.pitchCmd += clamp((pitch - this.pitchCmd) * Math.min(1, dt * 2), -rl, rl);

    // ------------- Upset / envelope disconnect: beyond 45° of bank or +25 / −20° of pitch the GFC 700 gives up
    // (AP disengages, flashing AP) instead of fighting an unusual attitude
    if (this.ap && (Math.abs(d.rollDeg) > 50 || d.pitchDeg > 25 || d.pitchDeg < -20)) this.disconnect();
    // ------------- Servos (not on the ground: no control movement on the take-off or landing roll)
    const onGround = d.aglFt < 3 && d.vsFpm === 0;
    if (onGround) {
      this.pitchInt = 0;
      this.vsCmd = null;
    }
    if (this.ap && !onGround) {
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
