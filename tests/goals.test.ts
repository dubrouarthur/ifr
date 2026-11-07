// Ground school package D: the goal catalogue (units, delegation to the procedures CHECKS, nav and hold checks),
// live tracking of "Do this" rows, suggestions, "use what I just did", and stepToExercise in the real LessonRun.
import { describe, expect, it } from "vitest";
import {
  checkNow,
  devText,
  evaluate,
  fakeStageView,
  fitTolerances,
  GOAL_IDS,
  GOALS,
  goalLabel,
  goalParamIssues,
  goalRow,
  goalReadout,
  goalUnitsNote,
  goalViolation,
  GoalTracker,
  holdView,
  rowsFor,
  stageView,
  suggestGoals,
  unitsNote,
  type NavView,
  type StageView,
} from "../src/course/goals";
import {
  drawSurprise,
  flyItPlan,
  optionWind,
  PATH_ALLOWANCE_S,
  stepToExercise,
  yourTurnToExercise,
} from "../src/course/toExercise";
import { CHECKS, checkLabel } from "../src/train/procedureChecks";
import { LessonRun } from "../src/train/engine";
import { Sim } from "../src/sim/sim";
import { findFix } from "../src/nav/data";
import { bearingDeg, destination } from "../src/nav/geo";
import { holdEntry, type HoldDef } from "../src/nav/holding";
import type { HoldEvaluator } from "../src/train/holdEval";
import type {
  CalcProblem,
  Course,
  GoalCheck,
  SimScene,
  Step,
} from "../src/course/types";

const nav = (o: Partial<NavView>): NavView => ({
  valid: true,
  ident: "ARD",
  isLoc: false,
  radial: 276,
  toFrom: "TO",
  dev: 0,
  gsValid: false,
  gsDev: 0,
  dmeNm: 6,
  ...o,
});
const v = (o: Partial<StageView> = {}) => fakeStageView({ cdi: "NAV1", ...o });
const ARD = findFix("ARD")!;

describe("units: dots AND degrees / NM for the active source (SPEC §9.5)", () => {
  it("writes deviations the way the mockup does", () => {
    expect(devText(1, "VOR", { cockpit: "steam" })).toBe("1.0 dot R (2°)");
    expect(devText(-1.5, "VOR", { cockpit: "g1000" })).toBe(
      "1.5 dots L (7.5°)",
    );
    expect(devText(1, "VOR", { cockpit: "g1000" })).toBe("1.0 dot R (5°)");
    expect(devText(-0.4, "GS", { cockpit: "g1000" })).toBe(
      "0.4 dot high (0.14°)",
    );
    expect(devText(0.6, "GPS", { cockpit: "g1000", gpsFullScaleNm: 0.3 })).toBe(
      "0.6 dot R (0.09 NM)",
    );
    expect(devText(0.01, "LOC")).toBe("centred");
    expect(devText(1, "VOR", { cockpit: "steam", lang: "fr" })).toBe(
      "1,0 point D (2°)",
    );
  });
  it("explains the checkride limit and a tighter practice goal", () => {
    expect(unitsNote("VOR", "steam", "en", 1)).toBe(
      "On a VOR, 1 dot = 2°. The checkride limit is ¾ scale (7.5°, about 4 dots). This step asks for 1 dot so you learn to keep it tight.",
    );
    expect(unitsNote("VOR", "g1000", "en")).toBe(
      "On a VOR, 1 dot = 5°. The checkride limit is ¾ scale (7.5°, 1.5 dots).",
    );
    expect(unitsNote("LOC", "g1000", "fr")).toContain(
      "Sur un localizer, 1 point = 1,25°",
    );
    expect(
      goalUnitsNote(
        { id: "acsScale", p: { axis: "lat", frac: 0.75 } },
        "g1000",
      ),
    ).toContain("¾ scale");
    expect(
      goalUnitsNote({ id: "heading", p: { value: 90, tol: 10 } }, "g1000"),
    ).toBeNull();
  });
});

describe("catalogue", () => {
  it("covers every GoalCheck id with FR/EN texts that never throw", () => {
    const ids: GoalCheck["id"][] = [
      "obs",
      "toFrom",
      "cdiDefl",
      "gsDefl",
      "acsScale",
      "onRadial",
      "dme",
      "holdEntry",
      "holdLaps",
      "passedFix",
      "distTo",
      "tap",
      "choice",
      "track",
      "vsBand",
      "ias",
      "altBand",
      "heading",
      "switch",
    ];
    for (const id of ids) expect(GOAL_IDS).toContain(id);
    for (const id of GOAL_IDS) {
      const d = GOALS[id];
      expect(d.name.en && d.name.fr, id).toBeTruthy();
      const p: Record<string, unknown> = {};
      for (const prm of d.params) p[prm.name] = prm.default;
      if (id === "onRadial") p.navaid = "ARD";
      if (id === "passedFix") p.ident = "ARD";
      if (id === "distTo") p.fix = "ARD";
      const check = { id, p } as GoalCheck;
      for (const lang of ["en", "fr"] as const) {
        expect(goalLabel(check, lang), id).toBeTruthy();
        expect(goalRow(check, lang), id).toBeTruthy();
        expect(() => goalReadout(check, v(), lang)).not.toThrow();
        expect(() => goalViolation(check, v(), lang)).not.toThrow();
      }
    }
  });
  it("delegates CheckRef ids to the procedures-mode CHECKS", () => {
    const c = { id: "ias" as const, p: { min: 63, max: 73, holdS: 0 } };
    expect(goalLabel(c, "fr")).toBe(checkLabel(c, "fr"));
    for (const ias of [60, 68, 80])
      expect(evaluate(c, v({ iasKt: ias }))).toBe(
        CHECKS.ias.evaluate(v({ iasKt: ias }), c.p, {
          failedAtS: 0,
          elapsedS: 0,
        }),
      );
    expect(goalViolation(c, v({ iasKt: 82 }))).toBe(
      "82 kt — Airspeed 68 kt (63–73)",
    );
    expect(
      goalReadout(
        { id: "heading", p: { value: 120, tol: 5 } },
        v({ hdgDeg: 119.6 }),
      ),
    ).toBe("HDG 120");
  });
  it("checks parameters, nav data included", () => {
    expect(goalParamIssues({ id: "cdiDefl", p: { maxDots: 1 } })).toEqual([]);
    expect(
      goalParamIssues({
        id: "onRadial",
        p: { navaid: "NOPE", radial: 90, tol: 5 },
      }).join(),
    ).toMatch(/not found/);
    expect(goalParamIssues({ id: "distTo", p: { fix: "ARD" } }).join()).toMatch(
      /maximum or a minimum/,
    );
    expect(
      goalParamIssues({ id: "vsBand", p: { min: -200, max: -800 } }).join(),
    ).toMatch(/minimum is above/);
    expect(
      goalParamIssues({ id: "ias", p: { min: 90, max: 70 } }).join(),
    ).toMatch(/minimum is above/);
    expect(goalParamIssues({ id: "bogus" } as unknown as GoalCheck)).toEqual([
      "Unknown check 'bogus'",
    ]);
    expect(
      goalParamIssues({
        id: "holdEntry",
        p: { expected: "sideways" as "direct" },
      }).join(),
    ).toMatch(/not an option/);
  });
});

describe("nav checks", () => {
  it("reads the CDI in the cockpit's dots", () => {
    const c: GoalCheck = { id: "cdiDefl", p: { maxDots: 1 } };
    // dev 0.18 of full scale = 0.9 dot on the steam CDI (5 dots), 0.36 dot on the G1000 (2 dots)
    expect(evaluate(c, v({ cockpit: "steam", nav1: nav({ dev: 0.18 }) }))).toBe(
      true,
    );
    expect(evaluate(c, v({ cockpit: "steam", nav1: nav({ dev: 0.22 }) }))).toBe(
      false,
    );
    expect(evaluate(c, v({ cockpit: "g1000", nav1: nav({ dev: 0.45 }) }))).toBe(
      true,
    );
    expect(
      goalReadout(c, v({ cockpit: "steam", nav1: nav({ dev: 0.2 }) })),
    ).toBe("1.0 dot R");
    expect(
      goalViolation(c, v({ cockpit: "steam", nav1: nav({ dev: -0.3 }) })),
    ).toBe("CDI 1.5 dots L (3°), limit 1 dot");
    expect(evaluate(c, v({ nav1: nav({ valid: false }) }))).toBe(false);
  });
  it("grades ACS ¾ scale on any cockpit, lateral and vertical, GPS included", () => {
    const lat: GoalCheck = { id: "acsScale", p: { axis: "lat", frac: 0.75 } };
    const vert: GoalCheck = { id: "acsScale", p: { axis: "vert", frac: 0.75 } };
    expect(evaluate(lat, v({ nav1: nav({ isLoc: true, dev: 0.7 }) }))).toBe(
      true,
    );
    expect(evaluate(lat, v({ nav1: nav({ isLoc: true, dev: -0.8 }) }))).toBe(
      false,
    );
    expect(
      evaluate(
        vert,
        v({ nav1: nav({ isLoc: true, gsValid: true, gsDev: 0.5 }) }),
      ),
    ).toBe(true);
    expect(
      evaluate(vert, v({ nav1: nav({ isLoc: true, gsValid: false }) })),
    ).toBe(false);
    const gps = v({
      cdi: "GPS",
      gps: {
        valid: true,
        dev: 0.9,
        fullScaleNm: 0.3,
        toIdent: "RW27",
        gpValid: true,
        gpDev: 0.1,
      },
    });
    expect(evaluate(lat, gps)).toBe(false);
    expect(evaluate(vert, gps)).toBe(true);
    expect(goalViolation(lat, gps)).toBe(
      "CDI 1.8 dots R (0.27 NM), beyond ¾ scale (1.5 dots)",
    );
  });
  it("OBS, flag, radial, DME, track and VS band", () => {
    const pos = destination(ARD, 276, 6);
    const here = v({
      ...pos,
      obs1: 96,
      nav1: nav({ toFrom: "TO", dmeNm: 6.1 }),
      trkDeg: 93,
      vsFpm: -520,
    });
    expect(
      evaluate({ id: "obs", p: { nav: 1, value: 96, tol: 2 } }, here),
    ).toBe(true);
    expect(
      evaluate({ id: "obs", p: { nav: 1, value: 90, tol: 2 } }, here),
    ).toBe(false);
    expect(evaluate({ id: "toFrom", p: { value: "TO" } }, here)).toBe(true);
    expect(evaluate({ id: "toFrom", p: { value: "FROM" } }, here)).toBe(false);
    expect(
      evaluate(
        { id: "onRadial", p: { navaid: "ARD", radial: 276, tol: 2 } },
        here,
      ),
    ).toBe(true);
    expect(
      evaluate(
        { id: "onRadial", p: { navaid: "ARD", radial: 270, tol: 3 } },
        here,
      ),
    ).toBe(false);
    expect(
      goalReadout(
        { id: "onRadial", p: { navaid: "ARD", radial: 270, tol: 3 } },
        here,
      ),
    ).toBe("R-276");
    expect(evaluate({ id: "dme", p: { min: 5.5, max: 6.5 } }, here)).toBe(true);
    expect(evaluate({ id: "track", p: { value: 90, tol: 5 } }, here)).toBe(
      true,
    );
    expect(evaluate({ id: "track", p: { value: 100, tol: 5 } }, here)).toBe(
      false,
    );
    expect(evaluate({ id: "vsBand", p: { min: -600, max: -400 } }, here)).toBe(
      true,
    );
    expect(
      goalReadout({ id: "vsBand", p: { min: -600, max: -400 } }, here),
    ).toBe("−520 ft/min");
    expect(goalRow({ id: "vsBand", p: { min: -600, max: -400 } }, "en")).toBe(
      "Descend at 500 ft/min (400–600)",
    );
    expect(evaluate({ id: "distTo", p: { fix: "ARD", maxNm: 7 } }, here)).toBe(
      true,
    );
    expect(evaluate({ id: "distTo", p: { fix: "ARD", maxNm: 2 } }, here)).toBe(
      false,
    );
  });
  it("remembers a fix once passed", () => {
    const c: GoalCheck = { id: "passedFix", p: { ident: "ARD" } };
    const mem = {};
    expect(evaluate(c, v(destination(ARD, 270, 3)), mem)).toBe(false);
    expect(evaluate(c, v(destination(ARD, 270, 1)), mem)).toBe(false);
    // the bearing to the fix swings past abeam within 2 NM: passed, even without flying exactly overhead
    expect(evaluate(c, v(destination(ARD, 95, 0.9)), mem)).toBe(true);
    expect(evaluate(c, v(destination(ARD, 90, 5)), mem)).toBe(true);
  });
  it("taps and choices", () => {
    expect(
      evaluate(
        { id: "tap", p: { annotation: "hsi" } },
        v({ taps: ["ai", "hsi"] }),
      ),
    ).toBe(true);
    expect(evaluate({ id: "choice", p: { index: 2 } }, v({ choice: 2 }))).toBe(
      true,
    );
    expect(
      evaluate({ id: "choice", p: { index: 2 } }, v({ choice: null })),
    ).toBe(false);
  });
});

describe("hold checks use holdEntry (AIM FIG 5-3-8), never a local table", () => {
  const def: HoldDef = {
    fix: { ident: "ARD", lat: ARD.lat, lon: ARD.lon },
    inbound: 270,
    turn: "R",
    legMin: 1,
    altFt: 4000,
  };
  it("predicts the entry from the course to the fix", () => {
    for (const from of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const pos = destination(ARD, from, 8);
      const h = holdView(def, pos, null);
      expect(h.predicted).toBe(
        holdEntry(270, "R", bearingDeg(pos, ARD)).toLowerCase(),
      );
    }
  });
  it("grades the flown entry, the neighbour within 5° being acceptable, and laps with leg timing", () => {
    const ev = {
      def,
      crossedAt: 12,
      correctEntry: "TEARDROP",
      okEntries: ["TEARDROP"],
      flownEntry: "TEARDROP",
      laps: 2,
      inboundTimes: [64, 58],
    } as unknown as HoldEvaluator;
    const h = holdView(def, ARD, ev);
    const at = v({ hold: h });
    expect(evaluate({ id: "holdEntry", p: { expected: "teardrop" } }, at)).toBe(
      true,
    );
    expect(evaluate({ id: "holdEntry", p: { expected: "parallel" } }, at)).toBe(
      false,
    );
    expect(
      goalViolation({ id: "holdEntry", p: { expected: "parallel" } }, at),
    ).toBe("Flew a teardrop entry, parallel expected (AIM 5-3-8)");
    const near = holdView(def, ARD, {
      ...ev,
      okEntries: ["TEARDROP", "PARALLEL"],
    } as unknown as HoldEvaluator);
    expect(
      evaluate(
        { id: "holdEntry", p: { expected: "parallel" } },
        v({ hold: near }),
      ),
    ).toBe(true);
    expect(evaluate({ id: "holdLaps", p: { laps: 2, legS: 60 } }, at)).toBe(
      true,
    );
    expect(evaluate({ id: "holdLaps", p: { laps: 3 } }, at)).toBe(false);
    expect(goalReadout({ id: "holdLaps", p: { laps: 2, legS: 60 } }, at)).toBe(
      "Lap 2/2 · 0:58",
    );
    const late = v({ hold: { ...h, inboundS: [80] } });
    expect(evaluate({ id: "holdLaps", p: { laps: 2, legS: 60 } }, late)).toBe(
      false,
    );
    expect(
      goalViolation({ id: "holdLaps", p: { laps: 2, legS: 60 } }, late),
    ).toBe("Inbound leg 1:20 (1:00 ±15 s)");
  });
});

describe("GoalTracker: Do-this rows", () => {
  it("ticks rows (sticky), then holds what the student has for holdS", () => {
    // the player mockup: OBS 090 TO, heading 120 for the intercept, roll out with the bar within 1 dot, hold 10 s
    const goal = {
      all: [
        { id: "obs", p: { nav: 1, value: 90, tol: 2 } },
        { id: "toFrom", p: { value: "TO" } },
        { id: "heading", p: { value: 120, tol: 5 } },
        { id: "cdiDefl", p: { maxDots: 1 } },
      ] as GoalCheck[],
      holdS: 10,
      graded: false,
    };
    const t = new GoalTracker(goal, "en");
    expect(rowsFor(goal).map((r) => r.text)).toEqual([
      "Set the OBS to 090",
      "Get a TO flag",
      "Hold heading 120° (±5°)",
      "Keep the bar within 1 dot",
      "Hold it for 10 s",
    ]);
    const intercept = v({
      cockpit: "steam",
      obs1: 90,
      hdgDeg: 120,
      nav1: nav({ dev: 0.6 }),
    });
    let s = t.update(intercept, 0.5);
    expect(s.rows.map((r) => r.ticked)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(s.rows[3].current).toBe(true);
    const tracking = v({
      cockpit: "steam",
      obs1: 90,
      hdgDeg: 92,
      nav1: nav({ dev: 0.12 }),
    });
    for (let i = 0; i < 9; i++) s = t.update(tracking, 1);
    expect(s.met).toBe(false);
    expect(s.rows[2].ticked).toBe(true); // the intercept heading stays ticked: it is not part of the hold
    expect(s.rows[4].readout).toBe("8 / 10 s");
    // a break restarts the hold
    s = t.update(v({ ...tracking, nav1: nav({ dev: 0.4 }) }), 1);
    expect(s.heldS).toBe(0);
    for (let i = 0; i < 10; i++) s = t.update(tracking, 1);
    expect(s.met).toBe(true);
    expect(s.rows.every((r) => r.ticked)).toBe(true);
  });
  it("respects a check's own hold time (CHECKS holdS)", () => {
    const t = new GoalTracker({
      all: [{ id: "ias", p: { min: 90, max: 100, holdS: 3 } }],
      graded: true,
    });
    expect(t.update(v({ iasKt: 95 }), 1).met).toBe(false);
    expect(t.update(v({ iasKt: 95 }), 1).met).toBe(false);
    expect(t.update(v({ iasKt: 95 }), 1).met).toBe(true);
  });
  it("answers by flying on demand (no hold)", () => {
    const r = checkNow(
      [
        { id: "obs", p: { nav: 1, value: 90, tol: 2 } },
        { id: "toFrom", p: { value: "FROM" } },
      ],
      v({ obs1: 90, nav1: nav({ toFrom: "TO" }) }),
    );
    expect(r.met).toBe(false);
    expect(r.results[0].met).toBe(true);
    expect(r.results[1].violation).toBe("TO flag, FROM expected");
  });
});

describe("suggestions and 'Use what I just did'", () => {
  it("suggests from the scene (SPEC §5)", () => {
    const loc = suggestGoals(
      v({
        nav1: nav({ isLoc: true, gsValid: true, dev: 0.1, gsDev: 0.1 }),
        iasKt: 91,
      }),
    );
    expect(loc.map((s) => s.check)).toEqual([
      { id: "acsScale", p: { axis: "lat", frac: 0.75 } },
      { id: "acsScale", p: { axis: "vert", frac: 0.75 } },
      { id: "ias", p: { min: 80, max: 100, holdS: 0 } },
    ]);
    const def: HoldDef = {
      fix: { ident: "ARD", lat: ARD.lat, lon: ARD.lon },
      inbound: 270,
      turn: "R",
      legMin: 1,
      altFt: 4000,
    };
    const pos = destination(ARD, 0, 6);
    const hold = suggestGoals(
      v({ ...pos, altFt: 4020, hold: holdView(def, pos, null) }),
    );
    expect(hold.map((s) => s.check.id)).toEqual([
      "holdEntry",
      "holdLaps",
      "altBand",
    ]);
    expect(hold[0].check).toEqual({
      id: "holdEntry",
      p: { expected: holdEntry(270, "R", bearingDeg(pos, ARD)).toLowerCase() },
    });
    const cruise = suggestGoals(
      v({ nav1: nav({ valid: false }), altFt: 4530, hdgDeg: 272 }),
    );
    expect(cruise.map((s) => s.check)).toEqual([
      { id: "altBand", p: { min: 4400, max: 4600 } },
      { id: "heading", p: { value: 270, tol: 10 } },
    ]);
    const desc = suggestGoals(v({ nav1: nav({ valid: false }), vsFpm: -640 }));
    expect(desc[0].check).toEqual({
      id: "vsBand",
      p: { min: -800, max: -500 },
    });
  });
  it("fits tolerances from the author's preview run", () => {
    const run = [0, 0.3, -0.6, 0.2].map((d, i) =>
      v({
        nav1: nav({ dev: d / 2 }),
        altFt: 4000 + [20, -70, 40, 10][i],
        hdgDeg: 90 + [3, -7, 2, 0][i],
      }),
    );
    const out = fitTolerances(
      [
        { id: "cdiDefl", p: { maxDots: 2 } },
        { id: "altBand", p: { min: 3800, max: 4200 } },
        { id: "heading", p: { value: 90, tol: 20 } },
        { id: "obs", p: { nav: 1, value: 90, tol: 2 } },
        { id: "acsScale", p: { axis: "lat", frac: 0.75 } },
      ],
      run,
    );
    expect(out[0].check).toEqual({ id: "cdiDefl", p: { maxDots: 1 } });
    expect(out[0].observed).toBe("max 0.6 dot");
    expect(out[1].check).toEqual({
      id: "altBand",
      p: { min: 3900, max: 4100 },
    });
    expect(out[2].check).toEqual({ id: "heading", p: { value: 90, tol: 10 } });
    expect(out[3].changed).toBe(false);
    // never looser than the ACS ¾ scale
    expect(
      (out[4].check as { p: { frac: number } }).p.frac,
    ).toBeLessThanOrEqual(0.75);
  });
});

// ------------------------------------------------------------------ stepToExercise in the real engine
const scene: SimScene = {
  v: 1,
  id: "r276",
  world: { kind: "training" },
  cockpit: "g1000",
  pose: {
    kind: "fields",
    pos: { fix: "ARD", radial: 276, distNm: 6 },
    altFt: 4000,
    hdg: 96,
    iasKt: 100,
    radios: { nav1: "ARD", obs1: 96, cdi: "NAV1" },
  },
  weather: {
    windKt: 0,
    gustKt: 0,
    turbulence: 0,
    ceilingFt: 20000,
    visibilitySm: 10,
  },
  seed: 4183,
};
function course(step: Step, extra: Partial<Course> = {}): Course {
  return {
    format: "ifr-course",
    version: 1,
    id: "vor",
    rev: 3,
    updated: "2026-11-01T10:00:00.000Z",
    title: { en: "VOR tracking", fr: "Suivi VOR" },
    author: { name: "J. Martin" },
    langs: ["en", "fr"],
    cockpit: "g1000",
    world: { kind: "training" },
    steps: [step],
    scenes: { r276: scene },
    clips: {},
    assets: {},
    ...extra,
  };
}
const flyStep = (
  criteria: Step["flyIt"] extends infer F
    ? F extends { criteria: infer C }
      ? C
      : never
    : never,
  more: Partial<NonNullable<Step["flyIt"]>> = {},
): Step => ({
  id: "fly1",
  kind: "fly",
  title: { en: "Track R-276 inbound", fr: "Suivre le R-276 en rapprochement" },
  reader: [],
  flyIt: {
    target: { kind: "scene", scene: "r276", durationS: 20 },
    brief: { en: "Track inbound to ARD." },
    options: ["wind", "surpriseMe", "allowAp"],
    criteria,
    returnTo: "thisStep",
    ...more,
  },
});
function fly(ex: ReturnType<typeof stepToExercise>, seconds: number) {
  const sim = new Sim();
  const run = new LessonRun(ex, sim);
  for (let t = 0; t < seconds && !run.finished; t += 0.1) {
    sim.step(0.1);
    run.update(0.1);
  }
  return { sim, run };
}

describe("stepToExercise (SPEC §9.4)", () => {
  it("poses the scene, grades path criteria all along and reports each criterion", () => {
    const st = flyStep(
      [
        {
          id: "alt",
          label: { en: "Altitude ±500 ft" },
          check: { id: "altBand", p: { min: 3500, max: 4500 } },
          acs: "IR.III.B",
        },
        {
          id: "radial",
          label: { en: "On R-276" },
          check: { id: "onRadial", p: { navaid: "ARD", radial: 276, tol: 5 } },
          acs: "IR.V.A",
        },
        {
          id: "tight",
          label: { en: "Altitude ±5 ft" },
          check: { id: "altBand", p: { min: 3995, max: 4005 } },
        },
        {
          id: "fix",
          label: { en: "Cross ARD" },
          check: { id: "passedFix", p: { ident: "ARD" } },
        },
      ],
      { target: { kind: "scene", scene: "r276", durationS: 20 } },
    );
    const ex = stepToExercise(st, course(st));
    expect(ex.id).toBe("course:vor:fly1");
    expect(ex.standards[0]).toBe("Altitude 3500–4500 ft (IR.III.B)");
    expect(ex.course).toEqual({ id: "vor", rev: 3, stepId: "fly1" });
    expect(ex.allowAp).toBe(false); // offered, not on by default
    const sim = new Sim();
    const rt = ex.setup(sim);
    // one step per milestone (cross ARD), then the 20 s ending step
    expect(rt.steps.length).toBe(2);
    expect(bearingDeg(ARD, sim.ac.s)).toBeCloseTo(276, 0);
    expect(sim.av.obs1).toBe(96);
    expect(sim.nav1.valid).toBe(true);
    expect(sim.seedValue).toBe(4183);
    const { run } = fly(stepToExercise(st, course(st)), 60);
    expect(run.finished).not.toBeNull();
  });
  it("criteria(): met / missed with the worst value and the time", () => {
    const st = flyStep([
      {
        id: "alt",
        label: { en: "Altitude ±500 ft" },
        check: { id: "altBand", p: { min: 3500, max: 4500 } },
      },
      {
        id: "tight",
        label: { en: "VS ±1 fpm" },
        check: { id: "vsBand", p: { min: -1, max: 1 } },
      },
      {
        id: "fix",
        label: { en: "Cross ARD" },
        check: { id: "passedFix", p: { ident: "ARD" } },
      },
    ]);
    const ex = stepToExercise(st, course(st));
    const { run } = fly(ex, 25);
    expect(run.finished).not.toBeNull();
    const c = ex.criteria();
    expect(c.find((x) => x.id === "alt")!.met).toBe(true);
    const vs = c.find((x) => x.id === "tight")!;
    expect(vs.kind).toBe("path");
    expect(vs.met).toBe(false);
    expect(vs.violationS).toBeGreaterThan(PATH_ALLOWANCE_S);
    expect(vs.worst).toMatch(/^Vertical speed .* ft\/min \(−1 … \+1\)$/);
    const fx = c.find((x) => x.id === "fix")!;
    expect(fx.kind).toBe("milestone");
    expect(fx.met).toBe(false); // 6 NM away: not reached in 25 s
  });
  it("instructor options: wind on a calm scene, surprise failure drawn from the seed", () => {
    expect(
      drawSurprise(["vacuum", "alternator", "pitotIcing"], 4183, 120),
    ).toEqual(drawSurprise(["vacuum", "alternator", "pitotIcing"], 4183, 120));
    const st = flyStep(
      [
        {
          id: "alt",
          label: { en: "Alt" },
          check: { id: "altBand", p: { min: 3000, max: 5000 } },
        },
      ],
      {
        target: { kind: "scene", scene: "r276", durationS: 60 },
        surprisePool: ["vacuum"],
      },
    );
    const ex = stepToExercise(st, course(st), {
      options: ["wind", "surpriseMe"],
    });
    const sim = new Sim();
    const run = new LessonRun(ex, sim);
    expect(sim.weather.windKt).toBe(optionWind(4183).windKt);
    const s = ex.surprise()!;
    expect(s.key).toBe("vacuum");
    expect(s.atS).toBeGreaterThanOrEqual(12);
    for (let t = 0; t < s.atS + 1; t += 0.1) {
      sim.step(0.1);
      run.update(0.1);
    }
    expect(sim.failures.vacuum).toBe(true);
    expect(ex.surprise()!.fired).toBe(true);
    // offered but off: calm
    const calm = stepToExercise(st, course(st), { options: [] });
    const s2 = new Sim();
    calm.setup(s2);
    expect(s2.weather.windKt).toBe(0);
  });
  it("a hold criterion evaluates the hold from the step's diagram", () => {
    const st = flyStep([
      {
        id: "entry",
        label: { en: "Entry" },
        check: { id: "holdEntry", p: { expected: "direct" } },
      },
    ]);
    st.stage = {
      panes: [
        {
          kind: "diagram",
          d: { kind: "hold", inbound: 96, turn: "R", fix: "ARD" },
        },
      ],
      mode: "fly",
      scene: "r276",
    };
    const rt = stepToExercise(st, course(st)).setup(new Sim());
    expect(rt.hold?.fix.ident).toBe("ARD");
    expect(rt.hold?.inbound).toBe(96);
  });
  it("a calc target flies the problem's stage hint with its goals", () => {
    const st: Step = {
      id: "flytod",
      kind: "fly",
      title: { en: "Fly the descent you computed" },
      reader: [],
      flyIt: {
        target: { kind: "calc", step: "tod", durationS: 30 },
        options: [],
        criteria: [],
        returnTo: "thisStep",
      },
    };
    const problem = {
      generatorId: "ifr.descentRate",
      seed: 7,
      params: {},
      stage: {
        panes: [{ kind: "pfd" }],
        pose: scene.pose,
        goals: [{ id: "vsBand", p: { min: -650, max: -350 } }],
      },
    } as unknown as CalcProblem;
    const ex = stepToExercise(st, course(st), { calcProblem: problem });
    expect(ex.objectives).toEqual(["VS −650 … −350 ft/min"]);
    const sim = new Sim();
    ex.setup(sim);
    expect(sim.seedValue).toBe(7);
    expect(() => stepToExercise(st, course(st))).toThrow(/no scene/);
  });
  it("a sim YourTurn compiles from its goal", () => {
    const st: Step = {
      id: "s1",
      kind: "slide",
      title: { en: "Your turn" },
      reader: [],
    };
    const ex = yourTurnToExercise(
      st,
      {
        where: "sim",
        prompt: { en: "Hold 4000 ft" },
        goal: {
          all: [{ id: "altBand", p: { min: 3900, max: 4100 } }],
          graded: false,
        },
        durationS: 30,
      },
      "r276",
      course(st),
    );
    expect(ex.objectives).toEqual(["Altitude 3900–4100 ft"]);
    expect(ex.setup(new Sim()).steps.length).toBe(1);
  });
  it("flyItPlan routes the other targets", () => {
    const base = flyStep([]);
    const plan = (t: NonNullable<Step["flyIt"]>["target"]) =>
      flyItPlan(
        { ...base, flyIt: { ...base.flyIt!, target: t } },
        course(base),
      );
    expect(plan({ kind: "lesson", exerciseId: "hold-ndb" })).toEqual({
      kind: "lesson",
      exerciseId: "hold-ndb",
      pathId: undefined,
    });
    expect(plan({ kind: "procedure", procId: "c172.engineFire" })).toEqual({
      kind: "procedure",
      procId: "c172.engineFire",
    });
    expect(plan({ kind: "scenario", scenarioId: "ils27", wx: "ifr" })).toEqual({
      kind: "scenario",
      scenarioId: "ils27",
      wx: "ifr",
    });
    expect(plan({ kind: "scene", scene: "r276" }).kind).toBe("exercise");
  });
});

describe("stageView from a real Sim", () => {
  it("agrees with the recorder's dots and the receiver", () => {
    const st = flyStep([]);
    const sim = new Sim();
    stepToExercise(st, course(st)).setup(sim);
    const view = stageView(sim, { cockpit: "g1000" });
    expect(view.nav1.valid).toBe(true);
    expect(view.nav1.ident).toBe("ARD");
    expect(view.nav1.toFrom).toBe("TO");
    expect(Math.abs(view.nav1.radial - 276)).toBeLessThan(1);
    const dots = sim.rec.latDots(sim)!;
    expect(goalReadout({ id: "cdiDefl", p: { maxDots: 1 } }, view)).toBe(
      devText(dots, "VOR", { cockpit: "g1000", short: true }),
    );
    expect(
      evaluate({ id: "obs", p: { nav: 1, value: 96, tol: 1 } }, view),
    ).toBe(true);
  });
});
