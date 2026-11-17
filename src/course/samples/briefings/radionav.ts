// Ground school — crafted briefings for the radio-navigation lessons: VOR orientation and the outbound radial
// (nav-vor-out), VOR inbound tracking in a crosswind (nav-vor-in) and the DME arc (nav-arc).
// Engine figures: the HSI of the steam panel shows 2 dots each side, so one dot is 5° (full scale ±10°); a classic
// VOR CDI head has 5 dots, 2° each. A standard-rate turn at 95 kt has a radius of about 0.5 NM;
// WCA ≈ crosswind × 60 ÷ TAS. The RMI of the steam panel shows VOR 2 (green double needle) and the ADF (yellow).
// The winds: each lesson sets a SURFACE wind and the sim veers and strengthens it with height (sim/wind.ts
// defaultAloft), so every heading on these slides is worked out from the wind at the lesson's altitude (windAt),
// the one the student meets in the cockpit.
// Sources: FAA-H-8083-15B Instrument Flying Handbook (IFH) ch. 9 (VOR, intercepts, tracking, bracketing, DME
// arcs); FAA AIM 1-1-3 (VOR); EASA Part-FCL Appendix 7 and FAA-S-ACS-8C area V (navigation systems).
import type {
  Briefing,
  GoalCheck,
  L10n,
  SimScene,
  SlideBlock,
  Step,
  StepGoal,
} from "../../types";
import { steadyWind } from "../../../sim/wind";
import { G as GOAL, scene } from "../kit";
import {
  DIAGRAM,
  G,
  GAUGE,
  INST,
  L,
  briefing,
  coverStep,
  dec,
  flyStep,
  formulaStep,
  heroGauge,
  heroStep,
  instrumentStep,
  mcq,
  mistakesStep,
  pad3,
  quizStep,
  readyStep,
  whyStep,
  wrap360,
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
/** 95 KIAS at 3,000 to 4,500 ft: about 100 KTAS */
const TAS = 100;
/** Half-scale deflection: 5° on a VOR, one dot of the HSI. */
const HALF_SCALE: GoalCheck = { id: "acsScale", p: { axis: "lat", frac: 0.5 } };

/** The wind a lesson flies at its altitude, from its surface wind (the sim's winds-aloft profile), rounded. */
function windAt(surface: [number, number], altFt: number) {
  const w = steadyWind(
    { windDir: surface[0], windKt: surface[1], gustKt: 0, turbulence: 0 },
    altFt,
    altFt,
  );
  return { dir: Math.round(w.dir), kt: Math.round(w.kt) };
}
/** The first wind guess on a course, by the rule the slides teach (crosswind × 60 ÷ TAS). */
function windOn(course: number, w: { dir: number; kt: number }) {
  const rel = ((w.dir - course + 540) % 360) - 180; // − = from the left
  const off = Math.abs(rel);
  const xw = Math.round(w.kt * Math.sin((off * Math.PI) / 180) * 10) / 10;
  const wca = Math.round((xw * 60) / TAS);
  const left = rel < 0;
  return {
    /** wind angle off the course (°) */
    off,
    /** crosswind (kt, one decimal) */
    xw,
    wca,
    left,
    /** the heading that holds the course */
    hdg: wrap360(course + (left ? -wca : wca)),
    text: `${pad3(w.dir)}/${w.kt}`,
  };
}
/** "Centred": within a quarter of full scale, half a dot of the HSI (2.5° on a VOR). */
const CENTRED: GoalCheck = { id: "acsScale", p: { axis: "lat", frac: 0.25 } };
/** A wind triangle in the formula archetype's visual frame (120,368,960,592). */
const windVisual = (
  id: string,
  course: number,
  wind: { dir: number; kt: number },
  alt: L10n,
): SlideBlock =>
  DIAGRAM(
    id,
    {
      kind: "calc",
      calc: {
        kind: "windTriangle",
        course,
        tasKt: TAS,
        windDir: wind.dir,
        windKt: wind.kt,
      },
    },
    alt,
    G.left,
    368,
    960,
    592,
  );
/** A "Your turn" on a slide's instrument: the knobs handed over, altitude and speed held for the student. */
function turn(o: {
  prompt: L10n;
  controls: ("obs1" | "bank" | "hdgBug")[];
  goal: StepGoal;
  hint: L10n;
  timeScale?: 2 | 4;
}) {
  return {
    controls: o.controls,
    yourTurn: {
      where: "slide" as const,
      prompt: o.prompt,
      controls: o.controls,
      assist: {
        holdAlt: true,
        holdIas: true,
        ...(o.timeScale ? { timeScale: o.timeScale } : {}),
      },
      goal: o.goal,
      hint: o.hint,
    },
  };
}
/** Hand the instrument of a built slide to the student (the archetype builders pose it frozen). */
function handOver(st: Step, t: ReturnType<typeof turn>): Step {
  const b = st.slide?.blocks.find((x) => x.kind === "instrument");
  if (b?.kind === "instrument") Object.assign(b, t);
  return st;
}

// ================================================================== nav-vor-out
/** The lesson (train/curriculum.ts nav-vor-out): 3,000 ft, surface wind 360/15, R-090 outbound to 12 DME. */
const OUT_SURFACE: [number, number] = [360, 15];
const W_OUT = windAt(OUT_SURFACE, 3000);
const OUT = windOn(90, W_OUT);

function vorOutScenes(): Record<string, SimScene> {
  const w = { wind: OUT_SURFACE };
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
      // the label does not name the radial: finding it is the exercise
      { label: "North-east of ARD · 6 NM · 3,000 ft · OBS 090", ...w },
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
    // the answer: the heading that holds R-090 in the wind of the day
    "vo.held": scene(
      "vo.held",
      {
        pos: { fix: "ARD", radial: 90, distNm: 9 },
        altFt: 3000,
        hdg: OUT.hdg,
        iasKt: 95,
        radios: ARD_RADIOS(90),
      },
      { label: `ARD R-090 · 9 NM · heading ${pad3(OUT.hdg)} holds the radial`, ...w },
    ),
    "vo.track": scene(
      "vo.track",
      {
        pos: { fix: "ARD", radial: 90, distNm: 9 },
        altFt: 3000,
        hdg: 90,
        iasKt: 95,
        radios: ARD_RADIOS(90),
      },
      {
        label: `ARD R-090 · 9 NM · heading 090, no correction · wind ${OUT.text}`,
        ...w,
      },
    ),
  };
}

export function vorOutBriefing(): Briefing {
  const xw = dec(OUT.xw);
  const hdg = pad3(OUT.hdg);
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
          "“Say your position from ARD.” No GPS: the answer is on this HSI. You will find it, then fly it.",
          "« Donnez votre position par rapport à ARD. » Sans GPS, la réponse est sur ce HSI. Vous la trouvez, puis vous la volez.",
        ),
        meta: L(
          "About 12 min · you fly the HSI 3 times · ARD 114.20",
          "Environ 12 min · vous pilotez le HSI 3 fois · ARD 114,20",
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
    whyStep("vo-why", {
      eyebrow: L("Why it matters", "Pourquoi c’est important"),
      title: L("Where am I, without a GPS?", "Où suis-je, sans GPS ?"),
      n: L("R-050", "R-050"),
      nW: 720,
      statement: L(
        "a radial and a DME distance: that is a position",
        "un radial et une distance DME : c’est une position",
      ),
      body: L(
        "The controller asks for it, the chart shows it, and every VOR procedure starts from it.",
        "Le contrôleur la demande, la carte la montre, et toute procédure VOR part de là.",
      ),
      sideTitle: L("After this briefing you can", "Après ce briefing, vous savez"),
      side: [
        {
          n: L("FROM", "FROM"),
          text: L(
            "read your radial: bar centred, FROM",
            "lire votre radial : barre centrée, FROM",
          ),
          color: "nav",
        },
        {
          n: L("45°", "45°"),
          text: L(
            "intercept R-090 without flying through it",
            "intercepter le R-090 sans le traverser",
          ),
        },
        {
          n: L(`${OUT.wca}°`, `${OUT.wca}°`),
          text: L(
            `hold it with ${Math.round(OUT.xw)} kt across`,
            `le tenir avec ${Math.round(OUT.xw)} kt de travers`,
          ),
          color: "sel",
        },
      ],
      foot: L(
        "FAA IFH ch. 9 · FAA AIM 1-1-3",
        "FAA IFH ch. 9 · FAA AIM 1-1-3",
      ),
      reader: L(
        "Without a GPS, a radial and a DME distance give your position: the controller may ask for it and every VOR procedure starts from it. After this briefing you can read your radial (bar centred with FROM), intercept R-090 at 45° without flying through it, and hold it in the crosswind of the day.",
        "Sans GPS, un radial et une distance DME donnent votre position : le contrôleur peut la demander et toute procédure VOR part de là. Après ce briefing, vous savez lire votre radial (barre centrée avec FROM), intercepter le R-090 à 45° sans le traverser, et le tenir dans le vent traversier du jour.",
      ),
    }),
    handOver(
      instrumentStep("vo-radial", {
        eyebrow: L("Where am I?", "Où suis-je ?"),
        title: L(
          "Centre the bar with FROM",
          "Centrez la barre, drapeau FROM",
        ),
        lead: L(
          "ARD tuned and identified. Now turn the OBS.",
          "ARD affiché et identifié. Tournez maintenant l’OBS.",
        ),
        gauge: "hsi",
        alt: L(
          "HSI: course 090, bar full right, FROM flag",
          "HSI : route 090, barre en butée à droite, drapeau FROM",
        ),
        scene: "vo.start",
        // beside the head of the course pointer, then beside the TO / FROM triangle: never on a needle
        marks: [
          [-0.36, -0.52],
          [0.46, 0.1],
        ],
        rows: [
          {
            heading: L("Course pointer", "Aiguille de route"),
            body: L(
              "the course set with the OBS: {{value}}",
              "la route affichée à l’OBS : {{value}}",
            ),
            readout: "obs1",
          },
          {
            heading: L("TO / FROM", "TO / FROM"),
            body: L(
              "FROM: the course shown leaves the station. Now: {{value}}",
              "FROM : la route affichée part de la station. Ici : {{value}}",
            ),
            readout: "toFrom",
          },
        ],
        foot: L(
          "● Live values · the radial ignores your heading",
          "● Valeurs lues en direct · le radial ignore votre cap",
        ),
        reader: L(
          "To find your radial, turn the OBS until the bar centres with a FROM flag: the course shown is your radial. With TO, the radial is the reciprocal. The VOR does not care about your heading (FAA IFH ch. 9). On the slide, turn the OBS until the bar centres with FROM.",
          "Pour trouver votre radial, tournez l’OBS jusqu’à centrer la barre avec un drapeau FROM : la route affichée est votre radial. Avec TO, le radial est l’inverse. Le VOR ignore votre cap (FAA IFH ch. 9). Sur la diapo, tournez l’OBS jusqu’à centrer la barre avec FROM.",
        ),
      }),
      turn({
        prompt: L(
          "Your turn: turn the OBS until the bar centres with a FROM flag",
          "À vous : tournez l’OBS jusqu’à centrer la barre avec un drapeau FROM",
        ),
        controls: ["obs1"],
        goal: {
          all: [GOAL.toFrom("FROM"), CENTRED],
          holdS: 2,
          graded: false,
          success: L(
            "Centred with FROM on 050: you are on R-050, north-east of ARD.",
            "Centrée avec FROM sur 050 : vous êtes sur le R-050, au nord-est d’ARD.",
          ),
        },
        hint: L(
          "Turn the OBS towards smaller numbers: the bar leaves the stop near 060.",
          "Tournez l’OBS vers les petits chiffres : la barre quitte la butée vers 060.",
        ),
      }),
    ),
    quizStep("vo-quiz", {
      eyebrow: L("Question", "Question"),
      title: L(
        "OBS 090, FROM, bar right",
        "OBS 090, FROM, barre à droite",
      ),
      visual: [
        INST(
          GAUGE("hsi"),
          L(
            "HSI: course 090, FROM, bar right of centre",
            "HSI : route 090, FROM, barre à droite",
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
              "Right: toward the bar, 45° off 090.",
              "Juste : vers la barre, à 45° du 090.",
            ),
          },
          {
            text: L("045", "045"),
            why: L(
              "That turns away from the bar: R-090 is south of you.",
              "C’est s’éloigner de la barre : le R-090 est au sud de vous.",
            ),
          },
          {
            text: L("270", "270"),
            why: L(
              "That flies back toward ARD, not to the radial.",
              "C’est revenir vers ARD, pas vers le radial.",
            ),
          },
        ],
        0,
        L(
          "Course 090 with FROM: the bar points to the radial. Turn toward it, 45°: 135.",
          "Route 090 avec FROM : la barre montre le radial. Virez vers elle, 45° : 135.",
        ),
      ),
      foot: L("FAA IFH ch. 9", "FAA IFH ch. 9"),
      reader: L(
        "With the course set to the radial you want and a FROM flag, the bar shows where the radial is: turn toward it. To intercept R-090 from the north, 45° toward the bar is heading 135.",
        "Route affichée sur le radial voulu et drapeau FROM : la barre montre où est le radial ; virez vers elle. Pour intercepter le R-090 par le nord, 45° vers la barre, c’est le cap 135.",
      ),
    }),
    heroStep("vo-intercept", {
      eyebrow: L("The intercept", "L’interception"),
      title: L("45° toward the bar", "45° vers la barre"),
      visual: [
        INST(
          GAUGE("hsi"),
          L(
            "HSI on R-085, heading 135, bar one dot right",
            "HSI sur le R-085, cap 135, barre un point à droite",
          ),
          240,
          288,
          696,
          696,
          {
            id: "vo-intercept.hsi",
            scene: "vo.intercept",
            ...turn({
              prompt: L(
                "Your turn: hold 135, then roll out on 090 as the bar reaches ½ dot",
                "À vous : tenez 135, puis sortez au 090 quand la barre arrive à ½ point",
              ),
              controls: ["bank"],
              goal: {
                all: [GOAL.toFrom("FROM"), GOAL.heading(90, 10), HALF_SCALE],
                holdS: 8,
                graded: false,
                success: L(
                  "Established on R-090 outbound. Now the wind.",
                  "Établi sur le R-090 en éloignement. Maintenant, le vent.",
                ),
              },
              hint: L(
                "Wait on 135. When the bar is half a dot from centre, hold the L side of the bank pad until 090.",
                "Attendez au 135. Quand la barre est à un demi-point du centre, maintenez le côté L des boutons d’inclinaison jusqu’au 090.",
              ),
            }),
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
            "45° toward the bar; one dot is 5° here",
            "45° vers la barre ; un point vaut 5° ici",
          ),
          color: "path",
        },
        {
          heading: L("Lead: ½ dot", "Anticipation : ½ point"),
          body: L(
            "start the turn to 090 as the bar comes in",
            "virez vers 090 quand la barre arrive",
          ),
          color: "key",
        },
      ],
      foot: L(
        "FAA IFH ch. 9 · turn radius ≈ 0.5 NM at 95 kt",
        "FAA IFH ch. 9 · rayon de virage ≈ 0,5 NM à 95 kt",
      ),
      scene: "vo.intercept",
      kind: "try",
      reader: L(
        "Set CRS 090 (FROM), turn 45° toward the bar (heading 135), and start the turn onto 090 about half a dot before centre: a 45° turn at standard rate needs about 0.15 NM, which is under half a dot at 6–8 NM (FAA IFH ch. 9). On the slide, fly the intercept yourself.",
        "Affichez CRS 090 (FROM), virez de 45° vers la barre (cap 135), et commencez le virage vers 090 environ un demi-point avant le centre : un virage de 45° au taux standard demande environ 0,15 NM, moins d’un demi-point à 6–8 NM (FAA IFH ch. 9). Sur la diapo, volez vous-même l’interception.",
      ),
    }),
    formulaStep("vo-wind", {
      eyebrow: L("Tracking", "Le suivi"),
      title: L("The wind correction", "La correction de vent"),
      lead: L(
        `Surface wind 360/15; at 3,000 ft it is about ${OUT.text}.`,
        `Vent au sol 360/15 ; à 3 000 ft, il est d’environ ${OUT.text}.`,
      ),
      // what the answer looks like on the instrument: the course pointer sits right of the nose by the correction
      visual: [
        INST(
          GAUGE("hsi"),
          L(
            `HSI on R-090 outbound, heading ${hdg}: bar centred, the course pointer ${OUT.wca}° right of the nose`,
            `HSI sur le R-090 en éloignement, cap ${hdg} : barre centrée, la flèche de route ${OUT.wca}° à droite du nez`,
          ),
          304,
          368,
          592,
          592,
          { id: "vo-wind.hsi", scene: "vo.held" },
        ),
      ],
      scene: "vo.held",
      formula: L(
        "{WCA} ≈ [{crosswind} × 60/{TAS}]",
        "{correction} ≈ [{vent traversier} × 60/{Vp}]",
      ),
      units: L("degrees · knots", "degrés · nœuds"),
      lines: [
        L(
          `crosswind | = ${W_OUT.kt} × sin ${OUT.off}° ≈ !${xw.en} kt!`,
          `traversier | = ${W_OUT.kt} × sin ${OUT.off}° ≈ !${xw.fr} kt!`,
        ),
        L(
          `WCA | ≈ [${xw.en} × 60/100] ≈ !${OUT.wca}°!`,
          `correction | ≈ [${xw.fr} × 60/100] ≈ !${OUT.wca}°!`,
        ),
        L(
          `heading | ≈ 090 − ${OUT.wca} = !${hdg}!`,
          `cap | ≈ 090 − ${OUT.wca} = !${hdg}!`,
        ),
      ],
      after: L(
        "On the HSI: the nose left of the course arrow, into the wind.",
        "Au HSI : le nez à gauche de la flèche de route, face au vent.",
      ),
      foot: L(
        "FAA IFH ch. 9 · TAS ≈ 100 kt at 3,000 ft · the wind veers and strengthens with height",
        "FAA IFH ch. 9 · Vp ≈ 100 kt à 3 000 ft · le vent tourne à droite et forcit en altitude",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "WCA (°) ≈ crosswind (kt) × 60 ÷ TAS (kt)",
            "correction (°) ≈ vent traversier (kt) × 60 ÷ Vp (kt)",
          ),
          ruleOfThumb: L(
            `The surface wind is 360/15; at 3,000 ft, in the sim as in the air, it has veered and strengthened to about ${OUT.text}. On R-090 outbound that is ${xw.en} kt across from the left: about ${OUT.wca}°, heading about ${hdg}.`,
            `Le vent au sol est du 360/15 ; à 3 000 ft, au simulateur comme en vol, il a tourné à droite et forci : environ ${OUT.text}. Sur le R-090 en éloignement, cela fait ${xw.fr} kt de travers de gauche : environ ${OUT.wca}°, cap environ ${hdg}.`,
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 9" }],
        },
      ],
    }),
    yourTurnStep("vo-track", {
      eyebrow: L("Your turn", "À vous"),
      title: L("Hold the radial in the wind", "Tenez le radial dans le vent"),
      rows: [
        {
          heading: L("Heading 090: you drift", "Cap 090 : vous dérivez"),
          small: L(
            "the wind pushes you right, the bar goes left",
            "le vent vous pousse à droite, la barre part à gauche",
          ),
        },
        {
          heading: L(`Turn left to ${hdg}`, `Virez à gauche au ${hdg}`),
          small: L(
            `${OUT.wca}° into the wind: the first guess`,
            `${OUT.wca}° face au vent : la première estimation`,
          ),
        },
        {
          heading: L("Watch the bar", "Surveillez la barre"),
          small: L(
            "still: you have it. Moving: 5° more or less",
            "immobile : c’est le bon cap. Elle bouge : 5° de plus ou de moins",
          ),
        },
      ],
      view: GAUGE("hsi"),
      alt: L(
        "HSI on R-090 outbound, heading 090, wind from the left",
        "HSI sur le R-090 en éloignement, cap 090, vent de gauche",
      ),
      scene: "vo.track",
      prompt: L(
        "Your turn: find the heading that keeps the track on 090",
        "À vous : trouvez le cap qui garde la route au 090",
      ),
      controls: ["bank"],
      assist: { holdAlt: true, holdIas: true },
      goal: {
        all: [GOAL.toFrom("FROM"), GOAL.track(90, 3), HALF_SCALE],
        holdS: 15,
        graded: false,
        success: L(
          `The track holds with about ${OUT.wca}° into the wind.`,
          `La route tient avec environ ${OUT.wca}° face au vent.`,
        ),
      },
      hint: L(
        `Hold the L side of the bank pad until about ${hdg}, then wings level and watch the track.`,
        `Maintenez le côté L des boutons d’inclinaison jusqu’à environ ${hdg}, puis ailes à plat et regardez la route.`,
      ),
      foot: L(
        `FAA IFH ch. 9 · wind ${OUT.text} at 3,000 ft`,
        `FAA IFH ch. 9 · vent ${OUT.text} à 3 000 ft`,
      ),
      reader: L(
        `Your turn: established on R-090 outbound with no correction. The wind (${OUT.text}) pushes you right: turn left to about ${hdg} and watch the track settle on 090.`,
        `À vous : établi sur le R-090 en éloignement, sans correction. Le vent (${OUT.text}) vous pousse à droite : virez à gauche vers ${hdg} et regardez la route se stabiliser au 090.`,
      ),
    }),
    quizStep("vo-dots", {
      eyebrow: L("Question", "Question"),
      title: L("How far is one dot?", "Combien vaut un point ?"),
      // the worked example on the left (12 DME, one dot, 1 NM); the question transfers it to 6 DME
      visual: [
        DIAGRAM(
          "vo-dots.d",
          {
            kind: "calc",
            calc: { kind: "sixtyToOne", course: 90, flownNm: 12, offNm: 1 },
          },
          L(
            "12 NM out on R-090 and 1 NM right of it: a track error of 5°, one dot of the HSI",
            "À 12 NM sur le R-090 et 1 NM à droite : un écart de 5°, un point du HSI",
          ),
          G.left,
          312,
          816,
          560,
          {
            caption: L(
              "At 12 DME, one dot (5°) is 1 NM: 12 × 5 ÷ 60.",
              "À 12 DME, un point (5°) vaut 1 NM : 12 × 5 ÷ 60.",
            ),
          },
        ),
      ],
      quiz: mcq(
        L(
          "The same dot at 6 DME: you are off by…",
          "Le même point à 6 DME : vous êtes écarté de…",
        ),
        [
          {
            text: L("0.5 NM", "0,5 NM"),
            why: L(
              "Right: 6 × 5 ÷ 60. Half the distance, half the error.",
              "Juste : 6 × 5 ÷ 60. Moitié moins loin, moitié moins d’écart.",
            ),
          },
          {
            text: L("1 NM", "1 NM"),
            why: L(
              "A dot is an angle, not a distance: closer in, it is smaller.",
              "Un point est un angle, pas une distance : plus près, il vaut moins.",
            ),
          },
          {
            text: L("2 NM", "2 NM"),
            why: L(
              "The other way round: a dot grows with distance.",
              "C’est l’inverse : un point grandit avec la distance.",
            ),
          },
        ],
        0,
        L(
          "One dot is 5°: 1 NM at 12 DME, 0.5 NM at 6 DME. The farther out, the bigger a dot.",
          "Un point vaut 5° : 1 NM à 12 DME, 0,5 NM à 6 DME. Plus loin, plus un point est grand.",
        ),
      ),
      foot: L(
        "This HSI: 2 dots each side, 1 dot = 5° · 1 in 60",
        "Ce HSI : 2 points de chaque côté, 1 point = 5° · 1 sur 60",
      ),
      reader: L(
        "On this HSI one dot is 5°. By the 1-in-60 rule, 5° at 12 NM is 12 × 5 ÷ 60 = 1 NM off course; at 6 NM the same dot is 0.5 NM.",
        "Sur ce HSI, un point vaut 5°. Par la règle du 1 sur 60, 5° à 12 NM font 12 × 5 ÷ 60 = 1 NM d’écart ; à 6 NM, le même point vaut 0,5 NM.",
      ),
    }),
    mistakesStep("vo-errors", {
      title: L("Three classic mistakes", "Trois erreurs classiques"),
      rows: [
        {
          error: L("The reciprocal on the OBS", "L’inverse à l’OBS"),
          why: L(
            "CRS 270 outbound: the flag says TO as you fly away. On a plain CDI the needle then works backwards.",
            "CRS 270 en éloignement : le drapeau dit TO alors que vous vous éloignez. Sur un simple CDI, l’aiguille s’inverse.",
          ),
          fix: L(
            "CRS 090: the flag reads FROM.",
            "CRS 090 : le drapeau lit FROM.",
          ),
        },
        {
          error: L("Homing", "Le ralliement"),
          why: L(
            "Steering on the bar curves you downwind.",
            "Suivre la barre vous courbe sous le vent.",
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
        "The lesson checks all three · ¾ scale = 1.5 dots",
        "La leçon vérifie les trois · ¾ d’échelle = 1,5 point",
      ),
      reader: L(
        "Common mistakes: setting the reciprocal course (TO flag outbound; on a plain CDI the needle then works backwards: reverse sensing), homing on the bar instead of holding a wind-corrected heading, and starting the intercept turn too late.",
        "Erreurs fréquentes : afficher la route inverse (TO en éloignement ; sur un simple CDI l’aiguille s’inverse), rallier la barre au lieu de tenir un cap corrigé du vent, et commencer trop tard le virage d’interception.",
      ),
    }),
    readyStep("vo-ready", {
      objectives: [
        L(
          "Find your radial: centre the bar, FROM",
          "Trouver son radial : barre centrée, FROM",
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
        `ARD 114.20, identified · CRS 090 · intercept heading 135 · wind ${OUT.text} at 3,000 ft: heading about ${hdg}.`,
        `ARD 114,20, identifié · CRS 090 · cap d’interception 135 · vent ${OUT.text} à 3 000 ft : cap environ ${hdg}.`,
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
        `Find your radial from ARD, intercept R-090 outbound and track it to 12 DME at 3,000 ft. Surface wind 360/15, about ${OUT.text} at 3,000 ft.`,
        `Trouvez votre radial depuis ARD, interceptez le R-090 en éloignement et suivez-le jusqu’à 12 DME à 3 000 ft. Vent au sol 360/15, environ ${OUT.text} à 3 000 ft.`,
      ),
      [
        L(
          "Centre the bar with FROM: that is your radial.",
          "Barre centrée avec FROM : c’est votre radial.",
        ),
        L(
          `About ${hdg} holds R-090 in this wind.`,
          `Environ ${hdg} tient le R-090 dans ce vent.`,
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
        "The briefing of the VOR orientation lesson: find your radial on the HSI, fly a 45° intercept, hold the radial in the wind, the size of a dot, then fly it.",
        "Le briefing de la leçon orientation VOR : trouver son radial sur le HSI, voler une interception à 45°, tenir le radial dans le vent, la valeur d’un point, puis le vol.",
      ),
      tags: ["ifr", "vor", "radionav"],
      minutes: 12,
    },
    steps,
    vorOutScenes(),
  );
}

// ================================================================== nav-vor-in
/** The lesson (nav-vor-in): 3,500 ft, surface wind 290/20, R-200 inbound (course 020 TO) from 14 NM to 2 DME. */
const IN_SURFACE: [number, number] = [290, 20];
const W_IN = windAt(IN_SURFACE, 3500);
const IN = windOn(20, W_IN);
/** Bracketing (FAA IFH ch. 9): 20° into the wind, then half, then between the two. */
const BRACKET = [20, 10, 15].map((c) => wrap360(20 - c));

function vorInScenes(): Record<string, SimScene> {
  const w = { wind: IN_SURFACE };
  return {
    "vi.track": scene(
      "vi.track",
      {
        pos: { fix: "ARD", radial: 200, distNm: 8 },
        altFt: 3500,
        hdg: IN.hdg,
        iasKt: 95,
        radios: ARD_RADIOS(20),
      },
      {
        label: `ARD R-200 · 8 NM inbound · heading ${pad3(IN.hdg)} · wind ${IN.text}`,
        ...w,
      },
    ),
    // too little correction, flown live: the needle keeps leaving to the left
    "vi.drift": scene(
      "vi.drift",
      {
        pos: { fix: "ARD", radial: 198, distNm: 5 },
        altFt: 3500,
        hdg: 10,
        iasKt: 95,
        radios: ARD_RADIOS(20),
      },
      { label: "ARD · 5 NM inbound · heading 010 · bar leaving left", ...w },
    ),
    "vi.close": scene(
      "vi.close",
      {
        pos: { fix: "ARD", radial: 200, distNm: 4 },
        altFt: 3500,
        hdg: IN.hdg,
        iasKt: 95,
        radios: ARD_RADIOS(20),
      },
      { label: `ARD R-200 · 4 NM inbound · heading ${pad3(IN.hdg)}`, ...w },
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
  const xw = dec(IN.xw);
  const hdg = pad3(IN.hdg);
  const [b20, b10, b15] = BRACKET.map(pad3);
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
          `R-200 inbound, ${Math.round(IN.xw)} kt across`,
          `R-200 en rapprochement, ${Math.round(IN.xw)} kt de travers`,
        ),
        lead: L(
          "Heading 020 on course 020 and the bar still leaves. Which heading keeps it still? You will find it by bracketing.",
          "Cap 020 sur la route 020, et la barre s’en va quand même. Quel cap l’immobilise ? Vous le trouvez par encadrement.",
        ),
        meta: L(
          "About 12 min · you fly the HSI twice · ARD 114.20",
          "Environ 12 min · vous pilotez le HSI 2 fois · ARD 114,20",
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
          `The briefing of the VOR inbound tracking lesson: track R-200 inbound to ARD (course 020 TO) with ${Math.round(IN.xw)} kt of crosswind at 3,500 ft, find the wind correction by bracketing, then hold it to 2 DME.`,
          `Le briefing de la leçon suivi VOR en rapprochement : suivre le R-200 vers ARD (route 020 TO) avec ${Math.round(IN.xw)} kt de vent traversier à 3 500 ft, trouver la correction en encadrant, puis la tenir jusqu’à 2 DME.`,
        ),
      },
    ),
    whyStep("vi-why", {
      eyebrow: L("The method", "La méthode"),
      title: L("Bracket the wind", "Encadrez le vent"),
      n: L(`${IN.wca}°`, `${IN.wca}°`),
      nW: 312,
      color: "sel",
      statement: L(
        `into the wind: the heading that keeps the bar still today`,
        `face au vent : le cap qui immobilise la barre aujourd’hui`,
      ),
      body: L(
        "You do not need to know it: three tries find it. Chase the bar instead, and the track curves.",
        "Inutile de le connaître : trois essais le trouvent. Courez après la barre, et la route se courbe.",
      ),
      sideTitle: L("Three tries", "Trois essais"),
      side: [
        {
          n: L("20°", "20°"),
          text: L(
            "first correction: the bar comes back",
            "première correction : la barre revient",
          ),
          color: "key",
        },
        {
          n: L("10°", "10°"),
          text: L(
            "half of it: the bar leaves again",
            "la moitié : la barre repart",
          ),
          color: "text",
        },
        {
          n: L("15°", "15°"),
          text: L(
            "between the two: almost still",
            "entre les deux : presque immobile",
          ),
          color: "nav",
        },
      ],
      foot: L("FAA IFH ch. 9 · bracketing", "FAA IFH ch. 9 · l’encadrement"),
      reader: L(
        `Bracketing (FAA IFH ch. 9): when the bar moves, turn 20° toward it, into the wind. When it is back in the centre, keep half of that, 10°. If it leaves again, 10° was too little: try between the two, 15°, and keep narrowing until the bar stays still. Today the answer is about ${IN.wca}°.`,
        `L’encadrement (FAA IFH ch. 9) : quand la barre bouge, virez de 20° vers elle, face au vent. Quand elle est revenue au centre, gardez-en la moitié, 10°. Si elle repart, 10° ne suffisaient pas : essayez entre les deux, 15°, et resserrez jusqu’à ce que la barre reste immobile. Aujourd’hui, la réponse est d’environ ${IN.wca}°.`,
      ),
    }),
    quizStep("vi-quiz", {
      eyebrow: L("Question", "Question"),
      title: L("The bar leaves to the left", "La barre part à gauche"),
      visual: [
        INST(
          GAUGE("hsi"),
          L(
            "HSI flown live: course 020 TO, heading 010, the bar moving left",
            "HSI en direct : route 020 TO, cap 010, la barre part à gauche",
          ),
          216,
          312,
          576,
          576,
          {
            id: "vi-quiz.hsi",
            scene: "vi.drift",
            mode: "live",
            // answer by flying: bank towards the bar, wings level, watch it come back (FAA IFH ch. 9)
            controls: ["bank"],
          },
        ),
      ],
      quiz: mcq(
        L(
          "Heading 010 (10° of correction) is not enough. Try…",
          "Le cap 010 (10° de correction) ne suffit pas. Essayez…",
        ),
        [
          {
            text: L("000", "000"),
            why: L(
              "Right: the course is left, so is the wind. 20° into it.",
              "Juste : l’axe est à gauche, le vent aussi. 20° face au vent.",
            ),
          },
          {
            text: L("020", "020"),
            why: L(
              "That removes the correction: the bar leaves faster.",
              "C’est supprimer la correction : la barre part plus vite.",
            ),
          },
          {
            text: L("030", "030"),
            why: L(
              "That turns away from the course, downwind.",
              "C’est s’éloigner de l’axe, sous le vent.",
            ),
          },
        ],
        0,
        L(
          "Bar left: the course is to your left. Take 20° (000); when it comes back, try 15° (005).",
          "Barre à gauche : l’axe est à votre gauche. Prenez 20° (000) ; quand elle revient, essayez 15° (005).",
        ),
      ),
      scene: "vi.drift",
      foot: L(
        "● Flown live: watch the bar · FAA IFH ch. 9",
        "● En direct : regardez la barre · FAA IFH ch. 9",
      ),
      reader: L(
        "The bar shows where the course is. Leaving to the left with heading 010 means the wind still pushes you right: increase the correction to 20° (000), then try 15° once the bar comes back.",
        "La barre montre où est l’axe. Si elle part à gauche au cap 010, le vent vous pousse encore à droite : augmentez la correction à 20° (000), puis essayez 15° quand la barre revient.",
      ),
    }),
    formulaStep("vi-wind", {
      eyebrow: L("The first guess", "La première estimation"),
      title: L("Start close to the answer", "Partez près de la réponse"),
      lead: L(
        `Surface wind 290/20; at 3,500 ft it is about ${IN.text}.`,
        `Vent au sol 290/20 ; à 3 500 ft, il est d’environ ${IN.text}.`,
      ),
      visual: [
        windVisual(
          "vi-wind.d",
          20,
          W_IN,
          L(
            `Wind triangle: course 020, 100 kt, wind ${IN.text}`,
            `Triangle des vents : route 020, 100 kt, vent ${IN.text}`,
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
          `crosswind | = ${W_IN.kt} × sin ${IN.off}° ≈ !${xw.en} kt!`,
          `traversier | = ${W_IN.kt} × sin ${IN.off}° ≈ !${xw.fr} kt!`,
        ),
        L(
          `WCA | ≈ [${xw.en} × 60/100] ≈ !${IN.wca}°!`,
          `correction | ≈ [${xw.fr} × 60/100] ≈ !${IN.wca}°!`,
        ),
        L(
          `heading | ≈ 020 − ${IN.wca} = !${hdg}!`,
          `cap | ≈ 020 − ${IN.wca} = !${hdg}!`,
        ),
      ],
      after: L(
        "A wind from the north-west is from your left: correct left.",
        "Un vent de nord-ouest vient de votre gauche : corrigez à gauche.",
      ),
      foot: L(
        "FAA IFH ch. 9 · TAS ≈ 100 kt at 3,500 ft · the wind veers and strengthens with height",
        "FAA IFH ch. 9 · Vp ≈ 100 kt à 3 500 ft · le vent tourne à droite et forcit en altitude",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "WCA (°) ≈ crosswind (kt) × 60 ÷ TAS (kt)",
            "correction (°) ≈ vent traversier (kt) × 60 ÷ Vp (kt)",
          ),
          ruleOfThumb: L(
            `The surface wind is 290/20; at 3,500 ft it has veered and strengthened to about ${IN.text}. On course 020 that is ${xw.en} kt across from the left: about ${IN.wca}°, heading about ${hdg}. A first guess of 20° is close; bracketing does the rest.`,
            `Le vent au sol est du 290/20 ; à 3 500 ft, il a tourné à droite et forci : environ ${IN.text}. Sur la route 020, cela fait ${xw.fr} kt de travers de gauche : environ ${IN.wca}°, cap environ ${hdg}. Une première estimation de 20° est proche ; l’encadrement fait le reste.`,
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 9" }],
        },
      ],
    }),
    yourTurnStep("vi-try", {
      eyebrow: L("Your turn", "À vous"),
      title: L("Find the correction", "Trouvez la correction"),
      rows: [
        {
          heading: L(`Turn 20° left: ${b20}`, `20° à gauche : ${b20}`),
          small: L(
            "the first correction, into the wind",
            "la première correction, face au vent",
          ),
        },
        {
          heading: L(
            `Bar back: try ${b10}`,
            `La barre revient : essayez ${b10}`,
          ),
          small: L(
            "half of it; if it leaves again, too little",
            "la moitié ; si elle repart, c’est trop peu",
          ),
        },
        {
          heading: L(`Then between: ${b15}`, `Puis entre les deux : ${b15}`),
          small: L(
            `narrow it down until it stays still, near ${hdg}`,
            `resserrez jusqu’à l’immobiliser, vers ${hdg}`,
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
        "Your turn: find the heading that keeps the track on 020",
        "À vous : trouvez le cap qui garde la route au 020",
      ),
      controls: ["bank"],
      goal: {
        all: [GOAL.toFrom("TO"), GOAL.track(20, 3), HALF_SCALE],
        holdS: 15,
        graded: false,
        success: L(
          `Bar still with about ${IN.wca}° of correction.`,
          `Barre immobile avec environ ${IN.wca}° de correction.`,
        ),
      },
      hint: L(
        `Hold the L side of the bank pad until ${b20}. When the bar is back in the centre, come right to about ${hdg}.`,
        `Maintenez le côté L des boutons d’inclinaison jusqu’au ${b20}. Quand la barre est revenue au centre, revenez à droite vers ${hdg}.`,
      ),
      foot: L(
        `FAA IFH ch. 9 · wind ${IN.text} at 3,500 ft`,
        `FAA IFH ch. 9 · vent ${IN.text} à 3 500 ft`,
      ),
      reader: L(
        `Your turn: inbound on R-200 with no correction yet. Turn 20° left (${b20}), wait for the bar to come back, then try less until the track stays on 020 and the bar stays still: about ${hdg}.`,
        `À vous : en rapprochement sur le R-200, sans correction. Virez de 20° à gauche (${b20}), attendez que la barre revienne, puis essayez moins jusqu’à ce que la route reste au 020 et la barre immobile : environ ${hdg}.`,
      ),
    }),
    quizStep("vi-half", {
      eyebrow: L("Check", "Vérification"),
      title: L("Back on course: now what?", "Revenu sur l’axe : et maintenant ?"),
      quote: L(
        `With 20° of correction (heading ${b20}) the bar has come back to the centre.`,
        `Avec 20° de correction (cap ${b20}), la barre est revenue au centre.`,
      ),
      quiz: mcq(
        L("What do you do?", "Que faites-vous ?"),
        [
          {
            text: L("Go back to 020", "Revenir au 020"),
            why: L(
              "The wind is still there: without a correction the bar leaves again.",
              "Le vent est toujours là : sans correction, la barre repart.",
            ),
          },
          {
            text: L(
              `Keep part of it: ${b10} to ${b15}`,
              `En garder une partie : ${b10} à ${b15}`,
            ),
            why: L(
              "Right: keep half or a little more, then watch which way the bar moves.",
              "Juste : gardez-en la moitié ou un peu plus, puis regardez de quel côté part la barre.",
            ),
          },
          {
            text: L(`Stay on ${b20}`, `Rester au ${b20}`),
            why: L(
              "20° brought you back: it is more than the wind needs, you will cross the course.",
              "20° vous ont ramené : c’est plus que le vent n’en demande, vous allez traverser l’axe.",
            ),
          },
        ],
        1,
        L(
          "The correction that brings you back is too much to stay: keep part of it, then narrow it down.",
          "La correction qui vous ramène est trop forte pour rester : gardez-en une partie, puis resserrez.",
        ),
      ),
      foot: L("FAA IFH ch. 9 · bracketing", "FAA IFH ch. 9 · l’encadrement"),
      reader: L(
        "Back on course with 20° of correction: do not remove it all (the wind is still there) and do not keep it all (it brought you back, so it is more than needed). Keep half or a little more and watch the bar.",
        "Revenu sur l’axe avec 20° de correction : ne l’enlevez pas toute (le vent est toujours là) et ne la gardez pas toute (elle vous a ramené, elle est donc plus forte que nécessaire). Gardez-en la moitié ou un peu plus et surveillez la barre.",
      ),
    }),
    handOver(
      instrumentStep("vi-passage", {
        eyebrow: L("Close to the station", "Près de la station"),
        title: L(
          "Hold the heading, not the bar",
          "Tenez le cap, pas la barre",
        ),
        lead: L(
          `4 NM from ARD, heading ${hdg}. The lesson ends at 2 DME.`,
          `À 4 NM d’ARD, cap ${hdg}. La leçon s’arrête à 2 DME.`,
        ),
        gauge: "hsi",
        alt: L(
          "HSI 4 NM before ARD, course 020 TO",
          "HSI à 4 NM d’ARD, route 020 TO",
        ),
        scene: "vi.close",
        // below the right-hand dots, then beside the TO triangle: never on a needle
        marks: [
          [0.32, 0.32],
          [0.44, -0.2],
        ],
        rows: [
          {
            heading: L("A dot gets tiny", "Un point devient minuscule"),
            body: L(
              "5° is 0.2 NM at 2 DME: do not chase it",
              "5° font 0,2 NM à 2 DME : ne le poursuivez pas",
            ),
          },
          {
            heading: L("Later: TO flips to FROM", "Plus tard : TO devient FROM"),
            body: L(
              "that is station passage, beyond this lesson",
              "c’est le passage de la station, après cette leçon",
            ),
          },
        ],
        foot: L(
          "FAA IFH ch. 9 · close to the station",
          "FAA IFH ch. 9 · près de la station",
        ),
        reader: L(
          `Near the station the bar becomes very sensitive: one dot (5°) is about 0.2 NM at 2 DME. Hold the wind-corrected heading, about ${hdg}, and make small changes only. The lesson ends at 2 DME; flown on, station passage is when the TO flag flips to FROM (FAA IFH ch. 9). On the slide, fly from 4 NM to 2 DME holding the heading.`,
          `Près de la station la barre devient très sensible : un point (5°) fait environ 0,2 NM à 2 DME. Tenez le cap corrigé du vent, environ ${hdg}, et ne faites que de petites corrections. La leçon s’arrête à 2 DME ; en poursuivant, le passage de la station est le moment où le drapeau passe de TO à FROM (FAA IFH ch. 9). Sur la diapo, volez de 4 NM à 2 DME en tenant le cap.`,
        ),
      }),
      turn({
        prompt: L(
          `Your turn: hold about ${hdg} down to 2 DME, without chasing the bar`,
          `À vous : tenez environ ${hdg} jusqu’à 2 DME, sans courir après la barre`,
        ),
        controls: ["bank"],
        timeScale: 2,
        goal: {
          all: [
            { id: "distTo", p: { fix: "ARD", maxNm: 2 } },
            GOAL.heading(IN.hdg, 7),
            GOAL.acsLat(),
          ],
          holdS: 2,
          graded: false,
          success: L(
            "2 DME, heading held: the bar moved, your track did not.",
            "2 DME, cap tenu : la barre a bougé, pas votre route.",
          ),
        },
        hint: L(
          "Do nothing: keep the wings level. A touch on the bank pad is enough for 2 or 3 degrees.",
          "Ne touchez à rien : gardez les ailes à plat. Un appui bref sur les boutons d’inclinaison suffit pour 2 ou 3 degrés.",
        ),
      }),
    ),
    mistakesStep("vi-errors", {
      title: L("Three classic mistakes", "Trois erreurs classiques"),
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
        "The lesson checks all three · ¾ scale = 1.5 dots",
        "La leçon vérifie les trois · ¾ d’échelle = 1,5 point",
      ),
      reader: L(
        "Common mistakes: homing (heading on the bar, which curves the track downwind), chasing the bar close to the station, and removing the whole correction once back on course.",
        "Erreurs fréquentes : le ralliement (le cap suit la barre, la route se courbe sous le vent), courir après la barre près de la station, et supprimer toute la correction une fois revenu sur l’axe.",
      ),
    }),
    readyStep("vi-ready", {
      objectives: [
        L("Track R-200 inbound: CRS 020, TO", "Suivre le R-200 : CRS 020, TO"),
        L(
          "Bracket to find the wind correction",
          "Encadrer pour trouver la correction",
        ),
        L("Hold it down to 2 DME", "La tenir jusqu’à 2 DME"),
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
        `You start on R-205, one dot right: hold 020, the wind carries you onto R-200, then turn to ${b20}. Expect about ${hdg} · wind ${IN.text}.`,
        `Vous partez sur le R-205, un point à droite : tenez 020, le vent vous amène sur le R-200, puis prenez ${b20}. Attendez-vous à ${hdg} · vent ${IN.text}.`,
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
        `Track R-200 inbound to ARD at 3,500 ft down to 2 DME. Surface wind 290/20, about ${IN.text} at 3,500 ft: ${Math.round(IN.xw)} kt across from the left.`,
        `Suivez le R-200 vers ARD à 3 500 ft jusqu’à 2 DME. Vent au sol 290/20, environ ${IN.text} à 3 500 ft : ${Math.round(IN.xw)} kt de travers de gauche.`,
      ),
      [
        L(
          `Start with 20° into the wind (${b20}), then narrow it down.`,
          `Commencez avec 20° face au vent (${b20}), puis resserrez.`,
        ),
        L(
          `Expect about ${hdg}. Close in, hold the heading.`,
          `Attendez-vous à environ ${hdg}. Près de la station, tenez le cap.`,
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
        "The briefing of the VOR inbound lesson: bracketing on a live HSI, the first wind guess, holding the heading close to the station, then fly it.",
        "Le briefing de la leçon VOR en rapprochement : l’encadrement sur un HSI en direct, la première estimation du vent, tenir le cap près de la station, puis le vol.",
      ),
      tags: ["ifr", "vor", "radionav", "wind"],
      minutes: 12,
    },
    steps,
    vorInScenes(),
  );
}

// ================================================================== nav-arc
/** The lesson (nav-arc): the 10 DME arc round MSV, counter-clockwise from R-100 to R-030 at 4,500 ft, lead radial
 *  R-035, then R-030 inbound (course 210 TO). Surface wind 270/10. */
const ARC_SURFACE: [number, number] = [270, 10];
const W_ARC = windAt(ARC_SURFACE, 4500);
const ARC_WIND = `${pad3(W_ARC.dir)}/${W_ARC.kt}`;
/** the heading that holds course 210 inbound (the wind is across from the right) */
const ARC_IN = windOn(210, W_ARC);

function arcScenes(): Record<string, SimScene> {
  // The RMI of the steam panel shows VOR 2 (green double needle) and the ADF (yellow): VOR 2 is tuned to MSV too,
  // and the ADF to a frequency with no station, so the only needle is the one the slides talk about.
  const radios = {
    nav1: "MSV",
    nav2: "MSV",
    obs1: 210,
    cdi: "NAV1" as const,
    brg1: "NAV1" as const,
    adf: 200,
  };
  const w = { wind: ARC_SURFACE };
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
    // near the end of the arc: the HSI needle (course 210) comes alive at R-040 and is one dot out at R-035
    "arc.lead": scene(
      "arc.lead",
      {
        pos: { fix: "MSV", radial: 40, distNm: 10 },
        altFt: 4500,
        hdg: 310,
        iasKt: 95,
        radios,
      },
      { label: "MSV R-040 · 10 DME · heading 310 · CRS 210", ...w },
    ),
  };
}

export function arcBriefing(): Briefing {
  const inHdg = pad3(ARC_IN.hdg);
  const rmiStep = instrumentStep("da-rmi", {
    eyebrow: L("The green needle of the RMI", "L’aiguille verte du RMI"),
    title: L("10° behind: turn 10° left", "10° derrière : 10° à gauche"),
    lead: L(
      "On R-090, heading 010. VOR 2 is tuned to MSV.",
      "Sur le R-090, cap 010. VOR 2 est réglé sur MSV.",
    ),
    gauge: "rmi",
    alt: L(
      "RMI: the head of the green needle 10° behind the left wingtip",
      "RMI : la tête de l’aiguille verte 10° derrière le bout d’aile gauche",
    ),
    scene: "arc.behind",
    marks: [
      [-0.62, 0.32],
      [0.14, -0.62],
    ],
    rows: [
      {
        heading: L("The head has slipped back", "La tête a reculé"),
        body: L(
          "10° behind the left wingtip: MSV is sliding behind you",
          "10° derrière le bout d’aile gauche : MSV glisse derrière vous",
        ),
      },
      {
        heading: L("Heading 010 → 360", "Cap 010 → 360"),
        body: L(
          "turn 10° left: the head is back on the wingtip",
          "virez de 10° à gauche : la tête revient en bout d’aile",
        ),
      },
      {
        heading: L("Check the DME", "Vérifiez le DME"),
        body: L(
          "{{value}}: above 10, turn a little more",
          "{{value}} : au-dessus de 10, virez un peu plus",
        ),
        readout: "dme",
      },
    ],
    foot: L(
      "● Live value · FAA IFH ch. 9 · DME arcs",
      "● Valeur lue en direct · FAA IFH ch. 9 · les arcs DME",
    ),
    reader: L(
      "On a counter-clockwise arc the head of the bearing pointer should sit on the left wingtip (the 9 o’clock position). On the steam panel it is the green needle of the RMI, VOR 2 tuned to MSV. When it falls about 10° behind, turn 10° left. If the DME grows past 10, turn a little more toward the station; if it shrinks, turn less (FAA IFH ch. 9).",
      "Sur un arc en sens inverse des aiguilles d’une montre, la tête de l’aiguille doit rester en bout d’aile gauche (à 9 heures). Sur le tableau classique, c’est l’aiguille verte du RMI, VOR 2 réglé sur MSV. Quand elle passe environ 10° derrière, virez de 10° à gauche. Si le DME dépasse 10, virez un peu plus vers la station ; s’il diminue, virez moins (FAA IFH ch. 9).",
    ),
  });
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
        "How do you fly a circle with no line to follow? One needle on the wingtip, one number on the DME.",
        "Comment voler un cercle sans trait à suivre ? Une aiguille en bout d’aile, un chiffre au DME.",
      ),
      meta: L(
        "About 12 min · you fly the RMI and the HSI · MSV 112.70",
        "Environ 12 min · vous pilotez le RMI et le HSI · MSV 112,70",
      ),
      hero: [
        heroGauge(
          "da-cover.rmi",
          "rmi",
          L(
            "RMI on the arc: the green needle on the left wingtip",
            "RMI sur l’arc : l’aiguille verte en bout d’aile gauche",
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
        "A circle flown as short straight legs. Many approaches start with one.",
        "Un cercle volé en courts segments droits. Beaucoup d’approches commencent ainsi.",
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
          "Counter-clockwise: the station is off the left wingtip; the needle sits at 9 o’clock.",
          "Sens inverse : la station est en bout d’aile gauche ; l’aiguille est à 9 heures.",
        ),
      ),
      foot: L("FAA IFH ch. 9", "FAA IFH ch. 9"),
      reader: L(
        "Flying round a station counter-clockwise, the station is off the left wingtip: the bearing pointer should sit at the 9 o'clock position.",
        "En tournant autour d’une station dans le sens inverse des aiguilles d’une montre, la station est en bout d’aile gauche : l’aiguille se place à 9 heures.",
      ),
    }),
    rmiStep,
    yourTurnStep("da-try", {
      eyebrow: L("Your turn", "À vous"),
      title: L("One leg of the arc", "Un segment de l’arc"),
      rows: [
        {
          heading: L("Hold 010", "Tenez 010"),
          small: L(
            "the green needle slides behind the wingtip",
            "l’aiguille verte glisse derrière le bout d’aile",
          ),
        },
        {
          heading: L("10° behind: turn left", "10° derrière : à gauche"),
          small: L("to 360, wings level again", "au 360, ailes à plat"),
        },
        {
          heading: L("Check the DME", "Vérifiez le DME"),
          small: L(
            "10 ± 1 NM: the wind pushes you out",
            "10 ± 1 NM : le vent vous pousse dehors",
          ),
        },
      ],
      view: GAUGE("rmi"),
      alt: L(
        "RMI on the 10 DME arc, heading 010",
        "RMI sur l’arc de 10 DME, cap 010",
      ),
      scene: "arc.on",
      prompt: L(
        "Your turn: when the needle is 10° behind the wingtip, turn left to 360",
        "À vous : quand l’aiguille est 10° derrière le bout d’aile, virez à gauche au 360",
      ),
      controls: ["bank"],
      goal: {
        all: [GOAL.heading(360, 5), { id: "dme", p: { min: 9, max: 11 } }],
        holdS: 3,
        graded: false,
        success: L(
          "Next leg: 350 when the needle slips again.",
          "Segment suivant : 350 quand l’aiguille repart.",
        ),
      },
      hint: L(
        "The leg takes about a minute. Then hold the L side of the bank pad until 360.",
        "Le segment dure environ une minute. Puis maintenez le côté L des boutons d’inclinaison jusqu’au 360.",
      ),
      foot: L(
        "FAA IFH ch. 9 · VOR 2 on MSV drives the green needle",
        "FAA IFH ch. 9 · VOR 2 sur MSV anime l’aiguille verte",
      ),
      reader: L(
        "Your turn: on the arc at R-100, heading 010. Hold the heading until the green needle is 10° behind the left wingtip, then turn 10° left to 360, keeping the DME within 1 NM of 10.",
        "À vous : sur l’arc au R-100, cap 010. Tenez le cap jusqu’à ce que l’aiguille verte passe 10° derrière le bout d’aile gauche, puis virez de 10° à gauche au 360, DME à 1 NM de 10.",
      ),
    }),
    formulaStep("da-numbers", {
      eyebrow: L("The numbers", "Les chiffres"),
      title: L("1 in 60, round a circle", "Le 1 sur 60 autour d’un cercle"),
      visual: [
        DIAGRAM(
          "da-numbers.d",
          {
            kind: "calc",
            calc: {
              // the turn that leaves the arc: standard rate at 100 KTAS, about 0.5 NM of radius
              kind: "turn",
              tasKt: TAS,
              bankDeg: 15,
            },
          },
          L(
            "A standard-rate turn at 100 kt: about 15° of bank, a radius of about 0.5 NM",
            "Un virage au taux standard à 100 kt : environ 15° d’inclinaison, un rayon d’environ 0,5 NM",
          ),
          G.left,
          368,
          960,
          592,
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
        "FAA IFH ch. 9 · turn radius ≈ 0.5 NM at 95 kt",
        "FAA IFH ch. 9 · rayon de virage ≈ 0,5 NM à 95 kt",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "arc (NM) ≈ angle (°) ÷ 60 × DME (NM)",
            "arc (NM) ≈ angle (°) ÷ 60 × DME (NM)",
          ),
          ruleOfThumb: L(
            `70° at 10 DME is about 12 NM (exactly 12.2). The standard-rate turn radius at 95 kt, 0.5 NM, is 3° at 10 NM: lead the turn inbound by about 5°, at R-035. The wind at 4,500 ft, about ${ARC_WIND}, blows from inside the arc at the start: it pushes you out, so turn a little more.`,
            `70° à 10 DME font environ 12 NM (12,2 exactement). Le rayon de virage au taux standard à 95 kt, 0,5 NM, fait 3° à 10 NM : anticipez le virage d’arrivée d’environ 5°, au R-035. Le vent à 4 500 ft, environ ${ARC_WIND}, souffle de l’intérieur de l’arc au début : il vous pousse dehors, virez un peu plus.`,
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 9" }],
        },
      ],
    }),
    yourTurnStep("da-lead", {
      eyebrow: L("Your turn", "À vous"),
      title: L("Leave the arc at R-035", "Quittez l’arc au R-035"),
      rows: [
        {
          heading: L("Hold the arc: 310", "Tenez l’arc : 310"),
          small: L(
            "CRS 210 is set: the bar is at full scale",
            "CRS 210 est affiché : la barre est en butée",
          ),
        },
        {
          heading: L("The bar comes alive", "La barre décolle"),
          small: L(
            "full scale is 10° from the course: R-040",
            "la pleine échelle est à 10° de l’axe : R-040",
          ),
        },
        {
          heading: L("One dot: turn left to 210", "Un point : à gauche au 210"),
          small: L(
            "one dot is 5°: you are on R-035",
            "un point vaut 5° : vous êtes sur le R-035",
          ),
        },
        {
          heading: L("Centre it, then the wind", "Centrez, puis le vent"),
          small: L(
            `wind from the right: about ${inHdg}`,
            `vent de droite : environ ${inHdg}`,
          ),
        },
      ],
      view: GAUGE("hsi"),
      alt: L(
        "HSI on the arc at R-040, heading 310, course 210 set",
        "HSI sur l’arc au R-040, cap 310, route 210 affichée",
      ),
      scene: "arc.lead",
      prompt: L(
        "Your turn: when the bar is one dot from centre, turn left to 210 and centre it",
        "À vous : quand la barre est à un point du centre, virez à gauche au 210 et centrez-la",
      ),
      controls: ["bank"],
      goal: {
        all: [GOAL.toFrom("TO"), GOAL.heading(215, 15), HALF_SCALE],
        holdS: 5,
        graded: false,
        success: L(
          "Established on R-030 inbound to MSV.",
          "Établi sur le R-030 vers MSV.",
        ),
      },
      hint: L(
        "Wait on 310 for about 45 s. At one dot, hold the L side of the bank pad: the turn is 100°, about 40 s.",
        "Attendez au 310 environ 45 s. À un point, maintenez le côté L des boutons d’inclinaison : le virage fait 100°, environ 40 s.",
      ),
      foot: L(
        `FAA IFH ch. 9 · lead radial R-035 · wind ${ARC_WIND} at 4,500 ft`,
        `FAA IFH ch. 9 · radial d’anticipation R-035 · vent ${ARC_WIND} à 4 500 ft`,
      ),
      reader: L(
        `Your turn: near the end of the arc at R-040, heading 310 with CRS 210 set. The HSI bar is at full scale (10° from the course), then comes in. At one dot (5°: R-035, the lead radial) turn left to 210 and centre the bar; the wind is across from the right, so expect about ${inHdg}.`,
        `À vous : vers la fin de l’arc au R-040, cap 310, CRS 210 affiché. La barre du HSI est en butée (la pleine échelle vaut 10° d’écart), puis revient. À un point (5° : le R-035, radial d’anticipation), virez à gauche au 210 et centrez la barre ; le vent vient de droite, attendez-vous à environ ${inHdg}.`,
      ),
    }),
    mistakesStep("da-errors", {
      title: L("Three classic mistakes", "Trois erreurs classiques"),
      rows: [
        {
          error: L("Turning too much", "Trop virer"),
          why: L(
            "The arc shrinks: the DME falls below 9.",
            "L’arc rétrécit : le DME passe sous 9.",
          ),
          fix: L("10° at a time, no more.", "10° à la fois, pas plus."),
        },
        {
          error: L("Missing the lead", "Rater l’anticipation"),
          why: L(
            "Turning at R-030 overshoots the inbound course.",
            "Virer au R-030 fait dépasser l’axe.",
          ),
          fix: L(
            "Turn at R-035: one dot on the HSI.",
            "Virez au R-035 : un point au HSI.",
          ),
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
        `MSV 112.70 on NAV 1 and NAV 2 (the RMI’s green needle) · start R-100 heading 010 · wind ${ARC_WIND} pushes you out at first.`,
        `MSV 112,70 sur NAV 1 et NAV 2 (l’aiguille verte du RMI) · départ R-100 cap 010 · le vent ${ARC_WIND} vous pousse dehors au début.`,
      ),
      reader: L(
        "Standards: arc within ±1 NM, altitude ±100 ft, turn inbound at R-035 and track R-030 to MSV (course 210 TO). On the steam panel, tune NAV 2 to MSV as well: the green needle of the RMI is VOR 2.",
        "Critères : arc à ±1 NM, altitude ±100 ft, virage au R-035 et suivi du R-030 vers MSV (route 210 TO). Sur le tableau classique, réglez aussi NAV 2 sur MSV : l’aiguille verte du RMI est celle du VOR 2.",
      ),
    }),
    flyStep(
      "da-fly",
      "nav-arc",
      L("Fly the lesson: the DME arc", "Volez la leçon : l’arc DME"),
      L(
        `The 10 DME arc round MSV counter-clockwise from R-100 to R-030 at 4,500 ft, then inbound to MSV. Wind about ${ARC_WIND} at 4,500 ft.`,
        `L’arc de 10 DME autour de MSV, sens inverse, du R-100 au R-030 à 4 500 ft, puis vers MSV. Vent d’environ ${ARC_WIND} à 4 500 ft.`,
      ),
      [
        L(
          "10° behind the wingtip: turn 10°.",
          "10° derrière le bout d’aile : 10° de virage.",
        ),
        L(
          "Turn inbound at R-035: one dot on the HSI.",
          "Virez au R-035 : un point au HSI.",
        ),
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
        "The briefing of the DME arc lesson: the 10° rhythm on the RMI, one leg flown, the lead radial on the HSI, then fly it.",
        "Le briefing de la leçon arc DME : le rythme de 10° au RMI, un segment volé, le radial d’anticipation au HSI, puis le vol.",
      ),
      tags: ["ifr", "dme", "arc", "radionav"],
      minutes: 12,
    },
    steps,
    arcScenes(),
  );
}
