// Ground school — the crafted briefing of the hold-ndb lesson (train/curriculum.ts: PADDY NDB "PA" 344 kHz, inbound
// 270, right turns, 3,000 ft, arriving on course 045, surface wind 220/15). The hardest hold: no course needle,
// only the bearing pointer, a teardrop entry and a strong wind. Every number comes from the lesson set-up: the
// entry from holdEntry() (nav/holding.ts, AIM FIG 5-3-8), the wind at 3,000 ft from the sim's own winds-aloft
// profile (sim/wind.ts defaultAloft: the surface wind veers and strengthens with height), so the headings and
// the outbound time on the slides are the ones that work in the cockpit.
// Sources: FAA AIM 1-1-2 (NDB), 1-2-3 (RNAV in lieu of ADF), 5-3-8 (holding: clearance, entries, timing "over
// or abeam the fix, whichever occurs later"), FAA-H-8083-15B IFH ch. 9 (ADF and RMI: MB = MH + RB, homing versus
// tracking) and ch. 10 (holding, drift correction tripled outbound), FAA JO 7110.65 4-6-4 (EFC as a clock time),
// ICAO Doc 8168 PANS-OPS (5° entry tolerance).
import type { Briefing, L10n, SimScene, Step } from "../../types";
import { holdEntry, type HoldEntry } from "../../../nav/holding";
import { defaultAloft } from "../../../sim/wind";
import { scene } from "../kit";
import {
  DIAGRAM,
  G,
  GAUGE,
  INST,
  L,
  briefing,
  coverStep,
  flyStep,
  formulaStep,
  heroStep,
  instrumentStep,
  mcq,
  mistakesStep,
  pad3,
  quizStep,
  readyStep,
  wrap360,
  yourTurnStep,
} from "./kit";

export const HOLD_NDB_BRIEFING_ID = "sample-briefing-hold-ndb";

/** The lesson's hold (train/curriculum.ts holdExercise('hold-ndb', …)). */
const H = {
  fix: "PA",
  inbound: 270,
  turn: "R" as const,
  alt: 3000,
  arrive: 45,
  surface: [220, 15] as [number, number],
  /** 90 KIAS at 3,000 ft ISA: about 94 KTAS */
  tas: 94,
};
/** The wind the lesson flies at 3,000 ft: the sim's winds-aloft profile from the surface wind (245/23). */
const ALOFT = defaultAloft({
  windDir: H.surface[0],
  windKt: H.surface[1],
  gustKt: 0,
  turbulence: 0,
})[0];
const RAD = Math.PI / 180;
const OUTBOUND = wrap360(H.inbound + 180); // 090
/** wind angle off the inbound course (25°), crosswind and headwind components on the inbound course */
const OFF = Math.abs(((ALOFT.dir - H.inbound + 540) % 360) - 180);
const XW = ALOFT.kt * Math.sin(OFF * RAD); // ≈ 9.7 kt, from the left
const HW = ALOFT.kt * Math.cos(OFF * RAD); // ≈ 20.8 kt
/** the 1-in-60 drift: crosswind × 60 ÷ TAS (≈ 6°) */
const WCA = Math.round((Math.round(XW) * 60) / H.tas);
const IN_HDG = wrap360(H.inbound - WCA); // 264: into a wind from the left
const OUT_HDG = wrap360(OUTBOUND + 3 * WCA); // 108: three times, into the wind
/** ground speeds along the course, crabbed: √(TAS² − crosswind²) ∓ headwind */
const ALONG = Math.sqrt(H.tas * H.tas - XW * XW);
const GS_IN = Math.round(ALONG - HW); // 73
const GS_OUT = Math.round(ALONG + HW); // 114
/** 1:00 inbound, in NM */
const LEG_NM = GS_IN / 60; // 1.2
/** the two half-turns (2 min at 3°/s) push the racetrack downwind: the east component of the wind, in NM */
const DRIFT_NM = (2 * ALOFT.kt * Math.sin((ALOFT.dir + 180) * RAD)) / 60; // ≈ 0.7
/** the outbound time that gives 1:00 inbound, in seconds (a point-mass check flies 17 s) */
const OUT_S = Math.round(
  ((Number(LEG_NM.toFixed(1)) - Number(DRIFT_NM.toFixed(1))) / GS_OUT) * 3600,
);
const TEARDROP_HDG = wrap360(OUTBOUND + (H.turn === "R" ? -30 : 30)); // 060
const CRAB = Math.abs(OUT_HDG - OUTBOUND); // 18

const ENTRY_ROW: Record<HoldEntry, L10n> = {
  DIRECT: L("Direct · 180° sector", "Directe · secteur de 180°"),
  TEARDROP: L("Teardrop · 70° sector", "Décalée · secteur de 70°"),
  PARALLEL: L("Parallel · 110° sector", "Parallèle · secteur de 110°"),
};
const ENTRIES: HoldEntry[] = ["DIRECT", "TEARDROP", "PARALLEL"];
const holdD = (crs?: number, quiet?: boolean) => ({
  kind: "hold" as const,
  inbound: H.inbound,
  turn: H.turn,
  fix: H.fix,
  ...(crs !== undefined ? { crs } : {}),
  ...(quiet ? { quiet: true } : {}),
});
const fr = (n: number, d = 1) => n.toFixed(d).replace(".", ",");
const mmss = (s: number) => `0:${String(s).padStart(2, "0")}`;
const wind = `${pad3(ALOFT.dir)}/${ALOFT.kt}`;

function ndbScenes(): Record<string, SimScene> {
  const radios = {
    adf: 344,
    brg1: "ADF" as const,
    nav1: "ARD",
    obs1: 270,
    cdi: "NAV1" as const,
    // NAV2 on an unused frequency: the RMI shows the ADF pointer alone
    nav2: 108,
  };
  const o = { wind: H.surface };
  return {
    "hn.fix": scene(
      "hn.fix",
      {
        pos: { fix: H.fix, radial: wrap360(H.arrive + 180), distNm: 0.1 },
        altFt: H.alt,
        hdg: H.arrive,
        iasKt: 90,
        radios,
      },
      { label: "Over PA · heading 045 · 3,000 ft", ...o },
    ),
    "hn.inbound": scene(
      "hn.inbound",
      {
        pos: { fix: H.fix, radial: OUTBOUND, distNm: 1 },
        altFt: H.alt,
        hdg: IN_HDG,
        iasKt: 90,
        radios,
      },
      { label: `PA 1 NM east · inbound · heading ${pad3(IN_HDG)}`, ...o },
    ),
    "hn.abeam": scene(
      "hn.abeam",
      {
        pos: { fix: H.fix, radial: 360, distNm: 1 },
        altFt: H.alt,
        hdg: OUT_HDG,
        iasKt: 90,
        radios,
      },
      { label: `Abeam PA · outbound · heading ${pad3(OUT_HDG)}`, ...o },
    ),
  };
}

export function holdNdbBriefing(): Briefing {
  const e = holdEntry(H.inbound, H.turn, H.arrive);
  if (e !== "TEARDROP")
    throw new Error(`hold-ndb briefing: course 045 gives a ${e} entry`);
  const steps: Step[] = [
    coverStep(
      "n-cover",
      L(
        "Briefing: holding on the PADDY NDB",
        "Briefing : attente sur le NDB PADDY",
      ),
      {
        eyebrow: L("Lesson briefing · Holding", "Briefing de leçon · Attente"),
        main: L("Holding on an NDB", "L’attente sur NDB"),
        sub: L(
          "One bearing pointer, a teardrop, a strong wind",
          "Une aiguille, une entrée décalée, un vent fort",
        ),
        lead: L(
          "No course needle: the head of the pointer is your course, your abeam and your station passage.",
          "Pas d’aiguille de route : la tête de l’aiguille donne l’axe, le travers et le passage de la balise.",
        ),
        meta: L(
          "About 12 min · PADDY NDB 344 kHz · FAA AIM 5-3-8",
          "Environ 12 min · NDB PADDY 344 kHz · FAA AIM 5-3-8",
        ),
        hero: [
          DIAGRAM(
            "n-cover.hold",
            holdD(undefined, true),
            L(
              "Hold at PA, inbound 270, right turns",
              "Attente à PA, rapprochement 270, virages à droite",
            ),
            984,
            96,
            816,
            888,
          ),
        ],
        reader: L(
          "The briefing of the hold-ndb lesson: hold at the PADDY NDB (PA, 344 kHz), inbound 270, right turns, 3,000 ft, with the ADF bearing pointer as your only course guidance. You arrive on course 045 (a teardrop entry) with a strong wind.",
          "Le briefing de la leçon d’attente sur NDB : attente sur le NDB PADDY (PA, 344 kHz), rapprochement 270, virages à droite, 3 000 ft, avec l’aiguille ADF pour seul guidage. Vous arrivez au 045 (entrée décalée) avec un vent fort.",
        ),
      },
    ),
    quizStep("n-entry", {
      eyebrow: L("Your clearance", "Votre clairance"),
      title: L("You arrive on course 045", "Vous arrivez au 045"),
      quote: L(
        "“Hold east of PADDY NDB on the 270 course inbound, maintain 3,000, expect further clearance at 1435Z.”",
        "« Attendez à l’est du NDB PADDY sur la route 270 en rapprochement, maintenez 3 000 ft, autorisation ultérieure prévue à 1435Z. »",
      ),
      quiz: mcq(
        L(
          "Course 045 to PA: which entry?",
          "Route 045 vers PA : quelle entrée ?",
        ),
        ENTRIES.map((k) => ({
          text: ENTRY_ROW[k],
          ...(k === e
            ? {
                why: L(
                  `Right: at PA, right to ${pad3(TEARDROP_HDG)} for 1:00.`,
                  `Juste : à PA, à droite au ${pad3(TEARDROP_HDG)} pendant 1:00.`,
                ),
              }
            : {}),
        })),
        ENTRIES.indexOf(e),
        L(
          `Inbound 270, right turns: the racetrack lies north. From 045 you are in the teardrop sector: ${pad3(TEARDROP_HDG)} at PA, 1:00, then right to intercept 270.`,
          `Rapprochement 270, virages à droite : l’hippodrome est au nord. Depuis le 045, secteur décalé : ${pad3(TEARDROP_HDG)} à PA, 1:00, puis à droite pour intercepter le 270.`,
        ),
      ),
      foot: L(
        "FAA AIM 5-3-8 · FAA JO 7110.65 4-6-4 · ICAO Doc 8168 (±5°)",
        "FAA AIM 5-3-8 · FAA JO 7110.65 4-6-4 · OACI Doc 8168 (±5°)",
      ),
      reader: L(
        "Hold east of PADDY NDB on the 270 course inbound: inbound 270, outbound 090, no turn direction given so right turns, the racetrack north of the course. The EFC is a clock time. Arriving on course 045 you are in the 70° teardrop sector (FAA AIM 5-3-8).",
        "Attente à l’est du NDB PADDY sur la route 270 en rapprochement : rapprochement 270, éloignement 090, aucun sens donné donc à droite, l’hippodrome au nord de l’axe. L’EFC est une heure. En arrivant au 045 vous êtes dans le secteur décalé de 70° (FAA AIM 5-3-8).",
      ),
    }),
    heroStep("n-teardrop", {
      eyebrow: L("The entry, step by step", "L’entrée, pas à pas"),
      title: L(
        `Teardrop: ${pad3(TEARDROP_HDG)} at PA, 1:00`,
        `Décalée : ${pad3(TEARDROP_HDG)} à PA, 1:00`,
      ),
      visual: [
        DIAGRAM(
          "n-teardrop.d",
          holdD(H.arrive),
          L(
            "Your teardrop entry from course 045 at PA",
            "Votre entrée décalée depuis la route 045 à PA",
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
      ],
      points: [
        {
          heading: L("The pointer swings", "L’aiguille bascule"),
          body: L(
            "head to tail: you are over PA",
            "de la tête à la queue : vous êtes sur PA",
          ),
          color: "nav",
        },
        {
          heading: L(
            `Right to ${pad3(TEARDROP_HDG)}, time 1:00`,
            `À droite au ${pad3(TEARDROP_HDG)}, 1:00`,
          ),
          body: L(
            "30° off the outbound 090, holding side",
            "30° de l’éloignement 090, côté attente",
          ),
          color: "path",
        },
        {
          heading: L(
            "Right turn, intercept 270",
            "À droite, interceptez le 270",
          ),
          body: L(
            "until the head of the pointer sits on 270",
            "jusqu’à la tête de l’aiguille sur 270",
          ),
          color: "sel",
        },
      ],
      foot: L(
        "FAA AIM 5-3-8 · ICAO calls it the offset entry",
        "FAA AIM 5-3-8 · l’OACI parle d’entrée décalée",
      ),
      reader: L(
        `Station passage: the pointer swings from the nose to the tail. Turn right to ${pad3(TEARDROP_HDG)} (30° off the outbound course, on the holding side), fly one minute, then turn right, in the direction of the hold, to intercept the 270 inbound: the head of the pointer on 270 (FAA AIM 5-3-8).`,
        `Passage de la balise : l’aiguille bascule du nez vers la queue. Virez à droite au ${pad3(TEARDROP_HDG)} (30° de l’axe d’éloignement, côté attente), volez une minute, puis virez à droite, dans le sens de l’attente, pour intercepter le 270 en rapprochement : la tête de l’aiguille sur 270 (FAA AIM 5-3-8).`,
      ),
    }),
    instrumentStep("n-rmi", {
      eyebrow: L("Inbound · the RMI", "Rapprochement · le RMI"),
      title: L("Head on 270: on course", "Tête sur 270 : sur l’axe"),
      lead: L(
        `1 NM east of PA, heading ${pad3(IN_HDG)}.`,
        `À 1 NM à l’est de PA, cap ${pad3(IN_HDG)}.`,
      ),
      gauge: "rmi",
      alt: L(
        `RMI inbound to PA: heading ${pad3(IN_HDG)}, the head of the pointer on 270`,
        `RMI en rapprochement vers PA : cap ${pad3(IN_HDG)}, la tête de l’aiguille sur 270`,
      ),
      scene: "hn.inbound",
      marks: [
        [0.3, -0.5],
        [-0.24, -0.9],
        [-0.3, 0.6],
      ],
      rows: [
        {
          heading: L("Head · bearing to PA", "Tête · QDM"),
          body: L(
            "270 = the inbound course: you are on it",
            "270 = l’axe de rapprochement : vous y êtes",
          ),
        },
        {
          heading: L(`Heading ${pad3(IN_HDG)}`, `Cap ${pad3(IN_HDG)}`),
          body: L(
            `${WCA}° left, into the wind: head ${WCA}° right of the nose`,
            `${WCA}° à gauche, face au vent : tête à ${WCA}° à droite du nez`,
          ),
        },
        {
          heading: L("Tail · bearing from PA", "Queue · QDR"),
          body: L(
            "090: where you are, east of the station",
            "090 : où vous êtes, à l’est de la balise",
          ),
        },
      ],
      foot: L(
        "Fixed-card ADF: MB = MH + RB · FAA IFH ch. 9",
        "ADF à carte fixe : QDM = Cm + gisement · FAA IFH ch. 9",
      ),
      reader: L(
        `The RMI does the sum a fixed-card ADF leaves to you (magnetic bearing = magnetic heading + relative bearing): its head reads the bearing to the station, its tail the bearing from it. Inbound on 270 in today’s wind, heading ${pad3(IN_HDG)}: the head sits on 270, ${WCA}° right of the nose (FAA IFH ch. 9).`,
        `Le RMI fait l’addition qu’un ADF à carte fixe vous laisse (QDM = cap magnétique + gisement) : la tête lit le relèvement vers la balise, la queue le relèvement depuis la balise. En rapprochement au 270 dans le vent du jour, cap ${pad3(IN_HDG)} : la tête est sur 270, ${WCA}° à droite du nez (FAA IFH ch. 9).`,
      ),
    }),
    quizStep("n-abeam", {
      eyebrow: L("Outbound · abeam", "Éloignement · le travers"),
      title: L("When are you abeam PA?", "Quand êtes-vous au travers de PA ?"),
      visual: [
        INST(
          GAUGE("rmi"),
          L(
            `RMI abeam PA outbound: heading ${pad3(OUT_HDG)}, the head of the pointer on 180`,
            `RMI au travers de PA en éloignement : cap ${pad3(OUT_HDG)}, la tête de l’aiguille sur 180`,
          ),
          G.left + 72,
          288,
          696,
          696,
          { id: "n-abeam.rmi", scene: "hn.abeam" },
        ),
      ],
      quiz: mcq(
        L(`Outbound, heading ${pad3(OUT_HDG)}: abeam when…`, `En éloignement, cap ${pad3(OUT_HDG)} : au travers quand…`),
        [
          {
            text: L("the head of the pointer reads 180", "la tête de l’aiguille lit 180"),
            why: L("Right: PA due south, square to the 090 course.", "Juste : PA plein sud, perpendiculaire à l’axe 090."),
          },
          {
            text: L("the pointer is on the right wingtip", "l’aiguille est sur le bout d’aile droit"),
            why: L(
              `With ${CRAB}° of crab the wingtip points to ${pad3(180 + CRAB)}: late.`,
              `Avec ${CRAB}° de dérive, le bout d’aile montre ${pad3(180 + CRAB)} : trop tard.`,
            ),
          },
          {
            text: L("the tail of the pointer reads 180", "la queue de l’aiguille lit 180"),
            why: L("The tail on 180 puts PA due north of you.", "La queue sur 180 met PA au nord de vous."),
          },
        ],
        0,
        L(
          "Abeam is a bearing: head on 180. Start the clock then, or wings level outbound if later.",
          "Le travers est un relèvement : tête sur 180. Chrono à ce moment, ou ailes à plat en éloignement si c’est plus tard.",
        ),
      ),
      scene: "hn.abeam",
      foot: L("FAA AIM 5-3-8 · over or abeam, whichever is later", "FAA AIM 5-3-8 · verticale ou travers, le plus tardif"),
      reader: L(
        `Abeam the station is a bearing, not a wingtip: abeam PA when the head of the pointer reads 180, square to the 090 outbound course. Crabbing ${CRAB}° right, the right wingtip points to ${pad3(180 + CRAB)}, so it passes PA late. Start the outbound time over or abeam the fix, whichever occurs later; if you cannot tell, when the turn outbound is complete (FAA AIM 5-3-8). In today’s wind the turn ends past abeam.`,
        `Le travers de la balise est un relèvement, pas un bout d’aile : au travers de PA quand la tête de l’aiguille lit 180, perpendiculaire à l’éloignement 090. Avec ${CRAB}° de dérive à droite, le bout d’aile droit montre ${pad3(180 + CRAB)} : il passe PA trop tard. Le chrono d’éloignement démarre à la verticale ou au travers du repère, le plus tardif des deux ; à défaut, en fin de virage d’éloignement (FAA AIM 5-3-8). Dans le vent du jour, le virage se termine après le travers.`,
      ),
    }),
    formulaStep("n-wind", {
      eyebrow: L("The headings", "Les caps"),
      lead: L(
        `Surface 220/15 veers and strengthens: about ${wind} at 3,000 ft.`,
        `Le 220/15 du sol tourne à droite et forcit : environ ${wind} à 3 000 ft.`,
      ),
      title: L(
        "Into the wind, three times outbound",
        "Face au vent, trois fois en éloignement",
      ),
      visual: [
        DIAGRAM(
          "n-wind.d",
          {
            kind: "calc",
            calc: {
              kind: "holdWind",
              inbound: H.inbound,
              turn: H.turn,
              windDir: ALOFT.dir,
              windKt: ALOFT.kt,
              tasKt: H.tas,
              // the outbound time that also allows for the drift in the turns (the next slide)
              outboundS: OUT_S,
            },
          },
          L(
            `The PA hold in a wind of ${wind} at 94 KTAS`,
            `L’attente de PA par vent du ${wind} à 94 kt de Vp`,
          ),
          G.left,
          368,
          960,
          592,
        ),
      ],
      formula: L(
        "{drift} ≈ {crosswind} × 60 ÷ {TAS}",
        "{dérive} ≈ {traversier} × 60 ÷ {Vp}",
      ),
      units: L(
        "degrees · knots · 94 KTAS at 3,000 ft",
        "degrés · nœuds · 94 kt de Vp à 3 000 ft",
      ),
      lines: [
        L(
          `crosswind | = ${ALOFT.kt} × sin ${OFF}° ≈ !${Math.round(XW)} kt!`,
          `traversier | = ${ALOFT.kt} × sin ${OFF}° ≈ !${Math.round(XW)} kt!`,
        ),
        L(
          `drift | = ${Math.round(XW)} × 60 ÷ ${H.tas} ≈ !${WCA}°!`,
          `dérive | = ${Math.round(XW)} × 60 ÷ ${H.tas} ≈ !${WCA}°!`,
        ),
        L(
          `inbound | = 270 − ${WCA}° = !${pad3(IN_HDG)}!`,
          `rapprochement | = 270 − ${WCA}° = !${pad3(IN_HDG)}!`,
        ),
        L(
          `outbound | = 090 + 3 × ${WCA}° = !${pad3(OUT_HDG)}!`,
          `éloignement | = 090 + 3 × ${WCA}° = !${pad3(OUT_HDG)}!`,
        ),
      ],
      foot: L(
        "FAA IFH ch. 10 · drift correction in the hold",
        "FAA IFH ch. 10 · la correction de dérive en attente",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "drift ≈ crosswind × 60 ÷ TAS",
            "dérive ≈ traversier × 60 ÷ Vp",
          ),
          ruleOfThumb: L(
            `Wind ${wind} on the 270 course: about ${Math.round(XW)} kt of crosswind from the left, so ${WCA}° of drift at 94 KTAS. Inbound heading ${pad3(IN_HDG)}; outbound triple it into the wind: ${pad3(OUT_HDG)} (FAA IFH ch. 10).`,
            `Vent ${wind} sur la route 270 : environ ${Math.round(XW)} kt de traversier de gauche, donc ${WCA}° de dérive à 94 kt de Vp. Cap ${pad3(IN_HDG)} en rapprochement ; en éloignement, triplez face au vent : ${pad3(OUT_HDG)} (FAA IFH ch. 10).`,
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 10" }],
        },
      ],
    }),
    formulaStep("n-timing", {
      eyebrow: L("Timing in this wind", "Le chrono dans ce vent"),
      title: L(
        `Outbound about ${mmss(OUT_S)}, not 1:00`,
        `Éloignement d’environ ${mmss(OUT_S)}, pas 1:00`,
      ),
      lead: L(
        `${Math.round(HW)} kt of headwind inbound, tailwind outbound.`,
        `${Math.round(HW)} kt de face en rapprochement, dans le dos en éloignement.`,
      ),
      formula: L(
        "{outbound} = ({leg} − {drift}) ÷ {GS}",
        "{éloignement} = ({branche} − {dérive}) ÷ {Vs}",
      ),
      units: L("NM · knots · seconds · GS: the outbound ground speed", "NM · nœuds · secondes · Vs : la vitesse sol en éloignement"),
      lines: [
        L(
          `inbound leg | = 1:00 at ${GS_IN} kt = !${LEG_NM.toFixed(1)} NM!`,
          `branche | = 1:00 à ${GS_IN} kt = !${fr(LEG_NM)} NM!`,
        ),
        L(
          `turn drift | = 2 min × ${ALOFT.kt} kt, eastward ≈ !${DRIFT_NM.toFixed(1)} NM!`,
          `dérive en virage | = 2 min × ${ALOFT.kt} kt, vers l’est ≈ !${fr(DRIFT_NM)} NM!`,
        ),
        L(
          `outbound | = ${(Number(LEG_NM.toFixed(1)) - Number(DRIFT_NM.toFixed(1))).toFixed(1)} NM at ${GS_OUT} kt ≈ !${mmss(OUT_S)}!`,
          `éloignement | = ${fr(Number(LEG_NM.toFixed(1)) - Number(DRIFT_NM.toFixed(1)))} NM à ${GS_OUT} kt ≈ !${mmss(OUT_S)}!`,
        ),
      ],
      after: L(
        "1:00 outbound would give about 2:00 inbound. Each lap: inbound long, shorten the outbound.",
        "1:00 en éloignement donnerait environ 2:00 en rapprochement. À chaque tour : rapprochement long, raccourcissez.",
      ),
      foot: L(
        "FAA AIM 5-3-8 · FAA IFH ch. 10 · 1:00 inbound at or below 14,000 ft",
        "FAA AIM 5-3-8 · FAA IFH ch. 10 · 1:00 en rapprochement jusqu’à 14 000 ft",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "outbound time = (inbound leg − turn drift) ÷ outbound ground speed",
            "temps d’éloignement = (branche de rapprochement − dérive en virage) ÷ vitesse sol en éloignement",
          ),
          ruleOfThumb: L(
            `The inbound leg is fixed at one minute: ${GS_IN} kt of ground speed makes it ${LEG_NM.toFixed(1)} NM. The two half-turns take two minutes and the wind pushes the racetrack about ${DRIFT_NM.toFixed(1)} NM east. What is left, about 0.5 NM at ${GS_OUT} kt, is an outbound leg of about ${OUT_S} seconds. With 1:00 outbound the inbound leg would last about two minutes. Then correct lap by lap (FAA AIM 5-3-8; FAA IFH ch. 10).`,
            `La branche de rapprochement dure une minute : ${GS_IN} kt de vitesse sol en font ${fr(LEG_NM)} NM. Les deux demi-tours durent deux minutes et le vent pousse l’hippodrome d’environ ${fr(DRIFT_NM)} NM vers l’est. Il reste environ 0,5 NM à ${GS_OUT} kt : un éloignement d’environ ${OUT_S} secondes. Avec 1:00 en éloignement, le rapprochement durerait environ deux minutes. Corrigez ensuite tour après tour (FAA AIM 5-3-8 ; FAA IFH ch. 10).`,
          ),
          refs: [
            { src: "FAA-AIM", ref: "5-3-8" },
            { src: "FAA-IFH", ref: "ch. 10" },
          ],
        },
      ],
    }),
    yourTurnStep("n-try", {
      eyebrow: L("At PA", "À PA"),
      title: L("The five Ts, then your turn", "Les cinq T, puis à vous"),
      rows: [
        {
          heading: L("Turn", "Virer"),
          small: L(
            `right to ${pad3(TEARDROP_HDG)}`,
            `à droite au ${pad3(TEARDROP_HDG)}`,
          ),
        },
        {
          heading: L("Time", "Chrono"),
          small: L("1:00 from PA", "1:00 depuis PA"),
        },
        {
          heading: L("Twist", "Tourner"),
          small: L("the heading bug to 270", "l’index de cap sur 270"),
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
      view: GAUGE("rmi"),
      alt: L("RMI over PA, heading 045", "RMI à la verticale de PA, cap 045"),
      scene: "hn.fix",
      prompt: L(
        `Your turn: over PA, turn right to ${pad3(TEARDROP_HDG)}`,
        `À vous : à la verticale de PA, à droite au ${pad3(TEARDROP_HDG)}`,
      ),
      controls: ["bank"],
      goal: {
        all: [{ id: "heading", p: { value: TEARDROP_HDG, tol: 5 } }],
        holdS: 3,
        graded: false,
        success: L(
          "On the teardrop heading: now the clock.",
          "Au cap de l’entrée décalée : maintenant le chrono.",
        ),
      },
      hint: L(
        "Hold the R side of the bank pad.",
        "Maintenez le côté R des boutons d’inclinaison.",
      ),
      foot: L(
        "An instructors’ memory aid · the sixth T: Track, head on 270",
        "Un aide-mémoire d’instructeur · le sixième : la route, tête sur 270",
      ),
      reader: L(
        `At PA: Turn (right to ${pad3(TEARDROP_HDG)}), Time (1:00), Twist (the heading bug to 270 as a reference: an RMI needs no setting), Throttle (90 KIAS), Talk. Your turn: over PA heading 045, turn right to ${pad3(TEARDROP_HDG)} with the bank pad.`,
        `À PA : Virer (à droite au ${pad3(TEARDROP_HDG)}), Chrono (1:00), Tourner (l’index de cap sur 270 comme repère : un RMI ne se règle pas), Puissance (90 KIAS), Parler. À vous : à la verticale de PA au cap 045, virez à droite au ${pad3(TEARDROP_HDG)} avec les boutons d’inclinaison.`,
      ),
    }),
    mistakesStep("n-errors", {
      title: L("The NDB traps", "Les pièges du NDB"),
      rows: [
        {
          error: L("Homing on the needle", "Suivre l’aiguille"),
          why: L(
            "Nose on the head: the wind curves your track.",
            "Le nez sur la tête : le vent courbe la route.",
          ),
          fix: L(
            `Hold ${pad3(IN_HDG)}, head on 270.`,
            `Tenez ${pad3(IN_HDG)}, tête sur 270.`,
          ),
        },
        {
          error: L("Abeam by the wingtip", "Le travers au bout d’aile"),
          why: L(
            `${CRAB}° of crab: the wingtip passes PA late.`,
            `${CRAB}° de dérive : le bout d’aile passe PA trop tard.`,
          ),
          fix: L("Abeam = head on 180.", "Travers = tête sur 180."),
        },
        {
          error: L("Reading it in the turn", "Lire en virage"),
          why: L(
            "In a bank the needle dips toward the low wing.",
            "En virage, l’aiguille plonge vers l’aile basse.",
          ),
          fix: L("Read it wings level.", "Lisez-la ailes à plat."),
        },
      ],
      foot: L(
        "FAA IFH ch. 9 · ADF homing and tracking",
        "FAA IFH ch. 9 · ralliement et suivi ADF",
      ),
      reader: L(
        `Three NDB traps: homing (keeping the nose on the needle lets the wind curve your track into PA; hold heading ${pad3(IN_HDG)} with the head on 270), taking abeam from the wingtip (with ${CRAB}° of crab it passes PA late; abeam is the head on 180), and reading the needle in a bank (it dips toward the low wing; read it wings level).`,
        `Trois pièges du NDB : le ralliement (garder le nez sur l’aiguille laisse le vent courber la route vers PA ; tenez le cap ${pad3(IN_HDG)}, tête sur 270), le travers pris au bout d’aile (avec ${CRAB}° de dérive il passe PA trop tard ; le travers, c’est la tête sur 180), et la lecture en virage (l’aiguille plonge vers l’aile basse ; lisez-la ailes à plat).`,
      ),
    }),
    readyStep("n-ready", {
      objectives: [
        L(
          `Teardrop at PA: ${pad3(TEARDROP_HDG)} for 1:00`,
          `Entrée décalée à PA : ${pad3(TEARDROP_HDG)} pendant 1:00`,
        ),
        L("Track 270 inbound, head on 270", "Suivre le 270, tête sur 270"),
        L(
          "Shorten the outbound for 1:00 inbound",
          "Raccourcir l’éloignement pour 1:00",
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
          n: L("Teardrop", "Décalée"),
          text: L("the AIM entry", "l’entrée de l’AIM"),
          color: "nav",
        },
      ],
      tip: L(
        `Wind ${wind} at 3,000 ft · inbound ${pad3(IN_HDG)} · outbound ${pad3(OUT_HDG)} for about ${mmss(OUT_S)} · 90 KIAS · BRG1 on ADF.`,
        `Vent ${wind} à 3 000 ft · rapprochement ${pad3(IN_HDG)} · éloignement ${pad3(OUT_HDG)} pendant environ ${mmss(OUT_S)} · 90 KIAS · BRG1 sur ADF.`,
      ),
      reader: L(
        "Standards: the teardrop entry, altitude ±100 ft, inbound legs 1:00 ±15 s, less than 0.6 NM on the non-holding side. Set the bearing pointer to ADF and identify PA first. The GPS may stand in for the ADF on this hold (FAA AIM 1-2-3), but this lesson trains the needle.",
        "Critères : l’entrée décalée, altitude ±100 ft, rapprochement 1:00 ±15 s, moins de 0,6 NM côté non-attente. Mettez d’abord l’aiguille sur ADF et identifiez PA. Le GPS peut remplacer l’ADF sur cette attente (FAA AIM 1-2-3), mais cette leçon entraîne l’aiguille.",
      ),
    }),
    flyStep(
      "n-fly",
      "hold-ndb",
      L(
        "Fly the lesson: holding on an NDB",
        "Volez la leçon : attente sur NDB",
      ),
      L(
        `Course 045 to PA, teardrop entry (${pad3(TEARDROP_HDG)} for 1:00), then hold inbound 270 on the ADF pointer at 3,000 ft, right turns.`,
        `Route 045 vers PA, entrée décalée (${pad3(TEARDROP_HDG)} pendant 1:00), puis attente au 270 sur l’aiguille ADF à 3 000 ft, virages à droite.`,
      ),
      [
        L(
          `Inbound ${pad3(IN_HDG)}: head of the pointer on 270.`,
          `Rapprochement ${pad3(IN_HDG)} : tête de l’aiguille sur 270.`,
        ),
        L(
          `Outbound ${pad3(OUT_HDG)} for about ${mmss(OUT_S)}, then adjust.`,
          `Éloignement ${pad3(OUT_HDG)} pendant environ ${mmss(OUT_S)}, puis ajustez.`,
        ),
      ],
      12,
      ["wind", "turbulence"],
    ),
  ];
  return briefing(
    {
      id: HOLD_NDB_BRIEFING_ID,
      exerciseId: "hold-ndb",
      title: L(
        "Briefing: holding on the PADDY NDB",
        "Briefing : attente sur le NDB PADDY",
      ),
      summary: L(
        "The briefing of the hold-ndb lesson: the wind at 3,000 ft, the clearance and the teardrop entry, the RMI inbound and abeam, the headings and the outbound time, then fly it.",
        "Le briefing de la leçon d’attente sur NDB : le vent à 3 000 ft, la clairance et l’entrée décalée, le RMI en rapprochement et au travers, les caps et le temps d’éloignement, puis le vol.",
      ),
      tags: ["ifr", "holding", "ndb"],
      minutes: 12,
    },
    steps,
    ndbScenes(),
  );
}

/** for tests: the numbers the slides print */
export const HOLD_NDB_NUMBERS = {
  wind: ALOFT,
  inHdg: IN_HDG,
  outHdg: OUT_HDG,
  outS: OUT_S,
  teardrop: TEARDROP_HDG,
};
