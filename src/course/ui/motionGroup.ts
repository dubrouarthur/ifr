// Ground school — the « Animation » section of an instrument's inspector (the third of its three sections, after
// « Ce qu’il montre » and « Ce que l’élève peut faire »). What the instrument does by itself on the slide:
//   Aucune       a still picture of the situation (mode "frozen")
//   a preset     a short flight that plays by itself (a turn, a climb, a drift…), drawn by the simulator's renderers
//   En direct    the situation flies: the instrument moves (mode "live")
// This file is the hook the motion builder completes (presets, preview, speed, loop). The contract is in
// scratchpad anim/MOTION-HOOK.md: the inspector calls renderMotionGroup(host) and puts what it returns in place;
// the function owns its section (title included) and changes the block only through host.update (one undo step).
import type { Course, Lang, SlideBlock } from "../types";
import { h } from "../../ui/dom";

export type MotionBlock = Extract<SlideBlock, { kind: "instrument" } | { kind: "simViewport" }>;

/** What the inspector gives the « Animation » section. */
export interface MotionGroupHost {
  readonly lang: Lang;
  /** the selected instrument (or simulator view), as stored */
  readonly block: MotionBlock;
  readonly course: Course;
  /** change the block: one undo step (`key` merges a drag into one step); the slide is drawn again */
  update(f: (b: MotionBlock) => void, key?: string): void;
  /** draw the inspector again */
  redraw(): void;
  /** a part with a preview to destroy when the inspector is drawn again */
  keep(part: { destroy(): void }): void;
}

const t = (lang: Lang, en: string, fr: string) => (lang === "fr" ? fr : en);

/**
 * « Animation »: Aucune / En direct (and a recorded moment when the course has one). The motion builder adds the
 * presets between the two. Returns the whole section.
 */
export function renderMotionGroup(host: MotionGroupHost): HTMLElement {
  const T = (en: string, fr: string) => t(host.lang, en, fr);
  const b = host.block;
  const mode = b.kind === "instrument" ? (b.mode ?? "frozen") : "live";
  const clips = Object.keys(host.course.clips ?? {});
  const opts: { v: "frozen" | "live" | "clip"; label: string; title: string }[] = [
    { v: "frozen", label: T("None", "Aucune"), title: T("A still picture of the situation", "Une image fixe de la situation") },
    { v: "live", label: T("Live", "En direct"), title: T("The situation flies: the instrument moves", "La situation vole : l’instrument bouge") },
  ];
  if (clips.length || mode === "clip")
    opts.push({
      v: "clip",
      label: T("Recording", "Enregistrement"),
      title: T("Plays a moment you recorded in the simulator", "Rejoue un moment enregistré dans le simulateur"),
    });
  const seg = h("div", {
    class: "ce-seg full",
    role: "radiogroup",
    "aria-label": T("Animation", "Animation"),
  });
  for (const o of opts) {
    const on = o.v === mode;
    const btn = h(
      "button",
      { type: "button", role: "radio", "aria-checked": on ? "true" : "false", class: on ? "on" : "", title: o.title },
      o.label,
    );
    btn.addEventListener("click", () => {
      if (on || b.kind !== "instrument") return;
      host.update((x) => {
        if (x.kind !== "instrument") return;
        x.mode = o.v;
        if (o.v === "clip" && !x.clip) x.clip = clips[0];
      });
    });
    seg.append(btn);
  }
  const line =
    mode === "live"
      ? T("The instrument moves with the situation.", "L’instrument bouge avec la situation.")
      : mode === "clip"
        ? T("The instrument replays the recorded moment.", "L’instrument rejoue le moment enregistré.")
        : T("The instrument shows the situation, still.", "L’instrument montre la situation, immobile.");
  return h(
    "section",
    { class: "ce-grp ce-motion", "data-motion": mode },
    h("div", { class: "ce-grp-hd" }, h("span", { class: "ce-label" }, T("Animation", "Animation"))),
    seg,
    h("p", { class: "ce-note muted" }, line),
  );
}
