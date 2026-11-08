// Ground school builder — starter decks for the LAPL / PPL theory (weight and balance, airspace): the same design
// system archetypes as the IFR decks (cover, a diagram with three points, a question, the takeaways), written as
// whole slides here because the engine's archetypes carry holding content. Pure data: the slides are built from
// the layout primitives (T, SHAPE) and the calc / airspace diagrams the renderer already draws.
import type {
  DiagramSpec,
  L10n,
  SlideBlock,
  SlideCanvas,
  ThemeId,
} from "../types";
import { G, L, SHAPE, T } from "../canvas/layouts";

let seq = 0;
const nid = (p: string) => `vfr-${p}${++seq}`;

function canvas(blocks: SlideBlock[], theme?: ThemeId): SlideCanvas {
  return {
    size: { w: 1920, h: 1080 },
    grid: 8,
    layout: "blank",
    ...(theme ? { theme } : {}),
    blocks,
  };
}
const header = (eyebrow: L10n, title: L10n): SlideBlock[] => [
  T("eyebrow", eyebrow, G.left, G.eyebrowY, 1392, 32),
  T("title", title, G.left, G.titleY, 1392, 152),
];
const foot = (t: L10n): SlideBlock => T("foot", t, G.left, G.foot, 1200, 32);
const rule = (
  x: number,
  y: number,
  w: number,
  e: { reveal?: number; group?: string } = {},
): SlideBlock =>
  SHAPE("line", x, y - 8, w, 16, {
    stroke: "line",
    strokeW: 2,
    ...(e.reveal ? { reveal: { order: e.reveal } } : {}),
    ...(e.group ? { group: e.group } : {}),
  });
const diagram = (
  d: DiagramSpec,
  alt: L10n,
  x: number,
  y: number,
  w: number,
  h: number,
): SlideBlock => ({
  id: nid("d"),
  frame: { x, y, w, h, z: 1 },
  alt,
  kind: "diagram",
  d,
});

/** A diagram on the left, three points revealed one by one on the right (the A4 archetype). */
function explain(
  eyebrow: L10n,
  title: L10n,
  d: DiagramSpec,
  alt: L10n,
  pts: [L10n, L10n][],
  source: L10n,
  theme?: ThemeId,
): SlideCanvas {
  const cols = ["sel", "key", "nav"] as const;
  return canvas(
    [
      ...header(eyebrow, title),
      diagram(d, alt, G.left, 288, 960, 696),
      ...pts.flatMap(([hd, body], i): SlideBlock[] => {
        const y = 336 + i * 216;
        const g = `pt${i + 1}`;
        return [
          rule(1128, y, 672, { reveal: i + 1, group: g }),
          T("heading", hd, 1128, y + 24, 672, 56, {
            color: cols[i],
            reveal: i + 1,
            group: g,
          }),
          T("body", body, 1128, y + 88, 672, 104, { reveal: i + 1, group: g }),
        ];
      }),
      foot(source),
    ],
    theme,
  );
}
/** A question on the slide (the A9 archetype). */
function question(
  eyebrow: L10n,
  title: L10n,
  context: L10n,
  prompt: L10n,
  options: L10n[],
  answer: number,
  why: L10n,
  source: L10n,
  theme?: ThemeId,
): SlideCanvas {
  return canvas(
    [
      ...header(eyebrow, title),
      T("quote", context, G.left, 312, 1560, 144),
      {
        id: nid("q"),
        frame: { x: G.left, y: 504, w: 1680, h: 480, z: 2 },
        kind: "quiz",
        quiz: {
          kind: "mcq",
          prompt,
          options: options.map((text) => ({ text })),
          answer,
          explain: why,
        },
      },
      foot(source),
    ],
    theme,
  );
}
/** Three numbers and three checks (the A10 archetype). */
function recap(
  eyebrow: L10n,
  title: L10n,
  nums: [string, L10n][],
  checks: L10n[],
  source: L10n,
  theme?: ThemeId,
): SlideCanvas {
  return canvas(
    [
      ...header(eyebrow, title),
      ...nums.flatMap(([n, t], i): SlideBlock[] => [
        T("number", L(n, n), G.x(i * 4), 320, 528, 176),
        rule(G.x(i * 4), 536, 528),
        T("body", t, G.x(i * 4), 560, 528, 104),
      ]),
      T(
        "eyebrow",
        L("Before every flight", "Avant chaque vol"),
        G.left,
        760,
        1680,
        32,
        { color: "muted" },
      ),
      ...checks.map(
        (text, i): SlideBlock => ({
          id: nid("k"),
          frame: { x: G.x(i * 4), y: 808, w: 528, h: 152, z: 1 },
          kind: "checklist",
          title: L("", ""),
          rows: [{ text }],
        }),
      ),
      foot(source),
    ],
    theme,
  );
}

// ---------------------------------------------------------------- weight and balance (LAPL / PPL)
export const CG_DIAGRAM: DiagramSpec = {
  kind: "calc",
  calc: {
    kind: "cgEnvelope",
    table: "c172s",
    points: [
      {
        weightLb: 2350,
        momentLbIn: 2350 * 41.5,
        label: L("Take-off", "Décollage"),
      },
      {
        weightLb: 2190,
        momentLbIn: 2190 * 41.2,
        label: L("Landing", "Atterrissage"),
      },
    ],
  },
};
const POH = L(
  "POH section 6 · weight and balance",
  "Manuel de vol (POH) · section 6, masse et centrage",
);
const EB_CG = L(
  "Ground school · Weight and balance",
  "Théorie · Masse et centrage",
);
export const WB_SLIDES: ((theme?: ThemeId) => SlideCanvas)[] = [
  (theme) =>
    explain(
      EB_CG,
      L("Three numbers, one point", "Trois chiffres, un point"),
      CG_DIAGRAM,
      L(
        "The C172S CG envelope, take-off and landing points",
        "L’enveloppe de centrage du C172S, points au décollage et à l’atterrissage",
      ),
      [
        [
          L("1 · Weight", "1 · Masse"),
          L(
            "Empty weight + people + fuel + baggage: below the maximum weight.",
            "Masse à vide + occupants + carburant + bagages : sous la masse maximale.",
          ),
        ],
        [
          L("2 · Moment", "2 · Moment"),
          L(
            "For each load, weight × arm. The total gives the centre of gravity.",
            "Pour chaque charge, masse × bras de levier. Le total donne le centre de gravité.",
          ),
        ],
        [
          L("3 · Envelope", "3 · Enveloppe"),
          L(
            "The point stays inside the envelope, at take-off and at landing.",
            "Le point reste dans l’enveloppe, au décollage et à l’atterrissage.",
          ),
        ],
      ],
      POH,
      theme,
    ),
  (theme) =>
    question(
      EB_CG,
      L("Out of the envelope", "Hors de l’enveloppe"),
      L(
        "Two people, full fuel and 40 kg of baggage: the point falls just behind the aft limit.",
        "Deux occupants, le plein et 40 kg de bagages : le point tombe juste derrière la limite arrière.",
      ),
      L("What do you do?", "Que faites-vous ?"),
      [
        L(
          "Move baggage forward or take less",
          "Avancer ou réduire les bagages",
        ),
        L("Add fuel to balance it", "Ajouter du carburant pour équilibrer"),
        L(
          "Take off: it is only just out",
          "Décoller : ça ne dépasse qu’un peu",
        ),
      ],
      0,
      L(
        "An aft CG makes the aircraft less stable and can make a stall unrecoverable: bring the point back inside before flight.",
        "Un centrage arrière rend l’avion moins stable et peut rendre un décrochage irrécupérable : ramenez le point dans l’enveloppe avant le vol.",
      ),
      POH,
      theme,
    ),
  (theme) =>
    recap(
      EB_CG,
      L("Before you load the aircraft", "Avant de charger l’avion"),
      [
        [
          "2",
          L(
            "points to check: take-off and landing",
            "points à vérifier : décollage et atterrissage",
          ),
        ],
        [
          "×",
          L(
            "weight × arm = moment, for every load",
            "masse × bras = moment, pour chaque charge",
          ),
        ],
        [
          "0",
          L("tolerance outside the envelope", "tolérance hors de l’enveloppe"),
        ],
      ],
      [
        L(
          "Weigh the people and the baggage",
          "Pesez les occupants et les bagages",
        ),
        L(
          "Fuel at take-off and at landing",
          "Carburant au décollage et à l’atterrissage",
        ),
        L(
          "Both points inside the envelope",
          "Les deux points dans l’enveloppe",
        ),
      ],
      POH,
      theme,
    ),
];

// ---------------------------------------------------------------- airspace (LAPL / PPL)
export const AIRSPACE_DIAGRAM: DiagramSpec = {
  kind: "airspace",
  sketch: {
    widthNm: 40,
    topFt: 9000,
    layers: [
      { cls: "G", floorFt: 0, ceilFt: 1000, span: [-20, 20] },
      { cls: "E", floorFt: 1000, ceilFt: 9000, span: [-20, 20] },
      {
        cls: "D",
        floorFt: 1500,
        ceilFt: 6500,
        span: [-15, 15],
        label: L("TMA", "TMA"),
      },
      {
        cls: "CTR",
        floorFt: 0,
        ceilFt: 1500,
        span: [-6, 6],
        label: L("Control zone (class D)", "Zone de contrôle (classe D)"),
      },
    ],
    aircraft: { altFt: 2500, distNm: -13 },
  },
};
const SERA = L("SERA.6001 · VFR chart", "SERA.6001 · carte VFR");
const EB_AS = L("Ground school · Airspace", "Théorie · Espaces aériens");
export const AIRSPACE_SLIDES: ((theme?: ThemeId) => SlideCanvas)[] = [
  (theme) =>
    explain(
      EB_AS,
      L("Read the cross-section", "Lire la coupe"),
      AIRSPACE_DIAGRAM,
      L(
        "A control zone under a TMA, in class E and G airspace",
        "Une zone de contrôle sous une TMA, dans les espaces E et G",
      ),
      [
        [
          L("1 · Class G", "1 · Classe G"),
          L(
            "Uncontrolled, near the ground: no clearance, keep clear of cloud.",
            "Non contrôlé, près du sol : pas de clairance, restez hors des nuages.",
          ),
        ],
        [
          L("2 · Class E", "2 · Classe E"),
          L(
            "Controlled for IFR; in VFR no clearance, but the VMC minima apply.",
            "Contrôlé pour l’IFR ; en VFR pas de clairance, mais les minima VMC s’appliquent.",
          ),
        ],
        [
          L("3 · CTR and TMA (D)", "3 · CTR et TMA (D)"),
          L(
            "A clearance before entering, two-way radio, and the controller’s instructions.",
            "Une clairance avant d’entrer, le contact radio, et les instructions du contrôleur.",
          ),
        ],
      ],
      SERA,
      theme,
    ),
  (theme) =>
    question(
      EB_AS,
      L("Can you climb?", "Pouvez-vous monter ?"),
      L(
        "You fly VFR at 2,500 ft, 13 NM from the field, under the TMA whose floor is 1,500 ft.",
        "Vous volez en VFR à 2 500 ft, à 13 NM du terrain, sous une TMA dont le plancher est à 1 500 ft.",
      ),
      L("So you are…", "Vous êtes donc…"),
      [
        L(
          "Inside the TMA: you need a clearance",
          "Dans la TMA : il faut une clairance",
        ),
        L("In class G: no clearance", "En classe G : pas de clairance"),
        L("In the control zone", "Dans la zone de contrôle"),
      ],
      0,
      L(
        "2,500 ft is above the 1,500 ft floor of the TMA: you are already inside it, so you needed a clearance.",
        "2 500 ft est au-dessus du plancher de la TMA à 1 500 ft : vous y êtes déjà, il fallait une clairance.",
      ),
      SERA,
      theme,
    ),
  (theme) =>
    recap(
      EB_AS,
      L("Before you plan the route", "Avant de préparer la navigation"),
      [
        ["G", L("uncontrolled, near the ground", "non contrôlé, près du sol")],
        [
          "E",
          L(
            "no clearance in VFR, VMC minima",
            "pas de clairance en VFR, minima VMC",
          ),
        ],
        ["D", L("clearance and radio contact", "clairance et contact radio")],
      ],
      [
        L(
          "Floors and ceilings along the route",
          "Planchers et plafonds sur la route",
        ),
        L("Frequencies of each zone", "Fréquences de chaque zone"),
        L(
          "An exit if the clearance is refused",
          "Une sortie si la clairance est refusée",
        ),
      ],
      SERA,
      theme,
    ),
];
