// Teaching tools (« Outils ») — the catalogue. A tool is a live drawing worked out from a few numbers, with the
// student's controls on the slide (canvas/toolBlock.ts draws it): the wing and its angle of attack, the load factor
// in a turn, the C172S loading envelope, the runway, the fuel, carburettor icing, fronts, VOR / ADF, the propeller,
// Mach and sweep, the pressurised cabin. Each tool's maths is a pure module in ./maths with its sources.
import type { SlideBlock, ToolId } from "../types";
import type { ToolDef, ToolValues } from "./kit";
import { wingTool } from "./defs/wing";
import { turnTool } from "./defs/turn";
import { massBalanceTool } from "./defs/massBalance";
import { runwayTool } from "./defs/runway";
import { fuelTool } from "./defs/fuel";
import { carbIceTool } from "./defs/carbIce";
import { frontsTool } from "./defs/fronts";
import { radioNavTool } from "./defs/radioNav";
import { propTool } from "./defs/prop";
import { machTool } from "./defs/mach";
import { cabinTool } from "./defs/cabin";

export type {
  ToolDef,
  ToolParam,
  ToolValues,
  ToolView,
  ToolReadout,
  DrawCx,
} from "./kit";

/** every tool, in the order the rail lists them (the most useful first) */
export const TOOLS: readonly ToolDef[] = [
  wingTool,
  turnTool,
  massBalanceTool,
  runwayTool,
  fuelTool,
  carbIceTool,
  frontsTool,
  radioNavTool,
  propTool,
  machTool,
  cabinTool,
];
const BY_ID = new Map<string, ToolDef>(TOOLS.map((t) => [t.id, t]));
export const toolDef = (id: ToolId | string): ToolDef | undefined =>
  BY_ID.get(id);

type ToolBlock = Extract<SlideBlock, { kind: "tool" }>;
/** a tool block's starting values: the block's own, the tool's defaults for the rest (unknown keys dropped) */
export function toolValues(
  def: ToolDef,
  p?: Record<string, number>,
): ToolValues {
  const out: ToolValues = {};
  for (const q of def.params) {
    const v = p?.[q.key];
    out[q.key] =
      typeof v === "number" && Number.isFinite(v)
        ? Math.max(q.min, Math.min(q.max, v))
        : (def.defaults[q.key] ?? q.min);
  }
  return out;
}
/** the controls the student gets on this block (known keys only, in the tool's order) */
export function toolControls(
  def: ToolDef,
  b: Pick<ToolBlock, "controls">,
): string[] {
  const want = new Set(b.controls ?? def.controls);
  return def.params.filter((q) => want.has(q.key)).map((q) => q.key);
}
/** is the block's task met with these values? */
export function taskMet(b: Pick<ToolBlock, "task">, p: ToolValues): boolean {
  const t = b.task;
  if (!t) return false;
  const v = p[t.key];
  return typeof v === "number" && Math.abs(v - t.target) <= t.tol + 1e-9;
}
