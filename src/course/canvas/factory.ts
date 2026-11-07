// Ground school — designed slides: block factories and the library catalogue (package N / P). Pure: every item
// the asset library panel offers (text styles, shapes, icons, diagrams, live instruments, the sim viewport,
// photos, interactive blocks) and how it becomes a block placed on a slide. The defaults are the "beautiful
// defaults": sizes on the grid, theme tokens, sensible alt text, so a dropped block already looks finished.
import type {
  BlockFrame,
  CalcDiagram,
  DiagramSpec,
  InstrumentGauge,
  InstrumentView,
  L10n,
  LibraryAssetId,
  Pt,
  SimScene,
  SlideBlock,
  SlideCanvas,
  TextStyle,
} from "../types";
import { instrumentFrame, frameAspect } from "../stage/geometry";
import { sceneFromFields } from "../scene";
import { ICONS } from "../assets/icons";
import { DIAGRAMS } from "../assets/diagrams";
import { PHOTOS } from "../assets/photos";
import { DEFAULT_GRID, SLIDE_H, SLIDE_W, keepOnSlide, snap } from "./geom";
import { maxZ, newBlockId } from "./ops";

const L = (en: string, fr: string): L10n => ({ en, fr });

/** A block before it is placed: no id, a size but no position yet (arrows keep endpoints relative to 0,0). */
export type BlockDraft = SlideBlock extends infer B
  ? B extends SlideBlock
    ? Omit<B, "id" | "frame"> & {
        frame: { w: number; h: number; rot?: number };
      }
    : never
  : never;

export type LibraryTab =
  | "text"
  | "shapes"
  | "icons"
  | "diagrams"
  | "instruments"
  | "photos"
  | "interactive";
export const LIBRARY_TABS: readonly LibraryTab[] = [
  "text",
  "shapes",
  "instruments",
  "diagrams",
  "icons",
  "photos",
  "interactive",
];

/** How the library shows an item (the panel draws the thumbnail). */
export type LibraryPreview =
  | { k: "text"; style: TextStyle }
  | { k: "shape"; shape: string }
  | { k: "lib"; id: LibraryAssetId }
  | { k: "instrument"; view: InstrumentView }
  | {
      k: "glyph";
      glyph:
        | "viewport"
        | "quiz"
        | "calc"
        | "checklist"
        | "hold"
        | "airspace"
        | "calcDiagram";
      label?: string;
    };

export interface LibraryItem {
  id: string;
  tab: LibraryTab;
  title: L10n;
  tags: string[];
  preview: LibraryPreview;
  /** the block it adds */
  make(): BlockDraft;
}

// ------------------------------------------------------------------ the demo scene (beautiful defaults)
/** The scene id instrument blocks fall back to when the slide names none (the renderer ships it). */
export const DEMO_SCENE_ID = "lib:demo";
/** Straight and level near ARD: 4,000 ft, heading 120, NAV1 on ARD with OBS 090 (a classic intercept picture). */
export function demoScene(
  cockpit: "g1000" | "steam" | "airliner" = "g1000",
): SimScene {
  return sceneFromFields(
    {
      kind: "fields",
      pos: { fix: "ARD", radial: 276, distNm: 6 },
      altFt: 4000,
      hdg: 120,
      iasKt: 100,
      radios: { nav1: "ARD", obs1: 90, cdi: "NAV1", brg1: "NAV1" },
    },
    {
      id: DEMO_SCENE_ID,
      cockpit,
      label: "ARD R-276 · 6 NM · 4,000 ft",
      weather: { windDir: 250, windKt: 10 },
    },
  );
}

// ------------------------------------------------------------------ block drafts
export function textDraft(
  style: TextStyle,
  text: L10n,
  w = 960,
  h?: number,
): BlockDraft {
  const hh =
    h ??
    {
      display: 264,
      title: 168,
      subtitle: 120,
      heading: 96,
      body: 216,
      caption: 72,
      label: 48,
      number: 192,
      quote: 192,
      mono: 120,
    }[style];
  return { kind: "text", style, text, frame: { w, h: hh } };
}
export function instrumentDraft(view: InstrumentView, w = 624): BlockDraft {
  const ar = frameAspect(instrumentFrame(view));
  const h = Math.round(w / ar / DEFAULT_GRID) * DEFAULT_GRID;
  return {
    kind: "instrument",
    view,
    mode: "frozen",
    alt: L(viewTitle(view).en, viewTitle(view).fr ?? viewTitle(view).en),
    frame: { w, h: Math.max(DEFAULT_GRID * 4, h) },
  };
}
export function diagramDraft(
  d: DiagramSpec,
  title: L10n,
  w = 816,
  h = 528,
): BlockDraft {
  return { kind: "diagram", d, alt: title, frame: { w, h } };
}
export function calcDiagramDraft(
  c: CalcDiagram,
  title: L10n,
  w = 816,
  h = 528,
): BlockDraft {
  return diagramDraft({ kind: "calc", calc: c }, title, w, h);
}

const GAUGE_TITLES: Record<InstrumentGauge, L10n> = {
  asi: L("Airspeed indicator", "Anémomètre"),
  ai: L("Attitude indicator", "Horizon artificiel"),
  alt: L("Altimeter", "Altimètre"),
  tc: L("Turn coordinator", "Indicateur de virage"),
  hsi: L("HSI", "HSI"),
  vsi: L("Vertical speed indicator", "Variomètre"),
  cdi: L("VOR / CDI", "VOR / CDI"),
  rmi: L("RMI", "RMI"),
  "pfd.attitude": L("PFD attitude", "PFD : assiette"),
  "pfd.hsi": L("PFD HSI", "PFD : HSI"),
  "pfd.tapes": L("PFD tapes", "PFD : bandeaux"),
  radios: L("Radio stack", "Radios"),
  "mfd.map": L("MFD map", "Carte MFD"),
};
const DISPLAY_TITLES: Record<string, L10n> = {
  pfd: L("G1000 PFD", "PFD G1000"),
  mfd: L("G1000 MFD", "MFD G1000"),
  six: L("Six-pack", "Six instruments de base"),
  stack: L("Radio stack and RMI", "Radios et RMI"),
  airlinerPfd: L("Airliner PFD", "PFD de ligne"),
  nd: L("Navigation display", "Écran de navigation"),
};
export function viewTitle(v: InstrumentView): L10n {
  return v.kind === "gauge" ? GAUGE_TITLES[v.gauge] : DISPLAY_TITLES[v.kind];
}

// ------------------------------------------------------------------ the catalogue
const TEXT_ITEMS: [TextStyle, L10n, L10n, number][] = [
  [
    "title",
    L("Title", "Titre"),
    L("Your slide title", "Titre de la diapositive"),
    1344,
  ],
  ["heading", L("Heading", "Intertitre"), L("A heading", "Un intertitre"), 816],
  [
    "body",
    L("Body text", "Texte"),
    L(
      "Say one thing per slide. **Bold** the key word.",
      "Une idée par diapositive. Mettez le mot clé en **gras**.",
    ),
    816,
  ],
  [
    "caption",
    L("Caption", "Légende"),
    L(
      "Source: FAA Instrument Flying Handbook",
      "Source : FAA Instrument Flying Handbook",
    ),
    720,
  ],
  ["label", L("Label", "Étiquette"), L("Key to success", "La clé"), 480],
  [
    "number",
    L("Big number", "Grand chiffre"),
    L("318 ft/NM", "318 ft/NM"),
    720,
  ],
  [
    "quote",
    L("Quote", "Citation"),
    L(
      "“Cleared to the ARD VOR, hold west on the 270 radial.”",
      "« Autorisé ARD VOR, attente à l’ouest sur la radiale 270. »",
    ),
    1200,
  ],
  [
    "mono",
    L("Clearance / METAR", "Clairance / METAR"),
    L(
      "METAR LFPN 061430Z 27012G22KT 4000 -RA BKN008",
      "METAR LFPN 061430Z 27012G22KT 4000 -RA BKN008",
    ),
    1200,
  ],
  [
    "subtitle",
    L("Subtitle", "Sous-titre"),
    L("What you will be able to do", "Ce que vous saurez faire"),
    1200,
  ],
];

const SHAPE_ITEMS: LibraryItem[] = [
  {
    id: "shape:rect",
    tab: "shapes",
    title: L("Panel", "Panneau"),
    tags: ["rect", "box", "panel", "card", "cadre"],
    preview: { k: "shape", shape: "roundRect" },
    make: () => ({
      kind: "shape",
      shape: "roundRect",
      fill: "surface",
      stroke: "line",
      strokeW: 2,
      frame: { w: 576, h: 360 },
    }),
  },
  {
    id: "shape:frame",
    tab: "shapes",
    title: L("Highlight frame", "Cadre de mise en évidence"),
    tags: ["frame", "highlight", "ring", "outline"],
    preview: { k: "shape", shape: "rect" },
    make: () => ({
      kind: "shape",
      shape: "roundRect",
      fill: null,
      stroke: "cyan",
      strokeW: 4,
      frame: { w: 336, h: 216 },
    }),
  },
  {
    id: "shape:ellipse",
    tab: "shapes",
    title: L("Circle", "Cercle"),
    tags: ["circle", "ellipse", "ring", "cercle"],
    preview: { k: "shape", shape: "ellipse" },
    make: () => ({
      kind: "shape",
      shape: "ellipse",
      fill: null,
      stroke: "cyan",
      strokeW: 4,
      frame: { w: 240, h: 240 },
    }),
  },
  {
    id: "shape:line",
    tab: "shapes",
    title: L("Rule", "Filet"),
    tags: ["line", "rule", "divider", "ligne"],
    preview: { k: "shape", shape: "line" },
    make: () => ({
      kind: "shape",
      shape: "line",
      stroke: "line",
      strokeW: 2,
      frame: { w: 720, h: 24 },
    }),
  },
  {
    id: "shape:triangle",
    tab: "shapes",
    title: L("Triangle", "Triangle"),
    tags: ["triangle", "fix", "intersection"],
    preview: { k: "shape", shape: "triangle" },
    make: () => ({
      kind: "shape",
      shape: "triangle",
      fill: null,
      stroke: "text",
      strokeW: 3,
      frame: { w: 144, h: 120 },
    }),
  },
  {
    id: "shape:arrow",
    tab: "shapes",
    title: L("Arrow", "Flèche"),
    tags: ["arrow", "pointer", "flèche"],
    preview: { k: "shape", shape: "arrow" },
    make: () => ({
      kind: "arrow",
      from: [0, 0],
      to: [360, 0],
      heads: "end",
      color: "accent",
      strokeW: 4,
      frame: { w: 360, h: 24 },
    }),
  },
  {
    id: "shape:curved-arrow",
    tab: "shapes",
    title: L("Curved arrow", "Flèche courbe"),
    tags: ["arrow", "curve", "turn", "flèche"],
    preview: { k: "shape", shape: "curve" },
    make: () => ({
      kind: "arrow",
      from: [0, 120],
      to: [360, 0],
      curve: 0.22,
      heads: "end",
      color: "accent",
      strokeW: 4,
      frame: { w: 360, h: 120 },
    }),
  },
  {
    id: "shape:callout",
    tab: "shapes",
    title: L("Callout", "Bulle"),
    tags: ["callout", "note", "bubble", "bulle", "leader"],
    preview: { k: "shape", shape: "callout" },
    make: () => ({
      kind: "callout",
      n: 1,
      tone: "plain",
      text: L(
        "**Name the part**: then say what it tells you.",
        "**Nommez l’élément** : puis ce qu’il vous dit.",
      ),
      target: [-120, 168],
      frame: { w: 528, h: 144 },
    }),
  },
  {
    id: "shape:marker",
    tab: "shapes",
    title: L("Numbered marker", "Repère numéroté"),
    tags: ["marker", "number", "badge", "repère"],
    preview: { k: "shape", shape: "marker" },
    make: () => ({
      kind: "marker",
      n: 1,
      shape: "circle",
      color: "accent",
      frame: { w: 72, h: 72 },
    }),
  },
];

const INSTRUMENT_VIEWS: [string, InstrumentView, number][] = [
  ["pfd", { kind: "pfd" }, 960],
  ["mfd", { kind: "mfd" }, 960],
  ["six", { kind: "six" }, 960],
  ["hsi", { kind: "gauge", gauge: "hsi" }, 576],
  ["ai", { kind: "gauge", gauge: "ai" }, 576],
  ["asi", { kind: "gauge", gauge: "asi" }, 480],
  ["alt", { kind: "gauge", gauge: "alt" }, 480],
  ["vsi", { kind: "gauge", gauge: "vsi" }, 480],
  ["tc", { kind: "gauge", gauge: "tc" }, 480],
  ["cdi", { kind: "gauge", gauge: "cdi" }, 576],
  ["rmi", { kind: "gauge", gauge: "rmi" }, 576],
  ["pfd.attitude", { kind: "gauge", gauge: "pfd.attitude" }, 864],
  ["pfd.hsi", { kind: "gauge", gauge: "pfd.hsi" }, 576],
  ["pfd.tapes", { kind: "gauge", gauge: "pfd.tapes" }, 1056],
  ["radios", { kind: "gauge", gauge: "radios" }, 1056],
  ["mfd.map", { kind: "gauge", gauge: "mfd.map" }, 576],
  ["stack", { kind: "stack" }, 960],
  ["airlinerPfd", { kind: "airlinerPfd" }, 864],
  ["nd", { kind: "nd" }, 864],
];

const LIVE_DIAGRAMS: {
  id: string;
  title: L10n;
  tags: string[];
  d: DiagramSpec;
  glyph: LibraryPreview;
}[] = [
  {
    id: "hold",
    title: L("Hold and entry sectors", "Attente et secteurs d’entrée"),
    tags: ["hold", "entry", "attente", "aim"],
    d: { kind: "hold", inbound: 90, turn: "R", fix: "ARD" },
    glyph: { k: "glyph", glyph: "hold" },
  },
  {
    id: "wind",
    title: L(
      "Wind triangle (drag the wind)",
      "Triangle des vents (déplacez le vent)",
    ),
    tags: ["wind", "wca", "triangle", "vent", "dérive"],
    d: {
      kind: "calc",
      calc: {
        kind: "windTriangle",
        course: 90,
        tasKt: 110,
        windDir: 150,
        windKt: 25,
        drag: ["wind"],
      },
    },
    glyph: { k: "glyph", glyph: "calcDiagram", label: "WCA" },
  },
  {
    id: "sixty",
    title: L("60:1 track error", "Règle du 1 / 60"),
    tags: ["60", "sixty", "track", "error", "écart"],
    d: {
      kind: "calc",
      calc: {
        kind: "sixtyToOne",
        course: 90,
        flownNm: 30,
        offNm: 4,
        toGoNm: 40,
        drag: ["off"],
      },
    },
    glyph: { k: "glyph", glyph: "calcDiagram", label: "60:1" },
  },
  {
    id: "profile",
    title: L("Descent profile", "Profil de descente"),
    tags: ["descent", "profile", "tod", "3°", "descente"],
    d: {
      kind: "calc",
      calc: {
        kind: "profile",
        fromFt: 6000,
        toFt: 1500,
        angleDeg: 3,
        gsKt: 120,
        marks: [{ distNm: 5, altFt: 2000, label: "FAF" }],
      },
    },
    glyph: { k: "glyph", glyph: "calcDiagram", label: "3°" },
  },
  {
    id: "vdp",
    title: L("Visual descent point", "Point de descente visuelle"),
    tags: ["vdp", "mda", "non-precision", "approach"],
    d: {
      kind: "calc",
      calc: { kind: "vdp", mdaFt: 740, tdzeFt: 440, vdpNm: 1, mapNm: 0 },
    },
    glyph: { k: "glyph", glyph: "calcDiagram", label: "VDP" },
  },
  {
    id: "holdWind",
    title: L("Hold in wind", "Attente avec vent"),
    tags: ["hold", "wind", "drift", "triple", "attente"],
    d: {
      kind: "calc",
      calc: {
        kind: "holdWind",
        inbound: 90,
        turn: "R",
        windDir: 180,
        windKt: 20,
        tasKt: 100,
        outboundS: 60,
      },
    },
    glyph: { k: "glyph", glyph: "calcDiagram", label: "×3" },
  },
  {
    id: "compass",
    title: L("TVMDC strip", "Du vrai au compas"),
    tags: ["tvmdc", "variation", "deviation", "compass", "cap"],
    d: {
      kind: "calc",
      calc: { kind: "compass", tc: 90, wca: -5, variation: -2, deviation: 2 },
    },
    glyph: { k: "glyph", glyph: "calcDiagram", label: "TVMDC" },
  },
  {
    id: "cg",
    title: L("CG envelope (C172S)", "Centrage (C172S)"),
    tags: ["cg", "weight", "balance", "centrage", "masse"],
    d: {
      kind: "calc",
      calc: {
        kind: "cgEnvelope",
        table: "c172s",
        points: [
          {
            weightLb: 2350,
            momentLbIn: 2350 * 41.5,
            label: L("Take-off", "Décollage"),
          },
        ],
      },
    },
    glyph: { k: "glyph", glyph: "calcDiagram", label: "CG" },
  },
  {
    id: "airspace",
    title: L("Airspace cross-section", "Coupe d’espace aérien"),
    tags: ["airspace", "class", "ctr", "tma", "espace"],
    d: {
      kind: "airspace",
      sketch: {
        widthNm: 40,
        topFt: 9000,
        layers: [
          { cls: "G", floorFt: 0, ceilFt: 1000, span: [-20, 20] },
          { cls: "E", floorFt: 1000, ceilFt: 9000, span: [-20, 20] },
          {
            cls: "D",
            floorFt: 1500,
            ceilFt: 6500,
            span: [-15, 15],
            label: L("TMA", "TMA"),
          },
          {
            cls: "CTR",
            floorFt: 0,
            ceilFt: 1500,
            span: [-6, 6],
            label: L("Control zone (class D)", "Zone de contrôle (classe D)"),
          },
        ],
        aircraft: { altFt: 2500, distNm: -13 },
      },
    },
    glyph: { k: "glyph", glyph: "airspace" },
  },
];

const INTERACTIVE_ITEMS: LibraryItem[] = [
  {
    id: "interactive:viewport",
    tab: "interactive",
    title: L("Sim viewport", "Fenêtre simulateur"),
    tags: ["sim", "viewport", "3d", "outside", "cockpit", "demo", "your turn"],
    preview: { k: "glyph", glyph: "viewport" },
    make: () => ({
      kind: "simViewport",
      view: "outside",
      alt: L("The simulator: outside view", "Le simulateur : vue extérieure"),
      frame: { w: 960, h: 552 },
    }),
  },
  {
    id: "interactive:quiz",
    tab: "interactive",
    title: L("Question", "Question"),
    tags: ["quiz", "question", "mcq", "qcm"],
    preview: { k: "glyph", glyph: "quiz" },
    make: () => ({
      kind: "quiz",
      quiz: {
        kind: "mcq",
        prompt: L(
          "The CDI is one dot right with a TO flag. Where is the course?",
          "Le CDI est à un point à droite, flag TO. Où est la route ?",
        ),
        options: [
          { text: L("To my right", "À ma droite") },
          { text: L("To my left", "À ma gauche") },
          { text: L("Behind me", "Derrière moi") },
        ],
        answer: 0,
        explain: L(
          "Fly towards the needle: the course is on the side the bar is.",
          "Volez vers l’aiguille : la route est du côté de la barre.",
        ),
      },
      frame: { w: 816, h: 480 },
    }),
  },
  {
    id: "interactive:calc",
    tab: "interactive",
    title: L("Calculation", "Calcul"),
    tags: ["calc", "maths", "calcul", "exercise", "problem"],
    preview: { k: "glyph", glyph: "calc" },
    make: () => ({
      kind: "calc",
      calc: { generatorId: "ifr.topOfDescent" },
      show: ["prompt", "givens"],
      frame: { w: 816, h: 528 },
    }),
  },
  {
    id: "interactive:checklist",
    tab: "interactive",
    title: L(
      "Do this (checked by the sim)",
      "À faire (vérifié par le simulateur)",
    ),
    tags: ["checklist", "do this", "goal", "à faire", "your turn"],
    preview: { k: "glyph", glyph: "checklist" },
    make: () => ({
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
          text: L(
            "Turn to heading 120 for a 30° intercept",
            "Prenez le cap 120 pour une interception à 30°",
          ),
          check: 1,
          readout: "hdg",
        },
        {
          text: L(
            "Roll out on 090, bar within 1 dot",
            "Sortez de virage au 090, barre à moins d’un point",
          ),
          check: 2,
          readout: "cdiDots",
        },
      ],
      frame: { w: 720, h: 384 },
    }),
  },
];

/** Every item the library panel offers, in display order per tab. */
export const LIBRARY_ITEMS: LibraryItem[] = [
  ...TEXT_ITEMS.map(
    ([style, title, sample, w]): LibraryItem => ({
      id: `text:${style}`,
      tab: "text",
      title,
      tags: ["text", "texte", style],
      preview: { k: "text", style },
      make: () => textDraft(style, sample, w),
    }),
  ),
  ...SHAPE_ITEMS,
  ...INSTRUMENT_VIEWS.map(
    ([id, view, w]): LibraryItem => ({
      id: `instrument:${id}`,
      tab: "instruments",
      title: viewTitle(view),
      tags: [
        "instrument",
        "live",
        id,
        ...viewTitle(view).en.toLowerCase().split(/\s+/),
      ],
      preview: { k: "instrument", view },
      make: () => instrumentDraft(view, w),
    }),
  ),
  ...LIVE_DIAGRAMS.map(
    (d): LibraryItem => ({
      id: `diagram:live:${d.id}`,
      tab: "diagrams",
      title: d.title,
      tags: ["diagram", "live", ...d.tags],
      preview: d.glyph,
      make: () =>
        diagramDraft(
          d.d,
          d.title,
          d.d.kind === "hold" ? 600 : 864,
          d.d.kind === "hold" ? 540 : 528,
        ),
    }),
  ),
  ...DIAGRAMS.map(
    (d): LibraryItem => ({
      id: `diagram:${d.id}`,
      tab: "diagrams",
      title: L(d.en, d.fr),
      tags: ["diagram", "schéma", ...d.tags],
      preview: { k: "lib", id: `diagram:${d.id}` },
      make: () => {
        const w = 960;
        const h = Math.round((w * d.h) / d.w / DEFAULT_GRID) * DEFAULT_GRID;
        return {
          kind: "image",
          image: { lib: `diagram:${d.id}` },
          fit: "contain",
          alt: L(d.en, d.fr),
          attribution: d.ref,
          frame: { w, h },
        };
      },
    }),
  ),
  ...ICONS.map(
    (i): LibraryItem => ({
      id: `icon:${i.id}`,
      tab: "icons",
      title: L(i.en, i.fr),
      tags: ["icon", "icône", ...i.tags],
      preview: { k: "lib", id: `icon:${i.id}` },
      make: () => ({
        kind: "image",
        image: { lib: `icon:${i.id}` },
        fit: "contain",
        alt: L(i.en, i.fr),
        frame: { w: 120, h: 120 },
      }),
    }),
  ),
  ...PHOTOS.map(
    (p): LibraryItem => ({
      id: `photo:${p.id}`,
      tab: "photos",
      title: L(p.en, p.fr),
      tags: ["photo", ...p.tags],
      preview: { k: "lib", id: `photo:${p.id}` },
      make: () => ({
        kind: "image",
        image: { lib: `photo:${p.id}` },
        fit: "cover",
        alt: L(p.en, p.fr),
        attribution: p.attribution,
        radius: 8,
        frame: {
          w: 816,
          h: Math.round((816 * p.h) / p.w / DEFAULT_GRID) * DEFAULT_GRID,
        },
      }),
    }),
  ),
  ...INTERACTIVE_ITEMS,
];
const ITEM_BY_ID = new Map(LIBRARY_ITEMS.map((i) => [i.id, i]));
export const libraryItem = (id: string): LibraryItem | undefined =>
  ITEM_BY_ID.get(id);

const fold = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Search the catalogue: every word must match the title (EN or FR), a tag or the id. */
export function searchItems(q: string, tab?: LibraryTab): LibraryItem[] {
  const words = fold(q).split(/\s+/).filter(Boolean);
  return LIBRARY_ITEMS.filter((it) => {
    if (tab && it.tab !== tab) return false;
    if (!words.length) return true;
    const hay = fold(
      [it.id, it.title.en, it.title.fr ?? "", ...it.tags].join(" "),
    );
    return words.every((w) => hay.includes(w));
  });
}

// ------------------------------------------------------------------ placing a draft on a slide
/**
 * Place a draft centred at `at` (slide units; default the slide centre), snapped to the grid, kept on the slide,
 * on top of everything. Arrow endpoints and callout targets are translated with it.
 */
export function placeDraft(
  c: SlideCanvas,
  draft: BlockDraft,
  at: Pt = [SLIDE_W / 2, SLIDE_H / 2],
  grid = c.grid ?? DEFAULT_GRID,
): SlideBlock {
  const w = Math.min(SLIDE_W, draft.frame.w);
  const h = Math.min(SLIDE_H, draft.frame.h);
  let x = snap(at[0] - w / 2, grid);
  let y = snap(at[1] - h / 2, grid);
  const f0: BlockFrame = {
    x,
    y,
    w,
    h,
    z: maxZ(c) + 1,
    ...(draft.frame.rot ? { rot: draft.frame.rot } : {}),
  };
  const f = keepOnSlide(f0, Math.min(w, h, 96));
  x = Math.max(0, Math.min(SLIDE_W - w, f.x));
  y = Math.max(0, Math.min(SLIDE_H - h, f.y));
  const b = JSON.parse(JSON.stringify(draft)) as SlideBlock;
  b.id = newBlockId(c.blocks);
  b.frame = { ...f0, x, y };
  if (b.kind === "arrow") {
    b.from = [b.from[0] + x, b.from[1] + y];
    b.to = [b.to[0] + x, b.to[1] + y];
    // the frame of an arrow is the endpoints' box (with room for the heads)
    const pad = 12;
    b.frame = {
      ...b.frame,
      x: Math.min(b.from[0], b.to[0]) - pad,
      y: Math.min(b.from[1], b.to[1]) - pad,
      w: Math.abs(b.to[0] - b.from[0]) + 2 * pad,
      h: Math.max(24, Math.abs(b.to[1] - b.from[1]) + 2 * pad),
    };
  }
  if (b.kind === "callout" && b.target)
    b.target = [b.target[0] + x, b.target[1] + y];
  return b;
}

/** An empty 16:9 canvas. */
export function emptyCanvas(
  o: Partial<Pick<SlideCanvas, "theme" | "layout" | "scene">> = {},
): SlideCanvas {
  return { size: { w: 1920, h: 1080 }, grid: DEFAULT_GRID, blocks: [], ...o };
}

// ------------------------------------------------------------------ instrument screen geometry (pure)
/**
 * Where the drawing sits inside an instrument block of logical size w × h: the screen box (contain, centred,
 * inside the bezel) and the map from the drawing's 1024 × 768 source coordinates to the block's own coordinates.
 * Authors (and the examples) use it to put markers and leaders exactly on a gauge part.
 */
export function instrumentScreen(
  view: InstrumentView,
  w: number,
  h: number,
  bezel = true,
  cockpit: "g1000" | "steam" | "airliner" = "g1000",
): { x: number; y: number; w: number; h: number; toBlock(p: Pt): Pt } {
  const frame = instrumentFrame(view, cockpit);
  const gauge = frame.kind === "gauge";
  const ar = frame.rect[2] / frame.rect[3];
  const pad = bezel === false ? 0 : Math.round(Math.min(w, h) * (gauge ? 0.035 : 0.028));
  const W = Math.max(1, w - 2 * pad);
  const H = Math.max(1, h - 2 * pad);
  const bw = W / H > ar ? H * ar : W;
  const bh = W / H > ar ? H : W / ar;
  const x = (w - bw) / 2;
  const y = (h - bh) / 2;
  const [rx, ry, rw, rh] = frame.rect;
  return {
    x,
    y,
    w: bw,
    h: bh,
    toBlock: (p) => [x + ((p[0] - rx) / rw) * bw, y + ((p[1] - ry) / rh) * bh],
  };
}
