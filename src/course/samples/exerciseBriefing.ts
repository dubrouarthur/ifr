// The briefing deck of a cockpit lesson (SPEC slides v2 §11): every exercise is briefed by slides played in the
// cockpit, then "Start exercise". An authored deck (a sample course with briefingFor) wins; otherwise the deck is
// built here from the exercise itself, on the design-system frames: cover, clearance + knowledge check, the hold,
// the approach plate, key points, the steps, then "Ready to fly" (objectives and standards). Pure: no DOM.
import { G, IMG, L, MARK, SHAPE, T } from "../canvas/layouts";
import type { L10n, SlideBlock, SlideCanvas } from "../types";

/** What the deck is built from: the exercise and the runtime of the attempt being briefed (train/engine.ts). */
export interface BriefingSource {
  id: string;
  title: string;
  summary: string;
  /** "Stage 3 — Holding" */
  stageTitle?: string;
  /** the stage id ("S4"): the generated deck names the stage in both languages (lesson/briefingDeck.ts) */
  stage?: string;
  /** the exercise window's set-up items for the first step (the deck's set-up slide) */
  setup?: readonly {
    label: string;
    detail?: string;
    ok: boolean | null;
    action?: string;
  }[];
  minutes: number;
  allowAp: boolean;
  objectives: readonly string[];
  standards: readonly string[];
  briefing: readonly string[];
  /** approach id (the plate slide) */
  plate?: string;
  /** "PA" + "ILS 27": the plate slide's title */
  plateName?: string;
  clearance?: string;
  quiz?: {
    question: string;
    options: readonly string[];
    answer: number;
    explain: string;
  };
  hold?: {
    inbound: number;
    turn: "L" | "R";
    fix: string;
    legMin: number;
    altFt: number;
  };
  steps: readonly string[];
}

export interface BriefingSlide {
  id: string;
  title: L10n;
  slide: SlideCanvas;
  /** a knowledge check: Start waits until it is answered */
  gate?: boolean;
}

/** the asset id a briefing gives its plate: the host draws the plate for it (ui/learn.ts: approachPlate) */
export const plateAsset = (approachId: string): string => `plate:${approachId}`;
/** exercise text is authored in English: the same words in both languages (no machine translation) */
const E = (s: string): L10n => ({ en: s, fr: s });
const canvas = (
  blocks: SlideBlock[],
  layout: SlideCanvas["layout"],
): SlideCanvas => ({
  size: { w: 1920, h: 1080 },
  grid: 8,
  layout,
  blocks,
});
let n = 0;
const ids = (blocks: SlideBlock[], p: string): SlideBlock[] =>
  blocks.map((b) => ({ ...b, id: `${p}.${++n}` }));
const header = (eyebrow: L10n, title: L10n, w = 1680): SlideBlock[] => [
  T("eyebrow", eyebrow, G.left, G.eyebrowY, w, 32),
  T("title", title, G.left, G.titleY, w, 152),
];
const rule = (x: number, y: number, w: number): SlideBlock =>
  SHAPE("line", x, y - 8, w, 16, { stroke: "line", strokeW: 2 });
const pad3 = (d: number) =>
  String(Math.round(((d % 360) + 360) % 360) || 360).padStart(3, "0");
/** "Stage 3 — Holding" → "Holding" */
const stageName = (s?: string) => (s ? (s.split("—")[1] ?? s).trim() : "");

/** The deck. Always at least the cover and the Ready slide. */
export function exerciseBriefingDeck(src: BriefingSource): BriefingSlide[] {
  n = 0;
  const out: BriefingSlide[] = [];
  const stage = stageName(src.stageTitle);
  const eyebrowCover = stage
    ? { en: `Lesson briefing · ${stage}`, fr: `Briefing de leçon · ${stage}` }
    : L("Lesson briefing", "Briefing de leçon");

  // ---------------------------------------------------------------- A1 cover: the hold, the plate or a photo on the right
  {
    const right: SlideBlock[] = src.hold
      ? [
          {
            id: "x",
            frame: { x: 1032, y: 120, w: 768, h: 840, z: 1 },
            kind: "diagram",
            d: {
              kind: "hold",
              inbound: src.hold.inbound,
              turn: src.hold.turn,
              fix: src.hold.fix,
              quiet: true,
            },
            alt: E(
              `Holding pattern at ${src.hold.fix}, inbound ${pad3(src.hold.inbound)}`,
            ),
          },
        ]
      : src.plate
        ? [
            {
              id: "x",
              frame: { x: 1080, y: 96, w: 720, h: 888, z: 1 },
              kind: "diagram",
              d: { kind: "plate", approachId: src.plate },
              asset: plateAsset(src.plate),
              alt: E(`Approach plate ${src.plateName ?? src.plate}`),
            },
          ]
        : [
            IMG({ lib: "photo:in-cloud" }, L("A light aircraft flying in cloud", "Un avion léger dans les nuages"), 1128, 0, 792, 1080),
          ];
    const meta = [
      { en: `About ${src.minutes} min`, fr: `Environ ${src.minutes} min` },
      src.allowAp
        ? L("autopilot allowed", "pilote automatique autorisé")
        : L("hand-flown", "pilotage manuel"),
      { en: `${src.steps.length} ${src.steps.length === 1 ? "step" : "steps"}`, fr: `${src.steps.length} ${src.steps.length < 2 ? "étape" : "étapes"}` },
    ];
    out.push({
      id: "b-cover",
      title: E(src.title),
      slide: canvas(
        ids(
          [
            T("eyebrow", eyebrowCover, G.left, G.eyebrowY, 840, 32),
            T("display", E(src.title), G.left, 248, 864, 368, {
              valign: "bottom",
            }),
            T("lead", E(src.summary), G.left, 648, 840, 232),
            T(
              "foot",
              {
                en: meta.map((m) => m.en).join(" · "),
                fr: meta.map((m) => m.fr ?? m.en).join(" · "),
              },
              G.left,
              912,
              840,
              32,
            ),
            ...right,
          ],
          "b-cover",
        ),
        "cover",
      ),
    });
  }

  // ---------------------------------------------------------------- A9 clearance and the knowledge check
  if (src.clearance || src.quiz) {
    // a question that quotes the clearance ("ATC: "…" — You are proceeding…") keeps only its own words
    const question = src.quiz ? src.quiz.question.replace(/^\s*ATC:\s*["“][^"”]*["”]\s*[—–-]\s*/, "").trim() || src.quiz.question : "";
    const blocks: SlideBlock[] = [
      ...header(
        src.clearance ? L("ATC clearance", "Clairance ATC") : L("Knowledge check", "Vérification des connaissances"),
        src.clearance ? L("Read the clearance", "Lire la clairance") : E(question),
      ),
    ];
    let y = src.clearance ? 312 : 336;
    if (src.clearance) {
      blocks.push(
        SHAPE("rect", G.left, y, 6, 176, { fill: "accent", stroke: null }),
        T("quote", E(`“${src.clearance}”`), G.left + 40, y, 1560, 176, {
          valign: "middle",
        }),
      );
      y += 224;
    }
    if (src.quiz) {
      blocks.push({
        id: "q",
        frame: { x: G.left, y, w: 1680, h: 984 - y, z: 2 },
        kind: "quiz",
        quiz: {
          kind: "mcq",
          prompt: E(question),
          options: src.quiz.options.map((o) => ({ text: E(o) })),
          answer: src.quiz.answer,
          explain: E(src.quiz.explain),
        },
      });
    }
    out.push({
      id: "b-check",
      title: src.quiz
        ? L("Knowledge check", "Vérification des connaissances")
        : L("ATC clearance", "Clairance ATC"),
      slide: canvas(ids(blocks, "b-check"), "quiz"),
      gate: !!src.quiz,
    });
  }

  // ---------------------------------------------------------------- A4 the hold: the diagram and how to fly it
  if (src.hold) {
    const hd = src.hold;
    const rows: [L10n, L10n][] = [
      [
        {
          en: `Inbound ${pad3(hd.inbound)}°`,
          fr: `Rapprochement ${pad3(hd.inbound)}°`,
        },
        {
          en: `${hd.turn === "R" ? "Right" : "Left"} turns at ${hd.fix}`,
          fr: `Virages à ${hd.turn === "R" ? "droite" : "gauche"} à ${hd.fix}`,
        },
      ],
      [
        {
          en: `${hd.legMin}:00 inbound`,
          fr: `${hd.legMin}:00 en rapprochement`,
        },
        L(
          "Adjust the outbound leg, not the inbound",
          "On ajuste l’éloignement, pas le rapprochement",
        ),
      ],
      [
        {
          en: `${hd.altFt.toLocaleString("en-US")} ft`,
          fr: `${hd.altFt.toLocaleString("fr-FR")} ft`,
        },
        L("Hold it within 100 ft", "À tenir à 100 ft près"),
      ],
    ];
    const blocks: SlideBlock[] = [
      {
        id: "d",
        frame: { x: G.left, y: 96, w: 912, h: 888, z: 1 },
        kind: "diagram",
        d: { kind: "hold", inbound: hd.inbound, turn: hd.turn, fix: hd.fix },
        alt: E(
          `Holding pattern at ${hd.fix}: inbound ${pad3(hd.inbound)}, ${hd.turn === "R" ? "right" : "left"} turns, entry sectors`,
        ),
      },
      T("eyebrow", L("The hold", "L’attente"), 1128, 120, 672, 32),
      T(
        "title",
        { en: `Holding at ${hd.fix}`, fr: `Attente à ${hd.fix}` },
        1128,
        160,
        672,
        168,
      ),
      ...rows.flatMap(([a, b], i): SlideBlock[] => {
        const y = 392 + i * 176;
        return [
          rule(1128, y, 672),
          T("heading", a, 1128, y + 24, 672, 56, {
            color: i === 0 ? "nav" : "text",
          }),
          T("body", b, 1128, y + 88, 672, 80, { color: "ink2" }),
        ];
      }),
    ];
    out.push({
      id: "b-hold",
      title: { en: `Holding at ${hd.fix}`, fr: `Attente à ${hd.fix}` },
      slide: canvas(ids(blocks, "b-hold"), "heroDiagram"),
    });
  }

  // ---------------------------------------------------------------- the approach plate, full height, with the brief beside it
  if (src.plate) {
    const items: [string, string][] = [
      ["ATIS and frequencies", "ATIS et fréquences"],
      ["Final course and FAF altitude", "Axe final et altitude au FAF"],
      ["Minimums: DA or MDA", "Minima : DA ou MDA"],
      [
        "Missed approach: climb, turn, altitude, hold",
        "Remise des gaz : montée, virage, altitude, attente",
      ],
    ];
    const blocks: SlideBlock[] = [
      {
        id: "p",
        frame: { x: G.left, y: 96, w: 912, h: 888, z: 1 },
        kind: "diagram",
        d: { kind: "plate", approachId: src.plate },
              asset: plateAsset(src.plate),
        alt: E(`Approach plate ${src.plateName ?? src.plate}`),
      },
      T(
        "eyebrow",
        L("Approach briefing", "Briefing d’approche"),
        1128,
        120,
        672,
        32,
      ),
      T("title", E(src.plateName ?? src.plate), 1128, 160, 672, 168),
      ...items.flatMap(([en, fr], i): SlideBlock[] => {
        const y = 392 + i * 136;
        return [
          MARK(i + 1, 1156, y + 36, { size: 56 }),
          T("body", L(en, fr), 1208, y, 592, 96, { valign: "middle" }),
        ];
      }),
    ];
    out.push({
      id: "b-plate",
      title: L("Approach briefing", "Briefing d’approche"),
      slide: canvas(ids(blocks, "b-plate"), "instrumentNotes"),
    });
  }

  // ---------------------------------------------------------------- key points (the exercise's briefing tips)
  const tips = src.briefing.filter(Boolean);
  for (let i = 0; i < tips.length; i += 4) {
    const part = tips.slice(i, i + 4);
    const blocks: SlideBlock[] = [
      ...header(
        L("Before the flight", "Avant le vol"),
        tips.length > 4
          ? {
              en: `Key points · ${i / 4 + 1}`,
              fr: `Points clés · ${i / 4 + 1}`,
            }
          : L("Key points", "Points clés"),
      ),
      ...part.flatMap((t, k): SlideBlock[] => {
        const y = 312 + k * 168;
        return [
          rule(G.left, y, 1680),
          MARK(i + k + 1, G.left + 28, y + 76, { size: 56 }),
          T("body", E(t), 200, y + 24, 1600, 120, { valign: "middle" }),
        ];
      }),
    ];
    out.push({
      id: `b-tips${i / 4 + 1}`,
      title: L("Key points", "Points clés"),
      slide: canvas(ids(blocks, `b-tips${i}`), "stepByStep"),
    });
  }

  // ---------------------------------------------------------------- A7 the steps, five per slide
  const steps = src.steps.filter(Boolean);
  for (let i = 0; i < steps.length; i += 5) {
    const part = steps.slice(i, i + 5);
    const pages = Math.ceil(steps.length / 5);
    const blocks: SlideBlock[] = [
      ...header(
        L("The exercise", "L’exercice"),
        pages > 1
          ? {
              en: `The steps · ${i / 5 + 1} of ${pages}`,
              fr: `Les étapes · ${i / 5 + 1} sur ${pages}`,
            }
          : L("The steps", "Les étapes"),
      ),
      ...part.flatMap((t, k): SlideBlock[] => {
        const y = 320 + k * 128;
        return [
          MARK(i + k + 1, G.left + 28, y + 44, { size: 56 }),
          T("body", E(t), 200, y, 1600, 96, { valign: "middle" }),
        ];
      }),
    ];
    out.push({
      id: `b-steps${i / 5 + 1}`,
      title: L("The steps", "Les étapes"),
      slide: canvas(ids(blocks, `b-steps${i}`), "stepByStep"),
    });
  }

  // ---------------------------------------------------------------- A11 ready to fly: objectives and standards
  {
    const obj = src.objectives.filter(Boolean).slice(0, 4);
    const std = src.standards.filter(Boolean).slice(0, 4);
    const rowH = obj.length > 3 ? 136 : 152;
    const blocks: SlideBlock[] = [
      ...header(
        L("Before the flight", "Avant le vol"),
        L("Ready to fly", "Prêt à voler"),
      ),
      T(
        "eyebrow",
        L("What you will do", "Ce que vous allez faire"),
        G.left,
        320,
        960,
        32,
        { color: "muted" },
      ),
      ...obj.flatMap((t, i): SlideBlock[] => [
        MARK(i + 1, G.left + 28, 400 + i * rowH + 4, { size: 56 }),
        T("body", E(t), 200, 376 + i * rowH, 856, rowH - 24),
      ]),
      T("eyebrow", L("To pass", "Pour réussir"), 1176, 320, 624, 32, {
        color: "muted",
      }),
      ...std.flatMap((t, i): SlideBlock[] => [
        SHAPE("rect", 1176, 388 + i * rowH, 6, 40, {
          fill: "key",
          stroke: null,
        }),
        T("body", E(t), 1208, 376 + i * rowH, 592, rowH - 24),
      ]),
    ];
    if (!obj.length && !std.length)
      blocks.push(T("lead", E(src.summary), G.left, 376, 1680, 200));
    out.push({
      id: "b-ready",
      title: L("Ready to fly", "Prêt à voler"),
      slide: canvas(ids(blocks, "b-ready"), "ready"),
    });
  }
  return out;
}
