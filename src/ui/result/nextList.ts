// Practise next: the why line, then at most 3 ranked rows, the first one primary.
import { h } from "../dom";
import { svgIcon, I } from "../icons";
import type { NextItem, NextPlan } from "./types";

const ICON: Record<NextItem["kind"], [string, string]> = {
  resume: ["fly", I.play],
  restart: ["fly", I.restart],
  retry: ["fly", I.restart],
  "next-lesson": ["fly", I.play],
  brief: ["course", I.learn],
  lesson: ["course", I.learn],
  drill: ["drill", I.target],
};

/** `footer`: the row the sheet's footer primary already runs: its button here is a plain one (one primary per
 *  screen) */
export function nextList(plan: NextPlan, title: string, run: (it: NextItem) => void, footer?: NextItem): HTMLElement {
  return h(
    "section",
    { class: "rs-panel rs-pn" },
    h("h4", {}, title),
    plan.why.lead || plan.why.text ? h("div", { class: "why" }, h("b", {}, plan.why.lead), " ", plan.why.text) : null,
    ...plan.items.map((it) => {
      const [cls, ic] = ICON[it.kind];
      return h(
        "div",
        { class: "pn-row" },
        h("span", { class: `ic ${cls}`, "aria-hidden": "true" }, svgIcon(ic, 17)),
        h("div", { class: "tx" }, h("b", {}, it.label), h("span", {}, it.sub)),
        h("button", { class: `rs-btn${it.primary && it !== footer ? " primary" : ""}`, "aria-label": `${it.action}: ${it.label}`, onclick: () => run(it) }, it.action),
      );
    }),
  );
}
