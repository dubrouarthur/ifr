// Ready-to-teach deck (IR): « Le VOR : se situer et intercepter ». The student finds the radial with the OBS on the
// slide first, then sees TO / FROM over the station, the bar that ignores the heading, the sensitivity (1 dot = 2°,
// the 1 in 60 rule), the 30° intercept and the wind correction by bracketing; two questions; the intercept flown
// in the simulator.
// Sources: FAA-H-8083-15 IFH ch. 9 "Navigation Systems" (VOR orientation, TO / FROM, station passage, CDI full
// scale 10° with 2° a dot, intercepting at 30° to 45°, bracketing the wind); FAA AIM 1-1-3 (VOR); the 1 in 60 rule
// (1° off at 60 NM is 1 NM: IFH ch. 9 time and distance checks).
import type { Course, MotionScript } from "../../types";
import { G as GOAL, course } from "../kit";
import { VOR_INTERCEPT } from "../exampleSlides";
import {
  L,
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

export const VOR_DECK_ID = "sample-deck-vor-intercept";

const scenes = () => ({
  "vr.inbound": sit(
    "vr.inbound",
    "vor-inbound",
    "ARD R-090 inbound · course 270",
  ),
  "vr.obs": sit("vr.obs", "vor-inbound", "ARD R-090 · OBS 220", {
    obs1: 220,
    obs2: 220,
  }),
  "vr.intercept": sit(
    "vr.intercept",
    "vor-intercept",
    "ARD R-100 · heading 300",
  ),
  "vr.fly": sit("vr.fly", "vor-intercept", "ARD R-100 · heading 300"),
});

/** On the 090 radial inbound, the aircraft turns 60° right and back: the bar stays centred, it shows the position. */
const ANY_HEADING: MotionScript = {
  duration: 56,
  hdgRef: "course",
  tracks: {
    turn: [
      [0, 0],
      [3, 3],
      [20, 3],
      [23, 0],
      [28, 0],
      [31, -3],
      [48, -3],
      [51, 0],
      [56, 0],
    ],
    cdi: [[0, 0]],
    vs: [[0, 0]],
    ias: [[0, 100]],
  },
  telling: 24,
  marks: [
    {
      id: "turned",
      t: 24,
      label: L("Heading 330: still centred", "Cap 330 : toujours centrée"),
    },
    {
      id: "back",
      t: 53,
      label: L("Heading 270: nothing moved", "Cap 270 : rien n’a bougé"),
    },
  ],
};

/** The bar leaves the centre: one dot is 2°, two and a half dots 5°. */
const SENSITIVITY: MotionScript = {
  duration: 34,
  hdgRef: "course",
  tracks: {
    cdi: [
      [0, 0],
      [4, 0],
      [12, 0.2],
      [18, 0.2],
      [26, 0.5],
      [34, 0.5],
    ],
    hdg: [[0, 0]],
    vs: [[0, 0]],
    ias: [[0, 100]],
  },
  telling: 30,
  marks: [
    {
      id: "one",
      channel: "cdi",
      value: 0.19,
      label: L("One dot: 2°", "Un point : 2°"),
    },
    {
      id: "five",
      channel: "cdi",
      value: 0.49,
      label: L("Two and a half dots: 5°", "Deux points et demi : 5°"),
    },
  ],
};

/** The wind pushes the aircraft left of the course: 20° towards the bar, then half of it holds the course. */
const BRACKET: MotionScript = {
  duration: 46,
  hdgRef: "course",
  tracks: {
    cdi: [
      [0, 0],
      [4, 0],
      [14, 0.3],
      [17, 0.3],
      [28, 0],
      [46, 0],
    ],
    hdg: [
      [0, 0],
      [14, 0],
      [17, 20],
      [26, 20],
      [30, 10],
      [46, 10],
    ],
    vs: [[0, 0]],
    ias: [[0, 100]],
  },
  telling: 40,
  marks: [
    {
      id: "off",
      t: 14,
      label: L(
        "Bar to the right: 20° towards it",
        "Barre à droite : 20° vers elle",
      ),
    },
    {
      id: "half",
      t: 30,
      label: L("Centred: keep half, 10°", "Centrée : on garde la moitié, 10°"),
    },
    {
      id: "held",
      t: 42,
      label: L("10° holds the course", "10° tiennent la route"),
    },
  ],
};

export function vorInterceptCourse(): Course {
  const IFH9 = L("FAA IFH ch. 9 · VOR", "FAA IFH ch. 9 · VOR");
  const steps = [
    // 1 ------------------------------------------------------------------ cover
    coverStep({
      id: "vr-cover",
      eyebrow: L("Radio navigation · IR", "Radionavigation · IR"),
      title: L(
        "The VOR: where am I, and how to join",
        "Le VOR : se situer et intercepter",
      ),
      sub: L(
        "The OBS, the bar and the intercept heading",
        "L’OBS, la barre et le cap d’interception",
      ),
      lead: L(
        "Find your radial, pick a heading, join the course and hold it in the wind.",
        "Trouver son radial, choisir un cap, rejoindre la route et la tenir dans le vent.",
      ),
      source: IFH9,
      view: gauge("hsi"),
      alt: L(
        "HSI: a 30° intercept of the 270 course to ARD",
        "HSI : interception à 30° de la route 270 vers ARD",
      ),
      scene: "vr.intercept",
      motion: { script: VOR_INTERCEPT },
      notes: L(
        "The HSI joins the course in a loop. Tell the class: in twelve slides they will do it themselves in the simulator.",
        "Le HSI rejoint la route en boucle. Dites à la classe : dans douze diapos, ils le feront eux-mêmes au simulateur.",
      ),
    }),
    // 2 ------------------------------------------------------------------ goals
    goalsStep({
      id: "vr-goals",
      items: [
        L(
          "Find your radial with the OBS in under 30 s",
          "Trouver son radial avec l’OBS en moins de 30 s",
        ),
        L(
          "Intercept a course at 30°, bar within 1 dot",
          "Intercepter une route à 30°, barre à moins d’1 point",
        ),
        L(
          "Correct the wind by bracketing: 20°, then 10°",
          "Corriger le vent en encadrant : 20°, puis 10°",
        ),
      ],
      source: L(
        "FAA IFH ch. 9 · EASA Part-FCL IR",
        "FAA IFH ch. 9 · EASA Part-FCL IR",
      ),
      view: gauge("cdi"),
      alt: L(
        "CDI: TO, then the flag goes over the station, then FROM",
        "CDI : TO, puis le drapeau disparaît à la verticale, puis FROM",
      ),
      scene: "vr.inbound",
      motion: { preset: "vor-cross" },
      notes: L(
        "Three goals; the first one comes now, on the next slide, before any theory.",
        "Trois objectifs ; le premier arrive tout de suite, sur la diapo suivante, avant toute théorie.",
      ),
    }),
    // 3 ------------------------------------------------------------------ your turn: the OBS
    yourTurnStep({
      id: "vr-obs-try",
      title: L(
        "Where are you? Centre the bar",
        "Où êtes-vous ? Centrez la barre",
      ),
      control: L(
        "**OBS**: turn the knob, or − and +. The course is read at the top of the HSI.",
        "**OBS** : tournez le bouton, ou − et +. La route se lit en haut du HSI.",
      ),
      rows: [
        {
          text: L(
            "Bar centred, within half a dot",
            "Barre centrée, à moins d’un demi-point",
          ),
          check: 1,
          readout: "cdiDots",
        },
        {
          text: L("With a TO flag", "Avec l’indicateur TO"),
          check: 0,
          readout: "toFrom",
        },
      ],
      tip: L(
        "The course you read goes TO the station. Its opposite is your radial.",
        "La route lue mène VERS la station. Son inverse est votre radial.",
      ),
      source: L(
        "FAA IFH ch. 9 · VOR orientation",
        "FAA IFH ch. 9 · orientation VOR",
      ),
      view: gauge("hsi"),
      alt: L(
        "Live HSI east of ARD, OBS on 220",
        "HSI en direct à l’est d’ARD, OBS sur 220",
      ),
      scene: "vr.obs",
      controls: ["obs1"],
      prompt: L(
        "Centre the bar with a TO flag",
        "Centrez la barre avec l’indicateur TO",
      ),
      goal: [GOAL.toFrom("TO"), GOAL.cdi(0.5)],
      holdS: 2,
      success: L(
        "Course 270 TO ARD: you are on the 090 radial, east of the station.",
        "Route 270 vers ARD : vous êtes sur le radial 090, à l’est de la station.",
      ),
      hint: L(
        "Turn the OBS slowly towards the bar.",
        "Tournez l’OBS doucement vers la barre.",
      ),
      notes: L(
        "Let each student try on their own screen, or hand the controls to one (« Donner les commandes à un élève »). Ask: which radial? (090).",
        "Laissez chacun essayer sur son écran, ou donnez les commandes à un élève (« Donner les commandes à un élève »). Demandez : quel radial ? (le 090).",
      ),
    }),
    // 4 ------------------------------------------------------------------ TO / FROM
    ideaStep({
      id: "vr-tofrom",
      eyebrow: L("TO and FROM", "TO et FROM"),
      title: L(
        "TO before the station, FROM after",
        "TO avant la station, FROM après",
      ),
      lines: [
        {
          text: L(
            "**TO**: flying the course takes you to the station",
            "**TO** : en suivant la route, on va vers la station",
          ),
          dot: { g: "cdi", moment: "to" },
        },
        {
          text: L(
            "Overhead, the flag goes: the cone of confusion",
            "À la verticale, le drapeau disparaît : le cône de silence",
          ),
          dot: { g: "cdi", at: [0.78, -0.78], moment: "over" },
        },
        {
          text: L(
            "**FROM**: the station is behind, the DME counts up",
            "**FROM** : la station est derrière, la DME augmente",
          ),
          dot: { g: "cdi", at: [0.78, 0.78], moment: "from" },
        },
      ],
      source: L(
        "FAA IFH ch. 9 · station passage",
        "FAA IFH ch. 9 · passage de la station",
      ),
      view: gauge("cdi"),
      alt: L(
        "CDI over ARD: TO, the flag goes, FROM",
        "CDI au-dessus d’ARD : TO, le drapeau disparaît, FROM",
      ),
      scene: "vr.inbound",
      motion: { preset: "vor-cross" },
      notes: L(
        "Real time: the aircraft is 0.9 NM from ARD at 100 kt. The flag tells where the station is, never where the nose points.",
        "En temps réel : l’avion est à 0,9 NM d’ARD à 100 kt. L’indicateur dit où est la station, jamais où pointe le nez.",
      ),
    }),
    // 5 ------------------------------------------------------------------ the bar ignores the heading
    ideaStep({
      id: "vr-heading",
      eyebrow: L("Reading the bar", "Lire la barre"),
      title: L(
        "The bar shows where you are, not where you point",
        "La barre dit où vous êtes, pas où vous pointez",
      ),
      lines: [
        {
          text: L(
            "The aircraft turns 60° right: the bar stays centred",
            "L’avion vire de 60° à droite : la barre reste centrée",
          ),
          dot: { g: "hsi", moment: "turned" },
        },
        {
          text: L(
            "Back on 270: nothing has moved",
            "Retour au 270 : rien n’a bougé",
          ),
          dot: { g: "hsi", at: [0.78, 0.78], moment: "back" },
        },
        {
          text: L(
            "Only a change of position moves the bar",
            "Seul un changement de position fait bouger la barre",
          ),
        },
      ],
      source: IFH9,
      view: gauge("hsi"),
      alt: L(
        "HSI on the 090 radial: the card turns, the bar stays centred",
        "HSI sur le radial 090 : la rose tourne, la barre reste centrée",
      ),
      scene: "vr.inbound",
      motion: { script: ANY_HEADING },
      notes: L(
        "The most common trap in VOR flying. Live check: « Piloter la démonstration », change Cap: the card turns, the bar waits.",
        "Le piège le plus courant au VOR. Vérification en direct : « Piloter la démonstration », changez le Cap : la rose tourne, la barre attend.",
      ),
    }),
    // 6 ------------------------------------------------------------------ question: which radial?
    quizStep({
      id: "vr-quiz-radial",
      title: L(
        "OBS 270, TO, bar centred. Which radial are you on?",
        "OBS 270, TO, barre centrée. Sur quel radial êtes-vous ?",
      ),
      options: [
        {
          text: L("R-270", "R-270"),
          why: L(
            "No: 270 is the course TO the station. The radial goes FROM it.",
            "Non : 270 est la route VERS la station. Le radial part D’ELLE.",
          ),
        },
        {
          text: L("R-090", "R-090"),
          why: L(
            "Yes: the opposite of the TO course. You are east of the station, flying west to it.",
            "Oui : l’inverse de la route TO. Vous êtes à l’est de la station, en route vers l’ouest.",
          ),
        },
        {
          text: L("R-180", "R-180"),
          why: L(
            "No: that radial is south of the station; its TO course would be 360.",
            "Non : ce radial est au sud ; sa route TO serait 360.",
          ),
        },
      ],
      answer: 1,
      source: L(
        "FAA IFH ch. 9 · VOR orientation",
        "FAA IFH ch. 9 · orientation VOR",
      ),
      view: gauge("hsi"),
      alt: L(
        "HSI on OBS 270, TO, centred, the aircraft turning",
        "HSI sur l’OBS 270, TO, barre centrée, l’avion en virage",
      ),
      scene: "vr.inbound",
      motion: { script: ANY_HEADING },
      notes: L(
        "Ask for the answer aloud first. Students who choose R-270 have mixed the course and the radial: show the slide before again.",
        "Demandez la réponse à voix haute d’abord. Ceux qui choisissent R-270 confondent route et radial : remontrez la diapo précédente.",
      ),
    }),
    // 7 ------------------------------------------------------------------ sensitivity, 1 in 60
    diagramStep({
      id: "vr-sens",
      eyebrow: L("Sensitivity", "Sensibilité"),
      title: L(
        "One dot is 2°: at 30 NM, about 1 NM",
        "Un point vaut 2° : à 30 NM, environ 1 NM",
      ),
      diagram: {
        d: {
          kind: "calc",
          calc: { kind: "sixtyToOne", course: 270, flownNm: 30, offNm: 1 },
        },
        alt: L(
          "The 1 in 60 rule: 1 NM off after 30 NM is 2°",
          "La règle du 1 sur 60 : 1 NM d’écart après 30 NM font 2°",
        ),
      },
      lines: [
        {
          text: L(
            "Full scale is 10°: **one dot, 2°**",
            "Pleine échelle 10° : **un point, 2°**",
          ),
          dot: { g: "cdi", moment: "one" },
        },
        {
          text: L(
            "2.5 dots: **5°**, close to the edge",
            "2,5 points : **5°**, près du bord",
          ),
          dot: { g: "cdi", at: [0.78, 0.78], moment: "five" },
        },
      ],
      source: L(
        "FAA IFH ch. 9 · CDI · the 1 in 60 rule",
        "FAA IFH ch. 9 · CDI · règle du 1 sur 60",
      ),
      g: "cdi",
      alt: L(
        "CDI: the bar moves one dot, then two and a half",
        "CDI : la barre s’écarte d’un point, puis de deux et demi",
      ),
      scene: "vr.inbound",
      motion: { script: SENSITIVITY },
      notes: L(
        "Closer to the station, the same dot is fewer metres: at 6 NM one dot is only 0.2 NM. The bar gets livelier near the VOR.",
        "Plus près de la station, le même point fait moins de mètres : à 6 NM, un point ne fait que 0,2 NM. La barre s’agite près du VOR.",
      ),
    }),
    // 8 ------------------------------------------------------------------ the intercept
    ideaStep({
      id: "vr-intercept",
      eyebrow: L("Intercepting", "Interception"),
      title: L(
        "A 30° intercept: turn when the bar moves",
        "Interception à 30° : on tourne quand la barre bouge",
      ),
      lines: [
        {
          text: L(
            "Set the course, then a heading 30° towards the bar",
            "Affichez la route, puis un cap à 30° vers la barre",
          ),
        },
        {
          text: L(
            "**The bar moves**: start the turn onto the course",
            "**La barre bouge** : on commence le virage vers la route",
          ),
          dot: { g: "hsi", moment: "move" },
        },
        {
          text: L(
            "Centred: heading 270, on the course",
            "Centrée : cap 270, sur la route",
          ),
          dot: { g: "hsi", at: [0.78, 0.78], moment: "on" },
        },
      ],
      source: L(
        "FAA IFH ch. 9 · intercepting a course",
        "FAA IFH ch. 9 · interception d’une route",
      ),
      view: gauge("hsi"),
      alt: L(
        "HSI: a 30° intercept of the 270 course to ARD",
        "HSI : interception à 30° de la route 270 vers ARD",
      ),
      scene: "vr.intercept",
      motion: { script: VOR_INTERCEPT },
      notes: L(
        "Pause when the bar starts to move (« Pause » on the instrument): that is the moment to turn. Then « Reprendre ».",
        "Mettez en pause quand la barre commence à bouger (« Pause » sur l’instrument) : c’est le moment de tourner. Puis « Reprendre ».",
      ),
    }),
    // 9 ------------------------------------------------------------------ question: intercept heading
    quizStep({
      id: "vr-quiz-hdg",
      title: L(
        "On R-100, you want the 270 course to ARD. Heading for a 30° intercept?",
        "Sur le R-100, vous voulez la route 270 vers ARD. Quel cap pour intercepter à 30° ?",
      ),
      options: [
        {
          text: L("240", "240"),
          why: L(
            "That takes you away: R-100 is south of the course, the course is to your right.",
            "Cela vous éloigne : le R-100 est au sud de la route, la route est à votre droite.",
          ),
        },
        {
          text: L("300", "300"),
          why: L(
            "Yes: the course 270 plus 30° towards it. The bar is to the right, so is the turn.",
            "Oui : la route 270 plus 30° vers elle. La barre est à droite, le virage aussi.",
          ),
        },
        {
          text: L("330", "330"),
          why: L(
            "A 60° intercept: it works far out, but you overshoot near the station.",
            "Une interception à 60° : possible loin, mais on dépasse la route près de la station.",
          ),
        },
      ],
      answer: 1,
      source: L(
        "FAA IFH ch. 9 · intercepting a course",
        "FAA IFH ch. 9 · interception d’une route",
      ),
      view: gauge("hsi"),
      alt: L(
        "HSI: heading 300, the bar comes in from the right",
        "HSI : cap 300, la barre arrive par la droite",
      ),
      scene: "vr.intercept",
      motion: { script: VOR_INTERCEPT },
      notes: L(
        "Draw it on the board if needed: station, the 090 radial, the aircraft just south of it.",
        "Dessinez-le au tableau si besoin : la station, le radial 090, l’avion juste au sud.",
      ),
    }),
    // 10 ------------------------------------------------------------------ the wind: bracketing
    ideaStep({
      id: "vr-bracket",
      eyebrow: L("The wind", "Le vent"),
      title: L(
        "Bracket the wind: 20°, then half",
        "Encadrer le vent : 20°, puis la moitié",
      ),
      lines: [
        {
          text: L(
            "The bar drifts right: turn **20° towards it**",
            "La barre dérive à droite : **20° vers elle**",
          ),
          dot: { g: "hsi", moment: "off" },
        },
        {
          text: L(
            "Centred again: keep **half**, 10°",
            "De nouveau centrée : on garde **la moitié**, 10°",
          ),
          dot: { g: "hsi", at: [0.78, -0.78], moment: "half" },
        },
        {
          text: L(
            "It stays centred: 10° is the wind correction",
            "Elle reste centrée : 10° est la correction de vent",
          ),
          dot: { g: "hsi", at: [0.78, 0.78], moment: "held" },
        },
      ],
      source: L("FAA IFH ch. 9 · bracketing", "FAA IFH ch. 9 · encadrement"),
      view: gauge("hsi"),
      alt: L(
        "HSI: the bar drifts right, 20° of correction, then 10° holds it",
        "HSI : la barre dérive à droite, 20° de correction, puis 10° la tiennent",
      ),
      scene: "vr.inbound",
      motion: { script: BRACKET },
      notes: L(
        "Live, with a real wind: « Piloter la démonstration » has no wind control; open the simulator (« Ouvrir le simulateur ») to fly it in wind.",
        "En direct, avec un vrai vent : la démonstration n’a pas de réglage de vent ; ouvrez le simulateur (« Ouvrir le simulateur ») pour le voler dans le vent.",
      ),
    }),
    // 11 ------------------------------------------------------------------ in the simulator
    simFlightStep({
      id: "vr-fly",
      title: L(
        "In the simulator: intercept the 270 to ARD",
        "Au simulateur : interceptez la route 270 vers ARD",
      ),
      brief: L(
        "On R-100 at 10 NM, heading 300, OBS on 270. Hold 300 until the bar moves, turn onto 270, keep it **within 1 dot**.",
        "Sur le R-100 à 10 NM, cap 300, OBS sur 270. Gardez 300 jusqu’à ce que la barre bouge, virez au 270, tenez-la **à moins d’1 point**.",
      ),
      scene: "vr.fly",
      alt: L(
        "The simulator's cockpit on the 100 radial of ARD, heading 300",
        "Le cockpit du simulateur sur le radial 100 d’ARD, cap 300",
      ),
      prompt: L(
        "Intercept the 270 course to ARD and hold it",
        "Interceptez la route 270 vers ARD et tenez-la",
      ),
      goal: [GOAL.cdi(1), GOAL.heading(270, 15)],
      holdS: 20,
      durationS: 300,
      success: L(
        "On the 270 course to ARD, bar within 1 dot for 20 s.",
        "Sur la route 270 vers ARD, barre à moins d’1 point pendant 20 s.",
      ),
      source: L(
        "FAA IFH ch. 9 · intercepting a course",
        "FAA IFH ch. 9 · interception d’une route",
      ),
      notes: L(
        "About three minutes. To show it to the class first: « Ouvrir le simulateur », fly it, then « Reprendre le cours ».",
        "Environ trois minutes. Pour le montrer à la classe d’abord : « Ouvrir le simulateur », volez-le, puis « Reprendre le cours ».",
      ),
    }),
    // 12 ------------------------------------------------------------------ takeaways
    recapStep({
      id: "vr-recap",
      title: L("Three numbers for the VOR", "Trois chiffres pour le VOR"),
      cols: [
        [
          L("TO ↔ R", "TO ↔ R"),
          L(
            "the radial is the opposite of the TO course",
            "le radial est l’inverse de la route TO",
          ),
        ],
        [
          L("2°", "2°"),
          L(
            "one dot of the CDI: 1 NM at 30 NM",
            "un point du CDI : 1 NM à 30 NM",
          ),
        ],
        [
          L("30°", "30°"),
          L(
            "the intercept; then bracket the wind by halves",
            "l’interception ; puis on encadre le vent par moitiés",
          ),
        ],
      ],
      source: IFH9,
      scene: "vr.inbound",
      notes: L(
        "Before they leave: each student says their radial from a new OBS setting you give.",
        "Avant de partir : chaque élève donne son radial pour un réglage d’OBS que vous lui donnez.",
      ),
    }),
  ];
  return course(
    {
      id: VOR_DECK_ID,
      title: L(
        "The VOR: where am I, and how to join",
        "Le VOR : se situer et intercepter",
      ),
      summary: L(
        "Find your radial with the OBS, TO / FROM, 2° a dot, the 30° intercept and bracketing the wind.",
        "Trouver son radial à l’OBS, TO / FROM, 2° par point, l’interception à 30° et l’encadrement du vent.",
      ),
      cockpit: "steam",
      theme: "classroom",
      tags: ["ir", "vor", "radionav"],
    },
    steps,
    scenes(),
  );
}
