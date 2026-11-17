// « Adapter à mon terrain »: an ICAO code in, six or seven ready slides about that field out, from the app's own navdata
// (public/navdata, nav/world.ts realAirfield). The numbers come from the data set (elevation, runway ends, lengths,
// frequencies, nearby navaids) and say so where they stand (« à vérifier sur la carte VAC »): a data set can be older
// than the chart. The QFU uses today's variation (nav/declination.ts) when the data set publishes none. The geometry is
// drawn from the runway ends themselves, and every piece of local knowledge the data set does not hold (the circuit,
// the local rules) is a box the instructor fills, marked « à compléter ». Anything about procedures says where to
// check it: the VAC chart in force for a French field, the official chart (the country's AIP) elsewhere.
//   1 title        « Toussus-le-Noble (LFPN) », the elevation, the runways, the longest one, a sketch of the runways
//   2 runways      the runway plan drawn to scale, each end labelled with its number and QFU, the list beside it
//   3 radio        frequencies and the navaids within 40 NM (bearing and distance from the field; a localizer's course)
//   3b your turn   a live HSI on the nearest VOR, the OBS on the slide, « centrez la barre avec TO » ticked live
//                  (only when a VOR lies within 30 NM)
//   4 view         the field from a 0.3 NM final (the slide's « Vue simulateur », placed on that runway; 1.5 NM too)
//   5 your turn    the takeoff from the longest runway in the simulator, its goal checked automatically
//   6 briefing     what the instructor adds (circuit, entries, local rules), all « à compléter »
// The situations sit on the real runway (pose: runway + distance): on a slide the field is known through the slide
// registry (nav/data.ts registerSlideAirport), in the cockpit the course bridge loads the region first.
import type {
  L10n,
  Lang,
  SimScene,
  SlideBlock,
  SlideCanvas,
  World,
} from "./types";
import type { DeckStarter } from "./ui/deckStarters";
import type { NearbyNavaid, RealAirfield } from "../nav/world";
import type { Navaid, Runway } from "../nav/types";
import { bearingDeg, destination, distanceNm } from "../nav/geo";
import { G, INST, L, SHAPE, T, ARROW } from "./canvas/layouts";
import { DEFAULT_GRID } from "./canvas/geom";
import { CHECKLIST, G as GOAL, SAMPLE_DATE } from "./samples/kit";
import { sceneFromFields } from "./scene";

export type AirfieldKitError = "format" | "unknown" | "offline";
export interface AirfieldKit {
  ok: true;
  icao: string;
  /** the field's name, cleaned (« Toussus-le-Noble ») */
  name: string;
  field: RealAirfield;
  /** the six or seven slides, in order, with their titles and what the presenter says */
  slides: { title: L10n; slide: SlideCanvas; notes: L10n }[];
  /** the situations the slides show (a short final, the runway for the takeoff) */
  scenes: Record<string, SimScene>;
  /** the slides as a template: « Nouveau cours » and the studio's « Modèles » add it like any other */
  starter: DeckStarter;
}
export interface AirfieldKitFailure {
  ok: false;
  code: AirfieldKitError;
  /** one friendly sentence, in the language asked */
  message: string;
}
export type AirfieldKitResult = AirfieldKit | AirfieldKitFailure;

/** An ICAO location indicator: a letter, then 3 letters or digits (LFPN, KSFO, EGLL). */
export { ICAO_RE } from "./airfields";
import { ICAO_RE, registerSlideField } from "./airfields";
export function normIcao(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, "");
}

const fail = (
  code: AirfieldKitError,
  icao: string,
  lang: Lang,
): AirfieldKitFailure => {
  const fr = lang === "fr";
  const m: Record<AirfieldKitError, [string, string]> = {
    format: [
      "Type the field’s 4-letter ICAO code, for example LFPN.",
      "Tapez le code OACI du terrain, en 4 lettres, par exemple LFPN.",
    ],
    unknown: [
      `${icao} is not in the app’s navigation data. Check the ICAO code (4 letters, for example LFPN).`,
      `${icao} n’est pas dans les données de navigation de l’application. Vérifiez le code OACI (4 lettres, par exemple LFPN).`,
    ],
    offline: [
      "The navigation data could not be loaded. Check the connection and try again.",
      "Les données de navigation n’ont pas pu être chargées. Vérifiez la connexion et réessayez.",
    ],
  };
  return { ok: false, code, message: m[code][fr ? 1 : 0] };
};

/**
 * The airfield kit for an ICAO code: reads the field from the navdata, registers it for the slides (their situations
 * and their outside view find it) and builds its slides. Never throws: an unknown code or no data is a failure
 * with one sentence to show.
 */
export async function airfieldKit(
  icao: string,
  lang: Lang,
): Promise<AirfieldKitResult> {
  const code = normIcao(icao);
  if (!ICAO_RE.test(code)) return fail("format", code, lang);
  let field: RealAirfield | null;
  try {
    const { realAirfield } = await import("../nav/world");
    field = await realAirfield(code);
  } catch {
    return fail("offline", code, lang);
  }
  if (!field) return fail("unknown", code, lang);
  registerSlideField(field);
  return airfieldKitFrom(field);
}

// ------------------------------------------------------------------ words and numbers
/** « Toussus-le-Noble Airport » → « Toussus-le-Noble » (the data set's names are in English) */
export function fieldName(raw: string): string {
  const s = raw
    .replace(/\s+(Airport|Airfield|Aerodrome|Air Field)$/i, "")
    .trim();
  return s || raw;
}
const pad3 = (n: number) =>
  String(Math.round(((n % 360) + 360) % 360) || 360).padStart(3, "0");
/** a number as each language writes it: « 1 488 » and « 120,75 » (a space, as the house decks write « 3 000 ft ») / "1,488", "120.75" */
const num = (n: number, lang: Lang, digits = 0) => {
  const [i, d] = Math.abs(n).toFixed(digits).split(".");
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, lang === "fr" ? " " : ",");
  return `${n < 0 ? "−" : ""}${g}${d ? (lang === "fr" ? "," : ".") + d : ""}`;
};
const both = (f: (l: Lang) => string): L10n => ({ en: f("en"), fr: f("fr") });
const meters = (ft: number) => Math.round((ft * 0.3048) / 10) * 10;
const surface = (s: string, lang: Lang): string => {
  const u = s.toUpperCase();
  const fr = lang === "fr";
  if (/ASP|CON|PEM|BIT|PAV|TAR|ASF/.test(u)) return fr ? "revêtue" : "paved";
  if (/GRS|GRASS|TURF|GRE/.test(u)) return fr ? "en herbe" : "grass";
  if (/GRV|GRAVEL/.test(u)) return fr ? "gravier" : "gravel";
  if (/WATER|WAT/.test(u)) return fr ? "plan d’eau" : "water";
  return u ? (fr ? `revêtement ${u}` : `surface ${u}`) : "";
};
/** where procedures are checked: the SIA chart for a French field, the official chart elsewhere */
function chartRef(f: RealAirfield): L10n {
  return f.country === "FR"
    ? L(
        "to check on the SIA chart in force",
        "à vérifier sur la carte SIA en vigueur",
      )
    : L(
        "to check on the official chart in force (the country’s AIP)",
        "à vérifier sur la carte officielle en vigueur (AIP du pays)",
      );
}
/** a frequency with the data set's own precision (never padded to look like a chart's channel): com 120,75 MHz,
 *  127,475 MHz · VOR / ILS 108,25 MHz · NDB 315 kHz */
function freqText(n: NearbyNavaid | number, lang: Lang): string {
  if (typeof n === "number") {
    const d = Math.min(3, Math.max(2, (String(n).split(".")[1] ?? "").length));
    return `${num(n, lang, d)} MHz`;
  }
  if (n.type === "NDB") return `${num(n.freq, lang, Number.isInteger(n.freq) ? 0 : 1)} kHz`;
  return `${num(n.freq, lang, 2)} MHz`;
}

/** the chart a student checks a figure on, in a few words: the VAC for a French field */
function chartShort(f: RealAirfield): L10n {
  return f.country === "FR"
    ? L("check on the VAC chart", "à vérifier sur la carte VAC")
    : L("check on the official chart", "à vérifier sur la carte officielle");
}
/** fields in an 8.33 kHz area (Europe): a 25 kHz value in the data set may name a different published channel */
const EU833 = new Set(
  "FR BE NL LU DE AT CH IT ES PT GB IE DK NO SE FI IS PL CZ SK HU SI HR GR MT CY EE LV LT RO BG".split(" "),
);
/** The runway pairs of a field: both ends of each physical runway, as nav/world tileRunways builds them. */
function pairs(f: RealAirfield): [Runway, Runway][] {
  const r = f.airport.runways;
  const out: [Runway, Runway][] = [];
  for (let i = 0; i + 1 < r.length; i += 2) out.push([r[i], r[i + 1]]);
  return out;
}
/** the runway the slides fly: the longest (its first end); the instructor changes it in « Situation de vol » */
function mainRunway(f: RealAirfield): Runway {
  return [...f.airport.runways].sort((a, b) => b.lengthFt - a.lengthFt)[0];
}

// ------------------------------------------------------------------ the runway plan (real geometry)
/** a block that is part of a drawn figure: on the slide, never in the reader text (the figure's description is) */
const fig = (b: SlideBlock): SlideBlock => ({ ...b, figure: true });
/** where a runway lies on the field, as a briefing says it (« au nord », "to the north") */
function side(dx: number, dy: number, lang: Lang): string {
  const i = Math.round(((((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360) / 45)) % 8;
  return lang === "fr"
    ? ["au nord", "au nord-est", "à l’est", "au sud-est", "au sud", "au sud-ouest", "à l’ouest", "au nord-ouest"][i]
    : ["to the north", "to the north-east", "to the east", "to the south-east", "to the south", "to the south-west", "to the west", "to the north-west"][i];
}
/** The runway plan in words (its description for a screen reader and the phone's reading view). */
export function runwayPlanAlt(f: RealAirfield): L10n {
  const ap = f.airport;
  const k = Math.cos((ap.lat * Math.PI) / 180);
  const ps = pairs(f);
  const mid = ps.map(([a, b]) => ({
    x: ((a.end.lon + b.end.lon) / 2 - ap.lon) * k * 60,
    y: ((a.end.lat + b.end.lat) / 2 - ap.lat) * 60,
  }));
  const cx = mid.reduce((s, m) => s + m.x, 0) / Math.max(1, mid.length);
  const cy = mid.reduce((s, m) => s + m.y, 0) / Math.max(1, mid.length);
  const spread = Math.max(0, ...mid.map((m) => Math.hypot(m.x - cx, m.y - cy)));
  return both((l) => {
    const one = ps.map(([a, b], i) => {
      const dx = mid[i].x - cx,
        dy = mid[i].y - cy;
      const where =
        ps.length < 2 || Math.hypot(dx, dy) < Math.max(0.05, spread * 0.3)
          ? ""
          : ` ${side(dx, dy, l)}`;
      return `${a.id}/${b.id} (${pad3(a.heading)}°/${pad3(b.heading)}°, ${num(meters(a.lengthFt), l)} m)${where}`;
    });
    return l === "fr"
      ? `Plan des pistes à l’échelle, nord magnétique en haut : ${one.join(" ; ")}.`
      : `Runway plan to scale, magnetic north up: ${one.join("; ")}.`;
  });
}

/** One label per runway end (number above, QFU below), or one for parallel ends side by side (« 28L · 28R »). */
interface EndLabel {
  ids: string[];
  qfu: string[];
  x: number;
  y: number;
  w: number;
}
const LABEL_H = 88;
const labelW = (n: number) => (n < 2 ? 180 : 132 + 96 * n);
/** two label frames overlap (with a small gap) */
const clash = (a: EndLabel, b: EndLabel, gap = 8) =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < LABEL_H + gap;
/** a runway end as the plan draws it: where it is, which way is out (along the runway), what it is called */
export interface PlanEnd {
  id: string;
  heading: number;
  /** the end of the strip on the slide */
  ax: number;
  ay: number;
  /** outward along the runway (unit vector) */
  ux: number;
  uy: number;
}
/** a runway strip on the slide: from A to B, half its drawn width */
export interface PlanStrip {
  A: { X: number; Y: number };
  B: { X: number; Y: number };
  half: number;
}
/** how far beyond its end a label of width w sits so that its box clears the end */
const offFor = (w: number, ux: number, uy: number) =>
  Math.abs(ux) * (w / 2) + Math.abs(uy) * (LABEL_H / 2) + 14;
/** the label's box crosses a strip (sampled along the strip, the box grown by the strip's half width) */
function onStrip(l: EndLabel, st: PlanStrip[]): boolean {
  for (const s of st) {
    const len = Math.hypot(s.B.X - s.A.X, s.B.Y - s.A.Y);
    const n = Math.max(2, Math.ceil(len / 6));
    for (let i = 0; i <= n; i++) {
      const x = s.A.X + ((s.B.X - s.A.X) * i) / n,
        y = s.A.Y + ((s.B.Y - s.A.Y) * i) / n;
      if (
        Math.abs(x - l.x) < l.w / 2 + s.half + 4 &&
        Math.abs(y - l.y) < LABEL_H / 2 + s.half + 4
      )
        return true;
    }
  }
  return false;
}
/**
 * Place the end labels without collisions: ends of parallel runways whose labels would overlap become one label
 * (« 28L · 28R / QFU 284° ») beyond both ends; a label that would sit on a strip moves further out along its runway;
 * any other overlap is pushed apart, then every label is kept inside the box.
 */
export function placeEndLabels(
  ends: PlanEnd[],
  box: { x: number; y: number; w: number; h: number },
  strips: PlanStrip[] = [],
): EndLabel[] {
  type W = EndLabel & PlanEnd & { n: number };
  const at = (e: W) => {
    const o = offFor(e.w, e.ux, e.uy);
    e.x = e.ax + e.ux * o;
    e.y = e.ay + e.uy * o;
    return e;
  };
  let ls: W[] = ends.map((e) =>
    at({ ...e, ids: [e.id], qfu: [pad3(e.heading)], x: 0, y: 0, w: labelW(1), n: 1 }),
  );
  // 1 merge parallel ends that collide (same QFU within 5°)
  for (let merged = true; merged; ) {
    merged = false;
    outer: for (let i = 0; i < ls.length; i++)
      for (let j = i + 1; j < ls.length; j++) {
        const a = ls[i],
          b = ls[j];
        const dh = Math.abs(((a.heading - b.heading + 540) % 360) - 180);
        // close side by side (their labels would stack): far-apart parallels keep a label each
        const cross = Math.abs((b.ax - a.ax) * -a.uy + (b.ay - a.ay) * a.ux);
        if (dh > 5 || cross > 120 || !clash(a, b, 40)) continue;
        const n = a.n + b.n;
        const ids = [...a.ids, ...b.ids].sort((p, q) => {
          const o = (s: string) => ({ L: 0, C: 1, R: 2 })[s.slice(-1)] ?? 1;
          return p.slice(0, 2).localeCompare(q.slice(0, 2)) || o(p) - o(q);
        });
        const ux = a.ux + b.ux,
          uy = a.uy + b.uy;
        const k = Math.hypot(ux, uy) || 1;
        // beyond the end that lies furthest out, so the one label clears both strips
        const pa = a.ax * (ux / k) + a.ay * (uy / k),
          pb = b.ax * (ux / k) + b.ay * (uy / k);
        const far = Math.max(pa, pb);
        const mx = (a.ax * a.n + b.ax * b.n) / n,
          my = (a.ay * a.n + b.ay * b.n) / n;
        const pm = mx * (ux / k) + my * (uy / k);
        const m: W = at({
          id: ids.join("-"),
          heading: a.heading,
          ax: mx + (ux / k) * (far - pm),
          ay: my + (uy / k) * (far - pm),
          ux: ux / k,
          uy: uy / k,
          ids,
          qfu: [...new Set([...a.qfu, ...b.qfu])].sort(),
          x: 0,
          y: 0,
          w: labelW(n),
          n,
        });
        ls = [...ls.filter((_, q) => q !== i && q !== j), m];
        merged = true;
        break outer;
      }
  }
  // 2 inside the box and off the strips: a label the box's edge pushes back onto a strip tries the places around its
  // end (turned from the runway's axis, a little further out), the nearest first
  const lo = (l: EndLabel) => ({
    x0: box.x + l.w / 2 + 8,
    x1: box.x + box.w - l.w / 2 - 8,
    y0: box.y + LABEL_H / 2 + 56,
    y1: box.y + box.h - LABEL_H / 2 - 64,
  });
  const keep = (l: EndLabel) => {
    const b = lo(l);
    l.x = Math.max(b.x0, Math.min(b.x1, l.x));
    l.y = Math.max(b.y0, Math.min(b.y1, l.y));
  };
  ls.forEach(keep);
  ls.forEach((l, i) => {
    if (!onStrip(l, strips)) return;
    const b = lo(l);
    for (const grow of [0, 24, 56, 96])
      for (const turn of [0, 25, -25, 50, -50, 75, -75, 100, -100]) {
        const a = (turn * Math.PI) / 180;
        const dx = l.ux * Math.cos(a) - l.uy * Math.sin(a),
          dy = l.ux * Math.sin(a) + l.uy * Math.cos(a);
        const o = offFor(l.w, dx, dy) + grow;
        const c = { ...l, x: l.ax + dx * o, y: l.ay + dy * o };
        if (c.x < b.x0 || c.x > b.x1 || c.y < b.y0 || c.y > b.y1) continue;
        if (onStrip(c, strips) || ls.some((m, j) => j !== i && clash(c, m))) continue;
        l.x = c.x;
        l.y = c.y;
        return;
      }
  });
  // 3 push apart what still overlaps (along the shorter way out), still inside the box
  for (let it = 0; it < 60; it++) {
    let moved = false;
    for (let i = 0; i < ls.length; i++)
      for (let j = i + 1; j < ls.length; j++) {
        const a = ls[i],
          b = ls[j];
        if (!clash(a, b)) continue;
        moved = true;
        const ox = (a.w + b.w) / 2 + 10 - Math.abs(a.x - b.x);
        const oy = LABEL_H + 10 - Math.abs(a.y - b.y);
        if (ox < oy) {
          const s = a.x <= b.x ? -1 : 1;
          a.x += (s * ox) / 2;
          b.x -= (s * ox) / 2;
        } else {
          const s = a.y <= b.y ? -1 : 1;
          a.y += (s * oy) / 2;
          b.y -= (s * oy) / 2;
        }
        keep(a);
        keep(b);
      }
    if (!moved) break;
  }
  return ls.map(({ ids, qfu, x, y, w }) => ({ ids, qfu, x, y, w }));
}

/**
 * The runways of the field drawn to scale in a box: one dark strip per runway with its centre line, rotated to its
 * real heading (grid north up is magnetic north: the field's frame), each end labelled with its number and QFU
 * (parallel ends share one label). The labels, the north arrow and the scale are part of the figure: the reader text
 * gets the plan's description instead (runwayPlanAlt, on the box behind it).
 */
export function runwayPlan(
  f: RealAirfield,
  box: { x: number; y: number; w: number; h: number },
  o: { labels?: boolean; prefix?: string; margin?: number } = {},
): SlideBlock[] {
  const labels = o.labels ?? true;
  const id = o.prefix ?? "rp";
  // room around the runways for their labels (grown when a label could only sit on a strip)
  const extra = o.margin ?? 0;
  const ap = f.airport;
  const k = Math.cos((ap.lat * Math.PI) / 180);
  const xy = (p: { lat: number; lon: number }) => ({
    x: (p.lon - ap.lon) * k * 60,
    y: (p.lat - ap.lat) * 60,
  });
  const ps = pairs(f);
  const pts = ps.flatMap(([a, b]) => [xy(a.end), xy(b.end)]);
  if (!pts.length) return [];
  const minX = Math.min(...pts.map((p) => p.x)),
    maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y)),
    maxY = Math.max(...pts.map((p) => p.y));
  const mx = labels ? 200 + extra : 56,
    my = labels ? 120 + extra / 2 : 56;
  const sc = Math.min(
    (box.w - 2 * mx) / Math.max(0.05, maxX - minX),
    (box.h - 2 * my) / Math.max(0.05, maxY - minY),
  );
  const cx = box.x + box.w / 2 - ((minX + maxX) / 2) * sc;
  const cy = box.y + box.h / 2 + ((minY + maxY) / 2) * sc;
  const P = (p: { lat: number; lon: number }) => {
    const q = xy(p);
    return { X: cx + q.x * sc, Y: cy - q.y * sc };
  };
  const out: SlideBlock[] = [];
  const ends: PlanEnd[] = [];
  const strips: PlanStrip[] = [];
  ps.forEach(([a, b], i) => {
    // a's threshold end is b's far end: the physical runway runs from b.end (a's end) to a.end (b's end)
    const A = P(b.end),
      B = P(a.end);
    const len = Math.hypot(B.X - A.X, B.Y - A.Y);
    const ux = (B.X - A.X) / Math.max(1, len),
      uy = (B.Y - A.Y) / Math.max(1, len);
    const wpx = Math.max(
      labels ? 22 : 14,
      Math.min(48, (a.widthFt / 6076.12) * sc),
    );
    const rot = Math.round(((Math.atan2(uy, ux) * 180) / Math.PI) * 10) / 10;
    const mx = (A.X + B.X) / 2,
      my = (A.Y + B.Y) / 2;
    out.push(
      SHAPE("rect", mx - len / 2, my - wpx / 2, len, wpx, {
        id: `${id}.rw${i}`,
        fill: "text",
        stroke: null,
        rot,
        z: 1,
        group: `${id}.g${i}`,
      }),
    );
    if (len > 120)
      out.push(
        SHAPE("line", mx - len / 2 + 24, my - 8, len - 48, 16, {
          id: `${id}.cl${i}`,
          stroke: "white",
          strokeW: 2,
          dash: true,
          rot,
          z: 2,
          group: `${id}.g${i}`,
        }),
      );
    // each end: its number (the runway landing from that end) and its QFU, just beyond the end
    strips.push({ A, B, half: wpx / 2 });
    for (const [rw, at, dir] of [
      [a, A, -1],
      [b, B, 1],
    ] as const)
      ends.push({ id: rw.id, heading: rw.heading, ax: at.X, ay: at.Y, ux: dir * ux, uy: dir * uy });
  });
  if (!labels) return out;
  const placed = placeEndLabels(ends, box, strips);
  // a label still on a strip (pushed back by the box's edge): the same plan a little smaller, with more room
  if (extra < 200 && placed.some((l) => onStrip(l, strips)))
    return runwayPlan(f, box, { ...o, margin: extra + 20 });
  for (const l of placed) {
    const key = l.ids.join("-");
    const name = l.ids.join(" · ");
    const q = `QFU ${l.qfu.map((x) => `${x}°`).join(" / ")}`;
    out.push(
      fig(
        T("heading", L(name, name), l.x - l.w / 2, l.y - 44, l.w, 52, {
          id: `${id}.n${key}`,
          align: "center",
          valign: "middle",
          z: 3,
        }),
      ),
      fig(
        T("small", L(q, q), l.x - l.w / 2, l.y + 8, l.w, 36, {
          id: `${id}.q${key}`,
          align: "center",
          color: "muted",
          z: 3,
        }),
      ),
    );
  }
  // magnetic north (the field's frame) and a scale bar
  out.push(
    fig(
      ARROW([box.x + 24, box.y + 96], [box.x + 24, box.y + 16], {
        id: `${id}.north`,
        color: "accent",
        strokeW: 3,
      }),
    ),
    fig(
      T(
        "eyebrow",
        L("N (magnetic)", "N (magnétique)"),
        box.x + 48,
        box.y + 16,
        280,
        32,
        { id: `${id}.nt` },
      ),
    ),
  );
  const steps = [100, 200, 250, 500, 1000, 2000];
  const pxPerM = sc / 1852;
  const want = steps.find((s) => s * pxPerM >= 120) ?? 2000;
  const bar = Math.round(want * pxPerM);
  const bx = box.x + box.w - bar - 16,
    by = box.y + box.h - 24;
  out.push(
    fig(
      SHAPE("line", bx, by - 8, bar, 16, {
        id: `${id}.scale`,
        stroke: "text",
        strokeW: 3,
      }),
    ),
    fig(
      T(
        "small",
        L(`${want} m`, `${want} m`),
        bx + bar - Math.max(bar, 144),
        by - 52,
        Math.max(bar, 144),
        36,
        {
          id: `${id}.st`,
          align: bar >= 144 ? "center" : "right",
          color: "muted",
        },
      ),
    ),
  );
  return out;
}

// ------------------------------------------------------------------ the live HSI (« À vous » on the slide)
/**
 * The on-slide task: on a long final to the main runway with NAV 1 on the nearest VOR, the student turns the OBS
 * until the bar centres with TO: the course then read is the QDM to the station. Built from the field's own data
 * (the VOR, the runway); null when no VOR lies within 30 NM.
 */
function vorTask(
  f: RealAirfield,
  main: Runway,
  id: string,
  world: World,
): { scene: SimScene; vor: Navaid; distNm: number; qdm: number; obs: number } | null {
  const vor = f.beacons.find(
    (n) => (n.type === "VOR" || n.type === "VORDME") && distanceNm(f.airport, n) <= 30,
  );
  if (!vor) return null;
  // where resolveFieldsPos puts { runway, distNm }: back along the final from the threshold
  const back = bearingDeg(main.end, main.threshold);
  let distNm = 10;
  let pos = destination(main.threshold, back, distNm);
  for (const d of [10, 6, 14]) {
    pos = destination(main.threshold, back, d);
    distNm = d;
    if (distanceNm(pos, vor) >= 4) break;
  }
  const qdm = Math.round(bearingDeg(pos, vor)) % 360;
  // the OBS starts 50° off, on the side that keeps a TO flag: the student brings it back
  const obs = (Math.round((qdm + 50) / 10) * 10) % 360;
  const altFt = Math.round((f.airport.elevFt + 2000) / 100) * 100;
  const scene = sceneFromFields(
    {
      kind: "fields",
      pos: { runway: { icao: f.airport.icao, id: main.id }, distNm },
      altFt,
      hdg: Math.round(main.heading),
      iasKt: 100,
      radios: { nav1: vor.freq, obs1: obs, cdi: "NAV1" },
    },
    {
      id,
      label: `${f.airport.icao} · ${main.id} · ${distNm} NM · NAV1 ${vor.ident} · OBS ${pad3(obs)}`,
      cockpit: "steam",
      world,
      seed: 4183,
      weather: { windKt: 0, windDir: Math.round(main.heading) },
    },
  );
  return { scene, vor, distNm, qdm, obs };
}

// ------------------------------------------------------------------ the slides
const canvas = (
  blocks: SlideBlock[],
  layout: SlideCanvas["layout"],
  scene?: string,
): SlideCanvas => ({
  size: { w: 1920, h: 1080 },
  grid: DEFAULT_GRID,
  layout,
  ...(scene ? { scene } : {}),
  blocks,
});
const foot = (t: L10n, id: string): SlideBlock =>
  T("foot", t, G.left, G.foot, 1680, 32, { id });

/** The slides for a field read from the navdata (pure: no fetch, no registry). */
export function airfieldKitFrom(f: RealAirfield): AirfieldKit {
  const ap = f.airport;
  const icao = ap.icao;
  const name = fieldName(ap.name);
  const title = `${name} (${icao})`;
  const ref = chartRef(f);
  const ps = pairs(f);
  const main = mainRunway(f);
  const longest = Math.max(...ap.runways.map((r) => r.lengthFt));
  const sid = (k: string) => `kit.${icao.toLowerCase()}.${k}`;
  const world: World = { kind: "real", region: icao, icaos: [icao] };
  const src = (extra: L10n): L10n => ({
    en: `${extra.en} · the app’s navigation data, ${ref.en}`,
    fr: `${extra.fr ?? extra.en} · données de navigation de l’application, ${ref.fr ?? ref.en}`,
  });
  const pairName = ([a, b]: [Runway, Runway]) => `${a.id}/${b.id}`;

  // ---- situations: a short final to the main runway (the view; a longer one the instructor can switch to), lined
  // up on it (the takeoff), and further out with the nearest VOR tuned (the live HSI)
  // a short final, 0.3 NM on a 3° path to an aiming point about 300 m past the threshold: about 150 ft. Through the
  // view's long lens (20° high) the runway is a trapezoid with its threshold bars and centre line, not a few pixels
  const finalNm = 0.3;
  const finalAgl = 150;
  const final = (nm: number, agl: number, key: string) =>
    sceneFromFields(
      {
        kind: "fields",
        pos: { runway: { icao, id: main.id }, distNm: nm },
        altFt: Math.round(main.elevFt + agl),
        hdg: Math.round(main.heading),
        iasKt: 70,
        vsFpm: -380,
      },
      {
        id: sid(key),
        label: `${icao} · ${main.id} · ${nm} NM final`,
        cockpit: "steam",
        world,
        seed: 4183,
        weather: { windKt: 0, windDir: Math.round(main.heading) },
      },
    );
  const sFinal = final(finalNm, finalAgl, "final");
  const sFinalLong = final(1.5, 480, "final15");
  const sDep = sceneFromFields(
    {
      kind: "fields",
      pos: { runway: { icao, id: main.id }, distNm: 0 },
      altFt: ap.elevFt,
      hdg: Math.round(main.heading),
      iasKt: 0,
    },
    {
      id: sid("dep"),
      label: `${icao} · ${main.id} · lined up`,
      cockpit: "steam",
      world,
      seed: 4183,
      weather: { windKt: 0, windDir: Math.round(main.heading) },
    },
  );
  const vor = vorTask(f, main, sid("vor"), world);
  for (const s of [sFinal, sFinalLong, sDep, ...(vor ? [vor.scene] : [])])
    s.captured = { at: SAMPLE_DATE, from: "fields" };
  const scenes: Record<string, SimScene> = {
    [sFinal.id]: sFinal,
    [sFinalLong.id]: sFinalLong,
    [sDep.id]: sDep,
    ...(vor ? { [vor.scene.id]: vor.scene } : {}),
  };

  const slides: AirfieldKit["slides"] = [];

  // ---- 1 title
  {
    const figs: [L10n, L10n][] = [
      [
        both((l) => `${num(ap.elevFt, l)} ft`),
        L("Field elevation", "Altitude du terrain"),
      ],
      [
        both((l) =>
          l === "fr"
            ? `${ps.length} piste${ps.length > 1 ? "s" : ""}`
            : `${ps.length} runway${ps.length > 1 ? "s" : ""}`,
        ),
        L(ps.map(pairName).join(" · "), ps.map(pairName).join(" · ")),
      ],
      [
        both((l) => `${num(meters(longest), l)} m`),
        L("Longest runway", "Piste la plus longue"),
      ],
    ];
    const s = canvas(
      [
        T(
          "eyebrow",
          L(`Your field · ${icao}`, `Votre terrain · ${icao}`),
          G.left,
          G.eyebrowY,
          840,
          32,
          { id: "k1.eb" },
        ),
        T("display", L(title, title), G.left, 232, 880, 300, {
          id: "k1.t",
          valign: "bottom",
        }),
        T("lead", L(ap.city, ap.city), G.left, 552, 840, 64, {
          id: "k1.city",
          color: "ink2",
        }),
        ...figs.flatMap(([n, t], i): SlideBlock[] => [
          T("title", n, G.left + i * 296, 680, 280, 96, {
            id: `k1.f${i}`,
            group: `k1.g${i}`,
          }),
          SHAPE("line", G.left + i * 296, 784, 264, 16, {
            id: `k1.r${i}`,
            stroke: "line",
            strokeW: 2,
            group: `k1.g${i}`,
          }),
          T("small", t, G.left + i * 296, 808, 272, 88, {
            id: `k1.l${i}`,
            color: "muted",
            group: `k1.g${i}`,
          }),
        ]),
        SHAPE("roundRect", 1104, 168, 696, 776, {
          id: "k1.bg",
          fill: "surface",
          stroke: "line",
          strokeW: 1,
          z: 0,
        }),
        ...runwayPlan(
          f,
          { x: 1104, y: 168, w: 696, h: 776 },
          { labels: false, prefix: "k1p" },
        ),
        foot(src(L("Elevation and runways", "Altitude et pistes")), "k1.foot"),
      ],
      "cover",
    );
    slides.push({
      title: L(title, title),
      slide: s,
      notes: L(
        `Introduce the field: ${name}, ${num(ap.elevFt, "en")} ft, ${ps.length} runway${ps.length > 1 ? "s" : ""}. Ask who has already flown from it. The name comes from the app’s data set: check the official name on the chart in force, and edit the title if it changed.`,
        `Présentez le terrain : ${name}, ${num(ap.elevFt, "fr")} ft, ${ps.length} piste${ps.length > 1 ? "s" : ""}. Demandez qui y a déjà volé. Le nom vient des données de l’application : vérifiez le nom officiel sur la carte VAC en vigueur et modifiez le titre s’il a changé.`,
      ),
    });
  }

  // ---- 2 runways, to scale, with their QFU
  {
    // up to four runways in the list (three when a « more » line follows), the note on lengths always fits above the
    // footer
    const rows = [...ps]
      .sort((x, y) => y[0].lengthFt - x[0].lengthFt)
      .slice(0, ps.length > 4 ? 3 : 4);
    const rowH = rows.length > 3 ? 152 : 168;
    const strip = (pr: [Runway, Runway]) =>
      f.strips.find(
        (s) => s.ids.includes(pr[0].id) && s.ids.includes(pr[1].id),
      );
    const s = canvas(
      [
        T(
          "eyebrow",
          L(`${icao} · runways`, `${icao} · plan des pistes`),
          G.left,
          G.eyebrowY,
          1680,
          32,
          { id: "k2.eb" },
        ),
        T(
          "title",
          L(`The runways of ${name}`, `Les pistes de ${name}`),
          G.left,
          G.titleY,
          1680,
          96,
          { id: "k2.t" },
        ),
        SHAPE("roundRect", G.left, 272, 1040, 704, {
          id: "k2.bg",
          fill: "surface",
          stroke: "line",
          strokeW: 1,
          z: 0,
          alt: runwayPlanAlt(f),
        }),
        ...runwayPlan(
          f,
          { x: G.left, y: 272, w: 1040, h: 704 },
          { prefix: "k2p" },
        ),
        ...rows.flatMap((pr, i): SlideBlock[] => {
          const st = strip(pr);
          const y = 288 + i * rowH;
          const facts = (l: Lang) =>
            [
              `${num(meters(pr[0].lengthFt), l)} m × ${num(meters(pr[0].widthFt), l)} m`,
              st ? surface(st.surface, l) : "",
              st?.lit ? (l === "fr" ? "balisée la nuit" : "lighted") : "",
            ]
              .filter(Boolean)
              .join(" · ");
          return [
            T("heading", L(pairName(pr), pairName(pr)), 1240, y, 560, 56, {
              id: `k2.r${i}`,
            }),
            T(
              "body",
              L(
                `QFU ${pad3(pr[0].heading)}° and ${pad3(pr[1].heading)}°`,
                `QFU ${pad3(pr[0].heading)}° et ${pad3(pr[1].heading)}°`,
              ),
              1240,
              y + 56,
              560,
              48,
              { id: `k2.q${i}`, color: "ink2" },
            ),
            T("small", both(facts), 1240, y + 104, 560, 40, {
              id: `k2.f${i}`,
              color: "muted",
            }),
          ];
        }),
        ...(ps.length > rows.length
          ? [
              T(
                "small",
                both((l) =>
                  l === "fr"
                    ? `et ${ps.length - rows.length} autre(s) piste(s) sur le plan`
                    : `and ${ps.length - rows.length} more runway(s) on the plan`,
                ),
                1240,
                288 + rows.length * rowH,
                560,
                40,
                { id: "k2.more", color: "muted" },
              ),
            ]
          : []),
        // physical lengths: what is declared for takeoff and landing (a displaced threshold) is the chart's
        T(
          "small",
          f.country === "FR"
            ? L(
                "Physical lengths. Declared distances (TORA, LDA) and displaced thresholds: check on the VAC chart.",
                "Longueurs physiques. Distances déclarées (TORA, LDA) et seuils décalés : à vérifier sur la carte VAC.",
              )
            : L(
                "Physical lengths. Declared distances (TORA, LDA) and displaced thresholds: check on the official chart.",
                "Longueurs physiques. Distances déclarées (TORA, LDA) et seuils décalés : à vérifier sur la carte officielle.",
              ),
          1240,
          288 + rows.length * rowH + (ps.length > rows.length ? 48 : 0),
          560,
          72,
          { id: "k2.lda", color: "key" },
        ),
        foot(
          src(
            L(
              "Runway ends, lengths and QFU",
              "Extrémités, longueurs et QFU des pistes",
            ),
          ),
          "k2.foot",
        ),
      ],
      "heroDiagram",
    );
    slides.push({
      title: L(`The runways of ${name}`, `Les pistes de ${name}`),
      slide: s,
      notes: L(
        `Each end carries its number and its QFU, the magnetic orientation of the runway (today’s variation, ${num(Math.abs(f.magVar), "en", 1)}° ${f.magVar >= 0 ? "E" : "W"}). Point at the runway in use today and ask the class for its QFU. The field’s name and declared distances (TORA, LDA): from the chart in force.`,
        `Chaque extrémité porte son numéro et son QFU, l’orientation magnétique de la piste (déclinaison du jour : ${num(Math.abs(f.magVar), "fr", 1)}° ${f.magVar >= 0 ? "E" : "W"}). Montrez la piste en service aujourd’hui et demandez son QFU à la classe. Le nom du terrain et les distances déclarées (TORA, LDA) : sur la carte VAC en vigueur.`,
      ),
    });
  }

  // ---- 3 frequencies and nearby navaids
  {
    const fq = ap.freqs;
    const fr = (en: string, frw: string) => L(en, frw);
    const freqRows: [L10n, number][] = (
      [
        [fr("ATIS", "ATIS"), fq.atis],
        [fr("Approach (APP)", "Approche (APP)"), fq.approach],
        [fr("Tower (TWR)", "Tour (TWR)"), fq.tower],
        [fr("Ground (GND)", "Sol (GND)"), fq.ground],
        [fr("Traffic info (CTAF)", "Auto-information (A/A)"), fq.ctaf],
        [fr("UNICOM", "UNICOM"), fq.unicom],
      ] as [L10n, number | undefined][]
    ).filter((x): x is [L10n, number] => typeof x[1] === "number" && x[1] > 0);
    const chk = chartShort(f);
    // in an 8.33 kHz area, a value on the 25 kHz grid (120,75) may be published as its channel name (120,755)
    const on25 = freqRows.some(([, v]) => Math.abs(v * 40 - Math.round(v * 40)) < 1e-6);
    const note833 = EU833.has(f.country) && on25;
    const fRows = freqRows.slice(0, note833 ? 5 : 6);
    const navs = f.navaids.slice(0, 5);
    const isLoc = (n: NearbyNavaid) => n.type === "ILS" || n.type === "LOC";
    const navType = (n: NearbyNavaid) =>
      n.type === "VORDME"
        ? "VOR-DME"
        : n.type === "ILS" || n.type === "LOC"
          ? `${n.type} ${n.runway ?? ""}`.trim()
          : n.type;
    const s = canvas(
      [
        T(
          "eyebrow",
          L(`${icao} · radio`, `${icao} · radio`),
          G.left,
          G.eyebrowY,
          1680,
          32,
          { id: "k3.eb" },
        ),
        T(
          "title",
          L(
            "Frequencies and nearby navaids",
            "Fréquences et moyens radio proches",
          ),
          G.left,
          G.titleY,
          1680,
          96,
          { id: "k3.t" },
        ),
        T(
          "eyebrow",
          L(`Frequencies · ${chk.en}`, `Fréquences · ${chk.fr}`),
          G.left,
          288,
          720,
          32,
          { id: "k3.fh", color: "key" },
        ),
        ...(fRows.length
          ? fRows.flatMap(([lab, v], i): SlideBlock[] => {
              const y = 336 + i * 96;
              return [
                SHAPE("line", G.left, y - 8, 720, 16, {
                  id: `k3.fl${i}`,
                  stroke: "line",
                  strokeW: 2,
                }),
                T("body", lab, G.left, y + 16, 420, 56, { id: `k3.fn${i}` }),
                T(
                  "heading",
                  both((l) => freqText(v, l)),
                  G.left + 400,
                  y + 12,
                  320,
                  64,
                  { id: `k3.fv${i}`, align: "right" },
                ),
              ];
            })
          : [
              T(
                "body",
                L(
                  "No frequency in the data set for this field: to complete.",
                  "Aucune fréquence dans les données pour ce terrain : à compléter.",
                ),
                G.left,
                344,
                720,
                120,
                { id: "k3.fnone", color: "key" },
              ),
            ]),
        ...(note833
          ? [
              T(
                "small",
                L(
                  "8.33 kHz airspace: the published channel can differ from the data set’s value (for example 120.755 for 120.75). Copy the one on the chart.",
                  "Espace 8,33 kHz : le canal publié peut différer de la valeur des données (par exemple 120,755 pour 120,75). Recopiez celui de la carte.",
                ),
                G.left,
                336 + fRows.length * 96 + 16,
                720,
                80,
                { id: "k3.833", color: "muted" },
              ),
            ]
          : []),
        T(
          "eyebrow",
          // short: one line beside the frequencies' eyebrow, which names the chart
          L("Navaids within 40 NM · to check", "Moyens radio à 40 NM · à vérifier"),
          1008,
          288,
          792,
          32,
          { id: "k3.nh", color: "key" },
        ),
        ...(navs.length
          ? navs.flatMap((n, i): SlideBlock[] => {
              const y = 336 + i * 120;
              return [
                SHAPE("line", 1008, y - 8, 792, 16, {
                  id: `k3.nl${i}`,
                  stroke: "line",
                  strokeW: 2,
                }),
                T(
                  "heading",
                  L(isLoc(n) ? n.name : n.ident, isLoc(n) ? n.name : n.ident),
                  1008,
                  y + 12,
                  isLoc(n) ? 216 : 176,
                  56,
                  { id: `k3.ni${i}` },
                ),
                // a localizer: its runway and its course (where its antenna stands means nothing to a pilot)
                T(
                  "body",
                  both((l) =>
                    isLoc(n)
                      ? `${navType(n)} · ${freqText(n, l)}${n.course !== undefined ? (l === "fr" ? ` · axe ${pad3(n.course)}°` : ` · course ${pad3(n.course)}°`) : ""}`
                      : `${navType(n)} · ${freqText(n, l)}`,
                  ),
                  isLoc(n) ? 1232 : 1184,
                  y + 12,
                  isLoc(n) ? 568 : 616,
                  48,
                  { id: `k3.nf${i}` },
                ),
                ...(isLoc(n) ? [] : [T(
                  "small",
                  both((l) =>
                    n.distNm < 1
                      ? l === "fr"
                        ? `${n.name} · sur le terrain`
                        : `${n.name} · on the field`
                      : l === "fr"
                        ? `${n.name} · ${num(n.distNm, l, 1)} NM au ${pad3(n.brgMag)}° du terrain`
                        : `${n.name} · ${num(n.distNm, l, 1)} NM, ${pad3(n.brgMag)}° from the field`,
                  ),
                  1184,
                  y + 60,
                  616,
                  40,
                  { id: `k3.nd${i}`, color: "muted" },
                )]),
              ];
            })
          : [
              T(
                "body",
                L(
                  "No navaid within 40 NM in the data set.",
                  "Aucun moyen radio à moins de 40 NM dans les données.",
                ),
                1008,
                344,
                792,
                96,
                {
                  id: "k3.nnone",
                  color: "muted",
                },
              ),
            ]),
        foot(
          src(L("Frequencies and navaids", "Fréquences et moyens radio")),
          "k3.foot",
        ),
      ],
      "twoColumn",
    );
    slides.push({
      title: L(
        "Frequencies and nearby navaids",
        "Fréquences et moyens radio proches",
      ),
      slide: s,
      notes: L(
        "Have the students copy the frequencies from the chart in force, not from this slide: the app’s data set can be older and does not name 8.33 kHz channels. Then the navaid they would use to find the field.",
        "Faites recopier les fréquences depuis la carte VAC en vigueur, pas depuis cette diapo : les données de l’application peuvent être plus anciennes et ne donnent pas les canaux 8,33 kHz. Puis le moyen radio qui sert à retrouver le terrain.",
      ),
    });
  }

  // ---- 3b your turn on the slide: the live HSI on the field's VOR (the house « À vous »: a control, a goal ticked)
  if (vor) {
    const v = vor.vor;
    const fq = (l: Lang) => `${num(v.freq, l, 2)} MHz`;
    const ttl = L(
      `Where is ${v.ident}? Centre the bar`,
      `Où est ${v.ident} ? Centrez la barre`,
    );
    const prompt = L(
      "Centre the bar with a TO flag",
      "Centrez la barre avec l’indicateur TO",
    );
    const goal = [GOAL.toFrom("TO"), GOAL.cdi(0.5)];
    const s = canvas(
      [
        T(
          "eyebrow",
          L(`Your turn · ${icao}`, `À vous · ${icao}`),
          G.left,
          G.eyebrowY,
          768,
          32,
          { id: "k3b.eb" },
        ),
        T("title", ttl, G.left, G.titleY, 768, 168, { id: "k3b.t" }),
        T(
          "eyebrow",
          L("Your control", "Votre commande"),
          G.left,
          336,
          768,
          32,
          { id: "k3b.ch", color: "muted" },
        ),
        T(
          "body",
          L(
            "**OBS**: turn the knob, or − and +. The course is read at the top of the HSI.",
            "**OBS** : tournez le bouton, ou − et +. La route se lit en haut du HSI.",
          ),
          G.left,
          376,
          768,
          96,
          { id: "k3b.c" },
        ),
        SHAPE("line", G.left, 488, 768, 16, {
          id: "k3b.r",
          stroke: "line",
          strokeW: 2,
        }),
        CHECKLIST(
          "k3b.checks",
          [
            {
              text: L(
                "Bar centred, within half a dot",
                "Barre centrée, à moins d’un demi-point",
              ),
              check: 1,
              readout: "cdiDots",
            },
            {
              text: L("With a TO flag", "Avec l’indicateur TO"),
              check: 0,
              readout: "toFrom",
            },
          ],
          G.left,
          520,
          768,
          232,
          { title: L("Goal", "Objectif") },
        ),
        T(
          "small",
          both((l) =>
            l === "fr"
              ? `En finale lointaine ${main.id}, à ${vor.distNm} NM, NAV 1 sur ${v.ident} (${fq(l)}, à vérifier sur la carte). La route lue mène VERS la station : c’est votre QDM.`
              : `On a long final to ${main.id}, ${vor.distNm} NM out, NAV 1 on ${v.ident} (${fq(l)}, check it on the chart). The course you read goes TO the station: it is your QDM.`,
          ),
          G.left,
          776,
          768,
          160,
          { id: "k3b.tip" },
        ),
        INST(
          { kind: "gauge", gauge: "hsi" },
          both((l) =>
            l === "fr"
              ? `HSI en direct, finale ${main.id} de ${icao}, NAV 1 sur ${v.ident}, OBS sur ${pad3(vor.obs)}`
              : `Live HSI, final to ${icao} runway ${main.id}, NAV 1 on ${v.ident}, OBS on ${pad3(vor.obs)}`,
          ),
          1080,
          120,
          720,
          800,
          {
            id: "k3b.inst",
            scene: vor.scene.id,
            mode: "live",
            controls: ["obs1"],
            yourTurn: {
              where: "slide",
              prompt,
              controls: ["obs1"],
              assist: { holdAlt: true, holdIas: true },
              goal: {
                all: goal,
                holdS: 2,
                graded: false,
                success: both((l) =>
                  l === "fr"
                    ? `Barre centrée avec TO : la route affichée mène à ${v.ident}, c’est votre QDM (environ ${pad3(vor.qdm)}°).`
                    : `Bar centred with TO: the course shown leads to ${v.ident}, it is your QDM (about ${pad3(vor.qdm)}°).`,
                ),
              },
              hint: L(
                "Turn the OBS slowly towards the bar.",
                "Tournez l’OBS doucement vers la barre.",
              ),
            },
          },
        ),
        foot(
          src(L(`${v.ident} and runway ${main.id}`, `${v.ident} et piste ${main.id}`)),
          "k3b.foot",
        ),
      ],
      "yourTurn",
      vor.scene.id,
    );
    slides.push({
      title: ttl,
      slide: s,
      notes: both((l) =>
        l === "fr"
          ? `Laissez chacun essayer sur son écran, ou donnez les commandes à un élève. Demandez : quel QDM vers ${v.ident} ? (environ ${pad3(vor.qdm)}°). Puis : de quel côté de la finale est la station ?`
          : `Let each student try on their own screen, or hand the controls to one of them. Ask: which QDM to ${v.ident}? (about ${pad3(vor.qdm)}°). Then: which side of the final is the station on?`,
      ),
    });
  }

  // ---- 4 the view on final
  {
    const altFt = Math.round(main.elevFt + finalAgl);
    const s = canvas(
      [
        T(
          "eyebrow",
          L(`${icao} · from the air`, `${icao} · vu d’avion`),
          G.left,
          G.eyebrowY,
          600,
          32,
          { id: "k4.eb" },
        ),
        T(
          "title",
          L("The field on final", "Le terrain en finale"),
          G.left,
          G.titleY,
          600,
          176,
          { id: "k4.t" },
        ),
        T(
          "body",
          both((l) =>
            l === "fr"
              ? `En finale **${main.id}** à ${num(finalNm, l, 1)} NM, ${num(altFt, l)} ft (environ ${num(finalAgl, l)} ft au-dessus du terrain), au cap ${pad3(main.heading)}°.`
              : `On final for **${main.id}**, ${num(finalNm, l, 1)} NM out, ${num(altFt, l)} ft (about ${num(finalAgl, l)} ft above the field), heading ${pad3(main.heading)}°.`,
          ),
          G.left,
          352,
          600,
          200,
          { id: "k4.b" },
        ),
        T(
          "small",
          L(
            "What does the runway look like from here? Its shape, its aiming point, what lies around it. Change the situation in “Flight situation”.",
            "À quoi ressemble la piste d’ici ? Sa forme, son point d’aboutissement, ce qui l’entoure. Changez la situation dans « Situation de vol ».",
          ),
          G.left,
          584,
          600,
          176,
          { id: "k4.s", color: "muted" },
        ),
        {
          id: "k4.view",
          frame: { x: 792, y: 160, w: 1008, h: 760, z: 1 },
          kind: "simViewport",
          scene: sFinal.id,
          view: "outside",
          alt: L(
            `${name} seen from a ${finalNm} NM final to runway ${main.id}`,
            `${name} vu d’une finale à ${num(finalNm, "fr", 1)} NM de la piste ${main.id}`,
          ),
        },
        foot(src(L("Runway geometry", "Géométrie des pistes")), "k4.foot"),
      ],
      "instrumentNotes",
      sFinal.id,
    );
    slides.push({
      title: L("The field on final", "Le terrain en finale"),
      slide: s,
      notes: L(
        "Let the class describe what they see before you name it: the runway, its numbers, the aiming point. The picture is the simulator’s, at the field’s real position. For a longer final, pick the 1.5 NM situation in “Flight situation”.",
        "Laissez la classe décrire ce qu’elle voit avant de nommer : la piste, ses numéros, le point d’aboutissement. L’image est celle du simulateur, à la position réelle du terrain. Pour une finale plus longue, choisissez la situation à 1,5 NM dans « Situation de vol ».",
      ),
    });
  }

  // ---- 5 your turn: the takeoff in the simulator
  // the target is a height above the field (1 000 ft): the simulator's ground can sit a few dozen feet off the
  // published elevation, so the band is wide on that side and the brief says « au-dessus du terrain », not a QNH figure
  // that could also be an airspace floor
  const target = Math.round((ap.elevFt + 1000) / 100) * 100;
  {
    const brief = both((l) =>
      l === "fr"
        ? `Aligné piste **${main.id}** (QFU ${pad3(main.heading)}°). Au sol, l’altimètre calé affiche l’altitude du terrain. Mettez plein gaz, décollez et montez dans l’axe jusqu’à **1 000 ft au-dessus du terrain** (environ ${num(target, l)} ft).`
        : `Lined up on runway **${main.id}** (QFU ${pad3(main.heading)}°). On the ground the altimeter shows the field’s elevation. Apply full power, take off and climb on the runway heading to **1,000 ft above the field** (about ${num(target, l)} ft).`,
    );
    const prompt = both((l) =>
      l === "fr"
        ? `Décollez de la piste ${main.id} et montez dans l’axe jusqu’à 1 000 ft au-dessus du terrain`
        : `Take off from runway ${main.id} and climb on the runway heading to 1,000 ft above the field`,
    );
    const s = canvas(
      [
        T("eyebrow", L("Your turn", "À vous"), G.left, G.eyebrowY, 1392, 32, {
          id: "k5.eb",
        }),
        T(
          "title",
          L(
            `In the simulator: a takeoff from ${icao}`,
            `Au simulateur : un décollage à ${icao}`,
          ),
          G.left,
          G.titleY,
          1680,
          168,
          { id: "k5.t" },
        ),
        T("body", brief, G.left, 352, 600, 296, { id: "k5.b" }),
        T(
          "small",
          f.country === "FR"
            ? L(
                "A simulator exercise, not the published departure: see the VAC chart. Press “Fly it in the simulator”; the result shows on this slide.",
                "Exercice au simulateur, pas le départ publié : voir la carte VAC. Appuyez sur « Voler dans le simulateur » ; le résultat s’affiche sur cette diapo.",
              )
            : L(
                "A simulator exercise, not the published departure: see the official chart. Press “Fly it in the simulator”; the result shows on this slide.",
                "Exercice au simulateur, pas le départ publié : voir la carte officielle. Appuyez sur « Voler dans le simulateur » ; le résultat s’affiche sur cette diapo.",
              ),
          G.left,
          688,
          600,
          136,
          { id: "k5.s", color: "muted" },
        ),
        {
          id: "k5.sim",
          frame: { x: 816, y: 352, w: 984, h: 560, z: 1 },
          kind: "simViewport",
          scene: sDep.id,
          view: "cockpit",
          alt: L(
            `The cockpit, lined up on runway ${main.id} at ${name}`,
            `Le cockpit, aligné piste ${main.id} à ${name}`,
          ),
          yourTurn: {
            where: "sim",
            prompt,
            goal: {
              all: [
                GOAL.alt(ap.elevFt + 850, ap.elevFt + 1300),
                GOAL.heading(Math.round(main.heading), 15),
              ],
              holdS: 5,
              graded: false,
              success: both((l) =>
                l === "fr"
                  ? `1 000 ft au-dessus du terrain, dans l’axe de la piste ${main.id}.`
                  : `1,000 ft above the field, on the runway ${main.id} heading.`,
              ),
            },
            durationS: 360,
            returnTo: "thisStep",
          },
        },
        foot(
          src(L(`Runway ${main.id} threshold`, `Seuil de piste ${main.id}`)),
          "k5.foot",
        ),
      ],
      "yourTurn",
      sDep.id,
    );
    slides.push({
      title: L(
        `In the simulator: a takeoff from ${icao}`,
        `Au simulateur : un décollage à ${icao}`,
      ),
      slide: s,
      notes: L(
        `The student takes off from runway ${main.id} in the full simulator; the slide ticks the goal (1,000 ft above the field on the runway heading) when they come back. Change the runway or the weather in “Flight situation”. The circuit altitude and the local departure belong on the last slide, from the chart.`,
        `L’élève décolle de la piste ${main.id} dans le simulateur complet ; la diapo coche l’objectif (1 000 ft au-dessus du terrain, dans l’axe) à son retour. Changez la piste ou la météo dans « Situation de vol ». L’altitude du tour de piste et le départ local vont sur la dernière diapo, depuis la carte VAC.`,
      ),
    });
  }

  // ---- 6 the local briefing: what only the instructor knows
  {
    const boxes: [L10n, L10n][] = [
      [
        L("Circuit", "Tour de piste"),
        L(
          "To complete: direction, height, reporting points.",
          "À compléter : sens, hauteur, points de report.",
        ),
      ],
      [
        L("Entering and leaving", "Arrivée et départ"),
        L(
          "To complete: entry and exit points, routes.",
          "À compléter : points d’entrée et de sortie, cheminements.",
        ),
      ],
      [
        L("Local rules", "Consignes locales"),
        L(
          "To complete: noise abatement, areas to avoid, hours.",
          "À compléter : moindre bruit, zones à éviter, horaires.",
        ),
      ],
      [
        L("On the ground", "Au sol"),
        L(
          "To complete: preferred runway, holding points, parking.",
          "À compléter : piste préférentielle, points d’arrêt, parking.",
        ),
      ],
    ];
    const s = canvas(
      [
        T(
          "eyebrow",
          L(
            `${icao} · local briefing · to complete`,
            `${icao} · briefing local · à compléter`,
          ),
          G.left,
          G.eyebrowY,
          1680,
          32,
          {
            id: "k6.eb",
            color: "key",
          },
        ),
        T(
          "title",
          L(
            `Flying at ${name}: the local rules`,
            `Voler à ${name} : les consignes locales`,
          ),
          G.left,
          G.titleY,
          1680,
          96,
          { id: "k6.t" },
        ),
        ...boxes.flatMap(([h, t], i): SlideBlock[] => {
          const x = G.left + (i % 2) * 848;
          const y = 288 + Math.floor(i / 2) * 320;
          return [
            SHAPE("roundRect", x, y, 816, 288, {
              id: `k6.b${i}`,
              fill: null,
              stroke: "key",
              strokeW: 2,
              dash: true,
              z: 0,
              group: `k6.g${i}`,
            }),
            T("heading", h, x + 40, y + 32, 736, 56, {
              id: `k6.h${i}`,
              group: `k6.g${i}`,
            }),
            T("body", t, x + 40, y + 104, 736, 152, {
              id: `k6.p${i}`,
              color: "key",
              group: `k6.g${i}`,
            }),
          ];
        }),
        foot(
          {
            en: `To fill from the chart: this field’s procedures are ${ref.en}.`,
            fr: `À remplir depuis la carte : les procédures de ce terrain sont ${ref.fr ?? ref.en}.`,
          },
          "k6.foot",
        ),
      ],
      "twoColumn",
    );
    slides.push({
      title: L(
        `Flying at ${name}: the local rules`,
        `Voler à ${name} : les consignes locales`,
      ),
      slide: s,
      notes: L(
        "Fill the four boxes from the chart in force and your club’s rules before the lesson; until then the slide says “to complete”.",
        "Remplissez les quatre cadres à partir de la carte en vigueur et des consignes de votre club avant la séance ; d’ici là, la diapo affiche « à compléter ».",
      ),
    });
  }

  const starter: DeckStarter = {
    id: `airfield-${icao.toLowerCase()}`,
    title: L(title, title),
    pitch: L(
      "The field, its runways, its frequencies, the view on final, a takeoff in the simulator, the local briefing",
      "Le terrain, ses pistes, ses fréquences, la vue en finale, un décollage au simulateur, le briefing local",
    ),
    theme: "classroom",
    // named by its title alone (no subtitle): the course takes the field's name
    cover: {
      eyebrow: L(`Your field · ${icao}`, `Votre terrain · ${icao}`),
      title: L(title, title),
      subtitle: L("", ""),
      lead: L(ap.city, ap.city),
      foot: L("", ""),
    },
    slides: slides.map((s) => s.slide.layout ?? "blank"),
    make: Object.fromEntries(
      slides.map((s, i) => [
        i,
        () => JSON.parse(JSON.stringify(s.slide)) as SlideCanvas,
      ]),
    ),
    presenter: Object.fromEntries(slides.map((s, i) => [i, s.notes])),
    titles: Object.fromEntries(slides.map((s, i) => [i, s.title])),
    scenes: () =>
      JSON.parse(JSON.stringify(scenes)) as Record<string, SimScene>,
  };
  return { ok: true, icao, name, field: f, slides, scenes, starter };
}
