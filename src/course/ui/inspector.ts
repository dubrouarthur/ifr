// Ground school editor (package F): the right-hand inspector (SPEC §5, mockup final/editor.png). Tabs adapt to the
// step: Reader | Stage | Goal | Notes for Reader + Stage steps; Calc, Drill, Fly it and Quiz tabs for those kinds;
// Block | Slide | Goal | Notes for designed slides (the selected block's fields, the layout and theme pickers).
// Author texts are edited in the language of the editor's EN / FR switch, with a "FR missing" badge.
// Also the small DOM kit the editor and the tray share (segments, chips, switches, fields, popover menus).
import { blockKindLabel } from "../canvas/strings";
import type {
  Annotation,
  BlockReveal,
  CalcGeneratorId,
  CalcParamDef,
  CalcSpec,
  CalcUnit,
  ColorToken,
  Course,
  Criterion,
  DiagramSpec,
  DrillSpec,
  FlyIt,
  FlyOption,
  GoalCheck,
  GuidanceLevel,
  InstrumentView,
  L10n,
  Lang,
  PaneView,
  PresenterAction,
  Quiz,
  ReaderBlock,
  SceneFields,
  SimScene,
  SlideBlock,
  SlideCanvas,
  StageControl,
  StageCue,
  Step,
  StepGoal,
  TextStyle,
  ThemeId,
  YourTurn,
} from "../types";
import type { Sim } from "../../sim/sim";
import { h } from "../../ui/dom";
import {
  COURSE_GOAL_ORDER,
  GOALS,
  goalDef,
  goalLabel,
  goalRow,
  stageView,
  suggestGoals,
  type GoalId,
} from "../goals";
import {
  fieldsOf,
  sceneFromFields,
  sceneSummary,
  verifyLine,
  type SceneDiff,
} from "../scene";
import {
  GENERATORS_BY_CATEGORY,
  answerIn,
  generate,
  getGenerator,
  newSeed,
} from "../calc";
import { UNIT_LABEL } from "../calc/text";
import { unitsLike } from "../calc/units";
import { LAYOUTS, layoutCanvas } from "../canvas/layouts";
import { baseThemeId, THEMES, THEME_IDS } from "../canvas/themes";
import { renderThumb } from "../canvas/render";
import { blockLabel } from "../canvas/blocks";
import type { EditorCommand } from "../canvas/editorCore";
import {
  explainRegion,
  PFD_CROPS,
  RADIO_CROPS,
  MFD_MAP_CROP,
  DISPLAY_TABLE,
} from "../stage/geometry";
import { EXPLAIN_REGIONS } from "../../ui/explain";
import {
  FLY_OPTIONS,
  TAB_LABEL,
  criteriaOf,
  defaultCalc,
  doThisFor,
  inspectorTabs,
  linearText,
  newCallout,
  newGoal,
  quizOfKind,
  renumberCallouts,
  tr,
  type InspectorTab,
} from "./templates";

const L = (en: string, fr: string): L10n => ({ en, fr });
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// ================================================================== the DOM kit
type Kid = Node | string | null | undefined | false;
const kids = (xs: Kid[]): (Node | string)[] =>
  xs.filter((x): x is Node | string => !!x);
export const t2 = (lang: Lang, en: string, fr: string) =>
  lang === "fr" ? fr : en;

const ICONS: Record<string, string> = {
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  x: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
  dots: "M5 12h.01M12 12h.01M19 12h.01",
  play: "M8 5v14l11-7z",
  back: "M15 18l-6-6 6-6",
  pulse: "M3 12h3l3-7 4 14 3-7h5",
  copy: "M8 8h11v11H8z M5 16V5h11",
  warn: "M12 4l9 16H3z M12 10v4 M12 17v.5",
  image: "M4 5h16v14H4z M4 16l5-5 4 4 3-3 4 4 M15 9.5h.01",
  text: "M5 6h14 M12 6v13 M9 19h6",
  shape: "M4 4h9v9H4z M15 11a5 5 0 1 1 0 10 5 5 0 0 1 0-10z",
  arrow: "M4 18L18 6 M10 6h8v8",
  callout: "M4 5h16v10H10l-4 4v-4H4z",
  marker: "M12 3a8 8 0 1 0 0 16a8 8 0 0 0 0-16z M11 8l2-1v8",
  diagram: "M4 19V5 M4 19h16 M7 15l4-5 3 3 5-7",
  gauge: "M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z M12 12l4-4 M12 7v1",
  viewport: "M3 5h18v13H3z M3 14c5-2 11-2 18 0 M8 21h8",
  quiz: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14 M12 17.5v.5 M12 21a9 9 0 1 0 0-18a9 9 0 0 0 0 18z",
  calc: "M6 3h12v18H6z M9 7h6 M9 11h.01 M12 11h.01 M15 11h.01 M9 14h.01 M12 14h.01 M15 14h.01 M9 17h.01 M12 17h3",
  layout: "M4 4h16v16H4z M4 9h16 M10 9v11",
  theme:
    "M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4-4-7.5-9-7.5z M7.5 11h.01 M10 7.5h.01 M14 7.5h.01",
  library: "M4 4h5v16H4z M10 4h4v16h-4z M15 5l4 1-3 14-4-1z",
  share: "M12 3v12 M7 8l5-5 5 5 M5 14v6h14v-6",
  undo: "M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3",
  trash: "M5 7h14 M10 7V4.5h4V7 M7 7l1 13h8l1-13",
  convert: "M4 7h13l-3-3 M20 17H7l3 3",
  checks: "M4 6h2 M4 12h2 M4 18h2 M9 6h11 M9 12h11 M9 18h11",
  search: "M11 18a7 7 0 1 0 0-14a7 7 0 0 0 0 14z M20 20l-4-4",
  device: "M5 3h14v18H5z M11 18h2",
  lock: "M7 11h10v9H7z M9 11V8a3 3 0 0 1 6 0v3",
};
export function ico(
  name: keyof typeof ICONS | string,
  cls = "ce-i",
): SVGSVGElement {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", cls);
  s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", ICONS[name] ?? "");
  s.append(p);
  return s;
}
export function btn(
  label: string,
  onClick: (e: MouseEvent) => void,
  o: {
    cls?: string;
    icon?: string;
    title?: string;
    disabled?: boolean;
    kbd?: string;
  } = {},
): HTMLButtonElement {
  const b = h("button", {
    type: "button",
    class: `ce-btn ${o.cls ?? ""}`.trim(),
    title: o.title,
    "aria-label": !label ? o.title : undefined,
  });
  if (o.icon) b.append(ico(o.icon));
  if (label) b.append(h("span", {}, label));
  if (o.kbd)
    b.append(h("span", { class: "ce-kbd", "aria-hidden": "true" }, o.kbd));
  if (o.disabled) b.disabled = true;
  b.addEventListener("click", (e) => {
    e.preventDefault();
    onClick(e);
  });
  return b;
}
export interface Opt<T> {
  value: T;
  label: string;
  title?: string;
  disabled?: boolean;
}
/** A segmented control (one value). */
export function seg<T>(
  opts: Opt<T>[],
  value: T,
  onPick: (v: T) => void,
  o: { full?: boolean; label?: string; cls?: string } = {},
): HTMLElement {
  const el = h("div", {
    class: `ce-seg${o.full ? " full" : ""} ${o.cls ?? ""}`.trim(),
    role: "radiogroup",
    "aria-label": o.label,
  });
  for (const op of opts) {
    const on = JSON.stringify(op.value) === JSON.stringify(value);
    const b = h(
      "button",
      {
        type: "button",
        role: "radio",
        "aria-checked": on ? "true" : "false",
        class: on ? "on" : "",
        title: op.title,
      },
      op.label,
    );
    if (op.disabled) b.disabled = true;
    b.addEventListener("click", () => {
      if (!on) onPick(op.value);
    });
    el.append(b);
  }
  return el;
}
/** Toggle chips (several values). */
export function chips<T>(
  opts: (Opt<T> & { on: boolean })[],
  onToggle: (v: T, on: boolean) => void,
  o: { label?: string } = {},
): HTMLElement {
  const el = h("div", {
    class: "ce-chips",
    role: "group",
    "aria-label": o.label,
  });
  for (const op of opts) {
    const b = h(
      "button",
      {
        type: "button",
        class: op.on ? "on" : "",
        "aria-pressed": op.on ? "true" : "false",
        title: op.title,
      },
      op.label,
    );
    if (op.disabled) b.disabled = true;
    b.addEventListener("click", () => onToggle(op.value, !op.on));
    el.append(b);
  }
  return el;
}
/** A switch (role=switch) with its label. */
export function sw(
  on: boolean,
  onChange: (on: boolean) => void,
  label: string,
  o: { disabled?: boolean; sub?: string } = {},
): HTMLElement {
  const b = h("button", {
    type: "button",
    role: "switch",
    class: `ce-sw${on ? " on" : ""}`,
    "aria-checked": on ? "true" : "false",
    "aria-label": label,
  });
  if (o.disabled) b.disabled = true;
  b.addEventListener("click", () => onChange(!on));
  return h(
    "label",
    { class: `ce-swrow${o.disabled ? " dis" : ""}` },
    h("span", { class: "ce-swl" }, label, o.sub ? h("small", {}, o.sub) : null),
    b,
  );
}
export function group(title: string, body: Kid[], action?: Kid): HTMLElement {
  return h(
    "section",
    { class: "ce-grp" },
    h(
      "div",
      { class: "ce-grp-hd" },
      h("span", { class: "ce-label" }, title),
      action || null,
    ),
    ...kids(body),
  );
}
export function note(text: string, cls = ""): HTMLElement {
  return h("p", { class: `ce-note ${cls}`.trim() }, text);
}
export function linkBtn(
  label: string,
  onClick: () => void,
  o: { disabled?: boolean } = {},
): HTMLButtonElement {
  const b = h("button", { type: "button", class: "ce-link" }, label);
  if (o.disabled) b.disabled = true;
  b.addEventListener("click", onClick);
  return b;
}
export function numIn(
  value: number | undefined,
  onChange: (v: number | undefined) => void,
  o: {
    min?: number;
    max?: number;
    step?: number;
    ph?: string;
    w?: number;
    label?: string;
    unit?: string;
  } = {},
): HTMLElement {
  const i = h("input", {
    type: "number",
    inputmode: "decimal",
    class: "ce-in num",
    value: value === undefined || !Number.isFinite(value) ? "" : String(value),
    min: o.min,
    max: o.max,
    step: o.step ?? "any",
    placeholder: o.ph,
    "aria-label": o.label,
    style: o.w ? `width:${o.w}px` : undefined,
  });
  i.addEventListener("input", () => {
    const v = i.value.trim() === "" ? undefined : Number(i.value);
    if (v === undefined || Number.isFinite(v)) onChange(v);
  });
  if (!o.unit) return i;
  return h(
    "span",
    { class: "ce-inwrap" },
    i,
    h("span", { class: "ce-unit" }, o.unit),
  );
}
export function textIn(
  value: string,
  onChange: (v: string) => void,
  o: {
    ph?: string;
    label?: string;
    multi?: boolean;
    rows?: number;
    mono?: boolean;
  } = {},
): HTMLInputElement | HTMLTextAreaElement {
  const i = o.multi
    ? h("textarea", {
        class: `ce-in${o.mono ? " mono" : ""}`,
        rows: o.rows ?? 3,
        placeholder: o.ph,
        "aria-label": o.label,
      })
    : h("input", {
        type: "text",
        class: `ce-in${o.mono ? " mono" : ""}`,
        placeholder: o.ph,
        "aria-label": o.label,
      });
  i.value = value;
  i.addEventListener("input", () => onChange(i.value));
  return i;
}
export function selectIn<T extends string | number>(
  opts: Opt<T>[] | { group: string; opts: Opt<T>[] }[],
  value: T | undefined,
  onChange: (v: T) => void,
  o: { label?: string; ph?: string } = {},
): HTMLSelectElement {
  const s = h("select", { class: "ce-in", "aria-label": o.label });
  const enc = (v: T) => JSON.stringify(v);
  if (o.ph)
    s.append(
      h(
        "option",
        { value: "", disabled: true, selected: value === undefined },
        o.ph,
      ),
    );
  const add = (parent: HTMLElement, op: Opt<T>) => {
    const e = h("option", { value: enc(op.value) }, op.label);
    if (op.disabled) e.disabled = true;
    if (value !== undefined && enc(op.value) === enc(value)) e.selected = true;
    parent.append(e);
  };
  for (const x of opts as (Opt<T> | { group: string; opts: Opt<T>[] })[]) {
    if ("group" in x) {
      const g = h("optgroup", { label: x.group });
      x.opts.forEach((op) => add(g, op));
      s.append(g);
    } else add(s, x);
  }
  s.addEventListener("change", () => {
    if (s.value) onChange(JSON.parse(s.value) as T);
  });
  return s;
}
export function field(
  label: string,
  control: Node,
  o: { badge?: Node | null; wide?: boolean } = {},
): HTMLElement {
  return h(
    "div",
    { class: `ce-field${o.wide ? " wide" : ""}` },
    h("div", { class: "ce-field-l" }, h("span", {}, label), o.badge ?? null),
    control,
  );
}
/** "FR missing" badge. */
export function missingBadge(lang: Lang): HTMLElement {
  return h(
    "span",
    { class: "ce-tag warn" },
    lang === "fr" ? "FR manquant" : "FR missing",
  );
}

/** Popover menus (a click outside, Escape or a pick closes them). */
let openPop: { el: HTMLElement; close: () => void } | null = null;
export function closePop() {
  openPop?.close();
}
export interface MenuItem {
  label: string;
  sub?: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  on?: boolean;
}
export function popover(
  anchor: HTMLElement,
  content: HTMLElement | MenuItem[],
  o: {
    align?: "start" | "end";
    width?: number;
    cls?: string;
    title?: string;
  } = {},
): () => void {
  closePop();
  const pop = h("div", {
    class: `ce-pop ${o.cls ?? ""}`.trim(),
    role: Array.isArray(content) ? "menu" : "dialog",
    "aria-label": o.title,
  });
  if (o.title) pop.append(h("div", { class: "ce-pop-title" }, o.title));
  if (Array.isArray(content)) {
    for (const it of content) {
      const b = h(
        "button",
        {
          type: "button",
          role: "menuitem",
          class: `ce-menu-it${it.danger ? " danger" : ""}${it.on ? " on" : ""}`,
        },
        it.icon ? ico(it.icon) : null,
        h(
          "span",
          { class: "ce-menu-tx" },
          h("b", {}, it.label),
          it.sub ? h("small", {}, it.sub) : null,
        ),
      );
      if (it.disabled) b.disabled = true;
      b.addEventListener("click", () => {
        close();
        it.onClick();
      });
      pop.append(b);
    }
  } else pop.append(content);
  const root = anchor.closest(".ce-app") ?? document.body;
  root.append(pop);
  if (o.width) pop.style.width = `${o.width}px`;
  const place = () => {
    const r = anchor.getBoundingClientRect();
    const rr = (root as HTMLElement).getBoundingClientRect();
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    let left = o.align === "end" ? r.right - pw : r.left;
    left = Math.max(8, Math.min(window.innerWidth - pw - 8, left));
    let top = r.bottom + 6;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    pop.style.left = `${left - rr.left}px`;
    pop.style.top = `${top - rr.top}px`;
  };
  place();
  const onDown = (e: Event) => {
    if (!pop.contains(e.target as Node) && !anchor.contains(e.target as Node))
      close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      anchor.focus();
    }
  };
  function close() {
    pop.remove();
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    if (openPop?.el === pop) openPop = null;
  }
  setTimeout(() => document.addEventListener("pointerdown", onDown, true));
  document.addEventListener("keydown", onKey, true);
  openPop = { el: pop, close };
  (
    pop.querySelector("button, input, select, textarea") as HTMLElement | null
  )?.focus({ preventScroll: true });
  return close;
}

// ================================================================== the inspector
export interface StageInfo {
  sim: Sim;
  scene: SimScene;
  diffs: SceneDiff[];
}
export interface InspectorHost {
  readonly course: Course;
  readonly step: Step;
  readonly lang: Lang;
  /** designed slide: the selected blocks */
  readonly selection: SlideBlock[];
  /** replace the step (one undo step, coalesced by key); `render` re-draws the inspector */
  setStep(s: Step, key?: string, render?: boolean): void;
  setCourse(c: Course, key?: string, render?: boolean): void;
  /** a designed slide edit made in the inspector (goes through the canvas editor) */
  setSlide(c: SlideCanvas, key?: string): void;
  selectBlocks(ids: string[]): void;
  runCanvas(cmd: EditorCommand): void;
  /** the stage Sim posed at a scene of the course (null: the scene cannot be applied) */
  stageInfo(sceneId: string | undefined): StageInfo | null;
  importImage(
    file: File,
  ): Promise<{ asset: string; w: number; h: number } | null>;
  assetUrl(id: string): string | null | Promise<string | null>;
  flyToCapture(): void;
  toast(msg: string, undo?: () => void): void;
}

// labels ------------------------------------------------------------
const CONTROL_LABEL: Record<StageControl, L10n> = {
  obs1: L("OBS", "OBS"),
  obs2: L("OBS 2", "OBS 2"),
  hdgBug: L("HDG bug", "Index de cap"),
  crs: L("CRS", "CRS"),
  altBug: L("ALT bug", "Index d’altitude"),
  baro: L("Baro", "Calage"),
  bank: L("Bank", "Inclinaison"),
  pitch: L("Pitch", "Assiette"),
  power: L("Power", "Puissance"),
  cdiSource: L("CDI source", "Source CDI"),
  brg1: L("BRG1", "BRG1"),
  brg2: L("BRG2", "BRG2"),
  dragAircraft: L("Drag aircraft", "Déplacer l’avion"),
  ap: L("Autopilot", "Pilote auto"),
};
const ALL_CONTROLS = Object.keys(CONTROL_LABEL) as StageControl[];
const STYLE_LABEL: Record<TextStyle, L10n> = {
  display: L("Display", "Affiche"),
  title: L("Title", "Titre"),
  lead: L("Lead", "Chapeau"),
  subtitle: L("Lead", "Chapeau"),
  heading: L("Heading", "Intertitre"),
  body: L("Body", "Texte"),
  small: L("Small", "Petit"),
  caption: L("Small", "Petit"),
  eyebrow: L("Eyebrow", "Surtitre"),
  label: L("Eyebrow", "Surtitre"),
  foot: L("Source line", "Ligne de source"),
  number: L("Big number", "Grand chiffre"),
  quote: L("Quote", "Citation"),
  formula: L("Formula", "Formule"),
  mono: L("Formula", "Formule"),
};
/** the roles of the type scale an author picks from (the older names are aliases, SPEC slides v2 §2) */
const STYLE_PICK: TextStyle[] = [
  "display",
  "title",
  "lead",
  "heading",
  "body",
  "small",
  "eyebrow",
  "foot",
  "number",
  "quote",
  "formula",
];
const STYLE_ALIAS: Partial<Record<TextStyle, TextStyle>> = {
  subtitle: "lead",
  caption: "small",
  label: "eyebrow",
  mono: "formula",
};
// the colours an author picks: ink, the semantic aviation colours (SPEC slides v2 §4), white for photos
const TOKENS: Exclude<ColorToken, `#${string}`>[] = [
  "text",
  "ink2",
  "muted",
  "accent",
  "path",
  "sel",
  "nav",
  "key",
  "stop",
  "white",
];
const TOKEN_SWATCH: Record<string, string> = {
  ink2: "#353c47",
  path: "#a8238f",
  sel: "#0b6f88",
  nav: "#17763c",
  key: "#a04d06",
  stop: "#b42323",
  text: "#111827",
  muted: "#6b7280",
  accent: "#0b63ce",
  brand: "#1d4ed8",
  ok: "#127a52",
  warn: "#b45309",
  danger: "#c22a3a",
  magenta: "#d21ccc",
  cyan: "#00c8e6",
  green: "#22c55e",
  amber: "#f5a524",
  white: "#ffffff",
  surface: "#eef1f5",
  line: "#c8d0da",
  bg: "#0c1015",
};
const PRESENTER_ACTIONS: { a: PresenterAction; label: L10n }[] = [
  { a: { k: "freeze" }, label: L("Freeze", "Figer") },
  {
    a: { k: "flyFor", s: 10 },
    label: L("Let it fly 10 s", "Laisser voler 10 s"),
  },
  { a: { k: "wind", dKt: 10 }, label: L("Wind +10 kt", "Vent +10 kt") },
  {
    a: { k: "failure", key: "ahrs" as never },
    label: L("Fail AI", "Panne horizon"),
  },
  { a: { k: "reset" }, label: L("Reset", "Réinitialiser") },
];
const FLY_OPTION_LABEL: Record<FlyOption, L10n> = {
  wind: L("Wind", "Vent"),
  partialPanel: L("Partial panel", "Panneau partiel"),
  surpriseMe: L("Surprise me", "Surprise"),
  goMissed: L("Go missed", "Remise de gaz"),
  turbulence: L("Turbulence", "Turbulence"),
  allowAp: L("Allow autopilot", "Pilote auto permis"),
};
const LEVELS: { v: GuidanceLevel; l: L10n }[] = [
  { v: "guided", l: L("Guided", "Guidé") },
  { v: "coached", l: L("Coached", "Accompagné") },
  { v: "solo", l: L("Solo", "Solo") },
  { v: "checkride", l: L("Checkride", "Test") },
];
const READER_LABEL: Record<ReaderBlock["t"], L10n> = {
  heading: L("Heading", "Titre"),
  text: L("Text", "Texte"),
  image: L("Image", "Image"),
  diagram: L("Diagram", "Schéma"),
  keys: L("Key to success", "Les clés"),
  doThis: L("Do this", "À faire"),
  reveal: L("Reveal", "Révélation"),
  procedure: L("Procedure", "Procédure"),
  takeaway: L("Takeaway", "À retenir"),
  quiz: L("Quiz", "Quiz"),
  formula: L("Formula", "Formule"),
};

/** The instrument chips of the Stage tab, per cockpit (the mockup: PFD MFD HSI Six-pack Radios Plate Hold Profile 3D still). */
interface InstChip {
  id: string;
  label: L10n;
  pane(step: Step, course: Course): PaneView | null;
  is(p: PaneView): boolean;
}
const isDisp = (p: PaneView, k: string) => p.kind === k;
function instChips(course: Course): InstChip[] {
  const steam = course.cockpit === "steam";
  const air = course.cockpit === "airliner";
  const hsiG1000: PaneView = {
    kind: "pfd",
    crop: {
      rect: [...PFD_CROPS["pfd.hsi"]] as [number, number, number, number],
    },
  };
  const list: InstChip[] = [];
  if (air) {
    list.push(
      {
        id: "airlinerPfd",
        label: L("PFD", "PFD"),
        pane: () => ({ kind: "airlinerPfd" }),
        is: (p) => isDisp(p, "airlinerPfd"),
      },
      {
        id: "nd",
        label: L("ND", "ND"),
        pane: () => ({ kind: "nd" }),
        is: (p) => isDisp(p, "nd"),
      },
    );
  } else {
    list.push(
      {
        id: "pfd",
        label: L("PFD", "PFD"),
        pane: () => ({ kind: "pfd" }),
        is: (p) => isDisp(p, "pfd") && !(p as { crop?: unknown }).crop,
      },
      {
        id: "mfd",
        label: L("MFD", "MFD"),
        pane: () => ({ kind: "mfd" }),
        is: (p) => isDisp(p, "mfd"),
      },
      {
        id: "hsi",
        label: L("HSI", "HSI"),
        pane: () =>
          steam
            ? { kind: "six", crop: { region: "STEAM_LEFT:4" } }
            : clone(hsiG1000),
        is: (p) =>
          JSON.stringify(p) ===
          JSON.stringify(
            steam
              ? { kind: "six", crop: { region: "STEAM_LEFT:4" } }
              : hsiG1000,
          ),
      },
      {
        id: "six",
        label: L("Six-pack", "Six-pack"),
        pane: () => ({ kind: "six" }),
        is: (p) => isDisp(p, "six") && !(p as { crop?: unknown }).crop,
      },
      {
        id: "radios",
        label: L("Radios", "Radios"),
        pane: () =>
          steam
            ? { kind: "stack" }
            : {
                kind: "pfd",
                crop: {
                  rect: [...RADIO_CROPS.glass.rect] as [
                    number,
                    number,
                    number,
                    number,
                  ],
                },
              },
        is: (p) =>
          steam
            ? isDisp(p, "stack")
            : JSON.stringify(p) ===
              JSON.stringify({
                kind: "pfd",
                crop: { rect: RADIO_CROPS.glass.rect },
              }),
      },
    );
  }
  list.push(
    {
      id: "plate",
      label: L("Plate", "Carte"),
      pane: (s) => {
        const cur = s.stage?.panes[0];
        const prev =
          cur?.kind === "diagram" && cur.d.kind === "plate" ? cur.d : null;
        return {
          kind: "diagram",
          d: prev ?? { kind: "plate", approachId: "PARD-I27" },
        };
      },
      is: (p) => p.kind === "diagram" && p.d.kind === "plate",
    },
    {
      id: "hold",
      label: L("Hold", "Attente"),
      pane: () => ({
        kind: "diagram",
        d: { kind: "hold", inbound: 90, turn: "R", fix: "ARD" },
      }),
      is: (p) => p.kind === "diagram" && p.d.kind === "hold",
    },
    {
      id: "profile",
      label: L("Profile", "Profil"),
      pane: () => ({
        kind: "diagram",
        d: {
          kind: "calc",
          calc: {
            kind: "profile",
            fromFt: 3000,
            toFt: 500,
            angleDeg: 3,
            gsKt: 90,
          },
        },
      }),
      is: (p) =>
        p.kind === "diagram" &&
        (p.d.kind === "profile" ||
          (p.d.kind === "calc" && p.d.calc.kind === "profile")),
    },
    {
      id: "still",
      label: L("3D still", "Vue 3D"),
      pane: (s, c) => {
        const still = s.stage?.scene
          ? c.scenes[s.stage.scene]?.captured?.still
          : undefined;
        return still ? { kind: "still", asset: still } : null;
      },
      is: (p) => p.kind === "still",
    },
  );
  return list;
}
/** Crop segments of a display pane ("Full | Attitude | HSI | Tapes"). */
function cropOptions(
  p: PaneView,
  lang: Lang,
): { label: string; crop: PaneView }[] {
  if (p.kind === "pfd")
    return [
      { label: t2(lang, "Full", "Complet"), crop: { kind: "pfd" } },
      {
        label: t2(lang, "Attitude", "Horizon"),
        crop: {
          kind: "pfd",
          crop: { rect: [...PFD_CROPS["pfd.attitude"]] as never },
        },
      },
      {
        label: "HSI",
        crop: {
          kind: "pfd",
          crop: { rect: [...PFD_CROPS["pfd.hsi"]] as never },
        },
      },
      {
        label: t2(lang, "Tapes", "Bandeaux"),
        crop: {
          kind: "pfd",
          crop: { rect: [...PFD_CROPS["pfd.tapes"]] as never },
        },
      },
    ];
  if (p.kind === "six") {
    const names = [
      t2(lang, "Full", "Complet"),
      "ASI",
      "AI",
      "ALT",
      "TC",
      "HSI",
      "VSI",
    ];
    return names.map((label, i) => ({
      label,
      crop:
        i === 0
          ? { kind: "six" }
          : { kind: "six", crop: { region: `STEAM_LEFT:${i - 1}` } },
    }));
  }
  if (p.kind === "stack")
    return [
      { label: t2(lang, "Full", "Complet"), crop: { kind: "stack" } },
      {
        label: "NAV 2",
        crop: { kind: "stack", crop: { region: "STEAM_RIGHT:0" } },
      },
      {
        label: "RMI",
        crop: { kind: "stack", crop: { region: "STEAM_RIGHT:1" } },
      },
      {
        label: "GPS",
        crop: { kind: "stack", crop: { region: "STEAM_RIGHT:2" } },
      },
    ];
  if (p.kind === "mfd")
    return [
      { label: t2(lang, "Full", "Complet"), crop: { kind: "mfd" } },
      {
        label: t2(lang, "Map", "Carte"),
        crop: { kind: "mfd", crop: { rect: [...MFD_MAP_CROP] as never } },
      },
    ];
  return [];
}
/** Explain hotspots inside the pane's visible part, as numbered callouts (centred on each region). */
export function hotspotsFor(
  p: PaneView,
): { at: [number, number]; title: string; region: string }[] {
  if (p.kind === "diagram" || p.kind === "still" || p.kind === "image")
    return [];
  const table = DISPLAY_TABLE[p.kind];
  const rows =
    (
      EXPLAIN_REGIONS as Record<
        string,
        readonly (readonly [number, number, number, number, string, string])[]
      >
    )[table] ?? [];
  let rect: [number, number, number, number] = [0, 0, 1024, 768];
  const crop = "crop" in p ? p.crop : undefined;
  if (crop) {
    if ("rect" in crop) rect = crop.rect;
    else {
      const r = explainRegion(crop.region);
      if (r) rect = r.rect;
    }
  }
  const out: { at: [number, number]; title: string; region: string }[] = [];
  rows.forEach((r, i) => {
    const cx = r[0] + r[2] / 2;
    const cy = r[1] + r[3] / 2;
    const inside =
      cx >= rect[0] &&
      cx <= rect[0] + rect[2] &&
      cy >= rect[1] &&
      cy <= rect[1] + rect[3];
    const whole = r[2] >= 1000 || r[3] >= 700; // a strip spanning the whole display is not a hotspot of a crop
    if (inside && !(whole && crop))
      out.push({
        at: [Math.round(cx), Math.round(cy)],
        title: r[4],
        region: `${table}:${i}`,
      });
  });
  return out.slice(0, 8);
}

export class Inspector {
  readonly el: HTMLElement;
  private tabsEl: HTMLElement;
  private body: HTMLElement;
  private tab: InspectorTab | "" = "";
  private stepId = "";
  private previewSeed = 1;
  private sceneForm: SceneFields | null = null;
  private scroll = new Map<string, number>();
  constructor(private host: InspectorHost) {
    this.tabsEl = h("div", { class: "ce-tabs", role: "tablist" });
    this.body = h("div", { class: "ce-insp", role: "tabpanel" });
    this.el = h("aside", { class: "ce-col ce-right" }, this.tabsEl, this.body);
  }
  get currentTab(): InspectorTab {
    return this.tab || "reader";
  }
  setTab(t: InspectorTab) {
    if (this.tab) this.scroll.set(this.tab, this.body.scrollTop);
    this.tab = t;
    this.render();
    this.body.scrollTop = this.scroll.get(t) ?? 0;
  }
  /** Re-draw (after a step change, an undo, a selection change). Keeps the tab when it still applies. */
  render() {
    const step = this.host.step;
    if (!step) {
      // a course with no step yet (the builder shows the starter decks): nothing to inspect
      this.stepId = "";
      this.tabsEl.replaceChildren();
      this.body.replaceChildren(
        h(
          "p",
          { class: "ce-note muted ce-insp-empty" },
          this.t(
            "Pick a deck or a first slide: its properties show here.",
            "Choisissez une présentation ou une première diapo : ses propriétés s’affichent ici.",
          ),
        ),
      );
      return;
    }
    const tabs = inspectorTabs(step);
    if (step.id !== this.stepId) {
      this.stepId = step.id;
      this.tab =
        this.tab && tabs.includes(this.tab)
          ? this.tab
          : step.slide
            ? "block"
            : tabs.includes("stage") &&
                step.kind !== "fly" &&
                step.kind !== "quiz"
              ? step.kind === "page"
                ? "reader"
                : "stage"
              : tabs[0];
      this.sceneForm = null;
      this.previewSeed = 1;
    }
    if (!this.tab || !tabs.includes(this.tab)) this.tab = tabs[0];
    const tab: InspectorTab = this.tab;
    const lang = this.host.lang;
    const top = this.body.scrollTop;
    this.tabsEl.replaceChildren(
      ...tabs.map((t) => {
        const b = h(
          "button",
          {
            type: "button",
            role: "tab",
            class: t === this.tab ? "on" : "",
            "aria-selected": t === this.tab ? "true" : "false",
          },
          tr(TAB_LABEL[t], lang),
        );
        b.addEventListener("click", () => this.setTab(t));
        return b;
      }),
    );
    let content: Kid[] = [];
    try {
      content = this.content(tab);
    } catch (e) {
      console.error("inspector", e);
      content = [note(String((e as Error)?.message ?? e), "warn")];
    }
    this.body.replaceChildren(...kids(content));
    this.body.scrollTop = top;
  }

  // ---------------------------------------------------------------- helpers bound to the host
  private get lang() {
    return this.host.lang;
  }
  private get fr() {
    return this.host.lang === "fr";
  }
  private t(en: string, fr: string) {
    return this.fr ? fr : en;
  }
  private get frOn(): boolean {
    return this.host.course.langs.includes("fr");
  }
  /** An author text in the editor's language, with the other language as a reference and the FR badge. */
  private l10n(
    label: string,
    value: L10n | undefined,
    onChange: (v: L10n) => void,
    o: {
      multi?: boolean;
      rows?: number;
      ph?: string;
      mono?: boolean;
      key?: string;
    } = {},
  ): HTMLElement {
    const lang = this.lang;
    const v: L10n = value ? { ...value } : { en: "" };
    const cur = lang === "fr" ? (v.fr ?? "") : v.en;
    let badge: HTMLElement | null = null;
    const refresh = () => {
      const need =
        this.frOn && lang === "en" && v.en.trim() && !(v.fr ?? "").trim();
      if (need && !badge) {
        badge = missingBadge(lang);
        head.append(badge);
      } else if (!need && badge) {
        badge.remove();
        badge = null;
      }
    };
    const input = textIn(
      cur,
      (s) => {
        if (lang === "fr") {
          if (s) v.fr = s;
          else delete v.fr;
        } else v.en = s;
        refresh();
        onChange({ ...v });
      },
      {
        multi: o.multi,
        rows: o.rows,
        ph: lang === "fr" ? (v.en ? v.en : o.ph) : o.ph,
        label,
        mono: o.mono,
      },
    );
    const head = h(
      "div",
      { class: "ce-field-l" },
      h("span", {}, label),
      h("span", { class: "ce-langtag" }, lang.toUpperCase()),
    );
    refresh();
    const ref =
      lang === "fr" && v.en.trim()
        ? h("div", { class: "ce-ref" }, h("b", {}, "EN "), v.en)
        : null;
    return h("div", { class: "ce-field" }, head, input, ref);
  }
  private step(): Step {
    return clone(this.host.step);
  }
  private set(s: Step, key?: string, render = false) {
    this.host.setStep(s, key, render);
    if (render) this.render();
  }
  /** Edit the step in place and commit (key coalesces typing). */
  private edit(key: string | undefined, f: (s: Step) => void, render = false) {
    const s = this.step();
    f(s);
    this.set(s, key, render);
  }

  // ---------------------------------------------------------------- tabs
  private content(tab: InspectorTab): Kid[] {
    switch (tab) {
      case "reader":
        return this.readerTab();
      case "stage":
        return this.stageTab();
      case "goal":
        return this.goalTab();
      case "notes":
        return this.notesTab();
      case "calc":
        return this.calcTab();
      case "drill":
        return this.drillTab();
      case "fly":
        return this.flyTab();
      case "quiz":
        return this.quizTab();
      case "block":
        return this.blockTab();
      case "slide":
        return this.slideTab();
    }
  }

  // ================================================================ Reader
  private readerTab(): Kid[] {
    const s = this.host.step;
    const out: Kid[] = [
      this.l10n(this.t("Step title", "Titre de l’étape"), s.title, (v) =>
        this.edit("title", (x) => (x.title = v)),
      ),
    ];
    const list = h("div", { class: "ce-blocks" });
    s.reader.forEach((b, i) => list.append(this.readerCard(b, i)));
    if (!s.reader.length)
      list.append(
        note(
          this.t(
            "No text yet. Add a heading, text or an image.",
            "Pas encore de texte. Ajoutez un titre, du texte ou une image.",
          ),
        ),
      );
    const add = btn(
      this.t("Add a block", "Ajouter un bloc"),
      () => this.addReaderMenu(add),
      { icon: "plus", cls: "sm" },
    );
    const drop = h(
      "div",
      { class: "ce-drop", tabindex: "0" },
      ico("image"),
      h(
        "span",
        {},
        this.t(
          "Drop or paste an image here",
          "Déposez ou collez une image ici",
        ),
      ),
    );
    this.imageDrop(drop, async (f) => {
      const r = await this.host.importImage(f);
      if (r)
        this.edit(
          undefined,
          (x) => x.reader.push({ t: "image", asset: r.asset, alt: { en: "" } }),
          true,
        );
    });
    out.push(
      group(this.t("Reader blocks", "Blocs du texte"), [
        list,
        h("div", { class: "ce-row" }, add),
        drop,
      ]),
    );
    return out;
  }
  private imageDrop(el: HTMLElement, onFile: (f: File) => void) {
    el.addEventListener("dragover", (e) => {
      e.preventDefault();
      el.classList.add("over");
    });
    el.addEventListener("dragleave", () => el.classList.remove("over"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      el.classList.remove("over");
      const f = [...(e.dataTransfer?.files ?? [])].find((x) =>
        x.type.startsWith("image/"),
      );
      if (f) onFile(f);
    });
    el.addEventListener("paste", (e) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) =>
        x.type.startsWith("image/"),
      );
      if (f) {
        e.preventDefault();
        onFile(f);
      }
    });
    el.addEventListener("click", () => this.pickFile(onFile));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.pickFile(onFile);
      }
    });
  }
  private pickFile(onFile: (f: File) => void) {
    const i = h("input", {
      type: "file",
      accept: "image/png,image/jpeg,image/webp,image/gif",
    });
    i.addEventListener("change", () => {
      const f = i.files?.[0];
      if (f) onFile(f);
    });
    i.click();
  }
  private addReaderMenu(anchor: HTMLElement) {
    const push = (b: ReaderBlock) =>
      this.edit(undefined, (x) => x.reader.push(b), true);
    const goal = this.host.step.goal;
    popover(
      anchor,
      [
        {
          label: this.t("Heading", "Titre"),
          icon: "text",
          onClick: () => push({ t: "heading", text: { en: "" } }),
        },
        {
          label: this.t("Text", "Texte"),
          sub: this.t(
            "**bold**, *italic*, lists, [[word|callout]] links",
            "**gras**, *italique*, listes, liens [[mot|légende]]",
          ),
          icon: "text",
          onClick: () => push({ t: "text", text: { en: "" } }),
        },
        {
          label: this.t("Key to success", "Les clés de la réussite"),
          icon: "check",
          onClick: () => push({ t: "keys", items: [{ en: "" }] }),
        },
        {
          label: this.t("Takeaway", "À retenir"),
          sub: this.t("Copied into the handout", "Repris dans le résumé"),
          icon: "marker",
          onClick: () => push({ t: "takeaway", text: { en: "" } }),
        },
        {
          label: this.t("Formula card", "Fiche formule"),
          sub: this.t(
            "Exact formula and rule of thumb",
            "Formule exacte et règle pratique",
          ),
          icon: "calc",
          onClick: () =>
            push({
              t: "formula",
              formula: { en: "" },
              ruleOfThumb: { en: "" },
            }),
        },
        {
          label: this.t("Image…", "Image…"),
          icon: "image",
          onClick: () =>
            this.pickFile(async (f) => {
              const r = await this.host.importImage(f);
              if (r) push({ t: "image", asset: r.asset, alt: { en: "" } });
            }),
        },
        {
          label: this.t(
            "Do this (from the goal)",
            "À faire (depuis l’objectif)",
          ),
          sub: goal?.all.length
            ? this.t("Rows ticked live by the sim", "Lignes cochées en direct")
            : this.t("Set a goal first", "Définissez d’abord un objectif"),
          icon: "checks",
          disabled: !goal?.all.length,
          onClick: () => push(doThisFor(goal!.all)),
        },
        {
          label: this.t("Reveal after the answer", "Révéler après la réponse"),
          icon: "play",
          onClick: () =>
            push({
              t: "reveal",
              when: "answered",
              blocks: [{ t: "text", text: { en: "" } }],
            }),
        },
      ],
      { title: this.t("Add to the reader", "Ajouter au texte"), width: 320 },
    );
  }
  private readerCard(b: ReaderBlock, i: number): HTMLElement {
    const s = this.host.step;
    const n = s.reader.length;
    const key = `reader.${i}`;
    const upd = (f: (x: ReaderBlock) => void, render = false) =>
      this.edit(key, (st) => f(st.reader[i]), render);
    const head = h(
      "div",
      { class: "ce-card-hd" },
      h("span", { class: "ce-card-t" }, tr(READER_LABEL[b.t], this.lang)),
      h("span", { class: "ce-sp" }),
      btn(
        "",
        () =>
          this.edit(
            undefined,
            (st) => st.reader.splice(i - 1, 0, st.reader.splice(i, 1)[0]),
            true,
          ),
        {
          icon: "up",
          cls: "ic",
          title: this.t("Move up", "Monter"),
          disabled: i === 0,
        },
      ),
      btn(
        "",
        () =>
          this.edit(
            undefined,
            (st) => st.reader.splice(i + 1, 0, st.reader.splice(i, 1)[0]),
            true,
          ),
        {
          icon: "down",
          cls: "ic",
          title: this.t("Move down", "Descendre"),
          disabled: i === n - 1,
        },
      ),
      btn(
        "",
        () => {
          const before = this.host.step;
          this.edit(undefined, (st) => st.reader.splice(i, 1), true);
          this.host.toast(this.t("Block deleted", "Bloc supprimé"), () =>
            this.set(before, undefined, true),
          );
        },
        { icon: "x", cls: "ic", title: this.t("Delete", "Supprimer") },
      ),
    );
    const body: Kid[] = [];
    switch (b.t) {
      case "heading":
      case "text":
      case "takeaway":
        body.push(
          this.l10n(
            this.t("Text", "Texte"),
            b.text,
            (v) => upd((x) => ((x as { text: L10n }).text = v)),
            { multi: b.t !== "heading", rows: b.t === "text" ? 4 : 2 },
          ),
        );
        break;
      case "keys":
        b.items.forEach((it, j) =>
          body.push(
            h(
              "div",
              { class: "ce-row tight" },
              this.l10n(`${j + 1}`, it, (v) =>
                upd((x) => ((x as typeof b).items[j] = v)),
              ),
              btn(
                "",
                () => upd((x) => (x as typeof b).items.splice(j, 1), true),
                { icon: "x", cls: "ic", title: this.t("Remove", "Retirer") },
              ),
            ),
          ),
        );
        body.push(
          linkBtn(this.t("+ Add a key", "+ Ajouter une clé"), () =>
            upd((x) => (x as typeof b).items.push({ en: "" }), true),
          ),
        );
        break;
      case "image": {
        const img = h("img", { class: "ce-cardimg", alt: "" });
        void Promise.resolve(this.host.assetUrl(b.asset)).then(
          (u) => u && (img.src = u),
        );
        body.push(img);
        body.push(
          this.l10n(
            this.t("Alt text (required)", "Texte alternatif (obligatoire)"),
            b.alt,
            (v) => upd((x) => ((x as typeof b).alt = v)),
            { ph: this.t("What the image shows", "Ce que montre l’image") },
          ),
        );
        body.push(
          this.l10n(this.t("Caption", "Légende"), b.caption, (v) =>
            upd((x) => ((x as typeof b).caption = v)),
          ),
        );
        body.push(
          field(
            this.t("Credit", "Crédit"),
            textIn(
              b.attribution ?? "",
              (v) => upd((x) => ((x as typeof b).attribution = v || undefined)),
              { ph: "Photo: …" },
            ),
          ),
        );
        break;
      }
      case "diagram":
        body.push(
          ...this.diagramFields(b.d, (d) =>
            upd((x) => ((x as typeof b).d = d)),
          ),
        );
        body.push(
          this.l10n(this.t("Caption", "Légende"), b.caption, (v) =>
            upd((x) => ((x as typeof b).caption = v)),
          ),
        );
        break;
      case "doThis":
        b.rows.forEach((r, j) => {
          const checks = s.goal?.all ?? [];
          body.push(
            h(
              "div",
              { class: "ce-dothis" },
              this.l10n(`${this.t("Row", "Ligne")} ${j + 1}`, r.text, (v) =>
                upd((x) => ((x as typeof b).rows[j].text = v)),
              ),
              field(
                this.t("Ticked by", "Cochée par"),
                selectIn(
                  checks.map((c, k) => ({
                    value: k,
                    label: `${k + 1}. ${goalLabel(c, this.lang)}`,
                  })),
                  r.check,
                  (v) => upd((x) => ((x as typeof b).rows[j].check = v)),
                ),
                {},
              ),
            ),
          );
        });
        body.push(
          h(
            "div",
            { class: "ce-row" },
            linkBtn(
              this.t("Rewrite from the goal", "Réécrire depuis l’objectif"),
              () =>
                upd(
                  (x) => Object.assign(x, doThisFor(s.goal?.all ?? [])),
                  true,
                ),
              { disabled: !s.goal?.all.length },
            ),
          ),
        );
        break;
      case "formula":
        body.push(
          this.l10n(
            this.t("Exact formula", "Formule exacte"),
            b.formula,
            (v) => upd((x) => ((x as typeof b).formula = v)),
            { mono: true },
          ),
        );
        body.push(
          this.l10n(
            this.t("Rule of thumb", "Règle pratique"),
            b.ruleOfThumb,
            (v) => upd((x) => ((x as typeof b).ruleOfThumb = v)),
          ),
        );
        break;
      case "reveal":
        body.push(
          field(
            this.t("Shows", "Apparaît"),
            selectIn<string>(
              [
                {
                  value: "answered",
                  label: this.t("after the answer", "après la réponse"),
                },
                {
                  value: "goalMet",
                  label: this.t(
                    "when the goal is met",
                    "quand l’objectif est atteint",
                  ),
                },
                {
                  value: "presenter",
                  label: this.t(
                    "when the presenter reveals it",
                    "quand le présentateur le révèle",
                  ),
                },
                {
                  value: "step1",
                  label: this.t("at reveal 1", "à l’apparition 1"),
                },
                {
                  value: "step2",
                  label: this.t("at reveal 2", "à l’apparition 2"),
                },
                {
                  value: "step3",
                  label: this.t("at reveal 3", "à l’apparition 3"),
                },
              ],
              typeof b.when === "object" ? `step${b.when.step}` : b.when,
              (v) =>
                upd(
                  (x) =>
                    ((x as typeof b).when = v.startsWith("step")
                      ? { step: Number(v.slice(4)) }
                      : (v as "answered")),
                ),
            ),
          ),
        );
        b.blocks.forEach((nb, j) => {
          if (nb.t === "text" || nb.t === "heading" || nb.t === "takeaway")
            body.push(
              this.l10n(
                `${tr(READER_LABEL[nb.t], this.lang)} ${j + 1}`,
                nb.text,
                (v) =>
                  upd(
                    (x) =>
                      (((x as typeof b).blocks[j] as { text: L10n }).text = v),
                  ),
                { multi: true, rows: 3 },
              ),
            );
          else body.push(note(tr(READER_LABEL[nb.t], this.lang)));
        });
        body.push(
          linkBtn(this.t("+ Add text", "+ Ajouter du texte"), () =>
            upd(
              (x) =>
                (x as typeof b).blocks.push({ t: "text", text: { en: "" } }),
              true,
            ),
          ),
        );
        break;
      case "procedure":
        body.push(
          field(
            this.t("Procedure id", "Identifiant de procédure"),
            textIn(b.procId, (v) => upd((x) => ((x as typeof b).procId = v)), {
              mono: true,
            }),
          ),
        );
        break;
      case "quiz":
        body.push(
          note(
            this.t(
              "An inline question: edit it in the Quiz editor of a Quiz step, or convert this step.",
              "Une question intégrée : modifiez-la dans une étape Quiz, ou convertissez cette étape.",
            ),
          ),
        );
        if ("prompt" in b.quiz && b.quiz.prompt)
          body.push(
            this.l10n(
              this.t("Question", "Question"),
              b.quiz.prompt,
              (v) =>
                upd(
                  (x) =>
                    (((x as typeof b).quiz as { prompt: L10n }).prompt = v),
                ),
              { multi: true, rows: 2 },
            ),
          );
        break;
    }
    return h("div", { class: "ce-card" }, head, ...kids(body));
  }
  private diagramFields(d: DiagramSpec, set: (d: DiagramSpec) => void): Kid[] {
    const out: Kid[] = [];
    if (d.kind === "hold") {
      out.push(
        h(
          "div",
          { class: "ce-grid3" },
          field(
            this.t("Fix", "Repère"),
            textIn(d.fix, (v) => set({ ...d, fix: v.toUpperCase() }), {
              mono: true,
            }),
          ),
          field(
            this.t("Inbound", "Rapprochement"),
            numIn(
              d.inbound,
              (v) =>
                v !== undefined &&
                set({
                  ...d,
                  inbound: ((Math.round(v) % 360) + 360) % 360 || 360,
                }),
              { min: 1, max: 360, unit: "°" },
            ),
          ),
          field(
            this.t("Turns", "Virages"),
            seg(
              [
                { value: "R" as const, label: this.t("Right", "Droite") },
                { value: "L" as const, label: this.t("Left", "Gauche") },
              ],
              d.turn,
              (v) => set({ ...d, turn: v }),
            ),
          ),
        ),
      );
    } else if (d.kind === "plate") {
      out.push(
        field(
          this.t("Approach", "Approche"),
          textIn(d.approachId, (v) => set({ ...d, approachId: v }), {
            mono: true,
            ph: "PARD-I27",
          }),
        ),
      );
    } else if (d.kind === "airportDiagram") {
      out.push(
        field(
          "ICAO",
          textIn(d.icao, (v) => set({ ...d, icao: v.toUpperCase() }), {
            mono: true,
          }),
        ),
      );
    } else if (d.kind === "calc") {
      const c = d.calc as unknown as Record<string, unknown>;
      const nums = Object.entries(c).filter(
        ([k, v]) => typeof v === "number" && k !== "kind",
      );
      out.push(
        h(
          "div",
          { class: "ce-grid3" },
          ...nums.map(([k, v]) =>
            field(
              k,
              numIn(
                v as number,
                (x) =>
                  x !== undefined &&
                  set({
                    kind: "calc",
                    calc: {
                      ...(d.calc as object),
                      [k]: x,
                    } as unknown as typeof d.calc,
                  }),
              ),
            ),
          ),
        ),
      );
    } else out.push(note(this.t(`Diagram: ${d.kind}`, `Schéma : ${d.kind}`)));
    return out;
  }

  // ================================================================ Stage
  private stageTab(): Kid[] {
    const s = this.host.step;
    const c = this.host.course;
    const cue = s.stage;
    if (!cue)
      return [
        note(
          this.t(
            "This step has no stage: the reader fills the screen.",
            "Ce pas n’a pas de scène : le texte occupe l’écran.",
          ),
        ),
        btn(
          this.t("Add a stage", "Ajouter une scène"),
          () =>
            this.edit(
              undefined,
              (x) => {
                x.stage = {
                  panes: [
                    {
                      kind:
                        c.cockpit === "airliner"
                          ? "airlinerPfd"
                          : c.cockpit === "steam"
                            ? "six"
                            : "pfd",
                    },
                  ],
                  mode: "frozen",
                  ...(Object.keys(c.scenes)[0]
                    ? { scene: Object.keys(c.scenes)[0] }
                    : {}),
                  annotations: [],
                };
                if (x.layout === "readerOnly") delete x.layout;
              },
              true,
            ),
          { icon: "plus" },
        ),
      ];
    const setCue = (f: (q: StageCue) => void, key?: string, render = true) =>
      this.edit(key, (x) => f(x.stage!), render);
    const pane = cue.panes[0];
    const out: Kid[] = [];
    // instrument
    const insts = instChips(c);
    const chipsEl = chips(
      insts.map((ch) => {
        const p = ch.pane(s, c);
        return {
          value: ch.id,
          label: tr(ch.label, this.lang),
          on: ch.is(pane),
          disabled: !p,
          title: !p
            ? this.t(
                "Capture a 3D still with the scene first",
                "Capturez d’abord une vue 3D avec la scène",
              )
            : undefined,
        };
      }),
      (id) => {
        const ch = insts.find((x) => x.id === id)!;
        const p = ch.pane(s, c);
        if (p)
          setCue(
            (q) =>
              (q.panes = [
                p,
                ...(q.panes.slice(1) as PaneView[]),
              ] as StageCue["panes"]),
          );
      },
      { label: this.t("Instrument", "Instrument") },
    );
    const crops = cropOptions(pane, this.lang);
    out.push(
      group(
        this.t("Instrument", "Instrument"),
        [
          chipsEl,
          crops.length
            ? seg(
                crops.map((o) => ({
                  value: JSON.stringify(o.crop),
                  label: o.label,
                })),
                JSON.stringify(pane),
                (v) => setCue((q) => (q.panes[0] = JSON.parse(v) as PaneView)),
                { full: true, label: this.t("Crop", "Recadrage") },
              )
            : null,
          pane.kind === "diagram"
            ? h(
                "div",
                { class: "ce-sub" },
                ...kids(
                  this.diagramFields(pane.d, (d) =>
                    setCue(
                      (q) =>
                        (q.panes[0] = {
                          ...(q.panes[0] as object),
                          d,
                        } as PaneView),
                      "pane.d",
                      false,
                    ),
                  ),
                ),
              )
            : null,
          sw(
            cue.inset === "plan",
            (on) => setCue((q) => (on ? (q.inset = "plan") : delete q.inset)),
            this.t("Plan inset", "Vue en plan"),
            {
              sub: this.t(
                "A small map; with Drag aircraft the student moves it",
                "Une petite carte ; avec Déplacer l’avion, l’élève la manipule",
              ),
            },
          ),
        ],
        h(
          "span",
          { class: "ce-muted sm" },
          c.cockpit === "steam"
            ? this.t("Steam", "Classique")
            : c.cockpit === "airliner"
              ? this.t("Airliner", "Liner")
              : "G1000",
        ),
      ),
    );
    // scene
    out.push(this.sceneGroup(cue.scene, (id) => setCue((q) => (q.scene = id))));
    // mode
    const clips = Object.keys(c.clips);
    out.push(
      group(this.t("Mode", "Mode"), [
        seg(
          [
            { value: "frozen" as const, label: this.t("Frozen", "Figé") },
            { value: "live" as const, label: this.t("Live", "Direct") },
            {
              value: "clip" as const,
              label: this.t("Clip", "Séquence"),
              disabled: !clips.length,
              title: clips.length
                ? undefined
                : this.t(
                    "Press ⇧C in the cockpit to record a clip",
                    "⇧C dans le cockpit enregistre une séquence",
                  ),
            },
            { value: "fly" as const, label: this.t("Fly it", "En vol") },
          ],
          cue.mode,
          (m) =>
            setCue((q) => {
              q.mode = m;
              if (m === "clip" && !q.clip) q.clip = clips[0];
            }),
          { full: true },
        ),
        cue.mode === "clip"
          ? field(
              this.t("Clip", "Séquence"),
              selectIn(
                clips.map((id) => ({
                  value: id,
                  label: `${id} · ${Math.round(c.clips[id].durS)} s`,
                })),
                cue.clip,
                (v) => setCue((q) => (q.clip = v)),
              ),
            )
          : null,
        s.kind === "predict"
          ? field(
              this.t(
                "After the answer, fly for",
                "Après la réponse, voler pendant",
              ),
              numIn(
                cue.liveForS,
                (v) =>
                  setCue(
                    (q) => (v ? (q.liveForS = v) : delete q.liveForS),
                    "liveFor",
                    false,
                  ),
                { min: 2, max: 120, unit: "s", w: 90 },
              ),
            )
          : null,
      ]),
    );
    // callouts
    out.push(
      this.calloutsGroup(cue, (list, render = true, key?: string) =>
        setCue((q) => (q.annotations = list), key, render),
      ),
    );
    // controls
    const frozen = cue.mode === "frozen" || cue.mode === "fly";
    out.push(
      group(this.t("Student controls", "Commandes de l’élève"), [
        chips(
          ALL_CONTROLS.map((k) => ({
            value: k,
            label: tr(CONTROL_LABEL[k], this.lang),
            on: !!cue.controls?.includes(k),
            disabled: frozen,
          })),
          (k, on) =>
            setCue((q) => {
              const set = new Set(q.controls ?? []);
              if (on) set.add(k);
              else set.delete(k);
              q.controls = ALL_CONTROLS.filter((x) => set.has(x));
              if (!q.controls.length) delete q.controls;
            }),
        ),
        frozen
          ? note(
              this.t(
                "A frozen step has no controls. Choose Live to open some.",
                "Un pas figé n’a pas de commandes. Choisissez Direct pour en ouvrir.",
              ),
            )
          : note(
              this.t(
                "Everything else shows “Locked by this step”.",
                "Le reste affiche « Verrouillé pour cette étape ».",
              ),
              "muted",
            ),
      ]),
    );
    // assist, panel
    const assisted = !!(
      cue.assist?.holdAlt ||
      cue.assist?.holdIas ||
      (cue.assist?.timeScale ?? 1) > 1
    );
    out.push(
      group(this.t("Assist and panel", "Aide et panneau"), [
        sw(
          !!cue.assist?.holdAlt,
          (on) =>
            setCue(
              (q) => (q.assist = { ...q.assist, holdAlt: on || undefined }),
            ),
          this.t(
            "Hold altitude for the student",
            "Tenir l’altitude pour l’élève",
          ),
        ),
        sw(
          !!cue.assist?.holdIas,
          (on) =>
            setCue(
              (q) => (q.assist = { ...q.assist, holdIas: on || undefined }),
            ),
          this.t("Hold speed for the student", "Tenir la vitesse pour l’élève"),
        ),
        field(
          this.t("Time", "Temps"),
          seg(
            [1, 2, 4].map((v) => ({ value: v as 1 | 2 | 4, label: `×${v}` })),
            cue.assist?.timeScale ?? 1,
            (v) =>
              setCue(
                (q) =>
                  (q.assist = {
                    ...q.assist,
                    timeScale: v === 1 ? undefined : v,
                  }),
              ),
          ),
        ),
        assisted
          ? note(
              this.t(
                "Steps with an assist are practice: never ACS-graded.",
                "Avec une aide, l’étape est un entraînement : jamais noté ACS.",
              ),
              "warn",
            )
          : null,
        chips(
          [
            {
              value: "ai" as const,
              label: this.t("Cover the AI", "Masquer l’horizon"),
              on: !!cue.covers?.includes("ai"),
            },
            {
              value: "dg" as const,
              label: this.t("Cover the DG", "Masquer le conservateur"),
              on: !!cue.covers?.includes("dg"),
            },
          ],
          (k, on) =>
            setCue((q) => {
              const set = new Set(q.covers ?? []);
              if (on) set.add(k);
              else set.delete(k);
              q.covers = [...set];
              if (!q.covers.length) delete q.covers;
            }),
          { label: this.t("Partial panel", "Panneau partiel") },
        ),
      ]),
    );
    out.push(
      group(this.t("Presenter buttons", "Boutons du présentateur"), [
        chips(
          PRESENTER_ACTIONS.map((p) => ({
            value: JSON.stringify(p.a),
            label: tr(p.label, this.lang),
            on: !!cue.presenter?.some(
              (x) => JSON.stringify(x) === JSON.stringify(p.a),
            ),
          })),
          (v, on) =>
            setCue((q) => {
              const list = (q.presenter ?? []).filter(
                (x) => JSON.stringify(x) !== v,
              );
              if (on) list.push(JSON.parse(v) as PresenterAction);
              q.presenter = list;
              if (!list.length) delete q.presenter;
            }),
        ),
      ]),
    );
    return out;
  }
  private sceneGroup(
    sceneId: string | undefined,
    setScene: (id: string) => void,
  ): HTMLElement {
    const c = this.host.course;
    const ids = Object.keys(c.scenes);
    const info = sceneId ? this.host.stageInfo(sceneId) : null;
    const editBtn = linkBtn(
      this.sceneForm
        ? this.t("Close", "Fermer")
        : this.t("Edit as numbers", "Modifier en valeurs"),
      () => {
        if (this.sceneForm) this.sceneForm = null;
        else {
          const sc = sceneId ? c.scenes[sceneId] : undefined;
          this.sceneForm =
            sc && sc.pose.kind === "fields"
              ? clone(sc.pose)
              : info
                ? fieldsOf(info.sim)
                : {
                    kind: "fields",
                    pos: { fix: "ARD", radial: 270, distNm: 6 },
                    altFt: 4000,
                    hdg: 90,
                    iasKt: 100,
                    radios: { nav1: "ARD", obs1: 90, cdi: "NAV1" },
                  };
        }
        this.render();
      },
    );
    const body: Kid[] = [];
    if (ids.length > 1 || !sceneId)
      body.push(
        selectIn(
          ids.map((id) => ({ value: id, label: c.scenes[id].label ?? id })),
          sceneId,
          setScene,
          {
            label: this.t("Scene", "Scène"),
            ph: this.t("Choose a scene", "Choisir une scène"),
          },
        ),
      );
    if (sceneId && !c.scenes[sceneId])
      body.push(
        note(
          this.t(
            "This scene is missing from the course: capture it again.",
            "Cette scène manque au cours : recapturez-la.",
          ),
          "warn",
        ),
      );
    if (info) {
      const rows = sceneSummary(info.sim, info.scene, this.lang);
      const v = verifyLine(info.sim, info.scene, info.diffs, this.lang);
      body.push(
        h(
          "div",
          { class: "ce-scene" },
          h(
            "div",
            { class: "ce-kv" },
            ...rows.flatMap((r) => [
              h("span", {}, r.label),
              h("span", {}, r.value),
            ]),
          ),
          h(
            "div",
            { class: `ce-verify${v.ok ? "" : " warn"}` },
            ico(v.ok ? "check" : "warn"),
            h("span", {}, v.text),
          ),
        ),
      );
      if (!v.ok)
        body.push(
          h(
            "ul",
            { class: "ce-diffs" },
            ...info.diffs
              .slice(0, 5)
              .map((d) =>
                h(
                  "li",
                  {},
                  `${(d as { field?: string }).field ?? ""} ${tr((d as { message?: L10n }).message ?? { en: "" }, this.lang)}`.trim(),
                ),
              ),
          ),
        );
    } else if (sceneId && c.scenes[sceneId])
      body.push(
        note(
          this.t(
            "The scene cannot be posed here (nav data not loaded).",
            "La scène ne peut pas être posée ici (données de navigation absentes).",
          ),
          "warn",
        ),
      );
    if (this.sceneForm) body.push(this.sceneFormEl(sceneId, setScene));
    body.push(
      h(
        "div",
        { class: "ce-row" },
        btn(this.t("Recapture", "Recapturer"), () => this.host.flyToCapture(), {
          cls: "sm",
          icon: "pulse",
          title: this.t(
            "Fly to the moment again and press C",
            "Revolez jusqu’au moment et appuyez sur C",
          ),
        }),
      ),
    );
    return group(this.t("Scene", "Scène"), body, editBtn);
  }
  private sceneFormEl(
    sceneId: string | undefined,
    setScene: (id: string) => void,
  ): HTMLElement {
    const f = this.sceneForm!;
    const c = this.host.course;
    const sc = sceneId ? c.scenes[sceneId] : undefined;
    const pos = f.pos;
    const posMode = "fix" in pos ? "fix" : "runway" in pos ? "runway" : "ll";
    const wind = { dir: sc?.weather.windDir ?? 0, kt: sc?.weather.windKt ?? 0 };
    const posFields: Kid[] =
      "fix" in pos
        ? [
            field(
              this.t("Fix", "Repère"),
              textIn(pos.fix, (v) => (pos.fix = v.toUpperCase()), {
                mono: true,
              }),
            ),
            field(
              this.t("Radial", "Radiale"),
              numIn(pos.radial, (v) => v !== undefined && (pos.radial = v), {
                unit: "°",
              }),
            ),
            field(
              this.t("Distance", "Distance"),
              numIn(pos.distNm, (v) => v !== undefined && (pos.distNm = v), {
                unit: "NM",
                step: 0.1,
              }),
            ),
          ]
        : "runway" in pos
          ? [
              field(
                "ICAO",
                textIn(
                  pos.runway.icao,
                  (v) => (pos.runway.icao = v.toUpperCase()),
                  { mono: true },
                ),
              ),
              field(
                this.t("Runway", "Piste"),
                textIn(
                  pos.runway.id,
                  (v) => (pos.runway.id = v.toUpperCase()),
                  { mono: true },
                ),
              ),
              field(
                this.t("Final", "Finale"),
                numIn(pos.distNm, (v) => v !== undefined && (pos.distNm = v), {
                  unit: "NM",
                  step: 0.1,
                }),
              ),
            ]
          : [
              field(
                "Lat",
                numIn(pos.lat, (v) => v !== undefined && (pos.lat = v), {
                  step: 0.0001,
                }),
              ),
              field(
                "Lon",
                numIn(pos.lon, (v) => v !== undefined && (pos.lon = v), {
                  step: 0.0001,
                }),
              ),
            ];
    const r = f.radios ?? (f.radios = {});
    const apply = btn(
      this.t("Pose the scene", "Poser la scène"),
      () => {
        const used = this.host.course.steps.filter(
          (s) => s.stage?.scene === sceneId || s.slide?.scene === sceneId,
        ).length;
        const inPlace = sc && sc.pose.kind === "fields" && used <= 1;
        let id = inPlace
          ? sceneId!
          : `sc-${Math.random().toString(36).slice(2, 7)}`;
        while (!inPlace && c.scenes[id])
          id = `sc-${Math.random().toString(36).slice(2, 7)}`;
        const label =
          "fix" in pos
            ? `${pos.fix} R-${String(Math.round(pos.radial)).padStart(3, "0")} · ${pos.distNm} NM · ${f.altFt.toLocaleString(this.fr ? "fr-FR" : "en-US")} ft`
            : "runway" in pos
              ? `${pos.runway.icao} ${pos.runway.id} · ${pos.distNm} NM`
              : `${f.altFt} ft`;
        const next = sceneFromFields(f, {
          id,
          label,
          cockpit: c.cockpit,
          world: c.world,
          weather: {
            ...(sc?.weather ?? {}),
            windDir: wind.dir,
            windKt: wind.kt,
          },
          seed: sc?.seed ?? 1,
        });
        this.sceneForm = null;
        this.host.setCourse(
          {
            ...this.host.course,
            scenes: { ...this.host.course.scenes, [id]: next },
          },
          undefined,
          false,
        );
        setScene(id);
      },
      { cls: "sm primary" },
    );
    return h(
      "div",
      { class: "ce-form" },
      seg(
        [
          { value: "fix", label: this.t("Fix · radial", "Repère · radiale") },
          { value: "runway", label: this.t("Runway", "Piste") },
          { value: "ll", label: "Lat / Lon" },
        ],
        posMode,
        (m) => {
          f.pos =
            m === "fix"
              ? { fix: "ARD", radial: 270, distNm: 6 }
              : m === "runway"
                ? { runway: { icao: "PARD", id: "27" }, distNm: 5 }
                : { lat: 0, lon: 0 };
          this.render();
        },
        { full: true },
      ),
      h("div", { class: "ce-grid3" }, ...kids(posFields)),
      h(
        "div",
        { class: "ce-grid3" },
        field(
          this.t("Altitude", "Altitude"),
          numIn(f.altFt, (v) => v !== undefined && (f.altFt = v), {
            unit: "ft",
            step: 100,
          }),
        ),
        field(
          this.t("Heading", "Cap"),
          numIn(f.hdg, (v) => v !== undefined && (f.hdg = v), { unit: "°" }),
        ),
        field(
          "IAS",
          numIn(f.iasKt, (v) => v !== undefined && (f.iasKt = v), {
            unit: "kt",
          }),
        ),
        field(
          "VS",
          numIn(f.vsFpm, (v) => (f.vsFpm = v), { unit: "fpm", step: 100 }),
        ),
        field(
          this.t("Wind from", "Vent du"),
          numIn(wind.dir, (v) => (wind.dir = v ?? 0), { unit: "°" }),
        ),
        field(
          this.t("Wind", "Vent"),
          numIn(wind.kt, (v) => (wind.kt = v ?? 0), { unit: "kt" }),
        ),
        field(
          "NAV1",
          textIn(
            String(r.nav1 ?? ""),
            (v) =>
              (r.nav1 = /^\d+(\.\d+)?$/.test(v)
                ? Number(v)
                : v.toUpperCase() || undefined),
            { mono: true, ph: "ARD / 110.30" },
          ),
        ),
        field(
          "OBS",
          numIn(r.obs1, (v) => (r.obs1 = v), { unit: "°" }),
        ),
        field(
          "CDI",
          selectIn<"NAV1" | "NAV2" | "GPS">(
            [
              { value: "NAV1", label: "NAV1" },
              { value: "NAV2", label: "NAV2" },
              { value: "GPS", label: "GPS" },
            ],
            r.cdi ?? "NAV1",
            (v) => (r.cdi = v),
          ),
        ),
      ),
      h("div", { class: "ce-row end" }, apply),
    );
  }
  private calloutsGroup(
    cue: { annotations?: Annotation[]; panes?: PaneView[] },
    set: (list: Annotation[], render?: boolean, key?: string) => void,
    pane?: PaneView,
  ): HTMLElement {
    const list = cue.annotations ?? [];
    const p = pane ?? cue.panes?.[0];
    const rows = h("div", { class: "ce-co-list" });
    list.forEach((a, i) => {
      if (a.type !== "callout" && a.type !== "tag") {
        rows.append(
          h(
            "div",
            { class: "ce-co" },
            h("i", { class: "ce-co-n alt" }, a.type[0].toUpperCase()),
            h("span", {}, a.type),
            btn("", () => set(list.filter((_, j) => j !== i)), {
              icon: "x",
              cls: "ic",
              title: this.t("Delete", "Supprimer"),
            }),
          ),
        );
        return;
      }
      const isCallout = a.type === "callout";
      const staged = !!a.when && typeof a.when === "object";
      const text = (a as { text?: L10n }).text;
      const region = a.anchor ? explainRegion(a.anchor)?.title : null;
      const row = h(
        "div",
        { class: `ce-co${staged ? "" : " always"}` },
        h(
          "i",
          { class: "ce-co-n" },
          isCallout ? String((a as { n: number }).n) : "T",
        ),
        h(
          "div",
          { class: "ce-co-body" },
          this.l10n(
            "",
            text,
            (v) =>
              set(
                list.map((x, j) =>
                  j === i ? ({ ...x, text: v } as Annotation) : x,
                ),
                false,
                `co.${i}`,
              ),
            { ph: region ?? this.t("What it shows", "Ce qu’il montre") },
          ),
          h(
            "div",
            { class: "ce-co-meta" },
            h(
              "span",
              { class: "ce-muted sm" },
              staged
                ? `${this.t("Reveal", "Apparition")} ${(a.when as { step: number }).step}`
                : this.t("Always shown", "Toujours visible"),
            ),
            region ? h("span", { class: "ce-muted sm" }, `· ${region}`) : null,
            h("span", { class: "ce-sp" }),
            btn("", () => set(renumberCallouts(move(list, i, i - 1))), {
              icon: "up",
              cls: "ic",
              title: this.t("Earlier", "Plus tôt"),
              disabled: i === 0,
            }),
            btn("", () => set(renumberCallouts(move(list, i, i + 1))), {
              icon: "down",
              cls: "ic",
              title: this.t("Later", "Plus tard"),
              disabled: i === list.length - 1,
            }),
            btn(
              "",
              () => set(renumberCallouts(list.filter((_, j) => j !== i))),
              { icon: "x", cls: "ic", title: this.t("Delete", "Supprimer") },
            ),
          ),
        ),
        (() => {
          const b = h("button", {
            type: "button",
            role: "switch",
            class: `ce-sw${staged ? " on" : ""}`,
            "aria-checked": staged ? "true" : "false",
            "aria-label": this.t(
              "Reveal one by one",
              "Faire apparaître une à une",
            ),
          });
          b.addEventListener("click", () => {
            const steps = list.filter(
              (x) => x.when && typeof x.when === "object",
            ).length;
            set(
              list.map((x, j) =>
                j === i
                  ? ({
                      ...x,
                      when: staged ? "always" : { step: steps + 1 },
                    } as Annotation)
                  : x,
              ),
            );
          });
          return b;
        })(),
      );
      rows.append(row);
    });
    if (!list.length)
      rows.append(
        note(
          this.t(
            "No callouts. Numbered callouts appear one per reveal.",
            "Pas de légendes. Les légendes numérotées apparaissent une par une.",
          ),
        ),
      );
    const spots = p ? hotspotsFor(p) : [];
    const imp = linkBtn(
      this.t("Import Explain hotspots", "Importer les zones Explication"),
      () => {
        let cur = [...list];
        for (const sp of spots) {
          if (cur.some((x) => x.anchor === sp.region)) continue;
          const a = newCallout(
            { panes: [{ kind: "pfd" }], mode: "frozen", annotations: cur },
            sp.at,
          );
          cur.push({
            ...a,
            anchor: sp.region,
            text: { en: sp.title },
          } as Annotation);
        }
        set(renumberCallouts(cur));
      },
      { disabled: !spots.length },
    );
    return group(
      this.t("Callouts · reveal order", "Légendes · ordre d’apparition"),
      [
        rows,
        h(
          "div",
          { class: "ce-row" },
          btn(
            this.t("Add callout", "Ajouter une légende"),
            () =>
              set([
                ...list,
                newCallout({
                  panes: [{ kind: "pfd" }],
                  mode: "frozen",
                  annotations: list,
                }),
              ]),
            { icon: "plus", cls: "sm" },
          ),
        ),
      ],
      imp,
    );
  }

  // ================================================================ Goal
  private goalTab(): Kid[] {
    const s = this.host.step;
    const goal = s.goal;
    const assisted = !!(
      s.stage?.assist?.holdAlt ||
      s.stage?.assist?.holdIas ||
      (s.stage?.assist?.timeScale ?? 1) > 1
    );
    if (!goal)
      return [
        note(
          this.t(
            "No goal: this step only presents. A goal lets the sim tick “Do this” rows live.",
            "Pas d’objectif : cette étape présente seulement. Un objectif permet au simulateur de cocher les lignes « À faire ».",
          ),
          "",
        ),
        btn(
          this.t("Add a goal", "Ajouter un objectif"),
          () =>
            this.edit(
              undefined,
              (x) =>
                (x.goal = newGoal(
                  this.host.course.cockpit,
                  this.suggested(x)
                    .map((g) => g.check)
                    .slice(0, 2),
                )),
              true,
            ),
          { icon: "plus" },
        ),
        this.suggestGroup((c) =>
          this.edit(
            undefined,
            (x) =>
              (x.goal = { ...newGoal(this.host.course.cockpit), all: [c] }),
            true,
          ),
        ),
      ];
    const setGoal = (f: (g: StepGoal) => void, key?: string, render = true) =>
      this.edit(key, (x) => f(x.goal!), render);
    return [
      group(this.t("Checks", "Vérifications"), [
        this.checksEditor(goal.all, (all, render = true, key) =>
          setGoal((g) => (g.all = all), key, render),
        ),
      ]),
      this.suggestGroup((c) => setGoal((g) => g.all.push(c))),
      group(this.t("When is it met", "Quand est-il atteint"), [
        field(
          this.t(
            "Hold all checks for",
            "Tenir toutes les vérifications pendant",
          ),
          numIn(
            goal.holdS,
            (v) =>
              setGoal(
                (g) => (v ? (g.holdS = v) : delete g.holdS),
                "holdS",
                false,
              ),
            { min: 0, max: 120, unit: "s", w: 90 },
          ),
        ),
        field(
          this.t("Then", "Ensuite"),
          seg(
            [
              { value: "stay" as const, label: this.t("Stay", "Rester") },
              {
                value: "autoNext" as const,
                label: this.t("Next step", "Étape suivante"),
              },
            ],
            goal.onMet ?? "stay",
            (v) => setGoal((g) => (g.onMet = v)),
          ),
        ),
        this.l10n(
          this.t("Success message", "Message de réussite"),
          goal.success,
          (v) => setGoal((g) => (g.success = v), "success", false),
          { ph: this.t("Nicely centred.", "Bien centré.") },
        ),
        sw(
          goal.graded && !assisted,
          (on) => setGoal((g) => (g.graded = on)),
          this.t("Checked practice", "Entraînement vérifié"),
          {
            disabled: assisted,
            sub: assisted
              ? this.t(
                  "An assist is on: never graded",
                  "Une aide est active : jamais noté",
                )
              : this.t(
                  "Shown as practice, never ACS",
                  "Affiché comme entraînement, jamais ACS",
                ),
          },
        ),
      ]),
      group(this.t("“Do this” rows", "Lignes « À faire »"), [
        h(
          "ol",
          { class: "ce-rows" },
          ...goal.all.map((c) => h("li", {}, goalRow(c, this.lang))),
        ),
        h(
          "div",
          { class: "ce-row" },
          btn(
            s.reader.some((b) => b.t === "doThis")
              ? this.t(
                  "Update the rows in the reader",
                  "Mettre à jour les lignes du texte",
                )
              : this.t(
                  "Add the rows to the reader",
                  "Ajouter les lignes au texte",
                ),
            () =>
              this.edit(
                undefined,
                (x) => {
                  const i = x.reader.findIndex((b) => b.t === "doThis");
                  const rows = doThisFor(x.goal!.all);
                  if (i >= 0) x.reader[i] = rows;
                  else x.reader.push(rows);
                },
                true,
              ),
            { cls: "sm", icon: "checks", disabled: !!s.slide },
          ),
          btn("", () => this.edit(undefined, (st) => delete st.goal, true), {
            cls: "ic ghost",
            icon: "trash",
            title: this.t("Remove the goal", "Retirer l’objectif"),
          }),
        ),
      ]),
    ];
  }
  private suggested(s: Step): { check: GoalCheck; why: L10n }[] {
    const sceneId = s.stage?.scene ?? s.slide?.scene;
    const info = sceneId ? this.host.stageInfo(sceneId) : null;
    if (!info) return [];
    try {
      return suggestGoals(
        stageView(info.sim, { cockpit: this.host.course.cockpit }),
        info.scene,
      );
    } catch {
      return [];
    }
  }
  private suggestGroup(add: (c: GoalCheck) => void): HTMLElement | null {
    const s = this.host.step;
    const have = new Set((s.goal?.all ?? []).map((c) => JSON.stringify(c)));
    const list = this.suggested(s).filter(
      (g) => !have.has(JSON.stringify(g.check)),
    );
    if (!list.length) return null;
    return group(
      this.t("Suggested for this scene", "Suggéré pour cette scène"),
      [
        h(
          "div",
          { class: "ce-sugg" },
          ...list.slice(0, 5).map((g) => {
            const b = h(
              "button",
              { type: "button", class: "ce-sugg-it" },
              ico("plus"),
              h(
                "span",
                {},
                h("b", {}, goalLabel(g.check, this.lang)),
                h("small", {}, tr(g.why, this.lang)),
              ),
            );
            b.addEventListener("click", () => add(clone(g.check)));
            return b;
          }),
        ),
      ],
    );
  }
  /** A list of goal checks with their parameter fields, and the catalogue to add from. */
  private checksEditor(
    list: GoalCheck[],
    set: (l: GoalCheck[], render?: boolean, key?: string) => void,
    o: { acs?: Criterion[]; setAcs?: (c: Criterion[]) => void } = {},
  ): HTMLElement {
    const el = h("div", { class: "ce-checks-ed" });
    list.forEach((c, i) => {
      const def = goalDef(c);
      const p = ((c as { p?: Record<string, unknown> }).p ?? {}) as Record<
        string,
        unknown
      >;
      const fields = (def?.params ?? [])
        .filter((pd) => !pd.showIf || pd.showIf(p as never))
        .map((pd) => {
          const upd = (v: unknown) => {
            const next = clone(list);
            const np = ((next[i] as { p?: Record<string, unknown> }).p ??= {});
            if (v === undefined || v === "") delete np[pd.name];
            else np[pd.name] = v;
            set(next, false, `chk.${i}.${pd.name}`);
            lab.textContent = goalLabel(next[i], this.lang);
          };
          const v = p[pd.name] ?? pd.default;
          const opts = pd.optionsFor?.(p as never) ?? pd.options;
          const ctl =
            pd.type === "enum" && opts
              ? selectIn(
                  opts.map((o) => ({
                    value: o.value as string | number,
                    label: tr(o.label as L10n, this.lang),
                  })),
                  v as string | number,
                  (x) => upd(x),
                )
              : pd.type === "boolean"
                ? seg(
                    [
                      { value: true, label: this.t("Yes", "Oui") },
                      { value: false, label: this.t("No", "Non") },
                    ],
                    !!v,
                    (x) => {
                      upd(x);
                      this.render();
                    },
                  )
                : pd.type === "number"
                  ? numIn(
                      typeof v === "number" ? v : Number(v),
                      (x) => upd(x),
                      {
                        min: pd.min,
                        max: pd.max,
                        step: pd.step,
                        unit: paramUnit(pd.unit, this.lang),
                      },
                    )
                  : textIn(String(v ?? ""), (x) => upd(x), { mono: true });
          return field(tr(pd.label as L10n, this.lang), ctl);
        });
      const lab = h("b", {}, goalLabel(c, this.lang));
      const card = h(
        "div",
        { class: "ce-chk" },
        h(
          "div",
          { class: "ce-chk-hd" },
          h("i", { class: "ce-co-n" }, String(i + 1)),
          lab,
          h("span", { class: "ce-sp" }),
          btn("", () => set(list.filter((_, j) => j !== i)), {
            icon: "x",
            cls: "ic",
            title: this.t("Remove", "Retirer"),
          }),
        ),
        fields.length ? h("div", { class: "ce-grid2" }, ...fields) : null,
        o.acs && o.setAcs
          ? field(
              this.t("ACS task", "Tâche ACS"),
              textIn(
                o.acs[i]?.acs ?? "",
                (v) => {
                  const next = clone(o.acs!);
                  if (next[i]) next[i].acs = v || undefined;
                  o.setAcs!(next);
                },
                { mono: true, ph: "IR.VI.B" },
              ),
            )
          : null,
      );
      el.append(card);
    });
    const add = btn(
      this.t("Add a check", "Ajouter une vérification"),
      () => {
        const items: MenuItem[] = COURSE_GOAL_ORDER.filter((id) => GOALS[id])
          .slice(0, 24)
          .map((id) => ({
            label: tr(GOALS[id].name, this.lang),
            onClick: () => set([...list, defaultCheck(id)]),
          }));
        popover(add, items, {
          title: this.t("Checked by the sim", "Vérifié par le simulateur"),
          width: 300,
          cls: "scroll",
        });
      },
      { icon: "plus", cls: "sm" },
    );
    el.append(h("div", { class: "ce-row" }, add));
    return el;
  }

  // ================================================================ Notes
  private notesTab(): Kid[] {
    const s = this.host.step;
    return [
      this.l10n(
        this.t("Presenter notes", "Notes du présentateur"),
        s.notes,
        (v) => this.edit("notes", (x) => (x.notes = v)),
        {
          multi: true,
          rows: 6,
          ph: this.t(
            "What you say while this step is on screen",
            "Ce que vous dites pendant cette étape",
          ),
        },
      ),
      note(
        this.t(
          "Only on the presenter console and here: never on the projector or for the student.",
          "Seulement sur la console du présentateur et ici : jamais au projecteur ni pour l’élève.",
        ),
        "muted",
      ),
      field(
        this.t("Minutes", "Minutes"),
        numIn(
          s.minutes,
          (v) =>
            this.edit("minutes", (x) =>
              v ? (x.minutes = v) : delete x.minutes,
            ),
          { min: 0.5, max: 60, step: 0.5, w: 90, unit: "min" },
        ),
      ),
      this.l10n(
        this.t("Hint", "Indice"),
        s.hint,
        (v) => this.edit("hint", (x) => (x.hint = v)),
        {
          multi: true,
          rows: 2,
          ph: this.t(
            "Shown when the student asks",
            "Affiché quand l’élève le demande",
          ),
        },
      ),
      sw(
        s.audience === "intro",
        (on) =>
          this.edit(
            undefined,
            (x) => (on ? (x.audience = "intro") : delete x.audience),
            true,
          ),
        this.t("Introduction only", "Introduction seulement"),
        {
          sub: this.t("Skipped in refresher runs", "Sauté lors des révisions"),
        },
      ),
      group(
        this.t("Shown at guidance levels", "Affiché aux niveaux de guidage"),
        [
          chips(
            LEVELS.map((l) => ({
              value: l.v,
              label: tr(l.l, this.lang),
              on: !s.levels?.length || s.levels.includes(l.v),
            })),
            (v, on) =>
              this.edit(
                undefined,
                (x) => {
                  const cur = new Set(
                    x.levels?.length ? x.levels : LEVELS.map((l) => l.v),
                  );
                  if (on) cur.add(v);
                  else cur.delete(v);
                  x.levels = LEVELS.map((l) => l.v).filter((k) => cur.has(k));
                  if (x.levels.length === LEVELS.length || !x.levels.length)
                    delete x.levels;
                },
                true,
              ),
          ),
        ],
      ),
    ];
  }

  // ================================================================ Calc
  private calcEditor(
    spec: CalcSpec,
    set: (c: CalcSpec, render?: boolean, key?: string) => void,
  ): Kid[] {
    const def = getGenerator(spec.generatorId);
    const lang = this.lang;
    const groups = (["ifr", "vfr"] as const).map((cat) => ({
      group:
        cat === "ifr"
          ? this.t("Maths for IFR", "Maths IFR")
          : this.t("Maths for VFR", "Maths VFR"),
      opts: GENERATORS_BY_CATEGORY[cat]
        .filter((g) => cat === g.category)
        .map((g) => ({ value: g.id, label: tr(g.title, lang) })),
    }));
    const out: Kid[] = [
      group(this.t("Generator", "Générateur"), [
        selectIn<CalcGeneratorId>(groups, spec.generatorId, (id) =>
          set({
            ...defaultCalc(id),
            showSolution: spec.showSolution,
            showRuleOfThumb: spec.showRuleOfThumb,
            showFormula: spec.showFormula,
          }),
        ),
        def
          ? note(tr(def.summary, lang), "muted")
          : note(this.t("Unknown generator", "Générateur inconnu"), "warn"),
      ]),
    ];
    if (!def) return out;
    const params = def.params ?? [];
    if (params.length)
      out.push(
        group(this.t("Ranges", "Plages"), [
          h(
            "div",
            { class: "ce-grid2" },
            ...params.map((p) =>
              this.paramField(p, spec.params?.[p.key], (v) => {
                const next = { ...(spec.params ?? {}) };
                if (v === undefined) delete next[p.key];
                else next[p.key] = v;
                set(
                  {
                    ...spec,
                    params: Object.keys(next).length ? next : undefined,
                  },
                  false,
                  `param.${p.key}`,
                );
              }),
            ),
          ),
          linkBtn(
            this.t("Back to the defaults", "Revenir aux valeurs par défaut"),
            () => set({ ...spec, params: undefined }),
            { disabled: !spec.params },
          ),
        ]),
      );
    const fixed = spec.seed !== undefined;
    out.push(
      group(this.t("Numbers", "Chiffres"), [
        seg(
          [
            {
              value: false,
              label: this.t("New each try", "Nouveaux à chaque essai"),
            },
            {
              value: true,
              label: this.t("Fixed for everyone", "Les mêmes pour tous"),
            },
          ],
          fixed,
          (f) =>
            set({
              ...spec,
              seed: f ? newSeed() : undefined,
              ...(f ? { retry: false } : {}),
            }),
          { full: true },
        ),
        fixed
          ? h(
              "div",
              { class: "ce-row" },
              field(
                this.t("Seed", "Graine"),
                numIn(
                  spec.seed,
                  (v) =>
                    v !== undefined &&
                    set(
                      { ...spec, seed: Math.max(0, Math.round(v)) },
                      false,
                      "seed",
                    ),
                  { w: 120, step: 1 },
                ),
              ),
              btn(
                this.t("Draw new numbers", "Tirer d’autres chiffres"),
                () => set({ ...spec, seed: newSeed() }),
                { cls: "sm" },
              ),
            )
          : sw(
              spec.retry !== false,
              (on) => set({ ...spec, retry: on ? undefined : false }),
              this.t(
                "Offer “New numbers” after an attempt",
                "Proposer « Nouveaux chiffres » après un essai",
              ),
            ),
      ]),
    );
    // preview problem
    let problem = null as ReturnType<typeof generate> | null;
    try {
      problem = generate(
        spec.generatorId,
        spec.seed ?? this.previewSeed,
        spec.params,
      );
    } catch (e) {
      out.push(note(String((e as Error).message), "warn"));
    }
    if (problem) {
      const asked = answerIn(problem, spec.unit);
      const units = unitsLike(problem.unit);
      out.push(
        group(this.t("Answer", "Réponse"), [
          h(
            "div",
            { class: "ce-grid2" },
            field(
              this.t("Tolerance ±", "Tolérance ±"),
              numIn(
                spec.tolerance,
                (v) => set({ ...spec, tolerance: v }, false, "tol"),
                {
                  ph: fmtNum(Number(asked.tolerance.toPrecision(3)), this.lang),
                  unit: tr(UNIT_LABEL[asked.unit], lang),
                },
              ),
            ),
            units.length > 1
              ? field(
                  this.t("Asked in", "Demandée en"),
                  selectIn<CalcUnit>(
                    units.map((u) => ({
                      value: u,
                      label: tr(UNIT_LABEL[u], lang),
                    })),
                    spec.unit ?? problem.unit,
                    (u) =>
                      set({
                        ...spec,
                        unit: u === problem!.unit ? undefined : u,
                      }),
                  ),
                )
              : null,
          ),
          field(
            this.t("Worked solution", "Solution détaillée"),
            seg(
              [
                {
                  value: "onCheck" as const,
                  label: this.t("After Check", "Après vérification"),
                },
                {
                  value: "onRequest" as const,
                  label: this.t("On request", "Sur demande"),
                },
                { value: "never" as const, label: this.t("Never", "Jamais") },
              ],
              spec.showSolution ?? "onCheck",
              (v) => set({ ...spec, showSolution: v }),
              { full: true },
            ),
          ),
          sw(
            spec.showRuleOfThumb !== false,
            (on) => set({ ...spec, showRuleOfThumb: on ? undefined : false }),
            this.t("Show the rule of thumb", "Montrer la règle pratique"),
          ),
          sw(
            spec.showFormula !== false,
            (on) => set({ ...spec, showFormula: on ? undefined : false }),
            this.t("Show the exact formula", "Montrer la formule exacte"),
          ),
          sw(
            (spec.stage ?? "generator") === "generator",
            (on) => set({ ...spec, stage: on ? undefined : "none" }),
            this.t(
              "Diagram or live instrument on the stage",
              "Schéma ou instrument en direct sur la scène",
            ),
          ),
        ]),
      );
      const g = problem;
      out.push(
        group(this.t("Example", "Exemple"), [
          h(
            "div",
            { class: "ce-calcprev" },
            h("p", { class: "ce-calc-q" }, tr(g.prompt, lang)),
            g.givens.length
              ? h(
                  "ul",
                  { class: "ce-givens" },
                  ...g.givens.map((x) =>
                    h(
                      "li",
                      {},
                      h("span", {}, tr(x.label, lang)),
                      h(
                        "b",
                        {},
                        x.display
                          ? tr(x.display, lang)
                          : `${x.value}${x.unit && x.unit !== "none" ? ` ${tr(UNIT_LABEL[x.unit], lang)}` : ""}`,
                      ),
                    ),
                  ),
                )
              : null,
            h(
              "div",
              { class: "ce-calc-a" },
              h("span", { class: "ce-label" }, this.t("Answer", "Réponse")),
              h(
                "b",
                {},
                g.answerText
                  ? tr(g.answerText, lang)
                  : `${fmtNum(asked.answer, lang)} ${tr(UNIT_LABEL[asked.unit], lang)}`,
              ),
              h(
                "span",
                { class: "ce-muted sm" },
                `± ${fmtNum(spec.tolerance ?? asked.tolerance, lang)}`,
              ),
            ),
            h(
              "div",
              { class: "ce-calc-rule" },
              h(
                "span",
                { class: "ce-label" },
                this.t("Rule of thumb", "Règle pratique"),
              ),
              h("span", {}, tr(g.ruleOfThumb, lang)),
            ),
            h(
              "div",
              { class: "ce-calc-rule" },
              h("span", { class: "ce-label" }, this.t("Exact", "Exacte")),
              h("code", {}, tr(g.formula, lang)),
            ),
            g.refs.length
              ? h(
                  "div",
                  { class: "ce-muted sm" },
                  g.refs
                    .map((r) => `${r.src}${r.ref ? ` ${r.ref}` : ""}`)
                    .join(" · "),
                )
              : null,
          ),
          !fixed
            ? linkBtn(this.t("Another example", "Un autre exemple"), () => {
                this.previewSeed = (this.previewSeed * 7919 + 17) % 100000;
                this.render();
              })
            : null,
        ]),
      );
    }
    return out;
  }
  private paramField(
    p: CalcParamDef,
    v: unknown,
    set: (v: CalcParamDef["default"] | undefined) => void,
  ): HTMLElement {
    const lang = this.lang;
    const unit = p.unit ? tr(UNIT_LABEL[p.unit], lang) : undefined;
    const cur = v ?? p.default;
    if (p.kind === "range") {
      const r = (Array.isArray(cur) ? cur : [p.min ?? 0, p.max ?? 0]) as [
        number,
        number,
      ];
      const a = [...r] as [number, number];
      return field(
        tr(p.label, lang),
        h(
          "div",
          { class: "ce-range" },
          numIn(
            a[0],
            (x) => x !== undefined && ((a[0] = x), set([a[0], a[1]])),
            { min: p.min, max: p.max, step: p.step, w: 74 },
          ),
          h("span", { class: "ce-muted" }, "–"),
          numIn(
            a[1],
            (x) => x !== undefined && ((a[1] = x), set([a[0], a[1]])),
            { min: p.min, max: p.max, step: p.step, w: 74, unit },
          ),
        ),
        { wide: true },
      );
    }
    if (p.kind === "choice" && p.choices)
      return field(
        tr(p.label, lang),
        selectIn(
          p.choices.map((c) => ({ value: c.value, label: tr(c.label, lang) })),
          String(cur),
          (x) => set(x),
        ),
      );
    if (p.kind === "boolean")
      return field(
        tr(p.label, lang),
        seg(
          [
            { value: true, label: this.t("Yes", "Oui") },
            { value: false, label: this.t("No", "Non") },
          ],
          !!cur,
          (x) => {
            set(x);
            this.render();
          },
        ),
      );
    return field(
      tr(p.label, lang),
      numIn(typeof cur === "number" ? cur : undefined, (x) => set(x), {
        min: p.min,
        max: p.max,
        step: p.step,
        unit,
      }),
    );
  }
  private calcTab(): Kid[] {
    const s = this.host.step;
    const spec = s.calc ?? defaultCalc();
    return [
      this.l10n(this.t("Step title", "Titre de l’étape"), s.title, (v) =>
        this.edit("title", (x) => (x.title = v)),
      ),
      ...this.calcEditor(spec, (c, render = true, key) =>
        this.edit(key, (x) => (x.calc = c), render),
      ),
      note(
        this.t(
          "Calculations are practice: never ACS-graded, never logged as flights.",
          "Les calculs sont un entraînement : jamais notés ACS, jamais enregistrés comme vols.",
        ),
        "muted",
      ),
    ];
  }

  // ================================================================ Drill
  private drillTab(): Kid[] {
    const s = this.host.step;
    const d: DrillSpec = s.drill ?? {
      generatorIds: [],
      count: 10,
      practiceOnly: true,
    };
    const set = (f: (d: DrillSpec) => void, render = true, key?: string) =>
      this.edit(
        key,
        (x) => {
          x.drill = clone(d);
          f(x.drill);
        },
        render,
      );
    const lang = this.lang;
    const timer = d.timer?.mode ?? "none";
    return [
      this.l10n(this.t("Step title", "Titre de l’étape"), s.title, (v) =>
        this.edit("title", (x) => (x.title = v)),
      ),
      ...(["ifr", "vfr"] as const).map((cat) =>
        group(
          cat === "ifr"
            ? this.t("Maths for IFR", "Maths IFR")
            : this.t("Maths for VFR", "Maths VFR"),
          [
            chips(
              GENERATORS_BY_CATEGORY[cat]
                .filter((g) => g.category === cat)
                .map((g) => ({
                  value: g.id,
                  label: tr(g.title, lang),
                  on: d.generatorIds.includes(g.id),
                  title: tr(g.summary, lang),
                })),
              (id, on) =>
                set((x) => {
                  x.generatorIds = on
                    ? [...x.generatorIds, id]
                    : x.generatorIds.filter((k) => k !== id);
                }),
            ),
          ],
        ),
      ),
      d.generatorIds.length
        ? null
        : note(
            this.t(
              "Pick at least one kind of problem.",
              "Choisissez au moins un type de problème.",
            ),
            "warn",
          ),
      group(this.t("Run", "Déroulé"), [
        field(
          this.t("Problems", "Problèmes"),
          seg(
            [5, 10, 15, 20].map((n) => ({ value: n, label: String(n) })),
            d.count,
            (n) => set((x) => (x.count = n)),
            { full: true },
          ),
        ),
        field(
          this.t("Timer", "Chrono"),
          seg(
            [
              { value: "none", label: this.t("None", "Aucun") },
              { value: "stopwatch", label: this.t("Stopwatch", "Chronomètre") },
              {
                value: "perProblem",
                label: this.t("Per problem", "Par problème"),
              },
              { value: "total", label: this.t("Total", "Total") },
            ],
            timer,
            (m) =>
              set((x) => {
                if (m === "none") delete x.timer;
                else if (m === "stopwatch") x.timer = { mode: "stopwatch" };
                else
                  x.timer = {
                    mode: m as "perProblem" | "total",
                    seconds: m === "total" ? 300 : 45,
                  };
              }),
            { full: true },
          ),
        ),
        d.timer && d.timer.mode !== "stopwatch"
          ? field(
              this.t("Seconds", "Secondes"),
              numIn(
                d.timer.seconds,
                (v) =>
                  v &&
                  set(
                    (x) => ((x.timer as { seconds: number }).seconds = v),
                    false,
                    "secs",
                  ),
                { min: 5, max: 3600, unit: "s", w: 100 },
              ),
            )
          : null,
        field(
          this.t("Feedback", "Correction"),
          seg(
            [
              {
                value: "each" as const,
                label: this.t("After each", "Après chaque"),
              },
              {
                value: "end" as const,
                label: this.t("At the end", "À la fin"),
              },
            ],
            d.feedback ?? "each",
            (v) => set((x) => (x.feedback = v)),
            { full: true },
          ),
        ),
        sw(
          d.seed !== undefined,
          (on) => set((x) => (on ? (x.seed = newSeed()) : delete x.seed)),
          this.t(
            "Same problems for the whole class",
            "Mêmes problèmes pour toute la classe",
          ),
        ),
      ]),
      note(
        this.t(
          "A drill is practice only: scored for the student, never ACS-graded.",
          "Une série est un entraînement : notée pour l’élève, jamais ACS.",
        ),
        "muted",
      ),
    ];
  }

  // ================================================================ Fly it
  private flyTab(): Kid[] {
    const s = this.host.step;
    const c = this.host.course;
    const fly: FlyIt = s.flyIt ?? {
      target: { kind: "scene", scene: Object.keys(c.scenes)[0] ?? "" },
      options: [],
      criteria: [],
      returnTo: "thisStep",
    };
    const set = (f: (x: FlyIt) => void, render = true, key?: string) =>
      this.edit(
        key,
        (st) => {
          st.flyIt = clone(fly);
          f(st.flyIt);
        },
        render,
      );
    const tg = fly.target;
    const calcSteps = c.steps.filter((x) => x.kind === "calc" && x.id !== s.id);
    const targetFields: Kid[] = [];
    if (tg.kind === "scene") {
      targetFields.push(
        this.sceneGroup(tg.scene, (id) =>
          set((x) => {
            (x.target as { scene: string }).scene = id;
          }),
        ),
      );
      targetFields.push(
        field(
          this.t("Ends after", "Se termine après"),
          numIn(
            tg.durationS,
            (v) =>
              set(
                (x) => ((x.target as { durationS?: number }).durationS = v),
                false,
                "dur",
              ),
            { min: 30, max: 3600, unit: "s", w: 100 },
          ),
        ),
      );
    } else if (tg.kind === "lesson")
      targetFields.push(
        field(
          this.t("Lesson", "Leçon"),
          textIn(
            tg.exerciseId,
            (v) =>
              set(
                (x) => ((x.target as { exerciseId: string }).exerciseId = v),
                false,
                "lesson",
              ),
            { mono: true, ph: "hold-ndb" },
          ),
        ),
      );
    else if (tg.kind === "scenario")
      targetFields.push(
        field(
          this.t("Scenario", "Scénario"),
          textIn(
            tg.scenarioId,
            (v) =>
              set(
                (x) => ((x.target as { scenarioId: string }).scenarioId = v),
                false,
                "scen",
              ),
            { mono: true },
          ),
        ),
      );
    else if (tg.kind === "procedure")
      targetFields.push(
        field(
          this.t("Procedure", "Procédure"),
          textIn(
            tg.procId,
            (v) =>
              set(
                (x) => ((x.target as { procId: string }).procId = v),
                false,
                "proc",
              ),
            { mono: true },
          ),
        ),
      );
    else if (tg.kind === "calc")
      targetFields.push(
        field(
          this.t("Calc step", "Étape de calcul"),
          selectIn(
            calcSteps.map((x) => ({
              value: x.id,
              label: tr(x.title, this.lang),
            })),
            tg.step,
            (v) => set((x) => ((x.target as { step: string }).step = v)),
          ),
        ),
      );
    const offered = new Set(fly.options);
    const on = new Set(fly.defaultsOn ?? []);
    return [
      this.l10n(this.t("Step title", "Titre de l’étape"), s.title, (v) =>
        this.edit("title", (x) => (x.title = v)),
      ),
      group(this.t("What they fly", "Ce qui est volé"), [
        seg(
          [
            { value: "scene", label: this.t("This scene", "Cette scène") },
            { value: "lesson", label: this.t("Lesson", "Leçon") },
            {
              value: "calc",
              label: this.t("A calc", "Un calcul"),
              disabled: !calcSteps.length,
            },
            { value: "scenario", label: this.t("Scenario", "Scénario") },
          ],
          tg.kind,
          (k) =>
            set((x) => {
              x.target =
                k === "scene"
                  ? {
                      kind: "scene",
                      scene: s.stage?.scene ?? Object.keys(c.scenes)[0] ?? "",
                      durationS: 180,
                    }
                  : k === "lesson"
                    ? { kind: "lesson", exerciseId: "" }
                    : k === "calc"
                      ? { kind: "calc", step: calcSteps[0]?.id ?? "" }
                      : { kind: "scenario", scenarioId: "" };
            }),
          { full: true },
        ),
        tg.kind === "calc"
          ? note(
              this.t(
                "The student flies the numbers they just solved (same seed).",
                "L’élève vole les chiffres qu’il vient de calculer (même graine).",
              ),
              "muted",
            )
          : null,
        ...targetFields,
      ]),
      group(this.t("Brief", "Briefing"), [
        this.l10n(
          this.t("Brief", "Briefing"),
          fly.brief,
          (v) => set((x) => (x.brief = v), false, "brief"),
          { multi: true, rows: 3 },
        ),
        ...(fly.keys ?? []).map((k, i) =>
          this.l10n(`${this.t("Key", "Clé")} ${i + 1}`, k, (v) =>
            set((x) => (x.keys![i] = v), false, `key.${i}`),
          ),
        ),
        linkBtn(
          this.t("+ Add a key to success", "+ Ajouter une clé de réussite"),
          () => set((x) => (x.keys = [...(x.keys ?? []), { en: "" }])),
        ),
      ]),
      group(this.t("Instructor options", "Options de l’instructeur"), [
        chips(
          FLY_OPTIONS.map((o) => ({
            value: o,
            label: tr(FLY_OPTION_LABEL[o], this.lang),
            on: offered.has(o),
          })),
          (o, v) =>
            set((x) => {
              x.options = v
                ? FLY_OPTIONS.filter((k) => k === o || x.options.includes(k))
                : x.options.filter((k) => k !== o);
              if (x.defaultsOn)
                x.defaultsOn = x.defaultsOn.filter((k) =>
                  x.options.includes(k),
                );
            }),
          { label: this.t("Offered", "Proposées") },
        ),
        fly.options.length
          ? field(
              this.t("On at start", "Actives au départ"),
              chips(
                fly.options.map((o) => ({
                  value: o,
                  label: tr(FLY_OPTION_LABEL[o], this.lang),
                  on: on.has(o),
                })),
                (o, v) =>
                  set((x) => {
                    const d = new Set(x.defaultsOn ?? []);
                    if (v) d.add(o);
                    else d.delete(o);
                    x.defaultsOn = [...d];
                  }),
              ),
            )
          : null,
      ]),
      group(this.t("Criteria (ACS words)", "Critères (termes ACS)"), [
        tg.kind === "lesson"
          ? note(
              this.t(
                "A lesson is graded by its own engine.",
                "Une leçon est notée par son propre moteur.",
              ),
              "muted",
            )
          : null,
        this.checksEditor(
          fly.criteria.map((x) => x.check),
          (list, render = true, key) =>
            set(
              (x) => {
                x.criteria = list.map((check, i) => ({
                  ...(fly.criteria[i] ?? criteriaOf([check])[0]),
                  id: fly.criteria[i]?.id ?? `c${i + 1}`,
                  check,
                  label: {
                    en: goalLabel(check, "en"),
                    fr: goalLabel(check, "fr"),
                  },
                }));
              },
              render,
              key,
            ),
          {
            acs: fly.criteria,
            setAcs: (cr) => set((x) => (x.criteria = cr), false, "acs"),
          },
        ),
        s.goal?.all.length
          ? linkBtn(
              this.t("Use the step’s goal", "Reprendre l’objectif de l’étape"),
              () => set((x) => (x.criteria = criteriaOf(s.goal!.all))),
            )
          : null,
      ]),
      group(this.t("After the flight", "Après le vol"), [
        this.l10n(
          this.t(
            "CFI note in the debrief",
            "Note de l’instructeur au débriefing",
          ),
          fly.debrief,
          (v) => set((x) => (x.debrief = v), false, "debrief"),
          { multi: true, rows: 2 },
        ),
        field(
          this.t("Return to", "Retour"),
          seg(
            [
              {
                value: "thisStep" as const,
                label: this.t(
                  "This step (debrief)",
                  "Cette étape (débriefing)",
                ),
              },
              {
                value: "nextStep" as const,
                label: this.t("Next step", "Étape suivante"),
              },
            ],
            fly.returnTo,
            (v) => set((x) => (x.returnTo = v)),
            { full: true },
          ),
        ),
        fly.briefing?.length
          ? note(
              this.t(
                `An interactive briefing of ${fly.briefing.length} pages plays before the flight.`,
                `Un briefing interactif de ${fly.briefing.length} pages précède le vol.`,
              ),
              "muted",
            )
          : null,
      ]),
    ];
  }

  // ================================================================ Quiz
  private quizEditor(
    q: Quiz,
    set: (q: Quiz, render?: boolean, key?: string) => void,
  ): Kid[] {
    const kinds: Opt<Quiz["kind"]>[] = [
      { value: "mcq", label: this.t("Choice", "Choix") },
      { value: "numeric", label: this.t("Number", "Nombre") },
      { value: "order", label: this.t("Order", "Ordre") },
      { value: "tap", label: this.t("Tap", "Toucher") },
      { value: "fly", label: this.t("By flying", "En pilotant") },
      { value: "calc", label: this.t("Calc", "Calcul") },
    ];
    const out: Kid[] = [
      seg(kinds, q.kind, (k) => set(quizOfKind(k, q)), {
        full: true,
        label: this.t("Kind of question", "Type de question"),
      }),
    ];
    if (q.kind === "calc") {
      out.push(
        this.l10n(
          this.t("Question (optional)", "Question (facultative)"),
          q.prompt,
          (v) => set({ ...q, prompt: v }, false, "q.prompt"),
          {
            multi: true,
            rows: 2,
            ph: this.t("The generator writes it", "Le générateur l’écrit"),
          },
        ),
      );
      out.push(
        ...this.calcEditor(q.calc, (c, render = true, key) =>
          set({ ...q, calc: c }, render, key),
        ),
      );
      return out;
    }
    out.push(
      this.l10n(
        this.t("Question", "Question"),
        q.prompt,
        (v) => set({ ...q, prompt: v } as Quiz, false, "q.prompt"),
        { multi: true, rows: 2 },
      ),
    );
    if (q.kind === "mcq") {
      q.options.forEach((o, i) => {
        const radio = h("button", {
          type: "button",
          class: `ce-radio${q.answer === i ? " on" : ""}`,
          role: "radio",
          "aria-checked": q.answer === i ? "true" : "false",
          "aria-label": this.t("Correct answer", "Bonne réponse"),
        });
        radio.addEventListener("click", () => set({ ...q, answer: i }));
        out.push(
          h(
            "div",
            { class: `ce-opt${q.answer === i ? " right" : ""}` },
            radio,
            h(
              "div",
              { class: "ce-opt-body" },
              this.l10n(
                `${this.t("Option", "Option")} ${String.fromCharCode(65 + i)}`,
                o.text,
                (v) =>
                  set(
                    {
                      ...q,
                      options: q.options.map((x, j) =>
                        j === i ? { ...x, text: v } : x,
                      ),
                    },
                    false,
                    `q.o${i}`,
                  ),
              ),
              this.l10n(
                this.t("Why", "Pourquoi"),
                o.why,
                (v) =>
                  set(
                    {
                      ...q,
                      options: q.options.map((x, j) =>
                        j === i ? { ...x, why: v } : x,
                      ),
                    },
                    false,
                    `q.w${i}`,
                  ),
                {
                  ph: this.t(
                    "Shown after the answer",
                    "Affiché après la réponse",
                  ),
                },
              ),
            ),
            btn(
              "",
              () =>
                set({
                  ...q,
                  options: q.options.filter((_, j) => j !== i),
                  answer: Math.max(
                    0,
                    q.answer > i ? q.answer - 1 : q.answer === i ? 0 : q.answer,
                  ),
                }),
              {
                icon: "x",
                cls: "ic",
                title: this.t("Remove", "Retirer"),
                disabled: q.options.length <= 2,
              },
            ),
          ),
        );
      });
      out.push(
        linkBtn(
          this.t("+ Add an option", "+ Ajouter une option"),
          () => set({ ...q, options: [...q.options, { text: { en: "" } }] }),
          { disabled: q.options.length >= 6 },
        ),
      );
      out.push(
        sw(
          !!q.poll,
          (on) => set({ ...q, poll: on || undefined }),
          this.t("Class poll", "Sondage en classe"),
          {
            sub: this.t(
              "Anonymous bars on the projector",
              "Barres anonymes au projecteur",
            ),
          },
        ),
      );
    } else if (q.kind === "numeric") {
      out.push(
        h(
          "div",
          { class: "ce-grid3" },
          field(
            this.t("Answer", "Réponse"),
            numIn(
              q.answer,
              (v) => v !== undefined && set({ ...q, answer: v }, false, "q.a"),
            ),
          ),
          field(
            "±",
            numIn(
              q.tol,
              (v) => v !== undefined && set({ ...q, tol: v }, false, "q.t"),
            ),
          ),
          field(
            this.t("Unit", "Unité"),
            textIn(
              q.unit ?? "",
              (v) => set({ ...q, unit: v || undefined }, false, "q.u"),
              { ph: "ft/min" },
            ),
          ),
        ),
      );
    } else if (q.kind === "order") {
      q.items.forEach((it, i) =>
        out.push(
          h(
            "div",
            { class: "ce-row tight" },
            this.l10n(`${i + 1}`, it, (v) =>
              set(
                { ...q, items: q.items.map((x, j) => (j === i ? v : x)) },
                false,
                `q.i${i}`,
              ),
            ),
            btn(
              "",
              () => set({ ...q, items: q.items.filter((_, j) => j !== i) }),
              { icon: "x", cls: "ic", disabled: q.items.length <= 2 },
            ),
          ),
        ),
      );
      out.push(
        note(
          this.t(
            "Write the items in the right order: the student sees them shuffled.",
            "Écrivez les éléments dans le bon ordre : l’élève les voit mélangés.",
          ),
          "muted",
        ),
      );
      out.push(
        linkBtn(this.t("+ Add an item", "+ Ajouter un élément"), () =>
          set({ ...q, items: [...q.items, { en: "" }] }),
        ),
      );
    } else if (q.kind === "tap") {
      const anns = (this.host.step.stage?.annotations ?? []).filter(
        (a) => a.type === "callout" || a.type === "ring",
      );
      const byAnn = "annotation" in q.target;
      out.push(
        seg(
          [
            { value: false, label: this.t("A rectangle", "Un rectangle") },
            {
              value: true,
              label: this.t("A callout", "Une légende"),
              disabled: !anns.length,
            },
          ],
          byAnn,
          (v) =>
            set({
              ...q,
              target: v
                ? { annotation: anns[0].id }
                : { pane: 0, rect: [384, 288, 256, 192] },
            }),
          { full: true },
        ),
      );
      if ("annotation" in q.target)
        out.push(
          selectIn(
            anns.map((a) => ({
              value: a.id,
              label: `${a.type === "callout" ? a.n : "○"} ${tr((a as { text?: L10n }).text ?? { en: a.id }, this.lang)}`,
            })),
            q.target.annotation,
            (v) => set({ ...q, target: { annotation: v } }),
          ),
        );
      else {
        const r = q.target.rect;
        const upd = (k: number, v: number | undefined) => {
          if (v === undefined || !("rect" in q.target)) return;
          const nr = [...q.target.rect] as typeof r;
          nr[k] = v;
          set(
            { ...q, target: { pane: q.target.pane, rect: nr } },
            false,
            `q.r${k}`,
          );
        };
        out.push(
          h(
            "div",
            { class: "ce-grid4" },
            ...["X", "Y", "W", "H"].map((l, k) =>
              field(
                l,
                numIn(r[k], (v) => upd(k, v), { step: 8 }),
              ),
            ),
          ),
        );
        out.push(
          note(
            this.t(
              "In the instrument’s 1024 × 768 drawing.",
              "Dans le dessin 1024 × 768 de l’instrument.",
            ),
            "muted",
          ),
        );
      }
    } else if (q.kind === "fly") {
      out.push(
        this.checksEditor(q.answer, (l, render = true, key) =>
          set({ ...q, answer: l }, render, key),
        ),
      );
      out.push(
        note(
          this.t(
            "Check evaluates once, on demand, with no time hold.",
            "Vérifier évalue une fois, à la demande, sans durée.",
          ),
          "muted",
        ),
      );
    }
    out.push(
      this.l10n(
        this.t("Explanation", "Explication"),
        q.explain,
        (v) => set({ ...q, explain: v } as Quiz, false, "q.ex"),
        { multi: true, rows: 3 },
      ),
    );
    return out;
  }
  private quizTab(): Kid[] {
    const s = this.host.step;
    const q = s.quiz ?? quizOfKind("mcq");
    return [
      group(
        this.t("Question", "Question"),
        this.quizEditor(q, (nq, render = true, key) =>
          this.edit(key, (x) => (x.quiz = nq), render),
        ),
      ),
      note(
        this.t(
          "Quizzes never block Next.",
          "Les questions ne bloquent jamais Suivant.",
        ),
        "muted",
      ),
    ];
  }

  // ================================================================ designed slides: Block
  private blockTab(): Kid[] {
    const sel = this.host.selection;
    const c = this.host.step.slide!;
    if (!sel.length)
      return [
        note(
          this.t(
            "Select a block on the slide (Shift adds to it, right click or a long press opens its menu), or add one from the rail on the left: templates, text, instruments, diagrams.",
            "Sélectionnez un bloc sur la diapo (Maj l’ajoute à la sélection, clic droit ou appui long ouvre son menu), ou ajoutez-en un depuis le rail à gauche : modèles, texte, instruments, schémas.",
          ),
          "",
        ),
        this.layersGroup(c),
      ];
    // a group (an instrument with its markers): edit its main block, the group stays together
    const grp = sel[0].frame.group;
    const grouped =
      sel.length > 1 && !!grp && sel.every((x) => x.frame.group === grp);
    const main = grouped
      ? [...sel].sort(
          (a, b) =>
            rank(b) - rank(a) || b.frame.w * b.frame.h - a.frame.w * a.frame.h,
        )[0]
      : null;
    if (sel.length > 1 && !main)
      return [
        group(
          `${sel.length} ${this.t("blocks selected", "blocs sélectionnés")}`,
          [
            h(
              "div",
              { class: "ce-chips" },
              ...(
                [
                  ["left", this.t("Left", "Gauche")],
                  ["hcenter", this.t("Centre", "Centre")],
                  ["right", this.t("Right", "Droite")],
                  ["top", this.t("Top", "Haut")],
                  ["vcenter", this.t("Middle", "Milieu")],
                  ["bottom", this.t("Bottom", "Bas")],
                ] as const
              ).map(([how, l]) =>
                btn(l, () => this.host.runCanvas({ k: "align", how }), {
                  cls: "sm",
                }),
              ),
            ),
            h(
              "div",
              { class: "ce-chips" },
              btn(
                this.t("Distribute across", "Répartir en largeur"),
                () => this.host.runCanvas({ k: "distribute", axis: "h" }),
                { cls: "sm" },
              ),
              btn(
                this.t("Distribute down", "Répartir en hauteur"),
                () => this.host.runCanvas({ k: "distribute", axis: "v" }),
                { cls: "sm" },
              ),
            ),
            h(
              "div",
              { class: "ce-chips" },
              btn(
                this.t("Group", "Grouper"),
                () => this.host.runCanvas({ k: "group" }),
                { cls: "sm" },
              ),
              btn(
                this.t("Ungroup", "Dissocier"),
                () => this.host.runCanvas({ k: "ungroup" }),
                { cls: "sm" },
              ),
              btn(
                this.t("Duplicate", "Dupliquer"),
                () => this.host.runCanvas({ k: "duplicate" }),
                { cls: "sm" },
              ),
              btn(
                this.t("Delete", "Supprimer"),
                () => this.host.runCanvas({ k: "delete" }),
                { cls: "sm danger" },
              ),
            ),
          ],
        ),
        this.layersGroup(c),
      ];
    const b = main ?? sel[0];
    const setB = (f: (x: SlideBlock) => void, key?: string, render = true) => {
      const next = clone(c);
      const i = next.blocks.findIndex((x) => x.id === b.id);
      if (i < 0) return;
      f(next.blocks[i]);
      this.host.setSlide(next, key ? `${b.id}.${key}` : undefined);
      if (render) this.render();
    };
    const out: Kid[] = [
      h(
        "div",
        { class: "ce-blockhd" },
        h("b", {}, blockLabel(b, this.lang)),
        h(
          "span",
          { class: "ce-tag" },
          main
            ? `${blockKindLabel(b.kind, this.lang)} + ${sel.length - 1}`
            : blockKindLabel(b.kind, this.lang),
        ),
      ),
      main
        ? h(
            "div",
            { class: "ce-row" },
            note(
              this.t(
                `Grouped with ${sel.length - 1} block${sel.length > 2 ? "s" : ""}: they move together.`,
                `Groupé avec ${sel.length - 1} bloc${sel.length > 2 ? "s" : ""} : ils bougent ensemble.`,
              ),
              "muted",
            ),
            btn(
              this.t("Ungroup", "Dissocier"),
              () => this.host.runCanvas({ k: "ungroup" }),
              { cls: "sm" },
            ),
          )
        : null,
    ];
    out.push(...this.blockFields(b, setB));
    // reveal
    const orders =
      Math.max(3, ...c.blocks.map((x) => x.reveal?.order ?? 0)) + 1;
    const rv = b.reveal;
    out.push(
      group(this.t("Appears", "Apparition"), [
        seg(
          [
            { value: 0, label: this.t("With slide", "Avec la diapo") },
            ...Array.from({ length: Math.min(6, orders) }, (_, i) => ({
              value: i + 1,
              label: String(i + 1),
            })),
          ],
          rv?.order ?? 0,
          (n) =>
            setB((x) =>
              n
                ? (x.reveal = { ...(x.reveal ?? {}), order: n } as BlockReveal)
                : delete x.reveal,
            ),
          { full: true },
        ),
        rv
          ? field(
              this.t("On", "Sur"),
              selectIn<string>(
                [
                  {
                    value: "click",
                    label: this.t("Next / click", "Suivant / clic"),
                  },
                  {
                    value: "answered",
                    label: this.t(
                      "The question answered",
                      "La question répondue",
                    ),
                  },
                  {
                    value: "goalMet",
                    label: this.t("The goal met", "L’objectif atteint"),
                  },
                  {
                    value: "yourTurnDone",
                    label: this.t(
                      "The student’s turn done",
                      "Le tour de l’élève fini",
                    ),
                  },
                  {
                    value: "presenter",
                    label: this.t("The presenter", "Le présentateur"),
                  },
                ],
                rv.when ?? "click",
                (w) =>
                  setB(
                    (x) =>
                      (x.reveal!.when =
                        w === "click" ? undefined : (w as BlockReveal["when"])),
                  ),
              ),
            )
          : null,
      ]),
    );
    // common
    const f = b.frame;
    const fr = (k: "x" | "y" | "w" | "h" | "rot") =>
      numIn(
        f[k],
        (v) =>
          v !== undefined &&
          setB(
            (x) =>
              ((x.frame as unknown as Record<string, number>)[k] =
                Math.round(v)),
            `frame.${k}`,
            false,
          ),
        { step: k === "rot" ? 1 : 24 },
      );
    out.push(
      group(this.t("Position", "Position"), [
        h(
          "div",
          { class: "ce-grid4" },
          field("X", fr("x")),
          field("Y", fr("y")),
          field("W", fr("w")),
          field("H", fr("h")),
        ),
        h(
          "div",
          { class: "ce-row" },
          field(this.t("Rotation", "Rotation"), fr("rot")),
          btn(
            f.locked
              ? this.t("Unlock", "Déverrouiller")
              : this.t("Lock", "Verrouiller"),
            () => this.host.runCanvas({ k: "toggleLock" }),
            { cls: "sm", icon: "lock" },
          ),
          btn(
            this.t("Duplicate", "Dupliquer"),
            () => this.host.runCanvas({ k: "duplicate" }),
            { cls: "sm" },
          ),
          btn("", () => this.host.runCanvas({ k: "delete" }), {
            cls: "ic ghost",
            icon: "trash",
            title: this.t("Delete", "Supprimer"),
          }),
        ),
        sw(
          !!b.presenterOnly,
          (on) =>
            setB((x) =>
              on ? (x.presenterOnly = true) : delete x.presenterOnly,
            ),
          this.t("Presenter only", "Présentateur seulement"),
          {
            sub: this.t(
              "Never on the projector or for the student",
              "Jamais au projecteur ni pour l’élève",
            ),
          },
        ),
      ]),
    );
    if (
      b.kind === "image" ||
      b.kind === "instrument" ||
      b.kind === "diagram" ||
      b.kind === "simViewport"
    ) {
      const missing = !b.alt?.en?.trim();
      out.push(
        group(this.t("Accessible name", "Nom accessible"), [
          this.l10n(
            this.t("Alt text", "Texte alternatif"),
            b.alt,
            (v) => setB((x) => (x.alt = v), "alt", false),
            {
              ph: this.t(
                "What it shows, in one line",
                "Ce qu’il montre, en une ligne",
              ),
            },
          ),
          missing
            ? note(
                this.t(
                  "Required: screen readers and the handout use it.",
                  "Obligatoire : lecteurs d’écran et résumé l’utilisent.",
                ),
                "warn",
              )
            : null,
        ]),
      );
    }
    out.push(this.tapGroup(b, setB));
    return out;
  }
  private tapGroup(
    b: SlideBlock,
    setB: (f: (x: SlideBlock) => void, key?: string, render?: boolean) => void,
  ): HTMLElement {
    const a = b.onTap;
    const kind = a?.k ?? "none";
    return group(this.t("When tapped", "Au toucher"), [
      seg(
        [
          { value: "none", label: this.t("Nothing", "Rien") },
          { value: "next", label: this.t("Next", "Suivant") },
          { value: "reveal", label: this.t("Reveal", "Révéler") },
          { value: "url", label: this.t("Link", "Lien") },
        ],
        kind === "goto" ||
          kind === "open" ||
          kind === "yourTurn" ||
          kind === "playClip"
          ? "none"
          : kind,
        (k) =>
          setB((x) => {
            if (k === "none") delete x.onTap;
            else if (k === "next") x.onTap = { k: "next" };
            else if (k === "reveal") x.onTap = { k: "reveal", order: 1 };
            else x.onTap = { k: "url", href: "https://" };
          }),
        { full: true },
      ),
      a?.k === "url"
        ? textIn(
            a.href,
            (v) =>
              setB(
                (x) => ((x.onTap as { href: string }).href = v),
                "href",
                false,
              ),
            { mono: true, ph: "https://www.faa.gov/…" },
          )
        : null,
      a?.k === "reveal"
        ? field(
            this.t("Reveal", "Apparition"),
            numIn(
              a.order,
              (v) =>
                v &&
                setB(
                  (x) => ((x.onTap as { order: number }).order = v),
                  "tapOrder",
                  false,
                ),
              { min: 1, max: 9, w: 80 },
            ),
          )
        : null,
    ]);
  }
  private sceneSelect(
    value: string | undefined,
    onPick: (id: string | undefined) => void,
  ): HTMLElement {
    const c = this.host.course;
    return selectIn<string>(
      [
        {
          value: "",
          label: this.t("The slide’s scene", "La scène de la diapo"),
        },
        ...Object.keys(c.scenes).map((id) => ({
          value: id,
          label: c.scenes[id].label ?? id,
        })),
      ],
      value ?? "",
      (v) => onPick(v || undefined),
    );
  }
  private colorChips(
    value: ColorToken | null | undefined,
    onPick: (v: ColorToken | null) => void,
    allowNone = false,
  ): HTMLElement {
    const el = h("div", { class: "ce-swatches", role: "radiogroup" });
    if (allowNone) {
      const n = h("button", {
        type: "button",
        class: `ce-swatch none${value === null ? " on" : ""}`,
        title: this.t("None", "Aucune"),
        "aria-label": this.t("None", "Aucune"),
      });
      n.addEventListener("click", () => onPick(null));
      el.append(n);
    }
    for (const t of TOKENS) {
      const b = h("button", {
        type: "button",
        class: `ce-swatch${value === t ? " on" : ""}`,
        title: t,
        "aria-label": t,
        style: `--sw:${TOKEN_SWATCH[t]}`,
      });
      b.addEventListener("click", () => onPick(t));
      el.append(b);
    }
    return el;
  }
  private blockFields(
    b: SlideBlock,
    setB: (f: (x: SlideBlock) => void, key?: string, render?: boolean) => void,
  ): Kid[] {
    const out: Kid[] = [];
    const T = this.t.bind(this);
    switch (b.kind) {
      case "text":
        out.push(
          this.l10n(
            T("Text", "Texte"),
            b.text,
            (v) => setB((x) => ((x as typeof b).text = v), "text", false),
            { multi: true, rows: 4 },
          ),
          group(T("Style", "Style"), [
            chips(
              STYLE_PICK.map((s) => ({
                value: s,
                label: tr(STYLE_LABEL[s], this.lang),
                on: (STYLE_ALIAS[b.style] ?? b.style) === s,
              })),
              (s) => setB((x) => ((x as typeof b).style = s)),
            ),
            h(
              "div",
              { class: "ce-row" },
              seg(
                [
                  { value: "left" as const, label: T("Left", "Gauche") },
                  { value: "center" as const, label: T("Centre", "Centre") },
                  { value: "right" as const, label: T("Right", "Droite") },
                ],
                b.align ?? "left",
                (v) => setB((x) => ((x as typeof b).align = v)),
              ),
              seg(
                [
                  { value: "top" as const, label: T("Top", "Haut") },
                  { value: "middle" as const, label: T("Middle", "Milieu") },
                  { value: "bottom" as const, label: T("Bottom", "Bas") },
                ],
                b.valign ?? "top",
                (v) => setB((x) => ((x as typeof b).valign = v)),
              ),
            ),
            field(
              T("Colour", "Couleur"),
              this.colorChips(b.color, (v) =>
                setB((x) =>
                  v
                    ? ((x as typeof b).color = v)
                    : delete (x as typeof b).color,
                ),
              ),
            ),
          ]),
        );
        break;
      case "image":
        out.push(
          group(T("Image", "Image"), [
            h(
              "div",
              { class: "ce-row" },
              btn(
                T("Replace…", "Remplacer…"),
                () =>
                  this.pickFile(async (f) => {
                    const r = await this.host.importImage(f);
                    if (r)
                      setB((x) => ((x as typeof b).image = { asset: r.asset }));
                  }),
                { cls: "sm", icon: "image" },
              ),
              seg(
                [
                  { value: "cover" as const, label: T("Fill", "Remplir") },
                  { value: "contain" as const, label: T("Fit", "Ajuster") },
                ],
                b.fit ?? "cover",
                (v) => setB((x) => ((x as typeof b).fit = v)),
              ),
            ),
            field(
              T("Corners", "Coins"),
              seg(
                [0, 4, 8].map((r) => ({
                  value: r as 0 | 4 | 8,
                  label: `${r}`,
                })),
                b.radius ?? 0,
                (v) => setB((x) => ((x as typeof b).radius = v)),
              ),
            ),
            this.l10n(T("Caption", "Légende"), b.caption, (v) =>
              setB((x) => ((x as typeof b).caption = v), "cap", false),
            ),
            field(
              T("Credit", "Crédit"),
              textIn(
                b.attribution ?? "",
                (v) =>
                  setB(
                    (x) => ((x as typeof b).attribution = v || undefined),
                    "attr",
                    false,
                  ),
                { ph: "Photo: …" },
              ),
            ),
            b.crop
              ? linkBtn(T("Reset the crop", "Annuler le recadrage"), () =>
                  setB((x) => delete (x as typeof b).crop),
                )
              : null,
          ]),
        );
        break;
      case "shape":
        out.push(
          group(T("Shape", "Forme"), [
            seg(
              (
                ["rect", "roundRect", "ellipse", "line", "triangle"] as const
              ).map((s) => ({
                value: s,
                label: {
                  rect: T("Rect", "Rect."),
                  roundRect: T("Rounded", "Arrondi"),
                  ellipse: T("Ellipse", "Ellipse"),
                  line: T("Line", "Ligne"),
                  triangle: T("Triangle", "Triangle"),
                }[s],
              })),
              b.shape,
              (v) => setB((x) => ((x as typeof b).shape = v)),
              { full: true },
            ),
            field(
              T("Fill", "Remplissage"),
              this.colorChips(
                b.fill,
                (v) => setB((x) => ((x as typeof b).fill = v)),
                true,
              ),
            ),
            field(
              T("Outline", "Contour"),
              this.colorChips(
                b.stroke,
                (v) => setB((x) => ((x as typeof b).stroke = v)),
                true,
              ),
            ),
            h(
              "div",
              { class: "ce-row" },
              seg(
                ([1, 2, 3, 4, 6] as const).map((w) => ({
                  value: w,
                  label: `${w}`,
                })),
                b.strokeW ?? 2,
                (v) => setB((x) => ((x as typeof b).strokeW = v)),
                { label: T("Width", "Épaisseur") },
              ),
              sw(
                !!b.dash,
                (on) => setB((x) => ((x as typeof b).dash = on || undefined)),
                T("Dashed", "Pointillé"),
              ),
            ),
          ]),
        );
        break;
      case "arrow":
        out.push(
          group(T("Arrow", "Flèche"), [
            field(
              T("Colour", "Couleur"),
              this.colorChips(b.color, (v) =>
                setB((x) => v && ((x as typeof b).color = v)),
              ),
            ),
            seg(
              [
                { value: "end" as const, label: T("One head", "Une pointe") },
                { value: "both" as const, label: T("Both", "Deux") },
                { value: "none" as const, label: T("None", "Aucune") },
              ],
              b.heads ?? "end",
              (v) => setB((x) => ((x as typeof b).heads = v)),
              { full: true },
            ),
            seg(
              ([2, 3, 4, 6] as const).map((w) => ({ value: w, label: `${w}` })),
              b.strokeW ?? 3,
              (v) => setB((x) => ((x as typeof b).strokeW = v)),
              { label: T("Width", "Épaisseur") },
            ),
            field(
              T("Curve", "Courbure"),
              seg(
                [
                  { value: 0, label: T("Straight", "Droite") },
                  { value: 0.2, label: T("Gentle", "Douce") },
                  { value: -0.2, label: T("Other way", "Inverse") },
                ],
                b.curve ?? 0,
                (v) => setB((x) => ((x as typeof b).curve = v || undefined)),
              ),
            ),
          ]),
        );
        break;
      case "callout":
        out.push(
          this.l10n(
            T("Text", "Texte"),
            b.text,
            (v) => setB((x) => ((x as typeof b).text = v), "text", false),
            { multi: true, rows: 3 },
          ),
          h(
            "div",
            { class: "ce-row" },
            field(
              T("Number", "Numéro"),
              numIn(
                b.n,
                (v) =>
                  setB(
                    (x) => ((x as typeof b).n = v ? Math.round(v) : undefined),
                    "n",
                    false,
                  ),
                { min: 1, max: 20, w: 80 },
              ),
            ),
            field(
              T("Tone", "Ton"),
              seg(
                [
                  { value: "plain" as const, label: T("Plain", "Neutre") },
                  { value: "accent" as const, label: T("Accent", "Accent") },
                  { value: "warn" as const, label: T("Caution", "Attention") },
                ],
                b.tone ?? "plain",
                (v) => setB((x) => ((x as typeof b).tone = v)),
              ),
            ),
          ),
          note(
            T(
              "Drag the leader’s end onto the instrument part.",
              "Glissez l’extrémité du trait sur la partie de l’instrument.",
            ),
            "muted",
          ),
        );
        break;
      case "marker":
        out.push(
          h(
            "div",
            { class: "ce-row" },
            field(
              T("Number", "Numéro"),
              numIn(
                b.n,
                (v) =>
                  v &&
                  setB((x) => ((x as typeof b).n = Math.round(v)), "n", false),
                { min: 1, max: 20, w: 80 },
              ),
            ),
            seg(
              [
                { value: "circle" as const, label: T("Circle", "Rond") },
                { value: "square" as const, label: T("Square", "Carré") },
              ],
              b.shape ?? "circle",
              (v) => setB((x) => ((x as typeof b).shape = v)),
            ),
          ),
          field(
            T("Colour", "Couleur"),
            this.colorChips(b.color, (v) =>
              setB((x) => v && ((x as typeof b).color = v)),
            ),
          ),
        );
        break;
      case "diagram": {
        const calcSteps = this.host.course.steps.filter(
          (s) => s.kind === "calc",
        );
        out.push(
          group(T("Diagram", "Schéma"), [
            calcSteps.length
              ? field(
                  T("Numbers from", "Chiffres de"),
                  selectIn<string>(
                    [
                      {
                        value: "",
                        label: T("Fixed (below)", "Fixes (ci-dessous)"),
                      },
                      ...calcSteps.map((s) => ({
                        value: s.id,
                        label: tr(s.title, this.lang),
                      })),
                    ],
                    b.fromCalc ?? "",
                    (v) =>
                      setB((x) =>
                        v
                          ? ((x as typeof b).fromCalc = v)
                          : delete (x as typeof b).fromCalc,
                      ),
                  ),
                )
              : null,
            ...(b.d && !b.fromCalc
              ? this.diagramFields(b.d, (d) =>
                  setB((x) => ((x as typeof b).d = d), "d", false),
                )
              : []),
            b.d?.kind === "calc"
              ? sw(
                  !!b.interactive,
                  (on) =>
                    setB(
                      (x) => ((x as typeof b).interactive = on || undefined),
                    ),
                  T("The student can drag it", "L’élève peut le manipuler"),
                )
              : null,
            this.l10n(T("Caption", "Légende"), b.caption, (v) =>
              setB((x) => ((x as typeof b).caption = v), "cap", false),
            ),
          ]),
        );
        break;
      }
      case "instrument":
        out.push(...this.instrumentFields(b, setB));
        break;
      case "simViewport":
        out.push(
          group(T("Simulator view", "Vue du simulateur"), [
            seg(
              [
                { value: "outside" as const, label: T("Outside", "Extérieur") },
                { value: "cockpit" as const, label: T("Cockpit", "Cockpit") },
                { value: "panel" as const, label: T("Panel", "Tableau") },
              ],
              b.view,
              (v) => setB((x) => ((x as typeof b).view = v)),
              { full: true },
            ),
            field(
              T("Scene", "Scène"),
              this.sceneSelect(b.scene, (v) =>
                setB((x) =>
                  v
                    ? ((x as typeof b).scene = v)
                    : delete (x as typeof b).scene,
                ),
              ),
            ),
            field(
              T("Demo clip", "Démonstration"),
              selectIn<string>(
                [
                  { value: "", label: T("None", "Aucune") },
                  ...Object.keys(this.host.course.clips).map((id) => ({
                    value: id,
                    label: `${id} · ${Math.round(this.host.course.clips[id].durS)} s`,
                  })),
                ],
                b.clip ?? "",
                (v) =>
                  setB((x) =>
                    v
                      ? ((x as typeof b).clip = v)
                      : delete (x as typeof b).clip,
                  ),
              ),
            ),
            b.clip
              ? sw(
                  !!b.autoplay,
                  (on) =>
                    setB((x) => ((x as typeof b).autoplay = on || undefined)),
                  T("Play when the slide opens", "Lire à l’ouverture"),
                )
              : null,
          ]),
          this.yourTurnGroup(
            b.yourTurn,
            "sim",
            (yt) =>
              setB((x) =>
                yt
                  ? ((x as typeof b).yourTurn = yt)
                  : delete (x as typeof b).yourTurn,
              ),
            b.scene,
          ),
        );
        break;
      case "quiz":
        out.push(
          group(
            T("Question", "Question"),
            this.quizEditor(b.quiz, (q, render = true, key) =>
              setB((x) => ((x as typeof b).quiz = q), key, render),
            ),
          ),
        );
        break;
      case "calc":
        out.push(
          group(T("Shows", "Affiche"), [
            chips(
              (
                ["prompt", "givens", "answer", "solution", "formula"] as const
              ).map((k) => ({
                value: k,
                label: {
                  prompt: T("Question", "Question"),
                  givens: T("Givens", "Données"),
                  answer: T("Answer box", "Réponse"),
                  solution: T("Solution", "Solution"),
                  formula: T("Formula", "Formule"),
                }[k],
                on: !b.show || b.show.includes(k),
              })),
              (k, on) =>
                setB((x) => {
                  const cur = new Set<NonNullable<typeof b.show>[number]>(
                    (x as typeof b).show ?? [
                      "prompt",
                      "givens",
                      "answer",
                      "solution",
                      "formula",
                    ],
                  );
                  if (on) cur.add(k);
                  else cur.delete(k);
                  (x as typeof b).show = [...cur];
                }),
            ),
          ]),
          ...this.calcEditor(b.calc, (c, render = true, key) =>
            setB((x) => ((x as typeof b).calc = c), key, render),
          ),
        );
        break;
      case "checklist": {
        const checks = this.host.step.goal?.all ?? [];
        out.push(
          this.l10n(T("Title", "Titre"), b.title, (v) =>
            setB((x) => ((x as typeof b).title = v), "title", false),
          ),
          group(T("Rows", "Lignes"), [
            ...b.rows.map((r, i) =>
              h(
                "div",
                { class: "ce-dothis" },
                this.l10n(`${T("Row", "Ligne")} ${i + 1}`, r.text, (v) =>
                  setB(
                    (x) => ((x as typeof b).rows[i].text = v),
                    `row.${i}`,
                    false,
                  ),
                ),
                h(
                  "div",
                  { class: "ce-row tight" },
                  field(
                    T("Ticked by", "Cochée par"),
                    selectIn<number>(
                      [
                        {
                          value: -1,
                          label: T(
                            "Nothing (a plain row)",
                            "Rien (ligne simple)",
                          ),
                        },
                        ...checks.map((c, k) => ({
                          value: k,
                          label: `${k + 1}. ${goalLabel(c, this.lang)}`,
                        })),
                      ],
                      r.check ?? -1,
                      (v) =>
                        setB((x) =>
                          v < 0
                            ? delete (x as typeof b).rows[i].check
                            : ((x as typeof b).rows[i].check = v),
                        ),
                    ),
                  ),
                  btn(
                    "",
                    () => setB((x) => (x as typeof b).rows.splice(i, 1)),
                    { icon: "x", cls: "ic", title: T("Remove", "Retirer") },
                  ),
                ),
              ),
            ),
            linkBtn(T("+ Add a row", "+ Ajouter une ligne"), () =>
              setB((x) => (x as typeof b).rows.push({ text: { en: "" } })),
            ),
            checks.length
              ? null
              : note(
                  T(
                    "Add a goal (Goal tab) to tick rows live.",
                    "Ajoutez un objectif (onglet Objectif) pour cocher en direct.",
                  ),
                  "muted",
                ),
          ]),
        );
        break;
      }
    }
    return out;
  }
  private instrumentFields(
    b: Extract<SlideBlock, { kind: "instrument" }>,
    setB: (f: (x: SlideBlock) => void, key?: string, render?: boolean) => void,
  ): Kid[] {
    const T = this.t.bind(this);
    const views: { label: string; v: InstrumentView }[] = [
      { label: "PFD", v: { kind: "pfd" } },
      { label: "MFD", v: { kind: "mfd" } },
      { label: T("Six-pack", "Six-pack"), v: { kind: "six" } },
      { label: "HSI", v: { kind: "gauge", gauge: "hsi" } },
      { label: "AI", v: { kind: "gauge", gauge: "ai" } },
      { label: "ASI", v: { kind: "gauge", gauge: "asi" } },
      { label: "ALT", v: { kind: "gauge", gauge: "alt" } },
      { label: "VSI", v: { kind: "gauge", gauge: "vsi" } },
      { label: "TC", v: { kind: "gauge", gauge: "tc" } },
      { label: "CDI", v: { kind: "gauge", gauge: "cdi" } },
      { label: "RMI", v: { kind: "gauge", gauge: "rmi" } },
      {
        label: T("PFD attitude", "Horizon PFD"),
        v: { kind: "gauge", gauge: "pfd.attitude" },
      },
      {
        label: T("PFD HSI", "HSI PFD"),
        v: { kind: "gauge", gauge: "pfd.hsi" },
      },
      { label: T("Radios", "Radios"), v: { kind: "gauge", gauge: "radios" } },
      { label: T("Map", "Carte"), v: { kind: "gauge", gauge: "mfd.map" } },
      { label: T("Liner PFD", "PFD liner"), v: { kind: "airlinerPfd" } },
      { label: "ND", v: { kind: "nd" } },
    ];
    const cur = JSON.stringify(b.view);
    const calcSteps = this.host.course.steps.filter((s) => s.kind === "calc");
    const frozen = (b.mode ?? "frozen") === "frozen";
    return [
      group(T("Instrument", "Instrument"), [
        chips(
          views.map((x) => ({
            value: JSON.stringify(x.v),
            label: x.label,
            on: JSON.stringify(x.v) === cur,
          })),
          (v) =>
            setB(
              (x) => ((x as typeof b).view = JSON.parse(v) as InstrumentView),
            ),
        ),
        sw(
          b.bezel !== false,
          (on) =>
            setB((x) =>
              on
                ? delete (x as typeof b).bezel
                : ((x as typeof b).bezel = false),
            ),
          T("Bezel", "Cadre"),
        ),
      ]),
      group(T("Scene and mode", "Scène et mode"), [
        field(
          T("Scene", "Scène"),
          this.sceneSelect(b.scene, (v) =>
            setB((x) =>
              v ? ((x as typeof b).scene = v) : delete (x as typeof b).scene,
            ),
          ),
        ),
        calcSteps.length
          ? field(
              T("Or the numbers of", "Ou les chiffres de"),
              selectIn<string>(
                [
                  { value: "", label: T("No calc", "Aucun calcul") },
                  ...calcSteps.map((s) => ({
                    value: s.id,
                    label: tr(s.title, this.lang),
                  })),
                ],
                b.fromCalc ?? "",
                (v) =>
                  setB((x) =>
                    v
                      ? ((x as typeof b).fromCalc = v)
                      : delete (x as typeof b).fromCalc,
                  ),
              ),
            )
          : null,
        seg(
          [
            { value: "frozen" as const, label: T("Frozen", "Figé") },
            { value: "live" as const, label: T("Live", "Direct") },
            {
              value: "clip" as const,
              label: T("Clip", "Séquence"),
              disabled: !Object.keys(this.host.course.clips).length,
            },
          ],
          b.mode ?? "frozen",
          (v) => setB((x) => ((x as typeof b).mode = v)),
          { full: true },
        ),
        b.mode === "clip"
          ? field(
              T("Clip", "Séquence"),
              selectIn(
                Object.keys(this.host.course.clips).map((id) => ({
                  value: id,
                  label: id,
                })),
                b.clip,
                (v) => setB((x) => ((x as typeof b).clip = v)),
              ),
            )
          : null,
      ]),
      group(T("Student controls", "Commandes de l’élève"), [
        chips(
          ALL_CONTROLS.map((k) => ({
            value: k,
            label: tr(CONTROL_LABEL[k], this.lang),
            on: !!b.controls?.includes(k),
            disabled: frozen && !b.yourTurn,
          })),
          (k, on) =>
            setB((x) => {
              const set = new Set((x as typeof b).controls ?? []);
              if (on) set.add(k);
              else set.delete(k);
              (x as typeof b).controls = ALL_CONTROLS.filter((c) => set.has(c));
              if (!(x as typeof b).controls!.length)
                delete (x as typeof b).controls;
            }),
        ),
        frozen && !b.yourTurn
          ? note(
              T(
                "A frozen instrument has no controls. Choose Live, or hand it over with Your turn.",
                "Un instrument figé n’a pas de commandes. Choisissez Direct, ou donnez la main avec À vous.",
              ),
              "muted",
            )
          : null,
      ]),
      this.calloutsGroup(
        { annotations: b.annotations },
        (list) => setB((x) => ((x as typeof b).annotations = list)),
        b.view.kind === "gauge" ? undefined : (b.view as PaneView),
      ),
      this.yourTurnGroup(
        b.yourTurn,
        "slide",
        (yt) =>
          setB((x) =>
            yt
              ? ((x as typeof b).yourTurn = yt)
              : delete (x as typeof b).yourTurn,
          ),
        b.scene,
      ),
    ];
  }
  private yourTurnGroup(
    yt: YourTurn | undefined,
    where: "slide" | "sim",
    set: (yt: YourTurn | undefined) => void,
    scene?: string,
  ): HTMLElement {
    const T = this.t.bind(this);
    if (!yt)
      return group(T("Your turn", "À vous"), [
        note(
          where === "slide"
            ? T(
                "Hand the instrument to the student: they turn the knobs you allow, the sim checks the goal live, the result comes back to the slide.",
                "Donnez l’instrument à l’élève : il tourne les commandes permises, le simulateur vérifie l’objectif en direct, le résultat revient sur la diapo.",
              )
            : T(
                "Open the full simulator from this scene, check goals live, and come back to this slide with the result.",
                "Ouvrez le simulateur complet depuis cette scène, vérifiez en direct, puis revenez sur cette diapo avec le résultat.",
              ),
          "muted",
        ),
        btn(
          T("Hand control to the student", "Donner la main à l’élève"),
          () =>
            set({
              where,
              prompt: L(
                "Your turn: centre the needle on the 090 course.",
                "À vous : centrez l’aiguille sur la route 090.",
              ),
              ...(scene ? { scene } : {}),
              controls: where === "slide" ? ["obs1", "hdgBug"] : undefined,
              goal: newGoal(this.host.course.cockpit),
              returnTo: "thisStep",
            } as YourTurn),
          { icon: "play", cls: "sm primary" },
        ),
      ]);
    const upd = (f: (y: YourTurn) => void, render = true) => {
      const n = clone(yt);
      f(n);
      set(n);
      if (render) this.render();
    };
    const assisted = !!(yt.assist?.holdAlt || yt.assist?.holdIas);
    return group(T("Your turn", "À vous"), [
      seg(
        [
          {
            value: "slide" as const,
            label: T("On this slide", "Sur la diapo"),
          },
          {
            value: "sim" as const,
            label: T("In the simulator", "Dans le simulateur"),
          },
        ],
        yt.where,
        (v) => upd((y) => (y.where = v)),
        { full: true },
      ),
      this.l10n(
        T("Task", "Consigne"),
        yt.prompt,
        (v) => upd((y) => (y.prompt = v), false),
        { multi: true, rows: 2 },
      ),
      this.checksEditor(yt.goal.all, (l, render = true) =>
        upd((y) => (y.goal.all = l), render),
      ),
      h(
        "div",
        { class: "ce-grid2" },
        field(
          T("Hold for", "Tenir"),
          numIn(
            yt.goal.holdS,
            (v) =>
              upd((y) => (v ? (y.goal.holdS = v) : delete y.goal.holdS), false),
            { unit: "s", w: 80 },
          ),
        ),
        yt.where === "sim"
          ? field(
              T("Ends after", "Fin après"),
              numIn(yt.durationS, (v) => upd((y) => (y.durationS = v), false), {
                unit: "s",
                w: 90,
              }),
            )
          : null,
      ),
      sw(
        !!yt.assist?.holdAlt,
        (on) =>
          upd((y) => (y.assist = { ...y.assist, holdAlt: on || undefined })),
        T("Hold altitude for the student", "Tenir l’altitude pour l’élève"),
      ),
      sw(
        yt.goal.graded && !assisted,
        (on) => upd((y) => (y.goal.graded = on)),
        T("Checked practice", "Entraînement vérifié"),
        { disabled: assisted },
      ),
      this.l10n(T("Hint", "Indice"), yt.hint, (v) =>
        upd((y) => (y.hint = v), false),
      ),
      h(
        "div",
        { class: "ce-row" },
        btn(T("Remove Your turn", "Retirer À vous"), () => set(undefined), {
          cls: "sm ghost",
          icon: "x",
        }),
      ),
    ]);
  }
  private layersGroup(c: SlideCanvas): HTMLElement {
    const sel = new Set(this.host.selection.map((b) => b.id));
    const list = [...c.blocks].sort((a, b) => b.frame.z - a.frame.z);
    return group(this.t("Layers", "Calques"), [
      h(
        "div",
        { class: "ce-layers" },
        ...list.map((b) => {
          const row = h(
            "button",
            { type: "button", class: `ce-layer${sel.has(b.id) ? " on" : ""}` },
            h(
              "span",
              { class: "ce-layer-k" },
              blockKindLabel(b.kind, this.lang),
            ),
            h("span", { class: "ce-layer-n" }, blockLabel(b, this.lang)),
            b.reveal
              ? h(
                  "span",
                  { class: "ce-tag" },
                  `${this.t("reveal", "app.")} ${b.reveal.order}`,
                )
              : null,
            b.frame.locked ? ico("lock") : null,
          );
          row.addEventListener("click", () => this.host.selectBlocks([b.id]));
          return row;
        }),
      ),
    ]);
  }

  // ================================================================ designed slides: Slide
  private slideTab(): Kid[] {
    const s = this.host.step;
    const c = s.slide!;
    const course = this.host.course;
    const setC = (f: (x: SlideCanvas) => void) => {
      const n = clone(c);
      f(n);
      this.host.setSlide(n);
      this.render();
    };
    return [
      this.l10n(this.t("Step title", "Titre de l’étape"), s.title, (v) =>
        this.edit("title", (x) => (x.title = v)),
      ),
      group(this.t("Layout", "Mise en page"), [
        layoutPicker(this.lang, c.layout, course, (id) => {
          const prev = this.host.step;
          const next = layoutCanvas(id, {
            ...(c.scene ? { scene: c.scene } : {}),
            title: s.title,
          });
          delete next.theme;
          this.host.setSlide(next);
          this.host.toast(
            this.t("Layout applied", "Mise en page appliquée"),
            () => this.set(prev, undefined, true),
          );
          this.render();
        }),
      ]),
      group(this.t("Course theme", "Thème du cours"), [
        // one theme per course (SPEC slides v2 §4): picking here changes every slide
        themePicker(this.lang, baseThemeId(course.theme), (id) => {
          this.host.setCourse(
            {
              ...course,
              theme: id,
              steps: course.steps.map((x) => {
                if (!x.slide?.theme) return x;
                const { theme: _t, ...rest } = x.slide;
                void _t;
                return { ...x, slide: rest };
              }),
            },
            undefined,
            false,
          );
          setC((x) => delete x.theme);
        }),
        h(
          "p",
          { class: "ce-note muted" },
          this.t(
            "One theme for the whole course. Classroom (light) by default; Cockpit (dark) for a night or IMC scene.",
            "Un thème pour tout le cours. Salle de cours (clair) par défaut ; Cockpit (sombre) pour une scène de nuit ou en IMC.",
          ),
        ),
        course.theme === "brand" ? this.brandFields() : null,
      ]),
      group(this.t("Background", "Fond"), [
        this.colorChips(c.background?.color, (v) =>
          setC(
            (x) =>
              (x.background = {
                ...(x.background ?? {}),
                color: v ?? undefined,
              }),
          ),
        ),
        c.background?.image
          ? field(
              this.t("Dim the photo", "Assombrir la photo"),
              seg(
                [0, 0.2, 0.4, 0.6].map((d) => ({
                  value: d,
                  label: `${Math.round(d * 100)} %`,
                })),
                c.background.dim ?? 0,
                (d) => setC((x) => (x.background!.dim = d || undefined)),
              ),
            )
          : null,
        c.background
          ? linkBtn(this.t("No background", "Pas de fond"), () =>
              setC((x) => delete x.background),
            )
          : null,
      ]),
      group(this.t("Scene of the instruments", "Scène des instruments"), [
        this.sceneSelect(c.scene, (v) =>
          setC((x) => (v ? (x.scene = v) : delete x.scene)),
        ),
        note(
          this.t(
            "Instruments that name no scene use this one; they share one stage sim, so they move together.",
            "Les instruments sans scène utilisent celle-ci ; ils partagent un simulateur et bougent ensemble.",
          ),
          "muted",
        ),
        sw(
          !!c.hideBrand,
          (on) => setC((x) => (on ? (x.hideBrand = true) : delete x.hideBrand)),
          this.t(
            "Hide the school logo on this slide",
            "Masquer le logo de l’école sur cette diapo",
          ),
        ),
        field(
          this.t("Snap grid", "Grille"),
          seg(
            [12, 24, 48].map((g) => ({ value: g, label: `${g}` })),
            c.grid ?? 24,
            (g) => setC((x) => (x.grid = g)),
          ),
        ),
      ]),
      group(this.t("Linear text", "Texte linéaire"), [
        note(
          this.t(
            `${s.reader.length} block${s.reader.length > 1 ? "s" : ""} for screen readers, the handout and phones.`,
            `${s.reader.length} bloc${s.reader.length > 1 ? "s" : ""} pour les lecteurs d’écran, le résumé et les téléphones.`,
          ),
          "muted",
        ),
        btn(
          this.t("Rebuild from the slide", "Reconstruire depuis la diapo"),
          () =>
            this.edit(
              undefined,
              (x) => (x.reader = linearText(x.slide!)),
              true,
            ),
          { cls: "sm" },
        ),
      ]),
    ];
  }
  private brandFields(): HTMLElement {
    const c = this.host.course;
    const b = c.brand ?? { name: c.author.club ?? "", color: "#1d4ed8" };
    const set = (nb: typeof b, render = false) =>
      this.host.setCourse({ ...this.host.course, brand: nb }, "brand", render);
    const color = h("input", {
      type: "color",
      class: "ce-color",
      value: b.color,
      "aria-label": this.t("School colour", "Couleur de l’école"),
    });
    color.addEventListener("input", () => set({ ...b, color: color.value }));
    return h(
      "div",
      { class: "ce-sub" },
      field(
        this.t("School", "École"),
        textIn(b.name, (v) => set({ ...b, name: v })),
      ),
      field(this.t("Colour", "Couleur"), color),
      field(
        this.t("Logo", "Logo"),
        btn(
          b.logo
            ? this.t("Replace the logo…", "Remplacer le logo…")
            : this.t("Add the logo…", "Ajouter le logo…"),
          () =>
            this.pickFile(async (f) => {
              const r = await this.host.importImage(f);
              if (r) set({ ...b, logo: { asset: r.asset } }, true);
            }),
          { cls: "sm", icon: "image" },
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------ pickers shared with the editor's toolbar
/** The layout gallery: each template drawn as a small slide. */
export function layoutPicker(
  lang: Lang,
  current: string | undefined,
  course: Course,
  onPick: (id: (typeof LAYOUTS)[number]["id"]) => void,
): HTMLElement {
  const el = h("div", { class: "ce-layouts" });
  for (const L of LAYOUTS) {
    const thumb = h("div", { class: "ce-layout-th" });
    const b = h(
      "button",
      {
        type: "button",
        class: `ce-layout${current === L.id ? " on" : ""}`,
        title: tr(L.summary, lang),
      },
      thumb,
      h("span", {}, tr(L.title, lang)),
    );
    b.addEventListener("click", () => onPick(L.id));
    el.append(b);
    requestAnimationFrame(() => {
      try {
        renderThumb(layoutCanvas(L.id), thumb, {
          lang,
          theme: course.theme ?? "classroom",
          brand: course.brand,
          scenes: course.scenes,
          cockpit: course.cockpit,
        });
      } catch {
        /* a thumbnail is decoration */
      }
    });
  }
  return el;
}
const THEME_SWATCH: Record<ThemeId, [string, string, string]> = {
  cockpit: [
    THEMES.cockpit.colors.bg,
    THEMES.cockpit.colors.text,
    THEMES.cockpit.colors.accent,
  ],
  classroom: [
    THEMES.classroom.colors.bg,
    THEMES.classroom.colors.text,
    THEMES.classroom.colors.accent,
  ],
  projector: [
    THEMES.projector.colors.bg,
    THEMES.projector.colors.text,
    THEMES.projector.colors.accent,
  ],
  brand: [
    THEMES.brand.colors.bg,
    THEMES.brand.colors.text,
    THEMES.brand.colors.accent,
  ],
};
export function themePicker(
  lang: Lang,
  current: ThemeId,
  onPick: (id: ThemeId) => void,
): HTMLElement {
  const el = h("div", { class: "ce-themes", role: "radiogroup" });
  for (const id of THEME_IDS) {
    const [bg, fg, ac] = THEME_SWATCH[id];
    const b = h(
      "button",
      {
        type: "button",
        role: "radio",
        class: `ce-theme${current === id ? " on" : ""}`,
        "aria-checked": current === id ? "true" : "false",
      },
      h(
        "span",
        { class: "ce-theme-sw", style: `background:${bg};color:${fg}` },
        h("b", {}, "Aa"),
        h("i", { style: `background:${ac}` }),
      ),
      h("span", {}, tr(THEMES[id].name, lang)),
    );
    b.addEventListener("click", () => onPick(id));
    el.append(b);
  }
  return el;
}

// ------------------------------------------------------------------ small pure helpers
function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const out = [...list];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}
function fmtNum(v: number, lang: Lang): string {
  const r = Math.abs(v) >= 100 ? Math.round(v) : Number(v.toPrecision(3));
  return lang === "fr" ? String(r).replace(".", ",") : String(r);
}
/** Which block of a group the inspector edits: the instrument or the picture, not its markers. */
function rank(b: SlideBlock): number {
  return (
    {
      instrument: 5,
      simViewport: 5,
      diagram: 4,
      image: 4,
      quiz: 3,
      calc: 3,
      checklist: 3,
      text: 2,
      shape: 1,
      callout: 1,
      arrow: 0,
      marker: 0,
    }[b.kind] ?? 0
  );
}
/** A goal check with its catalogue defaults. */
export function defaultCheck(id: GoalId): GoalCheck {
  const def = GOALS[id];
  const p: Record<string, unknown> = {};
  for (const pd of def?.params ?? []) if (!pd.optional) p[pd.name] = pd.default;
  return { id, p } as unknown as GoalCheck;
}

/** A goal parameter's unit as the author reads it (the catalogue writes them in English). */
function paramUnit(u: string | undefined, lang: Lang): string | undefined {
  if (!u || lang !== "fr") return u;
  const FR: Record<string, string> = {
    dots: "points",
    dot: "point",
    s: "s",
    sec: "s",
    laps: "tours",
    lap: "tour",
    "ft/min": "ft/min",
  };
  return FR[u] ?? u;
}
