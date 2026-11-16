// Ground school stage — the hand-over of the controls, as the student sees it on a stage (course/handover.ts holds
// the words, the state machine and the keyboard map; this file draws them and drives the StageHost):
//
//   briefed     the « À vous » card over the frozen instrument: what to do, with which control on THIS device, the
//               goal and its tolerance, how it ends; one filled button, « Prendre les commandes ». Touching a control
//               takes the controls too.
//   inControl   « Vous avez les commandes » in the bar, the stage framed, the controls strip lit; the keys of
//               handover.keyAction work wherever the focus is (and never page the course); « Rendre les commandes ».
//   handedBack  frozen; what is still missing, « Prendre les commandes » to go on, « Réessayer » from the start.
//   done        frozen; the result in plain words, « Réessayer », and how the course continues.
//   demo        a Show me clip plays: « Démonstration : regardez », « Prendre les commandes » on the clip bar.
//
// The frame owns one layer. The player (or any host of a StageFrame) hands a step over with frame.setHandover(spec)
// right after frame.show(cue); null (or a step without one) leaves the stage exactly as it was before.
import {
  barePrompt,
  deriveBrief,
  deriveResult,
  detectDevice,
  handoverAnnounce,
  handoverNext,
  hw,
  keyAction,
  type HandoverEvent,
  type HandoverInput,
  type HandoverState,
  type InputDevice,
  type KeyAction,
  type ResultRow,
} from "../handover";
import type { Lang, StageCue } from "../types";
import type { StageControls } from "./controls";
import type { StageHost } from "./host";
import { t } from "./strings";
import "../../styles/course-handover.css";

export interface HandoverSpec {
  /** the step: the same key keeps the state through a re-render or a language switch */
  key: string;
  /** what to do, in one sentence (the step's title, the Your turn's prompt) */
  prompt: string;
  input: HandoverInput;
  /** the live goal rows (the goal tracker's): the result and the hold countdown read them */
  rows?: () => readonly (ResultRow & { check?: number })[];
  /** the author's success sentence */
  success?: string;
  /** a Show me clip exists: play it */
  onShowMe?: () => void;
  /** « Réessayer »: the host starts its goal tracking again (the layer has put the scene back) */
  onRetry?: () => void;
  /** how the course continues, one sentence under the result */
  wayOn?: string;
  /** the goal was met on an earlier visit */
  alreadyMet?: boolean;
}
export interface HandoverLayerParts {
  /** the stage frame (gets data-handover, the frame outline) */
  frame: HTMLElement;
  /** the panes area: the card sits over it */
  view: HTMLElement;
  /** the bar: the state banner goes first, « Rendre les commandes » before `before` */
  bar: HTMLElement;
  before: HTMLElement;
  host: StageHost;
  controls: StageControls;
  /** the top view (dragAircraft): touching it takes the controls */
  plan?: HTMLElement;
  announce(text: string): void;
}

const mk = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
let uid = 0;

export class HandoverLayer {
  private spec: HandoverSpec | null = null;
  private _state: HandoverState = "idle";
  private lang: Lang;
  private device: InputDevice = detectDevice();
  private veil: HTMLDivElement;
  private banner: HTMLSpanElement;
  private bannerText: HTMLElement;
  private bannerTime: HTMLElement;
  private bBack: HTMLButtonElement;
  private takeBtn: HTMLButtonElement | null = null;
  private busy = false;
  private unsub: () => void;
  private held = new Map<string, KeyAction>();
  private listeners = new Set<(s: HandoverState) => void>();
  private id = `ho${++uid}`;
  private ro: ResizeObserver | null = null;

  constructor(
    private p: HandoverLayerParts,
    lang: Lang,
  ) {
    this.lang = lang;
    this.veil = mk("div", "ho-veil");
    this.veil.hidden = true;
    // over the panes and the goal strip, never over the controls (touching one takes the controls)
    p.frame.append(this.veil);
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.place());
      this.ro.observe(p.frame);
    }
    this.banner = mk("span", "ho-state");
    this.banner.hidden = true;
    this.banner.setAttribute("role", "status");
    this.bannerText = mk("b", "");
    this.bannerTime = mk("span", "ho-time num");
    this.banner.append(mk("i", "ho-dot"), this.bannerText, this.bannerTime);
    p.bar.prepend(this.banner);
    this.bBack = mk("button", "cs-btn ho-back");
    this.bBack.type = "button";
    this.bBack.hidden = true;
    this.bBack.addEventListener("click", () => this.handBack());
    // who flies and the way to give the aircraft back sit together, first in the bar
    this.banner.after(this.bBack);
    // touching a control takes the controls (the card says so); the event then reaches the control itself
    const grab = (e: Event) => {
      if (this._state !== "briefed" && this._state !== "handedBack") return;
      if (
        e.type === "keydown" &&
        !/^(Arrow|Enter$| $|Page)/.test((e as KeyboardEvent).key)
      )
        return;
      if ((e.target as HTMLElement | null)?.closest?.(".cs-lockline")) return;
      this.take(false);
    };
    p.controls.el.addEventListener("pointerdown", grab, true);
    p.controls.el.addEventListener("keydown", grab, true);
    p.plan?.addEventListener("pointerdown", grab, true);
    p.plan?.addEventListener("keydown", grab, true);
    this.unsub = p.host.on((e) => {
      if (e.k !== "mode" || this.busy || !this.spec) return;
      // someone else started the aircraft (the clip bar's « Prendre les commandes », a presenter action)
      if (
        e.mode === "live" &&
        (this._state === "briefed" ||
          this._state === "handedBack" ||
          this._state === "demo")
      )
        this.go("take");
    });
    if (typeof document !== "undefined") {
      document.addEventListener("keydown", this.onKey, true);
      document.addEventListener("keyup", this.onKeyUp, true);
    }
  }

  get state(): HandoverState {
    return this._state;
  }
  get active(): boolean {
    return !!this.spec;
  }
  on(fn: (s: HandoverState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  setLang(l: Lang) {
    this.lang = l;
    this.render();
  }

  /** Hand this step over (null: no hand-over on this step). The same key keeps the state and updates the words. */
  set(spec: HandoverSpec | null) {
    if (!spec) return this.clear();
    const same = this.spec?.key === spec.key;
    this.spec = spec;
    this.p.controls.setHandover(true, this.device !== "touch");
    if (!same || this._state === "idle") {
      this._state = handoverNext(this._state, "offer");
      this.settle();
      this.emit(false);
    }
    this.render();
  }
  clear() {
    if (!this.spec && this._state === "idle") return;
    this.spec = null;
    this._state = "idle";
    this.release();
    this.p.controls.setHandover(false);
    this.render();
    this.emit(false);
  }
  /** The frame showed a cue (a new step, a Show me clip, the scene again after the clip). */
  cueChanged(cue: StageCue | null) {
    if (!this.spec) return;
    if (!cue) return this.clear();
    if (cue.mode === "clip") return this.go("showMe");
    // the scene again after the clip: back to the card. The freeze waits one microtask: when this cue belongs to
    // the NEXT step, the host clears or replaces the hand-over first and that step's stage is left alone.
    if (this._state === "demo") this._state = handoverNext(this._state, "demoEnd");
    this.render();
    const key = this.spec.key;
    queueMicrotask(() => {
      if (this.spec?.key === key) this.settle();
    });
  }
  /** The goal's state (the frame's setGoal): met while the student flies = done. */
  goal(met: boolean) {
    if (met && this._state === "inControl") this.go("met");
  }
  /** Twice a second while the stage runs: the hold countdown in the banner. */
  tick() {
    if (this._state !== "inControl" || !this.spec?.rows) return;
    const hold = this.spec.rows().find((r) => r.check === -1);
    const txt =
      hold && !hold.ticked && hold.readout
        ? `${this.lang === "fr" ? "tenu" : "held"} ${hold.readout}`
        : "";
    if (this.bannerTime.textContent !== txt) this.bannerTime.textContent = txt;
    this.bannerTime.hidden = !txt;
  }

  // ---------------- the student's moves
  /** « Prendre les commandes » (or the first touch of a control: then the focus stays where the finger is). */
  take(focus = true, fromKeyboard = false) {
    if (!this.spec) return;
    if (fromKeyboard && this.device !== "keyboard") {
      this.device = "keyboard";
      this.p.controls.setHandover(true, true);
    }
    const was = this._state;
    if (handoverNext(was, "take") !== "inControl") return;
    this.busy = true;
    if (was === "demo") this.p.host.takeOver();
    else if (this.spec.input.clock !== false) this.p.host.live();
    this.busy = false;
    this.go("take");
    if (focus) this.p.controls.focusChosen();
  }
  /** « Rendre les commandes »: the aircraft pauses where it is. */
  handBack() {
    if (this._state !== "inControl") return;
    this.go("handBack");
    this.takeBtn?.focus({ preventScroll: true });
  }
  /** « Réessayer »: the same start, frozen, the card again. */
  retry() {
    if (!this.spec || this._state === "idle" || this._state === "briefed")
      return;
    this.busy = true;
    this.release();
    this.p.host.reset();
    this.busy = false;
    this._state = handoverNext(this._state, "retry");
    this.settle();
    this.spec.onRetry?.();
    this.render();
    this.emit(true);
    this.takeBtn?.focus({ preventScroll: true });
  }
  /** Put the focus on « Prendre les commandes » (the host calls it when the student arrives on the step). */
  focusTake() {
    this.takeBtn?.focus({ preventScroll: true });
  }
  destroy() {
    this.unsub();
    if (typeof document !== "undefined") {
      document.removeEventListener("keydown", this.onKey, true);
      document.removeEventListener("keyup", this.onKeyUp, true);
    }
    this.ro?.disconnect();
    this.veil.remove();
    this.banner.remove();
    this.bBack.remove();
  }

  // ---------------- internals
  private go(e: HandoverEvent) {
    const next = handoverNext(this._state, e);
    if (next === this._state) return;
    this._state = next;
    this.settle();
    this.render();
    this.emit(true);
    if (next === "done")
      this.veil
        .querySelector<HTMLElement>(".ho-title")
        ?.focus({ preventScroll: true });
  }
  /** The aircraft and the clock run only while someone flies. */
  private settle() {
    const s = this._state;
    if (s === "inControl" || s === "demo" || s === "idle") return;
    this.release();
    if (this.p.host.mode === "live") {
      this.busy = true;
      this.p.host.freeze();
      this.busy = false;
    }
  }
  private release() {
    this.held.clear();
    this.p.controls.releaseAll();
  }
  private emit(announce: boolean) {
    if (announce) this.p.announce(handoverAnnounce(this._state, this.lang));
    for (const fn of this.listeners) fn(this._state);
  }

  private onKey = (e: KeyboardEvent) => {
    if (this._state !== "inControl" || !this.spec || !this.p.frame.isConnected)
      return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      el?.isContentEditable
    )
      return;
    // a focused button keeps Enter and Space; the top view keeps its own arrow keys
    if (
      (e.key === "Enter" || e.key === " ") &&
      (tag === "BUTTON" || tag === "A" || tag === "SUMMARY")
    )
      return;
    if (this.p.plan && el && this.p.plan.contains(el) && e.key !== "Escape")
      return;
    const a = keyAction(
      e,
      this.spec.input.controls ?? [],
      this.p.controls.chosen,
    );
    const paging = /^(Arrow|Page)|^ $/.test(e.key);
    if (!a) {
      // while the student flies, the arrow keys never turn the page by accident
      if (paging) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (a.k === "handBack") return this.handBack();
    if (a.k === "hold") this.held.set(e.key, a);
    this.p.controls.act(a, true);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const a = this.held.get(e.key);
    if (!a) return;
    this.held.delete(e.key);
    this.p.controls.act(a, false);
    e.stopPropagation();
  };

  private render() {
    const s = this._state;
    const L = this.lang;
    const spec = this.spec;
    const on = !!spec && s !== "idle";
    this.p.frame.dataset.handover = on ? s : "";
    if (!on) delete this.p.frame.dataset.handover;
    // the bar
    this.banner.hidden = !on;
    this.banner.dataset.s = s;
    this.bannerText.textContent =
      s === "inControl"
        ? hw("youHave", L)
        : s === "demo"
          ? t("demo", L)
          : s === "handedBack"
            ? t("handedBack", L)
            : s === "done"
              ? L === "fr"
                ? "Réussi"
                : "Done"
              : t("waiting", L);
    this.bannerTime.hidden = true;
    this.bannerTime.textContent = "";
    this.bBack.hidden = s !== "inControl";
    this.bBack.textContent = hw("handBack", L);
    this.bBack.setAttribute("aria-keyshortcuts", "Escape");
    // the controls strip: lit while the student has them, still while the result or the clip shows
    const strip = this.p.controls.el;
    strip.classList.toggle("ho-live", s === "inControl");
    strip.toggleAttribute("inert", on && (s === "done" || s === "demo"));
    if (on && s === "inControl") strip.setAttribute("aria-label", hw("youHave", L));
    else strip.removeAttribute("aria-label");
    // the card
    this.takeBtn = null;
    this.veil.replaceChildren();
    const card = on
      ? s === "briefed"
        ? this.briefCard()
        : s === "handedBack" || s === "done"
          ? this.resultCard()
          : null
      : null;
    this.veil.hidden = !card;
    if (card) this.veil.append(card);
    this.place();
    if (card && typeof requestAnimationFrame !== "undefined") requestAnimationFrame(() => this.place());
  }

  /** The card's area: from the top of the panes down to the controls strip. */
  place() {
    if (this.veil.hidden) return;
    const f = this.p.frame;
    const strip = this.p.controls.el;
    const top = this.p.view.offsetTop;
    const bottom =
      !strip.hidden && strip.offsetParent ? Math.max(0, f.clientHeight - strip.offsetTop) : 0;
    this.veil.style.top = `${top}px`;
    this.veil.style.bottom = `${bottom}px`;
  }

  private takeButton(): HTMLButtonElement {
    const b = mk("button", "ho-take", hw("take", this.lang));
    b.type = "button";
    b.addEventListener("click", (e) => this.take(true, e.detail === 0));
    this.takeBtn = b;
    return b;
  }
  private quiet(label: string, run: () => void): HTMLButtonElement {
    const b = mk("button", "ho-btn", label);
    b.type = "button";
    b.addEventListener("click", run);
    return b;
  }
  private shell(
    kicker: string,
    title: string,
  ): { card: HTMLElement; body: HTMLElement; acts: HTMLElement } {
    const card = mk("section", "ho-card");
    card.setAttribute("aria-labelledby", `${this.id}-t`);
    const k = mk("p", "ho-k", kicker);
    const h = mk("h2", "ho-title", title);
    h.id = `${this.id}-t`;
    h.tabIndex = -1;
    const body = mk("div", "ho-body");
    const acts = mk("div", "ho-acts");
    card.append(k, h, body, acts);
    return { card, body, acts };
  }
  private row(
    label: string,
    ...content: (HTMLElement | string)[]
  ): HTMLElement {
    const r = mk("div", "ho-row");
    const d = mk("div", "ho-row-b");
    d.append(...content);
    r.append(mk("span", "ho-row-k", label), d);
    return r;
  }

  private briefCard(): HTMLElement {
    const L = this.lang;
    const fr = L === "fr";
    const spec = this.spec!;
    const b = deriveBrief(
      { ...spec.input, alreadyMet: spec.alreadyMet },
      this.device,
      L,
    );
    const { card, body, acts } = this.shell(
      spec.alreadyMet
        ? `${hw("yourTurn", L)} · ${fr ? "déjà réussi" : "already done"}`
        : hw("yourTurn", L),
      barePrompt(spec.prompt),
    );
    if (b.controls.length) {
      const ul = mk("ul", "ho-ctls");
      // controls used the same way share one line (two knobs: one sentence)
      const groups: (typeof b.controls)[] = [];
      for (const c of b.controls) {
        const g = groups.find((x) => x[0].how === c.how);
        if (g) g.push(c);
        else groups.push([c]);
      }
      for (const g of groups) {
        const li = mk("li", "");
        g.forEach((c, n) => {
          if (n) li.append(document.createTextNode(", "));
          if (c.pick) li.append(mk("kbd", "ho-pick", c.pick));
          li.append(mk("b", "", c.name));
        });
        const how = g[0].how;
        li.append(
          document.createTextNode(
            ` : ${how.charAt(0).toLowerCase()}${how.slice(1)}.`,
          ),
        );
        if (g[0].keys.length && this.device === "mouse") {
          const k = mk("span", "ho-keys", fr ? " Au clavier : " : " Keyboard: ");
          for (const key of g[0].keys) k.append(mk("kbd", "", key));
          li.append(k);
        }
        ul.append(li);
      }
      body.append(
        this.row(
          b.controls.length > 1
            ? fr
              ? "Vos commandes"
              : "Your controls"
            : fr
              ? "Votre commande"
              : "Your control",
          ul,
        ),
      );
      if (b.choose) ul.after(mk("p", "ho-note", b.choose));
    }
    if (b.goals.length) {
      const ul = mk("ul", "ho-goals");
      for (const g of b.goals) {
        const li = mk("li", "");
        // author rows may carry **bold**: shown as plain text here
        li.textContent = g.replace(/\*\*/g, "");
        ul.append(li);
      }
      body.append(this.row(fr ? "Objectif" : "Goal", ul));
    }
    body.append(
      this.row(
        fr ? "Fin" : "It ends",
        mk("p", "", b.ends),
        mk("p", "ho-note", b.stakes),
      ),
    );
    acts.append(this.takeButton());
    if (spec.onShowMe)
      acts.append(this.quiet(hw("showMe", L), () => spec.onShowMe!()));
    acts.append(
      mk("p", "ho-wait", [b.waits, b.held].filter(Boolean).join(" ")),
    );
    return card;
  }

  private resultCard(): HTMLElement {
    const L = this.lang;
    const fr = L === "fr";
    const spec = this.spec!;
    const done = this._state === "done";
    const all = spec.rows?.() ?? [];
    const rows = all.filter((r) => r.check === undefined || r.check >= 0);
    const hold = all.find((r) => r.check === -1);
    const r = deriveResult(rows, done, L, spec.success, hold?.readout);
    const { card, body, acts } = this.shell(
      done ? hw("yourTurn", L) : t("handedBack", L),
      r.title,
    );
    card.classList.add(done ? "ok" : "notyet");
    body.append(mk("p", "ho-why", r.why));
    if (r.missing.length) {
      const ul = mk("ul", "ho-missing");
      for (const m of r.missing) {
        const li = mk("li", "");
        li.append(mk("span", "", m.text.replace(/\*\*/g, "")));
        if (m.readout)
          li.append(
            mk("b", "num", `${fr ? "maintenant" : "now"} ${m.readout}`),
          );
        ul.append(li);
      }
      body.append(ul);
    }
    if (done) {
      acts.append(this.quiet(hw("tryAgain", L), () => this.retry()));
      if (spec.wayOn) acts.append(mk("p", "ho-wait", spec.wayOn));
    } else {
      acts.append(
        this.takeButton(),
        this.quiet(hw("tryAgain", L), () => this.retry()),
      );
      if (spec.onShowMe)
        acts.append(this.quiet(hw("showMe", L), () => spec.onShowMe!()));
      acts.append(
        mk(
          "p",
          "ho-wait",
          fr
            ? "L’avion est en pause là où vous l’avez laissé."
            : "The aircraft is paused where you left it.",
        ),
      );
    }
    return card;
  }
}
