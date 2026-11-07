import { describe, expect, it } from "vitest";
import { Sim } from "../src/sim/sim";
import { LessonRun } from "../src/train/engine";
import { MemoryDb } from "../src/lib/idb";
import { CourseStore, DB_NAME, STORES } from "../src/course/store";
import { createHandoff, handoffStatus } from "../src/course/handoff";
import {
  CourseBridge,
  courseLinkParams,
  type CockpitHost,
} from "../src/course/cockpitBridge";
import {
  BRIDGE_KEY,
  cockpitBridgeReady,
  legacyFlyLink,
  markCockpitBridge,
} from "../src/course/cockpitLink";
import {
  sampleCourse,
  VOR_ID,
  HOLDING_ID,
  MATHS_IFR_ID,
} from "../src/course/samples";
import { problemFor } from "../src/course/calc";
import { encodeScene, captureScene } from "../src/course/scene";
import type { Exercise } from "../src/train/engine";

const kvMap = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
async function store() {
  return CourseStore.open({
    db: new MemoryDb(DB_NAME, STORES),
    kv: kvMap(),
    channel: false,
    persist: async () => "granted",
  });
}
function host(sim = new Sim()) {
  const log: string[] = [];
  const runs: Exercise[] = [];
  const h: CockpitHost = {
    sim,
    lang: () => "en",
    cockpit: () => "g1000",
    toast: (t) => void log.push(t),
    runExercise: (ex) => void runs.push(ex),
    startLesson: (id) => void log.push(`lesson:${id}`),
    startScenario: (id) => void log.push(`scenario:${id}`),
  };
  return { h, log, runs, sim };
}

describe("cockpit link (player side)", () => {
  it("is off until the cockpit installs the bridge", () => {
    const kv = kvMap();
    expect(cockpitBridgeReady(kv)).toBe(false);
    markCockpitBridge(kv);
    expect(kv.getItem(BRIDGE_KEY)).toBe("1");
    expect(cockpitBridgeReady(kv)).toBe(true);
  });
  it("offers the existing deep links for lessons and scenarios only", () => {
    expect(legacyFlyLink({ kind: "lesson", exerciseId: "hold-wind" })).toBe(
      "index.html?lesson=hold-wind",
    );
    expect(
      legacyFlyLink({ kind: "scenario", scenarioId: "ils27-vtf", wx: "mins" }),
    ).toBe("index.html?scenario=ils27-vtf&wx=mins");
    expect(legacyFlyLink({ kind: "scene", scene: "x" })).toBeNull();
    expect(legacyFlyLink(undefined)).toBeNull();
  });
  it("reads only well-formed link parameters", () => {
    expect(courseLinkParams("?fly=abc")).toEqual({});
    const tok = "A".repeat(22);
    expect(
      courseLinkParams(`?fly=${tok}&capture=c1&return=https://evil.example/x`),
    ).toEqual({ fly: tok, capture: "c1" });
    expect(courseLinkParams("?scene=S1.abc-_").scene).toBe("S1.abc-_");
  });
});

describe("CourseBridge (cockpit side)", () => {
  it("flies a scene Fly it, then records the result and returns to the course step", async () => {
    const s = await store();
    const course = sampleCourse(VOR_ID)!;
    const step = course.steps.find((x) => x.flyIt?.target.kind === "scene")!;
    const hd = await createHandoff(s, { course, step, options: [] });
    const { h, runs } = host();
    const b = new CourseBridge(h, s, `?fly=${hd.token}`);
    expect(await b.startFlight()).toBe(true);
    expect(runs).toHaveLength(1);
    expect(b.exercise).not.toBeNull();
    // the compiled exercise runs unchanged in LessonRun
    const sim = new Sim();
    const run = new LessonRun(runs[0], sim);
    for (let t = 0; t < 5; t += 0.1) {
      sim.step(0.1);
      run.update(0.1);
    }
    const url = await b.finish({ passed: false, durationSec: 5 });
    expect(url).toContain(`#play=${course.id}`);
    expect(url).toContain(`s=${step.id}`);
    const st = await handoffStatus(s, hd.token, "local");
    expect(st.status).toBe("flown");
  });
  it("regenerates the solved numbers for a calc target", async () => {
    const s = await store();
    const course = sampleCourse(MATHS_IFR_ID)!;
    const step = course.steps.find((x) => x.flyIt?.target.kind === "calc")!;
    const calcStepId = (step.flyIt!.target as { step: string }).step;
    const calcStep = course.steps.find((x) => x.id === calcStepId)!;
    const p = problemFor(calcStep.calc!, 42);
    const hd = await createHandoff(s, {
      course,
      step,
      options: [],
      calc: { generatorId: p.generatorId, seed: p.seed, params: p.params },
    });
    const { h, runs } = host();
    const b = new CourseBridge(h, s, `?fly=${hd.token}`);
    expect(await b.startFlight()).toBe(true);
    expect(runs).toHaveLength(1);
  });
  it("opens a lesson target through the lesson briefing", async () => {
    const s = await store();
    const course = sampleCourse(HOLDING_ID)!;
    const step = course.steps.find((x) => x.flyIt?.target.kind === "lesson")!;
    const hd = await createHandoff(s, { course, step, options: [] });
    const { h, log } = host();
    const b = new CourseBridge(h, s, `?fly=${hd.token}`);
    expect(await b.startFlight()).toBe(true);
    expect(log).toContain("lesson:hold-wind");
  });
  it("says so when the token is unknown", async () => {
    const s = await store();
    const { h, log, runs } = host();
    const b = new CourseBridge(h, s, `?fly=${"B".repeat(22)}`);
    expect(await b.startFlight()).toBe(false);
    expect(runs).toHaveLength(0);
    expect(log[0]).toMatch(/expired/);
  });
  it("captures into the tray for the course being edited, and poses a ?scene= link", async () => {
    const s = await store();
    const { h, sim } = host();
    sim.step(0.1);
    const b = new CourseBridge(h, s, "?capture=my-course");
    expect(b.capturing).toBe(true);
    const item = await b.capture("ARD test");
    expect(item?.courseId).toBe("my-course");
    expect((await s.listTray("my-course")).length).toBe(1);
    const code = await encodeScene(captureScene(sim));
    const other = host();
    const b2 = new CourseBridge(other.h, s, `?scene=${code}`);
    const problems = await b2.openScene();
    expect(problems).toEqual([]);
  });
});
