// Calc engine — IFR navigation: 60:1, DME arc lead, intercept lead, ADF bearings, VOR radial / TO-FROM.
import type { CalcProblem, GeneratorDef } from "../../types";
import {
  checkNumeric,
  givenNum,
  givenStr,
  type PartWrong,
  type Wrong,
} from "../check";
import {
  arcToRadialLeadExact,
  arcToRadialLeadRule,
  hdg360,
  interceptLeadNm,
  norm360,
  radialToArcStartExact,
  trackErrorExact,
  trackErrorRule,
  turnRadiusAtRateNm,
  wrap180,
} from "../maths";
import { L, tr } from "../text";
import { roundStep } from "../units";
import {
  bracket,
  defineGenerator,
  given,
  pickVariant,
  poseOnRadial,
  rangeOf,
  REF,
  TRAINING,
  variantParam,
} from "../kit";

// ================================================================== 60:1
type SixtyVariant = "trackError" | "regain" | "direct";
const SIXTY_VARIANTS: readonly SixtyVariant[] = [
  "trackError",
  "regain",
  "direct",
];

/** The 60:1 solution (rule and exact). side: +1 = right of course, −1 = left. */
export function solveSixtyToOne(
  course: number,
  flownNm: number,
  offNm: number,
  side: 1 | -1,
  toGoNm: number,
): {
  teRule: number;
  teExact: number;
  closeRule: number;
  closeExact: number;
  regainHdgRule: number;
  directHdgRule: number;
  directHdgExact: number;
} {
  const teRule = trackErrorRule(offNm, flownNm);
  const teExact = trackErrorExact(offNm, flownNm);
  const closeRule = trackErrorRule(offNm, toGoNm);
  const closeExact = trackErrorExact(offNm, toGoNm);
  const turn = -side; // off right → turn left
  return {
    teRule,
    teExact,
    closeRule,
    closeExact,
    regainHdgRule: norm360(course + turn * 2 * teRule),
    directHdgRule: norm360(course + turn * (teRule + closeRule)),
    directHdgExact: norm360(course + turn * (teExact + closeExact)),
  };
}

export const sixtyToOne: GeneratorDef = defineGenerator({
  id: "ifr.sixtyToOne",
  title: L("The 1-in-60 rule", "La règle du 1 sur 60"),
  category: "ifr",
  alsoIn: ["vfr"],
  summary: L(
    "Track error from the distance off course, then the heading to regain the course or go direct.",
    "Erreur de route à partir de l'écart, puis le cap pour rejoindre la route ou aller direct.",
  ),
  params: [
    variantParam([
      { value: "trackError", label: L("Track error", "Erreur de route") },
      { value: "regain", label: L("Regain the course", "Rejoindre la route") },
      {
        value: "direct",
        label: L("Direct to destination", "Direct destination"),
      },
    ]),
    {
      key: "flownNm",
      label: L("Distance flown", "Distance parcourue"),
      kind: "range",
      default: [20, 60],
      min: 10,
      max: 120,
      step: 5,
      unit: "NM",
    },
  ],
  generate(rng, params) {
    const variant = pickVariant(rng, params, SIXTY_VARIANTS);
    const [fMin, fMax] = rangeOf(params, "flownNm", [20, 60]);
    const course = rng.range(10, 360, 5);
    const flown = rng.range(Math.max(10, fMin), Math.max(fMin, fMax), 5);
    // off-course distances that give a whole or half-degree error with the rule, 2°–8°
    const te = rng.pick([2, 3, 4, 5, 6, 2.5, 3.5]);
    const off = roundStep((te * flown) / 60, 0.5) || 1;
    const side: 1 | -1 = rng.chance(0.5) ? 1 : -1;
    const toGo =
      variant === "direct"
        ? rng.range(Math.max(20, flown * 0.6), Math.max(30, flown * 1.6), 5)
        : flown;
    const s = solveSixtyToOne(course, flown, off, side, toGo);
    const sideEn = side > 0 ? "right" : "left";
    const sideFr = side > 0 ? "à droite" : "à gauche";
    const turnEn = side > 0 ? "left" : "right";
    const turnFr = side > 0 ? "à gauche" : "à droite";
    const givens = [
      given("course", L("Planned course", "Route prévue"), course, "deg"),
      given("flownNm", L("Distance flown", "Distance parcourue"), flown, "NM"),
      given("offNm", L("Distance off course", "Écart latéral"), off, "NM"),
      given(
        "side",
        L("Side", "Côté"),
        side > 0 ? "R" : "L",
        undefined,
        L(sideEn, sideFr),
      ),
    ];
    if (variant === "direct")
      givens.push(
        given("toGoNm", L("Distance to go", "Distance restante"), toGo, "NM"),
      );
    givens.push(given("variant", L("Question", "Question"), variant));

    const scene = tr(
      (f) =>
        `You have held heading ${f.hdg(course)} for course ${f.hdg(course)}. After ${f.u(flown, "NM")} a fix shows you ${f.u(off, "NM", 1)} ${sideEn} of course.`,
      (f) =>
        `Vous tenez le cap ${f.hdg(course)} pour la route ${f.hdg(course)}. Après ${f.u(flown, "NM")}, un point vous situe ${f.u(off, "NM", 1)} ${sideFr} de la route.`,
    );
    const teLine = tr(
      (f) =>
        `Track error = 60 × off ÷ flown = 60 × ${f.n(off, 1)} ÷ ${f.n(flown)} = ${f.n(s.teRule, 1)}° (exact atan: ${f.n(s.teExact, 1)}°).`,
      (f) =>
        `Erreur de route = 60 × écart ÷ distance = 60 × ${f.n(off, 1)} ÷ ${f.n(flown)} = ${f.n(s.teRule, 1)}° (exact, atan : ${f.n(s.teExact, 1)}°).`,
    );
    let prompt;
    let answer: number;
    let tolerance: number;
    let exact: number | undefined;
    const steps = [teLine];
    const parts: CalcProblem["parts"] = [];
    if (variant === "trackError") {
      prompt = L(
        `${scene.en} What is your track error, in degrees?`,
        `${scene.fr} Quelle est votre erreur de route, en degrés ?`,
      );
      answer = roundStep(s.teRule, 0.5);
      exact = Math.round(s.teExact * 10) / 10;
      tolerance = bracket(s.teRule, s.teExact, 0.5, 0.25);
      steps.push(
        tr(
          (f) =>
            `You are drifting ${sideEn}: the track is ${f.n(s.teRule, 1)}° ${sideEn} of the course, about ${f.hdg(course + side * s.teRule)}.`,
          (f) =>
            `Vous dérivez ${sideFr} : la route suivie est ${f.n(s.teRule, 1)}° ${sideFr} de la route prévue, environ ${f.hdg(course + side * s.teRule)}.`,
        ),
      );
    } else if (variant === "regain") {
      prompt = tr(
        () =>
          `${scene.en} What heading regains the course in the same distance again (${flown} NM)?`,
        () =>
          `${scene.fr} Quel cap pour rejoindre la route sur la même distance (${flown} NM) ?`,
      );
      answer = hdg360(s.regainHdgRule);
      exact = hdg360(norm360(course - side * 2 * s.teExact));
      tolerance = Math.max(2, Math.abs(wrap180(answer - exact)) + 1);
      steps.push(
        tr(
          (f) =>
            `Turn ${turnEn} by the track error to stop the drift (${f.n(s.teRule, 1)}°), and by as much again to converge in the same distance: double it, ${f.n(2 * s.teRule, 1)}°.`,
          (f) =>
            `Tournez ${turnFr} de l'erreur pour annuler la dérive (${f.n(s.teRule, 1)}°), et d'autant pour converger sur la même distance : le double, ${f.n(2 * s.teRule, 1)}°.`,
        ),
        tr(
          (f) =>
            `New heading ${f.hdg(answer)}. Back on course, take out half: heading ${f.hdg(course - side * s.teRule)} keeps the drift correction.`,
          (f) =>
            `Nouveau cap ${f.hdg(answer)}. Sur la route, retirez la moitié : le cap ${f.hdg(course - side * s.teRule)} garde la correction de dérive.`,
        ),
      );
      parts.push({
        key: "trackError",
        label: L("Track error", "Erreur de route"),
        answer: roundStep(s.teRule, 0.5),
        unit: "deg",
        tolerance: bracket(s.teRule, s.teExact, 0.5, 0.25),
      });
    } else {
      prompt = tr(
        () =>
          `${scene.en} The destination is ${toGo} NM ahead. What heading takes you direct to it?`,
        () =>
          `${scene.fr} La destination est à ${toGo} NM devant. Quel cap pour y aller direct ?`,
      );
      answer = hdg360(s.directHdgRule);
      exact = hdg360(s.directHdgExact);
      tolerance = Math.max(2, Math.abs(wrap180(answer - exact)) + 1);
      steps.push(
        tr(
          (f) =>
            `Closing angle = 60 × ${f.n(off, 1)} ÷ ${f.n(toGo)} (distance to go) = ${f.n(s.closeRule, 1)}°.`,
          (f) =>
            `Angle de convergence = 60 × ${f.n(off, 1)} ÷ ${f.n(toGo)} (distance restante) = ${f.n(s.closeRule, 1)}°.`,
        ),
        tr(
          (f) =>
            `Total correction = track error + closing angle = ${f.n(s.teRule + s.closeRule, 1)}°, to the ${turnEn}: heading ${f.hdg(answer)}.`,
          (f) =>
            `Correction totale = erreur + convergence = ${f.n(s.teRule + s.closeRule, 1)}°, ${turnFr} : cap ${f.hdg(answer)}.`,
        ),
      );
      parts.push({
        key: "trackError",
        label: L("Track error", "Erreur de route"),
        answer: roundStep(s.teRule, 0.5),
        unit: "deg",
        tolerance: bracket(s.teRule, s.teExact, 0.5, 0.25),
      });
    }
    // stage: on the ARD VOR outbound course, off by the same distance, the HSI showing it
    const radial = norm360(course + side * trackErrorExact(off, flown));
    const dist = Math.min(40, Math.hypot(flown, off));
    const xw = Math.round(120 * Math.sin((s.teExact * Math.PI) / 180));
    return {
      prompt,
      givens,
      answer,
      unit: "deg",
      tolerance,
      exact,
      parts: parts.length ? parts : undefined,
      solutionSteps: steps,
      ruleOfThumb: L(
        "1 NM off after 60 NM is 1° of track error. Double it to regain the course in the same distance; add the closing angle (60 × off ÷ to go) to go direct.",
        "1 NM d'écart après 60 NM = 1° d'erreur. Doublez pour rejoindre la route sur la même distance ; ajoutez l'angle de convergence (60 × écart ÷ distance restante) pour aller direct.",
      ),
      formula: L(
        "track error = atan(off ÷ flown); closing angle = atan(off ÷ to go)",
        "erreur = atan(écart ÷ distance parcourue) ; convergence = atan(écart ÷ distance restante)",
      ),
      refs: [
        REF.ifh("ch. 9 (VOR orientation: time and distance, 1-in-60)"),
        REF.phak("ch. 16 (navigation: off-course correction)"),
      ],
      diagram: {
        kind: "calc",
        calc: {
          kind: "sixtyToOne",
          course,
          flownNm: flown,
          offNm: side * off,
          ...(variant === "direct" ? { toGoNm: toGo } : {}),
        },
      },
      stage: {
        panes: [{ kind: "pfd" }],
        pose: poseOnRadial(
          radial,
          Math.round(dist * 10) / 10,
          6000,
          course,
          120,
          {
            radios: {
              nav1: TRAINING.vor.freq,
              obs1: hdg360(course),
              cdi: "NAV1",
            },
          },
        ),
        weather: {
          windDir: norm360(course - side * 90),
          windKt: Math.max(3, xw),
          turbulence: 0,
        },
        mode: "live",
        controls: ["hdgBug", "obs1"],
        goals: [
          {
            id: "heading",
            p: {
              value: hdg360(
                variant === "trackError" ? s.regainHdgRule : answer,
              ),
              tol: 3,
            },
          },
        ],
        doThis: [
          tr(
            (f) =>
              `Turn to heading ${f.hdg(variant === "trackError" ? s.regainHdgRule : answer)} and watch the needle come back.`,
            (f) =>
              `Prenez le cap ${f.hdg(variant === "trackError" ? s.regainHdgRule : answer)} et regardez l'aiguille revenir.`,
          ),
        ],
      },
    };
  },
  check(problem, response) {
    const course = givenNum(problem, "course");
    const flown = givenNum(problem, "flownNm");
    const off = givenNum(problem, "offNm");
    const side = givenStr(problem, "side") === "R" ? 1 : -1;
    const variant = givenStr(problem, "variant") as SixtyVariant;
    const s = solveSixtyToOne(
      course,
      flown,
      off,
      side,
      variant === "direct" ? givenNum(problem, "toGoNm") : flown,
    );
    const wrongs: Wrong[] = [];
    if (variant === "trackError") {
      wrongs.push({
        value: flown / off,
        id: "factor",
        text: L(
          "Divide the distance off by the distance flown, then × 60 (not the other way up).",
          "Divisez l'écart par la distance parcourue, puis × 60 (pas l'inverse).",
        ),
      });
      wrongs.push({
        value: off,
        id: "other",
        text: L(
          "That is the distance off in NM. The error in degrees = 60 × off ÷ flown.",
          "C'est l'écart en NM. L'erreur en degrés = 60 × écart ÷ distance.",
        ),
      });
    } else {
      const turn = -side;
      const sideWrong =
        variant === "regain"
          ? norm360(course - turn * 2 * s.teRule)
          : norm360(course - turn * (s.teRule + s.closeRule));
      wrongs.push({
        value: sideWrong,
        id: "wrongSide",
        text: L(
          "You turned the wrong way: off course to the right, turn left (and vice versa).",
          "Virage du mauvais côté : écarté à droite, on corrige à gauche (et inversement).",
        ),
      });
      wrongs.push({
        value: norm360(course + turn * s.teRule),
        id: "other",
        text:
          variant === "regain"
            ? L(
                "That heading only stops the drift (you would fly parallel to the course). Double the correction to converge.",
                "Ce cap annule seulement la dérive (vous volez parallèle à la route). Doublez la correction pour converger.",
              )
            : L(
                "That heading only stops the drift. Add the closing angle (60 × off ÷ distance to go).",
                "Ce cap annule seulement la dérive. Ajoutez l'angle de convergence (60 × écart ÷ distance restante).",
              ),
      });
      if (variant === "direct")
        wrongs.push({
          value: s.regainHdgRule,
          id: "other",
          text: L(
            "Doubling regains the course in the same distance. To go direct, add the closing angle computed with the distance TO GO.",
            "Doubler fait rejoindre la route sur la même distance. Pour aller direct, ajoutez la convergence calculée avec la distance RESTANTE.",
          ),
        });
    }
    return checkNumeric(problem, response, {
      wrongs,
      noFactor: variant !== "trackError",
    });
  },
});

// ================================================================== DME arc lead
type ArcVariant = "arcToRadial" | "radialToArc";

export function solveArcLead(
  arcNm: number,
  gsKt: number,
): {
  rRule: number;
  rExact: number;
  leadDegRule: number;
  leadDegExact: number;
  startOutRule: number;
  startOutExact: number;
} {
  const rRule = gsKt / 200;
  const rExact = turnRadiusAtRateNm(gsKt);
  return {
    rRule,
    rExact,
    leadDegRule: arcToRadialLeadRule(arcNm, rRule),
    leadDegExact: arcToRadialLeadExact(arcNm, rExact),
    startOutRule: arcNm - rRule,
    startOutExact: radialToArcStartExact(arcNm, rExact),
  };
}

export const dmeArcLead: GeneratorDef = defineGenerator({
  id: "ifr.dmeArcLead",
  title: L(
    "DME arc: lead radial and lead distance",
    "Arc DME : radiale et distance d'anticipation",
  ),
  category: "ifr",
  summary: L(
    "When to turn off the arc onto the final radial, and when to turn onto the arc from a radial.",
    "Quand quitter l'arc pour la radiale finale, et quand passer de la radiale à l'arc.",
  ),
  params: [
    variantParam([
      {
        value: "arcToRadial",
        label: L(
          "Arc → radial (lead radial)",
          "Arc → radiale (radiale d'anticipation)",
        ),
      },
      {
        value: "radialToArc",
        label: L(
          "Radial → arc (lead DME)",
          "Radiale → arc (DME d'anticipation)",
        ),
      },
    ]),
  ],
  generate(rng, params) {
    const variant = pickVariant<ArcVariant>(rng, params, [
      "arcToRadial",
      "radialToArc",
    ]);
    const arc = rng.range(8, 16, 1);
    const gs = rng.range(90, 160, 10);
    const s = solveArcLead(arc, gs);
    const refs = [
      REF.ifh("ch. 10 (DME arcs: lead radials)"),
      REF.aim("5-4-6 (approach clearance, arcs)"),
    ];
    if (variant === "arcToRadial") {
      const finalRadial = rng.range(10, 360, 5);
      const cw = rng.chance(0.5); // flying clockwise round the station: radials increasing
      const dir = cw ? 1 : -1;
      const leadR = norm360(finalRadial - dir * s.leadDegRule);
      const leadE = norm360(finalRadial - dir * s.leadDegExact);
      const answer = hdg360(leadR);
      const exact = hdg360(leadE);
      const tolerance = Math.max(1, Math.abs(wrap180(leadR - leadE)) + 1);
      const fromRadial = norm360(finalRadial - dir * rng.range(25, 60, 5));
      return {
        prompt: tr(
          (f) =>
            `You are flying the ${f.n(arc)} DME arc ${cw ? "clockwise" : "counter-clockwise"} from the ${f.hdg(fromRadial)} radial at ${f.u(gs, "kt")} ground speed, to join the ${f.hdg(finalRadial)} radial inbound with a standard-rate turn. At which radial do you start the turn?`,
          (f) =>
            `Vous suivez l'arc ${f.n(arc)} DME dans le sens ${cw ? "horaire" : "antihoraire"} depuis la radiale ${f.hdg(fromRadial)}, à ${f.u(gs, "kt")} de vitesse sol, pour rejoindre la radiale ${f.hdg(finalRadial)} en rapprochement au taux 1. À quelle radiale commencez-vous le virage ?`,
        ),
        givens: [
          given("arcNm", L("Arc", "Arc"), arc, "NM"),
          given("gsKt", L("Ground speed", "Vitesse sol"), gs, "kt"),
          given(
            "finalRadial",
            L("Final radial (inbound)", "Radiale finale (rapprochement)"),
            finalRadial,
            "deg",
          ),
          given(
            "dir",
            L("Direction", "Sens"),
            cw ? "cw" : "ccw",
            undefined,
            L(
              cw ? "clockwise" : "counter-clockwise",
              cw ? "horaire" : "antihoraire",
            ),
          ),
          given(
            "fromRadial",
            L("Now on radial", "Radiale actuelle"),
            fromRadial,
            "deg",
          ),
          given("variant", L("Question", "Question"), variant),
        ],
        answer,
        unit: "deg",
        tolerance,
        exact,
        parts: [
          {
            key: "leadDeg",
            label: L("Lead (degrees of arc)", "Anticipation (degrés d'arc)"),
            answer: roundStep(s.leadDegRule, 0.5),
            unit: "deg",
            tolerance: Math.max(
              1,
              Math.abs(s.leadDegRule - s.leadDegExact) + 0.5,
            ),
          },
        ],
        solutionSteps: [
          tr(
            (f) =>
              `Standard-rate turn radius ≈ GS ÷ 200 = ${f.n(gs)} ÷ 200 = ${f.u(s.rRule, "NM", 2)} (exact V ÷ 60π: ${f.n(s.rExact, 2)}).`,
            (f) =>
              `Rayon au taux 1 ≈ Vs ÷ 200 = ${f.n(gs)} ÷ 200 = ${f.u(s.rRule, "NM", 2)} (exact V ÷ 60π : ${f.n(s.rExact, 2)}).`,
          ),
          tr(
            (f) =>
              `On a ${f.n(arc)} NM arc, 1° of arc is ${f.n(arc)} ÷ 60 = ${f.n(arc / 60, 2)} NM, so the lead is 60 × ${f.n(s.rRule, 2)} ÷ ${f.n(arc)} = ${f.n(s.leadDegRule, 1)}°.`,
            (f) =>
              `Sur un arc de ${f.n(arc)} NM, 1° d'arc vaut ${f.n(arc)} ÷ 60 = ${f.n(arc / 60, 2)} NM : anticipation = 60 × ${f.n(s.rRule, 2)} ÷ ${f.n(arc)} = ${f.n(s.leadDegRule, 1)}°.`,
          ),
          tr(
            (f) =>
              `Radials are ${cw ? "increasing" : "decreasing"} as you fly, so start the turn ${f.n(s.leadDegRule, 1)}° before ${f.hdg(finalRadial)}: at the ${f.hdg(answer)} radial.`,
            (f) =>
              `Les radiales ${cw ? "augmentent" : "diminuent"} en vol : commencez le virage ${f.n(s.leadDegRule, 1)}° avant la ${f.hdg(finalRadial)}, soit à la radiale ${f.hdg(answer)}.`,
          ),
        ],
        ruleOfThumb: L(
          "Lead radials = 60 × lead NM ÷ DME, with lead NM ≈ the turn radius (GS ÷ 200 at standard rate).",
          "Radiales d'anticipation = 60 × anticipation en NM ÷ DME, avec l'anticipation ≈ le rayon de virage (Vs ÷ 200 au taux 1).",
        ),
        formula: L(
          "sin α = r ÷ (D − r),  r = V ÷ ω (ω = 3°/s)",
          "sin α = r ÷ (D − r),  r = V ÷ ω (ω = 3°/s)",
        ),
        refs,
        diagram: {
          kind: "calc",
          calc: {
            kind: "lead",
            mode: "arc",
            course: finalRadial,
            arcNm: arc,
            leadDeg: s.leadDegRule,
            tasKt: gs,
          },
        },
        stage: {
          panes: [{ kind: "pfd" }],
          pose: poseOnRadial(
            norm360(leadR - dir * 8),
            arc,
            3000,
            norm360(leadR - dir * 8 + dir * 90),
            gs,
            {
              radios: {
                nav1: TRAINING.vor.freq,
                obs1: hdg360(norm360(finalRadial + 180)),
                cdi: "NAV1",
              },
            },
          ),
          weather: { windKt: 0, turbulence: 0 },
          mode: "live",
          controls: ["hdgBug", "obs1"],
          goals: [
            {
              id: "onRadial",
              p: {
                navaid: TRAINING.vor.ident,
                radial: hdg360(finalRadial),
                tol: 2,
              },
            },
          ],
          doThis: [
            tr(
              (f) =>
                `Hold the arc, start the turn at the ${f.hdg(answer)} radial and roll out on the ${f.hdg(finalRadial)} radial inbound.`,
              (f) =>
                `Tenez l'arc, virez à la radiale ${f.hdg(answer)} et stabilisez sur la radiale ${f.hdg(finalRadial)} en rapprochement.`,
            ),
          ],
        },
      };
    }
    const outbound = rng.chance(0.65);
    const radial = rng.range(10, 360, 5);
    const ruleD = outbound ? arc - s.rRule : arc + s.rRule;
    const exactD = outbound
      ? s.startOutExact
      : Math.sqrt(arc * arc - s.rExact * s.rExact) + s.rExact;
    const answer = roundStep(ruleD, 0.1);
    return {
      prompt: tr(
        (f) =>
          `You are tracking the ${f.hdg(radial)} radial ${outbound ? "outbound" : "inbound"} at ${f.u(gs, "kt")} ground speed, cleared to join the ${f.n(arc)} DME arc. At what DME do you start the standard-rate turn onto the arc?`,
        (f) =>
          `Vous suivez la radiale ${f.hdg(radial)} en ${outbound ? "éloignement" : "rapprochement"} à ${f.u(gs, "kt")} de vitesse sol, autorisé sur l'arc ${f.n(arc)} DME. À quelle distance DME commencez-vous le virage au taux 1 vers l'arc ?`,
      ),
      givens: [
        given("arcNm", L("Arc", "Arc"), arc, "NM"),
        given("gsKt", L("Ground speed", "Vitesse sol"), gs, "kt"),
        given("radial", L("Radial", "Radiale"), radial, "deg"),
        given(
          "outbound",
          L("Leg", "Branche"),
          outbound ? "out" : "in",
          undefined,
          L(
            outbound ? "outbound" : "inbound",
            outbound ? "éloignement" : "rapprochement",
          ),
        ),
        given("variant", L("Question", "Question"), variant),
      ],
      answer,
      unit: "NM",
      tolerance: bracket(ruleD, exactD, 0.2, 0.05),
      exact: roundStep(exactD, 0.1),
      solutionSteps: [
        tr(
          (f) =>
            `Standard-rate turn radius ≈ GS ÷ 200 = ${f.u(s.rRule, "NM", 2)}: that is the lead.`,
          (f) =>
            `Rayon au taux 1 ≈ Vs ÷ 200 = ${f.u(s.rRule, "NM", 2)} : c'est l'anticipation.`,
        ),
        tr(
          (f) =>
            outbound
              ? `Outbound the DME is increasing: start the turn at ${f.n(arc)} − ${f.n(s.rRule, 1)} = ${f.u(answer, "NM", 1)}.`
              : `Inbound the DME is decreasing: start the turn at ${f.n(arc)} + ${f.n(s.rRule, 1)} = ${f.u(answer, "NM", 1)}.`,
          (f) =>
            outbound
              ? `En éloignement la DME augmente : virez à ${f.n(arc)} − ${f.n(s.rRule, 1)} = ${f.u(answer, "NM", 1)}.`
              : `En rapprochement la DME diminue : virez à ${f.n(arc)} + ${f.n(s.rRule, 1)} = ${f.u(answer, "NM", 1)}.`,
        ),
      ],
      ruleOfThumb: L(
        "Lead the arc by the turn radius: about 0.5 NM below 120 kt, GS ÷ 200 in general.",
        "Anticipez l'arc du rayon de virage : environ 0,5 NM sous 120 kt, Vs ÷ 200 en général.",
      ),
      formula: L(
        outbound ? "d = √(D² − r²) − r" : "d = √(D² − r²) + r",
        outbound ? "d = √(D² − r²) − r" : "d = √(D² − r²) + r",
      ),
      refs,
      diagram: {
        kind: "calc",
        calc: {
          kind: "lead",
          mode: "arc",
          course: radial,
          arcNm: arc,
          leadNm: s.rRule,
          tasKt: gs,
        },
      },
    };
  },
  check(problem, response) {
    const arc = givenNum(problem, "arcNm");
    const gs = givenNum(problem, "gsKt");
    const s = solveArcLead(arc, gs);
    const variant = givenStr(problem, "variant") as ArcVariant;
    if (variant === "arcToRadial") {
      const fin = givenNum(problem, "finalRadial");
      const dir = givenStr(problem, "dir") === "cw" ? 1 : -1;
      const partWrongs: PartWrong[] = [];
      return checkNumeric(problem, response, {
        wrongs: [
          {
            value: norm360(fin + dir * s.leadDegRule),
            id: "wrongSide",
            text: L(
              "That radial is past the final radial. Lead means BEFORE it, on the side you are coming from.",
              "Cette radiale est après la radiale finale. Anticiper, c'est AVANT, du côté d'où vous venez.",
            ),
          },
          {
            value: fin,
            id: "other",
            text: L(
              "Turning at the final radial overshoots it by the turn radius. Start the turn early by 60 × r ÷ DME degrees.",
              "Virer sur la radiale finale fait dépasser du rayon de virage. Commencez 60 × r ÷ DME degrés avant.",
            ),
          },
          {
            value: norm360(fin - dir * s.rRule),
            id: "unit",
            text: L(
              "You subtracted the lead in NM from a radial. Convert it to degrees of arc: 60 × lead NM ÷ DME.",
              "Vous avez retiré des NM à une radiale. Convertissez en degrés d'arc : 60 × anticipation ÷ DME.",
            ),
          },
        ],
        partWrongs,
      });
    }
    const outbound = givenStr(problem, "outbound") === "out";
    return checkNumeric(problem, response, {
      wrongs: [
        {
          value: outbound ? arc + s.rRule : arc - s.rRule,
          id: "wrongSide",
          text: outbound
            ? L(
                "Outbound, the DME is increasing: turn BEFORE the arc, at arc − radius.",
                "En éloignement, la DME augmente : virez AVANT l'arc, à arc − rayon.",
              )
            : L(
                "Inbound, the DME is decreasing: turn BEFORE the arc, at arc + radius.",
                "En rapprochement, la DME diminue : virez AVANT l'arc, à arc + rayon.",
              ),
        },
        {
          value: arc,
          id: "other",
          text: L(
            "Turning at the arc DME overshoots it by the turn radius: lead it.",
            "Virer à la DME de l'arc fait dépasser du rayon de virage : anticipez.",
          ),
        },
      ],
      noFactor: true,
    });
  },
});

// ================================================================== intercept lead
export function solveInterceptLead(
  gsKt: number,
  interceptDeg: number,
): { rRule: number; rExact: number; leadRule: number; leadExact: number } {
  const rRule = gsKt / 200;
  const rExact = turnRadiusAtRateNm(gsKt);
  return {
    rRule,
    rExact,
    leadRule: (rRule * interceptDeg) / 90,
    leadExact: interceptLeadNm(rExact, interceptDeg),
  };
}

export const interceptLead: GeneratorDef = defineGenerator({
  id: "ifr.interceptLead",
  title: L("Lead turn for an intercept", "Anticipation d'une interception"),
  category: "ifr",
  summary: L(
    "How far before the course to start the turn so you roll out on it, for 30° to 90° intercepts.",
    "À quelle distance de l'axe commencer le virage pour finir dessus, interceptions de 30° à 90°.",
  ),
  params: [
    {
      key: "angles",
      label: L("Intercept angles", "Angles d'interception"),
      kind: "choice",
      default: "all",
      choices: [
        { value: "all", label: L("30°, 45°, 60°, 90°", "30°, 45°, 60°, 90°") },
        { value: "90", label: L("90° only", "90° seulement") },
      ],
    },
  ],
  generate(rng, params) {
    const theta = params.angles === "90" ? 90 : rng.pick([30, 45, 60, 90]);
    const gs = rng.range(90, 160, 10);
    const course = rng.range(10, 360, 5);
    const fromLeft = rng.chance(0.5);
    const hdg = norm360(course + (fromLeft ? theta : -theta));
    const s = solveInterceptLead(gs, theta);
    const answer = roundStep(s.leadRule, 0.1);
    return {
      prompt: tr(
        (f) =>
          `Heading ${f.hdg(hdg)} at ${f.u(gs, "kt")} ground speed, you are intercepting the ${f.hdg(course)} course (${theta}° intercept). How far before the course, along your track, do you start a standard-rate turn to roll out on it?`,
        (f) =>
          `Au cap ${f.hdg(hdg)} à ${f.u(gs, "kt")} de vitesse sol, vous interceptez la route ${f.hdg(course)} (interception à ${theta}°). À quelle distance avant l'axe, le long de votre trajectoire, commencez-vous le virage au taux 1 pour finir dessus ?`,
      ),
      givens: [
        given("gsKt", L("Ground speed", "Vitesse sol"), gs, "kt"),
        given(
          "course",
          L("Course to intercept", "Route à intercepter"),
          course,
          "deg",
        ),
        given("hdg", L("Heading", "Cap"), hdg, "deg"),
        given(
          "theta",
          L("Intercept angle", "Angle d'interception"),
          theta,
          "deg",
        ),
      ],
      answer,
      unit: "NM",
      tolerance: bracket(s.leadRule, s.leadExact, 0.1, 0.05),
      exact: roundStep(s.leadExact, 0.01),
      parts: [
        {
          key: "radius",
          label: L("Turn radius", "Rayon de virage"),
          answer: roundStep(s.rRule, 0.1),
          unit: "NM",
          tolerance: bracket(s.rRule, s.rExact, 0.1, 0.05),
        },
      ],
      solutionSteps: [
        tr(
          (f) =>
            `Standard-rate radius ≈ GS ÷ 200 = ${f.n(gs)} ÷ 200 = ${f.u(s.rRule, "NM", 2)}.`,
          (f) =>
            `Rayon au taux 1 ≈ Vs ÷ 200 = ${f.n(gs)} ÷ 200 = ${f.u(s.rRule, "NM", 2)}.`,
        ),
        tr(
          (f) =>
            `A ${theta}° turn needs about ${theta}/90 of the radius: ${f.n(s.rRule, 2)} × ${theta} ÷ 90 = ${f.u(s.leadRule, "NM", 2)} (exact r × tan(θ/2) = ${f.n(s.leadExact, 2)}).`,
          (f) =>
            `Un virage de ${theta}° demande environ ${theta}/90 du rayon : ${f.n(s.rRule, 2)} × ${theta} ÷ 90 = ${f.u(s.leadRule, "NM", 2)} (exact r × tan(θ/2) = ${f.n(s.leadExact, 2)}).`,
        ),
        tr(
          (f) =>
            `Start the turn ${f.u(answer, "NM", 1)} before the course; on the CDI, when the needle starts to move briskly.`,
          (f) =>
            `Commencez le virage ${f.u(answer, "NM", 1)} avant l'axe ; au CDI, quand l'aiguille se met à bouger franchement.`,
        ),
      ],
      ruleOfThumb: L(
        "Lead ≈ turn radius × intercept angle ÷ 90, with the standard-rate radius ≈ GS ÷ 200 (1 % of GS is the diameter).",
        "Anticipation ≈ rayon × angle d'interception ÷ 90, avec le rayon au taux 1 ≈ Vs ÷ 200 (le diamètre fait 1 % de la Vs).",
      ),
      formula: L(
        "lead = r × tan(θ / 2),  r = V ÷ ω",
        "anticipation = r × tan(θ / 2),  r = V ÷ ω",
      ),
      refs: [
        REF.ifh("ch. 3 (rate of turn and radius)"),
        REF.ifh("ch. 9 (intercepting a course)"),
      ],
      diagram: {
        kind: "calc",
        calc: {
          kind: "lead",
          mode: "intercept",
          course,
          leadNm: s.leadRule,
          tasKt: gs,
        },
      },
    };
  },
  check(problem, response) {
    const gs = givenNum(problem, "gsKt");
    const theta = givenNum(problem, "theta");
    const s = solveInterceptLead(gs, theta);
    return checkNumeric(problem, response, {
      wrongs:
        theta < 90
          ? [
              {
                value: s.rRule,
                id: "other",
                text: L(
                  "A full radius is the lead for a 90° turn. A smaller intercept angle needs less: × θ ÷ 90.",
                  "Un rayon entier, c'est l'anticipation d'un virage de 90°. Un angle plus faible demande moins : × θ ÷ 90.",
                ),
              },
            ]
          : [
              {
                value: gs / 100,
                id: "factor",
                text: L(
                  "GS ÷ 100 is the turn diameter. The lead for 90° is the radius: GS ÷ 200.",
                  "Vs ÷ 100 donne le diamètre. L'anticipation pour 90° est le rayon : Vs ÷ 200.",
                ),
              },
            ],
    });
  },
});

// ================================================================== ADF
type AdfVariant = "qdm" | "qdr" | "rb";

export function solveAdf(mh: number, rb: number): { qdm: number; qdr: number } {
  const qdm = norm360(mh + rb);
  return { qdm, qdr: norm360(qdm + 180) };
}

export const adfBearing: GeneratorDef = defineGenerator({
  id: "ifr.adfBearing",
  title: L(
    "ADF: magnetic bearing, QDM and QDR",
    "ADF : relèvement magnétique, QDM et QDR",
  ),
  category: "ifr",
  summary: L(
    "MB = MH + RB: the bearing to the station (QDM), from it (QDR), and the RB to expect.",
    "QDM = Cm + gisement : le relèvement vers la balise (QDM), depuis la balise (QDR), et le gisement attendu.",
  ),
  params: [
    variantParam([
      { value: "qdm", label: L("Bearing to (QDM)", "Relèvement vers (QDM)") },
      {
        value: "qdr",
        label: L("Bearing from (QDR)", "Relèvement depuis (QDR)"),
      },
      {
        value: "rb",
        label: L("Relative bearing to expect", "Gisement attendu"),
      },
    ]),
  ],
  generate(rng, params) {
    const variant = pickVariant<AdfVariant>(rng, params, ["qdm", "qdr", "rb"]);
    const mh = rng.range(5, 360, 5);
    let rb = rng.range(10, 350, 5);
    if (Math.abs(wrap180(rb)) < 10) rb = 30;
    const { qdm, qdr } = solveAdf(mh, rb);
    const stagePose = {
      kind: "fields" as const,
      pos: { fix: TRAINING.ndb.ident, radial: Math.round(qdr), distNm: 8 },
      altFt: 3000,
      hdg: mh,
      iasKt: 110,
      radios: { adf: TRAINING.ndb.freq, brg1: "ADF" as const },
    };
    const common = {
      unit: "deg" as const,
      tolerance: 2,
      ruleOfThumb: L(
        "MH + RB = MB (the QDM). Subtract 360 if over 360. The QDR is the QDM ± 180.",
        "Cm + gisement = QDM. Retirez 360 si on dépasse 360. Le QDR est le QDM ± 180.",
      ),
      formula: L(
        "QDM = MH + RB (mod 360); QDR = QDM ± 180; RB = QDM − MH",
        "QDM = Cm + Gt (mod 360) ; QDR = QDM ± 180 ; Gt = QDM − Cm",
      ),
      refs: [
        REF.ifh("ch. 9 (ADF: relative and magnetic bearing)"),
        REF.aim("1-1-2 (NDB)"),
      ],
      diagram: {
        kind: "calc" as const,
        calc: { kind: "adf" as const, mh, rb },
      },
      stage: {
        panes: [{ kind: "pfd" as const }] as [{ kind: "pfd" }],
        pose: stagePose,
        weather: { windKt: 0, turbulence: 0 },
        mode: "frozen" as const,
      },
    };
    if (variant === "rb") {
      return {
        ...common,
        prompt: tr(
          (f) =>
            `You are heading ${f.hdg(mh)}, on the ${f.hdg(qdm)} QDM (bearing to the NDB). What relative bearing does the ADF needle show?`,
          (f) =>
            `Vous êtes au cap ${f.hdg(mh)}, sur le QDM ${f.hdg(qdm)} de la balise. Quel gisement indique l'aiguille de l'ADF ?`,
        ),
        givens: [
          given("mh", L("Magnetic heading", "Cap magnétique"), mh, "deg"),
          given("qdm", L("QDM", "QDM"), qdm, "deg"),
          given("variant", L("Question", "Question"), variant),
        ],
        answer: Math.round(rb),
        solutionSteps: [
          tr(
            (f) => `RB = QDM − MH = ${f.n(qdm)} − ${f.n(mh)} = ${f.n(rb)}°.`,
            (f) =>
              `Gisement = QDM − Cm = ${f.n(qdm)} − ${f.n(mh)} = ${f.n(rb)}°.`,
          ),
          tr(
            (f) =>
              `Add 360 if negative. The needle points ${f.n(rb)}° clockwise from the nose${rb > 180 ? ", i.e. left of the nose" : rb < 180 ? ", right of the nose" : ""}.`,
            (f) =>
              `Ajoutez 360 si négatif. L'aiguille pointe ${f.n(rb)}° à droite du nez dans le sens horaire${rb > 180 ? ", donc à gauche du nez" : ""}.`,
          ),
        ],
      };
    }
    const isQdr = variant === "qdr";
    return {
      ...common,
      prompt: tr(
        (f) =>
          `Heading ${f.hdg(mh)}, the ADF needle shows a relative bearing of ${f.n(rb)}°. What is your ${isQdr ? "magnetic bearing FROM the station (QDR)" : "magnetic bearing TO the station (QDM)"}?`,
        (f) =>
          `Au cap ${f.hdg(mh)}, l'aiguille de l'ADF indique un gisement de ${f.n(rb)}°. Quel est votre ${isQdr ? "relèvement magnétique DEPUIS la balise (QDR)" : "relèvement magnétique VERS la balise (QDM)"} ?`,
      ),
      givens: [
        given("mh", L("Magnetic heading", "Cap magnétique"), mh, "deg"),
        given("rb", L("Relative bearing", "Gisement"), rb, "deg"),
        given("variant", L("Question", "Question"), variant),
      ],
      answer: hdg360(isQdr ? qdr : qdm),
      solutionSteps: [
        tr(
          (f) =>
            `QDM = MH + RB = ${f.n(mh)} + ${f.n(rb)} = ${f.n(mh + rb)}${mh + rb > 360 ? ` − 360 = ${f.n(qdm)}` : ""}°.`,
          (f) =>
            `QDM = Cm + gisement = ${f.n(mh)} + ${f.n(rb)} = ${f.n(mh + rb)}${mh + rb > 360 ? ` − 360 = ${f.n(qdm)}` : ""}°.`,
        ),
        ...(isQdr
          ? [
              tr(
                (f) =>
                  `QDR = QDM ± 180 = ${f.hdg(qdr)}: you are on that bearing from the station.`,
                (f) =>
                  `QDR = QDM ± 180 = ${f.hdg(qdr)} : vous êtes sur ce relèvement depuis la balise.`,
              ),
            ]
          : [
              tr(
                (f) =>
                  `To fly to the station in still air, turn to ${f.hdg(qdm)}: the needle then sits on the nose.`,
                (f) =>
                  `Pour rejoindre la balise sans vent, prenez le cap ${f.hdg(qdm)} : l'aiguille passe sur le nez.`,
              ),
            ]),
      ],
    };
  },
  check(problem, response) {
    const variant = givenStr(problem, "variant") as AdfVariant;
    const mh = givenNum(problem, "mh");
    if (variant === "rb") {
      const qdm = givenNum(problem, "qdm");
      return checkNumeric(problem, response, {
        wrongs: [
          {
            value: norm360(mh - qdm),
            id: "wrongSide",
            text: L(
              "RB = QDM − MH (bearing minus heading), not the other way.",
              "Gisement = QDM − Cm, pas l'inverse.",
            ),
          },
          {
            value: norm360(qdm - mh + 180),
            id: "reciprocal",
            text: L(
              "You used the QDR. With the QDM (bearing TO), RB = QDM − MH.",
              "Vous avez pris le QDR. Avec le QDM (vers la balise), gisement = QDM − Cm.",
            ),
          },
        ],
      });
    }
    const rb = givenNum(problem, "rb");
    const { qdm, qdr } = solveAdf(mh, rb);
    const isQdr = variant === "qdr";
    return checkNumeric(problem, response, {
      wrongs: [
        {
          value: isQdr ? qdm : qdr,
          id: "reciprocal",
          text: isQdr
            ? L(
                "That is the QDM (to the station). The QDR (from it) is the reciprocal.",
                "C'est le QDM (vers la balise). Le QDR (depuis) est l'inverse.",
              )
            : L(
                "That is the QDR (from the station). The QDM (to it) is MH + RB.",
                "C'est le QDR (depuis la balise). Le QDM (vers) est Cm + gisement.",
              ),
        },
        {
          value: norm360(mh - rb),
          id: "wrongSide",
          text: L(
            "The relative bearing is measured clockwise from the nose: add it to the heading.",
            "Le gisement se compte dans le sens horaire depuis le nez : ajoutez-le au cap.",
          ),
        },
        {
          value: isQdr ? norm360(mh - rb + 180) : norm360(mh - rb),
          id: "wrongSide",
          text: L(
            "Add the relative bearing to the heading (clockwise from the nose).",
            "Ajoutez le gisement au cap (sens horaire depuis le nez).",
          ),
        },
      ],
    });
  },
});

// ================================================================== VOR radial, TO / FROM
type VorVariant = "centerTo" | "centerFrom";

/** TO / FROM flag and needle side for an aircraft on `radial` with `obs` set (no heading dependence). */
export function solveVor(
  radial: number,
  obs: number,
): { flag: "TO" | "FROM"; needle: "L" | "R"; offDeg: number } {
  const dFrom = wrap180(radial - obs);
  if (Math.abs(dFrom) < 90)
    return {
      flag: "FROM",
      needle: dFrom > 0 ? "L" : "R",
      offDeg: Math.abs(dFrom),
    };
  const dTo = wrap180(radial - (obs + 180));
  return { flag: "TO", needle: dTo > 0 ? "R" : "L", offDeg: Math.abs(dTo) };
}

export const vorRadial: GeneratorDef = defineGenerator({
  id: "ifr.vorRadial",
  title: L(
    "VOR: radial, TO / FROM and the needle",
    "VOR : radiale, TO / FROM et l'aiguille",
  ),
  category: "ifr",
  alsoIn: ["vfr"],
  summary: L(
    "From your radial: the OBS that centres the needle, the flag and the needle side for the OBS set.",
    "Depuis votre radiale : l'OBS qui centre l'aiguille, le drapeau et le côté de l'aiguille pour l'OBS affiché.",
  ),
  params: [
    variantParam([
      {
        value: "centerTo",
        label: L("Centre with a TO flag", "Centrer avec TO"),
      },
      {
        value: "centerFrom",
        label: L("Centre with a FROM flag", "Centrer avec FROM"),
      },
    ]),
  ],
  generate(rng, params) {
    const variant = pickVariant<VorVariant>(rng, params, [
      "centerTo",
      "centerFrom",
    ]);
    const radial = rng.range(5, 360, 5);
    // an OBS set 15°–70° or 110°–165° away (clear flag, needle off scale or deflected)
    let off = rng.range(15, 70, 5);
    if (rng.chance(0.5)) off = 180 - off;
    const obs = norm360(radial + (rng.chance(0.5) ? off : -off));
    const v = solveVor(radial, obs);
    const dist = rng.range(8, 30, 1);
    const answer = hdg360(variant === "centerTo" ? radial + 180 : radial);
    const choicesFlag = [
      { value: "TO", label: L("TO", "TO") },
      { value: "FROM", label: L("FROM", "FROM") },
    ];
    const choicesNeedle = [
      { value: "L", label: L("Left of centre", "À gauche") },
      { value: "R", label: L("Right of centre", "À droite") },
    ];
    return {
      prompt: tr(
        (f) =>
          `You are on the ${f.hdg(radial)} radial of ARD, ${f.u(dist, "NM")} out. The OBS is set to ${f.hdg(obs)}. Which flag shows, which side is the needle, and what OBS centres the needle with a ${variant === "centerTo" ? "TO" : "FROM"} flag?`,
        (f) =>
          `Vous êtes sur la radiale ${f.hdg(radial)} d'ARD, à ${f.u(dist, "NM")}. L'OBS est sur ${f.hdg(obs)}. Quel drapeau, de quel côté est l'aiguille, et quel OBS centre l'aiguille avec ${variant === "centerTo" ? "TO" : "FROM"} ?`,
      ),
      givens: [
        given("radial", L("Your radial", "Votre radiale"), radial, "deg"),
        given("obs", L("OBS set", "OBS affiché"), obs, "deg"),
        given("dist", L("DME", "DME"), dist, "NM"),
        given("variant", L("Question", "Question"), variant),
      ],
      answer,
      unit: "deg",
      tolerance: 2,
      parts: [
        {
          key: "flag",
          label: L("Flag with the OBS set", "Drapeau avec l'OBS affiché"),
          answer: v.flag,
          choices: choicesFlag,
        },
        {
          key: "needle",
          label: L("Needle with the OBS set", "Aiguille avec l'OBS affiché"),
          answer: v.needle,
          choices: choicesNeedle,
        },
      ],
      solutionSteps: [
        tr(
          (f) =>
            `The flag ignores your heading. Draw the OBS course ${f.hdg(obs)} through the station: you are on radial ${f.hdg(radial)}, ${f.n(Math.abs(wrap180(radial - obs)))}° from the ${f.hdg(obs)} radial.`,
          (f) =>
            `Le drapeau ne dépend pas du cap. Tracez la route OBS ${f.hdg(obs)} par la station : vous êtes sur la radiale ${f.hdg(radial)}, à ${f.n(Math.abs(wrap180(radial - obs)))}° de la radiale ${f.hdg(obs)}.`,
        ),
        tr(
          () =>
            v.flag === "FROM"
              ? `Less than 90° away: flying the OBS course would take you away from the station: FROM.`
              : `More than 90° away: flying the OBS course would take you toward the station: TO.`,
          () =>
            v.flag === "FROM"
              ? `À moins de 90° : la route OBS vous éloigne de la station : FROM.`
              : `À plus de 90° : la route OBS vous mène vers la station : TO.`,
        ),
        tr(
          () =>
            `Fly the OBS course in your mind: the selected course lies to your ${v.needle === "L" ? "left" : "right"}, so the needle is ${v.needle === "L" ? "left" : "right"} (${v.flag === "TO" ? "TO" : "FROM"}).`,
          () =>
            `Volez la route OBS en pensée : la route affichée est à votre ${v.needle === "L" ? "gauche" : "droite"}, l'aiguille est donc à ${v.needle === "L" ? "gauche" : "droite"} (${v.flag}).`,
        ),
        tr(
          (f) =>
            variant === "centerTo"
              ? `To centre with TO, set the reciprocal of your radial: ${f.n(radial)} ± 180 = ${f.hdg(answer)}.`
              : `To centre with FROM, set your radial itself: ${f.hdg(answer)}.`,
          (f) =>
            variant === "centerTo"
              ? `Pour centrer avec TO, affichez l'inverse de votre radiale : ${f.n(radial)} ± 180 = ${f.hdg(answer)}.`
              : `Pour centrer avec FROM, affichez votre radiale : ${f.hdg(answer)}.`,
        ),
      ],
      ruleOfThumb: L(
        "Radial = FROM. To centre with TO, set the reciprocal of the radial you are on. The needle points to the selected course; the flag never depends on heading.",
        "Radiale = FROM. Pour centrer avec TO, affichez l'inverse de votre radiale. L'aiguille indique le côté de la route affichée ; le drapeau ne dépend jamais du cap.",
      ),
      formula: L(
        "FROM if |radial − OBS| < 90°, TO if > 90°; centre TO: OBS = radial + 180",
        "FROM si |radiale − OBS| < 90°, TO si > 90° ; centrer TO : OBS = radiale + 180",
      ),
      refs: [REF.ifh("ch. 9 (VOR orientation)"), REF.aim("1-1-3 (VOR)")],
      diagram: { kind: "calc", calc: { kind: "vor", radial, obs } },
      stage: {
        panes: [{ kind: "pfd" }],
        pose: poseOnRadial(
          radial,
          dist,
          4000,
          norm360(radial + 180 + rng.range(-40, 40, 10)),
          110,
          {
            radios: { nav1: TRAINING.vor.freq, obs1: hdg360(obs), cdi: "NAV1" },
          },
        ),
        weather: { windKt: 0, turbulence: 0 },
        mode: "frozen",
        controls: ["obs1"],
        goals: [
          { id: "obs", p: { nav: 1, value: answer, tol: 2 } },
          {
            id: "toFrom",
            p: { value: variant === "centerTo" ? "TO" : "FROM" },
          },
        ],
        doThis: [
          tr(
            (f) =>
              `Turn the OBS to ${f.hdg(answer)}: the needle centres with a ${variant === "centerTo" ? "TO" : "FROM"} flag.`,
            (f) =>
              `Tournez l'OBS sur ${f.hdg(answer)} : l'aiguille se centre avec ${variant === "centerTo" ? "TO" : "FROM"}.`,
          ),
        ],
      },
    };
  },
  check(problem, response) {
    const radial = givenNum(problem, "radial");
    const obs = givenNum(problem, "obs");
    const variant = givenStr(problem, "variant") as VorVariant;
    const v = solveVor(radial, obs);
    return checkNumeric(problem, response, {
      wrongs: [
        {
          value: variant === "centerTo" ? radial : radial + 180,
          id: "reciprocal",
          text:
            variant === "centerTo"
              ? L(
                  "Setting your radial centres the needle with FROM. For TO, set its reciprocal.",
                  "Afficher votre radiale centre l'aiguille avec FROM. Pour TO, affichez l'inverse.",
                )
              : L(
                  "That centres the needle with TO. For FROM, set the radial you are on.",
                  "Cela centre l'aiguille avec TO. Pour FROM, affichez votre radiale.",
                ),
        },
      ],
      partWrongs: [
        {
          key: "flag",
          value: v.flag === "TO" ? "FROM" : "TO",
          id: "toFrom",
          text: L(
            "Flag reversed: compare the OBS with your radial. Within 90° of it, FROM; beyond 90°, TO. The heading does not matter.",
            "Drapeau inversé : comparez l'OBS à votre radiale. À moins de 90°, FROM ; au-delà, TO. Le cap n'y change rien.",
          ),
        },
        {
          key: "needle",
          value: v.needle === "L" ? "R" : "L",
          id: "wrongSide",
          text: L(
            "Needle reversed: imagine flying the OBS course with this flag. The needle shows the side the course is on.",
            "Aiguille inversée : imaginez voler la route OBS avec ce drapeau. L'aiguille montre le côté où se trouve la route.",
          ),
        },
      ],
    });
  },
});

export const NAV_GENERATORS = [
  sixtyToOne,
  dmeArcLead,
  interceptLead,
  adfBearing,
  vorRadial,
];
