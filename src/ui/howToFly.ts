// « Comment piloter » (audit §25, §31): one block that says how to fly on this device, how to pause and how to end.
// Shown on the last page of every briefing, on the start card of every quick flight, and open the first time
// (ifr.howto.seen) — folded after that, one click away.
import { h, store } from "./dom";
import { svgIcon, I } from "./icons";
import { Modal } from "./modals";
import { lang } from "./i18n";

export const HOWTO_SEEN = "ifr.howto.seen";

/** the lines of the block: how to fly (keyboard + mouse, or a finger), how to pause, how to end */
export function howToFlyLines(fr: boolean, touch: boolean): string[] {
  return [
    touch
      ? fr
        ? "Au doigt : glissez le manche, en bas de l’écran ; la manette des gaz est à sa gauche."
        : "With a finger: drag the yoke at the bottom of the screen; the throttle is on its left."
      : fr
        ? "Au clavier : ↓ cabrer (tirer), ↑ piquer (pousser), ← → incliner, + et − pour la puissance. À la souris : glissez le manche, en bas de l’écran."
        : "Keyboard: ↓ nose up (pull), ↑ nose down (push), ← → bank, + and − for power. With the mouse: drag the yoke at the bottom of the screen.",
    touch
      ? fr
        ? "Pause : le bouton ⏸ en haut de l’écran."
        : "Pause: the ⏸ button at the top of the screen."
      : fr
        ? "Pause : Échap, ou le bouton ⏸ en haut de l’écran."
        : "Pause: Esc, or the ⏸ button at the top of the screen.",
    fr
      ? `Pour finir : ${touch ? "touchez" : "cliquez"} le nom du vol en haut, puis « Terminer et débriefer ».`
      : `To finish: ${touch ? "tap" : "click"} the flight’s name at the top, then “End and debrief”.`,
  ];
}

/** the cockpit's own touch flag (main.ts sets body.touch for a finger-first device) */
const isTouch = () =>
  typeof document !== "undefined" && document.body.classList.contains("touch");

/** the block itself; `open` false folds it (a <details> one click away) */
export function howToFlyBlock(
  open = !store.get<boolean>(HOWTO_SEEN, false),
): HTMLElement {
  const fr = lang() === "fr";
  const list = h(
    "ul",
    { class: "htf-list" },
    ...howToFlyLines(fr, isTouch()).map((l) => h("li", {}, l)),
  );
  const d = h(
    "details",
    { class: "htf" },
    h(
      "summary",
      {},
      svgIcon(I.keyboard, 15),
      fr ? "Comment piloter" : "How to fly",
    ),
    list,
  ) as HTMLDetailsElement;
  d.open = open;
  store.set(HOWTO_SEEN, true);
  return d;
}

export interface FlightStartShow {
  title: string;
  /** what this flight is for, in one or two sentences */
  goal: string;
  onStart: () => void;
  onCancel: () => void;
}

/** the minimal briefing of a quick flight (audit §31): goal, « Comment piloter », « Prendre les commandes ».
 *  The aircraft waits, paused; Esc or × take the controls too (nothing is lost), « Annuler » goes back. */
export class FlightStartCard extends Modal {
  private o: FlightStartShow | null = null;
  private done = false;
  constructor() {
    super("Quick flight", "sm");
    this.box.classList.add("fs-start");
    this.onClose = () => {
      if (!this.done) this.o?.onStart();
    };
  }
  show(o: FlightStartShow) {
    this.o = o;
    this.done = false;
    const fr = lang() === "fr";
    const t = fr ? "Vol rapide" : "Quick flight";
    this.box.setAttribute("aria-label", `${t} · ${o.title}`);
    const h2 = this.box.querySelector(":scope > header h2");
    if (h2) h2.textContent = t;
    this.body.replaceChildren(
      h("p", { class: "fs-title" }, h("b", {}, o.title)),
      h(
        "p",
        { class: "fs-goal" },
        h("span", { class: "fs-k" }, fr ? "Le but" : "The goal"),
        o.goal,
      ),
      howToFlyBlock(),
    );
    const go = (fn: () => void) => () => {
      this.done = true;
      this.close();
      fn();
    };
    this.foot.replaceChildren(
      h(
        "button",
        { class: "btn ghost", type: "button", onclick: go(o.onCancel) },
        fr ? "Annuler" : "Cancel",
      ),
      h(
        "button",
        {
          class: "btn primary",
          type: "button",
          "data-autofocus": "",
          onclick: go(o.onStart),
        },
        svgIcon(I.play, 15),
        fr ? "Prendre les commandes" : "Take the controls",
      ),
    );
    this.open();
  }
}
