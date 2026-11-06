// The pilot's avionics knobs as pure functions over a Sim: OBS, heading bug, course, CDI source, bearing
// pointers, altimeter setting, selected altitude. One definition shared by every caller — the cockpit (main.ts
// wiring, knobs, keyboard, softkeys), the course stage controls and the companion — so a knob behaves the same
// everywhere. No DOM, no toasts: each function returns what it set so the caller can announce it.
import type { Sim } from "./sim";
import type { CdiSource } from "../avionics/autopilot";

/** A heading / course in 1..360 (a compass rose has no 000). */
export const deg360 = (v: number): number =>
  ((Math.round(v) % 360) + 360) % 360 || 360;

/** Fine / coarse knob steps: 1° / 10°, 100 ft / 1000 ft, 0.01 / 0.10 inHg. */
const step = (coarse: boolean | undefined, fine: number, big: number) =>
  coarse ? big : fine;

// ------------------------------------------------------------------ OBS (NAV1 / NAV2 course selectors)
/** Set the OBS of NAV1 or NAV2 to a course (degrees magnetic). Returns the value set. */
export function setObs(sim: Sim, nav: 1 | 2, value: number): number {
  const v = deg360(value);
  if (nav === 2) sim.av.obs2 = v;
  else sim.av.obs1 = v;
  return v;
}
/** Turn an OBS knob by d clicks (1° each, 10° coarse). */
export function nudgeObs(
  sim: Sim,
  nav: 1 | 2,
  d: number,
  coarse = false,
): number {
  return setObs(
    sim,
    nav,
    (nav === 2 ? sim.av.obs2 : sim.av.obs1) + d * step(coarse, 1, 10),
  );
}

// ------------------------------------------------------------------ heading bug
export function setHdgBug(sim: Sim, value: number): number {
  return (sim.ap.hdgBug = deg360(value));
}
/** HDG knob: d clicks of 1° (10° coarse). Same arithmetic as the cockpit knob. */
export function nudgeHdgBug(sim: Sim, d: number, coarse = false): number {
  return (sim.ap.hdgBug =
    (((sim.ap.hdgBug + d * step(coarse, 1, 10)) % 360) + 360) % 360 || 360);
}
/** HDG push: bug to the current heading. */
export function syncHdgBug(sim: Sim): number {
  return (sim.ap.hdgBug = Math.round(sim.ac.data.hdgTrue) || 360);
}

// ------------------------------------------------------------------ CRS (the course of the active CDI source)
/** CRS knob: sets the course of the active CDI source (OBS1 / OBS2, or the GPS OBS course in OBS mode). */
export function setCrs(sim: Sim, value: number): number {
  sim.setCourse(value);
  return sim.course();
}
export function nudgeCrs(sim: Sim, d: number, coarse = false): number {
  return setCrs(sim, sim.course() + d * step(coarse, 1, 10));
}
/** CRS push: centre the needle on a VOR (TO or FROM as now). Returns the new course, or null (GPS, LOC, no signal). */
export function centerCdi(sim: Sim): number | null {
  const n = sim.navInputs();
  if (n.cdi === "GPS" || !n.nav.valid || n.nav.isLoc) return null;
  sim.setCourse(n.nav.toFrom === "FROM" ? n.nav.radial : n.nav.bearingTo);
  return sim.course();
}

// ------------------------------------------------------------------ CDI source and bearing pointers
/** CDI softkey / key C: GPS → NAV1 → NAV2 (sources the aircraft is not equipped with are skipped). */
export function cycleCdi(sim: Sim): CdiSource {
  sim.cycleCdi();
  return sim.av.cdi;
}
export function setCdi(sim: Sim, src: CdiSource): CdiSource {
  sim.setCdi(src);
  return sim.av.cdi;
}
export const BRG1_ORDER = ["OFF", "NAV1", "GPS", "ADF"] as const;
export const BRG2_ORDER = ["OFF", "NAV2", "GPS", "ADF"] as const;
export type Brg1Source = (typeof BRG1_ORDER)[number];
export type Brg2Source = (typeof BRG2_ORDER)[number];
/** BRG1 / BRG2 softkey: OFF → NAV → GPS → ADF → OFF. Returns the new source. */
export function cycleBrg(sim: Sim, which: 1 | 2): Brg1Source | Brg2Source {
  const av = sim.av;
  if (which === 1)
    return (av.bearing1 =
      BRG1_ORDER[(BRG1_ORDER.indexOf(av.bearing1) + 1) % BRG1_ORDER.length]);
  return (av.bearing2 =
    BRG2_ORDER[(BRG2_ORDER.indexOf(av.bearing2) + 1) % BRG2_ORDER.length]);
}

// ------------------------------------------------------------------ altimeter setting and selected altitude
/** Kollsman window range of the trainer's altimeters (inHg). */
export const BARO_MIN = 27.5;
export const BARO_MAX = 31.5;
/** Set the altimeter (inHg, rounded to 0.01 and kept in the Kollsman range). Returns the value set. */
export function setBaro(sim: Sim, inHg: number): number {
  return (sim.av.baro =
    Math.round(Math.max(BARO_MIN, Math.min(BARO_MAX, inHg)) * 100) / 100);
}
/** BARO knob: d clicks of 0.01 inHg (0.10 coarse). Same arithmetic as the cockpit knob. */
export function nudgeBaro(sim: Sim, d: number, coarse = false): number {
  return (sim.av.baro =
    Math.round((sim.av.baro + d * step(coarse, 0.01, 0.1)) * 100) / 100);
}
/** B key: altimeter to the reported QNH. */
export function setBaroToQnh(sim: Sim): number {
  return (sim.av.baro = sim.weather.qnh);
}
/** ALT SEL knob: d clicks of 100 ft (1000 coarse), 0..18 000 ft. */
export function nudgeAltSel(sim: Sim, d: number, coarse = false): number {
  return (sim.ap.altSel = Math.max(
    0,
    Math.min(18000, sim.ap.altSel + d * step(coarse, 100, 1000)),
  ));
}
/** ALT push: selected altitude to the current indicated altitude (nearest 100 ft). */
export function syncAltSel(sim: Sim): number {
  return (sim.ap.altSel = Math.round(sim.indicatedAlt() / 100) * 100);
}
