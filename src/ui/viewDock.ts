// View dock (always visible on the outside view: five labelled cameras, the current screen layout, Pause) and the
// View panel (cameras, the four screen layouts, the instrument panel, auto-hide). One tap reaches Chase from
// anywhere; the layout is named in words, never hidden behind an icon. Styles: src/styles/ui-viewdock.css.
import { h } from "./dom";
import { svgIcon, I } from "./icons";
// type only: the camera module pulls three.js, which stays in the lazily loaded 3D chunk
import type { ViewMode } from "../avionics/cameras";

export type DockLayout = "normal" | "big" | "visual" | "none";
export type DockPanel = "g1000" | "steam" | "airliner";

/** the four screen layouts: the same names everywhere (dock, View panel, Tab toast, Settings, tour) */
export const LAYOUTS: readonly (readonly [DockLayout, string, string])[] = [
  ["normal", "Standard", "View above the panel"],
  ["big", "Large view", "Bigger view, PFD + MFD"],
  ["visual", "Immersive", "Full view, floating PFD"],
  ["none", "Instruments", "Panel only, pure IFR"],
];
export const layoutName = (m: DockLayout): string =>
  LAYOUTS.find((x) => x[0] === m)?.[1] ?? "Standard";
/** Tab / Shift+Tab: the next or previous layout */
export const nextLayout = (m: DockLayout, dir: 1 | -1): DockLayout => {
  const i = LAYOUTS.findIndex((x) => x[0] === m);
  return LAYOUTS[(Math.max(0, i) + dir + LAYOUTS.length) % LAYOUTS.length][0];
};

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
  private paused = false;
  private gl = false;
  private names: Record<ViewMode, string> = { ...CAMERA_NAMES };
  private readonly camBtns: HTMLButtonElement[];
  private readonly camSeg: HTMLElement;
  private readonly layBtn: HTMLButtonElement;
  private readonly layPic: HTMLElement;
  private readonly layLbl: HTMLElement;
  private readonly backBtn: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;
  private anchor: HTMLElement | null = null;

  constructor(private readonly hooks: ViewDockHooks) {
    this.camBtns = CAMERAS.map(
      (v) =>
        h(
          "button",
          {
            type: "button",
            class: "vd-cam",
            role: "radio",
            "aria-checked": "false",
            "data-v": v,
            title: CAMERA_TIPS[v],
            onclick: () => this.pickView(v),
          },
          svgIcon(CAMERA_ICON[v], 18),
          h("span", { class: "vd-l" }, CAMERA_NAMES[v]),
        ) as HTMLButtonElement,
    );
    this.camSeg = h(
      "div",
      { class: "vd-cams", role: "radiogroup", "aria-label": "Camera" },
      ...this.camBtns,
    );
    this.layPic = pictogram("normal");
    this.layLbl = h("span", { class: "vd-l" }, "Standard");
    this.layBtn = h(
      "button",
      {
        type: "button",
        class: "vd-lay",
        "aria-haspopup": "dialog",
        "aria-expanded": "false",
        title: "Screen layout, camera and instrument panel (Tab · Shift+Tab)",
        onclick: (e: Event) => {
          e.stopPropagation();
          this.toggle(this.layBtn, "up");
        },
      },
      this.layPic,
      this.layLbl,
      svgIcon(I.chevUp, 14),
    ) as HTMLButtonElement;
    // Instruments: the dock sits in the situation bar; this key goes back to the outside view with the last camera
    this.backBtn = h(
      "button",
      {
        type: "button",
        class: "vd-back",
        onclick: () => this.hooks.onLayout("normal"),
      },
      svgIcon(I.camCockpit, 18),
      h("span", { class: "vd-l" }, "Outside view"),
    ) as HTMLButtonElement;
    this.pauseBtn = h(
      "button",
      {
        type: "button",
        class: "vd-pause",
        "aria-label": "Pause",
        title: "Pause (Esc)",
        onclick: () => this.hooks.onPause(),
      },
      svgIcon(I.pause, 18),
    ) as HTMLButtonElement;
    this.el = h(
      "div",
      { class: "view-dock", role: "toolbar", "aria-label": "View" },
      this.camSeg,
      h("i", { class: "vd-sep", "aria-hidden": "true" }),
      this.backBtn,
      this.layBtn,
      this.pauseBtn,
    );
    this.pop = h("div", {
      class: "view-pop",
      role: "dialog",
      "aria-label": "View",
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
    this.sync();
  }

  get isOpen(): boolean {
    return !this.pop.hidden;
  }
  /** camera names from the 3D module once it is loaded */
  setNames(n: Record<ViewMode, string>): void {
    this.names = { ...CAMERA_NAMES, ...n };
    this.camBtns.forEach(
      (b) =>
        (b.querySelector(".vd-l")!.textContent =
          this.names[b.dataset.v as ViewMode]),
    );
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
  setPaused(p: boolean): void {
    if (p === this.paused) return;
    this.paused = p;
    this.pauseBtn.replaceChildren(svgIcon(p ? I.play : I.pause, 18));
    this.pauseBtn.setAttribute("aria-label", p ? "Resume" : "Pause");
    this.pauseBtn.title = p ? "Resume (Esc)" : "Pause (Esc)";
    this.pauseBtn.classList.toggle("on", p);
  }
  /** without WebGL the cameras stay (disabled), so the dock never changes shape */
  /** the dock's width with every label shown (measured while it shows them) */
  private wideW = 0;
  /** keep the labels when the dock's zone has room for them; else icons only, except the active camera, which
   *  keeps its name (Immersive on an iPad: the dock sits right of the floating PFD) */
  fit(avail: number): void {
    const narrow = this.el.classList.contains("narrow");
    if (!narrow && this.el.offsetWidth > 0) this.wideW = this.el.offsetWidth;
    const want = this.wideW > 0 && this.wideW > avail;
    if (want !== narrow) this.el.classList.toggle("narrow", want);
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
    const w = Math.min(440, innerWidth - 16);
    this.pop.style.width = `${w}px`;
    this.pop.style.left = `${Math.round(Math.max(8, Math.min(innerWidth - w - 8, r.right - w)))}px`;
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

  private sync(): void {
    this.el.dataset.layout = this.layout;
    this.el.classList.toggle("compact", this.layout === "none");
    this.el.classList.toggle("no-gl", !this.gl);
    for (const b of this.camBtns) {
      const on = b.dataset.v === this.view;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", String(on));
      b.disabled = !this.gl;
      b.title = this.gl ? CAMERA_TIPS[b.dataset.v as ViewMode] : NO_GL;
    }
    this.layPic.className = `vd-pic vd-pic-${this.layout}`;
    this.layLbl.textContent = layoutName(this.layout);
    this.layBtn.setAttribute(
      "aria-label",
      `Layout: ${layoutName(this.layout)}. Change the layout or the camera`,
    );
    this.backBtn.replaceChildren(
      svgIcon(CAMERA_ICON[this.view], 18),
      h("span", { class: "vd-l" }, "Outside view"),
    );
    this.backBtn.title = `Back to the outside view (${this.names[this.view]})`;
    this.backBtn.setAttribute("aria-label", this.backBtn.title);
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
    const cams = CAMERAS.map((v) =>
      h(
        "button",
        {
          type: "button",
          class: `vp-cam${v === this.view ? " on" : ""}`,
          role: "radio",
          "aria-checked": String(v === this.view),
          disabled: this.gl ? null : "",
          title: this.gl ? CAMERA_TIPS[v] : NO_GL,
          onclick: () => {
            this.pickView(v);
            this.render();
          },
        },
        svgIcon(CAMERA_ICON[v], 20),
        h("span", {}, this.names[v]),
      ),
    );
    const lays = LAYOUTS.map(([m, t, d]) =>
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
        h("span", {}, h("b", {}, t), h("small", {}, d)),
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
        h("span", {}, h("b", {}, t), h("small", {}, d)),
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
      h("span", {}, "Auto-hide the top bar in flight"),
      h("i", { class: `sw${auto ? " on" : ""}`, "aria-hidden": "true" }),
    );
    this.pop.replaceChildren(
      head("Camera", "V · Shift V"),
      h(
        "div",
        { class: "vp-cams", role: "radiogroup", "aria-label": "Camera" },
        ...cams,
      ),
      ...(this.gl ? [] : [h("p", { class: "vp-note" }, NO_GL)]),
      head("Screen layout", "Tab · Shift Tab"),
      h(
        "div",
        { class: "vp-lays", role: "radiogroup", "aria-label": "Screen layout" },
        ...lays,
      ),
      head("Instrument panel", ""),
      h(
        "div",
        {
          class: "vp-pans",
          role: "radiogroup",
          "aria-label": "Instrument panel",
        },
        ...pans,
      ),
      h(
        "p",
        { class: "vp-note" },
        "Every panel flies the same Cessna 172 flight model. More aircraft are coming.",
      ),
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
