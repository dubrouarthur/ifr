// Ready-to-teach deck (PPL / IR): « Le virage standard et le circuit visuel ». The standard rate and its circle, the
// timed turn, the bank that the speed asks for, the roll-out lead, then the scan and its three classic errors;
// the student turns 45° on the clock on the slide, answers two questions, flies a 180° turn in the simulator.
// Sources: FAA-H-8083-15 IFH ch. 4 (standard-rate turn 3°/s, bank ≈ TAS/10 + 7) and ch. 6 (radial scan centred on
// the attitude indicator; common errors: fixation, omission, emphasis; timed turns; roll-out lead about half the
// bank angle); FAA-H-8083-3 AFH ch. 3 (level turns, roll-out); Cessna 172S POH section 5 (cruise power).
import type { Course, MotionScript } from "../../types";
import { G as GOAL, course } from "../kit";
import {
  L,
  SIX,
  coverStep,
  diagramStep,
  gauge,
  goalsStep,
  ideaStep,
  quizStep,
  recapStep,
  simFlightStep,
  sit,
  yourTurnStep,
} from "./kit";

export const STANDARD_TURN_ID = "sample-deck-standard-turn-scan";

const scenes = () => ({
  "st.level": sit("st.level", "level", "Level 3,000 ft · 100 kt · heading 270"),
  "st.north": sit("st.north", "level", "Level 3,000 ft · 100 kt · heading 360", { hdg: 360 }),
  "st.fly": sit("st.fly", "level", "Level 3,000 ft · 100 kt · heading 270"),
});

/** The same 3°/s while the speed goes from 80 to 120 kt: the bank grows from about 13° to about 19°. */
const BANK_SPEED: MotionScript = {
  duration: 34,
  tracks: {
    turn: [
      [0, 0],
      [3, 3],
      [34, 3],
    ],
    ias: [
      [0, 80],
      [9, 80],
      [24, 120],
      [34, 120],
    ],
    rpm: [
      [0, 2150],
      [9, 2150],
      [22, 2550],
      [34, 2550],
    ],
    vs: [[0, 0]],
  },
  telling: 30,
  marks: [
    { id: "slow", t: 7, label: L("80 kt: about 13°", "80 kt : environ 13°") },
    {
      id: "fast",
      t: 30,
      label: L("120 kt: about 19°", "120 kt : environ 19°"),
    },
  ],
};

/** A standard-rate turn to the left, 360 → 270, rolled out 7° early. */
const ROLL_OUT: MotionScript = {
  duration: 38,
  // ramps of 4.7 s at 3°/s² give 7° each: the roll-out starts 7° before 270 (half of the 15° bank)
  tracks: {
    turn: [
      [0, 0],
      [4.7, -3],
      [30, -3],
      [34.7, 0],
      [38, 0],
    ],
    vs: [[0, 0]],
  },
  telling: 31,
  marks: [
    { id: "lead", t: 30, label: L("Roll out 7° early", "Sortie 7° avant") },
    { id: "on", t: 36, label: L("Heading 270", "Cap 270") },
  ],
};

/** The scan in a climbing turn: attitude first, then each instrument that tells the result. */
const SCAN: MotionScript = {
  duration: 30,
  tracks: {
    turn: [
      [0, 0],
      [3, 3],
      [26, 3],
      [29, 0],
      [30, 0],
    ],
    vs: [
      [0, 0],
      [4, 500],
      [26, 500],
      [30, 0],
    ],
    ias: [
      [0, 100],
      [5, 80],
      [25, 80],
      [30, 95],
    ],
    rpm: [
      [0, 2300],
      [3, 2500],
      [27, 2500],
      [30, 2300],
    ],
  },
  telling: 14,
  marks: [
    { id: "ai", t: 5, label: L("Attitude first", "L’assiette d’abord") },
    { id: "vsi", t: 10, label: L("+500 ft/min", "+500 ft/min") },
    { id: "tc", t: 16, label: L("3° a second", "3° par seconde") },
  ],
};

/** Fixation: the eyes stay on the attitude indicator while a small bank and a sink creep in. */
const FIXATION: MotionScript = {
  duration: 30,
  tracks: {
    bank: [
      [0, 0],
      [6, 0],
      [18, 6],
      [30, 6],
    ],
    vs: [
      [0, 0],
      [8, 0],
      [16, -250],
      [30, -250],
    ],
  },
  telling: 26,
  marks: [
    { id: "hdg", t: 20, label: L("The heading has turned", "Le cap a tourné") },
    {
      id: "alt",
      t: 26,
      label: L("The altitude goes down", "L’altitude baisse"),
    },
  ],
};

export function standardTurnCourse(): Course {
  const IFH4 = L(
    "FAA IFH ch. 4 · standard-rate turn",
    "FAA IFH ch. 4 · virage standard",
  );
  const IFH6 = L("FAA IFH ch. 6 · the scan", "FAA IFH ch. 6 · circuit visuel");
  const steps = [
    // 1 ------------------------------------------------------------------ cover
    coverStep({
      id: "st-cover",
      eyebrow: L(
        "PPL · IR · Attitude flying",
        "PPL · IR · Pilotage aux instruments",
      ),
      title: L(
        "The standard-rate turn and the scan",
        "Le virage standard et le circuit visuel",
      ),
      sub: L(
        "3° a second, and where to look",
        "3° par seconde, et où regarder",
      ),
      lead: L(
        "Turn on the clock, roll out on the heading, never stare at one needle.",
        "Virer au chrono, sortir sur le cap, ne jamais fixer une seule aiguille.",
      ),
      source: L("FAA IFH ch. 4 and 6", "FAA IFH ch. 4 et 6"),
      view: SIX,
      alt: L(
        "Six instruments in a climbing turn to the right",
        "Six instruments dans un virage en montée à droite",
      ),
      scene: "st.level",
      motion: { script: SCAN },
      notes: L(
        "Let the climbing turn play: ask the class which instrument tells them the aircraft is turning.",
        "Laissez tourner le virage en montée : demandez à la classe quel instrument dit que l’avion vire.",
      ),
    }),
    // 2 ------------------------------------------------------------------ goals
    goalsStep({
      id: "st-goals",
      items: [
        L(
          "Turn at standard rate: 3° a second",
          "Virer au taux standard : 3° par seconde",
        ),
        L(
          "Give the bank for a speed: speed ÷ 10 + 7",
          "Donner l’inclinaison d’une vitesse : vitesse ÷ 10 + 7",
        ),
        L(
          "Roll out within 5° of the heading",
          "Sortir de virage à 5° près du cap",
        ),
      ],
      source: L(
        "FAA IFH ch. 4 · EASA Part-FCL IR",
        "FAA IFH ch. 4 · EASA Part-FCL IR",
      ),
      view: gauge("tc"),
      alt: L(
        "Turn coordinator in a standard-rate turn",
        "Indicateur de virage dans un virage standard",
      ),
      scene: "st.level",
      motion: { preset: "turn-std" },
      notes: L(
        "Three goals, each one measured later: the timed turn on the slide, the bank question, the 180° in the simulator.",
        "Trois objectifs, chacun mesuré ensuite : le virage chronométré sur la diapo, la question d’inclinaison, le 180° au simulateur.",
      ),
    }),
    // 3 ------------------------------------------------------------------ warm-up question
    quizStep({
      id: "st-quiz-time",
      title: L(
        "At standard rate, how long is a full turn?",
        "Au taux standard, combien de temps pour un tour complet ?",
      ),
      options: [
        {
          text: L("1 minute", "1 minute"),
          why: L(
            "That is a half turn: 180° at 3° a second.",
            "C’est un demi-tour : 180° à 3° par seconde.",
          ),
        },
        {
          text: L("2 minutes", "2 minutes"),
          why: L(
            "Yes: 360° ÷ 3° a second = 120 s. That is why the turn coordinator says « 2 MIN ».",
            "Oui : 360° ÷ 3° par seconde = 120 s. C’est pourquoi l’indicateur de virage porte « 2 MIN ».",
          ),
        },
        {
          text: L("4 minutes", "4 minutes"),
          why: L(
            "That would be a half-rate turn, 1.5° a second.",
            "Ce serait un demi-taux, 1,5° par seconde.",
          ),
        },
      ],
      answer: 1,
      source: IFH4,
      view: gauge("tc"),
      alt: L(
        "Turn coordinator on the standard-rate mark",
        "Indicateur de virage sur le repère du taux standard",
      ),
      scene: "st.level",
      motion: { preset: "turn-std" },
      notes: L(
        "A warm-up: let them answer from memory, the next slide shows why.",
        "Pour se mettre en route : qu’ils répondent de mémoire, la diapo suivante montre pourquoi.",
      ),
    }),
    // 4 ------------------------------------------------------------------ the standard rate and its circle
    diagramStep({
      id: "st-rate",
      eyebrow: L("Standard rate", "Taux standard"),
      title: L(
        "3° a second, whatever the aircraft",
        "3° par seconde, quel que soit l’avion",
      ),
      diagram: {
        d: { kind: "calc", calc: { kind: "turn", tasKt: 100, bankDeg: 15.4 } },
        alt: L(
          "The circle of a standard-rate turn at 100 kt: about 16° of bank",
          "Le cercle d’un virage standard à 100 kt : environ 16° d’inclinaison",
        ),
      },
      lines: [
        {
          text: L(
            "Wing on the mark: **3° a second**",
            "L’aile sur le repère : **3° par seconde**",
          ),
          dot: { g: "tc", moment: "rate" },
        },
        {
          text: L(
            "90° in 30 s, 180° in 1 min, 360° in 2 min",
            "90° en 30 s, 180° en 1 min, 360° en 2 min",
          ),
        },
      ],
      source: IFH4,
      g: "tc",
      alt: L(
        "Turn coordinator in a standard-rate turn",
        "Indicateur de virage dans un virage standard",
      ),
      scene: "st.level",
      motion: { preset: "turn-std" },
      notes: L(
        "Live: « Piloter la démonstration », then « Virage standard à droite »: the class sees the wing on the mark and the heading turning 3° a second.",
        "En direct : « Piloter la démonstration », puis « Virage standard à droite » : la classe voit l’aile sur le repère et le cap tourner de 3° par seconde.",
      ),
    }),
    // 5 ------------------------------------------------------------------ timed turn
    ideaStep({
      id: "st-timed",
      eyebrow: L("Timed turn", "Virage chronométré"),
      title: L(
        "Turn on the clock: 15 s for 45°",
        "Virer au chrono : 15 s pour 45°",
      ),
      lines: [
        {
          text: L(
            "Start the clock when the wing reaches the mark",
            "Top chrono quand l’aile atteint le repère",
          ),
          dot: { g: "tc", moment: "start" },
        },
        {
          text: L(
            "**15 s** later, level the wings: 45° turned",
            "**15 s** plus tard, ailes à plat : 45° de virage",
          ),
          dot: { g: "hsi", moment: "stop" },
        },
        {
          text: L(
            "Useful when the heading indicator has failed",
            "Utile quand le conservateur de cap est en panne",
          ),
        },
      ],
      source: L(
        "FAA IFH ch. 6 · timed turns",
        "FAA IFH ch. 6 · virages chronométrés",
      ),
      view: SIX,
      alt: L(
        "Six instruments: a 45° timed turn to the right",
        "Six instruments : un virage chronométré de 45° à droite",
      ),
      scene: "st.level",
      motion: { preset: "timed-turn" },
      notes: L(
        "Count the 15 seconds aloud with the class while it plays. « Rejouer l’animation » to count again.",
        "Comptez les 15 secondes à voix haute avec la classe. « Rejouer l’animation » pour recompter.",
      ),
    }),
    // 6 ------------------------------------------------------------------ your turn: 45° on the clock
    yourTurnStep({
      id: "st-try",
      title: L(
        "45° to the right, on the clock",
        "45° à droite, au chrono",
      ),
      control: L(
        "**Bank**: drag to the right, or − and +. Back to the middle: wings level.",
        "**Inclinaison** : glissez vers la droite, ou − et +. Au milieu : ailes à plat.",
      ),
      rows: [
        {
          text: L("Heading 315, ±5°", "Cap 315, ±5°"),
          check: 0,
          readout: "hdg",
        },
        {
          text: L("Altitude 3,000 ft, ±100 ft", "Altitude 3 000 ft, ±100 ft"),
          check: 1,
          readout: "alt",
        },
      ],
      tip: L(
        "Wing on the mark, count 15 seconds, level the wings. Altitude and speed are held for you.",
        "L’aile sur le repère, comptez 15 secondes, ailes à plat. Altitude et vitesse sont tenues pour vous.",
      ),
      source: L(
        "FAA IFH ch. 6 · timed turns",
        "FAA IFH ch. 6 · virages chronométrés",
      ),
      view: SIX,
      alt: L(
        "Live six instruments, level at 3,000 ft, heading 270",
        "Six instruments en direct, en palier à 3 000 ft, cap 270",
      ),
      scene: "st.level",
      controls: ["bank"],
      prompt: L(
        "Turn 45° to the right on the clock: heading 315",
        "Virez de 45° à droite au chrono : cap 315",
      ),
      goal: [GOAL.heading(315, 5), GOAL.alt(2900, 3100)],
      holdS: 5,
      success: L(
        "Heading 315: 15 seconds at standard rate is 45°.",
        "Cap 315 : 15 secondes au taux standard font 45°.",
      ),
      hint: L(
        "15° of bank puts the wing on the mark.",
        "15° d’inclinaison mettent l’aile sur le repère.",
      ),
      notes: L(
        "One student at the controls (« Donner les commandes à un élève »), the class counts the seconds. « Réessayer » for the next student.",
        "Un élève aux commandes (« Donner les commandes à un élève »), la classe compte les secondes. « Réessayer » pour l’élève suivant.",
      ),
    }),
    // 7 ------------------------------------------------------------------ bank and speed
    ideaStep({
      id: "st-bank-speed",
      eyebrow: L("The bank it takes", "L’inclinaison qu’il faut"),
      title: L(
        "Same rate, more speed: more bank",
        "Même taux, plus de vitesse : plus d’inclinaison",
      ),
      lines: [
        {
          text: L(
            "At **80 kt**, about **13°** of bank",
            "À **80 kt**, environ **13°** d’inclinaison",
          ),
          dot: { g: "ai", moment: "slow" },
        },
        {
          text: L(
            "At **120 kt**, about **19°**",
            "À **120 kt**, environ **19°**",
          ),
          dot: { g: "ai", at: [0.78, -0.78], moment: "fast" },
        },
        {
          text: L(
            "Rule of thumb: **speed ÷ 10 + 7**",
            "Règle pratique : **vitesse ÷ 10 + 7**",
          ),
        },
      ],
      source: L(
        "FAA IFH ch. 4 · bank for standard rate",
        "FAA IFH ch. 4 · inclinaison du taux standard",
      ),
      view: SIX,
      alt: L(
        "Six instruments: standard-rate turn while the speed goes from 80 to 120 kt",
        "Six instruments : virage standard pendant que la vitesse passe de 80 à 120 kt",
      ),
      scene: "st.level",
      motion: { script: BANK_SPEED },
      notes: L(
        "Watch the turn coordinator: it does not move, the rate stays 3°/s. Only the attitude indicator banks more as the speed builds.",
        "Regardez l’indicateur de virage : il ne bouge pas, le taux reste 3°/s. Seul l’horizon s’incline davantage quand la vitesse augmente.",
      ),
    }),
    // 8 ------------------------------------------------------------------ the roll-out lead
    ideaStep({
      id: "st-rollout",
      eyebrow: L("Rolling out", "Sortie de virage"),
      title: L(
        "Roll out early: half the bank",
        "Sortir en avance : la moitié de l’inclinaison",
      ),
      lines: [
        {
          text: L(
            "15° of bank: start levelling **7° before** the heading",
            "15° d’inclinaison : on remet à plat **7° avant** le cap",
          ),
          dot: { g: "hsi", moment: "lead" },
        },
        {
          text: L(
            "The wings are level just as the heading arrives",
            "Les ailes sont à plat juste quand le cap arrive",
          ),
          dot: { g: "hsi", at: [0.78, -0.78], moment: "on" },
        },
      ],
      source: L(
        "FAA AFH ch. 3 · FAA IFH ch. 6",
        "FAA AFH ch. 3 · FAA IFH ch. 6",
      ),
      view: gauge("hsi"),
      alt: L(
        "Heading indicator: a left turn from 360 to 270",
        "Conservateur de cap : virage à gauche du 360 au 270",
      ),
      scene: "st.north",
      motion: { script: ROLL_OUT },
      notes: L(
        "Pause on the first dot (« Pause » on the instrument): the heading reads about 277, the wings start to level.",
        "Faites une pause au premier point (« Pause » sur l’instrument) : le cap lit environ 277, les ailes commencent à revenir à plat.",
      ),
    }),
    // 9 ------------------------------------------------------------------ question: bank at 120 kt
    quizStep({
      id: "st-quiz-bank",
      title: L(
        "At 120 kt, what bank for standard rate?",
        "À 120 kt, quelle inclinaison pour le taux standard ?",
      ),
      options: [
        {
          text: L("12°", "12°"),
          why: L(
            "Too little: that is about the bank at 80 kt.",
            "Trop peu : c’est à peu près l’inclinaison à 80 kt.",
          ),
        },
        {
          text: L("19°", "19°"),
          why: L(
            "Yes: 120 ÷ 10 + 7 = 19°. Then put the wing on the mark: the turn coordinator decides.",
            "Oui : 120 ÷ 10 + 7 = 19°. Puis on met l’aile sur le repère : l’indicateur de virage décide.",
          ),
        },
        {
          text: L("30°", "30°"),
          why: L(
            "Far too much: about 6° a second at 120 kt.",
            "Beaucoup trop : environ 6° par seconde à 120 kt.",
          ),
        },
      ],
      answer: 1,
      source: IFH4,
      view: gauge("ai"),
      alt: L(
        "Attitude indicator: the bank grows with the speed",
        "Horizon artificiel : l’inclinaison croît avec la vitesse",
      ),
      scene: "st.level",
      motion: { script: BANK_SPEED },
      notes: L(
        "Ask for a show of hands before revealing. The formula is a starting point; the turn coordinator gives the exact bank.",
        "Faites lever les mains avant de révéler. La formule donne un départ ; l’indicateur de virage donne l’inclinaison exacte.",
      ),
    }),
    // 10 ------------------------------------------------------------------ the scan
    ideaStep({
      id: "st-scan",
      eyebrow: L("The scan", "Le circuit visuel"),
      title: L(
        "The attitude indicator at the centre",
        "L’horizon au centre du circuit",
      ),
      lines: [
        {
          text: L(
            "**Attitude first**, then back to it after each glance",
            "**L’assiette d’abord**, puis on y revient après chaque coup d’œil",
          ),
          dot: { g: "ai", moment: "ai" },
        },
        {
          text: L(
            "Climbing: the **VSI** and the speed tell the result",
            "En montée : le **vario** et la vitesse disent le résultat",
          ),
          dot: { g: "vsi", moment: "vsi" },
        },
        {
          text: L(
            "Turning: the **turn coordinator**, then the heading",
            "En virage : l’**indicateur de virage**, puis le cap",
          ),
          dot: { g: "tc", at: [0.78, -0.78], moment: "tc" },
        },
      ],
      source: IFH6,
      view: SIX,
      alt: L(
        "Six instruments in a climbing turn to the right",
        "Six instruments dans un virage en montée à droite",
      ),
      scene: "st.level",
      motion: { script: SCAN },
      notes: L(
        "Trace the star with your finger on the screen: centre, out to one instrument, back to the centre.",
        "Dessinez l’étoile du doigt sur l’écran : le centre, un instrument, retour au centre.",
      ),
    }),
    // 11 ------------------------------------------------------------------ the errors of the scan
    ideaStep({
      id: "st-errors",
      eyebrow: L("The scan", "Le circuit visuel"),
      title: L(
        "Three errors: fixation, omission, emphasis",
        "Trois erreurs : fixation, omission, accentuation",
      ),
      lines: [
        {
          text: L(
            "**Fixation**: eyes on the horizon, the heading drifts",
            "**Fixation** : les yeux sur l’horizon, le cap dérive",
          ),
          dot: { g: "hsi", moment: "hdg" },
        },
        {
          text: L(
            "**Omission**: the altimeter forgotten, the altitude goes",
            "**Omission** : l’altimètre oublié, l’altitude s’en va",
          ),
          dot: { g: "alt", moment: "alt" },
        },
        {
          text: L(
            "**Emphasis**: trusting one instrument alone",
            "**Accentuation** : croire un seul instrument",
          ),
        },
      ],
      source: IFH6,
      view: SIX,
      alt: L(
        "Six instruments: a small bank and a slow sink creep in",
        "Six instruments : une petite inclinaison et une lente descente s’installent",
      ),
      scene: "st.level",
      motion: { script: FIXATION },
      notes: L(
        "Ask the class to say « stop » as soon as they see something change. Most see the heading late.",
        "Demandez à la classe de dire « stop » dès qu’elle voit quelque chose changer. La plupart voient le cap tard.",
      ),
    }),
    // 12 ------------------------------------------------------------------ in the simulator
    simFlightStep({
      id: "st-fly",
      title: L(
        "In the simulator: a 180° turn in one minute",
        "Au simulateur : un demi-tour en une minute",
      ),
      brief: L(
        "Level at 3,000 ft, heading 270. Turn left onto **090** at standard rate: one minute. Hold 3,000 ft.",
        "En palier à 3 000 ft, cap 270. Virez à gauche au **090** au taux standard : une minute. Tenez 3 000 ft.",
      ),
      scene: "st.fly",
      alt: L(
        "The simulator's cockpit, level at 3,000 ft, heading 270",
        "Le cockpit du simulateur, en palier à 3 000 ft, cap 270",
      ),
      prompt: L(
        "Turn left onto heading 090 at standard rate",
        "Virez à gauche au cap 090 au taux standard",
      ),
      goal: [GOAL.heading(90, 5), GOAL.alt(2850, 3150)],
      holdS: 10,
      durationS: 180,
      success: L(
        "Heading 090 and 3,000 ft held 10 seconds.",
        "Cap 090 et 3 000 ft tenus 10 secondes.",
      ),
      source: L(
        "FAA AFH ch. 3 · level turns",
        "FAA AFH ch. 3 · virages en palier",
      ),
      notes: L(
        "Show it first if you like: « Ouvrir le simulateur », then « Reprendre le cours ».",
        "Montrez-le d’abord si vous voulez : « Ouvrir le simulateur », puis « Reprendre le cours ».",
      ),
    }),
    // 13 ------------------------------------------------------------------ takeaways
    recapStep({
      id: "st-recap",
      title: L(
        "Three numbers for every turn",
        "Trois chiffres pour chaque virage",
      ),
      cols: [
        [
          L("3°/s", "3°/s"),
          L(
            "standard rate: 360° in 2 minutes",
            "taux standard : 360° en 2 minutes",
          ),
        ],
        [
          L("÷ 10 + 7", "÷ 10 + 7"),
          L(
            "the bank for standard rate, from the speed",
            "l’inclinaison du taux standard, d’après la vitesse",
          ),
        ],
        [
          L("½ bank", "½ inclinaison"),
          L(
            "the roll-out lead, in degrees of heading",
            "l’avance à la sortie, en degrés de cap",
          ),
        ],
      ],
      source: L(
        "FAA IFH ch. 4 and 6 · AFH ch. 3",
        "FAA IFH ch. 4 et 6 · AFH ch. 3",
      ),
      scene: "st.level",
      notes: L(
        "Read the three numbers aloud, then ask one student to say each without looking.",
        "Lisez les trois chiffres à voix haute, puis demandez à un élève de les redire sans regarder.",
      ),
    }),
  ];
  return course(
    {
      id: STANDARD_TURN_ID,
      title: L(
        "The standard-rate turn and the scan",
        "Le virage standard et le circuit visuel",
      ),
      summary: L(
        "3° a second, the timed turn, the bank for a speed, the roll-out lead, the scan and its errors.",
        "3° par seconde, le virage chronométré, l’inclinaison selon la vitesse, l’avance à la sortie, le circuit visuel et ses erreurs.",
      ),
      cockpit: "steam",
      theme: "classroom",
      tags: ["ppl", "ir", "attitude"],
    },
    steps,
    scenes(),
  );
}
