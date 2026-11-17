// Ground school — designed slides: the control strip of a live instrument. When an instrument block lists
// controls and is live, the slide draws one labelled control per StageControl, attached to the instrument and
// INSIDE the block's frame (the instrument makes room: nothing else on the slide is ever covered). The same strip
// shows in the editor (usable: the author tries it, the saved start does not change), in the player (free
// exploration, no overlay), and statically in thumbnails and on the projector.
//
// The actions are the stage's own (stage/controls.ts controlSpecs → sim/avionicsControls.ts) and the flying
// controls go through the stage's assist (stage/assist.ts): the instruments are always drawn by the simulator's
// renderers from the flight state, never faked. This file has a pure half (which controls, their words, where
// the strip sits, how big) and a DOM half (the widgets).
import type { Sim } from "../../sim/sim";
import type {
  BlockFrame,
  InstrumentView,
  L10n,
  Lang,
  SlideBlock,
  SlideCanvas,
  StageControl,
} from "../types";
import { controlSpecs, dragDetents, type ControlSpec } from "../stage/controls";
import { StageAssist } from "../stage/assist";
import { orderControls } from "../handover";
import { SLIDE_H, SLIDE_W } from "./geom";

type Inst = Extract<SlideBlock, { kind: "instrument" }>;
const L = (en: string, fr: string): L10n => ({ en, fr });
const tr = (l: L10n, lang: Lang): string =>
  lang === "fr" ? (l.fr ?? l.en) : l.en;

// ------------------------------------------------------------------ which controls, in which words
export type StripWidget = "knob" | "slider" | "lever" | "key";
/** How a control is drawn on a slide (null: it has no widget on a slide, such as the aircraft on the top view). */
export const stripWidget = (c: StageControl): StripWidget | null =>
  c === "bank" || c === "pitch"
    ? "slider"
    : c === "power"
      ? "lever"
      : c === "cdiSource" || c === "brg1" || c === "brg2" || c === "ap"
        ? "key"
        : c === "dragAircraft"
          ? null
          : "knob";
/** The controls a strip draws, in the stage's display order. */
export const stripControls = (
  list: readonly StageControl[] | undefined,
): StageControl[] =>
  orderControls(list ?? []).filter((c) => stripWidget(c) !== null);

interface Words {
  /** the short name over the control on the slide */
  name: L10n;
  /** the name of the chip in the editor */
  label: L10n;
  /** one line: what the student does with it */
  desc: L10n;
  /** « Essayez : … » */
  tryIt: L10n;
}
const WORDS: Record<StageControl, Words> = {
  hdgBug: {
    name: L("Heading", "Cap"),
    label: L("Heading", "Cap"),
    desc: L("Turns the heading bug.", "Tourne l’index de cap."),
    tryIt: L("turn the heading bug", "tournez le cap"),
  },
  obs1: {
    name: L("OBS", "OBS"),
    label: L("OBS", "OBS"),
    desc: L("Chooses the course on VOR 1.", "Choisit la route sur le VOR 1."),
    tryIt: L("turn the OBS", "tournez l’OBS"),
  },
  obs2: {
    name: L("OBS 2", "OBS 2"),
    label: L("OBS 2", "OBS 2"),
    desc: L(
      "Chooses the course on VOR 2 (the VOR indicator).",
      "Choisit la route sur le VOR 2 (l’indicateur VOR).",
    ),
    tryIt: L("turn the OBS", "tournez l’OBS"),
  },
  crs: {
    name: L("Course", "Route"),
    label: L("Course", "Route"),
    desc: L(
      "Sets the course on the glass cockpit HSI.",
      "Règle la route sur le HSI de l’écran.",
    ),
    tryIt: L("set the course", "réglez la route"),
  },
  cdiSource: {
    name: L("CDI source", "Source CDI"),
    label: L("CDI source", "Source CDI"),
    desc: L(
      "Switches the needle between GPS and VOR.",
      "Passe l’aiguille du GPS au VOR.",
    ),
    tryIt: L("change the CDI source", "changez la source du CDI"),
  },
  brg1: {
    name: L("Bearing 1", "Relèvement 1"),
    label: L("Bearing 1", "Relèvement 1"),
    desc: L(
      "Shows the first bearing pointer.",
      "Affiche la première aiguille de relèvement.",
    ),
    tryIt: L("show a bearing pointer", "affichez un relèvement"),
  },
  brg2: {
    name: L("Bearing 2", "Relèvement 2"),
    label: L("Bearing 2", "Relèvement 2"),
    desc: L(
      "Shows the second bearing pointer.",
      "Affiche la seconde aiguille de relèvement.",
    ),
    tryIt: L("show a bearing pointer", "affichez un relèvement"),
  },
  dragAircraft: {
    name: L("Aircraft", "Avion"),
    label: L("Move the aircraft", "Déplacer l’avion"),
    desc: L(
      "On the top view, during “Your turn” only.",
      "Sur la vue de dessus, pendant « À vous » uniquement.",
    ),
    tryIt: L("move the aircraft", "déplacez l’avion"),
  },
  pitch: {
    name: L("Pitch", "Assiette"),
    label: L("Pitch", "Assiette"),
    desc: L("Raises or lowers the nose.", "Cabre ou pique."),
    tryIt: L("change the pitch", "changez l’assiette"),
  },
  bank: {
    name: L("Bank", "Inclinaison"),
    label: L("Bank", "Inclinaison"),
    desc: L("Banks the aircraft: it turns.", "Incline l’avion : il vire."),
    tryIt: L("bank the aircraft", "inclinez l’avion"),
  },
  power: {
    name: L("Power", "Puissance"),
    label: L("Power", "Puissance"),
    desc: L(
      "Moves the throttle, in percent.",
      "Déplace la manette des gaz, en pour cent.",
    ),
    tryIt: L("change the power", "changez la puissance"),
  },
  altBug: {
    name: L("Altitude", "Altitude"),
    label: L("Selected altitude", "Altitude sélectionnée"),
    desc: L("Sets the altitude to reach.", "Affiche l’altitude à atteindre."),
    tryIt: L("change the selected altitude", "changez l’altitude sélectionnée"),
  },
  baro: {
    name: L("Setting", "Calage"),
    label: L("Altimeter setting", "Calage"),
    desc: L(
      "Sets the pressure on the altimeter.",
      "Règle la pression sur l’altimètre.",
    ),
    tryIt: L("change the altimeter setting", "changez le calage"),
  },
  ap: {
    name: L("Autopilot", "Pilote auto"),
    label: L("Autopilot", "Pilote automatique"),
    desc: L(
      "Engages it on the heading and the altitude.",
      "L’engage sur le cap et l’altitude.",
    ),
    tryIt: L("engage the autopilot", "engagez le pilote automatique"),
  },
};
export const stripName = (c: StageControl, lang: Lang): string =>
  tr(WORDS[c].name, lang);
export const stripLabel = (c: StageControl, lang: Lang): string =>
  tr(WORDS[c].label, lang);
export const stripDesc = (c: StageControl, lang: Lang): string =>
  tr(WORDS[c].desc, lang);

/** The controls grouped by what they are, in plain words (the editor's « Commandes de l’élève »). */
export const STRIP_GROUPS: readonly {
  id: string;
  title: L10n;
  controls: readonly StageControl[];
}[] = [
  {
    id: "nav",
    title: L("Navigation", "Navigation"),
    controls: [
      "hdgBug",
      "obs1",
      "obs2",
      "crs",
      "cdiSource",
      "brg1",
      "brg2",
      "dragAircraft",
    ],
  },
  {
    id: "fly",
    title: L("Flying", "Pilotage"),
    controls: ["pitch", "bank", "power"],
  },
  { id: "alt", title: L("Altitude", "Altitude"), controls: ["altBug", "baro"] },
  { id: "auto", title: L("Automation", "Automatismes"), controls: ["ap"] },
];

/** « Les plus utiles »: the controls that make sense first on an instrument. Pure. */
export function usefulControls(view: InstrumentView): StageControl[] {
  if (view.kind === "gauge")
    switch (view.gauge) {
      case "hsi":
        return ["obs1", "hdgBug"];
      case "cdi":
        return ["obs2"];
      case "alt":
        return ["baro"];
      case "asi":
        return ["power"];
      case "vsi":
        return ["pitch"];
      case "ai":
        return ["pitch", "bank"];
      default:
        return ["bank"];
    }
  switch (view.kind) {
    case "six":
      return ["pitch", "bank", "power"];
    case "pfd":
      return ["crs", "hdgBug"];
    case "airlinerPfd":
      return ["hdgBug", "ap"];
    case "nd":
    case "mfd":
      return ["hdgBug"];
    default:
      return [];
  }
}

/** « Essayez : tournez le cap » — the quiet line of a strip, from its first two controls. "" without a control. */
export function tryLine(
  controls: readonly StageControl[] | undefined,
  lang: Lang,
): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const c of stripControls(controls)) {
    const t = tr(WORDS[c].tryIt, lang);
    if (seen.has(t)) continue;
    seen.add(t);
    parts.push(t);
    if (parts.length === 2) break;
  }
  if (!parts.length) return "";
  return `${lang === "fr" ? "Essayez : " : "Try it: "}${parts.join(lang === "fr" ? " et " : " and ")}`;
}

// ------------------------------------------------------------------ the author's choices (pure)
export type StripChoice = "below" | "right" | "hidden";
export type StripSide = "below" | "right";
/** The side the controls take in a frame of w × h when the author chose none: under the instrument, or on its
 *  right when the instrument would be left too small under them (a wide, low instrument). Pure. */
export function autoSide(controls: readonly StageControl[] | undefined, w: number, h: number): StripSide {
  const small = (side: StripSide) => {
    const p = stripPlan(controls, side, w, h, 1);
    return !!p && Math.min(p.inst.w, p.inst.h) < STRIP.minInst;
  };
  return small("below") && !small("right") ? "right" : "below";
}
/** The author's choice, or the side the controls take without one. */
export const stripChoice = (b: Pick<Inst, "strip" | "controls" | "frame">): StripChoice =>
  b.strip ?? autoSide(b.controls, b.frame.w, b.frame.h);
/**
 * Where the strip of an instrument block is drawn on the slide, or null: no drawable control, not live (a frozen
 * instrument or a clip shows its controls only once handed over with « À vous »), or hidden by the author.
 */
export function stripShown(b: Pick<Inst, "controls" | "mode" | "strip" | "frame">): StripSide | null {
  if (!stripControls(b.controls).length) return null;
  if ((b.mode ?? "frozen") !== "live") return null;
  const c = stripChoice(b);
  return c === "hidden" ? null : c;
}

/**
 * Tick or untick a control on an instrument block. A control ticked on a frozen instrument turns it live (its
 * controls would not show otherwise): `wentLive` tells the editor to say so. Returns a new block. Pure.
 */
export function withControl<T extends Inst>(
  b: T,
  c: StageControl,
  on: boolean,
  all: readonly StageControl[],
): { block: T; wentLive: boolean } {
  const set = new Set(b.controls ?? []);
  if (on) set.add(c);
  else set.delete(c);
  return withControls(
    b,
    all.filter((x) => set.has(x)),
  );
}
/** Replace the controls of an instrument block (same rule: listing a control on a frozen instrument turns it live). */
export function withControls<T extends Inst>(
  b: T,
  list: readonly StageControl[],
): { block: T; wentLive: boolean } {
  const n = { ...b } as T;
  if (list.length) n.controls = [...list];
  else delete n.controls;
  const added = list.some((x) => !(b.controls ?? []).includes(x));
  const wentLive =
    added &&
    (b.mode ?? "frozen") === "frozen" &&
    b.strip !== "hidden" &&
    stripControls(list).length > 0;
  if (wentLive) n.mode = "live";
  return { block: n, wentLive };
}

// ------------------------------------------------------------------ geometry (pure, logical slide px)
/** The strip's own measures at zoom 1. Texts are 24 px (the slide's floor), targets 72 px (44 CSS px at 0.61). */
export const STRIP = {
  pad: 14,
  /** the quiet « Essayez » line */
  hint: 30,
  /** a cell: name and value over the widget */
  head: 30,
  gap: 6,
  target: 72,
  cellGap: 20,
  rowGap: 10,
  /** between the instrument and its strip */
  join: 8,
  knobW: 228,
  sliderW: 280,
  keyW: 228,
  /** a slider or a key gives some of its width before a row wraps */
  sliderMin: 220,
  keyMin: 168,
  /** the smallest side an instrument should keep beside its strip */
  minInst: 300,
} as const;
const ROW_H = STRIP.head + STRIP.gap + STRIP.target;
export const stripCellW = (c: StageControl): number => {
  const w = stripWidget(c);
  return w === "slider" || w === "lever"
    ? STRIP.sliderW
    : w === "key"
      ? STRIP.keyW
      : STRIP.knobW;
};
/** the least width of a cell (the − and + buttons never shrink: only a slider's track or a key does) */
export const stripCellMin = (c: StageControl): number => {
  const w = stripWidget(c);
  return w === "slider" || w === "lever" ? STRIP.sliderMin : w === "key" ? STRIP.keyMin : STRIP.knobW;
};
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface StripPlan {
  side: StripSide;
  /** the zoom the strip is drawn at (its measures × z) */
  z: number;
  /** the controls, row by row (below) or column by column (right) */
  lines: StageControl[][];
  /** where the instrument and the strip sit, in the block's own coordinates */
  inst: Box;
  strip: Box;
  /** the strip's inner size at zoom 1 (strip = inner × z) */
  innerW: number;
  innerH: number;
  /** the width its cells and its quiet line need, at zoom 1 */
  contentW: number;
}
/**
 * The zoom of the strip for a slide shown at `k` CSS px per logical px. 1 (the slide as designed) wherever the
 * targets are then large enough: 44 CSS px under a finger (`coarse`), 30 under a mouse. Larger on a small screen.
 */
export function stripZoom(k: number, coarse = true): number {
  if (!(k > 0)) return 1;
  return Math.max(1, Math.min(2.4, (coarse ? 44 : 30) / (STRIP.target * k)));
}
/** the width the quiet line needs (24 px text, about half an em per character), capped */
const hintW = (list: StageControl[]): number => Math.min(520, Math.ceil(tryLine(list, "fr").length * 12.4));
function planAt(
  list: StageControl[],
  side: StripSide,
  w: number,
  h: number,
  z: number,
): StripPlan {
  const lines: StageControl[][] = [];
  let innerW: number;
  let innerH: number;
  if (side === "below") {
    const avail = Math.max(STRIP.sliderW, w / z - 2 * STRIP.pad);
    let row: StageControl[] = [];
    let used = 0;
    for (const c of list) {
      const cw = stripCellMin(c);
      if (row.length && used + STRIP.cellGap + cw > avail) {
        lines.push(row);
        row = [];
        used = 0;
      }
      used += (row.length ? STRIP.cellGap : 0) + cw;
      row.push(c);
    }
    if (row.length) lines.push(row);
    const widest = Math.max(
      ...lines.map(
        (r) =>
          r.reduce((s, c) => s + stripCellW(c), 0) +
          (r.length - 1) * STRIP.cellGap,
      ),
    );
    innerH =
      2 * STRIP.pad +
      STRIP.hint +
      STRIP.gap +
      lines.length * ROW_H +
      (lines.length - 1) * STRIP.rowGap;
    // (a strip taller than the block — a dozen controls on a small instrument — is cut at the block: the checks
    // panel then says the instrument is too small)
    const stripH = Math.min(Math.round(innerH * z), Math.max(1, Math.floor(h - STRIP.join - 1)));
    const instH = Math.max(1, h - stripH - STRIP.join);
    // the strip is as wide as the instrument drawn above it when it can be, never wider than the frame
    innerW = Math.min(
      w / z,
      Math.max(Math.max(widest, hintW(list)) + 2 * STRIP.pad, Math.min(w, instH) / z),
    );
    const stripW = Math.round(innerW * z);
    return {
      side,
      z,
      lines,
      inst: { x: 0, y: 0, w, h: instH },
      strip: {
        x: Math.round((w - stripW) / 2),
        y: h - stripH,
        w: stripW,
        h: stripH,
      },
      innerW,
      innerH,
      contentW: Math.max(widest, hintW(list)) + 2 * STRIP.pad,
    };
  }
  const perCol = Math.max(
    1,
    Math.floor(
      (h / z - 2 * STRIP.pad - STRIP.hint - STRIP.gap + STRIP.rowGap) /
        (ROW_H + STRIP.rowGap),
    ),
  );
  for (let i = 0; i < list.length; i += perCol)
    lines.push(list.slice(i, i + perCol));
  const colW = Math.max(...list.map(stripCellW));
  const rows = Math.max(...lines.map((l) => l.length));
  innerW =
    2 * STRIP.pad +
    Math.max(lines.length * colW + (lines.length - 1) * STRIP.cellGap, Math.min(340, hintW(list)));
  innerH =
    2 * STRIP.pad +
    STRIP.hint +
    STRIP.gap +
    rows * ROW_H +
    (rows - 1) * STRIP.rowGap;
  const stripW = Math.min(Math.round(innerW * z), Math.max(1, Math.floor(w - STRIP.join - 1)));
  const stripH = Math.min(h, Math.round(innerH * z));
  return {
    side,
    z,
    lines,
    inst: { x: 0, y: 0, w: Math.max(1, w - stripW - STRIP.join), h },
    strip: {
      x: w - stripW,
      y: Math.round((h - stripH) / 2),
      w: stripW,
      h: stripH,
    },
    innerW,
    innerH: stripH / z,
    contentW: innerW,
  };
}
/** Fit the instrument's own shape (`aspect` = width / height) in its part of the block and close the strip on it. */
function tighten(p: StripPlan, w: number, h: number, aspect: number): StripPlan {
  if (!(aspect > 0)) return p;
  if (p.side === "below") {
    const iw = Math.min(w, p.inst.h * aspect);
    const ih = iw / aspect;
    const top = Math.max(0, Math.round((h - (ih + STRIP.join + p.strip.h)) / 2));
    const sw = Math.round(Math.min(w, Math.max(p.contentW * p.z, iw)));
    return {
      ...p,
      inst: { x: (w - iw) / 2, y: top, w: iw, h: ih },
      strip: { x: Math.round((w - sw) / 2), y: Math.round(top + ih + STRIP.join), w: sw, h: p.strip.h },
      innerW: sw / p.z,
    };
  }
  const iw = Math.min(p.inst.w, h * aspect);
  const ih = iw / aspect;
  const left = Math.max(0, Math.round((w - (iw + STRIP.join + p.strip.w)) / 2));
  return {
    ...p,
    inst: { x: left, y: (h - ih) / 2, w: iw, h: ih },
    strip: { ...p.strip, x: Math.round(left + iw + STRIP.join) },
  };
}
/**
 * Where the instrument and its strip sit inside a block of w × h, for a zoom. The zoom asked for is lowered (never
 * under 1) while the strip would take more than half of the block: on a phone the instrument still shows. Pure.
 */
export function stripPlan(
  controls: readonly StageControl[] | undefined,
  side: StripSide,
  w: number,
  h: number,
  z = 1,
  /** the instrument's own shape (width / height): it is then drawn tight against its strip */
  aspect?: number,
): StripPlan | null {
  const list = stripControls(controls);
  if (!list.length) return null;
  let zz = Math.max(0.5, z);
  let p = planAt(list, side, w, h, zz);
  const tooBig = (q: StripPlan) =>
    side === "below" ? q.strip.h > h * 0.5 : q.strip.w > w * 0.5;
  while (zz > 1 && tooBig(p)) {
    zz = Math.max(1, zz * 0.92);
    p = planAt(list, side, w, h, zz);
  }
  return aspect ? tighten(p, w, h, aspect) : p;
}
/** The strip leaves the instrument too small to read (the checks panel says so, the inspector fixes it). Pure. */
export function stripCramped(
  b: Pick<Inst, "controls" | "mode" | "strip" | "frame">,
): boolean {
  const side = stripShown(b);
  if (!side) return false;
  const p = stripPlan(b.controls, side, b.frame.w, b.frame.h, 1)!;
  return Math.min(p.inst.w, p.inst.h) < STRIP.minInst;
}

const overlapX = (a: Box, b: Box) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0;
const overlapY = (a: Box, b: Box) =>
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0;
/**
 * Make room for the strip by growing the block into the free space of the slide (under it for a strip below, on
 * its right for a strip on the right), so the instrument keeps its size when the strip appears. Stops at the next
 * element and at the slide's margin. Returns the new frame, or null when there is nothing to gain. Pure.
 */
export function growForStrip(
  slide: Pick<SlideCanvas, "blocks">,
  blockId: string,
  margin = 48,
): BlockFrame | null {
  const b = slide.blocks.find((x) => x.id === blockId);
  if (!b || b.kind !== "instrument") return null;
  const side = stripShown(b);
  if (!side) return null;
  const f = b.frame;
  if (f.rot) return null;
  const p = stripPlan(b.controls, side, f.w, f.h, 1)!;
  const others = slide.blocks.filter(
    (x) => x.id !== blockId && !x.hiddenInEditor,
  );
  if (side === "below") {
    const want = p.strip.h + STRIP.join;
    let room = SLIDE_H - margin - (f.y + f.h);
    for (const o of others) {
      if (!overlapX(f, o.frame)) continue;
      // an element already on the instrument (a marker, a leader) does not stop it; one under it does
      if (o.frame.y >= f.y + f.h - 1)
        room = Math.min(room, o.frame.y - (f.y + f.h));
    }
    const add = Math.floor(Math.min(want, room));
    return add >= 24 ? { ...f, h: f.h + add } : null;
  }
  const want = p.strip.w + STRIP.join;
  let room = SLIDE_W - margin - (f.x + f.w);
  for (const o of others) {
    if (!overlapY(f, o.frame)) continue;
    if (o.frame.x >= f.x + f.w - 1)
      room = Math.min(room, o.frame.x - (f.x + f.w));
  }
  const add = Math.floor(Math.min(want, room));
  return add >= 24 ? { ...f, w: f.w + add } : null;
}

// ------------------------------------------------------------------ the flying controls (bank, pitch, power)
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
export const BANK_RANGE = { min: -45, max: 45, step: 5 } as const;
export const PITCH_RANGE = { min: -15, max: 20, step: 1 } as const;
export const POWER_RANGE = { min: 0, max: 100, step: 5 } as const;
/** What is held for the student, from the flying controls a strip gives. Pure. */
export function pilotHolds(controls: Iterable<StageControl>): {
  /** the wings are kept level (or at the bank asked) and the heading held */
  lateral: boolean;
  holdAlt: boolean;
  holdIas: boolean;
  /** the pitch attitude asked on the slider is held */
  pitch: boolean;
} {
  const has = new Set(controls);
  const bank = has.has("bank");
  const pitch = has.has("pitch");
  const power = has.has("power");
  return {
    lateral: bank || pitch || power,
    // without the pitch control the altitude is held: power then changes the speed, a bank is a level turn
    holdAlt: !pitch && (bank || power),
    // bank alone: the speed is held too
    holdIas: bank && !pitch && !power,
    pitch,
  };
}
/**
 * The hands on the flying controls of one situation (one Sim), shared by every strip showing it. It is the stage's
 * assist (bank to a set angle, altitude or speed held when the student does not have that control) plus a pitch
 * attitude held at the slider's value. It writes the same inputs as the yoke and the throttle: the aircraft flies
 * with the simulator's flight model and the instruments show what it does.
 */
export class StripPilot {
  readonly assist = new StageAssist();
  private has = new Set<StageControl>();
  /** the student has used a flying control: until then the situation flies exactly as it would without a strip */
  engaged = false;
  /** the bank asked (° right positive) */
  bank = 0;
  /** the pitch attitude asked (°), null when the student has no pitch control */
  pitch: number | null = null;
  private lastPitch: number | null = null;
  /** a control was used since the start (« Réinitialiser » shows) */
  dirty = false;
  get active(): boolean {
    return this.engaged;
  }
  /** Add the controls of a strip (hands off until one of the flying controls is used). */
  configure(sim: Sim, controls: readonly StageControl[]) {
    for (const c of controls) this.has.add(c);
    this.capture(sim);
  }
  /** Start again from the Sim as it is (after « Réinitialiser »): hands off. */
  capture(_sim: Sim) {
    this.engaged = false;
    this.bank = 0;
    this.pitch = null;
    this.lastPitch = null;
    this.dirty = false;
  }
  /** Take the flying controls as the aircraft is now: its bank and its pitch are kept until the student moves them. */
  engage(sim: Sim) {
    if (this.engaged) return;
    this.engaged = true;
    const hold = pilotHolds(this.has);
    this.assist.configure(sim, { holdAlt: hold.holdAlt, holdIas: hold.holdIas }, hold.lateral);
    const d = sim.ac.data;
    this.pitch = hold.pitch ? clamp(Math.round(d.pitchDeg), PITCH_RANGE.min, PITCH_RANGE.max) : null;
    this.lastPitch = null;
    if (this.has.has("bank")) this.bankTo(d.rollDeg, sim);
  }
  private bankTo(deg: number, sim: Sim) {
    const v = clamp(Math.round(deg / BANK_RANGE.step) * BANK_RANGE.step, BANK_RANGE.min, BANK_RANGE.max);
    this.bank = v;
    if (v === 0) {
      // wings level, then the heading reached is held
      this.assist.bankDeg = this.assist.bankDeg ?? 5;
      if (this.assist.bankInput !== 0) this.assist.setBank(0, sim);
      else this.assist.targetHdg = Math.abs(sim.ac.data.rollDeg) < 5 ? sim.ac.data.hdgTrue : null;
    } else {
      this.assist.bankDeg = Math.abs(v);
      this.assist.bankInput = v < 0 ? -1 : 1;
    }
  }
  setBank(deg: number, sim: Sim) {
    this.engage(sim);
    this.bankTo(deg, sim);
  }
  setPitch(deg: number, sim: Sim) {
    this.engage(sim);
    if (this.pitch === null) return;
    this.pitch = clamp(Math.round(deg), PITCH_RANGE.min, PITCH_RANGE.max);
  }
  setPower(pct: number, sim: Sim) {
    this.engage(sim);
    sim.controls.throttle = clamp(Math.round(pct / POWER_RANGE.step) * POWER_RANGE.step, 0, 100) / 100;
  }
  /** what the bank and pitch sliders show: the value asked once engaged, the aircraft's own before */
  bankShown(sim: Sim): number {
    return this.engaged && this.has.has("bank")
      ? this.bank
      : clamp(Math.round(sim.ac.data.rollDeg), BANK_RANGE.min, BANK_RANGE.max);
  }
  pitchShown(sim: Sim): number {
    return this.pitch ?? clamp(Math.round(sim.ac.data.pitchDeg), PITCH_RANGE.min, PITCH_RANGE.max);
  }
  /** Write the controls for this frame (before sim.step(dt)). */
  apply(sim: Sim, dt: number) {
    if (!this.engaged || dt <= 0) return;
    this.assist.apply(sim, dt);
    if (this.pitch === null || sim.ap.ap || sim.ac.s.onGround) {
      this.lastPitch = null;
      return;
    }
    // the pitch attitude asked, held with the elevator (same gains as the assist's altitude hold) and trimmed off
    const d = sim.ac.data;
    const c = sim.controls;
    const rate = this.lastPitch === null ? 0 : (d.pitchDeg - this.lastPitch) / dt;
    this.lastPitch = d.pitchDeg;
    const e = this.pitch - d.pitchDeg;
    c.elevator = clamp(e * 0.07 - rate * 0.025, -0.4, 0.4);
    c.trim = clamp(c.trim + e * 0.012 * dt, -1, 1);
  }
}

// ------------------------------------------------------------------ what a control shows (pure given a Sim)
const pad3 = (n: number) =>
  String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, "0");
/** The value of a control with its unit, as the slide shows it. */
export function stripValue(
  c: StageControl,
  sim: Sim,
  pilot: StripPilot | null,
  lang: Lang,
): string {
  const fr = lang === "fr";
  switch (c) {
    case "hdgBug":
      return `${pad3(sim.ap.hdgBug)}°`;
    case "obs1":
      return `${pad3(sim.av.obs1)}°`;
    case "obs2":
      return `${pad3(sim.av.obs2)}°`;
    case "crs":
      return `${pad3(sim.course())}°`;
    case "altBug":
      return `${Math.round(sim.ap.altSel)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, fr ? " " : ",")} ft`;
    case "baro":
      return `${fr ? sim.av.baro.toFixed(2).replace(".", ",") : sim.av.baro.toFixed(2)} inHg`;
    case "bank": {
      const v = pilot ? pilot.bankShown(sim) : Math.round(sim.ac.data.rollDeg);
      return v === 0
        ? "0°"
        : `${Math.abs(v)}° ${v < 0 ? (fr ? "G" : "L") : fr ? "D" : "R"}`;
    }
    case "pitch": {
      const v = pilot ? pilot.pitchShown(sim) : Math.round(sim.ac.data.pitchDeg);
      return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}°`;
    }
    case "power":
      return `${Math.round(sim.controls.throttle * 100)} %`;
    case "ap":
      return sim.ap.ap
        ? `${sim.ap.lat} · ${sim.ap.vert}`
        : fr
          ? "Arrêté"
          : "Off";
    case "cdiSource":
      return String(sim.av.cdi);
    case "brg1":
      return String(sim.av.bearing1);
    case "brg2":
      return String(sim.av.bearing2);
    default:
      return "";
  }
}

// ------------------------------------------------------------------ the editor's try (module state, by block id)
// The author tries the controls on the slide; nothing is saved. The inspector reads the try of the selected
// instrument to offer « Garder comme départ ».
export interface StripTrial {
  sim: () => Sim | null;
  dirty: () => boolean;
  reset: () => void;
}
const trials = new Map<string, StripTrial>();
const trialSubs = new Set<() => void>();
export const stripTrial = (blockId: string): StripTrial | null =>
  trials.get(blockId) ?? null;
export function setStripTrial(blockId: string, t: StripTrial | null) {
  if (t) trials.set(blockId, t);
  else trials.delete(blockId);
}
/** Called when a try starts or ends (the « Garder comme départ » button shows or hides). */
export function onStripTrial(cb: () => void): () => void {
  trialSubs.add(cb);
  return () => trialSubs.delete(cb);
}
export function stripTrialChanged() {
  for (const cb of [...trialSubs]) cb();
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
export interface ControlStripOptions {
  controls: readonly StageControl[];
  lang: Lang;
  sim: () => Sim | null;
  pilot: StripPilot | null;
  /** false: drawn only (a thumbnail, the projector) */
  interactive: boolean;
  /** the projector: the values only, no buttons, and the line says the instructor is flying (not « Essayez ») */
  mirror?: boolean;
  /** a control was used: redraw, start the clock of an editor's try */
  changed(c: StageControl): void;
  /** « Réinitialiser » */
  reset(): void;
}
interface Cell {
  id: StageControl;
  el: HTMLElement;
  value: HTMLElement;
  /** the focusable widget (knob, slider, key) */
  main: HTMLElement;
  sync(sim: Sim): void;
}
const RESET: Record<Lang, string> = { en: "Reset", fr: "Réinitialiser" };
/** the projector's line: the class cannot touch the strip, the instructor flies it from the console */
const FLYING: Record<Lang, string> = { en: "Instructor flying", fr: "L’instructeur pilote" };
const GROUP: Record<Lang, string> = {
  en: "Controls of the instrument",
  fr: "Commandes de l’instrument",
};

/** The strip of one instrument: one cell per control, the quiet line, and « Réinitialiser » (shown on the instrument). */
export class ControlStrip {
  readonly el: HTMLDivElement;
  /** « Réinitialiser »: the block puts it on the instrument's corner; hidden until a control was used */
  readonly resetEl: HTMLButtonElement;
  private inner: HTMLDivElement;
  private hint: HTMLDivElement;
  private body: HTMLDivElement;
  private cells = new Map<StageControl, Cell>();
  private list: StageControl[];
  private timers = new Set<number>();
  private lastDirty: boolean | null = null;
  constructor(private o: ControlStripOptions) {
    this.list = stripControls(o.controls);
    this.el = mk("div", "sl-strip");
    this.el.setAttribute("role", "group");
    this.el.setAttribute("aria-label", GROUP[o.lang]);
    this.inner = mk("div", "sl-strip-in");
    this.hint = mk("div", "sl-strip-hint", o.mirror ? FLYING[o.lang] : tryLine(this.list, o.lang));
    this.body = mk("div", "sl-strip-body");
    this.inner.append(this.hint, this.body);
    this.el.append(this.inner);
    this.resetEl = mk("button", "sl-strip-reset");
    this.resetEl.type = "button";
    const ic = mk("span", "sl-strip-reset-ic", "↺");
    ic.setAttribute("aria-hidden", "true");
    this.resetEl.append(ic, mk("span", "", RESET[o.lang]));
    this.resetEl.hidden = true;
    this.resetEl.addEventListener("click", (e) => {
      e.stopPropagation();
      o.reset();
      this.refresh();
      this.cells.get(this.list[0])?.main.focus({ preventScroll: true });
    });
    this.resetEl.addEventListener("pointerdown", (e) => e.stopPropagation());
    const specs = new Map<StageControl, ControlSpec>();
    for (const s of controlSpecs(this.list, {
      sim: () => o.sim()!,
      // the heading bug is only a bug here: the aircraft follows it when the autopilot is engaged, as in the
      // cockpit (an assist that holds nothing: the stage's knob handlers need one to act)
      assist: new StageAssist(),
      lang: o.lang,
      changed: () => undefined,
    }))
      specs.set(s.id, s);
    for (const id of this.list) {
      const w = stripWidget(id);
      const cell =
        w === "knob"
          ? this.knob(id, specs.get(id)!)
          : w === "key"
            ? this.key(id, specs.get(id)!)
            : this.slider(id);
      cell.el.dataset.ctl = id;
      this.cells.set(id, cell);
    }
    if (!o.interactive) {
      this.el.setAttribute("inert", "");
      this.el.classList.add("is-static");
      if (o.mirror) this.el.classList.add("is-mirror");
    } else {
      // nothing typed or pressed in the strip reaches the slide (no paging, no selection in the editor)
      for (const ev of ["click", "dblclick", "contextmenu"] as const)
        this.el.addEventListener(ev, (e) => e.stopPropagation());
    }
    this.refresh();
  }
  /** Place the cells for a plan (called again when the slide is shown at another size). */
  setPlan(p: StripPlan) {
    const s = this.el.style;
    s.left = `${p.strip.x}px`;
    s.top = `${p.strip.y}px`;
    s.width = `${p.strip.w}px`;
    s.height = `${p.strip.h}px`;
    this.el.dataset.side = p.side;
    // the quiet line names two actions when they fit on one line, else the first one
    const both = tryLine(this.list, this.o.lang);
    this.hint.textContent = this.o.mirror
      ? FLYING[this.o.lang]
      : both.length * 12.4 <= p.innerW - 2 * STRIP.pad
        ? both
        : tryLine(this.list.slice(0, 1), this.o.lang);
    const i = this.inner.style;
    i.width = `${p.innerW}px`;
    i.height = `${p.innerH}px`;
    i.transform = `scale(${p.z})`;
    this.body.replaceChildren();
    for (const line of p.lines) {
      const row = mk("div", "sl-strip-line");
      for (const c of line) {
        const cell = this.cells.get(c);
        if (cell) row.append(cell.el);
      }
      this.body.append(row);
    }
    this.resetEl.style.setProperty("--z", String(p.z));
  }
  /** Show the live values (once per frame while the instrument is live, and after a change). */
  refresh() {
    const sim = this.o.sim();
    if (!sim) return;
    for (const c of this.cells.values()) {
      const v = stripValue(c.id, sim, this.o.pilot, this.o.lang);
      if (c.value.textContent !== v) c.value.textContent = v;
      c.sync(sim);
    }
    const dirty = !!this.o.pilot?.dirty;
    if (dirty !== this.lastDirty) {
      this.lastDirty = dirty;
      this.resetEl.hidden = !dirty || !this.o.interactive;
    }
  }
  destroy() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.el.remove();
    this.resetEl.remove();
  }

  // ---------------------------------------------------------------- cells
  private did(id: StageControl) {
    if (this.o.pilot) this.o.pilot.dirty = true;
    this.o.changed(id);
    this.refresh();
  }
  private shell(id: StageControl): {
    el: HTMLElement;
    value: HTMLElement;
    row: HTMLElement;
  } {
    const el = mk("div", `sl-sc is-${stripWidget(id)}`);
    const head = mk("div", "sl-sc-head");
    const value = mk("span", "sl-sc-v");
    head.append(mk("span", "sl-sc-n", stripName(id, this.o.lang)), value);
    const row = mk("div", "sl-sc-row");
    el.append(head, row);
    return { el, value, row };
  }
  /** a − or + button: one step per press, repeating while held */
  private stepBtn(
    sign: -1 | 1,
    aria: string,
    fn: (coarse: boolean) => void,
  ): HTMLButtonElement {
    const b = mk("button", "sl-sc-btn", sign < 0 ? "−" : "+");
    b.type = "button";
    b.setAttribute("aria-label", aria);
    if (!this.o.interactive) {
      b.tabIndex = -1;
      return b;
    }
    let t = 0;
    let held = false;
    const stop = () => {
      clearTimeout(t);
      this.timers.delete(t);
      held = false;
    };
    b.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.stopPropagation();
      held = true;
      fn(e.shiftKey);
      const again = (ms: number) => {
        t = window.setTimeout(() => {
          this.timers.delete(t);
          if (!held || !b.isConnected) return;
          fn(false);
          again(70);
        }, ms);
        this.timers.add(t);
      };
      again(420);
    });
    for (const ev of [
      "pointerup",
      "pointercancel",
      "pointerleave",
      "blur",
    ] as const)
      b.addEventListener(ev, stop);
    // keyboard (Enter / Space): one step
    b.addEventListener("click", (e) => {
      if ((e as MouseEvent).detail === 0) fn((e as MouseEvent).shiftKey);
    });
    return b;
  }
  private knob(id: StageControl, spec: ControlSpec): Cell {
    const { el, value, row } = this.shell(id);
    const name = stripLabel(id, this.o.lang);
    const fr = this.o.lang === "fr";
    const k = mk("div", "sl-sc-knob");
    k.setAttribute("role", "slider");
    k.setAttribute("aria-label", name);
    k.tabIndex = this.o.interactive ? 0 : -1;
    let angle = 0;
    const turn = (d: number, coarse: boolean) => {
      if (!this.o.sim() || !d) return;
      spec.turn?.(d, coarse);
      angle += Math.sign(d) * (coarse ? 30 : 12) * Math.max(1, Math.abs(d));
      k.style.setProperty("--a", `${angle}deg`);
      this.did(id);
    };
    row.append(
      this.stepBtn(-1, fr ? `${name} : diminuer` : `${name}: decrease`, (c) =>
        turn(-1, c),
      ),
      k,
      this.stepBtn(1, fr ? `${name} : augmenter` : `${name}: increase`, (c) =>
        turn(1, c),
      ),
    );
    if (this.o.interactive) {
      let start: { x: number; y: number; used: number; id: number } | null =
        null;
      k.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        start = { x: e.clientX, y: e.clientY, used: 0, id: e.pointerId };
        k.setPointerCapture?.(e.pointerId);
        k.classList.add("on");
        k.focus({ preventScroll: true });
        e.preventDefault();
        e.stopPropagation();
      });
      k.addEventListener("pointermove", (e) => {
        if (!start || e.pointerId !== start.id) return;
        const d = dragDetents(e.clientX - start.x, e.clientY - start.y);
        if (d !== start.used) {
          const step = d - start.used;
          start.used = d;
          turn(step, e.shiftKey);
        }
      });
      const end = (e: PointerEvent) => {
        if (!start || e.pointerId !== start.id) return;
        start = null;
        k.classList.remove("on");
      };
      k.addEventListener("pointerup", end);
      k.addEventListener("pointercancel", end);
      el.addEventListener(
        "wheel",
        (e) => {
          turn(e.deltaY < 0 ? 1 : -1, e.shiftKey);
          e.preventDefault();
          e.stopPropagation();
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
        const d = map[e.key];
        if (d !== undefined) {
          turn(Math.sign(d), e.shiftKey || Math.abs(d) === 10);
          e.preventDefault();
          e.stopPropagation();
        } else if (e.key === "Enter" && spec.push) {
          spec.push();
          this.did(id);
          e.preventDefault();
          e.stopPropagation();
        }
      });
    }
    return {
      id,
      el,
      value,
      main: k,
      sync: (sim) =>
        k.setAttribute(
          "aria-valuetext",
          stripValue(id, sim, this.o.pilot, this.o.lang),
        ),
    };
  }
  private key(id: StageControl, spec: ControlSpec): Cell {
    const { el, row } = this.shell(id);
    const b = mk("button", "sl-sc-key");
    b.type = "button";
    b.tabIndex = this.o.interactive ? 0 : -1;
    b.setAttribute("aria-label", stripLabel(id, this.o.lang));
    const state = mk("span", "sl-sc-keyv");
    b.append(state);
    row.append(b);
    if (this.o.interactive) {
      b.addEventListener("pointerdown", (e) => e.stopPropagation());
      b.addEventListener("click", () => {
        if (!this.o.sim()) return;
        spec.press?.();
        this.did(id);
      });
    }
    // the key itself shows its state: the head keeps only the name
    el.querySelector(".sl-sc-v")?.remove();
    return {
      id,
      el,
      value: state,
      main: b,
      sync: (sim) => {
        if (id === "ap") b.classList.toggle("on", !!sim.ap.ap);
      },
    };
  }
  private slider(id: StageControl): Cell {
    const { el, value, row } = this.shell(id);
    const name = stripLabel(id, this.o.lang);
    const fr = this.o.lang === "fr";
    const r =
      id === "bank" ? BANK_RANGE : id === "pitch" ? PITCH_RANGE : POWER_RANGE;
    const track = mk("div", `sl-sc-track${id === "power" ? " is-lever" : ""}`);
    track.setAttribute("role", "slider");
    track.setAttribute("aria-label", name);
    track.setAttribute("aria-valuemin", String(r.min));
    track.setAttribute("aria-valuemax", String(r.max));
    track.tabIndex = this.o.interactive ? 0 : -1;
    const fill = mk("span", "sl-sc-fill");
    const thumb = mk("span", "sl-sc-thumb");
    // the centre mark (wings level, level attitude)
    if (r.min < 0) {
      const zero = mk("span", "sl-sc-zero");
      zero.style.left = `${((0 - r.min) / (r.max - r.min)) * 100}%`;
      track.append(zero);
    }
    track.append(fill, thumb);
    const get = (sim: Sim): number =>
      id === "bank"
        ? (this.o.pilot?.bankShown(sim) ?? Math.round(sim.ac.data.rollDeg))
        : id === "pitch"
          ? (this.o.pilot?.pitchShown(sim) ?? Math.round(sim.ac.data.pitchDeg))
          : Math.round(sim.controls.throttle * 100);
    const set = (v: number) => {
      const sim = this.o.sim();
      const p = this.o.pilot;
      if (!sim || !p) return;
      const n = Math.max(
        r.min,
        Math.min(r.max, Math.round(v / r.step) * r.step),
      );
      if (n === get(sim)) return;
      if (id === "bank") p.setBank(n, sim);
      else if (id === "pitch") p.setPitch(n, sim);
      else p.setPower(n, sim);
      this.did(id);
    };
    const nudge = (d: number) => {
      const sim = this.o.sim();
      if (sim) set(get(sim) + d * r.step);
    };
    const less =
      id === "bank"
        ? fr
          ? "Incliner à gauche"
          : "Bank left"
        : id === "pitch"
          ? fr
            ? "Piquer"
            : "Nose down"
          : fr
            ? "Réduire la puissance"
            : "Less power";
    const more =
      id === "bank"
        ? fr
          ? "Incliner à droite"
          : "Bank right"
        : id === "pitch"
          ? fr
            ? "Cabrer"
            : "Nose up"
          : fr
            ? "Augmenter la puissance"
            : "More power";
    row.append(
      this.stepBtn(-1, less, () => nudge(-1)),
      track,
      this.stepBtn(1, more, () => nudge(1)),
    );
    if (this.o.interactive) {
      let drag: number | null = null;
      const at = (e: PointerEvent) => {
        const b = track.getBoundingClientRect();
        const f = Math.max(
          0,
          Math.min(1, (e.clientX - b.left) / Math.max(1, b.width)),
        );
        set(r.min + f * (r.max - r.min));
      };
      track.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 && e.pointerType === "mouse") return;
        drag = e.pointerId;
        track.setPointerCapture?.(e.pointerId);
        track.focus({ preventScroll: true });
        at(e);
        e.preventDefault();
        e.stopPropagation();
      });
      track.addEventListener("pointermove", (e) => {
        if (drag === e.pointerId) at(e);
      });
      const end = (e: PointerEvent) => {
        if (drag === e.pointerId) drag = null;
      };
      track.addEventListener("pointerup", end);
      track.addEventListener("pointercancel", end);
      el.addEventListener(
        "wheel",
        (e) => {
          nudge(e.deltaY < 0 ? 1 : -1);
          e.preventDefault();
          e.stopPropagation();
        },
        { passive: false },
      );
      track.addEventListener("keydown", (e) => {
        const map: Record<string, number> = {
          ArrowLeft: -1,
          ArrowDown: -1,
          ArrowRight: 1,
          ArrowUp: 1,
          PageDown: -2,
          PageUp: 2,
        };
        const d = map[e.key];
        if (d !== undefined) nudge(d);
        else if (e.key === "Home") set(r.min < 0 ? 0 : r.min);
        else if (e.key === "End") set(r.max);
        else return;
        e.preventDefault();
        e.stopPropagation();
      });
    }
    return {
      id,
      el,
      value,
      main: track,
      sync: (sim) => {
        const v = get(sim);
        const f = (v - r.min) / (r.max - r.min);
        thumb.style.left = `${f * 100}%`;
        if (r.min < 0) {
          const z = (0 - r.min) / (r.max - r.min);
          fill.style.left = `${Math.min(f, z) * 100}%`;
          fill.style.width = `${Math.abs(f - z) * 100}%`;
        } else {
          fill.style.left = "0";
          fill.style.width = `${f * 100}%`;
        }
        track.setAttribute("aria-valuenow", String(v));
        track.setAttribute(
          "aria-valuetext",
          stripValue(id, sim, this.o.pilot, this.o.lang),
        );
      },
    };
  }
}
