// Verdict chip (words + a shape, never colour alone), the standards segment bar and the help chips.
import { h } from "../dom";
import { svgIcon, I } from "../icons";
import { mmss, rt } from "./i18n";
import type { HelpUse, Outcome, StandardResult } from "./types";

/** the verdict in one word (UX logic §7): « Réussi » · « Presque » (one standard short) · « À retravailler » */
export function verdictChip(o: Outcome, almost = false): HTMLElement {
  const cls = o === "met" ? "pass" : o === "not-met" ? (almost ? "almost fail" : "fail") : "none";
  const key = o === "met" ? "v.met" : o === "not-met" ? (almost ? "v.almost" : "v.notMet") : "v.ungraded";
  return h("span", { class: `rs-verdict ${cls}` }, h("i", { "aria-hidden": "true" }), rt(key));
}

export function stdBar(stds: StandardResult[]): HTMLElement {
  const graded = stds.filter((s) => s.verdict !== "not-reached");
  const met = graded.filter((s) => s.verdict === "met").length;
  return h(
    "span",
    { class: "rs-stdbar", role: "img", "aria-label": rt("std.count", { k: met, n: graded.length }) },
    ...graded.map((s) => h("i", { class: s.verdict === "not-met" ? "f" : s.exceeded ? "w" : "" })),
  );
}

/** "Set up with help · 2", "1 hint at 2:31", "Autopilot from 4:10": the time is when the help was first used, never a duration */
export function helpChips(help: HelpUse[]): HTMLElement[] {
  const out: HTMLElement[] = [];
  const chip = (txt: string) => h("span", { class: "rs-chip help" }, svgIcon(I.help, 13), txt);
  const setup = help.filter((x) => x.kind === "setup");
  if (setup.length) out.push(chip(rt("help.setup", { n: setup.length })));
  const hints = help.filter((x) => x.kind === "hint");
  if (hints.length === 1) out.push(chip(rt("help.hint", { n: 1, t: mmss(hints[0].t) })));
  else if (hints.length > 1) out.push(chip(rt("help.hints", { n: hints.length })));
  const cues = help.filter((x) => x.kind === "cue");
  if (cues.length) out.push(chip(rt("help.cue", { n: cues.length, t: mmss(cues[0].t) })));
  const ap = help.find((x) => x.kind === "ap");
  if (ap) out.push(chip(rt("help.ap", { t: mmss(ap.t) })));
  return out;
}
