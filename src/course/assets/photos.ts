// Ground school — the sample photos the library ships (package N / P): the site's own photos in public/img
// (credits from public/img/credits.json, Unsplash License), plus the sample school logo drawn from code.

export interface PhotoDef {
  id: string;
  en: string;
  fr: string;
  src: string;
  w: number;
  h: number;
  tags: string[];
  attribution: string;
}

export const PHOTOS: PhotoDef[] = [
  {
    id: "c172-panel",
    en: "Light-aircraft panel",
    fr: "Tableau de bord d’avion léger",
    src: "img/hero-cockpit.jpg",
    w: 2400,
    h: 1600,
    tags: ["panel", "cockpit", "c172", "tableau"],
    attribution: "Photo: Grianghraf / Unsplash",
  },
  {
    id: "steam-panel",
    en: "Classic instrument panel",
    fr: "Tableau à aiguilles",
    src: "img/steam.jpg",
    w: 2400,
    h: 1600,
    tags: ["panel", "steam", "six-pack", "aiguilles"],
    attribution: "Photo: Shaun Darwood / Unsplash",
  },
  {
    id: "g1000-panel",
    en: "G1000 panel",
    fr: "Tableau G1000",
    src: "img/glass.jpg",
    w: 1400,
    h: 920,
    tags: ["g1000", "glass", "pfd", "mfd"],
    attribution: "IFR Trainer",
  },
  {
    id: "short-final",
    en: "Cessna 172 on short final",
    fr: "Cessna 172 en courte finale",
    src: "img/landing.jpg",
    w: 2400,
    h: 1600,
    tags: ["landing", "final", "c172", "atterrissage"],
    attribution: "Photo: Cody F / Unsplash",
  },
  {
    id: "low-pass",
    en: "Cessna 172 at sunset",
    fr: "Cessna 172 au coucher du soleil",
    src: "img/departure.jpg",
    w: 2400,
    h: 1600,
    tags: ["c172", "sunset", "departure", "départ"],
    attribution: "Photo: Marko Pavlichenko / Unsplash",
  },
  {
    id: "in-cloud",
    en: "Cessna 172 in the clouds",
    fr: "Cessna 172 dans les nuages",
    src: "img/sky.jpg",
    w: 2400,
    h: 1395,
    tags: ["imc", "clouds", "nuages", "weather"],
    attribution: "Photo: Matthias Wesselmann / Unsplash",
  },
  {
    id: "above-clouds",
    en: "Wing over the clouds",
    fr: "Aile au-dessus des nuages",
    src: "img/above.jpg",
    w: 2000,
    h: 1326,
    tags: ["clouds", "wing", "sunset", "aile"],
    attribution: "Photo: Alexander Korte / Unsplash",
  },
  {
    id: "sun-wing",
    en: "Wing in the sun",
    fr: "Aile au soleil",
    src: "img/clouds.jpg",
    w: 2400,
    h: 1600,
    tags: ["clouds", "wing", "sun", "soleil"],
    attribution: "Photo: Dan Convey / Unsplash",
  },
  {
    id: "airliner-dusk",
    en: "Airliner cockpit at dusk",
    fr: "Cockpit de ligne au crépuscule",
    src: "img/airliner.jpg",
    w: 2400,
    h: 1619,
    tags: ["airliner", "cockpit", "night", "ligne"],
    attribution: "Photo: Andrés Dallimonti / Unsplash",
  },
  {
    id: "pedestal",
    en: "Airliner centre pedestal",
    fr: "Pylône central",
    src: "img/crew.jpg",
    w: 2400,
    h: 1600,
    tags: ["airliner", "pedestal", "fmc", "ligne"],
    attribution: "Photo: Benjamin Chambon / Unsplash",
  },
];

/** The sample school logo (a placeholder a school replaces with its own): a wing mark and a wordmark. */
export function sampleLogoSvg(color: string, name = "AÉROCLUB ARDON"): string {
  const esc = name.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 64" width="360" height="64"><path d="M6 44 L44 14 L58 14 L30 44 Z" fill="${color}"/><path d="M34 44 L62 22 L72 22 L52 44 Z" fill="${color}" fill-opacity="0.55"/><text x="86" y="42" font-family="Inter, system-ui, sans-serif" font-size="25" font-weight="700" letter-spacing="1.6" fill="${color}">${esc}</text></svg>`;
}
