// The view selector of the cockpit top bar: one labelled dropdown, « Vue : Cockpit ▾ », that opens the View panel
// (the five cameras, the four screen layouts, the instrument panel, auto-hide). Every word follows the UI language
// (UX logic §7: Cockpit · Extérieur · Orbite · Tour · Passage). Styles: src/styles/ui-viewdock.css.
import { h } from "./dom";
import { svgIcon, I } from "./icons";
import { registerStrings, t as tr, onLangChange } from "./i18n";
// type only: the camera module pulls three.js, which stays in the lazily loaded 3D chunk
import type { ViewMode } from "../avionics/cameras";

export type DockLayout = "normal" | "big" | "visual" | "none";
export type DockPanel = "g1000" | "steam" | "airliner";

/** the four screen layouts: the same names everywhere (selector, View panel, Tab toast, Settings, tour). The words
 *  are the English keys of the string table below; layoutName() gives them in the UI language. */
export const LAYOUTS: readonly (readonly [DockLayout, string, string])[] = [
  ["normal", "Standard", "View above the panel"],
  ["big", "Large view", "Bigger view, PFD + MFD"],
  ["visual", "Immersive", "Full view, floating PFD"],
  ["none", "Instruments", "Panel only, pure IFR"],
];

/** the instrument panels: honest names (the aircraft and its flight model stay the C172 in all three) */
export const PANELS: readonly (readonly [DockPanel, string, string])[] = [
  ["g1000", "G1000 glass", "Garmin PFD and MFD"],
  ["steam", "Six-pack", "Classic gauges and radio stack"],
  ["airliner", "Airliner PFD / ND", "Display style with a mode control panel"],
];

export const CAMERAS: readonly ViewMode[] = [
  "cockpit",
  "chase",
  "orbit",
  "tower",
  "flyby",
];
export const CAMERA_NAMES: Record<ViewMode, string> = {
  cockpit: "Cockpit",
  chase: "Chase",
  orbit: "Orbit",
  tower: "Tower",
  flyby: "Fly-by",
};
export const CAMERA_TIPS: Record<ViewMode, string> = {
  cockpit: "From the pilot seat — drag to look around (V)",
  chase:
    "Behind the aircraft — drag to move the camera, pinch or scroll to zoom (V)",
  orbit: "Around the aircraft — drag to orbit (V)",
  tower: "From the control tower of the nearest airport (V)",
  flyby: "A fixed camera ahead on the flight path (V)",
};
const CAMERA_ICON: Record<ViewMode, string> = {
  cockpit: I.camCockpit,
  chase: I.camChase,
  orbit: I.camOrbit,
  tower: I.camTower,
  flyby: I.camFlyby,
};
const NO_GL = "The 3D view is not available on this device";

registerStrings("fr", {
  "cam.Cockpit": "Cockpit",
  "cam.Chase": "Extérieur",
  "cam.Orbit": "Orbite",
  "cam.Tower": "Tour",
  "cam.Fly-by": "Passage",
  "From the pilot seat — drag to look around (V)": "Depuis le siège du pilote : faites glisser pour regarder autour (V)",
  "Behind the aircraft — drag to move the camera, pinch or scroll to zoom (V)": "Derrière l’avion : faites glisser pour déplacer la caméra, pincez ou faites défiler pour zoomer (V)",
  "Around the aircraft — drag to orbit (V)": "Autour de l’avion : faites glisser pour tourner autour (V)",
  "From the control tower of the nearest airport (V)": "Depuis la tour de contrôle de l’aérodrome le plus proche (V)",
  "A fixed camera ahead on the flight path (V)": "Une caméra fixe devant, sur la trajectoire (V)",
  [NO_GL]: "La vue 3D n’est pas disponible sur cet appareil",
  "lay.Standard": "Normale",
  "lay.Large view": "Grande vue",
  "lay.Immersive": "Immersive",
  "lay.Instruments": "Instruments seuls",
  "View above the panel": "La vue au-dessus du tableau de bord",
  "Bigger view, PFD + MFD": "Vue agrandie, PFD et MFD",
  "Full view, floating PFD": "Plein écran, PFD flottant",
  "Panel only, pure IFR": "Le tableau de bord seul, IFR pur",
  "G1000 glass": "G1000 (écrans)",
  "Six-pack": "Instruments classiques",
  "Airliner PFD / ND": "PFD / ND de ligne",
  "Garmin PFD and MFD": "PFD et MFD Garmin",
  "Classic gauges and radio stack": "Six instruments à aiguille et radios",
  "Display style with a mode control panel": "Présentation de ligne avec panneau de pilote automatique",
  "vd.view": "Vue",
  "vd.viewOf": "Vue : {v}",
  "vd.tip": "Vue : caméra, disposition de l’écran et tableau de bord (V caméra · Tab disposition)",
  "vd.aria": "Vue : {v}. Changer de caméra, de disposition ou de tableau de bord",
  "vd.camera": "Caméra",
  "vd.layout": "Disposition de l’écran",
  "vd.panel": "Tableau de bord",
  "vd.note": "Chaque tableau de bord pilote le même modèle de vol du Cessna 172. D’autres avions arrivent.",
  "vd.autoHide": "Masquer la barre du haut en vol",
  "vd.keysCam": "V · Maj V",
  "vd.keysLay": "Tab · Maj Tab",
});
registerStrings("en", {
  "vd.view": "View",
  "vd.viewOf": "View: {v}",
  "vd.tip": "View: camera, screen layout and instrument panel (V camera · Tab layout)",
  "vd.aria": "View: {v}. Change the camera, the layout or the instrument panel",
  "vd.camera": "Camera",
  "vd.layout": "Screen layout",
  "vd.panel": "Instrument panel",
  "vd.note": "Every panel flies the same Cessna 172 flight model. More aircraft are coming.",
  "vd.autoHide": "Auto-hide the top bar in flight",
  "vd.keysCam": "V · Shift V",
  "vd.keysLay": "Tab · Shift Tab",
});
/** a word of the table above in the UI language (English keys fall back to themselves) */
const w = (prefix: string, en: string) => {
  const v = tr(`${prefix}.${en}`);
  return v === `${prefix}.${en}` ? en : v;
};
/** a camera's name in the UI language (FR: Cockpit · Extérieur · Orbite · Tour · Passage) */
export const cameraName = (v: ViewMode): string => w("cam", CAMERA_NAMES[v]);
/** a layout's name in the UI language */
export const layoutName = (m: DockLayout): string =>
  w("lay", LAYOUTS.find((x) => x[0] === m)?.[1] ?? "Standard");
/** Tab / Shift+Tab: the next or previous layout */
export const nextLayout = (m: DockLayout, dir: 1 | -1): DockLayout => {
  const i = LAYOUTS.findIndex((x) => x[0] === m);
  return LAYOUTS[(Math.max(0, i) + dir + LAYOUTS.length) % LAYOUTS.length][0];
};

export interface ViewDockHooks {
  onView: (v: ViewMode) => void;
  onLayout: (m: DockLayout) => void;
  onPause: () => void;
  onPanel: (p: DockPanel) => void;
  autoHide: () => boolean;
  setAutoHide: (on: boolean) => void;
  /** the View panel opened or closed (the shell keeps the top bar up while it is open) */
  onPanelToggle?: (open: boolean) => void;
}

/** the layout pictogram: sky over panel, in the proportions of each layout */
const pictogram = (m: DockLayout) =>
  h("i", { class: `vd-pic vd-pic-${m}`, "aria-hidden": "true" });

export class ViewDock {
  readonly el: HTMLElement;
  /** the View panel (a popover on body, position: fixed) */
  readonly pop: HTMLElement;
  private layout: DockLayout = "normal";
  private view: ViewMode = "cockpit";
  private panel: DockPanel = "g1000";
  private gl = false;
  /** the one button: « Vue : Cockpit ▾ » */
  private readonly selBtn: HTMLButtonElement;
  private readonly selIco: HTMLElement;
  private readonly selK: HTMLElement;
  private readonly selV: HTMLElement;
  private anchor: HTMLElement | null = null;

  constructor(private readonly hooks: ViewDockHooks) {
    this.selIco = h("span", { class: "vd-ico", "aria-hidden": "true" });
    this.selK = h("span", { class: "vd-k" });
    this.selV = h("span", { class: "vd-v" });
    this.selBtn = h(
      "button",
      {
        type: "button",
        class: "vd-sel",
        "aria-haspopup": "dialog",
        "aria-expanded": "false",
        onclick: (e: Event) => {
          e.stopPropagation();
          this.toggle(this.selBtn, this.popDir);
        },
      },
      this.selIco,
      h("span", { class: "vd-l" }, this.selK, this.selV),
      h("span", { class: "vd-chev", "aria-hidden": "true" }, svgIcon(I.chevDown, 14)),
    ) as HTMLButtonElement;
    this.el = h("div", { class: "view-dock" }, this.selBtn);
    this.pop = h("div", {
      class: "view-pop",
      role: "dialog",
      hidden: "",
    });
    this.pop.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
      }
    });
    document.addEventListener(
      "pointerdown",
      (e) => {
        const t = e.target as Node;
        if (this.isOpen && !this.pop.contains(t) && !this.anchor?.contains(t))
          this.close();
      },
      true,
    );
    window.addEventListener("resize", () => this.close());
    onLangChange(() => this.sync());
    this.sync();
  }

  get isOpen(): boolean {
    return !this.pop.hidden;
  }
  /** kept for the 3D module's names: the selector always shows the names of the UI language */
  setNames(_n: Record<ViewMode, string>): void {
    this.sync();
  }
  setLayout(m: DockLayout): void {
    this.layout = m;
    this.sync();
  }
  setView(v: ViewMode): void {
    this.view = v;
    this.sync();
  }
  setPanel(p: DockPanel): void {
    this.panel = p;
    if (this.isOpen) this.render();
  }
  /** Pause is the top bar's own button: the selector shows nothing of it */
  setPaused(_p: boolean): void {}
  /** where the View panel opens from the selector: above it or below it (the top bar) */
  popDir: "up" | "down" = "up";
  /** keep « Vue : Cockpit » when there is room; else « Vue » alone (the word stays, UX logic §7) */
  fit(avail: number): void {
    const el = this.el;
    if (avail <= 0 || !el.isConnected) return;
    el.classList.remove("narrow", "tiny");
    if (el.scrollWidth <= avail) return;
    el.classList.add("narrow");
  }
  setAvailable(gl: boolean): void {
    this.gl = gl;
    this.sync();
  }

  /** open the View panel under (dir 'down') or above (dir 'up') an anchor. When that side is too short for the
   *  whole panel (a 300 px outside view on a laptop), it takes the other side, or else the full window height:
   *  the panel never has to scroll to show its own sections when the window can show them all. */
  open(anchor: HTMLElement, dir: "up" | "down"): void {
    this.anchor = anchor;
    this.render();
    this.pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    const wd = Math.min(440, innerWidth - 16);
    this.pop.style.width = `${wd}px`;
    // under its button, left-aligned with it (the button sits left of centre in the top bar)
    this.pop.style.left = `${Math.round(Math.max(8, Math.min(innerWidth - wd - 8, r.left)))}px`;
    this.pop.style.maxHeight = "none";
    this.pop.style.top = "0px";
    this.pop.style.bottom = "";
    const p = placePop(
      { top: r.top, bottom: r.bottom },
      this.pop.scrollHeight,
      innerHeight,
      dir,
    );
    this.pop.dataset.dir = p.dir;
    this.pop.style.top = `${Math.round(p.top)}px`;
    this.pop.style.maxHeight = `${Math.round(p.maxH)}px`;
    anchor.setAttribute("aria-expanded", "true");
    this.hooks.onPanelToggle?.(true);
    (
      this.pop.querySelector<HTMLElement>("button.on") ??
      this.pop.querySelector<HTMLElement>("button")
    )?.focus({ preventScroll: true });
  }
  close(refocus = false): void {
    if (!this.isOpen) return;
    this.pop.hidden = true;
    this.anchor?.setAttribute("aria-expanded", "false");
    if (refocus) this.anchor?.focus();
    this.hooks.onPanelToggle?.(false);
  }
  toggle(anchor: HTMLElement, dir: "up" | "down"): void {
    if (this.isOpen && this.anchor === anchor) this.close();
    else this.open(anchor, dir);
  }

  private pickView(v: ViewMode): void {
    if (!this.gl) return;
    this.hooks.onView(v);
    // in Instruments a camera means "back to the outside view with this camera"
    if (this.layout === "none") this.hooks.onLayout("normal");
  }

  /** what the selector names: the camera, or « Instruments seuls » when the outside view is folded away */
  private current(): { label: string; icon: string } {
    if (this.layout === "none")
      return { label: layoutName("none"), icon: "" };
    return { label: cameraName(this.view), icon: CAMERA_ICON[this.view] };
  }

  private sync(): void {
    this.el.dataset.layout = this.layout;
    this.el.classList.toggle("no-gl", !this.gl);
    const c = this.current();
    this.selIco.replaceChildren(c.icon ? svgIcon(c.icon, 16) : pictogram("none"));
    this.selK.textContent = tr("vd.view");
    this.selV.textContent = c.label;
    this.selBtn.title = tr("vd.tip");
    this.selBtn.setAttribute("aria-label", tr("vd.aria", { v: c.label }));
    this.pop.setAttribute("aria-label", tr("vd.view"));
    if (this.isOpen) this.render();
  }

  /** the View panel: Camera, Screen layout, Instrument panel, and the auto-hide switch */
  private render(): void {
    const head = (t: string, hint: string) =>
      h(
        "div",
        { class: "vp-h" },
        h("span", {}, t),
        hint ? h("kbd", {}, hint) : null,
      );
    const noGl = tr(NO_GL);
    const cams = CAMERAS.map((v) =>
      h(
        "button",
        {
          type: "button",
          class: `vp-cam${v === this.view && this.layout !== "none" ? " on" : ""}`,
          role: "radio",
          "aria-checked": String(v === this.view && this.layout !== "none"),
          disabled: this.gl ? null : "",
          title: this.gl ? tr(CAMERA_TIPS[v]) : noGl,
          onclick: () => {
            this.pickView(v);
            this.render();
          },
        },
        svgIcon(CAMERA_ICON[v], 20),
        h("span", {}, cameraName(v)),
      ),
    );
    const lays = LAYOUTS.map(([m, _t, d]) =>
      h(
        "button",
        {
          type: "button",
          class: `vp-lay${m === this.layout ? " on" : ""}`,
          role: "radio",
          "aria-checked": String(m === this.layout),
          onclick: () => {
            this.close();
            this.hooks.onLayout(m);
          },
        },
        pictogram(m),
        h("span", {}, h("b", {}, layoutName(m)), h("small", {}, tr(d))),
      ),
    );
    const pans = PANELS.map(([p, t, d]) =>
      h(
        "button",
        {
          type: "button",
          class: `vp-pan${p === this.panel ? " on" : ""}`,
          role: "radio",
          "aria-checked": String(p === this.panel),
          onclick: () => {
            this.hooks.onPanel(p);
            this.panel = p;
            this.render();
          },
        },
        h("i", { class: `vp-pan-ic vp-pan-${p}`, "aria-hidden": "true" }),
        h("span", {}, h("b", {}, tr(t)), h("small", {}, tr(d))),
      ),
    );
    const auto = this.hooks.autoHide();
    const sw = h(
      "button",
      {
        type: "button",
        class: "vp-sw",
        role: "switch",
        "aria-checked": String(auto),
        onclick: () => {
          this.hooks.setAutoHide(!this.hooks.autoHide());
          this.render();
        },
      },
      h("span", {}, tr("vd.autoHide")),
      h("i", { class: `sw${auto ? " on" : ""}`, "aria-hidden": "true" }),
    );
    this.pop.replaceChildren(
      head(tr("vd.camera"), tr("vd.keysCam")),
      h(
        "div",
        { class: "vp-cams", role: "radiogroup", "aria-label": tr("vd.camera") },
        ...cams,
      ),
      ...(this.gl ? [] : [h("p", { class: "vp-note" }, noGl)]),
      head(tr("vd.layout"), tr("vd.keysLay")),
      h(
        "div",
        { class: "vp-lays", role: "radiogroup", "aria-label": tr("vd.layout") },
        ...lays,
      ),
      head(tr("vd.panel"), ""),
      h(
        "div",
        {
          class: "vp-pans",
          role: "radiogroup",
          "aria-label": tr("vd.panel"),
        },
        ...pans,
      ),
      h("p", { class: "vp-note" }, tr("vd.note")),
      sw,
    );
  }
}

/** where the View panel opens (pure, unit-tested): on the asked side of its anchor when the whole panel fits there,
 *  else on the other side when it fits there, else as high as the window allows (it may cover its anchor) */
export function placePop(
  anchor: { top: number; bottom: number },
  h: number,
  winH: number,
  dir: "up" | "down",
  m = 8,
): { top: number; maxH: number; dir: "up" | "down" | "fit" } {
  const above = anchor.top - m - m;
  const below = winH - anchor.bottom - m - m;
  const up = () => ({
    top: anchor.top - m - h,
    maxH: above,
    dir: "up" as const,
  });
  const down = () => ({
    top: anchor.bottom + m,
    maxH: below,
    dir: "down" as const,
  });
  if (dir === "up" ? h <= above : h > below && h <= above) return up();
  if (h <= below) return down();
  const maxH = winH - 2 * m;
  return {
    top: Math.max(
      m,
      Math.min(
        winH - m - h,
        dir === "up" ? anchor.top - m - h : anchor.bottom + m,
      ),
    ),
    maxH,
    dir: "fit",
  };
}

/** what a key press means for the shell (pure, unit-tested):
 *  - 'default': leave it to the browser (Tab moves focus, Space / Enter press the focused button)
 *  - 'layout-next' / 'layout-prev': Tab / Shift+Tab change the screen layout (focus on the page or a canvas)
 *  - 'pass': not the shell's business here (flight keys go on) */
export type ShellKeyIntent = "default" | "layout-next" | "layout-prev" | "pass";
export function shellKeyIntent(o: {
  key: string;
  shift: boolean;
  /** the event target is inside the chrome (top bar, menus, lesson panel, ATC card, dock, View panel, windows) */
  inUi: boolean;
  /** the target has a keyboard-visible focus (:focus-visible): not a button just clicked with the mouse */
  kbdFocus: boolean;
  /** focus is on the page itself (body) or a canvas */
  onPage: boolean;
}): ShellKeyIntent {
  if (o.key === "Tab") {
    if (o.inUi || (o.kbdFocus && !o.onPage)) return "default";
    return o.shift ? "layout-prev" : "layout-next";
  }
  if ((o.key === " " || o.key === "Enter") && o.inUi && o.kbdFocus)
    return "default";
  return "pass";
}

/** where the lesson window docks (pure, unit-tested): SPEC §4.4 zones
 *  - 'column': Standard / Large view, landscape: a full-height column on the left of the outside view
 *  - 'row': Instruments: a row card above the autopilot bar, left of the ATC card
 *  - 'strip': portrait or under 1000 px: a one-line strip under the situation bar
 *  - 'card': Immersive (above the floating PFD), and the free-flight coach tips
 *  - 'float': the user undocked the window (it floats where they put it)
 *  - 'none': nothing to show */
export type LessonZone = "column" | "row" | "strip" | "card" | "float" | "none";
export function lessonZone(o: {
  layout: DockLayout;
  /** a lesson (exercise) is running; otherwise the free-flight coach tips */
  lesson: boolean;
  /** the panel has nothing to show */
  empty: boolean;
  portrait: boolean;
  width: number;
  floating?: boolean;
}): LessonZone {
  if (o.empty) return "none";
  if (!o.lesson) return "card";
  if (o.floating) return "float";
  if (o.portrait || o.width < 1000) return "strip";
  if (o.layout === "none") return "row";
  if (o.layout === "visual") return "card";
  return "column";
}
/** the docked column width: clamp(320px, 25vw, 380px), 320–340 px on an iPad in landscape */
export const lessonColumnW = (width: number, touch: boolean): number =>
  Math.round(Math.max(320, Math.min(touch ? 340 : 380, width * 0.25)));
