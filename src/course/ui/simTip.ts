// The first tips after « Créer le cours » (academy.html#new → #edit=<id>), in two quiet steps:
//   1. on entry, one small line over the slide's top margin: « Double-cliquez un texte pour l’écrire » (the first thing
//      to do is write the course, not explore the panels);
//   2. after the author's first edit, one small card beside the rail's « Simulateur » tab, placed where it covers no
//      text of the slide: « Vos diapos volent » with a text link « Essayer » (opens the panel) and a close button.
// Each goes away on Escape, on its close button, on the first click on the slide, on any other tab of the rail,
// when another popover opens (inspector.ts POP_OPEN) or when the page leaves the editor. Shown once per browser; it
// waits for the editor to draw (it never imports the editor).
import type { Lang } from "../types";
import { h } from "../../ui/dom";
import "../../styles/newcourse.css";

const T = (lang: Lang, en: string, fr: string) => (lang === "fr" ? fr : en);
const RAIL = '[data-rail="cockpit"]';
const SLIDE = ".ce-canvaswrap";
/** shown once on this browser, not on every new course */
const SEEN = "ifr.simTip.v2";
/** the event the editor's popovers send when they open (inspector.ts POP_OPEN) */
const POP_OPEN = "ce-popopen";

type Box = { left: number; top: number; right: number; bottom: number };
const hits = (a: Box, b: Box) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * Where a w × h card beside the rail tab goes: its left edge at `left`, its top as near the tab's centre as it can be
 * while covering none of `avoid` (the slide's words). Tries every 8 px, nearest first; null when no place is clear.
 */
export function clearTop(
  tab: { top: number; bottom: number },
  w: number,
  hgt: number,
  left: number,
  avoid: Box[],
  bounds: { top: number; bottom: number },
): number | null {
  const want = Math.round((tab.top + tab.bottom) / 2 - hgt / 2);
  const ok = (top: number) =>
    top >= bounds.top &&
    top + hgt <= bounds.bottom &&
    !avoid.some((b) =>
      hits({ left, top, right: left + w, bottom: top + hgt }, b),
    );
  for (let d = 0; d < 1200; d += 8) {
    if (ok(want + d)) return want + d;
    if (d && ok(want - d)) return want - d;
  }
  return null;
}

/** the margin kept between the card and the slide's words (px) */
const GAP = 16;
/**
 * Where the card goes: beside the tab (clearTop), else further right in 40 px steps, still clear of the words; null
 * when no place is clear at all. Pure.
 */
export function clearSpot(
  tab: { top: number; bottom: number },
  w: number,
  hgt: number,
  left: number,
  avoid: Box[],
  bounds: { top: number; bottom: number },
  maxRight: number,
): { left: number; top: number } | null {
  for (let x = left; x + w <= maxRight; x += 40) {
    const top = clearTop(tab, w, hgt, x, avoid, bounds);
    if (top !== null) return { left: x, top };
  }
  return null;
}

/** Arm the tips: they show when the editor's slide and « Simulateur » tab appear (within 20 s), then never again. */
export function armSimTip(lang: Lang): void {
  if (typeof document === "undefined") return;
  try {
    if (localStorage.getItem(SEEN) === "1") return;
    localStorage.setItem(SEEN, "1");
  } catch {
    /* private window: the tips show */
  }
  const t0 = Date.now();
  const look = () => {
    const tab = document.querySelector<HTMLElement>(RAIL);
    const slide = document.querySelector<HTMLElement>(SLIDE);
    if (
      tab &&
      slide &&
      tab.getBoundingClientRect().width > 0 &&
      slide.getBoundingClientRect().width > 0
    ) {
      start(lang);
      return;
    }
    if (Date.now() - t0 < 20000) setTimeout(look, 250);
  };
  setTimeout(look, 400);
}

/** a field the author is typing in (the slide's inline text is a textarea over the canvas) */
export function writing(t: EventTarget | Element | null): boolean {
  const e = t as HTMLElement | null;
  if (!e || !e.tagName) return false;
  return (
    e.tagName === "TEXTAREA" ||
    (e.tagName === "INPUT" &&
      !/^(button|checkbox|radio|range|submit)$/.test(
        (e as HTMLInputElement).type,
      )) ||
    e.isContentEditable === true
  );
}

/** the shared ways a tip goes away; returns its close */
function dismissible(
  el: HTMLElement,
  place: () => void,
  onClose?: () => void,
): () => void {
  const hash = location.hash;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    el.remove();
    removeEventListener("resize", place);
    removeEventListener("hashchange", onHash);
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener(POP_OPEN, close);
    onClose?.();
  };
  const onHash = () => {
    if (location.hash.split("&")[0] !== hash.split("&")[0]) close();
  };
  // Escape inside a text being written belongs to that text (it ends the writing), not to the tip
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !writing(e.target)) close();
  };
  // the first click on the slide, or on another tab of the rail: the author is at work, the tip is not needed
  const onDown = (e: PointerEvent) => {
    const t = e.target as HTMLElement | null;
    if (!t || el.contains(t)) return;
    if (t.closest?.(SLIDE) || t.closest?.("[data-rail]")) close();
  };
  addEventListener("resize", place);
  addEventListener("hashchange", onHash);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener(POP_OPEN, close);
  return close;
}

function closeButton(lang: Lang, onClick: () => void): HTMLButtonElement {
  const x = h(
    "button",
    {
      type: "button",
      class: "nc-tip-x",
      "aria-label": T(lang, "Close the tip", "Fermer le conseil"),
    },
    "×",
  ) as HTMLButtonElement;
  x.addEventListener("click", onClick);
  return x;
}

function start(lang: Lang) {
  document.querySelector(".nc-edithint")?.remove();
  document.querySelector(".nc-simtip")?.remove();
  // ---- 1. how to write: over the slide's top margin (the layouts keep it empty)
  const touch =
    typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  const hint = h(
    "div",
    { class: "nc-edithint", role: "status" },
    h(
      "span",
      {},
      touch
        ? T(
            lang,
            "Double-tap a text to write it",
            "Touchez deux fois un texte pour l’écrire",
          )
        : T(
            lang,
            "Double-click a text to write it",
            "Double-cliquez un texte pour l’écrire",
          ),
    ),
  );
  const placeHint = () => {
    const s = document.querySelector(SLIDE)?.getBoundingClientRect();
    if (!s || !s.width) return closeHint();
    hint.style.left = `${Math.round(s.left + s.width / 2)}px`;
    hint.style.top = `${Math.round(Math.max(64, s.top + 6))}px`;
  };
  const closeHint = dismissible(hint, placeHint);
  hint.append(closeButton(lang, closeHint));
  document.body.append(hint);
  placeHint();
  // ---- 2. the Simulateur panel, once the author has made a first change
  let armed = true;
  const onEdit = (e: Event) => {
    const t = e.target as HTMLElement | null;
    // any typing in the editor (the slide's inline text is a textarea over the canvas, outside .ce-app)
    if (!armed || !t || t.closest?.(".nc-simtip, .nc-edithint")) return;
    armed = false;
    document.removeEventListener("input", onEdit, true);
    // when the author has finished writing (the text closed) and paused, not under their fingers
    let idle = 0;
    const wait = () => {
      clearTimeout(idle);
      idle = window.setTimeout(() => {
        if (writing(document.activeElement)) return wait();
        document.removeEventListener("input", wait, true);
        if (location.hash.split("&")[0] === hash.split("&")[0])
          showSimTip(lang);
      }, 1200);
    };
    document.addEventListener("input", wait, true);
    wait();
  };
  document.addEventListener("input", onEdit, true);
  // leaving the editor before any edit: nothing more
  const hash = location.hash;
  const off = () => {
    if (location.hash.split("&")[0] === hash.split("&")[0]) return;
    armed = false;
    document.removeEventListener("input", onEdit, true);
    removeEventListener("hashchange", off);
  };
  addEventListener("hashchange", off);
}

function showSimTip(lang: Lang) {
  const tab = document.querySelector<HTMLElement>(RAIL);
  if (!tab || !tab.getBoundingClientRect().width) return;
  // a panel of the rail is already open (« Simulateur », or « Modèles » with its ICAO field): the tip would cover it
  if (
    document.querySelector(
      '[data-rail].on, [data-rail][aria-pressed="true"], [data-rail][aria-expanded="true"]',
    )
  )
    return;
  document.querySelector(".nc-simtip")?.remove();
  const go = h(
    "button",
    { type: "button", class: "nc-tip-link" },
    T(lang, "Try it", "Essayer"),
    h("span", { "aria-hidden": "true" }, " ›"),
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
        "In “Simulator”: a live instrument, a “Your turn”, the view from the cockpit.",
        "Dans « Simulateur » : un instrument vivant, un « À vous », la vue du cockpit.",
      ),
    ),
    go,
  );
  const arrow = tip.querySelector<HTMLElement>(".nc-simtip-arrow");
  const place = () => {
    const r = tab.getBoundingClientRect();
    if (!r.width) return close();
    const w = tip.offsetWidth || 260;
    const th = tip.offsetHeight || 110;
    const left = Math.round(r.right + 12);
    // the slide's words, as drawn, with a breathing margin: the card never covers one, nor touches it
    const words = [
      ...document.querySelectorAll<HTMLElement>(
        `${SLIDE} .sl-text, ${SLIDE} .sl-callout, ${SLIDE} .sl-quiz, ${SLIDE} .sl-checklist`,
      ),
    ]
      .map((e) => e.getBoundingClientRect())
      .filter((b) => b.width > 0 && b.height > 0)
      .map((b) => ({ left: b.left - GAP, top: b.top - GAP, right: b.right + GAP, bottom: b.bottom + GAP }));
    const bounds = { top: 64, bottom: innerHeight - 8 };
    const spot = clearSpot(r, w, th, left, words, bounds, innerWidth - 8);
    const top =
      spot?.top ??
      Math.max(
        8,
        Math.min(
          innerHeight - th - 8,
          Math.round(r.top + r.height / 2 - th / 2),
        ),
      );
    const x = spot?.left ?? left;
    tip.style.top = `${top}px`;
    tip.style.left = `${x}px`;
    const at = r.top + r.height / 2 - top - 6;
    if (arrow) {
      // the arrow points at the tab only when the card sits right beside it
      arrow.hidden = x !== left || at < 12 || at > th - 20;
      arrow.style.top = `${Math.round(at)}px`;
    }
  };
  const close = dismissible(tip, place, () =>
    tab.classList.remove("nc-simtip-for"),
  );
  tip.append(closeButton(lang, close));
  go.addEventListener("click", () => {
    close();
    tab.click();
  });
  document.body.append(tip);
  place();
  // the slide's texts fit themselves once the web font is in: place the card again on what is finally drawn
  (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready.then(() => tip.isConnected && place());
  setTimeout(() => tip.isConnected && place(), 700);
  tab.classList.add("nc-simtip-for");
  setTimeout(() => tab.classList.remove("nc-simtip-for"), 2400);
}
