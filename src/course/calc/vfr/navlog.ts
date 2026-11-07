// Calc engine — VFR navigation log: TVMDC, ground speed and ETE, fuel and endurance.
import type { CalcPart, GeneratorDef } from "../../types";
import {
  checkNumeric,
  givenNum,
  givenStr,
  type PartWrong,
  type Wrong,
} from "../check";
import {
  hdg360,
  norm360,
  wcaRule,
  windComponents,
  windTriangle,
  wrap180,
} from "../maths";
import { L, tr, windText } from "../text";
import { ceilStep, roundStep } from "../units";
import {
  bracket,
  defineGenerator,
  given,
  pickVariant,
  poseOnRadial,
  REF,
  rulesParam,
  variantParam,
} from "../kit";

/** "6° E" / "6° W" */
function varText(v: number, lang: "en" | "fr"): string {
  if (v === 0) return "0°";
  return `${Math.abs(v)}° ${v > 0 ? "E" : lang === "fr" ? "W" : "W"}`;
}

// ================================================================== TVMDC
/**
 * True course → true heading (WCA) → magnetic heading (variation: East is least) → compass heading (deviation from
 * the card: "for MH, steer MH + dev").  variation: + East, − West. deviation: the card's correction, signed.
 */
export function solveTvmdc(
  tc: number,
  tasKt: number,
  windDir: number,
  windKt: number,
  variation: number,
  deviation: number,
): {
  wcaExact: number;
  wcaRule: number;
  wca: number;
  th: number;
  mh: number;
  ch: number;
  chExact: number;
  gs: number;
} {
  const t = windTriangle(tc, tasKt, windDir, windKt);
  const rule = wcaRule(t.cross, tasKt);
  const wca = Math.round(rule);
  const th = norm360(tc + wca);
  const mh = norm360(th - variation);
  const ch = norm360(mh + deviation);
  return {
    wcaExact: t.wca,
    wcaRule: rule,
    wca,
    th,
    mh,
    ch,
    chExact: norm360(tc + t.wca - variation + deviation),
    gs: t.gs,
  };
}

export const tvmdc: GeneratorDef = defineGenerator({
  id: "vfr.tvmdc",
  title: L(
    "From true course to compass heading (TVMDC)",
    "De la route vraie au cap compas",
  ),
  category: "vfr",
  summary: L(
    "True course → WCA → true heading → variation → magnetic → deviation → compass heading.",
    "Route vraie → dérive → cap vrai → déclinaison → cap magnétique → déviation → cap compas.",
  ),
  params: [
    {
      key: "varSide",
      label: L("Variation", "Déclinaison"),
      kind: "choice",
      default: "any",
      choices: [
        { value: "any", label: L("East or West", "Est ou Ouest") },
        { value: "E", label: L("East", "Est") },
        { value: "W", label: L("West", "Ouest") },
      ],
    },
  ],
  generate(rng, params) {
    const tc = rng.range(5, 360, 5);
    // within what the live stage flies (a trainer at ≤ 105 KIAS, ≈ 110 KTAS at 3,500 ft): the WCA computed here is
    // then the one that holds the track on the stage
    const tas = rng.range(90, 110, 5);
    let windDir = 0;
    let windKt = 0;
    for (let i = 0; i < 20; i++) {
      windDir = rng.range(10, 360, 10);
      windKt = rng.range(8, 25, 1);
      const c = Math.abs(windComponents(tc, windDir, windKt).cross);
      if (c >= 4) break;
    }
    const side =
      params.varSide === "E"
        ? 1
        : params.varSide === "W"
          ? -1
          : rng.chance(0.5)
            ? 1
            : -1;
    let variation = side * rng.range(2, 15, 1);
    let deviation = rng.pick([-4, -3, -2, 2, 3, 4, 0]);
    // the heading tolerance depends on the wind only (rule vs exact WCA): a sign error on the variation or the
    // deviation (2 × its value off) must always fall outside it, or the exercise cannot catch it
    const tolOf = (x: ReturnType<typeof solveTvmdc>) => Math.max(2, Math.abs(wrap180(x.ch - x.chExact)) + 1);
    const tol0 = tolOf(solveTvmdc(tc, tas, windDir, windKt, variation, deviation));
    const minSign = Math.floor(tol0 / 2) + 1;
    if (deviation !== 0 && Math.abs(deviation) < minSign) deviation = Math.sign(deviation) * Math.min(5, minSign);
    if (Math.abs(variation) < minSign) variation = Math.sign(variation) * minSign;
    const s = solveTvmdc(tc, tas, windDir, windKt, variation, deviation);
    const wr = windText(windDir, windKt);
    const devCard = tr(
      (f) => `for ${f.hdg(s.mh)} steer ${f.hdg(s.mh + deviation)}`,
      (f) => `pour ${f.hdg(s.mh)} afficher ${f.hdg(s.mh + deviation)}`,
    );
    const tolCh = tolOf(s);
    const parts: CalcPart[] = [
      {
        key: "wca",
        label: L(
          "WCA (+ right, − left)",
          "Dérive à corriger (+ droite, − gauche)",
        ),
        answer: s.wca,
        unit: "deg",
        tolerance: Math.max(1, Math.abs(s.wcaRule - s.wcaExact) + 0.6),
      },
      {
        key: "th",
        label: L("True heading", "Cap vrai"),
        answer: hdg360(s.th),
        unit: "deg",
        tolerance: tolCh,
      },
      {
        key: "mh",
        label: L("Magnetic heading", "Cap magnétique"),
        answer: hdg360(s.mh),
        unit: "deg",
        tolerance: tolCh,
      },
    ];
    return {
      prompt: tr(
        (f) =>
          `True course ${f.hdg(tc)}, TAS ${f.u(tas, "kt")}, wind ${wr} (true), variation ${varText(variation, "en")}. Compass card: ${devCard.en}. What compass heading do you fly?`,
        (f) =>
          `Route vraie ${f.hdg(tc)}, vitesse propre ${f.u(tas, "kt")}, vent ${wr} (vrai), déclinaison ${varText(variation, "fr")}. Carte de compensation : ${devCard.fr}. Quel cap compas volez-vous ?`,
      ),
      givens: [
        given("tc", L("True course", "Route vraie"), tc, "deg"),
        given("tasKt", L("TAS", "Vitesse propre"), tas, "kt"),
        given("windDir", L("Wind (true)", "Vent (vrai)"), windDir, "deg"),
        given(
          "windKt",
          L("Wind speed", "Force du vent"),
          windKt,
          "kt",
          L(wr, wr),
        ),
        given(
          "variation",
          L("Variation (+E / −W)", "Déclinaison (+E / −W)"),
          variation,
          "deg",
          L(varText(variation, "en"), varText(variation, "fr")),
        ),
        given(
          "deviation",
          L("Deviation correction", "Correction de déviation"),
          deviation,
          "deg",
          devCard,
        ),
      ],
      answer: hdg360(s.ch),
      unit: "deg",
      tolerance: tolCh,
      exact: hdg360(s.chExact),
      parts,
      solutionSteps: [
        tr(
          (f) =>
            `Crosswind: ${f.n(windKt)} × sin(${f.n(Math.abs(wrap180(windDir - tc)))}°) = ${f.u(Math.abs((s.wcaRule * tas) / 60), "kt", 1)} from the ${s.wcaRule > 0 ? "right" : "left"}; WCA ≈ × 60 ÷ ${f.n(tas)} = ${f.n(Math.abs(s.wcaRule), 1)}° → ${f.s(s.wca)}° (into the wind; exact ${f.s(s.wcaExact, 1)}°).`,
          (f) =>
            `Traversier : ${f.n(windKt)} × sin(${f.n(Math.abs(wrap180(windDir - tc)))}°) = ${f.u(Math.abs((s.wcaRule * tas) / 60), "kt", 1)} de ${s.wcaRule > 0 ? "droite" : "gauche"} ; dérive ≈ × 60 ÷ ${f.n(tas)} = ${f.n(Math.abs(s.wcaRule), 1)}° → ${f.s(s.wca)}° (face au vent ; exact ${f.s(s.wcaExact, 1)}°).`,
        ),
        tr(
          (f) =>
            `True heading = ${f.hdg(tc)} ${s.wca >= 0 ? "+" : "−"} ${f.n(Math.abs(s.wca))} = ${f.hdg(s.th)}.`,
          (f) =>
            `Cap vrai = ${f.hdg(tc)} ${s.wca >= 0 ? "+" : "−"} ${f.n(Math.abs(s.wca))} = ${f.hdg(s.th)}.`,
        ),
        tr(
          (f) =>
            `Variation ${varText(variation, "en")}: ${variation > 0 ? "East is least, subtract" : "West is best, add"}: magnetic heading ${f.hdg(s.mh)}.`,
          (f) =>
            `Déclinaison ${varText(variation, "fr")} : ${variation > 0 ? "Est, on retranche" : "Ouest, on ajoute"} : cap magnétique ${f.hdg(s.mh)}.`,
        ),
        tr(
          (f) =>
            `Deviation from the card (${devCard.en}): compass heading ${f.hdg(s.ch)}.`,
          (f) =>
            `Déviation d'après la carte (${devCard.fr}) : cap compas ${f.hdg(s.ch)}.`,
        ),
      ],
      ruleOfThumb: L(
        "True Virgins Make Dull Company: T ± WCA = TH, − East / + West = MH, ± deviation = CH. East is least, West is best.",
        "Rv ± dérive = Cv ; Cv − déclinaison Est (+ Ouest) = Cm ; Cm ± déviation = Cc. « Est on retranche, Ouest on ajoute ».",
      ),
      formula: L(
        "WCA = asin(W sin(θw − TC) ÷ TAS);  MH = TH − var(E+);  CH = MH + card correction",
        "X = asin(V sin(θv − Rv) ÷ Vp) ; Cm = Cv − Dm(E+) ; Cc = Cm + correction de la carte",
      ),
      refs: [
        REF.phak("ch. 16 (navigation: TVMDC)"),
        REF.phak("ch. 8 (magnetic compass: deviation card)"),
      ],
      diagram: {
        kind: "calc",
        calc: { kind: "compass", tc, wca: s.wca, variation, deviation },
      },
      stage: {
        panes: [{ kind: "pfd" }],
        pose: poseOnRadial(
          norm360(tc + 180),
          15,
          3500,
          // starts on the course, not on the answer: the student applies the WCA
          tc,
          Math.round(tas / 1.05),
        ),
        weather: {
          windDir,
          windKt,
          turbulence: 0,
          aloft: [{ altFt: 3500, dir: windDir, kt: windKt }],
        },
        mode: "live",
        controls: ["hdgBug"],
        assist: { holdAlt: true, holdIas: true },
        goals: [{ id: "track", p: { value: hdg360(tc), tol: 3 } }],
        doThis: [
          tr(
            (f) =>
              `The training area has no variation and the compass no deviation: fly the TRUE heading you computed (course + WCA) and hold a ${f.hdg(tc)} track.`,
            (f) =>
              `La zone d'entraînement n'a ni déclinaison ni déviation : volez le cap VRAI calculé (route + dérive) et tenez la route ${f.hdg(tc)}.`,
          ),
        ],
      },
    };
  },
  check(problem, response) {
    const tc = givenNum(problem, "tc");
    const v = givenNum(problem, "variation");
    const d = givenNum(problem, "deviation");
    const s = solveTvmdc(
      tc,
      givenNum(problem, "tasKt"),
      givenNum(problem, "windDir"),
      givenNum(problem, "windKt"),
      v,
      d,
    );
    const wrongs: Wrong[] = [
      { value: s.th + v + d, id: "variationSign" },
      { value: s.mh - d, id: "deviationSign" },
      { value: tc - s.wca - v + d, id: "wcaSign" },
      {
        value: s.th + v - d,
        id: "variationSign",
        text: L(
          "Variation and deviation both applied the wrong way. East is least: subtract East variation from the true heading.",
          "Déclinaison et déviation appliquées à l'envers. Est : on retranche la déclinaison Est du cap vrai.",
        ),
      },
      {
        value: s.mh,
        id: "other",
        text: L(
          "That is the magnetic heading. Apply the deviation from the compass card to get the compass heading.",
          "C'est le cap magnétique. Appliquez la déviation de la carte pour obtenir le cap compas.",
        ),
      },
      {
        value: tc - v + d,
        id: "other",
        text: L(
          "You left out the wind correction: true heading = true course ± WCA.",
          "Vous avez oublié la correction de dérive : cap vrai = route vraie ± dérive.",
        ),
      },
    ];
    const partWrongs: PartWrong[] = [
      { key: "wca", value: -s.wca, id: "wcaSign" },
      { key: "mh", value: hdg360(s.th + v), id: "variationSign" },
    ];
    return checkNumeric(problem, response, { wrongs, partWrongs });
  },
});

// ================================================================== ground speed and ETE
export const groundSpeedEte: GeneratorDef = defineGenerator({
  id: "vfr.groundSpeedEte",
  title: L("Ground speed and time en route", "Vitesse sol et temps de vol"),
  category: "vfr",
  alsoIn: ["ifr"],
  summary: L(
    "Ground speed from the wind triangle, then the leg time.",
    "La vitesse sol par le triangle des vitesses, puis le temps de la branche.",
  ),
  generate(rng) {
    const tc = rng.range(5, 360, 5);
    const tas = rng.range(90, 140, 5);
    const windDir = rng.range(10, 360, 10);
    const windKt = rng.range(8, 30, 1);
    const dist = rng.range(15, 90, 1);
    const t = windTriangle(tc, tas, windDir, windKt);
    const ete = (dist / t.gs) * 60;
    const quickGs = tas - t.head;
    const wr = windText(windDir, windKt);
    return {
      prompt: tr(
        (f) =>
          `Leg of ${f.u(dist, "NM")}, true course ${f.hdg(tc)}, TAS ${f.u(tas, "kt")}, wind ${wr}. What is your ground speed, and the time for the leg?`,
        (f) =>
          `Branche de ${f.u(dist, "NM")}, route vraie ${f.hdg(tc)}, vitesse propre ${f.u(tas, "kt")}, vent ${wr}. Quelle vitesse sol, et quel temps pour la branche ?`,
      ),
      givens: [
        given("tc", L("True course", "Route vraie"), tc, "deg"),
        given("tasKt", L("TAS", "Vitesse propre"), tas, "kt"),
        given("windDir", L("Wind (true)", "Vent (vrai)"), windDir, "deg"),
        given(
          "windKt",
          L("Wind speed", "Force du vent"),
          windKt,
          "kt",
          L(wr, wr),
        ),
        given("distNm", L("Distance", "Distance"), dist, "NM"),
      ],
      answer: roundStep(ete, 0.5),
      unit: "min",
      tolerance: Math.max(1, ete * 0.04),
      answerText: tr(
        (f) => f.dur(ete),
        (f) => f.dur(ete),
      ),
      parts: [
        {
          key: "gs",
          label: L("Ground speed", "Vitesse sol"),
          answer: Math.round(t.gs),
          unit: "kt",
          tolerance: Math.max(3, Math.abs(quickGs - t.gs) + 1),
        },
      ],
      solutionSteps: [
        tr(
          (f) =>
            `Headwind component: ${f.n(windKt)} × cos(${f.n(Math.abs(wrap180(windDir - tc)))}°) = ${f.u(t.head, "kt", 1)}${t.head < 0 ? " (a tailwind)" : ""}.`,
          (f) =>
            `Vent effectif : ${f.n(windKt)} × cos(${f.n(Math.abs(wrap180(windDir - tc)))}°) = ${f.u(t.head, "kt", 1)}${t.head < 0 ? " (vent arrière)" : " de face"}.`,
        ),
        tr(
          (f) =>
            `GS ≈ TAS − headwind = ${f.n(tas)} − ${f.n(t.head, 1)} = ${f.u(quickGs, "kt")}; the exact triangle (TAS × cos WCA − headwind) gives ${f.u(t.gs, "kt")}.`,
          (f) =>
            `Vs ≈ Vp − vent effectif = ${f.n(tas)} − ${f.n(t.head, 1)} = ${f.u(quickGs, "kt")} ; le triangle exact (Vp × cos X − vent effectif) donne ${f.u(t.gs, "kt")}.`,
        ),
        tr(
          (f) =>
            `Time = ${f.n(dist)} ÷ ${f.n(t.gs)} × 60 = ${f.n(ete, 1)} min (${f.dur(ete)}).`,
          (f) =>
            `Temps = ${f.n(dist)} ÷ ${f.n(t.gs)} × 60 = ${f.n(ete, 1)} min (${f.dur(ete)}).`,
        ),
      ],
      ruleOfThumb: L(
        "GS ≈ TAS − headwind component (wind × cos angle). Time (min) = distance ÷ (GS ÷ 60).",
        "Vs ≈ Vp − vent effectif (vent × cos angle). Temps (min) = distance ÷ (Vs ÷ 60).",
      ),
      formula: L(
        "GS = TAS cos WCA − W cos(θw − TC);  t = d ÷ GS",
        "Vs = Vp cos X − V cos(θv − Rv) ; t = d ÷ Vs",
      ),
      refs: [REF.phak("ch. 16 (wind triangle, ground speed)"), REF.e6b()],
      diagram: {
        kind: "calc",
        calc: { kind: "windTriangle", course: tc, tasKt: tas, windDir, windKt },
      },
    };
  },
  check(problem, response) {
    const tc = givenNum(problem, "tc");
    const tas = givenNum(problem, "tasKt");
    const wd = givenNum(problem, "windDir");
    const wk = givenNum(problem, "windKt");
    const d = givenNum(problem, "distNm");
    const t = windTriangle(tc, tas, wd, wk);
    return checkNumeric(problem, response, {
      wrongs: [
        {
          value: (d / (tas + t.head)) * 60,
          id: "headTailSwap",
          text: L(
            "A headwind SLOWS you: subtract the headwind component from the TAS.",
            "Le vent de face vous RALENTIT : retranchez le vent effectif de la Vp.",
          ),
        },
        {
          value: (d / tas) * 60,
          id: "other",
          text: L(
            "Use the ground speed, not the TAS: the wind changes the time.",
            "Prenez la vitesse sol, pas la vitesse propre : le vent change le temps.",
          ),
        },
      ],
      partWrongs: [
        { key: "gs", value: Math.round(tas + t.head), id: "headTailSwap" },
      ],
    });
  },
});

// ================================================================== fuel and endurance
type FuelVariant = "endurance" | "required";

export const fuelEndurance: GeneratorDef = defineGenerator({
  id: "vfr.fuelEndurance",
  title: L(
    "Fuel burn, endurance and VFR reserve",
    "Consommation, autonomie et réserve VFR",
  ),
  category: "vfr",
  summary: L(
    "Endurance from usable fuel; fuel for a trip with the VFR reserve (day 30 min, night 45 min).",
    "L'autonomie à partir du carburant utilisable ; le carburant d'un vol avec la réserve VFR (jour 30 min, nuit 45 min).",
  ),
  params: [
    variantParam([
      { value: "endurance", label: L("Endurance", "Autonomie") },
      { value: "required", label: L("Fuel required", "Carburant nécessaire") },
    ]),
    rulesParam("faa"),
  ],
  generate(rng, params) {
    const variant = pickVariant<FuelVariant>(rng, params, [
      "endurance",
      "required",
    ]);
    const icao = params.rules === "icao";
    const unit = icao ? ("L" as const) : ("usgal" as const);
    const flow = icao ? rng.range(25, 40, 1) : rng.range(7, 11, 0.5);
    const refs = icao
      ? [REF.easa("NCO.OP.125 (fuel: VFR day 30 min, night 45 min)")]
      : [
          REF.cfr("91.151 (fuel requirements for flight in VFR conditions)"),
          REF.phak("ch. 16 (fuel planning)"),
        ];
    if (variant === "endurance") {
      const usable = icao ? rng.range(100, 200, 5) : rng.range(26, 53, 1);
      const endH = usable / flow;
      const endMin = endH * 60;
      return {
        prompt: tr(
          (f) =>
            `Usable fuel ${f.u(usable, unit)}, fuel flow ${f.u(flow, icao ? "lph" : "gph", icao ? 0 : 1)}. What is the endurance (minutes, no reserve)?`,
          (f) =>
            `Carburant utilisable ${f.u(usable, unit)}, consommation ${f.u(flow, icao ? "lph" : "gph", icao ? 0 : 1)}. Quelle est l'autonomie (en minutes, sans réserve) ?`,
        ),
        givens: [
          given(
            "usable",
            L("Usable fuel", "Carburant utilisable"),
            usable,
            unit,
          ),
          given(
            "flow",
            L("Fuel flow", "Consommation"),
            flow,
            icao ? "lph" : "gph",
          ),
          given("variant", L("Question", "Question"), variant),
          given("rules", L("Rules", "Réglementation"), icao ? "icao" : "faa"),
        ],
        answer: Math.round(endMin),
        unit: "min",
        tolerance: Math.max(3, endMin * 0.02),
        answerText: tr(
          (f) => f.dur(endMin),
          (f) => f.dur(endMin),
        ),
        solutionSteps: [
          tr(
            (f) =>
              `Endurance = fuel ÷ flow = ${f.n(usable)} ÷ ${f.n(flow, 1)} = ${f.n(endH, 2)} h.`,
            (f) =>
              `Autonomie = carburant ÷ consommation = ${f.n(usable)} ÷ ${f.n(flow, 1)} = ${f.n(endH, 2)} h.`,
          ),
          tr(
            (f) =>
              `× 60 = ${f.n(endMin)} min (${f.dur(endMin)}). The ${f.n(icao ? 30 : 30)}-minute day reserve leaves ${f.dur(endMin - 30)} of flight.`,
            (f) =>
              `× 60 = ${f.n(endMin)} min (${f.dur(endMin)}). La réserve de jour de 30 minutes laisse ${f.dur(endMin - 30)} de vol.`,
          ),
        ],
        ruleOfThumb: L(
          "Endurance (h) = usable fuel ÷ fuel flow; the decimal × 60 gives the minutes (0.5 h = 30 min).",
          "Autonomie (h) = carburant utilisable ÷ consommation ; la décimale × 60 donne les minutes (0,5 h = 30 min).",
        ),
        formula: L("t = usable ÷ FF", "t = utilisable ÷ conso"),
        refs,
      };
    }
    const night = rng.chance(0.3);
    const trip = rng.range(40, 180, 5);
    const reserveMin = night ? 45 : 30;
    const taxi = icao ? 4 : 1;
    const need = taxi + (flow * (trip + reserveMin)) / 60;
    const step = icao ? 1 : 0.5;
    return {
      prompt: tr(
        (f) =>
          `VFR ${night ? "night" : "day"} flight of ${f.dur(trip)} at ${f.u(flow, icao ? "lph" : "gph", icao ? 0 : 1)}, ${f.u(taxi, unit)} for taxi. What is the minimum fuel at engine start, with the ${icao ? "EASA" : "FAA"} reserve?`,
        (f) =>
          `Vol VFR de ${night ? "nuit" : "jour"} de ${f.dur(trip)} à ${f.u(flow, icao ? "lph" : "gph", icao ? 0 : 1)}, ${f.u(taxi, unit)} pour le roulage. Quel carburant minimum à la mise en route, avec la réserve ${icao ? "EASA" : "FAA"} ?`,
      ),
      givens: [
        given("tripMin", L("Flight time", "Temps de vol"), trip, "min"),
        given(
          "flow",
          L("Fuel flow", "Consommation"),
          flow,
          icao ? "lph" : "gph",
        ),
        given("taxi", L("Taxi", "Roulage"), taxi, unit),
        given("night", L("Night", "Nuit"), night ? "yes" : "no"),
        given("variant", L("Question", "Question"), variant),
        given("rules", L("Rules", "Réglementation"), icao ? "icao" : "faa"),
      ],
      answer: ceilStep(need, step),
      unit,
      tolerance: Math.max(step, need * 0.03),
      parts: [
        {
          key: "reserve",
          label: L("Reserve", "Réserve"),
          answer: roundStep((flow * reserveMin) / 60, step),
          unit,
          tolerance: Math.max(step, ((flow * reserveMin) / 60) * 0.03),
        },
      ],
      solutionSteps: [
        tr(
          (f) =>
            `Trip: ${f.n(trip)} ÷ 60 × ${f.n(flow, 1)} = ${f.u((flow * trip) / 60, unit, 1)}.`,
          (f) =>
            `Étape : ${f.n(trip)} ÷ 60 × ${f.n(flow, 1)} = ${f.u((flow * trip) / 60, unit, 1)}.`,
        ),
        tr(
          (f) =>
            `Reserve (${night ? "night" : "day"}): ${reserveMin} min = ${f.u((flow * reserveMin) / 60, unit, 1)}.`,
          (f) =>
            `Réserve (${night ? "nuit" : "jour"}) : ${reserveMin} min = ${f.u((flow * reserveMin) / 60, unit, 1)}.`,
        ),
        tr(
          (f) =>
            `Total with taxi: ${f.u(need, unit, 1)}; round up: ${f.u(ceilStep(need, step), unit, icao ? 0 : 1)}.`,
          (f) =>
            `Total avec le roulage : ${f.u(need, unit, 1)} ; arrondi au-dessus : ${f.u(ceilStep(need, step), unit, icao ? 0 : 1)}.`,
        ),
      ],
      ruleOfThumb: L(
        "VFR reserve: 30 min by day, 45 min at night, at normal cruise. Plan to land with it untouched.",
        "Réserve VFR : 30 min de jour, 45 min de nuit, en croisière normale. Prévoyez d'atterrir sans l'entamer.",
      ),
      formula: L(
        "F = taxi + FF × (t trip + t reserve)",
        "F = roulage + conso × (t étape + t réserve)",
      ),
      refs,
    };
  },
  check(problem, response) {
    const variant = givenStr(problem, "variant") as FuelVariant;
    const flow = givenNum(problem, "flow");
    if (variant === "endurance") {
      const u = givenNum(problem, "usable");
      return checkNumeric(problem, response, {
        wrongs: [
          {
            value: (u / flow) * 100,
            id: "factor",
            text: L(
              "Hours have 60 minutes: 4.5 h is 4 h 30, not 4 h 50.",
              "Une heure fait 60 minutes : 4,5 h = 4 h 30, pas 4 h 50.",
            ),
          },
          {
            value: (flow / u) * 60,
            id: "other",
            text: L(
              "Endurance = fuel ÷ flow (not flow ÷ fuel).",
              "Autonomie = carburant ÷ consommation (pas l'inverse).",
            ),
          },
        ],
      });
    }
    const trip = givenNum(problem, "tripMin");
    const taxi = givenNum(problem, "taxi");
    const night = givenStr(problem, "night") === "yes";
    return checkNumeric(problem, response, {
      wrongs: [
        { value: taxi + (flow * trip) / 60, id: "reserve" },
        {
          value: taxi + (flow * (trip + (night ? 30 : 45))) / 60,
          id: "reserve",
          text: night
            ? L(
                "At night the VFR reserve is 45 minutes.",
                "De nuit, la réserve VFR est de 45 minutes.",
              )
            : L(
                "By day the VFR reserve is 30 minutes (45 at night).",
                "De jour, la réserve VFR est de 30 minutes (45 de nuit).",
              ),
        },
      ],
      noFactor: true,
    });
  },
});

export const NAVLOG_GENERATORS = [tvmdc, groundSpeedEte, fuelEndurance];
export { bracket };
