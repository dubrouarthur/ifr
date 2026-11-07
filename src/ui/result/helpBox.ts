// Help used: visible, never graded (time, item, what the app did).
import { h } from "../dom";
import { svgIcon, I } from "../icons";
import { mmss, rt } from "./i18n";
import type { HelpUse } from "./types";

export function helpBox(help: HelpUse[]): HTMLElement | null {
  if (!help.length) return null;
  const line = (x: HelpUse) => (x.kind === "setup" ? rt("help.setupLine", { what: x.text }) : x.kind === "ap" ? rt("help.apLine") : x.text);
  return h(
    "section",
    { class: "rs-help", "aria-label": rt("help.title") },
    h("h5", {}, svgIcon(I.help, 14), rt("help.title"), h("span", {}, ` ${rt("help.sub")}`)),
    h("ul", {}, ...help.map((x) => h("li", {}, h("i", {}, mmss(x.t)), h("span", {}, line(x))))),
  );
}
