// A procedure opened from the library: its checklist, as the aircraft's card reads (challenge … response, the memory
// items first and marked, the speeds to hold), with the disclaimer, the reference and what to do next (drill it in
// the simulator, adapt it for the club). DOM only (h()); the library's own dialog shows it.
import { h } from "../ui/dom";
import type { Lang } from "../course/types";
import type { Procedure } from "../train/procedureTypes";
import { splitItem } from "./sources";
import { lt } from "./strings";

export function procedureSheet(
  p: Procedure,
  l: Lang,
  o: { category?: string; disclaimer?: string } = {},
): HTMLElement {
  const mem = p.items.filter((i) => i.memory).length;
  const t = p.targets;
  const targets = [
    t?.iasKt ? `${t.iasKt[0]}–${t.iasKt[1]} KIAS` : "",
    t?.maxBankDeg
      ? l === "fr"
        ? `inclinaison ≤ ${t.maxBankDeg}°`
        : `bank ≤ ${t.maxBankDeg}°`
      : "",
  ].filter(Boolean);
  return h(
    "div",
    { class: `lb-sheet cat-${p.category}` },
    h(
      "div",
      { class: "lb-sheet-top" },
      h("span", { class: "lb-sheet-ac" }, p.aircraft || "C172S"),
      o.category ? h("span", { class: "lb-sheet-cat" }, o.category) : null,
      h("span", { class: "gl-sp" }),
      mem
        ? h(
            "span",
            { class: "lb-sheet-mem" },
            h("i", { "aria-hidden": "true" }),
            lt("memoryN", l, { n: mem }),
          )
        : null,
    ),
    p.summary ? h("p", { class: "lb-sheet-sum" }, p.summary) : null,
    targets.length
      ? h(
          "p",
          { class: "lb-sheet-tg" },
          lt("holdTargets", l, { v: targets.join(" · ") }),
        )
      : null,
    h(
      "ol",
      { class: "lb-sheet-l" },
      ...p.items.map((it, n) => {
        const { c, r } = splitItem(it.text);
        return h(
          "li",
          { class: it.memory ? "mem" : "" },
          h("span", { class: "lb-sheet-n num" }, String(n + 1)),
          h(
            "span",
            { class: "lb-sheet-row" },
            h("span", { class: "lb-sheet-c" }, c),
            r
              ? h("span", { class: "lb-sheet-dots", "aria-hidden": "true" })
              : null,
            r ? h("b", { class: "lb-sheet-r" }, r) : null,
            it.memory
              ? h("span", { class: "lb-sheet-tag" }, lt("memoryShort", l))
              : null,
          ),
          it.note ? h("small", { class: "lb-sheet-note" }, it.note) : null,
        );
      }),
    ),
    h(
      "p",
      { class: "lb-sheet-foot" },
      p.ref
        ? h(
            "span",
            {},
            `${lt("ref", l)} : ${p.ref}`.replace(
              " : ",
              l === "fr" ? " : " : ": ",
            ),
          )
        : null,
      o.disclaimer ? h("span", {}, o.disclaimer) : null,
    ),
  );
}
