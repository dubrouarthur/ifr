// Ground school — designed slides: the two themes of the slide design system (SPEC slides v2 §2, §4).
//   cockpit    dark: flying a procedure, reading instruments, every lesson briefing played in the cockpit
//   classroom  light, warm paper: ground-school theory, maths, regulations, anything printed
// One theme per course. The older ids load as their nearest: 'projector' = classroom + the bright-projector boost
// (heavier type, mute → ink-2, white paper), 'brand' = classroom with the school's colour as the accent.
// A theme defines colour tokens (every text token ≥ 4.5:1 on its background) and the type scale in logical px on
// the 1920 × 1080 canvas, with a hard floor of 24 px. No gradients, glows or shadows by construction.
import type {
  ColorToken,
  SchoolBrand,
  SlideTheme,
  TextStyle,
  ThemeId,
  TypeStyleDef,
} from "../types";

/** The themes an author picks from (the editor's theme picker). */
export const THEME_IDS: readonly ThemeId[] = ["cockpit", "classroom"];
/** Every id a stored course may carry (validation). */
export const ALL_THEME_IDS: readonly ThemeId[] = [
  "cockpit",
  "classroom",
  "projector",
  "brand",
];

/** The smallest text on a slide, in logical px (diagrams included): 17.2 CSS px at 1440 × 900, 12.4 at 1024. */
export const MIN_TEXT_PX = 24;

const INTER =
  '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
// no monospace on slides: code and formulas are set in Inter with tabular figures
const FONTS = { display: INTER, body: INTER, mono: INTER };

type Named = Exclude<ColorToken, `#${string}`>;

/** The type scale (SPEC §2). Older role names are aliases of the new ones. */
function styles(
  accentRole: ColorToken = "accent",
  boost = false,
): Record<TextStyle, TypeStyleDef> {
  const w = (n: 400 | 500 | 600): 400 | 500 | 600 | 700 =>
    boost ? ((n + 100) as 500 | 600 | 700) : n;
  const mute: ColorToken = boost ? "ink2" : "muted";
  const display: TypeStyleDef = {
    font: "display",
    size: 120,
    weight: w(600),
    lineHeight: 1.0,
    tracking: -0.032,
    color: "text",
  };
  const title: TypeStyleDef = {
    font: "display",
    size: 72,
    weight: w(600),
    lineHeight: 1.08,
    tracking: -0.022,
    color: "text",
  };
  const heading: TypeStyleDef = {
    font: "display",
    size: 44,
    weight: w(600),
    lineHeight: 1.18,
    tracking: -0.012,
    color: "text",
  };
  const lead: TypeStyleDef = {
    font: "body",
    size: 40,
    weight: w(400),
    lineHeight: 1.35,
    tracking: -0.008,
    color: "ink2",
  };
  const body: TypeStyleDef = {
    font: "body",
    size: 34,
    weight: w(400),
    lineHeight: 1.42,
    tracking: -0.004,
    color: "ink2",
  };
  const small: TypeStyleDef = {
    font: "body",
    size: 28,
    weight: w(400),
    lineHeight: 1.4,
    color: mute,
  };
  const eyebrow: TypeStyleDef = {
    font: "body",
    size: 24,
    weight: w(600),
    lineHeight: 1.34,
    tracking: 0.14,
    upper: true,
    color: accentRole,
  };
  const foot: TypeStyleDef = {
    font: "body",
    size: 24,
    weight: w(500),
    lineHeight: 1.34,
    tracking: 0.01,
    color: mute,
  };
  const number: TypeStyleDef = {
    font: "display",
    size: 168,
    weight: w(600),
    lineHeight: 0.92,
    tracking: -0.045,
    color: accentRole,
  };
  const quote: TypeStyleDef = {
    font: "display",
    size: 52,
    weight: w(500),
    lineHeight: 1.26,
    tracking: -0.014,
    color: "text",
  };
  const formula: TypeStyleDef = {
    font: "body",
    size: 44,
    weight: w(500),
    lineHeight: 1.2,
    color: "text",
  };
  return {
    display,
    title,
    heading,
    lead,
    subtitle: lead,
    body,
    small,
    caption: small,
    eyebrow,
    label: eyebrow,
    foot,
    number,
    quote,
    formula,
    mono: formula,
  };
}

/** Token values of the two themes (SPEC §4 table; ratios measured on bg). */
const COCKPIT = {
  bg: "#0d1117",
  raise: "#151b23",
  rule: "#2a333e",
  ruleStrong: "#3d4855",
  ink: "#eef2f6",
  ink2: "#c3ccd5",
  mute: "#8b98a6",
  accent: "#6cb4ff",
  accentInk: "#06121f",
  path: "#ee72dc",
  sel: "#5ad4ec",
  nav: "#5bd98e",
  key: "#f4bb4a",
  stop: "#ff7a7a",
};
const CLASSROOM = {
  bg: "#fbfaf7",
  raise: "#f1f0eb",
  rule: "#e2e0d9",
  ruleStrong: "#c9c6bd",
  ink: "#14181f",
  ink2: "#353c47",
  mute: "#5d6671",
  accent: "#1d5fd1",
  accentInk: "#ffffff",
  path: "#a8238f",
  sel: "#0b6f88",
  nav: "#17763c",
  key: "#a04d06",
  stop: "#b42323",
};
type Tokens = typeof COCKPIT;

/** The full colour map of a theme: the v2 tokens plus the older names mapped onto them. */
function colorsOf(t: Tokens): SlideTheme["colors"] {
  return {
    bg: t.bg,
    surface: t.raise,
    raise: t.raise,
    line: t.rule,
    rule: t.rule,
    ruleStrong: t.ruleStrong,
    text: t.ink,
    ink2: t.ink2,
    muted: t.mute,
    accent: t.accent,
    accentInk: t.accentInk,
    brand: t.accent,
    ok: t.nav,
    nav: t.nav,
    green: t.nav,
    warn: t.key,
    key: t.key,
    amber: t.key,
    danger: t.stop,
    stop: t.stop,
    magenta: t.path,
    path: t.path,
    cyan: t.sel,
    sel: t.sel,
    white: "#ffffff",
  };
}

const COCKPIT_THEME: SlideTheme = {
  id: "cockpit",
  name: { en: "Cockpit (dark)", fr: "Cockpit (sombre)" },
  dark: true,
  colors: colorsOf(COCKPIT),
  fonts: FONTS,
  styles: styles(),
  bezel: { color: "#05070a", radius: 28 },
};
const CLASSROOM_THEME: SlideTheme = {
  id: "classroom",
  name: { en: "Classroom (light)", fr: "Salle de cours (clair)" },
  dark: false,
  colors: colorsOf(CLASSROOM),
  fonts: FONTS,
  styles: styles(),
  bezel: { color: "#0d1116", radius: 28 },
};

/** The bright-projector boost (SPEC §4): weights +100, mute → ink-2, white paper on the light theme. */
export function projectorBoost(theme: SlideTheme): SlideTheme {
  const colors = { ...theme.colors };
  colors.muted = colors.ink2;
  if (!theme.dark) colors.bg = "#ffffff";
  return { ...theme, colors, styles: styles("accent", true) };
}
/** A school's colour as the accent (SPEC §4): made readable on the theme's background (4.5:1 for text). */
export function brandAccent(theme: SlideTheme, hex: string): SlideTheme {
  if (!parseHex(hex)) return theme;
  const colors = { ...theme.colors };
  // the logo keeps the school's own colour; the accent (text, markers) is made readable
  colors.brand = hex;
  colors.accent = ensureContrast(hex, colors.bg, 4.5);
  colors.accentInk =
    contrastRatio("#ffffff", colors.accent) >= 4.5 ? "#ffffff" : "#06121f";
  return { ...theme, colors };
}

/** Every theme id → its definition (the older ids resolve to their nearest, see resolveTheme). */
export const THEMES: Record<ThemeId, SlideTheme> = {
  cockpit: COCKPIT_THEME,
  classroom: CLASSROOM_THEME,
  projector: {
    ...projectorBoost(CLASSROOM_THEME),
    id: "projector",
    name: {
      en: "Classroom, bright projector",
      fr: "Salle de cours, projecteur lumineux",
    },
  },
  brand: {
    ...CLASSROOM_THEME,
    id: "brand",
    name: {
      en: "Classroom, school colour",
      fr: "Salle de cours, couleur de l’école",
    },
  },
};

/** The theme a stored id stands for in the two-theme system (projector, brand → classroom). */
export const baseThemeId = (
  id: ThemeId | undefined,
): "cockpit" | "classroom" =>
  id === "cockpit" || id === undefined || !isThemeId(id)
    ? "cockpit"
    : "classroom";

// ------------------------------------------------------------------ colour maths (WCAG 2.x)
export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let s = m[1];
  if (s.length === 3)
    s = s
      .split("")
      .map((c) => c + c)
      .join("");
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}
export function toHex([r, g, b]: [number, number, number]): string {
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const lin = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** Mix towards black (t > 0) or white (t < 0). */
export function shade(hex: string, t: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const to = t >= 0 ? 0 : 255;
  const k = Math.abs(t);
  return toHex([
    rgb[0] + (to - rgb[0]) * k,
    rgb[1] + (to - rgb[1]) * k,
    rgb[2] + (to - rgb[2]) * k,
  ]);
}
/** `a` mixed over `b` with opacity t (a tint over the background, the colour a halo must match). */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a);
  const y = parseHex(b);
  if (!x || !y) return a;
  return toHex([
    y[0] + (x[0] - y[0]) * t,
    y[1] + (x[1] - y[1]) * t,
    y[2] + (x[2] - y[2]) * t,
  ]);
}
/** The colour darkened (on a light bg) or lightened (on a dark bg) until it reaches `min` contrast against bg. */
export function ensureContrast(fg: string, bg: string, min = 4.5): string {
  if (!parseHex(fg)) return fg;
  const darker = luminance(bg) > 0.4;
  let c = fg;
  for (let i = 1; i <= 20 && contrastRatio(c, bg) < min; i++)
    c = shade(fg, (darker ? 1 : -1) * i * 0.05);
  return c;
}

export const isThemeId = (x: unknown): x is ThemeId =>
  typeof x === "string" && x in THEMES;

/**
 * The theme a course is drawn with (one per course; a slide's own `theme` is ignored, SPEC §4).
 * 'projector' → classroom + boost; 'brand' → classroom with the school's colour as the accent. `boost` is the
 * presenter's "Bright projector" toggle, for either theme.
 */
export function resolveTheme(
  id: ThemeId | undefined,
  brand?: SchoolBrand,
  o: { boost?: boolean } = {},
): SlideTheme {
  const known = isThemeId(id) ? id : "cockpit";
  let t = THEMES[known];
  if (o.boost && known !== "projector")
    t = { ...projectorBoost(t), id: t.id, name: t.name };
  if (brand && parseHex(brand.color)) {
    if (known === "brand") t = brandAccent(t, brand.color);
    // other themes keep their accent; the logo corner uses the school's colour (made readable on the bg)
    else
      t = {
        ...t,
        colors: {
          ...t.colors,
          brand: ensureContrast(brand.color, t.colors.bg, 3),
        },
      };
  }
  return t;
}

/** A colour token (or #rrggbb) of a theme; unknown values fall back to `text`. */
export function color(
  token: ColorToken | null | undefined,
  theme: SlideTheme,
  fallback: Named = "text",
): string {
  if (!token) return theme.colors[fallback];
  if (token.startsWith("#"))
    return parseHex(token) ? token : theme.colors[fallback];
  return theme.colors[token as Named] ?? theme.colors[fallback];
}

/** A translucent version of a colour (for selection fills, dims): rgba(). */
export function alpha(hex: string, a: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
}

/** CSS custom properties for a theme (set on the slide root; course-canvas.css reads them). */
export function themeVars(theme: SlideTheme): Record<string, string> {
  const v: Record<string, string> = {};
  for (const [k, c] of Object.entries(theme.colors)) v[`--sl-${k}`] = c;
  v["--sl-font-display"] = theme.fonts.display;
  v["--sl-font-body"] = theme.fonts.body;
  v["--sl-font-mono"] = theme.fonts.mono;
  v["--sl-bezel"] = theme.bezel.color;
  v["--sl-bezel-r"] = `${theme.bezel.radius}px`;
  v["--sl-accent-soft"] = alpha(theme.colors.accent, theme.dark ? 0.16 : 0.1);
  v["--sl-warn-soft"] = alpha(theme.colors.warn, theme.dark ? 0.16 : 0.1);
  v["--sl-ok-soft"] = alpha(theme.colors.ok, theme.dark ? 0.14 : 0.1);
  v["--sl-stop-soft"] = alpha(theme.colors.stop, theme.dark ? 0.14 : 0.08);
  v["--sl-on-accent"] = theme.colors.accentInk;
  return v;
}

/** The diagram widgets' palette for a theme (diagrams follow the slide theme, SPEC §4). */
export const diagramThemeOf = (theme: SlideTheme): "dark" | "light" =>
  theme.dark ? "dark" : "light";

/** CSS declarations for a type style (logical px; the slide root is scaled as a whole). */
export function typeCss(
  theme: SlideTheme,
  style: TextStyle,
  colorOverride?: ColorToken,
): Record<string, string> {
  const s = theme.styles[style] ?? theme.styles.body;
  return {
    "font-family": theme.fonts[s.font],
    "font-size": `${s.size}px`,
    "font-weight": String(s.weight),
    "line-height": String(s.lineHeight),
    "letter-spacing": s.tracking ? `${s.tracking}em` : "0",
    "text-transform": s.upper ? "uppercase" : "none",
    "font-style": s.italic ? "italic" : "normal",
    color: color(colorOverride ?? s.color, theme),
  };
}
