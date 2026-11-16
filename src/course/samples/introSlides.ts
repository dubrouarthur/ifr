// The slides of the start page (ui/intro.ts): real course slides, drawn live by the slide renderer
// (canvas/render.ts), never screenshots.
//   hero    one slide made for the page: the G1000 PFD flying on its autopilot in HDG, with the heading knob in its
//           control strip; the aircraft turns towards the bug by itself, and follows it when the visitor turns the
//           knob (FAA Advanced Avionics Handbook ch. 4). With reduced motion the bug starts on the heading: nothing
//           moves until the visitor turns the knob.
//   beats   one slide per step of the page's « Créez · Partagez · Faites voler »: a needle that moves by itself
//           (the gallery's airspeed arcs), the circuit template's cover (the runway ahead, the needles moving), and
//           the circuit template's « À vous » with its control strip (the student lowers the nose on the slide).
// Every slide and situation comes from the ready slides and templates the studio offers, so the page shows what an
// instructor gets, word for word.
import type { L10n, SimScene, SlideBlock, SlideCanvas } from "../types";
import { G, INST, L, MARK, SHAPE, T } from "../canvas/layouts";
import { scene as fieldsScene } from "./kit";
import { gallerySlide, galleryScenes } from "./exampleSlides";
import { PPL_CIRCUIT, showcaseScenes } from "./showcaseDecks";

export const INTRO_HERO_SCENE = "intro.hdg";
/** where the hero's aircraft starts, and the heading its bug asks for (the turn the page opens on) */
export const INTRO_HERO = { hdg: 75, bug: 120, altFt: 3000 } as const;

/** The hero's situation: a G1000 C172 at 3,000 ft, 110 kt, autopilot in HDG and ALT. */
export function introHeroScene(reduced = false): SimScene {
  const s = fieldsScene(
    INTRO_HERO_SCENE,
    {
      pos: { fix: "ARD", radial: 240, distNm: 12 },
      altFt: INTRO_HERO.altFt,
      hdg: INTRO_HERO.hdg,
      iasKt: 110,
      radios: { baro: 29.92 },
    },
    {
      label: "3,000 ft · 110 kt · autopilot HDG and ALT",
      cockpit: "g1000",
    },
  );
  s.ap = {
    engaged: true,
    fd: true,
    lat: "HDG",
    vert: "ALT",
    hdg: reduced ? INTRO_HERO.hdg : INTRO_HERO.bug,
    alt: INTRO_HERO.altFt,
  };
  return s;
}

const rule = (x: number, y: number, w: number): SlideBlock =>
  SHAPE("line", x, y - 8, w, 16, { stroke: "line", strokeW: 2 });

/** The hero slide: three numbered lines on the left, the live PFD and its heading knob on the right. */
export function introHeroSlide(): SlideCanvas {
  const rows: L10n[] = [
    L(
      "Turn the heading knob: the bug moves.",
      "Tournez le bouton de cap : le repère bouge.",
    ),
    L(
      "The autopilot banks towards the bug.",
      "Le pilote automatique incline l’avion vers le repère.",
    ),
    L(
      "The wings roll level on the heading.",
      "Les ailes reviennent à plat sur le cap.",
    ),
  ];
  const x = G.left;
  const w = 696;
  return {
    size: { w: 1920, h: 1080 },
    grid: 8,
    layout: "instrumentNotes",
    scene: INTRO_HERO_SCENE,
    blocks: [
      T(
        "eyebrow",
        L("Navigation · LAPL / PPL", "Navigation · LAPL / PPL"),
        x,
        G.eyebrowY,
        w,
        32,
      ),
      T(
        "title",
        L("Turning to a heading", "Virer vers un cap"),
        x,
        G.titleY,
        w,
        176,
      ),
      ...rows.flatMap((r, i): SlideBlock[] => {
        const y = 392 + i * 176;
        return [
          rule(x, y, w),
          MARK(i + 1, x + 36, y + 72, { size: 72 }),
          T("lead", r, x + 104, y + 28, w - 104, 120),
        ];
      }),
      T(
        "foot",
        L(
          "FAA Advanced Avionics Handbook ch. 4",
          "FAA Advanced Avionics Handbook ch. 4",
        ),
        x,
        G.foot,
        w,
        32,
      ),
      INST(
        { kind: "pfd" },
        L(
          "Live G1000 PFD: autopilot in HDG, the aircraft turns towards the heading bug",
          "PFD G1000 en direct : pilote automatique en HDG, l’avion vire vers le repère de cap",
        ),
        888,
        96,
        912,
        888,
        {
          id: "intro-hero.pfd",
          scene: INTRO_HERO_SCENE,
          mode: "live",
          controls: ["hdgBug"],
        },
      ),
    ],
  };
}

/** A ready slide with its « À vous » taken off: on the start page the strip itself is the hands-on part (the
 *  player's « À vous » needs a course around it). */
function withoutYourTurn(s: SlideCanvas): SlideCanvas {
  return {
    ...s,
    blocks: s.blocks.map((b) => {
      if (b.kind !== "instrument" || !b.yourTurn) return b;
      const { yourTurn: _drop, ...rest } = b;
      return rest as SlideBlock;
    }),
  };
}

export type IntroBeatId = "create" | "share" | "fly";
/** The three beats of the page, in reading order. */
export const INTRO_BEATS: readonly IntroBeatId[] = ["create", "share", "fly"];

/** The slide each beat plays. */
export function introBeatSlide(id: IntroBeatId): SlideCanvas {
  if (id === "create") {
    const g = gallerySlide("gx-asi-arcs");
    if (!g) throw new Error("gallery slide gx-asi-arcs");
    return g.slide;
  }
  // the circuit template (« Nouveau cours », LAPL / PPL): its cover, then its « À vous »
  const i = id === "share" ? 0 : PPL_CIRCUIT.shows.indexOf("yourTurn");
  const make = PPL_CIRCUIT.make?.[i];
  if (!make) throw new Error(`circuit slide ${i}`);
  const s = make("classroom");
  return id === "fly" ? withoutYourTurn(s) : s;
}

/** Every situation the page's slides name (the hero's, the gallery's and the templates'). */
export function introScenes(reduced = false): Record<string, SimScene> {
  return {
    ...galleryScenes(),
    ...showcaseScenes(),
    [INTRO_HERO_SCENE]: introHeroScene(reduced),
  };
}
