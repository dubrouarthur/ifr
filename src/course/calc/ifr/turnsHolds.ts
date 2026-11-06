// Calc engine — IFR turns and holds: standard-rate bank, turn radius, hold wind correction, hold timing, holding speeds.
import type { CalcPart, GeneratorDef } from "../../types";
import { checkNumeric, givenNum, givenStr, type Wrong } from "../check";
import {
  bankForRate,
  bankRule,
  hdg360,
  norm360,
  rateAtBank,
  turnRadiusAtRateNm,
  turnRadiusNm,
  wcaRule,
  windComponents,
  windTriangle,
  wrap180,
} from "../maths";
import { L, tr, windText } from "../text";
import { roundStep } from "../units";
import {
  bracket,
  defineGenerator,
  given,
  pickVariant,
  poseOnRadial,
  REF,
  rulesParam,
  TRAINING,
  variantParam,
} from "../kit";

// ================================================================== standard-rate bank
export const standardRateBank: GeneratorDef = defineGenerator({
  id: "ifr.standardRateBank",
  title: L(
    "Bank for a standard-rate turn",
    "Inclinaison pour un virage au taux 1",
  ),
  category: "ifr",
  summary: L(
    "Bank ≈ TAS ÷ 10 + 7 for 3°/s; the exact angle from tan φ = ω V / g.",
    "Inclinaison ≈ Vp ÷ 10 + 7 pour 3°/s ; l'angle exact par tan φ = ω V / g.",
  ),
  params: [
    {
      key: "tasKt",
      label: L("True airspeed", "Vitesse propre"),
      kind: "range",
      default: [90, 180],
      min: 60,
      max: 250,
      step: 5,
      unit: "kt",
    },
  ],
  generate(rng, params) {
    const r = Array.isArray(params.tasKt) ? params.tasKt : [90, 180];
    const tas = rng.range(Math.min(r[0], r[1]), Math.max(r[0], r[1]), 5);
    const rule = bankRule(tas);
    const exact = bankForRate(tas);
    return {
      prompt: tr(
        (f) =>
          `At ${f.u(tas, "kt")} true airspeed, what bank angle gives a standard-rate turn (3°/s)?`,
        (f) =>
          `À ${f.u(tas, "kt")} de vitesse propre, quelle inclinaison donne un virage au taux 1 (3°/s) ?`,
      ),
      givens: [given("tasKt", L("TAS", "Vitesse propre"), tas, "kt")],
      answer: Math.round(rule),
      unit: "deg",
      tolerance: bracket(rule, exact, 2, 0.5),
      exact: roundStep(exact, 0.1),
      solutionSteps: [
        tr(
          (f) =>
            `Rule of thumb: TAS ÷ 10 + 7 = ${f.n(tas / 10, 1)} + 7 = ${f.n(rule, 1)}°.`,
          (f) =>
            `Règle pratique : Vp ÷ 10 + 7 = ${f.n(tas / 10, 1)} + 7 = ${f.n(rule, 1)}°.`,
        ),
        tr(
          (f) =>
            `Exact: tan φ = ω V ÷ g, with ω = 3°/s = 0.0524 rad/s and V = ${f.n(tas)} kt = ${f.n(tas * 0.5144, 1)} m/s: φ = ${f.n(exact, 1)}°.`,
          (f) =>
            `Exact : tan φ = ω V ÷ g, avec ω = 3°/s = 0,0524 rad/s et V = ${f.n(tas)} kt = ${f.n(tas * 0.5144, 1)} m/s : φ = ${f.n(exact, 1)}°.`,
        ),
        tr(
          () =>
            `Set the bank, then fine-tune on the turn coordinator or turn-rate trend. Do not exceed 30° in IMC turns at higher speeds.`,
          () =>
            `Prenez l'inclinaison, puis ajustez à l'indicateur de virage ou à la tendance. Pas plus de 30° en IMC aux vitesses élevées.`,
        ),
      ],
      ruleOfThumb: L(
        "Bank ≈ TAS ÷ 10 + 7 (or 15 % of TAS).",
        "Inclinaison ≈ Vp ÷ 10 + 7 (ou 15 % de la Vp).",
      ),
      formula: L(
        "tan φ = ω · V ÷ g   (ω = 3°/s)",
        "tan φ = ω · V ÷ g   (ω = 3°/s)",
      ),
      refs: [
        REF.ifh("ch. 3 (rate of turn, standard rate)"),
        REF.ifh("ch. 6 (turns: TAS/10 + 7)"),
      ],
      diagram: {
        kind: "calc",
        calc: { kind: "turn", tasKt: tas, bankDeg: Math.round(exact) },
      },
      stage: {
        panes: [{ kind: "pfd" }],
        pose: poseOnRadial(90, 15, 3000, 360, Math.round(tas / 1.05)),
        weather: { windKt: 0, turbulence: 0 },
        mode: "live",
        controls: ["bank"],
        assist: { holdAlt: true, holdIas: true },
        doThis: [
          tr(
            (f) =>
              `Roll into ${f.n(rule)}° of bank and watch the turn-rate trend reach the standard-rate mark.`,
            (f) =>
              `Inclinez à ${f.n(rule)}° et regardez la tendance de virage atteindre le repère du taux 1.`,
          ),
        ],
      },
    };
  },
  check(problem, response) {
    const tas = givenNum(problem, "tasKt");
    return checkNumeric(problem, response, {
      wrongs: [
        {
          value: tas / 10,
          id: "other",
          text: L(
            "Do not forget the + 7: bank ≈ TAS ÷ 10 + 7.",
            "N'oubliez pas le + 7 : inclinaison ≈ Vp ÷ 10 + 7.",
          ),
        },
        {
          value: tas / 10 + 70,
          id: "factor",
          text: L(
            "TAS ÷ 10, then add 7 (not 70).",
            "Vp ÷ 10, puis ajoutez 7 (pas 70).",
          ),
        },
      ],
      noFactor: true,
    });
  },
});

// ================================================================== turn radius
type RadiusVariant = "stdRate" | "bank";

export const turnRadius: GeneratorDef = defineGenerator({
  id: "ifr.turnRadius",
  title: L("Turn radius", "Rayon de virage"),
  category: "ifr",
  summary: L(
    "Standard rate: r ≈ TAS ÷ 200 NM. At a bank angle: r = V² ÷ (g tan φ).",
    "Au taux 1 : r ≈ Vp ÷ 200 NM. À une inclinaison : r = V² ÷ (g tan φ).",
  ),
  params: [
    variantParam([
      { value: "stdRate", label: L("Standard rate", "Taux 1") },
      { value: "bank", label: L("Given bank angle", "Inclinaison donnée") },
    ]),
  ],
  generate(rng, params) {
    const variant = pickVariant<RadiusVariant>(rng, params, [
      "stdRate",
      "bank",
    ]);
    const tas = rng.range(90, 180, 10);
    const refs = [REF.ifh("ch. 3 (radius of turn)"), REF.afh("ch. 3 (turns)")];
    if (variant === "stdRate") {
      const rule = tas / 200;
      const exact = turnRadiusAtRateNm(tas);
      return {
        prompt: tr(
          (f) =>
            `What is the radius of a standard-rate turn at ${f.u(tas, "kt")} TAS (no wind)?`,
          (f) =>
            `Quel est le rayon d'un virage au taux 1 à ${f.u(tas, "kt")} de vitesse propre (sans vent) ?`,
        ),
        givens: [
          given("tasKt", L("TAS", "Vitesse propre"), tas, "kt"),
          given("variant", L("Question", "Question"), variant),
        ],
        answer: roundStep(rule, 0.05),
        unit: "NM",
        tolerance: bracket(rule, exact, 0.05, 0.03),
        exact: roundStep(exact, 0.01),
        parts: [
          {
            key: "diameter",
            label: L("Diameter", "Diamètre"),
            answer: roundStep(2 * rule, 0.1),
            unit: "NM",
            tolerance: bracket(2 * rule, 2 * exact, 0.1, 0.05),
          },
        ],
        solutionSteps: [
          tr(
            (f) =>
              `A standard-rate 360° takes 2 minutes: the circumference is ${f.n(tas)} × 2 ÷ 60 = ${f.u(tas / 30, "NM", 2)}.`,
            (f) =>
              `Un 360° au taux 1 dure 2 minutes : la circonférence fait ${f.n(tas)} × 2 ÷ 60 = ${f.u(tas / 30, "NM", 2)}.`,
          ),
          tr(
            (f) =>
              `r = circumference ÷ 2π = ${f.n(exact, 2)} NM; the rule TAS ÷ 200 gives ${f.n(rule, 2)} NM.`,
            (f) =>
              `r = circonférence ÷ 2π = ${f.n(exact, 2)} NM ; la règle Vp ÷ 200 donne ${f.n(rule, 2)} NM.`,
          ),
          tr(
            (f) => `Diameter ≈ 1 % of the TAS: ${f.u(2 * rule, "NM", 1)}.`,
            (f) => `Diamètre ≈ 1 % de la Vp : ${f.u(2 * rule, "NM", 1)}.`,
          ),
        ],
        ruleOfThumb: L(
          "Standard-rate radius ≈ TAS ÷ 200 NM; the diameter is about 1 % of the TAS.",
          "Rayon au taux 1 ≈ Vp ÷ 200 NM ; le diamètre fait environ 1 % de la Vp.",
        ),
        formula: L(
          "r = V ÷ ω = TAS ÷ (60 π) NM at 3°/s",
          "r = V ÷ ω = Vp ÷ (60 π) NM à 3°/s",
        ),
        refs,
        diagram: {
          kind: "calc",
          calc: {
            kind: "turn",
            tasKt: tas,
            bankDeg: Math.round(bankForRate(tas)),
          },
        },
      };
    }
    const bank = rng.pick([15, 20, 25, 30, 45]);
    const r = turnRadiusNm(tas, bank);
    const rate = rateAtBank(tas, bank);
    const rFt = r * 6076.12;
    return {
      prompt: tr(
        (f) =>
          `At ${f.u(tas, "kt")} TAS and ${bank}° of bank, what is the turn radius (NM) and the rate of turn?`,
        (f) =>
          `À ${f.u(tas, "kt")} de vitesse propre et ${bank}° d'inclinaison, quel est le rayon de virage (NM) et le taux de virage ?`,
      ),
      givens: [
        given("tasKt", L("TAS", "Vitesse propre"), tas, "kt"),
        given("bank", L("Bank", "Inclinaison"), bank, "deg"),
        given("variant", L("Question", "Question"), variant),
      ],
      answer: roundStep(r, 0.01),
      unit: "NM",
      tolerance: Math.max(0.03, r * 0.05),
      parts: [
        {
          key: "rate",
          label: L("Rate of turn (°/s)", "Taux de virage (°/s)"),
          answer: roundStep(rate, 0.1),
          unit: "none",
          tolerance: Math.max(0.2, rate * 0.05),
        },
      ],
      solutionSteps: [
        tr(
          (f) =>
            `r (ft) = TAS² ÷ (11.26 × tan φ) = ${f.n(tas)}² ÷ (11.26 × ${f.n(Math.tan((bank * Math.PI) / 180), 3)}) = ${f.u(rFt, "ft")}.`,
          (f) =>
            `r (ft) = Vp² ÷ (11,26 × tan φ) = ${f.n(tas)}² ÷ (11,26 × ${f.n(Math.tan((bank * Math.PI) / 180), 3)}) = ${f.u(rFt, "ft")}.`,
        ),
        tr(
          (f) => `÷ 6 076 = ${f.u(r, "NM", 2)}.`,
          (f) => `÷ 6 076 = ${f.u(r, "NM", 2)}.`,
        ),
        tr(
          (f) =>
            `Rate (°/s) = 1 091 × tan φ ÷ TAS = ${f.n(rate, 1)}°/s${rate > 3 ? " (faster than standard rate)" : rate < 3 ? " (slower than standard rate)" : ""}.`,
          (f) =>
            `Taux (°/s) = 1 091 × tan φ ÷ Vp = ${f.n(rate, 1)}°/s${rate > 3 ? " (plus que le taux 1)" : rate < 3 ? " (moins que le taux 1)" : ""}.`,
        ),
      ],
      ruleOfThumb: L(
        "Radius grows with the square of the speed: twice the speed, four times the radius.",
        "Le rayon croît comme le carré de la vitesse : vitesse doublée, rayon ×4.",
      ),
      formula: L(
        "r = V² ÷ (g tan φ)  (ft: TAS² ÷ 11.26 tan φ);  rate = 1 091 tan φ ÷ TAS",
        "r = V² ÷ (g tan φ)  (ft : Vp² ÷ 11,26 tan φ) ; taux = 1 091 tan φ ÷ Vp",
      ),
      refs,
      diagram: {
        kind: "calc",
        calc: { kind: "turn", tasKt: tas, bankDeg: bank },
      },
    };
  },
  check(problem, response) {
    const tas = givenNum(problem, "tasKt");
    const variant = givenStr(problem, "variant") as RadiusVariant;
    const wrongs: Wrong[] =
      variant === "stdRate"
        ? [
            {
              value: tas / 100,
              id: "other",
              text: L(
                "TAS ÷ 100 is the diameter. The radius is half: TAS ÷ 200.",
                "Vp ÷ 100 donne le diamètre. Le rayon en est la moitié : Vp ÷ 200.",
              ),
            },
          ]
        : [
            {
              value:
                (tas * tas) /
                (11.26 * Math.tan((givenNum(problem, "bank") * Math.PI) / 180)),
              id: "unit",
              text: L(
                "That is the radius in feet. Divide by 6 076 for NM.",
                "C'est le rayon en pieds. Divisez par 6 076 pour des NM.",
              ),
            },
          ];
    return checkNumeric(problem, response, { wrongs });
  },
});

// ================================================================== hold: wind correction
export function solveHoldWind(
  inbound: number,
  tasKt: number,
  windDir: number,
  windKt: number,
): {
  wcaExact: number;
  wcaRule: number;
  inboundHdg: number;
  outboundHdg: number;
  outboundHdgExact: number;
  cross: number;
  head: number;
} {
  const t = windTriangle(inbound, tasKt, windDir, windKt);
  const rule = wcaRule(t.cross, tasKt);
  return {
    wcaExact: t.wca,
    wcaRule: rule,
    inboundHdg: norm360(inbound + rule),
    outboundHdg: norm360(inbound + 180 - 3 * rule),
    outboundHdgExact: norm360(inbound + 180 - 3 * t.wca),
    cross: t.cross,
    head: t.head,
  };
}

export const holdWind: GeneratorDef = defineGenerator({
  id: "ifr.holdWind",
  title: L(
    "Hold: wind correction outbound",
    "Attente : correction de dérive en éloignement",
  ),
  category: "ifr",
  summary: L(
    "The inbound WCA from the wind, tripled outbound.",
    "La dérive du rapprochement à partir du vent, triplée en éloignement.",
  ),
  generate(rng) {
    const inbound = rng.range(10, 360, 5);
    const tas = rng.range(90, 140, 10);
    const turn = rng.pick(["R", "R", "L"] as const);
    // a crosswind of 6–14 kt, so 3 × WCA stays under ~25°
    let windDir = 0;
    let windKt = 0;
    for (let i = 0; i < 20; i++) {
      windDir = rng.range(10, 360, 10);
      windKt = rng.range(10, 30, 5);
      const c = Math.abs(windComponents(inbound, windDir, windKt).cross);
      if (c >= 6 && c <= 14 && 3 * wcaRule(c, tas) <= 26) break;
    }
    const s = solveHoldWind(inbound, tas, windDir, windKt);
    const outbound = norm360(inbound + 180);
    const answer = hdg360(s.outboundHdg);
    const fromRight = s.cross > 0;
    return {
      prompt: tr(
        (f) =>
          `Holding at ARD, inbound course ${f.hdg(inbound)}, ${turn === "R" ? "right" : "left"} turns, ${f.u(tas, "kt")} TAS, wind ${windText(windDir, windKt)}. What heading do you fly inbound, and outbound?`,
        (f) =>
          `Attente à ARD, rapprochement ${f.hdg(inbound)}, virages à ${turn === "R" ? "droite" : "gauche"}, ${f.u(tas, "kt")} de vitesse propre, vent ${windText(windDir, windKt)}. Quel cap en rapprochement, et en éloignement ?`,
      ),
      givens: [
        given(
          "inbound",
          L("Inbound course", "Route de rapprochement"),
          inbound,
          "deg",
        ),
        given(
          "turn",
          L("Turns", "Virages"),
          turn,
          undefined,
          L(
            turn === "R" ? "right" : "left",
            turn === "R" ? "à droite" : "à gauche",
          ),
        ),
        given("tasKt", L("TAS", "Vitesse propre"), tas, "kt"),
        given(
          "windDir",
          L("Wind direction", "Direction du vent"),
          windDir,
          "deg",
        ),
        given(
          "windKt",
          L("Wind speed", "Force du vent"),
          windKt,
          "kt",
          L(windText(windDir, windKt), windText(windDir, windKt)),
        ),
      ],
      answer,
      unit: "deg",
      tolerance: Math.max(
        3,
        Math.abs(wrap180(s.outboundHdg - s.outboundHdgExact)) + 1,
      ),
      exact: hdg360(s.outboundHdgExact),
      parts: [
        {
          key: "inboundHdg",
          label: L("Inbound heading", "Cap en rapprochement"),
          answer: hdg360(s.inboundHdg),
          unit: "deg",
          tolerance: Math.max(2, Math.abs(s.wcaRule - s.wcaExact) + 1),
        },
      ],
      solutionSteps: [
        tr(
          (f) =>
            `Crosswind on the inbound course: ${f.n(windKt)} × sin(${f.n(Math.abs(wrap180(windDir - inbound)))}°) = ${f.u(Math.abs(s.cross), "kt", 1)} from the ${fromRight ? "right" : "left"}.`,
          (f) =>
            `Vent traversier sur le rapprochement : ${f.n(windKt)} × sin(${f.n(Math.abs(wrap180(windDir - inbound)))}°) = ${f.u(Math.abs(s.cross), "kt", 1)} de ${fromRight ? "droite" : "gauche"}.`,
        ),
        tr(
          (f) =>
            `Inbound WCA ≈ crosswind × 60 ÷ TAS = ${f.n(Math.abs(s.cross), 1)} × 60 ÷ ${f.n(tas)} = ${f.n(Math.abs(s.wcaRule), 1)}° into the wind: inbound heading ${f.hdg(s.inboundHdg)}.`,
          (f) =>
            `Dérive au rapprochement ≈ traversier × 60 ÷ Vp = ${f.n(Math.abs(s.cross), 1)} × 60 ÷ ${f.n(tas)} = ${f.n(Math.abs(s.wcaRule), 1)}° face au vent : cap ${f.hdg(s.inboundHdg)}.`,
        ),
        tr(
          (f) =>
            `Outbound, the wind is on the other side of the course: correct into it, three times as much (${f.n(3 * Math.abs(s.wcaRule), 1)}°) to make up for the turns: outbound course ${f.hdg(outbound)}, heading ${f.hdg(answer)}.`,
          (f) =>
            `En éloignement, le vent est de l'autre côté de la route : corrigez face au vent, trois fois plus (${f.n(3 * Math.abs(s.wcaRule), 1)}°) pour compenser les virages : route ${f.hdg(outbound)}, cap ${f.hdg(answer)}.`,
        ),
        tr(
          () =>
            `Check the next inbound leg and refine: if you still need a big correction inbound, adjust the outbound heading.`,
          () =>
            `Contrôlez le rapprochement suivant et affinez : s'il faut encore beaucoup corriger, ajustez le cap d'éloignement.`,
        ),
      ],
      ruleOfThumb: L(
        "Outbound: triple the inbound wind correction, into the wind (WCA ≈ crosswind × 60 ÷ TAS).",
        "En éloignement : triplez la correction du rapprochement, face au vent (dérive ≈ traversier × 60 ÷ Vp).",
      ),
      formula: L(
        "WCA = asin(crosswind ÷ TAS);  HDG out = outbound course − 3 × WCA in",
        "X = asin(traversier ÷ Vp) ; Cap éloignement = route éloignement − 3 × X rapprochement",
      ),
      refs: [
        REF.ifh("ch. 10 (holding: drift correction, triple outbound)"),
        REF.aim("5-3-8 (holding)"),
      ],
      diagram: {
        kind: "calc",
        calc: {
          kind: "holdWind",
          inbound,
          turn,
          windDir,
          windKt,
          tasKt: tas,
          outboundS: 60,
        },
      },
      stage: {
        panes: [{ kind: "pfd" }],
        pose: poseOnRadial(
          norm360(inbound + 180),
          6,
          5000,
          inbound,
          Math.round(tas / 1.08),
          {
            radios: {
              nav1: TRAINING.vor.freq,
              obs1: hdg360(inbound),
              cdi: "NAV1",
            },
          },
        ),
        weather: {
          windDir,
          windKt,
          turbulence: 0,
          aloft: [{ altFt: 5000, dir: windDir, kt: windKt }],
        },
        mode: "live",
        controls: ["hdgBug"],
        assist: { holdAlt: true, holdIas: true },
        goals: [{ id: "track", p: { value: hdg360(inbound), tol: 3 } }],
        doThis: [
          tr(
            (f) =>
              `Fly heading ${f.hdg(s.inboundHdg)} and check the track stays on ${f.hdg(inbound)}.`,
            (f) =>
              `Volez au cap ${f.hdg(s.inboundHdg)} et vérifiez que la route reste ${f.hdg(inbound)}.`,
          ),
        ],
      },
    };
  },
  check(problem, response) {
    const inbound = givenNum(problem, "inbound");
    const s = solveHoldWind(
      inbound,
      givenNum(problem, "tasKt"),
      givenNum(problem, "windDir"),
      givenNum(problem, "windKt"),
    );
    const out = inbound + 180;
    return checkNumeric(problem, response, {
      wrongs: [
        { value: out - s.wcaRule, id: "notTripled" },
        {
          value: out + 3 * s.wcaRule,
          id: "wrongSide",
          text: L(
            "Outbound, the wind is on the other side of the course: correct toward the wind, so the correction changes sign.",
            "En éloignement, le vent est de l'autre côté de la route : on corrige vers le vent, la correction change donc de signe.",
          ),
        },
        {
          value: out + s.wcaRule,
          id: "wrongSide",
          text: L(
            "Correct into the wind, and triple it outbound.",
            "Corrigez face au vent, et triplez en éloignement.",
          ),
        },
        {
          value: s.inboundHdg,
          id: "reciprocal",
          text: L(
            "That is the inbound heading. The outbound leg is the reciprocal course with three times the correction.",
            "C'est le cap de rapprochement. L'éloignement suit la route inverse avec trois fois la correction.",
          ),
        },
      ],
      partWrongs: [
        {
          key: "inboundHdg",
          value: hdg360(inbound - s.wcaRule),
          id: "wcaSign",
        },
      ],
    });
  },
});

// ================================================================== hold: timing
type TimingVariant = "observed" | "wind";

export function holdOutboundSeconds(
  tasKt: number,
  headwindInboundKt: number,
  legS = 60,
): { exact: number; rule: number } {
  const v = tasKt;
  const h = headwindInboundKt;
  return { exact: (legS * (v - h)) / (v + h), rule: legS - (2 * legS * h) / v };
}

export const holdTiming: GeneratorDef = defineGenerator({
  id: "ifr.holdTiming",
  title: L("Hold: outbound timing", "Attente : chronométrage de l'éloignement"),
  category: "ifr",
  summary: L(
    "The outbound time that gives a 1-minute inbound leg.",
    "Le temps d'éloignement qui donne une branche de rapprochement d'une minute.",
  ),
  params: [
    variantParam([
      {
        value: "observed",
        label: L("From the inbound time", "D'après le temps de rapprochement"),
      },
      { value: "wind", label: L("From the wind", "D'après le vent") },
    ]),
  ],
  generate(rng, params) {
    const variant = pickVariant<TimingVariant>(rng, params, [
      "observed",
      "wind",
    ]);
    const refs = [
      REF.aim("5-3-8 (holding: 1 min at or below 14,000 ft MSL, 1½ min above)"),
      REF.ifh("ch. 10 (holding: timing)"),
    ];
    const rule = L(
      "Change the outbound time by the inbound error, the other way: 1:15 inbound → 0:45 outbound.",
      "Corrigez l'éloignement de l'écart du rapprochement, en sens inverse : 1 min 15 en rapprochement → 45 s en éloignement.",
    );
    if (variant === "observed") {
      const longer = rng.chance(0.6);
      const tin = longer ? rng.range(65, 85, 5) : rng.range(40, 55, 5);
      const ruleS = 120 - tin;
      const exactS = 3600 / tin;
      return {
        prompt: tr(
          (f) =>
            `You flew 1:00 outbound and the inbound leg took ${f.sec(tin)}. What outbound time do you fly next, to get a 1:00 inbound leg?`,
          (f) =>
            `Vous avez volé 1 min en éloignement et le rapprochement a duré ${f.sec(tin)}. Quel temps d'éloignement au tour suivant pour un rapprochement d'une minute ?`,
        ),
        givens: [
          given(
            "inboundS",
            L("Inbound leg time", "Temps de rapprochement"),
            tin,
            "s",
          ),
          given("variant", L("Question", "Question"), variant),
        ],
        answer: ruleS,
        unit: "s",
        tolerance: bracket(ruleS, exactS, 5, 1),
        exact: Math.round(exactS),
        solutionSteps: [
          tr(
            (f) =>
              `The inbound leg was ${f.n(Math.abs(tin - 60))} s ${tin > 60 ? "too long: a headwind inbound, a tailwind outbound" : "too short: a tailwind inbound, a headwind outbound"}.`,
            (f) =>
              `Le rapprochement a duré ${f.n(Math.abs(tin - 60))} s de ${tin > 60 ? "trop : vent de face en rapprochement, arrière en éloignement" : "moins : vent arrière en rapprochement, de face en éloignement"}.`,
          ),
          tr(
            (f) =>
              `${tin > 60 ? "Shorten" : "Lengthen"} the outbound by that much: 60 ${tin > 60 ? "−" : "+"} ${f.n(Math.abs(tin - 60))} = ${f.sec(ruleS)}.`,
            (f) =>
              `${tin > 60 ? "Raccourcissez" : "Allongez"} l'éloignement d'autant : 60 ${tin > 60 ? "−" : "+"} ${f.n(Math.abs(tin - 60))} = ${f.sec(ruleS)}.`,
          ),
          tr(
            (f) =>
              `Same distance both ways: the exact time is 60 × 60 ÷ ${f.n(tin)} = ${f.n(exactS)} s (turns ignored). Refine on the next lap.`,
            (f) =>
              `Même distance dans les deux sens : le temps exact vaut 60 × 60 ÷ ${f.n(tin)} = ${f.n(exactS)} s (virages négligés). Affinez au tour suivant.`,
          ),
        ],
        ruleOfThumb: rule,
        formula: L(
          "t out = t in target² ÷ t in observed = 3 600 ÷ t in (s), the legs being the same length",
          "t éloignement = 3 600 ÷ t rapprochement observé (s), à longueur de branche égale",
        ),
        refs,
      };
    }
    const tas = rng.range(90, 140, 10);
    const h = (rng.chance(0.65) ? 1 : -1) * rng.range(8, 25, 1);
    const { exact, rule: ruleS } = holdOutboundSeconds(tas, h);
    const ans = Math.round(exact);
    return {
      prompt: tr(
        (f) =>
          `In the hold at ${f.u(tas, "kt")} TAS, you have a ${f.u(Math.abs(h), "kt")} ${h > 0 ? "headwind" : "tailwind"} on the inbound leg. What outbound time gives a 1:00 inbound leg?`,
        (f) =>
          `En attente à ${f.u(tas, "kt")} de vitesse propre, vous avez ${f.u(Math.abs(h), "kt")} de vent ${h > 0 ? "de face" : "arrière"} en rapprochement. Quel temps d'éloignement pour un rapprochement d'une minute ?`,
      ),
      givens: [
        given("tasKt", L("TAS", "Vitesse propre"), tas, "kt"),
        given(
          "headKt",
          L(
            "Headwind inbound (− = tailwind)",
            "Vent de face au rapprochement (− = arrière)",
          ),
          h,
          "kt",
        ),
        given("variant", L("Question", "Question"), variant),
      ],
      answer: ans,
      unit: "s",
      tolerance: bracket(ruleS, exact, 4, 1),
      exact: ans,
      solutionSteps: [
        tr(
          (f) =>
            `Inbound GS = ${f.n(tas)} ${h > 0 ? "−" : "+"} ${f.n(Math.abs(h))} = ${f.u(tas - h, "kt")}; outbound GS = ${f.u(tas + h, "kt")}.`,
          (f) =>
            `Vs rapprochement = ${f.n(tas)} ${h > 0 ? "−" : "+"} ${f.n(Math.abs(h))} = ${f.u(tas - h, "kt")} ; Vs éloignement = ${f.u(tas + h, "kt")}.`,
        ),
        tr(
          (f) =>
            `A 1:00 inbound leg is ${f.n((tas - h) / 60, 2)} NM long; outbound that takes 60 × ${f.n(tas - h)} ÷ ${f.n(tas + h)} = ${f.sec(exact)}.`,
          (f) =>
            `Un rapprochement d'une minute fait ${f.n((tas - h) / 60, 2)} NM ; en éloignement il faut 60 × ${f.n(tas - h)} ÷ ${f.n(tas + h)} = ${f.sec(exact)}.`,
        ),
        tr(
          (f) =>
            `Quick estimate: each knot changes the outbound time by about 120 ÷ TAS = ${f.n(120 / tas, 1)} s: ${f.sec(ruleS)}.`,
          (f) =>
            `Estimation rapide : chaque nœud change l'éloignement d'environ 120 ÷ Vp = ${f.n(120 / tas, 1)} s : ${f.sec(ruleS)}.`,
        ),
      ],
      ruleOfThumb: L(
        "Each knot of wind along the legs changes the outbound time by about 120 ÷ TAS seconds (≈ 1 s per kt at 120 kt).",
        "Chaque nœud de vent dans l'axe change l'éloignement d'environ 120 ÷ Vp secondes (≈ 1 s par nœud à 120 kt).",
      ),
      formula: L(
        "t out = 60 × (TAS − headwind) ÷ (TAS + headwind)",
        "t éloignement = 60 × (Vp − vent de face) ÷ (Vp + vent de face)",
      ),
      refs,
    };
  },
  check(problem, response) {
    const variant = givenStr(problem, "variant") as TimingVariant;
    if (variant === "observed") {
      const tin = givenNum(problem, "inboundS");
      return checkNumeric(problem, response, {
        wrongs: [
          {
            value: tin,
            id: "wrongSide",
            text: L(
              "Change the outbound time the OTHER way: a long inbound leg needs a shorter outbound.",
              "Corrigez l'éloignement en sens INVERSE : un rapprochement trop long demande un éloignement plus court.",
            ),
          },
          {
            value: 60 - 2 * (tin - 60),
            id: "other",
            text: L(
              "Change the outbound time by the inbound error once, not twice.",
              "Corrigez l'éloignement une fois de l'écart, pas deux.",
            ),
          },
        ],
        noFactor: true,
      });
    }
    const tas = givenNum(problem, "tasKt");
    const h = givenNum(problem, "headKt");
    return checkNumeric(problem, response, {
      wrongs: [
        {
          value: holdOutboundSeconds(tas, -h).exact,
          id: "headTailSwap",
          text: L(
            "Headwind inbound means tailwind outbound: the outbound leg is shorter in time.",
            "Vent de face en rapprochement = vent arrière en éloignement : l'éloignement dure moins.",
          ),
        },
      ],
      noFactor: true,
    });
  },
});

// ================================================================== holding speeds
export function maxHoldingSpeed(altFt: number, rules: "faa" | "icao"): number {
  if (rules === "faa") return altFt <= 6000 ? 200 : altFt <= 14000 ? 230 : 265;
  return altFt <= 14000 ? 230 : altFt <= 20000 ? 240 : 265;
}

export const holdSpeed: GeneratorDef = defineGenerator({
  id: "ifr.holdSpeed",
  title: L("Maximum holding speed", "Vitesse maximale en attente"),
  category: "ifr",
  summary: L(
    "FAA (AIM 5-3-8) and ICAO (PANS-OPS) maximum holding speeds by altitude band.",
    "Vitesses maximales en attente FAA (AIM 5-3-8) et OACI (PANS-OPS) par tranche d'altitude.",
  ),
  params: [rulesParam("faa")],
  generate(rng, params) {
    const rules = params.rules === "icao" ? "icao" : "faa";
    const alt = rng.pick([
      3000, 4000, 5000, 6000, 7000, 9000, 11000, 13000, 14000, 15000, 17000,
      19000, 21000, 25000, 31000,
    ]);
    const v = maxHoldingSpeed(alt, rules);
    const altText = tr(
      (f) => (alt >= 18000 ? `FL${alt / 100}` : f.u(alt, "ft")),
      (f) => (alt >= 18000 ? `FL${alt / 100}` : f.u(alt, "ft")),
    );
    const faa = rules === "faa";
    const parts: CalcPart[] = [];
    return {
      prompt: tr(
        () =>
          `${faa ? "FAA" : "ICAO"} rules: what is the maximum holding speed at ${altText.en}?`,
        () =>
          `Règles ${faa ? "FAA" : "OACI"} : quelle est la vitesse maximale en attente à ${altText.fr} ?`,
      ),
      givens: [
        given(
          "altFt",
          L("Holding altitude", "Altitude d'attente"),
          alt,
          "ft",
          altText,
        ),
        given("rules", L("Rules", "Réglementation"), rules),
      ],
      answer: v,
      unit: "kt",
      tolerance: 0,
      answerText: tr(
        (f) => `${f.n(v)} KIAS`,
        (f) => `${f.n(v)} kt IAS`,
      ),
      parts: parts.length ? parts : undefined,
      solutionSteps: faa
        ? [
            tr(
              () =>
                `FAA (AIM 5-3-8): up to 6,000 ft MSL 200 KIAS; 6,001–14,000 ft 230 KIAS; 14,001 ft and above 265 KIAS.`,
              () =>
                `FAA (AIM 5-3-8) : jusqu'à 6 000 ft MSL 200 kt IAS ; de 6 001 à 14 000 ft 230 kt ; 14 001 ft et au-dessus 265 kt.`,
            ),
            tr(
              (f) =>
                `At ${altText.en}: ${f.n(v)} KIAS. A speed icon on the chart (210 or 175 KIAS) restricts it further.`,
              (f) =>
                `À ${altText.fr} : ${f.n(v)} kt. Une icône de vitesse sur la carte (210 ou 175 kt) le restreint encore.`,
            ),
          ]
        : [
            tr(
              () =>
                `ICAO (PANS-OPS): up to 14,000 ft 230 kt; above 14,000 to 20,000 ft 240 kt; above 20,000 to 34,000 ft 265 kt; above, M0.83.`,
              () =>
                `OACI (PANS-OPS) : jusqu'à 14 000 ft 230 kt ; au-dessus de 14 000 et jusqu'à 20 000 ft 240 kt ; jusqu'à 34 000 ft 265 kt ; au-dessus, M0,83.`,
            ),
            tr(
              (f) =>
                `At ${altText.en}: ${f.n(v)} kt IAS. In turbulence up to 280 kt (170 kt for Cat A/B) with ATC told.`,
              (f) =>
                `À ${altText.fr} : ${f.n(v)} kt IAS. En turbulence jusqu'à 280 kt (170 kt pour les cat. A/B), ATC prévenu.`,
            ),
          ],
      ruleOfThumb: faa
        ? L(
            "FAA: 200 / 230 / 265 — 6,000 and 14,000 ft are the breaks.",
            "FAA : 200 / 230 / 265 — coupures à 6 000 et 14 000 ft.",
          )
        : L(
            "ICAO: 230 / 240 / 265 — 14,000 and 20,000 ft are the breaks.",
            "OACI : 230 / 240 / 265 — coupures à 14 000 et 20 000 ft.",
          ),
      formula: faa
        ? L(
            "≤ 6,000 ft: 200 KIAS · 6,001–14,000: 230 · ≥ 14,001: 265",
            "≤ 6 000 ft : 200 kt · 6 001–14 000 : 230 · ≥ 14 001 : 265",
          )
        : L(
            "≤ 14,000 ft: 230 kt · ≤ 20,000: 240 · ≤ 34,000: 265 · above: M0.83",
            "≤ 14 000 ft : 230 kt · ≤ 20 000 : 240 · ≤ 34 000 : 265 · au-dessus : M0,83",
          ),
      refs: faa
        ? [REF.aim("5-3-8 (holding: maximum holding airspeeds)")]
        : [REF.pansOps("Vol I Part II Section 4 ch. 1 (holding speeds)")],
    };
  },
  check(problem, response) {
    const alt = givenNum(problem, "altFt");
    const rules = givenStr(problem, "rules") === "icao" ? "icao" : "faa";
    const other = maxHoldingSpeed(alt, rules === "faa" ? "icao" : "faa");
    return checkNumeric(problem, response, {
      wrongs: [
        {
          value: other,
          id: "other",
          text:
            rules === "faa"
              ? L(
                  "That is the ICAO figure. FAA: 200 KIAS to 6,000 ft, 230 to 14,000 ft, 265 above.",
                  "C'est la valeur OACI. FAA : 200 kt jusqu'à 6 000 ft, 230 jusqu'à 14 000 ft, 265 au-dessus.",
                )
              : L(
                  "That is the FAA figure. ICAO: 230 kt to 14,000 ft, 240 to 20,000 ft, 265 to 34,000 ft.",
                  "C'est la valeur FAA. OACI : 230 kt jusqu'à 14 000 ft, 240 jusqu'à 20 000 ft, 265 jusqu'à 34 000 ft.",
                ),
        },
      ],
      noFactor: true,
    });
  },
});

export const TURN_HOLD_GENERATORS = [
  standardRateBank,
  turnRadius,
  holdWind,
  holdTiming,
  holdSpeed,
];
