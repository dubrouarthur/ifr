// What an engine block shows and the student moves (course/engines): the levers each engine has, the gauges it
// reads, and the values in time (a turbine spools up over seconds, a piston answers at once, the constant-speed
// propeller's governor hunts and settles). Pure: no DOM, no three.js (tests/engines.test.ts).
import type {
  EngineControl,
  EngineKind,
  EngineSettings,
  L10n,
  Lang,
} from "../types";
import {
  CS_PROP,
  TURBOFAN,
  TURBOPROP,
  csPropSteady,
  csPropStep,
  flyweightTilt,
  manifoldPressure,
  pistonOutputs,
  rpmSetOf,
  settingsOf,
  turbofanOutputs,
  turbopropOutputs,
} from "./model";

const L = (en: string, fr: string): L10n => ({ en, fr });
export const tl = (t: L10n, lang: Lang): string =>
  lang === "fr" ? (t.fr ?? t.en) : t.en;

export const ENGINE_KINDS: readonly EngineKind[] = [
  "piston",
  "prop",
  "turboprop",
  "turbofan",
];
export const ENGINE_NAME: Record<EngineKind, L10n> = {
  piston: L("Four-stroke piston engine", "Moteur à pistons 4 temps"),
  prop: L("Constant-speed propeller", "Hélice à vitesse constante"),
  turboprop: L("Free-turbine turboprop", "Turbopropulseur à turbine libre"),
  turbofan: L("Two-spool turbofan", "Turboréacteur double flux"),
};
/** one line under the name: what it is, where it flies */
export const ENGINE_WHAT: Record<EngineKind, L10n> = {
  piston: L(
    "Flat four, 180 hp class, as on the training aircraft",
    "Quatre cylindres à plat, classe 180 ch, comme sur l’avion-école",
  ),
  prop: L(
    "Governor, flyweights, blade angle",
    "Régulateur, masselottes, calage des pales",
  ),
  turboprop: L(
    "Ng and Np on two shafts, ITT, torque",
    "Ng et Np sur deux arbres, ITT, couple",
  ),
  turbofan: L(
    "N1 / N2, EGT, by-pass, reversers",
    "N1 / N2, EGT, flux secondaire, inverseurs",
  ),
};

/** a whole number as the reader writes it (« 2 400 », "2,400") */
const n = (x: number, lang: Lang) => Math.round(x).toLocaleString(lang === "fr" ? "fr-FR" : "en-US");

/** The levers each engine has (the block's default: all of them). */
export const ENGINE_CONTROLS: Record<EngineKind, EngineControl[]> = {
  piston: ["throttle", "mixture", "carbHeat", "magnetos"],
  prop: ["throttle", "prop"],
  turboprop: ["throttle", "prop"],
  turbofan: ["throttle", "reverse"],
};
export function controlName(c: EngineControl, kind: EngineKind): L10n {
  switch (c) {
    case "throttle":
      return kind === "turbofan"
        ? L("Thrust lever", "Manette de poussée")
        : kind === "turboprop"
          ? L("Power lever", "Manette de puissance")
          : L("Throttle", "Manette des gaz");
    case "mixture":
      return L("Mixture", "Mélange");
    case "carbHeat":
      return L("Carburettor heat", "Réchauffage carburateur");
    case "magnetos":
      return L("Magnetos", "Magnétos");
    case "prop":
      return L("Propeller (rpm)", "Hélice (régime)");
    case "reverse":
      return L("Thrust reversers", "Inverseurs de poussée");
  }
}
/** the two ends of a lever, as the pilot says them */
export function controlEnds(c: EngineControl, kind: EngineKind): [L10n, L10n] {
  if (c === "mixture")
    return [L("Idle cut-off", "Étouffoir"), L("Full rich", "Plein riche")];
  if (c === "prop")
    return [L("Low rpm", "Petit régime"), L("High rpm", "Plein petit pas")];
  if (kind === "turbofan")
    return [L("Idle", "Ralenti"), L("Take-off", "Décollage")];
  return [L("Idle", "Ralenti"), L("Full", "Plein gaz")];
}

export interface GaugeSpec {
  id: string;
  name: L10n;
  unit: string;
  min: number;
  max: number;
  /** red line (the published limit cited in model.ts) */
  red?: number;
  digits: number;
}
export const ENGINE_GAUGES: Record<EngineKind, GaugeSpec[]> = {
  piston: [
    {
      id: "rpm",
      name: L("RPM", "Régime"),
      unit: "tr/min",
      min: 0,
      max: 3000,
      red: 2700,
      digits: 0,
    },
    {
      id: "map",
      name: L("Manifold pressure", "Pression d’admission"),
      unit: "inHg",
      min: 10,
      max: 30,
      digits: 1,
    },
    {
      id: "egt",
      name: L("EGT", "EGT"),
      unit: "°F",
      min: 1000,
      max: 1500,
      digits: 0,
    },
    {
      id: "ff",
      name: L("Fuel flow", "Débit carburant"),
      unit: "gal/h",
      min: 0,
      max: 16,
      digits: 1,
    },
  ],
  prop: [
    {
      id: "rpm",
      name: L("RPM", "Régime"),
      unit: "tr/min",
      min: 1500,
      max: 3000,
      red: 2700,
      digits: 0,
    },
    {
      id: "map",
      name: L("Manifold pressure", "Pression d’admission"),
      unit: "inHg",
      min: 10,
      max: 30,
      digits: 1,
    },
    {
      id: "blade",
      name: L("Blade angle", "Calage des pales"),
      unit: "°",
      min: 10,
      max: 35,
      digits: 1,
    },
  ],
  turboprop: [
    {
      id: "torque",
      name: L("Torque", "Couple"),
      unit: "ft·lb",
      min: 0,
      max: 2000,
      red: TURBOPROP.torqueMax,
      digits: 0,
    },
    {
      id: "itt",
      name: L("ITT", "ITT"),
      unit: "°C",
      min: 400,
      max: 900,
      red: TURBOPROP.ittMax,
      digits: 0,
    },
    {
      id: "ng",
      name: L("Ng", "Ng"),
      unit: "%",
      min: 40,
      max: 105,
      red: TURBOPROP.ngMax,
      digits: 1,
    },
    {
      id: "np",
      name: L("Np", "Np"),
      unit: "tr/min",
      min: 800,
      max: 2000,
      red: TURBOPROP.npMax,
      digits: 0,
    },
  ],
  turbofan: [
    {
      id: "n1",
      name: L("N1", "N1"),
      unit: "%",
      min: 0,
      max: 110,
      red: TURBOFAN.n1Red,
      digits: 1,
    },
    {
      id: "egt",
      name: L("EGT", "EGT"),
      unit: "°C",
      min: 300,
      max: 1000,
      red: TURBOFAN.egtRed,
      digits: 0,
    },
    { id: "n2", name: L("N2", "N2"), unit: "%", min: 0, max: 110, digits: 1 },
    {
      id: "thrustPct",
      name: L("Thrust", "Poussée"),
      unit: "%",
      min: -40,
      max: 100,
      digits: 0,
    },
  ],
};

/** The steady values for lever positions (what the gauges settle on). */
export function engineTargets(
  kind: EngineKind,
  set: Required<EngineSettings>,
): Record<string, number> {
  switch (kind) {
    case "piston": {
      const o = pistonOutputs({
        throttle: set.throttle,
        mixture: set.mixture,
        carbHeat: set.carbHeat,
        mags: set.mags,
      });
      return {
        rpm: o.rpm,
        map: o.mapInHg,
        egt: o.egtF,
        ff: o.fuelGph,
        power: o.powerPct,
        running: o.running ? 1 : 0,
      };
    }
    case "prop": {
      const map = manifoldPressure(set.throttle);
      const rpmSet = rpmSetOf(set.prop);
      const o = csPropSteady({ mapInHg: map, rpmSet });
      return {
        rpm: o.rpm,
        rpmSet,
        map: Math.round(map * 10) / 10,
        blade: o.bladeDeg,
        regime: o.regime === "governing" ? 0 : o.regime === "fineStop" ? -1 : 1,
      };
    }
    case "turboprop": {
      const o = turbopropOutputs({ throttle: set.throttle, prop: set.prop });
      const blade = o.governing ? 15 + 25 * (o.shp / TURBOPROP.shp) : 11;
      return {
        ng: o.ng,
        np: o.np,
        itt: o.ittC,
        torque: o.torqueFtLb,
        shp: o.shp,
        blade,
        governing: o.governing ? 1 : 0,
      };
    }
    case "turbofan": {
      const o = turbofanOutputs({
        throttle: set.throttle,
        reverse: set.reverse,
      });
      return {
        n1: o.n1,
        n2: o.n2,
        egt: o.egtC,
        thrustPct: o.thrustPct,
        thrust: o.thrustPct / 100,
      };
    }
  }
}

/** how fast each value follows (time constant, s): turbines spool up slowly (AFH ch. 15), pistons answer at once */
const TAU: Partial<Record<EngineKind, Record<string, number>>> = {
  piston: { rpm: 0.5, map: 0.25, egt: 2.5, ff: 0.6 },
  turboprop: { ng: 1.4, itt: 1.8, torque: 1.6, np: 1.6, blade: 1.2 },
  turbofan: { n1: 2.2, n2: 1.6, egt: 2.4, thrustPct: 2.2, thrust: 2.2 },
};

/** An engine in time: lever positions in, gauge values out. */
export class EngineSim {
  set: Required<EngineSettings>;
  v: Record<string, number>;
  private cs = { rpm: 2400, bladeDeg: 20 };
  constructor(
    readonly kind: EngineKind,
    s?: EngineSettings,
  ) {
    this.set = settingsOf(kind, s);
    this.v = engineTargets(kind, this.set);
    if (kind === "prop") this.cs = { rpm: this.v.rpm, bladeDeg: this.v.blade };
  }
  setSettings(s: EngineSettings) {
    this.set = settingsOf(this.kind, { ...this.set, ...s });
  }
  /** jump to the steady values (a still picture, reduced motion, a projector catching up) */
  settle() {
    this.v = engineTargets(this.kind, this.set);
    if (this.kind === "prop")
      this.cs = { rpm: this.v.rpm, bladeDeg: this.v.blade };
  }
  step(dt: number) {
    if (dt <= 0) return;
    const tgt = engineTargets(this.kind, this.set);
    if (this.kind === "prop") {
      this.cs = csPropStep(
        this.cs,
        { mapInHg: tgt.map, rpmSet: tgt.rpmSet },
        dt,
      );
      this.v = { ...tgt, rpm: this.cs.rpm, blade: this.cs.bladeDeg };
      return;
    }
    const tau = TAU[this.kind] ?? {};
    const out: Record<string, number> = { ...tgt };
    for (const [k, t] of Object.entries(tgt)) {
      const T = tau[k];
      const cur = this.v[k];
      if (!T || cur === undefined) continue;
      out[k] = cur + (t - cur) * (1 - Math.exp(-dt / T));
    }
    this.v = out;
  }
  /** one line of what is happening (the governor's state, the engine stopped, reversers…) */
  status(lang: Lang): string {
    const t = (en: string, fr: string) => (lang === "fr" ? fr : en);
    const v = this.v;
    if (this.kind === "piston") {
      if (!v.running)
        return this.set.mags === "off"
          ? t(
              "Magnetos off: the engine stops",
              "Magnétos sur OFF : le moteur s’arrête",
            )
          : t(
              "Idle cut-off: no fuel, the engine stops",
              "Étouffoir : plus d’essence, le moteur s’arrête",
            );
      const bits: string[] = [];
      if (this.set.mags === "left" || this.set.mags === "right")
        bits.push(
          t(
            `One magneto (${this.set.mags === "left" ? "left" : "right"}): a small rpm drop`,
            `Une seule magnéto (${this.set.mags === "left" ? "gauche" : "droite"}) : légère chute de régime`,
          ),
        );
      if (this.set.carbHeat)
        bits.push(
          t(
            "Carburettor heat on: warm air, less power",
            "Réchauffage carburateur : air chaud, un peu moins de puissance",
          ),
        );
      if (this.set.mixture < 0.5)
        bits.push(
          t(
            "Lean of peak EGT: power drops",
            "Plus pauvre que le pic d’EGT : la puissance baisse",
          ),
        );
      else if (this.set.mixture < 0.9)
        bits.push(
          t(
            "Leaned: near best power",
            "Mélange appauvri : proche de la puissance maximale",
          ),
        );
      return (
        bits.join(" · ") || t("Running: full rich", "En marche : plein riche")
      );
    }
    if (this.kind === "prop") {
      const tilt = flyweightTilt(v.rpm, v.rpmSet);
      if (tilt > 0.08)
        return t(
          "Overspeed: flyweights out, the blades go coarser",
          "Survitesse : masselottes écartées, le pas augmente",
        );
      if (tilt < -0.08 && v.blade <= CS_PROP.fineDeg + 0.05)
        return t(
          "Below the governing range: blades on the fine stop",
          "Sous la plage de régulation : pales en butée petit pas",
        );
      if (tilt < -0.08)
        return t(
          "Underspeed: flyweights in, the blades go finer",
          "Sous-vitesse : masselottes rentrées, le pas diminue",
        );
      return t(
        `On speed: ${n(v.rpmSet, "en")} rpm held`,
        `En régime : ${n(v.rpmSet, "fr")} tr/min tenus`,
      );
    }
    if (this.kind === "turboprop")
      return v.governing
        ? t(
            `Np governed at ${n(v.np, "en")} rpm`,
            `Np régulé à ${n(v.np, "fr")} tr/min`,
          )
        : t(
            "Under the governing range: the propeller sits on its low pitch stop",
            "Sous la plage de régulation : l’hélice est en butée petit pas",
          );
    if (this.set.reverse)
      return t(
        "Reversers deployed: the fan's air goes forward",
        "Inverseurs déployés : l’air de la soufflante repart vers l’avant",
      );
    return t(
      `By-pass ratio ${TURBOFAN.bypassRatio.toLocaleString("en")}:1`,
      `Taux de dilution ${TURBOFAN.bypassRatio.toLocaleString("fr")}:1`,
    );
  }
}

/** A gauge value as text in the reader's language (« 2 450 », « 24,8 »). */
export function gaugeText(g: GaugeSpec, v: number, lang: Lang): string {
  const n = Number.isFinite(v) ? v : 0;
  return n.toLocaleString(lang === "fr" ? "fr-FR" : "en-US", {
    minimumFractionDigits: g.digits,
    maximumFractionDigits: g.digits,
  });
}
