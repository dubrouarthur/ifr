// The studio layouts whose « À vous » starts from its own situation (templates.ts PRACTICE_SCENES): nothing is met
// before the student acts, the exercise can be flown as the slide asks, and the checklist's intercept does not end
// on a bar that only crossed the centre.
import { describe, expect, it } from "vitest";
import type { Course, SlideCanvas, YourTurn } from "../src/course/types";
import { GoalTracker, lateralDots, stageView } from "../src/course/goals";
import { Sim } from "../src/sim/sim";
import { applyScene } from "../src/course/scene";
import { makeStep, PRACTICE_SCENES, practiceSceneOf } from "../src/course/ui/templates";

const blank = (): Course => ({
  format: "ifr-course",
  version: 1,
  id: "x",
  rev: 0,
  updated: "2026-11-17T10:00:00Z",
  title: { en: "New course", fr: "Nouveau cours" },
  author: { name: "Test" },
  langs: ["en", "fr"],
  cockpit: "g1000",
  world: { kind: "training" },
  steps: [],
  scenes: {},
  clips: {},
  assets: {},
});
function setup(layout: "checklist" | "yourTurn") {
  const r = makeStep(blank(), "slide", { layout });
  const slide = r.step.slide as SlideCanvas;
  const b = slide.blocks.find((x) => "yourTurn" in x && x.yourTurn) as { scene?: string; yourTurn: YourTurn };
  const sc = r.course.scenes[b.scene ?? ""];
  const sim = new Sim();
  applyScene(sim, sc);
  sim.updateAvionics(0);
  return { r, slide, b, sim, tracker: new GoalTracker(b.yourTurn.goal, "fr") };
}
/** fly `secs` (0.1 s steps), `pilot` acting before each step; stops when the goal is met */
function fly(s: ReturnType<typeof setup>, secs: number, pilot: (sim: Sim) => void = () => undefined) {
  let st = s.tracker.update(stageView(s.sim), 0);
  for (let t = 0; t < secs && !st.met; t += 0.1) {
    pilot(s.sim);
    s.sim.step(0.1);
    st = s.tracker.update(stageView(s.sim), 0.1);
  }
  return st;
}

describe("layouts with their own practice situation", () => {
  it("add that situation to the course and show it (slide, instrument and checklist)", () => {
    for (const layout of ["checklist", "yourTurn"] as const) {
      const id = practiceSceneOf(layout)!;
      expect(id).toBeTruthy();
      const { r, slide, b } = setup(layout);
      expect(r.course.scenes[id]).toBeTruthy();
      expect(slide.scene).toBe(id);
      expect(b.scene).toBe(id);
    }
    expect(Object.keys(PRACTICE_SCENES).length).toBe(2);
  });
  it("checklist: nothing is met hands off, nor in 3 minutes", () => {
    const s = setup("checklist");
    expect(s.tracker.update(stageView(s.sim), 0).rows.some((x) => x.now && x.check >= 0)).toBe(false);
    expect(fly(s, 180).met).toBe(false);
  });
  it("checklist: set 090, cut in on 120, roll out on 090 as the bar comes in: met, on 090 with the bar centred", () => {
    const s = setup("checklist");
    s.sim.av.obs1 = 90;
    s.sim.ap.hdgBug = 120;
    const st = fly(s, 240, (sim) => {
      const d = lateralDots(stageView(sim));
      if (d !== null && Math.abs(d) < 0.4) sim.ap.hdgBug = 90;
    });
    expect(st.met).toBe(true);
    expect(Math.abs(((s.sim.ac.data.hdgTrue - 90 + 540) % 360) - 180)).toBeLessThan(6);
    expect(Math.abs(lateralDots(stageView(s.sim)) ?? 9)).toBeLessThanOrEqual(0.5);
  });
  it("checklist: a bar that only crossed the centre on 120 does not end it (the roll-out is too late)", () => {
    const s = setup("checklist");
    s.sim.av.obs1 = 90;
    s.sim.ap.hdgBug = 120;
    let crossed = false;
    const st = fly(s, 240, (sim) => {
      const d = lateralDots(stageView(sim));
      if (d !== null && d < -1.2) crossed = true;
      if (crossed) sim.ap.hdgBug = 90;
    });
    expect(crossed).toBe(true);
    // on 090 now, parallel on the wrong side: the bar is out, so the hold never counts
    expect(st.met).toBe(false);
  });
  it("yourTurn: the bar stays on the stop hands off; the OBS on 120 centres it with TO (radial 300)", () => {
    const s = setup("yourTurn");
    expect(fly(s, 60).met).toBe(false);
    const t = setup("yourTurn");
    t.sim.av.obs1 = 120;
    expect(fly(t, 20).met).toBe(true);
  });
});
