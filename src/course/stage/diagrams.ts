// Ground school stage — diagram panes and the calc diagram dispatcher.
//  - createCalcDiagram(): the interactive SVG widgets the calc steps need (wind triangle, 60:1, descent profile,
//    VDP, hold in wind, TVMDC strip, C172S CG envelope), dark-cockpit or light theme, touch-draggable.
//  - diagramPane(): what a stage `diagram` pane shows (hold with entry sectors, route profile, calc diagram, or the
//    pre-rendered asset for plates / airport diagrams / maps).
import type { CalcDiagram, DiagramSpec, Lang } from "../types";
import { holdDiagramSvg } from "../../train/diagram";
import { createWindTriangle, createHoldWind } from "./diagramWind";
import { createSixtyToOne, createTvmdc } from "./diagramNav";
import { createProfile, createVdp } from "./diagramProfile";
import { createCgEnvelope } from "./diagramCg";
import type { DiagramOptions, DiagramTheme, DiagramWidget } from "./svgkit";

export type { DiagramOptions, DiagramTheme, DiagramWidget } from "./svgkit";
export {
  createWindTriangle,
  createHoldWind,
  createSixtyToOne,
  createTvmdc,
  createProfile,
  createVdp,
  createCgEnvelope,
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
    default:
      return null;
  }
}

export interface DiagramPaneOptions {
  theme?: DiagramTheme;
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
  if (d.kind === "calc") {
    widget = createCalcDiagram(d.calc, {
      theme: o.theme,
      lang,
      drag: o.interactive ? d.calc.drag : [],
      onChange: o.onChange,
      label: o.label,
    });
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
    // the PANS-OPS / AIM figure: black on white like the official one, in both themes
    wrap.classList.add("cs-paper");
    wrap.innerHTML = holdDiagramSvg(d.inbound, d.turn, d.fix, d.crs, lang);
    const svg = wrap.querySelector("svg");
    if (svg) {
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.setAttribute("role", "img");
      svg.setAttribute(
        "aria-label",
        o.label ??
          (lang === "fr"
            ? `Attente à ${d.fix}, rapprochement ${d.inbound}°, virages à ${d.turn === "R" ? "droite" : "gauche"}`
            : `Hold at ${d.fix}, inbound ${d.inbound}°, ${d.turn === "R" ? "right" : "left"} turns`),
      );
    }
  } else if (d.kind === "profile" || d.kind === "routeMap") {
    if (asset) showAsset(asset, o.label ?? "");
    else {
      wrap.classList.add("cs-paper");
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
          960,
          400,
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
  return {
    el: wrap,
    widget,
    setTheme(t) {
      widget?.setTheme(t);
    },
    destroy() {
      widget?.destroy();
      wrap.remove();
    },
  };
}
