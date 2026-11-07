// The shape of an emergency, as an examiner grades it: AVIATE → RECOGNISE → MEMORY FLOW → CHECKLIST (read-and-do)
// → COMMUNICATE / DECIDE (FAA-H-8083-3C Airplane Flying Handbook ch.18 "aviate, navigate, communicate";
// FAA-S-ACS-6C / ACS-8C emergency operations). The runner (procedures.ts) uses these helpers:
//
//   cuePerceived(failure, view, base)  the first moment the pilot can PERCEIVE the failure (RPM decay, smoke haze,
//                                      LOW VOLTS, an airspeed that disagrees…). Every clock starts there, never at
//                                      the fault injection: an electrical fire has no smoke for several seconds, a
//                                      blocked static port shows nothing in level flight.
//   recognitionTargetS(p)              how fast the first RELEVANT action is expected after the cue (null: not
//                                      timed — comms, GPS, door…). Training choices, club-editable by procedure.
//   envelopeFor(p)                     the flight path the pilot must hold while the procedure runs (bank, airspeed
//                                      band, altitude band, no stall warning, never VNE) — graded in every procedure.
//   phaseOfItem(item)                  memory flow / checklist / communicate.
import type { FailureKey } from "../sim/systemsTypes";
import type { ProcItem, Procedure } from "./procedureTypes";
import type { ProcSimView } from "./procedures";

/** cabin smoke density (systems.ts smokeLevel 0..1) from which the haze over the panel is plainly visible (the
 *  cockpit draws it from 0.03, faint): the C172S has no smoke or fire annunciation — smoke, smell and the engine
 *  gauges are the cues (C172S POH section 3, fires) */
export const SMOKE_CUE = 0.1;
/** an RPM decay the pilot hears and sees on the tachometer (rpm) */
const RPM_DROP_CUE = 200;
/** an airspeed indication that disagrees with pitch and power by this much (kt) is perceptible (IFH FAA-H-8083-15B
 *  ch.3, pitot-static blockage: the ASI no longer agrees with the attitude and power) */
const IAS_DISAGREE_CUE = 10;
/** a frozen altimeter is perceptible once the aircraft really climbed or descended this much (ft), or the VSI
 *  reads this far (fpm) from the real vertical speed */
const ALT_DISAGREE_CUE = 150;
const VS_DISAGREE_CUE = 300;

/** Whether the pilot can perceive the failure now. `base` is the view at the fault injection. A view without the
 *  systems model (editor preview, unit tests) cannot show a symptom: the cue is the injection itself. */
export function cuePerceived(
  f: FailureKey,
  v: ProcSimView,
  base: ProcSimView,
): boolean {
  const sys = v.sys;
  const b = base.sys;
  switch (f) {
    case "engine":
    case "fuelStarvation":
    case "fuelPump":
    case "enginePartial": {
      if (!v.engineRunning) return true;
      if (v.rpm !== undefined && base.rpm !== undefined)
        return base.rpm - v.rpm >= RPM_DROP_CUE;
      if (
        sys &&
        b &&
        b.fuelFlowGph > 2 &&
        sys.fuelFlowGph < b.fuelFlowGph * 0.5
      )
        return true;
      return !sys;
    }
    case "engineRough":
      if (!sys) return true;
      return (
        (sys.vibration ?? 0) >= 0.25 ||
        (v.rpm !== undefined &&
          base.rpm !== undefined &&
          base.rpm - v.rpm >= 100)
      );
    case "oilPressure":
      if (!sys) return true;
      // POH section 2: oil pressure red line 20 PSI, green arc 50–90 — the annunciation lights below 20
      return (
        sys.annunciators.includes("OIL PRESSURE") ||
        (!!b && b.oilPressPsi > 30 && sys.oilPressPsi < b.oilPressPsi * 0.7)
      );
    case "engineFire":
      if (!sys) return true;
      return (
        (sys.smokeLevel ?? 0) >= SMOKE_CUE ||
        (!!b && (sys.chtF ?? 0) - (b.chtF ?? 0) >= 40) ||
        (!!b && (sys.egtF ?? 0) - (b.egtF ?? 0) >= 80)
      );
    case "electricalFire":
      if (!sys) return true;
      return (sys.smokeLevel ?? 0) >= SMOKE_CUE;
    case "alternator":
      if (!sys) return true;
      // C172S NAV III POH section 3: LOW VOLTS, or the ammeter showing a discharge, is the cue
      return (
        sys.annunciators.includes("LOW VOLTS") ||
        ((b?.battAmps ?? 0) > -0.5 && sys.battAmps <= -1.5)
      );
    case "vacuum":
      if (!sys) return true;
      return sys.annunciators.includes("LOW VACUUM") || sys.vacuumInHg < 4;
    case "pitotIcing":
    case "pitotBlocked":
      if (!sys) return true;
      return Math.abs(sys.indicated.iasKt - v.iasKt) >= IAS_DISAGREE_CUE;
    case "staticBlocked":
      if (!sys) return true;
      return (
        Math.abs(sys.indicated.altFt - v.altFt) >= ALT_DISAGREE_CUE ||
        Math.abs(sys.indicated.vsFpm - v.vsFpm) >= VS_DISAGREE_CUE
      );
    case "trimRunaway":
      // the trim wheel turning by itself, then the nose-down pitch
      return (
        Math.abs(v.controls.trim - base.controls.trim) >= 0.05 ||
        Math.abs(v.pitchDeg - base.pitchDeg) >= 3
      );
    case "fuelLeak":
      if (!sys) return true;
      return (
        sys.annunciators.includes("LOW FUEL L") ||
        sys.annunciators.includes("LOW FUEL R") ||
        (!!b &&
          Math.abs(sys.fuelGalL - sys.fuelGalR) -
            Math.abs(b.fuelGalL - b.fuelGalR) >=
            3)
      );
    default:
      // flags and dead displays (AHRS, air data, GPS, NAV, AP, radios, transponder, door noise): seen at once
      return true;
  }
}

/** failures whose cue calls for an immediate airmanship response (AFH ch.18: pitch for the glide at once) */
const URGENT: FailureKey[] = [
  "engine",
  "fuelStarvation",
  "fuelPump",
  "enginePartial",
  "engineFire",
  "electricalFire",
  "trimRunaway",
];

/** Seconds from the cue to the first RELEVANT action expected (full marks at or under it, none at 3×). Null: the
 *  procedure is not about speed (comms, transponder, GPS, NAV, door, flaps): it is not timed. These are training
 *  choices following the audit of examiner practice: ~3 s for an engine failure near the ground, ~5 s for an
 *  engine failure in cruise or a fire, ~15 s for a methodical electrical / instrument diagnosis. */
export function recognitionTargetS(p: Procedure): number | null {
  const fs = p.failures;
  if (p.when?.onGround) return 3;
  if (
    p.when?.aglFt &&
    p.when.aglFt[1] <= 1500 &&
    fs.some((f) => URGENT.includes(f))
  )
    return 3;
  if (fs.some((f) => URGENT.includes(f))) return 5;
  // an autopilot that drops out in cloud: take the controls at once (IFH ch.10, AP malfunctions)
  if (fs.includes("ap")) return 5;
  if (["engine", "electrical", "instruments", "fire"].includes(p.category))
    return 15;
  if (p.category === "flight" && p.failures.length && !fs.includes("flaps"))
    return 5;
  return null;
}

/** The flight path held while the procedure runs. Sources: C172S POH section 2 (VNE 163 KIAS; stall 48 KIAS
 *  clean, the warning horn 5–10 kt above), ACS-8C partial panel / ACS-6C emergency standards (±100 ft, bank
 *  limits, no stall), IFH ch.3 (standard-rate turns, ≤ 20° on partial panel). */
export interface Envelope {
  /** airspeed band (from the procedure's targets) */
  iasKt?: [number, number];
  /** bank limit (deg) while the procedure runs */
  maxBankDeg: number;
  /** altitude to hold within ± this (ft) from the altitude at the cue (instrument, electrical and avionics
   *  failures: the flight continues on its clearance) */
  altTolFt?: number;
  /** the attitude is the problem itself (unusual attitudes, trim runaway): bank and stall count only after the
   *  recovery grace */
  recovery: boolean;
}
export const VNE_KT = 163;
/** bank beyond the limit by this much (deg) = control lost: FAIL (ACS: "maintains positive aircraft control") */
export const BANK_LOST_DEG = 15;
/** after the checklist: a bank beyond this is an upset, whatever the procedure */
export const POST_BANK_DEG = 60;
/** the first seconds after the cue are the pilot's to take over (roll out, pitch for the speed): bank, altitude
 *  and stall-warning limits start counting after them */
export const ENVELOPE_GRACE_S = 5;
/** a stall warning sustained this long above STALL_AGL_FT is a loss of control (the horn in the flare is normal) */
export const STALL_WARN_S = 2;
export const STALL_AGL_FT = 200;

export function envelopeFor(p: Procedure): Envelope {
  const fs = p.failures;
  const partialPanel = fs.some((f) => f === "vacuum" || f === "ahrs");
  const holdAlt =
    (p.category === "electrical" ||
      p.category === "instruments" ||
      p.category === "avionics") &&
    !fs.includes("pitotIcing") &&
    !fs.includes("electricalFire");
  return {
    iasKt: p.targets?.iasKt,
    maxBankDeg: p.targets?.maxBankDeg ?? (partialPanel ? 20 : 30),
    altTolFt: holdAlt ? 100 : undefined,
    recovery: p.category === "flight",
  };
}

export type ItemPhase = "memory" | "checklist" | "communicate";
const COMM_RE =
  /mayday|pan[ -]?pan|7700|7600|121[.,]5|\batc\b|squawk|transpond/i;
/** which part of the flow an item belongs to: the memory flow (every memory item, whatever it is), the read-and-do
 *  checklist, or communicate / decide (MAYDAY, 7700 / 7600, nearest airport) */
export function phaseOfItem(it: ProcItem): ItemPhase {
  if (it.memory) return "memory";
  const c = it.check?.id;
  if (
    c === "xpdr" ||
    c === "radio" ||
    c === "directTo" ||
    COMM_RE.test(it.text)
  )
    return "communicate";
  return "checklist";
}

/** "Fuel selector — BOTH" → ["Fuel selector", "BOTH"]: challenge and response, as a checklist prints them */
export function splitChallenge(text: string): [string, string | null] {
  const m = /^(.*?)\s+[—–]\s+(.+)$/.exec(text);
  return m ? [m[1], m[2]] : [text, null];
}
