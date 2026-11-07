// Ground school — built-in sample "VOR tracking, inbound and outbound" (14 steps, steam cockpit, ARD VOR-DME).
// Slides first: the cover, why it matters, then the core ideas on designed slides (radials, the HSI, which way to
// turn, the wind, station passage) with a takeaways slide; then the student practises on the real instrument
// (find the radial, intercept, the radial calc, track in a crosswind, set the OBS outbound) and flies it at ARD.
// Sources: FAA AIM 1-1-3 (VOR), FAA-H-8083-15 Instrument Flying Handbook ch. 9 (VOR navigation, tracking,
// bracketing), FAA-S-ACS-8 Instrument Rating ACS area V task A (tracking: ±100 ft, ±10°, ¾-scale CDI).
import type {
  Course,
  InstrumentView,
  PaneView,
  SimScene,
  SlideBlock,
  Step,
} from "../types";
import { STEAM_GAUGE_LAYOUT } from "../../avionics/steam";
import {
  ARROW,
  DIAGRAM,
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

// ------------------------------------------------------------------ the slides (part 1: understand)
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
          "Read the HSI, intercept, bracket the wind — then fly it at ARD.",
          "Lire le HSI, intercepter, encadrer le vent — puis le voler à ARD.",
        ),
        meta: L(
          "14 steps · about 35 min · FAA AIM 1-1-3 · FAA IFH ch. 9",
          "14 étapes · environ 35 min · FAA AIM 1-1-3 · FAA IFH ch. 9",
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
            { scene: "vor.intercept" },
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
  return slideStep(
    "v-why",
    L("The checkride standard", "La norme du test en vol"),
    slide(
      "bigNumber",
      [
        ...head(
          L("Why it matters", "Pourquoi c’est important"),
          L("The checkride standard", "La norme du test en vol"),
        ),
        ...bigNumberBlocks({
          n: L("¾", "¾"),
          nW: 168,
          unit: L("scale", "d’échelle"),
          statement: L(
            "of CDI deflection, at most, on a radial",
            "de déviation au maximum sur le CDI",
          ),
          body: L(
            "While you track it: altitude **±100 ft**, heading **±10°**, airspeed **±10 kt**.",
            "En suivant un radial : altitude à **±100 ft**, cap à **±10°**, vitesse à **±10 kt**.",
          ),
        }),
        INST(
          HSI,
          L(
            "HSI on R-270 inbound to ARD, bar centred",
            "HSI sur le R-270 vers ARD, barre centrée",
          ),
          1272,
          312,
          528,
          528,
          { scene: "vor.track" },
        ),
        T(
          "small",
          L(
            "The instrument you will fly",
            "L’instrument que vous allez piloter",
          ),
          1272,
          864,
          528,
          48,
          { align: "center" },
        ),
        foot(
          L(
            "FAA-S-ACS-8 · Instrument Rating ACS, area V, task A",
            "FAA-S-ACS-8 · ACS qualification de vol aux instruments, domaine V, tâche A",
          ),
        ),
      ],
      { scene: "vor.track" },
    ),
    [
      {
        t: "text",
        text: L(
          "On the instrument checkride you intercept and track a VOR radial with no more than ¾-scale deflection of the CDI, holding altitude within ±100 ft, heading within ±10° and airspeed within ±10 kt (FAA-S-ACS-8, area V, task A). This course builds exactly that.",
          "Au test en vol IFR, vous interceptez et suivez un radial VOR sans dépasser les ¾ d’échelle de déviation du CDI, en tenant l’altitude à ±100 ft, le cap à ±10° et la vitesse à ±10 kt (FAA-S-ACS-8, domaine V, tâche A). Ce cours construit exactement cela.",
        ),
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
    IMG(
      { lib: "icon:aircraft-top" },
      L(
        "An aircraft east of ARD, heading west",
        "Un avion à l’est d’ARD, cap à l’ouest",
      ),
      cx + 136,
      cy - 40,
      80,
      80,
      { fit: "contain", rot: 270, group: "rad" },
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
            "The aircraft is east of ARD. Its radial is…",
            "L’avion est à l’est d’ARD. Son radial est le…",
          ),
          options: [
            {
              text: L("090", "090"),
              why: L(
                "Right: R-090 leaves ARD towards the east.",
                "Juste : le R-090 part d’ARD vers l’est.",
              ),
            },
            {
              text: L("270", "270"),
              why: L(
                "270 is the course it flies back to ARD, not its radial.",
                "270 est la route qu’il vole pour revenir à ARD, pas son radial.",
              ),
            },
          ],
          answer: 0,
          explain: L(
            "R-090: the radial names where you are from the station.",
            "R-090 : le radial dit où vous êtes par rapport à la station.",
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
          "A VOR sends 360 radials, each a magnetic course from the station: R-090 leaves ARD towards the east, R-270 towards the west. The OBS selects a course, the CDI shows where it is, and TO / FROM says whether it leads to the station or away from it (FAA AIM 1-1-3).",
          "Un VOR émet 360 radials, chacun une route magnétique depuis la station : le R-090 part d’ARD vers l’est, le R-270 vers l’ouest. L’OBS sélectionne une route, le CDI montre où elle est, TO / FROM indique si elle mène vers la station ou s’en éloigne (FAA AIM 1-1-3).",
        ),
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

function readingHsi(): Step {
  const [x, y, s] = [GR.left, 120, 840];
  const marks = [
    hsiPoint(x, y, s, -0.12, -0.56),
    hsiPoint(x, y, s, 0.44, 0.08),
    hsiPoint(x, y, s, 0.2, -0.36),
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
          MARK(i + 1, p[0], p[1], { size: 56, reveal: i + 1, group: "hsi" }),
        ),
        T("eyebrow", L("Navigation", "Navigation"), 1128, 120, 672, 32),
        T("title", L("Reading the HSI", "Lire le HSI"), 1128, 160, 672, 88),
        T(
          "body",
          L(
            "6 NM west of ARD, heading 120, OBS 090.",
            "À 6 NM à l’ouest d’ARD, cap 120, OBS 090.",
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
              "The course — fly to it: {{value}}",
              "La route — allez vers elle : {{value}}",
            ),
            readout: "cdiDots",
            scene: "vor.intercept",
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
          "1. The course pointer shows the course set with the OBS. 2. The deviation bar shows where that course is: fly towards it. Bar right, course right: here heading 120 closes on it at 30°. 3. The TO / FROM triangle shows whether flying the selected course would take you to the station or away from it (FAA AIM 1-1-3).",
          "1. L’aiguille de route montre la route affichée à l’OBS. 2. La barre de déviation montre où est cette route : allez vers elle. Barre à droite, route à droite : ici le cap 120 la rejoint à 30°. 3. Le triangle TO / FROM indique si la route affichée vous mène vers la station ou vous en éloigne (FAA AIM 1-1-3).",
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
                  "Right: the course is to your right and 120 closes on it at 30°.",
                  "Juste : la route est à votre droite et le cap 120 la rejoint à 30°.",
                ),
              },
              {
                text: L(
                  "Turn left to 090 now",
                  "Virer à gauche au 090 maintenant",
                ),
                why: L(
                  "On 090 you would fly parallel to the course: the bar would not move.",
                  "Au 090 vous voleriez parallèlement à la route : la barre ne bougerait pas.",
                ),
              },
              {
                text: L("Turn right to 180", "Virer à droite au 180"),
                why: L(
                  "A 90° intercept this close overshoots. 30° is enough at 6 NM.",
                  "Une interception à 90° si près dépasse la route. 30° suffisent à 6 NM.",
                ),
              },
            ],
            answer: 0,
            explain: L(
              "Keep 120 and roll out about one dot before centre.",
              "Gardez 120 et sortez du virage environ un point avant le centre.",
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
          "Cleared to intercept R-270 inbound (course 090), heading 120, bar right: keep 120, you are closing at 30°. Start the roll-out about one dot before centre (FAA IFH ch. 9).",
          "Autorisé à intercepter le R-270 en rapprochement (route 090), cap 120, barre à droite : gardez 120, vous convergez à 30°. Commencez la sortie de virage environ un point avant le centre (FAA IFH ch. 9).",
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
    slide("heroDiagram", [
      ...head(
        L("Wind correction", "Correction de vent"),
        L("Heading is not track", "Le cap n’est pas la route"),
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
        GR.left,
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
      ...pointRows([
        {
          heading: L("The wind pushes you", "Le vent vous pousse"),
          body: L(
            "Wind from the left: the bar drifts **left**. Turn towards it.",
            "Vent de gauche : la barre part vers la **gauche**. Virez vers elle.",
          ),
          color: "key",
        },
        {
          heading: L("Turn 20°", "Virez de 20°"),
          body: L(
            "towards the bar, until it comes back to centre.",
            "vers la barre, jusqu’à ce qu’elle revienne au centre.",
          ),
          color: "sel",
        },
        {
          heading: L(
            "Then half, and half again",
            "Puis la moitié, encore la moitié",
          ),
          body: L(
            "until the bar stays still: that is bracketing.",
            "jusqu’à ce que la barre reste immobile : c’est l’encadrement.",
          ),
          color: "nav",
        },
      ]),
      foot(
        L(
          "FAA IFH ch. 9 · 20 kt across at 100 kt: about 11° of correction",
          "FAA IFH ch. 9 · 20 kt de travers à 100 kt : environ 11° de correction",
        ),
      ),
    ]),
    [
      {
        t: "text",
        text: L(
          "Bracketing (FAA IFH ch. 9): turn 20° towards the needle when it moves, keep half the correction once back on course, and halve again until the needle stays still. 20 kt across at 100 kt needs about 11° (sin⁻¹ 20/100).",
          "L’encadrement (FAA IFH ch. 9) : virez de 20° vers l’aiguille quand elle bouge, gardez la moitié de la correction une fois revenu sur la route, et divisez encore par deux jusqu’à ce qu’elle reste immobile. 20 kt de travers à 100 kt demandent environ 11° (sin⁻¹ 20/100).",
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
          288,
          360,
          480,
          480,
          { scene: "vor.before" },
        ),
        T(
          "body",
          L(
            "Inbound on R-270: course 090 leads to the station.",
            "En rapprochement sur le R-270 : la route 090 mène à la station.",
          ),
          GR.left,
          864,
          816,
          104,
        ),
        SHAPE("rect", 959, 312, 2, 600, { fill: "line", stroke: null }),
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
          1152,
          360,
          480,
          480,
          { scene: "vor.after", reveal: { order: 1 } },
        ),
        T(
          "body",
          L(
            "Outbound on R-090: same OBS, the flag says FROM.",
            "En éloignement sur le R-090 : même OBS, le drapeau indique FROM.",
          ),
          984,
          864,
          816,
          104,
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
          "Over the station the needle swings and the flag flips from TO to FROM. Inbound on R-270 and outbound on R-090 are the same course, 090: nothing to twist, the bar stays on the same side (FAA AIM 1-1-3).",
          "À la verticale l’aiguille oscille et le drapeau passe de TO à FROM. Le R-270 en rapprochement et le R-090 en éloignement sont la même route, 090 : rien à tourner, la barre reste du même côté (FAA AIM 1-1-3).",
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
            n: L("¾", "¾"),
            text: L(
              "scale at most on the CDI: the checkride standard",
              "d’échelle au maximum sur le CDI : la norme du test",
            ),
            color: "key",
          },
        ],
        checksTitle: L("On every radial", "Sur chaque radial"),
        checks: [
          L(
            "Centred with TO: you are on the reciprocal",
            "Centrée avec TO : vous êtes sur l’inverse",
          ),
          L(
            "Bar right: the course is to your right",
            "Barre à droite : la route est à droite",
          ),
          L(
            "Over the station: TO turns to FROM",
            "À la verticale : TO devient FROM",
          ),
        ],
      }),
      foot(
        L(
          "FAA AIM 1-1-3 · FAA IFH ch. 9 · FAA-S-ACS-8 area V",
          "FAA AIM 1-1-3 · FAA IFH ch. 9 · FAA-S-ACS-8 domaine V",
        ),
      ),
    ]),
    [
      {
        t: "keys",
        items: [
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

// ------------------------------------------------------------------ part 2: practise on the instrument, then fly

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

/** The VOR sample (14 steps): slides first, then practice on the instrument, then Fly it. */
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
      // part 1: understand (designed slides)
      cover(),
      why(),
      whatIsARadial(),
      readingHsi(),
      whichWay(),
      wind(),
      stationPassage(),
      recap(),
      // part 2: practise on the instrument
      findRadial(),
      intercept(),
      radialCalc(),
      trackWind(),
      setOutbound(),
      // part 3: fly it
      flyIt(),
    ],
    vorScenes(),
  );
}
