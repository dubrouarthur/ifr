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
  /** what the product is, in one line (intro headline, Flight Center hero, page descriptions) */
  tagline: {
    en: "The platform for aviation education",
    fr: "La plateforme de l’éducation aéronautique",
  },
  /** what it brings together, in a few words (the eyebrow over the headline) */
  eyebrow: {
    en: "Slides · Flight simulator",
    fr: "Diapositives · Simulateur de vol",
  },
  /** the one-sentence pitch under the tagline: one tool, slides and a simulator; build, teach, fly (no claims the
   *  product does not back). FR says "pratiquez-les" ("volez-les" reads first as "steal them") and glues
   *  "simulateur de vol" with no-break spaces, so a balanced wrap never splits the compound noun. */
  lead: {
    en: "Slides and a flight\u00a0simulator in one tool: build your courses, teach them in class, then fly them in the simulator.",
    fr: "Des diapositives et un simulateur\u00a0de\u00a0vol réunis\u00a0: créez vos cours, enseignez-les en salle, puis pratiquez-les au simulateur.",
  },
  /** who it is for (under the pitch) */
  audience: {
    en: "For aeroclubs and flight schools, from LAPL and PPL to IR and ATPL theory.",
    fr: "Pour les aéroclubs et les écoles de pilotage, du LAPL et du PPL jusqu’à l’IR et la théorie ATPL.",
  },
  /** who it is for, as people (the start page's first "for whom" line) */
  who: {
    en: "Students, instructors, clubs, schools",
    fr: "Élèves, instructeurs, aéroclubs, écoles",
  },
  /** the programmes the course library covers (the start page's second "for whom" line) */
  programmes: {
    en: "LAPL · PPL · IR · ATPL theory",
    fr: "LAPL · PPL · IR · théorie ATPL",
  },
} as const;

/** The tagline in a language. */
export const brandTagline = (lang: Lang): string => BRAND.tagline[lang === "fr" ? "fr" : "en"];
/** The pitch under the tagline. */
export const brandLead = (lang: Lang): string => BRAND.lead[lang === "fr" ? "fr" : "en"];
/** The eyebrow over the headline. */
export const brandEyebrow = (lang: Lang): string => BRAND.eyebrow[lang === "fr" ? "fr" : "en"];
/** Who it is for. */
export const brandAudience = (lang: Lang): string => BRAND.audience[lang === "fr" ? "fr" : "en"];
/** Who it is for, as people (students, instructors, clubs, schools). */
export const brandWho = (lang: Lang): string => BRAND.who[lang === "fr" ? "fr" : "en"];
/** The programmes the library covers (LAPL · PPL · IR · ATPL theory). */
export const brandProgrammes = (lang: Lang): string => BRAND.programmes[lang === "fr" ? "fr" : "en"];
/** "Page — Wingdeck" (document titles). */
export const brandTitle = (page?: string): string => (page ? `${page} — ${BRAND.name}` : BRAND.name);
/** The name-agnostic mark (a compass ring with lubber ticks, the magenta course line, the accent centre dot), as
 *  inline SVG markup: the ring follows `currentColor`; a temporary placeholder until the name is chosen. */
export const brandMarkSvg = (size = 30): string =>
  `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true" focusable="false"><circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 1.5v5M16 25.5v5" stroke="currentColor" stroke-width="2"/><path d="M9 25 23 7" stroke="#a8238f" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="16" r="2.4" fill="#1d5fd1"/></svg>`;
