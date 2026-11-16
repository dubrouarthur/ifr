// Ground school — built-in sample "VOR tracking, inbound and outbound" (14 steps, steam cockpit, ARD VOR-DME).
// One idea, then the student does it: the standard and what the course teaches, radials (a question), reading the
// HSI (turn the OBS), find your radial (try, with the top view), the wind shown on a live HSI, bracket it (try,
// with the top view), station passage (fly through it), which way to turn (a question), intercept (try, with the
// top view), set the OBS outbound (answer on the instrument), the three classic mistakes, the takeaways, then
// three briefing questions and the flight at ARD.
// Sources: FAA AIM 1-1-3 (VOR), FAA-H-8083-15 Instrument Flying Handbook ch. 9 (VOR navigation, tracking,
// bracketing, common errors), EASA Part-FCL Appendix 7 (IR skill test: tracking on radio aids ±5°, height ±100 ft,
// heading ±5°, speed ±5 kt), FAA-S-ACS-8 Instrument Rating ACS area V task A (¾-scale CDI, ±100 ft, heading ±5°,
// ±10 kt).
// The HSI of the steam panel has 2 dots a side: one dot is 5°, half scale. The winds of the scenes are the same at
// every level (the sim otherwise veers and strengthens the surface wind aloft), so the wind a slide states is the
// wind the student flies.
import type {
  Course,
  GoalCheck,
  InstrumentView,
  PaneView,
  SimScene,
  SlideBlock,
  Step,
} from "../types";
import { STEAM_GAUGE_LAYOUT } from "../../avionics/steam";
import {
  ARROW,
  G,
  IMG,
  INST,
  L,
  MARK,
  QUIZ,
  SHAPE,
  T,
  course,
  onInstrument,
  scene,
  slideStep,
  step,
} from "./kit";
import { mistakesStep } from "./briefings/kit";
import {
  G as GR,
  bigNumberBlocks,
  calloutRows,
  coverBlocks,
  foot,
  head,
  pointRows,
  recapBlocks,
  slide,
} from "./navSlides";

export const VOR_ID = "sample-vor";

const HSI: InstrumentView = { kind: "gauge", gauge: "hsi" };
const HSI_PANE: PaneView = { kind: "six", crop: { region: "STEAM_LEFT:4" } };
/** Half-scale deflection: 5° on a VOR, one dot of the HSI (the EASA skill-test tracking tolerance). */
const HALF_SCALE: GoalCheck = { id: "acsScale", p: { axis: "lat", frac: 0.5 } };

/** "Centred": within a quarter of full scale, half a dot of this HSI (2.5° on a VOR). */
const CENTRED: GoalCheck = { id: "acsScale", p: { axis: "lat", frac: 0.25 } };

/** The same wind at every level: what the slide says is what the aircraft meets at 4,000 ft. */
const steady = (dir: number, kt: number) => ({
  wind: [dir, kt] as [number, number],
  weather: { aloft: [3000, 6000, 9000].map((altFt) => ({ altFt, dir, kt })) },
});

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
      { label: "ARD R-276 · 6 NM · 4,000 ft", ...steady(250, 10) },
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
      // the label does not name the radial: finding it is the exercise
      { label: "South-west of ARD · 4,000 ft", ...steady(250, 10) },
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
      { label: "ARD R-270 · 9 NM · wind 360/20", ...steady(360, 20) },
    ),
    // one dot off the course: what the limit of the standard looks like
    "vor.dot": scene(
      "vor.dot",
      {
        pos: { fix: "ARD", radial: 275, distNm: 9 },
        altFt: 4000,
        hdg: 90,
        iasKt: 100,
        radios: { nav1: "ARD", obs1: 90, cdi: "NAV1" },
      },
      { label: "ARD · 9 NM · one dot off course 090" },
    ),
    // close in, no correction, flown live: the bar visibly leaves to the left
    "vor.drift": scene(
      "vor.drift",
      {
        pos: { fix: "ARD", radial: 270, distNm: 4 },
        altFt: 4000,
        hdg: 90,
        iasKt: 100,
        radios: { nav1: "ARD", obs1: 90, cdi: "NAV1" },
      },
      { label: "ARD R-270 · 4 NM · heading 090 · wind 360/20", ...steady(360, 20) },
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
      {
        label: "ARD R-270 · 6 NM inbound · 4,000 ft · wind 360/15",
        ...steady(360, 15),
      },
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

// ------------------------------------------------------------------ the designed slides
function cover(): Step {
  return slideStep(
    "v-cover",
    L(
      "VOR tracking, inbound and outbound",
      "Suivi VOR, en rapprochement et en éloignement",
    ),
    slide(
      "cover",
      coverBlocks({
        eyebrow: L(
          "Ground school · Radio navigation",
          "Théorie · Radionavigation",
        ),
        main: L("VOR tracking", "Suivi VOR"),
        sub: L("Inbound and outbound", "En rapprochement et en éloignement"),
        lead: L(
          "“Intercept the ARD 270 radial, track inbound.” In cloud, one instrument does it all: learn to read it, then fly it.",
          "« Interceptez le radial 270 d’ARD, en rapprochement. » En nuage, un seul instrument suffit : apprenez à le lire, puis volez-le.",
        ),
        meta: L(
          "14 steps · about 35 min · you fly the HSI in 7 of them",
          "14 étapes · environ 35 min · vous pilotez le HSI dans 7 d’entre elles",
        ),
        hero: [
          INST(
            HSI,
            L(
              "HSI tuned to ARD, course 090, heading 120",
              "HSI calé sur ARD, route 090, cap 120",
            ),
            1032,
            180,
            720,
            720,
            // flown live: the bar comes in as the aircraft closes on the course
            { id: "v-cover.hsi", scene: "vor.intercept", mode: "live" },
          ),
        ],
      }),
      { scene: "vor.intercept" },
    ),
    [
      {
        t: "heading",
        text: L(
          "VOR tracking, inbound and outbound",
          "Suivi VOR, en rapprochement et en éloignement",
        ),
      },
      {
        t: "text",
        text: L(
          "Read the HSI, find your radial, intercept and bracket the wind on the real instrument, then fly it at ARD.",
          "Lire le HSI, trouver son radial, intercepter et encadrer le vent sur l’instrument réel, puis le voler à ARD.",
        ),
      },
    ],
    { minutes: 1 },
  );
}

function why(): Step {
  const title = L(
    "One dot: the skill-test standard",
    "Un point : la norme de l’examen",
  );
  return slideStep(
    "v-why",
    title,
    slide(
      "bigNumber",
      [
        ...head(L("Why it matters", "Pourquoi c’est important"), title),
        ...bigNumberBlocks({
          n: L("±5°", "±5°"),
          nW: 440,
          statement: L(
            "on the radial, at most: one dot of this HSI",
            "sur le radial, au plus : un point de ce HSI",
          ),
          body: L(
            "After this course you can read your radial, intercept a course, hold it within one dot in a 20 kt crosswind and cross the station.",
            "À la fin du cours, vous savez lire votre radial, intercepter une route, la tenir à un point près par 20 kt de travers et passer la station.",
          ),
        }),
        INST(
          HSI,
          L(
            "HSI inbound to ARD on course 090, the bar one dot right: the limit of the standard",
            "HSI vers ARD sur la route 090, la barre un point à droite : la limite de la norme",
          ),
          1272,
          312,
          528,
          528,
          { id: "v-why.hsi", scene: "vor.dot" },
        ),
        T(
          "small",
          L(
            "One dot off: the limit of the standard",
            "Un point d’écart : la limite de la norme",
          ),
          1272,
          864,
          528,
          48,
          { align: "center" },
        ),
        foot(
          L(
            "EASA Part-FCL Appendix 7: ±5°, ±100 ft, heading ±5°, ±5 kt · FAA ACS: ¾ scale",
            "EASA Part-FCL appendice 7 : ±5°, ±100 ft, cap ±5°, ±5 kt · FAA ACS : ¾ d’échelle",
          ),
        ),
      ],
      { scene: "vor.dot" },
    ),
    [
      {
        t: "text",
        text: L(
          "On the EASA instrument-rating skill test you track a radio aid within ±5° (half-scale deflection: one dot of this HSI), holding height within ±100 ft, heading within ±5° and speed within ±5 kt (Part-FCL Appendix 7). The FAA checkride allows ¾-scale deflection, ±100 ft, heading ±5° and ±10 kt (FAA-S-ACS-8, area V, task A).",
          "À l’examen pratique IR de l’EASA, vous suivez un moyen radio à ±5° (la demi-échelle : un point de ce HSI), en tenant la hauteur à ±100 ft, le cap à ±5° et la vitesse à ±5 kt (Part-FCL, appendice 7). Le test FAA admet ¾ d’échelle, ±100 ft, le cap à ±5° et ±10 kt (FAA-S-ACS-8, domaine V, tâche A).",
        ),
      },
      {
        t: "keys",
        items: [
          L(
            "Read your radial from the HSI: centred with TO, the reciprocal.",
            "Lire votre radial au HSI : centrée avec TO, l’inverse.",
          ),
          L(
            "Intercept a course at 30° and roll out on it.",
            "Intercepter une route à 30° et sortir dessus.",
          ),
          L(
            "Hold it within one dot (±5°) in a 20 kt crosswind.",
            "La tenir à un point près (±5°) par 20 kt de travers.",
          ),
          L(
            "Cross the station without chasing the needle.",
            "Passer la station sans courir après l’aiguille.",
          ),
        ],
      },
    ],
    { minutes: 1 },
  );
}

/** The radials of ARD drawn from slide blocks: station, compass circle, four labelled radials, an aircraft east. */
function radialsDiagram(): SlideBlock[] {
  const cx = 544;
  const cy = 640;
  const r = 256;
  const at = (b: number, d: number): [number, number] => {
    const a = (b * Math.PI) / 180;
    return [Math.round(cx + Math.sin(a) * d), Math.round(cy - Math.cos(a) * d)];
  };
  const minor = [45, 135, 225, 315].map((b) =>
    ARROW(at(b, 40), at(b, r), {
      color: "ruleStrong",
      strokeW: 2,
      heads: "none",
      group: "rad",
    }),
  );
  const major = [0, 90, 180, 270].map((b) =>
    ARROW(at(b, 44), at(b, r + 24), {
      color: "nav",
      strokeW: 4,
      group: "rad",
    }),
  );
  const lab = (
    t: string,
    x: number,
    y: number,
    align: "left" | "center" | "right",
  ) =>
    T("heading", L(t, t), x, y, 160, 56, { color: "nav", align, group: "rad" });
  return [
    SHAPE("ellipse", cx - r, cy - r, 2 * r, 2 * r, {
      fill: null,
      stroke: "ruleStrong",
      strokeW: 2,
      group: "rad",
    }),
    ...minor,
    ...major,
    lab("R-360", cx - 80, cy - r - 96, "center"),
    lab("R-090", cx + r + 32, cy - 72, "left"),
    lab("R-180", cx - 80, cy + r + 32, "center"),
    lab("R-270", cx - r - 192, cy - 72, "right"),
    IMG(
      { lib: "icon:vordme" },
      L("ARD VOR-DME", "VOR-DME ARD"),
      cx - 36,
      cy - 36,
      72,
      72,
      {
        fit: "contain",
        group: "rad",
      },
    ),
    T("body", L("ARD", "ARD"), cx - 168, cy - 104, 120, 48, {
      align: "right",
      group: "rad",
    }),
    // on a radial the drawing does not label (135): the student reads it off the rose
    IMG(
      { lib: "icon:aircraft-top" },
      L(
        "An aircraft south-east of ARD, heading to the station",
        "Un avion au sud-est d’ARD, cap vers la station",
      ),
      at(135, 176)[0] - 40,
      at(135, 176)[1] - 40,
      80,
      80,
      { fit: "contain", rot: 315, group: "rad" },
    ),
  ];
}

function whatIsARadial(): Step {
  return slideStep(
    "v-radials",
    L("Radials leave the station", "Les radials partent de la station"),
    slide("quiz", [
      ...head(
        L("The VOR", "Le VOR"),
        L("Radials leave the station", "Les radials partent de la station"),
      ),
      ...radialsDiagram(),
      T(
        "body",
        L(
          "A VOR sends **360 radials**. Each one is a magnetic course **from** the station.",
          "Un VOR émet **360 radials**. Chacun est une route magnétique **depuis** la station.",
        ),
        1128,
        312,
        672,
        152,
      ),
      QUIZ(
        "v-radials.q",
        {
          kind: "mcq",
          prompt: L(
            "The aircraft flies to ARD from the south-east. Its radial is…",
            "L’avion rejoint ARD par le sud-est. Son radial est le…",
          ),
          options: [
            {
              text: L("135", "135"),
              why: L(
                "Right: R-135 leaves ARD towards the south-east.",
                "Juste : le R-135 part d’ARD vers le sud-est.",
              ),
            },
            {
              text: L("315", "315"),
              why: L(
                "315 is the course it flies to ARD, not its radial.",
                "315 est la route qu’il vole vers ARD, pas son radial.",
              ),
            },
            {
              text: L("045", "045"),
              why: L(
                "R-045 leaves ARD towards the north-east.",
                "Le R-045 part d’ARD vers le nord-est.",
              ),
            },
          ],
          answer: 0,
          explain: L(
            "R-135: the radial names where you are from the station, whatever your heading.",
            "R-135 : le radial dit où vous êtes par rapport à la station, quel que soit votre cap.",
          ),
        },
        1128,
        504,
        672,
        480,
      ),
      foot(L("FAA AIM 1-1-3 · FAA IFH ch. 9", "FAA AIM 1-1-3 · FAA IFH ch. 9")),
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
          "A VOR sends 360 radials, each a magnetic course from the station: R-090 leaves ARD towards the east, R-135 towards the south-east. An aircraft south-east of ARD is on R-135 whatever its heading; the course it flies to the station is the reciprocal, 315. The OBS selects a course, the deviation bar shows where it is, and TO / FROM says whether it leads to the station or away from it (FAA AIM 1-1-3).",
          "Un VOR émet 360 radials, chacun une route magnétique depuis la station : le R-090 part d’ARD vers l’est, le R-135 vers le sud-est. Un avion au sud-est d’ARD est sur le R-135 quel que soit son cap ; la route qu’il vole vers la station est l’inverse, 315. L’OBS sélectionne une route, la barre de déviation montre où elle est, TO / FROM indique si elle mène vers la station ou s’en éloigne (FAA AIM 1-1-3).",
        ),
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

function readingHsi(): Step {
  const [x, y, s] = [GR.left, 120, 840];
  // in clear dial space beside the pointer, the bar and the flag: a marker never sits on a needle (SPEC §6)
  const marks = [
    hsiPoint(x, y, s, -0.5, -0.45),
    hsiPoint(x, y, s, 0.62, 0.2),
    hsiPoint(x, y, s, -0.05, -0.44),
  ];
  return slideStep(
    "v-hsi",
    L("Reading the HSI", "Lire le HSI"),
    slide(
      "instrumentNotes",
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
                all: [G.toFrom("TO"), CENTRED],
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
          MARK(i + 1, p[0], p[1], { size: 56, reveal: i + 1, group: "hsi" }),
        ),
        T("eyebrow", L("Navigation", "Navigation"), 1128, 120, 672, 32),
        T("title", L("Reading the HSI", "Lire le HSI"), 1128, 160, 672, 88),
        T(
          "body",
          L(
            "6 NM west of ARD, heading 120, OBS 090. ARD is identified by its Morse code.",
            "À 6 NM à l’ouest d’ARD, cap 120, OBS 090. ARD est identifié par son code morse.",
          ),
          1128,
          264,
          672,
          104,
        ),
        ...calloutRows([
          {
            heading: L("Course pointer", "Aiguille de route"),
            body: L(
              "Set with the OBS: {{value}}",
              "Affichée à l’OBS : {{value}}",
            ),
            readout: "obs1",
            scene: "vor.intercept",
          },
          {
            heading: L("Deviation bar", "Barre de déviation"),
            body: L(
              "The course: fly to it. One dot is 5°.",
              "La route : allez vers elle. Un point vaut 5°.",
            ),
          },
          {
            heading: L("TO / FROM", "TO / FROM"),
            body: L(
              "Does it lead to the station? {{value}}",
              "Mène-t-elle à la station ? {{value}}",
            ),
            readout: "toFrom",
            scene: "vor.intercept",
          },
        ]),
        foot(
          L(
            "● Live values · FAA IFH ch. 9",
            "● Valeurs lues en direct · FAA IFH ch. 9",
          ),
          672,
          1128,
          "nav",
        ),
      ],
      { scene: "vor.intercept" },
    ),
    [
      { t: "heading", text: L("Reading the HSI", "Lire le HSI") },
      {
        t: "text",
        text: L(
          "Before you use the needle: tune 114.20, identify ARD by its Morse code and check that no warning flag shows. 1. The course pointer shows the course set with the OBS. 2. The deviation bar shows where that course is: fly towards it. Bar right, course right: here heading 120 closes on it at 30°. On this HSI one dot is 5°, two dots full scale (10°). 3. The TO / FROM triangle shows whether flying the selected course would take you to the station or away from it (FAA AIM 1-1-3).",
          "Avant d’utiliser l’aiguille : affichez 114,20, identifiez ARD par son code morse et vérifiez qu’aucun drapeau d’alarme n’est visible. 1. L’aiguille de route montre la route affichée à l’OBS. 2. La barre de déviation montre où est cette route : allez vers elle. Barre à droite, route à droite : ici le cap 120 la rejoint à 30°. Sur ce HSI, un point vaut 5°, deux points la pleine échelle (10°). 3. Le triangle TO / FROM indique si la route affichée vous mène vers la station ou vous en éloigne (FAA AIM 1-1-3).",
        ),
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

function whichWay(): Step {
  return slideStep(
    "v-which-way",
    L("Which way to turn?", "De quel côté virer ?"),
    slide(
      "quiz",
      [
        ...head(
          L("Intercepting", "Interception"),
          L("Which way to turn?", "De quel côté virer ?"),
        ),
        INST(
          HSI,
          L(
            "HSI: course 090, heading 120, bar right of centre",
            "HSI : route 090, cap 120, barre à droite",
          ),
          GR.left,
          312,
          672,
          672,
          { scene: "vor.intercept" },
        ),
        T(
          "quote",
          L(
            "“Intercept the ARD 270 radial, track inbound.”",
            "« Interceptez le radial 270 d’ARD, en rapprochement. »",
          ),
          GR.x(5),
          312,
          960,
          144,
        ),
        T(
          "small",
          L(
            "OBS 090 · heading 120 · the bar right of centre",
            "OBS 090 · cap 120 · la barre à droite du centre",
          ),
          GR.x(5),
          464,
          960,
          40,
        ),
        QUIZ(
          "v-which-way.q",
          {
            kind: "mcq",
            prompt: L("What do you do now?", "Que faites-vous maintenant ?"),
            options: [
              {
                text: L("Keep heading 120", "Garder le cap 120"),
                why: L(
                  "Right: 120 closes on the course at 30°.",
                  "Juste : le cap 120 rejoint la route à 30°.",
                ),
              },
              {
                text: L(
                  "Turn left to 090 now",
                  "Virer à gauche au 090 maintenant",
                ),
                why: L(
                  "On 090 you fly parallel to the course: the bar stays where it is.",
                  "Au 090, vous volez parallèle à la route : la barre ne bouge plus.",
                ),
              },
              {
                text: L("Turn right to 180", "Virer à droite au 180"),
                why: L(
                  "90° this close flies through the course. 30° is enough.",
                  "À 90° si près, vous traversez la route. 30° suffisent.",
                ),
              },
            ],
            answer: 0,
            explain: L(
              "Keep 120, then turn to 090 when the bar is ¼ dot from centre.",
              "Gardez 120, puis virez au 090 quand la barre est à ¼ de point du centre.",
            ),
          },
          GR.x(5),
          520,
          960,
          464,
        ),
        foot(L("FAA IFH ch. 9", "FAA IFH ch. 9"), 960, GR.x(5)),
      ],
      { scene: "vor.intercept" },
    ),
    [
      {
        t: "text",
        text: L(
          "Cleared to intercept R-270 inbound (course 090), heading 120, bar right: keep 120, you are closing at 30°. Start the turn to 090 when the bar is about a quarter of a dot from centre: at standard rate a 30° turn needs less than 0.1 NM, and one dot is 0.5 NM at 6 NM (FAA IFH ch. 9).",
          "Autorisé à intercepter le R-270 en rapprochement (route 090), cap 120, barre à droite : gardez 120, vous convergez à 30°. Commencez le virage vers 090 quand la barre est à environ un quart de point du centre : au taux standard, un virage de 30° demande moins de 0,1 NM, et un point vaut 0,5 NM à 6 NM (FAA IFH ch. 9).",
        ),
      },
    ],
    { kind: "quiz", minutes: 1 },
  );
}

function wind(): Step {
  return slideStep(
    "v-wind",
    L(
      "Wind: find the heading that holds the track",
      "Vent : trouver le cap qui tient la route",
    ),
    slide(
      "heroDiagram",
      [
        ...head(
          L("Wind correction", "Correction de vent"),
          L("Heading is not track", "Le cap n’est pas la route"),
        ),
        INST(
          HSI,
          L(
            "HSI flown live: heading 090 on course 090, the bar leaving to the left in a north wind",
            "HSI en direct : cap 090 sur la route 090, la barre part à gauche par vent du nord",
          ),
          264,
          300,
          672,
          672,
          { id: "v-wind.hsi", scene: "vor.drift", mode: "live" },
        ),
        ...pointRows([
          {
            heading: L("The wind pushes you", "Le vent vous pousse"),
            body: L(
              "Heading 090 on course 090, and the bar leaves to the **left**: the course is on your left.",
              "Cap 090 sur la route 090, et la barre part à **gauche** : la route est à gauche.",
            ),
            color: "key",
          },
          {
            heading: L("Turn 20° towards it", "Virez de 20° vers elle"),
            body: L(
              "heading 070, until the bar is back in the centre.",
              "cap 070, jusqu’à ce que la barre revienne au centre.",
            ),
            color: "sel",
          },
          {
            heading: L("Then keep half", "Puis gardez la moitié"),
            body: L(
              "heading 080; adjust until the bar stays still: that is bracketing.",
              "cap 080 ; ajustez jusqu’à ce qu’elle reste immobile : c’est l’encadrement.",
            ),
            color: "nav",
          },
        ]),
        foot(
          L(
            "● Flown live: heading 090, wind 360/20 · FAA IFH ch. 9",
            "● En direct : cap 090, vent 360/20 · FAA IFH ch. 9",
          ),
          960,
          GR.left,
          "nav",
        ),
      ],
      { scene: "vor.drift" },
    ),
    [
      {
        t: "text",
        text: L(
          "The HSI on the slide flies heading 090 on course 090 with a 20 kt wind from the north: the bar leaves to the left, because the wind carries the aircraft south of the course. Bracketing (FAA IFH ch. 9): turn 20° towards the bar when it moves, keep half the correction once back on course, and halve the change again until the bar stays still. 20 kt across at 106 kt true airspeed (100 KIAS at 4,000 ft) needs about 11° (sin⁻¹ 20/106).",
          "Le HSI de la diapo vole le cap 090 sur la route 090 avec 20 kt de vent du nord : la barre part à gauche, car le vent emmène l’avion au sud de la route. L’encadrement (FAA IFH ch. 9) : virez de 20° vers la barre quand elle bouge, gardez la moitié de la correction une fois revenu sur la route, et divisez encore l’écart par deux jusqu’à ce qu’elle reste immobile. 20 kt de travers à 106 kt de vitesse propre (100 KIAS à 4 000 ft) demandent environ 11° (sin⁻¹ 20/106).",
        ),
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

function stationPassage(): Step {
  return slideStep(
    "v-passage",
    L("Station passage", "Passage de la verticale"),
    slide(
      "compare",
      [
        ...head(
          L("Station passage", "Passage de la station"),
          L(
            "Over the station, the flag flips",
            "À la verticale, le drapeau bascule",
          ),
        ),
        T("eyebrow", L("Before: TO", "Avant : TO"), GR.left, 312, 816, 32, {
          color: "muted",
        }),
        INST(
          HSI,
          L(
            "HSI 1.5 NM before ARD: TO flag",
            "HSI à 1,5 NM avant ARD : drapeau TO",
          ),
          264,
          352,
          528,
          528,
          {
            id: "v-passage.before",
            scene: "vor.before",
            controls: ["bank"],
            yourTurn: {
              where: "slide",
              prompt: L(
                "Your turn: hold heading 090 through ARD and watch the flag flip",
                "À vous : tenez le cap 090 jusqu’après ARD et regardez le drapeau basculer",
              ),
              controls: ["bank"],
              // 1.5 NM at 100 kt is a minute: four times faster, the flip comes in a quarter of that
              assist: { holdAlt: true, holdIas: true, timeScale: 4 },
              goal: {
                all: [G.passed("ARD"), G.toFrom("FROM"), G.heading(90, 10)],
                holdS: 2,
                graded: false,
                success: L(
                  "FROM: you are past ARD, outbound on R-090. The course is still 090.",
                  "FROM : vous avez passé ARD, en éloignement sur le R-090. La route est toujours 090.",
                ),
              },
              hint: L(
                "Do nothing: keep the wings level. Close to the station the bar swings; do not chase it.",
                "Ne touchez à rien : gardez les ailes à plat. Près de la station la barre s’agite ; ne la poursuivez pas.",
              ),
            },
          },
        ),
        T(
          "body",
          L(
            "Inbound on R-270: course 090 leads to the station.",
            "En rapprochement sur le R-270 : la route 090 mène à la station.",
          ),
          GR.left,
          888,
          816,
          96,
        ),
        SHAPE("rect", 959, 312, 2, 656, { fill: "line", stroke: null }),
        T("eyebrow", L("After: FROM", "Après : FROM"), 984, 312, 816, 32, {
          color: "muted",
          reveal: 1,
        }),
        INST(
          HSI,
          L(
            "HSI 1.5 NM after ARD: FROM flag",
            "HSI à 1,5 NM après ARD : drapeau FROM",
          ),
          1128,
          352,
          528,
          528,
          { scene: "vor.after", reveal: { order: 1 } },
        ),
        T(
          "body",
          L(
            "Outbound on R-090: same OBS, the flag says FROM.",
            "En éloignement sur le R-090 : même OBS, le drapeau indique FROM.",
          ),
          984,
          888,
          816,
          96,
          { reveal: 1 },
        ),
        foot(
          L(
            "FAA AIM 1-1-3 · the same course, 090: nothing to twist",
            "FAA AIM 1-1-3 · la même route, 090 : rien à tourner",
          ),
        ),
      ],
      { scene: "vor.before" },
    ),
    [
      {
        t: "text",
        text: L(
          "Over the station the bar swings and the flag flips from TO to FROM. Inbound on R-270 and outbound on R-090 are the same course, 090: nothing to twist, the bar stays on the same side (FAA AIM 1-1-3). On the slide, fly the left HSI through ARD on heading 090 and watch the flag flip.",
          "À la verticale la barre oscille et le drapeau passe de TO à FROM. Le R-270 en rapprochement et le R-090 en éloignement sont la même route, 090 : rien à tourner, la barre reste du même côté (FAA AIM 1-1-3). Sur la diapo, pilotez le HSI de gauche à travers ARD au cap 090 et regardez le drapeau basculer.",
        ),
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

function recap(): Step {
  return slideStep(
    "v-recap",
    L("Before you fly", "Avant de piloter"),
    slide("recap", [
      ...head(
        L("Takeaways", "À retenir"),
        L("Before you fly the radial", "Avant de voler le radial"),
      ),
      ...recapBlocks({
        id: "v-recap",
        cols: [
          {
            n: L("±180°", "±180°"),
            text: L(
              "your radial = the course to the station ± 180°",
              "votre radial = la route vers la station ± 180°",
            ),
          },
          {
            n: L("20°", "20°"),
            text: L(
              "the first correction when the bar moves, then half",
              "la première correction quand la barre bouge, puis la moitié",
            ),
            color: "sel",
          },
          {
            n: L("±5°", "±5°"),
            text: L(
              "on the radial: one dot of the HSI, the skill-test standard",
              "sur le radial : un point du HSI, la norme de l’examen",
            ),
            color: "key",
          },
        ],
        checksTitle: L("On every radial", "Sur chaque radial"),
        checks: [
          L(
            "Station identified, no flag: then use the bar",
            "Station identifiée, pas de drapeau : la barre est utilisable",
          ),
          L(
            "Centred with TO: you are on the reciprocal",
            "Centrée avec TO : vous êtes sur l’inverse",
          ),
          L(
            "Over the station: TO turns to FROM",
            "À la verticale : TO devient FROM",
          ),
        ],
      }),
      foot(
        L(
          "FAA AIM 1-1-3 · FAA IFH ch. 9 · EASA Part-FCL Appendix 7",
          "FAA AIM 1-1-3 · FAA IFH ch. 9 · EASA Part-FCL appendice 7",
        ),
      ),
    ]),
    [
      {
        t: "keys",
        items: [
          L(
            "Tune, identify (Morse), check the flag: only then use the bar.",
            "Affichez, identifiez (morse), vérifiez le drapeau : alors seulement, utilisez la barre.",
          ),
          L(
            "Centred with TO: your radial is the reciprocal of the course shown.",
            "Centrée avec TO : votre radial est l’inverse de la route affichée.",
          ),
          L(
            "Bracket: 20° towards the bar, then half, then half again.",
            "Encadrez : 20° vers la barre, puis la moitié, puis encore la moitié.",
          ),
          L(
            "Over the station the flag flips; the course stays the same.",
            "À la verticale le drapeau bascule ; la route ne change pas.",
          ),
        ],
      },
    ],
    { minutes: 1 },
  );
}

// ------------------------------------------------------------------ the practice on the instrument, then the flight

function findRadial(): Step {
  return step(
    "v-find",
    "try",
    L("Find the radial you are on", "Trouvez le radial sur lequel vous êtes"),
    [
      {
        t: "text",
        text: L(
          "You are south-west of ARD, heading 060. ARD is tuned and identified. Make the HSI tell you where: turn the **OBS** until the [[deviation bar|f1]] centres with a **TO** flag, then read the course. On the top view, the green line is the course you set: bring it through the aircraft.",
          "Vous êtes au sud-ouest d’ARD, cap 060. ARD est affiché et identifié. Faites-le dire au HSI : tournez l’**OBS** jusqu’à centrer la [[barre de déviation|f1]] avec un drapeau **TO**, puis lisez la route. Sur la vue de dessus, le trait vert est la route affichée : amenez-le sur l’avion.",
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
            text: L("The bar centred", "La barre centrée"),
            check: 1,
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
              "The course under the pointer, **060**, is the course **to** ARD. Your radial is its reciprocal: **R-240**, as the line above the instrument confirms.",
              "La route sous l’aiguille, **060**, est la route **vers** ARD. Votre radial est son inverse : le **R-240**, comme le confirme la ligne au-dessus de l’instrument.",
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
        // the top view draws the course set with the OBS: it turns round ARD until it runs through the aircraft
        inset: "plan",
        controls: ["obs1"],
        assist: { holdAlt: true, holdIas: true },
        annotations: [
          {
            id: "f1",
            pane: 0,
            type: "callout",
            n: 1,
            // in clear dial space, low on the left: never on the aircraft symbol or a needle
            at: [459, 631],
            text: L(
              "**Deviation bar**: centre it with the OBS.",
              "**Barre de déviation** : centrez-la avec l’OBS.",
            ),
          },
        ],
      },
      goal: {
        all: [G.toFrom("TO"), CENTRED],
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
          "Keep 120 while the [[deviation bar|i1]] comes in. When it is about ¼ dot from centre, roll to 090 with the bank pad and keep the bar centred.",
          "Gardez 120 pendant que la [[barre de déviation|i1]] revient. Quand elle est à environ ¼ de point du centre, virez au 090 avec les boutons d’inclinaison L / R et gardez la barre centrée.",
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
            text: L(
              "Bar within one dot of the HSI (half scale, 5°)",
              "Barre à moins d’un point du HSI (demi-échelle, 5°)",
            ),
            check: 2,
          },
        ],
      },
      {
        t: "keys",
        items: [
          L(
            "Lead the turn a little: with 30° to take out at about 100 kt, start rolling when the bar is about ¼ dot from centre.",
            "Anticipez un peu : avec 30° à reprendre vers 100 kt, commencez à virer quand la barre est à environ ¼ de point du centre.",
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
            // in clear dial space, on the left: never on the aircraft symbol or a needle
            at: [439, 622],
            text: L(
              "**Deviation bar**: right of centre, the course is to your right.",
              "**Barre de déviation** : à droite du centre, la route est à votre droite.",
            ),
          },
        ],
      },
      goal: {
        // half scale = one dot of the HSI (the goals' own dots are the 5-a-side CDI's: a fraction says it for both)
        all: [G.obs(90), G.heading(90, 10), HALF_SCALE],
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

function mistakes(): Step {
  return mistakesStep("v-mistakes", {
    title: L("Three classic mistakes", "Trois erreurs classiques"),
    rows: [
      {
        error: L("Chasing the bar", "Courir après la barre"),
        why: L(
          "A turn each time it moves makes S-turns and never finds the wind.",
          "Un virage à chaque mouvement fait des S et ne trouve jamais le vent.",
        ),
        fix: L(
          "Hold a heading, then bracket: 20°, half, half again.",
          "Tenez un cap, puis encadrez : 20°, la moitié, encore la moitié.",
        ),
      },
      {
        error: L("The reciprocal on the OBS", "L’inverse à l’OBS"),
        why: L(
          "OBS 270 while flying east: the flag says TO as you fly away. On a plain CDI the needle then works backwards.",
          "OBS 270 en volant vers l’est : le drapeau dit TO alors que vous vous éloignez. Sur un simple CDI, l’aiguille s’inverse.",
        ),
        fix: L(
          "Set the course you fly: 090, flag FROM.",
          "Affichez la route que vous volez : 090, drapeau FROM.",
        ),
      },
      {
        error: L("Correcting over the station", "Corriger à la verticale"),
        why: L(
          "Within 1 NM the bar swings to full scale: it no longer shows your track.",
          "À moins de 1 NM, la barre part en butée : elle ne montre plus votre route.",
        ),
        fix: L(
          "Hold the heading until FROM, then bracket again.",
          "Tenez le cap jusqu’à FROM, puis encadrez de nouveau.",
        ),
      },
    ],
    foot: L(
      "FAA IFH ch. 9 · common errors in VOR navigation",
      "FAA IFH ch. 9 · erreurs fréquentes en navigation VOR",
    ),
    reader: L(
      "Three classic mistakes. Chasing the bar: a turn each time it moves makes S-turns; hold a heading, then bracket. The reciprocal on the OBS: with 270 set while flying east the flag reads TO as you fly away, and on a plain CDI the needle works backwards (reverse sensing); set the course you fly, 090, flag FROM. Correcting over the station: within 1 NM the bar swings to full scale; hold the heading until the flag reads FROM, then bracket again (FAA IFH ch. 9).",
      "Trois erreurs classiques. Courir après la barre : un virage à chaque mouvement fait des S ; tenez un cap, puis encadrez. L’inverse à l’OBS : avec 270 affiché en volant vers l’est, le drapeau lit TO alors que vous vous éloignez, et sur un simple CDI l’aiguille s’inverse ; affichez la route que vous volez, 090, drapeau FROM. Corriger à la verticale : à moins de 1 NM la barre part en butée ; tenez le cap jusqu’à ce que le drapeau lise FROM, puis encadrez de nouveau (FAA IFH ch. 9).",
    ),
  });
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
          "On R-270, 9 NM west of ARD, heading 090. The wind is **360 at 20 kt**: from your left. The bar starts centred, but heading 090 does not hold the course: watch the track readout, then bracket.",
          "Sur le R-270, à 9 NM à l’ouest d’ARD, cap 090. Le vent est du **360 pour 20 kt** : de votre gauche. La barre part centrée, mais le cap 090 ne tient pas la route : regardez la route affichée, puis encadrez.",
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
            text: L(
              "Track 090 (±3°): the heading that holds the course",
              "Route 090 (±3°) : le cap qui tient la route",
            ),
            check: 1,
            readout: "trk",
          },
          {
            text: L(
              "Bar within one dot of the HSI (half scale, 5°)",
              "Barre à moins d’un point du HSI (demi-échelle, 5°)",
            ),
            check: 2,
          },
        ],
      },
      {
        t: "keys",
        items: [
          L(
            "Expect a heading near 080: about 11° into a 20 kt crosswind.",
            "Attendez-vous à un cap vers 080 : environ 11° face à 20 kt de travers.",
          ),
        ],
      },
      {
        t: "takeaway",
        text: L(
          "Find the heading that keeps the bar still, not the heading that centres it once.",
          "Cherchez le cap qui garde la barre immobile, pas celui qui la centre une fois.",
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
        // the track, not only the bar: with the bar centred at the start, heading 090 drifts 11° off the course
        all: [G.toFrom("TO"), G.track(90, 3), HALF_SCALE],
        holdS: 30,
        graded: false,
        success: L(
          "Tracking: the correction holds.",
          "Suivi tenu : la correction est bonne.",
        ),
      },
      hint: L(
        "The bar moves left: turn left about 20° (070). When it comes back to centre, turn right by half (heading about 080) and check the track reads 090.",
        "La barre part à gauche : virez à gauche d’environ 20° (070). Quand elle revient au centre, revenez de la moitié vers la droite (cap vers 080) et vérifiez que la route lit 090.",
      ),
    },
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

/** Three questions before the flight: each one brings back an idea of the course on the instrument it flies. */
function flyBriefing(): Step[] {
  const stage = (sceneId: string) => ({
    panes: [HSI_PANE] as [PaneView],
    mode: "frozen" as const,
    scene: sceneId,
  });
  return [
    step(
      "v-fly.b1",
      "predict",
      L("Brief: the wind", "Briefing : le vent"),
      [
        {
          t: "text",
          text: L(
            "You start 6 NM west of ARD on R-270, course 090. The wind is 360 at 15 kt.",
            "Vous partez à 6 NM à l’ouest d’ARD sur le R-270, route 090. Le vent est du 360 pour 15 kt.",
          ),
        },
      ],
      {
        quiz: {
          kind: "mcq",
          prompt: L(
            "Which heading do you expect to hold?",
            "Quel cap pensez-vous tenir ?",
          ),
          options: [
            {
              text: L("082", "082"),
              why: L(
                "Right: about 8° into the wind, to the left.",
                "Juste : environ 8° face au vent, à gauche.",
              ),
            },
            {
              text: L("098", "098"),
              why: L(
                "Wrong side: the wind comes from your left, so correct left.",
                "Mauvais côté : le vent vient de votre gauche, corrigez à gauche.",
              ),
            },
            {
              text: L("090", "090"),
              why: L(
                "No correction: the wind carries you south of the course.",
                "Sans correction, le vent vous emmène au sud de la route.",
              ),
            },
          ],
          answer: 0,
          explain: L(
            "15 kt across at 106 kt true airspeed is about 8°: start near 082, then bracket.",
            "15 kt de travers à 106 kt de vitesse propre font environ 8° : partez vers 082, puis encadrez.",
          ),
        },
        stage: stage("vor.fly"),
      },
    ),
    step(
      "v-fly.b2",
      "quiz",
      L("Brief: over the station", "Briefing : la verticale"),
      [
        {
          t: "text",
          text: L(
            "Close to ARD the bar swings to one side and the flag flickers.",
            "Près d’ARD, la barre part d’un côté et le drapeau hésite.",
          ),
        },
      ],
      {
        quiz: {
          kind: "mcq",
          prompt: L("What do you do?", "Que faites-vous ?"),
          options: [
            {
              text: L(
                "Hold the heading until the flag reads FROM",
                "Tenir le cap jusqu’à ce que le drapeau lise FROM",
              ),
              why: L(
                "Right: over the station the bar says nothing about your track.",
                "Juste : à la verticale, la barre ne dit rien de votre route.",
              ),
            },
            {
              text: L(
                "Turn towards the bar at once",
                "Virer tout de suite vers la barre",
              ),
              why: L(
                "Chasing it there makes S-turns: within 1 NM a full-scale bar is a few hundred metres.",
                "La poursuivre ici fait des S : à moins de 1 NM, une barre en butée vaut quelques centaines de mètres.",
              ),
            },
            {
              text: L("Turn the OBS to 270", "Tourner l’OBS sur 270"),
              why: L(
                "Outbound on R-090 the course is still 090: nothing to turn.",
                "En éloignement sur le R-090, la route est toujours 090 : rien à tourner.",
              ),
            },
          ],
          answer: 0,
          explain: L(
            "Hold the heading through the station; when the flag reads FROM, bracket again.",
            "Tenez le cap à la verticale ; quand le drapeau lit FROM, encadrez de nouveau.",
          ),
        },
        stage: stage("vor.before"),
      },
    ),
    step(
      "v-fly.b3",
      "quiz",
      L("Brief: outbound", "Briefing : en éloignement"),
      [
        {
          t: "text",
          text: L(
            "Past ARD, outbound on R-090, flag FROM. The bar starts to leave to the left.",
            "ARD passé, en éloignement sur le R-090, drapeau FROM. La barre commence à partir à gauche.",
          ),
        },
      ],
      {
        quiz: {
          kind: "mcq",
          prompt: L("What now?", "Et maintenant ?"),
          options: [
            {
              text: L(
                "Turn left 20°, then keep half",
                "Virer de 20° à gauche, puis en garder la moitié",
              ),
              why: L(
                "Right: towards the bar, then bracket.",
                "Juste : vers la barre, puis encadrez.",
              ),
            },
            {
              text: L("Turn right", "Virer à droite"),
              why: L(
                "The bar shows where the course is: on your left.",
                "La barre montre où est la route : à votre gauche.",
              ),
            },
            {
              text: L("Wait for it to come back", "Attendre qu’elle revienne"),
              why: L(
                "The wind does not stop: the gap only grows.",
                "Le vent ne s’arrête pas : l’écart ne fait que grandir.",
              ),
            },
          ],
          answer: 0,
          explain: L(
            "Same wind, same side: 20° towards the bar, then half, then half again.",
            "Même vent, même côté : 20° vers la barre, puis la moitié, puis encore la moitié.",
          ),
        },
        stage: stage("vor.after"),
      },
    ),
  ];
}

function flyIt(): Step {
  return step(
    "v-fly",
    "fly",
    L(
      "Fly it: R-270 inbound, R-090 outbound",
      "Volez : R-270 en rapprochement, R-090 en éloignement",
    ),
    [],
    {
      minutes: 8,
      flyIt: {
        target: { kind: "scene", scene: "vor.fly", durationS: 420 },
        brief: L(
          "Track R-270 inbound to ARD at 4,000 ft, cross the station, then track R-090 outbound for three minutes. The wind is 360 at 15 kt, from your left: expect a heading near 082.",
          "Suivez le R-270 vers ARD à 4 000 ft, passez la verticale, puis suivez le R-090 en éloignement pendant trois minutes. Le vent est du 360 pour 15 kt, de votre gauche : attendez-vous à un cap vers 082.",
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
            label: L(
              "Bar within ¾ scale (1½ dots of the HSI)",
              "Barre dans les ¾ d’échelle (1 point ½ du HSI)",
            ),
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
        briefing: flyBriefing(),
      },
    },
  );
}

/** The VOR sample (14 steps): each idea on a slide, then on the instrument; the mistakes, the takeaways, Fly it. */
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
      theme: "classroom",
      tags: ["ifr", "vor", "navigation", "tracking"],
      minutes: 35,
    },
    [
      // the standard, and the VOR itself
      cover(),
      why(),
      whatIsARadial(),
      // the instrument: read it, then find your radial with it
      readingHsi(),
      findRadial(),
      // tracking (FAA IFH ch. 9 teaches it before intercepting): the wind shown live, then bracketed
      wind(),
      trackWind(),
      stationPassage(),
      // intercepting: a worked case, then the student flies one (its place, the tenth step, is the one the
      // library's progress test reads)
      whichWay(),
      intercept(),
      setOutbound(),
      // the mistakes, the takeaways, the flight
      mistakes(),
      recap(),
      flyIt(),
    ],
    vorScenes(),
  );
}
