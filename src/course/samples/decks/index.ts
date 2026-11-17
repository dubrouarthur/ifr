// The short ready-to-teach decks (10 to 14 slides): moving instruments, the student at the controls on the slide,
// a question that explains why, one flight in the simulator. Listed by the samples index (../index.ts) after the
// library, so each one is in the library, playable at #play=<id>, validated and run through the readability guard.
import type { Course, L10n } from "../../types";
import {
  BASIC_INSTRUMENTS_ID,
  basicInstrumentsCourse,
} from "./basicInstruments";
import { STANDARD_TURN_ID, standardTurnCourse } from "./standardTurn";
import { VOR_DECK_ID, vorInterceptCourse } from "./vorIntercept";
import { ILS_DECK_ID, ilsEndToEndCourse } from "./ilsEndToEnd";
import { LFPN_DECK_ID, lfpnIfrCourse } from "./lfpnIfr";

export {
  BASIC_INSTRUMENTS_ID,
  STANDARD_TURN_ID,
  VOR_DECK_ID,
  ILS_DECK_ID,
  LFPN_DECK_ID,
};

export interface DeckDef {
  id: string;
  build: () => Course;
  blurb: L10n;
}

export const DECKS: readonly DeckDef[] = [
  {
    id: BASIC_INSTRUMENTS_ID,
    build: basicInstrumentsCourse,
    blurb: {
      en: "The six instruments, each one moving, in 10 slides",
      fr: "Les six instruments, chacun en mouvement, en 10 diapos",
    },
  },
  {
    id: STANDARD_TURN_ID,
    build: standardTurnCourse,
    blurb: {
      en: "3° a second, the timed turn, the roll-out lead and the scan",
      fr: "3° par seconde, le virage chronométré, la sortie et le circuit visuel",
    },
  },
  {
    id: VOR_DECK_ID,
    build: vorInterceptCourse,
    blurb: {
      en: "Find your radial, TO / FROM, the 30° intercept, the wind",
      fr: "Trouver son radial, TO / FROM, l’interception à 30°, le vent",
    },
  },
  {
    id: ILS_DECK_ID,
    build: ilsEndToEndCourse,
    blurb: {
      en: "Localizer, glide path, decision altitude, go-around",
      fr: "Localizer, glide, altitude de décision, remise de gaz",
    },
  },
];

/** Decks set at a real airfield (their situations fly in the real navigation data around it: course/realWorld.ts).
 *  Listed in the library after the ready decks; not on the start page's row of ready decks. */
export const AIRFIELD_DECKS: readonly DeckDef[] = [
  {
    id: LFPN_DECK_ID,
    build: lfpnIfrCourse,
    blurb: {
      en: "Toussus-le-Noble: the field, the ILS 25R, the missed approach",
      fr: "Toussus-le-Noble : le terrain, l’ILS 25R, la remise de gaz",
    },
  },
];
