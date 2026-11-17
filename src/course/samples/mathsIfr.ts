// Ground school — built-in sample "Maths for IFR" (40 steps), built as a lesson, not a list of rules: the cover, the
// objectives (measurable), a clearance as the hook, then four parts. Each rule is taught on one slide with a worked
// example and a live instrument posed on the exact situation, tried on that instrument (the simulator checks a
// plain-word goal), checked with a question, practised on generated problems (new numbers on every attempt) and
// flown: 1 the descent and the approach (3° path, VSI, top of descent, climb gradient, VDP — the LOC 27 flown),
// 2 track and turns (1 in 60 on the CDI, the standard-rate turn on the turn coordinator, the lead — the DME arc
// flown), 3 altimeter and airspeed (the standard setting on the Kollsman knob, the cold, TAS on two airspeed
// indicators), 4 the takeaways, three retrieval questions on the classic mistakes, the timed drill, the page to keep
// and the descent you computed, flown to ARD. Laid out on the design-system archetypes (SPEC slides v2 §8,
// mathsSlides.ts): classroom theme, Inter, formulas in the formula style, sources on the footer line.
// Sources: FAA-H-8083-15 Instrument Flying Handbook (ch. 4 rate and radius of turn, ch. 6–7 standard-rate turns,
// ch. 9 navigation, ch. 10 IFR flight), EASA Part-FCL 061 General Navigation (1 in 60), FAA AIM 5-2-9 (climb
// gradients), 5-4-5 (VDP) and 7-3 (cold temperature), ICAO Doc 8168 Vol I (cold temperature correction, 3.3 %
// procedure design gradient), FAA-H-8083-25 PHAK ch. 8 (altimetry, airspeeds).
import type { Course, SimScene, Step } from "../types";
import {
  G as GOAL,
  INST,
  L,
  MARK,
  QUIZ,
  T,
  DIAGRAM,
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
import { stripPlan } from "../canvas/controlStrip";

export const MATHS_IFR_ID = "sample-maths-ifr";
/** what the cover promises: the step count and the minutes (course.minutes is the sum of the steps', a test checks) */
export const IFR_STEPS = 40;
export const IFR_MIN = 112;

const TC = gauge("tc");
const VSI = gauge("vsi");
const ALT = gauge("alt");
const CDI = gauge("cdi");
const ASI = gauge("asi");

export function mathsIfrScenes(): Record<string, SimScene> {
  return {
    // wings level on 045: the student rolls into the standard-rate turn (mi-turn)
    "mi.turn": scene(
      "mi.turn",
      {
        pos: { fix: "ARD", radial: 240, distNm: 12 },
        altFt: 5000,
        hdg: 45,
        iasKt: 100,
        radios: { nav1: "ARD", obs1: 60, cdi: "NAV1" },
      },
      {
        label: "ARD R-240 · 12 NM · 5,000 ft · wings level, heading 045",
        cockpit: "steam",
      },
    ),
    // 30 NM west of ARD, 8° south of the 270 radial (≈ 4 NM right of the 090 course): the CDI shows 4 dots (mi-60-cdi).
    // The steam CDI gauge is the NAV 2 head (5 dots a side): both receivers on ARD, OBS 090.
    "mi.cdi": scene(
      "mi.cdi",
      {
        pos: { fix: "ARD", radial: 262, distNm: 30 },
        altFt: 5000,
        hdg: 90,
        iasKt: 100,
        radios: { nav1: "ARD", obs1: 90, nav2: "ARD", obs2: 90, cdi: "NAV1" },
      },
      { label: "ARD R-262 · 30 NM · 5,000 ft · OBS 090", cockpit: "steam" },
    ),
    // on the ground at PARD (420 ft), QNH 30.12 (1020 hPa): the same aeroplane with the QNH set (mi.qnh) and with the
    // standard 29.92 set (mi.std: the fields' altitude is what the altimeter reads, so 220 ft puts it on the ground)
    "mi.qnh": scene(
      "mi.qnh",
      {
        pos: { runway: { icao: "PARD", id: "27" }, distNm: 0 },
        altFt: 420,
        hdg: 270,
        iasKt: 0,
        radios: { nav1: "IPRD", obs1: 270, cdi: "NAV1", baro: 30.12 },
      },
      {
        label: "PARD runway 27 · 420 ft · QNH 30.12 in (1020 hPa)",
        cockpit: "steam",
        weather: { qnh: 30.12 },
      },
    ),
    "mi.std": scene(
      "mi.std",
      {
        pos: { runway: { icao: "PARD", id: "27" }, distNm: 0 },
        altFt: 220,
        hdg: 270,
        iasKt: 0,
        radios: { nav1: "IPRD", obs1: 270, cdi: "NAV1", baro: 29.92 },
      },
      {
        label: "PARD runway 27 · 420 ft · QNH 30.12 in, altimeter set to 29.92",
        cockpit: "steam",
        weather: { qnh: 30.12 },
      },
    ),
    // another day at PARD, pressure below standard: QNH 29.72 in (1006 hPa). The student sets 29.92 and reads the
    // pressure altitude, 620 ft (mi-alt-try)
    "mi.lowp": scene(
      "mi.lowp",
      {
        pos: { runway: { icao: "PARD", id: "27" }, distNm: 0 },
        altFt: 420,
        hdg: 270,
        iasKt: 0,
        radios: { nav1: "IPRD", obs1: 270, cdi: "NAV1", baro: 29.72 },
      },
      {
        label: "PARD runway 27 · 420 ft · QNH 29.72 in (1006 hPa)",
        cockpit: "steam",
        weather: { qnh: 29.72 },
      },
    ),
    // level at 5,000 ft, 110 KIAS (about 120 kt true) into a 20 kt headwind: 100 kt over the ground, so the 3° path
    // is 500 ft/min — the rate the stage's pitch pad holds while pressed (mi-vs)
    "mi.level": scene(
      "mi.level",
      {
        pos: { fix: "ARD", radial: 270, distNm: 20 },
        altFt: 5000,
        hdg: 90,
        iasKt: 110,
        radios: { nav1: "ARD", obs1: 90, cdi: "NAV1" },
      },
      {
        label: "ARD R-270 · 20 NM · 5,000 ft · level · 20 kt headwind",
        cockpit: "steam",
        weather: {
          windDir: 90,
          windKt: 20,
          turbulence: 0,
          aloft: [{ altFt: 5000, dir: 90, kt: 20 }],
        },
      },
    ),
    // on final for PARD 27 at the FAF altitude: 2,000 ft above the field (420 ft), the altimeter reads 2,420 ft (mi-cold)
    "mi.cold": scene(
      "mi.cold",
      {
        pos: { runway: { icao: "PARD", id: "27" }, distNm: 6 },
        altFt: 2420,
        hdg: 270,
        iasKt: 100,
        radios: { nav1: "IPRD", obs1: 270, cdi: "NAV1" },
      },
      {
        label: "PARD 27 · 6 NM final · altimeter 2,420 ft",
        cockpit: "steam",
      },
    ),
    // the same 110 KIAS, no wind, at 2,000 ft and at 8,000 ft: the ground speed read is the true airspeed (mi-tas)
    "mi.tas.low": scene(
      "mi.tas.low",
      {
        pos: { fix: "ARD", radial: 270, distNm: 15 },
        altFt: 2000,
        hdg: 90,
        iasKt: 110,
        radios: { nav1: "ARD", obs1: 90, cdi: "NAV1" },
      },
      { label: "ARD R-270 · 2,000 ft · 110 KIAS · calm", cockpit: "steam" },
    ),
    "mi.tas.high": scene(
      "mi.tas.high",
      {
        pos: { fix: "ARD", radial: 270, distNm: 15 },
        altFt: 8000,
        hdg: 90,
        iasKt: 110,
        radios: { nav1: "ARD", obs1: 90, cdi: "NAV1" },
      },
      { label: "ARD R-270 · 8,000 ft · 110 KIAS · calm", cockpit: "steam" },
    ),
    // level at 1,800 ft and 90 kt after take-off: the student climbs at 450 ft/min or more (mi-climb, Your turn)
    "mi.dep": scene(
      "mi.dep",
      {
        pos: { fix: "ARD", radial: 270, distNm: 8 },
        altFt: 1800,
        hdg: 270,
        iasKt: 88,
        radios: { nav1: "ARD", obs1: 270, cdi: "NAV1" },
      },
      { label: "ARD R-270 · 1,800 ft · level · 90 kt", cockpit: "steam" },
    ),
    // climbing out at 90 kt over the ground, 450 ft/min: the 300 ft/NM of the worked example (mi-climb)
    "mi.climb": scene(
      "mi.climb",
      {
        pos: { fix: "ARD", radial: 270, distNm: 8 },
        altFt: 1800,
        hdg: 270,
        iasKt: 88,
        vsFpm: 450,
        radios: { nav1: "ARD", obs1: 270, cdi: "NAV1" },
      },
      { label: "ARD R-270 · 1,800 ft · climbing 450 ft/min", cockpit: "steam" },
    ),
    "mi.descent": scene(
      "mi.descent",
      {
        pos: { runway: { icao: "PARD", id: "27" }, distNm: 8 },
        altFt: 2950,
        hdg: 270,
        iasKt: 110,
        vsFpm: -600,
        radios: { nav1: "IPRD", obs1: 270, cdi: "NAV1" },
      },
      {
        label: "PARD 27 · 8 NM · 2,950 ft · 600 ft/min down",
        cockpit: "steam",
      },
    ),
  };
}

// ================================================================== part 1: the rules (slides)
/** A1 — the cover: the VSI of a 3° descent as the hero. */
function cover(): Step {
  return slideStep(
    "mi-cover",
    L("Maths for IFR", "Les maths de l’IFR"),
    canvas(
      coverBlocks({
        eyebrow: L(
          "Ground school · Instrument rating",
          "Théorie · Vol aux instruments",
        ),
        main: L("Maths for IFR", "Les maths de l’IFR"),
        sub: L(
          "Mental arithmetic for instrument flying",
          "Le calcul mental du vol aux instruments",
        ),
        lead: L(
          "The few rules an instrument pilot works out in the head: shown on live instruments, tried on them, then flown in the simulator.",
          "Les quelques règles qu’un pilote IFR calcule de tête : montrées sur des instruments en direct, essayées dessus, puis volées au simulateur.",
        ),
        meta: L(
          `${IFR_STEPS} steps · about ${IFR_MIN} min · new numbers on every attempt`,
          `${IFR_STEPS} étapes · environ ${IFR_MIN} min · de nouveaux chiffres à chaque essai`,
        ),
        hero: [
          INST(
            VSI,
            L(
              "Vertical speed indicator: 600 ft/min down, a 3° path at 120 kt",
              "Variomètre : 600 ft/min en descente, un plan à 3° à 120 kt",
            ),
            1032,
            180,
            720,
            720,
            { scene: "mi.descent" },
          ),
        ],
      }),
      { layout: "cover" },
    ),
    [
      {
        t: "text",
        text: L(
          "Four parts: the descent and the approach, track and turns, altimeter and airspeed, then the review. Each rule is shown on a live instrument, tried on it, practised on new numbers and flown: the LOC 27 at PARD, the DME arc and your own descent.",
          "Quatre parties : la descente et l’approche, la route et les virages, l’altimètre et la vitesse, puis le bilan. Chaque règle est montrée sur un instrument en direct, essayée dessus, pratiquée sur de nouveaux chiffres et volée : le LOC 27 de PARD, l’arc DME et votre propre descente.",
        ),
      },
    ],
    { minutes: 1 },
  );
}

/** A9 — why it matters: a clearance, and the question it asks of you. */
function why(): Step {
  return slideStep(
    "mi-why",
    L("Why it matters", "Pourquoi c’est utile"),
    canvas(
      [
        ...head(
          L("Why it matters", "Pourquoi c’est utile"),
          L(
            "ATC won’t wait for a calculator",
            "Le contrôle n’attend pas la calculette",
          ),
        ),
        lead(
          L(
            "You cruise at 7,000 ft and want a normal 3° descent.",
            "Vous êtes à 7 000 ft et voulez une descente normale à 3°.",
          ),
        ),
        T(
          "quote",
          L(
            "“Cross KILO at 3,000 ft, descend at pilot’s discretion.”",
            "« Passez KILO à 3 000 ft, descente à votre discrétion. »",
          ),
          G.left,
          344,
          1560,
          144,
        ),
        QUIZ(
          "mi-why.q",
          {
            kind: "mcq",
            prompt: L(
              "How far before KILO do you start down?",
              "À quelle distance de KILO commencez-vous la descente ?",
            ),
            options: [
              {
                text: L("6 NM", "6 NM"),
                why: L(
                  "4,000 ft in 6 NM is about 670 ft per NM: a 6° dive.",
                  "4 000 ft en 6 NM, c’est environ 670 ft par NM : un piqué à 6°.",
                ),
              },
              { text: L("12 NM", "12 NM") },
              {
                text: L("20 NM", "20 NM"),
                why: L(
                  "200 ft per NM is under 2°: you would drag in low for miles.",
                  "200 ft par NM, c’est moins de 2° : vous traîneriez bas sur des milles.",
                ),
              },
            ],
            answer: 1,
            explain: L(
              "4,000 ft to lose × 3 NM per 1,000 ft = 12 NM. That rule is the next slide; four more follow.",
              "4 000 ft à perdre × 3 NM par 1 000 ft = 12 NM. Cette règle est la diapo suivante ; quatre autres suivent.",
            ),
          },
          G.left,
          504,
          1680,
          480,
        ),
        foot(
          L(
            "FAA IFH ch. 10 · descent planning",
            "FAA IFH ch. 10 · plan de descente",
          ),
        ),
      ],
      { layout: "quiz" },
    ),
    [
      {
        t: "text",
        text: L(
          "At 7,000 ft, cleared to cross KILO at 3,000 ft: 4,000 ft to lose × 3 NM per 1,000 ft = start down 12 NM before KILO.",
          "À 7 000 ft, autorisé à passer KILO à 3 000 ft : 4 000 ft à perdre × 3 NM par 1 000 ft = commencer la descente 12 NM avant KILO.",
        ),
      },
    ],
    { minutes: 2 },
  );
}

/** A8 — the 1 in 60 rule: the live triangle, the formula, then the numbers one line at a time. */
function sixty(): Step {
  const lines: [string, string][] = [
    ["error | = 60 × [4/30] = !8°!", "erreur | = 60 × [4/30] = !8°!"],
    ["close | = 60 × [4/40] = !6°!", "rejoindre | = 60 × [4/40] = !6°!"],
    ["turn | = 8° + 6° = !14°!", "virage | = 8° + 6° = !14°!"],
  ];
  return slideStep(
    "mi-60",
    L("The 1-in-60 rule", "La règle du 1 sur 60"),
    canvas(
      [
        ...head(
          L("Track error", "Erreur de route"),
          L("The 1 in 60 rule", "La règle du 1 sur 60"),
        ),
        lead(
          L(
            "At 60 NM from the fix, 1 NM off is 1°.",
            "À 60 NM du repère, 1 NM d’écart vaut 1°.",
          ),
        ),
        DIAGRAM(
          "mi-60.d",
          {
            kind: "calc",
            calc: {
              kind: "sixtyToOne",
              course: 90,
              flownNm: 30,
              offNm: 4,
              toGoNm: 40,
              drag: ["aircraft"],
            },
          },
          L(
            "Track error triangle: 4 NM off after 30 NM, 40 NM to go",
            "Triangle d’écart : 4 NM d’écart après 30 NM, 40 NM restants",
          ),
          G.left,
          368,
          960,
          592,
          {
            interactive: true,
            caption: L(
              "Drag the aircraft: the angles follow.",
              "Déplacez l’avion : les angles suivent.",
            ),
          },
        ),
        T("eyebrow", L("The formula", "La formule"), 1176, 360, 624, 32, {
          color: "muted",
        }),
        T(
          "formula",
          L(
            "{angle} = 60 × [{off}/{distance}]",
            "{angle} = 60 × [{écart}/{distance}]",
          ),
          1176,
          408,
          624,
          136,
        ),
        T(
          "small",
          L(
            "angle in degrees · off and distance in NM",
            "angle en degrés · écart et distance en NM",
          ),
          1176,
          560,
          624,
          40,
        ),
        rule(1176, 632, 624),
        ...lines.map(([en, fr], i) =>
          T("formula", L(en, fr), 1176, 664 + i * 104, 624, 96, {
            reveal: i + 1,
          }),
        ),
        foot(
          L(
            "EASA Part-FCL 061 · why 60: a radian is 57.3°, rounded for mental maths",
            "EASA Part-FCL 061 · pourquoi 60 : un radian vaut 57,3°, arrondi pour le calcul mental",
          ),
        ),
      ],
      { layout: "formula" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "angle (°) = 60 × off (NM) ÷ distance (NM)",
          "angle (°) = 60 × écart (NM) ÷ distance (NM)",
        ),
        ruleOfThumb: L(
          "At 60 NM, 1 NM off is 1°. 4 NM off after 30 NM: 8° of error; 6° more to reach the fix 40 NM ahead; turn 14°.",
          "À 60 NM, 1 NM d’écart vaut 1°. 4 NM d’écart après 30 NM : 8° d’erreur ; 6° de plus pour rejoindre le repère 40 NM plus loin ; virez de 14°.",
        ),
        refs: [{ src: "EASA Part-FCL", ref: "061 General navigation" }],
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

/** A5 — the 1 in 60 rule on the VOR CDI, live: 4 dots at 30 NM is 8° and 4 NM; the student centres the needle. */
function sixtyCdi(): Step {
  const [x, y, s] = [G.left, 120, 840];
  // the live gauge makes room for its control strip (OBS): the markers follow the gauge as it is drawn
  const box = stripPlan(["obs2"], "below", s, s, 1, 1)!.inst;
  const dots = gaugePoint("cdi", x + box.x, y + box.y, box.w, -0.6, 0.24);
  const obs = gaugePoint("cdi", x + box.x, y + box.y, box.w, 0.2, -0.56);
  return slideStep(
    "mi-60-cdi",
    L("1 in 60 on the CDI", "Le 1 sur 60 sur le CDI"),
    canvas(
      [
        INST(
          CDI,
          L(
            "VOR CDI (NAV 2), OBS 090 TO: the needle 4 dots left, 30 NM west of ARD",
            "CDI VOR (NAV 2), OBS 090 TO : l’aiguille 4 points à gauche, 30 NM à l’ouest d’ARD",
          ),
          G.left,
          120,
          840,
          840,
          {
            id: "mi-60-cdi.cdi",
            scene: "mi.cdi",
            mode: "live",
            controls: ["obs2"],
            yourTurn: {
              where: "slide",
              prompt: L(
                "Your turn: 4 dots is 8° — turn the OBS 8° towards the needle (082) and watch it centre",
                "À vous : 4 points, c’est 8° — tournez l’OBS de 8° vers l’aiguille (082) et regardez-la se centrer",
              ),
              controls: ["obs2"],
              assist: { holdAlt: true, holdIas: true },
              // the OBS, not the dots: the goal rows count dots in the course cockpit's scale (G1000: 2 a side),
              // while this steam CDI has 5 — the OBS value is the same on both
              goal: {
                all: [GOAL.toFrom("TO"), { id: "obs", p: { nav: 2, value: 82, tol: 2 } }],
                holdS: 2,
                graded: false,
                success: L(
                  "Centred on about 082: 8° off the 090, so 4 NM off at 30 NM.",
                  "Centrée vers 082 : 8° d’écart avec le 090, donc 4 NM à 30 NM.",
                ),
              },
              hint: L(
                "Press − on the OBS eight times: 090 → 082.",
                "Appuyez 8 fois sur − de l’OBS : 090 → 082.",
              ),
            },
          },
        ),
        T("eyebrow", L("Track error", "Erreur de route"), 1128, 120, 672, 32),
        T(
          "title",
          L("1 in 60 on the CDI", "Le 1 sur 60 sur le CDI"),
          1128,
          160,
          672,
          176,
        ),
        MARK(1, dots[0], dots[1], { size: 56, reveal: 1, group: "row1" }),
        MARK(2, obs[0], obs[1], { size: 56, reveal: 3, group: "row3" }),
        ...noteRows([
          {
            h: L("The needle: 4 dots left", "L’aiguille : 4 points à gauche"),
            b: L(
              "1 dot = 2° (full scale 10°, 5 dots): **8°** off the course.",
              "1 point = 2° (pleine échelle 10°, 5 points) : **8°** d’écart.",
            ),
            mark: 1,
          },
          {
            h: L("At 30 NM: 1 dot ≈ 1 NM", "À 30 NM : 1 point ≈ 1 NM"),
            b: L(
              "8° × 30 ÷ 60 = **4 NM** right of the course.",
              "8° × 30 ÷ 60 = **4 NM** à droite de la route.",
            ),
            color: "sel",
          },
          {
            h: L("Centre it with the OBS", "Centrez-la à l’OBS"),
            b: L(
              "You are on {{value}}: the course to ARD is 082.",
              "Vous êtes sur le {{value}} : la route vers ARD est 082.",
            ),
            color: "nav",
            mark: 2,
            live: { readout: "radial", scene: "mi.cdi" },
          },
        ]),
        foot(
          L(
            "FAA IFH ch. 9 · EASA Part-FCL 061",
            "FAA IFH ch. 9 · EASA Part-FCL 061",
          ),
          672,
          1128,
        ),
      ],
      { scene: "mi.cdi", layout: "instrumentNotes" },
    ),
    [
      {
        t: "text",
        text: L(
          "On a VOR CDI, full scale is 10° either side, 5 dots: 1 dot = 2°. 30 NM west of ARD with OBS 090 TO, the needle sits 4 dots left: 8° off. By the 1 in 60 rule that is 8 × 30 ÷ 60 = 4 NM right of the course. Turn the OBS until the needle centres: it reads about 082, the course to ARD from where you are.",
          "Sur un CDI VOR, la pleine échelle vaut 10° de chaque côté, 5 points : 1 point = 2°. À 30 NM à l’ouest d’ARD, OBS 090 TO, l’aiguille est 4 points à gauche : 8° d’écart. Par le 1 sur 60, cela fait 8 × 30 ÷ 60 = 4 NM à droite de la route. Tournez l’OBS jusqu’à centrer l’aiguille : il lit environ 082, la route vers ARD depuis votre position.",
        ),
      },
    ],
    { kind: "try", minutes: 2 },
  );
}

/** A8 — the 3° path: the live profile (drag the top of descent), the rule, then the worked numbers one at a time. */
function threeDegrees(): Step {
  return slideStep(
    "mi-3deg",
    L("The 3° path: 3 NM per 1,000 ft", "Le plan à 3° : 3 NM par 1 000 ft"),
    canvas(
      [
        ...head(
          L("Descent planning", "Plan de descente"),
          L(
            "The 3° path: 3 NM per 1,000 ft",
            "Le plan à 3° : 3 NM par 1 000 ft",
          ),
        ),
        lead(
          L(
            "The normal slope of a descent and of an approach.",
            "La pente normale d’une descente et d’une approche.",
          ),
        ),
        DIAGRAM(
          "mi-3deg.d",
          {
            kind: "calc",
            calc: {
              kind: "profile",
              fromFt: 6000,
              toFt: 2000,
              angleDeg: 3,
              gsKt: 120,
              drag: ["tod"],
            },
          },
          L(
            "Descent profile from 6,000 to 2,000 ft on a 3° path at 120 kt",
            "Profil de descente de 6 000 à 2 000 ft sur un plan à 3° à 120 kt",
          ),
          G.left,
          368,
          960,
          592,
          {
            interactive: true,
            caption: L(
              "Drag the top of descent: too late, and the path gets steeper.",
              "Déplacez le début de descente : trop tard, la pente se raidit.",
            ),
          },
        ),
        T("eyebrow", L("The rule", "La règle"), 1176, 360, 624, 32, {
          color: "muted",
        }),
        T(
          "formula",
          L(
            "{distance} = 3 × [{height}/1,000]",
            "{distance} = 3 × [{hauteur}/1 000]",
          ),
          1176,
          408,
          624,
          136,
        ),
        T(
          "small",
          L(
            "distance in NM · height to lose in ft",
            "distance en NM · hauteur à perdre en ft",
          ),
          1176,
          560,
          624,
          40,
        ),
        rule(1176, 632, 624),
        T(
          "formula",
          L(
            "height | = !4,000 ft! to lose",
            "hauteur | = !4 000 ft! à perdre",
          ),
          1176,
          656,
          624,
          88,
          { reveal: 1 },
        ),
        T(
          "formula",
          L("distance | = 3 × 4 = !12 NM!", "distance | = 3 × 4 = !12 NM!"),
          1176,
          752,
          624,
          88,
          { reveal: 2 },
        ),
        T(
          "body",
          L(
            "Exact: tan 3° × 6,076 ft = **318 ft/NM**, so 12.6 NM. The rule rounds short: keep a mile in hand.",
            "Exact : tan 3° × 6 076 ft = **318 ft/NM**, soit 12,6 NM. La règle arrondit court : gardez un mille de marge.",
          ),
          1176,
          856,
          624,
          120,
          { reveal: 3 },
        ),
        foot(L("FAA IFH ch. 10", "FAA IFH ch. 10")),
      ],
      { layout: "formula" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "distance (NM) = height to lose (ft) ÷ 318",
          "distance (NM) = hauteur à perdre (ft) ÷ 318",
        ),
        ruleOfThumb: L(
          "3°: 318 ft/NM ≈ 300 ft/NM, so 3 NM per 1,000 ft to lose. 6,000 to 2,000 ft: 4,000 ft, 12 NM (exact 12.6). In the aircraft: the answer to “descend at pilot’s discretion”.",
          "3° : 318 ft/NM ≈ 300 ft/NM, donc 3 NM par 1 000 ft à perdre. De 6 000 à 2 000 ft : 4 000 ft, 12 NM (exact 12,6). Dans l’avion : la réponse à « descente à votre discrétion ».",
        ),
        refs: [{ src: "FAA-IFH", ref: "ch. 10" }],
      },
    ],
    { kind: "explain", minutes: 3 },
  );
}

/** A5 — the rate of the 3° path on the VSI: the rule, the needle (a live value), the wind; then the student holds it. */
function vsSlide(): Step {
  const [x, y, s] = [G.left, 120, 840];
  const needle = gaugePoint("vsi", x, y, s, -0.74, 0.62);
  return slideStep(
    "mi-vs",
    L("Rate on 3°: ground speed × 5", "La Vz à 3° : vitesse sol × 5"),
    canvas(
      [
        INST(
          VSI,
          L(
            "Vertical speed indicator: 600 ft/min down, the 3° path at 120 kt",
            "Variomètre : 600 ft/min en descente, le plan à 3° à 120 kt",
          ),
          x,
          y,
          s,
          s,
          {
            id: "mi-vs.vsi",
            scene: "mi.descent",
            yourTurn: {
              where: "slide",
              scene: "mi.level",
              prompt: L(
                "Your turn: 20 kt of headwind, 100 kt over the ground — descend at 500 ft/min and hold it 5 seconds",
                "À vous : 20 kt de vent de face, 100 kt de vitesse sol — descendez à 500 ft/min et tenez-la 5 secondes",
              ),
              controls: ["pitch"],
              assist: { holdAlt: true, holdIas: true },
              goal: {
                all: [GOAL.vs(-650, -350)],
                holdS: 5,
                graded: false,
                success: L(
                  "500 ft/min held: at 100 kt over the ground, that is the 3° path.",
                  "500 ft/min tenus : à 100 kt de vitesse sol, c’est le plan à 3°.",
                ),
              },
              hint: L(
                "Keep ▼ pressed: the needle goes down, lags a few seconds, then settles on 5. Let go and the aircraft levels off.",
                "Gardez ▼ appuyé : l’aiguille descend, avec quelques secondes de retard, puis se pose sur le 5. Relâchez : l’avion se remet en palier.",
              ),
            },
          },
        ),
        MARK(1, needle[0], needle[1], { size: 56, reveal: 2, group: "row2" }),
        T("eyebrow", L("Descent planning", "Plan de descente"), 1128, 120, 672, 32),
        T(
          "title",
          L("Rate on 3°: ground speed × 5", "La Vz à 3° : vitesse sol × 5"),
          1128,
          160,
          672,
          176,
        ),
        ...noteRows([
          {
            h: L("VS ≈ ground speed × 5", "Vz ≈ vitesse sol × 5"),
            b: L(
              "At 120 kt: 120 × 5 = **600 ft/min** (exact: 636).",
              "À 120 kt : 120 × 5 = **600 ft/min** (exact : 636).",
            ),
            color: "key",
          },
          {
            h: L("On the VSI: the needle on 6", "Au variomètre : l’aiguille sur le 6"),
            b: L(
              "Below zero is down, in hundreds of ft/min. Read now: {{value}}",
              "Sous le zéro : descente, en centaines de ft/min. Lu : {{value}}",
            ),
            mark: 1,
            live: { readout: "vs", scene: "mi.descent" },
          },
          {
            h: L("Ground speed, not airspeed", "La vitesse sol, pas la vitesse air"),
            b: L(
              "20 kt of headwind: 100 × 5 = **500 ft/min**. At 600 you would be low.",
              "20 kt de vent de face : 100 × 5 = **500 ft/min**. À 600, vous seriez trop bas.",
            ),
            color: "stop",
          },
        ]),
        foot(L("FAA IFH ch. 10", "FAA IFH ch. 10"), 672, 1128),
      ],
      { scene: "mi.descent", layout: "instrumentNotes" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "VS (ft/min) = GS (kt) × gradient (ft/NM) ÷ 60",
          "Vz (ft/min) = Vs (kt) × pente (ft/NM) ÷ 60",
        ),
        ruleOfThumb: L(
          "On 3°: VS ≈ ground speed × 5. 120 kt → 600 ft/min (exact 636). It is the ground speed that counts: with 20 kt of headwind, 100 × 5 = 500 ft/min. On the slide, take the controls with that headwind and hold 500 ft/min for 5 seconds.",
          "À 3° : Vz ≈ vitesse sol × 5. 120 kt → 600 ft/min (exact 636). C’est la vitesse sol qui compte : avec 20 kt de vent de face, 100 × 5 = 500 ft/min. Sur la diapo, prenez les commandes avec ce vent de face et tenez 500 ft/min pendant 5 secondes.",
        ),
        refs: [{ src: "FAA-IFH", ref: "ch. 10" }],
      },
    ],
    { kind: "try", minutes: 3 },
  );
}

/** A8 with an instrument — the climb gradient: the descent rule in reverse, the VSI in the climb, the worked lines. */
function climbSlide(): Step {
  return slideStep(
    "mi-climb",
    L("Climb gradient: the same rule, upwards", "La pente de montée : la même règle, vers le haut"),
    canvas(
      [
        ...head(
          L("Departure", "Départ"),
          L("Climb gradient: ft/NM into ft/min", "Pente de montée : des ft/NM aux ft/min"),
        ),
        lead(
          L(
            "The departure asks for 300 ft/NM. You climb at 90 kt over the ground: what rate?",
            "Le départ exige 300 ft/NM. Vous montez à 90 kt de vitesse sol : quel vario ?",
          ),
          1560,
        ),
        INST(
          VSI,
          L(
            "Vertical speed indicator: 450 ft/min up",
            "Variomètre : 450 ft/min en montée",
          ),
          G.left,
          336,
          624,
          624,
          {
            id: "mi-climb.vsi",
            scene: "mi.climb",
            yourTurn: {
              where: "slide",
              scene: "mi.dep",
              prompt: L(
                "Your turn: 300 ft/NM at 90 kt — climb at 450 ft/min or more and hold it 5 seconds",
                "À vous : 300 ft/NM à 90 kt — montez à 450 ft/min ou plus et tenez 5 secondes",
              ),
              controls: ["pitch"],
              assist: { holdAlt: true, holdIas: true },
              goal: {
                all: [GOAL.vs(450, 750)],
                holdS: 5,
                graded: false,
                success: L(
                  "450 ft/min or more at 90 kt: you make the 300 ft/NM.",
                  "450 ft/min ou plus à 90 kt : vous tenez les 300 ft/NM.",
                ),
              },
              hint: L(
                "Keep ▲ pressed: the needle rises above zero, lags a few seconds, then settles near 6.",
                "Gardez ▲ appuyé : l’aiguille monte au-dessus du zéro, avec quelques secondes de retard, puis se pose vers le 6.",
              ),
            },
          },
        ),
        T("eyebrow", L("The rule", "La règle"), 840, 344, 960, 32, {
          color: "muted",
        }),
        T(
          "formula",
          L("{VS} = {gradient} × [{GS}/60]", "{Vz} = {pente} × [{Vs}/60]"),
          840,
          384,
          960,
          120,
        ),
        T(
          "small",
          L(
            "VS in ft/min · gradient in ft/NM · GS in kt",
            "Vz en ft/min · pente en ft/NM · Vs en kt",
          ),
          840,
          512,
          960,
          40,
        ),
        rule(840, 576, 960),
        T(
          "formula",
          L("90 kt | = 1.5 NM per minute", "90 kt | = 1,5 NM par minute"),
          840,
          600,
          960,
          72,
          { reveal: 1 },
        ),
        T(
          "formula",
          L(
            "VS | = 300 × 1.5 = !450 ft/min!",
            "Vz | = 300 × 1,5 = !450 ft/min!",
          ),
          840,
          680,
          960,
          72,
          { reveal: 2 },
        ),
        T(
          "body",
          L(
            "In the aircraft: the needle must stay on 4.5 or above up to the published altitude. If your aircraft climbs less, you do not accept this departure.",
            "Dans l’avion : l’aiguille doit rester sur 4,5 ou plus jusqu’à l’altitude publiée. Si votre avion monte moins, vous n’acceptez pas ce départ.",
          ),
          840,
          776,
          960,
          184,
          { reveal: 3 },
        ),
        foot(
          L(
            "FAA AIM 5-2-9 · standard gradient 200 ft/NM (3.3 %, ICAO Doc 8168)",
            "FAA AIM 5-2-9 · pente standard 200 ft/NM (3,3 %, OACI Doc 8168)",
          ),
        ),
      ],
      { scene: "mi.climb", layout: "formula" },
    ),
    [
      {
        t: "formula",
        formula: L("ft/min = ft/NM × GS ÷ 60", "ft/min = ft/NM × Vs ÷ 60"),
        ruleOfThumb: L(
          "The descent rule in reverse. At 90 kt you fly 1.5 NM a minute: 300 ft/NM needs 450 ft/min, the standard 200 ft/NM needs 300 ft/min. Compare with the climb rate your aircraft holds at that weight and temperature; a tailwind raises the rate you need. On the slide, take the controls and hold 450 ft/min or more for 5 seconds.",
          "La règle de descente à l’envers. À 90 kt vous faites 1,5 NM par minute : 300 ft/NM demandent 450 ft/min, les 200 ft/NM standard demandent 300 ft/min. Comparez avec le vario que tient votre avion à cette masse et cette température ; un vent arrière augmente le vario nécessaire. Sur la diapo, prenez les commandes et tenez 450 ft/min ou plus pendant 5 secondes.",
        ),
        refs: [{ src: "FAA-AIM", ref: "5-2-9" }],
      },
    ],
    { kind: "try", minutes: 3 },
  );
}

/** A8 — the VDP: the final segment (drag the MDA), the formula, the worked line, what it buys you. */
function vdpSlide(): Step {
  const mda = 1000;
  const tdze = 420;
  const vdp = Math.round(((mda - tdze) / 300) * 10) / 10;
  const vdpFr = String(vdp).replace(".", ",");
  return slideStep(
    "mi-vdp",
    L("The visual descent point", "Le point de descente à vue (VDP)"),
    canvas(
      [
        ...head(
          L("Non-precision approach", "Approche classique"),
          L("Where to leave the MDA", "Où quitter la MDA"),
        ),
        lead(
          L(
            "The visual descent point puts you back on a 3° path.",
            "Le point de descente à vue vous remet sur un plan à 3°.",
          ),
        ),
        DIAGRAM(
          "mi-vdp.d",
          {
            kind: "calc",
            calc: {
              kind: "vdp",
              mdaFt: mda,
              tdzeFt: tdze,
              vdpNm: vdp,
              mapNm: 0.5,
              drag: ["mda"],
            },
          },
          L(
            `Final segment: MDA ${mda} ft, TDZE ${tdze} ft, VDP ${vdp} NM`,
            `Segment final : MDA ${mda} ft, TDZE ${tdze} ft, VDP ${vdpFr} NM`,
          ),
          G.left,
          368,
          960,
          592,
          {
            interactive: true,
            caption: L(
              "Drag the MDA: the VDP moves.",
              "Déplacez la MDA : le VDP se déplace.",
            ),
          },
        ),
        T("eyebrow", L("The formula", "La formule"), 1176, 360, 624, 32, {
          color: "muted",
        }),
        T(
          "formula",
          L("{VDP} = [{MDA} − {TDZE}/300]", "{VDP} = [{MDA} − {TDZE}/300]"),
          1176,
          408,
          624,
          136,
        ),
        T(
          "small",
          L(
            "VDP in NM from the threshold · heights in ft",
            "VDP en NM du seuil · hauteurs en ft",
          ),
          1176,
          560,
          624,
          40,
        ),
        rule(1176, 632, 624),
        T(
          "formula",
          L(
            `VDP | = [1,000 − 420/300] = !${vdp} NM!`,
            `VDP | = [1 000 − 420/300] = !${vdpFr} NM!`,
          ),
          1176,
          664,
          624,
          112,
          { reveal: 1 },
        ),
        T(
          "body",
          L(
            "Leave the MDA there, runway in sight: a normal descent. Earlier, you are low over obstacles; later, you dive.",
            "Quittez la MDA là, piste en vue : une descente normale. Plus tôt, vous êtes bas sur les obstacles ; plus tard, vous plongez.",
          ),
          1176,
          800,
          624,
          160,
          { reveal: 2 },
        ),
        foot(
          L(
            "FAA AIM 5-4-5 · 300 ft per NM is the 3° path rounded",
            "FAA AIM 5-4-5 · 300 ft par NM, c’est le plan à 3° arrondi",
          ),
        ),
      ],
      { layout: "formula" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "VDP (NM from the threshold) = (MDA − TDZE) ÷ 300",
          "VDP (NM du seuil) = (MDA − TDZE) ÷ 300",
        ),
        ruleOfThumb: L(
          "300 ft per NM is the 3° path rounded.",
          "300 ft par NM, c’est le plan à 3° arrondi.",
        ),
        refs: [{ src: "FAA-AIM", ref: "5-4-5" }],
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

/** A5 — standard-rate turn: the turn coordinator, live — the student rolls in and rolls out on 135 — and three rows. */
function turnSlide(): Step {
  const [x, y, s] = [G.left, 120, 840];
  // the live gauge makes room for its control strip (bank): the marker follows the gauge as it is drawn
  const box = stripPlan(["bank"], "below", s, s, 1, 1)!.inst;
  const mark = gaugePoint("tc", x + box.x, y + box.y, box.w, 0.76, 0.52);
  return slideStep(
    "mi-turn",
    L(
      "Bank for a standard-rate turn",
      "L’inclinaison du virage au taux standard",
    ),
    canvas(
      [
        INST(
          TC,
          L(
            "Turn coordinator, wings level on heading 045: roll into a standard-rate turn to the right",
            "Indicateur de virage, ailes à plat au cap 045 : virage au taux 1 à droite",
          ),
          x,
          y,
          s,
          s,
          {
            id: "mi-turn.tc",
            scene: "mi.turn",
            mode: "live",
            controls: ["bank"],
            yourTurn: {
              where: "slide",
              prompt: L(
                "Your turn: a standard-rate turn right, roll out on 135 — 90° in 30 s",
                "À vous : virage au taux 1 à droite, sortie au cap 135 — 90° en 30 s",
              ),
              controls: ["bank"],
              assist: { holdAlt: true, holdIas: true },
              goal: {
                all: [GOAL.heading(135, 5)],
                holdS: 3,
                graded: false,
                success: L(
                  "On 135: with the wing on the mark, 90° took 30 seconds.",
                  "Au 135 : maquette sur le repère, 90° ont pris 30 secondes.",
                ),
              },
              hint: L(
                "Hold “Right”: the little aeroplane’s wing settles on the lower mark. Keep holding about 30 s and let go about 5° before 135.",
                "Maintenez « À droite » : l’aile de la maquette se pose sur le repère du bas. Tenez environ 30 s et relâchez environ 5° avant le 135.",
              ),
            },
          },
        ),
        MARK(1, mark[0], mark[1], { size: 56, reveal: 1, group: "row1" }),
        T("eyebrow", L("Turns", "Virages"), 1128, 120, 672, 32),
        T(
          "title",
          L("Bank for a standard-rate turn", "L’inclinaison au taux 1 (standard)"),
          1128,
          160,
          672,
          176,
        ),
        ...noteRows([
          {
            h: L("Standard rate: 3°/s", "Taux 1 : 3° par seconde"),
            b: L(
              "The wing on the R mark: 360° in **2 minutes**. Heading {{value}}",
              "L’aile sur le repère R : 360° en **2 minutes**. Cap {{value}}",
            ),
            mark: 1,
            live: { readout: "hdg", scene: "mi.turn" },
          },
          {
            h: L("Bank ≈ TAS ÷ 10 + 7", "Inclinaison ≈ Vp ÷ 10 + 7"),
            b: L(
              "At 100 kt: **17°** (exact: 15°). Then put the wing on the mark.",
              "À 100 kt : **17°** (exact : 15°). Puis l’aile sur le repère.",
            ),
            color: "sel",
          },
          {
            h: L("In the aircraft: time it", "Dans l’avion : le chrono"),
            b: L(
              "90° in **30 s**, 180° in **1 min**: even with no heading indicator.",
              "90° en **30 s**, 180° en **1 min** : même sans conservateur de cap.",
            ),
          },
        ]),
        foot(
          L(
            "FAA IFH ch. 4 and 6 · rate of turn",
            "FAA IFH ch. 4 et 6 · taux de virage",
          ),
          672,
          1128,
        ),
      ],
      { scene: "mi.turn", layout: "instrumentNotes" },
    ),
    [
      {
        t: "formula",
        formula: L("tan φ = ω · V ÷ g", "tan φ = ω · V ÷ g"),
        ruleOfThumb: L(
          "Bank ≈ TAS/10 + 7 (15% of TAS is closer to exact). At standard rate, 90° takes 30 seconds and 180° one minute. On the slide, roll into a standard-rate turn right from 045 and roll out on 135.",
          "Inclinaison ≈ Vp/10 + 7 (15 % de la Vp est plus proche de l’exact). Au taux 1, 90° prennent 30 secondes et 180° une minute. Sur la diapo, virez au taux 1 à droite du 045 et sortez au 135.",
        ),
        refs: [{ src: "FAA-IFH", ref: "ch. 4, ch. 6" }],
      },
    ],
    { kind: "try", minutes: 3 },
  );
}

/** A8 — the lead: the circle of a standard-rate turn, its radius, and the lead on a DME arc (1 in 60 again). */
function leadSlide(): Step {
  return slideStep(
    "mi-lead",
    L("Lead the turn by its radius", "Anticipez le virage de son rayon"),
    canvas(
      [
        ...head(
          L("Turns", "Virages"),
          L("Lead the turn by its radius", "Anticipez le virage de son rayon"),
        ),
        lead(
          L(
            "A turn takes room: start it before the course, not on it.",
            "Un virage prend de la place : commencez-le avant la route, pas dessus.",
          ),
          1560,
        ),
        DIAGRAM(
          "mi-lead.d",
          { kind: "calc", calc: { kind: "turn", tasKt: 120, bankDeg: 19 } },
          L(
            "The circle of a standard-rate turn at 120 kt: 19° of bank, radius about 0.6 NM",
            "Le cercle d’un virage au taux 1 à 120 kt : 19° d’inclinaison, rayon d’environ 0,6 NM",
          ),
          G.left,
          368,
          960,
          592,
        ),
        T("eyebrow", L("The rule", "La règle"), 1176, 360, 624, 32, {
          color: "muted",
        }),
        T(
          "formula",
          L("{radius} ≈ [{GS}/200]", "{rayon} ≈ [{Vs}/200]"),
          1176,
          408,
          624,
          136,
        ),
        T(
          "small",
          L(
            "radius in NM at standard rate · GS in kt",
            "rayon en NM au taux 1 · Vs en kt",
          ),
          1176,
          560,
          624,
          40,
        ),
        rule(1176, 632, 624),
        T(
          "formula",
          L("120 kt | → [120/200] = !0.6 NM!", "120 kt | → [120/200] = !0,6 NM!"),
          1176,
          648,
          624,
          96,
          { reveal: 1 },
        ),
        T(
          "formula",
          L(
            "10 DME arc | 60 × [0.6/10] ≈ !4°!",
            "arc 10 DME | 60 × [0,6/10] ≈ !4°!",
          ),
          1176,
          752,
          624,
          96,
          { reveal: 2 },
        ),
        T(
          "body",
          L(
            "In the aircraft: on a 10 DME arc, start the turn 4° before the radial. It is the 1 in 60 again.",
            "Dans l’avion : sur un arc 10 DME, commencez le virage 4° avant la radiale. C’est encore le 1 sur 60.",
          ),
          1176,
          856,
          624,
          120,
          { reveal: 3 },
        ),
        foot(
          L(
            "FAA IFH ch. 4, ch. 9 · exact radius at standard rate: speed ÷ 188",
            "FAA IFH ch. 4, ch. 9 · rayon exact au taux 1 : vitesse ÷ 188",
          ),
        ),
      ],
      { layout: "formula" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "radius (NM) = V ÷ (60 π);  lead (°) = 60 × radius ÷ DME",
          "rayon (NM) = V ÷ (60 π) ;  anticipation (°) = 60 × rayon ÷ DME",
        ),
        ruleOfThumb: L(
          "At standard rate the radius is about ground speed ÷ 200 NM: 0.5 NM at 100 kt, 0.6 NM at 120 kt. Lead a 90° turn by that distance. On a DME arc, turn it into radials with the 1 in 60: 0.6 NM at 10 DME is about 4°.",
          "Au taux 1, le rayon vaut environ vitesse sol ÷ 200 NM : 0,5 NM à 100 kt, 0,6 NM à 120 kt. Anticipez un virage de 90° de cette distance. Sur un arc DME, convertissez en radiales avec le 1 sur 60 : 0,6 NM à 10 DME, c’est environ 4°.",
        ),
        refs: [{ src: "FAA-IFH", ref: "ch. 4, ch. 9" }],
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

/** A6 — the standard setting: the same altimeter on the ground at PARD, set to the QNH and then to 29.92, side by
 *  side. The student turns the knob in the next step (mi-alt-try). */
function altimetrySlide(): Step {
  const [lx, rx, y, s] = [G.left + 152, 984 + 152, 328, 512];
  return slideStep(
    "mi-alt",
    L("Pressure altitude: set 1013", "L’altitude-pression : calez 1013"),
    canvas(
      [
        ...head(
          L("Altimetry", "Altimétrie"),
          L(
            "Set 29.92: the altimeter reads PA",
            "Calez 29.92 (1013 hPa) : l’altimètre lit la Zp",
          ),
          1680,
        ),
        lead(
          L(
            "On the ground at PARD (420 ft), QNH 30.12 in: only the setting changes.",
            "Au sol à PARD (420 ft), QNH 30.12 inHg (1020 hPa) : seul le calage change.",
          ),
          1560,
        ),
        INST(
          ALT,
          L(
            "Altimeter set to the QNH 30.12: 420 ft, the field elevation",
            "Altimètre calé au QNH 30.12 (1020 hPa) : 420 ft, l’altitude du terrain",
          ),
          lx,
          y,
          s,
          s,
          { id: "mi-alt.mi.qnh", scene: "mi.qnh" },
        ),
        T(
          "body",
          L(
            "Set to the QNH 30.12 in the window: **420 ft**, the elevation.",
            "Calé au QNH, 30.12 dans la fenêtre : **420 ft**, l’altitude du terrain.",
          ),
          G.left,
          856,
          816,
          104,
          { align: "center" },
        ),
        INST(
          ALT,
          L(
            "Altimeter set to 29.92: about 220 ft, the pressure altitude",
            "Altimètre calé sur 29.92 (1013 hPa) : environ 220 ft, l’altitude-pression",
          ),
          rx,
          y,
          s,
          s,
          { id: "mi-alt.mi.std", scene: "mi.std", reveal: { order: 1 } },
        ),
        T(
          "body",
          L(
            "Set to 29.92: **220 ft**, the pressure altitude. 0.20 in × 1,000 = 200 ft lower.",
            "Calé sur 29.92 : **220 ft**, l’altitude-pression. 0,20 inHg × 1 000 = 200 ft de moins.",
          ),
          984,
          856,
          816,
          104,
          { align: "center", reveal: 1 },
        ),
        foot(
          L(
            "FAA PHAK ch. 8 · 1 inHg ≈ 1,000 ft · 1 hPa ≈ 27 ft · 29.92 inHg = 1013 hPa",
            "FAA PHAK ch. 8 · 1 inHg ≈ 1 000 ft · 1 hPa ≈ 27 ft · 29.92 inHg = 1013 hPa",
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
          "PA = elevation + (29.92 − altimeter) × 1,000 ft, or + (1013 − QNH) × 27 ft",
          "Zp = altitude du terrain + (1013 − QNH) × 27 ft",
        ),
        ruleOfThumb: L(
          "On the ground at PARD (420 ft), altimeter 30.12: set 29.92 and the altimeter reads about 220 ft, the pressure altitude. Above standard, PA is below the elevation; below standard, above it. In the aircraft: flight levels and the performance tables start from pressure altitude. In the next step, you turn the setting knob yourself. The trainer’s altimeter is graduated in inHg: 29.92 inHg = 1013 hPa.",
          "Au sol à PARD (420 ft), QNH 1020 : calez 1013 et l’altimètre lit environ 220 ft, l’altitude-pression (1 hPa ≈ 27 ft). Au-dessus du standard, la Zp est sous l’altitude du terrain ; en dessous, au-dessus. Dans l’avion : les niveaux de vol et les tables de performances partent de l’altitude-pression. À l’étape suivante, vous tournez vous-même le bouton de calage. L’altimètre de l’avion d’entraînement est gradué en inHg : 29.92 inHg = 1013 hPa.",
        ),
        refs: [{ src: "FAA-PHAK", ref: "ch. 8" }],
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

/** A8 with an instrument — cold temperature: what the altimeter shows at the FAF, the rule, the worked lines. */
function coldSlide(): Step {
  return slideStep(
    "mi-cold",
    L("Cold temperature: lower than shown", "Grand froid : plus bas qu’indiqué"),
    canvas(
      [
        ...head(
          L("Altimetry", "Altimétrie"),
          L("Cold: lower than shown", "Grand froid : plus bas qu’indiqué"),
        ),
        lead(
          L(
            "At the FAF of PARD, 2,000 ft above the field, −16 °C on the ground (ISA −30).",
            "Au FAF de PARD, 2 000 ft au-dessus du terrain, −16 °C au sol (ISA −30).",
          ),
          1560,
        ),
        INST(
          ALT,
          L(
            "Altimeter reading 2,420 ft at the final approach fix",
            "Altimètre indiquant 2 420 ft au repère d’approche finale",
          ),
          G.left,
          336,
          624,
          624,
          { id: "mi-cold.alt", scene: "mi.cold" },
        ),
        T("number", L("+4%", "+4 %"), 840, 320, 432, 136, { color: "stop" }),
        T(
          "heading",
          L(
            "of the height, per 10 °C below ISA",
            "de la hauteur, par 10 °C sous ISA",
          ),
          840,
          472,
          960,
          56,
        ),
        rule(840, 552, 960),
        T(
          "formula",
          L(
            "correction | = 4% × 3 × 2,000 = !240 ft!",
            "correction | = 4 % × 3 × 2 000 = !240 ft!",
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
            "true | ≈ 2,420 − 240 = !2,180 ft!",
            "réel | ≈ 2 420 − 240 = !2 180 ft!",
          ),
          840,
          656,
          960,
          72,
          { reveal: 2 },
        ),
        T(
          "body",
          L(
            "The altimeter shows 2,420 ft; the aircraft is near 2,180 ft. In the aircraft: add the correction to the published altitudes and fly **2,660 ft** indicated.",
            "L’altimètre indique 2 420 ft ; l’avion est vers 2 180 ft. Dans l’avion : ajoutez la correction aux altitudes publiées et volez **2 660 ft** indiqués.",
          ),
          840,
          752,
          960,
          208,
          { reveal: 3 },
        ),
        foot(
          L(
            "ICAO Doc 8168 Vol I · FAA AIM 7-3 · height above the altimeter-setting source",
            "OACI Doc 8168 Vol I · FAA AIM 7-3 · hauteur au-dessus de la source du calage",
          ),
          1680,
        ),
      ],
      { scene: "mi.cold", layout: "formula" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "correction ≈ height × 4% × (ISA − OAT) ÷ 10",
          "correction ≈ hauteur × 4 % × (ISA − T) ÷ 10",
        ),
        ruleOfThumb: L(
          "Cold air is denser: the pressure levels sit lower, so the aircraft is lower than the altimeter shows. Add about 4% of the height above the altimeter-setting source per 10 °C below ISA to the published altitudes (FAA AIM 7-3; ICAO Doc 8168 has the table). ISA −30, 2,000 ft above the field: +240 ft, so the FAF at 2,420 ft is flown at 2,660 ft indicated.",
          "L’air froid est plus dense : les niveaux de pression sont plus bas, donc l’avion est plus bas que l’altimètre ne l’indique. Ajoutez environ 4 % de la hauteur au-dessus de la source du calage par 10 °C sous ISA aux altitudes publiées (FAA AIM 7-3 ; le tableau est dans l’OACI Doc 8168). ISA −30, 2 000 ft au-dessus du terrain : +240 ft, donc le FAF à 2 420 ft se vole à 2 660 ft indiqués.",
        ),
        refs: [
          { src: "ICAO Doc 8168", ref: "Vol I" },
          { src: "FAA-AIM", ref: "7-3" },
        ],
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

/** A6 — true airspeed: the same 110 kt on two airspeed indicators, at 2,000 ft and at 8,000 ft, no wind — the
 *  ground speed read from each scene is the true airspeed. */
function tasSlide(): Step {
  const half = (
    x: number,
    sc: string,
    alt: [string, string],
    body: [string, string],
    i: number,
  ) => [
    INST(ASI, L(alt[0], alt[1]), x + 152, 328, 512, 512, {
      id: `mi-tas.${sc}`,
      scene: sc,
    }),
    T("body", L(body[0], body[1]), x, 856, 816, 104, {
      align: "center",
      reveal: i,
      bind: { k: "readout", readout: "gs", scene: sc },
    }),
  ];
  return slideStep(
    "mi-tas",
    L("True airspeed: +2% per 1,000 ft", "La vitesse propre : +2 % par 1 000 ft"),
    canvas(
      [
        ...head(
          L("Airspeeds", "Vitesses"),
          L("TAS ≈ IAS + 2% per 1,000 ft", "Vp ≈ Vi + 2 % par 1 000 ft"),
        ),
        lead(
          L(
            "The same needle on 110 kt, no wind: only the altitude changes.",
            "La même aiguille sur 110 kt, sans vent : seule l’altitude change.",
          ),
          1560,
        ),
        ...half(
          G.left,
          "mi.tas.low",
          [
            "Airspeed indicator at 2,000 ft: 110 kt indicated",
            "Anémomètre à 2 000 ft : 110 kt indiqués",
          ],
          [
            "At 2,000 ft: 110 + 4% ≈ **114 kt**. Ground speed read: {{value}}",
            "À 2 000 ft : 110 + 4 % ≈ **114 kt**. Vitesse sol lue : {{value}}",
          ],
          1,
        ),
        ...half(
          984,
          "mi.tas.high",
          [
            "Airspeed indicator at 8,000 ft: 110 kt indicated",
            "Anémomètre à 8 000 ft : 110 kt indiqués",
          ],
          [
            "At 8,000 ft: 110 + 16% ≈ **128 kt**. Ground speed read: {{value}}",
            "À 8 000 ft : 110 + 16 % ≈ **128 kt**. Vitesse sol lue : {{value}}",
          ],
          2,
        ),
        foot(
          L(
            "FAA PHAK ch. 8 · with no wind, the ground speed is the true airspeed",
            "FAA PHAK ch. 8 · sans vent, la vitesse sol est la vitesse propre",
          ),
          1680,
        ),
      ],
      { layout: "compare" },
    ),
    [
      {
        t: "formula",
        formula: L("TAS = CAS ÷ √σ", "Vp = Vc ÷ √σ"),
        ruleOfThumb: L(
          "TAS ≈ IAS + 2% per 1,000 ft, good to a few knots; the flight computer gives the exact value from the pressure altitude and the temperature. 110 kt indicated: about 114 kt at 2,000 ft, about 128 kt at 8,000 ft. In the aircraft: the flight plan, the wind triangle, the turn radius and the descent rate all use the true airspeed and the ground speed, not the needle.",
          "Vp ≈ Vi + 2 % par 1 000 ft, à quelques nœuds près ; le calculateur donne la valeur exacte avec l’altitude-pression et la température. 110 kt indiqués : environ 114 kt à 2 000 ft, environ 128 kt à 8 000 ft. Dans l’avion : le plan de vol, le triangle des vents, le rayon de virage et la Vz utilisent la vitesse propre et la vitesse sol, pas l’aiguille.",
        ),
        refs: [{ src: "FAA-PHAK", ref: "ch. 8" }],
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

/** A9 — a quick check before the practice: full-width tiles (no diagram: the question is the rule itself). */
function check(): Step {
  return slideStep(
    "mi-check",
    L("Check: the descent rate", "Vérification : la vitesse verticale"),
    canvas(
      [
        ...head(
          L("Check", "Vérification"),
          L("What should the VSI show?", "Que doit indiquer le variomètre ?"),
        ),
        lead(
          L(
            "On the 3° path at 90 kt ground speed.",
            "Sur le plan à 3°, à 90 kt de vitesse sol.",
          ),
        ),
        QUIZ(
          "mi-check.q",
          {
            kind: "mcq",
            prompt: L(
              "The descent rate, in ft/min?",
              "La vitesse verticale, en ft/min ?",
            ),
            options: [
              {
                text: L("270", "270"),
                why: L(
                  "You multiplied by 3 (the 3°, or 3 NM per 1,000 ft): the rate on 3° is ground speed × 5.",
                  "Vous avez multiplié par 3 (les 3°, ou 3 NM par 1 000 ft) : la Vz à 3°, c’est vitesse sol × 5.",
                ),
              },
              { text: L("450", "450") },
              {
                text: L("900", "900"),
                why: L(
                  "90 × 10 is a 6° path: twice too steep.",
                  "90 × 10, c’est un plan à 6° : deux fois trop raide.",
                ),
              },
            ],
            answer: 1,
            explain: L(
              "90 × 5 = 450 ft/min (exact 477). Ground speed, not airspeed: a headwind lowers it.",
              "90 × 5 = 450 ft/min (exact 477). La vitesse sol, pas la vitesse air : un vent de face la diminue.",
            ),
          },
          G.left,
          336,
          1680,
          648,
        ),
        foot(L("FAA IFH ch. 10", "FAA IFH ch. 10")),
      ],
      { layout: "quiz" },
    ),
    [
      {
        t: "text",
        text: L(
          "Descent rate on a 3° path ≈ ground speed × 5: 90 kt → 450 ft/min.",
          "Vitesse verticale sur un plan à 3° ≈ vitesse sol × 5 : 90 kt → 450 ft/min.",
        ),
      },
    ],
    { minutes: 1 },
  );
}

/** A9 — a quick check after the standard-rate turn: the clock. */
function turnCheck(): Step {
  return slideStep(
    "mi-turn-check",
    L("Check: how long is the turn?", "Vérification : combien dure le virage ?"),
    canvas(
      quizBlocks({
        id: "mi-turn-check",
        eyebrow: L("Check", "Vérification"),
        title: L("How long is the turn?", "Combien dure le virage ?"),
        lead: L(
          "You fly heading 090. ATC: “turn right heading 270”. Standard rate.",
          "Vous êtes au cap 090. Le contrôle : « virez à droite cap 270 ». Au taux 1.",
        ),
        quiz: {
          kind: "mcq",
          prompt: L(
            "From roll-in to roll-out, the turn takes…",
            "De l’entrée à la sortie, le virage dure…",
          ),
          options: [
            {
              text: L("30 s", "30 s"),
              why: L(
                "30 seconds is 90°, a quarter of a turn. From 090 to 270 is twice that.",
                "30 secondes, c’est 90° : un quart de tour. Du 090 au 270, il en faut le double.",
              ),
            },
            { text: L("1 min", "1 min") },
            {
              text: L("2 min", "2 min"),
              why: L(
                "2 minutes is the full circle, 360°: the “2 MIN” written on the instrument.",
                "2 minutes, c’est le tour complet, 360° : le « 2 MIN » écrit sur l’instrument.",
              ),
            },
          ],
          answer: 1,
          explain: L(
            "180° ÷ 3° per second = 60 s. Start the clock as you roll in, roll out at one minute.",
            "180° ÷ 3° par seconde = 60 s. Lancez le chrono à l’entrée, sortez à une minute.",
          ),
        },
        foot: L("FAA IFH ch. 7 · timed turns", "FAA IFH ch. 7 · virages chronométrés"),
      }),
      { layout: "quiz" },
    ),
    [
      {
        t: "text",
        text: L(
          "At standard rate the aircraft turns 3° per second: 90° in 30 s, 180° in 1 min, 360° in 2 min.",
          "Au taux 1, l’avion tourne de 3° par seconde : 90° en 30 s, 180° en 1 min, 360° en 2 min.",
        ),
      },
    ],
    { minutes: 1 },
  );
}

/** A10 — three numbers and three checks, before the practice. */
function recap(): Step {
  return slideStep(
    "mi-recap",
    L("Three numbers to keep in mind", "Trois chiffres à garder en tête"),
    canvas(
      [
        ...head(
          L("Keep in mind", "À retenir"),
          L("Three numbers to keep in mind", "Trois chiffres à garder en tête"),
        ),
        ...recapBlocks({
          id: "mi-recap",
          cols: [
            {
              n: L("1:60", "1:60"),
              text: L(
                "1 NM off at 60 NM is 1° of track error",
                "1 NM d’écart à 60 NM, c’est 1° d’erreur",
              ),
            },
            {
              n: L("318", "318"),
              text: L(
                "ft per NM on 3°: 3 NM per 1,000 ft to lose",
                "ft par NM à 3° : 3 NM par 1 000 ft à perdre",
              ),
            },
            {
              n: L("×5", "×5"),
              text: L(
                "ground speed × 5 = ft/min on 3°",
                "vitesse sol × 5 = ft/min à 3°",
              ),
            },
          ],
          checksTitle: L("Every approach", "À chaque approche"),
          checks: [
            L(
              "Thousands of ft to lose × 3 = NM",
              "Milliers de ft à perdre × 3 = NM",
            ),
            L("Rate = ground speed × 5", "Vz = vitesse sol × 5"),
            L(
              "VDP = height ÷ 300, from the threshold",
              "VDP = hauteur ÷ 300, depuis le seuil",
            ),
          ],
        }),
        foot(
          L(
            "FAA IFH ch. 9–10 · FAA AIM 5-4-5",
            "FAA IFH ch. 9–10 · FAA AIM 5-4-5",
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
            "1:60 — 1 NM off at 60 NM is 1°.",
            "1:60 — 1 NM d’écart à 60 NM vaut 1°.",
          ),
          L(
            "318 ft/NM on 3° — 3 NM per 1,000 ft.",
            "318 ft/NM à 3° — 3 NM par 1 000 ft.",
          ),
          L(
            "Ground speed × 5 = ft/min on 3°.",
            "Vitesse sol × 5 = ft/min à 3°.",
          ),
        ],
      },
    ],
    { minutes: 1 },
  );
}

// ================================================================== section openers
const PARTS = [
  L("Descent and approach", "Descente et approche"),
  L("Track and turns", "Route et virages"),
  L("Altimeter and airspeed", "Altimètre et vitesse"),
  L("Review and fly", "Bilan et vol"),
];
function part(
  n: 1 | 2 | 3 | 4,
  title: [string, string],
  text: [string, string],
): Step {
  return slideStep(
    `mi-part${n}`,
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
    ["Start down at the right place", "Descendre au bon endroit"],
    [
      "The 3° path: where to start down, at what rate, where to leave the MDA. Then the LOC 27 at PARD, flown.",
      "Le plan à 3° : où commencer, à quelle Vz, où quitter la MDA. Puis le LOC 27 de PARD, volé.",
    ],
  );
const part2 = () =>
  part(
    2,
    ["Hold the track, fly the turns", "Tenir la route, réussir ses virages"],
    [
      "The 1 in 60 on the CDI, the standard-rate turn on the turn coordinator, the lead. Then the DME arc, flown.",
      "Le 1 sur 60 sur le CDI, le virage au taux 1 sur l’indicateur de virage, l’anticipation. Puis l’arc DME, volé.",
    ],
  );
const part3 = () =>
  part(
    3,
    ["Correct the altimeter and the airspeed", "Corriger l’altimètre et la vitesse"],
    [
      "The standard setting, the cold and the true airspeed: three corrections to make in the head.",
      "Le calage standard, le grand froid et la vitesse propre : trois corrections à faire de tête.",
    ],
  );
const part4 = () =>
  part(
    4,
    ["From memory, then in the cockpit", "De mémoire, puis au cockpit"],
    [
      "Three numbers, three questions on the classic mistakes, ten timed problems. Then your own descent, flown to ARD.",
      "Trois chiffres, trois questions sur les erreurs classiques, dix problèmes chronométrés. Puis votre descente, volée jusqu’à ARD.",
    ],
  );

/** The objectives: what the student can do at the end, measurably, and how the course proves it. */
function goals(): Step {
  return slideStep(
    "mi-goals",
    L("What you will be able to do", "Ce que vous saurez faire"),
    canvas(
      objectivesBlocks({
        eyebrow: L("Objectives", "Objectifs"),
        title: L("What you will be able to do", "Ce que vous saurez faire"),
        objectives: [
          L(
            "Find the top of descent and the rate of a 3° path, within 1 NM and 50 ft/min.",
            "Trouver le début de descente et la Vz d’un plan à 3°, à 1 NM et 50 ft/min près.",
          ),
          L(
            "Correct a track error with the 1 in 60 rule, within 2°, and read it on the CDI.",
            "Corriger un écart de route avec la règle du 1 sur 60, à 2° près, et le lire sur le CDI.",
          ),
          L(
            "Hold a standard-rate turn and lead a radial by the turn radius.",
            "Tenir un virage au taux 1 et anticiper une radiale du rayon de virage.",
          ),
          L(
            "Correct the altimeter for the setting and the cold, and the airspeed for altitude.",
            "Corriger l’altimètre du calage et du froid, et la vitesse de l’altitude.",
          ),
        ],
        proofs: [
          { n: L("6", "6"), text: L("instruments you work yourself", "instruments à manipuler vous-même") },
          { n: L("9", "9"), text: L("calculations, new numbers each time", "calculs, de nouveaux chiffres à chaque fois") },
          { n: L("6", "6"), text: L("questions, every wrong answer explained", "questions, chaque erreur expliquée") },
          { n: L("3", "3"), text: L("flights in the cockpit", "vols au cockpit"), color: "path" },
        ],
        tip: L(
          "All of it in the head: no calculator, no table. Each rule comes with its exact value, so you know what the rounding costs.",
          "Tout de tête : ni calculette, ni table. Chaque règle vient avec sa valeur exacte, pour savoir ce que coûte l’arrondi.",
        ),
      }),
      { layout: "ready" },
    ),
    [
      {
        t: "keys",
        items: [
          L(
            "Find the top of descent and the rate of a 3° path, within 1 NM and 50 ft/min.",
            "Trouver le début de descente et la Vz d’un plan à 3°, à 1 NM et 50 ft/min près.",
          ),
          L(
            "Correct a track error with the 1 in 60 rule, within 2°, and read it on the CDI.",
            "Corriger un écart de route avec la règle du 1 sur 60, à 2° près, et le lire sur le CDI.",
          ),
          L(
            "Hold a standard-rate turn and lead a radial by the turn radius.",
            "Tenir un virage au taux 1 et anticiper une radiale du rayon de virage.",
          ),
          L(
            "Correct the altimeter for the setting and the cold, and the airspeed for altitude.",
            "Corriger l’altimètre du calage et du froid, et la vitesse de l’altitude.",
          ),
        ],
      },
    ],
    { minutes: 1 },
  );
}

/** A9 × 3 — retrieval at the end: one question per classic mistake, every wrong answer with its own explanation. */
function retrieval(): Step[] {
  const q = (
    n: 1 | 2 | 3,
    title: [string, string],
    context: [string, string],
    quiz: Extract<Parameters<typeof QUIZ>[1], { kind: "mcq" }>,
    source: string,
    reader: [string, string],
  ): Step =>
    slideStep(
      `mi-q${n}`,
      L(`From memory ${n}/3: ${title[0]}`, `De mémoire ${n}/3 : ${title[1]}`),
      canvas(
        quizBlocks({
          id: `mi-q${n}`,
          eyebrow: L(`From memory · ${n} of 3`, `De mémoire · ${n} sur 3`),
          title: L(title[0], title[1]),
          lead: L(context[0], context[1]),
          quiz,
          foot: L(source, source),
        }),
        { layout: "quiz" },
      ),
      [{ t: "text", text: L(reader[0], reader[1]) }],
      { minutes: 1 },
    );
  return [
    q(
      1,
      ["How much do you turn?", "De combien virez-vous ?"],
      [
        "After 20 NM you are 2 NM left of the course. The fix is 40 NM ahead.",
        "Après 20 NM, vous êtes 2 NM à gauche de la route. Le repère est 40 NM plus loin.",
      ],
      {
        kind: "mcq",
        prompt: L(
          "The turn to the right to reach the fix?",
          "Le virage à droite pour rejoindre le repère ?",
        ),
        options: [
          {
            text: L("3°", "3°"),
            why: L(
              "That is the closing angle alone (60 × 2 ÷ 40). You must also cancel the 6° of error.",
              "C’est l’angle pour rejoindre seul (60 × 2 ÷ 40). Il faut aussi annuler les 6° d’erreur.",
            ),
          },
          {
            text: L("6°", "6°"),
            why: L(
              "That is the track error alone (60 × 2 ÷ 20): you would fly parallel to the course, 2 NM beside it.",
              "C’est l’erreur de route seule (60 × 2 ÷ 20) : vous voleriez parallèle à la route, 2 NM à côté.",
            ),
          },
          { text: L("9°", "9°") },
        ],
        answer: 2,
        explain: L(
          "Error 60 × 2 ÷ 20 = 6°, closing 60 × 2 ÷ 40 = 3°: turn 9° right.",
          "Erreur 60 × 2 ÷ 20 = 6°, rejoindre 60 × 2 ÷ 40 = 3° : virez de 9° à droite.",
        ),
      },
      "EASA Part-FCL 061",
      [
        "1 in 60, both angles: 2 NM off after 20 NM is 6° of error; 2 NM over the 40 NM to go is 3° more; turn 9°.",
        "Le 1 sur 60, les deux angles : 2 NM d’écart après 20 NM, c’est 6° d’erreur ; 2 NM sur les 40 NM restants, 3° de plus ; virez de 9°.",
      ],
    ),
    q(
      2,
      ["Where and how fast down?", "Où descendre, et à quelle Vz ?"],
      [
        "At 9,000 ft, to cross the fix at 3,000 ft. Airspeed 120 kt, headwind 30 kt.",
        "À 9 000 ft, à passer le repère à 3 000 ft. Vitesse air 120 kt, vent de face 30 kt.",
      ],
      {
        kind: "mcq",
        prompt: L(
          "Top of descent and rate, on a 3° path?",
          "Début de descente et Vz, sur un plan à 3° ?",
        ),
        options: [
          { text: L("18 NM · 450 ft/min", "18 NM · 450 ft/min") },
          {
            text: L("18 NM · 600 ft/min", "18 NM · 600 ft/min"),
            why: L(
              "120 × 5 uses the airspeed. Over the ground you do 90 kt: at 600 ft/min you are down too early, low before the fix.",
              "120 × 5, c’est la vitesse air. Au sol vous faites 90 kt : à 600 ft/min, vous êtes en bas trop tôt, bas avant le repère.",
            ),
          },
          {
            text: L("27 NM · 450 ft/min", "27 NM · 450 ft/min"),
            why: L(
              "27 is 9 × 3: the altitude, not the height to lose. 9,000 − 3,000 = 6,000 ft, so 18 NM.",
              "27, c’est 9 × 3 : l’altitude, pas la hauteur à perdre. 9 000 − 3 000 = 6 000 ft, soit 18 NM.",
            ),
          },
        ],
        answer: 0,
        explain: L(
          "6,000 ft to lose × 3 = 18 NM. Ground speed 120 − 30 = 90 kt, × 5 = 450 ft/min.",
          "6 000 ft à perdre × 3 = 18 NM. Vitesse sol 120 − 30 = 90 kt, × 5 = 450 ft/min.",
        ),
      },
      "FAA IFH ch. 10",
      [
        "Height to lose, not altitude: 6,000 ft × 3 NM per 1,000 ft = 18 NM. Ground speed, not airspeed: 90 kt × 5 = 450 ft/min.",
        "La hauteur à perdre, pas l’altitude : 6 000 ft × 3 NM par 1 000 ft = 18 NM. La vitesse sol, pas la vitesse air : 90 kt × 5 = 450 ft/min.",
      ],
    ),
    q(
      3,
      ["Where is the aircraft?", "Où est l’avion ?"],
      [
        "−25 °C on the ground. Your altimeter shows exactly the published altitude of the FAF.",
        "−25 °C au sol. Votre altimètre indique exactement l’altitude publiée du FAF.",
      ],
      {
        kind: "mcq",
        prompt: L(
          "Compared with the published altitude, the aircraft is…",
          "Par rapport à l’altitude publiée, l’avion est…",
        ),
        options: [
          {
            text: L("higher", "plus haut"),
            why: L(
              "The other way round: cold air is denser, the pressure levels sit closer to the ground.",
              "C’est l’inverse : l’air froid est plus dense, les niveaux de pression se tassent vers le sol.",
            ),
          },
          { text: L("lower", "plus bas") },
          {
            text: L("exactly on it", "exactement dessus"),
            why: L(
              "Only in a standard atmosphere. In the cold the altimeter over-reads: about 4% of the height per 10 °C below ISA.",
              "Seulement en atmosphère standard. Par grand froid l’altimètre surestime : environ 4 % de la hauteur par 10 °C sous ISA.",
            ),
          },
        ],
        answer: 1,
        explain: L(
          "Lower than shown: add the cold correction to the published altitudes before you fly them.",
          "Plus bas qu’indiqué : ajoutez la correction de froid aux altitudes publiées avant de les voler.",
        ),
      },
      "ICAO Doc 8168 Vol I · FAA AIM 7-3",
      [
        "In the cold the aircraft is lower than the altimeter shows: add about 4% of the height per 10 °C below ISA to the published altitudes.",
        "Par grand froid, l’avion est plus bas que l’altimètre ne l’indique : ajoutez environ 4 % de la hauteur par 10 °C sous ISA aux altitudes publiées.",
      ],
    ),
  ];
}

/** A3 grid — the page to keep. */
function cheatSheet(): Step {
  const rows: [string, string, string, string][] = [
    ["1:60", "1:60", "1° ≈ 1 NM at 60 NM", "1° ≈ 1 NM à 60 NM"],
    [
      "318",
      "318",
      "ft/NM on a 3° path (≈ 300)",
      "ft/NM sur un plan à 3° (≈ 300)",
    ],
    [
      "×5",
      "×5",
      "ground speed × 5 = ft/min on 3°",
      "vitesse sol × 5 = ft/min à 3°",
    ],
    ["×3", "×3", "NM per 1,000 ft to lose", "NM par 1 000 ft à perdre"],
    [
      "+7",
      "+7",
      "bank = TAS ÷ 10 + 7, standard rate",
      "inclinaison = Vp ÷ 10 + 7, taux standard",
    ],
    ["+2%", "+2 %", "TAS over IAS per 1,000 ft", "Vp sur Vi par 1 000 ft"],
    [
      "÷300",
      "÷300",
      "(MDA − TDZE) ÷ 300 = VDP in NM",
      "(MDA − TDZE) ÷ 300 = VDP en NM",
    ],
    [
      "÷60",
      "÷60",
      "ft/NM × GS ÷ 60 = ft/min to climb",
      "ft/NM × Vs ÷ 60 = ft/min de montée",
    ],
  ];
  return slideStep(
    "mi-sheet",
    L("Keep this page", "Gardez cette page"),
    canvas(
      [
        ...head(
          L("Rules of thumb", "Règles pratiques"),
          L("Keep this page", "Gardez cette page"),
        ),
        ...sheetBlocks(
          rows.map(([n, nf, c, cf]) => ({ n: L(n, nf), text: L(c, cf) })),
        ),
        foot(
          L(
            "FAA IFH ch. 4–10 · FAA AIM 5-2-9, 5-4-5 · EASA Part-FCL 061",
            "FAA IFH ch. 4–10 · FAA AIM 5-2-9, 5-4-5 · EASA Part-FCL 061",
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
          "1:60 · 318 ft/NM · GS × 5 · 3 NM per 1,000 ft · TAS/10 + 7 · +2%/1,000 ft · VDP ÷ 300 · climb ft/NM × GS ÷ 60",
          "1:60 · 318 ft/NM · Vs × 5 · 3 NM par 1 000 ft · Vp/10 + 7 · +2 %/1 000 ft · VDP ÷ 300 · montée ft/NM × Vs ÷ 60",
        ),
      },
    ],
    { minutes: 1 },
  );
}

/** The Maths for IFR sample (40 steps), in four parts: each rule taught, tried on its instrument, practised and flown. */
export function mathsIfrCourse(): Course {
  const SIXTY_CALC = step(
    "mi-60-calc",
    "calc",
    L(
      "Off course: how much to correct?",
      "Hors route : de combien corriger ?",
    ),
    [],
    {
      minutes: 3,
      calc: { generatorId: "ifr.sixtyToOne" },
    },
  );
  // the same problem on the PFD: the student turns the heading bug to the heading computed and the needle comes back
  const SIXTY_TRY = step(
    "mi-60-try",
    "try",
    L(
      "Try it: fly the heading you computed",
      "À vous : prenez le cap calculé",
    ),
    [
      {
        t: "text",
        text: L(
          "The problem of “Off course: how much to correct?”, in the air: the same course, the same distance off. Turn the heading bug to the heading you computed: the aircraft follows the bug. Then watch the needle of the HSI come back towards the centre.",
          "Le problème de « Hors route : de combien corriger ? », en vol : la même route, le même écart. Tournez l’index de cap jusqu’au cap calculé : l’avion suit l’index. Regardez ensuite l’aiguille du HSI revenir vers le centre.",
        ),
      },
      {
        t: "keys",
        items: [
          L(
            "The needle comes back slowly: 1° of correction is only 1 NM in 60. Hold the heading and wait.",
            "L’aiguille revient lentement : 1° de correction, c’est seulement 1 NM en 60. Tenez le cap et attendez.",
          ),
        ],
      },
    ],
    { minutes: 3, calcLink: { step: "mi-60-calc", use: "both" } },
  );
  const RATE_CALC = step(
    "mi-rate-calc",
    "calc",
    L("Descent rate for the path", "Vitesse verticale pour le plan"),
    [],
    {
      minutes: 3,
      calc: { generatorId: "ifr.descentRate" },
    },
  );
  const CLIMB_CALC = step(
    "mi-climb-calc",
    "calc",
    L(
      "Can you make the climb gradient?",
      "Tenez-vous la pente de montée ?",
    ),
    [
      {
        t: "formula",
        formula: L(
          "ft/min = ft/NM × GS ÷ 60",
          "ft/min = ft/NM × Vs ÷ 60",
        ),
        ruleOfThumb: L(
          "The descent rule in reverse: at 90 kt you fly 1.5 NM a minute, so 200 ft/NM needs 300 ft/min.",
          "La règle de descente à l’envers : à 90 kt vous faites 1,5 NM par minute, donc 200 ft/NM demandent 300 ft/min.",
        ),
        refs: [{ src: "FAA-AIM", ref: "5-2-9" }],
      },
    ],
    {
      minutes: 3,
      calc: { generatorId: "ifr.climbGradient" },
    },
  );
  const TOD_CALC = step(
    "mi-tod-calc",
    "calc",
    L("Where do I start down?", "Où commencer la descente ?"),
    [],
    {
      minutes: 3,
      calc: { generatorId: "ifr.topOfDescent", params: { variant: "gradient" } },
    },
  );
  const VDP_CALC = step("mi-vdp-calc", "calc", L("Find the VDP", "Trouver le VDP"), [], {
    minutes: 2,
    calc: { generatorId: "ifr.vdp" },
  });
  const VDP_FLY = step(
    "mi-vdp-fly",
    "fly",
    L(
      "Fly it: the LOC 27 at PARD, with your VDP",
      "À vous : le LOC 27 de PARD, avec votre VDP",
    ),
    [
      {
        t: "text",
        text: L(
          "The glideslope is out: a non-precision LOC approach to PARD runway 27, MDA 900 ft, TDZE 420 ft. Before the final approach fix, work out your VDP with the rule you just practised, then fly it.",
          "Le glide est en panne : une approche classique LOC sur la piste 27 de PARD, MDA 900 ft, TDZE 420 ft. Avant le repère d’approche finale, calculez votre VDP avec la règle que vous venez de pratiquer, puis volez-la.",
        ),
      },
    ],
    {
      minutes: 10,
      flyIt: {
        target: { kind: "lesson", exerciseId: "app-loc" },
        brief: L(
          "LOC 27 at PARD, glideslope out: MDA 900 ft, TDZE 420 ft. Before the FAF, compute your VDP: (MDA − TDZE) ÷ 300, in NM from the threshold. Never below the MDA without the runway in sight. Past the VDP with no runway: plan the missed approach, flown at the MAP.",
          "LOC 27 de PARD, glide en panne : MDA 900 ft, TDZE 420 ft. Avant le FAF, calculez votre VDP : (MDA − TDZE) ÷ 300, en NM du seuil. Jamais sous la MDA sans la piste en vue. VDP passé sans la piste : préparez la remise de gaz, exécutée au MAP.",
        ),
        keys: [
          L(
            "Descend at about GS × 5 from the FAF, so you reach the MDA before the VDP.",
            "Descendez à environ Vs × 5 depuis le FAF, pour atteindre la MDA avant le VDP.",
          ),
          L(
            "No runway at the MAP: go missed.",
            "Pas de piste au MAP : remise de gaz.",
          ),
        ],
        options: ["wind", "turbulence"],
        defaultsOn: [],
        criteria: [],
        debrief: L(
          "Where did you leave the MDA? At the VDP the 3° path brings you to the threshold; earlier you were low over the obstacles, later you had to dive.",
          "Où avez-vous quitté la MDA ? Au VDP, le plan à 3° vous mène au seuil ; plus tôt, vous étiez bas sur les obstacles ; plus tard, vous avez dû plonger.",
        ),
        returnTo: "thisStep",
      },
    },
  );
  const BANK_CALC = step(
    "mi-bank-calc",
    "calc",
    L("Bank for standard rate", "Inclinaison au taux standard"),
    [],
    {
      minutes: 2,
      calc: { generatorId: "ifr.standardRateBank" },
    },
  );
  const LEAD_CALC = step(
    "mi-lead-calc",
    "calc",
    L("Lead the turn onto a DME arc", "Anticiper le virage sur un arc DME"),
    [],
    {
      minutes: 3,
      calc: { generatorId: "ifr.dmeArcLead" },
    },
  );
  const ARC_FLY = step(
    "mi-arc-fly",
    "fly",
    L(
      "Fly it: the 10 DME arc around MSV",
      "À vous : l’arc 10 DME autour de MSV",
    ),
    [
      {
        t: "text",
        text: L(
          "The arc you just computed leads for: 10 DME around MSV, counter-clockwise from R-100 to R-030, then inbound. Work out the lead radial before you start: radius ≈ GS ÷ 200 NM, and lead (°) ≈ 60 × radius ÷ the arc’s DME.",
          "L’arc dont vous venez de calculer l’anticipation : 10 DME autour de MSV, dans le sens inverse des aiguilles d’une montre du R-100 au R-030, puis en rapprochement. Calculez la radiale d’anticipation avant de partir : rayon ≈ Vs ÷ 200 NM, et anticipation (°) ≈ 60 × rayon ÷ DME de l’arc.",
        ),
      },
    ],
    {
      minutes: 10,
      flyIt: {
        target: { kind: "lesson", exerciseId: "nav-arc" },
        brief: L(
          "10 DME arc around MSV at 95 kt, from R-100 to R-030, then inbound. Lead the turn inbound by your computed lead radial: about 0.5 NM of turn radius, so about 3° of radial on a 10 NM arc.",
          "Arc 10 DME autour de MSV à 95 kt, du R-100 au R-030, puis en rapprochement. Anticipez le virage en rapprochement de la radiale calculée : environ 0,5 NM de rayon, soit environ 3° de radiale sur un arc de 10 NM.",
        ),
        keys: [
          L(
            "Keep the bearing pointer on the wingtip: turn 10° each time it falls 10° behind.",
            "Gardez l’aiguille du RMI sur le bout d’aile : virez de 10° chaque fois qu’elle recule de 10°.",
          ),
        ],
        options: ["wind", "turbulence"],
        defaultsOn: ["wind"],
        criteria: [],
        debrief: L(
          "Did you overshoot the inbound radial? Then the lead was too small: radius ≈ GS ÷ 200, and 1 NM on a 10 NM arc is 6° of radial.",
          "Avez-vous dépassé la radiale de rapprochement ? L’anticipation était trop courte : rayon ≈ Vs ÷ 200, et 1 NM sur un arc de 10 NM vaut 6° de radiale.",
        ),
        returnTo: "thisStep",
      },
    },
  );
  const ALT_TRY = step(
    "mi-alt-try",
    "try",
    L(
      "Try it: set 29.92 and read the pressure altitude",
      "À vous : calez 29.92 (1013 hPa) et lisez l’altitude-pression",
    ),
    [
      {
        t: "text",
        text: L(
          "Another day at PARD (420 ft): the QNH is 29.72 in (1006 hPa), below standard. Before you touch anything: will the pressure altitude be above or below 420 ft? Then turn the setting knob to 29.92 and read the altimeter.",
          "Un autre jour à PARD (420 ft) : le QNH est 29.72 inHg (1006 hPa), sous le standard. Avant de toucher : l’altitude-pression sera-t-elle au-dessus ou au-dessous de 420 ft ? Tournez ensuite le bouton de calage jusqu’à 29.92 et lisez l’altimètre.",
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
        scene: "mi.lowp",
        controls: ["baro"],
      },
      quiz: {
        kind: "numeric",
        prompt: L(
          "With 29.92 set, what does the altimeter read?",
          "Calé sur 29.92, que lit l’altimètre ?",
        ),
        answer: 620,
        tol: 30,
        unit: "ft",
        explain: L(
          "620 ft: 0.20 in more, 200 ft more. Pressure below standard: the pressure altitude is above the field.",
          "620 ft : 0,20 inHg de plus, 200 ft de plus (7 hPa × 27 ≈ 190 ft). Pression sous le standard : l’altitude-pression est au-dessus du terrain.",
        ),
      },
      hint: L(
        "Press + on the setting knob until the window shows 29.92, then read the two hands: hundreds on the long one.",
        "Appuyez sur + du bouton de calage jusqu’à lire 29.92 dans la fenêtre, puis lisez les deux aiguilles : les centaines sur la grande.",
      ),
    },
  );
  const COLD_CALC = step(
    "mi-cold-calc",
    "calc",
    L("Correct for the cold", "Corriger pour le froid"),
    [],
    {
      minutes: 3,
      calc: { generatorId: "ifr.coldTemperature" },
    },
  );
  const TAS_CALC = step(
    "mi-tas-calc",
    "calc",
    L(
      "True airspeed from indicated",
      "Vitesse propre depuis la vitesse indiquée",
    ),
    [],
    {
      minutes: 2,
      calc: { generatorId: "ifr.tasFromIas", params: { method: "rule" } },
    },
  );
  const DRILL = step(
    "mi-drill",
    "drill",
    L("Drill: ten in a row", "Série : dix d’affilée"),
    [],
    {
      minutes: 8,
      drill: {
        // only what the course taught and practised before
        generatorIds: [
          "ifr.sixtyToOne",
          "ifr.descentRate",
          "ifr.climbGradient",
          "ifr.topOfDescent",
          "ifr.vdp",
          "ifr.standardRateBank",
          "ifr.coldTemperature",
          "ifr.tasFromIas",
        ],
        count: 10,
        timer: { mode: "perProblem", seconds: 45 },
        feedback: "each",
        practiceOnly: true,
      },
    },
  );
  const FINAL_FLY = step(
    "mi-fly",
    "fly",
    L(
      "Fly it: compute the descent, then fly it to ARD",
      "À vous : calculez la descente, puis volez-la jusqu’à ARD",
    ),
    [
      {
        t: "text",
        text: L(
          "The cockpit starts from the numbers you solved in “Where do I start down?”: 25 NM west of ARD, level at your cruise altitude, ARD standing in for the fix. Stay level until the DME shows your top of descent, then descend at the rate you computed and pass ARD at the crossing altitude. The flight ends over ARD.",
          "Le cockpit part des chiffres résolus dans « Où commencer la descente ? » : 25 NM à l’ouest d’ARD, en palier à votre altitude de croisière, ARD remplaçant le point. Restez en palier jusqu’à ce que le DME affiche votre début de descente, puis descendez à la Vz calculée et passez ARD à l’altitude de passage. Le vol se termine à la verticale d’ARD.",
        ),
      },
    ],
    {
      minutes: 14,
      flyIt: {
        // ends over ARD (a milestone, no duration): the level segment before the TOD is part of the exercise, so
        // the rate is not graded as a path from the first second
        target: { kind: "calc", step: "mi-tod-calc" },
        brief: L(
          "Start down at your top of descent (the DME distance from ARD you computed) and pass ARD at the crossing altitude.",
          "Commencez la descente à votre TOD (la distance DME d’ARD calculée) et passez ARD à l’altitude de passage.",
        ),
        keys: [
          L(
            "Level until the DME reads your TOD: starting early or late is the error this flight shows.",
            "En palier jusqu’à ce que le DME lise votre TOD : partir tôt ou tard, c’est l’erreur que ce vol montre.",
          ),
          L(
            "Pitch for the rate, power for the speed.",
            "L’assiette pour la vitesse verticale, la puissance pour la vitesse.",
          ),
          L(
            "Check every 1,000 ft: 3 NM per 1,000 ft still to lose.",
            "Vérifiez tous les 1 000 ft : 3 NM par 1 000 ft encore à perdre.",
          ),
          L(
            "Your top of descent is more than 25 NM out? Then you are already late: start down at once.",
            "Votre début de descente est à plus de 25 NM ? Vous êtes déjà en retard : descendez tout de suite.",
          ),
        ],
        options: ["wind", "turbulence"],
        defaultsOn: [],
        criteria: [
          {
            id: "c1",
            label: L("Pass ARD", "Passez ARD"),
            check: GOAL.passed("ARD"),
          },
          // the lateral standard while descending: course 090 to ARD within ¾ scale (FAA IR ACS, the ¾-scale rule)
          {
            id: "c2",
            label: L(
              "Course 090 to ARD within ¾ scale",
              "Route 090 vers ARD à moins de ¾ de pleine échelle",
            ),
            check: GOAL.acsLat(),
          },
        ],
        debrief: L(
          "Compare your altitude over ARD with the crossing altitude. High: you started late — every minute late at 600 ft/min is 600 ft still to lose. Low: you started early, or descended too fast.",
          "Comparez votre altitude à la verticale d’ARD avec l’altitude de passage. Haut : vous êtes parti tard — chaque minute de retard à 600 ft/min, ce sont 600 ft encore à perdre. Bas : vous êtes parti tôt, ou trop vite.",
        ),
        returnTo: "thisStep",
      },
    },
  );
  const steps: Step[] = [
    cover(),
    goals(),
    why(),
    // part 1 — the descent and the approach: teach, try on the instrument, check, compute, fly
    part1(),
    threeDegrees(),
    vsSlide(),
    check(),
    RATE_CALC,
    TOD_CALC,
    climbSlide(),
    CLIMB_CALC,
    vdpSlide(),
    VDP_CALC,
    VDP_FLY,
    // part 2 — track and turns
    part2(),
    sixty(),
    sixtyCdi(),
    SIXTY_CALC,
    SIXTY_TRY,
    turnSlide(),
    turnCheck(),
    BANK_CALC,
    leadSlide(),
    LEAD_CALC,
    ARC_FLY,
    // part 3 — altimeter and airspeed
    part3(),
    altimetrySlide(),
    ALT_TRY,
    coldSlide(),
    COLD_CALC,
    tasSlide(),
    TAS_CALC,
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
      id: MATHS_IFR_ID,
      title: L("Maths for IFR", "Les maths de l’IFR"),
      summary: L(
        "1 in 60, the 3° path, climb gradients, top of descent, the VDP, standard-rate bank, the altimeter and the cold, and TAS — on designed slides with live instruments, then generated problems, the LOC 27 and the DME arc flown, a timed drill, and the descent you computed, flown to ARD.",
        "1 sur 60, le plan à 3°, la pente de montée, le début de descente, le VDP, l’inclinaison au taux standard, l’altimètre et le froid, et la Vp — en diapos avec des instruments en direct, puis des problèmes générés, le LOC 27 et l’arc DME volés, une série chronométrée, et la descente calculée, volée jusqu’à ARD.",
      ),
      cockpit: "g1000",
      theme: "classroom",
      tags: ["maths", "ifr", "calculation"],
    },
    steps,
    mathsIfrScenes(),
  );
}
