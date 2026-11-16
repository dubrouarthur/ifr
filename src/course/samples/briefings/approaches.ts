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
import type {
  Briefing,
  GoalCheck,
  InstrumentView,
  L10n,
  PaneView,
  SimScene,
  Step,
} from "../../types";
import { holdEntry, type HoldEntry } from "../../../nav/holding";
import { scene } from "../kit";
import {
  DIAGRAM,
  G,
  GAUGE,
  INST,
  L,
  T,
  briefing,
  checkStep,
  coverStep,
  dec,
  flyStep,
  formulaStep,
  goalsStep,
  heroGauge,
  heroStep,
  instrumentStep,
  mcq,
  mistakesStep,
  pad3,
  panelStep,
  practiceStep,
  quizStep,
  readyStep,
  stepsStep,
  viewStep,
  whyStep,
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
/** The HSI of the six-pack draws two dots each side (one dot: 0.35° of glideslope, 1.25° of localizer), while the
 *  stage counts a steam deviation in fifths of the full scale (goals.ts dotsPerSide). One fifth, 0.14° of
 *  glideslope and 0.5° of localizer, is "near the centre" on the HSI: less than half of one of its dots. */
const ONE_DOT_GS: GoalCheck = { id: "gsDefl", p: { maxDots: 1 } };
const HALF_DOT_LOC: GoalCheck = { id: "cdiDefl", p: { maxDots: 1 } };
/** Single gauges of the six-pack as stage panes: large enough to read on a 1280 × 720 screen. */
const pane = (i: number): PaneView => ({ kind: "six", crop: { region: `STEAM_LEFT:${i}` } });
const AI_PANE = pane(1);
const ALT_PANE = pane(2);
const HSI_PANE = pane(4);
const VSI_PANE = pane(5);
function ilsScenes(): Record<string, SimScene> {
  const n = ilsNumbers();
  const rwy = { icao: "PARD", id: "27" };
  return {
    "ils.final": scene(
      "ils.final",
      {
        pos: { runway: rwy, distNm: 4 },
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
        pos: { runway: rwy, distNm: 5 },
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
    // level at 3,000 ft, half a mile before the glideslope comes down to the aircraft
    "ils.level": scene(
      "ils.level",
      {
        pos: { runway: rwy, distNm: 8.6 },
        altFt: I27.keddy,
        hdg: n.hdg,
        iasKt: 90,
        radios: ILS_RADIOS,
      },
      {
        label: "ILS 27 · 8.6 NM · level at 3,000 ft, the glideslope above",
        wind: [220, 12],
      },
    ),
    // level at 3,000 ft, right of the centreline (north of it: the wind from 220 cannot bring the aircraft back)
    "ils.right": scene(
      "ils.right",
      {
        pos: { runway: rwy, distNm: 9, offsetDeg: -1.4 },
        altFt: I27.keddy,
        hdg: n.hdg,
        iasKt: 90,
        radios: ILS_RADIOS,
      },
      {
        label: "ILS 27 · 9 NM · level at 3,000 ft, one dot right of the localizer",
        wind: [220, 12],
      },
    ),
  };
}

// ================================================================== app-ils-hand
// Upgrade plan (was: 10 slides, 4 interactions, no hands-on). Weak: the needle skill was only described, the
// formula said ×5 and the derivation ×5.3, the wind triangle was too small to read, the profile's zero was the DA,
// markers sat on the pointers they explain, no objectives. Added: the situation and its decision (ih-goals), the
// computed heading and descent rate shown on the HSI and the VSI, the profile drawn to the threshold, a glideslope
// capture (ih-try) and a localizer correction with the map (ih-loc) on the stage, a check after the numbers and two
// retrieval questions.
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
          "Flight: about 15 min · I-PRD 110.30 · FAA AIM 1-1-9",
          "Vol : environ 15 min · I-PRD 110,30 · FAA AIM 1-1-9",
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
    goalsStep("ih-goals", {
      title: L("The runway, or the go-around", "La piste, ou la remise des gaz"),
      hook: L(
        "Port Ardent: ceiling 350 ft, visibility ¾ SM. You fly the ILS 27 by hand. At 670 ft, the decision altitude, you have a few seconds to decide.",
        "Port Ardent : plafond 350 ft, visibilité ¾ SM. Vous descendez l’ILS 27 à la main. À 670 ft, l’altitude de décision, vous avez quelques secondes pour décider.",
      ),
      objectives: [
        {
          en: `Work out the descent rate and the heading on final from the wind: ${n.vs} ft/min, heading ${pad3(n.hdg)}`,
          fr: `Calculer le vario et le cap de finale d’après le vent : ${n.vs} ft/min, cap ${pad3(n.hdg)}`,
        },
        L(
          "Keep the localizer and the glideslope within ¾ scale down to DA",
          "Tenir le localizer et le glide à moins de ¾ d’échelle jusqu’à la DA",
        ),
        L(
          "Decide at 670 ft: land with the runway in sight, or go around",
          "Décider à 670 ft : atterrir avec la piste en vue, sinon remettre les gaz",
        ),
      ],
      quiz: mcq(
        L("At 670 ft you see nothing. You…", "À 670 ft, vous ne voyez rien. Vous…"),
        [
          {
            text: L("Go around at once", "Remettez les gaz aussitôt"),
            why: L(
              "Right: at DA without visual references, the approach is over.",
              "Juste : à la DA sans références visuelles, l’approche est terminée.",
            ),
          },
          {
            text: L("Descend a little more to look", "Descendez encore un peu pour voir"),
            why: L(
              "Not allowed below DA without references: the ground is 250 ft below.",
              "Interdit sous la DA sans références : le sol est 250 ft plus bas.",
            ),
          },
          {
            text: L("Level off at 670 and search", "Palier à 670 pour chercher"),
            why: L(
              "A DA is not a level-off altitude: you decide while descending.",
              "Une DA n’est pas un palier : on décide en descente.",
            ),
          },
        ],
        0,
        L(
          "At the decision altitude you land or you go around. This briefing gets you there on the needles, with the numbers ready.",
          "À l’altitude de décision, on atterrit ou on remet les gaz. Ce briefing vous y amène, aux aiguilles, avec les chiffres prêts.",
        ),
      ),
      foot: L("PARD ILS or LOC RWY 27 (simulated) · ACS IR.VI.B", "PARD ILS ou LOC 27 (simulée) · ACS IR.VI.B"),
      reader: {
        en: `The situation: Port Ardent, ceiling 350 ft and ¾ SM, the ILS 27 flown by hand to the decision altitude of 670 ft. After this briefing you can work out the descent rate and the heading on final from the wind (about ${n.vs} ft/min, heading ${pad3(n.hdg)}), keep the localizer and the glideslope within ¾ scale down to DA, and decide at 670 ft: land with the runway in sight, or go around.`,
        fr: `La situation : Port Ardent, plafond 350 ft et ¾ SM, l’ILS 27 à la main jusqu’à l’altitude de décision de 670 ft. Après ce briefing vous savez calculer le vario et le cap de finale d’après le vent (environ ${n.vs} ft/min, cap ${pad3(n.hdg)}), tenir le localizer et le glide à moins de ¾ d’échelle jusqu’à la DA, et décider à 670 ft : atterrir avec la piste en vue, sinon remettre les gaz.`,
      },
    }),
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
        INST(
          GAUGE("hsi"),
          {
            en: `HSI on the ILS 27: heading ${pad3(n.hdg)}, course 270, both needles centred`,
            fr: `HSI sur l’ILS 27 : cap ${pad3(n.hdg)}, route 270, les deux aiguilles centrées`,
          },
          G.left,
          376,
          464,
          464,
          { id: "ih-numbers.hsi", scene: "ils.final" },
        ),
        INST(
          GAUGE("vsi"),
          {
            en: `Vertical speed indicator: ${n.vs} ft/min down`,
            fr: `Variomètre : ${n.vs} ft/min en descente`,
          },
          G.left + 496,
          376,
          464,
          464,
          { id: "ih-numbers.vsi", scene: "ils.final" },
        ),
        T(
          "small",
          {
            en: `Heading ${pad3(n.hdg)} holds the 270 course`,
            fr: `Le cap ${pad3(n.hdg)} tient la route 270`,
          },
          G.left,
          856,
          464,
          40,
        ),
        T(
          "small",
          {
            en: `${n.vs} ft/min holds the 3° path`,
            fr: `${n.vs} ft/min tiennent le plan à 3°`,
          },
          G.left + 496,
          856,
          464,
          40,
        ),
      ],
      formula: L("{VS} ≈ {GS} × 5.3", "{Vz} ≈ {Vs} × 5,3"),
      units: L(
        "VS in ft/min · GS in knots · 3° ≈ 318 ft/NM",
        "Vz en ft/min · Vs en nœuds · 3° ≈ 318 ft/NM",
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
        en: `Wind 220/12: ${n.head} kt of headwind, ${n.cross} kt from the left.`,
        fr: `Vent 220/12 : ${n.head} kt de face, ${n.cross} kt de la gauche.`,
      },
      foot: L(
        "Surface wind: the wind aloft is stronger, fly the needles · FAA IFH ch. 9",
        "Vent au sol : il est plus fort en altitude, suivez les aiguilles · FAA IFH ch. 9",
      ),
      scene: "ils.final",
      reader: [
        {
          t: "formula",
          formula: L(
            "VS (ft/min) ≈ ground speed (kt) × 5.3 on a 3° path (× 5 in your head, then add a little)",
            "Vz (ft/min) ≈ vitesse sol (kt) × 5,3 sur un plan à 3° (× 5 de tête, puis ajoutez un peu)",
          ),
          ruleOfThumb: {
            en: `Wind 220/12 on runway 27: about ${n.head} kt of headwind, so about ${n.gs} kt of ground speed at 90 KIAS and about ${n.vs} ft/min on the glideslope; about ${n.cross} kt of crosswind from the left, so a heading near ${pad3(n.hdg)}. MARLO to the threshold, 6.1 NM: about ${mmss(n.tMarlo)}. These are surface-wind figures: fly the needles, not the numbers.`,
            fr: `Vent 220/12 en piste 27 : environ ${n.head} kt de face, donc environ ${n.gs} kt de vitesse sol à 90 KIAS et environ ${n.vs} ft/min sur le glide ; environ ${n.cross} kt de travers gauche, donc un cap proche de ${pad3(n.hdg)}. De MARLO au seuil, 6,1 NM : environ ${mmss(n.tMarlo)}. Chiffres au vent de surface : suivez les aiguilles, pas les chiffres.`,
          },
          refs: [{ src: "FAA-IFH", ref: "ch. 9" }],
        },
      ],
    }),
    checkStep("ih-check-vs", L("Check: another wind", "Vérification : un autre vent"), {
      lead: L(
        "Another day on the ILS 27: the wind is **180/20**, straight across the runway. Still 90 KIAS.",
        "Un autre jour sur l’ILS 27 : le vent est du **180/20**, plein travers. Toujours 90 KIAS.",
      ),
      quiz: mcq(
        L("Your descent rate on the 3° path?", "Votre vario sur le plan à 3° ?"),
        [
          {
            text: { en: `About ${n.vs} ft/min`, fr: `Environ ${n.vs} ft/min` },
            why: {
              en: `That was for ${n.gs} kt of ground speed, with ${n.head} kt of headwind.`,
              fr: `C’était pour ${n.gs} kt de vitesse sol, avec ${n.head} kt de vent de face.`,
            },
          },
          {
            text: L("About 480 ft/min", "Environ 480 ft/min"),
            why: L(
              "Right: no headwind, ground speed 90 kt, 90 × 5.3.",
              "Juste : pas de vent de face, vitesse sol 90 kt, 90 × 5,3.",
            ),
          },
          {
            text: L("About 580 ft/min", "Environ 580 ft/min"),
            why: L(
              "That is a ground speed of 110 kt: a crosswind does not add 20 kt.",
              "C’est une vitesse sol de 110 kt : un vent de travers n’ajoute pas 20 kt.",
            ),
          },
        ],
        1,
        L(
          "A wind straight across gives no headwind: ground speed 90 kt, 90 × 5.3 ≈ 480 ft/min. And a larger heading correction: about 13°.",
          "Un vent plein travers ne freine pas : vitesse sol 90 kt, 90 × 5,3 ≈ 480 ft/min. Et une correction de cap plus grande : environ 13°.",
        ),
      ),
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
              toFt: I27.tdze + I27.tch,
              angleDeg: 3,
              gsKt: n.gs,
              marks: [
                {
                  distNm: (I27.da - I27.tdze - I27.tch) / FT_PER_NM,
                  altFt: I27.da,
                  label: "DA 670",
                },
                {
                  distNm: I27.marloToThr,
                  altFt: I27.marlo,
                  label: "MARLO",
                },
                {
                  distNm: I27.marloToThr + I27.keddyToMarlo,
                  altFt: I27.keddy,
                  label: "KEDDY",
                },
              ],
            },
          },
          L(
            "Profile to the threshold: KEDDY at 3,000, the glideslope intercepted about 1.9 NM before MARLO, MARLO at 2,400 and 6.1 NM, DA 670 at 0.6 NM",
            "Profil jusqu’au seuil : KEDDY à 3 000, glide intercepté environ 1,9 NM avant MARLO, MARLO à 2 400 et 6,1 NM, DA 670 à 0,6 NM",
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
        "FAA IPH ch. 4 · distances to the threshold · 3° ≈ 318 ft/NM · TCH 50 ft",
        "FAA IPH ch. 4 · distances au seuil · 3° ≈ 318 ft/NM · TCH 50 ft",
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
      // beside the course needle, and beside the right glideslope pointer (one dot high: it sits below centre)
      marks: [
        [0.26, -0.46],
        [0.48, 0.24],
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
    practiceStep("ih-try", {
      title: L("Your turn: capture the glideslope", "À vous : capturez le glide"),
      intro: L(
        "Level at 3,000 ft towards MARLO. The glideslope is above you: its pointers, on each side of the HSI, come down towards the centre. When they reach it, hold **▼**: about 500 ft/min. If the pointers climb back above the centre, release for a moment.",
        "En palier à 3 000 ft vers MARLO. Le glide est au-dessus de vous : ses index, de chaque côté du HSI, descendent vers le centre. Quand ils y arrivent, maintenez **▼** : environ 500 ft/min. Si les index remontent au-dessus du centre, relâchez un instant.",
      ),
      rows: [
        { text: L("Glideslope pointers **near the centre**", "Index du glide **près du centre**"), check: 0, readout: "gsDots" },
        { text: L("Below **2,850 ft**, on the path", "Sous **2 850 ft**, sur le plan"), check: 1, readout: "alt" },
      ],
      after: {
        en: `You intercepted from below, then held the path with small touches: that is the whole final. Your descent rate stayed near ${n.vs} ft/min, the figure you worked out.`,
        fr: `Vous avez intercepté par en dessous, puis tenu le plan par petites touches : c’est toute la finale. Votre vario est resté proche de ${n.vs} ft/min, le chiffre calculé.`,
      },
      takeaway: L(
        "Intercept from below, then small corrections: never chase the pointer.",
        "Interceptez par en dessous, puis de petites corrections : ne courez jamais après l’index.",
      ),
      panes: [HSI_PANE, VSI_PANE],
      scene: "ils.level",
      controls: ["pitch"],
      assist: { holdAlt: true, holdIas: true },
      goal: {
        all: [
          ONE_DOT_GS,
          { id: "altBand", p: { min: 1500, max: 2850 } },
        ],
        holdS: 5,
        graded: false,
        success: L(
          "On the glideslope, descending: captured.",
          "Sur le glide, en descente : capturé.",
        ),
      },
      hint: L(
        "Wait for the yellow pointers to reach the middle of the HSI, then hold ▼. Released, the aircraft levels off.",
        "Attendez que les index jaunes arrivent au milieu du HSI, puis maintenez ▼. Relâché, l’avion se remet en palier.",
      ),
      minutes: 3,
    }),
    practiceStep("ih-loc", {
      title: L("On your own: back to the localizer", "Seul : revenez sur le localizer"),
      intro: L(
        "Level at 3,000 ft, 9 NM out. The course needle is **left** of the centre: the localizer is on your left. One short press on **◀** turns 10° left. Wait for the needle to come back, then one press on **▶** to take your heading again. The map shows your path to the centreline.",
        "En palier à 3 000 ft, à 9 NM. L’aiguille de route est à **gauche** du centre : le localizer est à votre gauche. Un appui bref sur **◀** fait tourner de 10° à gauche. Attendez que l’aiguille revienne, puis un appui sur **▶** pour reprendre votre cap. La carte montre votre trajectoire vers l’axe.",
      ),
      rows: [
        { text: L("Course needle **near the centre**", "Aiguille de route **près du centre**"), check: 0, readout: "cdiDots" },
        { text: L("Wings level", "Ailes à plat"), check: 1 },
      ],
      after: L(
        "A small heading change, held, then taken out: the needle came back without swinging past. Near the runway the same error needs half the correction: the beam is narrower.",
        "Un petit écart de cap, tenu, puis repris : l’aiguille est revenue sans repartir de l’autre côté. Près de la piste, le même écart demande moitié moins de correction : le faisceau est plus étroit.",
      ),
      takeaway: L(
        "Turn towards the needle, 5 to 10° at most, then take the heading again.",
        "Tournez vers l’aiguille, 5 à 10° au plus, puis reprenez le cap.",
      ),
      panes: [HSI_PANE],
      scene: "ils.right",
      inset: "plan",
      controls: ["bank"],
      assist: { holdAlt: true, holdIas: true },
      goal: {
        all: [
          HALF_DOT_LOC,
          { id: "bankMax", p: { max: 3 } },
        ],
        holdS: 5,
        graded: false,
        success: L(
          "Centred and wings level: on the localizer.",
          "Centré et ailes à plat : sur le localizer.",
        ),
      },
      hint: L(
        "One short press on ◀ (10° left). When the needle is nearly centred, one short press on ▶.",
        "Un appui bref sur ◀ (10° à gauche). Quand l’aiguille est presque centrée, un appui bref sur ▶.",
      ),
      minutes: 3,
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
    checkStep("ih-quiz", L("Recap 1 of 2: at DA 670", "Récap 1 sur 2 : à la DA 670"), {
      lead: L(
        "Without looking back. At 670 ft you see **the approach lights**, but not the runway, nor the red bars.",
        "Sans revenir en arrière. À 670 ft vous voyez **la rampe d’approche**, mais ni la piste ni les barres rouges.",
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
          "14 CFR 91.175(c)(3)(i): the lights alone allow 100 ft above TDZE (420 + 100 = 520). EASA rules (Part-NCO) have their own wording.",
          "14 CFR 91.175(c)(3)(i) : la rampe seule permet 100 ft au-dessus du TDZE (420 + 100 = 520). Les règles EASA (Part-NCO) ont leur propre texte.",
        ),
      ),
    }),
    checkStep("ih-check-faf", L("Recap 2 of 2: at MARLO", "Récap 2 sur 2 : à MARLO"), {
      lead: L(
        "Both needles are centred. You pass **MARLO** and the altimeter reads **2,650 ft**. The chart says 2,400.",
        "Les deux aiguilles sont centrées. Vous passez **MARLO** et l’altimètre indique **2 650 ft**. La carte dit 2 400.",
      ),
      quiz: mcq(
        L("What do you do?", "Que faites-vous ?"),
        [
          {
            text: L("Carry on: the needles are centred", "Continuer : les aiguilles sont centrées"),
            why: L(
              "The check exists for this: a centred needle can be wrong, or your altimeter setting can.",
              "Le contrôle sert à cela : une aiguille centrée peut être fausse, ou votre calage altimétrique.",
            ),
          },
          {
            text: L("Stop the descent and find out, or go around", "Arrêter la descente et vérifier, ou remettre les gaz"),
            why: L(
              "Right: 250 ft of difference is not an approach to continue.",
              "Juste : 250 ft d’écart, ce n’est pas une approche à poursuivre.",
            ),
          },
          {
            text: L("Dive to 2,400 at once", "Plonger vers 2 400 tout de suite"),
            why: L(
              "You would leave the glideslope without knowing which instrument is wrong.",
              "Vous quitteriez le glide sans savoir quel instrument se trompe.",
            ),
          },
        ],
        1,
        L(
          "At the FAF the glideslope crosses 2,400 ft. If the altimeter disagrees, check the altimeter setting and the frequency; if in doubt, go around.",
          "Au FAF, le glide passe 2 400 ft. Si l’altimètre n’est pas d’accord, vérifiez le calage et la fréquence ; dans le doute, remettez les gaz.",
        ),
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
        L(
          "To pass: both needles within ¾ scale, speed ±10 KIAS, never below DA without the runway.",
          "Pour réussir : les deux aiguilles à moins de ¾ d’échelle, vitesse ±10 KIAS, jamais sous la DA sans la piste.",
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
        "The briefing of the hand-flown ILS lesson: the chart, the descent rate and heading, the profile, the needles near DA, a glideslope capture and a localizer correction on the instruments, then fly it.",
        "Le briefing de la leçon ILS en manuel : la carte, le vario et le cap, le profil, les aiguilles près de la DA, une capture du glide et une correction de localizer aux instruments, puis le vol.",
      ),
      tags: ["ifr", "approach", "ils"],
      minutes: 18,
    },
    steps,
    ilsScenes(),
  );
}

// ================================================================== app-lnav-vnav
// Upgrade plan (was: 8 slides, 3 interactions, no instrument at all). Weak: the glidepath, the heart of the
// lesson, was never shown on an instrument and the scene made for it was unused; the deck said "on the PFD" in a
// six-pack cockpit; the ground speed on the slide and on its diagram differed; the profile was a thumbnail; no
// objectives. Added: a G1000 deck, the situation and its speed (rn-goals), the glidepath on the PFD with numbered
// callouts (rn-path), its capture at CRAGG on the stage (rn-try), one ground speed everywhere, the profile at
// full size, and three retrieval questions.
/** The part of the G1000 PFD an approach with vertical guidance is flown on: attitude, glidepath scale,
 *  altitude tape with the minimums, vertical speed and the top of the HSI with its mode. */
const PFD_APPROACH: InstrumentView = { kind: "pfd", crop: { rect: [330, 40, 690, 600] } };
const PFD_APPROACH_PANE: PaneView = { kind: "pfd", crop: { rect: [330, 40, 690, 600] } };
/** The two tapes and what is between them: airspeed, attitude, glidepath pointer, altitude and vertical speed. */
const PFD_TAPES: InstrumentView = { kind: "pfd", crop: { rect: [110, 70, 850, 400] } };
const PFD_TAPES_PANE: PaneView = { kind: "pfd", crop: { rect: [110, 70, 850, 400] } };
function lnavNumbers() {
  const w = comp(320, 16, R03.final);
  const wg = comp(320, 24, R03.final);
  const vapp = 90 + (24 - 16) / 2;
  const wca = Math.asin(w.cross / vapp);
  const gs = Math.round(vapp - w.head);
  return {
    cross: Math.round(w.cross),
    crossG: Math.round(wg.cross),
    head: Math.round(w.head),
    vapp,
    gs,
    vs: vsFor(gs),
    hdg: R03.final - Math.round((wca * 180) / Math.PI),
    // the VDP: where a 3° path from the MDA meets the runway (HAT ÷ 300 NM from the threshold, the IPH rule)
    vdpNm: Math.round((R03.mdaHat / 300) * 10) / 10,
  };
}
function lnavScenes(): Record<string, SimScene> {
  const n = lnavNumbers();
  const at = (id: string, distNm: number, altFt: number, vsFpm: number, label: string): SimScene => {
    const sc = scene(
      id,
      {
        pos: { runway: { icao: "MSVL", id: "03" }, distNm },
        altFt,
        hdg: n.hdg,
        iasKt: n.vapp,
        ...(vsFpm ? { vsFpm } : {}),
        radios: { cdi: "GPS", minimums: R03.da },
      },
      { label, wind: [320, 16], cockpit: "g1000" },
    );
    // the approach loaded and active: the PFD shows L/VNAV and the glidepath
    sc.plan = {
      idents: [],
      approach: { id: "MSVL-R03", transition: null, mode: "vtf" },
    };
    return sc;
  };
  return {
    "rn.final": at(
      "rn.final",
      3,
      pathAlt(R03.tdze, 50, 3),
      -n.vs,
      "RNAV 03 · 3 NM · on the glidepath · DA 1,500",
    ),
    // 80 ft below the glidepath at 3 NM: its pointer sits above the centre
    "rn.low": at(
      "rn.low",
      3,
      pathAlt(R03.tdze, 50, 3) - 80,
      -n.vs,
      "RNAV 03 · 3 NM · below the glidepath",
    ),
    // level at 2,900 ft, a mile before CRAGG: the glidepath pointer is near the top of its scale
    "rn.level": at(
      "rn.level",
      R03.craggToThr + 0.9,
      R03.cragg,
      0,
      "RNAV 03 · level at 2,900 ft before CRAGG, the glidepath above",
    ),
  };
}
export function lnavBriefing(): Briefing {
  const { cross, crossG, head, vapp, gs, vs, vdpNm } = lnavNumbers();
  const vdpFr = vdpNm.toString().replace(".", ",");
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
          "Flight: about 15 min · hand-flown · FAA AIM 5-4-5",
          "Vol : environ 15 min · pilotage manuel · FAA AIM 5-4-5",
        ),
        hero: [
          INST(
            PFD_APPROACH,
            L(
              "G1000 PFD on the RNAV 03 final: the magenta glidepath pointer centred, minimums 1,500 ft",
              "PFD G1000 en finale RNAV 03 : l’index magenta du plan centré, minimums 1 500 ft",
            ),
            984,
            190,
            816,
            710,
            { id: "rn-cover.pfd", scene: "rn.final" },
          ),
        ],
        scene: "rn.final",
        reader: L(
          "The briefing of the RNAV (GPS) RWY 03 lesson at Mistral Valley: fly the LNAV/VNAV glidepath to DA 1,500; know the LNAV line (MDA 1,620) and its visual descent point; add half the gust factor to the approach speed; set your crosswind limit before the final approach fix.",
          "Le briefing de la leçon RNAV (GPS) piste 03 à Mistral Valley : suivez le plan LNAV/VNAV jusqu’à la DA 1 500 ; connaissez la ligne LNAV (MDA 1 620) et son point de descente à vue ; ajoutez la moitié des rafales à la vitesse d’approche ; fixez votre limite de vent de travers avant le repère d’approche finale.",
        ),
      },
    ),
    goalsStep("rn-goals", {
      title: L("Two lines of minimums, and gusts", "Deux lignes de minima, et des rafales"),
      hook: L(
        "Mistral Valley, runway 03: wind 320/16 gusting 24, ceiling 1,700 ft. The RNAV approach has two lines of minimums. Which one do you fly, and how fast?",
        "Mistral Valley, piste 03 : vent 320/16, rafales 24, plafond 1 700 ft. L’approche RNAV a deux lignes de minima. Laquelle volez-vous, et à quelle vitesse ?",
      ),
      objectives: [
        L(
          "Follow the LNAV/VNAV glidepath to DA 1,500, within ¾ scale",
          "Suivre le plan LNAV/VNAV jusqu’à la DA 1 500, à moins de ¾ d’échelle",
        ),
        {
          en: `Work out the approach speed in gusts, ${vapp} KIAS, and set your crosswind limit`,
          fr: `Calculer la vitesse d’approche en rafales, ${vapp} KIAS, et fixer votre limite de travers`,
        },
        {
          en: `Without the glidepath: apply MDA 1,620 and find the VDP, ${vdpNm} NM out`,
          fr: `Sans le plan : appliquer la MDA 1 620 et trouver le VDP, à ${vdpFr} NM`,
        },
      ],
      quiz: mcq(
        L("Your approach speed today?", "Votre vitesse d’approche aujourd’hui ?"),
        [
          {
            text: L("90 KIAS, as usual", "90 KIAS, comme d’habitude"),
            why: L(
              "No margin: when a gust dies you are 8 kt slow, close to the ground.",
              "Aucune marge : quand une rafale tombe, vous perdez 8 kt, près du sol.",
            ),
          },
          {
            text: { en: `${vapp} KIAS`, fr: `${vapp} KIAS` },
            why: L(
              "Right: 90 plus half the gust factor, half of 8.",
              "Juste : 90 plus la moitié de l’écart de rafale, la moitié de 8.",
            ),
          },
          {
            text: L("98 KIAS", "98 KIAS"),
            why: L(
              "The whole gust factor is too much: a long float and a long landing.",
              "Tout l’écart, c’est trop : un long palier et un atterrissage long.",
            ),
          },
        ],
        1,
        {
          en: `Add half the gust factor: 90 + ½ × (24 − 16) = ${vapp} KIAS. The briefing then shows the glidepath you follow at that speed, and what changes without it.`,
          fr: `Ajoutez la moitié de l’écart de rafale : 90 + ½ × (24 − 16) = ${vapp} KIAS. Le briefing montre ensuite le plan que vous suivez à cette vitesse, et ce qui change sans lui.`,
        },
      ),
      foot: L("MSVL RNAV (GPS) RWY 03 (simulated) · FAA AFH ch. 9", "MSVL RNAV (GPS) 03 (simulée) · FAA AFH ch. 9"),
      reader: {
        en: `The situation: Mistral Valley, runway 03, wind 320/16 gusting 24, ceiling 1,700 ft. After this briefing you can follow the LNAV/VNAV glidepath to DA 1,500 within ¾ scale, work out the approach speed in gusts (${vapp} KIAS) and set your crosswind limit, and, without the glidepath, apply the LNAV MDA of 1,620 ft and find its visual descent point ${vdpNm} NM from the threshold.`,
        fr: `La situation : Mistral Valley, piste 03, vent 320/16 rafales 24, plafond 1 700 ft. Après ce briefing vous savez suivre le plan LNAV/VNAV jusqu’à la DA 1 500 à moins de ¾ d’échelle, calculer la vitesse d’approche en rafales (${vapp} KIAS) et fixer votre limite de vent de travers, et, sans le plan, appliquer la MDA LNAV de 1 620 ft et trouver son point de descente à vue à ${vdpFr} NM du seuil.`,
      },
    }),
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
    viewStep("rn-path", {
      eyebrow: L("The instrument", "L’instrument"),
      title: L("The glidepath on the PFD", "Le plan sur le PFD"),
      lead: L("Three things to read, in this order.", "Trois choses à lire, dans cet ordre."),
      view: PFD_APPROACH,
      cockpit: "g1000",
      alt: L(
        "G1000 PFD on the RNAV 03 final at 3 NM: the magenta glidepath pointer centred, L/VNAV over the HSI, BARO MIN 1500",
        "PFD G1000 en finale RNAV 03 à 3 NM : l’index magenta du plan centré, L/VNAV au-dessus du HSI, BARO MIN 1500",
      ),
      scene: "rn.final",
      // beside the glidepath scale, beside the approach mode over the HSI, beside the minimums window
      marks: [
        [716, 268],
        [682, 565],
        [752, 504],
      ],
      rows: [
        {
          heading: L("The magenta pointer: the glidepath", "L’index magenta : le plan"),
          body: L(
            "Centred: on the 3° path. Above the centre: the path is above you.",
            "Centré : sur le plan à 3°. Au-dessus du centre : le plan est au-dessus de vous.",
          ),
        },
        {
          heading: L("L/VNAV: vertical guidance", "L/VNAV : guidage vertical"),
          body: L(
            "If it changes to LNAV, the pointer goes: MDA 1,620.",
            "S’il passe à LNAV, l’index disparaît : MDA 1 620.",
          ),
        },
        {
          heading: L("BARO MIN 1500: your DA", "BARO MIN 1500 : votre DA"),
          body: L(
            "Decide there while descending: land, or go around.",
            "Décidez là, en descente : atterrir, ou remettre les gaz.",
          ),
        },
      ],
      foot: L("FAA AIM 1-1-17 · FAA IPH ch. 4 · baro-VNAV", "FAA AIM 1-1-17 · FAA IPH ch. 4 · baro-VNAV"),
      reader: L(
        "On the PFD an approach with vertical guidance shows three things. The magenta pointer beside the altitude tape is the glidepath: centred, you are on the 3° path; above the centre, the path is above you, so you are low. The approach mode over the HSI reads L/VNAV: if it changes to LNAV the pointer disappears and the minimums become MDA 1,620. BARO MIN 1500 is your decision altitude: decide there while descending (FAA AIM 1-1-17; IPH ch. 4).",
        "Sur le PFD, une approche avec guidage vertical montre trois choses. L’index magenta à côté du ruban d’altitude est le plan : centré, vous êtes sur le plan à 3° ; au-dessus du centre, le plan est au-dessus de vous, donc vous êtes bas. Le mode d’approche au-dessus du HSI indique L/VNAV : s’il passe à LNAV, l’index disparaît et les minima deviennent MDA 1 620. BARO MIN 1500 est votre altitude de décision : décidez là, en descente (FAA AIM 1-1-17 ; IPH ch. 4).",
      ),
    }),
    quizStep("rn-read", {
      eyebrow: L("Question", "Question"),
      title: L("Read the pointer", "Lisez l’index"),
      visual: [
        INST(
          PFD_APPROACH,
          L(
            "G1000 PFD at 3 NM on the RNAV 03: the magenta glidepath pointer is above the centre",
            "PFD G1000 à 3 NM sur la RNAV 03 : l’index magenta du plan est au-dessus du centre",
          ),
          G.left,
          312,
          768,
          668,
          { id: "rn-read.pfd", scene: "rn.low" },
        ),
      ],
      quiz: mcq(
        L("The magenta pointer is high. You are…", "L’index magenta est en haut. Vous êtes…"),
        [
          {
            text: L("Above the path: descend faster", "Au-dessus du plan : descendez plus vite"),
            why: L(
              "The pointer shows where the path is, not where you are. It is above you.",
              "L’index montre où est le plan, pas où vous êtes. Il est au-dessus de vous.",
            ),
          },
          {
            text: L("Below the path: descend more slowly", "Sous le plan : descendez moins vite"),
            why: L(
              "Right: fly towards the pointer. A little less descent, and it comes back.",
              "Juste : volez vers l’index. Un peu moins de vario, et il revient.",
            ),
          },
          {
            text: L("On the path: change nothing", "Sur le plan : ne changez rien"),
            why: L(
              "On the path the pointer is on the centre line.",
              "Sur le plan, l’index est sur le trait central.",
            ),
          },
        ],
        1,
        L(
          "Fly towards the pointer: it is above, so you are low. Reduce the descent by 100 to 200 ft/min and wait.",
          "Volez vers l’index : il est en haut, donc vous êtes bas. Réduisez le vario de 100 à 200 ft/min et attendez.",
        ),
      ),
      foot: L("FAA IFH ch. 9 · fly towards the pointer", "FAA IFH ch. 9 · volez vers l’index"),
      scene: "rn.low",
      reader: L(
        "The glidepath pointer shows where the path is. Above the centre: the path is above you, you are low, so reduce the descent rate a little and wait for it to come back. Below the centre: you are high.",
        "L’index du plan montre où est le plan. Au-dessus du centre : le plan est au-dessus de vous, vous êtes bas, donc réduisez un peu le vario et attendez qu’il revienne. Sous le centre : vous êtes haut.",
      ),
    }),
    practiceStep("rn-try", {
      title: L("Your turn: take the glidepath at CRAGG", "À vous : prenez le plan à CRAGG"),
      intro: L(
        "Level at 2,900 ft, just before CRAGG. The magenta pointer is above the centre and comes down. When it reaches the centre, hold **▼**: about 500 ft/min. If the pointer climbs back above the centre, release for a moment.",
        "En palier à 2 900 ft, juste avant CRAGG. L’index magenta est au-dessus du centre et descend. Quand il arrive au centre, maintenez **▼** : environ 500 ft/min. Si l’index remonte au-dessus du centre, relâchez un instant.",
      ),
      rows: [
        { text: L("Glidepath pointer **near the centre**", "Index du plan **près du centre**"), check: 0, readout: "gsDots" },
        { text: L("Below **2,750 ft**, on the path", "Sous **2 750 ft**, sur le plan"), check: 1, readout: "alt" },
      ],
      after: {
        en: `You met the path from below and held it with small touches. The vertical speed stayed near ${lnavNumbers().vs} ft/min: the figure you work out on the next slide.`,
        fr: `Vous avez rejoint le plan par en dessous et vous l’avez tenu par petites touches. Le vario est resté proche de ${lnavNumbers().vs} ft/min : le chiffre que vous calculez à la diapositive suivante.`,
      },
      takeaway: L(
        "Meet the glidepath from below, then small corrections towards the pointer.",
        "Rejoignez le plan par en dessous, puis de petites corrections vers l’index.",
      ),
      panes: [PFD_TAPES_PANE],
      scene: "rn.level",
      controls: ["pitch"],
      assist: { holdAlt: true, holdIas: true },
      goal: {
        all: [
          { id: "gsDefl", p: { maxDots: 0.5 } },
          { id: "altBand", p: { min: 1500, max: 2750 } },
        ],
        holdS: 5,
        graded: false,
        success: L("On the glidepath, descending: you have it.", "Sur le plan, en descente : vous le tenez."),
      },
      hint: L(
        "Wait for the magenta pointer to reach the white centre line, then hold ▼. Released, the aircraft levels off.",
        "Attendez que l’index magenta arrive au trait blanc central, puis maintenez ▼. Relâché, l’avion se remet en palier.",
      ),
      minutes: 3,
    }),
    formulaStep("rn-gust", {
      eyebrow: L("The numbers", "Les chiffres"),
      title: L("Gusts: half the gust factor", "Rafales : la moitié de l’écart"),
      visual: [
        INST(
          PFD_TAPES,
          {
            en: `G1000 PFD on final: ${vapp} KIAS on the airspeed tape, ${vs} ft/min down on the vertical speed scale`,
            fr: `PFD G1000 en finale : ${vapp} KIAS sur le ruban de vitesse, ${vs} ft/min en descente sur l’échelle de vario`,
          },
          G.left,
          376,
          960,
          452,
          { id: "rn-gust.pfd", scene: "rn.final" },
        ),
        T(
          "small",
          { en: `Left: the airspeed, ${vapp} KIAS`, fr: `À gauche : la vitesse, ${vapp} KIAS` },
          G.left,
          848,
          420,
          40,
        ),
        T(
          "small",
          L("Right: vertical speed, in steps of 50", "À droite : le vario, arrondi à 50 ft/min"),
          G.left + 420,
          848,
          540,
          40,
          { align: "right" },
        ),
      ],
      formula: L(
        "{Vapp} = 90 + ½ × ({gust} − {wind})",
        "{Vapp} = 90 + ½ × ({rafale} − {vent})",
      ),
      units: L("KIAS · knots · wind 320/16 gusting 24", "KIAS · nœuds · vent 320/16 rafales 24"),
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
        en: `Crosswind ${cross} gusting ${crossG} kt: above the 15 kt demonstrated in the C172S.`,
        fr: `Travers ${cross} kt, rafales ${crossG} : au-delà des 15 kt démontrés du C172S.`,
      },
      foot: L(
        "FAA AFH ch. 9 · C172S POH sec. 4 · about",
        "FAA AFH ch. 9 · C172S POH sec. 4 · environ",
      ),
      scene: "rn.final",
      reader: [
        {
          t: "formula",
          formula: L(
            "Vapp = normal approach speed + ½ × gust factor",
            "Vapp = vitesse d’approche normale + ½ × écart de rafale",
          ),
          ruleOfThumb: {
            en: `Wind 320/16 gusting 24 on runway 03: Vapp 90 + ½ × 8 = ${vapp} KIAS; about ${head} kt of headwind, so about ${gs} kt of ground speed and about ${vs} ft/min on the 3° glidepath. The crosswind is about ${cross} gusting ${crossG} kt from the left: above the 15 kt maximum demonstrated crosswind of the C172S (POH section 4). Set your own limit before CRAGG (FAA AFH ch. 9).`,
            fr: `Vent 320/16 rafales 24 en piste 03 : Vapp 90 + ½ × 8 = ${vapp} KIAS ; environ ${head} kt de face, donc environ ${gs} kt de vitesse sol et environ ${vs} ft/min sur le plan à 3°. Le travers vaut environ ${cross} kt, rafales ${crossG}, de la gauche : au-delà du vent traversier maximal démontré du C172S, 15 kt (POH section 4). Fixez votre limite avant CRAGG (FAA AFH ch. 9).`,
          },
          refs: [{ src: "FAA-AFH", ref: "ch. 9" }],
        },
      ],
    }),
    checkStep("rn-check-gust", L("Check: another wind", "Vérification : un autre vent"), {
      lead: L(
        "Same runway 03, another day: the tower gives **“wind 030 degrees, 10 knots, gusting 22”**. Straight down the runway.",
        "Même piste 03, un autre jour : la tour annonce **« vent 030 degrés, 10 nœuds, rafales 22 »**. Dans l’axe.",
      ),
      quiz: mcq(
        L("Your approach speed and your descent rate?", "Votre vitesse d’approche et votre vario ?"),
        [
          {
            text: L("96 KIAS, about 460 ft/min", "96 KIAS, environ 460 ft/min"),
            why: L(
              "Right: 90 + ½ × 12 = 96; ground speed 96 − 10 = 86 kt; 86 × 5.3.",
              "Juste : 90 + ½ × 12 = 96 ; vitesse sol 96 − 10 = 86 kt ; 86 × 5,3.",
            ),
          },
          {
            text: L("102 KIAS, about 490 ft/min", "102 KIAS, environ 490 ft/min"),
            why: L(
              "That adds the whole gust factor, 12 kt: only half of it.",
              "C’est tout l’écart de rafale, 12 kt : seulement la moitié.",
            ),
          },
          {
            text: L("96 KIAS, about 510 ft/min", "96 KIAS, environ 510 ft/min"),
            why: L(
              "510 ft/min is for 96 kt over the ground: you forgot the 10 kt of headwind.",
              "510 ft/min vaut pour 96 kt de vitesse sol : vous avez oublié les 10 kt de face.",
            ),
          },
        ],
        0,
        L(
          "Vapp = 90 + ½ × (22 − 10) = 96 KIAS. Headwind 10 kt: ground speed 86 kt, 86 × 5.3 ≈ 460 ft/min.",
          "Vapp = 90 + ½ × (22 − 10) = 96 KIAS. Vent de face 10 kt : vitesse sol 86 kt, 86 × 5,3 ≈ 460 ft/min.",
        ),
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
    stepsStep("rn-steps", {
      eyebrow: L("The flow", "Le déroulé"),
      title: L("From TALUS to the runway", "De TALUS à la piste"),
      rows: [
        {
          heading: L("TALUS at 4,000", "TALUS à 4 000"),
          small: L(
            "the approach loaded, L/VNAV on the PFD",
            "l’approche chargée, L/VNAV sur le PFD",
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
              toFt: R03.tdze + 50,
              angleDeg: 3,
              gsKt: gs,
              marks: [
                { distNm: (R03.da - R03.tdze - 50) / FT_PER_NM, altFt: R03.da, label: "DA 1500" },
              ],
            },
          },
          L(
            "Profile: the descent starts at CRAGG, 2,900 ft and 5.3 NM from the threshold, on a 3° glidepath to DA 1,500 at 0.9 NM",
            "Profil : la descente commence à CRAGG, 2 900 ft et 5,3 NM du seuil, sur un plan à 3° jusqu’à la DA 1 500 à 0,9 NM",
          ),
          1032,
          312,
          768,
          600,
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
            "Deciding in the flare, with 23 kt across.",
            "Décider à l’arrondi, avec 23 kt de travers.",
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
    checkStep("rn-quiz", L("Recap 1 of 3: the pointer disappears", "Récap 1 sur 3 : l’index disparaît"), {
      lead: L(
        "Without looking back. Two miles before CRAGG the PFD changes from **L/VNAV** to **LNAV** and the magenta pointer disappears. The lateral guidance is fine.",
        "Sans revenir en arrière. Deux nautiques avant CRAGG, le PFD passe de **L/VNAV** à **LNAV** et l’index magenta disparaît. Le guidage latéral est bon.",
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
              "The DA belongs to the glidepath: no vertical guidance, no DA.",
              "La DA va avec le plan : sans guidage vertical, pas de DA.",
            ),
          },
          {
            text: L("Circling, 1,740", "Manœuvre à vue, 1 740"),
            why: L(
              "You can still land straight in, on the LNAV line.",
              "Vous pouvez encore atterrir dans l’axe, avec la ligne LNAV.",
            ),
          },
        ],
        0,
        L(
          "No vertical guidance: LNAV minimums. Descend at CRAGG, level off at MDA 1,620 and use the VDP (FAA AIM 5-4-5).",
          "Plus de guidage vertical : minima LNAV. Descendez à CRAGG, palier à la MDA 1 620 et utilisez le VDP (FAA AIM 5-4-5).",
        ),
      ),
    }),
    checkStep("rn-check-vdp", L("Recap 2 of 3: at the VDP", "Récap 2 sur 3 : au VDP"), {
      lead: {
        en: `LNAV, level at **1,620 ft**. You reach the VDP, ${vdpNm} NM from the threshold. The runway is **not in sight**.`,
        fr: `LNAV, en palier à **1 620 ft**. Vous arrivez au VDP, à ${vdpFr} NM du seuil. La piste n’est **pas en vue**.`,
      },
      quiz: mcq(
        L("What do you do?", "Que faites-vous ?"),
        [
          {
            text: L("Descend to 1,500 to look", "Descendre à 1 500 pour voir"),
            why: L(
              "1,500 is the DA of the glidepath. In LNAV, 1,620 is the floor.",
              "1 500 est la DA du plan. En LNAV, 1 620 est le plancher.",
            ),
          },
          {
            text: L("Stay at 1,620 to the threshold, then fly the missed approach", "Rester à 1 620 jusqu’au seuil, puis remettre les gaz"),
            why: L(
              "Right: the missed approach point is the threshold. Past the VDP, expect to go around.",
              "Juste : le point de remise des gaz est le seuil. Après le VDP, attendez-vous à remettre.",
            ),
          },
          {
            text: L("Turn towards MSV at once", "Virer vers MSV tout de suite"),
            why: L(
              "You may climb, but never turn before the missed approach point.",
              "Vous pouvez monter, mais jamais virer avant le point de remise des gaz.",
            ),
          },
        ],
        1,
        L(
          "The VDP is not a missed approach point. Stay at or above the MDA to the threshold, then fly the published missed approach: 4,500 direct MSV (FAA AIM 5-4-5 and 5-4-21).",
          "Le VDP n’est pas un point de remise des gaz. Restez à la MDA ou au-dessus jusqu’au seuil, puis volez la remise publiée : 4 500 direct MSV (FAA AIM 5-4-5 et 5-4-21).",
        ),
      ),
    }),
    checkStep("rn-check-pointer", L("Recap 3 of 3: on the PFD", "Récap 3 sur 3 : sur le PFD"), {
      lead: L(
        "On the glidepath at 3 NM, in the gusts. Look at the PFD: where is the magenta pointer?",
        "Sur le plan à 3 NM, dans les rafales. Regardez le PFD : où est l’index magenta ?",
      ),
      stage: { panes: [PFD_APPROACH_PANE], scene: "rn.low" },
      quiz: mcq(
        L("Your correction?", "Votre correction ?"),
        [
          {
            text: L("A little less descent, then wait", "Un peu moins de vario, puis attendre"),
            why: L(
              "Right: the pointer is above, you are low. 100 to 200 ft/min less is enough.",
              "Juste : l’index est en haut, vous êtes bas. 100 à 200 ft/min de moins suffisent.",
            ),
          },
          {
            text: L("Level off until it is centred", "Palier jusqu’à ce qu’il soit centré"),
            why: L(
              "Too much: you go through the path and chase it from above.",
              "Trop : vous traversez le plan et courez après lui par le dessus.",
            ),
          },
          {
            text: L("More descent to catch it", "Plus de vario pour le rattraper"),
            why: L(
              "The path is above you: descending faster takes you further away.",
              "Le plan est au-dessus de vous : descendre plus vite vous en éloigne.",
            ),
          },
        ],
        0,
        L(
          "Pointer above the centre: you are low. Reduce the descent a little, hold the speed, and let the pointer come back.",
          "Index au-dessus du centre : vous êtes bas. Réduisez un peu le vario, tenez la vitesse, et laissez l’index revenir.",
        ),
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
        { en: `Vapp ${vapp} KIAS, about ${vs} ft/min on the glidepath.`, fr: `Vapp ${vapp} KIAS, environ ${vs} ft/min sur le plan.` },
        L(
          "Your crosswind limit, before CRAGG.",
          "Votre limite de travers, avant CRAGG.",
        ),
        L(
          "To pass: the glidepath and the course within ¾ scale, speed ±10 KIAS, never below 1,500 without the runway.",
          "Pour réussir : le plan et la route à moins de ¾ d’échelle, vitesse ±10 KIAS, jamais sous 1 500 sans la piste.",
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
        "The briefing of the RNAV (GPS) RWY 03 lesson: DA against MDA, the glidepath on the PFD and its capture at CRAGG, Vapp in gusts and your crosswind limit, the visual descent point, then fly it.",
        "Le briefing de la leçon RNAV (GPS) piste 03 : DA contre MDA, le plan sur le PFD et sa capture à CRAGG, la Vapp en rafales et votre limite de travers, le point de descente à vue, puis le vol.",
      ),
      tags: ["ifr", "approach", "rnav", "vdp"],
      minutes: 18,
      cockpit: "g1000",
    },
    steps,
    lnavScenes(),
  );
}

// ================================================================== ma-da
// Upgrade plan (was: 8 slides, 3 interactions). Weak: the entry question printed its own answer on the diagram,
// the go-around was practised on one attitude indicator from a scene already sinking below DA, the turn to ARD was
// only described, no objectives, no retrieval. Added: the situation and its decision (md-goals), the go-around
// read on two gauges (attitude, then airspeed), the last 100 ft and the go-around flown with the altimeter beside
// the attitude (md-try: the pitch pad alone was too slow to stop the descent, so an aid sets the power), a climb-gradient check, the entry found on the sectors, the turn to ARD flown with the
// map (md-turn), and three retrieval questions.
function missedScenes(): Record<string, SimScene> {
  const thrToDa = (I27.da - I27.tdze - I27.tch) / FT_PER_NM;
  const n = ilsNumbers();
  const rwy = { icao: "PARD", id: "27" };
  return {
    "ma.toga": scene(
      "ma.toga",
      {
        pos: { runway: rwy, distNm: Math.round(thrToDa * 100) / 100 },
        altFt: I27.da,
        hdg: 270,
        iasKt: 74,
        pitch: 7,
        vsFpm: 700,
        radios: ILS_RADIOS,
      },
      { label: "Go-around at DA 670 · pitch 7° · 74 KIAS" },
    ),
    // 100 ft above DA, on the localizer: "approaching minimums" (level: the student flies the last 100 ft down)
    "ma.app": scene(
      "ma.app",
      {
        pos: { runway: rwy, distNm: Math.round((thrToDa + 100 / FT_PER_NM) * 100) / 100 },
        altFt: I27.da + 100,
        hdg: n.hdg,
        iasKt: 90,
        radios: ILS_RADIOS,
      },
      { label: "ILS 27 · 770 ft, 100 ft above DA · no runway in sight", wind: [220, 12] },
    ),
    // over the runway at 1,000 ft, on the runway heading: the turn to ARD starts here
    "ma.climb": scene(
      "ma.climb",
      {
        pos: { runway: rwy, distNm: 0.05 },
        altFt: 1000,
        hdg: 270,
        iasKt: 80,
        radios: ILS_RADIOS,
      },
      { label: "Missed approach · 1,000 ft over the runway · heading 270" },
    ),
  };
}
export function missedBriefing(): Briefing {
  const entry = holdEntry(I27.hold.inbound, I27.hold.turn, I27.ardCourse);
  const entryEn = ENTRY_NAME[entry].en.toLowerCase();
  const entryFr = ENTRY_NAME[entry].fr!.toLowerCase();
  // the C172S climb: about 700 ft/min at Vy 74 KIAS (POH sec. 5, sea level, adjusted for the sim's weight)
  const ftPerNm = Math.round(700 / (74 / 60) / 10) * 10;
  const toThousandS = Math.round((((1000 - I27.da) / 700) * 60) / 5) * 5;
  const holdSpec = { kind: "hold" as const, inbound: I27.hold.inbound, turn: I27.hold.turn, fix: I27.hold.fix };
  const steps: Step[] = [
    coverStep("md-cover", L("Briefing: the missed approach", "Briefing : la remise des gaz"), {
      eyebrow: L("Lesson briefing · Missed approaches", "Briefing de leçon · Approches interrompues"),
      main: L("Missed approach at DA", "Remise des gaz à la DA"),
      sub: L("Then the hold at ARD", "Puis l’attente à ARD"),
      lead: L(
        "Ceiling 120 ft: no runway at 670. Go around, climb, turn at 1,000, hold at ARD.",
        "Plafond 120 ft : pas de piste à 670. Remettez, montez, virez à 1 000, attendez à ARD.",
      ),
      meta: L("About 15 min · ILS 27 · FAA AIM 5-4-21", "Environ 15 min · ILS 27 · FAA AIM 5-4-21"),
      hero: [
        DIAGRAM(
          "md-cover.hold",
          { ...holdSpec, crs: I27.ardCourse, quiet: true },
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
    }),
    goalsStep("md-goals", {
      title: L("At 670 ft: nothing in sight", "À 670 ft : rien en vue"),
      hook: L(
        "Port Ardent: ceiling 120 ft, visibility ¼ SM. The ILS 27 takes you down to 670 ft, 250 ft above the runway. The cloud base is lower than that.",
        "Port Ardent : plafond 120 ft, visibilité ¼ SM. L’ILS 27 vous amène à 670 ft, 250 ft au-dessus de la piste. La base des nuages est plus bas.",
      ),
      objectives: [
        L(
          "Go around at 670 ft without sinking below: full power, 7° nose up",
          "Remettre les gaz à 670 ft sans passer dessous : plein gaz, 7° à cabrer",
        ),
        L(
          "Fly the published missed approach: straight ahead to 1,000 ft, then right to ARD, 3,000 ft",
          "Voler la remise publiée : tout droit jusqu’à 1 000 ft, puis à droite vers ARD, 3 000 ft",
        ),
        L(
          "Find your entry at ARD from your course, and hold",
          "Trouver votre entrée à ARD d’après votre route, et attendre",
        ),
      ],
      quiz: mcq(
        L("When do you decide to go around?", "Quand décidez-vous de remettre les gaz ?"),
        [
          {
            text: L("At 670 ft, I look and then I think", "À 670 ft, je regarde puis je réfléchis"),
            why: L(
              "You lose 7 ft every second: thinking there takes you below DA.",
              "Vous perdez 7 ft par seconde : réfléchir là vous fait passer sous la DA.",
            ),
          },
          {
            text: L("Before the approach: at 670 I only act", "Avant l’approche : à 670, j’exécute"),
            why: L(
              "Right: the decision is briefed. At 670 without the runway, you go.",
              "Juste : la décision est briefée. À 670 sans la piste, on remet.",
            ),
          },
          {
            text: L("A little below 670, to be sure", "Un peu sous 670, pour être sûr"),
            why: L(
              "Not allowed: no descent below DA without the runway environment.",
              "Interdit : pas de descente sous la DA sans l’environnement de piste.",
            ),
          },
        ],
        1,
        L(
          "The missed approach is decided at the briefing and flown at DA. This briefing gives you the actions, in order.",
          "La remise des gaz se décide au briefing et s’exécute à la DA. Ce briefing vous donne les actions, dans l’ordre.",
        ),
      ),
      foot: L("PARD ILS RWY 27 (simulated) · 14 CFR 91.175", "PARD ILS 27 (simulée) · 14 CFR 91.175"),
      reader: L(
        "The situation: Port Ardent, ceiling 120 ft and ¼ SM, the ILS 27 down to its decision altitude of 670 ft, 250 ft above the runway: you will see nothing there. After this briefing you can go around at 670 ft without sinking below it (full power, 7° nose up), fly the published missed approach (straight ahead to 1,000 ft, then a climbing right turn direct ARD to 3,000 ft), and find your hold entry at ARD from your course.",
        "La situation : Port Ardent, plafond 120 ft et ¼ SM, l’ILS 27 jusqu’à son altitude de décision de 670 ft, 250 ft au-dessus de la piste : vous n’y verrez rien. Après ce briefing vous savez remettre les gaz à 670 ft sans passer dessous (plein gaz, 7° à cabrer), voler la remise publiée (tout droit jusqu’à 1 000 ft, puis virage montant à droite direct ARD vers 3 000 ft), et trouver votre entrée dans l’attente d’ARD d’après votre route.",
      ),
    }),
    whyStep("md-why", {
      eyebrow: L("Why it matters", "Pourquoi c’est important"),
      title: L("The missed is part of the approach", "La remise fait partie de l’approche"),
      n: L("0", "0"),
      nW: 168,
      unit: L("s", "s"),
      color: "stop",
      statement: L("of look-see below DA without the runway", "de « coup d’œil » sous la DA sans la piste"),
      body: L(
        "At DA with no visual reference: go around now. Fly the published missed exactly.",
        "À la DA sans référence visuelle : remettez tout de suite. Volez la remise publiée à la lettre.",
      ),
      sideTitle: L("The chart · missed ILS 27", "La carte · remise ILS 27"),
      side: [
        { n: L("1,000", "1 000"), text: L("straight ahead, then turn", "tout droit, puis virage"), color: "key" },
        { n: L("3,000", "3 000"), text: L("climbing right turn, direct ARD", "virage montant à droite, direct ARD"), color: "text" },
        { n: L("ARD", "ARD"), text: L("hold: inbound 270, right turns", "attente : rapprochement 270, à droite"), color: "nav" },
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
    panelStep("md-toga", {
      eyebrow: L("The go-around", "La remise des gaz"),
      title: L("Pitch and power, then the rest", "Assiette et puissance, puis le reste"),
      lead: L("Fly first. Then navigate. Then talk.", "D’abord piloter. Puis naviguer. Puis parler."),
      gauges: [
        {
          gauge: "ai",
          alt: L("Attitude indicator: 7° nose up, wings level", "Horizon artificiel : 7° à cabrer, ailes à plat"),
          marks: [{ n: 1, at: [0.6, -0.22] }],
        },
        {
          gauge: "asi",
          alt: L("Airspeed indicator: 74 KIAS, the best rate of climb speed", "Anémomètre : 74 KIAS, la vitesse de meilleur taux de montée"),
          marks: [{ n: 2, at: [0.3, 0.3] }],
        },
      ],
      scene: "ma.toga",
      rows: [
        {
          heading: L("Full power, 7° nose up", "Plein gaz, 7° à cabrer"),
          body: L("Hold the attitude: the speed follows.", "Tenez l’assiette : la vitesse suit."),
        },
        {
          heading: L("74 KIAS: flaps up", "74 KIAS : rentrez les volets"),
          body: L("Flaps 10, then up once climbing above 65 KIAS.", "Volets 10, puis rentrés en montée au-dessus de 65 KIAS."),
        },
        {
          heading: L("Then the route, then the radio", "Puis la route, puis la radio"),
          body: L("Sequence the missed approach, then tell ATC.", "Activez la remise dans le GPS, puis annoncez-la au contrôle."),
        },
      ],
      foot: L("C172S POH sec. 4 (balked landing) · Vy 74 KIAS", "C172S POH sec. 4 (remise des gaz) · Vy 74 KIAS"),
      reader: L(
        "The go-around (G in the cockpit): full power, pitch about 7° nose up and hold it so the speed settles at Vy, 74 KIAS; flaps no more than 10°, retracted once the climb is positive, at a safe altitude and above 65 KIAS (C172S POH section 4, balked landing); then sequence the missed approach in the GPS, select NAV, and tell ATC “missed approach”. Fly first, then navigate, then talk.",
        "La remise des gaz (touche G dans le cockpit) : plein gaz, assiette d’environ 7° à cabrer tenue pour que la vitesse se stabilise à Vy, 74 KIAS ; volets à 10° au plus, rentrés en montée franche, à une hauteur sûre et au-dessus de 65 KIAS (C172S POH section 4, atterrissage interrompu) ; puis activez la remise dans le GPS, sélectionnez NAV, et annoncez « remise des gaz » au contrôle. D’abord piloter, puis naviguer, puis parler.",
      ),
    }),
    practiceStep("md-try", {
      title: L("Your turn: go around at 670", "À vous : remettez les gaz à 670"),
      intro: L(
        "On the ILS 27 at 770 ft: “approaching minimums”. No runway today. Hold **▼** to descend at 500 ft/min. When the altimeter reaches **670**, release ▼ and hold **▲**: the nose comes above the horizon and the altimeter climbs again. Here an aid sets the power.",
        "Sur l’ILS 27 à 770 ft : « approche des minimums ». Pas de piste aujourd’hui. Maintenez **▼** pour descendre à 500 ft/min. Quand l’altimètre arrive à **670**, lâchez ▼ et maintenez **▲** : le nez passe au-dessus de l’horizon et l’altimètre remonte. Ici, une aide règle la puissance.",
      ),
      rows: [
        { text: L("Back above **670 ft**, below 800", "De nouveau au-dessus de **670 ft**, sous 800"), check: 0, readout: "alt" },
        { text: L("Climbing: more than **300 ft/min**", "En montée : plus de **300 ft/min**"), check: 1, readout: "vs" },
      ],
      after: L(
        "From descent to climb at 670 ft. The aircraft still sank a few feet while the nose came up: that is why the hand is ready 100 ft before, and why nobody waits at 670 to look. In the aircraft: full power and 7° nose up.",
        "De la descente à la montée, à 670 ft. L’avion a encore perdu quelques pieds pendant que le nez montait : c’est pourquoi la main est prête 100 ft avant, et pourquoi on n’attend pas à 670 pour regarder. En avion : plein gaz et 7° à cabrer.",
      ),
      takeaway: L(
        "At DA without the runway: nose up and full power, at once.",
        "À la DA sans la piste : nez en haut et plein gaz, tout de suite.",
      ),
      panes: [AI_PANE, ALT_PANE],
      scene: "ma.app",
      controls: ["pitch"],
      assist: { holdAlt: true, holdIas: true },
      goal: {
        all: [
          { id: "altBand", p: { min: 670, max: 800 } },
          { id: "vsBand", p: { min: 300, max: 2000 } },
        ],
        holdS: 3,
        graded: false,
        success: L("Climbing away from 670 ft: the go-around is flown.", "En montée depuis 670 ft : la remise des gaz est faite."),
      },
      hint: L(
        "Hold ▼ until the altimeter reads 670 ft (the long hand just before the 7), then hold ▲ for a few seconds.",
        "Maintenez ▼ jusqu’à lire 670 ft à l’altimètre (la grande aiguille juste avant le 7), puis maintenez ▲ quelques secondes.",
      ),
      minutes: 2,
    }),
    formulaStep("md-climb", {
      eyebrow: L("The numbers", "Les chiffres"),
      title: L("Is the climb good enough?", "La montée suffit-elle ?"),
      formula: L("{ft/NM} = [{VS} × 60/{GS}]", "{ft/NM} = [{Vz} × 60/{Vs}]"),
      units: L("ft per NM · VS in ft/min · GS in knots", "ft par NM · Vz en ft/min · Vs en nœuds"),
      lines: [
        {
          en: `climb | = [700 × 60/74] ≈ !${ftPerNm} ft/NM!`,
          fr: `montée | = [700 × 60/74] ≈ !${ftPerNm} ft/NM!`,
        },
        { en: "required | = !200 ft/NM! standard", fr: "exigé | = !200 ft/NM! standard" },
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
    checkStep("md-check-climb", L("Check: a hot day, a tailwind", "Vérification : chaleur et vent arrière"), {
      lead: L(
        "Another day: the aircraft climbs at only **400 ft/min**, and a tailwind gives **100 kt** over the ground. The chart of that airport asks for **300 ft/NM**.",
        "Un autre jour : l’avion ne monte qu’à **400 ft/min**, et un vent arrière donne **100 kt** de vitesse sol. La carte de ce terrain exige **300 ft/NM**.",
      ),
      quiz: mcq(
        L("Your climb gradient?", "Votre pente de montée ?"),
        [
          {
            text: L("240 ft/NM: not enough", "240 ft/NM : insuffisant"),
            why: L("Right: 400 × 60 ÷ 100 = 240, below the 300 required.", "Juste : 400 × 60 ÷ 100 = 240, sous les 300 exigés."),
          },
          {
            text: L("400 ft/NM: enough", "400 ft/NM : suffisant"),
            why: L(
              "400 is feet per minute. Per nautical mile, divide by the miles flown each minute.",
              "400, ce sont des pieds par minute. Par nautique, divisez par les nautiques parcourus chaque minute.",
            ),
          },
          {
            text: L("670 ft/NM: enough", "670 ft/NM : suffisant"),
            why: L(
              "That divides by 60 and multiplies by 100: the other way round.",
              "C’est diviser par 60 et multiplier par 100 : l’inverse.",
            ),
          },
        ],
        0,
        L(
          "400 × 60 ÷ 100 = 240 ft/NM. Below the published 300: this approach is not for today, decide it before take-off.",
          "400 × 60 ÷ 100 = 240 ft/NM. Sous les 300 publiés : cette approche n’est pas pour aujourd’hui, décidez-le avant le décollage.",
        ),
      ),
    }),
    quizStep("md-entry", {
      eyebrow: L("Question", "Question"),
      title: L("The entry at ARD", "L’entrée à ARD"),
      visual: [
        DIAGRAM(
          "md-entry.hold",
          holdSpec,
          L(
            "Hold at ARD, inbound 270, right turns, with its three entry sectors",
            "Attente à ARD, rapprochement 270, virages à droite, avec ses trois secteurs d’entrée",
          ),
          G.left,
          312,
          768,
          672,
          { caption: L("Hold at ARD · inbound 270 · right turns", "Attente ARD · rapprochement 270 · à droite") },
        ),
      ],
      quiz: mcq(
        {
          en: `You arrive at ARD on course ${pad3(I27.ardCourse)}. Your entry?`,
          fr: `Vous arrivez à ARD sur la route ${pad3(I27.ardCourse)}. Votre entrée ?`,
        },
        (["DIRECT", "TEARDROP", "PARALLEL"] as HoldEntry[]).map((e) => ({
          text: ENTRY_NAME[e],
          why:
            e === entry
              ? L(
                  "Right: 316 is 46° from the inbound course 270, inside the direct sector.",
                  "Juste : 316 est à 46° du rapprochement 270, dans le secteur direct.",
                )
              : e === "TEARDROP"
                ? L(
                    "Teardrop is for courses 020 to 090: the narrow sector. 316 is not in it.",
                    "La décalée vaut pour les routes 020 à 090 : le secteur étroit. 316 n’y est pas.",
                  )
                : L(
                    "Parallel is for courses 090 to 200. 316 is not in it.",
                    "La parallèle vaut pour les routes 090 à 200. 316 n’y est pas.",
                  ),
        })),
        (["DIRECT", "TEARDROP", "PARALLEL"] as HoldEntry[]).indexOf(entry),
        {
          en: `Course ${pad3(I27.ardCourse)} lies inside the 180° direct sector of the hold inbound 270, right turns (courses 200 round through 270 to 020): ${entryEn} entry.`,
          fr: `La route ${pad3(I27.ardCourse)} est dans le secteur direct de 180° de l’attente rapprochement 270, virages à droite (routes 200 à 020 en passant par 270) : entrée ${entryFr}.`,
        },
      ),
      foot: L("FAA AIM 5-3-8 · ±5° at a sector boundary", "FAA AIM 5-3-8 · ±5° à une limite de secteur"),
      reader: {
        en: `From the runway, ARD is about ${I27.ardNm} NM away on course ${pad3(I27.ardCourse)}. With an inbound course of 270 and right turns, that course is in the ${entryEn} sector (FAA AIM 5-3-8): cross ARD, turn right to the outbound heading, time one minute.`,
        fr: `Depuis la piste, ARD est à environ ${dec(I27.ardNm, 2).fr} NM au ${pad3(I27.ardCourse)}. Avec un rapprochement 270 et des virages à droite, cette route est dans le secteur ${entryFr} (FAA AIM 5-3-8) : passez ARD, virez à droite vers le cap d’éloignement, chronométrez une minute.`,
      },
    }),
    stepsStep("md-steps", {
      eyebrow: L("The flow", "Le déroulé"),
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
          small: { en: `about ${toThousandS} s, on runway heading`, fr: `environ ${toThousandS} s, dans l’axe` },
        },
        {
          heading: L("Right turn, direct ARD", "Virage à droite, direct ARD"),
          small: L("climbing to 3,000 · missed sequenced", "en montée vers 3 000 · remise activée"),
        },
        {
          heading: { en: `ARD: ${entryEn} entry`, fr: `ARD : entrée ${entryFr}` },
          small: L("the five Ts at the fix, 1 minute legs", "les cinq T au repère, branches d’une minute"),
        },
      ],
      visual: [
        DIAGRAM(
          "md-steps.hold",
          { ...holdSpec, crs: I27.ardCourse },
          {
            en: `Hold at ARD, inbound 270, right turns: arriving on course ${pad3(I27.ardCourse)}, a ${entryEn} entry`,
            fr: `Attente à ARD, rapprochement 270, virages à droite : arrivée sur la route ${pad3(I27.ardCourse)}, entrée ${entryFr}`,
          },
          1032,
          288,
          768,
          672,
          { caption: { en: `From the runway: course ${pad3(I27.ardCourse)}`, fr: `Depuis la piste : route ${pad3(I27.ardCourse)}` } },
        ),
      ],
      foot: L("Missed approach as published · ATC may amend it", "Remise publiée · le contrôle peut la modifier"),
      reader: {
        en: `The flow: 100 ft above DA, hand on the go-around; at 670 with no runway, G: full power, 7° nose up, flaps 10; straight ahead to 1,000 ft (about ${toThousandS} s); then a climbing right turn direct ARD to 3,000 with the missed approach sequenced; at ARD a ${entryEn} entry, the five Ts, one-minute legs.`,
        fr: `Le déroulé : 100 ft au-dessus de la DA, main sur la remise ; à 670 sans piste, G : plein gaz, 7° à cabrer, volets 10 ; tout droit jusqu’à 1 000 ft (environ ${toThousandS} s) ; puis virage montant à droite direct ARD vers 3 000 avec la remise activée ; à ARD une entrée ${entryFr}, les cinq T, branches d’une minute.`,
      },
    }),
    practiceStep("md-turn", {
      title: L("On your own: 1,000 ft, turn to ARD", "Seul : 1 000 ft, virez vers ARD"),
      intro: {
        en: `You are over the runway at **1,000 ft**, heading 270: the chart now allows the turn. ARD is on course **${pad3(I27.ardCourse)}**, to your right. Hold **▶** and release as the heading reaches ${pad3(I27.ardCourse)}. The map shows your path. Here an aid holds the altitude: in the aircraft you keep climbing to 3,000.`,
        fr: `Vous êtes au-dessus de la piste à **1 000 ft**, cap 270 : la carte autorise maintenant le virage. ARD est sur la route **${pad3(I27.ardCourse)}**, à votre droite. Maintenez **▶** et relâchez quand le cap arrive au ${pad3(I27.ardCourse)}. La carte montre votre trajectoire. Ici, une aide tient l’altitude : en avion, vous continuez de monter vers 3 000.`,
      },
      rows: [
        {
          text: { en: `Heading **${pad3(I27.ardCourse)}**, within 10°`, fr: `Cap **${pad3(I27.ardCourse)}**, à 10° près` },
          check: 0,
          readout: "hdg",
        },
        { text: L("Wings level", "Ailes à plat"), check: 1 },
      ],
      after: {
        en: `270 to ${pad3(I27.ardCourse)}: 46° to the right, about 15 s at standard rate. Not before 1,000 ft: below it, the chart only protects the straight climb.`,
        fr: `Du 270 au ${pad3(I27.ardCourse)} : 46° à droite, environ 15 s au taux standard. Pas avant 1 000 ft : en dessous, la carte ne protège que la montée dans l’axe.`,
      },
      takeaway: L(
        "Fly the words of the chart: straight ahead to 1,000 ft, then the turn.",
        "Volez les mots de la carte : tout droit jusqu’à 1 000 ft, puis le virage.",
      ),
      panes: [HSI_PANE],
      scene: "ma.climb",
      inset: "plan",
      controls: ["bank"],
      assist: { holdAlt: true, holdIas: true },
      goal: {
        all: [
          { id: "heading", p: { value: I27.ardCourse, tol: 10 } },
          { id: "bankMax", p: { max: 5 } },
        ],
        holdS: 3,
        graded: false,
        success: { en: `Wings level on ${pad3(I27.ardCourse)}: direct ARD.`, fr: `Ailes à plat au ${pad3(I27.ardCourse)} : direct ARD.` },
      },
      hint: {
        en: `Hold ▶ under the instrument and release it when the heading reads about ${pad3(I27.ardCourse - 5)}: the aid then holds that heading.`,
        fr: `Maintenez ▶ sous l’instrument et relâchez quand le cap indique environ ${pad3(I27.ardCourse - 5)} : l’aide tient alors ce cap.`,
      },
      minutes: 2,
    }),
    mistakesStep("md-errors", {
      title: L("What goes wrong", "Ce qui tourne mal"),
      rows: [
        {
          error: L("A late go-around", "Une remise tardive"),
          why: L("Looking for the runway while sinking below 670.", "Chercher la piste en descendant sous 670."),
          fix: L("Decide at 670, not after.", "Décidez à 670, pas après."),
        },
        {
          error: L("Turning before 1,000", "Virer avant 1 000"),
          why: L("The chart says straight ahead to 1,000 ft.", "La carte dit tout droit jusqu’à 1 000 ft."),
          fix: L("Fly the words of the chart.", "Volez les mots de la carte."),
        },
        {
          error: L("Missed not sequenced", "Remise non activée"),
          why: L("The GPS stays on the runway: no guidance to ARD.", "Le GPS reste sur la piste : pas de guidage vers ARD."),
          fix: L("Sequence it after pitch and power.", "Activez-la après assiette et puissance."),
        },
      ],
      foot: L("ACS IR.VI.B · go around at DA, immediately", "ACS IR.VI.B · remise des gaz à la DA, immédiatement"),
      reader: L(
        "Common mistakes: a late go-around while looking for the runway below DA, turning before 1,000 ft, and forgetting to sequence the missed approach so the GPS gives no guidance to ARD. The ACS asks for the missed approach to start immediately at DA when the required visual references are not distinctly visible (FAA-S-ACS-8C IR.VI.B).",
        "Erreurs fréquentes : une remise tardive en cherchant la piste sous la DA, virer avant 1 000 ft, et oublier d’activer la remise si bien que le GPS ne guide pas vers ARD. L’ACS exige de commencer la remise des gaz immédiatement à la DA si les références visuelles requises ne sont pas nettement visibles (FAA-S-ACS-8C IR.VI.B).",
      ),
    }),
    checkStep("md-check-first", L("Recap 1 of 3: the first action", "Récap 1 sur 3 : la première action"), {
      lead: L(
        "Without looking back. The altimeter reads **670 ft**. Outside: grey, nothing else.",
        "Sans revenir en arrière. L’altimètre indique **670 ft**. Dehors : du gris, rien d’autre.",
      ),
      quiz: mcq(
        L("Your first action?", "Votre première action ?"),
        [
          {
            text: L("Tell ATC “missed approach”", "Annoncer « remise des gaz » au contrôle"),
            why: L("The radio comes last: the aircraft is still descending.", "La radio vient en dernier : l’avion descend encore."),
          },
          {
            text: L("Sequence the missed approach in the GPS", "Activer la remise dans le GPS"),
            why: L("Second: first stop the descent.", "En deuxième : arrêtez d’abord la descente."),
          },
          {
            text: L("Full power and 7° nose up", "Plein gaz et 7° à cabrer"),
            why: L("Right: fly first. The climb comes before everything else.", "Juste : d’abord piloter. La montée passe avant tout le reste."),
          },
        ],
        2,
        L(
          "Fly, navigate, talk: full power and 7° nose up, flaps 10; then the missed approach in the GPS; then the radio.",
          "Piloter, naviguer, parler : plein gaz et 7° à cabrer, volets 10 ; puis la remise dans le GPS ; puis la radio.",
        ),
      ),
    }),
    checkStep("md-check-turn", L("Recap 2 of 3: the turn", "Récap 2 sur 3 : le virage"), {
      lead: L(
        "You climb through **800 ft** on the runway heading. ARD is on your right, close.",
        "Vous passez **800 ft** en montée, dans l’axe de piste. ARD est à votre droite, tout près.",
      ),
      quiz: mcq(
        L("What do you do?", "Que faites-vous ?"),
        [
          {
            text: L("Straight ahead to 1,000 ft, then the turn", "Tout droit jusqu’à 1 000 ft, puis le virage"),
            why: L("Right: the chart protects the turn from 1,000 ft only.", "Juste : la carte ne protège le virage qu’à partir de 1 000 ft."),
          },
          {
            text: L("Turn now: ARD is close", "Virer maintenant : ARD est tout près"),
            why: L(
              "Below 1,000 ft only the straight climb is protected from obstacles.",
              "Sous 1 000 ft, seule la montée dans l’axe est protégée des obstacles.",
            ),
          },
          {
            text: L("Level off at 800 to gain speed", "Palier à 800 pour prendre de la vitesse"),
            why: L("Never level off low in a missed approach: keep climbing at 74 KIAS.", "Jamais de palier bas en remise des gaz : continuez de monter à 74 KIAS."),
          },
        ],
        0,
        L(
          "“Climb to 1,000, then climbing right turn to 3,000 direct ARD”: fly the words in their order.",
          "« Montez à 1 000, puis virage montant à droite vers 3 000 direct ARD » : volez les mots dans leur ordre.",
        ),
      ),
    }),
    checkStep("md-check-early", L("Recap 3 of 3: an early go-around", "Récap 3 sur 3 : une remise précoce"), {
      lead: L(
        "Another approach: at **1,500 ft**, 3 NM from the runway, the needles swing and you decide to go around.",
        "Une autre approche : à **1 500 ft**, à 3 NM de la piste, les aiguilles partent et vous décidez de remettre les gaz.",
      ),
      quiz: mcq(
        L("Your path?", "Votre trajectoire ?"),
        [
          {
            text: L("Right turn direct ARD at once", "Virage à droite direct ARD tout de suite"),
            why: L(
              "The published turn starts at the missed approach point, not 3 NM before it.",
              "Le virage publié part du point de remise des gaz, pas 3 NM avant.",
            ),
          },
          {
            text: L("Climb, stay on the final course to the runway, then turn", "Monter, rester sur l’axe jusqu’à la piste, puis virer"),
            why: L(
              "Right: climb at once, but fly the approach track to the runway before any turn.",
              "Juste : montez tout de suite, mais suivez l’axe d’approche jusqu’à la piste avant tout virage.",
            ),
          },
          {
            text: L("Descend to 670 first, then go around", "Descendre d’abord à 670, puis remettre"),
            why: L("You may always climb early. Only the turn waits.", "Vous pouvez toujours monter plus tôt. Seul le virage attend."),
          },
        ],
        1,
        L(
          "An early missed approach: climb at once and fly the approach track to the missed approach point before turning, unless ATC says otherwise (FAA AIM 5-4-21).",
          "Remise précoce : montez tout de suite et suivez l’axe d’approche jusqu’au point de remise des gaz avant de virer, sauf instruction du contrôle (FAA AIM 5-4-21).",
        ),
      ),
    }),
    readyStep("md-ready", {
      objectives: [
        L("Go around at DA 670 without delay", "Remettre les gaz à la DA 670 sans délai"),
        L("Fly the published missed approach", "Voler la remise des gaz publiée"),
        { en: `Enter the ARD hold: ${entryEn}`, fr: `Entrer dans l’attente d’ARD : ${entryFr}` },
      ],
      standards: [
        { n: L("DA", "DA"), text: L("go around at once, no lower", "remise immédiate, pas plus bas"), color: "stop" },
        { n: L("1,000", "1 000"), text: L("before the turn", "avant le virage"), color: "key" },
        { n: L("3,000", "3 000"), text: L("±100 ft at ARD", "±100 ft à ARD") },
        { n: L("1:00", "1:00"), text: L("inbound legs", "branches de rapprochement"), color: "nav" },
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
      L("Fly the lesson: missed approach at DA", "Volez la leçon : remise des gaz à la DA"),
      L(
        "Vectors to the ILS 27 in a 120 ft ceiling: go around at 670 and hold at ARD.",
        "Guidage vers l’ILS 27 sous un plafond de 120 ft : remettez à 670 et attendez à ARD.",
      ),
      [
        L("At 670: G, no look-see.", "À 670 : G, pas de coup d’œil."),
        L("Straight ahead to 1,000, then right to ARD.", "Tout droit jusqu’à 1 000, puis à droite vers ARD."),
        L(
          "To pass: never below 670, the turn at 1,000 ft, 3,000 ft ±100 at ARD, the right entry.",
          "Pour réussir : jamais sous 670, le virage à 1 000 ft, 3 000 ft ±100 à ARD, la bonne entrée.",
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
        "The briefing of the missed approach lesson: no look-see at DA, the go-around flown on the instruments, the climb gradient, the entry at ARD, the turn at 1,000 ft, then fly it.",
        "Le briefing de la leçon remise des gaz : pas de coup d’œil à la DA, la remise pilotée aux instruments, la pente de montée, l’entrée à ARD, le virage à 1 000 ft, puis le vol.",
      ),
      tags: ["ifr", "approach", "missed", "holding"],
      minutes: 18,
    },
    steps,
    missedScenes(),
  );
}

// ================================================================== ma-pp
// Upgrade plan (was: 7 slides, 3 interactions). Weak: the Try it was met with no input, the glideslope was called
// the vertical needle, the deck spoke of an AHRS, a standby horizon and an MFD beside a six-pack, the six-pack of
// "what is lost" was unreadable, no objectives, no retrieval. Added: the situation and its question (mp-goals),
// what is left read on two large gauges (the turn coordinator and the NAV 2 head, which has no gyro: the HSI needle
// turns with its frozen card and cannot be read), a timed-correction check, a localizer correction flown with the
// gyros failed (mp-steps: it needs an input), the glideslope taken without the attitude indicator (mp-solo), and
// three retrieval questions. The deck is on the six-pack; the lesson's G1000 shows the same failure
// as red crosses, with a standby attitude indicator and the compass.
const AI_COVER: ("ai" | "dg")[] = ["ai"];
/** The lower row of the six-pack: turn coordinator, HSI and vertical speed. */
const LOWER_ROW_PANE: PaneView = { kind: "six", crop: { rect: [0, 408, 1024, 360] } };
const TC_PANE = pane(3);
/** The NAV 2 head of the radio stack: a plain localizer and glideslope indicator, with no gyro in it. */
const NAV2_PANE: PaneView = { kind: "stack", crop: { region: "STEAM_RIGHT:0" } };
/** The ILS 27 with the gyros failed: the attitude indicator is dead, the HSI card is frozen under its HDG flag. */
function ppScenes(): Record<string, SimScene> {
  const n = ilsNumbers();
  const rwy = { icao: "PARD", id: "27" };
  const at = (
    id: string,
    pos: { distNm: number; offsetDeg?: number },
    altFt: number,
    vsFpm: number,
    label: string,
  ): SimScene => {
    const sc = scene(
      id,
      {
        pos: { runway: rwy, ...pos },
        altFt,
        hdg: n.hdg,
        iasKt: 90,
        ...(vsFpm ? { vsFpm } : {}),
        radios: { ...ILS_RADIOS, nav2: "IPRD", obs2: 270 },
      },
      { label, wind: [220, 12] },
    );
    sc.failures = { ahrs: true };
    return sc;
  };
  return {
    "pp.final": at(
      "pp.final",
      { distNm: 4 },
      pathAlt(I27.tdze, I27.tch, 4),
      -n.vs,
      "ILS 27 · 4 NM · gyros failed · both needles centred",
    ),
    "pp.right": at(
      "pp.right",
      { distNm: 9, offsetDeg: -1.4 },
      I27.keddy,
      0,
      "ILS 27 · 9 NM · gyros failed · right of the localizer",
    ),
    "pp.level": at(
      "pp.level",
      { distNm: 8.6 },
      I27.keddy,
      0,
      "ILS 27 · 8.6 NM · gyros failed · level at 3,000 ft, the glideslope above",
    ),
  };
}
export function ppIlsBriefing(): Briefing {
  const n = ilsNumbers();
  const steps: Step[] = [
    coverStep("mp-cover", L("Briefing: the partial-panel ILS", "Briefing : l’ILS en panneau partiel"), {
      eyebrow: L("Lesson briefing · Abnormals", "Briefing de leçon · Situations anormales"),
      main: L("Partial-panel ILS", "ILS en panneau partiel"),
      sub: L("No attitude, no heading: the needles still work", "Ni horizon ni cap : les aiguilles marchent"),
      lead: L(
        "The gyros have failed. Fly the ILS 27 on the turn coordinator, the compass and the two needles.",
        "Les gyroscopes sont en panne. Volez l’ILS 27 sur l’indicateur de virage, le compas et les deux aiguilles.",
      ),
      meta: L("About 15 min · hand-flown · ACS IR.VII.D", "Environ 15 min · pilotage manuel · ACS IR.VII.D"),
      hero: [
        INST(
          { kind: "six" },
          L(
            "Six-pack on the ILS 27: the attitude indicator covered, the HDG flag on the HSI, both needles centred",
            "Six instruments sur l’ILS 27 : l’horizon masqué, le drapeau HDG sur le HSI, les deux aiguilles centrées",
          ),
          984,
          240,
          816,
          612,
          { id: "mp-cover.six", scene: "pp.final", covers: AI_COVER, failures: { ahrs: true } },
        ),
      ],
      scene: "pp.final",
      reader: L(
        "The briefing of the partial-panel ILS lesson: with the attitude and heading gyros failed, fly the ILS 27 on the turn coordinator, with the magnetic compass for heading. The localizer and glideslope needles come from the radios: they are not affected. In the lesson's G1000 the same failure is called AHRS: red crosses on the attitude and the HSI, a standby attitude indicator and the compass.",
        "Le briefing de la leçon ILS en panneau partiel : gyroscopes d’horizon et de cap en panne, volez l’ILS 27 sur l’indicateur de virage, avec le compas magnétique pour le cap. Les aiguilles du localizer et du glide viennent des radios : elles ne sont pas touchées. Sur le G1000 de la leçon, la même panne s’appelle AHRS : croix rouges sur l’horizon et le HSI, un horizon de secours et le compas.",
      ),
    }),
    goalsStep("mp-goals", {
      title: L("In cloud, the horizon fails", "Dans la couche, l’horizon tombe en panne"),
      hook: L(
        "On vectors for the ILS 27, in cloud, ceiling 600 ft. The attitude indicator tumbles and a red HDG flag appears on the HSI. The runway is 12 NM ahead.",
        "En guidage vers l’ILS 27, dans la couche, plafond 600 ft. L’horizon bascule et un drapeau rouge HDG apparaît sur le HSI. La piste est à 12 NM.",
      ),
      objectives: [
        L(
          "Say in 5 seconds what is lost and what still tells the truth",
          "Dire en 5 secondes ce qui est perdu et ce qui dit encore vrai",
        ),
        L(
          "Correct the localizer by small timed turns: 5° in 3 s at half rate",
          "Corriger le localizer par petits virages chronométrés : 5° en 3 s au demi-taux",
        ),
        L(
          "Keep both needles within ¾ scale down to DA 670",
          "Tenir les deux aiguilles à moins de ¾ d’échelle jusqu’à la DA 670",
        ),
      ],
      quiz: mcq(
        L("The localizer needle is now…", "L’aiguille du localizer est maintenant…"),
        [
          {
            text: L("Dead too, like the HSI", "En panne aussi, comme le HSI"),
            why: L(
              "Only the compass card of the HSI is a gyro. The localizer is a radio.",
              "Seule la rose du HSI est un gyroscope. Le localizer est une radio.",
            ),
          },
          {
            text: L("Still right: it comes from the radio", "Toujours juste : elle vient de la radio"),
            why: L(
              "Right: the localizer and the glideslope do not depend on the gyros.",
              "Juste : le localizer et le glide ne dépendent pas des gyroscopes.",
            ),
          },
          {
            text: L("Right only with wings level", "Juste seulement ailes à plat"),
            why: L(
              "That is the compass. The needle is right in a turn too.",
              "Ça, c’est le compas. L’aiguille reste juste en virage.",
            ),
          },
        ],
        1,
        L(
          "The needles are radio receivers: they still guide you to the runway. This briefing shows how to follow them without the gyros.",
          "Les aiguilles sont des récepteurs radio : elles vous guident toujours vers la piste. Ce briefing montre comment les suivre sans les gyroscopes.",
        ),
      ),
      foot: L("PARD ILS RWY 27 (simulated) · ACS IR.VII.D", "PARD ILS 27 (simulée) · ACS IR.VII.D"),
      scene: "pp.final",
      reader: L(
        "The situation: on vectors for the ILS 27 in cloud, ceiling 600 ft, the attitude indicator tumbles and the HDG flag appears on the HSI. After this briefing you can say in 5 seconds what is lost and what still tells the truth, correct the localizer by small timed turns (5° in 3 s at half standard rate), and keep both needles within ¾ scale down to DA 670.",
        "La situation : en guidage vers l’ILS 27 dans la couche, plafond 600 ft, l’horizon bascule et le drapeau HDG apparaît sur le HSI. Après ce briefing vous savez dire en 5 secondes ce qui est perdu et ce qui dit encore vrai, corriger le localizer par petits virages chronométrés (5° en 3 s au demi-taux), et tenir les deux aiguilles à moins de ¾ d’échelle jusqu’à la DA 670.",
      ),
    }),
    panelStep("mp-what", {
      eyebrow: L("What is left", "Ce qui reste"),
      title: L("Lost, and still working", "Perdu, et encore là"),
      lead: L(
        "Attitude and HSI card lost. These two still tell the truth.",
        "L’horizon et la rose du HSI sont perdus. Ces deux-là disent encore vrai.",
      ),
      gauges: [
        {
          gauge: "tc",
          alt: L("Turn coordinator: wings level, ball centred", "Indicateur de virage : ailes à plat, bille centrée"),
          marks: [{ n: 1, at: [0.62, -0.25] }],
        },
        {
          gauge: "cdi",
          alt: L(
            "NAV 2 indicator on the ILS 27: the vertical needle (localizer) and the horizontal needle (glideslope) are centred",
            "Indicateur NAV 2 sur l’ILS 27 : l’aiguille verticale (localizer) et l’aiguille horizontale (glide) sont centrées",
          ),
          marks: [
            { n: 2, at: [0.2, -0.45] },
            { n: 3, at: [-0.5, 0.2] },
          ],
        },
      ],
      scene: "pp.final",
      rows: [
        {
          heading: L("Your wings: the turn coordinator", "Vos ailes : l’indicateur de virage"),
          body: L("It replaces the attitude indicator. Wings level is the default.", "Il remplace l’horizon. Ailes à plat par défaut."),
        },
        {
          heading: L("Vertical needle: the localizer", "Aiguille verticale : le localizer"),
          body: L("Left of the centre: the runway centreline is on your left.", "À gauche du centre : l’axe de piste est à votre gauche."),
        },
        {
          heading: L("Horizontal needle: the glideslope", "Aiguille horizontale : le glide"),
          body: L("Above the centre: the path is above you.", "Au-dessus du centre : le plan est au-dessus de vous."),
        },
      ],
      foot: L(
        "NAV 2: an indicator with no gyro · FAA IFH ch. 6–7",
        "NAV 2 : un indicateur sans gyroscope · FAA IFH ch. 6–7",
      ),
      reader: L(
        "The failure removes the attitude indicator and the compass card of the HSI. Cover the failed attitude indicator: a failed gyro can look believable. The needle of the HSI turns with its frozen card and is hard to read: tune the ILS on NAV 2 as well. The NAV 2 indicator has no gyro: its vertical needle is the localizer (left of the centre, the centreline is on your left), its horizontal needle is the glideslope (above the centre, the path is above you). The airspeed, the altimeter and the vertical speed still work. Bank comes from the turn coordinator, heading from the magnetic compass, read wings level (FAA IFH ch. 6–7).",
        "La panne supprime l’horizon et la rose du HSI. Masquez l’horizon en panne : un gyroscope en panne peut paraître crédible. L’aiguille du HSI tourne avec sa rose figée et se lit mal : réglez aussi l’ILS sur NAV 2. L’indicateur NAV 2 n’a pas de gyroscope : son aiguille verticale est le localizer (à gauche du centre, l’axe est à votre gauche), son aiguille horizontale est le glide (au-dessus du centre, le plan est au-dessus de vous). L’anémomètre, l’altimètre et le variomètre fonctionnent toujours. L’inclinaison vient de l’indicateur de virage, le cap du compas magnétique, lu ailes à plat (FAA IFH ch. 6–7).",
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
            text: L("Small: east and west headings", "Faible : caps est et ouest"),
            why: L(
              "Right: the turning error is largest near north and south.",
              "Juste : l’erreur de virage est maximale près du nord et du sud.",
            ),
          },
          {
            text: L("Largest: lead by 30°", "Maximale : anticipez de 30°"),
            why: L("That is rolling out on north or south.", "C’est le cas d’une sortie au nord ou au sud."),
          },
          {
            text: L("None: the compass is a gyro", "Nulle : le compas est un gyro"),
            why: L("The compass is magnetic: it swings and lags.", "Le compas est magnétique : il oscille et traîne."),
          },
        ],
        0,
        L(
          "Turning error is near zero on east and west: this final course helps you. Accelerations still swing it.",
          "L’erreur de virage est quasi nulle à l’est et à l’ouest : cette finale vous aide. Les accélérations le font encore osciller.",
        ),
      ),
      foot: L("FAA PHAK ch. 8 · northern hemisphere", "FAA PHAK ch. 8 · hémisphère nord"),
      reader: L(
        "The magnetic compass turning error is largest when rolling out on north or south and near zero on east or west. On a westerly final course, 270, it is small; acceleration error still swings the card when the speed changes (FAA PHAK ch. 8).",
        "L’erreur de virage du compas magnétique est maximale en sortie au nord ou au sud et quasi nulle à l’est ou à l’ouest. Sur une finale vers l’ouest, 270, elle est faible ; l’erreur d’accélération fait encore osciller la rose quand la vitesse change (FAA PHAK ch. 8).",
      ),
    }),
    formulaStep("mp-turns", {
      eyebrow: L("The numbers", "Les chiffres"),
      title: L("Small corrections: timed, at half rate", "Petites corrections : chronométrées, demi-taux"),
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
      units: L("time in s · change in ° · half rate 1.5°/s", "temps en s · écart en ° · demi-taux 1,5°/s"),
      lines: [
        L("5° | = [5/1.5] ≈ !3 s!", "5° | = [5/1,5] ≈ !3 s!"),
        L("10° | = [10/1.5] ≈ !7 s!", "10° | = [10/1,5] ≈ !7 s!"),
      ],
      after: L(
        "Roll in, count, roll out. Then let the compass settle.",
        "Inclinez, comptez, sortez. Puis laissez le compas se stabiliser.",
      ),
      foot: L(
        "FAA IFH ch. 7 · half rate: the wing halfway to the index, about 7° of bank",
        "FAA IFH ch. 7 · demi-taux : l’aile à mi-chemin du repère, environ 7° d’inclinaison",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "time (s) = heading change (°) ÷ 1.5 at half standard rate",
            "temps (s) = écart de cap (°) ÷ 1,5 au demi-taux",
          ),
          ruleOfThumb: L(
            "On the localizer, correct 5° at a time: about 3 s at half standard rate (the wing of the turn coordinator halfway to its index, about 7° of bank at 90 kt), then wings level and wait for the compass to settle before you read it (FAA IFH ch. 7).",
            "Sur le localizer, corrigez de 5° à la fois : environ 3 s au demi-taux (l’aile de l’indicateur de virage à mi-chemin de son repère, environ 7° d’inclinaison à 90 kt), puis ailes à plat et attendez que le compas se stabilise avant de le lire (FAA IFH ch. 7).",
          ),
          refs: [{ src: "FAA-IFH", ref: "ch. 7" }],
        },
      ],
    }),
    checkStep("mp-check-time", L("Check: how long?", "Vérification : combien de temps ?"), {
      lead: L(
        "The localizer needle drifts left. You want **8° to the left**, at half standard rate.",
        "L’aiguille du localizer part à gauche. Vous voulez **8° à gauche**, au demi-taux.",
      ),
      quiz: mcq(
        L("How long do you hold the bank?", "Combien de temps tenez-vous l’inclinaison ?"),
        [
          {
            text: L("About 3 s", "Environ 3 s"),
            why: L("That is 8 ÷ 3, the standard rate. At half rate you turn 1.5° per second.", "C’est 8 ÷ 3, le taux standard. Au demi-taux, vous tournez de 1,5° par seconde."),
          },
          {
            text: L("About 5 s", "Environ 5 s"),
            why: L("Right: 8 ÷ 1.5 ≈ 5 s.", "Juste : 8 ÷ 1,5 ≈ 5 s."),
          },
          {
            text: L("About 12 s", "Environ 12 s"),
            why: L("That is 8 × 1.5: divide, do not multiply.", "C’est 8 × 1,5 : divisez, ne multipliez pas."),
          },
        ],
        1,
        L(
          "Time = change ÷ 1.5: 8° takes about 5 s. Count, roll out, then read the compass wings level.",
          "Temps = écart ÷ 1,5 : 8° demandent environ 5 s. Comptez, sortez, puis lisez le compas ailes à plat.",
        ),
      ),
    }),
    practiceStep("mp-steps", {
      title: L("Your turn: back to the localizer, no gyros", "À vous : revenez sur le localizer, sans gyros"),
      intro: L(
        "Level at 3,000 ft, 9 NM out, the gyros failed. On the NAV 2 indicator the vertical needle is **left** of the centre: the localizer is on your left. One short press on **◀** turns 10° left: watch the wing of the turn coordinator. Wait for the needle, then one short press on **▶** just before it is centred.",
        "En palier à 3 000 ft, à 9 NM, gyroscopes en panne. Sur l’indicateur NAV 2, l’aiguille verticale est à **gauche** du centre : le localizer est à votre gauche. Un appui bref sur **◀** fait tourner de 10° à gauche : regardez l’aile de l’indicateur de virage. Attendez l’aiguille, puis un appui bref sur **▶** juste avant qu’elle soit centrée.",
      ),
      rows: [
        { text: L("Localizer needle **near the centre**", "Aiguille du localizer **près du centre**"), check: 0, readout: "cdiDots" },
        { text: L("Wings level", "Ailes à plat"), check: 1 },
      ],
      after: L(
        "A small turn, held, then taken out: the needle came back and stayed. You never saw a heading: the needle and the turn coordinator were enough. In the aircraft you would count 3 s for 5° at half rate.",
        "Un petit virage, tenu, puis repris : l’aiguille est revenue et elle est restée. Vous n’avez jamais vu de cap : l’aiguille et l’indicateur de virage ont suffi. En avion, vous compteriez 3 s pour 5° au demi-taux.",
      ),
      takeaway: L(
        "Turn towards the needle, a little, then take the turn out before it is centred.",
        "Virez vers l’aiguille, un peu, puis reprenez le virage avant qu’elle soit centrée.",
      ),
      panes: [TC_PANE, NAV2_PANE],
      scene: "pp.right",
      inset: "plan",
      controls: ["bank"],
      assist: { holdAlt: true, holdIas: true },
      goal: {
        all: [HALF_DOT_LOC, { id: "bankMax", p: { max: 3 } }],
        holdS: 5,
        graded: false,
        success: L(
          "Centred and wings level, with no gyro.",
          "Centré et ailes à plat, sans gyroscope.",
        ),
      },
      hint: L(
        "One short press on ◀ (10° left). When the needle is nearly centred, one short press on ▶.",
        "Un appui bref sur ◀ (10° à gauche). Quand l’aiguille est presque centrée, un appui bref sur ▶.",
      ),
      minutes: 3,
    }),
    practiceStep("mp-solo", {
      title: L("On your own: the glideslope without the horizon", "Seul : le glide sans l’horizon"),
      intro: {
        en: `Level at 3,000 ft towards MARLO, the gyros failed. On the NAV 2 indicator the horizontal needle, the glideslope, comes down towards the centre. When it reaches it, hold **▼**. Without the attitude indicator your pitch is read on the vertical speed: about ${n.vs} ft/min.`,
        fr: `En palier à 3 000 ft vers MARLO, gyroscopes en panne. Sur l’indicateur NAV 2, l’aiguille horizontale, le glide, descend vers le centre. Quand elle y arrive, maintenez **▼**. Sans horizon, votre assiette se lit au variomètre : environ ${n.vs} ft/min.`,
      },
      rows: [
        { text: L("Glideslope needle **near the centre**", "Aiguille du glide **près du centre**"), check: 0, readout: "gsDots" },
        { text: L("Below **2,850 ft**, on the path", "Sous **2 850 ft**, sur le plan"), check: 1, readout: "alt" },
      ],
      after: L(
        "The same capture as with a full panel: the glideslope needle and the vertical speed told you everything. The attitude indicator is a comfort, not a need.",
        "La même capture qu’avec le panneau complet : l’aiguille du glide et le variomètre vous ont tout dit. L’horizon est un confort, pas une nécessité.",
      ),
      takeaway: L(
        "Without the attitude indicator: bank on the turn coordinator, pitch on the vertical speed.",
        "Sans horizon : l’inclinaison à l’indicateur de virage, l’assiette au variomètre.",
      ),
      panes: [NAV2_PANE, VSI_PANE],
      scene: "pp.level",
      controls: ["pitch"],
      assist: { holdAlt: true, holdIas: true },
      goal: {
        all: [ONE_DOT_GS, { id: "altBand", p: { min: 1500, max: 2850 } }],
        holdS: 5,
        graded: false,
        success: L("On the glideslope, descending, with no attitude indicator.", "Sur le glide, en descente, sans horizon."),
      },
      hint: L(
        "Wait for the horizontal needle to reach the middle of the NAV 2 indicator, then hold ▼. Released, the aircraft levels off.",
        "Attendez que l’aiguille horizontale arrive au milieu de l’indicateur NAV 2, puis maintenez ▼. Relâché, l’avion se remet en palier.",
      ),
      minutes: 3,
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
          why: L("More than 10°, and the compass cannot keep up.", "Plus de 10°, et le compas ne suit plus."),
          fix: L("5° at a time, timed.", "5° à la fois, chronométrés."),
        },
        {
          error: L("Reading the compass in the turn", "Lire le compas en virage"),
          why: L("It lags and swings until wings level.", "Il traîne et oscille jusqu’aux ailes à plat."),
          fix: L("Read it wings level, steady.", "Lisez-le ailes à plat, stabilisé."),
        },
      ],
      foot: L(
        "ACS IR.VII.D · the same tolerances as a normal ILS",
        "ACS IR.VII.D · les mêmes tolérances qu’un ILS normal",
      ),
      reader: L(
        "Common mistakes: following the failed gyro, correcting the localizer by more than 10° so the compass cannot keep up, and reading the compass in the turn. The ACS asks for the same approach tolerances as with a full panel (FAA-S-ACS-8C IR.VII.D).",
        "Erreurs fréquentes : suivre le gyro en panne, corriger le localizer de plus de 10° si bien que le compas ne suit plus, et lire le compas en virage. L’ACS demande les mêmes tolérances qu’avec le panneau complet (FAA-S-ACS-8C IR.VII.D).",
      ),
    }),
    checkStep("mp-check-left", L("Recap 1 of 3: what is left", "Récap 1 sur 3 : ce qui reste"), {
      lead: L(
        "Without looking back. The gyros have failed. Look at the three instruments: which one gives you your **bank**?",
        "Sans revenir en arrière. Les gyroscopes sont en panne. Regardez les trois instruments : lequel vous donne votre **inclinaison** ?",
      ),
      stage: { panes: [LOWER_ROW_PANE], scene: "pp.final" },
      quiz: mcq(
        L("Your bank is read on…", "Votre inclinaison se lit sur…"),
        [
          {
            text: L("The turn coordinator, on the left", "L’indicateur de virage, à gauche"),
            why: L("Right: its wing tilts as soon as you bank.", "Juste : son aile penche dès que vous inclinez."),
          },
          {
            text: L("The HSI, in the middle", "Le HSI, au milieu"),
            why: L("Its card is frozen under the HDG flag: it shows neither heading nor bank.", "Sa rose est figée sous le drapeau HDG : elle ne montre ni cap ni inclinaison."),
          },
          {
            text: L("The vertical speed, on the right", "Le variomètre, à droite"),
            why: L("It shows climb or descent: your pitch, not your bank.", "Il montre montée ou descente : votre assiette, pas votre inclinaison."),
          },
        ],
        0,
        L(
          "Bank: the turn coordinator. Pitch: the vertical speed and the airspeed. Heading: the compass, wings level.",
          "Inclinaison : l’indicateur de virage. Assiette : le variomètre et l’anémomètre. Cap : le compas, ailes à plat.",
        ),
      ),
    }),
    checkStep("mp-check-compass", L("Recap 2 of 3: the compass", "Récap 2 sur 3 : le compas"), {
      lead: L(
        "You are correcting 5° to the left. In the turn, the compass already shows **255**.",
        "Vous corrigez de 5° à gauche. En virage, le compas indique déjà **255**.",
      ),
      quiz: mcq(
        L("What do you do?", "Que faites-vous ?"),
        [
          {
            text: L("Turn back right at once: too far", "Revenir à droite tout de suite : trop loin"),
            why: L("In the turn the compass is wrong: you would chase an error.", "En virage, le compas est faux : vous courriez après une erreur."),
          },
          {
            text: L("Roll out on time, wait, then read it", "Sortir à l’heure, attendre, puis le lire"),
            why: L("Right: 3 s, wings level, let it settle, then read.", "Juste : 3 s, ailes à plat, laissez-le se stabiliser, puis lisez."),
          },
          {
            text: L("Keep turning until it shows 265", "Continuer jusqu’à lire 265"),
            why: L("You steer on a card that lags and swings: you will overshoot.", "Vous pilotez sur une rose qui traîne et oscille : vous irez trop loin."),
          },
        ],
        1,
        L(
          "In a turn the clock gives the heading, not the compass. Roll out on time and read the compass wings level, at a steady speed.",
          "En virage, c’est le chrono qui donne le cap, pas le compas. Sortez à l’heure et lisez le compas ailes à plat, à vitesse stable.",
        ),
      ),
    }),
    checkStep("mp-check-da", L("Recap 3 of 3: at DA 670", "Récap 3 sur 3 : à la DA 670"), {
      lead: L(
        "Still without gyros. At **670 ft**: no runway. You go around.",
        "Toujours sans gyroscopes. À **670 ft** : pas de piste. Vous remettez les gaz.",
      ),
      quiz: mcq(
        L("Without the attitude indicator, the climb is flown on…", "Sans horizon, la montée se pilote sur…"),
        [
          {
            text: L("The airspeed: 74 KIAS, wings level on the turn coordinator", "L’anémomètre : 74 KIAS, ailes à plat à l’indicateur de virage"),
            why: L("Right: full power, then pitch for 74 KIAS and keep the wing level.", "Juste : plein gaz, puis l’assiette pour 74 KIAS, et l’aile à plat."),
          },
          {
            text: L("The covered attitude indicator: uncover it", "L’horizon masqué : démasquez-le"),
            why: L("It is failed: uncovered, it would lie to you in the climb.", "Il est en panne : démasqué, il vous mentirait en montée."),
          },
          {
            text: L("The compass: hold 270 exactly", "Le compas : tenez 270 exactement"),
            why: L("It swings when the speed changes: wings level first, heading later.", "Il oscille quand la vitesse change : d’abord les ailes à plat, le cap ensuite."),
          },
        ],
        0,
        L(
          "A partial-panel go-around: full power, pitch for Vy 74 KIAS on the airspeed, wings level on the turn coordinator, then the published missed approach.",
          "Remise des gaz en panneau partiel : plein gaz, l’assiette pour Vy 74 KIAS à l’anémomètre, ailes à plat à l’indicateur de virage, puis la remise publiée.",
        ),
      ),
    }),
    readyStep("mp-ready", {
      objectives: [
        L("Fly the ILS 27 without attitude or heading", "Voler l’ILS 27 sans horizon ni cap"),
        L("Correct with timed half-rate turns", "Corriger par virages chronométrés au demi-taux"),
        L("Decide at DA 670: land or go around", "Décider à la DA 670 : atterrir ou remettre"),
      ],
      standards: [
        { n: L("¾", "¾"), text: L("scale, LOC and GS", "d’échelle, LOC et glide"), color: "nav" },
        { n: L("±10", "±10"), text: L("KIAS on final", "KIAS en finale") },
        { n: L("670", "670"), text: L("DA, no lower", "DA, pas plus bas"), color: "stop" },
        { n: L("5°", "5°"), text: L("per correction", "par correction"), color: "key" },
      ],
      tip: L(
        "The lesson is on the G1000: red crosses, a standby attitude indicator, the compass.",
        "La leçon est sur G1000 : croix rouges, un horizon de secours, le compas.",
      ),
      reader: L(
        "Standards (FAA-S-ACS-8C IR.VII.D): the precision approach tolerances with the primary flight instruments failed: less than ¾-scale deflection of both needles, airspeed ±10 KIAS, no descent below DA without the required visual references. You start on vectors at 3,000 ft: intercept the localizer, then the glideslope.",
        "Critères (FAA-S-ACS-8C IR.VII.D) : les tolérances de l’approche de précision avec les instruments primaires en panne : moins de ¾ d’échelle sur les deux aiguilles, vitesse ±10 KIAS, pas de descente sous la DA sans les références visuelles requises. Vous partez en guidage à 3 000 ft : interceptez le localizer, puis le glide.",
      ),
    }),
    flyStep(
      "mp-fly",
      "ma-pp",
      L("Fly the lesson: partial-panel ILS", "Volez la leçon : ILS en panneau partiel"),
      L(
        "Vectors to the ILS 27 with the attitude and heading failed: standby attitude, compass and needles.",
        "Guidage vers l’ILS 27, horizon et cap en panne : horizon de secours, compas et aiguilles.",
      ),
      [
        L("Small corrections: 5° at a time on the localizer.", "Petites corrections : 5° à la fois sur le localizer."),
        { en: `About ${n.vs} ft/min on the glideslope at 90 KIAS.`, fr: `Environ ${n.vs} ft/min sur le glide à 90 KIAS.` },
        L(
          "To pass: both needles within ¾ scale, speed ±10 KIAS, never below 670 without the runway.",
          "Pour réussir : les deux aiguilles à moins de ¾ d’échelle, vitesse ±10 KIAS, jamais sous 670 sans la piste.",
        ),
      ],
      15,
    ),
  ];
  return briefing(
    {
      id: PP_ILS_BRIEFING_ID,
      exerciseId: "ma-pp",
      title: L("Briefing: the partial-panel ILS", "Briefing : l’ILS en panneau partiel"),
      summary: L(
        "The briefing of the partial-panel ILS lesson: what the failure takes and leaves, timed half-rate corrections, the compass on 270, a localizer correction and a glideslope capture without the gyros, then fly it.",
        "Le briefing de la leçon ILS en panneau partiel : ce que la panne enlève et laisse, les corrections chronométrées au demi-taux, le compas au 270, une correction de localizer et une capture du glide sans les gyroscopes, puis le vol.",
      ),
      tags: ["ifr", "approach", "ils", "partial-panel"],
      minutes: 18,
    },
    steps,
    ppScenes(),
  );
}
