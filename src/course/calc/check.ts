// Calc engine — checking an answer and naming the likely mistake.
//
// A generator's check() re-reads its inputs from the problem's givens (problems are plain JSON, regenerated from the
// seed), lists the wrong answers that a known mistake would give (variation applied the wrong way, sin / cos swapped,
// WCA not tripled…), and hands them to checkNumeric(), which:
//   1. converts the response into the problem's unit (the student may answer in km/h, the answer is in kt);
//   2. accepts it within the problem's tolerance (angles wrap: 360 = 000, −5 = 355);
//   3. checks every part (numbers within their tolerance, choices case-insensitively);
//   4. if it is wrong, names the mistake: a generator's known wrong answer first, then "right number, other unit",
//      then a factor slip (×10, ×60, ×100, ×1000), then "right method, rounded outside the tolerance".
// Verdict texts are corrective and ACS-like: they say what to do, not only that it is wrong.
import type {
  CalcMistake,
  CalcMistakeId,
  CalcProblem,
  CalcResponse,
  CalcUnit,
  CalcVerdict,
  L10n,
} from "../types";
import { L, tr } from "./text";
import { convert, convertDelta, sameDimension, unitsLike } from "./units";

/** A wrong answer a known mistake gives, in the problem's unit. */
export interface Wrong {
  value: number;
  id: CalcMistakeId;
  /** default: the generic text for the id */
  text?: L10n;
}
/** A wrong value for one part. */
export interface PartWrong {
  key: string;
  value: number | string;
  id: CalcMistakeId;
  text?: L10n;
}
export interface CheckOptions {
  /** known wrong answers for the primary answer */
  wrongs?: Wrong[];
  /** known wrong values for parts */
  partWrongs?: PartWrong[];
  /** do not try the ×10 / ×60 factor diagnosis (answers where such ratios are meaningful) */
  noFactor?: boolean;
}

/** Generic texts (a generator's own text is preferred: it names the numbers). */
export const MISTAKE_TEXT: Record<CalcMistakeId, L10n> = {
  variationSign: L(
    "You applied variation the wrong way. East is least (subtract), West is best (add): true → magnetic.",
    "Déclinaison appliquée à l'envers. Est : on retranche, Ouest : on ajoute (vrai → magnétique).",
  ),
  deviationSign: L(
    "You applied deviation the wrong way. Read the compass card: “for MH, steer CH”.",
    "Déviation appliquée à l'envers. Lisez la carte de compensation : « pour Cm, afficher Cc ».",
  ),
  wcaSign: L(
    "You corrected away from the wind. Turn into the wind: wind from the right, heading right of the course.",
    "Correction du mauvais côté. Corrigez face au vent : vent de droite, cap à droite de la route.",
  ),
  reciprocal: L(
    "That is the reciprocal (180° off). Check whether the question asks the bearing TO or the radial FROM.",
    "C'est l'inverse (à 180°). Vérifiez si l'on demande le relèvement VERS ou la radiale DEPUIS la station.",
  ),
  toFrom: L(
    "TO / FROM reversed. The flag shows TO when the OBS course would take you toward the station.",
    "TO / FROM inversé. Le drapeau indique TO quand la route affichée mène vers la station.",
  ),
  unit: L(
    "Right number, wrong unit. Check the unit the question asks.",
    "Bon nombre, mauvaise unité. Vérifiez l'unité demandée.",
  ),
  factor: L(
    "Check the factor: a ×10 or ×60 slip (minutes vs hours, a decimal place).",
    "Vérifiez le facteur : une erreur ×10 ou ×60 (minutes et heures, une décimale).",
  ),
  rounding: L(
    "Right method, but outside the accepted margin. Carry one more digit until the last step.",
    "Bonne méthode, mais hors de la marge acceptée. Gardez un chiffre de plus jusqu'au bout.",
  ),
  headTailSwap: L(
    "Headwind and tailwind swapped. Wind FROM ahead of the wing line is a headwind.",
    "Vent de face et vent arrière inversés. Un vent venant de l'avant de l'axe des ailes est de face.",
  ),
  crossHeadSwap: L(
    "Crosswind and headwind swapped: crosswind = wind × sin(angle), headwind = wind × cos(angle).",
    "Vent traversier et vent de face inversés : traversier = vent × sin(angle), face = vent × cos(angle).",
  ),
  notTripled: L(
    "Outbound, triple the inbound wind correction (FAA IFH ch. 10): a single correction drifts you onto the inbound course.",
    "En éloignement, triplez la correction de dérive du rapprochement (FAA IFH ch. 10) : une correction simple vous ramène sur l'axe.",
  ),
  wrongSide: L(
    "The correction is on the wrong side. Re-draw the picture: which side is the wind, which side is the course?",
    "Correction du mauvais côté. Refaites le schéma : de quel côté est le vent, de quel côté est la route ?",
  ),
  isaReference: L(
    "Compare with ISA at that altitude (15 °C − 2 °C per 1,000 ft), not with 15 °C.",
    "Comparez à l'ISA à cette altitude (15 °C − 2 °C par 1 000 ft), pas à 15 °C.",
  ),
  reserve: L(
    "You forgot the reserve. The fuel on board must cover the trip AND the required reserve.",
    "Réserve oubliée. Le carburant doit couvrir le trajet ET la réserve réglementaire.",
  ),
  datum: L(
    "CG = total moment ÷ total weight. Do not average the arms.",
    "Centrage = moment total ÷ masse totale. Ne faites pas la moyenne des bras de levier.",
  ),
  other: L(
    "Not quite. Compare your working with the worked solution, one step at a time.",
    "Pas tout à fait. Comparez votre calcul à la solution, étape par étape.",
  ),
};

export function mistake(id: CalcMistakeId, text?: L10n): CalcMistake {
  return { id, text: text ?? MISTAKE_TEXT[id] };
}

/** A numeric given (throws if the problem lacks it: a generator bug, caught by the tests). */
export function givenNum(p: CalcProblem, key: string): number {
  const g = p.givens.find((x) => x.key === key);
  if (!g || typeof g.value !== "number")
    throw new Error(`calc: given '${key}' missing on ${p.generatorId}`);
  return g.value;
}
export function givenStr(p: CalcProblem, key: string): string {
  const g = p.givens.find((x) => x.key === key);
  if (!g) throw new Error(`calc: given '${key}' missing on ${p.generatorId}`);
  return String(g.value);
}
export function hasGiven(p: CalcProblem, key: string): boolean {
  return p.givens.some((x) => x.key === key);
}

/** signed difference a − b; angles wrap to (−180, 180] */
export function diff(a: number, b: number, unit: CalcUnit): number {
  const d = a - b;
  if (unit !== "deg") return d;
  let r = ((d % 360) + 360) % 360;
  if (r > 180) r -= 360;
  return r;
}

const EPS = 1e-6;
const norm = (v: number | string) => String(v).trim().toLowerCase();

function partOk(
  expected: number | string,
  got: number | string | undefined,
  unit: CalcUnit | undefined,
  tol: number | undefined,
): boolean {
  if (got === undefined || got === "") return false;
  if (typeof expected === "number") {
    const g =
      typeof got === "number" ? got : Number(String(got).replace(",", "."));
    if (!Number.isFinite(g)) return false;
    return Math.abs(diff(g, expected, unit ?? "none")) <= (tol ?? 0) + EPS;
  }
  return norm(expected) === norm(got);
}

/** Check a response against a problem (see the file header). */
export function checkNumeric(
  problem: CalcProblem,
  response: CalcResponse,
  opts: CheckOptions = {},
): CalcVerdict {
  const unit = problem.unit;
  const tol = problem.tolerance;
  let value = response.answer;
  let unitMistake: CalcMistake | undefined;
  if (response.unit && response.unit !== unit) {
    if (sameDimension(response.unit, unit))
      value = convert(value, response.unit, unit);
    else
      unitMistake = mistake(
        "unit",
        tr(
          (f) =>
            `The answer is in ${f.unit(unit) || "a plain number"}, not ${f.unit(response.unit!)}.`,
          (f) =>
            `La réponse s'exprime en ${f.unit(unit) || "nombre sans unité"}, pas en ${f.unit(response.unit!)}.`,
        ),
      );
  }
  const finite = Number.isFinite(value);
  const error =
    finite && !unitMistake ? diff(value, problem.answer, unit) : NaN;
  const primaryOk = finite && !unitMistake && Math.abs(error) <= tol + EPS;

  const parts: Record<string, boolean> = {};
  for (const p of problem.parts ?? [])
    parts[p.key] = partOk(
      p.answer,
      response.parts?.[p.key],
      p.unit,
      p.tolerance,
    );
  const partsOk = Object.values(parts).every(Boolean);

  const verdict: CalcVerdict = { ok: primaryOk && partsOk };
  if (Number.isFinite(error)) verdict.error = error;
  if (problem.parts?.length) verdict.parts = parts;
  if (verdict.ok) return verdict;

  if (!primaryOk)
    verdict.mistake = unitMistake ?? diagnose(problem, value, opts);
  else {
    // the main answer is right: name the first wrong part
    const bad = (problem.parts ?? []).find((p) => !parts[p.key]);
    if (bad) {
      const got = response.parts?.[bad.key];
      const known = (opts.partWrongs ?? []).find(
        (w) =>
          w.key === bad.key &&
          got !== undefined &&
          partOk(w.value, got, bad.unit, bad.tolerance),
      );
      verdict.mistake = known
        ? mistake(known.id, known.text)
        : mistake(
            "other",
            got === undefined || got === ""
              ? tr(
                  () =>
                    `The main answer is right. Now answer “${bad.label.en}” too.`,
                  () =>
                    `La réponse principale est juste. Répondez aussi à « ${bad.label.fr ?? bad.label.en} ».`,
                )
              : tr(
                  () =>
                    `The main answer is right, but “${bad.label.en}” is not. Look at that step of the solution.`,
                  () =>
                    `La réponse principale est juste, mais pas « ${bad.label.fr ?? bad.label.en} ». Regardez cette étape de la solution.`,
                ),
          );
    }
  }
  return verdict;
}

function diagnose(
  problem: CalcProblem,
  value: number,
  opts: CheckOptions,
): CalcMistake {
  const { unit, answer, tolerance: tol } = problem;
  if (!Number.isFinite(value))
    return mistake("other", L("Enter a number.", "Entrez un nombre."));
  // 1. the generator's known mistakes (skipping any that coincide with the right answer)
  for (const w of opts.wrongs ?? []) {
    if (!Number.isFinite(w.value)) continue;
    if (Math.abs(diff(w.value, answer, unit)) <= tol + EPS) continue;
    if (Math.abs(diff(value, w.value, unit)) <= tol + EPS)
      return mistake(w.id, w.text);
  }
  // 2. the right number in another unit of the same dimension
  for (const u of unitsLike(unit)) {
    if (u === unit) continue;
    const there = convert(answer, unit, u);
    const tolThere = Math.max(
      convertDelta(tol, unit, u),
      Math.abs(there) * 0.01,
    );
    if (Math.abs(there - answer) <= tol) continue;
    if (Math.abs(value - there) <= tolThere)
      return mistake(
        "unit",
        tr(
          (f) =>
            `That is the answer in ${f.unit(u)}. The question asks ${f.unit(unit)}.`,
          (f) =>
            `C'est la réponse en ${f.unit(u)}. La question demande des ${f.unit(unit)}.`,
        ),
      );
  }
  // 3. a factor slip
  if (!opts.noFactor && unit !== "deg" && Math.abs(answer) > EPS) {
    for (const k of [10, 60, 100, 1000]) {
      if (
        Math.abs(value - answer * k) <= tol * k ||
        Math.abs(value - answer / k) <=
          Math.max(tol / k, Math.abs(answer / k) * 0.02)
      )
        return mistake("factor");
    }
  }
  // 4. right method, rounded outside the margin
  if (Math.abs(diff(value, answer, unit)) <= 3 * tol + EPS)
    return mistake("rounding");
  return mistake("other");
}
