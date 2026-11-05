// Tiny FR/EN string table for the procedures mode (flying clubs are often French-speaking). Each module registers
// its own strings with registerStrings('fr', {...}) / ('en', {...}) and reads them with t('key', { n: 3 }).
// Unknown keys fall back to English, then to the key itself. The language follows ifr.lang, else the browser.
export type UiLang = "fr" | "en";

const tables: Record<UiLang, Record<string, string>> = { fr: {}, en: {} };
let current: UiLang = detect();
const listeners = new Set<(l: UiLang) => void>();

function detect(): UiLang {
  try {
    const s = localStorage.getItem("ifr.lang");
    if (s === "fr" || s === "en") return s;
  } catch {
    /* storage blocked */
  }
  return typeof navigator !== "undefined" &&
    /^fr\b/i.test(navigator.language ?? "")
    ? "fr"
    : "en";
}

export function registerStrings(lang: UiLang, dict: Record<string, string>) {
  Object.assign(tables[lang], dict);
}

export function lang(): UiLang {
  return current;
}

export function setLang(l: UiLang) {
  if (l === current) return;
  current = l;
  try {
    localStorage.setItem("ifr.lang", l);
  } catch {
    /* storage blocked */
  }
  listeners.forEach((f) => f(l));
}

export function onLangChange(f: (l: UiLang) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** translate `key`, replacing {name} placeholders from `vars` */
export function t(key: string, vars?: Record<string, string | number>): string {
  const s = tables[current][key] ?? tables.en[key] ?? key;
  return vars
    ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
    : s;
}

/** translate with a count: `key.1` when the count is singular (FR: 0 and 1, EN: 1), else `key`; {n} is the count */
export function tn(key: string, n: number, vars?: Record<string, string | number>): string {
  const one = current === "fr" ? Math.abs(n) < 2 : Math.abs(n) === 1;
  const k = one && (tables[current][`${key}.1`] ?? tables.en[`${key}.1`]) !== undefined ? `${key}.1` : key;
  return t(k, { n, ...vars });
}
