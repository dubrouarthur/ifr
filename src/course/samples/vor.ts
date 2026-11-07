// Ground school — built-in sample "VOR tracking, inbound and outbound" (12 steps, steam cockpit, ARD VOR-DME).
// Read the HSI, find your radial, intercept, correct for the wind, station passage, then fly it in the cockpit.
// Sources: FAA AIM 1-1-3 (VOR), FAA-H-8083-15 Instrument Flying Handbook ch. 9 (VOR navigation, tracking,
// bracketing), FAA-S-ACS-8 Instrument Rating ACS area V task A (tracking: ±100 ft, ¾-scale CDI).
import type {
  Course,
  InstrumentView,
  PaneView,
  SimScene,
  Step,
} from "../types";
import { STEAM_GAUGE_LAYOUT } from "../../avionics/steam";
import {
  CALLOUT,
  DIAGRAM,
  G,
  IMG,
  INST,
  L,
  M,
  MARK,
  QUIZ,
  SHAPE,
  T,
  canvas,
  course,
  onInstrument,
  scene,
  slideStep,
  step,
} from "./kit";

export const VOR_ID = "sample-vor";

const HSI: InstrumentView = { kind: "gauge", gauge: "hsi" };
const HSI_PANE: PaneView = { kind: "six", crop: { region: "STEAM_LEFT:4" } };

export function vorScenes(): Record<string, SimScene> {
  return {
    "vor.intercept": scene(
      "vor.intercept",
      {
        pos: { fix: "ARD", radial: 276, distNm: 6 },
        altFt: 4000,
        hdg: 120,
        iasKt: 100,
        radios: { nav1: "ARD", obs1: 90, cdi: "NAV1", brg1: "NAV1" },
      },
      { label: "ARD R-276 · 6 NM · 4,000 ft", wind: [250, 10] },
    ),
    "vor.find": scene(
      "vor.find",
      {
        pos: { fix: "ARD", radial: 240, distNm: 12 },
        altFt: 4000,
        hdg: 60,
        iasKt: 100,
        radios: { nav1: "ARD", obs1: 0, cdi: "NAV1" },
      },
      { label: "ARD R-240 · 12 NM · 4,000 ft", wind: [250, 10] },
    ),
    "vor.track": scene(
      "vor.track",
      {
        pos: { fix: "ARD", radial: 270, distNm: 9 },
        altFt: 4000,
        hdg: 90,
        iasKt: 100,
        radios: { nav1: "ARD", obs1: 90, cdi: "NAV1" },
      },
      { label: "ARD R-270 · 9 NM · wind 360/20", wind: [360, 20] },
    ),
    "vor.before": scene(
      "vor.before",
      {
        pos: { fix: "ARD", radial: 270, distNm: 1.5 },
        altFt: 4000,
        hdg: 90,
        iasKt: 100,
        radios: { nav1: "ARD", obs1: 90, cdi: "NAV1" },
      },
      { label: "ARD R-270 · 1.5 NM inbound" },
    ),
    "vor.after": scene(
      "vor.after",
      {
        pos: { fix: "ARD", radial: 90, distNm: 1.5 },
        altFt: 4000,
        hdg: 90,
        iasKt: 100,
        radios: { nav1: "ARD", obs1: 90, cdi: "NAV1" },
      },
      { label: "ARD R-090 · 1.5 NM outbound" },
    ),
    "vor.out": scene(
      "vor.out",
      {
        pos: { fix: "ARD", radial: 90, distNm: 3 },
        altFt: 4000,
        hdg: 90,
        iasKt: 100,
        radios: { nav1: "ARD", obs1: 270, cdi: "NAV1" },
      },
      { label: "ARD R-090 · 3 NM · OBS 270" },
    ),
    "vor.fly": scene(
      "vor.fly",
      {
        pos: { fix: "ARD", radial: 270, distNm: 6 },
        altFt: 4000,
        hdg: 90,
        iasKt: 100,
        radios: { nav1: "ARD", obs1: 90, cdi: "NAV1", brg1: "NAV1" },
      },
      { label: "ARD R-270 · 6 NM inbound · 4,000 ft", wind: [360, 15] },
    ),
  };
}

/** A point on the HSI drawn at (x, y, s, s) on the slide, from the gauge centre in radii. */
function hsiPoint(
  x: number,
  y: number,
  s: number,
  dx: number,
  dy: number,
): [number, number] {
  const g = STEAM_GAUGE_LAYOUT.hsi;
  return onInstrument(HSI, x, y, s, s, [g.cx + dx * g.r, g.cy + dy * g.r]);
}

function cover(): Step {
  return slideStep(
    "v-cover",
    L(
      "VOR tracking, inbound and outbound",
      "Suivi VOR, en rapprochement et en éloignement",
    ),
    canvas([
      T(
        "label",
        L("Ground school · Radio navigation", "Théorie · Radionavigation"),
        M.x,
        168,
        912,
        48,
      ),
      SHAPE("rect", M.x, 240, 96, 8, { fill: "accent", stroke: null }),
      T(
        "display",
        L(
          "VOR tracking, inbound and outbound",
          "Suivi VOR, en rapprochement et en éloignement",
        ),
        M.x,
        264,
        912,
        408,
        { valign: "bottom" },
      ),
      T(
        "subtitle",
        L(
          "Read the HSI, intercept, hold the track in a crosswind — then fly it at ARD",
          "Lire le HSI, intercepter, tenir la route par vent de travers — puis le voler à ARD",
        ),
        M.x,
        696,
        864,
        144,
      ),
      T(
        "caption",
        L(
          "12 steps · about 35 min · FAA AIM 1-1-3 · FAA IFH ch. 9",
          "12 étapes · environ 35 min · FAA AIM 1-1-3 · FAA IFH ch. 9",
        ),
        M.x,
        912,
        864,
        48,
      ),
      INST(
        HSI,
        L(
          "HSI tuned to ARD, course 090, heading 120",
          "HSI calé sur ARD, route 090, cap 120",
        ),
        1080,
        132,
        816,
        816,
        {
          scene: "vor.intercept",
        },
      ),
    ]),
  );
}

function whatIsARadial(): Step {
  return slideStep(
    "v-radials",
    L("Radials leave the station", "Les radiales partent de la station"),
    canvas([
      T(
        "label",
        L("VOR · FAA AIM 1-1-3", "VOR · FAA AIM 1-1-3"),
        M.x,
        96,
        960,
        48,
      ),
      T(
        "title",
        L("Radials leave the station", "Les radials partent de la station"),
        M.x,
        144,
        1728,
        108,
      ),
      IMG(
        { lib: "diagram:vor-to-from" },
        L(
          "A VOR station with radials, an aircraft on each side showing TO and FROM",
          "Une station VOR, ses radials, et un avion de chaque côté avec TO et FROM",
        ),
        M.x,
        288,
        864,
        672,
        { fit: "contain", radius: 8 },
      ),
      T(
        "body",
        L(
          "A VOR sends **360 radials**, each one a magnetic course **from** the station. R-090 leaves ARD towards the east; R-270 leaves it towards the west.",
          "Un VOR émet **360 radials**, chacun une route magnétique **depuis** la station. Le R-090 part d’ARD vers l’est ; le R-270 vers l’ouest.",
        ),
        1056,
        288,
        768,
        216,
      ),
      MARK(1, 1080, 576, { size: 56, reveal: 1 }),
      T(
        "body",
        L(
          "The **OBS** selects a course. The **CDI** shows where that course is: left or right of you.",
          "L’**OBS** sélectionne une route. Le **CDI** montre où est cette route : à gauche ou à droite de vous.",
        ),
        1128,
        552,
        696,
        144,
        { reveal: 1 },
      ),
      MARK(2, 1080, 744, { size: 56, reveal: 2 }),
      T(
        "body",
        L(
          "**TO / FROM** says whether that course takes you to the station or away from it.",
          "**TO / FROM** indique si cette route vous mène vers la station ou vous en éloigne.",
        ),
        1128,
        720,
        696,
        144,
        { reveal: 2 },
      ),
      CALLOUT(
        undefined,
        L(
          "The indication does not depend on the heading. Fly a heading close to the course set in the OBS and the needle points to the course.",
          "L’indication ne dépend pas du cap. Volez un cap proche de la route affichée à l’OBS et l’aiguille montre la route.",
        ),
        1056,
        888,
        768,
        120,
        { tone: "accent", reveal: 3 },
      ),
    ]),
    [
      {
        t: "heading",
        text: L(
          "Radials leave the station",
          "Les radials partent de la station",
        ),
      },
      {
        t: "text",
        text: L(
          "A VOR sends 360 radials, each a magnetic course from the station. The OBS selects a course, the CDI shows where it is, and TO / FROM says whether it leads to the station or away from it (FAA AIM 1-1-3).",
          "Un VOR émet 360 radials, chacun une route magnétique depuis la station. L’OBS sélectionne une route, le CDI montre où elle est, TO / FROM indique si elle mène vers la station ou s’en éloigne (FAA AIM 1-1-3).",
        ),
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

function readingHsi(): Step {
  const [x, y, s] = [96, 120, 840];
  const rows: [
    string,
    string,
    string,
    string,
    "obs1" | "cdiDots" | "toFrom",
  ][] = [
    [
      "Course pointer",
      "Aiguille de route",
      "Set with the OBS: {{value}}",
      "Affichée à l’OBS : {{value}}",
      "obs1",
    ],
    [
      "CDI bar",
      "Barre de déviation",
      "Where the course is — fly towards it: {{value}}",
      "Où est la route — allez vers elle : {{value}}",
      "cdiDots",
    ],
    [
      "TO / FROM",
      "TO / FROM",
      "Does the selected course lead to the station or away from it: {{value}}",
      "La route affichée mène-t-elle vers la station ou s’en éloigne-t-elle : {{value}}",
      "toFrom",
    ],
  ];
  const marks = [
    hsiPoint(x, y, s, -0.36, -0.64),
    hsiPoint(x, y, s, 0.22, -0.02),
    hsiPoint(x, y, s, -0.1, -0.34),
  ];
  return slideStep(
    "v-hsi",
    L("Reading the HSI", "Lire le HSI"),
    canvas(
      [
        INST(
          HSI,
          L(
            "HSI: course 090, heading 120, bar right, TO",
            "HSI : route 090, cap 120, barre à droite, TO",
          ),
          x,
          y,
          s,
          s,
          {
            id: "v-hsi.hsi",
            scene: "vor.intercept",
            group: "hsi",
            readOrder: 9,
            controls: ["obs1"],
            yourTurn: {
              where: "slide",
              prompt: L(
                "Your turn: turn the OBS until the bar centres with a TO flag",
                "À vous : tournez l’OBS jusqu’à centrer la barre avec un drapeau TO",
              ),
              controls: ["obs1"],
              assist: { holdAlt: true, holdIas: true },
              goal: {
                all: [G.toFrom("TO"), G.cdi(0.5)],
                holdS: 2,
                graded: false,
                success: L(
                  "Centred: the course to ARD is about 096, so you are on R-276.",
                  "Centrée : la route vers ARD est d’environ 096, vous êtes donc sur le R-276.",
                ),
              },
              hint: L(
                "Turn the OBS towards the bar: a few degrees right of 090.",
                "Tournez l’OBS vers la barre : quelques degrés à droite de 090.",
              ),
            },
          },
        ),
        ...marks.map((p, i) =>
          MARK(i + 1, p[0], p[1], { size: 60, reveal: i + 1, group: "hsi" }),
        ),
        T(
          "label",
          L("Navigation · FAA IFH ch. 9", "Navigation · FAA IFH ch. 9"),
          1032,
          120,
          792,
          48,
        ),
        T("title", L("Reading the HSI", "Lire le HSI"), 1032, 168, 792, 108),
        T(
          "caption",
          L(
            "6 NM west of ARD, heading 120, OBS 090. The values are read live from the instrument.",
            "À 6 NM à l’ouest d’ARD, cap 120, OBS 090. Les valeurs sont lues en direct sur l’instrument.",
          ),
          1032,
          288,
          792,
          96,
        ),
        ...rows.flatMap(([he, hf, be, bf, ro], i) => {
          const yy = 432 + i * 168;
          return [
            MARK(i + 1, 1064, yy + 32, {
              size: 56,
              reveal: i + 1,
              group: `r${i}`,
            }),
            T("heading", L(he, hf), 1120, yy, 704, 60, {
              reveal: i + 1,
              group: `r${i}`,
            }),
            T("body", L(be, bf), 1120, yy + 60, 704, 84, {
              reveal: i + 1,
              group: `r${i}`,
              bind: { k: "readout", readout: ro, scene: "vor.intercept" },
            }),
          ];
        }),
        CALLOUT(
          undefined,
          L(
            "Bar right, course right: here you are closing on it at 30°.",
            "Barre à droite, route à droite : ici vous la rejoignez à 30°.",
          ),
          1032,
          936,
          792,
          96,
          { tone: "accent", reveal: 4 },
        ),
      ],
      { scene: "vor.intercept" },
    ),
    [
      { t: "heading", text: L("Reading the HSI", "Lire le HSI") },
      {
        t: "text",
        text: L(
          "1. The course pointer shows the course set with the OBS. 2. The CDI bar shows where that course is: fly towards it. 3. The TO / FROM triangle shows whether flying the selected course would take you to the station or away from it (FAA AIM 1-1-3).",
          "1. L’aiguille de route montre la route affichée à l’OBS. 2. La barre de déviation montre où est cette route : allez vers elle. 3. Le triangle TO / FROM indique si la route affichée vous mène vers la station ou vous en éloigne (FAA AIM 1-1-3).",
        ),
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

function findRadial(): Step {
  return step(
    "v-find",
    "try",
    L("Find the radial you are on", "Trouvez le radial sur lequel vous êtes"),
    [
      {
        t: "text",
        text: L(
          "You are somewhere south-west of ARD, heading 060. Turn the **OBS** until the [[CDI bar|f1]] centres with a **TO** flag.",
          "Vous êtes quelque part au sud-ouest d’ARD, cap 060. Tournez l’**OBS** jusqu’à centrer la [[barre de déviation|f1]] avec un drapeau **TO**.",
        ),
      },
      {
        t: "doThis",
        rows: [
          {
            text: L("A **TO** flag", "Un drapeau **TO**"),
            check: 0,
            readout: "toFrom",
          },
          {
            text: L(
              "The bar centred (within ½ dot)",
              "La barre centrée (à ½ point près)",
            ),
            check: 1,
            readout: "cdiDots",
          },
        ],
      },
      {
        t: "reveal",
        when: "goalMet",
        blocks: [
          {
            t: "text",
            text: L(
              "The course under the pointer, **060**, is the course **to** ARD. Your radial is its reciprocal: **R-240**.",
              "La route sous l’aiguille, **060**, est la route **vers** ARD. Votre radial est son inverse : le **R-240**.",
            ),
          },
        ],
      },
      {
        t: "takeaway",
        text: L(
          "Centred with TO: the radial you are on is the reciprocal of the course shown.",
          "Centrée avec TO : votre radial est l’inverse de la route affichée.",
        ),
      },
    ],
    {
      minutes: 2,
      stage: {
        panes: [HSI_PANE],
        mode: "live",
        scene: "vor.find",
        inset: "plan",
        controls: ["obs1"],
        assist: { holdAlt: true, holdIas: true },
        annotations: [
          {
            id: "f1",
            pane: 0,
            type: "callout",
            n: 1,
            at: [512, 578],
            text: L(
              "**CDI bar**: centre it with the OBS.",
              "**Barre de déviation** : centrez-la avec l’OBS.",
            ),
          },
        ],
      },
      goal: {
        all: [G.toFrom("TO"), G.cdi(0.5)],
        holdS: 2,
        graded: false,
        success: L("On R-240, 060 to ARD.", "Sur le R-240, 060 vers ARD."),
      },
      hint: L(
        "If the flag says FROM, turn the OBS about 180°. Then turn it slowly towards the bar.",
        "Si le drapeau indique FROM, tournez l’OBS d’environ 180°. Puis tournez-le doucement vers la barre.",
      ),
    },
  );
}

function whichWay(): Step {
  return slideStep(
    "v-which-way",
    L("Which way to turn?", "De quel côté virer ?"),
    canvas(
      [
        T("label", L("Predict", "Prédire"), M.x, 96, 960, 48),
        T(
          "title",
          L("Which way to turn?", "De quel côté virer ?"),
          M.x,
          144,
          1728,
          108,
        ),
        INST(
          HSI,
          L(
            "HSI: course 090, heading 120, bar right of centre",
            "HSI : route 090, cap 120, barre à droite",
          ),
          M.x,
          288,
          696,
          696,
          {
            scene: "vor.intercept",
          },
        ),
        T(
          "body",
          L(
            "Cleared to **track the 090 course inbound** to ARD. You are heading 120 and the bar sits right of centre.",
            "Autorisé à **suivre la route 090 en rapprochement** vers ARD. Vous êtes au cap 120, la barre est à droite du centre.",
          ),
          888,
          288,
          936,
          144,
        ),
        QUIZ(
          "v-which-way.q",
          {
            kind: "mcq",
            prompt: L("What do you do now?", "Que faites-vous maintenant ?"),
            options: [
              {
                text: L(
                  "Keep heading 120: you are closing at 30°",
                  "Garder le cap 120 : vous convergez à 30°",
                ),
                why: L(
                  "Right. The course is to your right and 120 converges on it at 30°. Start the roll-out about one dot before centre.",
                  "Juste. La route est à votre droite et le cap 120 la rejoint à 30°. Commencez la sortie de virage environ un point avant le centre.",
                ),
              },
              {
                text: L(
                  "Turn left to 090 now",
                  "Virer à gauche au 090 maintenant",
                ),
                why: L(
                  "On 090 you would fly parallel to the course, still left of it: the bar would stay where it is.",
                  "Au 090 vous voleriez parallèlement à la route, toujours à sa gauche : la barre resterait où elle est.",
                ),
              },
              {
                text: L("Turn right to 180", "Virer à droite au 180"),
                why: L(
                  "A 90° intercept this close to the course overshoots it. 30° is enough at 6 NM.",
                  "Une interception à 90° si près de la route la dépasse. 30° suffisent à 6 NM.",
                ),
              },
            ],
            answer: 0,
            explain: L(
              "Bar right, course right; heading 120 already closes on it at 30°.",
              "Barre à droite, route à droite ; le cap 120 la rejoint déjà à 30°.",
            ),
          },
          888,
          432,
          936,
          576,
        ),
      ],
      { scene: "vor.intercept" },
    ),
    [
      {
        t: "text",
        text: L(
          "Cleared to track the 090 course inbound, heading 120, bar right: keep 120, you are closing at 30°.",
          "Autorisé sur la route 090 en rapprochement, cap 120, barre à droite : gardez 120, vous convergez à 30°.",
        ),
      },
    ],
    { kind: "quiz", minutes: 1 },
  );
}

function intercept(): Step {
  return step(
    "v-intercept",
    "try",
    L("Intercept the 090 course to ARD", "Interceptez la route 090 vers ARD"),
    [
      {
        t: "text",
        text: L(
          "6 NM west of ARD, heading 120. The clearance: *“intercept the ARD 270 radial, track inbound.”*",
          "À 6 NM à l’ouest d’ARD, cap 120. La clairance : *« interceptez le radial 270 d’ARD, en rapprochement. »*",
        ),
      },
      {
        t: "text",
        text: L(
          "Keep 120 while the [[CDI bar|i1]] comes in. At one dot, roll to 090 with the bank pad and keep the bar centred.",
          "Gardez 120 pendant que la [[barre de déviation|i1]] revient. À un point, virez au 090 avec les boutons d’inclinaison L / R et gardez la barre centrée.",
        ),
      },
      {
        t: "doThis",
        rows: [
          {
            text: L(
              "OBS 090 with a **TO** flag",
              "OBS 090 avec drapeau **TO**",
            ),
            check: 0,
            readout: "obs1",
          },
          {
            text: L("Roll out on 090 (±10°)", "Sortez au 090 (±10°)"),
            check: 1,
            readout: "hdg",
          },
          {
            text: L("Bar within 1 dot", "Barre à moins d’un point"),
            check: 2,
            readout: "cdiDots",
          },
        ],
      },
      {
        t: "keys",
        items: [
          L(
            "Lead the turn: with 30° to take out at about 100 kt, start rolling when the bar passes one dot.",
            "Anticipez : avec 30° à reprendre vers 100 kt, commencez à virer quand la barre passe un point.",
          ),
        ],
      },
    ],
    {
      minutes: 3,
      stage: {
        panes: [HSI_PANE],
        inset: "plan",
        mode: "live",
        scene: "vor.intercept",
        controls: ["obs1", "hdgBug", "bank"],
        assist: { holdAlt: true, holdIas: true },
        annotations: [
          {
            id: "i1",
            pane: 0,
            type: "callout",
            n: 1,
            at: [512, 578],
            text: L(
              "**CDI bar**: right of centre, the course is to your right.",
              "**Barre de déviation** : à droite du centre, la route est à votre droite.",
            ),
          },
        ],
      },
      goal: {
        all: [G.obs(90), G.heading(90, 10), G.cdi(1)],
        holdS: 10,
        graded: false,
        success: L(
          "Established inbound on R-270.",
          "Établi en rapprochement sur le R-270.",
        ),
      },
      hint: L(
        "Hold the R side of the bank pad to turn right, the L side to turn left. Release to roll wings level.",
        "Maintenez le bouton d’inclinaison R pour virer à droite, L pour virer à gauche. Relâchez pour remettre les ailes à plat.",
      ),
    },
  );
}

function wind(): Step {
  return slideStep(
    "v-wind",
    L(
      "Wind: find the heading that holds the track",
      "Vent : trouver le cap qui tient la route",
    ),
    canvas([
      T(
        "label",
        L("Tracking · FAA IFH ch. 9", "Suivi · FAA IFH ch. 9"),
        M.x,
        96,
        960,
        48,
      ),
      T(
        "title",
        L("Heading is not track", "Le cap n’est pas la route"),
        M.x,
        144,
        1728,
        108,
      ),
      DIAGRAM(
        "v-wind.tri",
        {
          kind: "calc",
          calc: {
            kind: "windTriangle",
            course: 90,
            tasKt: 100,
            windDir: 360,
            windKt: 20,
            drag: ["wind"],
          },
        },
        L(
          "Wind triangle: course 090, 100 kt true airspeed, wind 360 at 20 kt",
          "Triangle des vents : route 090, vitesse propre 100 kt, vent 360 pour 20 kt",
        ),
        M.x,
        288,
        960,
        696,
        {
          interactive: true,
          caption: L(
            "Drag the wind: the heading and ground speed follow.",
            "Déplacez le vent : le cap et la vitesse sol suivent.",
          ),
        },
      ),
      T(
        "body",
        L(
          "Wind from the left pushes you right of the course: the bar drifts **left**. Turn towards the bar and find the heading that keeps it still.",
          "Un vent de gauche vous pousse à droite de la route : la barre dérive vers la **gauche**. Tournez vers la barre et trouvez le cap qui la garde immobile.",
        ),
        1152,
        288,
        672,
        216,
      ),
      MARK(1, 1176, 576, { size: 56, reveal: 1, group: "b1" }),
      T(
        "body",
        L(
          "**Turn 20°** towards the bar when it moves.",
          "**Virez de 20°** vers la barre quand elle bouge.",
        ),
        1224,
        552,
        600,
        96,
        { reveal: 1, group: "b1" },
      ),
      MARK(2, 1176, 696, { size: 56, reveal: 2, group: "b2" }),
      T(
        "body",
        L(
          "**Back on course, keep half** (10°) into the wind.",
          "**Revenu sur la route, gardez la moitié** (10°) face au vent.",
        ),
        1224,
        672,
        600,
        96,
        { reveal: 2, group: "b2" },
      ),
      MARK(3, 1176, 816, { size: 56, reveal: 3, group: "b3" }),
      T(
        "body",
        L(
          "**Halve again** until the bar stays still: that is bracketing.",
          "**Divisez encore par deux** jusqu’à ce que la barre reste immobile : c’est l’encadrement.",
        ),
        1224,
        792,
        600,
        96,
        { reveal: 3, group: "b3" },
      ),
      T(
        "caption",
        L(
          "20 kt across at 100 kt: about 11° of correction (sin⁻¹ 20/100).",
          "20 kt de travers à 100 kt : environ 11° de correction (sin⁻¹ 20/100).",
        ),
        1152,
        912,
        672,
        72,
      ),
    ]),
    [
      {
        t: "text",
        text: L(
          "Bracketing (FAA IFH ch. 9): turn 20° towards the needle when it moves, keep half the correction once back on course, and halve again until the needle stays still.",
          "L’encadrement (FAA IFH ch. 9) : virez de 20° vers l’aiguille quand elle bouge, gardez la moitié de la correction une fois revenu sur la route, et divisez encore par deux jusqu’à ce qu’elle reste immobile.",
        ),
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

function radialCalc(): Step {
  return step(
    "v-calc",
    "calc",
    L("Which radial, TO or FROM?", "Quel radial, TO ou FROM ?"),
    [
      {
        t: "formula",
        formula: L(
          "radial = course to the station ± 180°",
          "radial = route vers la station ± 180°",
        ),
        ruleOfThumb: L(
          "Centred with TO: you are on the reciprocal. Centred with FROM: you are on the course shown.",
          "Centrée avec TO : vous êtes sur l’inverse. Centrée avec FROM : vous êtes sur la route affichée.",
        ),
        refs: [
          { src: "FAA-AIM", ref: "1-1-3" },
          { src: "FAA-IFH", ref: "ch. 9" },
        ],
      },
    ],
    { minutes: 3, calc: { generatorId: "ifr.vorRadial" } },
  );
}

function trackWind(): Step {
  return step(
    "v-track",
    "try",
    L(
      "Track inbound in a crosswind",
      "Suivre en rapprochement par vent de travers",
    ),
    [
      {
        t: "text",
        text: L(
          "On R-270, 9 NM west of ARD, heading 090. The wind is **360 at 20 kt**: from your left. Watch the bar, then bracket.",
          "Sur le R-270, à 9 NM à l’ouest d’ARD, cap 090. Le vent est du **360 pour 20 kt** : de votre gauche. Observez la barre, puis encadrez.",
        ),
      },
      {
        t: "doThis",
        rows: [
          {
            text: L("Keep the **TO** flag", "Gardez le drapeau **TO**"),
            check: 0,
            readout: "toFrom",
          },
          {
            text: L("Bar within 1 dot", "Barre à moins d’un point"),
            check: 1,
            readout: "cdiDots",
          },
        ],
      },
      {
        t: "keys",
        items: [
          L(
            "Expect a heading near 080: about 11° into a 20 kt crosswind at 100 kt.",
            "Attendez-vous à un cap vers 080 : environ 11° face à 20 kt de travers à 100 kt.",
          ),
        ],
      },
      {
        t: "takeaway",
        text: L(
          "Find the heading that keeps the needle still, not the heading that centres it once.",
          "Cherchez le cap qui garde l’aiguille immobile, pas celui qui la centre une fois.",
        ),
      },
    ],
    {
      minutes: 4,
      stage: {
        panes: [HSI_PANE],
        inset: "plan",
        mode: "live",
        scene: "vor.track",
        controls: ["hdgBug", "bank"],
        assist: { holdAlt: true, holdIas: true, timeScale: 2 },
      },
      goal: {
        all: [G.toFrom("TO"), G.cdi(1)],
        holdS: 30,
        graded: false,
        success: L(
          "Tracking: the correction holds.",
          "Suivi tenu : la correction est bonne.",
        ),
      },
      hint: L(
        "Turn left about 20°. When the bar comes back to centre, turn right by half (heading about 080).",
        "Virez à gauche d’environ 20°. Quand la barre revient au centre, revenez de la moitié vers la droite (cap vers 080).",
      ),
    },
  );
}

function stationPassage(): Step {
  return slideStep(
    "v-passage",
    L("Station passage", "Passage de la verticale"),
    canvas(
      [
        T(
          "label",
          L(
            "Over the station · FAA AIM 1-1-3",
            "À la verticale · FAA AIM 1-1-3",
          ),
          M.x,
          96,
          960,
          48,
        ),
        T(
          "title",
          L(
            "Over the station, the flag flips",
            "À la verticale, le drapeau bascule",
          ),
          M.x,
          144,
          1728,
          108,
        ),
        INST(
          HSI,
          L(
            "HSI 1.5 NM before ARD: TO flag",
            "HSI à 1,5 NM avant ARD : drapeau TO",
          ),
          M.x,
          288,
          528,
          528,
          {
            scene: "vor.before",
          },
        ),
        T("heading", L("Before: TO", "Avant : TO"), M.x, 840, 528, 60, {
          align: "center",
        }),
        INST(
          HSI,
          L(
            "HSI 1.5 NM after ARD: FROM flag",
            "HSI à 1,5 NM après ARD : drapeau FROM",
          ),
          672,
          288,
          528,
          528,
          {
            scene: "vor.after",
            reveal: { order: 1 },
          },
        ),
        T("heading", L("After: FROM", "Après : FROM"), 672, 840, 528, 60, {
          align: "center",
          reveal: 1,
        }),
        T(
          "body",
          L(
            "Inbound on R-270 and outbound on R-090 are the **same course, 090**. Nothing to twist: the flag flips from TO to FROM and the bar stays on the same side.",
            "En rapprochement sur le R-270 puis en éloignement sur le R-090, c’est la **même route, 090**. Rien à tourner : le drapeau passe de TO à FROM et la barre reste du même côté.",
          ),
          96,
          912,
          1104,
          120,
          { reveal: 1 },
        ),
        QUIZ(
          "v-passage.q",
          {
            kind: "mcq",
            prompt: L(
              "Now cleared **R-120 outbound**. Set the OBS to…",
              "Autorisé **R-120 en éloignement**. Affichez à l’OBS…",
            ),
            options: [
              {
                text: L("120, FROM", "120, FROM"),
                why: L(
                  "Right: outbound on a radial, set the radial.",
                  "Juste : en éloignement sur un radial, affichez le radial.",
                ),
              },
              {
                text: L("300, TO", "300, TO"),
                why: L(
                  "300 TO takes you to the station on R-120: the wrong way.",
                  "300 TO vous ramène vers la station par le R-120 : le mauvais sens.",
                ),
              },
              {
                text: L("030", "030"),
                why: L(
                  "030 is the radial 90° away, not the one you were cleared on.",
                  "030 est un radial à 90°, pas celui de la clairance.",
                ),
              },
            ],
            answer: 0,
            explain: L(
              "Outbound on R-120: OBS 120, FROM.",
              "En éloignement sur le R-120 : OBS 120, FROM.",
            ),
          },
          1296,
          288,
          528,
          720,
        ),
      ],
      { scene: "vor.before" },
    ),
    [
      {
        t: "text",
        text: L(
          "Over the station the needle swings and the flag flips from TO to FROM. Inbound on R-270 and outbound on R-090 are the same course, 090.",
          "À la verticale l’aiguille oscille et le drapeau passe de TO à FROM. Le R-270 en rapprochement et le R-090 en éloignement sont la même route, 090.",
        ),
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

function setOutbound(): Step {
  return step(
    "v-outbound",
    "quiz",
    L("Answer on the instrument", "Répondez sur l’instrument"),
    [
      {
        t: "text",
        text: L(
          "You have just passed ARD heading east. Set NAV 1 so that you can track **R-090 outbound**, then tap Check.",
          "Vous venez de passer ARD cap à l’est. Réglez NAV 1 pour suivre le **R-090 en éloignement**, puis touchez Vérifier.",
        ),
      },
    ],
    {
      minutes: 1,
      quiz: {
        kind: "fly",
        prompt: L(
          "Set NAV 1 to track R-090 outbound.",
          "Réglez NAV 1 pour suivre le R-090 en éloignement.",
        ),
        answer: [G.obs(90), G.toFrom("FROM")],
        explain: L(
          "Outbound on R-090: OBS 090 with a FROM flag. 270 would show TO, the course back to the station.",
          "En éloignement sur le R-090 : OBS 090 avec drapeau FROM. 270 afficherait TO, la route de retour vers la station.",
        ),
      },
      stage: {
        panes: [HSI_PANE],
        mode: "frozen",
        scene: "vor.out",
        controls: ["obs1"],
      },
    },
  );
}

function flyIt(): Step {
  return step(
    "v-fly",
    "fly",
    L(
      "Fly it: R-270 inbound, R-090 outbound",
      "À vous : R-270 en rapprochement, R-090 en éloignement",
    ),
    [],
    {
      minutes: 8,
      flyIt: {
        target: { kind: "scene", scene: "vor.fly", durationS: 420 },
        brief: L(
          "Track R-270 inbound to ARD at 4,000 ft, cross the station, then track R-090 outbound for three minutes. The wind is from the north.",
          "Suivez le R-270 vers ARD à 4 000 ft, passez la verticale, puis suivez le R-090 en éloignement pendant trois minutes. Le vent vient du nord.",
        ),
        keys: [
          L(
            "Bracket: 20°, then half, then half again.",
            "Encadrez : 20°, puis la moitié, puis encore la moitié.",
          ),
          L(
            "Over the station hold your heading; the course stays 090.",
            "À la verticale gardez votre cap ; la route reste 090.",
          ),
        ],
        options: ["wind", "turbulence", "partialPanel", "surpriseMe"],
        defaultsOn: ["wind"],
        surprisePool: ["vacuum"],
        criteria: [
          {
            id: "alt",
            label: L("Altitude within ±100 ft", "Altitude à ±100 ft"),
            check: G.alt(3900, 4100),
            acs: "IR.V.A",
            trace: "alt",
          },
          {
            id: "lat",
            label: L("CDI within ¾ scale", "CDI dans les ¾ d’échelle"),
            check: G.acsLat(),
            acs: "IR.V.A",
            trace: "cdiDots",
          },
          {
            id: "ard",
            label: L("Station passage at ARD", "Passage de la verticale d’ARD"),
            check: G.passed("ARD"),
          },
        ],
        debrief: L(
          "Look at the trace after the station: most drift happens in the first minute outbound, before the new correction is found.",
          "Regardez la trace après la station : l’essentiel de la dérive vient de la première minute en éloignement, avant de retrouver la correction.",
        ),
        returnTo: "thisStep",
      },
    },
  );
}

/** The VOR sample (12 steps). */
export function vorCourse(): Course {
  return course(
    {
      id: VOR_ID,
      title: L(
        "VOR tracking, inbound and outbound",
        "Suivi VOR, en rapprochement et en éloignement",
      ),
      summary: L(
        "Read the HSI, find your radial, intercept and bracket the wind on the real instrument, then fly it at ARD.",
        "Lire le HSI, trouver son radial, intercepter et encadrer le vent sur l’instrument réel, puis le voler à ARD.",
      ),
      cockpit: "steam",
      theme: "cockpit",
      tags: ["ifr", "vor", "navigation", "tracking"],
      minutes: 35,
    },
    [
      cover(),
      whatIsARadial(),
      readingHsi(),
      findRadial(),
      whichWay(),
      intercept(),
      wind(),
      radialCalc(),
      trackWind(),
      stationPassage(),
      setOutbound(),
      flyIt(),
    ],
    vorScenes(),
  );
}
