// Ground school — built-in sample "Maths for VFR" (22 steps), slides first: a cover, why it matters (the fuel
// question straight away), the navigation log and the performance numbers on designed slides (each with a live
// diagram or instrument), the takeaways; then the generated problems (new numbers on every attempt), a drill, the
// page to keep, and the simulator: compute a compass heading, then fly it and hold the track. Laid out on the
// design-system archetypes (SPEC slides v2 §8, mathsSlides.ts): classroom theme, formulas in the formula style.
// Sources: FAA-H-8083-25 Pilot's Handbook of Aeronautical Knowledge (ch. 8 altimetry, ch. 11 performance, ch. 16
// navigation), FAA-H-8083-3 Airplane Flying Handbook (crosswind), the C172S POH (section 4 maximum demonstrated
// crosswind 15 kt, section 6 weight and balance; sample figures for training only), 14 CFR 91.151 and EASA
// Part-NCO (VFR fuel: 30 min by day).
import type { Course, InstrumentView, SimScene, Step } from "../types";
import {
  DIAGRAM,
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
  head,
  lead,
  recapBlocks,
  rule,
  sectionBlocks,
  sheetBlocks,
} from "./mathsSlides";

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

const WIND = {
  kind: "windTriangle" as const,
  course: 40,
  tasKt: 100,
  windDir: 300,
  windKt: 20,
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
          "Heading, wind, fuel, crosswind, performance and balance — each tried on a live diagram, then flown.",
          "Cap, vent, carburant, vent de travers, performances et centrage — chacun essayé sur un schéma vivant, puis volé.",
        ),
        meta: L(
          "22 steps · about 50 min · new numbers on every attempt",
          "22 étapes · environ 50 min · de nouveaux chiffres à chaque essai",
        ),
        hero: [
          DIAGRAM(
            "mv-cover.d",
            { kind: "calc", calc: { ...WIND } },
            L(
              "Wind triangle: course 040, 100 KTAS, wind 300 at 20 kt",
              "Triangle des vents : route 040, 100 kt de Vp, vent 300 pour 20 kt",
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
          "The VFR navigation log and performance numbers, with a diagram for each and the simulator at the end.",
          "Le log de navigation VFR et les chiffres de performance, avec un schéma pour chacun et le simulateur pour finir.",
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
          "Day VFR: fuel for the flight plus 30 minutes at normal cruise (14 CFR 91.151; EASA Part-NCO). 1 h 30 at 9 gal/h: 2 h × 9 = 18 US gal, plus taxi.",
          "VFR de jour : le carburant du vol plus 30 minutes en croisière normale (14 CFR 91.151 ; EASA Part-NCO). 1 h 30 à 9 gal/h : 2 h × 9 = 18 gal US, plus le roulage.",
        ),
      },
    ],
    { minutes: 2 },
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
      "+ 3° W de déclinaison : on ajoute",
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
            "True, Variation, Magnetic, Deviation, Compass — always in that order.",
            "Vrai, déclinaison, magnétique, déviation, compas — toujours dans cet ordre.",
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
      "Course ± the drift, into the wind: **029°** for 300/20 on 040.",
      "Route ± la dérive, face au vent : **029°** pour 300/20 sur 040.",
      "sel",
    ],
    [
      "Ground speed",
      "Vitesse sol",
      "TAS ± the wind along the track: **102 kt** here.",
      "Vp ± le vent dans l’axe : **102 kt** ici.",
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
            "Wind triangle: course 040, 100 KTAS, wind 300 at 20 kt",
            "Triangle des vents : route 040, 100 kt de Vp, vent 300 pour 20 kt",
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
            T("heading", L(a, a), x, 336, 384, 56, { color: "muted" }),
            T("number", L(n, nf), x, 392, 384, 104),
            T("small", L(s, sf), x, 504, 384, 40),
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
          G.left,
          568,
          1680,
          416,
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

/** A8 with an instrument — density altitude on a hot day: the altimeter at 29.92, the rule, the worked lines. */
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
            "Set 29.92: the altimeter shows pressure altitude, here 1,150 ft.",
            "Calez 1013 hPa (29,92) : l’altimètre affiche l’altitude-pression, ici 1 150 ft.",
          ),
          1560,
        ),
        INST(
          ALT,
          L(
            "Altimeter set to 29.92 at Mistral Valley, 1,150 ft",
            "Altimètre calé sur 29,92 à Mistral Valley, 1 150 ft",
          ),
          G.left,
          336,
          624,
          624,
          { scene: "mv.field" },
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
        rule(840, 560, 960),
        T(
          "formula",
          L(
            "ISA | = 15 − 2 × 1.15 ≈ 13\u00a0°C",
            "ISA | = 15 − 2 × 1,15 ≈ 13\u00a0°C",
          ),
          840,
          592,
          960,
          80,
          { reveal: 1 },
        ),
        T(
          "formula",
          L(
            "DA | ≈ 1,150 + 120 × 18 = !3,310 ft!",
            "Zd | ≈ 1 150 + 120 × 18 = !3 310 ft!",
          ),
          840,
          688,
          960,
          80,
          { reveal: 2 },
        ),
        T(
          "body",
          L(
            "Enter the POH tables with **pressure altitude** and OAT: they already include density. DA says how it will feel: a longer run, a weaker climb.",
            "Entrez dans les tables du manuel avec l’**altitude-pression** et la température : elles tiennent déjà compte de la densité. La Zd dit le ressenti : course plus longue, montée plus faible.",
          ),
          840,
          800,
          960,
          160,
          { reveal: 3 },
        ),
        foot(
          L(
            "FAA PHAK ch. 11 · field 1,150 ft, 29.92 in, OAT 31 °C",
            "FAA PHAK ch. 11 · terrain 1 150 ft, 1013 hPa, 31 °C",
          ),
        ),
      ],
      { scene: "mv.field", layout: "formula" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "PA = elevation + (29.92 − altimeter) × 1,000; DA ≈ PA + 120 × (OAT − ISA)",
          "Zp = altitude + (29,92 − calage) × 1 000 ; Zd ≈ Zp + 120 × (T − ISA)",
        ),
        ruleOfThumb: L(
          "ISA is 15 °C at sea level, 2 °C colder per 1,000 ft. Enter the POH tables with pressure altitude and OAT.",
          "ISA vaut 15 °C au niveau de la mer, 2 °C de moins par 1 000 ft. Entrez dans les tables avec l’altitude-pression et la température.",
        ),
        refs: [{ src: "FAA-PHAK", ref: "ch. 11" }],
      },
    ],
    { kind: "explain", minutes: 3 },
  );
}

/** A6 — weight and balance: the loading table and the CG fraction, beside the live envelope. */
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
  const nf = (v: number) => v.toLocaleString("fr-FR").replace(/\s/g, " ");
  const d1 = (v: number) => v.toFixed(1);
  const d1f = (v: number) => v.toFixed(1).replace(".", ",");
  const rowsEn = [
    ["Item", "lb", "arm", "moment"],
    ["Empty", n(empty.w), d1(WB.emptyArm), n(empty.m)],
    ["Front seats", n(front.w), d1(WB.frontArm), n(front.m)],
    ["Fuel 40 gal", n(fuel.w), d1(WB.fuelArm), n(fuel.m)],
    ["Baggage", n(bag.w), d1(WB.bag1Arm), n(bag.m)],
    ["Total", n(total.w), "", n(total.m)],
  ];
  const rowsFr = [
    ["Poste", "lb", "bras", "moment"],
    ["À vide", nf(empty.w), d1f(WB.emptyArm), nf(empty.m)],
    ["Sièges AV", nf(front.w), d1f(WB.frontArm), nf(front.m)],
    ["Carb. 40 gal", nf(fuel.w), d1f(WB.fuelArm), nf(fuel.m)],
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
            "aft of the datum · avgas 6 lb per US gallon",
            "en arrière de la référence · avgas 6 lb par gallon US",
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
          "Avgas: 6 lb per US gallon.",
          "Avgas : 6 lb par gallon US.",
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
            "Three numbers for the nav log",
            "Trois chiffres pour le log de nav",
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
          checksTitle: L("Before every flight", "Avant chaque vol"),
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
  L("The rules", "Les règles"),
  L("Compute", "Calculer"),
  L("Drill and fly", "Série et vol"),
];
function part2(): Step {
  return slideStep(
    "mv-part2",
    L("Now you compute", "À vous de calculer"),
    canvas(
      sectionBlocks({
        n: 2,
        of: 3,
        title: L("Now you compute", "À vous de calculer"),
        lead: L(
          "The whole nav log, with new numbers on every attempt and the worked solution after each answer.",
          "Tout le log de nav, avec de nouveaux chiffres à chaque essai et la solution détaillée après chaque réponse.",
        ),
        items: PARTS,
      }),
      { layout: "section" },
    ),
    [],
    { minutes: 1 },
  );
}
function part3(): Step {
  return slideStep(
    "mv-part3",
    L("A drill, then the heading in the air", "Une série, puis le cap en vol"),
    canvas(
      sectionBlocks({
        n: 3,
        of: 3,
        title: L(
          "A drill, then the heading in the air",
          "Une série, puis le cap en vol",
        ),
        lead: L(
          "Ten problems against the stopwatch. Then fly the heading you computed and hold the track.",
          "Dix problèmes contre le chrono. Puis volez le cap calculé et tenez la route.",
        ),
        items: PARTS,
      }),
      { layout: "section" },
    ),
    [],
    { minutes: 1 },
  );
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
    ["6 lb", "6 lb", "per US gallon of avgas", "par gallon US d’avgas"],
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
      "1013",
      "1013",
      "hPa = 29.92 inHg, the standard setting",
      "hPa = 29,92 inHg, le calage standard",
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

/** The Maths for VFR sample (22 steps): slides first, then the practice, the drill and the flight. */
export function mathsVfrCourse(): Course {
  const steps: Step[] = [
    // part 1 — the rules, on slides
    cover(),
    why(),
    tvmdc(),
    variation(),
    windSlide(),
    crosswindSlide(),
    performanceSlide(),
    wbSlide(),
    recap(),
    // part 2 — compute
    part2(),
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
    // part 3 — drill and fly
    part3(),
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
    cheatSheet(),
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
        "TVMDC, the wind triangle, fuel, the crosswind clock code, density altitude, takeoff factors and weight and balance — on designed slides first, then generated problems, a drill, and the heading you computed, flown.",
        "Rv → Cc, le triangle des vents, le carburant, la règle de l’horloge, l’altitude-densité, les distances et le centrage — d’abord en diapos, puis des problèmes générés, une série, et le cap calculé, volé.",
      ),
      cockpit: "steam",
      theme: "classroom",
      tags: ["maths", "vfr", "calculation", "navigation"],
      minutes: 50,
    },
    steps,
    mathsVfrScenes(),
  );
}
