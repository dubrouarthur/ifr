// Ground school — built-in sample "Maths for IFR" (23 steps), slides first: a cover, why it matters (a question
// straight away), the five rules on designed slides (each with a live diagram or instrument), a check and the
// takeaways; then the generated problems (new numbers on every attempt), a timed drill, the page to keep, and the
// simulator: compute a descent, then fly it. Laid out on the design-system archetypes (SPEC slides v2 §8,
// mathsSlides.ts): classroom theme, Inter, formulas in the formula style, sources on the footer line.
// Sources: FAA-H-8083-15 Instrument Flying Handbook (ch. 4 rate and radius of turn, ch. 6–7 standard-rate turns,
// ch. 9 navigation, ch. 10 IFR flight), FAA AIM 5-4-5 (VDP) and 7-3 (cold temperature), ICAO Doc 8168 Vol I (cold
// temperature correction), FAA-H-8083-25 PHAK ch. 8 (altimetry) and ch. 11 (density altitude).
import type { Course, InstrumentView, SimScene, Step } from "../types";
import {
  DIAGRAM,
  INST,
  L,
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

export const MATHS_IFR_ID = "sample-maths-ifr";

const TC: InstrumentView = { kind: "gauge", gauge: "tc" };
const VSI: InstrumentView = { kind: "gauge", gauge: "vsi" };
const ALT: InstrumentView = { kind: "gauge", gauge: "alt" };

export function mathsIfrScenes(): Record<string, SimScene> {
  return {
    "mi.turn": scene(
      "mi.turn",
      {
        pos: { fix: "ARD", radial: 240, distNm: 12 },
        altFt: 5000,
        hdg: 45,
        iasKt: 100,
        bank: 17,
        radios: { nav1: "ARD", obs1: 60, cdi: "NAV1" },
      },
      { label: "ARD R-240 · 12 NM · 5,000 ft · turning", cockpit: "steam" },
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
    "mi.cold": scene(
      "mi.cold",
      {
        pos: { runway: { icao: "PARD", id: "27" }, distNm: 6 },
        altFt: 2400,
        hdg: 270,
        iasKt: 100,
        radios: { nav1: "IPRD", obs1: 270, cdi: "NAV1", baro: 29.92 },
      },
      {
        label: "PARD 27 · 6 NM · 2,400 ft",
        cockpit: "steam",
        weather: { oatSeaLevelC: -20 },
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
          "The few rules an instrument pilot works out in the head — each one tried on a live diagram, then flown.",
          "Les quelques règles qu’un pilote IFR calcule de tête — chacune essayée sur un schéma vivant, puis volée.",
        ),
        meta: L(
          "23 steps · about 55 min · new numbers on every attempt",
          "23 étapes · environ 55 min · de nouveaux chiffres à chaque essai",
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
          "Five rules to carry: 1 in 60, 318 ft/NM, ground speed × 5, the VDP, TAS / 10 + 7 — and three altimeter corrections.",
          "Cinq règles à retenir : 1 sur 60, 318 ft/NM, vitesse sol × 5, le VDP, Vp / 10 + 7 — et trois corrections de l’altimètre.",
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
              "4,000 ft to lose × 3 NM per 1,000 ft = 12 NM (12.6 NM at 318 ft/NM). The next slides give you that rule, and four more.",
              "4 000 ft à perdre × 3 NM par 1 000 ft = 12 NM (12,6 NM à 318 ft/NM). Les diapos suivantes vous donnent cette règle, et quatre autres.",
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
            "FAA IFH ch. 9 · why 60: a radian is 57.3°, rounded for mental maths",
            "FAA IFH ch. 9 · pourquoi 60 : un radian vaut 57,3°, arrondi pour le calcul mental",
          ),
        ),
      ],
      { layout: "formula" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "error (°) = 60 × off ÷ distance",
          "écart (°) = 60 × écart ÷ distance",
        ),
        ruleOfThumb: L(
          "At 60 NM, 1 NM off is 1°. 4 NM off after 30 NM: 8° of error; 6° more to reach the fix 40 NM ahead; turn 14°.",
          "À 60 NM, 1 NM d’écart vaut 1°. 4 NM d’écart après 30 NM : 8° d’erreur ; 6° de plus pour rejoindre le repère 40 NM plus loin ; virez de 14°.",
        ),
        refs: [{ src: "FAA-IFH", ref: "ch. 9" }],
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

/** A8 with an instrument (mock 05) — the 3° path: the live profile, the VSI, the two numbers. */
function threeDegrees(): Step {
  return slideStep(
    "mi-3deg",
    L("The 3° path", "Le plan à 3°"),
    canvas(
      [
        ...head(
          L("Descent planning", "Plan de descente"),
          L(
            "The 3° path: 318 ft/NM, GS × 5",
            "Le plan à 3° : 318 ft/NM, Vs × 5",
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
          296,
          1104,
          576,
          {
            interactive: true,
            caption: L(
              "Drag the top of descent.",
              "Déplacez le début de descente.",
            ),
          },
        ),
        INST(
          VSI,
          L(
            "Vertical speed indicator: 600 ft/min down",
            "Variomètre : 600 ft/min en descente",
          ),
          1320,
          304,
          432,
          432,
          { scene: "mi.descent" },
        ),
        T(
          "formula",
          L(
            "{VS} ≈ 120 × 5 = !600! _ft/min_",
            "{Vz} ≈ 120 × 5 = !600! _ft/min_",
          ),
          1272,
          768,
          528,
          64,
          { align: "center", reveal: 1, group: "vs" },
        ),
        T(
          "small",
          L(
            "at 120 kt ground speed · exact 636",
            "à 120 kt de vitesse sol · exact 636",
          ),
          1272,
          840,
          528,
          40,
          { align: "center", reveal: 1, group: "vs" },
        ),
        rule(G.left, 888, 1680, { reveal: 2, group: "nm" }),
        T(
          "formula",
          L(
            "tan\u00a03° × 6,076\u00a0ft = !318 ft/NM!",
            "tan\u00a03° × 6 076\u00a0ft = !318 ft/NM!",
          ),
          G.left,
          904,
          816,
          64,
          { reveal: 2, group: "nm" },
        ),
        T(
          "formula",
          L("4,000\u00a0ft ÷ 318 ≈ !13 NM!", "4 000\u00a0ft ÷ 318 ≈ !13 NM!"),
          984,
          904,
          528,
          64,
          { reveal: 2, group: "nm" },
        ),
        T("small", L("or 4 × 3 = 12", "ou 4 × 3 = 12"), 1512, 916, 288, 40, {
          reveal: 2,
          group: "nm",
        }),
        foot(L("FAA IFH ch. 10", "FAA IFH ch. 10"), 960),
      ],
      { layout: "formula" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "VS (ft/min) = GS (kt) × gradient (ft/NM) ÷ 60",
          "Vz (ft/min) = Vs (kt) × pente (ft/NM) ÷ 60",
        ),
        ruleOfThumb: L(
          "3°: 318 ft/NM ≈ 300 ft/NM; VS ≈ GS × 5; distance ≈ 3 NM per 1,000 ft.",
          "3° : 318 ft/NM ≈ 300 ft/NM ; Vz ≈ Vs × 5 ; distance ≈ 3 NM par 1 000 ft.",
        ),
        refs: [{ src: "FAA-IFH", ref: "ch. 10" }],
      },
    ],
    { kind: "explain", minutes: 3 },
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

/** One rule-separated row of an instrument slide (A5 rows, no card): heading, then ≤ 2 lines of body. */
function noteRow(
  i: number,
  y: number,
  h: [string, string],
  b: [string, string],
  color?: "key" | "stop" | "sel" | "nav",
) {
  const g = `row${i}`;
  return [
    rule(1128, y, 672, { reveal: i, group: g }),
    T("heading", L(h[0], h[1]), 1128, y + 24, 672, 56, {
      reveal: i,
      group: g,
      ...(color ? { color } : {}),
    }),
    T("body", L(b[0], b[1]), 1128, y + 88, 672, 104, { reveal: i, group: g }),
  ];
}

/** A5 — standard-rate turn: the turn coordinator, live, and three rows. */
function turnSlide(): Step {
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
            "Turn coordinator: standard-rate turn to the right",
            "Indicateur de virage : virage au taux standard à droite",
          ),
          G.left,
          120,
          840,
          840,
          { scene: "mi.turn", mode: "live" },
        ),
        T("eyebrow", L("Turns", "Virages"), 1128, 120, 672, 32),
        T(
          "title",
          L("Bank for a standard-rate turn", "L’inclinaison au taux standard"),
          1128,
          160,
          672,
          176,
        ),
        ...noteRow(
          1,
          376,
          ["3° per second", "3° par seconde"],
          [
            "360° in **2 minutes**: the mark on the turn coordinator.",
            "360° en **2 minutes** : le repère de l’indicateur de virage.",
          ],
        ),
        ...noteRow(
          2,
          576,
          ["Bank ≈ TAS ÷ 10 + 7", "Inclinaison ≈ Vp ÷ 10 + 7"],
          [
            "At 100 kt: **17°** (exact: 15°). Fine-tune on the needle.",
            "À 100 kt : **17°** (exact : 15°). Affinez sur l’aiguille.",
          ],
          "sel",
        ),
        ...noteRow(
          3,
          776,
          ["Radius ≈ TAS ÷ 200", "Rayon ≈ Vp ÷ 200"],
          [
            "In NM: **half a mile** at 100 kt. Lead a 90° turn by that much.",
            "En NM : **un demi-mille** à 100 kt. Anticipez un virage de 90° d’autant.",
          ],
        ),
        foot(
          L(
            "FAA IFH ch. 4 and 6 · rate and radius of turn",
            "FAA IFH ch. 4 et 6 · taux et rayon de virage",
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
        formula: L(
          "tan φ = ω · V ÷ g;  r = V ÷ ω",
          "tan φ = ω · V ÷ g ;  r = V ÷ ω",
        ),
        ruleOfThumb: L(
          "Bank ≈ TAS/10 + 7 (15% of TAS is closer to exact); radius ≈ TAS/200 NM.",
          "Inclinaison ≈ Vp/10 + 7 (15 % de la Vp est plus proche de l’exact) ; rayon ≈ Vp/200 NM.",
        ),
        refs: [{ src: "FAA-IFH", ref: "ch. 4, ch. 6" }],
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

/** A5 — the altimeter in the cold, and the three corrections. */
function altimetrySlide(): Step {
  return slideStep(
    "mi-alt",
    L(
      "Altimetry: pressure, density, cold",
      "Altimétrie : pression, densité, froid",
    ),
    canvas(
      [
        INST(
          ALT,
          L(
            "Altimeter at 2,400 ft on a −20 °C day",
            "Altimètre à 2 400 ft par −20 °C",
          ),
          G.left,
          120,
          840,
          840,
          { scene: "mi.cold" },
        ),
        T("eyebrow", L("Altimetry", "Altimétrie"), 1128, 120, 672, 32),
        T(
          "title",
          L(
            "Three corrections to the altimeter",
            "Trois corrections de l’altimètre",
          ),
          1128,
          160,
          672,
          176,
        ),
        ...noteRow(
          1,
          376,
          ["Pressure altitude", "Altitude-pression"],
          [
            "Set 29.92 in: **1 inHg ≈ 1,000 ft** near sea level.",
            "Calez 1013 hPa : **1 hPa ≈ 27 ft** près du niveau de la mer.",
          ],
        ),
        ...noteRow(
          2,
          576,
          ["Density altitude", "Altitude-densité"],
          [
            "PA + **120 ft per °C** above ISA: a hot field flies high.",
            "Zp + **120 ft par °C** au-dessus d’ISA : un terrain chaud vole haut.",
          ],
          "key",
        ),
        ...noteRow(
          3,
          776,
          ["Cold temperature", "Grand froid"],
          [
            "**+4%** of the height per 10 °C below ISA: you are lower than shown.",
            "**+4 %** de la hauteur par 10 °C sous ISA : vous êtes plus bas qu’indiqué.",
          ],
          "stop",
        ),
        foot(
          L(
            "FAA PHAK ch. 8, 11 · ICAO Doc 8168 · AIM 7-3",
            "FAA PHAK ch. 8, 11 · OACI Doc 8168 · AIM 7-3",
          ),
          672,
          1128,
        ),
      ],
      { scene: "mi.cold", layout: "instrumentNotes" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "PA = elevation + (29.92 − altimeter) × 1,000; DA ≈ PA + 120 × (OAT − ISA)",
          "Zp = altitude + (29,92 − calage) × 1 000 ; Zd ≈ Zp + 120 × (T − ISA)",
        ),
        ruleOfThumb: L(
          "Cold: add about 4% of the height above the altimeter-setting source per 10 °C below ISA to the published heights (FAA AIM 7-3).",
          "Froid : ajoutez environ 4 % de la hauteur au-dessus de la source du calage par 10 °C sous ISA aux hauteurs publiées (FAA AIM 7-3).",
        ),
        refs: [
          { src: "FAA-PHAK", ref: "ch. 8" },
          { src: "ICAO Doc 8168", ref: "Vol I" },
          { src: "FAA-AIM", ref: "7-3" },
        ],
      },
    ],
    { kind: "explain", minutes: 3 },
  );
}

/** A9 — a quick check before the practice: tiles. */
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
        DIAGRAM(
          "mi-check.d",
          {
            kind: "calc",
            calc: {
              kind: "profile",
              fromFt: 4000,
              toFt: 1000,
              angleDeg: 3,
              gsKt: 90,
            },
          },
          L(
            "A 3° descent from 4,000 to 1,000 ft at 90 kt ground speed",
            "Une descente à 3° de 4 000 à 1 000 ft à 90 kt de vitesse sol",
          ),
          G.left,
          336,
          864,
          600,
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
                  "That is 90 × 3: the NM-per-1,000-ft rule, not the rate.",
                  "C’est 90 × 3 : la règle des NM par 1 000 ft, pas la vitesse verticale.",
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
          1080,
          336,
          720,
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

/** A10 — three numbers and three checks, before the practice. */
function recap(): Step {
  return slideStep(
    "mi-recap",
    L(
      "Three numbers before any descent",
      "Trois chiffres avant toute descente",
    ),
    canvas(
      [
        ...head(
          L("Keep in mind", "À retenir"),
          L(
            "Three numbers before any descent",
            "Trois chiffres avant toute descente",
          ),
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
              "Altitude to lose × 3 = distance",
              "Altitude à perdre × 3 = distance",
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
  L("The rules", "Les règles"),
  L("Compute", "Calculer"),
  L("Drill and fly", "Série et vol"),
];
function part2(): Step {
  return slideStep(
    "mi-part2",
    L("Now you compute", "À vous de calculer"),
    canvas(
      sectionBlocks({
        n: 2,
        of: 3,
        title: L("Now you compute", "À vous de calculer"),
        lead: L(
          "New numbers on every attempt, and the worked solution after each answer.",
          "De nouveaux chiffres à chaque essai, et la solution détaillée après chaque réponse.",
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
    "mi-part3",
    L(
      "Against the clock, then in the cockpit",
      "Contre la montre, puis au cockpit",
    ),
    canvas(
      sectionBlocks({
        n: 3,
        of: 3,
        title: L(
          "Against the clock, then in the cockpit",
          "Contre la montre, puis au cockpit",
        ),
        lead: L(
          "Ten problems, 45 seconds each. Then fly the descent you computed.",
          "Dix problèmes, 45 secondes chacun. Puis volez la descente calculée.",
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
      "120",
      "120",
      "ft of DA per °C above ISA",
      "ft de Zd par °C au-dessus d’ISA",
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
            "FAA IFH ch. 4–10 · FAA AIM 5-4-5 · FAA PHAK ch. 11",
            "FAA IFH ch. 4–10 · FAA AIM 5-4-5 · FAA PHAK ch. 11",
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
          "1:60 · 318 ft/NM · GS × 5 · 3 NM per 1,000 ft · TAS/10 + 7 · +2%/1,000 ft · VDP ÷ 300 · DA +120 ft/°C",
          "1:60 · 318 ft/NM · Vs × 5 · 3 NM par 1 000 ft · Vp/10 + 7 · +2 %/1 000 ft · VDP ÷ 300 · Zd +120 ft/°C",
        ),
      },
    ],
    { minutes: 1 },
  );
}

/** The Maths for IFR sample (23 steps): slides first, then the practice, the drill and the flight. */
export function mathsIfrCourse(): Course {
  const steps: Step[] = [
    // part 1 — the rules, on slides
    cover(),
    why(),
    sixty(),
    threeDegrees(),
    vdpSlide(),
    turnSlide(),
    altimetrySlide(),
    check(),
    recap(),
    // part 2 — compute
    part2(),
    step(
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
    ),

    step(
      "mi-rate-calc",
      "calc",
      L("Descent rate for the path", "Vitesse verticale pour le plan"),
      [],
      {
        minutes: 3,
        calc: { generatorId: "ifr.descentRate" },
      },
    ),

    step(
      "mi-tod-calc",
      "calc",
      L("Where do I start down?", "Où commencer la descente ?"),
      [],
      {
        minutes: 3,
        calc: { generatorId: "ifr.topOfDescent" },
      },
    ),

    step(
      "mi-tod-try",
      "try",
      L(
        "Try it: set the descent you computed",
        "À vous : affichez la descente calculée",
      ),
      [
        {
          t: "text",
          text: L(
            "Same numbers as the previous step. At the top of descent, lower the nose and set the power so the VSI shows the rate you computed. The stage holds the speed for you.",
            "Les mêmes chiffres qu’à l’étape précédente. Au début de descente, baissez le nez et réglez la puissance pour que le variomètre affiche la vitesse calculée. La scène tient la vitesse pour vous.",
          ),
        },
      ],
      { minutes: 3, calcLink: { step: "mi-tod-calc", use: "both" } },
    ),

    step("mi-vdp-calc", "calc", L("Find the VDP", "Trouver le VDP"), [], {
      minutes: 2,
      calc: { generatorId: "ifr.vdp" },
    }),

    step(
      "mi-bank-calc",
      "calc",
      L("Bank for standard rate", "Inclinaison au taux standard"),
      [],
      {
        minutes: 2,
        calc: { generatorId: "ifr.standardRateBank" },
      },
    ),

    step(
      "mi-lead-calc",
      "calc",
      L("Lead the turn onto a DME arc", "Anticiper le virage sur un arc DME"),
      [],
      {
        minutes: 3,
        calc: { generatorId: "ifr.dmeArcLead" },
      },
    ),

    step(
      "mi-cold-calc",
      "calc",
      L("Correct for the cold", "Corriger pour le froid"),
      [],
      {
        minutes: 3,
        calc: { generatorId: "ifr.coldTemperature" },
      },
    ),

    step(
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
    ),
    // part 3 — drill and fly
    part3(),
    step(
      "mi-drill",
      "drill",
      L("Drill: ten in a row", "Série : dix d’affilée"),
      [],
      {
        minutes: 8,
        drill: {
          generatorIds: [
            "ifr.sixtyToOne",
            "ifr.descentRate",
            "ifr.topOfDescent",
            "ifr.standardRateBank",
            "ifr.vdp",
            "ifr.tasFromIas",
            "ifr.timeSpeedDistance",
            "ifr.windComponents",
            "ifr.pressureAltitude",
          ],
          count: 10,
          timer: { mode: "perProblem", seconds: 45 },
          feedback: "each",
          practiceOnly: true,
        },
      },
    ),
    cheatSheet(),
    step(
      "mi-fly",
      "fly",
      L(
        "Fly it: compute the descent, then fly it",
        "À vous : calculez la descente, puis volez-la",
      ),
      [],
      {
        minutes: 6,
        flyIt: {
          target: { kind: "calc", step: "mi-tod-calc", durationS: 300 },
          brief: L(
            "The cockpit starts from the numbers you solved in “Where do I start down?”. Start down at your top of descent and hold the rate you computed.",
            "Le cockpit part des chiffres résolus dans « Où commencer la descente ? ». Commencez la descente à votre point calculé et tenez la vitesse verticale trouvée.",
          ),
          keys: [
            L(
              "Pitch for the rate, power for the speed.",
              "L’assiette pour la vitesse verticale, la puissance pour la vitesse.",
            ),
            L(
              "Check the distance every 1,000 ft: 3 NM per 1,000 ft.",
              "Vérifiez la distance tous les 1 000 ft : 3 NM par 1 000 ft.",
            ),
          ],
          options: ["wind", "turbulence"],
          defaultsOn: [],
          criteria: [],
          debrief: L(
            "If you arrived high, look at when you started down: every minute late at 600 ft/min is 600 ft still to lose.",
            "Si vous êtes arrivé haut, regardez quand vous avez commencé : chaque minute de retard à 600 ft/min, ce sont 600 ft encore à perdre.",
          ),
          returnTo: "thisStep",
        },
      },
    ),
  ];
  return course(
    {
      id: MATHS_IFR_ID,
      title: L("Maths for IFR", "Les maths de l’IFR"),
      summary: L(
        "1 in 60, the 3° path, top of descent, the VDP, standard-rate bank, the altimeter in the cold and TAS — on designed slides first, then generated problems, a timed drill, and the descent you computed, flown.",
        "1 sur 60, le plan à 3°, le début de descente, le VDP, l’inclinaison au taux standard, l’altimètre par grand froid et la Vp — d’abord en diapos, puis des problèmes générés, une série chronométrée, et la descente calculée, volée.",
      ),
      cockpit: "g1000",
      theme: "classroom",
      tags: ["maths", "ifr", "calculation"],
      minutes: 55,
    },
    steps,
    mathsIfrScenes(),
  );
}
