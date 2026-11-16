// Ground school — built-in sample "Holding: entries, timing and wind" (20 steps, steam cockpit, hold at ARD
// inbound 270, right turns). The hold-ndb lesson's briefing is a crafted deck (samples/briefings/holdNdb.ts).
// One idea, then the student does it: the three-minute rule and what the course teaches, the clearance (a
// question, then the inbound course set on the HSI), the anatomy, the three entries, then three entry exercises (a
// question, drag the aircraft into the teardrop sector, another question), the turn at the fix on a live HSI and
// the teardrop entry flown on the HSI beside the hold and the top view;
// timing, the abeam point shown on a live HSI (a question), a timing calc; the wind on a diagram the student
// drags, the inbound heading flown on the HSI with the top view; a drill (wind, timing, maximum speeds), the three
// classic mistakes, the takeaways and Fly it with its two briefing questions. Every entry shown or checked comes
// from holdEntry() (nav/holding.ts, AIM FIG 5-3-8).
// Sources: FAA AIM 5-3-8 (holding: clearance items, entries, timing, maximum speeds, the 3-minute speed
// reduction), FAA-H-8083-15 Instrument Flying Handbook ch. 10 (holding, wind correction), ICAO Doc 8168
// PANS-OPS Vol I (5° entry tolerance; holding speeds 230 kt up to 14,000 ft, 240 kt to FL200, 265 kt to FL340),
// FAA-S-ACS-8 Instrument Rating ACS area III task B.
// The Fly it is the hold-wind lesson: its surface wind (360/25) veers and strengthens with height in the sim
// (sim/wind.ts defaultAloft: about 025/39 at 3,000 ft), so the briefing's headings and outbound time come from a
// point-mass lap flown in that wind (holdLap / firstLap below), not from the surface wind.
import type {
  Course,
  GoalCheck,
  InstrumentView,
  L10n,
  PaneView,
  SimScene,
  SlideBlock,
  Step,
} from "../types";
import { holdEntry, type HoldEntry, type Turn } from "../../nav/holding";
import { defaultAloft } from "../../sim/wind";
import {
  DIAGRAM,
  G,
  INST,
  L,
  QUIZ,
  T,
  course,
  scene,
  slideStep,
  step,
} from "./kit";
import { mistakesStep, whyStep } from "./briefings/kit";
import {
  G as GR,
  coverBlocks,
  foot,
  head,
  pointRows,
  recapBlocks,
  slide,
  stepRows,
} from "./navSlides";
export const HOLDING_ID = "sample-holding";

const HSI: InstrumentView = { kind: "gauge", gauge: "hsi" };
const HSI_PANE: PaneView = { kind: "six", crop: { region: "STEAM_LEFT:4" } };
/** Half-scale deflection: 5° on a VOR, one dot of the HSI. */
const HALF_SCALE: GoalCheck = { id: "acsScale", p: { axis: "lat", frac: 0.5 } };

/** The ARD hold every step of the course uses (the hold-teardrop / hold-wind lessons fly the same one). */
const HOLD = { fix: "ARD", inbound: 270, turn: "R" as Turn };

const ENTRY_NAME: Record<HoldEntry, L10n> = {
  DIRECT: L("Direct", "Directe"),
  TEARDROP: L("Teardrop", "Décalée (goutte d’eau)"),
  PARALLEL: L("Parallel", "Parallèle"),
};
const ENTRIES: HoldEntry[] = ["DIRECT", "TEARDROP", "PARALLEL"];
const ENTRY_HOW: Record<HoldEntry, L10n> = {
  DIRECT: L(
    "Cross the fix and turn in the direction of the hold, outbound.",
    "Passez le repère et virez dans le sens de l’attente, en éloignement.",
  ),
  TEARDROP: L(
    "Cross the fix, fly 30° off the outbound course on the holding side for 1 min, then turn inbound.",
    "Passez le repère, éloignez-vous à 30° de l’axe côté attente pendant 1 min, puis virez en rapprochement.",
  ),
  PARALLEL: L(
    "Cross the fix, fly parallel to the inbound course outbound on the non-holding side for 1 min, then turn back through more than 180° to the fix or the inbound course.",
    "Passez le repère, éloignez-vous parallèlement à l’axe côté non-attente pendant 1 min, puis revenez par un virage de plus de 180° vers le repère ou l’axe de rapprochement.",
  ),
};
const F = (t: L10n): string => t.fr ?? t.en;
const pad3 = (n: number) =>
  String(((Math.round(n) % 360) + 360) % 360 || 360).padStart(3, "0");
const wrap360 = (d: number) => ((d % 360) + 360) % 360;

/** Wind correction angle (° right positive) to hold `course` at `tas` with the wind from `dir` at `kt`. */
export function wca(
  course: number,
  tas: number,
  dir: number,
  kt: number,
): number {
  const x = (kt * Math.sin(((dir - course) * Math.PI) / 180)) / tas;
  return (Math.asin(Math.max(-1, Math.min(1, x))) * 180) / Math.PI;
}
/** Outbound heading in a hold: the outbound course corrected by three times the drift (FAA IFH ch. 10). */
export function outboundHeading(
  inbound: number,
  tas: number,
  dir: number,
  kt: number,
): number {
  const out = wrap360(inbound + 180);
  return Math.round(wrap360(out + 3 * wca(out, tas, dir, kt)));
}

/**
 * One lap of a right-turn hold flown by a point mass: over the fix on the inbound heading, a standard-rate turn to
 * `outHdg`, `outS` seconds from abeam the fix (or from wings level if later), a standard-rate turn back to the
 * inbound heading. Returns where it rolls out (NM from the inbound course, + on the holding side) and how long the
 * inbound leg then lasts.
 */
export function holdLap(
  inbound: number,
  tas: number,
  dir: number,
  kt: number,
  outHdg: number,
  outS: number,
): { inHdg: number; crossNm: number; inboundS: number } {
  const D = Math.PI / 180;
  const we = Math.sin((dir + 180) * D) * kt;
  const wn = Math.cos((dir + 180) * D) * kt;
  const inHdg = wrap360(inbound + wca(inbound, tas, dir, kt));
  // along: NM flown past the fix on the inbound course; cross: NM to its right (the holding side of a right hold)
  const [ue, un] = [Math.sin(inbound * D), Math.cos(inbound * D)];
  let e = 0;
  let n = 0;
  let h = inHdg;
  const dt = 0.1;
  const fly = () => {
    e += ((tas * Math.sin(h * D) + we) * dt) / 3600;
    n += ((tas * Math.cos(h * D) + wn) * dt) / 3600;
  };
  const along = () => e * ue + n * un;
  const turnRight = (to: number) => {
    while (wrap360(to - h) > 0.3) {
      h = wrap360(h + Math.min(3 * dt, wrap360(to - h)));
      fly();
    }
  };
  turnRight(outHdg);
  for (let t = 0; along() > 0 && t < 600; t += dt) fly();
  for (let t = 0; t < outS; t += dt) fly();
  turnRight(inHdg);
  const crossNm = e * un - n * ue;
  let inboundS = 0;
  while (along() < 0 && inboundS < 900) {
    fly();
    inboundS += dt;
  }
  return { inHdg: Math.round(inHdg), crossNm, inboundS };
}
/**
 * The first lap to brief in a wind: the outbound heading (to 5°) and time (to 15 s) from which the turn inbound
 * rolls out on the course with an inbound leg of about one minute.
 */
export function firstLap(
  inbound: number,
  tas: number,
  dir: number,
  kt: number,
): { inHdg: number; outHdg: number; outS: number; inboundS: number } {
  const out = wrap360(inbound + 180);
  let best = { err: Infinity, outHdg: out, outS: 60, inboundS: 60, inHdg: 0 };
  for (let outS = 15; outS <= 240; outS += 15)
    for (let off = -60; off <= 60; off += 5) {
      const outHdg = wrap360(out + off);
      const r = holdLap(inbound, tas, dir, kt, outHdg, outS);
      // 0.1 NM off the course counts like 6 s on the clock
      const err = Math.abs(r.crossNm) * 60 + Math.abs(r.inboundS - 60);
      if (err < best.err)
        best = { err, outHdg, outS, inboundS: r.inboundS, inHdg: r.inHdg };
    }
  return best;
}
/** The hold-wind lesson's wind (train/curriculum.ts): 360/25 at the surface, and what the sim makes of it at 3,000 ft. */
const FLY_SURFACE: [number, number] = [360, 25];
export const FLY_WIND = defaultAloft({
  windDir: FLY_SURFACE[0],
  windKt: FLY_SURFACE[1],
  gustKt: 0,
  turbulence: 0,
})[0];
/** 90 KIAS at 3,000 ft: about 94 KTAS */
const FLY_TAS = 94;
let flyLap: ReturnType<typeof firstLap> | null = null;
/** The first lap of the Fly it, in the wind the lesson really flies (computed once). */
export const flyNumbers = (): ReturnType<typeof firstLap> =>
  (flyLap ??= firstLap(HOLD.inbound, FLY_TAS, FLY_WIND.dir, FLY_WIND.kt));

// ------------------------------------------------------------------ scenes
/** The aircraft 8 NM out, heading `crs` to the fix (it is on radial crs + 180). */
function arriving(
  id: string,
  fix: string,
  crs: number,
  label: string,
  nav: "vor" | "adf" = "vor",
): SimScene {
  return scene(
    id,
    {
      pos: { fix, radial: wrap360(crs + 180), distNm: 8 },
      altFt: 3000,
      hdg: crs,
      iasKt: 90,
      radios:
        nav === "vor"
          ? { nav1: fix, obs1: HOLD.inbound, cdi: "NAV1", brg1: "NAV1" }
          : { adf: 344, brg1: "ADF", nav1: "ARD", obs1: 270, cdi: "NAV1", nav2: 108 },
    },
    { label },
  );
}
export function holdingScenes(): Record<string, SimScene> {
  return {
    "hold.cover": arriving(
      "hold.cover",
      "ARD",
      270,
      "ARD R-090 · 8 NM · 3,000 ft",
    ),
    "hold.b": arriving("hold.b", "ARD", 180, "Course 180 to ARD · 8 NM"),
    "hold.c": arriving("hold.c", "ARD", 300, "Course 300 to ARD · 8 NM"),
    "hold.drag": arriving(
      "hold.drag",
      "ARD",
      270,
      "Drag the aircraft round ARD",
    ),
    // 8 NM east on the 090 radial with the OBS left on north: the student sets the inbound course
    "hold.twist": scene(
      "hold.twist",
      {
        pos: { fix: "ARD", radial: 90, distNm: 8 },
        altFt: 3000,
        hdg: 270,
        iasKt: 90,
        radios: { nav1: "ARD", obs1: 360, cdi: "NAV1", brg1: "NAV1" },
      },
      { label: "ARD R-090 · 8 NM · heading 270 · OBS not set yet" },
    ),
    // outbound on the holding side, half a mile before abeam the fix: flown live, the flag flips from FROM to TO
    "hold.abeam": scene(
      "hold.abeam",
      {
        pos: { fix: "ARD", radial: 332, distNm: 1.1 },
        altFt: 3000,
        hdg: 90,
        iasKt: 90,
        radios: { nav1: "ARD", obs1: 270, cdi: "NAV1", brg1: "NAV1" },
      },
      { label: "Outbound · heading 090 · ARD coming abeam" },
    ),
    // inbound on the course with no correction, in the wind of the wind slide (the same at every level)
    "hold.wind": scene(
      "hold.wind",
      {
        pos: { fix: "ARD", radial: 90, distNm: 4 },
        altFt: 3000,
        hdg: 270,
        iasKt: 90,
        radios: { nav1: "ARD", obs1: 270, cdi: "NAV1", brg1: "NAV1" },
      },
      {
        label: "ARD R-090 · 4 NM inbound · heading 270 · wind 360/25",
        wind: [360, 25],
        weather: {
          aloft: [3000, 6000, 9000].map((altFt) => ({ altFt, dir: 360, kt: 25 })),
        },
      },
    ),
    // 0.9 NM before the fix on the inbound course: the student sees the flag flip, then turns
    "hold.fix": scene(
      "hold.fix",
      {
        pos: { fix: "ARD", radial: 90, distNm: 0.9 },
        altFt: 3000,
        hdg: 270,
        iasKt: 90,
        radios: { nav1: "ARD", obs1: 270, cdi: "NAV1", brg1: "NAV1" },
      },
      { label: "0.9 NM before ARD · heading 270 · direct entry" },
    ),
    // 0.9 NM before the fix on course 050, the teardrop sector: the student crosses ARD and takes 060
    "hold.teardrop": scene(
      "hold.teardrop",
      {
        pos: { fix: "ARD", radial: 230, distNm: 0.9 },
        altFt: 3000,
        hdg: 50,
        iasKt: 90,
        radios: { nav1: "ARD", obs1: 270, cdi: "NAV1", brg1: "NAV1" },
      },
      { label: "0.9 NM before ARD · course 050 · teardrop entry" },
    ),
  };
}
// ------------------------------------------------------------------ shared step builders
/** Entry names with their sector, for the slide quizzes (rows, never tiles: the names are long). */
const ENTRY_ROW: Record<HoldEntry, L10n> = {
  DIRECT: L("Direct · 180°", "Directe · 180°"),
  TEARDROP: L("Teardrop · 70°", "Décalée · 70°"),
  PARALLEL: L("Parallel · 110°", "Parallèle · 110°"),
};
/** One line per entry, for the slide quizzes' feedback. */
const ENTRY_SHORT: Record<HoldEntry, L10n> = {
  DIRECT: L(
    "cross the fix and turn in the direction of the hold.",
    "passez le repère et virez dans le sens de l’attente.",
  ),
  TEARDROP: L(
    "at the fix, 30° off on the holding side for 1 min, then turn inbound.",
    "au repère, 30° côté attente pendant 1 min, puis virez en rapprochement.",
  ),
  PARALLEL: L(
    "at the fix, parallel on the non-holding side for 1 min, then turn back.",
    "au repère, parallèle côté non-attente pendant 1 min, puis revenez.",
  ),
};
/** The courses to the fix of each sector of the ARD hold (inbound 270, right turns), for the quiz feedback. */
const SECTOR: Record<HoldEntry, L10n> = {
  DIRECT: L("courses 200 to 020", "routes 200 à 020"),
  TEARDROP: L("courses 020 to 090", "routes 020 à 090"),
  PARALLEL: L("courses 090 to 200", "routes 090 à 200"),
};
const holdD = (fix: string, crs?: number, quiet?: boolean) => ({
  kind: "hold" as const,
  inbound: 270,
  turn: "R" as Turn,
  fix,
  ...(crs !== undefined ? { crs } : {}),
  ...(quiet ? { quiet: true } : {}),
});
/** mm:ss */
const mmss = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** A predict-the-entry slide: the sector map with the question beside it; the answer lights up the sector. */
function entryPredict(o: {
  id: string;
  fix: string;
  crs: number;
  eyebrow: L10n;
  title: L10n;
  prompt: L10n;
  /** the diagram on the left (wide) or on the right */
  diagramLeft: boolean;
}): SlideBlock[] {
  const e = holdEntry(270, "R", o.crs);
  const mapHint = L(
    `Inbound 270 · right turns · north up`,
    `Rapprochement 270 · virages à droite · nord en haut`,
  );
  const d = o.diagramLeft
    ? { x: GR.left, y: 288, w: 960, h: 696 }
    : { x: 984, y: 288, w: 816, h: 696 };
  const q = o.diagramLeft
    ? { x: 1128, y: 312, w: 672, h: 672 }
    : { x: GR.left, y: 312, w: 816, h: 672 };
  return [
    ...head(o.eyebrow, o.title),
    // the answer: the same map with the aircraft and its sector, over the plain one once answered
    DIAGRAM(
      `${o.id}.hold`,
      holdD(o.fix, o.crs),
      L(
        `Hold at ${o.fix} with the arrival on course ${pad3(o.crs)}: ${ENTRY_NAME[e].en.toLowerCase()} entry`,
        `Attente à ${o.fix} avec l’arrivée au ${pad3(o.crs)} : entrée ${F(ENTRY_NAME[e]).toLowerCase()}`,
      ),
      d.x,
      d.y,
      d.w,
      d.h,
      { reveal: { order: 1, when: "answered" }, caption: mapHint },
    ),
    {
      ...DIAGRAM(
        `${o.id}.sectors`,
        holdD(o.fix),
        L(
          `The three entry sectors of the hold at ${o.fix}, inbound 270, right turns`,
          `Les trois secteurs d’entrée de l’attente à ${o.fix}, rapprochement 270, virages à droite`,
        ),
        d.x,
        d.y,
        d.w,
        d.h,
        { caption: mapHint },
      ),
    },
    QUIZ(
      `${o.id}.q`,
      {
        kind: "mcq",
        prompt: o.prompt,
        options: ENTRIES.map((x) => ({
          text: ENTRY_ROW[x],
          why:
            x === e
              ? L(
                  `Right: ${ENTRY_SHORT[x].en}`,
                  `Juste : ${F(ENTRY_SHORT[x])}`,
                )
              : L(
                  `No: that sector takes ${SECTOR[x].en}. ${pad3(o.crs)} is in ${SECTOR[e].en}.`,
                  `Non : ce secteur reçoit les ${F(SECTOR[x])}. Le ${pad3(o.crs)} est dans les ${F(SECTOR[e])}.`,
                ),
        })),
        answer: ENTRIES.indexOf(e),
        explain: L(
          `${ENTRY_NAME[e].en}: ${ENTRY_SHORT[e].en}`,
          `${F(ENTRY_NAME[e])} : ${F(ENTRY_SHORT[e])}`,
        ),
      },
      q.x,
      q.y,
      q.w,
      q.h,
    ),
    foot(
      L("FAA AIM 5-3-8 · FIG 5-3-8", "FAA AIM 5-3-8 · FIG 5-3-8"),
      816,
      o.diagramLeft ? GR.left : GR.left,
    ),
  ];
}

/** The five Ts at the fix, with a Your turn on the HSI (turn outbound with the bank pad). */
function fiveTs(
  id: string,
  sceneId: string,
  outbound: number,
  inst: InstrumentView,
  fromHdg: number,
  twist: L10n = L(
    "set the inbound course on the OBS",
    "affichez la route de rapprochement à l’OBS",
  ),
): Step {
  const rows: { heading: L10n; small: L10n }[] = [
    {
      heading: L("Turn", "Virer"),
      small: L(
        "to the outbound or entry heading",
        "vers le cap d’éloignement ou d’entrée",
      ),
    },
    {
      heading: L("Time", "Chrono"),
      small: L(
        "abeam the fix (teardrop, parallel entry: at the fix)",
        "au travers du repère (entrée décalée, parallèle : au repère)",
      ),
    },
    { heading: L("Twist", "Tourner"), small: twist },
    {
      heading: L("Throttle", "Puissance"),
      small: L("holding speed, 90 KIAS here", "vitesse d’attente, 90 KIAS ici"),
    },
    {
      heading: L("Talk", "Parler"),
      small: L(
        "report entering the hold if asked",
        "annoncez l’entrée en attente si demandé",
      ),
    },
  ];
  return slideStep(
    id,
    L("At the fix: the five Ts", "Au repère : les cinq T"),
    slide(
      "stepByStep",
      [
        ...head(
          L("At the holding fix", "Au repère d’attente"),
          L("The five Ts", "Les cinq T"),
          960,
        ),
        ...stepRows(rows, { y: 312, pitch: 132, w: 816 }),
        INST(
          inst,
          L(
            `HSI just before the fix, heading ${pad3(fromHdg)}: after the fix, turn to ${pad3(outbound)}`,
            `HSI juste avant le repère, cap ${pad3(fromHdg)} : après le repère, virez au ${pad3(outbound)}`,
          ),
          1080,
          264,
          720,
          720,
          {
            id: `${id}.hsi`,
            scene: sceneId,
            mode: "live",
            controls: ["bank"],
            yourTurn: {
              where: "slide",
              prompt: L(
                `Your turn: wait for the flag to flip to FROM over ARD, then turn right to heading ${pad3(outbound)}`,
                `À vous : attendez que le drapeau passe à FROM à la verticale d’ARD, puis virez à droite au cap ${pad3(outbound)}`,
              ),
              controls: ["bank"],
              assist: { holdAlt: true, holdIas: true },
              goal: {
                // the fix first, then the turn: the heading alone could be met without ever crossing the fix
                all: [G.passed(HOLD.fix), G.heading(outbound, 5)],
                holdS: 3,
                graded: false,
                success: L(
                  "Outbound: now start the time abeam the fix.",
                  "En éloignement : déclenchez le chrono au travers du repère.",
                ),
              },
              hint: L(
                "Keep the wings level until the flag flips (about 35 s), then hold the R side of the bank pad: 180° takes a little over a minute.",
                "Gardez les ailes à plat jusqu’à la bascule du drapeau (environ 35 s), puis maintenez le côté R des boutons d’inclinaison : 180° prennent un peu plus d’une minute.",
              ),
            },
          },
        ),
        foot(
          L(
            "An instructors’ memory aid; some add a sixth T: Track",
            "Un aide-mémoire d’instructeur ; certains ajoutent un sixième T : la route",
          ),
          960,
        ),
      ],
      { scene: sceneId },
    ),
    [
      {
        t: "text",
        text: L(
          "At the fix: Turn, Time, Twist, Throttle, Talk (some instructors add a sixth, Track). The time starts abeam the fix in the hold and on a direct entry; on a teardrop or a parallel entry it starts at the fix. On the slide: wait for the flag to flip over ARD, then turn outbound with the bank pad.",
          "Au repère : Virer, Chrono, Tourner (l’OBS), Puissance, Parler (certains ajoutent un sixième T, la route). Le chrono part au travers du repère en attente et en entrée directe ; en entrée décalée ou parallèle, il part au repère. Sur la diapo : attendez la bascule du drapeau à la verticale d’ARD, puis virez en éloignement avec les boutons d’inclinaison L / R.",
        ),
      },
    ],
    { kind: "try", minutes: 2 },
  );
}

// ------------------------------------------------------------------ the course slides
function cover(): Step {
  return slideStep(
    "h-cover",
    L(
      "Holding: entries, timing and wind",
      "L’attente : entrées, chronométrage et vent",
    ),
    slide(
      "cover",
      coverBlocks({
        eyebrow: L("Ground school · Holding", "Théorie · Attentes"),
        main: L("Holding", "L’attente"),
        sub: L("Entries, timing and wind", "Entrées, chronométrage et vent"),
        lead: L(
          "“Hold east of ARD on the 090 radial.” Three minutes to pick the entry, plan the timing and correct for the wind.",
          "« Attendez à l’est d’ARD sur le radial 090. » Trois minutes pour choisir l’entrée, prévoir le chrono et corriger le vent.",
        ),
        meta: L(
          "20 steps · about 45 min · you act in 13 of them",
          "20 étapes · environ 45 min · vous agissez dans 13 d’entre elles",
        ),
        hero: [
          DIAGRAM(
            "h-cover.hold",
            holdD(HOLD.fix, undefined, true),
            L(
              "Hold at ARD, inbound 270, right turns",
              "Attente à ARD, rapprochement 270, virages à droite",
            ),
            984,
            96,
            816,
            888,
          ),
        ],
      }),
    ),
    [
      {
        t: "text",
        text: L(
          "The clearance, the three entries on the diagram, outbound timing and the triple-drift rule — then three laps at ARD.",
          "La clairance, les trois entrées sur le schéma, le chronométrage et la règle de la dérive triplée — puis trois tours à ARD.",
        ),
      },
    ],
    { minutes: 1 },
  );
}

function why(): Step {
  return whyStep("h-why", {
    eyebrow: L("Why it matters", "Pourquoi c’est important"),
    title: L(
      "A hold comes with little warning",
      "L’attente arrive sans prévenir",
    ),
    n: L("3", "3"),
    nW: 152,
    unit: L("min", "min"),
    statement: L(
      "from the clearance limit: slow down",
      "avant la limite d’autorisation : ralentissez",
    ),
    body: L(
      "With no clearance beyond the fix, you hold as charted. Three minutes to pick the entry and plan the timing and the wind.",
      "Sans clairance au-delà du repère, vous attendez comme publié. Trois minutes pour choisir l’entrée et prévoir le chrono et le vent.",
    ),
    sideTitle: L("After this course you can", "À la fin du cours, vous savez"),
    side: [
      {
        n: L("3", "3"),
        text: L(
          "entries: pick the right one at a glance",
          "entrées : choisir la bonne d’un coup d’œil",
        ),
      },
      {
        n: L("1:00", "1:00"),
        text: L(
          "inbound, within 15 s, wind included",
          "en rapprochement, à 15 s près, vent compris",
        ),
        color: "sel",
      },
      {
        n: L("±100 ft", "±100 ft"),
        text: L(
          "of altitude, for three laps",
          "d’altitude, pendant trois tours",
        ),
        color: "key",
      },
    ],
    foot: L(
      "FAA AIM 5-3-8 · maximum holding speed (ICAO): 230 kt up to 14,000 ft",
      "FAA AIM 5-3-8 · vitesse d’attente maximale (OACI) : 230 kt jusqu’à 14 000 ft",
    ),
    reader: L(
      "When you are 3 minutes or less from a clearance limit and have no clearance beyond it, start slowing so that you cross the fix at or below the maximum holding speed; if the hold is charted and the controller gives no other instructions, hold as charted (FAA AIM 5-3-8). After this course you can pick the right entry at a glance, fly inbound legs of one minute within 15 seconds, wind included, and hold your altitude within 100 ft for three laps. Maximum holding speeds, ICAO (Doc 8168, used in Europe): 230 kt up to 14,000 ft, 240 kt from 14,000 ft to FL200, 265 kt from FL200 to FL340. FAA: 200 KIAS up to 6,000 ft MSL, 230 KIAS from 6,001 to 14,000 ft, 265 KIAS above 14,000 ft. A light single holds far below any of them.",
      "À 3 minutes ou moins d’une limite d’autorisation, sans clairance au-delà, commencez à ralentir pour croiser le repère à la vitesse d’attente maximale ou en dessous ; si l’attente est publiée et que le contrôleur ne donne pas d’autre instruction, attendez comme publié (FAA AIM 5-3-8). À la fin du cours, vous savez choisir la bonne entrée d’un coup d’œil, voler des rapprochements d’une minute à 15 secondes près, vent compris, et tenir votre altitude à 100 ft près pendant trois tours. Vitesses d’attente maximales, OACI (Doc 8168, appliqué en Europe) : 230 kt jusqu’à 14 000 ft, 240 kt de 14 000 ft au FL200, 265 kt du FL200 au FL340. FAA : 200 KIAS jusqu’à 6 000 ft MSL, 230 KIAS de 6 001 à 14 000 ft, 265 KIAS au-dessus de 14 000 ft. Un monomoteur léger attend bien en dessous.",
    ),
  });
}

function clearance(): Step {
  return slideStep(
    "h-clearance",
    L("Read the clearance", "Lire la clairance"),
    slide("quiz", [
      ...head(
        L("Elements of the clearance", "Éléments de la clairance"),
        L("Read the clearance", "Lire la clairance"),
      ),
      T(
        "quote",
        L(
          "“Hold east of ARD on the 090 radial, maintain 3,000, expect further clearance 1430.”",
          "« Attendez à l’est d’ARD sur le radial 090, maintenez 3000 pieds, autorisation ultérieure prévue à 1430. »",
        ),
        GR.left,
        312,
        1560,
        144,
      ),
      QUIZ(
        "h-clearance.q",
        {
          kind: "mcq",
          prompt: L(
            "So the inbound course is…",
            "La route de rapprochement est donc…",
          ),
          options: [
            {
              text: L("270", "270"),
              why: L(
                "Right: on the 090 radial, east of ARD, you fly back to the fix on 270.",
                "Juste : sur le radial 090, à l’est d’ARD, vous revenez vers le repère au 270.",
              ),
            },
            {
              text: L("090", "090"),
              why: L(
                "090 is the radial, flown outbound. Inbound you fly its reciprocal.",
                "090 est le radial, en éloignement. En rapprochement on vole son inverse.",
              ),
            },
            {
              text: L("360", "360"),
              why: L(
                "360 would be a hold on the 180 radial, south of ARD.",
                "360 serait une attente sur le radial 180, au sud d’ARD.",
              ),
            },
          ],
          answer: 0,
          explain: L(
            "Inbound 270. No turns stated: right turns. EFC 1430.",
            "Rapprochement 270. Aucun sens donné : virages à droite. EFC 1430.",
          ),
        },
        GR.left,
        504,
        1680,
        480,
      ),
      foot(L("FAA AIM 5-3-8", "FAA AIM 5-3-8")),
    ]),
    [
      {
        t: "text",
        text: L(
          "A holding clearance gives the direction of the hold from the fix (east), the fix (ARD), the radial or course to hold on (090), the turns if left (none said: right turns), and an expect-further-clearance time (1430) (FAA AIM 5-3-8).",
          "Une clairance d’attente donne la direction de l’attente par rapport au repère (est), le repère (ARD), le radial ou la route (090), le sens des virages s’ils sont à gauche (rien de dit : à droite), et une heure d’autorisation ultérieure prévue (1430) (FAA AIM 5-3-8).",
        ),
      },
    ],
    { kind: "quiz", minutes: 2 },
  );
}

function anatomy(): Step {
  return slideStep(
    "h-anatomy",
    L("Anatomy of a hold", "Anatomie d’une attente"),
    slide("heroDiagram", [
      ...head(
        L("The holding pattern", "Le circuit d’attente"),
        L("Anatomy of a hold", "Anatomie d’une attente"),
      ),
      DIAGRAM(
        "h-anatomy.hold",
        {
          kind: "calc",
          calc: {
            kind: "holdWind",
            inbound: HOLD.inbound,
            turn: HOLD.turn,
            windDir: 270,
            windKt: 0,
            tasKt: 90,
          },
        },
        L(
          "Hold at ARD, inbound 270, right turns, no wind",
          "Attente à ARD, rapprochement 270, virages à droite, sans vent",
        ),
        GR.left,
        288,
        960,
        696,
        {
          caption: L(
            "Drawn inbound-up: the inbound leg points up the page.",
            "Dessinée rapprochement vers le haut : la branche de rapprochement monte.",
          ),
        },
      ),
      ...pointRows([
        {
          heading: L("Inbound leg · 1:00", "Rapprochement · 1:00"),
          body: L(
            "to the fix, at or below 14,000 ft MSL; 1:30 above.",
            "vers le repère, jusqu’à 14 000 ft MSL ; 1:30 au-dessus.",
          ),
          color: "sel",
        },
        {
          heading: L("Outbound leg", "Éloignement"),
          body: L(
            "timed from **abeam the fix**, so that the inbound leg lasts 1:00.",
            "chronométré depuis le **travers du repère**, pour 1:00 en rapprochement.",
          ),
          color: "key",
        },
        {
          heading: L("Holding side · right", "Côté attente · à droite"),
          body: L(
            "where the turns are, unless the clearance says “left turns”.",
            "là où sont les virages, sauf « virages à gauche » dans la clairance.",
          ),
          color: "nav",
        },
      ]),
      foot(L("FAA AIM 5-3-8", "FAA AIM 5-3-8")),
    ]),
    [
      {
        t: "text",
        text: L(
          "A hold has a fix, an inbound leg of 1 minute at or below 14,000 ft MSL (1½ min above), an outbound leg timed from abeam the fix (the point where the fix is at 90° to your track) to make the inbound leg right, and a holding side. Standard holds turn right; left turns are always stated (FAA AIM 5-3-8).",
          "Une attente comprend un repère, une branche de rapprochement de 1 minute jusqu’à 14 000 ft MSL (1 min 30 au-dessus), une branche d’éloignement chronométrée depuis le travers du repère (le point où le repère est à 90° de votre route) pour obtenir le bon rapprochement, et un côté attente. Une attente standard se fait par la droite ; les virages à gauche sont toujours précisés (FAA AIM 5-3-8).",
        ),
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

function threeEntries(): Step {
  return slideStep(
    "h-entries",
    L("Three ways into a hold", "Trois façons d’entrer en attente"),
    slide("heroDiagram", [
      ...head(
        L("Hold entries", "Entrées en attente"),
        L("Three sectors, three entries", "Trois secteurs, trois entrées"),
      ),
      DIAGRAM(
        "h-entries.hold",
        holdD(HOLD.fix),
        L(
          "Hold at ARD, inbound 270, right turns, with the three entry sectors",
          "Attente à ARD, rapprochement 270, virages à droite, avec les trois secteurs d’entrée",
        ),
        GR.left,
        288,
        960,
        696,
      ),
      ...pointRows([
        {
          heading: L("1 · Parallel · 110°", "1 · Parallèle · 110°"),
          body: L(
            "At the fix, outbound on the non-holding side, 1 min, then back to the fix.",
            "Au repère, éloignement côté non-attente, 1 min, puis retour au repère.",
          ),
          color: "sel",
        },
        {
          heading: L("2 · Teardrop · 70°", "2 · Décalée · 70°"),
          body: L(
            "At the fix, 30° off the outbound course on the holding side, 1 min, then turn.",
            "Au repère, éloignement décalé de 30° côté attente, 1 min, puis virez.",
          ),
          color: "key",
        },
        {
          heading: L("3 · Direct · 180°", "3 · Directe · 180°"),
          body: L(
            "At the fix, turn in the direction of the hold: you are in it.",
            "Au repère, virez dans le sens de l’attente : vous y êtes.",
          ),
          color: "nav",
        },
      ]),
      foot(
        L(
          "FAA AIM 5-3-8 · within 5° of a boundary, either entry (ICAO Doc 8168)",
          "FAA AIM 5-3-8 · à 5° d’une limite, l’une ou l’autre entrée (OACI Doc 8168)",
        ),
      ),
    ]),
    [
      {
        t: "text",
        text: L(
          "Parallel (110° sector), teardrop (70°; ICAO calls it the offset entry) and direct (180°), measured from the inbound course (FAA AIM 5-3-8). Within 5° of a boundary, either entry is acceptable (ICAO PANS-OPS, Doc 8168).",
          "Parallèle (secteur de 110°), décalée (70° ; la FAA dit « teardrop », la goutte d’eau) et directe (180°), mesurés depuis la route de rapprochement (FAA AIM 5-3-8). À 5° près d’une limite, les deux entrées sont acceptables (OACI PANS-OPS, Doc 8168).",
        ),
      },
    ],
    { kind: "explain", minutes: 3 },
  );
}

/** A predict-the-entry slide for an arrival course: the plain sector map first, the answer drawn once answered. */
function caseSlide(id: string, crs: number, diagramLeft: boolean): Step {
  const e = holdEntry(HOLD.inbound, HOLD.turn, crs);
  return slideStep(
    id,
    L(`Arriving on course ${pad3(crs)}`, `Arrivée au ${pad3(crs)}`),
    slide(
      "quiz",
      entryPredict({
        id,
        fix: HOLD.fix,
        crs,
        eyebrow: L("Predict", "Prédire"),
        title: L(
          `You arrive on course ${pad3(crs)}`,
          `Vous arrivez sur la route ${pad3(crs)}`,
        ),
        prompt: L(
          "Hold at ARD, inbound 270, right turns. Which entry?",
          "Attente à ARD, rapprochement 270, virages à droite. Quelle entrée ?",
        ),
        diagramLeft,
      }),
    ),
    [
      {
        t: "text",
        text: L(
          `Arriving on course ${pad3(crs)} to a hold inbound 270 with right turns: ${ENTRY_NAME[e].en.toLowerCase()} entry (FAA AIM 5-3-8). ${ENTRY_HOW[e].en}`,
          `Arrivée au ${pad3(crs)} sur une attente au 270 par la droite : entrée ${F(ENTRY_NAME[e]).toLowerCase()} (FAA AIM 5-3-8). ${F(ENTRY_HOW[e])}`,
        ),
      },
    ],
    { kind: "quiz", minutes: 1 },
  );
}

function timing(): Step {
  // a 10 kt headwind inbound at 94 KTAS, flown by the point-mass lap: 1:00 outbound gives about 1:30 inbound
  const first = holdLap(HOLD.inbound, FLY_TAS, 270, 10, 90, 60).inboundS;
  const in1 = Math.round(first / 5) * 5;
  const out2 = Math.max(15, 120 - in1);
  return slideStep(
    "h-timing",
    L(
      "Timing: aim for 1:00 inbound",
      "Chronométrage : viser 1:00 en rapprochement",
    ),
    slide("heroDiagram", [
      ...head(
        L("Timing", "Chronométrage"),
        L("One minute inbound", "Une minute en rapprochement"),
      ),
      DIAGRAM(
        "h-timing.wind",
        {
          kind: "calc",
          calc: {
            kind: "holdWind",
            inbound: HOLD.inbound,
            turn: HOLD.turn,
            windDir: 270,
            windKt: 10,
            tasKt: FLY_TAS,
            // the second lap's outbound time, by the rule on the right
            outboundS: out2,
          },
        },
        L(
          "Hold at ARD with a 10 kt headwind on the inbound leg",
          "Attente à ARD avec 10 kt de vent de face en rapprochement",
        ),
        GR.left,
        288,
        960,
        696,
        {
          caption: L(
            "Wind 270/10 · 94 KTAS · drawn inbound-up",
            "Vent 270/10 · 94 kt Vp · rapprochement vers le haut",
          ),
        },
      ),
      ...pointRows([
        {
          heading: L("Start abeam the fix", "Top au travers du repère"),
          body: L(
            "or wings level outbound, if that comes later. First lap: **1:00**.",
            "ou ailes à plat en éloignement, si c’est plus tard. Premier tour : **1:00**.",
          ),
          color: "nav",
        },
        {
          heading: L("Time the inbound leg", "Mesurez le rapprochement"),
          body: L(
            `from wings level to the fix. Here, 10 kt on the nose: **${mmss(in1)}**.`,
            `des ailes à plat au repère. Ici, 10 kt de face : **${mmss(in1)}**.`,
          ),
          color: "sel",
        },
        {
          heading: L(
            "Correct by the error",
            "Corrigez de l’écart",
          ),
          body: L(
            `${in1 - 60} s too long: fly ${in1 - 60} s less outbound, **${mmss(out2)}**. Then refine.`,
            `${in1 - 60} s de trop : ${in1 - 60} s de moins en éloignement, **${mmss(out2)}**. Puis affinez.`,
          ),
          color: "key",
        },
      ]),
      foot(
        L(
          "FAA AIM 5-3-8 · FAA IFH ch. 10 · 1:30 inbound above 14,000 ft MSL",
          "FAA AIM 5-3-8 · FAA IFH ch. 10 · 1:30 en rapprochement au-dessus de 14 000 ft MSL",
        ),
      ),
    ]),
    [
      {
        t: "text",
        text: L(
          `Outbound timing starts over or abeam the fix, whichever is later; if abeam cannot be determined, when the turn outbound is complete. Adjust the outbound leg so the inbound leg takes 1 minute (1½ above 14,000 ft MSL) (FAA AIM 5-3-8). Fly 1:00 outbound on the first lap and time the inbound leg, then change the outbound time by the inbound error, the other way (FAA IFH ch. 10). With 10 kt on the nose inbound at 94 KTAS, 1:00 outbound gives about ${mmss(in1)} inbound: fly ${mmss(out2)} outbound next, then refine. The wind also carries you during the two turns, which is why the correction is larger than the ground speeds alone suggest.`,
          `Le chrono d’éloignement part à la verticale ou au travers du repère, le plus tardif des deux ; si le travers n’est pas identifiable, en fin de virage. Ajustez l’éloignement pour que le rapprochement dure 1 minute (1 min 30 au-dessus de 14 000 ft MSL) (FAA AIM 5-3-8). Volez 1:00 en éloignement au premier tour et mesurez le rapprochement, puis corrigez l’éloignement de l’écart, en sens inverse (FAA IFH ch. 10). Avec 10 kt de face en rapprochement à 94 kt de Vp, 1:00 d’éloignement donne environ ${mmss(in1)} de rapprochement : volez ${mmss(out2)} au tour suivant, puis affinez. Le vent vous déplace aussi pendant les deux virages : la correction est donc plus forte que ne le laissent croire les seules vitesses sol.`,
        ),
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

function windSlide(): Step {
  const w: [number, number] = [360, 25];
  // worked at 90 kt, as the diagram and the Try it that follows: 16°, so 3 × 16° = 48°
  const outHdg = outboundHeading(HOLD.inbound, 90, w[0], w[1]);
  const drift = wca(HOLD.inbound, 90, w[0], w[1]);
  const inHdg = Math.round(wrap360(HOLD.inbound + drift));
  const d = Math.round(Math.abs(drift));
  return slideStep(
    "h-wind",
    L(
      "Wind: triple the drift outbound",
      "Vent : triplez la dérive en éloignement",
    ),
    slide("heroDiagram", [
      ...head(
        L("Wind correction", "Correction de vent"),
        L("Triple the drift outbound", "Triplez la dérive en éloignement"),
      ),
      DIAGRAM(
        "h-wind.d",
        {
          kind: "calc",
          calc: {
            kind: "holdWind",
            inbound: HOLD.inbound,
            turn: HOLD.turn,
            windDir: w[0],
            windKt: w[1],
            tasKt: 90,
            drag: ["wind"],
          },
        },
        L(
          "Hold at ARD in a north wind at 25 kt",
          "Attente à ARD par vent du nord de 25 kt",
        ),
        GR.left,
        288,
        960,
        696,
        {
          interactive: true,
          caption: L(
            "Drag the wind: the racetrack and the headings follow.",
            "Déplacez le vent : l’hippodrome et les caps suivent.",
          ),
        },
      ),
      ...pointRows([
        {
          heading: L(
            `Inbound · heading ${pad3(inHdg)}`,
            `Rapprochement · cap ${pad3(inHdg)}`,
          ),
          body: L(
            `Wind 360/25 at your altitude, 90 kt: ${d}° into the wind holds the course.`,
            `Vent 360/25 à votre altitude, 90 kt : ${d}° face au vent tiennent la route.`,
          ),
          color: "sel",
        },
        {
          heading: L(
            `Outbound · heading ${pad3(outHdg)}`,
            `Éloignement · cap ${pad3(outHdg)}`,
          ),
          body: L(
            `Three times that, into the wind: 3 × ${d}° = ${3 * d}°.`,
            `Trois fois plus, face au vent : 3 × ${d}° = ${3 * d}°.`,
          ),
          color: "key",
        },
        {
          heading: L("Why three?", "Pourquoi trois ?"),
          body: L(
            "The two turns drift too: one minute outbound must make up for three.",
            "Les deux virages dérivent aussi : une minute d’éloignement en rattrape trois.",
          ),
        },
      ]),
      foot(
        L(
          "FAA AIM 5-3-8 · FAA IFH ch. 10 · for a one-minute outbound leg",
          "FAA AIM 5-3-8 · FAA IFH ch. 10 · pour un éloignement d’une minute",
        ),
      ),
    ]),
    [
      {
        t: "text",
        text: L(
          `Inbound, find the correction that holds the course; outbound, apply three times that correction (FAA AIM 5-3-8; FAA IFH ch. 10). With a wind of 360/25 at your altitude and 90 kt: inbound heading ${pad3(inHdg)}, outbound heading ${pad3(outHdg)}. Three, because the two turns drift as well and the one-minute outbound leg is the only place to make it up. When the outbound leg is much longer than a minute (a wind on your tail inbound), less than three times is enough.`,
          `En rapprochement, trouvez la correction qui tient la route ; en éloignement, appliquez trois fois cette correction (FAA AIM 5-3-8 ; FAA IFH ch. 10). Avec un vent 360/25 à votre altitude et 90 kt : cap ${pad3(inHdg)} en rapprochement, ${pad3(outHdg)} en éloignement. Trois, parce que les deux virages dérivent eux aussi et que la minute d’éloignement est le seul endroit où le rattraper. Quand l’éloignement dure bien plus d’une minute (vent dans le dos en rapprochement), moins de trois fois suffit.`,
        ),
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

/** The abeam point, shown on a live HSI: outbound with the inbound course set, the flag flips abeam the fix. */
function abeam(): Step {
  const title = L(
    "Abeam the fix: the flag flips",
    "Le travers du repère : le drapeau bascule",
  );
  return slideStep(
    "h-abeam",
    title,
    slide(
      "quiz",
      [
        ...head(L("Timing", "Chronométrage"), title),
        INST(
          HSI,
          L(
            "HSI flown live outbound on heading 090 with course 270 set: the flag flips from FROM to TO abeam ARD",
            "HSI en direct en éloignement au cap 090, route 270 affichée : le drapeau passe de FROM à TO au travers d’ARD",
          ),
          216,
          312,
          576,
          576,
          { id: "h-abeam.hsi", scene: "hold.abeam", mode: "live" },
        ),
        T(
          "small",
          L(
            "● Flown live: outbound, heading 090, OBS 270",
            "● En direct : éloignement, cap 090, OBS 270",
          ),
          GR.left,
          904,
          768,
          48,
          { align: "center", color: "nav" },
        ),
        QUIZ(
          "h-abeam.q",
          {
            kind: "mcq",
            prompt: L(
              "Outbound, when do you start the clock?",
              "En éloignement, quand lancez-vous le chrono ?",
            ),
            options: [
              {
                text: L(
                  "When the flag flips from FROM to TO",
                  "Quand le drapeau passe de FROM à TO",
                ),
                why: L(
                  "Right: the flip marks the point abeam the fix.",
                  "Juste : la bascule marque le travers du repère.",
                ),
              },
              {
                text: L(
                  "As soon as the wings are level",
                  "Dès que les ailes sont à plat",
                ),
                why: L(
                  "Only if abeam is already behind you: the later of the two.",
                  "Seulement si le travers est déjà passé : le plus tardif des deux.",
                ),
              },
              {
                text: L("When the bar centres", "Quand la barre se centre"),
                why: L(
                  "Outbound you are a mile from the course: the bar stays at full scale.",
                  "En éloignement, vous êtes à 1 NM de l’axe : la barre reste en butée.",
                ),
              },
            ],
            answer: 0,
            explain: L(
              "Abeam = the flag flips. Start the clock then, or wings level if that comes later.",
              "Travers = bascule du drapeau. Top chrono à ce moment, ou ailes à plat si c’est plus tard.",
            ),
          },
          984,
          312,
          816,
          672,
        ),
        foot(
          L(
            "FAA AIM 5-3-8 · over or abeam the fix, whichever is later",
            "FAA AIM 5-3-8 · verticale ou travers du repère, le plus tardif",
          ),
          768,
        ),
      ],
      { scene: "hold.abeam" },
    ),
    [
      {
        t: "text",
        text: L(
          "Outbound timing starts over or abeam the fix, whichever occurs later (FAA AIM 5-3-8). On a VOR hold, leave the inbound course on the OBS: flying outbound, the TO / FROM flag flips from FROM to TO as you pass abeam the station. On the slide the HSI flies the outbound leg: watch the flag flip. The deviation bar is no help there: a mile from the course it stays at full scale.",
          "Le chrono d’éloignement part à la verticale ou au travers du repère, le plus tardif des deux (FAA AIM 5-3-8). Sur une attente VOR, laissez la route de rapprochement à l’OBS : en éloignement, le drapeau TO / FROM passe de FROM à TO au moment où vous passez le travers de la station. Sur la diapo, le HSI vole la branche d’éloignement : regardez le drapeau basculer. La barre de déviation n’aide pas ici : à 1 NM de l’axe, elle reste en butée.",
        ),
      },
    ],
    { kind: "quiz", minutes: 1 },
  );
}

/** Fly the inbound heading of the wind slide on the HSI, with the top view: the track must stay on the course. */
function windTry(): Step {
  // the numbers of the wind slide (90 kt): 16° inbound, three times that outbound
  const inHdg = pad3(
    Math.round(wrap360(HOLD.inbound + wca(HOLD.inbound, 90, 360, 25))),
  );
  const d = Math.round(Math.abs(wca(HOLD.inbound, 90, 360, 25)));
  const outHdg = pad3(outboundHeading(HOLD.inbound, 90, 360, 25));
  return step(
    "h-wind-try",
    "try",
    L(
      "Fly the inbound heading in the wind",
      "Volez le cap de rapprochement dans le vent",
    ),
    [
      {
        t: "text",
        text: L(
          "Inbound to ARD on the 270 course, 4 NM out, heading 270. The wind is **360 at 25 kt**, from your right: heading 270 does not hold the course. Find the heading that does.",
          "En rapprochement vers ARD sur la route 270, à 4 NM, cap 270. Le vent est du **360 pour 25 kt**, de votre droite : le cap 270 ne tient pas l’axe. Trouvez le cap qui le tient.",
        ),
      },
      {
        t: "doThis",
        rows: [
          {
            text: L("Keep the **TO** flag", "Gardez le drapeau **TO**"),
            check: 0,
            readout: "toFrom",
          },
          {
            text: L(
              "Track 270 (±3°): the heading that holds the course",
              "Route 270 (±3°) : le cap qui tient l’axe",
            ),
            check: 1,
            readout: "trk",
          },
          {
            text: L(
              "Bar within one dot of the HSI (half scale)",
              "Barre à moins d’un point du HSI (demi-échelle)",
            ),
            check: 2,
          },
        ],
      },
      {
        t: "keys",
        items: [
          L(
            `Expect a heading near ${inHdg}: about ${d}° into the wind.`,
            `Attendez-vous à un cap vers ${inHdg} : environ ${d}° face au vent.`,
          ),
        ],
      },
      {
        t: "reveal",
        when: "goalMet",
        blocks: [
          {
            t: "text",
            text: L(
              `That is the inbound correction: ${d}°. Outbound you triple it, still into the wind: 090 − ${3 * d}° = **${outHdg}**.`,
              `C’est la correction de rapprochement : ${d}°. En éloignement, vous la triplez, toujours face au vent : 090 − ${3 * d}° = **${outHdg}**.`,
            ),
          },
        ],
      },
      {
        t: "takeaway",
        text: L(
          "Find the drift inbound, on the instrument; triple it outbound.",
          "Trouvez la dérive en rapprochement, sur l’instrument ; triplez-la en éloignement.",
        ),
      },
    ],
    {
      minutes: 3,
      stage: {
        panes: [HSI_PANE],
        inset: "plan",
        mode: "live",
        scene: "hold.wind",
        controls: ["hdgBug", "bank"],
        assist: { holdAlt: true, holdIas: true },
      },
      goal: {
        // the track, not only the bar: on heading 270 the bar starts centred while the wind already carries you off
        all: [G.toFrom("TO"), G.track(HOLD.inbound, 3), HALF_SCALE],
        holdS: 20,
        graded: false,
        success: L(
          "The correction holds the course.",
          "La correction tient l’axe.",
        ),
      },
      hint: L(
        `The bar leaves to the right: turn right about 20° (290). When it comes back, keep about ${d}° (heading ${inHdg}) and check the track reads 270.`,
        `La barre part à droite : virez à droite d’environ 20° (290). Quand elle revient, gardez environ ${d}° (cap ${inHdg}) et vérifiez que la route lit 270.`,
      ),
    },
  );
}

/** Fly the first leg of the teardrop entry on the HSI, beside the hold drawn with the arrival and the top view:
 *  what the flag and the heading show on the instrument is what the aircraft does on the map. */
function teardropFly(): Step {
  return step(
    "h-teardrop-fly",
    "try",
    L("Fly the teardrop entry", "Volez l’entrée décalée"),
    [
      {
        t: "text",
        text: L(
          "You reach ARD on course **050**: the teardrop sector. The OBS keeps the inbound course **270**. Cross ARD (the flag flips), take heading **060** and hold it: that is the entry leg, one minute from the fix. On the top view, watch the aircraft enter the racetrack.",
          "Vous arrivez sur ARD par la route **050** : le secteur de l’entrée décalée. L’OBS garde la route de rapprochement **270**. Passez ARD (le drapeau bascule), prenez le cap **060** et tenez-le : c’est la branche d’entrée, une minute depuis le repère. Sur la vue de dessus, regardez l’avion entrer dans l’hippodrome.",
        ),
      },
      {
        t: "doThis",
        rows: [
          {
            text: L("Cross **ARD**", "Passez **ARD**"),
            check: 0,
          },
          {
            text: L("Hold heading **060** (±5°)", "Tenez le cap **060** (±5°)"),
            check: 1,
            readout: "hdg",
          },
        ],
      },
      {
        t: "reveal",
        when: "goalMet",
        blocks: [
          {
            t: "text",
            text: L(
              "After one minute on 060, turn **right**, in the direction of the hold, and intercept the 270 course: bar centred, **TO** flag. Then the hold goes on with right turns.",
              "Après une minute au 060, virez à **droite**, dans le sens de l’attente, et interceptez la route 270 : barre centrée, drapeau **TO**. L’attente continue ensuite par la droite.",
            ),
          },
        ],
      },
      {
        t: "takeaway",
        text: L(
          "Teardrop: at the fix, 30° off the outbound course on the holding side, for one minute.",
          "Entrée décalée : au repère, 30° de l’axe d’éloignement côté attente, pendant une minute.",
        ),
      },
    ],
    {
      minutes: 2,
      stage: {
        panes: [
          HSI_PANE,
          {
            kind: "diagram",
            d: {
              kind: "hold",
              inbound: HOLD.inbound,
              turn: HOLD.turn,
              fix: HOLD.fix,
              crs: 50,
              // the racetrack and the entry path only: the top view beside it names the sectors
              quiet: true,
            },
          },
        ],
        // the top view draws the hold, its sectors and the track flown
        inset: "plan",
        mode: "live",
        scene: "hold.teardrop",
        controls: ["hdgBug", "bank"],
        assist: { holdAlt: true, holdIas: true },
      },
      goal: {
        // the fix first, then the entry heading held: the heading alone could be met without crossing ARD
        all: [G.passed(HOLD.fix), G.heading(60, 5)],
        holdS: 8,
        graded: false,
        success: L(
          "On the entry leg: one minute, then right to intercept 270.",
          "Sur la branche d’entrée : une minute, puis à droite pour intercepter le 270.",
        ),
      },
      hint: L(
        "Keep the wings level for about 35 s, until the flag flips. Then hold the R side of the bank pad for a few seconds: 060 is only 10° to the right. If the heading slips back under 055, tap R again.",
        "Gardez les ailes à plat environ 35 s, jusqu’à la bascule du drapeau. Puis maintenez le côté R des boutons d’inclinaison quelques secondes : 060 n’est qu’à 10° à droite. Si le cap repasse sous 055, touchez encore R.",
      ),
    },
  );
}

/** The three classic mistakes of the hold, each with its correction. */
function mistakes(): Step {
  return mistakesStep("h-mistakes", {
    title: L("Three classic mistakes", "Trois erreurs classiques"),
    rows: [
      {
        error: L("Choosing the entry at the fix", "Choisir l’entrée au repère"),
        why: L(
          "Over the fix there is no time left to work out the sector.",
          "À la verticale du repère, il n’y a plus le temps de chercher le secteur.",
        ),
        fix: L(
          "Draw the hold and your arrival 3 minutes before.",
          "Dessinez l’attente et votre arrivée 3 minutes avant.",
        ),
      },
      {
        error: L("The clock started too early", "Le chrono lancé trop tôt"),
        why: L(
          "Timed from the fix and not from abeam, the outbound leg is cut short: so is the inbound leg.",
          "Compté depuis le repère et non depuis le travers, l’éloignement est amputé : le rapprochement aussi.",
        ),
        fix: L(
          "Start it abeam: the flag flips.",
          "Lancez-le au travers : le drapeau bascule.",
        ),
      },
      {
        error: L("One correction for both legs", "La même correction partout"),
        why: L(
          "Outbound with the inbound correction, the two turns drift you across the course.",
          "En éloignement avec la correction du rapprochement, les deux virages vous font traverser l’axe.",
        ),
        fix: L(
          "Outbound, triple it, into the wind.",
          "En éloignement, triplez-la, face au vent.",
        ),
      },
    ],
    foot: L(
      "FAA AIM 5-3-8 · FAA IFH ch. 10",
      "FAA AIM 5-3-8 · FAA IFH ch. 10",
    ),
    reader: L(
      "Three classic mistakes. Choosing the entry at the fix: there is no time left; draw the hold and your arrival three minutes before. Starting the clock too early: timed from the fix and not from abeam, the outbound leg is cut short and so is the inbound leg; start it abeam, when the flag flips. One correction for both legs: outbound with the inbound correction, the two turns drift you across the course; outbound, triple the correction, into the wind (FAA AIM 5-3-8; FAA IFH ch. 10).",
      "Trois erreurs classiques. Choisir l’entrée au repère : il n’y a plus le temps ; dessinez l’attente et votre arrivée trois minutes avant. Lancer le chrono trop tôt : compté depuis le repère et non depuis le travers, l’éloignement est amputé et le rapprochement aussi ; lancez-le au travers, quand le drapeau bascule. La même correction partout : en éloignement avec la correction du rapprochement, les deux virages vous font traverser l’axe ; en éloignement, triplez la correction, face au vent (FAA AIM 5-3-8 ; FAA IFH ch. 10).",
    ),
  });
}

function recap(): Step {
  return slideStep(
    "h-recap",
    L("Before you fly", "Avant de voler"),
    slide("recap", [
      ...head(
        L("Keys to success", "Clés du succès"),
        L("Before you fly the hold", "Avant de voler l’attente"),
      ),
      ...recapBlocks({
        id: "h-recap",
        cols: [
          {
            n: L("1:00", "1:00"),
            text: L(
              "inbound, at or below 14,000 ft MSL",
              "en rapprochement, jusqu’à 14 000 ft MSL",
            ),
          },
          {
            n: L("×3", "×3"),
            text: L(
              "the drift correction, outbound",
              "la correction de dérive, en éloignement",
            ),
            color: "key",
          },
          {
            n: L("230", "230"),
            text: L(
              "kt at most up to 14,000 ft (ICAO); FAA: 200 KIAS to 6,000 ft",
              "kt au plus jusqu’à 14 000 ft (OACI) ; FAA : 200 KIAS à 6 000 ft",
            ),
          },
        ],
        checksTitle: L("Every hold", "À chaque attente"),
        checks: [
          L(
            "Entry from your course to the fix",
            "Entrée selon votre route vers le repère",
          ),
          L("Time from abeam the fix", "Chrono au travers du repère"),
          L(
            "Adjust the outbound leg each lap",
            "Ajustez l’éloignement à chaque tour",
          ),
        ],
      }),
      foot(
        L(
          "FAA AIM 5-3-8 · FIG 5-3-8 · ICAO Doc 8168 Vol I",
          "FAA AIM 5-3-8 · FIG 5-3-8 · OACI Doc 8168 Vol I",
        ),
      ),
    ]),
    [
      {
        t: "keys",
        items: [
          L(
            "Inbound leg 1:00 at or below 14,000 ft MSL.",
            "Rapprochement 1:00 jusqu’à 14 000 ft MSL.",
          ),
          L(
            "Triple the drift correction outbound.",
            "Triplez la correction de dérive en éloignement.",
          ),
          L(
            "Maximum 230 kt up to 14,000 ft (ICAO); FAA: 200 KIAS up to 6,000 ft MSL.",
            "230 kt maximum jusqu’à 14 000 ft (OACI) ; FAA : 200 KIAS jusqu’à 6 000 ft MSL.",
          ),
        ],
      },
    ],
    { minutes: 1 },
  );
}
// ------------------------------------------------------------------ the practice steps
/** "Twist": the clearance read on the instrument. The student sets the inbound course on the OBS and checks. */
function twist(): Step {
  return step(
    "h-twist",
    "quiz",
    L("Set the hold on the HSI", "Affichez l’attente sur le HSI"),
    [
      {
        t: "text",
        text: L(
          "*“Hold east of ARD on the 090 radial.”* You are 8 NM east of ARD, on your way to the fix. Set the **inbound course** of the hold on the OBS, then tap Check.",
          "*« Attendez à l’est d’ARD sur le radial 090. »* Vous êtes à 8 NM à l’est d’ARD, en route vers le repère. Affichez à l’OBS la **route de rapprochement** de l’attente, puis touchez Vérifier.",
        ),
      },
    ],
    {
      minutes: 1,
      quiz: {
        kind: "fly",
        prompt: L(
          "Set the OBS to the inbound course of the hold.",
          "Réglez l’OBS sur la route de rapprochement de l’attente.",
        ),
        answer: [G.obs(HOLD.inbound), G.toFrom("TO")],
        explain: L(
          "On the 090 radial you fly back to ARD on 270: OBS 270, flag TO. 090 would read FROM: that is the outbound course.",
          "Sur le radial 090, vous revenez vers ARD au 270 : OBS 270, drapeau TO. 090 afficherait FROM : c’est la route d’éloignement.",
        ),
      },
      stage: {
        panes: [HSI_PANE],
        mode: "frozen",
        scene: "hold.twist",
        controls: ["obs1"],
      },
    },
  );
}

/** Drag the aircraft into the teardrop sector: radials 205–265 of ARD give courses 025–085 to the fix. */
export const TEARDROP_DRAG = { radial: 235, tol: 30 };
function dragSector(): Step {
  return step(
    "h-drag",
    "try",
    L("Find the teardrop sector", "Trouvez le secteur de l’entrée décalée"),
    [
      {
        t: "text",
        text: L(
          "Drag the aircraft round ARD on the plan view. It always points at the fix, and the chip names the entry from where it is.",
          "Déplacez l’avion autour d’ARD sur la vue en plan. Il pointe toujours vers le repère et l’étiquette nomme l’entrée depuis sa position.",
        ),
      },
      {
        t: "doThis",
        rows: [
          {
            text: L(
              "Put the aircraft where the entry is **teardrop**",
              "Placez l’avion là où l’entrée est **décalée**",
            ),
            check: 0,
            readout: "entry",
          },
        ],
      },
      {
        t: "reveal",
        when: "goalMet",
        blocks: [
          {
            t: "text",
            text: L(
              "The teardrop sector is the 70° on the non-holding side, before the fix on the inbound end: here, south-west of ARD (radials 200 to 270).",
              "Le secteur de l’entrée décalée est le secteur de 70° côté non-attente, en amont du repère : ici, au sud-ouest d’ARD (radials 200 à 270).",
            ),
          },
        ],
      },
    ],
    {
      minutes: 2,
      stage: {
        panes: [
          {
            kind: "diagram",
            d: {
              kind: "hold",
              inbound: HOLD.inbound,
              turn: HOLD.turn,
              fix: HOLD.fix,
            },
          },
        ],
        inset: "plan",
        mode: "frozen",
        scene: "hold.drag",
        controls: ["dragAircraft"],
      },
      goal: {
        all: [
          {
            id: "onRadial",
            p: {
              navaid: "ARD",
              radial: TEARDROP_DRAG.radial,
              tol: TEARDROP_DRAG.tol,
            },
          },
        ],
        holdS: 1,
        graded: false,
        success: L("Teardrop sector.", "Secteur de l’entrée décalée."),
      },
      hint: L("Try south-west of ARD.", "Essayez au sud-ouest d’ARD."),
    },
  );
}

function flyHold(briefing: Step[]): Step {
  const f = flyNumbers();
  const wind = `${pad3(FLY_WIND.dir)}/${FLY_WIND.kt}`;
  return step(
    "h-fly",
    "fly",
    L(
      "Fly it: the ARD hold in a strong wind",
      "Volez : l’attente d’ARD par vent fort",
    ),
    [],
    {
      minutes: 12,
      flyIt: {
        target: { kind: "lesson", exerciseId: "hold-wind" },
        brief: L(
          `Join the ARD hold (inbound 270, right turns) at 3,000 ft and fly three laps. The surface wind is 360/25; at 3,000 ft it is about ${wind}. Inbound, hold about ${pad3(f.inHdg)}; outbound, about ${pad3(f.outHdg)} for about ${mmss(f.outS)} from abeam. The lesson grades the entry, the timing and the altitude.`,
          `Rejoignez l’attente d’ARD (rapprochement 270, virages à droite) à 3 000 ft et faites trois tours. Le vent au sol est du 360/25 ; à 3 000 ft, il est d’environ ${wind}. En rapprochement, tenez environ ${pad3(f.inHdg)} ; en éloignement, environ ${pad3(f.outHdg)} pendant environ ${mmss(f.outS)} depuis le travers. La leçon note l’entrée, le chronométrage et l’altitude.`,
        ),
        keys: [
          L(
            `The wind is on your tail inbound: the outbound leg is long, about ${mmss(f.outS)}, not 1:00.`,
            `Le vent est dans votre dos en rapprochement : l’éloignement est long, environ ${mmss(f.outS)}, pas 1:00.`,
          ),
          L(
            "Adjust the outbound time after each lap, by the inbound error.",
            "Ajustez le temps d’éloignement après chaque tour, de l’écart du rapprochement.",
          ),
        ],
        options: ["wind", "turbulence", "allowAp"],
        defaultsOn: ["wind"],
        criteria: [],
        debrief: L(
          "Compare your inbound times lap by lap: the second lap should already be close to 1:00.",
          "Comparez vos temps de rapprochement tour par tour : le deuxième tour doit déjà approcher 1:00.",
        ),
        returnTo: "thisStep",
        briefing,
      },
    },
  );
}

function flyBriefing(): Step[] {
  // the wind the lesson flies at 3,000 ft, not the surface wind: the numbers below work in the cockpit
  const w: [number, number] = [FLY_WIND.dir, FLY_WIND.kt];
  const wind = `${pad3(w[0])}/${w[1]}`;
  const f = flyNumbers();
  const drift = Math.round(Math.abs(wca(HOLD.inbound, FLY_TAS, w[0], w[1])));
  const side = Math.sign(wca(90, FLY_TAS, w[0], w[1])) || 1;
  const once = Math.round(wrap360(90 + side * drift));
  const tripled = Math.round(wrap360(90 + side * 3 * drift));
  const wrongSide = Math.round(wrap360(90 - (f.outHdg - 90)));
  const e = holdEntry(HOLD.inbound, HOLD.turn, 270);
  const opts = [f.outHdg, once, wrongSide];
  return [
    step(
      "h-fly.b1",
      "predict",
      L("Brief: your entry", "Briefing : votre entrée"),
      [
        {
          t: "text",
          text: L(
            "The lesson starts 7 NM east of ARD, tracking 270 to the fix.",
            "La leçon démarre à 7 NM à l’est d’ARD, en route au 270 vers le repère.",
          ),
        },
      ],
      {
        quiz: {
          kind: "mcq",
          prompt: L(
            "Which entry will you fly?",
            "Quelle entrée allez-vous faire ?",
          ),
          options: ENTRIES.map((x) => ({
            text: ENTRY_NAME[x],
            why:
              x === e
                ? L(
                    `Right: ${ENTRY_SHORT[x].en}`,
                    `Juste : ${F(ENTRY_SHORT[x])}`,
                  )
                : L(
                    `No: that sector takes ${SECTOR[x].en}. You arrive on 270.`,
                    `Non : ce secteur reçoit les ${F(SECTOR[x])}. Vous arrivez au 270.`,
                  ),
          })),
          answer: ENTRIES.indexOf(e),
          explain: L(
            `${ENTRY_NAME[e].en}: on the inbound course you are in the direct sector. ${ENTRY_HOW[e].en}`,
            `${F(ENTRY_NAME[e])} : sur la route de rapprochement vous êtes dans le secteur direct. ${F(ENTRY_HOW[e])}`,
          ),
        },
        stage: {
          panes: [
            {
              kind: "diagram",
              d: {
                kind: "hold",
                inbound: HOLD.inbound,
                turn: HOLD.turn,
                fix: HOLD.fix,
              },
            },
          ],
          mode: "frozen",
          scene: "hold.cover",
        },
      },
    ),
    step(
      "h-fly.b2",
      "quiz",
      L("Brief: the outbound heading", "Briefing : le cap d’éloignement"),
      [
        {
          t: "text",
          text: L(
            `Surface wind 360/25: in the sim, as in the air, it veers and strengthens with height. At 3,000 ft it is about **${wind}**: ${drift}° of drift at 94 KTAS, and a wind on your tail inbound. Inbound heading about ${pad3(f.inHdg)}. Outbound course 090.`,
            `Vent au sol 360/25 : au simulateur comme en vol, il tourne à droite et forcit avec l’altitude. À 3 000 ft, il est d’environ **${wind}** : ${drift}° de dérive à 94 kt de Vp, et du vent dans le dos en rapprochement. Cap de rapprochement environ ${pad3(f.inHdg)}. Route d’éloignement 090.`,
          ),
        },
      ],
      {
        quiz: {
          kind: "mcq",
          prompt: L(
            "Which heading outbound, on the first lap?",
            "Quel cap en éloignement, au premier tour ?",
          ),
          options: opts.map((v, i) => ({
            text: L(pad3(v), pad3(v)),
            why:
              i === 0
                ? L(
                    `Right: about twice the drift, into the wind, held for about ${mmss(f.outS)}.`,
                    `Juste : environ deux fois la dérive, face au vent, tenue environ ${mmss(f.outS)}.`,
                  )
                : i === 1
                  ? L(
                      "That only holds the 090 track: the two turns drift you south, and you overshoot the inbound course.",
                      "Ce cap tient seulement la route 090 : les deux virages vous déportent au sud et vous dépassez l’axe de rapprochement.",
                    )
                  : L(
                      "Wrong side: correct into the wind, to the left, towards the north.",
                      "Mauvais côté : corrigez face au vent, à gauche, vers le nord.",
                    ),
          })),
          answer: 0,
          explain: L(
            `About ${pad3(f.outHdg)} for about ${mmss(f.outS)}. Tripling ${drift}° would give ${pad3(tripled)}, almost straight into the wind: the ×3 rule is for a one-minute outbound leg. Here the tailwind inbound makes the outbound leg long, so about twice is enough. Then adjust lap by lap.`,
            `Environ ${pad3(f.outHdg)} pendant environ ${mmss(f.outS)}. Tripler ${drift}° donnerait ${pad3(tripled)}, presque face au vent : la règle du ×3 vaut pour un éloignement d’une minute. Ici, le vent dans le dos en rapprochement allonge l’éloignement : environ deux fois suffit. Ajustez ensuite tour après tour.`,
          ),
        },
        stage: {
          panes: [
            {
              kind: "diagram",
              d: {
                kind: "calc",
                calc: {
                  kind: "holdWind",
                  inbound: HOLD.inbound,
                  turn: HOLD.turn,
                  windDir: w[0],
                  windKt: w[1],
                  tasKt: FLY_TAS,
                  outboundS: f.outS,
                },
              },
            },
          ],
          mode: "frozen",
        },
      },
    ),
  ];
}

/** The holding sample (20 steps): each idea on a slide, then an exercise; the mistakes, the takeaways and Fly it. */
export function holdingCourse(): Course {
  const steps: Step[] = [
    // the rule, the clearance, the pattern
    cover(),
    why(),
    clearance(),
    twist(),
    anatomy(),
    // the entries: the three sectors, then three exercises and the turn at the fix on the HSI
    threeEntries(),
    caseSlide("h-case-c", 300, false),
    dragSector(),
    caseSlide("h-case-b", 180, true),
    fiveTs("h-five-ts", "hold.fix", 90, HSI, 270),
    // the teardrop flown (it replaces a third entry question): the HSI beside the hold drawn with the arrival,
    // and the top view
    teardropFly(),
    // timing: the rule, the abeam point on a live HSI, a calc
    timing(),
    abeam(),
    step(
      "h-timing-calc",
      "calc",
      L("Adjust the outbound time", "Ajuster le temps d’éloignement"),
      [],
      {
        minutes: 3,
        calc: { generatorId: "ifr.holdTiming" },
      },
    ),
    // the wind: the diagram the student drags, then the inbound heading flown on the HSI
    windSlide(),
    windTry(),
    // the numbers from memory (wind, timing and the maximum speeds), the mistakes, the takeaways, the flight
    step(
      "h-drill",
      "drill",
      L("Drill: holding numbers", "Série : les chiffres de l’attente"),
      [],
      {
        minutes: 5,
        drill: {
          generatorIds: ["ifr.holdWind", "ifr.holdTiming", "ifr.holdSpeed"],
          params: { "ifr.holdSpeed": { rules: "icao" } },
          count: 6,
          timer: { mode: "perProblem", seconds: 60 },
          feedback: "each",
          practiceOnly: true,
        },
      },
    ),
    mistakes(),
    recap(),
    flyHold(flyBriefing()),
  ];
  return course(
    {
      id: HOLDING_ID,
      title: L(
        "Holding: entries, timing and wind",
        "L’attente : entrées, chronométrage et vent",
      ),
      summary: L(
        "The clearance, the three entries on the diagram, outbound timing and the triple-drift rule — then three laps at ARD in a strong wind.",
        "La clairance, les trois entrées sur le schéma, le chronométrage et la règle de la dérive triplée — puis trois tours à ARD par vent fort.",
      ),
      cockpit: "steam",
      theme: "classroom",
      tags: ["ifr", "holding", "entries", "wind"],
      minutes: 45,
    },
    steps,
    holdingScenes(),
  );
}
