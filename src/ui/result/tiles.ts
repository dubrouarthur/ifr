// Standard tiles: the label and MET / NOT MET in words, the value and unit, the standard in words with % of limit,
// and the tolerance gauge. Ended-early tiles are plain facts ("—", flown, steps, standards graded).
import { h } from "../dom";
import { rt } from "./i18n";
import { gauge } from "./gauge";
import type { Tile } from "./types";

export function tile(t: Tile): HTMLElement {
  const failed = t.verdict === "not-met";
  // met by the time allowance but past the limit: amber "EXCEEDED", never green
  const ex = !failed && !!t.exceeded;
  const word =
    t.kind === "std"
      ? ex
        ? rt("tile.exceeded")
        : t.verdict === "met"
          ? rt("tile.met")
          : failed
            ? rt("tile.notMet")
            : rt("tile.notReached")
      : null;
  const cls = failed ? " f" : ex ? " w" : t.verdict === "met" ? " p" : t.kind === "info" ? " i" : " n";
  return h(
    "div",
    { class: `rs-tile${cls}` },
    h("div", { class: "lbl" }, h("span", {}, t.label), word ? h("b", {}, word) : null),
    h("div", { class: `val${t.value === "—" ? " dash" : ""}` }, t.value, t.unit ? h("small", {}, ` ${t.unit}`) : null),
    h("div", { class: "std", title: t.sub }, t.sub),
    t.gauge ? gauge(t.gauge, failed, ex) : null,
  );
}

export function tiles(list: Tile[]): HTMLElement {
  return h("div", { class: "rs-tiles", style: `--n:${list.length}` }, ...list.map(tile));
}
