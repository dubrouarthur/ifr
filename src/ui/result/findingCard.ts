// A finding: the pin, the title and where line, then Standard · What happened · Why it matters · Next time, and the
// actions (Replay from …, Fly it again). The same four rows everywhere (result, debrief moment card, print).
import { h } from "../dom";
import { svgIcon, I } from "../icons";
import { mmss, rt } from "./i18n";
import type { Finding } from "./types";

export interface FindingActions {
  onReplay?: (f: Finding) => void;
  onAgain?: (f: Finding) => void;
  onDrill?: (f: Finding) => void;
}

export function findingCard(f: Finding, act: FindingActions, compact = false): HTMLElement {
  const watch = f.group === "watch";
  const rows: [string, Node | string][] = [[rt("f.standard"), h("span", {}, h("span", { class: "rs-mono" }, f.stdChip), " ", f.stdText)]];
  if (!compact || !watch) rows.push([rt("f.what"), f.whatHappened]);
  if (!watch) rows.push([rt("f.why"), f.why]);
  rows.push([rt("f.next"), f.next]);
  const acts: HTMLElement[] = [];
  if (act.onReplay && !watch) acts.push(h("button", { class: "rs-btn sm", onclick: () => act.onReplay!(f) }, svgIcon(I.play, 13), rt("f.replay", { t: mmss(Math.max(0, f.t0 - 5)) })));
  if (act.onDrill && f.skill === "entry") acts.push(h("button", { class: "rs-btn sm", onclick: () => act.onDrill!(f) }, svgIcon(I.target, 14), rt("f.drill")));
  if (act.onAgain && !watch) acts.push(h("button", { class: "rs-btn sm", onclick: () => act.onAgain!(f) }, svgIcon(I.restart, 14), rt("f.again")));
  return h(
    "article",
    { class: `rs-find${watch ? " w" : ""}`, id: `rs-f${f.n}`, "data-n": f.n },
    h("span", { class: `n${watch ? " w" : ""}`, "aria-label": `${f.n}` }, String(f.n)),
    h(
      "div",
      { class: "fb" },
      h("h3", {}, f.title),
      h("div", { class: "where" }, h("b", {}, f.t1 - f.t0 >= 2 ? `${mmss(f.t0)} – ${mmss(f.t1)}` : mmss(f.tWorst)), f.where ? ` · ${f.where}` : ""),
      h("dl", {}, ...rows.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])),
      acts.length ? h("div", { class: "acts" }, ...acts) : null,
    ),
  );
}
