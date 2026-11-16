// The starting template of each formation (« Nouveau cours », academy.html#new): a short course that shows, slide
// after slide, what the simulator brings to a lesson. Each slide does one thing the product does and no slide show
// does: the aircraft really flies on the cover (the outside view and the instruments, one aircraft), an instrument
// moves by itself, the instructor flies a demonstration while the class watches, the student takes the controls on
// the slide with a goal, the student flies in the simulator and comes back, a calculation the students drag. Each
// template uses different instruments (outside view, single gauges, six instruments, G1000 PFD and MFD, airliner
// PFD and ND, a calculation diagram), never the same picture twice.
//
// The cover takes the course's typed title; its line under the title is neutral (it never invents a subject). Each
// slide carries one note to the author (BlockBase.editorOnly): what the slide does and where to change it.
//
// Sources, per slide: C172S POH (sections 2, 4, 5), FAA AFH (FAA-H-8083-3C) ch. 9 and 10, FAA PHAK (FAA-H-8083-25)
// ch. 17, FAA IFH (FAA-H-8083-15B) ch. 5, 7 and 9, FAA AIM 2-1 and 4-3-3, EASA Part-FCL, ICAO Doc 7488.
import type {
  GoalCheck,
  InstrumentMotion,
  InstrumentView,
  L10n,
  MotionScript,
  SimScene,
  SlideBlock,
  SlideCanvas,
  SlideLayoutId,
  StageControl,
  YourTurn,
} from "../types";
import type { DeckStarter } from "../ui/deckStarters";
import { DEFAULT_GRID } from "../canvas/geom";
import { G, INST, L, MARK, T } from "../canvas/layouts";
import { CHECKLIST, DIAGRAM, QUIZ, scene as fieldsScene } from "./kit";
import {
  READY_SITUATIONS,
  sceneOfSituation,
  type Situation,
} from "../situations";
import {
  type GallerySlide,
  galleryScenes,
  gallerySlide,
  gallerySlides,
  ideaSlide,
  recapSlide,
} from "./exampleSlides";

// ------------------------------------------------------------------ what a slide shows of the product
export type Capability =
  | "sim"
  | "motion"
  | "demo"
  | "yourTurn"
  | "flight"
  | "calc";
/** The badge of a starting point: the capability its preview shows. */
export const CAPABILITY: Record<Capability, L10n> = {
  sim: L("Built-in simulator", "Simulateur intégré"),
  motion: L("Moving instruments", "Instruments animés"),
  demo: L("Guided demonstration", "Démonstration pilotée"),
  yourTurn: L(
    "Students take the controls",
    "Les élèves prennent les commandes",
  ),
  flight: L("Flight in the simulator", "Vol dans le simulateur"),
  calc: L("Calculation tool", "Outil de calcul"),
};

/** The notes to the author: what the slide does, and where to change it (never shown to a student). */
export const SHOW_NOTES = {
  cover: L(
    "The aircraft really flies here. Change its situation in « Simulator ».",
    "L’avion vole vraiment ici. Sa situation se change dans « Simulateur ».",
  ),
  motion: L(
    "The needle moves by itself. Change the movement under « Animation ».",
    "L’aiguille bouge toute seule. Le mouvement se change dans « Animation ».",
  ),
  demo: L(
    "In class: « Present », then « Fly the demonstration ». You fly, the screen follows.",
    "En classe : « Présenter », puis « Piloter la démonstration ». Vous pilotez, l’écran suit.",
  ),
  yourTurn: L(
    "The student flies here. Change the goal in « What the student can do ».",
    "L’élève pilote ici. L’objectif se change dans « Ce que l’élève peut faire ».",
  ),
  flight: L(
    "The student flies in the simulator, then comes back to this slide.",
    "L’élève vole dans le simulateur, puis revient sur cette diapo.",
  ),
  moment: L(
    "A view of the simulator. Change the moment in « Simulator ».",
    "Une vue du simulateur. Le moment se change dans « Simulateur ».",
  ),
  calc: L(
    "The students drag the wind: the triangle works itself out again.",
    "Les élèves déplacent le vent : le triangle se recalcule.",
  ),
  quiz: L(
    "Replace the question and the answers with yours.",
    "Remplacez la question et les réponses par les vôtres.",
  ),
  recap: L(
    "Replace the three numbers with those of your lesson.",
    "Remplacez les trois chiffres par ceux de votre leçon.",
  ),
} satisfies Record<string, L10n>;

// ------------------------------------------------------------------ the situations
const SIT = (id: string): Situation => {
  const r = READY_SITUATIONS.find((s) => s.id === id);
  if (!r) throw new Error(`ready situation ${id}`);
  return JSON.parse(JSON.stringify(r.sit)) as Situation;
};
const sit = (
  id: string,
  s: Situation,
  label: string,
  cockpit: SimScene["cockpit"] = "steam",
): SimScene => ({ ...sceneOfSituation(s, { id, label }), cockpit });
/** Final 27 at Port Ardent, 3 NM (1,420 ft: 3° above the 420 ft field), flaps 20°, 68 kt, 400 ft/min: a steady flight of the flight model (the situation
 *  editor's « Stabiliser » holds it). C172S POH section 4: normal approach 60–75 KIAS. */
const FINAL: Situation = {
  ...SIT("ils27"),
  wx: "vmc",
  iasKt: 68,
  flaps: 2,
  vsFpm: -400,
  power: 24,
  altFt: 1420,
  pos: { kind: "ils", airport: "PARD", rwy: "27", distNm: 3 },
};
/** Short final: 0.6 NM, 660 ft (3° above the 420 ft field, 50 ft over the threshold): the runway fills the
 *  windscreen (the views of the templates). */
const SHORT: Situation = {
  ...FINAL,
  altFt: 660,
  pos: { kind: "ils", airport: "PARD", rwy: "27", distNm: 0.6 },
};
/** The situations of the templates (with the gallery's, which the reused slides show). */
export function showcaseScenes(): Record<string, SimScene> {
  const list: SimScene[] = [
    sit("sp.final", FINAL, "Final 27 PARD · 3 NM · 68 kt"),
    sit("sp.short", SHORT, "Short final 27 PARD · 0.6 NM · 68 kt"),
    sit("sp.final.night", { ...SHORT, night: true }, "Short final 27 PARD at night · 0.6 NM"),
    sit("sp.night", SIT("night"), "Night · 3,000 ft over PARD · heading 090"),
    // 7 NM east of the field, heading for it: the town and the runway lights ahead (the night cover)
    sit(
      "sp.night.town",
      { ...SIT("night"), hdg: 270, altFt: 2500, pos: { kind: "ils", airport: "PARD", rwy: "27", distNm: 7 } },
      "Night · 2,500 ft · 7 NM east of PARD · heading 270",
    ),
    sit(
      "sp.night.g1000",
      SIT("night"),
      "Night · 3,000 ft over PARD · glass panel",
      "g1000",
    ),
    sit("sp.ils", SIT("ils27"), "ILS 27 PARD · 5 NM · glass panel", "g1000"),
    fieldsScene(
      "sp.airliner",
      {
        pos: { fix: "ARD", radial: 90, distNm: 40 },
        altFt: 10000,
        hdg: 90,
        iasKt: 250,
        radios: { baro: 29.92 },
      },
      {
        label: "FL100 · 250 kt · autopilot HDG and ALT",
        cockpit: "airliner",
        wind: [320, 30],
      },
    ),
  ];
  const air = list.at(-1)!;
  air.ap = { engaged: true, lat: "HDG", vert: "ALT", hdg: 90, alt: 10000 };
  return {
    ...galleryScenes(),
    ...Object.fromEntries(list.map((s) => [s.id, s])),
  };
}

// ------------------------------------------------------------------ the animations of the templates
/** On final: small corrections of the heading, the speed and the descent around 68 kt and 400 ft/min (FAA AFH
 *  ch. 9: the approach is flown with small, constant corrections). */
const APPROACH: MotionScript = {
  duration: 24,
  telling: 10,
  tracks: {
    ias: [
      [0, 68],
      [8, 72],
      [16, 65],
      [24, 68],
    ],
    vs: [
      [0, -400],
      [8, -470],
      [16, -360],
      [24, -400],
    ],
    turn: [
      [0, 0],
      [3, -0.6],
      [7, 0],
      [13, 0.6],
      [17, 0],
      [24, 0],
    ],
  },
};
/** An airliner turn at 1.5°/s, FL100, 250 kt: about 22° of bank (tan φ = ω·V/g), as the autopilot flies it. */
const AIRLINER_TURN: MotionScript = {
  duration: 40,
  telling: 14,
  tracks: {
    turn: [
      [0, 0],
      [4, 1.5],
      [26, 1.5],
      [30, 0],
      [40, 0],
    ],
    ias: [[0, 250]],
    vs: [[0, 0]],
  },
};
const loop = (m: InstrumentMotion): InstrumentMotion => ({
  ...(JSON.parse(JSON.stringify(m)) as InstrumentMotion),
  loop: true,
});

// ------------------------------------------------------------------ building blocks
const gauge = (
  g: Extract<InstrumentView, { kind: "gauge" }>["gauge"],
): InstrumentView => ({
  kind: "gauge",
  gauge: g,
});
const canvas = (
  blocks: SlideBlock[],
  scene: string,
  layout: SlideLayoutId,
): SlideCanvas => ({
  size: { w: 1920, h: 1080 },
  grid: DEFAULT_GRID,
  layout,
  scene,
  blocks,
});
const foot = (t: L10n): SlideBlock => T("foot", t, G.left, G.foot, 1080, 32);
const withMotion = (b: SlideBlock, m: InstrumentMotion): SlideBlock =>
  b.kind === "instrument"
    ? { ...b, motion: JSON.parse(JSON.stringify(m)) as InstrumentMotion }
    : b;
const view = (
  id: string,
  v: "outside" | "cockpit",
  scene: string,
  alt: L10n,
  x: number,
  y: number,
  w: number,
  h: number,
  yourTurn?: YourTurn,
): SlideBlock => ({
  id,
  frame: { x, y, w, h, z: 1 },
  kind: "simViewport",
  scene,
  view: v,
  alt,
  ...(yourTurn ? { yourTurn } : {}),
});
/** Up to three numbered lines down the left column (one idea each). */
const lines = (items: L10n[], w = 720, y0 = 352): SlideBlock[] =>
  items
    .slice(0, 3)
    .flatMap((t, i): SlideBlock[] => [
      MARK(i + 1, G.left + 28, y0 + 44 + i * 176, { size: 56, group: `l${i}` }),
      T("body", t, G.left + 88, y0 + 8 + i * 176, w - 88, 136, {
        group: `l${i}`,
      }),
    ]);

/** The cover: the course title, one neutral line, and the aircraft flying (a view, the instruments under it). */
function cover(o: {
  id: string;
  eyebrow: L10n;
  title: L10n;
  scene: string;
  hero: SlideBlock[];
}): SlideCanvas {
  return canvas(
    [
      T("eyebrow", o.eyebrow, G.left, G.eyebrowY, 720, 32),
      T("display", o.title, G.left, 248, 744, 344, { valign: "bottom" }),
      T(
        "heading",
        L(
          "Watch the aircraft fly, then take the controls.",
          "Regardez l’avion voler, puis prenez les commandes.",
        ),
        G.left,
        624,
        744,
        112,
        { color: "ink2" },
      ),
      ...o.hero,
    ],
    o.scene,
    "cover",
  );
}
/** The outside view with three gauges under it: one aircraft, the view and the needles move together. */
function viewAndGauges(o: {
  id: string;
  scene: string;
  night?: boolean;
  gauges: [Extract<InstrumentView, { kind: "gauge" }>["gauge"], L10n][];
  motion: InstrumentMotion;
}): SlideBlock[] {
  const [x, y, w, h] = [912, 120, 888, 500];
  const size = 232;
  const gap = 24;
  const x0 = x + w / 2 - (3 * size + 2 * gap) / 2;
  return [
    view(
      `${o.id}.view`,
      "cockpit",
      o.scene,
      o.night
        ? L("The view from the cockpit at night", "La vue du cockpit, de nuit")
        : L("The view from the cockpit", "La vue du cockpit"),
      x,
      y,
      w,
      h,
    ),
    ...o.gauges.slice(0, 3).map(([g, alt], i) => {
      const b = INST(gauge(g), alt, x0 + i * (size + gap), 656, size, size, {
        id: `${o.id}.g${i}`,
        scene: o.scene,
      });
      return i === 0 ? withMotion(b, loop(o.motion)) : b;
    }),
  ];
}

/** « Démonstration »: a live instrument the instructor flies from the presenter console while the class watches. */
function demoSlide(o: {
  id: string;
  title: L10n;
  items: L10n[];
  source: L10n;
  view: InstrumentView;
  alt: L10n;
  scene: string;
  motion?: InstrumentMotion;
}): SlideCanvas {
  const big = o.view.kind !== "gauge";
  const [ix, iy, iw, ih] = big ? [960, 216, 840, 630] : [1080, 160, 720, 720];
  const inst = INST(o.view, o.alt, ix, iy, iw, ih, {
    id: `${o.id}.inst`,
    scene: o.scene,
    mode: "live",
  });
  return canvas(
    [
      T(
        "eyebrow",
        L("Demonstration", "Démonstration"),
        G.left,
        G.eyebrowY,
        760,
        32,
      ),
      T("title", o.title, G.left, G.titleY, 760, 168),
      ...lines(o.items, 760),
      o.motion ? withMotion(inst, loop(o.motion)) : inst,
      foot(o.source),
    ],
    o.scene,
    "instrumentNotes",
  );
}

/** « À vous »: the goal in the title, the rows ticked live, the live instrument with its controls under it. */
function yourTurnSlide(o: {
  id: string;
  title: L10n;
  rows: {
    text: L10n;
    check: number;
    readout?: "hdg" | "alt" | "vs" | "obs1" | "toFrom" | "cdiDots";
  }[];
  tip: L10n;
  source: L10n;
  view: InstrumentView;
  alt: L10n;
  scene: string;
  controls: StageControl[];
  prompt: L10n;
  goal: GoalCheck[];
  holdS: number;
  success: L10n;
  hint: L10n;
  /** what is held for the student (default: altitude and speed) */
  assist?: YourTurn["assist"];
}): SlideCanvas {
  const big = o.view.kind !== "gauge";
  const [ix, iy, iw, ih] = big ? [960, 136, 840, 792] : [1104, 120, 696, 800];
  return canvas(
    [
      T("eyebrow", L("Your turn", "À vous"), G.left, G.eyebrowY, 768, 32),
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
          assist: o.assist ?? { holdAlt: true, holdIas: true },
          goal: {
            all: o.goal,
            holdS: o.holdS,
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
  );
}

/** « Vol dans le simulateur »: the task, the cockpit view; « À vous » opens the simulator, the result comes back. */
function flightSlide(o: {
  id: string;
  title: L10n;
  task: L10n;
  scene: string;
  alt: L10n;
  prompt: L10n;
  goal: GoalCheck[];
  holdS: number;
  success: L10n;
  source: L10n;
}): SlideCanvas {
  return canvas(
    [
      T(
        "eyebrow",
        L("Flight in the simulator", "Vol dans le simulateur"),
        G.left,
        G.eyebrowY,
        1392,
        32,
      ),
      T("title", o.title, G.left, G.titleY, 1392, 168),
      T("body", o.task, G.left, 352, 600, 296),
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
      view(`${o.id}.sim`, "cockpit", o.scene, o.alt, 816, 352, 984, 554, {
        where: "sim",
        prompt: o.prompt,
        goal: {
          all: o.goal,
          holdS: o.holdS,
          graded: false,
          success: o.success,
        },
        durationS: 240,
        returnTo: "thisStep",
      }),
      foot(o.source),
    ],
    o.scene,
    "yourTurn",
  );
}

/** A question to the class, answers as tiles, a picture of the flight beside it (a view or an instrument). */
function questionSlide(o: {
  id: string;
  title: L10n;
  options: L10n[];
  answer: number;
  explain: L10n;
  source: L10n;
  scene: string;
  visual: SlideBlock;
}): SlideCanvas {
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
      o.visual,
      foot(o.source),
    ],
    o.scene,
    "quiz",
  );
}

// ------------------------------------------------------------------ a deck from its slides
type Made = () => SlideCanvas;
interface Spec {
  id: string;
  title: L10n;
  pitch: L10n;
  level: L10n;
  formations: DeckStarter["formations"];
  badge: Capability;
  /** the slide the card plays */
  hero: number;
  coverEyebrow: L10n;
  slides: [
    SlideLayoutId,
    Made,
    L10n,
    Capability | "quiz" | "recap" | "moment",
  ][];
}
export type ShowcaseDeck = DeckStarter & {
  badge: Capability;
  hero: number;
  /** what each slide shows of the product, by index */
  shows: (Capability | "quiz" | "recap" | "moment")[];
};
function deck(o: Spec): ShowcaseDeck {
  return {
    id: o.id,
    title: o.title,
    pitch: o.pitch,
    theme: "classroom",
    level: o.level,
    formations: o.formations,
    cover: {
      eyebrow: o.coverEyebrow,
      title: o.title,
      // no subtitle: the course is named by its title alone (deckTitle), never by an invented subject
      subtitle: L("", ""),
      lead: L("", ""),
      foot: L("", ""),
    },
    slides: o.slides.map((s) => s[0]),
    make: Object.fromEntries(o.slides.map((s, i) => [i, s[1]])),
    notes: Object.fromEntries(o.slides.map((s, i) => [i, s[2]])),
    scenes: showcaseScenes,
    badge: o.badge,
    hero: o.hero,
    shows: o.slides.map((s) => s[3]),
  };
}
const ready =
  (id: string): Made =>
  () => {
    const g = gallerySlide(id);
    if (!g) throw new Error(`gallery slide ${id}`);
    return g.slide;
  };

// ------------------------------------------------------------------ LAPL · PPL: the circuit
const PPL_EYEBROW = L("LAPL · PPL lesson", "Leçon LAPL · PPL");
export const PPL_CIRCUIT = deck({
  id: "ppl-circuit",
  title: L("PPL lesson: the circuit", "Leçon PPL : le tour de piste"),
  pitch: L(
    "The runway ahead and the needles moving, a demonstration on final, the students descend, a flight in the simulator",
    "La piste devant et les aiguilles qui bougent, une démonstration en finale, les élèves descendent, un vol dans le simulateur",
  ),
  level: L("LAPL / PPL", "LAPL / PPL"),
  formations: ["ppl", "club"],
  badge: "sim",
  hero: 0,
  coverEyebrow: PPL_EYEBROW,
  slides: [
    [
      "cover",
      () =>
        cover({
          id: "sp-ppl-cover",
          eyebrow: PPL_EYEBROW,
          title: L("The circuit", "Le tour de piste"),
          scene: "sp.short",
          hero: viewAndGauges({
            id: "sp-ppl-cover",
            scene: "sp.short",
            gauges: [
              [
                "ai",
                L(
                  "Attitude indicator on final",
                  "Horizon artificiel en finale",
                ),
              ],
              ["asi", L("Airspeed indicator, 68 kt", "Anémomètre, 68 kt")],
              [
                "vsi",
                L(
                  "Vertical speed, 400 ft/min down",
                  "Variomètre, 400 ft/min en descente",
                ),
              ],
            ],
            motion: { script: APPROACH },
          }),
        }),
      SHOW_NOTES.cover,
      "sim",
    ],
    ["instrumentNotes", ready("gx-asi-arcs"), SHOW_NOTES.motion, "motion"],
    [
      "instrumentNotes",
      () =>
        demoSlide({
          id: "sp-ppl-demo",
          title: L(
            "On final: watch the instructor fly",
            "En finale : regardez l’instructeur piloter",
          ),
          items: [
            L(
              "Too high: a little less power",
              "Trop haut : un peu moins de puissance",
            ),
            L("Too slow: lower the nose", "Trop lent : on rend la main"),
            L(
              "The runway stays still in the windscreen",
              "La piste reste immobile dans le pare-brise",
            ),
          ],
          source: L(
            "FAA AFH ch. 9 · stabilized approach",
            "FAA AFH ch. 9 · approche stabilisée",
          ),
          view: { kind: "six" },
          alt: L(
            "The six instruments on final, live",
            "Les six instruments en finale, en direct",
          ),
          scene: "sp.final",
        }),
      SHOW_NOTES.demo,
      "demo",
    ],
    [
      "yourTurn",
      () =>
        yourTurnSlide({
          id: "sp-ppl-vsi",
          title: L(
            "Your turn: descend at 500 ft/min",
            "À vous : descendez à 500 ft/min",
          ),
          rows: [
            {
              text: L(
                "Vertical speed 500 ft/min, ±50",
                "Vario 500 ft/min, ±50",
              ),
              check: 0,
              readout: "vs",
            },
          ],
          tip: L(
            "Lower the nose a little: the needle follows. The speed is held for you.",
            "Rendez un peu la main : l’aiguille suit. La vitesse est tenue pour vous.",
          ),
          source: L(
            "FAA AFH ch. 9 · C172S POH section 4",
            "FAA AFH ch. 9 · POH C172S section 4",
          ),
          view: gauge("vsi"),
          alt: L(
            "Live vertical speed indicator on final",
            "Variomètre en direct, en finale",
          ),
          scene: "sp.final",
          controls: ["pitch"],
          assist: { holdIas: true },
          prompt: L(
            "Your turn: descend at 500 ft/min",
            "À vous : descendez à 500 ft/min",
          ),
          goal: [{ id: "vsBand", p: { min: -550, max: -450 } }],
          holdS: 8,
          success: L(
            "500 ft/min held: the runway comes towards you.",
            "500 ft/min tenus : la piste vient à vous.",
          ),
          hint: L(
            "Small pitch changes, then wait for the needle.",
            "De petites corrections, puis attendez l’aiguille.",
          ),
        }),
      SHOW_NOTES.yourTurn,
      "yourTurn",
    ],
    [
      "yourTurn",
      () =>
        flightSlide({
          id: "sp-ppl-flight",
          title: L(
            "Fly the final in the simulator",
            "Volez la finale dans le simulateur",
          ),
          task: L(
            "Final 27, 3 NM, 68 kt. Keep the runway axis and **about 400 ft/min** down to the threshold.",
            "Finale 27, 3 NM, 68 kt. Gardez l’axe de piste et **environ 400 ft/min** jusqu’au seuil.",
          ),
          scene: "sp.final",
          alt: L(
            "The simulator's cockpit on final 27",
            "Le cockpit du simulateur en finale 27",
          ),
          prompt: L(
            "Keep the axis and the descent to the threshold",
            "Gardez l’axe et la descente jusqu’au seuil",
          ),
          goal: [
            { id: "heading", p: { value: 270, tol: 10 } },
            { id: "vsBand", p: { min: -700, max: -200 } },
          ],
          holdS: 30,
          success: L(
            "A stabilized final, all the way down.",
            "Une finale stabilisée, jusqu’en bas.",
          ),
          source: L(
            "FAA AFH ch. 9 · approaches and landings",
            "FAA AFH ch. 9 · approches et atterrissages",
          ),
        }),
      SHOW_NOTES.flight,
      "flight",
    ],
    [
      "quiz",
      () =>
        questionSlide({
          id: "sp-ppl-quiz",
          title: L(
            "On final, the runway climbs in the windscreen. You are…",
            "En finale, la piste monte dans le pare-brise. Vous êtes…",
          ),
          options: [
            L("Too low", "Trop bas"),
            L("Too high", "Trop haut"),
            L("On the slope", "Sur le plan"),
          ],
          answer: 0,
          explain: L(
            "The aiming point rises: the path ends short of it. Add a little power and hold the speed.",
            "Le point d’aboutissement monte : la trajectoire tombe avant. Un peu de puissance, vitesse tenue.",
          ),
          source: L(
            "FAA AFH ch. 9 · the aiming point",
            "FAA AFH ch. 9 · le point d’aboutissement",
          ),
          scene: "sp.short",
          visual: view(
            "sp-ppl-quiz.view",
            "outside",
            "sp.short",
            L(
              "The runway ahead, on short final",
              "La piste devant, en courte finale",
            ),
            1176,
            320,
            624,
            468,
          ),
        }),
      SHOW_NOTES.quiz,
      "moment",
    ],
    [
      "recap",
      () =>
        recapSlide({
          title: L(
            "Three numbers for the circuit",
            "Trois chiffres pour le tour de piste",
          ),
          cols: [
            [
              L("1,000 ft", "1 000 ft"),
              L(
                "above the field: the usual circuit height",
                "au-dessus du terrain : la hauteur habituelle",
              ),
            ],
            [
              L("85 kt", "85 kt"),
              L(
                "VFE: flaps 20° and more, not faster",
                "VFE : volets 20° et plus, pas plus vite",
              ),
            ],
            [
              L("3°", "3°"),
              L(
                "of slope: about 300 ft for each NM",
                "de pente : environ 300 ft par NM",
              ),
            ],
          ],
          source: L(
            "FAA AIM 4-3-3 · C172S POH section 2 · FAA AFH ch. 9",
            "FAA AIM 4-3-3 · POH C172S section 2 · FAA AFH ch. 9",
          ),
        }),
      SHOW_NOTES.recap,
      "recap",
    ],
  ],
});

// ------------------------------------------------------------------ Night flying
const NIGHT_EYEBROW = L("Night rating", "Qualification vol de nuit");
export const NIGHT_FLIGHT = deck({
  id: "night-flight",
  title: L("Night flying lesson", "Leçon de vol de nuit"),
  pitch: L(
    "The town lights and the runway at night, the attitude indicator, a guided demonstration, the student turns",
    "Les lumières de la ville et la piste de nuit, l’horizon artificiel, une démonstration pilotée, l’élève vire",
  ),
  level: L("Night rating", "Vol de nuit"),
  formations: ["night"],
  badge: "sim",
  hero: 0,
  coverEyebrow: NIGHT_EYEBROW,
  slides: [
    [
      "cover",
      () =>
        cover({
          id: "sp-nt-cover",
          eyebrow: NIGHT_EYEBROW,
          title: L("Flying at night", "Le vol de nuit"),
          scene: "sp.night.town",
          hero: viewAndGauges({
            id: "sp-nt-cover",
            scene: "sp.night.town",
            night: true,
            gauges: [
              [
                "ai",
                L(
                  "Attitude indicator in a turn",
                  "Horizon artificiel en virage",
                ),
              ],
              ["hsi", L("Heading turning", "Le cap qui tourne")],
              ["alt", L("Altimeter, 3,000 ft", "Altimètre, 3 000 ft")],
            ],
            motion: { preset: "turn-std" },
          }),
        }),
      SHOW_NOTES.cover,
      "sim",
    ],
    [
      "instrumentNotes",
      () =>
        ideaSlide({
          id: "sp-nt-ai",
          group: "ppl",
          eyebrow: L("Spatial disorientation", "Désorientation spatiale"),
          title: L(
            "At night, the attitude indicator is the horizon",
            "De nuit, l’horizon, c’est l’instrument",
          ),
          what: L(
            "The attitude indicator banks in a turn",
            "L’horizon s’incline en virage",
          ),
          lines: [
            {
              text: L(
                "A long turn feels like level flight",
                "Un long virage se ressent comme un palier",
              ),
            },
            {
              text: L(
                "Rolling out feels like a turn the other way",
                "La sortie se ressent comme un virage inverse",
              ),
            },
            {
              text: L(
                "Believe the instrument, not the body",
                "On croit l’instrument, pas le corps",
              ),
            },
          ],
          source: L(
            "FAA PHAK ch. 17 · vestibular illusions",
            "FAA PHAK ch. 17 · illusions vestibulaires",
          ),
          view: gauge("ai"),
          alt: L(
            "Attitude indicator in a standard-rate turn",
            "Horizon artificiel dans un virage standard",
          ),
          scene: "sp.night",
          motion: { preset: "turn-std" },
        }).slide,
      SHOW_NOTES.motion,
      "motion",
    ],
    [
      "instrumentNotes",
      () =>
        canvas(
          [
            T(
              "eyebrow",
              L("Flight moment", "Moment de vol"),
              G.left,
              G.eyebrowY,
              720,
              32,
            ),
            T(
              "title",
              L("The dark before the runway", "Le noir avant la piste"),
              G.left,
              G.titleY,
              720,
              168,
            ),
            ...lines(
              [
                L(
                  "No lights under the final: the slope is hard to judge",
                  "Pas de lumière sous la finale : la pente se juge mal",
                ),
                L(
                  "The runway looks far: you descend too early",
                  "La piste paraît loin : on descend trop tôt",
                ),
                L(
                  "Fly the slope on the instruments",
                  "On tient le plan aux instruments",
                ),
              ],
              720,
            ),
            view(
              "sp-nt-moment.view",
              "cockpit",
              "sp.final.night",
              L(
                "Final 27 at night: the runway lights and the town",
                "Finale 27 de nuit : le balisage et la ville",
              ),
              912,
              216,
              888,
              500,
            ),
            foot(
              L(
                "FAA AFH ch. 10 · night approach illusions",
                "FAA AFH ch. 10 · illusions en approche de nuit",
              ),
            ),
          ],
          "sp.final.night",
          "instrumentNotes",
        ),
      SHOW_NOTES.moment,
      "moment",
    ],
    [
      "instrumentNotes",
      () =>
        demoSlide({
          id: "sp-nt-demo",
          title: L(
            "A turn at night: watch the screen",
            "Un virage de nuit : regardez l’écran",
          ),
          items: [
            L(
              "Bank on the attitude indicator, not outside",
              "L’inclinaison se lit sur l’horizon, pas dehors",
            ),
            L(
              "The heading turns at 3° a second",
              "Le cap tourne de 3° par seconde",
            ),
            L("The altitude does not move", "L’altitude ne bouge pas"),
          ],
          source: L(
            "FAA AFH ch. 10 · night flying",
            "FAA AFH ch. 10 · vol de nuit",
          ),
          view: { kind: "pfd" },
          alt: L(
            "The flight display at night, live",
            "L’écran de vol de nuit, en direct",
          ),
          scene: "sp.night.g1000",
          motion: { preset: "turn-std" },
        }),
      SHOW_NOTES.demo,
      "demo",
    ],
    [
      "yourTurn",
      () =>
        yourTurnSlide({
          id: "sp-nt-turn",
          title: L(
            "Your turn: turn right onto 180",
            "À vous : virez à droite au 180",
          ),
          rows: [
            {
              text: L("Heading 180, ±5°", "Cap 180, ±5°"),
              check: 0,
              readout: "hdg",
            },
            {
              text: L(
                "Altitude 3,000 ft, ±100 ft",
                "Altitude 3 000 ft, ±100 ft",
              ),
              check: 1,
              readout: "alt",
            },
          ],
          tip: L(
            "Bank about 15°, level the wings 5° before 180. Altitude and speed are held for you.",
            "Inclinez d’environ 15°, remettez à plat 5° avant le 180. Altitude et vitesse sont tenues pour vous.",
          ),
          source: L(
            "FAA AFH ch. 10 · FAA IFH ch. 4",
            "FAA AFH ch. 10 · FAA IFH ch. 4",
          ),
          view: { kind: "six" },
          alt: L(
            "Live six instruments, at night, heading 090",
            "Six instruments en direct, de nuit, cap 090",
          ),
          scene: "sp.night",
          controls: ["bank"],
          prompt: L(
            "Your turn: turn right onto heading 180",
            "À vous : virez à droite au cap 180",
          ),
          goal: [
            { id: "heading", p: { value: 180, tol: 5 } },
            { id: "altBand", p: { min: 2900, max: 3100 } },
          ],
          holdS: 10,
          success: L(
            "Heading 180 held, on the instruments.",
            "Cap 180 tenu, aux instruments.",
          ),
          hint: L(
            "Look at the attitude indicator first, then the heading.",
            "Regardez d’abord l’horizon, puis le cap.",
          ),
        }),
      SHOW_NOTES.yourTurn,
      "yourTurn",
    ],
    [
      "quiz",
      () =>
        questionSlide({
          id: "sp-nt-quiz",
          title: L(
            "After a long turn at night, you roll out. You feel…",
            "Après un long virage de nuit, vous remettez à plat. Vous sentez…",
          ),
          options: [
            L("Level flight", "Un palier"),
            L("A turn the other way", "Un virage inverse"),
            L("A climb", "Une montée"),
          ],
          answer: 1,
          explain: L(
            "The inner ear got used to the turn: rolling out feels like a turn the other way. Believe the attitude indicator.",
            "L’oreille interne s’est habituée au virage : la sortie ressemble à un virage inverse. On croit l’horizon.",
          ),
          source: L(
            "FAA PHAK ch. 17 · the leans",
            "FAA PHAK ch. 17 · l’illusion des inclinaisons",
          ),
          scene: "sp.night",
          visual: withMotion(
            INST(
              gauge("tc"),
              L(
                "Turn coordinator in a standard-rate turn",
                "Indicateur de virage dans un virage standard",
              ),
              1176,
              240,
              624,
              624,
              {
                id: "sp-nt-quiz.inst",
                scene: "sp.night",
              },
            ),
            loop({ preset: "turn-std" }),
          ),
        }),
      SHOW_NOTES.quiz,
      "quiz",
    ],
    [
      "recap",
      () =>
        recapSlide({
          title: L(
            "Three numbers for a night flight",
            "Trois chiffres pour un vol de nuit",
          ),
          cols: [
            [
              L("3°/s", "3°/s"),
              L(
                "standard rate, by night as by day",
                "taux standard, de nuit comme de jour",
              ),
            ],
            [
              L("30 min", "30 min"),
              L(
                "for the eyes to get used to the dark",
                "pour que les yeux s’habituent au noir",
              ),
            ],
            [
              L("5", "5"),
              L(
                "take-offs and landings at night for the rating",
                "décollages et atterrissages de nuit pour la qualification",
              ),
            ],
          ],
          source: L(
            "FAA PHAK ch. 17 · EASA FCL.810",
            "FAA PHAK ch. 17 · EASA FCL.810",
          ),
        }),
      SHOW_NOTES.recap,
      "recap",
    ],
  ],
});

// ------------------------------------------------------------------ IR: the ILS
const IR_EYEBROW = L("IR lesson · instrument flying", "Leçon IR · vol aux instruments");
export const IR_ILS = deck({
  id: "ir-ils",
  title: L("IR lesson: the ILS", "Leçon IR : l’ILS"),
  pitch: L(
    "The flight display on the glide path, the localizer capture, the students set the OBS, the instructor flies the map, the ILS in the simulator",
    "L’écran de vol sur le plan, la capture de l’axe, les élèves règlent l’OBS, l’instructeur pilote sur la carte, l’ILS dans le simulateur",
  ),
  level: L("IR", "IR"),
  formations: ["ir"],
  badge: "motion",
  hero: 0,
  coverEyebrow: IR_EYEBROW,
  slides: [
    [
      "cover",
      () =>
        cover({
          id: "sp-ir-cover",
          eyebrow: IR_EYEBROW,
          title: L("The ILS approach", "L’approche ILS"),
          scene: "sp.ils",
          hero: [
            withMotion(
              INST(
                { kind: "pfd" },
                L(
                  "Flight display on the ILS 27 glide path",
                  "Écran de vol sur le plan de l’ILS 27",
                ),
                936,
                136,
                864,
                648,
                {
                  id: "sp-ir-cover.pfd",
                  scene: "sp.ils",
                },
              ),
              loop({ preset: "ils-glide" }),
            ),
          ],
        }),
      SHOW_NOTES.cover,
      "motion",
    ],
    ["instrumentNotes", ready("gx-loc-capture"), SHOW_NOTES.motion, "motion"],
    ["yourTurn", ready("gx-set-obs"), SHOW_NOTES.yourTurn, "yourTurn"],
    [
      "instrumentNotes",
      () =>
        demoSlide({
          id: "sp-ir-demo",
          title: L(
            "The approach on the map: watch the instructor fly",
            "L’approche sur la carte : regardez l’instructeur",
          ),
          items: [
            L(
              "The aircraft follows the magenta line",
              "L’avion suit la ligne magenta",
            ),
            L(
              "The final course points at the runway",
              "L’axe final pointe sur la piste",
            ),
            L(
              "The instructor turns off the course: see the map",
              "L’instructeur s’écarte de l’axe : regardez la carte",
            ),
          ],
          source: L(
            "FAA IFH ch. 7 · moving map",
            "FAA IFH ch. 7 · carte mobile",
          ),
          view: { kind: "mfd" },
          alt: L(
            "The map display on the ILS 27, live",
            "L’écran carte sur l’ILS 27, en direct",
          ),
          scene: "sp.ils",
        }),
      SHOW_NOTES.demo,
      "demo",
    ],
    [
      "yourTurn",
      () =>
        flightSlide({
          id: "sp-ir-flight",
          title: L(
            "Fly the ILS 27 in the simulator",
            "Volez l’ILS 27 dans le simulateur",
          ),
          task: L(
            "5 NM on final, in cloud. Keep the localizer and the glide path **within one dot** for 30 seconds.",
            "À 5 NM en finale, dans les nuages. Gardez l’axe et le plan **à moins d’un point** pendant 30 secondes.",
          ),
          scene: "sp.ils",
          alt: L(
            "The simulator's cockpit on the ILS 27",
            "Le cockpit du simulateur sur l’ILS 27",
          ),
          prompt: L(
            "Keep the localizer and the glide path within one dot",
            "Gardez l’axe et le plan à moins d’un point",
          ),
          goal: [
            { id: "cdiDefl", p: { maxDots: 1 } },
            { id: "gsDefl", p: { maxDots: 1 } },
          ],
          holdS: 30,
          success: L("Localizer and glide path held.", "Axe et plan tenus."),
          source: L("FAA IFH ch. 9 · ILS", "FAA IFH ch. 9 · ILS"),
        }),
      SHOW_NOTES.flight,
      "flight",
    ],
    [
      "quiz",
      () =>
        questionSlide({
          id: "sp-ir-quiz",
          title: L(
            "The glide index is above the centre. You are…",
            "L’index du plan est au-dessus du centre. Vous êtes…",
          ),
          options: [
            L("Below", "En dessous"),
            L("Above", "Au-dessus"),
            L("On the path", "Sur le plan"),
          ],
          answer: 0,
          explain: L(
            "The needle shows where the path is: above you. Less descent until it centres.",
            "L’aiguille montre où est le plan : au-dessus de vous. Moins de descente jusqu’à la centrer.",
          ),
          source: L(
            "FAA IFH ch. 9 · glide slope",
            "FAA IFH ch. 9 · plan de descente",
          ),
          scene: "gx.ils",
          visual: withMotion(
            INST(
              gauge("cdi"),
              L(
                "The ILS needles on the glide path",
                "Les aiguilles de l’ILS sur le plan",
              ),
              1176,
              240,
              624,
              624,
              {
                id: "sp-ir-quiz.inst",
                scene: "gx.ils",
              },
            ),
            loop({ preset: "ils-glide" }),
          ),
        }),
      SHOW_NOTES.quiz,
      "quiz",
    ],
  ],
});

// ------------------------------------------------------------------ ATPL theory: the airliner displays and the wind
const ATPL_EYEBROW = L("ATPL theory", "ATPL théorie");
export const ATPL_DISPLAYS = deck({
  id: "atpl-displays",
  title: L(
    "ATPL theory: flight displays and wind",
    "ATPL théorie : écrans de vol et vent",
  ),
  pitch: L(
    "The airliner PFD in a turn, the wind triangle the students drag, the ND in a demonstration, the heading bug on the PFD, the ADF needle",
    "Le PFD de ligne en virage, le triangle des vitesses que les élèves déplacent, le ND en démonstration, le cap sélecté sur le PFD, l’aiguille ADF",
  ),
  level: L("ATPL theory", "ATPL théorie"),
  formations: ["atpl"],
  badge: "calc",
  hero: 1,
  coverEyebrow: ATPL_EYEBROW,
  slides: [
    [
      "cover",
      () =>
        cover({
          id: "sp-at-cover",
          eyebrow: ATPL_EYEBROW,
          title: L("Flight displays", "Les écrans de vol"),
          scene: "sp.airliner",
          hero: [
            withMotion(
              INST(
                { kind: "airlinerPfd" },
                L(
                  "Airliner PFD in a turn at FL100",
                  "PFD de ligne en virage au FL100",
                ),
                936,
                136,
                864,
                648,
                {
                  id: "sp-at-cover.pfd",
                  scene: "sp.airliner",
                },
              ),
              loop({ script: AIRLINER_TURN }),
            ),
          ],
        }),
      SHOW_NOTES.cover,
      "sim",
    ],
    [
      "instrumentNotes",
      () =>
        canvas(
          [
            T(
              "eyebrow",
              L("Calculation tool", "Outil de calcul"),
              G.left,
              G.eyebrowY,
              960,
              32,
            ),
            T(
              "title",
              L(
                "The wind triangle, and the ND that shows it",
                "Le triangle des vitesses, et le ND qui l’affiche",
              ),
              G.left,
              G.titleY,
              1392,
              168,
            ),
            DIAGRAM(
              "sp-at-calc.d",
              {
                kind: "calc",
                calc: {
                  kind: "windTriangle",
                  course: 90,
                  tasKt: 290,
                  windDir: 320,
                  windKt: 30,
                  drag: ["wind"],
                },
              },
              L(
                "Wind triangle: course 090, TAS 290 kt, wind 320/30",
                "Triangle des vitesses : route 090, TAS 290 kt, vent 320/30",
              ),
              G.left,
              336,
              912,
              600,
              {
                interactive: true,
                caption: L(
                  "Drag the wind: drift and ground speed follow.",
                  "Déplacez le vent : dérive et vitesse sol suivent.",
                ),
              },
            ),
            withMotion(
              INST(
                { kind: "nd" },
                L(
                  "The navigation display: the wind arrow, live",
                  "L’écran de navigation : la flèche du vent, en direct",
                ),
                1104,
                336,
                696,
                522,
                {
                  id: "sp-at-calc.nd",
                  scene: "sp.airliner",
                },
              ),
              loop({ script: AIRLINER_TURN }),
            ),
            foot(
              L(
                "EASA ATPL 061 · FAA PHAK ch. 16",
                "EASA ATPL 061 · FAA PHAK ch. 16",
              ),
            ),
          ],
          "sp.airliner",
          "instrumentNotes",
        ),
      SHOW_NOTES.calc,
      "calc",
    ],
    [
      "instrumentNotes",
      () =>
        demoSlide({
          id: "sp-at-demo",
          title: L("The wind on the ND: watch the instructor turn", "Le vent sur le ND : regardez l’instructeur virer"),
          items: [
            L("The arrow gives the wind: 320°, 30 kt", "La flèche donne le vent : 320°, 30 kt"),
            L("The track line is not the heading: that is the drift", "La ligne de route n’est pas le cap : c’est la dérive"),
            L("In the turn, the drift changes side", "En virage, la dérive change de côté"),
          ],
          source: L("EASA ATPL 022 · FAA Advanced Avionics Handbook ch. 2", "EASA ATPL 022 · FAA Advanced Avionics Handbook ch. 2"),
          view: { kind: "nd" },
          alt: L("The navigation display at FL100, live", "L’écran de navigation au FL100, en direct"),
          scene: "sp.airliner",
        }),
      SHOW_NOTES.demo,
      "demo",
    ],
    [
      "yourTurn",
      () =>
        yourTurnSlide({
          id: "sp-at-hdg",
          title: L(
            "Your turn: select heading 120",
            "À vous : sélectez le cap 120",
          ),
          rows: [
            {
              text: L("Heading 120, ±5°", "Cap 120, ±5°"),
              check: 0,
              readout: "hdg",
            },
          ],
          tip: L(
            "Turn the heading knob: the bug moves, the autopilot turns the aircraft onto it.",
            "Tournez le bouton de cap : le repère bouge, le pilote automatique met l’avion dessus.",
          ),
          source: L(
            "FAA Advanced Avionics Handbook ch. 4",
            "FAA Advanced Avionics Handbook ch. 4",
          ),
          view: { kind: "airlinerPfd" },
          alt: L(
            "Live airliner PFD, autopilot in HDG",
            "PFD de ligne en direct, pilote automatique en HDG",
          ),
          scene: "sp.airliner",
          controls: ["hdgBug"],
          prompt: L(
            "Your turn: select heading 120",
            "À vous : sélectez le cap 120",
          ),
          goal: [{ id: "heading", p: { value: 120, tol: 5 } }],
          holdS: 5,
          success: L(
            "Heading 120: the autopilot followed the bug.",
            "Cap 120 : le pilote automatique a suivi le repère.",
          ),
          hint: L(
            "Turn right, 30° on the knob.",
            "Tournez à droite, 30° sur le bouton.",
          ),
        }),
      SHOW_NOTES.yourTurn,
      "yourTurn",
    ],
    [
      "quiz",
      () =>
        questionSlide({
          id: "sp-at-quiz",
          title: L("The aircraft turns towards the beacon. The needle…", "L’avion vire vers la balise. L’aiguille…"),
          options: [
            L("Goes to the nose", "Va vers le nez"),
            L("Goes to the tail", "Va vers la queue"),
            L("Does not move", "Ne bouge pas"),
          ],
          answer: 0,
          explain: L(
            "The needle always points at the beacon: when the nose is on it, the needle is at the top.",
            "L’aiguille pointe toujours la balise : quand le nez est dessus, l’aiguille est en haut.",
          ),
          source: L("EASA ATPL 062 · FAA IFH ch. 9 · ADF", "EASA ATPL 062 · FAA IFH ch. 9 · ADF"),
          scene: "gx.ndb",
          visual: withMotion(
            INST(gauge("rmi"), L("RMI: the beacon on the right wing, then on the nose", "RMI : la balise sur l’aile droite, puis sur le nez"), 1176, 240, 624, 624, {
              id: "sp-at-quiz.inst",
              scene: "gx.ndb",
            }),
            loop({ preset: "adf" }),
          ),
        }),
      SHOW_NOTES.quiz,
      "quiz",
    ],
    [
      "recap",
      () =>
        recapSlide({
          title: L(
            "Three numbers of the standard atmosphere",
            "Trois chiffres de l’atmosphère type",
          ),
          cols: [
            [
              L("661.5 kt", "661,5 kt"),
              L(
                "speed of sound at 15 °C, at sea level",
                "vitesse du son à 15 °C, au niveau de la mer",
              ),
            ],
            [
              L("−2 °C", "−2 °C"),
              L(
                "for every 1,000 ft of climb",
                "par tranche de 1 000 ft de montée",
              ),
            ],
            [
              L("−56.5 °C", "−56,5 °C"),
              L(
                "above the tropopause, 36,089 ft",
                "au-dessus de la tropopause, 36 089 ft",
              ),
            ],
          ],
          source: L(
            "ICAO Doc 7488 · EASA ATPL 022",
            "OACI Doc 7488 · EASA ATPL 022",
          ),
        }),
      SHOW_NOTES.recap,
      "recap",
    ],
  ],
});

/** The starting template of each formation, in training order. */
export const SHOWCASE_DECKS: readonly ShowcaseDeck[] = [
  PPL_CIRCUIT,
  NIGHT_FLIGHT,
  IR_ILS,
  ATPL_DISPLAYS,
];

// ------------------------------------------------------------------ the first slides an empty slide offers
/** « Moment de vol »: what the pilot sees, from the slide's aircraft (the outside view follows it). */
function momentSlide(o: { id: string; title: L10n; items: L10n[]; scene: string; alt: L10n; source: L10n }): SlideCanvas {
  return canvas(
    [
      T("eyebrow", L("Flight moment", "Moment de vol"), G.left, G.eyebrowY, 720, 32),
      T("title", o.title, G.left, G.titleY, 720, 168),
      ...lines(o.items, 720),
      view(`${o.id}.view`, "outside", o.scene, o.alt, 912, 216, 888, 500),
      foot(o.source),
    ],
    o.scene,
    "instrumentNotes",
  );
}
const made = (d: DeckStarter, i: number): SlideCanvas => {
  const m = d.make?.[i];
  if (!m) throw new Error(`${d.id} slide ${i}`);
  return m();
};
/**
 * The slides an empty slide offers first (« Que voulez-vous montrer ? », studio.ts EMPTY_STARTS), one per thing
 * the simulator does on a slide, each with a different instrument: the aircraft flying on a cover, the view from
 * the cockpit, a demonstration the instructor flies, the student at the controls, a flight in the simulator, a
 * calculation the students drag. Then the gallery's slides.
 */
export function startSlides(): GallerySlide[] {
  const mine: GallerySlide[] = [
    {
      id: "sx-cover",
      group: "start",
      title: L("A cover where the aircraft flies", "Une couverture où l’avion vole"),
      what: L("The view from the cockpit and three needles moving", "La vue du cockpit et trois aiguilles qui bougent"),
      slide: made(PPL_CIRCUIT, 0),
    },
    {
      id: "sx-moment",
      group: "start",
      title: L("A flight moment", "Un moment de vol"),
      what: L("What the pilot sees, from the simulator", "Ce que voit le pilote, depuis le simulateur"),
      slide: momentSlide({
        id: "sx-moment",
        title: L("Short final: what the pilot sees", "Courte finale : ce que voit le pilote"),
        items: [
          L("The runway stays still in the windscreen", "La piste reste immobile dans le pare-brise"),
          L("Its far end stays above the nose", "Son extrémité reste au-dessus du capot"),
          L("The numbers grow, the aiming point does not move", "Les numéros grossissent, le point visé ne bouge pas"),
        ],
        scene: "sp.short",
        alt: L("Short final 27, from the cockpit", "Courte finale 27, depuis le cockpit"),
        source: L("FAA AFH ch. 9 · the aiming point", "FAA AFH ch. 9 · le point d’aboutissement"),
      }),
    },
    {
      id: "sx-demo",
      group: "start",
      title: L("A demonstration you fly", "Une démonstration que vous pilotez"),
      what: L("In class, you fly the flight display, the screen follows", "En classe, vous pilotez l’écran de vol, la projection suit"),
      slide: demoSlide({
        id: "sx-demo",
        title: L("On the ILS: watch the instructor fly", "Sur l’ILS : regardez l’instructeur piloter"),
        items: [
          L("The diamonds show the localizer and the glide path", "Les losanges montrent l’axe et le plan"),
          L("A small correction, then wait", "Une petite correction, puis on attend"),
          L("The speed stays at 90 kt", "La vitesse reste à 90 kt"),
        ],
        source: L("FAA IFH ch. 9 · ILS", "FAA IFH ch. 9 · ILS"),
        view: { kind: "pfd" },
        alt: L("The flight display on the ILS 27, live", "L’écran de vol sur l’ILS 27, en direct"),
        scene: "sp.ils",
      }),
    },
    {
      id: "sx-wind",
      group: "start",
      title: L("A calculation the students drag", "Un calcul que les élèves déplacent"),
      what: L("The wind triangle, and the ND that shows the same wind", "Le triangle des vitesses, et le ND qui affiche le même vent"),
      slide: made(ATPL_DISPLAYS, 1),
    },
  ];
  return [...mine, ...gallerySlides()];
}
/** One of startSlides() (a fresh copy). */
export function startSlide(id: string): GallerySlide | null {
  return startSlides().find((g) => g.id === id) ?? null;
}
