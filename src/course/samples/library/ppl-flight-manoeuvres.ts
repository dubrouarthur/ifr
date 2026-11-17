// Ground school — course library (A1): straight and level, climbing, descending and turning (LAPL · PPL, EASA
// Part-FCL flight exercises 6 to 9). Attitude plus power gives performance, shown on the live six instruments of
// the C172S: the student slows down in level flight with the power, opens the throttle hands off and watches the
// trimmed aircraft climb, rolls into a 30° turn and reads the load factor and the stall speed rise, then flies
// each manoeuvre in the full simulator. Four parts: level, climb and descent, turns, recap and quiz.
// Sources: FAA-H-8083-3C Airplane Flying Handbook (AFH) ch. 3 "Basic Flight Maneuvers" (the four fundamentals,
// level-off leads, turns, common errors) and ch. 4 "Energy Management"; FAA-H-8083-25C PHAK ch. 5 (load factor,
// stall speed in a turn); Cessna 172S POH section 3 (best glide 68 KIAS), section 4 (Vx 62, Vy 74, en-route climb
// 75–85 KIAS) and section 5 (rate of climb, stall speeds 48 / 52 / 57 / 68 KIAS at 0 / 30 / 45 / 60° of bank,
// flaps up, 2,550 lb); EASA Part-FCL AMC1 FCL.210.A (exercises 6 to 9) and AMC1 FCL.235 (PPL skill test
// tolerances: height ±150 ft, heading ±10°, speed ±15 kt).
import type { Course, SimScene, SlideCanvas, Step } from "../../types";
import { DIAGRAM, G as GOAL, INST, L, course, livenAll, slideStep, step } from "../kit";
import { toolSlides } from "../toolSlides";
import { toolDef, toolTaskData } from "../../tools/index";
import { G } from "../navSlides";
import {
  GAUGE,
  S,
  compareStep,
  coverStep,
  flyStep,
  mcq,
  mistakesStep,
  quizStep,
  stepsStep,
} from "../briefings/kit";
import { SIX, panelNotesStep, recapStep, sceneA1, sixMark } from "./kit-a1";
import {
  finalQuizStep,
  flySceneStep,
  handsOnStep,
  objectivesStep,
  partStep,
} from "./kit-ppl-flight-manoeuvres";

export const PPL_FLIGHT_MANOEUVRES_ID = "sample-lib-ppl-flight-manoeuvres";

/** The practice area (curriculum.ts OPEN): 18 NM south-south-east of Port Ardent, clear of everything. */
const AREA = { fix: "PARD", radial: 160, distNm: 18 };
const AFH = "FAA-H-8083-3C AFH";

function scenes(): Record<string, SimScene> {
  const at = (altFt: number, iasKt: number, more: object = {}) => ({
    pos: AREA,
    altFt,
    hdg: 270,
    iasKt,
    ...more,
  });
  return {
    "fm.level": sceneA1("fm.level", at(3000, 100), {
      label: "Straight and level · 3,000 ft · heading 270 · 100 KIAS",
    }),
    // the live slides: heading and altitude held, so the instruments stay on the numbers the slide names
    "fm.cruise": sceneA1("fm.cruise", at(3000, 100), {
      label: "Cruise · 3,000 ft · heading 270 · 100 KIAS",
      controls: { throttle: 0.57, trim: -0.3, flaps: 0 },
      ap: { engaged: true, lat: "HDG", vert: "ALT", hdg: 270, alt: 3000 },
    }),
    "fm.high": sceneA1("fm.high", at(3080, 96, { pitch: 3.5, vsFpm: 200 }), {
      label: "Nose high · 3,080 ft and climbing · 96 KIAS",
    }),
    "fm.climb": sceneA1("fm.climb", at(3000, 74, { pitch: 10, vsFpm: 650 }), {
      label: "Climb at Vy · 74 KIAS · full throttle",
      controls: { throttle: 1, trim: 0.05, flaps: 0 },
    }),
    "fm.vx": sceneA1("fm.vx", at(1500, 62, { pitch: 12, vsFpm: 550 }), {
      label: "Climb at Vx · 62 KIAS · full throttle",
      controls: { throttle: 1, trim: 0.2, flaps: 0 },
    }),
    "fm.descent": sceneA1(
      "fm.descent",
      at(6500, 90, { pitch: 0.5, vsFpm: -500 }),
      {
        label: "Powered descent · 90 KIAS · about 500 ft/min",
        controls: { throttle: 0.3, trim: -0.17, flaps: 0 },
        ap: {
          engaged: true,
          lat: "HDG",
          vert: "VS",
          hdg: 270,
          alt: 2000,
          vs: -500,
        },
      },
    ),
    "fm.bank30": sceneA1("fm.bank30", at(3000, 100, { bank: 30 }), {
      label: "Level turn · 30° of bank · 100 KIAS",
    }),
    "fm.fly": sceneA1("fm.fly", at(3000, 100), {
      label: "Straight and level in the cockpit · 3,000 ft · 270 · 100 KIAS",
    }),
  };
}

const F6: [number, number, number, number] = [G.left, 192, 960, 720];
/** A marker position in the clear corner of a gauge of the six-pack frame F6. */
function mark(
  gauge: "asi" | "ai" | "alt" | "tc" | "hsi" | "vsi",
  corner: "tl" | "tr" | "bl" | "br" = "tl",
): [number, number] {
  const m = sixMark(1, gauge, F6, { corner });
  return [m.frame.x + 28, m.frame.y + 28];
}

/**
 * The load-factor tool (course/tools/defs/turn.ts) with its own task: find the bank that doubles the apparent
 * weight. n = 1 / cos φ, so 2 g at 60° whatever the speed and the weight (FAA PHAK ch. 5); the stall speed then
 * grows by √2 (POH C172S sect. 5: 48 → 68 KIAS flaps up, 2,550 lb).
 */
function loadToolStep(id: string): Step {
  const ready = toolSlides().find((t) => t.tool === "loadFactor");
  const def = toolDef("loadFactor");
  if (!ready || !def) throw new Error("the load-factor tool is missing");
  const slide = JSON.parse(JSON.stringify(ready.slide)) as SlideCanvas;
  const title = L("Your turn: find the bank of 2 g", "À vous : trouvez l’inclinaison de 2 g");
  slide.blocks.forEach((b, i) => {
    b.id = b.kind === "tool" ? `${id}.tool` : `${id}.b${i}`;
    if (b.kind === "tool") b.task = toolTaskData(def);
    if (b.kind === "text" && b.style === "eyebrow") b.text = L("Load factor", "Facteur de charge");
    if (b.kind === "text" && b.style === "title") b.text = title;
  });
  return slideStep(
    id,
    title,
    slide,
    [
      {
        t: "text",
        text: L(
          "Your turn: move the bank until the load factor reads 2 g. In a level turn the load factor is 1 ÷ cos(bank) and the stall speed grows as its square root: wings level 1 g and 48 KIAS, 30° 1.15 g and 52 KIAS, 45° 1.41 g and 57 KIAS, 60° 2 g and 68 KIAS, flaps up at 2,550 lb, whatever the speed (FAA PHAK ch. 5; the training aircraft’s flight manual, section 5). Steep turns near the ground eat the margin.",
          "À vous : inclinez jusqu’à lire un facteur de charge de 2 g. En virage en palier, le facteur de charge vaut 1 ÷ cos(inclinaison) et la vitesse de décrochage croît comme sa racine carrée : ailes à plat 1 g et 48 KIAS, 30° 1,15 g et 52 KIAS, 45° 1,41 g et 57 KIAS, 60° 2 g et 68 KIAS, volets rentrés à 2 550 lb, quelle que soit la vitesse (FAA PHAK ch. 5 ; manuel de vol de l’avion-école, section 5). Un virage serré près du sol mange la marge.",
        ),
      },
    ],
    { section: "picture", minutes: 2 },
  );
}

/** The presenter's notes (audit §22): what to say, the question to ask the room, the usual mistake. */
const NOTES: Record<string, ReturnType<typeof L>> = {
  "fm-cover": L(
    "Say the one idea of the day: attitude plus power gives the performance. Everything else today is that idea applied four times.",
    "Dites l’idée du jour : assiette plus puissance donnent la performance. Tout le reste de la séance applique cette idée quatre fois.",
  ),
  "fm-goals": L(
    "Read the four tolerances aloud and ask which one feels hardest. Come back to that answer at the end.",
    "Lisez les quatre tolérances à voix haute et demandez laquelle paraît la plus dure. Revenez à cette réponse à la fin.",
  ),
  "fm-hook": L(
    "Have everyone commit to an answer first. Most expect the aircraft to accelerate; the trim holds a speed, so the extra power becomes a climb.",
    "Faites choisir une réponse à chacun d’abord. La plupart s’attendent à une accélération ; le compensateur tient une vitesse, la puissance en plus devient de la montée.",
  ),
  "fm-p1": L(
    "Part 1: straight and level. Ask: which two things do you set, and which two do you read?",
    "Partie 1 : le palier. Demandez : quelles sont les deux choses que l’on règle, et les deux que l’on lit ?",
  ),
  "fm-apf": L(
    "Point at the live altitude and speed: they move only because attitude or power moved. Usual mistake: chasing the altimeter instead of setting an attitude.",
    "Montrez l’altitude et la vitesse en direct : elles ne bougent que parce que l’assiette ou la puissance a bougé. Erreur habituelle : courir après l’altimètre au lieu d’afficher une assiette.",
  ),
  "fm-slow": L(
    "Let a student do it on the projector: four presses on −, then wait. Ask the room why the nose ends up higher at 80 kt.",
    "Faites-le faire par un élève sur le projecteur : quatre appuis sur −, puis attendre. Demandez à la salle pourquoi le nez finit plus haut à 80 kt.",
  ),
  "fm-correct": L(
    "Too high and too slow means the nose is too high: one cause, one correction. Usual mistake: reaching for the power or the trim first.",
    "Trop haut et trop lent, c’est le nez trop haut : une cause, une correction. Erreur habituelle : toucher d’abord à la puissance ou au compensateur.",
  ),
  "fm-fly-level": L(
    "In the simulator: two minutes level. Watch the altimeter tolerance, and whether the student trims once the attitude is set.",
    "Au simulateur : deux minutes de palier. Regardez la tolérance d’altitude, et si l’élève compense une fois l’assiette affichée.",
  ),
  "fm-p2": L(
    "Part 2: climb and descent. Ask: in a descent, what sets the rate, and what sets the speed?",
    "Partie 2 : montée et descente. Demandez : en descente, qu’est-ce qui règle le taux, et qu’est-ce qui règle la vitesse ?",
  ),
  "fm-power": L(
    "The hook question, now on the live instruments: full power, hands off. Let the class watch the altimeter climb while the speed stays near 100 kt.",
    "La question du début, cette fois sur les instruments en direct : plein gaz, mains libres. Laissez la classe regarder l’altimètre monter pendant que la vitesse reste vers 100 kt.",
  ),
  "fm-climb": L(
    "Say the order out loud together: power, attitude, trim. Remind them of right rudder with full power, ball in the middle.",
    "Dites l’ordre ensemble à voix haute : puissance, assiette, compensateur. Rappelez le pied à droite à plein gaz, bille au milieu.",
  ),
  "fm-vxvy": L(
    "Ask: you have a tree line at the end of the runway, which speed? Then: and once it is behind you? Usual mistake: staying at Vx too long (engine cooling).",
    "Demandez : une rangée d’arbres en bout de piste, quelle vitesse ? Puis : et une fois passée ? Erreur habituelle : rester trop longtemps à Vx (refroidissement du moteur).",
  ),
  "fm-leveloff": L(
    "Have them work out 10 % of 700 ft/min before showing the answers. Usual mistake: starting at the target altitude, which overshoots it.",
    "Faites calculer 10 % de 700 ft/min avant de montrer les réponses. Erreur habituelle : commencer à l’altitude visée, ce qui la dépasse.",
  ),
  "fm-descent": L(
    "Point at the vario while you reduce power: the rate changes, the speed stays with the attitude. Ask how early to start the level-off (100 to 150 ft).",
    "Montrez le vario pendant que la puissance baisse : le taux change, la vitesse reste avec l’assiette. Demandez quand commencer la mise en palier (100 à 150 ft avant).",
  ),
  "fm-rate-calc": L(
    "Let them do the calculation on paper first; the numbers change at each try. Ask one student to explain the method, not the result.",
    "Laissez faire le calcul sur papier d’abord ; les chiffres changent à chaque essai. Faites expliquer la méthode par un élève, pas le résultat.",
  ),
  "fm-fly-climb": L(
    "In the simulator: climb, level off, descend. Watch the order of the hands at the level-off: attitude first, then power, then trim.",
    "Au simulateur : montée, palier, descente. Regardez l’ordre des gestes à la mise en palier : l’assiette d’abord, puis la puissance, puis le compensateur.",
  ),
  "fm-p3": L(
    "Part 3: turns. Ask: in a level turn, why does the lift have to be greater than the weight?",
    "Partie 3 : les virages. Demandez : en virage en palier, pourquoi la portance doit-elle être plus grande que le poids ?",
  ),
  "fm-turn-predict": L(
    "Most say the stall speed stays at 48 kt. Holding altitude loads the wing: about 52 kt at 30° of bank.",
    "La plupart pensent que le décrochage reste à 48 kt. Tenir l’altitude charge l’aile : environ 52 kt à 30° d’inclinaison.",
  ),
  "fm-turn": L(
    "Have the student say when to release: 15° before the heading, half the bank. Usual mistake: releasing on the heading and overshooting it.",
    "Faites dire à l’élève quand relâcher : 15° avant le cap, la moitié de l’inclinaison. Erreur habituelle : relâcher sur le cap et le dépasser.",
  ),
  "fm-load": L(
    "Let the room call out a guess first (most say 45°). The student moves the bank until the readout says 2 g: 60°, whatever the speed or the weight. Then ask what that does to the stall speed (×1.41).",
    "Faites d’abord annoncer un chiffre à la salle (la plupart disent 45°). L’élève incline jusqu’à lire 2 g : 60°, quelles que soient la vitesse et la masse. Demandez ensuite ce que cela fait à la vitesse de décrochage (×1,41).",
  ),
  "fm-turn-how": L(
    "Walk through the four steps with your hands. Ask what the turn coordinator shows (rate of turn, not bank).",
    "Déroulez les quatre étapes avec les mains. Demandez ce que montre l’indicateur de virage (le taux de virage, pas l’inclinaison).",
  ),
  "fm-bank-calc": L(
    "Let them find the bank for a standard rate turn on paper first. Then check the rule of thumb (speed ÷ 10 + 7) against the exact result.",
    "Faites trouver l’inclinaison du taux standard sur papier d’abord. Puis comparez la règle pratique (vitesse ÷ 10 + 7) au résultat exact.",
  ),
  "fm-fly-turns": L(
    "In the simulator: turns onto headings. Watch the altitude in the turn: a little back pressure, and the roll-out started early.",
    "Au simulateur : virages vers des caps. Regardez l’altitude en virage : un peu de traction, et la sortie commencée tôt.",
  ),
  "fm-mistakes": L(
    "Ask who has done each one in flight (most have). For each, ask for the correction before showing it.",
    "Demandez qui a déjà fait chacune en vol (la plupart). Pour chacune, faites trouver la correction avant de la montrer.",
  ),
  "fm-recap": L(
    "Ask the three numbers back from memory before showing them. Then come back to the tolerance they found hardest at the start.",
    "Faites redonner les trois chiffres de mémoire avant de les montrer. Puis revenez à la tolérance jugée la plus dure au début.",
  ),
  "fm-quiz": L(
    "Let everyone answer on their own; go through the wrong answers together, each one is explained.",
    "Laissez chacun répondre seul ; reprenez ensemble les mauvaises réponses, chacune est expliquée.",
  ),
};

export function pplFlightManoeuvresCourse(): Course {
  const steps: Step[] = [
    // 1 ------------------------------------------------------------------ cover
    coverStep(
      "fm-cover",
      L(
        "Straight and level, climbs, descents, turns",
        "Palier, montée, descente et virages",
      ),
      {
        eyebrow: L(
          "LAPL · PPL · Exercises 6 to 9",
          "LAPL · PPL · Exercices 6 à 9",
        ),
        main: L("The four basic manoeuvres", "Les quatre manœuvres de base"),
        sub: L(
          "level, climb, descent, turn",
          "palier, montée, descente, virage",
        ),
        lead: L(
          "Attitude plus power gives performance: see it, take the controls, then fly it.",
          "Assiette plus puissance donnent la performance : voyez-le, prenez les commandes, puis faites-le en vol.",
        ),
        meta: L(
          "26 steps · about 60 min · FAA AFH ch. 3 · C172S POH",
          "26 étapes · environ 60 min · FAA AFH ch. 3 · POH C172S",
        ),
        hero: [
          INST(
            SIX,
            L(
              "The C172S six instruments in level flight, 3,000 ft, heading 270, 100 KIAS",
              "Les six instruments du C172S en palier, 3 000 ft, cap 270, 100 KIAS",
            ),
            984,
            232,
            816,
            612,
            { id: "fm-cover.six", scene: "fm.cruise", mode: "live" },
          ),
        ],
        scene: "fm.cruise",
        reader: L(
          "Straight and level, climbing, descending and turning: the four basic manoeuvres of the LAPL and PPL syllabus (EASA Part-FCL exercises 6 to 9). Attitude plus power gives performance: you see it on the live six instruments of the C172S, take the controls on the slide three times, then fly each manoeuvre in the simulator.",
          "Palier, montée, descente et virages : les quatre manœuvres de base du programme LAPL et PPL (exercices 6 à 9 du Part-FCL de l’EASA). Assiette plus puissance donnent la performance : vous le voyez sur les six instruments du C172S en direct, vous prenez trois fois les commandes sur la diapositive, puis vous pilotez chaque manœuvre dans le simulateur.",
        ),
      },
    ),
    // 2 ------------------------------------------------------------------ objectives
    objectivesStep("fm-goals", {
      eyebrow: L("Objectives", "Objectifs"),
      title: L("By the end, you will be able to", "À la fin, vous saurez"),
      objectives: [
        L(
          "Hold straight and level flight within ±150 ft, ±10° and ±15 kt.",
          "Tenir le palier rectiligne à ±150 ft, ±10° et ±15 kt.",
        ),
        L(
          "Enter a climb at Vy, 74 KIAS, and level off within ±100 ft.",
          "Entrer en montée à Vy, 74 KIAS, et sortir en palier à ±100 ft.",
        ),
        L(
          "Descend at 500 ft/min at a chosen speed, then level off on the altitude.",
          "Descendre à 500 ft/min à vitesse choisie, puis reprendre le palier à l’altitude.",
        ),
        L(
          "Turn onto a heading within ±10°, and give the stall speed at 30° of bank.",
          "Virer vers un cap à ±10°, et donner la vitesse de décrochage à 30° d’inclinaison.",
        ),
      ],
      proofs: [
        {
          n: S("3"),
          text: L(
            "times at the controls, on the slide",
            "prises des commandes sur la diapositive",
          ),
        },
        {
          n: S("2"),
          text: L(
            "calculations, new numbers each time",
            "calculs, de nouveaux chiffres à chaque fois",
          ),
        },
        {
          n: S("10"),
          text: L(
            "questions, every wrong answer explained",
            "questions, chaque erreur expliquée",
          ),
        },
        {
          n: S("3"),
          text: L("flights in the simulator", "vols dans le simulateur"),
          color: "path",
        },
      ],
      tip: L(
        "Tolerances of the PPL skill test (EASA AMC1 FCL.235). The simulator marks its lessons a little tighter: ±100 ft, ±10°, ±10 kt.",
        "Tolérances du test pratique PPL (EASA AMC1 FCL.235). Le simulateur note ses leçons un peu plus serré : ±100 ft, ±10°, ±10 kt.",
      ),
    }),
    // 3 ------------------------------------------------------------------ the hook: a prediction
    quizStep("fm-hook", {
      eyebrow: L("Predict", "Prédisez"),
      title: L(
        "Full throttle, hands off: what happens?",
        "Plein gaz, mains libres : que se passe-t-il ?",
      ),
      visual: [
        INST(
          SIX,
          L(
            "Six instruments: level at 3,000 ft, heading 270, 100 KIAS, trimmed",
            "Six instruments : palier à 3 000 ft, cap 270, 100 KIAS, avion compensé",
          ),
          G.left,
          336,
          768,
          576,
          { id: "fm-hook.six", scene: "fm.level" },
        ),
      ],
      quiz: mcq(
        L(
          "Trimmed and level at 100 KIAS. You open the throttle fully and touch nothing else.",
          "Compensé en palier à 100 KIAS. Vous mettez plein gaz et ne touchez à rien d’autre.",
        ),
        [
          {
            text: L("It accelerates in level flight", "Il accélère en palier"),
            why: L(
              "Not for long: the trim holds a speed, not an altitude.",
              "Pas longtemps : le compensateur tient une vitesse, pas une altitude.",
            ),
          },
          {
            text: L(
              "It climbs at about the same speed",
              "Il monte, à peu près à la même vitesse",
            ),
            why: L(
              "Right: the trimmed speed stays, the extra power becomes a climb.",
              "Juste : la vitesse compensée reste, la puissance en plus devient de la montée.",
            ),
          },
          {
            text: L("The nose drops", "Le nez baisse"),
            why: L(
              "On this aircraft more power raises the nose, it does not lower it.",
              "Sur cet avion, plus de puissance fait monter le nez, pas l’inverse.",
            ),
          },
        ],
        1,
        L(
          "A trimmed aircraft keeps its speed. Change the power and the flight path changes: you will try it in part 2.",
          "Un avion compensé garde sa vitesse. Changez la puissance : c’est la trajectoire qui change. Vous l’essaierez en partie 2.",
        ),
      ),
      foot: L(`${AFH} ch. 3 · climbs`, `${AFH} ch. 3 · montées`),
      reader: L(
        "The opening question. Trimmed and level at 100 KIAS, you open the throttle fully and touch nothing else: the aircraft climbs at about the same speed. The trim holds a speed; the extra power changes the flight path (FAA AFH ch. 3).",
        "La question d’ouverture. Compensé en palier à 100 KIAS, vous mettez plein gaz sans toucher à rien d’autre : l’avion monte à peu près à la même vitesse. Le compensateur tient une vitesse ; la puissance en plus change la trajectoire (FAA AFH ch. 3).",
      ),
    }),

    // ==================================================================== part 1: straight and level
    // 4
    partStep(
      "fm-p1",
      1,
      L("Straight and level", "Le palier"),
      L(
        "One attitude and one power setting give one speed at a constant altitude. Find them, then trim.",
        "Une assiette et une puissance donnent une vitesse à altitude constante. Trouvez-les, puis compensez.",
      ),
    ),
    // 5 ------------------------------------------------------------------ attitude + power = performance
    panelNotesStep("fm-apf", {
      eyebrow: L(
        "Attitude + power = performance",
        "Assiette + puissance = performance",
      ),
      title: L(
        "You set two things, you read the rest",
        "Vous réglez deux choses, vous lisez le reste",
      ),
      lead: L(
        "Live values from the six instruments.",
        "Valeurs lues en direct sur les six instruments.",
      ),
      view: SIX,
      alt: L(
        "The six instruments live, level at 3,000 ft and 100 KIAS",
        "Les six instruments en direct, en palier à 3 000 ft et 100 KIAS",
      ),
      scene: "fm.cruise",
      mode: "live",
      frame: F6,
      marks: [mark("ai"), mark("alt"), mark("asi")],
      rows: [
        {
          heading: L(
            "You set: attitude and power",
            "Vous réglez : assiette et puissance",
          ),
          body: L(
            "The nose on the horizon, the throttle.",
            "Le nez sur l’horizon, la manette des gaz.",
          ),
        },
        {
          heading: L("You read: the altitude", "Vous lisez : l’altitude"),
          body: L("Altitude {{value}}", "Altitude {{value}}"),
          readout: "alt",
        },
        {
          heading: L("You read: the airspeed", "Vous lisez : la vitesse"),
          body: L("Airspeed {{value}}", "Vitesse {{value}}"),
          readout: "ias",
        },
      ],
      foot: L(
        `${AFH} ch. 3 · the four fundamentals`,
        `${AFH} ch. 3 · les quatre fondamentaux`,
      ),
      reader: L(
        "Attitude plus power gives performance. You set two things: the attitude (the nose against the horizon, shown here by the attitude indicator) and the power (the throttle). The altimeter and the airspeed indicator only show the result. In visual flight the attitude is set outside, on the natural horizon; the instruments confirm it (FAA AFH ch. 3).",
        "Assiette plus puissance donnent la performance. Vous réglez deux choses : l’assiette (le nez par rapport à l’horizon, que montre ici l’horizon artificiel) et la puissance (la manette des gaz). L’altimètre et l’anémomètre ne font que montrer le résultat. En vol à vue, l’assiette se règle dehors, sur l’horizon naturel ; les instruments la confirment (FAA AFH ch. 3).",
      ),
    }),
    // 6 ------------------------------------------------------------------ your turn: slow down in level flight
    handsOnStep("fm-slow", {
      title: L("Slow to 80 kt, level", "Ralentissez à 80 kt en palier"),
      control: L(
        "Power: − and +, 5 % per press.",
        "Puissance : − et +, 5 % par appui.",
      ),
      action: L(
        "Press − four times: 61 % to 41 %. Then wait.",
        "Appuyez 4 fois sur − : de 61 % à 41 %. Puis attendez.",
      ),
      ends: L(
        "After 10 s between 75 and 85 kt: about a minute.",
        "Après 10 s entre 75 et 85 kt : une minute environ.",
      ),
      checks: [
        {
          text: L("Speed 80 kt (75 to 85)", "Vitesse 80 kt (75 à 85)"),
          readout: "ias",
        },
        {
          text: L("Altitude 3,000 ft (±100 ft)", "Altitude 3 000 ft (±100 ft)"),
          readout: "alt",
        },
      ],
      note: L(
        "The altitude is held for you: watch the nose rise as the speed falls.",
        "L’altitude est tenue pour vous : regardez le nez monter quand la vitesse baisse.",
      ),
      alt: L(
        "Live six instruments, level at 3,000 ft, heading 270, 100 KIAS",
        "Six instruments en direct, palier à 3 000 ft, cap 270, 100 KIAS",
      ),
      scene: "fm.level",
      prompt: L(
        "Your turn: slow to 80 kt in level flight, with the power only",
        "À vous : ralentissez à 80 kt en palier, avec la puissance seule",
      ),
      controls: ["power"],
      assist: { holdAlt: true },
      goal: {
        all: [GOAL.ias(75, 85), GOAL.alt(2900, 3100)],
        holdS: 10,
        graded: false,
        success: L(
          "80 kt, level: less power, and a nose about 3° higher than at 100 kt.",
          "80 kt en palier : moins de puissance, et un nez environ 3° plus haut qu’à 100 kt.",
        ),
      },
      hint: L(
        "Four presses on −: 41 %. Then wait about a minute: the speed falls slowly.",
        "Quatre appuis sur − : 41 %. Puis attendez une minute environ : la vitesse baisse lentement.",
      ),
      foot: L(
        `${AFH} ch. 3 · straight-and-level flight`,
        `${AFH} ch. 3 · vol rectiligne en palier`,
      ),
      reader: L(
        "Your turn on the live six instruments. Control: the power, − and +, 5 % per press. Press − four times, from 61 % to 41 %, then wait: the altitude is held for you with the pitch, so the nose rises as the speed falls. It ends after 10 seconds between 75 and 85 kt at 3,000 ft ±100 ft, about a minute. At 80 kt the same altitude needs less power and a nose about 3° higher (FAA AFH ch. 3).",
        "À vous sur les six instruments en direct. Commande : la puissance, − et +, 5 % par appui. Appuyez 4 fois sur −, de 61 % à 41 %, puis attendez : l’altitude est tenue pour vous à l’assiette, le nez monte donc quand la vitesse baisse. C’est réussi après 10 secondes entre 75 et 85 kt à 3 000 ft ±100 ft, en une minute environ. À 80 kt, la même altitude demande moins de puissance et un nez environ 3° plus haut (FAA AFH ch. 3).",
      ),
    }),
    // 7 ------------------------------------------------------------------ quiz: which control for which error
    quizStep("fm-correct", {
      eyebrow: L("Question", "Question"),
      title: L(
        "High and slow: what first?",
        "Trop haut et trop lent : quoi d’abord ?",
      ),
      visual: [
        INST(
          SIX,
          L(
            "Six instruments: wings level, 3,080 ft and climbing, 96 KIAS, nose a little high",
            "Six instruments : ailes à plat, 3 080 ft en montée, 96 KIAS, nez un peu haut",
          ),
          G.left,
          336,
          768,
          576,
          { id: "fm-correct.six", scene: "fm.high" },
        ),
      ],
      quiz: mcq(
        L(
          "Target 3,000 ft and 100 KIAS. You read 3,080 ft, climbing, 96 KIAS. Your first move?",
          "Objectif 3 000 ft et 100 KIAS. Vous lisez 3 080 ft, en montée, 96 KIAS. Premier geste ?",
        ),
        [
          {
            text: L(
              "Lower the nose a little, then trim",
              "Baisser un peu le nez, puis compenser",
            ),
            why: L(
              "Right: the nose is too high. Altitude and speed come back together.",
              "Juste : le nez est trop haut. Altitude et vitesse reviennent ensemble.",
            ),
          },
          {
            text: L("Reduce the power", "Réduire la puissance"),
            why: L(
              "The speed is already low: less power makes it worse.",
              "La vitesse est déjà faible : moins de puissance l’aggrave.",
            ),
          },
          {
            text: L("Trim nose down", "Compenser à piquer"),
            why: L(
              "Trim removes a force, it does not fly the aircraft: attitude first.",
              "Le compensateur annule un effort, il ne pilote pas : l’assiette d’abord.",
            ),
          },
        ],
        0,
        L(
          "High and slow, or low and fast: an attitude error. High and fast, or low and slow: a power error.",
          "Haut et lent, ou bas et rapide : erreur d’assiette. Haut et rapide, ou bas et lent : erreur de puissance.",
        ),
      ),
      foot: L(
        `${AFH} ch. 4 · energy management`,
        `${AFH} ch. 4 · gestion de l’énergie`,
      ),
      reader: L(
        "80 ft high, still climbing, 4 kt slow: the nose is too high. Lower it a little, then trim; altitude and speed come back together. High and slow or low and fast is an attitude error; high and fast or low and slow is a power error (FAA AFH ch. 4, energy management).",
        "80 ft trop haut, encore en montée, 4 kt trop lent : le nez est trop haut. Baissez-le un peu, puis compensez ; l’altitude et la vitesse reviennent ensemble. Haut et lent ou bas et rapide, c’est une erreur d’assiette ; haut et rapide ou bas et lent, une erreur de puissance (FAA AFH ch. 4, gestion de l’énergie).",
      ),
    }),
    // 8 ------------------------------------------------------------------ fly it: two minutes straight and level
    flySceneStep("fm-fly-level", {
      title: L(
        "Fly it: two minutes straight and level",
        "En vol : deux minutes de palier",
      ),
      scene: "fm.fly",
      durationS: 120,
      brief: L(
        "In the full cockpit: 3,000 ft, heading 270, 100 KIAS. Hold them for two minutes; the flight then stops by itself.",
        "Dans le cockpit complet : 3 000 ft, cap 270, 100 KIAS. Tenez-les deux minutes ; le vol s’arrête ensuite tout seul.",
      ),
      keys: [
        L(
          "Set the attitude, wait, then trim until the yoke is light",
          "Affichez l’assiette, attendez, puis compensez jusqu’à un manche léger",
        ),
        L(
          "Hands off, it climbs slowly and drifts left: correct early, with small inputs",
          "Sans correction, l’avion monte doucement et part à gauche : corrigez tôt, par petites touches",
        ),
        L(
          "PPL test tolerances: ±150 ft, ±10°, ±15 kt",
          "Tolérances du test PPL : ±150 ft, ±10°, ±15 kt",
        ),
      ],
      criteria: [
        {
          id: "alt",
          label: L("Altitude 3,000 ft ±150 ft", "Altitude 3 000 ft ±150 ft"),
          check: GOAL.alt(2850, 3150),
          trace: "alt",
        },
        {
          id: "hdg",
          label: L("Heading 270 ±10°", "Cap 270 ±10°"),
          check: GOAL.heading(270, 10),
          trace: "hdg",
        },
        {
          id: "ias",
          label: L("Speed 100 kt ±15 kt", "Vitesse 100 kt ±15 kt"),
          check: GOAL.ias(85, 115),
          trace: "ias",
        },
      ],
      debrief: L(
        "Look at the altitude trace: slow waves mean you are chasing the altimeter. Set the attitude, wait, then trim.",
        "Regardez la trace d’altitude : de lentes vagues, c’est que vous courez après l’altimètre. Affichez l’assiette, attendez, puis compensez.",
      ),
      minutes: 4,
    }),

    // ==================================================================== part 2: climbing and descending
    // 9
    partStep(
      "fm-p2",
      2,
      L("Climbing and descending", "Montée et descente"),
      L(
        "Power sets the flight path, attitude sets the speed: see it first, then fly it.",
        "La puissance règle la trajectoire, l’assiette règle la vitesse : voyez-le, puis pilotez-le.",
      ),
    ),
    // 10 ----------------------------------------------------------------- your turn: full throttle, hands off
    handsOnStep("fm-power", {
      title: L("Full throttle, hands off", "Plein gaz, mains libres"),
      control: L(
        "Power only: + adds 5 % per press.",
        "Puissance seule : + ajoute 5 % par appui.",
      ),
      action: L(
        "Press + up to 100 %. Correct nothing: watch.",
        "Appuyez sur + jusqu’à 100 %. Ne corrigez rien : regardez.",
      ),
      ends: L(
        "When you pass 3,300 ft: about 40 s.",
        "Au passage de 3 300 ft : 40 s environ.",
      ),
      checks: [
        {
          text: L("Altitude 3,300 ft or more", "Altitude 3 300 ft ou plus"),
          readout: "alt",
        },
        {
          text: L(
            "Speed still 100 kt (85 to 115)",
            "Vitesse restée à 100 kt (85 à 115)",
          ),
          readout: "ias",
        },
      ],
      note: L(
        // what the simulator shows hands off at full throttle (measured: heading stays on 270, ball centred)
        "No help here: the nose rises by itself, the vertical speed goes positive, the speed stays close to 100 kt.",
        "Aucune aide ici : le nez monte tout seul, le variomètre passe en positif, la vitesse reste proche de 100 kt.",
      ),
      alt: L(
        "Live six instruments, level at 3,000 ft, 100 KIAS, trimmed",
        "Six instruments en direct, palier à 3 000 ft, 100 KIAS, avion compensé",
      ),
      scene: "fm.level",
      prompt: L(
        "Your turn: open the throttle fully and touch nothing else",
        "À vous : mettez plein gaz et ne touchez à rien d’autre",
      ),
      controls: ["power"],
      goal: {
        all: [GOAL.alt(3300, 6000), GOAL.ias(85, 115)],
        // the end: both rows true together for 3 s once 3,300 ft is passed (the climb is established)
        holdS: 3,
        graded: false,
        success: L(
          "300 ft gained at about the same speed: the extra power became a climb.",
          "300 ft gagnés à peu près à la même vitesse : la puissance en plus est devenue de la montée.",
        ),
      },
      hint: L(
        "Eight presses on +: from 61 % to 100 %. Then only watch.",
        "Huit appuis sur + : de 61 % à 100 %. Ensuite, regardez seulement.",
      ),
      foot: L(
        `${AFH} ch. 3 · climbs, left-turning tendencies`,
        `${AFH} ch. 3 · montées, effets moteur`,
      ),
      reader: L(
        "Your turn, with no help: the aircraft flies as it is trimmed. Control: the power only, + adds 5 % per press. Press + up to 100 % and correct nothing. The nose rises by itself, the vertical speed goes positive and the airspeed stays close to 100 kt. It ends when you pass 3,300 ft, in about 40 seconds, with the speed still between 85 and 115 kt. In a real aircraft the nose also yaws to the left at full power: the left-turning tendencies of the engine and propeller, which you correct with right rudder (FAA AFH ch. 3).",
        "À vous, sans aucune aide : l’avion vole tel qu’il est compensé. Commande : la puissance seule, + ajoute 5 % par appui. Appuyez sur + jusqu’à 100 % et ne corrigez rien. Le nez monte tout seul, le variomètre devient positif et la vitesse reste proche de 100 kt. C’est réussi au passage de 3 300 ft, en 40 secondes environ, la vitesse restant entre 85 et 115 kt. Dans un vrai avion, le nez part aussi à gauche à pleine puissance : ce sont les effets moteur et hélice, que vous corrigez du pied à droite (FAA AFH ch. 3).",
      ),
    }),
    // 11 ----------------------------------------------------------------- entering the climb, levelling off
    stepsStep("fm-climb", {
      eyebrow: L(
        "Into the climb, then out of it",
        "Entrer en montée, puis en sortir",
      ),
      title: L("Power, attitude, trim", "Puissance, assiette, compensateur"),
      rows: [
        {
          heading: L("Power: full throttle", "Puissance : plein gaz"),
          small: L(
            "right rudder: keep the ball centred",
            "pied à droite : gardez la bille au milieu",
          ),
        },
        {
          heading: L("Attitude: raise the nose", "Assiette : cabrez"),
          small: L(
            "until the speed settles on 74 KIAS, Vy",
            "jusqu’à stabiliser 74 KIAS, Vy",
          ),
        },
        {
          heading: L("Trim", "Compensez"),
          small: L(
            "until the yoke holds the speed alone",
            "jusqu’à ce que le manche tienne seul",
          ),
        },
        {
          heading: L(
            "Level off: attitude first",
            "Palier : l’assiette d’abord",
          ),
          small: L(
            "10 % of the climb rate early, then power, trim",
            "10 % du vario avant, puis puissance, compensateur",
          ),
        },
      ],
      visual: [
        INST(
          SIX,
          L(
            "Six instruments in a climb at Vy: 74 KIAS, nose up, about 650 ft/min",
            "Six instruments en montée à Vy : 74 KIAS, nez haut, environ 650 ft/min",
          ),
          1080,
          312,
          720,
          540,
          { id: "fm-climb.six", scene: "fm.climb" },
        ),
      ],
      foot: L(
        `${AFH} ch. 3 · C172S POH sect. 4: Vy 74 KIAS`,
        `${AFH} ch. 3 · POH C172S sect. 4 : Vy 74 KIAS`,
      ),
      reader: L(
        "Entering the climb: power, attitude, trim. Full throttle, with right rudder to keep the ball centred; raise the nose until the speed settles on Vy, 74 KIAS at sea level on the C172S (POH section 4); trim. Levelling off is the reverse order: attitude first, starting about 10 % of the climb rate before the altitude (50 ft at 500 ft/min), then cruise power once the speed is back, then trim (FAA AFH ch. 3).",
        "La mise en montée : puissance, assiette, compensateur. Plein gaz, avec du pied à droite pour garder la bille au milieu ; cabrez jusqu’à stabiliser Vy, 74 KIAS au niveau de la mer sur C172S (POH section 4) ; compensez. La mise en palier se fait dans l’ordre inverse : l’assiette d’abord, en commençant environ 10 % du taux de montée avant l’altitude (50 ft à 500 ft/min), puis la puissance de croisière une fois la vitesse revenue, puis le compensateur (FAA AFH ch. 3).",
      ),
    }),
    // 12 ----------------------------------------------------------------- Vx and Vy
    compareStep("fm-vxvy", {
      eyebrow: L("Two climb speeds", "Deux vitesses de montée"),
      title: L(
        "Vx for the obstacle, Vy for the altitude",
        "Vx pour l’obstacle, Vy pour l’altitude",
      ),
      halves: [
        {
          eyebrow: L("Vx · 62 KIAS", "Vx · 62 KIAS"),
          color: "key",
          view: GAUGE("asi"),
          alt: L(
            "Airspeed indicator reading 62 KIAS",
            "Anémomètre indiquant 62 KIAS",
          ),
          scene: "fm.vx",
          rows: [
            {
              heading: L("Best angle", "Meilleure pente"),
              small: L(
                "most feet per NM",
                "le plus de ft par NM",
              ),
            },
            {
              heading: L("Briefly", "Brièvement"),
              small: L(
                "only to clear an obstacle",
                "jusqu’à l’obstacle franchi",
              ),
            },
          ],
          body: L(
            "A steeper path, but less cooling air and less margin above the stall.",
            "Une pente plus forte, mais un moteur moins refroidi et moins de marge au décrochage.",
          ),
        },
        {
          eyebrow: L("Vy · 74 KIAS", "Vy · 74 KIAS"),
          color: "nav",
          view: GAUGE("asi"),
          alt: L(
            "Airspeed indicator reading 74 KIAS",
            "Anémomètre indiquant 74 KIAS",
          ),
          scene: "fm.climb",
          rows: [
            {
              heading: L("Best rate", "Meilleur taux"),
              small: L(
                "most feet per minute",
                "le plus de ft par minute",
              ),
            },
            {
              heading: L("730 ft/min", "730 ft/min"),
              small: L("sea level, 2,550 lb", "niveau de la mer, 2 550 lb"),
            },
          ],
          body: L(
            "The normal climb. En route, 75 to 85 KIAS gives a better view ahead.",
            "La montée normale. En route, 75 à 85 KIAS dégagent mieux la vue vers l’avant.",
          ),
        },
      ],
      foot: L(
        "C172S POH sect. 4 (Vx 62, Vy 74, en-route climb 75–85 KIAS) and sect. 5 (rate of climb)",
        "POH C172S sect. 4 (Vx 62, Vy 74, montée en route 75–85 KIAS) et sect. 5 (taux de montée)",
      ),
      reader: L(
        "Two climb speeds on the C172S at sea level (POH section 4). Vx, 62 KIAS, gives the best angle: the most height for the distance flown, used briefly to clear an obstacle, because the engine is cooled less and the margin above the stall is smaller. Vy, 74 KIAS, gives the best rate: about 730 ft/min at sea level and 2,550 lb (POH section 5). En route, a climb at 75 to 85 KIAS gives a better view ahead and better cooling.",
        "Deux vitesses de montée sur C172S au niveau de la mer (POH section 4). Vx, 62 KIAS, donne la meilleure pente : le plus de hauteur pour la distance parcourue, à utiliser brièvement pour franchir un obstacle, car le moteur est moins refroidi et la marge au décrochage plus faible. Vy, 74 KIAS, donne le meilleur taux : environ 730 ft/min au niveau de la mer à 2 550 lb (POH section 5). En route, une montée à 75–85 KIAS dégage mieux la vue vers l’avant et refroidit mieux le moteur.",
      ),
    }),
    // 13 ----------------------------------------------------------------- quiz: the level-off lead
    quizStep("fm-leveloff", {
      eyebrow: L("Question", "Question"),
      title: L(
        "When do you start to level off?",
        "Quand commencer la mise en palier ?",
      ),
      quote: L(
        "Climbing at 700 ft/min to 4,500 ft.",
        "Montée à 700 ft/min vers 4 500 ft.",
      ),
      quiz: mcq(
        L(
          "At what altitude do you start lowering the nose?",
          "À quelle altitude commencez-vous à baisser le nez ?",
        ),
        [
          {
            text: L("4,430 ft", "4 430 ft"),
            why: L(
              "Right: 10 % of 700 ft/min is 70 ft of lead.",
              "Juste : 10 % de 700 ft/min, soit 70 ft d’anticipation.",
            ),
          },
          {
            text: L("4,500 ft", "4 500 ft"),
            why: L(
              "Too late: the aircraft still climbs while the nose comes down.",
              "Trop tard : l’avion monte encore pendant que le nez redescend.",
            ),
          },
          {
            text: L("4,000 ft", "4 000 ft"),
            why: L(
              "Far too early: the last 500 ft would take minutes.",
              "Bien trop tôt : les 500 derniers pieds prendraient des minutes.",
            ),
          },
        ],
        0,
        L(
          "Lead by 10 % of the vertical speed. Then attitude, power once at cruise speed, trim.",
          "Anticipez de 10 % du vario. Puis assiette, puissance une fois la vitesse de croisière revenue, compensateur.",
        ),
      ),
      foot: L(
        `${AFH} ch. 3 · levelling off from a climb`,
        `${AFH} ch. 3 · mise en palier après une montée`,
      ),
      reader: L(
        "Levelling off from a climb starts before the altitude, by about 10 % of the rate of climb: 70 ft at 700 ft/min, so at 4,430 ft for 4,500 ft. Then attitude, cruise power once the speed is back, and trim (FAA AFH ch. 3).",
        "La mise en palier après une montée commence avant l’altitude, d’environ 10 % du taux de montée : 70 ft à 700 ft/min, donc à 4 430 ft pour 4 500 ft. Puis l’assiette, la puissance de croisière une fois la vitesse revenue, et le compensateur (FAA AFH ch. 3).",
      ),
    }),
    // 14 ----------------------------------------------------------------- the powered descent, live
    panelNotesStep("fm-descent", {
      eyebrow: L("The powered descent", "La descente au moteur"),
      title: L(
        "Power for the rate, attitude for the speed",
        "La puissance pour le taux, l’assiette pour la vitesse",
      ),
      lead: L(
        "Live: power reduced, about 90 KIAS.",
        "En direct : puissance réduite, environ 90 KIAS.",
      ),
      view: SIX,
      alt: L(
        "The six instruments live in a descent: 90 KIAS, about 500 ft/min down, altimeter unwinding",
        "Les six instruments en direct en descente : 90 KIAS, environ 500 ft/min, altimètre qui défile",
      ),
      scene: "fm.descent",
      mode: "live",
      frame: F6,
      marks: [mark("vsi"), mark("asi"), mark("alt")],
      rows: [
        {
          heading: L("Power sets the rate", "La puissance règle le taux"),
          body: L("Vertical speed {{value}}", "Vario {{value}}"),
          readout: "vs",
        },
        {
          heading: L("Attitude sets the speed", "L’assiette règle la vitesse"),
          body: L("Airspeed {{value}}", "Vitesse {{value}}"),
          readout: "ias",
        },
        {
          heading: L("Lead by 100 to 150 ft", "Anticipez de 100 à 150 ft"),
          body: L(
            "Altitude {{value}}",
            "Altitude {{value}}",
          ),
          readout: "alt",
        },
      ],
      foot: L(
        `${AFH} ch. 3 · descents`,
        `${AFH} ch. 3 · descentes`,
      ),
      reader: L(
        "The powered descent, live: power reduced, 90 KIAS, about 500 ft/min. The power sets the rate of descent, the attitude sets the speed. To level off and return to cruise speed, start 100 to 150 ft before the altitude at 500 ft/min: power, attitude, then trim (FAA AFH ch. 3). With the power off, the best glide speed of the C172S is 68 KIAS at 2,550 lb: about 1.5 NM for each 1,000 ft of height (POH section 3, maximum glide).",
        "La descente au moteur, en direct : puissance réduite, 90 KIAS, environ 500 ft/min. La puissance règle le taux de descente, l’assiette règle la vitesse. Pour reprendre le palier et la vitesse de croisière, commencez 100 à 150 ft avant l’altitude à 500 ft/min : puissance, assiette, puis compensateur (FAA AFH ch. 3). Moteur réduit, la vitesse de finesse maximale du C172S est 68 KIAS à 2 550 lb : environ 1,5 NM pour 1 000 ft de hauteur (POH section 3, plané maximal).",
      ),
    }),
    // 15 ----------------------------------------------------------------- calc: the rate for a 3° path
    step(
      "fm-rate-calc",
      "calc",
      L("Descent rate on a glide path", "Le taux de descente sur un plan"),
      [],
      {
        minutes: 2,
        calc: {
          generatorId: "ifr.descentRate",
          params: { variant: "angle", gsKt: [70, 110] },
          showRuleOfThumb: true,
          stage: "none",
        },
      },
    ),
    // 16 ----------------------------------------------------------------- fly it: climb, level off, descend
    flyStep(
      "fm-fly-climb",
      "bai-climb",
      L(
        "Fly it: climb, level off, descend",
        "En vol : montée, palier, descente",
      ),
      L(
        "From 3,000 ft on heading 180: climb at 75 KIAS to 5,000 ft and level off, then descend at 500 ft/min and 90 KIAS to 3,500 ft.",
        "De 3 000 ft au cap 180 : montez à 75 KIAS jusqu’à 5 000 ft et mettez en palier, puis descendez à 500 ft/min et 90 KIAS jusqu’à 3 500 ft.",
      ),
      [
        L(
          "Climb: power, attitude, trim. Level off: attitude, power, trim",
          "Montée : puissance, assiette, compensateur. Palier : assiette, puissance, compensateur",
        ),
        L(
          "Marked on: speed ±10 kt, heading ±10°, level-off ±100 ft",
          "Noté sur : vitesse ±10 kt, cap ±10°, mise en palier ±100 ft",
        ),
      ],
      8,
    ),

    // ==================================================================== part 3: turning
    // 17
    partStep(
      "fm-p3",
      3,
      L("Turning", "Les virages"),
      L(
        "Bank, and the lift turns the aircraft. In a level turn it must also carry more than the weight.",
        "Inclinez : la portance fait virer l’avion. En palier, elle doit alors porter plus que le poids.",
      ),
    ),
    // 18 ----------------------------------------------------------------- predict: the stall speed in a turn
    quizStep("fm-turn-predict", {
      eyebrow: L("Predict", "Prédisez"),
      title: L(
        "In a 30° turn, the stall speed…",
        "En virage à 30°, la vitesse de décrochage…",
      ),
      visual: [
        INST(
          GAUGE("ai"),
          L(
            "Attitude indicator: 30° of bank to the right, nose on the horizon",
            "Horizon artificiel : 30° d’inclinaison à droite, nez sur l’horizon",
          ),
          216,
          336,
          576,
          576,
          { id: "fm-turn-predict.ai", scene: "fm.bank30" },
        ),
      ],
      quiz: mcq(
        L(
          "Level turn at 30° of bank, altitude held. The stall speed, 48 KIAS with the wings level:",
          "Virage en palier à 30° d’inclinaison, altitude tenue. La vitesse de décrochage, 48 KIAS ailes à plat :",
        ),
        [
          {
            text: L("stays at 48 KIAS", "reste à 48 KIAS"),
            why: L(
              "Only if you let the nose drop: holding the altitude loads the wing.",
              "Seulement si vous laissez le nez tomber : tenir l’altitude charge l’aile.",
            ),
          },
          {
            text: L("rises to about 52 KIAS", "monte à environ 52 KIAS"),
            why: L(
              "Right: the wing carries 1.15 times the weight, the stall speed rises by 7 %.",
              "Juste : l’aile porte 1,15 fois le poids, la vitesse de décrochage monte de 7 %.",
            ),
          },
          {
            text: L("falls a little", "baisse un peu"),
            why: L(
              "The opposite: you feel heavier in your seat, and so does the wing.",
              "C’est l’inverse : vous pesez plus lourd dans le siège, et l’aile aussi.",
            ),
          },
        ],
        1,
        L(
          "See it on the next step: take the controls and roll to 30°.",
          "Voyez-le à l’étape suivante : prenez les commandes et inclinez à 30°.",
        ),
      ),
      foot: L(
        "C172S POH sect. 5 · stall speeds, flaps up, 2,550 lb",
        "POH C172S sect. 5 · décrochage, volets rentrés, 2 550 lb",
      ),
      reader: L(
        "In a level turn at 30° of bank the wing carries 1.15 times the weight, and the stall speed of the C172S, flaps up, rises from 48 to 52 KIAS (POH section 5, stall speeds at 2,550 lb).",
        "En virage en palier à 30° d’inclinaison, l’aile porte 1,15 fois le poids, et la vitesse de décrochage du C172S, volets rentrés, passe de 48 à 52 KIAS (POH section 5, vitesses de décrochage à 2 550 lb).",
      ),
    }),
    // 19 ----------------------------------------------------------------- your turn: a 30° turn onto a heading
    handsOnStep("fm-turn", {
      title: L(
        "Turn right to 360 at 30° of bank",
        "Virez à droite vers le 360 à 30°",
      ),
      control: L(
        "Bank: hold “Right ▶” to roll to 30°, release to level the wings.",
        "Inclinaison : maintenez « À droite ▶ » pour incliner à 30°, relâchez pour revenir à plat.",
      ),
      action: L(
        "Hold it from 270. Release at 345: 15° early.",
        "Maintenez depuis le 270. Relâchez au 345 : 15° avant.",
      ),
      ends: L(
        "Heading 360 ±10° held 5 s: about 25 s.",
        "Cap 360 ±10° tenu 5 s : 25 s environ.",
      ),
      checks: [
        {
          text: L(
            "Bank 30° (25 to 35°) in the turn",
            "Inclinaison 30° (25 à 35°) en virage",
          ),
        },
        {
          text: L("Heading 360 (±10°) for 5 s", "Cap 360 (±10°) pendant 5 s"),
          readout: "hdg",
        },
        {
          text: L("Altitude 3,000 ft (±100 ft)", "Altitude 3 000 ft (±100 ft)"),
          readout: "alt",
        },
      ],
      note: L(
        "In the turn, the bank row shows the load factor (g) and the stall speed (Vs). Altitude and speed are held for you.",
        "En virage, la ligne Inclinaison affiche le facteur de charge (g) et la vitesse de décrochage (Vs). Altitude et vitesse sont tenues pour vous.",
      ),
      alt: L(
        "Live six instruments, level at 3,000 ft, heading 270, 100 KIAS",
        "Six instruments en direct, palier à 3 000 ft, cap 270, 100 KIAS",
      ),
      scene: "fm.level",
      prompt: L(
        "Your turn: turn right to heading 360 at 30° of bank",
        "À vous : virez à droite vers le cap 360 à 30° d’inclinaison",
      ),
      controls: ["bank"],
      assist: { holdAlt: true, holdIas: true, bankDeg: 30 },
      goal: {
        all: [
          { id: "bankBand", p: { min: 25, max: 35 } },
          // the heading row carries its own hold: a goal-wide hold would also freeze the bank of the turn, which
          // is back to zero once the wings are level
          { id: "heading", p: { value: 360, tol: 10, holdS: 5 } },
          GOAL.alt(2900, 3100),
        ],
        graded: false,
        success: L(
          "90° in about 20 s. At 30° of bank: 1.15 g, and a stall speed of 52 kt instead of 48.",
          "90° en 20 s environ. À 30° d’inclinaison : 1,15 g, et un décrochage à 52 kt au lieu de 48.",
        ),
      },
      hint: L(
        "Hold “Right ▶” until the heading reads 345, then let go: the wings level on 360.",
        "Maintenez « À droite ▶ » jusqu’à lire le cap 345, puis lâchez : les ailes reviennent à plat au 360.",
      ),
      foot: L(
        `${AFH} ch. 3 · level turns`,
        `${AFH} ch. 3 · virages en palier`,
      ),
      reader: L(
        "Your turn. Control: the bank, hold “Right ▶” (or the → key) to roll to 30°, release to level the wings. From heading 270, hold it and release at 345, 15° before the heading: half the bank angle. It ends when heading 360 ±10° has been held for 5 seconds, about 25 seconds in all. In the turn the bank row shows the load factor and the stall speed, flaps up: 1.15 g and 52 kt at 30°. Altitude and speed are held for you (FAA AFH ch. 3; C172S POH section 5).",
        "À vous. Commande : l’inclinaison, maintenez « À droite ▶ » (ou la touche →) pour incliner à 30°, relâchez pour remettre les ailes à plat. Du cap 270, maintenez et relâchez au 345, soit 15° avant le cap : la moitié de l’inclinaison. C’est réussi quand le cap 360 ±10° est tenu 5 secondes, en 25 secondes environ. En virage, la ligne Inclinaison affiche le facteur de charge et la vitesse de décrochage volets rentrés : 1,15 g et 52 kt à 30°. Altitude et vitesse sont tenues pour vous (FAA AFH ch. 3 ; POH C172S section 5).",
      ),
    }),
    // 20 ----------------------------------------------------------------- load factor and stall speed with bank: the student finds 2 g
    // (was four attitude indicators side by side: the student now moves the bank on the load-factor tool)
    loadToolStep("fm-load"),
    // 21 ----------------------------------------------------------------- the turn, step by step
    stepsStep("fm-turn-how", {
      eyebrow: L("The level turn", "Le virage en palier"),
      title: L(
        "Look out, roll in, hold, roll out",
        "Sécurité, mise en virage, tenue, sortie",
      ),
      rows: [
        {
          heading: L("Look out, then roll in", "Sécurité, puis inclinez"),
          small: L(
            "turn side clear, ball centred",
            "côté du virage dégagé, bille au milieu",
          ),
        },
        {
          heading: L(
            "Hold the bank and the altitude",
            "Tenez l’inclinaison et l’altitude",
          ),
          small: L(
            "a little back pressure on the yoke",
            "un peu de traction sur le manche",
          ),
        },
        {
          heading: L(
            "Read the turn coordinator",
            "Lisez l’indicateur de virage",
          ),
          small: L(
            "it shows the rate of turn, not the bank",
            "il montre le taux de virage, pas l’inclinaison",
          ),
        },
        {
          heading: L("Roll out early", "Anticipez la sortie"),
          small: L(
            "half the bank angle before the heading",
            "la moitié de l’inclinaison avant le cap",
          ),
        },
      ],
      visual: [
        DIAGRAM(
          "fm-turn-how.turn",
          { kind: "calc", calc: { kind: "turn", tasKt: 105, bankDeg: 30 } },
          L(
            "A level turn at 30° of bank and 105 kt true airspeed: about 6° per second, twice the standard rate, on a radius of about 0.3 NM",
            "Un virage en palier à 30° d’inclinaison et 105 kt de vitesse propre : environ 6° par seconde, deux fois le taux standard, sur un rayon d’environ 0,3 NM",
          ),
          1080,
          312,
          720,
          600,
        ),
      ],
      foot: L(`${AFH} ch. 3 · level turns`, `${AFH} ch. 3 · virages en palier`),
      reader: L(
        "The level turn, step by step. Look out on the side of the turn, then roll in with aileron and rudder together, ball centred. Hold the bank and the altitude with a little back pressure. The turn coordinator shows the rate of turn, not the bank: at 30° and 100 KIAS the aircraft turns at about 6° per second, twice the standard rate, so the wing sits beyond the mark. Start the roll-out half the bank angle before the heading, and release the back pressure (FAA AFH ch. 3).",
        "Le virage en palier, étape par étape. Assurez la sécurité du côté du virage, puis inclinez au manche et au pied ensemble, bille au milieu. Tenez l’inclinaison et l’altitude avec un peu de traction. L’indicateur de virage montre le taux de virage, pas l’inclinaison : à 30° et 100 KIAS, l’avion tourne à environ 6° par seconde, deux fois le taux standard, et l’aile dépasse donc le repère. Commencez la sortie la moitié de l’inclinaison avant le cap, et relâchez la traction (FAA AFH ch. 3).",
      ),
    }),
    // 22 ----------------------------------------------------------------- calc: the bank for a standard-rate turn
    step(
      "fm-bank-calc",
      "calc",
      L("Bank for a standard-rate turn", "L’inclinaison pour le taux standard"),
      [],
      {
        minutes: 2,
        calc: {
          generatorId: "ifr.standardRateBank",
          params: { tasKt: [80, 120] },
          showRuleOfThumb: true,
          stage: "none",
        },
      },
    ),
    // 23 ----------------------------------------------------------------- fly it: turns onto headings
    flyStep(
      "fm-fly-turns",
      "bai-turns",
      L("Fly it: turns onto headings", "En vol : virages vers des caps"),
      L(
        "You start at 4,000 ft on heading 360, 95 KIAS. Three turns at the standard rate, about 15° of bank: left to 270, right to 090, left to 360. Hold the altitude.",
        "Départ à 4 000 ft, cap 360, 95 KIAS. Trois virages au taux standard, environ 15° d’inclinaison : à gauche vers le 270, à droite vers le 090, à gauche vers le 360. Tenez l’altitude.",
      ),
      [
        L(
          "Look out, roll in, and roll out half the bank angle early",
          "Sécurité, inclinez, et sortez la moitié de l’inclinaison avant le cap",
        ),
        L(
          "Marked on: altitude ±100 ft, roll-out ±10°, bank 30° at most",
          "Noté sur : altitude ±100 ft, sortie ±10°, 30° d’inclinaison au plus",
        ),
      ],
      // the lesson's own brief (curriculum.ts bai-turns) says about 5 min
      5,
    ),

    // ==================================================================== part 4: recap and quiz
    // 24 ----------------------------------------------------------------- the classic errors
    mistakesStep("fm-mistakes", {
      eyebrow: L("Part 4 · Common mistakes", "Partie 4 · Erreurs fréquentes"),
      title: L("Three classic errors", "Trois erreurs classiques"),
      rows: [
        {
          error: L("Chasing the altimeter", "Courir après l’altimètre"),
          why: L(
            "Each correction comes late and too big: the altitude waves up and down.",
            "Chaque correction arrive tard et trop fort : l’altitude ondule.",
          ),
          fix: L(
            "Set an attitude, wait, then trim.",
            "Affichez une assiette, attendez, puis compensez.",
          ),
        },
        {
          error: L("Flying with the trim", "Piloter au compensateur"),
          why: L(
            "The trim only removes a force. Used first, it shifts the speed you had chosen.",
            "Le compensateur annule un effort. Utilisé d’abord, il déplace la vitesse choisie.",
          ),
          fix: L(
            "Attitude with the yoke, then trim the force away.",
            "L’assiette au manche, puis compensez l’effort.",
          ),
        },
        {
          error: L(
            "Letting the nose drop in a turn",
            "Laisser tomber le nez en virage",
          ),
          why: L(
            "The banked lift no longer holds the weight: the aircraft descends and speeds up.",
            "La portance inclinée ne tient plus le poids : l’avion descend et accélère.",
          ),
          fix: L(
            "A little back pressure as you roll in, released as you roll out.",
            "Un peu de traction en inclinant, relâchée à la sortie.",
          ),
        },
      ],
      foot: L(
        `${AFH} ch. 3 · common errors`,
        `${AFH} ch. 3 · erreurs fréquentes`,
      ),
      reader: L(
        "Three classic errors. Chasing the altimeter: set an attitude, wait, then trim. Flying with the trim: the trim only removes a force, so set the attitude with the yoke first. Letting the nose drop in a turn: add a little back pressure as you roll in and release it as you roll out (FAA AFH ch. 3).",
        "Trois erreurs classiques. Courir après l’altimètre : affichez une assiette, attendez, puis compensez. Piloter au compensateur : il ne fait qu’annuler un effort, l’assiette se règle d’abord au manche. Laisser tomber le nez en virage : ajoutez un peu de traction en inclinant, et relâchez-la à la sortie (FAA AFH ch. 3).",
      ),
    }),
    // 25 ----------------------------------------------------------------- recap
    recapStep("fm-recap", {
      title: L("Three numbers to keep", "Trois chiffres à garder"),
      cols: [
        {
          n: S("74"),
          text: L(
            "KIAS: Vy, the best rate of climb at sea level",
            "KIAS : Vy, le meilleur taux de montée au niveau de la mer",
          ),
          color: "key",
        },
        {
          n: S("10 %"),
          text: L(
            "of the climb rate: the lead to level off",
            "du taux de montée : l’anticipation de la mise en palier",
          ),
          color: "key",
        },
        {
          n: S("52"),
          text: L(
            "KIAS: the stall speed at 30° of bank (48 wings level)",
            "KIAS : le décrochage à 30° d’inclinaison (48 ailes à plat)",
          ),
          color: "key",
        },
      ],
      checks: [
        L(
          "Attitude + power = performance",
          "Assiette + puissance = performance",
        ),
        L(
          "Climb: power, attitude, trim",
          "Montée : puissance, assiette, compensateur",
        ),
        L(
          "Roll out half the bank angle early",
          "Sortie : la moitié de l’inclinaison avant",
        ),
      ],
      foot: L(
        `C172S POH sect. 4 and 5 · ${AFH} ch. 3`,
        `POH C172S sect. 4 et 5 · ${AFH} ch. 3`,
      ),
      reader: L(
        "Three numbers to keep: Vy 74 KIAS, the best rate of climb at sea level (POH section 4); 10 % of the climb rate, the lead to level off (FAA AFH ch. 3); 52 KIAS, the stall speed at 30° of bank, flaps up, against 48 with the wings level (POH section 5). And three habits: attitude plus power gives performance; into the climb with power, attitude, trim; roll out of a turn half the bank angle early.",
        "Trois chiffres à garder : Vy 74 KIAS, le meilleur taux de montée au niveau de la mer (POH section 4) ; 10 % du taux de montée, l’anticipation de la mise en palier (FAA AFH ch. 3) ; 52 KIAS, le décrochage à 30° d’inclinaison, volets rentrés, contre 48 ailes à plat (POH section 5). Et trois réflexes : assiette plus puissance donnent la performance ; en montée, puissance, assiette, compensateur ; en virage, sortez la moitié de l’inclinaison avant le cap.",
      ),
    }),
    // 26 ----------------------------------------------------------------- the final quiz
    finalQuizStep(
      "fm-quiz",
      L("Final quiz: six questions", "Quiz final : six questions"),
      L(
        "Six questions on the whole course. Every answer comes with its reason: read it even when you are right.",
        "Six questions sur tout le cours. Chaque réponse vient avec sa raison : lisez-la même quand vous avez juste.",
      ),
      [
        mcq(
          L(
            "1. Trimmed and level at 100 KIAS, you reduce the power and touch nothing else. The aircraft…",
            "1. Compensé en palier à 100 KIAS, vous réduisez la puissance sans toucher à rien d’autre. L’avion…",
          ),
          [
            {
              text: L(
                "descends at about the same speed",
                "descend à peu près à la même vitesse",
              ),
              why: L(
                "Right: the trim keeps the speed, the missing power becomes a descent.",
                "Juste : le compensateur garde la vitesse, la puissance manquante devient de la descente.",
              ),
            },
            {
              text: L(
                "slows down and stays level",
                "ralentit et reste en palier",
              ),
              why: L(
                "It would need a higher attitude: someone has to raise the nose.",
                "Il faudrait une assiette plus haute : quelqu’un doit cabrer.",
              ),
            },
            {
              text: L("stalls", "décroche"),
              why: L(
                "No: the trimmed speed is far above the stall.",
                "Non : la vitesse compensée est loin au-dessus du décrochage.",
              ),
            },
          ],
          0,
          L(
            "A trimmed aircraft holds its speed: the power changes the flight path (FAA AFH ch. 3).",
            "Un avion compensé tient sa vitesse : la puissance change la trajectoire (FAA AFH ch. 3).",
          ),
        ),
        mcq(
          L(
            "2. The best rate of climb speed (Vy) of the C172S at sea level is…",
            "2. La vitesse de meilleur taux de montée (Vy) du C172S au niveau de la mer est…",
          ),
          [
            {
              text: L("62 KIAS", "62 KIAS"),
              why: L(
                "That is Vx, the best angle: for an obstacle.",
                "C’est Vx, la meilleure pente : pour un obstacle.",
              ),
            },
            {
              text: L("74 KIAS", "74 KIAS"),
              why: L(
                "Right: about 730 ft/min at sea level and 2,550 lb.",
                "Juste : environ 730 ft/min au niveau de la mer à 2 550 lb.",
              ),
            },
            {
              text: L("85 KIAS", "85 KIAS"),
              why: L(
                "That is the top of the en-route climb range, 75 to 85 KIAS.",
                "C’est le haut de la plage de montée en route, 75 à 85 KIAS.",
              ),
            },
          ],
          1,
          L(
            "Vx 62 KIAS, Vy 74 KIAS, en-route climb 75 to 85 KIAS (C172S POH section 4).",
            "Vx 62 KIAS, Vy 74 KIAS, montée en route 75 à 85 KIAS (POH C172S section 4).",
          ),
        ),
        mcq(
          L(
            "3. Climbing at 500 ft/min to 3,500 ft: you start to level off at…",
            "3. Montée à 500 ft/min vers 3 500 ft : vous commencez la mise en palier à…",
          ),
          [
            {
              text: L("3,450 ft", "3 450 ft"),
              why: L(
                "Right: 10 % of 500 ft/min is 50 ft.",
                "Juste : 10 % de 500 ft/min, soit 50 ft.",
              ),
            },
            {
              text: L("3,500 ft", "3 500 ft"),
              why: L(
                "Too late: you would overshoot the altitude.",
                "Trop tard : vous dépasseriez l’altitude.",
              ),
            },
            {
              text: L("3,000 ft", "3 000 ft"),
              why: L(
                "Far too early: 500 ft at a crawl.",
                "Bien trop tôt : 500 ft au ralenti.",
              ),
            },
          ],
          0,
          L(
            "Lead the level-off by about 10 % of the rate of climb (FAA AFH ch. 3).",
            "Anticipez la mise en palier d’environ 10 % du taux de montée (FAA AFH ch. 3).",
          ),
        ),
        mcq(
          L(
            "4. Level turn at 60° of bank. The load factor is…",
            "4. Virage en palier à 60° d’inclinaison. Le facteur de charge vaut…",
          ),
          [
            {
              text: L("1 g", "1 g"),
              why: L(
                "That is straight and level flight.",
                "C’est le vol rectiligne en palier.",
              ),
            },
            {
              text: L("1.15 g", "1,15 g"),
              why: L("That is 30° of bank.", "C’est à 30° d’inclinaison."),
            },
            {
              text: L("2 g", "2 g"),
              why: L(
                "Right: 1 ÷ cos 60° = 2. The stall speed, flaps up, rises to 68 KIAS.",
                "Juste : 1 ÷ cos 60° = 2. Le décrochage, volets rentrés, monte à 68 KIAS.",
              ),
            },
          ],
          2,
          L(
            "Load factor = 1 ÷ cos(bank): 2 g at 60°, and 48 KIAS becomes 68 KIAS (C172S POH section 5).",
            "Facteur de charge = 1 ÷ cos(inclinaison) : 2 g à 60°, et 48 KIAS deviennent 68 KIAS (POH C172S section 5).",
          ),
        ),
        mcq(
          L(
            "5. Right turn at 30° of bank onto heading 090. You start to roll out at…",
            "5. Virage à droite à 30° d’inclinaison vers le cap 090. Vous commencez la sortie au…",
          ),
          [
            {
              text: L("heading 060", "cap 060"),
              why: L(
                "Too early: 30° of lead is the whole bank angle.",
                "Trop tôt : 30° d’avance, c’est toute l’inclinaison.",
              ),
            },
            {
              text: L("heading 075", "cap 075"),
              why: L(
                "Right: half the bank angle, 15° before the heading.",
                "Juste : la moitié de l’inclinaison, 15° avant le cap.",
              ),
            },
            {
              text: L("heading 090", "cap 090"),
              why: L(
                "Too late: the aircraft keeps turning while the wings level.",
                "Trop tard : l’avion tourne encore pendant que les ailes reviennent à plat.",
              ),
            },
          ],
          1,
          L(
            "Lead the roll-out by half the bank angle (FAA AFH ch. 3).",
            "Anticipez la sortie de la moitié de l’inclinaison (FAA AFH ch. 3).",
          ),
        ),
        mcq(
          L(
            "6. Target 3,000 ft and 100 KIAS. You read 3,150 ft and 108 KIAS: high and fast. First move?",
            "6. Objectif 3 000 ft et 100 KIAS. Vous lisez 3 150 ft et 108 KIAS : haut et rapide. Premier geste ?",
          ),
          [
            {
              text: L("Reduce the power", "Réduire la puissance"),
              why: L(
                "Right: too much energy in all. Then bring the altitude back with the attitude.",
                "Juste : trop d’énergie au total. Puis ramenez l’altitude à l’assiette.",
              ),
            },
            {
              text: L("Lower the nose only", "Baisser le nez seulement"),
              why: L(
                "The altitude comes back, but the speed rises even more.",
                "L’altitude revient, mais la vitesse augmente encore.",
              ),
            },
            {
              text: L("Raise the nose", "Cabrer"),
              why: L(
                "The speed comes back, but you climb further away.",
                "La vitesse revient, mais vous montez encore plus.",
              ),
            },
          ],
          0,
          L(
            "High and fast, or low and slow: a power error. High and slow, or low and fast: an attitude error (FAA AFH ch. 4).",
            "Haut et rapide, ou bas et lent : erreur de puissance. Haut et lent, ou bas et rapide : erreur d’assiette (FAA AFH ch. 4).",
          ),
        ),
      ],
    ),
  ];
  return course(
    {
      id: PPL_FLIGHT_MANOEUVRES_ID,
      title: L(
        "Straight and level, climbing, descending and turning",
        "Palier, montée, descente et virages",
      ),
      summary: L(
        "Attitude plus power gives performance: level flight, climbs, descents and 30° turns on the live six instruments of the C172S, three moments at the controls on the slide, then each manoeuvre flown in the simulator.",
        "Assiette plus puissance donnent la performance : palier, montée, descente et virages à 30° sur les six instruments du C172S en direct, trois prises des commandes sur la diapositive, puis chaque manœuvre pilotée dans le simulateur.",
      ),
      cockpit: "steam",
      theme: "classroom",
      tags: [
        "lapl-ppl",
        "easa",
        "faa",
        "c172s",
        "handling",
        "level",
        "climb",
        "descent",
        "turn",
      ],
    },
    livenAll(steps, {
      // the cover flies a standard-rate turn (canvas/motion.ts « turn-std », FAA AFH ch. 3)
      "fm-cover.six": {
        motion: "turn-std",
        alt: L(
          "The training aircraft’s six instruments at 3,000 ft and 100 KIAS: a standard-rate turn, 3° a second",
          "Les six instruments de l’avion-école à 3 000 ft et 100 KIAS : un virage au taux standard, 3° par seconde",
        ),
      },
      // attitude + power = performance: the power changes, the RPM first, then the speed (« power »: PHAK ch. 6,
      // POH C172S section 5 cruise table)
      "fm-apf.inst": {
        motion: "power",
        alt: L(
          "The six instruments live, level at 3,000 ft: the power goes from 2,100 to 2,500 RPM, the RPM first, then the speed",
          "Les six instruments en direct, en palier à 3 000 ft : la puissance passe de 2 100 à 2 500 tr/min, d’abord les tours, puis la vitesse",
        ),
      },
    }).map((st) => (st.notes || !NOTES[st.id] ? st : { ...st, notes: NOTES[st.id] })),
    scenes(),
  );
}
