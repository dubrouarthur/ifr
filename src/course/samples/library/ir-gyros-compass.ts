// Ground school — course library (A1): gyro instruments, the magnetic compass and partial panel. Rigidity and
// precession, which gyro runs on what in the C172S, heading-indicator drift, variation and deviation (TVMDC), the
// acceleration and turning errors, timed turns, recognising a vacuum failure; partial panel on the live six-pack
// with the failed gyros covered, a tap on the failed instrument, and two partial-panel lessons flown.
// Sources: FAA-H-8083-25C PHAK ch. 8 "Flight Instruments" (gyroscopic instruments, the magnetic compass: variation,
// deviation, acceleration and turning errors); FAA-H-8083-15B IFH ch. 5 and ch. 7 (partial panel, compass turns,
// timed turns); FAA-S-ACS-8C IR ACS (recovery from unusual attitudes, partial panel); EASA AMC1 FCL.615(b);
// C172S POH sect. 3 "Vacuum System Failure", "Emergency Operation in Clouds", sect. 7 "Vacuum Gage" (desired
// suction 4.5 to 5.5 inHg; the low-vacuum annunciation below 3.0 inHg).
import type { Course, SimScene, SlideBlock, Step } from "../../types";
import { DIAGRAM, INST, L, MARK, T, course, slideStep, step } from "../kit";
import { G, foot, head, slide } from "../navSlides";
import {
  GAUGE,
  S,
  coverStep,
  dec,
  flyStep,
  formulaStep,
  heroGauge,
  heroStep,
  mcq,
  quizStep,
  whyStep,
} from "../briefings/kit";
import {
  SIX,
  panelNotesStep,
  recapStep,
  sceneA1,
  sixMark,
  turnStep,
} from "./kit-a1";

export const IR_GYROS_COMPASS_ID = "sample-lib-ir-gyros-compass";

const AREA = { fix: "PARD", radial: 160, distNm: 18 };

function scenes(): Record<string, SimScene> {
  return {
    "gc.level": sceneA1(
      "gc.level",
      { pos: AREA, altFt: 4000, hdg: 90, iasKt: 95 },
      { label: "4,000 ft · heading 090 · 95 KIAS" },
    ),
    "gc.left": sceneA1(
      "gc.left",
      { pos: AREA, altFt: 4000, hdg: 60, iasKt: 95, bank: -15 },
      { label: "Standard-rate left turn · 4,000 ft · 95 KIAS" },
    ),
    "gc.pp": sceneA1(
      "gc.pp",
      { pos: AREA, altFt: 4000, hdg: 45, iasKt: 95 },
      { label: "Partial panel · heading 045 · 4,000 ft", covers: ["ai", "dg"] },
    ),
    "gc.vac": sceneA1(
      "gc.vac",
      { pos: AREA, altFt: 4000, hdg: 90, iasKt: 95 },
      {
        label: "Vacuum pump failed · 4,000 ft · heading 090",
        failures: { vacuum: true },
      },
    ),
  };
}

const F6: [number, number, number, number] = [G.left, 192, 960, 720];
const HERO6: [number, number, number, number] = [G.left, 288, 928, 696];
const mark = (g: "ai" | "hsi" | "tc", f = F6): [number, number] => {
  const m = sixMark(1, g, f, { corner: "tl" });
  return [m.frame.x + 28, m.frame.y + 28];
};

export function irGyrosCompassCourse(): Course {
  const steps: Step[] = [
    // 1 ------------------------------------------------------------------ cover
    coverStep(
      "gc-cover",
      L(
        "Gyros and compass: partial panel",
        "Gyros et compas : la panne partielle",
      ),
      {
        eyebrow: L(
          "Instrument rating · Flight instruments",
          "Qualification IR · Instruments de vol",
        ),
        main: L("Gyros and compass", "Gyros et compas"),
        sub: L("flying partial panel", "voler en panne partielle"),
        lead: L(
          "What spins, what it runs on, and how to fly when it stops.",
          "Ce qui tourne, ce qui l’entraîne, et comment voler quand il s’arrête.",
        ),
        meta: L(
          "17 steps · about 50 min · FAA PHAK ch. 8 · IFH ch. 7",
          "17 étapes · environ 50 min · FAA PHAK ch. 8 · IFH ch. 7",
        ),
        hero: [
          heroGauge(
            "gc-cover.ai",
            "ai",
            L(
              "Attitude indicator in level flight",
              "Horizon artificiel en palier",
            ),
            "gc.level",
            { mode: "live" },
          ),
        ],
        scene: "gc.level",
        reader: L(
          "Gyro instruments, the magnetic compass and partial panel: how the attitude and heading indicators work and fail, the turn coordinator as the back-up, variation and deviation, the compass errors, timed turns, and two partial-panel lessons flown in the cockpit.",
          "Instruments gyroscopiques, compas magnétique et panne partielle : comment fonctionnent et tombent en panne l’horizon et le conservateur de cap, l’indicateur de virage en secours, déclinaison et déviation, les erreurs du compas, les virages chronométrés, et deux leçons de panne partielle volées dans le cockpit.",
        ),
      },
    ),
    // 2 ------------------------------------------------------------------ why
    whyStep("gc-why", {
      eyebrow: L("Why it matters", "Pourquoi c’est important"),
      title: L(
        "A vacuum failure is quiet",
        "Une panne de dépression est silencieuse",
      ),
      n: dec(4.5),
      nW: 264,
      unit: L("to 5.5 inHg", "à 5,5 inHg"),
      color: "key",
      statement: L(
        "The suction the C172S gyros need",
        "La dépression qu’il faut aux gyros du C172S",
      ),
      body: L(
        "Out of range, the attitude and heading indicators are not reliable, even if they look normal.",
        "Hors plage, l’horizon et le conservateur de cap ne sont plus fiables, même s’ils semblent normaux.",
      ),
      sideTitle: L("The cues", "Les indices"),
      side: [
        {
          n: dec(3.0),
          text: L(
            "inHg: below it, the low-vacuum light",
            "inHg : en dessous, l’alarme de dépression",
          ),
          color: "key",
        },
        {
          n: L("Slow", "Lent"),
          text: L(
            "the AI drifts, the heading creeps",
            "l’horizon dérive, le cap glisse",
          ),
        },
      ],
      foot: L(
        "C172S POH sect. 7 · vacuum gage, low vacuum annunciation",
        "C172S POH sect. 7 · dépressiomètre, alarme de basse dépression",
      ),
      reader: L(
        "The C172S POH (section 7) gives a desired suction range of 4.5 to 5.5 inches of mercury: out of it, the attitude and heading indicators should not be considered reliable. A pump output below 3.0 inHg lights the low-vacuum annunciation. Nothing else warns you: the gyros run down slowly, the attitude indicator drifts and the heading creeps.",
        "Le POH du C172S (section 7) donne une dépression souhaitée de 4,5 à 5,5 pouces de mercure : en dehors, l’horizon et le conservateur de cap ne doivent pas être considérés comme fiables. Sous 3,0 inHg en sortie de pompe, l’alarme de basse dépression s’allume. Rien d’autre ne prévient : les gyros ralentissent doucement, l’horizon dérive et le cap glisse.",
      ),
    }),
    // 3 ------------------------------------------------------------------ predict
    quizStep("gc-predict", {
      eyebrow: L("Predict", "Prédisez"),
      title: L("Two instruments disagree", "Deux instruments se contredisent"),
      visual: [
        INST(
          GAUGE("tc"),
          L(
            "Turn coordinator: standard-rate left turn",
            "Indicateur de virage : virage à gauche au taux standard",
          ),
          216,
          336,
          576,
          576,
          {
            id: "gc-predict.tc",
            scene: "gc.left",
          },
        ),
      ],
      quiz: mcq(
        L(
          "AI wings level, TC in a left turn, heading decreasing. Which has failed?",
          "Horizon à plat, indicateur en virage à gauche, cap qui diminue. Lequel est en panne ?",
        ),
        [
          {
            text: L("The attitude indicator", "L’horizon artificiel"),
            why: L(
              "Right: the TC and the heading agree, the AI is the odd one out.",
              "Juste : l’indicateur et le cap s’accordent, l’horizon est seul contre eux.",
            ),
          },
          {
            text: L("The turn coordinator", "L’indicateur de virage"),
            why: L(
              "The heading is decreasing too: the turn is real.",
              "Le cap diminue aussi : le virage est réel.",
            ),
          },
          {
            text: L("The heading indicator", "Le conservateur de cap"),
            why: L(
              "It agrees with the turn coordinator.",
              "Il est d’accord avec l’indicateur de virage.",
            ),
          },
        ],
        0,
        L(
          "Two instruments against one: trust the two, cover the one.",
          "Deux instruments contre un : croyez les deux, masquez l’autre.",
        ),
      ),
      foot: L(
        "FAA IFH ch. 7 · partial panel · cross-check",
        "FAA IFH ch. 7 · panne partielle · contre-vérification",
      ),
      reader: L(
        "The attitude indicator shows wings level, but the turn coordinator shows a standard-rate left turn and the heading is decreasing. Two independent instruments agree on a left turn: the attitude indicator has failed. Cover it and fly the turn coordinator (FAA IFH ch. 7).",
        "L’horizon artificiel montre les ailes à plat, mais l’indicateur de virage montre un virage à gauche au taux standard et le cap diminue. Deux instruments indépendants s’accordent sur un virage à gauche : l’horizon est en panne. Masquez-le et pilotez à l’indicateur de virage (FAA IFH ch. 7).",
      ),
    }),
    // 4 ------------------------------------------------------------------ what runs on what
    panelNotesStep("gc-power", {
      eyebrow: L("Gyro instruments", "Les instruments gyroscopiques"),
      title: L("Vacuum or electric", "Dépression ou électrique"),
      lead: L(
        "Two power sources: one failure leaves the other.",
        "Deux sources : une panne laisse l’autre.",
      ),
      view: SIX,
      alt: L(
        "The C172S six-pack: attitude and heading indicators on vacuum, turn coordinator electric",
        "Les six instruments du C172S : horizon et cap sur dépression, indicateur de virage électrique",
      ),
      scene: "gc.level",
      mode: "live",
      frame: F6,
      marks: [mark("ai"), mark("hsi"), mark("tc")],
      rows: [
        {
          heading: L("Attitude: vacuum", "Horizon : dépression"),
          body: L(
            "Rigidity in space holds the horizon.",
            "La fixité dans l’espace tient l’horizon.",
          ),
        },
        {
          heading: L("Heading: vacuum", "Cap : dépression"),
          body: L(
            "Precession makes it drift.",
            "La précession le fait dériver.",
          ),
        },
        {
          heading: L("Turn coordinator: electric", "Virage : électrique"),
          body: L(
            "Your back-up when the vacuum fails.",
            "Votre secours si la dépression tombe.",
          ),
        },
      ],
      foot: L(
        "FAA PHAK ch. 8 · C172S POH sect. 3 and 7",
        "FAA PHAK ch. 8 · C172S POH sect. 3 et 7",
      ),
      reader: L(
        "A spinning gyro has rigidity in space (it keeps its orientation) and precession (a force on it acts 90° later in the direction of rotation). In the C172S the attitude indicator and the directional (heading) indicator are vacuum-driven; the turn coordinator is electric, so a vacuum failure leaves it working (FAA PHAK ch. 8; C172S POH sections 3 and 7).",
        "Un gyroscope en rotation a la fixité dans l’espace (il garde son orientation) et la précession (une force appliquée agit 90° plus loin dans le sens de rotation). Sur le C172S, l’horizon artificiel et le conservateur de cap sont entraînés par la dépression ; l’indicateur de virage est électrique, il continue donc de fonctionner après une panne de dépression (FAA PHAK ch. 8 ; C172S POH sections 3 et 7).",
      ),
    }),
    // 5 ------------------------------------------------------------------ heading-indicator drift
    heroStep("gc-drift", {
      eyebrow: L("The heading indicator", "Le conservateur de cap"),
      title: L("It drifts: realign it", "Il dérive : recalez-le"),
      visual: [
        INST(
          GAUGE("hsi"),
          L(
            "Heading indicator on heading 090",
            "Conservateur de cap au cap 090",
          ),
          216,
          288,
          696,
          696,
          {
            id: "gc-drift.hi",
            scene: "gc.level",
            mode: "live",
          },
        ),
      ],
      points: [
        {
          heading: L("Precession", "La précession"),
          body: L(
            "Friction makes the card creep away from the real heading.",
            "Les frottements font glisser la rose loin du vrai cap.",
          ),
        },
        {
          heading: L("Every 15 minutes", "Toutes les 15 minutes"),
          body: L(
            "Check it against the magnetic compass.",
            "Comparez-le au compas magnétique.",
          ),
        },
        {
          heading: L("Straight and steady", "En ligne droite, stable"),
          body: L(
            "Read the compass only in unaccelerated flight.",
            "Lisez le compas seulement sans accélération.",
          ),
        },
      ],
      foot: L(
        "FAA PHAK ch. 8 · heading indicator",
        "FAA PHAK ch. 8 · conservateur de cap",
      ),
      reader: L(
        "The heading indicator is not magnetic: precession from bearing friction makes it drift. Check and realign it with the magnetic compass about every 15 minutes, in straight and level, unaccelerated flight, when the compass reads correctly (FAA PHAK ch. 8).",
        "Le conservateur de cap n’est pas magnétique : la précession due aux frottements le fait dériver. Comparez-le et recalez-le sur le compas magnétique environ toutes les 15 minutes, en vol rectiligne en palier, sans accélération, quand le compas lit juste (FAA PHAK ch. 8).",
      ),
    }),
    // 6 ------------------------------------------------------------------ your turn: partial panel
    turnStep("gc-pp", {
      eyebrow: L("Your turn", "À vous"),
      title: L(
        "Partial panel: hold it level",
        "Panne partielle : tenez le palier",
      ),
      rows: [
        {
          heading: L("Wings level on the TC", "Ailes à plat au virage"),
          small: L(
            "the little aircraft on the horizon line",
            "la maquette sur la ligne d’horizon",
          ),
        },
        {
          heading: L(
            "Pitch on altimeter and VSI",
            "Assiette : altimètre, vario",
          ),
          small: L(
            "small changes, then wait",
            "de petites corrections, puis attendre",
          ),
        },
      ],
      checks: [
        { text: L("Bank 20° or less", "Inclinaison 20° au plus") },
        {
          text: L("Altitude 3,900 to 4,100 ft", "Altitude 3 900 à 4 100 ft"),
          readout: "alt",
        },
      ],
      view: SIX,
      alt: L(
        "Live six-pack with the attitude and heading indicators covered",
        "Six instruments en direct, horizon et cap masqués",
      ),
      scene: "gc.pp",
      covers: ["ai", "dg"],
      prompt: L(
        "Your turn: hold the wings level and 4,000 ft for 45 s",
        "À vous : tenez les ailes à plat et 4 000 ft pendant 45 s",
      ),
      controls: ["pitch", "bank"],
      assist: { holdIas: true },
      goal: {
        all: [
          { id: "bankMax", p: { max: 20 } },
          { id: "altBand", p: { min: 3900, max: 4100 } },
        ],
        holdS: 45,
        graded: false,
        success: L(
          "45 s on the turn coordinator and the altimeter.",
          "45 s à l’indicateur de virage et à l’altimètre.",
        ),
      },
      hint: L(
        "Level the TC wings, then fix the altitude.",
        "Mettez l’aile du TC à plat, puis l’altitude.",
      ),
      foot: L(
        "FAA IFH ch. 7 · C172S POH sect. 3: emergency operation in clouds",
        "FAA IFH ch. 7 · C172S POH sect. 3 : vol en nuages en secours",
      ),
      reader: L(
        "Your turn with the attitude and heading indicators covered, as after a vacuum failure. Keep the wings level with the turn coordinator (its small aircraft on the horizon line) and the pitch with the altimeter and VSI, for 45 seconds. The stage holds the airspeed (FAA IFH ch. 7; C172S POH section 3).",
        "À vous avec l’horizon et le conservateur de cap masqués, comme après une panne de dépression. Tenez les ailes à plat à l’indicateur de virage (sa maquette sur la ligne d’horizon) et l’assiette à l’altimètre et au variomètre, pendant 45 secondes. La scène tient la vitesse (FAA IFH ch. 7 ; C172S POH section 3).",
      ),
    }),
    // 7 ------------------------------------------------------------------ variation and deviation
    heroStep("gc-tvmdc", {
      eyebrow: L("The magnetic compass", "Le compas magnétique"),
      title: L("True, magnetic, compass", "Vrai, magnétique, compas"),
      visual: [
        DIAGRAM(
          "gc-tvmdc.d",
          {
            kind: "calc",
            calc: {
              kind: "compass",
              tc: 90,
              wca: -8,
              variation: -3,
              deviation: 2,
            },
          },
          L(
            "Heading tape: true course 090, wind correction −8°, variation 3° W, deviation +2°",
            "Bande de cap : route vraie 090, correction de dérive −8°, déclinaison 3° W, déviation +2°",
          ),
          G.left,
          336,
          960,
          600,
        ),
      ],
      points: [
        {
          heading: L("Variation", "La déclinaison"),
          body: L(
            "True to magnetic, from the chart. West is best, east is least.",
            "Du vrai au magnétique, sur la carte. Ouest : on ajoute.",
          ),
        },
        {
          heading: L("Deviation", "La déviation"),
          body: L(
            "Magnetic to compass: the aircraft’s own fields.",
            "Du magnétique au compas : le champ de l’avion.",
          ),
        },
        {
          heading: L("The card", "La carte de déviation"),
          body: L(
            "Read it beside the compass, for each heading.",
            "À lire près du compas, pour chaque cap.",
          ),
        },
      ],
      foot: L(
        "FAA PHAK ch. 8 and 16 · variation, deviation",
        "FAA PHAK ch. 8 et 16 · déclinaison, déviation",
      ),
      reader: L(
        "From true to compass heading: true course, plus or minus the wind correction (true heading), plus westerly or minus easterly variation (magnetic heading: “west is best, east is least”), then the deviation from the card mounted beside the compass (compass heading). Variation comes from the isogonic lines of the chart; deviation from the aircraft’s own magnetic fields (FAA PHAK ch. 8 and 16).",
        "Du cap vrai au cap compas : la route vraie, plus ou moins la correction de dérive (cap vrai), plus la déclinaison ouest ou moins la déclinaison est (cap magnétique), puis la déviation lue sur la carte fixée près du compas (cap compas). La déclinaison se lit sur les isogones de la carte ; la déviation vient des champs magnétiques propres à l’avion (FAA PHAK ch. 8 et 16).",
      ),
    }),
    // 8 ------------------------------------------------------------------ calc
    step(
      "gc-tvmdc-calc",
      "calc",
      L(
        "From true course to compass heading",
        "De la route vraie au cap compas",
      ),
      [],
      {
        minutes: 3,
        calc: { generatorId: "vfr.tvmdc" },
      },
    ),
    // 9 ------------------------------------------------------------------ the compass errors
    compassErrors(),
    // 11 ----------------------------------------------------------------- quiz
    quizStep("gc-unos-quiz", {
      eyebrow: L("Question", "Question"),
      title: L("Compass turn to north", "Virage au compas vers le nord"),
      quote: L(
        "At 45° N, turning left from 090 to 360.",
        "À 45° N, virage à gauche du 090 au 360.",
      ),
      quiz: mcq(
        L(
          "Start the roll-out when the compass shows…",
          "Commencez la sortie quand le compas indique…",
        ),
        [
          {
            text: L("About 045°, before north", "Environ 045°, avant le nord"),
            why: L(
              "Right: undershoot north by about the latitude.",
              "Juste : on sort avant le nord, d’environ la latitude.",
            ),
          },
          {
            text: L("360°", "360°"),
            why: L(
              "Too late: the compass lags towards north.",
              "Trop tard : le compas retarde vers le nord.",
            ),
          },
          {
            text: L("About 315°, past north", "Environ 315°, après le nord"),
            why: L(
              "That is the overshoot rule, for south.",
              "C’est la règle du dépassement, pour le sud.",
            ),
          },
        ],
        0,
        L(
          "Undershoot north by about 45°, plus your usual lead.",
          "Avant le nord d’environ 45°, plus l’anticipation habituelle.",
        ),
      ),
      foot: L(
        "FAA PHAK ch. 8 · UNOS: undershoot north, overshoot south",
        "FAA PHAK ch. 8 · UNOS : avant le nord, après le sud",
      ),
      reader: L(
        "Turning to north at 45° N, the compass lags by about the latitude: roll out when it shows about 045°, plus your usual roll-out lead, and the aircraft settles on north. On a south heading it would be the reverse (FAA PHAK ch. 8).",
        "En virant vers le nord à 45° N, le compas retarde d’environ la latitude : sortez quand il indique environ 045°, plus l’anticipation habituelle, et l’avion se stabilise au nord. Vers le sud ce serait l’inverse (FAA PHAK ch. 8).",
      ),
    }),
    // 12 ----------------------------------------------------------------- timed turns
    formulaStep("gc-timed", {
      eyebrow: L("Timed turns", "Virages chronométrés"),
      title: L(
        "No heading indicator? Use the clock",
        "Plus de cap ? Le chronomètre",
      ),
      visual: [
        DIAGRAM(
          "gc-timed.turn",
          { kind: "calc", calc: { kind: "turn", tasKt: 101, bankDeg: 15 } },
          L(
            "Standard-rate turn at 101 kt true airspeed: about 15° of bank, 3° per second",
            "Virage au taux standard à 101 kt de vitesse propre : environ 15° d’inclinaison, 3° par seconde",
          ),
          G.left,
          336,
          960,
          648,
        ),
      ],
      formula: L("{time} = [{change}/3]", "{temps} = [{écart}/3]"),
      units: L(
        "seconds · degrees · at standard rate",
        "secondes · degrés · au taux standard",
      ),
      lines: [
        L("90° | 90 ÷ 3 = !30 s!", "90° | 90 ÷ 3 = !30 s!"),
        L("180° | 180 ÷ 3 = !60 s!", "180° | 180 ÷ 3 = !60 s!"),
      ],
      after: L(
        "Start the clock as you roll in; roll out on time.",
        "Lancez le chrono en inclinant ; sortez à l’heure.",
      ),
      foot: L(
        "FAA IFH ch. 7 · timed turns · C172S POH sect. 3: 180° turn in clouds",
        "FAA IFH ch. 7 · virages chronométrés · C172S POH sect. 3 : demi-tour en nuages",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "time (s) = heading change (°) ÷ 3, at standard rate",
            "temps (s) = changement de cap (°) ÷ 3, au taux standard",
          ),
          ruleOfThumb: L(
            "With the wing of the turn coordinator on the index, the aircraft turns 3° per second: 90° in 30 s, 180° in 60 s. Start the clock as the turn begins and roll out when the time is up. The C172S POH 180° turn in clouds uses exactly this: 60 seconds on the index, then check the compass.",
            "Aile de l’indicateur de virage sur le repère, l’avion tourne de 3° par seconde : 90° en 30 s, 180° en 60 s. Lancez le chronomètre au début du virage et sortez à la fin du temps. Le demi-tour en nuages du POH du C172S fait exactement cela : 60 secondes sur le repère, puis vérifier le compas.",
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 7" }],
        },
      ],
    }),
    // 13 ----------------------------------------------------------------- numeric quiz
    step(
      "gc-timed-quiz",
      "quiz",
      L("How long is the turn?", "Combien dure le virage ?"),
      [
        {
          t: "text",
          text: L(
            "Partial panel, heading 045 on the compass. ATC: “turn right heading 180”.",
            "Panne partielle, cap 045 au compas. ATC : « virez à droite cap 180 ».",
          ),
        },
      ],
      {
        minutes: 1,
        section: "check",
        stage: {
          panes: [{ kind: "six" }],
          mode: "frozen",
          scene: "gc.pp",
          covers: ["ai", "dg"],
        },
        quiz: {
          kind: "numeric",
          prompt: L(
            "At standard rate, how many seconds?",
            "Au taux standard, combien de secondes ?",
          ),
          answer: 45,
          tol: 1,
          unit: "s",
          explain: L(
            "From 045 to 180 to the right is 135°. 135 ÷ 3 = 45 seconds on the index, then wings level and check the compass once it settles.",
            "Du 045 au 180 par la droite, il y a 135°. 135 ÷ 3 = 45 secondes sur le repère, puis ailes à plat et contrôle du compas une fois stabilisé.",
          ),
        },
      },
    ),
    // 14 ----------------------------------------------------------------- recognising a vacuum failure
    heroStep("gc-vacuum", {
      eyebrow: L("Recognise it", "La reconnaître"),
      title: L("A vacuum failure, live", "Une panne de dépression, en direct"),
      visual: [
        INST(
          SIX,
          L(
            "Live six-pack after a vacuum pump failure: the attitude indicator starts to drift",
            "Six instruments en direct après une panne de pompe à vide : l’horizon commence à dériver",
          ),
          ...HERO6,
          {
            id: "gc-vacuum.six",
            scene: "gc.vac",
            mode: "live",
            failures: { vacuum: true },
          },
        ),
      ],
      points: [
        {
          heading: L("Light and gauge", "Alarme et cadran"),
          body: L(
            "Low-vacuum light, suction out of 4.5–5.5.",
            "Alarme de dépression, hors 4,5–5,5.",
          ),
        },
        {
          heading: L("Cross-check the AI", "Contrôlez l’horizon"),
          body: L(
            "Against the TC, altimeter and VSI.",
            "Contre le virage, l’altimètre, le vario.",
          ),
        },
        {
          heading: L("Cover, then fly", "Masquez, puis pilotez"),
          body: L(
            "Partial panel; tell ATC.",
            "Panne partielle ; prévenez l’ATC.",
          ),
        },
      ],
      foot: L(
        "C172S POH sect. 3 · vacuum system failure",
        "C172S POH sect. 3 · panne du circuit de dépression",
      ),
      reader: L(
        "Recognising a vacuum failure: the low-vacuum annunciation, or the vacuum gauge out of its 4.5–5.5 inHg range (C172S POH section 3: check the vacuum gauge; out of limits, partial-panel procedures may be required). Cross-check the attitude indicator against the turn coordinator, altimeter and VSI. Cover the failed gyros, fly partial panel and tell ATC.",
        "Reconnaître une panne de dépression : l’alarme de basse dépression, ou le dépressiomètre hors de sa plage 4,5–5,5 inHg (C172S POH section 3 : vérifier le dépressiomètre ; hors limites, les procédures de panne partielle peuvent être nécessaires). Contrôlez l’horizon contre l’indicateur de virage, l’altimètre et le variomètre. Masquez les gyros en panne, pilotez en panne partielle et prévenez l’ATC.",
      ),
    }),
    // 15 ----------------------------------------------------------------- tap the failed instrument
    step(
      "gc-tap",
      "tap",
      L(
        "Tap the instrument to cover first",
        "Touchez l’instrument à masquer d’abord",
      ),
      [
        {
          t: "text",
          text: L(
            "The vacuum pump has just failed. Watch the six-pack for a few seconds, then tap the instrument that will mislead you about the bank.",
            "La pompe à vide vient de tomber en panne. Observez les six instruments quelques secondes, puis touchez celui qui va vous tromper sur l’inclinaison.",
          ),
        },
      ],
      {
        minutes: 1,
        section: "check",
        stage: {
          panes: [{ kind: "six" }],
          mode: "live",
          scene: "gc.vac",
          failuresOnEnter: { vacuum: true },
          assist: { holdAlt: true, holdIas: true },
        },
        quiz: {
          kind: "tap",
          prompt: L(
            "Which instrument will mislead you about the bank?",
            "Quel instrument va vous tromper sur l’inclinaison ?",
          ),
          target: { pane: 0, rect: [366, 90, 292, 292] },
          explain: L(
            "The attitude indicator: it is vacuum-driven and drifts. Cover it, and the heading indicator too; fly the turn coordinator.",
            "L’horizon artificiel : il est entraîné par la dépression et dérive. Masquez-le, ainsi que le conservateur de cap ; pilotez à l’indicateur de virage.",
          ),
        },
      },
    ),
    // 16 ----------------------------------------------------------------- recap
    recapStep("gc-recap", {
      title: L(
        "Partial panel in three numbers",
        "La panne partielle en trois repères",
      ),
      cols: [
        {
          n: S("15"),
          text: L(
            "minutes between compass checks",
            "minutes entre deux recalages",
          ),
          color: "key",
        },
        {
          n: S("3°/s"),
          text: L("standard rate: 90° in 30 s", "taux standard : 90° en 30 s"),
          color: "key",
        },
        {
          n: S("UNOS"),
          text: L(
            "undershoot north, overshoot south",
            "avant le nord, après le sud",
          ),
          color: "key",
        },
      ],
      checks: [
        L(
          "Two against one: cover the odd one",
          "Deux contre un : masquez l’intrus",
        ),
        L("Suction 4.5 to 5.5 inHg", "Dépression 4,5 à 5,5 inHg"),
        L(
          "Accelerate north, decelerate south",
          "Accélérer nord, décélérer sud",
        ),
      ],
      foot: L(
        "FAA PHAK ch. 8 · FAA IFH ch. 7 · C172S POH sect. 3 and 7",
        "FAA PHAK ch. 8 · FAA IFH ch. 7 · C172S POH sect. 3 et 7",
      ),
      reader: L(
        "Realign the heading indicator with the compass about every 15 minutes; a standard-rate turn is 3° per second (90° in 30 s); turning to north undershoot, to south overshoot (UNOS). When two instruments disagree with one, cover the odd one; the C172S gyros need 4.5 to 5.5 inHg of suction; accelerate north, decelerate south on east and west headings.",
        "Recalez le conservateur de cap sur le compas environ toutes les 15 minutes ; un virage au taux standard fait 3° par seconde (90° en 30 s) ; vers le nord sortez avant, vers le sud après (UNOS). Quand deux instruments en contredisent un, masquez l’intrus ; les gyros du C172S veulent 4,5 à 5,5 inHg de dépression ; accélération nord, décélération sud aux caps est et ouest.",
      ),
    }),
    // 17 ----------------------------------------------------------------- fly it
    flyStep(
      "gc-fly-compass",
      "pp-compass",
      L(
        "Fly it: compass and timed turns",
        "En vol : compas et virages chronométrés",
      ),
      L(
        "The lesson flies the G1000 with the AHRS failed: standby attitude, magnetic compass and timed turns at 4,000 ft.",
        "La leçon se vole sur G1000 avec l’AHRS en panne : horizon de secours, compas magnétique et virages chronométrés à 4 000 ft.",
      ),
      [
        L(
          "Start the timer as you roll in: 90° = 30 s",
          "Lancez le chrono en inclinant : 90° = 30 s",
        ),
        L("Undershoot north, overshoot south", "Avant le nord, après le sud"),
      ],
      8,
    ),
    // 18 ----------------------------------------------------------------- fly it
    flyStep(
      "gc-fly-unusual",
      "pp-unusual",
      L(
        "Fly it: partial-panel unusual attitude",
        "En vol : position inusuelle en panne partielle",
      ),
      L(
        "Recover from a nose-low, banked attitude with the primary attitude failed: standby instruments, airspeed and altimeter trends.",
        "Rétablissez depuis une position piqué et incliné, l’horizon principal en panne : instruments de secours, tendances de vitesse et d’altitude.",
      ),
      [
        L(
          "Speed up, altitude down: nose low",
          "Vitesse qui monte, altitude qui baisse : nez bas",
        ),
        L(
          "Nose low: power idle, wings level, then ease up",
          "Nez bas : réduire, ailes à plat, puis ressource douce",
        ),
      ],
      4,
    ),
  ];
  return course(
    {
      id: IR_GYROS_COMPASS_ID,
      title: L(
        "Gyro instruments, the compass and partial panel",
        "Instruments gyroscopiques, compas et panne partielle",
      ),
      summary: L(
        "Rigidity and precession, what runs on vacuum, heading-indicator drift, variation and deviation, the compass errors, timed turns and the vacuum failure: on the live six-pack with the gyros covered, then flown.",
        "Fixité et précession, ce qui tourne à la dépression, la dérive du conservateur de cap, déclinaison et déviation, les erreurs du compas, les virages chronométrés et la panne de dépression : sur les six instruments en direct, gyros masqués, puis en vol.",
      ),
      cockpit: "steam",
      theme: "classroom",
      tags: [
        "ir",
        "easa",
        "faa",
        "c172s",
        "instruments",
        "partial-panel",
        "compass",
      ],
      minutes: 50,
    },
    steps,
    scenes(),
  );
}

/** A6 in text: the two magnetic-compass errors side by side, acceleration (left) then turning (right). */
function compassErrors(): Step {
  const id = "gc-errors";
  const title = L("ANDS and UNOS", "ANDS et UNOS");
  const half = (
    k: 0 | 1,
    eyebrow: ReturnType<typeof L>,
    rows: { heading: ReturnType<typeof L>; small: ReturnType<typeof L> }[],
  ): SlideBlock[] => {
    const x = k === 0 ? G.left : 984;
    const w = 816;
    const g = { reveal: k + 1, group: `half${k + 1}` };
    return [
      T("eyebrow", eyebrow, x, 312, w, 32, {
        color: k === 0 ? "sel" : "key",
        ...g,
      }),
      ...rows.flatMap((r, i): SlideBlock[] => {
        const y = 376 + i * 168;
        return [
          MARK(i + 1, x + 28, y + 36, { size: 56, ...g }),
          T("heading", r.heading, x + 80, y, w - 80, 56, g),
          T("small", r.small, x + 80, y + 60, w - 80, 80, g),
        ];
      }),
    ];
  };
  return slideStep(
    id,
    title,
    slide("compare", [
      ...head(
        L("Magnetic compass errors", "Erreurs du compas magnétique"),
        title,
      ),
      ...half(
        0,
        L(
          "Acceleration · east and west headings",
          "Accélération · caps est et ouest",
        ),
        [
          {
            heading: L(
              "Accelerate: shows north",
              "Accélérer : il indique le nord",
            ),
            small: L(
              "a false turn towards north",
              "un faux virage vers le nord",
            ),
          },
          {
            heading: L(
              "Decelerate: shows south",
              "Décélérer : il indique le sud",
            ),
            small: L(
              "a false turn towards south",
              "un faux virage vers le sud",
            ),
          },
          {
            heading: L("Gone in steady flight", "Nulle en vol stabilisé"),
            small: L(
              "reversed in the southern hemisphere",
              "inversée dans l’hémisphère sud",
            ),
          },
        ],
      ),
      ...half(
        1,
        L("Turning · north and south headings", "Virage · caps nord et sud"),
        [
          {
            heading: L("To north: it lags", "Vers le nord : il retarde"),
            small: L(
              "undershoot: roll out before the heading",
              "sortez avant le cap",
            ),
          },
          {
            heading: L("To south: it leads", "Vers le sud : il avance"),
            small: L(
              "overshoot: roll out after the heading",
              "sortez après le cap",
            ),
          },
          {
            heading: L("By about the latitude", "D’environ la latitude"),
            small: L(
              "plus the usual roll-out lead",
              "plus l’anticipation habituelle",
            ),
          },
        ],
      ),
      foot(
        L(
          "FAA PHAK ch. 8 · FAA IFH ch. 7 · northern hemisphere",
          "FAA PHAK ch. 8 · FAA IFH ch. 7 · hémisphère nord",
        ),
      ),
    ]),
    [
      {
        t: "text",
        text: L(
          "The magnetic compass has two dynamic errors, northern hemisphere. Acceleration error, on east or west headings: accelerating shows a turn towards north, decelerating a turn towards south (ANDS: accelerate north, decelerate south); it disappears in steady flight and is reversed in the southern hemisphere. Turning error, on north and south headings: turning to north the compass lags, so roll out before it reaches the heading (undershoot); turning to south it leads, so roll out after (overshoot): UNOS. The amount is about the latitude plus the normal roll-out lead (FAA PHAK ch. 8; FAA IFH ch. 7).",
          "Le compas magnétique a deux erreurs dynamiques, dans l’hémisphère nord. Erreur d’accélération, aux caps est ou ouest : une accélération fait indiquer un virage vers le nord, une décélération un virage vers le sud (ANDS : accelerate north, decelerate south) ; elle disparaît en vol stabilisé et s’inverse dans l’hémisphère sud. Erreur de virage, aux caps nord et sud : en virant vers le nord le compas retarde, sortez donc avant qu’il n’atteigne le cap ; en virant vers le sud il avance, sortez après : UNOS (undershoot north, overshoot south). L’écart vaut environ la latitude, plus l’anticipation habituelle (FAA PHAK ch. 8 ; FAA IFH ch. 7).",
        ),
      },
    ],
    { kind: "explain", section: "picture", minutes: 2 },
  );
}
