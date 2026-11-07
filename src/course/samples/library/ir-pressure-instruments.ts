// Ground school — course library (A1): the pressure instruments. Pitot and static, the three-pointer altimeter,
// QNH and the standard setting, pressure and density altitude, the cold-temperature correction, the C172S airspeed
// markings and IAS → CAS → TAS, pitot and static blockages on the live six-pack; generated calculations and a drill.
// Sources: FAA-H-8083-25C PHAK ch. 8 "Flight Instruments" (pitot-static system, altimeter, types of altitude,
// "high to low, look out below", blockages); FAA-H-8083-15B IFH ch. 5 "Flight Instruments"; FAA AIM ch. 7
// (altimeter setting procedures, cold temperature corrections); ICAO Doc 8168 PANS-OPS Vol I (altimeter setting,
// cold temperature correction ≈ 4 % per 10 °C); EASA AMC1 FCL.615(b) IR syllabus, ATPL/IR LOs 022 and 050 (ISA);
// C172S POH sect. 2 (airspeed indicator markings), sect. 3 (static source blockage), sect. 5 (airspeed
// calibration). The training world's figures: the steam altimeter reads inHg; 1 hPa ≈ 27 ft near sea level.
import type { Course, SimScene, Step } from "../../types";
import { DIAGRAM, INST, L, course, step } from "../kit";
import { G } from "../navSlides";
import {
  GAUGE,
  S,
  coverStep,
  formulaStep,
  heroGauge,
  instrumentStep,
  mcq,
  quizStep,
  whyStep,
} from "../briefings/kit";
import {
  SIX,
  panelCompareStep,
  panelNotesStep,
  recapStep,
  sceneA1,
  sixMark,
} from "./kit-a1";

export const IR_PRESSURE_INSTRUMENTS_ID = "sample-lib-ir-pressure-instruments";

const AREA = { fix: "PARD", radial: 160, distNm: 18 };
/** QNH 1000 hPa = 29.53 inHg (the steam altimeter's window reads inHg). */
const QNH_1000 = 29.53;

function scenes(): Record<string, SimScene> {
  return {
    // QNH 1000 set: the altimeter reads the altitude above sea level
    "pi.alt": sceneA1(
      "pi.alt",
      {
        pos: AREA,
        altFt: 5000,
        hdg: 90,
        iasKt: 105,
        radios: { baro: QNH_1000 },
      },
      {
        label: "5,000 ft on QNH 1000 hPa (29.53 inHg) · 105 KIAS",
        weather: { qnh: QNH_1000 },
      },
    ),
    // the same aircraft, 29.92 set: about 390 ft more on the dial (the pressure altitude)
    "pi.std": sceneA1(
      "pi.std",
      { pos: AREA, altFt: 5390, hdg: 90, iasKt: 105, radios: { baro: 29.92 } },
      {
        label: "Same aircraft, 29.92 inHg set: pressure altitude",
        weather: { qnh: QNH_1000 },
      },
    ),
    "pi.high": sceneA1(
      "pi.high",
      { pos: AREA, altFt: 12500, hdg: 90, iasKt: 90, radios: { baro: 29.92 } },
      { label: "12,500 ft · 29.92 inHg", weather: { qnh: 29.92 } },
    ),
    "pi.desc": sceneA1(
      "pi.desc",
      {
        pos: AREA,
        altFt: 5000,
        hdg: 90,
        iasKt: 100,
        pitch: -2,
        vsFpm: -500,
        radios: { baro: 29.92 },
      },
      { label: "Descending at 500 ft/min · 100 KIAS", weather: { qnh: 29.92 } },
    ),
  };
}

const F6: [number, number, number, number] = [G.left, 192, 960, 720];
const mark = (g: "asi" | "alt" | "vsi"): [number, number] => {
  const m = sixMark(1, g, F6, { corner: "tl" });
  return [m.frame.x + 28, m.frame.y + 28];
};

export function irPressureInstrumentsCourse(): Course {
  const steps: Step[] = [
    // 1 ------------------------------------------------------------------ cover
    coverStep(
      "pi-cover",
      L(
        "Pitot and static: the pressure instruments",
        "Pitot et statique : les instruments anémobarométriques",
      ),
      {
        eyebrow: L(
          "Instrument rating · Flight instruments",
          "Qualification IR · Instruments de vol",
        ),
        main: L("Pitot and static", "Pitot et statique"),
        sub: L("altimeter, airspeed, VSI", "altimètre, anémomètre, variomètre"),
        lead: L(
          "Three instruments, two pressures. Know what each one measures, and how it lies.",
          "Trois instruments, deux pressions. Sachez ce que chacun mesure, et comment il se trompe.",
        ),
        meta: L(
          "20 steps · about 55 min · FAA PHAK ch. 8",
          "20 étapes · environ 55 min · FAA PHAK ch. 8",
        ),
        hero: [
          heroGauge(
            "pi-cover.alt",
            "alt",
            L(
              "Altimeter at 5,000 ft, QNH set",
              "Altimètre à 5 000 ft, QNH affiché",
            ),
            "pi.alt",
          ),
        ],
        scene: "pi.alt",
        reader: L(
          "The pressure instruments: the pitot-static system, the altimeter and its settings, pressure and density altitude, the cold-temperature correction, the airspeed indicator from IAS to TAS, and what each instrument does when the pitot or the static port is blocked.",
          "Les instruments anémobarométriques : le circuit pitot-statique, l’altimètre et ses calages, l’altitude pression et l’altitude densité, la correction de température froide, l’anémomètre de la Vi à la Vp, et ce que fait chaque instrument quand le pitot ou la prise statique est obstrué.",
        ),
      },
    ),
    // 2 ------------------------------------------------------------------ why
    whyStep("pi-why", {
      eyebrow: L("Why it matters", "Pourquoi c’est important"),
      title: L(
        "From high to low, look out below",
        "Vers la basse pression, prudence",
      ),
      n: S("27"),
      nW: 208,
      unit: L("ft per hPa", "ft par hPa"),
      color: "key",
      statement: L(
        "A wrong setting is a wrong altitude",
        "Un mauvais calage, une mauvaise altitude",
      ),
      body: L(
        "Fly into lower pressure without resetting: the altimeter reads high.",
        "Volez vers une pression plus basse sans recaler : l’altimètre lit trop haut.",
      ),
      sideTitle: L("Near sea level", "Près du niveau de la mer"),
      side: [
        {
          n: S("1 hPa"),
          text: L(
            "≈ 27 ft (30 ft as a round figure)",
            "≈ 27 ft (30 ft en chiffre rond)",
          ),
          color: "key",
        },
        { n: S("1 inHg"), text: L("≈ 1,000 ft", "≈ 1 000 ft") },
        { n: S("10 hPa"), text: L("≈ 270 ft of error", "≈ 270 ft d’erreur") },
      ],
      foot: L(
        "FAA PHAK ch. 8 · ISA near sea level: 1 hPa ≈ 27 ft",
        "FAA PHAK ch. 8 · ISA près du niveau de la mer : 1 hPa ≈ 27 ft",
      ),
      reader: L(
        "Near sea level the pressure falls by about 1 hPa every 27 ft (30 ft as a round figure), or 1 inch of mercury per 1,000 ft. An altimeter set to a higher pressure than the local one reads too high: 10 hPa of error is about 270 ft. Hence the FAA's memory aid, “from high to low, look out below” (FAA PHAK ch. 8).",
        "Près du niveau de la mer, la pression baisse d’environ 1 hPa tous les 27 ft (30 ft en chiffre rond), soit 1 pouce de mercure pour 1 000 ft. Un altimètre calé sur une pression plus forte que la pression locale lit trop haut : 10 hPa d’erreur font environ 270 ft. D’où l’aide-mémoire de la FAA, « from high to low, look out below » : en allant vers une basse pression, attention en dessous (FAA PHAK ch. 8).",
      ),
    }),
    // 3 ------------------------------------------------------------------ predict
    quizStep("pi-predict", {
      eyebrow: L("Predict", "Prédisez"),
      title: L(
        "QNH 1013 at departure, 993 ahead",
        "QNH 1013 au départ, 993 devant",
      ),
      quote: L(
        "Not reset. The altimeter reads 3,000 ft.",
        "Pas de recalage. L’altimètre lit 3 000 ft.",
      ),
      quiz: mcq(
        L("Where is the aircraft?", "Où est l’avion ?"),
        [
          {
            text: L("Lower", "Plus bas"),
            why: L(
              "Right: about 20 × 27 ≈ 540 ft lower.",
              "Juste : environ 20 × 27 ≈ 540 ft plus bas.",
            ),
          },
          {
            text: L("Higher", "Plus haut"),
            why: L(
              "The other way: the pressure is lower ahead.",
              "C’est l’inverse : la pression est plus basse devant.",
            ),
          },
          {
            text: L("At 3,000 ft", "À 3 000 ft"),
            why: L(
              "Only with the local QNH set.",
              "Seulement avec le QNH local affiché.",
            ),
          },
        ],
        0,
        L(
          "Set the local QNH: the altimeter drops about 540 ft.",
          "Affichez le QNH local : l’altimètre baisse d’environ 540 ft.",
        ),
      ),
      foot: L(
        "FAA PHAK ch. 8 · high to low, look out below",
        "FAA PHAK ch. 8 · vers la basse pression, prudence",
      ),
      reader: L(
        "QNH 1013 set at departure, 993 hPa at the destination, never reset: 20 hPa too high, about 20 × 27 ≈ 540 ft. With 3,000 ft on the dial the aircraft is near 2,460 ft above sea level: lower than indicated (FAA PHAK ch. 8).",
        "QNH 1013 affiché au départ, 993 hPa à destination, jamais recalé : 20 hPa de trop, environ 20 × 27 ≈ 540 ft. Avec 3 000 ft au cadran, l’avion est vers 2 460 ft au-dessus de la mer : plus bas qu’affiché (FAA PHAK ch. 8).",
      ),
    }),
    // 4 ------------------------------------------------------------------ the three instruments on the panel
    panelNotesStep("pi-ports", {
      eyebrow: L("The pitot-static system", "Le circuit pitot-statique"),
      title: L(
        "Two pressures, three instruments",
        "Deux pressions, trois instruments",
      ),
      lead: L(
        "Pitot: ram air. Static: still air.",
        "Pitot : pression totale. Statique : air au repos.",
      ),
      view: SIX,
      alt: L(
        "The six-pack: airspeed, altimeter and VSI on the pitot-static system",
        "Les six instruments : anémomètre, altimètre et variomètre sur le circuit pitot-statique",
      ),
      scene: "pi.alt",
      mode: "live",
      frame: F6,
      marks: [mark("asi"), mark("alt"), mark("vsi")],
      rows: [
        {
          heading: L(
            "Airspeed: pitot and static",
            "Anémomètre : pitot et statique",
          ),
          body: L(
            "The difference is the dynamic pressure.",
            "La différence est la pression dynamique.",
          ),
        },
        {
          heading: L("Altimeter: static only", "Altimètre : statique seule"),
          body: L(
            "Aneroid capsules expand as you climb.",
            "Les capsules anéroïdes gonflent en montée.",
          ),
        },
        {
          heading: L(
            "VSI: static, through a leak",
            "Variomètre : statique et fuite",
          ),
          body: L(
            "The calibrated leak lags: that lag is the rate.",
            "La fuite calibrée retarde : ce retard est le taux.",
          ),
        },
      ],
      foot: L(
        "FAA PHAK ch. 8 · FAA IFH ch. 5 · pitot-static system",
        "FAA PHAK ch. 8 · FAA IFH ch. 5 · circuit pitot-statique",
      ),
      reader: L(
        "The pitot tube senses ram (total) pressure, the static ports the still-air pressure. The airspeed indicator uses both: their difference is the dynamic pressure. The altimeter uses static only: aneroid capsules expand as the static pressure falls in the climb. The VSI uses static only, through a calibrated leak: the case pressure lags the capsule, and that difference shows the rate of climb or descent (FAA PHAK ch. 8, FAA IFH ch. 5).",
        "Le tube de Pitot capte la pression totale, les prises statiques la pression de l’air au repos. L’anémomètre utilise les deux : leur différence est la pression dynamique. L’altimètre n’utilise que la statique : des capsules anéroïdes se dilatent quand la pression baisse en montée. Le variomètre n’utilise que la statique, à travers une fuite calibrée : la pression du boîtier est en retard sur la capsule, et cet écart donne le taux de montée ou de descente (FAA PHAK ch. 8, FAA IFH ch. 5).",
      ),
    }),
    // 5 ------------------------------------------------------------------ the altimeter face
    instrumentStep("pi-face", {
      eyebrow: L("The altimeter", "L’altimètre"),
      title: L("Three pointers and a window", "Trois aiguilles et une fenêtre"),
      lead: L(
        "Live, on QNH 1000 hPa (29.53).",
        "En direct, au QNH 1000 hPa (29,53).",
      ),
      gauge: "alt",
      alt: L(
        "Three-pointer altimeter at 5,000 ft with 29.53 inHg in the window",
        "Altimètre à trois aiguilles à 5 000 ft, 29,53 inHg dans la fenêtre",
      ),
      scene: "pi.alt",
      mode: "live",
      marks: [
        [-0.2, -0.5],
        [-0.22, 0.34],
        [0.34, -0.04],
      ],
      rows: [
        {
          heading: L("Long pointer: hundreds", "Grande aiguille : centaines"),
          body: L("One turn is 1,000 ft.", "Un tour fait 1 000 ft."),
        },
        {
          heading: L("Short pointer: thousands", "Petite aiguille : milliers"),
          body: L(
            "The thin one: tens of thousands.",
            "La fine : dizaines de milliers.",
          ),
        },
        {
          heading: L("Window: the setting", "Fenêtre : le calage"),
          body: L("Altitude {{value}}", "Altitude {{value}}"),
          readout: "alt",
        },
      ],
      foot: L(
        "FAA PHAK ch. 8 · the three-pointer altimeter",
        "FAA PHAK ch. 8 · l’altimètre à trois aiguilles",
      ),
      reader: L(
        "The three-pointer altimeter: the long pointer shows hundreds of feet (one turn is 1,000 ft), the short wide pointer thousands, and the thin pointer with a triangle tens of thousands. A crosshatched flag shows below 10,000 ft. The altimeter setting window (Kollsman window) shows the pressure set; this panel reads inches of mercury (FAA PHAK ch. 8).",
        "L’altimètre à trois aiguilles : la grande aiguille indique les centaines de pieds (un tour fait 1 000 ft), la petite aiguille large les milliers, et l’aiguille fine à triangle les dizaines de milliers. Un drapeau hachuré apparaît sous 10 000 ft. La fenêtre de calage (fenêtre de Kollsman) montre la pression affichée ; ce tableau la lit en pouces de mercure (FAA PHAK ch. 8).",
      ),
    }),
    // 6 ------------------------------------------------------------------ read it (numeric)
    quizStep("pi-read", {
      eyebrow: L("Read it", "Lisez-le"),
      title: L("Read the altimeter", "Lisez l’altimètre"),
      visual: [
        INST(
          GAUGE("alt"),
          L(
            "Three-pointer altimeter, frozen: thin pointer just past 1, short pointer between 2 and 3, long pointer on 5, no crosshatch",
            "Altimètre à trois aiguilles, figé : aiguille fine juste après le 1, petite entre 2 et 3, grande sur le 5, sans hachures",
          ),
          168,
          336,
          624,
          624,
          {
            id: "pi-read.alt",
            scene: "pi.high",
          },
        ),
      ],
      quiz: mcq(
        L(
          "Thin pointer first. What does it show?",
          "L’aiguille fine d’abord. Qu’indique-t-il ?",
        ),
        [
          {
            text: S("2,500 ft"),
            why: L(
              "The classic misread: the thin pointer adds 10,000 ft.",
              "L’erreur classique : l’aiguille fine ajoute 10 000 ft.",
            ),
          },
          {
            text: S("12,500 ft"),
            why: L(
              "Right: 10,000 + 2,000 + 500.",
              "Juste : 10 000 + 2 000 + 500.",
            ),
          },
          {
            text: S("15,200 ft"),
            why: L(
              "The short pointer is between 2 and 3: 2,000.",
              "La petite aiguille est entre 2 et 3 : 2 000.",
            ),
          },
        ],
        1,
        L(
          "No crosshatch: above 10,000 ft. Thin, then short, then long.",
          "Pas de hachures : au-dessus de 10 000 ft. Fine, petite, puis grande.",
        ),
      ),
      foot: L(
        "FAA PHAK ch. 8 · reading the altimeter",
        "FAA PHAK ch. 8 · lire l’altimètre",
      ),
      reader: L(
        "12,500 ft. The thin pointer with the triangle is just past 1 (10,000 ft), the short pointer between 2 and 3 (2,000 ft), the long pointer on 5 (500 ft). The crosshatched flag is hidden: above 10,000 ft. Reading 2,500 ft is the classic 10,000 ft misread of the three-pointer altimeter (FAA PHAK ch. 8).",
        "12 500 ft. L’aiguille fine à triangle est juste après le 1 (10 000 ft), la petite entre 2 et 3 (2 000 ft), la grande sur le 5 (500 ft). Le drapeau hachuré est masqué : au-dessus de 10 000 ft. Lire 2 500 ft, c’est l’erreur classique de 10 000 ft sur l’altimètre à trois aiguilles (FAA PHAK ch. 8).",
      ),
    }),
    // 7 ------------------------------------------------------------------ QNH vs standard
    panelCompareStep("pi-settings", {
      eyebrow: L("Altimeter settings", "Les calages"),
      title: L("Same aircraft, two settings", "Même avion, deux calages"),
      halves: [
        {
          eyebrow: L("QNH set · altitude", "Calage QNH · altitude"),
          color: "nav",
          view: GAUGE("alt"),
          alt: L("Altimeter on QNH: 5,000 ft", "Altimètre au QNH : 5 000 ft"),
          scene: "pi.alt",
          size: [480, 480],
          body: L(
            "QNH 1000 hPa: altitude above sea level, up to the transition.",
            "QNH 1000 hPa : altitude au-dessus de la mer, jusqu’à la transition.",
          ),
        },
        {
          eyebrow: L(
            "Standard set · flight level",
            "Calage standard · niveau de vol",
          ),
          color: "sel",
          view: GAUGE("alt"),
          alt: L(
            "Altimeter on 29.92 inHg: about 5,400 ft, the pressure altitude",
            "Altimètre sur 29,92 inHg : environ 5 400 ft, l’altitude pression",
          ),
          scene: "pi.std",
          size: [480, 480],
          body: L(
            "1013.25 hPa: pressure altitude, flight levels above it.",
            "1013,25 hPa : altitude pression, niveaux de vol au-dessus.",
          ),
        },
      ],
      foot: L(
        "ICAO Doc 8168 Vol I · transition: set by the State (EASA), 18,000 ft (FAA)",
        "OACI Doc 8168 Vol I · transition : fixée par l’État (EASA), 18 000 ft (FAA)",
      ),
      reader: L(
        "The same aircraft with two settings. QNH (here 1000 hPa, 29.53 inHg) makes the altimeter read the altitude above mean sea level: used at and below the transition altitude. The standard setting, 1013.25 hPa (29.92 inHg), makes it read the pressure altitude: flight levels, used above the transition. QFE reads the height above the aerodrome. In Europe each State sets its transition altitude; in the United States it is 18,000 ft (ICAO Doc 8168 Vol I; FAA AIM ch. 7).",
        "Le même avion avec deux calages. Le QNH (ici 1000 hPa, 29,53 inHg) fait lire l’altitude au-dessus du niveau moyen de la mer : utilisé à l’altitude de transition et en dessous. Le calage standard, 1013,25 hPa (29,92 inHg), fait lire l’altitude pression : les niveaux de vol, au-dessus de la transition. Le QFE donne la hauteur au-dessus de l’aérodrome. En Europe, chaque État fixe son altitude de transition ; aux États-Unis elle est de 18 000 ft (OACI Doc 8168 Vol I ; FAA AIM ch. 7).",
      ),
    }),
    // 8 ------------------------------------------------------------------ pressure altitude
    formulaStep("pi-pa", {
      eyebrow: L("The numbers", "Les chiffres"),
      title: L("Pressure altitude", "L’altitude pression"),
      visual: [
        INST(
          GAUGE("alt"),
          L(
            "Altimeter on 29.92 inHg: the pressure altitude",
            "Altimètre sur 29,92 inHg : l’altitude pression",
          ),
          272,
          368,
          592,
          592,
          {
            id: "pi-pa.alt",
            scene: "pi.std",
          },
        ),
      ],
      formula: L(
        "{PA} = {elev} + (1013 − {QNH}) × 27",
        "{Zp} = {Zt} + (1013 − {QNH}) × 27",
      ),
      units: L(
        "feet · hPa · at MSVL, elevation 1,150 ft, QNH 1003",
        "pieds · hPa · à MSVL, altitude 1 150 ft, QNH 1003",
      ),
      lines: [
        L(
          "pressure | 1013 − 1003 = !10 hPa!",
          "pression | 1013 − 1003 = !10 hPa!",
        ),
        L("height | 10 × 27 = !270 ft!", "hauteur | 10 × 27 = !270 ft!"),
        L("PA | 1150 + 270 = !1420 ft!", "Zp | 1150 + 270 = !1420 ft!"),
      ],
      after: L(
        "FAA: PA = elevation + (29.92 − altimeter) × 1,000.",
        "FAA : Zp = altitude + (29,92 − calage) × 1 000.",
      ),
      foot: L(
        "FAA PHAK ch. 8 · types of altitude · 1 hPa ≈ 27 ft near sea level",
        "FAA PHAK ch. 8 · types d’altitude · 1 hPa ≈ 27 ft près du sol",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "PA = elevation + (1013 − QNH) × 27 ft; FAA: PA = elevation + (29.92 − altimeter) × 1,000",
            "Zp = altitude + (1013 − QNH) × 27 ft ; FAA : Zp = altitude + (29,92 − calage) × 1 000",
          ),
          ruleOfThumb: L(
            "At MSVL (elevation 1,150 ft) with QNH 1003: 10 hPa below standard, about 270 ft, so the pressure altitude is about 1,420 ft. Lower pressure than standard means a higher pressure altitude.",
            "À MSVL (altitude 1 150 ft) avec un QNH de 1003 : 10 hPa sous le standard, environ 270 ft, l’altitude pression vaut donc environ 1 420 ft. Une pression inférieure au standard donne une altitude pression plus haute.",
          ),
          refs: [{ src: "FAA-PHAK", ref: "ch. 8" }],
        },
      ],
    }),
    // 9 ------------------------------------------------------------------ calc
    step(
      "pi-pa-calc",
      "calc",
      L("Find the pressure altitude", "Trouver l’altitude pression"),
      [],
      {
        minutes: 2,
        calc: { generatorId: "ifr.pressureAltitude" },
      },
    ),
    // 10 ----------------------------------------------------------------- density altitude
    formulaStep("pi-da", {
      eyebrow: L("The numbers", "Les chiffres"),
      title: L("Density altitude", "L’altitude densité"),
      lead: L(
        "MSVL on a summer day: PA 1,420 ft, OAT 25 °C.",
        "MSVL un jour d’été : Zp 1 420 ft, température 25 °C.",
      ),
      formula: L(
        "{DA} ≈ {PA} + 120 × ({OAT} − {ISA})",
        "{Zd} ≈ {Zp} + 120 × ({T} − {ISA})",
      ),
      units: L(
        "feet · °C · ISA = 15 − 2 × altitude in thousands of feet",
        "pieds · °C · ISA = 15 − 2 × altitude en milliers de pieds",
      ),
      lines: [
        L("ISA | 15 − 2 × 1.4 ≈ !12 °C!", "ISA | 15 − 2 × 1,4 ≈ !12 °C!"),
        L("deviation | 25 − 12 = !+13 °C!", "écart | 25 − 12 = !+13 °C!"),
        L(
          "DA | 1420 + 120 × 13 ≈ !2980 ft!",
          "Zd | 1420 + 120 × 13 ≈ !2980 ft!",
        ),
      ],
      after: L(
        "Hot and high: the aircraft performs as if 1,560 ft higher.",
        "Chaud et haut : l’avion se comporte comme 1 560 ft plus haut.",
      ),
      foot: L(
        "FAA PHAK ch. 4 and 11 · ISA: 15 °C, −2 °C per 1,000 ft",
        "FAA PHAK ch. 4 et 11 · ISA : 15 °C, −2 °C par 1 000 ft",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "DA ≈ PA + 120 × (OAT − ISA); ISA temperature ≈ 15 − 2 × altitude (thousands of ft)",
            "Zd ≈ Zp + 120 × (T − ISA) ; température ISA ≈ 15 − 2 × altitude (milliers de ft)",
          ),
          ruleOfThumb: L(
            "At a pressure altitude of 1,420 ft the ISA temperature is about 12 °C. At 25 °C it is 13 °C warmer than ISA: 13 × 120 ≈ 1,560 ft, a density altitude near 2,980 ft. Take-off run and climb follow the density altitude.",
            "À une altitude pression de 1 420 ft, la température ISA vaut environ 12 °C. À 25 °C il fait 13 °C de plus que l’ISA : 13 × 120 ≈ 1 560 ft, une altitude densité proche de 2 980 ft. La distance de décollage et la montée suivent l’altitude densité.",
          ),
          refs: [{ src: "FAA-PHAK", ref: "ch. 4, ch. 11" }],
        },
      ],
    }),
    // 11 ----------------------------------------------------------------- calc
    step(
      "pi-da-calc",
      "calc",
      L("Find the density altitude", "Trouver l’altitude densité"),
      [],
      {
        minutes: 2,
        calc: { generatorId: "ifr.densityAltitude" },
      },
    ),
    // 12 ----------------------------------------------------------------- cold temperature
    whyStep("pi-cold", {
      eyebrow: L("Cold air", "Air froid"),
      title: L(
        "Colder than ISA, lower than shown",
        "Plus froid que l’ISA, plus bas qu’affiché",
      ),
      n: S("4 %"),
      nW: 400,
      unit: L("per 10 °C", "par 10 °C"),
      color: "key",
      statement: L(
        "Add it to the height above the airport",
        "À ajouter à la hauteur au-dessus du terrain",
      ),
      body: L(
        "Below ISA the air column shrinks: obstacle clearance shrinks with it.",
        "Sous l’ISA, la colonne d’air se tasse : la marge au-dessus des obstacles aussi.",
      ),
      sideTitle: L("Worked example", "Exemple"),
      side: [
        {
          n: S("−30 °C"),
          text: L(
            "airport at sea level, OAT −15 °C",
            "terrain au niveau de la mer, −15 °C",
          ),
        },
        {
          n: S("12 %"),
          text: L("3 × 4 % of the height", "3 × 4 % de la hauteur"),
        },
        {
          n: S("+240 ft"),
          text: L(
            "on 2,000 ft above the airport",
            "sur 2 000 ft au-dessus du terrain",
          ),
          color: "key",
        },
      ],
      foot: L(
        "ICAO Doc 8168 PANS-OPS Vol I · FAA AIM ch. 7 · cold temperature",
        "OACI Doc 8168 PANS-OPS Vol I · FAA AIM ch. 7 · basses températures",
      ),
      reader: L(
        "In air colder than ISA the true altitude is lower than the indicated altitude. PANS-OPS gives a rule of thumb: increase heights by about 4 % for every 10 °C below standard, measured at the altimeter-setting source. Example: an airport near sea level at −15 °C is 30 °C below ISA, so add 12 %: a height of 2,000 ft above the airport needs about 240 ft more (ICAO Doc 8168 Vol I; FAA AIM ch. 7).",
        "Dans un air plus froid que l’ISA, l’altitude vraie est plus basse que l’altitude indiquée. Les PANS-OPS donnent une règle pratique : augmenter les hauteurs d’environ 4 % par 10 °C sous la température standard, mesurée à la source du calage. Exemple : un terrain proche du niveau de la mer à −15 °C est 30 °C sous l’ISA, donc +12 % : une hauteur de 2 000 ft au-dessus du terrain demande environ 240 ft de plus (OACI Doc 8168 Vol I ; FAA AIM ch. 7).",
      ),
    }),
    // 13 ----------------------------------------------------------------- calc
    step(
      "pi-cold-calc",
      "calc",
      L("Correct for the cold", "Corriger pour le froid"),
      [],
      {
        minutes: 3,
        calc: { generatorId: "ifr.coldTemperature" },
      },
    ),
    // 14 ----------------------------------------------------------------- the airspeed indicator
    instrumentStep("pi-asi", {
      eyebrow: L("The airspeed indicator", "L’anémomètre"),
      title: L("The C172S arcs", "Les arcs du C172S"),
      lead: L("Indicated airspeed, in knots.", "Vitesse indiquée, en nœuds."),
      gauge: "asi",
      alt: L(
        "C172S airspeed indicator: white arc 40–85, green 48–129, yellow 129–163, red line 163 KIAS",
        "Anémomètre du C172S : arc blanc 40–85, vert 48–129, jaune 129–163, trait rouge 163 KIAS",
      ),
      scene: "pi.alt",
      mode: "live",
      marks: [
        [0.38, -0.33],
        [0.41, 0.28],
        [-0.45, -0.04],
      ],
      rows: [
        {
          heading: L("White arc: 40 to 85 KIAS", "Arc blanc : 40 à 85 KIAS"),
          body: L(
            "Full-flap operating range.",
            "Plage d’utilisation des volets.",
          ),
        },
        {
          heading: L("Green arc: 48 to 129 KIAS", "Arc vert : 48 à 129 KIAS"),
          body: L(
            "Normal; yellow to 163: smooth air only.",
            "Normal ; jaune jusqu’à 163 : air calme.",
          ),
        },
        {
          heading: L("Red line: 163 KIAS", "Trait rouge : 163 KIAS"),
          body: L(
            "Never exceed. Now {{value}}",
            "Ne jamais dépasser. Ici {{value}}",
          ),
          readout: "ias",
        },
      ],
      foot: L(
        "C172S POH sect. 2 · airspeed indicator markings",
        "C172S POH sect. 2 · repères de l’anémomètre",
      ),
      reader: L(
        "The C172S airspeed indicator markings (POH section 2): white arc 40–85 KIAS, the full-flap operating range (Vso at the bottom, the maximum speed with flaps extended at the top); green arc 48–129 KIAS, the normal operating range (Vs1 at the bottom, the maximum structural cruising speed at the top); yellow arc 129–163 KIAS, caution, smooth air only; red line 163 KIAS, never exceed.",
        "Les repères de l’anémomètre du C172S (POH section 2) : arc blanc 40–85 KIAS, plage d’utilisation volets sortis (Vso en bas, vitesse maximale volets sortis en haut) ; arc vert 48–129 KIAS, plage normale (Vs1 en bas, vitesse maximale en croisière structurale en haut) ; arc jaune 129–163 KIAS, prudence, air calme seulement ; trait rouge 163 KIAS, à ne jamais dépasser.",
      ),
    }),
    // 15 ----------------------------------------------------------------- IAS → CAS → TAS
    formulaStep("pi-tas", {
      eyebrow: L("From IAS to TAS", "De la Vi à la Vp"),
      title: L(
        "True airspeed for navigation",
        "La vitesse propre pour naviguer",
      ),
      visual: [
        DIAGRAM(
          "pi-tas.wind",
          {
            kind: "calc",
            calc: {
              kind: "windTriangle",
              course: 90,
              tasKt: 122,
              windDir: 360,
              windKt: 20,
            },
          },
          L(
            "Wind triangle: course 090, TAS 122 kt, wind 360° at 20 kt",
            "Triangle des vitesses : route 090, Vp 122 kt, vent 360° pour 20 kt",
          ),
          G.left,
          368,
          960,
          592,
        ),
      ],
      formula: L(
        "{TAS} ≈ {IAS} × (1 + 0.02 × [{alt}/1000])",
        "{Vp} ≈ {Vi} × (1 + 0,02 × [{Zp}/1000])",
      ),
      units: L(
        "2 % per 1,000 ft · 105 KIAS at 8,000 ft",
        "2 % par 1 000 ft · 105 KIAS à 8 000 ft",
      ),
      lines: [
        L("8,000 ft | 8 × 2 % = !+16 %!", "8 000 ft | 8 × 2 % = !+16 %!"),
        L("TAS | ≈ 105 × 1.16 ≈ !122 kt!", "Vp | ≈ 105 × 1,16 ≈ !122 kt!"),
      ],
      after: L(
        "TAS goes into the wind triangle; IAS flies the aircraft.",
        "La Vp entre dans le triangle des vitesses ; la Vi pilote l’avion.",
      ),
      foot: L(
        "FAA PHAK ch. 8 · C172S POH sect. 5: 100 KIAS = 97 KCAS, flaps up",
        "FAA PHAK ch. 8 · C172S POH sect. 5 : 100 KIAS = 97 KCAS, volets rentrés",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "IAS → CAS (instrument and position error, POH table) → TAS (density): TAS ≈ CAS + 2 % per 1,000 ft",
            "Vi → Vc (erreurs d’instrument et d’installation, table du POH) → Vp (densité) : Vp ≈ Vc + 2 % par 1 000 ft",
          ),
          ruleOfThumb: L(
            "Calibrated airspeed corrects the indicated airspeed for instrument and position error (C172S POH section 5: 100 KIAS is 97 KCAS, flaps up). True airspeed then grows about 2 % per 1,000 ft: 105 KIAS at 8,000 ft is about 122 kt TAS, the speed the wind triangle uses.",
            "La vitesse conventionnelle corrige la vitesse indiquée des erreurs d’instrument et d’installation (C172S POH section 5 : 100 KIAS font 97 KCAS, volets rentrés). La vitesse propre augmente ensuite d’environ 2 % par 1 000 ft : 105 KIAS à 8 000 ft font environ 122 kt de Vp, la vitesse du triangle des vitesses.",
          ),
          refs: [{ src: "FAA-PHAK", ref: "ch. 8" }],
        },
      ],
    }),
    // 16 ----------------------------------------------------------------- calc
    step(
      "pi-tas-calc",
      "calc",
      L("True airspeed from indicated", "La Vp à partir de la Vi"),
      [],
      {
        minutes: 2,
        calc: { generatorId: "ifr.tasFromIas", params: { method: "rule" } },
      },
    ),
    // 17 ----------------------------------------------------------------- quiz: static blocked
    quizStep("pi-static", {
      eyebrow: L("Question", "Question"),
      title: L("Static port blocked", "Prise statique bouchée"),
      quote: L(
        "Blocked at 5,000 ft. You descend.",
        "Bouchée à 5 000 ft. Vous descendez.",
      ),
      quiz: mcq(
        L("The airspeed indicator reads…", "L’anémomètre indique…"),
        [
          {
            text: L("Too high", "Trop fort"),
            why: L(
              "Right: trapped static is too low, so the difference is too big.",
              "Juste : la statique piégée est trop basse, l’écart est trop grand.",
            ),
          },
          {
            text: L("Too low", "Trop faible"),
            why: L(
              "That is the climb with a blocked static port.",
              "C’est la montée avec la statique bouchée.",
            ),
          },
          {
            text: L("Correctly", "Exact"),
            why: L(
              "It still uses the blocked static pressure.",
              "Il utilise toujours la statique bloquée.",
            ),
          },
        ],
        0,
        L(
          "Below the blockage altitude the ASI over-reads: you are slower than it shows.",
          "Sous l’altitude du blocage, l’anémomètre surestime : vous êtes plus lent qu’affiché.",
        ),
      ),
      foot: L(
        "FAA PHAK ch. 8 · blockage of the pitot-static system",
        "FAA PHAK ch. 8 · obstruction du circuit pitot-statique",
      ),
      reader: L(
        "With the static port blocked, the static pressure of the blockage altitude is trapped. Descending, the real static pressure rises but the instrument does not see it: pitot minus trapped static is too large, so the airspeed indicator reads higher than the real speed. Climbing, it reads lower. The altimeter freezes and the VSI reads zero (FAA PHAK ch. 8).",
        "Prise statique bouchée, la pression statique de l’altitude du blocage reste piégée. En descente, la vraie pression statique augmente mais l’instrument ne la voit pas : pitot moins statique piégée est trop grand, l’anémomètre indique plus que la vitesse réelle. En montée, il indique moins. L’altimètre se fige et le variomètre reste à zéro (FAA PHAK ch. 8).",
      ),
    }),
    // 18 ----------------------------------------------------------------- blockages, live
    panelCompareStep("pi-block", {
      eyebrow: L("Blockages, live", "Obstructions, en direct"),
      title: L(
        "Pitot blocked, static blocked",
        "Pitot bouché, statique bouchée",
      ),
      halves: [
        {
          eyebrow: L(
            "Pitot blocked · ram and drain",
            "Pitot bouché · prise et purge",
          ),
          color: "key",
          view: SIX,
          alt: L(
            "Six-pack descending with the pitot blocked: the airspeed falls with the altitude",
            "Six instruments en descente, pitot bouché : la vitesse baisse avec l’altitude",
          ),
          scene: "pi.desc",
          mode: "live",
          failures: { pitotBlocked: true },
          body: L(
            "The ASI acts like an altimeter: it drops as you descend.",
            "L’anémomètre agit comme un altimètre : il baisse en descente.",
          ),
        },
        {
          eyebrow: L("Static blocked", "Statique bouchée"),
          color: "stop",
          view: SIX,
          alt: L(
            "Six-pack descending with the static port blocked: altimeter frozen, VSI at zero",
            "Six instruments en descente, statique bouchée : altimètre figé, variomètre à zéro",
          ),
          scene: "pi.desc",
          mode: "live",
          failures: { staticBlocked: true },
          body: L(
            "Altimeter frozen, VSI at zero. Alternate static: pull on.",
            "Altimètre figé, vario à zéro. Statique de secours : tirer.",
          ),
        },
      ],
      foot: L(
        "FAA PHAK ch. 8 · C172S POH sect. 3: static source blockage",
        "FAA PHAK ch. 8 · C172S POH sect. 3 : obstruction de la prise statique",
      ),
      reader: L(
        "The same descent with two failures. Pitot blocked (ram air and drain hole): the airspeed indicator traps a total pressure and acts like an altimeter, reading lower as you descend and higher as you climb. Static port blocked: the altimeter freezes, the VSI reads zero and the airspeed is wrong. The C172S POH section 3 procedure: static pressure alternate source valve — PULL ON, then use the alternate static calibration table of section 5 (with the windows closed, at most 4 knots and 30 feet from normal).",
        "La même descente avec deux pannes. Pitot bouché (prise et trou de purge) : l’anémomètre garde une pression totale et agit comme un altimètre, il baisse en descente et monte en montée. Prise statique bouchée : l’altimètre se fige, le variomètre reste à zéro et la vitesse est fausse. Procédure du C172S POH section 3 : robinet de prise statique de secours — TIRER, puis utiliser la table d’étalonnage statique de secours de la section 5 (fenêtres fermées, au plus 4 nœuds et 30 pieds d’écart).",
      ),
    }),
    // 19 ----------------------------------------------------------------- recap
    recapStep("pi-recap", {
      title: L("Three numbers to carry", "Trois chiffres à retenir"),
      cols: [
        {
          n: S("27"),
          text: L(
            "ft per hPa near sea level",
            "ft par hPa près du niveau de la mer",
          ),
          color: "key",
        },
        {
          n: S("120"),
          text: L(
            "ft of density altitude per °C off ISA",
            "ft d’altitude densité par °C d’écart ISA",
          ),
          color: "key",
        },
        {
          n: S("4 %"),
          text: L(
            "of the height per 10 °C below ISA",
            "de la hauteur par 10 °C sous l’ISA",
          ),
          color: "key",
        },
      ],
      checks: [
        L(
          "Reset QNH: high to low, look out below",
          "Recaler le QNH : basse pression, prudence",
        ),
        L("Read the thin pointer first", "Lire l’aiguille fine d’abord"),
        L(
          "Frozen altimeter: alternate static",
          "Altimètre figé : statique de secours",
        ),
      ],
      foot: L(
        "FAA PHAK ch. 8 · ICAO Doc 8168 Vol I · C172S POH sect. 3",
        "FAA PHAK ch. 8 · OACI Doc 8168 Vol I · C172S POH sect. 3",
      ),
      reader: L(
        "27 ft per hPa near sea level; density altitude grows about 120 ft per °C above ISA; in the cold, add about 4 % of the height above the airport per 10 °C below ISA. Reset the QNH (from high to low, look out below), read the thin pointer of the altimeter first, and on a frozen altimeter select the alternate static source.",
        "27 ft par hPa près du niveau de la mer ; l’altitude densité augmente d’environ 120 ft par °C au-dessus de l’ISA ; par grand froid, ajoutez environ 4 % de la hauteur au-dessus du terrain par 10 °C sous l’ISA. Recalez le QNH (vers la basse pression, prudence), lisez d’abord l’aiguille fine de l’altimètre, et sur un altimètre figé, passez sur la prise statique de secours.",
      ),
    }),
    // 20 ----------------------------------------------------------------- drill
    step(
      "pi-drill",
      "drill",
      L("Drill: altimetry and airspeed", "Série : altimétrie et vitesses"),
      [],
      {
        minutes: 8,
        drill: {
          generatorIds: [
            "ifr.pressureAltitude",
            "ifr.densityAltitude",
            "ifr.coldTemperature",
            "ifr.tasFromIas",
          ],
          count: 8,
          timer: { mode: "stopwatch" },
          feedback: "each",
          practiceOnly: true,
        },
      },
    ),
  ];
  return course(
    {
      id: IR_PRESSURE_INSTRUMENTS_ID,
      title: L(
        "The pressure instruments: altimeter, airspeed, VSI",
        "Les instruments anémobarométriques : altimètre, anémomètre, variomètre",
      ),
      summary: L(
        "Pitot and static, the three-pointer altimeter, QNH and standard, pressure and density altitude, the cold correction, the C172S arcs and TAS, and pitot or static blockages live on the six-pack.",
        "Pitot et statique, l’altimètre à trois aiguilles, QNH et calage standard, altitude pression et densité, la correction de froid, les arcs du C172S et la Vp, et les obstructions pitot ou statique en direct sur les six instruments.",
      ),
      cockpit: "steam",
      theme: "classroom",
      tags: [
        "ir",
        "easa",
        "faa",
        "c172s",
        "instruments",
        "altimetry",
        "pitot-static",
      ],
      minutes: 55,
    },
    steps,
    scenes(),
  );
}
