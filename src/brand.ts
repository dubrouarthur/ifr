// The product's name and tagline, in one place. Every UI string, page title and export that names the product
// reads it from here (the HTML pages get it at build time through the vite config's %BRAND_*% placeholders), so a
// rename is a one-line change. The installable-app manifest (public/manifest.webmanifest) is static: keep its
// "name" equal to BRAND.name (tests/shell-tablet.test.ts checks it).
/** a UI language (the same union as course/types Lang; kept local so the vite config can import this file) */
type Lang = "en" | "fr";

export const BRAND = {
  /** the product name, the same in every language */
  name: "Wingdeck",
  /** a short form for tight places (own-ship callsign, small badges) */
  short: "Wingdeck",
  tagline: {
    en: "An incredibly capable, simple IFR simulator, and a full teaching system built on slides",
    fr: "Un simulateur IFR incroyablement performant et simple, et un vrai système pédagogique construit sur des diapositives",
  },
} as const;

/** The tagline in a language. */
export const brandTagline = (lang: Lang): string => BRAND.tagline[lang === "fr" ? "fr" : "en"];
/** "Page — Wingdeck" (document titles). */
export const brandTitle = (page?: string): string => (page ? `${page} — ${BRAND.name}` : BRAND.name);
