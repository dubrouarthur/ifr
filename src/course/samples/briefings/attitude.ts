// Ground school — crafted briefings for the attitude-flying lessons: standard-rate turns (bai-turns), unusual
// attitude recovery (bai-unusual) and partial panel with the compass and timed turns (pp-compass).
// Sources: FAA-H-8083-15B Instrument Flying Handbook (IFH) ch. 6–7 (attitude instrument flying, turns, unusual
// attitudes, partial panel, compass turns); FAA-H-8083-25 PHAK ch. 8 (magnetic compass errors); FAA-S-ACS-8C
// Instrument Rating ACS area IV (flight by reference to instruments) and area VII; C172S POH section 2 (limits).
import type {
  Briefing,
  InstrumentView,
  PaneView,
  SimScene,
  Step,
} from "../../types";
import { scene } from "../kit";
import {
  DIAGRAM,
  G as GC,
  GAUGE,
  INST,
  L,
  S,
  T,
  briefing,
  checkStep,
  coverStep,
  flyStep,
  formulaStep,
  goalsStep,
  heroGauge,
  heroStep,
  instrumentStep,
  mcq,
  mistakesStep,
  panelStep,
  practiceStep,
  quizStep,
  readyStep,
  whyStep,
  yourTurnStep,
} from "./kit";

export const TURNS_BRIEFING_ID = "sample-briefing-bai-turns";
export const UNUSUAL_BRIEFING_ID = "sample-briefing-bai-unusual";
export const COMPASS_BRIEFING_ID = "sample-briefing-pp-compass";

/** Single gauges of the six-pack as stage panes: large enough to read on a 1280 × 720 screen. */
const pane = (i: number): PaneView => ({ kind: "six", crop: { region: `STEAM_LEFT:${i}` } });
const ASI_PANE = pane(0);
const AI_PANE = pane(1);
const TC_PANE = pane(3);
const HSI_PANE = pane(4);
const VSI_PANE = pane(5);
const LOWER_ROW_PANE: PaneView = { kind: "six", crop: { rect: [0, 408, 1024, 360] } };

/** The practice area of every Stage 1 lesson (curriculum.ts OPEN: 18 NM south-south-east of Port Ardent). */
const AREA = { fix: "PARD", radial: 160, distNm: 18 };

// ================================================================== bai-turns
// Upgrade plan (was: 8 slides, 3 interactions). Weak: no stated objectives, the bank rule was not the IFH one
// and gave three answers, the Try it could be met mid-turn on a six-pack too small to read, one practice only,
// no retrieval. Added: the situation and its question (bt-goals), the IFH 15 % rule with one answer, a larger
// guided turn whose roll-out is checked, a second turn flown alone with the map (bt-solo), three retrieval
// questions before "Ready to fly".
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
    "turns.east": scene(
      "turns.east",
      { pos: AREA, altFt: 4000, hdg: 90, iasKt: 95 },
      { label: "Heading 090 · 4,000 ft · 95 KIAS" },
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
          "Flight: about 5 min · hand-flown · FAA IFH ch. 7",
          "Vol : environ 5 min · pilotage manuel · FAA IFH ch. 7",
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
    goalsStep("bt-goals", {
      title: L("One instruction, three decisions", "Une instruction, trois décisions"),
      hook: L(
        "In cloud, heading 360, 95 KIAS. ATC: “Turn left heading 270.” How much bank, for how long, and when do you roll out?",
        "En nuage, cap 360, 95 KIAS. Le contrôle : « Tournez à gauche, cap 270. » Quelle inclinaison, combien de temps, et quand sortir ?",
      ),
      objectives: [
        L(
          "Work out the standard-rate bank from your speed: about 15° at 95 KIAS",
          "Calculer l’inclinaison du taux standard d’après la vitesse : environ 15° à 95 KIAS",
        ),
        L(
          "Predict the time of a turn: 3° per second, 30 s for 90°",
          "Prévoir la durée d’un virage : 3° par seconde, 30 s pour 90°",
        ),
        L(
          "Roll out within 10° of the heading, altitude within 100 ft",
          "Sortir à 10° près du cap, en tenant l’altitude à 100 ft près",
        ),
      ],
      quiz: mcq(
        L("Your first guess: how much bank?", "Votre première idée : quelle inclinaison ?"),
        [
          {
            text: L("About 5°", "Environ 5°"),
            why: L(
              "Too little: about 1° per second, the 90° would take a minute and a half.",
              "Trop peu : environ 1° par seconde, les 90° prendraient une minute et demie.",
            ),
          },
          {
            text: L("About 15°", "Environ 15°"),
            why: L(
              "Right: at this speed, 15° gives 3° per second.",
              "Juste : à cette vitesse, 15° donnent 3° par seconde.",
            ),
          },
          {
            text: L("About 30°", "Environ 30°"),
            why: L(
              "Too much: about 6° per second, and 30° is the lesson’s limit.",
              "Trop : environ 6° par seconde, et 30° est la limite de la leçon.",
            ),
          },
        ],
        1,
        L(
          "About 15° at 95 KIAS: the standard rate, 3° per second. The next slides show why, and how to find it at any speed.",
          "Environ 15° à 95 KIAS : le taux standard, 3° par seconde. La suite montre pourquoi, et comment le trouver à toute vitesse.",
        ),
      ),
      foot: L("FAA IFH ch. 7 · lesson standards", "FAA IFH ch. 7 · critères de la leçon"),
      reader: L(
        "The situation: in cloud on heading 360 at 95 KIAS, ATC says “turn left heading 270”. After this briefing you can work out the standard-rate bank from your speed (about 15° at 95 KIAS), predict the time of a turn (3° per second) and roll out within 10° of the heading while holding the altitude within 100 ft.",
        "La situation : en nuage au cap 360 à 95 KIAS, le contrôle dit « tournez à gauche, cap 270 ». Après ce briefing vous savez calculer l’inclinaison du taux standard d’après la vitesse (environ 15° à 95 KIAS), prévoir la durée d’un virage (3° par seconde) et sortir à 10° près du cap en tenant l’altitude à 100 ft près.",
      ),
    }),
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
      // in the clear dial, beside the wing tip and beside the ball (never on them)
      marks: [
        [-0.6, 0.56],
        [0.34, 0.64],
      ],
      rows: [
        {
          heading: L("Wing on the index", "Aile sur le repère"),
          body: L(
            "3°/s: the 2-minute turn, at any speed.",
            "3°/s : le tour en 2 minutes, à toute vitesse.",
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
        "FAA IFH ch. 5 and 7 · it shows the rate, not the bank",
        "FAA IFH ch. 5 et 7 · il montre le taux, pas l’inclinaison",
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
      formula: L(
        "{bank} ≈ [{TAS}/10] + ½ × [{TAS}/10]",
        "{inclinaison} ≈ [{Vp}/10] + ½ × [{Vp}/10]",
      ),
      units: L(
        "bank in degrees · TAS in knots",
        "inclinaison en degrés · Vp en nœuds",
      ),
      lines: [
        L("TAS | ≈ 95 × 1.08 ≈ !103 kt!", "Vp | ≈ 95 × 1,08 ≈ !103 kt!"),
        L("bank | ≈ 10 + 5 ≈ !15°!", "inclinaison | ≈ 10 + 5 ≈ !15°!"),
        L(
          "lead | ≈ ½ × 15 ≈ !8°!",
          "anticipation | ≈ ½ × 15 ≈ !8°!",
        ),
      ],
      after: L(
        "Set 15° here, then put the wing on the index.",
        "Affichez 15° ici, puis calez l’aile sur le repère.",
      ),
      foot: L(
        "FAA IFH ch. 7 · TAS ≈ IAS + 2 % per 1,000 ft (4,000 ft: × 1.08)",
        "FAA IFH ch. 7 · Vp ≈ Vi + 2 % par 1 000 ft (4 000 ft : × 1,08)",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "bank (°) ≈ TAS (kt) ÷ 10, plus half of that",
            "inclinaison (°) ≈ Vp (kt) ÷ 10, plus la moitié",
          ),
          ruleOfThumb: L(
            "95 KIAS at 4,000 ft is about 103 KTAS: 10 + 5, about 15° of bank. Lead the roll-out by half the bank, about 8°. The rule often taught in France, TAS ÷ 10 + 7, gives 17° here: close enough to start, then the turn coordinator decides.",
            "95 KIAS à 4 000 ft font environ 103 kt de vitesse propre : 10 + 5, environ 15° d’inclinaison. Anticipez la sortie de la moitié de l’inclinaison, environ 8°. La règle souvent enseignée en France, Vp ÷ 10 + 7, donne ici 17° : assez proche pour commencer, puis l’indicateur de virage décide.",
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 7" }],
        },
      ],
    }),
    yourTurnStep("bt-try", {
      eyebrow: L("Your turn · guided", "À vous · guidé"),
      title: L("Roll in, hold it, roll out", "Inclinez, tenez, sortez"),
      rows: [
        {
          heading: L("Hold ▶ to roll in", "Maintenez ▶ pour incliner"),
          small: L(
            "about 15° on the attitude indicator",
            "environ 15° sur l’horizon artificiel",
          ),
        },
        {
          heading: L("Wing on the index", "Aile sur le repère"),
          small: L(
            "turn coordinator: 3° per second",
            "indicateur de virage : 3° par seconde",
          ),
        },
        {
          heading: L("Watch the heading come", "Regardez le cap défiler"),
          small: L(
            "090 arrives after 30 s",
            "le 090 arrive après 30 s",
          ),
        },
        {
          heading: L("Release on 090", "Relâchez au 090"),
          small: L(
            "in the aircraft: start the roll-out 8° before",
            "en avion : commencez la sortie 8° avant",
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
        "Your turn: turn right to heading 090, wings level",
        "À vous : virez à droite au cap 090, ailes à plat",
      ),
      controls: ["bank"],
      goal: {
        all: [
          { id: "heading", p: { value: 90, tol: 10 } },
          { id: "bankMax", p: { max: 5 } },
        ],
        holdS: 3,
        graded: false,
        success: L(
          "Wings level on 090: 90° in about 30 s.",
          "Ailes à plat au 090 : 90° en 30 s environ.",
        ),
      },
      hint: L(
        "Hold ▶ under the instruments and release it on 090: the aid then holds that heading.",
        "Maintenez ▶ sous les instruments et relâchez au 090 : l’aide tient alors ce cap.",
      ),
      frame: [888, 276, 912, 684],
      rowsW: 720,
      foot: L(
        "An aid holds the altitude and the speed · FAA IFH ch. 7",
        "Une aide tient l’altitude et la vitesse · FAA IFH ch. 7",
      ),
      reader: L(
        "Guided practice on the six-pack: hold the right bank button to roll in to about 15°, check the wing of the turn coordinator on the index, watch the heading come (090 after about 30 s) and release on 090. Here an aid holds the altitude, the speed and the heading you release on; in the aircraft you add a little back pressure (about half a degree of pitch: the load factor is 1.04 g) and you start the roll-out about 8° before the heading.",
        "Pratique guidée sur les six instruments : maintenez le bouton d’inclinaison à droite pour incliner à environ 15°, vérifiez l’aile de l’indicateur de virage sur le repère, regardez le cap défiler (le 090 arrive après 30 s environ) et relâchez au 090. Ici, une aide tient l’altitude, la vitesse et le cap où vous relâchez ; en avion, vous tirez un peu (environ un demi-degré d’assiette : le facteur de charge vaut 1,04 g) et vous commencez la sortie environ 8° avant le cap.",
      ),
    }),
    practiceStep("bt-solo", {
      title: L("On your own: left to 360", "Seul : à gauche vers le 360"),
      intro: L(
        "Heading 090, 4,000 ft, 95 KIAS. ATC: **“Turn left heading 360.”** Before you roll in, say the time out loud. Then fly it: the map shows the turn you draw over the ground.",
        "Cap 090, 4 000 ft, 95 KIAS. Le contrôle : **« Tournez à gauche, cap 360. »** Avant d’incliner, dites la durée à voix haute. Puis volez : la carte montre le virage que vous tracez au sol.",
      ),
      rows: [
        { text: L("Heading **360**, within 10°", "Cap **360**, à 10° près"), check: 0, readout: "hdg" },
        { text: L("Wings level", "Ailes à plat"), check: 1 },
      ],
      after: L(
        "090 to 360 by the left is **90°: 30 s** at standard rate. On the map your turn is a quarter circle of about half a mile of radius: that is the room a standard-rate turn takes at this speed.",
        "Du 090 au 360 par la gauche, **90° : 30 s** au taux standard. Sur la carte, votre virage est un quart de cercle d’environ un demi-nautique de rayon : la place que prend un virage standard à cette vitesse.",
      ),
      takeaway: L(
        "Turn ÷ 3 = seconds. Say the time before you roll in.",
        "Virage ÷ 3 = secondes. Dites la durée avant d’incliner.",
      ),
      panes: [TC_PANE, HSI_PANE],
      scene: "turns.east",
      inset: "plan",
      controls: ["bank"],
      assist: { holdAlt: true, holdIas: true },
      goal: {
        all: [
          { id: "heading", p: { value: 360, tol: 10 } },
          { id: "bankMax", p: { max: 5 } },
        ],
        holdS: 3,
        graded: false,
        success: L(
          "On 360, wings level: 90° in 30 s.",
          "Au 360, ailes à plat : 90° en 30 s.",
        ),
      },
      hint: L(
        "Hold ◀ and release it on 360 (the N of the heading indicator).",
        "Maintenez ◀ et relâchez au 360 (le N du conservateur de cap).",
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
    checkStep("bt-check-time", L("Recap 1 of 3: the time", "Récap 1 sur 3 : la durée"), {
      lead: L(
        "Without looking back. Heading 090. ATC: **“Turn right heading 240.”**",
        "Sans revenir en arrière. Cap 090. Le contrôle : **« Tournez à droite, cap 240. »**",
      ),
      quiz: mcq(
        L("How long is this turn at standard rate?", "Combien dure ce virage au taux standard ?"),
        [
          {
            text: L("30 s", "30 s"),
            why: L("30 s is 90°. From 090 to 240 is 150°.", "30 s, c’est 90°. Du 090 au 240, il y a 150°."),
          },
          {
            text: L("50 s", "50 s"),
            why: L("Right: 150° ÷ 3 = 50 s.", "Juste : 150° ÷ 3 = 50 s."),
          },
          {
            text: L("80 s", "80 s"),
            why: L(
              "80 s would be 240°: divide the turn, not the heading.",
              "80 s feraient 240° : divisez le virage, pas le cap.",
            ),
          },
        ],
        1,
        L(
          "The turn is 240 − 90 = 150°. At 3° per second: 50 s.",
          "Le virage fait 240 − 90 = 150°. À 3° par seconde : 50 s.",
        ),
      ),
    }),
    checkStep("bt-check-bank", L("Recap 2 of 3: the bank", "Récap 2 sur 3 : l’inclinaison"), {
      lead: L(
        "Another aircraft, faster: **120 kt** of true airspeed.",
        "Un autre avion, plus rapide : **120 kt** de vitesse propre.",
      ),
      quiz: mcq(
        L("Which bank gives the standard rate?", "Quelle inclinaison donne le taux standard ?"),
        [
          {
            text: L("12°", "12°"),
            why: L(
              "12 is TAS ÷ 10 alone: add half of it.",
              "12, c’est Vp ÷ 10 seul : ajoutez la moitié.",
            ),
          },
          {
            text: L("18°", "18°"),
            why: L("Right: 12 + 6 = 18°.", "Juste : 12 + 6 = 18°."),
          },
          {
            text: L("25°", "25°"),
            why: L(
              "Too much: at 120 kt, 25° turns at more than 4° per second.",
              "Trop : à 120 kt, 25° font plus de 4° par seconde.",
            ),
          },
        ],
        1,
        L(
          "TAS ÷ 10, plus half: 12 + 6 = 18°. The faster you fly, the more bank the same rate needs.",
          "Vp ÷ 10, plus la moitié : 12 + 6 = 18°. Plus vous volez vite, plus le même taux demande d’inclinaison.",
        ),
      ),
    }),
    checkStep("bt-check-lead", L("Recap 3 of 3: the roll-out", "Récap 3 sur 3 : la sortie"), {
      lead: L(
        "You turn **right** towards heading **180** with **20°** of bank.",
        "Vous virez à **droite** vers le cap **180** avec **20°** d’inclinaison.",
      ),
      quiz: mcq(
        L("You start the roll-out when the heading reads…", "Vous commencez la sortie quand le cap indique…"),
        [
          {
            text: L("160", "160"),
            why: L(
              "Too early: the lead is half the bank, not the whole bank.",
              "Trop tôt : l’anticipation vaut la moitié de l’inclinaison, pas toute l’inclinaison.",
            ),
          },
          {
            text: L("170", "170"),
            why: L("Right: half of 20° is 10° before 180.", "Juste : la moitié de 20°, soit 10° avant le 180."),
          },
          {
            text: L("180", "180"),
            why: L(
              "Too late: the aircraft still turns while the wings come level, about 10° more.",
              "Trop tard : l’avion tourne encore pendant que les ailes reviennent, environ 10° de plus.",
            ),
          },
        ],
        1,
        L(
          "Lead the roll-out by half the bank: 10° here, so start at 170.",
          "Anticipez la sortie de la moitié de l’inclinaison : 10° ici, donc commencez au 170.",
        ),
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
        "Three standard-rate turns at 4,000 ft and 95 KIAS: left to 270, right to 090, left to 360. In the cockpit nothing is held for you: back pressure in the turn, and roll out yourself.",
        "Trois virages au taux standard à 4 000 ft et 95 KIAS : à gauche au 270, à droite au 090, à gauche au 360. Dans le cockpit, rien n’est tenu pour vous : tirez un peu en virage, et sortez vous-même.",
      ),
      [
        L(
          "About 15° of bank, wing on the index.",
          "Environ 15° d’inclinaison, aile sur le repère.",
        ),
        L("Roll out 8° before the heading.", "Sortez 8° avant le cap."),
        L(
          "To pass: altitude ±100 ft, roll-out ±10°, bank 30° at most.",
          "Pour réussir : altitude ±100 ft, sortie ±10°, inclinaison 30° au plus.",
        ),
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
        "The briefing of the standard-rate turns lesson: 3° per second, the bank from your speed, the roll-out lead, two turns on the instruments, then fly it.",
        "Le briefing de la leçon virages au taux standard : 3° par seconde, l’inclinaison selon la vitesse, l’anticipation de sortie, deux virages aux instruments, puis le vol.",
      ),
      tags: ["ifr", "attitude", "turns"],
      minutes: 12,
    },
    steps,
    turnsScenes(),
  );
}

// ================================================================== bai-unusual
// Upgrade plan (was: 8 slides, 3 interactions). Weak: the Try it passed with no input while the aircraft dived,
// the airspeed was taught on attitude indicators only, the nose-high case was never practised, both recoveries
// shared one slide, no objectives, no retrieval. Added: the situation and its first action (bu-goals), one slide
// per recovery with the airspeed indicator beside the attitude indicator, numbered in the order of the actions,
// a nose-high recovery on the stage (bu-high-try), a nose-low Try it that only the student's throttle and pitch
// can pass, and three retrieval steps (the order, the reading, the reason).
function unusualScenes(): Record<string, SimScene> {
  const high = scene(
    "ua.high",
    { pos: AREA, altFt: 5000, hdg: 45, iasKt: 72, pitch: 22, bank: -35, vsFpm: 1200 },
    { label: "Nose high: +22° pitch, 35° left bank, 72 KIAS" },
  );
  const low = scene(
    "ua.low",
    { pos: AREA, altFt: 4600, hdg: 120, iasKt: 125, pitch: -18, bank: 55, vsFpm: -2000 },
    { label: "Nose low: −18° pitch, 55° right bank, 125 KIAS" },
  );
  // the nose-low attitude a little later, for the reading question: the VSI needle well inside its scale
  const lowRead = scene(
    "ua.low.read",
    { pos: AREA, altFt: 4400, hdg: 150, iasKt: 135, pitch: -12, bank: 40, vsFpm: -1500 },
    { label: "Nose low: 135 KIAS, descending 1,500 ft/min" },
  );
  // the same attitudes with the throttle where the student finds it: the recovery starts with the power
  const withPower = (id: string, sc: SimScene, throttle: number, trim: number): SimScene => ({
    ...sc,
    id,
    controls: { throttle, trim, flaps: 0 },
  });
  return {
    "ua.high": high,
    "ua.low": low,
    "ua.low.read": lowRead,
    "ua.high.try": withPower("ua.high.try", high, 0.7, 0.05),
    "ua.low.try": withPower("ua.low.try", low, 0.5, -0.45),
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
      meta: L("Flight: about 4 min · hand-flown · FAA IFH ch. 7", "Vol : environ 4 min · pilotage manuel · FAA IFH ch. 7"),
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
    goalsStep("bu-goals", {
      title: L("You look up: nothing fits", "Vous relevez la tête : rien ne colle"),
      hook: L(
        "In cloud, you were reading the chart. You look up: 72 KIAS and falling, the altimeter climbing. No time to think it over.",
        "En nuage, vous lisiez la carte. Vous relevez la tête : 72 KIAS qui chutent, l’altimètre qui monte. Pas le temps de réfléchir.",
      ),
      objectives: [
        L(
          "Tell nose high from nose low in 3 seconds, from the airspeed and the altimeter",
          "Reconnaître nez haut ou nez bas en 3 secondes, à la vitesse et à l’altimètre",
        ),
        L(
          "Recover in the right order: three actions for each case",
          "Rattraper dans le bon ordre : trois gestes pour chaque cas",
        ),
        L(
          "Stay above 48 KIAS, below 163 KIAS, and lose less than 500 ft",
          "Rester au-dessus de 48 KIAS, sous 163 KIAS, et perdre moins de 500 ft",
        ),
      ],
      quiz: mcq(
        L("Your first action?", "Votre premier geste ?"),
        [
          {
            text: L("Full power", "Plein gaz"),
            why: L(
              "Right: slow and climbing is nose high. The speed comes first.",
              "Juste : lent et en montée, c’est nez haut. La vitesse d’abord.",
            ),
          },
          {
            text: L("Pull to stop the descent", "Tirer pour arrêter la descente"),
            why: L(
              "You are not descending: the altimeter climbs. Pulling leads to the stall.",
              "Vous ne descendez pas : l’altimètre monte. Tirer mène au décrochage.",
            ),
          },
          {
            text: L("Throttle to idle", "Réduire les gaz"),
            why: L(
              "That is the nose-low action, when the speed increases.",
              "C’est le geste du nez bas, quand la vitesse augmente.",
            ),
          },
        ],
        0,
        L(
          "Airspeed low and falling, altitude increasing: nose high. Full power first, then the nose, then the wings.",
          "Vitesse faible qui baisse, altitude qui augmente : nez haut. Plein gaz d’abord, puis le nez, puis les ailes.",
        ),
      ),
      foot: L("FAA IFH ch. 7 · C172S POH sec. 2", "FAA IFH ch. 7 · C172S POH sec. 2"),
      reader: L(
        "The situation: in cloud, you look up from the chart and see 72 KIAS falling and the altimeter climbing. After this briefing you can tell nose high from nose low in three seconds from the airspeed and the altimeter, recover in the right order (three actions for each case), and do it above 48 KIAS, below 163 KIAS and with less than 500 ft lost.",
        "La situation : en nuage, vous relevez la tête de la carte et voyez 72 KIAS qui chutent et l’altimètre qui monte. Après ce briefing vous savez reconnaître nez haut ou nez bas en trois secondes à la vitesse et à l’altimètre, rattraper dans le bon ordre (trois gestes pour chaque cas), au-dessus de 48 KIAS, sous 163 KIAS et en perdant moins de 500 ft.",
      ),
    }),
    whyStep("bu-why", {
      eyebrow: L("Why it matters", "Pourquoi c’est important"),
      title: L("In cloud, your inner ear lies", "Dans les nuages, l’oreille interne ment"),
      n: L("#1", "1re"),
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
      title: L("No attitude indicator: read the others", "Sans horizon : lisez les autres"),
      visual: [
        INST(
          GAUGE("asi"),
          L("Airspeed indicator: 135 KIAS", "Anémomètre : 135 KIAS"),
          GC.left,
          424,
          368,
          368,
          { id: "bu-quiz.asi", scene: "ua.low.read" },
        ),
        INST(
          GAUGE("vsi"),
          L("Vertical speed indicator: descending 1,500 ft/min", "Variomètre : descente à 1 500 ft/min"),
          GC.left + 400,
          424,
          368,
          368,
          { id: "bu-quiz.vsi", scene: "ua.low.read" },
        ),
        T(
          "small",
          L("135 KIAS and rising · 1,500 ft/min down", "135 KIAS qui montent · 1 500 ft/min en descente"),
          GC.left,
          824,
          768,
          40,
        ),
      ],
      quiz: mcq(
        L("Fast and rising, going down. You are…", "Rapide qui accélère, en descente. Vous êtes…"),
        [
          { text: L("Nose high", "Nez haut"), why: L("Nose high is slow and climbing.", "Nez haut, c’est lent et en montée.") },
          { text: L("Nose low", "Nez bas"), why: L("Right: fast and descending is nose low.", "Juste : rapide et en descente, c’est nez bas.") },
          { text: L("Level, steady", "En palier stabilisé"), why: L("Level holds the speed and the altitude.", "En palier, vitesse et altitude restent stables.") },
        ],
        1,
        L(
          "Airspeed increasing and altitude decreasing: nose low. If the turn coordinator also shows a turn, it is a spiral.",
          "Vitesse qui augmente et altitude qui diminue : nez bas. Si l’indicateur de virage montre aussi un virage, c’est une spirale.",
        ),
      ),
      foot: L("FAA IFH ch. 7", "FAA IFH ch. 7"),
      scene: "ua.low.read",
      reader: L(
        "Without the attitude indicator, read the trend: airspeed decreasing and altitude increasing is nose high; airspeed increasing and altitude decreasing is nose low, and a spiral if the turn coordinator shows a turn (FAA IFH ch. 7).",
        "Sans horizon, lisez la tendance : vitesse qui diminue et altitude qui augmente, c’est nez haut ; vitesse qui augmente et altitude qui diminue, c’est nez bas, et une spirale si l’indicateur de virage montre un virage (FAA IFH ch. 7).",
      ),
    }),
    panelStep("bu-high", {
      eyebrow: L("Recovery 1 of 2", "Sortie 1 sur 2"),
      title: L("Nose high: power, nose, wings", "Nez haut : gaz, nez, ailes"),
      lead: L("+22° of pitch, 35° of left bank, 72 KIAS and falling.", "+22° d’assiette, 35° à gauche, 72 KIAS qui baissent."),
      gauges: [
        {
          gauge: "asi",
          alt: L("Airspeed indicator: 72 KIAS", "Anémomètre : 72 KIAS"),
          marks: [{ n: 1, at: [-0.32, 0] }],
        },
        {
          gauge: "ai",
          alt: L("Attitude indicator nose high, 35° of left bank", "Horizon artificiel nez haut, 35° d’inclinaison à gauche"),
          marks: [
            { n: 2, at: [0.5, 0.2] },
            { n: 3, at: [0.16, -0.5] },
          ],
        },
      ],
      scene: "ua.high",
      rows: [
        {
          heading: L("Full power", "Plein gaz"),
          body: L("The speed is falling towards the stall: power first.", "La vitesse baisse vers le décrochage : la puissance d’abord."),
        },
        {
          heading: L("Nose down to the horizon", "Nez vers l’horizon"),
          body: L("Push: the speed comes back. Stop at the horizon.", "Poussez : la vitesse revient. Arrêtez à l’horizon."),
        },
        {
          heading: L("Wings level", "Ailes à plat"),
          body: L("Last, with coordinated rudder. Then trim.", "En dernier, pied coordonné. Puis compensez."),
        },
      ],
      foot: L("FAA IFH ch. 7 · nose-high recovery · stall 48 KIAS", "FAA IFH ch. 7 · sortie nez haut · décrochage 48 KIAS"),
      reader: L(
        "Nose high (airspeed decreasing): add full power, lower the nose to the horizon to keep away from the stall, then level the wings with coordinated aileron and rudder. The actions follow each other almost at once, in this order (FAA IFH ch. 7).",
        "Nez haut (vitesse qui diminue) : mettez plein gaz, ramenez le nez à l’horizon pour vous éloigner du décrochage, puis mettez les ailes à plat aux ailerons et au palonnier. Les gestes s’enchaînent presque en même temps, dans cet ordre (FAA IFH ch. 7).",
      ),
    }),
    practiceStep("bu-high-try", {
      title: L("Your turn: recover the nose-high one", "À vous : rattrapez le nez haut"),
      intro: L(
        "Nose high, 72 KIAS and falling. Press **+** until the throttle is full, then hold **▼** to bring the nose to the horizon. Here an aid levels the wings for you: in the aircraft it is your third action.",
        "Nez haut, 72 KIAS qui baissent. Appuyez sur **+** jusqu’au plein gaz, puis maintenez **▼** pour ramener le nez à l’horizon. Ici, une aide remet les ailes à plat : en avion, c’est votre troisième geste.",
      ),
      rows: [
        { text: L("**Full power**", "**Plein gaz**"), check: 0 },
        { text: L("Nose **near the horizon**", "Nez **près de l’horizon**"), check: 1 },
        { text: L("Wings level", "Ailes à plat"), check: 2 },
      ],
      after: L(
        "Look at the airspeed indicator: the needle climbs back as soon as the nose comes down with full power. The stall stayed away because the power came **first**.",
        "Regardez l’anémomètre : l’aiguille remonte dès que le nez descend, plein gaz. Le décrochage est resté loin parce que la puissance est venue **en premier**.",
      ),
      takeaway: L(
        "Nose high: power, nose, wings.",
        "Nez haut : gaz, nez, ailes.",
      ),
      panes: [ASI_PANE, AI_PANE],
      scene: "ua.high.try",
      controls: ["power", "pitch", "bank"],
      goal: {
        all: [
          { id: "throttle", p: { op: ">=", value: 0.95 } },
          { id: "pitchAtt", p: { min: -3, max: 6 } },
          { id: "bankMax", p: { max: 10 } },
        ],
        holdS: 2,
        graded: false,
        success: L(
          "Recovered: full power, nose on the horizon, wings level.",
          "Rattrapé : plein gaz, nez à l’horizon, ailes à plat.",
        ),
      },
      hint: L(
        "First + several times (the value shows 100 %), then hold ▼ until the orange wings meet the horizon line.",
        "D’abord + plusieurs fois (la valeur affiche 100 %), puis maintenez ▼ jusqu’à ce que les ailes orange rejoignent la ligne d’horizon.",
      ),
    }),
    panelStep("bu-low", {
      eyebrow: L("Recovery 2 of 2", "Sortie 2 sur 2"),
      title: L("Nose low: idle, wings, nose", "Nez bas : réduire, ailes, nez"),
      lead: L("−18° of pitch, 55° of right bank, 125 KIAS and rising.", "−18° d’assiette, 55° à droite, 125 KIAS qui montent."),
      gauges: [
        {
          gauge: "asi",
          alt: L("Airspeed indicator: 125 KIAS", "Anémomètre : 125 KIAS"),
          marks: [{ n: 1, at: [0.32, 0.06] }],
        },
        {
          gauge: "ai",
          alt: L("Attitude indicator nose low, 55° of right bank", "Horizon artificiel nez bas, 55° d’inclinaison à droite"),
          marks: [
            { n: 2, at: [-0.26, -0.6] },
            { n: 3, at: [-0.5, 0.22] },
          ],
        },
      ],
      scene: "ua.low",
      rows: [
        {
          heading: L("Throttle to idle", "Réduisez tout"),
          body: L("The speed is rising: VNE, 163 KIAS, comes in seconds.", "La vitesse monte : la VNE, 163 KIAS, arrive en secondes."),
        },
        {
          heading: L("Wings level", "Ailes à plat"),
          body: L("Before you pull: or the spiral tightens.", "Avant de tirer : sinon la spirale se serre."),
        },
        {
          heading: L("Ease the nose up", "Remontez le nez"),
          body: L("Gently, to the horizon. Then cruise power.", "Doucement, jusqu’à l’horizon. Puis la puissance."),
        },
      ],
      foot: L("FAA IFH ch. 7 · nose-low recovery · VNE 163 KIAS", "FAA IFH ch. 7 · sortie nez bas · VNE 163 KIAS"),
      reader: L(
        "Nose low (airspeed increasing): reduce the power to idle, level the wings with coordinated aileron and rudder, then raise the nose smoothly to level flight and set cruise power again (FAA IFH ch. 7).",
        "Nez bas (vitesse qui augmente) : réduisez tout, mettez les ailes à plat aux ailerons et au palonnier, puis ramenez doucement le nez en palier et remettez la puissance de croisière (FAA IFH ch. 7).",
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
        { heading: L("Press − : idle", "Appuyez sur − : réduisez"), small: L("until the throttle shows 25 % or less", "jusqu’à 25 % de gaz ou moins") },
        { heading: L("Wings level", "Ailes à plat"), small: L("here an aid does it; in the aircraft, you do", "ici une aide le fait ; en avion, c’est vous") },
        { heading: L("Hold ▲ : nose up", "Maintenez ▲ : remontez"), small: L("gently, to the horizon, no more", "doucement, jusqu’à l’horizon, pas plus") },
        { heading: L("Then cruise power", "Puis la puissance"), small: L("in the cockpit: back to 95 KIAS", "dans le cockpit : retour à 95 KIAS") },
      ],
      view: { kind: "six" },
      alt: L("Six-pack, nose low in a right spiral", "Six instruments, nez bas en spirale à droite"),
      scene: "ua.low.try",
      prompt: L("Your turn: idle, then ease the nose up to the horizon", "À vous : réduisez, puis remontez le nez à l’horizon"),
      controls: ["power", "pitch", "bank"],
      assist: {},
      goal: {
        all: [
          { id: "throttle", p: { op: "<=", value: 0.25 } },
          { id: "bankMax", p: { max: 10 } },
          { id: "pitchAtt", p: { min: -3, max: 6 } },
        ],
        holdS: 2,
        graded: false,
        success: L("Recovered: idle, wings level, nose on the horizon.", "Rattrapé : gaz réduits, ailes à plat, nez à l’horizon."),
      },
      hint: L(
        "First − five times, then hold ▲ until the orange wings meet the horizon line.",
        "D’abord − cinq fois, puis maintenez ▲ jusqu’à ce que les ailes orange rejoignent la ligne d’horizon.",
      ),
      frame: [888, 276, 912, 684],
      rowsW: 720,
      foot: L("FAA IFH ch. 7 · ACS IR.IV.B", "FAA IFH ch. 7 · ACS IR.IV.B"),
      reader: L(
        "Nose low and fast: throttle to idle, wings level, then ease the nose up to the horizon and set cruise power. Your turn on the six-pack: reduce the power with the − button, then hold ▲ to raise the nose. Here an aid levels the wings; in the aircraft you level them yourself before you pull.",
        "Nez bas et rapide : réduisez tout, ailes à plat, puis remontez le nez jusqu’à l’horizon et remettez la puissance de croisière. À vous, sur les six instruments : réduisez avec le bouton −, puis maintenez ▲ pour remonter le nez. Ici, une aide remet les ailes à plat ; en avion, vous le faites vous-même avant de tirer.",
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
          fix: L("Throttle to idle first.", "Réduisez d’abord."),
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
    checkStep("bu-check-order", L("Recap 1 of 3: the order", "Récap 1 sur 3 : l’ordre"), {
      lead: L(
        "Without looking back. **140 KIAS and rising**, 50° of bank, the altimeter unwinding.",
        "Sans revenir en arrière. **140 KIAS qui montent**, 50° d’inclinaison, l’altimètre qui dégringole.",
      ),
      quiz: {
        kind: "order",
        prompt: L("Put the recovery in order.", "Remettez la sortie dans l’ordre."),
        items: [
          L("Throttle to idle", "Réduire les gaz"),
          L("Wings level", "Mettre les ailes à plat"),
          L("Ease the nose up to the horizon", "Remonter le nez jusqu’à l’horizon"),
          L("Cruise power again", "Remettre la puissance de croisière"),
        ],
        explain: L(
          "Nose low: idle first (the speed), wings level second (or the pull tightens the spiral), then the nose, then the power.",
          "Nez bas : réduire d’abord (la vitesse), les ailes ensuite (sinon tirer serre la spirale), puis le nez, puis la puissance.",
        ),
      },
    }),
    checkStep("bu-check-read", L("Recap 2 of 3: the reading", "Récap 2 sur 3 : la lecture"), {
      lead: L(
        "The attitude indicator has failed. Read the two instruments on the right.",
        "L’horizon artificiel est en panne. Lisez les deux instruments à droite.",
      ),
      quiz: mcq(
        L("You are…", "Vous êtes…"),
        [
          {
            text: L("Nose high: full power first", "Nez haut : plein gaz d’abord"),
            why: L("Right: 72 KIAS and a climb of 1,200 ft/min.", "Juste : 72 KIAS et une montée à 1 200 ft/min."),
          },
          {
            text: L("Nose low: idle first", "Nez bas : réduire d’abord"),
            why: L(
              "Nose low would show a high speed and a descent.",
              "Nez bas, la vitesse serait forte et le vario vers le bas.",
            ),
          },
          {
            text: L("Level: touch nothing", "En palier : ne rien toucher"),
            why: L(
              "Level, the vertical speed would read zero.",
              "En palier, le vario serait à zéro.",
            ),
          },
        ],
        0,
        L(
          "Slow and climbing: nose high. Full power, nose to the horizon, wings level.",
          "Lent et en montée : nez haut. Plein gaz, nez à l’horizon, ailes à plat.",
        ),
      ),
      stage: { panes: [ASI_PANE, VSI_PANE], scene: "ua.high" },
    }),
    checkStep("bu-check-why", L("Recap 3 of 3: the reason", "Récap 3 sur 3 : la raison"), {
      lead: L(
        "Nose low, 55° of bank, 125 KIAS and rising.",
        "Nez bas, 55° d’inclinaison, 125 KIAS qui montent.",
      ),
      quiz: mcq(
        L("Why not pull at once?", "Pourquoi ne pas tirer tout de suite ?"),
        [
          {
            text: L("Pulling while banked tightens the turn", "Tirer incliné serre le virage"),
            why: L(
              "Right: the pull acts in the plane of the wings, and the load factor rises.",
              "Juste : la traction agit dans le plan des ailes, et le facteur de charge monte.",
            ),
          },
          {
            text: L("The aircraft would stall at once", "L’avion décrocherait aussitôt"),
            why: L(
              "At 125 KIAS the stall is far, about 63 KIAS at 1.7 g. The danger is the spiral and the overspeed.",
              "À 125 KIAS le décrochage est loin, vers 63 KIAS à 1,7 g. Le danger, c’est la spirale et la survitesse.",
            ),
          },
          {
            text: L("The elevator does nothing nose low", "La profondeur ne fait rien nez bas"),
            why: L(
              "It does act, but sideways as much as upwards while you are banked.",
              "Elle agit, mais autant sur le côté que vers le haut tant que vous êtes incliné.",
            ),
          },
        ],
        0,
        L(
          "Wings level first: then the pull lifts the nose, not the turn.",
          "Les ailes d’abord : la traction lève alors le nez, pas le virage.",
        ),
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
        "Two unusual attitudes to recover from at 5,000 ft: nose high, then nose low. In the cockpit nothing levels the wings for you.",
        "Deux positions inusuelles à rattraper à 5 000 ft : nez haut, puis nez bas. Dans le cockpit, rien ne remet les ailes à plat pour vous.",
      ),
      [
        L("Read the airspeed first.", "Lisez d’abord la vitesse."),
        L("Nose low: wings level before you pull.", "Nez bas : ailes à plat avant de tirer."),
        L(
          "To pass: no stall, below 163 KIAS, less than 500 ft lost.",
          "Pour réussir : pas de décrochage, moins de 163 KIAS, moins de 500 ft perdus.",
        ),
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
        "The briefing of the unusual attitude lesson: recognise nose high or low, one recovery order for each, why wings level first, two recoveries on the instruments, then fly it.",
        "Le briefing de la leçon positions inusuelles : reconnaître nez haut ou bas, un ordre de sortie pour chacun, pourquoi les ailes d’abord, deux sorties aux instruments, puis le vol.",
      ),
      tags: ["ifr", "attitude", "unusual"],
      minutes: 12,
    },
    steps,
    unusualScenes(),
  );
}

// ================================================================== pp-compass
// Upgrade plan (was: 7 slides, 3 interactions). Weak: the compass slide did not show the compass, the UNOS lead
// was the latitude alone and said "here" although the simulator's compass only lags, the Try it asked for a timer
// key that does nothing and came before the reason for it, no objectives, no retrieval. Added: the situation and
// its question (bp-goals), the partial-panel scan on two gauges (bp-scan), the compass itself across the slide
// with the corrected rule, the compass in the question, the order "why, then how", a timed turn whose clock can
// be read, a second one flown alone (bp-solo) and three retrieval questions.
const PP_COVERS: ("ai" | "dg")[] = ["ai", "dg"];
/** The wet compass alone: the strip at the top of the six-pack. */
const COMPASS: InstrumentView = { kind: "six", crop: { rect: [340, 0, 240, 56] } };
/** The lower row of the six-pack with the status strip: turn coordinator, heading indicator, VSI and the timer. */
const LOWER_ROW: InstrumentView = { kind: "six", crop: { rect: [0, 408, 1024, 360] } };
function compassScenes(): Record<string, SimScene> {
  const at = (id: string, hdg: number, label: string, bank?: number): SimScene =>
    scene(id, { pos: AREA, altFt: 4000, hdg, iasKt: 95, ...(bank ? { bank } : {}) }, { label });
  return {
    "pp.east": at("pp.east", 90, "Partial panel · heading 090 · 4,000 ft"),
    "pp.south": at("pp.south", 180, "Partial panel · heading 180 · 4,000 ft"),
    "pp.north": at("pp.north", 330, "Partial panel · right turn through 330 towards north", 15),
    "pp.nw": at("pp.nw", 300, "Partial panel · right turn through 300 towards north", 15),
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
      meta: L("Flight: about 8 min · hand-flown · FAA IFH ch. 7", "Vol : environ 8 min · pilotage manuel · FAA IFH ch. 7"),
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
    goalsStep("bp-goals", {
      title: L("Two instruments are gone", "Deux instruments en moins"),
      hook: L(
        "In cloud, heading 090. The attitude indicator tumbles and the heading indicator drifts: the gyros have failed. ATC: “Turn right heading 180.”",
        "En nuage, cap 090. L’horizon bascule et le conservateur de cap dérive : les gyroscopes sont en panne. Le contrôle : « Tournez à droite, cap 180. »",
      ),
      objectives: [
        L(
          "Keep the wings level and turn at 3° per second on the turn coordinator",
          "Tenir les ailes à plat et virer à 3° par seconde à l’indicateur de virage",
        ),
        L(
          "Time each turn, 30 s for 90°, and roll out within 15° of the heading",
          "Chronométrer chaque virage, 30 s pour 90°, et sortir à 15° près du cap",
        ),
        L(
          "Say when the compass can be trusted: wings level, steady speed",
          "Dire quand le compas est fiable : ailes à plat, vitesse stable",
        ),
      ],
      quiz: mcq(
        L("How do you turn 90° without a heading indicator?", "Comment virer de 90° sans conservateur de cap ?"),
        [
          {
            text: L("Watch the compass through the turn", "Suivre le compas pendant le virage"),
            why: L(
              "In a turn the compass leads or lags: it is right only wings level.",
              "En virage le compas avance ou retarde : il n’est juste qu’ailes à plat.",
            ),
          },
          {
            text: L("Time 30 s at standard rate", "Chronométrer 30 s au taux standard"),
            why: L(
              "Right: 3° per second for 30 s is 90°, and the turn coordinator still works.",
              "Juste : 3° par seconde pendant 30 s font 90°, et l’indicateur de virage fonctionne.",
            ),
          },
          {
            text: L("Bank 30° and count to ten", "Incliner à 30° et compter jusqu’à dix"),
            why: L(
              "Without a horizon you cannot hold 30°, and the rate would not be known.",
              "Sans horizon, impossible de tenir 30°, et le taux serait inconnu.",
            ),
          },
        ],
        1,
        L(
          "The clock and the turn coordinator replace the heading indicator: 90° is 30 s at standard rate. Then the compass confirms, wings level.",
          "Le chrono et l’indicateur de virage remplacent le conservateur de cap : 90°, c’est 30 s au taux standard. Puis le compas confirme, ailes à plat.",
        ),
      ),
      foot: L("FAA IFH ch. 7 · lesson standards", "FAA IFH ch. 7 · critères de la leçon"),
      reader: L(
        "The situation: in cloud on heading 090 the attitude and heading indicators fail, and ATC asks for a right turn to 180. After this briefing you can keep the wings level and turn at 3° per second on the turn coordinator, time each turn (30 s for 90°) and roll out within 15° of the heading, and say when the compass can be trusted: wings level and at a steady speed.",
        "La situation : en nuage au cap 090, l’horizon et le conservateur de cap tombent en panne, et le contrôle demande un virage à droite vers le 180. Après ce briefing vous savez tenir les ailes à plat et virer à 3° par seconde à l’indicateur de virage, chronométrer chaque virage (30 s pour 90°) et sortir à 15° près du cap, et dire quand le compas est fiable : ailes à plat et à vitesse stable.",
      ),
    }),
    panelStep("bp-scan", {
      eyebrow: L("What is left", "Ce qui reste"),
      title: L("Three jobs, three instruments", "Trois tâches, trois instruments"),
      lead: L("Heading 090, 4,000 ft, 95 KIAS, wings level.", "Cap 090, 4 000 ft, 95 KIAS, ailes à plat."),
      gauges: [
        {
          gauge: "tc",
          alt: L("Turn coordinator: wings level, ball centred", "Indicateur de virage : ailes à plat, bille centrée"),
          marks: [{ n: 1, at: [-0.6, 0.56] }],
        },
        {
          gauge: "alt",
          alt: L("Altimeter: 4,000 ft", "Altimètre : 4 000 ft"),
          marks: [{ n: 2, at: [-0.34, 0.3] }],
        },
      ],
      scene: "pp.east",
      rows: [
        {
          heading: L("Bank: the turn coordinator", "Inclinaison : l’indicateur de virage"),
          body: L("Level aircraft: wings level. On the index: 3°/s.", "Avion à plat : ailes à plat. Sur le repère : 3°/s."),
        },
        {
          heading: L("Pitch: the altimeter", "Assiette : l’altimètre"),
          body: L("It moves? Correct a little; the VSI confirms.", "Il bouge ? Corrigez d’un rien ; le vario confirme."),
        },
        {
          heading: L("Heading: clock, then compass", "Cap : le chrono, puis le compas"),
          body: L("The compass is read wings level only.", "Le compas ne se lit qu’ailes à plat."),
        },
      ],
      foot: L(
        "FAA IFH ch. 6–7 · on the G1000: AHRS failure, standby instruments",
        "FAA IFH ch. 6–7 · sur le G1000 : panne d’AHRS, instruments de secours",
      ),
      reader: L(
        "Without the attitude and heading indicators, each job has its instrument: bank on the turn coordinator (level miniature aircraft, wings level; on the index, 3° per second), pitch on the altimeter with the vertical speed and the airspeed, heading from the clock in the turn and from the compass wings level. On the six-pack this is a vacuum failure; on the G1000 it is an AHRS failure, flown on the standby attitude indicator and the standby compass (FAA IFH ch. 6–7).",
        "Sans horizon ni conservateur de cap, chaque tâche a son instrument : l’inclinaison à l’indicateur de virage (avion à plat, ailes à plat ; sur le repère, 3° par seconde), l’assiette à l’altimètre avec le vario et la vitesse, le cap au chrono en virage et au compas ailes à plat. Sur les six instruments, c’est une panne de dépression ; sur le G1000, une panne d’AHRS, pilotée sur l’horizon de secours et le compas de secours (FAA IFH ch. 6–7).",
      ),
    }),
    heroStep("bp-compass", {
      eyebrow: L("The magnetic compass", "Le compas magnétique"),
      title: L("Why it lies in turns", "Pourquoi il ment en virage"),
      visual: [
        INST(
          COMPASS,
          L("Magnetic compass in a right turn through 330 towards north", "Compas magnétique en virage à droite, passant le 330 vers le nord"),
          GC.left,
          336,
          960,
          224,
          { id: "bp-compass.card", scene: "pp.north" },
        ),
        INST(
          GAUGE("tc"),
          L("Turn coordinator: standard-rate right turn", "Indicateur de virage : taux standard à droite"),
          GC.left,
          592,
          352,
          352,
          { id: "bp-compass.tc", scene: "pp.north" },
        ),
        T(
          "body",
          L(
            "Right turn towards north, 15° of bank. The card is read from behind: larger headings are on the left.",
            "Virage à droite vers le nord, 15° d’inclinaison. La rose se lit par l’arrière : les caps plus grands sont à gauche.",
          ),
          GC.left + 392,
          616,
          568,
          240,
          { color: "ink2" },
        ),
      ],
      points: [
        {
          heading: L("To north: roll out early", "Vers le nord : sortez avant"),
          body: L(
            "By the latitude plus your lead: about 55° at 47° N.",
            "De la latitude plus l’anticipation : environ 55° à 47° N.",
          ),
          color: "sel",
        },
        {
          heading: L("To south: roll out late", "Vers le sud : sortez après"),
          body: L(
            "By the latitude minus your lead: about 40°.",
            "De la latitude moins l’anticipation : environ 40°.",
          ),
          color: "key",
        },
        {
          heading: L("East or west: the speed", "Est ou ouest : la vitesse"),
          body: L(
            "Speeding up swings it north, slowing down south.",
            "Accélérer le dévie vers le nord, ralentir vers le sud.",
          ),
          color: "nav",
        },
      ],
      foot: L(
        "FAA IFH ch. 7 · PHAK ch. 8 · northern hemisphere · in the simulator the compass only lags",
        "FAA IFH ch. 7 · PHAK ch. 8 · hémisphère nord · au simulateur, le compas a seulement du retard",
      ),
      scene: "pp.north",
      reader: L(
        "Magnetic dip makes the compass wrong in turns and when the speed changes. Northern hemisphere: turning to north the compass lags, so roll out early, by the latitude plus your normal roll-out lead (about 55° at 47° N with 15° of bank); turning to south it leads, so roll out late, by the latitude minus the lead (about 40°). On east or west headings, accelerating swings it north and decelerating south. That is why the clock gives the heading in a turn and the compass is read only wings level and at a steady speed (FAA IFH ch. 7; FAA PHAK ch. 8). In the simulator the compass only lags: roll out on the clock, then read it wings level.",
        "L’inclinaison magnétique fausse le compas en virage et quand la vitesse change. Hémisphère nord : vers le nord le compas retarde, sortez donc avant, de la latitude plus votre anticipation habituelle (environ 55° à 47° N avec 15° d’inclinaison) ; vers le sud il avance, sortez donc après, de la latitude moins l’anticipation (environ 40°). Cap est ou ouest, accélérer le dévie vers le nord, ralentir vers le sud. Voilà pourquoi le chrono donne le cap en virage, et le compas ne se lit qu’ailes à plat et à vitesse stable (FAA IFH ch. 7 ; FAA PHAK ch. 8). Au simulateur, le compas a seulement du retard : sortez au chrono, puis lisez-le ailes à plat.",
      ),
    }),
    quizStep("bp-quiz", {
      eyebrow: L("Question", "Question"),
      title: L("Turning to north, compass only", "Virage vers le nord, au compas seul"),
      visual: [
        INST(
          COMPASS,
          L("Magnetic compass in a right turn through 300 towards north", "Compas magnétique en virage à droite, passant le 300 vers le nord"),
          GC.left,
          336,
          768,
          180,
          { id: "bp-quiz.card", scene: "pp.nw" },
        ),
        INST(
          GAUGE("tc"),
          L("Turn coordinator: standard-rate right turn", "Indicateur de virage : taux standard à droite"),
          GC.left,
          548,
          368,
          368,
          { id: "bp-quiz.tc", scene: "pp.nw" },
        ),
        T(
          "small",
          L(
            "Real aircraft, 47° N, right turn from 270 to 360, 15° of bank, no clock.",
            "Avion réel, 47° N, virage à droite du 270 vers le 360, 15° d’inclinaison, sans chrono.",
          ),
          GC.left + 400,
          572,
          368,
          200,
        ),
      ],
      quiz: mcq(
        L("You start the roll-out when the compass shows…", "Vous commencez la sortie quand le compas indique…"),
        [
          {
            text: L("About 305: well before N", "Environ 305 : bien avant le N"),
            why: L(
              "Right: 47° of latitude plus 8° of lead, about 55° early.",
              "Juste : 47° de latitude plus 8° d’anticipation, environ 55° avant.",
            ),
          },
          {
            text: L("N exactly", "N pile"),
            why: L(
              "Too late: the card lags turning to north, you would be far past it.",
              "Trop tard : la rose retarde vers le nord, vous seriez déjà bien au-delà.",
            ),
          },
          {
            text: L("About 040: after N", "Environ 040 : après le N"),
            why: L(
              "Rolling out late is the rule for south, not for north.",
              "Sortir après, c’est la règle du sud, pas du nord.",
            ),
          },
        ],
        0,
        L(
          "Undershoot north, overshoot south. Better still, time it: 90° is 30 s, whatever the compass says.",
          "Avant le nord, après le sud. Mieux encore, chronométrez : 90° font 30 s, quoi que dise le compas.",
        ),
      ),
      foot: L("FAA IFH ch. 7 · PHAK ch. 8", "FAA IFH ch. 7 · PHAK ch. 8"),
      scene: "pp.nw",
      reader: L(
        "Turning to north in the northern hemisphere, the compass lags: start the roll-out before it shows north, by the latitude plus the normal lead (about 55° at 47° N, so near 305 in a right turn). Better, time the turn.",
        "En virage vers le nord, dans l’hémisphère nord, le compas retarde : commencez la sortie avant qu’il indique le nord, de la latitude plus l’anticipation habituelle (environ 55° à 47° N, donc vers 305 en virage à droite). Mieux, chronométrez le virage.",
      ),
    }),
    formulaStep("bp-time", {
      eyebrow: L("Timed turns", "Virages chronométrés"),
      title: L("No heading indicator: the clock steers", "Sans cap : le chrono dirige"),
      visual: [
        DIAGRAM(
          "bp-time.turn",
          { kind: "calc", calc: { kind: "turn", tasKt: 101, bankDeg: 15.5 } },
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
        "Note the time as you roll in. Roll out on time, not on the compass.",
        "Notez l’heure en inclinant. Sortez à l’heure, pas sur le compas.",
      ),
      foot: L("FAA IFH ch. 7 · timed turns", "FAA IFH ch. 7 · virages chronométrés"),
      reader: [
        {
          t: "formula",
          formula: L("time (s) = turn (°) ÷ 3", "temps (s) = virage (°) ÷ 3"),
          ruleOfThumb: L(
            "The lesson's turns: 090 to 180 right, 30 s; 180 to 360 left, 60 s; 360 to 270 left, 30 s. Start the timer as you roll in (T in the cockpit) (FAA IFH ch. 7).",
            "Les virages de la leçon : 090 vers 180 à droite, 30 s ; 180 vers 360 à gauche, 60 s ; 360 vers 270 à gauche, 30 s. Lancez le chrono en inclinant (touche T dans le cockpit) (FAA IFH ch. 7).",
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 7" }],
        },
      ],
    }),
    yourTurnStep("bp-try", {
      eyebrow: L("Your turn · guided", "À vous · guidé"),
      title: L("A timed turn, partial panel", "Un virage chronométré"),
      rows: [
        { heading: L("90° right: 30 s", "90° à droite : 30 s"), small: L("work it out before you roll in", "calculez avant d’incliner") },
        { heading: L("Hold ▶, read the timer", "Maintenez ▶, lisez le chrono"), small: L("ET, bottom right of the panel", "ET, en bas à droite du tableau") },
        { heading: L("Wing on the index", "Aile sur le repère"), small: L("the turn coordinator still works", "l’indicateur de virage fonctionne") },
        { heading: L("Release 30 s later", "Relâchez 30 s plus tard"), small: L("in the aircraft: then read the compass", "en avion : lisez ensuite le compas") },
      ],
      view: LOWER_ROW,
      alt: L(
        "Turn coordinator, covered heading indicator, vertical speed and the flight timer",
        "Indicateur de virage, conservateur de cap masqué, variomètre et chrono de vol",
      ),
      scene: "pp.east",
      covers: PP_COVERS,
      prompt: L("Your turn: 30 s to the right at standard rate, then wings level", "À vous : 30 s à droite au taux standard, puis ailes à plat"),
      controls: ["bank"],
      goal: {
        all: [
          { id: "heading", p: { value: 180, tol: 15 } },
          { id: "bankMax", p: { max: 5 } },
        ],
        holdS: 3,
        graded: false,
        success: L("On 180 within 15°: the clock is enough.", "Au 180 à 15° près : le chrono suffit."),
      },
      hint: L(
        "Note the ET time, hold ▶, and release it when ET has gained 30 s.",
        "Notez le temps ET, maintenez ▶, et relâchez quand ET a gagné 30 s.",
      ),
      frame: [888, 376, 912, 310],
      rowsW: 720,
      foot: L("FAA IFH ch. 7 · ±15° passes on partial panel", "FAA IFH ch. 7 · ±15° en panneau partiel"),
      reader: L(
        "A timed turn: work out the time (90° is 30 s), roll in to standard rate on the turn coordinator and note the timer, roll out on time, wait for the compass to settle wings level, then correct the remainder. Your turn: from 090, hold the right bank button for 30 s with the heading indicator covered.",
        "Un virage chronométré : calculez le temps (90°, c’est 30 s), inclinez au taux standard sur l’indicateur de virage en notant le chrono, sortez à l’heure, laissez le compas se stabiliser ailes à plat, puis corrigez le reste. À vous : depuis le 090, maintenez le bouton d’inclinaison à droite pendant 30 s, conservateur de cap masqué.",
      ),
    }),
    practiceStep("bp-solo", {
      title: L("On your own: 180° to the left", "Seul : 180° à gauche"),
      intro: L(
        "Heading 180. ATC: **“Turn left heading 360.”** Work out the time first. Then hold ◀ with the wing on the index and release on time: **ET**, bottom right of the panel, is your clock.",
        "Cap 180. Le contrôle : **« Tournez à gauche, cap 360. »** Calculez d’abord la durée. Puis maintenez ◀, l’aile sur le repère, et relâchez à l’heure : **ET**, en bas à droite du tableau, est votre chrono.",
      ),
      rows: [
        { text: L("Heading **360**, within 15°", "Cap **360**, à 15° près"), check: 0 },
        { text: L("Wings level", "Ailes à plat"), check: 1 },
      ],
      after: L(
        "180 to 360 is **180°: 60 s**. You steered to a heading you could not see, with a turn coordinator and a clock. The compass only confirms it afterwards, wings level.",
        "Du 180 au 360, **180° : 60 s**. Vous avez pris un cap que vous ne voyiez pas, avec un indicateur de virage et un chrono. Le compas ne fait que confirmer ensuite, ailes à plat.",
      ),
      takeaway: L(
        "The clock gives the heading in the turn; the compass confirms it wings level.",
        "Le chrono donne le cap en virage ; le compas le confirme ailes à plat.",
      ),
      panes: [LOWER_ROW_PANE],
      scene: "pp.south",
      covers: PP_COVERS,
      controls: ["bank"],
      assist: { holdAlt: true, holdIas: true },
      goal: {
        all: [
          { id: "heading", p: { value: 360, tol: 15 } },
          { id: "bankMax", p: { max: 5 } },
        ],
        holdS: 3,
        graded: false,
        success: L("On 360 within 15°, wings level: 180° in 60 s.", "Au 360 à 15° près, ailes à plat : 180° en 60 s."),
      },
      hint: L(
        "180° ÷ 3 = 60 s. Note ET, hold ◀, release when ET has gained one minute.",
        "180° ÷ 3 = 60 s. Notez ET, maintenez ◀, relâchez quand ET a gagné une minute.",
      ),
      minutes: 3,
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
          fix: L("Start it as you roll in, every time.", "Lancez-le en inclinant, à chaque fois."),
        },
      ],
      foot: L("Lesson standards · FAA IFH ch. 7", "Critères de la leçon · FAA IFH ch. 7"),
      reader: L(
        "Common mistakes: rolling out on the compass reading during the turn, letting the bank creep with no attitude indicator, and forgetting to start the timer as you roll in.",
        "Erreurs fréquentes : sortir sur l’indication du compas pendant le virage, laisser l’inclinaison dériver sans horizon, et oublier de lancer le chrono en inclinant.",
      ),
    }),
    checkStep("bp-check-time", L("Recap 1 of 3: the time", "Récap 1 sur 3 : la durée"), {
      lead: L(
        "Without looking back. Partial panel, heading 360. ATC: **“Turn left heading 270.”**",
        "Sans revenir en arrière. Panneau partiel, cap 360. Le contrôle : **« Tournez à gauche, cap 270. »**",
      ),
      quiz: mcq(
        L("How long do you hold the turn?", "Combien de temps tenez-vous le virage ?"),
        [
          { text: L("30 s", "30 s"), why: L("Right: 360 to 270 by the left is 90°.", "Juste : du 360 au 270 par la gauche, 90°.") },
          { text: L("60 s", "60 s"), why: L("60 s is 180°: you would roll out on 180.", "60 s font 180° : vous sortiriez au 180.") },
          {
            text: L("90 s", "90 s"),
            why: L("90 s is 270°: that is the long way round, by the right.", "90 s font 270° : c’est le grand tour, par la droite."),
          },
        ],
        0,
        L("The turn is 90° to the left: 90 ÷ 3 = 30 s.", "Le virage fait 90° à gauche : 90 ÷ 3 = 30 s."),
      ),
    }),
    checkStep("bp-check-south", L("Recap 2 of 3: the compass", "Récap 2 sur 3 : le compas"), {
      lead: L(
        "A real aircraft at 47° N, no clock. You turn to **south** with 15° of bank.",
        "Un avion réel à 47° N, sans chrono. Vous virez vers le **sud** avec 15° d’inclinaison.",
      ),
      quiz: mcq(
        L("You start the roll-out when the compass shows…", "Vous commencez la sortie quand le compas indique…"),
        [
          {
            text: L("About 55° before S", "Environ 55° avant le S"),
            why: L("Rolling out early is the rule for north.", "Sortir avant, c’est la règle du nord."),
          },
          {
            text: L("S exactly", "S pile"),
            why: L(
              "Too early: turning to south the card leads, the aircraft is not there yet.",
              "Trop tôt : vers le sud la rose avance, l’avion n’y est pas encore.",
            ),
          },
          {
            text: L("About 40° past S", "Environ 40° après le S"),
            why: L("Right: the latitude minus the lead, 47 − 8.", "Juste : la latitude moins l’anticipation, 47 − 8."),
          },
        ],
        2,
        L(
          "Undershoot north, overshoot south: to south the compass leads, so let it pass S by about 40°.",
          "Avant le nord, après le sud : vers le sud le compas avance, laissez-le donc dépasser le S d’environ 40°.",
        ),
      ),
    }),
    checkStep("bp-check-speed", L("Recap 3 of 3: the speed", "Récap 3 sur 3 : la vitesse"), {
      lead: L(
        "Wings level on heading **090**, in a real aircraft. You add power and the speed increases.",
        "Ailes à plat au cap **090**, dans un avion réel. Vous remettez de la puissance et la vitesse augmente.",
      ),
      quiz: mcq(
        L("While you accelerate, the compass…", "Pendant l’accélération, le compas…"),
        [
          {
            text: L("Swings towards north", "Dévie vers le nord"),
            why: L("Right: accelerate north, decelerate south, on east or west.", "Juste : accélérer, nord ; ralentir, sud ; cap est ou ouest."),
          },
          {
            text: L("Swings towards south", "Dévie vers le sud"),
            why: L("That happens when you slow down.", "C’est en ralentissant."),
          },
          {
            text: L("Does not move", "Ne bouge pas"),
            why: L("That is true only on north or south headings.", "Ce n’est vrai que cap nord ou sud."),
          },
        ],
        0,
        L(
          "On east or west headings a speed change swings the card: read the compass at a steady speed.",
          "Cap est ou ouest, un changement de vitesse fait dévier la rose : lisez le compas à vitesse stable.",
        ),
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
        "Attitude and heading failed: three timed turns at 4,000 ft with the compass and the clock. On the G1000 you fly the standby attitude indicator; on the six-pack, the turn coordinator.",
        "Horizon et cap en panne : trois virages chronométrés à 4 000 ft au compas et au chrono. Sur le G1000 vous pilotez l’horizon de secours ; sur les six instruments, l’indicateur de virage.",
      ),
      [
        L("Timer (T) as you roll in.", "Chrono (touche T) en inclinant."),
        L("Read the compass wings level.", "Compas lu ailes à plat."),
        L(
          "To pass: altitude ±100 ft, roll-out ±15°, bank 30° at most.",
          "Pour réussir : altitude ±100 ft, sortie ±15°, inclinaison 30° au plus.",
        ),
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
        "The briefing of the partial-panel lesson: what is left, why the compass lies in turns (UNOS, ANDS), timed turns on the clock, two turns on the instruments, then fly it.",
        "Le briefing de la leçon panneau partiel : ce qui reste, pourquoi le compas ment en virage (UNOS, ANDS), les virages au chrono, deux virages aux instruments, puis le vol.",
      ),
      tags: ["ifr", "partial-panel", "compass"],
      minutes: 14,
    },
    steps,
    compassScenes(),
  );
}
