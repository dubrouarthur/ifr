// Ground school — built-in sample "Holding: entries, timing and wind" (20 steps, steam cockpit, hold at ARD
// inbound 270, right turns). The hold-ndb lesson's briefing is a crafted deck (samples/briefings/holdNdb.ts). Slides first: cover, why it matters, the clearance, the anatomy, the three entries, timing,
// wind and the five Ts on designed slides; then a section opener, the practice steps (speeds, sectors, entries,
// timing and wind calcs, a drill), the takeaways and Fly it. Every entry shown or checked comes from holdEntry()
// (nav/holding.ts, AIM FIG 5-3-8).
// Sources: FAA AIM 5-3-8 (holding: clearance items, entries, timing, maximum speeds, the 3-minute speed
// reduction), FAA-H-8083-15 Instrument Flying Handbook ch. 10 (holding, wind correction), ICAO Doc 8168
// PANS-OPS (5° entry tolerance), FAA-S-ACS-8 Instrument Rating ACS area III task B.
import type {
  Course,
  InstrumentView,
  L10n,
  PaneView,
  SimScene,
  SlideBlock,
  Step,
} from "../types";
import { holdEntry, type HoldEntry, type Turn } from "../../nav/holding";
import { solveHoldWind } from "../stage/diagramMath";
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
import {
  G as GR,
  bigNumberBlocks,
  coverBlocks,
  foot,
  head,
  pointRows,
  recapBlocks,
  rule,
  sectionBlocks,
  slide,
  stepRows,
} from "./navSlides";
export const HOLDING_ID = "sample-holding";

const HSI: InstrumentView = { kind: "gauge", gauge: "hsi" };
const HSI_PANE: PaneView = { kind: "six", crop: { region: "STEAM_LEFT:4" } };

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
    "hold.a": arriving("hold.a", "ARD", 50, "Course 050 to ARD · 8 NM"),
    "hold.b": arriving("hold.b", "ARD", 180, "Course 180 to ARD · 8 NM"),
    "hold.c": arriving("hold.c", "ARD", 300, "Course 300 to ARD · 8 NM"),
    "hold.drag": arriving(
      "hold.drag",
      "ARD",
      270,
      "Drag the aircraft round ARD",
    ),
    "hold.fix": scene(
      "hold.fix",
      {
        pos: { fix: "ARD", radial: 270, distNm: 0.2 },
        altFt: 3000,
        hdg: 270,
        iasKt: 90,
        radios: { nav1: "ARD", obs1: 270, cdi: "NAV1", brg1: "NAV1" },
      },
      { label: "Over ARD · heading 270 · direct entry" },
    ),
  };
}
// ------------------------------------------------------------------ shared step builders
/** An MCQ on the entry for an arrival course, answer and explanation from holdEntry(). */
function entryQuiz(
  id: string,
  fix: string,
  inbound: number,
  turn: Turn,
  crs: number,
  sceneId: string,
  pane: PaneView,
): Step {
  const e = holdEntry(inbound, turn, crs);
  const turns =
    turn === "R"
      ? L("right turns", "virages à droite")
      : L("left turns", "virages à gauche");
  return step(
    id,
    "quiz",
    L(
      `Which entry from course ${pad3(crs)}?`,
      `Quelle entrée depuis la route ${pad3(crs)} ?`,
    ),
    [
      {
        t: "text",
        text: L(
          `Hold at ${fix}, inbound ${pad3(inbound)}, ${turns.en}. You are tracking **${pad3(crs)}** to the fix. Find your sector on the diagram.`,
          `Attente à ${fix}, rapprochement ${pad3(inbound)}, ${F(turns)}. Vous suivez la route **${pad3(crs)}** vers le repère. Trouvez votre secteur sur le schéma.`,
        ),
      },
    ],
    {
      minutes: 1,
      quiz: {
        kind: "mcq",
        prompt: L("Which entry do you fly?", "Quelle entrée faites-vous ?"),
        options: ENTRIES.map((x) => ({
          text: ENTRY_NAME[x],
          why:
            x === e
              ? L(`Right: ${ENTRY_HOW[x].en}`, `Juste : ${F(ENTRY_HOW[x])}`)
              : L(
                  `Your course ${pad3(crs)} is not in the ${ENTRY_NAME[x].en.toLowerCase()} sector.`,
                  `Votre route ${pad3(crs)} n’est pas dans le secteur ${F(ENTRY_NAME[x]).toLowerCase()}.`,
                ),
        })),
        answer: ENTRIES.indexOf(e),
        explain: L(
          `From course ${pad3(crs)}: ${ENTRY_NAME[e].en.toLowerCase()} entry (FAA AIM 5-3-8). ${ENTRY_HOW[e].en}`,
          `Depuis la route ${pad3(crs)} : entrée ${F(ENTRY_NAME[e]).toLowerCase()} (FAA AIM 5-3-8). ${F(ENTRY_HOW[e])}`,
        ),
      },
      stage: {
        panes: [
          { kind: "diagram", d: { kind: "hold", inbound, turn, fix, crs } },
          pane,
        ],
        mode: "frozen",
        scene: sceneId,
      },
    },
  );
}

/** Entry names with their sector, for the slide quizzes (rows, never tiles: the names are long). */
const ENTRY_ROW: Record<HoldEntry, L10n> = {
  DIRECT: L("Direct · 180°", "Directe · 180°"),
  TEARDROP: L("Offset (teardrop) · 70°", "Décalée · 70°"),
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
          ...(x === e
            ? {
                why: L(
                  `Right: ${ENTRY_SHORT[x].en}`,
                  `Juste : ${F(ENTRY_SHORT[x])}`,
                ),
              }
            : {}),
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
        "at the fix on an entry; then abeam the fix",
        "au repère en entrée ; puis au travers du repère",
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
            `HSI over the fix, heading ${pad3(fromHdg)}: turn to ${pad3(outbound)}`,
            `HSI au-dessus du repère, cap ${pad3(fromHdg)} : virez au ${pad3(outbound)}`,
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
                `Your turn: over the fix, turn right to heading ${pad3(outbound)}`,
                `À vous : à la verticale du repère, virez à droite au cap ${pad3(outbound)}`,
              ),
              controls: ["bank"],
              assist: { holdAlt: true, holdIas: true },
              goal: {
                all: [G.heading(outbound, 10)],
                holdS: 3,
                graded: false,
                success: L(
                  "Outbound: now start the time abeam the fix.",
                  "En éloignement : déclenchez le chrono au travers du repère.",
                ),
              },
              hint: L(
                "Hold the R side of the bank pad.",
                "Maintenez le côté R des boutons d’inclinaison.",
              ),
            },
          },
        ),
        foot(
          L(
            "An instructors’ memory aid; some add a sixth: Track",
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
          "At the fix: Turn, Time, Twist, Throttle, Talk (some instructors add Track). Then turn outbound with the bank pad.",
          "Au repère : Virer, Chrono, Tourner (l’OBS), Puissance, Parler (certains ajoutent la route, Track). Puis virez en éloignement avec les boutons d’inclinaison L / R.",
        ),
      },
    ],
    { kind: "try", minutes: 2 },
  );
}

// ------------------------------------------------------------------ the course slides (part 1: understand)
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
          "Read the clearance, pick the entry, time it, correct for the wind — then fly the hold at ARD.",
          "Lire la clairance, choisir l’entrée, chronométrer, corriger le vent — puis voler l’attente à ARD.",
        ),
        meta: L(
          "20 steps · about 45 min · FAA AIM 5-3-8 · FAA IFH ch. 10",
          "20 étapes · environ 45 min · FAA AIM 5-3-8 · FAA IFH ch. 10",
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
  const speeds: [string, string, string][] = [
    ["200", "KIAS · up to 6,000 ft MSL", "KIAS · jusqu’à 6 000 ft MSL"],
    ["230", "KIAS · 6,001 to 14,000 ft", "KIAS · de 6 001 à 14 000 ft"],
    ["265", "KIAS · above 14,000 ft", "KIAS · au-dessus de 14 000 ft"],
  ];
  return slideStep(
    "h-why",
    L("A hold comes with little warning", "L’attente arrive sans prévenir"),
    slide("bigNumber", [
      ...head(
        L("Why it matters", "Pourquoi c’est important"),
        L("A hold comes with little warning", "L’attente arrive sans prévenir"),
      ),
      ...bigNumberBlocks({
        n: L("3", "3"),
        nW: 152,
        unit: L("min", "min"),
        statement: L(
          "from the clearance limit: slow down",
          "avant la limite d’autorisation : ralentissez",
        ),
        body: L(
          "With no clearance beyond the fix, cross it at or below the maximum holding speed, then hold as charted.",
          "Sans clairance au-delà du repère, croisez-le à la vitesse d’attente maximale ou en dessous, puis attendez comme publié.",
        ),
      }),
      T(
        "eyebrow",
        L("Maximum speeds (FAA)", "Vitesse maximale (FAA)"),
        1272,
        312,
        528,
        32,
        { color: "muted" },
      ),
      ...speeds.flatMap(([n, en, fr], i): SlideBlock[] => {
        const y = 376 + i * 184;
        return [
          rule(1272, y, 528),
          T("number", L(n, n), 1272, y + 24, 264, 96, {
            color: i === 0 ? "key" : "text",
          }),
          T("small", L(en, fr), 1272, y + 124, 528, 40),
        ];
      }),
      foot(
        L(
          "FAA AIM 5-3-8 · ICAO speeds (Doc 8168) differ",
          "FAA AIM 5-3-8 · les vitesses OACI (Doc 8168) diffèrent",
        ),
      ),
    ]),
    [
      {
        t: "text",
        text: L(
          "When you are 3 minutes or less from a clearance limit and have no clearance beyond it, start slowing so that you cross the fix at or below the maximum holding speed; if the hold is charted and the controller gives no other instructions, hold as charted (FAA AIM 5-3-8). FAA maximum holding speeds: 200 KIAS up to 6,000 ft MSL, 230 KIAS from 6,001 to 14,000 ft, 265 KIAS above 14,000 ft. The checkride asks for the same (FAA-S-ACS-8, area III, task B).",
          "À 3 minutes ou moins d’une limite d’autorisation, sans clairance au-delà, commencez à ralentir pour croiser le repère à la vitesse d’attente maximale ou en dessous ; si l’attente est publiée et que le contrôleur ne donne pas d’autre instruction, attendez comme publié (FAA AIM 5-3-8). Vitesses d’attente maximales FAA : 200 KIAS jusqu’à 6 000 ft MSL, 230 KIAS de 6 001 à 14 000 ft, 265 KIAS au-dessus de 14 000 ft. Le test en vol demande la même chose (FAA-S-ACS-8, domaine III, tâche B).",
        ),
      },
    ],
    { minutes: 1 },
  );
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
          "« Attendez à l’est d’ARD sur le radial 090, maintenez 3 000 ft, autorisation ultérieure prévue à 1430. »",
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
            "timed so that the inbound leg lasts 1:00.",
            "chronométré pour que le rapprochement dure 1:00.",
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
          "A hold has a fix, an inbound leg of 1 minute at or below 14,000 ft MSL (1½ min above), an outbound leg timed to make the inbound leg right, and a holding side. Standard holds turn right; left turns are always stated (FAA AIM 5-3-8).",
          "Une attente comprend un repère, une branche de rapprochement de 1 minute jusqu’à 14 000 ft MSL (1 min 30 au-dessus), une branche d’éloignement chronométrée pour obtenir le bon rapprochement, et un côté attente. Une attente standard se fait par la droite ; les virages à gauche sont toujours précisés (FAA AIM 5-3-8).",
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
          heading: L("2 · Offset · 70°", "2 · Décalée · 70°"),
          body: L(
            "The teardrop: at the fix, 30° off on the holding side, 1 min, then turn.",
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
          "Parallel (110° sector), teardrop or offset (70°) and direct (180°), measured from the inbound course (FAA AIM 5-3-8). Within 5° of a boundary, either entry is acceptable (ICAO PANS-OPS, Doc 8168).",
          "Parallèle (secteur de 110°), décalée ou « goutte d’eau » (70°) et directe (180°), mesurés depuis la route de rapprochement (FAA AIM 5-3-8). À 5° près d’une limite, les deux entrées sont acceptables (OACI PANS-OPS, Doc 8168).",
        ),
      },
    ],
    { kind: "explain", minutes: 3 },
  );
}

function caseSlide(): Step {
  const crs = 300;
  const e = holdEntry(HOLD.inbound, HOLD.turn, crs);
  return slideStep(
    "h-case-c",
    L(`Arriving on course ${pad3(crs)}`, `Arrivée au ${pad3(crs)}`),
    slide(
      "quiz",
      entryPredict({
        id: "h-case-c",
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
        diagramLeft: false,
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
  const sol = solveHoldWind(HOLD.inbound, 270, 20, 90, 60);
  const out = mmss(sol.outboundS);
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
            windKt: 20,
            tasKt: 90,
          },
        },
        L(
          "Hold at ARD with a 20 kt headwind on the inbound leg",
          "Attente à ARD avec 20 kt de vent de face en rapprochement",
        ),
        GR.left,
        288,
        960,
        696,
        {
          caption: L(
            "Wind 270/20 · 90 KTAS · drawn inbound-up",
            "Vent 270/20 · 90 kt Vp · rapprochement vers le haut",
          ),
        },
      ),
      ...pointRows([
        {
          heading: L("Start abeam the fix", "Top au travers du repère"),
          body: L(
            "or over it, whichever is later; else when the turn outbound ends.",
            "ou à la verticale, le plus tardif ; sinon en fin de virage.",
          ),
          color: "nav",
        },
        {
          heading: L("Time the inbound leg", "Mesurez le rapprochement"),
          body: L(
            "from the end of the turn to the fix: aim for 1:00.",
            "de la fin du virage au repère : visez 1:00.",
          ),
          color: "sel",
        },
        {
          heading: L(`Here: ${out} outbound`, `Ici : ${out} en éloignement`),
          body: L(
            "Headwind inbound, tailwind outbound: shorten the outbound leg.",
            "Vent de face au retour, arrière à l’aller : raccourcissez l’éloignement.",
          ),
          color: "key",
        },
      ]),
      foot(
        L(
          "FAA AIM 5-3-8 · 1:30 inbound above 14,000 ft MSL",
          "FAA AIM 5-3-8 · 1:30 en rapprochement au-dessus de 14 000 ft MSL",
        ),
      ),
    ]),
    [
      {
        t: "text",
        text: L(
          `Outbound timing starts over or abeam the fix, whichever is later; if abeam cannot be determined, when the turn outbound is complete. Adjust the outbound leg so the inbound leg takes 1 minute (1½ above 14,000 ft MSL) (FAA AIM 5-3-8). With 270/20 at 90 KTAS the ground speeds are about ${Math.round(sol.gsIn)} kt inbound and ${Math.round(sol.gsOut)} kt outbound: about ${out} outbound gives 1:00 inbound (turns ignored).`,
          `Le chrono d’éloignement part à la verticale ou au travers du repère, le plus tardif des deux ; si le travers n’est pas identifiable, en fin de virage. Ajustez l’éloignement pour que le rapprochement dure 1 minute (1 min 30 au-dessus de 14 000 ft MSL) (FAA AIM 5-3-8). Avec 270/20 à 90 kt de Vp, les vitesses sol sont d’environ ${Math.round(sol.gsIn)} kt au retour et ${Math.round(sol.gsOut)} kt à l’aller : environ ${out} d’éloignement donnent 1:00 en rapprochement (virages non comptés).`,
        ),
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

function windSlide(): Step {
  const w: [number, number] = [360, 25];
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
            `With 360/25 at 90 kt: ${d}° into the wind holds the course.`,
            `Avec 360/25 à 90 kt : ${d}° face au vent tiennent la route.`,
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
            "The turns at each end spend time in the wind too.",
            "Les virages aux extrémités passent eux aussi du temps dans le vent.",
          ),
        },
      ]),
      foot(L("FAA IFH ch. 10", "FAA IFH ch. 10")),
    ]),
    [
      {
        t: "text",
        text: L(
          `Inbound, find the correction that holds the course; outbound, apply three times that correction (FAA IFH ch. 10). With 360/25 at 90 KTAS: inbound heading ${pad3(inHdg)}, outbound heading ${pad3(outHdg)}.`,
          `En rapprochement, trouvez la correction qui tient la route ; en éloignement, appliquez trois fois cette correction (FAA IFH ch. 10). Avec 360/25 à 90 kt : cap ${pad3(inHdg)} en rapprochement, ${pad3(outHdg)} en éloignement.`,
        ),
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

/** Part 2 of 3: the practice opens here (section opener). */
function practice(): Step {
  return slideStep(
    "h-practice",
    L("Your turn to practise", "À vous de vous entraîner"),
    slide(
      "section",
      sectionBlocks({
        n: 2,
        of: 3,
        title: L("Your turn to practise", "À vous de vous entraîner"),
        lead: L(
          "Speeds, sectors, entries, timing and wind: problem after problem, then the hold in flight.",
          "Vitesses, secteurs, entrées, chrono et vent : problème après problème, puis l’attente en vol.",
        ),
        items: [
          L("Understand", "Comprendre"),
          L("Practise", "S’entraîner"),
          L("Fly it at ARD", "Voler à ARD"),
        ],
      }),
    ),
    [
      {
        t: "text",
        text: L(
          "Part 2: the holding numbers, problem after problem — then the hold in flight.",
          "Partie 2 : les chiffres de l’attente, problème après problème — puis l’attente en vol.",
        ),
      },
    ],
    { minutes: 1 },
  );
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
            n: L("200", "200"),
            text: L(
              "KIAS at most, up to 6,000 ft MSL (FAA)",
              "KIAS au maximum jusqu’à 6 000 ft MSL (FAA)",
            ),
          },
        ],
        checksTitle: L("Every lap", "À chaque tour"),
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
      foot(L("FAA AIM 5-3-8 · FIG 5-3-8", "FAA AIM 5-3-8 · FIG 5-3-8")),
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
            "Maximum 200 KIAS up to 6,000 ft MSL (FAA).",
            "200 KIAS maximum jusqu’à 6 000 ft MSL (FAA).",
          ),
        ],
      },
    ],
    { minutes: 1 },
  );
}
// ------------------------------------------------------------------ part 2: practice steps
function holdSpeed(): Step {
  return step(
    "h-speed",
    "calc",
    L("How fast may I hold?", "À quelle vitesse attendre ?"),
    [
      {
        t: "formula",
        formula: L(
          "FAA: 200 KIAS up to 6,000 ft MSL · 230 KIAS 6,001–14,000 ft · 265 KIAS above 14,000 ft",
          "FAA : 200 KIAS jusqu’à 6 000 ft MSL · 230 KIAS de 6 001 à 14 000 ft · 265 KIAS au-dessus de 14 000 ft",
        ),
        ruleOfThumb: L(
          "A light single holds at its normal approach-preparation speed, far below the limit.",
          "Un monomoteur léger attend à sa vitesse de préparation d’approche, bien en dessous de la limite.",
        ),
        refs: [
          { src: "FAA-AIM", ref: "5-3-8" },
          { src: "ICAO Doc 8168", ref: "Vol I" },
        ],
      },
    ],
    { minutes: 2, calc: { generatorId: "ifr.holdSpeed" } },
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
              "The teardrop sector is the 70° on the non-holding side, before the fix on the inbound end: here, south-west of ARD (radials 200–270).",
              "Le secteur de l’entrée décalée est le secteur de 70° côté non-attente, en amont du repère : ici, au sud-ouest d’ARD (radiales 200 à 270).",
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
          HSI_PANE,
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
  return step(
    "h-fly",
    "fly",
    L(
      "Fly it: the ARD hold in a strong wind",
      "À vous : l’attente d’ARD par vent fort",
    ),
    [],
    {
      minutes: 12,
      flyIt: {
        target: { kind: "lesson", exerciseId: "hold-wind" },
        brief: L(
          "Join the ARD hold (inbound 270, right turns) at 3,000 ft and fly three laps with the wind from the north at 25 kt. The lesson grades the entry, the timing and the altitude.",
          "Rejoignez l’attente d’ARD (rapprochement 270, virages à droite) à 3 000 ft et faites trois tours, vent du nord pour 25 kt. La leçon note l’entrée, le chronométrage et l’altitude.",
        ),
        keys: [
          L(
            "Triple the inbound correction on the outbound leg.",
            "Triplez la correction de rapprochement en éloignement.",
          ),
          L(
            "Adjust the outbound time after each lap.",
            "Ajustez le temps d’éloignement après chaque tour.",
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
  const w: [number, number] = [360, 25];
  const outHdg = outboundHeading(HOLD.inbound, 90, w[0], w[1]);
  const noTriple = Math.round(wrap360(90 + wca(90, 90, w[0], w[1])));
  const wrongSide = Math.round(wrap360(90 - (outHdg - 90)));
  const e = holdEntry(HOLD.inbound, HOLD.turn, 270);
  const opts = [outHdg, noTriple, wrongSide];
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
          options: ENTRIES.map((x) => ({ text: ENTRY_NAME[x] })),
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
                crs: 270,
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
            "Wind 360/25, 90 KTAS. Outbound course 090.",
            "Vent 360/25, 90 kt de Vp. Route d’éloignement 090.",
          ),
        },
      ],
      {
        quiz: {
          kind: "mcq",
          prompt: L("Which heading outbound?", "Quel cap en éloignement ?"),
          options: opts.map((v, i) => ({
            text: L(pad3(v), pad3(v)),
            why:
              i === 0
                ? L(
                    "Three times the drift, into the wind.",
                    "Trois fois la dérive, face au vent.",
                  )
                : i === 1
                  ? L(
                      "That is the drift once: triple it outbound.",
                      "C’est la dérive une seule fois : triplez-la en éloignement.",
                    )
                  : L(
                      "Wrong side: correct into the wind, towards the north.",
                      "Mauvais côté : corrigez face au vent, vers le nord.",
                    ),
          })),
          answer: 0,
          explain: L(
            `Outbound heading about ${pad3(outHdg)}: three times the drift, into the wind (FAA IFH ch. 10).`,
            `Cap d’éloignement environ ${pad3(outHdg)} : trois fois la dérive, face au vent (FAA IFH ch. 10).`,
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
                  tasKt: 90,
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

/** The holding sample (20 steps): slides first, then practice, the takeaways and Fly it. */
export function holdingCourse(): Course {
  const steps: Step[] = [
    // part 1: understand (designed slides)
    cover(),
    why(),
    clearance(),
    anatomy(),
    threeEntries(),
    caseSlide(),
    timing(),
    windSlide(),
    fiveTs("h-five-ts", "hold.fix", 90, HSI, 270),
    // part 2: practise
    practice(),
    holdSpeed(),
    dragSector(),
    entryQuiz(
      "h-case-a",
      HOLD.fix,
      HOLD.inbound,
      HOLD.turn,
      50,
      "hold.a",
      HSI_PANE,
    ),
    entryQuiz(
      "h-case-b",
      HOLD.fix,
      HOLD.inbound,
      HOLD.turn,
      180,
      "hold.b",
      HSI_PANE,
    ),
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
    step(
      "h-wind-calc",
      "calc",
      L(
        "Compute the outbound correction",
        "Calculer la correction en éloignement",
      ),
      [],
      {
        minutes: 3,
        calc: { generatorId: "ifr.holdWind" },
      },
    ),
    step(
      "h-wind-try",
      "try",
      L(
        "Fly the outbound heading you computed",
        "Volez le cap d’éloignement calculé",
      ),
      [
        {
          t: "text",
          text: L(
            "Same numbers as the previous step: turn to the outbound heading you found and watch the track hold.",
            "Les mêmes chiffres qu’à l’étape précédente : prenez le cap d’éloignement trouvé et regardez la route tenir.",
          ),
        },
      ],
      {
        minutes: 3,
        calcLink: { step: "h-wind-calc", use: "both" },
        hint: L(
          "Into the wind: the correction points the nose towards where the wind comes from.",
          "Face au vent : la correction tourne le nez du côté d’où vient le vent.",
        ),
      },
    ),
    step(
      "h-drill",
      "drill",
      L("Drill: holding numbers", "Série : les chiffres de l’attente"),
      [],
      {
        minutes: 5,
        drill: {
          generatorIds: ["ifr.holdWind", "ifr.holdTiming", "ifr.holdSpeed"],
          count: 6,
          timer: { mode: "perProblem", seconds: 60 },
          feedback: "each",
          practiceOnly: true,
        },
      },
    ),
    // part 3: fly it
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
        "The clearance, the three entries on the diagram, outbound timing and the triple-drift rule — then three laps at ARD.",
        "La clairance, les trois entrées sur le schéma, le chronométrage et la règle de la dérive triplée — puis trois tours à ARD.",
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
