// Ground school — course library (A1): instrument scan and attitude flying. The three fundamental skills, control
// and performance instruments, primary and supporting instruments, the radial cross-check and its three errors,
// standard-rate bank, the climb at Vy; a straight-and-level hold and a standard-rate turn on the live six-pack, a
// calculation, a drill and two lessons flown in the cockpit.
// Sources: FAA-H-8083-15B Instrument Flying Handbook (IFH) ch. 6 "Airplane Attitude Instrument Flying" (control
// and performance, primary and supporting, fundamental skills, common errors) and ch. 7 "Airplane Basic Flight
// Maneuvers"; FAA-S-ACS-8C Instrument Rating Airplane ACS (altitude ±100 ft, heading ±10°, airspeed ±10 kt);
// EASA Part-FCL Appendix 7 (IR skill test tolerances: heading ±5°, speed ±5 kt with all engines operating);
// AMC1 FCL.615(b) IR theoretical knowledge; C172S POH section 4 (Vy 74 KIAS at sea level).
import type { Course, SimScene, Step } from "../../types";
import { DIAGRAM, INST, L, course, slideStep, step } from "../kit";
import { G, calloutRows, foot, head, slide } from "../navSlides";
import {
  GAUGE,
  S,
  coverStep,
  flyStep,
  formulaStep,
  mcq,
  quizStep,
  stepsStep,
  whyStep,
} from "../briefings/kit";
import {
  SIX,
  panelCompareStep,
  panelNotesStep,
  recapStep,
  sceneA1,
  sixMark,
  turnStep,
} from "./kit-a1";

export const IR_SCAN_ATTITUDE_ID = "sample-lib-ir-scan-attitude";

/** The Stage 1 practice area (curriculum.ts OPEN): 18 NM south-south-east of Port Ardent. */
const AREA = { fix: "PARD", radial: 160, distNm: 18 };

function scenes(): Record<string, SimScene> {
  return {
    "sa.level": sceneA1(
      "sa.level",
      { pos: AREA, altFt: 3000, hdg: 270, iasKt: 100 },
      { label: "Straight and level · 3,000 ft · heading 270 · 100 KIAS" },
    ),
    "sa.low": sceneA1(
      "sa.low",
      { pos: AREA, altFt: 2900, hdg: 270, iasKt: 110, pitch: -3, vsFpm: -400 },
      { label: "Nose low · 2,900 ft and sinking · 110 KIAS" },
    ),
    "sa.climb": sceneA1(
      "sa.climb",
      { pos: AREA, altFt: 3000, hdg: 270, iasKt: 74, pitch: 7, vsFpm: 600 },
      {
        label: "Climb at Vy · 74 KIAS · full power",
        controls: { throttle: 1, trim: -0.5, flaps: 0 },
      },
    ),
  };
}

const F6: [number, number, number, number] = [G.left, 192, 960, 720];
const HERO6: [number, number, number, number] = [G.left, 288, 928, 696];

export function irScanAttitudeCourse(): Course {
  const steps: Step[] = [
    // 1 ------------------------------------------------------------------ cover
    coverStep(
      "sa-cover",
      L(
        "Attitude flying: the scan",
        "Pilotage aux instruments : le circuit visuel",
      ),
      {
        eyebrow: L(
          "Instrument rating · Attitude flying",
          "Qualification IR · Pilotage aux instruments",
        ),
        main: L("Attitude flying", "Pilotage aux instruments"),
        sub: L("the scan", "le circuit visuel"),
        lead: L(
          "Attitude plus power gives performance. Learn to see it, then fly it.",
          "Assiette plus puissance donnent les performances. Apprenez à le voir, puis à le piloter.",
        ),
        meta: L(
          "16 steps · about 45 min · FAA IFH ch. 6–7",
          "16 étapes · environ 45 min · FAA IFH ch. 6–7",
        ),
        hero: [
          INST(
            SIX,
            L(
              "The C172S six-pack in level flight, 3,000 ft, heading 270, 100 KIAS",
              "Les six instruments du C172S en palier, 3 000 ft, cap 270, 100 KIAS",
            ),
            984,
            232,
            816,
            612,
            {
              id: "sa-cover.six",
              scene: "sa.level",
              mode: "live",
            },
          ),
        ],
        scene: "sa.level",
        reader: L(
          "Instrument scan and attitude flying: the three fundamental skills, control and performance instruments, primary and supporting instruments, the radial cross-check and its errors, standard-rate turns and the climb, then two lessons flown in the cockpit.",
          "Circuit visuel et pilotage aux instruments : les trois savoir-faire fondamentaux, instruments de pilotage et de performance, instruments principaux et secondaires, le circuit en étoile et ses erreurs, virages au taux standard et montée, puis deux leçons volées dans le cockpit.",
        ),
      },
    ),
    // 2 ------------------------------------------------------------------ why
    whyStep("sa-why", {
      eyebrow: L("Why it matters", "Pourquoi c’est important"),
      title: L("Three skills, one scan", "Trois savoir-faire, un circuit"),
      n: S("3"),
      nW: 168,
      unit: L("skills", "savoir-faire"),
      statement: L(
        "Cross-check, interpret, control",
        "Contre-vérifier, interpréter, piloter",
      ),
      body: L(
        "Every instrument manoeuvre uses all three, at the same time.",
        "Chaque manœuvre aux instruments les mobilise tous les trois, en même temps.",
      ),
      visual: [
        INST(
          GAUGE("ai"),
          L(
            "Attitude indicator, wings level",
            "Horizon artificiel, ailes horizontales",
          ),
          1272,
          368,
          528,
          528,
          {
            id: "sa-why.ai",
            scene: "sa.level",
          },
        ),
      ],
      foot: L(
        "FAA-H-8083-15B IFH ch. 6 · fundamental skills",
        "FAA-H-8083-15B IFH ch. 6 · savoir-faire fondamentaux",
      ),
      reader: L(
        "The Instrument Flying Handbook names three fundamental skills of attitude instrument flying: instrument cross-check (seeing), instrument interpretation (understanding what you see) and aircraft control (acting). Every instrument manoeuvre uses all three at once (FAA IFH ch. 6).",
        "L’Instrument Flying Handbook définit trois savoir-faire fondamentaux du pilotage aux instruments : la contre-vérification des instruments (voir), l’interprétation (comprendre ce que l’on voit) et le pilotage (agir). Chaque manœuvre aux instruments les mobilise tous les trois à la fois (FAA IFH ch. 6).",
      ),
    }),
    // 3 ------------------------------------------------------------------ predict
    quizStep("sa-predict", {
      eyebrow: L("Predict", "Prédisez"),
      title: L(
        "Sinking and fast: what first?",
        "Ça descend et ça accélère : quoi d’abord ?",
      ),
      visual: [
        INST(
          SIX,
          L(
            "Six-pack: wings level, altimeter below 3,000 ft and unwinding, airspeed 110 KIAS, VSI showing a descent",
            "Six instruments : ailes horizontales, altimètre sous 3 000 ft et qui descend, vitesse 110 KIAS, variomètre en descente",
          ),
          G.left,
          336,
          768,
          576,
          {
            id: "sa-predict.six",
            scene: "sa.low",
          },
        ),
      ],
      quiz: mcq(
        L(
          "100 ft low, speed rising, wings level. Your first move?",
          "100 ft trop bas, vitesse en hausse, ailes à plat. Premier geste ?",
        ),
        [
          {
            text: L(
              "Raise the nose on the attitude indicator",
              "Cabrer sur l’horizon artificiel",
            ),
            why: L(
              "Right: the nose is low, so pitch is the error.",
              "Juste : le nez est bas, l’erreur est d’assiette.",
            ),
          },
          {
            text: L("Add power", "Remettre de la puissance"),
            why: L(
              "Speed is already high: more power makes it worse.",
              "La vitesse est déjà haute : plus de puissance aggrave.",
            ),
          },
          {
            text: L("Trim nose up", "Compenser à cabrer"),
            why: L(
              "Trim follows the attitude, it does not set it.",
              "Le compensateur suit l’assiette, il ne la fixe pas.",
            ),
          },
        ],
        0,
        L(
          "Low and fast is a pitch error: set a slightly higher attitude on the AI, then trim.",
          "Bas et rapide, c’est une erreur d’assiette : affichez un peu plus d’assiette sur l’horizon, puis compensez.",
        ),
      ),
      foot: L(
        "FAA IFH ch. 6 · pitch control",
        "FAA IFH ch. 6 · contrôle de l’assiette",
      ),
      reader: L(
        "Wings level, the altimeter 100 ft low and unwinding, the airspeed rising: the nose is low. The first move is a small pitch change on the attitude indicator (the control instrument), then trim. Adding power would only add speed (FAA IFH ch. 6).",
        "Ailes horizontales, altimètre 100 ft trop bas et qui descend, vitesse qui augmente : le nez est bas. Le premier geste est une petite correction d’assiette sur l’horizon artificiel (l’instrument de pilotage), puis compenser. Ajouter de la puissance ne ferait qu’ajouter de la vitesse (FAA IFH ch. 6).",
      ),
    }),
    // 4 ------------------------------------------------------------------ control and performance
    panelNotesStep("sa-control", {
      eyebrow: L("Control and performance", "Pilotage et performances"),
      title: L(
        "Set it, then read the result",
        "Afficher, puis lire le résultat",
      ),
      lead: L(
        "Live values from the six-pack.",
        "Valeurs lues en direct sur les six instruments.",
      ),
      view: SIX,
      alt: L(
        "The six-pack, level at 3,000 ft",
        "Les six instruments, en palier à 3 000 ft",
      ),
      scene: "sa.level",
      mode: "live",
      frame: F6,
      marks: [
        sixMarkPos("ai", F6, "tl"),
        sixMarkPos("alt", F6, "tl"),
        sixMarkPos("hsi", F6, "tl"),
      ],
      rows: [
        {
          heading: L(
            "Control: attitude and power",
            "Pilotage : assiette et puissance",
          ),
          body: L(
            "Set on the AI and the tachometer.",
            "Affichées à l’horizon et au compte-tours.",
          ),
        },
        {
          heading: L("Performance: altitude", "Performance : altitude"),
          body: L("Altitude {{value}}", "Altitude {{value}}"),
          readout: "alt",
        },
        {
          heading: L("Performance: heading", "Performance : cap"),
          body: L("Heading {{value}}", "Cap {{value}}"),
          readout: "hdg",
        },
      ],
      foot: L(
        "FAA IFH ch. 6 · control and performance method",
        "FAA IFH ch. 6 · méthode pilotage et performances",
      ),
      reader: L(
        "The control and performance method: attitude and power are the control instruments, set on the attitude indicator and the tachometer. The altimeter, airspeed indicator, VSI, heading indicator and turn coordinator are the performance instruments: they show the result. Establish the attitude and power, trim, then cross-check the performance instruments (FAA IFH ch. 6).",
        "La méthode pilotage et performances : l’assiette et la puissance sont les paramètres de pilotage, affichés sur l’horizon artificiel et le compte-tours. L’altimètre, l’anémomètre, le variomètre, l’indicateur de cap et l’indicateur de virage sont les instruments de performance : ils montrent le résultat. Affichez l’assiette et la puissance, compensez, puis contrôlez les instruments de performance (FAA IFH ch. 6).",
      ),
    }),
    // 5 ------------------------------------------------------------------ primary and supporting
    primarySlide(),
    // 6 ------------------------------------------------------------------ your turn: straight and level
    turnStep("sa-hold", {
      eyebrow: L("Your turn", "À vous"),
      title: L("Hold 3,000 ft and 270", "Tenez 3 000 ft et le 270"),
      rows: [
        {
          heading: L("Attitude on the AI", "Assiette sur l’horizon"),
          small: L(
            "small, early corrections",
            "corrections petites et précoces",
          ),
        },
        {
          heading: L("Cross-check, return", "Contrôlez, revenez"),
          small: L(
            "AI, altimeter, AI, heading, AI",
            "horizon, altimètre, horizon, cap, horizon",
          ),
        },
      ],
      checks: [
        {
          text: L("Altitude 2,900 to 3,100 ft", "Altitude 2 900 à 3 100 ft"),
          readout: "alt",
        },
        { text: L("Heading 260 to 280", "Cap 260 à 280"), readout: "hdg" },
      ],
      view: SIX,
      alt: L(
        "Live six-pack, 3,000 ft, heading 270, 100 KIAS",
        "Six instruments en direct, 3 000 ft, cap 270, 100 KIAS",
      ),
      scene: "sa.level",
      prompt: L(
        "Your turn: hold 3,000 ft and heading 270 for 60 s",
        "À vous : tenez 3 000 ft et le cap 270 pendant 60 s",
      ),
      controls: ["pitch", "bank", "power"],
      goal: {
        all: [
          { id: "altBand", p: { min: 2900, max: 3100 } },
          { id: "heading", p: { value: 270, tol: 10 } },
        ],
        holdS: 60,
        graded: false,
        success: L(
          "60 s inside the test tolerances.",
          "60 s dans les tolérances de l’examen.",
        ),
      },
      hint: L(
        "Small pitch changes: let each one settle.",
        "De petites corrections d’assiette : laissez chacune se stabiliser.",
      ),
      foot: L(
        "FAA-S-ACS-8C · altitude ±100 ft, heading ±10°",
        "FAA-S-ACS-8C · altitude ±100 ft, cap ±10°",
      ),
      reader: L(
        "Your turn on the live six-pack: no assist. Hold 3,000 ft and heading 270 for 60 seconds, inside the instrument rating tolerances (altitude ±100 ft, heading ±10°, FAA-S-ACS-8C). Keep the eyes coming back to the attitude indicator and make small, early corrections.",
        "À vous sur les six instruments en direct, sans aide : tenez 3 000 ft et le cap 270 pendant 60 secondes, dans les tolérances de la qualification (altitude ±100 ft, cap ±10°, FAA-S-ACS-8C). Revenez toujours à l’horizon artificiel et corrigez tôt, et peu.",
      ),
    }),
    // 7 ------------------------------------------------------------------ the radial cross-check and its errors
    stepsStep("sa-errors", {
      eyebrow: L("The cross-check", "Le circuit visuel"),
      title: L("Out from the AI, and back", "Partir de l’horizon, y revenir"),
      rows: [
        {
          heading: L("The radial scan", "Le circuit en étoile"),
          small: L(
            "AI to one instrument, back to the AI",
            "horizon, un instrument, retour à l’horizon",
          ),
        },
        {
          heading: L("Fixation", "Fixation"),
          small: L("staring at one instrument", "regarder un seul instrument"),
        },
        {
          heading: L("Omission", "Omission"),
          small: L("leaving an instrument out", "oublier un instrument"),
        },
        {
          heading: L("Emphasis", "Focalisation"),
          small: L(
            "trusting one instrument too much",
            "se fier trop à un instrument",
          ),
        },
      ],
      visual: [
        INST(
          GAUGE("ai"),
          L(
            "Attitude indicator: the hub of the radial scan",
            "Horizon artificiel : le centre du circuit en étoile",
          ),
          1128,
          312,
          576,
          576,
          {
            id: "sa-errors.ai",
            scene: "sa.level",
          },
        ),
      ],
      foot: L(
        "FAA IFH ch. 6 · common cross-check errors",
        "FAA IFH ch. 6 · erreurs du circuit visuel",
      ),
      reader: L(
        "The radial cross-check starts at the attitude indicator, goes out to one instrument and comes back to the AI. Three classic errors: fixation (staring at one instrument, often after a correction), omission (leaving an instrument out of the scan) and emphasis (relying on one instrument instead of the combination) (FAA IFH ch. 6).",
        "Le circuit en étoile part de l’horizon artificiel, va vers un instrument et revient à l’horizon. Trois erreurs classiques : la fixation (regarder un seul instrument, souvent après une correction), l’omission (oublier un instrument) et la focalisation (se fier à un seul instrument au lieu de l’ensemble) (FAA IFH ch. 6).",
      ),
    }),
    // 8 ------------------------------------------------------------------ the numbers: standard-rate bank
    formulaStep("sa-bank", {
      eyebrow: L("The numbers", "Les chiffres"),
      title: L(
        "Bank for a standard-rate turn",
        "L’inclinaison au taux standard",
      ),
      visual: [
        DIAGRAM(
          "sa-bank.turn",
          { kind: "calc", calc: { kind: "turn", tasKt: 100, bankDeg: 15 } },
          L(
            "Standard-rate turn at 100 kt true airspeed: about 15° of bank, 3° per second",
            "Virage au taux standard à 100 kt de vitesse propre : environ 15° d’inclinaison, 3° par seconde",
          ),
          G.left,
          336,
          960,
          648,
        ),
      ],
      formula: L("{bank} ≈ [{TAS}/10] + 7", "{inclinaison} ≈ [{Vp}/10] + 7"),
      units: L(
        "bank in degrees · TAS in knots",
        "inclinaison en degrés · Vp en nœuds",
      ),
      lines: [
        L("TAS | = !100 kt!", "Vp | = !100 kt!"),
        L("rule | ≈ 10 + 7 = !17°!", "règle | ≈ 10 + 7 = !17°!"),
        L("exact | tan φ = ωV ÷ g → !15°!", "exact | tan φ = ωV ÷ g → !15°!"),
      ],
      after: L(
        "Start from the rule, then fine-tune on the turn coordinator.",
        "Partez de la règle, puis affinez sur l’indicateur de virage.",
      ),
      foot: L(
        "FAA IFH ch. 3 (rate of turn) and ch. 6 (TAS ÷ 10 + 7)",
        "FAA IFH ch. 3 (taux de virage) et ch. 6 (Vp ÷ 10 + 7)",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "bank (°) ≈ TAS (kt) ÷ 10 + 7; exact: tan φ = ω V ÷ g",
            "inclinaison (°) ≈ Vp (kt) ÷ 10 + 7 ; exact : tan φ = ω V ÷ g",
          ),
          ruleOfThumb: L(
            "At 100 kt TAS the rule gives 17°; the exact bank for 3° per second is about 15°. Roll in to the rule, then match the wing of the turn coordinator to the index.",
            "À 100 kt de Vp, la règle donne 17° ; l’inclinaison exacte pour 3° par seconde est d’environ 15°. Inclinez selon la règle, puis calez l’aile de l’indicateur de virage sur le repère.",
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 3, ch. 6" }],
        },
      ],
    }),
    // 9 ------------------------------------------------------------------ calc
    step(
      "sa-bank-calc",
      "calc",
      L("Bank for standard rate", "Inclinaison au taux standard"),
      [],
      {
        minutes: 2,
        calc: {
          generatorId: "ifr.standardRateBank",
          params: { tasKt: [80, 140] },
          showRuleOfThumb: true,
        },
      },
    ),
    // 10 ----------------------------------------------------------------- your turn: standard-rate turn
    turnStep("sa-turn", {
      eyebrow: L("Your turn", "À vous"),
      title: L(
        "Standard-rate turn to 180",
        "Virage au taux standard vers le 180",
      ),
      rows: [
        {
          heading: L("Roll in to about 15°", "Inclinez à environ 15°"),
          small: L(
            "wing on the turn coordinator index",
            "aile sur le repère de l’indicateur",
          ),
        },
        {
          heading: L("Roll out 8° early", "Sortez 8° avant"),
          small: L(
            "half the bank before 180",
            "la moitié de l’inclinaison avant le 180",
          ),
        },
      ],
      checks: [
        { text: L("Heading 170 to 190", "Cap 170 à 190"), readout: "hdg" },
        { text: L("Bank 25° or less", "Inclinaison 25° au plus") },
      ],
      view: SIX,
      alt: L(
        "Live six-pack, heading 270, 3,000 ft",
        "Six instruments en direct, cap 270, 3 000 ft",
      ),
      scene: "sa.level",
      prompt: L(
        "Your turn: turn left to heading 180 at standard rate",
        "À vous : virez à gauche au cap 180 au taux standard",
      ),
      controls: ["bank"],
      assist: { holdAlt: true, holdIas: true },
      goal: {
        all: [
          { id: "heading", p: { value: 180, tol: 10 } },
          { id: "bankMax", p: { max: 25 } },
        ],
        holdS: 3,
        graded: false,
        success: L(
          "On 180: 90° in about 30 s.",
          "Au 180 : 90° en environ 30 s.",
        ),
      },
      hint: L(
        "Hold the L side of the bank pad, then level.",
        "Maintenez le côté L des boutons d’inclinaison, puis remettez à plat.",
      ),
      foot: L(
        "FAA IFH ch. 7 · the stage holds altitude and speed",
        "FAA IFH ch. 7 · la scène tient altitude et vitesse",
      ),
      reader: L(
        "Your turn: from heading 270, turn left to 180 at standard rate. Roll in to about 15° of bank, put the wing of the turn coordinator on the index, and start the roll-out about half the bank (8°) before the heading. The stage holds the altitude and the airspeed for you (FAA IFH ch. 7).",
        "À vous : du cap 270, virez à gauche vers le 180 au taux standard. Inclinez à environ 15°, calez l’aile de l’indicateur de virage sur le repère, et commencez la sortie environ la moitié de l’inclinaison (8°) avant le cap. La scène tient l’altitude et la vitesse pour vous (FAA IFH ch. 7).",
      ),
    }),
    // 11 ----------------------------------------------------------------- compare level and climb
    panelCompareStep("sa-climb", {
      eyebrow: L("Changing the attitude", "Changer d’assiette"),
      title: L("From level flight to the climb", "Du palier à la montée"),
      halves: [
        {
          eyebrow: L("Level · 100 KIAS", "Palier · 100 KIAS"),
          color: "nav",
          view: SIX,
          alt: L(
            "Six-pack in level flight at 100 KIAS",
            "Six instruments en palier à 100 KIAS",
          ),
          scene: "sa.level",
          body: L(
            "Cruise attitude, cruise power.",
            "Assiette et puissance de croisière.",
          ),
        },
        {
          eyebrow: L("Climb · Vy 74 KIAS", "Montée · Vy 74 KIAS"),
          color: "sel",
          view: SIX,
          alt: L(
            "Six-pack in a climb at 74 KIAS, full power",
            "Six instruments en montée à 74 KIAS, plein gaz",
          ),
          scene: "sa.climb",
          body: L(
            "Raise the nose to the climb attitude, then full power.",
            "Cabrez à l’assiette de montée, puis plein gaz.",
          ),
        },
      ],
      foot: L(
        "FAA IFH ch. 7 · C172S POH sect. 4: Vy 74 KIAS at sea level",
        "FAA IFH ch. 7 · C172S POH sect. 4 : Vy 74 KIAS au niveau de la mer",
      ),
      reader: L(
        "Two six-packs from the same position: level at 100 KIAS, and climbing at Vy, 74 KIAS at sea level in the C172S (POH section 4). To enter the climb, raise the miniature aircraft to the climb attitude on the AI, then set climb power (full throttle); the IFH accepts setting the power with the pitch change or just after it. Then trim (FAA IFH ch. 7).",
        "Deux tableaux depuis la même position : en palier à 100 KIAS, et en montée à Vy, 74 KIAS au niveau de la mer sur C172S (POH section 4). Pour entrer en montée, cabrez la maquette à l’assiette de montée sur l’horizon, puis affichez la puissance de montée (plein gaz) ; l’IFH admet de l’afficher pendant le changement d’assiette ou juste après. Puis compensez (FAA IFH ch. 7).",
      ),
    }),
    // 12 ----------------------------------------------------------------- quiz: primary for pitch in the climb
    quizStep("sa-quiz", {
      eyebrow: L("Question", "Question"),
      title: L("Constant-airspeed climb", "Montée à vitesse constante"),
      quote: L(
        "Full power, climbing at 74 KIAS.",
        "Plein gaz, montée à 74 KIAS.",
      ),
      quiz: mcq(
        L(
          "Which instrument is primary for pitch?",
          "Quel instrument est principal pour l’assiette ?",
        ),
        [
          {
            text: L("ASI", "Anémomètre"),
            why: L(
              "Right: pitch holds the airspeed.",
              "Juste : l’assiette tient la vitesse.",
            ),
          },
          {
            text: L("ALT", "Altimètre"),
            why: L(
              "The altitude changes on purpose.",
              "L’altitude change, c’est voulu.",
            ),
          },
          {
            text: L("VSI", "Variomètre"),
            why: L(
              "The rate follows from power and pitch.",
              "Le taux découle de la puissance et de l’assiette.",
            ),
          },
        ],
        0,
        L(
          "Power is fixed at full, so pitch controls the speed: the airspeed indicator is primary for pitch.",
          "La puissance est fixée plein gaz, l’assiette règle donc la vitesse : l’anémomètre est principal pour l’assiette.",
        ),
      ),
      foot: L(
        "FAA IFH ch. 7 · climbs: primary and supporting",
        "FAA IFH ch. 7 · montées : instruments principaux et secondaires",
      ),
      reader: L(
        "In a constant-airspeed climb at full power, the airspeed indicator is the primary pitch instrument: too fast means the nose is too low. The tachometer is primary for power. The altimeter and VSI support (FAA IFH ch. 7).",
        "En montée à vitesse constante plein gaz, l’anémomètre est l’instrument principal d’assiette : trop vite, c’est que le nez est trop bas. Le compte-tours est principal pour la puissance. Altimètre et variomètre sont secondaires (FAA IFH ch. 7).",
      ),
    }),
    // 13 ----------------------------------------------------------------- drill
    step("sa-drill", "drill", L("Drill: turns", "Série : virages"), [], {
      minutes: 6,
      drill: {
        generatorIds: ["ifr.standardRateBank", "ifr.turnRadius"],
        count: 6,
        timer: { mode: "stopwatch" },
        feedback: "each",
        practiceOnly: true,
      },
    }),
    // 14 ----------------------------------------------------------------- recap
    recapStep("sa-recap", {
      title: L("Fly the standards", "Les tolérances de l’examen"),
      cols: [
        {
          n: S("±100"),
          text: L("feet of altitude", "pieds d’altitude"),
          color: "key",
        },
        {
          n: S("±10°"),
          text: L("of heading (EASA IR: ±5°)", "de cap (IR EASA : ±5°)"),
          color: "key",
        },
        {
          n: S("±10"),
          text: L(
            "knots of airspeed (EASA IR: ±5 kt)",
            "nœuds de vitesse (IR EASA : ±5 kt)",
          ),
          color: "key",
        },
      ],
      checks: [
        L(
          "Attitude and power first, then trim",
          "Assiette et puissance d’abord, puis compenser",
        ),
        L(
          "Always back to the attitude indicator",
          "Toujours revenir à l’horizon",
        ),
        L(
          "Bank ≈ TAS ÷ 10 + 7 for 3°/s",
          "Inclinaison ≈ Vp ÷ 10 + 7 pour 3°/s",
        ),
      ],
      foot: L(
        "FAA-S-ACS-8C · EASA Part-FCL App. 7, all engines operating",
        "FAA-S-ACS-8C · EASA Part-FCL App. 7, tous moteurs en fonctionnement",
      ),
      reader: L(
        "Instrument rating tolerances: altitude ±100 ft, heading ±10°, airspeed ±10 kt (FAA-S-ACS-8C). The EASA IR skill test is tighter with all engines operating: heading ±5°, speed ±5 kt (Part-FCL Appendix 7). Attitude and power first, then trim; always come back to the attitude indicator; bank ≈ TAS ÷ 10 + 7 for a standard-rate turn.",
        "Tolérances de la qualification aux instruments : altitude ±100 ft, cap ±10°, vitesse ±10 kt (FAA-S-ACS-8C). L’examen IR EASA est plus strict tous moteurs en fonctionnement : cap ±5°, vitesse ±5 kt (Part-FCL appendice 7). L’assiette et la puissance d’abord, puis compenser ; toujours revenir à l’horizon ; inclinaison ≈ Vp ÷ 10 + 7 pour le taux standard.",
      ),
    }),
    // 15 ----------------------------------------------------------------- fly it
    flyStep(
      "sa-fly-sl",
      "bai-sl",
      L("Fly it: straight and level", "En vol : palier stabilisé"),
      L(
        "Three minutes at 4,000 ft, heading 090, 100 KIAS in light turbulence. Scan from the attitude indicator and trim for hands off.",
        "Trois minutes à 4 000 ft, cap 090, 100 KIAS en légère turbulence. Circuit visuel depuis l’horizon, et compensez pour lâcher les commandes.",
      ),
      [
        L(
          "AI, altimeter, AI, heading, AI, airspeed",
          "Horizon, altimètre, horizon, cap, horizon, vitesse",
        ),
        L("±100 ft, ±10°, ±10 KIAS", "±100 ft, ±10°, ±10 KIAS"),
      ],
      5,
    ),
    // 16 ----------------------------------------------------------------- fly it
    flyStep(
      "sa-fly-ct",
      "bai-climbturn",
      L(
        "Fly it: climbing and descending turns",
        "En vol : virages en montée et en descente",
      ),
      L(
        "A climbing right turn to 270 levelling at 4,500 ft and 75 KIAS, then a descending left turn to 090 at 500 ft/min.",
        "Un virage à droite en montée vers le 270 jusqu’à 4 500 ft à 75 KIAS, puis un virage à gauche en descente vers le 090 à 500 ft/min.",
      ),
      [
        L(
          "Climb attitude and power first, then roll in",
          "Assiette et puissance de montée d’abord, puis inclinez",
        ),
        L(
          "Whichever ends first, keep flying the other",
          "Ce qui se termine d’abord, continuez l’autre",
        ),
      ],
      8,
    ),
  ];
  return course(
    {
      id: IR_SCAN_ATTITUDE_ID,
      title: L(
        "Instrument scan and attitude flying",
        "Circuit visuel et pilotage aux instruments",
      ),
      summary: L(
        "The three skills, control and performance, primary and supporting instruments, the radial scan and its errors, standard-rate bank and the climb: on the live six-pack, then flown in the cockpit.",
        "Les trois savoir-faire, pilotage et performances, instruments principaux et secondaires, le circuit en étoile et ses erreurs, l’inclinaison au taux standard et la montée : sur les six instruments en direct, puis en vol.",
      ),
      cockpit: "steam",
      theme: "classroom",
      tags: ["ir", "easa", "faa", "c172s", "attitude", "instruments", "scan"],
      minutes: 45,
    },
    steps,
    scenes(),
  );
}

/** A marker position in the clear corner of a gauge of the six-pack frame f. */
function sixMarkPos(
  gauge: "asi" | "ai" | "alt" | "tc" | "hsi" | "vsi",
  f: [number, number, number, number],
  corner: "tl" | "tr" | "bl" | "br",
): [number, number] {
  const m = sixMark(1, gauge, f, { corner });
  return [m.frame.x + 28, m.frame.y + 28];
}

/** A4 on the six-pack: the primary instrument of each axis in straight and level flight, one reveal per axis. */
function primarySlide(): Step {
  const id = "sa-primary";
  const title = L("Primary in straight and level", "Les principaux en palier");
  return slideStep(
    id,
    title,
    slide(
      "heroDiagram",
      [
        ...head(
          L("Primary and supporting", "Principaux et secondaires"),
          title,
        ),
        INST(
          SIX,
          L(
            "Six-pack in straight and level flight",
            "Six instruments en palier",
          ),
          ...HERO6,
          {
            id: `${id}.six`,
            scene: "sa.level",
            mode: "live",
          },
        ),
        sixMark(1, "alt", HERO6, { reveal: 1, group: "row1" }),
        sixMark(2, "hsi", HERO6, { reveal: 2, group: "row2" }),
        sixMark(3, "asi", HERO6, { reveal: 3, group: "row3" }),
        ...calloutRows(
          [
            {
              heading: L("Pitch: the altimeter", "Assiette : l’altimètre"),
              body: L(
                "Supported by the AI and the VSI.",
                "Avec l’horizon et le variomètre.",
              ),
            },
            {
              heading: L("Bank: the heading indicator", "Inclinaison : le cap"),
              body: L(
                "Supported by the AI and the turn coordinator.",
                "Avec l’horizon et l’indicateur de virage.",
              ),
            },
            {
              heading: L("Power: the airspeed", "Puissance : la vitesse"),
              body: L("Supported by the tachometer.", "Avec le compte-tours."),
            },
          ],
          { x: 1128, y: 312, pitch: 200 },
        ),
        foot(
          L(
            "FAA IFH ch. 6 · primary and supporting method",
            "FAA IFH ch. 6 · méthode principaux et secondaires",
          ),
        ),
      ],
      { scene: "sa.level" },
    ),
    [
      {
        t: "text",
        text: L(
          "The primary and supporting method: for each axis, the primary instrument is the one that shows the value you want to hold. In straight and level flight: pitch, the altimeter (supported by the attitude indicator and the VSI); bank, the heading indicator (supported by the AI and the turn coordinator); power, the airspeed indicator (supported by the tachometer) (FAA IFH ch. 6).",
          "La méthode des instruments principaux et secondaires : pour chaque axe, l’instrument principal est celui qui montre la valeur à tenir. En palier : l’assiette, l’altimètre (avec l’horizon et le variomètre) ; l’inclinaison, l’indicateur de cap (avec l’horizon et l’indicateur de virage) ; la puissance, l’anémomètre (avec le compte-tours) (FAA IFH ch. 6).",
        ),
      },
    ],
    { kind: "explain", section: "picture", minutes: 2 },
  );
}
