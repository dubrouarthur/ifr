// Ground school — designed slides: the four restrained themes (package N).
//   cockpit    dark instrument-room look, the default (instruments sit naturally on it)
//   classroom  light, white paper, the look of the editor mockups
//   projector  high contrast for a washed-out projector in a lit room (white, black, heavier type, larger sizes)
//   brand      classroom with the school's colour as the accent and its logo
// A theme only defines colour tokens and ten type styles: no gradients, glows or shadows by construction.
import type {
  ColorToken,
  SchoolBrand,
  SlideTheme,
  TextStyle,
  ThemeId,
  TypeStyleDef,
} from "../types";

export const THEME_IDS: readonly ThemeId[] = [
  "cockpit",
  "classroom",
  "projector",
  "brand",
];

const FONTS = {
  display: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  body: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace',
};

type Named = Exclude<ColorToken, `#${string}`>;

function styles(
  over: Partial<Record<TextStyle, Partial<TypeStyleDef>>> = {},
  k = 1,
): Record<TextStyle, TypeStyleDef> {
  const base: Record<TextStyle, TypeStyleDef> = {
    display: {
      font: "display",
      size: 104,
      weight: 700,
      lineHeight: 1.04,
      tracking: -0.022,
      color: "text",
    },
    title: {
      font: "display",
      size: 68,
      weight: 700,
      lineHeight: 1.1,
      tracking: -0.016,
      color: "text",
    },
    subtitle: {
      font: "body",
      size: 38,
      weight: 400,
      lineHeight: 1.32,
      tracking: -0.004,
      color: "muted",
    },
    heading: {
      font: "display",
      size: 42,
      weight: 600,
      lineHeight: 1.18,
      tracking: -0.01,
      color: "text",
    },
    body: {
      font: "body",
      size: 30,
      weight: 400,
      lineHeight: 1.48,
      color: "text",
    },
    caption: {
      font: "body",
      size: 23,
      weight: 400,
      lineHeight: 1.4,
      color: "muted",
    },
    label: {
      font: "body",
      size: 21,
      weight: 600,
      lineHeight: 1.25,
      tracking: 0.12,
      upper: true,
      color: "amber",
    },
    number: {
      font: "display",
      size: 150,
      weight: 700,
      lineHeight: 1,
      tracking: -0.03,
      color: "accent",
    },
    quote: {
      font: "display",
      size: 44,
      weight: 500,
      lineHeight: 1.3,
      tracking: -0.01,
      color: "text",
    },
    mono: {
      font: "mono",
      size: 30,
      weight: 500,
      lineHeight: 1.45,
      color: "text",
    },
  };
  const out = {} as Record<TextStyle, TypeStyleDef>;
  for (const id of Object.keys(base) as TextStyle[]) {
    const s = { ...base[id], ...(over[id] ?? {}) };
    out[id] = { ...s, size: Math.round(s.size * k) };
  }
  return out;
}

export const THEMES: Record<ThemeId, SlideTheme> = {
  cockpit: {
    id: "cockpit",
    name: { en: "Cockpit", fr: "Cockpit" },
    dark: true,
    colors: {
      bg: "#0c1015",
      surface: "#141a21",
      line: "#28323d",
      text: "#e9eef3",
      muted: "#93a0ad",
      accent: "#3ea6ff",
      brand: "#3ea6ff",
      ok: "#2fcf7a",
      warn: "#ffb020",
      danger: "#ff5a5f",
      magenta: "#e04ad0",
      cyan: "#22d3ee",
      green: "#2fcf7a",
      amber: "#ffb020",
      white: "#ffffff",
    },
    fonts: FONTS,
    styles: styles(),
    bezel: { color: "#05070a", radius: 18 },
  },
  classroom: {
    id: "classroom",
    name: { en: "Classroom", fr: "Salle de cours" },
    dark: false,
    colors: {
      bg: "#ffffff",
      surface: "#f3f5f8",
      line: "#dce2e9",
      text: "#111827",
      muted: "#5a6575",
      accent: "#1665d8",
      brand: "#1665d8",
      ok: "#13804a",
      warn: "#b45309",
      danger: "#c62828",
      magenta: "#b3249e",
      cyan: "#0e7490",
      green: "#13804a",
      amber: "#b45309",
      white: "#ffffff",
    },
    fonts: FONTS,
    styles: styles({ label: { color: "accent" }, number: { color: "accent" } }),
    bezel: { color: "#0d1116", radius: 18 },
  },
  projector: {
    id: "projector",
    name: { en: "Projector", fr: "Projecteur" },
    dark: false,
    colors: {
      bg: "#ffffff",
      surface: "#eef0f3",
      line: "#1a1a1a",
      text: "#000000",
      muted: "#2b2b2b",
      accent: "#0040b8",
      brand: "#0040b8",
      ok: "#006b2e",
      warn: "#8a4b00",
      danger: "#b00000",
      magenta: "#a1008a",
      cyan: "#005f73",
      green: "#006b2e",
      amber: "#8a4b00",
      white: "#ffffff",
    },
    fonts: FONTS,
    styles: styles(
      {
        subtitle: { weight: 500, color: "muted" },
        body: { weight: 500 },
        caption: { weight: 500, color: "muted" },
        label: { weight: 700, color: "accent" },
        heading: { weight: 700 },
        mono: { weight: 600 },
      },
      1.08,
    ),
    bezel: { color: "#000000", radius: 12 },
  },
  brand: {
    id: "brand",
    name: { en: "School brand", fr: "Couleurs de l’école" },
    dark: false,
    colors: {
      bg: "#ffffff",
      surface: "#f4f5f7",
      line: "#dfe3e8",
      text: "#121722",
      muted: "#5a6575",
      accent: "#1665d8",
      brand: "#1665d8",
      ok: "#13804a",
      warn: "#b45309",
      danger: "#c62828",
      magenta: "#b3249e",
      cyan: "#0e7490",
      green: "#13804a",
      amber: "#b45309",
      white: "#ffffff",
    },
    fonts: FONTS,
    styles: styles({ label: { color: "brand" }, number: { color: "brand" } }),
    bezel: { color: "#0d1116", radius: 18 },
  },
};

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
 * The theme a slide is drawn with: the slide's override, else the course theme, else 'cockpit'.
 * 'brand' takes the school's colour as `brand` and `accent` (darkened for text when it fails 4.5:1 on white).
 */
export function resolveTheme(
  id: ThemeId | undefined,
  brand?: SchoolBrand,
): SlideTheme {
  const base = THEMES[isThemeId(id) ? id : "cockpit"];
  if (!brand || !parseHex(brand.color)) return base;
  const colors = { ...base.colors };
  if (base.id === "brand") {
    colors.brand = brand.color;
    colors.accent = ensureContrast(brand.color, colors.bg, 4.5);
  } else {
    // other themes keep their accent; the logo corner uses the school's colour (made readable on the bg)
    colors.brand = ensureContrast(brand.color, colors.bg, 3);
  }
  return { ...base, colors };
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
  v["--sl-accent-soft"] = alpha(theme.colors.accent, theme.dark ? 0.16 : 0.09);
  v["--sl-warn-soft"] = alpha(theme.colors.warn, theme.dark ? 0.16 : 0.1);
  v["--sl-on-accent"] =
    contrastRatio("#ffffff", theme.colors.accent) >= 3 ? "#ffffff" : "#000000";
  return v;
}

/** The diagram widgets' palette for a theme. */
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
    color: color(colorOverride ?? s.color, theme),
  };
}
