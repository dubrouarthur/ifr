// The calc diagram kinds the stage draws (a tiny module: the player decides what to show without loading the widgets).
/** Calc diagram kinds this package draws (the others: course/calcDiagrams, package L). */
export const STAGE_CALC_DIAGRAMS = [
  "windTriangle",
  "sixtyToOne",
  "profile",
  "vdp",
  "holdWind",
  "compass",
  "cgEnvelope",
] as const;
export type StageCalcDiagramKind = (typeof STAGE_CALC_DIAGRAMS)[number];
export const hasCalcDiagram = (kind: string): kind is StageCalcDiagramKind =>
  (STAGE_CALC_DIAGRAMS as readonly string[]).includes(kind);
