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
  ReadoutId,
  SlideLayoutId,
  TextStyle,
  ThemeId,
} from "../types";
import { instrumentScreen } from "./factory";

export const L = (en: string, fr: string): L10n => ({ en, fr });

// ------------------------------------------------------------------ composition helpers (also used by examples.ts)
/** The 12-column grid of the design system (SPEC slides v2 §1): margin 120, column 96, gutter 48, pitch 144. */
export const G = {
  /** column c (0–11) starts at x(c) */
  x: (c: number) => 120 + 144 * c,
  /** n columns span w(n) */
  w: (n: number) => 144 * n - 48,
  left: 120,
  right: 1800,
  top: 96,
  /** eyebrow row and title top */
  eyebrowY: 96,
  titleY: 136,
  /** a lead under a one-line title */
  leadY: 240,
  /** body top with a lead, and without */
  body: 288,
  bodyNoLead: 312,
  bottom: 984,
  /** the footer line: source on the left */
  foot: 1008,
} as const;
/** Older safe margins (examples.ts and stored slides). */
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
  /** the design-system archetype (SPEC slides v2 §8), shown first in the editor */
  archetype?: boolean;
}
export const LAYOUTS: LayoutDef[] = [
  { id: "cover", archetype: true, title: L("Cover", "Couverture"), summary: L("Title, subtitle, one line, and a hero diagram or instrument", "Titre, sous-titre, une phrase, et un schéma ou un instrument en vedette") },
  { id: "section", archetype: true, title: L("Section opener", "Ouverture de partie"), summary: L("Part n of N, its title and the roadmap", "Partie n sur N, son titre et la feuille de route") },
  { id: "bigNumber", archetype: true, title: L("Big number", "Grand chiffre"), summary: L("One rule of thumb, in one number", "Une règle pratique, en un chiffre") },
  { id: "heroDiagram", archetype: true, title: L("Diagram + 3 points", "Schéma + 3 points"), summary: L("A large diagram, three points in its colours", "Un grand schéma, trois points dans ses couleurs") },
  { id: "instrumentNotes", archetype: true, title: L("Instrument + callouts", "Instrument + repères"), summary: L("A live instrument with numbered callouts and live values", "Un instrument en direct, des repères numérotés et les valeurs lues") },
  { id: "compare", archetype: true, title: L("Comparison", "Comparaison"), summary: L("Before and after, one thing changed", "Avant et après, une seule chose change") },
  { id: "stepByStep", archetype: true, title: L("Step sequence", "Étapes"), summary: L("Numbered steps revealed one by one, beside the instrument", "Étapes numérotées révélées une à une, à côté de l’instrument") },
  { id: "formula", archetype: true, title: L("Formula", "Formule"), summary: L("A diagram, the formula, then the numbers one line at a time", "Un schéma, la formule, puis les chiffres une ligne à la fois") },
  { id: "quiz", archetype: true, title: L("Question", "Question"), summary: L("A clearance or a picture, a question, answer tiles", "Une clairance ou une image, une question, des réponses en tuiles") },
  { id: "recap", archetype: true, title: L("Takeaways", "À retenir"), summary: L("Three numbers and three checks", "Trois chiffres et trois vérifications") },
  { id: "ready", archetype: true, title: L("Ready to fly", "Prêt à voler"), summary: L("Objectives and standards: the last slide of a briefing", "Objectifs et critères : la dernière diapo d’un briefing") },
  { id: "title", title: L("Photo cover", "Couverture photo"), summary: L("Course cover with a photo", "Couverture du cours avec une photo") },
  { id: "twoColumn", title: L("Two columns", "Deux colonnes"), summary: L("Two ideas side by side", "Deux idées côte à côte") },
  { id: "fullBleed", title: L("Full-bleed photo", "Photo pleine page"), summary: L("A photo with its words over it", "Une photo et ses mots par-dessus") },
  { id: "checklist", title: L("Checklist", "Check-list"), summary: L("Rows the sim ticks, next to the instrument", "Des lignes cochées par le simulateur, à côté de l’instrument") },
  { id: "yourTurn", title: L("Your turn", "À vous"), summary: L("Hand control to the student on the instrument", "Donnez la main à l’élève sur l’instrument") },
  { id: "calc", title: L("Calculation", "Calcul"), summary: L("A generated problem with its diagram", "Un problème généré et son schéma") },
  { id: "blank", title: L("Blank", "Vierge"), summary: L("Start from nothing", "Partir de rien") },
];

export interface LayoutOptions {
  theme?: ThemeId;
  scene?: string;
  /** replaces the template's sample title */
  title?: L10n;
  /** cover layouts: replaces the sample subtitle and byline (a new course starts with neutral words) */
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
    // the design system's frames sit on an 8 px baseline
    grid: 8,
    layout: id,
    ...(o.theme ? { theme: o.theme } : {}),
    ...(o.scene ? { scene: o.scene } : {}),
    ...(id === "fullBleed"
      ? {
          background: { image: { lib: "photo:above-clouds" }, dim: 0.45 },
          hideBrand: false,
        }
      : {}),
    blocks,
  };
}

function title(o: LayoutOptions, en: string, fr: string): L10n {
  return o.title ?? L(en, fr);
}
/** The header every archetype shares: eyebrow 120,96 · title 120,136 (≤ 2 lines). */
function header(eyebrow: L10n, t: L10n, w = 1392): SlideBlock[] {
  return [T("eyebrow", eyebrow, G.left, G.eyebrowY, w, 32), T("title", t, G.left, G.titleY, w, 152)];
}
/** The footer line: the source, never in the eyebrow (SPEC §2). */
const footSource = (t: L10n, w = 1200): SlideBlock => T("foot", t, G.left, G.foot, w, 32);
const rule = (x: number, y: number, w: number, e: { reveal?: number; group?: string } = {}): SlideBlock =>
  SHAPE("line", x, y - 8, w, 16, {
    stroke: "line",
    strokeW: 2,
    ...(e.reveal ? { reveal: { order: e.reveal } } : {}),
    ...(e.group ? { group: e.group } : {}),
  });
const HSI: InstrumentView = { kind: "gauge", gauge: "hsi" };
const HOLD = { kind: "hold" as const, inbound: 270, turn: "R" as const, fix: "ARD" };

function templateBlocks(id: SlideLayoutId, o: LayoutOptions): SlideBlock[] {
  switch (id) {
    // ---------------------------------------------------------------- A1 cover
    case "cover":
      return [
        T("eyebrow", L("Ground school · Holding", "Théorie · Attentes"), G.left, G.eyebrowY, 816, 32),
        T("display", title(o, "Holding", "L’attente"), G.left, 344, 840, 240, { valign: "bottom" }),
        T("heading", o.subtitle ?? L("Entries, timing and wind", "Entrées, chronométrage et vent"), G.left, 608, 840, 56, { color: "ink2" }),
        T(
          "lead",
          L("Read the clearance, pick the entry, time it, correct for the wind — then fly the hold at ARD.", "Lire la clairance, choisir l’entrée, chronométrer, corriger le vent — puis voler l’attente à ARD."),
          G.left,
          736,
          744,
          112,
        ),
        T("foot", o.byline ?? L("FAA AIM 5-3-8", "FAA AIM 5-3-8"), G.left, 912, 840, 32),
        {
          ...base("d", 984, 96, 816, 888, { alt: L("A holding pattern at ARD", "Une attente à ARD") }),
          kind: "diagram",
          d: { ...HOLD, quiet: true },
        },
      ];
    // ---------------------------------------------------------------- A2 section opener
    case "section": {
      const items: [string, string][] = [
        ["Anatomy and clearance", "Anatomie et clairance"],
        ["Timing and wind", "Chrono et vent"],
        ["The five Ts", "Les cinq T"],
        ["Fly it at ARD", "En vol à ARD"],
      ];
      const active = 1;
      return [
        T("eyebrow", L("Part 2 of 4", "Partie 2 sur 4"), G.left, G.eyebrowY, 1392, 32),
        T("number", L("02", "02"), 112, 200, 480, 200),
        T("display", title(o, "Time it, correct for the wind", "Chronométrer et corriger le vent"), G.left, 440, 1680, 240, { valign: "bottom" }),
        T("lead", L("One minute inbound whatever the wind: you set the outbound leg.", "Une minute en rapprochement quel que soit le vent : on règle l’éloignement."), G.left, 704, 1104, 112),
        rule(G.left, 840, 1680),
        SHAPE("rect", G.left + 432 * active, 832, 384, 8, { fill: "accent", stroke: null, z: 1 }),
        ...items.flatMap(([en, fr], i): SlideBlock[] => [
          T("foot", L(String(i + 1), String(i + 1)), G.left + 432 * i, 864, 384, 32, i === active ? { color: "accent" } : {}),
          T("body", L(en, fr), G.left + 432 * i, 904, 384, 56, { color: i === active ? "text" : "muted" }),
        ]),
      ];
    }
    // ---------------------------------------------------------------- A3 big number
    case "bigNumber":
      return [
        ...header(L("Descent planning", "Plan de descente"), title(o, "The 3° path", "Le plan à 3°")),
        T("number", L("318", "318"), G.left, 312, 960, 200),
        T("heading", L("feet per nautical mile on a 3° path", "pieds par mille nautique sur un plan à 3°"), G.left, 560, 960, 112),
        T(
          "body",
          L("Rounded to 300 for mental maths: 4,000 ft to lose ≈ 13 NM, or 4 × 3 = 12 NM.", "Arrondi à 300 pour le calcul mental : 4 000 ft à perdre ≈ 13 NM, ou 4 × 3 = 12 NM."),
          G.left,
          696,
          816,
          152,
        ),
        INST({ kind: "gauge", gauge: "vsi" }, L("Vertical speed indicator", "Variomètre"), 1272, 312, 528, 528, { scene: o.scene }),
        footSource(L("FAA IFH ch. 10", "FAA IFH ch. 10")),
      ];
    // ---------------------------------------------------------------- A4 hero diagram + 3 bullets
    case "heroDiagram": {
      const pts: [string, string, string, string, ColorToken][] = [
        ["1 · Parallel  110°", "1 · Parallèle  110°", "At the fix, fly outbound on the non-holding side, 1 min, then back to the fix.", "Au repère, éloignement côté non-attente, 1 min, puis retour au repère.", "sel"],
        ["2 · Offset  70°", "2 · Décalée  70°", "At the fix, outbound 30° off on the holding side, 1 min, then turn.", "Au repère, éloignement décalé de 30° côté attente, 1 min, puis virez.", "key"],
        ["3 · Direct  180°", "3 · Directe  180°", "At the fix, turn in the direction of the hold: you are in it.", "Au repère, virez dans le sens de l’attente : vous y êtes.", "nav"],
      ];
      return [
        ...header(L("Hold entries", "Entrées en attente"), title(o, "Three sectors, three entries", "Trois secteurs, trois entrées")),
        {
          ...base("d", G.left, 288, 960, 696, { alt: L("The three entry sectors of a hold at ARD", "Les trois secteurs d’entrée d’une attente à ARD") }),
          kind: "diagram",
          d: HOLD,
        },
        ...pts.flatMap(([he, hf, be, bf, col], i): SlideBlock[] => {
          const y = 336 + i * 216;
          const g = `pt${i + 1}`;
          return [
            rule(1128, y, 672, { reveal: i + 1, group: g }),
            T("heading", L(he, hf), 1128, y + 24, 672, 56, { color: col, reveal: i + 1, group: g }),
            T("body", L(be, bf), 1128, y + 88, 672, 104, { reveal: i + 1, group: g }),
          ];
        }),
      ];
    }
    // ---------------------------------------------------------------- A5 instrument + callouts
    case "instrumentNotes": {
      const rows: [string, string, string, string, ReadoutId][] = [
        ["Course pointer", "Aiguille de route", "Set with the OBS: {{value}}", "Affichée à l’OBS : {{value}}", "obs1"],
        ["Deviation bar", "Barre de déviation", "Where the course is — fly to it: {{value}}", "Où est la route — allez vers elle : {{value}}", "cdiDots"],
        ["TO / FROM", "TO / FROM", "Does the course lead to the station? {{value}}", "La route mène-t-elle à la station ? {{value}}", "toFrom"],
      ];
      const marks: [number, number][] = [
        [380, 278],
        [590, 503],
        [474, 387],
      ];
      return [
        INST(HSI, L("HSI", "HSI"), G.left, 120, 840, 840, { scene: o.scene }),
        ...marks.map(([x, y], i) => MARK(i + 1, x + 30, y + 30, { size: 56, reveal: i + 1 })),
        T("eyebrow", L("Navigation", "Navigation"), 1128, 120, 672, 32),
        T("title", title(o, "Reading the HSI", "Lire le HSI"), 1128, 160, 672, 88),
        T("body", L("6 NM west of ARD, heading 120, OBS 090.", "À 6 NM à l’ouest d’ARD, cap 120, OBS 090."), 1128, 264, 672, 104),
        ...rows.flatMap(([he, hf, be, bf, ro], i): SlideBlock[] => {
          const y = 400 + i * 176;
          const g = `row${i + 1}`;
          return [
            rule(1128, y, 672, { reveal: i + 1, group: g }),
            MARK(i + 1, 1156, y + 52, { size: 56, reveal: i + 1, group: g }),
            T("heading", L(he, hf), 1208, y + 24, 592, 56, { reveal: i + 1, group: g }),
            T("body", L(be, bf), 1208, y + 88, 592, 80, { reveal: i + 1, group: g, bind: { k: "readout", readout: ro } }),
          ];
        }),
        T("foot", L("● Live values · FAA IFH ch. 9", "● Valeurs lues en direct · FAA IFH ch. 9"), 1128, G.foot, 672, 32, { color: "nav" }),
      ];
    }
    // ---------------------------------------------------------------- A6 comparison
    case "compare":
      return [
        ...header(L("Station passage", "Passage de la station"), title(o, "Over the station, the flag flips", "À la verticale, le drapeau bascule")),
        T("eyebrow", L("Before: TO", "Avant : TO"), G.left, 312, 816, 32, { color: "muted" }),
        INST(HSI, L("HSI before the station: TO", "HSI avant la station : TO"), 288, 360, 480, 480, { scene: o.scene }),
        T("body", L("Inbound on R-270: the course leads to the station.", "En rapprochement sur le R-270 : la route mène à la station."), G.left, 864, 816, 104),
        SHAPE("rect", 960, 312, 2, 600, { fill: "line", stroke: null }),
        T("eyebrow", L("After: FROM", "Après : FROM"), 984, 312, 816, 32, { color: "muted", reveal: 1 }),
        INST(HSI, L("HSI after the station: FROM", "HSI après la station : FROM"), 1152, 360, 480, 480, { scene: o.scene, reveal: { order: 1 } }),
        T("body", L("Outbound on R-090: same OBS, the flag says FROM.", "En éloignement sur le R-090 : même OBS, le drapeau indique FROM."), 984, 864, 816, 104, { reveal: 1 }),
      ];
    // ---------------------------------------------------------------- A7 step sequence (vertical)
    case "stepByStep": {
      const rows: [string, string, string, string][] = [
        ["Turn", "Virer", "to the outbound or entry heading", "vers le cap d’éloignement ou d’entrée"],
        ["Time", "Chrono", "start the timer at the fix or abeam", "déclenchez le chrono au repère ou au travers"],
        ["Twist", "Tourner", "set the inbound course on the OBS", "affichez la route de rapprochement à l’OBS"],
        ["Throttle", "Puissance", "holding speed, 90 KIAS here", "vitesse d’attente, 90 KIAS ici"],
        ["Talk", "Parler", "report entering the hold if asked", "annoncez l’entrée en attente si demandé"],
      ];
      return [
        ...header(L("At the holding fix", "Au repère d’attente"), title(o, "The five Ts", "Les cinq T"), 960),
        ...rows.flatMap(([he, hf, be, bf], i): SlideBlock[] => {
          const y = 312 + i * 136;
          const g = `t${i + 1}`;
          return [
            MARK(i + 1, G.left + 28, y + 36, { size: 56, reveal: i + 1, group: g }),
            T("heading", L(he, hf), 200, y, 736, 56, { reveal: i + 1, group: g }),
            T("small", L(be, bf), 200, y + 64, 736, 48, { reveal: i + 1, group: g }),
          ];
        }),
        INST(HSI, L("HSI", "HSI"), 1080, 264, 720, 720, { scene: o.scene }),
      ];
    }
    // ---------------------------------------------------------------- A8 formula derivation
    case "formula": {
      const lines: [string, string][] = [
        ["error | = 60 × [4/30] = !8°!", "erreur | = 60 × [4/30] = !8°!"],
        ["close | = 60 × [4/40] = !6°!", "rejoindre | = 60 × [4/40] = !6°!"],
        ["turn | = 8° + 6° = !14°!", "virage | = 8° + 6° = !14°!"],
      ];
      return [
        ...header(L("Track error", "Erreur de route"), title(o, "The 1 in 60 rule", "La règle du 1 sur 60")),
        T("lead", L("At 60 NM from the fix, 1 NM off is 1°.", "À 60 NM du repère, 1 NM d’écart vaut 1°."), G.left, G.leadY, 1104, 56),
        {
          ...base("d", G.left, 368, 960, 568, { alt: L("The 1 in 60 triangle", "Le triangle du 1 sur 60") }),
          kind: "diagram",
          d: { kind: "calc", calc: { kind: "sixtyToOne", course: 90, flownNm: 30, offNm: 4, toGoNm: 40, drag: ["aircraft"] } },
          interactive: true,
          caption: L("Drag the aircraft: the angles follow", "Déplacez l’avion : les angles suivent"),
        },
        T("eyebrow", L("The formula", "La formule"), 1176, 352, 624, 32, { color: "muted" }),
        T("formula", L("{angle} = 60 × [{off}/{distance}]", "{angle} = 60 × [{écart}/{distance}]"), 1176, 400, 624, 136),
        T("small", L("angle in degrees · off and distance in NM", "angle en degrés · écart et distance en NM"), 1176, 552, 624, 40),
        rule(1176, 624, 624),
        ...lines.map(([en, fr], i) => T("formula", L(en, fr), 1176, 656 + i * 112, 624, 104, { reveal: i + 1 })),
        footSource(L("FAA IFH ch. 9 · why 60: a radian is 57.3°, rounded for mental maths", "FAA IFH ch. 9 · pourquoi 60 : un radian vaut 57,3°, arrondi pour le calcul mental")),
      ];
    }
    // ---------------------------------------------------------------- A9 quiz on the slide
    case "quiz":
      return [
        ...header(L("Elements of the clearance", "Éléments de la clairance"), title(o, "Read the clearance", "Lire la clairance")),
        T(
          "quote",
          L("“Hold east of ARD on the 090 radial, maintain 3,000 ft, expect further clearance at 1430.”", "« Attendez à l’est d’ARD sur le radial 090, maintenez 3 000 ft, autorisation ultérieure prévue à 1430. »"),
          G.left,
          312,
          1560,
          144,
        ),
        {
          ...base("q", G.left, 504, 1680, 480, { z: 2 }),
          kind: "quiz",
          quiz: {
            kind: "mcq",
            prompt: L("So the inbound course is…", "La route de rapprochement est donc…"),
            options: [{ text: L("270", "270") }, { text: L("090", "090") }, { text: L("360", "360") }],
            answer: 0,
            explain: L("The 090 radial leaves ARD to the east: you hold on it and fly back to ARD on 270.", "Le radial 090 part d’ARD vers l’est : on attend sur cet axe et on revient vers ARD au 270."),
          },
        },
        footSource(L("FAA AIM 5-3-8", "FAA AIM 5-3-8")),
      ];
    // ---------------------------------------------------------------- A10 recap
    case "recap": {
      const cols: [string, string, string][] = [
        ["1:00", "inbound, up to 14,000 ft", "en rapprochement, jusqu’à 14 000 ft"],
        ["×3", "the drift correction, outbound", "la correction de dérive, en éloignement"],
        ["200", "KIAS at most, up to 6,000 ft (FAA)", "KIAS au maximum jusqu’à 6 000 ft (FAA)"],
      ];
      const checks: [string, string][] = [
        ["Entry from your course to the fix", "Entrée selon votre route vers le repère"],
        ["Timer abeam the fix", "Chrono au travers du repère"],
        ["Adjust the outbound leg each lap", "Ajustez l’éloignement à chaque tour"],
      ];
      return [
        ...header(L("Keys to success", "Clés du succès"), title(o, "Before you fly the hold", "Avant de voler l’attente")),
        ...cols.flatMap(([n, en, fr], i): SlideBlock[] => [
          T("number", L(n, n), G.x(i * 4), 320, 528, 176),
          rule(G.x(i * 4), 536, 528),
          T("body", L(en, fr), G.x(i * 4), 560, 528, 104),
        ]),
        T("eyebrow", L("Every lap", "À chaque tour"), G.left, 760, 1680, 32, { color: "muted" }),
        ...checks.map(([en, fr], i): SlideBlock => ({
          ...base("k", G.x(i * 4), 808, 528, 152),
          kind: "checklist",
          title: L("", ""),
          rows: [{ text: L(en, fr) }],
        })),
        footSource(L("FAA AIM 5-3-8 · FIG 5-3-8", "FAA AIM 5-3-8 · FIG 5-3-8")),
      ];
    }
    // ---------------------------------------------------------------- A11 "Ready to fly"
    case "ready": {
      const obj: [string, string][] = [
        ["Pick the entry from your course to PA", "Déterminer l’entrée selon votre route vers PA"],
        ["Fly the entry and settle inbound on 270", "Voler l’entrée et s’établir en rapprochement au 270"],
        ["Adjust the outbound leg for 1:00 inbound", "Ajuster l’éloignement pour 1:00 en rapprochement"],
        ["Stay on the holding side, ±100 ft", "Rester côté attente, à ±100 ft"],
      ];
      const std: [L10n, string, string, ColorToken][] = [
        [L("±100 ft", "±100 ft"), "altitude", "altitude", "key"],
        [L("±15 s", "±15 s"), "on 1:00 inbound", "sur 1:00 en rapprochement", "key"],
        [L("<0.6 NM", "<0,6 NM"), "non-holding side", "côté non-attente", "key"],
        [L("Entry", "Entrée"), "as the AIM says", "conforme à l’AIM", "nav"],
      ];
      return [
        ...header(L("Before the flight", "Avant le vol"), title(o, "Ready to fly", "Prêt à voler")),
        T("eyebrow", L("What you will do", "Ce que vous allez faire"), G.left, 320, 816, 32, { color: "muted" }),
        ...obj.flatMap(([en, fr], i): SlideBlock[] => [
          MARK(i + 1, G.left + 28, 400 + i * 112 + 4, { size: 56 }),
          T("body", L(en, fr), 200, 376 + i * 112, 736, 96),
        ]),
        T("eyebrow", L("To pass", "Pour réussir"), 1128, 320, 672, 32, { color: "muted" }),
        ...std.flatMap(([n, en, fr, col], i): SlideBlock[] => {
          const x = 1128 + (i % 2) * 360;
          const y = 376 + Math.floor(i / 2) * 224;
          return [
            T("number", n, x, y, 312, 104, { color: col }),
            T("small", L(en, fr), x, y + 112, 312, 80),
          ];
        }),
        rule(G.left, 864, 1680),
        T("body", L("Five Ts at the fix · 90 KIAS · wind 220/15: triple the correction outbound.", "Cinq T au repère · 90 KIAS · vent 220/15 : triplez la correction en éloignement."), G.left, 888, 1680, 56),
      ];
    }
    // ---------------------------------------------------------------- the earlier templates, on the grid
    case "title":
      return [
        T("eyebrow", L("Ground school · Instrument rating", "Théorie · Qualification de vol aux instruments"), G.left, G.eyebrowY, 960, 32),
        T("display", title(o, "Holding patterns, flown and understood", "Les attentes, comprises et pilotées"), G.left, 288, 912, 360, { valign: "bottom" }),
        T("lead", o.subtitle ?? L("Entries, timing and wind correction — then fly one at ARD", "Entrées, chronométrage et correction de vent — puis une attente à ARD"), G.left, 680, 864, 112),
        T("foot", o.byline ?? L("Aéroclub Ardon · J. Martin, CFII", "Aéroclub Ardon · J. Martin, FI(A) IR"), G.left, 912, 864, 32),
        IMG({ lib: "photo:in-cloud" }, L("A Cessna 172 flying in cloud", "Un Cessna 172 dans les nuages"), 1128, 0, 792, 1080, {
          attribution: "Photo: Matthias Wesselmann / Unsplash",
        }),
      ];
    case "twoColumn":
      return [
        ...header(L("Compare", "Comparer"), title(o, "Precision and non-precision approaches", "Approches de précision et classiques"), 1680),
        rule(G.left, 312, 816),
        T("heading", L("ILS: decision altitude", "ILS : altitude de décision"), G.left, 344, 816, 56),
        T("body", L("- Lateral **and** vertical guidance\n- At DA: land or go around\n- Minimums: DA(H), RVR", "- Guidage latéral **et** vertical\n- À la DA : atterrir ou remettre les gaz\n- Minima : DA(H), RVR"), G.left, 424, 816, 288),
        rule(984, 312, 816),
        T("heading", L("VOR or NDB: MDA", "VOR ou NDB : MDA"), 984, 344, 816, 56),
        T("body", L("- Lateral guidance only\n- Level off at MDA, fly to the MAP\n- Leave MDA with the runway in sight", "- Guidage latéral seulement\n- Palier à la MDA jusqu’au MAPt\n- Quitter la MDA piste en vue"), 984, 424, 816, 288),
      ];
    case "fullBleed":
      return [
        T("eyebrow", L("Weather", "Météo"), G.left, 704, 960, 32, { color: "white" }),
        T("display", title(o, "In cloud, the instruments are the horizon", "Dans les nuages, les instruments sont l’horizon"), G.left, 744, 1392, 168, { color: "white", valign: "bottom" }),
        T("lead", L("Trust the scan, not the seat of your pants.", "Faites confiance au circuit visuel, pas à vos sensations."), G.left, 920, 1392, 56, { color: "white" }),
      ];
    case "checklist":
      return [
        ...header(L("Your turn", "À vous"), title(o, "Do this on the instrument", "À faire sur l’instrument"), 960),
        {
          ...base("k", G.left, G.bodyNoLead, 816, 480),
          kind: "checklist",
          title: L("Do this", "À faire"),
          rows: [
            { text: L("Set the OBS to 090 with a TO flag", "Affichez 090 à l’OBS, indicateur TO"), check: 0, readout: "obs1" },
            { text: L("Turn to heading 120", "Prenez le cap 120"), check: 1, readout: "hdg" },
            { text: L("Bar within 1 dot", "Barre à moins d’un point"), check: 2, readout: "cdiDots" },
          ],
        },
        INST(HSI, L("HSI", "HSI"), 1080, 264, 720, 720, { scene: o.scene }),
      ];
    case "yourTurn":
      return [
        INST(HSI, L("HSI", "HSI"), G.left, 120, 840, 840, {
          scene: o.scene,
          mode: "live",
          controls: ["obs1", "hdgBug"],
          yourTurn: {
            where: "slide",
            prompt: L("Centre the needle with a TO flag", "Centrez l’aiguille avec l’indicateur TO"),
            controls: ["obs1", "hdgBug"],
            goal: {
              all: [
                { id: "toFrom", p: { value: "TO" } },
                { id: "cdiDefl", p: { maxDots: 0.5 } },
              ],
              graded: false,
            },
          },
        }),
        T("eyebrow", L("Your turn", "À vous"), 1128, 120, 672, 32),
        T("title", title(o, "Find the radial you are on", "Trouvez votre radiale"), 1128, 160, 672, 152),
        {
          ...base("k", 1128, 360, 672, 336),
          kind: "checklist",
          rows: [
            { text: L("Turn the OBS until the bar centres", "Tournez l’OBS jusqu’à centrer la barre"), check: 1, readout: "cdiDots" },
            { text: L("With a TO flag", "Avec l’indicateur TO"), check: 0, readout: "toFrom" },
          ],
        },
        T(
          "small",
          L("The course under the pointer is the bearing TO the station: its reciprocal is your radial.", "La route sous l’aiguille est le relèvement VERS la station : son inverse est votre radiale."),
          1128,
          744,
          672,
          120,
        ),
      ];
    case "calc":
      return [
        ...header(L("Maths for IFR", "Maths pour l’IFR"), title(o, "Where do I start down?", "Où commencer la descente ?")),
        {
          ...base("q", G.left, G.bodyNoLead, 672, 672),
          kind: "calc",
          calc: { generatorId: "ifr.topOfDescent" },
          show: ["prompt", "givens"],
        },
        {
          ...base("d", 840, G.bodyNoLead, 960, 520, { alt: L("Descent profile, 3°", "Profil de descente, 3°") }),
          kind: "diagram",
          d: { kind: "calc", calc: { kind: "profile", fromFt: 6000, toFt: 2000, angleDeg: 3, gsKt: 120 } },
        },
        T("formula", L("{distance} = [{altitude to lose}/318]", "{distance} = [{altitude à perdre}/318]"), 840, 856, 960, 128),
        footSource(L("A 3° path is about 318 ft per NM (FAA IFH ch. 10).", "Une pente de 3° fait environ 318 ft par NM (FAA IFH ch. 10).")),
      ];
    case "blank":
    default:
      return [];
  }
}
