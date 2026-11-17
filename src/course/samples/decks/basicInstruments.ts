// Ready-to-teach deck (PPL): « Les instruments de base en 10 diapos ». One slide per instrument of the six, each one
// moving with an animation drawn by the simulator's own renderers; the student takes the power, then the bank, on
// the slide; one question; one flight in the simulator.
// Sources: Cessna 172S POH section 2 (airspeed indicator markings: white arc 40–85, green 48–129, yellow 129–163,
// red line 163 KIAS), section 4 (Vy 74 KIAS) and section 5; FAA-H-8083-25 PHAK ch. 8 "Flight Instruments" (pitot-
// static and gyroscopic instruments, VSI trend and lag, heading indicator set to the compass about every 15 min,
// turn coordinator and inclinometer); FAA-H-8083-15 IFH ch. 4 (standard-rate turn, 3°/s) and ch. 6 (level-off lead
// about 10 % of the vertical speed); FAA-H-8083-3 AFH ch. 3 (roll-out lead, about half the bank angle).
import type { Course, MotionScript } from "../../types";
import { G as GOAL, course } from "../kit";
import {
  L,
  SIX,
  easaFirst,
  coverStep,
  diagramStep,
  gauge,
  ideaStep,
  quizStep,
  simFlightStep,
  sit,
  yourTurnStep,
} from "./kit";

export const BASIC_INSTRUMENTS_ID = "sample-deck-basic-instruments";

const scenes = () => ({
  "bi.level": sit("bi.level", "level", "Level 3,000 ft · 100 kt · heading 270"),
  "bi.fly": sit("bi.fly", "level", "Level 3,000 ft · 100 kt · heading 270"),
  // « Ralentissez dans l’arc blanc »: already a little slow, so 30 % brings the needle into the arc in about 15 s (from 100 kt it took over a minute)
  "bi.slow": sit("bi.slow", "level", "Level 3,000 ft · 88 kt · heading 270", { iasKt: 88 }),
});

/** The attitude indicator: nose up into a climb, back to level, then a 20° bank to the right and back. */
const ATTITUDE: MotionScript = {
  duration: 32,
  tracks: {
    vs: [
      [0, 0],
      [4, 0],
      [7, 600],
      [12, 600],
      [15, 0],
      [32, 0],
    ],
    ias: [
      [0, 100],
      [8, 84],
      [13, 82],
      [18, 98],
      [32, 100],
    ],
    rpm: [
      [0, 2300],
      [4, 2500],
      [13, 2500],
      [16, 2300],
      [32, 2300],
    ],
    bank: [
      [0, 0],
      [18, 0],
      [21, 20],
      [27, 20],
      [30, 0],
      [32, 0],
    ],
  },
  telling: 24,
  marks: [
    {
      id: "pitch",
      t: 9,
      label: L("Nose up: the aircraft climbs", "Nez haut : l’avion monte"),
    },
    {
      id: "bank",
      t: 23,
      label: L(
        "Wings banked: the aircraft turns",
        "Ailes inclinées : l’avion vire",
      ),
    },
  ],
};

/** The altimeter and the VSI: a climb at about 650 ft/min, the level-off led by 10 % of the rate, then level. */
const ALT_VSI: MotionScript = {
  duration: 34,
  tracks: {
    vs: [
      [0, 0],
      [3, 0],
      [7, 650],
      [21, 650],
      [25, 0],
      [34, 0],
    ],
    ias: [
      [0, 100],
      [8, 76],
      [21, 74],
      [28, 92],
      [34, 100],
    ],
    rpm: [
      [0, 2300],
      [3, 2550],
      [24, 2550],
      [28, 2350],
      [34, 2300],
    ],
  },
  telling: 15,
  marks: [
    {
      id: "rate",
      channel: "vs",
      value: 640,
      label: L("+650 ft/min", "+650 ft/min"),
    },
    {
      id: "lead",
      t: 21,
      label: L("Level-off led by 65 ft", "Palier anticipé de 65 ft"),
    },
    {
      id: "level",
      t: 29,
      label: L("VSI on zero: level", "Vario à zéro : palier"),
    },
  ],
};

/** The heading indicator: a standard-rate turn from 270 to 360, rolled out 7° early. */
const HEADING: MotionScript = {
  duration: 38,
  // ramps of 4.7 s give 7° each: the roll-out starts 7° before 360 (half of the 15° bank)
  tracks: {
    turn: [
      [0, 0],
      [4.7, 3],
      [30, 3],
      [34.7, 0],
      [38, 0],
    ],
    vs: [[0, 0]],
  },
  telling: 16,
  marks: [
    {
      id: "turn",
      t: 12,
      label: L(
        "The card turns 3° a second",
        "La rose tourne de 3° par seconde",
      ),
    },
    { id: "lead", t: 30, label: L("Roll out 7° early", "Sortie 7° avant") },
    { id: "on", t: 36, label: L("Heading 360", "Cap 360") },
  ],
};

export function basicInstrumentsCourse(): Course {
  const POH2 = L(
    "C172S POH section 2 · airspeed indicator markings",
    "POH C172S section 2 · marquages de l’anémomètre",
  );
  const steps = [
    // 1 ------------------------------------------------------------------ cover
    coverStep({
      id: "bi-cover",
      eyebrow: L("Ground school · PPL", "Théorie · PPL"),
      title: L(
        "The basic instruments in 10 slides",
        "Les instruments de base en 10 diapos",
      ),
      sub: L(
        "What each needle says, and when",
        "Ce que dit chaque aiguille, et quand",
      ),
      lead: L(
        "Six instruments, one aircraft: watch them move, then take the controls.",
        "Six instruments, un seul avion : regardez-les bouger, puis prenez les commandes.",
      ),
      source: easaFirst(L("FAA PHAK ch. 8 · C172S POH", "FAA PHAK ch. 8 · POH C172S")),
      view: SIX,
      alt: L(
        "The six flight instruments of the C172S in a standard-rate turn",
        "Les six instruments de vol du C172S dans un virage standard",
      ),
      scene: "bi.level",
      motion: { preset: "turn-std" },
      notes: L(
        "The six instruments turn in a loop: all of them belong to one aircraft. Top row: speed, attitude, altitude. Bottom row: turn, heading, vertical speed. Press → to start.",
        "Les six instruments tournent en boucle : ils appartiennent tous au même avion. En haut : vitesse, assiette, altitude. En bas : virage, cap, vitesse verticale. Appuyez sur → pour commencer.",
      ),
    }),
    // 2 ------------------------------------------------------------------ airspeed indicator
    ideaStep({
      id: "bi-asi",
      eyebrow: L("1 · Airspeed indicator", "1 · Anémomètre"),
      title: L(
        "The airspeed indicator and its arcs",
        "L’anémomètre et ses arcs",
      ),
      lines: [
        {
          text: L(
            "**White arc**, 40 to 85 kt: full flaps allowed",
            "**Arc blanc**, 40 à 85 kt : volets pleins permis",
          ),
          dot: { g: "asi", at: [0.7, 0.26], moment: "vfe" },
        },
        {
          text: L(
            "**Green arc** to 129 kt, then **yellow**: smooth air only",
            "**Arc vert** jusqu’à 129 kt, puis **jaune** : air calme seulement",
          ),
          dot: { g: "asi", at: [-0.26, 0.7], moment: "vno" },
        },
        {
          text: L(
            "**Red line**, 163 kt: never exceed",
            "**Trait rouge**, 163 kt : à ne jamais dépasser",
          ),
          dot: { g: "asi", at: [-0.72, -0.1], moment: "vne" },
        },
      ],
      source: easaFirst(POH2),
      view: gauge("asi"),
      alt: L(
        "Airspeed indicator: the needle sweeps from 50 to 160 kt",
        "Anémomètre : l’aiguille va de 50 à 160 kt",
      ),
      scene: "bi.level",
      motion: { preset: "asi-arcs" },
      notes: L(
        "Let the needle run once: each number appears when it gets there. « Rejouer l’animation » on the console plays it again. The arcs are indicated airspeeds (KIAS).",
        "Laissez l’aiguille faire un tour : chaque numéro apparaît quand elle y arrive. « Rejouer l’animation » dans la console la relance. Les arcs sont des vitesses indiquées (KIAS).",
      ),
    }),
    // 3 ------------------------------------------------------------------ your turn: power
    yourTurnStep({
      id: "bi-asi-try",
      title: L(
        "Slow down into the white arc",
        "Ralentissez dans l’arc blanc",
      ),
      control: L(
        "**Power**: − to reduce, + to add. The altitude is held for you.",
        "**Puissance** : − pour réduire, + pour remettre. L’altitude est tenue pour vous.",
      ),
      rows: [
        {
          text: L(
            "Speed 70 to 85 kt, held 3 s",
            "Vitesse 70 à 85 kt, tenue 3 s",
          ),
          check: 0,
          readout: "ias",
        },
      ],
      tip: L(
        "Bring the power to about 30 % (6 clicks on −), then wait about 15 s: the speed takes a while to follow.",
        "Mettez la puissance vers 30 % (6 clics sur −), puis attendez une quinzaine de secondes : la vitesse met du temps à suivre.",
      ),
      source: easaFirst(POH2),
      view: SIX,
      alt: L(
        "Live six instruments, level at 3,000 ft, 88 kt",
        "Six instruments en direct, en palier à 3 000 ft, 88 kt",
      ),
      scene: "bi.slow",
      controls: ["power"],
      assist: { holdAlt: true },
      prompt: L(
        "Slow down to the white arc: 70 to 85 kt",
        "Ralentissez dans l’arc blanc : 70 à 85 kt",
      ),
      goal: [GOAL.ias(70, 85)],
      holdS: 3,
      success: L(
        "Under 85 kt: you are in the white arc, where the flaps may come out.",
        "Sous 85 kt : vous êtes dans l’arc blanc, où l’on peut sortir les volets.",
      ),
      hint: L(
        "Bring the power to about 30 % (6 clicks on −), then wait: below 85 kt the needle is in the white arc.",
        "Mettez la puissance vers 30 % (6 clics sur −), puis attendez : sous 85 kt, l’aiguille est dans l’arc blanc.",
      ),
      notes: L(
        "Hand the controls to one student (« Donner les commandes à un élève ») or let each student try on their own screen. The class watches the needle enter the white arc.",
        "Donnez les commandes à un élève (« Donner les commandes à un élève ») ou laissez chacun essayer sur son écran. La classe regarde l’aiguille entrer dans l’arc blanc.",
      ),
    }),
    // 4 ------------------------------------------------------------------ attitude indicator
    ideaStep({
      id: "bi-ai",
      eyebrow: L("2 · Attitude indicator", "2 · Horizon artificiel"),
      title: L(
        "The attitude indicator: the picture outside",
        "L’horizon artificiel : l’image du dehors",
      ),
      lines: [
        {
          text: L(
            "The small aircraft is you, the blue is the sky",
            "La maquette, c’est vous ; le bleu, c’est le ciel",
          ),
        },
        {
          text: L(
            "**Nose above the line**: the aircraft climbs",
            "**Nez au-dessus de la ligne** : l’avion monte",
          ),
          dot: { g: "ai", at: [0, -0.62], moment: "pitch" },
        },
        {
          text: L(
            "**Wings banked**: the aircraft turns",
            "**Ailes inclinées** : l’avion vire",
          ),
          dot: { g: "ai", at: [-0.78, -0.78], moment: "bank" },
        },
      ],
      source: easaFirst(
        L(
          "FAA PHAK ch. 8 · attitude indicator",
          "FAA PHAK ch. 8 · horizon artificiel",
        ),
      ),
      view: gauge("ai"),
      alt: L(
        "Attitude indicator: nose up, level, then 20° of right bank",
        "Horizon artificiel : nez haut, à plat, puis 20° d’inclinaison à droite",
      ),
      scene: "bi.level",
      motion: { script: ATTITUDE },
      notes: L(
        "The only instrument that shows the attitude directly: it sits in the middle of the scan. To show it live, open « Piloter la démonstration » and move Assiette, then Inclinaison.",
        "Le seul instrument qui montre l’assiette directement : il est au centre du circuit visuel. Pour le montrer en direct, ouvrez « Piloter la démonstration » et bougez Assiette, puis Inclinaison.",
      ),
    }),
    // 5 ------------------------------------------------------------------ altimeter and VSI
    ideaStep({
      id: "bi-alt-vsi",
      eyebrow: L(
        "3 and 4 · Altimeter and VSI",
        "3 et 4 · Altimètre et variomètre",
      ),
      title: L("The altimeter and the VSI", "L’altimètre et le variomètre"),
      lines: [
        {
          text: L(
            "**VSI**: the rate, about 650 ft/min in this climb",
            "**Variomètre** : le taux, environ 650 ft/min ici",
          ),
          dot: { g: "vsi", moment: "rate" },
        },
        {
          text: L(
            "**Altimeter**: level off 10 % early, 65 ft before",
            "**Altimètre** : on anticipe de 10 %, soit 65 ft",
          ),
          dot: { g: "alt", moment: "lead" },
        },
        {
          text: L(
            "VSI back on zero: the aircraft is level",
            "Vario revenu à zéro : l’avion est en palier",
          ),
          dot: { g: "vsi", at: [0.78, 0.78], moment: "level" },
        },
      ],
      source: easaFirst(
        L(
          "FAA PHAK ch. 8 · FAA IFH ch. 6 · level-off",
          "FAA PHAK ch. 8 · FAA IFH ch. 6 · mise en palier",
        ),
      ),
      view: SIX,
      alt: L(
        "Six instruments: a climb at 650 ft/min, then the level-off",
        "Six instruments : une montée à 650 ft/min, puis la mise en palier",
      ),
      scene: "bi.level",
      motion: { script: ALT_VSI },
      notes: L(
        "Point at the VSI first: it shows the trend before the altimeter moves much. Live: « Piloter la démonstration », then « Monter à » and watch both needles.",
        "Montrez d’abord le variomètre : il donne la tendance avant que l’altimètre bouge vraiment. En direct : « Piloter la démonstration », puis « Monter à » et regardez les deux aiguilles.",
      ),
    }),
    // 6 ------------------------------------------------------------------ question
    quizStep({
      id: "bi-quiz",
      title: L(
        "You climb at 500 ft/min to 3,000 ft. When do you start the level-off?",
        "Vous montez à 500 ft/min vers 3 000 ft. Quand commencez-vous la mise en palier ?",
      ),
      options: [
        {
          text: L("At 2,950 ft", "À 2 950 ft"),
          why: L(
            "Yes: 10 % of the rate, 50 ft before. The aircraft levels on 3,000 ft instead of going through.",
            "Oui : 10 % du vario, 50 ft avant. L’avion se pose sur 3 000 ft au lieu de le traverser.",
          ),
        },
        {
          text: L("At 3,000 ft", "À 3 000 ft"),
          why: L(
            "Too late: the aircraft keeps climbing while the nose comes down, you go through the altitude.",
            "Trop tard : l’avion monte encore pendant que le nez redescend, vous dépassez l’altitude.",
          ),
        },
        {
          text: L("At 2,500 ft", "À 2 500 ft"),
          why: L(
            "Too early: you would level 500 ft low and climb again. 10 % of 500 ft/min is 50 ft.",
            "Trop tôt : vous seriez 500 ft trop bas et devriez remonter. 10 % de 500 ft/min, c’est 50 ft.",
          ),
        },
      ],
      answer: 0,
      source: easaFirst(
        L(
          "FAA IFH ch. 6 · leading the level-off",
          "FAA IFH ch. 6 · anticiper la mise en palier",
        ),
      ),
      view: gauge("alt"),
      alt: L(
        "Altimeter during the climb and the level-off",
        "Altimètre pendant la montée et la mise en palier",
      ),
      scene: "bi.level",
      motion: { preset: "level-off" },
      notes: L(
        "Let the class vote before anyone taps. Each answer says why on the slide.",
        "Faites voter la classe avant qu’on appuie. Chaque réponse explique pourquoi sur la diapo.",
      ),
    }),
    // 7 ------------------------------------------------------------------ heading indicator
    ideaStep({
      id: "bi-hdg",
      eyebrow: L("5 · Heading indicator", "5 · Conservateur de cap"),
      title: L(
        "The heading indicator: a steady compass",
        "Le conservateur de cap : un compas stable",
      ),
      lines: [
        {
          text: L(
            "The card turns with the aircraft: **3° a second** here",
            "La rose tourne avec l’avion : **3° par seconde** ici",
          ),
          dot: { g: "hsi", moment: "turn" },
        },
        {
          text: L(
            "Roll out early, **half the bank**: 7° before 360",
            "On sort en avance, **la moitié de l’inclinaison** : 7° avant 360",
          ),
          dot: { g: "hsi", at: [0.78, -0.78], moment: "lead" },
        },
        {
          text: L(
            "A gyro drifts: set it to the compass every 15 min",
            "Un gyro dérive : on le recale sur le compas toutes les 15 min",
          ),
        },
      ],
      source: easaFirst(
        L(
          "FAA PHAK ch. 8 · FAA AFH ch. 3 · roll-out",
          "FAA PHAK ch. 8 · FAA AFH ch. 3 · sortie de virage",
        ),
      ),
      view: gauge("hsi"),
      alt: L(
        "Heading indicator: a standard-rate turn from 270 to 360",
        "Conservateur de cap : virage standard du 270 au 360",
      ),
      scene: "bi.level",
      motion: { script: HEADING },
      notes: L(
        "On this panel the heading indicator also carries the VOR needle (an HSI): leave it for the radio navigation course. Live: « Virage standard à droite » in « Piloter la démonstration ».",
        "Sur ce tableau, le conservateur de cap porte aussi l’aiguille VOR (un HSI) : on la garde pour le cours de radionavigation. En direct : « Virage standard à droite » dans « Piloter la démonstration ».",
      ),
    }),
    // 8 ------------------------------------------------------------------ turn coordinator and ball
    diagramStep({
      id: "bi-tc",
      eyebrow: L("6 · Turn coordinator and ball", "6 · Indicateur de virage et bille"),
      title: L("The turn coordinator and the ball", "L’indicateur de virage et la bille"),
      diagram: {
        d: { kind: "calc", calc: { kind: "turn", tasKt: 100, bankDeg: 15.4 } },
        alt: L(
          "The circle of a standard-rate turn at 100 kt: about 16° of bank, 2 minutes for the full circle",
          "Le cercle d’un virage standard à 100 kt : environ 16° d’inclinaison, 2 minutes pour le tour complet",
        ),
      },
      lines: [
        {
          text: L("Wing on the mark: **3° a second**, 2 min a turn", "L’aile sur le repère : **3° par seconde**, 2 min le tour"),
          dot: { g: "tc", moment: "rate" },
        },
        {
          text: L("**Ball in the middle**: balanced. Else, step on the ball", "**Bille au milieu** : symétrique. Sinon, « marchez sur la bille »"),
        },
      ],
      source: easaFirst(L("FAA PHAK ch. 8 · FAA IFH ch. 4", "FAA PHAK ch. 8 · FAA IFH ch. 4")),
      g: "tc",
      alt: L(
        "Turn coordinator on the standard-rate mark, ball centred",
        "Indicateur de virage sur le repère du taux standard, bille centrée",
      ),
      scene: "bi.level",
      motion: { preset: "turn-std" },
      notes: L(
        "The ball stays in the middle here: the simulator flies a balanced turn. Ask the class which foot they would use if the ball went to the right (the right foot).",
        "La bille reste au milieu ici : le simulateur vole un virage symétrique. Demandez à la classe quel pied mettre si la bille partait à droite (le pied droit).",
      ),
    }),
    // 9 ------------------------------------------------------------------ your turn: bank
    yourTurnStep({
      id: "bi-turn-try",
      title: L(
        "A standard-rate turn to 360",
        "Virage standard jusqu’au 360",
      ),
      control: L(
        "**Bank**: drag to the right, or − and +. Back to the middle: wings level.",
        "**Inclinaison** : glissez vers la droite, ou − et +. Au milieu : ailes à plat.",
      ),
      rows: [
        {
          text: L("Heading 360, ±5°", "Cap 360, ±5°"),
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
        "Bank about 15° to put the wing on the mark, level the wings 7° before 360. Altitude and speed are held for you.",
        "Inclinez d’environ 15° pour mettre l’aile sur le repère, remettez à plat 7° avant le 360. Altitude et vitesse sont tenues pour vous.",
      ),
      source: easaFirst(
        L(
          "FAA IFH ch. 4 · standard-rate turn",
          "FAA IFH ch. 4 · virage standard",
        ),
      ),
      view: SIX,
      alt: L(
        "Live six instruments, level at 3,000 ft, heading 270",
        "Six instruments en direct, en palier à 3 000 ft, cap 270",
      ),
      scene: "bi.level",
      controls: ["bank"],
      prompt: L(
        "Turn right onto heading 360 at standard rate",
        "Virez à droite au cap 360 au taux standard",
      ),
      goal: [GOAL.heading(360, 5), GOAL.alt(2900, 3100)],
      holdS: 5,
      success: L(
        "Heading 360 held: wing on the mark, then rolled out on time.",
        "Cap 360 tenu : l’aile sur le repère, puis sortie au bon moment.",
      ),
      hint: L(
        "Wing on the mark, then wait: 30 seconds for 90°.",
        "L’aile sur le repère, puis attendez : 30 secondes pour 90°.",
      ),
      notes: L(
        "The whole scan at work: turn coordinator for the rate, heading indicator for the roll-out. « Réessayer » puts the same start back.",
        "Tout le circuit visuel en action : l’indicateur de virage pour le taux, le conservateur de cap pour la sortie. « Réessayer » remet le même départ.",
      ),
    }),
    // 10 ------------------------------------------------------------------ flight in the simulator
    simFlightStep({
      id: "bi-fly",
      title: L(
        "Fly it in the simulator: all six at once",
        "Dans le simulateur : les six à la fois",
      ),
      brief: L(
        "Level at 3,000 ft, heading 270, 100 kt. Turn left onto **180** at standard rate and hold 3,000 ft.",
        "En palier à 3 000 ft, cap 270, 100 kt. Virez à gauche au **180** au taux standard et tenez 3 000 ft.",
      ),
      scene: "bi.fly",
      alt: L(
        "The simulator's cockpit, level at 3,000 ft, heading 270",
        "Le cockpit du simulateur, en palier à 3 000 ft, cap 270",
      ),
      prompt: L(
        "Turn left onto heading 180 and hold 3,000 ft",
        "Virez à gauche au cap 180 et tenez 3 000 ft",
      ),
      goal: [GOAL.heading(180, 10), GOAL.alt(2850, 3150)],
      holdS: 10,
      durationS: 180,
      success: L(
        "Heading 180 and 3,000 ft held 10 seconds.",
        "Cap 180 et 3 000 ft tenus 10 secondes.",
      ),
      source: easaFirst(
        L(
          "FAA AFH ch. 3 · level turns",
          "FAA AFH ch. 3 · virages en palier",
        ),
      ),
      notes: L(
        "To show it first: « Ouvrir le simulateur » opens the cockpit on this situation, « Reprendre le cours » comes back here.",
        "Pour le montrer d’abord : « Ouvrir le simulateur » ouvre le cockpit sur cette situation, « Reprendre le cours » revient ici.",
      ),
    }),
  ];
  return course(
    {
      id: BASIC_INSTRUMENTS_ID,
      title: L(
        "The basic instruments in 10 slides",
        "Les instruments de base en 10 diapos",
      ),
      summary: L(
        "Airspeed, attitude, altitude, vertical speed, heading, turn and ball: each one moving, two hands-on, one question, one flight.",
        "Vitesse, assiette, altitude, vario, cap, virage et bille : chacun en mouvement, deux prises en main, une question, un vol.",
      ),
      cockpit: "steam",
      theme: "classroom",
      tags: ["ppl", "instruments"],
    },
    steps,
    scenes(),
  );
}
