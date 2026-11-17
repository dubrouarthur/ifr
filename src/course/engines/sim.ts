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
  MIXTURE,
  REVERSER_RATE,
  turbofanThrustFrac,
  reverserFree,
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
export function controlEnds(
  c: EngineControl,
  kind: EngineKind,
  reversed = false,
): [L10n, L10n] {
  if (c === "throttle" && kind === "turbofan" && reversed)
    return [L("Reverse idle", "Ralenti inversion"), L("Max reverse", "Inversion max")];
  if (c === "mixture")
    return [L("Idle cut-off", "Étouffoir"), L("Full rich", "Plein riche")];
  if (c === "prop")
    return [
      L("Low rpm (coarse)", "Grand pas (bas régime)"),
      L("High rpm (fine)", "Petit pas (haut régime)"),
    ];
  if (kind === "turbofan")
    return [L("Idle", "Ralenti"), L("Take-off", "Décollage")];
  return [L("Idle", "Ralenti"), L("Full", "Plein gaz")];
}

const RPM = L("rpm", "tr/min");
export interface GaugeSpec {
  id: string;
  name: L10n;
  /** the unit as the reader writes it (« tr/min », "rpm") */
  unit: L10n;
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
      unit: RPM,
      min: 0,
      max: 3000,
      red: 2700,
      digits: 0,
    },
    {
      id: "map",
      name: L("Manifold pressure", "Pression d’admission"),
      unit: L("inHg", "inHg"),
      min: 10,
      max: 30,
      digits: 1,
    },
    {
      id: "egt",
      name: L("EGT", "EGT"),
      unit: L("°F", "°F"),
      min: 1000,
      max: 1500,
      digits: 0,
    },
    {
      id: "ff",
      name: L("Fuel flow", "Débit carburant"),
      unit: L("gph", "gal/h"),
      min: 0,
      max: 16,
      digits: 1,
    },
  ],
  prop: [
    {
      id: "rpm",
      name: L("RPM", "Régime"),
      unit: RPM,
      min: 1500,
      max: 3000,
      red: 2700,
      digits: 0,
    },
    {
      id: "map",
      name: L("Manifold pressure", "Pression d’admission"),
      unit: L("inHg", "inHg"),
      min: 10,
      max: 30,
      digits: 1,
    },
    {
      id: "blade",
      name: L("Blade angle", "Calage des pales"),
      unit: L("°", "°"),
      min: 10,
      max: 35,
      digits: 1,
    },
  ],
  turboprop: [
    {
      id: "torque",
      name: L("Torque", "Couple"),
      unit: L("ft·lb", "ft·lb"),
      min: 0,
      // past the 1,865 limit, so an overtorque shows on the gauge rather than off its end
      max: 2200,
      red: TURBOPROP.torqueMax,
      digits: 0,
    },
    {
      id: "itt",
      name: L("ITT", "ITT"),
      unit: L("°C", "°C"),
      min: 400,
      max: 900,
      red: TURBOPROP.ittMax,
      digits: 0,
    },
    {
      id: "ng",
      name: L("Ng", "Ng"),
      unit: L("%", "%"),
      min: 40,
      max: 105,
      red: TURBOPROP.ngMax,
      digits: 1,
    },
    {
      id: "np",
      name: L("Np", "Np"),
      unit: RPM,
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
      unit: L("%", "%"),
      min: 0,
      max: 110,
      red: TURBOFAN.n1Red,
      digits: 1,
    },
    {
      id: "egt",
      name: L("EGT", "EGT"),
      unit: L("°C", "°C"),
      min: 300,
      max: 1000,
      red: TURBOFAN.egtRed,
      digits: 0,
    },
    { id: "n2", name: L("N2", "N2"), unit: L("%", "%"), min: 0, max: 110, digits: 1 },
    {
      id: "thrustPct",
      name: L("Thrust", "Poussée"),
      unit: L("%", "%"),
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
  turbofan: { n1: 2.2, n2: 1.6, egt: 2.4 },
};

/** An engine in time: lever positions in, gauge values out. */
export class EngineSim {
  set: Required<EngineSettings>;
  v: Record<string, number>;
  private cs = { rpm: 2400, bladeDeg: 20 };
  /** the turbofan's reverser doors (0 stowed … 1 deployed): the thrust turns as they open */
  private dep = 0;
  constructor(
    readonly kind: EngineKind,
    s?: EngineSettings,
  ) {
    this.set = settingsOf(kind, s);
    this.v = engineTargets(kind, this.set);
    if (kind === "prop") this.cs = { rpm: this.v.rpm, bladeDeg: this.v.blade };
    this.dep = this.set.reverse ? 1 : 0;
  }
  setSettings(s: EngineSettings) {
    this.set = settingsOf(this.kind, { ...this.set, ...s });
  }
  /** jump to the steady values (a still picture, reduced motion, a projector catching up) */
  settle() {
    this.v = engineTargets(this.kind, this.set);
    if (this.kind === "prop")
      this.cs = { rpm: this.v.rpm, bladeDeg: this.v.blade };
    this.dep = this.set.reverse ? 1 : 0;
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
    if (this.kind === "turbofan") {
      // the thrust follows the fan's speed now and the reverser doors as they open (not a lag of its own)
      const want = this.set.reverse ? 1 : 0;
      this.dep += Math.sign(want - this.dep) * Math.min(Math.abs(want - this.dep), REVERSER_RATE * dt);
      const frac = turbofanThrustFrac(out.n1, this.dep);
      out.thrustPct = frac * 100;
      out.thrust = frac;
    }
    this.v = out;
  }
  /** the gauges have caught up with the levers (nothing left to integrate: the frame loop may rest) */
  atRest(): boolean {
    const tgt = engineTargets(this.kind, this.set);
    if (this.kind === "prop")
      return Math.abs(this.cs.rpm - tgt.rpm) < 3 && Math.abs(this.cs.bladeDeg - tgt.blade) < 0.1;
    if (this.kind === "turbofan" && this.dep !== (this.set.reverse ? 1 : 0)) return false;
    for (const [k, x] of Object.entries(tgt)) {
      const v = this.v[k];
      // the turbofan's thrust is worked out from N1 and the doors (checked above), not smoothed on its own
      if (v === undefined || (this.kind === "turbofan" && (k === "thrustPct" || k === "thrust"))) continue;
      if (Math.abs(v - x) > Math.max(0.05, Math.abs(x) * 0.002)) return false;
    }
    return true;
  }
  /** the reversers may be deployed or stowed now (the interlock: thrust lever at idle first) */
  reverserFree(): boolean {
    return reverserFree(this.set.throttle);
  }
  /**
   * The student's reverser switch: deploys or stows only with the thrust lever at idle (AFH ch. 15). false when
   * the interlock holds it (nothing changes).
   */
  toggleReverse(): boolean {
    if (this.kind !== "turbofan" || !this.reverserFree()) return false;
    this.setSettings({ reverse: !this.set.reverse });
    return true;
  }
  /** one line of what is happening (the governor's state, the engine stopped, reversers…), no moving number */
  status(lang: Lang): string {
    const t = (en: string, fr: string) => (lang === "fr" ? fr : en);
    const v = this.v;
    if (this.kind === "piston") {
      if (!v.running) {
        const why = pistonOutputs({
          throttle: this.set.throttle,
          mixture: this.set.mixture,
          carbHeat: this.set.carbHeat,
          mags: this.set.mags,
        }).stop;
        if (why === "mags")
          return t("Magnetos off: the engine stops", "Magnétos sur arrêt : le moteur s’arrête");
        if (why === "cutoff")
          return t("Idle cut-off: no fuel, the engine stops", "Étouffoir : plus d’essence, le moteur s’arrête");
        if (why === "lean")
          return t("Mixture too lean: the engine stops", "Mélange trop pauvre : le moteur s’arrête");
        return t("Too little power to keep turning: the engine stalls", "Trop peu de puissance : le moteur cale");
      }
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
      const m = this.set.mixture;
      // the zones of the model's own mixture curve (model.ts MIXTURE)
      if (m < MIXTURE.egtPeak - 0.03)
        bits.push(t("Lean of peak EGT: power drops", "Plus pauvre que le pic d’EGT : la puissance baisse"));
      else if (m <= MIXTURE.egtPeak + 0.05)
        bits.push(t("Near peak EGT", "Proche du pic d’EGT"));
      else if (m <= MIXTURE.bestPower + 0.07)
        bits.push(t("Leaned: near best power", "Mélange appauvri : proche de la puissance maximale"));
      else if (m < 0.97) bits.push(t("Slightly leaned", "Mélange légèrement appauvri"));
      return bits.join(" · ") || t("Running: full rich", "En marche : plein riche");
    }
    if (this.kind === "prop") {
      const tilt = flyweightTilt(v.rpm, v.rpmSet);
      const tail =
        // the handbooks' order: rpm up first, then MAP; the threshold (MAP over the rpm's hundreds + 5) is the
        // picture's, the POH's power tables give the real combinations
        v.map > v.rpmSet / 100 + 5
          ? t(
              " · High MAP at low rpm: raise the rpm first",
              " · PA élevée à bas régime : augmentez d’abord le régime",
            )
          : "";
      if (tilt > 0.08)
        return (
          t(
            "Overspeed: flyweights out, the blades go coarser",
            "Survitesse : masselottes écartées, le pas augmente",
          ) + tail
        );
      if (tilt < -0.08 && v.blade <= CS_PROP.fineDeg + 0.05)
        return (
          t(
            "Below the governing range: blades on the fine stop",
            "Sous la plage de régulation : pales en butée petit pas",
          ) + tail
        );
      if (tilt < -0.08)
        return (
          t(
            "Underspeed: flyweights in, the blades go finer",
            "Sous-vitesse : masselottes rentrées, le pas diminue",
          ) + tail
        );
      return (
        t(`On speed: ${n(v.rpmSet, "en")} rpm held`, `En régime : ${n(v.rpmSet, "fr")} tr/min tenus`) + tail
      );
    }
    if (this.kind === "turboprop") {
      const bits: string[] = [];
      if (v.torque > TURBOPROP.torqueMax + 5)
        bits.push(
          t(
            `Torque over the limit (${n(TURBOPROP.torqueMax, "en")} ft·lb): reduce power`,
            `Couple au-delà de la limite (${n(TURBOPROP.torqueMax, "fr")} ft·lb) : réduisez la puissance`,
          ),
        );
      if (v.itt > TURBOPROP.ittMax)
        bits.push(
          t(
            `ITT over ${n(TURBOPROP.ittMax, "en")} °C: reduce power`,
            `ITT au-delà de ${n(TURBOPROP.ittMax, "fr")} °C : réduisez la puissance`,
          ),
        );
      // the Np the lever sets (not the moving needle)
      const npSet = TURBOPROP.npMin + this.set.prop * (TURBOPROP.npMax - TURBOPROP.npMin);
      bits.push(
        v.governing
          ? t(`Np governed at ${n(npSet, "en")} rpm`, `Np régulé à ${n(npSet, "fr")} tr/min`)
          : t(
              "Under the governing range: the propeller sits on its low pitch stop",
              "Sous la plage de régulation : l’hélice est en butée petit pas",
            ),
      );
      return bits.join(" · ");
    }
    if (this.set.reverse)
      return t(
        "Reversers deployed: the fan's air goes forward. The thrust lever now sets reverse thrust",
        "Inverseurs déployés : l’air de la soufflante repart vers l’avant. La manette règle maintenant l’inversion",
      );
    return t(
      `By-pass ratio ${TURBOFAN.bypassRatio.toLocaleString("en")}:1`,
      `Taux de dilution ${TURBOFAN.bypassRatio.toLocaleString("fr")}:1`,
    );
  }
}

/** Why the reverser switch does not move (the interlock), said where the switch is. */
export const REVERSER_LOCKED = L(
  "Thrust lever to idle first",
  "Manette au ralenti d’abord",
);

/** A gauge value as text in the reader's language (« 2 450 », « 24,8 »). */
export function gaugeText(g: GaugeSpec, v: number, lang: Lang): string {
  const n = Number.isFinite(v) ? v : 0;
  return n.toLocaleString(lang === "fr" ? "fr-FR" : "en-US", {
    minimumFractionDigits: g.digits,
    maximumFractionDigits: g.digits,
  });
}
