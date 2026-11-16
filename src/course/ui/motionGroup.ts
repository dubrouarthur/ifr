// Ground school — the « Animation » section of an instrument's inspector (the third of its three sections, after
// « Ce qu’il montre » and « Ce que l’élève peut faire »). What the instrument does by itself on the slide:
//   Aucune         a still picture of the situation (mode "frozen", no animation)
//   Une animation  a short flight that plays by itself (a turn, a climb, a glide path…), one of MOTION_PRESETS,
//                  drawn by the simulator's own renderers (canvas/motion.ts); every instrument of the slide that
//                  shows the same situation moves with it
//   En direct      the situation flies: the instrument moves (mode "live")
// The contract is in scratchpad anim/MOTION-HOOK.md: the inspector calls renderMotionGroup(host) and puts what it
// returns in place; this function owns its section (title included) and changes the block only through host.update.
import type {
  Annotation,
  Course,
  InstrumentMotion,
  Lang,
  SlideBlock,
  SlideCanvas,
} from "../types";
import { h } from "../../ui/dom";
import {
  MOTION_PRESETS,
  motionPreset,
  replayMotion,
  type MotionPreset,
} from "../canvas/motion";
import { renderSlide } from "../canvas/render";

export type MotionBlock = Extract<
  SlideBlock,
  { kind: "instrument" } | { kind: "simViewport" }
>;
type InstBlock = Extract<SlideBlock, { kind: "instrument" }>;

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
const loc = (lang: Lang, l: { en: string; fr?: string }) =>
  lang === "fr" ? (l.fr ?? l.en) : l.en;

/** the list of animations stays open for this block until one is picked (the inspector is drawn again on change) */
const picking = new Set<string>();

/** The animation a new choice starts with: the one that shows best on this instrument, else the standard turn. */
export function suggestedPreset(b: InstBlock): MotionPreset {
  const v = b.view;
  const best =
    v.kind === "gauge"
      ? MOTION_PRESETS.find(
          (p) => p.view.kind === "gauge" && p.view.gauge === v.gauge,
        )
      : undefined;
  return best ?? motionPreset("turn-std") ?? MOTION_PRESETS[0]!;
}

const SPEEDS: [number, string, string][] = [
  [0.5, "Slow", "Lente"],
  [1, "Normal", "Normale"],
  [2, "Fast", "Rapide"],
];

const NEED_NOTE: Record<string, [string, string]> = {
  gs: [
    "Needs an ILS: if the slide's flight situation has none, the animation flies its own approach.",
    "Il faut un ILS : si la situation de vol de la diapo n’en a pas, l’animation vole sa propre approche.",
  ],
  loc: [
    "Needs a localizer: if the slide's flight situation has none, the animation flies its own.",
    "Il faut un localizer : si la situation de vol de la diapo n’en a pas, l’animation vole le sien.",
  ],
  vor: [
    "Needs a VOR: if the slide's flight situation has none, the animation flies near its own.",
    "Il faut une VOR : si la situation de vol de la diapo n’en a pas, l’animation vole près de la sienne.",
  ],
  adf: [
    "Needs an NDB: if the slide's flight situation has none, the animation flies near its own.",
    "Il faut une NDB : si la situation de vol de la diapo n’en a pas, l’animation vole près de la sienne.",
  ],
  steam: [
    "Shown on the classic instruments (a glass cockpit has no vacuum gyros).",
    "Se voit sur les instruments classiques (un écran n’a pas de gyroscopes à dépression).",
  ],
};

/** A small live picture of the animation, drawn by the slide renderer itself (it loops). */
function preview(
  host: MotionGroupHost,
  b: InstBlock,
  m: InstrumentMotion,
): HTMLElement {
  const box = h("div", { class: "ce-motion-pv", "aria-hidden": "true" });
  const pv: InstBlock = {
    id: `motion-pv-${b.id}`,
    kind: "instrument",
    view: b.view,
    mode: "frozen",
    frame: { x: 0, y: 0, w: 1920, h: 1080, z: 0 },
    ...(b.scene ? { scene: b.scene } : {}),
    ...(b.failures ? { failures: b.failures } : {}),
    ...(b.bezel !== undefined ? { bezel: b.bezel } : {}),
    motion: { ...m, loop: true },
  };
  const slide: SlideCanvas = {
    size: { w: 1920, h: 1080 },
    blocks: [pv],
  };
  // drawn once the box is in the page (the renderer measures its host)
  requestAnimationFrame(() => {
    if (!box.isConnected) return;
    const v = renderSlide(slide, box, {
      mode: "edit",
      lang: host.lang,
      scenes: host.course.scenes,
      cockpit: host.course.cockpit,
      pad: 0,
      label: t(host.lang, "Preview of the animation", "Aperçu de l’animation"),
    });
    host.keep({ destroy: () => v.destroy() });
  });
  return box;
}

function radioRow(
  label: string,
  opts: { on: boolean; label: string; title?: string; click: () => void }[],
  cls = "",
): HTMLElement {
  const seg = h("div", {
    class: `ce-seg full ${cls}`.trim(),
    role: "radiogroup",
    "aria-label": label,
  });
  for (const o of opts) {
    const btn = h(
      "button",
      {
        type: "button",
        role: "radio",
        "aria-checked": o.on ? "true" : "false",
        class: o.on ? "on" : "",
        title: o.title,
      },
      o.label,
    );
    btn.addEventListener("click", () => {
      if (!o.on) o.click();
    });
    seg.append(btn);
  }
  return seg;
}

/** The list of animations, PPL then IFR: a name and what the student sees. */
function presetList(
  host: MotionGroupHost,
  current: string | undefined,
  pick: (p: MotionPreset) => void,
): HTMLElement {
  const T = (en: string, fr: string) => t(host.lang, en, fr);
  const wrap = h("div", { class: "ce-motion-list" });
  const groups: [MotionPreset["level"], string][] = [
    ["ppl", T("Flying the aircraft (PPL)", "Pilotage (PPL)")],
    ["ifr", T("Instrument flying (IFR)", "Vol aux instruments (IFR)")],
  ];
  for (const [level, title] of groups) {
    const list = h("div", {
      class: "ce-motion-opts",
      role: "radiogroup",
      "aria-label": title,
    });
    for (const p of MOTION_PRESETS.filter((x) => x.level === level)) {
      const on = p.id === current;
      const btn = h(
        "button",
        {
          type: "button",
          role: "radio",
          "aria-checked": on ? "true" : "false",
          class: `ce-motion-opt${on ? " on" : ""}`,
          "data-preset": p.id,
        },
        h("span", { class: "ce-motion-opt-name" }, loc(host.lang, p.name)),
        h("span", { class: "ce-motion-opt-what" }, loc(host.lang, p.what)),
      );
      btn.addEventListener("click", () => pick(p));
      list.append(btn);
    }
    wrap.append(h("div", { class: "ce-motion-lvl" }, title), list);
  }
  return wrap;
}

/** « Repères » of the instrument tied to a moment of the animation: each appears when the needle gets there. */
function momentRows(
  host: MotionGroupHost,
  b: InstBlock,
  p: MotionPreset,
): HTMLElement | null {
  const T = (en: string, fr: string) => t(host.lang, en, fr);
  const anns = (b.annotations ?? []).filter(
    (a) =>
      a.type === "callout" ||
      a.type === "tag" ||
      a.type === "ring" ||
      a.type === "arrow",
  );
  const marks = p.marks ?? [];
  if (!anns.length || !marks.length) return null;
  const rows = h("div", { class: "ce-motion-moments" });
  rows.append(
    h(
      "div",
      { class: "ce-motion-lvl" },
      T("When each marker appears", "Quand chaque repère apparaît"),
    ),
  );
  anns.forEach((a, i) => {
    const name = annName(host.lang, a, i);
    const sel = h("select", {
      class: "ce-motion-sel",
      "aria-label": T(`When “${name}” appears`, `Quand « ${name} » apparaît`),
    });
    sel.append(
      h("option", { value: "" }, T("From the start", "Dès le début")),
      ...marks.map((m) =>
        h(
          "option",
          { value: m.id, selected: a.moment === m.id },
          loc(host.lang, m.label),
        ),
      ),
    );
    if (a.moment && !marks.some((m) => m.id === a.moment)) sel.value = "";
    sel.addEventListener("change", () =>
      host.update((x) => {
        if (x.kind !== "instrument") return;
        const y = x.annotations?.find((k) => k.id === a.id);
        if (!y) return;
        if (sel.value) y.moment = sel.value;
        else delete y.moment;
      }),
    );
    rows.append(
      h("label", { class: "ce-motion-moment" }, h("span", {}, name), sel),
    );
  });
  return rows;
}

function annName(lang: Lang, a: Annotation, i: number): string {
  const txt =
    (a.type === "callout" || a.type === "tag") && a.text
      ? loc(lang, a.text)
      : "";
  if (txt) return txt.length > 28 ? `${txt.slice(0, 27)}…` : txt;
  const kind =
    a.type === "ring"
      ? t(lang, "Circle", "Cercle")
      : a.type === "arrow"
        ? t(lang, "Arrow", "Flèche")
        : t(lang, "Marker", "Repère");
  return `${kind} ${i + 1}`;
}

/**
 * « Animation »: Aucune / Animation / En direct (and a recorded moment when the course has one). Returns the
 * whole section.
 */
export function renderMotionGroup(host: MotionGroupHost): HTMLElement {
  const T = (en: string, fr: string) => t(host.lang, en, fr);
  const b = host.block;
  const section = (choice: string, ...kids: (HTMLElement | null)[]) =>
    h(
      "section",
      { class: "ce-grp ce-motion", "data-motion": choice },
      h(
        "div",
        { class: "ce-grp-hd" },
        h("span", { class: "ce-label" }, T("Animation", "Animation")),
      ),
      ...kids.filter((k): k is HTMLElement => !!k),
    );
  if (b.kind !== "instrument")
    return section(
      "live",
      h(
        "p",
        { class: "ce-note muted" },
        T(
          "The simulator view flies the situation: it moves by itself.",
          "La vue du simulateur vole la situation : elle bouge d’elle-même.",
        ),
      ),
    );

  const m = b.motion;
  const p = motionPreset(m?.preset);
  const mode = b.mode ?? "frozen";
  const choice: "none" | "anim" | "live" | "clip" = m
    ? "anim"
    : mode === "live"
      ? "live"
      : mode === "clip"
        ? "clip"
        : "none";
  const clips = Object.keys(host.course.clips ?? {});

  const set = (f: (x: InstBlock) => void) =>
    host.update((x) => {
      if (x.kind === "instrument") f(x);
    });
  const opts = [
    {
      on: choice === "none",
      label: T("None", "Aucune"),
      title: T(
        "A still picture of the situation",
        "Une image fixe de la situation",
      ),
      click: () =>
        set((x) => {
          delete x.motion;
          x.mode = "frozen";
        }),
    },
    {
      on: choice === "anim",
      label: T("Animation", "Animation"),
      title: T(
        "A short flight that plays by itself when the slide is shown",
        "Un court vol qui se joue tout seul quand la diapo s’affiche",
      ),
      click: () => {
        picking.add(b.id);
        set((x) => {
          x.motion = { preset: suggestedPreset(x).id };
          if (x.mode === "clip") x.mode = "frozen";
        });
      },
    },
    {
      on: choice === "live",
      label: T("Live", "En direct"),
      title: T(
        "The situation flies: the instrument moves",
        "La situation vole : l’instrument bouge",
      ),
      click: () =>
        set((x) => {
          delete x.motion;
          x.mode = "live";
        }),
    },
  ];
  if (clips.length || mode === "clip")
    opts.push({
      on: choice === "clip",
      label: T("Recording", "Enregistrement"),
      title: T(
        "Plays a moment you recorded in the simulator",
        "Rejoue un moment enregistré dans le simulateur",
      ),
      click: () =>
        set((x) => {
          delete x.motion;
          x.mode = "clip";
          if (!x.clip) x.clip = clips[0];
        }),
    });
  const row = radioRow(T("Animation", "Animation"), opts);

  if (choice !== "anim" || !m) {
    picking.delete(b.id);
    const line =
      choice === "live"
        ? T(
            "The instrument moves with the situation.",
            "L’instrument bouge avec la situation.",
          )
        : choice === "clip"
          ? T(
              "The instrument replays the recorded moment.",
              "L’instrument rejoue le moment enregistré.",
            )
          : T(
              "The instrument shows the situation, still. Choose “Animation” to make it move by itself.",
              "L’instrument montre la situation, immobile. Choisissez « Animation » pour qu’il bouge tout seul.",
            );
    return section(choice, row, h("p", { class: "ce-note muted" }, line));
  }

  // ---------------------------------------------------------------- an animation
  const open = picking.has(b.id) || !p;
  const kids: (HTMLElement | null)[] = [row];
  if (p) {
    const replay = h(
      "button",
      { type: "button", class: "ce-btn ce-motion-replay" },
      h("span", { class: "ce-motion-ic", "aria-hidden": "true" }),
      T("Replay", "Rejouer"),
    );
    replay.addEventListener("click", () => replayMotion(b.id));
    const change = h(
      "button",
      {
        type: "button",
        class: "ce-btn ce-motion-change",
        "aria-expanded": open ? "true" : "false",
      },
      open
        ? T("Close the list", "Fermer la liste")
        : T("Another animation", "Une autre animation"),
    );
    change.addEventListener("click", () => {
      if (open) picking.delete(b.id);
      else picking.add(b.id);
      host.redraw();
    });
    const need = p.needs ? NEED_NOTE[p.needs] : undefined;
    kids.push(
      h(
        "div",
        { class: "ce-motion-card" },
        preview(host, b, m),
        h("div", { class: "ce-motion-name" }, loc(host.lang, p.name)),
        h("p", { class: "ce-motion-what" }, loc(host.lang, p.what)),
        need
          ? h(
              "p",
              { class: "ce-note muted" },
              host.lang === "fr" ? need[1] : need[0],
            )
          : null,
        h("div", { class: "ce-motion-acts" }, replay, change),
      ),
    );
  }
  if (open)
    kids.push(
      presetList(host, m.preset, (np) => {
        picking.delete(b.id);
        set((x) => {
          x.motion = { ...(x.motion ?? {}), preset: np.id };
          delete x.motion.script;
          // a callout tied to a moment the new animation has not: from the start
          for (const a of x.annotations ?? [])
            if (a.moment && !(np.marks ?? []).some((k) => k.id === a.moment))
              delete a.moment;
        });
      }),
    );
  const speed = m.speed ?? 1;
  kids.push(
    h(
      "div",
      { class: "ce-motion-line" },
      h("span", { class: "ce-motion-k" }, T("Speed", "Vitesse")),
      radioRow(
        T("Speed", "Vitesse"),
        SPEEDS.map(([v, en, fr]) => ({
          on: Math.abs(speed - v) < 1e-6,
          label: T(en, fr),
          click: () =>
            set((x) => {
              if (!x.motion) return;
              if (v === 1) delete x.motion.speed;
              else x.motion.speed = v;
            }),
        })),
      ),
    ),
  );
  const loop = h("input", { type: "checkbox", checked: !!m.loop });
  loop.addEventListener("change", () =>
    set((x) => {
      if (!x.motion) return;
      if (loop.checked) x.motion.loop = true;
      else delete x.motion.loop;
    }),
  );
  kids.push(
    h(
      "label",
      { class: "ce-motion-loop" },
      loop,
      h("span", {}, T("Play in a loop", "Jouer en boucle")),
    ),
  );
  if (p) kids.push(momentRows(host, b, p));
  kids.push(
    h(
      "p",
      { class: "ce-note muted" },
      m.loop
        ? T(
            "The student sees it play again and again; “Pause” stops it. When they take the controls, they fly from where it is.",
            "L’élève la voit se rejouer sans fin ; « Pause » l’arrête. Quand il prend les commandes, il vole à partir de là.",
          )
        : T(
            "The student sees it once when the slide appears, then “Replay”. When they take the controls, they fly from where it is.",
            "L’élève la voit une fois à l’arrivée de la diapo, puis « Rejouer ». Quand il prend les commandes, il vole à partir de là.",
          ),
    ),
  );
  return section("anim", ...kids);
}
