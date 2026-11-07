// The briefing deck of a cockpit exercise, generated from the exercise itself (SPEC slides v2 §8, §11): a Course
// with shape 'briefing' that our course player plays in the cockpit before "Start exercise". Every deck is built on
// the design-system archetypes and has at least six slides:
//
//   A1 cover            the stage, the title, the one-line goal, and the exercise's key visual
//      what you will do the objectives, with the key points beside them
//   A5 the key concept  a big live instrument or a diagram that matches the exercise (turn coordinator for turns,
//                       HSI for VOR, hold for holds, the approach profile for approaches, partial panel…)
//      clearance, hold, plate (when the exercise has them; course/samples/exerciseBriefing.ts)
//   A7 the steps        the exercise's steps beside the visual
//      the set-up       radios, courses, altitudes, and what each "Set it" button of the exercise window does
//   A3 the standards    the tolerances as big numbers
//   A11 ready to fly    objectives, standards, and the primary action "Start exercise"
//
// The concept slides are written in French and English. The exercise's own words (title, objectives, steps…) are
// authored in English only and shown as written in both languages: nothing is machine-translated.
// Pure: no DOM. A school's own deck for the lesson (samples briefingForLesson) wins over this one.
import { BRAND } from "../brand";
import { G, INST, L, MARK, SHAPE, T } from "../course/canvas/layouts";
import { estimateText } from "../course/canvas/text";
import { resolveTheme } from "../course/canvas/themes";
import { scene } from "../course/samples/kit";
import {
  exerciseDataSlides,
  plateAsset,
  type BriefingSource,
} from "../course/samples/exerciseBriefing";
import { findApproach } from "../nav/data";
import type {
  Briefing,
  InstrumentView,
  L10n,
  Lang,
  SimScene,
  SlideBlock,
  SlideCanvas,
  SlideLayoutId,
  Step,
  TextStyle,
} from "../course/types";

// ------------------------------------------------------------------ input
/** What the deck needs from an exercise (train/engine.ts Exercise satisfies it). */
export interface BriefingExercise {
  id: string;
  stage: string;
  title: string;
  summary: string;
  objectives: readonly string[];
  standards: readonly string[];
  briefing: readonly string[];
  plate?: string;
  allowAp: boolean;
  minutes: number;
}
/** One item of the exercise window's set-up list (train/setupAssist.ts SetupItem, without its function). */
export interface BriefingSetupItem {
  label: string;
  detail?: string;
  /** true: already right · false: to do · null: information */
  ok: boolean | null;
  /** the one-tap help button's verb ("Tune", "Set", "Select", "Load"), when the item has one */
  action?: string;
}
/** The runtime of the attempt being briefed (train/engine.ts ExerciseRuntime, as plain data). */
export interface BriefingRuntime {
  steps: readonly string[];
  clearance?: string;
  quiz?: BriefingSource["quiz"];
  hold?: BriefingSource["hold"];
  setup?: readonly BriefingSetupItem[];
}

/** The stage names (train/curriculum.ts STAGES), here so the deck needs no sim code. */
const STAGE_NAMES: Record<string, L10n> = {
  S1: {
    en: "Stage 1 · Attitude instrument flying",
    fr: "Étape 1 · Pilotage aux instruments",
  },
  S2: { en: "Stage 2 · Partial panel", fr: "Étape 2 · Panne partielle" },
  S3: { en: "Stage 3 · Radio navigation", fr: "Étape 3 · Radionavigation" },
  S4: { en: "Stage 4 · Holding", fr: "Étape 4 · Attentes" },
  S5: {
    en: "Stage 5 · Instrument approaches",
    fr: "Étape 5 · Approches aux instruments",
  },
  S6: {
    en: "Stage 6 · Missed approaches & abnormals",
    fr: "Étape 6 · Remises de gaz et pannes",
  },
  S7: {
    en: "Stage 7 · Checkride preparation",
    fr: "Étape 7 · Préparation au test",
  },
  S8: { en: "Stage 8 · IFR cross-country", fr: "Étape 8 · Navigations IFR" },
};

// ------------------------------------------------------------------ small helpers
/** exercise text is authored in English: the same words in both languages */
const E = (s: string): L10n => ({ en: s, fr: s });
const THEME = resolveTheme("classroom");
/** lines a text takes at its style's size in a frame `w` wide (the longer of the two languages) */
function lines(text: L10n, style: TextStyle, w: number): number {
  const st = THEME.styles[style];
  let n = 1;
  for (const s of [text.en, text.fr ?? text.en]) {
    const r = estimateText({
      text: s,
      size: st.size,
      weight: st.weight,
      lineHeight: st.lineHeight,
      tracking: st.tracking,
      upper: st.upper,
      w,
      h: 4000,
    });
    n = Math.max(n, r.lines);
  }
  return n;
}
/** the height a text needs (lines × line height, rounded up to 8) */
function hOf(text: L10n, style: TextStyle, w: number, max = 6): number {
  const st = THEME.styles[style];
  const n = Math.min(max, lines(text, style, w));
  return Math.ceil((n * st.size * st.lineHeight + 4) / 8) * 8;
}
const pad3 = (d: number) =>
  String(Math.round(((d % 360) + 360) % 360) || 360).padStart(3, "0");
const ft = (n: number): L10n => ({
  en: `${Math.round(n).toLocaleString("en-US")} ft`,
  fr: `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ft`,
});
const cat = (a: L10n, b: L10n, sep = " "): L10n => ({
  en: `${a.en}${sep}${b.en}`,
  fr: `${a.fr ?? a.en}${sep}${b.fr ?? b.en}`,
});
const canvas = (blocks: SlideBlock[], layout: SlideLayoutId): SlideCanvas => ({
  size: { w: 1920, h: 1080 },
  grid: 8,
  layout,
  blocks,
});
const rule = (x: number, y: number, w: number): SlideBlock =>
  SHAPE("line", x, y - 8, w, 16, { stroke: "rule", strokeW: 2 });
const header = (eyebrow: L10n, title: L10n, w = 1680): SlideBlock[] => [
  T("eyebrow", eyebrow, G.left, G.eyebrowY, w, 32),
  T("title", title, G.left, G.titleY, w, hOf(title, "title", w, 2)),
];

// ------------------------------------------------------------------ the key concept of each kind of exercise
type Kind =
  | "scan"
  | "climb"
  | "turn"
  | "steep"
  | "unusual"
  | "slow"
  | "ppCompass"
  | "ppUnusual"
  | "vor"
  | "wind"
  | "arc"
  | "ndb"
  | "gps"
  | "loc"
  | "hold"
  | "approach";
/** What kind of exercise this is: by its id, its stage and what it flies (a plate, a hold). */
export function briefingKind(
  ex: Pick<BriefingExercise, "id" | "stage" | "plate">,
  rt?: Pick<BriefingRuntime, "hold">,
): Kind {
  const id = ex.id;
  const by: [RegExp, Kind][] = [
    [/^bai-sl$/, "scan"],
    [/^bai-climb$/, "climb"],
    [/^bai-(turns|climbturn)$/, "turn"],
    [/^bai-steep/, "steep"],
    [/^bai-unusual/, "unusual"],
    [/^bai-slow/, "slow"],
    [/^pp-compass/, "ppCompass"],
    [/^pp-unusual/, "ppUnusual"],
    [/^nav-vor-in/, "wind"],
    [/^nav-vor/, "vor"],
    [/^nav-arc/, "arc"],
    [/^nav-ndb/, "ndb"],
    [/^nav-gps/, "gps"],
    [/^int-/, "loc"],
    [/^hold-/, "hold"],
  ];
  for (const [re, k] of by) if (re.test(id)) return k;
  if (ex.plate) return "approach";
  if (rt?.hold) return "hold";
  if (ex.stage === "S2") return "ppUnusual";
  if (ex.stage === "S3") return "vor";
  return "scan";
}

/** The visual of a slide: a live instrument, a diagram, or the plate. */
type Visual =
  | {
      t: "inst";
      view: InstrumentView;
      scene: string;
      live: boolean;
      covers?: ("ai" | "dg")[];
      alt: L10n;
    }
  | {
      t: "diagram";
      d: Extract<SlideBlock, { kind: "diagram" }>["d"];
      alt: L10n;
      asset?: string;
      caption?: L10n;
    };
interface Concept {
  eyebrow: L10n;
  title: L10n;
  visual: Visual;
  /** three rows: the thing to remember (heading, in a semantic colour) and one line of why */
  rows: [L10n, L10n][];
}
const GAUGE = (
  g: "ai" | "tc" | "hsi" | "rmi" | "asi" | "vsi",
): InstrumentView => ({ kind: "gauge", gauge: g });
const SIX: InstrumentView = { kind: "six" };
const OPEN = { fix: "PARD", radial: 160, distNm: 18 };

/** The scenes a deck's instruments fly (steam gauges, posed from numbers, fixed seed). */
function conceptScenes(
  kind: Kind,
  ex: BriefingExercise,
): Record<string, SimScene> {
  const id = `brief.${ex.id}`;
  const S = (
    fields: Parameters<typeof scene>[1],
    label: string,
    ap?: SimScene["ap"],
    wind?: [number, number],
  ): Record<string, SimScene> => {
    const sc = scene(id, fields, { label, ...(wind ? { wind } : {}) });
    if (ap) sc.ap = ap;
    return { [id]: sc };
  };
  switch (kind) {
    case "scan":
      return S(
        { pos: OPEN, altFt: 4000, hdg: 90, iasKt: 100 },
        "4,000 ft · 090 · 100 KIAS",
        { engaged: true, lat: "HDG", vert: "ALT", hdg: 90, alt: 4000 },
      );
    case "climb":
      return S(
        { pos: OPEN, altFt: 3200, hdg: 180, iasKt: 75, pitch: 7, vsFpm: 600 },
        "Climb · 75 KIAS · 180",
        { engaged: true, lat: "HDG", vert: "VS", hdg: 180, vs: 600 },
      );
    case "turn":
      return S(
        { pos: OPEN, altFt: 4000, hdg: 360, iasKt: 95, bank: -15 },
        "Standard-rate turn · 95 KIAS",
        { engaged: true, lat: "HDG", vert: "ALT", hdg: 180, alt: 4000 },
      );
    case "steep":
      return S(
        { pos: OPEN, altFt: 4000, hdg: 90, iasKt: 95, bank: 45, pitch: 3 },
        "Steep turn · 45° right",
      );
    case "unusual":
      return S(
        { pos: OPEN, altFt: 5000, hdg: 40, iasKt: 70, bank: 40, pitch: 18 },
        "Nose high, right bank",
      );
    case "ppUnusual":
    case "ppCompass":
      return S(
        {
          pos: OPEN,
          altFt: 4000,
          hdg: 90,
          iasKt: 95,
          bank: kind === "ppCompass" ? -15 : 0,
        },
        "Partial panel · AI and DG covered",
        kind === "ppCompass"
          ? { engaged: true, lat: "HDG", vert: "ALT", hdg: 270, alt: 4000 }
          : { engaged: true, lat: "HDG", vert: "ALT", hdg: 90, alt: 4000 },
      );
    case "slow":
      return S(
        { pos: OPEN, altFt: 4000, hdg: 90, iasKt: 65, pitch: 6 },
        "Slow flight · 65 KIAS",
      );
    case "vor":
      return S(
        {
          pos: { fix: "ARD", radial: 45, distNm: 7 },
          altFt: 4000,
          hdg: 45,
          iasKt: 100,
          radios: { nav1: "ARD", obs1: 45, cdi: "NAV1" },
        },
        "ARD R-045 outbound · 7 NM",
        { engaged: true, lat: "HDG", vert: "ALT", hdg: 50, alt: 4000 },
      );
    case "wind":
      return S(
        {
          pos: { fix: "ARD", radial: 270, distNm: 9 },
          altFt: 4000,
          hdg: 79,
          iasKt: 100,
          radios: { nav1: "ARD", obs1: 90, cdi: "NAV1" },
        },
        "ARD R-270 inbound · wind 360/20",
        { engaged: true, lat: "HDG", vert: "ALT", hdg: 79, alt: 4000 },
        [360, 20],
      );
    case "arc":
      return S(
        {
          pos: { fix: "MSV", radial: 300, distNm: 10 },
          altFt: 4000,
          hdg: 30,
          iasKt: 100,
          radios: { nav1: "MSV", obs1: 210, cdi: "NAV1", brg1: "NAV1" },
        },
        "MSV 10 DME arc · R-300",
        { engaged: true, lat: "HDG", vert: "ALT", hdg: 30, alt: 4000 },
      );
    case "ndb":
      return S(
        {
          pos: { fix: "PA", radial: 270, distNm: 8 },
          altFt: 3000,
          hdg: 80,
          iasKt: 100,
          radios: { adf: 344, brg1: "ADF" },
        },
        "PA NDB · 8 NM west",
        { engaged: true, lat: "HDG", vert: "ALT", hdg: 80, alt: 3000 },
      );
    case "gps":
      return S(
        {
          pos: { fix: "ARD", radial: 200, distNm: 12 },
          altFt: 4000,
          hdg: 20,
          iasKt: 100,
          radios: { nav1: "ARD", obs1: 20, cdi: "NAV1", brg1: "NAV1" },
        },
        "Direct ARD · 12 NM",
        { engaged: true, lat: "HDG", vert: "ALT", hdg: 20, alt: 4000 },
      );
    case "loc":
      return S(
        {
          pos: { runway: { icao: "PARD", id: "27" }, distNm: 12, offsetDeg: 6 },
          altFt: 3000,
          hdg: 240,
          iasKt: 100,
          radios: { nav1: "IPRD", obs1: 270, cdi: "NAV1" },
        },
        "PARD LOC 27 · 30° intercept",
        { engaged: true, lat: "HDG", vert: "ALT", hdg: 240, alt: 3000 },
      );
    default:
      return {};
  }
}

/** The approach in numbers: final course, FAF altitude and distance, minimums (nav/data). */
function approachFacts(plate: string) {
  const ap = findApproach(plate);
  if (!ap) return null;
  const k = ap.final.findIndex((l) => l.role === "FAF");
  const faf = k >= 0 ? ap.final[k] : undefined;
  const after = k >= 0 ? ap.final.slice(k + 1) : [];
  const distNm = after.reduce((s, l) => s + (l.dist ?? 0), 0);
  const mins = ap.minimums[0];
  const minAlt = mins ? (mins.da ?? mins.mda) : undefined;
  return {
    ap,
    name: `${ap.airport} ${ap.name}`,
    fafIdent: faf?.fix.ident,
    fafAlt: faf?.altMin,
    distNm: distNm > 0 ? distNm : undefined,
    minAlt,
    da: mins?.da !== undefined,
    angle: ap.gsAngle ?? 3,
  };
}

function concept(kind: Kind, ex: BriefingExercise): Concept | null {
  const sc = `brief.${ex.id}`;
  const inst = (
    g: InstrumentView,
    alt: L10n,
    live = true,
    covers?: ("ai" | "dg")[],
  ): Visual => ({
    t: "inst",
    view: g,
    scene: sc,
    live,
    alt,
    ...(covers ? { covers } : {}),
  });
  const eyebrow = L("The key concept", "Le concept clé");
  switch (kind) {
    case "scan":
      return {
        eyebrow,
        title: L("The radial scan", "Le circuit visuel en étoile"),
        visual: inst(
          SIX,
          L(
            "The six instruments in level flight at 4,000 ft, heading 090, 100 knots",
            "Les six instruments en palier à 4 000 ft, cap 090, 100 kt",
          ),
        ),
        rows: [
          [
            L("The attitude indicator at the centre", "L’horizon au centre"),
            L(
              "Every glance starts there and comes back to it.",
              "Chaque regard part de l’horizon et y revient.",
            ),
          ],
          [
            L("1° of pitch ≈ 100 ft/min", "1° d’assiette ≈ 100 ft/min"),
            L(
              "Small pitch changes, then trim the pressure away.",
              "Petites corrections d’assiette, puis trimez.",
            ),
          ],
          [
            L(
              "Attitude + power = performance",
              "Assiette + puissance = performance",
            ),
            L(
              "Set, check, adjust. Never chase the needles.",
              "Affichez, vérifiez, ajustez. Ne courez pas après les aiguilles.",
            ),
          ],
        ],
      };
    case "climb":
      return {
        eyebrow,
        title: L(
          "Pitch for airspeed, power for the rate",
          "L’assiette pour la vitesse, la puissance pour le vario",
        ),
        visual: inst(
          SIX,
          L(
            "The six instruments in a 75-knot climb at 600 ft/min",
            "Les six instruments en montée à 75 kt et 600 ft/min",
          ),
        ),
        rows: [
          [
            L("Climb: full power, about 7°", "Montée : plein gaz, environ 7°"),
            L(
              "The pitch attitude holds 75 KIAS.",
              "L’assiette tient les 75 kt.",
            ),
          ],
          [
            L("Level off at 10 % of the VS", "Mise en palier à 10 % du vario"),
            L(
              "At 500 ft/min, start 50 ft before the altitude.",
              "À 500 ft/min, commencez 50 ft avant l’altitude.",
            ),
          ],
          [
            L(
              "Descent: the power sets the rate",
              "Descente : la puissance règle le vario",
            ),
            L(
              "About 1,700 RPM and −2° for 500 ft/min at 90 KIAS.",
              "Environ 1 700 tr/min et −2° pour 500 ft/min à 90 kt.",
            ),
          ],
        ],
      };
    case "turn":
      return {
        eyebrow,
        title: L("The standard-rate turn", "Le virage au taux standard"),
        visual: inst(
          GAUGE("tc"),
          L(
            "Turn coordinator in a standard-rate left turn: the wing on the mark",
            "Indicateur de virage en virage standard à gauche : l’aile sur le repère",
          ),
        ),
        rows: [
          [
            L("3°/s: 2 minutes for 360°", "3°/s : 2 minutes pour 360°"),
            L(
              "The little wing sits on the standard-rate mark.",
              "La maquette se pose sur le repère du taux standard.",
            ),
          ],
          [
            L("Bank ≈ TAS / 10 + 7", "Inclinaison ≈ Vp / 10 + 7"),
            L("About 15° at 90 knots.", "Environ 15° à 90 kt."),
          ],
          [
            L(
              "Lead the roll-out by half the bank",
              "Anticipez la sortie de la moitié de l’inclinaison",
            ),
            L(
              "About 8° before the target heading.",
              "Environ 8° avant le cap visé.",
            ),
          ],
        ],
      };
    case "steep":
      return {
        eyebrow,
        title: L("The steep turn", "Le virage à grande inclinaison"),
        visual: inst(
          GAUGE("ai"),
          L(
            "Attitude indicator in a 45° right bank",
            "Horizon artificiel incliné à 45° à droite",
          ),
          false,
        ),
        rows: [
          [
            L("45° bank, ±5°", "45° d’inclinaison, ±5°"),
            L(
              "Load factor 1.4 g: back pressure and about 100 RPM more.",
              "Facteur de charge 1,4 g : tirez et ajoutez environ 100 tr/min.",
            ),
          ],
          [
            L("Altitude ±100 ft", "Altitude ±100 ft"),
            L(
              "The VSI shows the trend before the altimeter.",
              "Le vario montre la tendance avant l’altimètre.",
            ),
          ],
          [
            L("Roll out about 20° early", "Sortez environ 20° avant le cap"),
            L(
              "Half the bank angle, and release the back pressure.",
              "La moitié de l’inclinaison, en relâchant la traction.",
            ),
          ],
        ],
      };
    case "unusual":
      return {
        eyebrow,
        title: L(
          "Recovering an unusual attitude",
          "Récupérer une position inhabituelle",
        ),
        visual: inst(
          GAUGE("ai"),
          L(
            "Attitude indicator nose high in a right bank",
            "Horizon artificiel en cabré, incliné à droite",
          ),
          false,
        ),
        rows: [
          [
            L(
              "Nose high: power, nose down, wings level",
              "Cabré : puissance, piqué, ailes à plat",
            ),
            L(
              "Airspeed decaying: lower the nose first.",
              "La vitesse chute : rendez la main d’abord.",
            ),
          ],
          [
            L(
              "Nose low: power off, wings level, then pull",
              "Piqué : réduire, ailes à plat, puis ressource",
            ),
            L(
              "Never pull while banked: it tightens the spiral.",
              "Ne tirez jamais incliné : la spirale se resserre.",
            ),
          ],
          [
            L(
              "Confirm on the other instruments",
              "Confirmez sur les autres instruments",
            ),
            L(
              "Altimeter, VSI and airspeed agree with the horizon.",
              "Altimètre, vario et vitesse confirment l’horizon.",
            ),
          ],
        ],
      };
    case "ppUnusual":
      return {
        eyebrow,
        title: L(
          "Partial panel: read the trends",
          "Panne partielle : lisez les tendances",
        ),
        visual: inst(
          SIX,
          L(
            "The six instruments with the attitude indicator and the heading indicator covered",
            "Les six instruments, horizon et conservateur de cap masqués",
          ),
          true,
          ["ai", "dg"],
        ),
        rows: [
          [
            L("Airspeed tells the pitch", "La vitesse donne l’assiette"),
            L(
              "Decreasing: nose high. Increasing: nose low.",
              "Elle diminue : cabré. Elle augmente : piqué.",
            ),
          ],
          [
            L(
              "The turn coordinator tells the bank",
              "L’indicateur de virage donne l’inclinaison",
            ),
            L(
              "Level the little wings first.",
              "Mettez d’abord la maquette à plat.",
            ),
          ],
          [
            L(
              "Altimeter stops: the pitch is level",
              "L’altimètre s’arrête : assiette à plat",
            ),
            L(
              "Its trend reverses as the nose passes the horizon.",
              "Sa tendance s’inverse quand le nez passe l’horizon.",
            ),
          ],
        ],
      };
    case "ppCompass":
      return {
        eyebrow,
        title: L("Compass and timed turns", "Compas et virages chronométrés"),
        visual: inst(
          SIX,
          L(
            "Partial panel: attitude and heading indicators covered, in a standard-rate turn",
            "Panne partielle : horizon et conservateur de cap masqués, en virage standard",
          ),
          true,
          ["ai", "dg"],
        ),
        rows: [
          [
            L("3°/s: 10 seconds per 30°", "3°/s : 10 secondes pour 30°"),
            L(
              "Wing on the mark, stopwatch running.",
              "Maquette sur le repère, chronomètre lancé.",
            ),
          ],
          [
            L(
              "The compass lags to the north, leads to the south",
              "Le compas retarde vers le nord, avance vers le sud",
            ),
            L(
              "Northern hemisphere: roll out early to the north, late to the south.",
              "Hémisphère nord : sortez avant vers le nord, après vers le sud.",
            ),
          ],
          [
            L("Read it with the wings level", "Lisez-le ailes à plat"),
            L(
              "The compass is only right in steady flight.",
              "Le compas n’est juste qu’en vol stabilisé.",
            ),
          ],
        ],
      };
    case "slow":
      return {
        eyebrow,
        title: L(
          "Approach configuration and slow flight",
          "Configuration d’approche et vol lent",
        ),
        visual: inst(
          GAUGE("asi"),
          L(
            "Airspeed indicator at 65 knots, in the white arc",
            "Anémomètre à 65 kt, dans l’arc blanc",
          ),
          false,
        ),
        rows: [
          [
            L("Configure in order", "Configurez dans l’ordre"),
            L(
              "Power, flaps, attitude, then trim.",
              "Puissance, volets, assiette, puis trim.",
            ),
          ],
          [
            L("Airspeed ±5 KIAS", "Vitesse ±5 kt"),
            L(
              "Small pitch changes; the power holds the altitude.",
              "Petites corrections d’assiette ; la puissance tient l’altitude.",
            ),
          ],
          [
            L("No stall warning", "Aucune alarme de décrochage"),
            L(
              "At the first sign: less pitch, more power.",
              "Au premier signe : moins d’assiette, plus de puissance.",
            ),
          ],
        ],
      };
    case "vor":
      return {
        eyebrow,
        title: L("Reading the HSI", "Lire le HSI"),
        visual: inst(
          GAUGE("hsi"),
          L(
            "HSI tracking the 045 radial outbound from ARD, needle centred, FROM",
            "HSI sur la radiale 045 en éloignement d’ARD, aiguille centrée, FROM",
          ),
        ),
        rows: [
          [
            L("The OBS sets a course", "Le sélecteur affiche une route"),
            L(
              "The arrow shows a course, not a heading.",
              "La flèche montre une route, pas un cap.",
            ),
          ],
          [
            L(
              "TO / FROM: where the station is",
              "TO / FROM : où est la station",
            ),
            L(
              "FROM: the station is behind you on that course.",
              "FROM : la station est derrière vous sur cette route.",
            ),
          ],
          [
            L("Fly towards the needle", "Allez vers l’aiguille"),
            L(
              "The needle shows where the course is.",
              "L’aiguille montre où se trouve la route.",
            ),
          ],
        ],
      };
    case "wind":
      return {
        eyebrow,
        title: L(
          "Tracking with a crosswind",
          "Tenir une route par vent de travers",
        ),
        visual: {
          t: "diagram",
          d: {
            kind: "calc",
            calc: {
              kind: "windTriangle",
              course: 90,
              tasKt: 100,
              windDir: 360,
              windKt: 20,
            },
          },
          alt: L(
            "Wind triangle: course 090, 100 knots, wind 360 at 20 knots",
            "Triangle des vitesses : route 090, 100 kt, vent 360/20",
          ),
        },
        rows: [
          [
            L(
              "The wind pushes you off the course",
              "Le vent vous écarte de la route",
            ),
            L(
              "A centred needle drifts away if the heading is the course.",
              "Cap = route : l’aiguille centrée finit par partir.",
            ),
          ],
          [
            L(
              "Heading = course + correction into the wind",
              "Cap = route + correction côté vent",
            ),
            L(
              "Here about 12° to the left of 090.",
              "Ici, environ 12° à gauche de 090.",
            ),
          ],
          [
            L("Bracket, then halve", "Encadrez, puis divisez par deux"),
            L(
              "Correct 20°, then halve until the needle stays put.",
              "Corrigez de 20°, puis divisez par deux jusqu’à ce que l’aiguille ne bouge plus.",
            ),
          ],
        ],
      };
    case "arc":
      return {
        eyebrow,
        title: L("Flying a DME arc", "Voler un arc DME"),
        visual: inst(
          GAUGE("rmi"),
          L(
            "RMI on the 10 DME arc of MSV: the needle on the left wingtip",
            "RMI sur l’arc 10 DME de MSV : l’aiguille en bout d’aile gauche",
          ),
        ),
        rows: [
          [
            L("The needle on the wingtip", "L’aiguille en bout d’aile"),
            L(
              "On the arc the station stays 90° off the nose.",
              "Sur l’arc, la station reste à 90° du nez.",
            ),
          ],
          [
            L(
              "Turn 10°, let it drift 10°",
              "Tournez de 10°, laissez dériver de 10°",
            ),
            L("Keep the distance within ±1 NM.", "Tenez la distance à ±1 NM."),
          ],
          [
            L("Lead the turn onto the arc", "Anticipez l’entrée sur l’arc"),
            L(
              "About 0.5 NM before it at 90 knots.",
              "Environ 0,5 NM avant, à 90 kt.",
            ),
          ],
        ],
      };
    case "ndb":
      return {
        eyebrow,
        title: L("Tracking a QDM", "Suivre un QDM"),
        visual: inst(
          GAUGE("rmi"),
          L("RMI pointing to the PA NDB", "RMI pointant la balise PA"),
        ),
        rows: [
          [
            L("QDM = heading + relative bearing", "QDM = cap + gisement"),
            L(
              "The RMI needle's head reads the QDM directly.",
              "La tête de l’aiguille du RMI donne le QDM.",
            ),
          ],
          [
            L(
              "Intercept, then correct for the wind",
              "Interceptez, puis corrigez la dérive",
            ),
            L(
              "The needle's head moves to the side the wind comes from.",
              "La tête part du côté d’où vient le vent.",
            ),
          ],
          [
            L(
              "Over the station the needle swings",
              "À la verticale, l’aiguille bascule",
            ),
            L(
              "It falls to the tail: note the time.",
              "Elle passe vers l’arrière : notez l’heure.",
            ),
          ],
        ],
      };
    case "gps":
      return {
        eyebrow,
        title: L(
          "Direct-to and the flight plan",
          "Le direct et le plan de vol",
        ),
        visual: inst(
          GAUGE("hsi"),
          L("HSI heading direct to ARD", "HSI en route directe vers ARD"),
        ),
        rows: [
          [
            L(
              "Direct-to: a new leg from where you are",
              "Direct : une nouvelle branche depuis votre position",
            ),
            L(
              "The course is drawn from the aircraft to the fix.",
              "La route part de l’avion vers le point.",
            ),
          ],
          [
            L(
              "The magenta line is the active leg",
              "La ligne magenta est la branche active",
            ),
            L(
              "Follow it on the HSI and on the map.",
              "Suivez-la sur le HSI et sur la carte.",
            ),
          ],
          [
            L("Check every sequence", "Vérifiez chaque séquencement"),
            L(
              "At each waypoint: the next leg and its course.",
              "À chaque point : la branche suivante et sa route.",
            ),
          ],
        ],
      };
    case "loc":
      return {
        eyebrow,
        title: L("Intercepting the localizer", "Intercepter le localizer"),
        visual: inst(
          GAUGE("hsi"),
          L(
            "HSI on a 30° intercept of the runway 27 localizer, needle coming in",
            "HSI en interception à 30° du localizer 27, aiguille qui arrive",
          ),
        ),
        rows: [
          [
            L("Full scale = 2.5°", "Pleine échelle = 2,5°"),
            L(
              "At 10 NM one dot ≈ 0.2 NM: the needle speeds up close in.",
              "À 10 NM un point ≈ 0,2 NM : l’aiguille accélère près de la piste.",
            ),
          ],
          [
            L("Start the turn at about 1 dot", "Virez vers 1 point"),
            L(
              "Earlier for 45° or more, or with a tailwind.",
              "Plus tôt à 45° et plus, ou vent arrière.",
            ),
          ],
          [
            L(
              "No overshoot past 1 dot",
              "Pas de dépassement au-delà d’un point",
            ),
            L(
              "Then hold the needle within ¾ scale.",
              "Puis tenez l’aiguille dans les ¾ de l’échelle.",
            ),
          ],
        ],
      };
    case "approach": {
      const f = ex.plate ? approachFacts(ex.plate) : null;
      if (!f || f.fafAlt === undefined || f.minAlt === undefined) return null;
      const dist = f.distNm ?? Math.max(3, (f.fafAlt - f.minAlt) / 318);
      return {
        eyebrow: L("The approach in numbers", "L’approche en chiffres"),
        title: E(f.name),
        visual: {
          t: "diagram",
          d: {
            kind: "calc",
            calc: {
              kind: "profile",
              fromFt: f.fafAlt,
              toFt: f.minAlt,
              angleDeg: f.angle,
              gsKt: 90,
              distNm: Math.round(dist * 10) / 10,
            },
          },
          alt: {
            en: `Final approach profile from ${f.fafIdent ?? "the FAF"} at ${f.fafAlt} ft down to ${f.minAlt} ft`,
            fr: `Profil de l’approche finale de ${f.fafIdent ?? "FAF"} à ${f.fafAlt} ft jusqu’à ${f.minAlt} ft`,
          },
        },
        rows: [
          [
            cat(
              L("Final course", "Axe final"),
              E(`${pad3(f.ap.finalCourse)}°`),
            ),
            f.ap.navaid
              ? {
                  en: `On ${f.ap.navaid}: set it on NAV1 and the course on the HSI.`,
                  fr: `Sur ${f.ap.navaid} : affichez-le sur NAV1 et la route sur le HSI.`,
                }
              : L(
                  "Load the approach in the GPS and check every leg.",
                  "Chargez l’approche dans le GPS et vérifiez chaque branche.",
                ),
          ],
          [
            cat(
              {
                en: `${f.fafIdent ?? "FAF"} at`,
                fr: `${f.fafIdent ?? "FAF"} à`,
              },
              ft(f.fafAlt),
            ),
            {
              en: `The final descent starts here: about ${Math.round(Math.tan((f.angle * Math.PI) / 180) * 6076)} ft per NM.`,
              fr: `La descente finale commence ici : environ ${Math.round(Math.tan((f.angle * Math.PI) / 180) * 6076)} ft par NM.`,
            },
          ],
          [
            cat(f.da ? L("DA", "DA") : L("MDA", "MDA"), ft(f.minAlt)),
            f.da
              ? L(
                  "Nothing in sight at the DA: go around at once.",
                  "Rien en vue à la DA : remise des gaz immédiate.",
                )
              : L(
                  "Level at the MDA until the missed approach point.",
                  "Palier à la MDA jusqu’au point d’approche interrompue.",
                ),
          ],
        ],
      };
    }
    default:
      return null;
  }
}

// ------------------------------------------------------------------ visuals in a frame
function visualBlock(
  v: Visual,
  x: number,
  y: number,
  w: number,
  h: number,
  quiet = false,
): SlideBlock {
  if (v.t === "inst")
    return INST(v.view, v.alt, x, y, w, h, {
      scene: v.scene,
      mode: v.live && !quiet ? "live" : "frozen",
      ...(v.covers ? { covers: v.covers } : {}),
    });
  return {
    id: "v",
    frame: { x, y, w, h, z: 1 },
    kind: "diagram",
    ...(v.d ? { d: v.d } : {}),
    alt: v.alt,
    ...(v.asset ? { asset: v.asset } : {}),
    ...(v.caption ? { caption: v.caption } : {}),
  };
}
/** The frame a visual takes in a column: gauges are square, the six-pack is 3:2, diagrams fill. */
function fit(
  v: Visual,
  x: number,
  y: number,
  w: number,
  h: number,
): [number, number, number, number] {
  let fw = w;
  let fh = h;
  if (v.t === "inst") {
    const ratio = v.view.kind === "gauge" ? 1 : 1.5;
    fw = Math.min(w, h * ratio);
    fh = fw / ratio;
  }
  return [
    Math.round(x + (w - fw) / 2),
    Math.round(y + (h - fh) / 2),
    Math.round(fw),
    Math.round(fh),
  ];
}

/** Rows of a heading and a line of body text, laid out from `y` in a column `w` wide; null when they do not fit. */
function rows(
  items: [L10n, L10n][],
  x: number,
  y: number,
  w: number,
  bottom: number,
  colors: ("nav" | "sel" | "key" | "text")[] = [],
): SlideBlock[] | null {
  const out: SlideBlock[] = [];
  const parts = items.map(([a, b]) => ({
    a,
    b,
    ha: hOf(a, "heading", w, 2),
    hb: hOf(b, "body", w, 3),
  }));
  const need = parts.reduce((s, p) => s + 24 + p.ha + 8 + p.hb, 0);
  const free = bottom - y - need;
  if (free < 0) return null;
  const gap = Math.min(48, free / Math.max(1, items.length - 1));
  let yy = y;
  parts.forEach((p, i) => {
    out.push(rule(x, yy, w));
    out.push(
      T("heading", p.a, x, yy + 24, w, p.ha, { color: colors[i] ?? "text" }),
    );
    out.push(T("body", p.b, x, yy + 24 + p.ha + 8, w, p.hb, { color: "ink2" }));
    yy += 24 + p.ha + 8 + p.hb + gap;
  });
  return out;
}

// ------------------------------------------------------------------ standards in numbers
const VALUE =
  /(±\s?~?[\d.,:]+\s?(?:°|ft|KIAS|kt|s|NM|dots?|%)?|[≤<≥>]\s?~?[\d.,:]+\s?(?:°|ft|KIAS|kt|s|NM|dots?|%)?|¾)/g;
/** "Altitude ±100 ft" → { value: "±100 ft", label: "Altitude" }; a standard without one number stays a sentence */
export function standardNumber(
  s: string,
): { value: string; label: string } | null {
  if (s.length > 48) return null;
  const m = s.match(VALUE);
  if (!m || m.length !== 1) return null;
  const value = m[0].trim();
  if (value === "¾")
    return { value: "¾", label: s };
  const label = s
    .replace(m[0], " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.)])/g, "$1")
    .trim();
  return { value, label: label || s };
}

// ------------------------------------------------------------------ the deck
interface DeckStep {
  id: string;
  title: L10n;
  slide: SlideCanvas;
  reader: L10n[];
}
/** A plate keeps its page's proportions (plates/plates.ts: 600 × 900), centred in the frame it was given: the
 *  whole page shows, minimums and missed approach included. */
const PLATE_RATIO = 600 / 900;
function plateFrame(b: SlideBlock): SlideBlock {
  if (b.kind !== "diagram" || b.d?.kind !== "plate") return b;
  const f = b.frame;
  const w = Math.min(f.w, Math.round(f.h * PLATE_RATIO));
  const h = Math.round(w / PLATE_RATIO);
  return {
    ...b,
    frame: {
      ...f,
      x: Math.round(f.x + (f.w - w) / 2),
      y: Math.round(f.y + (f.h - h) / 2),
      w,
      h,
    },
  };
}
/** Unique, stable block ids: `<slide>.<n>` (layout helpers number blocks with a module counter). */
function ided(s: DeckStep): DeckStep {
  let n = 0;
  return {
    ...s,
    slide: {
      ...s.slide,
      blocks: s.slide.blocks.map((b) => ({
        ...plateFrame(b),
        id: `${s.id}.${++n}`,
      })),
    },
  };
}
const setupVerb: Record<string, L10n> = {
  Tune: L("Tune", "Accorder"),
  Set: L("Set", "Régler"),
  Select: L("Select", "Sélectionner"),
  Load: L("Load", "Charger"),
};

/**
 * The briefing deck of an exercise: a Course with shape 'briefing' (the same player, the same editor). `rt` is the
 * attempt being briefed (its steps, clearance, quiz, hold and set-up items); without it the deck briefs what the
 * exercise always does.
 */
export function buildBriefingDeck(
  ex: BriefingExercise,
  lang: Lang,
  rt: BriefingRuntime = { steps: [] },
): Briefing {
  const kind = briefingKind(ex, rt);
  const c = concept(kind, ex);
  const facts = ex.plate ? approachFacts(ex.plate) : null;
  const scenes = c && c.visual.t === "inst" ? conceptScenes(kind, ex) : {};
  const stage = STAGE_NAMES[ex.stage];
  const plateVisual: Visual | null =
    ex.plate && facts
      ? {
          t: "diagram",
          d: { kind: "plate", approachId: ex.plate },
          asset: plateAsset(ex.plate),
          alt: E(`Approach plate ${facts.name}`),
        }
      : null;
  const holdVisual = (quiet: boolean): Visual | null =>
    rt.hold
      ? {
          t: "diagram",
          d: {
            kind: "hold",
            inbound: rt.hold.inbound,
            turn: rt.hold.turn,
            fix: rt.hold.fix,
            ...(quiet ? { quiet: true } : {}),
          },
          alt: E(
            `Holding pattern at ${rt.hold.fix}, inbound ${pad3(rt.hold.inbound)}, ${rt.hold.turn === "R" ? "right" : "left"} turns`,
          ),
        }
      : null;
  // the slides the exercise data already gives (exerciseBriefing.ts): the clearance + check, the hold, the plate
  const src: BriefingSource = {
    id: ex.id,
    title: ex.title,
    summary: ex.summary,
    minutes: ex.minutes,
    allowAp: ex.allowAp,
    objectives: ex.objectives,
    standards: ex.standards,
    briefing: ex.briefing,
    steps: rt.steps,
    ...(plateVisual && facts ? { plate: ex.plate, plateName: facts.name } : {}),
    ...(rt.clearance ? { clearance: rt.clearance } : {}),
    ...(rt.quiz ? { quiz: rt.quiz } : {}),
    ...(rt.hold ? { hold: rt.hold } : {}),
  };
  const given = exerciseDataSlides(src);
  const pick = (id: string) => given.find((s) => s.id === id);
  const out: DeckStep[] = [];
  const steps = rt.steps.filter(Boolean);

  // ---------------------------------------------------------------- A1 cover
  {
    const hero = holdVisual(true) ?? plateVisual ?? c?.visual ?? null;
    const meta = [
      { en: `About ${ex.minutes} min`, fr: `Environ ${ex.minutes} min` },
      ex.allowAp
        ? L("autopilot allowed", "pilote automatique autorisé")
        : L("hand-flown", "pilotage manuel"),
      ...(steps.length
        ? [
            {
              en: `${steps.length} ${steps.length === 1 ? "step" : "steps"}`,
              fr: `${steps.length} ${steps.length < 2 ? "étape" : "étapes"}`,
            },
          ]
        : []),
    ];
    const blocks: SlideBlock[] = [
      T(
        "eyebrow",
        stage
          ? stage
          : L("Lesson briefing", "Briefing de leçon"),
        G.left,
        G.eyebrowY,
        840,
        32,
      ),
      T("display", E(ex.title), G.left, 216, 864, 400, { valign: "bottom" }),
      T("lead", E(ex.summary), G.left, 648, 840, 232),
      T(
        "foot",
        {
          en: meta.map((m) => m.en).join(" · "),
          fr: meta.map((m) => m.fr ?? m.en).join(" · "),
        },
        G.left,
        912,
        840,
        32,
      ),
    ];
    if (hero) {
      const [x, y, w, h] =
        hero.t === "diagram" && hero.d?.kind === "plate"
          ? [1080, 96, 720, 888]
          : hero.t === "diagram"
            ? [1032, 120, 768, 840]
            : fit(hero, 1032, 96, 768, 888);
      blocks.push(visualBlock(hero, x, y, w, h, true));
    }
    out.push({
      id: "b-cover",
      title: E(ex.title),
      slide: canvas(blocks, "cover"),
      reader: [E(ex.title), E(ex.summary)],
    });
  }

  // ---------------------------------------------------------------- what you will do: objectives + key points
  {
    const obj = ex.objectives.filter(Boolean).slice(0, 4);
    const tips = ex.briefing.filter(Boolean);
    const blocks: SlideBlock[] = [
      ...header(
        L("The exercise", "L’exercice"),
        L("What you will do", "Ce que vous allez faire"),
      ),
    ];
    const top = 336;
    // objectives: numbered, in heading size, on the left 7 columns
    const ow = G.w(7) - 80;
    let y = top;
    const objH = obj.map((o) => hOf(E(o), "heading", ow, 3));
    const objGap = Math.max(
      32,
      Math.min(
        80,
        (984 - top - objH.reduce((s, n) => s + n, 0)) / Math.max(1, obj.length),
      ),
    );
    obj.forEach((o, i) => {
      blocks.push(MARK(i + 1, G.left + 28, y + 30, { size: 56 }));
      blocks.push(T("heading", E(o), G.left + 80, y, ow, objH[i]));
      y += objH[i] + objGap;
    });
    // key points: the exercise's tips on the right 4 columns, as many as fit; the rest go on a second slide
    const tx = G.x(8);
    const tw = G.w(4);
    blocks.push(
      T("eyebrow", L("Key points", "Points clés"), tx, top, tw, 32, {
        color: "muted",
      }),
    );
    let ty = top + 64;
    let shown = 0;
    for (const t of tips) {
      const th = hOf(E(t), "body", tw - 32, 5);
      if (ty + th > 984) break;
      blocks.push(
        SHAPE("rect", tx, ty + 8, 6, 40, { fill: "key", stroke: null }),
      );
      blocks.push(T("body", E(t), tx + 32, ty, tw - 32, th));
      ty += th + 40;
      shown++;
    }
    if (!obj.length)
      blocks.push(T("lead", E(ex.summary), G.left, top, G.w(7), 232));
    out.push({
      id: "b-goals",
      title: L("What you will do", "Ce que vous allez faire"),
      slide: canvas(blocks, "twoColumn"),
      reader: [...obj.map(E), ...tips.map(E)],
    });
    const rest = tips.slice(shown);
    if (rest.length) {
      const more: SlideBlock[] = [
        ...header(
          L("The exercise", "L’exercice"),
          L("Key points, continued", "Points clés, suite"),
        ),
      ];
      let yy = top;
      rest.forEach((t, i) => {
        const th = hOf(E(t), "heading", 1600, 3);
        more.push(MARK(shown + i + 1, G.left + 28, yy + 30, { size: 56 }));
        more.push(T("heading", E(t), G.left + 80, yy, 1600, th));
        yy += th + 56;
      });
      out.push({
        id: "b-tips",
        title: L("Key points", "Points clés"),
        slide: canvas(more, "stepByStep"),
        reader: rest.map(E),
      });
    }
  }

  // ---------------------------------------------------------------- A5 / A4 the key concept on a big visual
  if (c) {
    const v = c.visual;
    const blocks: SlideBlock[] = [];
    if (v.t === "inst" && v.view.kind === "gauge") {
      // A5: the instrument 840 square on the left, the title and three rows on the right
      blocks.push(visualBlock(v, G.left, 120, 840, 840));
      const x = 1080;
      const w = 720;
      blocks.push(T("eyebrow", c.eyebrow, x, 120, w, 32));
      const th = hOf(c.title, "title", w, 3);
      blocks.push(T("title", c.title, x, 160, w, th));
      const r =
        rows(c.rows, x, 160 + th + 48, w, 984, ["nav", "sel", "key"]) ??
        rows(c.rows.slice(0, 2), x, 160 + th + 48, w, 984, ["nav", "sel"]) ??
        [];
      blocks.push(...r);
    } else {
      // A4: the header across, the visual on the left 7 columns, three rows on the right
      blocks.push(...header(c.eyebrow, c.title));
      const top = 160 + hOf(c.title, "title", 1680, 2) + 40;
      const [x, y, w, h] =
        v.t === "inst"
          ? fit(v, G.left, top, G.w(6) + 96, 984 - top)
          : [G.left, top, G.w(6) + 96, 984 - top];
      blocks.push(visualBlock(v, x, y, w, h));
      const rx = G.x(7);
      const rw = G.w(5);
      const r =
        rows(c.rows, rx, top + 8, rw, 984, ["nav", "sel", "key"]) ??
        rows(c.rows.slice(0, 2), rx, top + 8, rw, 984, ["nav", "sel"]) ??
        [];
      blocks.push(...r);
    }
    out.push({
      id: "b-concept",
      title: c.title,
      slide: canvas(
        blocks,
        v.t === "inst" && v.view.kind === "gauge"
          ? "instrumentNotes"
          : "heroDiagram",
      ),
      reader: [c.title, ...c.rows.map(([a, b]) => cat(a, b, ": "))],
    });
  }

  // ---------------------------------------------------------------- the clearance and its knowledge check, the hold, the plate
  for (const id of ["b-check", "b-hold", "b-plate"]) {
    const s = pick(id);
    if (s)
      out.push({ id: s.id, title: s.title, slide: s.slide, reader: [s.title] });
  }

  // ---------------------------------------------------------------- A7 the steps, beside the visual
  if (steps.length) {
    const side = c?.visual ?? holdVisual(true) ?? plateVisual;
    const lw = side ? G.w(7) : 1680;
    const per = 5;
    const pages = Math.ceil(steps.length / per);
    for (let p = 0; p < pages; p++) {
      const part = steps.slice(p * per, p * per + per);
      const title =
        steps.length === 1
          ? L("Your mission", "Votre mission")
          : pages > 1
            ? {
                en: `The steps · ${p + 1} of ${pages}`,
                fr: `Les étapes · ${p + 1} sur ${pages}`,
              }
            : L("The steps", "Les étapes");
      const blocks: SlideBlock[] = [
        ...header(L("In the air", "En vol"), title),
      ];
      const top = 336;
      if (steps.length === 1) {
        const qh = hOf(E(steps[0]), "quote", lw - 40, 8);
        blocks.push(
          SHAPE("rect", G.left, top, 6, Math.min(qh, 984 - top), {
            fill: "accent",
            stroke: null,
          }),
        );
        blocks.push(
          T(
            "quote",
            E(steps[0]),
            G.left + 40,
            top,
            lw - 40,
            Math.min(qh, 984 - top),
          ),
        );
      } else {
        const tw = lw - 80;
        const hs = part.map((t) => hOf(E(t), "body", tw, 4));
        const total = hs.reduce((s, n) => s + n, 0);
        const gap = Math.max(
          32,
          Math.min(72, (984 - top - total) / Math.max(1, part.length)),
        );
        let y = top;
        part.forEach((t, k) => {
          blocks.push(
            MARK(p * per + k + 1, G.left + 28, y + 24, {
              size: 56,
              ...(k > 0 ? { reveal: k } : {}),
            }),
          );
          blocks.push(
            T(
              "body",
              E(t),
              G.left + 80,
              y,
              tw,
              hs[k],
              k > 0 ? { reveal: k } : {},
            ),
          );
          y += hs[k] + gap;
        });
      }
      if (side) {
        const [x, y, w, h] =
          side.t === "diagram" && side.d?.kind === "plate"
            ? [1176, 96, 624, 888]
            : fit(side, 1128, 312, 672, 672);
        blocks.push(visualBlock(side, x, y, w, h));
      }
      out.push({
        id: pages > 1 ? `b-steps${p + 1}` : "b-steps",
        title:
          steps.length === 1
            ? L("Your mission", "Votre mission")
            : L("The steps", "Les étapes"),
        slide: canvas(blocks, "stepByStep"),
        reader: part.map(E),
      });
    }
  }

  // ---------------------------------------------------------------- the set-up, and what the Set it buttons do
  // two columns of items: what the student has to do first, then the information, then what the exercise already
  // set; as many rows as fit on a slide (two slides at most)
  const preset = (i: BriefingSetupItem) => i.ok === true || /preset/i.test(i.detail ?? "");
  const order = (i: BriefingSetupItem) => (i.ok === false ? 0 : preset(i) ? 2 : 1);
  const setup = (rt.setup ?? [])
    .filter((i) => i.label)
    .slice()
    .sort((a, b) => order(a) - order(b));
  if (setup.length) {
    const helps = setup.some((i) => i.action);
    const lead = helps
      ? L("Set each line yourself. In the exercise window, a button does it for you if you need help.", "Réglez chaque ligne vous-même. Dans la fenêtre d’exercice, un bouton le fait pour vous si besoin.")
      : L("Check each line before you start: the exercise window ticks them live.", "Vérifiez chaque ligne avant de partir : la fenêtre d’exercice les coche en direct.");
    const leadH = hOf(lead, "lead", 1392, 2);
    const top = 240 + leadH + 48;
    const cw = G.w(6);
    const detail = (i: BriefingSetupItem) => (i.detail ?? "").replace(/\s*·\s*preset for this exercise$/i, "").trim();
    const size = (i: BriefingSetupItem) => {
      const lh = hOf(E(i.label), "heading", cw, 2);
      const d = detail(i);
      const dh = d ? hOf(E(d), "body", cw, 3) : 0;
      return { lh, dh, h: 24 + 40 + lh + (d ? 8 + dh : 0) };
    };
    const pages: BriefingSetupItem[][][] = [[]];
    let y = top;
    for (let k = 0; k < setup.length; k += 2) {
      const row = setup.slice(k, k + 2);
      const rh = Math.max(...row.map((i) => size(i).h)) + 32;
      const page = pages[pages.length - 1];
      if (y + rh > 984 + 32 + 16 && page.length) {
        if (pages.length === 2) break;
        pages.push([]);
        y = top;
      }
      pages[pages.length - 1].push(row);
      y += rh;
    }
    pages.forEach((rowsOf, p) => {
      const blocks: SlideBlock[] = [
        ...header(
          L("Before you go", "Avant de partir"),
          pages.length > 1 ? { en: `The set-up · ${p + 1} of ${pages.length}`, fr: `Les réglages · ${p + 1} sur ${pages.length}` } : L("The set-up", "Les réglages"),
        ),
        T("lead", lead, G.left, 240, 1392, leadH),
      ];
      let yy = top;
      for (const row of rowsOf) {
        let rh = 0;
        row.forEach((it, c) => {
          const x = c === 0 ? G.left : G.x(6);
          const z = size(it);
          const d = detail(it);
          const tag: L10n = it.action
            ? cat(L("Button:", "Bouton :"), setupVerb[it.action] ?? E(it.action))
            : preset(it)
              ? L("Already set", "Déjà réglé")
              : it.ok === null
                ? L("To know", "À savoir")
                : L("To do", "À faire");
          blocks.push(rule(x, yy, cw));
          blocks.push(T("eyebrow", tag, x, yy + 24, cw, 32, { color: it.action ? "accent" : "muted" }));
          blocks.push(T("heading", E(it.label), x, yy + 64, cw, z.lh, { color: it.ok === false ? "sel" : "text" }));
          if (d) blocks.push(T("body", E(d), x, yy + 64 + z.lh + 8, cw, z.dh, { color: "ink2" }));
          rh = Math.max(rh, z.h);
        });
        yy += rh + 32;
      }
      out.push({
        id: pages.length > 1 ? `b-setup${p + 1}` : "b-setup",
        title: L("The set-up", "Les réglages"),
        slide: canvas(blocks, "checklist"),
        reader: rowsOf.flat().map((i) => E(detail(i) ? `${i.label}: ${detail(i)}` : i.label)),
      });
    });
  }

  // ---------------------------------------------------------------- A3 the standards as big numbers
  {
    const std = ex.standards.filter(Boolean);
    const nums = std
      .map((s) => ({ s, n: standardNumber(s) }))
      .filter(
        (x): x is { s: string; n: { value: string; label: string } } => !!x.n,
      )
      .slice(0, 4);
    const words = std.filter((s) => !nums.some((x) => x.s === s));
    const blocks: SlideBlock[] = [
      ...header(
        L("To pass", "Pour réussir"),
        L("The standards", "Les tolérances"),
      ),
    ];
    const cols = nums.length === 4 ? 2 : Math.max(1, nums.length);
    const cw = cols === 3 ? 528 : 816;
    const pitch = cols === 3 ? 576 : 864;
    const rowsN = Math.ceil(nums.length / cols);
    const rowH = rowsN > 1 ? 296 : 336;
    const wordsH = words.reduce((sum, w) => sum + hOf(E(w), nums.length ? "body" : "heading", 1600, 2) + 32, 0);
    // the numbers sit in the middle of the free space (at most 96 lower than the body line)
    const top = 344 + Math.max(0, Math.min(96, (984 - 344 - rowsN * rowH - wordsH) / 2));
    let y = top;
    if (nums.length) {
      nums.forEach((x, i) => {
        const cx = G.left + (i % cols) * pitch;
        const cy = top + Math.floor(i / cols) * rowH;
        blocks.push(
          T("display", E(x.n.value), cx, cy, cw, 128, { color: "key" }),
        );
        blocks.push(rule(cx, cy + 160, cw));
        blocks.push(
          T(
            "heading",
            E(x.n.label),
            cx,
            cy + 184,
            cw,
            hOf(E(x.n.label), "heading", cw, 2),
          ),
        );
      });
      y = top + rowsN * rowH + 16;
    }
    for (const w of words) {
      const wh = hOf(E(w), nums.length ? "body" : "heading", 1600, 2);
      if (y + wh > 984) break;
      blocks.push(SHAPE("rect", G.left, y + 8, 6, 40, { fill: "nav", stroke: null }));
      blocks.push(
        T(nums.length ? "body" : "heading", E(w), G.left + 40, y, 1640, wh),
      );
      y += wh + 32;
    }
    blocks.push(
      T(
        "foot",
        L(
          "This exercise's tolerances, modelled on the FAA instrument rating ACS.",
          "Les tolérances de l’exercice, sur le modèle de l’ACS instrument de la FAA.",
        ),
        G.left,
        1008,
        1200,
        32,
      ),
    );
    out.push({
      id: "b-standards",
      title: L("The standards", "Les tolérances"),
      slide: canvas(blocks, "bigNumber"),
      reader: std.map(E),
    });
  }

  // ---------------------------------------------------------------- A11 ready to fly
  {
    const obj = ex.objectives.filter(Boolean).slice(0, 4);
    const nums = ex.standards
      .map(standardNumber)
      .filter((x): x is { value: string; label: string } => !!x)
      .slice(0, 4);
    const blocks: SlideBlock[] = [
      ...header(
        L("Before the flight", "Avant le vol"),
        L("Ready to fly", "Prêt à voler"),
      ),
    ];
    const top = 336;
    blocks.push(
      T(
        "eyebrow",
        L("What you will do", "Ce que vous allez faire"),
        G.left,
        top,
        912,
        32,
        { color: "muted" },
      ),
    );
    let y = top + 64;
    for (const [i, o] of obj.entries()) {
      const oh = hOf(E(o), "body", 832, 2);
      if (y + oh > 840) break;
      blocks.push(MARK(i + 1, G.left + 24, y + 24, { size: 48 }));
      blocks.push(T("body", E(o), G.left + 72, y, 840, oh));
      y += oh + 28;
    }
    if (!obj.length)
      blocks.push(T("body", E(ex.summary), G.left, top + 64, 912, 200));
    const sx = G.x(7);
    blocks.push(
      T("eyebrow", L("To pass", "Pour réussir"), sx, top, 672, 32, {
        color: "muted",
      }),
    );
    nums.forEach((x, i) => {
      const cx = sx + (i % 2) * 360;
      const cy = top + 64 + Math.floor(i / 2) * 208;
      blocks.push(T("title", E(x.value), cx, cy, 312, 88, { color: "key" }));
      blocks.push(
        T(
          "small",
          E(x.label),
          cx,
          cy + 96,
          312,
          hOf(E(x.label), "small", 312, 2),
        ),
      );
    });
    if (!nums.length)
      ex.standards
        .slice(0, 3)
        .forEach((s, i) =>
          blocks.push(T("body", E(s), sx, top + 64 + i * 136, 672, 112)),
        );
    blocks.push(rule(G.left, 872, 1680));
    blocks.push(
      T(
        "body",
        ex.allowAp
          ? L(
              "The simulator is paused at the start. Start the exercise when you are ready: the autopilot is allowed.",
              "Le simulateur est en pause au point de départ. Démarrez quand vous êtes prêt : le pilote automatique est autorisé.",
            )
          : L(
              "The simulator is paused at the start. Start the exercise when you are ready, and fly it by hand.",
              "Le simulateur est en pause au point de départ. Démarrez quand vous êtes prêt, et pilotez à la main.",
            ),
        G.left,
        896,
        1680,
        88,
        { color: "ink2" },
      ),
    );
    out.push({
      id: "b-ready",
      title: L("Ready to fly", "Prêt à voler"),
      slide: canvas(blocks, "ready"),
      reader: [...obj.map(E), ...ex.standards.map(E)],
    });
  }

  const stepsOut: Step[] = out.map(ided).map((s) => ({
    id: s.id,
    kind: s.slide.blocks.some((b) => b.kind === "quiz") ? "quiz" : "slide",
    title: s.title,
    layout: "canvas",
    reader: s.reader.length
      ? s.reader.map((t, i) =>
          i === 0
            ? { t: "heading" as const, text: t }
            : { t: "text" as const, text: t },
        )
      : [{ t: "heading", text: s.title }],
    slide: s.slide,
    minutes: 1,
  }));
  const other: Lang = lang === "fr" ? "en" : "fr";
  return {
    format: "ifr-course",
    version: 1,
    id: `briefing-${ex.id}`,
    rev: 1,
    updated: "2026-11-07T00:00:00.000Z",
    title: E(ex.title),
    summary: E(ex.summary),
    author: { name: BRAND.name },
    langs: [lang, other],
    cockpit: "steam",
    world: { kind: "training" },
    minutes: Math.max(2, Math.round(stepsOut.length * 0.5)),
    steps: stepsOut,
    scenes,
    clips: {},
    // the plate is drawn by the host's chart engine (ui/learn.ts assetUrl): it is declared so the course validates
    assets:
      ex.plate && facts
        ? {
            [plateAsset(ex.plate)]: {
              id: plateAsset(ex.plate),
              mime: "image/svg+xml",
              w: 816,
              h: 1056,
              bytes: 0,
              role: "plate",
              source: facts.ap.source ?? "Wingdeck training region",
              alt: E(`Approach plate ${facts.name}`),
            },
          }
        : {},
    tags: [
      "briefing",
      ...(stage ? [ex.stage.toLowerCase()] : []),
      kind.toLowerCase(),
    ],
    shape: "briefing",
    briefingFor: { exerciseId: ex.id },
    theme: "classroom",
  };
}
