// Ground school — course library: the helpers of "Straight and level, climbing, descending and turning"
// (ppl-flight-manoeuvres.ts). Thin layers over the shared archetype kits: the objectives slide, the part openers,
// the « À vous » slide of a take-the-controls moment (which control, what to do, how it ends, the goal rows ticked
// live), four attitude indicators with their load factor and stall speed read from the flight state, a flight in
// the full simulator with its own criteria, and the final quiz. Frames follow SPEC slides v2 §8 (12-column grid,
// 8 px baseline).
import type {
  ColorToken,
  Criterion,
  L10n,
  Quiz,
  ReadoutId,
  SlideBlock,
  StageControl,
  StageCue,
  Step,
  StepGoal,
} from "../../types";
import { CHECKLIST, INST, L, MARK, T, slideStep, step } from "../kit";
import { G, foot, head, rule, sectionBlocks, slide } from "../navSlides";
import { GAUGE } from "../briefings/kit";
import { SIX } from "./kit-a1";

const text = (t: L10n) => ({ t: "text" as const, text: t });

// ------------------------------------------------------------------ the parts of the course
export const PARTS: L10n[] = [
  L("Straight and level", "Le palier"),
  L("Climbing and descending", "Montée et descente"),
  L("Turning", "Les virages"),
  L("Recap and quiz", "Bilan et quiz"),
];
/** A2 part opener: "Part n of 4", its title, one lead, the roadmap of the four parts. */
export function partStep(id: string, n: number, title: L10n, lead: L10n): Step {
  return slideStep(
    id,
    title,
    slide(
      "section",
      sectionBlocks({ n, of: PARTS.length, title, lead, items: PARTS }),
    ),
    [text(lead)],
    { section: "overview", minutes: 1 },
  );
}

// ------------------------------------------------------------------ objectives
export interface ObjectivesOpts {
  eyebrow: L10n;
  title: L10n;
  /** ≤ 4 measurable objectives (a verb, a figure) */
  objectives: L10n[];
  /** how the course proves them: a 2 × 2 grid of counts */
  proofs: { n: L10n; text: L10n; color?: ColorToken }[];
  tip: L10n;
}
export function objectivesStep(id: string, o: ObjectivesOpts): Step {
  return slideStep(
    id,
    o.title,
    slide("ready", [
      ...head(o.eyebrow, o.title),
      ...o.objectives.slice(0, 4).flatMap((t, i): SlideBlock[] => [
        MARK(i + 1, G.left + 28, 352 + i * 132, { size: 56, group: `o${i}` }),
        T("body", t, 200, 312 + i * 132, 784, 104, {
          valign: "middle",
          group: `o${i}`,
        }),
      ]),
      T(
        "eyebrow",
        L("How you will prove it", "Comment vous le prouvez"),
        1128,
        320,
        672,
        32,
        { color: "muted" },
      ),
      ...o.proofs.slice(0, 4).flatMap((s, i): SlideBlock[] => {
        const x = 1128 + (i % 2) * 360;
        const y = 376 + Math.floor(i / 2) * 224;
        return [
          T("number", s.n, x, y, 312, 104, { color: s.color ?? "key" }),
          T("small", s.text, x, y + 112, 312, 80),
        ];
      }),
      rule(G.left, 864, 1680),
      T("body", o.tip, G.left, 888, 1680, 96),
    ]),
    [{ t: "keys", items: o.objectives }],
    { section: "overview", minutes: 1 },
  );
}

// ------------------------------------------------------------------ « À vous »: a take-the-controls moment
export interface HandsOnOpts {
  title: L10n;
  /** with which control: its name on the stage and what one press or one hold does */
  control: L10n;
  /** what to do with it, in order */
  action: L10n;
  /** how it ends: the condition, about how long, and that the controls can be handed back at any time */
  ends: L10n;
  /** the goal rows (one per goal check, same order), with the tolerance in the text; ticked live */
  checks: { text: L10n; readout?: ReadoutId }[];
  /** one line under the instrument: what helps, what to watch */
  note: L10n;
  alt: L10n;
  scene: string;
  prompt: L10n;
  controls: StageControl[];
  assist?: StageCue["assist"];
  goal: StepGoal;
  hint: L10n;
  foot: L10n;
  reader: L10n;
  minutes?: number;
}
const LABELS: L10n[] = [
  L("Control", "Commande"),
  L("Action", "Geste"),
  L("It ends", "Fin"),
];
export function handsOnStep(id: string, o: HandsOnOpts): Step {
  const lines = [o.control, o.action, o.ends];
  const pitch = 112;
  const rowsEnd = 312 + lines.length * pitch;
  return slideStep(
    id,
    o.title,
    slide(
      "yourTurn",
      [
        ...head(L("Your turn", "À vous"), o.title, 816),
        ...lines.flatMap((t, i): SlideBlock[] => [
          T("eyebrow", LABELS[i], G.left, 320 + i * pitch, 192, 32, {
            color: "muted",
            group: `l${i}`,
          }),
          T("body", t, 320, 312 + i * pitch, 616, 104, { group: `l${i}` }),
        ]),
        rule(G.left, rowsEnd + 8, 816),
        CHECKLIST(
          `${id}.checks`,
          o.checks.map((c, i) => ({
            text: c.text,
            check: i,
            ...(c.readout ? { readout: c.readout } : {}),
          })),
          G.left,
          rowsEnd + 24,
          816,
          Math.min(984 - (rowsEnd + 24), 80 * o.checks.length + 56),
          { title: L("Goal and tolerance", "Objectif et tolérance") },
        ),
        INST(SIX, o.alt, 1000, 232, 800, 600, {
          id: `${id}.six`,
          scene: o.scene,
          controls: o.controls,
          yourTurn: {
            where: "slide",
            prompt: o.prompt,
            controls: o.controls,
            assist: o.assist ?? {},
            goal: o.goal,
            hint: o.hint,
          },
        }),
        T("small", o.note, 1000, 856, 800, 96),
        foot(o.foot, 816),
      ],
      { scene: o.scene },
    ),
    [text(o.reader)],
    { kind: "try", section: "technique", minutes: o.minutes ?? 3 },
  );
}

// ------------------------------------------------------------------ four attitudes, their load factor and stall speed
export interface BankLadderOpts {
  eyebrow: L10n;
  title: L10n;
  /** one column per bank angle: the scene posed at that bank (the readouts come from its flight state) */
  cols: { label: L10n; alt: L10n; scene: string; color?: ColorToken }[];
  /** the rule, in one or two lines under the row */
  rule: L10n;
  foot: L10n;
  reader: L10n;
}
export function bankLadderStep(id: string, o: BankLadderOpts): Step {
  const blocks: SlideBlock[] = [...head(o.eyebrow, o.title)];
  o.cols.slice(0, 4).forEach((c, i) => {
    const x = G.x(i * 3);
    const w = G.w(3);
    const g = { group: `c${i}`, ...(i > 0 ? { reveal: i } : {}) };
    blocks.push(
      T("eyebrow", c.label, x, 312, w, 32, {
        ...(c.color ? { color: c.color } : {}),
        ...g,
      }),
      INST(GAUGE("ai"), c.alt, x, 352, w, w, {
        id: `${id}.ai${i}`,
        scene: c.scene,
        group: g.group,
        ...(i > 0 ? { reveal: { order: i } } : {}),
      }),
      T("heading", L("{{value}}", "{{value}}"), x, 752, w, 56, {
        bind: { k: "readout", readout: "loadFactor", scene: c.scene },
        ...(c.color ? { color: c.color } : {}),
        ...g,
      }),
      T(
        "body",
        L("stalls at {{value}}", "décroche à {{value}}"),
        x,
        808,
        w,
        56,
        {
          bind: { k: "readout", readout: "stallIas", scene: c.scene },
          ...g,
        },
      ),
    );
  });
  blocks.push(
    rule(G.left, 880, 1680),
    T("body", o.rule, G.left, 896, 1680, 88, { color: "ink2" }),
    foot(o.foot, 1680),
  );
  return slideStep(id, o.title, slide("compare", blocks), [text(o.reader)], {
    kind: "explain",
    section: "picture",
    minutes: 2,
  });
}

// ------------------------------------------------------------------ a flight in the full simulator, with its criteria
export function flySceneStep(
  id: string,
  o: {
    title: L10n;
    scene: string;
    durationS: number;
    brief: L10n;
    keys: L10n[];
    criteria: Criterion[];
    debrief: L10n;
    minutes: number;
  },
): Step {
  return step(id, "fly", o.title, [], {
    section: "check",
    minutes: o.minutes,
    flyIt: {
      target: { kind: "scene", scene: o.scene, durationS: o.durationS },
      brief: o.brief,
      keys: o.keys,
      options: ["turbulence"],
      defaultsOn: [],
      criteria: o.criteria,
      debrief: o.debrief,
      returnTo: "thisStep",
    },
  });
}

// ------------------------------------------------------------------ the final quiz: several questions in one step
export function finalQuizStep(
  id: string,
  title: L10n,
  intro: L10n,
  quizzes: Quiz[],
): Step {
  return step(
    id,
    "quiz",
    title,
    [text(intro), ...quizzes.map((quiz) => ({ t: "quiz" as const, quiz }))],
    { section: "check", minutes: 5, layout: "readerOnly" },
  );
}
