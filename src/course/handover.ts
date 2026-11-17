// Taking the controls — the hand-over of the aircraft to the student, the same everywhere a course does it:
// a Try it step on the stage, a Your turn on a slide's instrument, a Fly it / Your turn in the full simulator and
// the take-over from a Show me clip.
//
//   BEFORE   the « À vous » card: what to do, with which control ON THIS DEVICE, the goal and its tolerance, how it
//            ends; aircraft and clock frozen until « Prendre les commandes » or the first touch of a control.
//   DURING   « Vous avez les commandes »: the live area framed, the usable controls named, « Rendre les commandes ».
//   AFTER    the result in plain words with the reason, « Réessayer » from the same start, the course continues.
//
// This module is pure (no DOM): the words a course did not write are DERIVED here from its data (controls, goal
// checks, tolerances, hold time, duration, assist), so every existing course gets a proper hand-over without an
// edit; an author overrides nothing here, a better prompt or Do this row simply shows instead. The state machine
// and the keyboard map live here too, so they are tested without a browser. DOM: stage/handoverLayer.ts.
import { rowsFor } from "./goals";
import { hw, hwq } from "./handoverWords";
import type { Lang, StageControl, StageCue, StepGoal } from "./types";

export { HANDOVER_WORDS, hw, hwq, type HandoverWord } from "./handoverWords";

// ------------------------------------------------------------------ device
/** How the student acts on this device: the card names the gesture for it, never all three. */
export type InputDevice = "mouse" | "touch" | "keyboard";

interface DeviceProbe {
  matchMedia?: (q: string) => { matches: boolean };
  navigator?: { maxTouchPoints?: number };
}
/** The device from the browser: a coarse pointer with no fine one is touch (iPad); else the mouse. The keyboard is
 *  never guessed: the layer switches to it when the card was opened from the keyboard. */
export function detectDevice(
  w: DeviceProbe | undefined = globalThis as DeviceProbe,
): InputDevice {
  try {
    const mm = w?.matchMedia?.bind(w);
    const coarse = !!mm?.("(pointer: coarse)").matches;
    const fine = !!mm?.("(any-pointer: fine)").matches;
    if (coarse && !fine) return "touch";
    if (!mm && (w?.navigator?.maxTouchPoints ?? 0) > 0) return "touch";
  } catch {
    /* no media queries: the mouse wording */
  }
  return "mouse";
}

// ------------------------------------------------------------------ state machine
/**
 * idle → briefed → inControl → done | handedBack, with retry back to briefed and the Show me detour:
 *
 *   idle        no hand-over on this step
 *   briefed     the « À vous » card is up; aircraft and clock frozen
 *   demo        a Show me clip plays; the instructor has the controls
 *   inControl   « Vous avez les commandes »
 *   handedBack  the student gave the controls back before the goal: frozen, what is missing is shown
 *   done        the goal is met: frozen, the result is shown
 */
export type HandoverState =
  | "idle"
  | "briefed"
  | "demo"
  | "inControl"
  | "handedBack"
  | "done";
export type HandoverEvent =
  | "offer"
  | "take"
  | "handBack"
  | "met"
  | "retry"
  | "showMe"
  | "demoEnd"
  | "clear";

const FLOW: Record<
  HandoverState,
  Partial<Record<HandoverEvent, HandoverState>>
> = {
  idle: { offer: "briefed" },
  briefed: { take: "inControl", showMe: "demo" },
  demo: { take: "inControl", demoEnd: "briefed", handBack: "briefed" },
  inControl: {
    handBack: "handedBack",
    met: "done",
    retry: "briefed",
    showMe: "demo",
  },
  handedBack: { take: "inControl", retry: "briefed", showMe: "demo" },
  done: { retry: "briefed" },
};
/** The next state; an event that makes no sense in a state leaves it unchanged (a late timer, a double click). */
export function handoverNext(
  s: HandoverState,
  e: HandoverEvent,
): HandoverState {
  if (e === "clear") return "idle";
  if (e === "offer") return "briefed";
  return FLOW[s][e] ?? s;
}
/** The aircraft and the clock run only while someone flies: the student, or the clip. */
export const handoverRuns = (s: HandoverState): boolean =>
  s === "inControl" || s === "demo";
/** What a screen reader hears when the state changes. */
export function handoverAnnounce(s: HandoverState, lang: Lang = "en"): string {
  const fr = lang === "fr";
  switch (s) {
    case "briefed":
      return fr
        ? `${hw("yourTurn", lang)}. L’avion attend en pause.`
        : `${hw("yourTurn", lang)}. The aircraft waits, paused.`;
    case "demo":
      return fr ? "Démonstration : regardez." : "Demonstration: watch.";
    case "inControl":
      return `${hw("youHave", lang)}.`;
    case "handedBack":
      return fr
        ? "Commandes rendues. L’avion est en pause."
        : "Controls handed back. The aircraft is paused.";
    case "done":
      return fr
        ? "Réussi. L’avion est en pause."
        : "Done. The aircraft is paused.";
    default:
      return "";
  }
}

// ------------------------------------------------------------------ controls: names, gestures, keys
/** The order the stage draws the controls in (stage/controls.ts controlSpecs); the number keys follow it. */
export const CONTROL_ORDER: readonly StageControl[] = [
  "obs1",
  "obs2",
  "crs",
  "hdgBug",
  "altBug",
  "baro",
  "bank",
  "pitch",
  "power",
  "cdiSource",
  "brg1",
  "brg2",
  "ap",
  "dragAircraft",
];
export const orderControls = (list: readonly StageControl[]): StageControl[] =>
  CONTROL_ORDER.filter((c) => list.includes(c));

export type ControlGesture =
  | "knob"
  | "bank"
  | "pitch"
  | "power"
  | "key"
  | "drag";
export const gestureOf = (c: StageControl): ControlGesture =>
  c === "bank" || c === "pitch" || c === "power"
    ? c
    : c === "dragAircraft"
      ? "drag"
      : c === "cdiSource" || c === "brg1" || c === "brg2" || c === "ap"
        ? "key"
        : "knob";

const NAMES: Record<StageControl, readonly [string, string]> = {
  obs1: ["Course knob (OBS)", "Bouton de route (OBS)"],
  obs2: ["Course knob 2 (OBS 2)", "Bouton de route 2 (OBS 2)"],
  crs: ["Course knob (CRS)", "Bouton de route (CRS)"],
  hdgBug: ["Heading bug", "Index de cap"],
  altBug: ["Altitude select", "Altitude affichée"],
  baro: ["Altimeter setting", "Calage altimétrique"],
  bank: ["Bank", "Inclinaison"],
  pitch: ["Pitch", "Assiette"],
  power: ["Power", "Puissance"],
  cdiSource: ["CDI key", "Touche CDI"],
  brg1: ["BRG 1 key", "Touche BRG 1"],
  brg2: ["BRG 2 key", "Touche BRG 2"],
  ap: ["Autopilot key", "Touche du pilote automatique"],
  dragAircraft: [
    "The aircraft on the top view",
    "L’avion sur la vue de dessus",
  ],
};
/** The plain name of a control ("Heading bug" / « Index de cap »). */
export const controlName = (c: StageControl, lang: Lang = "en"): string =>
  NAMES[c][lang === "fr" ? 1 : 0];

const HOW: Record<
  ControlGesture,
  Record<InputDevice, readonly [string, string]>
> = {
  knob: {
    mouse: [
      "drag the knob, or click − / +",
      "faites glisser le bouton, ou cliquez sur − / +",
    ],
    touch: ["slide the knob, or tap − / +", "glissez le bouton, ou touchez − / +"],
    keyboard: [
      "← → turn it one step, Shift for ten",
      "← → le tournent d’un cran, Maj pour dix",
    ],
  },
  bank: {
    mouse: [
      "hold ◀ or ▶: the aircraft turns while you press",
      "maintenez ◀ ou ▶ : l’avion vire tant que vous appuyez",
    ],
    touch: [
      "touch and hold ◀ or ▶: the aircraft turns while you press",
      "touchez et maintenez ◀ ou ▶ : l’avion vire tant que vous appuyez",
    ],
    keyboard: [
      "hold ← or →: the aircraft turns while you press",
      "maintenez ← ou → : l’avion vire tant que vous appuyez",
    ],
  },
  pitch: {
    mouse: [
      "hold ▲ to raise the nose, ▼ to lower it",
      "maintenez ▲ pour cabrer, ▼ pour piquer",
    ],
    touch: [
      "touch and hold ▲ to raise the nose, ▼ to lower it",
      "touchez et maintenez ▲ pour cabrer, ▼ pour piquer",
    ],
    keyboard: [
      "hold ↓ to raise the nose (pull), ↑ to lower it (push), as on the yoke",
      "maintenez ↓ pour cabrer (tirer), ↑ pour piquer (pousser), comme au manche",
    ],
  },
  power: {
    mouse: [
      "click − or +, one step each",
      "cliquez sur − ou +, un cran par clic",
    ],
    touch: ["tap − or +, one step each", "touchez − ou +, un cran par appui"],
    keyboard: [
      "− and + keys, one step each",
      "touches − et +, un cran par appui",
    ],
  },
  key: {
    mouse: ["click the key", "cliquez sur la touche"],
    touch: ["tap the key", "touchez la touche"],
    keyboard: ["Enter presses the key", "Entrée appuie sur la touche"],
  },
  drag: {
    mouse: [
      "drag the aircraft on the top view",
      "faites glisser l’avion sur la vue de dessus",
    ],
    touch: [
      "drag the aircraft with a finger on the top view",
      "faites glisser l’avion du doigt sur la vue de dessus",
    ],
    keyboard: [
      "Tab to the top view, then the arrow keys move the aircraft",
      "Tab jusqu’à la vue de dessus, puis les flèches déplacent l’avion",
    ],
  },
};
const KEYS: Record<ControlGesture, readonly string[]> = {
  knob: ["←", "→"],
  bank: ["←", "→"],
  pitch: ["↓", "↑"],
  power: ["−", "+"],
  key: ["↵"],
  drag: ["←", "→", "↑", "↓"],
};
/** How a control is used on a device, as a sentence fragment ("drag the knob, or click − / +"). */
export const controlHow = (
  c: StageControl,
  device: InputDevice,
  lang: Lang = "en",
): string => HOW[gestureOf(c)][device][lang === "fr" ? 1 : 0];
/** The keys of a control (shown as key caps on a device with a keyboard). */
export const controlKeys = (c: StageControl): readonly string[] =>
  KEYS[gestureOf(c)];

// ------------------------------------------------------------------ keyboard map
/** What a key does while the student has the controls (stage/handoverLayer.ts applies it). */
export type KeyAction =
  | { k: "handBack" }
  | { k: "select"; index: number }
  | { k: "turn"; control: StageControl; d: -1 | 1; coarse: boolean }
  | { k: "hold"; control: "bank" | "pitch"; dir: -1 | 1 }
  | { k: "power"; d: -1 | 1 }
  | { k: "press"; control: StageControl };

/**
 * The keyboard map, per control kind. One control is "chosen" (the first by default, 1…9 choose another): the arrow
 * keys act on it. Bank and pitch are one yoke: ← → always bank and ↑ ↓ always pitch when either is chosen (↓ pulls
 * = nose up, as in the cockpit). Knobs: ← → (or ↓ ↑) one step, Shift ten. Power: − / + from anywhere. The older
 * direct keys stay: [ ] the heading bug, A / D bank. Esc hands the controls back. Returns null for a key that is
 * not a control (the page keeps it), and for the top view (it has its own arrow keys when focused).
 */
export function keyAction(
  e: { key: string; code?: string; shiftKey?: boolean },
  controls: readonly StageControl[],
  chosen = 0,
): KeyAction | null {
  const list = orderControls(controls);
  const has = (c: StageControl) => list.includes(c);
  const k = e.key;
  const coarse = !!e.shiftKey;
  if (k === "Escape") return { k: "handBack" };
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code ?? "");
  if (digit && list.length > 1) {
    const index = Number(digit[1]) - 1;
    return index < list.length ? { k: "select", index } : null;
  }
  if ((k === "[" || k === "]") && has("hdgBug"))
    return { k: "turn", control: "hdgBug", d: k === "[" ? -1 : 1, coarse };
  if ((k === "a" || k === "A" || k === "d" || k === "D") && has("bank"))
    return {
      k: "hold",
      control: "bank",
      dir: k.toLowerCase() === "a" ? -1 : 1,
    };
  if ((k === "+" || k === "=" || k === "-" || k === "_") && has("power"))
    return { k: "power", d: k === "+" || k === "=" ? 1 : -1 };
  const sel = list[Math.max(0, Math.min(list.length - 1, chosen))];
  if (!sel) return null;
  const horiz = k === "ArrowLeft" ? -1 : k === "ArrowRight" ? 1 : 0;
  const vert = k === "ArrowDown" ? -1 : k === "ArrowUp" ? 1 : 0;
  if ((k === "Enter" || k === " ") && gestureOf(sel) === "key")
    return { k: "press", control: sel };
  if (!horiz && !vert) return null;
  const g = gestureOf(sel);
  if (g === "bank" || g === "pitch") {
    if (horiz && has("bank"))
      return { k: "hold", control: "bank", dir: horiz as -1 | 1 };
    // the yoke: ↓ pulls (nose up), ↑ pushes (nose down)
    if (vert && has("pitch"))
      return {
        k: "hold",
        control: "pitch",
        dir: (vert === -1 ? 1 : -1) as -1 | 1,
      };
    return null;
  }
  if (g === "power") return { k: "power", d: (horiz || vert) as -1 | 1 };
  if (g === "knob")
    return { k: "turn", control: sel, d: (horiz || vert) as -1 | 1, coarse };
  return null;
}

// ------------------------------------------------------------------ the brief (derived)
export interface HandoverInput {
  /** where the student acts: the stage / a slide's instrument, or the full simulator */
  where: "stage" | "sim";
  controls?: readonly StageControl[];
  goal?: StepGoal | null;
  /** the author's own Do this rows, by check index (shown instead of the derived row) */
  rowTexts?: readonly (string | undefined)[];
  assist?: StageCue["assist"];
  /** a clock runs once the student has the controls (a live stage); false: only the control moves */
  clock?: boolean;
  /** sim: the run ends after this long */
  durationS?: number;
  /** sim: the run also ends earlier, when its end condition is met (durationS is then the most it lasts) */
  endsEarly?: boolean;
  /** the goal was already met on an earlier visit */
  alreadyMet?: boolean;
}
export interface BriefControl {
  id: StageControl;
  name: string;
  /** the gesture on this device, as a sentence */
  how: string;
  /** key caps (empty on touch) */
  keys: string[];
  /** the number key that chooses it (only with several controls and a keyboard) */
  pick?: string;
}
export interface HandoverBrief {
  controls: BriefControl[];
  /** the goal rows with their tolerance ("Turn left to heading 021 (±5°)") */
  goals: string[];
  /** how it ends */
  ends: string;
  /** graded or not, in plain words */
  stakes: string;
  /** what is frozen until the student starts */
  waits: string;
  /** what the helper keeps for the student ("Altitude and speed are held for you"), or null */
  held: string | null;
  /** several controls and a keyboard: how to choose the one the arrows drive */
  choose: string | null;
}

const secs = (s: number, lang: Lang): string => {
  const n = Math.round(s);
  if (n >= 120 && n % 60 === 0)
    return lang === "fr" ? `${n / 60} minutes` : `${n / 60} minutes`;
  if (n === 60) return lang === "fr" ? "1 minute" : "1 minute";
  return lang === "fr" ? `${n} secondes` : `${n} seconds`;
};
const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The « À vous » card's content from the step's data. Pure. */
export function deriveBrief(
  i: HandoverInput,
  device: InputDevice,
  lang: Lang = "en",
): HandoverBrief {
  const fr = lang === "fr";
  const list = orderControls(i.controls ?? []);
  const keyboard = device !== "touch";
  const controls: BriefControl[] = list.map((id, n) => ({
    id,
    name: controlName(id, lang),
    how: cap(controlHow(id, device, lang)),
    keys: keyboard ? [...controlKeys(id)] : [],
    ...(keyboard && list.length > 1 && gestureOf(id) !== "drag"
      ? { pick: String(n + 1) }
      : {}),
  }));
  const goal = i.goal && i.goal.all.length ? i.goal : null;
  const rows = goal ? rowsFor(goal, lang).filter((r) => r.check >= 0) : [];
  const goals = rows.map((r) => i.rowTexts?.[r.check] ?? r.text);
  const hold = goal?.holdS ?? 0;
  let ends: string;
  if (i.where === "sim" && i.durationS && i.endsEarly)
    ends = fr
      ? `Le vol s’arrête de lui-même quand l’exercice est terminé (au plus tard après ${secs(i.durationS, lang)}), puis le résultat s’affiche.`
      : `The flight stops by itself when the exercise is over (after ${secs(i.durationS, lang)} at most), then the result shows.`;
  else if (i.where === "sim" && i.durationS)
    ends = fr
      ? `Le vol s’arrête de lui-même après ${secs(i.durationS, lang)}, puis le résultat s’affiche.`
      : `The flight stops by itself after ${secs(i.durationS, lang)}, then the result shows.`;
  else if (i.where === "sim")
    ends = fr
      ? "Le vol s’arrête de lui-même quand l’exercice est terminé, puis le résultat s’affiche."
      : "The flight stops by itself when the exercise is over, then the result shows.";
  else if (!goal)
    ends = fr
      ? `Rien à réussir ici : essayez, puis ${hwq("handBack", lang)} quand vous avez vu.`
      : `Nothing to pass here: try it, then ${hwq("handBack", lang)} when you have seen it.`;
  else if (hold > 0)
    ends = fr
      ? `C’est réussi quand ${goals.length > 1 ? "tout est tenu" : "c’est tenu"} ${secs(hold, lang)} de suite. Le chrono repart de zéro à chaque sortie de la tolérance.`
      : `You are done when ${goals.length > 1 ? "everything is held" : "it is held"} for ${secs(hold, lang)} in a row. The timer restarts each time you leave the tolerance.`;
  else
    ends = fr
      ? `C’est réussi dès que ${goals.length > 1 ? "chaque ligne est cochée" : "la ligne est cochée"}.`
      : `You are done as soon as ${goals.length > 1 ? "every row is ticked" : "the row is ticked"}.`;
  const assisted = !!(
    i.assist?.holdAlt ||
    i.assist?.holdIas ||
    (i.assist?.timeScale ?? 1) > 1
  );
  const stakes =
    i.where === "sim"
      ? fr
        ? "Le simulateur note le vol ; vous pouvez le refaire autant de fois que vous voulez."
        : "The simulator marks the flight; fly it as many times as you like."
      : goal?.graded && !assisted
        ? fr
          ? "Cet exercice compte dans votre suivi. Vous pouvez réessayer."
          : "This exercise counts in your record. You can try again."
        : fr
          ? "Pour s’entraîner : sans note, autant d’essais que vous voulez."
          : "For practice: not graded, as many tries as you like.";
  const waits =
    i.where === "sim"
      ? fr
        ? `L’avion attend en pause à sa position de départ : rien ne bouge avant ${hwq("take", lang)}.`
        : `The aircraft waits, paused, at its start position: nothing moves before ${hwq("take", lang)}.`
      : i.clock === false
        ? fr
          ? "Pas de chrono ici : rien ne bouge tout seul, seule votre commande agit."
          : "No clock here: nothing moves by itself, only your control does."
        : fr
          ? `L’avion et le chrono attendent : rien ne bouge avant ${hwq("take", lang)}.`
          : `The aircraft and the clock wait: nothing moves before ${hwq("take", lang)}.`;
  const a = i.assist;
  const held =
    a?.holdAlt && a.holdIas
      ? fr
        ? "L’altitude et la vitesse sont tenues pour vous."
        : "Altitude and speed are held for you."
      : a?.holdAlt
        ? fr
          ? "L’altitude est tenue pour vous."
          : "Altitude is held for you."
        : a?.holdIas
          ? fr
            ? "La vitesse est tenue pour vous."
            : "Speed is held for you."
          : null;
  const pickable = controls.filter((c) => c.pick);
  const choose =
    pickable.length > 1
      ? fr
        ? `Au clavier : les touches ${pickable.map((c) => c.pick).join(", ")} choisissent la commande, les flèches la pilotent.`
        : `Keyboard: keys ${pickable.map((c) => c.pick).join(", ")} choose the control, the arrow keys drive it.`
      : null;
  return { controls, goals, ends, stakes, waits, held, choose };
}

/** The prompt without a leading « À vous : » / "Your turn:" (the card's kicker already says it). */
export const barePrompt = (p: string): string => {
  const m = /^\s*(?:à vous|your turn)\s*[:—–-]\s*(.+)$/is.exec(p);
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : p;
};

// ------------------------------------------------------------------ the result (after)
export interface ResultRow {
  text: string;
  /** met once (sticky) */
  ticked: boolean;
  /** true right now (when the tracker says; else `ticked` stands for it) */
  now?: boolean;
  /** the value now ("HDG 040") */
  readout?: string;
}
export interface HandoverResult {
  ok: boolean;
  /** "Done" / "Not yet" */
  title: string;
  /** one plain sentence: why */
  why: string;
  /** the rows that are not within tolerance right now (empty when ok) */
  missing: ResultRow[];
}
/**
 * The result in plain words, with the reason. Not met: what is outside its tolerance RIGHT NOW (a row ticked
 * earlier may have drifted out again), or, when everything is inside, that it was not held long enough (`held` is
 * the hold row's readout, "4 / 10 s"). Pure.
 */
export function deriveResult(
  rows: readonly ResultRow[],
  met: boolean,
  lang: Lang = "en",
  success?: string,
  held?: string,
): HandoverResult {
  const fr = lang === "fr";
  if (met)
    return {
      ok: true,
      title: fr ? "Réussi" : "Done",
      why:
        success ??
        (fr
          ? "Tout a été tenu dans la tolérance."
          : "Everything was held within tolerance."),
      missing: [],
    };
  const missing = rows.filter((r) => !(r.now ?? r.ticked));
  const n = rows.length - missing.length;
  const title = fr ? "Pas encore" : "Not yet";
  let why: string;
  if (!rows.length)
    why = fr ? "Vous avez rendu les commandes." : "You handed back the controls.";
  else if (n === 0)
    why = fr
      ? "Rien n’est encore dans la tolérance. Voici ce qui manque :"
      : "Nothing is within tolerance yet. Here is what is missing:";
  else if (missing.length)
    why = fr
      ? `${n} sur ${rows.length} dans la tolérance en ce moment. Il manque :`
      : `${n} of ${rows.length} within tolerance right now. Still missing:`;
  else
    why = fr
      ? `Tout est dans la tolérance, mais pas encore assez longtemps${held ? ` (tenu ${held})` : ""}. Reprenez les commandes et tenez.`
      : `Everything is within tolerance, but not for long enough yet${held ? ` (held ${held})` : ""}. Take the controls again and hold it.`;
  return { ok: false, title, why, missing };
}
