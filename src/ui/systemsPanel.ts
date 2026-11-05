// C172S systems panel: the switches, knobs and selectors a student operates in an emergency (master ALT | BAT,
// avionics, magneto key, aux fuel pump, beacon, landing light, pitot heat, alternate static, mixture, fuel selector
// and shutoff valve, cabin heat, trim / AP breaker) plus a strip of live engine and electrical gauges for the
// steam cockpit. Every control is a real <button> (or a range input) — keyboard focusable, aria-labelled in FR/EN,
// ≥ 44 px under a coarse pointer, no hover- or drag-only interaction — and every action goes through
// sim.setSwitch, so it is logged and graded like the real thing. The panel folds into a slim status strip.
//
// mountSystemsPanel(host, sim) is mounted by the runner (main.ts); the pure helpers below (toggleControl,
// setMagnetos, mixtureStep, panelSummary, gaugeStrip) are what the tests exercise.
import type { Sim } from "../sim/sim";
import { registerStrings, t, lang, onLangChange } from "./i18n";
import {
  ANNUNCIATOR_LEVEL,
  SWITCH_LABELS_EN,
  SWITCH_LABELS_FR,
  switchValueText,
  switchValueTextFr,
  type Annunciator,
  type FuelSelector,
  type Magnetos,
  type Switches,
} from "../sim/systemsTypes";
import { eisReadings, type EisLevel } from "../avionics/mfd";

registerStrings("en", {
  "sysp.title": "Aircraft systems",
  "sysp.show": "Show the systems panel",
  "sysp.hide": "Fold the systems panel",
  "sysp.fold": "Fold",
  "sysp.g.elec": "Electrical",
  "sysp.g.ign": "Ignition",
  "sysp.g.engine": "Engine",
  "sysp.g.fuel": "Fuel",
  "sysp.g.cb": "Breaker",
  "sysp.g.gauges": "Gauges",
  "sysp.mag.start": "Hold to crank (a tap cranks until the engine runs)",
  "sysp.mix.lean": "Lean the mixture",
  "sysp.mix.rich": "Enrich the mixture",
  "sysp.mix.cut": "Idle cut-off",
  "sysp.mix.full": "Full rich",
  "sysp.pull": "pull",
  "sysp.push": "push",
  "sysp.engineOff": "Engine stopped",
  "sysp.noPower": "No electrical power",
  "sysp.fire": "Fire",
  "sysp.smoke": "Smoke",
  "sysp.g.volts": "Bus volts",
  "sysp.g.amps": "Battery amps",
  "sysp.g.vac": "Suction",
  "sysp.g.oilP": "Oil pressure",
  "sysp.g.oilT": "Oil temperature",
  "sysp.g.fuelL": "Fuel left",
  "sysp.g.fuelR": "Fuel right",
});
registerStrings("fr", {
  "sysp.title": "Systèmes avion",
  "sysp.show": "Afficher le panneau des systèmes",
  "sysp.hide": "Replier le panneau des systèmes",
  "sysp.fold": "Replier",
  "sysp.g.elec": "Électrique",
  "sysp.g.ign": "Allumage",
  "sysp.g.engine": "Moteur",
  "sysp.g.fuel": "Carburant",
  "sysp.g.cb": "Disjoncteur",
  "sysp.g.gauges": "Instruments",
  "sysp.mag.start":
    "Maintenir pour lancer le démarreur (un appui bref le lance jusqu’au démarrage)",
  "sysp.mix.lean": "Appauvrir",
  "sysp.mix.rich": "Enrichir",
  "sysp.mix.cut": "Étouffoir",
  "sysp.mix.full": "Plein riche",
  "sysp.pull": "tirer",
  "sysp.push": "pousser",
  "sysp.engineOff": "Moteur arrêté",
  "sysp.noPower": "Plus d’alimentation électrique",
  "sysp.fire": "Feu",
  "sysp.smoke": "Fumée",
  "sysp.g.volts": "Tension barre",
  "sysp.g.amps": "Courant batterie",
  "sysp.g.vac": "Dépression",
  "sysp.g.oilP": "Pression d’huile",
  "sysp.g.oilT": "Température d’huile",
  "sysp.g.fuelL": "Carburant gauche",
  "sysp.g.fuelR": "Carburant droit",
});

// ------------------------------------------------------------------ pure control logic (tested)
/** what the panel needs from the simulator */
export type PanelSim = Pick<Sim, "sw" | "setSwitch"> & {
  sys?: Sim["sys"];
  ac?: Sim["ac"];
};

/** two-position controls of the panel */
export type PanelToggle =
  | "bat"
  | "alt"
  | "avionics"
  | "auxPump"
  | "beacon"
  | "landingLight"
  | "pitotHeat"
  | "altStatic"
  | "cabinHeat"
  | "fuelShutoff"
  | "trimCb";
const TOGGLE_KEY: Record<PanelToggle, keyof Switches> = {
  bat: "batMaster",
  alt: "altMaster",
  avionics: "avionics",
  auxPump: "auxPump",
  beacon: "beacon",
  landingLight: "landingLight",
  pitotHeat: "pitotHeat",
  altStatic: "altStatic",
  cabinHeat: "cabinHeat",
  fuelShutoff: "fuelShutoff",
  trimCb: "trimCb",
};
export const toggleSwitchKey = (c: PanelToggle): keyof Switches =>
  TOGGLE_KEY[c];

/** Flip a two-position control. The split master rocker is interlocked like the real one: ALT ON pushes BAT ON
 *  with it, BAT OFF takes ALT OFF with it (ALT alone can be switched OFF — the alternator-failure procedure). */
export function toggleControl(sim: PanelSim, c: PanelToggle): void {
  const sw = sim.sw;
  if (c === "bat") {
    if (sw.batMaster) {
      if (sw.altMaster) sim.setSwitch("altMaster", false);
      sim.setSwitch("batMaster", false);
    } else sim.setSwitch("batMaster", true);
    return;
  }
  if (c === "alt") {
    if (sw.altMaster) sim.setSwitch("altMaster", false);
    else {
      if (!sw.batMaster) sim.setSwitch("batMaster", true);
      sim.setSwitch("altMaster", true);
    }
    return;
  }
  const k = TOGGLE_KEY[c];
  sim.setSwitch(k, !sw[k] as Switches[typeof k]);
}

/** magneto key positions, left to right */
export const MAG_POSITIONS: readonly Magnetos[] = [
  "OFF",
  "R",
  "L",
  "BOTH",
  "START",
];
export function setMagnetos(sim: PanelSim, m: Magnetos): void {
  sim.setSwitch("magnetos", m);
}
/** turn the key one notch (START is never reached by a notch: it is a spring-loaded position you hold) */
export function stepMagnetos(sim: PanelSim, dir: 1 | -1): void {
  const i = Math.max(
    0,
    MAG_POSITIONS.indexOf(
      sim.sw.magnetos === "START" ? "BOTH" : sim.sw.magnetos,
    ),
  );
  const j = Math.max(0, Math.min(3, i + dir));
  if (j !== i || sim.sw.magnetos === "START")
    setMagnetos(sim, MAG_POSITIONS[j]);
}

/** mixture: one ± press moves the knob by this much (the real knob is a vernier) */
export const MIX_STEP = 0.05;
export function mixtureStep(sim: PanelSim, dir: 1 | -1): void {
  const m = Math.round((sim.sw.mixture + dir * MIX_STEP) * 100) / 100;
  sim.setSwitch("mixture", Math.max(0, Math.min(1, m)));
}
export function setMixture(sim: PanelSim, v: number): void {
  sim.setSwitch("mixture", Math.max(0, Math.min(1, v)));
}

export const FUEL_POSITIONS: readonly FuelSelector[] = [
  "LEFT",
  "BOTH",
  "RIGHT",
  "OFF",
];
export function setFuelSelector(sim: PanelSim, f: FuelSelector): void {
  sim.setSwitch("fuelSelector", f);
}

/** label and value of a switch in the current language */
export function switchLabel(k: keyof Switches): string {
  return (lang() === "fr" ? SWITCH_LABELS_FR : SWITCH_LABELS_EN)[k];
}
export function switchValue<K extends keyof Switches>(
  k: K,
  v: Switches[K],
): string {
  return lang() === "fr" ? switchValueTextFr(k, v) : switchValueText(k, v);
}

export interface SummaryChip {
  id: string;
  text: string;
  tone: "normal" | "caution" | "warning";
}
/** The folded panel's status strip: masters, magnetos, fuel selector, mixture, then the lit annunciators and the
 *  alarms (engine stopped, no power, fire, smoke). The chips are ordered by urgency (warnings, cautions, then the
 *  normal settings), so a narrow strip that cuts its end never hides an alarm. The annunciator texts stay as the
 *  aircraft shows them (LOW VOLTS…); the switch names and positions follow the language. */
export function panelSummary(sim: PanelSim): SummaryChip[] {
  const sw = sim.sw;
  const sys = sim.sys;
  const fr = lang() === "fr";
  const out: SummaryChip[] = [];
  const both = sw.batMaster && sw.altMaster;
  const none = !sw.batMaster && !sw.altMaster;
  const m = fr
    ? both
      ? "MARCHE"
      : none
        ? "ARRÊT"
        : sw.batMaster
          ? "BAT SEULE"
          : "ALT SEUL"
    : both
      ? "ON"
      : none
        ? "OFF"
        : sw.batMaster
          ? "BAT"
          : "ALT";
  out.push({
    id: "master",
    text: `${fr ? "GÉNÉRAL" : "MASTER"} ${m}`,
    tone: both ? "normal" : "caution",
  });
  out.push({
    id: "mags",
    text: fr
      ? `MAGNÉTOS ${switchValueTextFr("magnetos", sw.magnetos)}`
      : `MAGS ${sw.magnetos}`,
    tone: sw.magnetos === "BOTH" ? "normal" : "caution",
  });
  out.push({
    id: "fuel",
    text: fr
      ? `CARBURANT ${sw.fuelShutoff ? switchValueTextFr("fuelSelector", sw.fuelSelector) : "COUPÉ"}`
      : `FUEL ${sw.fuelShutoff ? sw.fuelSelector : "SHUTOFF"}`,
    tone: sw.fuelShutoff && sw.fuelSelector !== "OFF" ? "normal" : "caution",
  });
  const pct = `${Math.round(sw.mixture * 100)} %`;
  const mix = fr
    ? sw.mixture < 0.06
      ? "ÉTOUFFOIR"
      : sw.mixture >= 0.98
        ? "PLEIN RICHE"
        : pct
    : sw.mixture < 0.06
      ? "CUT-OFF"
      : sw.mixture >= 0.98
        ? "RICH"
        : pct;
  out.push({
    id: "mix",
    text: `${fr ? "MÉLANGE" : "MIX"} ${mix}`,
    tone: sw.mixture < 0.06 ? "caution" : "normal",
  });
  if (!sw.avionics)
    out.push({
      id: "avionics",
      text: fr ? "AVIONIQUE ARRÊT" : "AVIONICS OFF",
      tone: "caution",
    });
  if (sys) {
    if (!sys.engineRunning)
      out.push({ id: "engineOff", text: t("sysp.engineOff"), tone: "warning" });
    if (!sys.powered)
      out.push({ id: "noPower", text: t("sysp.noPower"), tone: "warning" });
    if (sys.fire)
      out.push({ id: "fire", text: t("sysp.fire"), tone: "warning" });
    else if (sys.smoke)
      out.push({ id: "smoke", text: t("sysp.smoke"), tone: "warning" });
    for (const a of sys.annunciators) {
      if (a === "FIRE" || a === "SMOKE") continue;
      out.push({
        id: `ann-${a}`,
        text: a,
        tone: ANNUNCIATOR_LEVEL[a] === "warning" ? "warning" : "caution",
      });
    }
  }
  const rank = { warning: 0, caution: 1, normal: 2 } as const;
  // stable: within a tone the order above is kept
  return out
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank[a.c.tone] - rank[b.c.tone] || a.i - b.i)
    .map((x) => x.c);
}

export interface GaugeCell {
  id: "volts" | "amps" | "vac" | "oilP" | "oilT" | "fuelL" | "fuelR";
  label: string;
  value: string;
  unit: string;
  /** pointer position 0..1 along the bar */
  frac: number;
  level: EisLevel;
}
/** The live gauges strip (steam cockpit): the same readings and colour bands as the G1000 EIS. Like the C172S
 *  cluster, only the suction gauge is mechanical: without electrical power the other gauges have no reading. */
export function gaugeStrip(sim: Sim): GaugeCell[] {
  const e = eisReadings(sim);
  const volts = e.mBus.value;
  const amps = e.mBatt.value;
  const cells: GaugeCell[] = [
    {
      id: "volts",
      label: "VOLTS",
      value: e.mBus.text,
      unit: "V",
      frac: Math.max(0, Math.min(1, (volts - 18) / 14)),
      level: e.mBus.level,
    },
    {
      id: "amps",
      label: "AMPS",
      value: e.mBatt.text,
      unit: "A",
      frac: Math.max(0, Math.min(1, (amps + 60) / 120)),
      level: e.mBatt.level,
    },
    {
      id: "vac",
      label: "VAC",
      value: e.vac.text,
      unit: "inHg",
      frac: e.vac.frac,
      level: e.vac.level,
    },
    {
      id: "oilP",
      label: "OIL P",
      value: e.oilP.text,
      unit: "psi",
      frac: e.oilP.frac,
      level: e.oilP.level,
    },
    {
      id: "oilT",
      label: "OIL T",
      value: e.oilT.text,
      unit: "°F",
      frac: e.oilT.frac,
      level: e.oilT.level,
    },
    {
      id: "fuelL",
      label: "FUEL L",
      value: e.fuelL.text,
      unit: "gal",
      frac: e.fuelL.frac,
      level: e.fuelL.level,
    },
    {
      id: "fuelR",
      label: "FUEL R",
      value: e.fuelR.text,
      unit: "gal",
      frac: e.fuelR.frac,
      level: e.fuelR.level,
    },
  ];
  if (sim.sys && !sim.sys.powered)
    for (const c of cells)
      if (c.id !== "vac" && c.id !== "volts") {
        c.value = "—";
        c.frac = 0;
        c.level = "normal";
      }
  return cells;
}

// ------------------------------------------------------------------ DOM
type Attrs = Record<string, string | number | boolean | undefined>;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "class") e.className = String(v);
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  e.append(...kids);
  return e;
}
const SVG = "http://www.w3.org/2000/svg";
function svg(
  tag: string,
  attrs: Record<string, string | number>,
  ...kids: SVGElement[]
): SVGElement {
  const e = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  e.append(...kids);
  return e;
}
/** set an attribute only when it changes (update() runs every frame) */
function attr(e: Element, k: string, v: string) {
  if (e.getAttribute(k) !== v) e.setAttribute(k, v);
}
function txt(e: Element, v: string) {
  if (e.textContent !== v) e.textContent = v;
}

const STORE_KEY = "ifr.systemsPanel.folded";
const readFolded = (dflt: boolean) => {
  try {
    const v = localStorage.getItem(STORE_KEY);
    return v === null ? dflt : v === "1";
  } catch {
    return dflt;
  }
};
const writeFolded = (v: boolean) => {
  try {
    localStorage.setItem(STORE_KEY, v ? "1" : "0");
  } catch {
    /* storage blocked */
  }
};

export interface SystemsPanel {
  el: HTMLElement;
  update(): void;
  setVisible(v: boolean): void;
  /** show / hide the live gauges strip (on for the steam cockpit; the G1000 EIS shows the same readings) */
  setGauges(v: boolean): void;
}

/** Mount the panel in `host`. opts.compact starts it folded (slim strip); opts.gauges = false hides the gauges
 *  strip (the G1000 shows the same readings on its EIS). Call update() once per frame. */
export function mountSystemsPanel(
  host: HTMLElement,
  sim: Sim,
  opts: { compact?: boolean; gauges?: boolean } = {},
): SystemsPanel {
  const root = el("section", {
    class: "sysp",
    "data-folded": readFolded(!!opts.compact) ? "1" : "0",
  });
  const refresh: (() => void)[] = []; // per-control state sync
  const relabel: (() => void)[] = []; // language change

  // ---------------------------------------------------------------- header: fold toggle + status strip
  const chev = svg(
    "svg",
    {
      viewBox: "0 0 16 16",
      width: 14,
      height: 14,
      "aria-hidden": "true",
      class: "sysp-chev",
    },
    svg("path", {
      d: "M4 6l4 4 4-4",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );
  const title = el("span", { class: "sysp-title" });
  const foldBtn = el(
    "button",
    { class: "sysp-fold", type: "button" },
    chev,
    title,
  );
  const strip = el("div", {
    class: "sysp-strip",
    role: "status",
    "aria-live": "polite",
  });
  // folded: this one-line strip is all that shows; unfolded it gives way to the controls (the switch positions are
  // then in plain view, the annunciators are on the PFD / annunciator panel) and the panel takes as little height
  // as it can, so the instruments above it keep their size
  const head = el("header", { class: "sysp-head" }, foldBtn, strip);
  const gaugesRow = el("div", { class: "sysp-gauges", role: "group" });
  const body = el("div", { class: "sysp-body" });
  const foldIn = el(
    "button",
    { class: "sysp-fold-in", type: "button" },
    svg(
      "svg",
      { viewBox: "0 0 16 16", width: 14, height: 14, "aria-hidden": "true" },
      svg("path", {
        d: "M4 6l4 4 4-4",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": 2,
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
      }),
    ),
    el("span", { class: "sysp-fold-in-l" }),
  );
  root.append(head, gaugesRow, body);
  let stripSig = ""; // the chips last drawn in the status strip
  const setFolded = (f: boolean) => {
    attr(root, "data-folded", f ? "1" : "0");
    if (f) stripSig = ""; // re-fit the strip to its (now visible) width on the next update
    attr(foldBtn, "aria-expanded", String(!f));
    attr(foldBtn, "aria-label", t(f ? "sysp.show" : "sysp.hide"));
    attr(foldIn, "aria-expanded", String(!f));
    attr(foldIn, "aria-label", t("sysp.hide"));
    attr(foldIn, "title", t("sysp.hide"));
    writeFolded(f);
  };
  foldBtn.addEventListener("click", () =>
    setFolded(root.getAttribute("data-folded") !== "1"),
  );
  foldIn.addEventListener("click", () => {
    setFolded(true);
    foldBtn.focus();
  });
  relabel.push(() => {
    txt(title, t("sysp.title"));
    txt(foldIn.querySelector(".sysp-fold-in-l")!, t("sysp.fold"));
    attr(gaugesRow, "aria-label", t("sysp.g.gauges"));
    setFolded(root.getAttribute("data-folded") === "1");
  });
  refresh.push(() => {
    const chips = panelSummary(sim);
    const sig = chips.map((c) => c.id + c.text + c.tone).join("|");
    if (sig === stripSig) return;
    stripSig = sig;
    strip.replaceChildren(
      ...chips.map((c) => el("span", { class: `sysp-chip ${c.tone}` }, c.text)),
    );
    fitStrip();
  });
  /** a narrow strip shows whole chips only: the ones that do not fit are dropped from the end (the least urgent,
   *  see panelSummary) instead of being cut mid-word */
  const fitStrip = () => {
    if (root.getAttribute("data-folded") !== "1" || !strip.isConnected) return;
    const right = strip.getBoundingClientRect().right;
    let over = false;
    for (const c of Array.from(strip.children) as HTMLElement[]) {
      c.hidden = false;
      if (over || c.getBoundingClientRect().right > right + 0.5) {
        over = true;
        c.hidden = true;
      }
    }
  };
  if (typeof ResizeObserver !== "undefined")
    new ResizeObserver(() => fitStrip()).observe(strip);

  // the placards name every control (MASTER, MIXTURE, FUEL SELECTOR…): the groups are separated by a rule and
  // named for assistive technology only, which keeps the panel one control high
  const group = (id: string, ...kids: Node[]) => {
    const g = el(
      "div",
      { class: `sysp-g sysp-g-${id}`, role: "group" },
      el("div", { class: "sysp-gc" }, ...kids),
    );
    relabel.push(() => attr(g, "aria-label", t(`sysp.g.${id}`)));
    body.append(g);
    return g;
  };
  const aria = <K extends keyof Switches>(b: Element, k: K) =>
    attr(b, "aria-label", `${switchLabel(k)}: ${switchValue(k, sim.sw[k])}`);

  // ---------------------------------------------------------------- rocker switches
  /** a Cessna rocker: placard above, paddle (up = ON), state word below */
  const rocker = (c: PanelToggle, placard: string, cls = "") => {
    const k = TOGGLE_KEY[c];
    const state = el("span", { class: "rk-state" });
    const b = el(
      "button",
      { class: `rk ${cls}`, type: "button", role: "switch" },
      el("span", { class: "rk-plac" }, placard),
      el("span", { class: "rk-well" }, el("span", { class: "rk-pad" })),
      state,
    );
    b.addEventListener("click", () => toggleControl(sim, c));
    const sync = () => {
      const on = !!sim.sw[k];
      attr(b, "aria-checked", String(on));
      txt(state, switchValue(k, sim.sw[k]));
      aria(b, k);
    };
    refresh.push(sync);
    relabel.push(sync);
    return b;
  };
  // master: split red rocker in one housing
  const master = el(
    "div",
    { class: "rk-split", role: "group" },
    rocker("alt", "ALT", "rk-red"),
    rocker("bat", "BAT", "rk-red"),
  );
  const masterBox = el(
    "div",
    { class: "rk-master" },
    el("span", { class: "rk-mplac" }, "MASTER"),
    master,
  );
  relabel.push(() =>
    attr(
      master,
      "aria-label",
      lang() === "fr" ? "Interrupteur général" : "Master switch",
    ),
  );
  const elecGroup = group(
    "elec",
    masterBox,
    rocker("auxPump", "FUEL\nPUMP"),
    rocker("beacon", "BEACON"),
    rocker("landingLight", "LAND\nLIGHT"),
    rocker("pitotHeat", "PITOT\nHEAT"),
    rocker("avionics", "AVIONICS"),
  );

  // ---------------------------------------------------------------- magneto key
  const keyAng: Record<Magnetos, number> = {
    OFF: -64,
    R: -32,
    L: 0,
    BOTH: 32,
    START: 64,
  };
  const keyBar = svg(
    "g",
    { class: "mag-key" },
    svg("rect", { x: -5, y: -27, width: 10, height: 54, rx: 4 }),
    svg("circle", { cx: 0, cy: 0, r: 8, class: "mag-hub" }),
  );
  const dial = svg(
    "svg",
    { viewBox: "-44 -44 88 88", class: "mag-dial", "aria-hidden": "true" },
    svg("circle", { cx: 0, cy: 0, r: 30, class: "mag-face" }),
    // one index mark per key position on the switch face
    ...MAG_POSITIONS.map((m) =>
      svg("line", {
        x1: 0,
        y1: -33,
        x2: 0,
        y2: -40,
        class: m === "START" ? "mag-tick mag-tick-start" : "mag-tick",
        transform: `rotate(${keyAng[m]})`,
      }),
    ),
    keyBar,
  );
  const magBtns = MAG_POSITIONS.map((m) => {
    const b = el(
      "button",
      {
        class: `mag-pos${m === "START" ? " mag-start" : ""}`,
        type: "button",
        role: "radio",
        "data-m": m,
      },
      m,
    );
    return b;
  });
  const magRow = el(
    "div",
    { class: "mag-row", role: "radiogroup" },
    ...magBtns,
  );
  // START springs back to BOTH: held while pressed; a tap (or Enter) cranks until the engine runs (≤ 6 s)
  let startTimer: number | null = null;
  let startDownAt = 0;
  let pointerStart = false;
  const springBack = () => {
    if (startTimer !== null) window.clearInterval(startTimer);
    startTimer = null;
    if (sim.sw.magnetos === "START") setMagnetos(sim, "BOTH");
  };
  const crankUntilRunning = () => {
    setMagnetos(sim, "START");
    const t0 = performance.now();
    if (startTimer !== null) window.clearInterval(startTimer);
    startTimer = window.setInterval(() => {
      const running = !!sim.sys?.engineRunning && sim.ac.s.rpm > 500;
      if (
        running ||
        performance.now() - t0 > 6000 ||
        sim.sw.magnetos !== "START"
      )
        springBack();
    }, 100);
  };
  magBtns.forEach((b, i) => {
    const m = MAG_POSITIONS[i];
    if (m !== "START") {
      b.addEventListener("click", () => {
        springBack();
        setMagnetos(sim, m);
      });
      return;
    }
    b.addEventListener("pointerdown", (e) => {
      pointerStart = true;
      startDownAt = performance.now();
      b.setPointerCapture?.(e.pointerId);
      if (startTimer !== null) window.clearInterval(startTimer);
      startTimer = null;
      setMagnetos(sim, "START");
    });
    const release = () => {
      if (!pointerStart) return;
      pointerStart = false;
      // a short tap keeps cranking until the engine runs; a long press stops cranking on release
      if (performance.now() - startDownAt < 350) crankUntilRunning();
      else springBack();
    };
    b.addEventListener("pointerup", release);
    b.addEventListener("pointercancel", release);
    b.addEventListener("click", (e) => {
      // keyboard activation (no pointer): crank until the engine runs
      if ((e as MouseEvent).detail === 0) crankUntilRunning();
    });
  });
  magRow.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    stepMagnetos(sim, e.key === "ArrowRight" ? 1 : -1);
    magBtns[MAG_POSITIONS.indexOf(sim.sw.magnetos)]?.focus();
  });
  const syncMag = () => {
    const m = sim.sw.magnetos;
    attr(keyBar, "transform", `rotate(${keyAng[m]})`);
    magBtns.forEach((b, i) => {
      const on = MAG_POSITIONS[i] === m;
      attr(b, "aria-checked", String(on));
      attr(
        b,
        "tabindex",
        on || (m === "START" && MAG_POSITIONS[i] === "BOTH") ? "0" : "-1",
      );
      attr(
        b,
        "aria-label",
        `${switchLabel("magnetos")}: ${switchValue("magnetos", MAG_POSITIONS[i])}`,
      );
    });
    attr(magBtns[4], "title", t("sysp.mag.start"));
    attr(magRow, "aria-label", switchLabel("magnetos"));
  };
  refresh.push(syncMag);
  relabel.push(syncMag);
  // placards stay in English, as on the aircraft (the state words under the controls follow the language)
  const magPlac = el("span", { class: "mag-plac" }, "MAGNETOS");
  group(
    "ign",
    el(
      "div",
      { class: "mag" },
      el("div", { class: "mag-top" }, magPlac, dial),
      magRow,
    ),
  );

  // ---------------------------------------------------------------- push-pull knobs
  /** pull knob (placard above, the shaft shows when pulled). `pulledIs` = the switch value when pulled. */
  const knob = (
    c: PanelToggle,
    placard: string,
    pulledIs: boolean,
    cls = "",
  ) => {
    const k = TOGGLE_KEY[c];
    const hint = el("span", { class: "kn-hint" });
    const b = el(
      "button",
      { class: `kn ${cls}`, type: "button", role: "switch" },
      el("span", { class: "kn-plac" }, placard),
      el(
        "span",
        { class: "kn-body" },
        el("span", { class: "kn-shaft" }),
        el("span", { class: "kn-cap" }),
      ),
      hint,
    );
    b.addEventListener("click", () => toggleControl(sim, c));
    const sync = () => {
      const v = !!sim.sw[k];
      const pulled = v === pulledIs;
      attr(b, "data-pulled", pulled ? "1" : "0");
      attr(b, "aria-checked", String(v));
      txt(hint, switchValue(k, sim.sw[k]));
      aria(b, k);
      attr(
        b,
        "title",
        `${switchLabel(k)} — ${t(pulled ? "sysp.push" : "sysp.pull")}`,
      );
    };
    refresh.push(sync);
    relabel.push(sync);
    return b;
  };

  // ---------------------------------------------------------------- mixture
  const mixIn = el("input", {
    class: "mix-range",
    type: "range",
    min: 0,
    max: 100,
    step: 1,
  });
  const mixVal = el("span", { class: "mix-val" });
  const mixBtn = (label: string, key: string, run: () => void, cls = "") => {
    const b = el("button", { class: `mix-btn ${cls}`, type: "button" }, label);
    b.addEventListener("click", run);
    relabel.push(() => attr(b, "aria-label", t(key)));
    return b;
  };
  const mixCut = mixBtn(
    "CUT-OFF",
    "sysp.mix.cut",
    () => setMixture(sim, 0),
    "mix-end mix-cut",
  );
  const mixMinus = mixBtn(
    "−",
    "sysp.mix.lean",
    () => mixtureStep(sim, -1),
    "mix-step mix-minus",
  );
  const mixPlus = mixBtn(
    "+",
    "sysp.mix.rich",
    () => mixtureStep(sim, 1),
    "mix-step mix-plus",
  );
  const mixRich = mixBtn(
    "RICH",
    "sysp.mix.full",
    () => setMixture(sim, 1),
    "mix-end mix-rich",
  );
  mixIn.addEventListener("input", () =>
    setMixture(sim, Number(mixIn.value) / 100),
  );
  const mix = el(
    "div",
    { class: "mix" },
    el("span", { class: "mix-plac" }, "MIXTURE", mixVal),
    // the vernier on one row (lean − … + rich), the two end stops under it: IDLE CUT-OFF left, FULL RICH right
    el("div", { class: "mix-row" }, mixMinus, mixIn, mixPlus),
    el("div", { class: "mix-ends" }, mixCut, mixRich),
  );
  const syncMix = () => {
    const m = sim.sw.mixture;
    const v = String(Math.round(m * 100));
    if (mixIn.value !== v && document.activeElement !== mixIn) mixIn.value = v;
    mixIn.style.setProperty("--v", `${m * 100}%`);
    txt(mixVal, switchValue("mixture", m));
    attr(mixIn, "aria-label", switchLabel("mixture"));
    attr(mixIn, "aria-valuetext", switchValue("mixture", m));
    attr(root, "data-cutoff", m < 0.06 ? "1" : "0");
  };
  refresh.push(syncMix);
  relabel.push(syncMix);
  group(
    "engine",
    mix,
    knob("cabinHeat", "CABIN\nHEAT", true),
    knob("altStatic", "ALT\nSTATIC", true),
  );

  // ---------------------------------------------------------------- fuel selector + shutoff
  const fAng: Record<FuelSelector, number> = {
    // the handle points at the position it selects (C172S: LEFT at 9 o'clock, BOTH up, RIGHT at 3, OFF down)
    LEFT: -90,
    BOTH: 0,
    RIGHT: 90,
    OFF: 180,
  };
  const handle = svg(
    "g",
    { class: "fs-handle" },
    svg("path", { d: "M-7 10 L-4 -30 L0 -36 L4 -30 L7 10 Z" }),
    svg("circle", { cx: 0, cy: 0, r: 11 }),
  );
  const fdial = svg(
    "svg",
    { viewBox: "-44 -44 88 88", class: "fs-dial", "aria-hidden": "true" },
    svg("circle", { cx: 0, cy: 0, r: 34, class: "fs-face" }),
    handle,
  );
  const fsBtns = FUEL_POSITIONS.map((f) =>
    el(
      "button",
      {
        class: `fs-pos fs-${f.toLowerCase()}`,
        type: "button",
        role: "radio",
        "data-f": f,
      },
      f,
    ),
  );
  fsBtns.forEach((b, i) =>
    b.addEventListener("click", () => setFuelSelector(sim, FUEL_POSITIONS[i])),
  );
  const fs = el(
    "div",
    { class: "fs" },
    el("div", { class: "fs-top" }, el("span", { class: "fs-plac" }, "FUEL\nSELECTOR"), fdial),
    el("div", { class: "fs-row", role: "radiogroup" }, ...fsBtns),
  );
  fs.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = FUEL_POSITIONS.indexOf(sim.sw.fuelSelector);
    const j = (i + (e.key === "ArrowRight" ? 1 : 3)) % 4;
    setFuelSelector(sim, FUEL_POSITIONS[j]);
    fsBtns[j].focus();
  });
  const syncFs = () => {
    const f = sim.sw.fuelSelector;
    attr(handle, "transform", `rotate(${fAng[f]})`);
    fsBtns.forEach((b, i) => {
      const on = FUEL_POSITIONS[i] === f;
      attr(b, "aria-checked", String(on));
      attr(b, "tabindex", on ? "0" : "-1");
      attr(
        b,
        "aria-label",
        `${switchLabel("fuelSelector")}: ${switchValue("fuelSelector", FUEL_POSITIONS[i])}`,
      );
    });
    attr(fs.lastElementChild!, "aria-label", switchLabel("fuelSelector"));
    attr(fs, "data-off", f === "OFF" ? "1" : "0");
  };
  refresh.push(syncFs);
  relabel.push(syncFs);
  group("fuel", fs, knob("fuelShutoff", "FUEL\nSHUTOFF", false, "kn-red"));

  // ---------------------------------------------------------------- trim / AP circuit breaker
  const cbState = el("span", { class: "cb-state" });
  const cb = el(
    "button",
    { class: "cb", type: "button", role: "switch" },
    el("span", { class: "cb-plac" }, "TRIM\nAP"),
    el(
      "span",
      { class: "cb-body" },
      el("span", { class: "cb-collar" }),
      el("span", { class: "cb-cap" }, "5"),
    ),
    cbState,
  );
  cb.addEventListener("click", () => toggleControl(sim, "trimCb"));
  const syncCb = () => {
    const inn = sim.sw.trimCb;
    attr(cb, "data-pulled", inn ? "0" : "1");
    attr(cb, "aria-checked", String(inn));
    txt(cbState, switchValue("trimCb", inn));
    aria(cb, "trimCb");
  };
  refresh.push(syncCb);
  relabel.push(syncCb);
  // the trim / AP breaker sits with the electrical switches (C172S: breaker panel beside the switches)
  elecGroup.querySelector(".sysp-gc")?.append(cb);

  // ---------------------------------------------------------------- live gauges strip (steam cockpit)
  const gaugeEls = new Map<
    GaugeCell["id"],
    { cell: HTMLElement; v: HTMLElement; ptr: HTMLElement }
  >();
  gaugesRow.append(
    ...gaugeStrip(sim).map((c) => {
      const v = el("b", { class: "gz-v" });
      const ptr = el("i", { class: "gz-ptr" });
      const cell = el(
        "div",
        { class: `gz gz-${c.id}`, role: "img" },
        el("span", { class: "gz-l" }, c.label),
        v,
        el("span", { class: "gz-u" }, c.unit),
        el("span", { class: "gz-bar" }, ptr),
      );
      gaugeEls.set(c.id, { cell, v, ptr });
      return cell;
    }),
  );
  let showGauges = opts.gauges !== false;
  gaugesRow.hidden = !showGauges;
  body.append(foldIn);
  const syncGauges = () => {
    if (!showGauges) return;
    for (const c of gaugeStrip(sim)) {
      const g = gaugeEls.get(c.id);
      if (!g) continue;
      txt(g.v, c.value);
      attr(g.cell, "data-level", c.level);
      const left = `${(c.frac * 100).toFixed(1)}%`;
      if (g.ptr.style.left !== left) g.ptr.style.left = left;
      attr(g.cell, "aria-label", `${t(`sysp.g.${c.id}`)} ${c.value} ${c.unit}`);
    }
  };
  refresh.push(syncGauges);

  // ---------------------------------------------------------------- lifecycle
  const relabelAll = () => relabel.forEach((f) => f());
  relabelAll();
  const off = onLangChange(() => {
    stripSig = "";
    relabelAll();
  });
  host.append(root);
  const update = () => {
    if (root.hidden || !root.isConnected) return;
    for (const f of refresh) f();
  };
  update();
  // stop the START timer and the language listener if the host removes the panel
  const mo =
    typeof MutationObserver !== "undefined"
      ? new MutationObserver(() => {
          if (!root.isConnected) {
            off();
            springBack();
            mo?.disconnect();
          }
        })
      : null;
  mo?.observe(host, { childList: true });
  return {
    el: root,
    update,
    setVisible(v: boolean) {
      root.hidden = !v;
      if (v) update();
    },
    setGauges(v: boolean) {
      showGauges = v;
      gaugesRow.hidden = !v;
      update();
    },
  };
}

/** lit-annunciator check for other UI (e.g. a status chip) */
export const annunciatorLit = (sim: PanelSim, a: Annunciator) =>
  !!sim.sys?.annunciators.includes(a);
