// Ground school — built-in sample "Maths for IFR" (18 steps): the mental arithmetic of instrument flying, each
// rule taught on a designed slide with a live diagram or instrument, practised with generated problems (new
// numbers on every attempt), then used in the simulator: compute a descent, then fly it.
// Sources: FAA-H-8083-15 Instrument Flying Handbook (ch. 9 navigation, ch. 10 IFR flight), FAA AIM 5-4-5 (VDP)
// and 7-3 (cold temperature), ICAO Doc 8168 Vol I (cold temperature correction), FAA-H-8083-25 PHAK ch. 4 / 11.
import type { Course, InstrumentView, SimScene, Step } from "../types";
import {
  DIAGRAM,
  INST,
  L,
  M,
  MARK,
  SHAPE,
  T,
  canvas,
  course,
  scene,
  slideStep,
  step,
} from "./kit";

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

/** A number card: big figure, one-line meaning, a source. */
function card(
  x: number,
  y: number,
  w: number,
  n: [string, string],
  c: [string, string],
  src: string,
  reveal?: number,
) {
  const r = reveal ? { reveal } : {};
  return [
    SHAPE("roundRect", x, y, w, 312, {
      fill: "surface",
      stroke: "line",
      strokeW: 2,
      ...(reveal ? { reveal: { order: reveal } } : {}),
    }),
    T("number", L(n[0], n[1]), x + 36, y + 24, w - 72, 144, r),
    T("body", L(c[0], c[1]), x + 36, y + 168, w - 72, 96, r),
    T("caption", L(src, src), x + 36, y + 256, w - 72, 40, {
      ...r,
      color: "muted",
    }),
  ];
}

function cover(): Step {
  return slideStep(
    "mi-cover",
    L("Maths for IFR", "Les maths de l’IFR"),
    canvas([
      T(
        "label",
        L("Ground school · Mental arithmetic", "Théorie · Calcul mental"),
        M.x,
        168,
        816,
        48,
      ),
      SHAPE("rect", M.x, 240, 96, 8, { fill: "accent", stroke: null }),
      T(
        "display",
        L("Maths for IFR", "Les maths de l’IFR"),
        M.x,
        264,
        816,
        336,
        { valign: "bottom" },
      ),
      T(
        "subtitle",
        L(
          "The few numbers an instrument pilot works out in the head — each one tried on a live instrument, then flown",
          "Les quelques chiffres qu’un pilote IFR calcule de tête — chacun essayé sur un instrument réel, puis volé",
        ),
        M.x,
        624,
        768,
        216,
      ),
      T(
        "caption",
        L(
          "18 steps · about 45 min · new numbers on every attempt",
          "18 étapes · environ 45 min · de nouveaux chiffres à chaque essai",
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
        ["1 : 60", "1 : 60"],
        ["1° ≈ 1 NM at 60 NM", "1° ≈ 1 NM à 60 NM"],
        "FAA IFH ch. 9",
      ),
      ...card(
        1440,
        168,
        384,
        ["318", "318"],
        ["ft/NM on a 3° path", "ft/NM sur un plan à 3°"],
        "FAA IFH ch. 10",
      ),
      ...card(
        1008,
        528,
        384,
        ["GS × 5", "Vs × 5"],
        ["ft/min on a 3° path", "ft/min sur un plan à 3°"],
        "FAA IFH ch. 10",
      ),
      ...card(
        1440,
        528,
        384,
        ["TAS/10+7", "Vp/10+7"],
        [
          "bank for a standard-rate turn",
          "inclinaison du virage au taux standard",
        ],
        "FAA IFH ch. 7",
      ),
    ]),
    [
      {
        t: "text",
        text: L(
          "Four numbers to carry: 1 in 60, 318 ft/NM, ground speed × 5, TAS / 10 + 7.",
          "Quatre chiffres à retenir : 1 sur 60, 318 ft/NM, vitesse sol × 5, Vp / 10 + 7.",
        ),
      },
    ],
  );
}

function sixty(): Step {
  return slideStep(
    "mi-60",
    L("The 1-in-60 rule", "La règle du 1 sur 60"),
    canvas([
      T(
        "label",
        L("Track error · FAA IFH ch. 9", "Erreur de route · FAA IFH ch. 9"),
        M.x,
        96,
        960,
        48,
      ),
      T(
        "title",
        L("The 1-in-60 rule", "La règle du 1 sur 60"),
        M.x,
        144,
        1728,
        108,
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
        M.x,
        288,
        1008,
        672,
        {
          interactive: true,
          caption: L(
            "Drag the aircraft: the angles follow.",
            "Déplacez l’avion : les angles suivent.",
          ),
        },
      ),
      T("number", L("1° ≈ 1 NM", "1° ≈ 1 NM"), 1200, 288, 624, 144),
      T(
        "caption",
        L("at 60 NM from the fix", "à 60 NM du repère"),
        1200,
        432,
        624,
        48,
      ),
      T(
        "mono",
        L(
          "error (°) = 60 × off (NM) ÷ distance (NM)",
          "écart (°) = 60 × écart (NM) ÷ distance (NM)",
        ),
        1200,
        504,
        624,
        96,
      ),
      T(
        "body",
        L(
          "4 NM off after 30 NM: **8°** of track error. To reach the fix 40 NM ahead, add 60 × 4 ÷ 40 = **6°**: turn **14°** towards the course.",
          "4 NM d’écart après 30 NM : **8°** d’erreur de route. Pour rejoindre le repère 40 NM plus loin, ajoutez 60 × 4 ÷ 40 = **6°** : corrigez de **14°** vers la route.",
        ),
        1200,
        624,
        624,
        264,
        { reveal: 1 },
      ),
      T(
        "caption",
        L(
          "Why 60: one radian is 57.3°, rounded for mental arithmetic.",
          "Pourquoi 60 : un radian vaut 57,3°, arrondi pour le calcul mental.",
        ),
        1200,
        912,
        624,
        72,
      ),
    ]),
    [
      {
        t: "formula",
        formula: L(
          "error (°) = 60 × off ÷ distance",
          "écart (°) = 60 × écart ÷ distance",
        ),
        ruleOfThumb: L(
          "At 60 NM, 1 NM off is 1°.",
          "À 60 NM, 1 NM d’écart vaut 1°.",
        ),
        refs: [{ src: "FAA-IFH", ref: "ch. 9" }],
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

function threeDegrees(): Step {
  return slideStep(
    "mi-3deg",
    L("The 3° path", "Le plan à 3°"),
    canvas([
      T(
        "label",
        L(
          "Descent planning · FAA IFH ch. 10",
          "Plan de descente · FAA IFH ch. 10",
        ),
        M.x,
        96,
        960,
        48,
      ),
      T(
        "title",
        L("The 3° path: 318 ft/NM, GS × 5", "Le plan à 3° : 318 ft/NM, Vs × 5"),
        M.x,
        144,
        1728,
        108,
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
        M.x,
        288,
        1104,
        552,
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
        M.x + 1176,
        288,
        456,
        456,
        {
          scene: "mi.descent",
        },
      ),
      T(
        "mono",
        L("tan 3° × 6,076 ft = 318 ft/NM", "tan 3° × 6 076 ft = 318 ft/NM"),
        M.x,
        864,
        1104,
        72,
      ),
      T(
        "body",
        L(
          "**4,000 ft to lose** ÷ 318 ≈ **13 NM** (or 4 × 3 = 12 NM). At **120 kt**, VS ≈ 120 × 5 = **600 ft/min** (exact 636).",
          "**4 000 ft à perdre** ÷ 318 ≈ **13 NM** (ou 4 × 3 = 12 NM). À **120 kt**, Vz ≈ 120 × 5 = **600 ft/min** (exact 636).",
        ),
        M.x + 1176,
        768,
        552,
        216,
        { reveal: 1 },
      ),
    ]),
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

function turnSlide(): Step {
  return slideStep(
    "mi-turn",
    L(
      "Bank for a standard-rate turn",
      "L’inclinaison du virage au taux standard",
    ),
    canvas(
      [
        T(
          "label",
          L("Turns · FAA IFH ch. 7", "Virages · FAA IFH ch. 7"),
          M.x,
          96,
          960,
          48,
        ),
        T(
          "title",
          L("Bank for a standard-rate turn", "L’inclinaison au taux standard"),
          M.x,
          144,
          1728,
          108,
        ),
        INST(
          TC,
          L(
            "Turn coordinator: standard-rate turn to the right",
            "Indicateur de virage : virage au taux standard à droite",
          ),
          M.x,
          288,
          672,
          672,
          {
            scene: "mi.turn",
            mode: "live",
          },
        ),
        T("number", L("TAS/10 + 7", "Vp/10 + 7"), 864, 288, 960, 144),
        T(
          "body",
          L(
            "Standard rate is **3° per second**: 360° in 2 minutes, the mark on the turn coordinator. At **100 KTAS**: 100 ÷ 10 + 7 = **17°** of bank.",
            "Le taux standard vaut **3° par seconde** : 360° en 2 minutes, le repère de l’indicateur de virage. À **100 kt de Vp** : 100 ÷ 10 + 7 = **17°** d’inclinaison.",
          ),
          864,
          456,
          960,
          192,
        ),
        MARK(1, 896, 704, { size: 56, reveal: 1, group: "x" }),
        T(
          "body",
          L(
            "Exact: **tan φ = ω · V ÷ g** gives 15° at 100 kt. The rule errs on the steep side at low speed: check the needle.",
            "Exact : **tan φ = ω · V ÷ g** donne 15° à 100 kt. La règle surestime un peu aux basses vitesses : vérifiez l’aiguille.",
          ),
          944,
          680,
          880,
          144,
          { reveal: 1, group: "x" },
        ),
        MARK(2, 896, 872, { size: 56, reveal: 2, group: "y" }),
        T(
          "body",
          L(
            "Radius at standard rate ≈ **TAS ÷ 200 NM**: half a mile at 100 kt.",
            "Rayon au taux standard ≈ **Vp ÷ 200 NM** : un demi-mille à 100 kt.",
          ),
          944,
          848,
          880,
          120,
          { reveal: 2, group: "y" },
        ),
      ],
      { scene: "mi.turn" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "tan φ = ω · V ÷ g;  r = V ÷ ω",
          "tan φ = ω · V ÷ g ;  r = V ÷ ω",
        ),
        ruleOfThumb: L(
          "Bank ≈ TAS/10 + 7; radius ≈ TAS/200 NM.",
          "Inclinaison ≈ Vp/10 + 7 ; rayon ≈ Vp/200 NM.",
        ),
        refs: [{ src: "FAA-IFH", ref: "ch. 7" }],
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

function vdpSlide(): Step {
  const mda = 1000;
  const tdze = 420;
  const vdp = Math.round(((mda - tdze) / 300) * 10) / 10;
  return slideStep(
    "mi-vdp",
    L("The visual descent point", "Le point de descente à vue (VDP)"),
    canvas([
      T(
        "label",
        L(
          "Non-precision approach · FAA AIM 5-4-5",
          "Approche classique · FAA AIM 5-4-5",
        ),
        M.x,
        96,
        960,
        48,
      ),
      T(
        "title",
        L("Where to leave the MDA", "Où quitter la MDA"),
        M.x,
        144,
        1728,
        108,
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
          `Segment final : MDA ${mda} ft, TDZE ${tdze} ft, VDP ${vdp} NM`,
        ),
        M.x,
        288,
        1104,
        600,
        {
          interactive: true,
          caption: L(
            "Drag the MDA: the VDP moves.",
            "Déplacez la MDA : le VDP se déplace.",
          ),
        },
      ),
      T(
        "mono",
        L("VDP (NM) = (MDA − TDZE) ÷ 300", "VDP (NM) = (MDA − TDZE) ÷ 300"),
        1296,
        288,
        528,
        96,
      ),
      T(
        "body",
        L(
          `MDA ${mda} ft, touchdown zone ${tdze} ft: ${mda - tdze} ÷ 300 ≈ **${vdp} NM** from the threshold.`,
          `MDA ${mda} ft, zone de toucher ${tdze} ft : ${mda - tdze} ÷ 300 ≈ **${vdp} NM** du seuil.`,
        ),
        1296,
        408,
        528,
        192,
      ),
      T(
        "body",
        L(
          "Leave the MDA at the VDP with the runway in sight and you are on a normal 3° descent. Leave it earlier and you are low over obstacles; later and you dive.",
          "Quittez la MDA au VDP piste en vue et vous êtes sur une descente normale à 3°. Plus tôt, vous êtes bas au-dessus des obstacles ; plus tard, vous plongez.",
        ),
        1296,
        624,
        528,
        288,
        { reveal: 1 },
      ),
    ]),
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

function altimetrySlide(): Step {
  return slideStep(
    "mi-alt",
    L(
      "Altimetry: pressure, density, cold",
      "Altimétrie : pression, densité, froid",
    ),
    canvas(
      [
        T(
          "label",
          L(
            "Altimetry · FAA PHAK ch. 8 · ICAO Doc 8168",
            "Altimétrie · FAA PHAK ch. 8 · OACI Doc 8168",
          ),
          M.x,
          96,
          1200,
          48,
        ),
        T(
          "title",
          L(
            "Three corrections to the altimeter",
            "Trois corrections de l’altimètre",
          ),
          M.x,
          144,
          1728,
          108,
        ),
        INST(
          ALT,
          L("Altimeter at 2,400 ft", "Altimètre à 2 400 ft"),
          M.x,
          288,
          576,
          576,
          { scene: "mi.cold" },
        ),
        ...card(
          768,
          288,
          336,
          ["PA", "Zp"],
          [
            "elevation + (29.92 − altimeter) × 1,000",
            "altitude + (29,92 − calage) × 1 000",
          ],
          "FAA PHAK ch. 8",
        ),
        ...card(
          1128,
          288,
          336,
          ["DA", "Zd"],
          ["PA + 120 × (OAT − ISA)", "Zp + 120 × (T − ISA)"],
          "FAA PHAK ch. 11",
          1,
        ),
        ...card(
          1488,
          288,
          336,
          ["+4 %", "+4 %"],
          [
            "of the height above the station, per 10 °C below ISA",
            "de la hauteur au-dessus de la station, par 10 °C sous ISA",
          ],
          "ICAO Doc 8168",
          2,
        ),
        T(
          "body",
          L(
            "In very cold air the altimeter **over-reads**: you are lower than it shows. Add the correction to the published heights above the station (FAA AIM 7-3).",
            "Par grand froid l’altimètre **surestime** : vous êtes plus bas qu’il n’indique. Ajoutez la correction aux hauteurs publiées au-dessus de la station (FAA AIM 7-3).",
          ),
          768,
          648,
          1056,
          216,
          { reveal: 3 },
        ),
        T(
          "caption",
          L(
            "1 inHg ≈ 1,000 ft; 1 hPa ≈ 27 ft near sea level (30 ft is the round figure).",
            "1 inHg ≈ 1 000 ft ; 1 hPa ≈ 27 ft près du niveau de la mer (30 ft en chiffre rond).",
          ),
          768,
          888,
          1056,
          72,
        ),
      ],
      { scene: "mi.cold" },
    ),
    [
      {
        t: "formula",
        formula: L(
          "PA = elevation + (29.92 − altimeter) × 1,000; DA ≈ PA + 120 × (OAT − ISA)",
          "Zp = altitude + (29,92 − calage) × 1 000 ; Zd ≈ Zp + 120 × (T − ISA)",
        ),
        ruleOfThumb: L(
          "Cold: about 4% of the height above the station per 10 °C below ISA.",
          "Froid : environ 4 % de la hauteur au-dessus de la station par 10 °C sous ISA.",
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

function cheatSheet(): Step {
  const rows: [string, string, string, string][] = [
    ["1 : 60", "1 : 60", "1° ≈ 1 NM at 60 NM", "1° ≈ 1 NM à 60 NM"],
    ["318", "318", "ft/NM on 3° (≈ 300)", "ft/NM à 3° (≈ 300)"],
    ["GS × 5", "Vs × 5", "ft/min on 3°", "ft/min à 3°"],
    ["× 3", "× 3", "NM per 1,000 ft to lose", "NM par 1 000 ft à perdre"],
    [
      "TAS/10 + 7",
      "Vp/10 + 7",
      "bank, standard rate",
      "inclinaison, taux standard",
    ],
    ["+2 %", "+2 %", "TAS over IAS per 1,000 ft", "Vp sur Vi par 1 000 ft"],
    ["÷ 300", "÷ 300", "(MDA − TDZE) → VDP in NM", "(MDA − TDZE) → VDP en NM"],
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
    canvas([
      T("label", L("Rules of thumb", "Règles pratiques"), M.x, 96, 960, 48),
      T("title", L("Keep this page", "Gardez cette page"), M.x, 144, 1728, 108),
      ...rows.flatMap(([n, nf, c, cf], i) => {
        const x = M.x + (i % 4) * 438;
        const y = 288 + Math.floor(i / 4) * 348;
        return [
          SHAPE("roundRect", x, y, 414, 312, {
            fill: "surface",
            stroke: "line",
            strokeW: 2,
          }),
          T("number", L(n, nf), x + 32, y + 32, 350, 132),
          T("body", L(c, cf), x + 32, y + 176, 350, 108),
        ];
      }),
    ]),
    [
      {
        t: "keys",
        items: rows.map(([n, nf, c, cf]) => L(`${n}: ${c}`, `${nf} : ${cf}`)),
      },
      {
        t: "takeaway",
        text: L(
          "1:60 · 318 ft/NM · GS × 5 · 3 NM per 1,000 ft · TAS/10 + 7 · +2 %/1,000 ft · VDP ÷ 300 · DA +120 ft/°C",
          "1:60 · 318 ft/NM · Vs × 5 · 3 NM par 1 000 ft · Vp/10 + 7 · +2 %/1 000 ft · VDP ÷ 300 · Zd +120 ft/°C",
        ),
      },
    ],
    { minutes: 1 },
  );
}

/** The Maths for IFR sample (18 steps). */
export function mathsIfrCourse(): Course {
  const steps: Step[] = [
    cover(),
    sixty(),
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
      "mi-lead-calc",
      "calc",
      L("Lead the turn onto a DME arc", "Anticiper le virage sur un arc DME"),
      [],
      {
        minutes: 3,
        calc: { generatorId: "ifr.dmeArcLead" },
      },
    ),
    threeDegrees(),
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
    turnSlide(),
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
    vdpSlide(),
    step("mi-vdp-calc", "calc", L("Find the VDP", "Trouver le VDP"), [], {
      minutes: 2,
      calc: { generatorId: "ifr.vdp" },
    }),
    altimetrySlide(),
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
        "1 in 60, the 3° path, top of descent, standard-rate bank, VDP, cold-temperature and TAS — generated problems, a timed drill, then fly the descent you computed.",
        "1 sur 60, le plan à 3°, le début de descente, l’inclinaison au taux standard, le VDP, le froid et la Vp — des problèmes générés, une série chronométrée, puis volez la descente calculée.",
      ),
      cockpit: "g1000",
      theme: "classroom",
      tags: ["maths", "ifr", "calculation"],
      minutes: 45,
    },
    steps,
    mathsIfrScenes(),
  );
}
