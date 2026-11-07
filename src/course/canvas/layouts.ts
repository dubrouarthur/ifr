// Ground school — designed slides: layout templates (package N). Eleven starting points with beautiful defaults
// (SlideLayoutId): a CFI picks one, replaces the words and the instrument, and the slide already looks like a
// designer made it. Every template is on the 24-unit grid with the same safe margins (96 left / right, 96 top),
// the same title position, and theme tokens only (it looks right in all four themes).
import type {
  BlockFrame,
  BlockReveal,
  ColorToken,
  ImageSource,
  InstrumentView,
  L10n,
  Pt,
  SlideBlock,
  SlideCanvas,
  SlideLayoutId,
  TextStyle,
  ThemeId,
} from "../types";
import { DEFAULT_GRID } from "./geom";
import { instrumentScreen } from "./factory";

export const L = (en: string, fr: string): L10n => ({ en, fr });

// ------------------------------------------------------------------ composition helpers (also used by examples.ts)
/** Safe margins and the title row every template shares. */
export const M = {
  x: 96,
  top: 96,
  right: 1824,
  titleY: 120,
  titleH: 120,
  bodyY: 288,
  bottom: 984,
} as const;

type Extra = Partial<BlockFrame> & {
  reveal?: number | BlockReveal;
  id?: string;
  alt?: L10n;
  goal?: number[];
  readOrder?: number;
  anchor?: string;
};
let seq = 0;
const nid = (p: string) => `${p}${++seq}`;
function base(
  prefix: string,
  x: number,
  y: number,
  w: number,
  h: number,
  e: Extra = {},
) {
  const { reveal, id, alt, goal, readOrder, anchor, ...f } = e;
  return {
    id: id ?? nid(prefix),
    frame: {
      x,
      y,
      w,
      h,
      z: f.z ?? 1,
      ...(f.rot ? { rot: f.rot } : {}),
      ...(f.locked ? { locked: true } : {}),
      ...(f.group ? { group: f.group } : {}),
    },
    ...(reveal !== undefined
      ? { reveal: typeof reveal === "number" ? { order: reveal } : reveal }
      : {}),
    ...(alt ? { alt } : {}),
    ...(goal ? { goal } : {}),
    ...(readOrder !== undefined ? { readOrder } : {}),
    ...(anchor ? { anchor } : {}),
  };
}
export function T(
  style: TextStyle,
  text: L10n,
  x: number,
  y: number,
  w: number,
  h: number,
  e: Extra & {
    align?: "left" | "center" | "right";
    valign?: "top" | "middle" | "bottom";
    color?: ColorToken;
    bind?: Extract<SlideBlock, { kind: "text" }>["bind"];
  } = {},
): SlideBlock {
  const { align, valign, color, bind, ...rest } = e;
  return {
    ...base("t", x, y, w, h, rest),
    kind: "text",
    style,
    text,
    ...(align ? { align } : {}),
    ...(valign ? { valign } : {}),
    ...(color ? { color } : {}),
    ...(bind ? { bind } : {}),
  };
}
export function IMG(
  image: ImageSource,
  alt: L10n,
  x: number,
  y: number,
  w: number,
  h: number,
  e: Extra & Partial<Extract<SlideBlock, { kind: "image" }>> = {},
): SlideBlock {
  const { crop, fit, caption, attribution, radius, ...rest } = e;
  return {
    ...base("i", x, y, w, h, rest),
    kind: "image",
    image,
    alt,
    ...(crop ? { crop } : {}),
    fit: fit ?? "cover",
    ...(caption ? { caption } : {}),
    ...(attribution ? { attribution } : {}),
    ...(radius !== undefined ? { radius } : {}),
  };
}
export function INST(
  view: InstrumentView,
  alt: L10n,
  x: number,
  y: number,
  w: number,
  h: number,
  e: Extra & Partial<Extract<SlideBlock, { kind: "instrument" }>> = {},
): SlideBlock {
  const {
    scene,
    mode,
    controls,
    covers,
    failures,
    annotations,
    bezel,
    yourTurn,
    fromCalc,
    clip,
    ...rest
  } = e;
  return {
    ...base("n", x, y, w, h, rest),
    kind: "instrument",
    view,
    alt,
    ...(scene ? { scene } : {}),
    mode: mode ?? "frozen",
    ...(controls ? { controls } : {}),
    ...(covers ? { covers } : {}),
    ...(failures ? { failures } : {}),
    ...(annotations ? { annotations } : {}),
    ...(bezel !== undefined ? { bezel } : {}),
    ...(yourTurn ? { yourTurn } : {}),
    ...(fromCalc ? { fromCalc } : {}),
    ...(clip ? { clip } : {}),
  };
}
export function CALLOUT(
  n: number | undefined,
  text: L10n,
  x: number,
  y: number,
  w: number,
  h: number,
  e: Extra & { target?: Pt; tone?: "plain" | "accent" | "warn" } = {},
): SlideBlock {
  const { target, tone, ...rest } = e;
  return {
    ...base("c", x, y, w, h, rest),
    kind: "callout",
    ...(n !== undefined ? { n } : {}),
    text,
    ...(target ? { target } : {}),
    tone: tone ?? "plain",
  };
}
export function MARK(
  n: number,
  cx: number,
  cy: number,
  e: Extra & {
    size?: number;
    color?: ColorToken;
    shape?: "circle" | "square";
  } = {},
): SlideBlock {
  const { size = 64, color, shape, ...rest } = e;
  return {
    ...base("m", cx - size / 2, cy - size / 2, size, size, { z: 5, ...rest }),
    kind: "marker",
    n,
    ...(color ? { color } : {}),
    ...(shape ? { shape } : {}),
  };
}
export function SHAPE(
  shape: Extract<SlideBlock, { kind: "shape" }>["shape"],
  x: number,
  y: number,
  w: number,
  h: number,
  e: Extra & Partial<Extract<SlideBlock, { kind: "shape" }>> = {},
): SlideBlock {
  const { fill, stroke, strokeW, dash, opacity, ...rest } = e;
  return {
    ...base("s", x, y, w, h, { z: 0, ...rest }),
    kind: "shape",
    shape,
    ...(fill !== undefined ? { fill } : {}),
    ...(stroke !== undefined ? { stroke } : {}),
    ...(strokeW ? { strokeW } : {}),
    ...(dash ? { dash } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
  };
}
export function ARROW(
  from: Pt,
  to: Pt,
  e: Extra & {
    curve?: number;
    color?: ColorToken;
    strokeW?: 2 | 3 | 4 | 6;
    heads?: "end" | "both" | "none";
  } = {},
): SlideBlock {
  const { curve, color, strokeW, heads, ...rest } = e;
  const pad = 12;
  const x = Math.min(from[0], to[0]) - pad;
  const y = Math.min(from[1], to[1]) - pad;
  return {
    ...base(
      "a",
      x,
      y,
      Math.abs(to[0] - from[0]) + 2 * pad,
      Math.max(24, Math.abs(to[1] - from[1]) + 2 * pad),
      { z: 4, ...rest },
    ),
    kind: "arrow",
    from,
    to,
    ...(curve ? { curve } : {}),
    color: color ?? "accent",
    strokeW: strokeW ?? 4,
    heads: heads ?? "end",
  };
}
/** A point of an instrument's source drawing (1024 × 768), on the slide, for a block at (x, y, w, h). */
export function onInstrument(
  view: InstrumentView,
  x: number,
  y: number,
  w: number,
  h: number,
  p: Pt,
  cockpit: "g1000" | "steam" | "airliner" = "steam",
): Pt {
  const s = instrumentScreen(view, w, h, true, cockpit);
  const q = s.toBlock(p);
  return [Math.round(x + q[0]), Math.round(y + q[1])];
}

// ------------------------------------------------------------------ the templates
export interface LayoutDef {
  id: SlideLayoutId;
  title: L10n;
  summary: L10n;
}
export const LAYOUTS: LayoutDef[] = [
  {
    id: "title",
    title: L("Title", "Titre"),
    summary: L(
      "Course cover: title, subtitle, school line, photo",
      "Couverture : titre, sous-titre, école, photo",
    ),
  },
  {
    id: "section",
    title: L("Section", "Section"),
    summary: L(
      "A chapter divider with its number",
      "Un intercalaire de chapitre numéroté",
    ),
  },
  {
    id: "twoColumn",
    title: L("Two columns", "Deux colonnes"),
    summary: L("Two ideas side by side", "Deux idées côte à côte"),
  },
  {
    id: "instrumentNotes",
    title: L("Instrument + notes", "Instrument + notes"),
    summary: L(
      "A live instrument with numbered notes",
      "Un instrument réel et des notes numérotées",
    ),
  },
  {
    id: "compare",
    title: L("Before / after", "Avant / après"),
    summary: L(
      "Two instruments or two pictures to compare",
      "Deux instruments ou deux images à comparer",
    ),
  },
  {
    id: "stepByStep",
    title: L("Step by step", "Pas à pas"),
    summary: L(
      "Numbered steps revealed one by one",
      "Étapes numérotées révélées une à une",
    ),
  },
  {
    id: "fullBleed",
    title: L("Full-bleed photo", "Photo pleine page"),
    summary: L(
      "A photo with a caption band",
      "Une photo et son bandeau de légende",
    ),
  },
  {
    id: "checklist",
    title: L("Checklist", "Check-list"),
    summary: L(
      "Rows the sim ticks, next to the instrument",
      "Des lignes cochées par le simulateur, à côté de l’instrument",
    ),
  },
  {
    id: "yourTurn",
    title: L("Your turn", "À vous"),
    summary: L(
      "Hand control to the student on the instrument",
      "Donnez la main à l’élève sur l’instrument",
    ),
  },
  {
    id: "calc",
    title: L("Calculation", "Calcul"),
    summary: L(
      "A generated problem with its diagram",
      "Un problème généré et son schéma",
    ),
  },
  {
    id: "blank",
    title: L("Blank", "Vierge"),
    summary: L("Start from nothing", "Partir de rien"),
  },
];

export interface LayoutOptions {
  theme?: ThemeId;
  scene?: string;
  /** replaces the template's sample title */
  title?: L10n;
  /** title layout: replaces the sample subtitle and byline (a new course starts with neutral words) */
  subtitle?: L10n;
  byline?: L10n;
}

/** A new slide from a layout template (ids are fresh each time). */
export function layoutCanvas(
  id: SlideLayoutId,
  o: LayoutOptions = {},
): SlideCanvas {
  const blocks = templateBlocks(id, o);
  return {
    size: { w: 1920, h: 1080 },
    grid: DEFAULT_GRID,
    layout: id,
    ...(o.theme ? { theme: o.theme } : {}),
    ...(o.scene ? { scene: o.scene } : {}),
    ...(id === "fullBleed"
      ? {
          background: { image: { lib: "photo:above-clouds" }, dim: 0.38 },
          hideBrand: false,
        }
      : {}),
    blocks,
  };
}

function title(o: LayoutOptions, en: string, fr: string): L10n {
  return o.title ?? L(en, fr);
}
function templateBlocks(id: SlideLayoutId, o: LayoutOptions): SlideBlock[] {
  const X = M.x;
  switch (id) {
    case "title":
      return [
        T(
          "label",
          L(
            "Ground school · Instrument rating",
            "Théorie · Qualification de vol aux instruments",
          ),
          X,
          168,
          960,
          48,
        ),
        SHAPE("rect", X, 240, 96, 8, { fill: "accent", stroke: null }),
        T(
          "display",
          title(
            o,
            "Holding patterns, flown and understood",
            "Les attentes, comprises et pilotées",
          ),
          X,
          288,
          960,
          384,
          { valign: "bottom" },
        ),
        T(
          "subtitle",
          o.subtitle ??
            L(
              "Entries, timing and wind correction — then fly one at ARD",
              "Entrées, chronométrage et correction de vent — puis une attente à ARD",
            ),
          X,
          696,
          912,
          144,
        ),
        T(
          "caption",
          o.byline ??
            L(
              "Aéroclub Ardon · J. Martin, CFII",
              "Aéroclub Ardon · J. Martin, FI(A) IR",
            ),
          X,
          912,
          912,
          48,
        ),
        IMG(
          { lib: "photo:in-cloud" },
          L("A Cessna 172 flying in cloud", "Un Cessna 172 dans les nuages"),
          1152,
          0,
          768,
          1080,
          { attribution: "Photo: Matthias Wesselmann / Unsplash" },
        ),
      ];
    case "section":
      return [
        T("number", L("02", "02"), X, 264, 480, 192),
        SHAPE("rect", X, 480, 96, 8, { fill: "accent", stroke: null }),
        T(
          "title",
          title(o, "Tracking a VOR radial", "Suivre une radiale VOR"),
          X,
          528,
          1440,
          168,
        ),
        T(
          "subtitle",
          L(
            "Inbound, outbound, and correcting for the wind",
            "En rapprochement, en éloignement, et la correction de vent",
          ),
          X,
          720,
          1320,
          120,
        ),
      ];
    case "twoColumn":
      return [
        T("label", L("Compare", "Comparer"), X, 96, 960, 48),
        T(
          "title",
          title(
            o,
            "Precision and non-precision approaches",
            "Approches de précision et classiques",
          ),
          X,
          144,
          1728,
          120,
        ),
        SHAPE("roundRect", X, M.bodyY, 816, 528, {
          fill: "surface",
          stroke: "line",
          strokeW: 2,
        }),
        T(
          "heading",
          L("ILS: decision altitude", "ILS : altitude de décision"),
          X + 48,
          M.bodyY + 48,
          720,
          72,
        ),
        T(
          "body",
          L(
            "- Lateral **and** vertical guidance\n- At DA: land or go around, no level-off\n- Minimums: DA(H), RVR",
            "- Guidage latéral **et** vertical\n- À la DA : atterrir ou remettre les gaz, sans palier\n- Minima : DA(H), RVR",
          ),
          X + 48,
          M.bodyY + 144,
          720,
          336,
        ),
        SHAPE("roundRect", 1008, M.bodyY, 816, 528, {
          fill: "surface",
          stroke: "line",
          strokeW: 2,
        }),
        T(
          "heading",
          L(
            "VOR or NDB: minimum descent altitude",
            "VOR ou NDB : altitude minimale de descente",
          ),
          1056,
          M.bodyY + 48,
          720,
          72,
        ),
        T(
          "body",
          L(
            "- Lateral guidance only\n- Level off at MDA, fly to the MAP\n- Leave MDA only with the runway in sight",
            "- Guidage latéral seulement\n- Palier à la MDA jusqu’au MAPt\n- Quitter la MDA seulement piste en vue",
          ),
          1056,
          M.bodyY + 144,
          720,
          336,
        ),
      ];
    case "instrumentNotes":
      return [
        T(
          "title",
          title(o, "Reading the HSI", "Lire le HSI"),
          X,
          M.titleY,
          1728,
          M.titleH,
        ),
        INST(
          { kind: "gauge", gauge: "hsi" },
          L("HSI", "HSI"),
          X,
          264,
          744,
          744,
          { scene: o.scene },
        ),
        CALLOUT(
          1,
          L(
            "**Course pointer**: the course set with the OBS.",
            "**Aiguille de route** : la route affichée à l’OBS.",
          ),
          936,
          288,
          888,
          144,
          { reveal: 1 },
        ),
        CALLOUT(
          2,
          L(
            "**CDI bar**: where that course is. Fly towards the bar.",
            "**Barre CDI** : où se trouve cette route. Volez vers la barre.",
          ),
          936,
          456,
          888,
          144,
          { reveal: 2 },
        ),
        CALLOUT(
          3,
          L(
            "**TO / FROM**: which side of the station you are on.",
            "**TO / FROM** : de quel côté de la station vous êtes.",
          ),
          936,
          624,
          888,
          144,
          { reveal: 3 },
        ),
      ];
    case "compare":
      return [
        T(
          "title",
          title(o, "Before and after", "Avant et après"),
          X,
          M.titleY,
          1728,
          M.titleH,
        ),
        T("label", L("Before", "Avant"), X, 288, 816, 48),
        INST(
          { kind: "six" },
          L("Six-pack, normal", "Six instruments, normal"),
          X,
          336,
          816,
          612,
          { scene: o.scene },
        ),
        T("label", L("After", "Après"), 1008, 288, 816, 48, { color: "warn" }),
        INST(
          { kind: "six" },
          L("Six-pack, after the failure", "Six instruments, après la panne"),
          1008,
          336,
          816,
          612,
          { scene: o.scene, failures: { vacuum: true } },
        ),
      ];
    case "stepByStep": {
      const rows: [string, string, string, string][] = [
        [
          "Tune and identify",
          "Affichez et identifiez",
          "Frequency set, Morse checked.",
          "Fréquence affichée, indicatif vérifié.",
        ],
        [
          "Set the course",
          "Affichez la route",
          "OBS to the radial’s reciprocal for inbound.",
          "OBS sur l’inverse de la radiale en rapprochement.",
        ],
        [
          "Intercept",
          "Interceptez",
          "30° to 45° towards the CDI bar.",
          "30° à 45° vers la barre CDI.",
        ],
        [
          "Track",
          "Maintenez",
          "Bracket the wind: halve each correction.",
          "Encadrez le vent : divisez chaque correction par deux.",
        ],
      ];
      return [
        T(
          "title",
          title(o, "Four steps to a radial", "Quatre étapes pour une radiale"),
          X,
          M.titleY,
          1728,
          M.titleH,
        ),
        ...rows.flatMap(([he, hf, be, bf], i): SlideBlock[] => {
          const y = 312 + i * 168;
          const g = `row${i + 1}`;
          return [
            MARK(i + 1, X + 36, y + 36, { size: 72, reveal: i + 1, group: g }),
            T("heading", L(he, hf), X + 120, y, 744, 60, {
              reveal: i + 1,
              group: g,
            }),
            T("body", L(be, bf), X + 120, y + 72, 744, 84, {
              reveal: i + 1,
              group: g,
            }),
          ];
        }),
        INST(
          { kind: "gauge", gauge: "cdi" },
          L("VOR indicator", "Indicateur VOR"),
          1104,
          288,
          696,
          696,
          { scene: o.scene },
        ),
      ];
    }
    case "fullBleed":
      return [
        T("label", L("Weather", "Météo"), X, 720, 960, 48, { color: "white" }),
        T(
          "title",
          title(
            o,
            "In cloud, the instruments are the horizon",
            "Dans les nuages, les instruments sont l’horizon",
          ),
          X,
          768,
          1500,
          144,
          { color: "white" },
        ),
        T(
          "subtitle",
          L(
            "Trust the scan, not the seat of your pants.",
            "Faites confiance au circuit visuel, pas à vos sensations.",
          ),
          X,
          912,
          1500,
          72,
          { color: "white" },
        ),
      ];
    case "checklist":
      return [
        T(
          "title",
          title(o, "Do this on the instrument", "À faire sur l’instrument"),
          X,
          M.titleY,
          1728,
          M.titleH,
        ),
        {
          ...base("k", X, M.bodyY, 816, 528),
          kind: "checklist",
          title: L("Do this", "À faire"),
          rows: [
            {
              text: L(
                "Set the OBS to 090 with a TO flag",
                "Affichez 090 à l’OBS, flag TO",
              ),
              check: 0,
              readout: "obs1",
            },
            {
              text: L("Turn to heading 120", "Prenez le cap 120"),
              check: 1,
              readout: "hdg",
            },
            {
              text: L("Bar within 1 dot", "Barre à moins d’un point"),
              check: 2,
              readout: "cdiDots",
            },
          ],
        },
        INST(
          { kind: "gauge", gauge: "hsi" },
          L("HSI", "HSI"),
          1080,
          M.bodyY,
          696,
          696,
          { scene: o.scene },
        ),
      ];
    case "yourTurn":
      return [
        INST(
          { kind: "gauge", gauge: "hsi" },
          L("HSI", "HSI"),
          X,
          96,
          888,
          888,
          {
            scene: o.scene,
            mode: "live",
            controls: ["obs1", "hdgBug"],
            yourTurn: {
              where: "slide",
              prompt: L(
                "Centre the needle with a TO flag",
                "Centrez l’aiguille avec un flag TO",
              ),
              controls: ["obs1", "hdgBug"],
              goal: {
                all: [
                  { id: "toFrom", p: { value: "TO" } },
                  { id: "cdiDefl", p: { maxDots: 0.5 } },
                ],
                graded: false,
              },
            },
          },
        ),
        T("label", L("Your turn", "À vous"), 1080, 120, 744, 48),
        T(
          "heading",
          L(
            "Find the radial you are on",
            "Trouvez la radiale sur laquelle vous êtes",
          ),
          1080,
          168,
          744,
          144,
        ),
        {
          ...base("k", 1080, 360, 744, 264),
          kind: "checklist",
          rows: [
            {
              text: L(
                "Turn the OBS until the bar centres",
                "Tournez l’OBS jusqu’à centrer la barre",
              ),
              check: 1,
              readout: "cdiDots",
            },
            {
              text: L("With a TO flag", "Avec un flag TO"),
              check: 0,
              readout: "toFrom",
            },
          ],
        },
        T(
          "caption",
          L(
            "The course under the pointer is the bearing TO the station: its reciprocal is your radial.",
            "La route sous l’aiguille est le relèvement VERS la station : son inverse est votre radiale.",
          ),
          1080,
          672,
          744,
          144,
        ),
      ];
    case "calc":
      return [
        T("label", L("Maths for IFR", "Maths pour l’IFR"), X, 96, 960, 48),
        T(
          "title",
          title(o, "Where do I start down?", "Où commencer la descente ?"),
          X,
          144,
          1728,
          120,
        ),
        {
          ...base("q", X, M.bodyY, 864, 696),
          kind: "calc",
          calc: { generatorId: "ifr.topOfDescent" },
          show: ["prompt", "givens"],
        },
        {
          ...base("d", 1056, M.bodyY, 768, 480),
          kind: "diagram",
          d: {
            kind: "calc",
            calc: {
              kind: "profile",
              fromFt: 6000,
              toFt: 2000,
              angleDeg: 3,
              gsKt: 120,
            },
          },
          alt: L("Descent profile, 3°", "Profil de descente, 3°"),
        },
        T(
          "mono",
          L(
            "distance (NM) = altitude to lose (ft) ÷ 318",
            "distance (NM) = altitude à perdre (ft) ÷ 318",
          ),
          1056,
          816,
          768,
          72,
        ),
        T(
          "caption",
          L(
            "A 3° path is about 318 ft per NM (FAA IFH ch. 10).",
            "Une pente de 3° fait environ 318 ft par NM (FAA IFH ch. 10).",
          ),
          1056,
          888,
          768,
          72,
        ),
      ];
    case "blank":
    default:
      return [];
  }
}
