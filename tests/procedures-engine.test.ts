import { beforeEach, describe, expect, it } from "vitest";
import {
  CHECKS,
  CHECK_IDS,
  checkLabel,
  checkParamIssues,
  defaultParams,
  switchValueOptions,
} from "../src/train/procedureChecks";
import {
  DrillSession,
  PASS_MARK,
  ProcedureRunner,
  baseId,
  fakeView,
  pickProcedure,
  simView,
  type ProcSimView,
} from "../src/train/procedures";
import {
  CATEGORY_LABELS,
  DISCLAIMER,
  LIBRARY,
  LIBRARY_BASES,
  libraryProcedure,
} from "../src/train/procedureLibrary";
import {
  clearClubLibrary,
  customise,
  decodeShare,
  deleteProcedure,
  duplicateFromLibrary,
  effectiveProcedures,
  encodeShare,
  exportPack,
  exportPackJson,
  getProcedure,
  importPack,
  importShare,
  listClub,
  newProcedure,
  parsePack,
  resetToLibrary,
  saveProcedure,
  setClubName,
  shareCodeFromUrl,
  shareLink,
  validateProcedure,
} from "../src/train/procedureStore";
import type { Procedure } from "../src/train/procedureTypes";
import {
  defaultSwitches,
  FAILURE_LABELS_EN,
  type Switches,
} from "../src/sim/systemsTypes";
import { Sim, SCENARIOS } from "../src/sim/sim";

const ctx = { failedAtS: 0, elapsedS: 0 };
const v = (o: Partial<ProcSimView> = {}) => fakeView(o);
const withSw = (s: Partial<Switches>, o: Partial<ProcSimView> = {}) =>
  v({ ...o, sw: { ...defaultSwitches(), ...s } });
const lib = (id: string) => libraryProcedure(id)!;

/** drive a runner along a script: at each time, apply the change to the running view */
function fly(
  r: ProcedureRunner,
  from: number,
  to: number,
  script: (t: number, cur: ProcSimView) => Partial<ProcSimView> | void,
  start: Partial<ProcSimView> = {},
  dt = 0.25,
) {
  let cur = v({ ...start, t: from });
  for (let t = from; t <= to + 1e-9; t += dt) {
    const ch = script(t, cur);
    cur = { ...cur, ...(ch ?? {}), t };
    r.update(cur);
  }
  return cur;
}

// ====================================================================== catalogue
describe("check catalogue", () => {
  it("every check has FR/EN names, labels and a params schema", () => {
    for (const id of CHECK_IDS) {
      const d = CHECKS[id];
      expect(d.id).toBe(id);
      expect(d.name.fr.length && d.name.en.length).toBeTruthy();
      const p = defaultParams(id);
      expect(d.label(p, "en").length).toBeGreaterThan(2);
      expect(d.label(p, "fr").length).toBeGreaterThan(2);
      for (const prm of d.params)
        expect(prm.label.fr && prm.label.en).toBeTruthy();
    }
  });

  it("labels read like checklist lines", () => {
    const cut = {
      id: "switch" as const,
      p: { key: "mixture", value: 0, op: "<=" },
    };
    expect(checkLabel(cut, "en")).toBe("Mixture — IDLE CUT-OFF");
    expect(checkLabel(cut, "fr")).toBe("Mélange — ÉTOUFFOIR");
    expect(
      checkLabel(
        { id: "switch", p: { key: "fuelShutoff", value: false } },
        "fr",
      ),
    ).toBe("Robinet coupe-feu carburant — FERMÉ (tiré)");
    expect(checkLabel({ id: "xpdr", p: { code: "7700" } }, "en")).toBe(
      "Transponder — 7700",
    );
    expect(checkLabel({ id: "radio", p: { freq: 121.5 } }, "fr")).toBe(
      "COM — 121,5",
    );
    expect(checkLabel({ id: "ias", p: { min: 63, max: 73 } }, "en")).toBe(
      "Airspeed 68 kt (63–73)",
    );
    expect(switchValueOptions("magnetos").map((o) => o.value)).toContain("L|R");
  });

  it("switch checks: booleans, enums with alternatives, mixture thresholds", () => {
    const ev = (
      p: Record<string, string | number | boolean>,
      s: Partial<Switches>,
    ) => CHECKS.switch.evaluate(withSw(s), p, ctx);
    expect(ev({ key: "auxPump", value: true }, { auxPump: true })).toBe(true);
    expect(ev({ key: "auxPump", value: true }, {})).toBe(false);
    expect(ev({ key: "batMaster", value: false }, { batMaster: false })).toBe(
      true,
    );
    expect(ev({ key: "magnetos", value: "L|R" }, { magnetos: "R" })).toBe(true);
    expect(ev({ key: "magnetos", value: "L|R" }, { magnetos: "BOTH" })).toBe(
      false,
    );
    expect(ev({ key: "fuelSelector", value: "BOTH" }, {})).toBe(true);
    expect(ev({ key: "mixture", value: 0, op: "<=" }, { mixture: 0.04 })).toBe(
      true,
    );
    expect(ev({ key: "mixture", value: 0, op: "<=" }, { mixture: 0.3 })).toBe(
      false,
    );
    expect(ev({ key: "mixture", value: 1, op: ">=" }, { mixture: 0.92 })).toBe(
      true,
    );
    expect(ev({ key: "nope", value: true }, {})).toBe(false);
  });

  it("controls, attitude, avionics and outcome checks", () => {
    expect(
      CHECKS.throttle.evaluate(
        v({ controls: { ...v().controls, throttle: 0 } }),
        { op: "<=", value: 0.05 },
        ctx,
      ),
    ).toBe(true);
    expect(CHECKS.throttle.evaluate(v(), { op: ">=", value: 0.9 }, ctx)).toBe(
      false,
    );
    expect(
      CHECKS.flaps.evaluate(
        v({ controls: { ...v().controls, flaps: 3 } }),
        { value: 3 },
        ctx,
      ),
    ).toBe(true);
    expect(
      CHECKS.ias.evaluate(v({ iasKt: 68 }), { min: 63, max: 73 }, ctx),
    ).toBe(true);
    expect(
      CHECKS.ias.evaluate(
        v({ iasKt: 68, onGround: true }),
        { min: 63, max: 73 },
        ctx,
      ),
    ).toBe(false);
    expect(CHECKS.ias.holdS({ min: 63, max: 73, holdS: 5 })).toBe(5);
    expect(
      CHECKS.pitchAtt.evaluate(v({ pitchDeg: -3 }), { min: -60, max: 2 }, ctx),
    ).toBe(true);
    expect(CHECKS.bankMax.evaluate(v({ bankDeg: -12 }), { max: 10 }, ctx)).toBe(
      false,
    );
    expect(
      CHECKS.altBand.evaluate(
        v({ altFt: 3000 }),
        { min: 2900, max: 3100 },
        ctx,
      ),
    ).toBe(true);
    expect(
      CHECKS.heading.evaluate(v({ hdgDeg: 2 }), { value: 359, tol: 5 }, ctx),
    ).toBe(true);
    expect(
      CHECKS.heading.evaluate(v({ hdgDeg: 20 }), { value: 359, tol: 5 }, ctx),
    ).toBe(false);
    expect(
      CHECKS.xpdr.evaluate(v({ xpdr: "7600" }), { code: "7600" }, ctx),
    ).toBe(true);
    expect(
      CHECKS.cdi.evaluate(v({ cdi: "NAV1" }), { value: "NAV1" }, ctx),
    ).toBe(true);
    expect(
      CHECKS.ap.evaluate(v({ apEngaged: false }), { engaged: false }, ctx),
    ).toBe(true);
    expect(
      CHECKS.directTo.evaluate(
        v({ directTo: "LFPN", nearest: ["LFPN", "LFPV"] }),
        { ident: "*nearest" },
        ctx,
      ),
    ).toBe(true);
    expect(
      CHECKS.directTo.evaluate(
        v({ directTo: "LFPO", nearest: ["LFPN"] }),
        { ident: "*nearest" },
        ctx,
      ),
    ).toBe(false);
    expect(
      CHECKS.directTo.evaluate(v({ directTo: "LFPO" }), { ident: "lfpo" }, ctx),
    ).toBe(true);
    expect(CHECKS.timer.evaluate(v({ timerRunning: true }), {}, ctx)).toBe(
      true,
    );
    expect(
      CHECKS.radio.evaluate(
        v({ com: [{ active: 119.85, standby: 121.5 }] }),
        { freq: 121.5 },
        ctx,
      ),
    ).toBe(true);
    expect(
      CHECKS.landed.evaluate(v({ onGround: true, stopped: true }), {}, ctx),
    ).toBe(true);
    expect(
      CHECKS.landed.evaluate(
        v({ onGround: true, stopped: true, crashed: true }),
        {},
        ctx,
      ),
    ).toBe(false);
    expect(CHECKS.manual.evaluate(v(), {}, ctx)).toBe(false);
    expect(
      CHECKS.engineRunning.evaluate(
        v({ engineRunning: false }),
        { value: false },
        ctx,
      ),
    ).toBe(true);
  });

  it("simView adapts the real Sim", () => {
    const s = new Sim(SCENARIOS.find((x) => x.id === "ils27-vtf"));
    s.step(1 / 30);
    const view = simView(s);
    expect(view.iasKt).toBeGreaterThan(60);
    expect(view.onGround).toBe(false);
    expect(view.sw.fuelSelector).toBe("BOTH");
    expect(view.nearest.length).toBeGreaterThan(0);
    expect(view.com.length).toBe(2);
    expect(view.engineRunning).toBe(true);
    // a snapshot: later switch changes must not leak into it (the runner compares against the failure view)
    s.setSwitch("auxPump", true);
    expect(view.sw.auxPump).toBe(false);
    expect(simView(s).sw.auxPump).toBe(true);
    expect(CHECKS.radio.evaluate(view, { freq: s.av.com1.active }, ctx)).toBe(
      true,
    );
  });
});

// ====================================================================== runner
describe("procedure runner", () => {
  it("engine fire, done right (EN): PASS, in order, reaction time, plain notes", () => {
    const p = lib("c172.engineFire.en");
    const r = new ProcedureRunner(p, "test", "engineFire", 100);
    fly(r, 100, 140, (t, c) => {
      if (t >= 102) c = { ...c, sw: { ...c.sw, mixture: 0 } };
      if (t >= 104) c = { ...c, sw: { ...c.sw, fuelShutoff: false } };
      if (t >= 106) c = { ...c, sw: { ...c.sw, batMaster: false } };
      if (t >= 103) c = { ...c, iasKt: Math.min(c.iasKt + 0.5, 100) };
      return c;
    });
    r.confirm("forced", "student");
    const res = r.result();
    expect(res.reactionS).toBe(2);
    const byId = Object.fromEntries(res.items.map((x) => [x.id, x]));
    expect(byId.mixture).toMatchObject({
      done: true,
      atS: 2,
      inOrder: true,
      late: false,
      fromMemory: true,
      by: "auto",
    });
    expect(byId.auxPump.by).toBe("verified"); // already OFF at the failure: credited when the pilot moved on
    expect(byId.cabin.by).toBe("verified");
    expect(byId.ias.done).toBe(true);
    expect(res.verdict).toBe("PASS");
    expect(res.score).toBeGreaterThanOrEqual(90);
    expect(res.lang).toBe("en");
    expect(res.notes[0]).toBe("“Engine fire in flight” flown correctly: 100/100.");
    expect(res.notes).toContain("Memory items done from memory, in order and in time.");
  });

  it("late safety-critical memory item => FAIL, the first note says by how much (FR)", () => {
    const p = lib("c172.engineFire.fr");
    const r = new ProcedureRunner(p, "test", "engineFire", 0);
    fly(r, 0, 40, (t, c) => {
      if (t >= 3) c = { ...c, sw: { ...c.sw, fuelShutoff: false } }; // valve first: out of order
      if (t >= 14) c = { ...c, sw: { ...c.sw, mixture: 0 } }; // limit 10 s
      if (t >= 16) c = { ...c, sw: { ...c.sw, batMaster: false } };
      return c;
    });
    const res = r.result();
    const mix = res.items.find((x) => x.id === "mixture")!;
    expect(mix.late).toBe(true);
    expect(mix.lateByS).toBe(4);
    expect(res.items.find((x) => x.id === "shutoff")!.inOrder).toBe(false);
    expect(res.verdict).toBe("FAIL");
    expect(res.notes[0]).toBe(
      "« Mélange — ÉTOUFFOIR » : fait avec 4 s de retard (à 14 s, limite 10 s) — point critique, exercice échoué.",
    );
    expect(
      res.notes.some((n) =>
        /: fait avant « Mélange — ÉTOUFFOIR » — respectez l’ordre/.test(n),
      ),
    ).toBe(true);
  });

  it("memory items done after opening the checklist are not from memory", () => {
    const r = new ProcedureRunner(
      lib("c172.engineFire.en"),
      "training",
      "engineFire",
      0,
    );
    fly(r, 0, 30, (t, c) => {
      if (t === 1) r.openChecklist();
      if (t >= 2)
        c = {
          ...c,
          sw: { ...c.sw, mixture: 0, fuelShutoff: false, batMaster: false },
        };
      return c;
    });
    const res = r.result();
    expect(res.checklistOpenedS).toBeCloseTo(1, 0);
    expect(res.items.find((x) => x.id === "mixture")!.fromMemory).toBe(false);
    expect(
      res.notes.some((n) => /only after opening the checklist/.test(n)),
    ).toBe(true);
    expect(res.score).toBeLessThan(90);
  });

  it("missed memory item => FAIL with the memory note first; state() shows due / late", () => {
    const r = new ProcedureRunner(
      lib("c172.electricalFire.en"),
      "test",
      "electricalFire",
      0,
    );
    fly(r, 0, 15, () => undefined);
    const st = r.state();
    const master = st.items.find((x) => x.id === "master")!;
    expect(master.done).toBe(false);
    expect(master.late).toBe(true);
    expect(master.due).toBeLessThan(0);
    expect(st.items.find((x) => x.id === "switches")!.manual).toBe(true);
    expect(st.items.find((x) => x.id === "cabin")!.ready).toBe(true); // already closed: will be verified
    expect(st.lang).toBe("en");
    expect(st.disclaimer).toBe(DISCLAIMER.en);
    const res = r.result();
    expect(res.verdict).toBe("FAIL");
    expect(res.outcome).toBe("incomplete");
    expect(res.notes[0]).toMatch(/^No reaction to the failure was detected/);
    expect(res.notes[1]).toMatch(/^Memory item missed: “Master switch — OFF”/);
  });

  it("manual items: the student confirms Done items only, the instructor any item", () => {
    const r = new ProcedureRunner(
      lib("c172.electricalFire.en"),
      "test",
      "electricalFire",
      0,
    );
    r.update(v({ t: 0 }));
    r.update(v({ t: 1 }));
    expect(r.confirm("master", "student")).toBe(false); // machine-checked: the student must do it
    expect(r.confirm("switches", "student")).toBe(true);
    expect(r.confirm("master", "instructor")).toBe(true);
    expect(r.confirm("nope", "instructor")).toBe(false);
    const res = r.result();
    expect(res.items.find((x) => x.id === "switches")!.by).toBe("student");
    expect(res.items.find((x) => x.id === "master")!.by).toBe("instructor");
    expect(res.reactionS).toBe(1);
  });

  it("flight-path stats: IAS band time, max bank, altitude lost; held checks need their hold time", () => {
    const p = lib("c172.engineFailure.en");
    const r = new ProcedureRunner(p, "training", "engine", 0);
    fly(
      r,
      0,
      60,
      (t, c) => ({
        iasKt: t < 10 ? 105 - t * 3.5 : 68 + (t > 40 && t < 46 ? 10 : 0),
        bankDeg: t > 20 && t < 25 ? 35 : 5,
        altFt: 4500 - t * 12,
        engineRunning: false,
        sw: { ...c.sw, auxPump: t >= 4 },
      }),
      { engineRunning: false },
    );
    r.confirm("field", "student");
    const res = r.result();
    const ias = res.items.find((x) => x.id === "ias")!;
    expect(ias.done).toBe(true);
    expect(ias.atS).toBeGreaterThan(9);
    expect(ias.atS).toBeLessThan(10.5);
    expect(res.path.maxBankDeg).toBe(35);
    expect(res.path.altLostFt).toBe(720);
    expect(res.path.iasBandPct).toBeGreaterThan(80);
    expect(res.path.iasBandPct).toBeLessThan(95);
    expect(
      res.notes.some((n) => /Bank reached 35° \(limit 30°\)/.test(n)),
    ).toBe(true);
    // pre-satisfied restart items are verified, auxPump auto
    const by = Object.fromEntries(res.items.map((x) => [x.id, x.by]));
    expect(by).toMatchObject({
      shutoff: "verified",
      selector: "verified",
      auxPump: "auto",
      mixture: "verified",
      mags: "verified",
    });
    expect(res.items.find((x) => x.id === "auxPump")!.inOrder).toBe(true);
  });

  it("crash => FAIL, score capped at 20; landing with the job done => completed", () => {
    const r = new ProcedureRunner(lib("c172.efato.en"), "test", "engine", 0);
    fly(r, 0, 10, (t) =>
      t > 8 ? { crashed: true, onGround: true, stopped: true } : { aglFt: 300 },
    );
    const res = r.result();
    expect(res.outcome).toBe("crashed");
    expect(res.verdict).toBe("FAIL");
    expect(res.score).toBeLessThanOrEqual(20);
    expect(res.notes[0]).toMatch(/crashed/);
  });

  it("an unordered procedure never flags order; optional items are a bonus", () => {
    const r = new ProcedureRunner(
      lib("c172.roughEngine.en"),
      "training",
      "engineRough",
      0,
    );
    fly(r, 0, 20, (t, c) => {
      if (t >= 1) c = { ...c, directTo: "LFPN", nearest: ["LFPN"] };
      if (t >= 2) c = { ...c, sw: { ...c.sw, magnetos: "L", auxPump: true } };
      return c;
    });
    r.confirm("fly", "student");
    r.confirm("prepare", "student");
    const res = r.result();
    expect(res.items.every((x) => x.inOrder)).toBe(true);
    expect(res.outcome).toBe("completed");
    expect(r.finished).toBe(true);
    expect(res.verdict).toBe("PASS");
  });

  it("score weights: perfect run ≈ 100, nothing done ≈ 0", () => {
    const good = new ProcedureRunner(
      lib("c172.trimRunaway.en"),
      "test",
      "trimRunaway",
      0,
    );
    fly(good, 0, 10, (t, c) =>
      t >= 1.5 ? { sw: { ...c.sw, trimCb: false } } : undefined,
    );
    good.confirm("retrim", "student");
    good.confirm("land", "student");
    expect(good.result().score).toBeGreaterThanOrEqual(95);
    expect(good.result().verdict).toBe("PASS");
    const bad = new ProcedureRunner(
      lib("c172.trimRunaway.en"),
      "test",
      "trimRunaway",
      0,
    );
    fly(bad, 0, 30, () => ({ pitchDeg: -20 }));
    expect(bad.result().score).toBeLessThan(25);
    expect(PASS_MARK).toBe(70);
  });
});

// ====================================================================== session
describe("drill session", () => {
  beforeEach(() => clearClubLibrary());

  it("picks: expected id, else a club procedure, else the library one in the current language", () => {
    const s = new DrillSession({ mode: "test", lang: "fr" });
    expect(s.pick("engineFire")!.id).toBe("c172.engineFire.fr");
    expect(s.pick("engineFire", "c172.electricalFire.en")!.id).toBe(
      "c172.electricalFire.en",
    );
    expect(s.pick("engineFire", "c172.electricalFire")!.id).toBe(
      "c172.electricalFire.fr",
    ); // base id → lang
    const club = duplicateFromLibrary("c172.engineFire.en")!;
    expect(club.basedOn).toBe("c172.engineFire.en");
    expect(s.pick("engineFire")!.id).toBe(club.id); // club first, even in another language
    expect(s.pick("engineFire", "c172.engineFire.en")!.id).toBe(club.id); // club override of the expected one
    expect(s.pick("battery")).toBeNull();
    expect(s.start("battery", 0)).toBeNull();
  });

  it("phase decides between take-off roll, EFATO and engine failure in flight", () => {
    const list = effectiveProcedures();
    expect(
      pickProcedure(
        list,
        "engine",
        "en",
        undefined,
        v({ onGround: true, aglFt: 0 }),
      )!.id,
    ).toBe("c172.takeoffRoll.en");
    expect(
      pickProcedure(list, "engine", "en", undefined, v({ aglFt: 400 }))!.id,
    ).toBe("c172.efato.en");
    expect(
      pickProcedure(list, "engine", "en", undefined, v({ aglFt: 4000 }))!.id,
    ).toBe("c172.engineFailure.en");
    expect(pickProcedure(list, "engine", "en")!.id).toBe(
      "c172.engineFailure.en",
    );
  });

  it("restart that fails => forced landing follow-up; results for the debrief; no duplicate runner", () => {
    const s = new DrillSession({ mode: "training", lang: "en" });
    const view = v({ t: 50, engineRunning: false });
    const r = s.start("engine", 50, undefined, view)!;
    expect(r.procedure.id).toBe("c172.engineFailure.en");
    expect(s.start("engine", 50, undefined, view)).toBeNull();
    let cur = view;
    for (let t = 50; t <= 80; t += 0.5) {
      cur = { ...cur, t, iasKt: 68, sw: { ...cur.sw, auxPump: t >= 52 } };
      if (t === 53) s.confirm("field", "student");
      s.update(cur);
    }
    expect(s.runners.length).toBe(2);
    expect(s.runners[0].finished).toBe(true);
    expect(s.active()!.procedure.id).toBe("c172.forcedLanding.en");
    expect(s.states()[1].items[0].id).toBe("ias");
    const res = s.results();
    expect(res.map((x) => x.procedureId)).toEqual([
      "c172.engineFailure.en",
      "c172.forcedLanding.en",
    ]);
    expect(res[0].verdict).toBe("PASS");
  });

  it("oil pressure: the forced landing starts only when the engine stops", () => {
    const s = new DrillSession({ mode: "test", lang: "fr" });
    s.start("oilPressure", 0, undefined, v({ t: 0 }));
    let cur = v({ t: 0 });
    for (let t = 0; t <= 30; t += 0.5) {
      cur = { ...cur, t, directTo: "LFPN", nearest: ["LFPN"] };
      s.update(cur);
    }
    ["gauges", "power", "atc", "glide"].forEach((id) =>
      s.confirm(id, "student"),
    );
    s.update({ ...cur, t: 31 });
    expect(s.runners.length).toBe(1);
    // the engine seizes at 400 s: the forced landing starts once it has stayed stopped for 15 s, its clock from 400
    for (let t = 400; t < 415; t += 0.5) s.update({ ...cur, t, engineRunning: false });
    expect(s.runners.length).toBe(1);
    s.update({ ...cur, t: 415, engineRunning: false });
    expect(s.runners.length).toBe(2);
    expect(s.active()!.procedure.id).toBe("c172.forcedLanding.fr");
    expect(s.active()!.failedAtS).toBe(400);
  });

  it("oil pressure: the engine seizes before the checklist is finished — the forced landing still follows", () => {
    // (review) the follow-up used to wait for the oil-pressure checklist to be completed: a student who had not
    // tapped every Done item never got the forced landing graded
    const s = new DrillSession({ mode: "test", lang: "en" });
    s.start("oilPressure", 0, undefined, v({ t: 0 }));
    const cur = v({ t: 0 });
    for (let t = 0; t <= 300; t += 0.5) s.update({ ...cur, t });
    expect(s.runners[0].finished).toBe(false);
    for (let t = 300; t <= 316; t += 0.5) s.update({ ...cur, t, engineRunning: false, iasKt: 68 });
    expect(s.runners.map((r) => r.procedure.id)).toEqual(["c172.oilPressure.en", "c172.forcedLanding.en"]);
    expect(s.runners[0].finished).toBe(true);
    expect(s.results()[1].followUpOf).toBe("c172.oilPressure.en");
  });

  it("fuel pump: an engine that stutters and restarts with the aux pump is no forced landing; one that stays dead is", () => {
    const s = new DrillSession({ mode: "training", lang: "en" });
    s.start("fuelPump", 0, undefined, v({ t: 0 }));
    let cur = v({ t: 0 });
    for (let t = 0; t <= 60; t += 0.5) {
      // engine quits at 4 s, the pilot switches the aux pump ON at 8 s, it fires again at 12 s
      cur = { ...cur, t, engineRunning: t < 4 || t >= 12, sw: { ...cur.sw, auxPump: t >= 8 } };
      s.update(cur);
    }
    expect(s.runners.length).toBe(1);
    expect(s.results()[0].items.find((x) => x.id === "auxPump")!.done).toBe(true);
    const s2 = new DrillSession({ mode: "training", lang: "en" });
    s2.start("fuelPump", 0, undefined, v({ t: 0 }));
    for (let t = 0; t <= 30; t += 0.5) s2.update(v({ t, engineRunning: t < 4 }));
    expect(s2.runners.map((r) => baseId(r.procedure.id))).toEqual(["c172.fuelPump", "c172.forcedLanding"]);
    expect(s2.runners[1].failedAtS).toBe(4);
  });
});

// ====================================================================== library
describe("procedure library", () => {
  it("every library procedure is valid, bilingual, with ref + disclaimer and resolvable checks", () => {
    expect(LIBRARY.length).toBe(LIBRARY_BASES.length * 2);
    for (const p of LIBRARY) {
      expect(validateProcedure(p), p.id).toEqual([]);
      expect(p.source).toBe("library");
      expect(p.aircraft).toBe("C172S");
      expect(p.disclaimer).toBe(DISCLAIMER[p.lang]);
      expect(p.ref && p.summary).toBeTruthy();
      expect(p.id.endsWith(`.${p.lang}`)).toBe(true);
      for (const it of p.items) {
        expect(it.text.trim().length, `${p.id}/${it.id}`).toBeGreaterThan(3);
        if (it.check)
          expect(CHECKS[it.check.id], `${p.id}/${it.id}`).toBeTruthy();
      }
      if (p.then)
        expect(libraryProcedure(p.then.procedure, p.lang)).not.toBeNull();
      expect(CATEGORY_LABELS[p.category]).toBeTruthy();
    }
    for (const b of LIBRARY_BASES) {
      const en = libraryProcedure(b, "en")!,
        fr = libraryProcedure(b, "fr")!;
      expect(baseId(en.id)).toBe(b);
      expect(en.failures).toEqual(fr.failures);
      if (b !== "c172.lostComms")
        expect(en.items.map((x) => x.id)).toEqual(fr.items.map((x) => x.id));
    }
  });

  it("covers the requested situations with POH speeds", () => {
    const need = [
      "c172.efato",
      "c172.engineFailure",
      "c172.forcedLanding",
      "c172.engineFire",
      "c172.electricalFire",
      "c172.alternator",
      "c172.vacuum",
      "c172.pitot",
      "c172.static",
      "c172.roughEngine",
      "c172.oilPressure",
      "c172.fuelPump",
      "c172.fuelLeak",
      "c172.flaps",
      "c172.trimRunaway",
      "c172.lostComms",
      "c172.xpdr",
      "c172.door",
      "c172.noseHigh",
      "c172.noseLow",
      "c172.spiral",
    ];
    for (const b of need) expect(LIBRARY_BASES).toContain(b);
    expect(lib("c172.engineFailure.en").items[0].check!.p).toMatchObject({
      min: 63,
      max: 73,
    }); // 68 KIAS ± 5
    expect(lib("c172.lostComms.en").ref).toMatch(/91\.185/);
    expect(lib("c172.lostComms.fr").ref).toMatch(/SERA\.14083/);
    expect(
      lib("c172.lostComms.fr").items.some((x) => x.check?.id === "timer"),
    ).toBe(true);
    expect(
      lib("c172.forcedLanding.fr").items.some(
        (x) => x.check?.id === "xpdr" && x.check.p?.code === "7700",
      ),
    ).toBe(true);
    // every failure has a procedure except the battery (the C172S POH has no dedicated one)
    const covered = new Set(LIBRARY.flatMap((p) => p.failures));
    const missing = (
      Object.keys(FAILURE_LABELS_EN) as (keyof typeof FAILURE_LABELS_EN)[]
    ).filter((k) => !covered.has(k));
    expect(missing.sort()).toEqual(["battery"]);
    // POH-level wording: 'as soon as practical' is not 'as soon as possible' in French either
    for (const p of LIBRARY.filter((x) => x.lang === "en"))
      p.items.forEach((it, i) => {
        if (/as soon as practical/i.test(it.text))
          expect(lib(baseId(p.id) + ".fr").items[i].text).toMatch(/raisonnablement possible/);
      });
  });
});

// ====================================================================== store
describe("club procedure store", () => {
  beforeEach(() => clearClubLibrary());

  it("customise / save / effective list / reset to library", () => {
    const draft = customise("c172.engineFire.fr")!;
    expect(draft.source).toBe("club");
    expect(draft.basedOn).toBe("c172.engineFire.fr");
    expect(listClub()).toEqual([]); // a draft is not saved
    draft.title = "Feu moteur — DR400 club";
    draft.items[0].withinS = 8;
    const r = saveProcedure(draft);
    expect(r.ok).toBe(true);
    const eff = effectiveProcedures("fr");
    expect(eff.some((p) => p.id === "c172.engineFire.fr")).toBe(false);
    expect(eff.find((p) => p.id === draft.id)!.title).toBe(
      "Feu moteur — DR400 club",
    );
    expect(getProcedure(draft.id)!.updated).toBeTruthy();
    expect(resetToLibrary(draft.id)!.id).toBe("c172.engineFire.fr");
    expect(listClub()).toEqual([]);
    expect(
      effectiveProcedures("fr").some((p) => p.id === "c172.engineFire.fr"),
    ).toBe(true);
    // saving under a library id never shadows it: it becomes a club copy
    const again = saveProcedure({
      ...lib("c172.door.en"),
      title: "Door (club)",
    });
    expect(again.ok && again.procedure.id).not.toBe("c172.door.en");
    expect(again.ok && again.procedure.basedOn).toBe("c172.door.en");
    expect(deleteProcedure(again.ok ? again.procedure.id : "")).toBe(true);
  });

  it("validation gives readable errors in FR and EN", () => {
    const p = newProcedure("en");
    p.title = "";
    p.items = [
      { id: "a", text: "", memory: true, optional: true },
      {
        id: "a",
        text: "Mixture",
        memory: false,
        check: { id: "ias", p: { min: 80, max: 70 } },
        withinS: -1,
      },
      { id: "c", text: "Pump", memory: false, check: { id: "bogus" as never } },
    ];
    p.failures = ["engine", "warp" as never];
    p.targets = { iasKt: [90, 60] };
    const en = validateProcedure(p, "en").map((x) => x.message);
    expect(en).toContain("Give the procedure a title");
    expect(en).toContain("Item 1: the text is empty");
    expect(en).toContain("Item 1: a memory item cannot be optional");
    expect(en).toContain("Item 2: the id 'a' is used twice");
    expect(en).toContain(
      "Item 2: the time limit must be between 1 s and 1 hour",
    );
    expect(en).toContain("Item 2: The minimum is above the maximum");
    expect(en).toContain("Item 3: unknown check 'bogus'");
    expect(en).toContain("Unknown failure 'warp'");
    expect(en).toContain("Airspeed band: min below max, between 30 and 200 kt");
    const fr = validateProcedure(p, "fr").map((x) => x.message);
    expect(fr).toContain("Donnez un titre à la procédure");
    expect(fr).toContain("Point 1 : le texte est vide");
    const bad = saveProcedure(p, "fr");
    expect(bad.ok).toBe(false);
  });

  it("club pack: export → import round trip, conflict policies, foreign files refused", () => {
    setClubName("Aéroclub de Toussus");
    const a = duplicateFromLibrary("c172.engineFire.fr")!;
    const b = duplicateFromLibrary("c172.alternator.en")!;
    const json = exportPackJson();
    const pack = JSON.parse(json);
    expect(pack).toMatchObject({
      format: "ifr-club-pack",
      version: 1,
      club: "Aéroclub de Toussus",
    });
    expect(pack.procedures.length).toBe(2);
    clearClubLibrary();
    const rep = importPack(json);
    expect(rep.added.sort()).toEqual([a.id, b.id].sort());
    expect(
      listClub()
        .map((p) => p.id)
        .sort(),
    ).toEqual([a.id, b.id].sort());
    // same pack again: unchanged
    expect(importPack(json).skipped.length).toBe(2);
    // a newer edit wins with 'newer'; 'keep' keeps; 'copy' renames
    const edited = exportPack();
    edited.procedures[0] = {
      ...edited.procedures[0],
      title: "Changed",
      updated: "2999-01-01T00:00:00.000Z",
    };
    expect(importPack(edited, "keep").skipped[0].reason).toBe(
      "club version kept",
    );
    expect(importPack(edited, "copy").renamed.length).toBe(1);
    expect(importPack(edited).replaced).toEqual([edited.procedures[0].id]);
    expect(getProcedure(edited.procedures[0].id)!.title).toBe("Changed");
    const older = exportPack();
    older.procedures[0] = {
      ...older.procedures[0],
      title: "Old",
      updated: "2000-01-01T00:00:00.000Z",
    };
    expect(importPack(older).skipped[0].reason).toBe("local version is newer");
    expect(importPack(older, "replace").replaced.length).toBe(1);
    // invalid procedures are skipped with the reason, foreign JSON refused
    const broken = exportPack();
    broken.procedures = [
      { ...broken.procedures[0], id: "club.broken.en", items: [] },
    ];
    expect(importPack(broken).skipped[0].reason).toMatch(
      /Add at least one item/,
    );
    expect(parsePack("{nope").issues[0]).toMatch(/invalid JSON/);
    expect(importPack({ format: "other" }, "newer", "fr").issues[0]).toBe(
      "Ce n’est pas un pack de procédures de club",
    );
    // a pack holding an untouched library procedure adds nothing
    expect(
      importPack({
        format: "ifr-club-pack",
        version: 1,
        club: "",
        procedures: [lib("c172.door.fr")],
      }).skipped[0].reason,
    ).toBe("same as the library");
  });

  it("share codes: procedure and pack round-trip, compact, links", () => {
    const p = customise("c172.lostComms.fr")!;
    p.items[1].note = "Consigne club : 7600 avant tout";
    const code = encodeShare(p);
    expect(code.startsWith("P1.")).toBe(true);
    expect(code.length).toBeLessThan(JSON.stringify(p).length * 1.1);
    const back = decodeShare(code)!;
    expect(back.kind).toBe("procedure");
    const q = (back as { procedure: Procedure }).procedure;
    expect(q).toEqual({
      ...p,
      updated: undefined,
      source: "club",
    } as Procedure);
    expect(validateProcedure(q)).toEqual([]);
    const link = shareLink(p, "https://sim.example/app");
    expect(shareCodeFromUrl(link)).toBe(code);
    expect(decodeShare(link)!.kind).toBe("procedure");
    expect(decodeShare("P1.@@@")).toBeNull();
    expect(decodeShare("hello")).toBeNull();
    // whole pack
    duplicateFromLibrary("c172.vacuum.en");
    duplicateFromLibrary("c172.pitot.fr");
    setClubName("Club F-GXXX");
    const k = encodeShare(exportPack());
    expect(k.startsWith("K1.")).toBe(true);
    const pk = decodeShare(k)!;
    expect(pk.kind === "pack" && pk.pack.procedures.length).toBe(2);
    expect(pk.kind === "pack" && pk.pack.club).toBe("Club F-GXXX");
    clearClubLibrary();
    expect(importShare(k).added.length).toBe(2);
    expect(importShare("garbage", "newer", "fr").issues[0]).toBe(
      "Lien de partage invalide",
    );
  });
});

// ====================================================================== samples (printed with PRINT_SAMPLES=1)
describe("sample graded results", () => {
  it("prints an EN and a FR debrief", () => {
    const en = new ProcedureRunner(
      lib("c172.engineFailure.en"),
      "test",
      "engine",
      0,
    );
    fly(en, 0, 40, (t, c) => ({
      iasKt: t < 12 ? 105 - t * 3 : 68 + Math.sin(t) * 3,
      bankDeg: 10,
      altFt: 4500 - t * 11,
      sw: { ...c.sw, auxPump: t >= 9 },
      engineRunning: false,
    }));
    en.openChecklist();
    en.confirm("field", "instructor");
    const fr = new ProcedureRunner(
      lib("c172.engineFire.fr"),
      "test",
      "engineFire",
      0,
    );
    fly(fr, 0, 40, (t, c) => {
      if (t >= 4) c = { ...c, sw: { ...c.sw, mixture: 0 } };
      if (t >= 17) c = { ...c, sw: { ...c.sw, fuelShutoff: false } };
      if (t >= 20) c = { ...c, sw: { ...c.sw, batMaster: false } };
      return { ...c, iasKt: Math.min(110, 105 + t * 0.1) };
    });
    fr.confirm("forced", "student");
    const a = en.result(),
      b = fr.result();
    if (process.env.PRINT_SAMPLES)
      console.log(JSON.stringify({ en: a, fr: b }, null, 1));
    expect(a.notes.length).toBeGreaterThan(0);
    expect(b.notes.length).toBeGreaterThan(0);
  });
});

// ====================================================================== review fixes (fairness)
describe("fair grading (review)", () => {
  beforeEach(() => clearClubLibrary());

  it("a failed autopilot dropping by itself is not a pilot input; taking the controls credits AP DISC", () => {
    const p = lib("c172.apFail.en");
    // the AP is engaged at the failure, the system drops it on the next frame, the pilot does nothing
    const idle = new ProcedureRunner(p, "test", "ap", 0);
    fly(idle, 0, 30, (t) => (t >= 0.25 ? { apEngaged: false, apFailed: true } : { apEngaged: true }));
    const ri = idle.result();
    expect(ri.reactionS).toBeNull();
    expect(ri.items[0].done).toBe(false);
    expect(ri.verdict).toBe("FAIL");
    expect(ri.notes.some((n) => /No reaction/.test(n))).toBe(true);
    // same, the pilot takes the controls at 2 s
    const good = new ProcedureRunner(p, "test", "ap", 0);
    fly(good, 0, 30, (t, cur) => ({
      apEngaged: t < 0.25,
      apFailed: t >= 0.25,
      controls: { ...cur.controls, elevator: t >= 2 ? 0.3 : 0 },
    }));
    const rg = good.result();
    expect(rg.reactionS).toBe(2);
    expect(rg.items[0]).toMatchObject({ done: true, by: "verified", atS: 2, late: false });
    expect(rg.verdict).toBe("PASS");
  });

  it("a GPS that loses its direct-to by itself is not a pilot input", () => {
    const r = new ProcedureRunner(lib("c172.gpsLoss.en"), "test", "gps", 0);
    fly(r, 0, 10, (t) => ({ directTo: t >= 0.5 ? null : "KSFO" }), { directTo: "KSFO" });
    expect(r.result().reactionS).toBeNull();
  });

  it("solo test: callouts are checklist confirmations, never a memory-item FAIL; with an instructor they are", () => {
    const p = lib("c172.engineFailure.en");
    const script = (t: number, cur: ProcSimView) => ({
      iasKt: 68,
      engineRunning: false,
      sw: { ...cur.sw, auxPump: t >= 2 },
    });
    const solo = new ProcedureRunner(p, "test", "engine", 0);
    fly(solo, 0, 40, script);
    const rs = solo.result();
    expect(rs.soloTest).toBe(true);
    const field = rs.items.find((x) => x.id === "field")!;
    expect(field.done).toBe(false);
    expect(field.safety).toBe(false);
    expect(rs.verdict).toBe("PASS");
    expect(rs.notes.some((n) => n.startsWith("Callouts not confirmed"))).toBe(true);
    expect(rs.notes.some((n) => n.startsWith("Memory item missed"))).toBe(false);
    // an instructor is listening (confirmed another callout): the field choice is a real memory item again
    const heard = new ProcedureRunner(p, "test", "engine", 0);
    fly(heard, 0, 40, (t, cur) => {
      if (t === 3) heard.confirm("pumpOff", "instructor");
      return script(t, cur);
    });
    const rh = heard.result();
    expect(rh.soloTest).toBe(false);
    expect(rh.verdict).toBe("FAIL");
    expect(rh.notes[0]).toMatch(/^Memory item missed: “Field/);
    // a callout confirmed after opening the checklist in a solo test is not penalised as 'not from memory'
    const late = new ProcedureRunner(p, "test", "engine", 0);
    fly(late, 0, 40, (t, cur) => {
      if (t === 5) {
        late.openChecklist();
        late.confirm("field", "student");
      }
      return script(t, cur);
    });
    const rl = late.result();
    expect(rl.items.find((x) => x.id === "field")).toMatchObject({ done: true, fromMemory: true });
    expect(rl.notes.some((n) => /Callouts not confirmed/.test(n))).toBe(false);
  });

  it("the phase wins over a club version of a general procedure (customised restart does not replace EFATO)", () => {
    duplicateFromLibrary("c172.engineFailure.en");
    const list = effectiveProcedures();
    expect(pickProcedure(list, "engine", "en", undefined, v({ aglFt: 400 }))!.id).toBe("c172.efato.en");
    expect(pickProcedure(list, "engine", "en", undefined, v({ aglFt: 4000 }))!.id).toBe("club.engineFailure.en");
    const efato = duplicateFromLibrary("c172.efato.en")!;
    expect(pickProcedure(effectiveProcedures(), "engine", "en", undefined, v({ aglFt: 400 }))!.id).toBe(efato.id);
  });

  it("follow-ups: in the parent's language, reaction not graded again, never started on the ground", () => {
    const s = new DrillSession({ mode: "training", lang: "en" });
    const fr = new DrillSession({ mode: "training", lang: "en" });
    fr.start("engine", 0, "c172.engineFailure.fr", v({ t: 0, engineRunning: false }));
    let cur = v({ t: 0, engineRunning: false });
    for (let t = 0; t <= 100; t += 0.5) {
      cur = { ...cur, t, iasKt: 68 };
      fr.update(cur);
    }
    expect(fr.runners.map((r) => r.procedure.id)).toEqual(["c172.engineFailure.fr", "c172.forcedLanding.fr"]);
    const fl = fr.results()[1];
    expect(fl.followUpOf).toBe("c172.engineFailure.fr");
    expect(fl.reactionS).toBeNull();
    expect(fl.breakdown!.reaction).toBe(0);
    expect(fl.notes.some((n) => /réaction/i.test(n))).toBe(false);
    // oil pressure, landed at an airport with the engine still running, then shut down on the apron
    s.start("oilPressure", 0, undefined, v({ t: 0 }));
    s.update(v({ t: 1, directTo: "LFPN", nearest: ["LFPN"] }));
    ["gauges", "power", "atc", "glide"].forEach((id) => s.confirm(id, "student"));
    s.update(v({ t: 600, onGround: true, stopped: true, aglFt: 0 }));
    s.update(v({ t: 700, onGround: true, stopped: true, aglFt: 0, engineRunning: false }));
    s.update(v({ t: 800, onGround: false, aglFt: 2000, engineRunning: false }));
    expect(s.runners.length).toBe(1);
  });

  it("items already right at the failure show no countdown; electrical fire follows the POH order", () => {
    const p = lib("c172.electricalFire.en");
    expect(p.items.map((x) => x.id).slice(0, 5)).toEqual(["master", "cabin", "extinguisher", "avionics", "switches"]);
    const r = new ProcedureRunner(p, "training", "electricalFire", 0);
    fly(r, 0, 20, (t, cur) => ({ sw: { ...cur.sw, batMaster: t < 3, avionics: t < 6 } }));
    r.confirm("switches", "student");
    const res = r.result();
    expect(res.items.filter((x) => !x.optional && x.id !== "breakers" && x.id !== "land").every((x) => x.done && x.inOrder)).toBe(true);
    const st = new ProcedureRunner(lib("c172.engineFire.en"), "training", "engineFire", 0);
    st.update(v({ t: 0 }));
    st.update(v({ t: 1 }));
    const aux = st.state().items.find((x) => x.id === "auxPump")!;
    expect(aux.ready).toBe(true);
    expect(aux.due).toBeNull();
  });

  it("a switch check must name the control and the position", () => {
    expect(checkParamIssues({ id: "switch", p: { value: true } }, "en")).toEqual(["Control: missing value"]);
    expect(checkParamIssues({ id: "switch", p: { key: "pitotHeat" } }, "fr")).toEqual(["Position : valeur manquante"]);
    expect(checkParamIssues({ id: "switch", p: { key: "pitotHeat", value: true } }, "en")).toEqual([]);
  });
});

// ====================================================================== second review
describe("fair grading (second review)", () => {
  beforeEach(() => clearClubLibrary());

  it("nose-high recovery with the wings already level: the wings item is not 'out of order'", () => {
    const r = new ProcedureRunner(lib("c172.noseHigh.en"), "test", "ahrs", 0);
    fly(
      r,
      0,
      20,
      (t) => ({
        controls: { ...fakeView().controls, throttle: t >= 1 ? 1 : 0.6, elevator: t >= 1.5 ? 0.4 : 0 },
        pitchDeg: t < 1.5 ? 25 : Math.max(0, 25 - (t - 1.5) * 8),
        iasKt: 60,
      }),
      { pitchDeg: 25, bankDeg: 0, iasKt: 60 },
    );
    r.confirm("resume", "instructor");
    const res = r.result();
    expect(res.items.every((x) => x.done && x.inOrder && !x.late)).toBe(true);
    expect(res.verdict).toBe("PASS");
    expect(res.notes.some((n) => /follow the order|out of order/.test(n))).toBe(false);
    // a bank that has to be corrected is a pilot step again: levelling it before the pitch IS out of order
    const r2 = new ProcedureRunner(lib("c172.noseHigh.en"), "test", "ahrs", 0);
    fly(
      r2,
      0,
      20,
      (t) => ({
        controls: { ...fakeView().controls, throttle: t >= 1 ? 1 : 0.6 },
        bankDeg: t < 2 ? 40 : 0,
        pitchDeg: t < 8 ? 25 : 0,
      }),
      { pitchDeg: 25, bankDeg: 40 },
    );
    expect(r2.result().items.find((x) => x.id === "wings")!.inOrder).toBe(false);
  });

  it("EFATO at Vy: the airspeed already in the band is not flagged before the pitch item", () => {
    const r = new ProcedureRunner(lib("c172.efato.en"), "training", "engine", 0);
    fly(
      r,
      0,
      12,
      (t) => ({ pitchDeg: t < 1 ? 7 : 1.5, iasKt: 74 - Math.min(6, t) }),
      { pitchDeg: 7, iasKt: 74, aglFt: 400, altFt: 900, engineRunning: false },
    );
    const res = r.result();
    const it = (id: string) => res.items.find((x) => x.id === id)!;
    expect(it("pitch").done && !it("pitch").late).toBe(true);
    expect(it("ias").done && it("ias").inOrder).toBe(true);
  });

  it("rough engine: only the GOOD magneto is credited", () => {
    const bad = (m: "L" | "R" | null, mags: Switches["magnetos"]) =>
      CHECKS.switch.evaluate(
        withSw({ magnetos: mags }, { sys: { badMag: m } as unknown as ProcSimView["sys"] }),
        { key: "magnetos", value: "GOOD" },
        ctx,
      );
    expect(bad("L", "L")).toBe(false);
    expect(bad("L", "R")).toBe(true);
    expect(bad("L", "BOTH")).toBe(false);
    expect(bad(null, "L")).toBe(true);
    expect(checkLabel({ id: "switch", p: { key: "magnetos", value: "GOOD" } }, "fr")).toMatch(/bonne magnéto/);
    expect(checkParamIssues({ id: "switch", p: { key: "magnetos", value: "GOOD" } }, "en")).toEqual([]);
    expect(lib("c172.roughEngine.en").items.find((x) => x.id === "mags")!.check!.p!.value).toBe("GOOD");
    // the student who tries the bad magneto first, then the good one: credited at the good one
    const r = new ProcedureRunner(lib("c172.roughEngine.en"), "training", "engineRough", 0);
    const sys = { badMag: "L" } as unknown as ProcSimView["sys"];
    fly(r, 0, 12, (t, cur) => ({ sw: { ...cur.sw, magnetos: t < 3 ? "BOTH" : t < 6 ? "L" : "R" } }), { sys });
    expect(r.result().items.find((x) => x.id === "mags")!.atS).toBe(6);
  });

  it("NAV1 and air-data failures have a procedure; the CDI check takes alternatives", () => {
    const s = new DrillSession({ mode: "training", lang: "fr" });
    expect(s.pick("nav1")!.id).toBe("c172.nav1.fr");
    expect(s.pick("airData")!.id).toBe("c172.airData.fr");
    expect(s.pick("battery")).toBeNull();
    const cdi = { id: "cdi" as const, p: { value: "NAV2|GPS" } };
    expect(CHECKS.cdi.evaluate(v({ cdi: "GPS" }), cdi.p, ctx)).toBe(true);
    expect(CHECKS.cdi.evaluate(v({ cdi: "NAV2" }), cdi.p, ctx)).toBe(true);
    expect(CHECKS.cdi.evaluate(v({ cdi: "NAV1" }), cdi.p, ctx)).toBe(false);
    expect(checkLabel(cdi, "fr")).toBe("Source CDI — NAV2 ou GPS");
    expect(checkParamIssues(cdi, "en")).toEqual([]);
  });

  it("order notes name the item that really should have come first (not a Done callout)", () => {
    const r = new ProcedureRunner(lib("c172.forcedLanding.en"), "training", "engine", 0);
    fly(r, 0, 30, (t, cur) => ({ iasKt: 68, sw: { ...cur.sw, mixture: t >= 5 ? 0 : 1 }, xpdr: t >= 8 ? "7700" : "7000" }), {
      engineRunning: false,
    });
    const res = r.result();
    expect(res.items.find((x) => x.id === "mixture")!.inOrder).toBe(false);
    const note = res.notes.find((n) => /follow the order/.test(n))!;
    expect(note).toBe("“Mixture — IDLE CUT-OFF” was done before “Transponder — 7700”: follow the order of the procedure.");
  });

  it("importing another club's version of a procedure this club customised replaces it, never a second override", () => {
    const mine = duplicateFromLibrary("c172.engineFire.en")!;
    const theirs: Procedure = {
      ...lib("c172.engineFire.en"),
      id: "club.feuMoteur.en",
      basedOn: "c172.engineFire.en",
      source: "club",
      title: "Engine fire — F-GXXX SOP",
      updated: "2999-01-01T00:00:00.000Z",
    };
    const pack = { format: "ifr-club-pack", version: 1, club: "Other club", procedures: [theirs] };
    const rep = importPack(JSON.stringify(pack), "newer");
    expect(rep.replaced).toEqual([mine.id]);
    const overrides = effectiveProcedures("en").filter((p) => p.basedOn === "c172.engineFire.en");
    expect(overrides.map((p) => p.title)).toEqual(["Engine fire — F-GXXX SOP"]);
    expect(effectiveProcedures("en").some((p) => p.id === "c172.engineFire.en")).toBe(false);
    // 'copy' keeps both on purpose
    importPack(JSON.stringify({ ...pack, procedures: [{ ...theirs, title: "Variant" }] }), "copy");
    expect(listClub().filter((p) => p.basedOn === "c172.engineFire.en").length).toBe(2);
  });
});
