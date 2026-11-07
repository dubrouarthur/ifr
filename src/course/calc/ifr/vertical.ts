// Calc engine — IFR vertical planning: gradients, descent rate, top of descent, VDP, climb gradient.
import type { CalcPart, GeneratorDef } from "../../types";
import {
  checkNumeric,
  givenNum,
  givenStr,
  hasGiven,
  type Wrong,
} from "../check";
import {
  angleFromFtPerNm,
  ftPerNmFromAngle,
  ftPerNmFromPct,
  pctFromFtPerNm,
  vsForGradient,
} from "../maths";
import { L, tr } from "../text";
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

/** inbound to ARD on R-270 (heading 090): NAV1 on ARD, OBS 090, so the CDI is centred with a TO flag */
const INBOUND_ARD = {
  radios: { nav1: TRAINING.vor.freq, obs1: 90, cdi: "NAV1" as const },
};

const THREE_DEG_FT_PER_NM = ftPerNmFromAngle(3); // 318.4

// ================================================================== gradient ↔ % ↔ angle
type GradVariant = "angleToFtNm" | "ftNmToPct" | "pctToFtNm" | "ftNmToAngle";

export const descentGradient: GeneratorDef = defineGenerator({
  id: "ifr.descentGradient",
  title: L("Gradients: ft/NM, % and degrees", "Pentes : ft/NM, % et degrés"),
  category: "ifr",
  summary: L(
    "Convert a path angle to ft/NM, ft/NM to % and back: 3° ≈ 318 ft/NM ≈ 5.2 %.",
    "Convertir un angle en ft/NM, des ft/NM en % et inversement : 3° ≈ 318 ft/NM ≈ 5,2 %.",
  ),
  params: [
    variantParam([
      { value: "angleToFtNm", label: L("Angle → ft/NM", "Angle → ft/NM") },
      { value: "ftNmToPct", label: L("ft/NM → %", "ft/NM → %") },
      { value: "pctToFtNm", label: L("% → ft/NM", "% → ft/NM") },
      { value: "ftNmToAngle", label: L("ft/NM → angle", "ft/NM → angle") },
    ]),
  ],
  generate(rng, params) {
    const variant = pickVariant<GradVariant>(rng, params, [
      "angleToFtNm",
      "ftNmToPct",
      "pctToFtNm",
      "ftNmToAngle",
    ]);
    const common = {
      ruleOfThumb: L(
        "1° ≈ 100 ft/NM (106 exact): 3° ≈ 318 ft/NM. ft/NM ÷ 60 ≈ % (200 ft/NM ≈ 3.3 %).",
        "1° ≈ 100 ft/NM (106 exact) : 3° ≈ 318 ft/NM. ft/NM ÷ 60 ≈ % (200 ft/NM ≈ 3,3 %).",
      ),
      formula: L(
        "ft/NM = 6 076 × tan(angle);  % = ft/NM ÷ 6 076 × 100",
        "ft/NM = 6 076 × tan(angle) ; % = ft/NM ÷ 6 076 × 100",
      ),
      refs: [
        REF.ifh("ch. 10 (descent planning, gradients)"),
        REF.aim("5-2-9 (climb gradients, ft/NM)"),
        REF.pansOps("Vol I (gradients in %)"),
      ],
    };
    const v = [given("variant", L("Question", "Question"), variant)];
    if (variant === "angleToFtNm") {
      const a = rng.pick([2.5, 2.75, 2.8, 3, 3, 3, 3.1, 3.2, 3.5, 3.77, 4]);
      const exact = ftPerNmFromAngle(a);
      const rule = a * 106;
      return {
        ...common,
        prompt: tr(
          (f) => `A ${f.n(a, 2)}° path: how many feet per nautical mile?`,
          (f) => `Une pente de ${f.n(a, 2)}° : combien de pieds par nautique ?`,
        ),
        givens: [
          given("angle", L("Path angle", "Angle de pente"), a, "deg"),
          ...v,
        ],
        answer: Math.round(exact),
        unit: "ftPerNm",
        tolerance: bracket(a * 100, exact, 8, 2),
        exact: Math.round(exact),
        solutionSteps: [
          tr(
            (f) =>
              `Each degree is about 106 ft/NM (6 076 ft × tan 1°): ${f.n(a, 2)} × 106 ≈ ${f.n(rule)} ft/NM.`,
            (f) =>
              `Chaque degré vaut environ 106 ft/NM (6 076 ft × tan 1°) : ${f.n(a, 2)} × 106 ≈ ${f.n(rule)} ft/NM.`,
          ),
          tr(
            (f) =>
              `Exact: 6 076 × tan ${f.n(a, 2)}° = ${f.u(exact, "ftPerNm")}. The round "× 100" gives ${f.n(a * 100)}: a little shallow.`,
            (f) =>
              `Exact : 6 076 × tan ${f.n(a, 2)}° = ${f.u(exact, "ftPerNm")}. Le « × 100 » donne ${f.n(a * 100)} : un peu faible.`,
          ),
        ],
        diagram: {
          kind: "calc",
          calc: {
            kind: "profile",
            fromFt: 3000,
            toFt: 0,
            angleDeg: a,
            ftPerNm: Math.round(exact),
          },
        },
      };
    }
    if (variant === "ftNmToPct" || variant === "ftNmToAngle") {
      const isPct = variant === "ftNmToPct";
      // a published departure requirement is never below the standard 200 ft/NM (FAA) / 3.3 % (PANS-OPS PDG);
      // lower values only as a descent
      const g = isPct ? rng.range(210, 500, 10) : rng.range(150, 500, 10);
      const pct = pctFromFtPerNm(g);
      const ang = angleFromFtPerNm(g);
      return {
        ...common,
        prompt: isPct
          ? tr(
              (f) =>
                `A departure requires ${f.u(g, "ftPerNm")}. What is that in percent?`,
              (f) =>
                `Un départ exige ${f.u(g, "ftPerNm")}. Combien en pourcentage ?`,
            )
          : tr(
              (f) =>
                `A descent of ${f.u(g, "ftPerNm")}: what path angle is that?`,
              (f) =>
                `Une descente de ${f.u(g, "ftPerNm")} : quel angle de pente ?`,
            ),
        givens: [given("ftPerNm", L("Gradient", "Pente"), g, "ftPerNm"), ...v],
        answer: isPct ? roundStep(pct, 0.1) : roundStep(ang, 0.1),
        unit: isPct ? "pct" : "deg",
        tolerance: isPct
          ? bracket(g / 60, pct, 0.1, 0.05)
          : bracket(g / 106, ang, 0.1, 0.05),
        exact: isPct ? roundStep(pct, 0.01) : roundStep(ang, 0.01),
        solutionSteps: isPct
          ? [
              tr(
                (f) =>
                  `% = ft/NM ÷ 6 076 × 100 ≈ ft/NM ÷ 60.8 = ${f.n(g)} ÷ 60.8 = ${f.n(pct, 2)} %.`,
                (f) =>
                  `% = ft/NM ÷ 6 076 × 100 ≈ ft/NM ÷ 60,8 = ${f.n(g)} ÷ 60,8 = ${f.n(pct, 2)} %.`,
              ),
              tr(
                (f) =>
                  `Mental check: ÷ 60 gives ${f.n(g / 60, 1)} %. The standard 200 ft/NM is 3.3 %.`,
                (f) =>
                  `Contrôle mental : ÷ 60 donne ${f.n(g / 60, 1)} %. Le standard 200 ft/NM vaut 3,3 %.`,
              ),
            ]
          : [
              tr(
                (f) => `angle = atan(${f.n(g)} ÷ 6 076) = ${f.n(ang, 2)}°.`,
                (f) => `angle = atan(${f.n(g)} ÷ 6 076) = ${f.n(ang, 2)}°.`,
              ),
              tr(
                (f) =>
                  `Mental check: ÷ 106 per degree gives ${f.n(g / 106, 1)}°; 318 ft/NM is 3°.`,
                (f) =>
                  `Contrôle mental : ÷ 106 par degré donne ${f.n(g / 106, 1)}° ; 318 ft/NM font 3°.`,
              ),
            ],
        diagram: {
          kind: "calc",
          calc: {
            kind: "profile",
            fromFt: 3000,
            toFt: 0,
            ftPerNm: g,
            angleDeg: roundStep(ang, 0.1),
          },
        },
      };
    }
    // at or above the PANS-OPS procedure design gradient of 3.3 %
    const p = rng.range(3.3, 8, 0.1);
    const g = ftPerNmFromPct(p);
    return {
      ...common,
      prompt: tr(
        (f) =>
          `A SID requires a climb gradient of ${f.n(p, 1)} %. What is that in ft/NM?`,
        (f) =>
          `Un SID exige une pente de montée de ${f.n(p, 1)} %. Combien en ft/NM ?`,
      ),
      givens: [given("pct", L("Gradient", "Pente"), p, "pct"), ...v],
      answer: Math.round(g),
      unit: "ftPerNm",
      tolerance: bracket(p * 60, g, 5, 2),
      exact: Math.round(g),
      solutionSteps: [
        tr(
          (f) =>
            `ft/NM = % × 6 076 ÷ 100 = ${f.n(p, 1)} × 60.76 = ${f.u(g, "ftPerNm")}.`,
          (f) =>
            `ft/NM = % × 6 076 ÷ 100 = ${f.n(p, 1)} × 60,76 = ${f.u(g, "ftPerNm")}.`,
        ),
        tr(
          (f) => `Mental check: × 60 gives ${f.n(p * 60)} ft/NM.`,
          (f) => `Contrôle mental : × 60 donne ${f.n(p * 60)} ft/NM.`,
        ),
      ],
      diagram: {
        kind: "calc",
        calc: {
          kind: "profile",
          fromFt: 0,
          toFt: 3000,
          ftPerNm: Math.round(g),
        },
      },
    };
  },
  check(problem, response) {
    const variant = givenStr(problem, "variant") as GradVariant;
    const wrongs: Wrong[] = [];
    if (variant === "ftNmToPct") {
      const g = givenNum(problem, "ftPerNm");
      wrongs.push({
        value: g / 100,
        id: "factor",
        text: L(
          "ft/NM is not a percentage: divide by 60.8 (6 076 ft per NM ÷ 100).",
          "Les ft/NM ne sont pas des % : divisez par 60,8 (6 076 ft par NM ÷ 100).",
        ),
      });
    }
    if (variant === "ftNmToAngle") {
      const g = givenNum(problem, "ftPerNm");
      wrongs.push({
        value: pctFromFtPerNm(g),
        id: "unit",
        text: L(
          "That is the gradient in %. The angle is about ft/NM ÷ 106.",
          "C'est la pente en %. L'angle vaut environ ft/NM ÷ 106.",
        ),
      });
    }
    return checkNumeric(problem, response, { wrongs });
  },
});

// ================================================================== descent rate
export function descentVs(
  gsKt: number,
  angleDeg: number,
): { exact: number; rule: number } {
  return {
    exact: vsForGradient(gsKt, ftPerNmFromAngle(angleDeg)),
    rule: (gsKt * 5 * angleDeg) / 3,
  };
}

export const descentRate: GeneratorDef = defineGenerator({
  id: "ifr.descentRate",
  title: L("Descent rate for a path", "Vario pour une pente"),
  category: "ifr",
  summary: L(
    "VS ≈ GS × 5 on a 3° path; VS = GS × ft/NM ÷ 60 in general.",
    "Vz ≈ Vs × 5 sur 3° ; Vz = Vs × ft/NM ÷ 60 en général.",
  ),
  params: [
    variantParam([
      { value: "angle", label: L("Glide path angle", "Angle de plan") },
      { value: "gradient", label: L("Gradient in ft/NM", "Pente en ft/NM") },
    ]),
    {
      key: "gsKt",
      label: L("Ground speed", "Vitesse sol"),
      kind: "range",
      default: [80, 160],
      min: 60,
      max: 250,
      step: 5,
      unit: "kt",
    },
  ],
  generate(rng, params) {
    const variant = pickVariant(rng, params, [
      "angle",
      "angle",
      "gradient",
    ] as const);
    const gr = Array.isArray(params.gsKt) ? params.gsKt : [80, 160];
    const gs = rng.range(Math.min(gr[0], gr[1]), Math.max(gr[0], gr[1]), 5);
    if (variant === "gradient") {
      const g = rng.range(200, 400, 10);
      const vs = vsForGradient(gs, g);
      return {
        prompt: tr(
          (f) =>
            `The STAR asks for ${f.u(g, "ftPerNm")}. At ${f.u(gs, "kt")} ground speed, what descent rate?`,
          (f) =>
            `La STAR demande ${f.u(g, "ftPerNm")}. À ${f.u(gs, "kt")} de vitesse sol, quel taux de descente ?`,
        ),
        givens: [
          given("gsKt", L("Ground speed", "Vitesse sol"), gs, "kt"),
          given("ftPerNm", L("Gradient", "Pente"), g, "ftPerNm"),
          given("variant", L("Question", "Question"), "gradient"),
        ],
        answer: roundStep(vs, 10),
        unit: "fpm",
        tolerance: Math.max(30, vs * 0.04),
        solutionSteps: [
          tr(
            (f) => `NM per minute = GS ÷ 60 = ${f.n(gs / 60, 2)}.`,
            (f) => `NM par minute = Vs ÷ 60 = ${f.n(gs / 60, 2)}.`,
          ),
          tr(
            (f) =>
              `VS = ${f.n(gs / 60, 2)} × ${f.n(g)} = ${f.u(vs, "fpm")}, about ${f.u(roundStep(vs, 50), "fpm")}.`,
            (f) =>
              `Vz = ${f.n(gs / 60, 2)} × ${f.n(g)} = ${f.u(vs, "fpm")}, environ ${f.u(roundStep(vs, 50), "fpm")}.`,
          ),
        ],
        ruleOfThumb: L(
          "VS = NM per minute × ft/NM (GS ÷ 60 × gradient).",
          "Vz = NM par minute × ft/NM (Vs ÷ 60 × pente).",
        ),
        formula: L(
          "VS (ft/min) = GS (kt) × gradient (ft/NM) ÷ 60",
          "Vz (ft/min) = Vs (kt) × pente (ft/NM) ÷ 60",
        ),
        refs: [REF.ifh("ch. 10 (descent planning)")],
        diagram: {
          kind: "calc",
          calc: {
            kind: "profile",
            fromFt: 8000,
            toFt: 3000,
            ftPerNm: g,
            gsKt: gs,
          },
        },
        stage: vsStage(gs, vs),
      };
    }
    const a = rng.pick([3, 3, 3, 3, 2.75, 3.2, 3.5]);
    const { exact, rule } = descentVs(gs, a);
    return {
      prompt: tr(
        (f) =>
          `On a ${f.n(a, 2)}° glide path at ${f.u(gs, "kt")} ground speed, what descent rate do you set?`,
        (f) =>
          `Sur un plan de ${f.n(a, 2)}° à ${f.u(gs, "kt")} de vitesse sol, quel taux de descente affichez-vous ?`,
      ),
      givens: [
        given("gsKt", L("Ground speed", "Vitesse sol"), gs, "kt"),
        given("angle", L("Glide path", "Plan de descente"), a, "deg"),
        given("variant", L("Question", "Question"), "angle"),
      ],
      answer: roundStep(exact, 10),
      unit: "fpm",
      tolerance: bracket(rule, exact, 30, 15),
      exact: roundStep(exact, 1),
      answerText: tr(
        (f) => `about ${f.u(roundStep(exact, 50), "fpm")}`,
        (f) => `environ ${f.u(roundStep(exact, 50), "fpm")}`,
      ),
      solutionSteps: [
        tr(
          (f) =>
            a === 3
              ? `3° path: VS ≈ GS × 5 = ${f.n(gs)} × 5 = ${f.u(rule, "fpm")}.`
              : `VS ≈ GS × 5 × angle ÷ 3 = ${f.n(gs)} × 5 × ${f.n(a, 2)} ÷ 3 = ${f.u(rule, "fpm")}.`,
          (f) =>
            a === 3
              ? `Plan de 3° : Vz ≈ Vs × 5 = ${f.n(gs)} × 5 = ${f.u(rule, "fpm")}.`
              : `Vz ≈ Vs × 5 × angle ÷ 3 = ${f.n(gs)} × 5 × ${f.n(a, 2)} ÷ 3 = ${f.u(rule, "fpm")}.`,
        ),
        tr(
          (f) =>
            `Exact: ${f.n(a, 2)}° = ${f.n(ftPerNmFromAngle(a))} ft/NM; × GS ÷ 60 = ${f.u(exact, "fpm")}.`,
          (f) =>
            `Exact : ${f.n(a, 2)}° = ${f.n(ftPerNmFromAngle(a))} ft/NM ; × Vs ÷ 60 = ${f.u(exact, "fpm")}.`,
        ),
        tr(
          () =>
            `The approach chart's rate-of-descent table gives the same figures. Fly the glide slope; the VS is your cross-check.`,
          () =>
            `Le tableau de taux de descente de la carte donne les mêmes valeurs. Suivez le glide ; la Vz est votre contrôle.`,
        ),
      ],
      ruleOfThumb: L(
        "3° path: VS ≈ GS × 5 (half the ground speed × 10).",
        "Plan de 3° : Vz ≈ Vs × 5 (la moitié de la vitesse sol × 10).",
      ),
      formula: L(
        "VS = GS × 6 076 × tan(angle) ÷ 60  (3°: VS = 5.31 × GS)",
        "Vz = Vs × 6 076 × tan(angle) ÷ 60  (3° : Vz = 5,31 × Vs)",
      ),
      refs: [
        REF.ifh("ch. 10 (ILS: rate of descent)"),
        REF.aim("1-1-9 (ILS glide slope)"),
      ],
      diagram: {
        kind: "calc",
        calc: { kind: "profile", fromFt: 2000, toFt: 0, angleDeg: a, gsKt: gs },
      },
      stage: vsStage(gs, exact),
    };
  },
  check(problem, response) {
    const gs = givenNum(problem, "gsKt");
    return checkNumeric(problem, response, {
      wrongs: [
        {
          value: gs * 10,
          id: "factor",
          text: L(
            "× 10 is too steep. On 3° use GS × 5 (half the GS, × 10).",
            "× 10, c'est trop raide. Sur 3°, Vz = Vs × 5 (la moitié de la Vs, × 10).",
          ),
        },
        {
          value: hasGiven(problem, "ftPerNm")
            ? givenNum(problem, "ftPerNm") * gs
            : NaN,
          id: "factor",
          text: L(
            "Use NM per MINUTE: GS ÷ 60, then × ft/NM.",
            "Prenez des NM par MINUTE : Vs ÷ 60, puis × ft/NM.",
          ),
        },
      ],
    });
  },
});

/** The live stage flies a trainer (≤ 105 KIAS): the IAS that gives the problem's ground speed at that altitude (no
 *  wind, TAS ≈ IAS + 2 % per 1,000 ft), and the ground speed it really flies when the problem's is out of reach. */
export function stageSpeed(gs: number, altFt: number): { ias: number; stageGs: number; same: boolean } {
  const k = 1 + (0.02 * altFt) / 1000;
  const ias = Math.round(Math.max(80, Math.min(105, gs / k)));
  const stageGs = Math.round(ias * k);
  return { ias, stageGs, same: Math.abs(stageGs - gs) <= 5 };
}

/** the VS to hold on the stage for the problem's PATH: scaled to the stage's own ground speed */
function stageVs(gs: number, vs: number, altFt: number) {
  const sp = stageSpeed(gs, altFt);
  const target = roundStep(sp.same ? vs : (vs * sp.stageGs) / gs, 50);
  const doThis = sp.same
    ? tr(
        (f) => `Pitch down to hold ${f.u(target, "fpm")} down (±100), speed constant.`,
        (f) => `Réduisez l'assiette pour tenir ${f.u(target, "fpm")} en descente (±100), vitesse constante.`,
      )
    : tr(
        (f) =>
          `The trainer on the stage flies about ${f.u(sp.stageGs, "kt")} over the ground, not ${f.u(gs, "kt")}: for the same path, VS = ${f.n(vs)} × ${f.n(sp.stageGs)} ÷ ${f.n(gs)} ≈ ${f.u(target, "fpm")}. Pitch down to hold it (±100), speed constant.`,
        (f) =>
          `L'avion d'entraînement de la scène vole à environ ${f.u(sp.stageGs, "kt")} sol, pas ${f.u(gs, "kt")} : pour la même pente, Vz = ${f.n(vs)} × ${f.n(sp.stageGs)} ÷ ${f.n(gs)} ≈ ${f.u(target, "fpm")}. Réduisez l'assiette pour la tenir (±100), vitesse constante.`,
      );
  return { ias: sp.ias, target, doThis };
}

function vsStage(gs: number, vs: number) {
  const v = stageVs(gs, vs, 5000);
  return {
    panes: [{ kind: "pfd" }] as [{ kind: "pfd" }],
    pose: poseOnRadial(270, 12, 5000, 90, v.ias, { vsFpm: 0, ...INBOUND_ARD }),
    weather: { windKt: 0, turbulence: 0 },
    mode: "live" as const,
    controls: ["pitch", "power"] as ("pitch" | "power")[],
    assist: { holdIas: true },
    goals: [
      {
        id: "vsBand" as const,
        p: { min: -(v.target + 100), max: -(v.target - 100) },
      },
    ],
    doThis: [v.doThis],
  };
}

// ================================================================== top of descent
type TodVariant = "gradient" | "vs";

export function solveTod(
  fromFt: number,
  toFt: number,
  gsKt: number,
  vsFpm?: number,
): {
  lose: number;
  ruleNm: number;
  exactNm: number;
  vs3: number;
  timeMin?: number;
} {
  const lose = fromFt - toFt;
  if (vsFpm) {
    const t = lose / vsFpm;
    const nm = (gsKt * t) / 60;
    return {
      lose,
      ruleNm: nm,
      exactNm: nm,
      vs3: descentVs(gsKt, 3).exact,
      timeMin: t,
    };
  }
  return {
    lose,
    ruleNm: (lose / 1000) * 3,
    exactNm: lose / THREE_DEG_FT_PER_NM,
    vs3: descentVs(gsKt, 3).exact,
  };
}

export const topOfDescent: GeneratorDef = defineGenerator({
  id: "ifr.topOfDescent",
  title: L("Top of descent", "Point de début de descente"),
  category: "ifr",
  alsoIn: ["vfr"],
  summary: L(
    "Where to start down: 3 NM per 1,000 ft on 3°, or time × GS at a chosen rate.",
    "Où commencer la descente : 3 NM par 1 000 ft sur 3°, ou temps × Vs à un vario choisi.",
  ),
  params: [
    variantParam([
      {
        value: "gradient",
        label: L(
          "3° path (3 NM per 1,000 ft)",
          "Pente de 3° (3 NM par 1 000 ft)",
        ),
      },
      { value: "vs", label: L("Chosen descent rate", "Vario choisi") },
    ]),
  ],
  generate(rng, params) {
    const variant = pickVariant<TodVariant>(rng, params, ["gradient", "vs"]);
    const fromFt = rng.range(6000, 12000, 500);
    const toFt = rng.range(2000, Math.min(5000, fromFt - 3000), 500);
    const gs = rng.range(110, 170, 10);
    const fix = rng.pick(["ARD", "MSV", "DELTA", "KILO"]);
    const vs = variant === "vs" ? rng.range(500, 1000, 100) : undefined;
    const s = solveTod(fromFt, toFt, gs, vs);
    const answer =
      variant === "vs" ? roundStep(s.exactNm, 0.5) : Math.round(s.ruleNm);
    const givens = [
      given(
        "fromFt",
        L("Cruise altitude", "Altitude de croisière"),
        fromFt,
        "ft",
      ),
      given("toFt", L("Crossing altitude", "Altitude de passage"), toFt, "ft"),
      given("gsKt", L("Ground speed", "Vitesse sol"), gs, "kt"),
      given("fix", L("Fix", "Point"), fix),
      given("variant", L("Question", "Question"), variant),
    ];
    if (vs) givens.push(given("vsFpm", L("Descent rate", "Vario"), vs, "fpm"));
    const parts: CalcPart[] =
      variant === "gradient"
        ? [
            {
              key: "vs",
              label: L(
                "Descent rate on the 3° path",
                "Vario sur la pente de 3°",
              ),
              answer: roundStep(s.vs3, 10),
              unit: "fpm",
              tolerance: bracket(gs * 5, s.vs3, 30, 15),
            },
          ]
        : [
            {
              key: "time",
              label: L("Time to descend", "Durée de la descente"),
              answer: roundStep(s.timeMin!, 0.5),
              unit: "min",
              tolerance: 0.5,
            },
          ];
    return {
      prompt:
        variant === "gradient"
          ? tr(
              (f) =>
                `Cruising at ${f.u(fromFt, "ft")}, ${f.u(gs, "kt")} ground speed, you must cross ${fix} at ${f.u(toFt, "ft")} on a 3° path. How far before ${fix} do you start down, and at what rate?`,
              (f) =>
                `En croisière à ${f.u(fromFt, "ft")}, ${f.u(gs, "kt")} de vitesse sol, vous devez passer ${fix} à ${f.u(toFt, "ft")} sur une pente de 3°. À quelle distance avant ${fix} commencez-vous la descente, et à quel vario ?`,
            )
          : tr(
              (f) =>
                `Cruising at ${f.u(fromFt, "ft")}, ${f.u(gs, "kt")} ground speed, cross ${fix} at ${f.u(toFt, "ft")} descending at ${f.u(vs!, "fpm")}. How far before ${fix} do you start down?`,
              (f) =>
                `En croisière à ${f.u(fromFt, "ft")}, ${f.u(gs, "kt")} de vitesse sol, passez ${fix} à ${f.u(toFt, "ft")} en descendant à ${f.u(vs!, "fpm")}. À quelle distance avant ${fix} commencez-vous la descente ?`,
            ),
      givens,
      answer,
      unit: "NM",
      tolerance:
        variant === "vs"
          ? Math.max(0.5, s.exactNm * 0.04)
          : bracket(s.ruleNm, s.exactNm, 1, 0.3),
      exact: roundStep(s.exactNm, 0.1),
      parts,
      solutionSteps:
        variant === "gradient"
          ? [
              tr(
                (f) =>
                  `Altitude to lose: ${f.n(fromFt)} − ${f.n(toFt)} = ${f.u(s.lose, "ft")}.`,
                (f) =>
                  `Altitude à perdre : ${f.n(fromFt)} − ${f.n(toFt)} = ${f.u(s.lose, "ft")}.`,
              ),
              tr(
                (f) =>
                  `3° ≈ 3 NM per 1,000 ft: ${f.n(s.lose / 1000, 1)} × 3 = ${f.u(s.ruleNm, "NM")} (exact ÷ 318: ${f.n(s.exactNm, 1)}).`,
                (f) =>
                  `3° ≈ 3 NM par 1 000 ft : ${f.n(s.lose / 1000, 1)} × 3 = ${f.u(s.ruleNm, "NM")} (exact ÷ 318 : ${f.n(s.exactNm, 1)}).`,
              ),
              tr(
                (f) =>
                  `Rate: GS × 5 = ${f.u(gs * 5, "fpm")} (exact ${f.n(s.vs3)}).`,
                (f) =>
                  `Vario : Vs × 5 = ${f.u(gs * 5, "fpm")} (exact ${f.n(s.vs3)}).`,
              ),
            ]
          : [
              tr(
                (f) =>
                  `Altitude to lose: ${f.u(s.lose, "ft")}; at ${f.n(vs!)} ft/min that takes ${f.n(s.timeMin!, 1)} min.`,
                (f) =>
                  `Altitude à perdre : ${f.u(s.lose, "ft")} ; à ${f.n(vs!)} ft/min il faut ${f.n(s.timeMin!, 1)} min.`,
              ),
              tr(
                (f) =>
                  `Distance = GS × time = ${f.n(gs)} ÷ 60 × ${f.n(s.timeMin!, 1)} = ${f.u(s.exactNm, "NM", 1)}.`,
                (f) =>
                  `Distance = Vs × temps = ${f.n(gs)} ÷ 60 × ${f.n(s.timeMin!, 1)} = ${f.u(s.exactNm, "NM", 1)}.`,
              ),
            ],
      ruleOfThumb: L(
        "3 NM per 1,000 ft to lose (3° path), VS = GS × 5. Add a mile or two to slow down.",
        "3 NM par 1 000 ft à perdre (pente de 3°), Vz = Vs × 5. Ajoutez un ou deux nautiques pour décélérer.",
      ),
      formula: L(
        "distance = Δh ÷ (6 076 × tan 3°) = Δh ÷ 318;  at a rate: distance = GS × Δh ÷ VS ÷ 60",
        "distance = Δh ÷ (6 076 × tan 3°) = Δh ÷ 318 ; à un vario : distance = Vs × Δh ÷ Vz ÷ 60",
      ),
      refs: [
        REF.ifh("ch. 10 (descent planning)"),
      ],
      diagram: {
        kind: "calc",
        calc: {
          kind: "profile",
          fromFt,
          toFt,
          gsKt: gs,
          distNm: roundStep(s.exactNm, 0.1),
          ...(variant === "gradient"
            ? { angleDeg: 3 }
            : { ftPerNm: Math.round((vs! * 60) / gs) }),
          marks: [{ distNm: 0, altFt: toFt, label: fix }],
        },
      },
      stage: (() => {
        const v = stageVs(gs, vs ?? s.vs3, fromFt);
        return {
          panes: [{ kind: "pfd" as const }],
          pose: poseOnRadial(270, 25, fromFt, 90, v.ias, { vsFpm: 0, ...INBOUND_ARD }),
          weather: { windKt: 0, turbulence: 0 },
          mode: "live" as const,
          controls: ["pitch", "power", "altBug"] as ("pitch" | "power" | "altBug")[],
          assist: { holdIas: true },
          goals: [
            {
              id: "vsBand" as const,
              p: { min: -(v.target + 100), max: -(v.target - 100) },
            },
          ],
          doThis: [
            tr(
              () => `At the top of descent: ${v.doThis.en}`,
              () => `Au TOD : ${v.doThis.fr}`,
            ),
          ],
        };
      })(),
    };
  },
  check(problem, response) {
    const fromFt = givenNum(problem, "fromFt");
    const toFt = givenNum(problem, "toFt");
    const gs = givenNum(problem, "gsKt");
    const lose = fromFt - toFt;
    const variant = givenStr(problem, "variant") as TodVariant;
    const wrongs: Wrong[] = [
      {
        value: (fromFt / 1000) * 3,
        id: "other",
        text: L(
          "Use the altitude to LOSE (cruise − crossing), not the whole altitude.",
          "Prenez l'altitude à PERDRE (croisière − passage), pas toute l'altitude.",
        ),
      },
    ];
    if (variant === "vs") {
      const vs = givenNum(problem, "vsFpm");
      wrongs.push({
        value: lose / vs,
        id: "unit",
        text: L(
          "That is the time in minutes. Distance = GS ÷ 60 × time.",
          "C'est la durée en minutes. Distance = Vs ÷ 60 × durée.",
        ),
      });
      wrongs.push({
        value: (gs * lose) / vs,
        id: "factor",
        text: L(
          "GS is per hour: divide by 60 for NM per minute.",
          "La Vs est horaire : divisez par 60 pour des NM par minute.",
        ),
      });
    }
    return checkNumeric(problem, response, { wrongs, noFactor: true });
  },
});

// ================================================================== VDP
export function solveVdp(
  mdaFt: number,
  tdzeFt: number,
): { hat: number; rule: number; exact: number } {
  const hat = mdaFt - tdzeFt;
  return { hat, rule: hat / 300, exact: hat / THREE_DEG_FT_PER_NM };
}

export const vdp: GeneratorDef = defineGenerator({
  id: "ifr.vdp",
  title: L("Visual descent point", "Point de descente visuelle (VDP)"),
  category: "ifr",
  summary: L(
    "VDP = height above touchdown ÷ 300 NM from the threshold (3°).",
    "VDP = hauteur au-dessus du toucher ÷ 300, en NM du seuil (3°).",
  ),
  generate(rng) {
    const tdze = rng.range(20, 900, 10);
    const hat = rng.range(300, 700, 20);
    const mda = tdze + hat;
    const s = solveVdp(mda, tdze);
    const dmeThr = rng.chance(0.5) ? rng.range(0.3, 1.5, 0.1) : undefined;
    const answer = roundStep(s.rule, 0.1);
    const givens = [
      given("mdaFt", L("MDA", "MDA"), mda, "ft"),
      given("tdzeFt", L("TDZE", "TDZE"), tdze, "ft"),
    ];
    const parts: CalcPart[] = [];
    if (dmeThr !== undefined) {
      givens.push(
        given(
          "dmeThr",
          L("DME at the threshold", "DME au seuil"),
          dmeThr,
          "NM",
        ),
      );
      parts.push({
        key: "vdpDme",
        label: L("DME at the VDP", "DME au VDP"),
        answer: roundStep(dmeThr + s.rule, 0.1),
        unit: "NM",
        tolerance: bracket(s.rule, s.exact, 0.1, 0.05),
      });
    }
    return {
      prompt:
        dmeThr !== undefined
          ? tr(
              (f) =>
                `Non-precision approach: MDA ${f.u(mda, "ft")}, TDZE ${f.u(tdze, "ft")}. The DME reads ${f.n(dmeThr, 1)} at the threshold. How far from the threshold is your VDP, and what will the DME read there?`,
              (f) =>
                `Approche classique : MDA ${f.u(mda, "ft")}, TDZE ${f.u(tdze, "ft")}. Le DME indique ${f.n(dmeThr, 1)} au seuil. À quelle distance du seuil est votre VDP, et que lira le DME ?`,
            )
          : tr(
              (f) =>
                `Non-precision approach: MDA ${f.u(mda, "ft")}, TDZE ${f.u(tdze, "ft")}, no VDP published. How far from the threshold is your VDP?`,
              (f) =>
                `Approche classique : MDA ${f.u(mda, "ft")}, TDZE ${f.u(tdze, "ft")}, pas de VDP publié. À quelle distance du seuil est votre VDP ?`,
            ),
      givens,
      answer,
      unit: "NM",
      tolerance: bracket(s.rule, s.exact, 0.1, 0.05),
      exact: roundStep(s.exact, 0.01),
      parts: parts.length ? parts : undefined,
      solutionSteps: [
        tr(
          (f) =>
            `Height above touchdown: ${f.n(mda)} − ${f.n(tdze)} = ${f.u(s.hat, "ft")}.`,
          (f) =>
            `Hauteur au-dessus du toucher : ${f.n(mda)} − ${f.n(tdze)} = ${f.u(s.hat, "ft")}.`,
        ),
        tr(
          (f) =>
            `A 3° path drops about 300 ft per NM: ${f.n(s.hat)} ÷ 300 = ${f.u(s.rule, "NM", 1)} from the threshold (exact ÷ 318: ${f.n(s.exact, 2)}).`,
          (f) =>
            `Une pente de 3° descend d'environ 300 ft par NM : ${f.n(s.hat)} ÷ 300 = ${f.u(s.rule, "NM", 1)} du seuil (exact ÷ 318 : ${f.n(s.exact, 2)}).`,
        ),
        ...(dmeThr !== undefined
          ? [
              tr(
                (f) =>
                  `DME at the VDP = ${f.n(dmeThr, 1)} + ${f.n(s.rule, 1)} = ${f.n(dmeThr + s.rule, 1)}.`,
                (f) =>
                  `DME au VDP = ${f.n(dmeThr, 1)} + ${f.n(s.rule, 1)} = ${f.n(dmeThr + s.rule, 1)}.`,
              ),
            ]
          : []),
        tr(
          () =>
            `Do not descend below the MDA before the VDP, even with the runway in sight.`,
          () => `Ne descendez pas sous la MDA avant le VDP, même piste en vue.`,
        ),
      ],
      ruleOfThumb: L(
        "VDP (NM) = HAT ÷ 300. Or time it: HAT ÷ 10 = seconds to subtract from the FAF-to-MAP time.",
        "VDP (NM) = HAT ÷ 300. En temps : HAT ÷ 10 = secondes à retrancher au temps FAF-MAP.",
      ),
      formula: L(
        "VDP = (MDA − TDZE) ÷ (6 076 × tan 3°)",
        "VDP = (MDA − TDZE) ÷ (6 076 × tan 3°)",
      ),
      refs: [REF.aim("5-4-5 (visual descent point)"), REF.ifh("ch. 10 (VDP)")],
      diagram: {
        kind: "calc",
        calc: { kind: "vdp", mdaFt: mda, tdzeFt: tdze, vdpNm: answer },
      },
    };
  },
  check(problem, response) {
    const mda = givenNum(problem, "mdaFt");
    return checkNumeric(problem, response, {
      wrongs: [
        {
          value: mda / 300,
          id: "other",
          text: L(
            "Use the height above touchdown (MDA − TDZE), not the MDA itself.",
            "Prenez la hauteur au-dessus du toucher (MDA − TDZE), pas la MDA.",
          ),
        },
      ],
    });
  },
});

// ================================================================== climb gradient
type ClimbVariant = "required" | "achievable";

export const climbGradient: GeneratorDef = defineGenerator({
  id: "ifr.climbGradient",
  title: L("Climb gradient check", "Vérification de la pente de montée"),
  category: "ifr",
  summary: L(
    "ft/NM ↔ ft/min at a ground speed: can you make the published climb gradient?",
    "ft/NM ↔ ft/min à une vitesse sol : tenez-vous la pente publiée ?",
  ),
  params: [
    variantParam([
      { value: "required", label: L("Rate required", "Vario nécessaire") },
      { value: "achievable", label: L("Gradient achieved", "Pente obtenue") },
    ]),
    rulesParam("faa"),
  ],
  generate(rng, params) {
    const variant = pickVariant<ClimbVariant>(rng, params, [
      "required",
      "achievable",
    ]);
    const icao = params.rules === "icao";
    const gs = rng.range(70, 130, 5);
    const roc = rng.range(500, 900, 50);
    const reqFtNm = icao ? undefined : rng.range(250, 500, 10);
    const reqPct = icao ? rng.range(3.3, 7.5, 0.1) : undefined;
    const req = reqFtNm ?? ftPerNmFromPct(reqPct!);
    const needFpm = vsForGradient(gs, req);
    const achieved = (roc * 60) / gs;
    const can = achieved >= req ? "yes" : "no";
    const reqText = tr(
      (f) => (icao ? `${f.n(reqPct!, 1)} %` : f.u(reqFtNm!, "ftPerNm")),
      (f) => (icao ? `${f.n(reqPct!, 1)} %` : f.u(reqFtNm!, "ftPerNm")),
    );
    const givens = [
      given("gsKt", L("Climb ground speed", "Vitesse sol en montée"), gs, "kt"),
      given(
        "reqFtNm",
        L("Required gradient", "Pente exigée"),
        Math.round(req * 10) / 10,
        "ftPerNm",
        reqText,
      ),
      given(
        "rocFpm",
        L("Your climb rate", "Votre vario de montée"),
        roc,
        "fpm",
      ),
      given("variant", L("Question", "Question"), variant),
    ];
    const choice = [
      { value: "yes", label: L("Yes", "Oui") },
      { value: "no", label: L("No", "Non") },
    ];
    const common = {
      givens,
      parts: [
        {
          key: "can",
          label: L("Can you make it?", "Pouvez-vous la tenir ?"),
          answer: can,
          choices: choice,
        },
      ] as CalcPart[],
      ruleOfThumb: L(
        "ft/min = ft/NM × GS ÷ 60 (NM per minute × feet per NM). 200 ft/NM ≈ 3.3 %.",
        "ft/min = ft/NM × Vs ÷ 60 (NM par minute × pieds par NM). 200 ft/NM ≈ 3,3 %.",
      ),
      formula: L(
        "ROC (ft/min) = gradient (ft/NM) × GS (kt) ÷ 60;  ft/NM = % × 60.76",
        "Vz (ft/min) = pente (ft/NM) × Vs (kt) ÷ 60 ; ft/NM = % × 60,76",
      ),
      refs: [
        REF.aim("5-2-9 (departure procedures: climb gradients)"),
        REF.pansOps("Vol I (PDG 3.3 %)"),
        REF.ifh("ch. 10 (departures)"),
      ],
      diagram: {
        kind: "calc" as const,
        calc: {
          kind: "profile" as const,
          fromFt: 0,
          toFt: 3000,
          ftPerNm: Math.round(req),
          gsKt: gs,
        },
      },
    };
    const pctStep = icao
      ? [
          tr(
            (f) => `${f.n(reqPct!, 1)} % × 60.76 = ${f.u(req, "ftPerNm")}.`,
            (f) => `${f.n(reqPct!, 1)} % × 60,76 = ${f.u(req, "ftPerNm")}.`,
          ),
        ]
      : [];
    if (variant === "required") {
      return {
        ...common,
        prompt: tr(
          (f) =>
            `The departure requires ${reqText.en} to 3,000 ft. Your climb ground speed is ${f.u(gs, "kt")} and the aircraft climbs at ${f.u(roc, "fpm")}. What rate of climb is required, and can you make it?`,
          (f) =>
            `Le départ exige ${reqText.fr} jusqu'à 3 000 ft. Votre vitesse sol en montée est ${f.u(gs, "kt")} et l'avion monte à ${f.u(roc, "fpm")}. Quel vario faut-il, et pouvez-vous le tenir ?`,
        ),
        answer: roundStep(needFpm, 10),
        unit: "fpm",
        tolerance: Math.max(20, needFpm * 0.03),
        solutionSteps: [
          ...pctStep,
          tr(
            (f) =>
              `NM per minute = ${f.n(gs)} ÷ 60 = ${f.n(gs / 60, 2)}; × ${f.n(req)} ft/NM = ${f.u(needFpm, "fpm")}.`,
            (f) =>
              `NM par minute = ${f.n(gs)} ÷ 60 = ${f.n(gs / 60, 2)} ; × ${f.n(req)} ft/NM = ${f.u(needFpm, "fpm")}.`,
          ),
          tr(
            (f) =>
              can === "yes"
                ? `${f.n(roc)} ft/min ≥ ${f.n(needFpm)}: yes, with ${f.n(roc - needFpm)} ft/min to spare.`
                : `${f.n(roc)} ft/min < ${f.n(needFpm)}: no. Ask for another departure, wait for a lighter load or cooler air.`,
            (f) =>
              can === "yes"
                ? `${f.n(roc)} ft/min ≥ ${f.n(needFpm)} : oui, avec ${f.n(roc - needFpm)} ft/min de marge.`
                : `${f.n(roc)} ft/min < ${f.n(needFpm)} : non. Demandez un autre départ, allégez ou attendez un air plus frais.`,
          ),
        ],
      };
    }
    return {
      ...common,
      prompt: tr(
        (f) =>
          `You climb at ${f.u(roc, "fpm")} with a ground speed of ${f.u(gs, "kt")}. What gradient (ft/NM) is that, and does it meet the ${reqText.en} required?`,
        (f) =>
          `Vous montez à ${f.u(roc, "fpm")} avec une vitesse sol de ${f.u(gs, "kt")}. Quelle pente (ft/NM) cela fait-il, et cela satisfait-il les ${reqText.fr} exigés ?`,
      ),
      answer: Math.round(achieved),
      unit: "ftPerNm",
      tolerance: Math.max(5, achieved * 0.03),
      solutionSteps: [
        ...pctStep,
        tr(
          (f) =>
            `ft/NM = ft/min ÷ NM per minute = ${f.n(roc)} ÷ (${f.n(gs)} ÷ 60) = ${f.u(achieved, "ftPerNm")}.`,
          (f) =>
            `ft/NM = ft/min ÷ NM par minute = ${f.n(roc)} ÷ (${f.n(gs)} ÷ 60) = ${f.u(achieved, "ftPerNm")}.`,
        ),
        tr(
          (f) =>
            can === "yes"
              ? `${f.n(achieved)} ≥ ${f.n(req)} ft/NM: yes.`
              : `${f.n(achieved)} < ${f.n(req)} ft/NM: no.`,
          (f) =>
            can === "yes"
              ? `${f.n(achieved)} ≥ ${f.n(req)} ft/NM : oui.`
              : `${f.n(achieved)} < ${f.n(req)} ft/NM : non.`,
        ),
      ],
    };
  },
  check(problem, response) {
    const gs = givenNum(problem, "gsKt");
    const req = givenNum(problem, "reqFtNm");
    const roc = givenNum(problem, "rocFpm");
    const variant = givenStr(problem, "variant") as ClimbVariant;
    const wrongs: Wrong[] =
      variant === "required"
        ? [
            {
              value: req * gs,
              id: "factor",
              text: L(
                "Use NM per minute (GS ÷ 60), not per hour.",
                "Prenez des NM par minute (Vs ÷ 60), pas par heure.",
              ),
            },
            {
              value: (req * 60) / gs,
              id: "other",
              text: L(
                "Multiply by the NM per minute (GS ÷ 60): ft/NM × GS ÷ 60.",
                "Multipliez par les NM par minute (Vs ÷ 60) : ft/NM × Vs ÷ 60.",
              ),
            },
          ]
        : [
            {
              value: (roc * gs) / 60,
              id: "other",
              text: L(
                "Divide the climb rate by the NM per minute: ft/min ÷ (GS ÷ 60).",
                "Divisez le vario par les NM par minute : ft/min ÷ (Vs ÷ 60).",
              ),
            },
          ];
    return checkNumeric(problem, response, { wrongs });
  },
});

export const VERTICAL_GENERATORS = [
  descentGradient,
  descentRate,
  topOfDescent,
  vdp,
  climbGradient,
];
