// Teaching tools (« Outils ») — the catalogue. A tool is a live drawing worked out from a few numbers, with the
// student's controls on the slide (canvas/toolBlock.ts draws it): the wing and its angle of attack, the load factor
// in a turn, the C172S loading envelope, the runway, the fuel, carburettor icing, fronts, VOR / ADF, the propeller,
// Mach and sweep, the pressurised cabin. Each tool's maths is a pure module in ./maths with its sources.
import type { SlideBlock, ToolId, ToolTask } from "../types";
import type { ToolDef, ToolTaskDef, ToolValues } from "./kit";
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
  ToolTaskDef,
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
/** the block's task when it is the tool's own (its check, givens and hidden values), else null */
export function toolTask(
  def: ToolDef,
  b: Pick<ToolBlock, "task">,
): ToolTaskDef | null {
  return b.task && def.task && b.task.key === def.task.key ? def.task : null;
}
/** what a block stores for the tool's ready task (the check stays in the tool) */
export const toolTaskData = (def: ToolDef): ToolTask | undefined =>
  def.task
    ? {
        prompt: JSON.parse(
          JSON.stringify(def.task.prompt),
        ) as ToolTask["prompt"],
        key: def.task.key,
      }
    : undefined;
/** the values the block starts from: its own, then the givens of its task (they win) */
export function blockStart(
  def: ToolDef,
  b: Pick<ToolBlock, "p" | "task">,
): ToolValues {
  return toolValues(def, { ...b.p, ...(toolTask(def, b)?.givens ?? {}) });
}
/** the controls the student actually gets: a task's givens are not offered (the prompt states them) */
export function liveControls(
  def: ToolDef,
  b: Pick<ToolBlock, "controls" | "task">,
): string[] {
  const g = toolTask(def, b)?.givens ?? {};
  return toolControls(def, b).filter((k) => !(k in g));
}
/** is the block's task met with these values? (the tool's own task: checked over all the values) */
export function taskMet(
  def: ToolDef,
  b: Pick<ToolBlock, "task">,
  p: ToolValues,
): boolean {
  const t = b.task;
  if (!t) return false;
  const own = toolTask(def, b);
  if (own) return own.met({ ...p, ...(own.givens ?? {}) });
  const v = p[t.key];
  return (
    typeof v === "number" &&
    typeof t.target === "number" &&
    typeof t.tol === "number" &&
    Math.abs(v - t.target) <= t.tol + 1e-9
  );
}
/**
 * Can the student meet the block's task from its starting values, with the controls they get? « met »: it is
 * already met before they touch anything; « impossible »: no value of the task's control meets it (the other
 * values as they start); « noControl »: the student does not get the task's control.
 */
export function taskCheck(
  def: ToolDef,
  b: Pick<ToolBlock, "p" | "task" | "controls">,
): "ok" | "met" | "impossible" | "noControl" | "none" {
  const t = b.task;
  if (!t) return "none";
  const q = def.params.find((x) => x.key === t.key);
  if (!q) return "impossible";
  if (!liveControls(def, b).includes(t.key)) return "noControl";
  const start = blockStart(def, b);
  if (taskMet(def, b, start)) return "met";
  const n = Math.round((q.max - q.min) / q.step);
  for (let i = 0; i <= n; i++) {
    const v = Number((q.min + i * q.step).toFixed(6));
    if (taskMet(def, b, { ...start, [t.key]: v })) return "ok";
  }
  return "impossible";
}
