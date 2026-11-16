// The starting template of each formation (« Nouveau cours », academy.html#new): five to seven slides built from
// the gallery of ready slides (samples/exampleSlides.ts). Each one has a cover that takes the typed title, the
// lesson's goals, one or two ideas whose instrument moves, an « À vous » moment with a clear goal, a question to
// the class and the takeaways. Every slide carries a note to the author, shown only while editing, that says
// what to replace (BlockBase.editorOnly).
import type { L10n, SlideBlock, SlideCanvas, SlideLayoutId } from "../types";
import type { DeckStarter } from "../ui/deckStarters";
import { L, T } from "../canvas/layouts";
import {
  TURN_COVER,
  VOR_INTERCEPT,
  type CoverOpts,
  coverSlide,
  galleryScenes,
  gallerySlide,
  objectivesSlide,
  quizSlide,
  recapSlide,
} from "./exampleSlides";

// ------------------------------------------------------------------ the notes to the author
export const NOTES = {
  cover: L(
    "Your course title shows here. Replace the line with what the student will learn.",
    "Le titre du cours s’affiche ici. Remplacez la phrase par ce que l’élève va apprendre.",
  ),
  goals: L(
    "Replace these three goals with yours: a verb and a number each.",
    "Remplacez ces trois objectifs par les vôtres : un verbe et un chiffre.",
  ),
  idea: L(
    "Replace the lines with your words. Change the movement under « Animation ».",
    "Remplacez les lignes par vos mots. Le mouvement se change dans « Animation ».",
  ),
  yourTurn: L(
    "Change the goal under « What the student can do ».",
    "Changez l’objectif dans « Ce que l’élève peut faire ».",
  ),
  quiz: L(
    "Replace the question and the three answers with yours.",
    "Remplacez la question et les trois réponses par les vôtres.",
  ),
  recap: L(
    "Replace the three numbers with those of your lesson.",
    "Remplacez les trois chiffres par ceux de votre leçon.",
  ),
} satisfies Record<string, L10n>;
/** The note block: bottom right, beside the source line, never shown to a student. */
export function noteBlock(text: L10n, id = "note"): SlideBlock {
  return {
    ...T("small", text, 1224, 928, 576, 120, { id, color: "accent" }),
    editorOnly: true,
  };
}
export function withNote(slide: SlideCanvas, text: L10n): SlideCanvas {
  return { ...slide, blocks: [...slide.blocks, noteBlock(text)] };
}

// ------------------------------------------------------------------ the decks
type Made = (theme?: unknown) => SlideCanvas;
const ready =
  (id: string): Made =>
  () => {
    const g = gallerySlide(id);
    if (!g) throw new Error(`gallery slide ${id}`);
    return g.slide;
  };
const fixed =
  (s: () => SlideCanvas): Made =>
  () =>
    s();
interface Spec {
  id: string;
  title: L10n;
  pitch: L10n;
  level: L10n;
  formations: DeckStarter["formations"];
  /** the cover's words (also the course title when none is typed: deckTitle) */
  cover: CoverOpts;
  /** [layout, made, note] per slide */
  slides: [SlideLayoutId, Made, L10n][];
}
function deck(o: Spec): DeckStarter {
  return {
    id: o.id,
    title: o.title,
    pitch: o.pitch,
    theme: "classroom",
    level: o.level,
    formations: o.formations,
    cover: {
      eyebrow: o.cover.eyebrow,
      title: o.cover.title,
      subtitle: o.cover.sub,
      lead: o.cover.lead,
      foot: o.cover.source,
    },
    slides: o.slides.map((s) => s[0]),
    make: Object.fromEntries(o.slides.map((s, i) => [i, s[1]])),
    notes: Object.fromEntries(o.slides.map((s, i) => [i, s[2]])),
    scenes: galleryScenes,
  };
}
const SIX = { kind: "six" } as const;
const gauge = (g: "ai" | "tc" | "hsi" | "cdi") =>
  ({ kind: "gauge", gauge: g }) as const;

const NIGHT_COVER: CoverOpts = {
          id: "nt-cover",
          eyebrow: L("Night flying · VFR", "Vol de nuit · VFR"),
          title: L("Flying at night", "Le vol de nuit"),
          sub: L(
            "When the horizon goes, the instruments take over",
            "Quand l’horizon disparaît, les instruments prennent le relais",
          ),
          lead: L(
            "At night the senses mislead: believe the instruments.",
            "De nuit, les sensations trompent : on croit les instruments.",
          ),
          source: L(
            "EASA FCL.810 · FAA AFH ch. 10",
            "EASA FCL.810 · FAA AFH ch. 10",
          ),
          view: SIX,
          alt: L(
            "Six flight instruments in a standard-rate turn",
            "Six instruments de vol dans un virage standard",
          ),
          scene: "gx.level",
          motion: { preset: "turn-std" },
        };

const IR_COVER: CoverOpts = {
          id: "ir-cover",
          eyebrow: L("Radio navigation · IR", "Radionavigation · IR"),
          title: L("Intercepting a radial", "Intercepter un radial"),
          sub: L(
            "The OBS, the bar and the intercept heading",
            "L’OBS, la barre et le cap d’interception",
          ),
          lead: L(
            "Find where you are, pick a heading, join the course.",
            "Lire où l’on est, choisir un cap, rejoindre la route.",
          ),
          source: L("FAA IFH ch. 9", "FAA IFH ch. 9"),
          view: gauge("hsi"),
          alt: L(
            "HSI: a 30° intercept of the 270 course to ARD",
            "HSI : interception à 30° de la route 270 vers ARD",
          ),
          scene: "gx.intercept",
          motion: { script: VOR_INTERCEPT },
        };

const ATPL_COVER: CoverOpts = {
          id: "at-cover",
          eyebrow: L(
            "ATPL theory · 022 Instruments",
            "ATPL théorie · 022 Instruments",
          ),
          title: L("Gyroscopic instruments", "Les instruments gyroscopiques"),
          sub: L(
            "What spins them, what fools them",
            "Ce qui les fait tourner, ce qui les trompe",
          ),
          lead: L(
            "Attitude indicator, heading indicator, turn coordinator: their sources and their failures.",
            "Horizon, conservateur de cap, indicateur de virage : leurs sources et leurs pannes.",
          ),
          source: L(
            "EASA ATPL 022 · FAA IFH ch. 5",
            "EASA ATPL 022 · FAA IFH ch. 5",
          ),
          view: SIX,
          alt: L(
            "Six instruments: the vacuum fails, the attitude indicator tips",
            "Six instruments : la dépression lâche, l’horizon bascule",
          ),
          scene: "gx.level",
          motion: { preset: "vacuum" },
        };

/** LAPL · PPL: turning (FAA AFH ch. 3, IFH ch. 4). */
const PPL_TURNS = deck({
  id: "ppl-turns",
  title: L("PPL lesson: turning", "Leçon PPL : les virages"),
  pitch: L(
    "A turn that plays by itself, the 45° turn, the student holds a heading, a question",
    "Un virage qui se joue tout seul, le virage à 45°, l’élève tient un cap, une question",
  ),
  level: L("LAPL / PPL", "LAPL / PPL"),
  formations: ["ppl", "club"],
  cover: TURN_COVER,
  slides: [
    ["cover", ready("gx-cover"), NOTES.cover],
    ["ready", ready("gx-objectives"), NOTES.goals],
    ["instrumentNotes", ready("gx-turn-std"), NOTES.idea],
    ["instrumentNotes", ready("gx-turn-45"), NOTES.idea],
    ["yourTurn", ready("gx-hold-heading"), NOTES.yourTurn],
    ["quiz", ready("gx-quiz"), NOTES.quiz],
    ["recap", ready("gx-recap"), NOTES.recap],
  ],
});

/** Night flying: the instruments take over (EASA FCL.810, FAA AFH ch. 10, PHAK ch. 17). */
const NIGHT = deck({
  id: "night-instruments",
  title: L(
    "Night flying: trust the instruments",
    "Vol de nuit : croire les instruments",
  ),
  pitch: L(
    "The scan, the descent, the student holds a heading, a question on the senses",
    "Le circuit visuel, la descente, l’élève tient un cap, une question sur les sensations",
  ),
  level: L("Night rating", "Vol de nuit"),
  formations: ["night"],
  cover: NIGHT_COVER,
  slides: [
    [
      "cover",
      fixed(() =>
        coverSlide(NIGHT_COVER),
      ),
      NOTES.cover,
    ],
    [
      "ready",
      fixed(() =>
        objectivesSlide({
          id: "nt-goals",
          items: [
            L(
              "Hold the attitude on the attitude indicator",
              "Tenir l’assiette sur l’horizon artificiel",
            ),
            L(
              "Scan without stopping on one instrument",
              "Faire le circuit visuel sans s’arrêter sur un instrument",
            ),
            L(
              "Descend at 500 ft/min, speed held",
              "Descendre à 500 ft/min, vitesse tenue",
            ),
          ],
          source: L(
            "FAA AFH ch. 10 · night operations",
            "FAA AFH ch. 10 · vol de nuit",
          ),
          view: gauge("ai"),
          alt: L(
            "Attitude indicator in a standard-rate turn",
            "Horizon artificiel dans un virage standard",
          ),
          scene: "gx.level",
          motion: { preset: "turn-std" },
        }),
      ),
      NOTES.goals,
    ],
    ["stepByStep", ready("gx-scan"), NOTES.idea],
    ["instrumentNotes", ready("gx-descent-500"), NOTES.idea],
    ["yourTurn", ready("gx-hold-heading"), NOTES.yourTurn],
    [
      "quiz",
      fixed(() =>
        quizSlide({
          id: "nt-quiz",
          title: L(
            "At night, in a turn, what do you believe?",
            "De nuit, en virage, que faut-il croire ?",
          ),
          options: [
            L("Your senses", "Vos sensations"),
            L("The attitude indicator", "L’horizon artificiel"),
            L("The compass", "Le compas"),
          ],
          answer: 1,
          explain: L(
            "Without a visible horizon the inner ear is fooled: only the attitude read on the attitude indicator is sure.",
            "Sans horizon visible, l’oreille interne se trompe : seule l’assiette lue sur l’horizon artificiel est sûre.",
          ),
          source: L(
            "FAA PHAK ch. 17 · spatial disorientation",
            "FAA PHAK ch. 17 · désorientation spatiale",
          ),
          view: gauge("ai"),
          alt: L(
            "Attitude indicator in a standard-rate turn",
            "Horizon artificiel dans un virage standard",
          ),
          scene: "gx.level",
          motion: { preset: "turn-std" },
        }),
      ),
      NOTES.quiz,
    ],
    [
      "recap",
      fixed(() =>
        recapSlide({
          title: L(
            "Three numbers for a night flight",
            "Trois chiffres pour un vol de nuit",
          ),
          cols: [
            [
              L("3°/s", "3°/s"),
              L(
                "standard rate, by night as by day",
                "taux standard, de nuit comme de jour",
              ),
            ],
            [
              L("−500", "−500"),
              L(
                "ft/min to descend, speed held",
                "ft/min pour descendre, vitesse tenue",
              ),
            ],
            [
              L("74 kt", "74 kt"),
              L(
                "VY: the best rate of climb",
                "VY : le meilleur taux de montée",
              ),
            ],
          ],
          source: L(
            "FAA AFH ch. 3 and 10 · C172S POH section 4",
            "FAA AFH ch. 3 et 10 · POH C172S section 4",
          ),
        }),
      ),
      NOTES.recap,
    ],
  ],
});

/** IR: intercepting and following a radial (FAA IFH ch. 9). */
const IR_RADIAL = deck({
  id: "ir-radial",
  title: L(
    "IR lesson: intercepting a radial",
    "Leçon IR : intercepter un radial",
  ),
  pitch: L(
    "The 30° intercept, the VOR passage, the student centres the needle, a question",
    "L’interception à 30°, le passage du VOR, l’élève centre l’aiguille, une question",
  ),
  level: L("IR", "IR"),
  formations: ["ir"],
  cover: IR_COVER,
  slides: [
    [
      "cover",
      fixed(() =>
        coverSlide(IR_COVER),
      ),
      NOTES.cover,
    ],
    [
      "ready",
      fixed(() =>
        objectivesSlide({
          id: "ir-goals",
          items: [
            L("Find your radial with the OBS", "Trouver son radial avec l’OBS"),
            L("Intercept a course at 30°", "Intercepter une route à 30°"),
            L(
              "Recognise the VOR passage: TO, then FROM",
              "Reconnaître le passage du VOR : TO puis FROM",
            ),
          ],
          source: L(
            "EASA Part-FCL IR syllabus · FAA IFH ch. 9",
            "Programme IR EASA Part-FCL · FAA IFH ch. 9",
          ),
          view: gauge("hsi"),
          alt: L(
            "HSI: a 30° intercept of the 270 course to ARD",
            "HSI : interception à 30° de la route 270 vers ARD",
          ),
          scene: "gx.intercept",
          motion: { script: VOR_INTERCEPT },
        }),
      ),
      NOTES.goals,
    ],
    ["instrumentNotes", ready("gx-vor-intercept"), NOTES.idea],
    ["instrumentNotes", ready("gx-vor-cross"), NOTES.idea],
    ["yourTurn", ready("gx-set-obs"), NOTES.yourTurn],
    [
      "quiz",
      fixed(() =>
        quizSlide({
          id: "ir-quiz",
          title: L(
            "Bar to the right, TO, heading near the course: where is the course?",
            "Barre à droite, TO, cap proche de la route : où est la route ?",
          ),
          options: [
            L("To the right", "À droite"),
            L("To the left", "À gauche"),
            L("Behind", "Derrière"),
          ],
          answer: 0,
          explain: L(
            "The bar shows where the course is: to the right, turn right to join it.",
            "La barre montre où est la route : à droite, on vire à droite pour la rejoindre.",
          ),
          source: L(
            "FAA IFH ch. 9 · VOR orientation",
            "FAA IFH ch. 9 · orientation VOR",
          ),
          view: gauge("hsi"),
          alt: L(
            "HSI: a 30° intercept of the 270 course to ARD",
            "HSI : interception à 30° de la route 270 vers ARD",
          ),
          scene: "gx.intercept",
          motion: { script: VOR_INTERCEPT },
        }),
      ),
      NOTES.quiz,
    ],
    [
      "recap",
      fixed(() =>
        recapSlide({
          title: L(
            "Three numbers for an intercept",
            "Trois chiffres pour une interception",
          ),
          cols: [
            [
              L("30°", "30°"),
              L(
                "of intercept: a good compromise",
                "d’interception : un bon compromis",
              ),
            ],
            [
              L("10°", "10°"),
              L(
                "at full scale on a VOR: 2° a dot",
                "à pleine échelle d’un VOR : 2° par point",
              ),
            ],
            [
              L("1:60", "1:60"),
              L("1° off is 1 NM at 60 NM", "1° d’écart, c’est 1 NM à 60 NM"),
            ],
          ],
          source: L("FAA IFH ch. 9", "FAA IFH ch. 9"),
        }),
      ),
      NOTES.recap,
    ],
  ],
});

/** ATPL theory, 022 instruments: the gyroscopic instruments (FAA IFH ch. 5, PHAK ch. 8). */
const ATPL_GYROS = deck({
  id: "atpl-gyros",
  title: L(
    "ATPL theory: gyroscopic instruments",
    "ATPL théorie : les instruments gyroscopiques",
  ),
  pitch: L(
    "The vacuum failure, the compass errors, the student holds a heading, a question",
    "La panne de dépression, les erreurs du compas, l’élève tient un cap, une question",
  ),
  level: L("ATPL theory", "ATPL théorie"),
  formations: ["atpl"],
  cover: ATPL_COVER,
  slides: [
    [
      "cover",
      fixed(() =>
        coverSlide(ATPL_COVER),
      ),
      NOTES.cover,
    ],
    [
      "ready",
      fixed(() =>
        objectivesSlide({
          id: "at-goals",
          items: [
            L(
              "Name the source of each gyroscope",
              "Dire la source de chaque gyroscope",
            ),
            L(
              "Recognise a vacuum failure",
              "Reconnaître une panne de dépression",
            ),
            L(
              "Explain the compass errors in a turn",
              "Expliquer les erreurs du compas en virage",
            ),
          ],
          source: L(
            "EASA ATPL 022 syllabus · FAA IFH ch. 5",
            "Programme ATPL 022 EASA · FAA IFH ch. 5",
          ),
          view: gauge("tc"),
          alt: L(
            "Turn coordinator in a standard-rate turn",
            "Indicateur de virage dans un virage standard",
          ),
          scene: "gx.level",
          motion: { preset: "turn-std" },
        }),
      ),
      NOTES.goals,
    ],
    ["instrumentNotes", ready("gx-vacuum"), NOTES.idea],
    ["instrumentNotes", ready("gx-compass"), NOTES.idea],
    ["yourTurn", ready("gx-hold-heading"), NOTES.yourTurn],
    [
      "quiz",
      fixed(() =>
        quizSlide({
          id: "at-quiz",
          title: L(
            "Vacuum failure: which instrument stays right?",
            "Panne de dépression : quel instrument reste juste ?",
          ),
          options: [
            L("The attitude indicator", "L’horizon"),
            L("The heading indicator", "Le conservateur de cap"),
            L("The turn coordinator", "L’indicateur de virage"),
          ],
          answer: 2,
          explain: L(
            "The turn coordinator is electric: it stays right when the vacuum fails.",
            "L’indicateur de virage est électrique : il reste juste quand la dépression lâche.",
          ),
          source: L(
            "FAA IFH ch. 5 · gyroscopic systems",
            "FAA IFH ch. 5 · systèmes gyroscopiques",
          ),
          view: gauge("tc"),
          alt: L(
            "Turn coordinator in a standard-rate turn",
            "Indicateur de virage dans un virage standard",
          ),
          scene: "gx.level",
          motion: { preset: "turn-std" },
        }),
      ),
      NOTES.quiz,
    ],
    [
      "recap",
      fixed(() =>
        recapSlide({
          title: L(
            "Three gyroscopes, two sources",
            "Trois gyroscopes, deux sources",
          ),
          cols: [
            [
              L("2", "2"),
              L(
                "vacuum gyros: attitude and heading",
                "gyroscopes à dépression : horizon et cap",
              ),
            ],
            [
              L("1", "1"),
              L(
                "electric gyro: the turn coordinator",
                "gyroscope électrique : l’indicateur de virage",
              ),
            ],
            [
              L("0", "0"),
              L(
                "gyro in the compass: it errs in turns",
                "gyroscope dans le compas : il se trompe en virage",
              ),
            ],
          ],
          source: L("FAA IFH ch. 5 · PHAK ch. 8", "FAA IFH ch. 5 · PHAK ch. 8"),
        }),
      ),
      NOTES.recap,
    ],
  ],
});

/** The starting template of each formation, in training order. */
export const FORMATION_DECKS: readonly DeckStarter[] = [
  PPL_TURNS,
  NIGHT,
  IR_RADIAL,
  ATPL_GYROS,
];
