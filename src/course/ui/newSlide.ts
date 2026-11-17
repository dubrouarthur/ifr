// « Ajouter » in the editor's strip (AUDIT item 48): the new slide only stays once the author picks what it shows
// (a ready slide, a layout, « Partir d'une diapo vide »); Échap, « Annuler » or picking another slide takes it
// away with nothing to undo. Once a choice is made, the toast says where the slide went.
import type { Lang, SlideCanvas } from "../types";

/** A slide with nothing on it yet (no block, no background picture). */
export function slideIsBare(c: SlideCanvas | undefined): boolean {
  return !!c && !c.blocks.length && !c.background?.image;
}

/** Where a slide just added at `at` (0-based) sits in a course of `total` slides, said in words. */
export function addedWhere(lang: Lang, at: number, total: number): string {
  const fr = lang === "fr";
  if (total <= 1 || at <= 0) return fr ? "Ajoutée en première diapo" : "Added as the first slide";
  if (at >= total - 1) return fr ? `Ajoutée à la fin, diapo ${at + 1}` : `Added at the end, slide ${at + 1}`;
  return fr ? `Ajoutée après la diapo ${at}` : `Added after slide ${at}`;
}
