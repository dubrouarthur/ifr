// Ground school stage — pure geometry shared by the panes, the overlay, the plan inset and the slide blocks.
// No DOM, no canvas: everything here is unit-tested (tests/course-stage.test.ts).
//
// Coordinates. Every cockpit display draws on a 1024 × 768 logical surface (pfd.ts, mfd.ts, steam.ts,
// airliner.ts). A pane shows a `PaneFrame`: which renderer draws, and the visible rectangle of that logical
// drawing (the whole display, a crop to an EXPLAIN_REGIONS rectangle, or one single gauge). Annotations are
// authored in the SOURCE drawing's logical coordinates, so they survive a change of crop: the overlay uses the
// same rectangle as its viewBox. Diagram, still and image panes use 0..1 coordinates (SPEC §4.3).
import { EXPLAIN_REGIONS } from "../../ui/explain";
import { STEAM_GAUGE_LAYOUT } from "../../avionics/steam";
import type {
  Annotation,
  Cockpit,
  CropRef,
  DiagramSpec,
  ExplainTable,
  InstrumentGauge,
  InstrumentView,
  PaneView,
  Pt,
  Rect,
} from "../types";
import type { SteamGaugeKind } from "../../avionics/steam";

export const LOGICAL_W = 1024;
export const LOGICAL_H = 768;
export const FULL_RECT: Rect = [0, 0, LOGICAL_W, LOGICAL_H];
export const UNIT_RECT: Rect = [0, 0, 1, 1];

/** Which full-display renderer draws a pane. */
export type DisplayKind =
  | "pfd"
  | "mfd"
  | "six"
  | "stack"
  | "airlinerPfd"
  | "nd";
export const DISPLAY_TABLE: Record<DisplayKind, ExplainTable> = {
  pfd: "G1000_PFD",
  mfd: "G1000_MFD",
  six: "STEAM_LEFT",
  stack: "STEAM_RIGHT",
  airlinerPfd: "AL_PFD",
  nd: "AL_ND",
};
export const TABLE_DISPLAY: Record<ExplainTable, DisplayKind> = {
  G1000_PFD: "pfd",
  G1000_MFD: "mfd",
  STEAM_LEFT: "six",
  STEAM_RIGHT: "stack",
  AL_PFD: "airlinerPfd",
  AL_ND: "nd",
};

/** What a pane draws and which part of it shows. */
export type PaneFrame =
  | {
      kind: "display";
      display: DisplayKind;
      /** visible rectangle of the 1024 × 768 drawing */
      rect: Rect;
      /** the explain table the annotations and anchors use */
      table: ExplainTable;
      /** a crop (not the whole display): the PFD text scale is pinned to 1 */
      cropped: boolean;
    }
  | {
      kind: "gauge";
      gauge: SteamGaugeKind;
      /** the panel the gauge sits on (its coordinates are the annotation coordinates) */
      display: "six" | "stack";
      table: ExplainTable;
      rect: Rect;
      cx: number;
      cy: number;
      r: number;
    }
  | {
      kind: "diagram";
      d: DiagramSpec;
      asset?: string;
      rect: Rect;
      aspect: number;
    }
  | { kind: "still"; asset: string; rect: Rect; aspect: number }
  | { kind: "image"; asset: string; rect: Rect; aspect: number };

/** Crops of the G1000 PFD used by the `pfd.*` gauges (logical 1024 × 768). */
export const PFD_CROPS: Record<"pfd.attitude" | "pfd.hsi" | "pfd.tapes", Rect> =
  {
    "pfd.attitude": [196, 60, 632, 404],
    "pfd.hsi": [374, 424, 276, 316], // the rose and its heading box, clear of the HDG / CRS windows and the NAV source labels
    "pfd.tapes": [112, 56, 852, 426],
  };
/** The radio stack: the steam panel's NAV/COM + ADF/DME block, or the G1000 top bar. */
export const RADIO_CROPS: Record<
  "steam" | "glass",
  { display: DisplayKind; rect: Rect }
> = {
  steam: { display: "stack", rect: [396, 292, 618, 268] },
  glass: { display: "pfd", rect: [0, 0, 1024, 54] },
};
export const MFD_MAP_CROP: Rect = [156, 54, 560, 690];

const isSteamGauge = (g: string): g is SteamGaugeKind =>
  g in STEAM_GAUGE_LAYOUT;

/** An explain region by id ('STEAM_LEFT:4'): its rectangle and title, or null. */
export function explainRegion(
  id: string,
): { table: ExplainTable; index: number; rect: Rect; title: string } | null {
  const m = /^([A-Z_0-9]+):(\d+)$/.exec(id);
  if (!m) return null;
  const table = m[1] as ExplainTable;
  const rows = (
    EXPLAIN_REGIONS as Record<
      string,
      readonly (readonly [number, number, number, number, string, string])[]
    >
  )[table];
  const index = Number(m[2]);
  const r = rows?.[index];
  if (!r) return null;
  return { table, index, rect: [r[0], r[1], r[2], r[3]], title: r[4] };
}

/** The rectangle a CropRef names, or the whole display. */
export function cropRect(crop: CropRef | undefined): Rect {
  if (!crop) return FULL_RECT;
  if ("rect" in crop) return sanitizeRect(crop.rect, FULL_RECT);
  return explainRegion(crop.region)?.rect ?? FULL_RECT;
}

/** Clamp a rect into bounds and give it a minimum size (author data may be off the display). */
export function sanitizeRect(r: Rect, bounds: Rect = FULL_RECT): Rect {
  const [bx, by, bw, bh] = bounds;
  const fin = (v: number, d: number) => (Number.isFinite(v) ? v : d);
  const minW = bw / 64;
  const minH = bh / 64;
  let w = Math.min(bw, Math.max(minW, fin(r[2], bw)));
  let h = Math.min(bh, Math.max(minH, fin(r[3], bh)));
  const x = Math.min(bx + bw - w, Math.max(bx, fin(r[0], bx)));
  const y = Math.min(by + bh - h, Math.max(by, fin(r[1], by)));
  w = Math.min(w, bx + bw - x);
  h = Math.min(h, by + bh - y);
  return [x, y, w, h];
}

/** Single steam gauge: its panel rectangle with a small margin round the bezel. */
export function gaugeRect(kind: SteamGaugeKind): Rect {
  const g = STEAM_GAUGE_LAYOUT[kind];
  const R = g.r * 1.08;
  return [g.cx - R, g.cy - R, 2 * R, 2 * R];
}

/** Aspect (w / h) of a diagram pane: the renderers' own boxes. */
export function diagramAspect(d: DiagramSpec): number {
  switch (d.kind) {
    case "hold":
      return 400 / 360;
    case "profile":
      return 960 / 400;
    case "plate":
      return d.crop
        ? Math.max(0.2, (d.crop[2] * 8.5) / Math.max(1e-3, d.crop[3] * 11))
        : 8.5 / 11;
    case "calc":
      return calcDiagramAspect(d.calc.kind);
    default:
      return 4 / 3;
  }
}
/** Aspect of each calc diagram widget (diagrams.ts draws in these viewBoxes). */
export function calcDiagramAspect(kind: string): number {
  switch (kind) {
    case "windTriangle":
      return 1;
    case "sixtyToOne":
      return 16 / 9;
    case "profile":
    case "vdp":
      return 2.2;
    case "holdWind":
      return 4 / 3;
    case "compass":
      return 2.6;
    case "cgEnvelope":
      return 1.15;
    default:
      return 4 / 3;
  }
}

/** Resolve a stage pane (StageCue.panes[i]). */
export function paneFrame(
  view: PaneView,
  cockpit: Cockpit = "g1000",
): PaneFrame {
  void cockpit;
  if (view.kind === "diagram")
    return {
      kind: "diagram",
      d: view.d,
      asset: view.asset,
      rect: UNIT_RECT,
      aspect: diagramAspect(view.d),
    };
  if ("asset" in view)
    return {
      kind: view.kind,
      asset: view.asset,
      rect: UNIT_RECT,
      aspect: view.kind === "still" ? 16 / 9 : 4 / 3,
    };
  const display: DisplayKind = view.kind;
  const rect = cropRect(view.crop);
  return {
    kind: "display",
    display,
    rect,
    table: DISPLAY_TABLE[display],
    cropped: !!view.crop,
  };
}

/** Resolve an instrument block's view (SlideBlock 'instrument'): full displays, crops and single gauges. */
export function instrumentFrame(
  view: InstrumentView,
  cockpit: Cockpit = "g1000",
): PaneFrame {
  if (view.kind !== "gauge") return paneFrame(view, cockpit);
  return gaugeFrame(view.gauge, cockpit);
}
export function gaugeFrame(
  g: InstrumentGauge,
  cockpit: Cockpit = "g1000",
): PaneFrame {
  if (isSteamGauge(g)) {
    const L = STEAM_GAUGE_LAYOUT[g];
    const display = L.panel;
    return {
      kind: "gauge",
      gauge: g,
      display,
      table: DISPLAY_TABLE[display],
      rect: gaugeRect(g),
      cx: L.cx,
      cy: L.cy,
      r: L.r,
    };
  }
  if (g === "radios") {
    const c = cockpit === "steam" ? RADIO_CROPS.steam : RADIO_CROPS.glass;
    return {
      kind: "display",
      display: c.display,
      rect: c.rect,
      table: DISPLAY_TABLE[c.display],
      cropped: true,
    };
  }
  if (g === "mfd.map")
    return {
      kind: "display",
      display: "mfd",
      rect: MFD_MAP_CROP,
      table: "G1000_MFD",
      cropped: true,
    };
  return {
    kind: "display",
    display: "pfd",
    rect: PFD_CROPS[g],
    table: "G1000_PFD",
    cropped: true,
  };
}

/** w / h of what a pane shows. */
export function frameAspect(f: PaneFrame): number {
  if (f.kind === "diagram" || f.kind === "still" || f.kind === "image")
    return f.aspect;
  return f.rect[2] / f.rect[3];
}

// ------------------------------------------------------------------ mapping source ↔ pane CSS
/** Source logical point → fraction (0..1) of the pane box. */
export function toFrac(rect: Rect, p: Pt): Pt {
  return [(p[0] - rect[0]) / rect[2], (p[1] - rect[1]) / rect[3]];
}
/** Fraction of the pane box → source logical point. */
export function fromFrac(rect: Rect, f: Pt): Pt {
  return [rect[0] + f[0] * rect[2], rect[1] + f[1] * rect[3]];
}
/** A CSS-pixel point inside a pane box of size (w, h) → source logical point (hit tests). */
export function cssToSource(
  rect: Rect,
  boxW: number,
  boxH: number,
  x: number,
  y: number,
): Pt {
  return fromFrac(rect, [boxW > 0 ? x / boxW : 0, boxH > 0 ? y / boxH : 0]);
}

/** Largest box of aspect `aspect` (w / h) that fits (W, H): the pane keeps its drawing's proportions. */
export function containBox(
  W: number,
  H: number,
  aspect: number,
): { w: number; h: number; x: number; y: number } {
  if (!(W > 0) || !(H > 0) || !(aspect > 0)) return { w: 0, h: 0, x: 0, y: 0 };
  let w = W;
  let h = W / aspect;
  if (h > H) {
    h = H;
    w = H * aspect;
  }
  return { w, h, x: (W - w) / 2, y: (H - h) / 2 };
}

/** Does rect a intersect rect b (both [x, y, w, h])? */
export function intersects(a: Rect, b: Rect): boolean {
  return (
    a[0] < b[0] + b[2] &&
    b[0] < a[0] + a[2] &&
    a[1] < b[1] + b[3] &&
    b[1] < a[1] + a[3]
  );
}
export function rectContains(r: Rect, p: Pt, pad = 0): boolean {
  return (
    p[0] >= r[0] - pad &&
    p[0] <= r[0] + r[2] + pad &&
    p[1] >= r[1] - pad &&
    p[1] <= r[1] + r[3] + pad
  );
}

// ------------------------------------------------------------------ annotations
/** What decides whether an annotation shows. */
export interface RevealState {
  /** reveal position of the step (0 = nothing revealed yet) */
  reveal: number;
  /** goal check i met (sticky) */
  checks?: readonly boolean[];
  /** the step's "reveal" moment happened (quiz answered, presenter reveal, predict committed) */
  revealed?: boolean;
}
export function annotationVisible(a: Annotation, s: RevealState): boolean {
  const w = a.when ?? "always";
  if (w === "always") return true;
  if (w === "onReveal") return !!s.revealed;
  if (typeof w === "object") return s.reveal >= w.step;
  const m = /^afterCheck:(\d+)$/.exec(w);
  if (m) return !!s.checks?.[Number(m[1])];
  return true;
}

/** An annotation with its anchor resolved (an explain region id): ring → the region, callout → its corner… */
export type ResolvedAnnotation = Annotation & { resolved: true };
export function resolveAnchor(a: Annotation): Annotation {
  if (!a.anchor) return a;
  const reg = explainRegion(a.anchor);
  if (!reg) return a;
  const [x, y, w, h] = reg.rect;
  switch (a.type) {
    case "ring": {
      const k = 0.04;
      return {
        ...a,
        rect: [x + w * k, y + h * k, w * (1 - 2 * k), h * (1 - 2 * k)],
      };
    }
    case "callout":
      return { ...a, at: [x + w * 0.88, y + h * 0.12] };
    case "tag":
      return { ...a, at: [x + w / 2, y + h * 0.96] };
    case "arrow":
      return { ...a, to: [x + w / 2, y + h / 2] };
    case "spotlight":
      return { ...a, holes: [{ rect: [x, y, w, h] }] };
  }
}

/** The bounding box of an annotation (source coordinates): what a crop must contain to show it. */
export function annotationBox(a: Annotation): Rect {
  switch (a.type) {
    case "ring":
      return a.rect;
    case "callout":
      return a.box ?? [a.at[0] - 14, a.at[1] - 14, 28, 28];
    case "tag":
      return [a.at[0] - 40, a.at[1] - 12, 80, 24];
    case "arrow": {
      const x = Math.min(a.from[0], a.to[0]);
      const y = Math.min(a.from[1], a.to[1]);
      return [
        x,
        y,
        Math.abs(a.to[0] - a.from[0]),
        Math.abs(a.to[1] - a.from[1]),
      ];
    }
    case "spotlight":
      return FULL_RECT;
  }
}

/** SVG path of a spotlight: the whole rect minus its holes (even-odd fill). */
export function spotlightPath(
  rect: Rect,
  holes: ({ rect: Rect } | { circle: [number, number, number] })[],
): string {
  const [x, y, w, h] = rect;
  const f = (n: number) => String(Math.round(n * 100) / 100);
  let d = `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`;
  for (const hole of holes) {
    if ("rect" in hole) {
      const [hx, hy, hw, hh] = hole.rect;
      const r = Math.min(hw, hh) * 0.08;
      d += `M${f(hx + r)} ${f(hy)}H${f(hx + hw - r)}A${f(r)} ${f(r)} 0 0 1 ${f(hx + hw)} ${f(hy + r)}V${f(hy + hh - r)}A${f(r)} ${f(r)} 0 0 1 ${f(hx + hw - r)} ${f(hy + hh)}H${f(hx + r)}A${f(r)} ${f(r)} 0 0 1 ${f(hx)} ${f(hy + hh - r)}V${f(hy + r)}A${f(r)} ${f(r)} 0 0 1 ${f(hx + r)} ${f(hy)}Z`;
    } else {
      const [cx, cy, r] = hole.circle;
      d += `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z`;
    }
  }
  return d;
}

/** Where a partial-panel cover goes on a pane (source coordinates), or null when that instrument is not shown. */
export function coverRect(frame: PaneFrame, which: "ai" | "dg"): Rect | null {
  let rect: Rect | null = null;
  if (frame.kind === "gauge") {
    if (
      (which === "ai" && frame.gauge === "ai") ||
      (which === "dg" && frame.gauge === "hsi")
    )
      rect = frame.rect;
    return rect;
  }
  if (frame.kind !== "display") return null;
  if (frame.display === "six")
    rect = which === "ai" ? [376, 100, 272, 272] : [376, 442, 272, 272];
  else if (frame.display === "pfd")
    rect = which === "ai" ? [262, 112, 480, 316] : [368, 448, 294, 290];
  else if (frame.display === "airlinerPfd")
    rect = which === "ai" ? [268, 150, 412, 440] : null;
  if (!rect || !intersects(rect, frame.rect)) return null;
  return rect;
}
