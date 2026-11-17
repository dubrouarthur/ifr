// The gallery's « Outils pédagogiques »: one ready slide per teaching tool (course/tools), so a creator finds each
// tool in « Modèles » already composed: the subject, the title, the live tool with its controls on the slide (and its
// task when it has one), the sources in small type. The tool's own presenter note goes to the presenter's console.
import type { L10n, SlideBlock, SlideCanvas, ToolId } from "../types";
import { DEFAULT_GRID } from "../canvas/geom";
import { G, L, T } from "../canvas/layouts";
import { TOOLS, toolTaskData } from "../tools/index";

/** the sources each tool slide cites (the tool's maths module holds the details) */
const SOURCES: Record<ToolId, L10n> = {
  wing: L(
    "Sources · FAA PHAK ch. 4–5 · flight manual of the training aeroplane (stall speeds) · NACA 2412 section",
    "Sources · FAA PHAK ch. 4–5 · manuel de vol de l’avion-école (vitesses de décrochage) · profil NACA 2412",
  ),
  loadFactor: L(
    "Sources · FAA PHAK ch. 5, AFH ch. 3 · flight manual of the training aeroplane (limits, VA, VNE)",
    "Sources · FAA PHAK ch. 5, AFH ch. 3 · manuel de vol de l’avion-école (limites, VA, VNE)",
  ),
  massBalance: L(
    "Source · flight manual of the training aeroplane, section 6 · a sample: always use your aeroplane’s weighing report",
    "Source · manuel de vol de l’avion-école, section 6 · un exemple : utilisez toujours la pesée de votre avion",
  ),
  takeoff: L(
    "Sources · UK CAA Safety Sense 7 (factors) · FAA PHAK ch. 4 (density altitude) · your flight manual’s figures",
    "Sources · UK CAA Safety Sense 7 (facteurs) · FAA PHAK ch. 4 (altitude-densité) · les chiffres de votre manuel de vol",
  ),
  fuel: L(
    "Source · EU Air Ops Part-NCO.OP.125: VFR reserve 30 min by day, 45 min by night",
    "Source · règlement européen Part-NCO.OP.125 : réserve VFR 30 min de jour, 45 min de nuit",
  ),
  carbIce: L(
    "Sources · FAA PHAK ch. 7, carburetor icing · UK CAA Safety Sense 14, piston engine icing (power)",
    "Sources · FAA PHAK ch. 7, givrage du carburateur · UK CAA Safety Sense 14, givrage moteur (puissance)",
  ),
  fronts: L(
    "Sources · Met Office, fronts · FAA Aviation Weather Handbook ch. 11 · orders of magnitude",
    "Sources · Met Office, les fronts · FAA Aviation Weather Handbook ch. 11 · ordres de grandeur",
  ),
  radioNav: L(
    "Source · FAA Instrument Flying Handbook ch. 9",
    "Source · FAA Instrument Flying Handbook ch. 9",
  ),
  prop: L(
    "Source · FAA PHAK ch. 7, the propeller · a teaching model (1.9 m, section at 75 % of the radius)",
    "Source · FAA PHAK ch. 7, l’hélice · un modèle pédagogique (1,9 m, section à 75 % du rayon)",
  ),
  mach: L(
    "Sources · ICAO standard atmosphere (Doc 7488) · simple sweep theory (overstates the gain)",
    "Sources · atmosphère type OACI (Doc 7488) · théorie simple de la flèche (surestime le gain)",
  ),
  pressurisation: L(
    "Sources · EASA CS 25.841 · FAA AC 61-107B (useful consciousness)",
    "Sources · EASA CS 25.841 · FAA AC 61-107B (conscience utile)",
  ),
};

export interface ToolSlide {
  id: string;
  tool: ToolId;
  title: L10n;
  what: L10n;
  slide: SlideCanvas;
}

/** One ready slide per tool, in the rail's order. */
export function toolSlides(): ToolSlide[] {
  return TOOLS.map((d): ToolSlide => {
    const id = `gx-tool-${d.id}`;
    const tool: SlideBlock = {
      id: `${id}.tool`,
      kind: "tool",
      tool: d.id,
      p: { ...d.defaults },
      ...(d.task ? { task: toolTaskData(d) } : {}),
      alt: L(d.title.en, d.title.fr ?? d.title.en),
      frame: { x: G.left, y: 248, w: 1680, h: 736, z: 1 },
    };
    return {
      id,
      tool: d.id,
      title: d.title,
      what: d.blurb,
      slide: {
        size: { w: 1920, h: 1080 },
        grid: DEFAULT_GRID,
        layout: "heroDiagram",
        blocks: [
          T(
            "eyebrow",
            L(`Tool · ${d.subject}`, `Outil · ${d.subject}`),
            G.left,
            G.eyebrowY,
            1200,
            32,
          ),
          T("title", d.title, G.left, G.titleY, 1680, 96),
          tool,
          T("foot", SOURCES[d.id], G.left, G.foot, 1400, 32),
        ],
      },
    };
  });
}
