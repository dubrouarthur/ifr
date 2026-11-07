// Ground school — course library (A1): ATPL 022 instrumentation, the parts the live airliner displays teach best:
// the speed of sound and the Mach number, CAS, TAS and Mach in the climb, the PFD and its flight mode annunciator,
// the navigation display and the wind, autopilot, flight director and autothrust, GPWS / TAWS and ACAS. A heading
// selection on the live PFD with the autopilot engaged, a drill and the coupled ILS flown in the cockpit.
// Sources: EASA ATPL(A) learning objectives, subject 022 "Instrumentation" (AMC/GM to Part-FCL: air data, Mach
// meter, EFIS, flight director, autopilot and autothrust, warning systems); ICAO Doc 7488 (standard atmosphere:
// a = 661.5 kt at 15 °C, −56.5 °C above 36,089 ft); ICAO Doc 8168 PANS-OPS Vol I (ACAS: never manoeuvre on a TA
// alone, follow the RA even against an ATC instruction); ICAO Doc 9863 (ACAS manual); FAA-H-8083-15B IFH ch. 5
// (EFIS, air data); FAA-H-8083-6 Advanced Avionics Handbook (automation, the FMA); 14 CFR 91.221, AC 120-55.
// The training stage flies the trainer's flight model under the airliner displays: it has no autothrust, so the
// FMA's thrust column stays blank in flight; live scenes fly at trainer speeds.
import type { Course, L10n, SimScene, SlideBlock, Step } from "../../types";
import {
  DIAGRAM,
  INST,
  L,
  MARK,
  T,
  course,
  onInstrument,
  slideStep,
  step,
} from "../kit";
import { G, foot, head, rule, slide } from "../navSlides";
import {
  S,
  coverStep,
  dec,
  flyStep,
  formulaStep,
  heroStep,
  mcq,
  quizStep,
  stepsStep,
  whyStep,
} from "../briefings/kit";
import {
  panelCompareStep,
  panelNotesStep,
  recapStep,
  sceneA1,
  turnStep,
} from "./kit-a1";

export const ATPL_022_INSTRUMENTS_ID = "sample-lib-atpl-022-instruments";

const PFD = { kind: "airlinerPfd" as const };
const ND = { kind: "nd" as const };
/** The flight mode annunciator: the top band of the PFD (logical 1024 × 768), with the CMD / FD status box. */
const FMA = {
  kind: "airlinerPfd" as const,
  crop: { rect: [174, 0, 600, 96] as [number, number, number, number] },
};
const EAST = { fix: "ARD", radial: 90, distNm: 40 };

function scenes(): Record<string, SimScene> {
  const ils = { nav1: "IPRD", obs1: 270, cdi: "NAV1" as const, baro: 29.92 };
  return {
    "at.cruise": sceneA1(
      "at.cruise",
      { pos: EAST, altFt: 35000, hdg: 90, iasKt: 250, radios: { baro: 29.92 } },
      {
        label: "FL350 · 250 kt CAS · autopilot in HDG SEL and ALT HOLD",
        cockpit: "airliner",
        ap: { engaged: true, lat: "HDG", vert: "ALT", hdg: 90, alt: 35000 },
      },
    ),
    "at.fl100": sceneA1(
      "at.fl100",
      { pos: EAST, altFt: 10000, hdg: 90, iasKt: 250, radios: { baro: 29.92 } },
      {
        label: "FL100 · 250 kt CAS",
        cockpit: "airliner",
        ap: { engaged: true, lat: "HDG", vert: "ALT", hdg: 90, alt: 10000 },
      },
    ),
    "at.ils": sceneA1(
      "at.ils",
      {
        pos: { runway: { icao: "PARD", id: "27" }, distNm: 13, offsetDeg: 10 },
        altFt: 3000,
        hdg: 240,
        iasKt: 140,
        radios: ils,
      },
      {
        label:
          "Vectors to the PARD ILS 27 · HDG SEL, ALT HOLD · LOC and G/S armed",
        cockpit: "airliner",
        wind: [180, 20],
        ap: {
          engaged: true,
          lat: "HDG",
          vert: "ALT",
          hdg: 240,
          alt: 3000,
          armed: ["LOC", "GS"],
        },
      },
    ),
    "at.lnav": sceneA1(
      "at.lnav",
      {
        pos: { runway: { icao: "PARD", id: "27" }, distNm: 16, offsetDeg: 6 },
        altFt: 3000,
        hdg: 255,
        iasKt: 140,
        radios: ils,
      },
      {
        label: "LNAV and ALT HOLD · LOC and G/S armed",
        cockpit: "airliner",
        ap: {
          engaged: true,
          lat: "GPS",
          vert: "ALT",
          hdg: 255,
          alt: 3000,
          armed: ["LOC", "GS"],
        },
      },
    ),
    "at.hdg": sceneA1(
      "at.hdg",
      {
        pos: { fix: "PARD", radial: 160, distNm: 18 },
        altFt: 5000,
        hdg: 270,
        iasKt: 120,
        radios: { baro: 29.92 },
      },
      {
        label: "5,000 ft · heading 270 · autopilot in HDG SEL",
        cockpit: "airliner",
        ap: { engaged: true, lat: "HDG", vert: "ALT", hdg: 270, alt: 5000 },
      },
    ),
  };
}

/** A point of the airliner PFD (logical 1024 × 768) drawn in (x, y, w, h). */
const pfdAt = (
  v: typeof PFD | typeof FMA | typeof ND,
  f: [number, number, number, number],
  p: [number, number],
) => onInstrument(v, f[0], f[1], f[2], f[3], p, "airliner");

const F_PFD: [number, number, number, number] = [G.left, 192, 960, 720];
const F_FMA: [number, number, number, number] = [G.left, 320, 1680, 272];

export function atpl022InstrumentsCourse(): Course {
  const steps: Step[] = [
    // 1 ------------------------------------------------------------------ cover
    coverStep(
      "at-cover",
      L(
        "ATPL 022: air data, EFIS and automatic flight",
        "ATPL 022 : air data, EFIS et vol automatique",
      ),
      {
        eyebrow: L(
          "ATPL theory · 022 Instrumentation",
          "Théorique ATPL · 022 Instrumentation",
        ),
        main: L("ATPL 022", "ATPL 022"),
        sub: L(
          "air data, EFIS and automatic flight",
          "centrale aérodynamique, EFIS et vol automatique",
        ),
        lead: L(
          "Mach and CAS, the modes on the PFD, the warnings: read them live.",
          "Mach et Vc, les modes sur le PFD, les alarmes : lisez-les en direct.",
        ),
        meta: L(
          "17 steps · about 50 min · EASA ATPL LOs 022",
          "17 étapes · environ 50 min · objectifs EASA ATPL 022",
        ),
        hero: [
          INST(
            PFD,
            L(
              "Airliner primary flight display at FL350, 250 kt CAS, autopilot engaged",
              "PFD d’avion de ligne au FL350, 250 kt de Vc, pilote automatique engagé",
            ),
            984,
            232,
            816,
            612,
            {
              id: "at-cover.pfd",
              scene: "at.cruise",
            },
          ),
        ],
        scene: "at.cruise",
        reader: L(
          "ATPL 022 instrumentation on the live airliner displays: the speed of sound and the Mach number, CAS, TAS and Mach in the climb, the PFD and its flight mode annunciator, the navigation display and the wind, autopilot, flight director and autothrust, GPWS, TAWS and ACAS, then a coupled ILS flown in the cockpit.",
          "L’instrumentation ATPL 022 sur les écrans d’avion de ligne en direct : la vitesse du son et le nombre de Mach, Vc, Vp et Mach en montée, le PFD et ses annonces de modes, l’écran de navigation et le vent, pilote automatique, directeur de vol et automanette, GPWS, TAWS et ACAS, puis un ILS couplé volé dans le cockpit.",
        ),
      },
    ),
    // 2 ------------------------------------------------------------------ why
    whyStep("at-why", {
      eyebrow: L("The speed of sound", "La vitesse du son"),
      title: L("Temperature, and nothing else", "La température, rien d’autre"),
      n: dec(38.94, 2),
      nW: 512,
      unit: L("√T", "√T"),
      statement: L(
        "a = 38.94 √T: knots, with T in kelvin",
        "a = 38,94 √T : en nœuds, T en kelvins",
      ),
      body: L(
        "No pressure and no altitude in it: only the air temperature.",
        "Ni pression ni altitude : seulement la température de l’air.",
      ),
      sideTitle: L("In the standard atmosphere", "En atmosphère standard"),
      side: [
        {
          n: S("661 kt"),
          text: L("at sea level, 15 °C", "au niveau de la mer, 15 °C"),
        },
        { n: S("576 kt"), text: L("at FL350, −54 °C", "au FL350, −54 °C") },
        {
          n: S("573 kt"),
          text: L(
            "above the tropopause, −56.5 °C",
            "au-dessus de la tropopause, −56,5 °C",
          ),
          color: "key",
        },
      ],
      foot: L(
        "EASA ATPL LOs 022 · Mach meter · ICAO Doc 7488 standard atmosphere",
        "Objectifs EASA ATPL 022 · machmètre · OACI Doc 7488 atmosphère type",
      ),
      reader: L(
        "The local speed of sound depends only on the air temperature: a = 38.94 √T, in knots with T in kelvin. In the ICAO standard atmosphere that is 661 kt at sea level (15 °C), about 576 kt at FL350 (−54 °C) and 573 kt above the tropopause (36,089 ft, −56.5 °C) (ICAO Doc 7488; EASA ATPL LOs 022).",
        "La vitesse locale du son ne dépend que de la température de l’air : a = 38,94 √T, en nœuds avec T en kelvins. En atmosphère type OACI, cela donne 661 kt au niveau de la mer (15 °C), environ 576 kt au FL350 (−54 °C) et 573 kt au-dessus de la tropopause (36 089 ft, −56,5 °C) (OACI Doc 7488 ; objectifs EASA ATPL 022).",
      ),
    }),
    // 3 ------------------------------------------------------------------ predict
    quizStep("at-predict", {
      eyebrow: L("Predict", "Prédisez"),
      title: L("A climb at constant CAS", "Une montée à Vc constante"),
      quote: L(
        "250 kt CAS all the way from FL100 to FL350.",
        "250 kt de Vc du FL100 au FL350.",
      ),
      quiz: mcq(
        L("The Mach number…", "Le nombre de Mach…"),
        [
          {
            text: L("Increases", "Augmente"),
            why: L(
              "Right: TAS rises and the air gets colder.",
              "Juste : la Vp augmente et l’air se refroidit.",
            ),
          },
          {
            text: L("Decreases", "Diminue"),
            why: L(
              "That is the descent at constant CAS.",
              "C’est la descente à Vc constante.",
            ),
          },
          {
            text: L("Stays", "Reste"),
            why: L(
              "Only Mach-hold keeps it constant.",
              "Seule une tenue de Mach le garde constant.",
            ),
          },
        ],
        0,
        L(
          "At constant CAS, TAS grows with altitude and a falls with temperature: Mach rises twice over.",
          "À Vc constante, la Vp croît avec l’altitude et a baisse avec la température : le Mach monte doublement.",
        ),
      ),
      foot: L(
        "EASA ATPL LOs 022 · CAS, TAS and Mach in the climb",
        "Objectifs EASA ATPL 022 · Vc, Vp et Mach en montée",
      ),
      reader: L(
        "Climbing at constant CAS, the true airspeed increases because the air gets thinner, and the speed of sound decreases because the air gets colder: the Mach number increases for both reasons. That is why an airliner climbs on CAS, then changes to a constant Mach at the crossover altitude (EASA ATPL LOs 022).",
        "En montée à Vc constante, la vitesse propre augmente parce que l’air se raréfie, et la vitesse du son diminue parce que l’air se refroidit : le nombre de Mach augmente pour ces deux raisons. C’est pourquoi un avion de ligne monte à Vc constante, puis passe à Mach constant à l’altitude de conjonction (objectifs EASA ATPL 022).",
      ),
    }),
    // 4 ------------------------------------------------------------------ the PFD
    panelNotesStep("at-pfd", {
      eyebrow: L("The PFD", "Le PFD"),
      title: L("Speed, Mach and altitude", "Vitesse, Mach et altitude"),
      lead: L(
        "FL350, read live from the display.",
        "FL350, lu en direct sur l’écran.",
      ),
      view: PFD,
      alt: L(
        "Airliner PFD at FL350: speed tape left, Mach under it, altitude tape right",
        "PFD au FL350 : bande de vitesse à gauche, Mach dessous, bande d’altitude à droite",
      ),
      scene: "at.cruise",
      frame: F_PFD,
      marks: [
        pfdAt(PFD, F_PFD, [136, 118]),
        pfdAt(PFD, F_PFD, [210, 640]),
        pfdAt(PFD, F_PFD, [811, 118]),
      ],
      rows: [
        {
          heading: L("Speed tape: CAS", "Bande de vitesse : Vc"),
          body: L("CAS {{value}}", "Vc {{value}}"),
          readout: "ias",
        },
        {
          heading: L("Mach, under the tape", "Le Mach, sous la bande"),
          body: L(
            "From TAS and the outside temperature.",
            "Calculé de la Vp et de la température.",
          ),
        },
        {
          heading: L("Altitude tape", "Bande d’altitude"),
          body: L("Altitude {{value}}", "Altitude {{value}}"),
          readout: "alt",
        },
      ],
      foot: L(
        "EASA ATPL 022 · FAA IFH ch. 5",
        "Objectifs ATPL 022 · FAA IFH ch. 5",
      ),
      reader: L(
        "The airliner PFD at FL350. The speed tape shows the computed airspeed from the air data computer; the Mach number is shown under it, computed from the true airspeed and the outside air temperature; the altitude tape is on the right, with the vertical speed beside it (EASA ATPL LOs 022; FAA IFH ch. 5).",
        "Le PFD d’avion de ligne au FL350. La bande de vitesse affiche la vitesse conventionnelle de la centrale aérodynamique ; le nombre de Mach est affiché dessous, calculé à partir de la vitesse propre et de la température extérieure ; la bande d’altitude est à droite, avec la vitesse verticale à côté (objectifs EASA ATPL 022 ; FAA IFH ch. 5).",
      ),
    }),
    // 5 ------------------------------------------------------------------ the numbers
    formulaStep("at-mach", {
      eyebrow: L("The numbers", "Les chiffres"),
      title: L("The Mach number", "Le nombre de Mach"),
      visual: [
        INST(
          PFD,
          L(
            "Airliner PFD at FL350 with the Mach number under the speed tape",
            "PFD au FL350 avec le nombre de Mach sous la bande de vitesse",
          ),
          152,
          368,
          784,
          588,
          {
            id: "at-mach.pfd",
            scene: "at.cruise",
          },
        ),
      ],
      formula: L("{M} = [{TAS}/{a}]", "{M} = [{Vp}/{a}]"),
      units: L(
        "a = 38.94 √(273 + SAT) · FL350 in ISA, TAS 450 kt",
        "a = 38,94 √(273 + SAT) · FL350 en ISA, Vp 450 kt",
      ),
      lines: [
        L("SAT | −54 °C → !219 K!", "SAT | −54 °C → !219 K!"),
        L("a | 38.94 × √219 ≈ !576 kt!", "a | 38,94 × √219 ≈ !576 kt!"),
        L("M | 450 ÷ 576 ≈ !0.78!", "M | 450 ÷ 576 ≈ !0,78!"),
      ],
      foot: L(
        "EASA ATPL LOs 022 · Mach meter · ICAO Doc 7488",
        "Objectifs EASA ATPL 022 · machmètre · OACI Doc 7488",
      ),
      reader: [
        {
          t: "formula",
          formula: L(
            "M = TAS ÷ a, with a = 38.94 √T (kt, T in kelvin = 273 + SAT)",
            "M = Vp ÷ a, avec a = 38,94 √T (kt, T en kelvins = 273 + SAT)",
          ),
          ruleOfThumb: L(
            "At FL350 in ISA the static air temperature is about −54 °C, 219 K: a ≈ 38.94 × 14.8 ≈ 576 kt. A true airspeed of 450 kt is then Mach 0.78.",
            "Au FL350 en ISA, la température statique vaut environ −54 °C, 219 K : a ≈ 38,94 × 14,8 ≈ 576 kt. Une vitesse propre de 450 kt fait alors Mach 0,78.",
          ),
          refs: [{ src: "ICAO-7488", ref: "standard atmosphere" }],
        },
      ],
    }),
    // 6 ------------------------------------------------------------------ numeric quiz
    step(
      "at-mach-quiz",
      "quiz",
      L("Work out the Mach number", "Calculez le nombre de Mach"),
      [
        {
          t: "text",
          text: L(
            "a = 38.94 √T, with T = 273 + SAT. Then M = TAS ÷ a.",
            "a = 38,94 √T, avec T = 273 + SAT. Puis M = Vp ÷ a.",
          ),
        },
      ],
      {
        minutes: 2,
        section: "check",
        layout: "readerOnly",
        quiz: {
          kind: "numeric",
          prompt: L(
            "TAS 470 kt, SAT −50 °C. What is the Mach number?",
            "Vp 470 kt, SAT −50 °C. Quel est le nombre de Mach ?",
          ),
          answer: 0.81,
          tol: 0.01,
          explain: L(
            "T = 273 − 50 = 223 K; √223 ≈ 14.93; a ≈ 38.94 × 14.93 ≈ 581 kt; M = 470 ÷ 581 ≈ 0.81.",
            "T = 273 − 50 = 223 K ; √223 ≈ 14,93 ; a ≈ 38,94 × 14,93 ≈ 581 kt ; M = 470 ÷ 581 ≈ 0,81.",
          ),
        },
      },
    ),
    // 7 ------------------------------------------------------------------ FL100 vs FL350
    panelCompareStep("at-climb", {
      eyebrow: L("Same CAS, two levels", "Même Vc, deux niveaux"),
      title: L("250 kt at FL100 and at FL350", "250 kt au FL100 et au FL350"),
      halves: [
        {
          eyebrow: L("FL100 · 250 kt CAS", "FL100 · 250 kt de Vc"),
          color: "nav",
          view: PFD,
          alt: L(
            "PFD at FL100, 250 kt CAS: a low Mach number",
            "PFD au FL100, 250 kt de Vc : un Mach faible",
          ),
          scene: "at.fl100",
          body: L(
            "Low Mach: CAS is the limit that matters.",
            "Mach faible : c’est la Vc qui limite.",
          ),
        },
        {
          eyebrow: L("FL350 · 250 kt CAS", "FL350 · 250 kt de Vc"),
          color: "key",
          view: PFD,
          alt: L(
            "PFD at FL350, 250 kt CAS: TAS and Mach much higher",
            "PFD au FL350, 250 kt de Vc : Vp et Mach bien plus hauts",
          ),
          scene: "at.cruise",
          body: L(
            "Same CAS, far higher Mach: above the crossover, fly Mach.",
            "Même Vc, Mach bien plus haut : au-dessus de la conjonction, on vole au Mach.",
          ),
        },
      ],
      foot: L(
        "EASA ATPL LOs 022 · CAS, TAS, Mach and the crossover altitude",
        "Objectifs EASA ATPL 022 · Vc, Vp, Mach et altitude de conjonction",
      ),
      reader: L(
        "The same 250 kt CAS at FL100 and at FL350. Higher up, the true airspeed is much larger and the speed of sound smaller, so the Mach number is far higher. In a climb at constant CAS the Mach number rises until it reaches the planned Mach: that level is the crossover altitude, above which the aircraft flies a constant Mach and the Mach limit, not the CAS limit, protects it (EASA ATPL LOs 022).",
        "La même Vc de 250 kt au FL100 et au FL350. Plus haut, la vitesse propre est bien plus grande et la vitesse du son plus petite : le nombre de Mach est bien plus élevé. En montée à Vc constante, le Mach augmente jusqu’au Mach prévu : ce niveau est l’altitude de conjonction, au-dessus de laquelle l’avion vole à Mach constant et c’est la limite de Mach, et non plus la Vc, qui le protège (objectifs EASA ATPL 022).",
      ),
    }),
    // 8 ------------------------------------------------------------------ the FMA
    fmaSlide(),
    // 9 ------------------------------------------------------------------ quiz: read the FMA
    quizStep("at-fma-quiz", {
      eyebrow: L("Read it", "Lisez-le"),
      title: L("Which lateral mode is armed?", "Quel mode latéral est armé ?"),
      visual: [
        INST(
          FMA,
          L(
            "Flight mode annunciator: LNAV and ALT HOLD in green, LOC and G/S in white below, CMD",
            "Annonces de modes : LNAV et ALT HOLD en vert, LOC et G/S en blanc dessous, CMD",
          ),
          G.left,
          392,
          816,
          136,
          {
            id: "at-fma-quiz.fma",
            scene: "at.lnav",
          },
        ),
      ],
      quiz: mcq(
        L("Read the white line.", "Lisez la ligne blanche."),
        [
          {
            text: S("LOC"),
            why: L(
              "Right: white, under the roll column.",
              "Juste : en blanc, sous la colonne de roulis.",
            ),
          },
          {
            text: S("LNAV"),
            why: L(
              "Green: LNAV is engaged, not armed.",
              "En vert : LNAV est engagé, pas armé.",
            ),
          },
          {
            text: S("G/S"),
            why: L(
              "Armed too, but it is the vertical mode.",
              "Armé aussi, mais c’est le mode vertical.",
            ),
          },
        ],
        0,
        L(
          "Green is engaged, white is armed: LOC will capture, then G/S.",
          "Le vert est engagé, le blanc armé : LOC capturera, puis G/S.",
        ),
      ),
      foot: L(
        "FAA-H-8083-6 · the flight mode annunciator",
        "FAA-H-8083-6 · annonces de modes",
      ),
      reader: L(
        "The FMA shows LNAV (roll) and ALT HOLD (pitch) in green: engaged. Below them in white, LOC under the roll column and G/S under the pitch column: armed. The armed lateral mode is LOC; it will capture the localizer, then G/S the glideslope (FAA-H-8083-6).",
        "Les annonces montrent LNAV (roulis) et ALT HOLD (tangage) en vert : engagés. Dessous en blanc, LOC sous la colonne de roulis et G/S sous la colonne de tangage : armés. Le mode latéral armé est LOC ; il capturera le localizer, puis G/S le plan de descente (FAA-H-8083-6).",
      ),
    }),
    // 10 ----------------------------------------------------------------- the ND and the wind
    ndSlide(),
    // 11 ----------------------------------------------------------------- your turn: select a heading
    turnStep("at-hdg", {
      eyebrow: L("Your turn", "À vous"),
      title: L("Select heading 300", "Affichez le cap 300"),
      rows: [
        {
          heading: L("Turn the heading bug", "Tournez l’index de cap"),
          small: L(
            "HDG SEL is engaged: the autopilot follows",
            "HDG SEL est engagé : le pilote automatique suit",
          ),
        },
        {
          heading: L("Watch, do not fly", "Surveillez, sans piloter"),
          small: L(
            "the FMA, the bank, the new heading",
            "les annonces, l’inclinaison, le nouveau cap",
          ),
        },
      ],
      checks: [
        { text: L("Heading 295 to 305", "Cap 295 à 305"), readout: "hdg" },
      ],
      view: PFD,
      alt: L(
        "Live airliner PFD, autopilot engaged in HDG SEL, heading 270",
        "PFD en direct, pilote automatique engagé en HDG SEL, cap 270",
      ),
      scene: "at.hdg",
      prompt: L(
        "Your turn: select heading 300 and let the autopilot turn",
        "À vous : affichez le cap 300 et laissez le pilote automatique virer",
      ),
      controls: ["hdgBug", "ap"],
      goal: {
        all: [{ id: "heading", p: { value: 300, tol: 5 } }],
        holdS: 3,
        graded: false,
        success: L("On 300 in HDG SEL.", "Au 300 en HDG SEL."),
      },
      hint: L("Turn the HDG knob to 300.", "Tournez le bouton HDG sur 300."),
      foot: L(
        "The stage flies the trainer’s flight model, at trainer speeds",
        "La scène vole avec le modèle du monomoteur, à ses vitesses",
      ),
      reader: L(
        "Your turn on the live PFD: the autopilot is engaged in HDG SEL and ALT HOLD. Turn the heading bug to 300 and watch the autopilot roll into the turn and level out on the new heading. The stage flies the trainer’s flight model under the airliner display, at trainer speeds.",
        "À vous sur le PFD en direct : le pilote automatique est engagé en HDG SEL et ALT HOLD. Tournez l’index de cap sur 300 et regardez le pilote automatique s’incliner puis se stabiliser au nouveau cap. La scène vole avec le modèle de vol du monomoteur sous l’affichage d’avion de ligne, à ses vitesses.",
      ),
    }),
    // 12 ----------------------------------------------------------------- AP, FD, A/THR
    heroStep("at-auto", {
      eyebrow: L("Automatic flight", "Le vol automatique"),
      title: L(
        "Autopilot, flight director, autothrust",
        "Pilote auto, directeur de vol, automanette",
      ),
      visual: [
        INST(
          PFD,
          L(
            "PFD on vectors to the ILS: flight director bars, HDG SEL and ALT HOLD engaged, LOC and G/S armed",
            "PFD en guidage vers l’ILS : barres du directeur de vol, HDG SEL et ALT HOLD engagés, LOC et G/S armés",
          ),
          G.left,
          312,
          896,
          672,
          {
            id: "at-auto.pfd",
            scene: "at.ils",
          },
        ),
      ],
      points: [
        {
          heading: L("Flight director", "Directeur de vol"),
          body: L(
            "Computes the command; the pilot or the AP follows.",
            "Calcule l’ordre ; le pilote ou l’AP le suit.",
          ),
          color: "path",
        },
        {
          heading: L("Autopilot", "Pilote automatique"),
          body: L(
            "Flies the commands: CMD on the FMA.",
            "Exécute les ordres : CMD sur les annonces.",
          ),
        },
        {
          heading: L("Autothrust", "Automanette"),
          body: L(
            "Thrust for the speed or the mode: absent here.",
            "La poussée selon la vitesse ou le mode : absente ici.",
          ),
        },
      ],
      foot: L(
        "EASA ATPL LOs 022 · FAA-H-8083-6 ch. 4 · automatic flight control",
        "Objectifs EASA ATPL 022 · FAA-H-8083-6 ch. 4 · commandes de vol automatiques",
      ),
      reader: L(
        "The flight director computes the pitch and roll commands for the selected modes and shows them as command bars; the pilot, or the autopilot, follows them. With the autopilot engaged the FMA shows CMD; with the flight director alone, FD. The autothrust (autothrottle) sets thrust for the selected speed or for the vertical mode; the trainer on this stage has none, so the thrust column of the FMA stays blank in flight (EASA ATPL LOs 022; FAA-H-8083-6 ch. 4).",
        "Le directeur de vol calcule les ordres de tangage et de roulis des modes choisis et les affiche en barres de commande ; le pilote, ou le pilote automatique, les suit. Pilote automatique engagé, les annonces montrent CMD ; directeur de vol seul, FD. L’automanette règle la poussée pour la vitesse choisie ou pour le mode vertical ; le monomoteur de cette scène n’en a pas, la colonne poussée des annonces reste donc vide en vol (objectifs EASA ATPL 022 ; FAA-H-8083-6 ch. 4).",
      ),
    }),
    // 13 ----------------------------------------------------------------- warning systems
    stepsStep("at-warn", {
      eyebrow: L("Warning systems", "Systèmes d’alarme"),
      title: L("GPWS, TAWS and ACAS", "GPWS, TAWS et ACAS"),
      rows: [
        {
          heading: L("GPWS modes 1 and 2", "GPWS modes 1 et 2"),
          small: L(
            "excessive sink rate, excessive closure: SINK RATE, PULL UP",
            "taux de chute, rapprochement du sol : SINK RATE, PULL UP",
          ),
        },
        {
          heading: L("Modes 3, 4 and 5", "Modes 3, 4 et 5"),
          small: L(
            "sink after take-off, too low, below the glideslope",
            "chute après décollage, trop bas, sous le plan",
          ),
        },
        {
          heading: L("TAWS: terrain ahead", "TAWS : le relief devant"),
          small: L(
            "a terrain database adds a forward look",
            "une base de relief ajoute l’anticipation",
          ),
        },
        {
          heading: L("ACAS TA", "ACAS TA"),
          small: L(
            "TRAFFIC, TRAFFIC: look, but never manoeuvre on a TA",
            "TRAFFIC, TRAFFIC : regardez, sans manœuvrer sur un TA",
          ),
        },
        {
          heading: L("ACAS RA", "ACAS RA"),
          small: L(
            "a vertical command: fly it at once",
            "un ordre vertical : à suivre aussitôt",
          ),
        },
      ],
      foot: L(
        "EASA ATPL LOs 022 · ICAO Doc 8168 Vol I · ICAO Doc 9863",
        "Objectifs EASA ATPL 022 · OACI Doc 8168 Vol I · OACI Doc 9863",
      ),
      reader: L(
        "The ground proximity warning system: mode 1 excessive descent rate (SINK RATE, PULL UP), mode 2 excessive terrain closure rate, mode 3 altitude loss after take-off (DON’T SINK), mode 4 unsafe terrain clearance when not in the landing configuration (TOO LOW), mode 5 excessive deviation below the glideslope (GLIDESLOPE). TAWS adds a forward-looking terrain alert from a terrain database. ACAS II gives traffic advisories (TA, “TRAFFIC, TRAFFIC”), on which pilots must not manoeuvre, and resolution advisories (RA), vertical manoeuvres to fly promptly (EASA ATPL LOs 022; ICAO Doc 8168 Vol I; ICAO Doc 9863).",
        "Le dispositif avertisseur de proximité du sol : mode 1 taux de descente excessif (SINK RATE, PULL UP), mode 2 rapprochement du relief excessif, mode 3 perte d’altitude après décollage (DON’T SINK), mode 4 marge insuffisante hors configuration d’atterrissage (TOO LOW), mode 5 écart excessif sous le plan de descente (GLIDESLOPE). Le TAWS ajoute une alerte anticipée à partir d’une base de données de relief. L’ACAS II donne des avis de trafic (TA, « TRAFFIC, TRAFFIC »), sur lesquels on ne manœuvre pas, et des avis de résolution (RA), des manœuvres verticales à exécuter sans délai (objectifs EASA ATPL 022 ; OACI Doc 8168 Vol I ; OACI Doc 9863).",
      ),
    }),
    // 14 ----------------------------------------------------------------- quiz: RA vs ATC
    quizStep("at-ra", {
      eyebrow: L("Question", "Question"),
      title: L("RA against the clearance", "Un RA contre la clairance"),
      quote: L(
        "ACAS: “CLIMB, CLIMB”. ATC, at the same moment: “descend FL300”.",
        "ACAS : « CLIMB, CLIMB ». L’ATC au même moment : « descendez FL300 ».",
      ),
      quiz: mcq(
        L("What do you fly?", "Que pilotez-vous ?"),
        [
          {
            text: L("The RA: climb", "Le RA : monter"),
            why: L(
              "Right: follow the RA, then report it to ATC.",
              "Juste : suivez le RA, puis annoncez-le à l’ATC.",
            ),
          },
          {
            text: L("The ATC instruction", "L’instruction ATC"),
            why: L(
              "Never against an RA: the other aircraft follows its own.",
              "Jamais contre un RA : l’autre avion suit le sien.",
            ),
          },
          {
            text: L("Level off and wait", "Mettre en palier"),
            why: L(
              "Not following the RA defeats the coordination.",
              "Ne pas suivre le RA casse la coordination.",
            ),
          },
        ],
        0,
        L(
          "Follow the RA promptly, even against ATC; report “TCAS RA”; return to the clearance when clear of conflict.",
          "Suivez le RA sans délai, même contre l’ATC ; annoncez « TCAS RA » ; revenez à la clairance une fois le conflit résolu.",
        ),
      ),
      foot: L(
        "ICAO Doc 8168 PANS-OPS Vol I · ACAS · AC 120-55",
        "OACI Doc 8168 PANS-OPS Vol I · ACAS · AC 120-55",
      ),
      reader: L(
        "PANS-OPS: in the event of an RA, pilots respond immediately by following it, even if it conflicts with an ATC instruction, unless doing so would jeopardize the safety of the aircraft. The other aircraft's ACAS has coordinated the opposite manoeuvre. Report the RA to ATC, and return to the clearance once clear of conflict (ICAO Doc 8168 Vol I; FAA AC 120-55).",
        "PANS-OPS : en cas de RA, le pilote réagit immédiatement en le suivant, même s’il contredit une instruction ATC, sauf si cela compromet la sécurité de l’avion. L’ACAS de l’autre avion a coordonné la manœuvre inverse. Annoncez le RA à l’ATC, puis revenez à la clairance une fois le conflit résolu (OACI Doc 8168 Vol I ; FAA AC 120-55).",
      ),
    }),
    // 15 ----------------------------------------------------------------- drill
    step(
      "at-drill",
      "drill",
      L("Drill: speeds and times", "Série : vitesses et temps"),
      [],
      {
        minutes: 6,
        drill: {
          generatorIds: ["ifr.tasFromIas", "ifr.timeSpeedDistance"],
          count: 6,
          timer: { mode: "stopwatch" },
          feedback: "each",
          practiceOnly: true,
        },
      },
    ),
    // 16 ----------------------------------------------------------------- recap
    recapStep("at-recap", {
      title: L("Three things to carry", "Trois choses à retenir"),
      cols: [
        {
          n: dec(38.94, 2),
          text: L(
            "a = 38.94 √T: temperature only",
            "a = 38,94 √T : la température seule",
          ),
          color: "key",
        },
        {
          n: L("White", "Blanc"),
          text: L(
            "armed on the FMA; green is engaged",
            "armé sur les annonces ; le vert est engagé",
          ),
          color: "key",
        },
        {
          n: S("RA"),
          text: L(
            "follow it first, then tell ATC",
            "suivez-le d’abord, puis prévenez l’ATC",
          ),
          color: "stop",
        },
      ],
      checks: [
        L(
          "Constant CAS climb: Mach rises",
          "Montée à Vc constante : le Mach monte",
        ),
        L(
          "Read the FMA after every change",
          "Lire les annonces à chaque changement",
        ),
        L(
          "Never manoeuvre on a TA alone",
          "Ne jamais manœuvrer sur un TA seul",
        ),
      ],
      foot: L(
        "EASA ATPL LOs 022 · ICAO Doc 8168 Vol I · FAA-H-8083-6",
        "Objectifs EASA ATPL 022 · OACI Doc 8168 Vol I · FAA-H-8083-6",
      ),
      reader: L(
        "The speed of sound depends only on temperature: a = 38.94 √T, and M = TAS ÷ a; climbing at constant CAS the Mach number rises. On the FMA green is engaged and white is armed: read it after every mode change. Follow an RA at once, even against ATC, then report it; never manoeuvre on a TA alone.",
        "La vitesse du son ne dépend que de la température : a = 38,94 √T, et M = Vp ÷ a ; en montée à Vc constante, le Mach augmente. Sur les annonces de modes, le vert est engagé, le blanc armé : lisez-les à chaque changement de mode. Suivez un RA aussitôt, même contre l’ATC, puis annoncez-le ; ne manœuvrez jamais sur un TA seul.",
      ),
    }),
    // 17 ----------------------------------------------------------------- fly it
    flyStep(
      "at-fly",
      "app-ils-ap",
      L("Fly it: the coupled ILS", "En vol : l’ILS couplé"),
      L(
        "Vectors to the PARD ILS 27 with the autopilot: arm APR, then watch the FMA go from HDG to LOC armed, LOC, then G/S.",
        "Guidage vers l’ILS 27 de PARD au pilote automatique : armez APR, puis suivez les annonces de HDG à LOC armé, LOC, puis G/S.",
      ),
      [
        L("White is armed, green is engaged", "Blanc armé, vert engagé"),
        L(
          "ALT holds 3,000 ft until the G/S captures",
          "ALT tient 3 000 ft jusqu’à la capture du G/S",
        ),
      ],
      8,
    ),
  ];
  return course(
    {
      id: ATPL_022_INSTRUMENTS_ID,
      title: L(
        "ATPL 022: air data, EFIS and automatic flight",
        "ATPL 022 : centrale aérodynamique, EFIS et vol automatique",
      ),
      summary: L(
        "The speed of sound and Mach, CAS and TAS in the climb, the PFD and its mode annunciator, the ND and the wind, AP, FD and autothrust, GPWS, TAWS and ACAS: on the live airliner displays, then a coupled ILS.",
        "La vitesse du son et le Mach, Vc et Vp en montée, le PFD et ses annonces de modes, le ND et le vent, AP, FD et automanette, GPWS, TAWS et ACAS : sur les écrans d’avion de ligne en direct, puis un ILS couplé.",
      ),
      cockpit: "airliner",
      theme: "classroom",
      tags: ["atpl", "easa", "022", "instruments", "efis", "automation"],
      minutes: 50,
    },
    steps,
    scenes(),
  );
}

/** A5 on the flight mode annunciator: the FMA band full width, three callout rows beneath it. */
function fmaSlide(): Step {
  const id = "at-fma";
  const title = L("The flight mode annunciator", "Les annonces de modes");
  const f = F_FMA;
  // FMA columns in PFD logical units: thrust at x 274, roll at 474, pitch at 674; armed modes at y 48; status at y 85
  const mk = (n: number, p: [number, number]) => {
    const q = pfdAt(FMA, f, p);
    return MARK(n, q[0], q[1], { size: 56, reveal: n, group: `row${n}` });
  };
  const rows: { heading: L10n; body: L10n }[] = [
    {
      heading: L("Thrust column", "Colonne poussée"),
      body: L(
        "Blank here: the trainer has no autothrust.",
        "Vide ici : le monomoteur n’a pas d’automanette.",
      ),
    },
    {
      heading: L("Roll and pitch", "Roulis et tangage"),
      body: L(
        "Green: engaged. White, below: armed.",
        "Vert : engagé. Blanc, dessous : armé.",
      ),
    },
    {
      heading: L("CMD or FD", "CMD ou FD"),
      body: L(
        "Autopilot engaged, or flight director only.",
        "Pilote auto engagé, ou directeur seul.",
      ),
    },
  ];
  const blocks: SlideBlock[] = [
    ...head(L("The PFD", "Le PFD"), title),
    INST(
      FMA,
      L(
        "Flight mode annunciator: HDG SEL and ALT HOLD engaged in green, LOC and G/S armed in white, CMD",
        "Annonces de modes : HDG SEL et ALT HOLD engagés en vert, LOC et G/S armés en blanc, CMD",
      ),
      ...f,
      {
        id: `${id}.fma`,
        scene: "at.ils",
      },
    ),
    mk(1, [232, 22]),
    mk(2, [420, 48]),
    mk(3, [420, 85]),
    ...rows.flatMap((r, i): SlideBlock[] => {
      const x = G.x(i * 4);
      const g = { reveal: i + 1, group: `row${i + 1}` };
      return [
        rule(x, 648, 528, g),
        MARK(i + 1, x + 28, 704, { size: 56, ...g }),
        T("heading", r.heading, x + 80, 672, 448, 56, g),
        T("body", r.body, x, 768, 528, 152, { color: "ink2", ...g }),
      ];
    }),
    foot(
      L(
        "FAA-H-8083-6 Advanced Avionics Handbook · EASA ATPL LOs 022",
        "FAA-H-8083-6 Advanced Avionics Handbook · objectifs EASA ATPL 022",
      ),
    ),
  ];
  return slideStep(
    id,
    title,
    slide("instrumentNotes", blocks, { scene: "at.ils" }),
    [
      {
        t: "text",
        text: L(
          "The flight mode annunciator, at the top of the PFD, has three columns: thrust (autothrust) mode, roll mode and pitch mode. Engaged modes are green; armed modes are white, on the line below. Here HDG SEL and ALT HOLD are engaged, LOC and G/S armed, and CMD shows the autopilot engaged (FD would mean the flight director alone). The trainer under these displays has no autothrust, so the thrust column is blank (FAA-H-8083-6; EASA ATPL LOs 022).",
          "Les annonces de modes, en haut du PFD, ont trois colonnes : mode de poussée (automanette), mode de roulis et mode de tangage. Les modes engagés sont en vert ; les modes armés en blanc, sur la ligne du dessous. Ici HDG SEL et ALT HOLD sont engagés, LOC et G/S armés, et CMD indique le pilote automatique engagé (FD signifierait le directeur de vol seul). Le monomoteur sous ces écrans n’a pas d’automanette : la colonne poussée est vide (FAA-H-8083-6 ; objectifs EASA ATPL 022).",
        ),
      },
    ],
    { kind: "explain", section: "picture", minutes: 2 },
  );
}

/** A6 for the ND: the live map left, the wind triangle it solves right. */
function ndSlide(): Step {
  const id = "at-nd";
  const title = L("The ND solves the wind", "Le ND résout le vent");
  const blocks: SlideBlock[] = [
    ...head(L("The navigation display", "L’écran de navigation"), title),
    T("eyebrow", L("On the ND", "Sur le ND"), G.left, 312, 816, 32, {
      color: "sel",
      reveal: 1,
      group: "half1",
    }),
    INST(
      ND,
      L(
        "Navigation display on vectors to the PARD ILS 27: ground speed, true airspeed and wind at top left",
        "Écran de navigation en guidage vers l’ILS 27 de PARD : vitesse sol, vitesse propre et vent en haut à gauche",
      ),
      G.left,
      360,
      640,
      480,
      {
        id: `${id}.nd`,
        scene: "at.ils",
        reveal: { order: 1 },
        group: "half1",
      },
    ),
    rule(G.left, 864, 816, { reveal: 1, group: "half1" }),
    T(
      "body",
      L(
        "GS, TAS and the wind arrow, top left; the track line on the map.",
        "Vs, Vp et la flèche du vent en haut à gauche ; la ligne de route sur la carte.",
      ),
      G.left,
      888,
      816,
      96,
      { color: "ink2", reveal: 1, group: "half1" },
    ),
    T(
      "eyebrow",
      L("The wind triangle", "Le triangle des vitesses"),
      984,
      312,
      816,
      32,
      { color: "key", reveal: 2, group: "half2" },
    ),
    DIAGRAM(
      `${id}.wind`,
      {
        kind: "calc",
        calc: {
          kind: "windTriangle",
          course: 300,
          tasKt: 145,
          windDir: 180,
          windKt: 20,
        },
      },
      L(
        "Wind triangle: course 300, TAS 145 kt, wind 180° at 20 kt",
        "Triangle des vitesses : route 300, Vp 145 kt, vent 180° pour 20 kt",
      ),
      984,
      360,
      816,
      480,
      { reveal: 2 },
    ),
    rule(984, 864, 816, { reveal: 2, group: "half2" }),
    T(
      "body",
      L(
        "Heading, TAS and wind give track and ground speed.",
        "Cap, Vp et vent donnent la route et la vitesse sol.",
      ),
      984,
      888,
      816,
      96,
      { color: "ink2", reveal: 2, group: "half2" },
    ),
    foot(
      L(
        "EASA ATPL LOs 022 · EFIS navigation display · FAA IFH ch. 5",
        "Objectifs EASA ATPL 022 · écran de navigation EFIS · FAA IFH ch. 5",
      ),
    ),
  ];
  return slideStep(
    id,
    title,
    slide("compare", blocks, { scene: "at.ils" }),
    [
      {
        t: "text",
        text: L(
          "The navigation display shows the ground speed, the true airspeed and the wind (direction, speed and an arrow relative to the map) in its top-left corner, and the track line on the map. It is solving the wind triangle continuously: heading and TAS, plus the wind, give the track and the ground speed (EASA ATPL LOs 022; FAA IFH ch. 5).",
          "L’écran de navigation affiche la vitesse sol, la vitesse propre et le vent (direction, force et une flèche par rapport à la carte) en haut à gauche, et la ligne de route sur la carte. Il résout en permanence le triangle des vitesses : le cap et la Vp, plus le vent, donnent la route et la vitesse sol (objectifs EASA ATPL 022 ; FAA IFH ch. 5).",
        ),
      },
    ],
    { kind: "explain", section: "picture", minutes: 2 },
  );
}
