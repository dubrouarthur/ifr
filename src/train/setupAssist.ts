// Setup assistant: what the student must configure for the task at hand (a hold, an approach, a VOR
// intercept) — the right navigation source, frequency, course, bearing pointers, altitude and the entry
// to fly — each item checked live against the aircraft. Pure logic: the coach panel renders the items.
import { NAVAIDS, findFix, approach as getApproach } from "../nav/data";
import { holdEntry, type HoldDef } from "../nav/holding";
import { bearingDeg, distanceNm } from "../nav/geo";
import type { Sim } from "../sim/sim";

export interface SetupItem {
  /** short instruction, e.g. "NAV1 114.20 (ARD)" */
  label: string;
  /** why / how, one line */
  detail?: string;
  /** satisfied right now (null = information, nothing to check) */
  ok: boolean | null;
}

const pad3 = (n: number) =>
  String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, "0");
const angDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
const freqEq = (a: number, b: number) => Math.abs(a - b) < 0.006;

/** the cockpit the student flies: a glass panel shows the NDB on a bearing pointer (BRG1/BRG2), a steam
 *  panel has its own ADF/RMI needle that always shows. The shell sets it when the cockpit changes. */
let panel: "glass" | "steam" = "glass";
export function setSetupPanel(p: "glass" | "steam") {
  panel = p;
}

/** navigation source the student should use for a fix: a VOR/VORDME (raw data), an NDB, or GPS */
export function navSourceFor(
  _sim: Sim,
  ident: string,
): { kind: "VOR" | "NDB" | "GPS"; freq?: number; name?: string } {
  const nav = NAVAIDS.find(
    (n) =>
      n.ident === ident &&
      (n.type === "VOR" || n.type === "VORDME" || n.type === "NDB"),
  );
  if (nav && nav.type === "NDB")
    return { kind: "NDB", freq: nav.freq, name: nav.name };
  if (nav) return { kind: "VOR", freq: nav.freq, name: nav.name };
  return { kind: "GPS" };
}

/** ADF tuned to the NDB, and (glass cockpit) a bearing pointer on the ADF */
function adfItems(sim: Sim, freq: number, ident: string): SetupItem[] {
  const items: SetupItem[] = [
    {
      label: `ADF ${freq.toFixed(0)} (${ident})`,
      detail:
        "Tune the NDB in the ADF and identify it (Morse) before using the needle.",
      ok: Math.abs(sim.av.adf.active - freq) < 1 && sim.adf.valid,
    },
  ];
  if (panel === "glass")
    items.push({
      label: "BRG1 on ADF",
      detail:
        "PFD softkey BRG1 until the pointer box reads ADF: the cyan needle then points to the NDB (head = QDM to the fix).",
      ok: sim.av.bearing1 === "ADF" || sim.av.bearing2 === "ADF",
    });
  return items;
}

/** the entry procedure in plain words, from the aircraft's current course to the fix */
export function entryInstruction(
  def: HoldDef,
  courseToFix: number,
): { entry: string; text: string } {
  const e = holdEntry(def.inbound, def.turn, courseToFix);
  const outbound = (def.inbound + 180) % 360;
  const s = def.turn === "R" ? 1 : -1;
  if (e === "DIRECT")
    return {
      entry: "Direct",
      text: `At ${def.fix.ident} turn ${def.turn === "R" ? "right" : "left"} to the outbound heading ${pad3(outbound)}°, fly ${def.legMin} min, then turn to intercept ${pad3(def.inbound)}° inbound.`,
    };
  if (e === "TEARDROP")
    return {
      entry: "Teardrop",
      text: `At ${def.fix.ident} turn to ${pad3(outbound - 30 * s)}° (30° into the holding side), fly ${def.legMin} min, then turn ${def.turn === "R" ? "right" : "left"} to intercept ${pad3(def.inbound)}° inbound.`,
    };
  return {
    entry: "Parallel",
    text: `At ${def.fix.ident} turn to the outbound heading ${pad3(outbound)}° (non-holding side), fly ${def.legMin} min, turn ${def.turn === "R" ? "left" : "right"} back more than 180° to the fix, then fly the hold.`,
  };
}

/** setup checklist for a hold */
export function holdSetup(sim: Sim, def: HoldDef): SetupItem[] {
  const items: SetupItem[] = [];
  const src = navSourceFor(sim, def.fix.ident);
  const av = sim.av;
  const ac = sim.ac.s;
  if (src.kind === "VOR") {
    items.push({
      label: `NAV1 ${src.freq!.toFixed(2)} (${def.fix.ident})`,
      detail: "Tune the holding VOR in NAV1 and identify it (Morse).",
      ok: freqEq(av.nav1.active, src.freq!) && sim.nav1.valid,
    });
    items.push({
      label: "CDI on NAV1",
      detail: "Raw data: the course needle must show the VOR, not the GPS.",
      ok: av.cdi === "NAV1",
    });
    items.push({
      label: `CRS ${pad3(def.inbound)}°`,
      detail:
        "Set the OBS/CRS to the inbound course: a centred needle TO the fix means you are on the inbound leg.",
      ok: angDiff(av.obs1, def.inbound) <= 2,
    });
  } else if (src.kind === "NDB") {
    // the NDB is the fix: the bearing pointer is the primary reference (QDM), the CDI gives the inbound course
    items.push(...adfItems(sim, src.freq!, def.fix.ident));
    const gpsHold = !!sim.fp.wpts.find(
      (w) => w.ident === def.fix.ident && w.hold,
    );
    if (sim.equip.gps) {
      items.push({
        label: `GPS: hold at ${def.fix.ident} loaded`,
        detail:
          "GPS overlay: the hold at the NDB in the flight plan (FPL → hold, or D→ the fix then HOLD) draws the racetrack and sequences it.",
        ok: gpsHold,
      });
      items.push({
        label: "CDI on GPS",
        detail:
          "The course needle shows the GPS desired track of each leg; cross-check it with the ADF needle.",
        ok: av.cdi === "GPS",
      });
    } else {
      items.push({
        label: `CRS ${pad3(def.inbound)}° (inbound reference)`,
        detail:
          "Set the course arrow to the inbound course: the ADF needle on the arrow head means you are on the inbound leg.",
        ok: angDiff(av.obs1, def.inbound) <= 2,
      });
    }
  } else {
    const gpsHold = !!sim.fp.wpts.find(
      (w) => w.ident === def.fix.ident && w.hold,
    );
    items.push({
      label: `GPS: hold at ${def.fix.ident} loaded`,
      detail:
        "FPL → hold at the fix (or Direct-To the fix then HOLD) so the GPS draws the racetrack and sequences.",
      ok: gpsHold,
    });
    items.push({
      label: "CDI on GPS",
      detail: "The GPS gives the desired track (DTK) of every leg of the hold.",
      ok: av.cdi === "GPS",
    });
  }
  items.push({
    label: `ALT ${def.altFt} ft`,
    detail:
      "Set the altitude bug; be level at the holding altitude before the fix.",
    ok: Math.abs(sim.ap.altSel - def.altFt) < 50,
  });
  items.push({
    label: "Slow to holding speed (≤ 90 KIAS)",
    detail: "Reduce speed about 3 minutes before the fix.",
    ok: sim.ac.data.iasKt <= 95,
  });
  const crs = bearingDeg(ac, def.fix);
  const e = entryInstruction(def, crs);
  const d = distanceNm(ac, def.fix);
  items.push({
    label: `Entry: ${e.entry}`,
    detail: `${e.text}${d > 0.5 ? ` (${d.toFixed(1)} NM to ${def.fix.ident})` : ""}`,
    ok: null,
  });
  items.push({
    label: "Time outbound from abeam the fix",
    detail:
      "Start the timer abeam the fix; adjust the outbound time so the inbound leg takes 1 min. Triple the inbound wind correction outbound.",
    ok: null,
  });
  return items;
}

/** setup checklist for an approach */
export function approachSetup(sim: Sim, approachId: string): SetupItem[] {
  let ap;
  try {
    ap = getApproach(approachId);
  } catch {
    return [];
  }
  const av = sim.av;
  const items: SetupItem[] = [];
  const nav = ap.navaid
    ? NAVAIDS.find((n) => n.ident === ap.navaid)
    : undefined;
  const crs = ap.crsSetting ?? ap.finalCourse;
  if (ap.type === "RNAV") {
    items.push({
      label: `GPS: ${ap.name} loaded`,
      detail:
        "Load the approach in the flight plan (PROC), with the right transition, and activate it.",
      ok: sim.fp.approachId === ap.id,
    });
    items.push({ label: "CDI on GPS", ok: av.cdi === "GPS" });
  } else if (nav && nav.type !== "NDB") {
    items.push({
      label: `NAV1 ${nav.freq.toFixed(2)} (${nav.ident})`,
      detail: "Tune and identify the localizer / VOR of the final approach.",
      ok: freqEq(av.nav1.active, nav.freq) && sim.nav1.valid,
    });
    items.push({
      label: `CRS ${pad3(crs)}°`,
      detail:
        ap.type === "LOCBC"
          ? "Back course: set the FRONT course (the HSI then reads correctly)."
          : "Set the final approach course.",
      ok: angDiff(av.obs1, crs) <= 2,
    });
    items.push({
      label: "CDI on NAV1 (LOC) before the final",
      detail: "Switch from GPS to LOC/VOR for the final approach segment.",
      ok: av.cdi === "NAV1",
    });
  } else if (nav) {
    items.push(...adfItems(sim, nav.freq, nav.ident));
  }
  const m = ap.minimums[0];
  const mins = m?.da ?? m?.mda;
  if (mins)
    items.push({
      label: `Minimums ${m.da ? "DA" : "MDA"} ${mins} ft`,
      detail: `${m.label} — set the baro minimums bug.`,
      ok: av.minimums !== null && Math.abs(av.minimums - mins) < 20,
    });
  items.push({
    label: `Altimeter ${sim.weather.qnh.toFixed(2)}`,
    detail: "Set the current altimeter setting (ATIS).",
    ok: Math.abs(av.baro - sim.weather.qnh) < 0.015,
  });
  const maAlt = ap.missed[ap.missed.length - 1]?.altMin;
  if (maAlt)
    items.push({
      label: `Missed approach: ${ap.missedText || `climb to ${maAlt}`}`,
      detail:
        "Brief it now; set the altitude bug to the missed-approach altitude once established on the glidepath.",
      ok: null,
    });
  return items;
}

/** setup checklist for tracking to / from a VOR on a course */
export function vorSetup(sim: Sim, ident: string, course: number): SetupItem[] {
  const f = findFix(ident);
  const nav = NAVAIDS.find((n) => n.ident === ident);
  if (!f || !nav) return [];
  return [
    {
      label: `NAV1 ${nav.freq.toFixed(2)} (${ident})`,
      detail: "Tune and identify.",
      ok: freqEq(sim.av.nav1.active, nav.freq) && sim.nav1.valid,
    },
    { label: "CDI on NAV1", ok: sim.av.cdi === "NAV1" },
    {
      label: `CRS ${pad3(course)}°`,
      detail:
        "TO flag when the course leads to the station, FROM when it leads away.",
      ok: angDiff(sim.av.obs1, course) <= 2,
    },
  ];
}
