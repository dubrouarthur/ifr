// Failure drills for flying clubs (procedures mode): ready-made exercises built at any airport of the loaded nav
// data (real world or the training region) — where / phase, the failure(s) with their trigger, the procedure
// expected, training or test — and the helpers the flight builder's quick drill form uses.
//
// Exports for the Flight Center hub (club-hub package):
//   DRILL_TEMPLATES                       the club templates (FR / EN names and descriptions)
//   listDrills(lang?)                     the club's saved drills (My flights with `drill`) then the templates
//   buildDrill(templateId, opts)          a template as a flight at an airport (null: no suitable airport loaded)
//   openDrill(...) in src/ui/circuitBuilder.ts opens the flight builder on a template or a saved drill.
import { AIRPORTS, APPROACHES, NAVAIDS, findFix } from "../nav/data";
import { bearingDeg, distanceNm } from "../nav/geo";
import {
  FAILURE_GROUPS,
  FAILURE_LABELS_EN,
  FAILURE_LABELS_FR,
  type FailureKey,
} from "../sim/systemsTypes";
import type { Weather } from "../sim/environment";
import type { Approach } from "../nav/types";
import {
  appsAt,
  airStartNear,
  circuitStore,
  currentWorld,
  iafAlt,
  missedHold,
  pickAirport,
  roundAlt,
  runwayStart,
  windFor,
  type Circuit,
  type CircuitFailure,
  type CircuitLeg,
  type CircuitStart,
  type DrillPhase,
} from "./circuits";
import type { DrillMode, Lang, Procedure } from "./procedureTypes";
import { effectiveProcedures } from "./procedureStore";
import { fakeView, pickProcedure } from "./procedures";
import { lang as uiLang } from "../ui/i18n";

export type { DrillPhase };
type L10n = { fr: string; en: string };
const L = (fr: string, en: string): L10n => ({ fr, en });
const cur = (): Lang => (uiLang() === "fr" ? "fr" : "en");
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// ------------------------------------------------------------------ phases and weather
export const PHASES: { id: DrillPhase; name: L10n; desc: L10n }[] = [
  {
    id: "lineup",
    name: L("Aligné piste", "Lined up"),
    desc: L(
      "Aligné sur la piste, prêt au décollage",
      "Lined up on the runway, ready for take-off",
    ),
  },
  {
    id: "climbout",
    name: L("Montée initiale", "After take-off"),
    desc: L(
      "En montée à Vy, 500 ft sol après le décollage",
      "Climbing at Vy, 500 ft above the runway",
    ),
  },
  {
    id: "cruise",
    name: L("Croisière", "Cruise"),
    desc: L(
      "En croisière vers le terrain, au niveau de la règle semi-circulaire (VFR ou IFR)",
      "Cruising toward the airport at a semicircular-rule level (VFR or IFR)",
    ),
  },
  {
    id: "approach",
    // not "IMC approach": the weather is chosen in step 3 (a flaps drill flies it in VMC)
    name: L("Approche", "Approach"),
    desc: L(
      "Approche aux instruments depuis l’IAF",
      "Instrument approach from the initial fix",
    ),
  },
  {
    id: "hold",
    name: L("Attente", "Hold"),
    desc: L(
      "Circuit d’attente, puis l’approche",
      "Holding pattern, then the approach",
    ),
  },
];

export type DrillWx = "vmc" | "imc" | "low";
export const DRILL_WX: { id: DrillWx; name: L10n; desc: L10n }[] = [
  {
    id: "vmc",
    name: L("VMC", "VMC"),
    desc: L("Ciel clair, 10 km et plus", "Clear sky, 10 SM"),
  },
  {
    id: "imc",
    name: L("IMC", "IMC"),
    desc: L("Plafond 900 ft, 3 km", "Ceiling 900 ft, 2 SM"),
  },
  {
    id: "low",
    name: L("Minima", "Low IMC"),
    desc: L(
      "Plafond 250 ft, 1200 m : aux minima",
      "Ceiling 250 ft, 3/4 SM: near minimums",
    ),
  },
];

/** the weather of a preset, wind down the runway of `ap` */
export function drillWeather(
  wx: DrillWx,
  ap?: Approach | null,
  oatC?: number,
): Partial<Weather> {
  const wind = ap
    ? windFor(ap, wx === "vmc" ? 8 : 10)
    : { windDir: 250, windKt: 8 };
  const base: Partial<Weather> =
    wx === "vmc"
      ? { ceilingFt: 20000, visibilitySm: 10, turbulence: 0.1 }
      : wx === "imc"
        ? {
            ceilingFt: 900,
            cloudTopFt: 9000,
            visibilitySm: 2,
            turbulence: 0.15,
          }
        : {
            ceilingFt: 250,
            cloudTopFt: 9000,
            visibilitySm: 0.75,
            turbulence: 0.15,
          };
  return {
    ...base,
    ...wind,
    gustKt: 0,
    ...(oatC !== undefined ? { oatSeaLevelC: oatC } : {}),
  };
}

const hasRunways = (i: string) =>
  (AIRPORTS.find((a) => a.icao === i)?.runways.length ?? 0) > 0;

/** Cruise altitude of the phase, by the semicircular rule (FAA 91.159 / 91.179, SERA.5005 / 5015), on the
 *  magnetic course (≈ the true course: the variation is ignored): IFR whole thousands — odd eastbound (000–179°),
 *  even westbound; VFR the same plus 500 ft. The lowest such level at least 4000 ft and 3000 ft above the airport
 *  (4500 ft VFR westbound, 5500 ft VFR eastbound, 4000 / 5000 ft IFR at a low airport). */
export function cruiseAlt(
  elevFt: number,
  courseDeg: number,
  ifr: boolean,
): number {
  const east = ((courseDeg % 360) + 360) % 360 < 180;
  const min = Math.max(4000, elevFt + 3000);
  for (let a = 1000; a <= 17500; a += 500) {
    if (a < min) continue;
    const th = Math.floor(a / 1000);
    const odd = th % 2 === 1;
    if (ifr ? a % 1000 === 0 && odd === east : a % 1000 === 500 && odd === east)
      return a;
  }
  return roundAlt(min);
}

/** The start and the legs of a phase at an airport (the best approach of the airport to come back and land).
 *  Null when the loaded data has no airport with a runway. */
export function phaseFlight(
  icao: string | undefined,
  phase: DrillPhase,
  /** weather preset: VMC cruises at a VFR level, IMC at an IFR one (default IMC) */
  wx: DrillWx = "imc",
): {
  start: CircuitStart;
  legs: CircuitLeg[];
  dep: string;
  dest: string;
  approach: Approach | null;
} | null {
  const at =
    pickAirport(icao, (i) => hasRunways(i) && appsAt(i).length > 0) ??
    pickAirport(icao, hasRunways);
  // the airport asked for, even without an approach (a VFR club field), when it has a runway
  const want = icao && hasRunways(icao) ? icao : at;
  if (!want) return null;
  const apt = AIRPORTS.find((a) => a.icao === want)!;
  const ap = appsAt(want)[0] ?? null;
  const tr = ap?.transitions[0];
  const land: CircuitLeg[] = ap
    ? [
        {
          type: "approach",
          approachId: ap.id,
          transition: null,
          outcome: "land",
        },
      ]
    : [];
  const out = { dep: want, dest: want, approach: ap };
  switch (phase) {
    case "lineup":
    case "climbout": {
      const st = runwayStart(want, ap ?? undefined) as Extract<
        CircuitStart,
        { type: "runway" }
      >;
      if (phase === "climbout") st.airborne = 500;
      return { ...out, start: st, legs: land };
    }
    case "cruise": {
      const f = tr?.legs[0]?.fix ?? ap?.final[0]?.fix ?? findFix(want);
      if (!f) return null;
      const brg =
        distanceNm(apt, f) > 1 ? (bearingDeg(apt, f) + 360) % 360 : 270;
      // flying from the start toward the fix: the course is the reciprocal of the start's bearing
      const alt = cruiseAlt(
        apt.elevFt,
        (Math.round(brg / 5) * 5 + 180) % 360,
        wx !== "vmc",
      );
      const start: CircuitStart = {
        type: "air",
        fix: f.ident,
        bearing: (Math.round(brg / 5) * 5) % 360,
        distNm: 15,
        altFt: alt,
        hdg: null,
        iasKt: 105,
      };
      const legs: CircuitLeg[] = ap
        ? [
            { type: "fix", ident: f.ident, alt },
            {
              type: "approach",
              approachId: ap.id,
              transition: tr?.name ?? null,
              outcome: "land",
            },
          ]
        : [{ type: "fix", ident: f.ident, alt }];
      return { ...out, start, legs };
    }
    case "approach": {
      if (!ap) return phaseFlight(want, "cruise", wx);
      return {
        ...out,
        start: airStartNear(ap, tr, iafAlt(ap, tr)),
        legs: [
          {
            type: "approach",
            approachId: ap.id,
            transition: tr?.name ?? null,
            outcome: "land",
          },
        ],
      };
    }
    case "hold": {
      const pub = ap ? missedHold(ap) : null;
      const vor = NAVAIDS.filter((n) => n.type !== "NDB").sort(
        (a, b) => distanceNm(a, apt) - distanceNm(b, apt),
      )[0];
      const fixId = pub?.ident ?? vor?.ident;
      const fx = fixId ? findFix(fixId) : undefined;
      if (!fx) return phaseFlight(want, "cruise", wx);
      const inbound =
        pub?.inbound ??
        ((Math.round(bearingDeg(fx, apt) / 10) * 10) % 360 || 360);
      const alt = pub?.alt ?? Math.max(3000, roundAlt(apt.elevFt + 2500));
      const start: CircuitStart = {
        type: "air",
        fix: fx.ident,
        bearing: (inbound + 130) % 360,
        distNm: 8,
        altFt: alt,
        hdg: null,
        iasKt: 95,
      };
      return {
        ...out,
        start,
        legs: [
          {
            type: "hold",
            ident: fx.ident,
            inbound,
            turn: pub?.turn ?? "R",
            legMin: pub?.legMin ?? 1,
            alt,
            laps: 2,
          },
          ...land,
        ],
      };
    }
  }
}

/** the airport a drill flight is built at */
export function drillAirport(c: Circuit): string | undefined {
  return (
    c.dep ?? (c.start.type === "runway" ? c.start.airport : undefined) ?? c.dest
  );
}

/** the name a template drill gets at an airport: the template's own name in its phase, else what fails and where
 *  ("Engine failure · Cruise · PARD": an EFATO moved to the cruise is no longer an EFATO) */
export function drillAutoName(c: Circuit, lang: Lang = cur()): string | null {
  const tpl = DRILL_TEMPLATES.find((x) => x.id === c.template);
  const apt = drillAirport(c);
  if (!tpl || !apt) return null;
  const phase = c.drill?.phase ?? tpl.phase;
  if (phase === tpl.phase) return `${tpl.name[lang]} · ${apt}`;
  const what = [
    ...new Set(
      c.failures.map((f) =>
        f.pool?.length
          ? lang === "fr"
            ? "Panne aléatoire"
            : "Random failure"
          : failureLabel(f.key, lang),
      ),
    ),
  ].join(" + ");
  const ph = PHASES.find((p) => p.id === phase)?.name[lang] ?? phase;
  return `${what || tpl.name[lang]} · ${ph} · ${apt}`;
}
const isAutoName = (c: Circuit) =>
  (["fr", "en"] as Lang[]).some((l) => drillAutoName(c, l) === c.name);

/** move a drill to another phase (or airport): new start and legs, failures kept (leg triggers clamped). A
 *  template drill still under its automatic name is renamed for the new phase / airport. */
export function applyPhase(
  c: Circuit,
  phase: DrillPhase,
  airport = drillAirport(c),
): boolean {
  const pf = phaseFlight(airport, phase, c.drill?.wx ?? "imc");
  if (!pf) return false;
  const autoName = isAutoName(c);
  c.start = pf.start;
  c.legs = pf.legs;
  c.dep = pf.dep;
  c.dest = pf.dest;
  c.drill = { ...(c.drill ?? { mode: "training" }), phase };
  for (const f of c.failures) {
    if (f.trigger === "leg")
      f.at = Math.max(1, Math.min(f.at, Math.max(1, c.legs.length)));
    // an airborne start never climbs through a take-off height (an EFATO moved to the cruise): the trigger of the
    // new phase instead
    if (
      f.trigger === "altAgl" &&
      f.dir !== "descent" &&
      pf.start.type === "air"
    )
      Object.assign(f, { dir: undefined }, defaultTrigger(phase, f.key));
    // a climb-out start is already above a low trigger height
    if (
      f.trigger === "altAgl" &&
      f.dir !== "descent" &&
      pf.start.type === "runway" &&
      pf.start.airborne &&
      f.at <= pf.start.airborne
    )
      f.at = pf.start.airborne + 200;
    refreshExpect(c, f);
  }
  if (autoName) c.name = drillAutoName(c) ?? c.name;
  if (pf.approach)
    Object.assign(
      c.weather,
      windFor(pf.approach, c.drill.wx === "vmc" ? 8 : 10),
    );
  return true;
}

/** change the weather preset of a drill (wind kept) */
export function applyWx(c: Circuit, wx: DrillWx) {
  const keep = {
    windDir: c.weather.windDir,
    windKt: c.weather.windKt,
    oatSeaLevelC: c.weather.oatSeaLevelC,
  };
  c.weather = {
    ...drillWeather(wx),
    ...Object.fromEntries(
      Object.entries(keep).filter(([, v]) => v !== undefined),
    ),
  };
  c.drill = { ...(c.drill ?? { mode: "training" }), wx };
  // VMC cruises at a VFR level, IMC at an IFR one: the cruise start and its legs follow
  if (c.drill.phase === "cruise" && c.start.type === "air") {
    const f = findFix(c.start.fix);
    const apt = AIRPORTS.find((a) => a.icao === drillAirport(c));
    if (f && apt) {
      const old = c.start.altFt;
      const alt = cruiseAlt(
        apt.elevFt,
        (c.start.bearing + 180) % 360,
        wx !== "vmc",
      );
      if (alt !== old) {
        c.start = { ...c.start, altFt: alt };
        for (const l of c.legs)
          if (l.type === "fix" && l.alt === old) l.alt = alt;
      }
    }
  }
}

/** training shows the checklist; test hides it and does not announce the failures */
export function applyMode(c: Circuit, mode: DrillMode) {
  c.drill = { ...(c.drill ?? {}), mode };
  for (const f of c.failures) f.hidden = mode === "test";
}

/** the trigger a new failure gets in a phase */
export function defaultTrigger(
  phase: DrillPhase | undefined,
  key?: FailureKey,
): Pick<CircuitFailure, "trigger" | "at" | "dir" | "window"> {
  const engine = key === "engine" || key === "enginePartial";
  switch (phase) {
    case "lineup":
      return engine
        ? { trigger: "altAgl", at: 400, dir: "climb" }
        : { trigger: "time", at: 1 };
    case "climbout":
      return engine
        ? { trigger: "altAgl", at: 700, dir: "climb" }
        : { trigger: "time", at: 0.5 };
    case "approach":
      return { trigger: "time", at: 1.5 };
    case "hold":
      return { trigger: "time", at: 3 };
    default:
      return { trigger: "time", at: 2 };
  }
}

/** the height trigger a failure gets when "At a height" is chosen: climbing through 400 ft (lined up) or 700 ft
 *  (after take-off), else descending through 1000 ft above the ground (on the approach that ends the drill) */
export function heightTrigger(
  c: Circuit,
): Pick<CircuitFailure, "trigger" | "at" | "dir"> {
  const ph = c.drill?.phase;
  if (c.start.type === "runway")
    return c.start.airborne || ph === "climbout"
      ? {
          trigger: "altAgl",
          at: Math.max(700, (c.start.airborne ?? 0) + 200),
          dir: "climb",
        }
      : { trigger: "altAgl", at: 400, dir: "climb" };
  return { trigger: "altAgl", at: 1000, dir: "descent" };
}

// ------------------------------------------------------------------ expected procedure
/** an estimate of where the aircraft is when a failure fires (to pick the procedure that applies: EFATO, take-off
 *  roll, in flight…) */
export function phaseView(
  c: Circuit,
  f: Pick<CircuitFailure, "trigger" | "at" | "dir">,
) {
  const phase = c.drill?.phase;
  if (f.trigger === "altAgl")
    return fakeView({ onGround: false, aglFt: f.at, iasKt: 70 });
  if (
    (phase === "lineup" ||
      (!phase && c.start.type === "runway" && !c.start.airborne)) &&
    f.trigger === "time" &&
    f.at <= 0.4
  )
    return fakeView({ onGround: true, aglFt: 0, iasKt: 40 });
  // lined up: ≈ 25 s of take-off roll, then ≈ 700 ft/min at Vy (C172S, sea level) — a time trigger 1 min after
  // the start is still an EFATO (≈ 400 ft), 2 min is in flight (≈ 1100 ft)
  const airborneStart = c.start.type === "runway" ? c.start.airborne : undefined;
  const onRwy = c.start.type === "runway";
  const fromLineup = phase === "lineup" || (!phase && onRwy && !airborneStart);
  const fromClimb = phase === "climbout" || (!phase && onRwy && !!airborneStart);
  const timed = f.trigger === "time" || f.trigger === "random";
  const minutes = Math.max(0, f.at);
  const startAgl = airborneStart ?? 500;
  const agl =
    fromClimb && timed
      ? Math.min(3000, startAgl + minutes * 700)
      : fromLineup && timed
        ? Math.min(3000, Math.max(50, ((minutes * 60 - 25) / 60) * 700))
        : phase === "approach"
          ? 1500
          : 3000;
  return fakeView({ onGround: false, aglFt: agl });
}

/** the procedure the drill session will run for this failure when none is chosen (club first, phase-aware) */
export function suggestProcedure(
  c: Circuit,
  f: CircuitFailure,
  lang: Lang = cur(),
): Procedure | null {
  try {
    return pickProcedure(
      effectiveProcedures(),
      f.key,
      lang,
      f.expect,
      phaseView(c, f),
    );
  } catch {
    return null;
  }
}

/** a phase-specific expected procedure (EFATO, take-off roll…) that no longer applies where the failure now
 *  happens (the drill moved to another phase): back to Automatic, so the procedure of the new phase is expected */
export function refreshExpect(
  c: Circuit,
  f: CircuitFailure,
  lang: Lang = cur(),
) {
  if (!f.expect) return;
  let p: Procedure | null = null;
  try {
    p = pickProcedure(effectiveProcedures(), f.key, lang, f.expect);
  } catch {
    return;
  }
  if (!p?.when) return;
  const v = phaseView(c, f);
  const w = p.when;
  const ok =
    (w.onGround === undefined || w.onGround === v.onGround) &&
    (!w.aglFt ||
      (!v.onGround && v.aglFt >= w.aglFt[0] && v.aglFt <= w.aglFt[1]));
  if (!ok) delete f.expect;
}

/** procedures that answer a failure: the club's first (any language), then the library ones in `lang` */
export function procedureChoices(
  key: FailureKey,
  lang: Lang = cur(),
): Procedure[] {
  const all = effectiveProcedures();
  const club = all.filter(
    (p) => p.source === "club" && p.failures.includes(key),
  );
  const lib = all.filter(
    (p) => p.source !== "club" && p.lang === lang && p.failures.includes(key),
  );
  return [...club, ...lib];
}

// ------------------------------------------------------------------ templates
export interface DrillTemplate {
  id: string;
  name: L10n;
  desc: L10n;
  phase: DrillPhase;
  wx: DrillWx;
  mode: DrillMode;
  failures: CircuitFailure[];
  cockpit?: Circuit["cockpit"];
  allowAp?: boolean;
  /** outside air temperature at sea level (icing) */
  oatC?: number;
}

/** failures with a procedure (random club tests draw from these) */
export function groupKeys(
  group: (typeof FAILURE_GROUPS)[number]["id"] | "any",
): FailureKey[] {
  const keys =
    group === "any"
      ? FAILURE_GROUPS.flatMap((g) => g.keys)
      : (FAILURE_GROUPS.find((g) => g.id === group)?.keys ?? []);
  // total engine failure and the instruments of the G1000 stay out of a random club test
  const answered = new Set(effectiveProcedures().flatMap((p) => p.failures));
  return keys.filter(
    (k) =>
      answered.has(k) &&
      (group !== "any" ||
        (k !== "engine" && k !== "ahrs" && k !== "airData" && k !== "door")),
  );
}

export const DRILL_TEMPLATES: DrillTemplate[] = [
  {
    id: "d-efato",
    name: L(
      "Panne moteur au décollage (EFATO)",
      "Engine failure after take-off (EFATO)",
    ),
    desc: L(
      "Le moteur s’arrête en montée à 400 ft : assiette de plané, atterrissage droit devant, sans demi-tour.",
      "The engine quits climbing through 400 ft: glide attitude, land ahead, no turn back.",
    ),
    phase: "lineup",
    wx: "vmc",
    mode: "training",
    failures: [
      {
        key: "engine",
        trigger: "altAgl",
        at: 400,
        dir: "climb",
        expect: "c172.efato",
      },
    ],
  },
  {
    id: "d-engine-cruise",
    name: L(
      "Panne moteur en croisière + atterrissage en campagne",
      "Engine failure in cruise + forced landing",
    ),
    desc: L(
      "Plané à 68 kt, tentative de redémarrage, puis atterrissage en campagne.",
      "Best glide 68 KIAS, restart attempt, then a forced landing in a field.",
    ),
    phase: "cruise",
    wx: "vmc",
    mode: "training",
    failures: [
      { key: "engine", trigger: "time", at: 2, expect: "c172.engineFailure" },
    ],
  },
  {
    id: "d-engine-fire",
    name: L("Feu moteur en vol", "Engine fire in flight"),
    desc: L(
      "Mélange étouffoir, carburant coupé, puis descente rapide et atterrissage moteur arrêté.",
      "Mixture idle cut-off, fuel off, then an emergency descent and a forced landing.",
    ),
    phase: "cruise",
    wx: "vmc",
    mode: "training",
    failures: [
      { key: "engineFire", trigger: "time", at: 2, expect: "c172.engineFire" },
    ],
  },
  {
    id: "d-elec-fire",
    name: L("Feu électrique", "Electrical fire"),
    desc: L(
      "Fumée en cabine : masters coupés, aérations fermées, extincteur ; aérer une fois le feu éteint, puis ne remettre que l’indispensable.",
      "Smoke in the cabin: masters off, vents closed, extinguisher; ventilate once the fire is out, then restore only what is needed.",
    ),
    phase: "cruise",
    wx: "vmc",
    mode: "training",
    failures: [
      {
        key: "electricalFire",
        trigger: "time",
        at: 3,
        expect: "c172.electricalFire",
      },
    ],
  },
  {
    id: "d-alternator-imc",
    name: L("Panne d’alternateur en IMC", "Alternator failure in IMC"),
    desc: L(
      "LOW VOLTS en nuage : délestage, réarmement, puis l’approche sur batterie.",
      "LOW VOLTS in cloud: load shedding, reset, then the approach on the battery.",
    ),
    phase: "cruise",
    wx: "imc",
    mode: "training",
    failures: [
      { key: "alternator", trigger: "time", at: 2, expect: "c172.alternator" },
    ],
  },
  {
    id: "d-vacuum-app",
    name: L(
      "Panne de dépression en approche IMC",
      "Vacuum failure on an IMC approach",
    ),
    desc: L(
      "Horizon et conservateur de cap partent : approche en panel partiel, à la main.",
      "The attitude and heading indicators drift: partial-panel approach, hand-flown.",
    ),
    phase: "approach",
    wx: "imc",
    mode: "training",
    cockpit: "steam",
    allowAp: false,
    failures: [
      { key: "vacuum", trigger: "time", at: 1.5, expect: "c172.vacuum" },
    ],
  },
  {
    id: "d-pitot-icing",
    name: L("Givrage pitot", "Pitot icing"),
    desc: L(
      "En nuage, température négative : l’anémomètre chute. Réchauffage pitot, assiette et puissance.",
      "In cloud below freezing: the airspeed falls. Pitot heat on, fly attitude and power.",
    ),
    phase: "cruise",
    wx: "imc",
    mode: "training",
    oatC: 4,
    failures: [
      { key: "pitotIcing", trigger: "time", at: 2, expect: "c172.pitot" },
    ],
  },
  {
    id: "d-static",
    name: L("Prise statique obstruée", "Static port blocked"),
    desc: L(
      "Altimètre figé, variomètre à zéro : prise statique de secours.",
      "Altimeter frozen, VSI at zero: alternate static source.",
    ),
    phase: "cruise",
    wx: "imc",
    mode: "training",
    failures: [
      { key: "staticBlocked", trigger: "time", at: 2, expect: "c172.static" },
    ],
  },
  {
    id: "d-lostcomms",
    name: L("Panne radio en IFR", "Lost communications in IFR"),
    desc: L(
      "Plus de radio : transpondeur 7600, route et altitude selon la règle, puis l’approche.",
      "No radio: squawk 7600, route and altitude by the rule, then the approach.",
    ),
    phase: "cruise",
    wx: "imc",
    mode: "training",
    failures: [
      { key: "comms", trigger: "time", at: 2, expect: "c172.lostComms" },
    ],
  },
  {
    id: "d-rough",
    name: L("Moteur qui tourne mal", "Rough-running engine"),
    desc: L(
      "Vibrations et perte de puissance : mélange, magnétos, pompe électrique, terrain le plus proche.",
      "Vibration and power loss: mixture, magnetos, aux pump, nearest airport.",
    ),
    phase: "cruise",
    wx: "vmc",
    mode: "training",
    failures: [
      {
        key: "engineRough",
        trigger: "time",
        at: 2,
        expect: "c172.roughEngine",
      },
    ],
  },
  {
    id: "d-trim",
    name: L("Emballement du trim", "Electric trim runaway"),
    desc: L(
      "Le trim électrique part à piquer : tenir le manche, PA coupé, disjoncteur tiré.",
      "The electric trim runs nose-down: hold the yoke, AP off, pull the breaker.",
    ),
    phase: "cruise",
    wx: "vmc",
    mode: "training",
    failures: [
      {
        key: "trimRunaway",
        trigger: "time",
        at: 2,
        expect: "c172.trimRunaway",
      },
    ],
  },
  {
    id: "d-flaps",
    name: L("Volets bloqués", "Flaps jammed"),
    desc: L(
      "Les volets restent rentrés : approche plus rapide, piste plus longue.",
      "The flaps stay up: a faster approach and a longer landing.",
    ),
    phase: "approach",
    wx: "vmc",
    mode: "training",
    failures: [{ key: "flaps", trigger: "time", at: 1, expect: "c172.flaps" }],
  },
  {
    id: "d-club-test",
    name: L(
      "Test aéroclub : 2 pannes aléatoires",
      "Club test: 2 random failures",
    ),
    desc: L(
      "Deux pannes tirées au sort à des moments imprévus, check-list masquée : notation à la fin.",
      "Two failures drawn at random at unexpected times, checklist hidden: graded at the end.",
    ),
    phase: "cruise",
    wx: "imc",
    mode: "test",
    failures: [
      { key: "alternator", trigger: "random", at: 1, window: 5, pool: [] },
      { key: "vacuum", trigger: "random", at: 8, window: 6, pool: [] },
    ],
  },
];

/** A template as a flight at `airport` (default: the home / first suitable airport of the loaded data).
 *  `group`: the failure group the random failures are drawn from (club test). Null: no airport fits. */
export function buildDrill(
  t: DrillTemplate | string,
  o: {
    airport?: string;
    phase?: DrillPhase;
    mode?: DrillMode;
    wx?: DrillWx;
    lang?: Lang;
    group?: (typeof FAILURE_GROUPS)[number]["id"] | "any";
  } = {},
): Circuit | null {
  const tpl =
    typeof t === "string" ? DRILL_TEMPLATES.find((x) => x.id === t) : t;
  if (!tpl) return null;
  const phase = o.phase ?? tpl.phase;
  const wx = o.wx ?? tpl.wx;
  const pf = phaseFlight(o.airport, phase, wx);
  if (!pf) return null;
  const lang = o.lang ?? cur();
  const mode = o.mode ?? tpl.mode;
  const pool = groupKeys(o.group ?? "any");
  const failures = clone(tpl.failures).map((f) => {
    if (f.pool) {
      f.pool = [...pool];
      f.key = pool[0] ?? f.key;
    }
    // the phase chosen is not the template's: its trigger follows the phase
    if (phase !== tpl.phase && f.trigger !== "random")
      Object.assign(f, { dir: undefined }, defaultTrigger(phase, f.key));
    f.hidden = mode === "test";
    return f;
  });
  // a phase-specific procedure (EFATO) moved to another phase: the procedure of that phase is expected
  const c: Circuit = {
    id: `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
    name: `${tpl.name[lang]} · ${pf.dep}`,
    description: tpl.desc[lang],
    start: pf.start,
    legs: pf.legs,
    weather: drillWeather(wx, pf.approach, tpl.oatC),
    failures,
    allowAp: tpl.allowAp ?? true,
    mode: "training",
    cockpit: tpl.cockpit ?? null,
    world: currentWorld(),
    template: tpl.id,
    dep: pf.dep,
    dest: pf.dest,
    drill: { mode, phase, wx },
  };
  if (phase !== tpl.phase) {
    for (const f of c.failures) refreshExpect(c, f, lang);
    c.name = drillAutoName(c, lang) ?? c.name;
  }
  return c;
}

// ------------------------------------------------------------------ the list the hub shows
export interface DrillEntry {
  kind: "club" | "template";
  id: string;
  name: string;
  desc: string;
  phase?: DrillPhase;
  mode: DrillMode;
  /** failures announced by the entry ('random' for drawn ones) */
  failures: (FailureKey | "random")[];
  assignee?: string;
  /** the saved drill (club), or a fresh build of the template at `airport` */
  build(airport?: string): Circuit | null;
}

/** is this flight a failure drill? */
export const isDrill = (c: Circuit) => !!c.drill;

/** The club's drills (saved flights made as drills, newest first) then the templates, in `lang`. */
export function listDrills(lang: Lang = cur()): DrillEntry[] {
  const club: DrillEntry[] = circuitStore
    .list()
    .filter(isDrill)
    .map((c) => ({
      kind: "club",
      id: c.id,
      name: c.name,
      desc: c.description,
      phase: c.drill!.phase,
      mode: c.drill!.mode,
      failures: c.failures.map((f) => (f.pool?.length ? "random" : f.key)),
      assignee: c.assignee,
      build: () => clone(c),
    }));
  const tpls: DrillEntry[] = DRILL_TEMPLATES.map((t) => ({
    kind: "template",
    id: t.id,
    name: t.name[lang],
    desc: t.desc[lang],
    phase: t.phase,
    mode: t.mode,
    failures: t.failures.map((f) => (f.pool ? "random" : f.key)),
    build: (airport?: string) => buildDrill(t, { airport, lang }),
  }));
  return [...club, ...tpls];
}

/** failure name in a language */
export const failureLabel = (k: FailureKey, lang: Lang = cur()) =>
  lang === "fr" ? FAILURE_LABELS_FR[k] : FAILURE_LABELS_EN[k];

/** approaches of the loaded data at an airport (the quick form says when a phase needs one) */
export const hasApproach = (icao?: string) =>
  !!icao && APPROACHES.some((a) => a.airport === icao);
