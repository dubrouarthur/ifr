// Ground school player (package E) — a calculation step ("Maths for IFR / VFR"): the prompt with its givens, a
// numeric answer with its unit (the student may switch to another unit of the same kind), extra parts (headwind
// AND crosswind, TO / FROM…), Check, the verdict that names the likely mistake, the worked solution revealed one
// step at a time, the rule of thumb AND the exact formula, the sources, and "New numbers" (a new seed).
// The stage (diagram or live instrument) is the player's: it is told about each new problem (onProblem).
// Calc results are practice: never ACS-graded.
import type {
  CalcProblem,
  CalcResponse,
  CalcSpec,
  CalcUnit,
  CalcVerdict,
  DiagramSpec,
  CalcStageHint,
  L10n,
  Lang,
} from "../types";
import { answerIn, checkAnswer, problemFor } from "../calc";
import { newSeed } from "../calc/rng";
import { hasCalcDiagram } from "../stage/calcKinds";
import { FMT } from "../calc/text";
import { unitDigits, unitsLike } from "../calc/units";
import {
  btn,
  formulaCard,
  h,
  L,
  ps,
  richEl,
  textEl,
  icon,
} from "./reader";

// ------------------------------------------------------------------ pure helpers (unit-tested)
/**
 * A number as a pilot types it, in either language: "1,500" / "1 500" (thousands), "1,5" / "1.5" (decimals),
 * "−3" / "-3", "+5", "090". Returns NaN for anything else (letters, two decimal marks, empty).
 */
export function parseNumber(raw: string, lang: Lang = "en"): number {
  let s = String(raw ?? "")
    .trim()
    .replace(/[−–—]/g, "-")
    .replace(/[\s  ]/g, "")
    .replace(/[°%]$/u, "");
  if (!s) return NaN;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // the last mark is the decimal one
    const dec = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const th = dec === "," ? "." : ",";
    s = s.split(th).join("");
    if (dec === ",") s = s.replace(",", ".");
  } else if (hasComma) {
    // "1,500" in English is a thousands group; "1,5" (or any FR comma) is a decimal comma
    const grouped = /^[-+]?\d{1,3}(,\d{3})+$/.test(s);
    s = grouped && lang === "en" ? s.split(",").join("") : s.replace(",", ".");
  }
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}

/** what a pilot may type after a number for each unit (case-insensitive): "1 200 ft", "95 kt", "29.92 inHg" */
const UNIT_ALIASES: Partial<Record<CalcUnit, string[]>> = {
  deg: ["°", "deg", "degrees", "degrés"],
  NM: ["nm", "nmi"],
  SM: ["sm", "mi"],
  km: ["km"],
  m: ["m", "metres", "meters", "mètres"],
  ft: ["ft", "feet", "pieds", "'"],
  kt: ["kt", "kts", "knots", "kn", "nœuds", "noeuds", "nd"],
  kmh: ["km/h", "kmh"],
  mph: ["mph"],
  fpm: ["fpm", "ft/min", "ft/mn", "pi/min"],
  ftPerNm: ["ft/nm"],
  pct: ["%"],
  usgal: ["gal", "usgal", "us gal", "gal us"],
  L: ["l", "litres", "liters"],
  lb: ["lb", "lbs"],
  kg: ["kg"],
  gph: ["gph", "gal/h"],
  lph: ["l/h"],
  inHg: ["inhg", "in hg", '"'],
  hPa: ["hpa", "mb", "mbar"],
  degC: ["°c", "c", "° c"],
  degF: ["°f", "f", "° f"],
  in: ["in", '"'],
  lbIn: ["lb·in", "lb.in", "lbin", "lb in"],
  s: ["s", "sec"],
  min: ["min", "mn"],
  h: ["h"],
};
const TIME_UNITS: readonly CalcUnit[] = ["s", "min", "h"];

/**
 * A duration as a pilot types it, in the asked time unit: "0:45" / "1:15" (m:ss for seconds and minutes, h:mm for
 * hours), "1:25:00", "23 min 30 s", "1 h 25", "45 s", "1h25". Null when it is not a duration with a separator or a
 * unit (a plain number goes through parseNumber).
 */
export function parseDuration(raw: string, unit: CalcUnit): number | null {
  if (!TIME_UNITS.includes(unit)) return null;
  const s = String(raw ?? "").trim().toLowerCase().replace(/[\s\u00a0\u202f]+/g, " ");
  if (!s) return null;
  const toUnit = (sec: number) => (unit === "s" ? sec : unit === "min" ? sec / 60 : sec / 3600);
  const c = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(s);
  if (c) {
    const a = Number(c[1]);
    const b = Number(c[2]);
    if (b >= 60 || (c[3] !== undefined && Number(c[3]) >= 60)) return null;
    if (c[3] !== undefined) return toUnit(a * 3600 + b * 60 + Number(c[3]));
    return toUnit(unit === "h" ? a * 3600 + b * 60 : a * 60 + b);
  }
  const re = /(\d+(?:[.,]\d+)?) ?(h|min|mn|sec|s|')?(?: |$)?/y;
  let sec = 0;
  let prev: "h" | "min" | "s" | null = null;
  let explicit = false;
  let i = 0;
  while (i < s.length) {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m || m.index !== i || m[0] === "") return null;
    const v = Number(m[1].replace(",", "."));
    const u: "h" | "min" | "s" | null = m[2] === "h" ? "h" : m[2] === "min" || m[2] === "mn" || m[2] === "'" ? "min" : m[2] === "s" || m[2] === "sec" ? "s" : prev === "h" ? "min" : prev === "min" ? "s" : null;
    if (!u) return null;
    if (m[2]) explicit = true;
    sec += v * (u === "h" ? 3600 : u === "min" ? 60 : 1);
    prev = u;
    i = re.lastIndex;
  }
  return explicit ? toUnit(sec) : null;
}

/** The answer box: a duration in the asked time unit, or a number with the asked unit's symbol allowed after it. */
export function parseAnswer(raw: string, lang: Lang = "en", unit?: CalcUnit): number {
  if (unit) {
    const d = parseDuration(raw, unit);
    if (d !== null) return d;
    let s = String(raw ?? "").trim();
    const low = s.toLowerCase();
    // the longest alias first ("ft/min" before "ft")
    const al = [...(UNIT_ALIASES[unit] ?? [])].sort((a, b) => b.length - a.length);
    for (const a of al) {
      if (low.endsWith(a) && /[\d.,\s\u00a0\u202f]$/.test(s.slice(0, s.length - a.length) || "x")) {
        s = s.slice(0, s.length - a.length);
        break;
      }
    }
    return parseNumber(s, lang);
  }
  return parseNumber(raw, lang);
}

/** Decimals to show for a value with this unit and tolerance (a pilot's rounding, never fewer than the tolerance needs). */
export function digitsFor(unit: CalcUnit, tolerance = 1): number {
  const tolDigits =
    tolerance > 0 && tolerance < 1
      ? Math.min(3, Math.ceil(-Math.log10(tolerance) - 1e-9))
      : 0;
  return Math.max(unitDigits(unit), tolDigits);
}
/** decimals of a given number as written (up to 2) */
function ownDigits(v: number): number {
  if (Number.isInteger(v)) return 0;
  return Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? 1 : 2;
}

export interface CalcUiState {
  seed: number;
  /** the answer box, as typed */
  input: string;
  /** the unit the student answers in (default: the step's unit, else the generator's) */
  unit?: CalcUnit;
  /** extra parts, as typed / chosen */
  parts: Record<string, string>;
  /** Check presses on this problem */
  checks: number;
  verdict?: CalcVerdict;
  response?: CalcResponse;
  /** worked-solution steps shown (0 = closed) */
  shown: number;
  /** the hint (rule of thumb) is open */
  hint?: boolean;
}
/** A fresh state: the CFI's fixed seed, the seed being restored, or a new one. */
export function newCalcState(spec: CalcSpec, seed?: number): CalcUiState {
  return {
    seed: spec.seed ?? seed ?? newSeed(),
    input: "",
    parts: {},
    checks: 0,
    shown: 0,
  };
}
/** "New numbers" is offered: by default only when the seed is not fixed by the CFI. */
export const canRetry = (spec: CalcSpec): boolean =>
  spec.retry ?? spec.seed === undefined;
export const solutionMode = (
  spec: CalcSpec,
): NonNullable<CalcSpec["showSolution"]> => spec.showSolution ?? "onCheck";
/** the unit the answer box asks for */
export const askedUnit = (problem: CalcProblem, spec: CalcSpec): CalcUnit =>
  answerIn(problem, spec.unit).unit;

export type ReadResult =
  | { ok: true; response: CalcResponse }
  | { ok: false; field: string };
/** Read the typed answer and parts into a CalcResponse (`field` names the first box that is not a number). */
export function readResponse(
  problem: CalcProblem,
  spec: CalcSpec,
  st: CalcUiState,
  lang: Lang,
): ReadResult {
  const unit = st.unit ?? askedUnit(problem, spec);
  const answer = parseAnswer(st.input, lang, unit);
  if (!Number.isFinite(answer)) return { ok: false, field: "answer" };
  const response: CalcResponse = { answer };
  if (unit !== problem.unit) response.unit = unit;
  const parts: Record<string, number | string> = {};
  for (const p of problem.parts ?? []) {
    const raw = st.parts[p.key] ?? "";
    if (p.choices?.length || typeof p.answer === "string") {
      if (!raw) return { ok: false, field: p.key };
      parts[p.key] = raw;
    } else {
      const v = parseAnswer(raw, lang, p.unit);
      if (!Number.isFinite(v)) return { ok: false, field: p.key };
      parts[p.key] = v;
    }
  }
  if (problem.parts?.length) response.parts = parts;
  return { ok: true, response };
}

/** The expected answer as the pilot writes it, in the asked unit, and the accepted tolerance. */
export function answerText(
  problem: CalcProblem,
  spec: CalcSpec,
  lang: Lang,
): { answer: string; tolerance: string } {
  const f = FMT[lang];
  const a = answerIn(problem, spec.unit);
  const tol = spec.tolerance ?? a.tolerance;
  const d = digitsFor(a.unit, tol);
  const answer =
    a.unit === problem.unit && problem.answerText
      ? L(problem.answerText, lang)
      : f.u(a.answer, a.unit, d);
  return { answer, tolerance: f.u(tol, a.unit, digitsFor(a.unit, tol)) };
}
const DIRECTION_KEY = /^(course|crs|hdg|heading|radial|inbound|outbound|bearing|brg|track|trk|tc|th|mc|mh|ch|qdm|qdr|windDir|wdir|rwy|runway|inboundHdg|mag|true)/i;
/** A given as printed in the givens table (strings without a display form are internal switches: hidden). */
export function givenText(
  g: CalcProblem["givens"][number],
  lang: Lang,
): string | null {
  if (g.display) return L(g.display, lang);
  if (typeof g.value === "string") return null;
  // courses, headings, radials and bearings are written with three digits (095°), angles are not (3.5°)
  if (g.unit === "deg" && DIRECTION_KEY.test(g.key) && Number.isInteger(g.value))
    return `${String(((g.value % 360) + 360) % 360 || 360).padStart(3, "0")}°`;
  return FMT[lang].u(g.value, g.unit ?? "none", ownDigits(g.value));
}

/** What the stage shows for a problem: its live instrument, its diagram, both, or nothing. */
export type CalcStageView =
  | { kind: "hint"; hint: CalcStageHint }
  | { kind: "diagram"; d: DiagramSpec }
  /** a diagram that would give the answer away: covered until the student checks (or asks to see it) */
  | { kind: "covered"; d: DiagramSpec }
  | null;
/**
 * The stage of a calc step. A generator's diagram draws the solution (the 60:1 triangle with its error, the wind
 * triangle with its WCA), so before the first Check the stage shows the live instrument (the situation on the
 * panel), or a covered diagram; once `revealed`, the diagram, beside the instrument when the stage is `wide`.
 */
export function calcStageView(problem: CalcProblem, spec: CalcSpec, revealed = true, wide = true): CalcStageView {
  if (spec.stage === "none") return null;
  // only a diagram the stage can draw: never a cover over an empty placeholder (the reader-only layout instead)
  const pd = problem.diagram;
  const d = pd && (pd.kind !== "calc" || hasCalcDiagram(pd.calc.kind)) ? pd : undefined;
  const st = problem.stage;
  if (st && d) {
    if (!revealed) return { kind: "hint", hint: st };
    return wide ? { kind: "hint", hint: { ...st, panes: [{ kind: "diagram", d }, st.panes[0]] } } : { kind: "diagram", d };
  }
  if (st) return { kind: "hint", hint: st };
  if (d) return revealed ? { kind: "diagram", d } : { kind: "covered", d };
  return null;
}
/** The student has seen the answer's method (checked once, or opened the solution). */
export const calcRevealed = (st: CalcUiState | undefined): boolean => !!st && (st.checks > 0 || st.shown > 0);

/** The givens table of a problem (null when it has none to show). */
export function givensTable(p: CalcProblem, lang: Lang): HTMLElement | null {
  const rows: { label: string; v: string }[] = [];
  // the wind is one given as a pilot writes it ("Wind 290°/21 kt"), not a direction row and a speed row
  const dir = p.givens.find((g) => g.key === "windDir" && typeof g.value === "number");
  const spd = p.givens.find((g) => g.key === "windKt" && typeof g.value === "number");
  const merged = dir && spd;
  for (const g of p.givens) {
    if (merged && g === spd) continue;
    if (merged && g === dir) {
      const d = String(((Number(dir.value) % 360) + 360) % 360 || 360).padStart(3, "0");
      rows.push({ label: lang === "fr" ? "Vent" : "Wind", v: `${d}°/${FMT[lang].u(Number(spd.value), "kt", 0)}` });
      continue;
    }
    const v = givenText(g, lang);
    if (v !== null) rows.push({ label: L(g.label, lang), v });
  }
  if (!rows.length) return null;
  return h(
    "div",
    { class: "cp-givens", role: "table", "aria-label": ps("givens", lang) },
    // the table's name is its aria-label: the visible heading is decoration for screen readers (no caption role
    // among the rows, which a table does not allow)
    h("div", { class: "cp-label", "aria-hidden": "true" }, ps("givens", lang)),
    ...rows.map(({ label, v }) => h("div", { class: "g", role: "row" }, h("span", { role: "rowheader" }, label), h("b", { role: "cell", class: "num" }, v))),
  );
}

let formN = 0;
/** The answer box (number + unit menu) and the extra parts; typing writes into `st` (inputs, unit, parts). */
export function answerForm(
  p: CalcProblem,
  spec: CalcSpec,
  st: CalcUiState,
  lang: Lang,
  hooks: { onEnter?: () => void; onChange?: () => void; disabled?: boolean } = {},
): { el: HTMLElement; input: HTMLInputElement; err: HTMLDivElement } {
  const id = `cp-ans-${++formN}`;
  const box = h("div", { class: "cp-form" });
  const enter = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      hooks.onEnter?.();
    }
  };
  const input = h("input", { id, class: "cp-input num", type: "text", inputmode: "decimal", autocomplete: "off", spellcheck: "false", "aria-describedby": `${id}-err` });
  input.value = st.input;
  input.disabled = !!hooks.disabled;
  input.addEventListener("input", () => {
    st.input = input.value;
    hooks.onChange?.();
  });
  input.addEventListener("keydown", enter);
  const unit = st.unit ?? askedUnit(p, spec);
  const units = unitsLike(unit);
  const ph = (u: CalcUnit) => (u === "s" ? "m:ss" : u === "min" ? (lang === "fr" ? "min ou m:ss" : "min or m:ss") : u === "h" ? "h:mm" : "");
  input.placeholder = ph(unit);
  let unitEl: HTMLElement;
  if (units.length > 1) {
    const sel = h("select", { class: "cp-unit", "aria-label": ps("unit", lang) });
    for (const u of units) {
      const o = h("option", { value: u }, FMT[lang].unit(u) || u);
      if (u === unit) o.selected = true;
      sel.append(o);
    }
    sel.disabled = !!hooks.disabled;
    sel.addEventListener("change", () => {
      st.unit = sel.value as CalcUnit;
      input.placeholder = ph(st.unit);
      hooks.onChange?.();
    });
    unitEl = sel;
  } else unitEl = h("span", { class: "cp-unit static" }, FMT[lang].unit(unit));
  const main = h("div", { class: "cp-answer" }, h("label", { for: id, class: "cp-label" }, p.answerLabel ? L(p.answerLabel, lang) : ps("yourAnswer", lang)), h("div", { class: "cp-field" }, input, unitEl));
  box.append(main);
  for (const part of p.parts ?? []) {
    const label = h("span", { class: "cp-label" }, L(part.label, lang));
    if (part.choices?.length) {
      const seg = h("div", { class: "cp-seg", role: "radiogroup", "aria-label": L(part.label, lang) });
      for (const c of part.choices) {
        const b = h("button", { type: "button", role: "radio", class: "cp-segb", "aria-checked": String(st.parts[part.key] === c.value) }, L(c.label, lang));
        b.disabled = !!hooks.disabled;
        b.addEventListener("click", () => {
          st.parts[part.key] = c.value;
          for (const x of seg.querySelectorAll("button")) x.setAttribute("aria-checked", String(x === b));
          hooks.onChange?.();
        });
        seg.append(b);
      }
      box.append(h("div", { class: "cp-answer part" }, label, seg));
      continue;
    }
    // a signed part (WCA "+ right, − left"): phone decimal pads have no minus key, so the text keyboard
    const signed = /[+−]/.test(part.label.en);
    const inp = h("input", { class: "cp-input num", type: "text", inputmode: signed ? "text" : "decimal", autocomplete: "off", "aria-label": L(part.label, lang) });
    if (part.unit && TIME_UNITS.includes(part.unit)) inp.placeholder = ph(part.unit);
    inp.value = st.parts[part.key] ?? "";
    inp.disabled = !!hooks.disabled;
    inp.addEventListener("input", () => {
      st.parts[part.key] = inp.value;
      hooks.onChange?.();
    });
    inp.addEventListener("keydown", enter);
    box.append(h("div", { class: "cp-answer part" }, label, h("div", { class: "cp-field" }, inp, part.unit ? h("span", { class: "cp-unit static" }, FMT[lang].unit(part.unit)) : null)));
  }
  // the fields in the order the question asks them ("your ground speed, and the time for the leg")
  if (p.partsFirst) box.append(main);
  const err = h("div", { class: "cp-err", id: `${id}-err`, role: "alert" });
  err.hidden = true;
  box.append(err);
  // `input` is the field focus goes to: the first one shown
  const first = p.partsFirst ? (box.querySelector<HTMLInputElement>("input.cp-input") ?? input) : input;
  return { el: box, input: first, err };
}

// ------------------------------------------------------------------ the widget
export interface CalcCheckEvent {
  problem: CalcProblem;
  response: CalcResponse;
  verdict: CalcVerdict;
  /** the first Check on this problem (the attempt the player records) */
  first: boolean;
  solutionSteps: number;
}
export interface CalcEnv {
  lang: Lang;
  /** restore (language switch, Back / Next) */
  state?: CalcUiState | null;
  /** an inline quiz in the reader / on a slide: no title, tighter */
  compact?: boolean;
  /** overrides the generator's prompt (a calc quiz) */
  prompt?: L10n;
  /** shown under the verdict once answered (a calc quiz) */
  explain?: L10n;
  onProblem?(p: CalcProblem): void;
  onCheck?(e: CalcCheckEvent): void;
  onState?(s: CalcUiState): void;
  /** a live announcement (the player's aria-live region) */
  announce?(text: string): void;
}

export class CalcView {
  readonly el: HTMLDivElement;
  private st: CalcUiState;
  private _problem!: CalcProblem;
  private lang: Lang;
  private input!: HTMLInputElement;
  private verdictEl!: HTMLDivElement;
  private solEl!: HTMLDivElement;
  private actions!: HTMLDivElement;
  private hintEl!: HTMLDivElement;
  private errEl!: HTMLDivElement;

  constructor(
    readonly spec: CalcSpec,
    private env: CalcEnv,
  ) {
    this.lang = env.lang;
    this.st = env.state ? structuredClone(env.state) : newCalcState(spec);
    this.el = h("div", { class: `cp-calc${env.compact ? " compact" : ""}` });
    this.build();
  }
  get problem(): CalcProblem {
    return this._problem;
  }
  get state(): CalcUiState {
    return structuredClone(this.st);
  }
  /** the footer Hint: the rule of thumb */
  get hintText(): L10n {
    return this._problem.ruleOfThumb;
  }
  toggleHint(on?: boolean) {
    this.st.hint = on ?? !this.st.hint;
    this.hintEl.hidden = !this.st.hint;
    this.emitState();
  }
  /** a new problem (New numbers) */
  newNumbers() {
    if (!canRetry(this.spec)) return;
    let seed = newSeed();
    if (seed === this.st.seed) seed = (seed + 1) >>> 0;
    this.st = {
      ...newCalcState({ ...this.spec, seed: undefined }, seed),
      unit: this.st.unit,
    };
    this.build();
    this.emitState();
    this.input.focus();
  }
  focus() {
    this.input?.focus();
  }

  // ---------------- build
  private build() {
    const lang = this.lang;
    const spec = this.spec;
    this._problem = problemFor(spec, this.st.seed);
    const p = this._problem;
    this.el.replaceChildren();
    // prompt + givens
    this.el.append(
      richEl(
        this.env.prompt ?? p.prompt,
        lang,
        undefined,
        "cp-rich cp-calc-prompt",
      ),
    );
    const giv = givensTable(p, lang);
    if (giv) this.el.append(giv);
    if (spec.seed !== undefined && !this.env.compact)
      this.el.append(h("p", { class: "cp-seed" }, ps("fixedSeed", lang)));
    // answer box
    const form = answerForm(p, spec, this.st, lang, {
      onEnter: () => this.check(),
      onChange: () => {
        this.errEl.hidden = true;
        this.emitState();
      },
    });
    this.input = form.input;
    this.errEl = form.err;
    this.el.append(form.el);
    // actions
    this.actions = h("div", { class: "cp-calc-actions" });
    this.el.append(this.actions);
    // hint, verdict, solution
    this.hintEl = h(
      "div",
      { class: "cp-hintcard" },
      icon("bulb"),
      h(
        "div",
        {},
        h("div", { class: "cp-label" }, ps("ruleOfThumb", lang)),
        richEl(p.ruleOfThumb, lang),
      ),
    );
    this.hintEl.hidden = !this.st.hint;
    this.verdictEl = h("div", { class: "cp-verdict", "aria-live": "polite" });
    this.solEl = h("div", { class: "cp-solution" });
    this.el.append(this.hintEl, this.verdictEl, this.solEl);
    this.syncActions();
    this.syncVerdict(false);
    this.syncSolution();
    this.env.onProblem?.(p);
  }
  private syncActions() {
    const lang = this.lang;
    const a = this.actions;
    a.replaceChildren();
    a.append(
      btn(
        this.st.checks && !this.st.verdict?.ok
          ? ps("checkAgain", lang)
          : ps("check", lang),
        "primary",
        () => this.check(),
      ),
    );
    const mode = solutionMode(this.spec);
    if (mode === "onRequest" && this.st.shown === 0 && this.st.checks > 0)
      a.append(
        btn(ps("showSolution", lang), "quiet", () => this.openSolution()),
      );
    if (this.st.checks > 0 && canRetry(this.spec))
      a.append(
        btn(
          ps("newNumbers", lang),
          "ghost",
          () => this.newNumbers(),
          "refresh",
        ),
      );
  }

  // ---------------- check
  check() {
    const lang = this.lang;
    const p = this._problem;
    const r = readResponse(p, this.spec, this.st, lang);
    if (!r.ok) {
      this.errEl.textContent = ps("numberInvalid", lang);
      this.errEl.hidden = false;
      return;
    }
    let verdict: CalcVerdict;
    try {
      verdict = checkAnswer(p, r.response, this.spec);
    } catch {
      verdict = { ok: false };
    }
    const first = this.st.checks === 0;
    this.st.checks++;
    this.st.verdict = verdict;
    this.st.response = r.response;
    if (solutionMode(this.spec) === "onCheck" && this.st.shown === 0)
      this.st.shown = verdict.ok ? p.solutionSteps.length : 1;
    if (verdict.ok && this.st.shown > 0) this.st.shown = p.solutionSteps.length;
    this.syncActions();
    this.syncVerdict(true);
    this.syncSolution();
    this.emitState();
    this.verdictEl.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    this.env.onCheck?.({
      problem: p,
      response: r.response,
      verdict,
      first,
      solutionSteps: this.st.shown,
    });
  }
  private syncVerdict(announce: boolean) {
    const lang = this.lang;
    const v = this.st.verdict;
    const el = this.verdictEl;
    el.replaceChildren();
    el.className = "cp-verdict";
    if (!v) return;
    const a = answerText(this._problem, this.spec, lang);
    el.classList.add(v.ok ? "ok" : "bad");
    const head = h(
      "div",
      { class: "vh" },
      icon(v.ok ? "check" : "info"),
      h("b", {}, v.ok ? ps("correct", lang) : ps("notQuite", lang)),
    );
    if (v.ok) head.append(h("span", { class: "num" }, ` · ${a.answer}`));
    el.append(head);
    if (!v.ok && v.mistake) el.append(textEl("p", mistakeText(v.mistake.text, lang), lang));
    const parts = this._problem.parts ?? [];
    if (!v.ok && parts.length && v.parts)
      el.append(
        h(
          "ul",
          { class: "cp-partv" },
          h(
            "li",
            {
              class:
                Number.isFinite(v.error ?? NaN) &&
                Math.abs(v.error ?? 0) <=
                  (this.spec.tolerance ?? this._problem.tolerance) + 1e-9
                  ? "ok"
                  : "bad",
            },
            ps("yourAnswer", lang),
          ),
          ...parts.map((pt) =>
            h(
              "li",
              { class: v.parts![pt.key] ? "ok" : "bad" },
              L(pt.label, lang),
            ),
          ),
        ),
      );
    if (
      this.env.explain &&
      (v.ok || this.st.shown >= this._problem.solutionSteps.length)
    )
      el.append(richEl(this.env.explain, lang));
    if (announce)
      this.env.announce?.(
        v.ok
          ? `${ps("correct", lang)}: ${a.answer}`
          : `${ps("notQuite", lang)}. ${v.mistake ? L(v.mistake.text, lang) : ""}`,
      );
  }

  // ---------------- solution
  private openSolution() {
    this.st.shown = Math.max(1, this.st.shown);
    this.syncActions();
    this.syncSolution();
    this.syncVerdict(false);
    this.emitState();
  }
  private more(all = false) {
    const n = this._problem.solutionSteps.length;
    this.st.shown = all ? n : Math.min(n, this.st.shown + 1);
    this.syncSolution();
    this.syncVerdict(false);
    this.emitState();
  }
  private syncSolution() {
    const lang = this.lang;
    const p = this._problem;
    const el = this.solEl;
    el.replaceChildren();
    if (this.st.shown <= 0 || solutionMode(this.spec) === "never") {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const n = p.solutionSteps.length;
    const shown = Math.min(n, this.st.shown);
    const ol = h("ol", { class: "cp-steps" });
    p.solutionSteps.slice(0, shown).forEach((s, i) => {
      const li = h("li", {
        class: i === shown - 1 && shown < n ? "cp-in" : "",
      });
      li.append(richEl(s, lang));
      ol.append(li);
    });
    el.append(
      h(
        "div",
        { class: "hd" },
        h("span", { class: "cp-label" }, ps("solution", lang)),
        h("span", { class: "cp-label soft num" }, `${shown} / ${n}`),
      ),
      ol,
    );
    if (shown < n) {
      el.append(
        h(
          "div",
          { class: "cp-sol-more" },
          btn(
            ps("nextSolutionStep", lang),
            "sm",
            () => this.more(),
            "next",
            true,
          ),
          btn(ps("showAll", lang), "sm ghost", () => this.more(true)),
        ),
      );
      return;
    }
    // the answer, the exact value, the rule of thumb and the formula
    const a = answerText(p, this.spec, lang);
    const exact =
      p.exact !== undefined && Math.abs(p.exact - p.answer) > 1e-9
        ? ps("exactValue", lang, {
            v: FMT[lang].u(
              answerIn({ ...p, answer: p.exact }, this.spec.unit).answer,
              askedUnit(p, this.spec),
              digitsFor(
                askedUnit(p, this.spec),
                (this.spec.tolerance ?? p.tolerance) / 10,
              ),
            ),
          })
        : undefined;
    el.append(
      h(
        "div",
        { class: "cp-final" },
        h(
          "span",
          { class: "cp-label" },
          ps("answerLabel", lang),
        ),
        h("b", { class: "num" }, a.answer),
        h(
          "span",
          { class: "cp-muted" },
          ps("accepted", lang, { t: a.tolerance }),
        ),
      ),
    );
    // the other parts of the answer (a track error with the heading, the DME with the distance…)
    for (const part of p.parts ?? []) {
      const val =
        typeof part.answer === "number"
          ? FMT[lang].u(part.answer, part.unit ?? "none", part.tolerance !== undefined ? digitsFor(part.unit ?? "none", part.tolerance) : ownDigits(part.answer))
          : L(part.choices?.find((c) => c.value === part.answer)?.label ?? { en: String(part.answer) }, lang);
      el.append(
        h(
          "div",
          { class: "cp-final part" },
          h("span", { class: "cp-label" }, L(part.label, lang)),
          h("b", { class: "num" }, val),
          typeof part.answer === "number" && part.tolerance !== undefined
            ? h("span", { class: "cp-muted" }, ps("accepted", lang, { t: FMT[lang].u(part.tolerance, part.unit ?? "none", digitsFor(part.unit ?? "none", part.tolerance)) }))
            : null,
        ),
      );
    }
    const showRot = this.spec.showRuleOfThumb !== false;
    const showF = this.spec.showFormula !== false;
    if (showRot || showF)
      el.append(
        formulaCard(
          showF ? p.formula : undefined,
          showRot ? p.ruleOfThumb : undefined,
          p.refs,
          lang,
          showF ? exact : undefined,
        ),
      );
  }
  private emitState() {
    this.env.onState?.(this.state);
  }
}

/** A mistake's text without a leading "Not quite." (the verdict headline already says it). */
export function mistakeText(text: L10n, lang: Lang): L10n {
  const strip = (x: string | undefined, lead: string) => (x && x.startsWith(lead) ? x.slice(lead.length).replace(/^[\s.:,;]+/, "") : x);
  const en = strip(text.en, "Not quite") ?? text.en;
  const fr = strip(text.fr, "Pas tout à fait");
  void lang;
  return { en: en || text.en, fr: fr || text.fr };
}
/** "about 1 400 ft/min" when the problem has an answer text, else the number (handout, drill review). */
export function responseText(
  problem: CalcProblem,
  response: CalcResponse | undefined,
  lang: Lang,
): string {
  if (!response) return "—";
  const unit = response.unit ?? problem.unit;
  return FMT[lang].u(
    response.answer,
    unit,
    Math.max(ownDigits(response.answer), 0),
  );
}
