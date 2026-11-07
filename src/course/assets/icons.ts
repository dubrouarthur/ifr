// Ground school — the shipped aviation icon set (package N / P). 24 × 24 line icons drawn for this library:
// one stroke weight (1.75), round joins, chart conventions where a symbol exists (VOR hexagon, NDB dots, RNAV
// waypoint star, intersection triangle). `currentColor` everywhere: the library recolours them to a theme token.

export interface IconDef {
  id: string;
  en: string;
  fr: string;
  tags: string[];
  /** inner SVG (viewBox 0 0 24 24) */
  body: string;
}

const S =
  'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="currentColor" stroke="none"';

export const ICONS: IconDef[] = [
  {
    id: "aircraft-top",
    en: "Aircraft (top view)",
    fr: "Avion (vue de dessus)",
    tags: ["aircraft", "plane", "avion", "ownship"],
    body: `<path ${F} d="M12 1.8c.9 0 1.5 1 1.5 2.4V9l8.2 3.6v2l-8.2-2v5.1l2.6 2v1.6L12 20.4l-4.1.9v-1.6l2.6-2v-5.1l-8.2 2v-2L10.5 9V4.2c0-1.4.6-2.4 1.5-2.4z"/>`,
  },
  {
    id: "aircraft-side",
    en: "Aircraft (side view)",
    fr: "Avion (profil)",
    tags: ["aircraft", "plane", "profile", "avion"],
    body: `<path ${S} d="M2.5 13.5h15.2c1.8 0 3.3-.6 3.8-1.5-.5-.9-2-1.5-3.8-1.5H8.6L5.2 6.5H3.4l1.3 4H2.5z"/><path ${S} d="M9.5 13.5l2.5 4h1.8l-.8-4M10 10.5l1.5-3.5h1.8l-.6 3.5"/>`,
  },
  {
    id: "vor",
    en: "VOR",
    fr: "VOR",
    tags: ["vor", "navaid", "radio", "station"],
    body: `<path ${S} d="M7.5 4.2h9L21 12l-4.5 7.8h-9L3 12z"/><circle ${F} cx="12" cy="12" r="1.6"/>`,
  },
  {
    id: "vordme",
    en: "VOR-DME",
    fr: "VOR-DME",
    tags: ["vor", "dme", "navaid", "station"],
    body: `<rect ${S} x="3" y="4.2" width="18" height="15.6" rx="1"/><path ${S} d="M8.2 6.4h7.6L19.6 12l-3.8 5.6H8.2L4.4 12z"/><circle ${F} cx="12" cy="12" r="1.5"/>`,
  },
  {
    id: "ndb",
    en: "NDB",
    fr: "NDB",
    tags: ["ndb", "adf", "navaid", "beacon", "balise"],
    body: `<circle ${F} cx="12" cy="12" r="1.9"/><circle fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-dasharray="0 3" cx="12" cy="12" r="5"/><circle fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-dasharray="0 3.1" cx="12" cy="12" r="8.6"/>`,
  },
  {
    id: "waypoint",
    en: "RNAV waypoint",
    fr: "Point RNAV",
    tags: ["waypoint", "rnav", "gps", "fix"],
    body: `<path ${S} d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/>`,
  },
  {
    id: "fix",
    en: "Intersection / fix",
    fr: "Point de report",
    tags: ["fix", "intersection", "report"],
    body: `<path ${S} d="M12 4.5l8 14H4z"/>`,
  },
  {
    id: "airport",
    en: "Airport",
    fr: "Aérodrome",
    tags: ["airport", "aerodrome", "field"],
    body: `<circle ${S} cx="12" cy="12" r="8.2"/><path fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" d="M8 16l8-8"/>`,
  },
  {
    id: "runway",
    en: "Runway",
    fr: "Piste",
    tags: ["runway", "piste", "landing"],
    body: `<path ${S} d="M8 2.5h8l1.5 19h-11z"/><path ${S} d="M12 6v2.4M12 11v2.4M12 16v2.4M9.4 20h5.2"/>`,
  },
  {
    id: "windsock",
    en: "Wind",
    fr: "Vent",
    tags: ["wind", "vent", "windsock", "manche"],
    body: `<path ${S} d="M4 21V3"/><path ${S} d="M4 4.5l15 2v5l-15 2z"/><path ${S} d="M9 5.2v7.6M14 5.8v6.4"/>`,
  },
  {
    id: "cloud",
    en: "Cloud",
    fr: "Nuage",
    tags: ["cloud", "weather", "imc", "nuage", "météo"],
    body: `<path ${S} d="M7 18.5h10.2a3.8 3.8 0 0 0 .6-7.6 5.6 5.6 0 0 0-10.7-1.4A4.5 4.5 0 0 0 7 18.5z"/>`,
  },
  {
    id: "thunderstorm",
    en: "Thunderstorm",
    fr: "Orage",
    tags: ["thunderstorm", "cb", "storm", "orage", "weather"],
    body: `<path ${S} d="M7.2 15.5A4.3 4.3 0 0 1 7 6.9a5.4 5.4 0 0 1 10.3 1.3 3.7 3.7 0 0 1 .3 7.3"/><path ${S} d="M12.8 12.5l-2.6 4.2h3.4l-2.4 4.8"/>`,
  },
  {
    id: "icing",
    en: "Icing",
    fr: "Givrage",
    tags: ["icing", "ice", "givre", "givrage"],
    body: `<path ${S} d="M12 2.8v18.4M4 7.4l16 9.2M20 7.4L4 16.6"/><path ${S} d="M9.6 4.4L12 6.6l2.4-2.2M9.6 19.6l2.4-2.2 2.4 2.2M4.6 10.6l3.1-1-.7-3.2M19.4 13.4l-3.1 1 .7 3.2M17 6.4l-.7 3.2 3.1 1M7 17.6l.7-3.2-3.1-1"/>`,
  },
  {
    id: "fog",
    en: "Fog / low visibility",
    fr: "Brouillard",
    tags: ["fog", "mist", "visibility", "brouillard", "rvr"],
    body: `<path ${S} d="M3.5 8h13M6 12h14.5M3.5 16h11M8 20h9"/>`,
  },
  {
    id: "compass",
    en: "Compass rose",
    fr: "Rose des vents",
    tags: ["compass", "heading", "north", "cap", "nord"],
    body: `<circle ${S} cx="12" cy="12" r="8.8"/><path ${F} d="M12 4.6l2.2 7.4h-4.4z"/><path ${S} d="M9.8 12L12 19.4 14.2 12"/><path ${S} d="M12 1.6v1.6M12 20.8v1.6M1.6 12h1.6M20.8 12h1.6"/>`,
  },
  {
    id: "timer",
    en: "Timer",
    fr: "Chrono",
    tags: ["timer", "clock", "time", "chrono", "temps"],
    body: `<circle ${S} cx="12" cy="13.5" r="7.5"/><path ${S} d="M12 13.5V9.2M9.8 2.8h4.4M12 2.8V6M18.4 6.6l1.4-1.4"/>`,
  },
  {
    id: "fuel",
    en: "Fuel",
    fr: "Carburant",
    tags: ["fuel", "carburant", "avgas", "endurance"],
    body: `<path ${S} d="M4.5 20.5V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 13.5 5v15.5M3 20.5h12M6.8 7.5h4.4v3.5H6.8z"/><path ${S} d="M13.5 9.5h1.8a1.2 1.2 0 0 1 1.2 1.2v5.6a1.3 1.3 0 0 0 2.6 0V8.2l-2.4-2.6"/>`,
  },
  {
    id: "headset",
    en: "Headset / ATC",
    fr: "Casque / ATC",
    tags: ["atc", "radio", "headset", "casque", "clearance"],
    body: `<path ${S} d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2"/><rect ${S} x="3.5" y="13.5" width="3.6" height="6" rx="1.4"/><rect ${S} x="16.9" y="13.5" width="3.6" height="6" rx="1.4"/><path ${S} d="M18.7 19.5c0 1.4-1.6 2.2-4.2 2.2h-1.3"/>`,
  },
  {
    id: "checklist",
    en: "Checklist",
    fr: "Check-list",
    tags: ["checklist", "procedure", "flow"],
    body: `<rect ${S} x="5" y="4" width="14" height="17.5" rx="1.6"/><path ${S} d="M9 2.8h6v2.6H9zM8.2 10.2l1.3 1.3 2.2-2.4M8.2 15.7l1.3 1.3 2.2-2.4M13.6 10.6h2.6M13.6 16.1h2.6"/>`,
  },
  {
    id: "warning",
    en: "Caution",
    fr: "Attention",
    tags: ["warning", "caution", "attention", "danger"],
    body: `<path ${S} d="M10.4 4.2a1.8 1.8 0 0 1 3.2 0l7.3 13.2a1.8 1.8 0 0 1-1.6 2.7H4.7a1.8 1.8 0 0 1-1.6-2.7z"/><path ${S} d="M12 9.2v4.6"/><circle ${F} cx="12" cy="16.8" r="1.1"/>`,
  },
  {
    id: "hold",
    en: "Holding pattern",
    fr: "Attente",
    tags: ["hold", "holding", "racetrack", "attente"],
    body: `<path ${S} d="M7 7.5h10a4.5 4.5 0 0 1 0 9H7a4.5 4.5 0 0 1 0-9z"/><path ${F} d="M18.8 13.6l-2.6 2.9 3.4.5z"/><path ${S} d="M7 16.5l-1.8 2.6h3.6z"/>`,
  },
  {
    id: "glidepath",
    en: "Glidepath",
    fr: "Plan de descente",
    tags: ["glidepath", "glideslope", "descent", "ils", "descente"],
    body: `<path ${S} d="M2.5 19.5h19"/><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-dasharray="2.2 2.4" d="M3 6l15 12.4"/><path ${S} d="M18 19.5v-2.2M15.5 4.5l3.5 1.5-3.5 1.5"/>`,
  },
  {
    id: "terrain",
    en: "Terrain",
    fr: "Relief",
    tags: ["terrain", "mountain", "msa", "relief", "obstacle"],
    body: `<path ${S} d="M2.5 19.5l6.2-10.4 3.5 5.6 2.6-3.8 6.7 8.6z"/><path ${S} d="M7.2 11.6l1.5 1.4 1.4-1.1"/>`,
  },
  {
    id: "tower",
    en: "Control tower",
    fr: "Tour de contrôle",
    tags: ["tower", "atc", "twr", "tour"],
    body: `<path ${S} d="M6 6.5h12l-1.5 4.5h-9zM9 11l-1 10.5h8L15 11M12 6.5V3M10.2 3h3.6"/>`,
  },
  {
    id: "turn-left",
    en: "Turn left",
    fr: "Virage à gauche",
    tags: ["turn", "left", "gauche", "virage"],
    body: `<path ${S} d="M19 20v-6.5A6.5 6.5 0 0 0 12.5 7H5"/><path ${S} d="M8.8 3.2L5 7l3.8 3.8"/>`,
  },
  {
    id: "turn-right",
    en: "Turn right",
    fr: "Virage à droite",
    tags: ["turn", "right", "droite", "virage"],
    body: `<path ${S} d="M5 20v-6.5A6.5 6.5 0 0 1 11.5 7H19"/><path ${S} d="M15.2 3.2L19 7l-3.8 3.8"/>`,
  },
  {
    id: "altimeter",
    en: "Gauge",
    fr: "Instrument",
    tags: ["gauge", "instrument", "altimeter", "altimètre"],
    body: `<circle ${S} cx="12" cy="12" r="8.8"/><path ${S} d="M12 12l4.2-4.6M12 3.2v2M20.8 12h-2M12 20.8v-2M3.2 12h2"/><circle ${F} cx="12" cy="12" r="1.4"/>`,
  },
  {
    id: "thermometer",
    en: "Temperature",
    fr: "Température",
    tags: ["temperature", "oat", "isa", "température"],
    body: `<path ${S} d="M10 14.2V4.8a2 2 0 0 1 4 0v9.4a4 4 0 1 1-4 0z"/><path ${S} d="M12 9v7.5M16.6 6h2.4M16.6 9.5h2.4"/>`,
  },
  {
    id: "map",
    en: "Chart",
    fr: "Carte",
    tags: ["map", "chart", "carte", "route"],
    body: `<path ${S} d="M3.5 6.2l5.5-2.2 6 2.2 5.5-2.2v13.8L15 20l-6-2.2-5.5 2.2z"/><path ${S} d="M9 4v13.8M15 6.2V20"/>`,
  },
  {
    id: "student",
    en: "Your turn",
    fr: "À vous",
    tags: ["student", "your turn", "à vous", "hand", "control"],
    body: `<circle ${S} cx="12" cy="12" r="8.8"/><circle ${S} cx="12" cy="12" r="2.6"/><path ${S} d="M3.4 11h6M14.6 11h6M12 14.6v6"/>`,
  },
];

/** A complete standalone SVG document for an icon, in `color` (default currentColor → black in an <img>). */
export function iconSvg(def: IconDef, color = "#111827", size = 96): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" style="color:${color}">${def.body.replace(/currentColor/g, color)}</svg>`;
}
