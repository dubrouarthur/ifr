// Ground school stage — diagram panes and the calc diagram dispatcher.
//  - createCalcDiagram(): the interactive SVG widgets the calc steps need (wind triangle, 60:1, descent profile,
//    VDP, hold in wind, TVMDC strip, C172S CG envelope), dark-cockpit or light theme, touch-draggable.
//  - diagramPane(): what a stage `diagram` pane shows (hold with entry sectors, route profile, calc diagram, or the
//    pre-rendered asset for plates / airport diagrams / maps).
import type { CalcDiagram, DiagramSpec, Lang } from "../types";
import { holdSlideSvg, type HoldColors } from "../../train/diagram";
import { createWindTriangle, createHoldWind } from "./diagramWind";
import { createSixtyToOne, createTvmdc } from "./diagramNav";
import { createProfile, createVdp } from "./diagramProfile";
import { createCgEnvelope } from "./diagramCg";
import { createTurn } from "./diagramTurn";
import { PALETTES, type DiagramOptions, type DiagramPalette, type DiagramTheme, type DiagramWidget } from "./svgkit";

export type { DiagramOptions, DiagramPalette, DiagramTheme, DiagramWidget } from "./svgkit";
export { PALETTES, paletteFromColors } from "./svgkit";

/** The type unit of a pane measured in CSS px: a secondary label (24 u) stays ≥ 13 CSS px. */
export const PANE_U = 0.56;
/** The hold's colours from a diagram palette. */
export const holdColorsOf = (p: DiagramPalette): HoldColors => ({
  bg: p.bg,
  ink: p.text,
  ink2: p.ink2,
  mute: p.muted,
  ruleStrong: p.line,
  accent: p.accent,
  sel: p.heading,
  key: p.wind,
  nav: p.nav,
});
export {
  createWindTriangle,
  createHoldWind,
  createSixtyToOne,
  createTvmdc,
  createProfile,
  createVdp,
  createCgEnvelope,
  createTurn,
};

export {
  STAGE_CALC_DIAGRAMS,
  hasCalcDiagram,
  type StageCalcDiagramKind,
} from "./calcKinds";

/** The interactive widget for a calc diagram, or null when another package draws that kind. */
export function createCalcDiagram(
  d: CalcDiagram,
  o: DiagramOptions = {},
): DiagramWidget<CalcDiagram> | null {
  const opts: DiagramOptions = { ...o, drag: o.drag ?? d.drag };
  switch (d.kind) {
    case "windTriangle":
      return createWindTriangle(d, opts) as DiagramWidget<CalcDiagram>;
    case "sixtyToOne":
      return createSixtyToOne(d, opts) as DiagramWidget<CalcDiagram>;
    case "profile":
      return createProfile(d, opts) as DiagramWidget<CalcDiagram>;
    case "vdp":
      return createVdp(d, opts) as DiagramWidget<CalcDiagram>;
    case "holdWind":
      return createHoldWind(d, opts) as DiagramWidget<CalcDiagram>;
    case "compass":
      return createTvmdc(d, opts) as DiagramWidget<CalcDiagram>;
    case "cgEnvelope":
      return createCgEnvelope(d, opts) as DiagramWidget<CalcDiagram>;
    case "turn":
      return createTurn(d, opts) as DiagramWidget<CalcDiagram>;
    default:
      return null;
  }
}

export interface DiagramPaneOptions {
  theme?: DiagramTheme;
  /** the slide theme's palette (wins over `theme`) */
  palette?: DiagramPalette;
  /** a fixed drawing size in units (a slide block: its logical size, u = 1). Without it the pane measures its
   *  box in CSS px and redraws at that size with u = PANE_U */
  w?: number;
  h?: number;
  u?: number;
  /** no background (the slide shows through) */
  transparent?: boolean;
  /** worked numbers inside the drawing (default: true in a pane, false on a slide) */
  card?: boolean;
  lang?: Lang;
  /** the student may drag the calc diagram */
  interactive?: boolean;
  onChange?: (spec: unknown) => void;
  /** asset id → object URL (store.ts); used for plates, airport diagrams, maps and any pre-rendered asset */
  assetUrl?: (id: string) => Promise<string | null> | string | null;
  label?: string;
}
export interface DiagramPane {
  el: HTMLElement;
  widget: DiagramWidget<CalcDiagram> | null;
  setTheme(t: DiagramTheme): void;
  destroy(): void;
}

const placeholder = (text: string): HTMLElement => {
  const el = document.createElement("div");
  el.className = "cs-ph";
  el.textContent = text;
  return el;
};

/** The content of a stage `diagram` pane (fills its box). */
export function diagramPane(
  d: DiagramSpec,
  asset: string | undefined,
  o: DiagramPaneOptions = {},
): DiagramPane {
  const lang = o.lang ?? "en";
  const wrap = document.createElement("div");
  wrap.className = `cs-dpane cs-d-${d.kind}`;
  let widget: DiagramWidget<CalcDiagram> | null = null;
  const showAsset = (id: string, alt: string) => {
    const img = document.createElement("img");
    img.alt = alt;
    img.decoding = "async";
    img.draggable = false;
    wrap.append(img);
    Promise.resolve(o.assetUrl?.(id) ?? null).then((url) => {
      if (url) img.src = url;
      else {
        img.remove();
        wrap.append(
          placeholder(
            lang === "fr"
              ? "Image non disponible sur cet appareil"
              : "Image not available on this device",
          ),
        );
      }
    });
  };
  const fixed = o.w !== undefined && o.h !== undefined;
  const pal = (): DiagramPalette => o.palette ?? PALETTES[theme];
  let theme: DiagramTheme = o.theme ?? "dark";
  let size = { w: o.w ?? 960, h: o.h ?? 540, u: o.u ?? (fixed ? 1 : PANE_U) };
  let redraw: (() => void) | null = null;
  if (d.kind === "calc") {
    widget = createCalcDiagram(d.calc, {
      theme: o.theme,
      palette: o.palette,
      lang,
      drag: o.interactive ? d.calc.drag : [],
      onChange: o.onChange,
      label: o.label,
      w: size.w,
      h: size.h,
      u: size.u,
      transparent: o.transparent,
      card: o.card ?? !fixed,
    });
    if (widget) redraw = () => widget!.resize?.(size.w, size.h, size.u);
    if (widget) wrap.append(widget.el);
    else if (asset) showAsset(asset, o.label ?? "");
    else
      wrap.append(
        placeholder(
          lang === "fr"
            ? "Schéma non disponible ici"
            : "Diagram not available here",
        ),
      );
  } else if (d.kind === "hold") {
    // the AIM figure in the slide's (or the pane's) colours, sectors tinted: never a white card on a dark slide
    redraw = () => {
      // our own SVG string: the fix ident is escaped inside holdSlideSvg
      wrap.innerHTML = holdSlideSvg(d.inbound, d.turn, d.fix, {
        w: size.w,
        h: size.h,
        u: size.u,
        lang,
        colors: holdColorsOf(pal()),
        quiet: d.quiet,
        courseToFix: d.crs,
      });
      const svg = wrap.querySelector("svg");
      if (svg) {
        svg.setAttribute("role", "img");
        svg.setAttribute(
          "aria-label",
          o.label ??
            (lang === "fr"
              ? `Attente à ${d.fix}, rapprochement ${d.inbound}°, virages à ${d.turn === "R" ? "droite" : "gauche"}`
              : `Hold at ${d.fix}, inbound ${d.inbound}°, ${d.turn === "R" ? "right" : "left"} turns`),
        );
      }
    };
    redraw();
  } else if (d.kind === "profile" || d.kind === "routeMap") {
    if (asset) showAsset(asset, o.label ?? "");
    else {
      // the route profile renderer lives with the route map (large module): loaded on demand
      void import("../../ui/routeMap").then((m) => {
        if (d.kind !== "profile") {
          wrap.append(
            placeholder(
              lang === "fr"
                ? "Carte de la route : pré-rendu requis"
                : "Route map: pre-render required",
            ),
          );
          return;
        }
        wrap.innerHTML = m.profileSvg(
          m.planProfile(d.circuit, false),
          Math.round(size.w),
          Math.round(size.h),
        );
        const svg = wrap.querySelector("svg");
        if (svg) {
          svg.setAttribute("width", "100%");
          svg.setAttribute("height", "100%");
          svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        }
      });
    }
  } else if (asset) showAsset(asset, o.label ?? "");
  else {
    const what: Record<string, [string, string]> = {
      plate: [
        "Approach plate: pre-render it in the editor",
        "Carte d'approche : pré-rendu dans l'éditeur",
      ],
      airportDiagram: [
        "Airport diagram: pre-render it in the editor",
        "Plan d'aérodrome : pré-rendu dans l'éditeur",
      ],
      map: [
        "Map: pre-render it in the editor",
        "Carte : pré-rendu dans l'éditeur",
      ],
      airspace: ["Airspace sketch", "Coupe d'espace aérien"],
    };
    const t = what[d.kind] ?? [d.kind, d.kind];
    wrap.append(placeholder(lang === "fr" ? t[1] : t[0]));
  }
  // a pane draws at its measured size (1 unit = 1 CSS px, labels × PANE_U)
  let ro: ResizeObserver | null = null;
  if (!fixed && redraw && typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      if (!(r.width > 40 && r.height > 40)) return;
      if (Math.abs(r.width - size.w) < 2 && Math.abs(r.height - size.h) < 2) return;
      size = { w: Math.round(r.width), h: Math.round(r.height), u: size.u };
      redraw?.();
    });
    ro.observe(wrap);
  }
  return {
    el: wrap,
    widget,
    setTheme(t) {
      theme = t;
      if (widget) widget.setTheme(t);
      else redraw?.();
    },
    destroy() {
      ro?.disconnect();
      widget?.destroy();
      wrap.remove();
    },
  };
}
