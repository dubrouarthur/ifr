// The presenter flies the slide's aircraft (« Piloter la démonstration »). The deck drives the situation that the
// slide's instruments already show: the simulator's own flight model flies it (course/stage/assist.ts holds the
// heading and the altitude with the controls, exactly as the stage assist does for a student), the simulator's
// own renderers draw it, and the console mirrors that aircraft on the projector window (course/present.ts, `sims`).
// Nothing here moves a needle by hand.
//
// Pure parts (unit-tested in tests/course-demo-pilot.test.ts): the targets and their ranges, the keyboard map,
// the quick actions' targets, the mirror of a Sim (what the projector needs to draw the same instruments).
import type { Sim } from "../../sim/sim";
import type { FailureKey } from "../../sim/systemsTypes";
import { FAILURE_LABELS_EN } from "../../sim/systemsTypes";
import type { Course, Lang, PresenterAction, StagePose, Step, YourTurn } from "../types";
import type { CourseStore } from "../store";
import type { SlideHost } from "./player";
import {
  SIMS_IDLE_MS,
  SIMS_PERIOD_MS,
  type DemoWhoWire,
  type PresentWire,
} from "../present";
import type { SceneSims, SimEntry } from "../canvas/instruments";
import { StageAssist } from "../stage/assist";
import { applyStagePose, stagePoseOf } from "../scene";
import { failureName, SIT_FAILURES } from "../situations";
import { h } from "../../ui/dom";
import { icon } from "./reader";
import "../../styles/course-demo.css";

// ------------------------------------------------------------------ words
const S = {
  title: ["Demonstration", "Démonstration"],
  you: ["You are flying", "Vous pilotez"],
  student: ["A student has the controls", "Un élève a les commandes"],
  watch: [
    "The animation plays. Touch a control to fly.",
    "L’animation se déroule. Touchez une commande pour piloter.",
  ],
  close: ["Close the demonstration", "Fermer la démonstration"],
  hdg: ["Heading", "Cap"],
  alt: ["Altitude", "Altitude"],
  power: ["Power", "Puissance"],
  bank: ["Bank", "Inclinaison"],
  pitch: ["Pitch", "Assiette"],
  held: ["held", "tenu"],
  now: ["now {v}", "actuel {v}"],
  less: ["Less {n}", "Moins {n}"],
  more: ["More {n}", "Plus {n}"],
  turnL: ["Standard turn left", "Virage standard à gauche"],
  turnR: ["Standard turn right", "Virage standard à droite"],
  climb: ["Climb to {a}", "Monter à {a}"],
  descend: ["Descend to {a}", "Descendre à {a}"],
  level: ["Level off", "Mettre en palier"],
  failure: ["Failure…", "Panne…"],
  failures: ["Failures", "Pannes"],
  freeze: ["Freeze", "Figer"],
  unfreeze: ["Resume", "Reprendre"],
  reset: ["Back to the start", "Revenir au départ"],
  replay: ["Replay the animation", "Rejouer l’animation"],
  pause: ["Pause", "Pause"],
  resume: ["Resume the animation", "Reprendre l’animation"],
  give: ["Let a student fly here", "Faire piloter un élève ici"],
  takeBack: ["Take the controls back", "Reprendre les commandes"],
  yourTurnOpen: ["Open « Your turn »", "Ouvrir « À vous »"],
  studentLine: [
    "Your turn: the student flies with these controls or the ones on the slide. The projector says so.",
    "À vous : l’élève pilote avec ces commandes ou celles de la diapo. La projection l’affiche.",
  ],
  keys: [
    "← → bank · ↓ pull ↑ push · Page ↑ ↓ power · [ ] heading · H hold the heading · Space next slide",
    "← → inclinaison · ↓ tirer ↑ pousser · Page ↑ ↓ puissance · [ ] cap · H tenir le cap · Espace diapo suivante",
  ],
  situation: ["Situation {n}", "Situation {n}"],
  live: [
    "The projector shows the same aircraft.",
    "La projection montre le même avion.",
  ],
} as const;
export type DemoWord = keyof typeof S;
export const dw = (
  k: DemoWord,
  lang: Lang,
  v: Record<string, string | number> = {},
): string =>
  S[k][lang === "fr" ? 1 : 0].replace(/\{(\w+)\}/g, (_, x: string) =>
    String(v[x] ?? ""),
  );

// ------------------------------------------------------------------ the model (pure)
export type DemoAxis = "hdg" | "alt" | "power" | "bank" | "pitch";
/** what the deck asks; the lateral and the vertical axis each have one owner (the last one touched) */
export interface DemoTargets {
  lateral: "hdg" | "bank";
  vertical: "alt" | "pitch";
  hdg: number;
  bank: number;
  alt: number;
  pitch: number;
  /** throttle, % */
  power: number;
}
/**
 * Ranges and steps. Bank to 45° and pitch −15…+20° are the slide strip's (canvas/controlStrip.ts) so the
 * presenter and the student have the same aircraft; altitude to 12 500 ft covers the C172S service ceiling
 * (POH section 2 / 5: 14 000 ft) minus a margin; 100 ft steps are what an altimeter shows easily.
 */
export const DEMO_RANGE: Record<
  DemoAxis,
  { min: number; max: number; step: number; big: number }
> = {
  hdg: { min: 0, max: 359, step: 5, big: 30 },
  alt: { min: 0, max: 12500, step: 100, big: 500 },
  power: { min: 0, max: 100, step: 5, big: 20 },
  bank: { min: -45, max: 45, step: 5, big: 15 },
  pitch: { min: -15, max: 20, step: 1, big: 5 },
};
export const norm360 = (d: number): number => ((d % 360) + 360) % 360;
/** −180…180 */
const norm180 = (d: number): number => norm360(d + 180) - 180;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
/** A target value kept in its range (the heading wraps). */
export function clampAxis(axis: DemoAxis, v: number): number {
  if (axis === "hdg") return Math.round(norm360(v));
  const r = DEMO_RANGE[axis];
  return clamp(Math.round(v / r.step) * r.step, r.min, r.max);
}
/** The targets from the aircraft as it is now: nothing changes until the presenter moves something. */
export function targetsOf(sim: Sim): DemoTargets {
  const d = sim.ac.data;
  return {
    lateral: "hdg",
    vertical: "alt",
    hdg: Math.round(norm360(d.hdgTrue)),
    bank: 0,
    alt: Math.round(sim.ac.s.altFt / 10) * 10,
    pitch: clamp(Math.round(d.pitchDeg), -15, 20),
    power: Math.round(clamp(sim.controls.throttle, 0, 1) * 100),
  };
}
/** Set one axis: the axis becomes the owner of its side (heading or bank, altitude or pitch). */
export function setAxis(
  t: DemoTargets,
  axis: DemoAxis,
  v: number,
): DemoTargets {
  const n = { ...t, [axis]: clampAxis(axis, v) };
  if (axis === "hdg") n.lateral = "hdg";
  if (axis === "bank") n.lateral = n.bank === 0 ? "hdg" : "bank";
  if (axis === "alt") n.vertical = "alt";
  if (axis === "pitch") n.vertical = "pitch";
  return n;
}

/** What a key does on the deck (null: not the deck's key, the console keeps it). */
export type DemoCmd =
  | { k: "nudge"; axis: DemoAxis; d: number }
  | { k: "holdHdg" };
export function demoKey(
  key: string,
  o: { shift?: boolean; code?: string } = {},
): DemoCmd | null {
  const big = !!o.shift;
  const n = (axis: DemoAxis, sign: number): DemoCmd => ({
    k: "nudge",
    axis,
    d: sign * (big ? DEMO_RANGE[axis].big : DEMO_RANGE[axis].step),
  });
  switch (key) {
    case "ArrowLeft":
      return n("bank", -1);
    case "ArrowRight":
      return n("bank", 1);
    // the yoke: pull (↓) raises the nose, push (↑) lowers it, as on the student's stage (CONTROLS-NOTES key map)
    case "ArrowDown":
      return n("pitch", 1);
    case "ArrowUp":
      return n("pitch", -1);
    case "PageUp":
      return n("power", 1);
    case "PageDown":
      return n("power", -1);
    case "h":
    case "H":
      return { k: "holdHdg" };
  }
  // [ and ] by the physical key too (an AZERTY keyboard types them with AltGr)
  if (key === "[" || o.code === "BracketLeft") return n("hdg", -1);
  if (key === "]" || o.code === "BracketRight") return n("hdg", 1);
  return null;
}

/** « Monter à … »: 1 000 ft up, on a 500 ft step (what an instructor would ask). */
export const climbTarget = (altFt: number): number =>
  clampAxis("alt", Math.round((altFt + 1000) / 500) * 500);
/** « Descendre à … »: 1 000 ft down on a 500 ft step, never below 1 000 ft above the ground. A target that is not at
 *  least 150 ft below the aircraft is no descent: the deck disables the action (canDescend). */
export const descendTarget = (altFt: number, groundFt = 0): number =>
  Math.max(
    Math.ceil((groundFt + 1000) / 100) * 100,
    clampAxis("alt", Math.round((altFt - 1000) / 500) * 500),
  );
export const canDescend = (altFt: number, groundFt = 0): boolean =>
  descendTarget(altFt, groundFt) <= altFt - 150;
export const canClimb = (altFt: number): boolean => climbTarget(altFt) >= altFt + 150;
/** A standard-rate turn of 90° (3 °/s: 30 s; FAA Instrument Flying Handbook ch. 7). */
export const turnTarget = (hdg: number, dir: -1 | 1): number =>
  Math.round(norm360(hdg + dir * 90));
/** "3 000 ft" / "3,000 ft" */
export function ftText(v: number, lang: Lang): string {
  const s = String(Math.round(v)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    lang === "fr" ? " " : ",",
  );
  return `${s} ft`;
}
export const hdgText = (v: number): string =>
  `${String(Math.round(norm360(v)) || 360).padStart(3, "0")}°`;
export function bankText(v: number, lang: Lang): string {
  const r = Math.round(v);
  if (!r) return lang === "fr" ? "0° (ailes à plat)" : "0° (wings level)";
  return `${Math.abs(r)}° ${r < 0 ? (lang === "fr" ? "G" : "L") : lang === "fr" ? "D" : "R"}`;
}
export const pitchText = (v: number): string => {
  const r = Math.round(v);
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r)}°`;
};

// ------------------------------------------------------------------ the mirror (console → projector)
/** What the projector needs to draw the same instruments as the console (no flight model runs there). */
export interface SimMirror {
  /** the situation, as both windows build it (entryId) */
  id: string;
  pose: StagePose;
  av: Record<string, unknown>;
  ap: { hdgBug: number; altSel: number };
  rpm: number;
  thr: number;
  /** the failures on */
  fail: string[];
}
/** The same situation in both windows: its scene, its failures, its animation. */
export function entryId(
  e: Pick<SimEntry, "scene" | "failures" | "motionSpec">,
): string {
  const f = Object.entries(e.failures ?? {})
    .filter(([, on]) => on)
    .map(([k]) => k)
    .sort()
    .join(",");
  const m = e.motionSpec ? (e.motionSpec.preset ?? "own") : "";
  return `${e.scene.id ?? "?"}|${f}|${m}`;
}
export function mirrorOf(id: string, sim: Sim): SimMirror {
  return {
    id,
    pose: stagePoseOf(sim),
    av: JSON.parse(JSON.stringify(sim.av)) as Record<string, unknown>,
    ap: { hdgBug: sim.ap.hdgBug, altSel: sim.ap.altSel },
    rpm: sim.ac.s.rpm,
    thr: sim.controls.throttle,
    fail: (Object.keys(sim.failures) as FailureKey[]).filter(
      (k) => sim.failures[k],
    ),
  };
}
/** Put the console's aircraft on the projector's Sim (display values exactly the console's). */
export function applyMirror(sim: Sim, m: SimMirror): void {
  const want = new Set(m.fail);
  for (const k of Object.keys(FAILURE_LABELS_EN) as FailureKey[])
    if (!!sim.failures[k] !== want.has(k)) {
      try {
        sim.setFailure(k, want.has(k));
      } catch {
        /* a failure this build does not know */
      }
    }
  applyStagePose(sim, m.pose, m.av as never);
  sim.ap.hdgBug = m.ap.hdgBug;
  sim.ap.altSel = m.ap.altSel;
  sim.ac.s.rpm = m.rpm;
  sim.controls.throttle = m.thr;
  sim.updateAvionics(0);
}

/** The situations the instruments of a slide show, in the order of the slide (one entry per aircraft). */
export function slideEntries(sims: SceneSims | null | undefined): SimEntry[] {
  // SceneSims keeps its instruments in a private set; read it without changing the class (canvas/instruments.ts)
  const ws = (
    sims as unknown as {
      widgets?: Set<{ entry: SimEntry | null; mode?: string }>;
    } | null
  )?.widgets;
  const out: SimEntry[] = [];
  if (!ws) return out;
  for (const w of ws) if (w.entry && !out.includes(w.entry)) out.push(w.entry);
  return out;
}
/** Is an instrument of this situation running (its clock on)? */
export function entryLive(sims: SceneSims, e: SimEntry): boolean {
  const ws = (
    sims as unknown as {
      widgets?: Set<{ entry: SimEntry | null; mode?: string }>;
    }
  ).widgets;
  if (!ws) return false;
  for (const w of ws) if (w.entry === e && w.mode === "live") return true;
  return false;
}
/** An animation owns the aircraft (it plays, waits or rests): the projector plays its own copy. */
export const motionOwns = (e: SimEntry): boolean =>
  !!e.motion && e.motion.state !== "handed";

/** The failures the deck offers: the slide's own first, then the classics of the instruments (SIT_FAILURES). */
export function demoFailures(own: readonly string[], max = 6): FailureKey[] {
  const known = new Set(Object.keys(FAILURE_LABELS_EN));
  const out: FailureKey[] = [];
  for (const k of [...own, ...SIT_FAILURES])
    if (known.has(k) && !out.includes(k as FailureKey))
      out.push(k as FailureKey);
  return out.slice(0, max);
}

// ------------------------------------------------------------------ the flying (the simulator's flight model)
/**
 * The presenter's hands. Each frame, before the Sim steps: the heading or the bank asked (StageAssist lateral:
 * standard-rate turns to a heading), the altitude (StageAssist altitude hold, ±700 ft/min) or the pitch attitude
 * asked (the strip's elevator law), and the throttle asked. A climb or a descent asked by altitude moves the
 * power first (full power to climb, POH section 4 « Climb »: full throttle; less power to descend), then gives the
 * power back once the altitude is reached: the slider shows it, which is what the instructor explains.
 */
export class DemoPilot {
  t: DemoTargets;
  /** the presenter has taken the aircraft (until then an animation or the situation flies on its own) */
  active = false;
  private assist = new StageAssist();
  private lastPitch: number | null = null;
  /** the power to give back when the altitude asked is reached (null: none pending) */
  private levelPower: number | null = null;
  /** the power the situation started with (« Mettre en palier ») */
  cruise: number;
  constructor(sim: Sim) {
    this.t = targetsOf(sim);
    this.cruise = levelPowerOf(sim, this.t.power);
  }
  /** Take the aircraft as it is now: a descent on final keeps descending (its pitch is held), level flight keeps
   *  its altitude. Holding the altitude of a final on approach power would pitch up into the stall. */
  engage(sim: Sim) {
    this.t = targetsOf(sim);
    if (Math.abs(sim.ac.data.vsFpm) > 200) this.t.vertical = "pitch";
    this.assist.configure(sim, { holdAlt: true }, true);
    this.lastPitch = null;
    this.levelPower = null;
    if (sim.ap.ap) sim.ap.ap = false;
    this.active = true;
  }
  release() {
    this.active = false;
    this.levelPower = null;
  }
  /** One axis from the deck. */
  set(axis: DemoAxis, v: number, sim: Sim) {
    const before = this.t;
    this.t = setAxis(before, axis, v);
    if (axis === "bank" && this.t.lateral === "hdg")
      this.t.hdg = Math.round(norm360(sim.ac.data.hdgTrue));
    if (axis === "power") this.levelPower = null;
    if (axis === "alt") this.powerFor(this.t.alt, sim);
  }
  private powerFor(target: number, sim: Sim) {
    const dAlt = target - sim.ac.s.altFt;
    if (Math.abs(dAlt) < 150) return;
    if (this.levelPower === null) this.levelPower = this.t.power;
    // descent: about 20 % less throttle (some 400 RPM), the speed stays near cruise (FAA Airplane Flying Handbook
    // ch. 3, « Descents »); climb: full throttle
    this.t.power =
      dAlt > 0
        ? 100
        : clampAxis("power", Math.min(this.levelPower, this.cruise) - 20);
  }
  turn(dir: -1 | 1, sim: Sim) {
    this.t = {
      ...this.t,
      lateral: "hdg",
      hdg: turnTarget(sim.ac.data.hdgTrue, dir),
    };
  }
  climb(sim: Sim) {
    this.set("alt", climbTarget(sim.ac.s.altFt), sim);
  }
  descend(sim: Sim) {
    this.set("alt", descendTarget(sim.ac.s.altFt, groundOf(sim)), sim);
  }
  level(sim: Sim) {
    this.t = {
      ...this.t,
      lateral: "hdg",
      vertical: "alt",
      hdg: Math.round(norm360(sim.ac.data.hdgTrue)),
      alt: Math.round(sim.ac.s.altFt / 100) * 100,
      bank: 0,
      power: this.cruise,
    };
    this.levelPower = null;
  }
  holdHeading(sim: Sim) {
    this.t = {
      ...this.t,
      lateral: "hdg",
      bank: 0,
      hdg: Math.round(norm360(sim.ac.data.hdgTrue)),
    };
  }
  /** Write the controls for this frame (before sim.step(dt)). */
  apply(sim: Sim, dt: number) {
    if (dt <= 0) return;
    const t = this.t;
    const d = sim.ac.data;
    const a = this.assist;
    a.lateral = true;
    a.pitchInput = 0;
    if (t.lateral === "hdg") {
      a.bankInput = 0;
      a.bankDeg = null;
      a.targetHdg = t.hdg;
    } else {
      a.bankDeg = Math.abs(t.bank);
      a.bankInput = t.bank < 0 ? -1 : 1;
    }
    if (t.vertical === "alt") {
      a.holdAlt = true;
      // never climb the speed away: below about 1.3 × the clean stall speed (C172S POH section 5: 48 KIAS flaps up)
      // the climb waits for the speed
      const climbing = t.alt > sim.ac.s.altFt + 30;
      a.targetAlt = climbing && d.iasKt < 63 ? sim.ac.s.altFt : t.alt;
      // speed floor (Vs1 48 KIAS + 15 kt): level flight on too little power: power up, and below 58 kt the nose
      // goes down a little before the altitude is held again (FAA AFH ch. 4, slow flight and stall recovery)
      if (!sim.ac.s.onGround && d.iasKt < 63) {
        if (this.t.power < this.cruise) this.t.power = this.cruise;
        if (d.iasKt < 58) {
          this.t.power = 100;
          a.targetAlt = Math.min(a.targetAlt, sim.ac.s.altFt - 100);
        }
      }
      if (this.levelPower !== null && Math.abs(sim.ac.s.altFt - t.alt) < 60) {
        this.t.power = this.levelPower;
        this.levelPower = null;
      }
    } else a.holdAlt = false;
    a.holdIas = false;
    sim.controls.throttle = clamp(this.t.power / 100, 0, 1);
    a.apply(sim, dt);
    if (t.vertical === "pitch" && !sim.ac.s.onGround) {
      // the pitch attitude asked, with the elevator and the trim (the slide strip's gains, canvas/controlStrip.ts)
      const c = sim.controls;
      const rate =
        this.lastPitch === null ? 0 : (d.pitchDeg - this.lastPitch) / dt;
      this.lastPitch = d.pitchDeg;
      const e = t.pitch - d.pitchDeg;
      c.elevator = clamp(e * 0.07 - rate * 0.025, -0.4, 0.4);
      c.trim = clamp(c.trim + e * 0.012 * dt, -1, 1);
    } else this.lastPitch = null;
  }
}
/**
 * The throttle that holds level flight: the situation's own when it starts level, else the C172S cruise setting
 * (about 2 300 RPM, ≈ 60–65 % power: POH section 5, cruise performance), never an approach power.
 */
export function levelPowerOf(sim: Sim, power: number): number {
  return Math.abs(sim.ac.data.vsFpm) <= 200 && power >= 45 ? power : Math.max(power, 65);
}
function groundOf(sim: Sim): number {
  const agl = (sim.ac.data as { aglFt?: number }).aglFt;
  return typeof agl === "number" && Number.isFinite(agl)
    ? sim.ac.s.altFt - agl
    : 0;
}

/**
 * Put the demo's hands on a situation: the slide's loop calls `pilot.apply` before each step
 * (SceneSims.frame); while the demo flies, that call flies the demo instead of the strip.
 */
export function hookPilot(
  sims: SceneSims,
  e: SimEntry,
  demo: () => DemoPilot | null,
): void {
  const p = e.pilot ?? sims.pilot(e, []);
  const tagged = p as typeof p & { __demo?: true };
  if (tagged.__demo) return;
  tagged.__demo = true;
  const orig = p.apply.bind(p);
  p.apply = (sim: Sim, dt: number) => {
    const d = demo();
    if (d?.active) d.apply(sim, dt);
    else orig(sim, dt);
  };
}

// ------------------------------------------------------------------ the deck (DOM)
export type DemoWho = "instructor" | "student";
export interface DeckOptions {
  lang: Lang;
  sims: SceneSims;
  entries: SimEntry[];
  /** failure keys the slide itself names (its instruments, its presenter actions) */
  failures: string[];
  /** the slide has an « À vous » on an instrument: the deck offers to open it */
  yourTurn?: () => void;
  onClose(): void;
  /** who flies changed (the console tells the projector) */
  onChange(): void;
  /** an animation was replayed / paused / resumed (the projector does the same) */
  onAnim(id: string, op: "replay" | "pause" | "resume"): void;
}
interface Row {
  axis: DemoAxis;
  el: HTMLElement;
  val: HTMLElement;
  now: HTMLElement;
  range: HTMLInputElement;
}

export class DemoDeck {
  readonly el: HTMLElement;
  who: DemoWho = "instructor";
  pilot: DemoPilot | null = null;
  entry: SimEntry | null = null;
  private rows: Row[] = [];
  private body: HTMLElement;
  private lang: Lang;
  private frozen = false;
  private failOpen = false;
  private stateEl: HTMLElement | null = null;
  private chipsEl: HTMLElement | null = null;
  private chipsSig = "";
  constructor(private o: DeckOptions) {
    this.lang = o.lang;
    this.el = h("section", {
      class: "dm-deck",
      role: "region",
      "aria-label": dw("title", this.lang),
    });
    this.body = h("div", { class: "dm-body" });
    this.el.append(this.body);
    this.pick(o.entries[0] ?? null);
  }
  get sims(): SceneSims {
    return this.o.sims;
  }
  get flying(): boolean {
    return !!this.pilot?.active;
  }
  /** Rebind to another slide (the deck stays open from slide to slide while there is an instrument). */
  rebind(o: Partial<DeckOptions>) {
    Object.assign(this.o, o);
    this.frozen = false;
    this.failOpen = false;
    this.pick(this.o.entries[0] ?? null);
  }
  setLang(l: Lang) {
    this.lang = l;
    this.render();
  }
  private pick(e: SimEntry | null) {
    this.entry = e;
    this.pilot = e ? new DemoPilot(e.sim) : null;
    if (e)
      hookPilot(this.o.sims, e, () => (this.entry === e ? this.pilot : null));
    this.render();
  }
  /** Take the aircraft (the first touch on any control). */
  private take() {
    const e = this.entry;
    const p = this.pilot;
    if (!e || !p) return;
    if (!p.active) {
      if (motionOwns(e)) this.o.sims.handOver(e);
      p.engage(e.sim);
      this.o.onChange();
    }
    if (!this.frozen) this.o.sims.run(e, true);
  }
  private act(f: (p: DemoPilot, sim: Sim) => void) {
    const e = this.entry;
    if (!e || !this.pilot) return;
    this.take();
    f(this.pilot, e.sim);
    this.sync();
  }
  /** A key from the console (true: the deck used it). */
  key(ev: KeyboardEvent): boolean {
    if (!this.entry) return false;
    const c = demoKey(ev.key, { shift: ev.shiftKey, code: ev.code });
    if (!c) return false;
    this.act((p, sim) => {
      if (c.k === "holdHdg") p.holdHeading(sim);
      else {
        const base =
          c.axis === "bank" && p.t.lateral !== "bank"
            ? Math.round(sim.ac.data.rollDeg / 5) * 5
            : c.axis === "pitch" && p.t.vertical !== "pitch"
              ? Math.round(sim.ac.data.pitchDeg)
              : p.t[c.axis];
        p.set(c.axis, base + c.d, sim);
      }
    });
    return true;
  }
  /** who flies: the presenter or a student at this device */
  setWho(w: DemoWho) {
    if (this.who === w) return;
    this.who = w;
    this.render();
    this.o.onChange();
  }

  // ---------------------------------------------------------------- render
  private render() {
    const lang = this.lang;
    const e = this.entry;
    this.rows = [];
    this.el.classList.toggle("dm-student", this.who === "student");
    const head = h(
      "div",
      { class: "dm-head" },
      h("span", { class: "dm-dot", "aria-hidden": "true" }),
      h(
        "div",
        { class: "dm-ttl" },
        h("h2", {}, dw("title", lang)),
        (this.stateEl = h("span", { class: "dm-state", role: "status" }, this.stateText())),
      ),
      h(
        "button",
        {
          type: "button",
          class: "dm-x",
          "aria-label": dw("close", lang),
          title: dw("close", lang),
          onclick: () => this.o.onClose(),
        },
        icon("x"),
      ),
    );
    if (!e || !this.pilot) {
      this.body.replaceChildren(head);
      return;
    }
    const parts: HTMLElement[] = [head];
    if (this.o.entries.length > 1)
      parts.push(
        h(
          "div",
          { class: "dm-seg", role: "group" },
          ...this.o.entries.map((x, i) =>
            h(
              "button",
              {
                type: "button",
                class: x === e ? "on" : "",
                "aria-pressed": x === e ? "true" : "false",
                onclick: () => this.pick(x),
              },
              dw("situation", lang, { n: i + 1 }),
            ),
          ),
        ),
      );
    const rows = h("div", { class: "dm-rows" });
    for (const axis of ["hdg", "alt", "power", "bank", "pitch"] as DemoAxis[])
      rows.append(this.row(axis));
    parts.push(rows);
    this.chipsSig = "";
    this.chipsEl = this.who === "instructor" ? h("div", { class: "dm-chipbox" }) : null;
    if (this.chipsEl) parts.push(this.chipsEl);
    if (this.who === "student")
      parts.push(h("p", { class: "dm-line" }, dw("studentLine", lang)));
    const hand =
      this.who === "instructor"
        ? h(
            "div",
            { class: "dm-hand" },
            h(
              "button",
              {
                type: "button",
                class: "dm-btn",
                onclick: () => this.setWho("student"),
              },
              icon("plane"),
              h("span", {}, dw("give", lang)),
            ),
            this.o.yourTurn
              ? h(
                  "button",
                  {
                    type: "button",
                    class: "dm-btn",
                    onclick: () => this.o.yourTurn?.(),
                  },
                  icon("flag"),
                  h("span", {}, dw("yourTurnOpen", lang)),
                )
              : null,
          )
        : h(
            "div",
            { class: "dm-hand" },
            h(
              "button",
              {
                type: "button",
                class: "dm-btn dm-btn-strong",
                onclick: () => this.setWho("instructor"),
              },
              icon("back"),
              h("span", {}, dw("takeBack", lang)),
            ),
          );
    parts.push(hand);
    parts.push(h("p", { class: "dm-keys" }, dw("keys", lang)));
    this.body.replaceChildren(...parts);
    this.fillChips();
    this.sync();
  }
  private row(axis: DemoAxis): HTMLElement {
    const lang = this.lang;
    const r = DEMO_RANGE[axis];
    const val = h("b", { class: "dm-val num" });
    const now = h("span", { class: "dm-now num" });
    const id = `dm-${axis}-${Math.random().toString(36).slice(2, 7)}`;
    const range = h("input", {
      type: "range",
      id,
      min: String(axis === "hdg" ? 0 : r.min),
      max: String(axis === "hdg" ? 355 : r.max),
      step: String(r.step),
      class: "dm-range",
    }) as HTMLInputElement;
    range.addEventListener("input", () =>
      this.act((p, sim) => p.set(axis, Number(range.value), sim)),
    );
    const step = (sign: number) => (ev: Event) =>
      this.act((p, sim) => {
        const base =
          axis === "bank" && p.t.lateral !== "bank"
            ? Math.round(sim.ac.data.rollDeg / 5) * 5
            : axis === "pitch" && p.t.vertical !== "pitch"
              ? Math.round(sim.ac.data.pitchDeg)
              : p.t[axis];
        p.set(axis, base + sign * ((ev as MouseEvent).shiftKey ? r.big : r.step), sim);
      });
    const name = dw(axis, lang);
    const el = h(
      "div",
      { class: `dm-row dm-${axis}` },
      h(
        "div",
        { class: "dm-rh" },
        h("label", { for: id }, name),
        h("span", { class: "dm-held" }, dw("held", lang)),
        h("span", { class: "dm-sp" }),
        val,
      ),
      h(
        "div",
        { class: "dm-ctl" },
        h(
          "button",
          {
            type: "button",
            class: "dm-pm",
            "aria-label": dw("less", lang, { n: name }),
            onclick: step(-1),
          },
          "−",
        ),
        range,
        h(
          "button",
          {
            type: "button",
            class: "dm-pm",
            "aria-label": dw("more", lang, { n: name }),
            onclick: step(1),
          },
          "+",
        ),
      ),
      now,
    );
    this.rows.push({ axis, el, val, now, range });
    return el;
  }
  private chip(
    label: string,
    f: () => void,
    o: { on?: boolean; ico?: Parameters<typeof icon>[0]; off?: string } = {},
  ) {
    return h(
      "button",
      {
        type: "button",
        class: `dm-chip${o.on ? " on" : ""}`,
        ...(o.off ? { disabled: "", title: o.off } : {}),
        ...(o.on !== undefined
          ? { "aria-pressed": o.on ? "true" : "false" }
          : {}),
        onclick: f,
      },
      o.ico ? icon(o.ico) : null,
      h("span", {}, label),
    );
  }
  private stateText(): string {
    const e = this.entry;
    if (this.who === "student") return dw("student", this.lang);
    return this.pilot && !this.pilot.active && e && motionOwns(e) ? dw("watch", this.lang) : dw("you", this.lang);
  }
  /** The quick actions: built again only when what they say changes (« Monter à 4 000 ft »…). */
  private fillChips() {
    const box = this.chipsEl;
    const e = this.entry;
    if (!box || !e) return;
    const alt = e.sim.ac.s.altFt;
    const sig = [
      climbTarget(alt),
      descendTarget(alt, groundOf(e.sim)),
      canClimb(alt),
      canDescend(alt, groundOf(e.sim)),
      this.failOpen,
      this.frozen,
      e.motion?.state ?? "",
      Object.values(e.sim.failures).join(""),
      this.lang,
    ].join("|");
    if (sig === this.chipsSig) return;
    const act = document.activeElement;
    const idx = act && box.contains(act) ? [...box.querySelectorAll("button")].indexOf(act as HTMLButtonElement) : -1;
    this.chipsSig = sig;
    box.replaceChildren(this.chips());
    if (idx >= 0) box.querySelectorAll("button")[idx]?.focus({ preventScroll: true });
  }
  private chips(): HTMLElement {
    const lang = this.lang;
    const e = this.entry!;
    const sim = e.sim;
    const alt = sim.ac.s.altFt;
    const wrap = h("div", { class: "dm-chips" });
    wrap.append(
      this.chip(dw("turnL", lang), () => this.act((p, s) => p.turn(-1, s))),
      this.chip(dw("turnR", lang), () => this.act((p, s) => p.turn(1, s))),
      this.chip(
        dw("climb", lang, { a: ftText(climbTarget(alt), lang) }),
        () => this.act((p, s) => p.climb(s)),
        canClimb(alt) ? {} : { off: lang === "fr" ? "Déjà au plafond de la démonstration" : "Already at the demonstration’s ceiling" },
      ),
      this.chip(
        dw("descend", lang, {
          a: ftText(descendTarget(alt, groundOf(sim)), lang),
        }),
        () => this.act((p, s) => p.descend(s)),
        canDescend(alt, groundOf(sim))
          ? {}
          : { off: lang === "fr" ? "Déjà à 1 000 ft du sol" : "Already 1,000 ft above the ground" },
      ),
      this.chip(dw("level", lang), () => this.act((p, s) => p.level(s))),
      this.chip(
        dw("failure", lang),
        () => {
          this.failOpen = !this.failOpen;
          this.fillChips();
        },
        { on: this.failOpen },
      ),
      this.chip(
        this.frozen ? dw("unfreeze", lang) : dw("freeze", lang),
        () => this.toggleFreeze(),
        {
          on: this.frozen,
          ico: this.frozen ? "play" : "timer",
        },
      ),
      this.chip(dw("reset", lang), () => this.reset(), { ico: "refresh" }),
    );
    if (e.motionSpec) {
      const st = e.motion?.state;
      wrap.append(
        this.chip(dw("replay", lang), () => this.replay(), { ico: "play" }),
      );
      if (st === "playing" || st === "paused")
        wrap.append(
          this.chip(
            st === "paused" ? dw("resume", lang) : dw("pause", lang),
            () => {
              const r = this.entry?.motion;
              if (!r) return;
              const op = r.state === "paused" ? "resume" : "pause";
              if (op === "pause") r.pause();
              else r.resume();
              this.o.sims.ensureLoop();
              this.o.onAnim(entryId(this.entry!), op);
              this.fillChips();
            },
          ),
        );
    }
    if (!this.failOpen) return wrap;
    const list = h("div", {
      class: "dm-fails",
      role: "group",
      "aria-label": dw("failures", lang),
    });
    for (const k of demoFailures(this.o.failures)) {
      const on = !!sim.failures[k];
      list.append(
        this.chip(
          failureName(k, lang),
          () => {
            const cur = this.entry?.sim;
            if (!cur) return;
            this.take();
            cur.setFailure(k, !cur.failures[k]);
            this.o.sims.touch(this.entry!);
            this.fillChips();
          },
          { on },
        ),
      );
    }
    return h("div", {}, wrap, list);
  }
  private toggleFreeze() {
    const e = this.entry;
    if (!e) return;
    if (!this.pilot?.active) this.take();
    this.frozen = !this.frozen;
    this.o.sims.run(e, !this.frozen);
    this.fillChips();
  }
  private reset() {
    const e = this.entry;
    if (!e) return;
    this.o.sims.restart(e);
    this.frozen = false;
    this.pilot = new DemoPilot(e.sim);
    this.o.onAnim(entryId(e), "replay");
    this.o.onChange();
    this.render();
  }
  private replay() {
    const e = this.entry;
    if (!e) return;
    this.o.sims.restart(e);
    this.pilot = new DemoPilot(e.sim);
    this.frozen = false;
    this.o.sims.ensureLoop();
    this.o.onAnim(entryId(e), "replay");
    this.o.onChange();
    this.render();
  }
  /** The values on the deck, from the aircraft (a few times a second). */
  sync() {
    const e = this.entry;
    const p = this.pilot;
    if (!e || !p) return;
    const sim = e.sim;
    const d = sim.ac.data;
    const lang = this.lang;
    const t = p.t;
    const fly = p.active;
    if (this.stateEl) this.stateEl.textContent = this.stateText();
    this.fillChips();
    for (const r of this.rows) {
      let target = "";
      let now = "";
      let value = 0;
      let held = false;
      switch (r.axis) {
        case "hdg":
          value = fly ? t.hdg : norm360(d.hdgTrue);
          target = hdgText(value);
          now = dw("now", lang, { v: hdgText(d.hdgTrue) });
          held = fly && t.lateral === "hdg" && Math.abs(norm180(d.hdgTrue - t.hdg)) <= 10;
          break;
        case "alt":
          value = fly ? t.alt : sim.ac.s.altFt;
          target = ftText(Math.round(value / 10) * 10, lang);
          now = dw("now", lang, {
            v: `${ftText(Math.round(sim.ac.s.altFt / 10) * 10, lang)} · ${vsText(d.vsFpm, lang)}`,
          });
          held = fly && t.vertical === "alt" && Math.abs(sim.ac.s.altFt - t.alt) <= 100;
          break;
        case "power":
          value = fly ? t.power : Math.round(sim.controls.throttle * 100);
          target = `${Math.round(value)} %`;
          now = `${Math.round(sim.ac.s.rpm / 10) * 10} ${lang === "fr" ? "tr/min" : "RPM"} · ${Math.round(d.iasKt)} kt`;
          break;
        case "bank":
          value = fly && t.lateral === "bank" ? t.bank : d.rollDeg;
          target = bankText(value, lang);
          now = dw("now", lang, { v: bankText(d.rollDeg, lang) });
          held = fly && t.lateral === "bank" && Math.abs(d.rollDeg - t.bank) <= 5;
          break;
        case "pitch":
          value = fly && t.vertical === "pitch" ? t.pitch : d.pitchDeg;
          target = pitchText(value);
          now = dw("now", lang, { v: pitchText(d.pitchDeg) });
          held = fly && t.vertical === "pitch" && Math.abs(d.pitchDeg - t.pitch) <= 3;
          break;
      }
      r.val.textContent = target;
      r.now.textContent = now;
      r.el.classList.toggle("held", held);
      if (document.activeElement !== r.range)
        r.range.value = String(Math.round(value));
      r.range.setAttribute("aria-valuetext", target);
    }
  }
  destroy() {
    this.pilot?.release();
    this.el.remove();
  }
}
function vsText(v: number, lang: Lang): string {
  const r = Math.round(v / 50) * 50;
  if (Math.abs(r) < 50) return lang === "fr" ? "en palier" : "level";
  return `${r > 0 ? "+" : "−"}${Math.abs(r)} ft/min`;
}

// ------------------------------------------------------------------ the console's « Démonstration » card
const P = {
  card: ["Demonstration", "Démonstration"],
  cardLine: [
    "The instruments of this slide are live on the projector.",
    "Les instruments de cette diapo sont en direct sur la projection.",
  ],
  fly: ["Fly the demonstration", "Piloter la démonstration"],
  flySub: ["Heading, altitude, power: the projector follows", "Cap, altitude, puissance : la projection suit"],
  sim: ["Open the simulator", "Ouvrir le simulateur"],
  simSub: ["The full cockpit, from this situation", "Le poste de pilotage complet, sur cette situation"],
  simNone: [
    "This slide names no flight situation of the course: choose one in the editor (« Situation de vol »).",
    "Cette diapo ne nomme pas de situation de vol du cours : choisissez-en une dans l’éditeur (« Situation de vol »).",
  ],
  simOff: [
    "The simulator is not available in this build.",
    "Le simulateur n’est pas disponible dans cette version.",
  ],
  simFail: ["The simulator could not open. Try again.", "Le simulateur n’a pas pu s’ouvrir. Réessayez."],
  simOpening: ["Opening the simulator…", "Ouverture du simulateur…"],
  give: ["Let a student fly here", "Faire piloter un élève ici"],
  giveSub: ["The student flies here, the projector says so", "L’élève pilote ici, la projection l’affiche"],
  hintTitle: ["Three ways to show the aircraft", "Trois façons de montrer l’avion"],
  hint1: [
    "Fly the demonstration: you turn, climb and change the power; the projector shows the same instruments.",
    "Piloter la démonstration : vous virez, montez, changez la puissance ; la projection montre les mêmes instruments.",
  ],
  hint2: [
    "Open the simulator: the full cockpit on this situation; « Back to the course » brings you back here.",
    "Ouvrir le simulateur : le poste de pilotage sur cette situation ; « Reprendre le cours » vous ramène ici.",
  ],
  hint3: [
    "Let a student fly here: « Your turn », the student flies at this device.",
    "Faire piloter un élève ici : « À vous », l’élève pilote sur cet appareil.",
  ],
  gotIt: ["Got it", "Compris"],
  demoBrief: [
    "The instructor’s demonstration: the situation of the slide.",
    "Démonstration de l’instructeur : la situation de la diapo.",
  ],
} as const;
const pw = (k: keyof typeof P, lang: Lang): string => P[k][lang === "fr" ? 1 : 0];
const HINT_KEY = "ifr.demoHint.v1";
/** the first-time hint shows this long (ms) */
export const DEMO_HINT_MS = 20000;
/** Show the first-time hint (once per browser). */
export function hintDue(kv: Pick<Storage, "getItem"> | null): boolean {
  try {
    return !kv?.getItem(HINT_KEY);
  } catch {
    return false;
  }
}

/** What the console gives the card. */
export interface DemoPanelHost {
  lang(): Lang;
  course: Course;
  store: CourseStore | null;
  page?: string;
  step(): Step;
  /** the slide on screen (its situations) */
  slide(): SlideHost | null;
  post(m: PresentWire): void;
  /** the « Piloter » button may be the filled one (the projector button no longer is) */
  primary(): boolean;
  /** the card's height changed (the console lays out its side again) */
  changed?(): void;
}

/** The scene id of the slide's first instrument that names a situation of the course (the cockpit opens it). */
export function slideSceneId(step: Step, course: Course): { scene: string; block: string } | null {
  const slide = step.slide;
  if (!slide) return null;
  for (const b of slide.blocks) {
    if (b.kind !== "instrument" && b.kind !== "simViewport") continue;
    const sc = (b as { scene?: unknown }).scene ?? slide.scene;
    if (typeof sc === "string" && course.scenes?.[sc]) return { scene: sc, block: b.id };
  }
  return null;
}
/** The failures the slide names: its presenter actions, its instruments' failures, its situations'. */
export function slideFailures(step: Step, entries: SimEntry[]): string[] {
  const out: string[] = [];
  const acts = [
    ...((step as { presenter?: PresenterAction[] }).presenter ?? []),
    ...((step as { stage?: { presenter?: PresenterAction[] } }).stage?.presenter ?? []),
  ];
  for (const a of acts) if (a.k === "failure") out.push(a.key);
  for (const b of step.slide?.blocks ?? [])
    for (const [k, on] of Object.entries((b as { failures?: Record<string, boolean> }).failures ?? {}))
      if (on) out.push(k);
  for (const e of entries)
    for (const [k, on] of Object.entries((e.scene as { failures?: Record<string, boolean> }).failures ?? {}))
      if (on) out.push(k);
  return out;
}

export class DemoPanel {
  readonly el: HTMLElement;
  deck: DemoDeck | null = null;
  private boundTo: SceneSims | null = null;
  private simsT = 0;
  private hintT = 0;
  private hintShown = false;
  private hintEl: HTMLElement | null = null;
  private msg = "";
  private lastWho: DemoWhoWire = null;
  constructor(private o: DemoPanelHost) {
    this.el = h("div", { class: "dm-wrap" });
  }
  get open(): boolean {
    return !!this.deck;
  }
  private entries(): SimEntry[] {
    return slideEntries(this.o.slide()?.sims);
  }
  /** Draw the card (or the deck) for the slide on screen. */
  render() {
    const lang = this.o.lang();
    const host = this.o.slide();
    const sims = host?.sims ?? null;
    const entries = this.entries();
    if (!sims || !entries.length) {
      if (this.deck) this.close();
      this.el.hidden = true;
      this.el.replaceChildren();
      return;
    }
    this.el.hidden = false;
    if (this.deck) {
      if (this.boundTo !== sims) {
        this.deck.rebind({ sims, entries, failures: slideFailures(this.o.step(), entries), yourTurn: this.yourTurnFn() });
        this.boundTo = sims;
      }
      this.deck.setLang(lang);
      if (this.deck.el.parentElement !== this.el) this.el.replaceChildren(this.deck.el);
      return;
    }
    const where = slideSceneId(this.o.step(), this.o.course);
    const launch = (
      label: string,
      sub: string,
      ico: Parameters<typeof icon>[0],
      f: () => void,
      cls = "",
      disabled = false,
    ) =>
      h(
        "button",
        { type: "button", class: `dm-btn ${cls}`.trim(), onclick: f, disabled },
        icon(ico),
        h("span", {}, label, h("small", {}, sub)),
      );
    const kids: HTMLElement[] = [];
    if (this.hintEl) kids.push(this.hintEl);
    else if (!this.hintShown && hintDue(safeStorage())) kids.push((this.hintEl = this.hint(lang)));
    kids.push(
      h(
        "section",
        { class: "dm-card", "aria-label": pw("card", lang) },
        h("h2", {}, pw("card", lang)),
        h("p", {}, pw("cardLine", lang)),
        h(
          "div",
          { class: "dm-launch" },
          launch(pw("fly", lang), pw("flySub", lang), "plane", () => this.openDeck("instructor"), this.o.primary() ? "primary" : ""),
          launch(pw("sim", lang), where ? pw("simSub", lang) : pw("simNone", lang), "next", () => void this.openSim(), "", !where || !this.o.store),
          launch(pw("give", lang), pw("giveSub", lang), "flag", () => this.openDeck("student")),
        ),
        h("p", { class: "dm-msg", role: "status" }, this.msg),
      ),
    );
    this.el.replaceChildren(...kids);
  }
  private hint(lang: Lang): HTMLElement {
    this.hintShown = true;
    try {
      safeStorage()?.setItem(HINT_KEY, "1");
    } catch {
      /* private window: shown again next time */
    }
    const el = h(
      "div",
      { class: "dm-hint", role: "note" },
      h("b", {}, pw("hintTitle", lang)),
      h("ul", {}, h("li", {}, pw("hint1", lang)), h("li", {}, pw("hint2", lang)), h("li", {}, pw("hint3", lang))),
      h("button", { type: "button", onclick: () => drop() }, pw("gotIt", lang)),
    );
    const drop = () => {
      window.clearTimeout(this.hintT);
      this.hintEl = null;
      el.remove();
      this.o.changed?.();
    };
    this.hintT = window.setTimeout(drop, DEMO_HINT_MS);
    return el;
  }
  private yourTurnFn(): (() => void) | undefined {
    const host = this.o.slide();
    const b = host?.el.querySelector<HTMLButtonElement>(".sl-yourturn");
    return b ? () => b.click() : undefined;
  }
  openDeck(who: DemoWho) {
    const host = this.o.slide();
    const sims = host?.sims;
    const entries = this.entries();
    if (!sims || !entries.length) return;
    if (!this.deck) {
      this.deck = new DemoDeck({
        lang: this.o.lang(),
        sims,
        entries,
        failures: slideFailures(this.o.step(), entries),
        yourTurn: this.yourTurnFn(),
        onClose: () => this.close(),
        onChange: () => this.postSims(true),
        onAnim: (id, op) => this.o.post({ t: "anim", stepId: this.o.step().id, id, op }),
      });
      this.boundTo = sims;
    }
    this.deck.setWho(who);
    this.el.closest(".pr-app")?.classList.add("dm-on");
    this.render();
    this.o.changed?.();
    // the focus goes to the deck itself (not a slider that would swallow Space): its keys work at once
    if (who === "student") this.deck.el.querySelector<HTMLElement>(".dm-btn")?.focus({ preventScroll: true });
    else {
      if (!this.deck.el.hasAttribute("tabindex")) this.deck.el.tabIndex = -1;
      this.deck.el.focus({ preventScroll: true });
    }
    this.postSims(true);
  }
  close() {
    const d = this.deck;
    if (!d) return;
    this.deck = null;
    this.boundTo = null;
    this.el.closest(".pr-app")?.classList.remove("dm-on");
    d.destroy();
    this.render();
    this.o.changed?.();
    this.postSims(true);
  }
  /** who flies, for the projector's badge */
  who(): DemoWhoWire {
    const d = this.deck;
    if (!d) return null;
    if (d.who === "student") return "student";
    return d.flying ? "instructor" : null;
  }
  /** A key of the console: the deck takes its keys while it is open (true: used). */
  key(e: KeyboardEvent): boolean {
    if (!this.deck) return false;
    const t = e.target as HTMLElement | null;
    // the deck's own sliders fly too (arrows, Page, [ ]): only other fields keep their keys
    if (
      !t?.classList?.contains("dm-range") &&
      t?.closest?.("input, textarea, select, [contenteditable='true'], .sl-strip")
    )
      return false;
    if (e.metaKey || e.ctrlKey || e.altKey) return false;
    if (!this.deck.key(e)) return false;
    this.postSims(true);
    return true;
  }
  /** The presenter touched the slide's own control strip: the strip flies (the deck lets go). */
  stripTouched() {
    const d = this.deck;
    if (d?.pilot?.active) {
      d.pilot.release();
      this.postSims(true);
    }
  }
  /** About every 50 ms: the deck's values, and the slide's aircraft to the projector. */
  tick(now = Date.now()) {
    this.deck?.sync();
    this.postSims(false, now);
  }
  private postSims(force: boolean, now = Date.now()) {
    const sims = this.o.slide()?.sims;
    if (!sims) return;
    const entries = slideEntries(sims);
    if (!entries.length) return;
    const list = entries.filter((e) => !motionOwns(e));
    const live = list.some((e) => entryLive(sims, e));
    const who = this.who();
    const period = live || who ? SIMS_PERIOD_MS : SIMS_IDLE_MS;
    if (!force && who === this.lastWho && now - this.simsT < period) return;
    this.simsT = now;
    this.lastWho = who;
    this.o.post({
      t: "sims",
      stepId: this.o.step().id,
      who,
      list: list.map((e) => mirrorOf(entryId(e), e.sim)),
    });
  }
  /** « Ouvrir le simulateur »: the cockpit on the slide's situation; « Reprendre le cours » comes back here. */
  async openSim(navigate: (url: string) => void = (u) => window.location.assign(u)) {
    const lang = this.o.lang();
    const step = this.o.step();
    const where = slideSceneId(step, this.o.course);
    const store = this.o.store;
    if (!where || !store) return;
    const say = (k: keyof typeof P) => {
      this.msg = pw(k, lang);
      this.render();
    };
    say("simOpening");
    try {
      const { cockpitBridgeReady } = await import("../cockpitLink");
      if (!cockpitBridgeReady()) return say("simOff");
      const { createHandoff, flyUrl } = await import("../handoff");
      const { academyHref } = await import("./library");
      const yt: YourTurn = {
        where: "sim",
        prompt: { en: P.demoBrief[0], fr: P.demoBrief[1] },
        controls: [],
        goal: { all: [], graded: false },
      };
      const hd = await createHandoff(store, {
        course: this.o.course,
        step,
        yourTurn: { block: where.block, yourTurn: yt, sceneId: where.scene },
        returnUrl: academyHref({ k: "present", id: this.o.course.id, s: step.id }, this.o.page),
      });
      this.o.post({ t: "away", on: true });
      this.msg = "";
      navigate(flyUrl(hd.token));
    } catch {
      say("simFail");
    }
  }
  destroy() {
    window.clearTimeout(this.hintT);
    this.deck?.destroy();
    this.deck = null;
    this.el.remove();
  }
}
function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
