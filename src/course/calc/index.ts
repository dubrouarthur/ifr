// Calc engine — the registry: every generator by id and by category, problem generation from (id, seed, params),
// checking (with the CFI's tolerance / unit overrides) and the drill plan and score.
//
// A step stores generatorId + params + seed, never the problem: generate() rebuilds it, byte for byte, anywhere.
import type {
  CalcCategory,
  CalcGeneratorId,
  CalcParamDef,
  CalcParams,
  CalcProblem,
  CalcResponse,
  CalcSpec,
  CalcUnit,
  CalcVerdict,
  DrillSpec,
  GeneratorDef,
} from "../types";
import { VERTICAL_GENERATORS } from "./ifr/vertical";
import { ALTIMETRY_GENERATORS } from "./ifr/altimetry";
import { NAV_GENERATORS } from "./ifr/nav";
import { TURN_HOLD_GENERATORS } from "./ifr/turnsHolds";
import { PERF_GENERATORS } from "./ifr/perf";
import { NAVLOG_GENERATORS } from "./vfr/navlog";
import { PERFORMANCE_GENERATORS } from "./vfr/performance";
import { CONVERSION_GENERATORS } from "./vfr/conversion";
import { SHARED_VFR_GENERATORS } from "./vfr/shared";
import { calcRng, newSeed, seededRng } from "./rng";
import { convert, convertDelta, sameDimension } from "./units";

export { newSeed, calcRng, seededRng } from "./rng";

const ALL: GeneratorDef[] = [
  ...NAV_GENERATORS,
  ...VERTICAL_GENERATORS,
  ...TURN_HOLD_GENERATORS,
  ...PERF_GENERATORS,
  ...ALTIMETRY_GENERATORS,
  ...NAVLOG_GENERATORS,
  ...PERFORMANCE_GENERATORS,
  ...CONVERSION_GENERATORS,
  ...SHARED_VFR_GENERATORS,
];

/** Every generator by id (duplicates are a build error: caught by the tests). */
export const GENERATORS = Object.fromEntries(ALL.map((g) => [g.id, g])) as Record<CalcGeneratorId, GeneratorDef>;

export const GENERATOR_IDS = ALL.map((g) => g.id) as CalcGeneratorId[];

/** Generators by category; `alsoIn` generators appear in both lists (pressure altitude, wind components, conversions…). */
export function generatorsIn(category: CalcCategory): GeneratorDef[] {
  return ALL.filter((g) => g.category === category || g.alsoIn?.includes(category));
}
export const GENERATORS_BY_CATEGORY: Record<CalcCategory, GeneratorDef[]> = {
  ifr: generatorsIn("ifr"),
  vfr: generatorsIn("vfr"),
};

export function getGenerator(id: string): GeneratorDef | undefined {
  return (GENERATORS as Record<string, GeneratorDef | undefined>)[id];
}

// ------------------------------------------------------------------ params
function defaultOf(p: CalcParamDef): CalcParams[string] {
  return p.default;
}
/** The generator's defaults, overridden by what the CFI set (unknown keys are dropped; out-of-range numbers are clamped). */
export function resolveParams(def: GeneratorDef, params: CalcParams = {}): CalcParams {
  const out: CalcParams = {};
  for (const p of def.params ?? []) {
    let v = params[p.key] ?? defaultOf(p);
    if (p.kind === "number" && typeof v === "number") {
      if (p.min !== undefined) v = Math.max(p.min, v);
      if (p.max !== undefined) v = Math.min(p.max, v);
    }
    if (p.kind === "choice" && p.choices && !p.choices.some((c) => c.value === v)) v = defaultOf(p);
    out[p.key] = v;
  }
  return out;
}

// ------------------------------------------------------------------ problems
/** The problem for (generator, seed, params): the same inputs always give the same numbers. */
export function generate(id: CalcGeneratorId, seed: number, params: CalcParams = {}): CalcProblem {
  const def = getGenerator(id);
  if (!def) throw new Error(`calc: unknown generator '${id}'`);
  const merged = resolveParams(def, params);
  const body = def.generate(calcRng(id, seed), merged);
  return { ...body, generatorId: id, seed: seed >>> 0, params: merged };
}

/** The problem of a calc step: a fixed seed (everyone gets the same numbers) or the attempt's seed (a retry draws a new one). */
export function problemFor(spec: CalcSpec, attemptSeed?: number): CalcProblem {
  return generate(spec.generatorId, spec.seed ?? attemptSeed ?? newSeed(), spec.params);
}

/** Check a response; the step's overrides apply: a tolerance in the asked unit, an answer unit typed without a unit menu. */
export function checkAnswer(problem: CalcProblem, response: CalcResponse, spec?: Pick<CalcSpec, "tolerance" | "unit">): CalcVerdict {
  const def = getGenerator(problem.generatorId);
  if (!def) throw new Error(`calc: unknown generator '${problem.generatorId}'`);
  let p = problem;
  let r = response;
  const asked: CalcUnit | undefined = spec?.unit;
  if (asked && asked !== problem.unit && sameDimension(asked, problem.unit)) {
    if (!r.unit) r = { ...r, unit: asked };
  }
  if (spec?.tolerance !== undefined && Number.isFinite(spec.tolerance)) {
    const tol = asked && asked !== problem.unit && sameDimension(asked, problem.unit) ? convertDelta(spec.tolerance, asked, problem.unit) : spec.tolerance;
    p = { ...problem, tolerance: tol };
  }
  return def.check(p, r);
}

/** The answer and tolerance expressed in the unit the step asks (the editor preview and the answer box hint). */
export function answerIn(problem: CalcProblem, unit: CalcUnit | undefined): { answer: number; tolerance: number; unit: CalcUnit } {
  if (!unit || unit === problem.unit || !sameDimension(unit, problem.unit)) return { answer: problem.answer, tolerance: problem.tolerance, unit: problem.unit };
  return { answer: convert(problem.answer, problem.unit, unit), tolerance: convertDelta(problem.tolerance, problem.unit, unit), unit };
}

// ------------------------------------------------------------------ drills
export interface DrillItem {
  index: number;
  generatorId: CalcGeneratorId;
  seed: number;
  params: CalcParams;
}
/**
 * The N problems of a drill. With spec.seed the sequence is fixed (a class drill, same numbers for everyone);
 * without, `runSeed` (default a fresh one) makes a new sequence on each run. Never the same problem twice in a row.
 */
export function planDrill(spec: DrillSpec, runSeed?: number): DrillItem[] {
  const ids = spec.generatorIds.filter((id) => getGenerator(id));
  if (!ids.length) return [];
  const rng = seededRng(`drill:${spec.seed ?? runSeed ?? newSeed()}`);
  const items: DrillItem[] = [];
  let last = "";
  for (let i = 0; i < Math.max(0, Math.floor(spec.count)); i++) {
    const id = ids.length > 1 ? rng.pick(ids) : ids[0];
    let seed = rng.int(1, 999999);
    let p = generate(id, seed, spec.params?.[id]);
    for (let k = 0; k < 4 && `${id}:${p.prompt.en}` === last; k++) {
      seed = rng.int(1, 999999);
      p = generate(id, seed, spec.params?.[id]);
    }
    last = `${id}:${p.prompt.en}`;
    items.push({ index: i, generatorId: id, seed, params: p.params });
  }
  return items;
}

export interface DrillAnswer {
  generatorId: CalcGeneratorId;
  ok: boolean;
  /** seconds spent on the problem */
  secs: number;
  /** the problem timed out (perProblem) or was skipped */
  skipped?: boolean;
}
export interface DrillScore {
  correct: number;
  total: number;
  /** 0..100 */
  pct: number;
  totalSecs: number;
  medianSecs: number;
  byGenerator: Partial<Record<CalcGeneratorId, { correct: number; total: number }>>;
}
/** The score of a drill: for the student only. Drills are practice and never enter an ACS grade. */
export function scoreDrill(answers: DrillAnswer[]): DrillScore {
  const total = answers.length;
  const correct = answers.filter((a) => a.ok && !a.skipped).length;
  const secs = answers.map((a) => a.secs).sort((a, b) => a - b);
  const m = secs.length ? (secs.length % 2 ? secs[(secs.length - 1) / 2] : (secs[secs.length / 2 - 1] + secs[secs.length / 2]) / 2) : 0;
  const byGenerator: DrillScore["byGenerator"] = {};
  for (const a of answers) {
    const e = (byGenerator[a.generatorId] ??= { correct: 0, total: 0 });
    e.total++;
    if (a.ok && !a.skipped) e.correct++;
  }
  return { correct, total, pct: total ? Math.round((correct / total) * 100) : 0, totalSecs: secs.reduce((a, b) => a + b, 0), medianSecs: m, byGenerator };
}
