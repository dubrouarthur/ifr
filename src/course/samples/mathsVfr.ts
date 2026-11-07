// Ground school — built-in sample "Maths for VFR" (16 steps): the navigation log and the performance numbers of a
// VFR flight, each taught on a designed slide with a live diagram, practised with generated problems, then used in
// the simulator: compute a compass heading, then fly it and hold the track.
// Sources: FAA-H-8083-25 Pilot's Handbook of Aeronautical Knowledge (ch. 8 altimetry, ch. 11 performance, ch. 16
// navigation), the C172S POH section 6 (weight and balance, sample figures for training only), EASA Part-NCO
// (fuel), 14 CFR 91.151 (VFR fuel).
import type { Course, InstrumentView, SimScene, Step } from "../types";
import {
  CALLOUT,
  DIAGRAM,
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
  scene,
  slideStep,
  step,
} from "./kit";

import { WB } from "../calc/vfr/performance";

export const MATHS_VFR_ID = "sample-maths-vfr";

const ALT: InstrumentView = { kind: "gauge", gauge: "alt" };

export function mathsVfrScenes(): Record<string, SimScene> {
  return {
    "mv.field": scene(
      "mv.field",
      {
        pos: { runway: { icao: "MSVL", id: "21" }, distNm: 0 },
        altFt: 1150,
        hdg: 210,
        iasKt: 0,
        radios: { baro: 29.92 },
      },
      {
        label: "MSVL runway 21 · 1,150 ft · hot day",
        weather: { oatSeaLevelC: 33 },
      },
    ),
  };
}

function card(
  x: number,
  y: number,
  w: number,
  h: number,
  n: [string, string],
  c: [string, string],
  reveal?: number,
) {
  const r = reveal ? { reveal } : {};
  return [
    SHAPE("roundRect", x, y, w, h, {
      fill: "surface",
      stroke: "line",
      strokeW: 2,
      ...(reveal ? { reveal: { order: reveal } } : {}),
    }),
    T("number", L(n[0], n[1]), x + 36, y + 24, w - 72, 132, r),
    T("body", L(c[0], c[1]), x + 36, y + 160, w - 72, h - 184, r),
  ];
}

function cover(): Step {
  return slideStep(
    "mv-cover",
    L("Maths for VFR", "Les maths du VFR"),
    canvas([
      T(
        "label",
        L("Ground school · Flight planning", "Théorie · Préparation du vol"),
        M.x,
        168,
        816,
        48,
      ),
      SHAPE("rect", M.x, 240, 96, 8, { fill: "accent", stroke: null }),
      T("display", L("Maths for VFR", "Les maths du VFR"), M.x, 264, 816, 336, {
        valign: "bottom",
      }),
      T(
        "subtitle",
        L(
          "From true course to compass heading, wind, fuel, crosswind, performance and balance — then fly the heading you computed",
          "De la route vraie au cap compas, le vent, le carburant, le vent de travers, les performances et le centrage — puis volez le cap calculé",
        ),
        M.x,
        624,
        768,
        216,
      ),
      T(
        "caption",
        L(
          "16 steps · about 40 min · new numbers on every attempt",
          "16 étapes · environ 40 min · de nouveaux chiffres à chaque essai",
        ),
        M.x,
        912,
        768,
        48,
      ),
      ...card(
        1008,
        168,
        384,
        312,
        ["E −  W +", "E −  W +"],
        ["East is least, West is best", "Est on retranche, Ouest on ajoute"],
      ),
      ...card(
        1440,
        168,
        384,
        312,
        ["½", "½"],
        [
          "of the wind across at 30° off the runway",
          "du vent en travers à 30° de la piste",
        ],
      ),
      ...card(
        1008,
        528,
        384,
        312,
        ["6 lb", "6 lb"],
        [
          "per US gallon of avgas (≈ 0.72 kg/L)",
          "par gallon US d’avgas (≈ 0,72 kg/L)",
        ],
      ),
      ...card(
        1440,
        528,
        384,
        312,
        ["1013", "1013"],
        [
          "hPa = 29.92 inHg, the standard setting",
          "hPa = 29,92 inHg, le calage standard",
        ],
      ),
    ]),
    [
      {
        t: "text",
        text: L(
          "The VFR navigation log and performance numbers, with a diagram for each and the simulator at the end.",
          "Le log de navigation VFR et les chiffres de performance, avec un schéma pour chacun et le simulateur pour finir.",
        ),
      },
    ],
  );
}

function tvmdc(): Step {
  return slideStep(
    "mv-tvmdc",
    L("From true course to compass heading", "De la route vraie au cap compas"),
    canvas([
      T(
        "label",
        L("Navigation · FAA PHAK ch. 16", "Navigation · FAA PHAK ch. 16"),
        M.x,
        96,
        960,
        48,
      ),
      T(
        "title",
        L(
          "True → Variation → Magnetic → Deviation → Compass",
          "Vrai → Déclinaison → Magnétique → Déviation → Compas",
        ),
        M.x,
        144,
        1728,
        108,
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
        M.x,
        288,
        1104,
        432,
        {
          interactive: true,
          caption: L(
            "Drag each correction: the headings follow.",
            "Déplacez chaque correction : les caps suivent.",
          ),
        },
      ),
      ...(
        [
          [
            "TC 090",
            "Rv 090",
            "true course from the chart",
            "route vraie sur la carte",
          ],
          [
            "TH 082",
            "Cv 082",
            "wind correction into the wind",
            "correction de dérive face au vent",
          ],
          [
            "MH 085",
            "Cm 085",
            "variation 3° W: add",
            "déclinaison 3° W : on ajoute",
          ],
          [
            "CH 087",
            "Cc 087",
            "deviation from the compass card",
            "déviation lue sur la carte du compas",
          ],
        ] as [string, string, string, string][]
      ).flatMap(([a, af, b, bf], i) => {
        const x = M.x + i * 282;
        return [
          T("heading", L(a, af), x, 744, 264, 60, { reveal: i + 1 }),
          T("caption", L(b, bf), x, 804, 264, 96, { reveal: i + 1 }),
        ];
      }),
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
        1296,
        288,
        528,
        600,
      ),
    ]),
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

function windSlide(): Step {
  return slideStep(
    "mv-wind",
    L("Ground speed and time en route", "Vitesse sol et temps de vol"),
    canvas([
      T(
        "label",
        L(
          "Wind triangle · FAA PHAK ch. 16",
          "Triangle des vents · FAA PHAK ch. 16",
        ),
        M.x,
        96,
        960,
        48,
      ),
      T(
        "title",
        L("The wind triangle", "Le triangle des vents"),
        M.x,
        144,
        1728,
        108,
      ),
      DIAGRAM(
        "mv-wind.d",
        {
          kind: "calc",
          calc: {
            kind: "windTriangle",
            course: 40,
            tasKt: 100,
            windDir: 300,
            windKt: 20,
            drag: ["wind", "tas"],
          },
        },
        L(
          "Wind triangle: course 040, 100 KTAS, wind 300 at 20 kt",
          "Triangle des vents : route 040, 100 kt de Vp, vent 300 pour 20 kt",
        ),
        M.x,
        288,
        1008,
        696,
        {
          interactive: true,
          caption: L(
            "Drag the wind or the airspeed.",
            "Déplacez le vent ou la vitesse propre.",
          ),
        },
      ),
      MARK(1, 1200, 320, { size: 56 }),
      T(
        "body",
        L(
          "**Heading** = course + the wind correction angle, into the wind.",
          "**Cap** = route + l’angle de dérive, face au vent.",
        ),
        1248,
        288,
        576,
        144,
      ),
      MARK(2, 1200, 488, { size: 56, reveal: 1 }),
      T(
        "body",
        L(
          "**Ground speed** = TAS minus the headwind component (plus a tailwind).",
          "**Vitesse sol** = Vp moins la composante de face (plus un vent arrière).",
        ),
        1248,
        456,
        576,
        144,
        { reveal: 1 },
      ),
      MARK(3, 1200, 656, { size: 56, reveal: 2 }),
      T(
        "body",
        L(
          "**Time en route** = distance ÷ ground speed × 60 (minutes).",
          "**Temps de vol** = distance ÷ vitesse sol × 60 (minutes).",
        ),
        1248,
        624,
        576,
        144,
        { reveal: 2 },
      ),
      CALLOUT(
        undefined,
        L(
          "A 60 kt ground speed is 1 NM per minute: count from there.",
          "60 kt de vitesse sol, c’est 1 NM par minute : comptez à partir de là.",
        ),
        1200,
        840,
        624,
        120,
        { tone: "accent", reveal: 3 },
      ),
    ]),
    [
      {
        t: "formula",
        formula: L(
          "WCA = asin(W · sin θ ÷ TAS); ETE (min) = distance ÷ GS × 60",
          "Dérive = asin(V · sin θ ÷ Vp) ; temps (min) = distance ÷ Vs × 60",
        ),
        ruleOfThumb: L(
          "Max drift ≈ wind × 60 ÷ TAS (degrees).",
          "Dérive max ≈ vent × 60 ÷ Vp (degrés).",
        ),
        refs: [{ src: "FAA-PHAK", ref: "ch. 16" }],
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

function crosswindSlide(): Step {
  const rows: [string, string, string][] = [
    ["15°", "¼", "sin 15° = 0.26"],
    ["30°", "½", "sin 30° = 0.50"],
    ["45°", "¾", "sin 45° = 0.71"],
    ["60°+", "all", "sin 60° = 0.87"],
  ];
  return slideStep(
    "mv-xwind",
    L("Crosswind: the clock code", "Vent de travers : la règle de l’horloge"),
    canvas([
      T(
        "label",
        L("Crosswind · FAA Airplane Flying Handbook", "Vent de travers · FAA Airplane Flying Handbook"),
        M.x,
        96,
        960,
        48,
      ),
      T(
        "title",
        L(
          "Crosswind: the clock code",
          "Vent de travers : la règle de l’horloge",
        ),
        M.x,
        144,
        1728,
        108,
      ),
      IMG(
        { lib: "icon:windsock" },
        L("Windsock", "Manche à air"),
        M.x,
        312,
        144,
        144,
        { fit: "contain" },
      ),
      T(
        "body",
        L(
          "Angle between the wind and the runway, read as minutes on a clock: that fraction of an hour is the fraction of the wind across.",
          "L’angle entre le vent et la piste, lu comme des minutes sur une horloge : cette fraction d’heure est la fraction du vent en travers.",
        ),
        M.x + 192,
        312,
        840,
        168,
      ),
      ...rows.flatMap(([a, f, s], i) => {
        const x = M.x + i * 264;
        return [
          SHAPE("roundRect", x, 528, 240, 312, {
            fill: "surface",
            stroke: "line",
            strokeW: 2,
            reveal: { order: 1 },
          }),
          T("heading", L(a, a), x + 24, 552, 192, 60, { reveal: 1 }),
          T("number", L(f, f === "all" ? "tout" : f), x + 24, 624, 192, 132, {
            reveal: 1,
          }),
          T("caption", L(s, s.replace(".", ",")), x + 24, 768, 192, 48, {
            reveal: 1,
            color: "muted",
          }),
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
                "That is the headwind (cos 30°): sine and cosine swapped.",
                "C’est la composante de face (cos 30°) : sinus et cosinus inversés.",
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
        1200,
        288,
        624,
        552,
      ),
      T(
        "caption",
        L(
          "Compare with the maximum demonstrated crosswind in the POH (15 kt for a C172S).",
          "Comparez avec le vent de travers maximal démontré du manuel de vol (15 kt pour un C172S).",
        ),
        1200,
        888,
        624,
        96,
      ),
    ]),
    [
      {
        t: "formula",
        formula: L(
          "crosswind = W · sin θ; headwind = W · cos θ",
          "travers = V · sin θ ; face = V · cos θ",
        ),
        ruleOfThumb: L(
          "15° → ¼, 30° → ½, 45° → ¾, 60° and more → all of it.",
          "15° → ¼, 30° → ½, 45° → ¾, 60° et plus → tout.",
        ),
        refs: [{ src: "FAA-AFH", ref: "crosswind approach and landing" }],
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

function performanceSlide(): Step {
  return slideStep(
    "mv-perf",
    L("Density altitude on a hot day", "L’altitude-densité par forte chaleur"),
    canvas(
      [
        T(
          "label",
          L("Performance · FAA PHAK ch. 11", "Performances · FAA PHAK ch. 11"),
          M.x,
          96,
          960,
          48,
        ),
        T(
          "title",
          L(
            "Hot and high: the aeroplane feels higher",
            "Chaud et haut : l’avion se croit plus haut",
          ),
          M.x,
          144,
          1728,
          108,
        ),
        INST(
          ALT,
          L(
            "Altimeter set to 29.92 at Mistral Valley, 1,150 ft",
            "Altimètre calé sur 29,92 à Mistral Valley, 1 150 ft",
          ),
          M.x,
          288,
          528,
          528,
          {
            scene: "mv.field",
          },
        ),
        ...card(
          672,
          288,
          552,
          264,
          ["PA", "Zp"],
          [
            "elevation + (29.92 − altimeter) × 1,000 ft",
            "altitude + (29,92 − calage) × 1 000 ft",
          ],
        ),
        ...card(
          672,
          576,
          552,
          264,
          ["DA", "Zd"],
          [
            "PA + 120 ft per °C above ISA",
            "Zp + 120 ft par °C au-dessus d’ISA",
          ],
          1,
        ),
        {
          id: "mv-perf.calc",
          frame: { x: 1272, y: 288, w: 552, h: 720, z: 2 },
          kind: "calc",
          calc: { generatorId: "vfr.pressureDensityAltitude" },
          show: ["prompt", "givens"],
        },
        T(
          "body",
          L(
            "Enter the POH takeoff and climb tables with the PRESSURE altitude and the OAT: the tables already account for density. Density altitude tells you how the aeroplane will feel: a longer run, a weaker climb (FAA PHAK ch. 11).",
            "Entrez dans les tables de décollage et de montée du manuel de vol avec l’altitude-PRESSION et la température extérieure : les tables tiennent déjà compte de la densité. L’altitude-densité dit comment l’avion se comportera : une course plus longue, une montée plus faible (FAA PHAK ch. 11).",
          ),
          M.x,
          864,
          1128,
          144,
          { reveal: 2 },
        ),
      ],
      { scene: "mv.field" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "PA = elevation + (29.92 − altimeter) × 1,000; DA ≈ PA + 120 × (OAT − ISA)",
          "Zp = altitude + (29,92 − calage) × 1 000 ; Zd ≈ Zp + 120 × (T − ISA)",
        ),
        ruleOfThumb: L(
          "ISA is 15 °C at sea level, 2 °C colder per 1,000 ft.",
          "ISA vaut 15 °C au niveau de la mer, 2 °C de moins par 1 000 ft.",
        ),
        refs: [{ src: "FAA-PHAK", ref: "ch. 11" }],
      },
    ],
    { kind: "explain", minutes: 3 },
  );
}

function wbSlide(): Step {
  // C172S sample loading: the same sample figures as the W&B generator (calc/vfr/performance.ts WB), so the slide
  // and the exercise after it never disagree
  const empty = { w: WB.emptyLb, m: Math.round(WB.emptyLb * WB.emptyArm) };
  const front = { w: 340, m: 340 * WB.frontArm };
  const fuel = { w: 240, m: 240 * WB.fuelArm };
  const bag = { w: 20, m: 20 * WB.bag1Arm };
  const total = {
    w: empty.w + front.w + fuel.w + bag.w,
    m: empty.m + front.m + fuel.m + bag.m,
  };
  const cg = Math.round((total.m / total.w) * 10) / 10;
  const n = (v: number) => v.toLocaleString("en-US");
  const nf = (v: number) => v.toLocaleString("fr-FR");
  return slideStep(
    "mv-wb",
    L("Weight and balance", "Masse et centrage"),
    canvas([
      T(
        "label",
        L(
          "Weight and balance · C172S POH section 6 (sample figures)",
          "Masse et centrage · manuel de vol C172S section 6 (exemple)",
        ),
        M.x,
        96,
        1440,
        48,
      ),
      T(
        "title",
        L(
          "Moments, then the CG on the envelope",
          "Les moments, puis le centrage dans l’enveloppe",
        ),
        M.x,
        144,
        1728,
        108,
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
        1152,
        264,
        672,
        720,
        { interactive: true },
      ),
      SHAPE("roundRect", M.x, 288, 960, 552, {
        fill: "surface",
        stroke: "line",
        strokeW: 2,
      }),
      T(
        "mono",
        L(
          `Item          lb     arm   moment\nEmpty       ${n(empty.w)}   ${WB.emptyArm.toFixed(1)}   ${n(empty.m)}\nFront seats   340   37.0   ${n(front.m)}\nFuel 40 gal   240   48.0   ${n(fuel.m)}\nBaggage        20   95.0    ${n(bag.m)}\nTotal       ${n(total.w)}          ${n(total.m)}`,
          `Poste         lb     bras   moment\nÀ vide      ${nf(empty.w)}   ${WB.emptyArm.toFixed(1).replace(".", ",")}   ${nf(empty.m)}\nSièges AV     340   37,0   ${nf(front.m)}\nCarb. 40 gal  240   48,0   ${nf(fuel.m)}\nBagages        20   95,0    ${nf(bag.m)}\nTotal       ${nf(total.w)}          ${nf(total.m)}`,
        ),
        M.x + 36,
        312,
        888,
        432,
      ),
      T(
        "body",
        L(
          `CG = total moment ÷ total weight = **${cg} in** aft of the datum.`,
          `Centrage = moment total ÷ masse totale = **${String(cg).replace(".", ",")} in** en arrière de la référence.`,
        ),
        M.x + 36,
        756,
        888,
        72,
        { reveal: 1 },
      ),
      T(
        "caption",
        L(
          "Avgas 6 lb per US gallon. Training figures: always use your aeroplane's own weighing report.",
          "Avgas 6 lb par gallon US. Chiffres d’exercice : utilisez toujours la pesée de votre avion.",
        ),
        M.x,
        888,
        960,
        72,
      ),
    ]),
    [
      {
        t: "formula",
        formula: L(
          "moment = weight × arm; CG = Σ moments ÷ Σ weights",
          "moment = masse × bras ; centrage = Σ moments ÷ Σ masses",
        ),
        ruleOfThumb: L(
          "Avgas: 6 lb per US gallon.",
          "Avgas : 6 lb par gallon US.",
        ),
        refs: [{ src: "FAA-PHAK", ref: "ch. 10" }],
      },
    ],
    { kind: "explain", minutes: 3 },
  );
}

/** The Maths for VFR sample (16 steps). */
export function mathsVfrCourse(): Course {
  const steps: Step[] = [
    cover(),
    tvmdc(),
    step(
      "mv-tvmdc-calc",
      "calc",
      L("Your compass heading", "Votre cap compas"),
      [],
      { minutes: 3, calc: { generatorId: "vfr.tvmdc" } },
    ),
    step(
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
      { minutes: 3, calcLink: { step: "mv-tvmdc-calc", use: "both" } },
    ),
    windSlide(),
    step(
      "mv-gs-calc",
      "calc",
      L("Ground speed and time en route", "Vitesse sol et temps de vol"),
      [],
      {
        minutes: 3,
        calc: { generatorId: "vfr.groundSpeedEte" },
      },
    ),
    step(
      "mv-fuel-calc",
      "calc",
      L("Fuel, endurance and reserve", "Carburant, autonomie et réserve"),
      [],
      {
        minutes: 3,
        calc: { generatorId: "vfr.fuelEndurance" },
      },
    ),
    crosswindSlide(),
    step(
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
    ),
    performanceSlide(),
    step(
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
    ),
    wbSlide(),
    step(
      "mv-wb-calc",
      "calc",
      L("Inside the envelope?", "Dans l’enveloppe ?"),
      [],
      { minutes: 4, calc: { generatorId: "vfr.weightBalance" } },
    ),
    step(
      "mv-units-calc",
      "calc",
      L("Unit conversions", "Conversions d’unités"),
      [],
      { minutes: 2, calc: { generatorId: "vfr.unitConversion" } },
    ),
    step(
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
    ),
    step(
      "mv-fly",
      "fly",
      L("Fly it: the heading you computed", "À vous : le cap calculé"),
      [],
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
          returnTo: "thisStep",
        },
      },
    ),
  ];
  return course(
    {
      id: MATHS_VFR_ID,
      title: L("Maths for VFR", "Les maths du VFR"),
      summary: L(
        "TVMDC, the wind triangle, fuel, the crosswind clock code, density altitude, takeoff factors and weight and balance — generated problems, a drill, then fly the heading you computed.",
        "Rv → Cc, le triangle des vents, le carburant, la règle de l’horloge, l’altitude-densité, les distances et le centrage — des problèmes générés, une série, puis volez le cap calculé.",
      ),
      cockpit: "steam",
      theme: "classroom",
      tags: ["maths", "vfr", "calculation", "navigation"],
      minutes: 40,
    },
    steps,
    mathsVfrScenes(),
  );
}
