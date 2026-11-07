// Calc engine — VFR unit conversions: kt / km/h / mph, ft / m, hPa / inHg, °C / °F, US gal / L / lb avgas, lb / kg.
import type { CalcUnit, GeneratorDef, L10n } from "../../types";
import { checkNumeric, givenNum, givenStr, type Wrong } from "../check";
import { L, tr } from "../text";
import { AVGAS_LB_PER_USGAL, AVGAS_KG_PER_L, roundStep } from "../units";
import { defineGenerator, given, pickVariant, REF, variantParam } from "../kit";

export type ConversionGroup = "speed" | "length" | "pressure" | "temperature" | "fuel" | "mass";

export interface ConversionPair {
  id: string;
  group: ConversionGroup;
  from: CalcUnit;
  to: CalcUnit;
  lo: number;
  hi: number;
  step: number;
  /** exact conversion */
  exact(v: number): number;
  /** what the pilot says: the multiplier or the mental rule */
  rule(v: number): number;
  ruleText: L10n;
  formula: L10n;
  /** the situation in which the pilot needs this (fills the prompt) */
  ctx: L10n;
  /** decimals of the answer */
  digits: number;
  /** accepted relative margin (covers the rule of thumb AND the exact value) */
  tolRel: number;
  tolAbs: number;
  /** the factor multiplied (to) = (from) × k, for the “wrong way” diagnosis; absent for temperatures */
  k?: number;
}

const lin = (
  id: string,
  group: ConversionGroup,
  from: CalcUnit,
  to: CalcUnit,
  range: [number, number, number],
  k: number,
  ruleK: number,
  digits: number,
  tolRel: number,
  tolAbs: number,
  ctx: L10n,
  ruleText: L10n,
  formula: L10n,
): ConversionPair => ({
  id,
  group,
  from,
  to,
  lo: range[0],
  hi: range[1],
  step: range[2],
  exact: (v) => v * k,
  rule: (v) => v * ruleK,
  ruleText,
  formula,
  ctx,
  digits,
  tolRel,
  tolAbs,
  k,
});

export const CONVERSION_PAIRS: readonly ConversionPair[] = [
  lin("kt-kmh", "speed", "kt", "kmh", [60, 180, 5], 1.852, 1.85, 0, 0.012, 2,
    L("A European flight plan wants the speed in km/h.", "Un plan de vol européen demande la vitesse en km/h."),
    L("1 kt = 1.85 km/h: × 2, minus 10 %.", "1 kt = 1,85 km/h : × 2, moins 10 %."),
    L("km/h = kt × 1.852", "km/h = kt × 1,852")),
  lin("kmh-kt", "speed", "kmh", "kt", [100, 330, 10], 1 / 1.852, 1 / 1.85, 0, 0.012, 2,
    L("The wind on a foreign forecast is in km/h.", "Le vent d'une prévision étrangère est en km/h."),
    L("÷ 1.85: halve it, then add 10 %.", "÷ 1,85 : divisez par deux, puis ajoutez 10 %."),
    L("kt = km/h ÷ 1.852", "kt = km/h ÷ 1,852")),
  lin("kt-mph", "speed", "kt", "mph", [60, 160, 5], 1.150779, 1.15, 0, 0.012, 2,
    L("An American-built GPS app shows statute miles per hour.", "Une application GPS américaine affiche des miles par heure."),
    L("1 kt = 1.15 mph: add 15 %.", "1 kt = 1,15 mph : ajoutez 15 %."),
    L("mph = kt × 1.1508", "mph = kt × 1,1508")),
  lin("mph-kt", "speed", "mph", "kt", [70, 180, 5], 1 / 1.150779, 1 / 1.15, 0, 0.012, 2,
    L("An old POH gives speeds in mph.", "Un ancien manuel de vol donne les vitesses en mph."),
    L("÷ 1.15: subtract 13 %.", "÷ 1,15 : retranchez 13 %."),
    L("kt = mph ÷ 1.1508", "kt = mph ÷ 1,1508")),
  lin("ft-m", "length", "ft", "m", [500, 10000, 100], 0.3048, 0.3, 0, 0.02, 5,
    L("A foreign chart gives an elevation in metres; your altimeter reads feet.", "Une carte étrangère donne l'altitude en mètres ; votre altimètre est en pieds."),
    L("1 ft = 0.3 m: × 3, then ÷ 10.", "1 ft = 0,3 m : × 3, puis ÷ 10."),
    L("m = ft × 0.3048", "m = ft × 0,3048")),
  lin("m-ft", "length", "m", "ft", [150, 3000, 50], 1 / 0.3048, 3.3, 0, 0.012, 10,
    L("The runway length is published in metres; the POH chart is in feet.", "La longueur de piste est publiée en mètres ; l'abaque du manuel est en pieds."),
    L("1 m = 3.3 ft: × 3, then add 10 %.", "1 m = 3,3 ft : × 3, puis ajoutez 10 %."),
    L("ft = m ÷ 0.3048", "ft = m ÷ 0,3048")),
  // pressure: an altimeter setting is set to the unit (1 hPa, 0.01 inHg), so the tolerance is that unit. The mental
  // rule is anchored on the standard pressure (29.92 inHg = 1013 hPa), never "× 34" (29.92 × 34 = 1017)
  {
    ...lin("inhg-hpa", "pressure", "inHg", "hPa", [29.4, 30.6, 0.01], 33.8639, 33.86, 0, 0, 1,
      L("An ATIS gives the altimeter in inHg; you set hPa on a European altimeter.", "L'ATIS donne le calage en inHg ; votre altimètre européen est en hPa."),
      L("Start from 29.92 inHg = 1013 hPa; each 0.01 inHg is 0.34 hPa (0.1 inHg ≈ 3.4 hPa).", "Partez de 29,92 inHg = 1013 hPa ; chaque 0,01 inHg vaut 0,34 hPa (0,1 inHg ≈ 3,4 hPa)."),
      L("hPa = inHg × 33.864", "hPa = inHg × 33,864")),
    rule: (v: number) => 1013.25 + (v - 29.92) * 33.86,
  },
  {
    ...lin("hpa-inhg", "pressure", "hPa", "inHg", [985, 1045, 1], 1 / 33.8639, 1 / 33.86, 2, 0, 0.01,
      L("A METAR gives QNH in hPa; your performance chart wants inHg.", "Un METAR donne le QNH en hPa ; votre abaque de performances demande des inHg."),
      L("Start from 1013 hPa = 29.92 inHg; each hPa is 0.0295 inHg (34 hPa ≈ 1 inHg).", "Partez de 1013 hPa = 29,92 inHg ; chaque hPa vaut 0,0295 inHg (34 hPa ≈ 1 inHg)."),
      L("inHg = hPa ÷ 33.864", "inHg = hPa ÷ 33,864")),
    rule: (v: number) => 29.92 + (v - 1013.25) / 33.86,
  },
  {
    id: "c-f",
    group: "temperature",
    from: "degC",
    to: "degF",
    lo: -20,
    hi: 40,
    step: 1,
    exact: (c) => c * 1.8 + 32,
    rule: (c) => c * 2 + 30,
    ruleText: L("°F ≈ 2 × °C + 30 (good below 20 °C), exactly × 1.8 + 32.", "°F ≈ 2 × °C + 30 (bon sous 20 °C), exactement × 1,8 + 32."),
    formula: L("°F = °C × 9/5 + 32", "°F = °C × 9/5 + 32"),
    ctx: L("A US performance chart is entered in °F.", "Un abaque de performances américain s'entre en °F."),
    digits: 0,
    tolRel: 0,
    tolAbs: 1,
  },
  {
    id: "f-c",
    group: "temperature",
    from: "degF",
    to: "degC",
    lo: -4,
    hi: 104,
    step: 2,
    exact: (f) => (f - 32) / 1.8,
    rule: (f) => (f - 30) / 2,
    ruleText: L("°C ≈ (°F − 30) ÷ 2 (good below 70 °F), exactly (°F − 32) ÷ 1.8.", "°C ≈ (°F − 30) ÷ 2 (bon sous 70 °F), exactement (°F − 32) ÷ 1,8."),
    formula: L("°C = (°F − 32) × 5/9", "°C = (°F − 32) × 5/9"),
    ctx: L("An American ATIS reports the temperature in °F; the chart wants °C.", "Un ATIS américain donne la température en °F ; l'abaque demande des °C."),
    digits: 0,
    tolRel: 0,
    tolAbs: 1,
  },
  lin("gal-l", "fuel", "usgal", "L", [10, 53, 1], 3.785411784, 3.8, 0, 0.012, 1,
    L("You uplift fuel abroad and the pump reads litres.", "Vous avitaillez à l'étranger et la pompe affiche des litres."),
    L("1 US gal = 3.8 L (≈ 4 L, a little less).", "1 gal US = 3,8 L (≈ 4 L, un peu moins)."),
    L("L = gal US × 3.785", "L = gal US × 3,785")),
  lin("l-gal", "fuel", "L", "usgal", [40, 200, 5], 1 / 3.785411784, 1 / 3.8, 1, 0.015, 0.3,
    L("The fuel truck delivered litres; the POH and fuel gauge are in US gallons.", "Le camion a livré des litres ; le manuel et la jauge sont en gallons US."),
    L("÷ 3.8 (÷ 4, then add 5 %).", "÷ 3,8 (÷ 4, puis ajoutez 5 %)."),
    L("gal US = L ÷ 3.785", "gal US = L ÷ 3,785")),
  {
    id: "gal-lb",
    group: "fuel",
    from: "usgal",
    to: "lb",
    lo: 10,
    hi: 53,
    step: 1,
    exact: (g) => g * AVGAS_LB_PER_USGAL,
    rule: (g) => g * 6,
    ruleText: L("Avgas weighs 6 lb per US gallon.", "L'avgas pèse 6 lb par gallon US."),
    formula: L("lb = gal US × 6.0 (100LL ≈ 6.0 lb/gal at 15 °C)", "lb = gal US × 6,0 (100LL ≈ 6,0 lb/gal à 15 °C)"),
    ctx: L("Weight and balance needs the fuel in pounds.", "Le devis de masse et centrage demande le carburant en livres."),
    digits: 0,
    tolRel: 0.01,
    tolAbs: 2,
    k: AVGAS_LB_PER_USGAL,
  },
  {
    id: "l-kg",
    group: "fuel",
    from: "L",
    to: "kg",
    lo: 40,
    hi: 200,
    step: 5,
    exact: (l) => l * AVGAS_KG_PER_L,
    rule: (l) => l * 0.72,
    ruleText: L("Avgas weighs 0.72 kg per litre (jet fuel 0.8).", "L'avgas pèse 0,72 kg par litre (jet 0,8)."),
    formula: L("kg = L × 0.72", "kg = L × 0,72"),
    ctx: L("The aeroplane's loading sheet is in kilograms.", "Le devis de masse de l'avion est en kilogrammes."),
    digits: 0,
    tolRel: 0.015,
    tolAbs: 1,
    k: AVGAS_KG_PER_L,
  },
  lin("lb-kg", "mass", "lb", "kg", [100, 600, 10], 0.45359237, 0.45, 0, 0.012, 1,
    L("A passenger says their weight in pounds; the sheet is in kg.", "Un passager donne son poids en livres ; la feuille est en kg."),
    L("÷ 2.2 (halve it, then subtract 10 %).", "÷ 2,2 (la moitié, moins 10 %)."),
    L("kg = lb × 0.4536", "kg = lb × 0,4536")),
  lin("kg-lb", "mass", "kg", "lb", [40, 250, 5], 2.20462262, 2.2, 0, 0.012, 1,
    L("A passenger's weight is in kg; the C172 limits are in pounds.", "Le poids d'un passager est en kg ; les limites du C172 sont en livres."),
    L("× 2.2 (double it, then add 10 %).", "× 2,2 (le double, plus 10 %)."),
    L("lb = kg × 2.2046", "lb = kg × 2,2046")),
];

export const CONVERSION_GROUPS: readonly ConversionGroup[] = ["speed", "length", "pressure", "temperature", "fuel", "mass"];

/** the answer, rounded the way the pilot writes it, and the accepted margin */
export function solveConversion(pair: ConversionPair, v: number): { exact: number; rule: number; answer: number; tolerance: number } {
  const exact = pair.exact(v);
  const rule = pair.rule(v);
  const answer = roundStep(exact, 10 ** -pair.digits);
  const tolerance =
    pair.tolRel === 0
      ? pair.tolAbs
      : Math.max(pair.tolAbs, Math.abs(exact) * pair.tolRel, Math.abs(rule - exact) + 10 ** -pair.digits * 0.5);
  return { exact, rule, answer, tolerance };
}

const pairById = (id: string): ConversionPair => {
  const p = CONVERSION_PAIRS.find((x) => x.id === id);
  if (!p) throw new Error(`calc: unknown conversion ${id}`);
  return p;
};

export const unitConversion: GeneratorDef = defineGenerator({
  id: "vfr.unitConversion",
  title: L("Unit conversions", "Conversions d'unités"),
  category: "vfr",
  alsoIn: ["ifr"],
  summary: L(
    "kt, km/h, mph · ft, m · hPa, inHg · °C, °F · US gal, L, lb, kg: the conversions you do in your head every flight.",
    "kt, km/h, mph · ft, m · hPa, inHg · °C, °F · gal US, L, lb, kg : les conversions faites de tête à chaque vol.",
  ),
  params: [
    variantParam([
      { value: "speed", label: L("Speeds", "Vitesses") },
      { value: "length", label: L("Lengths", "Longueurs") },
      { value: "pressure", label: L("Pressure", "Pression") },
      { value: "temperature", label: L("Temperature", "Température") },
      { value: "fuel", label: L("Fuel", "Carburant") },
      { value: "mass", label: L("Mass", "Masse") },
    ]),
  ],
  generate(rng, params) {
    const group = pickVariant<ConversionGroup>(rng, params, CONVERSION_GROUPS);
    const pair = rng.pick(CONVERSION_PAIRS.filter((p) => p.group === group));
    const v = rng.range(pair.lo, pair.hi, pair.step);
    const s = solveConversion(pair, v);
    const digitsIn = pair.from === "inHg" ? 2 : 0;
    const bigger = pair.k !== undefined ? pair.k > 1 : undefined;
    return {
      prompt: tr(
        (f) => `${pair.ctx.en} Convert ${f.u(v, pair.from, digitsIn)} to ${f.unit(pair.to)}.`,
        (f) => `${pair.ctx.fr} Convertissez ${f.u(v, pair.from, digitsIn)} en ${f.unit(pair.to)}.`,
      ),
      givens: [
        given("value", L("Value", "Valeur"), v, pair.from),
        given("pair", L("Conversion", "Conversion"), pair.id),
        given("group", L("Question", "Question"), group),
      ],
      answer: s.answer,
      unit: pair.to,
      tolerance: s.tolerance,
      exact: roundStep(s.exact, 10 ** -(pair.digits + 1)),
      solutionSteps: [
        tr(() => `Rule: ${pair.ruleText.en}`, () => `Règle : ${pair.ruleText.fr}`),
        tr(
          (f) => `${f.u(v, pair.from, digitsIn)} → about ${f.u(s.rule, pair.to, pair.digits + 1)}; exactly ${f.u(s.exact, pair.to, pair.digits + 1)}.`,
          (f) => `${f.u(v, pair.from, digitsIn)} → environ ${f.u(s.rule, pair.to, pair.digits + 1)} ; exactement ${f.u(s.exact, pair.to, pair.digits + 1)}.`,
        ),
        tr(
          (f) =>
            bigger === undefined
              ? `Sanity check: ${f.unit(pair.to)} reads ${pair.to === "degF" ? "higher" : "lower"} than ${f.unit(pair.from)} here — a Fahrenheit number is always above the Celsius one at these temperatures (above −40).`
              : `Sanity check: ${f.unit(pair.from)} is the ${bigger ? "bigger" : "smaller"} unit, so the number of ${f.unit(pair.to)} must be ${bigger ? "larger" : "smaller"}.`,
          (f) =>
            bigger === undefined
              ? `Contrôle : le nombre en ${f.unit(pair.to)} est ${pair.to === "degF" ? "supérieur" : "inférieur"} au nombre en ${f.unit(pair.from)} (au-dessus de −40).`
              : `Contrôle : le ${f.unit(pair.from)} est l'unité ${bigger ? "la plus grande" : "la plus petite"}, donc le nombre de ${f.unit(pair.to)} doit être ${bigger ? "plus grand" : "plus petit"}.`,
        ),
      ],
      ruleOfThumb: pair.ruleText,
      formula: pair.formula,
      refs: [REF.phak("ch. 16 (flight computer: unit conversions)"), REF.e6b()],
    };
  },
  check(problem, response) {
    const pair = pairById(givenStr(problem, "pair"));
    const v = givenNum(problem, "value");
    const wrongs: Wrong[] = [];
    if (pair.k !== undefined) {
      const inverse = pair.k > 1 ? v / pair.k : v * (1 / pair.k);
      const big = pair.k > 1;
      wrongs.push({
        value: inverse,
        id: "other",
        text: tr(
          (f) => `You went the wrong way: ${f.unit(pair.from)} is the ${big ? "bigger" : "smaller"} unit, so the number must get ${big ? "larger" : "smaller"}. ${pair.ruleText.en}`,
          (f) => `Vous avez converti à l'envers : le ${f.unit(pair.from)} est l'unité ${big ? "la plus grande" : "la plus petite"}, le nombre doit donc ${big ? "grandir" : "diminuer"}. ${pair.ruleText.fr}`,
        ),
      });
    } else if (pair.id === "c-f") {
      wrongs.push({ value: v * 1.8, id: "other", text: L("Do not forget the + 32: Fahrenheit starts 32° above Celsius.", "N'oubliez pas le + 32 : le zéro Fahrenheit est 32° sous celui du Celsius.") });
      wrongs.push({ value: (v - 32) / 1.8, id: "other", text: L("That is the °F → °C formula. From Celsius, multiply by 1.8 and add 32.", "C'est la formule °F → °C. Depuis le Celsius : × 1,8 puis + 32.") });
    } else {
      wrongs.push({ value: v / 1.8 - 32, id: "other", text: L("Subtract the 32 FIRST, then divide by 1.8.", "Retranchez d'abord 32, PUIS divisez par 1,8.") });
      wrongs.push({ value: v * 1.8 + 32, id: "other", text: L("That is the °C → °F formula. From Fahrenheit: subtract 32, then ÷ 1.8.", "C'est la formule °C → °F. Depuis le Fahrenheit : − 32 puis ÷ 1,8.") });
    }
    return checkNumeric(problem, response, { wrongs, noFactor: pair.group === "temperature" });
  },
});

export const CONVERSION_GENERATORS = [unitConversion];
