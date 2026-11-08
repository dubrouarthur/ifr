// Ground school editor (package F): step templates named by teaching intent, and every step-level edit the editor
// makes (insert, move, duplicate, delete, convert between a designed slide and Reader + Stage, add a tray capture),
// plus the course undo history. Pure: no DOM, unit-tested (tests/course-editor.test.ts).
//
// A template is only a set of defaults (SPEC §4): the view, the mode, the controls and the suggested goals. A CFI can
// turn an Explain into a Try it without losing anything — the kind changes, the reader, scene and callouts stay.
import type {
  AssetRef,
  Annotation,
  CalcGeneratorId,
  CalcSpec,
  Clip,
  Cockpit,
  Course,
  Criterion,
  DrillSpec,
  FlyIt,
  FlyOption,
  GoalCheck,
  InstrumentView,
  L10n,
  Lang,
  PaneView,
  Quiz,
  ReaderBlock,
  SimScene,
  SlideBlock,
  SlideCanvas,
  SlideLayoutId,
  StageControl,
  StageCue,
  Step,
  StepGoal,
  StepKind,
  ThemeId,
} from "../types";
import { holdEntry, type HoldEntry, type Turn } from "../../nav/holding";
import { sceneFromFields } from "../scene";
import { layoutCanvas } from "../canvas/layouts";
import { goalLabel, goalRow } from "../goals";
import { eachText } from "../validate";
import { MFD_MAP_CROP, PFD_CROPS, RADIO_CROPS } from "../stage/geometry";
import type { TrayItem } from "../store";

/** the default Quiz step's hold question (hold west of ARD, inbound 090, right turns, arriving heading 180) */
export const TPL_HOLD = { inbound: 90, turn: "R" as Turn, arrive: 180 };
const TPL_ENTRY_INDEX: Record<HoldEntry, number> = { DIRECT: 0, PARALLEL: 1, TEARDROP: 2 };

const L = (en: string, fr: string): L10n => ({ en, fr });
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
export const tr = (t: L10n | undefined, lang: Lang): string =>
  !t ? "" : lang === "fr" ? (t.fr?.trim() ? t.fr : t.en) : t.en;

// ------------------------------------------------------------------ templates (teaching intents)
export type TemplateId =
  | "explain"
  | "predict"
  | "watch"
  | "try"
  | "tap"
  | "quiz"
  | "calc"
  | "drill"
  | "fly"
  | "page"
  | "slide";
export interface TemplateDef {
  id: TemplateId;
  kind: StepKind;
  title: L10n;
  /** one line: what the student does */
  intent: L10n;
  /** it shows the stage scene (needs one) */
  usesScene: boolean;
}
export const TEMPLATES: TemplateDef[] = [
  {
    id: "explain",
    kind: "explain",
    title: L("Explain", "Expliquer"),
    intent: L(
      "An annotated instrument, revealed one callout at a time",
      "Un instrument annoté, une légende après l’autre",
    ),
    usesScene: true,
  },
  {
    id: "predict",
    kind: "predict",
    title: L("Predict", "Prédire"),
    intent: L(
      "Ask first; the stage then plays and shows who was right",
      "La question d’abord ; puis la scène joue et tranche",
    ),
    usesScene: true,
  },
  {
    id: "watch",
    kind: "watch",
    title: L("Watch", "Regarder"),
    intent: L(
      "A clip you flew, with cues; the student can take over",
      "Une séquence que vous avez volée, avec repères ; l’élève peut reprendre la main",
    ),
    usesScene: true,
  },
  {
    id: "try",
    kind: "try",
    title: L("Try it", "À vous"),
    intent: L(
      "Live instruments, the knobs you allow, ticked by the sim",
      "Instruments en direct, les commandes permises, cochées par le simulateur",
    ),
    usesScene: true,
  },
  {
    id: "tap",
    kind: "tap",
    title: L("Tap", "Toucher"),
    intent: L(
      "“Tap the lying instrument”, “tap the MDA”",
      "« Touchez l’instrument qui ment », « touchez la MDA »",
    ),
    usesScene: true,
  },
  {
    id: "quiz",
    kind: "quiz",
    title: L("Quiz", "Quiz"),
    intent: L(
      "Multiple choice, a number, an order, or answer by flying",
      "Choix multiple, un nombre, un ordre, ou répondre en pilotant",
    ),
    usesScene: false,
  },
  {
    id: "calc",
    kind: "calc",
    title: L("Calc", "Calcul"),
    intent: L(
      "A generated problem: new numbers each try, worked solution",
      "Un problème généré : nouveaux chiffres à chaque essai, solution détaillée",
    ),
    usesScene: false,
  },
  {
    id: "drill",
    kind: "drill",
    title: L("Drill", "Série"),
    intent: L(
      "Ten quick problems against the clock, practice only",
      "Dix problèmes rapides chronométrés, pour s’entraîner",
    ),
    usesScene: false,
  },
  {
    id: "fly",
    kind: "fly",
    title: L("Fly it", "En vol"),
    intent: L(
      "Brief, fly in the cockpit, graded against pass criteria, back here",
      "Briefing, vol au cockpit, noté selon les critères de réussite, retour ici",
    ),
    usesScene: true,
  },
  {
    id: "page",
    kind: "page",
    title: L("Page", "Page"),
    intent: L(
      "An imported slide or image, with optional reveal text",
      "Une diapositive ou une image importée, avec texte à révéler",
    ),
    usesScene: false,
  },
  {
    id: "slide",
    kind: "slide",
    title: L("Designed slide", "Diapositive libre"),
    intent: L(
      "Free layout: text, photos, live instruments, diagrams",
      "Mise en page libre : texte, photos, instruments en direct, schémas",
    ),
    usesScene: false,
  },
];
export const templateDef = (id: TemplateId): TemplateDef =>
  TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
/** The template a step looks like (the inverse of makeStep, for the "Change to" menu). */
export function templateOf(step: Step): TemplateId {
  if (step.slide && step.kind === "slide") return "slide";
  const t = TEMPLATES.find((x) => x.kind === step.kind);
  return t?.id ?? "explain";
}

// ------------------------------------------------------------------ defaults by cockpit
/** The instrument a new step shows for the course's cockpit. */
export function defaultPane(cockpit: Cockpit): PaneView {
  if (cockpit === "steam")
    return { kind: "six", crop: { region: "STEAM_LEFT:4" } };
  if (cockpit === "airliner") return { kind: "airlinerPfd" };
  return { kind: "pfd" };
}
/** The knobs a Try it opens by default. */
export function defaultControls(cockpit: Cockpit): StageControl[] {
  return cockpit === "airliner" ? ["hdgBug", "crs"] : ["obs1", "hdgBug"];
}
/** A pose for a course with no scene yet: 6 NM west of ARD, 4,000 ft, heading 120, NAV1 on ARD, OBS 090. */
export function starterScene(cockpit: Cockpit, id = "sc-start"): SimScene {
  const sc = sceneFromFields(
    {
      kind: "fields",
      pos: { fix: "ARD", radial: 276, distNm: 6 },
      altFt: 4000,
      hdg: 120,
      iasKt: 100,
      radios: { nav1: "ARD", obs1: 90, cdi: "NAV1", brg1: "NAV1" },
    },
    {
      id,
      cockpit,
      label: "ARD R-276 · 6 NM · 4,000 ft",
      weather: { windDir: 250, windKt: 10 },
    },
  );
  return sc;
}
/** The checks a Try it / Fly it starts with when nothing better is suggested (track the course within 1 dot). */
export function defaultChecks(cockpit: Cockpit): GoalCheck[] {
  return [
    { id: "obs", p: { nav: 1, value: 90, tol: 2 } },
    { id: "cdiDefl", p: { maxDots: cockpit === "steam" ? 2 : 1 } },
  ];
}
export const DEFAULT_GENERATOR: CalcGeneratorId = "ifr.sixtyToOne";
export function defaultCalc(
  gen: CalcGeneratorId = DEFAULT_GENERATOR,
): CalcSpec {
  return { generatorId: gen, showSolution: "onCheck", retry: true };
}
export function defaultDrill(
  ids: CalcGeneratorId[] = [
    "ifr.sixtyToOne",
    "ifr.descentRate",
    "ifr.standardRateBank",
    "ifr.windComponents",
  ],
): DrillSpec {
  return {
    generatorIds: ids,
    count: 10,
    timer: { mode: "stopwatch" },
    feedback: "each",
    practiceOnly: true,
  };
}
export const FLY_OPTIONS: FlyOption[] = [
  "wind",
  "partialPanel",
  "surpriseMe",
  "goMissed",
  "turbulence",
  "allowAp",
];
export function criteriaOf(checks: GoalCheck[]): Criterion[] {
  return checks.map((check, i) => ({
    id: `c${i + 1}`,
    label: L(goalLabel(check, "en"), goalLabel(check, "fr")),
    check,
  }));
}
/** "Do this" rows bound to the goal checks (wording generated, editable). */
export function doThisFor(checks: GoalCheck[]): ReaderBlock {
  return {
    t: "doThis",
    rows: checks.map((c, i) => ({
      text: L(goalRow(c, "en"), goalRow(c, "fr")),
      check: i,
    })),
  };
}

// ------------------------------------------------------------------ ids
let counter = 0;
const rnd = () => Math.random().toString(36).slice(2, 6);
export type IdGen = (prefix: string) => string;
export const defaultIdGen: IdGen = (p) =>
  `${p}-${Date.now().toString(36).slice(-4)}${(counter++).toString(36)}${rnd()}`;
/** A step id not used in the course. */
export function freshStepId(course: Course, gen: IdGen = defaultIdGen): string {
  const used = new Set(course.steps.map((s) => s.id));
  for (const s of course.steps)
    for (const b of s.flyIt?.briefing ?? []) used.add(b.id);
  let id = gen("st");
  while (used.has(id)) id = gen("st");
  return id;
}
function freshKey(used: Record<string, unknown>, base: string): string {
  if (!(base in used)) return base;
  let i = 2;
  while (`${base}-${i}` in used) i++;
  return `${base}-${i}`;
}

// ------------------------------------------------------------------ making a step
export interface MakeOptions {
  /** scene id in course.scenes (default: the current step's, else the course's first, else a starter scene) */
  scene?: string;
  /** clip id (Watch) */
  clip?: string;
  /** asset id (Page) */
  asset?: string;
  /** checks suggested for this scene (goals.suggestGoals) */
  suggested?: GoalCheck[];
  /** designed slides */
  layout?: SlideLayoutId;
  theme?: ThemeId;
  calc?: CalcGeneratorId;
  title?: L10n;
  gen?: IdGen;
}
/** The scene a new step uses: the asked one, the course's first, or a starter scene added to the course. */
function sceneFor(
  course: Course,
  o: MakeOptions,
): { course: Course; scene: string } {
  if (o.scene && course.scenes[o.scene]) return { course, scene: o.scene };
  const first = Object.keys(course.scenes)[0];
  if (first) return { course, scene: first };
  const id = freshKey(course.scenes, "sc-start");
  return {
    course: {
      ...course,
      scenes: { ...course.scenes, [id]: starterScene(course.cockpit, id) },
    },
    scene: id,
  };
}

const T_TITLE: Record<TemplateId, L10n> = {
  explain: L("Parts of the instrument", "Les éléments de l’instrument"),
  predict: L(
    "Which way will the bar move?",
    "De quel côté la barre va-t-elle bouger ?",
  ),
  watch: L("Watch it flown", "Regardez le vol"),
  try: L("Your turn: centre the needle", "À vous : centrez l’aiguille"),
  tap: L("Tap the instrument that is lying", "Touchez l’instrument qui ment"),
  quiz: L("Check your understanding", "Vérifiez vos acquis"),
  calc: L("Work it out", "Calculez"),
  drill: L("Drill: ten in a row", "Série : dix d’affilée"),
  fly: L("Fly it", "En vol"),
  page: L("Page", "Page"),
  slide: L("New slide", "Nouvelle diapositive"),
};

/**
 * A new step from a template, with the course it needs (a starter scene may be added). Pure: ids come from `gen`.
 */
export function makeStep(
  course: Course,
  id: TemplateId,
  o: MakeOptions = {},
): { course: Course; step: Step } {
  const def = templateDef(id);
  const gen = o.gen ?? defaultIdGen;
  let c = course;
  let scene: string | undefined;
  if (def.usesScene || id === "slide") {
    const r = sceneFor(c, o);
    c = r.course;
    scene = r.scene;
  }
  const title = o.title ?? T_TITLE[id];
  const base: Step = {
    id: freshStepId(c, gen),
    kind: def.kind,
    title: clone(title),
    reader: [],
  };
  const pane = defaultPane(c.cockpit);
  const checks = o.suggested?.length
    ? clone(o.suggested)
    : defaultChecks(c.cockpit);
  const stage = (
    mode: StageCue["mode"],
    extra: Partial<StageCue> = {},
  ): StageCue => ({
    panes: [clone(pane)],
    mode,
    ...(scene ? { scene } : {}),
    annotations: [],
    ...extra,
  });
  let step: Step;
  switch (id) {
    case "explain":
      step = {
        ...base,
        minutes: 2,
        reader: [
          { t: "heading", text: clone(title) },
          {
            t: "text",
            text: L(
              "Say what the student sees, one idea per callout.",
              "Dites ce que l’élève voit, une idée par légende.",
            ),
          },
        ],
        stage: stage("frozen"),
      };
      break;
    case "predict":
      step = {
        ...base,
        minutes: 2,
        reader: [{ t: "heading", text: clone(title) }],
        stage: stage("frozen", { liveForS: 10 }),
        quiz: {
          kind: "mcq",
          prompt: L(
            "You hold this heading for 10 seconds. Where will the CDI bar be?",
            "Vous gardez ce cap 10 secondes. Où sera la barre du CDI ?",
          ),
          options: [
            { text: L("Further left", "Plus à gauche") },
            { text: L("Centred", "Centrée") },
            { text: L("Further right", "Plus à droite") },
          ],
          answer: 0,
          explain: L(
            "Watch the bar: it moves toward the side of the course you are heading away from.",
            "Observez la barre : elle se déplace du côté de la route dont vous vous éloignez.",
          ),
        },
      };
      break;
    case "watch":
      step = {
        ...base,
        minutes: 2,
        reader: [
          { t: "heading", text: clone(title) },
          {
            t: "text",
            text: L(
              "Watch the needles. You can take over at any moment.",
              "Observez les aiguilles. Vous pouvez reprendre la main à tout moment.",
            ),
          },
        ],
        stage: stage(
          o.clip ? "clip" : "frozen",
          o.clip ? { clip: o.clip } : {},
        ),
      };
      break;
    case "try":
      step = {
        ...base,
        minutes: 3,
        reader: [{ t: "heading", text: clone(title) }, doThisFor(checks)],
        stage: stage("live", { controls: defaultControls(c.cockpit) }),
        goal: { all: checks, holdS: 5, graded: false, onMet: "stay" },
      };
      break;
    case "tap":
      step = {
        ...base,
        minutes: 1,
        reader: [{ t: "heading", text: clone(title) }],
        stage: stage("frozen"),
        quiz: {
          kind: "tap",
          prompt: clone(title),
          target: { pane: 0, rect: [384, 288, 256, 192] },
          explain: L(
            "Cross-check: the other instruments disagree with it.",
            "Contre-vérifiez : les autres instruments le contredisent.",
          ),
        },
      };
      break;
    case "quiz":
      step = {
        ...base,
        minutes: 1,
        layout: "readerOnly",
        reader: [],
        quiz: {
          kind: "mcq",
          prompt: L(
            `Cleared to hold west of ARD on the 270 radial, right turns. You arrive heading ${String(TPL_HOLD.arrive).padStart(3, "0")}. Which entry?`,
            `Attente à l’ouest d’ARD sur la radiale 270, virages à droite. Vous arrivez au cap ${String(TPL_HOLD.arrive).padStart(3, "0")}. Quelle entrée ?`,
          ),
          options: [
            { text: L("Direct", "Directe") },
            { text: L("Parallel", "Parallèle") },
            { text: L("Teardrop", "Décalée (goutte d’eau)") },
          ],
          // the answer comes from the cockpit's own AIM FIG 5-3-8 rule, never from a hand-made table
          answer: TPL_ENTRY_INDEX[
            holdEntry(TPL_HOLD.inbound, TPL_HOLD.turn, TPL_HOLD.arrive)
          ],
          explain: L(
            "Inbound course 090, right turns: arriving heading 180 from the north (the non-holding side), you turn right at ARD straight onto the outbound leg: direct entry (AIM FIG 5-3-8).",
            "Route de rapprochement 090, virages à droite : en arrivant au cap 180 par le nord (côté non-attente), vous virez à droite sur ARD directement en éloignement : entrée directe (AIM FIG 5-3-8).",
          ),
        },
      };
      break;
    case "calc":
      step = {
        ...base,
        minutes: 3,
        reader: [],
        calc: defaultCalc(o.calc),
      };
      break;
    case "drill":
      step = {
        ...base,
        minutes: 5,
        reader: [],
        drill: defaultDrill(),
      };
      break;
    case "fly":
      step = {
        ...base,
        minutes: 8,
        reader: [{ t: "heading", text: clone(title) }],
        stage: stage("fly"),
        flyIt: {
          target: { kind: "scene", scene: scene!, durationS: 180 },
          brief: L(
            "Intercept and track the course. Keep the bar within one dot.",
            "Interceptez et suivez la route. Gardez la barre à moins d’un point.",
          ),
          options: [
            "wind",
            "partialPanel",
            "surpriseMe",
            "turbulence",
            "allowAp",
          ],
          defaultsOn: ["wind"],
          criteria: criteriaOf(checks),
          returnTo: "thisStep",
        },
      };
      break;
    case "page":
      step = {
        ...base,
        minutes: 1,
        layout: o.asset ? "stageWide" : "readerOnly",
        reader: [{ t: "heading", text: clone(title) }],
        ...(o.asset
          ? {
              stage: {
                panes: [{ kind: "image", asset: o.asset }],
                mode: "frozen",
              } as StageCue,
            }
          : {}),
      };
      break;
    case "slide": {
      const slide = layoutCanvas(o.layout ?? "instrumentNotes", {
        ...(o.theme ? { theme: o.theme } : {}),
        ...(scene ? { scene } : {}),
        ...(o.title ? { title: o.title } : {}),
      });
      if (!o.theme) delete slide.theme;
      // a checklist the sim ticks (checklist, Your turn layouts) points at the step goal's checks: give the step a
      // goal, and rows past its checks stay as plain rows (the author binds them in the inspector)
      const ticks = slide.blocks.some((b) => b.kind === "checklist");
      const goal = ticks ? newGoal(c.cockpit, o.suggested) : undefined;
      if (goal)
        for (const b of slide.blocks)
          if (b.kind === "checklist")
            for (const r of b.rows)
              if (typeof r.check === "number" && r.check >= goal.all.length) delete r.check;
      step = {
        ...base,
        title: o.title ? clone(o.title) : (titleOfSlide(slide) ?? clone(title)),
        layout: "canvas",
        minutes: 1,
        slide,
        reader: linearText(slide),
      };
      if (goal) step.goal = goal;
      break;
    }
  }
  return { course: c, step };
}

// ------------------------------------------------------------------ designed slide ↔ Reader + Stage
const byReadingOrder = (a: SlideBlock, b: SlideBlock) =>
  (a.readOrder ?? 1e9) - (b.readOrder ?? 1e9) ||
  a.frame.y - b.frame.y ||
  a.frame.x - b.frame.x;
/** The slide's first title-like text (the step title when a layout makes it). */
export function titleOfSlide(c: SlideCanvas): L10n | null {
  const t = [...c.blocks]
    .sort(byReadingOrder)
    .find(
      (b) =>
        b.kind === "text" &&
        (b.style === "display" || b.style === "title") &&
        b.text.en.trim(),
    );
  return t && t.kind === "text" ? clone(t.text) : null;
}
/** A designed slide's linear text (screen readers, handout, phone portrait): its texts in reading order. */
export function linearText(c: SlideCanvas): ReaderBlock[] {
  const out: ReaderBlock[] = [];
  for (const b of [...c.blocks].sort(byReadingOrder)) {
    if (b.presenterOnly) continue;
    if (b.kind === "text" && b.text.en.trim()) {
      if (["label", "caption", "eyebrow", "small", "foot"].includes(b.style)) continue;
      out.push(
        b.style === "display" || b.style === "title" || b.style === "heading"
          ? { t: "heading", text: clone(b.text) }
          : { t: "text", text: clone(b.text) },
      );
    } else if (b.kind === "callout" && b.text.en.trim()) {
      const n = b.n ? `${b.n}. ` : "";
      out.push({
        t: "text",
        text: {
          en: n + b.text.en,
          ...(b.text.fr ? { fr: n + b.text.fr } : {}),
        },
      });
    } else if (b.kind === "checklist" && b.rows.length) {
      const rows = b.rows.filter((r) => r.check !== undefined);
      if (rows.length)
        out.push({
          t: "doThis",
          rows: rows.map((r) => ({
            text: clone(r.text),
            check: r.check!,
            ...(r.readout ? { readout: r.readout } : {}),
          })),
        });
    }
  }
  return out;
}

const STEAM_REGION: Record<string, string> = {
  asi: "STEAM_LEFT:0",
  ai: "STEAM_LEFT:1",
  alt: "STEAM_LEFT:2",
  tc: "STEAM_LEFT:3",
  hsi: "STEAM_LEFT:4",
  vsi: "STEAM_LEFT:5",
  cdi: "STEAM_RIGHT:0",
  rmi: "STEAM_RIGHT:1",
};
/** The stage pane that shows what an instrument block shows (gauges become crops of their panel). */
export function paneOfView(v: InstrumentView, cockpit: Cockpit): PaneView {
  if (v.kind !== "gauge") return clone(v) as PaneView;
  const g = v.gauge;
  if (g in STEAM_REGION)
    return {
      kind: STEAM_REGION[g].startsWith("STEAM_LEFT") ? "six" : "stack",
      crop: { region: STEAM_REGION[g] as `STEAM_LEFT:${number}` },
    };
  if (g === "radios") {
    const r = cockpit === "steam" ? RADIO_CROPS.steam : RADIO_CROPS.glass;
    return { kind: r.display as "stack" | "pfd", crop: { rect: [r.rect[0], r.rect[1], r.rect[2], r.rect[3]] } };
  }
  if (g === "mfd.map")
    return { kind: "mfd", crop: { rect: [MFD_MAP_CROP[0], MFD_MAP_CROP[1], MFD_MAP_CROP[2], MFD_MAP_CROP[3]] } };
  const pr = PFD_CROPS[g as keyof typeof PFD_CROPS];
  return { kind: "pfd", crop: { rect: [pr[0], pr[1], pr[2], pr[3]] } };
}
/** The instrument view of a stage pane (null for diagrams and images). */
export function viewOfPane(p: PaneView): InstrumentView | null {
  if (p.kind === "diagram" || p.kind === "still" || p.kind === "image")
    return null;
  const crop = "crop" in p ? p.crop : undefined;
  if (crop && "region" in crop) {
    const g = Object.entries(STEAM_REGION).find(([, r]) => r === crop.region);
    if (g)
      return {
        kind: "gauge",
        gauge: g[0] as InstrumentView extends { gauge: infer G } ? G : never,
      };
  }
  return clone(p) as InstrumentView;
}

/**
 * Reader + Stage → designed slide: the stage pane becomes a live instrument (or diagram / image) block with the same
 * scene, mode, callouts and controls; the reader texts go into the notes column; a "Do this" becomes a checklist and
 * a quiz a quiz block. The reader is kept as the slide's linear text.
 */
export function toDesignedSlide(step: Step, course: Course): Step {
  const s = clone(step);
  const title = s.title;
  const blocks: SlideBlock[] = [];
  let z = 1;
  let n = 1;
  const id = () => `b${n++}`;
  const frame = (x: number, y: number, w: number, h: number) => ({
    x,
    y,
    w,
    h,
    z: z++,
  });
  blocks.push({
    id: id(),
    kind: "text",
    style: "title",
    text: clone(title),
    frame: frame(96, 72, 1728, 120),
  });
  const pane = s.stage?.panes[0];
  const left = { x: 96, y: 240, w: 1032, h: 744 };
  if (pane) {
    const view = viewOfPane(pane);
    if (view)
      blocks.push({
        id: id(),
        kind: "instrument",
        view,
        alt: clone(title),
        ...(s.stage?.scene ? { scene: s.stage.scene } : {}),
        mode:
          s.stage?.mode === "live"
            ? "live"
            : s.stage?.mode === "clip"
              ? "clip"
              : "frozen",
        ...(s.stage?.clip ? { clip: s.stage.clip } : {}),
        ...(s.stage?.controls?.length
          ? { controls: [...s.stage.controls] }
          : {}),
        ...(s.stage?.annotations?.length
          ? { annotations: s.stage.annotations.filter((a) => a.pane === 0) }
          : {}),
        ...(s.stage?.covers?.length ? { covers: [...s.stage.covers] } : {}),
        ...(s.stage?.failuresOnEnter
          ? { failures: { ...s.stage.failuresOnEnter } }
          : {}),
        frame: frame(left.x, left.y, left.w, left.h),
      });
    else if (pane.kind === "diagram")
      blocks.push({
        id: id(),
        kind: "diagram",
        d: clone(pane.d),
        ...(pane.asset ? { asset: pane.asset } : {}),
        alt: clone(title),
        frame: frame(left.x, left.y, left.w, left.h),
      });
    else if (pane.kind === "image" || pane.kind === "still")
      blocks.push({
        id: id(),
        kind: "image",
        image: { asset: pane.asset },
        alt: course.assets[pane.asset]?.alt ?? clone(title),
        fit: "contain",
        frame: frame(left.x, left.y, left.w, left.h),
      });
  }
  // notes column
  const colX = pane ? 1200 : 96;
  const colW = pane ? 624 : 1728;
  let y = 240;
  const texts = s.reader.filter(
    (b) => b.t === "text" || b.t === "takeaway" || b.t === "keys",
  );
  for (const b of texts) {
    if (y > 900) break;
    const text =
      b.t === "keys"
        ? {
            en: b.items.map((i) => `- ${i.en}`).join("\n"),
            ...(b.items.every((i) => i.fr)
              ? { fr: b.items.map((i) => `- ${i.fr}`).join("\n") }
              : {}),
          }
        : clone(b.text);
    const h = Math.min(312, 72 + 24 * Math.ceil(text.en.length / 48));
    blocks.push({
      id: id(),
      kind: "text",
      style: b.t === "takeaway" ? "quote" : "body",
      text,
      frame: frame(colX, y, colW, h),
    });
    y += h + 24;
  }
  const doThis = s.reader.find((b) => b.t === "doThis");
  if (doThis && doThis.t === "doThis" && y < 840)
    blocks.push({
      id: id(),
      kind: "checklist",
      title: L("Do this", "À faire"),
      rows: doThis.rows.map((r) => ({
        text: clone(r.text),
        check: r.check,
        ...(r.readout ? { readout: r.readout } : {}),
      })),
      frame: frame(
        colX,
        y,
        colW,
        Math.min(984 - y, 96 + 72 * doThis.rows.length),
      ),
    });
  else if (s.quiz && y < 744)
    blocks.push({
      id: id(),
      kind: "quiz",
      quiz: clone(s.quiz),
      frame: frame(colX, y, colW, Math.min(984 - y, 456)),
    });
  const slide: SlideCanvas = {
    size: { w: 1920, h: 1080 },
    grid: 24,
    layout: "instrumentNotes",
    blocks,
    ...(s.stage?.scene ? { scene: s.stage.scene } : {}),
  };
  delete s.stage;
  s.slide = slide;
  s.layout = "canvas";
  if (!s.reader.length) s.reader = linearText(slide);
  return s;
}

/**
 * Designed slide → Reader + Stage: the first instrument (else diagram, else course image) becomes the stage pane with
 * its scene, mode, callouts and controls; the reader is the slide's linear text. Other blocks are dropped (undo
 * brings them back).
 */
export function toReaderStage(step: Step, course: Course): Step {
  const s = clone(step);
  const c = s.slide;
  if (!c) return s;
  const sorted = [...c.blocks].sort(byReadingOrder);
  const inst = sorted.find((b) => b.kind === "instrument");
  const diag = sorted.find((b) => b.kind === "diagram" && b.d);
  const img = sorted.find((b) => b.kind === "image" && "asset" in b.image);
  let stage: StageCue | undefined;
  if (inst && inst.kind === "instrument") {
    stage = {
      panes: [paneOfView(inst.view, course.cockpit)],
      mode: inst.mode ?? "frozen",
      ...((inst.scene ?? c.scene) ? { scene: inst.scene ?? c.scene } : {}),
      ...(inst.clip ? { clip: inst.clip } : {}),
      annotations: (inst.annotations ?? []).map((a) => ({
        ...a,
        pane: 0 as const,
      })),
      ...(inst.controls?.length ? { controls: [...inst.controls] } : {}),
      ...(inst.covers?.length ? { covers: [...inst.covers] } : {}),
      ...(inst.failures ? { failuresOnEnter: { ...inst.failures } } : {}),
    };
    if (inst.yourTurn && !s.goal) s.goal = clone(inst.yourTurn.goal);
  } else if (diag && diag.kind === "diagram" && diag.d) {
    stage = {
      panes: [
        {
          kind: "diagram",
          d: clone(diag.d),
          ...(diag.asset ? { asset: diag.asset } : {}),
        },
      ],
      mode: "frozen",
    };
  } else if (img && img.kind === "image" && "asset" in img.image) {
    stage = {
      panes: [{ kind: "image", asset: img.image.asset }],
      mode: "frozen",
    };
  }
  // the reader keeps the slide's words: rebuilt from the slide when it holds only text the slide also has
  const lin = linearText(c);
  const plain = s.reader.every((b) => b.t === "heading" || b.t === "text");
  if (!s.reader.length || (plain && lin.length > s.reader.length)) s.reader = lin;
  const quizBlock = sorted.find((b) => b.kind === "quiz");
  if (!s.quiz && quizBlock && quizBlock.kind === "quiz")
    s.quiz = clone(quizBlock.quiz);
  const calcBlock = sorted.find((b) => b.kind === "calc");
  if (!s.calc && calcBlock && calcBlock.kind === "calc" && s.kind === "calc")
    s.calc = clone(calcBlock.calc);
  delete s.slide;
  if (stage) s.stage = stage;
  if (s.kind === "slide")
    s.kind = stage && stage.panes[0].kind !== "image" ? "explain" : "page";
  s.layout =
    s.kind === "page" && stage ? "stageWide" : stage ? undefined : "readerOnly";
  if (s.layout === undefined) delete s.layout;
  return s;
}

/**
 * Change what a step teaches (Explain → Try it…) keeping its reader, scene and callouts: adds what the new kind
 * needs (controls, a goal, a quiz, a Fly-it card, a CalcSpec), never removes author content.
 */
export function changeKind(
  course: Course,
  step: Step,
  to: TemplateId,
  o: MakeOptions = {},
): { course: Course; step: Step } {
  if (to === "slide")
    return {
      course,
      step: step.slide
        ? { ...clone(step), kind: "slide" }
        : toDesignedSlide({ ...step, kind: "slide" }, course),
    };
  const def = templateDef(to);
  const fresh = makeStep(course, to, {
    ...o,
    scene: o.scene ?? step.stage?.scene ?? step.slide?.scene,
    title: step.title,
    gen: () => step.id,
  });
  const s = clone(step);
  s.kind = def.kind;
  const f = fresh.step;
  if (def.usesScene && !s.stage && !s.slide && f.stage) s.stage = f.stage;
  if (s.stage && f.stage) {
    if (to === "try" && !s.stage.controls?.length)
      s.stage.controls = f.stage.controls;
    if (to === "try" || to === "fly") s.stage.mode = f.stage.mode;
    if (to === "explain" || to === "tap" || to === "predict")
      s.stage.mode = "frozen";
    if (to === "predict" && !s.stage.liveForS) s.stage.liveForS = 10;
  }
  if (to === "try" && !s.goal && f.goal) {
    s.goal = f.goal;
    if (!s.reader.some((b) => b.t === "doThis"))
      s.reader.push(doThisFor(f.goal.all));
  }
  if (
    (to === "predict" || to === "tap" || to === "quiz") &&
    (!s.quiz || (to === "tap") !== (s.quiz.kind === "tap"))
  )
    s.quiz = f.quiz;
  if (to === "fly" && !s.flyIt && f.flyIt) {
    s.flyIt = f.flyIt;
    if (s.goal?.all.length) s.flyIt.criteria = criteriaOf(s.goal.all);
  }
  if (to === "calc" && !s.calc) s.calc = f.calc;
  if (to === "drill" && !s.drill) s.drill = f.drill;
  if (to === "page" && s.stage && s.stage.panes[0].kind === "image")
    s.layout = "stageWide";
  return { course: fresh.course, step: s };
}

// ------------------------------------------------------------------ course edits (all return a new course)
export function insertStep(course: Course, step: Step, at: number): Course {
  const steps = [...course.steps];
  steps.splice(Math.max(0, Math.min(steps.length, at)), 0, step);
  return { ...course, steps };
}
export function replaceStep(course: Course, step: Step): Course {
  return {
    ...course,
    steps: course.steps.map((s) => (s.id === step.id ? step : s)),
  };
}
export function moveStep(course: Course, from: number, to: number): Course {
  const n = course.steps.length;
  if (from < 0 || from >= n) return course;
  const t = Math.max(0, Math.min(n - 1, to));
  if (t === from) return course;
  const steps = [...course.steps];
  const [s] = steps.splice(from, 1);
  steps.splice(t, 0, s);
  return { ...course, steps };
}
export function removeStep(course: Course, i: number): Course {
  if (i < 0 || i >= course.steps.length) return course;
  return { ...course, steps: course.steps.filter((_, j) => j !== i) };
}
/** A copy right after the original, with a fresh id and "(copy)" in the title; references to it are not copied. */
export function duplicateStep(
  course: Course,
  i: number,
  gen: IdGen = defaultIdGen,
): { course: Course; step: Step } | null {
  const src = course.steps[i];
  if (!src) return null;
  const s = clone(src);
  s.id = freshStepId(course, gen);
  s.title = {
    en: `${src.title.en} (copy)`,
    ...(src.title.fr !== undefined ? { fr: `${src.title.fr} (copie)` } : {}),
  };
  return { course: insertStep(course, s, i + 1), step: s };
}

/** Add a tray capture to the course (its scene, and its clip when it is one) and make a step of it. */
export function stepFromTray(
  course: Course,
  item: TrayItem,
  id: TemplateId,
  o: MakeOptions = {},
  /** what the store knows of the capture's images (bytes, size, type); nominal values otherwise */
  refs: Record<string, AssetRef> = {},
): { course: Course; step: Step } {
  let c = course;
  const sc = clone(item.scene);
  let sceneId = sc.id || "sc";
  const same =
    c.scenes[sceneId] &&
    JSON.stringify(c.scenes[sceneId]) === JSON.stringify(sc);
  if (!same) {
    sceneId = freshKey(c.scenes, sceneId);
    sc.id = sceneId;
    if (item.thumb && sc.captured && !sc.captured.thumb)
      sc.captured.thumb = item.thumb;
    if (item.still && sc.captured && !sc.captured.still)
      sc.captured.still = item.still;
    c = { ...c, scenes: { ...c.scenes, [sceneId]: sc } };
    // the panel thumbnail and the 3D still the scene names are course assets (exported with it)
    const add: Record<string, AssetRef> = {};
    for (const [aid, role, w, hh] of [
      [sc.captured?.thumb, "thumb", 320, 240],
      [sc.captured?.still, "still", 480, 270],
    ] as const)
      if (aid && !c.assets[aid])
        add[aid] = refs[aid] ?? { id: aid, mime: "image/jpeg", w, h: hh, bytes: 0, role };
    if (Object.keys(add).length) c = { ...c, assets: { ...c.assets, ...add } };
  }
  let clipId: string | undefined;
  if (item.clip) {
    const cl: Clip = clone(item.clip);
    clipId = freshKey(c.clips, cl.id || "clip");
    cl.id = clipId;
    cl.startScene = sceneId;
    c = { ...c, clips: { ...c.clips, [clipId]: cl } };
  }
  const tmpl: TemplateId = id === "watch" && !clipId ? "explain" : id;
  const title = item.label ? { en: item.label, fr: item.label } : undefined;
  const made = makeStep(c, tmpl, {
    ...o,
    scene: sceneId,
    clip: clipId,
    ...(title && !o.title ? { title } : {}),
  });
  if (tmpl === "slide" && made.step.slide) {
    // the capture's scene drives every instrument of the new slide
    made.step.slide.scene = sceneId;
    for (const b of made.step.slide.blocks)
      if (b.kind === "instrument" && !b.fromCalc) b.scene = sceneId;
  }
  return made;
}

// ------------------------------------------------------------------ what the inspector shows
export type InspectorTab =
  | "reader"
  | "stage"
  | "goal"
  | "notes"
  | "calc"
  | "drill"
  | "fly"
  | "quiz"
  | "block"
  | "slide";
export const TAB_LABEL: Record<InspectorTab, L10n> = {
  reader: L("Reader", "Texte"),
  stage: L("Stage", "Scène"),
  goal: L("Goal", "Objectif"),
  notes: L("Notes", "Notes"),
  calc: L("Calc", "Calcul"),
  drill: L("Drill", "Série"),
  fly: L("Fly it", "En vol"),
  quiz: L("Quiz", "Quiz"),
  block: L("Block", "Bloc"),
  slide: L("Slide", "Diapo"),
};
/** The inspector tabs for a step (the mockup's Reader | Stage | Goal | Notes, adapted to the kind). */
export function inspectorTabs(step: Step): InspectorTab[] {
  if (step.slide) return ["block", "slide", "goal", "notes"];
  switch (step.kind) {
    case "calc":
      return ["calc", "reader", "notes"];
    case "drill":
      return ["drill", "reader", "notes"];
    case "fly":
      return ["fly", "reader", "stage", "notes"];
    case "quiz":
      return step.stage
        ? ["quiz", "reader", "stage", "notes"]
        : ["quiz", "reader", "notes"];
    case "predict":
    case "tap":
      return ["reader", "stage", "quiz", "notes"];
    case "page":
      return ["reader", "stage", "notes"];
    default:
      return ["reader", "stage", "goal", "notes"];
  }
}

// ------------------------------------------------------------------ step facts (step bar, step list)
/** Reveal positions of a step (reader reveal steps, callouts by reveal step, slide click reveals). */
export function revealsOf(step: Step): number {
  let n = 0;
  if (step.slide) {
    const orders = new Set<number>();
    for (const b of step.slide.blocks)
      if (b.reveal && (b.reveal.when ?? "click") === "click")
        orders.add(b.reveal.order);
    return orders.size;
  }
  for (const a of step.stage?.annotations ?? [])
    if (a.when && typeof a.when === "object") n = Math.max(n, a.when.step);
  const walk = (bs: ReaderBlock[]) => {
    for (const b of bs)
      if (b.t === "reveal") {
        if (typeof b.when === "object") n = Math.max(n, b.when.step);
        walk(b.blocks);
      }
  };
  walk(step.reader);
  return n;
}
/** Author minutes, else a rough estimate from the kind and the text length. */
export function minutesOf(step: Step): number {
  if (step.minutes) return step.minutes;
  const base: Partial<Record<StepKind, number>> = {
    fly: 8,
    drill: 5,
    calc: 3,
    try: 3,
    watch: 2,
    predict: 2,
  };
  let words = 0;
  eachText(step.reader, (t) => (words += t.en.split(/\s+/).length));
  if (step.slide)
    eachText(step.slide.blocks, (t) => (words += t.en.split(/\s+/).length));
  return Math.max(
    base[step.kind] ?? 1,
    Math.round((words / 130) * 2) / 2 || 0.5,
  );
}
/** French texts missing in one step (the "FR · 2 missing" badge). */
export function missingFr(x: unknown): number {
  let n = 0;
  eachText(x, (t) => {
    if (t.en.trim() && !(t.fr ?? "").trim()) n++;
  });
  return n;
}
export function courseMissingFr(course: Course): number {
  if (!course.langs.includes("fr")) return 0;
  return missingFr({
    title: course.title,
    summary: course.summary,
    steps: course.steps,
  });
}
/** "Step 4 of 12 · 3 reveals · about 1.5 min" */
export function stepBarText(
  course: Course,
  i: number,
  lang: Lang,
): { head: string; tail: string } {
  const s = course.steps[i];
  const fr = lang === "fr";
  const head = fr
    ? `Étape ${i + 1} sur ${course.steps.length}`
    : `Step ${i + 1} of ${course.steps.length}`;
  if (!s) return { head, tail: "" };
  const r = revealsOf(s);
  const parts: string[] = [];
  if (r)
    parts.push(
      fr
        ? `${r} apparition${r > 1 ? "s" : ""}`
        : `${r} reveal${r > 1 ? "s" : ""}`,
    );
  const m = minutesOf(s);
  const mt = String(m).replace(".", fr ? "," : ".");
  parts.push(fr ? `environ ${mt} min` : `about ${mt} min`);
  return { head, tail: parts.join(" · ") };
}
export function courseMinutes(course: Course): number {
  return Math.round(course.steps.reduce((a, s) => a + minutesOf(s), 0));
}

// ------------------------------------------------------------------ callouts
/** A new numbered callout at the pane's centre (or near the last one). */
export function newCallout(cue: StageCue, at?: [number, number]): Annotation {
  const list = cue.annotations ?? [];
  const n = list.filter((a) => a.type === "callout").length + 1;
  const used = new Set(list.map((a) => a.id));
  let k = n;
  while (used.has(`a${k}`)) k++;
  const maxStep = Math.max(
    0,
    ...list.map((a) =>
      a.when && typeof a.when === "object" ? a.when.step : 0,
    ),
  );
  return {
    id: `a${k}`,
    pane: 0,
    type: "callout",
    n,
    at: at ?? [512 + ((n * 37) % 160) - 80, 384 + ((n * 53) % 120) - 60],
    text: L("", ""),
    when: { step: maxStep + 1 },
  };
}
/** Renumber callouts 1..n in list order (after a reorder or a delete). */
export function renumberCallouts(list: Annotation[]): Annotation[] {
  let n = 0;
  return list.map((a) => (a.type === "callout" ? { ...a, n: ++n } : a));
}

// ------------------------------------------------------------------ the course undo history
/**
 * Snapshots of the whole course (JSON), coalesced by key: typing in one field is one undo step, not one per key.
 */
export class CourseHistory {
  private past: string[] = [];
  private future: string[] = [];
  private lastKey: string | null = null;
  private lastT = 0;
  constructor(
    private cur: string,
    private o: { max?: number; coalesceMs?: number; now?: () => number } = {},
  ) {}
  static of(
    c: Course,
    o?: ConstructorParameters<typeof CourseHistory>[1],
  ): CourseHistory {
    return new CourseHistory(JSON.stringify(c), o);
  }
  get current(): Course {
    return JSON.parse(this.cur) as Course;
  }
  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
  /** Record a new state; `key` coalesces with the previous push of the same key within coalesceMs. */
  push(c: Course, key?: string): boolean {
    const next = JSON.stringify(c);
    if (next === this.cur) return false;
    const now = (this.o.now ?? Date.now)();
    const coalesce =
      !!key &&
      key === this.lastKey &&
      now - this.lastT < (this.o.coalesceMs ?? 1200);
    if (!coalesce) {
      this.past.push(this.cur);
      const max = this.o.max ?? 120;
      if (this.past.length > max) this.past.splice(0, this.past.length - max);
    }
    this.cur = next;
    this.future = [];
    this.lastKey = key ?? null;
    this.lastT = now;
    return true;
  }
  /** Replace the current state without an undo step (a save bumped rev / updated / hash). */
  amend(c: Course) {
    this.cur = JSON.stringify(c);
  }
  undo(): Course | null {
    const p = this.past.pop();
    if (p === undefined) return null;
    this.future.push(this.cur);
    this.cur = p;
    this.lastKey = null;
    return this.current;
  }
  redo(): Course | null {
    const f = this.future.pop();
    if (f === undefined) return null;
    this.past.push(this.cur);
    this.cur = f;
    this.lastKey = null;
    return this.current;
  }
}

// ------------------------------------------------------------------ quiz defaults (the Quiz tab's kind switch)
export function quizOfKind(kind: Quiz["kind"], prev?: Quiz): Quiz {
  const prompt =
    prev && "prompt" in prev && prev.prompt ? clone(prev.prompt) : L("", "");
  const explain =
    prev && "explain" in prev && prev.explain ? clone(prev.explain) : L("", "");
  switch (kind) {
    case "mcq":
      return {
        kind,
        prompt,
        options:
          prev?.kind === "order"
            ? prev.items.map((t) => ({ text: clone(t) }))
            : [{ text: L("", "") }, { text: L("", "") }, { text: L("", "") }],
        answer: 0,
        explain,
      };
    case "numeric":
      return { kind, prompt, answer: 0, tol: 1, unit: "", explain };
    case "order":
      return {
        kind,
        prompt,
        items:
          prev?.kind === "mcq"
            ? prev.options.map((o) => clone(o.text))
            : [L("", ""), L("", ""), L("", "")],
        explain,
      };
    case "tap":
      return {
        kind,
        prompt,
        target: { pane: 0, rect: [384, 288, 256, 192] },
        explain,
      };
    case "fly":
      return {
        kind,
        prompt,
        answer: [{ id: "obs", p: { nav: 1, value: 90, tol: 2 } }],
        explain,
      };
    case "calc":
      return {
        kind,
        calc: defaultCalc(),
        ...(prompt.en ? { prompt } : {}),
        ...(explain.en ? { explain } : {}),
      };
  }
}

/** A goal with the defaults the Goal tab starts from. */
export function newGoal(cockpit: Cockpit, suggested?: GoalCheck[]): StepGoal {
  return {
    all: suggested?.length ? clone(suggested) : defaultChecks(cockpit),
    holdS: 5,
    graded: false,
    onMet: "stay",
  };
}
export type { FlyIt };
