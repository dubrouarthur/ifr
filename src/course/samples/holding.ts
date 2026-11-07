// Ground school — built-in sample "Holding: entries, timing and wind" (18 steps, steam cockpit, hold at ARD
// inbound 270, right turns), and the interactive BRIEFING for the hold-ndb lesson (PA NDB) built from the same
// kinds of steps. Every entry shown or checked comes from holdEntry() (nav/holding.ts, AIM FIG 5-3-8).
// Sources: FAA AIM 5-3-8 (holding: clearance items, entries, timing, maximum speeds), FAA-H-8083-15 Instrument
// Flying Handbook ch. 10 (holding, wind correction), FAA-S-ACS-8 Instrument Rating ACS area III task B.
import type {
  Briefing,
  Course,
  InstrumentView,
  L10n,
  PaneView,
  SimScene,
  Step,
} from "../types";
import { holdEntry, type HoldEntry, type Turn } from "../../nav/holding";
import {
  CALLOUT,
  CHECKLIST,
  DIAGRAM,
  G,
  INST,
  L,
  M,
  MARK,
  QUIZ,
  SHAPE,
  T,
  canvas,
  course,
  scene,
  slideStep,
  step,
} from "./kit";

export const HOLDING_ID = "sample-holding";
export const HOLD_NDB_BRIEFING_ID = "sample-briefing-hold-ndb";

const HSI: InstrumentView = { kind: "gauge", gauge: "hsi" };
const RMI: InstrumentView = { kind: "gauge", gauge: "rmi" };
const HSI_PANE: PaneView = { kind: "six", crop: { region: "STEAM_LEFT:4" } };
const RMI_PANE: PaneView = { kind: "stack", crop: { region: "STEAM_RIGHT:1" } };

/** The ARD hold every step of the course uses (the hold-teardrop / hold-wind lessons fly the same one). */
const HOLD = { fix: "ARD", inbound: 270, turn: "R" as Turn };
/** The PA NDB hold of the hold-ndb lesson (train/curriculum.ts: inbound 270, right turns, arriving on 045). */
const NDB = {
  fix: "PA",
  inbound: 270,
  turn: "R" as Turn,
  arrive: 45,
  wind: [220, 15] as [number, number],
  tas: 90,
};

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
          : { adf: 344, brg1: "ADF", nav1: "ARD", obs1: 270, cdi: "NAV1" },
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
export function ndbScenes(): Record<string, SimScene> {
  return {
    "ndb.arrive": arriving(
      "ndb.arrive",
      "PA",
      NDB.arrive,
      "Course 045 to PA · 8 NM",
      "adf",
    ),
    "ndb.fix": scene(
      "ndb.fix",
      {
        pos: { fix: "PA", radial: 225, distNm: 0.2 },
        altFt: 3000,
        hdg: NDB.arrive,
        iasKt: 90,
        radios: { adf: 344, brg1: "ADF", nav1: "ARD", obs1: 270, cdi: "NAV1" },
      },
      { label: "Over PA · heading 045", wind: NDB.wind },
    ),
    "ndb.inbound": scene(
      "ndb.inbound",
      {
        pos: { fix: "PA", radial: 90, distNm: 4 },
        altFt: 3000,
        hdg: 263,
        iasKt: 90,
        radios: { adf: 344, brg1: "ADF", nav1: "ARD", obs1: 270, cdi: "NAV1" },
      },
      { label: "PA 090 bearing · 4 NM inbound · wind 220/15", wind: NDB.wind },
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

/** The five Ts at the fix, with a Your turn on the HSI (turn outbound with the bank pad). */
function fiveTs(
  id: string,
  sceneId: string,
  outbound: number,
  inst: InstrumentView,
  fromHdg: number,
): Step {
  const rows: [string, string, string, string][] = [
    [
      "Turn",
      "Virer",
      "to the outbound or entry heading",
      "vers le cap d’éloignement ou d’entrée",
    ],
    [
      "Time",
      "Chrono",
      "start the time: at the fix for a teardrop or parallel entry; in the hold, over or abeam the fix, whichever is later",
      "déclenchez le chrono : au repère pour une entrée décalée ou parallèle ; dans l’attente, à la verticale ou au travers du repère, le plus tardif des deux",
    ],
    [
      "Twist",
      "Tourner",
      "set the inbound course: OBS or heading bug (on an NDB, as a reference)",
      "affichez la route de rapprochement : OBS ou index de cap (sur un NDB, comme référence)",
    ],
    [
      "Throttle",
      "Puissance",
      "holding speed (90 KIAS here)",
      "vitesse d’attente (90 KIAS ici)",
    ],
    [
      "Talk",
      "Parler",
      "report entering the hold if asked",
      "annoncez l’entrée en attente si demandé",
    ],
  ];
  return slideStep(
    id,
    L("At the fix: the five Ts", "Au repère : les cinq T"),
    canvas(
      [
        T(
          "label",
          L("Memory aid · at the holding fix", "Aide-mémoire · au repère d’attente"),
          M.x,
          96,
          960,
          48,
        ),
        T(
          "title",
          L("At the fix: the five Ts", "Au repère : les cinq T"),
          M.x,
          144,
          1056,
          108,
        ),
        ...rows.flatMap(([en, fr, de, df], i) => {
          const y = 300 + i * 132;
          return [
            MARK(i + 1, M.x + 32, y + 32, { size: 64, group: `t${i}` }),
            T(
              "heading",
              L(en, en === fr ? fr : `${en} · ${fr}`),
              M.x + 96,
              y - 4,
              864,
              60,
              { group: `t${i}` },
            ),
            T("body", L(de, df), M.x + 96, y + 52, 864, 60, { group: `t${i}` }),
          ];
        }),
        {
          ...INST(
            inst,
            L(
              `HSI over the fix, heading ${pad3(fromHdg)}: turn to ${pad3(outbound)}`,
              `HSI au-dessus du repère, cap ${pad3(fromHdg)} : virez au ${pad3(outbound)}`,
            ),
            1152,
            264,
            672,
            672,
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
        },
        T(
          "caption",
          L(
            "A memory aid many instructors teach; some add a sixth, Track.",
            "Un aide-mémoire enseigné par beaucoup d’instructeurs ; certains ajoutent un sixième T, la route (Track).",
          ),
          1152,
          960,
          672,
          72,
        ),
      ],
      { scene: sceneId },
    ),
    [
      {
        t: "text",
        text: L(
          "At the fix: Turn, Time, Twist, Throttle, Talk. Then turn outbound with the bank pad.",
          "Au repère : Virer, Chrono, Tourner (l’OBS), Puissance, Parler. Puis virez en éloignement avec les boutons d’inclinaison L / R.",
        ),
      },
    ],
    { kind: "try", minutes: 2 },
  );
}

// ------------------------------------------------------------------ the course steps
function cover(): Step {
  return slideStep(
    "h-cover",
    L(
      "Holding: entries, timing and wind",
      "L’attente : entrées, chronométrage et vent",
    ),
    canvas([
      T(
        "label",
        L("Ground school · Holding", "Théorie · Attentes"),
        M.x,
        168,
        864,
        48,
      ),
      SHAPE("rect", M.x, 240, 96, 8, { fill: "accent", stroke: null }),
      T(
        "display",
        L(
          "Holding: entries, timing and wind",
          "L’attente : entrées, chronométrage et vent",
        ),
        M.x,
        264,
        864,
        408,
        { valign: "bottom" },
      ),
      T(
        "subtitle",
        L(
          "Read the clearance, pick the entry, time the legs, correct for the wind — then fly it at ARD",
          "Lire la clairance, choisir l’entrée, chronométrer, corriger le vent — puis l’attente à ARD",
        ),
        M.x,
        696,
        816,
        168,
      ),
      T(
        "caption",
        L(
          "18 steps · about 40 min · FAA AIM 5-3-8 · FAA IFH ch. 10",
          "18 étapes · environ 40 min · FAA AIM 5-3-8 · FAA IFH ch. 10",
        ),
        M.x,
        912,
        816,
        48,
      ),
      DIAGRAM(
        "h-cover.hold",
        { kind: "hold", inbound: HOLD.inbound, turn: HOLD.turn, fix: HOLD.fix },
        L(
          "Hold at ARD, inbound 270, right turns",
          "Attente à ARD, rapprochement 270, virages à droite",
        ),
        1032,
        168,
        792,
        744,
      ),
    ]),
  );
}

function anatomy(): Step {
  const parts: [string, string, string, string][] = [
    [
      "The fix",
      "Le repère",
      "ARD: where the inbound leg ends",
      "ARD : là où finit la branche de rapprochement",
    ],
    [
      "Inbound leg",
      "Branche de rapprochement",
      "1 min at or below 14,000 ft MSL, 1½ min above",
      "1 min jusqu’à 14 000 ft MSL inclus, 1 min 30 au-dessus",
    ],
    [
      "Outbound leg",
      "Branche d’éloignement",
      "timed to make the inbound leg right",
      "chronométrée pour obtenir la bonne branche de rapprochement",
    ],
    [
      "Holding side",
      "Côté attente",
      "where the turns are: right unless ATC says left",
      "là où sont les virages : à droite sauf si l’ATC dit à gauche",
    ],
  ];
  return slideStep(
    "h-anatomy",
    L("Anatomy of a hold", "Anatomie d’une attente"),
    canvas([
      T(
        "label",
        L("Holding · FAA AIM 5-3-8", "Attente · FAA AIM 5-3-8"),
        M.x,
        96,
        960,
        48,
      ),
      T(
        "title",
        L("Anatomy of a hold", "Anatomie d’une attente"),
        M.x,
        144,
        1728,
        108,
      ),
      DIAGRAM(
        "h-anatomy.hold",
        { kind: "hold", inbound: HOLD.inbound, turn: HOLD.turn, fix: HOLD.fix },
        L(
          "Hold at ARD, inbound 270, right turns",
          "Attente à ARD, rapprochement 270, virages à droite",
        ),
        M.x,
        288,
        864,
        696,
      ),
      ...parts.flatMap(([he, hf, be, bf], i) => {
        const y = 288 + i * 156;
        return [
          MARK(i + 1, 1080, y + 32, {
            size: 60,
            reveal: i + 1,
            group: `p${i}`,
          }),
          T("heading", L(he, hf), 1140, y, 684, 60, {
            reveal: i + 1,
            group: `p${i}`,
          }),
          T("body", L(be, bf), 1140, y + 60, 684, 84, {
            reveal: i + 1,
            group: `p${i}`,
          }),
        ];
      }),
      CALLOUT(
        undefined,
        L(
          "A standard hold turns right. Left turns are always said in the clearance.",
          "Une attente standard se fait par la droite. Les virages à gauche sont toujours précisés dans la clairance.",
        ),
        1056,
        912,
        768,
        96,
        { tone: "accent", reveal: 5 },
      ),
    ]),
    [
      {
        t: "text",
        text: L(
          "A hold has a fix, an inbound leg of 1 minute at or below 14,000 ft MSL (1½ min above), an outbound leg and a holding side. Standard holds turn right (FAA AIM 5-3-8).",
          "Une attente comprend un repère, une branche de rapprochement de 1 minute jusqu’à 14 000 ft MSL (1 min 30 au-dessus), une branche d’éloignement et un côté attente. Une attente standard se fait par la droite (FAA AIM 5-3-8).",
        ),
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

function clearance(): Step {
  const items: [string, string][] = [
    [
      "**East** — the direction of the hold from the fix",
      "**Est** — la direction de l’attente par rapport au repère",
    ],
    ["**ARD** — the holding fix", "**ARD** — le repère d’attente"],
    [
      "**090 radial** — the course you hold on",
      "**Radial 090** — l’axe sur lequel vous attendez",
    ],
    [
      "No turns stated — **right turns**",
      "Pas de sens précisé — **virages à droite**",
    ],
    [
      "**1430** — expect further clearance (EFC)",
      "**1430** — heure d’autorisation ultérieure prévue (EFC)",
    ],
  ];
  return slideStep(
    "h-clearance",
    L("Read the clearance", "Lire la clairance"),
    canvas([
      T(
        "label",
        L(
          "Clearance items · FAA AIM 5-3-8",
          "Éléments de la clairance · FAA AIM 5-3-8",
        ),
        M.x,
        96,
        960,
        48,
      ),
      T(
        "title",
        L("Read the clearance", "Lire la clairance"),
        M.x,
        144,
        1728,
        108,
      ),
      SHAPE("roundRect", M.x, 288, 1728, 144, {
        fill: "surface",
        stroke: "line",
        strokeW: 2,
      }),
      T(
        "mono",
        L(
          "“Hold east of ARD on the 090 radial, maintain 3,000, expect further clearance 1430.”",
          "« Attendez à l’est d’ARD sur le radial 090, maintenez 3 000 ft, autorisation ultérieure prévue à 1430. »",
        ),
        M.x + 48,
        312,
        1632,
        96,
        { valign: "middle" },
      ),
      ...items.map(([en, fr], i) =>
        T(
          "body",
          L(`${i + 1}. ${en}`, `${i + 1}. ${fr}`),
          M.x,
          480 + i * 84,
          912,
          72,
          { reveal: i + 1 },
        ),
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
                "Right: on the 090 radial, east of ARD, you fly inbound towards the fix on 270.",
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
            "Inbound course 270, right turns.",
            "Rapprochement 270, virages à droite.",
          ),
        },
        1104,
        456,
        720,
        528,
      ),
    ]),
    [
      {
        t: "text",
        text: L(
          "A holding clearance gives the direction from the fix, the fix, the radial or course, the turns if left, and an expect-further-clearance time (FAA AIM 5-3-8).",
          "Une clairance d’attente donne la direction par rapport au repère, le repère, le radial ou la route, le sens des virages s’ils sont à gauche, et une heure d’autorisation ultérieure prévue (FAA AIM 5-3-8).",
        ),
      },
    ],
    { kind: "quiz", minutes: 2 },
  );
}

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

function threeEntries(): Step {
  const crs = 50;
  const e = holdEntry(HOLD.inbound, HOLD.turn, crs);
  const rows: [HoldEntry, string, string, "green" | "accent" | "magenta"][] = [
    ["DIRECT", "180°", "180°", "green"],
    ["TEARDROP", "70°", "70°", "accent"],
    ["PARALLEL", "110°", "110°", "magenta"],
  ];
  return slideStep(
    "h-entries",
    L("Three ways into a hold", "Trois façons d’entrer en attente"),
    canvas(
      [
        T(
          "label",
          L("Entries · FAA AIM 5-3-8", "Entrées · FAA AIM 5-3-8"),
          M.x,
          96,
          960,
          48,
        ),
        T(
          "title",
          L("Three ways into a hold", "Trois façons d’entrer en attente"),
          M.x,
          144,
          1728,
          108,
        ),
        DIAGRAM(
          "h-entries.hold",
          {
            kind: "hold",
            inbound: HOLD.inbound,
            turn: HOLD.turn,
            fix: HOLD.fix,
            crs,
          },
          L(
            "Hold at ARD, inbound 270, right turns, with the entry sectors and an arrival on course 050",
            "Attente à ARD, rapprochement 270, virages à droite, avec les secteurs d’entrée et une arrivée au 050",
          ),
          M.x,
          288,
          768,
          648,
          {
            caption: L(
              `Arriving on course ${pad3(crs)}: ${ENTRY_NAME[e].en.toLowerCase()} entry.`,
              `Arrivée au ${pad3(crs)} : entrée ${F(ENTRY_NAME[e]).toLowerCase()}.`,
            ),
          },
        ),
        ...rows.flatMap(([x, de, df, col], i) => {
          const y = 288 + i * 180;
          return [
            MARK(i + 1, 1040, y + 32, {
              size: 64,
              reveal: i + 1,
              group: `e${i}`,
              color: col,
            }),
            T(
              "heading",
              L(`${ENTRY_NAME[x].en} · ${de}`, `${F(ENTRY_NAME[x])} · ${df}`),
              1104,
              y,
              720,
              60,
              {
                reveal: i + 1,
                group: `e${i}`,
              },
            ),
            T("body", ENTRY_HOW[x], 1104, y + 60, 720, 108, {
              reveal: i + 1,
              group: `e${i}`,
            }),
          ];
        }),
        CALLOUT(
          undefined,
          L(
            "Within 5° of a sector boundary, either entry is acceptable (ICAO PANS-OPS, Doc 8168).",
            "À 5° près d’une limite de secteur, les deux entrées sont acceptables (OACI PANS-OPS, Doc 8168).",
          ),
          1008,
          840,
          816,
          120,
          { tone: "warn", reveal: 4 },
        ),
      ],
      { theme: "classroom" },
    ),
    [
      {
        t: "text",
        text: L(
          "Direct (180° sector), teardrop (70°) and parallel (110°), measured from the inbound course (FAA AIM 5-3-8). Within 5° of a boundary, either entry is acceptable (ICAO PANS-OPS, Doc 8168).",
          "Directe (secteur de 180°), décalée ou « goutte d’eau » (70°) et parallèle (110°), mesurés depuis la route de rapprochement (FAA AIM 5-3-8). À 5° près d’une limite, les deux entrées sont acceptables (OACI PANS-OPS, Doc 8168).",
        ),
      },
    ],
    { kind: "explain", minutes: 3 },
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

function caseSlide(): Step {
  const crs = 300;
  const e = holdEntry(HOLD.inbound, HOLD.turn, crs);
  return slideStep(
    "h-case-c",
    L(`Arriving on course ${pad3(crs)}`, `Arrivée au ${pad3(crs)}`),
    canvas(
      [
        T("label", L("Predict", "Prédire"), M.x, 96, 960, 48),
        T(
          "title",
          L(
            `Arriving on course ${pad3(crs)}`,
            `Arrivée sur la route ${pad3(crs)}`,
          ),
          M.x,
          144,
          1728,
          108,
        ),
        INST(
          HSI,
          L(
            `HSI: heading ${pad3(crs)} towards ARD`,
            `HSI : cap ${pad3(crs)} vers ARD`,
          ),
          M.x,
          288,
          696,
          696,
          {
            scene: "hold.c",
          },
        ),
        QUIZ(
          "h-case-c.q",
          {
            kind: "mcq",
            prompt: L(
              `Hold at ARD, inbound 270, right turns. You track ${pad3(crs)} to the fix. Which entry?`,
              `Attente à ARD, rapprochement 270, virages à droite. Vous suivez ${pad3(crs)} vers le repère. Quelle entrée ?`,
            ),
            options: ENTRIES.map((x) => ({
              text: ENTRY_NAME[x],
              ...(x === e ? { why: ENTRY_HOW[x] } : {}),
            })),
            answer: ENTRIES.indexOf(e),
            explain: L(
              `${ENTRY_NAME[e].en}: ${ENTRY_HOW[e].en}`,
              `${F(ENTRY_NAME[e])} : ${F(ENTRY_HOW[e])}`,
            ),
          },
          888,
          288,
          936,
          624,
        ),
        DIAGRAM(
          "h-case-c.hold",
          {
            kind: "hold",
            inbound: HOLD.inbound,
            turn: HOLD.turn,
            fix: HOLD.fix,
            crs,
          },
          L(
            `Hold at ARD with the arrival on course ${pad3(crs)}`,
            `Attente à ARD avec l’arrivée au ${pad3(crs)}`,
          ),
          96,
          288,
          696,
          696,
          { reveal: { order: 1, when: "answered" } },
        ),
      ],
      { scene: "hold.c" },
    ),
    [
      {
        t: "text",
        text: L(
          `Arriving on course ${pad3(crs)} to a hold inbound 270 with right turns: ${ENTRY_NAME[e].en.toLowerCase()} entry.`,
          `Arrivée au ${pad3(crs)} sur une attente au 270 par la droite : entrée ${F(ENTRY_NAME[e]).toLowerCase()}.`,
        ),
      },
    ],
    { kind: "quiz", minutes: 1 },
  );
}

function timing(): Step {
  return slideStep(
    "h-timing",
    L(
      "Timing: aim for 1:00 inbound",
      "Chronométrage : viser 1:00 en rapprochement",
    ),
    canvas([
      T(
        "label",
        L("Timing · FAA AIM 5-3-8", "Chronométrage · FAA AIM 5-3-8"),
        M.x,
        96,
        960,
        48,
      ),
      T(
        "title",
        L(
          "Time the outbound to fix the inbound",
          "Chronométrez l’éloignement pour régler le rapprochement",
        ),
        M.x,
        144,
        1728,
        108,
      ),
      T("number", L("1:00", "1:00"), M.x, 288, 624, 192),
      T(
        "caption",
        L(
          "inbound leg at or below 14,000 ft MSL (1:30 above)",
          "branche de rapprochement jusqu’à 14 000 ft MSL (1:30 au-dessus)",
        ),
        M.x,
        480,
        624,
        72,
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
            outboundS: 60,
          },
        },
        L(
          "Hold at ARD with a 20 kt headwind on the inbound leg",
          "Attente à ARD avec 20 kt de vent de face en rapprochement",
        ),
        M.x,
        576,
        624,
        408,
      ),
      MARK(1, 840, 320, { size: 56, reveal: 1, group: "m1" }),
      T(
        "body",
        L(
          "**Start the time over or abeam the fix**, whichever comes later. If you cannot tell abeam, start when the turn outbound is complete.",
          "**Déclenchez le chrono à la verticale ou au travers du repère**, le plus tardif des deux. Si le travers n’est pas identifiable, déclenchez en fin de virage vers l’éloignement.",
        ),
        888,
        288,
        936,
        168,
        { reveal: 1, group: "m1" },
      ),
      MARK(2, 840, 520, { size: 56, reveal: 2, group: "m2" }),
      T(
        "body",
        L(
          "**Time the inbound leg** from the end of the turn to the fix.",
          "**Chronométrez le rapprochement** de la fin du virage au repère.",
        ),
        888,
        488,
        936,
        120,
        { reveal: 2, group: "m2" },
      ),
      MARK(3, 840, 672, { size: 56, reveal: 3, group: "m3" }),
      T(
        "body",
        L(
          "**Adjust the next outbound**: inbound too long, shorten it; too short, lengthen it. The next step works the numbers.",
          "**Ajustez l’éloignement suivant** : rapprochement trop long, raccourcissez-le ; trop court, allongez-le. L’étape suivante fait le calcul.",
        ),
        888,
        640,
        936,
        168,
        { reveal: 3, group: "m3" },
      ),
      CALLOUT(
        undefined,
        L(
          "Wind from the west here: tailwind outbound, headwind inbound. Fly the outbound for less than a minute or the inbound leg runs long.",
          "Ici le vent vient de l’ouest : arrière en éloignement, de face en rapprochement. Éloignez-vous moins d’une minute, sinon le rapprochement s’allonge.",
        ),
        888,
        864,
        936,
        120,
        { tone: "accent", reveal: 4 },
      ),
    ]),
    [
      {
        t: "text",
        text: L(
          "Outbound timing starts over or abeam the fix, whichever is later; if abeam cannot be determined, when the turn outbound is complete. Adjust the outbound leg so the inbound leg takes 1 minute (1½ above 14,000 ft MSL) (FAA AIM 5-3-8).",
          "Le chrono d’éloignement part à la verticale ou au travers du repère, le plus tardif des deux ; si le travers n’est pas identifiable, en fin de virage. Ajustez l’éloignement pour que le rapprochement dure 1 minute (1 min 30 au-dessus de 14 000 ft MSL) (FAA AIM 5-3-8).",
        ),
      },
    ],
    { kind: "explain", minutes: 2 },
  );
}

function windSlide(): Step {
  const w: [number, number] = [360, 25];
  const outHdg = outboundHeading(HOLD.inbound, 90, w[0], w[1]);
  const inHdg = Math.round(
    wrap360(HOLD.inbound + wca(HOLD.inbound, 90, w[0], w[1])),
  );
  return slideStep(
    "h-wind",
    L(
      "Wind: triple the drift outbound",
      "Vent : triplez la dérive en éloignement",
    ),
    canvas([
      T(
        "label",
        L(
          "Wind correction · FAA IFH ch. 10",
          "Correction de vent · FAA IFH ch. 10",
        ),
        M.x,
        96,
        960,
        48,
      ),
      T(
        "title",
        L("Triple the drift outbound", "Triplez la dérive en éloignement"),
        M.x,
        144,
        1728,
        108,
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
        M.x,
        288,
        1008,
        696,
        {
          interactive: true,
          caption: L(
            "Drag the wind: the racetrack and the headings follow.",
            "Déplacez le vent : l’hippodrome et les caps suivent.",
          ),
        },
      ),
      T(
        "body",
        L(
          "**Inbound**, find the correction that holds the course, as on any radial.",
          "**En rapprochement**, trouvez la correction qui tient la route, comme sur tout radial.",
        ),
        1200,
        288,
        624,
        144,
      ),
      T(
        "body",
        L(
          "**Outbound**, apply three times that correction the other way: the turns at each end spend time in the wind too.",
          "**En éloignement**, appliquez trois fois cette correction dans l’autre sens : les virages aux extrémités passent eux aussi du temps dans le vent.",
        ),
        1200,
        456,
        624,
        192,
        { reveal: 1 },
      ),
      SHAPE("roundRect", 1200, 696, 624, 264, {
        fill: "surface",
        stroke: "line",
        strokeW: 2,
        reveal: { order: 2 },
      }),
      T(
        "label",
        L("Wind 360/25 · 90 KTAS", "Vent 360/25 · 90 kt Vp"),
        1236,
        720,
        552,
        48,
        { reveal: 2 },
      ),
      T(
        "mono",
        L(
          `Inbound   heading ${pad3(inHdg)}\nOutbound  heading ${pad3(outHdg)}`,
          `Rapprochement  cap ${pad3(inHdg)}\nÉloignement    cap ${pad3(outHdg)}`,
        ),
        1236,
        780,
        552,
        144,
        { reveal: 2 },
      ),
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

function recap(): Step {
  return slideStep(
    "h-recap",
    L("Before you fly", "Avant de voler"),
    canvas([
      T("label", L("Keys to success", "Clés du succès"), M.x, 96, 960, 48),
      T(
        "title",
        L("Before you fly the hold", "Avant de voler l’attente"),
        M.x,
        144,
        1728,
        108,
      ),
      ...(
        [
          [
            "1:00",
            "1:00",
            "inbound at or below 14,000 ft",
            "en rapprochement jusqu’à 14 000 ft",
          ],
          [
            "×3",
            "×3",
            "the drift correction outbound",
            "la correction de dérive en éloignement",
          ],
          [
            "200",
            "200",
            "KIAS maximum up to 6,000 ft (FAA)",
            "KIAS maximum jusqu’à 6 000 ft (FAA)",
          ],
        ] as [string, string, string, string][]
      ).flatMap(([n, nf, c, cf], i) => {
        const x = M.x + i * 600;
        return [
          SHAPE("roundRect", x, 288, 528, 336, {
            fill: "surface",
            stroke: "line",
            strokeW: 2,
          }),
          T("number", L(n, nf), x + 48, 312, 432, 168),
          T("body", L(c, cf), x + 48, 492, 432, 108),
        ];
      }),
      CHECKLIST(
        "h-recap.list",
        [
          {
            text: L(
              "Entry from your course to the fix (AIM FIG 5-3-8)",
              "Entrée selon votre route vers le repère (AIM FIG 5-3-8)",
            ),
          },
          {
            text: L(
              "Start the time abeam the fix",
              "Chrono au travers du repère",
            ),
          },
          {
            text: L(
              "Adjust the outbound after each lap",
              "Ajustez l’éloignement à chaque tour",
            ),
          },
        ],
        M.x,
        672,
        1728,
        312,
        { title: L("At every lap", "À chaque tour") },
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
            "Maximum 200 KIAS up to 6,000 ft MSL (FAA).",
            "200 KIAS maximum jusqu’à 6 000 ft MSL (FAA).",
          ),
        ],
      },
    ],
    { minutes: 1 },
  );
}

/** The holding sample (18 steps). */
export function holdingCourse(): Course {
  const steps: Step[] = [
    cover(),
    anatomy(),
    clearance(),
    holdSpeed(),
    threeEntries(),
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
    caseSlide(),
    timing(),
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
    windSlide(),
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
    fiveTs("h-five-ts", "hold.fix", 90, HSI, 270),
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
      theme: "cockpit",
      tags: ["ifr", "holding", "entries", "wind"],
      minutes: 40,
    },
    steps,
    holdingScenes(),
  );
}

// ------------------------------------------------------------------ the hold-ndb briefing (an interactive briefing)
/** "Briefing: holding on the PA NDB" — a Course with shape 'briefing' for the hold-ndb lesson. */
export function holdNdbBriefing(): Briefing {
  const e = holdEntry(NDB.inbound, NDB.turn, NDB.arrive);
  // teardrop: 30° off the outbound course towards the holding side (right turns inbound 270: north)
  const outbound = wrap360(NDB.inbound + 180);
  const teardropHdg = wrap360(outbound + (NDB.turn === "R" ? -30 : 30));
  const outHdg = outboundHeading(
    NDB.inbound,
    NDB.tas,
    NDB.wind[0],
    NDB.wind[1],
  );
  const inHdg = Math.round(
    wrap360(NDB.inbound + wca(NDB.inbound, NDB.tas, NDB.wind[0], NDB.wind[1])),
  );
  const noTriple = Math.round(
    wrap360(outbound + wca(outbound, NDB.tas, NDB.wind[0], NDB.wind[1])),
  );
  const wrongSide = Math.round(wrap360(outbound - (outHdg - outbound)));
  const steps: Step[] = [
    slideStep(
      "n-cover",
      L("Briefing: holding on the PA NDB", "Briefing : attente sur le NDB PA"),
      canvas([
        T(
          "label",
          L(
            "Lesson briefing · Holding on an NDB",
            "Briefing de leçon · Attente sur NDB",
          ),
          M.x,
          168,
          864,
          48,
        ),
        SHAPE("rect", M.x, 240, 96, 8, { fill: "accent", stroke: null }),
        T(
          "display",
          L("Holding on the PA NDB", "Attente sur le NDB PA"),
          M.x,
          264,
          864,
          336,
          { valign: "bottom" },
        ),
        SHAPE("roundRect", M.x, 648, 864, 192, {
          fill: "surface",
          stroke: "line",
          strokeW: 2,
        }),
        T(
          "label",
          L("Your clearance", "Votre clairance"),
          M.x + 36,
          672,
          792,
          48,
        ),
        T(
          "mono",
          L(
            "“Hold east of PA, inbound course 270, maintain 3,000, expect further clearance 1430.”",
            "« Attendez à l’est de PA, route de rapprochement 270, maintenez 3 000 ft, autorisation ultérieure prévue à 1430. »",
          ),
          M.x + 36,
          720,
          792,
          96,
        ),
        T(
          "caption",
          L(
            "8 steps · about 10 min, then the lesson · wind 220/15",
            "8 étapes · environ 10 min, puis la leçon · vent 220/15",
          ),
          M.x,
          888,
          864,
          48,
        ),
        DIAGRAM(
          "n-cover.hold",
          { kind: "hold", inbound: NDB.inbound, turn: NDB.turn, fix: NDB.fix },
          L(
            "Hold at PA, inbound 270, right turns",
            "Attente à PA, rapprochement 270, virages à droite",
          ),
          1032,
          168,
          792,
          744,
        ),
      ]),
      [],
      { section: "overview", minutes: 1 },
    ),
    slideStep(
      "n-entry",
      L("Predict your entry", "Prédisez votre entrée"),
      canvas([
        T(
          "label",
          L("Entry · FAA AIM 5-3-8", "Entrée · FAA AIM 5-3-8"),
          M.x,
          96,
          960,
          48,
        ),
        T(
          "title",
          L("You arrive on course 045", "Vous arrivez sur la route 045"),
          M.x,
          144,
          1728,
          108,
        ),
        DIAGRAM(
          "n-entry.hold",
          {
            kind: "hold",
            inbound: NDB.inbound,
            turn: NDB.turn,
            fix: NDB.fix,
            crs: NDB.arrive,
          },
          L(
            "Hold at PA with an arrival on course 045",
            "Attente à PA avec une arrivée au 045",
          ),
          M.x,
          288,
          864,
          696,
        ),
        QUIZ(
          "n-entry.q",
          {
            kind: "mcq",
            prompt: L(
              "Inbound 270, right turns, course 045 to PA. Which entry?",
              "Rapprochement 270, virages à droite, route 045 vers PA. Quelle entrée ?",
            ),
            options: ENTRIES.map((x) => ({
              text: ENTRY_NAME[x],
              ...(x === e ? { why: ENTRY_HOW[x] } : {}),
            })),
            answer: ENTRIES.indexOf(e),
            explain: L(
              `${ENTRY_NAME[e].en}: ${ENTRY_HOW[e].en}`,
              `${F(ENTRY_NAME[e])} : ${F(ENTRY_HOW[e])}`,
            ),
          },
          1056,
          288,
          768,
          528,
        ),
        T(
          "body",
          L(
            `Cross PA, turn to **${pad3(teardropHdg)}** (30° off the outbound course, holding side), one minute, then turn right inbound.`,
            `Passez PA, prenez le cap **${pad3(teardropHdg)}** (30° de l’axe d’éloignement, côté attente), une minute, puis virez à droite en rapprochement.`,
          ),
          1056,
          840,
          768,
          168,
          { reveal: { order: 1, when: "answered" } },
        ),
      ]),
      [],
      { kind: "quiz", section: "entry", minutes: 2 },
    ),
    step(
      "n-turn",
      "try",
      L("Turn to the teardrop heading", "Prenez le cap de l’entrée décalée"),
      [
        {
          t: "text",
          text: L(
            `You are over PA heading 045. Turn to the teardrop heading, **${pad3(teardropHdg)}**, with the bank pad.`,
            `Vous êtes à la verticale de PA, cap 045. Prenez le cap de l’entrée décalée, **${pad3(teardropHdg)}**, avec les boutons d’inclinaison L / R.`,
          ),
        },
        {
          t: "doThis",
          rows: [
            {
              text: L(
                `Heading ${pad3(teardropHdg)} (±5°)`,
                `Cap ${pad3(teardropHdg)} (±5°)`,
              ),
              check: 0,
              readout: "hdg",
            },
          ],
        },
      ],
      {
        section: "entry",
        minutes: 2,
        stage: {
          panes: [HSI_PANE, RMI_PANE],
          mode: "live",
          scene: "ndb.fix",
          controls: ["bank"],
          assist: { holdAlt: true, holdIas: true },
        },
        goal: { all: [G.heading(teardropHdg, 5)], holdS: 3, graded: false },
      },
    ),
    slideStep(
      "n-adf",
      L("The RMI gives you the bearing", "Le RMI vous donne le relèvement"),
      canvas(
        [
          T(
            "label",
            L("ADF · FAA IFH ch. 9", "ADF · FAA IFH ch. 9"),
            M.x,
            96,
            960,
            48,
          ),
          T(
            "title",
            L(
              "The RMI head is the course to the NDB",
              "La tête du RMI est la route vers le NDB",
            ),
            M.x,
            144,
            1728,
            108,
          ),
          INST(
            RMI,
            L("RMI: needle on PA", "RMI : aiguille sur PA"),
            M.x,
            288,
            696,
            696,
            { scene: "ndb.inbound" },
          ),
          T(
            "number",
            L("MB = MH + RB", "QDM = Cm + Gisement"),
            888,
            288,
            936,
            144,
          ),
          T(
            "body",
            L(
              "On a fixed-card ADF, add the relative bearing to the magnetic heading. The RMI does it for you: its head reads the magnetic bearing **to** the station (QDM), the tail the bearing **from** it (QDR).",
              "Sur un ADF à carte fixe, ajoutez le gisement au cap magnétique. Le RMI le fait pour vous : la tête lit le relèvement magnétique **vers** la station (QDM), la queue le relèvement **depuis** la station (QDR).",
            ),
            888,
            456,
            936,
            264,
          ),
          CALLOUT(
            undefined,
            L(
              `Inbound on 270 with the wind from 220: heading about ${pad3(inHdg)}, head of the needle on 270.`,
              `En rapprochement au 270 avec un vent du 220 : cap environ ${pad3(inHdg)}, tête de l’aiguille sur 270.`,
            ),
            888,
            768,
            936,
            168,
            { tone: "accent", reveal: 1 },
          ),
        ],
        { scene: "ndb.inbound" },
      ),
      [],
      { kind: "explain", section: "numbers", minutes: 2 },
    ),
    step(
      "n-adf-calc",
      "calc",
      L(
        "ADF: the bearing to the station",
        "ADF : le relèvement vers la station",
      ),
      [],
      {
        section: "numbers",
        minutes: 2,
        calc: { generatorId: "ifr.adfBearing", params: { variant: "qdm" } },
      },
    ),
    slideStep(
      "n-wind",
      L("The wind outbound", "Le vent en éloignement"),
      canvas([
        T(
          "label",
          L("Wind 220/15 · 90 KTAS", "Vent 220/15 · 90 kt Vp"),
          M.x,
          96,
          960,
          48,
        ),
        T(
          "title",
          L("Your outbound heading", "Votre cap d’éloignement"),
          M.x,
          144,
          1728,
          108,
        ),
        DIAGRAM(
          "n-wind.d",
          {
            kind: "calc",
            calc: {
              kind: "holdWind",
              inbound: NDB.inbound,
              turn: NDB.turn,
              windDir: NDB.wind[0],
              windKt: NDB.wind[1],
              tasKt: NDB.tas,
              drag: ["wind"],
            },
          },
          L(
            "Hold at PA in a wind from 220 at 15 kt",
            "Attente à PA par vent du 220 pour 15 kt",
          ),
          M.x,
          288,
          960,
          696,
          { interactive: true },
        ),
        QUIZ(
          "n-wind.q",
          {
            kind: "mcq",
            prompt: L(
              `Inbound heading about ${pad3(inHdg)}. Outbound course 090: which heading?`,
              `Cap de rapprochement environ ${pad3(inHdg)}. Route d’éloignement 090 : quel cap ?`,
            ),
            options: [outHdg, noTriple, wrongSide].map((v, i) => ({
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
                        "Wrong side: correct into the wind.",
                        "Mauvais côté : corrigez face au vent.",
                      ),
            })),
            answer: 0,
            explain: L(
              `About ${pad3(outHdg)} (FAA IFH ch. 10).`,
              `Environ ${pad3(outHdg)} (FAA IFH ch. 10).`,
            ),
          },
          1152,
          288,
          672,
          600,
        ),
      ]),
      [],
      { kind: "quiz", section: "wind", minutes: 2 },
    ),
    fiveTs("n-five-ts", "ndb.fix", teardropHdg, HSI, NDB.arrive),
    step(
      "n-fly",
      "fly",
      L(
        "Fly the lesson: holding on an NDB",
        "Volez la leçon : attente sur NDB",
      ),
      [],
      {
        section: "check",
        minutes: 12,
        flyIt: {
          target: { kind: "lesson", exerciseId: "hold-ndb" },
          brief: L(
            `Teardrop entry at PA (heading ${pad3(teardropHdg)}), then hold inbound 270 on the ADF needle at 3,000 ft. Outbound heading about ${pad3(outHdg)}.`,
            `Entrée décalée à PA (cap ${pad3(teardropHdg)}), puis attente au 270 sur l’aiguille ADF à 3 000 ft. Cap d’éloignement environ ${pad3(outHdg)}.`,
          ),
          keys: [
            L(
              "Head of the needle on 270 inbound.",
              "Tête de l’aiguille sur 270 en rapprochement.",
            ),
            L(
              "Triple the drift outbound.",
              "Triplez la dérive en éloignement.",
            ),
          ],
          options: ["wind", "turbulence"],
          defaultsOn: ["wind"],
          criteria: [],
          returnTo: "thisStep",
        },
      },
    ),
  ];
  const c = course(
    {
      id: HOLD_NDB_BRIEFING_ID,
      title: L(
        "Briefing: holding on the PA NDB",
        "Briefing : attente sur le NDB PA",
      ),
      summary: L(
        "The interactive briefing of the hold-ndb lesson: predict the entry, turn to its heading, read the RMI, compute the outbound heading, then fly the lesson.",
        "Le briefing interactif de la leçon d’attente sur NDB : prédire l’entrée, prendre son cap, lire le RMI, calculer le cap d’éloignement, puis voler la leçon.",
      ),
      cockpit: "steam",
      theme: "cockpit",
      tags: ["ifr", "holding", "ndb", "briefing"],
      minutes: 10,
      shape: "briefing",
      briefingFor: { exerciseId: "hold-ndb" },
    },
    steps,
    ndbScenes(),
  );
  return c as Briefing;
}
