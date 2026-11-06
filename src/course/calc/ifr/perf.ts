// Calc engine — IFR time, fuel, airspeed, wind components and visibility.
import type { CalcPart, GeneratorDef } from "../../types";
import {
  checkNumeric,
  givenNum,
  givenStr,
  hasGiven,
  type PartWrong,
  type Wrong,
} from "../check";
import {
  clockFraction,
  norm360,
  tasFromCas,
  tasRule,
  windComponents,
  wrap180,
} from "../maths";
import { L, tr, windText } from "../text";
import { ceilStep, M_PER_FT, M_PER_SM, roundStep } from "../units";
import {
  bracket,
  defineGenerator,
  given,
  pickVariant,
  REF,
  rulesParam,
  variantParam,
} from "../kit";

// ================================================================== time, speed, distance
type TsdVariant = "time" | "distance" | "speed";

export const timeSpeedDistance: GeneratorDef = defineGenerator({
  id: "ifr.timeSpeedDistance",
  title: L("Time, speed and distance", "Temps, vitesse et distance"),
  category: "ifr",
  alsoIn: ["vfr"],
  summary: L(
    "t = d ÷ GS, d = GS × t, GS = d ÷ t, with NM per minute (GS ÷ 60).",
    "t = d ÷ Vs, d = Vs × t, Vs = d ÷ t, avec les NM par minute (Vs ÷ 60).",
  ),
  params: [
    variantParam([
      { value: "time", label: L("Time", "Temps") },
      { value: "distance", label: L("Distance", "Distance") },
      { value: "speed", label: L("Ground speed", "Vitesse sol") },
    ]),
  ],
  generate(rng, params) {
    const variant = pickVariant<TsdVariant>(rng, params, [
      "time",
      "distance",
      "speed",
    ]);
    const gs = rng.range(90, 180, 5);
    const common = {
      ruleOfThumb: L(
        "Think in NM per minute: 120 kt = 2 NM/min, 90 kt = 1.5, 150 kt = 2.5.",
        "Raisonnez en NM par minute : 120 kt = 2 NM/min, 90 kt = 1,5, 150 kt = 2,5.",
      ),
      formula: L(
        "d = GS × t;  t (min) = d ÷ GS × 60",
        "d = Vs × t ; t (min) = d ÷ Vs × 60",
      ),
      refs: [REF.phak("ch. 16 (navigation: time, speed, distance)"), REF.e6b()],
    };
    const v = given("variant", L("Question", "Question"), variant);
    if (variant === "time") {
      const d = rng.range(12, 180, 1);
      const t = (d / gs) * 60;
      return {
        ...common,
        prompt: tr(
          (f) =>
            `${f.u(d, "NM")} to the next fix at ${f.u(gs, "kt")} ground speed. How many minutes?`,
          (f) =>
            `${f.u(d, "NM")} jusqu'au prochain point à ${f.u(gs, "kt")} de vitesse sol. Combien de minutes ?`,
        ),
        givens: [
          given("distNm", L("Distance", "Distance"), d, "NM"),
          given("gsKt", L("Ground speed", "Vitesse sol"), gs, "kt"),
          v,
        ],
        answer: roundStep(t, 0.5),
        unit: "min",
        tolerance: Math.max(0.5, t * 0.02),
        answerText: tr(
          (f) => f.dur(t),
          (f) => f.dur(t),
        ),
        solutionSteps: [
          tr(
            (f) => `NM per minute = ${f.n(gs)} ÷ 60 = ${f.n(gs / 60, 2)}.`,
            (f) => `NM par minute = ${f.n(gs)} ÷ 60 = ${f.n(gs / 60, 2)}.`,
          ),
          tr(
            (f) =>
              `t = ${f.n(d)} ÷ ${f.n(gs / 60, 2)} = ${f.n(t, 1)} min (${f.dur(t)}).`,
            (f) =>
              `t = ${f.n(d)} ÷ ${f.n(gs / 60, 2)} = ${f.n(t, 1)} min (${f.dur(t)}).`,
          ),
        ],
      };
    }
    if (variant === "distance") {
      const t = rng.range(4, 45, 1);
      const d = (gs * t) / 60;
      return {
        ...common,
        prompt: tr(
          (f) =>
            `At ${f.u(gs, "kt")} ground speed, how far do you fly in ${f.n(t)} minutes?`,
          (f) =>
            `À ${f.u(gs, "kt")} de vitesse sol, quelle distance parcourez-vous en ${f.n(t)} minutes ?`,
        ),
        givens: [
          given("gsKt", L("Ground speed", "Vitesse sol"), gs, "kt"),
          given("timeMin", L("Time", "Temps"), t, "min"),
          v,
        ],
        answer: roundStep(d, 0.5),
        unit: "NM",
        tolerance: Math.max(0.5, d * 0.02),
        solutionSteps: [
          tr(
            (f) => `NM per minute = ${f.n(gs)} ÷ 60 = ${f.n(gs / 60, 2)}.`,
            (f) => `NM par minute = ${f.n(gs)} ÷ 60 = ${f.n(gs / 60, 2)}.`,
          ),
          tr(
            (f) => `d = ${f.n(gs / 60, 2)} × ${f.n(t)} = ${f.u(d, "NM", 1)}.`,
            (f) => `d = ${f.n(gs / 60, 2)} × ${f.n(t)} = ${f.u(d, "NM", 1)}.`,
          ),
        ],
      };
    }
    const t = rng.range(5, 30, 1);
    const d = roundStep((gs * t) / 60, 1);
    const g = (d / t) * 60;
    return {
      ...common,
      prompt: tr(
        (f) =>
          `You flew ${f.u(d, "NM")} between two fixes in ${f.n(t)} minutes. What is your ground speed?`,
        (f) =>
          `Vous avez parcouru ${f.u(d, "NM")} entre deux points en ${f.n(t)} minutes. Quelle est votre vitesse sol ?`,
      ),
      givens: [
        given("distNm", L("Distance", "Distance"), d, "NM"),
        given("timeMin", L("Time", "Temps"), t, "min"),
        v,
      ],
      answer: Math.round(g),
      unit: "kt",
      tolerance: Math.max(2, g * 0.02),
      solutionSteps: [
        tr(
          (f) => `NM per minute = ${f.n(d)} ÷ ${f.n(t)} = ${f.n(d / t, 2)}.`,
          (f) => `NM par minute = ${f.n(d)} ÷ ${f.n(t)} = ${f.n(d / t, 2)}.`,
        ),
        tr(
          (f) => `GS = × 60 = ${f.u(g, "kt")}.`,
          (f) => `Vs = × 60 = ${f.u(g, "kt")}.`,
        ),
      ],
    };
  },
  check(problem, response) {
    const variant = givenStr(problem, "variant") as TsdVariant;
    const wrongs: Wrong[] = [];
    if (variant === "time")
      wrongs.push({
        value: givenNum(problem, "gsKt") / givenNum(problem, "distNm"),
        id: "other",
        text: L(
          "Time = distance ÷ speed, not speed ÷ distance.",
          "Temps = distance ÷ vitesse, pas vitesse ÷ distance.",
        ),
      });
    return checkNumeric(problem, response, { wrongs });
  },
});

// ================================================================== fuel and IFR reserve
export function solveIfrFuel(
  tripNm: number,
  altNm: number,
  gsKt: number,
  burnPerH: number,
  taxi: number,
  reserveMin = 45,
): {
  tripT: number;
  altT: number;
  trip: number;
  alt: number;
  reserve: number;
  total: number;
} {
  const tripT = (tripNm / gsKt) * 60;
  const altT = (altNm / gsKt) * 60;
  const trip = (tripT / 60) * burnPerH;
  const alt = (altT / 60) * burnPerH;
  const reserve = (reserveMin / 60) * burnPerH;
  return {
    tripT,
    altT,
    trip,
    alt,
    reserve,
    total: taxi + trip + alt + reserve,
  };
}

export const fuelReserve: GeneratorDef = defineGenerator({
  id: "ifr.fuelReserve",
  title: L("IFR fuel and reserve", "Carburant IFR et réserve"),
  category: "ifr",
  summary: L(
    "Minimum fuel for an IFR flight: destination + alternate + 45 min (14 CFR 91.167 / EASA final reserve).",
    "Carburant minimum d'un vol IFR : destination + dégagement + 45 min (14 CFR 91.167 / réserve finale EASA).",
  ),
  params: [rulesParam("faa")],
  generate(rng, params) {
    const icao = params.rules === "icao";
    const gs = rng.range(110, 160, 5);
    const tripNm = rng.range(80, 300, 5);
    const altNm = rng.range(25, 80, 5);
    const burn = icao ? rng.range(30, 50, 1) : rng.range(8, 14, 0.5);
    const taxi = icao ? 5 : 1.5;
    const unit = icao ? ("L" as const) : ("usgal" as const);
    const s = solveIfrFuel(tripNm, altNm, gs, burn, taxi);
    const step = icao ? 1 : 0.5;
    const answer = ceilStep(s.total, step);
    const uLabel = (v: number) =>
      tr(
        (f) => f.u(v, unit, icao ? 0 : 1),
        (f) => f.u(v, unit, icao ? 0 : 1),
      );
    return {
      prompt: tr(
        (f) =>
          `IFR flight: ${f.u(tripNm, "NM")} to destination, ${f.u(altNm, "NM")} from there to the alternate, ${f.u(gs, "kt")} ground speed, fuel flow ${f.u(burn, icao ? "lph" : "gph", icao ? 0 : 1)}, taxi ${uLabel(taxi).en}. ${icao ? "Under EASA Part-NCO" : "Under 14 CFR 91.167"}, what is the minimum fuel at engine start?`,
        (f) =>
          `Vol IFR : ${f.u(tripNm, "NM")} jusqu'à destination, ${f.u(altNm, "NM")} de là au dégagement, ${f.u(gs, "kt")} de vitesse sol, consommation ${f.u(burn, icao ? "lph" : "gph", icao ? 0 : 1)}, roulage ${uLabel(taxi).fr}. ${icao ? "Selon l'EASA Part-NCO" : "Selon le 14 CFR 91.167"}, quel carburant minimum à la mise en route ?`,
      ),
      givens: [
        given(
          "tripNm",
          L("Distance to destination", "Distance jusqu'à destination"),
          tripNm,
          "NM",
        ),
        given(
          "altNm",
          L("Destination to alternate", "Destination → dégagement"),
          altNm,
          "NM",
        ),
        given("gsKt", L("Ground speed", "Vitesse sol"), gs, "kt"),
        given(
          "burn",
          L("Fuel flow", "Consommation"),
          burn,
          icao ? "lph" : "gph",
        ),
        given("taxi", L("Taxi", "Roulage"), taxi, unit),
        given("rules", L("Rules", "Réglementation"), icao ? "icao" : "faa"),
      ],
      answer,
      unit,
      tolerance: Math.max(step, s.total * 0.03),
      parts: [
        {
          key: "reserve",
          label: L("Reserve (45 min)", "Réserve (45 min)"),
          answer: roundStep(s.reserve, step),
          unit,
          tolerance: Math.max(step, s.reserve * 0.03),
        },
      ],
      solutionSteps: [
        tr(
          (f) =>
            `Trip: ${f.n(tripNm)} NM at ${f.n(gs)} kt = ${f.dur(s.tripT)} → ${f.u(s.trip, unit, 1)}.`,
          (f) =>
            `Étape : ${f.n(tripNm)} NM à ${f.n(gs)} kt = ${f.dur(s.tripT)} → ${f.u(s.trip, unit, 1)}.`,
        ),
        tr(
          (f) =>
            `Alternate: ${f.n(altNm)} NM = ${f.dur(s.altT)} → ${f.u(s.alt, unit, 1)}.`,
          (f) =>
            `Dégagement : ${f.n(altNm)} NM = ${f.dur(s.altT)} → ${f.u(s.alt, unit, 1)}.`,
        ),
        tr(
          (f) =>
            `Reserve: 45 min at normal cruise = 0.75 × ${f.n(burn, icao ? 0 : 1)} = ${f.u(s.reserve, unit, 1)}.`,
          (f) =>
            `Réserve : 45 min en croisière = 0,75 × ${f.n(burn, icao ? 0 : 1)} = ${f.u(s.reserve, unit, 1)}.`,
        ),
        tr(
          (f) =>
            `Total with ${f.u(taxi, unit, 1)} of taxi: ${f.u(s.total, unit, 1)}; round up: ${f.u(answer, unit, icao ? 0 : 1)}.`,
          (f) =>
            `Total avec ${f.u(taxi, unit, 1)} de roulage : ${f.u(s.total, unit, 1)} ; arrondi au-dessus : ${f.u(answer, unit, icao ? 0 : 1)}.`,
        ),
        tr(
          () =>
            `This is the legal minimum. Add fuel for the expected routing, holds, icing, a headwind stronger than forecast.`,
          () =>
            `C'est le minimum réglementaire. Ajoutez pour le cheminement attendu, les attentes, le givrage, un vent plus fort que prévu.`,
        ),
      ],
      ruleOfThumb: L(
        "Fuel = (trip time + alternate time + 45 min) × fuel flow, plus taxi. Round up.",
        "Carburant = (temps d'étape + dégagement + 45 min) × consommation, plus le roulage. Arrondir au-dessus.",
      ),
      formula: L(
        "F = taxi + FF × (t dest + t alt + 0:45)",
        "F = roulage + conso × (t dest + t dégagement + 0 h 45)",
      ),
      refs: icao
        ? [
            REF.easa("NCO.OP.125 (fuel: IFR, final reserve 45 min)"),
            REF.cfr("91.167", L("FAA equivalent", "équivalent FAA")),
          ]
        : [
            REF.cfr("91.167 (fuel requirements for flight in IFR conditions)"),
            REF.cfr("91.169 (IFR alternate requirements)"),
          ],
    };
  },
  check(problem, response) {
    const s = solveIfrFuel(
      givenNum(problem, "tripNm"),
      givenNum(problem, "altNm"),
      givenNum(problem, "gsKt"),
      givenNum(problem, "burn"),
      givenNum(problem, "taxi"),
    );
    const vfrDay = solveIfrFuel(
      givenNum(problem, "tripNm"),
      0,
      givenNum(problem, "gsKt"),
      givenNum(problem, "burn"),
      givenNum(problem, "taxi"),
      30,
    );
    return checkNumeric(problem, response, {
      wrongs: [
        {
          value: s.total - s.reserve,
          id: "reserve",
          text: L(
            "Add the 45-minute reserve at normal cruise after the alternate.",
            "Ajoutez la réserve de 45 minutes en croisière, après le dégagement.",
          ),
        },
        {
          value: s.total - s.alt,
          id: "other",
          text: L(
            "Include the fuel from the destination to the alternate before the reserve.",
            "Comptez le carburant de la destination au dégagement avant la réserve.",
          ),
        },
        {
          value: s.total - givenNum(problem, "taxi"),
          id: "rounding",
          text: L("Add the taxi fuel.", "Ajoutez le carburant de roulage."),
        },
        {
          value: vfrDay.total,
          id: "reserve",
          text: L(
            "That is a VFR-day plan (30 min, no alternate). IFR needs the alternate and 45 minutes.",
            "C'est un calcul VFR de jour (30 min, sans dégagement). En IFR : dégagement et 45 minutes.",
          ),
        },
      ],
      noFactor: true,
    });
  },
});

// ================================================================== TAS from IAS
export const tasFromIas: GeneratorDef = defineGenerator({
  id: "ifr.tasFromIas",
  title: L("True airspeed from indicated", "Vitesse propre à partir de la vitesse indiquée"),
  category: "ifr",
  alsoIn: ["vfr"],
  summary: L("TAS ≈ IAS + 2 % per 1,000 ft; the exact value from the pressure altitude and OAT.", "Vp ≈ Vi + 2 % par 1 000 ft ; la valeur exacte avec l'altitude pression et la température."),
  params: [
    {
      key: "method",
      label: L("Method", "Méthode"),
      kind: "choice",
      default: "rule",
      choices: [
        { value: "rule", label: L("Rule of thumb (OAT near ISA)", "Règle pratique (température proche ISA)") },
        { value: "exact", label: L("Flight computer (OAT off ISA)", "Calculateur (température hors ISA)") },
      ],
    },
  ],
  generate(rng, params) {
    const exactMethod = params.method === "exact";
    const ias = rng.range(90, 160, 5);
    const pa = rng.range(3000, 12000, 500);
    const isa = 15 - 1.98 * (pa / 1000);
    const oat = Math.round(isa + (exactMethod ? rng.pick([-15, -10, 10, 15, 20]) : rng.range(-3, 3, 1)));
    const exact = tasFromCas(ias, pa, oat);
    const rule = tasRule(ias, pa);
    return {
      prompt: tr((f) => `Indicated ${f.u(ias, "kt")} at pressure altitude ${f.u(pa, "ft")}, OAT ${f.u(oat, "degC")}. What is your true airspeed? (Take IAS = CAS.)`, (f) => `Vi ${f.u(ias, "kt")} à l'altitude pression ${f.u(pa, "ft")}, température ${f.u(oat, "degC")}. Quelle est votre vitesse propre ? (Vi = Vc.)`),
      givens: [given("iasKt", L("IAS", "Vi"), ias, "kt"), given("paFt", L("Pressure altitude", "Altitude pression"), pa, "ft"), given("oatC", L("OAT", "Température extérieure"), oat, "degC"), given("method", L("Method", "Méthode"), exactMethod ? "exact" : "rule")],
      answer: Math.round(exactMethod ? exact : rule),
      unit: "kt",
      tolerance: exactMethod ? 3 : bracket(rule, exact, 3, 1),
      exact: Math.round(exact),
      solutionSteps: [
        tr((f) => `Rule: + 2 % per 1,000 ft: ${f.n(pa / 1000, 1)} × 2 = ${f.n((2 * pa) / 1000, 1)} %, TAS ≈ ${f.n(ias)} × ${f.n(1 + (0.02 * pa) / 1000, 3)} = ${f.u(rule, "kt")}.`, (f) => `Règle : + 2 % par 1 000 ft : ${f.n(pa / 1000, 1)} × 2 = ${f.n((2 * pa) / 1000, 1)} %, Vp ≈ ${f.n(ias)} × ${f.n(1 + (0.02 * pa) / 1000, 3)} = ${f.u(rule, "kt")}.`),
        tr((f) => `ISA at ${f.n(pa)} ft is ${f.u(isa, "degC")}; the OAT is ${f.s(oat - isa)} °C from it${Math.abs(oat - isa) > 5 ? ": warm air is less dense, the TAS is higher (cold: lower)" : ""}.`, (f) => `L'ISA à ${f.n(pa)} ft vaut ${f.u(isa, "degC")} ; la température s'en écarte de ${f.s(oat - isa)} °C${Math.abs(oat - isa) > 5 ? " : l'air chaud est moins dense, la Vp est plus forte (froid : plus faible)" : ""}.`),
        tr((f) => `Exact (flight computer): TAS = CAS ÷ √σ with σ = (p/p0)·(T0/T) = ${f.n(1 / ((exact / ias) ** 2), 3)}: ${f.u(exact, "kt")}.`, (f) => `Exact (calculateur) : Vp = Vc ÷ √σ avec σ = (p/p0)·(T0/T) = ${f.n(1 / ((exact / ias) ** 2), 3)} : ${f.u(exact, "kt")}.`),
      ],
      ruleOfThumb: L("TAS ≈ IAS + 2 % per 1,000 ft of altitude (near ISA). Warmer than ISA, a little more.", "Vp ≈ Vi + 2 % par 1 000 ft (proche de l'ISA). Plus chaud que l'ISA, un peu plus."),
      formula: L("TAS = CAS ÷ √σ,  σ = (1 − 6.876·10⁻⁶ PA)^5.256 × 288.15 ÷ (OAT + 273.15)", "Vp = Vc ÷ √σ,  σ = (1 − 6,876·10⁻⁶ Zp)^5,256 × 288,15 ÷ (T + 273,15)"),
      refs: [REF.phak("ch. 8 (airspeed: TAS)"), REF.isa()],
    };
  },
  check(problem, response) {
    const ias = givenNum(problem, "iasKt");
    const pa = givenNum(problem, "paFt");
    return checkNumeric(problem, response, {
      wrongs: [
        { value: ias * (1 - (0.02 * pa) / 1000), id: "wrongSide", text: L("TAS is HIGHER than IAS at altitude: the air is thinner, so add.", "La Vp est SUPÉRIEURE à la Vi en altitude : l'air est moins dense, on ajoute.") },
        { value: ias * 1.02, id: "other", text: L("Add 2 % for EACH 1,000 ft, not 2 % in total.", "Ajoutez 2 % PAR 1 000 ft, pas 2 % au total.") },
        { value: ias, id: "other", text: L("IAS is not TAS above sea level: add about 2 % per 1,000 ft.", "La Vi n'est pas la Vp en altitude : ajoutez environ 2 % par 1 000 ft.") },
      ],
      noFactor: true,
    });
  },
});

// ================================================================== wind components
export function solveRunwayWind(runwayHdg: number, windDir: number, windKt: number): { head: number; cross: number; angle: number; crossRule: number; side: "L" | "R" } {
  const c = windComponents(runwayHdg, windDir, windKt);
  const angle = Math.abs(wrap180(windDir - runwayHdg));
  const across = angle > 90 ? 180 - angle : angle;
  return { head: c.head, cross: Math.abs(c.cross), angle, crossRule: windKt * clockFraction(across), side: c.cross >= 0 ? "R" : "L" };
}

/** a runway number from a heading (2-digit, 01..36) */
export function runwayNumber(hdg: number): string {
  const n = Math.round(norm360(hdg) / 10) % 36 || 36;
  return String(n).padStart(2, "0");
}

export function windComponentsGenerator(id: "ifr.windComponents" | "vfr.crosswind"): GeneratorDef {
  const vfr = id === "vfr.crosswind";
  return defineGenerator({
    id,
    title: vfr ? L("Crosswind check before landing", "Vent traversier avant l'atterrissage") : L("Headwind and crosswind components", "Composantes de vent de face et traversier"),
    category: vfr ? "vfr" : "ifr",
    alsoIn: vfr ? undefined : ["vfr"],
    summary: vfr
      ? L("Crosswind and headwind on the runway, against the demonstrated crosswind.", "Vent traversier et de face sur la piste, comparés au vent traversier démontré.")
      : L("Crosswind = wind × sin θ, headwind = wind × cos θ; the clock-face rule.", "Traversier = vent × sin θ, face = vent × cos θ ; la règle de l'horloge."),
    generate(rng) {
      const rwyHdg = rng.range(10, 360, 10);
      const rwy = runwayNumber(rwyHdg);
      const angle = rng.pick([10, 20, 30, 40, 45, 50, 60, 70, 80, 110, 130, 150]);
      const windDir = norm360(rwyHdg + (rng.chance(0.5) ? angle : -angle));
      const windKt = rng.range(8, 25, 1);
      const gust = vfr && rng.chance(0.4) ? windKt + rng.range(6, 12, 1) : undefined;
      const s = solveRunwayWind(rwyHdg, windDir, windKt);
      const g = gust ? solveRunwayWind(rwyHdg, windDir, gust) : undefined;
      const demo = 15;
      const across = s.angle > 90 ? 180 - s.angle : s.angle;
      const xMax = g ? g.cross : s.cross;
      const parts: CalcPart[] = [
        { key: "head", label: L("Headwind (− = tailwind)", "Vent de face (− = arrière)"), answer: Math.round(s.head), unit: "kt", tolerance: 2 },
        { key: "side", label: L("From which side?", "De quel côté ?"), answer: s.side, choices: [{ value: "L", label: L("Left", "Gauche") }, { value: "R", label: L("Right", "Droite") }] },
      ];
      if (vfr) parts.push({ key: "within", label: L(`Within the demonstrated ${demo} kt?`, `Dans les ${demo} kt démontrés ?`), answer: xMax <= demo ? "yes" : "no", choices: [{ value: "yes", label: L("Yes", "Oui") }, { value: "no", label: L("No", "Non") }] });
      const w = windText(windDir, windKt, gust);
      return {
        prompt: vfr
          ? tr(() => `Runway ${rwy}, tower wind ${w} (magnetic). C172S demonstrated crosswind ${demo} kt. What is the crosswind${gust ? " in the gusts" : ""}, the headwind, and are you within the demonstrated value?`, () => `Piste ${rwy}, vent tour ${w} (magnétique). Vent traversier démontré du C172S : ${demo} kt. Quel vent traversier${gust ? " en rafale" : ""}, quel vent de face, et êtes-vous dans la valeur démontrée ?`)
          : tr(() => `Runway ${rwy}, wind ${w} (magnetic, from the tower). What are the crosswind and headwind components?`, () => `Piste ${rwy}, vent ${w} (magnétique, donné par la tour). Quelles sont les composantes traversière et de face ?`),
        givens: [
          given("rwyHdg", L("Runway heading", "QFU"), rwyHdg, "deg", L(`RWY ${rwy}`, `piste ${rwy}`)),
          given("windDir", L("Wind direction", "Direction du vent"), windDir, "deg"),
          given("windKt", L("Wind speed", "Force du vent"), windKt, "kt", L(w, w)),
          ...(gust ? [given("gustKt", L("Gusts", "Rafales"), gust, "kt")] : []),
        ],
        answer: Math.round(xMax),
        unit: "kt",
        tolerance: bracket((gust ?? windKt) * clockFraction(across), xMax, 2, 0.5),
        exact: roundStep(xMax, 0.1),
        parts,
        solutionSteps: [
          tr((f) => `Angle between the wind and the runway: ${f.n(Math.abs(wrap180(windDir - rwyHdg)))}°${s.angle > 90 ? ` (behind the wing line: a tailwind; ${f.n(across)}° off the tail)` : ""}.`, (f) => `Angle entre le vent et la piste : ${f.n(Math.abs(wrap180(windDir - rwyHdg)))}°${s.angle > 90 ? ` (en arrière de l'axe des ailes : vent arrière ; ${f.n(across)}° de l'arrière)` : ""}.`),
          tr((f) => `Clock rule: ${f.n(across)}° = ${f.n(across)} minutes = ${f.n(clockFraction(across) * 100)} % of the wind across: ≈ ${f.u((gust ?? windKt) * clockFraction(across), "kt")}.`, (f) => `Règle de l'horloge : ${f.n(across)}° = ${f.n(across)} minutes = ${f.n(clockFraction(across) * 100)} % du vent en travers : ≈ ${f.u((gust ?? windKt) * clockFraction(across), "kt")}.`),
          tr((f) => `Exact: crosswind = ${f.n(gust ?? windKt)} × sin ${f.n(across)}° = ${f.u(xMax, "kt", 1)} from the ${s.side === "R" ? "right" : "left"}; headwind = ${f.n(windKt)} × cos ${f.n(s.angle)}° = ${f.u(s.head, "kt", 1)}${s.head < 0 ? " (tailwind)" : ""}.`, (f) => `Exact : traversier = ${f.n(gust ?? windKt)} × sin ${f.n(across)}° = ${f.u(xMax, "kt", 1)} de ${s.side === "R" ? "droite" : "gauche"} ; face = ${f.n(windKt)} × cos ${f.n(s.angle)}° = ${f.u(s.head, "kt", 1)}${s.head < 0 ? " (vent arrière)" : ""}.`),
          ...(vfr
            ? [tr((f) => xMax <= demo ? `${f.n(xMax, 0)} kt ≤ ${demo} kt demonstrated: within, but the demonstrated value is not a limit of your skill.` : `${f.n(xMax, 0)} kt > ${demo} kt demonstrated: choose another runway or another airport.`, (f) => xMax <= demo ? `${f.n(xMax, 0)} kt ≤ ${demo} kt démontrés : dans la valeur, qui n'est pas pour autant votre limite personnelle.` : `${f.n(xMax, 0)} kt > ${demo} kt démontrés : autre piste ou autre aérodrome.`)]
            : []),
        ],
        ruleOfThumb: L("Clock face: 15° → ¼, 30° → ½, 45° → ¾, 60° or more → all the wind across. Use the gust for the crosswind.", "Horloge : 15° → ¼, 30° → ½, 45° → ¾, 60° ou plus → tout le vent en travers. Prenez la rafale pour le traversier."),
        formula: L("crosswind = W × sin θ;  headwind = W × cos θ", "traversier = V × sin θ ; face = V × cos θ"),
        refs: vfr ? [REF.phak("ch. 11 (crosswind component chart)"), REF.poh172("section 4 (demonstrated crosswind 15 kt)")] : [REF.phak("ch. 11 (wind components)"), REF.afh("ch. 9 (crosswind approaches)")],
        diagram: { kind: "calc", calc: { kind: "runwayWind", runwayHdg: rwyHdg, windDir, windKt, ...(gust ? { gustKt: gust } : {}) } },
      };
    },
    check(problem, response) {
      const rwy = givenNum(problem, "rwyHdg");
      const dir = givenNum(problem, "windDir");
      const kt = givenNum(problem, "windKt");
      const s = solveRunwayWind(rwy, dir, kt);
      const wrongs: Wrong[] = [{ value: Math.abs(s.head), id: "crossHeadSwap" }];
      if (hasGiven(problem, "gustKt")) wrongs.push({ value: s.cross, id: "other", text: L("Use the gust value for the crosswind: it is the peak you must control.", "Prenez la rafale pour le traversier : c'est la pointe qu'il faut contrôler.") });
      const partWrongs: PartWrong[] = [
        { key: "head", value: Math.round(-s.head), id: "headTailSwap" },
        { key: "head", value: Math.round(s.cross), id: "crossHeadSwap" },
        { key: "side", value: s.side === "R" ? "L" : "R", id: "wrongSide", text: L("The wind comes from the side its direction points from: wind direction greater than the runway heading (within 180°) is from the right.", "Le vent vient du côté de sa direction : direction du vent supérieure au QFU (dans les 180°) = vent de droite.") },
      ];
      return checkNumeric(problem, response, { wrongs, partWrongs, noFactor: true });
    },
  });
}

export const windComponentsIfr: GeneratorDef = windComponentsGenerator("ifr.windComponents");

// ================================================================== visibility and RVR
type VisVariant = "rvrToSm" | "ftToM" | "smToM";

/** 14 CFR 91.175(h)(2) comparable values of RVR and ground visibility */
export const RVR_TABLE: readonly { rvrFt: number; sm: number; text: string }[] = [
  { rvrFt: 1600, sm: 0.25, text: "1/4" },
  { rvrFt: 2400, sm: 0.5, text: "1/2" },
  { rvrFt: 3200, sm: 0.625, text: "5/8" },
  { rvrFt: 4000, sm: 0.75, text: "3/4" },
  { rvrFt: 4500, sm: 0.875, text: "7/8" },
  { rvrFt: 5000, sm: 1, text: "1" },
  { rvrFt: 6000, sm: 1.25, text: "1 1/4" },
];

export const visibility: GeneratorDef = defineGenerator({
  id: "ifr.visibility",
  title: L("Visibility and RVR conversions", "Conversions de visibilité et de RVR"),
  category: "ifr",
  summary: L("RVR ↔ statute miles (91.175 table), RVR feet ↔ metres, statute miles ↔ metres.", "RVR ↔ miles terrestres (table 91.175), RVR pieds ↔ mètres, miles ↔ mètres."),
  params: [
    variantParam([
      { value: "rvrToSm", label: L("RVR → SM (91.175 table)", "RVR → SM (table 91.175)") },
      { value: "ftToM", label: L("RVR ft → m", "RVR ft → m") },
      { value: "smToM", label: L("SM → m", "SM → m") },
    ]),
  ],
  generate(rng, params) {
    const variant = pickVariant<VisVariant>(rng, params, ["rvrToSm", "ftToM", "smToM"]);
    const v = given("variant", L("Question", "Question"), variant);
    if (variant === "rvrToSm") {
      const row = rng.pick(RVR_TABLE);
      return {
        prompt: tr((f) => `The approach minimum is RVR ${f.n(row.rvrFt)}. The RVR is out of service: what ground visibility (SM) is the comparable value?`, (f) => `Le minimum de l'approche est RVR ${f.n(row.rvrFt)}. Le RVR est en panne : quelle visibilité au sol (SM) est la valeur équivalente ?`),
        givens: [given("rvrFt", L("RVR", "RVR"), row.rvrFt, "ft"), v],
        answer: row.sm,
        unit: "SM",
        tolerance: 0.01,
        answerText: L(`${row.text} SM`, `${row.text} SM`),
        solutionSteps: [
          tr(() => `14 CFR 91.175(h): RVR 1600 = 1/4 SM, 2400 = 1/2, 3200 = 5/8, 4000 = 3/4, 4500 = 7/8, 5000 = 1, 6000 = 1 1/4.`, () => `14 CFR 91.175(h) : RVR 1600 = 1/4 SM, 2400 = 1/2, 3200 = 5/8, 4000 = 3/4, 4500 = 7/8, 5000 = 1, 6000 = 1 1/4.`),
          tr((f) => `RVR ${f.n(row.rvrFt)} → ${row.text} SM.`, (f) => `RVR ${f.n(row.rvrFt)} → ${row.text} SM.`),
        ],
        ruleOfThumb: L("The table is not a conversion: 1 SM is 5,280 ft but RVR 5000 = 1 SM. Learn it.", "La table n'est pas une conversion : 1 SM = 5 280 ft mais RVR 5000 = 1 SM. Apprenez-la."),
        formula: L("14 CFR 91.175(h)(2) table of comparable values", "Table des valeurs équivalentes du 14 CFR 91.175(h)(2)"),
        refs: [REF.cfr("91.175(h) (comparable values of RVR and ground visibility)")],
      };
    }
    if (variant === "ftToM") {
      const ft = rng.pick([600, 1000, 1200, 1400, 1600, 1800, 2000, 2400, 3000, 4000, 5000, 6000]);
      const m = ft * M_PER_FT;
      return {
        prompt: tr((f) => `An FAA chart gives RVR ${f.n(ft)} ft. What is that in metres?`, (f) => `Une carte FAA indique RVR ${f.n(ft)} ft. Combien en mètres ?`),
        givens: [given("ft", L("RVR", "RVR"), ft, "ft"), v],
        answer: Math.round(m),
        unit: "m",
        tolerance: Math.max(10, m * 0.03),
        solutionSteps: [
          tr((f) => `1 ft = 0.3048 m: ${f.n(ft)} × 0.3048 = ${f.u(m, "m")}.`, (f) => `1 ft = 0,3048 m : ${f.n(ft)} × 0,3048 = ${f.u(m, "m")}.`),
          tr((f) => `Mental: × 3 ÷ 10 = ${f.u((ft * 3) / 10, "m")}. RVR 1800 ft ≈ 550 m (the CAT I minimum).`, (f) => `Mental : × 3 ÷ 10 = ${f.u((ft * 3) / 10, "m")}. RVR 1800 ft ≈ 550 m (minimum CAT I).`),
        ],
        ruleOfThumb: L("Feet × 3 ÷ 10 ≈ metres (a little low).", "Pieds × 3 ÷ 10 ≈ mètres (un peu faible)."),
        formula: L("m = ft × 0.3048", "m = ft × 0,3048"),
        refs: [REF.aim("ch. 7 sec. 1 (RVR reporting)"), REF.pansOps("Vol I (RVR in metres)")],
      };
    }
    const sm = rng.pick([0.5, 1, 1.5, 2, 3, 4, 5]);
    const m = sm * M_PER_SM;
    return {
      prompt: tr((f) => `A US METAR reports visibility ${f.n(sm, sm % 1 ? 1 : 0)} SM. What is that in metres?`, (f) => `Un METAR américain donne une visibilité de ${f.n(sm, sm % 1 ? 1 : 0)} SM. Combien en mètres ?`),
      givens: [given("sm", L("Visibility", "Visibilité"), sm, "SM"), v],
      answer: Math.round(m),
      unit: "m",
      tolerance: Math.max(30, m * 0.03),
      solutionSteps: [
        tr((f) => `1 SM = 1 609 m: ${f.n(sm, 1)} × 1 609 = ${f.u(m, "m")}.`, (f) => `1 SM = 1 609 m : ${f.n(sm, 1)} × 1 609 = ${f.u(m, "m")}.`),
        tr((f) => `Mental: × 1.6 km = ${f.u(sm * 1.6, "km", 1)}.`, (f) => `Mental : × 1,6 km = ${f.u(sm * 1.6, "km", 1)}.`),
      ],
      ruleOfThumb: L("1 SM ≈ 1.6 km; 1 NM ≈ 1.85 km.", "1 SM ≈ 1,6 km ; 1 NM ≈ 1,85 km."),
      formula: L("m = SM × 1 609.344", "m = SM × 1 609,344"),
      refs: [REF.aim("ch. 7 sec. 1 (METAR visibility)")],
    };
  },
  check(problem, response) {
    const variant = givenStr(problem, "variant") as VisVariant;
    const wrongs: Wrong[] = [];
    if (variant === "rvrToSm") wrongs.push({ value: givenNum(problem, "rvrFt") / 5280, id: "other", text: L("Not a straight conversion: use the 91.175(h) table (RVR 5000 = 1 SM).", "Pas une simple conversion : utilisez la table 91.175(h) (RVR 5000 = 1 SM).") });
    if (variant === "smToM") wrongs.push({ value: givenNum(problem, "sm") * 1852, id: "factor", text: L("That is nautical miles (1 852 m). A statute mile is 1 609 m.", "Ce sont des milles nautiques (1 852 m). Un mile terrestre fait 1 609 m.") });
    return checkNumeric(problem, response, { wrongs });
  },
});

export const PERF_GENERATORS = [timeSpeedDistance, fuelReserve, tasFromIas, windComponentsIfr, visibility];
