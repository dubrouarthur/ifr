// « Adapter à mon terrain »: an ICAO code in, six ready slides about that field out, from the app's own navdata
// (public/navdata, nav/world.ts realAirfield). Nothing is invented: the numbers come from the data set (elevation,
// runway ends, lengths, frequencies, nearby navaids), the geometry is drawn from the runway ends themselves, and every
// piece of local knowledge the data set does not hold (the circuit, the local rules) is a box the instructor fills,
// marked « à compléter ». Anything about procedures says where to check it: the SIA chart in force for a French field,
// the official chart (the country's AIP) elsewhere.
//   1 title        « Toussus-le-Noble (LFPN) », the elevation, the runways, the longest one, a sketch of the runways
//   2 runways      the runway plan drawn to scale, each end labelled with its number and QFU, the list beside it
//   3 radio        frequencies and the navaids within 40 NM (bearing and distance from the field)
//   4 view         the field from a 1.5 NM final (the slide's « Vue simulateur », placed on that runway)
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
import type { Runway } from "../nav/types";
import { G, L, SHAPE, T, ARROW } from "./canvas/layouts";
import { DEFAULT_GRID } from "./canvas/geom";
import { G as GOAL, SAMPLE_DATE } from "./samples/kit";
import { sceneFromFields } from "./scene";
import { registerSlideAirport } from "../nav/data";

export type AirfieldKitError = "format" | "unknown" | "offline";
export interface AirfieldKit {
  ok: true;
  icao: string;
  /** the field's name, cleaned (« Toussus-le-Noble ») */
  name: string;
  field: RealAirfield;
  /** the six slides, in order, with their titles and what the presenter says */
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
import { ICAO_RE } from "./airfields";
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
 * and their outside view find it) and builds the six slides. Never throws: an unknown code or no data is a failure
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
  registerSlideAirport(field.airport);
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
/** a number as each language writes it: « 1 488 » and « 120,750 » (a space, as the house decks write « 3 000 ft ») / "1,488", "120.750" */
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
/** a frequency as the chart prints it: com 120,750 MHz · VOR / ILS 108,25 MHz · NDB 315 kHz */
function freqText(n: NearbyNavaid | number, lang: Lang): string {
  if (typeof n === "number") return `${num(n, lang, 3)} MHz`;
  if (n.type === "NDB") return `${num(n.freq, lang, Number.isInteger(n.freq) ? 0 : 1)} kHz`;
  return `${num(n.freq, lang, 2)} MHz`;
}

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
/**
 * The runways of the field drawn to scale in a box: one dark strip per runway with its centre line, rotated to its
 * real heading (grid north up is magnetic north: the field's frame), each end labelled with its number and QFU.
 */
export function runwayPlan(
  f: RealAirfield,
  box: { x: number; y: number; w: number; h: number },
  o: { labels?: boolean; prefix?: string } = {},
): SlideBlock[] {
  const labels = o.labels ?? true;
  const id = o.prefix ?? "rp";
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
  const mx = labels ? 200 : 56,
    my = labels ? 120 : 56;
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
    if (!labels) return;
    // each end: its number (the runway landing from that end) and its QFU, just beyond the end
    for (const [rw, at, dir] of [
      [a, A, -1],
      [b, B, 1],
    ] as const) {
      // far enough along the runway that the label's box (180 × 88) clears its end
      const off = Math.abs(ux) * 90 + Math.abs(uy) * 44 + 14;
      const lx = at.X + dir * ux * off,
        ly = at.Y + dir * uy * off;
      out.push(
        T("heading", L(rw.id, rw.id), lx - 80, ly - 44, 160, 52, {
          id: `${id}.n${rw.id}`,
          align: "center",
          valign: "middle",
          z: 3,
        }),
        T(
          "small",
          L(`QFU ${pad3(rw.heading)}°`, `QFU ${pad3(rw.heading)}°`),
          lx - 90,
          ly + 8,
          180,
          36,
          {
            id: `${id}.q${rw.id}`,
            align: "center",
            color: "muted",
            z: 3,
          },
        ),
      );
    }
  });
  if (labels) {
    // magnetic north (the field's frame) and a scale bar
    out.push(
      ARROW([box.x + 24, box.y + 96], [box.x + 24, box.y + 16], {
        id: `${id}.north`,
        color: "accent",
        strokeW: 3,
      }),
      T(
        "eyebrow",
        L("N (magnetic)", "N (magnétique)"),
        box.x + 48,
        box.y + 16,
        280,
        32,
        { id: `${id}.nt` },
      ),
    );
    const steps = [100, 200, 250, 500, 1000, 2000];
    const pxPerM = sc / 1852;
    const want = steps.find((s) => s * pxPerM >= 120) ?? 2000;
    const bar = Math.round(want * pxPerM);
    const bx = box.x + box.w - bar - 16,
      by = box.y + box.h - 24;
    out.push(
      SHAPE("line", bx, by - 8, bar, 16, {
        id: `${id}.scale`,
        stroke: "text",
        strokeW: 3,
      }),
      T("small", L(`${want} m`, `${want} m`), bx, by - 52, bar, 36, {
        id: `${id}.st`,
        align: "center",
        color: "muted",
      }),
    );
  }
  return out;
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

/** The six slides for a field read from the navdata (pure: no fetch, no registry). */
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

  // ---- situations: a short final to the main runway (the view), lined up on it (the takeoff)
  const finalNm = 1.5;
  const finalAgl = 480;
  const sFinal = sceneFromFields(
    {
      kind: "fields",
      pos: { runway: { icao, id: main.id }, distNm: finalNm },
      altFt: Math.round(main.elevFt + finalAgl),
      hdg: Math.round(main.heading),
      iasKt: 75,
      vsFpm: -350,
    },
    {
      id: sid("final"),
      label: `${icao} · ${main.id} · ${finalNm} NM final`,
      cockpit: "steam",
      world,
      seed: 4183,
      weather: { windKt: 0, windDir: Math.round(main.heading) },
    },
  );
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
  for (const s of [sFinal, sDep])
    s.captured = { at: SAMPLE_DATE, from: "fields" };
  const scenes = { [sFinal.id]: sFinal, [sDep.id]: sDep };

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
        `Introduce the field: ${name}, ${num(ap.elevFt, "en")} ft, ${ps.length} runway${ps.length > 1 ? "s" : ""}. Ask who has already flown from it.`,
        `Présentez le terrain : ${name}, ${num(ap.elevFt, "fr")} ft, ${ps.length} piste${ps.length > 1 ? "s" : ""}. Demandez qui y a déjà volé.`,
      ),
    });
  }

  // ---- 2 runways, to scale, with their QFU
  {
    const rows = [...ps]
      .sort((x, y) => y[0].lengthFt - x[0].lengthFt)
      .slice(0, 4);
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
        }),
        ...runwayPlan(
          f,
          { x: G.left, y: 272, w: 1040, h: 704 },
          { prefix: "k2p" },
        ),
        ...rows.flatMap((pr, i): SlideBlock[] => {
          const st = strip(pr);
          const y = 288 + i * 168;
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
                288 + rows.length * 168,
                560,
                40,
                { id: "k2.more", color: "muted" },
              ),
            ]
          : []),
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
        `Each end carries its number and its QFU (the magnetic heading on landing). Point at the runway in use today and ask the class for its QFU.`,
        `Chaque extrémité porte son numéro et son QFU (le cap magnétique à l’atterrissage). Montrez la piste en service aujourd’hui et demandez son QFU à la classe.`,
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
    const navs = f.navaids.slice(0, 5);
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
        T("eyebrow", L("Frequencies", "Fréquences"), G.left, 288, 720, 32, {
          id: "k3.fh",
          color: "muted",
        }),
        ...(freqRows.length
          ? freqRows.flatMap(([lab, v], i): SlideBlock[] => {
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
        T(
          "eyebrow",
          L("Navaids within 40 NM", "Moyens radio à moins de 40 NM"),
          1008,
          288,
          792,
          32,
          { id: "k3.nh", color: "muted" },
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
                T("heading", L(n.ident, n.ident), 1008, y + 12, 176, 56, {
                  id: `k3.ni${i}`,
                }),
                T(
                  "body",
                  both((l) => `${navType(n)} · ${freqText(n, l)}`),
                  1184,
                  y + 12,
                  616,
                  48,
                  { id: `k3.nf${i}` },
                ),
                T(
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
                ),
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
        "Read the frequencies aloud and have the students write them down; then the navaid they would use to find the field. The data set may be older than the chart: check it.",
        "Lisez les fréquences à voix haute, faites-les noter ; puis le moyen radio qui sert à retrouver le terrain. Les données peuvent être plus anciennes que la carte : vérifiez-les.",
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
              ? `En finale **${main.id}** à ${num(finalNm, l, 1)} NM, ${num(altFt, l)} ft (environ ${num(finalAgl, l)} ft au-dessus du terrain), au cap ${pad3(main.heading)}.`
              : `On final for **${main.id}**, ${num(finalNm, l, 1)} NM out, ${num(altFt, l)} ft (about ${num(finalAgl, l)} ft above the field), heading ${pad3(main.heading)}.`,
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
            "What does the runway look like from here? Its shape, its aiming point, what lies around it. Change the situation in « Flight situation ».",
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
        "Let the class describe what they see before you name it: the runway, its numbers, the aiming point. The picture is the simulator’s, at the field’s real position.",
        "Laissez la classe décrire ce qu’elle voit avant de nommer : la piste, ses numéros, le point d’aboutissement. L’image est celle du simulateur, à la position réelle du terrain.",
      ),
    });
  }

  // ---- 5 your turn: the takeoff in the simulator
  const target = Math.round((ap.elevFt + 1000) / 100) * 100;
  {
    const brief = both((l) =>
      l === "fr"
        ? `Aligné piste **${main.id}** (QFU ${pad3(main.heading)}°), terrain à ${num(ap.elevFt, l)} ft. Mettez les gaz, décollez et montez dans l’axe jusqu’à **${num(target, l)} ft**.`
        : `Lined up on runway **${main.id}** (QFU ${pad3(main.heading)}°), field at ${num(ap.elevFt, l)} ft. Apply power, take off and climb on the runway heading to **${num(target, l)} ft**.`,
    );
    const prompt = both((l) =>
      l === "fr"
        ? `Décollez de la piste ${main.id} et montez dans l’axe jusqu’à ${num(target, l)} ft`
        : `Take off from runway ${main.id} and climb on the runway heading to ${num(target, l)} ft`,
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
          L(
            "Press « Fly it in the simulator ». The course waits here and the result shows on this slide.",
            "Appuyez sur « Voler dans le simulateur ». Le cours attend ici, le résultat s’affiche sur cette diapo.",
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
                GOAL.alt(target - 100, target + 300),
                GOAL.heading(Math.round(main.heading), 15),
              ],
              holdS: 5,
              graded: false,
              success: both((l) =>
                l === "fr"
                  ? `${num(target, l)} ft dans l’axe de la piste ${main.id}.`
                  : `${num(target, l)} ft on the runway ${main.id} heading.`,
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
        `The student takes off from runway ${main.id} in the full simulator; the slide ticks the goal (${num(target, "en")} ft on the runway heading) when they come back. Change the runway or the weather in « Flight situation ».`,
        `L’élève décolle de la piste ${main.id} dans le simulateur complet ; la diapo coche l’objectif (${num(target, "fr")} ft dans l’axe) à son retour. Changez la piste ou la météo dans « Situation de vol ».`,
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
            en: `Nothing here is invented: this field’s procedures are ${ref.en}.`,
            fr: `Rien n’est inventé ici : les procédures de ce terrain sont ${ref.fr ?? ref.en}.`,
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
        "Fill the four boxes from the chart in force and your club’s rules before the lesson; until then the slide says « to complete ».",
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
