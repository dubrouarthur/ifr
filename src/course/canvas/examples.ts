// Ground school — designed slides: eight example slides (package N). They show what the canvas can do with real
// content (live instruments posed from scenes, the shipped diagrams, live readouts in the text, reveals, a Your
// turn) and serve as starters in the builder and the gallery. Rules taught cite their source; hold entries come
// from holdEntry() (nav/holding.ts, AIM FIG 5-3-8), never from a local table.
import { BRAND } from "../../brand";
import type {
  Course,
  L10n,
  SimScene,
  SlideCanvas,
  Step,
  ThemeId,
  SchoolBrand,
} from "../types";
import { sceneFromFields } from "../scene";
import { holdEntry } from "../../nav/holding";
import { STEAM_GAUGE_LAYOUT, type SteamGaugeKind } from "../../avionics/steam";
import { DEFAULT_GRID } from "./geom";
import {
  ARROW,
  CALLOUT,
  INST,
  L,
  M,
  MARK,
  SHAPE,
  T,
  onInstrument,
} from "./layouts";

export interface ExampleSlide {
  id: string;
  title: L10n;
  slide: SlideCanvas;
}

/** The scenes the examples use (Course.scenes). */
export function exampleScenes(): Record<string, SimScene> {
  return {
    "ex.vor": sceneFromFields(
      {
        kind: "fields",
        pos: { fix: "ARD", radial: 276, distNm: 6 },
        altFt: 4000,
        hdg: 120,
        iasKt: 100,
        radios: { nav1: "ARD", obs1: 90, cdi: "NAV1", brg1: "NAV1" },
      },
      {
        id: "ex.vor",
        cockpit: "steam",
        label: "ARD R-276 · 6 NM · 4,000 ft",
        weather: { windDir: 250, windKt: 10 },
      },
    ),
    "ex.turn": sceneFromFields(
      {
        kind: "fields",
        pos: { fix: "ARD", radial: 240, distNm: 12 },
        altFt: 5000,
        hdg: 45,
        iasKt: 105,
        bank: 15,
        radios: { nav1: "ARD", obs1: 60, cdi: "NAV1" },
      },
      {
        id: "ex.turn",
        cockpit: "steam",
        label: "ARD R-240 · 12 NM · 5,000 ft · turning",
        weather: { windDir: 270, windKt: 15 },
      },
    ),
    "ex.ils": sceneFromFields(
      {
        kind: "fields",
        pos: { runway: { icao: "PARD", id: "27" }, distNm: 5 },
        altFt: 2010,
        hdg: 270,
        iasKt: 90,
        vsFpm: -480,
        radios: { nav1: "IPRD", obs1: 270, cdi: "NAV1", minimums: 620 },
      },
      {
        id: "ex.ils",
        cockpit: "g1000",
        label: "ILS 27 PARD · 5.0 NM · 2,010 ft",
        weather: { windDir: 300, windKt: 12 },
      },
    ),
  };
}

const SIX = { kind: "six" } as const;
/** Top-left shoulder of a six-pack gauge, on the slide (for a numbered marker). */
function gaugeMark(
  g: SteamGaugeKind,
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number] {
  const G = STEAM_GAUGE_LAYOUT[g];
  return onInstrument(SIX, x, y, w, h, [G.cx - G.r * 0.8, G.cy - G.r * 0.8]);
}
const canvas = (
  blocks: SlideCanvas["blocks"],
  o: Partial<SlideCanvas> = {},
): SlideCanvas => ({
  size: { w: 1920, h: 1080 },
  grid: DEFAULT_GRID,
  layout: "blank",
  blocks,
  ...o,
});

// ------------------------------------------------------------------ 1. the six-pack
function sixPack(): ExampleSlide {
  const [x, y, w, h] = [96, 264, 984, 738];
  const gauges: SteamGaugeKind[] = ["asi", "ai", "alt", "tc", "hsi", "vsi"];
  return {
    id: "ex-six-pack",
    title: L("The six-pack", "Les six instruments de base"),
    slide: canvas(
      [
        T(
          "label",
          L(
            "Flight instruments · FAA IFH ch. 5",
            "Instruments de vol · FAA IFH ch. 5",
          ),
          M.x,
          96,
          960,
          48,
        ),
        T(
          "title",
          L("The six-pack", "Les six instruments de base"),
          M.x,
          144,
          1056,
          108,
        ),
        INST(
          SIX,
          L(
            "The six basic flight instruments",
            "Les six instruments de vol de base",
          ),
          x,
          y,
          w,
          h,
          { scene: "ex.turn", readOrder: 3, group: "six" },
        ),
        ...gauges.map((g, i) => {
          const [mx, my] = gaugeMark(g, x, y, w, h);
          return MARK(i + 1, mx, my, { size: 60, reveal: i < 3 ? 1 : 2, group: "six" });
        }),
        T(
          "body",
          L(
            "1. **Airspeed**: pitot and static\n2. **Attitude**: vacuum gyro\n3. **Altimeter**: static\n4. **Turn coordinator**: electric gyro\n5. **Heading (HSI)**: vacuum gyro\n6. **Vertical speed**: static",
            "1. **Anémomètre** : pitot et statique\n2. **Horizon** : gyroscope à dépression\n3. **Altimètre** : statique\n4. **Indicateur de virage** : gyroscope électrique\n5. **Cap (HSI)** : gyroscope à dépression\n6. **Variomètre** : statique",
          ),
          1176,
          264,
          648,
          432,
        ),
        CALLOUT(
          undefined,
          L(
            "Two sources of failure, two groups: a blocked static port freezes the altimeter and VSI (**3, 6**) and the airspeed (**1**) reads wrong, low climbing and high descending; a vacuum failure takes **2 and 5**.",
            "Deux sources de panne, deux groupes : une prise statique bouchée fige l’altimètre et le variomètre (**3, 6**) et fausse l’anémomètre (**1**), trop faible en montée, trop fort en descente ; une panne de dépression emporte **2 et 5**.",
          ),
          1176,
          720,
          648,
          288,
          { tone: "accent", reveal: 3 },
        ),
      ],
      { scene: "ex.turn" },
    ),
  };
}

// ------------------------------------------------------------------ 2. reading the HSI (live readouts in the text)
function readingHsi(): ExampleSlide {
  const [x, y, s] = [96, 120, 840];
  const view = { kind: "gauge", gauge: "hsi" } as const;
  const G = STEAM_GAUGE_LAYOUT.hsi;
  const at = (dx: number, dy: number) =>
    onInstrument(view, x, y, s, s, [G.cx + dx * G.r, G.cy + dy * G.r]);
  const rows: [
    string,
    string,
    string,
    string,
    "obs1" | "cdiDots" | "toFrom",
  ][] = [
    [
      "Course pointer",
      "Aiguille de route",
      "Set with the OBS: {{value}}",
      "Affichée à l’OBS : {{value}}",
      "obs1",
    ],
    [
      "CDI bar",
      "Barre CDI",
      "Where that course is — fly towards it: {{value}}",
      "Où se trouve cette route — volez vers elle : {{value}}",
      "cdiDots",
    ],
    [
      "TO / FROM",
      "TO / FROM",
      "Does the selected course lead to ARD or away from it: {{value}}",
      "La route affichée mène-t-elle vers ARD ou s’en éloigne-t-elle : {{value}}",
      "toFrom",
    ],
  ];
  const marks = [at(-0.36, -0.64), at(0.22, -0.02), at(-0.1, -0.34)];
  return {
    id: "ex-reading-hsi",
    title: L("Reading the HSI", "Lire le HSI"),
    slide: canvas(
      [
        INST(
          view,
          L("HSI: course 090, heading 120", "HSI : route 090, cap 120"),
          x,
          y,
          s,
          s,
          { scene: "ex.vor", readOrder: 9, group: "hsi" },
        ),
        T(
          "label",
          L("Navigation · FAA IFH ch. 9", "Navigation · FAA IFH ch. 9"),
          1032,
          120,
          792,
          48,
        ),
        T("title", L("Reading the HSI", "Lire le HSI"), 1032, 168, 792, 108),
        T(
          "caption",
          L(
            "6 NM west of ARD, heading 120, OBS 090. The values below are read live from the instrument.",
            "À 6 NM à l’ouest d’ARD, cap 120, OBS 090. Les valeurs ci-dessous sont lues en direct sur l’instrument.",
          ),
          1032,
          288,
          792,
          96,
        ),
        ...rows.flatMap(([he, hf, be, bf, ro], i) => {
          const yy = 432 + i * 168;
          return [
            MARK(i + 1, 1068, yy + 32, {
              size: 64,
              reveal: i + 1,
              group: `r${i}`,
            }),
            T("heading", L(he, hf), 1128, yy, 696, 60, {
              reveal: i + 1,
              group: `r${i}`,
            }),
            T("body", L(be, bf), 1128, yy + 60, 696, 96, {
              reveal: i + 1,
              group: `r${i}`,
              bind: { k: "readout", readout: ro },
            }),
          ];
        }),
        ...marks.map(([mx, my], i) =>
          MARK(i + 1, mx, my, { size: 56, reveal: i + 1, group: "hsi" }),
        ),
      ],
      { scene: "ex.vor" },
    ),
  };
}

// ------------------------------------------------------------------ 3. hold entries (AIM FIG 5-3-8 via holdEntry())
function holdEntries(): ExampleSlide {
  const inbound = 90;
  const arrive = 240;
  const entry = holdEntry(inbound, "R", arrive);
  const name: Record<string, [string, string]> = {
    DIRECT: ["direct", "directe"],
    TEARDROP: ["teardrop", "décalée (goutte d’eau)"],
    PARALLEL: ["parallel", "parallèle"],
  };
  const rows: [string, string, string, string][] = [
    [
      "Direct · 180°",
      "Directe · 180°",
      "Cross the fix and turn in the direction of the hold, outbound.",
      "Passez le repère et virez dans le sens de l’attente, en éloignement.",
    ],
    [
      "Teardrop · 70°",
      "Décalée (goutte d’eau) · 70°",
      "Cross the fix, fly 30° off the outbound course on the holding side for 1 min, turn inbound.",
      "Passez le repère, éloignez-vous à 30° de l’axe côté attente pendant 1 min, virez en rapprochement.",
    ],
    [
      "Parallel · 110°",
      "Parallèle · 110°",
      "Cross the fix, fly outbound parallel on the non-holding side for 1 min, turn back through more than 180°.",
      "Passez le repère, éloignez-vous en parallèle côté non-attente 1 min, revenez par un virage de plus de 180°.",
    ],
  ];
  return {
    id: "ex-hold-entries",
    title: L("Hold entries", "Entrées en attente"),
    slide: canvas(
      [
        T(
          "label",
          L("Holding · FAA AIM 5-3-8", "Attente · FAA AIM 5-3-8"),
          M.x,
          96,
          960,
          48,
        ),
        T(
          "title",
          L("Three ways into a hold", "Trois façons d’entrer en attente"),
          M.x,
          144,
          1728,
          108,
        ),
        {
          id: "hold",
          frame: { x: M.x, y: 288, w: 768, h: 648, z: 1 },
          kind: "diagram",
          d: { kind: "hold", inbound, turn: "R", fix: "ARD", crs: arrive },
          alt: L(
            "Hold at ARD, inbound 090, right turns, with the entry sectors",
            "Attente à ARD, rapprochement 090, virages à droite, avec les secteurs d’entrée",
          ),
          caption: L(
            `Inbound ${inbound}°, right turns, arriving on course ${arrive}°: ${name[entry][0]} entry.`,
            `Rapprochement ${inbound}°, virages à droite, arrivée au ${arrive}° : entrée ${name[entry][1]}.`,
          ),
        },
        ...rows.flatMap(([he, hf, be, bf], i) => {
          const yy = 288 + i * 180;
          return [
            MARK(i + 1, 1008 + 32, yy + 32, {
              size: 64,
              reveal: i + 1,
              group: `h${i}`,
              color: i === 0 ? "green" : i === 1 ? "accent" : "magenta",
            }),
            T("heading", L(he, hf), 1080, yy, 744, 60, {
              reveal: i + 1,
              group: `h${i}`,
            }),
            T("body", L(be, bf), 1080, yy + 60, 744, 108, {
              reveal: i + 1,
              group: `h${i}`,
            }),
          ];
        }),
        CALLOUT(
          undefined,
          L(
            "Within 5° of a sector boundary, either entry is acceptable (ICAO PANS-OPS, Doc 8168).",
            "À 5° près d’une limite de secteur, les deux entrées sont acceptables (OACI PANS-OPS, Doc 8168).",
          ),
          1008,
          840,
          816,
          120,
          { tone: "warn", reveal: 4 },
        ),
      ],
      { theme: "classroom" },
    ),
  };
}

// ------------------------------------------------------------------ 4. ILS minimums
function ilsMinimums(): ExampleSlide {
  return {
    id: "ex-ils-minimums",
    title: L("ILS minimums", "Minima ILS"),
    slide: canvas(
      [
        T(
          "label",
          L(
            "Approach · 14 CFR 91.175 · EASA CAT.OP.MPA.110",
            "Approche · 14 CFR 91.175 · EASA CAT.OP.MPA.110",
          ),
          M.x,
          96,
          1440,
          48,
        ),
        T(
          "title",
          L("ILS minimums: decide at DA", "Minima ILS : décider à la DA"),
          M.x,
          144,
          1728,
          108,
        ),
        INST(
          { kind: "pfd" },
          L(
            "PFD on the ILS 27 at Port Ardent, 5 NM out",
            "PFD sur l’ILS 27 de Port Ardent, à 5 NM",
          ),
          M.x,
          288,
          984,
          738,
          { scene: "ex.ils" },
        ),
        T("label", L("CAT I", "CAT I"), 1176, 288, 648, 48),
        T("number", L("200 ft", "200 ft"), 1176, 336, 648, 168),
        T(
          "caption",
          L(
            "Decision height above the touchdown zone",
            "Hauteur de décision au-dessus de la zone de toucher",
          ),
          1176,
          504,
          648,
          72,
        ),
        T(
          "body",
          L(
            "- **At DA**: the required visual references in sight, or go around\n- **FAA**: RVR 2,400 ft, or 1,800 ft with touchdown-zone and centreline lights\n- **EASA**: RVR at least 550 m",
            "- **À la DA** : références visuelles requises en vue, sinon remise de gaz\n- **FAA** : RVR 2 400 ft, ou 1 800 ft avec feux de TDZ et d’axe\n- **EASA** : RVR d’au moins 550 m",
          ),
          1176,
          600,
          648,
          336,
          { reveal: 1 },
        ),
      ],
      { theme: "projector", scene: "ex.ils" },
    ),
  };
}

// ------------------------------------------------------------------ 5. the 60:1 rule (interactive diagram)
function sixtyToOne(): ExampleSlide {
  return {
    id: "ex-sixty-to-one",
    title: L("The 60:1 rule", "La règle du 1 sur 60"),
    slide: canvas([
      T("label", L("Maths for IFR", "Maths pour l’IFR"), M.x, 96, 960, 48),
      T(
        "title",
        L("The 60:1 rule", "La règle du 1 sur 60"),
        M.x,
        144,
        1728,
        108,
      ),
      {
        id: "d60",
        frame: { x: M.x, y: 288, w: 1008, h: 672, z: 1 },
        kind: "diagram",
        d: {
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
        interactive: true,
        alt: L(
          "Track error triangle: 4 NM off after 30 NM",
          "Triangle d’écart : 4 NM d’écart après 30 NM",
        ),
        caption: L(
          "Drag the aircraft: the angles follow.",
          "Déplacez l’avion : les angles suivent.",
        ),
      },
      T("number", L("1° ≈ 1 NM", "1° ≈ 1 NM"), 1200, 288, 624, 144),
      T(
        "caption",
        L(
          "at 60 NM from the station or the fix",
          "à 60 NM de la station ou du repère",
        ),
        1200,
        432,
        624,
        48,
      ),
      T(
        "mono",
        L(
          "error (°) = 60 × off ÷ distance",
          "écart (°) = 60 × écart NM ÷ distance",
        ),
        1200,
        504,
        624,
        96,
      ),
      T(
        "body",
        L(
          "4 NM off after 30 NM: **8°** of track error. To reach the fix 40 NM ahead, add 60 × 4 ÷ 40 = 6°: turn **14°** towards the course.",
          "4 NM d’écart après 30 NM : **8°** d’erreur de route. Pour rejoindre le repère 40 NM plus loin, ajoutez 60 × 4 ÷ 40 = 6° : corrigez de **14°** vers la route.",
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
          "1 radian ≈ 57.3°, rounded to 60 for mental arithmetic.",
          "1 radian ≈ 57,3°, arrondi à 60 pour le calcul mental.",
        ),
        1200,
        912,
        624,
        72,
      ),
    ]),
  };
}

// ------------------------------------------------------------------ 6. partial panel scan
function partialPanel(): ExampleSlide {
  return {
    id: "ex-partial-panel",
    title: L("Partial panel scan", "Circuit visuel en panne partielle"),
    slide: canvas(
      [
        T(
          "label",
          L("Partial panel · FAA IFH ch. 6", "Panne partielle · FAA IFH ch. 6"),
          M.x,
          96,
          960,
          48,
        ),
        T(
          "title",
          L(
            "Partial panel: who replaces whom",
            "Panne partielle : qui remplace qui",
          ),
          M.x,
          144,
          1728,
          108,
        ),
        INST(
          SIX,
          L(
            "Six-pack with the attitude and heading indicators covered",
            "Six instruments, horizon et conservateur de cap masqués",
          ),
          M.x,
          288,
          960,
          720,
          { scene: "ex.turn", covers: ["ai", "dg"] },
        ),
        {
          id: "pp",
          frame: { x: 1152, y: 288, w: 672, h: 480, z: 1 },
          kind: "checklist",
          title: L("The new scan", "Le nouveau circuit"),
          rows: [
            {
              text: L(
                "**Bank**: turn coordinator; standard rate on the mark",
                "**Inclinaison** : indicateur de virage ; taux standard sur le repère",
              ),
            },
            {
              text: L(
                "**Pitch**: altimeter and VSI when level, airspeed in climbs and descents",
                "**Assiette** : altimètre et vario en palier, vitesse en montée et descente",
              ),
            },
            {
              text: L(
                "**Heading**: magnetic compass; mind the turning errors",
                "**Cap** : compas magnétique ; attention aux erreurs en virage",
              ),
            },
            {
              text: L(
                "**Timed turns**: 3° per second, 30° in 10 s",
                "**Virages chronométrés** : 3° par seconde, 30° en 10 s",
              ),
            },
          ],
        },
        T(
          "caption",
          L(
            "Cover the failed gyros: a drifting horizon is worse than none.",
            "Masquez les gyroscopes en panne : un horizon qui dérive est pire qu’aucun.",
          ),
          1152,
          792,
          672,
          96,
        ),
      ],
      { scene: "ex.turn" },
    ),
  };
}

// ------------------------------------------------------------------ 7. METAR decoding
function metar(): ExampleSlide {
  const groups: [string, string, string][] = [
    [
      "LFPN 061430Z",
      "Toussus-le-Noble, the 6th at 14:30 UTC",
      "Toussus-le-Noble, le 6 à 14 h 30 UTC",
    ],
    [
      "27012G22KT",
      "Wind 270° at 12 kt, gusting 22 kt",
      "Vent du 270° pour 12 kt, rafales 22 kt",
    ],
    ["4000", "Visibility 4,000 m", "Visibilité 4 000 m"],
    ["-RA", "Light rain", "Pluie faible"],
    [
      "BKN008 OVC015",
      "Broken at 800 ft, overcast at 1,500 ft: the ceiling is 800 ft",
      "Fragmenté à 800 ft, couvert à 1 500 ft : le plafond est à 800 ft",
    ],
    [
      "08/06",
      "Temperature 8 °C, dew point 6 °C",
      "Température 8 °C, point de rosée 6 °C",
    ],
    ["Q1009", "QNH 1009 hPa", "QNH 1009 hPa"],
    [
      "TEMPO 2500",
      "Temporarily, visibility 2,500 m",
      "Temporairement, visibilité 2 500 m",
    ],
  ];
  const text =
    "METAR LFPN 061430Z 27012G22KT 4000 -RA BKN008 OVC015 08/06 Q1009 TEMPO 2500";
  return {
    id: "ex-metar",
    title: L("Decoding a METAR", "Décoder un METAR"),
    slide: canvas(
      [
        T(
          "label",
          L("Weather · ICAO Annex 3", "Météo · OACI Annexe 3"),
          M.x,
          96,
          960,
          48,
        ),
        T(
          "title",
          L("Decoding a METAR", "Décoder un METAR"),
          M.x,
          144,
          1728,
          108,
        ),
        SHAPE("roundRect", M.x, 288, 1728, 120, {
          fill: "surface",
          stroke: "line",
          strokeW: 2,
        }),
        T("mono", L(text, text), M.x + 48, 288, 1632, 120, {
          valign: "middle",
          z: 2,
        }),
        ...groups.flatMap(([g, en, fr], i) => {
          const col = i % 2;
          const row = Math.floor(i / 2);
          const x = col ? 1008 : M.x;
          const y = 456 + row * 132;
          return [
            T("mono", L(g, g), x, y, 288, 96, {
              color: "accent",
              reveal: row + 1,
              group: `g${i}`,
            }),
            T("body", L(en, fr), x + 312, y, 504, 108, {
              reveal: row + 1,
              group: `g${i}`,
            }),
          ];
        }),
      ],
      { theme: "classroom" },
    ),
  };
}

// ------------------------------------------------------------------ 8. before / after a vacuum failure
function vacuumCompare(): ExampleSlide {
  return {
    id: "ex-vacuum",
    title: L(
      "Before / after a vacuum failure",
      "Avant / après une panne de dépression",
    ),
    slide: canvas(
      [
        T(
          "label",
          L("Systems · FAA IFH ch. 5 and 6", "Systèmes · FAA IFH ch. 5 et 6"),
          M.x,
          96,
          960,
          48,
        ),
        T(
          "title",
          L(
            "Vacuum failure: what changes",
            "Panne de dépression : ce qui change",
          ),
          M.x,
          144,
          1728,
          108,
        ),
        T("label", L("Before", "Avant"), M.x, 288, 816, 48, { color: "muted" }),
        INST(
          SIX,
          L(
            "Six-pack, normal, in a turn",
            "Six instruments, normal, en virage",
          ),
          M.x,
          336,
          816,
          612,
          { scene: "ex.turn" },
        ),
        T(
          "label",
          L("After: vacuum pump failed", "Après : pompe à dépression en panne"),
          1008,
          288,
          816,
          48,
          { color: "warn" },
        ),
        INST(
          SIX,
          L(
            "Six-pack after a vacuum failure: attitude and heading covered",
            "Six instruments après une panne de dépression : horizon et cap masqués",
          ),
          1008,
          336,
          816,
          612,
          {
            scene: "ex.turn",
            failures: { vacuum: true },
            covers: ["ai", "dg"],
          },
        ),
        ARROW([936, 642], [984, 642], { color: "muted", strokeW: 3, z: 3 }),
        T(
          "caption",
          L(
            "The gyros spin down and drift slowly, often without a flag. Cover them, fly the turn coordinator, altimeter and airspeed.",
            "Les gyroscopes ralentissent et dérivent lentement, souvent sans drapeau. Masquez-les, pilotez à l’indicateur de virage, l’altimètre et la vitesse.",
          ),
          M.x,
          972,
          1728,
          72,
          { reveal: 1 },
        ),
      ],
      { scene: "ex.turn" },
    ),
  };
}

/** The eight example slides, in gallery order. */
export function exampleSlides(): ExampleSlide[] {
  return [
    sixPack(),
    readingHsi(),
    holdEntries(),
    ilsMinimums(),
    sixtyToOne(),
    partialPanel(),
    metar(),
    vacuumCompare(),
  ];
}

/** A sample school brand (the 'brand' theme and the logo corner). */
export const SAMPLE_BRAND: SchoolBrand = {
  name: "Aéroclub Ardon",
  color: "#0f6e8c",
  logoCorner: "br",
};

/** The examples as a course (one designed-slide step each): the gallery, the builder's starters, the tests. */
export function exampleCourse(
  theme: ThemeId = "cockpit",
  brand?: SchoolBrand,
): Course {
  const steps: Step[] = exampleSlides().map(
    (e): Step => ({
      id: e.id,
      kind: "slide",
      title: e.title,
      layout: "canvas",
      reader: [{ t: "heading", text: e.title }],
      slide: e.slide,
    }),
  );
  return {
    format: "ifr-course",
    version: 1,
    id: "canvas-examples",
    rev: 1,
    updated: "2026-11-06T00:00:00.000Z",
    title: L("Designed slides: examples", "Diapositives : exemples"),
    author: { name: BRAND.name, club: "Ground school" },
    langs: ["en", "fr"],
    cockpit: "steam",
    world: { kind: "training" },
    steps,
    scenes: exampleScenes(),
    clips: {},
    assets: {},
    theme,
    ...(brand ? { brand } : {}),
    tags: ["examples", "slides"],
  };
}

