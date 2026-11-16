// Ready-to-teach deck (IR): « L'ILS de bout en bout ». The localizer and its sensitivity, the glide path and how to
// read the index, the student rejoins the glide on the slide, 300 ft per NM and 5 × the ground speed, the decision
// altitude, the go-around; three questions; the approach flown in the simulator to the DA.
// Sources: FAA-H-8083-15 IFH ch. 9 (ILS: localizer about 4 times as sensitive as a VOR, full scale about 2.5°;
// 3° glide slope, about 300 ft per NM, descent rate about 5 × the ground speed) and ch. 10 (decision altitude,
// missed approach); EASA Air OPS / ICAO Annex 6 (CAT I: DH not below 200 ft); 14 CFR 91.175 (visual references at
// the DA); Cessna 172S POH section 4 (balked landing: full throttle). Runway 27 of Port Ardent: elevation 420 ft,
// threshold crossing height 50 ft (nav/data.ts), so DA 620 ft is 200 ft above the runway.
import type { Course, MotionScript } from "../../types";
import { G as GOAL, course } from "../kit";
import {
  L,
  SIX,
  coverStep,
  diagramStep,
  gauge,
  ideaStep,
  quizStep,
  recapStep,
  simFlightStep,
  sit,
  yourTurnStep,
} from "./kit";

export const ILS_DECK_ID = "sample-deck-ils-end-to-end";

// NAV1 (the HSI) and NAV2 (the CDI) both on the ILS 27, so every instrument of the deck shows the localizer and the
// glide path.
const ILS = { nav2: "IPRD", obs2: 270 };
const scenes = () => ({
  "il.final": sit("il.final", "ils27", "ILS 27 PARD · 5 NM · on the localizer and the glide", ILS),
  // 400 ft above the path at 5 NM: about 2 dots high
  "il.high": sit("il.high", "ils27", "ILS 27 PARD · 5 NM · 400 ft above the glide", { ...ILS, altFt: 2460 }),
  "il.fly": sit("il.fly", "ils27", "ILS 27 PARD · 5 NM · on the localizer and the glide", ILS),
});

/** The glide index above, then below: the index shows where the path is. */
const ABOVE_BELOW: MotionScript = {
  duration: 56,
  tracks: {
    gs: [
      [0, 0],
      [4, 0],
      [12, 0.5],
      [18, 0.5],
      [26, 0],
      [30, 0],
      [38, -0.5],
      [44, -0.5],
      [52, 0],
      [56, 0],
    ],
    cdi: [[0, 0]],
    ias: [[0, 90]],
    rpm: [[0, 1950]],
  },
  telling: 15,
  marks: [
    {
      id: "below",
      channel: "gs",
      value: 0.48,
      label: L("Index up: you are below", "Index en haut : vous êtes dessous"),
    },
    {
      id: "above",
      channel: "gs",
      value: -0.48,
      label: L("Index down: you are above", "Index en bas : vous êtes dessus"),
    },
  ],
};

// The last two miles of the ILS 27 of Port Ardent, then the go-around. Starts 2 NM before the threshold (DME 3.65:
// the DME sits at the localizer, 1.65 NM past the threshold) on the path (1,109 ft), descends at about 485 ft/min
// (90 KIAS) to the DA, 620 ft, reached after 60.6 s; full throttle, the nose up, a climb at about 700 ft/min.
// Heights are keyed (relative to the situation's 2,060 ft) so the glide index shows the real deviation.
const LAST_MILES = {
  hdg: [[0, 0]] as [number, number][],
  cdi: [[0, 0]] as [number, number][],
  alt: [
    [0, -951],
    [60.6, -1440],
    [63, -1436],
    [70, -1380],
    [84, -1220],
  ] as [number, number][],
  ias: [
    [0, 90],
    [60.6, 90],
    [66, 80],
    [76, 74],
    [84, 74],
  ] as [number, number][],
  rpm: [
    [0, 1950],
    [60.6, 1950],
    [62.5, 2550],
    [84, 2550],
  ] as [number, number][],
};
const MINIMA: MotionScript = {
  duration: 84,
  hdgRef: "course",
  startDme: 3.65,
  tracks: LAST_MILES,
  telling: 61,
  marks: [
    {
      id: "da",
      t: 60.6,
      label: L("DA 620 ft: decide", "DA 620 ft : on décide"),
    },
  ],
};
const GO_AROUND: MotionScript = {
  duration: 84,
  hdgRef: "course",
  startDme: 3.65,
  tracks: LAST_MILES,
  telling: 76,
  marks: [
    { id: "da", t: 60.6, label: L("DA: nothing in sight", "DA : rien en vue") },
    {
      id: "toga",
      t: 64,
      label: L("Full power, nose up", "Plein gaz, nez en haut"),
    },
    { id: "climb", t: 76, label: L("Climbing", "On monte") },
  ],
};

export function ilsEndToEndCourse(): Course {
  const IFH9 = L("FAA IFH ch. 9 · ILS", "FAA IFH ch. 9 · ILS");
  const IFH10 = L(
    "FAA IFH ch. 10 · decision altitude, missed approach",
    "FAA IFH ch. 10 · altitude de décision, remise de gaz",
  );
  const steps = [
    // 1 ------------------------------------------------------------------ cover
    coverStep({
      id: "il-cover",
      eyebrow: L("Approaches · IR", "Approches · IR"),
      title: L("The ILS from end to end", "L’ILS de bout en bout"),
      sub: L(
        "Localizer, glide path, minima, go-around",
        "Localizer, glide, minima, remise de gaz",
      ),
      lead: L(
        "Two needles to centre, one altitude to respect, one decision to take.",
        "Deux aiguilles à centrer, une altitude à respecter, une décision à prendre.",
      ),
      source: L("FAA IFH ch. 9 and 10", "FAA IFH ch. 9 et 10"),
      view: gauge("cdi"),
      alt: L(
        "CDI on the ILS 27: the glide index settles on the centre",
        "CDI sur l’ILS 27 : l’index du glide se centre",
      ),
      scene: "il.final",
      motion: { preset: "ils-glide" },
      notes: L(
        "The approach of runway 27 at Port Ardent, flown from 5 NM to the decision altitude. In IMC: ceiling 800 ft.",
        "L’approche de la piste 27 de Port Ardent, de 5 NM jusqu’à l’altitude de décision. En IMC : plafond 800 ft.",
      ),
    }),
    // 2 ------------------------------------------------------------------ the localizer
    ideaStep({
      id: "il-loc",
      eyebrow: L("1 · Localizer", "1 · Localizer"),
      title: L(
        "The localizer: the runway centreline",
        "Le localizer : l’axe de la piste",
      ),
      lines: [
        {
          text: L(
            "Full scale about **2.5°**: 4 times a VOR",
            "Pleine échelle environ **2,5°** : 4 fois un VOR",
          ),
        },
        {
          text: L(
            "**The bar moves**: start the turn onto the course",
            "**La barre bouge** : on commence le virage vers l’axe",
          ),
          dot: { g: "hsi", moment: "move" },
        },
        {
          text: L(
            "Then corrections of **2 to 5°** only",
            "Ensuite, des corrections de **2 à 5°** seulement",
          ),
        },
      ],
      source: IFH9,
      view: gauge("hsi"),
      alt: L(
        "HSI: a 30° intercept of the localizer 27",
        "HSI : interception à 30° du localizer 27",
      ),
      scene: "il.final",
      motion: { preset: "loc-capture" },
      notes: L(
        "Same gesture as the VOR, four times as fast. Live: « Piloter la démonstration », Cap a few degrees, watch the bar.",
        "Même geste qu’au VOR, quatre fois plus vif. En direct : « Piloter la démonstration », quelques degrés de Cap, regardez la barre.",
      ),
    }),
    // 3 ------------------------------------------------------------------ question: small corrections
    quizStep({
      id: "il-quiz-loc",
      title: L(
        "On the localizer, the bar drifts right. What do you do?",
        "Sur le localizer, la barre part à droite. Que faites-vous ?",
      ),
      options: [
        {
          text: L("Turn 2 to 5° to the right", "Virer de 2 à 5° à droite"),
          why: L(
            "Yes: towards the bar, and small. The localizer is 4 times as sensitive as a VOR.",
            "Oui : vers la barre, et peu. Le localizer est 4 fois plus sensible qu’un VOR.",
          ),
        },
        {
          text: L("Turn 30° to the right", "Virer de 30° à droite"),
          why: L(
            "Far too much: the bar crosses the centre and you weave across the course.",
            "Beaucoup trop : la barre traverse le centre et vous zigzaguez autour de l’axe.",
          ),
        },
        {
          text: L("Wait, it will come back", "Attendre, elle reviendra"),
          why: L(
            "Without a correction the drift goes on: the wind keeps pushing.",
            "Sans correction la dérive continue : le vent pousse toujours.",
          ),
        },
      ],
      answer: 0,
      source: IFH9,
      view: gauge("hsi"),
      alt: L("HSI on the localizer 27", "HSI sur le localizer 27"),
      scene: "il.final",
      motion: { preset: "loc-capture" },
      notes: L(
        "Ask how many degrees before revealing. Most first answers are too big.",
        "Demandez combien de degrés avant de révéler. La plupart des premières réponses sont trop grandes.",
      ),
    }),
    // 4 ------------------------------------------------------------------ the glide path
    ideaStep({
      id: "il-glide",
      eyebrow: L("2 · Glide path", "2 · Glide"),
      title: L(
        "The glide path: a 3° slope to the runway",
        "Le glide : une pente de 3° vers la piste",
      ),
      lines: [
        {
          text: L(
            "The horizontal index shows the path",
            "L’index horizontal montre le plan",
          ),
        },
        {
          text: L(
            "**Centred**: on the path, about −480 ft/min at 90 kt",
            "**Centré** : sur le plan, environ −480 ft/min à 90 kt",
          ),
          dot: { g: "cdi", moment: "on" },
        },
        {
          text: L(
            "Pitch for the path, power for the speed",
            "L’assiette pour le plan, la puissance pour la vitesse",
          ),
        },
      ],
      source: IFH9,
      view: gauge("cdi"),
      alt: L(
        "CDI on the ILS 27: from above the path to the centre",
        "CDI sur l’ILS 27 : d’au-dessus du plan au centre",
      ),
      scene: "il.final",
      motion: { preset: "ils-glide" },
      notes: L(
        "Live: « Piloter la démonstration », Assiette down a little: the index comes up towards the centre.",
        "En direct : « Piloter la démonstration », un peu d’Assiette vers le bas : l’index remonte vers le centre.",
      ),
    }),
    // 5 ------------------------------------------------------------------ reading the index
    ideaStep({
      id: "il-index",
      eyebrow: L("2 · Glide path", "2 · Glide"),
      title: L(
        "The index shows the path: fly to it",
        "L’index montre le plan : on va vers lui",
      ),
      lines: [
        {
          text: L(
            "**Index up**: the path is above, you are low. Less descent",
            "**Index en haut** : le plan est au-dessus, vous êtes bas. Moins de descente",
          ),
          dot: { g: "cdi", moment: "below" },
        },
        {
          text: L(
            "**Index down**: you are high. A little more descent",
            "**Index en bas** : vous êtes haut. Un peu plus de descente",
          ),
          dot: { g: "cdi", at: [0.78, 0.78], moment: "above" },
        },
        {
          text: L(
            "Never climb back to a path from below near the ground",
            "Près du sol, on ne remonte jamais vers un plan par-dessous",
          ),
        },
      ],
      source: IFH9,
      view: gauge("cdi"),
      alt: L(
        "CDI: the glide index goes up, back to the centre, then down",
        "CDI : l’index du glide monte, revient au centre, puis descend",
      ),
      scene: "il.final",
      motion: { script: ABOVE_BELOW },
      notes: L(
        "Say it with the class: « the index is the path ». The aircraft is the centre of the instrument.",
        "Faites-le dire à la classe : « l’index, c’est le plan ». L’avion, c’est le centre de l’instrument.",
      ),
    }),
    // 6 ------------------------------------------------------------------ your turn: rejoin the glide
    yourTurnStep({
      id: "il-try",
      title: L(
        "You are high, rejoin the glide",
        "Vous êtes haut, rejoignez le glide",
      ),
      control: L(
        "**Pitch**: down for more descent, up for less. The speed is held for you.",
        "**Assiette** : vers le bas pour descendre plus, vers le haut pour moins. La vitesse est tenue pour vous.",
      ),
      rows: [
        {
          text: L(
            "Glide: index within half a dot, 8 s",
            "Glide : index à moins d’un demi-point, 8 s",
          ),
          check: 0,
          readout: "gsDots",
        },
        {
          text: L(
            "Localizer: within 2 dots",
            "Localizer : à moins de 2 points",
          ),
          check: 1,
          readout: "cdiDots",
        },
      ],
      tip: L(
        "A small change, then wait: about 2° of pitch down, back up when the index comes to the centre.",
        "Un petit changement, puis attendez : environ 2° d’assiette en moins, on remonte quand l’index arrive au centre.",
      ),
      source: IFH9,
      view: gauge("cdi"),
      alt: L(
        "Live CDI on the ILS 27, 400 ft above the glide",
        "CDI en direct sur l’ILS 27, 400 ft au-dessus du glide",
      ),
      scene: "il.high",
      controls: ["pitch"],
      assist: { holdIas: true },
      prompt: L(
        "Rejoin the glide path and hold it 8 seconds",
        "Rejoignez le glide et tenez-le 8 secondes",
      ),
      goal: [{ id: "gsDefl", p: { maxDots: 0.5 } }, GOAL.cdi(2)],
      holdS: 8,
      success: L(
        "On the glide: the index is centred, the descent is about 500 ft/min.",
        "Sur le glide : l’index est centré, la descente fait environ 500 ft/min.",
      ),
      hint: L(
        "Index down means you are high: pitch down a little.",
        "Index en bas : vous êtes haut, baissez un peu le nez.",
      ),
      notes: L(
        "Hand the controls to a student (« Donner les commandes à un élève »). The common error: too much pitch, the index shoots through the centre.",
        "Donnez les commandes à un élève (« Donner les commandes à un élève »). L’erreur classique : trop d’assiette, l’index traverse le centre.",
      ),
    }),
    // 7 ------------------------------------------------------------------ 300 ft per NM, 5 × the ground speed
    diagramStep({
      id: "il-profile",
      eyebrow: L("Checking the glide", "Vérifier le glide"),
      title: L(
        "300 ft per NM, 5 × the ground speed",
        "300 ft par NM, 5 × la vitesse sol",
      ),
      diagram: {
        d: {
          kind: "calc",
          calc: {
            kind: "profile",
            fromFt: 2060,
            toFt: 620,
            angleDeg: 3,
            gsKt: 90,
          },
        },
        alt: L(
          "The 3° path of the ILS 27, from 2,060 ft at 5 NM to the DA, 620 ft, at 90 kt",
          "Le plan à 3° de l’ILS 27, de 2 060 ft à 5 NM jusqu’à la DA, 620 ft, à 90 kt",
        ),
      },
      lines: [
        {
          text: L(
            "VSI: **5 × 90 kt ≈ 450** ft/min",
            "Vario : **5 × 90 kt ≈ 450** ft/min",
          ),
          dot: { g: "vsi", moment: "on" },
        },
        {
          text: L(
            "At 5 NM, about 1,600 ft above the runway",
            "À 5 NM, environ 1 600 ft au-dessus de la piste",
          ),
        },
      ],
      source: IFH9,
      g: "vsi",
      alt: L(
        "VSI on the glide path: about −480 ft/min",
        "Vario sur le glide : environ −480 ft/min",
      ),
      scene: "il.final",
      motion: { preset: "ils-glide" },
      notes: L(
        "A headwind lowers the ground speed, so the descent rate: 70 kt over the ground asks only about 350 ft/min.",
        "Un vent de face réduit la vitesse sol, donc le vario : 70 kt sol ne demandent qu’environ 350 ft/min.",
      ),
    }),
    // 8 ------------------------------------------------------------------ minima
    ideaStep({
      id: "il-minima",
      eyebrow: L("3 · Minima", "3 · Minima"),
      title: L(
        "The decision altitude: 200 ft above the runway",
        "L’altitude de décision : 200 ft au-dessus de la piste",
      ),
      lines: [
        {
          text: L(
            "**DA 620 ft** here: 420 ft of runway + 200 ft (CAT I)",
            "**DA 620 ft** ici : 420 ft de piste + 200 ft (CAT I)",
          ),
          dot: { g: "alt", moment: "da" },
        },
        {
          text: L(
            "At the DA, **runway or lights in sight**: continue",
            "À la DA, **piste ou rampe en vue** : on continue",
          ),
        },
        {
          text: L(
            "Nothing in sight: **go around**, at once",
            "Rien en vue : **remise de gaz**, tout de suite",
          ),
        },
      ],
      source: L(
        "FAA IFH ch. 10 · EASA Air OPS CAT I · 14 CFR 91.175",
        "FAA IFH ch. 10 · EASA Air OPS CAT I · 14 CFR 91.175",
      ),
      view: SIX,
      alt: L(
        "Six instruments: the last two miles of the ILS 27 down to the DA",
        "Six instruments : les deux derniers milles de l’ILS 27 jusqu’à la DA",
      ),
      scene: "il.final",
      motion: { script: MINIMA },
      notes: L(
        "Real time: one minute from 2 NM to the DA. Ask the class to say « décision » when the altimeter reads 620 ft.",
        "En temps réel : une minute de 2 NM à la DA. Demandez à la classe de dire « décision » quand l’altimètre lit 620 ft.",
      ),
    }),
    // 9 ------------------------------------------------------------------ question: at the DA
    quizStep({
      id: "il-quiz-da",
      title: L(
        "At the DA, no runway in sight. What do you do?",
        "À la DA, pas de piste en vue. Que faites-vous ?",
      ),
      options: [
        {
          text: L("Go around", "Remise de gaz"),
          why: L(
            "Yes: at once. The DA is a decision, not a target to hold.",
            "Oui : tout de suite. La DA est une décision, pas une altitude à tenir.",
          ),
        },
        {
          text: L("Descend 100 ft to see", "Descendre de 100 ft pour voir"),
          why: L(
            "Never: below the DA without the runway in sight, there is no protection from obstacles.",
            "Jamais : sous la DA sans la piste en vue, plus rien ne protège des obstacles.",
          ),
        },
        {
          text: L("Level off and wait", "Palier et attendre"),
          why: L(
            "No: the aircraft flies on towards the runway, too low to land and with nothing in sight.",
            "Non : l’avion continue vers la piste, trop bas pour se poser et sans rien voir.",
          ),
        },
      ],
      answer: 0,
      source: IFH10,
      view: gauge("alt"),
      alt: L(
        "Altimeter down to the DA, 620 ft",
        "Altimètre jusqu’à la DA, 620 ft",
      ),
      scene: "il.final",
      motion: { script: MINIMA },
      notes: L(
        "Everyone answers, nobody hesitates: this is the answer that must come without thinking.",
        "Tout le monde répond, personne n’hésite : c’est la réponse qui doit venir sans réfléchir.",
      ),
    }),
    // 10 ------------------------------------------------------------------ the go-around
    ideaStep({
      id: "il-go-around",
      eyebrow: L("4 · Go-around", "4 · Remise de gaz"),
      title: L(
        "The go-around: power, attitude, climb",
        "La remise de gaz : puissance, assiette, montée",
      ),
      lines: [
        {
          text: L(
            "**Full throttle**, the nose to the climb attitude",
            "**Plein gaz**, le nez sur l’assiette de montée",
          ),
          dot: { g: "ai", moment: "toga" },
        },
        {
          text: L(
            "**VSI positive**: the aircraft climbs, flaps up in steps",
            "**Vario positif** : l’avion monte, volets rentrés par étapes",
          ),
          dot: { g: "vsi", moment: "climb" },
        },
        {
          text: L(
            "Then the published missed approach",
            "Puis la procédure de remise de gaz publiée",
          ),
        },
      ],
      source: L(
        "C172S POH section 4 · balked landing · FAA IFH ch. 10",
        "POH C172S section 4 · remise de gaz · FAA IFH ch. 10",
      ),
      view: SIX,
      alt: L(
        "Six instruments: at the DA, full power and the climb",
        "Six instruments : à la DA, plein gaz et la montée",
      ),
      scene: "il.final",
      motion: { script: GO_AROUND },
      notes: L(
        "Watch the RPM and the attitude first, the VSI follows. In the console: « Rejouer l’animation » to see the moment again.",
        "Regardez d’abord le régime et l’assiette, le vario suit. Dans la console : « Rejouer l’animation » pour revoir le moment.",
      ),
    }),
    // 11 ------------------------------------------------------------------ question: descent rate
    quizStep({
      id: "il-quiz-vs",
      title: L(
        "90 kt over the ground on a 3° glide: what descent rate?",
        "90 kt de vitesse sol sur un glide à 3° : quel vario ?",
      ),
      options: [
        {
          text: L("300 ft/min", "300 ft/min"),
          why: L(
            "Too little: that fits about 60 kt over the ground.",
            "Trop peu : cela convient à environ 60 kt sol.",
          ),
        },
        {
          text: L("450 ft/min", "450 ft/min"),
          why: L(
            "Yes: 5 × 90 = 450, close to the 480 of the table.",
            "Oui : 5 × 90 = 450, proche des 480 du tableau.",
          ),
        },
        {
          text: L("700 ft/min", "700 ft/min"),
          why: L(
            "Too much: that is for about 140 kt; at 90 kt you would go below the path.",
            "Trop : c’est pour environ 140 kt ; à 90 kt vous passeriez sous le plan.",
          ),
        },
      ],
      answer: 1,
      source: IFH9,
      view: gauge("vsi"),
      alt: L("VSI on the glide path", "Vario sur le glide"),
      scene: "il.final",
      motion: { preset: "ils-glide" },
      notes: L(
        "Then ask the same with 30 kt of headwind (60 kt over the ground: 300 ft/min).",
        "Puis posez la même avec 30 kt de vent de face (60 kt sol : 300 ft/min).",
      ),
    }),
    // 12 ------------------------------------------------------------------ in the simulator
    simFlightStep({
      id: "il-fly",
      title: L(
        "In the simulator: the ILS 27 down to the DA",
        "Au simulateur : l’ILS 27 jusqu’à la DA",
      ),
      brief: L(
        "At 5 NM, on the localizer and the glide, 90 kt, in cloud. Keep both needles **within half scale** down to **620 ft**.",
        "À 5 NM, sur l’axe et le plan, 90 kt, dans les nuages. Gardez les deux aiguilles **à moins d’une demi-échelle** jusqu’à **620 ft**.",
      ),
      scene: "il.fly",
      alt: L(
        "The simulator's cockpit on the ILS 27 at 5 NM, in cloud",
        "Le cockpit du simulateur sur l’ILS 27 à 5 NM, dans les nuages",
      ),
      prompt: L(
        "Fly the ILS 27 within half scale down to the DA",
        "Volez l’ILS 27 à moins d’une demi-échelle jusqu’à la DA",
      ),
      goal: [GOAL.cdi(2.5), { id: "gsDefl", p: { maxDots: 2.5 } }],
      holdS: 60,
      durationS: 240,
      success: L(
        "Both needles within half scale for a minute: a stable approach.",
        "Les deux aiguilles à moins d’une demi-échelle pendant une minute : une approche stable.",
      ),
      source: IFH9,
      notes: L(
        "About three minutes. « Ouvrir le simulateur » shows it to the class first; « Reprendre le cours » comes back here.",
        "Environ trois minutes. « Ouvrir le simulateur » le montre d’abord à la classe ; « Reprendre le cours » revient ici.",
      ),
    }),
    // 13 ------------------------------------------------------------------ takeaways
    recapStep({
      id: "il-recap",
      title: L("Three numbers for the ILS", "Trois chiffres pour l’ILS"),
      cols: [
        [
          L("4 ×", "4 ×"),
          L(
            "the localizer against a VOR: corrections of 2 to 5°",
            "le localizer contre un VOR : corrections de 2 à 5°",
          ),
        ],
        [
          L("5 × GS", "5 × GS"),
          L(
            "the descent rate on a 3° glide, in ft/min",
            "le vario sur un glide à 3°, en ft/min",
          ),
        ],
        [
          L("200 ft", "200 ft"),
          L(
            "above the runway: the CAT I decision",
            "au-dessus de la piste : la décision en CAT I",
          ),
        ],
      ],
      source: L(
        "FAA IFH ch. 9 and 10 · EASA Air OPS",
        "FAA IFH ch. 9 et 10 · EASA Air OPS",
      ),
      scene: "il.final",
      notes: L(
        "Close on the decision: at the DA, either the runway is in sight or you go around.",
        "Terminez sur la décision : à la DA, soit la piste est en vue, soit on remet les gaz.",
      ),
    }),
  ];
  return course(
    {
      id: ILS_DECK_ID,
      title: L("The ILS from end to end", "L’ILS de bout en bout"),
      summary: L(
        "Localizer, glide path, 5 × the ground speed, the decision altitude and the go-around.",
        "Localizer, glide, 5 × la vitesse sol, l’altitude de décision et la remise de gaz.",
      ),
      cockpit: "steam",
      theme: "classroom",
      tags: ["ir", "ils", "approach"],
    },
    steps,
    scenes(),
  );
}
