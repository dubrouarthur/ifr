// Ground school stage — StageAssist: pitch for altitude, power for speed, and the lateral helper behind the
// bank pad (hold to turn at standard rate, release to hold the heading; the HDG bug sets the heading to hold).
// It writes the same Controls inputs as the keyboard (elevator, trim, aileron, throttle) and never touches the
// Autopilot (when the AP is engaged the assist stands down). Steps with an assist are never ACS-graded
// (SPEC §4.3); the stage shows "Altitude and speed held for you".
import type { Sim } from "../../sim/sim";
import type { Lang, StageCue } from "../types";
import { t } from "./strings";

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const DEG = Math.PI / 180;
const wrap180 = (a: number) => {
  const r = (((a % 360) + 360) % 360) as number;
  return r > 180 ? r - 360 : r;
};

export type AssistConfig = NonNullable<StageCue["assist"]>;

/** standard-rate bank for a TAS (exact, tan φ = ω V / g), capped at 25° like a GA autopilot */
export function standardRateBankDeg(tasKt: number): number {
  return Math.min(
    25,
    Math.atan((Math.max(40, tasKt) * 0.514444 * 3 * DEG) / 9.80665) / DEG,
  );
}

export class StageAssist {
  holdAlt = false;
  holdIas = false;
  timeScale: 1 | 2 | 4 = 1;
  /** the lateral helper runs when the student has the bank pad or the HDG bug */
  lateral = false;
  targetAlt = 0;
  targetIas = 0;
  /** heading to hold when the bank pad is released (null = wings level) */
  targetHdg: number | null = null;
  /** bank pad: −1 left, 0, +1 right */
  bankInput = 0;
  /** pitch pad: −1 nose down, 0, +1 nose up (with holdAlt: moves the target altitude) */
  pitchInput = 0;
  private pitchInt = 0;
  private lastIas: number | null = null;
  private iasRate = 0;
  private lastPitch: number | null = null;
  private lastRoll: number | null = null;
  private bankCmd = 0;

  /** Configure from a cue and capture the targets from the Sim as it is now. */
  configure(sim: Sim, cfg: AssistConfig | undefined, lateral: boolean): void {
    this.holdAlt = !!cfg?.holdAlt;
    this.holdIas = !!cfg?.holdIas;
    this.timeScale = cfg?.timeScale ?? 1;
    this.lateral = lateral;
    this.capture(sim);
  }
  /** Targets = the current state (after a reset, a drag, a take-over). */
  capture(sim: Sim): void {
    const d = sim.ac.data;
    this.targetAlt = Math.round(sim.ac.s.altFt / 10) * 10;
    this.targetIas = Math.round(d.iasKt);
    this.targetHdg = Math.abs(d.rollDeg) < 5 ? d.hdgTrue : null;
    this.pitchInt = 0;
    this.lastIas = null;
    this.iasRate = 0;
    this.lastPitch = null;
    this.lastRoll = null;
    this.bankCmd = d.rollDeg;
    this.bankInput = 0;
    this.pitchInput = 0;
  }
  get active(): boolean {
    return this.holdAlt || this.holdIas || this.lateral;
  }
  /** The stage label ("Altitude and speed held for you"), or "" without an assist. */
  label(lang: Lang = "en"): string {
    if (this.holdAlt && this.holdIas) return t("assist", lang);
    if (this.holdAlt) return t("assistAlt", lang);
    if (this.holdIas) return t("assistIas", lang);
    return "";
  }
  /** The HDG bug moved: the helper turns to it (standard rate) once the bank pad is released. */
  headingBug(v: number): void {
    if (this.lateral) this.targetHdg = v;
  }
  setBank(dir: -1 | 0 | 1, sim: Sim): void {
    if (dir === 0 && this.bankInput !== 0) this.targetHdg = sim.ac.data.hdgTrue;
    this.bankInput = dir;
  }
  setPitch(dir: -1 | 0 | 1, sim: Sim): void {
    if (dir === 0 && this.pitchInput !== 0 && this.holdAlt)
      this.targetAlt = Math.round(sim.ac.s.altFt / 10) * 10;
    this.pitchInput = dir;
  }
  /** power − / +: 5 kt on the held speed, or 5 % throttle */
  nudgePower(dir: -1 | 1, sim: Sim): void {
    if (this.holdIas) this.targetIas = clamp(this.targetIas + dir * 5, 60, 160);
    else
      sim.controls.throttle = clamp(sim.controls.throttle + dir * 0.05, 0, 1);
  }

  /** Write the controls for this frame (call before sim.step(dt)). */
  apply(sim: Sim, dt: number): void {
    if (dt <= 0 || sim.paused || sim.ac.s.onGround) return;
    if (sim.ap.ap) {
      // the autopilot flies: stand down, keep the integrators clean for when it disengages
      this.lastPitch = null;
      this.lastRoll = null;
      return;
    }
    const d = sim.ac.data;
    const c = sim.controls;
    const pr = this.lastPitch === null ? 0 : (d.pitchDeg - this.lastPitch) / dt;
    const rr = this.lastRoll === null ? 0 : (d.rollDeg - this.lastRoll) / dt;
    this.lastPitch = d.pitchDeg;
    this.lastRoll = d.rollDeg;
    // ---------------- lateral
    if (this.lateral) {
      const std = standardRateBankDeg(d.tasKt);
      let bank: number;
      if (this.bankInput !== 0) bank = this.bankInput * std;
      else if (this.targetHdg !== null)
        bank = clamp(wrap180(this.targetHdg - d.hdgTrue) * 1.1, -std, std);
      else bank = 0;
      this.bankCmd += (bank - this.bankCmd) * Math.min(1, dt * 1.6);
      const be = this.bankCmd - d.rollDeg;
      c.aileron = clamp(be * 0.02 - rr * 0.012, -0.35, 0.35);
      c.rudder = 0;
    }
    // ---------------- pitch for altitude (with the pitch pad: a climb or descent at 500 ft/min while held)
    if (this.holdAlt) {
      const tasFpm = Math.max(40, d.tasKt) * 101.27;
      const vsC =
        this.pitchInput !== 0
          ? this.pitchInput * 500
          : clamp((this.targetAlt - sim.ac.s.altFt) * 4, -700, 700);
      const gC = Math.asin(clamp(vsC / tasFpm, -0.5, 0.5)) / DEG;
      this.pitchInt = clamp(
        this.pitchInt + (vsC - d.vsFpm) * 0.0012 * dt,
        -5,
        5,
      );
      const pitch = clamp(
        gC + d.aoaDeg + this.pitchInt + (vsC - d.vsFpm) * 0.002,
        -10,
        15,
      );
      const pe = pitch - d.pitchDeg;
      c.elevator = clamp(pe * 0.07 - pr * 0.025, -0.4, 0.4);
      c.trim = clamp(c.trim + pe * 0.012 * dt, -1, 1);
    } else if (this.pitchInput !== 0) {
      c.elevator = clamp(this.pitchInput * 0.12, -0.3, 0.3);
    } else if (this.lateral && Math.abs(c.elevator) > 0) {
      // release the pitch input (the trim holds the attitude)
      c.elevator *= 0.9;
    }
    // ---------------- power for speed: the throttle integrates the speed error, damped by the acceleration
    if (this.holdIas) {
      const acc = this.lastIas === null ? 0 : (d.iasKt - this.lastIas) / dt;
      this.iasRate += (clamp(acc, -6, 6) - this.iasRate) * Math.min(1, dt / 0.8);
      const e = this.targetIas - d.iasKt;
      c.throttle = clamp(c.throttle + (e * 0.01 - this.iasRate * 0.06) * dt, 0.05, 1);
    }
    this.lastIas = d.iasKt;
  }
}
