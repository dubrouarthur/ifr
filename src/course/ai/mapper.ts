// « Assistant IA » — the pure mapper: a DECK PLAN (schema.ts) becomes real course slides, built with the app's own
// factories (samples/exampleSlides.ts coverSlide / objectivesSlide / ideaSlide / quizSlide / recapSlide, the
// layout helpers of canvas/layouts.ts, the kit's CHECKLIST / DIAGRAM), the ready situations and goal sentences of
// situations.ts and the named animations of canvas/motion.ts. The result is a DeckStarter, so « Créer le cours »
// and « Ajouter au cours » go through the same addStarterDeck path as the built-in templates. Nothing here trusts
// the plan: every number is clamped, every id checked, every text fitted to its frame (else shortened).
import type {
  Course,
  GoalCheck,
  InstrumentMotion,
  InstrumentView,
  L10n,
  Lang,
  ReadoutId,
  SimScene,
  SlideBlock,
  SlideCanvas,
  SlideLayoutId,
  StageControl,
  YourTurn,
} from "../types";
import {
  READY_SITUATIONS,
  checkSituation,
  goalSentence,
  sceneOfSituation,
  SIT_LIMITS,
  yourTurnFor,
  type GoalSentence,
  type Situation,
} from "../situations";
import {
  coverSlide,
  ideaSlide,
  objectivesSlide,
  quizSlide,
  recapSlide,
} from "../samples/exampleSlides";
import { CHECKLIST, DIAGRAM } from "../samples/kit";
import { G, INST, MARK, SHAPE, T } from "../canvas/layouts";
import { DEFAULT_GRID } from "../canvas/geom";
import { textBlockFit } from "../canvas/readability";
import { resolveTheme } from "../canvas/themes";
import { MOTION_PRESETS } from "../canvas/motion";
import { orderControls } from "../handover";
import { pilotHolds } from "../canvas/controlStrip";
import { STEAM_GAUGE_LAYOUT, type SteamGaugeKind } from "../../avionics/steam";
import type { DeckStarter } from "../ui/deckStarters";
import {
  CALC_DRAG,
  CHANNEL_GAUGE,
  CONTROL_IDS,
  animationMarks,
} from "./catalog";
import { FORMATION_NAMES, type AiFormation } from "./prompt";
import type {
  DeckPlan,
  PlanCalcDiagram,
  PlanInstrument,
  PlanSituation,
  PlanSlide,
  PlanSlideKind,
  PlanText,
} from "./schema";

// ------------------------------------------------------------------ small helpers
const L = (en: string, fr: string): L10n => ({ en, fr });
const clamp = (v: number, a: number, b: number) =>
  Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : a;
const norm360 = (d: number) => ((Math.round(d) % 360) + 360) % 360;
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Cut a string at a word boundary to at most n characters (an ellipsis when cut). */
export function cap(s: string, n: number): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > n * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}
/** A plan text as an L10n, capped; a missing language takes the other one. */
function tx(p: PlanText | undefined, n: number): L10n {
  const en = cap(p?.en || p?.fr || "", n);
  const fr = cap(p?.fr || p?.en || "", n);
  return { en, fr };
}
const filled = (p: PlanText | undefined) =>
  !!(p && (p.en.trim() || p.fr.trim()));

/** Limits of the plan's strings (the system prompt says the same; this is the guard). */
export const CAPS = {
  eyebrow: 40,
  title: 64,
  subtitle: 90,
  lead: 130,
  line: 90,
  option: 60,
  explain: 240,
  source: 90,
  figure: 10,
  alt: 160,
  body: 220,
} as const;

// ------------------------------------------------------------------ situations → scenes
export interface MapContext {
  /** a short id unique to this generation (scene ids, block ids) */
  run: string;
  scenes: Record<string, SimScene>;
  keys: Map<string, string>;
  warnings: L10n[];
}
function newContext(run: string): MapContext {
  return { run, scenes: {}, keys: new Map(), warnings: [] };
}

/** The situation a plan names: the ready situation with the plan's numbers, clamped; the ready one when the numbers
 *  make an aircraft that cannot fly (below the stall speed…). */
export function situationOf(p: PlanSituation, cx?: MapContext): Situation {
  const ready =
    READY_SITUATIONS.find((r) => r.id === p.start) ?? READY_SITUATIONS[0];
  const base = clone(ready.sit);
  const lim = SIT_LIMITS;
  const want = {
    hdg: norm360(p.headingDeg),
    altFt:
      Math.round(clamp(p.altitudeFt, lim.altFt.min, lim.altFt.max) / 10) * 10,
    iasKt: Math.round(clamp(p.speedKt, lim.iasKt.min, lim.iasKt.max)),
    vsFpm:
      Math.round(clamp(p.verticalSpeedFpm, lim.vsFpm.min, lim.vsFpm.max) / 10) *
      10,
    bank: Math.round(clamp(p.bankDeg, lim.bank.min, lim.bank.max)),
    power: Math.round(clamp(p.powerPct, lim.power.min, lim.power.max)),
    flaps: Math.round(clamp(p.flaps, lim.flaps.min, lim.flaps.max)),
  };
  const same =
    want.hdg === norm360(base.hdg) &&
    want.altFt === base.altFt &&
    want.iasKt === base.iasKt &&
    want.vsFpm === base.vsFpm &&
    want.bank === base.bank &&
    want.power === base.power &&
    want.flaps === base.flaps;
  if (same) return base;
  const sit: Situation = { ...base, ...want, pitch: null };
  delete sit.trimmed;
  if (checkSituation(sit).some((i) => i.level === "error")) {
    cx?.warnings.push(
      L(
        `A situation could not fly as written: the ready situation « ${ready.name.en} » is used instead.`,
        `Une situation n’était pas pilotable telle quelle : la situation prête « ${ready.name.fr ?? ready.name.en} » la remplace.`,
      ),
    );
    return base;
  }
  return sit;
}
/** The course scene of a situation (one per distinct situation of the deck). */
function sceneFor(
  p: PlanSituation,
  cx: MapContext,
): { id: string; sit: Situation } {
  const sit = situationOf(p, cx);
  const key = JSON.stringify(sit);
  const known = cx.keys.get(key);
  if (known) return { id: known, sit };
  const id = `ai-${cx.run}.s${cx.keys.size + 1}`;
  const ready =
    READY_SITUATIONS.find((r) => r.id === p.start) ?? READY_SITUATIONS[0];
  const label = `${ready.name.en} · ${String(sit.hdg).padStart(3, "0")} · ${sit.altFt} ft · ${sit.iasKt} kt`;
  cx.scenes[id] = { ...sceneOfSituation(sit, { id, label }), cockpit: "steam" };
  cx.keys.set(key, id);
  return { id, sit };
}

const viewOf = (v: string): InstrumentView =>
  v === "six" || !(v in STEAM_GAUGE_LAYOUT)
    ? { kind: "six" }
    : { kind: "gauge", gauge: v as SteamGaugeKind };
const motionOf = (a: string): InstrumentMotion =>
  a !== "none" && MOTION_PRESETS.some((p) => p.id === a) ? { preset: a } : {};
const hasMotion = (m: InstrumentMotion) => !!(m.preset || m.script);

interface Inst {
  view: InstrumentView;
  alt: L10n;
  scene: string;
  sit: Situation;
  motion: InstrumentMotion;
}
function instOf(p: PlanInstrument, cx: MapContext): Inst {
  const s = sceneFor(p.situation, cx);
  const view = viewOf(p.view);
  const alt = filled(p.alt)
    ? tx(p.alt, CAPS.alt)
    : L("The instruments of the slide", "Les instruments de la diapo");
  return { view, alt, scene: s.id, sit: s.sit, motion: motionOf(p.animation) };
}
/** Instruments without an animation stay still: drop the empty motion the factories add (`{ loop: true }`). */
function dropEmptyMotion(slide: SlideCanvas): SlideCanvas {
  for (const b of slide.blocks)
    if (b.kind === "instrument" && b.motion && !hasMotion(b.motion))
      delete b.motion;
  return slide;
}

// ------------------------------------------------------------------ the slides
const foot = (t: L10n): SlideBlock => T("foot", t, G.left, G.foot, 1080, 32);
const rule = (x: number, y: number, w: number, group?: string): SlideBlock =>
  SHAPE("line", x, y - 8, w, 16, {
    stroke: "line",
    strokeW: 2,
    ...(group ? { group } : {}),
  });
const canvasOf = (
  blocks: SlideBlock[],
  layout: SlideLayoutId,
  scene?: string,
): SlideCanvas => ({
  size: { w: 1920, h: 1080 },
  grid: DEFAULT_GRID,
  layout,
  ...(scene ? { scene } : {}),
  blocks,
});

/** The gauge a numbered dot goes on: the view's own gauge, else the one that shows the moment's channel. */
function dotGauge(
  view: InstrumentView,
  animation: string,
  moment: string,
): SteamGaugeKind | null {
  const mark = animationMarks(animation).find((m) => m.id === moment);
  if (!mark) return null;
  if (view.kind === "gauge") return view.gauge as SteamGaugeKind;
  const g = mark.channel ? CHANNEL_GAUGE[mark.channel] : "ai";
  return STEAM_GAUGE_LAYOUT[g].panel === "six" ? g : "ai";
}

function idea(
  s: Extract<PlanSlide, { kind: "idea" }>,
  id: string,
  cx: MapContext,
): SlideCanvas {
  const lines = (
    s.lines.length ? s.lines : [{ text: s.title, moment: "" }]
  ).slice(0, 3);
  if (s.instrument) {
    const inst = instOf(s.instrument, cx);
    const used = new Set<string>();
    return ideaSlide({
      id,
      group: "ppl",
      eyebrow: tx(s.eyebrow, CAPS.eyebrow),
      title: tx(s.title, CAPS.title),
      what: tx(s.title, CAPS.title),
      lines: lines.map((l) => {
        const g =
          inst.motion.preset && l.moment && !used.has(l.moment)
            ? dotGauge(inst.view, inst.motion.preset, l.moment)
            : null;
        if (g) used.add(l.moment);
        return {
          text: tx(l.text, CAPS.line),
          ...(g ? { dot: { g, moment: l.moment } } : {}),
        };
      }),
      source: tx(s.source, CAPS.source),
      view: inst.view,
      alt: inst.alt,
      scene: inst.scene,
      motion: inst.motion,
    }).slide;
  }
  // words only: the same rows, the full width
  const w = 1392;
  return canvasOf(
    [
      T("eyebrow", tx(s.eyebrow, CAPS.eyebrow), G.left, G.eyebrowY, w, 32),
      T("title", tx(s.title, CAPS.title), G.left, G.titleY, w, 168),
      ...lines.flatMap((l, i): SlideBlock[] => {
        const y = 352 + i * 176;
        return [
          rule(G.left, y, w, `l${i + 1}`),
          T("body", tx(l.text, CAPS.line), G.left, y + 16, w, 136, {
            group: `l${i + 1}`,
          }),
        ];
      }),
      foot(tx(s.source, CAPS.source)),
    ],
    "instrumentNotes",
  );
}

/** The goal of an « À vous », with the plan's tolerance and hold time when they are sensible. */
export function goalChecks(
  g: GoalSentence,
  sit: Situation,
  tolerance: number,
  holdSeconds: number,
): { all: GoalCheck[]; holdS?: number } {
  const all = clone(g.checks(sit));
  const t = Math.abs(tolerance);
  if (t > 0)
    for (const c of all) {
      const p = c.p as Record<string, number>;
      const band = (lo: number, hi: number) => {
        if (t < lo || t > hi) return;
        const mid = (p.min + p.max) / 2;
        p.min = Math.round(mid - t);
        p.max = Math.round(mid + t);
      };
      if (c.id === "heading" && t >= 1 && t <= 30) p.tol = Math.round(t);
      else if (c.id === "altBand") band(20, 500);
      else if (c.id === "ias") band(2, 20);
      else if (c.id === "vsBand") band(50, 300);
      else if (c.id === "bankBand") band(2, 15);
      else if (
        (c.id === "cdiDefl" || c.id === "gsDefl") &&
        t >= 0.25 &&
        t <= 2.5
      )
        p.maxDots = t;
    }
  const holdS =
    holdSeconds > 0 ? Math.round(clamp(holdSeconds, 2, 60)) : g.holdS;
  return { all, ...(holdS ? { holdS } : {}) };
}
const fmt = (n: number, lang: Lang) =>
  Math.round(n)
    .toLocaleString("en-US")
    .replace(/,/g, lang === "fr" ? " " : ",");
const p3 = (n: number) => String(Math.round(n) % 360 || 360).padStart(3, "0");
/** A row of the live checklist for one goal check, with the readout that shows it. */
export function checkRow(c: GoalCheck): { text: L10n; readout?: ReadoutId } {
  const p = c.p as Record<string, number | string>;
  const n = (k: string) => Number(p[k]);
  const both = (f: (l: Lang) => string): L10n => ({ en: f("en"), fr: f("fr") });
  switch (c.id) {
    case "heading":
      return {
        text: both(
          (l) =>
            `${l === "fr" ? "Cap" : "Heading"} ${p3(n("value"))}, ±${n("tol")}°`,
        ),
        readout: "hdg",
      };
    case "altBand":
      return {
        text: both(
          (l) => `Altitude ${fmt(n("min"), l)}–${fmt(n("max"), l)} ft`,
        ),
        readout: "alt",
      };
    case "ias":
      return {
        text: both(
          (l) =>
            `${l === "fr" ? "Vitesse" : "Speed"} ${n("min")}–${n("max")} kt`,
        ),
        readout: "ias",
      };
    case "vsBand":
      return {
        text: both(
          (l) =>
            `${l === "fr" ? "Vario" : "Vertical speed"} ${fmt(n("min"), l)} … ${fmt(n("max"), l)} ft/min`,
        ),
        readout: "vs",
      };
    case "bankBand":
      return {
        text: both(
          (l) =>
            `${l === "fr" ? "Inclinaison" : "Bank"} ${n("min")}–${n("max")}°`,
        ),
        readout: "bank",
      };
    case "cdiDefl":
      return {
        text: L(
          `Bar within ${n("maxDots")} dot`,
          `Barre à moins de ${String(n("maxDots")).replace(".", ",")} point`,
        ),
        readout: "cdiDots",
      };
    case "gsDefl":
      return {
        text: L(
          `Glide path within ${n("maxDots")} dot`,
          `Plan à moins de ${String(n("maxDots")).replace(".", ",")} point`,
        ),
        readout: "gsDots",
      };
    case "obs":
      return {
        text: L(
          `Course ${p3(n("value"))} on the OBS`,
          `Route ${p3(n("value"))} à l’OBS`,
        ),
        readout: "obs1",
      };
    case "toFrom":
      return {
        text: L(`${p.value} flag`, `Indicateur ${p.value}`),
        readout: "toFrom",
      };
    default:
      return { text: L("Goal met", "Objectif atteint") };
  }
}

function yourTurn(
  s: Extract<PlanSlide, { kind: "yourTurn" }>,
  id: string,
  cx: MapContext,
): SlideCanvas {
  const g = goalSentence(s.goal) ?? goalSentence("holdHeading")!;
  const sc = sceneFor(s.situation, cx);
  const view = viewOf(s.view);
  const controls: StageControl[] = orderControls([
    ...g.controls,
    ...s.controls.filter((c): c is StageControl =>
      (CONTROL_IDS as string[]).includes(c),
    ),
  ]);
  const goal = goalChecks(g, sc.sit, s.tolerance, s.holdSeconds);
  const ready = yourTurnFor(g, sc.sit, "slide");
  const holds = pilotHolds(controls);
  const rows = goal.all.map((c, i) => ({ ...checkRow(c), check: i }));
  const yt: YourTurn = {
    where: "slide",
    prompt: filled(s.title) ? tx(s.title, CAPS.title) : ready.prompt,
    controls,
    assist: { holdAlt: holds.holdAlt, holdIas: holds.holdIas },
    goal: {
      all: goal.all,
      ...(goal.holdS ? { holdS: goal.holdS } : {}),
      graded: false,
      ...(filled(s.success) ? { success: tx(s.success, CAPS.line) } : {}),
    },
    ...(filled(s.hint) ? { hint: tx(s.hint, CAPS.line) } : {}),
  };
  const six = view.kind !== "gauge";
  const [ix, iy, iw, ih] = six ? [960, 136, 840, 792] : [1080, 120, 720, 800];
  const listH = 80 * rows.length + 72;
  return canvasOf(
    [
      T("eyebrow", L("Your turn", "À vous"), G.left, G.eyebrowY, 768, 32),
      T("title", tx(s.title, CAPS.title), G.left, G.titleY, 768, 168),
      CHECKLIST(`${id}.checks`, rows, G.left, 352, 768, listH, {
        title: L("Goal", "Objectif"),
      }),
      T("small", tx(s.tip, CAPS.line), G.left, 384 + listH, 768, 120),
      INST(
        view,
        L("Live instruments: your turn", "Les instruments en direct : à vous"),
        ix,
        iy,
        iw,
        ih,
        {
          id: `${id}.inst`,
          scene: sc.id,
          mode: "live",
          controls,
          yourTurn: yt,
        },
      ),
      foot(tx(s.source, CAPS.source)),
    ],
    "yourTurn",
    sc.id,
  );
}

function flight(
  s: Extract<PlanSlide, { kind: "flight" }>,
  id: string,
  cx: MapContext,
): SlideCanvas {
  const g = goalSentence(s.goal) ?? goalSentence("holdHeading")!;
  const sc = sceneFor(s.situation, cx);
  const yt = yourTurnFor(g, sc.sit, "sim", sc.id);
  if (filled(s.success))
    yt.goal = { ...yt.goal, success: tx(s.success, CAPS.line) };
  if (filled(s.title)) yt.prompt = tx(s.title, CAPS.title);
  return canvasOf(
    [
      T("eyebrow", L("Your turn", "À vous"), G.left, G.eyebrowY, 1392, 32),
      T("title", tx(s.title, CAPS.title), G.left, G.titleY, 1392, 168),
      T("body", tx(s.brief, CAPS.body), G.left, 352, 600, 296),
      T(
        "small",
        L(
          "The course waits here. The result shows on this slide.",
          "Le cours attend ici. Le résultat s’affiche sur cette diapo.",
        ),
        G.left,
        688,
        600,
        104,
      ),
      {
        id: `${id}.sim`,
        frame: { x: 816, y: 352, w: 984, h: 560, z: 1 },
        kind: "simViewport",
        scene: sc.id,
        view: "cockpit",
        alt: L("The simulator's cockpit", "Le cockpit du simulateur"),
        yourTurn: yt,
      } as SlideBlock,
      foot(tx(s.source, CAPS.source)),
    ],
    "yourTurn",
    sc.id,
  );
}

/** Calc diagram numbers, clamped to what the diagrams draw. */
export function calcDiagram(
  d: PlanCalcDiagram,
): Extract<SlideBlock, { kind: "diagram" }>["d"] {
  const drag = CALC_DRAG[d.kind] ?? [];
  const r = (v: number, a: number, b: number) => Math.round(clamp(v, a, b));
  const hdg = (v: number) => norm360(v);
  const withDrag = <T extends object>(o: T) => ({
    ...o,
    ...(drag.length ? { drag } : {}),
  });
  switch (d.kind) {
    case "sixtyToOne":
      return {
        kind: "calc",
        calc: withDrag({
          kind: "sixtyToOne",
          course: hdg(d.course),
          flownNm: r(d.flownNm, 5, 120),
          offNm: clamp(d.offNm, 0.5, 20),
          toGoNm: r(d.toGoNm, 5, 120),
        }),
      };
    case "windTriangle":
      return {
        kind: "calc",
        calc: withDrag({
          kind: "windTriangle",
          course: hdg(d.course),
          tasKt: r(d.tasKt, 60, 300),
          windDir: hdg(d.windDir),
          windKt: r(d.windKt, 0, 60),
        }),
      };
    case "profile":
      return {
        kind: "calc",
        calc: withDrag({
          kind: "profile",
          fromFt: r(d.fromFt, 500, 15000),
          toFt: r(d.toFt, 0, 14000),
          angleDeg: clamp(d.angleDeg, 1, 6),
          gsKt: r(d.gsKt, 60, 300),
        }),
      };
    case "vdp":
      return {
        kind: "calc",
        calc: withDrag({
          kind: "vdp",
          mdaFt: r(d.mdaFt, 200, 5000),
          tdzeFt: r(d.tdzeFt, 0, 4000),
          vdpNm: clamp(d.vdpNm, 0.5, 5),
        }),
      };
    case "holdWind":
      return {
        kind: "calc",
        calc: withDrag({
          kind: "holdWind",
          inbound: hdg(d.inbound),
          turn: d.turn === "L" ? "L" : "R",
          windDir: hdg(d.windDir),
          windKt: r(d.windKt, 0, 50),
          tasKt: r(d.tasKt, 70, 250),
        }),
      };
    case "compass":
      return {
        kind: "calc",
        calc: withDrag({
          kind: "compass",
          tc: hdg(d.tc),
          wca: r(d.wca, -30, 30),
          variation: r(d.variation, -30, 30),
          deviation: r(d.deviation, -10, 10),
        }),
      };
    case "turn":
      return {
        kind: "calc",
        calc: {
          kind: "turn",
          tasKt: r(d.tasKt, 60, 300),
          bankDeg: r(d.bankDeg, 5, 60),
        },
      };
  }
}

function calc(
  s: Extract<PlanSlide, { kind: "calc" }>,
  id: string,
): SlideCanvas {
  const d = calcDiagram(s.diagram);
  const interactive = (CALC_DRAG[s.diagram.kind] ?? []).length > 0;
  const lines = s.lines.slice(0, 3);
  const x = 1176;
  return canvasOf(
    [
      T("eyebrow", tx(s.eyebrow, CAPS.eyebrow), G.left, G.eyebrowY, 1392, 32),
      T("title", tx(s.title, CAPS.title), G.left, G.titleY, 1392, 88),
      T("lead", tx(s.lead, CAPS.lead), G.left, G.leadY, 1560, 56),
      DIAGRAM(
        `${id}.d`,
        d,
        filled(s.alt) ? tx(s.alt, CAPS.alt) : tx(s.title, CAPS.title),
        G.left,
        368,
        960,
        592,
        {
          ...(interactive ? { interactive: true } : {}),
          ...(interactive && filled(s.caption)
            ? { caption: tx(s.caption, CAPS.line) }
            : {}),
        },
      ),
      ...lines.flatMap((l, i): SlideBlock[] => [
        MARK(i + 1, x + 28, 424 + i * 176, {
          size: 56,
          reveal: i + 1,
          group: `c${i}`,
        }),
        T("body", tx(l, CAPS.line), x + 88, 384 + i * 176, 536, 136, {
          reveal: i + 1,
          group: `c${i}`,
        }),
      ]),
      foot(tx(s.source, CAPS.source)),
    ],
    "calc",
  );
}

const pad3 = <T>(xs: T[], fill: T): T[] =>
  [...xs, fill, fill, fill].slice(0, 3);

/** One slide of the plan, built. */
export function slideOf(
  s: PlanSlide,
  id: string,
  cx: MapContext,
): { layout: SlideLayoutId; slide: SlideCanvas } {
  switch (s.kind) {
    case "cover": {
      const i = instOf(s.instrument, cx);
      return {
        layout: "cover",
        slide: coverSlide({
          id,
          eyebrow: tx(s.eyebrow, CAPS.eyebrow),
          title: tx(s.title, CAPS.title),
          sub: tx(s.subtitle, CAPS.subtitle),
          lead: tx(s.lead, CAPS.lead),
          source: tx(s.source, CAPS.source),
          ...i,
        }),
      };
    }
    case "goals": {
      const i = instOf(s.instrument, cx);
      const items = s.items.filter(filled).map((t) => tx(t, CAPS.line));
      return {
        layout: "ready",
        slide: objectivesSlide({
          id,
          items: items.length
            ? items.slice(0, 3)
            : [L("Follow the lesson", "Suivre la leçon")],
          source: tx(s.source, CAPS.source),
          ...i,
        }),
      };
    }
    case "idea":
      return { layout: "instrumentNotes", slide: idea(s, id, cx) };
    case "yourTurn":
      return { layout: "yourTurn", slide: yourTurn(s, id, cx) };
    case "quiz": {
      const i = instOf(s.instrument, cx);
      const options = s.options
        .filter(filled)
        .slice(0, 4)
        .map((o) => tx(o, CAPS.option));
      while (options.length < 2)
        options.push(L("None of these", "Aucune de ces réponses"));
      return {
        layout: "quiz",
        slide: quizSlide({
          id,
          title: tx(s.question, CAPS.title + 40),
          options,
          answer: Math.round(clamp(s.answer, 0, options.length - 1)),
          explain: tx(s.explain, CAPS.explain),
          source: tx(s.source, CAPS.source),
          ...i,
        }),
      };
    }
    case "flight":
      return { layout: "yourTurn", slide: flight(s, id, cx) };
    case "calc":
      return { layout: "calc", slide: calc(s, id) };
    case "recap": {
      const cols = pad3(
        s.items.map((i): [L10n, L10n] => [
          tx(i.figure, CAPS.figure),
          tx(i.text, CAPS.line),
        ]),
        [
          L("✓", "✓"),
          L("Ask your instructor", "Demandez à votre instructeur"),
        ] as [L10n, L10n],
      ).slice(0, Math.max(1, Math.min(3, s.items.length)));
      const slide = recapSlide({
        title: tx(s.title, CAPS.title),
        cols,
        source: tx(s.source, CAPS.source),
      });
      // the recap has no instrument: it names no situation
      delete slide.scene;
      return { layout: "recap", slide };
    }
  }
}

// ------------------------------------------------------------------ fitting and ids
const AUTO_ID = /^[a-z]\d+$/;
/** Block ids the canvas helpers number from a module counter become `<slide>.<prefix><n>` (stable, unique). */
function stableBlockIds(slide: SlideCanvas, id: string): void {
  let n = 0;
  for (const b of slide.blocks)
    if (AUTO_ID.test(b.id)) b.id = `${id}.${b.id[0]}${++n}`;
}
const THEME = resolveTheme("classroom");
/** Every text fits its frame in both languages at the readable floor; a text that does not is shortened. */
export function fitTexts(slide: SlideCanvas, warn?: (t: L10n) => void): void {
  for (const b of slide.blocks) {
    if (b.kind !== "text" || b.editorOnly) continue;
    for (const lang of ["en", "fr"] as Lang[]) {
      let guard = 0;
      let cut = false;
      while (textBlockFit(b, THEME, lang).overflow && guard++ < 40) {
        const t = b.text[lang] ?? b.text.en;
        const words = t.replace(/…$/, "").split(" ");
        if (words.length <= 1) break;
        b.text = {
          ...b.text,
          [lang]: `${words
            .slice(0, -1)
            .join(" ")
            .replace(/[\s,;:.–—-]+$/, "")}…`,
        };
        cut = true;
      }
      if (cut && warn)
        warn(
          L(
            `A text was shortened to fit its slide: « ${b.text.en} »`,
            `Un texte a été raccourci pour tenir dans sa diapo : « ${b.text.fr ?? b.text.en} »`,
          ),
        );
    }
  }
}

// ------------------------------------------------------------------ the deck
export interface MappedDeck {
  starter: DeckStarter;
  scenes: Record<string, SimScene>;
  slides: { layout: SlideLayoutId; slide: SlideCanvas; kind: PlanSlideKind }[];
  warnings: L10n[];
}

/** A short random id for one generation (scene and block ids never clash with an earlier one). */
export function runId(): string {
  const a = new Uint8Array(4);
  try {
    crypto.getRandomValues(a);
  } catch {
    for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(a, (x) => x.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 6);
}

/** The plan as a DeckStarter (the built-in templates' shape) with the scenes its slides show. Pure. */
export function mapPlan(
  plan: DeckPlan,
  o: { run?: string; formation?: AiFormation } = {},
): MappedDeck {
  const cx = newContext(o.run ?? runId());
  const slides = plan.slides.map((s, i) => {
    const id = `ai-${cx.run}-${i + 1}`;
    const r = slideOf(s, id, cx);
    dropEmptyMotion(r.slide);
    stableBlockIds(r.slide, id);
    fitTexts(r.slide, (t) => cx.warnings.push(t));
    return { ...r, kind: s.kind };
  });
  const cover = plan.slides.find(
    (s): s is Extract<PlanSlide, { kind: "cover" }> => s.kind === "cover",
  );
  const scenes = cx.scenes;
  const starter: DeckStarter = {
    id: `ai-${cx.run}`,
    title: tx(plan.title, CAPS.title),
    pitch: tx(plan.summary, CAPS.lead),
    theme: "classroom",
    ...(o.formation ? { level: { ...FORMATION_NAMES[o.formation] } } : {}),
    slides: slides.map((s) => s.layout),
    make: Object.fromEntries(slides.map((s, i) => [i, () => clone(s.slide)])),
    ...(cover
      ? {
          cover: {
            eyebrow: tx(cover.eyebrow, CAPS.eyebrow),
            title: tx(cover.title, CAPS.title),
            subtitle: tx(cover.subtitle, CAPS.subtitle),
            lead: tx(cover.lead, CAPS.lead),
            foot: tx(cover.source, CAPS.source),
          },
        }
      : {}),
    scenes: () => clone(scenes),
  };
  return { starter, scenes, slides, warnings: cx.warnings };
}

/** The finishing touches of a course made from a plan: its own title and summary, the « ai » tag. */
export function finishCourse(c: Course, plan: DeckPlan): Course {
  return {
    ...c,
    title: tx(plan.title, CAPS.title),
    summary: tx(plan.summary, CAPS.lead),
    tags: [...new Set([...(c.tags ?? []), "ai"])],
  };
}

// ------------------------------------------------------------------ the outline (preview before creating)
export interface OutlineItem {
  kind: PlanSlideKind;
  title: L10n;
  /** the instrument shown (« six », « asi »…) or null */
  view: string | null;
  animation: string | null;
}
const KIND_NAMES: Record<PlanSlideKind, L10n> = {
  cover: L("Cover", "Couverture"),
  goals: L("Goals", "Objectifs"),
  idea: L("Idea", "Idée"),
  yourTurn: L("Your turn", "À vous"),
  quiz: L("Question", "Question"),
  flight: L("Flight", "Vol"),
  calc: L("Calculation", "Calcul"),
  recap: L("Takeaways", "À retenir"),
};
export const kindName = (k: PlanSlideKind, lang: Lang): string =>
  (lang === "fr" ? KIND_NAMES[k].fr : KIND_NAMES[k].en) ?? KIND_NAMES[k].en;
export function outlineOf(plan: DeckPlan): OutlineItem[] {
  return plan.slides.map((s) => {
    const title =
      s.kind === "quiz"
        ? s.question
        : s.kind === "goals"
          ? {
              en: "What you will be able to do",
              fr: "Ce que vous saurez faire",
            }
          : s.title;
    const inst =
      s.kind === "cover" ||
      s.kind === "goals" ||
      s.kind === "quiz" ||
      s.kind === "idea"
        ? s.instrument
        : null;
    const view =
      s.kind === "yourTurn"
        ? s.view
        : s.kind === "flight"
          ? "sim"
          : s.kind === "calc"
            ? s.diagram.kind
            : (inst?.view ?? null);
    const animation = inst && inst.animation !== "none" ? inst.animation : null;
    return { kind: s.kind, title: tx(title, CAPS.title + 40), view, animation };
  });
}
/** Is the student asked to act on this slide? (pacing: never three passive slides in a row) */
export const isActionKind = (k: PlanSlideKind): boolean =>
  k === "yourTurn" || k === "quiz" || k === "flight" || k === "calc";

/** The plan with its slides reordered or removed (the outline's edits). */
export function editPlan(plan: DeckPlan, order: number[]): DeckPlan {
  return {
    ...plan,
    slides: order
      .filter((i) => i >= 0 && i < plan.slides.length)
      .map((i) => plan.slides[i]),
  };
}
