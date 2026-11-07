// Ground school — course validation (SPEC §9.2 validate.ts): shape, ids, references, sizes, the rules the data model
// states in comments, and the checks-panel advisories (SPEC §2.1 A7). Plus the content hash and translation counts.
//
//   validateCourse(x, ctx?)   → CourseIssue[]   never throws, whatever `x` is (an import, a share link, a draft)
//   isStructurallyValid(issues)                  no 'structural' error: the course can be stored and opened
//   courseAdvisories(course, ctx?)               checks-panel warnings that never block (pacing, missing FR, …)
//   missingTranslations(course)                  author texts without FR when the course lists 'fr'
//   courseHash(course)                           16 hex of the sha-256 of the canonical JSON (no rev / updated / hash)
//
// Levels: 'error' = the course would play wrong or breaks a rule (a missing scene, an image without alt text, a
// graded step with an assist); 'warn' = advisory. Errors whose code is STRUCTURAL mean the course cannot be stored
// or opened at all (not a course, duplicate step ids…); the editor still saves drafts with content errors.
import type {
  AssetRef,
  BlockAction,
  CalcGeneratorId,
  CalcSpec,
  CalcUnit,
  ColorToken,
  Course,
  CourseProgram,
  CourseShape,
  Criterion,
  DiagramSpec,
  DrillSpec,
  FlyOption,
  GoalCheck,
  ImageSource,
  InstrumentGauge,
  L10n,
  Lang,
  PaneView,
  Quiz,
  ReaderBlock,
  ReadoutId,
  SlideBlockKind,
  SlideCanvas,
  SlideLayoutId,
  StageControl,
  Step,
  StepKind,
  StepRef,
  TextStyle,
  ThemeId,
  YourTurn,
} from "./types";
import { goalParamIssues } from "./goals";
import { sha256Hex } from "../lib/idb";

export type IssueLevel = "error" | "warn";
export type IssueCode =
  | "shape" // not a course / wrong format or version / malformed field
  | "id" // missing, malformed or duplicate id
  | "kind" // unknown kind, or a kind without its spec (calc without CalcSpec…)
  | "l10n" // a required text is empty
  | "ref.scene"
  | "ref.clip"
  | "ref.asset"
  | "ref.step"
  | "ref.block"
  | "ref.goal" // a goal index / afterCheck / checklist row out of range
  | "goal" // a goal check with bad params
  | "graded" // a graded step / YourTurn with an assist (never ACS-graded, SPEC §4.3)
  | "quiz"
  | "calc"
  | "drill"
  | "slide" // canvas size, frames, block fields
  | "alt" // image / instrument / diagram without alt text (SPEC §7)
  | "url" // a link that is not http(s)
  | "size"
  // advisories (checks panel)
  | "fr" // missing French text
  | "attribution" // an image without attribution
  | "pacing" // 4 steps in a row without a student action
  | "flyReturn" // a Fly it with no return
  | "flyCriteria" // a Fly it the sim cannot grade (no criteria, not a lesson)
  | "plate" // a plate not pre-rendered
  | "procedure" // a procedure that no longer exists
  | "wording"; // "approved", "credit", "loggable" (SPEC §9.8)
export interface CourseIssue {
  level: IssueLevel;
  code: IssueCode;
  /** JSON-ish path: steps[3].slide.blocks[2].alt */
  path: string;
  stepId?: string;
  blockId?: string;
  message: L10n;
}
/** errors with these codes make a course unusable (refused by the store and by imports) */
export const STRUCTURAL: ReadonlySet<IssueCode> = new Set<IssueCode>([
  "shape",
  "id",
  "size",
]);
export const isStructurallyValid = (issues: CourseIssue[]) =>
  !issues.some((i) => i.level === "error" && STRUCTURAL.has(i.code));
export const hasErrors = (issues: CourseIssue[]) =>
  issues.some((i) => i.level === "error");

export const COURSE_LIMITS = {
  /** course JSON without asset bytes */
  jsonWarnBytes: 1_000_000,
  jsonMaxBytes: 8_000_000,
  steps: 400,
  blocksPerSlide: 200,
  /** the size meter warns at 20 MB (SPEC §9.7) */
  fileWarnBytes: 20 * 1024 * 1024,
  /** pacing advisory: this many steps in a row without a student action */
  pacingRun: 4,
} as const;

// ------------------------------------------------------------------ enums (Record<Union, 1> keeps them exhaustive)
const keys = <T extends string>(r: Record<T, 1>) =>
  new Set(Object.keys(r) as T[]);
export const STEP_KINDS = keys<StepKind>({
  page: 1,
  explain: 1,
  predict: 1,
  watch: 1,
  try: 1,
  tap: 1,
  quiz: 1,
  fly: 1,
  calc: 1,
  drill: 1,
  slide: 1,
  debrief: 1,
  plate: 1,
  compare: 1,
  decision: 1,
});
const BLOCK_KINDS = keys<SlideBlockKind>({
  text: 1,
  image: 1,
  shape: 1,
  arrow: 1,
  callout: 1,
  marker: 1,
  diagram: 1,
  instrument: 1,
  simViewport: 1,
  quiz: 1,
  calc: 1,
  checklist: 1,
});
const TEXT_STYLES = keys<TextStyle>({
  display: 1,
  title: 1,
  subtitle: 1,
  heading: 1,
  body: 1,
  caption: 1,
  label: 1,
  number: 1,
  quote: 1,
  mono: 1,
  lead: 1,
  small: 1,
  eyebrow: 1,
  foot: 1,
  formula: 1,
});
const COLOR_NAMES = keys<Exclude<ColorToken, `#${string}`>>({
  bg: 1,
  surface: 1,
  line: 1,
  text: 1,
  muted: 1,
  accent: 1,
  brand: 1,
  ok: 1,
  warn: 1,
  danger: 1,
  magenta: 1,
  cyan: 1,
  green: 1,
  amber: 1,
  white: 1,
  ink2: 1,
  rule: 1,
  ruleStrong: 1,
  raise: 1,
  path: 1,
  sel: 1,
  nav: 1,
  key: 1,
  stop: 1,
  accentInk: 1,
});
const CONTROLS = keys<StageControl>({
  obs1: 1,
  obs2: 1,
  hdgBug: 1,
  crs: 1,
  altBug: 1,
  baro: 1,
  bank: 1,
  pitch: 1,
  power: 1,
  cdiSource: 1,
  brg1: 1,
  brg2: 1,
  dragAircraft: 1,
  ap: 1,
});
const FLY_OPTIONS = keys<FlyOption>({
  wind: 1,
  partialPanel: 1,
  surpriseMe: 1,
  goMissed: 1,
  turbulence: 1,
  allowAp: 1,
});
const READOUTS = keys<ReadoutId>({
  obs1: 1,
  toFrom: 1,
  cdiDots: 1,
  gsDots: 1,
  hdg: 1,
  trk: 1,
  alt: 1,
  ias: 1,
  dme: 1,
  radial: 1,
  holdS: 1,
  entry: 1,
  vs: 1,
  gs: 1,
  wca: 1,
});
const LAYOUTS = keys<SlideLayoutId>({
  cover: 1,
  bigNumber: 1,
  heroDiagram: 1,
  formula: 1,
  quiz: 1,
  recap: 1,
  ready: 1,
  title: 1,
  section: 1,
  twoColumn: 1,
  instrumentNotes: 1,
  compare: 1,
  stepByStep: 1,
  fullBleed: 1,
  checklist: 1,
  yourTurn: 1,
  calc: 1,
  blank: 1,
});
const THEMES = keys<ThemeId>({
  cockpit: 1,
  classroom: 1,
  projector: 1,
  brand: 1,
});
const SHAPES = keys<CourseShape>({ course: 1, lesson: 1, briefing: 1 });
const COURSE_PROGRAMS = new Set<string>(
  Object.keys({
    lapl: 1,
    ppl: 1,
    "lapl-ppl": 1,
    night: 1,
    ir: 1,
    atpl: 1,
    club: 1,
    instructors: 1,
  } satisfies Record<CourseProgram, 1>),
);
const GAUGES = keys<InstrumentGauge>({
  asi: 1,
  ai: 1,
  alt: 1,
  tc: 1,
  hsi: 1,
  vsi: 1,
  cdi: 1,
  rmi: 1,
  "pfd.attitude": 1,
  "pfd.hsi": 1,
  "pfd.tapes": 1,
  radios: 1,
  "mfd.map": 1,
});
const CALC_UNITS = keys<CalcUnit>({
  deg: 1,
  NM: 1,
  SM: 1,
  km: 1,
  m: 1,
  ft: 1,
  kt: 1,
  kmh: 1,
  mph: 1,
  fpm: 1,
  ftPerNm: 1,
  pct: 1,
  min: 1,
  s: 1,
  h: 1,
  usgal: 1,
  L: 1,
  lb: 1,
  kg: 1,
  gph: 1,
  lph: 1,
  inHg: 1,
  hPa: 1,
  degC: 1,
  degF: 1,
  in: 1,
  lbIn: 1,
  none: 1,
});
/** every calc generator id (the registry in course/calc is a Record over the same union) */
export const CALC_GENERATOR_IDS = [
  ...keys<CalcGeneratorId>({
    "ifr.sixtyToOne": 1,
    "ifr.descentGradient": 1,
    "ifr.descentRate": 1,
    "ifr.topOfDescent": 1,
    "ifr.standardRateBank": 1,
    "ifr.turnRadius": 1,
    "ifr.dmeArcLead": 1,
    "ifr.interceptLead": 1,
    "ifr.holdWind": 1,
    "ifr.holdTiming": 1,
    "ifr.holdSpeed": 1,
    "ifr.vdp": 1,
    "ifr.timeSpeedDistance": 1,
    "ifr.fuelReserve": 1,
    "ifr.tasFromIas": 1,
    "ifr.coldTemperature": 1,
    "ifr.pressureAltitude": 1,
    "ifr.densityAltitude": 1,
    "ifr.adfBearing": 1,
    "ifr.vorRadial": 1,
    "ifr.windComponents": 1,
    "ifr.climbGradient": 1,
    "ifr.visibility": 1,
    "vfr.tvmdc": 1,
    "vfr.groundSpeedEte": 1,
    "vfr.fuelEndurance": 1,
    "vfr.pressureDensityAltitude": 1,
    "vfr.crosswind": 1,
    "vfr.weightBalance": 1,
    "vfr.takeoffLandingFactors": 1,
    "vfr.unitConversion": 1,
  }),
] as readonly CalcGeneratorId[];
const GENERATORS = new Set<string>(CALC_GENERATOR_IDS);
const PANE_KINDS = new Set([
  "pfd",
  "mfd",
  "six",
  "stack",
  "airlinerPfd",
  "nd",
  "diagram",
  "still",
  "image",
]);
const INSTRUMENT_PANES = new Set([
  "pfd",
  "mfd",
  "six",
  "stack",
  "airlinerPfd",
  "nd",
]);
const ASSET_MIME = new Set<AssetRef["mime"]>([
  "image/webp",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
]);
const LIB_ID = /^(icon|diagram|photo|shape|logo):[a-z0-9][a-z0-9._/-]*$/i;
export const COURSE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
/** a student action: what the pacing rule counts (SPEC §2.1 A7) */
const ACTION_KINDS = new Set<StepKind>([
  "predict",
  "try",
  "tap",
  "quiz",
  "fly",
  "calc",
  "drill",
  "decision",
  "plate",
]);

// ------------------------------------------------------------------ helpers
const L = (en: string, fr: string): L10n => ({ en, fr });
const isObj = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const isNum = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);
const isInt = (x: unknown): x is number => Number.isInteger(x);
const isStr = (x: unknown): x is string => typeof x === "string";
export const isL10n = (x: unknown): x is L10n =>
  isObj(x) && isStr(x.en) && (x.fr === undefined || isStr(x.fr));
const filled = (x: unknown) => isL10n(x) && x.en.trim().length > 0;
const isColor = (x: unknown) =>
  isStr(x) && (COLOR_NAMES.has(x as never) || /^#[0-9a-fA-F]{6}$/.test(x));
const isRect = (x: unknown) =>
  Array.isArray(x) &&
  x.length === 4 &&
  x.every(isNum) &&
  (x[2] as number) > 0 &&
  (x[3] as number) > 0;
const isUnitRect = (x: unknown) =>
  isRect(x) &&
  (x as number[]).every((v) => v >= -1e-9 && v <= 1 + 1e-9) &&
  (x as number[])[0] + (x as number[])[2] <= 1 + 1e-6 &&
  (x as number[])[1] + (x as number[])[3] <= 1 + 1e-6;
const isPt = (x: unknown) =>
  Array.isArray(x) && x.length === 2 && x.every(isNum);

interface Ctx {
  course: Course;
  out: CourseIssue[];
  stepIds: Set<string>;
  calcSteps: Set<string>;
  /** optional lookups the host can give (procedure library, other courses' steps) */
  host: ValidateContext;
}
export interface ValidateContext {
  /** does this procedure id exist (club + library)? */
  procedureExists?: (id: string) => boolean;
  /** does a step of another course exist? (cross-course StepRef) */
  stepExists?: (courseId: string, stepId: string) => boolean;
  /** asset bytes stored (for the 20 MB meter) */
  assetBytes?: number;
}

function push(
  cx: Ctx,
  level: IssueLevel,
  code: IssueCode,
  path: string,
  message: L10n,
  ids: { stepId?: string; blockId?: string } = {},
) {
  cx.out.push({ level, code, path, message, ...ids });
}

// ------------------------------------------------------------------ entry point
/** Validate anything claimed to be a course. Never throws. */
export function validateCourse(
  x: unknown,
  host: ValidateContext = {},
): CourseIssue[] {
  const out: CourseIssue[] = [];
  try {
    validateInto(x, out, host);
  } catch (e) {
    out.push({
      level: "error",
      code: "shape",
      path: "",
      message: L(
        `Unreadable course (${(e as Error)?.message ?? e})`,
        `Cours illisible (${(e as Error)?.message ?? e})`,
      ),
    });
  }
  return out;
}

function validateInto(x: unknown, out: CourseIssue[], host: ValidateContext) {
  const shape = (path: string, en: string, fr: string) =>
    out.push({ level: "error", code: "shape", path, message: L(en, fr) });
  if (!isObj(x))
    return shape("", "This is not a course", "Ce n’est pas un cours");
  if (x.format !== "ifr-course")
    return shape(
      "format",
      "This is not a course (format)",
      "Ce n’est pas un cours (format)",
    );
  if (x.version !== 1)
    return shape(
      "version",
      isNum(x.version) && x.version > 1
        ? "Course made by a newer version: update the simulator"
        : "Unknown course version",
      isNum(x.version) && x.version > 1
        ? "Cours créé par une version plus récente : mettez le simulateur à jour"
        : "Version de cours inconnue",
    );
  if (!isStr(x.id) || !COURSE_ID.test(x.id))
    out.push({
      level: "error",
      code: "id",
      path: "id",
      message: L(
        "The course id is missing or malformed",
        "L’identifiant du cours est absent ou invalide",
      ),
    });
  if (!isInt(x.rev) || (x.rev as number) < 0)
    shape("rev", "rev must be a whole number", "rev doit être un entier");
  if (!isStr(x.updated) || Number.isNaN(Date.parse(x.updated)))
    shape(
      "updated",
      "updated must be an ISO date",
      "updated doit être une date ISO",
    );
  if (!filled(x.title))
    out.push({
      level: "error",
      code: "l10n",
      path: "title",
      message: L("The course has no title", "Le cours n’a pas de titre"),
    });
  if (!isObj(x.author) || !isStr(x.author.name))
    shape("author", "author.name is missing", "author.name est absent");
  if (
    !Array.isArray(x.langs) ||
    !x.langs.length ||
    !x.langs.every((l) => l === "en" || l === "fr")
  )
    shape(
      "langs",
      "langs must list 'en' and/or 'fr'",
      "langs doit lister 'en' et/ou 'fr'",
    );
  if (!["g1000", "steam", "airliner"].includes(x.cockpit as string))
    shape("cockpit", "Unknown cockpit", "Cockpit inconnu");
  if (
    !isObj(x.world) ||
    !(
      x.world.kind === "training" ||
      (x.world.kind === "real" && isStr(x.world.region))
    )
  )
    shape(
      "world",
      "world must be training or real with a region",
      "world doit être training ou real avec une région",
    );
  for (const k of ["scenes", "clips", "assets"] as const)
    if (!isObj(x[k]))
      shape(k, `${k} must be an object`, `${k} doit être un objet`);
  if (!Array.isArray(x.steps))
    return shape("steps", "steps must be a list", "steps doit être une liste");
  if (out.some((i) => i.code === "shape")) return;

  const course = x as unknown as Course;
  let json = "";
  try {
    json = JSON.stringify(course);
  } catch {
    return shape(
      "",
      "The course is not plain JSON",
      "Le cours n’est pas du JSON simple",
    );
  }
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > COURSE_LIMITS.jsonMaxBytes)
    out.push({
      level: "error",
      code: "size",
      path: "",
      message: L(
        `The course text is too large (${mb(bytes)}); move images to assets`,
        `Le texte du cours est trop gros (${mb(bytes)}) ; mettez les images en ressources`,
      ),
    });
  else if (bytes > COURSE_LIMITS.jsonWarnBytes)
    out.push({
      level: "warn",
      code: "size",
      path: "",
      message: L(
        `Large course text (${mb(bytes)})`,
        `Texte du cours volumineux (${mb(bytes)})`,
      ),
    });
  if (course.steps.length > COURSE_LIMITS.steps)
    out.push({
      level: "error",
      code: "size",
      path: "steps",
      message: L(
        `Too many steps (${course.steps.length}, max ${COURSE_LIMITS.steps})`,
        `Trop d’étapes (${course.steps.length}, max ${COURSE_LIMITS.steps})`,
      ),
    });

  const cx: Ctx = {
    course,
    out,
    stepIds: new Set(),
    calcSteps: new Set(),
    host,
  };
  // ids first (references may point forward), nested briefing steps included
  const seen = new Set<string>();
  const collect = (steps: unknown[], path: string, nested: boolean) =>
    steps.forEach((s, i) => {
      if (!isObj(s) || !isStr(s.id) || !s.id) {
        out.push({
          level: "error",
          code: nested ? "shape" : "id",
          path: `${path}[${i}].id`,
          message: L("A step has no id", "Une étape n’a pas d’identifiant"),
        });
        return;
      }
      if (seen.has(s.id))
        out.push({
          level: nested ? "warn" : "error",
          code: "id",
          path: `${path}[${i}].id`,
          stepId: s.id,
          message: L(
            `Duplicate step id '${s.id}'`,
            `Identifiant d’étape en double « ${s.id} »`,
          ),
        });
      seen.add(s.id);
      cx.stepIds.add(s.id);
      if (s.kind === "calc" || isObj(s.calc)) cx.calcSteps.add(s.id);
      if (isObj(s.flyIt) && Array.isArray(s.flyIt.briefing))
        collect(s.flyIt.briefing, `${path}[${i}].flyIt.briefing`, true);
    });
  collect(course.steps, "steps", false);

  // course-level fields
  if (course.theme !== undefined && !THEMES.has(course.theme))
    push(cx, "error", "shape", "theme", L("Unknown theme", "Thème inconnu"));
  if (course.shape !== undefined && !SHAPES.has(course.shape))
    push(
      cx,
      "error",
      "shape",
      "shape",
      L("Unknown course shape", "Forme de cours inconnue"),
    );
  if (course.brand !== undefined) {
    if (
      !isObj(course.brand) ||
      !isStr(course.brand.name) ||
      !/^#[0-9a-fA-F]{6}$/.test(String(course.brand.color))
    )
      push(
        cx,
        "error",
        "shape",
        "brand",
        L(
          "The school brand needs a name and a #rrggbb colour",
          "La marque de l’école demande un nom et une couleur #rrggbb",
        ),
      );
    else if (course.brand.logo)
      imageSource(cx, course.brand.logo, "brand.logo");
  }
  if (course.theme === "brand" && !course.brand)
    push(
      cx,
      "warn",
      "shape",
      "theme",
      L(
        "Theme 'brand' without a school brand: the classroom colours are used",
        "Thème « marque » sans marque d’école : les couleurs « classe » sont utilisées",
      ),
    );
  if (
    course.tags !== undefined &&
    (!Array.isArray(course.tags) ||
      !course.tags.every((t) => isStr(t) && t === t.toLowerCase()))
  )
    push(
      cx,
      "warn",
      "shape",
      "tags",
      L(
        "Tags must be lower-case words",
        "Les étiquettes doivent être en minuscules",
      ),
    );
  if (
    course.program !== undefined &&
    !(Array.isArray(course.program) ? course.program : [course.program]).every(
      (x) => isStr(x) && COURSE_PROGRAMS.has(x),
    )
  )
    push(
      cx,
      "warn",
      "shape",
      "program",
      L("Unknown library program", "Programme de bibliothèque inconnu"),
    );
  if (course.level !== undefined && ![1, 2, 3].includes(course.level))
    push(
      cx,
      "warn",
      "shape",
      "level",
      L("The level is 1, 2 or 3", "Le niveau vaut 1, 2 ou 3"),
    );
  if (course.briefingFor?.step)
    stepRef(cx, course.briefingFor.step, "briefingFor.step");

  for (const [k, a] of Object.entries(course.assets)) {
    const p = `assets.${k}`;
    if (!isObj(a) || a.id !== k)
      push(
        cx,
        "error",
        "ref.asset",
        p,
        L(
          "Asset key and id differ",
          "La clé et l’id de la ressource diffèrent",
        ),
      );
    else {
      if (!ASSET_MIME.has(a.mime))
        push(
          cx,
          "error",
          "ref.asset",
          `${p}.mime`,
          L(
            `Unsupported image type ${a.mime}`,
            `Type d’image non pris en charge ${a.mime}`,
          ),
        );
      if (!isNum(a.w) || !isNum(a.h) || a.w <= 0 || a.h <= 0)
        push(
          cx,
          "error",
          "ref.asset",
          p,
          L("Asset size missing", "Taille de la ressource absente"),
        );
      if (!/^[0-9a-f]{64}$/.test(k))
        push(
          cx,
          "warn",
          "ref.asset",
          p,
          L(
            "Asset id is not a sha-256",
            "L’id de la ressource n’est pas un sha-256",
          ),
        );
    }
  }
  for (const [k, s] of Object.entries(course.scenes)) {
    const p = `scenes.${k}`;
    if (!isObj(s) || s.id !== k)
      push(
        cx,
        "error",
        "ref.scene",
        p,
        L("Scene key and id differ", "La clé et l’id de la scène diffèrent"),
      );
    else {
      if (s.v !== 1)
        push(
          cx,
          "error",
          "shape",
          `${p}.v`,
          L("Unknown scene version", "Version de scène inconnue"),
        );
      if (!isNum(s.seed))
        push(
          cx,
          "error",
          "shape",
          `${p}.seed`,
          L("A scene needs a seed", "Une scène demande une graine"),
        );
      if (
        !isObj(s.pose) ||
        !["exact", "fields"].includes(String((s.pose as { kind?: unknown }).kind))
      )
        push(
          cx,
          "error",
          "shape",
          `${p}.pose`,
          L("A scene needs a pose", "Une scène demande une position"),
        );
      if (!isObj(s.weather))
        push(
          cx,
          "error",
          "shape",
          `${p}.weather`,
          L("A scene needs its weather", "Une scène demande sa météo"),
        );
      if (s.captured?.thumb)
        assetRef(cx, s.captured.thumb, `${p}.captured.thumb`);
      if (s.captured?.still)
        assetRef(cx, s.captured.still, `${p}.captured.still`);
    }
  }
  for (const [k, c] of Object.entries(course.clips)) {
    const p = `clips.${k}`;
    if (!isObj(c) || c.id !== k)
      push(
        cx,
        "error",
        "ref.clip",
        p,
        L("Clip key and id differ", "La clé et l’id du clip diffèrent"),
      );
    else {
      if (!course.scenes[c.startScene])
        push(
          cx,
          "error",
          "ref.scene",
          `${p}.startScene`,
          L(
            `Clip starts from a missing scene '${c.startScene}'`,
            `Le clip part d’une scène absente « ${c.startScene} »`,
          ),
        );
      if (!isNum(c.durS) || c.durS <= 0)
        push(
          cx,
          "error",
          "shape",
          `${p}.durS`,
          L("Clip duration missing", "Durée du clip absente"),
        );
    }
  }

  course.steps.forEach(
    (s, i) => isObj(s) && step(cx, s as Step, `steps[${i}]`),
  );
}

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

// ------------------------------------------------------------------ references
function assetRef(
  cx: Ctx,
  id: unknown,
  path: string,
  ids: { stepId?: string; blockId?: string } = {},
) {
  if (!isStr(id) || !cx.course.assets[id])
    push(
      cx,
      "error",
      "ref.asset",
      path,
      L(
        "Missing image (asset not in the course)",
        "Image absente (ressource introuvable dans le cours)",
      ),
      ids,
    );
}
function imageSource(
  cx: Ctx,
  src: ImageSource | undefined,
  path: string,
  ids: { stepId?: string; blockId?: string } = {},
) {
  if (!isObj(src))
    return push(
      cx,
      "error",
      "ref.asset",
      path,
      L("Missing image", "Image absente"),
      ids,
    );
  if ("asset" in src) return assetRef(cx, src.asset, `${path}.asset`, ids);
  if (!("lib" in src) || !LIB_ID.test(String(src.lib)))
    push(
      cx,
      "error",
      "ref.asset",
      path,
      L("Unknown library image", "Image de bibliothèque inconnue"),
      ids,
    );
}
function sceneRef(
  cx: Ctx,
  id: unknown,
  path: string,
  ids: { stepId?: string; blockId?: string } = {},
) {
  if (!isStr(id) || !cx.course.scenes[id])
    push(
      cx,
      "error",
      "ref.scene",
      path,
      L(`Missing scene '${String(id)}'`, `Scène absente « ${String(id)} »`),
      ids,
    );
}
function clipRef(
  cx: Ctx,
  id: unknown,
  path: string,
  ids: { stepId?: string; blockId?: string } = {},
) {
  if (!isStr(id) || !cx.course.clips[id])
    push(
      cx,
      "error",
      "ref.clip",
      path,
      L(`Missing clip '${String(id)}'`, `Clip absent « ${String(id)} »`),
      ids,
    );
}
function stepRef(
  cx: Ctx,
  r: StepRef,
  path: string,
  ids: { stepId?: string; blockId?: string } = {},
) {
  if (!isObj(r))
    return push(
      cx,
      "error",
      "ref.step",
      path,
      L("Malformed step link", "Lien d’étape invalide"),
      ids,
    );
  if ("ref" in r) {
    if (!cx.stepIds.has(r.ref))
      push(
        cx,
        "error",
        "ref.step",
        path,
        L(
          `Link to a missing step '${r.ref}'`,
          `Lien vers une étape absente « ${r.ref} »`,
        ),
        ids,
      );
    return;
  }
  if (!isStr(r.course) || !isStr(r.step))
    return push(
      cx,
      "error",
      "ref.step",
      path,
      L("Malformed step link", "Lien d’étape invalide"),
      ids,
    );
  if (r.course === cx.course.id) {
    if (!cx.stepIds.has(r.step))
      push(
        cx,
        "error",
        "ref.step",
        path,
        L(
          `Link to a missing step '${r.step}'`,
          `Lien vers une étape absente « ${r.step} »`,
        ),
        ids,
      );
  } else if (cx.host.stepExists && !cx.host.stepExists(r.course, r.step))
    push(
      cx,
      "warn",
      "ref.step",
      path,
      L(
        `Link to a course step not in this library (${r.course} › ${r.step})`,
        `Lien vers une étape d’un cours absent de la bibliothèque (${r.course} › ${r.step})`,
      ),
      ids,
    );
}
function calcRef(
  cx: Ctx,
  id: unknown,
  path: string,
  ids: { stepId?: string; blockId?: string } = {},
) {
  if (!isStr(id) || !cx.calcSteps.has(id))
    push(
      cx,
      "error",
      "ref.step",
      path,
      L(
        `'${String(id)}' is not a calc step of this course`,
        `« ${String(id)} » n’est pas une étape de calcul de ce cours`,
      ),
      ids,
    );
}

// ------------------------------------------------------------------ steps
function step(cx: Ctx, s: Step, path: string) {
  const ids = { stepId: s.id };
  if (!STEP_KINDS.has(s.kind))
    push(
      cx,
      "error",
      "kind",
      `${path}.kind`,
      L(
        `Unknown step kind '${String(s.kind)}'`,
        `Type d’étape inconnu « ${String(s.kind)} »`,
      ),
      ids,
    );
  if (!filled(s.title))
    push(
      cx,
      "error",
      "l10n",
      `${path}.title`,
      L("A step has no title", "Une étape n’a pas de titre"),
      ids,
    );
  if (!Array.isArray(s.reader))
    push(
      cx,
      "error",
      "shape",
      `${path}.reader`,
      L(
        "reader must be a list (it can be empty)",
        "reader doit être une liste (éventuellement vide)",
      ),
      ids,
    );
  if (
    s.layout !== undefined &&
    !["split", "stageWide", "readerOnly", "canvas"].includes(s.layout)
  )
    push(
      cx,
      "error",
      "shape",
      `${path}.layout`,
      L("Unknown layout", "Mise en page inconnue"),
      ids,
    );
  if (s.layout === "canvas" && !s.slide)
    push(
      cx,
      "error",
      "kind",
      `${path}.layout`,
      L(
        "Layout 'canvas' without a designed slide",
        "Mise en page « canvas » sans diapositive",
      ),
      ids,
    );
  const need = (cond: boolean, what: string, en: string, fr: string) =>
    !cond && push(cx, "error", "kind", `${path}.${what}`, L(en, fr), ids);
  need(
    s.kind !== "calc" || isObj(s.calc),
    "calc",
    "A calc step needs its calculation",
    "Une étape de calcul demande son calcul",
  );
  need(
    s.kind !== "drill" || isObj(s.drill),
    "drill",
    "A drill step needs its drill",
    "Une étape d’entraînement demande son entraînement",
  );
  need(
    s.kind !== "fly" || isObj(s.flyIt),
    "flyIt",
    "A Fly-it step needs its Fly it",
    "Une étape « En vol » demande sa mise en vol",
  );
  need(
    s.kind !== "slide" || isObj(s.slide),
    "slide",
    "A slide step needs its slide",
    "Une étape diapositive demande sa diapositive",
  );
  need(
    !["quiz", "tap"].includes(s.kind) ||
      isObj(s.quiz) ||
      !!s.slide ||
      (s.reader ?? []).some((b) => b?.t === "quiz"),
    "quiz",
    "A quiz step needs a question",
    "Une étape quiz demande une question",
  );
  if (
    s.levels !== undefined &&
    (!Array.isArray(s.levels) ||
      !s.levels.every((l) =>
        ["guided", "coached", "solo", "checkride"].includes(l),
      ))
  )
    push(
      cx,
      "error",
      "shape",
      `${path}.levels`,
      L("Unknown guidance level", "Niveau de guidage inconnu"),
      ids,
    );

  const goalLen = s.goal?.all?.length ?? 0;
  (s.reader ?? []).forEach((b, i) =>
    readerBlock(cx, s, b, `${path}.reader[${i}]`, goalLen),
  );
  if (s.stage) stage(cx, s, path);
  if (s.goal) goal(cx, s.goal, `${path}.goal`, ids, !!s.stage?.assist);
  if (s.quiz) quiz(cx, s, s.quiz, `${path}.quiz`, ids);
  if (s.calc) calcSpec(cx, s.calc, `${path}.calc`, ids);
  if (s.drill) drillSpec(cx, s.drill, `${path}.drill`, ids);
  if (s.flyIt) flyIt(cx, s, `${path}.flyIt`);
  if (s.slide) slide(cx, s, s.slide, `${path}.slide`);
  if (s.calcLink) {
    calcRef(cx, s.calcLink.step, `${path}.calcLink.step`, ids);
    if (!["stage", "goal", "both"].includes(s.calcLink.use))
      push(
        cx,
        "error",
        "shape",
        `${path}.calcLink.use`,
        L(
          "calcLink.use is stage, goal or both",
          "calcLink.use vaut stage, goal ou both",
        ),
        ids,
      );
  }
  if (s.showMe) clipRef(cx, s.showMe, `${path}.showMe`, ids);
}

function readerBlock(
  cx: Ctx,
  s: Step,
  b: ReaderBlock,
  path: string,
  goalLen: number,
) {
  const ids = { stepId: s.id };
  if (!isObj(b))
    return push(
      cx,
      "error",
      "shape",
      path,
      L("Malformed reader block", "Bloc de lecture invalide"),
      ids,
    );
  switch (b.t) {
    case "heading":
    case "text":
    case "takeaway":
      if (!isL10n(b.text))
        push(
          cx,
          "error",
          "shape",
          `${path}.text`,
          L("Text missing", "Texte absent"),
          ids,
        );
      break;
    case "image":
      assetRef(cx, b.asset, `${path}.asset`, ids);
      if (!filled(b.alt))
        push(
          cx,
          "error",
          "alt",
          `${path}.alt`,
          L("An image needs alt text", "Une image demande un texte alternatif"),
          ids,
        );
      break;
    case "diagram":
      diagram(cx, b.d, `${path}.d`, ids);
      if (b.asset) assetRef(cx, b.asset, `${path}.asset`, ids);
      break;
    case "keys":
      if (!Array.isArray(b.items) || !b.items.every(isL10n))
        push(
          cx,
          "error",
          "shape",
          `${path}.items`,
          L(
            "Keys to success must be texts",
            "Les clés du succès doivent être des textes",
          ),
          ids,
        );
      break;
    case "doThis":
      if (!Array.isArray(b.rows))
        push(
          cx,
          "error",
          "shape",
          `${path}.rows`,
          L("Do-this rows missing", "Lignes « À faire » absentes"),
          ids,
        );
      else
        b.rows.forEach((r, i) => {
          if (!isInt(r.check) || r.check < 0 || r.check >= goalLen)
            push(
              cx,
              "error",
              "ref.goal",
              `${path}.rows[${i}].check`,
              L(
                `Row ${i + 1} points at goal check ${r.check}, the goal has ${goalLen}`,
                `La ligne ${i + 1} vise la vérification ${r.check}, l’objectif en a ${goalLen}`,
              ),
              ids,
            );
          if (r.readout !== undefined && !READOUTS.has(r.readout))
            push(
              cx,
              "error",
              "shape",
              `${path}.rows[${i}].readout`,
              L("Unknown readout", "Lecture inconnue"),
              ids,
            );
        });
      break;
    case "reveal":
      if (!Array.isArray(b.blocks))
        push(
          cx,
          "error",
          "shape",
          `${path}.blocks`,
          L("Reveal blocks missing", "Blocs à révéler absents"),
          ids,
        );
      else
        b.blocks.forEach((x, i) =>
          readerBlock(cx, s, x, `${path}.blocks[${i}]`, goalLen),
        );
      if (
        b.when === "answered" &&
        !s.quiz &&
        !s.reader.some((x) => x?.t === "quiz")
      )
        push(
          cx,
          "warn",
          "quiz",
          `${path}.when`,
          L(
            "Revealed when answered, but the step has no question",
            "Révélé après la réponse, mais l’étape n’a pas de question",
          ),
          ids,
        );
      if (b.when === "goalMet" && !s.goal)
        push(
          cx,
          "warn",
          "ref.goal",
          `${path}.when`,
          L(
            "Revealed when the goal is met, but the step has no goal",
            "Révélé à l’objectif atteint, mais l’étape n’a pas d’objectif",
          ),
          ids,
        );
      break;
    case "procedure":
      if (!isStr(b.procId) || !b.procId)
        push(
          cx,
          "error",
          "shape",
          `${path}.procId`,
          L("Procedure id missing", "Identifiant de procédure absent"),
          ids,
        );
      else if (cx.host.procedureExists && !cx.host.procedureExists(b.procId))
        push(
          cx,
          "warn",
          "procedure",
          `${path}.procId`,
          L(
            `Procedure '${b.procId}' no longer exists`,
            `La procédure « ${b.procId} » n’existe plus`,
          ),
          ids,
        );
      break;
    case "quiz":
      quiz(cx, s, b.quiz, `${path}.quiz`, ids);
      break;
    case "formula":
      if (!filled(b.formula))
        push(
          cx,
          "error",
          "l10n",
          `${path}.formula`,
          L("Formula text missing", "Texte de la formule absent"),
          ids,
        );
      break;
    default:
      push(
        cx,
        "error",
        "kind",
        `${path}.t`,
        L(
          `Unknown reader block '${String((b as { t?: unknown }).t)}'`,
          `Bloc de lecture inconnu « ${String((b as { t?: unknown }).t)} »`,
        ),
        ids,
      );
  }
}

function diagram(
  cx: Ctx,
  d: DiagramSpec | undefined,
  path: string,
  ids: { stepId?: string; blockId?: string },
) {
  if (!isObj(d))
    return push(
      cx,
      "error",
      "shape",
      path,
      L("Diagram missing", "Schéma absent"),
      ids,
    );
  switch (d.kind) {
    case "hold":
      if (
        !isNum(d.inbound) ||
        !["L", "R"].includes(d.turn) ||
        !isStr(d.fix) ||
        !/^[A-Z0-9]{1,5}$/.test(d.fix)
      )
        push(
          cx,
          "error",
          "shape",
          path,
          L(
            "A hold diagram needs inbound, turn and a fix ident (1–5 capitals or digits)",
            "Un schéma d’attente demande route, virage et un indicatif de point (1 à 5 majuscules ou chiffres)",
          ),
          ids,
        );
      break;
    case "profile":
    case "routeMap":
      if (!isObj(d.circuit))
        push(
          cx,
          "error",
          "shape",
          `${path}.circuit`,
          L("Flight missing", "Vol absent"),
          ids,
        );
      break;
    case "plate":
      if (!isStr(d.approachId))
        push(
          cx,
          "error",
          "shape",
          `${path}.approachId`,
          L("Approach id missing", "Identifiant d’approche absent"),
          ids,
        );
      if (d.crop !== undefined && !isUnitRect(d.crop))
        push(
          cx,
          "error",
          "shape",
          `${path}.crop`,
          L(
            "Plate crop is 0..1 of the page",
            "Le recadrage de la carte est en 0..1 de la page",
          ),
          ids,
        );
      break;
    case "airportDiagram":
      if (!isStr(d.icao))
        push(
          cx,
          "error",
          "shape",
          `${path}.icao`,
          L("ICAO code missing", "Code OACI absent"),
          ids,
        );
      break;
    case "map":
      if (!isNum(d.rangeNm) || d.rangeNm <= 0)
        push(
          cx,
          "error",
          "shape",
          `${path}.rangeNm`,
          L("Map range missing", "Échelle de carte absente"),
          ids,
        );
      break;
    case "airspace":
      if (!isObj(d.sketch) || !Array.isArray(d.sketch.layers))
        push(
          cx,
          "error",
          "shape",
          `${path}.sketch`,
          L("Airspace layers missing", "Couches d’espace aérien absentes"),
          ids,
        );
      break;
    case "calc":
      if (!isObj(d.calc) || !isStr(d.calc.kind))
        push(
          cx,
          "error",
          "shape",
          `${path}.calc`,
          L("Calc diagram missing", "Schéma de calcul absent"),
          ids,
        );
      break;
    default:
      push(
        cx,
        "error",
        "kind",
        `${path}.kind`,
        L("Unknown diagram", "Schéma inconnu"),
        ids,
      );
  }
}

function stage(cx: Ctx, s: Step, path: string) {
  const st = s.stage!;
  const ids = { stepId: s.id };
  const p = `${path}.stage`;
  if (!Array.isArray(st.panes) || st.panes.length < 1 || st.panes.length > 2)
    push(
      cx,
      "error",
      "shape",
      `${p}.panes`,
      L(
        "The stage shows one or two panes",
        "La scène montre un ou deux panneaux",
      ),
      ids,
    );
  if (!["frozen", "live", "clip", "fly"].includes(st.mode))
    push(
      cx,
      "error",
      "shape",
      `${p}.mode`,
      L("Unknown stage mode", "Mode de scène inconnu"),
      ids,
    );
  const panes: PaneView[] = Array.isArray(st.panes) ? st.panes : [];
  const needsSim = panes.some((v) => isObj(v) && INSTRUMENT_PANES.has(v.kind));
  panes.forEach((v, i) => {
    if (!isObj(v) || !PANE_KINDS.has(v.kind))
      return push(
        cx,
        "error",
        "kind",
        `${p}.panes[${i}]`,
        L("Unknown pane", "Panneau inconnu"),
        ids,
      );
    if (v.kind === "still" || v.kind === "image")
      assetRef(cx, v.asset, `${p}.panes[${i}].asset`, ids);
    if (v.kind === "diagram") {
      diagram(cx, v.d, `${p}.panes[${i}].d`, ids);
      if (v.asset) assetRef(cx, v.asset, `${p}.panes[${i}].asset`, ids);
    }
    if ("crop" in v && v.crop && "rect" in v.crop && !isRect(v.crop.rect))
      push(
        cx,
        "error",
        "shape",
        `${p}.panes[${i}].crop`,
        L("Crop rectangle malformed", "Rectangle de recadrage invalide"),
        ids,
      );
  });
  const calcStage = !!s.calcLink && s.calcLink.use !== "goal";
  if (st.scene !== undefined) sceneRef(cx, st.scene, `${p}.scene`, ids);
  else if (needsSim && !calcStage)
    push(
      cx,
      "error",
      "ref.scene",
      `${p}.scene`,
      L(
        "An instrument pane needs a scene",
        "Un panneau instrument demande une scène",
      ),
      ids,
    );
  if (st.mode === "clip") clipRef(cx, st.clip, `${p}.clip`, ids);
  else if (st.clip !== undefined) clipRef(cx, st.clip, `${p}.clip`, ids);
  (st.controls ?? []).forEach(
    (c, i) =>
      !CONTROLS.has(c) &&
      push(
        cx,
        "error",
        "shape",
        `${p}.controls[${i}]`,
        L(`Unknown control '${c}'`, `Commande inconnue « ${c} »`),
        ids,
      ),
  );
  const annIds = new Set<string>();
  (st.annotations ?? []).forEach((a, i) => {
    const ap = `${p}.annotations[${i}]`;
    if (!isObj(a) || !isStr(a.id))
      return push(
        cx,
        "error",
        "shape",
        ap,
        L("Malformed annotation", "Annotation invalide"),
        ids,
      );
    if (annIds.has(a.id))
      push(
        cx,
        "error",
        "id",
        `${ap}.id`,
        L(
          `Duplicate annotation id '${a.id}'`,
          `Identifiant d’annotation en double « ${a.id} »`,
        ),
        ids,
      );
    annIds.add(a.id);
    if (a.pane !== 0 && a.pane !== 1)
      push(
        cx,
        "error",
        "shape",
        `${ap}.pane`,
        L(
          "Annotation pane is 0 or 1",
          "Le panneau d’une annotation vaut 0 ou 1",
        ),
        ids,
      );
    else if (a.pane >= panes.length)
      push(
        cx,
        "error",
        "ref.block",
        `${ap}.pane`,
        L(
          "Annotation on a pane the stage does not show",
          "Annotation sur un panneau absent",
        ),
        ids,
      );
    const when = a.when;
    if (isStr(when) && when.startsWith("afterCheck:"))
      checkIndex(cx, s, Number(when.slice(11)), `${ap}.when`, ids);
  });
}

function checkIndex(
  cx: Ctx,
  s: Step,
  i: number,
  path: string,
  ids: { stepId?: string; blockId?: string },
  len = s.goal?.all?.length ?? 0,
) {
  if (!isInt(i) || i < 0 || i >= len)
    push(
      cx,
      "error",
      "ref.goal",
      path,
      L(
        `Goal check ${i} does not exist (the goal has ${len})`,
        `La vérification ${i} n’existe pas (l’objectif en a ${len})`,
      ),
      ids,
    );
}

function goalCheck(
  cx: Ctx,
  c: GoalCheck,
  path: string,
  ids: { stepId?: string; blockId?: string },
) {
  if (!isObj(c) || !isStr(c.id))
    return push(
      cx,
      "error",
      "goal",
      path,
      L("Malformed goal check", "Vérification invalide"),
      ids,
    );
  for (const m of goalParamIssues(c, "en").map((en, i) => ({
    en,
    fr: goalParamIssues(c, "fr")[i],
  })))
    push(
      cx,
      "error",
      "goal",
      path,
      L(`${c.id}: ${m.en}`, `${c.id} : ${m.fr}`),
      ids,
    );
}
function goal(
  cx: Ctx,
  g: Step["goal"],
  path: string,
  ids: { stepId?: string; blockId?: string },
  assisted: boolean,
) {
  if (!isObj(g) || !Array.isArray(g.all))
    return push(
      cx,
      "error",
      "shape",
      path,
      L("Malformed goal", "Objectif invalide"),
      ids,
    );
  if (!g.all.length)
    push(
      cx,
      "warn",
      "goal",
      `${path}.all`,
      L("The goal has no check", "L’objectif n’a aucune vérification"),
      ids,
    );
  g.all.forEach((c, i) => goalCheck(cx, c, `${path}.all[${i}]`, ids));
  if (
    g.holdS !== undefined &&
    (!isNum(g.holdS) || g.holdS < 0 || g.holdS > 600)
  )
    push(
      cx,
      "error",
      "goal",
      `${path}.holdS`,
      L("Hold time is 0 to 600 s", "La durée à tenir va de 0 à 600 s"),
      ids,
    );
  if (typeof g.graded !== "boolean")
    push(
      cx,
      "error",
      "shape",
      `${path}.graded`,
      L("graded must be true or false", "graded vaut true ou false"),
      ids,
    );
  if (g.graded && assisted)
    push(
      cx,
      "error",
      "graded",
      `${path}.graded`,
      L(
        "A step with an assist is never graded (altitude and speed are held for the student)",
        "Une étape avec assistance n’est jamais notée (altitude et vitesse tenues pour l’élève)",
      ),
      ids,
    );
}

function quiz(
  cx: Ctx,
  s: Step,
  q: Quiz,
  path: string,
  ids: { stepId?: string; blockId?: string },
) {
  if (!isObj(q))
    return push(
      cx,
      "error",
      "quiz",
      path,
      L("Malformed question", "Question invalide"),
      ids,
    );
  const bad = (en: string, fr: string, sub = "") =>
    push(cx, "error", "quiz", `${path}${sub}`, L(en, fr), ids);
  switch (q.kind) {
    case "mcq":
      if (!filled(q.prompt))
        bad(
          "The question has no text",
          "La question n’a pas de texte",
          ".prompt",
        );
      if (!Array.isArray(q.options) || q.options.length < 2)
        bad(
          "A multiple choice needs at least two options",
          "Un QCM demande au moins deux réponses",
          ".options",
        );
      else if (!isInt(q.answer) || q.answer < 0 || q.answer >= q.options.length)
        bad(
          "The right answer is not one of the options",
          "La bonne réponse ne fait pas partie des choix",
          ".answer",
        );
      break;
    case "numeric":
      if (!filled(q.prompt))
        bad(
          "The question has no text",
          "La question n’a pas de texte",
          ".prompt",
        );
      if (!isNum(q.answer))
        bad(
          "The answer must be a number",
          "La réponse doit être un nombre",
          ".answer",
        );
      if (!isNum(q.tol) || q.tol < 0)
        bad(
          "The tolerance must be 0 or more",
          "La tolérance doit être positive ou nulle",
          ".tol",
        );
      break;
    case "order":
      if (!Array.isArray(q.items) || q.items.length < 2)
        bad(
          "An ordering question needs at least two items",
          "Une question d’ordre demande au moins deux éléments",
          ".items",
        );
      break;
    case "tap": {
      const t = q.target;
      if (!isObj(t))
        bad("Tap target missing", "Zone à toucher absente", ".target");
      else if ("annotation" in t) {
        if (!(s.stage?.annotations ?? []).some((a) => a.id === t.annotation))
          bad(
            `Tap target '${t.annotation}' is not an annotation of the stage`,
            `La zone « ${t.annotation} » n’est pas une annotation de la scène`,
            ".target",
          );
      } else if (!isRect(t.rect) || (t.pane !== 0 && t.pane !== 1))
        bad(
          "Tap rectangle malformed",
          "Rectangle à toucher invalide",
          ".target",
        );
      break;
    }
    case "fly":
      if (!Array.isArray(q.answer) || !q.answer.length)
        bad(
          "Answer by flying needs at least one check",
          "Répondre en volant demande au moins une vérification",
          ".answer",
        );
      else
        q.answer.forEach((c, i) =>
          goalCheck(cx, c, `${path}.answer[${i}]`, ids),
        );
      break;
    case "calc":
      calcSpec(cx, q.calc, `${path}.calc`, ids);
      break;
    default:
      bad(
        `Unknown question kind '${String((q as { kind?: unknown }).kind)}'`,
        `Type de question inconnu « ${String((q as { kind?: unknown }).kind)} »`,
        ".kind",
      );
  }
}

function calcSpec(
  cx: Ctx,
  c: CalcSpec,
  path: string,
  ids: { stepId?: string; blockId?: string },
) {
  if (!isObj(c))
    return push(
      cx,
      "error",
      "calc",
      path,
      L("Calculation missing", "Calcul absent"),
      ids,
    );
  if (!GENERATORS.has(c.generatorId))
    push(
      cx,
      "error",
      "calc",
      `${path}.generatorId`,
      L(
        `Unknown calculation '${String(c.generatorId)}'`,
        `Calcul inconnu « ${String(c.generatorId)} »`,
      ),
      ids,
    );
  if (c.seed !== undefined && (!isInt(c.seed) || c.seed < 0))
    push(
      cx,
      "error",
      "calc",
      `${path}.seed`,
      L("The seed is a whole number", "La graine est un entier"),
      ids,
    );
  if (c.tolerance !== undefined && (!isNum(c.tolerance) || c.tolerance < 0))
    push(
      cx,
      "error",
      "calc",
      `${path}.tolerance`,
      L(
        "The tolerance must be 0 or more",
        "La tolérance doit être positive ou nulle",
      ),
      ids,
    );
  if (c.unit !== undefined && !CALC_UNITS.has(c.unit))
    push(
      cx,
      "error",
      "calc",
      `${path}.unit`,
      L("Unknown unit", "Unité inconnue"),
      ids,
    );
  if (
    c.showSolution !== undefined &&
    !["onCheck", "onRequest", "never"].includes(c.showSolution)
  )
    push(
      cx,
      "error",
      "calc",
      `${path}.showSolution`,
      L("Unknown solution mode", "Mode de solution inconnu"),
      ids,
    );
  if (c.stage !== undefined && !["generator", "none"].includes(c.stage))
    push(
      cx,
      "error",
      "calc",
      `${path}.stage`,
      L("Unknown calc stage", "Scène de calcul inconnue"),
      ids,
    );
  if (c.params !== undefined) paramsOk(cx, c.params, `${path}.params`, ids);
}
function paramsOk(
  cx: Ctx,
  p: unknown,
  path: string,
  ids: { stepId?: string; blockId?: string },
) {
  if (!isObj(p))
    return push(
      cx,
      "error",
      "calc",
      path,
      L("Parameters must be an object", "Les paramètres doivent être un objet"),
      ids,
    );
  for (const [k, v] of Object.entries(p))
    if (
      !(
        isNum(v) ||
        isStr(v) ||
        typeof v === "boolean" ||
        (Array.isArray(v) && v.length === 2 && v.every(isNum) && v[0] <= v[1])
      )
    )
      push(
        cx,
        "error",
        "calc",
        `${path}.${k}`,
        L(
          `Parameter '${k}' is not a number, text, yes/no or [min, max]`,
          `Le paramètre « ${k} » n’est ni un nombre, ni un texte, ni oui/non, ni [min, max]`,
        ),
        ids,
      );
}
function drillSpec(
  cx: Ctx,
  d: DrillSpec,
  path: string,
  ids: { stepId?: string; blockId?: string },
) {
  if (!isObj(d))
    return push(
      cx,
      "error",
      "drill",
      path,
      L("Drill missing", "Entraînement absent"),
      ids,
    );
  if (!Array.isArray(d.generatorIds) || !d.generatorIds.length)
    push(
      cx,
      "error",
      "drill",
      `${path}.generatorIds`,
      L(
        "A drill needs at least one calculation",
        "Un entraînement demande au moins un calcul",
      ),
      ids,
    );
  else
    d.generatorIds.forEach(
      (g, i) =>
        !GENERATORS.has(g) &&
        push(
          cx,
          "error",
          "drill",
          `${path}.generatorIds[${i}]`,
          L(`Unknown calculation '${g}'`, `Calcul inconnu « ${g} »`),
          ids,
        ),
    );
  if (!isInt(d.count) || d.count < 1 || d.count > 50)
    push(
      cx,
      "error",
      "drill",
      `${path}.count`,
      L(
        "A drill has 1 to 50 problems",
        "Un entraînement compte 1 à 50 problèmes",
      ),
      ids,
    );
  if (d.practiceOnly !== true)
    push(
      cx,
      "error",
      "drill",
      `${path}.practiceOnly`,
      L(
        "A drill is practice only (never graded)",
        "Un entraînement est de la pratique (jamais noté)",
      ),
      ids,
    );
  if (d.timer !== undefined) {
    if (
      !isObj(d.timer) ||
      !["stopwatch", "perProblem", "total"].includes(d.timer.mode)
    )
      push(
        cx,
        "error",
        "drill",
        `${path}.timer`,
        L("Unknown timer", "Chronomètre inconnu"),
        ids,
      );
    else if (
      d.timer.mode !== "stopwatch" &&
      (!isNum(d.timer.seconds) || d.timer.seconds <= 0)
    )
      push(
        cx,
        "error",
        "drill",
        `${path}.timer.seconds`,
        L("The timer needs a duration", "Le chronomètre demande une durée"),
        ids,
      );
  }
  if (d.seed !== undefined && (!isInt(d.seed) || d.seed < 0))
    push(
      cx,
      "error",
      "drill",
      `${path}.seed`,
      L("The seed is a whole number", "La graine est un entier"),
      ids,
    );
  if (d.feedback !== undefined && !["each", "end"].includes(d.feedback))
    push(
      cx,
      "error",
      "drill",
      `${path}.feedback`,
      L("Feedback is 'each' or 'end'", "Le retour vaut « each » ou « end »"),
      ids,
    );
  if (d.params)
    for (const [g, p] of Object.entries(d.params)) {
      if (!GENERATORS.has(g))
        push(
          cx,
          "error",
          "drill",
          `${path}.params.${g}`,
          L(
            `Parameters for an unknown calculation '${g}'`,
            `Paramètres d’un calcul inconnu « ${g} »`,
          ),
          ids,
        );
      else paramsOk(cx, p, `${path}.params.${g}`, ids);
    }
}

function criteria(
  cx: Ctx,
  list: Criterion[],
  path: string,
  ids: { stepId?: string; blockId?: string },
) {
  const seen = new Set<string>();
  list.forEach((c, i) => {
    const p = `${path}[${i}]`;
    if (!isObj(c) || !isStr(c.id))
      return push(
        cx,
        "error",
        "shape",
        p,
        L("Malformed criterion", "Critère invalide"),
        ids,
      );
    if (seen.has(c.id))
      push(
        cx,
        "error",
        "id",
        `${p}.id`,
        L(
          `Duplicate criterion id '${c.id}'`,
          `Identifiant de critère en double « ${c.id} »`,
        ),
        ids,
      );
    seen.add(c.id);
    if (!filled(c.label))
      push(
        cx,
        "error",
        "l10n",
        `${p}.label`,
        L("A criterion needs a label", "Un critère demande un libellé"),
        ids,
      );
    goalCheck(cx, c.check, `${p}.check`, ids);
    if (
      c.acs !== undefined &&
      !/^[A-Z]{2,4}\.[IVX]+\.[A-Z](\.[A-Z0-9]+)*$/.test(c.acs)
    )
      push(
        cx,
        "warn",
        "shape",
        `${p}.acs`,
        L(
          `ACS code '${c.acs}' does not look like IR.V.A`,
          `Le code ACS « ${c.acs} » ne ressemble pas à IR.V.A`,
        ),
        ids,
      );
    if (c.trace !== undefined && !READOUTS.has(c.trace))
      push(
        cx,
        "error",
        "shape",
        `${p}.trace`,
        L("Unknown trace", "Tracé inconnu"),
        ids,
      );
  });
}

function flyIt(cx: Ctx, s: Step, path: string) {
  const f = s.flyIt!;
  const ids = { stepId: s.id };
  if (!isObj(f) || !isObj(f.target))
    return push(
      cx,
      "error",
      "shape",
      path,
      L("Malformed Fly it", "Mise en vol invalide"),
      ids,
    );
  const t = f.target;
  switch (t.kind) {
    case "scene":
      sceneRef(cx, t.scene, `${path}.target.scene`, ids);
      if (
        t.durationS !== undefined &&
        (!isNum(t.durationS) || t.durationS <= 0)
      )
        push(
          cx,
          "error",
          "shape",
          `${path}.target.durationS`,
          L("Duration must be positive", "La durée doit être positive"),
          ids,
        );
      (t.endWhen ?? []).forEach((c, i) =>
        goalCheck(cx, c, `${path}.target.endWhen[${i}]`, ids),
      );
      break;
    case "calc":
      calcRef(cx, t.step, `${path}.target.step`, ids);
      break;
    case "lesson":
      if (!isStr(t.exerciseId) || !t.exerciseId)
        push(
          cx,
          "error",
          "shape",
          `${path}.target.exerciseId`,
          L("Lesson id missing", "Identifiant de leçon absent"),
          ids,
        );
      break;
    case "circuit":
      if (!isObj(t.circuit))
        push(
          cx,
          "error",
          "shape",
          `${path}.target.circuit`,
          L("Saved flight missing", "Vol enregistré absent"),
          ids,
        );
      break;
    case "procedure":
      if (!isStr(t.procId) || !t.procId)
        push(
          cx,
          "error",
          "shape",
          `${path}.target.procId`,
          L("Procedure id missing", "Identifiant de procédure absent"),
          ids,
        );
      else if (cx.host.procedureExists && !cx.host.procedureExists(t.procId))
        push(
          cx,
          "warn",
          "procedure",
          `${path}.target.procId`,
          L(
            `Procedure '${t.procId}' no longer exists`,
            `La procédure « ${t.procId} » n’existe plus`,
          ),
          ids,
        );
      break;
    case "scenario":
      if (!isStr(t.scenarioId) || !t.scenarioId)
        push(
          cx,
          "error",
          "shape",
          `${path}.target.scenarioId`,
          L("Scenario id missing", "Identifiant de scénario absent"),
          ids,
        );
      break;
    default:
      push(
        cx,
        "error",
        "kind",
        `${path}.target.kind`,
        L("Unknown Fly-it target", "Cible de mise en vol inconnue"),
        ids,
      );
  }
  if (!Array.isArray(f.options))
    push(
      cx,
      "error",
      "shape",
      `${path}.options`,
      L("options must be a list", "options doit être une liste"),
      ids,
    );
  else
    f.options.forEach(
      (o, i) =>
        !FLY_OPTIONS.has(o) &&
        push(
          cx,
          "error",
          "shape",
          `${path}.options[${i}]`,
          L(`Unknown option '${o}'`, `Option inconnue « ${o} »`),
          ids,
        ),
    );
  (f.defaultsOn ?? []).forEach(
    (o, i) =>
      !(f.options ?? []).includes(o) &&
      push(
        cx,
        "warn",
        "shape",
        `${path}.defaultsOn[${i}]`,
        L(
          `'${o}' is on by default but not offered`,
          `« ${o} » est activée par défaut sans être proposée`,
        ),
        ids,
      ),
  );
  if (!Array.isArray(f.criteria))
    push(
      cx,
      "error",
      "shape",
      `${path}.criteria`,
      L("criteria must be a list", "criteria doit être une liste"),
      ids,
    );
  else criteria(cx, f.criteria, `${path}.criteria`, ids);
  if (
    (f.options ?? []).includes("surpriseMe") &&
    !(f.surprisePool ?? []).length
  )
    push(
      cx,
      "warn",
      "shape",
      `${path}.surprisePool`,
      L(
        "Surprise me with an empty failure pool",
        "Panne surprise sans liste de pannes",
      ),
      ids,
    );
  if (f.worked !== undefined) clipRef(cx, f.worked, `${path}.worked`, ids);
  if (!["thisStep", "nextStep"].includes(f.returnTo))
    push(
      cx,
      "warn",
      "flyReturn",
      `${path}.returnTo`,
      L(
        "A Fly it with no return: the student will not come back to the course",
        "Mise en vol sans retour : l’élève ne reviendra pas au cours",
      ),
      ids,
    );
  if (
    (t.kind === "scene" || t.kind === "circuit") &&
    Array.isArray(f.criteria) &&
    !f.criteria.length
  )
    push(
      cx,
      "warn",
      "flyCriteria",
      `${path}.criteria`,
      L(
        "Nothing is graded on this flight: add criteria",
        "Rien n’est noté sur ce vol : ajoutez des critères",
      ),
      ids,
    );
  (f.briefing ?? []).forEach(
    (b, i) => isObj(b) && step(cx, b, `${path}.briefing[${i}]`),
  );
}

function yourTurn(
  cx: Ctx,
  s: Step,
  yt: YourTurn,
  path: string,
  ids: { stepId?: string; blockId?: string },
  blockScene: string | undefined,
) {
  if (!isObj(yt))
    return push(
      cx,
      "error",
      "shape",
      path,
      L("Malformed Your turn", "« À vous » invalide"),
      ids,
    );
  if (!["slide", "sim"].includes(yt.where))
    push(
      cx,
      "error",
      "shape",
      `${path}.where`,
      L(
        "Your turn is on the slide or in the sim",
        "« À vous » se fait sur la diapositive ou dans le simulateur",
      ),
      ids,
    );
  if (!filled(yt.prompt))
    push(
      cx,
      "error",
      "l10n",
      `${path}.prompt`,
      L("Your turn needs a task", "« À vous » demande une consigne"),
      ids,
    );
  if (yt.scene !== undefined) sceneRef(cx, yt.scene, `${path}.scene`, ids);
  else if (!blockScene)
    push(
      cx,
      "error",
      "ref.scene",
      `${path}.scene`,
      L("Your turn needs a scene", "« À vous » demande une scène"),
      ids,
    );
  (yt.controls ?? []).forEach(
    (c, i) =>
      !CONTROLS.has(c) &&
      push(
        cx,
        "error",
        "shape",
        `${path}.controls[${i}]`,
        L(`Unknown control '${c}'`, `Commande inconnue « ${c} »`),
        ids,
      ),
  );
  goal(cx, yt.goal, `${path}.goal`, ids, !!yt.assist);
  (yt.endWhen ?? []).forEach((c, i) =>
    goalCheck(cx, c, `${path}.endWhen[${i}]`, ids),
  );
  (yt.options ?? []).forEach(
    (o, i) =>
      !FLY_OPTIONS.has(o) &&
      push(
        cx,
        "error",
        "shape",
        `${path}.options[${i}]`,
        L(`Unknown option '${o}'`, `Option inconnue « ${o} »`),
        ids,
      ),
  );
  if (yt.showMe) clipRef(cx, yt.showMe, `${path}.showMe`, ids);
  if (yt.durationS !== undefined && (!isNum(yt.durationS) || yt.durationS <= 0))
    push(
      cx,
      "error",
      "shape",
      `${path}.durationS`,
      L("Duration must be positive", "La durée doit être positive"),
      ids,
    );
  void s;
}

function action(
  cx: Ctx,
  a: BlockAction,
  path: string,
  ids: { stepId?: string; blockId?: string },
  blockIds: Set<string>,
) {
  if (!isObj(a))
    return push(
      cx,
      "error",
      "shape",
      path,
      L("Malformed tap action", "Action invalide"),
      ids,
    );
  switch (a.k) {
    case "next":
      break;
    case "goto":
      stepRef(cx, a.step, `${path}.step`, ids);
      break;
    case "open":
      if (!isObj(a.open) || !isObj(a.open.step))
        push(
          cx,
          "error",
          "shape",
          `${path}.open`,
          L("Nothing to open", "Rien à ouvrir"),
          ids,
        );
      else if ("ref" in a.open.step || "course" in a.open.step)
        stepRef(cx, a.open.step as StepRef, `${path}.open.step`, ids);
      else step(cx, a.open.step as Step, `${path}.open.step`);
      break;
    case "reveal":
      if (!isInt(a.order) || a.order < 1)
        push(
          cx,
          "error",
          "slide",
          `${path}.order`,
          L("Reveal order is 1, 2, 3…", "L’ordre de révélation vaut 1, 2, 3…"),
          ids,
        );
      break;
    case "yourTurn":
    case "playClip":
      if (!blockIds.has(a.block))
        push(
          cx,
          "error",
          "ref.block",
          `${path}.block`,
          L(
            `No block '${a.block}' on this slide`,
            `Aucun bloc « ${a.block} » sur cette diapositive`,
          ),
          ids,
        );
      break;
    case "url":
      if (!isStr(a.href) || !/^https?:\/\//i.test(a.href))
        push(
          cx,
          "error",
          "url",
          `${path}.href`,
          L(
            "Links must start with https://",
            "Les liens doivent commencer par https://",
          ),
          ids,
        );
      break;
    default:
      push(
        cx,
        "error",
        "kind",
        `${path}.k`,
        L("Unknown tap action", "Action inconnue"),
        ids,
      );
  }
}

function slide(cx: Ctx, s: Step, c: SlideCanvas, path: string) {
  const sid = { stepId: s.id };
  if (!isObj(c))
    return push(
      cx,
      "error",
      "slide",
      path,
      L("Malformed slide", "Diapositive invalide"),
      sid,
    );
  if (!isObj(c.size) || c.size.w !== 1920 || c.size.h !== 1080)
    push(
      cx,
      "error",
      "slide",
      `${path}.size`,
      L("A slide is 1920 × 1080", "Une diapositive fait 1920 × 1080"),
      sid,
    );
  if (c.grid !== undefined && (!isNum(c.grid) || c.grid < 4 || c.grid > 240))
    push(
      cx,
      "error",
      "slide",
      `${path}.grid`,
      L("Grid is 4 to 240 units", "La grille va de 4 à 240 unités"),
      sid,
    );
  if (c.theme !== undefined && !THEMES.has(c.theme))
    push(
      cx,
      "error",
      "slide",
      `${path}.theme`,
      L("Unknown theme", "Thème inconnu"),
      sid,
    );
  if (c.layout !== undefined && !LAYOUTS.has(c.layout))
    push(
      cx,
      "error",
      "slide",
      `${path}.layout`,
      L("Unknown layout template", "Modèle de mise en page inconnu"),
      sid,
    );
  if (c.scene !== undefined) sceneRef(cx, c.scene, `${path}.scene`, sid);
  if (c.background) {
    const b = c.background;
    if (b.color !== undefined && !isColor(b.color))
      push(
        cx,
        "error",
        "slide",
        `${path}.background.color`,
        L("Unknown colour", "Couleur inconnue"),
        sid,
      );
    if (b.image) imageSource(cx, b.image, `${path}.background.image`, sid);
    if (b.crop !== undefined && !isUnitRect(b.crop))
      push(
        cx,
        "error",
        "slide",
        `${path}.background.crop`,
        L("Crop is 0..1 of the image", "Le recadrage est en 0..1 de l’image"),
        sid,
      );
    if (b.dim !== undefined && (!isNum(b.dim) || b.dim < 0 || b.dim > 0.8))
      push(
        cx,
        "error",
        "slide",
        `${path}.background.dim`,
        L("Dim is 0 to 0.8", "L’assombrissement va de 0 à 0,8"),
        sid,
      );
  }
  if (!Array.isArray(c.blocks))
    return push(
      cx,
      "error",
      "slide",
      `${path}.blocks`,
      L("blocks must be a list", "blocks doit être une liste"),
      sid,
    );
  if (c.blocks.length > COURSE_LIMITS.blocksPerSlide)
    push(
      cx,
      "error",
      "size",
      `${path}.blocks`,
      L(
        `Too many blocks (${c.blocks.length})`,
        `Trop de blocs (${c.blocks.length})`,
      ),
      sid,
    );
  const blockIds = new Set<string>();
  for (const b of c.blocks) if (isObj(b) && isStr(b.id)) blockIds.add(b.id);
  const goalLen = s.goal?.all?.length ?? 0;
  const ytBlocks = c.blocks.filter(
    (b) =>
      isObj(b) &&
      (b.kind === "instrument" || b.kind === "simViewport") &&
      b.yourTurn,
  );
  const hasQuiz =
    !!s.quiz ||
    c.blocks.some((b) => isObj(b) && (b.kind === "quiz" || b.kind === "calc"));
  const seen = new Set<string>();
  c.blocks.forEach((b, i) => {
    const p = `${path}.blocks[${i}]`;
    if (!isObj(b) || !isStr(b.id) || !b.id)
      return push(
        cx,
        "error",
        "slide",
        p,
        L("A block has no id", "Un bloc n’a pas d’identifiant"),
        sid,
      );
    const ids = { stepId: s.id, blockId: b.id };
    if (seen.has(b.id))
      push(
        cx,
        "error",
        "id",
        `${p}.id`,
        L(
          `Duplicate block id '${b.id}'`,
          `Identifiant de bloc en double « ${b.id} »`,
        ),
        ids,
      );
    seen.add(b.id);
    if (!BLOCK_KINDS.has(b.kind))
      return push(
        cx,
        "error",
        "kind",
        `${p}.kind`,
        L(
          `Unknown block '${String(b.kind)}'`,
          `Bloc inconnu « ${String(b.kind)} »`,
        ),
        ids,
      );
    const f = b.frame;
    if (
      !isObj(f) ||
      ![f.x, f.y, f.w, f.h, f.z].every(isNum) ||
      f.w <= 0 ||
      f.h <= 0 ||
      (f.rot !== undefined && !isNum(f.rot))
    )
      push(
        cx,
        "error",
        "slide",
        `${p}.frame`,
        L("Block frame malformed", "Cadre du bloc invalide"),
        ids,
      );
    else if (f.x + f.w <= 0 || f.y + f.h <= 0 || f.x >= 1920 || f.y >= 1080)
      push(
        cx,
        "warn",
        "slide",
        `${p}.frame`,
        L("Block is off the slide", "Le bloc est hors de la diapositive"),
        ids,
      );
    if (b.reveal) {
      if (!isInt(b.reveal.order) || b.reveal.order < 1)
        push(
          cx,
          "error",
          "slide",
          `${p}.reveal.order`,
          L("Reveal order is 1, 2, 3…", "L’ordre de révélation vaut 1, 2, 3…"),
          ids,
        );
      const w = b.reveal.when;
      if (isStr(w) && w.startsWith("afterCheck:"))
        checkIndex(cx, s, Number(w.slice(11)), `${p}.reveal.when`, ids);
      if (w === "yourTurnDone" && !ytBlocks.length)
        push(
          cx,
          "error",
          "ref.block",
          `${p}.reveal.when`,
          L(
            "Revealed after Your turn, but the slide has none",
            "Révélé après « À vous », mais la diapositive n’en a pas",
          ),
          ids,
        );
      if (w === "answered" && !hasQuiz)
        push(
          cx,
          "warn",
          "quiz",
          `${p}.reveal.when`,
          L(
            "Revealed when answered, but the slide has no question",
            "Révélé après la réponse, mais la diapositive n’a pas de question",
          ),
          ids,
        );
      if (w === "goalMet" && !s.goal && !ytBlocks.length)
        push(
          cx,
          "warn",
          "ref.goal",
          `${p}.reveal.when`,
          L(
            "Revealed when the goal is met, but there is no goal",
            "Révélé à l’objectif atteint, mais il n’y a pas d’objectif",
          ),
          ids,
        );
    }
    (b.goal ?? []).forEach((g, j) =>
      checkIndex(cx, s, g, `${p}.goal[${j}]`, ids),
    );
    if (b.onTap) action(cx, b.onTap, `${p}.onTap`, ids, blockIds);
    if (b.alt !== undefined && !isL10n(b.alt))
      push(
        cx,
        "error",
        "shape",
        `${p}.alt`,
        L("alt must be a text", "alt doit être un texte"),
        ids,
      );
    const altMissing = !filled(b.alt);
    switch (b.kind) {
      case "text":
        if (!TEXT_STYLES.has(b.style))
          push(
            cx,
            "error",
            "slide",
            `${p}.style`,
            L("Unknown type style", "Style de texte inconnu"),
            ids,
          );
        if (!isL10n(b.text))
          push(
            cx,
            "error",
            "slide",
            `${p}.text`,
            L("Text missing", "Texte absent"),
            ids,
          );
        if (b.color !== undefined && !isColor(b.color))
          push(
            cx,
            "error",
            "slide",
            `${p}.color`,
            L("Unknown colour", "Couleur inconnue"),
            ids,
          );
        if (b.bind) {
          const bd = b.bind;
          if (bd.k === "calc") calcRef(cx, bd.step, `${p}.bind.step`, ids);
          else if (bd.k === "yourTurn") {
            if (bd.step === undefined && !blockIds.has(bd.block))
              push(
                cx,
                "error",
                "ref.block",
                `${p}.bind.block`,
                L(
                  `No block '${bd.block}' on this slide`,
                  `Aucun bloc « ${bd.block} » sur cette diapositive`,
                ),
                ids,
              );
            if (bd.step !== undefined && !cx.stepIds.has(bd.step))
              push(
                cx,
                "error",
                "ref.step",
                `${p}.bind.step`,
                L(`Missing step '${bd.step}'`, `Étape absente « ${bd.step} »`),
                ids,
              );
          } else if (bd.k === "readout") {
            if (!READOUTS.has(bd.readout))
              push(
                cx,
                "error",
                "slide",
                `${p}.bind.readout`,
                L("Unknown readout", "Lecture inconnue"),
                ids,
              );
            if (bd.scene !== undefined)
              sceneRef(cx, bd.scene, `${p}.bind.scene`, ids);
          } else
            push(
              cx,
              "error",
              "slide",
              `${p}.bind`,
              L("Unknown live value", "Valeur dynamique inconnue"),
              ids,
            );
          if (!/\{\{value\}\}/.test(b.text?.en ?? ""))
            push(
              cx,
              "warn",
              "slide",
              `${p}.text`,
              L(
                "Live value without {{value}} in the text",
                "Valeur dynamique sans {{value}} dans le texte",
              ),
              ids,
            );
        }
        break;
      case "image":
        imageSource(cx, b.image, `${p}.image`, ids);
        if (!filled(b.alt))
          push(
            cx,
            "error",
            "alt",
            `${p}.alt`,
            L(
              "An image needs alt text",
              "Une image demande un texte alternatif",
            ),
            ids,
          );
        if (b.crop !== undefined && !isUnitRect(b.crop))
          push(
            cx,
            "error",
            "slide",
            `${p}.crop`,
            L(
              "Crop is 0..1 of the image",
              "Le recadrage est en 0..1 de l’image",
            ),
            ids,
          );
        break;
      case "shape":
        if (
          !["rect", "roundRect", "ellipse", "line", "triangle"].includes(
            b.shape,
          )
        )
          push(
            cx,
            "error",
            "slide",
            `${p}.shape`,
            L("Unknown shape", "Forme inconnue"),
            ids,
          );
        for (const k of ["fill", "stroke"] as const)
          if (b[k] !== undefined && b[k] !== null && !isColor(b[k]))
            push(
              cx,
              "error",
              "slide",
              `${p}.${k}`,
              L("Unknown colour", "Couleur inconnue"),
              ids,
            );
        if (
          b.opacity !== undefined &&
          (!isNum(b.opacity) || b.opacity < 0 || b.opacity > 1)
        )
          push(
            cx,
            "error",
            "slide",
            `${p}.opacity`,
            L("Opacity is 0 to 1", "L’opacité va de 0 à 1"),
            ids,
          );
        break;
      case "arrow":
        if (!isPt(b.from) || !isPt(b.to))
          push(
            cx,
            "error",
            "slide",
            p,
            L(
              "An arrow needs two end points",
              "Une flèche demande deux extrémités",
            ),
            ids,
          );
        if (b.color !== undefined && !isColor(b.color))
          push(
            cx,
            "error",
            "slide",
            `${p}.color`,
            L("Unknown colour", "Couleur inconnue"),
            ids,
          );
        break;
      case "callout":
        if (!isL10n(b.text))
          push(
            cx,
            "error",
            "slide",
            `${p}.text`,
            L("Text missing", "Texte absent"),
            ids,
          );
        if (b.target !== undefined && !isPt(b.target))
          push(
            cx,
            "error",
            "slide",
            `${p}.target`,
            L("Leader end malformed", "Extrémité du repère invalide"),
            ids,
          );
        break;
      case "marker":
        if (!isInt(b.n) || b.n < 0 || b.n > 99)
          push(
            cx,
            "error",
            "slide",
            `${p}.n`,
            L("Marker number is 0 to 99", "Le numéro de repère va de 0 à 99"),
            ids,
          );
        break;
      case "diagram":
        if (b.d) diagram(cx, b.d, `${p}.d`, ids);
        if (b.fromCalc !== undefined)
          calcRef(cx, b.fromCalc, `${p}.fromCalc`, ids);
        if (b.asset !== undefined) assetRef(cx, b.asset, `${p}.asset`, ids);
        if (!b.d && b.fromCalc === undefined && b.asset === undefined)
          push(
            cx,
            "error",
            "slide",
            p,
            L(
              "A diagram block needs a diagram",
              "Un bloc schéma demande un schéma",
            ),
            ids,
          );
        if (altMissing)
          push(
            cx,
            "error",
            "alt",
            `${p}.alt`,
            L(
              "A diagram needs alt text",
              "Un schéma demande un texte alternatif",
            ),
            ids,
          );
        break;
      case "instrument": {
        const v = b.view;
        if (
          !isObj(v) ||
          (v.kind === "gauge"
            ? !GAUGES.has(v.gauge)
            : !INSTRUMENT_PANES.has(v.kind))
        )
          push(
            cx,
            "error",
            "slide",
            `${p}.view`,
            L("Unknown instrument", "Instrument inconnu"),
            ids,
          );
        const scene = b.scene ?? c.scene;
        if (b.scene !== undefined) sceneRef(cx, b.scene, `${p}.scene`, ids);
        if (b.fromCalc !== undefined)
          calcRef(cx, b.fromCalc, `${p}.fromCalc`, ids);
        if (scene === undefined && b.fromCalc === undefined)
          push(
            cx,
            "error",
            "ref.scene",
            `${p}.scene`,
            L(
              "An instrument needs a scene to show",
              "Un instrument demande une scène à afficher",
            ),
            ids,
          );
        if (b.mode === "clip") clipRef(cx, b.clip, `${p}.clip`, ids);
        else if (b.clip !== undefined) clipRef(cx, b.clip, `${p}.clip`, ids);
        (b.controls ?? []).forEach(
          (x, j) =>
            !CONTROLS.has(x) &&
            push(
              cx,
              "error",
              "slide",
              `${p}.controls[${j}]`,
              L(`Unknown control '${x}'`, `Commande inconnue « ${x} »`),
              ids,
            ),
        );
        if (b.yourTurn)
          yourTurn(
            cx,
            s,
            b.yourTurn,
            `${p}.yourTurn`,
            ids,
            scene ?? (b.fromCalc ? "calc" : undefined),
          );
        if (altMissing)
          push(
            cx,
            "error",
            "alt",
            `${p}.alt`,
            L(
              "An instrument needs alt text (what it shows)",
              "Un instrument demande un texte alternatif (ce qu’il montre)",
            ),
            ids,
          );
        break;
      }
      case "simViewport": {
        if (!["cockpit", "outside", "panel"].includes(b.view))
          push(
            cx,
            "error",
            "slide",
            `${p}.view`,
            L("Unknown view", "Vue inconnue"),
            ids,
          );
        const scene = b.scene ?? c.scene;
        if (b.scene !== undefined) sceneRef(cx, b.scene, `${p}.scene`, ids);
        else if (scene === undefined)
          push(
            cx,
            "error",
            "ref.scene",
            `${p}.scene`,
            L(
              "A sim view needs a scene",
              "Une vue simulateur demande une scène",
            ),
            ids,
          );
        if (b.clip !== undefined) clipRef(cx, b.clip, `${p}.clip`, ids);
        if (b.poster !== undefined) assetRef(cx, b.poster, `${p}.poster`, ids);
        if (b.yourTurn)
          yourTurn(cx, s, b.yourTurn, `${p}.yourTurn`, ids, scene);
        if (altMissing && !b.yourTurn)
          push(
            cx,
            "warn",
            "alt",
            `${p}.alt`,
            L(
              "A sim view should say what it shows",
              "Une vue simulateur devrait dire ce qu’elle montre",
            ),
            ids,
          );
        break;
      }
      case "quiz":
        quiz(cx, s, b.quiz, `${p}.quiz`, ids);
        break;
      case "calc":
        calcSpec(cx, b.calc, `${p}.calc`, ids);
        break;
      case "checklist": {
        // rows tick from the step goal, or from the slide's YourTurn goal when the step has none
        const yt = ytBlocks[0] as { yourTurn?: YourTurn } | undefined;
        const len = goalLen || yt?.yourTurn?.goal?.all?.length || 0;
        if (!Array.isArray(b.rows))
          push(
            cx,
            "error",
            "slide",
            `${p}.rows`,
            L("Checklist rows missing", "Lignes de la check-list absentes"),
            ids,
          );
        else
          b.rows.forEach((r, j) => {
            if (r.check !== undefined)
              checkIndex(cx, s, r.check, `${p}.rows[${j}].check`, ids, len);
            if (r.readout !== undefined && !READOUTS.has(r.readout))
              push(
                cx,
                "error",
                "slide",
                `${p}.rows[${j}].readout`,
                L("Unknown readout", "Lecture inconnue"),
                ids,
              );
          });
        break;
      }
    }
  });
}

// ------------------------------------------------------------------ advisories (checks panel, never blocking)
/** a step where the student does something (pacing rule) */
export function hasStudentAction(s: Step): boolean {
  if (ACTION_KINDS.has(s.kind)) return true;
  if (s.goal?.all?.length || (s.stage?.controls ?? []).length) return true;
  if ((s.reader ?? []).some((b) => b?.t === "quiz" || b?.t === "doThis"))
    return true;
  return (s.slide?.blocks ?? []).some(
    (b) =>
      b.kind === "quiz" ||
      b.kind === "calc" ||
      ((b.kind === "instrument" || b.kind === "simViewport") && !!b.yourTurn) ||
      (b.kind === "instrument" && !!b.controls?.length),
  );
}

/** Walk every author text (L10n) with its path. */
export function eachText(
  x: unknown,
  f: (t: L10n, path: string) => void,
  path = "",
): void {
  if (Array.isArray(x))
    return x.forEach((v, i) => eachText(v, f, `${path}[${i}]`));
  if (!isObj(x)) return;
  const ks = Object.keys(x);
  if (isL10n(x) && ks.every((k) => k === "en" || k === "fr")) return f(x, path);
  for (const k of ks) {
    if (k === "scenes" && path === "") continue; // scene data, labels only
    if (k === "clips" && path === "") continue;
    eachText(x[k], f, path ? `${path}.${k}` : k);
  }
}

/** Author texts with no French when the course is FR/EN (the editor's "missing translations" count). */
export function missingTranslations(course: Course): {
  count: number;
  paths: string[];
} {
  const paths: string[] = [];
  if (!course.langs?.includes("fr")) return { count: 0, paths };
  eachText(course, (t, p) => {
    if (t.en.trim() && !(t.fr ?? "").trim()) paths.push(p);
  });
  return { count: paths.length, paths };
}

const WORDING =
  /\b(approved|loggable|credits?|homologu\w*|approuv\w*|créditée?s?|crédit)\b/i;
/** The checks panel: warnings that never block (SPEC §2.1 A7). Validation errors are not repeated here. */
export function courseAdvisories(
  course: Course,
  host: ValidateContext = {},
): CourseIssue[] {
  const out: CourseIssue[] = [];
  const add = (
    code: IssueCode,
    path: string,
    message: L10n,
    ids: { stepId?: string; blockId?: string } = {},
  ) => out.push({ level: "warn", code, path, message, ...ids });
  // pacing: N steps in a row with no student action (one rule only, SPEC §12.18)
  let run: Step[] = [];
  const flush = () => {
    if (run.length >= COURSE_LIMITS.pacingRun)
      add(
        "pacing",
        `steps`,
        L(
          `${run.length} steps in a row without a student action (from “${run[0].title.en}”)`,
          `${run.length} étapes de suite sans action de l’élève (depuis « ${run[0].title.fr ?? run[0].title.en} »)`,
        ),
        { stepId: run[0].id },
      );
    run = [];
  };
  for (const s of course.steps) {
    if (hasStudentAction(s)) flush();
    else run.push(s);
  }
  flush();
  const miss = missingTranslations(course);
  if (miss.count)
    add(
      "fr",
      miss.paths[0],
      L(
        `${miss.count} text${miss.count > 1 ? "s" : ""} without French`,
        `${miss.count} texte${miss.count > 1 ? "s" : ""} sans français`,
      ),
    );
  course.steps.forEach((s, i) => {
    (s.reader ?? []).forEach((b, j) => {
      if (
        b?.t === "image" &&
        !b.attribution &&
        course.assets[b.asset]?.role === "image" &&
        !course.assets[b.asset]?.source
      )
        add(
          "attribution",
          `steps[${i}].reader[${j}]`,
          L("An image without attribution", "Une image sans crédit"),
          { stepId: s.id },
        );
      if (b?.t === "diagram" && b.d?.kind === "plate" && !b.asset)
        add(
          "plate",
          `steps[${i}].reader[${j}]`,
          L(
            "A plate not pre-rendered (slow first draw for students)",
            "Une carte non pré-rendue (premier affichage lent)",
          ),
          { stepId: s.id },
        );
    });
    (s.stage?.panes ?? []).forEach((v, j) => {
      if (v.kind === "diagram" && v.d.kind === "plate" && !v.asset)
        add(
          "plate",
          `steps[${i}].stage.panes[${j}]`,
          L(
            "A plate not pre-rendered (slow first draw for students)",
            "Une carte non pré-rendue (premier affichage lent)",
          ),
          { stepId: s.id },
        );
    });
    (s.slide?.blocks ?? []).forEach((b, j) => {
      if (
        b.kind === "image" &&
        "asset" in b.image &&
        !b.attribution &&
        !course.assets[b.image.asset]?.source
      )
        add(
          "attribution",
          `steps[${i}].slide.blocks[${j}]`,
          L("An image without attribution", "Une image sans crédit"),
          { stepId: s.id, blockId: b.id },
        );
      if (b.kind === "diagram" && b.d?.kind === "plate" && !b.asset)
        add(
          "plate",
          `steps[${i}].slide.blocks[${j}]`,
          L(
            "A plate not pre-rendered (slow first draw for students)",
            "Une carte non pré-rendue (premier affichage lent)",
          ),
          { stepId: s.id, blockId: b.id },
        );
    });
  });
  if (
    host.assetBytes !== undefined &&
    host.assetBytes > COURSE_LIMITS.fileWarnBytes
  )
    add(
      "size",
      "assets",
      L(
        `Course file about ${mb(host.assetBytes)} (over 20 MB): compress or remove images`,
        `Fichier du cours d’environ ${mb(host.assetBytes)} (plus de 20 Mo) : compressez ou retirez des images`,
      ),
    );
  eachText(course, (t, p) => {
    if (WORDING.test(t.en) || WORDING.test(t.fr ?? ""))
      add(
        "wording",
        p,
        L(
          "Avoid “approved”, “credit” and “loggable”: courses are graded for the student, not logged",
          "Évitez « approuvé », « crédit » et « homologué » : les cours sont notés pour l’élève, pas enregistrés",
        ),
      );
  });
  // validation warnings about procedures / fly returns are already in validateCourse; re-run only those cheaply
  for (const i of validateCourse(course, host))
    if (
      i.level === "warn" &&
      (i.code === "procedure" ||
        i.code === "flyReturn" ||
        i.code === "flyCriteria")
    )
      out.push(i);
  return out;
}

// ------------------------------------------------------------------ content hash
/** JSON with sorted keys and no undefined (stable across engines and key orders) */
export function canonicalJson(x: unknown): string {
  if (x === null || typeof x !== "object") return JSON.stringify(x) ?? "null";
  if (Array.isArray(x))
    return `[${x.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
  const o = x as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
}
/** content hash for classroom join and share (SPEC §8): no rev, no updated, no hash; asset ids (not bytes) count */
export async function courseHash(course: Course): Promise<string> {
  const { rev: _r, updated: _u, hash: _h, ...rest } = course;
  void _r;
  void _u;
  void _h;
  return (await sha256Hex(canonicalJson(rest))).slice(0, 16);
}

/** One message in a language (UI helper for lists of issues). */
export function issueText(i: CourseIssue, lang: Lang = "en"): string {
  return lang === "fr" ? (i.message.fr ?? i.message.en) : i.message.en;
}
