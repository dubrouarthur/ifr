// Check catalogue of the procedures mode: every machine-checkable condition a checklist item can carry
// (procedureTypes.ts CheckRef), with
//   - label(p, lang): the plain-language condition, e.g. 'Mixture — IDLE CUT-OFF' / 'Mélange — ÉTOUFFOIR'
//   - params: a schema the procedure editor turns into form fields (enum / number / boolean / string)
//   - evaluate(view, p, ctx): is the condition true right now? (pure, reads a ProcSimView only)
//   - holdS(p): how long it must stay true to count (flight-path checks: 'ias', 'pitchAtt', ...)
//   - kind: 'action' (a switch / control / avionics setting the pilot changes), 'path' (attitude / airspeed held),
//     'outcome' (on the ground) or 'manual' (the student taps Done or the instructor confirms).
// The runner (procedures.ts) adds stickiness, order, memory and time limits on top.
import type { CheckId, CheckRef, Lang } from "./procedureTypes";
import type { ProcSimView } from "./procedures";
import { ANNUNCIATOR_LEVEL, type Annunciator, type Switches } from "../sim/systemsTypes";

export type ParamValue = string | number | boolean;
type L10n = Record<Lang, string>;

export interface CheckParamOption {
  value: string | number | boolean;
  label: L10n;
}

export interface CheckParam {
  name: string;
  type: "enum" | "number" | "boolean" | "string";
  label: L10n;
  default: ParamValue;
  options?: CheckParamOption[];
  /** options that depend on other parameters (e.g. the 'value' of a 'switch' check depends on its 'key') */
  optionsFor?: (p: Record<string, ParamValue>) => CheckParamOption[] | null;
  /** the field only applies when this returns true (e.g. 'op' only for the mixture) */
  showIf?: (p: Record<string, ParamValue>) => boolean;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  optional?: boolean;
  /** must be given explicitly (the default only pre-fills the editor): e.g. which switch and which position */
  required?: boolean;
}

export interface CheckCtx {
  /** sim time of the failure (s) */
  failedAtS: number;
  /** seconds since the failure */
  elapsedS: number;
}

export type CheckKind = "action" | "path" | "outcome" | "manual";

export interface CheckDef {
  id: CheckId;
  kind: CheckKind;
  name: L10n;
  params: CheckParam[];
  label(p: Record<string, ParamValue> | undefined, lang: Lang): string;
  evaluate(
    view: ProcSimView,
    p: Record<string, ParamValue> | undefined,
    ctx: CheckCtx,
  ): boolean;
  /** seconds the condition must stay true (0 = instantaneous) */
  holdS(p: Record<string, ParamValue> | undefined): number;
}

// ------------------------------------------------------------------ switch vocabulary (C172S placards)
export const SWITCH_NAMES: Record<keyof Switches, L10n> = {
  batMaster: { en: "Master switch (BAT)", fr: "Interrupteur général (BAT)" },
  altMaster: { en: "Master switch (ALT)", fr: "Alternateur (ALT)" },
  avionics: { en: "Avionics switch (bus 1)", fr: "Interrupteur avionique (barre 1)" },
  avionics2: { en: "Avionics bus 2", fr: "Avionique barre 2" },
  stbyBatt: { en: "STBY BATT switch", fr: "Interrupteur STBY BATT" },
  auxPump: { en: "Auxiliary fuel pump", fr: "Pompe carburant électrique" },
  magnetos: { en: "Magnetos", fr: "Magnétos" },
  mixture: { en: "Mixture", fr: "Mélange" },
  fuelSelector: { en: "Fuel selector", fr: "Sélecteur carburant" },
  fuelShutoff: { en: "Fuel shutoff valve", fr: "Robinet coupe-feu carburant" },
  pitotHeat: { en: "Pitot heat", fr: "Réchauffage pitot" },
  altStatic: { en: "Alternate static air", fr: "Prise statique de secours" },
  trimCb: {
    en: "Trim / autopilot circuit breaker",
    fr: "Disjoncteur trim / PA",
  },
  cabinHeat: { en: "Cabin heat and air", fr: "Chauffage et aération cabine" },
  landingLight: { en: "Landing light", fr: "Phare d’atterrissage" },
  beacon: { en: "Beacon", fr: "Feu anticollision" },
};
export const SWITCH_KEYS = Object.keys(SWITCH_NAMES) as (keyof Switches)[];

const onOff: CheckParamOption[] = [
  { value: true, label: { en: "ON", fr: "ON" } },
  { value: false, label: { en: "OFF", fr: "OFF" } },
];
/** placard words for boolean switches whose ON/OFF reads differently */
const BOOL_WORDS: Partial<Record<keyof Switches, [L10n, L10n]>> = {
  fuelShutoff: [
    { en: "ON (push in)", fr: "OUVERT (poussé)" },
    { en: "OFF (pull out)", fr: "FERMÉ (tiré)" },
  ],
  altStatic: [
    { en: "ON (pull)", fr: "OUVERTE (tirée)" },
    { en: "OFF (push)", fr: "FERMÉE (poussée)" },
  ],
  trimCb: [
    { en: "IN", fr: "ENFONCÉ" },
    { en: "PULL", fr: "TIRÉ" },
  ],
  cabinHeat: [
    { en: "ON", fr: "OUVERTS" },
    { en: "OFF", fr: "FERMÉS" },
  ],
  stbyBatt: [
    { en: "ARM", fr: "ARM" },
    { en: "OFF", fr: "OFF" },
  ],
};
const ENUM_VALUES: Partial<Record<keyof Switches, CheckParamOption[]>> = {
  magnetos: [
    { value: "BOTH", label: { en: "BOTH", fr: "BOTH" } },
    { value: "L", label: { en: "L", fr: "L" } },
    { value: "R", label: { en: "R", fr: "R" } },
    {
      value: "GOOD",
      label: {
        en: "the good magneto (L or R, the smoother one)",
        fr: "la bonne magnéto (L ou R, la plus régulière)",
      },
    },
    {
      value: "L|R",
      label: { en: "L or R", fr: "L ou R" },
    },
    {
      value: "BOTH|START",
      label: { en: "BOTH (START if the propeller stopped)", fr: "BOTH (START si l’hélice est arrêtée)" },
    },
    { value: "OFF", label: { en: "OFF", fr: "OFF (coupées)" } },
    { value: "START", label: { en: "START", fr: "START" } },
  ],
  fuelSelector: [
    { value: "BOTH", label: { en: "BOTH", fr: "BOTH (les deux)" } },
    { value: "LEFT", label: { en: "LEFT", fr: "GAUCHE" } },
    { value: "RIGHT", label: { en: "RIGHT", fr: "DROIT" } },
    {
      value: "LEFT|RIGHT",
      label: { en: "LEFT or RIGHT", fr: "GAUCHE ou DROIT" },
    },
    { value: "OFF", label: { en: "OFF", fr: "FERMÉ" } },
  ],
};
const MIXTURE_VALUES: CheckParamOption[] = [
  { value: 0, label: { en: "IDLE CUT-OFF", fr: "ÉTOUFFOIR" } },
  { value: 1, label: { en: "RICH", fr: "PLEIN RICHE" } },
];

/** the values the 'switch' check offers for a key (the editor's 'value' field) */
export function switchValueOptions(key: string): CheckParamOption[] {
  const k = key as keyof Switches;
  if (k === "mixture") return MIXTURE_VALUES;
  if (ENUM_VALUES[k]) return ENUM_VALUES[k]!;
  const w = BOOL_WORDS[k];
  return w
    ? [
        { value: true, label: w[0] },
        { value: false, label: w[1] },
      ]
    : onOff;
}

const truthy = (v: ParamValue | undefined) =>
  v === true || v === "true" || v === "ON" || v === "on" || v === 1;

function switchLabel(p: Record<string, ParamValue> | undefined, lang: Lang) {
  const key = String(p?.key ?? "batMaster") as keyof Switches;
  const name = SWITCH_NAMES[key]?.[lang] ?? key;
  if (key === "mixture") {
    const v = Number(p?.value ?? 1);
    const op = p?.op;
    const word =
      v <= 0.05 && op !== ">="
        ? MIXTURE_VALUES[0].label[lang]
        : v >= 0.95 && op !== "<="
          ? MIXTURE_VALUES[1].label[lang]
          : `${op === "<=" ? "≤ " : op === ">=" ? "≥ " : ""}${Math.round(v * 100)} %`;
    return `${name} — ${word}`;
  }
  const opts = switchValueOptions(key);
  const val = p?.value;
  const o =
    typeof val === "boolean" ||
    val === "true" ||
    val === "false" ||
    val === "ON" ||
    val === "OFF"
      ? opts.find((x) => x.value === truthy(val))
      : opts.find((x) => x.value === val);
  return `${name} — ${o ? o.label[lang] : String(val)}`;
}

function evalSwitch(
  view: ProcSimView,
  p: Record<string, ParamValue> | undefined,
) {
  const key = String(p?.key ?? "") as keyof Switches;
  if (!(key in view.sw)) return false;
  const cur = view.sw[key];
  const want = p?.value;
  // magnetos on the GOOD one (rough engine): the single magneto that is not the faulty one. Selecting the bad
  // magneto (engine very rough) is not credited. Without a faulty magneto (partial power, plug fouling) the POH
  // answer is BOTH after the L / R check (C172S POH section 3 amplified, rough engine operation): BOTH counts —
  // a single magneto there only costs power.
  if (key === "magnetos" && want === "GOOD") {
    const bad = view.sys?.badMag ?? null;
    // no systems model (editor preview, tests): the faulty one is unknown — either single one counts too
    if (!bad) return cur === "BOTH" || (!view.sys && (cur === "L" || cur === "R"));
    return cur === "L" || cur === "R" ? cur !== bad : false;
  }
  if (key === "mixture") {
    const v = Number(want ?? 1);
    const op = p?.op ?? (v <= 0.05 ? "<=" : v >= 0.95 ? ">=" : "=");
    const m = cur as number;
    // idle cut-off ≤ 5 %, rich ≥ 90 % (a hand on the red knob is never exactly at the stop)
    if (op === "<=") return m <= Math.max(v, 0.05);
    if (op === ">=") return m >= Math.min(v, 0.9);
    return Math.abs(m - v) <= 0.1;
  }
  if (typeof cur === "boolean") return cur === truthy(want);
  if (typeof cur === "string")
    return String(want ?? "")
      .split("|")
      .some((w) => w.trim().toUpperCase() === cur);
  return Number(cur) === Number(want);
}

const num = (
  p: Record<string, ParamValue> | undefined,
  k: string,
  d: number,
) => {
  const v = p?.[k];
  const n =
    typeof v === "number" ? v : v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
};
const holdParam: CheckParam = {
  name: "holdS",
  type: "number",
  label: { en: "Hold for (s)", fr: "Tenir pendant (s)" },
  default: 0,
  min: 0,
  max: 120,
  step: 1,
  unit: "s",
  optional: true,
};
const holdOf = (p: Record<string, ParamValue> | undefined) =>
  Math.max(0, num(p, "holdS", 0));
const kt = (n: number) => `${Math.round(n)} kt`;
const signed = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n)}°`;
const fmtFreq = (f: number, lang: Lang) => {
  const s = String(Math.round(f * 1000) / 1000);
  return lang === "fr" ? s.replace(".", ",") : s;
};
const opWord = (op: ParamValue | undefined) => (op === "<=" ? "≤" : "≥");

function throttleLabel(p: Record<string, ParamValue> | undefined, lang: Lang) {
  const v = num(p, "value", 0);
  const op = p?.op ?? "<=";
  const name = lang === "fr" ? "Manette des gaz" : "Throttle";
  if (op === "<=" && v <= 0.05)
    return `${name} — ${lang === "fr" ? "RÉDUIT" : "IDLE"}`;
  if (op === ">=" && v >= 0.95)
    return `${name} — ${lang === "fr" ? "PLEIN GAZ" : "FULL"}`;
  return `${name} ${opWord(op)} ${Math.round(v * 100)} %`;
}

const FLAP_DEG = [0, 10, 20, 30];

export const CHECKS: Record<CheckId, CheckDef> = {
  switch: {
    id: "switch",
    kind: "action",
    name: { en: "Switch / control position", fr: "Position d’une commande" },
    params: [
      {
        name: "key",
        type: "enum",
        label: { en: "Control", fr: "Commande" },
        default: "batMaster",
        required: true,
        options: SWITCH_KEYS.map((k) => ({ value: k, label: SWITCH_NAMES[k] })),
      },
      {
        name: "value",
        type: "enum",
        label: { en: "Position", fr: "Position" },
        default: false,
        required: true,
        optionsFor: (p) => switchValueOptions(String(p.key ?? "batMaster")),
      },
      {
        name: "op",
        type: "enum",
        label: { en: "Mixture test", fr: "Test du mélange" },
        default: "<=",
        options: [
          {
            value: "<=",
            label: { en: "at or below", fr: "inférieur ou égal" },
          },
          {
            value: ">=",
            label: { en: "at or above", fr: "supérieur ou égal" },
          },
        ],
        showIf: (p) => p.key === "mixture",
        optional: true,
      },
    ],
    label: switchLabel,
    evaluate: (v, p) => evalSwitch(v, p),
    holdS: () => 0,
  },
  throttle: {
    id: "throttle",
    kind: "action",
    name: { en: "Throttle", fr: "Manette des gaz" },
    params: [
      {
        name: "op",
        type: "enum",
        label: { en: "Test", fr: "Test" },
        default: "<=",
        options: [
          {
            value: "<=",
            label: { en: "at or below", fr: "inférieur ou égal" },
          },
          {
            value: ">=",
            label: { en: "at or above", fr: "supérieur ou égal" },
          },
        ],
      },
      {
        name: "value",
        type: "number",
        label: {
          en: "Throttle (0 idle – 1 full)",
          fr: "Gaz (0 réduit – 1 plein gaz)",
        },
        default: 0,
        min: 0,
        max: 1,
        step: 0.05,
      },
    ],
    label: throttleLabel,
    evaluate: (v, p) => {
      const x = num(p, "value", 0);
      return (p?.op ?? "<=") === ">="
        ? v.controls.throttle >= x - 0.02
        : v.controls.throttle <= x + 0.02;
    },
    holdS: () => 0,
  },
  flaps: {
    id: "flaps",
    kind: "action",
    name: { en: "Flaps lever", fr: "Commande des volets" },
    params: [
      {
        name: "value",
        type: "enum",
        label: { en: "Flaps", fr: "Volets" },
        default: 0,
        options: FLAP_DEG.map((d, i) => ({
          value: i,
          label: { en: d ? `${d}°` : "UP", fr: d ? `${d}°` : "RENTRÉS" },
        })),
      },
    ],
    label: (p, lang) => {
      const i = Math.max(0, Math.min(3, Math.round(num(p, "value", 0))));
      return `${lang === "fr" ? "Volets" : "Flaps"} — ${i ? `${FLAP_DEG[i]}°` : lang === "fr" ? "RENTRÉS" : "UP"}`;
    },
    evaluate: (v, p) =>
      Math.round(v.controls.flaps) === Math.round(num(p, "value", 0)),
    holdS: () => 0,
  },
  ias: {
    id: "ias",
    kind: "path",
    name: { en: "Airspeed band", fr: "Plage de vitesse" },
    params: [
      {
        name: "min",
        type: "number",
        label: { en: "Min (KIAS)", fr: "Min (kt)" },
        default: 63,
        min: 30,
        max: 200,
        step: 1,
        unit: "kt",
      },
      {
        name: "max",
        type: "number",
        label: { en: "Max (KIAS)", fr: "Max (kt)" },
        default: 73,
        min: 30,
        max: 200,
        step: 1,
        unit: "kt",
      },
      { ...holdParam, default: 5 },
    ],
    label: (p, lang) => {
      const a = num(p, "min", 63),
        b = num(p, "max", 73);
      return `${lang === "fr" ? "Vitesse" : "Airspeed"} ${kt((a + b) / 2)} (${Math.round(a)}–${Math.round(b)})`;
    },
    // true airspeed from the flight model: a blocked pitot must not make the grading lie
    evaluate: (v, p) =>
      !v.onGround &&
      v.iasKt >= num(p, "min", 63) &&
      v.iasKt <= num(p, "max", 73),
    holdS: holdOf,
  },
  pitchAtt: {
    id: "pitchAtt",
    kind: "path",
    name: { en: "Pitch attitude", fr: "Assiette" },
    params: [
      {
        name: "min",
        type: "number",
        label: { en: "Min pitch (°)", fr: "Assiette min (°)" },
        default: -5,
        min: -60,
        max: 60,
        step: 1,
        unit: "°",
      },
      {
        name: "max",
        type: "number",
        label: { en: "Max pitch (°)", fr: "Assiette max (°)" },
        default: 5,
        min: -60,
        max: 60,
        step: 1,
        unit: "°",
      },
      { ...holdParam, default: 2 },
    ],
    label: (p, lang) => {
      const a = num(p, "min", -90),
        b = num(p, "max", 90);
      const name = lang === "fr" ? "Assiette" : "Pitch";
      if (a <= -60) return `${name} ≤ ${signed(b)}`;
      if (b >= 60) return `${name} ≥ ${signed(a)}`;
      return `${name} ${signed(a)} … ${signed(b)}`;
    },
    evaluate: (v, p) =>
      v.pitchDeg >= num(p, "min", -90) && v.pitchDeg <= num(p, "max", 90),
    holdS: holdOf,
  },
  bankMax: {
    id: "bankMax",
    kind: "path",
    name: {
      en: "Wings level / bank limit",
      fr: "Ailes horizontales / inclinaison max",
    },
    params: [
      {
        name: "max",
        type: "number",
        label: { en: "Max bank (°)", fr: "Inclinaison max (°)" },
        default: 10,
        min: 0,
        max: 60,
        step: 1,
        unit: "°",
      },
      { ...holdParam, default: 2 },
    ],
    label: (p, lang) => {
      const m = num(p, "max", 10);
      if (m <= 10)
        return lang === "fr"
          ? `Ailes horizontales (±${Math.round(m)}°)`
          : `Wings level (±${Math.round(m)}°)`;
      return `${lang === "fr" ? "Inclinaison" : "Bank"} ≤ ${Math.round(m)}°`;
    },
    evaluate: (v, p) => Math.abs(v.bankDeg) <= num(p, "max", 10),
    holdS: holdOf,
  },
  altBand: {
    id: "altBand",
    kind: "path",
    name: { en: "Altitude band", fr: "Plage d’altitude" },
    params: [
      {
        name: "min",
        type: "number",
        label: { en: "Min (ft)", fr: "Min (ft)" },
        default: 0,
        min: -1000,
        max: 45000,
        step: 100,
        unit: "ft",
      },
      {
        name: "max",
        type: "number",
        label: { en: "Max (ft)", fr: "Max (ft)" },
        default: 45000,
        min: -1000,
        max: 45000,
        step: 100,
        unit: "ft",
      },
      { ...holdParam, default: 0 },
    ],
    label: (p, lang) => {
      const a = num(p, "min", -1000),
        b = num(p, "max", 45000);
      const name = lang === "fr" ? "Altitude" : "Altitude";
      if (b >= 45000) return `${name} ≥ ${Math.round(a)} ft`;
      if (a <= -1000) return `${name} ≤ ${Math.round(b)} ft`;
      return `${name} ${Math.round(a)}–${Math.round(b)} ft`;
    },
    evaluate: (v, p) =>
      v.altFt >= num(p, "min", -1000) && v.altFt <= num(p, "max", 45000),
    holdS: holdOf,
  },
  xpdr: {
    id: "xpdr",
    kind: "action",
    name: { en: "Transponder code", fr: "Code transpondeur" },
    params: [
      {
        name: "code",
        type: "enum",
        label: { en: "Code", fr: "Code" },
        default: "7700",
        options: [
          {
            value: "7700",
            label: { en: "7700 (emergency)", fr: "7700 (détresse)" },
          },
          {
            value: "7600",
            label: { en: "7600 (radio failure)", fr: "7600 (panne radio)" },
          },
          {
            value: "7500",
            label: {
              en: "7500 (unlawful interference)",
              fr: "7500 (intervention illicite)",
            },
          },
          {
            value: "7000",
            label: { en: "7000 (VFR, Europe)", fr: "7000 (VFR, Europe)" },
          },
          {
            value: "1200",
            label: { en: "1200 (VFR, US)", fr: "1200 (VFR, US)" },
          },
        ],
      },
    ],
    label: (p, lang) =>
      `${lang === "fr" ? "Transpondeur" : "Transponder"} — ${String(p?.code ?? "7700")}`,
    evaluate: (v, p) => v.xpdr === String(p?.code ?? "7700"),
    holdS: () => 0,
  },
  cdi: {
    id: "cdi",
    kind: "action",
    name: { en: "CDI source", fr: "Source CDI" },
    params: [
      {
        name: "value",
        type: "enum",
        label: { en: "Source", fr: "Source" },
        default: "NAV1",
        options: [
          ...["GPS", "NAV1", "NAV2"].map((x) => ({
            value: x,
            label: { en: x, fr: x },
          })),
          { value: "NAV2|GPS", label: { en: "NAV2 or GPS", fr: "NAV2 ou GPS" } },
          { value: "NAV1|NAV2", label: { en: "NAV1 or NAV2", fr: "NAV1 ou NAV2" } },
        ],
      },
    ],
    label: (p, lang) =>
      `${lang === "fr" ? "Source CDI" : "CDI"} — ${String(p?.value ?? "NAV1")
        .split("|")
        .join(lang === "fr" ? " ou " : " or ")}`,
    // 'NAV2|GPS': any of the listed sources
    evaluate: (v, p) =>
      String(p?.value ?? "NAV1")
        .split("|")
        .some((x) => x.trim().toUpperCase() === v.cdi),
    holdS: () => 0,
  },
  ap: {
    id: "ap",
    kind: "action",
    name: { en: "Autopilot", fr: "Pilote automatique" },
    params: [
      {
        name: "engaged",
        type: "boolean",
        label: { en: "Engaged", fr: "Engagé" },
        default: false,
      },
    ],
    label: (p, lang) =>
      truthy(p?.engaged)
        ? lang === "fr"
          ? "Pilote automatique — ENGAGÉ"
          : "Autopilot — ENGAGED"
        : lang === "fr"
          ? "Pilote automatique — DÉBRAYÉ"
          : "Autopilot — DISCONNECTED",
    evaluate: (v, p) => v.apEngaged === truthy(p?.engaged ?? false),
    holdS: () => 0,
  },
  heading: {
    id: "heading",
    kind: "path",
    name: { en: "Heading", fr: "Cap" },
    params: [
      {
        name: "value",
        type: "number",
        label: { en: "Heading (°M)", fr: "Cap (°M)" },
        default: 360,
        min: 1,
        max: 360,
        step: 1,
        unit: "°",
      },
      {
        name: "tol",
        type: "number",
        label: { en: "Tolerance (±°)", fr: "Tolérance (±°)" },
        default: 10,
        min: 1,
        max: 90,
        step: 1,
        unit: "°",
      },
      { ...holdParam, default: 0 },
    ],
    label: (p, lang) => {
      const h = Math.round(num(p, "value", 360)) % 360 || 360;
      return `${lang === "fr" ? "Cap" : "Heading"} ${String(h).padStart(3, "0")}° (±${Math.round(num(p, "tol", 10))}°)`;
    },
    evaluate: (v, p) => {
      const d = ((((v.hdgDeg - num(p, "value", 360)) % 360) + 540) % 360) - 180;
      return Math.abs(d) <= num(p, "tol", 10);
    },
    holdS: holdOf,
  },
  directTo: {
    id: "directTo",
    kind: "action",
    name: { en: "GPS direct-to", fr: "Direct-To GPS" },
    params: [
      {
        name: "ident",
        type: "string",
        label: {
          en: "Fix ('*nearest' = a nearest airport)",
          fr: "Point (« *nearest » = un terrain proche)",
        },
        default: "*nearest",
      },
    ],
    label: (p, lang) => {
      const id = String(p?.ident ?? "*nearest");
      if (id === "*nearest")
        return lang === "fr"
          ? "GPS — Direct-To terrain le plus proche"
          : "GPS — direct-to nearest airport";
      return `GPS — ${lang === "fr" ? "Direct-To" : "direct-to"} ${id.toUpperCase()}`;
    },
    evaluate: (v, p) => {
      const id = String(p?.ident ?? "*nearest").toUpperCase();
      if (!v.directTo) return false;
      if (id === "*NEAREST")
        return v.nearest.includes(v.directTo.toUpperCase());
      return v.directTo.toUpperCase() === id;
    },
    holdS: () => 0,
  },
  timer: {
    id: "timer",
    kind: "action",
    name: { en: "Chronometer", fr: "Chronomètre" },
    params: [],
    label: (_p, lang) =>
      lang === "fr" ? "Chronomètre — DÉMARRÉ" : "Timer — STARTED",
    evaluate: (v) => v.timerRunning,
    holdS: () => 0,
  },
  radio: {
    id: "radio",
    kind: "action",
    name: { en: "COM frequency", fr: "Fréquence COM" },
    params: [
      {
        name: "freq",
        type: "number",
        label: { en: "Frequency (MHz)", fr: "Fréquence (MHz)" },
        default: 121.5,
        min: 118,
        max: 136.99,
        step: 0.005,
        unit: "MHz",
      },
    ],
    label: (p, lang) => `COM — ${fmtFreq(num(p, "freq", 121.5), lang)}`,
    // tuned on COM1 or COM2, active or standby (the pilot may use either radio)
    evaluate: (v, p) => {
      const f = num(p, "freq", 121.5);
      return v.com.some(
        (r) =>
          Math.abs(r.active - f) < 0.003 || Math.abs(r.standby - f) < 0.003,
      );
    },
    holdS: () => 0,
  },
  landed: {
    id: "landed",
    kind: "outcome",
    name: { en: "Landed and stopped", fr: "Posé et arrêté" },
    params: [],
    label: (_p, lang) =>
      lang === "fr" ? "Avion posé et arrêté" : "Aircraft landed and stopped",
    evaluate: (v) => v.onGround && v.stopped && !v.crashed,
    holdS: () => 0,
  },
  manual: {
    id: "manual",
    kind: "manual",
    name: {
      en: "Confirmed by the pilot (Done)",
      fr: "Confirmé par le pilote (Fait)",
    },
    params: [],
    label: (_p, lang) =>
      lang === "fr" ? "Confirmé par le pilote" : "Confirmed by the pilot",
    evaluate: () => false,
    holdS: () => 0,
  },
  engineRunning: {
    id: "engineRunning",
    kind: "action",
    name: { en: "Engine running", fr: "Moteur en marche" },
    params: [
      {
        name: "value",
        type: "boolean",
        label: { en: "Running", fr: "En marche" },
        default: true,
      },
    ],
    label: (p, lang) =>
      truthy(p?.value ?? true)
        ? lang === "fr"
          ? "Moteur — REDÉMARRÉ"
          : "Engine — RUNNING"
        : lang === "fr"
          ? "Moteur — ARRÊTÉ"
          : "Engine — STOPPED",
    evaluate: (v, p) => v.engineRunning === truthy(p?.value ?? true),
    holdS: () => 0,
  },
  annunciator: {
    id: "annunciator",
    kind: "action",
    name: { en: "Annunciation", fr: "Alarme / voyant" },
    params: [
      {
        name: "name",
        type: "enum",
        label: { en: "Annunciation", fr: "Alarme" },
        default: "LOW VOLTS",
        required: true,
        options: (Object.keys(ANNUNCIATOR_LEVEL) as Annunciator[]).map((a) => ({
          value: a,
          label: { en: a, fr: a },
        })),
      },
      {
        name: "lit",
        type: "boolean",
        label: { en: "Lit", fr: "Allumée" },
        default: false,
      },
    ],
    label: (p, lang) => {
      const n = String(p?.name ?? "LOW VOLTS");
      return truthy(p?.lit ?? false)
        ? lang === "fr"
          ? `${n} — ALLUMÉE`
          : `${n} — ON`
        : lang === "fr"
          ? `${n} — ÉTEINTE`
          : `${n} — OFF`;
    },
    // a dark annunciator panel (no power) is not "the annunciation went out": an unpowered display shows nothing
    evaluate: (v, p) => {
      const anns = v.sys?.annunciators;
      if (!anns) return false;
      const lit = anns.includes(String(p?.name ?? "LOW VOLTS") as Annunciator);
      const want = truthy(p?.lit ?? false);
      if (want) return lit;
      return !lit && !!(v.sys?.essPowered ?? v.sys?.powered);
    },
    holdS: () => 2,
  },
  brake: {
    id: "brake",
    kind: "action",
    name: { en: "Wheel brakes", fr: "Freins" },
    params: [
      {
        name: "min",
        type: "number",
        label: { en: "At least (0–1)", fr: "Au moins (0–1)" },
        default: 0.8,
        min: 0,
        max: 1,
        step: 0.05,
      },
    ],
    label: (_p, lang) => (lang === "fr" ? "Freins — FREINER" : "Brakes — APPLY"),
    evaluate: (v, p) => v.controls.brake >= num(p, "min", 0.8),
    holdS: () => 0,
  },
};

export const CHECK_IDS = Object.keys(CHECKS) as CheckId[];

/** the catalogue entry of a check reference, or null when the id is unknown (imported packs) */
export function checkDef(ref: CheckRef | undefined): CheckDef | null {
  if (!ref) return null;
  return (CHECKS as Record<string, CheckDef | undefined>)[ref.id] ?? null;
}

/** default parameters for a check (editor 'add check') */
export function defaultParams(id: CheckId): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const prm of CHECKS[id].params)
    if (!prm.optional) out[prm.name] = prm.default;
  if (id === "switch")
    out.value = switchValueOptions(String(out.key))[1]?.value ?? false;
  return out;
}

/** plain-language label of a check reference (falls back to the id) */
export function checkLabel(ref: CheckRef | undefined, lang: Lang): string {
  const d = checkDef(ref);
  return d ? d.label(ref!.p, lang) : ref ? ref.id : "";
}

/** readable problems with a check's parameters (empty = fine) */
export function checkParamIssues(ref: CheckRef, lang: Lang): string[] {
  const d = checkDef(ref);
  const fr = lang === "fr";
  if (!d)
    return [
      fr ? `Vérification inconnue « ${ref.id} »` : `Unknown check '${ref.id}'`,
    ];
  const out: string[] = [];
  const p = ref.p ?? {};
  for (const prm of d.params) {
    if (prm.showIf && !prm.showIf(p)) continue;
    const v = p[prm.name];
    if (v === undefined || v === "") {
      if (prm.required || (!prm.optional && prm.default === undefined))
        out.push(
          fr
            ? `${prm.label.fr} : valeur manquante`
            : `${prm.label.en}: missing value`,
        );
      continue;
    }
    if (prm.type === "number") {
      const n = Number(v);
      if (!Number.isFinite(n))
        out.push(
          fr
            ? `${prm.label.fr} : nombre attendu`
            : `${prm.label.en}: a number is expected`,
        );
      else if (
        (prm.min !== undefined && n < prm.min) ||
        (prm.max !== undefined && n > prm.max)
      )
        out.push(
          fr
            ? `${prm.label.fr} : entre ${prm.min} et ${prm.max}`
            : `${prm.label.en}: must be between ${prm.min} and ${prm.max}`,
        );
    }
    if (prm.type === "enum") {
      const opts = prm.optionsFor ? prm.optionsFor(p) : prm.options;
      const known = (x: ParamValue) => !!opts?.some((o) => o.value === x || String(o.value) === String(x));
      // 'BOTH|START': any combination of known positions
      const ok = known(v) || (typeof v === "string" && v.includes("|") && v.split("|").every((x) => known(x.trim())));
      if (opts && !ok)
        out.push(
          fr
            ? `${prm.label.fr} : valeur « ${String(v)} » non prévue`
            : `${prm.label.en}: '${String(v)}' is not an option`,
        );
    }
  }
  if (
    ("min" in p || "max" in p) &&
    d.params.some((x) => x.name === "min") &&
    Number(p.min) > Number(p.max)
  )
    out.push(
      fr ? "Le minimum dépasse le maximum" : "The minimum is above the maximum",
    );
  return out;
}
