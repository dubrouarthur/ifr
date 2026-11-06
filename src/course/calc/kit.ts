// Calc engine — small building blocks shared by the generators: givens, sources, params, the stage pose.
import type {
  CalcGiven,
  CalcParamDef,
  CalcParams,
  CalcRef,
  CalcRng,
  CalcUnit,
  GeneratorDef,
  L10n,
  SceneFields,
} from "../types";
import { L } from "./text";

/** identity, typed: keeps each generator file a plain object literal */
export const defineGenerator = (g: GeneratorDef): GeneratorDef => g;

export function given(
  key: string,
  label: L10n,
  value: number | string,
  unit?: CalcUnit,
  display?: L10n,
): CalcGiven {
  const g: CalcGiven = { key, label, value };
  if (unit) g.unit = unit;
  if (display) g.display = display;
  return g;
}

/** Sources cited by the generators (CalcRef.src + ref). */
export const REF = {
  aim: (ref: string, note?: L10n): CalcRef => ({
    src: "FAA-AIM",
    ref,
    ...(note ? { note } : {}),
  }),
  ifh: (ref: string, note?: L10n): CalcRef => ({
    src: "FAA-H-8083-15 IFH",
    ref,
    ...(note ? { note } : {}),
  }),
  phak: (ref: string, note?: L10n): CalcRef => ({
    src: "FAA-H-8083-25 PHAK",
    ref,
    ...(note ? { note } : {}),
  }),
  afh: (ref: string): CalcRef => ({ src: "FAA-H-8083-3 AFH", ref }),
  cfr: (ref: string, note?: L10n): CalcRef => ({
    src: "14 CFR",
    ref,
    ...(note ? { note } : {}),
  }),
  easa: (ref: string, note?: L10n): CalcRef => ({
    src: "EASA Air Ops Part-NCO",
    ref,
    ...(note ? { note } : {}),
  }),
  pansOps: (ref: string, note?: L10n): CalcRef => ({
    src: "ICAO Doc 8168 PANS-OPS",
    ref,
    ...(note ? { note } : {}),
  }),
  isa: (): CalcRef => ({
    src: "ICAO Doc 7488",
    ref: "Manual of the ICAO Standard Atmosphere",
  }),
  poh172: (ref: string): CalcRef => ({
    src: "Cessna 172S POH",
    ref,
    note: L(
      "Sample figures for training: always use your aircraft's own POH / AFM.",
      "Valeurs d'exemple pour la formation : utilisez toujours le manuel de vol de votre avion.",
    ),
  }),
  caaSS7: (): CalcRef => ({
    src: "UK CAA SafetySense 7",
    ref: "Aeroplane Performance",
    note: L(
      "Factors used across Europe for light aeroplanes.",
      "Facteurs utilisés en Europe pour les avions légers.",
    ),
  }),
  e6b: (): CalcRef => ({
    src: "FAA-H-8083-25 PHAK",
    ref: "ch. 16 (flight computer)",
  }),
};

// ------------------------------------------------------------------ params
export const VARIANT_ANY = "any";

/** a 'variant' choice param: 'any' (default) picks one at random per problem */
export function variantParam(
  choices: { value: string; label: L10n }[],
): CalcParamDef {
  return {
    key: "variant",
    label: L("Question", "Question"),
    kind: "choice",
    default: VARIANT_ANY,
    choices: [
      { value: VARIANT_ANY, label: L("Any (mixed)", "Au hasard") },
      ...choices,
    ],
  };
}
/** a 'rules' choice param: FAA or EASA / ICAO wording and figures */
export function rulesParam(defaultValue: "faa" | "icao" = "faa"): CalcParamDef {
  return {
    key: "rules",
    label: L("Rules", "Réglementation"),
    kind: "choice",
    default: defaultValue,
    choices: [
      { value: "faa", label: L("FAA", "FAA") },
      { value: "icao", label: L("EASA / ICAO", "EASA / OACI") },
    ],
  };
}

/** the variant to use for this problem */
export function pickVariant<T extends string>(
  rng: CalcRng,
  params: CalcParams,
  all: readonly T[],
): T {
  const v = params.variant;
  if (typeof v === "string" && (all as readonly string[]).includes(v))
    return v as T;
  return rng.pick(all);
}

/** a range param's value ([min, max]), or the fallback */
export function rangeOf(
  params: CalcParams,
  key: string,
  fallback: [number, number],
): [number, number] {
  const v = params[key];
  if (
    Array.isArray(v) &&
    v.length === 2 &&
    Number.isFinite(v[0]) &&
    Number.isFinite(v[1])
  )
    return v[0] <= v[1] ? [v[0], v[1]] : [v[1], v[0]];
  return fallback;
}
export function numOf(
  params: CalcParams,
  key: string,
  fallback: number,
): number {
  const v = params[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
export function strOf(
  params: CalcParams,
  key: string,
  fallback: string,
): string {
  const v = params[key];
  return typeof v === "string" ? v : fallback;
}

/**
 * The accepted margin when the pilot's rule of thumb and the exact formula differ: the answer is the rule (what the
 * pilot writes), and the margin covers the exact value too, so either method passes.
 */
export function bracket(
  rule: number,
  exact: number,
  minTol: number,
  slack = 0,
): number {
  return Math.max(minTol, Math.abs(rule - exact) + slack);
}

// ------------------------------------------------------------------ stage poses (training world: ARD VOR-DME 114.2,
// MSV VOR-DME 112.7, PA NDB 344, PARD 420 ft with runways 09/27 and 18/36; magnetic variation 0 there)
export const TRAINING = {
  vor: { ident: "ARD", freq: 114.2 },
  vor2: { ident: "MSV", freq: 112.7 },
  ndb: { ident: "PA", freq: 344 },
  airport: {
    icao: "PARD",
    elevFt: 420,
    runways: ["09", "27", "18", "36"] as const,
  },
} as const;

export function poseOnRadial(
  radial: number,
  distNm: number,
  altFt: number,
  hdg: number,
  iasKt: number,
  extra: Partial<SceneFields> = {},
): SceneFields {
  return {
    kind: "fields",
    pos: {
      fix: TRAINING.vor.ident,
      radial: Math.round(radial * 10) / 10,
      distNm,
    },
    altFt,
    hdg: Math.round(hdg),
    iasKt: Math.round(iasKt),
    ...extra,
  };
}
