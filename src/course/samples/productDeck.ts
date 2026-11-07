// The first-run intro's deck (ui/intro.ts): five slides about the product, drawn by our slide renderer on the
// design-system frames, FR and EN. It shows what a school gets — a cover, a live instrument with callouts, a
// formula worked line by line, a question on the slide — then the simulator that flies the lesson. No claims
// beyond what the app does.
import { BRAND } from "../../brand";
import { G, INST, L, MARK, SHAPE, T, layoutCanvas } from "../canvas/layouts";
import type { L10n, SlideBlock, SlideCanvas } from "../types";

export interface ProductSlide {
  id: string;
  title: L10n;
  slide: SlideCanvas;
}

const canvas = (
  blocks: SlideBlock[],
  layout: SlideCanvas["layout"],
): SlideCanvas => ({ size: { w: 1920, h: 1080 }, grid: 8, layout, blocks });
const rule = (x: number, y: number, w: number): SlideBlock =>
  SHAPE("line", x, y - 8, w, 16, { stroke: "line", strokeW: 2 });
/** an archetype with its own eyebrow and title replaced (the template's header: eyebrow at 96, title at 136) */
function retitle(c: SlideCanvas, eyebrow: L10n, title?: L10n): SlideCanvas {
  let e = false;
  let t = false;
  return {
    ...c,
    blocks: c.blocks.map((b) => {
      if (b.kind !== "text") return b;
      if (
        !e &&
        (b.style === "eyebrow" || b.style === "label") &&
        b.frame.y <= 128
      ) {
        e = true;
        return { ...b, text: eyebrow };
      }
      if (title && !t && b.style === "title" && b.frame.y <= 176) {
        t = true;
        return { ...b, text: title };
      }
      return b;
    }),
  };
}

export function productDeck(): ProductSlide[] {
  const HSI = { kind: "gauge" as const, gauge: "hsi" as const };
  const out: ProductSlide[] = [];

  // 1 · cover
  out.push({
    id: "p-cover",
    title: L("Slides that come alive", "Des diapositives vivantes"),
    slide: canvas(
      [
        T(
          "eyebrow",
          {
            en: `${BRAND.name} · Ground school`,
            fr: `${BRAND.name} · Théorie`,
          },
          G.left,
          G.eyebrowY,
          816,
          32,
        ),
        T(
          "display",
          L(
            "Teach IFR with slides that come alive",
            "Enseignez l’IFR avec des diapositives vivantes",
          ),
          G.left,
          232,
          864,
          408,
          { valign: "bottom" },
        ),
        T(
          "lead",
          L(
            "Designed for the classroom and the simulator: the lesson you show is the lesson they fly.",
            "Conçues pour la classe et le simulateur : la leçon que vous montrez est celle que l’élève vole.",
          ),
          G.left,
          672,
          816,
          176,
        ),
        T(
          "foot",
          L(
            "Holding · VOR · Maths for IFR and VFR · your own courses",
            "Attentes · VOR · Maths IFR et VFR · vos propres cours",
          ),
          G.left,
          912,
          840,
          32,
        ),
        {
          id: "hold",
          frame: { x: 984, y: 96, w: 816, h: 888, z: 1 },
          kind: "diagram",
          d: { kind: "hold", inbound: 270, turn: "R", fix: "ARD", quiet: true },
          alt: L("A holding pattern at ARD", "Une attente à ARD"),
        },
      ],
      "cover",
    ),
  });

  // 2 · the real instrument, live, with numbered callouts
  out.push({
    id: "p-inst",
    title: L("The real instrument, live", "Le vrai instrument, en direct"),
    slide: canvas(
      [
        INST(HSI, L("HSI", "HSI"), G.left, 120, 840, 840),
        T(
          "eyebrow",
          L("Live instruments", "Instruments en direct"),
          1128,
          120,
          672,
          32,
        ),
        T(
          "title",
          L("The instrument is on the slide", "L’instrument est dans la diapo"),
          1128,
          160,
          672,
          168,
        ),
        ...(
          [
            [
              L("The cockpit’s own gauges", "Les instruments du cockpit"),
              L(
                "Drawn by the simulator, not a picture",
                "Dessinés par le simulateur, pas une image",
              ),
            ],
            [
              L("Numbered callouts", "Des repères numérotés"),
              L(
                "Revealed one at a time, in class",
                "Révélés un par un, en classe",
              ),
            ],
            [
              L("Your turn", "À vous"),
              L(
                "The student sets it on the slide",
                "L’élève le règle dans la diapo",
              ),
            ],
          ] as [L10n, L10n][]
        ).flatMap(([a, b], i): SlideBlock[] => {
          const y = 392 + i * 176;
          return [
            rule(1128, y, 672),
            MARK(i + 1, 1156, y + 52, { size: 56 }),
            T("heading", a, 1208, y + 24, 592, 56),
            T("body", b, 1208, y + 88, 592, 80, { color: "ink2" }),
          ];
        }),
      ],
      "instrumentNotes",
    ),
  });

  // 3 · a formula worked line by line (the template's 1-in-60 derivation, real numbers)
  out.push({
    id: "p-formula",
    title: L(
      "Calculations, worked line by line",
      "Des calculs, ligne par ligne",
    ),
    slide: retitle(
      layoutCanvas("formula"),
      L("Generated exercises", "Exercices générés"),
    ),
  });

  // 4 · a question on the slide
  out.push({
    id: "p-quiz",
    title: L("A question on the slide", "Une question dans la diapo"),
    slide: retitle(
      layoutCanvas("quiz"),
      L("Check understanding", "Vérifier la compréhension"),
    ),
  });

  // 5 · then the simulator flies it
  const pillars: [L10n, L10n][] = [
    [
      L("Every approach", "Toutes les approches"),
      L(
        "ILS, LOC, VOR, NDB, RNAV, circling",
        "ILS, LOC, VOR, NDB, RNAV, indirecte",
      ),
    ],
    [
      L("Holds and arcs", "Attentes et arcs"),
      L(
        "Entries, timing, wind, ATC clearances",
        "Entrées, chrono, vent, clairances ATC",
      ),
    ],
    [
      L("A graded debrief", "Un débrief noté"),
      L(
        "Each step scored against its standard",
        "Chaque étape notée selon son critère",
      ),
    ],
  ];
  out.push({
    id: "p-fly",
    title: L("Then they fly it", "Puis l’élève le vole"),
    slide: canvas(
      [
        T(
          "eyebrow",
          L("The simulator", "Le simulateur"),
          G.left,
          G.eyebrowY,
          1392,
          32,
        ),
        T(
          "title",
          L("Then they fly it", "Puis l’élève le vole"),
          G.left,
          G.titleY,
          1392,
          152,
        ),
        T(
          "lead",
          L(
            "Capable and simple: the engine behind every course, in the browser.",
            "Performant et simple : le moteur derrière chaque cours, dans le navigateur.",
          ),
          G.left,
          264,
          1392,
          112,
        ),
        ...pillars.flatMap(([a, b], i): SlideBlock[] => {
          const x = G.left + i * 576;
          return [
            rule(x, 480, 528),
            T(
              "number",
              L(String(i + 1).padStart(2, "0"), String(i + 1).padStart(2, "0")),
              x,
              512,
              528,
              184,
              { color: "accent" },
            ),
            T("heading", a, x, 720, 528, 64),
            T("body", b, x, 792, 528, 120, { color: "ink2" }),
          ];
        }),
      ],
      "recap",
    ),
  });
  return out;
}
