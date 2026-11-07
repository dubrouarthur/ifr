// The 16:9 covers of the unified library's cards. A course shows its first slide and a sim lesson the cover of its
// briefing deck (both drawn by the slide engine, course/ui/library.ts); a procedure shows a checklist card (its
// category and aircraft, the title, the first challenge–response lines with the memory items marked); a failure drill,
// a scenario or a school circuit shows its flight profile over a flight strip. Light paper, hairlines, the slide
// tokens (path magenta, key amber, stop red): never a dark card.
import { h } from "../ui/dom";
import type { Course, Lang, SlideCanvas, Step } from "../course/types";
import { loc } from "../course/i18n";
import { LESSON_META, LESSON_SIM } from "./meta";
import type { LibItem } from "./model";
import { splitItem } from "./sources";

const NS = "http://www.w3.org/2000/svg";
function svg(w: number, hgt: number, cls: string): SVGSVGElement {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", `0 0 ${w} ${hgt}`);
  s.setAttribute("preserveAspectRatio", "xMidYMid meet");
  s.setAttribute("class", cls);
  s.setAttribute("aria-hidden", "true");
  return s;
}
function el(name: string, attrs: Record<string, string | number>): SVGElement {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

// ------------------------------------------------------------------ the checklist card
/** A procedure's cover: the laminated checklist card of the aircraft. */
export function checklistCover(i: LibItem, l: Lang): HTMLElement {
  const rows = (i.lines ?? []).slice(0, 4);
  return h(
    "div",
    { class: `lb-ck cat-${i.facet ?? "other"}`, "aria-hidden": "true" },
    h(
      "div",
      { class: "lb-ck-top" },
      h("span", { class: "lb-ck-ac" }, i.aircraft || "C172S"),
      h("span", { class: "lb-ck-cat" }, i.eyebrow ? loc(i.eyebrow, l) : ""),
    ),
    h("div", { class: "lb-ck-t" }, loc(i.title, l)),
    h(
      "ol",
      { class: "lb-ck-rows" },
      ...rows.map((r) => {
        const { c, r: resp } = splitItem(r.text);
        return h(
          "li",
          { class: r.memory ? "mem" : "" },
          h("span", { class: "lb-ck-box" }),
          h("span", { class: "lb-ck-c" }, c),
          h("span", { class: "lb-ck-dots" }),
          h("span", { class: "lb-ck-r" }, resp),
        );
      }),
    ),
  );
}

// ------------------------------------------------------------------ the flight profile and strip
type Profile = "takeoff" | "cruise" | "approach" | "hold" | "circuit" | "vfr";
export function profileOf(i: LibItem): Profile {
  const f = (i.facet ?? "").toUpperCase();
  if (i.sub === "circuit") return "circuit";
  if (f === "LINEUP" || f === "CLIMBOUT" || f === "DEP") return "takeoff";
  if (f === "CRUISE") return "cruise";
  if (f === "HOLD") return "hold";
  if (f === "VFR") return "vfr";
  return "approach";
}
/** A flight's cover: its vertical profile (the path in magenta, a failure where the drill gives it) over a strip. */
export function stripCover(i: LibItem, l: Lang): HTMLElement {
  const W = 320;
  const H = 132;
  const g = svg(W, H, "lb-fs-svg");
  const ground = 112;
  g.append(
    el("line", { x1: 0, y1: ground, x2: W, y2: ground, class: "lb-fs-gnd" }),
  );
  for (let x = 16; x < W; x += 32)
    g.append(
      el("line", {
        x1: x,
        y1: ground,
        x2: x,
        y2: ground + 5,
        class: "lb-fs-tick",
      }),
    );
  const path = (d: string, cls = "lb-fs-path") =>
    g.append(el("path", { d, class: cls }));
  const rwy = (x: number) =>
    g.append(
      el("rect", {
        x,
        y: ground - 3,
        width: 46,
        height: 6,
        rx: 1,
        class: "lb-fs-rwy",
      }),
    );
  const fail = (x: number, y: number) => {
    g.append(el("circle", { cx: x, cy: y, r: 9, class: "lb-fs-fail" }));
    g.append(
      el("path", {
        d: `M${x} ${y - 4}v4.5M${x} ${y + 3.6}v.4`,
        class: "lb-fs-fail-i",
      }),
    );
  };
  const plane = (x: number, y: number, rot = 0) =>
    g.append(
      el("path", {
        d: "M-9 0h18M2-1l-5-7h-2.5l2.5 7M2 1l-5 7h-2.5l2.5-7M-7-.6l-2.4-3.4h-1.4l1.2 4M-7 .6l-2.4 3.4h-1.4l1.2-4",
        transform: `translate(${x} ${y}) rotate(${rot})`,
        class: "lb-fs-ac",
      }),
    );
  const drill = i.sub === "drill";
  switch (profileOf(i)) {
    case "takeoff":
      rwy(18);
      path(`M24 ${ground}H70L250 30H${W}`);
      plane(150, 30 + ((250 - 150) / 180) * (ground - 30), -24);
      if (drill) fail(118, 30 + ((250 - 118) / 180) * (ground - 30) - 16);
      break;
    case "cruise":
      path(`M0 46H${W}`);
      plane(210, 46);
      if (drill) {
        path(`M150 46Q220 50 280 ${ground - 2}`, "lb-fs-path alt");
        fail(150, 30);
      }
      break;
    case "hold":
      path(`M0 58H120`);
      path("M120 40h110a18 18 0 0 1 0 36h-110a18 18 0 0 1 0-36z");
      plane(180, 40);
      break;
    case "circuit":
      rwy(18);
      path(`M24 ${ground}H60L120 44H190a16 16 0 0 1 0 32h-30`);
      path(`M210 76L292 ${ground}`, "lb-fs-path");
      rwy(268);
      plane(150, 44);
      break;
    case "vfr":
      path(
        `M0 ${ground}L40 92L70 100L110 80L150 96L190 72L230 90L270 78L${W} ${ground}`,
        "lb-fs-hill",
      );
      path(`M0 40C80 34 160 46 ${W} 36`);
      plane(170, 40);
      break;
    default: {
      rwy(260);
      // the 3° path to the threshold, the intermediate level before it
      path(`M0 34H110L262 ${ground}`);
      path(`M262 ${ground}L292 ${ground - 18}`, "lb-fs-path miss");
      plane(170, 34 + ((170 - 110) / 152) * (ground - 34), 27);
      if (drill) fail(130, 22);
    }
  }
  const eyebrow = i.eyebrow ? loc(i.eyebrow, l) : "";
  return h(
    "div",
    {
      class: `lb-fs prof-${profileOf(i)}${drill ? " is-drill" : ""}`,
      "aria-hidden": "true",
    },
    g,
    h(
      "div",
      { class: "lb-fs-strip" },
      h(
        "span",
        { class: "lb-fs-a" },
        i.aircraft ?? (eyebrow.split(" · ")[0] || "C172S"),
      ),
      h("span", { class: "lb-fs-t" }, loc(i.title, l)),
      h(
        "span",
        { class: "lb-fs-k" },
        drill ? eyebrow : (eyebrow.split(" · ")[1] ?? ""),
      ),
    ),
  );
}

// ------------------------------------------------------------------ the briefing cover of a sim lesson
export interface CoverSlide {
  slide: SlideCanvas;
  step: Step;
  theme: Course["theme"];
  scenes: Course["scenes"];
  cockpit: Course["cockpit"];
  brand?: Course["brand"];
}
const firstSlide = (c: Course): CoverSlide | null => {
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
};
export function courseCover(c: Course): CoverSlide | null {
  return firstSlide(c);
}
/** The hold a holding lesson flies (train/curriculum.ts), for its cover's hold diagram. */
const HOLD_OF: Record<string, { inbound: number; turn: "L" | "R"; fix: string; legMin: number; altFt: number }> = {
  "hold-direct": { inbound: 270, turn: "R", fix: "ARD", legMin: 1, altFt: 3000 },
  "hold-teardrop": { inbound: 270, turn: "R", fix: "ARD", legMin: 1, altFt: 3000 },
  "hold-parallel": { inbound: 270, turn: "R", fix: "ARD", legMin: 1, altFt: 3000 },
  "hold-left": { inbound: 210, turn: "L", fix: "MSV", legMin: 1, altFt: 4500 },
  "hold-wind": { inbound: 270, turn: "R", fix: "ARD", legMin: 1, altFt: 3000 },
  "hold-ndb": { inbound: 270, turn: "R", fix: "PA", legMin: 1, altFt: 3000 },
  "hold-fix": { inbound: 270, turn: "L", fix: "KEDDY", legMin: 1, altFt: 4000 },
  "hold-random": { inbound: 270, turn: "R", fix: "ARD", legMin: 1, altFt: 3000 },
};
const plates = new Map<string, Promise<string | null>>();
/** A cover's assets: an approach plate ("plate:<approach id>") drawn by the chart engine, as an image. */
export function plateUrl(id: string): Promise<string | null> | null {
  if (!id.startsWith("plate:")) return null;
  let p = plates.get(id);
  if (!p) {
    p = Promise.all([import("../plates/plates"), import("../nav/data")])
      .then(([pl, nav]) => {
        const a = nav.findApproach(id.slice(6));
        return a ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pl.approachPlate(a))}` : null;
      })
      .catch(() => null);
    plates.set(id, p);
  }
  return p;
}
/** The cover of a lesson's briefing: the deck a school wrote for it (a sample), else the generated deck's. */
export async function lessonCover(
  i: LibItem,
  l: Lang,
  written?: Course | null,
): Promise<CoverSlide | null> {
  if (written) return firstSlide(written);
  const id = i.open.k === "lesson" ? i.open.id : "";
  const m = LESSON_META[id];
  if (!m) return null;
  const sim = LESSON_SIM[id];
  const { buildBriefingDeck } = await import("../lesson/briefingDeck");
  const deck = buildBriefingDeck(
    {
      id,
      stage: m.stage,
      title: l === "fr" ? m.fr : m.en,
      summary: "",
      objectives: [],
      standards: [],
      briefing: [],
      ...(sim?.plate ? { plate: sim.plate } : {}),
      allowAp: sim?.ap ?? false,
      minutes: m.minutes,
    },
        l,
    { steps: [], ...(HOLD_OF[id] ? { hold: HOLD_OF[id] } : {}) },
  );
  return firstSlide(deck);
}
