// Ground school stage — StageFrame: the whole dark stage of the player (mockup final/player.png):
//   bar      state chip (LIVE / FROZEN / CLIP / COCKPIT), the scene line, Reset, Freeze / Resume, Plan view
//   view     side column (numbered callout notes as the linked bubble, the plan inset) + the panes
//   clip     play / pause, scrubber, caption, Take over (Watch steps)
//   goal     the assist label ("Altitude and speed held for you"), the goal, its meter, "Next is always open"
//   controls the student's knobs and pads, locked chips
// The player (package E) mounts it beside the reader and feeds the goal strip from its GoalTracker.
import type { Sim } from "../../sim/sim";
import type { CalcStageHint, Lang, StageCue } from "../types";
import {
  StageHost,
  type StageCueOptions,
  type StageEnv,
  type StageEvent,
  type StageLoop,
  type StageMode,
} from "./host";
import { PlanInset } from "./planInset";
import { StageControls } from "./controls";
import { sceneLine } from "./views";
import { bubbleText, type CalloutNote } from "./overlay";
import { t } from "./strings";
import type { SceneDiff } from "../scene";

const ICON = {
  reset: "M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4",
  pause: "M9 5v14M15 5v14",
  play: "M8 5l11 7-11 7z",
  plan: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14",
  assist: "M12 3v4M12 17v4M4 12h4M16 12h4M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6",
  hand: "M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.2-2.3L3.5 14a1.5 1.5 0 0 1 2.4-1.8L8 14.5",
};
function icon(d: string): SVGSVGElement {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", "i");
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  s.append(p);
  return s;
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
function button(cls: string, label: string, ico?: string): HTMLButtonElement {
  const b = mk("button", `cs-btn ${cls}`);
  b.type = "button";
  if (ico) b.append(icon(ico));
  b.append(document.createTextNode(label));
  return b;
}

export interface GoalStrip {
  /** "bar within 1 dot, TO, for 10 s" */
  text: string;
  /** 0..1 */
  progress?: number;
  met?: boolean;
  /** right-hand note (default "Next is always open") */
  note?: string;
}
export interface StageFrameOptions {
  lang?: Lang;
  theme?: "dark" | "light";
  sim?: Sim;
  loop?: StageLoop;
  /** projector: bigger type, no controls bar */
  projector?: boolean;
}

export class StageFrame {
  readonly el: HTMLDivElement;
  readonly host: StageHost;
  readonly plan: PlanInset;
  readonly controls: StageControls;
  private lang: Lang;
  private chip: HTMLSpanElement;
  private scn: HTMLSpanElement;
  private scnExtra: HTMLElement;
  private bReset: HTMLButtonElement;
  private bFreeze: HTMLButtonElement;
  private bPlan: HTMLButtonElement;
  private side: HTMLDivElement;
  private notesEl: HTMLDivElement;
  private planWrap: HTMLDivElement;
  private clipBar: HTMLDivElement;
  private clipPlay: HTMLButtonElement;
  private clipRange: HTMLInputElement;
  private clipCap: HTMLSpanElement;
  private clipTake: HTMLButtonElement;
  private goal: HTMLDivElement;
  private goalAssist: HTMLSpanElement;
  private goalText: HTMLSpanElement;
  private goalMeter: HTMLElement;
  private goalNote: HTMLSpanElement;
  private live: HTMLDivElement;
  private planOn = true;
  private planAvailable = false;
  private goalState: GoalStrip | null = null;
  private lineT = 0;
  private unsub: () => void;
  private projector: boolean;

  constructor(o: StageFrameOptions = {}) {
    this.lang = o.lang ?? "en";
    this.projector = !!o.projector;
    this.host = new StageHost({
      lang: this.lang,
      theme: o.theme,
      sim: o.sim,
      loop: o.loop,
    });
    this.el = mk("div", `cstage${o.projector ? " projector" : ""}`);
    this.el.setAttribute("role", "region");
    this.el.setAttribute("aria-label", t("stage", this.lang));
    // bar
    const bar = mk("div", "cs-bar");
    this.chip = mk("span", "cs-state");
    this.scn = mk("span", "cs-scn");
    this.scnExtra = mk("em", "x");
    const sp = mk("div", "sp");
    this.bReset = button("", t("reset", this.lang), ICON.reset);
    this.bFreeze = button("", t("freeze", this.lang), ICON.pause);
    this.bPlan = button("", t("plan", this.lang));
    bar.append(this.chip, this.scn, sp, this.bReset, this.bFreeze, this.bPlan);
    this.bReset.addEventListener("click", () => this.host.reset());
    this.bFreeze.addEventListener("click", () => this.host.toggleFreeze());
    this.bPlan.addEventListener("click", () => {
      this.planOn = !this.planOn;
      this.syncSide();
    });
    // view
    const view = mk("div", "cs-view");
    this.side = mk("div", "cs-side");
    this.notesEl = mk("div", "cs-notes");
    this.planWrap = mk("div", "cs-planwrap");
    this.plan = new PlanInset({
      lang: this.lang,
      onDrag: (p, phase) => this.host.dragAircraftTo(p, phase),
    });
    this.planWrap.append(this.plan.el);
    this.side.append(this.notesEl, this.planWrap);
    view.append(this.side, this.host.el);
    // clip strip
    this.clipBar = mk("div", "cs-clip");
    this.clipPlay = button("icon", "", ICON.play);
    this.clipPlay.setAttribute("aria-label", t("play", this.lang));
    this.clipRange = mk("input", "cs-range");
    this.clipRange.type = "range";
    this.clipRange.min = "0";
    this.clipRange.max = "1000";
    this.clipRange.value = "0";
    this.clipRange.setAttribute("aria-label", "Clip");
    this.clipCap = mk("span", "cap");
    this.clipTake = button("accent", t("takeOver", this.lang), ICON.hand);
    this.clipBar.append(
      this.clipPlay,
      this.clipRange,
      this.clipCap,
      this.clipTake,
    );
    this.clipBar.hidden = true;
    this.clipPlay.addEventListener("click", () => this.host.toggleClip());
    this.clipRange.addEventListener("input", () => {
      const c = this.host.clipPlayer;
      if (c) this.host.seekClip((Number(this.clipRange.value) / 1000) * c.durS);
    });
    this.clipTake.addEventListener("click", () => this.host.takeOver());
    // goal strip
    this.goal = mk("div", "cs-goal");
    this.goalAssist = mk("span", "cs-assist");
    this.goalText = mk("span", "txt");
    const gsp = mk("div", "sp");
    const meter = mk("div", "cs-meter");
    this.goalMeter = mk("i", "");
    meter.append(this.goalMeter);
    // the reader's "Do this" checklist is the one statement of the goal: the strip shows its progress only (the
    // goal's words stay the meter's accessible name; the projector, with no reader, still prints them)
    meter.setAttribute("role", "progressbar");
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    this.goalNote = mk("span", "note");
    this.goal.append(this.goalAssist, this.goalText, gsp, meter, this.goalNote);
    // controls
    this.controls = new StageControls({
      sim: () => this.host.sim,
      assist: this.host.assist,
      lang: this.lang,
      changed: (id) => this.host.controlChanged(id),
    });
    // a11y live region ("Heading 120: done")
    this.live = mk("div", "cs-sr");
    this.live.setAttribute("aria-live", "polite");
    this.el.append(
      bar,
      view,
      this.clipBar,
      this.goal,
      this.controls.el,
      this.live,
    );
    this.host.attachPlan(this.plan);
    this.unsub = this.host.on((e) => this.onEvent(e));
    this.el.addEventListener("keydown", (e) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select"))
        return;
      if (this.controls.handleKey(e, true)) e.preventDefault();
    });
    this.el.addEventListener("keyup", (e) => {
      if (this.controls.handleKey(e, false)) e.preventDefault();
    });
    this.el.tabIndex = -1;
    this.syncChrome();
  }

  get sim(): Sim {
    return this.host.sim;
  }
  get mode(): StageMode {
    return this.host.mode;
  }
  on(fn: (e: StageEvent) => void): () => void {
    return this.host.on(fn);
  }

  /** Show a step's stage. */
  show(
    cue: StageCue | null,
    env: StageEnv,
    o: StageCueOptions = {},
  ): SceneDiff[] {
    const diffs = this.host.setCue(cue, env, o);
    this.afterCue(cue);
    return diffs;
  }
  /** Show a calc step's stage hint. */
  showHint(
    hint: CalcStageHint,
    env: StageEnv,
    o: StageCueOptions = {},
  ): SceneDiff[] {
    const diffs = this.host.setHint(hint, env, o);
    this.afterCue(this.host.currentCue);
    return diffs;
  }
  private afterCue(cue: StageCue | null) {
    this.planAvailable =
      !!cue &&
      (cue.inset === "plan" || !!cue.controls?.includes("dragAircraft"));
    this.planOn = this.planAvailable;
    this.controls.set(this.projector ? [] : (cue?.controls ?? []));
    this.goalState = null;
    this.syncChrome();
  }
  /** The goal strip (the player's GoalTracker state); null hides the goal text. */
  setGoal(g: GoalStrip | null) {
    this.goalState = g;
    this.syncGoal();
  }
  /** Announce a change to screen readers ("Heading 120: done"). */
  announce(text: string) {
    this.live.textContent = "";
    // a new node each time so the same text is announced again
    window.setTimeout(() => (this.live.textContent = text), 30);
  }
  setLang(l: Lang) {
    this.lang = l;
    this.host.setLang(l);
    this.plan.setLang(l);
    this.controls.setLang(l);
    this.el.setAttribute("aria-label", t("stage", l));
    this.bReset.lastChild!.textContent = t("reset", l);
    this.bPlan.textContent = t("plan", l);
    this.clipTake.lastChild!.textContent = t("takeOver", l);
    this.syncChrome();
    this.syncGoal();
  }
  /** Keyboard shortcuts for the whole page (the player forwards keys when the stage is not focused). */
  handleKey(e: KeyboardEvent, down: boolean): boolean {
    return this.controls.handleKey(e, down);
  }
  destroy() {
    this.unsub();
    this.controls.destroy();
    this.host.destroy();
    this.el.remove();
  }

  // ---------------- internals
  private onEvent(e: StageEvent) {
    if (e.k === "mode" || e.k === "scene") this.syncChrome();
    if (e.k === "frame") {
      this.lineT += e.dt;
      if (e.dt === 0 || this.lineT > 0.5) {
        this.lineT = 0;
        this.syncLine();
        this.controls.refresh();
      }
      this.syncClip();
    }
    if (e.k === "control" || e.k === "drag") {
      this.syncLine();
      this.controls.refresh();
    }
    if (e.k === "clipCue" && e.text) this.clipCap.textContent = e.text;
  }
  private syncChrome() {
    const m = this.host.mode;
    const L = this.lang;
    const cue = this.host.currentCue;
    this.chip.className = `cs-state ${m}`;
    this.chip.textContent =
      m === "live"
        ? t("live", L)
        : m === "clip"
          ? t("clip", L)
          : m === "fly"
            ? t("cockpit", L)
            : t("frozen", L);
    const canRun =
      !!cue &&
      cue.mode !== "fly" &&
      (cue.mode === "live" ||
        cue.mode === "clip" ||
        !!cue.liveForS ||
        !!cue.controls?.length);
    this.bFreeze.hidden = !canRun || this.projector;
    this.bFreeze.replaceChildren(
      icon(m === "live" ? ICON.pause : ICON.play),
      document.createTextNode(m === "live" ? t("freeze", L) : t("resume", L)),
    );
    this.bReset.hidden = !cue?.scene && !this.host.currentScene;
    this.bPlan.hidden = !this.planAvailable;
    this.bPlan.classList.toggle("on", this.planOn);
    this.bPlan.setAttribute("aria-pressed", String(this.planOn));
    this.clipBar.hidden = m !== "clip" && !this.host.clipPlayer;
    this.controls.el.hidden = this.controls.controls.length === 0;
    this.syncSide();
    this.syncLine();
    this.syncGoal();
  }
  private syncSide() {
    const notes: CalloutNote[] = this.host.paneList.flatMap((p) =>
      p.overlay.notes(),
    );
    this.notesEl.replaceChildren();
    for (const n of notes.slice(0, 4)) {
      const b = mk(
        "div",
        `cs-bubble side${n.on || notes.length === 1 ? " on" : ""}`,
      );
      b.dataset.ann = n.id;
      if (notes.length > 1) b.append(mk("span", "cs-cnum inline", String(n.n)));
      const tx = mk("span", "tx");
      tx.append(bubbleText(n.text));
      b.append(tx);
      this.notesEl.append(b);
    }
    this.notesEl.hidden = notes.length === 0;
    this.planWrap.hidden = !(this.planAvailable && this.planOn);
    this.side.hidden = this.notesEl.hidden && this.planWrap.hidden;
    this.el.classList.toggle("noside", this.side.hidden);
    this.host.layout();
  }
  private syncLine() {
    if (!this.host.currentScene && !this.host.currentCue?.scene) {
      this.scn.textContent = "";
      return;
    }
    const l = sceneLine(this.host.sim, this.lang);
    this.scn.textContent = l.main;
    if (l.extra) {
      this.scnExtra.textContent = ` · ${l.extra}`;
      this.scn.append(this.scnExtra);
    }
  }
  private syncGoal() {
    const L = this.lang;
    const a = this.host.assist.label(L);
    this.goalAssist.replaceChildren();
    if (a)
      this.goalAssist.append(icon(ICON.assist), document.createTextNode(a));
    this.goalAssist.hidden = !a;
    const g = this.goalState;
    this.goalText.replaceChildren();
    if (g && this.projector) {
      this.goalText.append(
        mk("b", "", t("goal", L)),
        document.createTextNode(` · ${g.text}`),
      );
    }
    this.goalText.hidden = !this.goalText.firstChild;
    const pct = Math.round(Math.max(0, Math.min(1, g?.progress ?? 0)) * 100);
    this.goalMeter.style.width = `${pct}%`;
    const meter = this.goalMeter.parentElement!;
    meter.hidden = !g;
    meter.setAttribute("aria-valuenow", String(pct));
    meter.setAttribute("aria-label", g ? `${t("goal", L)} · ${g.text}` : t("goal", L));
    this.goal.classList.toggle("met", !!g?.met);
    this.goalNote.textContent = g?.note ?? "";
    this.goalNote.hidden = !g?.note;
    this.goal.hidden = !a && !g;
  }
  private syncClip() {
    const c = this.host.clipPlayer;
    if (!c) return;
    const v = String(Math.round(c.progress * 1000));
    if (this.clipRange.value !== v) this.clipRange.value = v;
    this.clipPlay.replaceChildren(icon(c.playing ? ICON.pause : ICON.play));
    this.clipPlay.setAttribute(
      "aria-label",
      c.playing ? t("pause", this.lang) : t("play", this.lang),
    );
    if (!this.clipCap.textContent)
      this.clipCap.textContent = c.caption(this.lang);
    this.clipTake.hidden = c.live;
  }
}
