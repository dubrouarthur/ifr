// Setup assistant: what the student must configure for the task at hand (a hold, an approach, a VOR
// intercept) — the right navigation source, frequency, course, bearing pointers, altitude and the entry
// to fly — each item checked live against the aircraft. Pure logic: the coach panel renders the items.
import { NAVAIDS, findFix, approach as getApproach } from "../nav/data";
import { holdEntry, type HoldDef } from "../nav/holding";
import { bearingDeg, distanceNm } from "../nav/geo";
import type { Sim } from "../sim/sim";
import { lang } from "../ui/i18n";

/** the item's words in the UI language (labels and details are read by the pilot; the debrief log stays English) */
const L = (en: string, fr: string) => (lang() === "fr" ? fr : en);

export interface SetupItem {
  /** short instruction, e.g. "NAV1 114.20 (ARD)" */
  label: string;
  /** why / how, one line */
  detail?: string;
  /** satisfied right now (null = information, nothing to check) */
  ok: boolean | null;
  /** one-tap help: sets the item the way a pilot would (absent in a checkride, a test, or when nothing can be set) */
  action?: SetupAction;
}

export interface SetupAction {
  /** button text, one verb: "Tune", "Set", "Select", "Load" */
  label: string;
  /** applies the setting and logs it ("Set up with help: …") so the debrief can say so */
  run(sim: Sim): void;
}

/** one-tap setup help is off in a checkride and in a procedure test (the shell sets the test case) */
let helpOff = false;
export function setSetupHelp(on: boolean) {
  helpOff = !on;
}
export function setupHelpAllowed(sim: Sim): boolean {
  return !helpOff && sim.assess.mode !== "checkride";
}

/** while "Set all remaining" runs, the single actions do not log one line each */
let quiet = false;
const helped = (sim: Sim, what: string) => {
  if (!quiet) sim.rec.log(sim.time, "info", `Set up with help: ${what}`);
};
/** builds the action of an item, or nothing when help is not allowed */
function act(
  sim: Sim,
  label: string,
  what: string,
  apply: (sim: Sim) => void,
): SetupAction | undefined {
  if (!setupHelpAllowed(sim)) return undefined;
  return {
    label,
    run(s: Sim) {
      apply(s);
      s.updateAvionics(0);
      helped(s, what);
    },
  };
}

/** a pilot tunes the standby frequency, then swaps it into active (the old active stays in standby) */
export function tuneRadio(sim: Sim, radio: "nav1" | "nav2" | "adf", freq: number) {
  const r = sim.av[radio];
  if (Math.abs(r.active - freq) < 0.006) return;
  r.standby = freq;
  const a = r.active;
  r.active = r.standby;
  r.standby = a;
}
const tune = (sim: Sim, radio: "nav1" | "nav2" | "adf", freq: number, what: string) =>
  act(sim, "Tune", what, (s) => tuneRadio(s, radio, freq));
const course = (sim: Sim, crs: number, what: string) =>
  act(sim, "Set", what, (s) => {
    s.av.obs1 = Math.round(((crs % 360) + 360) % 360) || 360;
  });
const cdi = (sim: Sim, src: "NAV1" | "GPS", what: string) =>
  act(sim, "Select", what, (s) => s.setCdi(src));

/** "Set all remaining": runs every to-do item that has an action, logs one line; returns how many it set */
export function setAllRemaining(sim: Sim, items: SetupItem[]): number {
  const todo = items.filter((i) => i.ok === false && i.action);
  if (!todo.length) return 0;
  quiet = true;
  try {
    for (const i of todo) i.action!.run(sim);
  } finally {
    quiet = false;
  }
  helped(sim, todo.map((i) => i.label).join(", "));
  return todo.length;
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
      detail: L(
        "Tune the NDB in the ADF and identify it (Morse) before using the needle.",
        "Affichez le NDB sur l’ADF et identifiez-le (morse) avant d’utiliser l’aiguille.",
      ),
      ok: Math.abs(sim.av.adf.active - freq) < 1 && sim.adf.valid,
      action: tune(sim, "adf", freq, `ADF ${freq.toFixed(0)} (${ident})`),
    },
  ];
  if (panel === "glass")
    items.push({
      label: L("BRG1 on ADF", "BRG1 sur ADF"),
      detail: L(
        "PFD softkey BRG1 until the pointer box reads ADF: the cyan needle then points to the NDB (head = QDM to the fix).",
        "Touche BRG1 du PFD jusqu’à lire ADF dans la case : l’aiguille cyan pointe alors le NDB (tête = QDM vers le point).",
      ),
      ok: sim.av.bearing1 === "ADF" || sim.av.bearing2 === "ADF",
      action: act(sim, "Set", "BRG1 on ADF", (s) => {
        s.av.bearing1 = "ADF";
      }),
    });
  return items;
}

const ENTRY_FR: Record<string, string> = { Direct: "directe", Teardrop: "décalée", Parallel: "parallèle" };

/** the entry procedure in plain words, from the aircraft's current course to the fix */
export function entryInstruction(
  def: HoldDef,
  courseToFix: number,
): { entry: string; text: string } {
  const e = holdEntry(def.inbound, def.turn, courseToFix);
  const outbound = (def.inbound + 180) % 360;
  const s = def.turn === "R" ? 1 : -1;
  const side = (r: boolean) => (r ? L("right", "à droite") : L("left", "à gauche"));
  if (e === "DIRECT")
    return {
      entry: "Direct",
      text: L(
        `At ${def.fix.ident} turn ${side(def.turn === "R")} to the outbound heading ${pad3(outbound)}°, fly ${def.legMin} min, then turn to intercept ${pad3(def.inbound)}° inbound.`,
        `À ${def.fix.ident}, virez ${side(def.turn === "R")} au cap d’éloignement ${pad3(outbound)}°, volez ${def.legMin} min, puis virez pour intercepter ${pad3(def.inbound)}° en rapprochement.`,
      ),
    };
  if (e === "TEARDROP")
    return {
      entry: "Teardrop",
      text: L(
        `At ${def.fix.ident} turn to ${pad3(outbound - 30 * s)}° (30° into the holding side), fly ${def.legMin} min, then turn ${side(def.turn === "R")} to intercept ${pad3(def.inbound)}° inbound.`,
        `À ${def.fix.ident}, prenez le cap ${pad3(outbound - 30 * s)}° (30° côté attente), volez ${def.legMin} min, puis virez ${side(def.turn === "R")} pour intercepter ${pad3(def.inbound)}° en rapprochement.`,
      ),
    };
  return {
    entry: "Parallel",
    text: L(
      `At ${def.fix.ident} turn to the outbound heading ${pad3(outbound)}° (non-holding side), fly ${def.legMin} min, turn ${side(def.turn !== "R")} back more than 180° to the fix, then fly the hold.`,
      `À ${def.fix.ident}, prenez le cap d’éloignement ${pad3(outbound)}° (côté non protégé), volez ${def.legMin} min, virez ${side(def.turn !== "R")} de plus de 180° vers le point, puis effectuez l’attente.`,
    ),
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
      detail: L("Tune the holding VOR in NAV1 and identify it (Morse).", "Affichez le VOR d’attente sur NAV1 et identifiez-le (morse)."),
      ok: freqEq(av.nav1.active, src.freq!) && sim.nav1.valid,
      action: tune(sim, "nav1", src.freq!, `NAV1 ${src.freq!.toFixed(2)} (${def.fix.ident})`),
    });
    items.push({
      label: L("CDI on NAV1", "CDI sur NAV1"),
      detail: L("Raw data: the course needle must show the VOR, not the GPS.", "Données brutes : l’aiguille de route doit montrer le VOR, pas le GPS."),
      ok: av.cdi === "NAV1",
      action: cdi(sim, "NAV1", "CDI on NAV1"),
    });
    items.push({
      label: `CRS ${pad3(def.inbound)}°`,
      detail: L(
        "Set the OBS/CRS to the inbound course: a centred needle TO the fix means you are on the inbound leg.",
        "Affichez l’OBS/CRS sur la route de rapprochement : aiguille centrée TO vers le point = vous êtes sur la branche de rapprochement.",
      ),
      ok: angDiff(av.obs1, def.inbound) <= 2,
      action: course(sim, def.inbound, `CRS ${pad3(def.inbound)}°`),
    });
  } else if (src.kind === "NDB") {
    // the NDB is the fix: the bearing pointer is the primary reference (QDM), the CDI gives the inbound course
    items.push(...adfItems(sim, src.freq!, def.fix.ident));
    const gpsHold = !!sim.fp.wpts.find(
      (w) => w.ident === def.fix.ident && w.hold,
    );
    if (sim.equip.gps) {
      items.push({
        label: L(`GPS: hold at ${def.fix.ident} loaded`, `GPS : attente à ${def.fix.ident} chargée`),
        detail: L(
          "GPS overlay: the hold at the NDB in the flight plan (FPL → hold, or D→ the fix then HOLD) draws the racetrack and sequences it.",
          "Superposition GPS : l’attente au NDB dans le plan de vol (FPL → attente, ou D→ le point puis HOLD) trace l’hippodrome et le séquence.",
        ),
        ok: gpsHold,
        action: act(sim, "Load", `GPS hold at ${def.fix.ident}`, (s) =>
          s.fp.setHold(
            { ident: def.fix.ident, lat: def.fix.lat, lon: def.fix.lon },
            def.inbound,
            def.turn,
            def.legMin,
            s.ac.s,
            def.altFt,
          ),
        ),
      });
      items.push({
        label: L("CDI on GPS", "CDI sur GPS"),
        detail: L(
          "The course needle shows the GPS desired track of each leg; cross-check it with the ADF needle.",
          "L’aiguille de route montre la route désirée GPS de chaque branche ; recoupez-la avec l’aiguille ADF.",
        ),
        ok: av.cdi === "GPS",
        action: cdi(sim, "GPS", "CDI on GPS"),
      });
    } else {
      items.push({
        label: L(`CRS ${pad3(def.inbound)}° (inbound reference)`, `CRS ${pad3(def.inbound)}° (référence de rapprochement)`),
        detail: L(
          "Set the course arrow to the inbound course: the ADF needle on the arrow head means you are on the inbound leg.",
          "Affichez la flèche de route sur la route de rapprochement : l’aiguille ADF sur la pointe = vous êtes sur la branche de rapprochement.",
        ),
        ok: angDiff(av.obs1, def.inbound) <= 2,
        action: course(sim, def.inbound, `CRS ${pad3(def.inbound)}°`),
      });
    }
  } else {
    const gpsHold = !!sim.fp.wpts.find(
      (w) => w.ident === def.fix.ident && w.hold,
    );
    items.push({
      label: L(`GPS: hold at ${def.fix.ident} loaded`, `GPS : attente à ${def.fix.ident} chargée`),
      detail: L(
        "FPL → hold at the fix (or Direct-To the fix then HOLD) so the GPS draws the racetrack and sequences.",
        "FPL → attente au point (ou Direct-To le point puis HOLD) pour que le GPS trace l’hippodrome et le séquence.",
      ),
      ok: gpsHold,
      action: act(sim, "Load", `GPS hold at ${def.fix.ident}`, (s) =>
        s.fp.setHold(
          { ident: def.fix.ident, lat: def.fix.lat, lon: def.fix.lon },
          def.inbound,
          def.turn,
          def.legMin,
          s.ac.s,
          def.altFt,
        ),
      ),
    });
    items.push({
      label: L("CDI on GPS", "CDI sur GPS"),
      detail: L("The GPS gives the desired track (DTK) of every leg of the hold.", "Le GPS donne la route désirée (DTK) de chaque branche de l’attente."),
      ok: av.cdi === "GPS",
      action: cdi(sim, "GPS", "CDI on GPS"),
    });
  }
  items.push({
    label: `ALT ${def.altFt} ft`,
    detail: L(
      "Set the altitude bug; be level at the holding altitude before the fix.",
      "Affichez l’altitude sélectée ; soyez en palier à l’altitude d’attente avant le point.",
    ),
    ok: Math.abs(sim.ap.altSel - def.altFt) < 50,
    action: act(sim, "Set", `ALT ${def.altFt} ft`, (s) => {
      s.ap.altSel = def.altFt;
    }),
  });
  items.push({
    label: L("Slow to holding speed (≤ 90 KIAS)", "Réduire à la vitesse d’attente (≤ 90 KIAS)"),
    detail: L("Reduce speed about 3 minutes before the fix.", "Réduisez environ 3 minutes avant le point."),
    ok: sim.ac.data.iasKt <= 95,
  });
  const crs = bearingDeg(ac, def.fix);
  const e = entryInstruction(def, crs);
  const d = distanceNm(ac, def.fix);
  items.push({
    label: L(`Entry: ${e.entry}`, `Entrée : ${ENTRY_FR[e.entry] ?? e.entry}`),
    detail: `${e.text}${d > 0.5 ? L(` (${d.toFixed(1)} NM to ${def.fix.ident})`, ` (${d.toFixed(1)} NM jusqu’à ${def.fix.ident})`) : ""}`,
    ok: null,
  });
  items.push({
    label: L("Time outbound from abeam the fix", "Chronométrer l’éloignement depuis le travers"),
    detail: L(
      "Start the timer abeam the fix; adjust the outbound time so the inbound leg takes 1 min. Triple the inbound wind correction outbound.",
      "Déclenchez le chrono au travers du point ; ajustez le temps d’éloignement pour un rapprochement de 1 min. Triplez en éloignement la correction de vent du rapprochement.",
    ),
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
      label: L(`GPS: ${ap.name} loaded`, `GPS : ${ap.name} chargée`),
      detail: L(
        "Load the approach in the flight plan (PROC), with the right transition, and activate it.",
        "Chargez l’approche dans le plan de vol (PROC), avec la bonne transition, et activez-la.",
      ),
      ok: sim.fp.approachId === ap.id,
      action: act(sim, "Load", `GPS ${ap.name} loaded`, (s) =>
        s.loadApproach(ap.id, null, "load"),
      ),
    });
    items.push({
      label: L("CDI on GPS", "CDI sur GPS"),
      ok: av.cdi === "GPS",
      action: cdi(sim, "GPS", "CDI on GPS"),
    });
  } else if (nav && nav.type !== "NDB") {
    items.push({
      label: `NAV1 ${nav.freq.toFixed(2)} (${nav.ident})`,
      detail: L("Tune and identify the localizer / VOR of the final approach.", "Affichez et identifiez le localizer / VOR de l’approche finale."),
      ok: freqEq(av.nav1.active, nav.freq) && sim.nav1.valid,
      action: tune(sim, "nav1", nav.freq, `NAV1 ${nav.freq.toFixed(2)} (${nav.ident})`),
    });
    items.push({
      label: `CRS ${pad3(crs)}°`,
      detail:
        ap.type === "LOCBC"
          ? L("Back course: set the FRONT course (the HSI then reads correctly).", "Back course : affichez la route FRONT (le HSI se lit alors correctement).")
          : L("Set the final approach course.", "Affichez la route d’approche finale."),
      ok: angDiff(av.obs1, crs) <= 2,
      action: course(sim, crs, `CRS ${pad3(crs)}°`),
    });
    items.push({
      label: L("CDI on NAV1 (LOC) before the final", "CDI sur NAV1 (LOC) avant la finale"),
      detail: L("Switch from GPS to LOC/VOR for the final approach segment.", "Passez du GPS au LOC/VOR pour le segment d’approche finale."),
      ok: av.cdi === "NAV1",
      action: cdi(sim, "NAV1", "CDI on NAV1"),
    });
  } else if (nav) {
    items.push(...adfItems(sim, nav.freq, nav.ident));
  }
  const m = ap.minimums[0];
  const mins = m?.da ?? m?.mda;
  if (mins)
    items.push({
      label: L(`Minimums ${m.da ? "DA" : "MDA"} ${mins} ft`, `Minima ${m.da ? "DA" : "MDA"} ${mins} ft`),
      detail: L(`${m.label} — set the baro minimums bug.`, `${m.label} — affichez les minima baro.`),
      ok: av.minimums !== null && Math.abs(av.minimums - mins) < 20,
      action: act(sim, "Set", `Minimums ${mins} ft`, (s) => {
        s.av.minimums = mins;
      }),
    });
  items.push({
    label: L(`Altimeter ${sim.weather.qnh.toFixed(2)}`, `Calage altimétrique ${sim.weather.qnh.toFixed(2)}`),
    detail: L("Set the current altimeter setting (ATIS).", "Affichez le calage altimétrique en vigueur (ATIS)."),
    ok: Math.abs(av.baro - sim.weather.qnh) < 0.015,
    action: act(sim, "Set", `Altimeter ${sim.weather.qnh.toFixed(2)}`, (s) => {
      s.av.baro = Math.round(s.weather.qnh * 100) / 100;
    }),
  });
  const maAlt = ap.missed[ap.missed.length - 1]?.altMin;
  if (maAlt)
    items.push({
      label: L(`Missed approach: ${ap.missedText || `climb to ${maAlt}`}`, `Approche interrompue : ${ap.missedText || `montée vers ${maAlt}`}`),
      detail: L(
        "Brief it now; set the altitude bug to the missed-approach altitude once established on the glidepath.",
        "Briefez-la maintenant ; affichez l’altitude d’approche interrompue une fois établi sur le plan de descente.",
      ),
      ok: null,
    });
  return items;
}

/** setup checklist for tracking to / from a VOR on a course */
export function vorSetup(sim: Sim, ident: string, crsDeg: number): SetupItem[] {
  const f = findFix(ident);
  const nav = NAVAIDS.find((n) => n.ident === ident);
  if (!f || !nav) return [];
  return [
    {
      label: `NAV1 ${nav.freq.toFixed(2)} (${ident})`,
      detail: L("Tune and identify.", "Affichez et identifiez."),
      ok: freqEq(sim.av.nav1.active, nav.freq) && sim.nav1.valid,
      action: tune(sim, "nav1", nav.freq, `NAV1 ${nav.freq.toFixed(2)} (${ident})`),
    },
    {
      label: L("CDI on NAV1", "CDI sur NAV1"),
      ok: sim.av.cdi === "NAV1",
      action: cdi(sim, "NAV1", "CDI on NAV1"),
    },
    {
      label: `CRS ${pad3(crsDeg)}°`,
      detail: L(
        "TO flag when the course leads to the station, FROM when it leads away.",
        "Drapeau TO quand la route mène à la station, FROM quand elle s’en éloigne.",
      ),
      ok: angDiff(sim.av.obs1, crsDeg) <= 2,
      action: course(sim, crsDeg, `CRS ${pad3(crsDeg)}°`),
    },
  ];
}
