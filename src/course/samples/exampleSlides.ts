// The gallery of ready example slides (« Modèles » of the studio, « Que voulez-vous montrer ? » of an empty slide,
// and the starting templates of a new course). One idea per slide: a title that says it, one to three short lines,
// the right instrument drawn by the simulator's own renderers and moving with a named animation (canvas/motion.ts),
// a numbered dot that appears on the dial when the needle reaches the value its line names, the source in small
// type. Every number comes from the C172S POH, the FAA handbooks (AFH, PHAK, IFH, AIM) or EASA, cited on the slide.
// The situations are the ready situations of the situation editor (course/situations.ts), so a creator who opens
// one finds the names they already know.
import type {
  Annotation,
  GoalCheck,
  InstrumentMotion,
  InstrumentView,
  L10n,
  MotionScript,
  Pt,
  SimScene,
  SlideBlock,
  SlideCanvas,
  StageControl,
} from "../types";
import {
  READY_SITUATIONS,
  sceneOfSituation,
  type Situation,
} from "../situations";
import { STEAM_GAUGE_LAYOUT, type SteamGaugeKind } from "../../avionics/steam";
import { DEFAULT_GRID } from "../canvas/geom";
import { G, INST, L, MARK, SHAPE, T, onInstrument } from "../canvas/layouts";
import { CHECKLIST, QUIZ, SAMPLE_AUTHOR, SAMPLE_DATE } from "./kit";
import type { Course, Step } from "../types";

// ------------------------------------------------------------------ the groups of the gallery
export type GalleryGroup = "start" | "ppl" | "nav" | "ifr" | "engage";
export const GALLERY_GROUPS: { id: GalleryGroup; title: L10n }[] = [
  { id: "start", title: L("Getting started", "Commencer") },
  { id: "ppl", title: L("PPL flying", "Pilotage PPL") },
  { id: "nav", title: L("Navigation", "Navigation") },
  { id: "ifr", title: L("IFR", "IFR") },
  { id: "engage", title: L("Get the students involved", "Faire participer") },
];

export interface GallerySlide {
  id: string;
  group: GalleryGroup;
  title: L10n;
  /** one line on the card: what the student sees move */
  what: L10n;
  slide: SlideCanvas;
}

// ------------------------------------------------------------------ the situations
const SIT = (id: string): Situation => {
  const r = READY_SITUATIONS.find((s) => s.id === id);
  if (!r) throw new Error(`ready situation ${id}`);
  return JSON.parse(JSON.stringify(r.sit)) as Situation;
};
const sceneOf = (id: string, sit: Situation, label: string): SimScene => ({
  ...sceneOfSituation(sit, { id, label }),
  cockpit: "steam",
});
/** The situations the gallery's slides show (added to the course with the slide). */
export function galleryScenes(): Record<string, SimScene> {
  const off = { ...SIT("level"), hdg: 240 };
  const obs = { ...SIT("vor-inbound"), obs1: 220, obs2: 220 };
  const list: SimScene[] = [
    sceneOf("gx.level", SIT("level"), "Level 3,000 ft · 100 kt · heading 270"),
    sceneOf("gx.climb", SIT("climb"), "Climb at VY · 74 kt"),
    sceneOf("gx.descent", SIT("descent"), "Descent 500 ft/min · 100 kt"),
    sceneOf("gx.ils", SIT("ils27"), "ILS 27 PARD · 5 NM"),
    sceneOf("gx.vor", SIT("vor-inbound"), "ARD R-090 inbound · course 270"),
    sceneOf("gx.intercept", SIT("vor-intercept"), "ARD R-100 · heading 300"),
    sceneOf("gx.ndb", SIT("ndb-abeam"), "Abeam PA NDB · heading 360"),
    sceneOf("gx.hdg", off, "Level 3,000 ft · heading 240"),
    sceneOf("gx.obs", obs, "ARD R-090 · OBS 220"),
  ];
  return Object.fromEntries(list.map((s) => [s.id, s]));
}

// ------------------------------------------------------------------ building blocks
const SIX: InstrumentView = { kind: "six" };
const gauge = (g: SteamGaugeKind): InstrumentView => ({
  kind: "gauge",
  gauge: g,
});
const canvas = (
  blocks: SlideBlock[],
  scene: string,
  layout: SlideCanvas["layout"] = "instrumentNotes",
): SlideCanvas => ({
  size: { w: 1920, h: 1080 },
  grid: DEFAULT_GRID,
  layout,
  scene,
  blocks,
});
/** the source line, in small type (its width leaves the bottom right corner free for the editor's note) */
const foot = (t: L10n): SlideBlock => T("foot", t, G.left, G.foot, 1080, 32);
const rule = (
  x: number,
  y: number,
  w: number,
  e: { reveal?: number; group?: string } = {},
): SlideBlock =>
  SHAPE("line", x, y - 8, w, 16, {
    stroke: "line",
    strokeW: 2,
    ...(e.reveal ? { reveal: { order: e.reveal } } : {}),
    ...(e.group ? { group: e.group } : {}),
  });
/** a point of a steam gauge of the source drawing, from its centre in radii (dx right, dy down) */
const onGauge = (g: SteamGaugeKind, dx: number, dy: number): Pt => {
  const k = STEAM_GAUGE_LAYOUT[g];
  return [Math.round(k.cx + dx * k.r), Math.round(k.cy + dy * k.r)];
};

/** A numbered dot on the instrument that appears when the animation reaches its moment (and the line it explains). */
interface Dot {
  /** where on the dial: a gauge and a point in radii (default: the gauge's top-left shoulder) */
  g: SteamGaugeKind;
  at?: [number, number];
  /** the animation's mark (canvas/motion.ts) */
  moment: string;
}
interface Line {
  text: L10n;
  dot?: Dot;
}
export interface IdeaOpts {
  id: string;
  group: GalleryGroup;
  eyebrow: L10n;
  title: L10n;
  what: L10n;
  lines: Line[];
  source: L10n;
  view: InstrumentView;
  alt: L10n;
  scene: string;
  motion: InstrumentMotion;
}
const motionOf = (m: InstrumentMotion): InstrumentMotion =>
  JSON.parse(JSON.stringify(m)) as InstrumentMotion;

/** an instrument that plays an animation (canvas/motion.ts) */
const withMotion = (b: SlideBlock, m: InstrumentMotion): SlideBlock =>
  b.kind === "instrument" ? { ...b, motion: JSON.parse(JSON.stringify(m)) as InstrumentMotion } : b;

/** One idea: the words on the left, the moving instrument on the right. */
export function ideaSlide(o: IdeaOpts): GallerySlide {
  const six = o.view.kind !== "gauge";
  const [ix, iy, iw, ih] = six ? [960, 216, 840, 630] : [1032, 136, 768, 768];
  const colW = six ? 760 : 840;
  const annotations: Annotation[] = [];
  let n = 0;
  const rows = o.lines.slice(0, 3).flatMap((l, i): SlideBlock[] => {
    const y = 352 + i * 176;
    const g = `l${i + 1}`;
    if (!l.dot)
      return [
        rule(G.left, y, colW - 48, { group: g }),
        T("body", l.text, G.left, y + 16, colW - 48, 136, { group: g }),
      ];
    n += 1;
    const at = l.dot.at ?? [-0.78, -0.78];
    annotations.push({
      id: `${o.id}.d${n}`,
      pane: 0,
      type: "callout",
      n,
      at: onGauge(l.dot.g, at[0], at[1]),
      text: l.text,
      moment: l.dot.moment,
    });
    return [
      MARK(n, G.left + 28, y + 44, { size: 56, group: g }),
      T("body", l.text, G.left + 88, y + 8, colW - 136, 136, { group: g }),
    ];
  });
  const inst: SlideBlock = withMotion(INST(o.view, o.alt, ix, iy, iw, ih, {
      id: `${o.id}.inst`,
      scene: o.scene,
      ...(annotations.length ? { annotations } : {}),
    }), motionOf(o.motion));
  return {
    id: o.id,
    group: o.group,
    title: o.title,
    what: o.what,
    slide: canvas(
      [
        T("eyebrow", o.eyebrow, G.left, G.eyebrowY, colW - 48, 32),
        T("title", o.title, G.left, G.titleY, colW - 48, 168),
        ...rows,
        inst,
        foot(o.source),
      ],
      o.scene,
    ),
  };
}

// ------------------------------------------------------------------ short animations of the gallery's own
/** A climbing turn to the right: 500 ft/min at 80 KIAS, standard rate (FAA IFH ch. 6, climbing turns). */
const CLIMBING_TURN: MotionScript = {
  duration: 30,
  tracks: {
    turn: [
      [0, 0],
      [3, 3],
      [26, 3],
      [29, 0],
      [30, 0],
    ],
    vs: [
      [0, 0],
      [4, 500],
      [26, 500],
      [30, 0],
    ],
    ias: [
      [0, 100],
      [5, 80],
      [25, 80],
      [30, 95],
    ],
    rpm: [
      [0, 2300],
      [3, 2500],
      [27, 2500],
      [30, 2300],
    ],
  },
  telling: 14,
};
/** A 30° intercept of the 270 course to ARD (FAA IFH ch. 9): the bar leaves the edge, the turn starts when it
 *  moves, it centres on the course. Same shape as the localizer capture, on a VOR (full scale 10°). */
export const VOR_INTERCEPT: MotionScript = {
  duration: 40,
  hdgRef: "course",
  tracks: {
    cdi: [
      [0, 1],
      [8, 1],
      [18, 0.55],
      [28, 0.08],
      [34, 0],
      [40, 0],
    ],
    hdg: [
      [0, 30],
      [16, 30],
      [28, 6],
      [34, 0],
      [40, 0],
    ],
    alt: [[0, 0]],
    vs: [[0, 0]],
    ias: [[0, 100]],
  },
  telling: 20,
  marks: [
    {
      id: "move",
      channel: "cdi",
      value: 0.6,
      label: L(
        "The bar moves: start the turn",
        "La barre bouge : on commence le virage",
      ),
    },
    {
      id: "on",
      channel: "cdi",
      value: 0.05,
      label: L(
        "Centred: heading 270, on the course",
        "Centrée : cap 270, sur la route",
      ),
    },
  ],
};

// ------------------------------------------------------------------ Commencer
export interface CoverOpts {
  id: string;
  eyebrow: L10n;
  title: L10n;
  sub: L10n;
  lead: L10n;
  source: L10n;
  view: InstrumentView;
  alt: L10n;
  scene: string;
  motion: InstrumentMotion;
}
/** A cover: the course title, one line, a live instrument playing an animation in a loop. */
export function coverSlide(o: CoverOpts): SlideCanvas {
  const six = o.view.kind !== "gauge";
  const [ix, iy, iw, ih] = six ? [936, 228, 864, 648] : [1080, 168, 720, 720];
  return canvas(
    [
      T("eyebrow", o.eyebrow, G.left, G.eyebrowY, 720, 32),
      T("display", o.title, G.left, 248, 744, 312, { valign: "bottom" }),
      T("heading", o.sub, G.left, 584, 744, 112, { color: "ink2" }),
      T("lead", o.lead, G.left, 728, 744, 120),
      withMotion(INST(o.view, o.alt, ix, iy, iw, ih, { id: `${o.id}.inst`, scene: o.scene }), { ...o.motion, loop: true }),
      foot(o.source),
    ],
    o.scene,
    "cover",
  );
}
export interface ObjectivesOpts {
  id: string;
  items: L10n[];
  source: L10n;
  view: InstrumentView;
  alt: L10n;
  scene: string;
  motion: InstrumentMotion;
}
/** Three goals, each with a number, revealed one by one; a small instrument plays the lesson's animation. */
export function objectivesSlide(o: ObjectivesOpts): SlideCanvas {
  return canvas(
    [
      T("eyebrow", L("Lesson goals", "Objectifs de la leçon"), G.left, G.eyebrowY, 960, 32),
      T("title", L("What you will be able to do", "Ce que vous saurez faire"), G.left, G.titleY, 960, 168),
      ...o.items.slice(0, 3).flatMap((t, i): SlideBlock[] => [
        MARK(i + 1, G.left + 28, 400 + i * 160, { size: 56, reveal: i + 1, group: `o${i}` }),
        T("body", t, G.left + 88, 368 + i * 160, 880, 104, { valign: "middle", reveal: i + 1, group: `o${i}` }),
      ]),
      withMotion(INST(o.view, o.alt, 1152, 216, 648, o.view.kind === "gauge" ? 648 : 486, { id: `${o.id}.inst`, scene: o.scene }), {
        ...o.motion,
        loop: true,
      }),
      foot(o.source),
    ],
    o.scene,
    "ready",
  );
}
export interface RecapOpts {
  title: L10n;
  /** the big figure (FR and EN may differ: « 1,41 g » / "1.41 g") and its line */
  cols: [L10n, L10n][];
  source: L10n;
}
/** Takeaways: three numbers and what each means, revealed one by one. */
export function recapSlide(o: RecapOpts): SlideCanvas {
  return canvas(
    [
      T("eyebrow", L("Takeaways", "À retenir"), G.left, G.eyebrowY, 1392, 32),
      T("title", o.title, G.left, G.titleY, 1392, 168),
      ...o.cols.slice(0, 3).flatMap(([n, t], i): SlideBlock[] => [
        T("number", n, G.x(i * 4), 360, 528, 176, { reveal: i + 1, group: `c${i}` }),
        rule(G.x(i * 4), 568, 528, { reveal: i + 1, group: `c${i}` }),
        T("body", t, G.x(i * 4), 592, 528, 152, { reveal: i + 1, group: `c${i}` }),
      ]),
      foot(o.source),
    ],
    "gx.level",
    "recap",
  );
}
export interface QuizOpts {
  id: string;
  title: L10n;
  options: L10n[];
  answer: number;
  explain: L10n;
  source: L10n;
  view: InstrumentView;
  alt: L10n;
  scene: string;
  motion: InstrumentMotion;
}
/** A question to the class: the question is the title, answers as tiles, the instrument plays beside it. */
export function quizSlide(o: QuizOpts): SlideCanvas {
  return canvas(
    [
      T("eyebrow", L("Question", "Question"), G.left, G.eyebrowY, 960, 32),
      T("title", o.title, G.left, G.titleY, 960, 168),
      QUIZ(
        `${o.id}.q`,
        {
          kind: "mcq",
          prompt: L("Choose one answer", "Choisissez une réponse"),
          options: o.options.map((text) => ({ text })),
          answer: o.answer,
          explain: o.explain,
        },
        G.left,
        392,
        960,
        536,
      ),
      withMotion(
        INST(o.view, o.alt, 1176, o.view.kind === "gauge" ? 240 : 320, 624, o.view.kind === "gauge" ? 624 : 468, {
          id: `${o.id}.inst`,
          scene: o.scene,
        }),
        { ...o.motion, loop: true },
      ),
      foot(o.source),
    ],
    o.scene,
    "quiz",
  );
}

export const TURN_COVER: CoverOpts = {
  id: "gx-cover",
  eyebrow: L("Ground school · PPL", "Théorie · PPL"),
  title: L("Turning", "Les virages"),
  sub: L("Bank, rate of turn and load factor", "Inclinaison, taux de virage et facteur de charge"),
  lead: L("Watch the instruments, then take the controls.", "Regardez les instruments, puis prenez les commandes."),
  source: L("FAA AFH ch. 3 · C172S POH", "FAA AFH ch. 3 · POH C172S"),
  view: SIX,
  alt: L("Six flight instruments in a standard-rate turn", "Six instruments de vol dans un virage standard"),
  scene: "gx.level",
  motion: { preset: "turn-std" },
};
function cover(): GallerySlide {
  return {
    id: "gx-cover",
    group: "start",
    title: L("Course cover", "Couverture du cours"),
    what: L("The title, one line, a live instrument turning", "Le titre, une phrase, un instrument qui vire"),
    slide: coverSlide(TURN_COVER),
  };
}
function objectives(): GallerySlide {
  return {
    id: "gx-objectives",
    group: "start",
    title: L("What you will be able to do", "Ce que vous saurez faire"),
    what: L("Three goals, each with a number", "Trois objectifs, chacun avec un chiffre"),
    slide: objectivesSlide({
      id: "gx-objectives",
      items: [
        L("Hold a heading within 10°", "Tenir un cap à 10° près"),
        L("Turn at standard rate: 3° a second", "Virer au taux standard : 3° par seconde"),
        L("Roll out on the heading you were given", "Sortir de virage sur le cap demandé"),
      ],
      source: L("EASA Part-FCL PPL syllabus · FAA AFH ch. 3", "Programme PPL EASA Part-FCL · FAA AFH ch. 3"),
      view: gauge("tc"),
      alt: L("Turn coordinator in a standard-rate turn", "Indicateur de virage dans un virage standard"),
      scene: "gx.level",
      motion: { preset: "turn-std" },
    }),
  };
}
function recap(): GallerySlide {
  return {
    id: "gx-recap",
    group: "start",
    title: L("Takeaways", "À retenir"),
    what: L("Three numbers to remember", "Trois chiffres à retenir"),
    slide: recapSlide({
      title: L("Three numbers for every turn", "Trois chiffres pour chaque virage"),
      cols: [
        [L("3°/s", "3°/s"), L("standard rate: 360° in 2 minutes", "taux standard : 360° en 2 minutes")],
        [L("≈ 15°", "≈ 15°"), L("of bank at 100 kt for standard rate", "d’inclinaison à 100 kt pour le taux standard")],
        [L("1.41 g", "1,41 g"), L("at 45° of bank: pull and add power", "à 45° d’inclinaison : tirer et remettre de la puissance")],
      ],
      source: L("FAA IFH ch. 4 · PHAK ch. 5", "FAA IFH ch. 4 · PHAK ch. 5"),
    }),
  };
}

// ------------------------------------------------------------------ Pilotage PPL
const PPL = L("Flying · PPL", "Pilotage · PPL");
function pplSlides(): GallerySlide[] {
  return [
    ideaSlide({
      id: "gx-asi-arcs",
      group: "ppl",
      eyebrow: L("Instruments · PPL", "Instruments · PPL"),
      title: L(
        "The airspeed indicator and its arcs",
        "L’anémomètre et ses arcs",
      ),
      what: L(
        "The needle sweeps, each arc lights as it passes",
        "L’aiguille balaie, chaque arc s’allume à son passage",
      ),
      lines: [
        {
          text: L(
            "**White arc**, up to 85 kt: flaps may be out",
            "**Arc blanc**, jusqu’à 85 kt : volets autorisés",
          ),
          dot: { g: "asi", at: [0.7, 0.26], moment: "vfe" },
        },
        {
          text: L(
            "**Yellow arc**, from 129 kt: smooth air only",
            "**Arc jaune**, dès 129 kt : air calme seulement",
          ),
          dot: { g: "asi", at: [-0.26, 0.7], moment: "vno" },
        },
        {
          text: L(
            "**Red line**, 163 kt: never exceed",
            "**Trait rouge**, 163 kt : à ne jamais dépasser",
          ),
          dot: { g: "asi", at: [-0.72, -0.1], moment: "vne" },
        },
      ],
      source: L(
        "C172S POH section 2 · airspeed indicator markings",
        "POH C172S section 2 · marquages de l’anémomètre",
      ),
      view: gauge("asi"),
      alt: L(
        "Airspeed indicator: the needle sweeps from 50 to 160 kt",
        "Anémomètre : l’aiguille va de 50 à 160 kt",
      ),
      scene: "gx.level",
      motion: { preset: "asi-arcs" },
    }),
    ideaSlide({
      id: "gx-turn-std",
      group: "ppl",
      eyebrow: PPL,
      title: L("The standard-rate turn", "Le virage standard"),
      what: L(
        "Bank, turn coordinator and heading move together",
        "Inclinaison, indicateur de virage et cap bougent ensemble",
      ),
      lines: [
        {
          text: L(
            "About **15° of bank** at 100 kt",
            "Environ **15° d’inclinaison** à 100 kt",
          ),
        },
        {
          text: L(
            "The turn coordinator on the mark: **3° a second**",
            "L’indicateur de virage sur le repère : **3° par seconde**",
          ),
          dot: { g: "tc", moment: "rate" },
        },
        {
          text: L("90° of heading in 30 seconds", "90° de cap en 30 secondes"),
        },
      ],
      source: L("FAA IFH ch. 4 · AFH ch. 3", "FAA IFH ch. 4 · AFH ch. 3"),
      view: SIX,
      alt: L(
        "Six instruments in a standard-rate turn to the right",
        "Six instruments dans un virage standard à droite",
      ),
      scene: "gx.level",
      motion: { preset: "turn-std" },
    }),
    ideaSlide({
      id: "gx-climb-vy",
      group: "ppl",
      eyebrow: PPL,
      title: L("Climbing at VY", "La montée à VY"),
      what: L(
        "Full power, the nose up, 74 kt, the variometer climbs",
        "Pleine puissance, le nez monte, 74 kt, le vario monte",
      ),
      lines: [
        {
          text: L(
            "Full power, then the attitude: **74 kt** is VY",
            "Pleine puissance, puis l’assiette : **74 kt**, c’est VY",
          ),
          dot: { g: "asi", moment: "vy" },
        },
        {
          text: L(
            "About **650 ft/min** at sea level",
            "Environ **650 ft/min** au niveau de la mer",
          ),
          dot: { g: "vsi", moment: "rate" },
        },
        {
          text: L(
            "The speed is held with the attitude, not the power",
            "La vitesse se tient à l’assiette, pas à la puissance",
          ),
        },
      ],
      source: L(
        "C172S POH sections 4 and 5 · FAA AFH ch. 3",
        "POH C172S sections 4 et 5 · FAA AFH ch. 3",
      ),
      view: SIX,
      alt: L(
        "Six instruments: from level flight to a climb at 74 KIAS",
        "Six instruments : du palier à la montée à 74 KIAS",
      ),
      scene: "gx.level",
      motion: { preset: "climb-vy" },
    }),
    ideaSlide({
      id: "gx-level-off",
      group: "ppl",
      eyebrow: PPL,
      title: L("Levelling off", "La mise en palier"),
      what: L(
        "Lead the altitude, nose down, speed builds, then power",
        "Anticiper, rendre la main, la vitesse monte, puis réduire",
      ),
      lines: [
        {
          text: L(
            "Lead by **10 % of the climb rate**: 65 ft for 650 ft/min",
            "Anticipez de **10 % du vario** : 65 ft pour 650 ft/min",
          ),
          dot: { g: "alt", moment: "lead" },
        },
        {
          text: L(
            "Lower the nose, let the speed build",
            "Rendez la main, laissez la vitesse monter",
          ),
        },
        {
          text: L(
            "Then reduce to **2,300 RPM**",
            "Puis réduisez à **2 300 tr/min**",
          ),
          dot: { g: "tc", at: [0.78, 0.78], moment: "power" },
        },
      ],
      source: L(
        "FAA AFH ch. 3 · C172S POH section 5",
        "FAA AFH ch. 3 · POH C172S section 5",
      ),
      view: SIX,
      alt: L(
        "Six instruments: from a climb to level flight",
        "Six instruments : de la montée au palier",
      ),
      scene: "gx.climb",
      motion: { preset: "level-off" },
    }),
    ideaSlide({
      id: "gx-turn-45",
      group: "ppl",
      eyebrow: PPL,
      title: L(
        "The 45° turn and the load factor",
        "Le virage à 45° et le facteur de charge",
      ),
      what: L(
        "Steep bank, back pressure, the stall speed rises",
        "Forte inclinaison, on tire, le décrochage monte",
      ),
      lines: [
        {
          text: L(
            "At **45°**, the load factor is **1.41 g**",
            "À **45°**, le facteur de charge est de **1,41 g**",
          ),
          dot: { g: "ai", moment: "bank45" },
        },
        {
          text: L(
            "Pull to stay level, add power to keep the speed",
            "Tirez pour rester en palier, remettez de la puissance",
          ),
        },
        {
          text: L(
            "The stall speed rises: **48 → 57 kt**",
            "La vitesse de décrochage monte : **48 → 57 kt**",
          ),
        },
      ],
      source: L(
        "FAA AFH ch. 9 · PHAK ch. 5 · C172S POH section 5",
        "FAA AFH ch. 9 · PHAK ch. 5 · POH C172S section 5",
      ),
      view: SIX,
      alt: L(
        "Six instruments in a 45° level turn",
        "Six instruments dans un virage en palier à 45°",
      ),
      scene: "gx.level",
      motion: { preset: "turn-45" },
    }),
    ideaSlide({
      id: "gx-stall",
      group: "ppl",
      eyebrow: PPL,
      title: L("Approaching the stall", "L’approche du décrochage"),
      what: L(
        "Power idle, the speed falls, the warning, the recovery",
        "Réduit, la vitesse baisse, l’alarme, la sortie",
      ),
      lines: [
        {
          text: L(
            "Power idle, hold the altitude: the speed falls",
            "Réduit, on tient l’altitude : la vitesse baisse",
          ),
        },
        {
          text: L(
            "The **stall warning** sounds 5 to 10 kt before",
            "L’**avertisseur** retentit 5 à 10 kt avant",
          ),
          dot: { g: "asi", moment: "warn" },
        },
        {
          text: L(
            "At **48 kt**: lower the nose, full power",
            "À **48 kt** : rendez la main, pleine puissance",
          ),
          dot: { g: "ai", moment: "stall" },
        },
      ],
      source: L(
        "C172S POH sections 2, 4 and 5 · FAA AFH ch. 5",
        "POH C172S sections 2, 4 et 5 · FAA AFH ch. 5",
      ),
      view: SIX,
      alt: L(
        "Six instruments: the speed falls to the stall, then the recovery",
        "Six instruments : la vitesse baisse jusqu’au décrochage, puis la sortie",
      ),
      scene: "gx.level",
      motion: { preset: "stall" },
    }),
    ideaSlide({
      id: "gx-descent-500",
      group: "ppl",
      eyebrow: PPL,
      title: L("Descending at 500 ft/min", "La descente à 500 ft/min"),
      what: L(
        "Power reduced, 100 kt held, the variometer at −500",
        "Puissance réduite, 100 kt tenus, le vario à −500",
      ),
      lines: [
        {
          text: L(
            "Reduce the power: the nose drops by itself",
            "Réduisez la puissance : le nez descend tout seul",
          ),
        },
        {
          text: L(
            "Hold **100 kt** with the attitude",
            "Tenez **100 kt** à l’assiette",
          ),
        },
        {
          text: L(
            "The variometer settles at **−500 ft/min**",
            "Le variomètre se stabilise à **−500 ft/min**",
          ),
          dot: { g: "vsi", moment: "vs" },
        },
      ],
      source: L(
        "FAA AFH ch. 3 · C172S POH section 5",
        "FAA AFH ch. 3 · POH C172S section 5",
      ),
      view: SIX,
      alt: L(
        "Six instruments: from level flight to a 500 ft/min descent",
        "Six instruments : du palier à une descente à 500 ft/min",
      ),
      scene: "gx.level",
      motion: { preset: "descent-500" },
    }),
    ideaSlide({
      id: "gx-power",
      group: "ppl",
      eyebrow: PPL,
      title: L("What the power does", "Les effets de la puissance"),
      what: L(
        "The RPM first, then the speed, then the attitude",
        "D’abord les tours, puis la vitesse, puis l’assiette",
      ),
      lines: [
        {
          text: L(
            "More power: the **RPM** rise first",
            "Plus de puissance : les **tours** montent d’abord",
          ),
          dot: { g: "tc", at: [0.78, 0.78], moment: "rpm" },
        },
        {
          text: L("Then the **speed** builds", "Puis la **vitesse** augmente"),
          dot: { g: "asi", moment: "speed" },
        },
        {
          text: L(
            "To stay level, lower the nose a little",
            "Pour rester en palier, baissez un peu le nez",
          ),
        },
      ],
      source: L("FAA AFH ch. 3", "FAA AFH ch. 3"),
      view: SIX,
      alt: L(
        "Six instruments: power added in level flight",
        "Six instruments : puissance ajoutée en palier",
      ),
      scene: "gx.level",
      motion: { preset: "power" },
    }),
    ideaSlide({
      id: "gx-compass",
      group: "ppl",
      eyebrow: L("Instruments · PPL", "Instruments · PPL"),
      title: L(
        "The compass and its turning errors",
        "Le compas et ses erreurs en virage",
      ),
      what: L(
        "A turn from north to south: the compass lags, then leads",
        "Un virage du nord au sud : le compas retarde, puis avance",
      ),
      lines: [
        {
          text: L(
            "Turning from **north**: the compass lags behind",
            "En virage au **nord** : le compas est en retard",
          ),
        },
        {
          text: L(
            "Through **west**: the compass agrees",
            "Au passage de l’**ouest** : le compas est juste",
          ),
          dot: { g: "hsi", moment: "west" },
        },
        {
          text: L(
            "Towards **south**: it leads. Trust the heading indicator",
            "Vers le **sud** : il est en avance. Fiez-vous au conservateur",
          ),
        },
      ],
      source: L(
        "FAA PHAK ch. 8 · magnetic compass",
        "FAA PHAK ch. 8 · compas magnétique",
      ),
      view: SIX,
      alt: L(
        "Six instruments and the compass in a turn from north to south",
        "Six instruments et le compas dans un virage du nord au sud",
      ),
      scene: "gx.level",
      motion: { preset: "compass" },
    }),
  ];
}

// ------------------------------------------------------------------ Navigation
const NAV = L("Radio navigation", "Radionavigation");
function navSlides(): GallerySlide[] {
  return [
    ideaSlide({
      id: "gx-vor-cross",
      group: "nav",
      eyebrow: NAV,
      title: L(
        "Crossing a VOR: TO, then FROM",
        "Le passage d’un VOR : TO puis FROM",
      ),
      what: L(
        "The flag flips over the station, the distance goes back up",
        "Le drapeau bascule à la verticale, la distance remonte",
      ),
      lines: [
        {
          text: L(
            "**TO**: the station is ahead",
            "**TO** : la station est devant",
          ),
          dot: { g: "cdi", moment: "to" },
        },
        {
          text: L(
            "Overhead, the flag flickers: hold the heading",
            "À la verticale, le drapeau hésite : gardez le cap",
          ),
          dot: { g: "cdi", at: [0.78, -0.78], moment: "over" },
        },
        {
          text: L(
            "**FROM**: the station is behind you",
            "**FROM** : la station est derrière vous",
          ),
          dot: { g: "cdi", at: [0.78, 0.78], moment: "from" },
        },
      ],
      source: L(
        "FAA IFH ch. 9 · VOR station passage",
        "FAA IFH ch. 9 · passage d’un VOR",
      ),
      view: gauge("cdi"),
      alt: L(
        "VOR indicator: TO, then the flag at the station, then FROM",
        "Indicateur VOR : TO, puis le drapeau à la verticale, puis FROM",
      ),
      scene: "gx.vor",
      motion: { preset: "vor-cross" },
    }),
    ideaSlide({
      id: "gx-vor-intercept",
      group: "nav",
      eyebrow: NAV,
      title: L("Intercepting a radial at 30°", "Intercepter un radial à 30°"),
      what: L(
        "Heading 300, the bar comes in, turn onto 270",
        "Cap 300, la barre arrive, on tourne au 270",
      ),
      lines: [
        {
          text: L(
            "Course 270 on the OBS, heading **300**: a 30° intercept",
            "Route 270 à l’OBS, cap **300** : interception à 30°",
          ),
        },
        {
          text: L(
            "When the bar **moves**, start the turn",
            "Quand la barre **bouge**, commencez le virage",
          ),
          dot: { g: "hsi", moment: "move" },
        },
        {
          text: L(
            "Bar centred: heading **270**, you are on the course",
            "Barre centrée : cap **270**, vous êtes sur la route",
          ),
          dot: { g: "hsi", at: [0.78, 0.78], moment: "on" },
        },
      ],
      source: L(
        "FAA IFH ch. 9 · intercepting a course",
        "FAA IFH ch. 9 · interception d’une route",
      ),
      view: gauge("hsi"),
      alt: L(
        "HSI: a 30° intercept of the 270 course to ARD",
        "HSI : interception à 30° de la route 270 vers ARD",
      ),
      scene: "gx.intercept",
      motion: { script: VOR_INTERCEPT },
    }),
    ideaSlide({
      id: "gx-adf",
      group: "nav",
      eyebrow: NAV,
      title: L("The ADF and the relative bearing", "L’ADF et le relèvement"),
      what: L(
        "The beacon on the right wing, a turn, the needle to the nose",
        "La balise sur l’aile droite, un virage, l’aiguille sur le nez",
      ),
      lines: [
        {
          text: L(
            "The needle points at the beacon: **090**, on the right wing",
            "L’aiguille montre la balise : **090**, sur l’aile droite",
          ),
          dot: { g: "rmi", moment: "abeam" },
        },
        {
          text: L(
            "Turn right by the same angle",
            "Virez à droite du même angle",
          ),
        },
        {
          text: L(
            "Needle **on the nose**: you fly to the beacon",
            "Aiguille **sur le nez** : vous allez vers la balise",
          ),
          dot: { g: "rmi", at: [0.78, -0.78], moment: "nose" },
        },
      ],
      source: L("FAA IFH ch. 9 · ADF", "FAA IFH ch. 9 · ADF"),
      view: gauge("rmi"),
      alt: L(
        "Bearing indicator: the NDB from the right wing to the nose",
        "Indicateur de relèvement : le NDB de l’aile droite au nez",
      ),
      scene: "gx.ndb",
      motion: { preset: "adf" },
    }),
  ];
}

// ------------------------------------------------------------------ IFR
const IFR = L("Instrument flying · IR", "Vol aux instruments · IR");
function scanSlide(): GallerySlide {
  const [x, y, w, h] = [960, 216, 840, 630];
  const mk = (g: SteamGaugeKind) =>
    onInstrument(SIX, x, y, w, h, onGauge(g, -0.78, -0.78));
  const order: [SteamGaugeKind, number][] = [
    ["ai", 1],
    ["asi", 2],
    ["alt", 2],
    ["tc", 3],
    ["hsi", 3],
    ["vsi", 3],
  ];
  const lines: L10n[] = [
    L(
      "**1 · The attitude** first: it is the centre of the scan",
      "**1 · L’horizon** d’abord : c’est le centre du circuit",
    ),
    L(
      "**2 · Speed and altitude**, back to the attitude each time",
      "**2 · Vitesse et altitude**, retour à l’horizon à chaque fois",
    ),
    L(
      "**3 · Turn, heading and variometer** confirm the picture",
      "**3 · Virage, cap et vario** confirment l’image",
    ),
  ];
  const inst: SlideBlock = withMotion(INST(
      SIX,
      L(
        "Six instruments in a climbing turn to the right",
        "Six instruments dans un virage en montée à droite",
      ),
      x,
      y,
      w,
      h,
      {
        id: "gx-scan.inst",
        scene: "gx.level",
      },
    ), { script: CLIMBING_TURN, loop: true });
  return {
    id: "gx-scan",
    group: "ifr",
    title: L("The instrument scan", "Le circuit visuel des instruments"),
    what: L(
      "A climbing turn, the scan lights up step by step",
      "Un virage en montée, le circuit s’allume étape par étape",
    ),
    slide: canvas(
      [
        T("eyebrow", IFR, G.left, G.eyebrowY, 712, 32),
        T(
          "title",
          L("The instrument scan", "Le circuit visuel des instruments"),
          G.left,
          G.titleY,
          712,
          168,
        ),
        ...lines.flatMap((t, i): SlideBlock[] => [
          rule(G.left, 352 + i * 176, 712, { reveal: i + 1, group: `s${i}` }),
          T("body", t, G.left, 368 + i * 176, 712, 136, {
            reveal: i + 1,
            group: `s${i}`,
          }),
        ]),
        inst,
        ...order.map(([g, step]) => {
          const [mx, my] = mk(g);
          return MARK(step, mx, my, {
            size: 60,
            reveal: step,
            color: step === 1 ? "accent" : "text",
          });
        }),
        foot(
          L(
            "FAA IFH ch. 6 · instrument cross-check",
            "FAA IFH ch. 6 · circuit visuel",
          ),
        ),
      ],
      "gx.level",
      "stepByStep",
    ),
  };
}
function ifrSlides(): GallerySlide[] {
  return [
    scanSlide(),
    ideaSlide({
      id: "gx-loc-capture",
      group: "ifr",
      eyebrow: IFR,
      title: L("Capturing the localizer", "La capture du localizer"),
      what: L(
        "30° to the axis, the bar leaves the edge, the turn, centred",
        "30° de l’axe, la barre quitte le bord, le virage, centrée",
      ),
      lines: [
        {
          text: L(
            "Heading 30° off the axis: the bar sits at the edge",
            "Cap à 30° de l’axe : la barre est en butée",
          ),
        },
        {
          text: L(
            "It **moves**: turn now, it comes fast",
            "Elle **bouge** : virez tout de suite, elle arrive vite",
          ),
          dot: { g: "hsi", moment: "move" },
        },
        {
          text: L(
            "Four times more sensitive than a VOR",
            "Quatre fois plus sensible qu’un VOR",
          ),
        },
      ],
      source: L("FAA IFH ch. 9 · AIM 1-1-9", "FAA IFH ch. 9 · AIM 1-1-9"),
      view: gauge("hsi"),
      alt: L(
        "HSI: capturing the localizer of runway 27",
        "HSI : capture du localizer de la piste 27",
      ),
      scene: "gx.ils",
      motion: { preset: "loc-capture" },
    }),
    ideaSlide({
      id: "gx-ils-glide",
      group: "ifr",
      eyebrow: IFR,
      title: L("Down the 3° glide path", "La descente sur le glide 3°"),
      what: L(
        "Above the path, more descent, the index centres",
        "Au-dessus du plan, plus de descente, l’index se centre",
      ),
      lines: [
        {
          text: L(
            "Index low: you are **above** the path",
            "Index en bas : vous êtes **au-dessus** du plan",
          ),
        },
        {
          text: L(
            "A little more descent, then hold it",
            "Un peu plus de descente, puis on la garde",
          ),
        },
        {
          text: L(
            "Centred near **−480 ft/min** at 90 kt: 5 × the speed",
            "Centré vers **−480 ft/min** à 90 kt : 5 × la vitesse",
          ),
          dot: { g: "cdi", moment: "on" },
        },
      ],
      source: L(
        "FAA IFH ch. 9 · ILS glide slope",
        "FAA IFH ch. 9 · alignement de descente ILS",
      ),
      view: gauge("cdi"),
      alt: L(
        "ILS indicator: the glide-path index comes to the centre",
        "Indicateur ILS : l’index du plan revient au centre",
      ),
      scene: "gx.ils",
      motion: { preset: "ils-glide" },
    }),
    ideaSlide({
      id: "gx-hold-timer",
      group: "ifr",
      eyebrow: IFR,
      title: L("The hold: heading and timer", "L’attente : cap et chronomètre"),
      what: L(
        "Standard rate, the clock runs, 45° in 15 seconds",
        "Taux standard, le chrono tourne, 45° en 15 secondes",
      ),
      lines: [
        {
          text: L(
            "Start the clock with the turn: **3° a second**",
            "Top chrono avec le virage : **3° par seconde**",
          ),
          dot: { g: "tc", moment: "start" },
        },
        {
          text: L(
            "**15 s** for 45°: roll out",
            "**15 s** pour 45° : on remet à plat",
          ),
          dot: { g: "hsi", moment: "stop" },
        },
        {
          text: L(
            "One minute inbound below 14,000 ft",
            "Une minute en rapprochement sous 14 000 ft",
          ),
        },
      ],
      source: L("FAA AIM 5-3-8 · IFH ch. 4", "FAA AIM 5-3-8 · IFH ch. 4"),
      view: SIX,
      alt: L(
        "Six instruments: a timed standard-rate turn",
        "Six instruments : un virage standard chronométré",
      ),
      scene: "gx.level",
      motion: { preset: "timed-turn" },
    }),
    ideaSlide({
      id: "gx-vacuum",
      group: "ifr",
      eyebrow: IFR,
      title: L("Vacuum failure", "La panne de dépression"),
      what: L(
        "Wings level, yet the attitude indicator tips slowly",
        "Ailes à plat, et pourtant l’horizon bascule lentement",
      ),
      lines: [
        {
          text: L(
            "The gyros slow down: the attitude indicator **tips** slowly",
            "Les gyroscopes ralentissent : l’horizon **bascule** lentement",
          ),
          dot: { g: "ai", moment: "tip" },
        },
        {
          text: L(
            "The turn coordinator is electric: **it stays right**",
            "L’indicateur de virage est électrique : **il reste juste**",
          ),
        },
        {
          text: L(
            "Cover the attitude indicator, fly on the others",
            "Masquez l’horizon, pilotez avec les autres",
          ),
        },
      ],
      source: L("FAA IFH ch. 6 · PHAK ch. 8", "FAA IFH ch. 6 · PHAK ch. 8"),
      view: SIX,
      alt: L(
        "Six instruments: the vacuum fails, the attitude indicator tips",
        "Six instruments : la dépression lâche, l’horizon bascule",
      ),
      scene: "gx.level",
      motion: { preset: "vacuum" },
    }),
  ];
}

// ------------------------------------------------------------------ Faire participer
const YOUR_TURN = L("Your turn", "À vous");
/** « À vous »: the goal in the title, the rows ticked live, the live instrument with its controls under it. */
function handsOn(o: {
  id: string;
  title: L10n;
  what: L10n;
  rows: {
    text: L10n;
    check: number;
    readout?: "hdg" | "alt" | "obs1" | "toFrom" | "cdiDots";
  }[];
  tip: L10n;
  source: L10n;
  view: InstrumentView;
  alt: L10n;
  scene: string;
  controls: StageControl[];
  prompt: L10n;
  goal: GoalCheck[];
  holdS?: number;
  success: L10n;
  hint: L10n;
}): GallerySlide {
  const six = o.view.kind !== "gauge";
  const [ix, iy, iw, ih] = six ? [960, 136, 840, 792] : [1080, 120, 720, 800];
  return {
    id: o.id,
    group: "engage",
    title: o.title,
    what: o.what,
    slide: canvas(
      [
        T("eyebrow", YOUR_TURN, G.left, G.eyebrowY, 768, 32),
        T("title", o.title, G.left, G.titleY, 768, 168),
        CHECKLIST(
          `${o.id}.checks`,
          o.rows.map((r) => ({
            text: r.text,
            check: r.check,
            ...(r.readout ? { readout: r.readout } : {}),
          })),
          G.left,
          352,
          768,
          80 * o.rows.length + 72,
          { title: L("Goal", "Objectif") },
        ),
        T("small", o.tip, G.left, 384 + 80 * o.rows.length + 72, 768, 120),
        INST(o.view, o.alt, ix, iy, iw, ih, {
          id: `${o.id}.inst`,
          scene: o.scene,
          mode: "live",
          controls: o.controls,
          yourTurn: {
            where: "slide",
            prompt: o.prompt,
            controls: o.controls,
            assist: { holdAlt: true, holdIas: true },
            goal: {
              all: o.goal,
              ...(o.holdS ? { holdS: o.holdS } : {}),
              graded: false,
              success: o.success,
            },
            hint: o.hint,
          },
        }),
        foot(o.source),
      ],
      o.scene,
      "yourTurn",
    ),
  };
}
function engageSlides(): GallerySlide[] {
  const quiz: GallerySlide = {
    id: "gx-quiz",
    group: "engage",
    title: L("A question for the class", "Une question à la classe"),
    what: L("Three answers as tiles, the turn plays beside it", "Trois réponses en tuiles, le virage tourne à côté"),
    slide: quizSlide({
      id: "gx-quiz",
      title: L("How much bank for a standard-rate turn at 100 kt?", "Quelle inclinaison pour un virage standard à 100 kt ?"),
      options: [L("5°", "5°"), L("15°", "15°"), L("30°", "30°")],
      answer: 1,
      explain: L(
        "About 15°: the speed ÷ 10 + 7 gives 17°, a good first guess. Then put the turn coordinator on its mark.",
        "Environ 15° : la vitesse ÷ 10 + 7 donne 17°, un bon point de départ. Puis on met l’indicateur de virage sur son repère.",
      ),
      source: L("FAA IFH ch. 4 · standard-rate turn", "FAA IFH ch. 4 · virage standard"),
      view: gauge("tc"),
      alt: L("Turn coordinator in a standard-rate turn", "Indicateur de virage dans un virage standard"),
      scene: "gx.level",
      motion: { preset: "turn-std" },
    }),
  };
  const flight: GallerySlide = {
    id: "gx-flight",
    group: "engage",
    title: L("A flight in the simulator", "Vol dans le simulateur"),
    what: L(
      "The student flies the whole cockpit, then comes back",
      "L’élève pilote tout le cockpit, puis revient au cours",
    ),
    slide: canvas(
      [
        T("eyebrow", YOUR_TURN, G.left, G.eyebrowY, 1392, 32),
        T(
          "title",
          L("Fly it in the simulator", "Volez-le dans le simulateur"),
          G.left,
          G.titleY,
          1392,
          168,
        ),
        T(
          "body",
          L(
            "Level at 3,000 ft, heading 270. Turn right onto **360** at standard rate, then hold it for 10 seconds.",
            "En palier à 3 000 ft, cap 270. Virez à droite au **360** au taux standard, puis tenez-le 10 secondes.",
          ),
          G.left,
          352,
          600,
          296,
        ),
        T(
          "small",
          L(
            "The course waits here. The result shows on this slide.",
            "Le cours attend ici. Le résultat s’affiche sur cette diapo.",
          ),
          G.left,
          688,
          600,
          104,
        ),
        {
          id: "gx-flight.sim",
          frame: { x: 816, y: 352, w: 984, h: 560, z: 1 },
          kind: "simViewport",
          scene: "gx.level",
          view: "cockpit",
          alt: L(
            "The simulator's cockpit, level at 3,000 ft",
            "Le cockpit du simulateur, en palier à 3 000 ft",
          ),
          yourTurn: {
            where: "sim",
            prompt: L(
              "Turn right onto heading 360 and hold it",
              "Virez à droite au cap 360 et tenez-le",
            ),
            goal: {
              all: [
                { id: "heading", p: { value: 360, tol: 10 } },
                { id: "altBand", p: { min: 2900, max: 3100 } },
              ],
              holdS: 10,
              graded: false,
              success: L(
                "Heading 360 held, altitude held.",
                "Cap 360 tenu, altitude tenue.",
              ),
            },
            durationS: 180,
            returnTo: "thisStep",
          },
        },
        foot(
          L("FAA AFH ch. 3 · level turns", "FAA AFH ch. 3 · virages en palier"),
        ),
      ],
      "gx.level",
      "yourTurn",
    ),
  };
  return [
    handsOn({
      id: "gx-hold-heading",
      title: L("Your turn: hold heading 270", "À vous : tenez le cap 270"),
      what: L(
        "The student banks with the slider and holds the heading",
        "L’élève incline avec le curseur et tient le cap",
      ),
      rows: [
        {
          text: L("Heading 270, ±5°", "Cap 270, ±5°"),
          check: 0,
          readout: "hdg",
        },
        {
          text: L("Altitude 3,000 ft, ±100 ft", "Altitude 3 000 ft, ±100 ft"),
          check: 1,
          readout: "alt",
        },
      ],
      tip: L(
        "Bank a little to the right, level the wings 5° before 270. Altitude and speed are held for you.",
        "Inclinez un peu à droite, remettez à plat 5° avant le 270. Altitude et vitesse sont tenues pour vous.",
      ),
      source: L(
        "FAA AFH ch. 3 · straight and level",
        "FAA AFH ch. 3 · vol rectiligne en palier",
      ),
      view: SIX,
      alt: L(
        "Live six instruments, level at 3,000 ft, heading 240",
        "Six instruments en direct, en palier à 3 000 ft, cap 240",
      ),
      scene: "gx.hdg",
      controls: ["bank"],
      prompt: L(
        "Your turn: take heading 270 and hold it",
        "À vous : prenez le cap 270 et tenez-le",
      ),
      goal: [
        { id: "heading", p: { value: 270, tol: 5 } },
        { id: "altBand", p: { min: 2900, max: 3100 } },
      ],
      holdS: 10,
      success: L(
        "Heading 270 held for 10 seconds.",
        "Cap 270 tenu 10 secondes.",
      ),
      hint: L(
        "Small bank, small corrections: 5° of bank is enough.",
        "Petite inclinaison, petites corrections : 5° suffisent.",
      ),
    }),
    handsOn({
      id: "gx-set-obs",
      title: L(
        "Your turn: centre the needle with the OBS",
        "À vous : réglez l’OBS pour centrer l’aiguille",
      ),
      what: L(
        "The student turns the OBS until the bar centres, TO",
        "L’élève tourne l’OBS jusqu’à centrer la barre, TO",
      ),
      rows: [
        {
          text: L(
            "Bar centred, within half a dot",
            "Barre centrée, à moins d’un demi-point",
          ),
          check: 1,
          readout: "cdiDots",
        },
        {
          text: L("With a TO flag", "Avec l’indicateur TO"),
          check: 0,
          readout: "toFrom",
        },
      ],
      tip: L(
        "The course you read is the way TO the station. Its opposite is your radial.",
        "La route lue est le chemin VERS la station. Son inverse est votre radial.",
      ),
      source: L(
        "FAA IFH ch. 9 · VOR orientation",
        "FAA IFH ch. 9 · orientation VOR",
      ),
      view: gauge("hsi"),
      alt: L(
        "Live HSI, east of ARD, OBS on 220",
        "HSI en direct, à l’est d’ARD, OBS sur 220",
      ),
      scene: "gx.obs",
      controls: ["obs1"],
      prompt: L(
        "Your turn: centre the bar with a TO flag",
        "À vous : centrez la barre avec l’indicateur TO",
      ),
      goal: [
        { id: "toFrom", p: { value: "TO" } },
        { id: "cdiDefl", p: { maxDots: 0.5 } },
      ],
      holdS: 2,
      success: L(
        "Course 270 TO ARD: you are on the 090 radial.",
        "Route 270 vers ARD : vous êtes sur le radial 090.",
      ),
      hint: L(
        "Turn the OBS slowly towards the bar.",
        "Tournez l’OBS doucement vers la barre.",
      ),
    }),
    quiz,
    flight,
  ];
}

// ------------------------------------------------------------------ the gallery
let CACHE: GallerySlide[] | null = null;
/** Every slide of the gallery, in the order of its groups (fresh copies: the caller may change them). */
export function gallerySlides(): GallerySlide[] {
  CACHE ??= [
    cover(),
    objectives(),
    recap(),
    ...pplSlides(),
    ...navSlides(),
    ...ifrSlides(),
    ...engageSlides(),
  ];
  return JSON.parse(JSON.stringify(CACHE)) as GallerySlide[];
}
export function gallerySlide(id: string): GallerySlide | null {
  return gallerySlides().find((s) => s.id === id) ?? null;
}

/** The gallery as a course (one slide step each): the readability guard and the validator run over it. */
export function galleryCourse(): Course {
  const steps: Step[] = gallerySlides().map(
    (g): Step => ({
      id: g.id,
      kind: "slide",
      title: g.title,
      layout: "canvas",
      reader: [{ t: "heading", text: g.title }],
      slide: g.slide,
    }),
  );
  return {
    format: "ifr-course",
    version: 1,
    id: "gallery",
    rev: 1,
    updated: SAMPLE_DATE,
    title: L("Ready slides", "Diapos prêtes"),
    author: SAMPLE_AUTHOR,
    langs: ["en", "fr"],
    cockpit: "steam",
    world: { kind: "training" },
    steps,
    scenes: galleryScenes(),
    clips: {},
    assets: {},
    theme: "classroom",
  };
}
