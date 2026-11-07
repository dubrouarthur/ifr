// Ground school — the crafted lesson briefings: one slide deck per key sim lesson, played by the course player in
// the cockpit before the lesson (course/ui/briefingDeck.ts finds them through briefingForLesson(), by
// `briefingFor.exerciseId`) and listed in the library with the samples.
import type { Course, L10n } from "../../types";
import {
  COMPASS_BRIEFING_ID,
  TURNS_BRIEFING_ID,
  UNUSUAL_BRIEFING_ID,
  compassBriefing,
  turnsBriefing,
  unusualBriefing,
} from "./attitude";
import {
  ARC_BRIEFING_ID,
  VOR_IN_BRIEFING_ID,
  VOR_OUT_BRIEFING_ID,
  arcBriefing,
  vorInBriefing,
  vorOutBriefing,
} from "./radionav";
import {
  ILS_HAND_BRIEFING_ID,
  LNAV_BRIEFING_ID,
  MISSED_BRIEFING_ID,
  PP_ILS_BRIEFING_ID,
  ilsHandBriefing,
  lnavBriefing,
  missedBriefing,
  ppIlsBriefing,
} from "./approaches";
import {
  HOLD_BLURBS,
  HOLD_DIRECT_BRIEFING_ID,
  HOLD_PARALLEL_BRIEFING_ID,
  HOLD_TEARDROP_BRIEFING_ID,
  holdDirectBriefing,
  holdParallelBriefing,
  holdTeardropBriefing,
} from "./holds";
import { HOLD_NDB_BRIEFING_ID, holdNdbBriefing } from "./holdNdb";

export {
  HOLD_NDB_BRIEFING_ID,
  ILS_HAND_BRIEFING_ID,
  LNAV_BRIEFING_ID,
  MISSED_BRIEFING_ID,
  PP_ILS_BRIEFING_ID,
  HOLD_DIRECT_BRIEFING_ID,
  HOLD_PARALLEL_BRIEFING_ID,
  HOLD_TEARDROP_BRIEFING_ID,
  ARC_BRIEFING_ID,
  COMPASS_BRIEFING_ID,
  TURNS_BRIEFING_ID,
  UNUSUAL_BRIEFING_ID,
  VOR_IN_BRIEFING_ID,
  VOR_OUT_BRIEFING_ID,
};

export interface BriefingDef {
  id: string;
  /** the lesson it briefs (train/curriculum.ts) */
  exerciseId: string;
  build: () => Course;
  blurb: L10n;
}

// hold-ndb first: the library has listed it right after the four sample courses since the first briefing
export const CRAFTED_BRIEFINGS: readonly BriefingDef[] = [
  {
    id: HOLD_NDB_BRIEFING_ID,
    exerciseId: "hold-ndb",
    build: holdNdbBriefing,
    blurb: { en: "Briefing: the RMI, abeam on 180, a short outbound", fr: "Briefing : le RMI, le travers sur 180, un éloignement court" },
  },
  {
    id: TURNS_BRIEFING_ID,
    exerciseId: "bai-turns",
    build: turnsBriefing,
    blurb: { en: "Briefing: 3°/s, bank from TAS, the roll-out lead", fr: "Briefing : 3°/s, l’inclinaison selon la Vp, l’anticipation" },
  },
  {
    id: UNUSUAL_BRIEFING_ID,
    exerciseId: "bai-unusual",
    build: unusualBriefing,
    blurb: { en: "Briefing: recognise, then recover in the right order", fr: "Briefing : reconnaître, puis rattraper dans l’ordre" },
  },
  {
    id: COMPASS_BRIEFING_ID,
    exerciseId: "pp-compass",
    build: compassBriefing,
    blurb: { en: "Briefing: timed turns and the compass errors", fr: "Briefing : virages chronométrés et erreurs du compas" },
  },
  {
    id: VOR_OUT_BRIEFING_ID,
    exerciseId: "nav-vor-out",
    build: vorOutBriefing,
    blurb: { en: "Briefing: find your radial, intercept, the wind", fr: "Briefing : trouver son radial, intercepter, le vent" },
  },
  {
    id: VOR_IN_BRIEFING_ID,
    exerciseId: "nav-vor-in",
    build: vorInBriefing,
    blurb: { en: "Briefing: bracketing and station passage", fr: "Briefing : l’encadrement et le passage de la station" },
  },
  {
    id: ARC_BRIEFING_ID,
    exerciseId: "nav-arc",
    build: arcBriefing,
    blurb: { en: "Briefing: the 10° rhythm and the lead radial", fr: "Briefing : le rythme de 10° et le radial d’anticipation" },
  },
  { id: HOLD_DIRECT_BRIEFING_ID, exerciseId: "hold-direct", build: holdDirectBriefing, blurb: HOLD_BLURBS.DIRECT },
  { id: HOLD_TEARDROP_BRIEFING_ID, exerciseId: "hold-teardrop", build: holdTeardropBriefing, blurb: HOLD_BLURBS.TEARDROP },
  { id: HOLD_PARALLEL_BRIEFING_ID, exerciseId: "hold-parallel", build: holdParallelBriefing, blurb: HOLD_BLURBS.PARALLEL },
  {
    id: ILS_HAND_BRIEFING_ID,
    exerciseId: "app-ils-hand",
    build: ilsHandBriefing,
    blurb: { en: "Briefing: the ILS 27 profile, the needles near DA, 91.175", fr: "Briefing : le profil de l’ILS 27, les aiguilles près de la DA, 91.175" },
  },
  {
    id: LNAV_BRIEFING_ID,
    exerciseId: "app-lnav-vnav",
    build: lnavBriefing,
    blurb: { en: "Briefing: DA or MDA, the VDP, Vapp in gusts", fr: "Briefing : DA ou MDA, le VDP, la Vapp en rafales" },
  },
  {
    id: MISSED_BRIEFING_ID,
    exerciseId: "ma-da",
    build: missedBriefing,
    blurb: { en: "Briefing: go around at DA, the climb, the entry at ARD", fr: "Briefing : remettre à la DA, la montée, l’entrée à ARD" },
  },
  {
    id: PP_ILS_BRIEFING_ID,
    exerciseId: "ma-pp",
    build: ppIlsBriefing,
    blurb: { en: "Briefing: the ILS without attitude or heading", fr: "Briefing : l’ILS sans horizon ni cap" },
  },
];
