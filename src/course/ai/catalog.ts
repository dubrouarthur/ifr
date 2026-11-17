// « Assistant IA » — the building blocks a generated deck may use, read from the app's own code (never typed from
// memory): the named animations (canvas/motion.ts), the ready situations and the goal sentences (situations.ts),
// the steam gauges (avionics/steam.ts), the student controls (handover.ts / controlStrip.ts) and the calc diagrams
// the stage draws (stage/calcKinds.ts). The plan schema (schema.ts) turns these lists into enums, the system prompt
// (prompt.ts) describes them, the mapper (mapper.ts) builds slides from them. Pure: no DOM.
import type { MotionChannel, StageControl } from "../types";
import { MOTION_PRESETS } from "../canvas/motion";
import {
  GOAL_SENTENCES,
  READY_SITUATIONS,
  defaultSituation,
} from "../situations";
import { STEAM_GAUGE_LAYOUT, type SteamGaugeKind } from "../../avionics/steam";
import { CONTROL_ORDER } from "../handover";
import { stripWidget } from "../canvas/controlStrip";
import { STAGE_CALC_DIAGRAMS } from "../stage/calcKinds";

type Ids = [string, ...string[]];
const ids = (xs: readonly string[]): Ids => {
  if (!xs.length) throw new Error("empty catalogue");
  return [...xs] as Ids;
};

/** Named animations (canvas/motion.ts MOTION_PRESETS). */
export const ANIMATION_IDS = ids(MOTION_PRESETS.map((p) => p.id));
/** Ready situations (situations.ts READY_SITUATIONS): the numbered starting points of the situation editor. */
export const SITUATION_IDS = ids(READY_SITUATIONS.map((s) => s.id));
/** Goal sentences the student can meet on the slide's instrument. */
export const SLIDE_GOAL_IDS = ids(
  GOAL_SENTENCES.filter((g) => g.where.includes("slide")).map((g) => g.id),
);
/** Goal sentences for a flight in the full simulator. */
export const SIM_GOAL_IDS = ids(
  GOAL_SENTENCES.filter((g) => g.where.includes("sim")).map((g) => g.id),
);
/** Single steam gauges a slide can show (avionics/steam.ts). */
export const GAUGE_IDS = ids(Object.keys(STEAM_GAUGE_LAYOUT));
/** Instrument views: the six-pack or one gauge. */
export const VIEW_IDS = ids(["six", ...GAUGE_IDS]);
/** Controls drawn on the slide's control strip (the stage's order). The glass-only course knob, the source and
 *  bearing keys and the autopilot are left out: a generated slide teaches on the steam panel. */
const NOT_ON_STEAM: readonly StageControl[] = [
  "crs",
  "cdiSource",
  "brg1",
  "brg2",
  "ap",
];
export const CONTROL_IDS = ids(
  CONTROL_ORDER.filter(
    (c) => stripWidget(c) !== null && !NOT_ON_STEAM.includes(c),
  ),
);
/** Calc diagrams the stage really draws (others would show a placeholder); the CG envelope needs a loading table,
 *  the runways an aerodrome's published thresholds (never written by a plan). */
export const CALC_IDS = ids(
  STAGE_CALC_DIAGRAMS.filter((k) => k !== "cgEnvelope" && k !== "runways"),
);

/** What the student may drag on each calc diagram (the samples' own choices); [] = static. */
export const CALC_DRAG: Record<string, string[]> = {
  sixtyToOne: ["aircraft"],
  windTriangle: ["wind", "tas"],
  profile: ["tod"],
  vdp: ["mda"],
  holdWind: ["wind"],
  compass: ["wca", "variation", "deviation"],
  turn: [],
};

/** The gauge that shows a motion channel best (where a numbered dot goes on the dial). */
export const CHANNEL_GAUGE: Record<MotionChannel, SteamGaugeKind> = {
  ias: "asi",
  alt: "alt",
  vs: "vsi",
  hdg: "hsi",
  pitch: "ai",
  bank: "ai",
  turn: "tc",
  rpm: "tc",
  cdi: "hsi",
  gs: "hsi",
  vacuum: "ai",
};

/** The marks (named moments) of each animation, for the plan's dots. */
export function animationMarks(
  id: string,
): { id: string; channel?: MotionChannel }[] {
  const p = MOTION_PRESETS.find((x) => x.id === id);
  return (p?.marks ?? []).map((m) => ({
    id: m.id,
    ...(m.channel ? { channel: m.channel } : {}),
  }));
}

const pad3 = (n: number) => String(Math.round(n)).padStart(3, "0");

/** The catalogue as plain text for the system prompt (English: the model's working notes, never shown). */
export function catalogText(): string {
  const anim = MOTION_PRESETS.map((p) => {
    const view = p.view.kind === "gauge" ? p.view.gauge : p.view.kind;
    const marks = (p.marks ?? []).map((m) => m.id).join(", ");
    return `- ${p.id} (${p.level.toUpperCase()}, best on ${view}${p.needs ? `, needs ${p.needs}` : ""}${p.situation ? `, starts from situation ${p.situation}` : ""}): ${p.what.en}${marks ? ` Moments: ${marks}.` : ""}`;
  }).join("\n");
  const sits = READY_SITUATIONS.map((r) => {
    const s = r.sit;
    return `- ${r.id}: ${r.name.en}. ${r.note.en} [heading ${pad3(s.hdg)}, ${s.altFt} ft, ${s.iasKt} kt, ${s.vsFpm} ft/min, bank ${s.bank}°, power ${s.power}%, flaps ${s.flaps}]`;
  }).join("\n");
  const sit0 = defaultSituation();
  const goals = GOAL_SENTENCES.map(
    (g) =>
      `- ${g.id} (${g.where.join(" / ")}; controls ${g.controls.join(", ")}): e.g. "${g.text(sit0).en}" (numbers come from the situation)`,
  ).join("\n");
  return [
    "ANIMATIONS (instrument.animation; 'none' = a still picture):",
    anim,
    "",
    "READY SITUATIONS (situation.start; then give the numbers you want, starting from these):",
    sits,
    "",
    "GOALS (yourTurn.goal = a goal usable on the slide; flight.goal = a goal usable in the simulator):",
    goals,
    "",
    `VIEWS: six (the six-pack) or one gauge: ${GAUGE_IDS.join(", ")}.`,
    `CONTROLS on the slide: ${CONTROL_IDS.join(", ")} (the goal's own controls are always added).`,
    `CALC DIAGRAMS (calc.diagram.kind): ${CALC_IDS.join(", ")}.`,
  ].join("\n");
}
