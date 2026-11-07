// Procedures mode in flight (runner integration): a drill failure starts its expected procedure in the drill's
// mode; instructor / phone failures start theirs when "Grade procedures" is on; test vs training recording; the
// training records' CSV (one row per procedure); the instructor companion's snapshot and commands.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import { Sim, SCENARIOS } from "../src/sim/sim";
import { LessonRun } from "../src/train/engine";
import {
  circuitToExercise,
  newCircuit,
  type Circuit,
} from "../src/train/circuits";
import { buildDrill } from "../src/train/drills";
import type { ProcedureResult } from "../src/train/procedureTypes";
import {
  FAILURE_GROUPS,
  FAILURE_LABELS_EN,
  type FailureKey,
} from "../src/sim/systemsTypes";

const mem = new Map<string, string>();
const realFetch = globalThis.fetch;
beforeAll(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  globalThis.fetch = (async (u: string) => {
    const url = String(u);
    if (url.startsWith("/navdata/")) {
      const p = `public${url}`;
      if (!fs.existsSync(p)) return new Response("", { status: 404 });
      return new Response(fs.readFileSync(p), { status: 200 });
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const panel = () => import("../src/ui/procedurePanel");
const DT = 1 / 30;

/** fly a lesson with the controller wired as main.ts wires it */
async function drillRun(c: Circuit) {
  const { ProcedureController } = await panel();
  const sim = new Sim();
  const run = new LessonRun(circuitToExercise(c), sim);
  const ctrl = new ProcedureController({ sim, lesson: () => run });
  ctrl.reset();
  run.onDrillFailure = (k, e, m, ev) => void ctrl.onDrillFailure(k, e, m, ev);
  const fly = (sec: number, each?: () => boolean | void) => {
    for (let t = 0; t < sec; t += DT) {
      sim.step(DT);
      run.update(DT);
      ctrl.tick(DT);
      if (each?.()) return;
    }
  };
  return { sim, run, ctrl, fly };
}

const efato = (mode: "training" | "test") => {
  const c = buildDrill("d-efato", {
    airport: "PARD",
    phase: "climbout",
    lang: "en",
    mode,
  })!;
  c.failures = [
    {
      key: "engine",
      trigger: "altAgl",
      at: 650,
      dir: "climb",
      expect: "c172.efato",
    },
  ];
  return c;
};

describe("drill failure → procedure", () => {
  it("starts the drill's expected procedure, in training mode, with memory items first", async () => {
    const { ctrl, fly, sim } = await drillRun(efato("training"));
    expect(ctrl.runners()).toEqual([]);
    expect(ctrl.drillMode()).toBe("training");
    expect(ctrl.testFlight()).toBe(false);
    fly(60, () => ctrl.runners().length > 0);
    expect(sim.failures.engine).toBe(true);
    const r = ctrl.active()!;
    expect(r).toBeTruthy();
    expect(r.procedure.id).toMatch(/^c172\.efato/);
    expect(r.mode).toBe("training");
    expect(r.failure).toBe("engine");
    const st = ctrl.states()[0];
    expect(st.items[0].memory).toBe(true);
    expect(st.items.some((i) => i.due !== null)).toBe(true);
    // the failure was handled by the drill: the failure watcher does not start a second runner
    fly(2);
    expect(ctrl.runners().length).toBe(1);
  });

  it("training: memory items done before the checklist count as from memory; the checklist opening is recorded", async () => {
    const { ctrl, fly, sim } = await drillRun(efato("training"));
    fly(60, () => ctrl.runners().length > 0);
    const r = ctrl.active()!;
    // glide attitude at once (memory item 1), then the checklist
    sim.controls.throttle = 0;
    sim.controls.elevator = -0.35;
    fly(3);
    ctrl.openChecklist();
    expect(r.checklistOpen).toBe(true);
    fly(1);
    const res = r.result();
    expect(res.mode).toBe("training");
    expect(res.checklistOpenedS).not.toBeNull();
    expect(res.reactionS).not.toBeNull();
    const pitch = res.items.find((i) => i.id === "pitch")!;
    expect(pitch.done).toBe(true);
    expect(pitch.fromMemory).toBe(true);
  });

  it("test: the Checklist button is there before the failure; opening it is recorded on the procedure", async () => {
    const { ctrl, fly } = await drillRun(efato("test"));
    expect(ctrl.drillMode()).toBe("test");
    expect(ctrl.testFlight()).toBe(true);
    expect(ctrl.modeNow()).toBe("test");
    fly(60, () => ctrl.runners().length > 0);
    const r = ctrl.active()!;
    expect(r.mode).toBe("test");
    expect(r.checklistOpen).toBe(false);
    fly(2);
    ctrl.openQrh();
    expect(ctrl.qrhOpenedAt).not.toBeNull();
    // opening the index gives nothing away and costs nothing: the memory items stay hidden in it
    expect(r.checklistOpen).toBe(false);
    // picking the checklist that answers the failure is the diagnosis: recorded on the procedure
    ctrl.pickChecklist(r.procedure);
    expect(r.checklistOpen).toBe(true);
    fly(1);
    const res = r.result();
    expect(res.mode).toBe("test");
    expect(res.checklistOpenedS).toBeGreaterThan(1.5);
    // nobody confirmed a callout: a solo test
    expect(res.soloTest).toBe(true);
  });

  it("an instructor-triggered drill failure waits, then starts its procedure when fired", async () => {
    const c: Circuit = {
      ...newCircuit(),
      drill: { mode: "training" },
      start: {
        type: "air",
        fix: "ARD",
        bearing: 90,
        distNm: 12,
        altFt: 3000,
        hdg: null,
        iasKt: 95,
      },
      legs: [{ type: "fix", ident: "ARD", alt: 3000 }],
      failures: [{ key: "alternator", trigger: "instructor", at: 0 }],
    };
    const { ctrl, fly } = await drillRun(c);
    fly(3);
    expect(ctrl.runners()).toEqual([]);
    expect(ctrl.pendingDrill()).toEqual([{ index: 0, key: "alternator" }]);
    expect(ctrl.fireDrill(0)).toBe(true);
    fly(1);
    expect(ctrl.pendingDrill()).toEqual([]);
    expect(ctrl.active()?.failure).toBe("alternator");
  });
});

describe("instructor failures outside a drill", () => {
  const free = async () => {
    const { ProcedureController } = await panel();
    const sim = new Sim(SCENARIOS[1]);
    const ctrl = new ProcedureController({ sim, lesson: () => null });
    ctrl.reset();
    const fly = (sec: number) => {
      for (let t = 0; t < sec; t += DT) {
        sim.step(DT);
        ctrl.tick(DT);
      }
    };
    return { sim, ctrl, fly };
  };

  it("Grade procedures on: a fired failure starts its procedure in the instructor's mode", async () => {
    const { ctrl, fly, sim } = await free();
    ctrl.setGrade(true);
    ctrl.setFreeMode("training");
    ctrl.fire("alternator");
    expect(sim.failures.alternator).toBe(true);
    fly(1);
    expect(ctrl.runners().map((r) => [r.failure, r.mode])).toEqual([
      ["alternator", "training"],
    ]);
    // a failure set any other way (phone fallback, random failure) is caught by the watcher
    ctrl.setFreeMode("test");
    sim.setFailure("vacuum", true);
    fly(0.5);
    const vac = ctrl.runners().find((r) => r.failure === "vacuum");
    expect(vac?.mode).toBe("test");
  });

  it("Grade procedures off: nothing is graded unless the instructor names the expected procedure", async () => {
    const { ctrl, fly, sim } = await free();
    ctrl.setGrade(false);
    ctrl.fire("alternator");
    sim.setFailure("vacuum", true);
    fly(1);
    expect(ctrl.runners()).toEqual([]);
    const ch = ctrl.choices("engineFire");
    expect(ch.length).toBeGreaterThan(0);
    ctrl.fire("engineFire", ch[0].id);
    fly(0.5);
    expect(ctrl.active()?.procedure.id).toBe(ch[0].id);
  });

  it("failures already set when the flight starts are not emergencies; a restored failure can fire again", async () => {
    const { ctrl, fly, sim } = await free();
    ctrl.setGrade(true);
    sim.setFailure("gs", true);
    ctrl.reset();
    fly(1);
    expect(ctrl.runners()).toEqual([]);
    ctrl.fire("alternator");
    fly(0.5);
    sim.setFailure("alternator", false);
    fly(0.5);
    ctrl.fire("alternator");
    fly(0.5);
    expect(
      ctrl.runners().filter((r) => r.failure === "alternator").length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("the instructor confirms a callout item", async () => {
    const { ctrl, fly } = await free();
    ctrl.setGrade(true);
    // the electrical fire has callouts (vents closed, all switches OFF); the engine fire is all switches
    ctrl.fire("electricalFire");
    fly(0.5);
    const st = ctrl.states()[0];
    const callout = st.items.find((i) => i.manual && !i.done);
    expect(callout).toBeTruthy();
    expect(ctrl.confirm(callout!.id, "instructor", st.procedureId)).toBe(true);
    const res = ctrl.results()[0];
    expect(res.items.find((i) => i.id === callout!.id)).toMatchObject({
      done: true,
      by: "instructor",
    });
    ctrl.finish();
    expect(ctrl.active()?.finished).toBe(true);
  });
});

describe("instructor choices and the end of a flight", () => {
  it("'None: do not grade' fails the system without grading it, even with Grade procedures on", async () => {
    const { ProcedureController } = await panel();
    const sim = new Sim(SCENARIOS[1]);
    const ctrl = new ProcedureController({ sim, lesson: () => null });
    ctrl.reset();
    ctrl.setGrade(true);
    expect(ctrl.fire("alternator", "-")).toBeNull();
    for (let t = 0; t < 1; t += DT) {
      sim.step(DT);
      ctrl.tick(DT);
    }
    expect(sim.failures.alternator).toBe(true);
    expect(ctrl.runners()).toEqual([]);
  });

  it("a flight that ends on a crash between two grading updates is graded as crashed", async () => {
    const { ProcedureController } = await panel();
    const sim = new Sim(SCENARIOS[1]);
    const ctrl = new ProcedureController({ sim, lesson: () => null });
    ctrl.reset();
    ctrl.setGrade(true);
    ctrl.fire("engine");
    for (let t = 0; t < 1; t += DT) {
      sim.step(DT);
      ctrl.tick(DT);
    }
    expect(ctrl.active()?.finished).toBe(false);
    // the lesson ends at once (no further 10 Hz update): the last look at the aircraft still sees the crash
    sim.ac.s.crashed = "Hard impact (-2000 fpm)";
    ctrl.finish();
    const r = ctrl.results()[0];
    expect(r.outcome).toBe("crashed");
    expect(r.verdict).toBe("FAIL");
  });
});

describe("training records", () => {
  const res = (over: Partial<ProcedureResult> = {}): ProcedureResult => ({
    procedureId: "c172.alternator.en",
    title: "Alternator failure",
    failure: "alternator",
    failedAtS: 120,
    reactionS: 2.4,
    items: [
      {
        id: "a",
        done: true,
        atS: 3,
        inOrder: true,
        late: false,
        fromMemory: true,
        text: "Master ALT — OFF",
        memory: true,
      },
      {
        id: "b",
        done: true,
        atS: 30,
        inOrder: false,
        late: true,
        fromMemory: true,
        text: "Avionics — OFF",
        lateByS: 6,
      },
      {
        id: "c",
        done: false,
        atS: null,
        inOrder: true,
        late: false,
        fromMemory: true,
        text: "Land as soon as practical",
      },
      {
        id: "d",
        done: false,
        atS: null,
        inOrder: true,
        late: false,
        fromMemory: true,
        text: "Landing light — OFF",
        optional: true,
      },
    ],
    path: { iasBandPct: null, maxBankDeg: 12, altLostFt: 40 },
    outcome: "incomplete",
    score: 64,
    verdict: "FAIL",
    notes: [
      "“Land as soon as practical” was missed.",
      "Avionics was late by 6 s.",
    ],
    lang: "en",
    mode: "test",
    checklistOpenedS: 14,
    ...over,
  });

  it("CSV: one row per procedure, the flight's columns repeated; flights without procedures keep one row", async () => {
    const { history } = await import("../src/ui/history");
    const base = {
      date: "2026-11-04T10:00:00Z",
      student: "Lea",
      scenario: "Drill",
      approach: "",
      mode: "training" as const,
      score: 70,
      grade: "C",
      acs: "PASS",
      failedTasks: [],
      failures: ["Alternator failure"],
      durationSec: 900,
    };
    const csv = history.csv([
      {
        ...base,
        id: "1",
        procedures: [
          res(),
          res({
            title: "Vacuum failure",
            failure: "vacuum",
            verdict: "PASS",
            score: 91,
            notes: ["Well flown."],
          }),
        ],
      },
      { ...base, id: "2", student: "Tom" },
    ]);
    const lines = csv.split("\n");
    expect(lines.length).toBe(4);
    const head = lines[0].split(",");
    for (const k of [
      "procedure",
      "procedure_verdict",
      "procedure_score",
      "reaction_s",
      "late_items",
      "missed_items",
      "out_of_order_items",
      "checklist_opened_s",
    ])
      expect(head).toContain(k);
    const cells = (l: string) =>
      [...l.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"'));
    const r1 = cells(lines[1]);
    const col = (k: string) => head.indexOf(k);
    expect(r1[col("student")]).toBe("Lea");
    expect(r1[col("procedure")]).toBe("Alternator failure");
    expect(r1[col("procedure_mode")]).toBe("test");
    expect(r1[col("procedure_verdict")]).toBe("FAIL");
    expect(r1[col("late_items")]).toBe("Avionics — OFF");
    expect(r1[col("missed_items")]).toBe("Land as soon as practical"); // the optional item is not 'missed'
    expect(r1[col("out_of_order_items")]).toBe("Avionics — OFF");
    expect(r1[col("reaction_s")]).toBe("2.4");
    expect(r1[col("first_note")]).toMatch(/missed/);
    expect(cells(lines[2])[col("procedure")]).toBe("Vacuum failure");
    const r3 = cells(lines[3]);
    expect(r3[col("student")]).toBe("Tom");
    expect(r3[col("procedure")]).toBe("");
    expect(r3.length).toBe(head.length);
  });

  it("the flight record carries the procedures graded during the flight", async () => {
    const { flightProcedures, flightRecord } = await import("../src/ui/modals");
    const sim = new Sim(SCENARIOS[1]);
    flightProcedures.results = () => [res()];
    const a = flightRecord(sim);
    expect(a.procedures?.map((p) => p.title)).toEqual(["Alternator failure"]);
    flightProcedures.results = () => [];
    expect(flightRecord(sim).procedures).toBeUndefined();
  });

  it("an exercise ended early goes to the records (and the school webhook) as not graded, with no score", async () => {
    const { flightRecord } = await import("../src/ui/modals");
    const sim = new Sim(SCENARIOS[1]);
    sim.rec.lesson = { id: "app-loc", title: "LOC RWY 27" };
    const a = flightRecord(sim);
    expect(a.graded).toBe(false);
    expect(a.score).toBe(0);
    expect(a.grade).toBe("—");
    sim.rec.lesson = { id: "app-loc", title: "LOC RWY 27", score: 82, passed: true };
    const b = flightRecord(sim);
    expect(b.graded).toBe(true);
    expect(b.score).toBe(82);
  });
});

describe("instructor companion (remote)", () => {
  it("the snapshot's procedure state is live, compact and JSON-safe", async () => {
    const { ProcedureController, remoteProcStates } = await panel();
    const sim = new Sim(SCENARIOS[1]);
    const ctrl = new ProcedureController({ sim, lesson: () => null });
    ctrl.reset();
    ctrl.setGrade(true);
    ctrl.setFreeMode("training");
    ctrl.fire("electricalFire");
    for (let t = 0; t < 2; t += DT) {
      sim.step(DT);
      ctrl.tick(DT);
    }
    const rs = remoteProcStates(ctrl.states());
    expect(rs.length).toBe(1);
    expect(rs[0]).toMatchObject({
      failure: "electricalFire",
      mode: "training",
      finished: false,
    });
    expect(rs[0].elapsedS).toBeGreaterThan(1);
    expect(rs[0].items.length).toBeGreaterThan(2);
    expect(rs[0].items.some((i) => i.manual)).toBe(true);
    expect(JSON.parse(JSON.stringify(rs))).toEqual(rs);
    // what the phone shows changes with what the student does
    sim.setSwitch("stbyBatt", false);
    for (let t = 0; t < 1; t += DT) {
      sim.step(DT);
      ctrl.tick(DT);
    }
    const done = remoteProcStates(ctrl.states())[0].items.filter(
      (i) => i.done,
    ).length;
    expect(done).toBeGreaterThan(rs[0].items.filter((i) => i.done).length);
  });

  it("protocol 2: every failure, grouped; procedure commands validated", async () => {
    const rt = await import("../src/connect/remoteTypes");
    expect(rt.PROTOCOL).toBe(2);
    const all = Object.keys(FAILURE_LABELS_EN) as FailureKey[];
    expect([...rt.FAILURE_KEYS].sort()).toEqual([...all].sort());
    expect(rt.FAILURE_KEYS).toEqual(FAILURE_GROUPS.flatMap((g) => g.keys));
    for (const k of all) {
      expect(rt.failureText(k, "en").name).toBeTruthy();
      expect(rt.failureText(k, "fr").sub).toBeTruthy();
    }
    expect(
      rt.validateCommand({
        type: "failure",
        key: "vacuum",
        on: true,
        expect: "c172.vacuum.fr",
      }),
    ).toEqual({
      type: "failure",
      key: "vacuum",
      on: true,
      expect: "c172.vacuum.fr",
    });
    expect(
      rt.validateCommand({
        type: "failure",
        key: "vacuum",
        on: true,
        expect: "<script>",
      }),
    ).toBeNull();
    expect(
      rt.validateCommand({ type: "failure", key: "nope", on: true }),
    ).toBeNull();
    expect(
      rt.validateCommand({
        type: "procConfirm",
        procedureId: "c172.engineFire.en",
        itemId: "i3",
      }),
    ).toEqual({
      type: "procConfirm",
      procedureId: "c172.engineFire.en",
      itemId: "i3",
    });
    expect(
      rt.validateCommand({ type: "procConfirm", procedureId: "x" }),
    ).toBeNull();
    expect(rt.validateCommand({ type: "drillFire", index: 1 })).toEqual({
      type: "drillFire",
      index: 1,
    });
    expect(rt.validateCommand({ type: "drillFire", index: -1 })).toBeNull();
    expect(
      rt.validateCommand({ type: "gradeProcedures", on: true, mode: "test" }),
    ).toEqual({ type: "gradeProcedures", on: true, mode: "test" });
    expect(
      rt.validateCommand({ type: "gradeProcedures", on: true, mode: "exam" }),
    ).toBeNull();
    expect(
      rt.describeCommand({ type: "failure", key: "alternator", on: true }),
    ).toBe("Alternator failure failed");
  });

  it("the simulator alone refuses the procedure commands (they need the shell)", async () => {
    const { applyCommand } = await import("../src/connect/remoteLink");
    const sim = new Sim(SCENARIOS[1]);
    expect(applyCommand(sim, { type: "drillFire", index: 0 })).toBe(false);
    expect(
      applyCommand(sim, {
        type: "failure",
        key: "comms",
        on: true,
        expect: "c172.lostComms.en",
      }),
    ).toBe(true);
    expect(sim.failures.comms).toBe(true);
  });
});
