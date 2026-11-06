// Calc engine — altimetry: pressure altitude, density altitude, cold-temperature correction.
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
  coldTempCorrectionFt,
  coldTempRule,
  densityAltitudeExact,
  densityAltitudeRule,
  isaTempRule,
  pressureAltitudeExact,
  pressureAltitudeRuleHpa,
  pressureAltitudeRuleInHg,
} from "../maths";
import { L, tr } from "../text";
import { ceilStep, HPA_PER_INHG, roundStep } from "../units";
import {
  bracket,
  defineGenerator,
  given,
  pickVariant,
  REF,
  variantParam,
} from "../kit";

// ================================================================== pressure altitude
type PaVariant = "inHg" | "hPa";

export function solvePressureAltitude(
  elevFt: number,
  setting: number,
  unit: PaVariant,
): { rule: number; rule30?: number; exact: number } {
  if (unit === "inHg")
    return {
      rule: pressureAltitudeRuleInHg(elevFt, setting),
      exact: pressureAltitudeExact(elevFt, setting * HPA_PER_INHG),
    };
  return {
    rule: pressureAltitudeRuleHpa(elevFt, setting, 27),
    rule30: pressureAltitudeRuleHpa(elevFt, setting, 30),
    exact: pressureAltitudeExact(elevFt, setting),
  };
}

export const pressureAltitude: GeneratorDef = defineGenerator({
  id: "ifr.pressureAltitude",
  title: L("Pressure altitude", "Altitude pression"),
  category: "ifr",
  summary: L(
    "PA = elevation + (29.92 − altimeter) × 1,000, or + (1013 − QNH) × 27 ft.",
    "Zp = altitude + (29,92 − calage) × 1 000, ou + (1013 − QNH) × 27 ft.",
  ),
  params: [
    variantParam([
      {
        value: "inHg",
        label: L("Altimeter in inHg (FAA)", "Calage en inHg (FAA)"),
      },
      { value: "hPa", label: L("QNH in hPa (ICAO)", "QNH en hPa (OACI)") },
    ]),
  ],
  generate(rng, params) {
    const variant = pickVariant<PaVariant>(rng, params, ["inHg", "hPa"]);
    const elev = rng.range(0, 6500, 10);
    const setting =
      variant === "inHg"
        ? rng.range(29.42, 30.42, 0.01)
        : rng.range(985, 1040, 1);
    const s = solvePressureAltitude(elev, setting, variant);
    const inHg = variant === "inHg";
    const answer = inHg ? Math.round(s.rule) : roundStep(s.exact, 10);
    const tolerance = inHg
      ? bracket(s.rule, s.exact, 20, 10)
      : Math.max(
          20,
          Math.abs(s.rule30! - s.exact) + 10,
          Math.abs(s.rule - s.exact) + 10,
        );
    const settingText = inHg
      ? L(
          `${setting.toFixed(2)} inHg`,
          `${setting.toFixed(2).replace(".", ",")} inHg`,
        )
      : L(`${setting} hPa`, `${setting} hPa`);
    const higher = (inHg ? 29.92 - setting : 1013.25 - setting) > 0;
    return {
      prompt: tr(
        (f) =>
          `Airport elevation ${f.u(elev, "ft")}, ${inHg ? "altimeter" : "QNH"} ${settingText.en}. What is the pressure altitude?`,
        (f) =>
          `Altitude de l'aérodrome ${f.u(elev, "ft")}, ${inHg ? "calage" : "QNH"} ${settingText.fr}. Quelle est l'altitude pression ?`,
      ),
      givens: [
        given("elevFt", L("Elevation", "Altitude du terrain"), elev, "ft"),
        given(
          "setting",
          inHg ? L("Altimeter", "Calage") : L("QNH", "QNH"),
          setting,
          inHg ? "inHg" : "hPa",
          settingText,
        ),
        given("variant", L("Question", "Question"), variant),
      ],
      answer,
      unit: "ft",
      tolerance,
      exact: roundStep(s.exact, 1),
      solutionSteps: inHg
        ? [
            tr(
              (f) =>
                `Standard minus the setting: 29.92 − ${setting.toFixed(2)} = ${f.s(29.92 - setting, 2)} inHg.`,
              (f) =>
                `Standard moins le calage : 29,92 − ${setting.toFixed(2).replace(".", ",")} = ${f.s(29.92 - setting, 2)} inHg.`,
            ),
            tr(
              (f) =>
                `× 1,000 ft per inHg = ${f.s((29.92 - setting) * 1000)} ft; PA = ${f.n(elev)} ${higher ? "+" : "−"} ${f.n(Math.abs((29.92 - setting) * 1000))} = ${f.u(s.rule, "ft")}.`,
              (f) =>
                `× 1 000 ft par inHg = ${f.s((29.92 - setting) * 1000)} ft ; Zp = ${f.n(elev)} ${higher ? "+" : "−"} ${f.n(Math.abs((29.92 - setting) * 1000))} = ${f.u(s.rule, "ft")}.`,
            ),
            tr(
              (f) =>
                `Check: set 29.92 in the window and the altimeter reads ${f.u(s.rule, "ft")} on the ground (exact ISA: ${f.n(s.exact)}).`,
              (f) =>
                `Contrôle : affichez 29,92 et l'altimètre indique ${f.u(s.rule, "ft")} au sol (ISA exact : ${f.n(s.exact)}).`,
            ),
          ]
        : [
            tr(
              (f) => `1013 − ${setting} = ${f.s(1013.25 - setting, 1)} hPa.`,
              (f) => `1013 − ${setting} = ${f.s(1013.25 - setting, 1)} hPa.`,
            ),
            tr(
              (f) =>
                `About 27 ft per hPa near the ground (30 is the round figure): ${f.s((1013.25 - setting) * 27)} ft; PA ≈ ${f.u(s.rule, "ft")}.`,
              (f) =>
                `Environ 27 ft par hPa près du sol (30 en chiffre rond) : ${f.s((1013.25 - setting) * 27)} ft ; Zp ≈ ${f.u(s.rule, "ft")}.`,
            ),
            tr(
              (f) =>
                `Exact ISA: ${f.u(s.exact, "ft")}. Check: set 1013 and read the altimeter.`,
              (f) =>
                `ISA exact : ${f.u(s.exact, "ft")}. Contrôle : affichez 1013 et lisez l'altimètre.`,
            ),
          ],
      ruleOfThumb: inHg
        ? L(
            "1 inHg = 1,000 ft. Lower pressure than standard → higher pressure altitude.",
            "1 inHg = 1 000 ft. Pression inférieure au standard → altitude pression plus haute.",
          )
        : L(
            "1 hPa ≈ 27 ft near the ground (30 ft round). Low QNH → high pressure altitude.",
            "1 hPa ≈ 27 ft près du sol (30 ft en rond). QNH bas → altitude pression haute.",
          ),
      formula: L(
        "PA = 145 366 × (1 − (p_stn ÷ 1013.25)^0.1903),  p_stn = QNH × (1 − 6.876·10⁻⁶ × elev)^5.256",
        "Zp = 145 366 × (1 − (p_stn ÷ 1013,25)^0,1903),  p_stn = QNH × (1 − 6,876·10⁻⁶ × alt)^5,256",
      ),
      refs: [
        REF.phak("ch. 4 (pressure altitude)"),
        REF.phak("ch. 8 (altimeter)"),
        REF.isa(),
      ],
      diagram: {
        kind: "calc",
        calc: {
          kind: "altimetry",
          elevFt: elev,
          qnhInHg: inHg ? setting : roundStep(setting / HPA_PER_INHG, 0.01),
          oatC: Math.round(isaTempRule(elev)),
        },
      },
    };
  },
  check(problem, response) {
    const elev = givenNum(problem, "elevFt");
    const setting = givenNum(problem, "setting");
    const inHg = givenStr(problem, "variant") === "inHg";
    const wrong = inHg
      ? elev - (29.92 - setting) * 1000
      : elev - (1013.25 - setting) * 27;
    return checkNumeric(problem, response, {
      wrongs: [
        {
          value: wrong,
          id: "wrongSide",
          text: L(
            "Wrong direction: when the pressure is LOWER than standard, the pressure altitude is HIGHER than the elevation.",
            "Mauvais sens : quand la pression est INFÉRIEURE au standard, l'altitude pression est SUPÉRIEURE à l'altitude du terrain.",
          ),
        },
        {
          value: inHg
            ? elev + (29.92 - setting) * 100
            : elev + (1013.25 - setting) * 2.7,
          id: "factor",
          text: inHg
            ? L(
                "1 inHg is 1,000 ft (0.01 inHg is 10 ft).",
                "1 inHg vaut 1 000 ft (0,01 inHg = 10 ft).",
              )
            : L("1 hPa is about 27 ft.", "1 hPa vaut environ 27 ft."),
        },
      ],
      noFactor: true,
    });
  },
});

// ================================================================== density altitude
export function solveDensityAltitude(
  paFt: number,
  oatC: number,
): { isa: number; dev: number; rule: number; exact: number } {
  const isa = isaTempRule(paFt);
  return {
    isa,
    dev: oatC - isa,
    rule: densityAltitudeRule(paFt, oatC),
    exact: densityAltitudeExact(paFt, oatC),
  };
}

export function densityAltitudeGenerator(
  id: "ifr.densityAltitude" | "vfr.pressureDensityAltitude",
): GeneratorDef {
  const vfr = id === "vfr.pressureDensityAltitude";
  return defineGenerator({
    id,
    title: vfr
      ? L(
          "Pressure and density altitude for takeoff",
          "Altitudes pression et densité pour le décollage",
        )
      : L("Density altitude", "Altitude densité"),
    category: vfr ? "vfr" : "ifr",
    alsoIn: vfr ? undefined : ["vfr"],
    summary: vfr
      ? L(
          "From the field elevation, altimeter setting and OAT: PA, then DA ≈ PA + 120 × (OAT − ISA).",
          "À partir de l'altitude, du calage et de la température : Zp, puis Zd ≈ Zp + 120 × (T − ISA).",
        )
      : L(
          "DA ≈ PA + 120 ft per °C above ISA (ISA = 15 °C − 2 °C per 1,000 ft).",
          "Zd ≈ Zp + 120 ft par °C au-dessus de l'ISA (ISA = 15 °C − 2 °C par 1 000 ft).",
        ),
    generate(rng) {
      const refs = [
        REF.phak("ch. 4 (density altitude)"),
        REF.phak("ch. 11 (performance)"),
        REF.isa(),
      ];
      if (vfr) {
        const elev = rng.range(0, 6000, 50);
        const alt = rng.range(29.62, 30.22, 0.01);
        const pa = pressureAltitudeRuleInHg(elev, alt);
        const isa = isaTempRule(pa);
        const oat = Math.round(isa + rng.range(5, 25, 1));
        const s = solveDensityAltitude(pa, oat);
        const answer = roundStep(s.rule, 10);
        const parts: CalcPart[] = [
          {
            key: "pa",
            label: L("Pressure altitude", "Altitude pression"),
            answer: Math.round(pa),
            unit: "ft",
            tolerance: 20,
          },
        ];
        return {
          prompt: tr(
            (f) =>
              `Field elevation ${f.u(elev, "ft")}, altimeter ${alt.toFixed(2)} inHg, OAT ${f.u(oat, "degC")}. What are the pressure altitude and the density altitude for the takeoff chart?`,
            (f) =>
              `Altitude du terrain ${f.u(elev, "ft")}, calage ${alt.toFixed(2).replace(".", ",")} inHg, température ${f.u(oat, "degC")}. Quelles altitudes pression et densité pour l'abaque de décollage ?`,
          ),
          givens: [
            given("elevFt", L("Elevation", "Altitude du terrain"), elev, "ft"),
            given("altInHg", L("Altimeter", "Calage"), alt, "inHg"),
            given("oatC", L("OAT", "Température"), oat, "degC"),
          ],
          answer,
          unit: "ft",
          tolerance: bracket(s.rule, s.exact, 150, 50),
          exact: roundStep(s.exact, 10),
          parts,
          solutionSteps: [
            tr(
              (f) =>
                `PA = ${f.n(elev)} + (29.92 − ${alt.toFixed(2)}) × 1,000 = ${f.u(pa, "ft")}.`,
              (f) =>
                `Zp = ${f.n(elev)} + (29,92 − ${alt.toFixed(2).replace(".", ",")}) × 1 000 = ${f.u(pa, "ft")}.`,
            ),
            tr(
              (f) =>
                `ISA at ${f.n(pa)} ft = 15 − 2 × ${f.n(pa / 1000, 2)} = ${f.u(s.isa, "degC", 1)}; OAT is ISA ${f.s(s.dev, 1)} °C.`,
              (f) =>
                `ISA à ${f.n(pa)} ft = 15 − 2 × ${f.n(pa / 1000, 2)} = ${f.u(s.isa, "degC", 1)} ; la température est ISA ${f.s(s.dev, 1)} °C.`,
            ),
            tr(
              (f) =>
                `DA ≈ ${f.n(pa)} + 120 × ${f.n(s.dev, 1)} = ${f.u(s.rule, "ft")} (exact: ${f.n(s.exact)}).`,
              (f) =>
                `Zd ≈ ${f.n(pa)} + 120 × ${f.n(s.dev, 1)} = ${f.u(s.rule, "ft")} (exact : ${f.n(s.exact)}).`,
            ),
            tr(
              () =>
                `Enter the POH takeoff table with the pressure altitude and the OAT (it accounts for density); use the DA to feel how the aircraft will perform.`,
              () =>
                `Entrez dans le tableau de décollage avec l'altitude pression et la température (il intègre la densité) ; la Zd dit comment l'avion va se comporter.`,
            ),
          ],
          ruleOfThumb: L(
            "DA ≈ PA + 120 ft for every °C above ISA. Hot, high and humid: longer takeoff, weaker climb.",
            "Zd ≈ Zp + 120 ft par °C au-dessus de l'ISA. Chaud, haut et humide : décollage plus long, montée plus faible.",
          ),
          formula: L(
            "DA = (1 − σ^0.235) ÷ 6.876·10⁻⁶,  σ = (p/p0) × 288.15 ÷ (OAT + 273.15)",
            "Zd = (1 − σ^0,235) ÷ 6,876·10⁻⁶,  σ = (p/p0) × 288,15 ÷ (T + 273,15)",
          ),
          refs,
          diagram: {
            kind: "calc",
            calc: { kind: "altimetry", elevFt: elev, qnhInHg: alt, oatC: oat },
          },
        };
      }
      const pa = rng.range(2000, 10000, 500);
      const isa = isaTempRule(pa);
      const oat = Math.round(isa + rng.range(-10, 25, 1));
      const s = solveDensityAltitude(pa, oat);
      return {
        prompt: tr(
          (f) =>
            `Pressure altitude ${f.u(pa, "ft")}, OAT ${f.u(oat, "degC")}. What is the density altitude?`,
          (f) =>
            `Altitude pression ${f.u(pa, "ft")}, température ${f.u(oat, "degC")}. Quelle est l'altitude densité ?`,
        ),
        givens: [
          given("paFt", L("Pressure altitude", "Altitude pression"), pa, "ft"),
          given("oatC", L("OAT", "Température"), oat, "degC"),
        ],
        answer: roundStep(s.rule, 10),
        unit: "ft",
        tolerance: bracket(s.rule, s.exact, 150, 50),
        exact: roundStep(s.exact, 10),
        solutionSteps: [
          tr(
            (f) =>
              `ISA at ${f.n(pa)} ft = 15 − 2 × ${f.n(pa / 1000, 1)} = ${f.u(s.isa, "degC")}; deviation ${f.s(s.dev)} °C.`,
            (f) =>
              `ISA à ${f.n(pa)} ft = 15 − 2 × ${f.n(pa / 1000, 1)} = ${f.u(s.isa, "degC")} ; écart ${f.s(s.dev)} °C.`,
          ),
          tr(
            (f) =>
              `DA ≈ PA + 120 × deviation = ${f.n(pa)} ${s.dev >= 0 ? "+" : "−"} ${f.n(Math.abs(120 * s.dev))} = ${f.u(s.rule, "ft")} (exact ${f.n(s.exact)}).`,
            (f) =>
              `Zd ≈ Zp + 120 × écart = ${f.n(pa)} ${s.dev >= 0 ? "+" : "−"} ${f.n(Math.abs(120 * s.dev))} = ${f.u(s.rule, "ft")} (exact ${f.n(s.exact)}).`,
          ),
        ],
        ruleOfThumb: L(
          "DA ≈ PA + 120 ft per °C above ISA (minus below).",
          "Zd ≈ Zp + 120 ft par °C au-dessus de l'ISA (moins en dessous).",
        ),
        formula: L(
          "DA = (1 − σ^0.235) ÷ 6.876·10⁻⁶,  σ = (p/p0) × 288.15 ÷ (OAT + 273.15)",
          "Zd = (1 − σ^0,235) ÷ 6,876·10⁻⁶,  σ = (p/p0) × 288,15 ÷ (T + 273,15)",
        ),
        refs,
        diagram: {
          kind: "calc",
          calc: {
            kind: "altimetry",
            elevFt: pa,
            qnhInHg: 29.92,
            oatC: oat,
            altFt: pa,
          },
        },
      };
    },
    check(problem, response) {
      const oat = givenNum(problem, "oatC");
      const pa = hasGiven(problem, "paFt")
        ? givenNum(problem, "paFt")
        : pressureAltitudeRuleInHg(
            givenNum(problem, "elevFt"),
            givenNum(problem, "altInHg"),
          );
      const partWrongs: PartWrong[] = [];
      const wrongs: Wrong[] = [
        { value: pa + 120 * (oat - 15), id: "isaReference" },
        {
          value: pa - 120 * (oat - isaTempRule(pa)),
          id: "wrongSide",
          text: L(
            "Warmer than ISA means thinner air: the density altitude is HIGHER.",
            "Plus chaud que l'ISA, l'air est moins dense : l'altitude densité est PLUS HAUTE.",
          ),
        },
      ];
      if (hasGiven(problem, "elevFt")) {
        const elev = givenNum(problem, "elevFt");
        wrongs.push({
          value: densityAltitudeRule(elev, oat),
          id: "other",
          text: L(
            "Start from the pressure altitude, not the field elevation.",
            "Partez de l'altitude pression, pas de l'altitude du terrain.",
          ),
        });
        partWrongs.push({
          key: "pa",
          value: Math.round(
            elev - (29.92 - givenNum(problem, "altInHg")) * 1000,
          ),
          id: "wrongSide",
          text: L(
            "Pressure altitude: lower pressure than 29.92 → higher PA (add).",
            "Altitude pression : pression inférieure à 29,92 → Zp plus haute (on ajoute).",
          ),
        });
      }
      return checkNumeric(problem, response, {
        wrongs,
        partWrongs,
        noFactor: true,
      });
    },
  });
}

export const densityAltitude: GeneratorDef = densityAltitudeGenerator(
  "ifr.densityAltitude",
);

// ================================================================== cold temperature correction
export const coldTemperature: GeneratorDef = defineGenerator({
  id: "ifr.coldTemperature",
  title: L(
    "Cold-temperature altitude correction",
    "Correction d'altitude par grand froid",
  ),
  category: "ifr",
  summary: L(
    "How much to add to a procedure altitude when it is colder than ISA (ICAO table, ≈ 4 % per 10 °C).",
    "Combien ajouter à une altitude de procédure quand il fait plus froid que l'ISA (table OACI, ≈ 4 % par 10 °C).",
  ),
  generate(rng) {
    const elev = rng.range(0, 5000, 10);
    const temp = rng.range(-30, -5, 1);
    const height = rng.range(800, 3000, 100);
    const published = ceilStep(elev + height, 100);
    const h = published - elev;
    const exact = coldTempCorrectionFt(h, elev, temp);
    const rule = coldTempRule(h, elev, temp);
    const answer = ceilStep(exact, 10);
    const fix = rng.pick(["the FAF", "the IAF", "the step-down fix"] as const);
    const fixFr =
      fix === "the FAF"
        ? "le FAF"
        : fix === "the IAF"
          ? "l'IAF"
          : "le point de palier";
    const isa = isaTempRule(elev);
    return {
      prompt: tr(
        (f) =>
          `Airport elevation ${f.u(elev, "ft")}, reported temperature ${f.u(temp, "degC")}. ${fix.replace("the", "The")} altitude is ${f.u(published, "ft")}. How much do you add for the cold, and what altitude do you fly?`,
        (f) =>
          `Altitude de l'aérodrome ${f.u(elev, "ft")}, température ${f.u(temp, "degC")}. L'altitude publiée pour ${fixFr} est ${f.u(published, "ft")}. Combien ajoutez-vous pour le froid, et quelle altitude volez-vous ?`,
      ),
      givens: [
        given(
          "elevFt",
          L("Airport elevation", "Altitude de l'aérodrome"),
          elev,
          "ft",
        ),
        given(
          "tempC",
          L("Airport temperature", "Température de l'aérodrome"),
          temp,
          "degC",
        ),
        given(
          "publishedFt",
          L("Published altitude", "Altitude publiée"),
          published,
          "ft",
        ),
      ],
      answer,
      unit: "ft",
      tolerance: Math.max(20, exact * 0.08),
      exact: Math.round(exact),
      parts: [
        {
          key: "fly",
          label: L("Altitude to fly", "Altitude à voler"),
          answer: published + answer,
          unit: "ft",
          tolerance: Math.max(20, exact * 0.08),
        },
      ],
      solutionSteps: [
        tr(
          (f) =>
            `Height above the airport (the altimeter source): ${f.n(published)} − ${f.n(elev)} = ${f.u(h, "ft")}.`,
          (f) =>
            `Hauteur au-dessus de l'aérodrome (source du calage) : ${f.n(published)} − ${f.n(elev)} = ${f.u(h, "ft")}.`,
        ),
        tr(
          (f) =>
            `ISA at the airport ≈ ${f.u(isa, "degC")}: it is ${f.n(isa - temp)} °C colder than ISA.`,
          (f) =>
            `ISA à l'aérodrome ≈ ${f.u(isa, "degC")} : il fait ${f.n(isa - temp)} °C de moins que l'ISA.`,
        ),
        tr(
          (f) =>
            `Rule: 4 % per 10 °C below ISA: ${f.n(h)} × ${f.n(0.4 * (isa - temp), 1)} % ≈ ${f.u(rule, "ft")}.`,
          (f) =>
            `Règle : 4 % par 10 °C sous l'ISA : ${f.n(h)} × ${f.n(0.4 * (isa - temp), 1)} % ≈ ${f.u(rule, "ft")}.`,
        ),
        tr(
          (f) =>
            `ICAO formula (the AIM table): ${f.u(exact, "ft")}, round up: add ${f.u(answer, "ft")} → fly ${f.u(published + answer, "ft")}. Tell ATC when you apply a correction.`,
          (f) =>
            `Formule OACI (la table de l'AIM) : ${f.u(exact, "ft")}, arrondi au-dessus : ajoutez ${f.u(answer, "ft")} → volez ${f.u(published + answer, "ft")}. Prévenez l'ATC quand vous corrigez.`,
        ),
      ],
      ruleOfThumb: L(
        "Add 4 % of the height above the airport for every 10 °C below ISA. Cold air: the altimeter reads HIGH — you are lower than you think.",
        "Ajoutez 4 % de la hauteur au-dessus du terrain par 10 °C sous l'ISA. Air froid : l'altimètre lit TROP HAUT — vous êtes plus bas que vous ne le croyez.",
      ),
      formula: L(
        "ΔH = H × (15 − t0) ÷ (273 + t0 − 0.5 × 0.00198 × (H + Hss)),  t0 = t_ad + 0.00198 × Hss",
        "ΔH = H × (15 − t0) ÷ (273 + t0 − 0,5 × 0,00198 × (H + Hss)),  t0 = t_ad + 0,00198 × Hss",
      ),
      refs: [
        REF.aim(
          "ch. 7 sec. 3 (cold temperature barometric altimeter errors, CTA)",
        ),
        REF.pansOps("Vol I Part III Section 1 ch. 4 (temperature correction)"),
      ],
      diagram: {
        kind: "calc",
        calc: {
          kind: "altimetry",
          elevFt: elev,
          qnhInHg: 29.92,
          oatC: temp,
          altFt: published,
        },
      },
    };
  },
  check(problem, response) {
    const elev = givenNum(problem, "elevFt");
    const temp = givenNum(problem, "tempC");
    const pub = givenNum(problem, "publishedFt");
    const corr = ceilStep(coldTempCorrectionFt(pub - elev, elev, temp), 10);
    return checkNumeric(problem, response, {
      wrongs: [
        {
          value: coldTempCorrectionFt(pub, elev, temp),
          id: "other",
          text: L(
            "Correct the height ABOVE THE AIRPORT (the altimeter setting source), not the whole MSL altitude.",
            "Corrigez la hauteur AU-DESSUS DE L'AÉRODROME (source du calage), pas toute l'altitude.",
          ),
        },
        {
          value: pub + corr,
          id: "other",
          text: L(
            "That is the altitude to fly. The first answer is the correction alone.",
            "C'est l'altitude à voler. La première réponse est la correction seule.",
          ),
        },
      ],
      partWrongs: [
        {
          key: "fly",
          value: pub - corr,
          id: "wrongSide",
          text: L(
            "ADD the correction: in cold air you are lower than the altimeter shows.",
            "AJOUTEZ la correction : par grand froid vous êtes plus bas que ne l'indique l'altimètre.",
          ),
        },
      ],
      noFactor: true,
    });
  },
});

export const ALTIMETRY_GENERATORS = [
  pressureAltitude,
  densityAltitude,
  coldTemperature,
];
