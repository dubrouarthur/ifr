// The first tip after « Créer le cours » (academy.html#new → #edit=<id>): one small card beside the editor's
// « Simulateur » tab that says what is in it, with « Ouvrir le simulateur » and « Plus tard ». It waits for the
// editor to draw its rail (it never imports the editor), shows once per created course, and goes away on Escape,
// on either button, on any other tab of the rail, or when the page leaves the editor.
import type { Lang } from "../types";
import { h } from "../../ui/dom";
import "../../styles/newcourse.css";

const T = (lang: Lang, en: string, fr: string) => (lang === "fr" ? fr : en);
const RAIL = '[data-rail="cockpit"]';

/** Arm the tip: it shows when the editor's « Simulateur » tab appears (within 20 s), then never again for it. */
export function armSimTip(lang: Lang): void {
  if (typeof document === "undefined") return;
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
    T(lang, "Open the simulator", "Ouvrir le simulateur"),
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
        "Put the aircraft on a slide: a live instrument, a « Your turn » with a goal, the view from the cockpit or a whole flight.",
        "Mettez l’avion sur une diapo : un instrument vivant, un « À vous » avec un objectif, la vue du cockpit ou un vol complet.",
      ),
    ),
    h("div", { class: "nc-simtip-acts" }, later, open),
  );
  const place = () => {
    const r = tab.getBoundingClientRect();
    if (!r.width) return close();
    tip.style.top = `${Math.max(8, Math.round(r.top + r.height / 2 - 44))}px`;
    tip.style.left = `${Math.round(r.right + 12)}px`;
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
