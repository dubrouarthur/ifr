// Ground school — crafted briefings for the attitude-flying lessons: standard-rate turns (bai-turns), unusual
// attitude recovery (bai-unusual) and partial panel with the compass and timed turns (pp-compass).
// Sources: FAA-H-8083-15B Instrument Flying Handbook (IFH) ch. 6–7 (attitude instrument flying, turns, unusual
// attitudes, partial panel, compass turns); FAA-H-8083-25 PHAK ch. 8 (magnetic compass errors); FAA-S-ACS-8C
// Instrument Rating ACS area IV (flight by reference to instruments) and area VII; C172S POH section 2 (limits).
import type { Briefing, SimScene, Step } from "../../types";
import { scene } from "../kit";
import {
  DIAGRAM,
  G as GC,
  GAUGE,
  INST,
  L,
  S,
  briefing,
  compareStep,
  coverStep,
  flyStep,
  formulaStep,
  heroGauge,
  heroStep,
  instrumentStep,
  mcq,
  mistakesStep,
  quizStep,
  readyStep,
  whyStep,
  yourTurnStep,
} from "./kit";

export const TURNS_BRIEFING_ID = "sample-briefing-bai-turns";
export const UNUSUAL_BRIEFING_ID = "sample-briefing-bai-unusual";
export const COMPASS_BRIEFING_ID = "sample-briefing-pp-compass";

/** The practice area of every Stage 1 lesson (curriculum.ts OPEN: 18 NM south-south-east of Port Ardent). */
const AREA = { fix: "PARD", radial: 160, distNm: 18 };

// ================================================================== bai-turns
function turnsScenes(): Record<string, SimScene> {
  return {
    "turns.left": scene(
      "turns.left",
      { pos: AREA, altFt: 4000, hdg: 330, iasKt: 95, bank: -15 },
      { label: "Standard-rate left turn · 4,000 ft · 95 KIAS" },
    ),
    "turns.start": scene(
      "turns.start",
      { pos: AREA, altFt: 4000, hdg: 360, iasKt: 95 },
      { label: "Heading 360 · 4,000 ft · 95 KIAS" },
    ),
  };
}

export function turnsBriefing(): Briefing {
  const steps: Step[] = [
    coverStep(
      "bt-cover",
      L("Briefing: standard-rate turns", "Briefing : virages au taux standard"),
      {
        eyebrow: L(
          "Lesson briefing · Attitude flying",
          "Briefing de leçon · Pilotage aux instruments",
        ),
        main: L("Standard-rate turns", "Virages au taux standard"),
        sub: L(
          "3° per second, altitude held",
          "3° par seconde, altitude tenue",
        ),
        lead: L(
          "Three turns to headings: bank from your speed, roll out on time.",
          "Trois virages vers des caps : l’inclinaison selon la vitesse, la sortie à temps.",
        ),
        meta: L(
          "About 5 min · hand-flown · FAA IFH ch. 7",
          "Environ 5 min · pilotage manuel · FAA IFH ch. 7",
        ),
        hero: [
          heroGauge(
            "bt-cover.tc",
            "tc",
            L(
              "Turn coordinator in a standard-rate left turn",
              "Indicateur de virage au taux standard à gauche",
            ),
            "turns.left",
          ),
        ],
        scene: "turns.left",
        reader: L(
          "The briefing of the standard-rate turns lesson: why 3° per second, how much bank, when to roll out, then three turns to headings at 4,000 ft.",
          "Le briefing de la leçon virages au taux standard : pourquoi 3° par seconde, quelle inclinaison, quand sortir, puis trois virages vers des caps à 4 000 ft.",
        ),
      },
    ),
    whyStep("bt-why", {
      eyebrow: L("Why it matters", "Pourquoi c’est important"),
      title: L(
        "The rate every procedure is drawn for",
        "Le taux de toutes les procédures",
      ),
      n: S("3"),
      nW: 136,
      unit: L("°/s", "°/s"),
      statement: L(
        "a full circle in two minutes",
        "un tour complet en deux minutes",
      ),
      body: L(
        "Holds, procedure turns and timed turns all assume it.",
        "Attentes, virages conventionnels et virages chronométrés le supposent tous.",
      ),
      sideTitle: L("Time it", "Chronométrez"),
      side: [
        {
          n: L("30 s", "30 s"),
          text: L("90° of turn", "90° de virage"),
          color: "key",
        },
        { n: L("60 s", "60 s"), text: L("180° of turn", "180° de virage") },
        {
          n: L("2 min", "2 min"),
          text: L("a full 360°", "un tour complet"),
          color: "text",
        },
      ],
      foot: L("FAA IFH ch. 7 · FAA AIM 5-3-8", "FAA IFH ch. 7 · FAA AIM 5-3-8"),
      reader: L(
        "A standard-rate turn is 3° per second: 90° in 30 s, 180° in 60 s, 360° in 2 minutes. Holding patterns, procedure turns and timed partial-panel turns all assume it (FAA IFH ch. 7; holding turns, FAA AIM 5-3-8).",
        "Un virage au taux standard, c’est 3° par seconde : 90° en 30 s, 180° en 60 s, 360° en 2 minutes. Attentes, virages conventionnels et virages chronométrés en panneau partiel le supposent tous (FAA IFH ch. 7 ; virages d’attente, FAA AIM 5-3-8).",
      ),
    }),
    quizStep("bt-quiz", {
      eyebrow: L("Question", "Question"),
      title: L("Check your numbers", "Vérifiez vos chiffres"),
      visual: [
        DIAGRAM(
          "bt-quiz.hold",
          { kind: "hold", inbound: 270, turn: "R", fix: "ARD", quiet: true },
          L("A holding pattern: two 180° turns joined by two legs", "Un circuit d’attente : deux virages de 180° reliés par deux branches"),
          GC.left,
          312,
          768,
          672,
          { caption: L("Each end of a hold: 180° at standard rate.", "Chaque bout d’attente : 180° au taux standard.") },
        ),
      ],
      quiz: mcq(
        L("How long is one end turn?", "Combien dure un virage d’extrémité ?"),
        [
          {
            text: L("30 s", "30 s"),
            why: L(
              "30 s is 90°: this turn is 180°.",
              "30 s, c’est 90° : ce virage fait 180°.",
            ),
          },
          {
            text: L("60 s", "60 s"),
            why: L("Right: 180° at 3°/s.", "Juste : 180° à 3°/s."),
          },
          {
            text: L("2 min", "2 min"),
            why: L(
              "2 minutes is a full circle.",
              "2 minutes, c’est un tour complet.",
            ),
          },
        ],
        1,
        L(
          "180° ÷ 3°/s = 60 s. Start the timer as you roll in.",
          "180° ÷ 3°/s = 60 s. Lancez le chrono en inclinant.",
        ),
      ),
      foot: L("FAA IFH ch. 7", "FAA IFH ch. 7"),
      reader: L(
        "Each end of a holding pattern is a 180° turn: at 3° per second, 60 seconds. The lesson's second turn, 270 to 090, is the same 180°.",
        "Chaque extrémité d’un circuit d’attente est un virage de 180° : à 3° par seconde, 60 secondes. Le deuxième virage de la leçon, du 270 au 090, fait les mêmes 180°.",
      ),
    }),
    instrumentStep("bt-tc", {
      eyebrow: L("The instrument", "L’instrument"),
      title: L(
        "The turn coordinator shows the rate",
        "L’indicateur de virage montre le taux",
      ),
      lead: L(
        "Left turn, 15° of bank, 95 KIAS.",
        "Virage à gauche, 15° d’inclinaison, 95 KIAS.",
      ),
      gauge: "tc",
      alt: L(
        "Turn coordinator: wing on the left index, ball centred",
        "Indicateur de virage : aile sur le repère gauche, bille centrée",
      ),
      scene: "turns.left",
      marks: [
        [-0.95, 0.62],
        [0.52, 0.66],
      ],
      rows: [
        {
          heading: L("Wing on the index", "Aile sur le repère"),
          body: L(
            "3°/s: the 2-minute turn, whatever the bank.",
            "3°/s : le tour en 2 minutes, quelle que soit l’inclinaison.",
          ),
        },
        {
          heading: L("Ball in the middle", "Bille au milieu"),
          body: L(
            "Coordinated: step on the ball if it slides.",
            "Coordonné : pied du côté de la bille si elle glisse.",
          ),
        },
      ],
      foot: L(
        "FAA IFH ch. 5 and 7 · rate, not bank",
        "FAA IFH ch. 5 et 7 · le taux, pas l’inclinaison",
      ),
      reader: L(
        "The turn coordinator shows the rate of turn, not the bank: with the wing tip on the index mark you turn at 3° per second. The ball shows coordination: step on the ball to centre it (FAA IFH ch. 5 and 7).",
        "L’indicateur de virage montre le taux de virage, pas l’inclinaison : l’aile sur le repère, vous virez à 3° par seconde. La bille montre la symétrie : pied du côté de la bille pour la centrer (FAA IFH ch. 5 et 7).",
      ),
    }),
    formulaStep("bt-bank", {
      eyebrow: L("How much bank", "Quelle inclinaison"),
      title: L(
        "Bank from your true airspeed",
        "L’inclinaison d’après la vitesse propre",
      ),
      visual: [
        INST(
          GAUGE("ai"),
          L("Attitude indicator: 15° of left bank, level pitch", "Horizon artificiel : 15° d’inclinaison à gauche, assiette nulle"),
          272,
          368,
          592,
          592,
          { id: "bt-bank.ai", scene: "turns.left" },
        ),
      ],
      formula: L("{bank} ≈ [{TAS}/10] + 7", "{inclinaison} ≈ [{Vp}/10] + 7"),
      units: L(
        "bank in degrees · TAS in knots",
        "inclinaison en degrés · Vp en nœuds",
      ),
      lines: [
        L("TAS | ≈ 95 × 1.08 ≈ !103 kt!", "Vp | ≈ 95 × 1,08 ≈ !103 kt!"),
        L("bank | ≈ 10 + 7 ≈ !17°!", "inclinaison | ≈ 10 + 7 ≈ !17°!"),
        L(
          "lead | ≈ ½ × bank ≈ !8°!",
          "anticipation | ≈ ½ × inclinaison ≈ !8°!",
        ),
      ],
      after: L(
        "Set about 15°, then match the wing to the index.",
        "Prenez environ 15°, puis calez l’aile sur le repère.",
      ),
      foot: L(
        "FAA IFH ch. 7 · TAS ≈ IAS + 2 % per 1,000 ft (4,000 ft: × 1.08) · ISA: 101 KTAS, exactly 15.5°",
        "FAA IFH ch. 7 · Vp ≈ Vi + 2 % par 1 000 ft (4 000 ft : × 1,08) · ISA : 101 kt, exactement 15,5°",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "bank (°) ≈ TAS (kt) ÷ 10 + 7",
            "inclinaison (°) ≈ Vp (kt) ÷ 10 + 7",
          ),
          ruleOfThumb: L(
            "95 KIAS at 4,000 ft is about 101 KTAS: about 15–17° of bank. Lead the roll-out by half the bank, about 8°.",
            "95 KIAS à 4 000 ft font environ 101 kt de vitesse propre : environ 15 à 17° d’inclinaison. Anticipez la sortie de la moitié de l’inclinaison, environ 8°.",
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 7" }],
        },
      ],
    }),
    yourTurnStep("bt-try", {
      eyebrow: L("Your turn", "À vous"),
      title: L("Roll in, hold it, roll out", "Inclinez, tenez, sortez"),
      rows: [
        {
          heading: L("Roll in to 15°", "Inclinez à 15°"),
          small: L(
            "look at the attitude indicator",
            "regardez l’horizon artificiel",
          ),
        },
        {
          heading: L("Wing on the index", "Aile sur le repère"),
          small: L(
            "trim the bank on the turn coordinator",
            "ajustez l’inclinaison sur l’indicateur de virage",
          ),
        },
        {
          heading: L("Back pressure", "Tirez un peu"),
          small: L(
            "about +½° of pitch holds the altitude",
            "environ +½° d’assiette tient l’altitude",
          ),
        },
        {
          heading: L("Roll out 8° early", "Sortez 8° avant"),
          small: L(
            "half the bank before the heading",
            "la moitié de l’inclinaison avant le cap",
          ),
        },
      ],
      view: { kind: "six" },
      alt: L(
        "The six-pack, heading 360, 4,000 ft",
        "Les six instruments, cap 360, 4 000 ft",
      ),
      scene: "turns.start",
      prompt: L(
        "Your turn: turn right to heading 090",
        "À vous : virez à droite au cap 090",
      ),
      controls: ["bank"],
      goal: {
        all: [{ id: "heading", p: { value: 90, tol: 10 } }],
        holdS: 3,
        graded: false,
        success: L(
          "Rolled out on 090: 30 s for 90°.",
          "Sorti au 090 : 30 s pour 90°.",
        ),
      },
      hint: L(
        "Hold the R side of the bank pad.",
        "Maintenez le côté R des boutons d’inclinaison.",
      ),
      frame: [1000, 296, 800, 600],
      foot: L(
        "FAA IFH ch. 7 · load factor at 15°: 1.04 g",
        "FAA IFH ch. 7 · facteur de charge à 15° : 1,04 g",
      ),
      reader: L(
        "Roll in to about 15° on the attitude indicator, put the wing of the turn coordinator on the index, add a little back pressure (about half a degree of pitch: the load factor is 1.04 g), and start the roll-out about 8° before the heading. Your turn: turn right from 360 to 090 on the six-pack.",
        "Inclinez à environ 15° sur l’horizon artificiel, calez l’aile de l’indicateur de virage sur le repère, tirez un peu (environ un demi-degré d’assiette : le facteur de charge vaut 1,04 g), et commencez la sortie environ 8° avant le cap. À vous : virez à droite du 360 au 090 sur les six instruments.",
      ),
    }),
    mistakesStep("bt-errors", {
      title: L("What the grader catches", "Ce que l’évaluation détecte"),
      rows: [
        {
          error: L("Too much bank", "Trop d’inclinaison"),
          why: L(
            "Past 30° the lesson flags it, and the nose drops.",
            "Au-delà de 30°, la leçon le signale et le nez descend.",
          ),
          fix: L(
            "15°, and the wing on the index.",
            "15°, et l’aile sur le repère.",
          ),
        },
        {
          error: L(
            "Altitude lost in the roll-in",
            "Altitude perdue à la mise en virage",
          ),
          why: L(
            "Lift tilts with the wing: you sink without back pressure.",
            "La portance s’incline avec l’aile : sans tirer, vous descendez.",
          ),
          fix: L(
            "A touch of back pressure as you roll.",
            "Un peu de pression arrière en inclinant.",
          ),
        },
        {
          error: L("Late roll-out", "Sortie tardive"),
          why: L(
            "Rolling out on the heading overshoots it by the lead.",
            "Sortir sur le cap le dépasse de l’anticipation.",
          ),
          fix: L(
            "Start 8° early; ±10° passes.",
            "Commencez 8° avant ; ±10° passe.",
          ),
        },
      ],
      foot: L(
        "Lesson standards · FAA IFH ch. 7",
        "Critères de la leçon · FAA IFH ch. 7",
      ),
      reader: L(
        "Common mistakes: over-banking (more than 30° fails the lesson), losing altitude in the roll-in (lift tilts with the wing: add back pressure), and rolling out late (start the roll-out about half the bank before the heading).",
        "Erreurs fréquentes : trop d’inclinaison (plus de 30° fait échouer la leçon), perdre de l’altitude à la mise en virage (la portance s’incline : tirez un peu), et sortir trop tard (commencez la sortie environ la moitié de l’inclinaison avant le cap).",
      ),
    }),
    readyStep("bt-ready", {
      objectives: [
        L(
          "Bank for standard rate, about 15°",
          "Incliner au taux standard, environ 15°",
        ),
        L(
          "Hold the altitude with back pressure",
          "Tenir l’altitude en tirant un peu",
        ),
        L(
          "Lead each roll-out by about 8°",
          "Anticiper chaque sortie d’environ 8°",
        ),
      ],
      standards: [
        { n: L("±100 ft", "±100 ft"), text: L("altitude", "altitude") },
        { n: L("±10°", "±10°"), text: L("roll-out heading", "cap de sortie") },
        {
          n: L("≤ 30°", "≤ 30°"),
          text: L("bank", "inclinaison"),
          color: "stop",
        },
        {
          n: L("3°/s", "3°/s"),
          text: L("wing on the index", "aile sur le repère"),
          color: "nav",
        },
      ],
      tip: L(
        "360 → 270 left (30 s) · 270 → 090 right (60 s) · 090 → 360 left (30 s) · 4,000 ft.",
        "360 → 270 à gauche (30 s) · 270 → 090 à droite (60 s) · 090 → 360 à gauche (30 s) · 4 000 ft.",
      ),
      reader: L(
        "Standards: altitude ±100 ft, roll-out ±10°, bank 30° or less. The turns: 360 to 270 left, 270 to 090 right, 090 to 360 left, at 4,000 ft.",
        "Critères : altitude ±100 ft, sortie ±10°, inclinaison 30° au plus. Les virages : 360 vers 270 à gauche, 270 vers 090 à droite, 090 vers 360 à gauche, à 4 000 ft.",
      ),
    }),
    flyStep(
      "bt-fly",
      "bai-turns",
      L(
        "Fly the lesson: standard-rate turns",
        "Volez la leçon : virages au taux standard",
      ),
      L(
        "Three standard-rate turns at 4,000 ft and 95 KIAS: left to 270, right to 090, left to 360.",
        "Trois virages au taux standard à 4 000 ft et 95 KIAS : à gauche au 270, à droite au 090, à gauche au 360.",
      ),
      [
        L(
          "About 15° of bank, wing on the index.",
          "Environ 15° d’inclinaison, aile sur le repère.",
        ),
        L("Roll out 8° before the heading.", "Sortez 8° avant le cap."),
      ],
      5,
      ["turbulence"],
    ),
  ];
  return briefing(
    {
      id: TURNS_BRIEFING_ID,
      exerciseId: "bai-turns",
      title: L(
        "Briefing: standard-rate turns",
        "Briefing : virages au taux standard",
      ),
      summary: L(
        "The briefing of the standard-rate turns lesson: 3° per second, the bank from your speed, the roll-out lead, then fly it.",
        "Le briefing de la leçon virages au taux standard : 3° par seconde, l’inclinaison selon la vitesse, l’anticipation de sortie, puis le vol.",
      ),
      tags: ["ifr", "attitude", "turns"],
      minutes: 5,
    },
    steps,
    turnsScenes(),
  );
}

// ================================================================== bai-unusual
function unusualScenes(): Record<string, SimScene> {
  return {
    "ua.high": scene(
      "ua.high",
      { pos: AREA, altFt: 5000, hdg: 45, iasKt: 72, pitch: 22, bank: -35, vsFpm: 1200 },
      { label: "Nose high: +22° pitch, 35° left bank, 72 KIAS" },
    ),
    "ua.low": scene(
      "ua.low",
      { pos: AREA, altFt: 4600, hdg: 120, iasKt: 125, pitch: -18, bank: 55, vsFpm: -2000 },
      { label: "Nose low: −18° pitch, 55° right bank, 125 KIAS" },
    ),
  };
}

export function unusualBriefing(): Briefing {
  const steps: Step[] = [
    coverStep("bu-cover", L("Briefing: unusual attitude recovery", "Briefing : sortie des positions inusuelles"), {
      eyebrow: L("Lesson briefing · Attitude flying", "Briefing de leçon · Pilotage aux instruments"),
      main: L("Unusual attitudes", "Positions inusuelles"),
      sub: L("Recognise first, then recover", "Reconnaître d’abord, puis rattraper"),
      lead: L(
        "Two attitudes: read the airspeed and the altimeter, then recover in the right order.",
        "Deux positions : lisez la vitesse et l’altimètre, puis rattrapez dans le bon ordre.",
      ),
      meta: L("About 4 min · hand-flown · FAA IFH ch. 7", "Environ 4 min · pilotage manuel · FAA IFH ch. 7"),
      hero: [
        heroGauge(
          "bu-cover.ai",
          "ai",
          L("Attitude indicator nose high, 35° of left bank", "Horizon artificiel nez haut, 35° d’inclinaison à gauche"),
          "ua.high",
        ),
      ],
      scene: "ua.high",
      reader: L(
        "The briefing of the unusual attitude lesson: recognise nose high or nose low from the airspeed and the altimeter, then recover in the order the FAA teaches, without a stall and without exceeding VNE.",
        "Le briefing de la leçon positions inusuelles : reconnaître nez haut ou nez bas d’après la vitesse et l’altimètre, puis rattraper dans l’ordre enseigné par la FAA, sans décrocher et sans dépasser la VNE.",
      ),
    }),
    whyStep("bu-why", {
      eyebrow: L("Why it matters", "Pourquoi c’est important"),
      title: L("In cloud, your inner ear lies", "Dans les nuages, l’oreille interne ment"),
      n: L("#1", "N°1"),
      nW: 256,
      color: "stop",
      statement: L("cause of fatal general-aviation accidents", "cause d’accidents mortels en aviation générale"),
      body: L(
        "Loss of control in flight. The instruments tell the truth: recover by them.",
        "La perte de contrôle en vol. Les instruments disent vrai : rattrapez sur eux.",
      ),
      sideTitle: L("The limits · C172S", "Les limites · C172S"),
      side: [
        { n: L("163 kt", "163 kt"), text: L("VNE: never exceed", "VNE : à ne jamais dépasser"), color: "stop" },
        { n: L("129 kt", "129 kt"), text: L("VNO: top of the green arc", "VNO : haut de l’arc vert"), color: "key" },
        { n: L("48 kt", "48 kt"), text: L("VS1: stall, flaps up", "VS1 : décrochage, volets rentrés"), color: "text" },
      ],
      foot: L(
        "FAA fact sheet on loss of control · C172S POH sec. 2 · KIAS",
        "FAA, fiche sur la perte de contrôle · C172S POH sec. 2 · KIAS",
      ),
      reader: L(
        "Loss of control in flight is the first cause of fatal general-aviation accidents (FAA). In cloud the vestibular sense gives false sensations: recover by the instruments. C172S limits: VNE 163 KIAS, VNO 129 KIAS, stall 48 KIAS flaps up (POH section 2).",
        "La perte de contrôle en vol est la première cause d’accidents mortels en aviation générale (FAA). En nuage, l’oreille interne donne de fausses sensations : rattrapez sur les instruments. Limites du C172S : VNE 163 KIAS, VNO 129 KIAS, décrochage 48 KIAS volets rentrés (POH section 2).",
      ),
    }),
    quizStep("bu-quiz", {
      eyebrow: L("Question", "Question"),
      title: L("The attitude indicator is covered", "L’horizon artificiel est masqué"),
      visual: [
        INST(
          { kind: "six" },
          L("Six-pack with the attitude indicator covered: 72 KIAS, climbing 1,200 ft/min", "Six instruments, horizon masqué : 72 KIAS, montée à 1 200 ft/min"),
          GC.left,
          312,
          768,
          576,
          { id: "bu-quiz.six", scene: "ua.high", covers: ["ai"] },
        ),
      ],
      quiz: mcq(
        L("Speed low and falling, climbing. You are…", "Vitesse faible qui baisse, en montée. Vous êtes…"),
        [
          { text: L("Nose-high attitude", "Assiette nez haut"), why: L("Right: slow and climbing is nose high.", "Juste : lent et en montée, c’est nez haut.") },
          { text: L("Nose-low attitude", "Assiette nez bas"), why: L("Nose low is fast and descending.", "Nez bas, c’est rapide et en descente.") },
          { text: L("Level, steady", "Palier stabilisé"), why: L("Level holds the speed and the altitude.", "En palier, vitesse et altitude restent stables.") },
        ],
        0,
        L("Airspeed decreasing and altimeter increasing: nose high.", "Vitesse qui diminue et altimètre qui monte : nez haut."),
      ),
      foot: L("FAA IFH ch. 7", "FAA IFH ch. 7"),
      reader: L(
        "With the attitude indicator lost, read the trend: airspeed decreasing and altitude increasing is nose high; airspeed increasing and altitude decreasing is nose low (FAA IFH ch. 7).",
        "Sans horizon, lisez la tendance : vitesse qui diminue et altitude qui augmente, c’est nez haut ; vitesse qui augmente et altitude qui diminue, c’est nez bas (FAA IFH ch. 7).",
      ),
    }),
    compareStep("bu-recover", {
      eyebrow: L("The recovery", "La sortie"),
      title: L("Two attitudes, two orders", "Deux positions, deux ordres"),
      halves: [
        {
          eyebrow: L("Nose high · slow", "Nez haut · lent"),
          color: "key",
          view: GAUGE("ai"),
          alt: L("Attitude indicator nose high, left bank", "Horizon artificiel nez haut, inclinaison à gauche"),
          scene: "ua.high",
          rows: [
            { heading: L("Power full", "Plein gaz"), small: L("speed first", "la vitesse d’abord") },
            { heading: L("Nose down", "Nez en bas"), small: L("to the horizon", "jusqu’à l’horizon") },
            { heading: L("Wings level", "Ailes à plat"), small: L("then trim", "puis compensez") },
          ],
          body: L("72 KIAS and falling: the stall is close.", "72 KIAS et ça baisse : le décrochage est proche."),
        },
        {
          eyebrow: L("Nose low · fast", "Nez bas · rapide"),
          color: "stop",
          view: GAUGE("ai"),
          alt: L("Attitude indicator nose low, 55° of right bank", "Horizon artificiel nez bas, 55° d’inclinaison à droite"),
          scene: "ua.low",
          rows: [
            { heading: L("Power idle", "Réduisez"), small: L("stop the speed", "stoppez la vitesse") },
            { heading: L("Wings level", "Ailes à plat"), small: L("before you pull", "avant de tirer") },
            { heading: L("Nose up", "Nez en haut"), small: L("gently, to level", "doucement, en palier") },
          ],
          body: L("125 KIAS and rising, 55° of bank: a spiral.", "125 KIAS et ça monte, 55° d’inclinaison : une spirale."),
        },
      ],
      foot: L("FAA IFH ch. 7 · recovery from unusual attitudes", "FAA IFH ch. 7 · sortie des positions inusuelles"),
      reader: L(
        "Nose high (airspeed decreasing): add power, lower the nose to the horizon, level the wings. Nose low (airspeed increasing): reduce power, level the wings with coordinated aileron and rudder, then raise the nose smoothly to level flight (FAA IFH ch. 7).",
        "Nez haut (vitesse qui diminue) : mettez la puissance, ramenez le nez à l’horizon, mettez les ailes à plat. Nez bas (vitesse qui augmente) : réduisez, mettez les ailes à plat aux ailerons et au palonnier, puis ramenez doucement le nez en palier (FAA IFH ch. 7).",
      ),
    }),
    formulaStep("bu-load", {
      eyebrow: L("Why wings level first", "Pourquoi les ailes d’abord"),
      title: L("Pulling in a bank tightens the spiral", "Tirer incliné serre la spirale"),
      visual: [
        DIAGRAM(
          "bu-load.turn",
          { kind: "calc", calc: { kind: "turn", tasKt: 125, bankDeg: 55 } },
          L(
            "Turn at 125 kt and 55° of bank: about 12° per second on a radius near 1,000 ft",
            "Virage à 125 kt et 55° d’inclinaison : environ 12° par seconde, rayon proche de 1 000 ft",
          ),
          120,
          336,
          960,
          648,
        ),
      ],
      formula: L("{n} = [1/cos {bank}]", "{n} = [1/cos {inclinaison}]"),
      units: L("n: load factor in g", "n : facteur de charge en g"),
      lines: [
        L("55° | n = [1/0.57] ≈ !1.7 g!", "55° | n = [1/0,57] ≈ !1,7 g!"),
        L("stall | ≈ 48 × √1.7 ≈ !63 kt!", "décrochage | ≈ 48 × √1,7 ≈ !63 kt!"),
      ],
      after: L(
        "Level the wings: the pull then lifts the nose, not the turn.",
        "Ailes à plat : la traction lève alors le nez, pas le virage.",
      ),
      foot: L("FAA PHAK ch. 5 (load factor) · stall speed grows with √n", "FAA PHAK ch. 5 (facteur de charge) · le décrochage croît avec √n"),
      reader: [
        {
          t: "formula",
          formula: L("n = 1 ÷ cos(bank); stall speed × √n", "n = 1 ÷ cos(inclinaison) ; vitesse de décrochage × √n"),
          ruleOfThumb: L(
            "At 55° of bank the load factor is 1.7 g and the stall speed rises from 48 to about 63 KIAS. Pulling while banked mostly tightens the turn: level the wings first (FAA PHAK ch. 5).",
            "À 55° d’inclinaison le facteur de charge vaut 1,7 g et la vitesse de décrochage passe de 48 à environ 63 KIAS. Tirer incliné serre surtout le virage : mettez d’abord les ailes à plat (FAA PHAK ch. 5).",
          ),
          refs: [{ src: "FAA-PHAK", ref: "ch. 5" }],
        },
      ],
    }),
    yourTurnStep("bu-try", {
      eyebrow: L("Your turn", "À vous"),
      title: L("Nose low and fast", "Nez bas et rapide"),
      rows: [
        { heading: L("Power idle", "Réduisez"), small: L("the throttle, at once", "la manette, tout de suite") },
        { heading: L("Wings level", "Ailes à plat"), small: L("on the attitude indicator", "sur l’horizon artificiel") },
        { heading: L("Ease the nose up", "Remontez le nez"), small: L("to the horizon, no more", "jusqu’à l’horizon, pas plus") },
        { heading: L("Power back", "Remettez la puissance"), small: L("cruise power, 95 KIAS", "puissance de croisière, 95 KIAS") },
      ],
      view: { kind: "six" },
      alt: L("Six-pack, nose low in a right spiral", "Six instruments, nez bas en spirale à droite"),
      scene: "ua.low",
      prompt: L("Your turn: level the wings first", "À vous : mettez d’abord les ailes à plat"),
      controls: ["bank"],
      assist: {},
      goal: {
        all: [{ id: "bankMax", p: { max: 10, holdS: 2 } }],
        holdS: 2,
        graded: false,
        success: L("Wings level: now ease the nose up.", "Ailes à plat : remontez le nez doucement."),
      },
      hint: L("Hold the L side of the bank pad.", "Maintenez le côté L des boutons d’inclinaison."),
      frame: [1000, 296, 800, 600],
      foot: L("FAA IFH ch. 7 · ACS IR.IV.B", "FAA IFH ch. 7 · ACS IR.IV.B"),
      reader: L(
        "Nose low and fast: power idle, wings level, then ease the nose up to the horizon and set cruise power. Your turn: on the six-pack, level the wings with the bank pad.",
        "Nez bas et rapide : réduisez, ailes à plat, puis remontez le nez jusqu’à l’horizon et remettez la puissance de croisière. À vous : sur les six instruments, mettez les ailes à plat avec les boutons d’inclinaison.",
      ),
    }),
    mistakesStep("bu-errors", {
      title: L("What goes wrong", "Ce qui tourne mal"),
      rows: [
        {
          error: L("Pulling in the bank", "Tirer en virage"),
          why: L("Nose low, the g rises and the spiral tightens.", "Nez bas, les g montent et la spirale se serre."),
          fix: L("Wings level, then pull.", "Ailes à plat, puis tirez."),
        },
        {
          error: L("Power left in", "Puissance laissée"),
          why: L("Nose low, VNE 163 KIAS comes in seconds.", "Nez bas, la VNE de 163 KIAS arrive en secondes."),
          fix: L("Throttle idle first.", "Réduisez d’abord."),
        },
        {
          error: L("Stalling the nose-high one", "Décrocher nez haut"),
          why: L("Holding the nose up at 72 KIAS and falling.", "Garder le nez haut à 72 KIAS qui baissent."),
          fix: L("Full power, nose down to the horizon.", "Plein gaz, nez à l’horizon."),
        },
      ],
      foot: L("Lesson standards · FAA IFH ch. 7", "Critères de la leçon · FAA IFH ch. 7"),
      reader: L(
        "Common mistakes: pulling while banked in the nose-low case (the load factor rises and the spiral tightens), leaving the power in (overspeed: VNE is 163 KIAS), and stalling the nose-high recovery by holding the nose up as the speed falls.",
        "Erreurs fréquentes : tirer incliné dans le cas nez bas (le facteur de charge monte et la spirale se serre), laisser la puissance (survitesse : la VNE est de 163 KIAS), et décrocher en sortie nez haut en gardant le nez haut quand la vitesse baisse.",
      ),
    }),
    readyStep("bu-ready", {
      objectives: [
        L("Read the airspeed and altimeter first", "Lire d’abord la vitesse et l’altimètre"),
        L("Nose high: power, nose down, wings level", "Nez haut : puissance, nez en bas, ailes à plat"),
        L("Nose low: idle, wings level, nose up", "Nez bas : réduire, ailes à plat, nez en haut"),
      ],
      standards: [
        { n: L("> 48 kt", "> 48 kt"), text: L("no stall", "pas de décrochage"), color: "nav" },
        { n: L("< 163", "< 163"), text: L("KIAS: below VNE", "KIAS : sous la VNE"), color: "stop" },
        { n: L("500 ft", "500 ft"), text: L("lost at most", "perdus au plus") },
        { n: L("2", "2"), text: L("attitudes", "positions") },
      ],
      tip: L(
        "First: nose high, 72 KIAS, 35° left bank · second: nose low, 125 KIAS, 55° right bank.",
        "D’abord : nez haut, 72 KIAS, 35° à gauche · ensuite : nez bas, 125 KIAS, 55° à droite.",
      ),
      reader: L(
        "Standards: no stall, no VNE exceedance, recover without losing more than about 500 ft below the entry altitude.",
        "Critères : pas de décrochage, pas de dépassement de la VNE, sortie sans perdre plus d’environ 500 ft sous l’altitude d’entrée.",
      ),
    }),
    flyStep(
      "bu-fly",
      "bai-unusual",
      L("Fly the lesson: unusual attitudes", "Volez la leçon : positions inusuelles"),
      L(
        "Two unusual attitudes to recover from at 5,000 ft: nose high, then nose low.",
        "Deux positions inusuelles à rattraper à 5 000 ft : nez haut, puis nez bas.",
      ),
      [
        L("Read the airspeed first.", "Lisez d’abord la vitesse."),
        L("Nose low: wings level before you pull.", "Nez bas : ailes à plat avant de tirer."),
      ],
      4,
    ),
  ];
  return briefing(
    {
      id: UNUSUAL_BRIEFING_ID,
      exerciseId: "bai-unusual",
      title: L("Briefing: unusual attitude recovery", "Briefing : sortie des positions inusuelles"),
      summary: L(
        "The briefing of the unusual attitude lesson: recognise nose high or low, the two recovery orders, why wings level first, then fly it.",
        "Le briefing de la leçon positions inusuelles : reconnaître nez haut ou bas, les deux ordres de sortie, pourquoi les ailes d’abord, puis le vol.",
      ),
      tags: ["ifr", "attitude", "unusual"],
      minutes: 4,
    },
    steps,
    unusualScenes(),
  );
}

// ================================================================== pp-compass
const PP_COVERS: ("ai" | "dg")[] = ["ai", "dg"];
function compassScenes(): Record<string, SimScene> {
  return {
    "pp.east": scene(
      "pp.east",
      { pos: AREA, altFt: 4000, hdg: 90, iasKt: 95 },
      { label: "Partial panel · heading 090 · 4,000 ft" },
    ),
    "pp.turn": scene(
      "pp.turn",
      { pos: AREA, altFt: 4000, hdg: 120, iasKt: 95, bank: 15 },
      { label: "Partial panel · timed right turn" },
    ),
  };
}

export function compassBriefing(): Briefing {
  const steps: Step[] = [
    coverStep("bp-cover", L("Briefing: partial panel", "Briefing : panneau partiel"), {
      eyebrow: L("Lesson briefing · Partial panel", "Briefing de leçon · Panneau partiel"),
      main: L("Partial panel", "Panneau partiel"),
      sub: L("The compass and the clock", "Le compas et le chrono"),
      lead: L(
        "Attitude and heading indicators are gone: time your turns, read the compass wings level.",
        "Horizon et conservateur de cap sont perdus : chronométrez vos virages, lisez le compas ailes à plat.",
      ),
      meta: L("About 8 min · hand-flown · FAA IFH ch. 7", "Environ 8 min · pilotage manuel · FAA IFH ch. 7"),
      hero: [
        INST(
          { kind: "six" },
          L("Six-pack with the attitude and heading indicators failed", "Six instruments, horizon et conservateur de cap en panne"),
          984,
          240,
          816,
          612,
          { id: "bp-cover.six", scene: "pp.east", covers: PP_COVERS },
        ),
      ],
      scene: "pp.east",
      reader: L(
        "The briefing of the partial-panel lesson: with the attitude and heading indicators failed, fly the turn coordinator, the airspeed and the altimeter, time your turns at standard rate and read the magnetic compass only wings level.",
        "Le briefing de la leçon panneau partiel : horizon et conservateur de cap en panne, pilotez sur l’indicateur de virage, l’anémomètre et l’altimètre, chronométrez vos virages au taux standard et ne lisez le compas qu’ailes à plat.",
      ),
    }),
    formulaStep("bp-time", {
      eyebrow: L("Timed turns", "Virages chronométrés"),
      title: L("No heading indicator: the clock steers", "Sans cap : le chrono dirige"),
      visual: [
        DIAGRAM(
          "bp-time.turn",
          { kind: "calc", calc: { kind: "turn", tasKt: 101, bankDeg: 15 } },
          L(
            "Standard-rate turn at 101 kt true airspeed: about 15° of bank, 3° per second",
            "Virage au taux standard à 101 kt de vitesse propre : environ 15° d’inclinaison, 3° par seconde",
          ),
          120,
          336,
          960,
          648,
        ),
      ],
      formula: L("{time} = [{turn}/3]", "{temps} = [{virage}/3]"),
      units: L("time in s · turn in ° · standard rate 3°/s", "temps en s · virage en ° · taux standard 3°/s"),
      lines: [
        L("090 → 180 | = [90/3] = !30 s!", "090 → 180 | = [90/3] = !30 s!"),
        L("180 → 360 | = [180/3] = !60 s!", "180 → 360 | = [180/3] = !60 s!"),
        L("360 → 270 | = [90/3] = !30 s!", "360 → 270 | = [90/3] = !30 s!"),
      ],
      after: L(
        "Start the timer as you roll in. Roll out on time, not on the compass.",
        "Lancez le chrono en inclinant. Sortez à l’heure, pas sur le compas.",
      ),
      foot: L("FAA IFH ch. 7 · timed turns", "FAA IFH ch. 7 · virages chronométrés"),
      reader: [
        {
          t: "formula",
          formula: L("time (s) = turn (°) ÷ 3", "temps (s) = virage (°) ÷ 3"),
          ruleOfThumb: L(
            "The lesson's turns: 090 to 180 right, 30 s; 180 to 360 left, 60 s; 360 to 270 left, 30 s. Start the timer as you roll in (FAA IFH ch. 7).",
            "Les virages de la leçon : 090 vers 180 à droite, 30 s ; 180 vers 360 à gauche, 60 s ; 360 vers 270 à gauche, 30 s. Lancez le chrono en inclinant (FAA IFH ch. 7).",
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 7" }],
        },
      ],
    }),
    yourTurnStep("bp-try", {
      eyebrow: L("Your turn", "À vous"),
      title: L("A timed turn, partial panel", "Un virage chronométré"),
      rows: [
        { heading: L("90° right: 30 s", "90° à droite : 30 s"), small: L("compute it before you roll", "calculez-le avant d’incliner") },
        { heading: L("Roll in, start the timer", "Inclinez, lancez le chrono"), small: L("T on the keyboard", "touche T") },
        { heading: L("Wing on the index", "Aile sur le repère"), small: L("the turn coordinator still works", "l’indicateur de virage fonctionne") },
        { heading: L("Roll out at 30 s", "Sortez à 30 s"), small: L("wait 5 s, then read the compass", "attendez 5 s, puis lisez le compas") },
      ],
      view: { kind: "six" },
      alt: L("Six-pack, partial panel, heading 090", "Six instruments, panneau partiel, cap 090"),
      scene: "pp.east",
      covers: PP_COVERS,
      prompt: L("Your turn: 30 s right at standard rate, then wings level", "À vous : 30 s à droite au taux standard, puis ailes à plat"),
      controls: ["bank"],
      goal: {
        all: [
          { id: "heading", p: { value: 180, tol: 15 } },
          { id: "bankMax", p: { max: 5 } },
        ],
        holdS: 3,
        graded: false,
        success: L("On 180 within 15°: the clock works.", "Au 180 à 15° près : le chrono fonctionne."),
      },
      hint: L("Hold the R side of the bank pad.", "Maintenez le côté R des boutons d’inclinaison."),
      frame: [1000, 296, 800, 600],
      foot: L("FAA IFH ch. 7 · ±15° passes partial panel", "FAA IFH ch. 7 · ±15° en panneau partiel"),
      reader: L(
        "A timed turn: compute the time (90° is 30 s), roll in to standard rate on the turn coordinator and start the timer together, roll out on time, wait for the compass to settle wings level, then correct the remainder. Your turn: from 090, turn right for 30 s with the heading indicator failed.",
        "Un virage chronométré : calculez le temps (90°, c’est 30 s), inclinez au taux standard sur l’indicateur de virage en lançant le chrono, sortez à l’heure, laissez le compas se stabiliser ailes à plat, puis corrigez le reste. À vous : depuis le 090, virez à droite pendant 30 s, conservateur de cap en panne.",
      ),
    }),
    heroStep("bp-compass", {
      eyebrow: L("The magnetic compass", "Le compas magnétique"),
      title: L("Why it lies in turns", "Pourquoi il ment en virage"),
      visual: [
        INST(
          { kind: "six" },
          L("Six-pack, partial panel, in a timed right turn", "Six instruments, panneau partiel, en virage chronométré à droite"),
          GC.left,
          312,
          880,
          660,
          { id: "bp-compass.six", scene: "pp.turn", covers: PP_COVERS },
        ),
      ],
      points: [
        {
          heading: L("Undershoot north", "Avant le nord"),
          body: L("Turning to north it lags: roll out about 47° early here.", "Vers le nord il retarde : sortez environ 47° avant, ici."),
          color: "sel",
        },
        {
          heading: L("Overshoot south", "Après le sud"),
          body: L("Turning to south it leads: roll out about 47° past.", "Vers le sud il avance : sortez environ 47° après."),
          color: "key",
        },
        {
          heading: L("Accelerate north", "Accélérer : nord"),
          body: L("On east or west, speeding up swings it north.", "Cap est ou ouest, accélérer le dévie vers le nord."),
          color: "nav",
        },
      ],
      foot: L(
        "FAA PHAK ch. 8 · UNOS and ANDS, northern hemisphere · error ≈ latitude, 47° at Port Ardent",
        "FAA PHAK ch. 8 · UNOS et ANDS, hémisphère nord · erreur ≈ latitude, 47° à Port Ardent",
      ),
      reader: L(
        "Magnetic dip makes the compass wrong in turns and when the speed changes. Northern hemisphere: undershoot north, overshoot south (UNOS), by about the latitude (about 47° at Port Ardent); on east or west headings, accelerate north, decelerate south (ANDS). That is why the clock gives the heading in a turn and the compass is read only wings level and at a steady speed (FAA PHAK ch. 8; FAA IFH ch. 7).",
        "L’inclinaison magnétique fausse le compas en virage et quand la vitesse change. Hémisphère nord : sortez avant le nord, après le sud (UNOS), d’environ la latitude (environ 47° à Port Ardent) ; cap est ou ouest, accélérer dévie vers le nord, décélérer vers le sud (ANDS). Voilà pourquoi le chrono donne le cap en virage, et le compas ne se lit qu’ailes à plat et à vitesse stable (FAA PHAK ch. 8 ; FAA IFH ch. 7).",
      ),
    }),
    quizStep("bp-quiz", {
      eyebrow: L("Question", "Question"),
      title: L("Turning to north", "Virage vers le nord"),
      quote: L(
        "Heading 270, turning right to 360, northern hemisphere, compass only.",
        "Cap 270, virage à droite vers le 360, hémisphère nord, compas seul.",
      ),
      quiz: mcq(
        L("You roll out when the compass shows…", "Vous sortez quand le compas indique…"),
        [
          { text: L("Before N", "Avant N"), why: L("Right: undershoot north, it lags.", "Juste : avant le nord, il retarde.") },
          { text: L("Exactly N", "N pile"), why: L("Then you overshoot: the card lags turning north.", "Vous dépassez : la rose retarde vers le nord.") },
          { text: L("After N", "Après N"), why: L("That is the rule for south, not north.", "C’est la règle du sud, pas du nord.") },
        ],
        0,
        L("UNOS: undershoot north, overshoot south. Better still, time it: 90° is 30 s.", "UNOS : avant le nord, après le sud. Mieux encore, chronométrez : 90° font 30 s."),
      ),
      foot: L("FAA PHAK ch. 8", "FAA PHAK ch. 8"),
      reader: L(
        "Turning to north in the northern hemisphere, the compass lags: roll out before it shows north (undershoot north). Better, time the turn.",
        "En virage vers le nord, dans l’hémisphère nord, le compas retarde : sortez avant qu’il indique le nord. Mieux, chronométrez le virage.",
      ),
    }),
    mistakesStep("bp-errors", {
      title: L("What the grader catches", "Ce que l’évaluation détecte"),
      rows: [
        {
          error: L("Rolling out on the compass", "Sortir sur le compas"),
          why: L("In the turn the card is wrong: the error lands in your heading.", "En virage la rose est fausse : l’erreur finit dans votre cap."),
          fix: L("Roll out on the clock.", "Sortez au chrono."),
        },
        {
          error: L("Bank creep", "Inclinaison qui dérive"),
          why: L("No attitude indicator: the bank grows past 20°.", "Sans horizon, l’inclinaison dépasse 20°."),
          fix: L("Wing on the turn coordinator index.", "Aile sur le repère du virage."),
        },
        {
          error: L("No timer", "Pas de chrono"),
          why: L("Without the clock there is no heading in the turn.", "Sans chrono, plus de cap en virage."),
          fix: L("T as you roll in, every time.", "T en inclinant, à chaque fois."),
        },
      ],
      foot: L("Lesson standards · FAA IFH ch. 7", "Critères de la leçon · FAA IFH ch. 7"),
      reader: L(
        "Common mistakes: rolling out on the compass reading during the turn, letting the bank creep with no attitude indicator, and forgetting to start the timer as you roll in.",
        "Erreurs fréquentes : sortir sur l’indication du compas pendant le virage, laisser l’inclinaison dériver sans horizon, et oublier de lancer le chrono en inclinant.",
      ),
    }),
    readyStep("bp-ready", {
      objectives: [
        L("Fly attitude on the turn coordinator", "Piloter sur l’indicateur de virage"),
        L("Time each turn: 30 s per 90°", "Chronométrer : 30 s pour 90°"),
        L("Read the compass wings level only", "Lire le compas ailes à plat seulement"),
      ],
      standards: [
        { n: L("±100 ft", "±100 ft"), text: L("altitude", "altitude") },
        { n: L("±15°", "±15°"), text: L("roll-out, partial panel", "sortie, panneau partiel") },
        { n: L("≤ 30°", "≤ 30°"), text: L("bank", "inclinaison"), color: "stop" },
        { n: L("30 s", "30 s"), text: L("per 90°", "pour 90°"), color: "nav" },
      ],
      tip: L(
        "090 → 180 right (30 s) · 180 → 360 left (60 s) · 360 → 270 left (30 s) · 4,000 ft · 95 KIAS.",
        "090 → 180 à droite (30 s) · 180 → 360 à gauche (60 s) · 360 → 270 à gauche (30 s) · 4 000 ft · 95 KIAS.",
      ),
      reader: L(
        "Standards: altitude ±100 ft, roll-out ±15° on partial panel, bank 30° or less.",
        "Critères : altitude ±100 ft, sortie ±15° en panneau partiel, inclinaison 30° au plus.",
      ),
    }),
    flyStep(
      "bp-fly",
      "pp-compass",
      L("Fly the lesson: partial panel", "Volez la leçon : panneau partiel"),
      L(
        "Attitude and heading failed: three timed turns at 4,000 ft with the compass and the clock.",
        "Horizon et cap en panne : trois virages chronométrés à 4 000 ft au compas et au chrono.",
      ),
      [
        L("Timer as you roll in.", "Chrono en inclinant."),
        L("Read the compass wings level.", "Compas lu ailes à plat."),
      ],
      8,
    ),
  ];
  return briefing(
    {
      id: COMPASS_BRIEFING_ID,
      exerciseId: "pp-compass",
      title: L("Briefing: partial panel", "Briefing : panneau partiel"),
      summary: L(
        "The briefing of the partial-panel lesson: timed turns, the compass errors (UNOS, ANDS), then fly it.",
        "Le briefing de la leçon panneau partiel : virages chronométrés, erreurs du compas (UNOS, ANDS), puis le vol.",
      ),
      tags: ["ifr", "partial-panel", "compass"],
      minutes: 8,
    },
    steps,
    compassScenes(),
  );
}
