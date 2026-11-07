// Ground school — crafted briefings for the approach lessons: the hand-flown ILS RWY 27 (app-ils-hand), the
// RNAV (GPS) RWY 03 with its LNAV/VNAV DA and the LNAV MDA with its VDP (app-lnav-vnav), the missed approach at DA
// and the hold at ARD (ma-da), and the partial-panel ILS (ma-pp).
// Every procedure figure comes from the sim's own charts (nav/data.ts PARD-I27, MSVL-R03): fixes, altitudes, DA,
// MDA, HAT, the missed approach and the MSA. Derived figures are computed here and marked "about":
//   3° path ≈ 318 ft/NM; VS ≈ ground speed × 5.3; one GS dot = 0.35° (2 dots = 0.7° full scale);
//   wind components: cross = V sin θ, head = V cos θ; WCA ≈ crosswind × 60 ÷ TAS.
// Sources: FAA AIM 1-1-9 (ILS), 5-4-5 (approach charts, VDP), 5-4-21 (missed approach); 14 CFR 91.175 (descent below
// DA/MDA); FAA-H-8083-16B Instrument Procedures Handbook (IPH) ch. 4 (approaches); FAA-H-8083-15B IFH ch. 6–7
// (partial panel); FAA-H-8083-3C Airplane Flying Handbook ch. 9 (gust factor); FAA-S-ACS-8C areas VI and VII;
// ICAO Doc 8168 PANS-OPS Vol I (stabilised approach, missed approach); C172S POH sec. 4 (15 kt demonstrated
// crosswind, Vy 74 KIAS).
import type { Briefing, L10n, SimScene, Step } from "../../types";
import { holdEntry, type HoldEntry } from "../../../nav/holding";
import { scene } from "../kit";
import {
  DIAGRAM,
  G,
  GAUGE,
  INST,
  L,
  briefing,
  compareStep,
  coverStep,
  dec,
  flyStep,
  formulaStep,
  heroGauge,
  heroStep,
  instrumentStep,
  mcq,
  mistakesStep,
  pad3,
  quizStep,
  readyStep,
  stepsStep,
  whyStep,
  yourTurnStep,
} from "./kit";

export const ILS_HAND_BRIEFING_ID = "sample-briefing-app-ils-hand";
export const LNAV_BRIEFING_ID = "sample-briefing-app-lnav-vnav";
export const MISSED_BRIEFING_ID = "sample-briefing-ma-da";
export const PP_ILS_BRIEFING_ID = "sample-briefing-ma-pp";

// ------------------------------------------------------------------ the charts (nav/data.ts)
/** PARD ILS or LOC RWY 27. */
const I27 = {
  tdze: 420,
  tch: 50,
  da: 670,
  hat: 250,
  mda: 900,
  marlo: 2400,
  keddy: 3000,
  tobey: 4000,
  marloToThr: 6.06,
  keddyToMarlo: 4.94,
  final: 270,
  msa: 3100,
  /** ARD from the runway 27 threshold: 316°, 2.65 NM (the missed approach leg) */
  ardCourse: 316,
  ardNm: 2.65,
  hold: { inbound: 270, turn: "R" as const, fix: "ARD" },
};
/** MSVL RNAV (GPS) RWY 03. */
const R03 = {
  tdze: 1150,
  da: 1500,
  daHat: 350,
  mda: 1620,
  mdaHat: 470,
  circ: 1740,
  talus: 4000,
  fenny: 3600,
  cragg: 2900,
  craggToThr: 5.34,
  final: 30,
  msa: 5200,
  missedAlt: 4500,
};
const FT_PER_NM = 318; // 3° path
/** height of the 3° path above the threshold elevation at d NM (TCH 50). */
const pathAlt = (tdze: number, tch: number, d: number) =>
  Math.round(tdze + tch + d * FT_PER_NM);
const vsFor = (gsKt: number) => Math.round((gsKt * FT_PER_NM) / 60 / 5) * 5;
const comp = (windDir: number, windKt: number, rwy: number) => {
  const th = ((windDir - rwy) * Math.PI) / 180;
  return {
    cross: Math.abs(windKt * Math.sin(th)),
    head: windKt * Math.cos(th),
    fromLeft: Math.sin(th) < 0,
  };
};
const mmss = (min: number) => {
  const s = Math.round(min * 60);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const ENTRY_NAME: Record<HoldEntry, L10n> = {
  DIRECT: L("Direct", "Directe"),
  TEARDROP: L("Teardrop", "Décalée"),
  PARALLEL: L("Parallel", "Parallèle"),
};

/** The ILS 27 approach figures the decks share (surface wind 220/12, Vapp 90). */
function ilsNumbers() {
  const w = comp(220, 12, I27.final);
  const gs = Math.round(90 - w.head);
  const vs = vsFor(gs);
  const wca = Math.round((w.cross * 60) / 90);
  const hdg = I27.final - wca;
  const tMarlo = (I27.marloToThr / gs) * 60; // minutes
  // one glideslope dot (0.35°) in feet, at MARLO and at DA (distance to the GS antenna ≈ the path origin)
  const dot = (heightAboveGpi: number) =>
    Math.round(
      ((heightAboveGpi / Math.tan((3 * Math.PI) / 180)) *
        Math.tan((0.35 * Math.PI) / 180)) /
        10,
    ) * 10;
  return {
    cross: Math.round(w.cross),
    head: Math.round(w.head),
    gs,
    vs,
    wca,
    hdg,
    tMarlo,
    dotMarlo: dot(I27.marlo - I27.tdze),
    dotDa: dot(I27.hat),
    interceptNm: dec(
      (I27.keddy - I27.tdze - I27.tch) / FT_PER_NM - I27.marloToThr,
    ),
  };
}

// ------------------------------------------------------------------ scenes
const ILS_RADIOS = {
  nav1: "IPRD",
  obs1: 270,
  cdi: "NAV1" as const,
  minimums: I27.da,
};
function ilsScenes(): Record<string, SimScene> {
  const n = ilsNumbers();
  return {
    "ils.final": scene(
      "ils.final",
      {
        pos: { runway: { icao: "PARD", id: "27" }, distNm: 4 },
        altFt: pathAlt(I27.tdze, I27.tch, 4),
        hdg: n.hdg,
        iasKt: 90,
        vsFpm: -n.vs,
        radios: ILS_RADIOS,
      },
      {
        label: `ILS 27 · 4 NM · on the glideslope · heading ${pad3(n.hdg)}`,
        wind: [220, 12],
      },
    ),
    "ils.high": scene(
      "ils.high",
      {
        pos: { runway: { icao: "PARD", id: "27" }, distNm: 5 },
        altFt: pathAlt(I27.tdze, I27.tch, 5) + 160,
        hdg: n.hdg,
        iasKt: 90,
        vsFpm: -n.vs,
        radios: ILS_RADIOS,
      },
      {
        label: "ILS 27 · 5 NM · one dot high, on the localizer",
        wind: [220, 12],
      },
    ),
    "ils.bank": scene(
      "ils.bank",
      {
        pos: { runway: { icao: "PARD", id: "27" }, distNm: 4.5 },
        altFt: pathAlt(I27.tdze, I27.tch, 4.5),
        hdg: n.hdg,
        iasKt: 90,
        bank: 12,
        vsFpm: -n.vs,
        radios: ILS_RADIOS,
      },
      { label: "ILS 27 · partial panel · banked 12° right", wind: [220, 12] },
    ),
  };
}

// ================================================================== app-ils-hand
export function ilsHandBriefing(): Briefing {
  const n = ilsNumbers();
  const steps: Step[] = [
    coverStep(
      "ih-cover",
      L("Briefing: the hand-flown ILS", "Briefing : l’ILS en manuel"),
      {
        eyebrow: L(
          "Lesson briefing · Approaches",
          "Briefing de leçon · Approches",
        ),
        main: L("The hand-flown ILS", "L’ILS en manuel"),
        sub: L(
          "PARD ILS RWY 27, down to DA 670",
          "PARD ILS piste 27, jusqu’à la DA 670",
        ),
        lead: L(
          "TOBEY, KEDDY, the glideslope at MARLO, then land or go around at 670 ft.",
          "TOBEY, KEDDY, le glide à MARLO, puis atterrir ou remettre les gaz à 670 ft.",
        ),
        meta: L(
          "About 15 min · I-PRD 110.30 · FAA AIM 1-1-9",
          "Environ 15 min · I-PRD 110,30 · FAA AIM 1-1-9",
        ),
        hero: [
          heroGauge(
            "ih-cover.hsi",
            "hsi",
            L(
              "HSI on the ILS 27: localizer and glideslope centred",
              "HSI sur l’ILS 27 : localizer et glide centrés",
            ),
            "ils.final",
          ),
        ],
        scene: "ils.final",
        reader: L(
          "The briefing of the hand-flown ILS lesson: PARD ILS or LOC RWY 27 from TOBEY, hand-flown to the decision altitude of 670 ft in a 350 ft ceiling, then land or go around.",
          "Le briefing de la leçon ILS en manuel : PARD ILS ou LOC piste 27 depuis TOBEY, en pilotage manuel jusqu’à l’altitude de décision de 670 ft sous un plafond de 350 ft, puis atterrissage ou remise des gaz.",
        ),
      },
    ),
    whyStep("ih-why", {
      eyebrow: L("Why it matters", "Pourquoi c’est important"),
      title: L(
        "The approach you will fly most",
        "L’approche que vous volerez le plus",
      ),
      n: L("250", "250"),
      nW: 400,
      unit: L("ft", "ft"),
      color: "key",
      statement: L(
        "above the runway: decide there",
        "au-dessus de la piste : décidez là",
      ),
      body: L(
        "DA 670 is 250 ft above the touchdown zone. Today the ceiling is 350 ft.",
        "La DA 670 est à 250 ft au-dessus du toucher. Aujourd’hui le plafond est à 350 ft.",
      ),
      sideTitle: L("The chart · ILS 27", "La carte · ILS 27"),
      side: [
        {
          n: L("3,000", "3 000"),
          text: L("KEDDY, the IF", "KEDDY, l’IF"),
          color: "text",
        },
        {
          n: L("2,400", "2 400"),
          text: L("MARLO, the FAF: check it", "MARLO, le FAF : vérifiez"),
          color: "key",
        },
        {
          n: L("670", "670"),
          text: L("DA · HAT 250 · vis ½ SM", "DA · HAT 250 · vis ½ SM"),
          color: "stop",
        },
      ],
      foot: L(
        "PARD ILS or LOC RWY 27 (simulated) · FAA AIM 1-1-9",
        "PARD ILS ou LOC 27 (simulée) · FAA AIM 1-1-9",
      ),
      reader: L(
        "The ILS is the precision approach of most IFR flights. PARD ILS RWY 27: TOBEY (IAF) at 4,000, KEDDY (IF) at 3,000, MARLO (FAF) where the glideslope crosses 2,400 ft, decision altitude 670 ft (250 ft above the touchdown zone, 420 ft), visibility ½ SM. The lesson weather is a 350 ft ceiling and ¾ SM.",
        "L’ILS est l’approche de précision de la plupart des vols IFR. PARD ILS piste 27 : TOBEY (IAF) à 4 000, KEDDY (IF) à 3 000, MARLO (FAF) où le glide passe 2 400 ft, altitude de décision 670 ft (250 ft au-dessus de la zone de toucher, 420 ft), visibilité ½ SM. La météo de la leçon : plafond 350 ft et ¾ SM.",
      ),
    }),
    formulaStep("ih-numbers", {
      eyebrow: L("The numbers", "Les chiffres"),
      title: L("Descent rate and heading on final", "Vario et cap en finale"),
      visual: [
        DIAGRAM(
          "ih-numbers.wind",
          {
            kind: "calc",
            calc: {
              kind: "windTriangle",
              drag: ["wind"],
              course: 270,
              tasKt: 90,
              windDir: 220,
              windKt: 12,
            },
          },
          L(
            `Runway 27, wind 220/12: about ${n.cross} kt of crosswind from the left, ${n.head} kt of headwind`,
            `Piste 27, vent 220/12 : environ ${n.cross} kt de travers gauche, ${n.head} kt de face`,
          ),
          G.left + 160,
          360,
          640,
          624,
          { interactive: true },
        ),
      ],
      formula: L("{VS} ≈ {GS} × 5", "{Vz} ≈ {Vs} × 5"),
      units: L(
        "VS in ft/min · GS in knots · 3° path",
        "Vz en ft/min · Vs en nœuds · plan à 3°",
      ),
      lines: [
        {
          en: `GS | ≈ 90 − ${n.head} ≈ !${n.gs} kt!`,
          fr: `Vs | ≈ 90 − ${n.head} ≈ !${n.gs} kt!`,
        },
        {
          en: `VS | ≈ ${n.gs} × 5.3 ≈ !${n.vs} fpm!`,
          fr: `Vz | ≈ ${n.gs} × 5,3 ≈ !${n.vs} ft/min!`,
        },
        {
          en: `heading | ≈ 270 − ${n.wca} ≈ !${pad3(n.hdg)}!`,
          fr: `cap | ≈ 270 − ${n.wca} ≈ !${pad3(n.hdg)}!`,
        },
      ],
      after: {
        en: `MARLO to the threshold: about ${mmss(n.tMarlo)}.`,
        fr: `De MARLO au seuil : environ ${mmss(n.tMarlo)}.`,
      },
      foot: L(
        "Surface wind · about: the wind aloft is stronger · FAA IFH ch. 9",
        "Vent au sol · environ : le vent en altitude est plus fort · FAA IFH ch. 9",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "VS (ft/min) ≈ ground speed (kt) × 5",
            "Vz (ft/min) ≈ vitesse sol (kt) × 5",
          ),
          ruleOfThumb: {
            en: `Wind 220/12 on runway 27: about ${n.head} kt of headwind, so about ${n.gs} kt of ground speed at 90 KIAS and about ${n.vs} ft/min on the glideslope; about ${n.cross} kt of crosswind from the left, so a heading near ${pad3(n.hdg)}. MARLO to the threshold, 6.1 NM: about ${mmss(n.tMarlo)}. These are surface-wind figures: fly the needles, not the numbers.`,
            fr: `Vent 220/12 en piste 27 : environ ${n.head} kt de face, donc environ ${n.gs} kt de vitesse sol à 90 KIAS et environ ${n.vs} ft/min sur le glide ; environ ${n.cross} kt de travers gauche, donc un cap proche de ${pad3(n.hdg)}. De MARLO au seuil, 6,1 NM : environ ${mmss(n.tMarlo)}. Chiffres au vent de surface : suivez les aiguilles, pas les chiffres.`,
          },
          refs: [{ src: "FAA-IFH", ref: "ch. 9" }],
        },
      ],
    }),
    heroStep("ih-profile", {
      eyebrow: L("The picture", "L’image"),
      title: L(
        "Level to MARLO, then the glideslope",
        "En palier vers MARLO, puis le glide",
      ),
      visual: [
        DIAGRAM(
          "ih-profile.d",
          {
            kind: "calc",
            calc: {
              kind: "profile",
              fromFt: I27.keddy,
              toFt: I27.da,
              angleDeg: 3,
              gsKt: n.gs,
              marks: [
                {
                  distNm: (I27.marlo - I27.da) / FT_PER_NM,
                  altFt: I27.marlo,
                  label: "MARLO",
                },
                {
                  distNm: (I27.marlo - I27.da) / FT_PER_NM + I27.keddyToMarlo,
                  altFt: I27.keddy,
                  label: "KEDDY",
                },
              ],
            },
          },
          L(
            "Profile: KEDDY at 3,000, the glideslope intercepted about 1.9 NM before MARLO, MARLO at 2,400, DA 670",
            "Profil : KEDDY à 3 000, glide intercepté environ 1,9 NM avant MARLO, MARLO à 2 400, DA 670",
          ),
          G.left,
          336,
          960,
          560,
        ),
      ],
      points: [
        {
          heading: L("Intercept from below", "Interceptez par en dessous"),
          body: {
            en: `At 3,000 ft the glideslope comes down to you about ${n.interceptNm.en} NM before MARLO.`,
            fr: `À 3 000 ft, le glide descend vers vous environ ${n.interceptNm.fr} NM avant MARLO.`,
          },
        },
        {
          heading: L("MARLO: 2,400 checked", "MARLO : 2 400 vérifié"),
          body: L(
            "The FAF. Start the timer and check the altimeter on the glideslope.",
            "Le FAF. Lancez le chrono et vérifiez l’altimètre sur le glide.",
          ),
          color: "key",
        },
        {
          heading: L("DA 670: land or go", "DA 670 : atterrir ou remettre"),
          body: L(
            "No runway environment at 670: go around at once, no level-off.",
            "Pas d’environnement piste à 670 : remise des gaz immédiate, sans palier.",
          ),
          color: "stop",
        },
      ],
      foot: L(
        "FAA IPH ch. 4 · 3° ≈ 318 ft/NM · TCH 50 ft",
        "FAA IPH ch. 4 · 3° ≈ 318 ft/NM · TCH 50 ft",
      ),
      reader: L(
        "Fly level at 3,000 ft from KEDDY and intercept the glideslope from below, about 1.9 NM before MARLO. At MARLO, the final approach fix, the glideslope crosses 2,400 ft: start the timer and check it. Follow the 3° path (about 318 ft per NM) to DA 670 and decide there (FAA IPH ch. 4).",
        "Volez en palier à 3 000 ft depuis KEDDY et interceptez le glide par en dessous, environ 1,9 NM avant MARLO. À MARLO, le repère d’approche finale, le glide passe 2 400 ft : lancez le chrono et vérifiez. Suivez le plan à 3° (environ 318 ft par NM) jusqu’à la DA 670 et décidez là (FAA IPH ch. 4).",
      ),
    }),
    instrumentStep("ih-needles", {
      eyebrow: L("The instrument", "L’instrument"),
      title: L("The needles get sharper", "Les aiguilles s’affinent"),
      lead: L(
        "Small corrections, smaller near DA.",
        "Petites corrections, plus petites près de la DA.",
      ),
      gauge: "hsi",
      alt: L(
        "HSI one dot high on the glideslope, localizer centred",
        "HSI un point au-dessus du glide, localizer centré",
      ),
      scene: "ils.high",
      marks: [
        [0, 0],
        // the glideslope pointer on the right edge of the card: one dot high, so the pointer sits below centre
        [0.8, 0.16],
      ],
      rows: [
        {
          heading: L("Localizer: heading", "Localizer : le cap"),
          body: L(
            "2–5° of heading at a time, then hold it.",
            "2 à 5° de cap à la fois, puis tenez-le.",
          ),
        },
        {
          heading: L(
            "Glideslope: pitch and power",
            "Glide : assiette et puissance",
          ),
          body: {
            en: `One dot: about ${n.dotMarlo} ft at MARLO, ${n.dotDa} ft at DA.`,
            fr: `Un point : environ ${n.dotMarlo} ft à MARLO, ${n.dotDa} ft à la DA.`,
          },
        },
      ],
      foot: L(
        "FAA AIM 1-1-9 · GS full scale ±0.7° · about",
        "FAA AIM 1-1-9 · glide pleine échelle ±0,7° · environ",
      ),
      reader: {
        en: `The localizer and the glideslope are angular: the closer you get, the fewer feet a dot is worth. One glideslope dot is about ${n.dotMarlo} ft at MARLO and only about ${n.dotDa} ft at DA. Correct the localizer with 2–5° of heading, the glideslope with small pitch changes and power together (FAA AIM 1-1-9).`,
        fr: `Le localizer et le glide sont angulaires : plus vous approchez, moins un point vaut de pieds. Un point de glide vaut environ ${n.dotMarlo} ft à MARLO et seulement environ ${n.dotDa} ft à la DA. Corrigez le localizer de 2 à 5° de cap, le glide par de petites variations d’assiette avec la puissance (FAA AIM 1-1-9).`,
      },
    }),
    quizStep("ih-dot", {
      eyebrow: L("Question", "Question"),
      title: L("One dot, close to DA", "Un point, près de la DA"),
      visual: [
        INST(
          GAUGE("hsi"),
          L(
            "HSI one dot high on the glideslope, localizer centred",
            "HSI un point au-dessus du glide, localizer centré",
          ),
          G.left,
          312,
          672,
          672,
          { id: "ih-dot.hsi", scene: "ils.high" },
        ),
      ],
      quiz: mcq(
        L(
          "One dot high near DA: how high above the path?",
          "Un point haut près de la DA : de combien au-dessus ?",
        ),
        [
          {
            text: { en: `About ${n.dotDa} ft`, fr: `Environ ${n.dotDa} ft` },
            why: L(
              "Right: the beam is narrow near the runway.",
              "Juste : le faisceau est étroit près de la piste.",
            ),
          },
          {
            text: {
              en: `About ${n.dotMarlo} ft`,
              fr: `Environ ${n.dotMarlo} ft`,
            },
            why: L(
              "That is one dot at MARLO, 6 NM out.",
              "C’est un point à MARLO, à 6 NM.",
            ),
          },
          {
            text: L("Always 100 ft", "Toujours 100 ft"),
            why: L(
              "A dot is an angle, not a height.",
              "Un point est un angle, pas une hauteur.",
            ),
          },
        ],
        0,
        {
          en: `One dot is 0.35°: about ${n.dotMarlo} ft at MARLO, about ${n.dotDa} ft at DA. Small corrections near the runway.`,
          fr: `Un point vaut 0,35° : environ ${n.dotMarlo} ft à MARLO, environ ${n.dotDa} ft à la DA. Petites corrections près de la piste.`,
        },
      ),
      foot: L("FAA AIM 1-1-9 · about", "FAA AIM 1-1-9 · environ"),
      reader: {
        en: `The glideslope is an angle: one dot (0.35°) is about ${n.dotMarlo} ft at MARLO but only about ${n.dotDa} ft at DA (FAA AIM 1-1-9).`,
        fr: `Le glide est un angle : un point (0,35°) vaut environ ${n.dotMarlo} ft à MARLO mais seulement environ ${n.dotDa} ft à la DA (FAA AIM 1-1-9).`,
      },
    }),
    stepsStep("ih-steps", {
      eyebrow: L("The flow", "Le déroulé"),
      title: L("From TOBEY to DA", "De TOBEY à la DA"),
      rows: [
        {
          heading: L("Brief, then TOBEY", "Briefez, puis TOBEY"),
          small: L(
            "I-PRD 110.30 · CRS 270 · DA 670 · then 3,000",
            "I-PRD 110,30 · CRS 270 · DA 670 · puis 3 000",
          ),
        },
        {
          heading: L("90 KIAS before KEDDY", "90 KIAS avant KEDDY"),
          small: L(
            "and the green LOC1 needle: not GPS",
            "et l’aiguille LOC1 verte : pas le GPS",
          ),
        },
        {
          heading: L("Glideslope alive: flaps 10", "Glide vivant : volets 10"),
          small: L(
            "at intercept, pitch down, descent power",
            "à l’interception, nez en bas, puissance de descente",
          ),
        },
        {
          heading: L("MARLO: timer, 2,400", "MARLO : chrono, 2 400"),
          small: L(
            "“outer marker, 2,400 checked”",
            "« marker extérieur, 2 400 vérifié »",
          ),
        },
        {
          heading: L("670: land or go", "670 : atterrir ou remettre"),
          small: L(
            "“minimums”: runway in sight, or G",
            "« minimums » : piste en vue, ou G",
          ),
        },
      ],
      visual: [
        INST(
          GAUGE("hsi"),
          L("HSI on the localizer 27", "HSI sur le localizer 27"),
          1080,
          264,
          720,
          720,
          { id: "ih-steps.hsi", scene: "ils.final" },
        ),
      ],
      foot: L(
        "Club SOP · flaps 10 at GS intercept",
        "SOP du club · volets 10 à l’interception",
      ),
      scene: "ils.final",
      reader: L(
        "The flow: brief the approach before TOBEY (I-PRD 110.30, course 270, minimums 670); descend to 3,000 after TOBEY and slow to 90 KIAS; confirm the green LOC1 needle before KEDDY; flaps 10 as the glideslope comes alive; at MARLO start the timer and check 2,400 ft; at 670, land with the runway in sight or go around.",
        "Le déroulé : briefez l’approche avant TOBEY (I-PRD 110,30, route 270, minimums 670) ; descendez à 3 000 après TOBEY et ralentissez à 90 KIAS ; confirmez l’aiguille LOC1 verte avant KEDDY ; volets 10 quand le glide s’anime ; à MARLO lancez le chrono et vérifiez 2 400 ft ; à 670, atterrissez piste en vue ou remettez les gaz.",
      ),
    }),
    mistakesStep("ih-errors", {
      title: L("What goes wrong", "Ce qui tourne mal"),
      rows: [
        {
          error: L("Still on GPS at KEDDY", "Encore sur GPS à KEDDY"),
          why: L(
            "The needle shows the GPS track, not the localizer.",
            "L’aiguille montre la route GPS, pas le localizer.",
          ),
          fix: L("Green LOC1 before KEDDY.", "LOC1 vert avant KEDDY."),
        },
        {
          error: L("Chasing the glideslope", "Courir après le glide"),
          why: L(
            "Big pitch changes near DA, where a dot is 30 ft.",
            "De grosses variations près de la DA, où un point vaut 30 ft.",
          ),
          fix: L(
            "Small pitch, power with it.",
            "Petite assiette, la puissance avec.",
          ),
        },
        {
          error: L("No wind correction", "Pas de correction de vent"),
          why: L(
            "Heading 270 drifts you right of the localizer.",
            "Au cap 270, vous dérivez à droite du localizer.",
          ),
          fix: {
            en: `Start near ${pad3(n.hdg)}, then bracket.`,
            fr: `Partez vers ${pad3(n.hdg)}, puis encadrez.`,
          },
        },
      ],
      foot: L(
        "ACS IR.VI.B · within ¾ scale on both needles",
        "ACS IR.VI.B · moins de ¾ d’échelle sur les deux aiguilles",
      ),
      reader: L(
        "Common mistakes: leaving the CDI on GPS at KEDDY, chasing the glideslope with large pitch changes close to DA, and flying heading 270 with no wind correction. The ACS asks for less than ¾-scale deflection on both needles (FAA-S-ACS-8C IR.VI.B).",
        "Erreurs fréquentes : laisser le CDI sur le GPS à KEDDY, courir après le glide par de grosses variations d’assiette près de la DA, et voler au cap 270 sans correction de vent. L’ACS demande moins de ¾ d’échelle sur les deux aiguilles (FAA-S-ACS-8C IR.VI.B).",
      ),
    }),
    quizStep("ih-quiz", {
      eyebrow: L("Question", "Question"),
      title: L("At DA 670", "À la DA 670"),
      quote: L(
        "You see the approach lights, but not the runway, nor the red bars.",
        "Vous voyez la rampe d’approche, mais ni la piste ni les barres rouges.",
      ),
      quiz: mcq(
        L("You may…", "Vous pouvez…"),
        [
          {
            text: L(
              "Continue to 100 ft above the touchdown zone",
              "Continuer jusqu’à 100 ft au-dessus du toucher",
            ),
            why: L(
              "Right: 520 ft here, then you need the runway.",
              "Juste : 520 ft ici, puis il faut la piste.",
            ),
          },
          {
            text: L(
              "Land: the lights are enough",
              "Atterrir : la rampe suffit",
            ),
            why: L(
              "The approach lights alone stop at 100 ft.",
              "La rampe seule s’arrête à 100 ft.",
            ),
          },
          {
            text: L("Level off at 670 and look", "Palier à 670 pour regarder"),
            why: L(
              "Never level off at DA: go around or descend.",
              "Jamais de palier à la DA : remettez ou descendez.",
            ),
          },
        ],
        0,
        L(
          "14 CFR 91.175(c)(3)(i): the lights alone allow 100 ft above TDZE (420 + 100 = 520).",
          "14 CFR 91.175(c)(3)(i) : la rampe seule permet 100 ft au-dessus du TDZE (420 + 100 = 520).",
        ),
      ),
      foot: L(
        "14 CFR 91.175(c) · EASA: SERA and Part-NCO have their own wording",
        "14 CFR 91.175(c) · EASA : SERA et Part-NCO ont leur propre texte",
      ),
      reader: L(
        "At DA with only the approach light system in sight, you may descend to 100 ft above the touchdown zone elevation (here 520 ft), and no lower unless the red terminating bars or red side row bars are also visible, or you see the runway itself (14 CFR 91.175(c)(3)(i)).",
        "À la DA avec la seule rampe d’approche en vue, vous pouvez descendre jusqu’à 100 ft au-dessus de l’altitude de la zone de toucher (ici 520 ft), pas plus bas sauf si les barres rouges de fin ou latérales sont aussi visibles, ou si vous voyez la piste elle-même (14 CFR 91.175(c)(3)(i)).",
      ),
    }),
    readyStep("ih-ready", {
      objectives: [
        L(
          "Fly TOBEY–KEDDY–MARLO at the chart altitudes",
          "Voler TOBEY–KEDDY–MARLO aux altitudes de la carte",
        ),
        L(
          "Stay within ¾ scale on both needles",
          "Rester à moins de ¾ d’échelle sur les deux aiguilles",
        ),
        L(
          "Decide at DA 670: land or go around",
          "Décider à la DA 670 : atterrir ou remettre",
        ),
      ],
      standards: [
        {
          n: L("¾", "¾"),
          text: L("scale, LOC and GS", "d’échelle, LOC et glide"),
          color: "nav",
        },
        { n: L("±10", "±10"), text: L("KIAS on final", "KIAS en finale") },
        {
          n: L("670", "670"),
          text: L("DA, no lower", "DA, pas plus bas"),
          color: "stop",
        },
        {
          n: L("2,400", "2 400"),
          text: L("at MARLO", "à MARLO"),
          color: "key",
        },
      ],
      tip: {
        en: `Wind 220/12: start the final near heading ${pad3(n.hdg)} and about ${n.vs} ft/min.`,
        fr: `Vent 220/12 : commencez la finale vers le cap ${pad3(n.hdg)} et environ ${n.vs} ft/min.`,
      },
      reader: L(
        "Standards (FAA-S-ACS-8C IR.VI.B): less than ¾-scale deflection of the localizer and the glideslope, airspeed ±10 KIAS, no descent below DA without the required visual references.",
        "Critères (FAA-S-ACS-8C IR.VI.B) : moins de ¾ d’échelle de déviation du localizer et du glide, vitesse ±10 KIAS, pas de descente sous la DA sans les références visuelles requises.",
      ),
    }),
    flyStep(
      "ih-fly",
      "app-ils-hand",
      L(
        "Fly the lesson: ILS 27, hand-flown",
        "Volez la leçon : ILS 27 en manuel",
      ),
      L(
        "From TOBEY at 4,000: KEDDY, the glideslope at MARLO, DA 670.",
        "Depuis TOBEY à 4 000 : KEDDY, le glide à MARLO, DA 670.",
      ),
      [
        L("Green LOC1 before KEDDY.", "LOC1 vert avant KEDDY."),
        L(
          "At 670: runway in sight, or go around.",
          "À 670 : piste en vue, ou remise des gaz.",
        ),
      ],
      15,
      ["wind"],
    ),
  ];
  return briefing(
    {
      id: ILS_HAND_BRIEFING_ID,
      exerciseId: "app-ils-hand",
      title: L("Briefing: the hand-flown ILS", "Briefing : l’ILS en manuel"),
      summary: L(
        "The briefing of the hand-flown ILS lesson: the chart, the profile, the descent rate and heading, the needles near DA, the 91.175 rule, then fly it.",
        "Le briefing de la leçon ILS en manuel : la carte, le profil, le vario et le cap, les aiguilles près de la DA, la règle 91.175, puis le vol.",
      ),
      tags: ["ifr", "approach", "ils"],
      minutes: 15,
    },
    steps,
    ilsScenes(),
  );
}

// ================================================================== app-lnav-vnav
function lnavScenes(): Record<string, SimScene> {
  return {
    "rn.final": scene(
      "rn.final",
      {
        pos: { runway: { icao: "MSVL", id: "03" }, distNm: 3 },
        altFt: pathAlt(R03.tdze, 50, 3),
        hdg: 20,
        iasKt: 94,
        vsFpm: -470,
        radios: { cdi: "GPS", minimums: R03.da },
      },
      {
        label: "RNAV 03 · 3 NM · on the glidepath · DA 1,500",
        wind: [320, 16],
      },
    ),
  };
}
export function lnavBriefing(): Briefing {
  const w = comp(320, 16, R03.final);
  const wg = comp(320, 24, R03.final);
  const cross = Math.round(w.cross);
  const crossG = Math.round(wg.cross);
  const head = Math.round(w.head);
  const vapp = 90 + (24 - 16) / 2;
  const gs = Math.round(vapp - head);
  const vs = vsFor(gs);
  // the VDP: where a 3° path from the MDA meets the runway (HAT ÷ 300 NM from the threshold, the IPH rule)
  const vdpNm = Math.round((R03.mdaHat / 300) * 10) / 10;
  const steps: Step[] = [
    coverStep(
      "rn-cover",
      L(
        "Briefing: RNAV, LNAV/VNAV and LNAV",
        "Briefing : RNAV, LNAV/VNAV et LNAV",
      ),
      {
        eyebrow: L(
          "Lesson briefing · Approaches",
          "Briefing de leçon · Approches",
        ),
        main: L("Two lines of minimums", "Deux lignes de minima"),
        sub: L(
          "MSVL RNAV (GPS) RWY 03, in gusts",
          "MSVL RNAV (GPS) piste 03, en rafales",
        ),
        lead: L(
          "A glidepath to DA 1,500. Without it: LNAV, MDA 1,620 and the VDP.",
          "Un plan vers la DA 1 500. Sans lui : LNAV, MDA 1 620 et le VDP.",
        ),
        meta: L(
          "About 15 min · hand-flown · FAA AIM 5-4-5",
          "Environ 15 min · pilotage manuel · FAA AIM 5-4-5",
        ),
        hero: [
          DIAGRAM(
            "rn-cover.vdp",
            {
              kind: "calc",
              calc: {
                kind: "vdp",
                mdaFt: R03.mda,
                tdzeFt: R03.tdze,
                vdpNm,
              },
            },
            L(
              `Final segment of RNAV 03: MDA 1,620, VDP about ${vdpNm} NM from the threshold`,
              `Segment final de la RNAV 03 : MDA 1 620, VDP environ ${vdpNm.toString().replace(".", ",")} NM du seuil`,
            ),
            984,
            312,
            816,
            416,
          ),
        ],
        reader: L(
          "The briefing of the RNAV (GPS) RWY 03 lesson at Mistral Valley: fly the LNAV/VNAV glidepath to DA 1,500; know the LNAV line (MDA 1,620) and its visual descent point; add half the gust factor to the approach speed; set your crosswind limit before the final approach fix.",
          "Le briefing de la leçon RNAV (GPS) piste 03 à Mistral Valley : suivez le plan LNAV/VNAV jusqu’à la DA 1 500 ; connaissez la ligne LNAV (MDA 1 620) et son point de descente à vue ; ajoutez la moitié des rafales à la vitesse d’approche ; fixez votre limite de vent de travers avant le repère d’approche finale.",
        ),
      },
    ),
    whyStep("rn-why", {
      eyebrow: L("Why it matters", "Pourquoi c’est important"),
      title: L("DA or MDA: not the same rule", "DA ou MDA : pas la même règle"),
      n: L("1,500", "1 500"),
      nW: 720,
      color: "key",
      statement: L(
        "LNAV/VNAV DA: decide, never level off",
        "DA LNAV/VNAV : décidez, sans palier",
      ),
      body: L(
        "The LNAV MDA is a floor you level off on, until the VDP or the MAP.",
        "La MDA LNAV est un plancher où l’on se met en palier, jusqu’au VDP ou au MAP.",
      ),
      sideTitle: L("The chart · RNAV 03", "La carte · RNAV 03"),
      side: [
        {
          n: L("1,500", "1 500"),
          text: L("LNAV/VNAV DA · HAT 350", "DA LNAV/VNAV · HAT 350"),
          color: "key",
        },
        {
          n: L("1,620", "1 620"),
          text: L("LNAV MDA · HAT 470", "MDA LNAV · HAT 470"),
          color: "text",
        },
        {
          n: L("5,200", "5 200"),
          text: L("MSA: a valley airport", "MSA : un aérodrome de vallée"),
          color: "stop",
        },
      ],
      foot: L(
        "MSVL RNAV (GPS) RWY 03 (simulated) · LPV not authorised",
        "MSVL RNAV (GPS) 03 (simulée) · LPV non autorisée",
      ),
      reader: L(
        "The RNAV (GPS) RWY 03 at MSVL has two lines: LNAV/VNAV with a decision altitude of 1,500 ft (HAT 350) and LNAV with a minimum descent altitude of 1,620 ft (HAT 470). A DA is a decision point: at it you land or go around. An MDA is a floor: you may level off on it until the visual descent point or the missed approach point. The MSA is 5,200 ft: a valley airport.",
        "La RNAV (GPS) piste 03 de MSVL a deux lignes : LNAV/VNAV avec une altitude de décision de 1 500 ft (HAT 350) et LNAV avec une altitude minimale de descente de 1 620 ft (HAT 470). Une DA est un point de décision : on y atterrit ou on remet les gaz. Une MDA est un plancher : on peut s’y mettre en palier jusqu’au point de descente à vue ou au point d’approche interrompue. La MSA est de 5 200 ft : un aérodrome de vallée.",
      ),
    }),
    heroStep("rn-vdp", {
      eyebrow: L("The picture", "L’image"),
      title: L("The VDP: leave the MDA there", "Le VDP : quittez la MDA là"),
      visual: [
        DIAGRAM(
          "rn-vdp.d",
          {
            kind: "calc",
            calc: {
              kind: "vdp",
              drag: ["mda"],
              mdaFt: R03.mda,
              tdzeFt: R03.tdze,
              vdpNm,
            },
          },
          L(
            `MDA 1,620 over a 1,150 ft touchdown zone: a 3° descent starts about ${vdpNm} NM from the threshold`,
            `MDA 1 620 au-dessus d’un toucher à 1 150 ft : la descente à 3° commence environ ${vdpNm.toString().replace(".", ",")} NM avant le seuil`,
          ),
          G.left,
          360,
          960,
          436,
          { interactive: true },
        ),
      ],
      points: [
        {
          heading: L("HAT ÷ 300", "HAT ÷ 300"),
          body: {
            en: `470 ÷ 300: the VDP is about ${vdpNm} NM before the threshold.`,
            fr: `470 ÷ 300 : le VDP est environ ${vdpNm.toString().replace(".", ",")} NM avant le seuil.`,
          },
        },
        {
          heading: L("Runway in sight before it", "La piste en vue avant"),
          body: L(
            "Then a normal 3° descent to the touchdown zone.",
            "Puis une descente normale à 3° vers le toucher.",
          ),
          color: "nav",
        },
        {
          heading: L("Not in sight at the VDP", "Pas en vue au VDP"),
          body: L(
            "A normal landing is unlikely: plan the missed approach.",
            "Un atterrissage normal est peu probable : prévoyez la remise.",
          ),
          color: "stop",
        },
      ],
      foot: L(
        "FAA AIM 5-4-5 · FAA IPH ch. 4 · the MAP is the threshold",
        "FAA AIM 5-4-5 · FAA IPH ch. 4 · le MAP est le seuil",
      ),
      reader: {
        en: `The visual descent point is where a normal 3° descent from the MDA to the touchdown zone begins. A rule of thumb gives its distance from the threshold: HAT ÷ 300, here 470 ÷ 300, about ${vdpNm} NM. Leaving the MDA before the VDP puts you low; reaching it without the runway in sight makes a normal landing unlikely (FAA AIM 5-4-5; IPH ch. 4).`,
        fr: `Le point de descente à vue est l’endroit où commence une descente normale à 3° de la MDA vers la zone de toucher. Une règle pratique donne sa distance du seuil : HAT ÷ 300, ici 470 ÷ 300, environ ${vdpNm.toString().replace(".", ",")} NM. Quitter la MDA avant le VDP vous met bas ; l’atteindre sans la piste en vue rend un atterrissage normal peu probable (FAA AIM 5-4-5 ; IPH ch. 4).`,
      },
    }),
    formulaStep("rn-gust", {
      eyebrow: L("The numbers", "Les chiffres"),
      title: L("Gusts: half the gust factor", "Rafales : la moitié de l’écart"),
      visual: [
        DIAGRAM(
          "rn-gust.wind",
          {
            kind: "calc",
            calc: {
              kind: "windTriangle",
              drag: ["wind"],
              course: 30,
              tasKt: 94,
              windDir: 320,
              windKt: 16,
            },
          },
          L(
            `Runway 03, wind 320/16 gusting 24: about ${cross} gusting ${crossG} kt of crosswind from the left`,
            `Piste 03, vent 320/16 rafales 24 : environ ${cross} rafales ${crossG} kt de travers gauche`,
          ),
          G.left,
          368,
          960,
          592,
          { interactive: true },
        ),
      ],
      formula: L(
        "{Vapp} = 90 + ½ × ({gust} − {wind})",
        "{Vapp} = 90 + ½ × ({rafale} − {vent})",
      ),
      units: L("KIAS · knots", "KIAS · nœuds"),
      lines: [
        {
          en: `Vapp | = 90 + ½ × 8 = !${vapp} KIAS!`,
          fr: `Vapp | = 90 + ½ × 8 = !${vapp} KIAS!`,
        },
        {
          en: `GS | ≈ ${vapp} − ${head} ≈ !${gs} kt!`,
          fr: `Vs | ≈ ${vapp} − ${head} ≈ !${gs} kt!`,
        },
        {
          en: `VS | ≈ ${gs} × 5.3 ≈ !${vs} fpm!`,
          fr: `Vz | ≈ ${gs} × 5,3 ≈ !${vs} ft/min!`,
        },
      ],
      after: {
        en: `Crosswind up to ${crossG} kt: the C172S was demonstrated in 15.`,
        fr: `Travers jusqu’à ${crossG} kt : le C172S a été démontré à 15.`,
      },
      foot: L(
        "FAA AFH ch. 9 · C172S POH sec. 4 · about",
        "FAA AFH ch. 9 · C172S POH sec. 4 · environ",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "Vapp = normal approach speed + ½ × gust factor",
            "Vapp = vitesse d’approche normale + ½ × écart de rafale",
          ),
          ruleOfThumb: {
            en: `Wind 320/16 gusting 24 on runway 03: Vapp 90 + ½ × 8 = ${vapp} KIAS; about ${head} kt of headwind, so about ${gs} kt of ground speed and about ${vs} ft/min on the 3° glidepath. The crosswind is about ${cross} gusting ${crossG} kt from the left: above the 15 kt demonstrated in the C172S (POH section 4). Set your own limit before CRAGG (FAA AFH ch. 9).`,
            fr: `Vent 320/16 rafales 24 en piste 03 : Vapp 90 + ½ × 8 = ${vapp} KIAS ; environ ${head} kt de face, donc environ ${gs} kt de vitesse sol et environ ${vs} ft/min sur le plan à 3°. Le travers vaut environ ${cross} rafales ${crossG} kt de la gauche : au-delà des 15 kt démontrés du C172S (POH section 4). Fixez votre limite avant CRAGG (FAA AFH ch. 9).`,
          },
          refs: [{ src: "FAA-AFH", ref: "ch. 9" }],
        },
      ],
    }),
    stepsStep("rn-steps", {
      eyebrow: L("The flow", "Le déroulé"),
      title: L("From TALUS to the runway", "De TALUS à la piste"),
      rows: [
        {
          heading: L("TALUS at 4,000", "TALUS à 4 000"),
          small: L(
            "the approach loaded, LNAV/VNAV on the PFD",
            "l’approche chargée, LNAV/VNAV sur le PFD",
          ),
        },
        {
          heading: L(
            "FENNY: 3,600, a 90° turn",
            "FENNY : 3 600, virage de 90°",
          ),
          small: {
            en: `slow to Vapp ${vapp} KIAS`,
            fr: `ralentissez à Vapp ${vapp} KIAS`,
          },
        },
        {
          heading: L("Before CRAGG: your limit", "Avant CRAGG : votre limite"),
          small: L(
            "the crosswind you will accept today",
            "le vent de travers accepté aujourd’hui",
          ),
        },
        {
          heading: L("CRAGG: follow the glidepath", "CRAGG : suivez le plan"),
          small: {
            en: `about ${vs} ft/min, do not chase the gusts`,
            fr: `environ ${vs} ft/min, sans courir après les rafales`,
          },
        },
        {
          heading: L("DA 1,500: land or go", "DA 1 500 : atterrir ou remettre"),
          small: L(
            "missed: 4,500 direct MSV and hold",
            "remise : 4 500 direct MSV et attente",
          ),
        },
      ],
      visual: [
        DIAGRAM(
          "rn-steps.profile",
          {
            kind: "calc",
            calc: {
              kind: "profile",
              fromFt: R03.cragg,
              toFt: R03.da,
              angleDeg: 3,
              gsKt: gs,
            },
          },
          L(
            "Glidepath from CRAGG at 2,900 to DA 1,500",
            "Plan de CRAGG à 2 900 jusqu’à la DA 1 500",
          ),
          1080,
          400,
          720,
          328,
        ),
      ],
      foot: L(
        "MSVL RNAV (GPS) RWY 03 · missed approach as published",
        "MSVL RNAV (GPS) 03 · remise des gaz publiée",
      ),
      reader: {
        en: `The flow: TALUS at 4,000 with the approach loaded and LNAV/VNAV annunciated; FENNY at 3,600, a 90° turn onto final, slow to ${vapp} KIAS; before CRAGG, decide the crosswind you accept today; from CRAGG follow the glidepath (about ${vs} ft/min) without chasing the gusts; at DA 1,500 land or go around: climb to 4,500 direct MSV and hold.`,
        fr: `Le déroulé : TALUS à 4 000, l’approche chargée et LNAV/VNAV affiché ; FENNY à 3 600, virage de 90° vers la finale, ralentissez à ${vapp} KIAS ; avant CRAGG, décidez du vent de travers accepté aujourd’hui ; depuis CRAGG suivez le plan (environ ${vs} ft/min) sans courir après les rafales ; à la DA 1 500, atterrissez ou remettez les gaz : montée à 4 500 direct MSV et attente.`,
      },
    }),
    mistakesStep("rn-errors", {
      title: L("What goes wrong", "Ce qui tourne mal"),
      rows: [
        {
          error: L("Diving from the MDA", "Plonger depuis la MDA"),
          why: L(
            "Leaving 1,620 before the VDP: low over the terrain.",
            "Quitter 1 620 avant le VDP : bas sur le relief.",
          ),
          fix: L("Wait for the VDP, then 3°.", "Attendez le VDP, puis 3°."),
        },
        {
          error: L("Chasing every gust", "Suivre chaque rafale"),
          why: L(
            "Big throttle moves: the speed and the path swing.",
            "De grands coups de manette : vitesse et plan oscillent.",
          ),
          fix: L(
            "Average the speed, small power.",
            "Moyennez la vitesse, petite puissance.",
          ),
        },
        {
          error: L("No crosswind limit", "Pas de limite de travers"),
          why: L(
            "Deciding in the flare, at 23 kt of gust.",
            "Décider à l’arrondi, à 23 kt de rafale.",
          ),
          fix: L("Set it before CRAGG.", "Fixez-la avant CRAGG."),
        },
      ],
      foot: L(
        "ACS IR.VI.A and IR.VI.B · MDA +100/−0 ft",
        "ACS IR.VI.A et IR.VI.B · MDA +100/−0 ft",
      ),
      reader: L(
        "Common mistakes: leaving the LNAV MDA before the VDP (low over the valley terrain), chasing every gust with big power changes, and deciding about the crosswind in the flare instead of before the final approach fix. The ACS holds the MDA +100/−0 ft (IR.VI.A).",
        "Erreurs fréquentes : quitter la MDA LNAV avant le VDP (bas sur le relief de la vallée), suivre chaque rafale par de grands changements de puissance, et décider du vent de travers à l’arrondi au lieu d’avant le repère d’approche finale. L’ACS tient la MDA à +100/−0 ft (IR.VI.A).",
      ),
    }),
    quizStep("rn-quiz", {
      eyebrow: L("Question", "Question"),
      title: L("The glidepath flag appears", "Le drapeau du plan apparaît"),
      quote: L(
        "Two miles before CRAGG the vertical guidance is lost. The lateral guidance is fine.",
        "Deux nautiques avant CRAGG, le guidage vertical est perdu. Le guidage latéral est bon.",
      ),
      quiz: mcq(
        L("Your minimums are now…", "Vos minima sont maintenant…"),
        [
          {
            text: L("LNAV: MDA 1,620", "LNAV : MDA 1 620"),
            why: L(
              "Right: without the glidepath, fly the LNAV line.",
              "Juste : sans le plan, volez la ligne LNAV.",
            ),
          },
          {
            text: L("Still DA 1,500", "Toujours la DA 1 500"),
            why: L(
              "The DA needs the vertical guidance.",
              "La DA exige le guidage vertical.",
            ),
          },
          {
            text: L("Circling, 1,740", "Circling, 1 740"),
            why: L(
              "You can still fly straight-in, as LNAV.",
              "Vous pouvez encore faire une directe, en LNAV.",
            ),
          },
        ],
        0,
        L(
          "No vertical guidance: LNAV minimums, MDA 1,620, step down at CRAGG and use the VDP.",
          "Plus de guidage vertical : minima LNAV, MDA 1 620, descente à CRAGG et VDP.",
        ),
      ),
      foot: L("FAA AIM 5-4-5 · FAA IPH ch. 4", "FAA AIM 5-4-5 · FAA IPH ch. 4"),
      reader: L(
        "Losing the vertical guidance before the final approach fix downgrades the approach to LNAV: the minimums become MDA 1,620 ft. Descend at CRAGG, level off at the MDA, and leave it at the VDP with the runway in sight, or fly the missed approach at the threshold.",
        "Perdre le guidage vertical avant le repère d’approche finale ramène l’approche en LNAV : les minima deviennent MDA 1 620 ft. Descendez à CRAGG, mettez-vous en palier à la MDA, et quittez-la au VDP piste en vue, ou faites la remise des gaz au seuil.",
      ),
    }),
    readyStep("rn-ready", {
      objectives: [
        L(
          "Fly the glidepath to DA 1,500",
          "Suivre le plan jusqu’à la DA 1 500",
        ),
        {
          en: `Vapp ${vapp} KIAS in the gusts`,
          fr: `Vapp ${vapp} KIAS dans les rafales`,
        },
        L(
          "Know the LNAV MDA 1,620 and its VDP",
          "Connaître la MDA LNAV 1 620 et son VDP",
        ),
      ],
      standards: [
        {
          n: L("¾", "¾"),
          text: L("scale, both needles", "d’échelle, les deux aiguilles"),
          color: "nav",
        },
        {
          n: { en: String(vapp), fr: String(vapp) },
          text: L("KIAS, ±10", "KIAS, ±10"),
          color: "key",
        },
        {
          n: L("1,500", "1 500"),
          text: L("DA, no lower", "DA, pas plus bas"),
          color: "stop",
        },
        {
          n: L("4,500", "4 500"),
          text: L("missed: direct MSV", "remise : direct MSV"),
        },
      ],
      tip: L(
        "Wind 320/16 gusting 24, ceiling 1,700 ft: you should see the runway near DA.",
        "Vent 320/16 rafales 24, plafond 1 700 ft : la piste devrait apparaître près de la DA.",
      ),
      reader: L(
        "Standards (FAA-S-ACS-8C IR.VI.B for an approach with vertical guidance): less than ¾-scale deflection, airspeed ±10 KIAS, no descent below DA without the required visual references; the missed approach climbs to 4,500 direct MSV.",
        "Critères (FAA-S-ACS-8C IR.VI.B pour une approche avec guidage vertical) : moins de ¾ d’échelle de déviation, vitesse ±10 KIAS, pas de descente sous la DA sans les références visuelles requises ; la remise des gaz monte à 4 500 direct MSV.",
      ),
    }),
    flyStep(
      "rn-fly",
      "app-lnav-vnav",
      L("Fly the lesson: RNAV 03", "Volez la leçon : RNAV 03"),
      L(
        "From TALUS at 4,000: FENNY, CRAGG, the glidepath to DA 1,500 in gusts.",
        "Depuis TALUS à 4 000 : FENNY, CRAGG, le plan jusqu’à la DA 1 500 en rafales.",
      ),
      [
        { en: `Vapp ${vapp} KIAS.`, fr: `Vapp ${vapp} KIAS.` },
        L(
          "Your crosswind limit, before CRAGG.",
          "Votre limite de travers, avant CRAGG.",
        ),
      ],
      15,
      ["wind", "turbulence"],
    ),
  ];
  return briefing(
    {
      id: LNAV_BRIEFING_ID,
      exerciseId: "app-lnav-vnav",
      title: L(
        "Briefing: RNAV, LNAV/VNAV and LNAV",
        "Briefing : RNAV, LNAV/VNAV et LNAV",
      ),
      summary: L(
        "The briefing of the RNAV (GPS) RWY 03 lesson: DA against MDA, the visual descent point, Vapp in gusts and your crosswind limit, then fly it.",
        "Le briefing de la leçon RNAV (GPS) piste 03 : DA contre MDA, le point de descente à vue, la Vapp en rafales et votre limite de travers, puis le vol.",
      ),
      tags: ["ifr", "approach", "rnav", "vdp"],
      minutes: 15,
    },
    steps,
    lnavScenes(),
  );
}

// ================================================================== ma-da
function missedScenes(): Record<string, SimScene> {
  const thrToDa = (I27.da - I27.tdze - I27.tch) / FT_PER_NM;
  return {
    "ma.toga": scene(
      "ma.toga",
      {
        pos: {
          runway: { icao: "PARD", id: "27" },
          distNm: Math.round(thrToDa * 100) / 100,
        },
        altFt: I27.da,
        hdg: 270,
        iasKt: 74,
        pitch: 7,
        vsFpm: 700,
        radios: ILS_RADIOS,
      },
      { label: "Go-around at DA 670 · pitch 7° · 74 KIAS" },
    ),
    "ma.da": scene(
      "ma.da",
      {
        pos: {
          runway: { icao: "PARD", id: "27" },
          distNm: Math.round(thrToDa * 100) / 100,
        },
        altFt: I27.da,
        hdg: 264,
        iasKt: 90,
        pitch: -2,
        vsFpm: -435,
        radios: ILS_RADIOS,
      },
      { label: "DA 670 on the ILS 27 · no runway in sight" },
    ),
  };
}
export function missedBriefing(): Briefing {
  const entry = holdEntry(I27.hold.inbound, I27.hold.turn, I27.ardCourse);
  // the C172S climb: about 700 ft/min at Vy 74 KIAS (POH sec. 5, sea level, adjusted for the sim's weight)
  const ftPerNm = Math.round(700 / (74 / 60) / 10) * 10;
  const toThousandS = Math.round((((1000 - I27.da) / 700) * 60) / 5) * 5;
  const steps: Step[] = [
    coverStep(
      "md-cover",
      L("Briefing: the missed approach", "Briefing : la remise des gaz"),
      {
        eyebrow: L(
          "Lesson briefing · Missed approaches",
          "Briefing de leçon · Approches interrompues",
        ),
        main: L("Missed approach at DA", "Remise des gaz à la DA"),
        sub: L("Then the hold at ARD", "Puis l’attente à ARD"),
        lead: L(
          "Ceiling 120 ft: no runway at 670. Go around, climb, turn at 1,000, hold at ARD.",
          "Plafond 120 ft : pas de piste à 670. Remettez, montez, virez à 1 000, attendez à ARD.",
        ),
        meta: L(
          "About 15 min · ILS 27 · FAA AIM 5-4-21",
          "Environ 15 min · ILS 27 · FAA AIM 5-4-21",
        ),
        hero: [
          DIAGRAM(
            "md-cover.hold",
            {
              kind: "hold",
              inbound: I27.hold.inbound,
              turn: I27.hold.turn,
              fix: I27.hold.fix,
              crs: I27.ardCourse,
              quiet: true,
            },
            L(
              "The missed approach hold at ARD, inbound 270, right turns",
              "L’attente de remise des gaz à ARD, rapprochement 270, virages à droite",
            ),
            984,
            96,
            816,
            888,
          ),
        ],
        reader: L(
          "The briefing of the missed approach lesson: on the ILS 27 with a 120 ft ceiling, there will be no runway at DA 670. Go around at once, climb straight ahead to 1,000 ft, then a climbing right turn to 3,000 direct ARD, and enter the hold.",
          "Le briefing de la leçon remise des gaz : sur l’ILS 27 sous un plafond de 120 ft, il n’y aura pas de piste à la DA 670. Remettez les gaz immédiatement, montez tout droit jusqu’à 1 000 ft, puis montée en virage à droite vers 3 000 direct ARD, et entrez dans l’attente.",
        ),
      },
    ),
    whyStep("md-why", {
      eyebrow: L("Why it matters", "Pourquoi c’est important"),
      title: L(
        "The missed is part of the approach",
        "La remise fait partie de l’approche",
      ),
      n: L("0", "0"),
      nW: 168,
      unit: L("s", "s"),
      color: "stop",
      statement: L(
        "of look-see below DA without the runway",
        "de « coup d’œil » sous la DA sans la piste",
      ),
      body: L(
        "At DA with no visual reference: go around now. Fly the published missed exactly.",
        "À la DA sans référence visuelle : remettez tout de suite. Volez la remise publiée à la lettre.",
      ),
      sideTitle: L("The chart · missed ILS 27", "La carte · remise ILS 27"),
      side: [
        {
          n: L("1,000", "1 000"),
          text: L("straight ahead, then turn", "tout droit, puis virage"),
          color: "key",
        },
        {
          n: L("3,000", "3 000"),
          text: L(
            "climbing right turn, direct ARD",
            "virage montant à droite, direct ARD",
          ),
          color: "text",
        },
        {
          n: L("ARD", "ARD"),
          text: L(
            "hold: inbound 270, right turns",
            "attente : rapprochement 270, à droite",
          ),
          color: "nav",
        },
      ],
      foot: L(
        "PARD ILS RWY 27 (simulated) · FAA AIM 5-4-21 · ICAO Doc 8168",
        "PARD ILS 27 (simulée) · FAA AIM 5-4-21 · OACI Doc 8168",
      ),
      reader: L(
        "The missed approach is part of every approach. At DA without the required visual references, go around immediately: no level-off, no look-see. Fly the published missed exactly unless ATC says otherwise: climb to 1,000 ft, then a climbing right turn to 3,000 ft direct ARD and hold, inbound 270, right turns (FAA AIM 5-4-21; ICAO Doc 8168).",
        "L’approche interrompue fait partie de toute approche. À la DA sans les références visuelles requises, remettez les gaz immédiatement : pas de palier, pas de « coup d’œil ». Volez la remise publiée à la lettre sauf instruction du contrôle : montée à 1 000 ft, puis virage montant à droite vers 3 000 ft direct ARD et attente, rapprochement 270, virages à droite (FAA AIM 5-4-21 ; OACI Doc 8168).",
      ),
    }),
    quizStep("md-entry", {
      eyebrow: L("Question", "Question"),
      title: L("The entry at ARD", "L’entrée à ARD"),
      visual: [
        DIAGRAM(
          "md-entry.hold",
          {
            kind: "hold",
            inbound: I27.hold.inbound,
            turn: I27.hold.turn,
            fix: I27.hold.fix,
            crs: I27.ardCourse,
          },
          L(
            `Hold at ARD, inbound 270, right turns, arriving on course ${pad3(I27.ardCourse)}`,
            `Attente à ARD, rapprochement 270, virages à droite, arrivée au ${pad3(I27.ardCourse)}`,
          ),
          G.left,
          312,
          768,
          672,
        ),
      ],
      quiz: mcq(
        {
          en: `Course ${pad3(I27.ardCourse)} to ARD. Your entry?`,
          fr: `Route ${pad3(I27.ardCourse)} vers ARD. Votre entrée ?`,
        },
        (["DIRECT", "TEARDROP", "PARALLEL"] as HoldEntry[]).map((e) => ({
          text: ENTRY_NAME[e],
          why:
            e === entry
              ? L(
                  "Right: 46° from the inbound, on the holding side.",
                  "Juste : 46° du rapprochement, du côté de l’attente.",
                )
              : L("Not from this sector.", "Pas depuis ce secteur."),
        })),
        (["DIRECT", "TEARDROP", "PARALLEL"] as HoldEntry[]).indexOf(entry),
        {
          en: `Course ${pad3(I27.ardCourse)} lies inside the 180° direct sector of the hold inbound 270, right turns (courses 200 round through 270 to 020): ${ENTRY_NAME[entry].en.toLowerCase()} entry.`,
          fr: `La route ${pad3(I27.ardCourse)} est dans le secteur direct de 180° de l’attente rapprochement 270, virages à droite (routes 200 à 020 en passant par 270) : entrée ${ENTRY_NAME[entry].fr!.toLowerCase()}.`,
        },
      ),
      foot: L(
        "FAA AIM 5-3-8 · ±5° at a sector boundary",
        "FAA AIM 5-3-8 · ±5° à une limite de secteur",
      ),
      reader: {
        en: `From the runway, ARD is about ${I27.ardNm} NM away on course ${pad3(I27.ardCourse)}. With an inbound course of 270 and right turns, that course is in the ${ENTRY_NAME[entry].en.toLowerCase()} sector (FAA AIM 5-3-8): cross ARD, turn right to the outbound heading, time one minute.`,
        fr: `Depuis la piste, ARD est à environ ${dec(I27.ardNm, 2).fr} NM au ${pad3(I27.ardCourse)}. Avec un rapprochement 270 et des virages à droite, cette route est dans le secteur ${ENTRY_NAME[entry].fr!.toLowerCase()} (FAA AIM 5-3-8) : passez ARD, virez à droite vers le cap d’éloignement, chronométrez une minute.`,
      },
    }),
    instrumentStep("md-toga", {
      eyebrow: L("The go-around", "La remise des gaz"),
      title: L(
        "Pitch, power, then the rest",
        "Assiette, puissance, puis le reste",
      ),
      lead: L(
        "Aviate, navigate, communicate.",
        "Piloter, naviguer, communiquer.",
      ),
      gauge: "ai",
      alt: L(
        "Attitude indicator: 7° nose up, wings level",
        "Horizon artificiel : 7° à cabrer, ailes à plat",
      ),
      scene: "ma.toga",
      mode: "frozen",
      // one mark: the attitude (the flaps and the GPS are not on this instrument)
      marks: [[0, -0.3]],
      rows: [
        {
          heading: L("Full power, 7° nose up", "Plein gaz, 7° à cabrer"),
          body: L(
            "Hold the attitude: Vy 74 KIAS follows.",
            "Tenez l’assiette : Vy 74 KIAS suit.",
          ),
        },
        {
          heading: L("Flaps 10, then up", "Volets 10, puis rentrés"),
          body: L(
            "Up once climbing, above 65 KIAS.",
            "Rentrés en montée, au-dessus de 65 KIAS.",
          ),
        },
        {
          heading: L("Sequence the missed", "Activez la remise"),
          body: L(
            "Then NAV, then “missed approach” to ATC.",
            "Puis NAV, puis « remise des gaz » au contrôle.",
          ),
        },
      ],
      foot: L(
        "C172S POH sec. 4 (balked landing) · Vy 74 KIAS",
        "C172S POH sec. 4 (remise des gaz) · Vy 74 KIAS",
      ),
      reader: L(
        "The go-around (G): full power, pitch about 7° nose up and hold it so the speed settles at Vy, 74 KIAS; flaps no more than 10°, retracted once the climb is positive, at a safe altitude and above 65 KIAS (C172S POH section 4, balked landing); then sequence the missed approach in the GPS, select NAV, and tell ATC “missed approach”. Aviate, navigate, communicate.",
        "La remise des gaz (G) : plein gaz, assiette d’environ 7° à cabrer tenue pour que la vitesse se stabilise à Vy, 74 KIAS ; volets à 10° au plus, rentrés en montée franche, à une hauteur sûre et au-dessus de 65 KIAS (C172S POH section 4, atterrissage interrompu) ; puis activez la remise dans le GPS, sélectionnez NAV, et annoncez « remise des gaz » au contrôle. Piloter, naviguer, communiquer.",
      ),
    }),
    formulaStep("md-climb", {
      eyebrow: L("The numbers", "Les chiffres"),
      title: L("Is the climb good enough?", "La montée suffit-elle ?"),
      formula: L("{ft/NM} = [{VS} × 60/{GS}]", "{ft/NM} = [{Vz} × 60/{Vs}]"),
      units: L(
        "ft per NM · VS in ft/min · GS in knots",
        "ft par NM · Vz en ft/min · Vs en nœuds",
      ),
      lines: [
        {
          en: `climb | = [700 × 60/74] ≈ !${ftPerNm} ft/NM!`,
          fr: `montée | = [700 × 60/74] ≈ !${ftPerNm} ft/NM!`,
        },
        {
          en: "required | = !200 ft/NM! standard",
          fr: "exigé | = !200 ft/NM! standard",
        },
        {
          en: `to 1,000 | ≈ [330/700] min ≈ !${toThousandS} s!`,
          fr: `vers 1 000 | ≈ [330/700] min ≈ !${toThousandS} s!`,
        },
      ],
      after: L(
        "Nearly three times the standard. A higher figure on a chart is mandatory.",
        "Presque trois fois le standard. Un chiffre plus élevé sur une carte s’impose.",
      ),
      foot: L(
        "FAA IPH ch. 4 · 200 ft/NM standard missed climb · calm wind",
        "FAA IPH ch. 4 · 200 ft/NM, pente standard · vent calme",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "climb gradient (ft/NM) = VS (ft/min) × 60 ÷ ground speed (kt)",
            "pente (ft/NM) = Vz (ft/min) × 60 ÷ vitesse sol (kt)",
          ),
          ruleOfThumb: {
            en: `About 700 ft/min at 74 kt gives about ${ftPerNm} ft/NM, nearly three times the standard 200 ft/NM missed-approach gradient. From DA 670 to 1,000 ft takes about ${toThousandS} s, straight ahead. A chart that publishes a higher gradient makes it mandatory (FAA IPH ch. 4).`,
            fr: `Environ 700 ft/min à 74 kt donnent environ ${ftPerNm} ft/NM, presque trois fois la pente standard de 200 ft/NM. De la DA 670 à 1 000 ft : environ ${toThousandS} s, tout droit. Une carte qui publie une pente plus forte la rend obligatoire (FAA IPH ch. 4).`,
          },
          refs: [{ src: "FAA-IPH", ref: "ch. 4" }],
        },
      ],
    }),
    yourTurnStep("md-steps", {
      eyebrow: L("Your turn", "À vous"),
      title: L("From DA to the hold", "De la DA à l’attente"),
      rows: [
        {
          heading: L("100 above: hand on G", "100 au-dessus : main sur G"),
          small: L("“approaching minimums”", "« approche des minimums »"),
        },
        {
          heading: L("670, no runway: G", "670, pas de piste : G"),
          small: L("full power, 7°, flaps 10", "plein gaz, 7°, volets 10"),
        },
        {
          heading: L("Straight ahead to 1,000", "Tout droit jusqu’à 1 000"),
          small: {
            en: `about ${toThousandS} s, on runway heading`,
            fr: `environ ${toThousandS} s, dans l’axe`,
          },
        },
        {
          heading: L("Right turn, direct ARD", "Virage à droite, direct ARD"),
          small: L(
            "climbing to 3,000 · missed sequenced",
            "en montée vers 3 000 · remise activée",
          ),
        },
        {
          heading: {
            en: `ARD: ${ENTRY_NAME[entry].en.toLowerCase()} entry`,
            fr: `ARD : entrée ${ENTRY_NAME[entry].fr!.toLowerCase()}`,
          },
          small: L(
            "the five Ts at the fix, 1 minute legs",
            "les cinq T au repère, branches d’une minute",
          ),
        },
      ],
      view: GAUGE("ai"),
      alt: L(
        "Attitude indicator at DA, descending on the glideslope",
        "Horizon artificiel à la DA, en descente sur le glide",
      ),
      scene: "ma.da",
      prompt: L(
        "Your turn: G, pitch up to 7°",
        "À vous : G, assiette 7° à cabrer",
      ),
      controls: ["pitch"],
      assist: { holdIas: true },
      goal: {
        all: [{ id: "pitchAtt", p: { min: 6, max: 9, holdS: 2 } }],
        holdS: 2,
        graded: false,
        success: L(
          "7° nose up: Vy follows. Now flaps 10.",
          "7° à cabrer : Vy suit. Maintenant volets 10.",
        ),
      },
      hint: L(
        "Hold the up side of the pitch pad.",
        "Maintenez le côté haut des boutons d’assiette.",
      ),
      foot: L(
        "Missed approach as published · ATC may amend it",
        "Remise publiée · le contrôle peut la modifier",
      ),
      reader: {
        en: `The flow: 100 ft above DA, hand on the go-around; at 670 with no runway, G: full power, 7° nose up, flaps 10; straight ahead to 1,000 ft (about ${toThousandS} s); then a climbing right turn direct ARD to 3,000 with the missed approach sequenced; at ARD a ${ENTRY_NAME[entry].en.toLowerCase()} entry, the five Ts, one-minute legs.`,
        fr: `Le déroulé : 100 ft au-dessus de la DA, main sur la remise ; à 670 sans piste, G : plein gaz, 7° à cabrer, volets 10 ; tout droit jusqu’à 1 000 ft (environ ${toThousandS} s) ; puis virage montant à droite direct ARD vers 3 000 avec la remise activée ; à ARD une entrée ${ENTRY_NAME[entry].fr!.toLowerCase()}, les cinq T, branches d’une minute.`,
      },
    }),
    mistakesStep("md-errors", {
      title: L("What goes wrong", "Ce qui tourne mal"),
      rows: [
        {
          error: L("A late go-around", "Une remise tardive"),
          why: L(
            "Looking for the runway while sinking below 670.",
            "Chercher la piste en descendant sous 670.",
          ),
          fix: L("Decide at 670, not after.", "Décidez à 670, pas après."),
        },
        {
          error: L("Turning before 1,000", "Virer avant 1 000"),
          why: L(
            "The chart says straight ahead to 1,000 ft.",
            "La carte dit tout droit jusqu’à 1 000 ft.",
          ),
          fix: L("Fly the words of the chart.", "Volez les mots de la carte."),
        },
        {
          error: L("Missed not sequenced", "Remise non activée"),
          why: L(
            "The GPS stays on the runway: no guidance to ARD.",
            "Le GPS reste sur la piste : pas de guidage vers ARD.",
          ),
          fix: L(
            "Sequence it after pitch and power.",
            "Activez-la après assiette et puissance.",
          ),
        },
      ],
      foot: L(
        "ACS IR.VI.B · go around at DA, immediately",
        "ACS IR.VI.B · remise des gaz à la DA, immédiatement",
      ),
      reader: L(
        "Common mistakes: a late go-around while looking for the runway below DA, turning before 1,000 ft, and forgetting to sequence the missed approach so the GPS gives no guidance to ARD. The ACS asks for the missed approach to start immediately at DA when the required visual references are not distinctly visible (FAA-S-ACS-8C IR.VI.B).",
        "Erreurs fréquentes : une remise tardive en cherchant la piste sous la DA, virer avant 1 000 ft, et oublier d’activer la remise si bien que le GPS ne guide pas vers ARD. L’ACS exige de commencer la remise des gaz immédiatement à la DA si les références visuelles requises ne sont pas nettement visibles (FAA-S-ACS-8C IR.VI.B).",
      ),
    }),
    readyStep("md-ready", {
      objectives: [
        L(
          "Go around at DA 670 without delay",
          "Remettre les gaz à la DA 670 sans délai",
        ),
        L(
          "Fly the published missed approach",
          "Voler la remise des gaz publiée",
        ),
        {
          en: `Enter the ARD hold: ${ENTRY_NAME[entry].en.toLowerCase()}`,
          fr: `Entrer dans l’attente d’ARD : ${ENTRY_NAME[entry].fr!.toLowerCase()}`,
        },
      ],
      standards: [
        {
          n: L("DA", "DA"),
          text: L("go around at once, no lower", "remise immédiate, pas plus bas"),
          color: "stop",
        },
        {
          n: L("1,000", "1 000"),
          text: L("before the turn", "avant le virage"),
          color: "key",
        },
        { n: L("3,000", "3 000"), text: L("±100 ft at ARD", "±100 ft à ARD") },
        {
          n: L("1:00", "1:00"),
          text: L("inbound legs", "branches de rapprochement"),
          color: "nav",
        },
      ],
      tip: L(
        "Ceiling 120 ft, ¼ SM: expect no runway. The autopilot may fly the hold.",
        "Plafond 120 ft, ¼ SM : pas de piste à attendre. Le pilote automatique peut voler l’attente.",
      ),
      reader: L(
        "Standards: go around immediately at DA, without descending below it, the turn at 1,000 ft, 3,000 ft ±100 ft, and the correct entry with one-minute inbound legs at ARD (FAA-S-ACS-8C IR.VI.B, IR.VI.C and IR.III.B).",
        "Critères : remise des gaz immédiate à la DA, sans descendre en dessous, le virage à 1 000 ft, 3 000 ft ±100 ft, et la bonne entrée avec des branches de rapprochement d’une minute à ARD (FAA-S-ACS-8C IR.VI.B, IR.VI.C et IR.III.B).",
      ),
    }),
    flyStep(
      "md-fly",
      "ma-da",
      L(
        "Fly the lesson: missed approach at DA",
        "Volez la leçon : remise des gaz à la DA",
      ),
      L(
        "Vectors to the ILS 27 in a 120 ft ceiling: go around at 670 and hold at ARD.",
        "Guidage vers l’ILS 27 sous un plafond de 120 ft : remettez à 670 et attendez à ARD.",
      ),
      [
        L("At 670: G, no look-see.", "À 670 : G, pas de coup d’œil."),
        L(
          "Straight ahead to 1,000, then right to ARD.",
          "Tout droit jusqu’à 1 000, puis à droite vers ARD.",
        ),
      ],
      15,
    ),
  ];
  return briefing(
    {
      id: MISSED_BRIEFING_ID,
      exerciseId: "ma-da",
      title: L("Briefing: the missed approach", "Briefing : la remise des gaz"),
      summary: L(
        "The briefing of the missed approach lesson: no look-see at DA, the go-around, the climb gradient, the entry at ARD, then fly it.",
        "Le briefing de la leçon remise des gaz : pas de coup d’œil à la DA, la remise, la pente de montée, l’entrée à ARD, puis le vol.",
      ),
      tags: ["ifr", "approach", "missed", "holding"],
      minutes: 15,
    },
    steps,
    missedScenes(),
  );
}

// ================================================================== ma-pp
const PP: ("ai" | "dg")[] = ["ai", "dg"];
export function ppIlsBriefing(): Briefing {
  const n = ilsNumbers();
  const steps: Step[] = [
    coverStep(
      "mp-cover",
      L(
        "Briefing: the partial-panel ILS",
        "Briefing : l’ILS en panneau partiel",
      ),
      {
        eyebrow: L(
          "Lesson briefing · Abnormals",
          "Briefing de leçon · Situations anormales",
        ),
        main: L("Partial-panel ILS", "ILS en panneau partiel"),
        sub: L(
          "No attitude, no heading: the needles still work",
          "Ni horizon ni cap : les aiguilles marchent",
        ),
        lead: L(
          "The AHRS has failed. Fly the ILS 27 on the standby, the compass and the CDI.",
          "L’AHRS est en panne. Volez l’ILS 27 sur le secours, le compas et le CDI.",
        ),
        meta: L(
          "About 15 min · hand-flown · ACS IR.VII.D",
          "Environ 15 min · pilotage manuel · ACS IR.VII.D",
        ),
        hero: [
          INST(
            { kind: "six" },
            L(
              "Six-pack with the attitude and heading indicators failed, on the ILS 27",
              "Six instruments, horizon et cap en panne, sur l’ILS 27",
            ),
            984,
            240,
            816,
            612,
            { id: "mp-cover.six", scene: "ils.final", covers: PP },
          ),
        ],
        scene: "ils.final",
        reader: L(
          "The briefing of the partial-panel ILS lesson: with the attitude and heading reference (AHRS) failed, fly the ILS 27 on the standby attitude indicator or the turn coordinator, with the magnetic compass for heading. The localizer and glideslope needles are not affected.",
          "Le briefing de la leçon ILS en panneau partiel : référence d’attitude et de cap (AHRS) en panne, volez l’ILS 27 sur l’horizon de secours ou l’indicateur de virage, avec le compas magnétique pour le cap. Les aiguilles du localizer et du glide ne sont pas touchées.",
        ),
      },
    ),
    compareStep("mp-what", {
      eyebrow: L("What is left", "Ce qui reste"),
      title: L("Lost, and still working", "Perdu, et encore là"),
      halves: [
        {
          eyebrow: L("Lost · AHRS", "Perdu · AHRS"),
          color: "stop",
          view: { kind: "six" },
          alt: L(
            "Attitude and heading indicators covered",
            "Horizon et cap masqués",
          ),
          scene: "ils.final",
          covers: PP,
          rows: [
            {
              heading: L("Attitude", "Horizon"),
              small: L(
                "use the standby or the TC",
                "le secours ou l’indicateur",
              ),
            },
            {
              heading: L("Heading", "Cap"),
              small: L("use the compass, with lag", "le compas, avec retard"),
            },
          ],
          body: L(
            "Cover them: a failed gyro still looks alive.",
            "Masquez-les : un gyro en panne a l’air vivant.",
          ),
        },
        {
          eyebrow: L("Still there · NAV", "Toujours là · NAV"),
          color: "nav",
          view: GAUGE("hsi"),
          alt: L(
            "Localizer and glideslope needles on the ILS 27",
            "Aiguilles du localizer et du glide sur l’ILS 27",
          ),
          scene: "ils.final",
          rows: [
            {
              heading: L("Localizer", "Localizer"),
              small: L("the course needle", "l’aiguille de route"),
            },
            {
              heading: L("Glideslope", "Glide"),
              small: L("the vertical needle", "l’aiguille verticale"),
            },
          ],
          body: L(
            "Radio needles, not gyros: they still guide you.",
            "Des aiguilles radio, pas des gyros : elles guident.",
          ),
        },
      ],
      foot: L(
        "FAA IFH ch. 6–7 · ACS IR.VII.D",
        "FAA IFH ch. 6–7 · ACS IR.VII.D",
      ),
      reader: L(
        "An AHRS failure removes the attitude and the heading. Cover the failed displays: a failed gyro can look believable. The localizer and glideslope deviations come from the radios and still work, the airspeed, altimeter and vertical speed too. Attitude comes from the standby indicator or the turn coordinator, heading from the magnetic compass (FAA IFH ch. 6–7).",
        "Une panne d’AHRS supprime l’horizon et le cap. Masquez les affichages en panne : un gyro en panne peut paraître crédible. Les déviations du localizer et du glide viennent des radios et fonctionnent toujours, l’anémomètre, l’altimètre et le variomètre aussi. L’attitude vient de l’horizon de secours ou de l’indicateur de virage, le cap du compas magnétique (FAA IFH ch. 6–7).",
      ),
    }),
    quizStep("mp-quiz", {
      eyebrow: L("Question", "Question"),
      title: L("The compass on final 270", "Le compas en finale 270"),
      quote: L(
        "You roll out of a small turn onto heading 270, west, at a steady speed.",
        "Vous sortez d’un petit virage au cap 270, ouest, à vitesse constante.",
      ),
      quiz: mcq(
        L("The compass turning error is…", "L’erreur de virage du compas est…"),
        [
          {
            text: L(
              "Small: east and west headings",
              "Faible : caps est et ouest",
            ),
            why: L(
              "Right: the turning error is largest near north and south.",
              "Juste : l’erreur de virage est maximale près du nord et du sud.",
            ),
          },
          {
            text: L("Largest: lead by 30°", "Maximale : anticipez de 30°"),
            why: L(
              "That is rolling out on north or south.",
              "C’est le cas d’une sortie au nord ou au sud.",
            ),
          },
          {
            text: L(
              "None: the compass is a gyro",
              "Nulle : le compas est un gyro",
            ),
            why: L(
              "The compass is magnetic: it swings and lags.",
              "Le compas est magnétique : il oscille et traîne.",
            ),
          },
        ],
        0,
        L(
          "Turning error is near zero on east and west: this final course helps you. Accelerations still swing it.",
          "L’erreur de virage est quasi nulle à l’est et à l’ouest : cette finale vous aide. Les accélérations le font encore osciller.",
        ),
      ),
      foot: L(
        "FAA PHAK ch. 8 · northern hemisphere",
        "FAA PHAK ch. 8 · hémisphère nord",
      ),
      reader: L(
        "The magnetic compass turning error is largest when rolling out on north or south and near zero on east or west. On a westerly final course, 270, it is small; acceleration error still swings the card when the speed changes (FAA PHAK ch. 8).",
        "L’erreur de virage du compas magnétique est maximale en sortie au nord ou au sud et quasi nulle à l’est ou à l’ouest. Sur une finale vers l’ouest, 270, elle est faible ; l’erreur d’accélération fait encore osciller la rose quand la vitesse change (FAA PHAK ch. 8).",
      ),
    }),
    formulaStep("mp-turns", {
      eyebrow: L("The numbers", "Les chiffres"),
      title: L(
        "Small corrections: timed, at half rate",
        "Petites corrections : chronométrées, demi-taux",
      ),
      visual: [
        DIAGRAM(
          "mp-turns.d",
          { kind: "calc", calc: { kind: "turn", tasKt: 90, bankDeg: 7 } },
          L(
            "Half-standard-rate turn at 90 kt: about 7° of bank, 1.5° per second",
            "Virage au demi-taux à 90 kt : environ 7° d’inclinaison, 1,5° par seconde",
          ),
          G.left,
          336,
          960,
          648,
        ),
      ],
      formula: L("{time} = [{change}/1.5]", "{temps} = [{écart}/1,5]"),
      units: L(
        "time in s · change in ° · half rate 1.5°/s",
        "temps en s · écart en ° · demi-taux 1,5°/s",
      ),
      lines: [
        L("5° | = [5/1.5] ≈ !3 s!", "5° | = [5/1,5] ≈ !3 s!"),
        L("10° | = [10/1.5] ≈ !7 s!", "10° | = [10/1,5] ≈ !7 s!"),
      ],
      after: L(
        "Roll in, count, roll out. Then let the compass settle.",
        "Inclinez, comptez, sortez. Puis laissez le compas se stabiliser.",
      ),
      foot: L(
        "FAA IFH ch. 7 · bank for half rate ≈ TAS/20 + 3",
        "FAA IFH ch. 7 · inclinaison au demi-taux ≈ Vp/20 + 3",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "time (s) = heading change (°) ÷ 1.5 at half standard rate",
            "temps (s) = écart de cap (°) ÷ 1,5 au demi-taux",
          ),
          ruleOfThumb: L(
            "On the localizer, correct 5° at a time: about 3 s at half standard rate (about 7° of bank at 90 kt), then wings level and wait for the compass to settle before you read it (FAA IFH ch. 7).",
            "Sur le localizer, corrigez de 5° à la fois : environ 3 s au demi-taux (environ 7° d’inclinaison à 90 kt), puis ailes à plat et attendez que le compas se stabilise avant de le lire (FAA IFH ch. 7).",
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 7" }],
        },
      ],
    }),
    yourTurnStep("mp-steps", {
      eyebrow: L("Your turn", "À vous"),
      title: L("The scan, partial panel", "Le circuit visuel, panneau partiel"),
      rows: [
        {
          heading: L(
            "Cover the failed displays",
            "Masquez les affichages en panne",
          ),
          small: L(
            "then trust what is left",
            "puis faites confiance à ce qui reste",
          ),
        },
        {
          heading: L("Attitude: standby or TC", "Attitude : secours ou TC"),
          small: L("wings level is the default", "ailes à plat par défaut"),
        },
        {
          heading: L("Localizer: 5° at a time", "Localizer : 5° à la fois"),
          small: L(
            "timed, half rate, then wait",
            "chronométré, demi-taux, puis attendez",
          ),
        },
        {
          heading: L("Glideslope: as usual", "Glide : comme d’habitude"),
          small: {
            en: `about ${n.vs} ft/min at 90 KIAS`,
            fr: `environ ${n.vs} ft/min à 90 KIAS`,
          },
        },
        {
          heading: L("670: land or go", "670 : atterrir ou remettre"),
          small: L(
            "a go-around on partial panel too",
            "la remise aussi en panneau partiel",
          ),
        },
      ],
      view: { kind: "six" },
      alt: L(
        "Six-pack, partial panel, on the ILS, banked 12° to the right",
        "Six instruments, panneau partiel, sur l’ILS, 12° d’inclinaison à droite",
      ),
      scene: "ils.bank",
      covers: PP,
      prompt: L(
        "Your turn: wings level on the turn coordinator",
        "À vous : ailes à plat sur l’indicateur de virage",
      ),
      controls: ["bank"],
      assist: { holdAlt: false, holdIas: true },
      goal: {
        all: [{ id: "bankMax", p: { max: 3, holdS: 2 } }],
        holdS: 2,
        graded: false,
        success: L(
          "Wings level: the turn coordinator is centred.",
          "Ailes à plat : l’indicateur de virage est centré.",
        ),
      },
      hint: L(
        "Hold the L side of the bank pad.",
        "Maintenez le côté L des boutons d’inclinaison.",
      ),
      frame: [1000, 296, 800, 600],
      foot: L(
        "FAA IFH ch. 7 · cross-check the GPS track on the MFD (club SOP)",
        "FAA IFH ch. 7 · recoupez la route GPS au MFD (SOP du club)",
      ),
      reader: {
        en: `The flow: cover the failed displays; attitude from the standby indicator or the turn coordinator, wings level by default; correct the localizer 5° at a time with timed half-rate turns; fly the glideslope as usual, about ${n.vs} ft/min at 90 KIAS; at DA 670 land or go around, also on partial panel.`,
        fr: `Le déroulé : masquez les affichages en panne ; l’attitude sur l’horizon de secours ou l’indicateur de virage, ailes à plat par défaut ; corrigez le localizer de 5° à la fois par des virages chronométrés au demi-taux ; volez le glide comme d’habitude, environ ${n.vs} ft/min à 90 KIAS ; à la DA 670 atterrissez ou remettez les gaz, aussi en panneau partiel.`,
      },
    }),
    mistakesStep("mp-errors", {
      title: L("What goes wrong", "Ce qui tourne mal"),
      rows: [
        {
          error: L("Following the dead gyro", "Suivre le gyro mort"),
          why: L(
            "A frozen attitude looks level while you bank.",
            "Un horizon figé a l’air à plat pendant que vous inclinez.",
          ),
          fix: L("Cover it at once.", "Masquez-le tout de suite."),
        },
        {
          error: L("Big localizer corrections", "De grosses corrections"),
          why: L(
            "10° or more, and the compass cannot keep up.",
            "10° ou plus, et le compas ne suit plus.",
          ),
          fix: L("5° at a time, timed.", "5° à la fois, chronométrés."),
        },
        {
          error: L(
            "Reading the compass in the turn",
            "Lire le compas en virage",
          ),
          why: L(
            "It lags and swings until wings level.",
            "Il traîne et oscille jusqu’aux ailes à plat.",
          ),
          fix: L(
            "Read it wings level, steady.",
            "Lisez-le ailes à plat, stabilisé.",
          ),
        },
      ],
      foot: L(
        "ACS IR.VII.D · the same tolerances as a normal ILS",
        "ACS IR.VII.D · les mêmes tolérances qu’un ILS normal",
      ),
      reader: L(
        "Common mistakes: following the failed gyro, correcting the localizer by 10° or more so the compass cannot keep up, and reading the compass in the turn. The ACS asks for the same approach tolerances as with a full panel (FAA-S-ACS-8C IR.VII.D).",
        "Erreurs fréquentes : suivre le gyro en panne, corriger le localizer de 10° ou plus si bien que le compas ne suit plus, et lire le compas en virage. L’ACS demande les mêmes tolérances qu’avec le panneau complet (FAA-S-ACS-8C IR.VII.D).",
      ),
    }),
    readyStep("mp-ready", {
      objectives: [
        L(
          "Fly the ILS 27 without attitude or heading",
          "Voler l’ILS 27 sans horizon ni cap",
        ),
        L(
          "Correct with timed half-rate turns",
          "Corriger par virages chronométrés au demi-taux",
        ),
        L(
          "Decide at DA 670: land or go around",
          "Décider à la DA 670 : atterrir ou remettre",
        ),
      ],
      standards: [
        {
          n: L("¾", "¾"),
          text: L("scale, LOC and GS", "d’échelle, LOC et glide"),
          color: "nav",
        },
        { n: L("±10", "±10"), text: L("KIAS on final", "KIAS en finale") },
        {
          n: L("670", "670"),
          text: L("DA, no lower", "DA, pas plus bas"),
          color: "stop",
        },
        {
          n: L("5°", "5°"),
          text: L("per correction", "par correction"),
          color: "key",
        },
      ],
      tip: L(
        "You start on vectors at 3,000: intercept the localizer, then the glideslope.",
        "Vous partez en guidage à 3 000 : interceptez le localizer, puis le glide.",
      ),
      reader: L(
        "Standards (FAA-S-ACS-8C IR.VII.D): the precision approach tolerances with the primary flight instruments failed: less than ¾-scale deflection of both needles, airspeed ±10 KIAS, no descent below DA without the required visual references.",
        "Critères (FAA-S-ACS-8C IR.VII.D) : les tolérances de l’approche de précision avec les instruments primaires en panne : moins de ¾ d’échelle sur les deux aiguilles, vitesse ±10 KIAS, pas de descente sous la DA sans les références visuelles requises.",
      ),
    }),
    flyStep(
      "mp-fly",
      "ma-pp",
      L(
        "Fly the lesson: partial-panel ILS",
        "Volez la leçon : ILS en panneau partiel",
      ),
      L(
        "Vectors to the ILS 27 with the AHRS failed: standby, compass and needles.",
        "Guidage vers l’ILS 27, AHRS en panne : secours, compas et aiguilles.",
      ),
      [
        L("Cover the failed displays.", "Masquez les affichages en panne."),
        L("5° at a time on the localizer.", "5° à la fois sur le localizer."),
      ],
      15,
    ),
  ];
  return briefing(
    {
      id: PP_ILS_BRIEFING_ID,
      exerciseId: "ma-pp",
      title: L(
        "Briefing: the partial-panel ILS",
        "Briefing : l’ILS en panneau partiel",
      ),
      summary: L(
        "The briefing of the partial-panel ILS lesson: what the AHRS failure takes and leaves, timed half-rate corrections, the compass on 270, then fly it.",
        "Le briefing de la leçon ILS en panneau partiel : ce que la panne d’AHRS enlève et laisse, les corrections chronométrées au demi-taux, le compas au 270, puis le vol.",
      ),
      tags: ["ifr", "approach", "ils", "partial-panel"],
      minutes: 15,
    },
    steps,
    ilsScenes(),
  );
}
