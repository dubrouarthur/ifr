// Ground school — crafted briefings for the three ARD holding lessons (hold-direct, hold-teardrop,
// hold-parallel): the same hold (ARD, inbound 270, right turns, 3,000 ft, calm), three arrival courses, so three
// entries. One builder, the entry-specific pages written per entry. Every entry shown or asked comes from
// holdEntry() (nav/holding.ts, AIM FIG 5-3-8), and a test checks it.
// Sources: FAA AIM 5-3-8 (holding: clearance items, entries, timing, maximum speeds, the 3-minute speed
// reduction), FAA-H-8083-15B IFH ch. 10 (holding, timing correction), ICAO Doc 8168 PANS-OPS (5° entry
// tolerance, 230 kt), FAA-S-ACS-8C area III task B.
import type { Briefing, L10n, SimScene, Step } from "../../types";
import { holdEntry, type HoldEntry } from "../../../nav/holding";
import { scene } from "../kit";
import {
  DIAGRAM,
  G,
  GAUGE,
  L,
  briefing,
  coverStep,
  flyStep,
  formulaStep,
  heroStep,
  mcq,
  mistakesStep,
  pad3,
  quizStep,
  readyStep,
  slide,
  head,
  foot,
  whyStep,
  yourTurnStep,
} from "./kit";
import { QUIZ, slideStep } from "../kit";

export const HOLD_DIRECT_BRIEFING_ID = "sample-briefing-hold-direct";
export const HOLD_TEARDROP_BRIEFING_ID = "sample-briefing-hold-teardrop";
export const HOLD_PARALLEL_BRIEFING_ID = "sample-briefing-hold-parallel";

/** The ARD hold of the three lessons (train/curriculum.ts holdExercise). */
const H = { fix: "ARD", inbound: 270, turn: "R" as const, alt: 3000 };
const holdD = (crs?: number, quiet?: boolean) => ({
  kind: "hold" as const,
  inbound: H.inbound,
  turn: H.turn,
  fix: H.fix,
  ...(crs !== undefined ? { crs } : {}),
  ...(quiet ? { quiet: true } : {}),
});

const ENTRY_NAME: Record<HoldEntry, L10n> = {
  DIRECT: L("Direct", "Directe"),
  TEARDROP: L("Teardrop", "Décalée"),
  PARALLEL: L("Parallel", "Parallèle"),
};
const ENTRY_ROW: Record<HoldEntry, L10n> = {
  DIRECT: L("Direct · 180° sector", "Directe · secteur de 180°"),
  TEARDROP: L("Teardrop · 70° sector", "Décalée · secteur de 70°"),
  PARALLEL: L("Parallel · 110° sector", "Parallèle · secteur de 110°"),
};
const ENTRIES: HoldEntry[] = ["DIRECT", "TEARDROP", "PARALLEL"];

interface EntryPlan {
  id: string;
  exerciseId: string;
  prefix: string;
  /** course to the fix */
  crs: number;
  /** the heading at the fix */
  fixHdg: number;
  turnAtFix: L10n;
  points: {
    heading: L10n;
    body: L10n;
    color: "sel" | "key" | "nav" | "path";
  }[];
  /** the entry-specific mistake */
  mistake: { error: L10n; why: L10n; fix: L10n };
  sub: L10n;
  tip: L10n;
  blurb: L10n;
  reader: L10n;
}

const PLANS: Record<HoldEntry, EntryPlan> = {
  DIRECT: {
    id: HOLD_DIRECT_BRIEFING_ID,
    exerciseId: "hold-direct",
    prefix: "hd",
    crs: 300,
    fixHdg: 90,
    turnAtFix: L("turn right to 090", "virez à droite au 090"),
    sub: L(
      "Arriving on 300: the direct entry",
      "Arrivée au 300 : l’entrée directe",
    ),
    points: [
      {
        heading: L("Cross ARD", "Passez ARD"),
        body: L(
          "at 90 KIAS, slowed 3 min before",
          "à 90 KIAS, ralenti 3 min avant",
        ),
        color: "sel",
      },
      {
        heading: L("Turn right to 090", "À droite au 090"),
        body: L(
          "150° of turn, in the hold’s direction",
          "150° de virage, dans le sens de l’attente",
        ),
        color: "path",
      },
      {
        heading: L("Time from abeam", "Chrono au travers"),
        body: L(
          "1:00 outbound, then turn right inbound",
          "1:00 en éloignement, puis à droite",
        ),
        color: "key",
      },
    ],
    mistake: {
      error: L("Timing from the turn", "Chrono en fin de virage"),
      why: L(
        "Starting the clock late makes the inbound leg long.",
        "Un chrono lancé tard allonge le rapprochement.",
      ),
      fix: L("Start it abeam ARD.", "Lancez-le au travers d’ARD."),
    },
    tip: L(
      "Course 300 to ARD · direct entry: right to 090 at ARD · 90 KIAS · 3,000 ft · calm.",
      "Route 300 vers ARD · entrée directe : à droite au 090 à ARD · 90 KIAS · 3 000 ft · vent calme.",
    ),
    blurb: L(
      "Briefing: the direct entry, timing from abeam",
      "Briefing : l’entrée directe, le chrono au travers",
    ),
    reader: L(
      "Arriving on course 300 to a hold at ARD inbound 270 with right turns, you are in the 180° direct sector: cross ARD, turn right to the outbound heading 090, start the time abeam the fix (or at the end of the turn if abeam cannot be found), then turn right inbound (FAA AIM 5-3-8).",
      "En arrivant au 300 sur une attente à ARD, rapprochement 270, virages à droite, vous êtes dans le secteur direct de 180° : passez ARD, virez à droite au cap d’éloignement 090, lancez le chrono au travers du repère (ou en fin de virage si le travers est introuvable), puis virez à droite en rapprochement (FAA AIM 5-3-8).",
    ),
  },
  TEARDROP: {
    id: HOLD_TEARDROP_BRIEFING_ID,
    exerciseId: "hold-teardrop",
    prefix: "ht",
    crs: 50,
    fixHdg: 60,
    turnAtFix: L("turn right to 060", "virez à droite au 060"),
    sub: L(
      "Arriving on 050: the teardrop entry",
      "Arrivée au 050 : l’entrée décalée",
    ),
    points: [
      {
        heading: L("At ARD: 060", "À ARD : 060"),
        body: L(
          "30° off the outbound 090, on the holding side",
          "30° de l’éloignement 090, côté attente",
        ),
        color: "path",
      },
      {
        heading: L("Fly 1:00", "Volez 1:00"),
        body: L("timed from the fix", "chronométrée depuis le repère"),
        color: "key",
      },
      {
        heading: L("Turn right, intercept", "À droite, interceptez"),
        body: L(
          "about 210° of turn onto the 270 course",
          "environ 210° de virage vers l’axe 270",
        ),
        color: "sel",
      },
    ],
    mistake: {
      error: L("Flying 270, not the course", "Voler 270, pas l’axe"),
      why: L(
        "After the turn the needle is off: a heading misses the course.",
        "Après le virage, l’aiguille est décalée : un cap rate l’axe.",
      ),
      fix: L(
        "Intercept, centre the needle.",
        "Interceptez, centrez l’aiguille.",
      ),
    },
    tip: L(
      "Course 050 to ARD · teardrop: heading 060 at ARD, 1:00, then right to intercept 270 · 90 KIAS · 3,000 ft.",
      "Route 050 vers ARD · décalée : cap 060 à ARD, 1:00, puis à droite pour intercepter le 270 · 90 KIAS · 3 000 ft.",
    ),
    blurb: L(
      "Briefing: the teardrop entry, 30° and one minute",
      "Briefing : l’entrée décalée, 30° et une minute",
    ),
    reader: L(
      "Arriving on course 050 you are in the 70° teardrop sector: cross ARD, turn to 060 (30° off the outbound course, on the holding side), fly one minute, then turn right in the direction of the hold to intercept the inbound course 270 (FAA AIM 5-3-8). ICAO calls it the offset entry.",
      "En arrivant au 050 vous êtes dans le secteur décalé de 70° : passez ARD, prenez le cap 060 (30° de l’axe d’éloignement, côté attente), volez une minute, puis virez à droite, dans le sens de l’attente, pour intercepter l’axe de rapprochement 270 (FAA AIM 5-3-8).",
    ),
  },
  PARALLEL: {
    id: HOLD_PARALLEL_BRIEFING_ID,
    exerciseId: "hold-parallel",
    prefix: "hp",
    crs: 140,
    fixHdg: 90,
    turnAtFix: L("turn left to 090", "virez à gauche au 090"),
    sub: L(
      "Arriving on 140: the parallel entry",
      "Arrivée au 140 : l’entrée parallèle",
    ),
    points: [
      {
        heading: L("At ARD: left to 090", "À ARD : à gauche au 090"),
        body: L(
          "parallel, on the non-holding side",
          "en parallèle, côté non-attente",
        ),
        color: "path",
      },
      {
        heading: L("Fly 1:00", "Volez 1:00"),
        body: L("timed from the fix", "chronométrée depuis le repère"),
        color: "key",
      },
      {
        heading: L("Turn left, past 180°", "À gauche, plus de 180°"),
        body: L(
          "toward the holding side, back to ARD or the course",
          "vers le côté attente, vers ARD ou l’axe",
        ),
        color: "sel",
      },
    ],
    mistake: {
      error: L("Turning back the wrong way", "Revenir du mauvais côté"),
      why: L(
        "A right turn after the parallel leg leaves the protected area.",
        "Un virage à droite après le parallèle sort de la zone protégée.",
      ),
      fix: L(
        "Turn left, toward the holding side.",
        "À gauche, vers le côté attente.",
      ),
    },
    tip: L(
      "Course 140 to ARD · parallel: left to 090 at ARD, 1:00, then left past 180° · then right turns · 3,000 ft.",
      "Route 140 vers ARD · parallèle : à gauche au 090 à ARD, 1:00, puis à gauche plus de 180° · ensuite virages à droite · 3 000 ft.",
    ),
    blurb: L(
      "Briefing: the parallel entry and its return turn",
      "Briefing : l’entrée parallèle et son virage de retour",
    ),
    reader: L(
      "Arriving on course 140 you are in the 110° parallel sector: cross ARD, turn left to the outbound heading 090 on the non-holding side, fly one minute, then turn left, toward the holding side, through more than 180° to intercept the inbound course or return to the fix (FAA AIM 5-3-8). Then the hold continues with right turns.",
      "En arrivant au 140 vous êtes dans le secteur parallèle de 110° : passez ARD, virez à gauche au cap 090 côté non-attente, volez une minute, puis virez à gauche, vers le côté attente, de plus de 180° pour intercepter l’axe ou revenir au repère (FAA AIM 5-3-8). L’attente continue ensuite par la droite.",
    ),
  },
};

function holdScenes(p: EntryPlan): Record<string, SimScene> {
  const radios = {
    nav1: "ARD",
    obs1: 270,
    cdi: "NAV1" as const,
    brg1: "NAV1" as const,
  };
  return {
    [`${p.prefix}.fix`]: scene(
      `${p.prefix}.fix`,
      {
        pos: { fix: H.fix, radial: (p.crs + 180) % 360, distNm: 0.3 },
        altFt: H.alt,
        hdg: p.crs,
        iasKt: 90,
        radios,
      },
      { label: `Over ARD · heading ${pad3(p.crs)} · 3,000 ft` },
    ),
  };
}

function holdBriefingFor(entry: HoldEntry): Briefing {
  const p = PLANS[entry];
  const e = holdEntry(H.inbound, H.turn, p.crs);
  if (e !== entry)
    throw new Error(
      `hold briefing: ${p.exerciseId} arrives in the ${e} sector`,
    );
  const x = p.prefix;
  const crs = pad3(p.crs);
  const name = ENTRY_NAME[entry];
  const steps: Step[] = [
    coverStep(
      `${x}-cover`,
      L(
        `Briefing: holding, ${name.en.toLowerCase()} entry`,
        `Briefing : attente, entrée ${name.fr!.toLowerCase()}`,
      ),
      {
        eyebrow: L("Lesson briefing · Holding", "Briefing de leçon · Attente"),
        main: L(
          `The ${name.en.toLowerCase()} entry`,
          `L’entrée ${name.fr!.toLowerCase()}`,
        ),
        sub: p.sub,
        lead: L(
          "Read the clearance, find your sector, fly the entry, then time the legs.",
          "Lisez la clairance, trouvez votre secteur, volez l’entrée, puis chronométrez.",
        ),
        meta: L(
          "About 12 min · ARD 114.20 · FAA AIM 5-3-8",
          "Environ 12 min · ARD 114,20 · FAA AIM 5-3-8",
        ),
        hero: [
          DIAGRAM(
            `${x}-cover.hold`,
            holdD(undefined, true),
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
        reader: p.reader,
      },
    ),
    whyStep(`${x}-why`, {
      eyebrow: L("Why it matters", "Pourquoi c’est important"),
      title: L("Where ATC parks you", "Là où le contrôle vous gare"),
      n: L("1:00", "1:00"),
      nW: 400,
      color: "key",
      statement: L(
        "inbound leg, at or below 14,000 ft",
        "branche de rapprochement, jusqu’à 14 000 ft",
      ),
      body: L(
        "Below minimums or waiting for a slot, you hold. The checkride always has one.",
        "Sous les minima ou en attente d’un créneau, vous attendez. Le test en vol en contient toujours une.",
      ),
      sideTitle: L("Speeds", "Vitesses"),
      side: [
        {
          n: L("90 kt", "90 kt"),
          text: L(
            "this lesson, slowed 3 min before ARD",
            "cette leçon, ralenti 3 min avant ARD",
          ),
          color: "nav",
        },
        {
          n: L("200 kt", "200 kt"),
          text: L(
            "FAA maximum, up to 6,000 ft",
            "maximum FAA, jusqu’à 6 000 ft",
          ),
        },
        {
          n: L("230 kt", "230 kt"),
          text: L(
            "ICAO maximum, up to 14,000 ft",
            "maximum OACI, jusqu’à 14 000 ft",
          ),
        },
      ],
      foot: L(
        "FAA AIM 5-3-8 · ICAO Doc 8168 · these limits are for every aircraft",
        "FAA AIM 5-3-8 · OACI Doc 8168 · ces limites valent pour tous les avions",
      ),
      reader: L(
        "The inbound leg of a hold lasts one minute at or below 14,000 ft MSL (1½ minutes above). Start slowing 3 minutes before the fix. Maximum holding speeds are airspace limits for every aircraft: 200 KIAS up to 6,000 ft (FAA), 230 kt up to 14,000 ft (ICAO). This lesson holds at 90 KIAS (FAA AIM 5-3-8; ICAO Doc 8168).",
        "La branche de rapprochement dure une minute jusqu’à 14 000 ft MSL (1 min 30 au-dessus). Commencez à ralentir 3 minutes avant le repère. Les vitesses d’attente maximales valent pour tous les avions : 200 KIAS jusqu’à 6 000 ft (FAA), 230 kt jusqu’à 14 000 ft (OACI). Cette leçon attend à 90 KIAS (FAA AIM 5-3-8 ; OACI Doc 8168).",
      ),
    }),
    quizStep(`${x}-clearance`, {
      eyebrow: L("Your clearance", "Votre clairance"),
      title: L(
        "Read it back, then picture it",
        "Collationnez, puis visualisez",
      ),
      quote: L(
        "“Hold east of ARD on the 090 radial, maintain 3,000, expect further clearance at 1435Z.”",
        "« Attendez à l’est d’ARD sur le radial 090, maintenez 3 000 ft, autorisation ultérieure prévue à 1435Z. »",
      ),
      quiz: mcq(
        L("So the inbound course is…", "La route de rapprochement est donc…"),
        [
          {
            text: L("270", "270"),
            why: L(
              "Right: on R-090, east of ARD, you fly back to it on 270.",
              "Juste : sur le R-090, à l’est d’ARD, vous y revenez au 270.",
            ),
          },
          {
            text: L("090", "090"),
            why: L(
              "090 is the radial, flown outbound.",
              "090 est le radial, en éloignement.",
            ),
          },
          {
            text: L("360", "360"),
            why: L(
              "That would be a hold south of ARD.",
              "Ce serait une attente au sud d’ARD.",
            ),
          },
        ],
        0,
        L(
          "Inbound 270. No turns stated: right turns. The EFC is a clock time.",
          "Rapprochement 270. Aucun sens donné : à droite. L’EFC est une heure.",
        ),
      ),
      foot: L(
        "FAA AIM 5-3-8 · FAA JO 7110.65 4-6-4",
        "FAA AIM 5-3-8 · FAA JO 7110.65 4-6-4",
      ),
      reader: L(
        "A holding clearance gives the direction from the fix, the fix, the radial or course, the turns if left, the altitude and an expect-further-clearance time. East of ARD on R-090: inbound 270, right turns.",
        "Une clairance d’attente donne la direction par rapport au repère, le repère, le radial ou la route, le sens des virages s’ils sont à gauche, l’altitude et une heure d’autorisation ultérieure. À l’est d’ARD sur le R-090 : rapprochement 270, virages à droite.",
      ),
    }),
    slideStep(
      `${x}-entry`,
      L("Predict your entry", "Prédisez votre entrée"),
      slide("quiz", [
        ...head(
          L("Your entry", "Votre entrée"),
          L(`You arrive on course ${crs}`, `Vous arrivez sur la route ${crs}`),
        ),
        DIAGRAM(
          `${x}-entry.sectors`,
          holdD(),
          L(
            "The three entry sectors of the ARD hold",
            "Les trois secteurs d’entrée de l’attente d’ARD",
          ),
          G.left,
          288,
          960,
          696,
          {
            caption: L(
              "Inbound 270 · right turns · north up",
              "Rapprochement 270 · virages à droite · nord en haut",
            ),
          },
        ),
        DIAGRAM(
          `${x}-entry.you`,
          holdD(p.crs),
          L(
            `The ARD hold with your arrival on ${crs}: ${name.en.toLowerCase()} entry`,
            `L’attente d’ARD avec votre arrivée au ${crs} : entrée ${name.fr!.toLowerCase()}`,
          ),
          G.left,
          288,
          960,
          696,
          {
            reveal: { order: 1, when: "answered" },
            caption: L(
              "Inbound 270 · right turns · north up",
              "Rapprochement 270 · virages à droite · nord en haut",
            ),
          },
        ),
        QUIZ(
          `${x}-entry.q`,
          mcq(
            L(
              `Course ${crs} to ARD. Which entry?`,
              `Route ${crs} vers ARD. Quelle entrée ?`,
            ),
            ENTRIES.map((k) => ({
              text: ENTRY_ROW[k],
              ...(k === e
                ? {
                    why: L(
                      `Right: ${p.turnAtFix.en} at ARD.`,
                      `Juste : ${p.turnAtFix.fr} à ARD.`,
                    ),
                  }
                : {}),
            })),
            ENTRIES.indexOf(e),
            L(
              `${name.en}: at ARD, ${p.turnAtFix.en}. Within 5° of a boundary, either entry is fine.`,
              `${name.fr} : à ARD, ${p.turnAtFix.fr}. À 5° d’une limite, les deux entrées conviennent.`,
            ),
          ),
          1128,
          312,
          672,
          672,
        ),
        foot(
          L(
            "FAA AIM 5-3-8 · FIG 5-3-8 · ICAO Doc 8168 (±5°)",
            "FAA AIM 5-3-8 · FIG 5-3-8 · OACI Doc 8168 (±5°)",
          ),
          960,
        ),
      ]),
      [{ t: "text", text: p.reader }],
      { kind: "quiz", section: "entry", minutes: 2 },
    ),
    heroStep(`${x}-fly-entry`, {
      eyebrow: L("The entry, step by step", "L’entrée, pas à pas"),
      title: L(
        `${name.en}: ${p.turnAtFix.en} at ARD`,
        `${name.fr} : ${p.turnAtFix.fr} à ARD`,
      ),
      visual: [
        DIAGRAM(
          `${x}-fly-entry.d`,
          holdD(p.crs),
          L(
            `Your ${name.en.toLowerCase()} entry from course ${crs}`,
            `Votre entrée ${name.fr!.toLowerCase()} depuis la route ${crs}`,
          ),
          G.left,
          288,
          960,
          696,
        ),
      ],
      points: p.points,
      foot: L("FAA AIM 5-3-8", "FAA AIM 5-3-8"),
      reader: p.reader,
    }),
    formulaStep(`${x}-timing`, {
      eyebrow: L("Timing", "Le chronométrage"),
      title: L(
        "Fix the outbound to get 1:00 inbound",
        "Ajustez l’éloignement pour 1:00",
      ),
      visual: [
        DIAGRAM(
          `${x}-timing.d`,
          {
            kind: "calc",
            calc: {
              kind: "holdWind",
              inbound: H.inbound,
              turn: H.turn,
              windDir: 90,
              windKt: 15,
              tasKt: 90,
            },
          },
          L(
            "The ARD hold with a 15 kt wind from 090: the inbound leg shortens",
            "L’attente d’ARD avec 15 kt de vent du 090 : le rapprochement raccourcit",
          ),
          G.left,
          368,
          960,
          592,
        ),
      ],
      formula: L(
        "{outbound} = 1:00 + (1:00 − {inbound})",
        "{éloignement} = 1:00 + (1:00 − {rapprochement})",
      ),
      units: L(
        "minutes:seconds · correct after each lap",
        "minutes:secondes · corrigez à chaque tour",
      ),
      lines: [
        L(
          "inbound | = !0:45! (15 s short)",
          "rapprochement | = !0:45! (15 s de moins)",
        ),
        L(
          "outbound | = 1:00 + 0:15 = !1:15!",
          "éloignement | = 1:00 + 0:15 = !1:15!",
        ),
      ],
      after: L(
        "Inbound too long? Shorten the outbound the same way.",
        "Rapprochement trop long ? Raccourcissez l’éloignement d’autant.",
      ),
      foot: L(
        "FAA IFH ch. 10 · time the outbound from abeam the fix",
        "FAA IFH ch. 10 · chronométrez l’éloignement depuis le travers",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "outbound = 1:00 + (1:00 − inbound)",
            "éloignement = 1:00 + (1:00 − rapprochement)",
          ),
          ruleOfThumb: L(
            "Today is calm, so 1:00 outbound gives 1:00 inbound. With wind, correct the outbound by the inbound error, the other way: 0:45 inbound → 1:15 outbound (FAA IFH ch. 10).",
            "Aujourd’hui le vent est calme : 1:00 en éloignement donne 1:00 en rapprochement. Avec du vent, corrigez l’éloignement de l’erreur du rapprochement, en sens inverse : 0:45 → 1:15 (FAA IFH ch. 10).",
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 10" }],
        },
      ],
    }),
    yourTurnStep(`${x}-try`, {
      eyebrow: L("At the fix", "Au repère"),
      title: L("The five Ts, then your turn", "Les cinq T, puis à vous"),
      rows: [
        {
          heading: L("Turn", "Virer"),
          small: L(`${p.turnAtFix.en}`, `${p.turnAtFix.fr}`),
        },
        {
          heading: L("Time", "Chrono"),
          small: L(
            entry === "DIRECT" ? "abeam the fix" : "at the fix, 1:00",
            entry === "DIRECT" ? "au travers du repère" : "au repère, 1:00",
          ),
        },
        {
          heading: L("Twist", "Tourner"),
          small: L(
            "the OBS to the inbound 270",
            "l’OBS sur le rapprochement 270",
          ),
        },
        { heading: L("Throttle", "Puissance"), small: L("90 KIAS", "90 KIAS") },
        {
          heading: L("Talk", "Parler"),
          small: L(
            "report entering the hold if asked",
            "annoncez l’entrée si demandé",
          ),
        },
      ],
      view: GAUGE("hsi"),
      alt: L(
        `HSI over ARD, heading ${crs}`,
        `HSI à la verticale d’ARD, cap ${crs}`,
      ),
      scene: `${x}.fix`,
      prompt: L(
        `Your turn: over ARD, ${p.turnAtFix.en}`,
        `À vous : à la verticale d’ARD, ${p.turnAtFix.fr}`,
      ),
      controls: ["bank"],
      goal: {
        all: [{ id: "heading", p: { value: p.fixHdg, tol: 10 } }],
        holdS: 3,
        graded: false,
        success: L(
          "On the entry heading: now the clock.",
          "Au cap d’entrée : maintenant le chrono.",
        ),
      },
      hint: L(
        entry === "PARALLEL"
          ? "Hold the L side of the bank pad."
          : "Hold the R side of the bank pad.",
        entry === "PARALLEL"
          ? "Maintenez le côté L des boutons d’inclinaison."
          : "Maintenez le côté R des boutons d’inclinaison.",
      ),
      foot: L(
        "An instructors’ memory aid · some add a sixth: Track",
        "Un aide-mémoire d’instructeur · certains ajoutent la route",
      ),
      reader: L(
        `At the fix: Turn (${p.turnAtFix.en}), Time, Twist (the OBS to 270), Throttle (90 KIAS), Talk. Your turn: over ARD, ${p.turnAtFix.en} with the bank pad.`,
        `Au repère : Virer (${p.turnAtFix.fr}), Chrono, Tourner (l’OBS sur 270), Puissance (90 KIAS), Parler. À vous : à la verticale d’ARD, ${p.turnAtFix.fr} avec les boutons d’inclinaison.`,
      ),
    }),
    mistakesStep(`${x}-errors`, {
      title: L("What the grader catches", "Ce que l’évaluation détecte"),
      rows: [
        {
          error: L("The wrong entry", "La mauvaise entrée"),
          why: L(
            "The grader compares your entry with the AIM’s.",
            "L’évaluation compare votre entrée à celle de l’AIM.",
          ),
          fix: L("Draw the hold first.", "Dessinez d’abord l’attente."),
        },
        p.mistake,
        {
          error: L("Fast at the fix", "Trop vite au repère"),
          why: L(
            "Above 100 KIAS the turns get wide.",
            "Au-delà de 100 KIAS les virages s’élargissent.",
          ),
          fix: L("Slow to 90, 3 min before.", "90 KIAS, 3 min avant."),
        },
      ],
      foot: L(
        "Lesson standards · FAA AIM 5-3-8",
        "Critères de la leçon · FAA AIM 5-3-8",
      ),
      reader: L(
        `Common mistakes: the wrong entry (the grader compares with AIM FIG 5-3-8), ${p.mistake.error.en.toLowerCase()} (${p.mistake.why.en.toLowerCase()}), and crossing the fix too fast.`,
        `Erreurs fréquentes : la mauvaise entrée (l’évaluation compare à l’AIM FIG 5-3-8), ${p.mistake.error.fr!.toLowerCase()} (${p.mistake.why.fr!.toLowerCase()}), et passer le repère trop vite.`,
      ),
    }),
    readyStep(`${x}-ready`, {
      objectives: [
        L(
          "Pick the entry from your course to ARD",
          "Déterminer l’entrée selon votre route vers ARD",
        ),
        L("Fly it and settle inbound on 270", "La voler et s’établir au 270"),
        L(
          "Adjust the outbound for 1:00 inbound",
          "Ajuster l’éloignement pour 1:00",
        ),
        L(
          "Stay on the holding side, ±100 ft",
          "Rester côté attente, à ±100 ft",
        ),
      ],
      standards: [
        { n: L("±100 ft", "±100 ft"), text: L("altitude", "altitude") },
        {
          n: L("±15 s", "±15 s"),
          text: L("on 1:00 inbound", "sur 1:00 en rapprochement"),
        },
        {
          n: L("<0.6 NM", "<0,6 NM"),
          text: L("non-holding side", "côté non-attente"),
          color: "stop",
        },
        {
          n: name,
          text: L("the AIM entry", "l’entrée de l’AIM"),
          color: "nav",
        },
      ],
      tip: p.tip,
      reader: L(
        "Standards: correct entry, altitude ±100 ft, inbound legs 1:00 ±15 s, less than 0.6 NM on the non-holding side.",
        "Critères : entrée correcte, altitude ±100 ft, rapprochement 1:00 ±15 s, moins de 0,6 NM côté non-attente.",
      ),
    }),
    flyStep(
      `${x}-fly`,
      p.exerciseId,
      L(
        `Fly the lesson: the ${name.en.toLowerCase()} entry`,
        `Volez la leçon : l’entrée ${name.fr!.toLowerCase()}`,
      ),
      L(
        `Course ${crs} to ARD, ${name.en.toLowerCase()} entry, then hold inbound 270 with right turns at 3,000 ft.`,
        `Route ${crs} vers ARD, entrée ${name.fr!.toLowerCase()}, puis attente au 270 par la droite à 3 000 ft.`,
      ),
      [
        L(`At ARD: ${p.turnAtFix.en}.`, `À ARD : ${p.turnAtFix.fr}.`),
        L(
          "Time the outbound from abeam the fix.",
          "Chronométrez l’éloignement depuis le travers.",
        ),
      ],
      12,
      ["wind"],
    ),
  ];
  return briefing(
    {
      id: p.id,
      exerciseId: p.exerciseId,
      title: L(
        `Briefing: holding, ${name.en.toLowerCase()} entry`,
        `Briefing : attente, entrée ${name.fr!.toLowerCase()}`,
      ),
      summary: L(
        `The briefing of the ${name.en.toLowerCase()}-entry lesson: the clearance, your sector, the entry step by step, timing, the five Ts, then fly it.`,
        `Le briefing de la leçon entrée ${name.fr!.toLowerCase()} : la clairance, votre secteur, l’entrée pas à pas, le chronométrage, les cinq T, puis le vol.`,
      ),
      tags: ["ifr", "holding", entry.toLowerCase()],
      minutes: 12,
    },
    steps,
    holdScenes(p),
  );
}

export const holdDirectBriefing = (): Briefing => holdBriefingFor("DIRECT");
export const holdTeardropBriefing = (): Briefing => holdBriefingFor("TEARDROP");
export const holdParallelBriefing = (): Briefing => holdBriefingFor("PARALLEL");
export const HOLD_BLURBS: Record<HoldEntry, L10n> = {
  DIRECT: PLANS.DIRECT.blurb,
  TEARDROP: PLANS.TEARDROP.blurb,
  PARALLEL: PLANS.PARALLEL.blurb,
};
