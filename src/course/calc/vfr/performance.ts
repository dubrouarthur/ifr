// Calc engine — VFR performance: weight and balance (C172S-class sample table) and takeoff / landing distance factors.
import type { CalcPart, GeneratorDef } from "../../types";
import { checkNumeric, givenNum, givenStr, type PartWrong, type Wrong } from "../check";
import { L, tr } from "../text";
import { roundStep } from "../units";
import { defineGenerator, given, pickVariant, REF, variantParam } from "../kit";

// ================================================================== weight and balance
/** Sample figures, C172S class (training only: always use the aeroplane's own weighing report and AFM). */
export const WB = {
  emptyLb: 1663,
  emptyArm: 39.4,
  frontArm: 37,
  rearArm: 73,
  bag1Arm: 95,
  bag1MaxLb: 120,
  bag2Arm: 123,
  bag2MaxLb: 50,
  /** POH section 6: maximum combined weight for baggage areas 1 and 2 */
  bagTotalMaxLb: 120,
  fuelArm: 48,
  fuelLbPerGal: 6,
  fuelUsableGal: 53,
  maxTakeoffLb: 2550,
  /** forward limit: 35.0 in up to 1,950 lb, then straight to 41.0 in at 2,550 lb */
  fwdLowLb: 1950,
  fwdLow: 35,
  fwdHigh: 41,
  aft: 47.3,
} as const;

export const WB_EMPTY_MOMENT = Math.round(WB.emptyLb * WB.emptyArm);

export interface WbLoad {
  front: number;
  rear: number;
  bag1: number;
  bag2: number;
  fuelGal: number;
}
export interface WbResult {
  weight: number;
  moment: number;
  cg: number;
  fwdLimit: number;
  aftLimit: number;
  overweight: boolean;
  /** a station limit broken: baggage area 2 > 50 lb, areas 1 + 2 > 120 lb, fuel > 53 US gal usable */
  stationOver: ("bag1" | "bag2" | "bagTotal" | "fuel")[];
  within: boolean;
  rows: { key: string; weight: number; arm: number; moment: number }[];
}

export function wbFwdLimit(weightLb: number): number {
  if (weightLb <= WB.fwdLowLb) return WB.fwdLow;
  return WB.fwdLow + ((weightLb - WB.fwdLowLb) * (WB.fwdHigh - WB.fwdLow)) / (WB.maxTakeoffLb - WB.fwdLowLb);
}

export function solveWb(l: WbLoad): WbResult {
  const fuelLb = l.fuelGal * WB.fuelLbPerGal;
  const rows = [
    { key: "empty", weight: WB.emptyLb, arm: WB.emptyArm, moment: WB_EMPTY_MOMENT },
    { key: "front", weight: l.front, arm: WB.frontArm, moment: l.front * WB.frontArm },
    { key: "rear", weight: l.rear, arm: WB.rearArm, moment: l.rear * WB.rearArm },
    { key: "bag1", weight: l.bag1, arm: WB.bag1Arm, moment: l.bag1 * WB.bag1Arm },
    { key: "bag2", weight: l.bag2, arm: WB.bag2Arm, moment: l.bag2 * WB.bag2Arm },
    { key: "fuel", weight: fuelLb, arm: WB.fuelArm, moment: fuelLb * WB.fuelArm },
  ];
  const weight = rows.reduce((a, r) => a + r.weight, 0);
  const moment = rows.reduce((a, r) => a + r.moment, 0);
  const cg = moment / weight;
  const fwdLimit = wbFwdLimit(weight);
  const overweight = weight > WB.maxTakeoffLb;
  const stationOver: WbResult["stationOver"] = [];
  if (l.bag1 > WB.bag1MaxLb) stationOver.push("bag1");
  if (l.bag2 > WB.bag2MaxLb) stationOver.push("bag2");
  if (l.bag1 + l.bag2 > WB.bagTotalMaxLb) stationOver.push("bagTotal");
  if (l.fuelGal > WB.fuelUsableGal) stationOver.push("fuel");
  return {
    weight,
    moment,
    cg,
    fwdLimit,
    aftLimit: WB.aft,
    overweight,
    stationOver,
    within: !overweight && !stationOver.length && cg >= fwdLimit && cg <= WB.aft,
    rows,
  };
}

type WbVariant = "cg" | "fuel";

const STATION_NAME: Record<string, { en: string; fr: string }> = {
  empty: { en: "Empty aeroplane", fr: "Avion à vide" },
  front: { en: "Front seats", fr: "Sièges avant" },
  rear: { en: "Rear seats", fr: "Sièges arrière" },
  bag1: { en: "Baggage area 1", fr: "Soute 1" },
  bag2: { en: "Baggage area 2", fr: "Soute 2" },
  fuel: { en: "Fuel", fr: "Carburant" },
};

export const weightBalance: GeneratorDef = defineGenerator({
  id: "vfr.weightBalance",
  title: L("Weight and balance", "Masse et centrage"),
  category: "vfr",
  summary: L(
    "Moments and CG for a loaded C172S-class aeroplane; are you inside the envelope? How much fuel can you take?",
    "Moments et centre de gravité d'un avion type C172S chargé : êtes-vous dans le domaine ? Combien de carburant pouvez-vous emporter ?",
  ),
  params: [
    variantParam([
      { value: "cg", label: L("CG and envelope", "Centrage et domaine") },
      { value: "fuel", label: L("Maximum fuel", "Carburant maximum") },
    ]),
  ],
  generate(rng, params) {
    const variant = pickVariant<WbVariant>(rng, params, ["cg", "fuel"]);
    let load: WbLoad = { front: 340, rear: 0, bag1: 0, bag2: 0, fuelGal: 40 };
    for (let tries = 0; tries < 60; tries++) {
      const heavy = variant === "fuel";
      const l: WbLoad = {
        front: rng.range(heavy ? 330 : 190, heavy ? 430 : 440, 5),
        rear: rng.chance(heavy ? 0.95 : 0.6) ? rng.range(heavy ? 240 : 100, heavy ? 340 : 360, 5) : 0,
        bag1: rng.chance(0.8) ? rng.range(10, heavy ? 100 : 110, 5) : 0,
        bag2: 0,
        fuelGal: heavy ? 0 : rng.range(20, 53, 1),
      };
      // the POH station limits hold: area 2 ≤ 50 lb and areas 1 + 2 ≤ 120 lb combined
      const bag2Max = Math.min(WB.bag2MaxLb, WB.bagTotalMaxLb - l.bag1);
      if (bag2Max >= 10 && rng.chance(0.3)) l.bag2 = rng.range(10, bag2Max, 5);
      const r = solveWb(l);
      if (variant === "cg") {
        const margin = Math.min(Math.abs(r.cg - r.fwdLimit), Math.abs(r.cg - WB.aft));
        const wMargin = Math.abs(r.weight - WB.maxTakeoffLb);
        load = l;
        // reject borderline cases, and prefer one in four problems outside the envelope
        if (margin >= 0.35 && wMargin >= 12 && (r.within || tries > 8 || rng.chance(0.4))) break;
      } else {
        const allowed = (WB.maxTakeoffLb - r.weight) / WB.fuelLbPerGal;
        load = l;
        if (allowed >= 8 && allowed <= 40) break;
      }
    }
    const r = solveWb(load);
    const stations = r.rows.filter((x) => x.key !== "fuel" || variant === "cg");
    const loadText = (lang: "en" | "fr") =>
      r.rows
        .filter((x) => x.key !== "empty" && !(variant === "fuel" && x.key === "fuel") && x.weight > 0)
        .map((x) => `${STATION_NAME[x.key][lang]} ${Math.round(x.key === "fuel" ? load.fuelGal : x.weight)} ${x.key === "fuel" ? (lang === "fr" ? "gal US" : "US gal") : "lb"}`)
        .join(", ");
    const givens = [
      given("front", L("Front seats", "Sièges avant"), load.front, "lb"),
      given("rear", L("Rear seats", "Sièges arrière"), load.rear, "lb"),
      given("bag1", L("Baggage 1", "Soute 1"), load.bag1, "lb"),
      given("bag2", L("Baggage 2", "Soute 2"), load.bag2, "lb"),
      given("fuelGal", L("Fuel", "Carburant"), load.fuelGal, "usgal"),
      given("variant", L("Question", "Question"), variant),
    ];
    const tableSteps = tr(
      (f) => `Moment = weight × arm for each station (lb·in): ${stations.map((x) => `${STATION_NAME[x.key].en.toLowerCase()} ${f.n(x.weight)} × ${f.n(x.arm, 1)} = ${f.n(x.moment)}`).join("; ")}.`,
      (f) => `Moment = masse × bras de levier pour chaque station (lb·in) : ${stations.map((x) => `${STATION_NAME[x.key].fr.toLowerCase()} ${f.n(x.weight)} × ${f.n(x.arm, 1)} = ${f.n(x.moment)}`).join(" ; ")}.`,
    );
    const refs = [REF.phak("ch. 10 (weight and balance)"), REF.poh172("section 6 (weight and balance)")];
    const common = {
      ruleOfThumb: L(
        "CG = total moment ÷ total weight. Heavy things aft (rear seats, baggage 2) move the CG aft; fuel is nearly at the CG, so burning it changes little.",
        "CG = moment total ÷ masse totale. Ce qui est lourd à l'arrière (sièges arrière, soute 2) recule le centre de gravité ; le carburant est proche du CG, le brûler change peu.",
      ),
      formula: L("CG = Σ(weight × arm) ÷ Σ weight", "CG = Σ(masse × bras) ÷ Σ masse"),
      refs,
    };
    if (variant === "cg") {
      const parts: CalcPart[] = [
        { key: "weight", label: L("Total weight", "Masse totale"), answer: Math.round(r.weight), unit: "lb", tolerance: 3 },
        { key: "moment", label: L("Total moment", "Moment total"), answer: Math.round(r.moment), unit: "lbIn", tolerance: 250 },
        {
          key: "within",
          label: L("Within the envelope?", "Dans le domaine ?"),
          answer: r.within ? "yes" : "no",
          choices: [
            { value: "yes", label: L("Yes", "Oui") },
            { value: "no", label: L("No", "Non") },
          ],
        },
      ];
      return {
        prompt: tr(
          () => `C172S-class aeroplane, empty ${WB.emptyLb} lb at arm ${WB.emptyArm} in. Loaded: ${loadText("en")}. (Fuel 6 lb/gal.) What is the CG at takeoff, and is the aeroplane inside the envelope?`,
          () => `Avion type C172S, à vide ${WB.emptyLb} lb au bras ${WB.emptyArm} in. Chargement : ${loadText("fr")}. (Carburant 6 lb/gal.) Quel est le centrage au décollage, et l'avion est-il dans le domaine ?`,
        ),
        givens,
        answer: roundStep(r.cg, 0.1),
        unit: "in",
        tolerance: 0.2,
        parts,
        solutionSteps: [
          tableSteps,
          tr(
            (f) => `Station limits first: baggage ${f.n(load.bag1 + load.bag2)} lb in areas 1 + 2 (maximum ${WB.bagTotalMaxLb} lb combined, ${WB.bag2MaxLb} lb in area 2)${r.stationOver.length ? ": OVER the limit, outside the envelope whatever the CG" : ": within limits"}.`,
            (f) => `D'abord les limites par station : bagages ${f.n(load.bag1 + load.bag2)} lb en soutes 1 + 2 (maximum ${WB.bagTotalMaxLb} lb au total, ${WB.bag2MaxLb} lb en soute 2)${r.stationOver.length ? " : limite DÉPASSÉE, hors domaine quel que soit le centrage" : " : dans les limites"}.`,
          ),
          tr(
            (f) => `Totals: weight ${f.u(r.weight, "lb")}, moment ${f.n(r.moment)} lb·in.`,
            (f) => `Totaux : masse ${f.u(r.weight, "lb")}, moment ${f.n(r.moment)} lb·in.`,
          ),
          tr(
            (f) => `CG = ${f.n(r.moment)} ÷ ${f.n(r.weight)} = ${f.u(r.cg, "in", 1)} aft of the datum.`,
            (f) => `CG = ${f.n(r.moment)} ÷ ${f.n(r.weight)} = ${f.u(r.cg, "in", 1)} derrière la référence.`,
          ),
          tr(
            (f) =>
              r.overweight
                ? `${f.u(r.weight, "lb")} is above the ${f.n(WB.maxTakeoffLb)} lb maximum takeoff weight: outside the envelope whatever the CG. Offload before flying.`
                : `At ${f.n(r.weight)} lb the limits are ${f.n(r.fwdLimit, 1)} to ${f.n(WB.aft, 1)} in: ${r.within ? "the CG is inside" : r.cg < r.fwdLimit ? "the CG is too far forward" : "the CG is too far aft"}.`,
            (f) =>
              r.overweight
                ? `${f.u(r.weight, "lb")} dépasse la masse maximale au décollage de ${f.n(WB.maxTakeoffLb)} lb : hors domaine, quel que soit le centrage. Délestez avant de voler.`
                : `À ${f.n(r.weight)} lb les limites sont ${f.n(r.fwdLimit, 1)} à ${f.n(WB.aft, 1)} in : ${r.within ? "le centrage est dans le domaine" : r.cg < r.fwdLimit ? "le centrage est trop avant" : "le centrage est trop arrière"}.`,
          ),
        ],
        ...common,
        diagram: {
          kind: "calc",
          calc: {
            kind: "cgEnvelope",
            table: "c172s",
            points: [
              { weightLb: WB.emptyLb, momentLbIn: WB_EMPTY_MOMENT, label: L("Empty", "À vide") },
              { weightLb: Math.round(r.weight), momentLbIn: Math.round(r.moment), label: L("Takeoff", "Décollage") },
            ],
          },
        },
      };
    }
    const noFuel = r.weight;
    const allowedExact = (WB.maxTakeoffLb - noFuel) / WB.fuelLbPerGal;
    const allowed = Math.min(WB.fuelUsableGal, Math.floor(allowedExact));
    const full = solveWb({ ...load, fuelGal: allowed });
    return {
      prompt: tr(
        () => `C172S-class aeroplane, empty ${WB.emptyLb} lb. Loaded: ${loadText("en")}, no fuel yet. Maximum takeoff weight ${WB.maxTakeoffLb} lb, fuel 6 lb/gal. How many US gallons of fuel can you take (whole gallons, round down)?`,
        () => `Avion type C172S, à vide ${WB.emptyLb} lb. Chargement : ${loadText("fr")}, pas encore de carburant. Masse maximale au décollage ${WB.maxTakeoffLb} lb, carburant 6 lb/gal. Combien de gallons US pouvez-vous emporter (gallons entiers, arrondi par défaut) ?`,
      ),
      givens,
      answer: allowed,
      unit: "usgal",
      tolerance: 1,
      parts: [{ key: "weight", label: L("Weight before fuel", "Masse avant carburant"), answer: Math.round(noFuel), unit: "lb", tolerance: 3 }],
      solutionSteps: [
        tr(
          (f) => `Weight before fuel: ${f.n(WB.emptyLb)} + ${f.n(load.front)} + ${f.n(load.rear)} + ${f.n(load.bag1)} + ${f.n(load.bag2)} = ${f.u(noFuel, "lb")}.`,
          (f) => `Masse avant carburant : ${f.n(WB.emptyLb)} + ${f.n(load.front)} + ${f.n(load.rear)} + ${f.n(load.bag1)} + ${f.n(load.bag2)} = ${f.u(noFuel, "lb")}.`,
        ),
        tr(
          (f) => `Room left: ${f.n(WB.maxTakeoffLb)} − ${f.n(noFuel)} = ${f.u(WB.maxTakeoffLb - noFuel, "lb")}.`,
          (f) => `Marge restante : ${f.n(WB.maxTakeoffLb)} − ${f.n(noFuel)} = ${f.u(WB.maxTakeoffLb - noFuel, "lb")}.`,
        ),
        tr(
          (f) => `÷ 6 lb/gal = ${f.n(allowedExact, 1)} gal: take ${f.n(allowed)} gal at most (round down, never up).`,
          (f) => `÷ 6 lb/gal = ${f.n(allowedExact, 1)} gal : ${f.n(allowed)} gal au plus (arrondi par défaut, jamais par excès).`,
        ),
        tr(
          (f) => `Check the CG with that fuel: ${f.u(full.cg, "in", 1)} for ${f.u(full.weight, "lb")} — ${full.within ? "inside the envelope" : "outside the envelope: move the load"}.`,
          (f) => `Contrôle du centrage avec ce carburant : ${f.u(full.cg, "in", 1)} pour ${f.u(full.weight, "lb")} — ${full.within ? "dans le domaine" : "hors domaine : déplacez la charge"}.`,
        ),
      ],
      ...common,
      ruleOfThumb: L(
        "Fuel to add = (maximum weight − weight without fuel) ÷ 6 lb per US gallon. Round down.",
        "Carburant à ajouter = (masse maximale − masse sans carburant) ÷ 6 lb par gallon US. Arrondissez par défaut.",
      ),
      formula: L("gal = (MTOW − W₀) ÷ 6", "gal = (MTOW − M₀) ÷ 6"),
      diagram: {
        kind: "calc",
        calc: {
          kind: "cgEnvelope",
          table: "c172s",
          points: [
            { weightLb: WB.emptyLb, momentLbIn: WB_EMPTY_MOMENT, label: L("Empty", "À vide") },
            { weightLb: Math.round(full.weight), momentLbIn: Math.round(full.moment), label: L("Takeoff", "Décollage") },
          ],
        },
      },
    };
  },
  check(problem, response) {
    const variant = givenStr(problem, "variant");
    const load: WbLoad = {
      front: givenNum(problem, "front"),
      rear: givenNum(problem, "rear"),
      bag1: givenNum(problem, "bag1"),
      bag2: givenNum(problem, "bag2"),
      fuelGal: givenNum(problem, "fuelGal"),
    };
    if (variant === "fuel") {
      const w0 = solveWb({ ...load, fuelGal: 0 }).weight;
      return checkNumeric(problem, response, {
        wrongs: [
          { value: Math.ceil((WB.maxTakeoffLb - w0) / WB.fuelLbPerGal), id: "rounding", text: L("Round DOWN: one more gallon would put you over the maximum weight.", "Arrondissez par DÉFAUT : un gallon de plus dépasserait la masse maximale.") },
          { value: (WB.maxTakeoffLb - (w0 - WB.emptyLb)) / WB.fuelLbPerGal, id: "datum", text: L("Do not forget the empty weight of the aeroplane in the total.", "N'oubliez pas la masse à vide de l'avion dans le total.") },
          { value: WB.maxTakeoffLb - w0, id: "unit", text: L("That is the weight of the fuel in pounds. The question asks for US gallons: ÷ 6.", "C'est la masse du carburant en livres. La question demande des gallons US : ÷ 6.") },
        ],
        partWrongs: [{ key: "weight", value: Math.round(w0 - WB.emptyLb), id: "datum", text: L("Add the empty weight (1,663 lb) to the loading.", "Ajoutez la masse à vide (1 663 lb) au chargement.") }],
        noFactor: true,
      });
    }
    const r = solveWb(load);
    const arms: number[] = [WB.emptyArm];
    if (load.front) arms.push(WB.frontArm);
    if (load.rear) arms.push(WB.rearArm);
    if (load.bag1) arms.push(WB.bag1Arm);
    if (load.bag2) arms.push(WB.bag2Arm);
    if (load.fuelGal) arms.push(WB.fuelArm);
    const avgArm = arms.reduce((a, b) => a + b, 0) / arms.length;
    const noEmpty = (r.moment - WB_EMPTY_MOMENT) / (r.weight - WB.emptyLb);
    const wrongs: Wrong[] = [
      { value: avgArm, id: "datum", text: L("Do not average the arms: weight each arm by its load. CG = total moment ÷ total weight.", "Ne faites pas la moyenne des bras : pondérez chaque bras par sa charge. CG = moment total ÷ masse totale.") },
      { value: noEmpty, id: "datum", text: L("The empty aeroplane (1,663 lb at 39.4 in) belongs in the totals.", "L'avion à vide (1 663 lb au bras 39,4 in) fait partie des totaux.") },
      { value: r.moment / 1000, id: "unit", text: L("That is the moment divided by 1,000, not the CG. Divide the moment by the WEIGHT.", "C'est le moment divisé par 1 000, pas le centrage. Divisez le moment par la MASSE.") },
    ];
    const partWrongs: PartWrong[] = [
      { key: "weight", value: Math.round(r.weight - WB.emptyLb), id: "datum", text: L("Add the empty weight (1,663 lb) to the loading.", "Ajoutez la masse à vide (1 663 lb) au chargement.") },
      { key: "within", value: r.within ? "no" : "yes", id: "other", text: r.overweight ? L("Check the weight first: above 2,550 lb the aeroplane is out whatever the CG.", "Vérifiez d'abord la masse : au-delà de 2 550 lb l'avion est hors domaine, quel que soit le centrage.") : L("Compare the CG with the limits AT THIS WEIGHT: the forward limit moves aft as weight increases.", "Comparez le centrage aux limites À CETTE MASSE : la limite avant recule quand la masse augmente.") },
    ];
    return checkNumeric(problem, response, { wrongs, partWrongs, noFactor: true });
  },
});

// ================================================================== takeoff and landing distance factors
export type FactorMode = "takeoff" | "landing";
export type Surface = "paved" | "dryGrass" | "wetGrass";

/** POH note (C172S, sample): −10 % per 9 kt headwind; + 10 % per 2 kt tailwind (tailwinds up to 10 kt). */
export const HEADWIND_KT_PER_10PCT = 9;
export const TAILWIND_KT_PER_10PCT = 2;
/** CAA SafetySense 7 surface factors (applied to the TOTAL distances: takeoff to 50 ft, landing from 50 ft) */
export const SURFACE_FACTOR: Record<FactorMode, Record<Surface, number>> = {
  takeoff: { paved: 1, dryGrass: 1.2, wetGrass: 1.3 },
  landing: { paved: 1, dryGrass: 1.15, wetGrass: 1.35 },
};
/** the unfavourable slope only: + 5 % per 1 % (takeoff uphill, landing downhill); no credit for the favourable one */
export const SLOPE_PCT_PER_PERCENT = 5;
/** CAA SafetySense 7 recommended safety factor on the factored distance (public transport: mandatory) */
export const SAFETY_FACTOR: Record<FactorMode, number> = { takeoff: 1.33, landing: 1.43 };

export interface FactorInput {
  mode: FactorMode;
  baseFt: number;
  /** + headwind, − tailwind (kt) */
  headKt: number;
  surface: Surface;
  /** adverse slope, % (0 when none) */
  slopePct: number;
}
export interface FactorResult {
  windFactor: number;
  surfaceFactor: number;
  slopeFactor: number;
  total: number;
  distance: number;
  additive: number;
}
export function solveFactors(i: FactorInput): FactorResult {
  const windFactor = i.headKt >= 0 ? 1 - (0.1 * i.headKt) / HEADWIND_KT_PER_10PCT : 1 + (0.1 * -i.headKt) / TAILWIND_KT_PER_10PCT;
  const surfaceFactor = SURFACE_FACTOR[i.mode][i.surface];
  const slopeFactor = 1 + (i.slopePct * SLOPE_PCT_PER_PERCENT) / 100;
  const total = windFactor * surfaceFactor * slopeFactor;
  const additive = 1 + (windFactor - 1) + (surfaceFactor - 1) + (slopeFactor - 1);
  return { windFactor, surfaceFactor, slopeFactor, total, distance: i.baseFt * total, additive: i.baseFt * additive };
}

const SURFACE_NAME: Record<Surface, { en: string; fr: string }> = {
  paved: { en: "paved", fr: "en dur" },
  dryGrass: { en: "dry short grass", fr: "herbe courte sèche" },
  wetGrass: { en: "wet grass", fr: "herbe mouillée" },
};

export const takeoffLandingFactors: GeneratorDef = defineGenerator({
  id: "vfr.takeoffLandingFactors",
  title: L("Takeoff and landing distance corrections", "Corrections des distances de décollage et d'atterrissage"),
  category: "vfr",
  summary: L(
    "Correct a chart distance for wind, surface and slope, then decide whether the runway is long enough.",
    "Corrigez une distance d'abaque du vent, de la surface et de la pente, puis décidez si la piste est assez longue.",
  ),
  params: [
    variantParam([
      { value: "takeoff", label: L("Takeoff", "Décollage") },
      { value: "landing", label: L("Landing", "Atterrissage") },
    ]),
  ],
  generate(rng, params) {
    const mode = pickVariant<FactorMode>(rng, params, ["takeoff", "landing"]);
    // total distances (C172S POH section 5: takeoff to clear 50 ft, landing from 50 ft), the figures the factors apply to
    const baseFt = mode === "takeoff" ? rng.range(1100, 2000, 10) : rng.range(1000, 1500, 10);
    const tail = rng.chance(0.3);
    const headKt = tail ? -rng.range(2, 8, 1) : rng.range(0, 18, 1);
    const surface = rng.pick(["paved", "paved", "dryGrass", "wetGrass"] as const);
    const slopePct = rng.chance(0.4) ? rng.range(1, 3, 1) : 0;
    const s = solveFactors({ mode, baseFt, headKt, surface, slopePct });
    const answer = roundStep(s.distance, 10);
    const fits = rng.chance(0.5);
    const safety = SAFETY_FACTOR[mode];
    const required = s.distance * safety;
    let available = roundStep(Math.max(800, required * (fits ? rng.range(1.08, 1.3, 0.01) : rng.range(0.78, 0.92, 0.01))), 100);
    // never a coin toss once rounded to 100 ft: at least 4 % either side
    while (fits && available < required * 1.04) available += 100;
    while (!fits && available > required * 0.96) available -= 100;
    const fitsTrue = required <= available;
    const runwayName = mode === "takeoff" ? "TODA" : "LDA";
    const wind = headKt >= 0 ? `${headKt} kt headwind` : `${-headKt} kt tailwind`;
    const windFr = headKt >= 0 ? `${headKt} kt de face` : `${-headKt} kt arrière`;
    const slopeAdverse = mode === "takeoff" ? "uphill" : "downhill";
    const slopeFr = mode === "takeoff" ? "montante" : "descendante";
    const pct = (x: number) => Math.round((x - 1) * 100);
    return {
      prompt: tr(
        (f) =>
          `${mode === "takeoff" ? "Takeoff distance to 50 ft" : "Landing distance from 50 ft"} from the chart (sea level, no wind, paved, level): ${f.u(baseFt, "ft")}. Today: ${wind}, ${SURFACE_NAME[surface].en} runway${slopePct ? `, ${slopePct} % ${slopeAdverse} slope` : ""}. What is the corrected distance, and with the × ${f.n(safety, 2)} safety factor, does it fit in the ${f.u(available, "ft")} ${runwayName}?`,
        (f) =>
          `${mode === "takeoff" ? "Distance de décollage jusqu'à 50 ft" : "Distance d'atterrissage depuis 50 ft"} de l'abaque (niveau de la mer, sans vent, en dur, à plat) : ${f.u(baseFt, "ft")}. Aujourd'hui : ${windFr}, piste ${SURFACE_NAME[surface].fr}${slopePct ? `, pente ${slopeFr} de ${slopePct} %` : ""}. Quelle est la distance corrigée, et avec le coefficient de sécurité × ${f.n(safety, 2)}, tient-elle dans les ${f.u(available, "ft")} de ${runwayName} ?`,
      ),
      givens: [
        given("mode", L("Phase", "Phase"), mode),
        given("baseFt", L("Chart distance", "Distance de l'abaque"), baseFt, "ft"),
        given("headKt", L("Headwind (− = tailwind)", "Vent de face (− = arrière)"), headKt, "kt"),
        given("surface", L("Surface", "Surface"), surface, undefined, L(SURFACE_NAME[surface].en, SURFACE_NAME[surface].fr)),
        given("slopePct", L("Adverse slope", "Pente défavorable"), slopePct, "pct"),
        given("availableFt", L(mode === "takeoff" ? "TODA" : "LDA", mode === "takeoff" ? "TODA" : "LDA"), available, "ft"),
      ],
      answer,
      unit: "ft",
      tolerance: Math.max(20, answer * 0.015),
      parts: [
        {
          key: "fits",
          label: L(`Fits with the × ${SAFETY_FACTOR[mode]} factor?`, `Tient avec le coefficient × ${String(SAFETY_FACTOR[mode]).replace(".", ",")} ?`),
          answer: fitsTrue ? "yes" : "no",
          choices: [
            { value: "yes", label: L("Yes", "Oui") },
            { value: "no", label: L("No", "Non") },
          ],
        },
      ],
      solutionSteps: [
        tr(
          (f) => `Wind: ${headKt >= 0 ? `headwind −10 % per ${HEADWIND_KT_PER_10PCT} kt → ${f.n(headKt)} kt = ${f.n(pct(s.windFactor))} %` : `tailwind +10 % per ${TAILWIND_KT_PER_10PCT} kt → ${f.n(-headKt)} kt = +${f.n(pct(s.windFactor))} %`}: × ${f.n(s.windFactor, 3)}.`,
          (f) => `Vent : ${headKt >= 0 ? `face −10 % par ${HEADWIND_KT_PER_10PCT} kt → ${f.n(headKt)} kt = ${f.n(pct(s.windFactor))} %` : `arrière +10 % par ${TAILWIND_KT_PER_10PCT} kt → ${f.n(-headKt)} kt = +${f.n(pct(s.windFactor))} %`} : × ${f.n(s.windFactor, 3)}.`,
        ),
        tr(
          (f) => `Surface (${SURFACE_NAME[surface].en}): × ${f.n(s.surfaceFactor, 2)}. Slope: ${slopePct ? `${slopePct} % ${slopeAdverse} → + ${f.n(slopePct * SLOPE_PCT_PER_PERCENT)} % = × ${f.n(s.slopeFactor, 2)}` : "none, × 1.00"}.`,
          (f) => `Surface (${SURFACE_NAME[surface].fr}) : × ${f.n(s.surfaceFactor, 2)}. Pente : ${slopePct ? `${slopePct} % ${slopeFr} → + ${f.n(slopePct * SLOPE_PCT_PER_PERCENT)} % = × ${f.n(s.slopeFactor, 2)}` : "aucune, × 1,00"}.`,
        ),
        tr(
          (f) => `Multiply the factors: ${f.n(baseFt)} × ${f.n(s.windFactor, 3)} × ${f.n(s.surfaceFactor, 2)} × ${f.n(s.slopeFactor, 2)} = ${f.u(s.distance, "ft")} (≈ ${f.n(answer)}).`,
          (f) => `Multipliez les facteurs : ${f.n(baseFt)} × ${f.n(s.windFactor, 3)} × ${f.n(s.surfaceFactor, 2)} × ${f.n(s.slopeFactor, 2)} = ${f.u(s.distance, "ft")} (≈ ${f.n(answer)}).`,
        ),
        tr(
          (f) => `Safety factor (SafetySense 7: × ${f.n(safety, 2)} ${mode === "takeoff" ? "on takeoff" : "on landing"}, the chart is a test-pilot figure): ${f.n(answer)} × ${f.n(safety, 2)} = ${f.u(required, "ft")} ${fitsTrue ? "≤" : ">"} ${f.n(available)} ft ${runwayName}: ${fitsTrue ? "it fits" : "it does not fit: wait, lighten, change runway or airfield"}.`,
          (f) => `Coefficient de sécurité (SafetySense 7 : × ${f.n(safety, 2)} ${mode === "takeoff" ? "au décollage" : "à l'atterrissage"}, l'abaque est un chiffre de pilote d'essai) : ${f.n(answer)} × ${f.n(safety, 2)} = ${f.u(required, "ft")} ${fitsTrue ? "≤" : ">"} ${f.n(available)} ft de ${runwayName} : ${fitsTrue ? "cela tient" : "cela ne tient pas : attendez, délestez, changez de piste ou d'aérodrome"}.`,
        ),
      ],
      ruleOfThumb: L(
        "On the total distance: headwind −10 % per 9 kt, tailwind +10 % per 2 kt (a tailwind hurts five times more than a headwind helps), grass +15 to 35 %, adverse slope +5 % per 1 %. Multiply the factors (no credit for a favourable slope), then × 1.33 takeoff / × 1.43 landing for safety.",
        "Sur la distance totale : vent de face −10 % par 9 kt, arrière +10 % par 2 kt (le vent arrière coûte cinq fois plus que le vent de face ne rapporte), herbe +15 à 35 %, pente défavorable +5 % par 1 %. Multipliez les facteurs (aucun crédit pour une pente favorable), puis × 1,33 au décollage / × 1,43 à l'atterrissage pour la sécurité.",
      ),
      formula: L("D = D₀ × f(wind) × f(surface) × f(slope)", "D = D₀ × f(vent) × f(surface) × f(pente)"),
      refs: [REF.phak("ch. 11 (performance: wind, runway surface and slope)"), REF.poh172("section 5 (notes on takeoff and landing charts)"), REF.caaSS7()],
    };
  },
  check(problem, response) {
    const mode = givenStr(problem, "mode") as FactorMode;
    const i: FactorInput = {
      mode,
      baseFt: givenNum(problem, "baseFt"),
      headKt: givenNum(problem, "headKt"),
      surface: givenStr(problem, "surface") as Surface,
      slopePct: givenNum(problem, "slopePct"),
    };
    const s = solveFactors(i);
    const swapped = solveFactors({ ...i, headKt: -i.headKt });
    const noSurface = solveFactors({ ...i, surface: "paved" });
    const noWind = solveFactors({ ...i, headKt: 0 });
    const noSlope = solveFactors({ ...i, slopePct: 0 });
    const wrongs: Wrong[] = [
      { value: swapped.distance, id: "headTailSwap", text: L("Headwind and tailwind swapped: a headwind SHORTENS the distance, a tailwind lengthens it a lot.", "Vent de face et vent arrière inversés : le vent de face RACCOURCIT la distance, le vent arrière l'allonge beaucoup.") },
      { value: s.additive, id: "rounding", text: L("Multiply the factors one after another instead of adding the percentages.", "Multipliez les facteurs l'un après l'autre au lieu d'additionner les pourcentages.") },
      { value: noSurface.distance, id: "other", text: L("You left out the runway surface factor.", "Vous avez oublié le facteur de surface de piste.") },
      { value: noWind.distance, id: "other", text: L("You left out the wind correction.", "Vous avez oublié la correction de vent.") },
    ];
    if (i.slopePct) wrongs.push({ value: noSlope.distance, id: "other", text: L("You left out the slope factor.", "Vous avez oublié le facteur de pente.") });
    if (i.headKt < 0) wrongs.push({ value: i.baseFt * (1 + (0.1 * -i.headKt) / HEADWIND_KT_PER_10PCT) * s.surfaceFactor * s.slopeFactor, id: "other", text: L("A tailwind costs +10 % per 2 kt, not per 9 kt.", "Le vent arrière coûte +10 % par 2 kt, pas par 9 kt.") });
    const partWrongs: PartWrong[] = [{ key: "fits", value: s.distance * SAFETY_FACTOR[mode] <= givenNum(problem, "availableFt") ? "no" : "yes", id: "other", text: L("Compare the CORRECTED distance × the safety factor (1.33 takeoff, 1.43 landing) with the runway available.", "Comparez la distance CORRIGÉE × le coefficient de sécurité (1,33 au décollage, 1,43 à l'atterrissage) à la piste disponible.") }];
    return checkNumeric(problem, response, { wrongs, partWrongs, noFactor: true });
  },
});

export const PERFORMANCE_GENERATORS = [weightBalance, takeoffLandingFactors];
