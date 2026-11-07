// Ground school — course library (A1): human performance for the LAPL / PPL. Spatial disorientation (the
// vestibular illusions, the graveyard spiral and its recovery), vision in flight, hypoxia and supplemental oxygen,
// fitness to fly (IMSAFE, alcohol, medication), threat and error management and the early 180° turn; a spiral
// recovery on the live six-pack and two unusual-attitude lessons flown.
// Sources: FAA-H-8083-25C PHAK ch. 17 "Aeromedical Factors" (vestibular illusions, vision, hypoxia,
// hyperventilation, alcohol) and ch. 2 "Aeronautical Decision-Making" (PAVE, DECIDE, IMSAFE); FAA AIM 8-1-1
// "Fitness for Flight", 8-1-5 "Illusions in Flight", 8-1-6 "Vision in Flight"; 14 CFR 91.17 and 91.211; EASA
// Part-NCO NCO.OP.190 (supplemental oxygen), Part-MED MED.A.020 (decrease in medical fitness); EASA LAPL/PPL
// syllabus subject "Human performance" (AMC1 FCL.115;FCL.120); ICAO threat and error management (TEM) model;
// Bryan, Stonecipher & Aron, "180-Degree Turn Experiment", University of Illinois Aeronautics Bulletin 11, 1954
// (average 178 s to loss of control, range 20 to 480 s); C172S POH sect. 3 "Recovery from spiral dive in the
// clouds" (throttle idle, level the wings on the turn coordinator, slowly reduce the airspeed to 80 KIAS).
import type { Course, SimScene, Step } from "../../types";
import { DIAGRAM, IMG, L, course } from "../kit";
import { G } from "../navSlides";
import {
  GAUGE,
  S,
  coverStep,
  flyStep,
  heroGauge,
  heroStep,
  mcq,
  quizStep,
  stepsStep,
  whyStep,
} from "../briefings/kit";
import { SIX, panelCompareStep, recapStep, sceneA1, turnStep } from "./kit-a1";

export const PPL_HUMAN_PERFORMANCE_ID = "sample-lib-ppl-human-performance";

const AREA = { fix: "PARD", radial: 160, distNm: 18 };

function scenes(): Record<string, SimScene> {
  return {
    "hp.level": sceneA1(
      "hp.level",
      { pos: AREA, altFt: 4500, hdg: 200, iasKt: 100 },
      { label: "Wings level · 4,500 ft · 100 KIAS" },
    ),
    "hp.spiral": sceneA1(
      "hp.spiral",
      {
        pos: AREA,
        altFt: 4500,
        hdg: 200,
        iasKt: 120,
        bank: 30,
        pitch: -5,
        vsFpm: -800,
      },
      {
        label: "Shallow spiral: 30° of bank, nose down, 120 KIAS",
        controls: { throttle: 0.75, trim: -0.3, flaps: 0 },
      },
    ),
  };
}

const IMG_CLOUD = "Photo: Matthias Wesselmann / Unsplash";
const IMG_ABOVE = "Photo: Alexander Korte / Unsplash";

export function pplHumanPerformanceCourse(): Course {
  const steps: Step[] = [
    // 1 ------------------------------------------------------------------ cover
    coverStep(
      "hp-cover",
      L(
        "Human performance: disorientation and fitness to fly",
        "Performances humaines : désorientation et aptitude au vol",
      ),
      {
        eyebrow: L(
          "LAPL / PPL · Human performance",
          "LAPL / PPL · Performances humaines",
        ),
        main: L("Human performance", "Performances humaines"),
        sub: L(
          "disorientation and fitness to fly",
          "désorientation et aptitude au vol",
        ),
        lead: L(
          "Your senses lie in cloud. Learn when, and what to trust instead.",
          "En nuage, vos sens mentent. Sachez quand, et à quoi vous fier.",
        ),
        meta: L(
          "16 steps · about 45 min · FAA PHAK ch. 17 · AIM ch. 8",
          "16 étapes · environ 45 min · FAA PHAK ch. 17 · AIM ch. 8",
        ),
        hero: [
          heroGauge(
            "hp-cover.ai",
            "ai",
            L(
              "Attitude indicator in a shallow descending spiral: 30° of bank, nose down",
              "Horizon artificiel en spirale descendante : 30° d’inclinaison, nez bas",
            ),
            "hp.spiral",
          ),
        ],
        scene: "hp.spiral",
        reader: L(
          "Human performance for the private pilot: why the inner ear misleads you in cloud, the illusions and the graveyard spiral, a spiral recovery on the instruments, vision, oxygen and hypoxia, fitness to fly and alcohol, and threat and error management with the early 180° turn.",
          "Performances humaines pour le pilote privé : pourquoi l’oreille interne vous trompe en nuage, les illusions et la spirale engagée, une sortie de spirale aux instruments, la vision, l’oxygène et l’hypoxie, l’aptitude au vol et l’alcool, et la gestion des menaces et des erreurs avec le demi-tour précoce.",
        ),
      },
    ),
    // 2 ------------------------------------------------------------------ why
    whyStep("hp-why", {
      eyebrow: L("Why it matters", "Pourquoi c’est important"),
      title: L("Into cloud without training", "En nuage sans entraînement"),
      n: S("178"),
      nW: 400,
      unit: L("s", "s"),
      color: "stop",
      statement: L(
        "The average time to loss of control",
        "Le temps moyen avant la perte de contrôle",
      ),
      body: L(
        "Pilots without instrument training, flying into simulated instrument conditions.",
        "Des pilotes sans formation aux instruments, en conditions de vol aux instruments simulées.",
      ),
      sideTitle: L("In the same study", "Dans la même étude"),
      side: [
        {
          n: S("20 s"),
          text: L(
            "the quickest loss of control",
            "la perte de contrôle la plus rapide",
          ),
          color: "stop",
        },
        { n: S("480 s"), text: L("the longest", "la plus tardive") },
      ],
      foot: L(
        "Bryan, Stonecipher & Aron, 1954 · Univ. of Illinois Aeronautics Bulletin 11",
        "Bryan, Stonecipher et Aron, 1954 · Univ. of Illinois Aeronautics Bulletin 11",
      ),
      reader: L(
        "In the 1954 University of Illinois “180-degree turn experiment” (Bryan, Stonecipher and Aron, Aeronautics Bulletin 11), pilots with no instrument training flew into simulated instrument conditions: they lost control after 178 seconds on average, the quickest in 20 seconds and the longest in 480. After a few lessons on a 180° turn on instruments, almost all of them turned back safely.",
        "Dans l’« expérience du virage de 180 degrés » de l’université de l’Illinois en 1954 (Bryan, Stonecipher et Aron, Aeronautics Bulletin 11), des pilotes sans formation aux instruments sont entrés en conditions de vol aux instruments simulées : ils ont perdu le contrôle au bout de 178 secondes en moyenne, le plus rapide en 20 secondes et le plus lent en 480. Après quelques leçons de demi-tour aux instruments, presque tous sont revenus sans encombre.",
      ),
    }),
    // 3 ------------------------------------------------------------------ predict
    quizStep("hp-predict", {
      eyebrow: L("Predict", "Prédisez"),
      title: L(
        "Half a minute in a steady turn",
        "Une demi-minute en virage stable",
      ),
      quote: L(
        "In cloud, coordinated turn, no change for 30 s.",
        "En nuage, virage coordonné, rien ne change pendant 30 s.",
      ),
      quiz: mcq(
        L("What do you feel?", "Que ressentez-vous ?"),
        [
          {
            text: L("Level", "À plat"),
            why: L(
              "Right: the inner ear stops sensing a steady turn.",
              "Juste : l’oreille interne ne sent plus un virage stable.",
            ),
          },
          {
            text: L("The turn", "Le virage"),
            why: L(
              "Only while the rate of turn changes.",
              "Seulement quand le taux de virage change.",
            ),
          },
          {
            text: L("A climb", "Une montée"),
            why: L(
              "No: the turn simply fades away.",
              "Non : le virage s’efface, c’est tout.",
            ),
          },
        ],
        0,
        L(
          "The semicircular canals sense changes, not a steady rate: the turn feels level.",
          "Les canaux semi-circulaires sentent les changements, pas un taux constant : le virage paraît à plat.",
        ),
      ),
      foot: L(
        "FAA PHAK ch. 17 · AIM 8-1-5 · vestibular illusions",
        "FAA PHAK ch. 17 · AIM 8-1-5 · illusions vestibulaires",
      ),
      reader: L(
        "The semicircular canals of the inner ear sense angular acceleration, not a steady rotation. In a prolonged, coordinated, constant-rate turn the fluid catches up with the canals and the sensation of turning stops: the turn feels like level flight. Rolling out then feels like a turn the other way (FAA PHAK ch. 17; AIM 8-1-5).",
        "Les canaux semi-circulaires de l’oreille interne sentent l’accélération angulaire, pas une rotation constante. Dans un virage coordonné prolongé à taux constant, le liquide rattrape les canaux et la sensation de virage disparaît : le virage paraît à plat. La sortie de virage donne alors l’impression de virer dans l’autre sens (FAA PHAK ch. 17 ; AIM 8-1-5).",
      ),
    }),
    // 4 ------------------------------------------------------------------ feel vs fact
    panelCompareStep("hp-feel", {
      eyebrow: L("Feel or instruments", "Sensations ou instruments"),
      title: L(
        "What you feel, what it does",
        "Ce que vous sentez, ce qu’il fait",
      ),
      halves: [
        {
          eyebrow: L("What you feel", "Ce que vous sentez"),
          color: "stop",
          view: GAUGE("ai"),
          alt: L(
            "Attitude indicator wings level: what the pilot feels",
            "Horizon artificiel ailes à plat : ce que ressent le pilote",
          ),
          scene: "hp.level",
          size: [480, 480],
          body: L(
            "Wings level, nose level. Nothing seems wrong.",
            "Ailes à plat, nez à l’horizon. Tout semble normal.",
          ),
        },
        {
          eyebrow: L("What the aircraft does", "Ce que fait l’avion"),
          color: "nav",
          view: GAUGE("ai"),
          alt: L(
            "Attitude indicator in 30° of bank, nose down: what the aircraft does",
            "Horizon artificiel à 30° d’inclinaison, nez bas : ce que fait l’avion",
          ),
          scene: "hp.spiral",
          size: [480, 480],
          body: L(
            "30° of bank, nose down: a spiral has begun.",
            "30° d’inclinaison, nez bas : une spirale a commencé.",
          ),
        },
      ],
      foot: L(
        "FAA PHAK ch. 17 · AIM 8-1-5 · believe the instruments",
        "FAA PHAK ch. 17 · AIM 8-1-5 · croyez les instruments",
      ),
      reader: L(
        "The same moment, two pictures. What you feel: wings level, nothing wrong. What the aircraft does: 30° of bank, nose down, the start of a spiral. Without an outside horizon only the instruments tell the truth: believe them over your senses (FAA PHAK ch. 17; AIM 8-1-5).",
        "Le même instant, deux images. Ce que vous sentez : ailes à plat, rien d’anormal. Ce que fait l’avion : 30° d’inclinaison, nez bas, le début d’une spirale. Sans horizon extérieur, seuls les instruments disent vrai : croyez-les plutôt que vos sensations (FAA PHAK ch. 17 ; AIM 8-1-5).",
      ),
    }),
    // 5 ------------------------------------------------------------------ the illusions
    stepsStep("hp-illusions", {
      eyebrow: L("Vestibular illusions", "Illusions vestibulaires"),
      title: L(
        "Five ways the inner ear lies",
        "Cinq façons dont l’oreille ment",
      ),
      rows: [
        {
          heading: L("The leans", "Les « leans »"),
          small: L(
            "after an unfelt bank, level feels banked",
            "après une inclinaison non sentie, le plat paraît incliné",
          ),
        },
        {
          heading: L("Graveyard spiral", "Spirale engagée"),
          small: L(
            "the turn feels level; pulling tightens it",
            "le virage paraît à plat ; tirer le resserre",
          ),
        },
        {
          heading: L("Coriolis", "Coriolis"),
          small: L(
            "head moved in a turn: tumbling",
            "la tête bouge en virage : culbute",
          ),
        },
        {
          heading: L("Somatogravic", "Somatogravique"),
          small: L(
            "acceleration feels like a climb",
            "l’accélération paraît être une montée",
          ),
        },
        {
          heading: L("Elevator, inversion", "Ascenseur, inversion"),
          small: L(
            "updraft or level-off: false climb or tumble",
            "ascendance ou mise en palier : fausse montée",
          ),
        },
      ],
      visual: [
        DIAGRAM(
          "hp-illusions.turn",
          { kind: "calc", calc: { kind: "turn", tasKt: 120, bankDeg: 30 } },
          L(
            "A turn at 120 kt and 30° of bank: the circle a graveyard spiral starts from",
            "Virage à 120 kt et 30° d’inclinaison : le cercle d’où part la spirale engagée",
          ),
          1080,
          312,
          720,
          648,
        ),
      ],
      foot: L(
        "FAA AIM 8-1-5 · FAA PHAK ch. 17 · illusions in flight",
        "FAA AIM 8-1-5 · FAA PHAK ch. 17 · illusions en vol",
      ),
      reader: L(
        "AIM 8-1-5 names the vestibular illusions. The leans: after a bank entered too slowly to be felt, levelling the wings feels like banking the other way. The graveyard spiral: a prolonged turn feels level; the altitude unwinds and pulling back tightens the spiral. Coriolis: a head movement during a prolonged turn feels like tumbling. Somatogravic: a rapid acceleration feels like a nose-up climb, and the pilot pushes. Elevator and inversion: an updraft, or an abrupt level-off, give a false climb or a feeling of tumbling backwards.",
        "L’AIM 8-1-5 décrit les illusions vestibulaires. Les « leans » : après une inclinaison prise trop doucement pour être sentie, remettre les ailes à plat donne l’impression de s’incliner de l’autre côté. La spirale engagée : un virage prolongé paraît à plat ; l’altitude défile et tirer resserre la spirale. Coriolis : un mouvement de tête pendant un virage prolongé donne une sensation de culbute. Somatogravique : une forte accélération paraît être une montée, et le pilote pousse. Ascenseur et inversion : une ascendance, ou une mise en palier brusque, donnent une fausse montée ou l’impression de basculer en arrière.",
      ),
    }),
    // 6 ------------------------------------------------------------------ your turn: spiral recovery
    turnStep("hp-recover", {
      eyebrow: L("Your turn", "À vous"),
      title: L("Recover from the spiral", "Sortez de la spirale"),
      rows: [
        {
          heading: L("Throttle idle", "Gaz réduits"),
          small: L("stop the speed building", "la vitesse cesse de monter"),
        },
        {
          heading: L("Level the wings first", "Ailes à plat d’abord"),
          small: L(
            "on the turn coordinator and the AI",
            "à l’indicateur de virage et à l’horizon",
          ),
        },
        {
          heading: L("Then ease out", "Puis ressource douce"),
          small: L("slowly back to 80 KIAS", "doucement jusqu’à 80 KIAS"),
        },
      ],
      checks: [
        { text: L("Bank 10° or less", "Inclinaison 10° au plus") },
        { text: L("Pitch between −5° and +10°", "Assiette entre −5° et +10°") },
      ],
      view: SIX,
      alt: L(
        "Live six-pack in a descending spiral: 30° of bank, nose down, airspeed rising",
        "Six instruments en direct en spirale descendante : 30° d’inclinaison, nez bas, vitesse qui monte",
      ),
      scene: "hp.spiral",
      prompt: L(
        "Your turn: idle, wings level, then ease out",
        "À vous : réduisez, ailes à plat, puis ressource",
      ),
      controls: ["power", "bank", "pitch"],
      goal: {
        all: [
          { id: "bankMax", p: { max: 10 } },
          { id: "pitchAtt", p: { min: -5, max: 10 } },
        ],
        holdS: 5,
        graded: false,
        success: L(
          "Wings level, nose on the horizon: recovered.",
          "Ailes à plat, nez sur l’horizon : sorti.",
        ),
      },
      hint: L(
        "Never pull while still banked.",
        "Ne tirez jamais encore incliné.",
      ),
      foot: L(
        "C172S POH sect. 3 · recovery from spiral dive in the clouds",
        "C172S POH sect. 3 · sortie de spirale en nuages",
      ),
      reader: L(
        "Your turn on the live six-pack, no assist. The C172S POH (section 3, recovery from a spiral dive in the clouds): retard the throttle to idle; stop the turn with coordinated aileron and rudder, aligning the small aircraft of the turn coordinator with the horizon line; then cautiously apply back pressure to slowly reduce the airspeed to 80 KIAS, and trim for it. Pulling while still banked only tightens the spiral.",
        "À vous sur les six instruments en direct, sans aide. Le POH du C172S (section 3, sortie de spirale en nuages) : réduire les gaz ; arrêter le virage aux ailerons et à la direction coordonnés, en alignant la maquette de l’indicateur de virage sur la ligne d’horizon ; puis tirer avec précaution pour ramener doucement la vitesse à 80 KIAS, et compenser. Tirer encore incliné ne fait que resserrer la spirale.",
      ),
    }),
    // 7 ------------------------------------------------------------------ vision
    heroStep("hp-vision", {
      eyebrow: L("Vision in flight", "La vision en vol"),
      title: L("See, and be seen", "Voir et être vu"),
      visual: [
        IMG(
          { lib: "photo:above-clouds" },
          L(
            "A wing over a layer of cloud: an empty field of view",
            "Une aile au-dessus d’une couche nuageuse : un champ visuel vide",
          ),
          G.left,
          288,
          960,
          696,
          {
            attribution: IMG_ABOVE,
          },
        ),
      ],
      points: [
        {
          heading: L("Dark adaptation", "Adaptation à l’obscurité"),
          body: L(
            "About 30 minutes; a bright light undoes it.",
            "Environ 30 minutes ; une lumière vive l’annule.",
          ),
        },
        {
          heading: L("Empty-field myopia", "Myopie du champ vide"),
          body: L(
            "Nothing to focus on: the eyes rest close.",
            "Rien à fixer : l’œil accommode de près.",
          ),
        },
        {
          heading: L("Scan in steps", "Balayez par secteurs"),
          body: L(
            "Sectors of 10° or less, 1 s each.",
            "Secteurs de 10° au plus, 1 s chacun.",
          ),
        },
      ],
      foot: L(
        "FAA AIM 8-1-6 · FAA PHAK ch. 17 · vision in flight",
        "FAA AIM 8-1-6 · FAA PHAK ch. 17 · la vision en vol",
      ),
      reader: L(
        "Vision in flight. The eyes need about 30 minutes to adapt fully to darkness, and one bright light undoes it. Over a featureless sky or cloud, with nothing to focus on, the eyes relax at a short distance (empty-field myopia) and miss traffic. Scan the sky in short, regular eye movements of 10° or less, looking at each sector for at least a second. Each eye also has a blind spot, covered by the other eye and by moving the head (FAA AIM 8-1-6; FAA PHAK ch. 17).",
        "La vision en vol. Les yeux ont besoin d’environ 30 minutes pour s’adapter complètement à l’obscurité, et une seule lumière vive l’annule. Face à un ciel ou à des nuages sans relief, sans rien à fixer, l’œil accommode de près (myopie du champ vide) et manque le trafic. Balayez le ciel par mouvements courts et réguliers de 10° au plus, en regardant chaque secteur au moins une seconde. Chaque œil a aussi une tache aveugle, couverte par l’autre œil et en bougeant la tête (FAA AIM 8-1-6 ; FAA PHAK ch. 17).",
      ),
    }),
    // 8 ------------------------------------------------------------------ oxygen
    whyStep("hp-oxygen", {
      eyebrow: L("Hypoxia", "L’hypoxie"),
      title: L("Oxygen above 10,000 ft", "L’oxygène au-dessus de 10 000 ft"),
      n: S("30"),
      nW: 232,
      unit: L("min", "min"),
      color: "key",
      statement: L(
        "Above 10,000 ft cabin: crew oxygen after 30 min",
        "Au-dessus de 10 000 ft cabine : oxygène après 30 min",
      ),
      body: L(
        "Above 13,000 ft cabin altitude: everyone on board, at all times (NCO.OP.190).",
        "Au-dessus de 13 000 ft cabine : tous les occupants, en permanence (NCO.OP.190).",
      ),
      sideTitle: L("FAA, 14 CFR 91.211", "FAA, 14 CFR 91.211"),
      side: [
        {
          n: L("12,500", "12 500"),
          text: L(
            "ft: crew, beyond 30 min",
            "ft : équipage, au-delà de 30 min",
          ),
        },
        {
          n: L("14,000", "14 000"),
          text: L("ft: crew, at all times", "ft : équipage, en permanence"),
        },
        {
          n: L("15,000", "15 000"),
          text: L(
            "ft: oxygen for every occupant",
            "ft : oxygène pour chaque occupant",
          ),
        },
      ],
      foot: L(
        "EASA Part-NCO NCO.OP.190 · 14 CFR 91.211 · cabin pressure altitude",
        "EASA Part-NCO NCO.OP.190 · 14 CFR 91.211 · altitude pression cabine",
      ),
      reader: L(
        "EASA Part-NCO, NCO.OP.190: when the pilot-in-command cannot determine how the lack of oxygen might affect the occupants, the crew use supplemental oxygen for any period beyond 30 minutes with a cabin pressure altitude between 10,000 and 13,000 ft, and everyone on board uses it above 13,000 ft. The FAA rule, 14 CFR 91.211: the required crew above 12,500 ft MSL up to 14,000 ft for the part of the flight beyond 30 minutes, the crew at all times above 14,000 ft, and oxygen provided to every occupant above 15,000 ft.",
        "EASA Part-NCO, NCO.OP.190 : quand le commandant de bord ne peut pas déterminer comment le manque d’oxygène affecterait les occupants, l’équipage utilise l’oxygène au-delà de 30 minutes à une altitude pression cabine entre 10 000 et 13 000 ft, et tous les occupants l’utilisent au-dessus de 13 000 ft. La règle FAA, 14 CFR 91.211 : l’équipage requis au-dessus de 12 500 ft MSL et jusqu’à 14 000 ft pour la partie du vol au-delà de 30 minutes, l’équipage en permanence au-dessus de 14 000 ft, et de l’oxygène fourni à chaque occupant au-dessus de 15 000 ft.",
      ),
    }),
    // 9 ------------------------------------------------------------------ hypoxia or hyperventilation
    quizStep("hp-hypoxia", {
      eyebrow: L("Question", "Question"),
      title: L("Tingling at 11,000 ft", "Des fourmillements à 11 000 ft"),
      quote: L(
        "Light-headed, tingling fingers, no oxygen on board.",
        "Tête légère, doigts qui fourmillent, pas d’oxygène à bord.",
      ),
      quiz: mcq(
        L(
          "Hypoxia or hyperventilation. What first?",
          "Hypoxie ou hyperventilation. Quoi d’abord ?",
        ),
        [
          {
            text: L("Descend", "Descendre"),
            why: L(
              "Right: same symptoms, so treat it as hypoxia.",
              "Juste : mêmes symptômes, traitez-la comme une hypoxie.",
            ),
          },
          {
            text: L("Breathe faster", "Respirer vite"),
            why: L(
              "That is what causes hyperventilation.",
              "C’est ce qui cause l’hyperventilation.",
            ),
          },
          {
            text: L("Climb on top", "Monter au-dessus"),
            why: L("Higher means less oxygen.", "Plus haut, moins d’oxygène."),
          },
        ],
        0,
        L(
          "At altitude, treat the symptoms as hypoxia: oxygen or descend, then slow the breathing.",
          "En altitude, traitez comme une hypoxie : oxygène ou descente, puis ralentissez la respiration.",
        ),
      ),
      foot: L(
        "FAA PHAK ch. 17 · hypoxia and hyperventilation",
        "FAA PHAK ch. 17 · hypoxie et hyperventilation",
      ),
      reader: L(
        "Hypoxia and hyperventilation share symptoms: light-headedness, tingling, visual changes. At altitude, assume hypoxia: use supplemental oxygen if you have it, or descend. Hyperventilation is then treated by slowing the breathing rate, for example by talking aloud (FAA PHAK ch. 17).",
        "L’hypoxie et l’hyperventilation partagent leurs symptômes : tête légère, fourmillements, troubles visuels. En altitude, supposez l’hypoxie : utilisez l’oxygène si vous en avez, ou descendez. L’hyperventilation se traite ensuite en ralentissant la respiration, par exemple en parlant à voix haute (FAA PHAK ch. 17).",
      ),
    }),
    // 10 ----------------------------------------------------------------- IMSAFE
    stepsStep("hp-imsafe", {
      eyebrow: L("Fitness to fly", "Aptitude au vol"),
      title: L("IMSAFE, before every flight", "IMSAFE, avant chaque vol"),
      rows: [
        {
          heading: L("Illness", "Maladie"),
          small: L(
            "even a cold: sinuses and ears block in the descent",
            "même un rhume : sinus et oreilles bloquent en descente",
          ),
        },
        {
          heading: L("Medication", "Médicaments"),
          small: L(
            "prescribed or not: ask your aero-medical examiner",
            "prescrits ou non : demandez au médecin agréé",
          ),
        },
        {
          heading: L("Stress", "Stress"),
          small: L(
            "work, family, the flight itself",
            "travail, famille, le vol lui-même",
          ),
        },
        {
          heading: L("Alcohol", "Alcool"),
          small: L(
            "its effects outlast the legal limit",
            "ses effets durent après la limite légale",
          ),
        },
        {
          heading: L("Fatigue, emotion", "Fatigue, émotion"),
          small: L(
            "sleep, and the state you are in",
            "le sommeil, et votre état d’esprit",
          ),
        },
      ],
      foot: L(
        "FAA PHAK ch. 2 · AIM 8-1-1 · EASA MED.A.020",
        "FAA PHAK ch. 2 · AIM 8-1-1 · EASA MED.A.020",
      ),
      reader: L(
        "The IMSAFE checklist (FAA PHAK ch. 2): Illness, Medication, Stress, Alcohol, Fatigue, Emotion. Under EASA MED.A.020, a licence holder must not fly when aware of any decrease in medical fitness that might make it unsafe, or when taking medication or treatment that might interfere with safe flight; seek the advice of an aero-medical examiner. FAA AIM 8-1-1 gives the same advice for the US.",
        "La liste IMSAFE (FAA PHAK ch. 2) : Illness (maladie), Medication (médicaments), Stress, Alcohol (alcool), Fatigue, Emotion. Selon l’EASA MED.A.020, le titulaire d’une licence ne doit pas voler s’il a conscience d’une diminution de son aptitude médicale qui pourrait compromettre la sécurité, ou s’il prend un médicament ou un traitement susceptible de gêner le vol ; demandez conseil à un médecin examinateur. L’AIM 8-1-1 de la FAA donne les mêmes conseils aux États-Unis.",
      ),
    }),
    // 11 ----------------------------------------------------------------- alcohol
    quizStep("hp-alcohol", {
      eyebrow: L("Question", "Question"),
      title: L("Bottle to throttle", "Du verre au vol"),
      quote: L(
        "14 CFR 91.17: no flying within … hours of alcohol, nor at … % blood alcohol.",
        "14 CFR 91.17 : pas de vol dans les … heures suivant l’alcool, ni à … % d’alcool dans le sang.",
      ),
      quiz: mcq(
        L("Fill in the FAA limits.", "Complétez les limites FAA."),
        [
          {
            text: L("8 h · 0.04 %", "8 h · 0,04 %"),
            why: L("Right: the US rule.", "Juste : la règle américaine."),
          },
          {
            text: L("12 h · 0.02 %", "12 h · 0,02 %"),
            why: L(
              "Stricter than the rule, not the rule.",
              "Plus strict que la règle, pas la règle.",
            ),
          },
          {
            text: L("4 h · 0.08 %", "4 h · 0,08 %"),
            why: L(
              "Far too short; 0.08 % is a US road limit.",
              "Bien trop court ; 0,08 % est une limite routière américaine.",
            ),
          },
        ],
        0,
        L(
          "8 hours, 0.04 %. In France and Europe, your national rule and your club’s rule apply: often stricter.",
          "8 heures, 0,04 %. En France et en Europe, la règle nationale et celle du club s’appliquent : souvent plus strictes.",
        ),
      ),
      foot: L(
        "14 CFR 91.17 · FAA AIM 8-1-1 · national rules apply outside the US",
        "14 CFR 91.17 · FAA AIM 8-1-1 · hors États-Unis, les règles nationales",
      ),
      reader: L(
        "14 CFR 91.17: no one may act as a crew member within 8 hours after drinking alcohol, while under its influence, or with a blood alcohol concentration of 0.04 % or more. The AIM advises a much longer margin, since impairment lasts beyond the legal limit. Outside the US your national rule applies, and many clubs set their own, stricter rule.",
        "14 CFR 91.17 : personne ne peut être membre d’équipage dans les 8 heures qui suivent la consommation d’alcool, sous son influence, ou avec une alcoolémie de 0,04 % ou plus. L’AIM conseille une marge bien plus longue, car les effets durent au-delà de la limite légale. Hors des États-Unis, la règle nationale s’applique, et beaucoup de clubs fixent la leur, plus stricte.",
      ),
    }),
    // 12 ----------------------------------------------------------------- threat and error management
    heroStep("hp-tem", {
      eyebrow: L("Decision-making", "La prise de décision"),
      title: L(
        "Threats, errors, undesired states",
        "Menaces, erreurs, états indésirables",
      ),
      visual: [
        IMG(
          { lib: "photo:in-cloud" },
          L(
            "A Cessna 172 flying close to cloud",
            "Un Cessna 172 qui vole près des nuages",
          ),
          G.left,
          288,
          960,
          696,
          {
            attribution: IMG_CLOUD,
          },
        ),
      ],
      points: [
        {
          heading: L("Threats", "Menaces"),
          body: L(
            "Weather, terrain, traffic: outside your control.",
            "Météo, relief, trafic : hors de votre contrôle.",
          ),
          color: "key",
        },
        {
          heading: L("Errors", "Erreurs"),
          body: L(
            "Your own actions, or things left undone.",
            "Vos actions, ou ce qui n’a pas été fait.",
          ),
          color: "stop",
        },
        {
          heading: L("Undesired states", "États indésirables"),
          body: L(
            "Catch them early: PAVE before, DECIDE during.",
            "Rattrapez-les tôt : PAVE avant, DECIDE pendant.",
          ),
        },
      ],
      foot: L(
        "ICAO threat and error management · FAA PHAK ch. 2 (PAVE, DECIDE)",
        "Gestion des menaces et des erreurs OACI · FAA PHAK ch. 2 (PAVE, DECIDE)",
      ),
      reader: L(
        "Threat and error management: threats are events outside the pilot’s control (weather, terrain, traffic, the aircraft); errors are the pilot’s own actions or omissions; an undesired aircraft state is where unmanaged threats and errors lead. Before the flight, the FAA’s PAVE checklist looks at the Pilot, the Aircraft, the enVironment and the External pressures; during it, DECIDE structures a decision: Detect, Estimate, Choose, Identify, Do, Evaluate (FAA PHAK ch. 2).",
        "Gestion des menaces et des erreurs : les menaces sont des événements hors du contrôle du pilote (météo, relief, trafic, l’avion) ; les erreurs sont ses propres actions ou omissions ; l’état indésirable de l’avion est là où mènent menaces et erreurs non gérées. Avant le vol, la liste PAVE de la FAA regarde le Pilote, l’Avion (Aircraft), l’enVironnement et les pressions Externes ; pendant le vol, DECIDE structure une décision : détecter, estimer, choisir, identifier, agir, évaluer (FAA PHAK ch. 2).",
      ),
    }),
    // 13 ----------------------------------------------------------------- the early 180
    quizStep("hp-180", {
      eyebrow: L("Question", "Question"),
      title: L("The ceiling lowers ahead", "Le plafond s’abaisse devant"),
      quote: L(
        "VFR, the hills ahead in cloud, the ground getting closer.",
        "En VFR, les collines devant dans les nuages, le sol qui se rapproche.",
      ),
      quiz: mcq(
        L("What do you do?", "Que faites-vous ?"),
        [
          {
            text: L(
              "Turn back now, while it is clear behind",
              "Faire demi-tour maintenant, tant que c’est clair derrière",
            ),
            why: L(
              "Right: the early 180° keeps the horizon.",
              "Juste : le demi-tour précoce garde l’horizon.",
            ),
          },
          {
            text: L(
              "Press on lower, below the cloud",
              "Continuer plus bas, sous les nuages",
            ),
            why: L(
              "Lower means closer to terrain, with less room.",
              "Plus bas, c’est plus près du relief, avec moins de marge.",
            ),
          },
          {
            text: L("Climb into the cloud", "Monter dans les nuages"),
            why: L(
              "Without training: 178 s on average.",
              "Sans entraînement : 178 s en moyenne.",
            ),
          },
        ],
        0,
        L(
          "Decide early: a turn back in clear air is the safest manoeuvre you have.",
          "Décidez tôt : un demi-tour en air clair est la manœuvre la plus sûre.",
        ),
      ),
      foot: L(
        "FAA PHAK ch. 2 · C172S POH sect. 3: executing a 180° turn in clouds",
        "FAA PHAK ch. 2 · C172S POH sect. 3 : demi-tour en nuages",
      ),
      reader: L(
        "A lowering ceiling over rising ground is a classic threat. The safe answer is the early 180° turn, made while the horizon and the way back are still clear. Pressing on below the cloud trades height for nothing; climbing into it without instrument training leads to loss of control in minutes. If you do enter cloud, the C172S POH has a procedure: note the compass heading, a standard-rate turn on the turn coordinator for 60 seconds, then check the compass shows the reciprocal.",
        "Un plafond qui baisse sur un relief qui monte est une menace classique. La bonne réponse est le demi-tour précoce, fait tant que l’horizon et le chemin du retour sont encore clairs. Continuer sous les nuages échange de la hauteur contre rien ; monter dedans sans formation aux instruments mène à la perte de contrôle en quelques minutes. Si vous entrez en nuage, le POH du C172S prévoit une procédure : noter le cap compas, virer au taux standard à l’indicateur de virage pendant 60 secondes, puis vérifier que le compas indique le cap inverse.",
      ),
    }),
    // 14 ----------------------------------------------------------------- recap
    recapStep("hp-recap", {
      title: L("Three numbers to remember", "Trois chiffres à retenir"),
      cols: [
        {
          n: S("178 s"),
          text: L(
            "to loss of control, untrained, in cloud",
            "avant la perte de contrôle, sans formation",
          ),
          color: "stop",
        },
        {
          n: S("30"),
          text: L(
            "minutes above 10,000 ft cabin, then crew oxygen (EASA)",
            "minutes au-dessus de 10 000 ft cabine, puis oxygène (EASA)",
          ),
          color: "key",
        },
        {
          n: S("8 h"),
          text: L(
            "bottle to throttle, at least (FAA)",
            "entre le verre et le vol, au minimum (FAA)",
          ),
          color: "key",
        },
      ],
      checks: [
        L(
          "Believe the instruments, not the feeling",
          "Croire les instruments, pas les sensations",
        ),
        L(
          "Spiral: idle, wings level, then pull",
          "Spirale : réduire, ailes à plat, puis tirer",
        ),
        L("IMSAFE, and an early 180°", "IMSAFE, et un demi-tour précoce"),
      ],
      foot: L(
        "FAA PHAK ch. 2 and 17 · AIM ch. 8 · NCO.OP.190 · 14 CFR 91.17",
        "FAA PHAK ch. 2 et 17 · AIM ch. 8 · NCO.OP.190 · 14 CFR 91.17",
      ),
      reader: L(
        "178 seconds: the average time to loss of control of untrained pilots in cloud (1954). 10,000 ft cabin altitude: crew oxygen beyond 30 minutes under EASA NCO.OP.190. 8 hours: the FAA minimum between alcohol and flight (14 CFR 91.17). Believe the instruments; out of a spiral, idle and wings level before pulling; check IMSAFE and turn back early.",
        "178 secondes : le temps moyen avant la perte de contrôle de pilotes non formés en nuage (1954). 10 000 ft d’altitude cabine : oxygène pour l’équipage au-delà de 30 minutes selon l’EASA NCO.OP.190. 8 heures : le minimum FAA entre l’alcool et le vol (14 CFR 91.17). Croyez les instruments ; en spirale, réduisez et mettez les ailes à plat avant de tirer ; vérifiez IMSAFE et faites demi-tour tôt.",
      ),
    }),
    // 15 ----------------------------------------------------------------- fly it
    flyStep(
      "hp-fly-unusual",
      "bai-unusual",
      L(
        "Fly it: unusual attitude recovery",
        "En vol : sortie de position inusuelle",
      ),
      L(
        "Two attitudes to recover on the instruments: nose high and slow, then nose low and spiralling.",
        "Deux positions à rattraper aux instruments : nez haut et lent, puis nez bas en spirale.",
      ),
      [
        L(
          "Nose high: full power, nose down, wings level",
          "Nez haut : plein gaz, nez à l’horizon, ailes à plat",
        ),
        L(
          "Nose low: idle, wings level first, then ease up",
          "Nez bas : réduire, ailes à plat d’abord, puis ressource",
        ),
      ],
      4,
    ),
    // 16 ----------------------------------------------------------------- fly it
    flyStep(
      "hp-fly-pp",
      "pp-unusual",
      L(
        "Fly it: with the attitude indicator failed",
        "En vol : horizon en panne",
      ),
      L(
        "The same nose-low recovery, with the primary attitude failed: standby instruments, airspeed and altimeter trends.",
        "La même sortie nez bas, avec l’horizon principal en panne : instruments de secours, tendances de vitesse et d’altitude.",
      ),
      [
        L(
          "Speed up and altitude down: nose low",
          "Vitesse qui monte, altitude qui baisse : nez bas",
        ),
        L(
          "Trust the instruments that agree",
          "Croyez les instruments qui s’accordent",
        ),
      ],
      4,
    ),
  ];
  return course(
    {
      id: PPL_HUMAN_PERFORMANCE_ID,
      title: L(
        "Human performance: spatial disorientation and fitness to fly",
        "Performances humaines : désorientation spatiale et aptitude au vol",
      ),
      summary: L(
        "Why the inner ear lies in cloud, the illusions and the spiral, a spiral recovery on the live instruments, vision, oxygen, IMSAFE and alcohol, threat and error management and the early 180° turn.",
        "Pourquoi l’oreille interne ment en nuage, les illusions et la spirale, une sortie de spirale sur les instruments en direct, la vision, l’oxygène, IMSAFE et l’alcool, la gestion des menaces et des erreurs et le demi-tour précoce.",
      ),
      cockpit: "steam",
      theme: "classroom",
      tags: [
        "lapl-ppl",
        "ppl",
        "lapl",
        "easa",
        "faa",
        "c172s",
        "human-performance",
        "safety",
      ],
      minutes: 45,
    },
    steps,
    scenes(),
  );
}
