// « Assistant IA » — the DECK PLAN Claude returns (structured output, output_config.format). It is compact and only
// names building blocks the app already has (catalog.ts enums), so every slide the mapper makes from it is valid and
// drawn by the real renderers. Every author string is { en, fr }: the app is bilingual.
//
// Shaped for the structured-output grammar limits: no optional field at all (an "empty" value means "none"), and
// only three union-typed parameters (the slide kinds, the calc diagram kinds, an idea's instrument or null).
import * as z from "zod";
import {
  ANIMATION_IDS,
  CALC_IDS,
  CONTROL_IDS,
  SIM_GOAL_IDS,
  SITUATION_IDS,
  SLIDE_GOAL_IDS,
  VIEW_IDS,
} from "./catalog";

export const L10nZ = z.object({
  en: z.string().describe("English"),
  fr: z.string().describe("French"),
});
export type PlanText = z.infer<typeof L10nZ>;

export const SituationZ = z
  .object({
    start: z.enum(SITUATION_IDS).describe("the ready situation to start from"),
    headingDeg: z.number(),
    altitudeFt: z.number(),
    speedKt: z.number().describe("indicated airspeed"),
    verticalSpeedFpm: z.number(),
    bankDeg: z.number().describe("right positive"),
    powerPct: z.number(),
    flaps: z.number().int().describe("0, 1, 2 or 3 (0, 10, 20, 30°)"),
  })
  .describe("the aircraft on this slide (Cessna 172S)");
export type PlanSituation = z.infer<typeof SituationZ>;

export const ViewZ = z.enum(VIEW_IDS);

export const InstrumentZ = z.object({
  view: ViewZ,
  animation: z.enum([...ANIMATION_IDS, "none"]),
  situation: SituationZ,
  alt: L10nZ.describe("what the instrument shows, for screen readers"),
});
export type PlanInstrument = z.infer<typeof InstrumentZ>;

const LineZ = z.object({
  text: L10nZ.describe("one short line, ≤ 70 characters; **bold** allowed"),
  moment: z
    .string()
    .describe(
      "a moment of the animation where a numbered dot appears, or '' for none",
    ),
});

const CoverZ = z.object({
  kind: z.literal("cover"),
  eyebrow: L10nZ,
  title: L10nZ,
  subtitle: L10nZ,
  lead: L10nZ,
  source: L10nZ,
  instrument: InstrumentZ,
});
const GoalsZ = z.object({
  kind: z.literal("goals"),
  items: z.array(L10nZ).describe("three goals, a verb and a number each"),
  source: L10nZ,
  instrument: InstrumentZ,
});
const IdeaZ = z.object({
  kind: z.literal("idea"),
  eyebrow: L10nZ,
  title: L10nZ,
  lines: z.array(LineZ).describe("one to three short lines"),
  source: L10nZ,
  instrument: InstrumentZ.nullable(),
});
const YourTurnZ = z.object({
  kind: z.literal("yourTurn"),
  title: L10nZ,
  goal: z.enum(SLIDE_GOAL_IDS),
  tolerance: z
    .number()
    .describe(
      "± tolerance of the goal in its unit (°, ft, kt, ft/min); 0 = the goal's own",
    ),
  holdSeconds: z.number().describe("how long to hold it; 0 = the goal's own"),
  controls: z.array(z.enum(CONTROL_IDS)),
  view: ViewZ,
  situation: SituationZ,
  tip: L10nZ,
  hint: L10nZ,
  success: L10nZ,
  source: L10nZ,
});
const QuizZ = z.object({
  kind: z.literal("quiz"),
  question: L10nZ,
  options: z.array(L10nZ).describe("two to four short answers"),
  answer: z.number().int().describe("index of the right option, from 0"),
  explain: L10nZ,
  source: L10nZ,
  instrument: InstrumentZ,
});
const FlightZ = z.object({
  kind: z.literal("flight"),
  title: L10nZ,
  brief: L10nZ.describe("the task in one or two sentences"),
  goal: z.enum(SIM_GOAL_IDS),
  situation: SituationZ,
  success: L10nZ,
  source: L10nZ,
});

const CalcDiagramZ = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sixtyToOne"),
    course: z.number(),
    flownNm: z.number(),
    offNm: z.number(),
    toGoNm: z.number(),
  }),
  z.object({
    kind: z.literal("windTriangle"),
    course: z.number(),
    tasKt: z.number(),
    windDir: z.number(),
    windKt: z.number(),
  }),
  z.object({
    kind: z.literal("profile"),
    fromFt: z.number(),
    toFt: z.number(),
    angleDeg: z.number(),
    gsKt: z.number(),
  }),
  z.object({
    kind: z.literal("vdp"),
    mdaFt: z.number(),
    tdzeFt: z.number(),
    vdpNm: z.number(),
  }),
  z.object({
    kind: z.literal("holdWind"),
    inbound: z.number(),
    turn: z.enum(["L", "R"]),
    windDir: z.number(),
    windKt: z.number(),
    tasKt: z.number(),
  }),
  z.object({
    kind: z.literal("compass"),
    tc: z.number(),
    wca: z.number(),
    variation: z.number(),
    deviation: z.number(),
  }),
  z.object({ kind: z.literal("turn"), tasKt: z.number(), bankDeg: z.number() }),
]);
export type PlanCalcDiagram = z.infer<typeof CalcDiagramZ>;
// the schema's calc kinds are exactly the catalogue's (a compile-time and a test-time check)
export const SCHEMA_CALC_IDS: readonly string[] = CalcDiagramZ.options.map(
  (o) => o.shape.kind.value,
);
void CALC_IDS;

const CalcZ = z.object({
  kind: z.literal("calc"),
  eyebrow: L10nZ,
  title: L10nZ,
  lead: L10nZ,
  diagram: CalcDiagramZ,
  lines: z.array(L10nZ).describe("one to three short steps of the working"),
  alt: L10nZ,
  caption: L10nZ.describe("what to drag, or '' for a static diagram"),
  source: L10nZ,
});
const RecapZ = z.object({
  kind: z.literal("recap"),
  title: L10nZ,
  items: z
    .array(
      z.object({
        figure: L10nZ.describe("a short figure: 3°/s, 1.41 g"),
        text: L10nZ,
      }),
    )
    .describe("three takeaways"),
  source: L10nZ,
});

export const SlideZ = z.discriminatedUnion("kind", [
  CoverZ,
  GoalsZ,
  IdeaZ,
  YourTurnZ,
  QuizZ,
  FlightZ,
  CalcZ,
  RecapZ,
]);
export type PlanSlide = z.infer<typeof SlideZ>;
export type PlanSlideKind = PlanSlide["kind"];
export const SLIDE_KINDS: readonly PlanSlideKind[] = SlideZ.options.map(
  (o) => o.shape.kind.value,
);

export const DeckPlanZ = z.object({
  title: L10nZ.describe("the course title"),
  subtitle: L10nZ,
  summary: L10nZ.describe("one sentence for the library card"),
  slides: z.array(SlideZ),
});
export type DeckPlan = z.infer<typeof DeckPlanZ>;

/** Validate a plan (JSON text or a value): the plan, or the first problems in plain words. */
export function parsePlan(
  x: unknown,
): { ok: true; plan: DeckPlan } | { ok: false; issues: string[] } {
  let v = x;
  if (typeof x === "string") {
    try {
      v = JSON.parse(x);
    } catch (e) {
      return { ok: false, issues: [`JSON: ${(e as Error).message}`] };
    }
  }
  const r = DeckPlanZ.safeParse(v);
  if (r.success) return { ok: true, plan: r.data };
  return {
    ok: false,
    issues: r.error.issues
      .slice(0, 6)
      .map((i) => `${i.path.join(".")}: ${i.message}`),
  };
}

/** The slide titles found so far in a partial JSON text (the progress line while the plan streams). */
export function partialTitles(json: string): string[] {
  const out: string[] = [];
  const at = json.indexOf('"slides"');
  if (at < 0) return out;
  // each slide opens with its kind; its first title-like field follows
  const re =
    /"kind"\s*:\s*"(cover|goals|idea|yourTurn|quiz|flight|calc|recap)"[\s\S]*?"(?:title|question|items)"\s*:\s*[[{]?\s*\{?\s*"en"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  re.lastIndex = at;
  let m: RegExpExecArray | null;
  while ((m = re.exec(json))) {
    try {
      out.push(JSON.parse(`"${m[2]}"`) as string);
    } catch {
      out.push(m[2]);
    }
  }
  return out;
}
