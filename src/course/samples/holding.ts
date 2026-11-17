// Ground school — built-in sample "Holding: entries, timing and wind" (18 steps, steam cockpit, hold at ARD
// inbound 270, right turns). The hold-ndb lesson's briefing is a crafted deck (samples/briefings/holdNdb.ts).
// Each idea is shown flown, then the student does it. The hold flown on the slide (calc diagram holdFly,
// stage/diagramHold.ts: an aircraft flying the arrival, the entry and the racetrack) carries the lesson: what a hold
// is (its parts named), the entries trainer (the student sets the arrival heading, the sector lights up and the
// entry is flown; three headings ticked by themselves), the presenter's demonstration, the stopwatch started abeam,
// and the triple-drift rule with a wind the presenter changes live. Around it: the clearance (a question, then the
// inbound course set on the HSI), the three sectors, an entry question, the turn at the fix flown on a live HSI, the
// abeam point on a live HSI, the outbound time with a headwind (a question), the inbound heading flown in the wind,
// the mistakes, the takeaways, one lap in the simulator from the published hold, and Fly it with its two briefing
// questions. Every entry shown or checked comes from holdEntry() (nav/holding.ts, AIM FIG 5-3-8); every slide has
// presenter notes.
// Sources: FAA AIM 5-3-8 (holding: clearance items, entries, timing, maximum speeds, the 3-minute speed
// reduction), FAA-H-8083-15 Instrument Flying Handbook ch. 10 (holding, wind correction), ICAO Doc 8168
// PANS-OPS Vol I (5° entry tolerance; holding speeds 230 kt up to 14,000 ft, 240 kt to FL200, 265 kt to FL340),
// FAA-S-ACS-8 Instrument Rating ACS area III task B.
// The Fly it is the hold-wind lesson: its surface wind (360/25) veers and strengthens with height in the sim
// (sim/wind.ts defaultAloft: about 025/39 at 3,000 ft), so the briefing's headings and outbound time come from a
// point-mass lap flown in that wind (holdLap / firstLap below), not from the surface wind.
import type {
  CalcDiagram,
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
import { mistakesStep } from "./briefings/kit";
import { simFlightStep, sit } from "./decks/kit";
import { flyHold as flyPath } from "../stage/holdPath";
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
          : {
              adf: 344,
              brg1: "ADF",
              nav1: "ARD",
              obs1: 270,
              cdi: "NAV1",
              nav2: 108,
            },
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
          aloft: [3000, 6000, 9000].map((altFt) => ({
            altFt,
            dir: 360,
            kt: 25,
          })),
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
    // in the published hold of the flight plan (ARD/H270R1): the Fly-it-in-the-simulator slide
    // at 3,000 ft, as in the clearance, the scenes and the Fly it
    "hold.sim": sit("hold.sim", "hold", "ARD hold · inbound 270 · 3,000 ft", {
      altFt: 3000,
    }),
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
  DIRECT: L("headings 200 to 020", "caps 200 à 020"),
  TEARDROP: L("headings 020 to 090", "caps 020 à 090"),
  PARALLEL: L("headings 090 to 200", "caps 090 à 200"),
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

/** a block one level above the others in its frame (an answer drawn over the question's picture replaces it) */
const above = (b: SlideBlock): SlideBlock => ({
  ...b,
  frame: { ...b.frame, z: (b.frame.z ?? 0) + 1 },
});
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
    // the answer: the same map with the aircraft and its sector, over the plain one (which it replaces) once the
    // right answer is shown: never after a first wrong pick, while the student tries again
    above(
      DIAGRAM(
        `${o.id}.hold`,
        holdD(o.fix, o.crs),
        L(
          `Hold at ${o.fix} with the arrival on heading ${pad3(o.crs)}: ${ENTRY_NAME[e].en.toLowerCase()} entry`,
          `Attente à ${o.fix} avec l’arrivée au cap ${pad3(o.crs)} : entrée ${F(ENTRY_NAME[e]).toLowerCase()}`,
        ),
        d.x,
        d.y,
        d.w,
        d.h,
        { reveal: { order: 1, when: "answerShown" }, caption: mapHint },
      ),
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
              ? L(`Right: ${ENTRY_SHORT[x].en}`, `Juste : ${F(ENTRY_SHORT[x])}`)
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
      heading: L("Turn", "Turn · virer"),
      small: L(
        "to the outbound or entry heading",
        "vers le cap d’éloignement ou d’entrée",
      ),
    },
    {
      heading: L("Time", "Time · chrono"),
      small: L(
        "abeam the fix (teardrop, parallel entry: at the fix)",
        "au travers du repère (entrée décalée, parallèle : au repère)",
      ),
    },
    { heading: L("Twist", "Twist · l’OBS"), small: twist },
    {
      heading: L("Throttle", "Throttle · puissance"),
      small: L("holding speed, 90 KIAS here", "vitesse d’attente, 90 KIAS ici"),
    },
    {
      heading: L("Talk", "Talk · parler"),
      small: L(
        "report entering the hold if asked",
        "annoncez l’entrée en attente si demandé",
      ),
    },
  ];
  return slideStep(
    id,
    L("At the fix: the five Ts", "Au repère : les 5 T"),
    slide(
      "stepByStep",
      [
        ...head(
          L("At the holding fix", "Au repère d’attente"),
          L("The five Ts", "Les 5 T, en anglais"),
          960,
        ),
        ...stepRows(rows, { y: 304, pitch: 112, w: 816 }),
        // the « À vous » of the instrument, said on the slide (the strip only names its control)
        T(
          "small",
          L(
            `Your turn: wait for the flag to flip over ARD, then turn right to ${pad3(outbound)} with the bank control.`,
            `À vous : attendez la bascule du drapeau à la verticale d’ARD, puis virez à droite au ${pad3(outbound)} avec l’inclinaison.`,
          ),
          GR.left,
          872,
          816,
          88,
          { color: "key" },
        ),
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
            "Un aide-mémoire d’instructeur ; certains ajoutent un sixième T : Track (la route)",
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
          "Au repère, les 5 T, en anglais : Turn (virer), Time (chrono), Twist (l’OBS), Throttle (puissance), Talk (parler) ; certains ajoutent un sixième T, Track (la route). Le chrono part au travers du repère en attente et en entrée directe ; en entrée décalée ou parallèle, il part au repère. Sur la diapo : attendez la bascule du drapeau à la verticale d’ARD, puis virez en éloignement avec les boutons d’inclinaison L / R.",
        ),
      },
    ],
    { kind: "try", minutes: 2 },
  );
}

// ------------------------------------------------------------------ the course slides

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
          "« Attendez à ARD, radial 090, à l’est, maintenez 3000 pieds, prévoyez autorisation ultérieure à 1430. »",
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
              text: L("090", "090"),
              why: L(
                "090 is the radial, flown outbound. Inbound you fly its reciprocal.",
                "090 est le radial, en éloignement. En rapprochement on vole son inverse.",
              ),
            },
            {
              text: L("270", "270"),
              why: L(
                "Right: on the 090 radial, east of ARD, you fly back to the fix on 270.",
                "Juste : sur le radial 090, à l’est d’ARD, vous revenez vers le repère au 270.",
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
          answer: 1,
          explain: L(
            "Inbound 270. No turns stated: right turns. EFC 1430.",
            "Rapprochement 270. Aucun sens donné : virages à droite. Heure prévue d’autorisation ultérieure (EFC) : 1430.",
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
          "Parallel (110° sector), teardrop (70°; ICAO calls it the offset entry) and direct (180°), measured from the inbound course (FAA AIM 5-3-8). The sector is read from your arrival heading; in light wind heading and course are the same. Within 5° of a boundary, either entry is acceptable (ICAO PANS-OPS, Doc 8168).",
          "Parallèle (secteur de 110°), décalée (70° ; la FAA dit « teardrop », la goutte d’eau) et directe (180°), mesurés depuis la route de rapprochement (FAA AIM 5-3-8). Le secteur se lit avec votre cap d’arrivée ; par vent faible, cap ≈ route. À 5° près d’une limite, les deux entrées sont acceptables (OACI PANS-OPS, Doc 8168).",
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
    L(`Arriving on heading ${pad3(crs)}`, `Arrivée au cap ${pad3(crs)}`),
    slide(
      "quiz",
      entryPredict({
        id,
        fix: HOLD.fix,
        crs,
        eyebrow: L("Predict", "Prédire"),
        title: L(
          `You arrive on heading ${pad3(crs)}`,
          `Vous arrivez au cap ${pad3(crs)}`,
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
          `Arriving on heading ${pad3(crs)} to a hold inbound 270 with right turns: ${ENTRY_NAME[e].en.toLowerCase()} entry (FAA AIM 5-3-8). ${ENTRY_HOW[e].en}`,
          `Arrivée au cap ${pad3(crs)} sur une attente au 270 par la droite : entrée ${F(ENTRY_NAME[e]).toLowerCase()} (FAA AIM 5-3-8). ${F(ENTRY_HOW[e])}`,
        ),
      },
    ],
    { kind: "quiz", minutes: 1 },
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
            ],
            answer: 2,
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
            `Attendez-vous à un cap vers ${inHdg} : environ ${d}° côté vent.`,
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
              `C’est la correction de rapprochement : ${d}°. En éloignement, vous la triplez, toujours côté vent : 090 − ${3 * d}° = **${outHdg}**.`,
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
          "En éloignement, triplez-la, côté vent.",
        ),
      },
    ],
    foot: L("FAA AIM 5-3-8 · FAA IFH ch. 10", "FAA AIM 5-3-8 · FAA IFH ch. 10"),
    reader: L(
      "Three classic mistakes. Choosing the entry at the fix: there is no time left; draw the hold and your arrival three minutes before. Starting the clock too early: timed from the fix and not from abeam, the outbound leg is cut short and so is the inbound leg; start it abeam, when the flag flips. One correction for both legs: outbound with the inbound correction, the two turns drift you across the course; outbound, triple the correction, into the wind (FAA AIM 5-3-8; FAA IFH ch. 10).",
      "Trois erreurs classiques. Choisir l’entrée au repère : il n’y a plus le temps ; dessinez l’attente et votre arrivée trois minutes avant. Lancer le chrono trop tôt : compté depuis le repère et non depuis le travers, l’éloignement est amputé et le rapprochement aussi ; lancez-le au travers, quand le drapeau bascule. La même correction partout : en éloignement avec la correction du rapprochement, les deux virages vous font traverser l’axe ; en éloignement, triplez la correction, côté vent (FAA AIM 5-3-8 ; FAA IFH ch. 10).",
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
              "the drift correction, outbound (1:00 outbound leg)",
              "la correction de dérive, en éloignement (éloignement d’1 min)",
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
            "Entry from your arrival heading",
            "Entrée selon votre cap d’arrivée",
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
            "Triple the drift correction outbound (for a 1:00 outbound leg; a longer one needs less).",
            "Triplez la correction de dérive en éloignement (pour 1 min d’éloignement ; plus long, il en faut moins).",
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
          "*« Attendez à ARD, radial 090, à l’est. »* Vous êtes à 8 NM à l’est d’ARD, en route vers le repère. Affichez à l’OBS la **route de rapprochement** de l’attente, puis touchez Vérifier.",
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
  // the right heading last (the answers do not all sit on A)
  const opts = [once, wrongSide, f.outHdg];
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
              i === 2
                ? L(
                    `Right: about twice the drift, into the wind, held for about ${mmss(f.outS)}. ×3 is for a 1:00 outbound leg; here it lasts ${mmss(f.outS)}, so the same drift is made up over more time.`,
                    `Juste : environ deux fois la dérive, côté vent, tenue environ ${mmss(f.outS)}. ×3 vaut pour 1:00 d’éloignement ; ici il dure ${mmss(f.outS)}, la même dérive se rattrape sur plus de temps.`,
                  )
                : i === 0
                  ? L(
                      "That only holds the 090 track: the two turns drift you south, and you overshoot the inbound course.",
                      "Ce cap tient seulement la route 090 : les deux virages vous déportent au sud et vous dépassez l’axe de rapprochement.",
                    )
                  : L(
                      "Wrong side: correct into the wind, to the left, towards the north.",
                      "Mauvais côté : corrigez côté vent, à gauche, vers le nord.",
                    ),
          })),
          answer: 2,
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

// ------------------------------------------------------------------ the hold, flown on the slide
type HoldFlyD = Extract<CalcDiagram, { kind: "holdFly" }>;
/** The animated hold (stage/diagramHold.ts) at ARD, inbound 270, right turns, 90 KTAS. */
const flyD = (o: Partial<HoldFlyD> = {}, drag?: string[]) => ({
  kind: "calc" as const,
  calc: {
    kind: "holdFly" as const,
    inbound: HOLD.inbound,
    turn: HOLD.turn,
    fix: HOLD.fix,
    tasKt: 90,
    ...o,
    ...(drag ? { drag } : {}),
  } as CalcDiagram,
});
const withNotes = (s: Step, notes: L10n): Step => ({ ...s, notes });
/** The arrival headings of the entries trainer: one per sector, each well inside it (≥ 20° from a boundary). */
export const TRAINER_GOALS = [50, 180, 300] as const;
/** The first lap of the timing question: 1:00 outbound with this wind on the nose inbound, at 90 KTAS. */
export const TIMING_WIND: [number, number] = [270, 10];
export function timingNumbers(): {
  in1: number;
  out2: number;
  refined: number;
} {
  // what the next laps settle on (the timing slide flies it): the turns drift too, so a little more than the rule
  const auto = flyPath({
    inbound: HOLD.inbound,
    turn: HOLD.turn,
    tasKt: 90,
    windDir: TIMING_WIND[0],
    windKt: TIMING_WIND[1],
    outS: "auto",
    laps: 1,
  });
  const f = flyPath({
    inbound: HOLD.inbound,
    turn: HOLD.turn,
    tasKt: 90,
    windDir: TIMING_WIND[0],
    windKt: TIMING_WIND[1],
    outS: 60,
    laps: 1,
  });
  const in1 = Math.round(f.inboundS[0] / 5) * 5;
  return {
    in1,
    out2: Math.max(15, 120 - in1),
    refined: Math.round(auto.outS / 5) * 5,
  };
}

function cover(): Step {
  return withNotes(
    slideStep(
      "h-cover",
      L(
        "Holding: entries, timing and wind",
        "L’attente : entrées, chronométrage et vent",
      ),
      slide(
        "cover",
        coverBlocks({
          eyebrow: L(
            "Instrument flying · Holding",
            "Vol aux instruments · Attente",
          ),
          main: L("The hold", "L’attente"),
          sub: L("Entries, timing and wind", "Entrées, chronométrage et vent"),
          lead: L(
            "“Hold east of ARD on the 090 radial.” Pick the entry, start the clock abeam, correct for the wind — then fly it.",
            "« Attendez à ARD, radial 090, à l’est. » Choisir l’entrée, lancer le chrono au travers, corriger le vent — puis la voler.",
          ),
          meta: L(
            "18 steps · about 40 min · you act in 12 of them",
            "18 étapes · environ 40 min · vous agissez dans 12 d’entre elles",
          ),
          hero: [
            DIAGRAM(
              "h-cover.fly",
              flyD({ show: [] }),
              L(
                "An aircraft flying the hold at ARD, inbound 270, right turns",
                "Un avion vole l’attente d’ARD, rapprochement 270, virages à droite",
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
            "What a hold is, the three entries, the stopwatch from abeam the fix and the triple-drift rule — on the slide, then in the simulator.",
            "Ce qu’est une attente, les trois entrées, le chrono au travers du repère et la dérive triplée — sur la diapo, puis au simulateur.",
          ),
        },
      ],
      { minutes: 1, section: "overview" },
    ),
    L(
      "The aircraft flies the ARD hold in a loop. Ask the class: who has already been given a hold? What did ATC say? Then: by the end they will pick the entry at a glance and fly it in the simulator.",
      "L’avion vole l’attente d’ARD en boucle. Demandez à la classe : qui a déjà reçu une attente ? Qu’a dit le contrôle ? Puis : à la fin, ils choisiront l’entrée d’un coup d’œil et la voleront au simulateur.",
    ),
  );
}

function what(): Step {
  const title = L(
    "A hold: one lap, four minutes",
    "Une attente : un tour, quatre minutes",
  );
  return withNotes(
    slideStep(
      "h-what",
      title,
      slide("heroDiagram", [
        ...head(L("What a hold is", "Ce qu’est une attente"), title),
        DIAGRAM(
          "h-what.fly",
          flyD({ show: ["parts"] }),
          L(
            "The aircraft flies the racetrack at ARD: over the fix, turn right, outbound timed from abeam, turn right, one minute inbound to the fix",
            "L’avion vole l’hippodrome d’ARD : verticale du repère, virage à droite, éloignement chronométré depuis le travers, virage à droite, une minute en rapprochement vers le repère",
          ),
          GR.left,
          288,
          1680,
          696,
        ),
        foot(
          L("FAA AIM 5-3-8 · ICAO Doc 8168", "FAA AIM 5-3-8 · OACI Doc 8168"),
        ),
      ]),
      [
        {
          t: "text",
          text: L(
            "A hold is a racetrack around a fix: over the fix, a standard-rate turn to the outbound leg, one minute outbound timed from abeam the fix, a turn back, and one minute inbound to the fix, at or below 14,000 ft MSL (1½ minutes above). Standard holds turn right; left turns are always stated (FAA AIM 5-3-8). One lap takes about four minutes.",
            "Une attente est un hippodrome autour d’un repère : à la verticale, un virage au taux standard vers l’éloignement, une minute d’éloignement chronométrée depuis le travers du repère, un virage retour, et une minute de rapprochement vers le repère, jusqu’à 14 000 ft MSL (1 min 30 au-dessus, au-delà du FL140). L’attente standard se fait par la droite ; les virages à gauche sont toujours annoncés (FAA AIM 5-3-8). Un tour dure environ quatre minutes.",
          ),
        },
      ],
      { kind: "explain", minutes: 2, section: "picture" },
    ),
    L(
      "Let it fly one lap without talking, then pause (« Pause » under the drawing) at the abeam point: that is where the clock starts. Point at the four names: the fix, inbound one minute, outbound, abeam. « Rejouer » to fly it again.",
      "Laissez voler un tour sans parler, puis mettez en pause (« Pause » sous le schéma) au travers : c’est là que part le chrono. Montrez les quatre noms : le repère, le rapprochement d’une minute, l’éloignement, le travers. « Rejouer » pour revoler.",
    ),
  );
}

/** The entries trainer: the student sets three arrival headings; each sector lights up and its entry is flown. */
function entryTry(): Step {
  const title = L(
    "Set the heading: which entry?",
    "Réglez le cap : quelle entrée ?",
  );
  return withNotes(
    slideStep(
      "h-entry-try",
      title,
      slide("yourTurn", [
        ...head(L("Your turn", "À vous"), title),
        DIAGRAM(
          "h-entry-try.fly",
          flyD(
            {
              show: ["sectors"],
              crs: 270,
              goals: [...TRAINER_GOALS],
              speed: 14,
            },
            ["crs"],
          ),
          L(
            "The ARD hold with its three entry sectors. Set the arrival heading: the aircraft flies the entry of its sector. Goals: headings 050, 180 and 300",
            "L’attente d’ARD et ses trois secteurs d’entrée. Réglez le cap d’arrivée : l’avion vole l’entrée de son secteur. Objectifs : caps 050, 180 et 300",
          ),
          GR.left,
          288,
          1680,
          696,
          {
            interactive: true,
            caption: L(
              "Set the heading (drag the aircraft, or −10° / +10°), then pick the entry",
              "Réglez le cap (déplacez l’avion, ou −10° / +10°), puis choisissez l’entrée",
            ),
          },
        ),
        foot(L("FAA AIM 5-3-8 · FIG 5-3-8", "FAA AIM 5-3-8 · FIG 5-3-8")),
      ]),
      [
        {
          t: "text",
          text: L(
            "Set the arrival heading to the fix (drag the aircraft round ARD, or −10° / +10°), then say which entry it takes: Direct, Teardrop or Parallel. The aircraft waits for your answer; the right one lights the sector and the aircraft flies the entry. Do it for 050, 180 and 300.",
            "Réglez le cap d’arrivée vers le repère (déplacez l’avion autour d’ARD, ou −10° / +10°), puis dites quelle entrée il demande : Directe, Décalée ou Parallèle. L’avion attend votre réponse ; la bonne allume le secteur et l’avion vole l’entrée. Faites-le pour 050, 180 et 300.",
          ),
        },
      ],
      { kind: "try", minutes: 3, section: "technique" },
    ),
    L(
      "Hand the slide to a student (or let each one try on their own screen). For each heading the entry stays hidden until someone picks it: let the class call it out loud first, then pick. A right pick ticks the row and the aircraft flies the entry; a wrong one shows the lines to read again.",
      "Confiez la diapo à un élève (ou laissez chacun essayer sur son écran). Pour chaque cap, l’entrée reste cachée jusqu’à ce qu’on la choisisse : faites-la annoncer à voix haute par la classe, puis choisissez. Une bonne réponse coche la ligne et l’avion vole l’entrée ; une mauvaise fait ressortir les lignes à relire.",
    ),
  );
}

/** The presenter flies an entry for the class: the heading the class calls, the entry and its stopwatch. */
function demo(): Step {
  const title = L(
    "Demonstration: the teardrop entry",
    "Démonstration : l’entrée décalée",
  );
  return withNotes(
    slideStep(
      "h-demo",
      title,
      slide("heroDiagram", [
        ...head(L("Demonstration", "Démonstration"), title),
        DIAGRAM(
          "h-demo.fly",
          flyD({ show: ["sectors", "clock"], crs: 50 }, ["crs"]),
          L(
            "Arrival on heading 050 to ARD: over the fix, heading 060 for one minute from the fix, then a right turn to intercept the 270 inbound course",
            "Arrivée au cap 050 vers ARD : à la verticale, cap 060 pendant une minute depuis le repère, puis virage à droite pour intercepter la route de rapprochement 270",
          ),
          GR.left,
          288,
          1680,
          696,
          {
            interactive: true,
            caption: L(
              "The presenter sets the heading the class calls out",
              "L’instructeur règle le cap annoncé par la classe",
            ),
          },
        ),
        foot(
          L("FAA AIM 5-3-8 · FAA IFH ch. 10", "FAA AIM 5-3-8 · FAA IFH ch. 10"),
        ),
      ]),
      [
        {
          t: "text",
          text: L(
            "Arriving on heading 050: the teardrop sector. Over ARD, take heading 060 (30° off the outbound course, on the holding side) and start the clock; after one minute turn right, in the direction of the hold, and intercept the 270 inbound course back to the fix. Then the hold goes on with right turns.",
            "Arrivée au cap 050 : le secteur de l’entrée décalée. À la verticale d’ARD, prenez le cap 060 (30° de l’axe d’éloignement, côté attente) et lancez le chrono ; après une minute, virez à droite, dans le sens de l’attente, et interceptez la route de rapprochement 270 jusqu’au repère. L’attente continue ensuite par la droite.",
          ),
        },
      ],
      { kind: "explain", minutes: 3, section: "technique" },
    ),
    L(
      "Fly it for the class: say each action as the aircraft does it — « verticale ARD, cap 060, top chrono… une minute, virage à droite… interception du 270 ». Pause at each one. Then ask for another heading and set it with −10° / +10°: a parallel (180), a direct (300).",
      "Volez-la pour la classe : dites chaque action au moment où l’avion la fait — « verticale ARD, cap 060, top chrono… une minute, virage à droite… interception du 270 ». Mettez en pause à chacune. Puis demandez un autre cap et réglez-le avec −10° / +10° : une parallèle (180), une directe (300).",
    ),
  );
}

function timingSlide(): Step {
  const title = L(
    "Start the clock abeam the fix",
    "Top chrono au travers du repère",
  );
  return withNotes(
    slideStep(
      "h-timing",
      title,
      slide("heroDiagram", [
        ...head(L("Timing", "Chronométrage"), title),
        DIAGRAM(
          "h-timing.fly",
          flyD({
            show: ["clock"],
            windDir: TIMING_WIND[0],
            windKt: TIMING_WIND[1],
            outS: "auto",
          }),
          L(
            `The stopwatch starts abeam ARD on the outbound leg; with ${TIMING_WIND[1]} kt on the nose inbound, a shorter outbound leg gives one minute inbound`,
            `Le chrono part au travers d’ARD en éloignement ; avec ${TIMING_WIND[1]} kt de face en rapprochement, un éloignement plus court donne une minute de rapprochement`,
          ),
          GR.left,
          288,
          1032,
          696,
          {
            caption: L(
              `Wind ${pad3(TIMING_WIND[0])}/${TIMING_WIND[1]} · 90 KTAS · north up`,
              `Vent ${pad3(TIMING_WIND[0])}/${TIMING_WIND[1]} · 90 kt Vp · nord en haut`,
            ),
          },
        ),
        ...pointRows(
          [
            {
              heading: L("Abeam: start the clock", "Au travers : top chrono"),
              body: L(
                "outbound, when the fix is square to your left or right (wings level, if later).",
                "en éloignement, quand le repère passe à 90° (ailes à plat, si c’est plus tard).",
              ),
              color: "key",
            },
            {
              heading: L("1 min up to FL140", "1 min jusqu’au FL140"),
              body: L(
                "the inbound leg: 1 min at or below 14,000 ft, 1 min 30 above.",
                "la branche de rapprochement : 1 min jusqu’à 14 000 ft, 1 min 30 au-dessus.",
              ),
              color: "sel",
            },
            {
              heading: L("Adjust the outbound time", "Ajustez l’éloignement"),
              body: L(
                "time the inbound leg; too long by 20 s → 20 s less outbound.",
                "mesurez le rapprochement ; 20 s de trop → 20 s de moins en éloignement.",
              ),
            },
          ],
          { x: 1272, w: 528, pitch: 224 },
        ),
        foot(
          L(
            "FAA AIM 5-3-8 · ICAO Doc 8168 · FAA IFH ch. 10",
            "FAA AIM 5-3-8 · OACI Doc 8168 · FAA IFH ch. 10",
          ),
        ),
      ]),
      [
        {
          t: "text",
          text: L(
            "Outbound timing starts over or abeam the fix, whichever is later; if abeam cannot be determined, when the turn outbound is complete (FAA AIM 5-3-8). Adjust the outbound leg so that the inbound leg takes 1 minute at or below 14,000 ft MSL, 1½ minutes above (ICAO: up to FL140). Time the inbound leg and correct the next outbound leg by the error, the other way (FAA IFH ch. 10).",
            "Le chrono d’éloignement part à la verticale ou au travers du repère, le plus tardif des deux ; si le travers n’est pas identifiable, en fin de virage (FAA AIM 5-3-8). Ajustez l’éloignement pour que le rapprochement dure 1 minute jusqu’à 14 000 ft MSL, 1 min 30 au-dessus (OACI : jusqu’au FL140). Mesurez le rapprochement et corrigez l’éloignement suivant de l’écart, en sens inverse (FAA IFH ch. 10).",
          ),
        },
      ],
      { kind: "explain", minutes: 2, section: "technique" },
    ),
    L(
      "Watch the stopwatch: it stays at 0:00 through the turn and starts at the orange dot, abeam ARD. With the wind on the nose inbound the inbound leg is slow, so the outbound leg is shortened (shown under the stopwatch). Reveal the three rows one by one.",
      "Regardez le chrono : il reste à 0:00 dans le virage et part au point orange, au travers d’ARD. Avec le vent de face en rapprochement, le rapprochement est lent : l’éloignement est donc raccourci (affiché sous le chrono). Dévoilez les trois lignes une à une.",
    ),
  );
}

function timingQuiz(): Step {
  const { in1, out2, refined } = timingNumbers();
  const err = in1 - 60;
  const title = L(
    `1:00 outbound gave ${mmss(in1)} inbound. Next outbound time?`,
    `1:00 d’éloignement a donné ${mmss(in1)} de rapprochement. Éloignement suivant ?`,
  );
  return withNotes(
    slideStep(
      "h-timing-quiz",
      title,
      slide("quiz", [
        ...head(L("Question", "Question"), title, 960),
        QUIZ(
          "h-timing-quiz.q",
          {
            kind: "mcq",
            prompt: L(
              `Wind on the nose inbound, ${TIMING_WIND[1]} kt. Choose one answer`,
              `Vent de face en rapprochement, ${TIMING_WIND[1]} kt. Choisissez une réponse`,
            ),
            options: [
              {
                text: L(mmss(60 + err), mmss(60 + err)),
                why: L(
                  "The wrong way: a longer outbound leg makes the slow inbound leg longer still.",
                  "Dans le mauvais sens : un éloignement plus long allonge encore le rapprochement, déjà lent.",
                ),
              },
              {
                text: L(mmss(out2), mmss(out2)),
                why: L(
                  `Right: ${err} s too long inbound, so ${err} s less outbound → ${mmss(out2)}. A first correction: the next lap refines it (about ${mmss(refined)}, as on the previous slide), because the turns drift too.`,
                  `Juste : ${err} s de trop en rapprochement, donc ${err} s de moins en éloignement → ${mmss(out2)}. C’est une première correction : le tour suivant l’affine (≈ ${mmss(refined)}, comme sur la diapo précédente), car les virages dérivent aussi.`,
                ),
              },
              {
                text: L("1:00", "1:00"),
                why: L(
                  "The inbound leg would stay too long: the outbound leg is what you adjust.",
                  "Le rapprochement resterait trop long : c’est l’éloignement que l’on ajuste.",
                ),
              },
            ],
            answer: 1,
            explain: L(
              `Correct the outbound leg by the inbound error, the other way: ${mmss(out2)}. Then refine lap by lap (about ${mmss(refined)} here).`,
              `Corrigez l’éloignement de l’écart du rapprochement, en sens inverse : ${mmss(out2)}. Puis affinez tour après tour (≈ ${mmss(refined)} ici).`,
            ),
          },
          GR.left,
          408,
          960,
          560,
        ),
        DIAGRAM(
          "h-timing-quiz.fly",
          flyD({
            show: ["clock"],
            windDir: TIMING_WIND[0],
            windKt: TIMING_WIND[1],
            outS: 60,
          }),
          L(
            `The first lap with 1:00 outbound and ${TIMING_WIND[1]} kt on the nose inbound: the inbound leg takes about ${mmss(in1)}`,
            `Le premier tour avec 1:00 d’éloignement et ${TIMING_WIND[1]} kt de face en rapprochement : le rapprochement dure environ ${mmss(in1)}`,
          ),
          1176,
          288,
          624,
          696,
        ),
        foot(
          L("FAA IFH ch. 10 · FAA AIM 5-3-8", "FAA IFH ch. 10 · FAA AIM 5-3-8"),
        ),
      ]),
      [{ t: "text", text: title }],
      { kind: "quiz", minutes: 2, section: "check" },
    ),
    L(
      `Let the class answer before anyone taps. The drawing flies the first lap: watch the inbound stopwatch reach about ${mmss(in1)}. Those who choose ${mmss(60 + err)} add the error instead of taking it off: ask them which leg is too long. ${mmss(out2)} is the rule of thumb, a first correction; the previous slide flew about ${mmss(refined)}, what the next lap refines it to (the turns drift too).`,
      `Laissez la classe répondre avant que quelqu’un touche. Le schéma vole le premier tour : regardez le chrono de rapprochement atteindre environ ${mmss(in1)}. Ceux qui choisissent ${mmss(60 + err)} ajoutent l’écart au lieu de le retirer : demandez-leur quelle branche est trop longue. ${mmss(out2)} est la règle pratique, une première correction ; la diapo précédente volait environ ${mmss(refined)}, ce que le tour suivant affine (les virages dérivent aussi).`,
    ),
  );
}

function windFly(): Step {
  const title = L(
    "Wind: triple the drift outbound",
    "Vent : triplez la dérive en éloignement",
  );
  const drift = Math.round(Math.abs(wca(HOLD.inbound, 90, 360, 25)));
  const outHdg = outboundHeading(HOLD.inbound, 90, 360, 25);
  return withNotes(
    slideStep(
      "h-wind",
      title,
      slide("heroDiagram", [
        ...head(L("Wind correction", "Correction de vent"), title),
        DIAGRAM(
          "h-wind.fly",
          flyD({ show: ["headings"], windDir: 360, windKt: 25 }, ["wind"]),
          L(
            `The hold at ARD in a north wind of 25 kt: inbound heading ${pad3(270 + drift)}, ${drift}° into the wind; outbound heading ${pad3(outHdg)}, three times that`,
            `L’attente d’ARD par vent du nord de 25 kt : cap de rapprochement ${pad3(270 + drift)}, ${drift}° côté vent ; cap d’éloignement ${pad3(outHdg)}, trois fois plus`,
          ),
          GR.left,
          288,
          1104,
          696,
          {
            interactive: true,
            caption: L(
              "Drag the wind: the headings and the racetrack follow",
              "Déplacez le vent : les caps et l’hippodrome suivent",
            ),
          },
        ),
        // the rules in words: the numbers are the drawing's, whatever wind the presenter sets
        ...pointRows(
          [
            {
              heading: L(
                "Inbound: the correction that holds the course",
                "Rapprochement : la correction qui tient l’axe",
              ),
              body: L(
                "into the wind, found on the instrument.",
                "côté vent, trouvée sur l’instrument.",
              ),
              color: "sel",
            },
            {
              heading: L(
                "Outbound: 3 × that correction",
                "Éloignement : 3 × cette correction",
              ),
              body: L(
                "the two turns drift too: the outbound leg makes up for them.",
                "les deux virages dérivent aussi : l’éloignement les rattrape.",
              ),
              color: "key",
            },
            {
              heading: L(
                "For a 1:00 outbound leg",
                "Pour un éloignement d’1 min",
              ),
              body: L(
                "a longer outbound leg needs less: about × 2.",
                "un éloignement plus long en demande moins : ≈ × 2.",
              ),
            },
          ],
          { x: 1296, w: 504, pitch: 224, bodyH: 112 },
        ),
        foot(
          L("FAA AIM 5-3-8 · FAA IFH ch. 10", "FAA AIM 5-3-8 · FAA IFH ch. 10"),
          1104,
        ),
      ]),
      [
        {
          t: "text",
          text: L(
            `Inbound, find the correction that holds the course; outbound, apply three times that correction, into the wind (FAA AIM 5-3-8; FAA IFH ch. 10). With a wind of 360/25 at 90 kt: inbound heading ${pad3(270 + drift)}, outbound heading ${pad3(outHdg)}. Three, because the two turns drift as well and the one-minute outbound leg is the only place to make it up.`,
            `En rapprochement, trouvez la correction qui tient la route ; en éloignement, appliquez trois fois cette correction, côté vent (FAA AIM 5-3-8 ; FAA IFH ch. 10). Avec un vent 360/25 à 90 kt : cap ${pad3(270 + drift)} en rapprochement, ${pad3(outHdg)} en éloignement. Trois, parce que les deux virages dérivent eux aussi et que la minute d’éloignement est le seul endroit où le rattraper.`,
          ),
        },
      ],
      { kind: "explain", minutes: 3, section: "technique" },
    ),
    L(
      "Change the wind live with the dial (top right of the drawing): put it on the nose, then from the south. Ask before each change where the racetrack will drift. The headings follow: the outbound correction is always three times the inbound one, into the wind.",
      "Changez le vent en direct avec le cadran (en haut à droite du schéma) : mettez-le de face, puis du sud. Avant chaque changement, demandez de quel côté l’hippodrome va dériver. Les caps suivent : la correction d’éloignement vaut toujours trois fois celle du rapprochement, côté vent.",
    ),
  );
}

function simStep(): Step {
  return withNotes(
    simFlightStep({
      id: "h-sim",
      title: L(
        "In the simulator: the turn at the fix and the outbound leg",
        "Au simulateur : virage au repère et éloignement",
      ),
      brief: L(
        "In the published ARD hold (inbound 270, right turns) at 3,000 ft, 2 NM before the fix. Over ARD, turn right to **090**, start the clock abeam and hold the outbound leg. Then finish the lap: **1:00**, turn right and back to the fix.",
        "Dans l’attente publiée d’ARD (rapprochement 270, virages à droite) à 3 000 ft, à 2 NM du repère. À la verticale d’ARD, virez à droite au **090**, top chrono au travers et tenez l’éloignement. Puis finissez le tour : **1:00**, virez à droite et revenez au repère.",
      ),
      scene: "hold.sim",
      alt: L(
        "The simulator’s cockpit on the inbound leg of the ARD hold, heading 270",
        "Le cockpit du simulateur sur la branche de rapprochement de l’attente d’ARD, cap 270",
      ),
      prompt: L(
        "Cross ARD, turn outbound and hold heading 090 at 3,000 ft",
        "Passez ARD, virez en éloignement et tenez le cap 090 à 3 000 ft",
      ),
      goal: [G.passed(HOLD.fix), G.heading(90, 10), G.alt(2900, 3100)],
      holdS: 30,
      durationS: 300,
      success: L(
        "Outbound in the hold: heading 090, 3,000 ft. Finish the lap: one minute, then inbound.",
        "En éloignement dans l’attente : cap 090, 3 000 ft. Finissez le tour : une minute, puis le rapprochement.",
      ),
      source: L("FAA AIM 5-3-8", "FAA AIM 5-3-8"),
      notes: L(
        "About five minutes. To show it first: « Ouvrir le simulateur », fly the turn at the fix and the outbound leg, say « top chrono » abeam, then « Reprendre le cours ».",
        "Environ cinq minutes. Pour le montrer d’abord : « Ouvrir le simulateur », volez le virage au repère et l’éloignement, dites « top chrono » au travers, puis « Reprendre le cours ».",
      ),
    }),
    L(
      "About five minutes. To show it first: « Ouvrir le simulateur », fly the turn at the fix and the outbound leg, say « top chrono » abeam, then « Reprendre le cours ».",
      "Environ cinq minutes. Pour le montrer d’abord : « Ouvrir le simulateur », volez le virage au repère et l’éloignement, dites « top chrono » au travers, puis « Reprendre le cours ».",
    ),
  );
}

/** The holding sample (18 steps): each idea shown flown, then the student does it; the simulator; Fly it. */
export function holdingCourse(): Course {
  const steps: Step[] = [
    // what a hold is, the clearance read and set
    cover(),
    what(),
    withNotes(
      clearance(),
      L(
        "Read the clearance aloud, twice, as ATC would. Ask for the inbound course before anyone taps: the radial is flown outbound, so inbound is its reciprocal.",
        "Lisez la clairance à voix haute, deux fois, comme le contrôle. Demandez la route de rapprochement avant que quelqu’un touche : le radial se vole en éloignement, le rapprochement est son inverse.",
      ),
    ),
    withNotes(
      twist(),
      L(
        "The student turns the OBS on the HSI. If the flag reads FROM, they set the radial (090), not the inbound course: let them see it, then 270.",
        "L’élève tourne l’OBS du HSI. Si le drapeau lit FROM, il a affiché le radial (090), pas la route de rapprochement : laissez-le constater, puis 270.",
      ),
    ),
    // the entries: the sectors, the trainer, a question, the demonstration, the turn at the fix flown on the HSI
    withNotes(
      threeEntries(),
      L(
        "Reveal the three sectors one by one. The trick to say: draw the 70° line through the fix; it splits the arrivals in three. Within 5° of a line, either entry is fine.",
        "Dévoilez les trois secteurs un à un. L’astuce à dire : tracez la ligne des 70° par le repère ; elle partage les arrivées en trois. À 5° d’une ligne, l’une ou l’autre entrée convient.",
      ),
    ),
    entryTry(),
    withNotes(
      caseSlide("h-case-a", 130, true),
      L(
        "Arriving on heading 130: the class answers aloud first. The drawing then shows the sector. Those who say teardrop have read the heading as the position: the aircraft is north-west of the fix, flying south-east.",
        "Arrivée au cap 130 : la classe répond à voix haute d’abord. Le schéma montre ensuite le secteur. Ceux qui disent décalée ont lu le cap comme une position : l’avion est au nord-ouest du repère et vole vers le sud-est.",
      ),
    ),
    demo(),
    withNotes(
      fiveTs("h-five-ts", "hold.fix", 90, HSI, 270),
      L(
        "Live on the HSI: the student waits for the flag to flip over ARD, then turns right with the bank pad. Say the five Ts with them as they do it.",
        "En direct sur le HSI : l’élève attend la bascule du drapeau à la verticale d’ARD, puis vire à droite avec les boutons d’inclinaison. Dites les 5 T avec lui pendant qu’il le fait.",
      ),
    ),
    // timing: the clock abeam, the flag that shows it, a question with a headwind
    timingSlide(),
    withNotes(
      abeam(),
      L(
        "The HSI flies the outbound leg live: ask the class to say « top » when the flag flips. Then the question.",
        "Le HSI vole l’éloignement en direct : demandez à la classe de dire « top » quand le drapeau bascule. Puis la question.",
      ),
    ),
    timingQuiz(),
    // the wind: the rule shown with a wind the presenter changes, then the inbound heading flown on the HSI
    windFly(),
    withNotes(
      windTry(),
      L(
        "The student finds the inbound correction on the HSI with the top view: the track must read 270. Then ask: and outbound? Three times, into the wind.",
        "L’élève trouve la correction de rapprochement sur le HSI avec la vue de dessus : la route doit lire 270. Puis demandez : et en éloignement ? Trois fois plus, côté vent.",
      ),
    ),
    // the mistakes, the takeaways, the simulator, the full flight
    withNotes(
      mistakes(),
      L(
        "One mistake at a time. Ask who has already started the clock at the fix: it is the most common one.",
        "Une erreur à la fois. Demandez qui a déjà lancé le chrono au repère : c’est la plus fréquente.",
      ),
    ),
    withNotes(
      recap(),
      L(
        "Three numbers to leave with: 1:00 inbound, × 3 the drift outbound, 230 kt at most. Then straight to the simulator.",
        "Trois chiffres à retenir : 1:00 en rapprochement, × 3 la dérive en éloignement, 230 kt au plus. Puis direction le simulateur.",
      ),
    ),
    simStep(),
    withNotes(
      flyHold(flyBriefing()),
      L(
        "The full lesson: three laps at ARD in a strong wind, graded on the entry, the timing and the altitude. Compare the inbound times lap by lap in the debrief.",
        "La leçon complète : trois tours à ARD par vent fort, notés sur l’entrée, le chronométrage et l’altitude. Comparez les temps de rapprochement tour par tour au débriefing.",
      ),
    ),
  ];
  const c = course(
    {
      id: HOLDING_ID,
      title: L(
        "Holding: entries, timing and wind",
        "L’attente : entrées, chronométrage et vent",
      ),
      summary: L(
        "What a hold is, the three entries flown on the slide, the stopwatch from abeam and the triple-drift rule — then one lap in the simulator and three laps at ARD in a strong wind.",
        "Ce qu’est une attente, les trois entrées volées sur la diapo, le chrono au travers et la dérive triplée — puis un tour au simulateur et trois tours à ARD par vent fort.",
      ),
      cockpit: "steam",
      theme: "classroom",
      tags: ["ifr", "holding", "entries", "wind"],
      minutes: 40,
    },
    steps,
    holdingScenes(),
  );
  return { ...c, stepAliases: { ...HOLDING_STEP_ALIASES } };
}
/** The steps of the earlier holding course, and the step of this one that took each one's place. */
export const HOLDING_STEP_ALIASES: Record<string, string> = {
  "h-drag": "h-entry-try",
  "h-teardrop-fly": "h-demo",
  "h-timing-calc": "h-timing-quiz",
  "h-drill": "h-sim",
  "h-why": "h-what",
  "h-anatomy": "h-what",
  "h-case-b": "h-case-a",
  "h-case-c": "h-case-a",
};
