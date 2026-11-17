// Ground school — built-in sample "Maths for VFR" (37 steps), built as a lesson: the cover, the objectives
// (measurable), the fuel question as the hook, then four parts. Each rule is taught on one slide with a worked
// example and a live diagram or instrument, tried (the simulator checks a plain-word goal), practised on generated
// problems (new numbers on every attempt) and flown: 1 heading and wind (true course to compass heading, the wind
// triangle, the triangle on the HSI, the drift stopped with the map beside the instrument, ground speed, fuel),
// 2 runway and performance (pressure altitude on the Kollsman knob, density altitude, the distance factors, the
// crosswind clock code — a crosswind final flown), 3 weight, balance and units, 4 the takeaways, three retrieval
// questions on the classic mistakes, the drill, the page to keep and the heading you computed, flown. Laid out on
// the design-system archetypes (SPEC slides v2 §8, mathsSlides.ts): classroom theme, formulas in the formula style.
// Sources: FAA-H-8083-25 Pilot's Handbook of Aeronautical Knowledge (ch. 8 altimetry, ch. 11 performance, ch. 16
// navigation), FAA-H-8083-3 Airplane Flying Handbook (crosswind), the C172S POH (section 4 maximum demonstrated
// crosswind 15 kt, section 5 distance notes, section 6 weight and balance; sample figures for training only), UK CAA
// SafetySense 7 (surface, slope and safety factors), 14 CFR 91.151 and EASA Part-NCO (VFR fuel: 30 min by day).
import type { Course, SimScene, Step } from "../types";
import {
  DIAGRAM,
  G as GOAL,
  INST,
  L,
  MARK,
  QUIZ,
  T,
  canvas,
  course,
  scene,
  slideStep,
  step,
} from "./kit";
import {
  G,
  coverBlocks,
  foot,
  gauge,
  gaugePoint,
  head,
  lead,
  noteRows,
  objectivesBlocks,
  quizBlocks,
  recapBlocks,
  rule,
  sectionBlocks,
  sheetBlocks,
} from "./mathsSlides";

import { WB } from "../calc/vfr/performance";

export const MATHS_VFR_ID = "sample-maths-vfr";
/** what the cover promises: the step count and the minutes (course.minutes is the sum of the steps', a test checks) */
export const VFR_STEPS = 37;
export const VFR_MIN = 84;

const ALT = gauge("alt");
const HSI = gauge("hsi");

// the worked example of the wind triangle, in the air: the 040 course to MSV at 4,500 ft, wind 320/30
const TRIANGLE_WX = {
  windDir: 320,
  windKt: 30,
  turbulence: 0,
  aloft: [{ altFt: 4500, dir: 320, kt: 30 }],
};

export function mathsVfrScenes(): Record<string, SimScene> {
  return {
    // on the ground at Mistral Valley (1,150 ft), a hot low-pressure day: QNH 29.62 in (1003 hPa), 31 °C. With the
    // QNH set the altimeter reads the elevation (mv.field); with 29.92 set it reads the pressure altitude, 1,450 ft
    // (mv.field.std: the fields' altitude is what the altimeter reads)
    "mv.field": scene(
      "mv.field",
      {
        pos: { runway: { icao: "MSVL", id: "21" }, distNm: 0 },
        altFt: 1150,
        hdg: 210,
        iasKt: 0,
        radios: { baro: 29.62 },
      },
      {
        label: "MSVL runway 21 · 1,150 ft · QNH 29.62 in (1003 hPa) · 31 °C",
        weather: { qnh: 29.62, oatSeaLevelC: 33 },
      },
    ),
    "mv.field.std": scene(
      "mv.field.std",
      {
        pos: { runway: { icao: "MSVL", id: "21" }, distNm: 0 },
        altFt: 1450,
        hdg: 210,
        iasKt: 0,
        radios: { baro: 29.92 },
      },
      {
        label: "MSVL runway 21 · 1,150 ft · QNH 29.62 in, altimeter set to 29.92",
        weather: { qnh: 29.62, oatSeaLevelC: 33 },
      },
    ),
    // another day at Mistral Valley, pressure above standard: QNH 30.22 in (1023 hPa). The student sets 29.92 and
    // reads the pressure altitude, 850 ft (mv-pa-try)
    "mv.field.hi": scene(
      "mv.field.hi",
      {
        pos: { runway: { icao: "MSVL", id: "21" }, distNm: 0 },
        altFt: 1150,
        hdg: 210,
        iasKt: 0,
        radios: { baro: 30.22 },
      },
      {
        label: "MSVL runway 21 · 1,150 ft · QNH 30.22 in (1023 hPa)",
        weather: { qnh: 30.22 },
      },
    ),
    // the wind triangle of the slides, flown: 20 NM south-west of MSV on its 040 course, 4,500 ft, about 90 kt true,
    // wind 320/30 — on the corrected heading 021 (mv.hdg: track 040, about 80 kt over the ground) and uncorrected on
    // 040 (mv.drift: the student turns into the wind)
    "mv.hdg": scene(
      "mv.hdg",
      {
        pos: { fix: "MSV", radial: 220, distNm: 20 },
        altFt: 4500,
        hdg: 21,
        iasKt: 87,
        radios: { nav1: "MSV", obs1: 40, cdi: "NAV1" },
      },
      {
        label: "MSV R-220 · 20 NM · 4,500 ft · heading 021 · wind 320/30",
        weather: TRIANGLE_WX,
      },
    ),
    "mv.drift": scene(
      "mv.drift",
      {
        pos: { fix: "MSV", radial: 220, distNm: 20 },
        altFt: 4500,
        hdg: 40,
        iasKt: 87,
        radios: { nav1: "MSV", obs1: 40, cdi: "NAV1" },
      },
      {
        label: "MSV R-220 · 20 NM · 4,500 ft · heading 040 · wind 320/30",
        weather: TRIANGLE_WX,
      },
    ),
    // straight-in to MSVL 21, 5 NM out over MSV (the FAF of the VOR 21, 3,200 ft minimum), wind 240/20: 30° off the
    // runway, so 10 kt across (½ of 20) and 17 kt down the runway; at 80 KIAS the crab is about 10 × 60 ÷ 80 ≈ 8°
    "mv.xwind": scene(
      "mv.xwind",
      {
        pos: { runway: { icao: "MSVL", id: "21" }, distNm: 5 },
        altFt: 3200,
        hdg: 214,
        iasKt: 80,
        radios: { baro: 29.92 },
      },
      {
        label: "MSVL 21 · 5 NM final over MSV · 3,200 ft · heading 214 · wind 240/20",
        wind: [240, 20],
      },
    ),
  };
}

// a strong wind against a trainer's speed, so the triangle is large and the drift readable: 320/30 on 040 at 90 KTAS
// gives a 19° WCA (heading 021) and an 80 kt ground speed
const WIND = {
  kind: "windTriangle" as const,
  course: 40,
  tasKt: 90,
  windDir: 320,
  windKt: 30,
};

// ================================================================== part 1: the rules (slides)
/** A1 — the cover: the wind triangle as the hero. */
function cover(): Step {
  return slideStep(
    "mv-cover",
    L("Maths for VFR", "Les maths du VFR"),
    canvas(
      coverBlocks({
        eyebrow: L(
          "Ground school · Flight planning",
          "Théorie · Préparation du vol",
        ),
        main: L("Maths for VFR", "Les maths du VFR"),
        sub: L(
          "The navigation log, in your head",
          "Le log de navigation, de tête",
        ),
        lead: L(
          "Heading, wind, fuel, crosswind, performance and balance: shown on live diagrams and instruments, tried on them, then flown in the simulator.",
          "Cap, vent, carburant, vent de travers, performances et centrage : montrés sur des schémas et des instruments en direct, essayés dessus, puis volés au simulateur.",
        ),
        meta: L(
          `${VFR_STEPS} steps · about ${VFR_MIN} min · new numbers on every attempt`,
          `${VFR_STEPS} étapes · environ ${VFR_MIN} min · de nouveaux chiffres à chaque essai`,
        ),
        hero: [
          DIAGRAM(
            "mv-cover.d",
            { kind: "calc", calc: { ...WIND } },
            L(
              "Wind triangle: course 040, 90 KTAS, wind 320 at 30 kt",
              "Triangle des vents : route 040, 90 kt de Vp, vent 320 pour 30 kt",
            ),
            984,
            96,
            816,
            888,
          ),
        ],
      }),
      { layout: "cover" },
    ),
    [
      {
        t: "text",
        text: L(
          "Four parts: heading and wind, runway and performance, weight and units, then the review. Each rule is shown on a live diagram or instrument, tried on it, practised on new numbers and flown: the drift stopped on the HSI, a crosswind final, and the heading you computed.",
          "Quatre parties : le cap et le vent, la piste et les performances, la masse et les unités, puis le bilan. Chaque règle est montrée sur un schéma ou un instrument en direct, essayée dessus, pratiquée sur de nouveaux chiffres et volée : la dérive arrêtée sur le HSI, une finale par vent de travers, et le cap calculé.",
        ),
      },
    ],
    { minutes: 1 },
  );
}

/** A9 — why it matters: the fuel question. */
function why(): Step {
  return slideStep(
    "mv-why",
    L("Why it matters", "Pourquoi c’est utile"),
    canvas(
      [
        ...head(
          L("Why it matters", "Pourquoi c’est utile"),
          L(
            "Fuel is the one number you can’t fix aloft",
            "Le carburant ne se rattrape pas en vol",
          ),
        ),
        lead(L("A day VFR cross-country.", "Une navigation VFR de jour.")),
        T("eyebrow", L("Flight time", "Temps de vol"), G.x(0), 336, 528, 32, {
          color: "muted",
        }),
        T("number", L("1 h 30", "1 h 30"), G.x(0), 376, 528, 104, {
          color: "text",
        }),
        T("eyebrow", L("Fuel flow", "Consommation"), G.x(4), 336, 528, 32, {
          color: "muted",
        }),
        T("number", L("9 gal/h", "9 gal/h"), G.x(4), 376, 528, 104, {
          color: "text",
        }),
        QUIZ(
          "mv-why.q",
          {
            kind: "mcq",
            prompt: L(
              "The minimum fuel on board at take-off, in US gallons?",
              "Le carburant minimum au décollage, en gallons US ?",
            ),
            options: [
              {
                text: L("13.5", "13,5"),
                why: L(
                  "That is the trip alone: no reserve at all.",
                  "C’est le trajet seul : aucune réserve.",
                ),
              },
              { text: L("18", "18") },
              {
                text: L("22.5", "22,5"),
                why: L(
                  "That is a full hour of reserve: safe, but more than the minimum.",
                  "C’est une heure entière de réserve : prudent, mais plus que le minimum.",
                ),
              },
            ],
            answer: 1,
            explain: L(
              "1 h 30 + the 30 min day VFR reserve = 2 h × 9 = 18 US gal. Then add taxi fuel and your own margin.",
              "1 h 30 + la réserve de 30 min de jour = 2 h × 9 = 18 gal US. Ajoutez ensuite le roulage et votre propre marge.",
            ),
          },
          G.left,
          528,
          1680,
          456,
        ),
        foot(
          L(
            "14 CFR 91.151 · EASA Part-NCO: 30 min by day, 45 min at night",
            "14 CFR 91.151 · EASA Part-NCO : 30 min de jour, 45 min de nuit",
          ),
        ),
      ],
      { layout: "quiz" },
    ),
    [
      {
        t: "text",
        text: L(
          "Day VFR: fuel for the flight plus 30 minutes at normal cruise (14 CFR 91.151; EASA Part-NCO). 1 h 30 at 9 gal/h: 2 h × 9 = 18 US gal, plus taxi. In litres: 9 gal/h ≈ 34 L/h, 18 US gal ≈ 68 L.",
          "VFR de jour : le carburant du vol plus 30 minutes en croisière normale (14 CFR 91.151 ; EASA Part-NCO). 1 h 30 à 9 gal/h : 2 h × 9 = 18 gal US, plus le roulage. En litres : 9 gal/h ≈ 34 L/h, 18 gal US ≈ 68 L (1 gal US = 3,785 L).",
        ),
      },
    ],
    { minutes: 2 },
  );
}

/** The objectives: what the student can do at the end, measurably, and how the course proves it. */
function goals(): Step {
  const items = [
    L(
      "Go from the true course to the compass heading with no sign error.",
      "Passer de la route vraie au cap compas, sans erreur de signe.",
    ),
    L(
      "Find the drift, the ground speed and the fuel of a leg, within 3° and 2 minutes.",
      "Trouver la dérive, la vitesse sol et le carburant d’une branche, à 3° et 2 minutes près.",
    ),
    L(
      "Say in ten seconds whether the crosswind is within limits.",
      "Dire en dix secondes si le vent de travers est dans les limites.",
    ),
    L(
      "Check the take-off distance, the weight and the balance before you leave.",
      "Vérifier la distance de décollage, la masse et le centrage avant de partir.",
    ),
  ];
  return slideStep(
    "mv-goals",
    L("What you will be able to do", "Ce que vous saurez faire"),
    canvas(
      objectivesBlocks({
        eyebrow: L("Objectives", "Objectifs"),
        title: L("What you will be able to do", "Ce que vous saurez faire"),
        objectives: items,
        proofs: [
          {
            n: L("6", "6"),
            text: L("instruments and diagrams you work yourself", "instruments et schémas à manipuler vous-même"),
          },
          {
            n: L("8", "8"),
            text: L("calculations, new numbers each time", "calculs, de nouveaux chiffres à chaque fois"),
          },
          {
            n: L("7", "7"),
            text: L("questions, every wrong answer explained", "questions, chaque erreur expliquée"),
          },
          { n: L("2", "2"), text: L("flights in the cockpit", "vols au cockpit"), color: "path" },
        ],
        tip: L(
          "All of it in the head, before the engine starts. Each rule comes with the real numbers of a C172, for training only.",
          "Tout de tête, avant la mise en route. Chaque règle vient avec les vrais chiffres d’un C172, pour l’exercice seulement.",
        ),
      }),
      { layout: "ready" },
    ),
    [{ t: "keys", items }],
    { minutes: 1 },
  );
}

/** A5 — the triangle in the air: the HSI on the corrected heading, the course pointer on the track, live values. */
function headingSlide(): Step {
  const [x, y, s] = [G.left, 120, 840];
  const nose = gaugePoint("hsi", x, y, s, -0.14, -0.52);
  const crs = gaugePoint("hsi", x, y, s, 0.52, -0.3);
  return slideStep(
    "mv-hdg",
    L("In flight: the heading is not the track", "En vol : le cap n’est pas la route"),
    canvas(
      [
        INST(
          HSI,
          L(
            "HSI: heading 021 under the index, course pointer on 040, bar centred",
            "HSI : cap 021 sous l’index, aiguille de route sur 040, barre centrée",
          ),
          x,
          y,
          s,
          s,
          { id: "mv-hdg.hsi", scene: "mv.hdg" },
        ),
        MARK(1, nose[0], nose[1], { size: 56, reveal: 1, group: "row1" }),
        MARK(2, crs[0], crs[1], { size: 56, reveal: 2, group: "row2" }),
        T("eyebrow", L("Wind triangle", "Triangle des vents"), 1128, 120, 672, 32),
        T(
          "title",
          L("In flight: heading is not track", "En vol : le cap n’est pas la route"),
          1128,
          160,
          672,
          176,
        ),
        ...noteRows([
          {
            h: L("The heading: where the nose points", "Le cap : où pointe le nez"),
            b: L(
              "Under the index at the top, 19° into the wind: {{value}}",
              "Sous l’index du haut, 19° vers le vent : {{value}}",
            ),
            color: "sel",
            mark: 1,
            live: { readout: "hdg", scene: "mv.hdg" },
          },
          {
            h: L("The track: where the aircraft goes", "La route : où va l’avion"),
            b: L(
              "Course pointer on 040, bar centred. Track flown: {{value}}",
              "Aiguille de route sur 040, barre centrée. Route suivie : {{value}}",
            ),
            color: "path",
            mark: 2,
            live: { readout: "trk", scene: "mv.hdg" },
          },
          {
            h: L("The ground speed", "La vitesse sol"),
            b: L(
              "90 kt through the air, less over the ground: {{value}}",
              "90 kt dans l’air, moins au-dessus du sol : {{value}}",
            ),
            live: { readout: "gs", scene: "mv.hdg" },
          },
        ]),
        foot(L("FAA PHAK ch. 16", "FAA PHAK ch. 16"), 672, 1128),
      ],
      { scene: "mv.hdg", layout: "instrumentNotes" },
    ),
    [
      {
        t: "text",
        text: L(
          "The wind triangle, in the air: course 040 to MSV, 90 kt true, wind 320/30. The nose points to 021, 19° left of the course, into the wind; the aircraft still goes along 040 and the bar stays centred. Over the ground it does about 80 kt. In the aircraft: you set the heading, you check the track.",
          "Le triangle des vents, en vol : route 040 vers MSV, 90 kt de vitesse propre, vent 320/30. Le nez pointe au 021, 19° à gauche de la route, vers le vent ; l’avion suit pourtant le 040 et la barre reste centrée. Au-dessus du sol il fait environ 80 kt. Dans l’avion : on affiche le cap, on vérifie la route.",
        ),
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

/** Try it — the same triangle, uncorrected: heading 040, the wind pushes the aircraft right of the course (the map
 *  shows it); the student turns into the wind until the track is back on 040. */
function driftTry(): Step {
  return step(
    "mv-drift-try",
    "try",
    L("Try it: stop the drift", "À vous : arrêtez la dérive"),
    [
      {
        t: "text",
        text: L(
          "Same leg, but nobody corrected: you fly heading 040 on the 040 course to MSV, wind 320/30 from your left. Watch the map: the aircraft slides right of the line, and the bar of the HSI moves left. Turn left, into the wind, to the heading of the triangle.",
          "La même branche, mais sans correction : vous volez au cap 040 sur la route 040 vers MSV, vent 320/30 venant de la gauche. Regardez la carte : l’avion glisse à droite du trait, et la barre du HSI part à gauche. Virez à gauche, vers le vent, au cap du triangle.",
        ),
      },
      {
        t: "doThis",
        rows: [
          {
            text: L(
              "Turn left to heading **021** (±5°)",
              "Virez à gauche au cap **021** (±5°)",
            ),
            check: 0,
            readout: "hdg",
          },
          {
            text: L(
              "Hold the track **040** (±3°)",
              "Tenez la route **040** (±3°)",
            ),
            check: 1,
            readout: "trk",
          },
        ],
      },
      {
        t: "keys",
        items: [
          L(
            "The heading is what you set; the track is what you get. The difference is the drift: 19° here.",
            "Le cap, c’est ce que vous affichez ; la route, ce que vous obtenez. La différence, c’est la dérive : 19° ici.",
          ),
        ],
      },
    ],
    {
      minutes: 3,
      stage: {
        panes: [{ kind: "six", crop: { region: "STEAM_LEFT:4" } }],
        inset: "plan",
        mode: "live",
        scene: "mv.drift",
        controls: ["bank"],
        assist: { holdAlt: true, holdIas: true },
      },
      goal: {
        all: [GOAL.heading(21, 5), GOAL.track(40, 3)],
        holdS: 10,
        graded: false,
        success: L(
          "Heading 021, track 040: the 19° of the triangle, flown.",
          "Cap 021, route 040 : les 19° du triangle, en vol.",
        ),
      },
      hint: L(
        "Hold “Left” until the heading reads about 021, then let go: the wings level by themselves.",
        "Maintenez « À gauche » jusqu’à lire environ 021 au cap, puis relâchez : les ailes se remettent à plat seules.",
      ),
    },
  );
}

/** A5 — pressure altitude on the altimeter: the Kollsman window and what 29.92 does to the reading. The student
 *  turns the knob in the next step (mv-pa-try). */
function pressureSlide(): Step {
  const [x, y, s] = [G.left, 120, 840];
  const win = gaugePoint("alt", x, y, s, 0.36, -0.06);
  return slideStep(
    "mv-pa",
    L("Pressure altitude: set 1013", "L’altitude-pression : calez 1013"),
    canvas(
      [
        INST(
          ALT,
          L(
            "Altimeter at Mistral Valley set to the QNH 29.62: 1,150 ft, the field elevation",
            "Altimètre à Mistral Valley calé au QNH 29.62 (1003 hPa) : 1 150 ft, l’altitude du terrain",
          ),
          x,
          y,
          s,
          s,
          { id: "mv-pa.alt", scene: "mv.field" },
        ),
        MARK(1, win[0], win[1], { size: 56, reveal: 1, group: "row1" }),
        T("eyebrow", L("Performance", "Performances"), 1128, 120, 672, 32),
        T(
          "title",
          L("Pressure altitude: set 29.92", "L’altitude-pression : calez 1013"),
          1128,
          160,
          672,
          176,
        ),
        ...noteRows([
          {
            h: L("The window: the QNH, 29.62", "La fenêtre : le QNH, 29.62"),
            b: L(
              "1003 hPa. The altimeter reads the field elevation: {{value}}",
              "Soit 1003 hPa. L’altimètre lit l’altitude du terrain : {{value}}",
            ),
            mark: 1,
            live: { readout: "alt", scene: "mv.field" },
          },
          {
            h: L("Set 29.92: pressure altitude", "Calez 29.92 (1013) : la Zp"),
            b: L(
              "0.30 in more is +300 ft: PA **1,450 ft**. Low pressure, higher PA.",
              "0,30 inHg de plus, +300 ft : Zp **1 450 ft**. Pression basse, Zp plus haute.",
            ),
            color: "sel",
          },
          {
            h: L("In the aircraft", "Dans l’avion"),
            b: L(
              "The POH tables are entered with PA and temperature, not with the elevation.",
              "Les tables du manuel se lisent avec la Zp et la température, pas avec l’altitude du terrain.",
            ),
          },
        ]),
        foot(
          L(
            "FAA PHAK ch. 8 · 29.92 inHg = 1013 hPa",
            "FAA PHAK ch. 8 · 29.92 inHg = 1013 hPa",
          ),
          672,
          1128,
        ),
      ],
      { scene: "mv.field", layout: "instrumentNotes" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "PA = elevation + (29.92 − altimeter) × 1,000 ft",
          "Zp = altitude du terrain + (1013 − QNH) × 27 ft",
        ),
        ruleOfThumb: L(
          "Mistral Valley, 1,150 ft, QNH 29.62 (1003 hPa): set 29.92 and the altimeter reads 1,450 ft, the pressure altitude. In the next step, you turn the setting knob yourself. The trainer’s altimeter is graduated in inHg: 29.92 inHg = 1013 hPa.",
          "Mistral Valley, 1 150 ft, QNH 1003 (29.62 inHg) : calez 1013 et l’altimètre lit 1 450 ft, l’altitude-pression (10 hPa × 27 ft ≈ 300 ft). À l’étape suivante, vous tournez vous-même le bouton de calage. L’altimètre de l’avion d’entraînement est gradué en inHg : 29.92 inHg = 1013 hPa.",
        ),
        refs: [{ src: "FAA-PHAK", ref: "ch. 8" }],
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

/** A7 horizontal — TVMDC: the live heading tape, then the four steps on a rail, one per reveal. */
function tvmdc(): Step {
  const steps: [
    string,
    string,
    string,
    string,
    "sel" | "nav" | "key" | undefined,
  ][] = [
    [
      "TC 090",
      "Rv 090",
      "true course, from the chart",
      "route vraie, sur la carte",
      undefined,
    ],
    [
      "TH 082",
      "Cv 082",
      "− 8° of drift, into the wind",
      "− 8° de dérive, face au vent",
      "sel",
    ],
    [
      "MH 085",
      "Cm 085",
      "+ 3° W variation: west is best",
      "+ 3° W (ouest) de déclinaison : on ajoute",
      "nav",
    ],
    [
      "CH 087",
      "Cc 087",
      "+ 2° deviation, from the compass card",
      "+ 2° de déviation, carte du compas",
      "key",
    ],
  ];
  return slideStep(
    "mv-tvmdc",
    L("From true course to compass heading", "De la route vraie au cap compas"),
    canvas(
      [
        ...head(
          L("Navigation", "Navigation"),
          L(
            "From true course to compass heading",
            "De la route vraie au cap compas",
          ),
        ),
        lead(
          L(
            "TC → wind → TH → variation → MH → deviation → CH, always in that order.",
            "Rv → dérive → Cv → déclinaison → Cm → déviation → Cc, toujours dans cet ordre.",
          ),
          1560,
        ),
        DIAGRAM(
          "mv-tvmdc.d",
          {
            kind: "calc",
            calc: {
              kind: "compass",
              tc: 90,
              wca: -8,
              variation: -3,
              deviation: 2,
              drag: ["wca", "variation", "deviation"],
            },
          },
          L(
            "Heading tape: true course 090, wind correction −8°, variation 3° W, deviation +2°",
            "Bande de cap : route vraie 090, correction de dérive −8°, déclinaison 3° W, déviation +2°",
          ),
          G.left,
          320,
          1680,
          432,
          {
            interactive: true,
            caption: L(
              "Drag each correction: the headings follow.",
              "Déplacez chaque correction : les caps suivent.",
            ),
          },
        ),
        rule(G.left, 808, 1680),
        ...steps.flatMap(([a, af, b, bf, col], i) => {
          const x = G.left + 432 * i;
          const g = `s${i + 1}`;
          return [
            MARK(i + 1, x + 28, 808, { size: 56, reveal: i + 1, group: g }),
            T("heading", L(a, af), x, 848, 384, 56, {
              reveal: i + 1,
              group: g,
              ...(col ? { color: col } : {}),
            }),
            T("small", L(b, bf), x, 912, 384, 72, { reveal: i + 1, group: g }),
          ];
        }),
      ],
      { layout: "stepByStep" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "TH = TC + WCA; MH = TH − variation (E +); CH = MH + deviation",
          "Cv = Rv + dérive ; Cm = Cv − déclinaison (E +) ; Cc = Cm + déviation",
        ),
        ruleOfThumb: L(
          "East is least, West is best.",
          "Est on retranche, Ouest on ajoute.",
        ),
        refs: [{ src: "FAA-PHAK", ref: "ch. 16" }],
      },
    ],
    { kind: "explain", minutes: 3 },
  );
}

/** A9 — variation: the one sign to get right. */
function variation(): Step {
  return slideStep(
    "mv-var",
    L("East is least, West is best", "Est on retranche, Ouest on ajoute"),
    canvas(
      [
        ...head(
          L("Variation", "Déclinaison"),
          L("East is least, West is best", "Est on retranche, Ouest on ajoute"),
        ),
        lead(L("From true to magnetic.", "Du vrai au magnétique.")),
        T(
          "formula",
          L(
            "{MH} = {TH} + {variation W} − {variation E}",
            "{Cm} = {Cv} + {décl. W} − {décl. E}",
          ),
          G.left,
          336,
          1560,
          88,
        ),
        QUIZ(
          "mv-tvmdc.q",
          {
            kind: "mcq",
            prompt: L(
              "True heading 082, variation 3° **W**. Magnetic heading?",
              "Cap vrai 082, déclinaison 3° **W**. Cap magnétique ?",
            ),
            options: [
              {
                text: L("085", "085"),
                why: L("West is best: add the 3°.", "Ouest, on ajoute les 3°."),
              },
              {
                text: L("079", "079"),
                why: L(
                  "You applied variation the wrong way: West is best (add).",
                  "Déclinaison appliquée à l’envers : à l’ouest, on ajoute.",
                ),
              },
              {
                text: L("082", "082"),
                why: L(
                  "That is still the true heading.",
                  "C’est encore le cap vrai.",
                ),
              },
            ],
            answer: 0,
            explain: L("TH 082 + 3° W = MH 085.", "Cv 082 + 3° W = Cm 085."),
          },
          G.left,
          488,
          1680,
          496,
        ),
        foot(L("FAA PHAK ch. 16", "FAA PHAK ch. 16")),
      ],
      { layout: "quiz" },
    ),
    [
      {
        t: "text",
        text: L(
          "Magnetic = true + westerly variation, − easterly variation. TH 082, 3° W: MH 085.",
          "Magnétique = vrai + déclinaison ouest, − déclinaison est. Cv 082, 3° W : Cm 085.",
        ),
      },
    ],
    { minutes: 1 },
  );
}

/** A4 — the wind triangle, large, and three points in its colours. */
function windSlide(): Step {
  const pts: [string, string, string, string, "sel" | "path" | undefined][] = [
    [
      "Heading",
      "Cap",
      "Course ± the drift, into the wind: **021°** for 320/30 on 040.",
      "Route ± la dérive, face au vent : **021°** pour 320/30 sur 040.",
      "sel",
    ],
    [
      "Ground speed",
      "Vitesse sol",
      "TAS ± the wind along the track: **80 kt** here, not 90.",
      "Vp ± le vent dans l’axe : **80 kt** ici, pas 90.",
      "path",
    ],
    [
      "Time en route",
      "Temps de vol",
      "Distance ÷ GS × 60. At 60 kt, **1 NM a minute**.",
      "Distance ÷ Vs × 60. À 60 kt, **1 NM par minute**.",
      undefined,
    ],
  ];
  return slideStep(
    "mv-wind",
    L("Ground speed and time en route", "Vitesse sol et temps de vol"),
    canvas(
      [
        ...head(
          L("Wind triangle", "Triangle des vents"),
          L("The wind triangle", "Le triangle des vents"),
        ),
        DIAGRAM(
          "mv-wind.d",
          { kind: "calc", calc: { ...WIND, drag: ["wind", "tas"] } },
          L(
            "Wind triangle: course 040, 90 KTAS, wind 320 at 30 kt",
            "Triangle des vents : route 040, 90 kt de Vp, vent 320 pour 30 kt",
          ),
          G.left,
          288,
          960,
          696,
          {
            interactive: true,
            caption: L(
              "Drag the wind or the airspeed.",
              "Déplacez le vent ou la vitesse propre.",
            ),
          },
        ),
        ...pts.flatMap(([he, hf, be, bf, col], i) => {
          const y = 336 + i * 216;
          const g = `pt${i + 1}`;
          return [
            rule(1128, y, 672, { reveal: i + 1, group: g }),
            T("heading", L(he, hf), 1128, y + 24, 672, 56, {
              reveal: i + 1,
              group: g,
              ...(col ? { color: col } : {}),
            }),
            T("body", L(be, bf), 1128, y + 88, 672, 104, {
              reveal: i + 1,
              group: g,
            }),
          ];
        }),
        foot(L("FAA PHAK ch. 16", "FAA PHAK ch. 16"), 672, 1128),
      ],
      { layout: "heroDiagram" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "WCA = asin(W · sin θ ÷ TAS); ETE (min) = distance ÷ GS × 60",
          "Dérive = asin(V · sin θ ÷ Vp) ; temps (min) = distance ÷ Vs × 60",
        ),
        ruleOfThumb: L(
          "Max drift ≈ wind × 60 ÷ TAS (degrees). A 60 kt ground speed is 1 NM per minute.",
          "Dérive max ≈ vent × 60 ÷ Vp (degrés). 60 kt de vitesse sol, c’est 1 NM par minute.",
        ),
        refs: [{ src: "FAA-PHAK", ref: "ch. 16" }],
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

/** A9 with a grid — the crosswind clock code, then the question. */
function crosswindSlide(): Step {
  const cols: [string, string, string, string, string][] = [
    ["15°", "¼", "¼", "sin 15° ≈ 0.26", "sin 15° ≈ 0,26"],
    ["30°", "½", "½", "sin 30° = 0.50", "sin 30° = 0,50"],
    ["45°", "¾", "¾", "sin 45° ≈ 0.71", "sin 45° ≈ 0,71"],
    ["60° +", "all", "tout", "sin 60° ≈ 0.87", "sin 60° ≈ 0,87"],
  ];
  return slideStep(
    "mv-xwind",
    L("Crosswind: the clock code", "Vent de travers : la règle de l’horloge"),
    canvas(
      [
        ...head(
          L("Crosswind", "Vent de travers"),
          L("The clock code", "La règle de l’horloge"),
        ),
        lead(
          L(
            "Angle off the runway, read as minutes: that fraction of the wind is across.",
            "L’angle avec la piste, lu en minutes : cette fraction du vent est de travers.",
          ),
          1560,
        ),
        ...cols.flatMap(([a, n, nf, s, sf], i) => {
          const x = G.left + 432 * i;
          return [
            rule(x, 320, 384),
            T("heading", L(a, a), x, 328, 384, 48, { color: "muted" }),
            T("number", L(n, nf), x, 376, 384, 104),
            T("small", L(s, sf), x, 480, 384, 40),
          ];
        }),
        QUIZ(
          "mv-xwind.q",
          {
            kind: "mcq",
            prompt: L(
              "Runway 27, wind 300/20. Crosswind?",
              "Piste 27, vent 300/20. Vent de travers ?",
            ),
            options: [
              {
                text: L("10 kt", "10 kt"),
                why: L(
                  "30° off: half of 20 kt.",
                  "30° d’écart : la moitié de 20 kt.",
                ),
              },
              {
                text: L("17 kt", "17 kt"),
                why: L(
                  "That is the headwind, cos 30°: sine and cosine swapped.",
                  "C’est la composante de face, cos 30° : sinus et cosinus inversés.",
                ),
              },
              {
                text: L("20 kt", "20 kt"),
                why: L(
                  "Only a wind 60° or more off the runway is nearly all across.",
                  "Seul un vent à 60° ou plus de la piste est presque entièrement de travers.",
                ),
              },
            ],
            answer: 0,
            explain: L(
              "300 − 270 = 30°: half the wind, 10 kt across.",
              "300 − 270 = 30° : la moitié du vent, 10 kt de travers.",
            ),
          },
          G.left,
          528,
          1680,
          456,
        ),
        foot(
          L(
            "FAA AFH · C172S POH: maximum demonstrated crosswind 15 kt",
            "FAA AFH · manuel de vol C172S : vent de travers démontré 15 kt",
          ),
        ),
      ],
      { layout: "quiz" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "crosswind = W · sin θ; headwind = W · cos θ",
          "travers = V · sin θ ; face = V · cos θ",
        ),
        ruleOfThumb: L(
          "15° → ¼, 30° → ½, 45° → ¾, 60° and more → all of it. Compare with the POH maximum demonstrated crosswind (15 kt for a C172S).",
          "15° → ¼, 30° → ½, 45° → ¾, 60° et plus → tout. Comparez avec le vent de travers maximal démontré du manuel de vol (15 kt pour un C172S).",
        ),
        refs: [{ src: "FAA-AFH", ref: "crosswind approach and landing" }],
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

/** A8 with an instrument — density altitude on a hot day: the altimeter at 29.92 (the pressure altitude the student
 *  just read), the rule, the worked lines. */
function performanceSlide(): Step {
  return slideStep(
    "mv-perf",
    L("Density altitude on a hot day", "L’altitude-densité par forte chaleur"),
    canvas(
      [
        ...head(
          L("Performance", "Performances"),
          L(
            "Hot and high: the aeroplane feels higher",
            "Chaud et haut : l’avion se croit plus haut",
          ),
        ),
        lead(
          L(
            "Same day at Mistral Valley: pressure altitude 1,450 ft, 31 °C on the ramp.",
            "Le même jour à Mistral Valley : altitude-pression 1 450 ft, 31 °C au parking.",
          ),
          1560,
        ),
        INST(
          ALT,
          L(
            "Altimeter set to 29.92 at Mistral Valley: 1,450 ft, the pressure altitude",
            "Altimètre calé sur 29.92 à Mistral Valley : 1 450 ft, l’altitude-pression",
          ),
          G.left,
          336,
          624,
          624,
          { id: "mv-perf.alt", scene: "mv.field.std" },
        ),
        T("eyebrow", L("The rule", "La règle"), 840, 344, 960, 32, {
          color: "muted",
        }),
        T(
          "formula",
          L(
            "{DA} ≈ {PA} + 120 × ({OAT} − {ISA})",
            "{Zd} ≈ {Zp} + 120 × ({T} − {ISA})",
          ),
          840,
          392,
          960,
          80,
        ),
        T(
          "small",
          L(
            "ISA: 15 °C at sea level, 2 °C colder per 1,000 ft",
            "ISA : 15 °C au niveau de la mer, 2 °C de moins par 1 000 ft",
          ),
          840,
          488,
          960,
          40,
        ),
        rule(840, 552, 960),
        T(
          "formula",
          L(
            "ISA | = 15 − 2 × 1.45 ≈ 12\u00a0°C",
            "ISA | = 15 − 2 × 1,45 ≈ 12\u00a0°C",
          ),
          840,
          576,
          960,
          72,
          { reveal: 1 },
        ),
        T(
          "formula",
          L(
            "OAT − ISA | = 31 − 12 = 19\u00a0°C",
            "T − ISA | = 31 − 12 = 19\u00a0°C",
          ),
          840,
          656,
          960,
          72,
          { reveal: 2 },
        ),
        T(
          "formula",
          L(
            "DA | ≈ 1,450 + 120 × 19 = !3,730 ft!",
            "Zd | ≈ 1 450 + 120 × 19 = !3 730 ft!",
          ),
          840,
          736,
          960,
          72,
          { reveal: 3 },
        ),
        T(
          "body",
          L(
            "In the aircraft: on a 1,150 ft field the aeroplane performs as at 3,700 ft — a longer run, a weaker climb. The POH tables take **pressure altitude** and OAT.",
            "Dans l’avion : sur un terrain à 1 150 ft, l’avion se comporte comme à 3 700 ft — course plus longue, montée plus faible. Les tables se lisent avec la **Zp** et la température.",
          ),
          840,
          832,
          960,
          152,
          { reveal: 4 },
        ),
        foot(L("FAA PHAK ch. 8, 11", "FAA PHAK ch. 8, 11")),
      ],
      { scene: "mv.field.std", layout: "formula" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "PA = elevation + (29.92 − altimeter) × 1,000 ft; DA ≈ PA + 120 × (OAT − ISA)",
          "Zp = altitude du terrain + (1013 − QNH) × 27 ft ; Zd ≈ Zp + 120 × (T − ISA)",
        ),
        ruleOfThumb: L(
          "ISA is 15 °C at sea level, 2 °C colder per 1,000 ft. Pressure altitude 1,450 ft, 31 °C: ISA 12 °C, 19 °C above, DA ≈ 1,450 + 120 × 19 = 3,730 ft. In the aircraft: a longer take-off run and a weaker climb than the elevation suggests. Enter the POH tables with pressure altitude and OAT.",
          "ISA vaut 15 °C au niveau de la mer, 2 °C de moins par 1 000 ft. Altitude-pression 1 450 ft, 31 °C : ISA 12 °C, 19 °C de plus, Zd ≈ 1 450 + 120 × 19 = 3 730 ft. Dans l’avion : une course plus longue et une montée plus faible que l’altitude du terrain ne le laisse croire. Entrez dans les tables avec l’altitude-pression et la température.",
        ),
        refs: [{ src: "FAA-PHAK", ref: "ch. 11" }],
      },
    ],
    { kind: "explain", minutes: 3 },
  );
}

/** A3 grid — the take-off and landing distance factors, before the exercise that applies them. */
function distancesSlide(): Step {
  const rows: [string, string, string, string][] = [
    ["−10%", "−10 %", "per 9 kt of headwind (C172S POH)", "par 9 kt de vent de face (manuel C172S)"],
    ["+10%", "+10 %", "per 2 kt of tailwind, up to 10 kt", "par 2 kt de vent arrière, jusqu’à 10 kt"],
    ["×1.2", "×1,2", "dry grass, take-off (×1.15 to land)", "herbe sèche, décollage (×1,15 à l’atterrissage)"],
    ["×1.3", "×1,3", "wet grass, take-off (×1.35 to land)", "herbe mouillée, décollage (×1,35 à l’atterrissage)"],
    ["+5%", "+5 %", "per 1% of slope against you", "par 1 % de pente défavorable"],
    ["×1.33", "×1,33", "safety factor on take-off", "coefficient de sécurité au décollage"],
    ["×1.43", "×1,43", "safety factor on landing", "coefficient de sécurité à l’atterrissage"],
    ["×", "×", "multiply the factors, never add them", "on multiplie les facteurs, sans les additionner"],
  ];
  return slideStep(
    "mv-dist",
    L("Take-off and landing: the factors", "Décollage et atterrissage : les facteurs"),
    canvas(
      [
        ...head(
          L("Performance", "Performances"),
          L("Distances: the factors", "Distances : les facteurs"),
        ),
        lead(
          L(
            "The POH distance for the pressure altitude and OAT, then these factors.",
            "La distance du manuel pour la Zp et la température, puis ces facteurs.",
          ),
          1560,
        ),
        ...sheetBlocks(
          rows.map(([n, nf, c, cf]) => ({ n: L(n, nf), text: L(c, cf) })),
        ),
        foot(
          L(
            "C172S POH section 5 notes · UK CAA SafetySense 7 · training figures: use your aeroplane’s manual",
            "Manuel de vol C172S section 5 · CAA SafetySense 7 · chiffres d’exercice : utilisez le manuel de votre avion",
          ),
          1680,
        ),
      ],
      { layout: "bigNumber" },
    ),
    [
      {
        t: "keys",
        items: [
          L(
            "Start from the POH distance for today’s pressure altitude and temperature (to or from 50 ft).",
            "Partez de la distance du manuel pour la Zp et la température du jour (jusqu’à ou depuis 50 ft).",
          ),
          L(
            "Wind (C172S POH): −10% per 9 kt of headwind, +10% per 2 kt of tailwind up to 10 kt.",
            "Vent (manuel C172S) : −10 % par 9 kt de face, +10 % par 2 kt arrière jusqu’à 10 kt.",
          ),
          L(
            "Surface (CAA SafetySense 7): dry grass ×1.2 to take off, ×1.15 to land; wet grass ×1.3 and ×1.35. Slope: +5% per 1% against you.",
            "Surface (CAA SafetySense 7) : herbe sèche ×1,2 au décollage, ×1,15 à l’atterrissage ; herbe mouillée ×1,3 et ×1,35. Pente : +5 % par 1 % défavorable.",
          ),
          L(
            "Multiply the factors, then the safety factor: ×1.33 to take off, ×1.43 to land. Compare with the TODA / LDA.",
            "Multipliez les facteurs, puis le coefficient de sécurité : ×1,33 au décollage, ×1,43 à l’atterrissage. Comparez à la TODA / LDA.",
          ),
        ],
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

/** A9 — a quick check after the factors: multiply, never add, and do not forget the safety factor. */
function distancesCheck(): Step {
  return slideStep(
    "mv-dist-check",
    L("Check: does the runway fit?", "Vérification : la piste suffit-elle ?"),
    canvas(
      quizBlocks({
        id: "mv-dist-check",
        eyebrow: L("Check", "Vérification"),
        title: L("How much runway do you need?", "Quelle longueur de piste vous faut-il ?"),
        lead: L(
          "The POH gives 1,500 ft to clear 50 ft. Today: dry grass, no wind, level runway.",
          "Le manuel donne 1 500 ft pour passer les 50 ft. Aujourd’hui : herbe sèche, sans vent, piste à plat.",
        ),
        quiz: {
          kind: "mcq",
          prompt: L(
            "The take-off distance to compare with the runway, safety factor included?",
            "La distance de décollage à comparer à la piste, coefficient de sécurité compris ?",
          ),
          options: [
            {
              text: L("1,800 ft", "1 800 ft"),
              why: L(
                "1,500 × 1.2 is the grass alone. The safety factor × 1.33 is missing.",
                "1 500 × 1,2, c’est l’herbe seule. Il manque le coefficient de sécurité × 1,33.",
              ),
            },
            {
              text: L("2,300 ft", "2 300 ft"),
              why: L(
                "You added 20% and 33%. Factors multiply: 1.2 × 1.33 ≈ 1.6, not 1.53.",
                "Vous avez additionné 20 % et 33 %. Les facteurs se multiplient : 1,2 × 1,33 ≈ 1,6, pas 1,53.",
              ),
            },
            { text: L("2,400 ft", "2 400 ft") },
          ],
          answer: 2,
          explain: L(
            "1,500 × 1.2 × 1.33 ≈ 2,400 ft: 60% more than the POH figure. On a 2,000 ft strip, you stay on the ground.",
            "1 500 × 1,2 × 1,33 ≈ 2 400 ft : 60 % de plus que le chiffre du manuel. Sur 2 000 ft de piste, vous restez au sol.",
          ),
        },
        foot: L(
          "UK CAA SafetySense 7 · training figures: use your aeroplane’s manual",
          "CAA SafetySense 7 · chiffres d’exercice : utilisez le manuel de votre avion",
        ),
      }),
      { layout: "quiz" },
    ),
    [
      {
        t: "text",
        text: L(
          "Factors multiply: POH distance × surface × slope × wind, then × the safety factor. 1,500 ft on dry grass: 1,500 × 1.2 × 1.33 ≈ 2,400 ft.",
          "Les facteurs se multiplient : distance du manuel × surface × pente × vent, puis × le coefficient de sécurité. 1 500 ft sur herbe sèche : 1 500 × 1,2 × 1,33 ≈ 2 400 ft.",
        ),
      },
    ],
    { minutes: 1 },
  );
}

/** A3 grid — the conversions a French club flies with: litres, kilograms, hectopascals, kilometres. */
function unitsSlide(): Step {
  const rows: [string, string, string, string][] = [
    ["1.852", "1,852", "km/h per knot (km per NM)", "km/h par nœud (km par NM)"],
    ["0.305", "0,305", "metres per foot (1 m ≈ 3.28 ft)", "mètre par pied (1 m ≈ 3,28 ft)"],
    ["3.785", "3,785", "litres per US gallon", "litres par gallon US"],
    ["0.72", "0,72", "kg per litre of avgas (6 lb per US gal)", "kg par litre d’avgas (6 lb par gal US)"],
    ["2.2", "2,2", "lb per kg (kg ≈ half the lb, − 10%)", "lb par kg (kg ≈ la moitié des lb, − 10 %)"],
    ["1013", "1013", "hPa = 29.92 inHg, the standard setting", "hPa = 29,92 inHg, le calage standard"],
    ["33.9", "33,9", "hPa per inHg (0.01 in ≈ 0.34 hPa)", "hPa par inHg (0,01 in ≈ 0,34 hPa)"],
    ["1.8", "1,8", "°F = °C × 1.8 + 32", "°F = °C × 1,8 + 32"],
  ];
  return slideStep(
    "mv-units",
    L("Units: the conversions", "Unités : les conversions"),
    canvas(
      [
        ...head(
          L("Units", "Unités"),
          L("The conversions to know", "Les conversions à connaître"),
        ),
        lead(
          L(
            "POHs in lb and US gallons, clubs in kg and litres: convert in the head.",
            "Manuels en lb et gallons US, clubs en kg et litres : convertissez de tête.",
          ),
          1560,
        ),
        ...sheetBlocks(
          rows.map(([n, nf, c, cf]) => ({ n: L(n, nf), text: L(c, cf) })),
        ),
        foot(
          L(
            "ICAO Annex 5 units · avgas 100LL at 15 °C",
            "OACI annexe 5 (unités) · avgas 100LL à 15 °C",
          ),
        ),
      ],
      { layout: "bigNumber" },
    ),
    [
      {
        t: "keys",
        items: rows.map(([n, nf, c, cf]) => L(`${n}: ${c}`, `${nf} : ${cf}`)),
      },
      {
        t: "takeaway",
        text: L(
          "9 US gal/h ≈ 34 L/h; 40 US gal ≈ 151 L ≈ 109 kg of avgas.",
          "9 gal US/h ≈ 34 L/h ; 40 gal US ≈ 151 L ≈ 109 kg d’avgas.",
        ),
      },
    ],
    { minutes: 1 },
  );
}

/** A6 — weight and balance: the loading table and the CG fraction, beside the live envelope. */
function wbSlide(): Step {
  // C172S sample loading: the same sample figures as the W&B generator (calc/vfr/performance.ts WB), so the slide
  // and the exercise after it never disagree
  const empty = { w: WB.emptyLb, m: Math.round(WB.emptyLb * WB.emptyArm) };
  // about 2,350 lb: clear of the utility category (2,200 lb max), so the take-off point reads as normal only
  const front = { w: 340, m: 340 * WB.frontArm };
  const fuel = { w: 300, m: 300 * WB.fuelArm };
  const bag = { w: 50, m: 50 * WB.bag1Arm };
  const total = {
    w: empty.w + front.w + fuel.w + bag.w,
    m: empty.m + front.m + fuel.m + bag.m,
  };
  const cg = Math.round((total.m / total.w) * 10) / 10;
  const n = (v: number) => v.toLocaleString("en-US");
  const nf = (v: number) => v.toLocaleString("fr-FR").replace(/\s/g, " ");
  const d1 = (v: number) => v.toFixed(1);
  const d1f = (v: number) => v.toFixed(1).replace(".", ",");
  const rowsEn = [
    ["Item", "lb", "arm", "moment"],
    ["Empty", n(empty.w), d1(WB.emptyArm), n(empty.m)],
    ["Front seats", n(front.w), d1(WB.frontArm), n(front.m)],
    ["Fuel 50 gal", n(fuel.w), d1(WB.fuelArm), n(fuel.m)],
    ["Baggage", n(bag.w), d1(WB.bag1Arm), n(bag.m)],
    ["Total", n(total.w), "", n(total.m)],
  ];
  const rowsFr = [
    ["Poste", "lb", "bras", "moment"],
    ["À vide", nf(empty.w), d1f(WB.emptyArm), nf(empty.m)],
    ["Sièges AV", nf(front.w), d1f(WB.frontArm), nf(front.m)],
    ["Carb. 50 gal", nf(fuel.w), d1f(WB.fuelArm), nf(fuel.m)],
    ["Bagages", nf(bag.w), d1f(WB.bag1Arm), nf(bag.m)],
    ["Total", nf(total.w), "", nf(total.m)],
  ];
  // a table: cells separated by runs of 2+ spaces (text.ts formulaLines), padded so that a row with an empty
  // cell still lines its values up under the right header
  const table = (rows: string[][]) => {
    const w = rows[0].map((_, k) => Math.max(...rows.map((r) => r[k].length)));
    return rows
      .map((r) =>
        r
          .map((c, k) => c.padEnd(w[k] + 3))
          .join("")
          .trimEnd(),
      )
      .join("\n");
  };
  return slideStep(
    "mv-wb",
    L("Weight and balance", "Masse et centrage"),
    canvas(
      [
        ...head(
          L("Weight and balance", "Masse et centrage"),
          L(
            "Moments, then the CG on the envelope",
            "Les moments, puis le centrage dans l’enveloppe",
          ),
          960,
        ),
        T("formula", L(table(rowsEn), table(rowsFr)), G.left, 336, 816, 400),
        rule(G.left, 768, 816, { reveal: 1, group: "cg" }),
        T(
          "formula",
          L(
            `{CG} = [${n(total.m)}/${n(total.w)}] = !${cg} in!`,
            `{centrage} = [${nf(total.m)}/${nf(total.w)}] = !${String(cg).replace(".", ",")} in!`,
          ),
          G.left,
          800,
          816,
          120,
          { reveal: 1, group: "cg" },
        ),
        T(
          "small",
          L(
            "aft of the datum · avgas 6 lb per US gallon (0.72 kg per litre)",
            "en arrière de la référence · avgas 6 lb par gallon US (0,72 kg/L)",
          ),
          G.left,
          928,
          816,
          40,
          { reveal: 1, group: "cg" },
        ),
        DIAGRAM(
          "mv-wb.d",
          {
            kind: "calc",
            calc: {
              kind: "cgEnvelope",
              table: "c172s",
              points: [
                {
                  weightLb: empty.w,
                  momentLbIn: empty.m,
                  label: L("Empty", "À vide"),
                },
                {
                  weightLb: total.w,
                  momentLbIn: total.m,
                  label: L("Take-off", "Décollage"),
                },
              ],
              drag: ["points"],
            },
          },
          L(
            `C172S envelope with the take-off point at ${n(total.w)} lb, CG ${cg} in`,
            `Enveloppe C172S, point de décollage à ${nf(total.w)} lb, centrage ${String(cg).replace(".", ",")} in`,
          ),
          1032,
          288,
          768,
          696,
          { interactive: true },
        ),
        foot(
          L(
            "C172S POH section 6 · training figures: use your aeroplane’s own weighing report",
            "Manuel de vol C172S section 6 · chiffres d’exercice : utilisez la pesée de votre avion",
          ),
          1680,
        ),
      ],
      { layout: "compare" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "moment = weight × arm; CG = Σ moments ÷ Σ weights",
          "moment = masse × bras ; centrage = Σ moments ÷ Σ masses",
        ),
        ruleOfThumb: L(
          "Avgas: 6 lb per US gallon (0.72 kg per litre). 50 US gal = 300 lb ≈ 189 L ≈ 136 kg.",
          "Avgas : 6 lb par gallon US, soit 0,72 kg par litre. 50 gal US = 300 lb ≈ 189 L ≈ 136 kg.",
        ),
        refs: [{ src: "FAA-PHAK", ref: "ch. 10" }],
      },
    ],
    { kind: "explain", minutes: 3 },
  );
}

/** A10 — three numbers and three checks, before the practice. */
function recap(): Step {
  return slideStep(
    "mv-recap",
    L("Before every flight", "Avant chaque vol"),
    canvas(
      [
        ...head(
          L("Keep in mind", "À retenir"),
          L(
            "Three numbers before every flight",
            "Trois chiffres avant chaque vol",
          ),
        ),
        ...recapBlocks({
          id: "mv-recap",
          cols: [
            {
              n: L("½", "½"),
              text: L(
                "of the wind is across at 30° off the runway",
                "du vent est de travers à 30° de la piste",
              ),
            },
            {
              n: L("6 lb", "6 lb"),
              text: L("per US gallon of avgas", "par gallon US d’avgas"),
            },
            {
              n: L("+120", "+120"),
              text: L(
                "ft of density altitude per °C above ISA",
                "ft d’altitude-densité par °C au-dessus d’ISA",
              ),
            },
          ],
          checksTitle: L("Every time", "À chaque fois"),
          checks: [
            L(
              "Heading into the wind, then variation",
              "Cap face au vent, puis la déclinaison",
            ),
            L(
              "Fuel for the trip + 30 min by day",
              "Carburant du trajet + 30 min de jour",
            ),
            L(
              "Take-off point inside the envelope",
              "Point de décollage dans l’enveloppe",
            ),
          ],
        }),
        foot(
          L(
            "FAA PHAK ch. 11, 16 · 14 CFR 91.151 · C172S POH",
            "FAA PHAK ch. 11, 16 · 14 CFR 91.151 · manuel de vol C172S",
          ),
        ),
      ],
      { layout: "recap" },
    ),
    [
      {
        t: "keys",
        items: [
          L(
            "Crosswind: ½ of the wind at 30° off the runway.",
            "Travers : ½ du vent à 30° de la piste.",
          ),
          L("Avgas: 6 lb per US gallon.", "Avgas : 6 lb par gallon US."),
          L(
            "Density altitude: +120 ft per °C above ISA.",
            "Altitude-densité : +120 ft par °C au-dessus d’ISA.",
          ),
        ],
      },
    ],
    { minutes: 1 },
  );
}

// ================================================================== section openers
const PARTS = [
  L("Heading and wind", "Cap et vent"),
  L("Runway and performance", "Piste et performances"),
  L("Weight and units", "Masse et unités"),
  L("Review and fly", "Bilan et vol"),
];
function part(
  n: 1 | 2 | 3 | 4,
  title: [string, string],
  text: [string, string],
): Step {
  return slideStep(
    `mv-part${n}`,
    L(title[0], title[1]),
    canvas(
      sectionBlocks({
        n,
        of: 4,
        title: L(title[0], title[1]),
        lead: L(text[0], text[1]),
        items: PARTS,
      }),
      { layout: "section" },
    ),
    [],
    { minutes: 1 },
  );
}
const part1 = () =>
  part(
    1,
    ["The heading that holds the track", "Le cap qui tient la route"],
    [
      "From the true course to the compass heading, the wind triangle, then the drift stopped on the HSI. Then ground speed, time and fuel.",
      "De la route vraie au cap compas, le triangle des vents, puis la dérive arrêtée sur le HSI. Ensuite : vitesse sol, temps et carburant.",
    ],
  );
const part2 = () =>
  part(
    2,
    ["This runway, today?", "Cette piste, aujourd’hui ?"],
    [
      "Pressure altitude on the altimeter, density altitude, the distance factors and the crosswind. Then a crosswind final, flown.",
      "L’altitude-pression sur l’altimètre, l’altitude-densité, les facteurs de distance et le vent de travers. Puis une finale par vent de travers, volée.",
    ],
  );
const part3 = () =>
  part(
    3,
    ["Weight, balance and units", "Masse, centrage et unités"],
    [
      "The moments, the CG inside the envelope, and the conversions between the flight manual and the club.",
      "Les moments, le centrage dans l’enveloppe, et les conversions entre le manuel de vol et le club.",
    ],
  );
const part4 = () =>
  part(
    4,
    ["From memory, then in the air", "De mémoire, puis en vol"],
    [
      "Three numbers, three questions on the classic mistakes, ten problems. Then the heading you computed, flown.",
      "Trois chiffres, trois questions sur les erreurs classiques, dix problèmes. Puis le cap calculé, volé.",
    ],
  );

/** A9 × 3 — retrieval at the end: one question per classic mistake, every wrong answer with its own explanation. */
function retrieval(): Step[] {
  const q = (
    n: 1 | 2 | 3,
    title: [string, string],
    context: [string, string],
    quiz: Extract<Parameters<typeof QUIZ>[1], { kind: "mcq" }>,
    source: [string, string],
    reader: [string, string],
  ): Step =>
    slideStep(
      `mv-q${n}`,
      L(`From memory ${n}/3: ${title[0]}`, `De mémoire ${n}/3 : ${title[1]}`),
      canvas(
        quizBlocks({
          id: `mv-q${n}`,
          eyebrow: L(`From memory · ${n} of 3`, `De mémoire · ${n} sur 3`),
          title: L(title[0], title[1]),
          lead: L(context[0], context[1]),
          quiz,
          foot: L(source[0], source[1]),
        }),
        { layout: "quiz" },
      ),
      [{ t: "text", text: L(reader[0], reader[1]) }],
      { minutes: 1 },
    );
  return [
    q(
      1,
      ["Which magnetic heading?", "Quel cap magnétique ?"],
      [
        "True course 180. The wind is from your right: 7° of correction. Variation 2° E.",
        "Route vraie 180. Le vent vient de la droite : 7° de correction. Déclinaison 2° E.",
      ],
      {
        kind: "mcq",
        prompt: L("The magnetic heading?", "Le cap magnétique ?"),
        options: [
          {
            text: L("171", "171"),
            why: L(
              "You corrected away from the wind. The nose goes into the wind: 180 + 7 = 187, then − 2° E.",
              "Vous avez corrigé dos au vent. Le nez va vers le vent : 180 + 7 = 187, puis − 2° E.",
            ),
          },
          { text: L("185", "185") },
          {
            text: L("189", "189"),
            why: L(
              "East is least: subtract an easterly variation. 187 + 2 is the rule for the west.",
              "Déclinaison est : on retranche. 187 + 2, c’est la règle de l’ouest.",
            ),
          },
        ],
        answer: 1,
        explain: L(
          "True heading 180 + 7 = 187, into the wind. Variation 2° E, subtract: 185.",
          "Cap vrai 180 + 7 = 187, vers le vent. Déclinaison 2° E, on retranche : 185.",
        ),
      },
      ["FAA PHAK ch. 16", "FAA PHAK ch. 16"],
      [
        "The order and the signs: true course, wind correction into the wind (180 + 7 = 187), then variation, east is least (187 − 2 = 185).",
        "L’ordre et les signes : route vraie, correction vers le vent (180 + 7 = 187), puis la déclinaison, est on retranche (187 − 2 = 185).",
      ],
    ),
    q(
      2,
      ["How much fuel?", "Combien de carburant ?"],
      [
        "A 2-hour flight by day in a club aircraft that burns 34 litres an hour.",
        "Un vol de 2 heures, de jour, sur un avion de club qui consomme 34 litres à l’heure.",
      ],
      {
        kind: "mcq",
        prompt: L(
          "The minimum fuel at take-off, taxi apart?",
          "Le carburant minimum au décollage, roulage à part ?",
        ),
        options: [
          {
            text: L("68 L", "68 L"),
            why: L(
              "That is the trip alone: the engine stops as you arrive. Add the 30-minute reserve.",
              "C’est le trajet seul : le moteur s’arrête à l’arrivée. Ajoutez les 30 minutes de réserve.",
            ),
          },
          { text: L("85 L", "85 L") },
          {
            text: L("102 L", "102 L"),
            why: L(
              "That is a one-hour reserve: safe, and often wise, but the day VFR minimum is 30 minutes.",
              "C’est une heure de réserve : prudent, souvent sage, mais le minimum VFR de jour est 30 minutes.",
            ),
          },
        ],
        answer: 1,
        explain: L(
          "2 h + 30 min = 2.5 h × 34 = 85 L. Then add the taxi and your own margin.",
          "2 h + 30 min = 2,5 h × 34 = 85 L. Ajoutez ensuite le roulage et votre propre marge.",
        ),
      },
      [
        "14 CFR 91.151 · EASA Part-NCO: 30 min by day",
        "14 CFR 91.151 · EASA Part-NCO : 30 min de jour",
      ],
      [
        "Fuel = (flight time + reserve) × fuel flow: (2 h + 0.5 h) × 34 L/h = 85 L, plus the taxi.",
        "Carburant = (temps de vol + réserve) × consommation : (2 h + 0,5 h) × 34 L/h = 85 L, plus le roulage.",
      ],
    ),
    q(
      3,
      ["And on a hot day?", "Et par forte chaleur ?"],
      [
        "Same field, same weight, same altimeter setting. It is 35 °C instead of 15 °C.",
        "Même terrain, même masse, même calage. Il fait 35 °C au lieu de 15 °C.",
      ],
      {
        kind: "mcq",
        prompt: L("The take-off distance is…", "La distance de décollage est…"),
        options: [
          {
            text: L("the same", "la même"),
            why: L(
              "The altimeter does not see the temperature. Hot air is thinner: 20 °C more is about 2,400 ft of density altitude.",
              "L’altimètre ne voit pas la température. L’air chaud est moins dense : 20 °C de plus, c’est environ 2 400 ft d’altitude-densité.",
            ),
          },
          { text: L("longer", "plus longue") },
          {
            text: L("shorter", "plus courte"),
            why: L(
              "Hot air carries less and the engine gives less: the run gets longer, the climb weaker.",
              "L’air chaud porte moins et le moteur donne moins : la course s’allonge, la montée faiblit.",
            ),
          },
        ],
        answer: 1,
        explain: L(
          "Longer: +120 ft of density altitude per °C above ISA. Enter the tables with today’s temperature.",
          "Plus longue : +120 ft d’altitude-densité par °C au-dessus d’ISA. Entrez dans les tables avec la température du jour.",
        ),
      },
      ["FAA PHAK ch. 11", "FAA PHAK ch. 11"],
      [
        "Hot air is less dense: density altitude rises about 120 ft per °C above ISA, the take-off run gets longer and the climb weaker.",
        "L’air chaud est moins dense : l’altitude-densité monte d’environ 120 ft par °C au-dessus d’ISA, la course au décollage s’allonge et la montée faiblit.",
      ],
    ),
  ];
}

/** A3 grid — the page to keep. */
function cheatSheet(): Step {
  const rows: [string, string, string, string][] = [
    [
      "W +",
      "W +",
      "variation west: add (east: subtract)",
      "déclinaison ouest : on ajoute (est : on retranche)",
    ],
    [
      "60 kt",
      "60 kt",
      "of ground speed = 1 NM per minute",
      "de vitesse sol = 1 NM par minute",
    ],
    [
      "½",
      "½",
      "of the wind across at 30° (¼ at 15°, ¾ at 45°)",
      "du vent de travers à 30° (¼ à 15°, ¾ à 45°)",
    ],
    [
      "30 min",
      "30 min",
      "day VFR fuel reserve (45 min at night)",
      "réserve VFR de jour (45 min de nuit)",
    ],
    [
      "6 lb",
      "6 lb",
      "per US gallon of avgas (0.72 kg per litre)",
      "par gallon US d’avgas (0,72 kg par litre)",
    ],
    [
      "−2 °C",
      "−2 °C",
      "ISA per 1,000 ft, from 15 °C at sea level",
      "ISA par 1 000 ft, depuis 15 °C au niveau de la mer",
    ],
    [
      "+120",
      "+120",
      "ft of density altitude per °C above ISA",
      "ft d’altitude-densité par °C au-dessus d’ISA",
    ],
    [
      "3.8",
      "3,8",
      "litres per US gallon: 9 gal/h ≈ 34 L/h",
      "litres par gallon US : 9 gal/h ≈ 34 L/h",
    ],
  ];
  return slideStep(
    "mv-sheet",
    L("Keep this page", "Gardez cette page"),
    canvas(
      [
        ...head(
          L("Rules of thumb", "Règles pratiques"),
          L("Keep this page", "Gardez cette page"),
        ),
        ...sheetBlocks(
          rows.map(([a, af, c, cf]) => ({ n: L(a, af), text: L(c, cf) })),
        ),
        foot(
          L(
            "FAA PHAK ch. 8, 11, 16 · 14 CFR 91.151 · EASA Part-NCO",
            "FAA PHAK ch. 8, 11, 16 · 14 CFR 91.151 · EASA Part-NCO",
          ),
        ),
      ],
      { layout: "bigNumber" },
    ),
    [
      {
        t: "keys",
        items: rows.map(([a, af, c, cf]) => L(`${a}: ${c}`, `${af} : ${cf}`)),
      },
    ],
    { minutes: 1 },
  );
}

/** The Maths for VFR sample (37 steps), in four parts: each rule taught, tried, practised and flown. */
export function mathsVfrCourse(): Course {
  const TVMDC_CALC = step(
    "mv-tvmdc-calc",
    "calc",
    L("Your compass heading", "Votre cap compas"),
    [],
    { minutes: 3, calc: { generatorId: "vfr.tvmdc" } },
  );
  const TVMDC_TRY = step(
    "mv-tvmdc-try",
    "try",
    L("Try it: hold the track", "À vous : tenez la route"),
    [
      {
        t: "text",
        text: L(
          "Same course and wind as the previous step. Here the variation is 0 and the compass has no deviation, so fly the TRUE heading you found (step 2 of the solution: course + WCA) and watch the track: it should stay on the course.",
          "La même route et le même vent qu’à l’étape précédente. Ici la déclinaison est nulle et le compas sans déviation : volez le cap VRAI trouvé (étape 2 de la solution : route + dérive) et regardez la route : elle doit rester sur la route prévue.",
        ),
      },
    ],
    {
      minutes: 3,
      calcLink: { step: "mv-tvmdc-calc", use: "both" },
      notes: L(
        "Same numbers as the calculation they just solved. Ask for the true heading before they fly: course plus the wind correction angle. Then watch the track readout: it stays on the course within 3° only with the right heading. A drifting track means the wind correction went the wrong way (FAA PHAK ch. 16).",
        "Mêmes chiffres que le calcul qu’ils viennent de résoudre. Demandez le cap vrai avant de voler : la route plus la dérive. Puis regardez la route suivie : elle reste à 3° de la route prévue seulement avec le bon cap. Si elle dérive, la correction de vent est partie du mauvais côté (FAA PHAK ch. 16).",
      ),
    },
  );
  const GS_CALC = step(
    "mv-gs-calc",
    "calc",
    L("Ground speed and time en route", "Vitesse sol et temps de vol"),
    [],
    {
      minutes: 3,
      calc: { generatorId: "vfr.groundSpeedEte" },
    },
  );
  const FUEL_CALC = step(
    "mv-fuel-calc",
    "calc",
    L("Fuel, endurance and reserve", "Carburant, autonomie et réserve"),
    [
      {
        t: "formula",
        formula: L(
          "fuel = (flight time + reserve) × fuel flow",
          "carburant = (temps de vol + réserve) × consommation",
        ),
        ruleOfThumb: L(
          "The question that opened the course: 1 h 30 + 30 min by day = 2 h × 9 gal/h = 18 US gal, plus the taxi. Endurance is the reverse: usable fuel ÷ fuel flow.",
          "La question qui ouvrait le cours : 1 h 30 + 30 min de jour = 2 h × 9 gal/h = 18 gal US, plus le roulage. L’autonomie, c’est l’inverse : carburant utilisable ÷ consommation.",
        ),
        refs: [{ src: "14 CFR", ref: "91.151" }],
      },
    ],
    {
      minutes: 3,
      calc: { generatorId: "vfr.fuelEndurance" },
    },
  );
  const XWIND_CALC = step(
    "mv-xwind-calc",
    "calc",
    L(
      "Is the crosswind within limits?",
      "Le vent de travers est-il dans les limites ?",
    ),
    [],
    {
      minutes: 2,
      calc: { generatorId: "vfr.crosswind" },
    },
  );
  const XWIND_FLY = step(
    "mv-xwind-fly",
    "fly",
    L(
      "Fly it: a crosswind final at Mistral Valley",
      "À vous : une finale par vent de travers à Mistral Valley",
    ),
    [
      {
        t: "text",
        text: L(
          "Straight-in to MSVL runway 21, 5 NM out over MSV, level at 3,200 ft, wind 240/20. Work it out before you fly: 30° off the runway, so half the wind — 10 kt — is across, 17 kt down the runway. At 80 kt the crab is about 10 × 60 ÷ 80 ≈ 8°: heading about 218 to hold the 210 track.",
          "En longue finale directe sur la piste 21 de MSVL, à 5 NM à la verticale de MSV, en palier à 3 200 ft, vent 240/20. Calculez avant de voler : 30° avec la piste, donc la moitié du vent — 10 kt — de travers, 17 kt de face. À 80 kt, la correction vaut environ 10 × 60 ÷ 80 ≈ 8° : cap 218 environ pour tenir la route 210.",
        ),
      },
    ],
    {
      minutes: 4,
      flyIt: {
        target: { kind: "scene", scene: "mv.xwind", durationS: 120 },
        brief: L(
          "Wind 240/20 on runway 21: 10 kt from the right. You start on heading 214: turn right to your computed crab (about 218) at once, then hold the extended centreline track 210 and 3,200 ft for two minutes.",
          "Vent 240/20 pour la piste 21 : 10 kt de la droite. Vous partez au cap 214 : prenez tout de suite le cap calculé (218 environ), puis tenez la route 210 de l’axe prolongé et 3 200 ft pendant deux minutes.",
        ),
        keys: [
          L(
            "Watch the runway ahead, not the nose: if it slides left, crab more to the right.",
            "Regardez la piste devant, pas le capot : si elle glisse à gauche, corrigez davantage à droite.",
          ),
          L(
            "The exercise window shows your track: TRK 210 means you are on the centreline.",
            "La fenêtre de l’exercice affiche votre route : TRK 210, vous êtes sur l’axe.",
          ),
        ],
        options: ["turbulence"],
        defaultsOn: [],
        criteria: [
          {
            id: "c1",
            label: L("Hold the runway track 210 ±5°", "Tenez la route 210 ±5°"),
            check: GOAL.track(210, 5),
          },
          {
            id: "c2",
            label: L("Hold 3,200 ft ±200", "Tenez 3 200 ft ±200"),
            check: GOAL.alt(3000, 3400),
          },
        ],
        debrief: L(
          "What heading held the 210 track? About 218: the 8° the rule gave. Below the POH’s 15 kt demonstrated crosswind, but you still crab — then, in the flare, wing down into wind and rudder to align.",
          "Quel cap a tenu la route 210 ? Environ 218 : les 8° de la règle. Sous les 15 kt démontrés du manuel, mais il faut quand même corriger — puis, à l’arrondi, aile basse côté vent et palonnier pour s’aligner.",
        ),
        returnTo: "thisStep",
      },
    },
  );
  const DA_CALC = step(
    "mv-da-calc",
    "calc",
    L(
      "Pressure and density altitude",
      "Altitude-pression et altitude-densité",
    ),
    [],
    { minutes: 3, calc: { generatorId: "vfr.pressureDensityAltitude" } },
  );
  const PA_TRY = step(
    "mv-pa-try",
    "try",
    L(
      "Try it: set 29.92 and read the pressure altitude",
      "À vous : calez 29.92 (1013 hPa) et lisez l’altitude-pression",
    ),
    [
      {
        t: "text",
        text: L(
          "Another day at Mistral Valley (1,150 ft): a winter high, QNH 30.22 in (1023 hPa). Before you touch anything: will the pressure altitude be above or below 1,150 ft? Then turn the setting knob to 29.92 and read the altimeter.",
          "Un autre jour à Mistral Valley (1 150 ft) : un anticyclone d’hiver, QNH 30.22 inHg (1023 hPa). Avant de toucher : l’altitude-pression sera-t-elle au-dessus ou au-dessous de 1 150 ft ? Tournez ensuite le bouton de calage jusqu’à 29.92 et lisez l’altimètre.",
        ),
      },
      {
        t: "keys",
        items: [
          L(
            "The needle follows the window: 0.01 in is 10 ft, in the same direction.",
            "L’aiguille suit la fenêtre : 0,01 inHg vaut 10 ft, dans le même sens.",
          ),
        ],
      },
    ],
    {
      minutes: 2,
      stage: {
        panes: [{ kind: "six", crop: { region: "STEAM_LEFT:2" } }],
        mode: "live",
        scene: "mv.field.hi",
        controls: ["baro"],
      },
      quiz: {
        kind: "numeric",
        prompt: L(
          "With 29.92 set, what does the altimeter read?",
          "Calé sur 29.92, que lit l’altimètre ?",
        ),
        answer: 850,
        tol: 30,
        unit: "ft",
        explain: L(
          "850 ft: 0.30 in less, 300 ft less. High pressure: the pressure altitude is below the field, and the aeroplane performs better.",
          "850 ft : 0,30 inHg de moins, 300 ft de moins (10 hPa × 27 = 270 ft). Haute pression : l’altitude-pression est sous le terrain, l’avion est plus performant.",
        ),
      },
      hint: L(
        "Press − on the setting knob until the window shows 29.92, then read the two hands: hundreds on the long one.",
        "Appuyez sur − du bouton de calage jusqu’à lire 29.92 dans la fenêtre, puis lisez les deux aiguilles : les centaines sur la grande.",
      ),
    },
  );
  const TAKEOFF_CALC = step(
    "mv-takeoff-calc",
    "calc",
    L(
      "Takeoff and landing distance",
      "Distances de décollage et d’atterrissage",
    ),
    [],
    {
      minutes: 3,
      calc: { generatorId: "vfr.takeoffLandingFactors" },
    },
  );
  const WB_CALC = step(
    "mv-wb-calc",
    "calc",
    L("Inside the envelope?", "Dans l’enveloppe ?"),
    [],
    { minutes: 4, calc: { generatorId: "vfr.weightBalance" } },
  );
  const UNITS_CALC = step(
    "mv-units-calc",
    "calc",
    L("Unit conversions", "Conversions d’unités"),
    [],
    { minutes: 2, calc: { generatorId: "vfr.unitConversion" } },
  );
  const DRILL = step(
    "mv-drill",
    "drill",
    L("Drill: the navigation log", "Série : le log de navigation"),
    [],
    {
      minutes: 8,
      drill: {
        generatorIds: [
          "vfr.tvmdc",
          "vfr.groundSpeedEte",
          "vfr.fuelEndurance",
          "vfr.crosswind",
          "vfr.unitConversion",
          "vfr.pressureDensityAltitude",
        ],
        count: 10,
        timer: { mode: "stopwatch" },
        feedback: "each",
        practiceOnly: true,
      },
    },
  );
  const FINAL_FLY = step(
    "mv-fly",
    "fly",
    L("Fly it: the heading you computed", "À vous : le cap calculé"),
    [
      {
        t: "text",
        text: L(
          "The last flight is the leg of “Your compass heading”: the same course, the same wind, in the full cockpit. Set the true heading you found, then check the track: if it holds without a correction, your triangle was right.",
          "Le dernier vol reprend la branche de « Votre cap compas » : la même route, le même vent, dans le cockpit complet. Affichez le cap vrai trouvé, puis vérifiez la route : si elle tient sans retouche, votre triangle était juste.",
        ),
      },
    ],
    {
      minutes: 6,
      flyIt: {
        target: { kind: "calc", step: "mv-tvmdc-calc", durationS: 240 },
        brief: L(
          "The cockpit starts with the course and wind of “Your compass heading”, variation 0 and no deviation. Fly the true heading you found (course + WCA) and hold the track for four minutes.",
          "Le cockpit reprend la route et le vent de « Votre cap compas », déclinaison nulle et sans déviation. Volez le cap vrai trouvé (route + dérive) et tenez la route pendant quatre minutes.",
        ),
        keys: [
          L(
            "If the track drifts, correct a few degrees into the wind and wait.",
            "Si la route dérive, corrigez de quelques degrés face au vent et attendez.",
          ),
        ],
        options: ["wind", "turbulence"],
        defaultsOn: ["wind"],
        criteria: [],
        debrief: L(
          "Did the track hold without a correction? If you had to change the heading by more than 3°, redo the triangle: the sign of the drift (the nose goes into the wind) is the most common mistake.",
          "La route a-t-elle tenu sans retouche ? Si vous avez dû changer le cap de plus de 3°, refaites le triangle : le signe de la dérive (le nez va vers le vent) est l’erreur la plus fréquente.",
        ),
        returnTo: "thisStep",
      },
    },
  );
  const steps: Step[] = [
    cover(),
    goals(),
    why(),
    // part 1 — heading and wind: teach, try on the instrument, compute
    part1(),
    tvmdc(),
    variation(),
    windSlide(),
    headingSlide(),
    driftTry(),
    TVMDC_CALC,
    TVMDC_TRY,
    GS_CALC,
    FUEL_CALC,
    // part 2 — runway and performance
    part2(),
    pressureSlide(),
    PA_TRY,
    performanceSlide(),
    DA_CALC,
    distancesSlide(),
    distancesCheck(),
    TAKEOFF_CALC,
    crosswindSlide(),
    XWIND_CALC,
    XWIND_FLY,
    // part 3 — weight, balance and units
    part3(),
    wbSlide(),
    WB_CALC,
    unitsSlide(),
    UNITS_CALC,
    // part 4 — review, drill and fly
    part4(),
    recap(),
    ...retrieval(),
    DRILL,
    cheatSheet(),
    FINAL_FLY,
  ];
  return course(
    {
      id: MATHS_VFR_ID,
      title: L("Maths for VFR", "Les maths du VFR"),
      summary: L(
        "TVMDC, the wind triangle, fuel, the crosswind clock code, density altitude, take-off factors, weight and balance and the conversions — on designed slides first, then generated problems, a crosswind final flown, a drill, and the heading you computed, flown.",
        "Rv → Cc, le triangle des vents, le carburant, la règle de l’horloge, l’altitude-densité, les distances, le centrage et les conversions — d’abord en diapos, puis des problèmes générés, une finale par vent de travers volée, une série, et le cap calculé, volé.",
      ),
      cockpit: "steam",
      theme: "classroom",
      tags: ["maths", "vfr", "calculation", "navigation"],
    },
    steps,
    mathsVfrScenes(),
  );
}
