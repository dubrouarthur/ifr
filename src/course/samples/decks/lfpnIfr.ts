// Ready-to-teach deck (IR, airfields): « IFR à Toussus-le-Noble (LFPN) ». A real airfield under the Paris TMA: the
// field and its two parallel runways (the student drags the wind and the runway in use lights up), the airspace
// around it, the radio, the arrival and its holds (a hold entry to find), the briefing of the ILS 25R, then the
// approach on live instruments in the real navigation data around LFPN (intercept the localizer, hold the 3.5°
// glide path), the minima and the weather (a question), the published missed approach animated, and the approach
// flown in the simulator. Every procedure number comes from lfpnFacts.ts (SIA eAIP France, AIRAC 29 OCT 2026),
// each slide says where; what the facts mark `check` the slide says is « à vérifier sur la carte SIA en vigueur ».
// Training material, not for real-world navigation.
// Teaching sources: FAA-H-8083-15 IFH ch. 9 (ILS, localizer intercept) and ch. 10 (holding entries, missed
// approach); AIM 5-3-8 (hold entries, nav/holding.ts holdEntry()); EASA Air OPS NCO.OP.210 (commencement and
// continuation of an approach: below the RVR minimum, not below 1,000 ft above the aerodrome).
import type {
  Course,
  GoalCheck,
  L10n,
  MotionScript,
  SimScene,
  SlideBlock,
  SlideCanvas,
  Step,
} from "../../types";
import { holdEntry, type HoldEntry } from "../../../nav/holding";
import { bearingDeg, destination, type LatLon } from "../../../nav/geo";
import { simFrameOf } from "../../../nav/world";
import { DEFAULT_GRID } from "../../canvas/geom";
import { G as GR, INST, MARK, T } from "../../canvas/layouts";
import { DIAGRAM, G as GOAL, QUIZ, course, slideStep } from "../kit";
import {
  L,
  SIX,
  coverStep,
  diagramStep,
  gauge,
  goalsStep,
  ideaStep,
  quizStep,
  recapStep,
  simFlightStep,
  sit,
  yourTurnStep,
} from "./kit";
import {
  LFPN,
  LFPN_AIRAC,
  LFPN_ARRIVAL,
  LFPN_CHECK,
  LFPN_DERIVED,
  LFPN_DISCLAIMER,
  LFPN_FREQ,
  LFPN_ILS25R,
  LFPN_LESSON,
  LFPN_MSA,
  LFPN_NAV,
  LFPN_RULES,
  LFPN_RUNWAYS,
  LFPN_SOURCE,
  LFPN_WORLD,
} from "./lfpnFacts";

export const LFPN_DECK_ID = "sample-deck-lfpn-ifr";

// ------------------------------------------------------------------ numbers as the slides write them
/** 1100 → « 1 100 » / "1,100"; 127.48 → « 127,480 » / "127.480" (a frequency keeps its three decimals). */
const nb = (n: number, lang: "en" | "fr"): string =>
  Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, lang === "fr" ? "\u00a0" : ",");
const fq = (f: number, lang: "en" | "fr"): string => {
  const t = f.toFixed(3);
  return lang === "fr" ? t.replace(".", ",") : t;
};
const dc = (n: number, lang: "en" | "fr"): string =>
  lang === "fr" ? String(n).replace(".", ",") : String(n);
/** a bilingual line built from numbers: `(lang) => text` */
const same = (t: string): L10n => ({ en: t, fr: t });
const LN = (f: (lang: "en" | "fr") => string): L10n => ({
  en: f("en"),
  fr: f("fr"),
});
const fl = (n: number) => `FL ${String(n).padStart(3, "0")}`;
const p3 = (n: number) => String(n).padStart(3, "0");

const R07L = LFPN_RUNWAYS[0];
const R07R = LFPN_RUNWAYS[1];
const ILS = LFPN_ILS25R;
const D = LFPN_DERIVED;
const TNO = LFPN_NAV.tno;

// ------------------------------------------------------------------ where the situations are
// The real-world region loaded around LFPN (course/realWorld.ts) turns magnetic north into the simulator's grid
// north about the airfield's reference point (nav/world.ts). The situations are posed in those coordinates, so
// they sit on the real runway once the region is there (and still draw, without the radio aids, before it is).
const sim = (p: LatLon): LatLon => {
  const q = simFrameOf(p, LFPN.arp, LFPN.magVar);
  return {
    lat: Math.round(q.lat * 1e6) / 1e6,
    lon: Math.round(q.lon * 1e6) / 1e6,
  };
};
const THR25R = R07L.thr[1];
/** the extended centreline of the 25R, outwards (true) */
const OUT = bearingDeg(R07L.thr[0], THR25R);
/** a point `nm` out on the 25R approach, `left` NM to the left of the final (south of it) */
const onFinal = (nm: number, left = 0): LatLon => {
  const p = destination(THR25R, OUT, nm);
  return sim(left ? destination(p, OUT + 90, left) : p);
};
/** the glide path's altitude `nm` from the threshold: threshold + RDH + 372 ft per NM */
const glideAlt = (nm: number) => Math.round(D.thrCrossFt + nm * D.ftPerNm);

const ON_ILS = {
  nav1: TNO.loc,
  nav2: TNO.loc,
  obs1: ILS.finalCourse,
  obs2: ILS.finalCourse,
  cdi: "NAV1" as const,
};
/** A situation of the course: the ILS final of the ready situations (its power and trim for 90 kt on a glide
 *  path), moved to LFPN, the radios on TNO. Level situations take the power of a level 90 kt. */
const at = (
  id: string,
  label: string,
  pos: LatLon,
  altFt: number,
  hdg: number,
  vsFpm: number,
): SimScene => {
  const sc = sit(id, "ils27", label, {
    pos: { kind: "free", lat: pos.lat, lon: pos.lon },
    altFt,
    hdg,
    iasKt: LFPN_LESSON.iasKt,
    vsFpm,
    power: vsFpm < -100 ? LFPN_LESSON.glidePower : LFPN_LESSON.levelPower,
    nav1: TNO.ident,
    nav2: TNO.ident,
    obs1: ILS.finalCourse,
    obs2: ILS.finalCourse,
    wind: { dir: 0, kt: 0 },
  });
  // the radios by frequency: the training region (where the course is built) has no TNO
  if (sc.pose.kind === "fields") sc.pose.radios = { ...sc.pose.radios, ...ON_ILS };
  sc.world = { ...LFPN_WORLD, icaos: [...LFPN_WORLD.icaos] };
  return sc;
};
const scenes = (): Record<string, SimScene> => ({
  // 6 NM out on the localizer and the glide path, descending
  "pn.cover": at(
    "pn.cover",
    "LFPN · ILS 25R · 6 NM · on the localizer and the glide",
    onFinal(6),
    glideAlt(6),
    ILS.finalCourse,
    -D.vsFpm,
  ),
  // 11 NM out, 0.7 NM left of the final, at the IF altitude, heading 30° onto the course
  "pn.intercept": at(
    "pn.intercept",
    "LFPN · ILS 25R · 11 NM · 30° intercept at 3,000 ft",
    onFinal(11, 0.7),
    ILS.ifAltFt,
    D.interceptHdg,
    0,
  ),
  // 7 NM out on the localizer, 150 ft above the glide path
  "pn.high": at(
    "pn.high",
    "LFPN · ILS 25R · 7 NM · 150 ft above the glide",
    onFinal(7),
    glideAlt(7) + LFPN_LESSON.highFt,
    ILS.finalCourse,
    -D.vsFpm,
  ),
  // 2 NM out on the glide path: the minima and the missed approach
  "pn.final": at(
    "pn.final",
    "LFPN · ILS 25R · 2 NM · on the glide",
    onFinal(2),
    glideAlt(2),
    ILS.finalCourse,
    -D.vsFpm,
  ),
  // the simulator flight: on the localizer at the IF altitude, the glide path ahead
  "pn.fly": at(
    "pn.fly",
    "LFPN · ILS 25R · 9 NM · 3,000 ft on the localizer",
    onFinal(LFPN_LESSON.flyStartNm),
    ILS.ifAltFt,
    ILS.finalCourse,
    0,
  ),
});

// ------------------------------------------------------------------ animations
/** Above the 3.5° path, the index low; a little more descent and it centres (the VSI shows the 3.5° rate). */
const GLIDE35: MotionScript = {
  duration: 40,
  tracks: {
    gs: [
      [0, -0.4],
      [22, 0],
      [40, 0],
    ],
    cdi: [[0, 0]],
    ias: [[0, LFPN_LESSON.iasKt]],
    rpm: [[0, 1900]],
  },
  telling: 26,
  marks: [
    {
      id: "on",
      channel: "gs",
      value: -0.02,
      label: LN((l) =>
        l === "fr"
          ? `Sur le plan : environ ${D.vsFpm} ft/min`
          : `On the path: about ${D.vsFpm} ft/min`,
      ),
    },
  ],
};
// The last two miles of the ILS 25R, then the published missed approach. From 2 NM on the glide (the scene), the
// DA is reached 0.4 NM before the threshold: (710 − 562) ÷ 372 ft/NM. 1.6 NM at 90 kt ≈ 64 s. Full power, climb
// on the centreline at about 700 ft/min and 74 kt; TSU (by the far end of the runway) about 44 s later, the small
// left turn onto MAG 246°; 1,400 ft reached at about 125 s, then the speed may build. Heights are keyed relative
// to the scene's altitude (the six instruments show the altitude itself).
const T_DA = 64;
const altAt = (ft: number) => ft - glideAlt(2);
const MISSED_TRACKS = {
  hdg: [
    [0, 0],
    [108, 0],
    [112, ILS.missedRm - ILS.finalCourse],
    [132, ILS.missedRm - ILS.finalCourse],
  ] as [number, number][],
  alt: [
    [0, 0],
    [T_DA, altAt(ILS.daFt)],
    [T_DA + 3, altAt(ILS.daFt) + 4],
    [108, altAt(1220)],
    [125, altAt(ILS.accelAltFt)],
    [132, altAt(ILS.accelAltFt) + 60],
  ] as [number, number][],
  ias: [
    [0, LFPN_LESSON.iasKt],
    [T_DA, LFPN_LESSON.iasKt],
    [T_DA + 6, 80],
    [T_DA + 16, 74],
    [125, 74],
    [132, 80],
  ] as [number, number][],
  rpm: [
    [0, 1900],
    [T_DA, 1900],
    [T_DA + 2, 2550],
    [132, 2550],
  ] as [number, number][],
};
const DA_ONLY: MotionScript = {
  duration: 80,
  hdgRef: "start",
  tracks: MISSED_TRACKS,
  telling: T_DA + 1,
  marks: [
    {
      id: "da",
      t: T_DA,
      label: LN((l) =>
        l === "fr"
          ? `DA ${ILS.daFt} ft : on décide`
          : `DA ${ILS.daFt} ft: decide`,
      ),
    },
  ],
};
const MISSED: MotionScript = {
  duration: 132,
  hdgRef: "start",
  tracks: MISSED_TRACKS,
  telling: T_DA + 8,
  marks: [
    {
      id: "da",
      t: T_DA,
      label: LN((l) =>
        l === "fr"
          ? `DA ${ILS.daFt} ft : rien en vue`
          : `DA ${ILS.daFt} ft: nothing in sight`,
      ),
    },
    {
      id: "toga",
      t: T_DA + 3,
      label: L(
        "Full power, climb on the centreline",
        "Plein gaz, montée dans l’axe",
      ),
    },
    {
      id: "tsu",
      t: 109,
      label: LN((l) =>
        l === "fr"
          ? `TSU : à gauche, RM ${ILS.missedRm}°`
          : `TSU: left onto MAG ${ILS.missedRm}°`,
      ),
    },
    {
      id: "acc",
      t: 125,
      label: LN((l) =>
        l === "fr"
          ? `${nb(ILS.accelAltFt, "fr")} ft : on peut accélérer`
          : `${nb(ILS.accelAltFt, "en")} ft: the speed may build`,
      ),
    },
  ],
};

// ------------------------------------------------------------------ slide pieces of this deck
const canvas = (
  blocks: SlideBlock[],
  sceneId: string,
  layout: SlideCanvas["layout"],
): SlideCanvas => ({
  size: { w: 1920, h: 1080 },
  grid: DEFAULT_GRID,
  layout,
  scene: sceneId,
  blocks,
});
const foot = (t: L10n): SlideBlock => T("foot", t, GR.left, GR.foot, 1680, 32);
const src = (what: string): L10n => ({
  en: `${LFPN_SOURCE.en} · ${what}`,
  fr: `${LFPN_SOURCE.fr} · ${what}`,
});
const both = (parts: L10n[]): L10n => ({
  en: parts.map((p) => p.en).join(" "),
  fr: parts.map((p) => p.fr ?? p.en).join(" "),
});
const text = (t: L10n) => ({ t: "text" as const, text: t });
/** Numbered lines (a marker, then the line), revealed one by one. */
const rows = (
  lines: L10n[],
  x: number,
  y: number,
  w: number,
  pitch: number,
  h = pitch - 16,
): SlideBlock[] =>
  lines.flatMap((t, i): SlideBlock[] => [
    MARK(i + 1, x + 28, y + i * pitch + 36, {
      size: 48,
      reveal: i + 1,
      group: `r${i}`,
    }),
    T("body", t, x + 80, y + i * pitch, w - 80, h, {
      reveal: i + 1,
      group: `r${i}`,
    }),
  ]);
/** the « à vérifier » line under a briefing */
const checkLine = (x: number, y: number, w: number, h = 80): SlideBlock =>
  T(
    "small",
    LN((l) =>
      l === "fr"
        ? `Valeurs de l’AIRAC du ${LFPN_AIRAC.cycle}, ${LFPN_CHECK.fr} (prochain cycle : ${LFPN_AIRAC.next}).`
        : `Values of the AIRAC cycle of ${LFPN_AIRAC.cycle}, ${LFPN_CHECK.en} (next cycle: ${LFPN_AIRAC.next}).`,
    ),
    x,
    y,
    w,
    h,
    { color: "muted" },
  );

/** Metres east / north of the reference point (flat earth over a few hundred metres). */
const enu = (p: { lat: number; lon: number }): [number, number] => [
  Math.round(
    (p.lon - LFPN.arp.lon) *
      Math.cos(LFPN.arp.lat * (Math.PI / 180)) *
      60 *
      1852,
  ),
  Math.round((p.lat - LFPN.arp.lat) * 60 * 1852),
];
const STRIPS = () =>
  LFPN_RUNWAYS.map((r) => ({
    ids: [r.ids[0], r.ids[1]] as [string, string],
    qfu: [r.qfu[0], r.qfu[1]] as [number, number],
    ends: [enu(r.thr[0]), enu(r.thr[1])] as [
      [number, number],
      [number, number],
    ],
    widthM: r.widthM,
    dthrM: [r.dthrM[0], r.dthrM[1]] as [number, number],
    label: `${r.lengthM} × ${r.widthM} m`,
  }));

// ------------------------------------------------------------------ the steps
function fieldStep(): Step {
  const id = "pn-field";
  const lines = [
    LN((l) =>
      l === "fr"
        ? `**${nb(LFPN.elevFt, "fr")} ft** : l’altitude du terrain`
        : `**${nb(LFPN.elevFt, "en")} ft**: the aerodrome elevation`,
    ),
    LN((l) =>
      l === "fr"
        ? `**07R** : seuil décalé de ${R07R.dthrM[0]} m, ${nb(R07R.lda[0], "fr")} m pour atterrir`
        : `**07R**: threshold displaced ${R07R.dthrM[0]} m, ${nb(R07R.lda[0], "en")} m to land`,
    ),
    LN((l) =>
      l === "fr"
        ? `**PAPI 25R ${dc(R07L.papiDeg[1], "fr")}°**, comme le glide de l’ILS`
        : `**PAPI 25R ${R07L.papiDeg[1]}°**, like the ILS glide path`,
    ),
  ];
  const title = L(
    "The field: two parallel runways",
    "Le terrain : deux pistes parallèles",
  );
  return slideStep(
    id,
    title,
    canvas(
      [
        T(
          "eyebrow",
          L("1 · The field", "1 · Le terrain"),
          GR.left,
          GR.eyebrowY,
          1680,
          32,
        ),
        T("title", title, GR.left, GR.titleY, 1680, 168),
        {
          ...DIAGRAM(
            `${id}.diagram`,
            {
              kind: "calc",
              calc: {
                kind: "runways",
                strips: STRIPS(),
                windDir: 70,
                windKt: 10,
                drag: ["wind"],
              },
            },
            L(
              "Plan of the runways 07L/25R and 07R/25L of LFPN from their published thresholds, with a wind to drag",
              "Plan des pistes 07L/25R et 07R/25L de LFPN d’après leurs seuils publiés, avec un vent à déplacer",
            ),
            GR.left,
            320,
            1104,
            640,
            { interactive: true },
          ),
        },
        T(
          "small",
          L(
            "Drag the wind: the runway in use lights up.",
            "Faites glisser le vent : la piste en service s’allume.",
          ),
          1296,
          336,
          504,
          88,
          { color: "accent" },
        ),
        ...rows(lines, 1296, 456, 504, 160, 136),
        foot(src("AD 2 LFPN 2.2, 2.12–2.14")),
      ],
      "pn.cover",
      "heroDiagram",
    ),
    [text(both(lines))],
    {
      kind: "try",
      section: "picture",
      minutes: 3,
      notes: LN((l) =>
        l === "fr"
          ? `Deux pistes parallèles : 07L/25R (${nb(R07L.lengthM, "fr")} × ${R07L.widthM} m, l’ILS est sur la 25R) et 07R/25L (${nb(R07R.lengthM, "fr")} m). Faites déplacer le vent à un élève : vent d’ouest, c’est la 25 ; vent d’est, la 07. Le seuil décalé de la 07R raccourcit la distance d’atterrissage. Valeurs AIRAC ${LFPN_AIRAC.cycle}, ${LFPN_DISCLAIMER.fr.toLowerCase()}.`
          : `Two parallel runways: 07L/25R (${nb(R07L.lengthM, "en")} × ${R07L.widthM} m, the ILS is on 25R) and 07R/25L (${nb(R07R.lengthM, "en")} m). Let a student move the wind: westerly, runway 25; easterly, 07. The displaced threshold of 07R shortens the landing distance. AIRAC ${LFPN_AIRAC.cycle} values, ${LFPN_DISCLAIMER.en.toLowerCase()}.`,
      ),
    },
  );
}

/** A question on the left, the facts it rests on in a column on the right. */
function factQuizStep(o: {
  id: string;
  eyebrow: L10n;
  title: L10n;
  options: { text: L10n; why: L10n }[];
  answer: number;
  facts: L10n[];
  check?: boolean;
  source: L10n;
  scene: string;
  notes: L10n;
}): Step {
  return slideStep(
    o.id,
    o.title,
    canvas(
      [
        T("eyebrow", o.eyebrow, GR.left, GR.eyebrowY, 960, 32),
        T("title", o.title, GR.left, GR.titleY, 960, 168),
        QUIZ(
          `${o.id}.q`,
          {
            kind: "mcq",
            prompt: L("Choose one answer", "Choisissez une réponse"),
            options: o.options.map((x) => ({ text: x.text, why: x.why })),
            answer: o.answer,
            explain: o.options[o.answer].why,
          },
          GR.left,
          392,
          960,
          536,
        ),
        ...o.facts.map((t, i) => T("body", t, 1224, 152 + i * 168, 576, 152)),
        ...(o.check ? [checkLine(1224, 152 + o.facts.length * 168, 576, 168)] : []),
        foot(o.source),
      ],
      o.scene,
      "quiz",
    ),
    [text(o.title), text(both(o.facts))],
    { section: "check", minutes: 2, notes: o.notes },
  );
}

/** Facts in numbered rows on the left, a live picture (an instrument or a diagram) on the right. */
function factsStep(o: {
  id: string;
  eyebrow: L10n;
  title: L10n;
  lines: L10n[];
  check?: boolean;
  visual: SlideBlock;
  source: L10n;
  scene: string;
  notes: L10n;
  section?: Step["section"];
}): Step {
  const pitch = o.lines.length > 4 ? 112 : 144;
  return slideStep(
    o.id,
    o.title,
    canvas(
      [
        T("eyebrow", o.eyebrow, GR.left, GR.eyebrowY, 1680, 32),
        T("title", o.title, GR.left, GR.titleY, 1680, 168),
        ...rows(o.lines, GR.left, 336, 1032, pitch),
        ...(o.check
          ? [checkLine(GR.left + 80, 336 + o.lines.length * pitch + 8, 904)]
          : []),
        o.visual,
        foot(o.source),
      ],
      o.scene,
      "heroDiagram",
    ),
    [text(both(o.lines))],
    {
      kind: "explain",
      section: o.section ?? "picture",
      minutes: 2,
      notes: o.notes,
    },
  );
}

const ENTRY_NAME: Record<HoldEntry, L10n> = {
  DIRECT: L("Direct", "Directe"),
  TEARDROP: L("Teardrop", "Décalée (goutte d’eau)"),
  PARALLEL: L("Parallel", "Parallèle"),
};
const ENTRY_WHY: Record<HoldEntry, L10n> = {
  DIRECT: L(
    "Direct: arriving from the sector on the inbound side, you cross the fix and turn outbound.",
    "Directe : on arrive du secteur côté rapprochement, on passe le repère et on vire en éloignement.",
  ),
  TEARDROP: L(
    "Teardrop: for an arrival roughly along the outbound course, from the non-holding side.",
    "Décalée : pour une arrivée à peu près dans l’axe d’éloignement, du côté opposé à l’attente.",
  ),
  PARALLEL: L(
    "Parallel: arriving from the holding side and heading away from it, you fly outbound parallel to the inbound course, then turn back.",
    "Parallèle : on arrive du côté de l’attente en s’en éloignant ; on s’éloigne parallèlement à l’axe, puis on revient.",
  ),
};

export function lfpnIfrCourse(): Course {
  const H = LFPN_ARRIVAL.molba;
  /** the example arrival course to MOLBA (a school example, not a published routing) */
  const toMolba = LFPN_LESSON.molbaCourse;
  const entry = holdEntry(H.inbound, H.turn, toMolba);
  const entries: HoldEntry[] = ["DIRECT", "TEARDROP", "PARALLEL"];
  const IAC = src("IAC ILS ou LOC RWY 25R");

  const steps: Step[] = [
    // 1 ------------------------------------------------------------------ cover
    coverStep({
      id: "pn-cover",
      eyebrow: L("Airfields · IR", "Terrains · IR"),
      title: L(
        "IFR at Toussus-le-Noble (LFPN)",
        "IFR à Toussus-le-Noble (LFPN)",
      ),
      sub: LN((l) =>
        l === "fr"
          ? `Paris Saclay Versailles (indicatif ${LFPN.callsign})`
          : `Paris Saclay Versailles (call sign ${LFPN.callsign})`,
      ),
      lead: L(
        "Under the Paris TMA: the arrival, the ILS 25R, the missed approach to EPR.",
        "Sous la TMA de Paris : l’arrivée, l’ILS 25R, la remise de gaz vers EPR.",
      ),
      source: LN((l) =>
        l === "fr"
          ? `${LFPN_DISCLAIMER.fr} · eAIP France AIRAC ${LFPN_AIRAC.cycle}`
          : `${LFPN_DISCLAIMER.en} · eAIP France AIRAC ${LFPN_AIRAC.cycle}`,
      ),
      view: SIX,
      alt: L(
        "Six instruments on the ILS 25R of LFPN, descending on the 3.5° glide path",
        "Six instruments sur l’ILS 25R de LFPN, en descente sur le glide de 3,5°",
      ),
      scene: "pn.cover",
      motion: { script: GLIDE35 },
      notes: LN((l) =>
        l === "fr"
          ? `Toussus-le-Noble, devenu « Paris Saclay Versailles » (indicatif radio ${LFPN.callsign}) : un terrain très fréquenté, sous la TMA de Paris, entre Orly et Villacoublay. Le cours suit l’eAIP France, cycle AIRAC du ${LFPN_AIRAC.cycle} (cycle suivant : ${LFPN_AIRAC.next}). ${LFPN_DISCLAIMER.fr} : chaque valeur se vérifie sur la carte SIA en vigueur.`
          : `Toussus-le-Noble, now « Paris Saclay Versailles » (radio call sign ${LFPN.callsign}): a busy field under the Paris TMA, between Orly and Villacoublay. The course follows the French eAIP, AIRAC cycle of ${LFPN_AIRAC.cycle} (next cycle: ${LFPN_AIRAC.next}). ${LFPN_DISCLAIMER.en}: check every value on the current SIA chart.`,
      ),
    }),
    // 2 ------------------------------------------------------------------ goals
    goalsStep({
      id: "pn-goals",
      items: [
        L(
          "Read the field: runways, displaced threshold, radio, airspace",
          "Lire le terrain : pistes, seuil décalé, radio, espaces",
        ),
        L(
          "Brief the ILS 25R: minima, MSA, the published missed approach",
          "Briefer l’ILS 25R : minima, MSA, remise de gaz publiée",
        ),
        L(
          "Intercept, hold the course and the 3.5° glide path",
          "Intercepter, tenir l’axe et le plan de 3,5°",
        ),
      ],
      source: LFPN_SOURCE,
      view: gauge("hsi"),
      alt: L(
        "HSI capturing the localizer 25R of LFPN",
        "HSI : capture du localizer 25R de LFPN",
      ),
      scene: "pn.cover",
      motion: { preset: "loc-capture" },
      notes: LN((l) =>
        l === "fr"
          ? `Trois objectifs, un terrain réel. Les instruments de ce cours sont posés dans les vraies données de navigation autour de LFPN : le localizer TNO (${dc(TNO.loc, "fr")}) et son glide de ${dc(TNO.gpDeg, "fr")}°.`
          : `Three goals, one real field. The instruments of this course sit in the real navigation data around LFPN: the localizer TNO (${dc(TNO.loc, "en")}) and its ${TNO.gpDeg}° glide path.`,
      ),
    }),
    // 3 ------------------------------------------------------------------ the field (drag the wind)
    fieldStep(),
    // 4 ------------------------------------------------------------------ airspace (question)
    factQuizStep({
      id: "pn-airspace",
      eyebrow: L("2 · The airspace", "2 · Les espaces"),
      title: L(
        "You want to enter LF-R 35 A. What do you need?",
        "Vous voulez entrer dans la LF-R 35 A. Que vous faut-il ?",
      ),
      options: [
        {
          text: L(
            "The clearance of TOUSSUS TWR and a transponder",
            "La clairance de TOUSSUS Tour et un transpondeur",
          ),
          why: LN((l) =>
            l === "fr"
              ? `Oui : on pénètre la R 35 A (sol–${nb(LFPN_RULES.r35a.ceilFt, "fr")} ft) et la 35 B sur autorisation de la tour, transpondeur mode 3/A obligatoire.`
              : `Yes: R 35 A (surface–${nb(LFPN_RULES.r35a.ceilFt, "en")} ft) and 35 B are entered on the tower's clearance, mode 3/A transponder required.`,
          ),
        },
        {
          text: L(
            "Nothing: the field is class G",
            "Rien : le terrain est en classe G",
          ),
          why: L(
            "The field is class G indeed (no CTR), but the R 35 area is entered on the tower's clearance.",
            "Le terrain est bien en classe G (pas de CTR), mais la zone R 35 se pénètre sur autorisation de la tour.",
          ),
        },
        {
          text: L("A call to ORLY APP", "Un contact avec ORLY Approche"),
          why: L(
            "No: Toussus tower clears the entry into R 35.",
            "Non : c’est la tour de Toussus qui autorise l’entrée dans la R 35.",
          ),
        },
      ],
      answer: 0,
      facts: [
        L(
          "**No CTR**: the field itself is class G",
          "**Pas de CTR** : le terrain est en classe G",
        ),
        LN((l) =>
          l === "fr"
            ? `**R 35 A** sol–${nb(LFPN_RULES.r35a.ceilFt, "fr")} ft · **35 B** ${nb(LFPN_RULES.r35b.floorFt, "fr")}–${nb(LFPN_RULES.r35b.ceilFt, "fr")} ft (ouest)`
            : `**R 35 A** SFC–${nb(LFPN_RULES.r35a.ceilFt, "en")} ft · **35 B** ${nb(LFPN_RULES.r35b.floorFt, "en")}–${nb(LFPN_RULES.r35b.ceilFt, "en")} ft (west)`,
        ),
        LN((l) =>
          l === "fr"
            ? `**Villacoublay** au NE : CTR D sol–${nb(LFPN_RULES.ctrVillaCeilFt, "fr")} ft ; TMA A ${nb(LFPN_RULES.tmaVilla.floorFt, "fr")}–${nb(LFPN_RULES.tmaVilla.ceilFt, "fr")} ft au nord`
            : `**Villacoublay** NE: CTR D SFC–${nb(LFPN_RULES.ctrVillaCeilFt, "en")} ft; TMA A ${nb(LFPN_RULES.tmaVilla.floorFt, "en")}–${nb(LFPN_RULES.tmaVilla.ceilFt, "en")} ft to the north`,
        ),
        LN((l) =>
          l === "fr"
            ? `**TMA Paris** au-dessus (classe ${LFPN_CHECK.fr}) · ${LFPN_RULES.tmaIasKt} kt max sous le FL ${LFPN_RULES.tmaBelowFl} en classe A`
            : `**Paris TMA** above (class: ${LFPN_CHECK.en}) · ${LFPN_RULES.tmaIasKt} kt max below FL ${LFPN_RULES.tmaBelowFl} in class A`,
        ),
      ],
      source: src("AD 2.17, ENR 2.1, ENR 5.1, AD 2 LFPV"),
      scene: "pn.cover",
      notes: LN((l) =>
        l === "fr"
          ? `Le terrain n’a pas de CTR (AD 2.17 : classe G), mais il est entouré : la R 35 de Toussus, la CTR et la TMA de Villacoublay au nord-est, la TMA de Paris au-dessus et Orly à l’est. La classe exacte de la TMA juste au-dessus du terrain est ${LFPN_CHECK.fr} : les cartes d’approche disent « en dessous de 2 500 ft, espace non contrôlé ». Ne l’enseignez pas de mémoire.`
          : `The field has no CTR (AD 2.17: class G), but it is surrounded: Toussus's R 35, the Villacoublay CTR and TMA to the north-east, the Paris TMA above and Orly to the east. The exact class of the TMA right above the field is to be checked on the current SIA chart: the approach charts say « below 2,500 ft, uncontrolled airspace ». Do not teach it from memory.`,
      ),
    }),
    // 5 ------------------------------------------------------------------ radio
    factsStep({
      id: "pn-radio",
      eyebrow: L("3 · Radio", "3 · Radio"),
      title: L(
        "The frequencies, in the order of an arrival",
        "Les fréquences, dans l’ordre d’une arrivée",
      ),
      lines: [
        LN((l) => `**ATIS** ${fq(LFPN_FREQ.atis, l)}`),
        LN((l) =>
          l === "fr"
            ? `**ORLY Approche** ${fq(LFPN_FREQ.orlyApp, l)} · par VEBEK : **DE GAULLE** ${fq(LFPN_FREQ.cdgVebek, l)}`
            : `**ORLY Approach** ${fq(LFPN_FREQ.orlyApp, l)} · via VEBEK: **DE GAULLE** ${fq(LFPN_FREQ.cdgVebek, l)}`,
        ),
        LN((l) =>
          l === "fr"
            ? `**TOUSSUS Tour** ${fq(LFPN_FREQ.tower, l)}`
            : `**TOUSSUS Tower** ${fq(LFPN_FREQ.tower, l)}`,
        ),
        LN((l) =>
          l === "fr"
            ? `**TOUSSUS Sol** ${fq(LFPN_FREQ.ground, l)}, une fois la piste dégagée`
            : `**TOUSSUS Ground** ${fq(LFPN_FREQ.ground, l)}, once off the runway`,
        ),
      ],
      visual: T(
        "body",
        LN((l) =>
          l === "fr"
            ? `**Départs** : VILLA Approche ${fq(LFPN_FREQ.villaApp, l)}\n\n**Tour** ${LFPN.twrUtc.open}–${LFPN.twrUtc.close} UTC (hiver). Hors ATS : auto-information sur ${fq(LFPN_FREQ.tower, l)}, **en français**, usagers basés ; QNH par l’ATIS d’Orly`
            : `**Departures**: VILLA Approach ${fq(LFPN_FREQ.villaApp, l)}\n\n**Tower** ${LFPN.twrUtc.open}–${LFPN.twrUtc.close} UTC (winter). Outside ATS hours: A/A on ${fq(LFPN_FREQ.tower, l)}, **in French**, based users; QNH from the Orly ATIS`,
        ),
        1224,
        336,
        576,
        560,
      ),
      source: src("COM LFPN, AD 2.3, AD 2.18, AD 2.22"),
      scene: "pn.cover",
      notes: LN((l) =>
        l === "fr"
          ? `Faites dire les fréquences dans l’ordre : ATIS, approche, tour, sol. Après l’atterrissage, on passe au sol de soi-même une fois la piste dégagée. Hors horaires ATS, le terrain est interdit aux non-basés (sauf dérogation DSAC Nord) : l’auto-information se fait en français uniquement.`
          : `Have the class say the frequencies in order: ATIS, approach, tower, ground. After landing, change to ground on your own once off the runway. Outside ATS hours the field is closed to non-based aircraft (unless the DSAC Nord grants an exemption): A/A is in French only.`,
      ),
    }),
    // 6 ------------------------------------------------------------------ arrival and holds
    factsStep({
      id: "pn-arrival",
      eyebrow: L("4 · Arrival", "4 · Arrivée"),
      title: L(
        "Three IAFs, then radar vectors",
        "Trois IAF, puis le guidage radar",
      ),
      lines: [
        L(
          "**IAF**: ODILO, MOLBA, VEBEK (conventional and RNAV initial approaches)",
          "**IAF** : ODILO, MOLBA, VEBEK (INA conventionnelles et RNAV)",
        ),
        LN((l) =>
          l === "fr"
            ? `**Attente MOLBA** : ${p3(H.inbound)}°, virages à droite, ${H.legMin} min, ${fl(H.minFl)}–${fl(H.maxFl)}, ${H.maxIasKt} kt max`
            : `**MOLBA hold**: ${p3(H.inbound)}°, right turns, ${H.legMin} min, ${fl(H.minFl)}–${fl(H.maxFl)}, ${H.maxIasKt} kt max`,
        ),
        LN((l) =>
          l === "fr"
            ? `**Attente ODILO** : ${p3(LFPN_ARRIVAL.odilo.inbound)}°, à droite, ${LFPN_ARRIVAL.odilo.dmeFrom}–${LFPN_ARRIVAL.odilo.dmeTo} NM RBT, ${fl(LFPN_ARRIVAL.odilo.minFl)}–${fl(LFPN_ARRIVAL.odilo.maxFl)}`
            : `**ODILO hold**: ${p3(LFPN_ARRIVAL.odilo.inbound)}°, right, ${LFPN_ARRIVAL.odilo.dmeFrom}–${LFPN_ARRIVAL.odilo.dmeTo} NM RBT, ${fl(LFPN_ARRIVAL.odilo.minFl)}–${fl(LFPN_ARRIVAL.odilo.maxFl)}`,
        ),
        L(
          "After the initial approach, **radar vectors** to the final",
          "Après l’INA, **guidage radar** jusqu’à l’axe final",
        ),
      ],
      check: true,
      visual: DIAGRAM(
        "pn-arrival.hold",
        {
          kind: "hold",
          inbound: H.inbound,
          turn: H.turn,
          fix: H.fix,
          quiet: true,
        },
        LN((l) =>
          l === "fr"
            ? `L’attente de MOLBA : rapprochement ${p3(H.inbound)}°, virages à droite`
            : `The MOLBA hold: inbound ${p3(H.inbound)}°, right turns`,
        ),
        1176,
        320,
        624,
        600,
      ),
      source: src("IAC INA LFPN, AD 2.22"),
      scene: "pn.cover",
      notes: LN((l) =>
        l === "fr"
          ? `Les arrivées se font par trois IAF ; ensuite le contrôle guide au radar jusqu’à l’axe. Les trajectoires des INA et les procédures en cas de panne radio sont propres à chaque carte : lisez-les sur la carte SIA en vigueur, ne les résumez pas. MOLBA et ODILO ont chacun leur attente.`
          : `Arrivals come through three IAFs; then ATC vectors to the final. The initial approach routings and the radio failure procedures belong to each chart: read them on the current SIA chart, do not summarise them. MOLBA and ODILO each have a hold.`,
      ),
    }),
    // 7 ------------------------------------------------------------------ the hold entry (question)
    slideStep(
      "pn-hold-entry",
      LN((l) =>
        l === "fr"
          ? `Direct MOLBA au cap ${p3(toMolba)} : quelle entrée ?`
          : `Direct MOLBA heading ${p3(toMolba)}: which entry?`,
      ),
      canvas(
        [
          T(
            "eyebrow",
            L("Question · a school example", "Question · exemple d’école"),
            GR.left,
            GR.eyebrowY,
            960,
            32,
          ),
          T(
            "title",
            LN((l) =>
              l === "fr"
                ? `Direct MOLBA au cap ${p3(toMolba)} : quelle entrée ?`
                : `Direct MOLBA heading ${p3(toMolba)}: which entry?`,
            ),
            GR.left,
            GR.titleY,
            960,
            168,
          ),
          QUIZ(
            "pn-hold-entry.q",
            {
              kind: "mcq",
              prompt: L("Choose the entry", "Choisissez l’entrée"),
              options: entries.map((e) => ({
                text: ENTRY_NAME[e],
                why:
                  e === entry
                    ? ENTRY_WHY[e]
                    : both([L("Not this one.", "Pas celle-ci."), ENTRY_WHY[e]]),
              })),
              answer: entries.indexOf(entry),
              explain: ENTRY_WHY[entry],
            },
            GR.left,
            392,
            960,
            536,
          ),
          DIAGRAM(
            "pn-hold-entry.hold",
            {
              kind: "hold",
              inbound: H.inbound,
              turn: H.turn,
              fix: H.fix,
              crs: toMolba,
            },
            LN((l) =>
              l === "fr"
                ? `L’attente de MOLBA et ses secteurs d’entrée, arrivée au cap ${p3(toMolba)}`
                : `The MOLBA hold and its entry sectors, arriving heading ${p3(toMolba)}`,
            ),
            1104,
            176,
            696,
            784,
            {
              caption: LN((l) =>
                l === "fr"
                  ? `Attente MOLBA : rapprochement ${p3(H.inbound)}°, virages à droite`
                  : `MOLBA hold: inbound ${p3(H.inbound)}°, right turns`,
              ),
            },
          ),
          foot(src("IAC INA MOLBA · FAA AIM 5-3-8")),
        ],
        "pn.cover",
        "quiz",
      ),
      [
        text(
          L(
            "Which entry into the MOLBA hold?",
            "Quelle entrée dans l’attente de MOLBA ?",
          ),
        ),
      ],
      {
        section: "check",
        minutes: 2,
        notes: LN((l) =>
          l === "fr"
            ? `Exemple d’école : le cap d’arrivée n’est pas une trajectoire publiée. Faites placer le cap ${p3(toMolba)} sur le schéma avant de répondre : on arrive du côté de l’attente en s’en éloignant, c’est une entrée ${ENTRY_NAME[entry].fr?.toLowerCase()}.`
            : `A school example: the arrival heading is not a published routing. Have the class place heading ${p3(toMolba)} on the drawing before answering: arriving from the holding side, heading away from it, it is a ${ENTRY_NAME[entry].en.toLowerCase()} entry.`,
        ),
      },
    ),
    // 8 ------------------------------------------------------------------ the approach briefing
    factsStep({
      id: "pn-brief",
      eyebrow: L("5 · Briefing", "5 · Briefing"),
      title: L("The briefing of the ILS 25R", "Le briefing de l’ILS 25R"),
      lines: [
        LN((l) =>
          l === "fr"
            ? `LOC **${dc(TNO.loc, l)} ${TNO.ident}** · axe **${p3(ILS.finalCourse)}°** · glide **${dc(ILS.gpDeg, l)}°** (${dc(ILS.gpPct, l)} %)`
            : `LOC **${dc(TNO.loc, l)} ${TNO.ident}** · course **${p3(ILS.finalCourse)}°** · glide **${ILS.gpDeg}°** (${ILS.gpPct} %)`,
        ),
        LN((l) =>
          l === "fr"
            ? `IF **${dc(ILS.ifDme, l)} DME ${TNO.ident}, ${nb(ILS.ifAltFt, l)} ft** · FAF **${dc(ILS.fafDme, l)} DME**`
            : `IF **${ILS.ifDme} DME ${TNO.ident}, ${nb(ILS.ifAltFt, l)} ft** · FAF **${ILS.fafDme} DME**`,
        ),
        LN((l) =>
          l === "fr"
            ? `ILS : **DA ${ILS.daFt} ft (${ILS.dhFt})**, RVR ${ILS.rvrIlsM} m · LOC : **MDA ${ILS.mdaLocFt} ft (${ILS.mdhLocFt})**, RVR ${nb(ILS.rvrLocM, l)} m`
            : `ILS: **DA ${ILS.daFt} ft (${ILS.dhFt})**, RVR ${ILS.rvrIlsM} m · LOC: **MDA ${ILS.mdaLocFt} ft (${ILS.mdhLocFt})**, RVR ${nb(ILS.rvrLocM, l)} m`,
        ),
        LN((l) =>
          l === "fr"
            ? `MSA **${nb(LFPN_MSA.convFt, l)} ft** (${LFPN_MSA.convNm} NM TSU) · cartes RNAV **${nb(LFPN_MSA.rnavFt, l)} ft**`
            : `MSA **${nb(LFPN_MSA.convFt, l)} ft** (${LFPN_MSA.convNm} NM TSU) · RNAV charts **${nb(LFPN_MSA.rnavFt, l)} ft**`,
        ),
        LN((l) =>
          l === "fr"
            ? `Remise de gaz : dans l’axe ; à TSU, à gauche **RM ${ILS.missedRm}°**, **${nb(ILS.missedAltFt, l)} ft**, vers EPR`
            : `Missed approach: on the centreline; at TSU, left **MAG ${ILS.missedRm}°**, **${nb(ILS.missedAltFt, l)} ft**, to EPR`,
        ),
      ],
      check: true,
      visual: {
        ...INST(
          gauge("hsi"),
          LN((l) =>
            l === "fr"
              ? `HSI sur l’ILS 25R : axe ${p3(ILS.finalCourse)}°, localizer et glide centrés`
              : `HSI on the ILS 25R: course ${p3(ILS.finalCourse)}°, localizer and glide path centred`,
          ),
          1248,
          336,
          552,
          552,
          { id: "pn-brief.inst", scene: "pn.cover" },
        ),
        motion: { script: GLIDE35, loop: true },
      } as SlideBlock,
      source: IAC,
      scene: "pn.cover",
      section: "technique",
      notes: LN((l) =>
        l === "fr"
          ? `Le briefing se fait carte en main : celle du cycle en vigueur. Les minima, les distances et l’axe ci-contre viennent du cycle du ${LFPN_AIRAC.cycle} ; vérifiez-les avant de les enseigner. La carte exige « VOR et DME requis » et précise que le glide n’est utilisable que par un récepteur ILS au pas de 50 kHz.`
          : `Brief with the chart in hand: the current cycle's. The minima, distances and course here come from the cycle of ${LFPN_AIRAC.cycle}; check them before teaching. The chart requires « VOR and DME » and says the glide path is usable only by an ILS receiver with 50 kHz spacing.`,
      ),
    }),
    // 9 ------------------------------------------------------------------ question: the DA
    quizStep({
      id: "pn-quiz-da",
      title: L(
        "On the ILS 25R, where do you decide?",
        "Sur l’ILS 25R, à quelle altitude décidez-vous ?",
      ),
      options: [
        {
          text: same(`${ILS.daFt} ft`),
          why: LN((l) =>
            l === "fr"
              ? `Oui : la DA de l’ILS, ${ILS.daFt} ft (${ILS.dhFt} ft de hauteur de décision publiée). ${LFPN_CHECK.fr[0].toUpperCase()}${LFPN_CHECK.fr.slice(1)}.`
              : `Yes: the ILS DA, ${ILS.daFt} ft (a published decision height of ${ILS.dhFt} ft). ${LFPN_CHECK.en[0].toUpperCase()}${LFPN_CHECK.en.slice(1)}.`,
          ),
        },
        {
          text: same(`${ILS.mdaLocFt} ft`),
          why: L(
            "That is the MDA of the localizer-only approach, when the glide path is not used.",
            "C’est la MDA de l’approche LOC seule, quand le glide n’est pas utilisé.",
          ),
        },
        {
          text: same(`${LFPN.elevFt} ft`),
          why: L(
            "That is the aerodrome elevation: far too low to decide.",
            "C’est l’altitude du terrain : bien trop bas pour décider.",
          ),
        },
      ],
      answer: 0,
      source: IAC,
      view: gauge("alt"),
      alt: LN((l) =>
        l === "fr"
          ? `Altimètre jusqu’à la DA de l’ILS 25R, ${ILS.daFt} ft`
          : `Altimeter down to the DA of the ILS 25R, ${ILS.daFt} ft`,
      ),
      scene: "pn.final",
      motion: { script: DA_ONLY },
      notes: LN((l) =>
        l === "fr"
          ? `L’altimètre descend jusqu’à la DA en temps réel : faites dire « décision » à ${ILS.daFt} ft. Rappelez la différence ILS / LOC : sans glide, ce sont les minima LOC (MDA ${ILS.mdaLocFt} ft).`
          : `The altimeter comes down to the DA in real time: have the class say « decide » at ${ILS.daFt} ft. Recall ILS against LOC: without the glide path, the LOC minima apply (MDA ${ILS.mdaLocFt} ft).`,
      ),
    }),
    // 10 ------------------------------------------------------------------ your turn: the intercept
    yourTurnStep({
      id: "pn-intercept",
      title: LN((l) =>
        l === "fr"
          ? `Interceptez le localizer 25R, tenez l’axe ${p3(ILS.finalCourse)}`
          : `Intercept the localizer 25R, hold ${p3(ILS.finalCourse)}`,
      ),
      control: L(
        "**Bank**: drag left, or − and +. Back to the middle: wings level. Altitude and speed are held for you.",
        "**Inclinaison** : glissez vers la gauche, ou − et +. Au milieu : ailes à plat. Altitude et vitesse tenues pour vous.",
      ),
      rows: [
        {
          text: L(
            "Localizer: within 1 dot, 8 s",
            "Localizer : à moins d’un point, 8 s",
          ),
          check: 0,
          readout: "cdiDots",
        },
        {
          text: LN((l) =>
            l === "fr"
              ? `Cap ${p3(ILS.finalCourse)} à ${LFPN_LESSON.hdgTol}° près`
              : `Heading ${p3(ILS.finalCourse)} within ${LFPN_LESSON.hdgTol}°`,
          ),
          check: 1,
          readout: "hdg",
        },
      ],
      tip: LN((l) =>
        l === "fr"
          ? `Environ ${LFPN_LESSON.bankDeg}° d’inclinaison, quand la barre commence à bouger, pas quand elle est centrée : le localizer est 4 fois plus sensible qu’un VOR.`
          : `About ${LFPN_LESSON.bankDeg}° of bank, when the bar starts to move, not when it is centred: the localizer is 4 times as sensitive as a VOR.`,
      ),
      source: src("IAC ILS 25R · FAA IFH ch. 9"),
      view: gauge("hsi"),
      alt: LN((l) =>
        l === "fr"
          ? `HSI en direct : localizer 25R de LFPN, cap ${p3(D.interceptHdg)} à ${nb(ILS.ifAltFt, l)} ft`
          : `Live HSI: localizer 25R of LFPN, heading ${p3(D.interceptHdg)} at ${nb(ILS.ifAltFt, l)} ft`,
      ),
      scene: "pn.intercept",
      controls: ["bank"],
      assist: { holdAlt: true, holdIas: true },
      prompt: LN((l) =>
        l === "fr"
          ? `Interceptez le localizer et tenez le cap ${p3(ILS.finalCourse)}`
          : `Intercept the localizer and hold heading ${p3(ILS.finalCourse)}`,
      ),
      goal: [GOAL.cdi(1), GOAL.heading(ILS.finalCourse, LFPN_LESSON.hdgTol)],
      holdS: LFPN_LESSON.holdS,
      success: L(
        "Established on the localizer 25R: the bar is centred, the heading holds the course.",
        "Établi sur le localizer 25R : la barre est centrée, le cap tient l’axe.",
      ),
      hint: LN((l) =>
        l === "fr"
          ? `La barre est à droite : l’axe est à votre droite, le cap ${p3(D.interceptHdg)} vous en rapproche. Quand elle bouge, inclinez à gauche vers le cap ${p3(ILS.finalCourse)}.`
          : `The bar is on the right: the course is to your right, heading ${p3(D.interceptHdg)} closes it. When it moves, bank left towards heading ${p3(ILS.finalCourse)}.`,
      ),
      notes: LN((l) =>
        l === "fr"
          ? `Donnez les commandes à un élève. Il est à ${nb(ILS.ifAltFt, l)} ft (l’altitude de l’IF), ${LFPN_LESSON.interceptDeg}° d’interception. L’erreur classique : attendre que la barre soit centrée pour virer, et traverser l’axe.`
          : `Hand the controls to a student. He is at ${nb(ILS.ifAltFt, l)} ft (the IF altitude), a ${LFPN_LESSON.interceptDeg}° intercept. The classic error: waiting for the bar to centre before turning, and flying through the course.`,
      ),
    }),
    // 11 ------------------------------------------------------------------ the 3.5° glide path
    diagramStep({
      id: "pn-glide",
      eyebrow: L("6 · The glide path", "6 · Le plan"),
      title: LN((l) =>
        l === "fr"
          ? `Un glide de ${dc(ILS.gpDeg, l)}° : plus raide que d’habitude`
          : `A ${ILS.gpDeg}° glide path: steeper than usual`,
      ),
      diagram: {
        d: {
          kind: "calc",
          calc: {
            kind: "profile",
            fromFt: ILS.ifAltFt,
            toFt: ILS.daFt,
            angleDeg: ILS.gpDeg,
            gsKt: LFPN_LESSON.iasKt,
          },
        },
        alt: LN((l) =>
          l === "fr"
            ? `Le plan de ${dc(ILS.gpDeg, l)}° : ${D.ftPerNm} ft par NM, ${D.vsFpm} ft/min à ${LFPN_LESSON.iasKt} kt`
            : `The ${ILS.gpDeg}° path: ${D.ftPerNm} ft per NM, ${D.vsFpm} ft/min at ${LFPN_LESSON.iasKt} kt`,
        ),
      },
      lines: [
        {
          text: LN((l) =>
            l === "fr"
              ? `**${D.ftPerNm} ft par NM** (${D.ftPerNm3} sur un plan de 3°)`
              : `**${D.ftPerNm} ft per NM** (${D.ftPerNm3} on a 3° path)`,
          ),
        },
        {
          text: LN((l) =>
            l === "fr"
              ? `Vario : **${D.ftPerNm} × ${LFPN_LESSON.iasKt} ÷ 60 ≈ ${D.vsFpm}** ft/min`
              : `VSI: **${D.ftPerNm} × ${LFPN_LESSON.iasKt} ÷ 60 ≈ ${D.vsFpm}** ft/min`,
          ),
          dot: { g: "vsi", moment: "on" },
        },
      ],
      source: src("AD 2.19 · IAC ILS 25R · PAPI AD 2.14"),
      g: "vsi",
      alt: LN((l) =>
        l === "fr"
          ? `Vario sur le glide de ${dc(ILS.gpDeg, l)}° de la 25R`
          : `VSI on the ${ILS.gpDeg}° glide path of 25R`,
      ),
      scene: "pn.cover",
      motion: { script: GLIDE35 },
      notes: LN((l) =>
        l === "fr"
          ? `${dc(ILS.gpDeg, l)}° au lieu de 3° : la règle « 5 × la vitesse sol » sous-estime le vario d’environ 15 %. Le PAPI de la 25R est calé à ${dc(R07L.papiDeg[1], l)}° lui aussi. Vent de face : la vitesse sol baisse, le vario aussi.`
          : `${ILS.gpDeg}° instead of 3°: the « 5 × the ground speed » rule underestimates the descent rate by about 15 %. The 25R PAPI is set at ${R07L.papiDeg[1]}° too. With a headwind the ground speed drops, and so does the descent rate.`,
      ),
    }),
    // 12 ------------------------------------------------------------------ your turn: on the glide path
    yourTurnStep({
      id: "pn-try-glide",
      title: L(
        "You are high: rejoin the glide path",
        "Vous êtes haut : rejoignez le glide",
      ),
      control: L(
        "**Pitch**: down for more descent, up for less. The speed is held for you.",
        "**Assiette** : vers le bas pour descendre plus, vers le haut pour moins. La vitesse est tenue pour vous.",
      ),
      rows: [
        {
          text: L(
            "Glide: index within half a dot",
            "Glide : index à moins d’un demi-point",
          ),
          check: 0,
          readout: "gsDots",
        },
        {
          text: LN((l) =>
            l === "fr"
              ? `Vario entre −${LFPN_LESSON.vsBand[1]} et −${LFPN_LESSON.vsBand[0]} ft/min, ${LFPN_LESSON.holdS} s`
              : `VSI between −${LFPN_LESSON.vsBand[1]} and −${LFPN_LESSON.vsBand[0]} ft/min, ${LFPN_LESSON.holdS} s`,
          ),
          check: 1,
          readout: "vs",
        },
      ],
      tip: LN((l) =>
        l === "fr"
          ? `Un peu plus de descente pour rejoindre, puis environ ${D.vsFpm} ft/min pour y rester.`
          : `A little more descent to rejoin, then about ${D.vsFpm} ft/min to stay on it.`,
      ),
      source: src("IAC ILS 25R · FAA IFH ch. 9"),
      view: gauge("cdi"),
      alt: LN((l) =>
        l === "fr"
          ? `CDI en direct sur l’ILS 25R, ${LFPN_LESSON.highFt} ft au-dessus du glide`
          : `Live CDI on the ILS 25R, ${LFPN_LESSON.highFt} ft above the glide`,
      ),
      scene: "pn.high",
      controls: ["pitch"],
      assist: { holdIas: true },
      prompt: L(
        "Rejoin the glide path and hold its descent rate",
        "Rejoignez le glide et tenez son taux de descente",
      ),
      goal: [
        { id: "gsDefl", p: { maxDots: 0.5 } } as GoalCheck,
        GOAL.vs(-LFPN_LESSON.vsBand[1], -LFPN_LESSON.vsBand[0]),
      ],
      holdS: LFPN_LESSON.holdS,
      success: LN((l) =>
        l === "fr"
          ? `Sur le glide de ${dc(ILS.gpDeg, l)}° : l’index est centré, le vario fait environ ${D.vsFpm} ft/min.`
          : `On the ${ILS.gpDeg}° glide path: the index is centred, the descent is about ${D.vsFpm} ft/min.`,
      ),
      hint: L(
        "Index low: you are high. Lower the nose a little, then come back to the glide's rate.",
        "Index en bas : vous êtes haut. Baissez un peu le nez, puis revenez au vario du glide.",
      ),
      notes: L(
        "The steeper path surprises: the usual 500 ft/min leaves the aircraft above it. Ask for the number before handing over.",
        "Le plan plus raide surprend : les 500 ft/min habituels laissent l’avion au-dessus. Demandez le chiffre avant de donner les commandes.",
      ),
    }),
    // 13 ------------------------------------------------------------------ minima and weather (question)
    factQuizStep({
      id: "pn-minima",
      eyebrow: L("7 · Minima", "7 · Minima"),
      title: LN((l) =>
        l === "fr"
          ? `Glide hors service, RVR ${nb(LFPN_LESSON.rvrExampleM, l)} m : vous poursuivez ?`
          : `Glide path out of service, RVR ${nb(LFPN_LESSON.rvrExampleM, l)} m: do you go on?`,
      ),
      options: [
        {
          text: LN((l) =>
            l === "fr"
              ? `Pas sous ${nb(LFPN_LESSON.banFt, l)} ft au-dessus du terrain`
              : `Not below ${nb(LFPN_LESSON.banFt, l)} ft above the field`,
          ),
          why: LN((l) =>
            l === "fr"
              ? `Oui : sans glide, ce sont les minima LOC (RVR ${nb(ILS.rvrLocM, l)} m). RVR inférieure : on ne poursuit pas sous ${nb(LFPN_LESSON.banFt, l)} ft au-dessus du terrain (NCO.OP.210).`
              : `Yes: without the glide path the LOC minima apply (RVR ${nb(ILS.rvrLocM, l)} m). Below it, the approach is not continued below ${nb(LFPN_LESSON.banFt, l)} ft above the aerodrome (NCO.OP.210).`,
          ),
        },
        {
          text: LN((l) =>
            l === "fr"
              ? `Oui : il faut ${ILS.rvrIlsM} m pour l’ILS`
              : `Yes: the ILS needs ${ILS.rvrIlsM} m`,
          ),
          why: L(
            "Without the glide path it is no longer an ILS: the LOC minima apply.",
            "Sans glide, ce n’est plus un ILS : ce sont les minima LOC qui comptent.",
          ),
        },
        {
          text: LN((l) =>
            l === "fr"
              ? `Oui, jusqu’à ${ILS.daFt} ft`
              : `Yes, down to ${ILS.daFt} ft`,
          ),
          why: LN((l) =>
            l === "fr"
              ? `${ILS.daFt} ft est la DA de l’ILS ; en LOC, pas sous la MDA de ${ILS.mdaLocFt} ft.`
              : `${ILS.daFt} ft is the ILS DA; on the LOC, not below the MDA of ${ILS.mdaLocFt} ft.`,
          ),
        },
      ],
      answer: 0,
      facts: [
        LN((l) =>
          l === "fr"
            ? `**ILS** : DA ${ILS.daFt} ft (${ILS.dhFt}), RVR **${ILS.rvrIlsM} m**`
            : `**ILS**: DA ${ILS.daFt} ft (${ILS.dhFt}), RVR **${ILS.rvrIlsM} m**`,
        ),
        LN((l) =>
          l === "fr"
            ? `**LOC** : MDA ${ILS.mdaLocFt} ft (${ILS.mdhLocFt}), RVR **${nb(ILS.rvrLocM, l)} m**`
            : `**LOC**: MDA ${ILS.mdaLocFt} ft (${ILS.mdhLocFt}), RVR **${nb(ILS.rvrLocM, l)} m**`,
        ),
        L(
          "TAF and TREND come from **Paris Orly**; METAR AUTO outside hours",
          "TAF et TREND viennent de **Paris Orly** ; METAR AUTO hors horaires",
        ),
      ],
      check: true,
      source: src("IAC ILS ou LOC 25R, AD 2.11 · EASA NCO.OP.210"),
      scene: "pn.final",
      notes: LN((l) =>
        l === "fr"
          ? `On peut commencer l’approche quelle que soit la RVR annoncée ; si elle est sous les minima, on ne la poursuit pas sous ${nb(LFPN_LESSON.banFt, l)} ft au-dessus du terrain (NCO.OP.210). Le piège : appliquer la RVR de l’ILS à une approche LOC. Les minima sont ${LFPN_CHECK.fr}.`
          : `The approach may be started whatever the reported RVR; if it is below the minima, it is not continued below ${nb(LFPN_LESSON.banFt, l)} ft above the aerodrome (NCO.OP.210). The trap: applying the ILS RVR to a LOC approach. Check the minima on the current SIA chart.`,
      ),
    }),
    // 14 ------------------------------------------------------------------ the published missed approach, animated
    ideaStep({
      id: "pn-missed",
      eyebrow: L("8 · Missed approach", "8 · Remise de gaz"),
      title: L(
        "The published missed approach, flown",
        "La remise de gaz publiée, en vol",
      ),
      lines: [
        {
          text: LN((l) =>
            l === "fr"
              ? `**DA ${ILS.daFt} ft**, rien en vue : plein gaz, montée dans l’axe`
              : `**DA ${ILS.daFt} ft**, nothing in sight: full power, climb on the centreline`,
          ),
          dot: { g: "alt", moment: "da" },
        },
        {
          text: LN((l) =>
            l === "fr"
              ? `**TSU** : à gauche **RM ${ILS.missedRm}°**, vers **${nb(ILS.missedAltFt, l)} ft** et EPR`
              : `**TSU**: left onto **MAG ${ILS.missedRm}°**, to **${nb(ILS.missedAltFt, l)} ft** and EPR`,
          ),
          dot: { g: "hsi", moment: "tsu" },
        },
        {
          text: LN((l) =>
            l === "fr"
              ? `**${nb(ILS.accelAltFt, l)} ft** avant d’accélérer en palier`
              : `**${nb(ILS.accelAltFt, l)} ft** before accelerating in level flight`,
          ),
          dot: { g: "asi", moment: "acc" },
        },
      ],
      source: IAC,
      view: SIX,
      alt: LN((l) =>
        l === "fr"
          ? `Six instruments : la DA de l’ILS 25R, puis la remise de gaz publiée vers ${nb(ILS.missedAltFt, l)} ft`
          : `Six instruments: the DA of the ILS 25R, then the published missed approach to ${nb(ILS.missedAltFt, l)} ft`,
      ),
      scene: "pn.final",
      motion: { script: MISSED },
      notes: LN((l) =>
        l === "fr"
          ? `Le texte de la carte : « ${ILS.missed.fr} » Lisez-le, puis rejouez l’animation (« Rejouer l’animation ») : le régime d’abord, l’assiette, le vario positif, le petit virage à gauche à TSU. Valeurs ${LFPN_CHECK.fr}.`
          : `The chart says: « ${ILS.missed.en} » Read it, then replay the animation (« Rejouer l’animation »): the RPM first, the attitude, the positive climb, the small left turn at TSU. Check the values on the current SIA chart.`,
      ),
      minutes: 3,
    }),
    // 15 ------------------------------------------------------------------ question: when to accelerate
    quizStep({
      id: "pn-quiz-missed",
      title: L(
        "In the missed approach, when may you accelerate in level flight?",
        "En remise de gaz, quand pouvez-vous accélérer en palier ?",
      ),
      options: [
        {
          text: LN((l) => `${nb(ILS.accelAltFt, l)} ft`),
          why: LN((l) =>
            l === "fr"
              ? `Oui : « Monter à ${nb(ILS.accelAltFt, l)} (${ILS.accelHgtFt}) avant d’accélérer en palier », sur toutes les remises de gaz de LFPN.`
              : `Yes: « Climb to ${nb(ILS.accelAltFt, l)} (${ILS.accelHgtFt}) before accelerating in level flight », on every missed approach of LFPN.`,
          ),
        },
        {
          text: L("At the DA", "Dès la DA"),
          why: L(
            "No: at the DA you climb straight ahead first; the speed waits.",
            "Non : à la DA on monte d’abord dans l’axe ; la vitesse attend.",
          ),
        },
        {
          text: LN((l) => `${nb(ILS.missedAltFt, l)} ft`),
          why: LN((l) =>
            l === "fr"
              ? `${nb(ILS.missedAltFt, l)} ft est l’altitude de la remise de gaz ; on peut accélérer dès ${nb(ILS.accelAltFt, l)} ft.`
              : `${nb(ILS.missedAltFt, l)} ft is the missed approach altitude; the speed may build from ${nb(ILS.accelAltFt, l)} ft.`,
          ),
        },
      ],
      answer: 0,
      source: IAC,
      view: gauge("alt"),
      alt: LN((l) =>
        l === "fr"
          ? `Altimètre : la DA puis la montée vers ${nb(ILS.accelAltFt, l)} ft`
          : `Altimeter: the DA then the climb to ${nb(ILS.accelAltFt, l)} ft`,
      ),
      scene: "pn.final",
      motion: { script: MISSED },
      notes: L(
        "A noise rule as much as an obstacle one: climb first. Ask the class to recite the missed approach in three parts.",
        "Une règle de bruit autant que d’obstacles : on monte d’abord. Faites réciter la remise de gaz en trois temps.",
      ),
    }),
    // 16 ------------------------------------------------------------------ the simulator
    simFlightStep({
      id: "pn-fly",
      title: L(
        "In the simulator: the ILS 25R of LFPN down to the DA",
        "Au simulateur : l’ILS 25R de LFPN jusqu’à la DA",
      ),
      brief: LN((l) =>
        l === "fr"
          ? `À ${LFPN_LESSON.flyStartNm} NM sur le localizer, ${nb(ILS.ifAltFt, l)} ft, ${LFPN_LESSON.iasKt} kt, en IMC. Glide de ${dc(ILS.gpDeg, l)}° : les deux aiguilles **à moins d’une demi-échelle** jusqu’à **${ILS.daFt} ft**.`
          : `${LFPN_LESSON.flyStartNm} NM out on the localizer, ${nb(ILS.ifAltFt, l)} ft, ${LFPN_LESSON.iasKt} kt, in cloud. Intercept the ${ILS.gpDeg}° glide path and keep both needles **within half scale** down to **${ILS.daFt} ft**.`,
      ),
      scene: "pn.fly",
      alt: L(
        "The simulator's cockpit on the localizer 25R of LFPN, in cloud",
        "Le cockpit du simulateur sur le localizer 25R de LFPN, dans les nuages",
      ),
      prompt: LN((l) =>
        l === "fr"
          ? `Volez l’ILS 25R à moins d’une demi-échelle jusqu’à ${ILS.daFt} ft`
          : `Fly the ILS 25R within half scale down to ${ILS.daFt} ft`,
      ),
      goal: [GOAL.cdi(2.5), { id: "gsDefl", p: { maxDots: 2.5 } }],
      holdS: LFPN_LESSON.flyHoldS,
      durationS: LFPN_LESSON.flyDurationS,
      success: L(
        "Both needles within half scale for a minute on the 3.5° glide path: a stable approach.",
        "Les deux aiguilles à moins d’une demi-échelle pendant une minute sur le glide de 3,5° : une approche stable.",
      ),
      source: LN((l) =>
        l === "fr"
          ? `${LFPN_DISCLAIMER.fr} · données réelles autour de LFPN`
          : `${LFPN_DISCLAIMER.en} · real data around LFPN`,
      ),
      notes: LN((l) =>
        l === "fr"
          ? `Le simulateur charge la région réelle autour de LFPN (pistes, VOR TSU, ILS TNO) : comptez quelques secondes. Environ quatre minutes de vol. « Ouvrir le simulateur » le montre d’abord à la classe ; « Reprendre le cours » revient ici. ${LFPN_DISCLAIMER.fr}.`
          : `The simulator loads the real region around LFPN (runways, VOR TSU, ILS TNO): allow a few seconds. About four minutes of flight. « Ouvrir le simulateur » shows it to the class first; « Reprendre le cours » comes back here. ${LFPN_DISCLAIMER.en}.`,
      ),
    }),
    // 17 ------------------------------------------------------------------ takeaways
    recapStep({
      id: "pn-recap",
      title: L("Three numbers for Toussus", "Trois chiffres pour Toussus"),
      cols: [
        [
          LN((l) => `${dc(ILS.gpDeg, l)}°`),
          LN((l) =>
            l === "fr"
              ? `le glide de la 25R : ${D.ftPerNm} ft/NM, ${D.vsFpm} ft/min à ${LFPN_LESSON.iasKt} kt`
              : `the 25R glide path: ${D.ftPerNm} ft/NM, ${D.vsFpm} ft/min at ${LFPN_LESSON.iasKt} kt`,
          ),
        ],
        [
          same(`${ILS.daFt} ft`),
          LN((l) =>
            l === "fr"
              ? `la DA de l’ILS ; sans glide, MDA ${ILS.mdaLocFt} ft et RVR ${nb(ILS.rvrLocM, l)} m`
              : `the ILS DA; without the glide path, MDA ${ILS.mdaLocFt} ft and RVR ${nb(ILS.rvrLocM, l)} m`,
          ),
        ],
        [
          LN((l) => `${nb(ILS.accelAltFt, l)} ft`),
          LN((l) =>
            l === "fr"
              ? `en remise de gaz, avant d’accélérer ; puis ${nb(ILS.missedAltFt, l)} ft vers EPR`
              : `in the missed approach, before accelerating; then ${nb(ILS.missedAltFt, l)} ft to EPR`,
          ),
        ],
      ],
      source: LN((l) =>
        l === "fr"
          ? `${LFPN_SOURCE.fr} · ${LFPN_DISCLAIMER.fr}`
          : `${LFPN_SOURCE.en} · ${LFPN_DISCLAIMER.en}`,
      ),
      scene: "pn.cover",
      notes: LN((l) =>
        l === "fr"
          ? `Terminez par le glide de ${dc(ILS.gpDeg, l)}°, la DA et l’altitude d’accélération. Rappelez que tout se revérifie à chaque cycle AIRAC (le prochain : ${LFPN_AIRAC.next}). ${LFPN_DISCLAIMER.fr}.`
          : `Close on the ${ILS.gpDeg}° glide path, the DA and the acceleration altitude. Remind the class that everything is checked again each AIRAC cycle (the next: ${LFPN_AIRAC.next}). ${LFPN_DISCLAIMER.en}.`,
      ),
    }),
  ];
  const c = course(
    {
      id: LFPN_DECK_ID,
      title: L(
        "IFR at Toussus-le-Noble (LFPN)",
        "IFR à Toussus-le-Noble (LFPN)",
      ),
      summary: L(
        "The field, its airspace and radio, the arrival, the ILS 25R briefed and flown, the published missed approach.",
        "Le terrain, ses espaces et sa radio, l’arrivée, l’ILS 25R briefé et volé, la remise de gaz publiée.",
      ),
      cockpit: "steam",
      theme: "classroom",
      tags: ["ir", "airfield", "lfpn", "ils", "approach"],
    },
    steps,
    scenes(),
  );
  c.world = { ...LFPN_WORLD, icaos: [...LFPN_WORLD.icaos] };
  return c;
}
