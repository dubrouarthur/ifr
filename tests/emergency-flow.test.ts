// Emergency flow and grading timelines: AVIATE → RECOGNISE → MEMORY FLOW → CHECKLIST → COMMUNICATE / DECIDE
// (FAA-H-8083-3C AFH ch.18; FAA-S-ACS-6C / ACS-8C emergency operations). Scripted ProcSimView timelines drive the
// real ProcedureRunner and the real library, as the audit's grading harness did: each case is a pilot behaviour and
// the score an examiner would give it.
import { beforeAll, describe, expect, it } from "vitest";
import {
  DrillSession,
  FOLLOW_LOST_S,
  FOLLOW_RESTART_S,
  ProcedureRunner,
  fakeView,
  procedureForCockpit,
  simView,
  type ProcSimView,
} from "../src/train/procedures";
import { libraryProcedure } from "../src/train/procedureLibrary";
import {
  SMOKE_CUE,
  cuePerceived,
  recognitionTargetS,
} from "../src/train/procedureFlow";
import { defaultSwitches, type SystemsReadout } from "../src/sim/systemsTypes";
import { Sim, SCENARIOS } from "../src/sim/sim";
import { buildDrill } from "../src/train/drills";
import { circuitToExercise, testFlightTitle } from "../src/train/circuits";
import type { DrillMode, Procedure } from "../src/train/procedureTypes";

const mem = new Map<string, string>();
beforeAll(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } as Storage;
});

const lib = (id: string, cockpit: "g1000" | "steam" = "g1000") =>
  procedureForCockpit(libraryProcedure(id)!, cockpit);

/** a real systems readout (cruise, everything normal) to script symptoms on */
function baseSys(): SystemsReadout {
  const sim = new Sim(SCENARIOS[1]);
  for (let i = 0; i < 10; i++) sim.step(0.1);
  return JSON.parse(JSON.stringify(simView(sim).sys)) as SystemsReadout;
}

type Script = (t: number, cur: ProcSimView) => Partial<ProcSimView> | void;
/** drive a runner at 10 Hz along a script (t in s after the failure) */
function fly(
  p: Procedure,
  failure: Parameters<typeof cuePerceived>[0],
  mode: DrillMode,
  to: number,
  script: Script,
  start: Partial<ProcSimView> = {},
  onTick?: (r: ProcedureRunner, t: number) => void,
) {
  const r = new ProcedureRunner(p, mode, failure, 0);
  let cur = fakeView({ ...start, t: 0 });
  for (let k = 0; k <= Math.round(to * 10); k++) {
    const t = k / 10;
    cur = { ...cur, ...(script(t, cur) ?? {}), t };
    r.update(cur);
    onTick?.(r, t);
  }
  return r;
}
const sw = (cur: ProcSimView, s: Partial<ProcSimView["sw"]>) => ({
  sw: { ...cur.sw, ...s },
});

describe("recognise: every clock starts at the first cue, not at the fault injection", () => {
  // the smoke builds up for a few seconds before it can be seen (systems.ts heat → smoke): the haze is the cue
  const smoke = (t: number) => (t < 4 ? 0 : Math.min(0.6, (t - 4) * 0.05));
  const sys0 = baseSys();
  const withSmoke = (t: number): Partial<ProcSimView> => ({
    sys: { ...sys0, smokeLevel: smoke(t) },
  });

  it("electrical fire: no symptom, no clock; Master OFF 18 s after the haze shows is in time (limit 20 s from the cue)", () => {
    let before: ReturnType<ProcedureRunner["state"]> | null = null;
    const r = fly(
      lib("c172.electricalFire.en"),
      "electricalFire",
      "test",
      40,
      (t, c) => ({
        ...withSmoke(t),
        ...(t >= 10 ? sw(c, { stbyBatt: false }) : {}),
        ...(t >= 24
          ? sw(c, { stbyBatt: false, batMaster: false, altMaster: false })
          : {}),
        ...(t >= 26
          ? sw(c, { cabinHeat: false, avionics: false, avionics2: false })
          : {}),
      }),
      { sys: sys0 },
      (run, t) => {
        if (Math.abs(t - 3) < 1e-6) before = run.state();
      },
    );
    // before the haze: the card is not open (cueS null) and nothing counts down
    expect(before!.cueS).toBeNull();
    expect(before!.items.every((i) => i.due === null)).toBe(true);
    const res = r.result();
    const cue = 4 + SMOKE_CUE / 0.05;
    expect(res.cueS).toBeCloseTo(cue, 0);
    const master = res.items.find((x) => x.id === "master")!;
    expect(master.done).toBe(true);
    expect(master.late).toBe(false);
    // recognition: from the cue to the first switch of the procedure (STBY BATT at 10 s)
    expect(res.recognitionS).toBeCloseTo(10 - cue, 0);
    expect(res.recognitionTargetS).toBe(5);
    expect(res.phases!.recognise.ok).toBe(true);
    expect(res.timeline!.map((e) => e.kind).slice(0, 3)).toEqual([
      "failure",
      "cue",
      "action",
    ]);
  });

  it("the same Master OFF graded from the injection would be late: from the cue it is 24 − 6 = 18 s", () => {
    // the limit reference is the cue: an item done 24 s after the failure but 18 s after the cue is in time,
    // 27 s after the cue is late
    const r = fly(
      lib("c172.electricalFire.en", "steam"),
      "electricalFire",
      "test",
      45,
      (t, c) => ({
        ...withSmoke(t),
        ...(t >= 33 ? sw(c, { batMaster: false, altMaster: false }) : {}),
      }),
      { sys: sys0 },
    );
    const master = r.result().items.find((x) => x.id === "master")!;
    expect(master.late).toBe(true);
    expect(master.lateByS).toBeCloseTo(33 - 6 - 20, 0);
  });

  it("a blocked static port in level flight shows nothing: no cue, no clock — the climb that freezes the altimeter is the cue", () => {
    const sys = baseSys();
    const r = fly(
      lib("c172.static.en"),
      "staticBlocked",
      "test",
      120,
      (t) => {
        const alt = t < 90 ? 4500 : 4500 + (t - 90) * 10; // climb at 600 fpm from 90 s
        return {
          altFt: alt,
          vsFpm: t < 90 ? 0 : 600,
          sys: {
            ...sys,
            indicated: { ...sys.indicated, altFt: 4500, vsFpm: 0 },
          },
        };
      },
      { sys },
    );
    const res = r.result();
    // ±300 fpm of real vertical speed against a VSI at 0 is perceptible at once
    expect(res.cueS).toBeCloseTo(90, 0);
    expect(r.state().items.find((i) => i.id === "alt")!.due).not.toBeNull();
  });

  it("the targets are per procedure: an engine failure is timed, lost comms and a door are not", () => {
    expect(recognitionTargetS(lib("c172.efato.en"))).toBe(3);
    expect(recognitionTargetS(lib("c172.engineFailure.en"))).toBe(5);
    expect(recognitionTargetS(lib("c172.alternator.en"))).toBe(15);
    expect(recognitionTargetS(lib("c172.lostComms.en"))).toBeNull();
  });
});

describe("recognise: a reaction is the pilot's, never the simulator's or any normal input", () => {
  it("engine failure with nobody flying: the simulator leaves the throttle alone, no reaction is credited", () => {
    const sim = new Sim(SCENARIOS[1]);
    for (let i = 0; i < 20; i++) sim.step(0.1);
    const thr = sim.controls.throttle;
    sim.setFailure("engine", true);
    const r = new ProcedureRunner(
      lib("c172.engineFailure.en"),
      "test",
      "engine",
      sim.time,
    );
    for (let i = 0; i < 200; i++) {
      sim.step(0.1);
      r.update(simView(sim));
    }
    expect(sim.controls.throttle).toBe(thr);
    expect(sim.ac.s.rpm ?? 0).toBeLessThan(1500);
    const res = r.result();
    expect(res.cueS).not.toBeNull();
    expect(res.reactionS).toBeNull();
    expect(res.breakdown?.reaction).toBe(0);
    expect(res.notes.some((n) => /Reaction time|First action/.test(n))).toBe(
      false,
    );
  });

  it("alternator: levelling the wings or a pitch correction is flying, not the answer to LOW VOLTS", () => {
    const r = fly(
      lib("c172.alternator.en"),
      "alternator",
      "test",
      30,
      (t, c) => ({
        controls: {
          ...c.controls,
          aileron: t > 1 && t < 3 ? 0.4 : 0,
          elevator: t > 2 && t < 4 ? -0.3 : 0,
        },
        ...(t >= 12 ? sw(c, { altMaster: false }) : {}),
      }),
    );
    const res = r.result();
    expect(res.recognitionS).toBeCloseTo(12, 0);
  });

  it("an engine failure: the pitch input for the glide is the first answer", () => {
    const r = fly(
      lib("c172.engineFailure.en"),
      "engine",
      "test",
      20,
      (t, c) => ({
        engineRunning: false,
        controls: { ...c.controls, elevator: t >= 2.5 ? -0.2 : 0 },
      }),
      { engineRunning: false },
    );
    expect(r.result().recognitionS).toBeCloseTo(2.5, 1);
  });
});

describe("aviate: the flight path is graded in every procedure, and until the end of the flight", () => {
  const elecFireDone = (t: number, c: ProcSimView): Partial<ProcSimView> =>
    t >= 2
      ? sw(c, {
          stbyBatt: false,
          batMaster: false,
          altMaster: false,
          cabinHeat: false,
          avionics: false,
          avionics2: false,
        })
      : {};

  it("electrical fire flawless on the switches, in a 60° spiral: FAIL, control lost — never 'flown correctly'", () => {
    const r = fly(
      lib("c172.electricalFire.en"),
      "electricalFire",
      "training",
      40,
      (t, c) => ({
        ...elecFireDone(t, c),
        bankDeg: t > 6 ? 60 : 10,
      }),
    );
    const res = r.result();
    expect(res.aviate!.controlLost).toBe(true);
    expect(res.verdict).toBe("FAIL");
    expect(res.score).toBeLessThanOrEqual(50);
    expect(res.notes[0]).toMatch(
      /^Bank reached 60° \(limit 30°\): aircraft control was lost/,
    );
    expect(res.notes.some((n) => /flown correctly/.test(n))).toBe(false);
  });

  it("partial panel (classic vacuum failure) at 40° of bank: FAIL (limit 20°, IFH / ACS partial panel)", () => {
    const r = fly(
      lib("c172.vacuum.en", "steam"),
      "vacuum",
      "training",
      60,
      (t) => ({
        bankDeg: t > 8 && t < 30 ? 40 : 5,
      }),
    );
    const res = r.result();
    expect(res.aviate!.maxBankLimitDeg).toBe(20);
    expect(res.verdict).toBe("FAIL");
  });

  it("alternator in IMC: the altitude is held ±100 ft while the checklist runs", () => {
    const r = fly(
      lib("c172.alternator.en"),
      "alternator",
      "training",
      60,
      (t, c) => ({
        altFt: 4500 + (t > 10 ? Math.min(400, (t - 10) * 20) : 0),
        ...(t >= 3 ? sw(c, { altMaster: false }) : {}),
      }),
    );
    const res = r.result();
    expect(res.aviate!.altTolFt).toBe(100);
    expect(res.aviate!.altInPct!).toBeLessThan(50);
    expect(res.aviate!.altDevMaxFt).toBe(400);
    expect(
      res.notes.some((n) => /Altitude held within ±100 ft only/.test(n)),
    ).toBe(true);
  });

  it("trim runaway: checklist complete at 11 s, then VNE and a crash at 25 s — the crash is the result", () => {
    let mid: ReturnType<ProcedureRunner["state"]> | null = null;
    const r = fly(
      lib("c172.trimRunaway.en"),
      "trimRunaway",
      "training",
      26,
      (t, c) => ({
        controls: { ...c.controls, trim: -0.25 - Math.min(0.5, t * 0.1) },
        pitchDeg: t < 14 ? 1 : -25,
        iasKt: t < 14 ? 105 : Math.min(240, 105 + (t - 14) * 12),
        ...(t >= 5 ? sw(c, { trimCb: false }) : {}),
        crashed: t >= 25,
      }),
      {},
      (run, t) => {
        if (t === 6)
          ["disc", "retrim", "land"].forEach((id) =>
            run.confirm(id, "student"),
          );
        if (Math.abs(t - 12) < 1e-6) mid = run.state();
      },
    );
    // complete, still watched: the card says so, the runner has not stopped
    expect(mid!.complete).toBe(true);
    expect(mid!.stopped).toBe(false);
    const res = r.result();
    expect(res.completedS).not.toBeNull();
    expect(res.outcome).toBe("crashed");
    expect(res.verdict).toBe("FAIL");
    expect(res.score).toBeLessThanOrEqual(20);
    expect(res.aviate!.after.vneExceeded).toBe(true);
    expect(res.aviate!.after.crashed).toBe(true);
    expect(res.notes[0]).toMatch(/crashed after the checklist was complete/);
    expect(res.timeline!.map((e) => e.kind)).toEqual(
      expect.arrayContaining(["complete", "exceed", "crash"]),
    );
  });

  it("checklist complete and the aircraft flown to the end of the flight: PASS, the time watched is recorded", () => {
    const r = fly(
      lib("c172.electricalFire.en"),
      "electricalFire",
      "training",
      90,
      (t, c) => elecFireDone(t, c),
      {},
      (run, t) => {
        if (t === 3)
          ["vents", "switches", "breakers", "land"].forEach((id) =>
            run.confirm(id, "student"),
          );
      },
    );
    r.finish();
    const res = r.result();
    expect(res.verdict).toBe("PASS");
    expect(res.outcome).toBe("completed");
    expect(res.aviate!.ok).toBe(true);
    expect(res.aviate!.watchedAfterS).toBeGreaterThan(80);
  });

  it("checklist complete, then a sustained stall warning in cruise (no crash): an upset after the checklist is no PASS", () => {
    const r = fly(
      lib("c172.electricalFire.en"),
      "electricalFire",
      "training",
      60,
      (t, c) => ({
        ...elecFireDone(t, c),
        // 30 s after the checklist: nose high, horn on for 4 s at 4500 ft (AFH ch.4: a stall warning held is a
        // loss of control, not the flare)
        stallWarn: t >= 30 && t < 34,
        iasKt: t >= 30 && t < 34 ? 50 : 100,
      }),
      {},
      (run, t) => {
        if (t === 3)
          ["vents", "switches", "breakers", "land"].forEach((id) =>
            run.confirm(id, "student"),
          );
      },
    );
    r.finish();
    const res = r.result();
    expect(res.completedS).not.toBeNull();
    expect(res.completedS!).toBeLessThan(30);
    expect(res.aviate!.after.upset).toBe(true);
    expect(res.aviate!.after.stallWarnS).toBeGreaterThanOrEqual(3.9);
    expect(res.aviate!.ok).toBe(false);
    expect(res.verdict).toBe("FAIL");
    expect(res.score).toBeLessThanOrEqual(50);
    expect(
      res.timeline!.some((e) => e.kind === "exceed" && e.ref === "stall-after"),
    ).toBe(true);
  });
});

describe("memory flow and checklist", () => {
  it("training: opening the checklist the card offers never fails the drill", () => {
    const r = fly(
      lib("c172.engineFire.en"),
      "engineFire",
      "training",
      30,
      (t, c) => ({
        iasKt: 100,
        ...(t >= 2
          ? sw(c, {
              mixture: 0,
              fuelShutoff: false,
              stbyBatt: false,
              batMaster: false,
              altMaster: false,
            })
          : {}),
      }),
      {},
      (run, t) => {
        if (t === 0.5) run.openChecklist();
      },
    );
    const res = r.result();
    expect(res.checklistOpenedS).toBeCloseTo(0.5, 1);
    expect(res.guided).toBe(true);
    expect(res.items.filter((x) => x.memory).every((x) => x.fromMemory)).toBe(
      true,
    );
    expect(res.verdict).toBe("PASS");
  });

  it("an airspeed decaying through the band is not 'established' (EFATO, nose high towards the stall)", () => {
    const r = fly(
      lib("c172.efato.en"),
      "engine",
      "test",
      20,
      (t) => ({
        iasKt: Math.max(45, 80 - t * 2),
        pitchDeg: 8,
        aglFt: 600,
        altFt: 700,
        engineRunning: false,
      }),
      { aglFt: 600, altFt: 700, engineRunning: false },
    );
    const res = r.result();
    expect(res.items.find((x) => x.id === "ias")!.done).toBe(false);
    expect(res.verdict).toBe("FAIL");
  });

  it("an attitude that was already right before the cue is credited only once it held after the cue", () => {
    const sys = baseSys();
    const r = fly(
      lib("c172.vacuum.en", "steam"),
      "vacuum",
      "training",
      30,
      (t) => ({ sys: { ...sys, vacuumInHg: t < 8 ? 5 : 2.5 } }),
      { sys, bankDeg: 2 },
    );
    const lv = r.result().items.find((x) => x.id === "level")!;
    expect(lv.done).toBe(true);
    expect(lv.atS!).toBeGreaterThanOrEqual(8);
  });

  it("a restart that works after the glide was flown: the checklist items left are not applicable, the checklist is complete", () => {
    let st: ReturnType<ProcedureRunner["state"]> | null = null;
    const r = fly(
      lib("c172.engineFailure.en"),
      "fuelStarvation",
      "training",
      40,
      (t, c) => ({
        rpm: t < 3 ? 2400 : t < 10 ? 900 : 2300,
        engineRunning: t < 3 || t >= 10,
        // the pilot pitches up at once: the speed comes down from 105 towards 68 KIAS (still above it at the restart)
        iasKt: t < 4 ? 105 : Math.max(80, 105 - (t - 4) * 4),
        controls: { ...c.controls, elevator: t >= 4 ? -0.3 : 0 },
        ...(t >= 6 ? sw(c, { auxPump: true }) : {}),
      }),
      { rpm: 2400, iasKt: 105 },
      (run, t) => {
        if (t === 20) st = run.state();
      },
    );
    expect(st!.complete).toBe(true);
    expect(st!.stopped).toBe(false);
    expect(st!.restartNoGlide).toBeFalsy();
    const res = r.result();
    expect(res.items.find((x) => x.id === "ias")!.done).toBe(true);
    expect(res.items.some((x) => x.notApplicable)).toBe(true);
    expect(res.timeline!.some((e) => e.kind === "resolved")).toBe(true);
    expect(res.notes.some((n) => /Memory item missed/.test(n))).toBe(false);
    expect(res.verdict).toBe("PASS");
  });

  it("a restart does not waive the best glide: flown at cruise speed throughout, the card says so and the drill fails", () => {
    let st: ReturnType<ProcedureRunner["state"]> | null = null;
    const r = fly(
      lib("c172.engineFailure.en"),
      "fuelStarvation",
      "training",
      40,
      (t, c) => ({
        rpm: t < 3 ? 2400 : t < 10 ? 900 : 2300,
        engineRunning: t < 3 || t >= 10,
        iasKt: 105,
        ...(t >= 6 ? sw(c, { auxPump: true }) : {}),
      }),
      { rpm: 2400, iasKt: 105 },
      (run, t) => {
        if (t === 20) st = run.state();
      },
    );
    // the checklist part is over (the engine runs), but not as 'Checklist complete'
    expect(st!.complete).toBe(true);
    expect(st!.restartNoGlide).toBe(true);
    const ias = st!.items.find((i) => i.id === "ias")!;
    expect(ias.notFlown).toBe(true);
    expect(ias.notApplicable).toBeFalsy();
    const res = r.result();
    expect(res.items.find((x) => x.id === "ias")).toMatchObject({ done: false, optional: false });
    expect(res.notes.some((n) => /Memory item missed/.test(n))).toBe(true);
    expect(res.verdict).toBe("FAIL");
  });

  it("solo test: callouts nobody can hear are 'not assessed', the sensed items and the flight path make the score", () => {
    const r = fly(lib("c172.icing.en"), "pitotIcing", "test", 60, (t, c) =>
      t >= 8 ? sw(c, { pitotHeat: true }) : {},
    );
    const res = r.result();
    expect(res.soloTest).toBe(true);
    expect(res.notAssessed).toBeGreaterThan(0);
    expect(
      res.items.filter((x) => x.assessed === false).every((x) => !x.safety),
    ).toBe(true);
    expect(res.notes.some((n) => /tap Done/.test(n))).toBe(false);
  });
});

describe("restart, then the forced landing", () => {
  it("fuel starvation: a restart flow still being worked is given its time — no forced landing 15 s after the engine quits", () => {
    const s = new DrillSession({ mode: "training", lang: "en" });
    const base = fakeView({ t: 0, sw: { ...fakeView().sw, fuelSelector: "LEFT" } });
    s.start("fuelStarvation", 0, "c172.engineFailure", base);
    let cur = base;
    for (let t = 0; t <= 60; t += 0.5) {
      // the engine quits at 7 s; selector BOTH and pump ON 14 s later (21 s): it fires again 3 s after (24 s)
      cur = {
        ...cur,
        t,
        iasKt: 68,
        engineRunning: t < 7 || t >= 24,
        sw: { ...cur.sw, fuelSelector: t >= 21 ? "BOTH" : "LEFT", auxPump: t >= 21 },
      };
      s.update(cur);
      // FOLLOW_LOST_S after the loss the restart is still in progress: nothing follows yet
      if (t === 7 + FOLLOW_LOST_S + 1) expect(s.runners.length).toBe(1);
    }
    expect(s.runners.length).toBe(1);
    const res = s.results()[0];
    expect(res.items.find((x) => x.id === "selector")!.done).toBe(true);
    expect(res.timeline!.some((e) => e.kind === "resolved")).toBe(true);
  });

  it("the restart flow done and still no power: the forced landing; the engine catching later makes it moot", () => {
    const s = new DrillSession({ mode: "training", lang: "en" });
    const base = fakeView({ t: 0, sw: { ...fakeView().sw, fuelSelector: "LEFT" } });
    s.start("fuelStarvation", 0, "c172.engineFailure", base);
    let cur = base;
    let fl: ProcedureRunner | undefined;
    for (let t = 0; t <= 120; t += 0.5) {
      // the engine quits at 7 s, the whole flow is done by 12 s and it stays dead until 80 s
      cur = {
        ...cur,
        t,
        iasKt: 68,
        engineRunning: t < 7 || t >= 80,
        sw: { ...cur.sw, fuelSelector: t >= 10 ? "BOTH" : "LEFT", auxPump: t >= 10 },
      };
      if (t === 11) s.confirm("field", "student");
      s.update(cur);
      fl ??= s.runners[1];
    }
    // the forced landing followed the completed flow FOLLOW_LOST_S after the loss — not FOLLOW_RESTART_S
    expect(fl).toBeDefined();
    expect(fl!.failedAtS).toBe(7);
    const fr = fl!.result();
    expect(fr.followUpOf).toBe("c172.engineFailure.en");
    // the engine runs again at 80 s: the forced-landing items left are not applicable, never 'missed'
    expect(fr.timeline!.some((e) => e.kind === "resolved")).toBe(true);
    expect(fl!.isComplete).toBe(true);
    expect(fr.items.filter((x) => x.notApplicable).length).toBeGreaterThan(0);
    expect(fr.notes.some((n) => /Memory item missed/.test(n))).toBe(false);
    expect(FOLLOW_RESTART_S).toBeGreaterThan(FOLLOW_LOST_S);
  });
});

describe("the flight and the card", () => {
  it("a test drill never names its failure in the flight title (FR and EN)", () => {
    for (const lang of ["en", "fr"] as const) {
      const c = buildDrill("d-elec-fire", {
        airport: "PARD",
        lang,
        mode: "test",
      });
      if (!c) continue;
      const ex = circuitToExercise(c);
      expect(ex.title).not.toMatch(/fire|feu|électrique|electrical/i);
      expect(ex.summary).not.toMatch(/fire|feu|fumée|smoke/i);
      expect(testFlightTitle(c, lang)).toMatch(
        lang === "fr" ? /^Vol de contrôle · PARD/ : /^Test flight · PARD/,
      );
      // the flight title follows the interface language (English here)
      expect(ex.title).toBe(testFlightTitle(c, "en"));
      // in training the drill keeps its name
      const tr = buildDrill("d-elec-fire", {
        airport: "PARD",
        lang,
        mode: "training",
      })!;
      expect(circuitToExercise(tr).title).toMatch(/fire|feu/i);
    }
  });

  it("two failures at once: a Done on the picked checklist reaches its procedure even when it is not the latest", async () => {
    const { ProcedureController } = await import("../src/ui/procedurePanel");
    const sim = new Sim(SCENARIOS[1]);
    const ctrl = new ProcedureController({ sim, lesson: () => null });
    ctrl.reset();
    ctrl.setGrade(true);
    ctrl.setFreeMode("test");
    const step = (s: number) => {
      for (let t = 0; t < s; t += 1 / 30) {
        sim.step(1 / 30);
        ctrl.tick(1 / 30);
      }
    };
    ctrl.fire("alternator");
    step(1);
    ctrl.fire("vacuum");
    step(1);
    const alt = ctrl.runners().find((r) => r.failure === "alternator")!;
    expect(ctrl.active()?.failure).not.toBe("alternator");
    const picked = ctrl.list().find((p) => p.id === alt.procedure.id)!;
    ctrl.pickChecklist(picked);
    expect(ctrl.confirmOn(picked, "altCb")).toBe(true);
    expect(alt.state().items.find((i) => i.id === "altCb")!.done).toBe(true);
    // training: the card's tab confirms on its own procedure too
    ctrl.setFreeMode("training");
    sim.setFailure("vacuum", false);
    sim.setFailure("alternator", false);
    step(0.5);
    ctrl.reset();
    ctrl.fire("alternator");
    step(1);
    ctrl.fire("ahrs");
    step(1);
    const a2 = ctrl.runners().find((r) => r.failure === "alternator")!;
    expect(ctrl.confirm("altCb", "student", a2.procedure.id)).toBe(true);
    expect(a2.state().items.find((i) => i.id === "altCb")!.done).toBe(true);
  });

  it("the result keeps the whole story for the lesson result and the records (phases, aviate, timeline)", () => {
    const r = fly(
      lib("c172.alternator.en"),
      "alternator",
      "training",
      40,
      (t, c) => ({
        ...(t >= 3 ? sw(c, { altMaster: false }) : {}),
        ...(t >= 8 ? sw(c, { altMaster: true }) : {}),
      }),
    );
    const res = JSON.parse(JSON.stringify(r.result()));
    expect(Object.keys(res.phases)).toEqual([
      "aviate",
      "recognise",
      "memory",
      "checklist",
      "communicate",
    ]);
    expect(res.aviate).toMatchObject({
      maxBankLimitDeg: 30,
      altTolFt: 100,
      ok: true,
    });
    expect(res.timeline[0]).toMatchObject({ kind: "failure", atS: 0 });
    expect(
      res.items.every((x: { phase: string }) =>
        ["memory", "checklist", "communicate"].includes(x.phase),
      ),
    ).toBe(true);
    expect(defaultSwitches().altMaster).toBe(true);
  });
});
