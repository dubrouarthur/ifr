// What the debrief replays and grades, read from the cockpit's Sim (SPEC §2.4, P7):
//   - an exercise that just ended: its ResultReport (the result sheet's), re-timed onto the replay clock — the
//     debrief grades the exercise against its own standards, never "not enough flight to grade";
//   - an exercise still flying: the flight so far, labelled "in progress", not graded here;
//   - a free flight or scenario: the recorder's FAA ACS evaluation (approaches, landing, missed approach), or
//     "Not graded" until an approach segment is flown.
// The plan view's published path and the profile's plate come from the procedure flown (the exercise's plate, or
// the approach the recorder saw), or the hold of a holding exercise.
import type { Sim } from "../../sim/sim";
import { evaluateAcs } from "../../sim/recorder";
import { findApproach, runway } from "../../nav/data";
import { alongTrackNm } from "../../nav/geo";
import type { Approach } from "../../nav/types";
import { eventLanes, fromFlight, fromReport, phasesOf, type DebriefModel } from "./debriefData";
import type { MapGeom, PlateGeom } from "./debriefCharts";
import type { DebriefOpen } from "./debrief";
import { buildReport } from "./report";
import type { AcsReport } from "../../sim/recorder";
import type { Lang, NextPlan, ResultInput } from "./types";

export interface ExerciseCtx {
  inp: ResultInput;
  /** the practise-next plan in a language (the sheet's) */
  plan: (L: Lang) => NextPlan;
  /** lesson time → sim time */
  toSim: (lessonT: number) => number;
  attemptId: string;
}

export interface FlightCtx {
  title: string;
  inProgress?: boolean;
  attemptId: string;
}

/** the published path and fixes of an approach (transitions, final, missed) */
export function approachGeom(ap: Approach): MapGeom {
  const legs = [...ap.transitions.flatMap((t) => t.legs), ...ap.final];
  const seen = new Set<string>();
  const fixes = [];
  for (const l of [...legs, ...ap.missed]) {
    if (seen.has(l.fix.ident) || l.fix.kind === "runway") continue;
    seen.add(l.fix.ident);
    fixes.push({
      ident: l.fix.ident,
      lat: l.fix.lat,
      lon: l.fix.lon,
      role: l.role,
      alt: l.altMin ?? undefined,
    });
  }
  // the runway: the end of the final, labelled with the minimums (as the plate's profile shows DA / MDA)
  const rw = ap.final.find((l) => l.fix.kind === "runway");
  const da = ap.minimums[0];
  const dm = da ? (da.da ?? da.mda) : undefined;
  if (rw)
    fixes.push({
      ident: `${ap.airport} ${ap.runway}`,
      lat: rw.fix.lat,
      lon: rw.fix.lon,
      role: dm !== undefined ? `${da?.da !== undefined ? "DA" : "MDA"} ${dm}` : undefined,
    });
  const paths = [
    ...ap.transitions.map((t) =>
      [...t.legs, ap.final[0]].filter(Boolean).map((l) => l.fix),
    ),
    ap.final.map((l) => l.fix),
  ];
  return { fixes, paths };
}

/** the plate's profile view: final-segment fixes against the distance to the threshold, DA / MDA */
export function plateGeom(ap: Approach, mins: number | null): PlateGeom | null {
  let rw;
  try {
    rw = runway(ap.airport, ap.runway);
  } catch {
    return null;
  }
  const thr = rw.threshold;
  const end = rw.end;
  const legs = [...ap.transitions.flatMap((t) => t.legs.slice(-1)), ...ap.final]
    .filter((l) => l.fix.kind !== "runway")
    .map((l) => ({
      ident: l.fix.ident,
      d: -alongTrackNm(thr, end, l.fix),
      altMin: l.altMin ?? undefined,
      role: l.role,
    }))
    .filter(
      (l, i, a) =>
        l.d > 0 && l.d < 30 && a.findIndex((q) => q.ident === l.ident) === i,
    );
  return {
    name: `${ap.airport} ${ap.name}`,
    thr,
    end,
    elevFt: rw.elevFt,
    gsAngle: ap.gsAngle,
    tch: ap.tch,
    legs,
    mins,
    minsKind: ap.gsAngle ? "DA" : "MDA",
  };
}

/** the debrief of what the Sim recorded: an exercise (with its result) or a free flight */
export function debriefOpen(
  sim: Sim,
  ex: ExerciseCtx | null,
  flight: FlightCtx | null,
  opt: { atLessonT?: number; onBack?: () => void } = {},
): DebriefOpen {
  const rec = sim.rec;
  const t0 = rec.samples[0]?.t ?? 0;
  const last = rec.samples[rec.samples.length - 1]?.t ?? t0;
  // an exercise's debrief ends with the exercise: the flight after it (the sheet closed, the student flew on) is
  // not shown under the exercise's verdict
  const exEnd = ex ? ex.toSim(ex.inp.durationSec) + 1 : NaN;
  const t1 = Number.isFinite(exEnd) && exEnd > t0 + 1 ? Math.min(last, exEnd) : last;
  const durS = Math.max(1, t1 - t0);
  const events = rec.events
    .filter((e) => e.t <= t1 + 0.5)
    .map((e) => ({ ...e, t: e.t - t0 }));
  const plateId =
    ex?.inp.ex.plate ?? rec.approach?.id ?? sim.fp.approachId ?? null;
  const ap = plateId
    ? (findApproach(plateId) ??
      (rec.approach?.id === plateId ? rec.approach : null))
    : null;
  const mins = rec.minsUsed ?? sim.av.minimums ?? null;
  let geom: MapGeom = { fixes: [], paths: [] };
  if (ex?.inp.hold)
    geom = {
      fixes: [{ ...ex.inp.hold.fix, alt: ex.inp.hold.altFt }],
      paths: [],
      hold: ex.inp.hold,
    };
  else if (ap) geom = approachGeom(ap);
  else {
    // the flight plan's fixes (direct-to, en route)
    const w = sim.fp.wpts.filter(
      (x) => Number.isFinite(x.lat) && Number.isFinite(x.lon),
    );
    geom = {
      fixes: w.map((x) => ({ ident: x.ident, lat: x.lat, lon: x.lon })),
      paths: w.length > 1 ? [w.map((x) => ({ lat: x.lat, lon: x.lon }))] : [],
    };
  }
  const plate = ap && !ex?.inp.hold ? plateGeom(ap, mins) : null;
  const build = (L: Lang): DebriefModel => {
    if (ex) {
      const inp = { ...ex.inp, lang: L };
      const rep = buildReport(inp);
      return fromReport({
        lang: L,
        rep,
        inp,
        toClip: (lt) => ex.toSim(lt) - t0,
        durS,
        events,
        attemptId: ex.attemptId,
        dateMs: inp.attempt.at,
        student: rec.student,
        plan: ex.plan(L),
      });
    }
    // a graded free flight goes through the same report builder as an exercise: the ACS standards in the UI
    // language, with their tolerance used, and findings with their four answers (FAA-S-ACS-8C IR.VI)
    const acs = evaluateAcs(rec);
    if (!flight?.inProgress && acs.result !== "INCOMPLETE") {
      const inp = flightInput(sim, acs, L, t0, durS, flight?.title);
      const rep = buildReport(inp);
      const m = fromReport({ lang: L, rep, inp, toClip: (t) => t, durS, events, attemptId: flight?.attemptId ?? `rec-${rec.startedAt}`, dateMs: rec.startedAt, student: rec.student });
      return {
        ...m,
        source: "flight",
        phases: phasesOf(L, rec.samples.map((x) => ({ t: x.t - t0, phase: x.phase }))),
        lanes: { ...m.lanes, help: eventLanesHelp(L, events, durS) },
        help: eventLanesHelp(L, events, durS).map((x) => ({ t: x.t, kind: "instructor" as const, text: x.label })),
        plan: undefined,
      };
    }
    return fromFlight({
      lang: L,
      samples: rec.samples.map((s) => ({ t: s.t - t0, phase: s.phase })),
      events,
      acs: evaluateAcs(rec),
      durS,
      title: flight?.title ?? (L === "fr" ? "Vol libre" : "Free flight"),
      inProgress: flight?.inProgress,
      attemptId: flight?.attemptId ?? `rec-${rec.startedAt}`,
      dateMs: rec.startedAt,
      student: rec.student,
      mode:
        rec.mode === "checkride"
          ? L === "fr"
            ? "Contrôle"
            : "Checkride"
          : undefined,
    });
  };
  const at =
    opt.atLessonT !== undefined && ex
      ? Math.max(0, ex.toSim(opt.atLessonT) - t0)
      : undefined;
  return { build, geom, plate, t0, t1: t1 < last ? t1 : undefined, at, onBack: opt.onBack };
}

/** help and instructor actions of a free flight, from the recorder events */
function eventLanesHelp(L: Lang, events: import("../../sim/recorder").FlightEvent[], durS: number) {
  return eventLanes(L, events, durS).help;
}

/** a free flight as the report builder's input (clip time): its ACS evaluation, its trace and events, no steps */
export function flightInput(sim: Sim, acs: AcsReport, L: Lang, t0: number, durS: number, title?: string): ResultInput {
  const rec = sim.rec;
  const ap = rec.approach;
  const precision = !!ap?.gsAngle || rec.samples.some((s) => s.vertDots !== null && s.phase === "final");
  return {
    lang: L,
    // an instrument approach (stage S5: FAA-S-ACS-8C area VI), precision or not
    ex: { id: precision ? "free-ils" : "free-app", title: title ?? (L === "fr" ? "Vol libre" : "Free flight"), stage: "S5", allowAp: false, minutes: Math.round(durS / 60) },
    endedBy: rec.crashed ? "crash" : "complete",
    passed: acs.result === "PASS",
    reason: acs.items.find((i) => i.result === "FAIL")?.task ?? "",
    durationSec: durS,
    allowanceSec: 10,
    steps: [],
    idx: 0,
    spans: [],
    measured: {},
    trace: rec.samples.map((s) => ({ t: s.t - t0, alt: s.alt, ias: s.ias, hdg: s.hdg, vs: s.vs, lat: s.lat, lon: s.lon, latDots: s.latDots, vertDots: s.vertDots })),
    events: rec.events.map((e) => ({ t: e.t - t0, kind: e.kind, text: e.text, fr: e.fr })),
    acs: { result: acs.result, items: acs.items.map((i) => ({ ...i })) },
    crashed: rec.crashed,
    handFlown: rec.handFlown,
    checkride: rec.mode === "checkride",
    attempt: { n: 1, at: rec.startedAt },
    fixes: ap ? [...ap.transitions.flatMap((t) => t.legs), ...ap.final].map((l) => ({ ident: l.fix.ident, lat: l.fix.lat, lon: l.fix.lon })) : undefined,
  };
}
