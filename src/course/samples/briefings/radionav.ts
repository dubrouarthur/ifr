// Ground school — crafted briefings for the radio-navigation lessons: VOR orientation and the outbound radial
// (nav-vor-out), VOR inbound tracking in a crosswind (nav-vor-in) and the DME arc (nav-arc).
// Engine figures (catalogue §1.2): every CDI shows 2 dots each side, so one VOR dot is 5° (full scale ±10°);
// a standard-rate turn at 95 kt has a radius of about 0.5 NM; WCA ≈ crosswind × 60 ÷ TAS.
// Sources: FAA-H-8083-15B Instrument Flying Handbook (IFH) ch. 9 (VOR, intercepts, tracking, bracketing, DME
// arcs); FAA AIM 1-1-3 (VOR); FAA-S-ACS-8C Instrument Rating ACS area V (navigation systems).
import type { Briefing, L10n, SimScene, SlideBlock, Step } from "../../types";
import { scene } from "../kit";
import {
  DIAGRAM,
  G,
  GAUGE,
  INST,
  L,
  briefing,
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

export const VOR_OUT_BRIEFING_ID = "sample-briefing-nav-vor-out";
export const VOR_IN_BRIEFING_ID = "sample-briefing-nav-vor-in";
export const ARC_BRIEFING_ID = "sample-briefing-nav-arc";

const ARD_RADIOS = (obs: number) => ({
  nav1: "ARD",
  obs1: obs,
  cdi: "NAV1" as const,
});
/** A wind triangle in the formula archetype's visual frame (120,368,960,592). */
const windVisual = (
  id: string,
  course: number,
  wind: [number, number],
  alt: L10n,
): SlideBlock =>
  DIAGRAM(
    id,
    {
      kind: "calc",
      calc: {
        kind: "windTriangle",
        course,
        tasKt: 100,
        windDir: wind[0],
        windKt: wind[1],
      },
    },
    alt,
    G.left,
    368,
    960,
    592,
  );

// ================================================================== nav-vor-out
function vorOutScenes(): Record<string, SimScene> {
  const w = { wind: [360, 15] as [number, number] };
  return {
    "vo.start": scene(
      "vo.start",
      {
        pos: { fix: "ARD", radial: 50, distNm: 6 },
        altFt: 3000,
        hdg: 140,
        iasKt: 95,
        radios: ARD_RADIOS(90),
      },
      { label: "ARD R-050 · 6 NM · OBS 090", ...w },
    ),
    "vo.find": scene(
      "vo.find",
      {
        pos: { fix: "ARD", radial: 50, distNm: 6 },
        altFt: 3000,
        hdg: 140,
        iasKt: 95,
        radios: ARD_RADIOS(50),
      },
      { label: "ARD R-050 · 6 NM · OBS 050: centred, FROM", ...w },
    ),
    "vo.intercept": scene(
      "vo.intercept",
      {
        pos: { fix: "ARD", radial: 85, distNm: 8 },
        altFt: 3000,
        hdg: 135,
        iasKt: 95,
        radios: ARD_RADIOS(90),
      },
      { label: "ARD R-085 · 8 NM · heading 135 to intercept R-090", ...w },
    ),
    "vo.track": scene(
      "vo.track",
      {
        pos: { fix: "ARD", radial: 90, distNm: 10 },
        altFt: 3000,
        hdg: 81,
        iasKt: 95,
        radios: ARD_RADIOS(90),
      },
      { label: "ARD R-090 · 10 NM · heading 081 · wind 360/15", ...w },
    ),
  };
}

export function vorOutBriefing(): Briefing {
  const steps: Step[] = [
    coverStep(
      "vo-cover",
      L("Briefing: VOR orientation", "Briefing : orientation VOR"),
      {
        eyebrow: L(
          "Lesson briefing · Radio navigation",
          "Briefing de leçon · Radionavigation",
        ),
        main: L("Find your radial", "Trouvez votre radial"),
        sub: L(
          "Then intercept and track R-090",
          "Puis interceptez et suivez le R-090",
        ),
        lead: L(
          "Where you are from ARD, a 45° intercept, and the wind correction that keeps the needle still.",
          "Où vous êtes par rapport à ARD, une interception à 45°, et la correction de vent qui fige l’aiguille.",
        ),
        meta: L(
          "About 10 min · ARD 114.20 · FAA IFH ch. 9",
          "Environ 10 min · ARD 114,20 · FAA IFH ch. 9",
        ),
        hero: [
          heroGauge(
            "vo-cover.hsi",
            "hsi",
            L("HSI tuned to ARD, course 090", "HSI calé sur ARD, route 090"),
            "vo.start",
          ),
        ],
        scene: "vo.start",
        reader: L(
          "The briefing of the VOR orientation lesson: find your radial from ARD, intercept R-090 outbound at 45°, then track it to 12 DME with a wind correction.",
          "Le briefing de la leçon orientation VOR : trouver votre radial depuis ARD, intercepter le R-090 en éloignement à 45°, puis le suivre jusqu’à 12 DME avec une correction de vent.",
        ),
      },
    ),
    instrumentStep("vo-radial", {
      eyebrow: L("Where am I?", "Où suis-je ?"),
      title: L(
        "Centre the needle with FROM",
        "Centrez l’aiguille, drapeau FROM",
      ),
      lead: L(
        "Turn the OBS until the needle centres.",
        "Tournez l’OBS jusqu’à centrer l’aiguille.",
      ),
      gauge: "hsi",
      alt: L(
        "HSI: course 050, needle centred, FROM flag",
        "HSI : route 050, aiguille centrée, drapeau FROM",
      ),
      scene: "vo.find",
      marks: [
        [0.2, -0.62],
        [0.3, 0.16],
      ],
      rows: [
        {
          heading: L("Course 050", "Route 050"),
          body: L(
            "the OBS setting that centres the needle",
            "l’affichage OBS qui centre l’aiguille",
          ),
        },
        {
          heading: L("FROM flag", "Drapeau FROM"),
          body: L(
            "so you are on R-050, north-east of ARD",
            "donc vous êtes sur le R-050, au nord-est d’ARD",
          ),
        },
      ],
      foot: L(
        "FAA IFH ch. 9 · the radial ignores your heading",
        "FAA IFH ch. 9 · le radial ignore votre cap",
      ),
      reader: L(
        "To find your radial, turn the OBS until the needle centres with a FROM flag: the course shown is your radial. With TO, the radial is the reciprocal. The VOR does not care about your heading (FAA IFH ch. 9).",
        "Pour trouver votre radial, tournez l’OBS jusqu’à centrer l’aiguille avec un drapeau FROM : la route affichée est votre radial. Avec TO, le radial est l’inverse. Le VOR ignore votre cap (FAA IFH ch. 9).",
      ),
    }),
    quizStep("vo-quiz", {
      eyebrow: L("Question", "Question"),
      title: L(
        "OBS 090, FROM, needle right",
        "OBS 090, FROM, aiguille à droite",
      ),
      visual: [
        INST(
          GAUGE("hsi"),
          L(
            "HSI: course 090, FROM, needle right of centre",
            "HSI : route 090, FROM, aiguille à droite",
          ),
          216,
          312,
          576,
          576,
          {
            id: "vo-quiz.hsi",
            scene: "vo.start",
          },
        ),
      ],
      quiz: mcq(
        L(
          "To intercept R-090, you turn to…",
          "Pour intercepter le R-090, vous prenez…",
        ),
        [
          {
            text: L("135", "135"),
            why: L(
              "Right: toward the needle, 45° off 090.",
              "Juste : vers l’aiguille, à 45° du 090.",
            ),
          },
          {
            text: L("045", "045"),
            why: L(
              "That turns away from the needle.",
              "C’est s’éloigner de l’aiguille.",
            ),
          },
          {
            text: L("270", "270"),
            why: L("That flies back toward ARD.", "C’est revenir vers ARD."),
          },
        ],
        0,
        L(
          "Course 090 with FROM: the needle points to the radial. Turn toward it, 45°: 135.",
          "Route 090 avec FROM : l’aiguille montre le radial. Virez vers elle, 45° : 135.",
        ),
      ),
      foot: L("FAA IFH ch. 9", "FAA IFH ch. 9"),
      reader: L(
        "With the course set to the radial you want and a FROM flag, the needle shows where the radial is: turn toward it. To intercept R-090 from the north, 45° toward the needle is heading 135.",
        "Route affichée sur le radial voulu et drapeau FROM : l’aiguille montre où est le radial ; virez vers elle. Pour intercepter le R-090 par le nord, 45° vers l’aiguille, c’est le cap 135.",
      ),
    }),
    heroStep("vo-intercept", {
      eyebrow: L("The intercept", "L’interception"),
      title: L("45° toward the needle", "45° vers l’aiguille"),
      visual: [
        INST(
          GAUGE("hsi"),
          L(
            "HSI on R-085, heading 135, needle one dot right",
            "HSI sur le R-085, cap 135, aiguille un point à droite",
          ),
          240,
          288,
          696,
          696,
          {
            id: "vo-intercept.hsi",
            scene: "vo.intercept",
          },
        ),
      ],
      points: [
        {
          heading: L("CRS 090 · FROM", "CRS 090 · FROM"),
          body: L(
            "the radial you want, flown outbound",
            "le radial voulu, en éloignement",
          ),
          color: "sel",
        },
        {
          heading: L("Heading 135", "Cap 135"),
          body: L(
            "45° toward the needle; one dot is 5° here",
            "45° vers l’aiguille ; un point vaut 5° ici",
          ),
          color: "path",
        },
        {
          heading: L("Lead: ½ dot", "Anticipation : ½ point"),
          body: L(
            "start the turn to 090 as the needle comes in",
            "virez vers 090 quand l’aiguille arrive",
          ),
          color: "key",
        },
      ],
      foot: L(
        "FAA IFH ch. 9 · turn radius ≈ 0.5 NM at 95 kt",
        "FAA IFH ch. 9 · rayon de virage ≈ 0,5 NM à 95 kt",
      ),
      scene: "vo.intercept",
      reader: L(
        "Set CRS 090 (FROM), turn 45° toward the needle (heading 135), and start the turn onto 090 about half a dot before centre: a 45° turn at standard rate needs about 0.15 NM, which is under half a dot at 6–8 NM (FAA IFH ch. 9).",
        "Affichez CRS 090 (FROM), virez de 45° vers l’aiguille (cap 135), et commencez le virage vers 090 environ un demi-point avant le centre : un virage de 45° au taux standard demande environ 0,15 NM, moins d’un demi-point à 6–8 NM (FAA IFH ch. 9).",
      ),
    }),
    formulaStep("vo-wind", {
      eyebrow: L("Tracking", "Le suivi"),
      title: L("The wind correction", "La correction de vent"),
      visual: [
        windVisual(
          "vo-wind.d",
          90,
          [360, 15],
          L(
            "Wind triangle: course 090, 100 kt, wind 360 at 15 kt",
            "Triangle des vents : route 090, 100 kt, vent 360 pour 15 kt",
          ),
        ),
      ],
      formula: L(
        "{WCA} ≈ [{crosswind} × 60/{TAS}]",
        "{correction} ≈ [{vent traversier} × 60/{Vp}]",
      ),
      units: L("degrees · knots", "degrés · nœuds"),
      lines: [
        L(
          "WCA | ≈ [15 × 60/100] ≈ !9°!",
          "correction | ≈ [15 × 60/100] ≈ !9°!",
        ),
        L("heading | ≈ 090 − 9 = !081!", "cap | ≈ 090 − 9 = !081!"),
      ],
      after: L(
        "Wind from the left: correct left, into it.",
        "Vent de gauche : corrigez à gauche, face au vent.",
      ),
      foot: L(
        "FAA IFH ch. 9 · TAS ≈ 100 kt at 3,000 ft",
        "FAA IFH ch. 9 · Vp ≈ 100 kt à 3 000 ft",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "WCA (°) ≈ crosswind (kt) × 60 ÷ TAS (kt)",
            "correction (°) ≈ vent traversier (kt) × 60 ÷ Vp (kt)",
          ),
          ruleOfThumb: L(
            "Wind 360/15 on R-090 outbound is a full crosswind from the left: about 9°, heading about 081.",
            "Vent 360/15 sur le R-090 en éloignement : plein travers de gauche, environ 9°, cap environ 081.",
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 9" }],
        },
      ],
    }),
    quizStep("vo-dots", {
      eyebrow: L("Question", "Question"),
      title: L("How far is one dot?", "Combien vaut un point ?"),
      quote: L(
        "Outbound on R-090 at 12 DME, the needle sits one dot left.",
        "En éloignement sur le R-090 à 12 DME, l’aiguille est à un point à gauche.",
      ),
      quiz: mcq(
        L("You are off course by about…", "Vous êtes écarté d’environ…"),
        [
          {
            text: L("0.2 NM", "0,2 NM"),
            why: L(
              "That would be one dot at about 2 DME.",
              "Ce serait un point à environ 2 DME.",
            ),
          },
          {
            text: L("1 NM", "1 NM"),
            why: L(
              "Right: 5° at 12 NM, 1 in 60.",
              "Juste : 5° à 12 NM, 1 sur 60.",
            ),
          },
          {
            text: L("5 NM", "5 NM"),
            why: L(
              "5 is the degrees, not the miles.",
              "5, ce sont les degrés, pas les milles.",
            ),
          },
        ],
        1,
        L(
          "One dot is 5°: 12 × 5 ÷ 60 = 1 NM. The farther out, the bigger a dot.",
          "Un point vaut 5° : 12 × 5 ÷ 60 = 1 NM. Plus loin, plus un point est grand.",
        ),
      ),
      foot: L(
        "Sim CDI: 2 dots each side, 1 dot = 5° · 1 in 60",
        "CDI du simulateur : 2 points de chaque côté, 1 point = 5° · 1 sur 60",
      ),
      reader: L(
        "On this CDI one dot is 5°. By the 1-in-60 rule, 5° at 12 NM is 12 × 5 ÷ 60 = 1 NM off course.",
        "Sur ce CDI, un point vaut 5°. Par la règle du 1 sur 60, 5° à 12 NM font 12 × 5 ÷ 60 = 1 NM d’écart.",
      ),
    }),
    mistakesStep("vo-errors", {
      title: L("What the grader catches", "Ce que l’évaluation détecte"),
      rows: [
        {
          error: L("Reverse sensing", "Sens inverse"),
          why: L(
            "CRS 270 with a TO flag outbound: the needle points the wrong way.",
            "CRS 270, drapeau TO en éloignement : l’aiguille trompe.",
          ),
          fix: L(
            "CRS 090: the flag reads FROM.",
            "CRS 090 : le drapeau lit FROM.",
          ),
        },
        {
          error: L("Homing", "Le ralliement"),
          why: L(
            "Steering on the needle curves you downwind.",
            "Suivre l’aiguille vous courbe sous le vent.",
          ),
          fix: L(
            "Hold a heading; correct in steps.",
            "Tenez un cap ; corrigez par paliers.",
          ),
        },
        {
          error: L("Flying through", "Traverser l’axe"),
          why: L(
            "Turning on centre carries you past the radial.",
            "Virer au centre fait dépasser le radial.",
          ),
          fix: L("Start the turn at ½ dot.", "Virez à ½ point."),
        },
      ],
      foot: L(
        "Lesson standards · ¾ scale = 1.5 dots",
        "Critères de la leçon · ¾ d’échelle = 1,5 point",
      ),
      reader: L(
        "Common mistakes: setting the reciprocal course (TO flag outbound: reverse sensing), homing on the needle instead of holding a wind-corrected heading, and starting the intercept turn too late.",
        "Erreurs fréquentes : afficher la route inverse (TO en éloignement : sens inverse), rallier l’aiguille au lieu de tenir un cap corrigé du vent, et commencer trop tard le virage d’interception.",
      ),
    }),
    readyStep("vo-ready", {
      objectives: [
        L(
          "Find your radial: centre the needle, FROM",
          "Trouver son radial : aiguille centrée, FROM",
        ),
        L("Intercept R-090 at 45°", "Intercepter le R-090 à 45°"),
        L(
          "Track it with a wind correction",
          "Le suivre avec une correction de vent",
        ),
        L("To 12 DME at 3,000 ft", "Jusqu’à 12 DME à 3 000 ft"),
      ],
      standards: [
        {
          n: L("1.5", "1,5"),
          text: L("dots at most (¾ scale)", "points au plus (¾ d’échelle)"),
        },
        { n: L("±100 ft", "±100 ft"), text: L("altitude", "altitude") },
        {
          n: L("R-090", "R-090"),
          text: L("FROM ARD", "FROM ARD"),
          color: "nav",
        },
        {
          n: L("12 DME", "12 DME"),
          text: L("end of the leg", "fin de la branche"),
        },
      ],
      tip: L(
        "NAV1 114.20 ARD · CRS 090 · intercept heading 135 · wind 360/15: heading about 081.",
        "NAV1 114,20 ARD · CRS 090 · cap d’interception 135 · vent 360/15 : cap environ 081.",
      ),
      reader: L(
        "Standards: CDI within ¾ scale (1.5 dots) after the intercept, altitude ±100 ft, track R-090 outbound to 12 DME.",
        "Critères : CDI dans les ¾ d’échelle (1,5 point) après l’interception, altitude ±100 ft, suivre le R-090 en éloignement jusqu’à 12 DME.",
      ),
    }),
    flyStep(
      "vo-fly",
      "nav-vor-out",
      L("Fly the lesson: VOR orientation", "Volez la leçon : orientation VOR"),
      L(
        "Find your radial from ARD, intercept R-090 outbound and track it to 12 DME at 3,000 ft.",
        "Trouvez votre radial depuis ARD, interceptez le R-090 en éloignement et suivez-le jusqu’à 12 DME à 3 000 ft.",
      ),
      [
        L(
          "Centre the needle with FROM: that is your radial.",
          "Aiguille centrée avec FROM : c’est votre radial.",
        ),
        L(
          "About 081 holds R-090 in this wind.",
          "Environ 081 tient le R-090 dans ce vent.",
        ),
      ],
      10,
      ["wind"],
    ),
  ];
  return briefing(
    {
      id: VOR_OUT_BRIEFING_ID,
      exerciseId: "nav-vor-out",
      title: L("Briefing: VOR orientation", "Briefing : orientation VOR"),
      summary: L(
        "The briefing of the VOR orientation lesson: find your radial, intercept at 45°, the wind correction, the size of a dot, then fly it.",
        "Le briefing de la leçon orientation VOR : trouver son radial, intercepter à 45°, la correction de vent, la valeur d’un point, puis le vol.",
      ),
      tags: ["ifr", "vor", "radionav"],
      minutes: 10,
    },
    steps,
    vorOutScenes(),
  );
}

// ================================================================== nav-vor-in
function vorInScenes(): Record<string, SimScene> {
  const w = { wind: [290, 20] as [number, number] };
  return {
    "vi.track": scene(
      "vi.track",
      {
        pos: { fix: "ARD", radial: 200, distNm: 8 },
        altFt: 3500,
        hdg: 8,
        iasKt: 95,
        radios: ARD_RADIOS(20),
      },
      { label: "ARD R-200 · 8 NM inbound · heading 008 · wind 290/20", ...w },
    ),
    "vi.drift": scene(
      "vi.drift",
      {
        pos: { fix: "ARD", radial: 195, distNm: 8 },
        altFt: 3500,
        hdg: 10,
        iasKt: 95,
        radios: ARD_RADIOS(20),
      },
      { label: "ARD R-195 · 8 NM · heading 010 · needle left", ...w },
    ),
    "vi.close": scene(
      "vi.close",
      {
        pos: { fix: "ARD", radial: 200, distNm: 1 },
        altFt: 3500,
        hdg: 8,
        iasKt: 95,
        radios: ARD_RADIOS(20),
      },
      { label: "ARD R-200 · 1 NM inbound", ...w },
    ),
    "vi.start": scene(
      "vi.start",
      {
        pos: { fix: "ARD", radial: 200, distNm: 10 },
        altFt: 3500,
        hdg: 20,
        iasKt: 95,
        radios: ARD_RADIOS(20),
      },
      { label: "ARD R-200 · 10 NM · heading 020, no correction yet", ...w },
    ),
  };
}

export function vorInBriefing(): Briefing {
  const steps: Step[] = [
    coverStep(
      "vi-cover",
      L(
        "Briefing: VOR inbound tracking",
        "Briefing : suivi VOR en rapprochement",
      ),
      {
        eyebrow: L(
          "Lesson briefing · Radio navigation",
          "Briefing de leçon · Radionavigation",
        ),
        main: L("Track to the station", "Rejoindre la station"),
        sub: L(
          "R-200 inbound, 20 kt across",
          "R-200 en rapprochement, 20 kt de travers",
        ),
        lead: L(
          "Bracket the wind until the needle stays still, then hold it to station passage.",
          "Encadrez le vent jusqu’à figer l’aiguille, puis tenez-la jusqu’au passage de la station.",
        ),
        meta: L(
          "About 10 min · ARD 114.20 · FAA IFH ch. 9",
          "Environ 10 min · ARD 114,20 · FAA IFH ch. 9",
        ),
        hero: [
          heroGauge(
            "vi-cover.hsi",
            "hsi",
            L(
              "HSI inbound on R-200, course 020 TO",
              "HSI en rapprochement sur le R-200, route 020 TO",
            ),
            "vi.track",
          ),
        ],
        scene: "vi.track",
        reader: L(
          "The briefing of the VOR inbound tracking lesson: track R-200 inbound to ARD (course 020 TO) with a 20 kt crosswind, find the wind correction by bracketing, then hold it to the station.",
          "Le briefing de la leçon suivi VOR en rapprochement : suivre le R-200 vers ARD (route 020 TO) avec 20 kt de vent traversier, trouver la correction en encadrant, puis la tenir jusqu’à la station.",
        ),
      },
    ),
    whyStep("vi-why", {
      eyebrow: L("The method", "La méthode"),
      title: L("Bracket the wind", "Encadrez le vent"),
      n: L("12°", "12°"),
      nW: 312,
      color: "sel",
      statement: L("for 20 kt straight across", "pour 20 kt plein travers"),
      body: L(
        "Find it once and the needle stays put. Chase the needle and the track curves.",
        "Trouvez-la une fois et l’aiguille reste immobile. Courez après l’aiguille et la route se courbe.",
      ),
      sideTitle: L("Bracket it", "Encadrez"),
      side: [
        {
          n: L("10°", "10°"),
          text: L(
            "first correction, into the wind",
            "première correction, face au vent",
          ),
          color: "key",
        },
        {
          n: L("20°", "20°"),
          text: L("still drifting: double it", "ça dérive encore : doublez"),
          color: "text",
        },
        {
          n: L("15°", "15°"),
          text: L(
            "drifting back: halve the change",
            "ça revient : divisez l’écart par deux",
          ),
          color: "nav",
        },
      ],
      foot: L("FAA IFH ch. 9 · bracketing", "FAA IFH ch. 9 · l’encadrement"),
      reader: L(
        "Bracketing: start with a generous correction into the wind (10–20°). If the needle still drifts, double it; if it comes back, halve the change. When the needle stops moving, you hold the wind correction angle (FAA IFH ch. 9).",
        "L’encadrement : commencez par une correction généreuse face au vent (10 à 20°). Si l’aiguille dérive encore, doublez ; si elle revient, divisez l’écart par deux. Quand l’aiguille ne bouge plus, vous tenez la bonne correction (FAA IFH ch. 9).",
      ),
    }),
    quizStep("vi-quiz", {
      eyebrow: L("Question", "Question"),
      title: L("The needle drifts left", "L’aiguille dérive à gauche"),
      visual: [
        INST(
          GAUGE("hsi"),
          L(
            "HSI: course 020 TO, heading 010, needle left",
            "HSI : route 020 TO, cap 010, aiguille à gauche",
          ),
          216,
          312,
          576,
          576,
          {
            id: "vi-quiz.hsi",
            scene: "vi.drift",
          },
        ),
      ],
      quiz: mcq(
        L(
          "Heading 010 is not enough. Try…",
          "Le cap 010 ne suffit pas. Essayez…",
        ),
        [
          {
            text: L("000", "000"),
            why: L(
              "Right: the course is left, so is the wind.",
              "Juste : l’axe est à gauche, le vent aussi.",
            ),
          },
          {
            text: L("020", "020"),
            why: L(
              "That removes the correction: worse.",
              "C’est supprimer la correction : pire.",
            ),
          },
          {
            text: L("030", "030"),
            why: L(
              "That turns away from the course.",
              "C’est s’éloigner de l’axe.",
            ),
          },
        ],
        0,
        L(
          "Needle left: the course is to your left. Double the correction: 000, then halve back.",
          "Aiguille à gauche : l’axe est à votre gauche. Doublez la correction : 000, puis revenez de moitié.",
        ),
      ),
      foot: L("FAA IFH ch. 9", "FAA IFH ch. 9"),
      reader: L(
        "The needle shows where the course is. Drifting left with heading 010 means the wind still pushes you right: increase the correction to 000, then halve the change once the needle comes back.",
        "L’aiguille montre où est l’axe. Une dérive à gauche au cap 010 veut dire que le vent vous pousse encore à droite : augmentez la correction à 000, puis revenez de moitié quand l’aiguille revient.",
      ),
    }),
    formulaStep("vi-wind", {
      eyebrow: L("The first guess", "La première estimation"),
      title: L("Start close to the answer", "Partez près de la réponse"),
      visual: [
        windVisual(
          "vi-wind.d",
          20,
          [290, 20],
          L(
            "Wind triangle: course 020, 100 kt, wind 290 at 20 kt",
            "Triangle des vents : route 020, 100 kt, vent 290 pour 20 kt",
          ),
        ),
      ],
      formula: L(
        "{WCA} ≈ [{crosswind} × 60/{TAS}]",
        "{correction} ≈ [{vent traversier} × 60/{Vp}]",
      ),
      units: L("degrees · knots", "degrés · nœuds"),
      lines: [
        L(
          "WCA | ≈ [20 × 60/100] ≈ !12°!",
          "correction | ≈ [20 × 60/100] ≈ !12°!",
        ),
        L("heading | ≈ 020 − 12 = !008!", "cap | ≈ 020 − 12 = !008!"),
      ],
      after: L(
        "Wind from 290: from your left. Correct left.",
        "Vent du 290 : de votre gauche. Corrigez à gauche.",
      ),
      foot: L(
        "FAA IFH ch. 9 · TAS ≈ 100 kt at 3,500 ft",
        "FAA IFH ch. 9 · Vp ≈ 100 kt à 3 500 ft",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "WCA (°) ≈ crosswind (kt) × 60 ÷ TAS (kt)",
            "correction (°) ≈ vent traversier (kt) × 60 ÷ Vp (kt)",
          ),
          ruleOfThumb: L(
            "Wind 290/20 on course 020 is a full crosswind from the left: about 12°, heading about 008.",
            "Vent 290/20 sur la route 020 : plein travers de gauche, environ 12°, cap environ 008.",
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 9" }],
        },
      ],
    }),
    instrumentStep("vi-passage", {
      eyebrow: L("Close to the station", "Près de la station"),
      title: L(
        "Hold the heading, not the needle",
        "Tenez le cap, pas l’aiguille",
      ),
      lead: L("1 NM from ARD, inbound.", "À 1 NM d’ARD, en rapprochement."),
      gauge: "hsi",
      alt: L(
        "HSI 1 NM before ARD, course 020 TO",
        "HSI à 1 NM d’ARD, route 020 TO",
      ),
      scene: "vi.close",
      marks: [
        [0.3, 0.16],
        [0.42, -0.3],
      ],
      rows: [
        {
          heading: L("A dot is tiny here", "Un point est minuscule"),
          body: L(
            "under 0.1 NM at 1 NM: do not chase",
            "moins de 0,1 NM à 1 NM : ne courez pas",
          ),
        },
        {
          heading: L("TO flips to FROM", "TO devient FROM"),
          body: L(
            "station passage: note the time, keep 008",
            "passage de la station : notez l’heure, gardez 008",
          ),
        },
      ],
      foot: L(
        "FAA IFH ch. 9 · the cone of confusion",
        "FAA IFH ch. 9 · le cône de silence",
      ),
      reader: L(
        "Near the station the needle becomes very sensitive: one dot is less than 0.1 NM at 1 NM. Hold the wind-corrected heading. Station passage is when the TO/FROM flag flips to FROM (FAA IFH ch. 9).",
        "Près de la station l’aiguille devient très sensible : un point fait moins de 0,1 NM à 1 NM. Tenez le cap corrigé du vent. Le passage de la station, c’est quand le drapeau passe de TO à FROM (FAA IFH ch. 9).",
      ),
    }),
    yourTurnStep("vi-try", {
      eyebrow: L("Your turn", "À vous"),
      title: L("Find the correction", "Trouvez la correction"),
      rows: [
        {
          heading: L("Turn 10° left: 010", "10° à gauche : 010"),
          small: L(
            "a first correction into the wind",
            "une première correction face au vent",
          ),
        },
        {
          heading: L("Watch the needle", "Surveillez l’aiguille"),
          small: L(
            "for 30 seconds, heading held",
            "pendant 30 secondes, cap tenu",
          ),
        },
        {
          heading: L("Still drifting: 000", "Ça dérive : 000"),
          small: L(
            "coming back: halve the change",
            "ça revient : divisez l’écart",
          ),
        },
      ],
      view: GAUGE("hsi"),
      alt: L(
        "HSI inbound on R-200, heading 020, wind from the left",
        "HSI en rapprochement sur le R-200, cap 020, vent de gauche",
      ),
      scene: "vi.start",
      prompt: L(
        "Your turn: keep the needle within one dot",
        "À vous : gardez l’aiguille à moins d’un point",
      ),
      controls: ["bank"],
      goal: {
        all: [
          { id: "cdiDefl", p: { maxDots: 1 } },
          { id: "heading", p: { value: 8, tol: 8 } },
        ],
        holdS: 10,
        graded: false,
        success: L(
          "Needle still with about 12° of correction.",
          "Aiguille immobile avec environ 12° de correction.",
        ),
      },
      hint: L(
        "Hold the L side of the bank pad.",
        "Maintenez le côté L des boutons d’inclinaison.",
      ),
      foot: L("FAA IFH ch. 9 · wind 290/20", "FAA IFH ch. 9 · vent 290/20"),
      reader: L(
        "Your turn: inbound on R-200 with no correction yet. Turn 10° left, watch the needle, then double or halve the correction until it stays within one dot.",
        "À vous : en rapprochement sur le R-200, sans correction. Virez de 10° à gauche, surveillez l’aiguille, puis doublez ou divisez la correction jusqu’à la garder à moins d’un point.",
      ),
    }),
    mistakesStep("vi-errors", {
      title: L("What the grader catches", "Ce que l’évaluation détecte"),
      rows: [
        {
          error: L("Homing", "Le ralliement"),
          why: L(
            "Pointing at the station curves you downwind.",
            "Pointer la station vous courbe sous le vent.",
          ),
          fix: L(
            "Hold a heading, then bracket.",
            "Tenez un cap, puis encadrez.",
          ),
        },
        {
          error: L("Chasing close in", "Courir près de la station"),
          why: L(
            "Inside 3 DME a dot is under 0.3 NM: big turns overshoot.",
            "Sous 3 DME un point fait moins de 0,3 NM : grands virages, dépassement.",
          ),
          fix: L(
            "Small changes, then hold.",
            "Petites corrections, puis tenez.",
          ),
        },
        {
          error: L("Undoing a good correction", "Défaire la bonne correction"),
          why: L(
            "Back on course, the wind is still there.",
            "Revenu sur l’axe, le vent est toujours là.",
          ),
          fix: L(
            "Keep most of it: halve the change.",
            "Gardez-en l’essentiel : moitié.",
          ),
        },
      ],
      foot: L(
        "Lesson standards · ¾ scale = 1.5 dots",
        "Critères de la leçon · ¾ d’échelle = 1,5 point",
      ),
      reader: L(
        "Common mistakes: homing (heading on the needle, which curves the track downwind), chasing the needle close to the station, and removing the whole correction once back on course.",
        "Erreurs fréquentes : le ralliement (le cap suit l’aiguille, la route se courbe sous le vent), courir après l’aiguille près de la station, et supprimer toute la correction une fois revenu sur l’axe.",
      ),
    }),
    readyStep("vi-ready", {
      objectives: [
        L("Track R-200 inbound: CRS 020, TO", "Suivre le R-200 : CRS 020, TO"),
        L(
          "Bracket to find the wind correction",
          "Encadrer pour trouver la correction",
        ),
        L("Hold it close to the station", "La tenir près de la station"),
      ],
      standards: [
        {
          n: L("1.5", "1,5"),
          text: L("dots at most (¾ scale)", "points au plus (¾ d’échelle)"),
        },
        { n: L("±100 ft", "±100 ft"), text: L("altitude", "altitude") },
        {
          n: L("CRS 020", "CRS 020"),
          text: L("TO ARD", "TO ARD"),
          color: "nav",
        },
        {
          n: L("2 DME", "2 DME"),
          text: L("end of the leg", "fin de la branche"),
        },
      ],
      tip: L(
        "ARD 114.20 · CRS 020 TO · wind 290/20 · start at 010, expect about 008 · 3,500 ft.",
        "ARD 114,20 · CRS 020 TO · vent 290/20 · commencez à 010, attendez-vous à 008 · 3 500 ft.",
      ),
      reader: L(
        "Standards: CDI within ¾ scale after the intercept, altitude ±100 ft, to 2 DME from ARD.",
        "Critères : CDI dans les ¾ d’échelle après l’interception, altitude ±100 ft, jusqu’à 2 DME d’ARD.",
      ),
    }),
    flyStep(
      "vi-fly",
      "nav-vor-in",
      L(
        "Fly the lesson: VOR inbound tracking",
        "Volez la leçon : suivi VOR en rapprochement",
      ),
      L(
        "Track R-200 inbound to ARD at 3,500 ft with a 20 kt crosswind from the left.",
        "Suivez le R-200 vers ARD à 3 500 ft avec 20 kt de vent traversier de gauche.",
      ),
      [
        L("Start with 10° into the wind.", "Commencez avec 10° face au vent."),
        L(
          "Halve the change each time.",
          "Divisez l’écart par deux à chaque fois.",
        ),
      ],
      10,
      ["wind"],
    ),
  ];
  return briefing(
    {
      id: VOR_IN_BRIEFING_ID,
      exerciseId: "nav-vor-in",
      title: L(
        "Briefing: VOR inbound tracking",
        "Briefing : suivi VOR en rapprochement",
      ),
      summary: L(
        "The briefing of the VOR inbound lesson: bracketing, the first wind guess, station passage, then fly it.",
        "Le briefing de la leçon VOR en rapprochement : l’encadrement, la première estimation du vent, le passage de la station, puis le vol.",
      ),
      tags: ["ifr", "vor", "radionav", "wind"],
      minutes: 10,
    },
    steps,
    vorInScenes(),
  );
}

// ================================================================== nav-arc
function arcScenes(): Record<string, SimScene> {
  const radios = {
    nav1: "MSV",
    obs1: 210,
    cdi: "NAV1" as const,
    brg1: "NAV1" as const,
  };
  const w = { wind: [270, 10] as [number, number] };
  return {
    "arc.on": scene(
      "arc.on",
      {
        pos: { fix: "MSV", radial: 100, distNm: 10 },
        altFt: 4500,
        hdg: 10,
        iasKt: 95,
        radios,
      },
      { label: "MSV R-100 · 10 DME · heading 010", ...w },
    ),
    "arc.behind": scene(
      "arc.behind",
      {
        pos: { fix: "MSV", radial: 90, distNm: 10.2 },
        altFt: 4500,
        hdg: 10,
        iasKt: 95,
        radios,
      },
      { label: "MSV R-090 · 10.2 DME · needle 10° behind the wingtip", ...w },
    ),
  };
}

export function arcBriefing(): Briefing {
  const steps: Step[] = [
    coverStep("da-cover", L("Briefing: the DME arc", "Briefing : l’arc DME"), {
      eyebrow: L(
        "Lesson briefing · Radio navigation",
        "Briefing de leçon · Radionavigation",
      ),
      main: L("The DME arc", "L’arc DME"),
      sub: L(
        "10 NM round MSV, station on the wingtip",
        "10 NM autour de MSV, station en bout d’aile",
      ),
      lead: L(
        "Short legs of 10°, the needle on the left wingtip, then a timely turn inbound.",
        "De courts segments de 10°, l’aiguille en bout d’aile gauche, puis un virage d’arrivée à temps.",
      ),
      meta: L(
        "About 10 min · MSV 112.70 · FAA IFH ch. 9",
        "Environ 10 min · MSV 112,70 · FAA IFH ch. 9",
      ),
      hero: [
        heroGauge(
          "da-cover.rmi",
          "rmi",
          L(
            "RMI on the arc: the needle on the left wingtip",
            "RMI sur l’arc : l’aiguille en bout d’aile gauche",
          ),
          "arc.on",
        ),
      ],
      scene: "arc.on",
      reader: L(
        "The briefing of the DME arc lesson: fly the 10 DME arc round MSV counter-clockwise from R-100 to R-030 at 4,500 ft, the bearing pointer on the left wingtip, then turn inbound on R-030 (course 210 TO).",
        "Le briefing de la leçon arc DME : voler l’arc de 10 DME autour de MSV dans le sens inverse des aiguilles d’une montre, du R-100 au R-030 à 4 500 ft, l’aiguille en bout d’aile gauche, puis virer en rapprochement sur le R-030 (route 210 TO).",
      ),
    }),
    whyStep("da-why", {
      eyebrow: L("The rhythm", "Le rythme"),
      title: L("Turn 10°, every 10°", "10° de virage, tous les 10°"),
      n: L("10°", "10°"),
      nW: 312,
      color: "sel",
      statement: L(
        "behind the wingtip: turn 10° toward the station",
        "derrière le bout d’aile : virez de 10° vers la station",
      ),
      body: L(
        "A circle flown as short straight legs.",
        "Un cercle volé en courts segments droits.",
      ),
      sideTitle: L("This arc", "Cet arc"),
      side: [
        {
          n: L("12 NM", "12 NM"),
          text: L("70° of arc, about 8 min", "70° d’arc, environ 8 min"),
        },
        {
          n: L("R-035", "R-035"),
          text: L("lead radial: turn inbound", "radial d’anticipation : virez"),
          color: "key",
        },
        {
          n: L("±1 NM", "±1 NM"),
          text: L("on the DME", "sur le DME"),
          color: "nav",
        },
      ],
      foot: L("FAA IFH ch. 9 · DME arcs", "FAA IFH ch. 9 · les arcs DME"),
      reader: L(
        "An arc is flown as a series of short straight legs: when the bearing pointer falls about 10° behind the wingtip reference, turn 10° toward the station. This arc: 70° at 10 NM is about 12 NM, 8 minutes at 95 kt; lead radial R-035; tolerance ±1 NM (FAA IFH ch. 9).",
        "Un arc se vole en courts segments droits : quand l’aiguille passe environ 10° derrière le bout d’aile, virez de 10° vers la station. Cet arc : 70° à 10 NM font environ 12 NM, 8 minutes à 95 kt ; radial d’anticipation R-035 ; tolérance ±1 NM (FAA IFH ch. 9).",
      ),
    }),
    quizStep("da-quiz", {
      eyebrow: L("Question", "Question"),
      title: L("Which wingtip?", "Quel bout d’aile ?"),
      quote: L(
        "Arc counter-clockwise round MSV, 10 DME, from R-100 to R-030.",
        "Arc dans le sens inverse des aiguilles d’une montre autour de MSV, 10 DME, du R-100 au R-030.",
      ),
      quiz: mcq(
        L("The station stays off your…", "La station reste…"),
        [
          {
            text: L("Left wingtip", "Bout d’aile gauche"),
            why: L(
              "Right: counter-clockwise, the centre is on your left.",
              "Juste : en sens inverse, le centre est à gauche.",
            ),
          },
          {
            text: L("Right wingtip", "Bout d’aile droite"),
            why: L(
              "That is a clockwise arc.",
              "C’est un arc dans le sens horaire.",
            ),
          },
          {
            text: L("Straight ahead", "Droit devant"),
            why: L(
              "Then you are flying to it, not round it.",
              "Vous allez alors vers elle, pas autour.",
            ),
          },
        ],
        0,
        L(
          "Counter-clockwise: the station is off the left wingtip; the pointer sits at 270 relative.",
          "Sens inverse : la station est en bout d’aile gauche ; l’aiguille au 270 relatif.",
        ),
      ),
      foot: L("FAA IFH ch. 9", "FAA IFH ch. 9"),
      reader: L(
        "Flying round a station counter-clockwise, the station is off the left wingtip: the bearing pointer should sit at the 9 o'clock position.",
        "En tournant autour d’une station dans le sens inverse des aiguilles d’une montre, la station est en bout d’aile gauche : l’aiguille se place à 9 heures.",
      ),
    }),
    instrumentStep("da-rmi", {
      eyebrow: L("The bearing pointer", "L’aiguille du RMI"),
      title: L("10° behind: turn 10° left", "10° derrière : 10° à gauche"),
      lead: L("R-090, heading 010, 10.2 DME.", "R-090, cap 010, 10,2 DME."),
      gauge: "rmi",
      alt: L(
        "RMI: the needle head 10° behind the left wingtip",
        "RMI : la tête de l’aiguille 10° derrière le bout d’aile gauche",
      ),
      scene: "arc.behind",
      marks: [
        [-0.62, 0.32],
        [0, -0.62],
      ],
      rows: [
        {
          heading: L("Head at 260 relative", "Tête au 260 relatif"),
          body: L(
            "the station has slipped behind the wingtip",
            "la station a glissé derrière le bout d’aile",
          ),
        },
        {
          heading: L("Heading 010 → 360", "Cap 010 → 360"),
          body: L(
            "turn 10° left: the head comes back to 270",
            "virez de 10° à gauche : la tête revient au 270",
          ),
        },
      ],
      foot: L(
        "FAA IFH ch. 9 · DME above 10: turn a little more",
        "FAA IFH ch. 9 · DME au-dessus de 10 : virez un peu plus",
      ),
      reader: L(
        "On a counter-clockwise arc the head of the bearing pointer should sit on the left wingtip (270 relative). When it falls about 10° behind, turn 10° left. If the DME grows past 10, turn a little more toward the station; if it shrinks, turn less (FAA IFH ch. 9).",
        "Sur un arc en sens inverse, la tête de l’aiguille doit rester en bout d’aile gauche (270 relatif). Quand elle passe environ 10° derrière, virez de 10° à gauche. Si le DME dépasse 10, virez un peu plus vers la station ; s’il diminue, virez moins (FAA IFH ch. 9).",
      ),
    }),
    formulaStep("da-numbers", {
      eyebrow: L("The numbers", "Les chiffres"),
      title: L("1 in 60, round a circle", "Le 1 sur 60 autour d’un cercle"),
      visual: [
        windVisual(
          "da-numbers.d",
          10,
          [270, 10],
          L(
            "Wind triangle on heading 010: 100 kt, wind 270 at 10 kt",
            "Triangle des vents au cap 010 : 100 kt, vent 270 pour 10 kt",
          ),
        ),
      ],
      formula: L(
        "{arc} ≈ [{angle}/60] × {DME}",
        "{arc} ≈ [{angle}/60] × {DME}",
      ),
      units: L(
        "arc and DME in NM · angle in degrees",
        "arc et DME en NM · angle en degrés",
      ),
      lines: [
        L("arc | ≈ [70/60] × 10 ≈ !12 NM!", "arc | ≈ [70/60] × 10 ≈ !12 NM!"),
        L(
          "lead | ≈ [0.5 × 60/10] ≈ !3°!",
          "anticipation | ≈ [0,5 × 60/10] ≈ !3°!",
        ),
      ],
      after: L(
        "Lead 5° with margin: turn inbound at R-035.",
        "Anticipez de 5° avec la marge : virez au R-035.",
      ),
      foot: L(
        "FAA IFH ch. 9 · turn radius ≈ 0.5 NM at 95 kt · wind 270/10",
        "FAA IFH ch. 9 · rayon de virage ≈ 0,5 NM à 95 kt · vent 270/10",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "arc (NM) ≈ angle (°) ÷ 60 × DME (NM)",
            "arc (NM) ≈ angle (°) ÷ 60 × DME (NM)",
          ),
          ruleOfThumb: L(
            "70° at 10 DME is about 12 NM (exactly 12.2). The standard-rate turn radius at 95 kt, 0.5 NM, is 3° at 10 NM: lead the turn inbound by about 5°, at R-035. Wind 270/10 blows from inside the arc at the start: it pushes you out, so turn a little more.",
            "70° à 10 DME font environ 12 NM (12,2 exactement). Le rayon de virage au taux standard à 95 kt, 0,5 NM, fait 3° à 10 NM : anticipez le virage d’arrivée d’environ 5°, au R-035. Le vent 270/10 souffle de l’intérieur de l’arc au début : il vous pousse dehors, virez un peu plus.",
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 9" }],
        },
      ],
    }),
    yourTurnStep("da-try", {
      eyebrow: L("Your turn", "À vous"),
      title: L("One leg of the arc", "Un segment de l’arc"),
      rows: [
        {
          heading: L("Hold 010", "Tenez 010"),
          small: L(
            "the needle slides behind the wingtip",
            "l’aiguille glisse derrière le bout d’aile",
          ),
        },
        {
          heading: L("10° behind: turn left", "10° derrière : à gauche"),
          small: L("to 360, wings level again", "au 360, ailes à plat"),
        },
        {
          heading: L("Check the DME", "Vérifiez le DME"),
          small: L("10 ± 0.5: hold the rhythm", "10 ± 0,5 : gardez le rythme"),
        },
      ],
      view: GAUGE("rmi"),
      alt: L(
        "RMI on the 10 DME arc, heading 010",
        "RMI sur l’arc de 10 DME, cap 010",
      ),
      scene: "arc.on",
      prompt: L(
        "Your turn: fly to heading 360, staying on the arc",
        "À vous : prenez le cap 360 en restant sur l’arc",
      ),
      controls: ["bank"],
      goal: {
        all: [
          { id: "heading", p: { value: 360, tol: 5 } },
          { id: "dme", p: { min: 9.5, max: 10.5 } },
        ],
        holdS: 3,
        graded: false,
        success: L(
          "Next leg: 350 when the needle slips again.",
          "Segment suivant : 350 quand l’aiguille repart.",
        ),
      },
      hint: L(
        "Hold the L side of the bank pad.",
        "Maintenez le côté L des boutons d’inclinaison.",
      ),
      foot: L(
        "FAA IFH ch. 9 · BRG1 on NAV1, set for you",
        "FAA IFH ch. 9 · BRG1 sur NAV1, réglé pour vous",
      ),
      reader: L(
        "Your turn: on the arc at R-100, heading 010. Hold the heading until the pointer is 10° behind the left wingtip, then turn 10° left to 360, keeping the DME within 0.5 NM of 10.",
        "À vous : sur l’arc au R-100, cap 010. Tenez le cap jusqu’à ce que l’aiguille passe 10° derrière le bout d’aile gauche, puis virez de 10° à gauche au 360, DME à 0,5 NM de 10.",
      ),
    }),
    mistakesStep("da-errors", {
      title: L("What the grader catches", "Ce que l’évaluation détecte"),
      rows: [
        {
          error: L("Turning too much", "Trop virer"),
          why: L(
            "The arc shrinks: the DME falls below 9.5.",
            "L’arc rétrécit : le DME passe sous 9,5.",
          ),
          fix: L("10° at a time, no more.", "10° à la fois, pas plus."),
        },
        {
          error: L("Missing the lead", "Rater l’anticipation"),
          why: L(
            "Turning at R-030 overshoots the inbound course.",
            "Virer au R-030 fait dépasser l’axe.",
          ),
          fix: L("Turn inbound at R-035.", "Virez au R-035."),
        },
        {
          error: L("Altitude while busy", "L’altitude oubliée"),
          why: L(
            "Every turn costs height if you stop the scan.",
            "Chaque virage coûte de l’altitude sans circuit visuel.",
          ),
          fix: L(
            "Check 4,500 after each leg.",
            "4 500 vérifiés après chaque segment.",
          ),
        },
      ],
      foot: L(
        "Lesson standards · arc ±1 NM · altitude ±100 ft",
        "Critères de la leçon · arc ±1 NM · altitude ±100 ft",
      ),
      reader: L(
        "Common mistakes: turning too much (the arc shrinks), missing the lead radial (overshooting R-030 inbound), and losing altitude while busy with the turns.",
        "Erreurs fréquentes : trop virer (l’arc rétrécit), rater le radial d’anticipation (dépasser le R-030 en rapprochement), et perdre de l’altitude occupé par les virages.",
      ),
    }),
    readyStep("da-ready", {
      objectives: [
        L(
          "Keep the needle on the left wingtip",
          "Garder l’aiguille en bout d’aile gauche",
        ),
        L(
          "Turn 10° each time it falls 10° behind",
          "Virer de 10° quand elle recule de 10°",
        ),
        L("Lead the turn inbound at R-035", "Anticiper le virage au R-035"),
        L("Track R-030 inbound, CRS 210", "Suivre le R-030, CRS 210"),
      ],
      standards: [
        {
          n: L("±1 NM", "±1 NM"),
          text: L("on the 10 DME arc", "sur l’arc de 10 DME"),
        },
        {
          n: L("±100 ft", "±100 ft"),
          text: L("altitude, 4,500 ft", "altitude, 4 500 ft"),
        },
        {
          n: L("R-035", "R-035"),
          text: L("lead radial", "radial d’anticipation"),
          color: "key",
        },
        {
          n: L("CRS 210", "CRS 210"),
          text: L("TO MSV", "TO MSV"),
          color: "nav",
        },
      ],
      tip: L(
        "MSV 112.70 · BRG1 on NAV1 · start R-100 heading 010 · wind 270/10 pushes you out at first.",
        "MSV 112,70 · BRG1 sur NAV1 · départ R-100 cap 010 · le vent 270/10 vous pousse dehors au début.",
      ),
      reader: L(
        "Standards: arc within ±1 NM, altitude ±100 ft, turn inbound at R-035 and track R-030 to MSV (course 210 TO).",
        "Critères : arc à ±1 NM, altitude ±100 ft, virage au R-035 et suivi du R-030 vers MSV (route 210 TO).",
      ),
    }),
    flyStep(
      "da-fly",
      "nav-arc",
      L("Fly the lesson: the DME arc", "Volez la leçon : l’arc DME"),
      L(
        "The 10 DME arc round MSV counter-clockwise from R-100 to R-030 at 4,500 ft, then inbound to MSV.",
        "L’arc de 10 DME autour de MSV, sens inverse, du R-100 au R-030 à 4 500 ft, puis vers MSV.",
      ),
      [
        L(
          "10° behind the wingtip: turn 10°.",
          "10° derrière le bout d’aile : 10° de virage.",
        ),
        L("Turn inbound at R-035.", "Virez au R-035."),
      ],
      10,
      ["wind"],
    ),
  ];
  return briefing(
    {
      id: ARC_BRIEFING_ID,
      exerciseId: "nav-arc",
      title: L("Briefing: the DME arc", "Briefing : l’arc DME"),
      summary: L(
        "The briefing of the DME arc lesson: the 10° rhythm, the bearing pointer on the wingtip, the lead radial, then fly it.",
        "Le briefing de la leçon arc DME : le rythme de 10°, l’aiguille en bout d’aile, le radial d’anticipation, puis le vol.",
      ),
      tags: ["ifr", "dme", "arc", "radionav"],
      minutes: 10,
    },
    steps,
    arcScenes(),
  );
}
