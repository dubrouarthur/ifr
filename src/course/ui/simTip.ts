// The first tip after « Créer le cours » (academy.html#new → #edit=<id>): one small card beside the editor's
// « Simulateur » tab that says what is in it, with « Voir le panneau Simulateur » and « Plus tard ». It waits for the
// editor to draw its rail (it never imports the editor), shows once per browser, and goes away on Escape,
// on either button, on any other tab of the rail, or when the page leaves the editor.
import type { Lang } from "../types";
import { h } from "../../ui/dom";
import "../../styles/newcourse.css";

const T = (lang: Lang, en: string, fr: string) => (lang === "fr" ? fr : en);
const RAIL = '[data-rail="cockpit"]';
/** shown once on this browser, not on every new course */
const SEEN = "ifr.simTip.v2";

/** Arm the tip: it shows when the editor's « Simulateur » tab appears (within 20 s), then never again for it. */
export function armSimTip(lang: Lang): void {
  if (typeof document === "undefined") return;
  try {
    if (localStorage.getItem(SEEN) === "1") return;
    localStorage.setItem(SEEN, "1");
  } catch {
    /* private window: the tip shows */
  }
  const t0 = Date.now();
  const look = () => {
    const tab = document.querySelector<HTMLElement>(RAIL);
    if (tab && tab.getBoundingClientRect().width > 0) {
      showSimTip(tab, lang);
      return;
    }
    if (Date.now() - t0 < 20000) setTimeout(look, 250);
  };
  setTimeout(look, 400);
}

function showSimTip(tab: HTMLElement, lang: Lang) {
  document.querySelector(".nc-simtip")?.remove();
  const open = h(
    "button",
    { type: "button", class: "nc-btn nc-primary nc-simtip-go" },
    T(lang, "Show the Simulator panel", "Voir le panneau Simulateur"),
  );
  const later = h(
    "button",
    { type: "button", class: "nc-btn nc-simtip-later" },
    T(lang, "Later", "Plus tard"),
  );
  const tip = h(
    "div",
    {
      class: "nc-simtip",
      role: "dialog",
      "aria-modal": "false",
      "aria-labelledby": "nc-simtip-t",
    },
    h("span", { class: "nc-simtip-arrow", "aria-hidden": "true" }),
    h(
      "b",
      { id: "nc-simtip-t" },
      T(lang, "Your slides fly", "Vos diapos volent"),
    ),
    h(
      "p",
      {},
      T(
        lang,
        "In the “Simulator” panel: a live instrument, a “Your turn” with a goal, the view from the cockpit or a whole flight.",
        "Dans le panneau « Simulateur » : un instrument vivant, un « À vous » avec un objectif, la vue du cockpit ou un vol complet.",
      ),
    ),
    h("div", { class: "nc-simtip-acts" }, later, open),
  );
  // low on the slide, in the margin of its words: never over the slide's title (top third); the arrow points at
  // the tab when it can, else the tab's own highlight shows where the panel is
  const arrow = tip.querySelector<HTMLElement>(".nc-simtip-arrow");
  const place = () => {
    const r = tab.getBoundingClientRect();
    if (!r.width) return close();
    const slide = document.querySelector(".ce-canvaswrap")?.getBoundingClientRect();
    const th = tip.offsetHeight || 190;
    const want = Math.round(r.top + r.height / 2 - 44);
    const low = slide && slide.height > 0 ? Math.round(slide.bottom - th - 16) : want;
    const top = Math.max(8, Math.min(innerHeight - th - 8, Math.max(want, low)));
    tip.style.top = `${top}px`;
    tip.style.left = `${Math.round(r.right + 12)}px`;
    const at = r.top + r.height / 2 - top - 6;
    if (arrow) {
      arrow.hidden = at < 12 || at > th - 20;
      arrow.style.top = `${Math.round(at)}px`;
    }
  };
  const hash = location.hash;
  const close = () => {
    tip.remove();
    removeEventListener("resize", place);
    removeEventListener("hashchange", onHash);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("click", onRail, true);
  };
  const onHash = () => {
    if (location.hash.split("&")[0] !== hash.split("&")[0]) close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") close();
  };
  // another tab of the rail: the author went elsewhere, the tip is not needed any more
  const onRail = (e: MouseEvent) => {
    const t = (e.target as HTMLElement | null)?.closest?.("[data-rail]");
    if (t) close();
  };
  open.addEventListener("click", () => {
    close();
    tab.click();
  });
  later.addEventListener("click", close);
  document.body.append(tip);
  place();
  addEventListener("resize", place);
  addEventListener("hashchange", onHash);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("click", onRail, true);
  tab.classList.add("nc-simtip-for");
  setTimeout(() => tab.classList.remove("nc-simtip-for"), 2400);
}
