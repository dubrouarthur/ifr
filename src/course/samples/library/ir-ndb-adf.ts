// Ground school — course library (A2): NDB and ADF. What an NDB is and why the needle gives no radial, reading the
// RMI (card, head = QDM, tail = QDR), MB = MH + RB on a fixed card, homing against tracking with the wind correction,
// intercepting inbound and outbound bearings, the NDB errors, time and distance to the station, then two lessons
// flown in the cockpit (NDB tracking, holding on PA).
// Sources: FAA AIM 1-1-2 "Nondirectional Radio Beacon (NDB)" (190–535 kHz; ICAO Annex 10 190–1750 kHz;
// disturbances from lightning, precipitation static, night interference); FAA-H-8083-15B IFH ch. 9 "Navigation
// Systems" (ADF, RMI, MB = MH + RB, homing, tracking, intercepting bearings, time and distance to station, ADF
// errors); ICAO Annex 10 Vol I (NDB); ICAO Doc 8168 PANS-OPS Vol I (NDB tolerances); EASA AMC1 FCL.615(b) IR
// syllabus "Radio navigation – ADF/NDB" and ATPL LOs 062; FAA-S-ACS-8C IR ACS "Navigation Systems".
import type { Course, SimScene, Step } from "../../types";
import { DIAGRAM, IMG, INST, L, course, step } from "../kit";
import { G } from "../navSlides";
import {
  GAUGE,
  S,
  coverStep,
  flyStep,
  formulaStep,
  heroGauge,
  instrumentStep,
  mcq,
  quizStep,
  stepsStep,
  whyStep,
} from "../briefings/kit";
import {
  heroPointsStep,
  recapStepA2,
  sceneA2,
  turnStepA2,
  twoUpStep,
} from "./kit-a2";

export const IR_NDB_ADF_ID = "sample-lib-ir-ndb-adf";

const RMI = GAUGE("rmi");
/** ADF on PA 344 kHz, VOR 2 parked on an empty frequency so only the ADF needle shows on the RMI. */
const ADF = { adf: 344, brg2: "ADF" as const, nav2: 108 };

function scenes(): Record<string, SimScene> {
  const sc = (
    id: string,
    radial: number,
    distNm: number,
    hdg: number,
    label: string,
    wind?: [number, number],
  ) =>
    sceneA2(
      id,
      {
        pos: { fix: "PA", radial, distNm },
        altFt: 3000,
        hdg,
        iasKt: 90,
        radios: ADF,
      },
      { label, ...(wind ? { wind } : {}) },
    );
  return {
    "pa-north": sc(
      "pa-north",
      360,
      8,
      150,
      "PA 344 kHz · 8 NM north · heading 150",
    ),
    "ndb.predict": sc(
      "ndb.predict",
      270,
      6,
      30,
      "PA QDR 270 · 6 NM · heading 030",
    ),
    "ndb.rmi": sc("ndb.rmi", 90, 4, 300, "PA QDR 090 · 4 NM · heading 300"),
    "ndb.home": sc(
      "ndb.home",
      90,
      6,
      270,
      "Homing: heading 270 · wind 360/20",
      [360, 20],
    ),
    "ndb.track": sc(
      "ndb.track",
      90,
      6,
      283,
      "Tracking: heading 283 · wind 360/20",
      [360, 20],
    ),
    "ndb.turn": sc(
      "ndb.turn",
      80,
      10,
      240,
      "PA QDR 080 · 10 NM · heading 240 · wind 360/15",
      [360, 15],
    ),
  };
}

export function irNdbAdfCourse(): Course {
  const steps: Step[] = [
    // 1 ------------------------------------------------------------------ cover
    coverStep(
      "ndb-cover",
      L(
        "NDB and ADF: bearings and tracking",
        "NDB et ADF : relèvements et suivi",
      ),
      {
        eyebrow: L(
          "Instrument rating · Radio navigation",
          "Qualification IR · Radionavigation",
        ),
        main: L("NDB and ADF", "NDB et ADF"),
        sub: L(
          "bearings, homing and tracking",
          "relèvements, ralliement et suivi",
        ),
        lead: L(
          "The needle points at the station. The bearing is yours to build.",
          "L’aiguille montre la balise. Le relèvement, c’est à vous de le construire.",
        ),
        meta: L(
          "18 steps · about 55 min · AIM 1-1-2 · FAA IFH ch. 9",
          "18 étapes · environ 55 min · AIM 1-1-2 · FAA IFH ch. 9",
        ),
        hero: [
          heroGauge(
            "ndb-cover.rmi",
            "rmi",
            L(
              "RMI tuned to PA 344 kHz, 8 NM north of the beacon, heading 150: the needle points to the station",
              "RMI calé sur PA 344 kHz, à 8 NM au nord de la balise, cap 150 : l’aiguille montre la balise",
            ),
            "pa-north",
            { mode: "live" },
          ),
        ],
        scene: "pa-north",
        reader: L(
          "NDB and ADF: how a non-directional beacon works, how to read the RMI and the fixed-card ADF, homing and tracking with the wind, intercepting inbound and outbound bearings, the errors of the NDB, the time and distance to the station, then NDB tracking and an NDB hold flown in the cockpit.",
          "NDB et ADF : le fonctionnement d’une balise non directionnelle, la lecture du RMI et de l’ADF à rose fixe, le ralliement et le suivi avec le vent, l’interception des relèvements en rapprochement et en éloignement, les erreurs du NDB, le temps et la distance jusqu’à la balise, puis le suivi NDB et une attente NDB volés dans le cockpit.",
        ),
      },
    ),
    // 2 ------------------------------------------------------------------ why
    whyStep("ndb-why", {
      eyebrow: L("Why it matters", "Pourquoi c’est important"),
      title: L("No radial: only a needle", "Pas de radial : une aiguille"),
      n: S("190–535"),
      nW: 760,
      color: "key",
      statement: L("kHz: the NDB band", "kHz : la bande des NDB"),
      body: L(
        "The beacon sends the same signal in every direction. The needle points at it; the bearing comes from your heading.",
        "La balise émet le même signal dans toutes les directions. L’aiguille la montre ; le relèvement vient de votre cap.",
      ),
      sideTitle: L("On the dial", "Sur le cadran"),
      side: [
        {
          n: S("190–1750"),
          text: L(
            "kHz: the ICAO Annex 10 band",
            "kHz : la bande de l’annexe 10 OACI",
          ),
        },
        {
          n: S("344"),
          text: L(
            "kHz: PA, the training NDB",
            "kHz : PA, la balise d’entraînement",
          ),
          color: "key",
        },
      ],
      foot: L(
        "FAA AIM 1-1-2 · ICAO Annex 10 Vol I",
        "FAA AIM 1-1-2 · OACI annexe 10 vol. I",
      ),
      reader: L(
        "An NDB is a low or medium frequency beacon: it transmits a non-directional signal, normally between 190 and 535 kHz (AIM 1-1-2; ICAO Annex 10 allows 190 to 1750 kHz), with a continuous identification in Morse. The ADF needle simply points at the station. Unlike a VOR there is no radial to select: you build the bearing from your heading and the needle. The training NDB is PA, 344 kHz, 4.5 NM east of PARD runway 27.",
        "Un NDB est une balise basse ou moyenne fréquence : il émet un signal non directionnel, normalement entre 190 et 535 kHz (AIM 1-1-2 ; l’annexe 10 de l’OACI permet 190 à 1750 kHz), avec un indicatif continu en morse. L’aiguille de l’ADF montre simplement la balise. Contrairement au VOR, il n’y a pas de radial à afficher : vous construisez le relèvement à partir de votre cap et de l’aiguille. La balise d’entraînement est PA, 344 kHz, à 4,5 NM à l’est de la piste 27 de PARD.",
      ),
    }),
    // 3 ------------------------------------------------------------------ predict
    quizStep("ndb-predict", {
      eyebrow: L("Predict", "Prédisez"),
      title: L("Where is the beacon?", "Où est la balise ?"),
      visual: [
        INST(
          RMI,
          L(
            "RMI: heading 030, the needle head on 090",
            "RMI : cap 030, la tête de l’aiguille sur 090",
          ),
          216,
          336,
          576,
          576,
          { id: "ndb-predict.rmi", scene: "ndb.predict" },
        ),
      ],
      quiz: mcq(
        L(
          "Heading 030, the needle head on 090 of the card. Your QDM?",
          "Cap 030, la tête de l’aiguille sur le 090 de la rose. Votre QDM ?",
        ),
        [
          {
            text: S("090"),
            why: L(
              "Right: on an RMI the head reads the bearing to the station.",
              "Juste : sur un RMI, la tête lit le relèvement vers la balise.",
            ),
          },
          {
            text: S("060"),
            why: L(
              "That is the relative bearing: 60° right of the nose.",
              "C’est le gisement : 60° à droite du nez.",
            ),
          },
          {
            text: S("270"),
            why: L(
              "That is the QDR, the bearing from the station.",
              "C’est le QDR, le relèvement depuis la balise.",
            ),
          },
        ],
        0,
        L(
          "The RMI card turns with your heading: the head reads the QDM directly.",
          "La rose du RMI tourne avec votre cap : la tête lit directement le QDM.",
        ),
      ),
      foot: L("FAA IFH ch. 9 · RMI", "FAA IFH ch. 9 · RMI"),
      reader: L(
        "Heading 030, the RMI needle head points at 090 on the card. The card of an RMI turns with the heading, so the head reads the magnetic bearing to the station (the QDM) directly: 090. The angle from the nose, 60° right, is the relative bearing; 270 would be the bearing from the station (QDR).",
        "Cap 030, la tête de l’aiguille du RMI montre le 090 de la rose. La rose d’un RMI tourne avec le cap : la tête lit donc directement le relèvement magnétique vers la balise (le QDM) : 090. L’angle depuis le nez, 60° à droite, est le gisement ; 270 serait le relèvement depuis la balise (QDR).",
      ),
    }),
    // 4 ------------------------------------------------------------------ the RMI
    instrumentStep("ndb-rmi", {
      eyebrow: L("The instrument", "L’instrument"),
      title: L("Reading the RMI", "Lire le RMI"),
      lead: L("Three readings, one glance.", "Trois lectures, un coup d’œil."),
      gauge: "rmi",
      alt: L(
        "RMI 4 NM east of PA, heading 300: the head on 270, the tail on 090",
        "RMI à 4 NM à l’est de PA, cap 300 : la tête sur 270, la queue sur 090",
      ),
      scene: "ndb.rmi",
      mode: "live",
      marks: [
        [0.42, -0.5],
        [-0.56, -0.18],
        [0.56, 0.2],
      ],
      rows: [
        {
          heading: L("Card: your heading", "Rose : votre cap"),
          body: L(
            "under the index at the top: {{value}}",
            "sous l’index en haut : {{value}}",
          ),
          readout: "hdg",
        },
        {
          heading: L("Head: the QDM", "Tête : le QDM"),
          body: L(
            "the magnetic bearing to the station",
            "le relèvement magnétique vers la balise",
          ),
        },
        {
          heading: L("Tail: the QDR", "Queue : le QDR"),
          body: L(
            "the bearing from it: where you are",
            "le relèvement depuis la balise : votre position",
          ),
        },
      ],
      foot: L("FAA IFH ch. 9 · RMI", "FAA IFH ch. 9 · RMI"),
      reader: L(
        "The RMI combines a compass card driven by the heading system and a needle driven by the ADF. The card shows your magnetic heading under the index. The head of the needle reads the magnetic bearing to the station (QDM); the tail reads the bearing from the station (QDR), the line you are on. Here, 4 NM east of PA heading 300: head on 270, tail on 090 (FAA IFH ch. 9).",
        "Le RMI associe une rose entraînée par le système de cap et une aiguille entraînée par l’ADF. La rose montre votre cap magnétique sous l’index. La tête de l’aiguille lit le relèvement magnétique vers la balise (QDM) ; la queue lit le relèvement depuis la balise (QDR), la ligne sur laquelle vous êtes. Ici, à 4 NM à l’est de PA au cap 300 : tête sur 270, queue sur 090 (FAA IFH ch. 9).",
      ),
    }),
    // 5 ------------------------------------------------------------------ MB = MH + RB
    formulaStep("ndb-mb", {
      eyebrow: L("The numbers", "Les chiffres"),
      title: L("A fixed card: add the heading", "Rose fixe : ajoutez le cap"),
      visual: [
        INST(
          RMI,
          L(
            "The same position on the RMI: heading 300, needle 30° left of the nose, head on 270",
            "La même position au RMI : cap 300, aiguille à 30° à gauche du nez, tête sur 270",
          ),
          304,
          368,
          592,
          592,
          { id: "ndb-mb.rmi", scene: "ndb.rmi" },
        ),
      ],
      formula: L("{MB} = {MH} + {RB}", "{QDM} = {Cm} + {Gt}"),
      units: L(
        "magnetic bearing · heading · relative bearing",
        "relèvement magnétique · cap magnétique · gisement",
      ),
      lines: [
        L("MB | 300 + 330 − 360 = !270!", "QDM | 300 + 330 − 360 = !270!"),
        L("QDR | 270 − 180 = !090!", "QDR | 270 − 180 = !090!"),
      ],
      after: L(
        "Over 360? Subtract 360. The QDR is the QDM ± 180.",
        "Plus de 360 ? Retirez 360. Le QDR est le QDM ± 180.",
      ),
      foot: L("FAA IFH ch. 9 · MH + RB = MB", "FAA IFH ch. 9 · Cm + Gt = QDM"),
      reader: [
        {
          t: "formula",
          formula: L(
            "MB = MH + RB (subtract 360 if over 360); QDR = QDM ± 180",
            "QDM = Cm + Gt (retirer 360 au-delà de 360) ; QDR = QDM ± 180",
          ),
          ruleOfThumb: L(
            "A fixed-card ADF shows only the relative bearing, measured clockwise from the nose. Add your magnetic heading to get the magnetic bearing to the station. Heading 300, needle 30° left of the nose (RB 330): 300 + 330 = 630, minus 360, QDM 270. The QDR, the bearing from the station, is 270 − 180 = 090. An RMI does this addition for you.",
            "Un ADF à rose fixe ne montre que le gisement, compté dans le sens horaire depuis le nez. Ajoutez votre cap magnétique pour obtenir le relèvement magnétique vers la balise. Cap 300, aiguille à 30° à gauche du nez (gisement 330) : 300 + 330 = 630, moins 360, QDM 270. Le QDR, le relèvement depuis la balise, vaut 270 − 180 = 090. Le RMI fait cette addition pour vous.",
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 9" }],
        },
      ],
    }),
    // 6 ------------------------------------------------------------------ calc
    step(
      "ndb-calc",
      "calc",
      L("Heading, relative bearing, QDM", "Cap, gisement, QDM"),
      [],
      { minutes: 3, calc: { generatorId: "ifr.adfBearing" } },
    ),
    // 7 ------------------------------------------------------------------ homing vs tracking
    twoUpStep("ndb-home", {
      eyebrow: L("Homing or tracking", "Ralliement ou suivi"),
      title: L(
        "Nose on the needle is not a track",
        "Le nez sur l’aiguille n’est pas une route",
      ),
      halves: [
        {
          eyebrow: L("Homing · heading 270", "Ralliement · cap 270"),
          color: "stop",
          view: RMI,
          alt: L(
            "Homing: heading 270, the needle on the nose, wind 360/20",
            "Ralliement : cap 270, l’aiguille sur le nez, vent 360/20",
          ),
          scene: "ndb.home",
          body: L(
            "Needle kept on the nose: the wind drifts you, the path curves downwind.",
            "Aiguille gardée sur le nez : le vent vous déporte, la trajectoire s’incurve sous le vent.",
          ),
        },
        {
          eyebrow: L("Tracking · heading 283", "Suivi · cap 283"),
          color: "nav",
          view: RMI,
          alt: L(
            "Tracking: heading 283 into the wind, the needle 13° left of the nose, head on 270",
            "Suivi : cap 283 face au vent, l’aiguille à 13° à gauche du nez, tête sur 270",
          ),
          scene: "ndb.track",
          body: L(
            "Heading into the wind: the needle sits off the nose by the drift, the head stays on 270.",
            "Cap face au vent : l’aiguille reste décalée du nez de la dérive, la tête reste sur 270.",
          ),
        },
      ],
      foot: L(
        "FAA IFH ch. 9 · homing and tracking · wind 360/20, 90 kt",
        "FAA IFH ch. 9 · ralliement et suivi · vent 360/20, 90 kt",
      ),
      reader: L(
        "Homing means flying whatever heading keeps the needle on the nose: in a crosswind the aircraft drifts, the heading keeps changing and the path curves downwind to the station. Tracking means flying a heading that holds the bearing: into the wind by the drift angle. Same position 6 NM east of PA, wind 360/20 at 90 kt: homing on heading 270, or tracking on heading 283 with the needle 13° left of the nose and the head on 270 (FAA IFH ch. 9).",
        "Le ralliement consiste à voler le cap qui garde l’aiguille sur le nez : par vent de travers l’avion dérive, le cap change sans cesse et la trajectoire s’incurve sous le vent jusqu’à la balise. Le suivi consiste à voler un cap qui tient le relèvement : face au vent, de l’angle de dérive. Même position à 6 NM à l’est de PA, vent 360/20 à 90 kt : ralliement au cap 270, ou suivi au cap 283, l’aiguille à 13° à gauche du nez et la tête sur 270 (FAA IFH ch. 9).",
      ),
    }),
    // 8 ------------------------------------------------------------------ the wind correction
    formulaStep("ndb-wca", {
      eyebrow: L("The numbers", "Les chiffres"),
      title: L("How much into the wind?", "De combien face au vent ?"),
      visual: [
        DIAGRAM(
          "ndb-wca.wind",
          {
            kind: "calc",
            calc: {
              kind: "windTriangle",
              course: 270,
              tasKt: 90,
              windDir: 360,
              windKt: 20,
            },
          },
          L(
            "Wind triangle: track 270, 90 kt, wind 360/20, about 13° of correction to the right",
            "Triangle des vents : route 270, 90 kt, vent 360/20, environ 13° de correction à droite",
          ),
          G.left,
          368,
          960,
          592,
        ),
      ],
      formula: L(
        "{WCA} ≈ [{crosswind} × 60/{TAS}]",
        "{dérive} ≈ [{vent de travers} × 60/{Vp}]",
      ),
      units: L("degrees · knots · knots", "degrés · nœuds · nœuds"),
      lines: [
        L("WCA | ≈ [20 × 60/90] ≈ !13°!", "dérive | ≈ [20 × 60/90] ≈ !13°!"),
        L("heading | 270 + 13 = !283!", "cap | 270 + 13 = !283!"),
      ],
      after: L(
        "A first guess: then let the needle tell you.",
        "Une première estimation : ensuite, l’aiguille vous corrige.",
      ),
      foot: L(
        "FAA IFH ch. 9 · tracking · rule of 60",
        "FAA IFH ch. 9 · suivi · règle du 60",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "drift angle ≈ crosswind component × 60 ÷ true airspeed",
            "dérive ≈ composante de vent de travers × 60 ÷ vitesse propre",
          ),
          ruleOfThumb: L(
            "Wind 360/20 straight across a 270 track at 90 kt: 20 × 60 ÷ 90 ≈ 13°. Fly 283 and watch the head of the needle: if it moves away from 270, the correction is not enough; double it, then take half off once back on the bearing (FAA IFH ch. 9).",
            "Vent 360/20 plein travers d’une route 270 à 90 kt : 20 × 60 ÷ 90 ≈ 13°. Volez 283 et surveillez la tête de l’aiguille : si elle s’écarte de 270, la correction ne suffit pas ; doublez-la, puis retirez-en la moitié une fois revenu sur le relèvement (FAA IFH ch. 9).",
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 9" }],
        },
      ],
    }),
    // 9 ------------------------------------------------------------------ your turn
    turnStepA2("ndb-try", {
      eyebrow: L("Your turn", "À vous"),
      title: L(
        "Intercept and track QDM 270",
        "Interceptez et suivez le QDM 270",
      ),
      rows: [
        {
          heading: L(
            "Hold 240 until the head nears 270",
            "Tenez 240 jusqu’à la tête vers 270",
          ),
          small: L(
            "a 30° intercept from the north",
            "une interception à 30° par le nord",
          ),
        },
        {
          heading: L(
            "Turn right, into the wind",
            "Virez à droite, face au vent",
          ),
          small: L(
            "wind 360/15: about 10° of drift",
            "vent 360/15 : environ 10° de dérive",
          ),
        },
      ],
      checks: [
        {
          text: L(
            "Track 270 ±5° for 30 s: {{value}}",
            "Route 270 ±5° pendant 30 s : {{value}}",
          ),
          readout: "trk",
        },
      ],
      view: RMI,
      alt: L(
        "Live RMI 10 NM east of PA, heading 240, intercepting the 270 bearing",
        "RMI en direct à 10 NM à l’est de PA, cap 240, en interception du relèvement 270",
      ),
      scene: "ndb.turn",
      prompt: L(
        "Your turn: intercept QDM 270 and track it to PA for 30 s",
        "À vous : interceptez le QDM 270 et suivez-le vers PA pendant 30 s",
      ),
      controls: ["hdgBug", "bank"],
      assist: { holdAlt: true },
      goal: {
        all: [{ id: "track", p: { value: 270, tol: 5 } }],
        holdS: 30,
        graded: false,
        success: L(
          "Tracking 270 to PA: the head stays on 270, off the nose by the drift.",
          "Sur la route 270 vers PA : la tête reste sur 270, décalée du nez de la dérive.",
        ),
      },
      hint: L(
        "Turn the heading bug to about 280 when the head reads 265.",
        "Tournez le sélecteur de cap vers 280 quand la tête lit 265.",
      ),
      foot: L(
        "FAA IFH ch. 9 · FAA-S-ACS-8C · intercepting and tracking",
        "FAA IFH ch. 9 · FAA-S-ACS-8C · interception et suivi",
      ),
      reader: L(
        "Your turn on the live RMI, 10 NM east of PA on QDR 080, heading 240, wind 360/15. Hold the intercept heading until the head of the needle approaches 270, then turn right onto about 280: 270 plus the drift into the north wind. Track 270 within 5° for 30 seconds. The stage holds the altitude; turn with the heading bug or the bank keys (FAA IFH ch. 9).",
        "À vous sur le RMI en direct, à 10 NM à l’est de PA sur le QDR 080, cap 240, vent 360/15. Tenez le cap d’interception jusqu’à ce que la tête de l’aiguille approche 270, puis virez à droite vers environ 280 : 270 plus la dérive face au vent du nord. Suivez la route 270 à 5° près pendant 30 secondes. La scène tient l’altitude ; virez au sélecteur de cap ou aux touches d’inclinaison (FAA IFH ch. 9).",
      ),
    }),
    // 10 ----------------------------------------------------------------- intercepts
    stepsStep("ndb-intercept", {
      eyebrow: L("Technique", "Technique"),
      title: L("Intercepting a bearing", "Intercepter un relèvement"),
      rows: [
        {
          heading: L("Parallel the bearing", "Parallèle au relèvement"),
          small: L(
            "the needle shows which side the station is",
            "l’aiguille montre de quel côté est la balise",
          ),
        },
        {
          heading: L("Double the offset", "Doublez l’écart"),
          small: L(
            "turn towards the needle by twice it, 90° at most",
            "virez vers l’aiguille du double, 90° au plus",
          ),
        },
        {
          heading: L("Wait for the needle", "Attendez l’aiguille"),
          small: L(
            "RMI: the head reaches the bearing you want",
            "RMI : la tête atteint le relèvement voulu",
          ),
        },
        {
          heading: L("Lead, then track", "Anticipez, puis suivez"),
          small: L(
            "turn a few degrees early, then add the drift",
            "virez quelques degrés avant, puis ajoutez la dérive",
          ),
        },
      ],
      visual: [
        INST(
          RMI,
          L(
            "RMI during the intercept: heading 240, the head on 260, 20° right of the nose",
            "RMI pendant l’interception : cap 240, la tête sur 260, à 20° à droite du nez",
          ),
          1080,
          264,
          720,
          720,
          { id: "ndb-intercept.rmi", scene: "ndb.turn" },
        ),
      ],
      foot: L(
        "FAA IFH ch. 9 · intercepting bearings",
        "FAA IFH ch. 9 · interception des relèvements",
      ),
      reader: L(
        "Intercepting an inbound bearing (FAA IFH ch. 9): turn to parallel the desired bearing and see which side of the nose the needle is; double that offset to get the intercept angle and turn towards the needle by that amount (no more than 90°); hold the intercept heading until the needle shows you are on the bearing (on a fixed card, the needle is off the nose by the intercept angle; on an RMI, the head reads the bearing); lead the turn by a few degrees, then track with the drift correction. Outbound it is the same with the tail of the needle.",
        "Intercepter un relèvement en rapprochement (FAA IFH ch. 9) : prenez un cap parallèle au relèvement voulu et regardez de quel côté du nez est l’aiguille ; doublez cet écart pour obtenir l’angle d’interception et virez vers l’aiguille de cette valeur (90° au plus) ; tenez le cap d’interception jusqu’à ce que l’aiguille montre que vous êtes sur le relèvement (rose fixe : l’aiguille est décalée du nez de l’angle d’interception ; RMI : la tête lit le relèvement) ; anticipez le virage de quelques degrés, puis suivez avec la correction de dérive. En éloignement, c’est pareil avec la queue de l’aiguille.",
      ),
    }),
    // 11 ----------------------------------------------------------------- outbound quiz
    quizStep("ndb-outbound", {
      eyebrow: L("Question", "Question"),
      title: L("Outbound on QDR 090", "En éloignement sur le QDR 090"),
      quote: L(
        "After PA, heading 090: the tail of the needle reads 080.",
        "Après PA, cap 090 : la queue de l’aiguille lit 080.",
      ),
      quiz: mcq(
        L(
          "To intercept QDR 090 at 30°, fly heading…",
          "Pour intercepter le QDR 090 à 30°, prenez le cap…",
        ),
        [
          {
            text: S("120"),
            why: L(
              "Right: QDR 080 is north of the 090 line; turn right, south, towards it.",
              "Juste : le QDR 080 est au nord de la ligne 090 ; virez à droite, vers le sud, vers elle.",
            ),
          },
          {
            text: S("060"),
            why: L(
              "That takes you further north, away from the 090 line.",
              "Vous vous éloignez encore vers le nord de la ligne 090.",
            ),
          },
          {
            text: S("090"),
            why: L(
              "Parallel to the bearing: you never reach it.",
              "Parallèle au relèvement : vous ne le rejoignez jamais.",
            ),
          },
        ],
        0,
        L(
          "Hold 120 until the tail reads about 088, then turn back to 090 plus the drift.",
          "Tenez 120 jusqu’à ce que la queue lise environ 088, puis revenez au 090 plus la dérive.",
        ),
      ),
      foot: L(
        "FAA IFH ch. 9 · intercepting outbound bearings",
        "FAA IFH ch. 9 · interception en éloignement",
      ),
      reader: L(
        "Outbound from PA on heading 090, the tail of the RMI needle reads 080: you are on QDR 080, north of the 090 line. To intercept QDR 090 at 30°, turn right to 120 and hold it until the tail approaches 090, then turn back to 090 plus the drift correction (FAA IFH ch. 9).",
        "En éloignement de PA au cap 090, la queue de l’aiguille du RMI lit 080 : vous êtes sur le QDR 080, au nord de la ligne 090. Pour intercepter le QDR 090 à 30°, virez à droite au 120 et tenez-le jusqu’à ce que la queue approche 090, puis revenez au 090 plus la correction de dérive (FAA IFH ch. 9).",
      ),
    }),
    // 12 ----------------------------------------------------------------- errors
    heroPointsStep("ndb-errors", {
      eyebrow: L("Limitations", "Limitations"),
      title: L("When the needle lies", "Quand l’aiguille ment"),
      visual: [
        IMG(
          { lib: "photo:in-cloud" },
          L(
            "Flying in cloud: the ADF needle can swing towards the electrical activity of a storm",
            "En vol dans les nuages : l’aiguille de l’ADF peut basculer vers l’activité électrique d’un orage",
          ),
          G.left,
          288,
          960,
          696,
        ),
      ],
      points: [
        {
          heading: L("Night effect", "Effet de nuit"),
          body: L(
            "sky waves near dusk and dawn: it wanders",
            "ondes de ciel au crépuscule et à l’aube : elle erre",
          ),
        },
        {
          heading: L("Shoreline", "Effet de côte"),
          body: L(
            "the signal bends crossing the coast at a shallow angle",
            "le signal se courbe en traversant la côte sous un angle faible",
          ),
        },
        {
          heading: L("Terrain", "Relief"),
          body: L(
            "mountains reflect it: the needle swings",
            "les montagnes le réfléchissent : l’aiguille oscille",
          ),
        },
        {
          heading: L("Thunderstorms", "Orages"),
          body: L(
            "the needle points at the lightning",
            "l’aiguille montre les éclairs",
          ),
          color: "stop",
        },
      ],
      foot: L(
        "FAA IFH ch. 9 · AIM 1-1-2 · EASA ATPL 062",
        "FAA IFH ch. 9 · AIM 1-1-2 · EASA ATPL 062",
      ),
      notes: L(
        "Also: the needle dips towards the lower wing in a turn. Read bearings wings level.",
        "Aussi : en virage, l’aiguille plonge vers l’aile basse. Lisez les relèvements ailes à plat.",
      ),
      reader: L(
        "The ADF has errors the VOR does not: night effect (sky waves reflected by the ionosphere, strongest around dusk and dawn, make the needle wander); shoreline effect (the signal bends where it crosses a coastline at a shallow angle); terrain effect (mountains reflect the signal and the needle swings); thunderstorms (the needle points towards lightning). The needle also dips towards the lower wing in a turn: read bearings with the wings level. AIM 1-1-2 warns of disturbances from lightning, precipitation static and, at night, distant stations (FAA IFH ch. 9).",
        "L’ADF a des erreurs que le VOR n’a pas : l’effet de nuit (les ondes de ciel réfléchies par l’ionosphère, plus fortes au crépuscule et à l’aube, font errer l’aiguille) ; l’effet de côte (le signal se courbe là où il traverse la côte sous un angle faible) ; l’effet du relief (les montagnes réfléchissent le signal et l’aiguille oscille) ; les orages (l’aiguille montre les éclairs). En virage, l’aiguille plonge aussi vers l’aile basse : lisez les relèvements ailes à plat. L’AIM 1-1-2 signale les perturbations dues aux éclairs, à l’électricité statique des précipitations et, la nuit, aux stations lointaines (FAA IFH ch. 9).",
      ),
    }),
    // 13 ----------------------------------------------------------------- storm quiz
    quizStep("ndb-storm", {
      eyebrow: L("Question", "Question"),
      title: L("A Cb on the left", "Un cumulonimbus à gauche"),
      quote: L(
        "In cloud, tracking to PA: the needle swings 40° left, towards a storm cell, then back.",
        "Dans les nuages, en route vers PA : l’aiguille bascule de 40° à gauche, vers un orage, puis revient.",
      ),
      quiz: mcq(
        L("Which bearing do you trust?", "Quel relèvement croyez-vous ?"),
        [
          {
            text: L(
              "The needle: it is the strongest signal",
              "L’aiguille : c’est le signal le plus fort",
            ),
            why: L(
              "The strongest signal is the lightning, not the beacon.",
              "Le signal le plus fort, ce sont les éclairs, pas la balise.",
            ),
          },
          {
            text: L(
              "None alone: cross-check heading, time, GPS or VOR",
              "Aucun seul : recoupez cap, temps, GPS ou VOR",
            ),
            why: L(
              "Right: keep the heading that was tracking, and confirm with another source.",
              "Juste : gardez le cap qui suivait la route, et confirmez avec une autre source.",
            ),
          },
          {
            text: L("The average of the swings", "La moyenne des oscillations"),
            why: L(
              "An average of wrong readings is still wrong.",
              "Une moyenne de lectures fausses reste fausse.",
            ),
          },
        ],
        1,
        L(
          "Hold the last good heading and cross-check with another navaid.",
          "Gardez le dernier bon cap et recoupez avec un autre moyen.",
        ),
      ),
      foot: L(
        "FAA AIM 1-1-2 · FAA IFH ch. 9 · thunderstorm effect",
        "FAA AIM 1-1-2 · FAA IFH ch. 9 · effet des orages",
      ),
      reader: L(
        "Near a thunderstorm the ADF needle swings towards the lightning. No single reading can be trusted: keep the heading that was tracking the bearing, and cross-check your position with another source (GPS, VOR/DME, the time on the leg) before you act on the needle (AIM 1-1-2; FAA IFH ch. 9).",
        "Près d’un orage, l’aiguille de l’ADF bascule vers les éclairs. Aucune lecture isolée n’est fiable : gardez le cap qui tenait le relèvement, et recoupez votre position avec une autre source (GPS, VOR/DME, le temps sur la branche) avant d’agir sur l’aiguille (AIM 1-1-2 ; FAA IFH ch. 9).",
      ),
    }),
    // 14 ----------------------------------------------------------------- time to station
    formulaStep("ndb-time", {
      eyebrow: L("The numbers", "Les chiffres"),
      title: L("How far is the beacon?", "À quelle distance est la balise ?"),
      lead: L(
        "Needle on the wingtip, time a small bearing change.",
        "Aiguille en bout d’aile, chronométrez un petit changement de relèvement.",
      ),
      formula: L(
        "{minutes to the station} = [{seconds}/{degrees}]",
        "{minutes jusqu’à la balise} = [{secondes}/{degrés}]",
      ),
      units: L(
        "seconds for the bearing change · degrees of change",
        "secondes pour le changement · degrés de changement",
      ),
      lines: [
        L("10° in 90 s | [90/10] = !9 min!", "10° en 90 s | [90/10] = !9 min!"),
        L(
          "at 90 kt | 9 × [90/60] = !13.5 NM!",
          "à 90 kt | 9 × [90/60] = !13,5 NM!",
        ),
      ],
      after: L(
        "Then turn inbound: about 9 minutes to PA.",
        "Puis virez vers la balise : environ 9 minutes jusqu’à PA.",
      ),
      foot: L(
        "FAA IFH ch. 9 · time and distance to station",
        "FAA IFH ch. 9 · temps et distance jusqu’à la station",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "time to station (min) = seconds for the bearing change ÷ degrees of change; distance (NM) = TAS × minutes ÷ 60",
            "temps jusqu’à la balise (min) = secondes pour le changement ÷ degrés de changement ; distance (NM) = Vp × minutes ÷ 60",
          ),
          ruleOfThumb: L(
            "Turn to put the needle on a wingtip (90° or 270° relative), note the time, hold the heading until the bearing has changed 5° to 10°, note the time again. 10° in 90 s: 90 ÷ 10 = 9 minutes to the station; at 90 kt, 9 × 1.5 = 13.5 NM. The same result as 60 × minutes ÷ degrees (FAA IFH ch. 9).",
            "Virez pour mettre l’aiguille en bout d’aile (gisement 90° ou 270°), notez l’heure, tenez le cap jusqu’à ce que le relèvement ait changé de 5° à 10°, notez de nouveau l’heure. 10° en 90 s : 90 ÷ 10 = 9 minutes jusqu’à la balise ; à 90 kt, 9 × 1,5 = 13,5 NM. Même résultat que 60 × minutes ÷ degrés (FAA IFH ch. 9).",
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 9" }],
        },
      ],
    }),
    // 15 ----------------------------------------------------------------- numeric quiz
    step(
      "ndb-time-quiz",
      "quiz",
      L("Minutes to the beacon", "Minutes jusqu’à la balise"),
      [
        {
          t: "text",
          text: L(
            "Needle on the right wingtip. The bearing changes by 5° in 75 seconds.",
            "Aiguille en bout d’aile droite. Le relèvement change de 5° en 75 secondes.",
          ),
        },
      ],
      {
        minutes: 1,
        section: "check",
        quiz: {
          kind: "numeric",
          prompt: L(
            "How many minutes to the station?",
            "Combien de minutes jusqu’à la balise ?",
          ),
          answer: 15,
          tol: 0.5,
          unit: "min",
          explain: L(
            "Seconds ÷ degrees: 75 ÷ 5 = 15 minutes. At 90 kt that is 22.5 NM.",
            "Secondes ÷ degrés : 75 ÷ 5 = 15 minutes. À 90 kt, cela fait 22,5 NM.",
          ),
        },
      },
    ),
    // 16 ----------------------------------------------------------------- recap
    recapStepA2("ndb-recap", {
      title: L("The ADF in three lines", "L’ADF en trois lignes"),
      cols: [
        {
          n: L("MH + RB", "Cm + Gt"),
          text: L(
            "= the bearing to the station (QDM)",
            "= le relèvement vers la balise (QDM)",
          ),
          color: "key",
        },
        {
          n: S("± 180"),
          text: L(
            "QDM to QDR: the line you are on",
            "du QDM au QDR : la ligne où vous êtes",
          ),
          color: "key",
        },
        {
          n: L("s ÷ °", "s ÷ °"),
          text: L("minutes to the station", "minutes jusqu’à la balise"),
          color: "key",
        },
      ],
      checks: [
        L(
          "Track, do not home: head into the wind",
          "Suivez, ne ralliez pas : cap face au vent",
        ),
        L(
          "Intercept: double the offset, 90° max",
          "Interception : doublez l’écart, 90° au plus",
        ),
        L(
          "A storm? Cross-check, never trust one needle",
          "Un orage ? Recoupez, jamais une seule aiguille",
        ),
      ],
      foot: L("FAA IFH ch. 9 · AIM 1-1-2", "FAA IFH ch. 9 · AIM 1-1-2"),
      reader: L(
        "Magnetic heading plus relative bearing gives the bearing to the station (QDM); add or subtract 180 for the QDR, the line you are on; seconds for the bearing change divided by degrees gives the minutes to the station. Track with a heading into the wind instead of homing; intercept at twice the needle offset, 90° at most; near a storm, cross-check with another source.",
        "Cap magnétique plus gisement donne le relèvement vers la balise (QDM) ; ajoutez ou retirez 180 pour le QDR, la ligne où vous êtes ; les secondes du changement de relèvement divisées par les degrés donnent les minutes jusqu’à la balise. Suivez avec un cap face au vent au lieu de rallier ; interceptez au double de l’écart de l’aiguille, 90° au plus ; près d’un orage, recoupez avec une autre source.",
      ),
    }),
    // 17 ----------------------------------------------------------------- fly it
    flyStep(
      "ndb-fly-track",
      "nav-ndb",
      L("Fly it: NDB tracking", "En vol : suivi NDB"),
      L(
        "Track a QDM to the PA NDB with a crosswind, on the needle alone.",
        "Suivez un QDM vers la balise PA par vent de travers, à l’aiguille seule.",
      ),
      [
        L(
          "Head on the QDM, nose into the wind",
          "Tête sur le QDM, nez face au vent",
        ),
        L(
          "Head drifting off? Double the correction",
          "La tête s’écarte ? Doublez la correction",
        ),
      ],
      10,
      ["wind"],
    ),
    // 18 ----------------------------------------------------------------- fly it
    flyStep(
      "ndb-fly-hold",
      "hold-ndb",
      L("Fly it: holding on PA", "En vol : attente sur PA"),
      L(
        "Enter and fly the hold on the PA NDB, inbound 270, right turns; the cockpit plays its briefing first.",
        "Entrez et volez l’attente sur la balise PA, rapprochement 270, virages à droite ; le cockpit joue d’abord son briefing.",
      ),
      [
        L(
          "Station passage: the needle swings to the tail",
          "Passage balise : l’aiguille bascule vers la queue",
        ),
        L(
          "Inbound: head on 270, plus the drift",
          "En rapprochement : tête sur 270, plus la dérive",
        ),
      ],
      12,
      ["wind"],
    ),
  ];
  return course(
    {
      id: IR_NDB_ADF_ID,
      title: L(
        "NDB and ADF: bearings, homing and tracking",
        "NDB et ADF : relèvements, ralliement et suivi",
      ),
      summary: L(
        "The NDB and the RMI, MB = MH + RB, homing against tracking and the wind correction, intercepting bearings, the NDB errors, time and distance to the station: on the live RMI, then flown.",
        "Le NDB et le RMI, QDM = Cm + Gt, ralliement contre suivi et la correction de dérive, l’interception des relèvements, les erreurs du NDB, le temps et la distance jusqu’à la balise : sur le RMI en direct, puis en vol.",
      ),
      cockpit: "steam",
      theme: "classroom",
      tags: ["ir", "easa", "faa", "radionav", "ndb", "adf"],
      minutes: 55,
    },
    steps,
    scenes(),
  );
}
