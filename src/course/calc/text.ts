// Calc engine — bilingual text helpers. Every generator writes its EN and FR text itself (never machine-translated);
// these helpers only format numbers the way a pilot writes them in each language:
//   EN  3,000 ft · 1.5 NM · −4 °C · 270° · 1:15
//   FR  3 000 ft · 1,5 NM · −4 °C · 270° · 1 min 15 s
import type { CalcUnit, L10n, Lang } from "../types";

export const L = (en: string, fr: string): L10n => ({ en, fr });

/** A language-bound formatter. */
export interface Fmt {
  lang: Lang;
  /** a number rounded to `digits` decimals, grouped by thousands when |x| ≥ 1000 (not for `noGroup`) */
  n(x: number, digits?: number, noGroup?: boolean): string;
  /** a signed number (+3 / −3) */
  s(x: number, digits?: number): string;
  /** a heading, course, radial or bearing: 3 digits, 001–360 */
  hdg(x: number): string;
  /** a number with its unit label (`270°`, `3,000 ft`, `−4 °C`) */
  u(x: number, unit: CalcUnit, digits?: number): string;
  /** a duration from minutes: `1:15` / `1 min 15 s`; `1 h 25 min` above an hour */
  dur(minutes: number): string;
  /** a duration from seconds: `0:45` / `45 s` */
  sec(seconds: number): string;
  /** the unit label alone */
  unit(unit: CalcUnit): string;
}

const MINUS = "−";
const NNBSP = " ";

function roundTo(x: number, digits: number): number {
  const k = 10 ** digits;
  return Math.round(x * k) / k;
}

function plain(
  x: number,
  digits: number,
  lang: Lang,
  noGroup: boolean,
): string {
  const r = roundTo(x, digits);
  const neg = r < 0 && Math.abs(r) > 0;
  const abs = Math.abs(r);
  let [int, dec] = abs.toFixed(digits).split(".");
  if (!noGroup && int.length >= 4) {
    const sep = lang === "fr" ? NNBSP : ",";
    int = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  }
  const body = dec ? int + (lang === "fr" ? "," : ".") + dec : int;
  return (neg ? MINUS : "") + body;
}

/** labels shown after a number */
export const UNIT_LABEL: Record<CalcUnit, L10n> = {
  deg: L("°", "°"),
  NM: L("NM", "NM"),
  SM: L("SM", "SM"),
  km: L("km", "km"),
  m: L("m", "m"),
  ft: L("ft", "ft"),
  kt: L("kt", "kt"),
  kmh: L("km/h", "km/h"),
  mph: L("mph", "mph"),
  fpm: L("ft/min", "ft/min"),
  ftPerNm: L("ft/NM", "ft/NM"),
  pct: L("%", "%"),
  min: L("min", "min"),
  s: L("s", "s"),
  h: L("h", "h"),
  usgal: L("US gal", "gal US"),
  L: L("L", "L"),
  lb: L("lb", "lb"),
  kg: L("kg", "kg"),
  gph: L("gal/h", "gal US/h"),
  lph: L("L/h", "L/h"),
  inHg: L("inHg", "inHg"),
  hPa: L("hPa", "hPa"),
  degC: L("°C", "°C"),
  degF: L("°F", "°F"),
  in: L("in", "in"),
  lbIn: L("lb·in", "lb·in"),
  none: L("", ""),
};

function makeFmt(lang: Lang): Fmt {
  const f: Fmt = {
    lang,
    n: (x, digits = 0, noGroup = false) => plain(x, digits, lang, noGroup),
    s: (x, digits = 0) => {
      const r = roundTo(x, digits);
      return (r > 0 ? "+" : "") + plain(r, digits, lang, false);
    },
    hdg: (x) => {
      let v = Math.round(((x % 360) + 360) % 360);
      if (v === 0) v = 360;
      return String(v).padStart(3, "0") + "°";
    },
    u: (x, unit, digits = 0) => {
      const noGroup = unit === "hPa" || unit === "inHg";
      const num = plain(x, digits, lang, noGroup);
      if (unit === "deg") return num + "°";
      if (unit === "pct") return num + (lang === "fr" ? NNBSP + "%" : "%");
      if (unit === "none") return num;
      return num + NNBSP + UNIT_LABEL[unit][lang];
    },
    dur: (minutes) => {
      const totalS = Math.round(minutes * 60);
      const h = Math.floor(totalS / 3600);
      const m = Math.floor((totalS % 3600) / 60);
      const s = totalS % 60;
      if (h > 0) {
        const mm = Math.round((totalS % 3600) / 60);
        return lang === "fr"
          ? `${h} h ${String(mm).padStart(2, "0")}`
          : `${h} h ${String(mm).padStart(2, "0")} min`;
      }
      if (lang === "fr")
        return s ? `${m} min ${String(s).padStart(2, "0")} s` : `${m} min`;
      return s ? `${m}:${String(s).padStart(2, "0")}` : `${m} min`;
    },
    sec: (seconds) => {
      const t = Math.round(seconds);
      const m = Math.floor(Math.abs(t) / 60);
      const s = Math.abs(t) % 60;
      if (lang === "fr")
        return m ? `${m} min ${String(s).padStart(2, "0")} s` : `${s} s`;
      return `${m}:${String(s).padStart(2, "0")}`;
    },
    unit: (unit) => UNIT_LABEL[unit][lang] ?? UNIT_LABEL[unit].en,
  };
  return f;
}

export const EN: Fmt = makeFmt("en");
export const FR: Fmt = makeFmt("fr");
export const FMT: Record<Lang, Fmt> = { en: EN, fr: FR };

/** Build an L10n from one template per language, each given its language's formatter. */
export function tr(en: (f: Fmt) => string, fr: (f: Fmt) => string): L10n {
  return { en: en(EN), fr: fr(FR) };
}

/** A wind as a pilot writes it: `270/15` (direction / speed), `270/15G25` with a gust. */
export function windText(dir: number, kt: number, gust?: number): string {
  const d = String(Math.round(((dir % 360) + 360) % 360) || 360).padStart(
    3,
    "0",
  );
  return `${d}/${Math.round(kt)}${gust ? `G${Math.round(gust)}` : ""}`;
}
