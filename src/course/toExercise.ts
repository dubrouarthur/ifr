// Ground school — compile a Fly-it step into the lesson engine's closure-based Exercise (SPEC §9.4), modelled on
// circuitToExercise (train/circuits.ts). The result runs unchanged in LessonRun, the exercise window, the HUD, the
// ACS report and the ResultModal.
//
//   stepToExercise(step, course, opts)   a 'scene' (or 'calc') target with criteria → CourseExercise
//   yourTurnToExercise(step, yt, course) a designed slide's YourTurn { where: 'sim' } → the same, from its goal
//   flyItPlan(step, course, opts)        what the cockpit runs for any Fly-it target: an exercise (scene, calc,
//                                        circuit via circuitToExercise) or a hand-off (lesson, procedure, scenario)
//
// Compile rules
//   - setup = applyScene (course/scene.ts, injected by the integrator; a fallback here poses 'fields' and 'exact'
//     scenes so the exercise also runs before scene.ts is wired), then the instructor options, then sim.seed() last.
//   - one closure Step per MILESTONE criterion (pass a fix, fly the entry, two laps…), in order; then an ending step
//     (endWhen / durationS; default 3 min when nothing else ends the flight).
//   - PATH criteria (CDI ¾ scale, altitude ±100, IAS ±10, track, VS band…) are graded during every step: each
//     step's check() returns the ACS-worded first violation, so LessonRun counts violation seconds as usual.
//   - each criterion is also tracked on its own every frame (tick): met / worst value / time, for the course debrief
//     and AttemptRecord.fly.criteria. A path criterion is missed after more than PATH_ALLOWANCE_S seconds outside
//     its tolerance; a milestone is missed when the flight ends before it happens.
//   - ACS codes are copied into `standards`.
//   - Surprise me draws one failure from surprisePool with the scene seed (the instructor can tell which one).
import type {
  CalcProblem,
  Course,
  Criterion,
  FlyIt,
  FlyOption,
  GoalCheck,
  Lang,
  L10n,
  SceneFields,
  SimScene,
  Step as CourseStep,
  YourTurn,
} from "./types";
import type {
  Ctx,
  Exercise,
  ExerciseRuntime,
  Step as EngineStep,
} from "../train/engine";
import { setAttitude, startAt } from "../train/engine";
import { circuitToExercise } from "../train/circuits";
import type { Sim, Failures } from "../sim/sim";
import { fullEquipment } from "../sim/sim";
import { SimRng, hashSeed } from "../sim/rng";
import type { FailureKey } from "../sim/systemsTypes";
import { FAILURE_LABELS_EN, FAILURE_LABELS_FR } from "../sim/systemsTypes";
import { destination, type LatLon } from "../nav/geo";
import { findFix, NAVAIDS, runway } from "../nav/data";
import type { HoldDef } from "../nav/holding";
import {
  evaluate,
  flyCriteria,
  yourTurnFlyIt,
  goalKind,
  goalLabel,
  goalReadout,
  goalStandard,
  goalViolation,
  stageView,
  type CheckMem,
  type StageView,
} from "./goals";

/** seconds outside tolerance (cumulative) before a path criterion is missed; momentary excursions are not */
export const PATH_ALLOWANCE_S = 5;
/** default length of a Fly it that nothing else ends */
export const DEFAULT_DURATION_S = 180;

const tr = (l: L10n | undefined, lang: Lang) =>
  l ? (lang === "fr" ? (l.fr ?? l.en) : l.en) : "";

export interface StepToExerciseOptions {
  lang?: Lang;
  /** instructor options turned on for this attempt (default: flyIt.defaultsOn) */
  options?: FlyOption[];
  /** course/scene.ts applyScene (package B). Default: fallbackApplyScene. */
  applyScene?: (sim: Sim, scene: SimScene) => unknown;
  /** a 'calc' target: the problem the student solved (the calc registry regenerates it from Handoff.calc) */
  calcProblem?: CalcProblem;
}

export interface CriterionOutcome {
  id: string;
  label: string;
  acs?: string;
  met: boolean;
  /** worst value seen (path), or what happened (milestone) */
  worst?: string;
  /** sim seconds (since the start) of the worst value / of the milestone */
  atS?: number;
  /** seconds outside the tolerance (path criteria) */
  violationS: number;
  kind: "path" | "milestone";
}
export interface SurpriseDraw {
  key: FailureKey;
  /** seconds after the start */
  atS: number;
  fired: boolean;
  label: string;
}
export interface CourseExercise extends Exercise {
  course: { id: string; rev: number; stepId: string };
  /** criteria outcomes of the current attempt (reset by every setup) */
  criteria(): CriterionOutcome[];
  /** the hidden failure drawn by Surprise me (null when the option is off) */
  surprise(): SurpriseDraw | null;
  /** options in force for the attempt */
  options: FlyOption[];
}

export { flyCriteria, yourTurnFlyIt };

// ------------------------------------------------------------------ fallback scene apply (scene.ts owns the real one)
function fieldsPos(f: SceneFields): LatLon {
  const p = f.pos;
  if ("fix" in p) {
    const fx = findFix(p.fix);
    if (!fx) throw new Error(`Unknown fix ${p.fix}`);
    return destination(fx, p.radial, p.distNm);
  }
  if ("runway" in p) {
    const r = runway(p.runway.icao, p.runway.id);
    return destination(
      r.threshold,
      r.heading + 180 + (p.offsetDeg ?? 0),
      p.distNm,
    );
  }
  return { lat: p.lat, lon: p.lon };
}
const navFreq = (x: number | string | undefined): number | undefined => {
  if (x === undefined) return undefined;
  if (typeof x === "number") return x;
  return NAVAIDS.find((n) => n.ident === x.toUpperCase())?.freq;
};

/**
 * Minimal scene apply, in the SPEC §9.3 order (startAt, equipment, approach, pose, AP bugs, weather and failures,
 * seed LAST, updateAvionics). course/scene.ts applyScene() replaces it (derived display data, verify line, AP modes).
 */
export function fallbackApplyScene(sim: Sim, scene: SimScene): void {
  const pose = scene.pose;
  if (pose.kind === "exact") {
    startAt(sim, {
      pos: { lat: pose.ac.lat, lon: pose.ac.lon },
      altFt: pose.ac.altFt,
      hdg: (pose.ac.psi * 180) / Math.PI,
      iasKt: 100,
      weather: scene.weather,
    });
  } else {
    startAt(sim, {
      pos: fieldsPos(pose),
      altFt: pose.altFt,
      hdg: pose.hdg,
      iasKt: pose.iasKt,
      weather: scene.weather,
    });
    setAttitude(sim, pose.pitch ?? 1, pose.bank ?? 0, pose.iasKt);
  }
  sim.equip = { ...fullEquipment(), ...(scene.equipment ?? {}) };
  if (scene.plan?.approach) {
    try {
      sim.loadApproach(
        scene.plan.approach.id,
        scene.plan.approach.transition,
        scene.plan.approach.mode,
      );
      if (scene.plan.activeLeg !== undefined)
        sim.fp.activateLeg(scene.plan.activeLeg);
    } catch {
      /* unknown approach in this region: fly the pose without it */
    }
  }
  if (pose.kind === "exact") {
    Object.assign(sim.ac.s, structuredClone(pose.ac));
    Object.assign(sim.av, structuredClone(pose.av));
  } else if (pose.radios) {
    const r = pose.radios;
    const f1 = navFreq(r.nav1);
    const f2 = navFreq(r.nav2);
    if (f1 !== undefined) sim.av.nav1.active = f1;
    if (f2 !== undefined) sim.av.nav2.active = f2;
    if (r.adf !== undefined) sim.av.adf.active = r.adf;
    if (r.obs1 !== undefined) sim.av.obs1 = r.obs1;
    if (r.obs2 !== undefined) sim.av.obs2 = r.obs2;
    if (r.cdi) sim.av.cdi = r.cdi;
    if (r.brg1) sim.av.bearing1 = r.brg1;
    if (r.brg2) sim.av.bearing2 = r.brg2;
    if (r.baro !== undefined) sim.av.baro = r.baro;
    if (r.minimums !== undefined) sim.av.minimums = r.minimums;
  }
  if (scene.ap) {
    if (scene.ap.hdg !== undefined) sim.ap.hdgBug = scene.ap.hdg;
    if (scene.ap.alt !== undefined) sim.ap.altSel = scene.ap.alt;
  }
  if (scene.controls) Object.assign(sim.controls, scene.controls);
  if (scene.weather) Object.assign(sim.weather, scene.weather);
  if (scene.failures)
    for (const [k, v] of Object.entries(scene.failures))
      sim.setFailure(k as keyof Failures, !!v);
  sim.seed(scene.seed);
  sim.updateAvionics(0);
}

// ------------------------------------------------------------------ options
/** Surprise me: one failure from the pool, drawn with the scene seed (same seed = same failure, same time). */
export function drawSurprise(
  pool: readonly FailureKey[],
  seed: number,
  durationS: number,
): { key: FailureKey; atS: number } | null {
  if (!pool.length) return null;
  const rng = new SimRng(hashSeed(`surprise:${seed}`));
  const key = pool[Math.floor(rng.next() * pool.length) % pool.length];
  // somewhere in the first two thirds of the flight, never in the first 30 s (let the student settle)
  const lo = Math.min(30, durationS * 0.2);
  const hi = Math.max(lo + 10, durationS * 0.66);
  return { key, atS: Math.round(lo + rng.next() * (hi - lo)) };
}
/** The wind an instructor adds with the 'wind' option on a calm scene (seeded, 10–20 kt). */
export function optionWind(seed: number): { windDir: number; windKt: number } {
  const rng = new SimRng(hashSeed(`wind:${seed}`));
  return {
    windDir: Math.floor(rng.next() * 36) * 10 || 360,
    windKt: 10 + Math.floor(rng.next() * 11),
  };
}

function applyOptions(
  sim: Sim,
  scene: SimScene,
  fly: FlyIt,
  on: Set<FlyOption>,
  cockpit: Course["cockpit"],
) {
  const offered = new Set(fly.options);
  if (offered.has("wind")) {
    if (on.has("wind")) {
      if (!(scene.weather.windKt ?? 0))
        Object.assign(sim.weather, optionWind(scene.seed));
    } else Object.assign(sim.weather, { windKt: 0, gustKt: 0 });
  }
  if (offered.has("turbulence"))
    sim.weather.turbulence = on.has("turbulence")
      ? Math.max(0.35, scene.weather.turbulence ?? 0)
      : Math.min(0.05, scene.weather.turbulence ?? 0.05);
  // partial panel: steam = vacuum (AI and DG topple), glass = AHRS failure (SPEC §4.5)
  if (on.has("partialPanel"))
    sim.setFailure(cockpit === "steam" ? "vacuum" : "ahrs", true);
}

// ------------------------------------------------------------------ compile
interface Tracked {
  c: Criterion;
  kind: "path" | "milestone";
  mem: CheckMem;
  met: boolean;
  violationS: number;
  worst?: string;
  worstScore: number;
  atS?: number;
}

/** the scene a Fly it flies: course.scenes[target.scene], or built from a calc problem's stage hint */
export function flyScene(
  fly: FlyIt,
  course: Course,
  calc?: CalcProblem,
): SimScene | null {
  const t = fly.target;
  if (t.kind === "scene") return course.scenes[t.scene] ?? null;
  if (t.kind === "calc") {
    const hint = calc?.stage;
    if (!hint) return null;
    return {
      v: 1,
      id: `calc:${calc.generatorId}:${calc.seed}`,
      world: course.world,
      cockpit: course.cockpit,
      pose: hint.pose,
      weather: hint.weather ?? {},
      seed: calc.seed,
      captured: { at: new Date(0).toISOString(), from: "calc" },
    };
  }
  return null;
}

/** hold to evaluate: from the step's hold diagram (stage pane or reader block) or a hold leg in the plan */
function holdForStep(step: CourseStep, scene: SimScene): HoldDef | undefined {
  const panes = step.stage?.panes ?? [];
  const diag =
    panes
      .map((p) => (p.kind === "diagram" ? p.d : null))
      .find((d) => d?.kind === "hold") ??
    step.reader
      .map((b) => (b.t === "diagram" ? b.d : null))
      .find((d) => d?.kind === "hold");
  if (!diag || diag.kind !== "hold") return undefined;
  const f = findFix(diag.fix);
  if (!f) return undefined;
  const alt =
    scene.pose.kind === "fields" ? scene.pose.altFt : scene.pose.ac.altFt;
  return {
    fix: { ident: f.ident, lat: f.lat, lon: f.lon },
    inbound: diag.inbound,
    turn: diag.turn,
    legMin: 1,
    altFt: Math.round(alt / 100) * 100,
  };
}

function compile(
  step: CourseStep,
  course: Course,
  fly: FlyIt,
  opts: StepToExerciseOptions,
): CourseExercise {
  const lang = opts.lang ?? "en";
  const f = lang === "fr";
  const scene = flyScene(fly, course, opts.calcProblem);
  if (!scene)
    throw new Error(`Step ${step.id}: no scene to fly (${fly.target.kind})`);
  const criteria = flyCriteria(fly, opts.calcProblem);
  const options = opts.options ?? fly.defaultsOn ?? [];
  const on = new Set<FlyOption>(
    options.filter((o) => fly.options.includes(o)),
  );
  const target = fly.target;
  const durationS =
    target.kind === "scene" || target.kind === "calc"
      ? target.durationS
      : undefined;
  const endWhen: GoalCheck[] =
    target.kind === "scene" ? (target.endWhen ?? []) : [];
  const apply = opts.applyScene ?? fallbackApplyScene;

  let tracked: Tracked[] = [];
  let surprise: SurpriseDraw | null = null;
  const cockpit = course.cockpit;
  // one view per sim frame (tick, check and readout all read it)
  let cached: { sim: Sim; t: number; v: StageView } | null = null;
  const view = (c: Ctx): StageView => {
    if (cached && cached.sim === c.sim && cached.t === c.sim.time) return cached.v;
    const v = stageView(c.sim, { cockpit, holdEval: c.run.holdEval });
    cached = { sim: c.sim, t: c.sim.time, v };
    return v;
  };

  const milestones = criteria.filter((c) => goalKind(c.check) !== "path");
  const paths = () => tracked.filter((t) => t.kind === "path");
  const pathCheck = (c: Ctx): string | null => {
    const v = view(c);
    for (const t of paths()) {
      const msg = goalViolation(t.c.check, v, lang, t.mem);
      if (msg) return t.c.acs ? `${msg} · ${t.c.acs}` : msg;
    }
    return c.d.stallWarn
      ? f
        ? "Alarme de décrochage"
        : "Stall warning"
      : null;
  };
  const pathReadout = (c: Ctx): string => {
    const v = view(c);
    return paths()
      .map((t) => goalReadout(t.c.check, v, lang))
      .filter(Boolean)
      .join(" · ");
  };
  const byId = (id: string) => tracked.find((t) => t.c.id === id)!;
  const brief = tr(fly.brief, lang);
  const title = tr(step.title, lang);
  const endTime =
    durationS ??
    (milestones.length || endWhen.length ? undefined : DEFAULT_DURATION_S);

  const ex: CourseExercise = {
    id: `course:${course.id}:${step.id}`,
    stage: "course",
    title,
    summary: brief || title,
    objectives: criteria.map((c) => tr(c.label, lang)),
    standards: criteria.map(
      (c) => `${goalStandard(c.check, lang)}${c.acs ? ` (${c.acs})` : ""}`,
    ),
    briefing: [
      ...(brief ? [brief] : []),
      // a calc target: what the stage asks of the trainer (e.g. the VS scaled to its own ground speed)
      ...(target.kind === "calc"
        ? (opts.calcProblem?.stage?.doThis ?? []).map((d) => tr(d, lang))
        : []),
      ...(fly.keys ?? []).map((k) => tr(k, lang)),
      ...(on.has("partialPanel")
        ? [
            f
              ? "Panneau partiel : instruments gyroscopiques en panne."
              : "Partial panel: the gyro instruments have failed.",
          ]
        : []),
      ...(on.has("surpriseMe")
        ? [
            f
              ? "Une panne surprise peut survenir."
              : "A surprise failure may happen.",
          ]
        : []),
      ...(on.has("goMissed")
        ? [
            f
              ? "Remettez les gaz au MAP / à la DA."
              : "Go missed at the MAP / DA.",
          ]
        : []),
      ...(endTime
        ? [
            f
              ? `Durée : ${Math.round(endTime / 60) || 1} min.`
              : `Duration: ${Math.round(endTime / 60) || 1} min.`,
          ]
        : []),
    ],
    plate: scene.plan?.approach?.id,
    allowAp: on.has("allowAp"),
    minutes: Math.max(1, Math.round((endTime ?? step.minutes ?? 5) / 60)),
    course: { id: course.id, rev: course.rev, stepId: step.id },
    options: [...on],
    criteria: () =>
      tracked.map((t) => ({
        id: t.c.id,
        label: tr(t.c.label, lang),
        acs: t.c.acs,
        met: t.met,
        worst: t.worst,
        atS: t.atS,
        violationS: Math.round(t.violationS * 10) / 10,
        kind: t.kind,
      })),
    surprise: () => surprise,
    setup: (sim: Sim): ExerciseRuntime => {
      cached = null;
      apply(sim, scene);
      applyOptions(sim, scene, fly, on, cockpit);
      tracked = criteria.map((c) => {
        const kind = goalKind(c.check) === "path" ? "path" : "milestone";
        // a path criterion is met until it is broken for too long; a milestone until it happens
        return {
          c,
          kind,
          mem: {},
          met: kind === "path",
          violationS: 0,
          worstScore: 0,
        };
      });
      const d = drawSurprise(
        on.has("surpriseMe") ? (fly.surprisePool ?? []) : [],
        scene.seed,
        endTime ?? DEFAULT_DURATION_S,
      );
      surprise = d
        ? {
            ...d,
            fired: false,
            label: (f ? FAILURE_LABELS_FR : FAILURE_LABELS_EN)[d.key],
          }
        : null;

      // the end of the flight (durationS / endWhen), decided in tick: it ends the run even when milestones are
      // still pending (they are then missed), and completes the ending step when it is the current one
      let ended = false;
      let endIdx = -1;
      const endMem: CheckMem[] = endWhen.map(() => ({}));
      const steps: EngineStep[] = milestones.map((c) => ({
        text: tr(c.label, lang) || goalLabel(c.check, lang),
        done: () => byId(c.id).met,
        check: pathCheck,
        readout: (cx) =>
          [goalReadout(c.check, view(cx), lang), pathReadout(cx)]
            .filter(Boolean)
            .join(" · "),
        graceSec: 5,
      }));
      if (endTime !== undefined || endWhen.length || !steps.length) {
        endIdx = steps.length;
        steps.push({
          // the step row of the exercise window and the result: the brief when it is one short line, else the
          // generic words (a paragraph does not fit a step row)
          text:
            (brief && brief.length <= 90 && !/[.:;]\s/.test(brief) ? brief : "") ||
            (f
              ? "Pilotez jusqu’à la fin de l’exercice"
              : "Fly until the end of the exercise"),
          done: () => ended,
          check: pathCheck,
          readout: (cx) => {
            const left =
              endTime !== undefined
                ? Math.max(0, Math.round(endTime - cx.run.totalT))
                : null;
            const r = pathReadout(cx);
            return [
              left !== null
                ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`
                : "",
              r,
            ]
              .filter(Boolean)
              .join(" · ");
          },
          graceSec: 5,
        });
      }
      const needsHold = criteria.some(
        (c) => c.check.id === "holdEntry" || c.check.id === "holdLaps",
      );
      return {
        steps,
        hold: needsHold ? holdForStep(step, scene) : undefined,
        acs:
          !!scene.plan?.approach &&
          criteria.some((c) => !!c.acs && /^IR\.VI/.test(c.acs)),
        allowanceSec: PATH_ALLOWANCE_S * Math.max(1, paths().length) + 5,
        tick: (cx: Ctx) => {
          const v = view(cx);
          const t = cx.run.totalT;
          if (!ended && endIdx >= 0) {
            ended = (endTime !== undefined && t >= endTime) || (endWhen.length > 0 && endWhen.every((g, i) => evaluate(g, v, endMem[i])));
            if (ended && cx.run.idx < endIdx) cx.run.finish();
          }
          for (const k of tracked) {
            const ok = evaluate(k.c.check, v, k.mem);
            if (k.kind === "milestone") {
              if (ok && !k.met) {
                k.met = true;
                k.atS = Math.round(t);
                k.worst = goalReadout(k.c.check, v, lang);
              }
              continue;
            }
            if (t < 5 || cx.run.checksSuspended) continue; // the same grace as the steps
            if (!ok) {
              k.violationS += cx.dt;
              // the worst moment: the longest single excursion is hard to rank across kinds; keep the one seen
              // after the most time outside (ties: the latest)
              if (k.violationS >= k.worstScore) {
                k.worstScore = k.violationS;
                k.worst = goalViolation(k.c.check, v, lang, k.mem) ?? undefined;
                k.atS = Math.round(t);
              }
              if (k.violationS > PATH_ALLOWANCE_S) k.met = false;
            }
          }
          if (surprise && !surprise.fired && t >= surprise.atS) {
            surprise.fired = true;
            cx.sim.setFailure(surprise.key, true);
          }
        },
      };
    },
  };
  return ex;
}

/** A Fly-it step with a 'scene' or 'calc' target → an Exercise for LessonRun. Throws for other targets. */
export function stepToExercise(
  step: CourseStep,
  course: Course,
  opts: StepToExerciseOptions = {},
): CourseExercise {
  const fly = step.flyIt;
  if (!fly) throw new Error(`Step ${step.id} has no Fly it`);
  if (fly.target.kind !== "scene" && fly.target.kind !== "calc")
    throw new Error(
      `Step ${step.id}: a '${fly.target.kind}' target is not compiled (use flyItPlan)`,
    );
  return compile(step, course, fly, opts);
}

export function yourTurnToExercise(
  step: CourseStep,
  yt: YourTurn,
  sceneId: string,
  course: Course,
  opts: StepToExerciseOptions = {},
): CourseExercise {
  return compile(step, course, yourTurnFlyIt(yt, sceneId), opts);
}

export type FlyPlan =
  | { kind: "exercise"; exercise: Exercise | CourseExercise }
  | { kind: "lesson"; exerciseId: string; pathId?: string }
  | { kind: "procedure"; procId: string }
  | { kind: "scenario"; scenarioId: string; wx?: string };

/** What the cockpit runs for a Fly-it step, whatever its target (SPEC §9.4). */
export function flyItPlan(
  step: CourseStep,
  course: Course,
  opts: StepToExerciseOptions & { seed?: number } = {},
): FlyPlan {
  const fly = step.flyIt;
  if (!fly) throw new Error(`Step ${step.id} has no Fly it`);
  const t = fly.target;
  switch (t.kind) {
    case "scene":
    case "calc":
      return { kind: "exercise", exercise: stepToExercise(step, course, opts) };
    case "circuit":
      return {
        kind: "exercise",
        exercise: circuitToExercise(t.circuit, { seed: opts.seed }),
      };
    case "lesson":
      return { kind: "lesson", exerciseId: t.exerciseId, pathId: t.pathId };
    case "procedure":
      return { kind: "procedure", procId: t.procId };
    case "scenario":
      return { kind: "scenario", scenarioId: t.scenarioId, wx: t.wx };
  }
}
