// Ground school stage — StageControls: the student's controls for a step (the StageCue whitelist). Knobs
// (OBS, HDG bug, CRS, ALT SEL, BARO) in the cockpit knob look, the bank pad (hold to turn, tap for 10°), pitch
// and power pads, and the CDI / BRG / AP keys. Everything else shows as a locked chip ("Locked by this step").
// Every action calls the SHARED handlers in src/sim/avionicsControls.ts (never copies of main.ts code).
// Touch: knobs 58 px in a 104 px drag zone (1° per 6 px), ±1 tap zones on each side, every target ≥ 44 px.
// Keyboard (SPEC §7): ←/→ OBS 1° (Shift 10°), [ / ] HDG bug, A / D bank (hold), each knob also by its own arrows.
import type { Sim } from "../../sim/sim";
import {
  centerCdi,
  cycleBrg,
  cycleCdi,
  nudgeAltSel,
  nudgeBaro,
  nudgeCrs,
  nudgeHdgBug,
  nudgeObs,
  setBaroToQnh,
  syncAltSel,
  syncHdgBug,
} from "../../sim/avionicsControls";
import type { Lang, StageControl } from "../types";
import type { StageAssist } from "./assist";
import { t, type StageString } from "./strings";

const pad3 = (n: number) =>
  String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, "0");

export type ControlKind = "knob" | "pad" | "key" | "info";
export interface ControlSpec {
  id: StageControl;
  kind: ControlKind;
  /** short name under the control (OBS, HDG BUG…) */
  name: string;
  /** live value over it (090, HDG 120…) */
  value: () => string;
  /** knob turn: d detents, coarse = 10× */
  turn?: (d: number, coarse: boolean) => void;
  push?: () => void;
  pushLabel?: string;
  /** key press (CDI, BRG, AP) */
  press?: () => void;
  /** aria-label */
  aria: string;
}
export interface ControlContext {
  sim: () => Sim;
  assist: StageAssist | null;
  lang: Lang;
  /** something changed (redraw a frozen stage, re-evaluate goals) */
  changed: (id: StageControl) => void;
}

/** The controls a whitelist offers, in display order (knobs, pads, keys). */
export function controlSpecs(
  list: readonly StageControl[],
  cx: ControlContext,
): ControlSpec[] {
  const L = cx.lang;
  const has = new Set(list);
  const both = has.has("obs1") && has.has("obs2");
  const out: ControlSpec[] = [];
  const sim = cx.sim;
  const knob = (
    id: StageControl,
    name: StageString,
    value: () => string,
    turn: (d: number, c: boolean) => void,
    push?: () => void,
    pushLabel?: string,
  ) =>
    out.push({
      id,
      kind: "knob",
      name: t(name, L),
      value,
      turn: (d, c) => (turn(d, c), cx.changed(id)),
      push: push ? () => (push(), cx.changed(id)) : undefined,
      pushLabel,
      aria: t(name, L),
    });
  if (has.has("obs1"))
    knob(
      "obs1",
      both ? "obs1" : "obs",
      () => pad3(sim().av.obs1),
      (d, c) => nudgeObs(sim(), 1, d, c),
    );
  if (has.has("obs2"))
    knob(
      "obs2",
      "obs2",
      () => pad3(sim().av.obs2),
      (d, c) => nudgeObs(sim(), 2, d, c),
    );
  if (has.has("crs"))
    knob(
      "crs",
      "crs",
      () => `CRS ${pad3(sim().course())}`,
      (d, c) => nudgeCrs(sim(), d, c),
      () => void centerCdi(sim()),
      L === "fr" ? "Centrer" : "Centre",
    );
  if (has.has("hdgBug"))
    knob(
      "hdgBug",
      "hdgBug",
      () => `HDG ${pad3(sim().ap.hdgBug)}`,
      (d, c) => cx.assist?.headingBug(nudgeHdgBug(sim(), d, c)),
      () => cx.assist?.headingBug(syncHdgBug(sim())),
      L === "fr" ? "Synchro" : "Sync",
    );
  if (has.has("altBug"))
    knob(
      "altBug",
      "altBug",
      () =>
        `${sim().ap.altSel.toLocaleString(L === "fr" ? "fr-FR" : "en-US")} FT`,
      (d, c) => nudgeAltSel(sim(), d, c),
      () => void syncAltSel(sim()),
    );
  if (has.has("baro"))
    knob(
      "baro",
      "baro",
      () => `${sim().av.baro.toFixed(2)} IN`,
      (d, c) => nudgeBaro(sim(), d, c),
      () => void setBaroToQnh(sim()),
      "QNH",
    );
  if (has.has("bank"))
    out.push({
      id: "bank",
      kind: "pad",
      name: t("bankHold", L),
      value: () => "",
      aria: t("bankHold", L),
    });
  if (has.has("pitch"))
    out.push({
      id: "pitch",
      kind: "pad",
      name: t("pitchHold", L),
      value: () => "",
      aria: t("pitchHold", L),
    });
  if (has.has("power"))
    out.push({
      id: "power",
      kind: "pad",
      name: t("power", L),
      value: () =>
        cx.assist?.holdIas
          ? `${Math.round(cx.assist.targetIas)} KT`
          : `${Math.round(sim().controls.throttle * 100)} %`,
      aria: t("power", L),
    });
  const key = (
    id: StageControl,
    name: StageString,
    value: () => string,
    press: () => void,
  ) =>
    out.push({
      id,
      kind: "key",
      name: t(name, L),
      value,
      press: () => (press(), cx.changed(id)),
      aria: t(name, L),
    });
  if (has.has("cdiSource"))
    key(
      "cdiSource",
      "cdi",
      () => `CDI ${sim().av.cdi}`,
      () => void cycleCdi(sim()),
    );
  if (has.has("brg1"))
    key(
      "brg1",
      "brg1",
      () => `BRG 1 ${sim().av.bearing1}`,
      () => void cycleBrg(sim(), 1),
    );
  if (has.has("brg2"))
    key(
      "brg2",
      "brg2",
      () => `BRG 2 ${sim().av.bearing2}`,
      () => void cycleBrg(sim(), 2),
    );
  if (has.has("ap"))
    key(
      "ap",
      "ap",
      () => (sim().ap.ap ? `AP ${sim().ap.lat} ${sim().ap.vert}` : "AP OFF"),
      () => {
        const s = sim();
        if (s.ap.ap) s.ap.disconnect();
        else {
          // engage in HDG + ALT, like pressing AP, HDG, ALT on the panel
          s.ap.toggleAp(s.ac.data);
          s.ap.pressHdg(s.ac.data);
          s.ap.pressAlt(s.ac.data);
        }
      },
    );
  if (has.has("dragAircraft"))
    out.push({
      id: "dragAircraft",
      kind: "info",
      name: t("dragShort", L),
      value: () => "",
      aria: t("drag", L),
    });
  return out;
}

/** The locked chips: the panel controls the step does not hand over (at most `max`, keys first). */
export function lockedControls(
  list: readonly StageControl[],
  cockpitHasGps = true,
  max = 3,
): StageControl[] {
  const has = new Set(list);
  const order: StageControl[] = [
    "cdiSource",
    "brg1",
    "ap",
    "obs1",
    "hdgBug",
    "crs",
    "brg2",
    "baro",
  ];
  return order
    .filter((c) => !has.has(c) && (cockpitHasGps || c !== "cdiSource"))
    .slice(0, max);
}

/** Knob drag: detents for a pointer movement (1 per 6 px; right / up = increase). */
export function dragDetents(dx: number, dy: number, pxPerDetent = 6): number {
  const v = (dx - dy) / pxPerDetent;
  return v >= 0 ? Math.floor(v) : Math.ceil(v);
}
/** Knob tap: where in the zone (0..1) → −1, push (0), +1. */
export function tapZone(frac: number): -1 | 0 | 1 {
  if (frac < 0.38) return -1;
  if (frac > 0.62) return 1;
  return 0;
}

// ------------------------------------------------------------------ DOM
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

export interface StageControlsOptions extends ControlContext {
  /** whether the cockpit has a GPS (no CDI chip otherwise) */
  gps?: boolean;
}

export class StageControls {
  readonly el: HTMLDivElement;
  private specs: ControlSpec[] = [];
  private values: {
    spec: ControlSpec;
    v: HTMLElement;
    knob?: HTMLElement;
    angle: number;
  }[] = [];
  private cx: StageControlsOptions;
  private list: StageControl[] = [];
  private heldKeys = new Set<string>();
  private padTimers: number[] = [];
  constructor(cx: StageControlsOptions) {
    this.cx = cx;
    this.el = mk("div", "cs-controls");
    this.el.setAttribute("role", "toolbar");
  }
  get controls(): readonly StageControl[] {
    return this.list;
  }
  setLang(l: Lang) {
    this.cx.lang = l;
    this.set(this.list);
  }
  set(list: readonly StageControl[] | undefined) {
    this.list = [...(list ?? [])];
    this.specs = controlSpecs(this.list, this.cx);
    this.el.replaceChildren();
    this.values = [];
    this.el.classList.toggle("empty", this.specs.length === 0);
    for (const s of this.specs) {
      if (s.kind === "knob") this.el.append(this.knob(s));
      else if (s.kind === "pad") this.el.append(this.pad(s));
      else if (s.kind === "key") this.el.append(this.key(s));
      else this.el.append(this.info(s));
    }
    // only the controls the student may use: the ones the step keeps are simply not drawn (a row of greyed
    // "Locked by this step" chips was noise beside the task)
    this.refresh();
  }
  /** Refresh the live values (cheap; call once per frame while live, or after a change). */
  refresh() {
    for (const x of this.values) {
      const v = x.spec.value();
      if (x.v.textContent !== v) x.v.textContent = v || " ";
      x.knob?.setAttribute("aria-valuetext", v);
    }
  }
  /** Keyboard shortcuts (SPEC §7). Returns true when handled. */
  handleKey(e: KeyboardEvent, down: boolean): boolean {
    const has = new Set(this.list);
    const sim = this.cx.sim();
    const coarse = e.shiftKey;
    const k = e.key;
    const spec = (id: StageControl) => this.specs.find((s) => s.id === id);
    if (down) {
      if (
        (k === "ArrowLeft" || k === "ArrowRight") &&
        (has.has("obs1") || has.has("crs"))
      ) {
        const s = spec(has.has("obs1") ? "obs1" : "crs")!;
        s.turn!(k === "ArrowLeft" ? -1 : 1, coarse);
        this.refresh();
        return true;
      }
      if ((k === "[" || k === "]") && has.has("hdgBug")) {
        spec("hdgBug")!.turn!(k === "[" ? -1 : 1, coarse);
        this.refresh();
        return true;
      }
      if (
        (k === "a" || k === "A" || k === "d" || k === "D") &&
        has.has("bank") &&
        this.cx.assist
      ) {
        if (!this.heldKeys.has(k.toLowerCase())) {
          this.heldKeys.add(k.toLowerCase());
          this.cx.assist.setBank(k.toLowerCase() === "a" ? -1 : 1, sim);
        }
        return true;
      }
    } else if (
      (k === "a" || k === "A" || k === "d" || k === "D") &&
      this.heldKeys.delete(k.toLowerCase())
    ) {
      this.cx.assist?.setBank(0, sim);
      return true;
    }
    return false;
  }
  destroy() {
    for (const id of this.padTimers) clearTimeout(id);
    this.el.remove();
  }

  private knob(s: ControlSpec): HTMLElement {
    const wrap = mk("div", "cs-ctl");
    const v = mk("span", "v");
    const zone = mk("div", "cs-kzone");
    const minus = mk("span", "tz l", "−");
    const plus = mk("span", "tz r", "+");
    const k = mk("div", "cs-knob");
    k.setAttribute("tabindex", "0");
    k.setAttribute("role", "slider");
    k.setAttribute("aria-label", s.aria);
    zone.append(minus, k, plus);
    const n = mk("span", "n", s.name);
    wrap.append(v, zone, n);
    const entry = { spec: s, v, knob: k, angle: 0 };
    this.values.push(entry);
    const rotate = (d: number) => {
      entry.angle += d * 12;
      k.style.setProperty("--a", `${entry.angle}deg`);
    };
    let start: { x: number; y: number; used: number; id: number } | null = null;
    zone.addEventListener("pointerdown", (e) => {
      start = { x: e.clientX, y: e.clientY, used: 0, id: e.pointerId };
      zone.setPointerCapture?.(e.pointerId);
      k.classList.add("on");
      e.preventDefault();
    });
    zone.addEventListener("pointermove", (e) => {
      if (!start || e.pointerId !== start.id) return;
      const d = dragDetents(e.clientX - start.x, e.clientY - start.y);
      if (d !== start.used) {
        const step = d - start.used;
        start.used = d;
        s.turn!(step, e.shiftKey);
        rotate(step);
        this.refresh();
      }
    });
    const end = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const moved =
        Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5 ||
        start.used !== 0;
      if (!moved && e.type === "pointerup") {
        const r = zone.getBoundingClientRect();
        const z = tapZone((e.clientX - r.left) / Math.max(1, r.width));
        if (z !== 0) {
          s.turn!(z, e.shiftKey);
          rotate(z);
        } else s.push?.();
        this.refresh();
      }
      start = null;
      k.classList.remove("on");
    };
    zone.addEventListener("pointerup", end);
    zone.addEventListener("pointercancel", end);
    zone.addEventListener(
      "wheel",
      (e) => {
        const d = e.deltaY < 0 ? 1 : -1;
        s.turn!(d, e.shiftKey);
        rotate(d);
        this.refresh();
        e.preventDefault();
      },
      { passive: false },
    );
    k.addEventListener("keydown", (e) => {
      const map: Record<string, number> = {
        ArrowLeft: -1,
        ArrowDown: -1,
        ArrowRight: 1,
        ArrowUp: 1,
        PageDown: -10,
        PageUp: 10,
      };
      if (map[e.key] !== undefined) {
        const d = map[e.key];
        s.turn!(
          Math.abs(d) === 10 ? Math.sign(d) : d,
          e.shiftKey || Math.abs(d) === 10,
        );
        rotate(Math.sign(d));
        this.refresh();
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "Enter" && s.push) {
        s.push();
        this.refresh();
        e.preventDefault();
      }
    });
    return wrap;
  }

  private pad(s: ControlSpec): HTMLElement {
    const wrap = mk("div", "cs-ctl");
    const v = mk("span", "v");
    const row = mk("div", "cs-pad");
    const L = this.cx.lang;
    const assist = this.cx.assist;
    const sim = this.cx.sim;
    const hold = (
      label: string,
      aria: string,
      on: () => void,
      off: () => void,
      tap: () => void,
    ) => {
      const b = mk("button", "cs-btn", label);
      b.type = "button";
      b.setAttribute("aria-label", aria);
      let t0 = 0;
      let down = false;
      b.addEventListener("pointerdown", (e) => {
        down = true;
        t0 = performance.now();
        b.setPointerCapture?.(e.pointerId);
        b.classList.add("on");
        on();
        e.preventDefault();
      });
      const up = (e: PointerEvent) => {
        if (!down) return;
        down = false;
        b.classList.remove("on");
        off();
        // a short tap (< 250 ms) is a step instead of a hold
        if (e.type === "pointerup" && performance.now() - t0 < 250) tap();
        this.cx.changed(s.id);
      };
      b.addEventListener("pointerup", up);
      b.addEventListener("pointercancel", up);
      // keyboard: Enter / Space = a step
      b.addEventListener("click", (e) => {
        if ((e as MouseEvent).detail === 0) {
          tap();
          this.cx.changed(s.id);
        }
      });
      return b;
    };
    if (s.id === "bank") {
      const tapTurn = (dir: -1 | 1) => {
        if (!assist) return;
        const h = assist.targetHdg ?? sim().ac.data.hdgTrue;
        assist.headingBug(
          (((Math.round(h / 5) * 5 + dir * 10) % 360) + 360) % 360 || 360,
        );
      };
      row.append(
        hold(
          `◀ ${t("left", L)}`,
          L === "fr" ? "Inclinaison à gauche (maintenir)" : "Bank left (hold)",
          () => assist?.setBank(-1, sim()),
          () => assist?.setBank(0, sim()),
          () => tapTurn(-1),
        ),
        hold(
          `${t("right", L)} ▶`,
          L === "fr" ? "Inclinaison à droite (maintenir)" : "Bank right (hold)",
          () => assist?.setBank(1, sim()),
          () => assist?.setBank(0, sim()),
          () => tapTurn(1),
        ),
      );
    } else if (s.id === "pitch") {
      row.append(
        hold(
          "▲",
          L === "fr" ? "Cabrer (maintenir)" : "Nose up (hold)",
          () => assist?.setPitch(1, sim()),
          () => assist?.setPitch(0, sim()),
          () => assist && (assist.targetAlt += 100),
        ),
        hold(
          "▼",
          L === "fr" ? "Piquer (maintenir)" : "Nose down (hold)",
          () => assist?.setPitch(-1, sim()),
          () => assist?.setPitch(0, sim()),
          () => assist && (assist.targetAlt -= 100),
        ),
      );
    } else {
      const step = (dir: -1 | 1, label: string, aria: string) => {
        const b = mk("button", "cs-btn", label);
        b.type = "button";
        b.setAttribute("aria-label", aria);
        b.addEventListener("click", () => {
          if (assist) assist.nudgePower(dir, sim());
          else
            sim().controls.throttle = Math.max(
              0,
              Math.min(1, sim().controls.throttle + dir * 0.05),
            );
          this.refresh();
          this.cx.changed("power");
        });
        return b;
      };
      row.append(
        step(-1, "−", L === "fr" ? "Réduire" : "Less power"),
        step(1, "+", L === "fr" ? "Augmenter" : "More power"),
      );
    }
    wrap.append(v, row, mk("span", "n", s.name));
    this.values.push({ spec: s, v, angle: 0 });
    return wrap;
  }

  private key(s: ControlSpec): HTMLElement {
    const wrap = mk("div", "cs-ctl");
    const b = mk("button", "cs-btn key", s.name);
    b.type = "button";
    b.setAttribute("aria-label", s.aria);
    b.addEventListener("click", () => {
      s.press!();
      this.refresh();
    });
    // the key shows its live state ("CDI NAV1", "AP HDG ALT")
    wrap.append(mk("span", "v", "\u00a0"), b, mk("span", "n", "\u00a0"));
    this.values.push({ spec: s, v: b, angle: 0 });
    return wrap;
  }

  private info(s: ControlSpec): HTMLElement {
    const wrap = mk("div", "cs-ctl info");
    const b = mk("span", "cs-hint", s.aria);
    wrap.append(mk("span", "v", " "), b, mk("span", "n", s.name));
    return wrap;
  }
}
