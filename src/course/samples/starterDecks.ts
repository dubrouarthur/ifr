// The starting templates of a new course (« Nouveau cours », academy.html#new): one per formation, built in
// samples/showcaseDecks.ts so that each slide shows one thing the simulator brings to a lesson. This file keeps the
// note to the author (BlockBase.editorOnly): a small line, shown only while editing, never to a student.
import type { L10n, SlideBlock, SlideCanvas } from "../types";
import type { DeckStarter } from "../ui/deckStarters";
import { T } from "../canvas/layouts";
import { SHOW_NOTES, SHOWCASE_DECKS } from "./showcaseDecks";

/** The notes to the author (kept for callers of the older name). */
export const NOTES = SHOW_NOTES;
/** The note block: bottom right, beside the source line, never shown to a student (player, presenter, projector,
 *  thumbnails, exports, the reader text). */
export function noteBlock(text: L10n, id = "note"): SlideBlock {
  return {
    ...T("small", text, 1224, 960, 576, 88, { id, color: "muted" }),
    editorOnly: true,
  };
}
export function withNote(slide: SlideCanvas, text: L10n): SlideCanvas {
  return { ...slide, blocks: [...slide.blocks, noteBlock(text)] };
}

/** The starting template of each formation, in training order. */
export const FORMATION_DECKS: readonly DeckStarter[] = SHOWCASE_DECKS;
