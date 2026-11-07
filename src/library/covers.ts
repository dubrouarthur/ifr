// The 16:9 covers of the library's cards. One grammar: a course shows its first slide (drawn by the slide engine,
// course/ui/library.ts); everything that opens the cockpit (a sim lesson, a failure drill, a graded route) shows a
// dark instrument panel, so "this is a flight" reads at a glance: a lesson its rank in its subject ("LESSON 3 of 9")
// and the instrument it works on, a drill the symbol of its failure (fire, electrical, engine, ice, radio, flags),
// a route its legs. Checklists and free practice are rows, without a cover. Static SVG strings, no data in them.
import { h } from "../ui/dom";
import type { Course, Lang, SlideCanvas, Step } from "../course/types";
import type { LibItem } from "./model";

// ------------------------------------------------------------------ the symbols (120 × 120, centred on 0,0)
let uid = 0;
const BLUE = "#3a7bd5";
const EARTH = "#8b5a2b";
const AMBER = "#f5b400";
const PAPER = "#e9e6df";
const RED = "#d64545";
const ACCENT = "#4f8ff0";
const G = {
  att(bank = -14, pitch = 0): string {
    const id = `lbatt${++uid}`;
    const t = `rotate(${bank}) translate(0,${pitch})`;
    return `<clipPath id="${id}"><circle r="44"/></clipPath><g clip-path="url(#${id})"><rect x="-70" y="-70" width="140" height="70" fill="${BLUE}" transform="${t}"/><rect x="-70" y="0" width="140" height="70" fill="${EARTH}" transform="${t}"/><line x1="-70" x2="70" y1="0" y2="0" stroke="#fff" stroke-width="2" transform="${t}"/></g><circle r="44" fill="none" stroke="#0b0d10" stroke-width="6"/><path d="M-22 4h14l4 6 4-6h14" stroke="${AMBER}" stroke-width="4" fill="none"/>`;
  },
  hsi(): string {
    let s = `<circle r="44" fill="#0b0d10" stroke="#3a424d" stroke-width="2"/>`;
    for (let a = 0; a < 360; a += 30)
      s += `<line x1="0" y1="-40" x2="0" y2="-33" stroke="#fff" stroke-width="2" transform="rotate(${a})"/>`;
    return `${s}<g transform="rotate(35)"><path d="M0-30L5-20H-5Z" fill="${AMBER}"/><line x1="0" y1="-20" x2="0" y2="-8" stroke="${AMBER}" stroke-width="3"/><line x1="7" y1="-8" x2="7" y2="10" stroke="${AMBER}" stroke-width="3"/><line x1="0" y1="10" x2="0" y2="26" stroke="${AMBER}" stroke-width="3"/></g><path d="M-8 2h16M0-6v14" stroke="#fff" stroke-width="2"/>`;
  },
  hold(): string {
    return `<path d="M-30 -14h50a14 14 0 0 1 0 28h-50a14 14 0 0 1 0-28z" fill="none" stroke="${ACCENT}" stroke-width="4"/><circle cx="-30" cy="-14" r="4.5" fill="#fff" stroke="#0b0d10" stroke-width="2"/>`;
  },
  app(): string {
    return `<path d="M-46 28H46" stroke="#5b636e" stroke-width="2"/><path d="M14 28L46 24V32Z" fill="${PAPER}"/><path d="M-46 -26L30 26" stroke="#d24db8" stroke-width="3" stroke-dasharray="6 4"/><circle cx="-20" cy="-8" r="5" fill="${ACCENT}"/>`;
  },
  route(): string {
    return `<path d="M-40 20L-10 -12L18 8L40 -22" fill="none" stroke="${ACCENT}" stroke-width="3"/><circle cx="-40" cy="20" r="5" fill="${PAPER}"/><circle cx="40" cy="-22" r="5" fill="${PAPER}"/><polygon points="-10,-18 -5,-9 -15,-9" fill="#0b0d10" stroke="${PAPER}" stroke-width="1.6"/><polygon points="18,2 23,11 13,11" fill="#0b0d10" stroke="${PAPER}" stroke-width="1.6"/>`;
  },
  prop(): string {
    return `<circle r="6" fill="${PAPER}"/><path d="M0-6C8-20 6-38 0-42C-6-38-8-20 0-6Z" fill="${PAPER}"/><path d="M0 6C-8 20-6 38 0 42C6 38 8 20 0 6Z" fill="${PAPER}"/><circle r="40" fill="none" stroke="${RED}" stroke-width="3" stroke-dasharray="4 5"/>`;
  },
  circuit(): string {
    return `<rect x="-42" y="-24" width="84" height="48" rx="12" fill="none" stroke="${ACCENT}" stroke-width="3"/><rect x="-26" y="18" width="52" height="10" fill="${PAPER}"/><path d="M28 24l10-6v12z" fill="${ACCENT}"/>`;
  },
  moon(): string {
    return `<path d="M10-34A34 34 0 1 0 34 10A26 26 0 1 1 10-34Z" fill="${PAPER}"/><circle cx="-30" cy="-26" r="1.6" fill="#fff"/><circle cx="26" cy="-30" r="1.2" fill="#fff"/><circle cx="34" cy="28" r="1.4" fill="#fff"/>`;
  },
  flame(): string {
    return `<path d="M0-40C14-22 26-10 22 10C19 28 8 38 0 38C-8 38-19 28-22 10C-25-6-10-14-6-28C-2-18 2-14 6-12C6-22 2-30 0-40Z" fill="#e8742c"/><path d="M0 0C8 8 10 16 8 24C6 32 2 34 0 34C-2 34-6 32-8 24C-10 16-6 8 0 0Z" fill="${AMBER}"/>`;
  },
  bolt(): string {
    return `<path d="M8-40L-22 6H-2L-10 40L22-8H2Z" fill="${AMBER}" stroke="#0b0d10" stroke-width="1.5"/>`;
  },
  gauge(): string {
    let s = `<circle r="44" fill="#0b0d10" stroke="#3a424d" stroke-width="2"/>`;
    for (let a = -120; a <= 120; a += 30)
      s += `<line x1="0" y1="-40" x2="0" y2="-33" stroke="#fff" stroke-width="2" transform="rotate(${a})"/>`;
    return `${s}<path d="M-30 20A36 36 0 0 1 -36 -6" stroke="#2f9e5a" stroke-width="5" fill="none"/><path d="M-36 -6A36 36 0 0 1 10 -35" stroke="${PAPER}" stroke-width="5" fill="none"/><line x1="0" y1="0" x2="18" y2="-30" stroke="#fff" stroke-width="3"/><circle r="4" fill="#fff"/><rect x="8" y="10" width="26" height="12" fill="${RED}"/><text x="21" y="19.5" font-size="9" font-weight="700" text-anchor="middle" fill="#fff" font-family="Inter, system-ui, sans-serif">ICE</text>`;
  },
  trim(): string {
    const ticks = [-30, -18, -6, 6, 18, 30]
      .map(
        (y) =>
          `<line x1="-10" x2="10" y1="${y}" y2="${y}" stroke="${PAPER}" stroke-width="2"/>`,
      )
      .join("");
    return `<rect x="-12" y="-40" width="24" height="80" rx="6" fill="#2c333d" stroke="${PAPER}" stroke-width="2"/>${ticks}<path d="M22-20l10 10-10 10" stroke="${RED}" stroke-width="3" fill="none"/>`;
  },
  radio(): string {
    return `<rect x="-44" y="-20" width="88" height="40" rx="4" fill="#0b0d10" stroke="${PAPER}" stroke-width="1.5"/><text x="0" y="6" font-size="16" font-weight="700" text-anchor="middle" fill="${AMBER}" font-family="Inter, system-ui, sans-serif">7600</text><path d="M-30-34l60 68" stroke="${RED}" stroke-width="4"/>`;
  },
  flag(): string {
    return `${G.att(-8, 0)}<rect x="10" y="-30" width="30" height="14" fill="${RED}"/><text x="25" y="-19.5" font-size="10" font-weight="700" text-anchor="middle" fill="#fff" font-family="Inter, system-ui, sans-serif">OFF</text>`;
  },
};
type Glyph = keyof typeof G;
const DRILL_G: Record<string, Glyph> = {
  "d-engine-fire": "flame",
  "d-elec-fire": "bolt",
  "d-alternator-imc": "bolt",
  "d-trim": "trim",
  "d-pitot-icing": "gauge",
  "d-static": "gauge",
  "d-lostcomms": "radio",
  "d-vacuum-app": "flag",
  "d-flaps": "circuit",
};
/** The attitude each basic-instrument lesson works on (bank, pitch). */
const ATT: Record<string, [number, number]> = {
  "bai-sl": [0, 0],
  "bai-turns": [-20, 0],
  "bai-climb": [0, 12],
  "bai-climbturn": [18, 9],
  "bai-steep": [-45, 2],
  "bai-unusual": [60, -16],
  "bai-slow": [0, 6],
};
const idOf = (i: LibItem) => i.open.id;
function glyphOf(i: LibItem): string {
  const id = idOf(i);
  if (DRILL_G[id]) return G[DRILL_G[id]]();
  if (ATT[id]) return G.att(...ATT[id]);
  if (i.sub === "circuit") return G.route();
  const s = i.home;
  if (s === "ir.att") return id.startsWith("pp-") ? G.hsi() : G.att();
  if (s === "ir.nav") return G.hsi();
  if (s === "ir.hold") return G.hold();
  if (s === "ir.app") return G.app();
  if (s === "ir.emer") return G.flag();
  if (s === "ppl.circ") return G.circuit();
  if (s.startsWith("night.")) return G.moon();
  if (s === "ppl.emer" || s === "club.drills" || i.sub === "drill")
    return G.prop();
  return G.route();
}
const svg = (inner: string, cls: string) =>
  `<svg class="${cls}" viewBox="-60 -60 120 120" aria-hidden="true" focusable="false">${inner}</svg>`;

/** The cover of what opens the cockpit: a dark panel, the lesson's rank and its instrument, or a centred symbol. */
export function simCover(
  i: LibItem,
  l: Lang,
  rank: { n: number; of: number } | null,
): HTMLElement {
  const g = glyphOf(i);
  return h(
    "div",
    { class: `lb-sim s-${i.sub}`, "aria-hidden": "true" },
    h(
      "div",
      { class: "lb-sim-frame" },
      rank
        ? h(
            "div",
            { class: "lb-sim-no" },
            h("span", { class: "lb-sim-k" }, l === "fr" ? "LEÇON" : "LESSON"),
            h("b", { class: "num" }, String(rank.n)),
            h(
              "span",
              { class: "lb-sim-of" },
              l === "fr" ? `sur ${rank.of}` : `of ${rank.of}`,
            ),
          )
        : null,
      h("div", {
        class: `lb-sim-g${rank ? " side" : ""}`,
        html: svg(g, "lb-sim-svg"),
      }),
    ),
  );
}

// ------------------------------------------------------------------ a course's first slide
export interface CoverSlide {
  slide: SlideCanvas;
  step: Step;
  theme: Course["theme"];
  scenes: Course["scenes"];
  cockpit: Course["cockpit"];
  brand?: Course["brand"];
}
export function courseCover(c: Course): CoverSlide | null {
  const s = c.steps.find((x) => x.slide);
  return s?.slide
    ? {
        slide: s.slide,
        step: s,
        theme: c.theme,
        scenes: c.scenes,
        cockpit: c.cockpit,
        ...(c.brand ? { brand: c.brand } : {}),
      }
    : null;
}
const plates = new Map<string, Promise<string | null>>();
/** A cover's assets: an approach plate ("plate:<approach id>") drawn by the chart engine, as an image. */
export function plateUrl(id: string): Promise<string | null> | null {
  if (!id.startsWith("plate:")) return null;
  let p = plates.get(id);
  if (!p) {
    p = Promise.all([import("../plates/plates"), import("../nav/data")])
      .then(([pl, nav]) => {
        const a = nav.findApproach(id.slice(6));
        return a
          ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pl.approachPlate(a))}`
          : null;
      })
      .catch(() => null);
    plates.set(id, p);
  }
  return p;
}
